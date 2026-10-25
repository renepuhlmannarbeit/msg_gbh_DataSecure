'use strict';

const { createSuite } = require('./helpers');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { xmlDecode } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { test, done, assert } = createSuite('XLSX typed escaped controls retain source cells without raw control authority');
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const reader = extra => createXlsxReader(xmlDecode, { preserveText: true, contentMode: true, ...extra });
const sheet = body => `<worksheet xmlns="${S}"><sheetData>${body}</sheetData></worksheet>`;
const inline = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
const shared = strings => `<sst xmlns="${S}">` + strings.map(s => `<si><t>${escape(s)}</t></si>`).join('') + '</sst>';
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };

function workbook(kind, value) {
  const stringPart = kind === 'shared' ? [['xl/sharedStrings.xml', shared(['FHIR', value, 'HTTP/2'])]] : [];
  const target = kind === 'shared' ? '<c r="A2" t="s"><v>1</v></c>' : kind === 'inline'
    ? inline('A2', value) : `<c r="A2" t="str"><v>${escape(value)}</v></c>`;
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: [
    { part: 'xl/worksheets/sheet1.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' },
    ...(stringPart.length ? [{ part: 'xl/sharedStrings.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml' }] : [])
  ] }), ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${O}"><sheets><sheet name="Synthetic" sheetId="1" r:id="s"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${P}"><Relationship Id="s" Type="${O}/worksheet" Target="worksheets/sheet1.xml"/>${stringPart.length ? `<Relationship Id="strings" Type="${O}/sharedStrings" Target="sharedStrings.xml"/>` : ''}</Relationships>`],
  ['xl/worksheets/sheet1.xml', sheet(`<row r="1">${inline('A1', 'Quelle')}${inline('B1', 'Technik')}</row><row r="2">${target}${inline('B2', 'FHIR')}</row><row r="3">${inline('A3', 'HTTP/2')}</row>`)], ...stringPart]);
}

for (const code of ['0000', '0001', '0002', '0008', '000B', '000C', '001F', '007F', '0085', '009F']) {
  test(`shared source indices and control projection stay independent ${code}`, () => {
    const r = reader(), strings = r.sharedStrings(shared(['First source', `Before_x${code}_After`, 'Later source']));
    assert.deepEqual(strings, ['First source', `Before ⟦U+${code}⟧ After`, 'Later source']);
    const parsed = r.worksheet(sheet('<row r="7"><c r="A7" t="s"><v>2</v></c><c r="B7" t="s"><v>1</v></c><c r="C7" t="s"><v>0</v></c></row>'), strings);
    assert.deepEqual(parsed.rowRecords[0].values, ['Later source', `Before ⟦U+${code}⟧ After`, 'First source']);
    assert.deepEqual(parsed.controlCharacterProjections, [{ reference: 'B7', row: 7, column: 2, count: 1, codes: [code] }]);
    assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u.test(strings.join('')));
    assert.ok(Object.isFrozen(parsed.controlCharacterProjections));
    assert.ok(Object.isFrozen(parsed.controlCharacterProjections[0].codes));
  });
}

for (const value of ['_x005F_x0002_', '_x005f_x0000_', '_X0002_', '_xZZZZ_', '⟦U+0002⟧']) {
  test(`literal-looking marker cannot fabricate projection metadata ${value}`, () => {
    const r = reader(), strings = r.sharedStrings(shared([value]));
    const parsed = r.worksheet(sheet('<row><c t="s"><v>0</v></c></row>'), strings);
    assert.equal(parsed.controlCharacterProjections, undefined);
    assert.equal(parsed.rowRecords[0].values[0], value.replace(/^_x005[fF]_x/u, '_x'));
  });
}

test('one complete typed leaf decodes XML events, independent rich leaves do not invent escapes', () => {
  const r = reader();
  assert.deepEqual(r.sharedStrings(`<sst xmlns="${S}"><si><t>Before_x00<![CDATA[02]]>_After</t></si></sst>`), ['Before ⟦U+0002⟧ After']);
  const split = r.sharedStrings(`<sst xmlns="${S}"><si><r><t>Before_x00</t></r><r><t>02_After</t></r></si></sst>`);
  assert.deepEqual(split, ['Before_x0002_After']);
  assert.equal(r.worksheet(sheet('<row><c t="s"><v>0</v></c></row>'), split).controlCharacterProjections, undefined);
});

test('multiple leaves and occurrences preserve actual source-cell counts', () => {
  const r = reader();
  const parsed = r.worksheet(sheet(`<row r="2"><c r="C2" t="inlineStr"><is><r><t>😀_x0002_</t></r><r><t>Äß_x0085_</t></r></is></c>` +
    '<c r="D2" t="str"><v>Value_x0002__x0002_End</v></c></row>'), []);
  assert.deepEqual(parsed.controlCharacterProjections, [
    { reference: 'C2', row: 2, column: 3, count: 2, codes: ['0002', '0085'] },
    { reference: 'D2', row: 2, column: 4, count: 2, codes: ['0002'] }
  ]);
  assert.equal(parsed.rowRecords[0].values[2], '😀 ⟦U+0002⟧ Äß ⟦U+0085⟧ ');
});

for (const options of [{ contentMode: false }, { preserveText: false }]) test(`projection is not granted by a legacy reader ${JSON.stringify(options)}`, () => {
  assert.throws(() => reader(options).sharedStrings(shared(['Before_x0002_After'])), { code: 'XLSX_STRUCTURE_UNSAFE' });
});

for (const code of ['D800', 'DC00', 'FFFE', 'FFFF']) test(`invalid scalar remains refused ${code}`, () => {
  assert.throws(() => reader().sharedStrings(shared([`Before_x${code}_After`])), { code: 'XLSX_STRUCTURE_UNSAFE' });
});
for (const code of [0, 1, 2, 8, 11, 12, 31, 127, 133, 159]) test(`raw source XML control is still rejected ${code}`, () => {
  assert.throws(() => reader().sharedStrings(shared(['Before' + String.fromCharCode(code) + 'After'])), { code: 'XLSX_STRUCTURE_UNSAFE' });
});
for (const type of ['n', 'b', 's', 'd', 'e']) test(`typed ${type} cannot turn escaped controls into a value authority`, () => {
  assert.throws(() => reader().worksheet(sheet(`<row><c t="${type}"><v>1_x0002_</v></c></row>`), ['Safe']), { code: 'XLSX_STRUCTURE_UNSAFE' });
});
test('invalid shared index and duplicate source address remain hard', () => {
  const r = reader(), strings = r.sharedStrings(shared(['A_x0002_B']));
  assert.throws(() => r.worksheet(sheet('<row><c t="s"><v>1</v></c></row>'), strings), { code: 'XLSX_SHARED_STRING_INVALID' });
  assert.throws(() => r.worksheet(sheet(inline('A1', 'A') + inline('A1', 'B')) .replace('<sheetData>', '<sheetData><row>').replace('</sheetData>', '</row></sheetData>'), strings), { code: 'XLSX_STRUCTURE_UNSAFE' });
});
test('projection expansion and original raw budgets remain bounded', () => {
  assert.throws(() => reader().sharedStrings(shared(['_x0002_'.repeat(900000)])), { code: 'XLSX_STRUCTURE_LIMIT' });
  assert.throws(() => reader().sharedStrings(shared(['A'.repeat(8000001)])), { code: 'XLSX_STRUCTURE_LIMIT' });
});

for (const kind of ['shared', 'inline', 'cached']) test(`${kind} actual source-to-Markdown retains independent text with visible controls`, () => {
  const bytes = workbook(kind, 'Before_x0002_After'), before = Buffer.from(bytes);
  const result = extractMarkdownBuffer(bytes, '.xlsx', { markdownOutput: 'content-v1', partialExtraction: true });
  assert.deepEqual(bytes, before);
  assert.ok(result.markdown.includes('Before ⟦U\\+0002⟧ After'), result.markdown);
  assert.ok(result.markdown.includes('FHIR')); assert.ok(result.markdown.includes('HTTP/2'));
  assert.ok(!result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  assert.throws(() => extractMarkdownBuffer(bytes, '.xlsx', { markdownOutput: 'notes-v1' }));
});

for (const value of ['Name: Anna_x0002_Berger', 'Telefon: +49_x0002_30 12345678', 'E-Mail: anna_x0002_berger@example.invalid']) {
  test(`projected cell field is not an anonymity exemption ${value.split(':')[0]}`, () => {
    const bytes = workbook('shared', value), result = extractMarkdownBuffer(bytes, '.xlsx', { markdownOutput: 'content-v1', partialExtraction: true });
    const anonymized = anonymizeMarkdown(result.markdown, 'general', { productChannel: 'standalone', contentOptions });
    assert.ok(anonymized.text.includes('FHIR'));
    for (const raw of ['Anna', 'Berger', '12345678', 'anna', 'berger@example']) assert.ok(!anonymized.text.includes(raw), `${raw} is not safe due to an escape marker: ${anonymized.text}`);
  });
}

test('projected control in a source header cannot expose its following unclassified value', () => {
  const bytes = zipStore([...opcControlEntries('xlsx', { additionalOverrides: [
    { part: 'xl/worksheets/sheet1.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }
  ] }), ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${O}"><sheets><sheet name="Synthetic" sheetId="1" r:id="s"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${P}"><Relationship Id="s" Type="${O}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
  ['xl/worksheets/sheet1.xml', sheet(`<row r="1">${inline('A1', 'Na_x0002_me')}${inline('B1', 'Protokoll')}</row><row r="2">${inline('A2', 'Qvx / Qvy')}${inline('B2', 'FHIR')}</row>`)]]);
  const result = extractMarkdownBuffer(bytes, '.xlsx', { markdownOutput: 'content-v1', partialExtraction: true });
  const anonymized = anonymizeMarkdown(result.markdown, 'general', { productChannel: 'standalone', contentOptions });
  assert.ok(anonymized.text.includes('FHIR'));
  assert.ok(!anonymized.text.includes('Qvx')); assert.ok(!anonymized.text.includes('Qvy'));
  assert.ok(!anonymized.text.includes('[PERSON_'), 'a damaged-looking source header is not a new person identity');
});

done();
