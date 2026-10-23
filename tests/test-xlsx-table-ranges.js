'use strict';

// Source-model tests only: no Excel automation, native renderer, formula
// evaluation or caller-authored field-authority metadata.
const { createSuite } = require('./helpers');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { test, assert, done } = createSuite('XLSX bounded source merge ranges');
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const STRICT = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos);/gu,
  entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]);
const reader = options => createXlsxReader(decode, { preserveText: true, contentMode: true, ...options });
const merge = references => `<mergeCells count="${references.length}">${references.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
const sheet = (rows = '', extra = '') => `<worksheet xmlns="${S}"><sheetData>${rows}</sheetData>${extra}</worksheet>`;
const inline = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const unsafe = fn => assert.throws(fn, { code: 'XLSX_STRUCTURE_UNSAFE' });
const column = value => { let result = ''; while (value) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); } return result; };

test('no merge container adds only an empty model and keeps real values', () => {
  const parsed = reader().worksheet(sheet(`<row r="7">${inline('C7', 'Äß 😀')}</row>`), []);
  assert.deepEqual(parsed.mergeRanges, []); assert.ok(Object.isFrozen(parsed.mergeRanges));
  assert.equal(parsed.rowRecords.length, 1); assert.equal(parsed.rowRecords[0].number, 7);
  assert.equal(parsed.rowRecords[0].values[2], 'Äß 😀'); assert.equal(Object.keys(parsed.rows).length, 1);
});

test('range endpoints and top-left anchor are exact one-based source coordinates', () => {
  const parsed = reader().worksheet(sheet(`<row r="2">${inline('B2', 'Header')}</row>`, merge(['B2:D4'])), []);
  assert.deepEqual(parsed.mergeRanges, [{ reference: 'B2:D4', start: { row: 2, column: 2 },
    end: { row: 4, column: 4 }, anchor: { reference: 'B2', row: 2, column: 2 } }]);
  for (const value of [parsed.mergeRanges[0], parsed.mergeRanges[0].start, parsed.mergeRanges[0].end,
    parsed.mergeRanges[0].anchor]) assert.ok(Object.isFrozen(value));
});

test('single-cell ST_Ref is a bounded range, not an invented neighbour', () => {
  const parsed = reader().worksheet(sheet('', merge(['C8'])), []);
  assert.deepEqual(parsed.mergeRanges[0], { reference: 'C8', start: { row: 8, column: 3 },
    end: { row: 8, column: 3 }, anchor: { reference: 'C8', row: 8, column: 3 } });
  assert.deepEqual(parsed.rowRecords, []); assert.deepEqual(parsed.rows, []);
});

test('merge record ordering and position before sheetData do not change geometry or cells', () => {
  const rows = `<row r="2">${inline('B2', 'Name')}</row><row r="8">${inline('A8', 'Qvx')}</row>`;
  const a = reader().worksheet(sheet(rows, merge(['B2:D4', 'A8:B9', 'G1:H1'])), []);
  const b = reader().worksheet(`<worksheet xmlns="${S}">${merge(['A8:B9', 'G1:H1', 'B2:D4'])}<sheetData>${rows}</sheetData></worksheet>`, []);
  assert.deepEqual(a, b); assert.deepEqual(a.mergeRanges.map(value => value.reference), ['G1:H1', 'B2:D4', 'A8:B9']);
});

test('canonical namespace aliases and reordered attributes are resolved, not regex matched', () => {
  const parsed = reader().worksheet(`<x:worksheet xmlns:x="${S}"><x:sheetData/><x:mergeCells count="1">` +
    '<x:mergeCell ref="AA31:AC34"/></x:mergeCells></x:worksheet>', []);
  assert.deepEqual(parsed.mergeRanges[0].start, { row: 31, column: 27 });
  assert.deepEqual(parsed.mergeRanges[0].end, { row: 34, column: 29 });
});

test('strict SpreadsheetML namespace carries the same exact geometry', () => {
  const parsed = reader().worksheet(`<worksheet xmlns="${STRICT}"><sheetData/>${merge(['XFC1048575:XFD1048576'])}</worksheet>`, []);
  assert.deepEqual(parsed.mergeRanges[0].end, { row: 1048576, column: 16384 });
});

test('namespace-free legacy fixtures remain available only in the legacy reader', () => {
  const source = '<worksheet><sheetData><row><c><v>7</v></c></row></sheetData>' + merge(['A1:B2']) + '</worksheet>';
  unsafe(() => reader().worksheet(source, []));
  const parsed = reader({ preserveText: false, contentMode: false }).worksheet(source, []);
  assert.deepEqual(parsed.rows, [['7']]); assert.equal(parsed.mergeRanges[0].anchor.reference, 'A1');
});

for (const [name, extra] of [
  ['foreign merge container', '<f:mergeCells xmlns:f="urn:foreign"><f:mergeCell ref="A1:B2"/></f:mergeCells>'],
  ['namespace-reset merge container', '<mergeCells xmlns=""><mergeCell ref="A1:B2"/></mergeCells>'],
  ['foreign merge child', '<mergeCells><f:mergeCell xmlns:f="urn:foreign" ref="A1:B2"/></mergeCells>'],
  ['namespace-reset merge child', '<mergeCells><mergeCell xmlns="" ref="A1:B2"/></mergeCells>'],
  ['wrong owner', '<mergeCell ref="A1:B2"/>'],
  ['nested wrong owner', '<f:wrapper xmlns:f="urn:foreign"><mergeCells><mergeCell ref="A1:B2"/></mergeCells></f:wrapper>'],
  ['unknown child', '<mergeCells><f:other xmlns:f="urn:foreign"/></mergeCells>'],
  ['nested merge-cell body', '<mergeCells><mergeCell ref="A1:B2"><f:other xmlns:f="urn:foreign"/></mergeCell></mergeCells>'],
  ['text body', '<mergeCells><mergeCell ref="A1:B2">Name: Qvx</mergeCell></mergeCells>'],
  ['container text', '<mergeCells>Name: Qvx<mergeCell ref="A1:B2"/></mergeCells>'],
  ['duplicate container', merge(['A1:B2']) + merge(['C1:D2'])],
  ['empty container', '<mergeCells/>'],
  ['count mismatch', '<mergeCells count="2"><mergeCell ref="A1:B2"/></mergeCells>'],
  ['invalid count', '<mergeCells count="1.5"><mergeCell ref="A1:B2"/></mergeCells>'],
  ['namespaced ref is not unqualified ref', '<mergeCells><mergeCell xmlns:f="urn:foreign" f:ref="A1:B2"/></mergeCells>']
]) test(`untrusted merge structure is hard-refused: ${name}`, () => unsafe(() => reader().worksheet(sheet('', extra), [])));

for (const reference of ['', 'A0:B2', 'A01:B2', 'A1:B0', 'A2:A1', 'C1:B2', 'XFE1:XFE2',
  'A1048577:B1048577', 'AAAA1:AAAA2', 'a1:b2', '$A$1:$B$2', 'Sheet1!A1:B2', 'A1:B2 C3:D4',
  'A1:B2,C3:D4', ' A1:B2', 'A1:B2 ', 'R1C1:R2C2', 'A1:B2:C3', 'A999999999999999999999999:B999999999999999999999999']) {
  test(`invalid or out-of-sheet ref is hard-refused: ${JSON.stringify(reference)}`, () =>
    unsafe(() => reader().worksheet(sheet('', merge([reference])), [])));
}

test('a nested worksheet under a foreign root cannot grant merge ownership', () => {
  unsafe(() => reader().worksheet(`<f:wrapper xmlns:f="urn:foreign">${sheet('', merge(['A1:B2']))}</f:wrapper>`, []));
  // Original causal owner countercase: valid outer root, canonical-named inner
  // worksheet behind a foreign wrapper, with and without a later real owner.
  for(const later of ['',merge(['C1:D2'])])unsafe(() => reader().worksheet(sheet('',
    `<f:wrapper xmlns:f="urn:foreign">${sheet('',merge(['A1:B2']))}</f:wrapper>`+later), []));
});

test('merge namespaces must match the actual worksheet namespace, not merely a known profile', () => {
  for (const [root, other] of [[S, STRICT], [STRICT, S]]) {
    unsafe(() => reader().worksheet(`<worksheet xmlns="${root}"><sheetData/><mergeCells xmlns="${other}"><mergeCell ref="A1:B2"/></mergeCells></worksheet>`, []));
    unsafe(() => reader().worksheet(`<worksheet xmlns="${root}"><sheetData/><mergeCells><mergeCell xmlns="${other}" ref="A1:B2"/></mergeCells></worksheet>`, []));
    assert.equal(reader().worksheet(`<worksheet xmlns="${root}" xmlns:x="${root}"><sheetData/><x:mergeCells><x:mergeCell ref="A1:B2"/></x:mergeCells></worksheet>`, []).mergeRanges.length, 1);
  }
});

test('missing ref is hard-refused', () => unsafe(() => reader().worksheet(sheet('', '<mergeCells><mergeCell/></mergeCells>'), [])));

for (const references of [
  ['A1:B2', 'A1:B2'], ['A1:D4', 'B2:C3'], ['A1:C3', 'C3:E5'],
  ['A1:D2', 'C2:E4'], ['A1:A10', 'A5:B5'], ['XFC1048575:XFD1048576', 'XFD1048576']
]) test(`inclusive overlap is hard-refused: ${references.join(' + ')}`, () =>
  unsafe(() => reader().worksheet(sheet('', merge(references)), [])));

test('adjacent columns and later rows remain disjoint, including expired active ranges', () => {
  const references = ['A1:B2', 'C1:D2', 'A3:D4', 'E1:F100', 'A100:B100', 'A101:F102'];
  const parsed = reader().worksheet(sheet('', merge(references.toReversed())), []);
  assert.equal(parsed.mergeRanges.length, references.length); assert.deepEqual(parsed.rowRecords, []);
});

test('entire-sheet merge is one range with no rectangular cell or value expansion', () => {
  const rows = `<row r="1">${inline('A1', 'ANCHORONLY')}</row>`;
  const plain = reader().worksheet(sheet(rows), []), parsed = reader().worksheet(sheet(rows, merge(['A1:XFD1048576'])), []);
  const { mergeRanges: ignored, ...before } = plain, { mergeRanges, ...after } = parsed;
  assert.deepEqual(after, before); assert.equal(mergeRanges.length, 1);
  assert.equal(parsed.rows.length, 1); assert.equal(parsed.rowRecords.length, 1);
  assert.equal(parsed.rowRecords[0].values.length, 1); assert.equal(JSON.stringify(parsed).split('ANCHORONLY').length - 1, 2,
    'only existing rows/rowRecords compatibility views contain the source value; range contains no text copy');
  assert.ok(JSON.stringify(parsed).length < 600);
});

test('far-right/high-row anchor stays one actual sparse record and is not copied to merge interior', () => {
  const parsed = reader().worksheet(sheet(`<row r="1048576">${inline('XFC1048576', 'LASTANCHOR')}</row>`,
    merge(['XFC1048576:XFD1048576'])), []);
  assert.equal(parsed.rowRecords.length, 1); assert.equal(parsed.rowRecords[0].number, 1048576);
  assert.deepEqual(Object.keys(parsed.rowRecords[0].values), ['16382']);
  assert.equal(parsed.rowRecords[0].values[16382], 'LASTANCHOR');
  assert.equal(parsed.rowRecords[0].values[16383], undefined); assert.equal(Object.keys(parsed.rows).length, 1);
});

test('source cells inside a merge remain real cells; neither hidden text nor formula is discarded/evaluated', () => {
  const rows = `<row r="1">${inline('A1', 'ANCHOR')}${inline('B1', 'SOURCEVALUE')}</row>` +
    '<row r="2"><c r="B2"><f>WEBSERVICE("https://invalid.test")</f><v>7</v></c></row>';
  const plain = reader().worksheet(sheet(rows), []), parsed = reader().worksheet(sheet(rows, merge(['A1:B2'])), []);
  const { mergeRanges: ignored, ...before } = plain, { mergeRanges, ...after } = parsed;
  assert.deepEqual(after, before); assert.equal(parsed.rowRecords[0].values[1], 'SOURCEVALUE');
  assert.match(parsed.rowRecords[1].values[1], /Formel: WEBSERVICE/u); assert.equal(parsed.formulaCells, 1);
  assert.ok(!Object.hasOwn(mergeRanges[0], 'text')); assert.ok(!Object.hasOwn(mergeRanges[0], 'verified'));
});

test('many simultaneous and expired ranges do not use quadratic area expansion', () => {
  const references = Array.from({ length: 10000 }, (_, i) => `${column(i + 1)}1:${column(i + 1)}2`);
  references.push('A3:XFD1048576');
  const parsed = reader().worksheet(sheet('', merge(references.toReversed())), []);
  assert.equal(parsed.mergeRanges.length, 10001); assert.deepEqual(parsed.rows, []); assert.deepEqual(parsed.rowRecords, []);
  assert.equal(parsed.mergeRanges.at(-1).anchor.reference, 'A3');
});

test('sweep decisions agree with a bounded independent rectangle oracle', () => {
  let seed = 0x173;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let sample = 0; sample < 180; sample++) {
    const rectangles = Array.from({ length: 1 + next(15) }, () => {
      const row = 1 + next(28), col = 1 + next(28);
      return { row, col, endRow: row + next(3), endCol: col + next(3) };
    });
    const overlap = rectangles.some((a, i) => rectangles.slice(i + 1).some(b =>
      a.row <= b.endRow && b.row <= a.endRow && a.col <= b.endCol && b.col <= a.endCol));
    const refs = rectangles.map(a => `${column(a.col)}${a.row}:${column(a.endCol)}${a.endRow}`);
    if (overlap) unsafe(() => reader().worksheet(sheet('', merge(refs)), []));
    else assert.equal(reader().worksheet(sheet('', merge(refs)), []).mergeRanges.length, rectangles.length);
  }
});

test('advertised merge count above the bounded model cap is a resource failure', () =>
  assert.throws(() => reader().worksheet(sheet('', '<mergeCells count="200001"><mergeCell ref="A1:B2"/></mergeCells>'), []),
    { code: 'XLSX_STRUCTURE_LIMIT' }));

test('actual merge records are bounded even when the count attribute is absent', () => {
  const source = sheet('', `<mergeCells>${'<mergeCell ref="A1:B2"/>'.repeat(200001)}</mergeCells>`);
  assert.throws(() => reader().worksheet(source, []), { code: 'XLSX_STRUCTURE_LIMIT' });
});

done();
