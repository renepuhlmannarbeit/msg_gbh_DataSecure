'use strict';

const { createSuite } = require('./helpers');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { formatXlsxNumber } = require('../plugins/data-secure/server/xlsx-number-format');
const { xmlDecode } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { test, done, assert } = createSuite('XLSX typed comment escapes and exact date/duration counterregressions');
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const T = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';
const M = 'http://schemas.microsoft.com/office/2017/10/relationships';
const personId = '{00000000-0000-0000-0000-000000000001}';
const commentId = '{00000000-0000-0000-0000-000000000002}';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const reader = () => createXlsxReader(xmlDecode, { preserveText: true, contentMode: true });
const persons = name => `<personList xmlns="${T}"><person id="${personId}" displayName="${escape(name)}"/></personList>`;
const comments = text => `<ThreadedComments xmlns="${T}"><threadedComment ref="A1" personId="${personId}" id="${commentId}"><text>${escape(text)}</text></threadedComment></ThreadedComments>`;

function source({ author = 'Max Mustermann', text = 'Name: Anna Berger', raw, code, date1904 = false } = {}) {
  const typedParts = [
    { part: 'xl/worksheets/sheet1.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' },
    { part: 'xl/persons/person.xml', contentType: 'application/vnd.ms-excel.person+xml' },
    { part: 'xl/threadedComments/threadedComment1.xml', contentType: 'application/vnd.ms-excel.threadedcomments+xml' }
  ];
  const styles = code === undefined ? [] : [
    ['xl/styles.xml', `<styleSheet xmlns="${S}"><numFmts><numFmt numFmtId="164" formatCode="${escape(code)}"/></numFmts><cellStyleXfs><xf numFmtId="0"/></cellStyleXfs><cellXfs><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/></cellXfs></styleSheet>`]
  ];
  if (styles.length) typedParts.push({ part: 'xl/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml' });
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: typedParts }),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${O}"><workbookPr date1904="${date1904 ? '1' : '0'}"/><sheets><sheet name="Synthetic" sheetId="1" r:id="s"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="s" Type="${O}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="p" Type="${M}/person" Target="persons/person.xml"/>${styles.length ? `<Relationship Id="style" Type="${O}/styles" Target="styles.xml"/>` : ''}</Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1">${raw === undefined ? '<c r="A1" t="inlineStr"><is><t>FHIR</t></is></c>' : `<c r="A1" s="1"><v>${escape(raw)}</v></c>`}</row></sheetData></worksheet>`],
    ['xl/persons/person.xml', persons(author)], ['xl/threadedComments/threadedComment1.xml', comments(text)],
    ['xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="t" Type="${M}/threadedComment" Target="../threadedComments/threadedComment1.xml"/></Relationships>`], ...styles]);
}
function extracted(input) {
  const before = Buffer.from(input);
  const result = extractMarkdownBuffer(input, '.xlsx', { markdownOutput: 'content-v1', partialExtraction: true });
  assert.deepEqual(input, before); return result;
}
const privacyOptions = { productChannel: 'standalone', contentOptions: {
  schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false
} };

for (const [encoded, wanted] of [
  ['Max_x000D_Mustermann', 'Max\rMustermann'], ['Max_x0009_Mustermann', 'Max\tMustermann'],
  ['Max_x000A_Mustermann', 'Max\nMustermann'], ['Ää Öö Üü ß 中文 😀', 'Ää Öö Üü ß 中文 😀'],
  ['_xD83D__xDE00_', '😀'], ['_x005F_x000D_', '_x000D_'],
  ['_x005f_x005F_', '_x005F_'], ['_X000D_ _xZZZZ_', '_X000D_ _xZZZZ_']
]) test(`schema-typed author single-pass ${JSON.stringify(encoded)}`, () => {
  assert.equal(reader().modernPersons(persons(encoded)).get(personId), wanted);
});

test('typed text is decoded after complete XML event assembly, not once per event', () => {
  const r = reader(), people = r.modernPersons(persons('Prüfer Äß'));
  const xml = comments('prefix').replace('prefix', 'Name:_x00<![CDATA[0D]]>_Anna Berger &amp; &#95;x005F_x000D_');
  const result = r.threadedComments(xml, people)[0];
  assert.equal(result.text, 'Name:\rAnna Berger & _x000D_');
  assert.equal(result.author, 'Prüfer Äß'); assert.equal(result.ref, 'A1');
});

