'use strict';

// Mammoth is an independent DOCX-to-HTML implementation. It is deliberately a
// dev-only oracle: the product parser remains the small, fail-closed OOXML
// reader on the privacy boundary. This comparison covers main-body and nested
// table text. Mammoth ignores modern wps text boxes: the outer-run differential
// below explicitly records that limit instead of treating missing oracle text
// as permission to drop it from the product parser.
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { createSuite, assertPresent } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { readZip } = require('../plugins/data-secure/server/zip-reader');

const { testAsync, done, assert } = createSuite('DOCX differential oracle');
const root = path.join(__dirname, '..');

function xml(value) {
  return String(value)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function run(text) {
  return `<w:p><w:r><w:t>${xml(text)}</w:t></w:r></w:p>`;
}

function docx(body, rows) {
  const table = `<w:tbl>${rows.map((row) => `<w:tr>${row.map((cell) =>
    `<w:tc>${run(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  return rawDocx(body.map(run).join('') + table);
}

function rawDocx(body) {
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}<w:sectPr/></w:body></w:document>`]
  ]);
}

function orderedOnce(text, tokens, label) {
  let previous = -1;
  for (const token of tokens) {
    const position = text.indexOf(token);
    assert.ok(position > previous, `${label}: missing or reordered token ${token}`);
    assert.strictEqual(text.indexOf(token, position + token.length), -1, `${label}: duplicated token ${token}`);
    previous = position;
  }
}

async function verifyNestedTables() {
  for (let index = 0; index < 24; index++) {
    const expected = [`CASE_${index}_START_`, `CASE_${index}_CORE_`];
    let table = `<w:tbl><w:tr><w:tc>${run(expected[1])}</w:tc></w:tr></w:tbl>`;
    for (let depth = 0; depth < 1 + index % 6; depth++) {
      const before = `CASE_${index}_DEPTH_${depth}_BEFORE_`;
      const after = `CASE_${index}_DEPTH_${depth}_AFTER_`;
      const neighbor = `CASE_${index}_DEPTH_${depth}_NEIGHBOR_`;
      const nextRow = `CASE_${index}_DEPTH_${depth}_NEXT_ROW_`;
      expected.splice(1, 0, before);
      expected.push(after, neighbor, nextRow);
      table = `<w:tbl><w:tr><w:tc>${run(before)}${table}${run(after)}</w:tc><w:tc>${run(neighbor)}</w:tc></w:tr><w:tr><w:tc>${run(nextRow)}</w:tc></w:tr></w:tbl>`;
    }
    expected.push(`CASE_${index}_END_`);
    const buffer = rawDocx(run(expected[0]) + table + run(expected[expected.length - 1]));
    const local = parseOoxml(buffer, '.docx');
    const oracle = await mammoth.extractRawText({ buffer });
    assert.deepStrictEqual(local.warnings, [], `local nested-table case ${index}`);
    assert.deepStrictEqual(oracle.messages, [], `Mammoth nested-table case ${index}`);
    orderedOnce(local.markdown, expected, 'local nested tables');
    orderedOnce(oracle.value, expected, 'Mammoth nested tables');
  }
}

async function verifyOuterTextboxRuns() {
  for (let index = 0; index < 16; index++) {
    const tokens = [`OUTER_${index}_BEFORE_`, `BOX_${index}_CONTENT_`, `OUTER_${index}_AFTER_`];
    const buffer = rawDocx(`<w:p><w:r><w:t>${tokens[0]}</w:t></w:r><w:r><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${run(tokens[1])}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r><w:r><w:t>${tokens[2]}</w:t></w:r></w:p>`);
    const local = parseOoxml(buffer, '.docx');
    const oracle = await mammoth.extractRawText({ buffer });
    assert.deepStrictEqual(local.warnings, []);
    orderedOnce(local.markdown, tokens, 'local outer and inner text');
    orderedOnce(oracle.value, [tokens[0], tokens[2]], 'Mammoth outer runs');
    // This is a documented oracle limitation, not a product success criterion.
    assert.strictEqual(oracle.messages.length, 1);
    assert.match(oracle.messages[0].message, /unrecognised element.*wordprocessingShape.*wsp/);
    assert.ok(!oracle.value.includes(tokens[1]));
  }
}

