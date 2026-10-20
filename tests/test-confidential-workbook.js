'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { createSuite } = require('./helpers');
const { readZip, inspectZipDirectory } = require('../plugins/data-secure/server/zip-reader');
const { readXml } = require('../plugins/data-secure/server/xml-reader');
const overviewModule = require('../plugins/data-secure/server/standalone/confidential-overview');
const api = require('../plugins/data-secure/server/standalone/confidential-workbook');
const { renderConfidentialWorkbook, MAX_WORKBOOK_BYTES, MAX_WORKBOOK_EXPANDED_BYTES } = api;
const { test, done, assert } = createSuite('Confidential workbook: actual OOXML, bound text and lossless long values');
const sourcePath = path.join(__dirname, '../plugins/data-secure/server/standalone/confidential-workbook.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(originals = ['Anna Beispiel']) {
  return { schema: 'datasecure-confidential-overview/1', batch_id: 'a'.repeat(64), confidential: true,
    ai_upload_allowed: false, documents: [{ document_id: 'b'.repeat(32), name: 'EINGABEN/Beispiel.txt', revision: 2,
      output_sha256: 'c'.repeat(64), trace_available: true,
      entries: [{ replacement: '[PERSON_ABC]', kind: 'PERSON', originals, occurrences: Math.max(1, originals.length) }],
      excluded: { kept: 2, masked: 3, not_identity: 4, ambiguous: 5 } }] };
}
function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/gu, escaped => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[escaped]);
}
function parseXml(buffer, callbacks = {}) {
  return readXml(buffer.toString('utf8'), { decode: decodeXml, error: () => Error('TEST_XML_INVALID'), ...callbacks });
}
function cellText(xml, sheetName) {
  const cells = new Map();
  let cell = null, content = '', type = null;
  parseXml(xml, {
    start(node) {
      if (node.namespaceURI === SS && node.localName === 'c') {
        type = node.attributes.get('{}t');
        assert.ok(['inlineStr', 'n'].includes(type));
        cell = node.attributes.get('{}r'); content = '';
        if (type === 'n') {
          assert.equal(sheetName, 'Zuordnungen');
          assert.match(cell, /^D[0-9]+$/u); assert.ok(Number(cell.slice(1)) > 1);
          assert.equal(node.attributes.get('{}s'), '2');
        }
      }
      if (node.namespaceURI === SS) {
        assert.ok(!['f', 'hyperlink', 'externalLink', 'oleObject'].includes(node.localName));
        if (node.localName === 'v') assert.equal(type, 'n');
        if (node.localName === 't') assert.equal(type, 'inlineStr');
      }
    },
    text(value, node) { if (node.namespaceURI === SS && node.localName === (type === 'n' ? 'v' : 't')) content += value; },
    end(node) {
      if (node.namespaceURI === SS && node.localName === 'c') {
        // Independent, one-pass ST_Xstring decoding. Decoding repeatedly would
        // destroy a protected literal such as the source text "_x000A_".
        if (type === 'n') {
          assert.match(content, /^[1-9][0-9]*$/u);
          assert.ok(Number.isSafeInteger(Number(content)) && Number(content) <= 100000);
          cells.set(cell, Number(content));
        } else cells.set(cell, content.replace(/_x([0-9a-f]{4})_/giu, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
        cell = null; type = null;
      }
    }
  });
  return cells;
}
function unpack(buffer) {
  assert.ok(Buffer.isBuffer(buffer)); assert.ok(buffer.length <= MAX_WORKBOOK_BYTES);
  const entries = readZip(buffer, { maxEntries: 208, maxUncompressed: MAX_WORKBOOK_EXPANDED_BYTES });
  const sheets = [], relationships = [];
  for (const [name, bytes] of entries) { assert.ok(name.endsWith('.xml') || name.endsWith('.rels')); parseXml(bytes); }
  parseXml(entries.get('xl/workbook.xml'), { start(node) {
    if (node.namespaceURI === SS && node.localName === 'sheet') sheets.push({
      name: node.attributes.get('{}name'), id: node.attributes.get('{}sheetId'), relationship: node.attributes.get(`{${REL}}id`) });
  } });
  parseXml(entries.get('xl/_rels/workbook.xml.rels'), { start(node) {
    if (node.namespaceURI === PKG && node.localName === 'Relationship') {
      assert.equal(node.attributes.has('{}TargetMode'), false);
      relationships.push({ id: node.attributes.get('{}Id'), type: node.attributes.get('{}Type'), target: node.attributes.get('{}Target') });
    }
  } });
  const contents = new Map();
  for (const sheet of sheets) {
    const relationship = relationships.find(item => item.id === sheet.relationship);
    assert.equal(relationship.type, `${REL}/worksheet`);
    assert.ok(/^worksheets\/sheet[0-9]+\.xml$/u.test(relationship.target));
    contents.set(sheet.name, cellText(entries.get(`xl/${relationship.target}`), sheet.name));
  }
  return { entries, sheets, contents, relationships };
}
function rows(cells, width = 3) {
  assert.ok([3, 5].includes(width));
  const output = [];
  for (let row = 1; cells.has(`A${row}`); row++) output.push(Array.from({ length: width }, (_, column) => cells.get(`${String.fromCharCode(65 + column)}${row}`)));
  assert.equal(cells.size, output.length * width);
  return output;
}
function reconstructLong(workbook, sheet = 'Dokument_001', cell = 'B2') {
  const records = rows(workbook.contents.get('Langwerte')).slice(1).map(([reference, chunk, binding]) => ({ reference, chunk, binding: JSON.parse(binding) }));
  const matching = records.filter(item => item.binding.source_sheet === sheet && item.binding.source_cell === cell);
  assert.ok(matching.length);
  const binding = matching[0].binding;
  assert.equal(matching.length, binding.parts);
  for (let index = 0; index < matching.length; index++) {
    assert.deepEqual(matching[index].binding, binding);
    assert.equal(matching[index].reference, `${binding.id}/${index + 1}/${binding.parts}`);
    assert.ok(matching[index].chunk.length <= 32767);
    assert.ok((matching[index].chunk.match(/\n/gu) || []).length <= 253);
    assert.ok(matching[index].chunk.isWellFormed());
  }
  const value = matching.map(item => item.chunk).join('');
  assert.equal(value.length, binding.total_utf16); assert.equal(sha(value), binding.sha256);
  assert.equal(workbook.contents.get(sheet).get(cell), `[LANGWERT ${binding.id}: Langwerte; Teile=${binding.parts}; SHA-256=${binding.sha256}]`);
  return value;
}
function txtMappingRows(value) {
  const result = []; let filename;
  for (const line of overviewModule.renderConfidentialOverview(value).split('\n')) {
    if (line.startsWith('Datei: ')) filename = JSON.parse(line.slice(7));
    const mapping = /^(\[[A-Z0-9_]+\]) · (PERSON|ORGANIZATION|PROJECT) · ([1-9][0-9]*) Vorkommen → (.*)$/u.exec(line);
    if (!mapping) continue;
    const quoted = mapping[4].match(/"(?:[^"\\]|\\.)*"/gu);
    assert.ok(quoted && quoted.length); assert.equal(quoted.join(' / '), mapping[4]);
    result.push([mapping[1], mapping[2], quoted.length === 1 ? JSON.parse(quoted[0]) : mapping[4], Number(mapping[3]), filename]);
  }
  return result;
}
test('minimal real OOXML ZIP has closed internal relationships and exactly one document sheet', () => {
  const workbook = unpack(renderConfidentialWorkbook(fixture()));
  assert.deepEqual(workbook.sheets.map(item => item.name), ['Zuordnungen', 'Übersicht', 'Dokument_001']);
  assert.deepEqual(workbook.sheets.map(item => item.id), ['1', '2', '3']);
  assert.equal(workbook.entries.size, 8);
  assert.deepEqual(rows(workbook.contents.get('Zuordnungen'), 5), [
    ['Pseudonym', 'Typ', 'Originalwert(e)', 'Vorkommen', 'Datei'],
    ['[PERSON_ABC]', 'PERSON', 'Anna Beispiel', 1, 'EINGABEN/Beispiel.txt']]);
  assert.deepEqual(rows(workbook.contents.get('Dokument_001')), [['Typ', 'Basiswert', 'Endwert'], ['Person', 'Anna Beispiel', '[PERSON_ABC]']]);
  for (const key of ['[Content_Types].xml', '_rels/.rels', 'xl/styles.xml']) assert.ok(workbook.entries.has(key));
});
test('twelve person/company mappings have exactly the TXT types, counts, originals and order on the first sheet', () => {
  const value = fixture(), people = ['Anna Beispiel', 'Bernd Muster', 'Clara Probe', 'David Test', 'Eva Demo', 'Felix Beispiel'];
  const companies = ['Muster GmbH', 'Nordlicht AG', 'Beispiel KG', 'Testwerke SE', 'Probe OHG', 'Demo GmbH'];
  value.documents[0].entries = people.map((name, index) => ({ replacement: `[PERSON_${String(index + 1).padStart(3, '0')}]`,
    kind: 'PERSON', originals: [name], occurrences: 1 })).concat(companies.map((name, index) => ({
    replacement: `[UNTERNEHMEN_${String(index + 1).padStart(3, '0')}]`, kind: 'ORGANIZATION', originals: [name], occurrences: 1 })));
  const workbook = unpack(renderConfidentialWorkbook(value)), actual = rows(workbook.contents.get('Zuordnungen'), 5).slice(1);
  assert.equal(workbook.sheets[0].name, 'Zuordnungen'); assert.equal(actual.length, 12);
  assert.deepEqual(actual, txtMappingRows(value));
  assert.deepEqual(actual.map(row => row[2]), [...people, ...companies]);
  assert.deepEqual(actual.map(row => row[1]), [...Array(6).fill('PERSON'), ...Array(6).fill('ORGANIZATION')]);
  assert.equal(actual.reduce((sum, row) => sum + row[3], 0), 12);
});
test('one entry with multiple variants has one numeric total, never a count copied onto each variant', () => {
  const value = fixture(['Anna Beispiel', 'Anna-Beispiel', 'Frau Beispiel']); value.documents[0].entries[0].occurrences = 7;
  const workbook = unpack(renderConfidentialWorkbook(value)), actual = rows(workbook.contents.get('Zuordnungen'), 5).slice(1);
  assert.deepEqual(actual, txtMappingRows(value)); assert.equal(actual.length, 1);
  assert.equal(actual[0][2], '"Anna Beispiel" / "Anna-Beispiel" / "Frau Beispiel"');
  assert.equal(actual[0][3], 7); assert.equal(typeof actual[0][3], 'number');
  assert.equal(rows(workbook.contents.get('Dokument_001')).length, 4);
  const xml = workbook.entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.equal((xml.match(/ t="n"/gu) || []).length, 1); assert.ok(xml.includes('<c r="D2" s="2" t="n"><v>7</v></c>'));
  const styles = []; let cellFormats = false;
  parseXml(workbook.entries.get('xl/styles.xml'), { start(node) {
    if (node.namespaceURI !== SS) return;
    if (node.localName === 'cellXfs') { assert.equal(node.attributes.get('{}count'), '3'); cellFormats = true; }
    if (cellFormats && node.localName === 'xf') styles.push(node.attributes.get('{}numFmtId'));
  }, end(node) { if (node.namespaceURI === SS && node.localName === 'cellXfs') cellFormats = false; } });
  assert.deepEqual(styles, ['49', '49', '0']);
});
test('single originals are raw text while multiple quoted variants retain slash, quotes, controls and Unicode exactly like TXT', () => {
  const variants = ['A / B', 'Zitat "C"', 'Backslash\\', 'Jörg', 'Jo\u0308rg', 'CF\u200d', 'line\nnext', '_x000A_', '_x005F_x0000_', '=SUM(1)'];
  const value = fixture(variants), workbook = unpack(renderConfidentialWorkbook(value));
  const actual = rows(workbook.contents.get('Zuordnungen'), 5).slice(1);
  assert.deepEqual(actual, txtMappingRows(value)); assert.equal(actual[0][3], variants.length);
  assert.deepEqual(actual[0][2].match(/"(?:[^"\\]|\\.)*"/gu).map(item => JSON.parse(item)), variants);
  const single = rows(unpack(renderConfidentialWorkbook(fixture(['001234']))).contents.get('Zuordnungen'), 5)[1];
  assert.equal(single[2], '001234'); assert.equal(typeof single[2], 'string'); assert.equal(single[3], 1);
});
test('the maximum validated occurrence count is an exact numeric cell without formulas', () => {
  const value = fixture(); value.documents[0].entries[0].occurrences = 100000;
  value.documents[0].excluded = { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 };
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(workbook.contents.get('Zuordnungen').get('D2'), 100000);
  assert.ok(workbook.entries.get('xl/worksheets/sheet1.xml').toString('utf8').includes('<v>100000</v>'));
  assert.equal([...workbook.entries.values()].some(bytes => /<(?:\w+:)?f(?:\s|>)/u.test(bytes.toString('utf8'))), false);
});
test('long combined originals on the first sheet have their own lossless cell-bound reference', () => {
  const value = fixture(['x'.repeat(20000), 'y'.repeat(20000)]), workbook = unpack(renderConfidentialWorkbook(value));
  const expected = txtMappingRows(value)[0][2];
  assert.equal(reconstructLong(workbook, 'Zuordnungen', 'C2'), expected);
  assert.equal(workbook.contents.get('Zuordnungen').get('D2'), 2);
  assert.equal(workbook.contents.get('Dokument_001').get('B2'), value.documents[0].entries[0].originals[0]);
  assert.equal(workbook.contents.get('Dokument_001').get('B3'), value.documents[0].entries[0].originals[1]);
  assert.equal(new Set(rows(workbook.contents.get('Langwerte')).slice(1).map(row => JSON.parse(row[2]).source_sheet)).size, 1);
});
test('metadata is contextual and bound to the exact batch/revision/hash and exclusion counts', () => {
  const value = fixture(), overview = rows(unpack(renderConfidentialWorkbook(value)).contents.get('Übersicht'));
  assert.ok(overview.some(row => row[0] === 'Lauf' && row[1] === value.batch_id));
  assert.ok(overview.some(row => row[0] === 'Standbindung SHA-256' && row[1] === sha(JSON.stringify(value))));
  for (const scalar of [value.documents[0].name, value.documents[0].document_id, value.documents[0].output_sha256]) assert.ok(overview.some(row => row[1] === scalar));
  assert.ok(overview.some(row => row[0].endsWith('Revision') && row[1] === '2'));
  assert.deepEqual(overview.filter(row => row[0].endsWith('ausgeschlossen')).map(row => [row[1], row[2]]), [['2', 'beibehalten'], ['3', 'zusätzlich maskiert'], ['4', 'keine Identität'], ['5', 'mehrdeutig']]);
  assert.ok(overview.some(row => row[1] === 'NICHT AN KI WEITERGEBEN'));
});
test('only proven typed entries become rows, all actual variants are preserved', () => {
  const value = fixture(['Anna Beispiel', 'ANNA BEISPIEL', 'Anna  Beispiel']);
  value.documents[0].entries.push({ kind: 'ORGANIZATION', replacement: '[UNTERNEHMEN_ABC]', originals: ['Beispiel GmbH'], occurrences: 1 },
    { kind: 'PROJECT', replacement: '[PROJEKT_ABC]', originals: ['Projekt Eins'], occurrences: 1 });
  assert.deepEqual(rows(unpack(renderConfidentialWorkbook(value)).contents.get('Dokument_001')).slice(1), [
    ['Person', 'Anna Beispiel', '[PERSON_ABC]'], ['Person', 'ANNA BEISPIEL', '[PERSON_ABC]'], ['Person', 'Anna  Beispiel', '[PERSON_ABC]'],
    ['Unternehmen-Organisation', 'Beispiel GmbH', '[UNTERNEHMEN_ABC]'], ['Projekt', 'Projekt Eins', '[PROJEKT_ABC]']]);
  assert.deepEqual(rows(unpack(renderConfidentialWorkbook(value)).contents.get('Zuordnungen'), 5).slice(1), txtMappingRows(value));
});
test('same marker in two documents is never merged or inferred from filename', () => {
  const value = fixture(); value.documents[0].name = '[UNTERNEHMEN_ABC].md';
  const second = copy(value.documents[0]); second.document_id = 'd'.repeat(32); second.name = 'EINGABEN/Andere.txt'; second.entries[0].originals = ['Berta Beispiel'];
  value.documents.push(second);
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.deepEqual(workbook.sheets.map(item => item.name), ['Zuordnungen', 'Übersicht', 'Dokument_001', 'Dokument_002']);
  assert.equal(workbook.contents.get('Dokument_001').get('B2'), 'Anna Beispiel');
  assert.equal(workbook.contents.get('Dokument_002').get('B2'), 'Berta Beispiel');
  assert.equal(workbook.contents.get('Dokument_001').get('A2'), 'Person');
  assert.deepEqual(rows(workbook.contents.get('Zuordnungen'), 5).slice(1).map(row => [row[0], row[2], row[3]]), [
    ['[PERSON_ABC]', 'Anna Beispiel', 1], ['[PERSON_ABC]', 'Berta Beispiel', 1]]);
  assert.deepEqual(rows(workbook.contents.get('Zuordnungen'), 5).slice(1).map(row => row[4]), [value.documents[0].name, second.name]);
});
test('missing trace and excluded-only documents produce no fabricated identity rows', () => {
  const value = fixture(); value.documents[0].trace_available = false; value.documents[0].entries = [];
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.deepEqual(rows(workbook.contents.get('Dokument_001')), [['Typ', 'Basiswert', 'Endwert']]);
  assert.deepEqual(rows(workbook.contents.get('Zuordnungen'), 5), [['Pseudonym', 'Typ', 'Originalwert(e)', 'Vorkommen', 'Datei']]);
  assert.ok(rows(workbook.contents.get('Übersicht')).some(row => row[1] === 'nicht verfügbar'));
});
test('an empty mapping has only a first-sheet header, with excluded counts confined to the contextual overview', () => {
  const value = fixture(); value.documents[0].entries = [];
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(rows(workbook.contents.get('Zuordnungen'), 5).length, 1);
  assert.deepEqual(rows(workbook.contents.get('Zuordnungen'), 5).slice(1), txtMappingRows(value));
  assert.equal(rows(workbook.contents.get('Übersicht')).filter(row => row[0].endsWith('ausgeschlossen')).length, 4);
  assert.equal(rows(workbook.contents.get('Dokument_001')).length, 1);
});
test('generated sheet names are short, valid, unique and independent of source names', () => {
  const value = fixture(); value.documents = Array.from({ length: 200 }, (_, index) => ({ ...copy(value.documents[0]),
    document_id: index.toString(16).padStart(32, '0'), name: "'[]:*?/\\".repeat(100), entries: [], excluded: { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 } }));
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(workbook.sheets.length, 202); assert.equal(workbook.entries.size, 207);
  for (const { name } of workbook.sheets) { assert.ok(name.length <= 31); assert.ok(!/[\[\]:*?/\\]/u.test(name)); }
  assert.equal(new Set(workbook.sheets.map(item => item.name)).size, 202);
});
test('two hundred documents plus first mapping, overview and long values fit the unchanged 208-part ceiling', () => {
  const value = fixture(['x'.repeat(32768)]);
  value.documents = Array.from({ length: 200 }, (_, index) => ({ ...copy(value.documents[0]),
    document_id: index.toString(16).padStart(32, '0'), name: `synthetic/${index}.txt`,
    excluded: { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 } }));
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(workbook.sheets.length, 203); assert.equal(workbook.entries.size, 208);
  assert.deepEqual(workbook.sheets.slice(0, 2).map(sheet => sheet.name), ['Zuordnungen', 'Übersicht']);
  assert.equal(workbook.sheets.at(-1).name, 'Langwerte');
  assert.equal(rows(workbook.contents.get('Zuordnungen'), 5).length, 201);
  assert.equal(reconstructLong(workbook, 'Zuordnungen', 'C201'), value.documents[199].entries[0].originals[0]);
  assert.equal(reconstructLong(workbook, 'Dokument_200', 'B2'), value.documents[199].entries[0].originals[0]);
});
test('formula-looking strings remain literal text, with no macros, external links or workbook formulas', () => {
  const values = ['=HYPERLINK("https://invalid.example","x")', '+SUM(1,2)', '-1+2', '@A1', '001234', '1E12', ' https://invalid.example '];
  const workbook = unpack(renderConfidentialWorkbook(fixture(values)));
  assert.deepEqual(rows(workbook.contents.get('Dokument_001')).slice(1).map(row => row[1]), values);
  for (const [name, bytes] of workbook.entries) {
    assert.ok(!/vba|externalLink|connections|calcChain|customUI|embedded|\.bin/iu.test(name));
    assert.ok(!/<(?:\w+:)?(?:f|hyperlink|externalLink)(?:\s|>)/u.test(bytes.toString('utf8')));
    assert.ok(!/TargetMode="External"|macroEnabled/u.test(bytes.toString('utf8')));
  }
});
test('XML metacharacters and XML/Xstring controls round-trip without lost or injected cells', () => {
  const values = ['<>&"\' </t><f>1+1</f><t>', 'a\u0000b\u0001c\u000bd\u000ce\rf\tg\nh\u007fi\u0085j\ufffek\uffff',
    '_x000A_', '_x005F_', '_x005f_x0000_', '_X00aB_', '_x0001__x0002_', '   \t leading and trailing   '];
  const actual = rows(unpack(renderConfidentialWorkbook(fixture(values))).contents.get('Dokument_001')).slice(1).map(row => row[1]);
  assert.deepEqual(actual, values);
});
test('NFC and NFD Unicode and astral text remain byte-distinct original variants', () => {
  const values = ['Jörg', 'Jo\u0308rg', '😀𝄞\u200d\ufeff'];
  assert.notEqual(values[0], values[1]);
  assert.deepEqual(rows(unpack(renderConfidentialWorkbook(fixture(values))).contents.get('Dokument_001')).slice(1).map(row => row[1]), values);
});
test('32,767 UTF-16 units fit one real text cell', () => {
  const value = 'a'.repeat(32767), workbook = unpack(renderConfidentialWorkbook(fixture([value])));
  assert.equal(workbook.contents.get('Dokument_001').get('B2'), value); assert.ok(!workbook.contents.has('Langwerte'));
});
test('32,768 UTF-16 units use explicit, hashed, lossless parts instead of truncation', () => {
  const value = 'a'.repeat(32768), workbook = unpack(renderConfidentialWorkbook(fixture([value])));
  assert.equal(reconstructLong(workbook), value);
  assert.equal(reconstructLong(workbook, 'Zuordnungen', 'C2'), value);
  assert.equal(rows(workbook.contents.get('Langwerte')).length, 5);
});
test('surrogate pairs at chunk boundaries are never split', () => {
  const value = `${'a'.repeat(32766)}😀${'b'.repeat(32766)}`, workbook = unpack(renderConfidentialWorkbook(fixture([value])));
  assert.equal(value.length, 65534); assert.equal(reconstructLong(workbook), value);
});
test('253 line feeds fit; the 254th is losslessly moved to the long-value sheet', () => {
  const exact = 'x\n'.repeat(253), longValue = 'x\n'.repeat(254);
  const workbook = unpack(renderConfidentialWorkbook(fixture([exact, longValue])));
  assert.equal(workbook.contents.get('Dokument_001').get('B2'), exact);
  assert.equal(reconstructLong(workbook, 'Dokument_001', 'B3'), longValue);
});
test('dense LF/CRLF/control strings reconstruct exactly and every emitted chunk obeys both limits', () => {
  const value = '\r\n\u0000_x000D_😀'.repeat(4000);
  const workbook = unpack(renderConfidentialWorkbook(fixture([value])));
  assert.equal(reconstructLong(workbook), value);
  assert.equal(reconstructLong(workbook, 'Zuordnungen', 'C2'), value);
});
test('long references are unique and bound per document/cell, not grouped by original value', () => {
  const value = fixture(['x'.repeat(32768), 'x'.repeat(32768)]), second = copy(value.documents[0]);
  second.document_id = 'd'.repeat(32); value.documents.push(second);
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(reconstructLong(workbook), value.documents[0].entries[0].originals[0]);
  assert.equal(reconstructLong(workbook, 'Dokument_001', 'B3'), value.documents[0].entries[0].originals[1]);
  assert.equal(reconstructLong(workbook, 'Dokument_002', 'B2'), value.documents[1].entries[0].originals[0]);
  assert.equal(reconstructLong(workbook, 'Dokument_002', 'B3'), value.documents[1].entries[0].originals[1]);
  assert.equal(new Set(rows(workbook.contents.get('Langwerte')).slice(1).map(row => JSON.parse(row[2]).id)).size, 6);
});
test('bytes are deterministic and bound to order, revision, hashes, exclusions and actual variant bytes', () => {
  const value = fixture(['Jörg', 'Jo\u0308rg']), first = renderConfidentialWorkbook(value);
  assert.deepEqual(renderConfidentialWorkbook(copy(value)), first);
  assert.deepEqual(value, fixture(['Jörg', 'Jo\u0308rg']));
  for (const change of [v => v.documents[0].revision++, v => { v.documents[0].output_sha256 = 'd'.repeat(64); },
    v => v.documents[0].excluded.kept++, v => v.documents[0].entries[0].originals.reverse(),
    v => v.documents[0].entries[0].occurrences++, v => { v.batch_id = 'd'.repeat(64); }]) {
    const modified = copy(value); change(modified); assert.notEqual(sha(renderConfidentialWorkbook(modified)), sha(first));
  }
});
test('ZIP timestamps/permissions are fixed and every part is accounted within expanded and compressed budgets', () => {
  const buffer = renderConfidentialWorkbook(fixture()), directory = inspectZipDirectory(buffer), workbook = unpack(buffer);
  assert.ok(MAX_WORKBOOK_BYTES <= 16 * 1024 * 1024); assert.ok(MAX_WORKBOOK_EXPANDED_BYTES <= 64 * 1024 * 1024);
  assert.ok([...workbook.entries.values()].reduce((sum, bytes) => sum + bytes.length, 0) <= MAX_WORKBOOK_EXPANDED_BYTES);
  assert.ok(directory);
  let at = 0, count = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(at + 10), 0); assert.equal(buffer.readUInt16LE(at + 12), 0x21);
    assert.equal(buffer.readUInt16LE(at + 6), 0x800);
    at += 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28) + buffer.readUInt32LE(at + 18); count++;
  }
  assert.equal(count, workbook.entries.size); assert.equal(buffer.readUInt32LE(at), 0x02014b50);
});
for (const [name, change] of [
  ['unknown overview field', v => { v.extra = true; }], ['untrusted schema', v => { v.schema = 'other'; }],
  ['nonconfidential overview', v => { v.confidential = false; }], ['upload-allowed overview', v => { v.ai_upload_allowed = true; }],
  ['unproven type', v => { v.documents[0].entries[0].kind = 'ADDRESS'; }],
  ['generic mask instead of identity', v => { v.documents[0].entries[0].replacement = '[MASKED]'; }],
  ['malformed Unicode', v => { v.documents[0].entries[0].originals = ['\ud800']; }],
  ['negative exclusions', v => { v.documents[0].excluded.kept = -1; }],
  ['zero occurrences', v => { v.documents[0].entries[0].occurrences = 0; }],
  ['negative occurrences', v => { v.documents[0].entries[0].occurrences = -1; }],
  ['fractional occurrences', v => { v.documents[0].entries[0].occurrences = 1.5; }],
  ['string occurrences', v => { v.documents[0].entries[0].occurrences = '7'; }],
  ['unsafe occurrence integer', v => { v.documents[0].entries[0].occurrences = Number.MAX_SAFE_INTEGER + 1; }],
  ['occurrences beyond the unchanged overview budget', v => { v.documents[0].entries[0].occurrences = 100001; }],
  ['missing revision', v => { delete v.documents[0].revision; }], ['hash not bound', v => { v.documents[0].output_sha256 = 'x'; }]
]) test(`closed overview refuses ${name}`, () => {
  const value = fixture(); change(value); assert.throws(() => renderConfidentialWorkbook(value));
});
test('data-only snapshot rejects accessors without evaluating them or changing input', () => {
  const value = fixture(); let accessed = 0;
  Object.defineProperty(value, 'batch_id', { enumerable: true, get() { accessed++; return 'a'.repeat(64); } });
  assert.throws(() => renderConfidentialWorkbook(value), { code: 'CONFIDENTIAL_WORKBOOK_INVALID' }); assert.equal(accessed, 0);
});
test('data-only snapshot refuses hidden fields, exotic objects, toJSON and sparse arrays', () => {
  const hidden = fixture(); Object.defineProperty(hidden, 'hidden', { value: true });
  assert.throws(() => renderConfidentialWorkbook(hidden));
  const hook = fixture(); hook.toJSON = () => fixture(); assert.throws(() => renderConfidentialWorkbook(hook));
  const exotic = fixture(); Object.setPrototypeOf(exotic.documents[0], { inherited: true }); assert.throws(() => renderConfidentialWorkbook(exotic));
  const sparse = fixture(); sparse.documents[0].entries[0].originals = Array(2); assert.throws(() => renderConfidentialWorkbook(sparse));
});
test('pure source loads only crypto/compression/validated-overview and uses no clock, process or filesystem', () => {
  const context = { module: { exports: {} }, Buffer, json: JSON.stringify(fixture()),
    require(name) {
      if (name === 'node:crypto') return { createHash: crypto.createHash };
      if (name === 'node:zlib') return zlib;
      if (name === './confidential-overview') return overviewModule;
      throw Error(`FORBIDDEN_IMPORT:${name}`);
    }, Date: new Proxy(Date, { construct() { throw Error('CLOCK_USED'); } }),
    process: new Proxy({}, { get() { throw Error('PROCESS_USED'); } }) };
  vm.createContext(context); vm.runInContext(source, context);
  const bytes = vm.runInContext('module.exports.renderConfidentialWorkbook(JSON.parse(json))', context);
  assert.deepEqual(bytes, renderConfidentialWorkbook(fixture()));
});
test('Excel sheet row ceiling is refused, not silently shortened', () => {
  const value = fixture(); value.documents[0].excluded = { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 };
  value.documents[0].entries = Array.from({ length: 105 }, () => ({ replacement: '[PERSON_ABC]', kind: 'PERSON', originals: Array(10000).fill('x'), occurrences: 1 }));
  assert.throws(() => renderConfidentialWorkbook(value), { code: 'CONFIDENTIAL_WORKBOOK_LIMIT' });
});
test('actual expanded XML budget fails closed before producing an oversized workbook', () => {
  const value = fixture(); value.documents[0].excluded = { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 };
  value.documents[0].entries = Array.from({ length: 40 }, () => ({ replacement: '[PERSON_ABC]', kind: 'PERSON', originals: Array(10000).fill('x'), occurrences: 1 }));
  assert.throws(() => renderConfidentialWorkbook(value), { code: 'CONFIDENTIAL_WORKBOOK_LIMIT' });
});
test('compressed budget has an independent checked boundary (isolated compressor source model)', () => {
  const context = { module: { exports: {} }, Buffer, json: '', require(name) {
    if (name === 'node:crypto') return crypto;
    if (name === './confidential-overview') return overviewModule;
    if (name === 'node:zlib') return { deflateRawSync(raw, options) {
      return raw.length > MAX_WORKBOOK_BYTES + 1 ? Buffer.alloc(MAX_WORKBOOK_BYTES + 1) : zlib.deflateRawSync(raw, options);
    } };
    throw Error('FORBIDDEN_IMPORT');
  } };
  vm.createContext(context); vm.runInContext(source, context);
  const value = fixture(); value.documents[0].entries = Array.from({ length: 10 }, () => ({ replacement: '[PERSON_ABC]', kind: 'PERSON', originals: Array(10000).fill('x'), occurrences: 1 }));
  context.json = JSON.stringify(value);
  assert.throws(() => vm.runInContext('module.exports.renderConfidentialWorkbook(JSON.parse(json))', context), error => error.code === 'CONFIDENTIAL_WORKBOOK_LIMIT');
});
test('compression failures are not converted into success or partial workbook bytes', () => {
  const context = { module: { exports: {} }, Buffer, json: JSON.stringify(fixture()), require(name) {
    if (name === 'node:crypto') return crypto;
    if (name === './confidential-overview') return overviewModule;
    if (name === 'node:zlib') return { deflateRawSync() { throw Object.assign(Error('SYNTHETIC_COMPRESSION_FAILURE'), { code: 'SYNTHETIC_COMPRESSION_FAILURE' }); } };
    throw Error('FORBIDDEN_IMPORT');
  } };
  vm.createContext(context); vm.runInContext(source, context);
  assert.throws(() => vm.runInContext('module.exports.renderConfidentialWorkbook(JSON.parse(json))', context), error => error.code === 'SYNTHETIC_COMPRESSION_FAILURE');
});

done();