for (const code of ['0000', '0001', '0008', '000B', '000C', '001F', '007F', '0085', '009F', 'D800', 'DC00', 'FFFE', 'FFFF']) {
  test(`decoded character guard remains hard for _x${code}_`, () => {
    const r = reader(), people = r.modernPersons(persons('Prüfer'));
    assert.throws(() => r.modernPersons(persons(`Max_x${code}_Mustermann`)), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
    assert.throws(() => r.threadedComments(comments(`Name:_x${code}_Anna Berger`), people), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  });
}

test('protected escape-like text stays literal and does not bypass into a control', () => {
  const r = reader(), people = r.modernPersons(persons('_x005F_x0000_'));
  assert.equal(people.get(personId), '_x0000_');
  assert.equal(r.threadedComments(comments('_x005F_xD800_'), people)[0].text, '_xD800_');
});

for (const [author, text] of [
  ['Max Mustermann', 'Name:_x000D_Anna Berger'],
  ['Max_x000D_Mustermann', 'Name: Anna_x000D_Berger'],
  ['Max_x0009_Mustermann', 'Name: Anna Berger'],
  ['Max Mustermann', 'Name: Anna Berger']
]) test(`original source→MD→privacy/residual countercase ${JSON.stringify([author, text])}`, () => {
  const result = extracted(source({ author, text }));
  assert.ok(result.markdown.includes('FHIR')); assert.ok(!result.markdown.includes('x000D')); assert.ok(!result.markdown.includes('x0009'));
  const anonymized = anonymizeMarkdown(result.markdown, 'general', privacyOptions);
  assert.ok(anonymized.text.includes('FHIR')); assert.ok(anonymized.entityCount >= 2);
  for (const word of ['Max', 'Mustermann', 'Anna', 'Berger']) assert.ok(!anonymized.text.includes(word), `${word} must not survive`);
  assert.ok(anonymized.text.includes('[PERSON_')); assert.equal(anonymized.passes, 1);
});

test('invalid typed comment cannot be returned as a successfully processed prefix', () => {
  const input = source({ author: 'Max_x0000_Mustermann' });
  assert.throws(() => extractMarkdownBuffer(input, '.xlsx', { markdownOutput: 'content-v1' }));
  const result = extracted(input);
  assert.ok(result.markdown.includes('FHIR')); assert.ok(!result.markdown.includes('Mustermann'));
  assert.ok(!result.markdown.includes('Anna')); assert.ok(result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('an arbitrary TXT source never receives Office Xstring interpretation', () => {
  const result = extractMarkdownBuffer(Buffer.from('Code: _x000D_ / _x005F_x0000_\nÄß'), '.txt', { markdownOutput: 'content-v1' });
  assert.ok(result.markdown.includes('\\_x000D\\_')); assert.ok(result.markdown.includes('\\_x005F_x0000\\_'));
  assert.ok(!result.markdown.includes('\r')); assert.ok(result.markdown.includes('Äß'));
});

for (const [raw, code, date1904, wanted] of [
  // Original independent RED oracles: unshown fractional time cannot move a date.
  ['45291.999999', 'yyyy-mm-dd', false, '2023-12-31'],
  ['45291.5', 'yyyy-mm-dd', false, '2023-12-31'],
  ['1.999999', 'yyyy-mm-dd', false, '1900-01-01'],
  ['0.999999', 'yyyy-mm-dd', true, '1904-01-01'],
  ['1.999999', '[h]:mm:ss', false, '48:00:00'],
  ['0.999999', '[h]:mm:ss', false, '24:00:00'],
  ['59.999999', 'yyyy-mm-dd', false, '1900-02-28'],
  ['60.999999', 'yyyy-mm-dd', false, '1900-02-29'],
  ['61.999999', 'yyyy-mm-dd', false, '1900-03-01'],
  ['45291.999999', 'yyyy-mm-dd hh:mm:ss', false, '2024-01-01 00:00:00'],
  ['59.999999', 'yyyy-mm-dd hh:mm:ss', false, '1900-02-29 00:00:00'],
  ['60.999999', 'yyyy-mm-dd hh:mm:ss', false, '1900-03-01 00:00:00'],
  ['0.999999', 'yyyy-mm-dd hh:mm:ss', true, '1904-01-02 00:00:00'],
  ['1.99999', '[h]:mm:ss', false, '47:59:59'],
  ['1.99999', 'hh:mm:ss', false, '23:59:59'],
  ['1.5', '[h]:mm:ss', false, '36:00:00'],
  ['1.25', '[h]', false, '30'],
  ['0.5', 'h:mm AM/PM', false, '12:00 PM'],
  ['.5', 'h:mm', false, '12:00'],
  ['+1.5e0', 'h:mm:ss', false, '12:00:00'],
  ['1.9999999999999999999999999999', 'yyyy-mm-dd', false, '1900-01-01'],
  ['1.9999999999999999999999999999', '[h]:mm:ss', false, '48:00:00']
]) test(`decimal date/time source and full extraction ${raw}/${code}/${date1904}`, () => {
  assert.deepEqual(formatXlsxNumber(raw, code, { date1904 }), { text: wanted, unsupported: false });
  const result = extracted(source({ raw, code, date1904 }));
  assert.ok(result.markdown.includes(wanted), result.markdown);
  assert.ok(!result.markdown.includes('Zahlenformat:'));
});

for (const [raw, code, date1904 = false] of [
  ['1.999999', 'h:mm'], ['0.12345', 'mm:ss.0'], ['1.26', '[h]'],
  ['1e-999', 'yyyy-mm-dd', true], ['2958465.999999', 'yyyy-mm-dd hh:mm:ss'],
  ['0.9999999999999999999999999999', 'yyyy-mm-dd'],
  ['-1', 'yyyy-mm-dd'], ['1', 'dddd']
]) test(`unsupported/ambiguous clock projection retains exact raw+format ${raw}/${code}`, () => {
  assert.deepEqual(formatXlsxNumber(raw, code, { date1904 }), { text: `${raw} [Zahlenformat: ${code}]`, unsupported: true });
});

done();
