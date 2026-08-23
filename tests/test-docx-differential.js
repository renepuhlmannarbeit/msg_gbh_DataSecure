'use strict';

// Mammoth is an independent DOCX-to-HTML implementation. It is deliberately a
// dev-only oracle: the product parser remains the small, fail-closed OOXML
// reader on the privacy boundary. This comparison covers ordinary main-body and
// table text only; it does not claim coverage for Word stories Mammoth handles
// differently.
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { createSuite, assertPresent } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');

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
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.map(run).join('')}${table}<w:sectPr/></w:body></w:document>`]
  ]);
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

async function verifyBodyAndTables() {
  const vocabulary = [
    'Architekturentscheidung', 'ITIL 4', 'Scrum Master', 'HL7 FHIR',
    'Zertifizierung', 'Testautomatisierung', 'Product Owner', 'Datenmodell',
    'Klinische Schnittstelle', 'Kanban', 'ISO 27001', 'Anforderungsanalyse'
  ];
  for (let index = 0; index < 24; index++) {
    const expected = [
      `${vocabulary[index % vocabulary.length]} ${index + 1}`,
      `${vocabulary[(index + 3) % vocabulary.length]} Tabelle ${index + 1}`,
      `${vocabulary[(index + 7) % vocabulary.length]} Wert ${index + 1}`
    ];
    const buffer = docx([expected[0]], [[expected[1], expected[2]]]);
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
  await testAsync('our DOCX main-body and table tokens agree with Mammoth for 24 documents', verifyBodyAndTables);
  done();
})();