async function verifyPinnedOracle() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.strictEqual(manifest.dependencies, undefined, 'no production dependencies are allowed');
  assert.strictEqual(manifest.devDependencies?.mammoth, '1.12.1');
  const oracle = lock.packages?.['node_modules/mammoth'];
  assert.deepStrictEqual(oracle && {
    version: oracle.version, license: oracle.license, dev: oracle.dev,
    integrity: oracle.integrity
  }, {
    version: '1.12.1', license: 'BSD-2-Clause', dev: true,
    integrity: 'sha512-nCH9KKjWi3jQ+i8bUKs7k1yrXtSEGpWgF8IYkzsFMcbn+5S6l4bZEBbyx2hOQErFiXPuAs9RPa6qjXVxhyx/8g=='
  });
}

async function verifyRealWordComments() {
  // The pinned Mammoth distribution includes this actual Word-produced DOCX;
  // keep its package untouched instead of rebuilding only convenient XML.
  const buffer = fs.readFileSync(path.join(root, 'node_modules/mammoth/test/test-data/comments.docx'));
  const entries = readZip(buffer);
  assert.match(entries.get('docProps/app.xml').toString('utf8'), /Microsoft Office Word/u);
  const local = parseOoxml(buffer, '.docx');
  const oracle = await mammoth.convertToHtml({ buffer }, { styleMap: 'comment-reference => sup' });
  orderedOnce(local.markdown, ['Ouch', 'A tachyon walks into a bar.', 'Fin.'], 'actual Word comment stories');
  orderedOnce(oracle.value, ['Ouch', 'A tachyon walks into a bar.', 'Fin.'], 'Mammoth comment stories');
  assert.deepStrictEqual(oracle.messages, []);
  // Author/initial metadata remains outside proven privacy coverage. Matching
  // story text is no justification for upgrading this real package to complete.
  assert.ok(local.warnings.length > 0);
  assert.doesNotMatch(local.warnings.join(' '), /Michael|Williamson|tachyon|comments\.xml/u);
}

async function verifyBodyAndTables() {
  const vocabulary = [
    'Architekturentscheidung', 'ITIL 4', 'Scrum Master', 'HL7 FHIR',
    'Zertifizierung', 'Testautomatisierung', 'Product Owner', 'Datenmodell',
    'Klinische Schnittstelle', 'Kanban', 'ISO 27001', 'Anforderungsanalyse'
  ];
  // 96 deterministic documents exercise multiple ordinary body paragraphs and
  // two table rows.  This remains deliberately below Word-story/formatting
  // claims: Mammoth is only an independent parser oracle for plain text.
  for (let index = 0; index < 96; index++) {
    const expected = [
      `${vocabulary[index % vocabulary.length]} ${index + 1}`,
      `Projekt ${index + 1}: ${vocabulary[(index + 5) % vocabulary.length]}`,
      `${vocabulary[(index + 3) % vocabulary.length]} Tabelle ${index + 1}`,
      `${vocabulary[(index + 7) % vocabulary.length]} Wert ${index + 1}`,
      `Prüfung ${index + 1}: ${vocabulary[(index + 9) % vocabulary.length]}`,
      `Status ${index + 1}: freigegeben`
    ];
    const buffer = docx([expected[0], expected[1]], [
      [expected[2], expected[3]],
      [expected[4], expected[5]]
    ]);
    const local = parseOoxml(buffer, '.docx');
    assert.deepStrictEqual(local.warnings, [], `local parser warning in case ${index}`);
    const converted = await mammoth.convertToHtml({ buffer });
    assert.deepStrictEqual(converted.messages, [], `Mammoth warning in case ${index}`);
    for (const token of expected) {
      assertPresent(local.markdown, token, `local DOCX token ${index}`);
      assertPresent(converted.value, token, `Mammoth DOCX token ${index}`);
    }
  }
}

(async () => {
  await testAsync('Mammoth is exactly pinned as a BSD-2-Clause dev-only oracle', verifyPinnedOracle);
  await testAsync('our DOCX main-body and table tokens agree with Mammoth for 96 documents', verifyBodyAndTables);
  await testAsync('24 nested-table documents agree with Mammoth on order and exactly-once text coverage', verifyNestedTables);
  await testAsync('16 textbox documents retain outer runs like Mammoth plus independently verified inner text', verifyOuterTextboxRuns);
  await testAsync('an actual Word comment package agrees with the configured oracle without claiming complete privacy coverage', verifyRealWordComments);
  done();
})();
