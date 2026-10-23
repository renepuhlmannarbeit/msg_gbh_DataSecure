'use strict';

const { createSuite } = require('./helpers');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { formatXlsxNumber } = require('../plugins/data-secure/server/xlsx-number-format');
const { validateOpcControls } = require('../plugins/data-secure/server/gateway/opc-source-validator');
const { opcControlEntries } = require('./lib/opc');
const { zipStore } = require('./lib/zip');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { test, done, assert } = createSuite('XLSX sparse content, number formats and inert modern comments');
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const TC = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MS = 'http://schemas.microsoft.com/office/2017/10/relationships/';
const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos);/gu,
  entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]);
const reader = () => createXlsxReader(decode, { preserveText: true, contentMode: true });
const sheet = body => `<worksheet xmlns="${NS}"><sheetData>${body}</sheetData></worksheet>`;
const person = '{00000000-0000-0000-0000-000000000001}';
const first = '{00000000-0000-0000-0000-000000000002}';
const reply = '{00000000-0000-0000-0000-000000000003}';

for (const [raw, code, wanted] of [
  ['0.125', '0%', '13%'], ['0.125', '0.00%', '12.50%'],
  ['1234.5', '#,##0.00', '1,234.50'], ['-1234.5', '#,##0.00;[Red](#,##0.00)', '(1,234.50)'],
  ['12', '00000', '00012'], ['1.20', '0.##', '1.2'], ['1.2', '0.00', '1.20'],
  ['42', '0" kg"', '42 kg'], ['0.5', '0.0"% literal"', '0.5% literal'],
  ['12.5', '[$€-407] #,##0.00', '€ 12.50'], ['0', '0.0;[Red](0.0);"none"0', 'none0'],
  ['12345', '0.00E+00', '1.23E+04'], ['001234567890123456789', 'General', '001234567890123456789'],
  ['0.25', '0.0%', '25.0%'], ['-2.5', '0.00', '-2.50'], ['1.005', '0.00', '1.01'],
  ['-2.675', '0.00', '-2.68'], ['0.10005', '0.00%', '10.01%']
]) test(`bounded display ${raw} / ${code}`, () => assert.deepStrictEqual(formatXlsxNumber(raw, code), { text: wanted, unsupported: false }));

for (const [raw, code, date1904, wanted] of [
  ['1', 'yyyy-mm-dd', false, '1900-01-01'], ['59', 'yyyy-mm-dd', false, '1900-02-28'],
  ['60', 'yyyy-mm-dd', false, '1900-02-29'], ['61', 'yyyy-mm-dd', false, '1900-03-01'],
  ['0', 'yyyy-mm-dd', true, '1904-01-01'], ['1462', 'yyyy-mm-dd', false, '1904-01-01'],
  ['1.5', 'dd.mm.yyyy hh:mm:ss', false, '01.01.1900 12:00:00'],
  ['0.5', 'h:mm AM/PM', false, '12:00 PM'], ['0', 'h:mm AM/PM', false, '12:00 AM'],
  ['1.5', '[h]:mm:ss', false, '36:00:00'], ['1', 'd-mmm-yy', false, '1-Jan-00'],
  ['1', 'mmmm d, yyyy', false, 'January 1, 1900']
]) test(`date system and time ${raw}/${code}/${date1904}`, () => assert.equal(formatXlsxNumber(raw, code, { date1904 }).text, wanted));

