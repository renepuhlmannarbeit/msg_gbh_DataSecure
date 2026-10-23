'use strict';

const { createSuite } = require('./helpers');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { formatXlsxNumber } = require('../plugins/data-secure/server/xlsx-number-format');
const { xmlDecode } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { replayTransformTrace, entityPlanFromTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { test, testAsync, done, assert } = createSuite('XLSX typed comment escapes and exact date/duration counterregressions');
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

// Shared/inline x:t is itself ST_Xstring. Decode after one whole leaf's XML
// events, never after the rich-text runs have been joined or after Markdown.
function stringReader(kind, content, options = {}) {
  const r = createXlsxReader(xmlDecode, { preserveText: true, contentMode: true, ...options });
  if (kind === 'shared') return r.sharedStrings(`<sst xmlns="${S}"><si>${content}</si></sst>`)[0];
  return r.worksheet(`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is>${content}</is></c></row></sheetData></worksheet>`, []).rowRecords[0]?.values[0] ?? '';
}
for (const kind of ['shared', 'inline']) {
  for (const [encoded, wanted] of [
    ['Anna_x000D_Berger', 'Anna\rBerger'], ['A_x000A_B_x0009_C', 'A\nB\tC'],
    ['Ää Öö Üü ß 中文 العربية 😀', 'Ää Öö Üü ß 中文 العربية 😀'],
    ['_xD83D__xDE00_', '😀'], ['_x005F_x000D_', '_x000D_'],
    ['_x005f_x0000_', '_x0000_'], ['_x005F_xD800_', '_xD800_'],
    ['_x005f_x005F_', '_x005F_'], ['_X000D_ _xZZZZ_ _x000', '_X000D_ _xZZZZ_ _x000'],
    ['A &amp; B &#95;x000D_C', 'A & B \rC']
  ]) test(`${kind} schema-typed x:t single pass ${JSON.stringify(encoded)}`, () => {
    assert.equal(stringReader(kind, `<t xml:space="preserve">${encoded}</t>`), wanted);
  });
  test(`${kind} Xstring assembles CDATA/comments/entities inside one leaf before decoding`, () => {
    assert.equal(stringReader(kind, '<t>Name:_x00<![CDATA[0D]]>_Anna<!--boundary--> Berger &#95;x005F_x0000_</t>'),
      'Name:\rAnna Berger _x0000_');
  });
  test(`${kind} rich-text leaves cannot manufacture an escape across their boundary`, () => {
    assert.equal(stringReader(kind, '<r><t>Anna_x00</t></r><r><t>0D_Berger</t></r>'), 'Anna_x000D_Berger');
    assert.equal(stringReader(kind, '<r><t>_x005F_</t></r><r><t>x0000_</t></r>'), '_x0000_');
    assert.equal(stringReader(kind, '<r><t>Äß_x000D_</t></r><r><t>中文</t></r>'), 'Äß\r中文');
  });
  test(`${kind} schema text ignores foreign t and phonetic spelling, never decodes their escapes`, () => {
    assert.equal(stringReader(kind, '<t>Äß</t><rPh sb="0" eb="2"><t>_x0000_</t></rPh><x:t xmlns:x="urn:foreign">_x0000_</x:t>'), 'Äß');
  });
  test(`${kind} nested markup inside simple x:t is refused instead of hiding/joining text`, () => {
    assert.throws(() => stringReader(kind, '<t>_x00<foreign xmlns="urn:foreign"/>0D_</t>'), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  });
  test(`${kind} UTF-16 surrogate pair may cross XML events, not independent typed leaves`, () => {
    assert.equal(stringReader(kind, '<t>_xD83D_<![CDATA[_xDE00_]]></t>'), '😀');
    assert.throws(() => stringReader(kind, '<r><t>_xD83D_</t></r><r><t>_xDE00_</t></r>'), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  });
  for (const code of ['0000', '0001', '0008', '000B', '000C', '001F', '007F', '0085', '009F', 'D800', 'DC00', 'FFFE', 'FFFF']) {
    test(`${kind} decoded x:t character guard stays hard for _x${code}_`, () => {
      assert.throws(() => stringReader(kind, `<t>Anna_x${code}_Berger</t>`), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
    });
  }
  test(`${kind} raw source text budget is unchanged before shrinking escape decoding`, () => {
    assert.throws(() => stringReader(kind, `<t>${'a'.repeat(8000001)}</t>`), e => e.code === 'XLSX_STRUCTURE_LIMIT');
  });
}
test('namespace-free development text and formula syntax are not reinterpreted', () => {
  const legacy = createXlsxReader(xmlDecode);
  assert.deepEqual(legacy.sharedStrings('<sst><si><t>_x000D_</t></si></sst>'), ['_x000D_']);
  const legacySheet = legacy.worksheet('<worksheet><sheetData><row><c t="inlineStr"><is><t>_x000D_</t></is></c></row></sheetData></worksheet>', []);
  assert.equal(legacySheet.rows[0][0], '_x000D_');
  const legacyValue = legacy.worksheet('<worksheet><sheetData><row><c t="str"><v>_x000D_</v></c></row></sheetData></worksheet>', []);
  assert.equal(legacyValue.rows[0][0], '_x000D_');
  const parsed = reader().worksheet(`<worksheet xmlns="${S}"><sheetData><row r="1">` +
    '<c r="A1" t="str"><f>_x000D_</f><v>_x005F_x0000_</v></c><c r="B1" t="str"><v>_x000D_</v></c>' +
    '<c r="C1"><v>_x0031_</v></c></row></sheetData></worksheet>', []);
  assert.equal(parsed.formulaCells, 1); assert.equal(parsed.rowRecords[0].values[0], 'Formel: _x000D_\nGespeicherter Wert: _x0000_ (nicht neu berechnet)');
  assert.equal(parsed.rowRecords[0].values[1], '\r'); assert.equal(parsed.rowRecords[0].values[2], '1');
});
function valueReader(content, type, { namespace = S, formula = '', shared = [], formatting } = {}) {
  if (arguments.length < 2) type = 'str';
  const result = reader().worksheet(`<worksheet xmlns="${namespace}"><sheetData><row r="1">` +
    `<c r="A1"${type === undefined ? '' : ` t="${type}"`}>${formula}<v>${content}</v></c>` +
    '</row></sheetData></worksheet>', shared, formatting);
  return result;
}
for (const [encoded, wanted] of [
  ['Anna_x000D_Berger', 'Anna\rBerger'], ['Ää Öö Üü ß 中文 العربية 😀', 'Ää Öö Üü ß 中文 العربية 😀'],
  ['_xD83D__xDE00_', '😀'], ['_x005F_x000D_', '_x000D_'], ['_x005F_x0000_', '_x0000_'],
  ['_x005F_xD800_', '_xD800_'], ['_x005f_x005F_', '_x005F_'],
  ['_X000D_ _xZZZZ_', '_X000D_ _xZZZZ_'], ['A &amp; B &#95;x000D_C', 'A & B \rC'],
  ['Name:_x00<![CDATA[0D]]>_Anna<!--boundary--> Berger', 'Name:\rAnna Berger']
]) test(`cached x:v schema-typed single-pass ${JSON.stringify(encoded)}`, () => {
  for (const namespace of [S, 'http://purl.oclc.org/ooxml/spreadsheetml/main']) {
    assert.equal(valueReader(encoded, 'str', { namespace }).rowRecords[0].values[0], wanted);
  }
});
test('cached formula string decodes once while formula syntax remains literal and unevaluated', () => {
  const parsed = valueReader('Anna_x000D_Berger', 'str', { formula: '<f>"_x000D_"&amp;WEBSERVICE("https://invalid.test")</f>' });
  assert.equal(parsed.formulaCells, 1); assert.equal(parsed.missingFormulaCaches, 0);
  assert.equal(parsed.rowRecords[0].values[0], 'Formel: "_x000D_"&WEBSERVICE("https://invalid.test")\nGespeicherter Wert: Anna\rBerger (nicht neu berechnet)');
});
for (const code of ['0000', '0001', '0008', '000B', '000C', '001F', '007F', '0085', '009F', 'D800', 'DC00', 'FFFE', 'FFFF']) {
  test(`cached x:v decoded character policy remains hard for _x${code}_`, () => {
    assert.throws(() => valueReader(`Anna_x${code}_Berger`), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  });
}
for (const tag of ['v', 'f']) for (const child of ['<foreign xmlns="urn:foreign">SECRET</foreign>', '<v>SECRET</v>', '<f>SECRET</f>', '<t>SECRET</t>']) {
  test(`simple ${tag} refuses child payload ${child}`, () => {
    const body = tag === 'v' ? `<v>_x00${child}0D_</v>` : `<f>VISIBLE${child}AFTER</f><v>safe</v>`;
    assert.throws(() => reader().worksheet(`<worksheet xmlns="${S}"><sheetData><row><c t="str">${body}</c></row></sheetData></worksheet>`, []),
      e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  });
}
test('typed x:v decoding precedes but never replaces Boolean, shared-index and number interpretation', () => {
  const values = [
    ['n', '_x0031_.25', '1.25'], [undefined, '_x0030_.5', '0.5'], ['n', '-_x0032_e+3', '-2e+3'],
    ['b', '_x0031_', '1'], ['b', '_x0030_', '0'], ['b', '_x0074_rue', 'true'], ['b', 'false', 'false'],
    ['s', '_x0030_', 'SOURCE_STRING'], ['s', '0_x0030_', 'SOURCE_STRING'],
    ['e', '_x0023_REF!', '#REF!'], ['d', '_x0032_024-01-02T12:30:00Z', '2024-01-02T12:30:00Z']
  ];
  for (const [type, raw, wanted] of values) assert.equal(valueReader(raw, type, { shared: ['SOURCE_STRING'] }).rowRecords[0].values[0], wanted);
  const formatted = valueReader('_x0030_.125', 'n', { formatting: { styles: ['0.0%'] } });
  assert.equal(formatted.rowRecords[0].values[0], '12.5%'); assert.equal(formatted.unsupportedNumberFormats, 0);
});
for (const type of ['n', undefined, 'b', 's']) for (const value of ['_x0041_', '_x005F_x0031_', '_x000D_', 'NaN', '1.2.3', '']) {
  if (value === '' && (type === 'n' || type === undefined)) continue; // Existing empty numeric cache semantics.
  test(`invalid decoded ${type ?? 'default numeric'} x:v is not accepted: ${JSON.stringify(value)}`, () => {
    assert.throws(() => valueReader(value, type, { shared: ['SOURCE_STRING'] }),
      e => e.code === (type === 's' ? 'XLSX_SHARED_STRING_INVALID' : 'XLSX_STRUCTURE_UNSAFE'));
  });
}
test('x:v has its own 8M raw-text budget before any shrinking decoding', () => {
  assert.throws(() => valueReader('a'.repeat(8000001)), e => e.code === 'XLSX_STRUCTURE_LIMIT');
});
test('x:v/f namespaces, direct owner and duplicate-leaf guards remain closed', () => {
  const root = body => `<worksheet xmlns="${S}"><sheetData><row><c t="str">${body}</c></row></sheetData></worksheet>`;
  for (const body of ['<v>safe</v><v>SECRET</v>', '<f>safe</f><f>SECRET</f><v>value</v>']) {
    assert.throws(() => reader().worksheet(root(body), []), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
  }
  for (const body of ['<v xmlns="urn:foreign">_x0000_SECRET</v>', '<foreign xmlns="urn:foreign"><v xmlns="' + S + '">_x0000_SECRET</v></foreign>']) {
    assert.deepEqual(reader().worksheet(root(body), []).rowRecords, []);
  }
  assert.throws(() => valueReader('_x0000_', 'str', { namespace: 'urn:foreign' }), e => e.code === 'XLSX_STRUCTURE_UNSAFE');
});
function stringWorkbook(kind, encoded, { damagedSecond = false } = {}) {
  const cell = kind === 'shared' ? '<c r="A1" t="s"><v>0</v></c>' : kind === 'cached'
    ? `<c r="A1" t="str"><f>"cached source only"</f><v>${escape(encoded)}</v></c>`
    : kind === 'value' ? `<c r="A1" t="str"><v>${escape(encoded)}</v></c>`
    : `<c r="A1" t="inlineStr"><is><t>${escape(encoded)}</t></is></c>`;
  const extra = kind === 'shared' ? [['xl/sharedStrings.xml', `<sst xmlns="${S}"><si><t>${escape(encoded)}</t></si></sst>`]] : [];
  const overrides = [{ part: 'xl/worksheets/sheet1.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }];
  if (kind === 'shared') overrides.push({ part: 'xl/sharedStrings.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml' });
  if (damagedSecond) overrides.push({ part: 'xl/worksheets/sheet2.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' });
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: overrides }),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${O}"><sheets><sheet name="_x000D_" sheetId="1" r:id="s"/>${damagedSecond ? '<sheet name="Independent" sheetId="2" r:id="safe"/>' : ''}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${R}"><Relationship Id="s" Type="${O}/worksheet" Target="worksheets/sheet1.xml"/>${kind === 'shared' ? `<Relationship Id="strings" Type="${O}/sharedStrings" Target="sharedStrings.xml"/>` : ''}${damagedSecond ? `<Relationship Id="safe" Type="${O}/worksheet" Target="worksheets/sheet2.xml"/>` : ''}</Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1">${cell}</row></sheetData></worksheet>`], ...extra,
    ...(damagedSecond ? [['xl/worksheets/sheet2.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FHIR</t></is></c></row></sheetData></worksheet>`]] : [])]);
}
for (const kind of ['shared', 'inline', 'cached', 'value']) {
  for (const profile of ['general', 'personnel_profile']) testAsync(`${kind}/${profile} real original OPC→MD→PII decodes before privacy with source bytes unchanged`, async () => {
    const input = stringWorkbook(kind, 'Name: Anna_x000D_Berger'), before = Buffer.from(input);
    const result = extracted(input);
    assert.ok(!result.markdown.includes('Anna\\_x000D')); assert.ok(result.markdown.includes('Anna&#13;Berger'));
    // Production table privacy first resolves the parser's literal GFM and
    // source field context. A direct anonymizeMarkdown call skips that step.
    const source = await extractSourceForPrivacy(input, '.xlsx', { contentOptions: privacyOptions.contentOptions,
      convertBuffer: async bytes => {
        assert.deepEqual(bytes, before);
        const actual = extracted(bytes);
        return createMarkdownExtraction({ source_type: 'xlsx', markdown: actual.markdown,
          coverage: actual.coverage, content_options: privacyOptions.contentOptions });
      } });
    const prepared = prepareTextPrivacyReview({ text: source.markdown, profile, productChannel: 'standalone',
      consumerOptions: privacyOptions, registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    assert.ok(verifyAnonymizedPublication({ markdown: final.markdown, profile, content_options: privacyOptions.contentOptions,
      source_extraction: source.sourceExtraction, dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor,
      reviewed_person_candidates: final.reviewed_person_candidates }));
    for (const word of ['Anna', 'Berger']) assert.ok(!final.markdown.includes(word), `${word} must not survive: ${JSON.stringify({ source: source.markdown, output: final.markdown })}`);
    assert.ok(/\[(?:PERSON_[0-9]+|FIELD_REDACTED)\]/u.test(final.markdown));
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    assert.ok(entityPlanFromTrace(final.transform_trace).occurrences.some(row => /Anna|Berger/u.test(row.original)));
    assert.deepEqual(input, before);
  });
  test(`${kind} protected literal remains literal after actual extraction and never gains a second decoding`, () => {
    const result = extracted(stringWorkbook(kind, '_x005F_x000D_'));
    assert.ok(result.markdown.includes('\\_x000D\\_')); assert.ok(!result.markdown.includes('&#13;'));
    if (kind !== 'cached') assert.ok(!result.markdown.includes('<br>')); // Formula wrapper adds its own disclosed LF.
    // Sheet name is a different field; this narrow change never decodes it.
    assert.ok(result.markdown.includes('# Arbeitsblatt: \\_x000D\\_'));
  });
  test(`${kind} invalid decoded text omits its atomic part, not a successful source prefix`, () => {
    const input = stringWorkbook(kind, 'Name: Anna_x0000_Berger', { damagedSecond: true });
    assert.throws(() => extractMarkdownBuffer(input, '.xlsx', { markdownOutput: 'content-v1' }));
    const partial = extracted(input);
    assert.ok(partial.markdown.includes('FHIR')); assert.ok(!partial.markdown.includes('Anna')); assert.ok(!partial.markdown.includes('Berger'));
    assert.ok(partial.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  });
  test(`${kind} notes-v1 uses the same decoded original text without changing ordinary layout`, () => {
    const result = extractMarkdownBuffer(stringWorkbook(kind, 'Name: Anna_x000D_Berger'), '.xlsx', { markdownOutput: 'notes-v1' });
    assert.ok(result.markdown.includes('Name: Anna&#13;Berger')); assert.ok(!result.markdown.includes('Anna_x000D'));
  });
}
test('CSV/MD literal escape-like text is never given SpreadsheetML authority', () => {
  for (const [extension, value] of [['.csv', 'Name,Code\nAnna,_x000D_\n'], ['.md', '_x000D_ / _x005F_x0000_']]) {
    // Raw MD content conversion belongs to the worker, so direct notes mode
    // is the correct literal parser entrance for this scope assertion.
    const result = extractMarkdownBuffer(Buffer.from(value), extension, { markdownOutput: extension === '.md' ? 'notes-v1' : 'content-v1' });
    assert.ok(result.markdown.includes('x000D')); assert.ok(!result.markdown.includes('\r'));
  }
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
