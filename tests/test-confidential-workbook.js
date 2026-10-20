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
function cellText(xml) {
  const cells = new Map();
  let cell = null, content = '';
  parseXml(xml, {
    start(node) {
      if (node.namespaceURI === SS && node.localName === 'c') {
        assert.equal(node.attributes.get('{}t'), 'inlineStr');
        cell = node.attributes.get('{}r'); content = '';
      }
      if (node.namespaceURI === SS) assert.ok(!['f', 'v', 'hyperlink', 'externalLink', 'oleObject'].includes(node.localName));
    },
    text(value, node) { if (node.namespaceURI === SS && node.localName === 't') content += value; },
    end(node) {
      if (node.namespaceURI === SS && node.localName === 'c') {
        // Independent, one-pass ST_Xstring decoding. Decoding repeatedly would
        // destroy a protected literal such as the source text "_x000A_".
        cells.set(cell, content.replace(/_x([0-9a-f]{4})_/giu, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
        cell = null;
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
    contents.set(sheet.name, cellText(entries.get(`xl/${relationship.target}`)));
  }
  return { entries, sheets, contents, relationships };
}
function rows(cells) {
  const output = [];
  for (let row = 1; cells.has(`A${row}`); row++) output.push(['A', 'B', 'C'].map(column => cells.get(`${column}${row}`)));
  assert.equal(cells.size, output.length * 3);
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
test('minimal real OOXML ZIP has closed internal relationships and exactly one document sheet', () => {
  const workbook = unpack(renderConfidentialWorkbook(fixture()));
  assert.deepEqual(workbook.sheets.map(item => item.name), ['Übersicht', 'Dokument_001']);
  assert.deepEqual(workbook.sheets.map(item => item.id), ['1', '2']);
  assert.equal(workbook.entries.size, 7);
  assert.deepEqual(rows(workbook.contents.get('Dokument_001')), [['Typ', 'Basiswert', 'Endwert'], ['Person', 'Anna Beispiel', '[PERSON_ABC]']]);
  for (const key of ['[Content_Types].xml', '_rels/.rels', 'xl/styles.xml']) assert.ok(workbook.entries.has(key));
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
});
test('same marker in two documents is never merged or inferred from filename', () => {
  const value = fixture(); value.documents[0].name = '[UNTERNEHMEN_ABC].md';
  const second = copy(value.documents[0]); second.document_id = 'd'.repeat(32); second.entries[0].originals = ['Berta Beispiel'];
  value.documents.push(second);
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.deepEqual(workbook.sheets.map(item => item.name), ['Übersicht', 'Dokument_001', 'Dokument_002']);
  assert.equal(workbook.contents.get('Dokument_001').get('B2'), 'Anna Beispiel');
  assert.equal(workbook.contents.get('Dokument_002').get('B2'), 'Berta Beispiel');
  assert.equal(workbook.contents.get('Dokument_001').get('A2'), 'Person');
});
test('missing trace and excluded-only documents produce no fabricated identity rows', () => {
  const value = fixture(); value.documents[0].trace_available = false; value.documents[0].entries = [];
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.deepEqual(rows(workbook.contents.get('Dokument_001')), [['Typ', 'Basiswert', 'Endwert']]);
  assert.ok(rows(workbook.contents.get('Übersicht')).some(row => row[1] === 'nicht verfügbar'));
});
test('generated sheet names are short, valid, unique and independent of source names', () => {
  const value = fixture(); value.documents = Array.from({ length: 200 }, (_, index) => ({ ...copy(value.documents[0]),
    document_id: index.toString(16).padStart(32, '0'), name: "'[]:*?/\\".repeat(100), entries: [], excluded: { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 } }));
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(workbook.sheets.length, 201); assert.equal(workbook.entries.size, 206);
  for (const { name } of workbook.sheets) { assert.ok(name.length <= 31); assert.ok(!/[\[\]:*?/\\]/u.test(name)); }
  assert.equal(new Set(workbook.sheets.map(item => item.name)).size, 201);
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
  assert.equal(reconstructLong(workbook), value); assert.equal(rows(workbook.contents.get('Langwerte')).length, 3);
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
});
test('long references are unique and bound per document/cell, not grouped by original value', () => {
  const value = fixture(['x'.repeat(32768), 'x'.repeat(32768)]), second = copy(value.documents[0]);
  second.document_id = 'd'.repeat(32); value.documents.push(second);
  const workbook = unpack(renderConfidentialWorkbook(value));
  assert.equal(reconstructLong(workbook), value.documents[0].entries[0].originals[0]);
  assert.equal(reconstructLong(workbook, 'Dokument_001', 'B3'), value.documents[0].entries[0].originals[1]);
  assert.equal(reconstructLong(workbook, 'Dokument_002', 'B2'), value.documents[1].entries[0].originals[0]);
  assert.equal(reconstructLong(workbook, 'Dokument_002', 'B3'), value.documents[1].entries[0].originals[1]);
  assert.equal(new Set(rows(workbook.contents.get('Langwerte')).slice(1).map(row => JSON.parse(row[2]).id)).size, 4);
});
test('bytes are deterministic and bound to order, revision, hashes, exclusions and actual variant bytes', () => {
  const value = fixture(['Jörg', 'Jo\u0308rg']), first = renderConfidentialWorkbook(value);
  assert.deepEqual(renderConfidentialWorkbook(copy(value)), first);
  assert.deepEqual(value, fixture(['Jörg', 'Jo\u0308rg']));
  for (const change of [v => v.documents[0].revision++, v => { v.documents[0].output_sha256 = 'd'.repeat(64); },
    v => v.documents[0].excluded.kept++, v => v.documents[0].entries[0].originals.reverse(), v => { v.batch_id = 'd'.repeat(64); }]) {
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