for (const code of ['[>100]0;0', '# ?/?', '0.0,,', '[$-F800]dddd', 'ddddd', '0.00;"unclosed', '0.000000000000000000000', '##0.0E+0']) {
  test(`unsupported formatting retains source and code: ${code}`, () => {
    const value = formatXlsxNumber('123.25', code); assert.equal(value.unsupported, true);
    assert.ok(value.text.includes('123.25')); assert.ok(value.text.includes(code));
  });
}
test('a deliberately hidden zero remains visible as source with format disclosure', () => {
  assert.deepEqual(formatXlsxNumber('0', '0;;'), { text: '0 [Zahlenformat: 0;;]', unsupported: true });
});
test('non-numeric source is not coerced or evaluated', () => {
  const value = formatXlsxNumber('=WEBSERVICE("https://invalid.test")', '0%');
  assert.equal(value.unsupported, true); assert.ok(value.text.startsWith('=WEBSERVICE'));
});
test('styled empty rows are sparse records with exact logical coordinates', () => {
  const input = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>Äß标题</t></is></c></row>' +
    Array.from({ length: 10000 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="0"/></row>`).join('') +
    '<row r="10002"><c r="C10002"><v>0</v></c></row>');
  const parsed = reader().worksheet(input, []);
  assert.deepEqual(parsed.rowRecords.map(row => row.number), [1, 10002]);
  assert.equal(parsed.rowRecords[0].values[0], 'Äß标题'); assert.equal(parsed.rowRecords[1].values[2], '0');
});
test('style formats are namespace bound and date1904 is workbook specific', () => {
  const r = reader(), styles = r.styles(`<styleSheet xmlns="${NS}"><numFmts><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>` +
    '<cellStyleXfs><xf numFmtId="0"/></cellStyleXfs><cellXfs><xf numFmtId="0" xfId="0"/>' +
    '<xf numFmtId="164" xfId="0"/><xf numFmtId="14" xfId="0"/></cellXfs></styleSheet>');
  const parsed = r.worksheet(sheet('<row><c r="A1" s="1"><v>0.125</v></c><c r="B1" s="2"><v>0</v></c></row>'), [], { styles, date1904: true });
  assert.deepEqual(parsed.rowRecords[0].values, ['12.5%', '01-01-04']);
  assert.equal(r.workbookProperties(`<workbook xmlns="${NS}"><workbookPr date1904="1"/></workbook>`).date1904, true);
  assert.throws(() => r.styles('<styleSheet xmlns="urn:wrong"/>'), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  assert.throws(() => r.workbookProperties(`<workbook xmlns="${NS}"><workbookPr date1904="yes"/></workbook>`));
});
test('formulas keep literal text, formatted cache and missing-cache disclosure without execution', () => {
  const parsed = reader().worksheet(sheet('<row><c r="A1" s="1"><f>1/4</f><v>0.25</v></c>' +
    '<c r="B1"><f>WEBSERVICE("https://invalid.test")</f></c><c r="C1"><f t="shared" si="1"/></c></row>'), [], { styles: ['General', '0.0%'] });
  assert.equal(parsed.formulaCells, 3); assert.equal(parsed.missingFormulaCaches, 2);
  assert.ok(parsed.rowRecords[0].values[0].includes('25.0%'));
  assert.ok(parsed.rowRecords[0].values[1].includes('WEBSERVICE')); assert.ok(parsed.rowRecords[0].values[1].includes('nicht berechnet'));
  assert.ok(parsed.rowRecords[0].values[2].includes('gemeinsame/Array-Formel'));
});
test('explicit cell style overrides row style which overrides the bounded column style', () => {
  const xml = `<worksheet xmlns="${NS}"><cols><col min="1" max="3" style="1"/></cols><sheetData>` +
    '<row r="1"><c r="A1"><v>0.25</v></c></row><row r="2" s="2" customFormat="1">' +
    '<c r="A2"><v>0.25</v></c><c r="B2" s="1"><v>0.25</v></c></row></sheetData></worksheet>';
  const parsed = reader().worksheet(xml, [], { styles: ['General', '0%', '0.00'] });
  assert.equal(parsed.rowRecords[0].values[0], '25%');
  assert.deepEqual(parsed.rowRecords[1].values, ['0.25', '25%']);
});
test('invalid indexes, duplicate rows/cells and missing styles remain hard failures', () => {
  const r = reader();
  for (const body of ['<row r="1"/><row r="1"/>', '<row><c r="A1"/><c r="A1"/></row>',
    '<row><c r="XFE1"/></row>', '<row><c r="A1" s="-1"/></row>', '<row><c r="A1" s="4"><v>2</v></c></row>']) {
    assert.throws(() => r.worksheet(sheet(body), [], { styles: ['General'] }));
  }
});
test('unsupported style is explicit and shared/inline strings never become numbers', () => {
  const parsed = reader().worksheet(sheet('<row><c r="A1" s="1"><v>0.5</v></c><c r="B1" s="1" t="s"><v>0</v></c>' +
    '<c r="C1" s="1" t="inlineStr"><is><t>0.5</t></is></c></row>'), ['0.5'], { styles: ['General', '# ?/?'] });
  assert.equal(parsed.unsupportedNumberFormats, 1); assert.equal(parsed.rowRecords[0].values[1], '0.5');
  assert.equal(parsed.rowRecords[0].values[2], '0.5');
});

const personsXml = `<personList xmlns="${TC}"><person id="${person}" displayName="Prüfer Äß"/></personList>`;
const commentXml = (body = `<threadedComment ref="A2" personId="${person}" id="${first}"><text>Wichtiger Kontext</text></threadedComment>`) => `<ThreadedComments xmlns="${TC}">${body}</ThreadedComments>`;
test('modern comments retain cell, author, text and replies before their root', () => {
  const r = reader(), persons = r.modernPersons(personsXml);
  const values = r.threadedComments(commentXml(`<threadedComment personId="${person}" id="${reply}" parentId="${first}"><text>Antwort</text></threadedComment>` +
    `<threadedComment ref="A2" personId="${person}" id="${first}"><text>Original Äß</text></threadedComment>`), persons);
  assert.equal(values[0].ref, 'A2'); assert.equal(values[0].author, 'Prüfer Äß'); assert.equal(values[1].text, 'Original Äß');
});
test('modern comment role payload limits, namespace, unresolved author and cycles fail closed', () => {
  const r = reader(), persons = r.modernPersons(personsXml);
  assert.throws(() => r.modernPersons(personsXml.replace(TC, 'urn:wrong')));
  assert.throws(() => r.modernPersons(' '.repeat(2 * 1024 * 1024 + 1)), e => e.code === 'XLSX_STRUCTURE_LIMIT');
  for (const xml of [commentXml().replace(person, reply), commentXml().replace('ref="A2"', 'ref="XFE2"'),
    commentXml().replace('ref="A2"', 'ref="A1048577"'), commentXml().replace(`id="${first}"`, `id="${first}" parentId="${first}"`),
    commentXml().replace(first, 'not-a-guid')]) assert.throws(() => r.threadedComments(xml, persons));
});
function controls({ personOwner = 'xl/_rels/workbook.xml.rels', threadOwner = 'xl/worksheets/_rels/sheet1.xml.rels',
  personTarget = 'persons/person.xml', threadTarget = '../threadedComments/threadedComment1.xml',
  personType = `${MS}person`, threadType = `${MS}threadedComment`, mode = '', badType = false, outgoing = false } = {}) {
  const parts = new Map(opcControlEntries('xlsx', { additionalOverrides: [
    { part: 'xl/persons/person.xml', contentType: badType ? 'application/xml' : 'application/vnd.ms-excel.person+xml' },
    { part: 'xl/threadedComments/threadedComment1.xml', contentType: 'application/vnd.ms-excel.threadedcomments+xml' }
  ] }));
  const relationship = (type, target, id) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`;
  for (const [owner, type, target, id] of [[personOwner, personType, personTarget, 'p'], [threadOwner, threadType, threadTarget, 't']]) {
    const edge = relationship(type, target, id);
    parts.set(owner, parts.has(owner) ? parts.get(owner).replace('</Relationships>', `${edge}</Relationships>`)
      : `<Relationships xmlns="${R}">${edge}</Relationships>`);
  }
  const entries = new Set([...parts.keys(), 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/persons/person.xml', 'xl/threadedComments/threadedComment1.xml']);
  if (outgoing) entries.add('xl/persons/_rels/person.xml.rels');
  return { declaredType: 'xlsx', entries, controlParts: Object.fromEntries(parts) };
}
test('exact workbook-person / worksheet-thread internal typed bindings are admitted', () => {
  for (const mode of ['', 'Internal']) assert.equal(validateOpcControls(controls({ mode })).controls_verified, true);
});
for (const [name, change] of [
  ['wrong person owner', { personOwner: 'xl/worksheets/_rels/sheet1.xml.rels' }],
  ['wrong thread owner', { threadOwner: 'xl/_rels/workbook.xml.rels' }],
  ['wrong content type', { badType: true }], ['external', { mode: 'External' }],
  ['noncanonical mode', { mode: 'internal' }], ['unexpected outgoing role relationship', { outgoing: true }],
  ['URI lookalike', { threadType: `${MS}threadedComments` }],
  ['case-variant URI', { threadType: `${MS}ThreadedComment` }],
  ['wrong target', { personTarget: 'threadedComments/threadedComment1.xml' }],
  ['encoded traversal', { threadTarget: '%2e%2e/threadedComments/threadedComment1.xml' }]
]) test(`modern relationship rejects ${name}`, () => {
  for (const partialExtraction of [false, true]) assert.throws(() => validateOpcControls({ ...controls(change), partialExtraction }));
});
test('modern relationship admission cannot unlock Word or PowerPoint and never changes source controls', () => {
  const input = controls(), before = JSON.stringify(input.controlParts);
  validateOpcControls(input); assert.equal(JSON.stringify(input.controlParts), before);
  for (const declaredType of ['docx', 'pptx']) assert.throws(() => validateOpcControls({ ...input, declaredType }));
});
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function integrationWorkbook(rows, { styleXml, date1904 = false, modern = false, overrides = [] } = {}) {
  const partTypes = [['xl/worksheets/sheet1.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']];
  const relationships = [`<Relationship Id="s" Type="${OFFICE}/worksheet" Target="worksheets/sheet1.xml"/>`];
  const extras = [];
  if (styleXml) {
    partTypes.push(['xl/styles.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml']);
    relationships.push(`<Relationship Id="style" Type="${OFFICE}/styles" Target="styles.xml"/>`);
    extras.push(['xl/styles.xml', styleXml]);
  }
  if (modern) {
    partTypes.push(['xl/persons/person.xml', 'application/vnd.ms-excel.person+xml'],
      ['xl/threadedComments/threadedComment1.xml', 'application/vnd.ms-excel.threadedcomments+xml']);
    relationships.push(`<Relationship Id="person" Type="${MS}person" Target="persons/person.xml"/>`);
    extras.push(['xl/persons/person.xml', personsXml], ['xl/threadedComments/threadedComment1.xml', commentXml()],
      ['xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="tc" Type="${MS}threadedComment" Target="../threadedComments/threadedComment1.xml"/></Relationships>`]);
  }
  const parts = new Map([
    ...opcControlEntries('xlsx', { additionalOverrides: partTypes.map(([part, contentType]) => ({ part, contentType })) }),
    ['xl/workbook.xml', `<workbook xmlns="${NS}" xmlns:r="${OFFICE}"><workbookPr date1904="${date1904 ? '1' : '0'}"/>` +
      '<sheets><sheet name="Ledger Äß" sheetId="1" r:id="s"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${R}">${relationships.join('')}</Relationships>`],
    ['xl/worksheets/sheet1.xml', sheet(rows)], ...extras, ...overrides
  ]);
  return zipStore([...parts]);
}
function contentExtract(source, partialExtraction = false) {
  const before = Buffer.from(source), result = extractMarkdownBuffer(source, '.xlsx', { markdownOutput: 'content-v1', partialExtraction });
  assert.deepEqual(source, before); assert.equal(result.anonymized, false); assert.equal(result.coverage.status, 'incomplete'); return result;
}
test('content-v1 renderer skips ten thousand empty formatted rows but keeps both source coordinates', () => {
  const source = integrationWorkbook('<row r="1"><c r="A1" t="inlineStr"><is><t>First Äß</t></is></c></row>' +
    Array.from({ length: 10000 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}"/></row>`).join('') +
    '<row r="10002"><c r="XFD10002" t="inlineStr"><is><t>Last 中文</t></is></c></row>');
  const result = contentExtract(source);
  assert.ok(result.markdown.includes('Spalte 1 (A)')); assert.ok(result.markdown.includes('Spalte 16384 (XFD)'));
  assert.ok(result.markdown.includes('| 1 | First Äß |  |')); assert.ok(result.markdown.includes('| 10002 |  | Last 中文 |'));
  assert.ok(result.markdown.length < 500); assert.ok(!result.markdown.includes('| 2 |'));
});
test('content-v1 huge sparse row-column cross product stays sparse, not an allocation/coverage failure', () => {
  const source = integrationWorkbook(Array.from({ length: 1000 }, (_, i) => {
    let n = i + 1, col = ''; while (n) { col = String.fromCharCode(65 + (n - 1) % 26) + col; n = Math.floor((n - 1) / 26); }
    return `<row r="${i + 1}"><c r="${col}${i + 1}"><v>${i + 1}</v></c></row>`;
  }).join(''));
  const result = contentExtract(source);
  assert.ok(result.markdown.includes('Zeile 1000:')); assert.ok(result.markdown.includes('Spalte 1000 (ALL1000): 1000'));
  assert.ok(result.markdown.length < 100000);
});
test('content-v1 format projection preserves units, formula-cache warnings and workbook date system', () => {
  const styleXml = `<styleSheet xmlns="${NS}"><numFmts><numFmt numFmtId="164" formatCode="0.0%"/>` +
    '<numFmt numFmtId="165" formatCode="[$€-407] #,##0.00"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/>' +
    '<numFmt numFmtId="167" formatCode="# ?/?"/></numFmts><cellStyleXfs><xf numFmtId="0"/></cellStyleXfs><cellXfs>' +
    '<xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/>' +
    '<xf numFmtId="166" xfId="0"/><xf numFmtId="167" xfId="0"/></cellXfs></styleSheet>';
  const source = integrationWorkbook('<row r="1"><c r="A1" s="1"><v>0.125</v></c><c r="B1" s="2"><v>1234.5</v></c>' +
    '<c r="C1" s="3"><v>0</v></c><c r="D1"><f>WEBSERVICE("https://invalid.test")</f></c>' +
    '<c r="E1" s="4"><v>0.5</v></c></row>', { styleXml, date1904: true });
  const parsed = parseOoxml(source, '.xlsx', undefined, { preserveText: true, literalMarkup: true, contentMode: true });
  assert.ok(parsed.markdown.includes('12\\.5%')); assert.ok(parsed.markdown.includes('€ 1,234\\.50')); assert.ok(parsed.markdown.includes('1904-01-01'));
  assert.ok(parsed.markdown.includes('Gespeicherter Wert fehlt')); assert.ok(parsed.markdown.includes('Zahlenformat: \\# ?/?'));
  assert.ok(parsed.warnings.some(value => /ohne gespeicherten Wert/u.test(value)));
  assert.ok(parsed.warnings.some(value => /nicht vollständig dargestellte Zahlenformat/u.test(value)));
  assert.ok(contentExtract(source).markdown.includes('12\\.5%'));
});
test('notes-v1 legacy table/formula output is unchanged by content-v1 rendering', () => {
  const source = integrationWorkbook('<row r="1"><c r="B1"><f>1+1</f><v>2</v></c></row><row r="3"><c r="A3"><v>7</v></c></row>');
  const old = extractMarkdownBuffer(source, '.xlsx', { markdownOutput: 'notes-v1' });
  assert.equal(old.markdown, '# Arbeitsblatt: Ledger Äß\n\n| Spalte 1 | Spalte 2 |\n| --- | --- |\n' +
    '|  | Formel: 1\\+1<br>Gespeicherter Wert: 2 |\n|  |  |\n| 7 |  |');
  assert.ok(!old.markdown.includes('Quellzeile')); assert.ok(contentExtract(source).markdown.includes('Quellzeile'));
});
test('reached modern comment is extracted with author and source cell before privacy processing', () => {
  const source = integrationWorkbook('<row r="2"><c r="A2"><v>7</v></c></row>', { modern: true });
  const result = contentExtract(source);
  assert.ok(result.markdown.includes('Kommentare: Ledger Äß')); assert.ok(result.markdown.includes('Zelle A2 · Autor: Prüfer Äß'));
  assert.ok(result.markdown.includes('Wichtiger Kontext'));
});
test('canonical percent-encoded ordinary target characters keep the same bound modern text role', () => {
  const source = integrationWorkbook('<row r="2"><c r="A2"><v>7</v></c></row>', { modern: true, overrides: [
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="s" Type="${OFFICE}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="person" Type="${MS}person" Target="persons/%70erson.xml"/></Relationships>`]
  ] });
  assert.ok(contentExtract(source).markdown.includes('Wichtiger Kontext'));
});
test('orphan modern parts never enter content output or imply complete coverage', () => {
  const source = integrationWorkbook('<row r="1"><c r="A1"><v>7</v></c></row>', { overrides: [
    ['xl/persons/person.xml', personsXml.replace('Prüfer Äß', 'ORPHAN_AUTHOR_MUST_NOT_LEAK')],
    ['xl/threadedComments/threadedComment1.xml', commentXml().replace('Wichtiger Kontext', 'ORPHAN_TEXT_MUST_NOT_LEAK')]
  ] });
  const result = contentExtract(source); assert.ok(!result.markdown.includes('MUST_NOT_LEAK'));
});
test('invalid modern author mapping never returns that thread as a successful prefix', () => {
  const source = integrationWorkbook('<row r="2"><c r="A2"><v>7</v></c></row>', { modern: true,
    overrides: [['xl/persons/person.xml', personsXml.replace(person, reply)]] });
  assert.throws(() => contentExtract(source));
  const partial = contentExtract(source, true); assert.ok(!partial.markdown.includes('Wichtiger Kontext'));
  assert.ok(partial.markdown.includes('| 2 | 7 |')); assert.ok(partial.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
});
test('modern comment exposure cannot be authorized by a target type mismatch or alternate URI', () => {
  for (const [part, xml] of [
    ['xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="tc" Type="${MS}threadedComment" Target="../persons/person.xml"/></Relationships>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="s" Type="${OFFICE}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="person" Type="${MS}persons" Target="persons/person.xml"/></Relationships>`]
  ]) assert.throws(() => contentExtract(integrationWorkbook('<row><c r="A1"><v>1</v></c></row>', { modern: true, overrides: [[part, xml]] })));
});
done();
