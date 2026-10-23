'use strict';

// All fixtures are synthetic in-memory bytes passed through real ZIP/XML/CSV
// parsers. No paths, subprocesses, product state, keys or external runtime.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { xlsxCounterexample } = require('./lib/conversion-counterexamples');
const { extractMarkdownBuffer, extractOfficeMarkdownAndMedia, MarkdownExtractionError } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { createMarkdownExtraction, validateMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { appendOfficeOcr, preparePartialOfficeImagePlan } = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const { parseDocumentBuffer, parseCsvRows } = require('../plugins/data-secure/server/document-parser');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { officeContent } = require('../plugins/data-secure/server/standalone/markdown-output-profile');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const { unreadableSymbolRun, cleanOcrSymbolLines, visualNotices } = require('../plugins/data-secure/server/standalone/markdown-visuals');
const { test, done, assert } = createSuite('Content-preserving engineering Markdown extraction');

test('Standalone UTF-16 BOM inputs produce the same literal TXT/Markdown/CSV as UTF-8', () => {
  for (const [extension,text] of [['.txt','Name: Anna Berger\r\nÄÖÜß 😀\rEnde'],
    ['.md','# ÄÖÜß\r\n\nName: Anna Berger 😀'], ['.csv','Name;Fachtext\r\nAnna Berger;ÄÖÜß 😀']]) {
    for (const markdownOutput of [undefined,'notes-v1',...(extension === '.md' ? [] : ['content-v1'])]) {
      const options = markdownOutput ? {markdownOutput} : {};
      const expected = extractMarkdownBuffer(Buffer.from(text),extension,options);
      for (const endian of ['le','be']) {
        const encoded = Buffer.from(text,'utf16le'); if(endian === 'be') encoded.swap16();
        const bytes = Buffer.concat([Buffer.from(endian === 'le' ? [0xff,0xfe] : [0xfe,0xff]),encoded]);
        const original = Buffer.from(bytes);
        assert.deepEqual(extractMarkdownBuffer(bytes,extension,options),expected);
        assert.deepEqual(bytes,original);
      }
    }
  }
});

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (value) => `<w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
const paragraph = (value) => `<w:p>${run(value)}</w:p>`;
function docx(body, extra = []) {
  return zipStore([...new Map([
    ...opcControlEntries('docx'),
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`],
    ...extra
  ])]);
}
function xlsx(rows, extra = [], sheetAttrs = '') {
  return zipStore([...new Map([
    ...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Original Name" sheetId="1" r:id="s1" ${sheetAttrs}/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData>${rows}</sheetData></worksheet>`],
    ...extra
  ])]);
}
function pptx(extra = []) {
  return zipStore([...new Map([
    ...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide7.xml"/></Relationships>`],
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Before</a:t></a:r><a:r><a:t>After</a:t></a:r><a:br/><a:r><a:t>Next</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="n1" Type="${R}/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>`],
    ['ppt/notesSlides/notesSlide2.xml', `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>123456</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`],
    ...extra
  ])]);
}
function extract(value, extension) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const before = Buffer.from(buffer);
  const result = extractMarkdownBuffer(buffer, extension);
  assert.deepStrictEqual(buffer, before, 'original bytes remain untouched');
  assert.strictEqual(validateMarkdownExtraction(result), result);
  assert.strictEqual(result.anonymized, false);
  assert.strictEqual(result.processing_mode, 'markdown-only');
  return result;
}
function rejects(value, extension, code) {
  assert.throws(() => extractMarkdownBuffer(Buffer.isBuffer(value) ? value : Buffer.from(value), extension),
    (error) => error instanceof MarkdownExtractionError && error.code === code && !error.message.includes('SYNTHETIC_SECRET'));
}

for (const extension of ['.txt', '.md', '.markdown', '.MD']) {
  test(`${extension}: Unicode, line endings, names and credentials are not normalized or redacted`, () => {
    const source = '# Max Mustermann\r\nFirma: Muster GmbH\r\nA\u00a0B\u00adC e\u0301\u200b\t  \n`literal` IBAN: DE89370400440532013000';
    const result = extract(source, extension);
    assert.strictEqual(result.markdown, source);
    assert.deepStrictEqual(result.coverage, { status: 'complete', reason_codes: [] });
  });
}
test('UTF-8 BOM is treated as encoding metadata only', () => {
  assert.strictEqual(extract(Buffer.from('\ufeff  original\r\n'), '.txt').markdown, '  original\r\n');
});
test('anonymizing parser remains independently normalized', () => {
  const source = Buffer.from('A\u00a0B\u00adC e\u0301\r\n');
  assert.notStrictEqual(parseDocumentBuffer(source, '.md').markdown, extract(source, '.md').markdown);
});
test('invalid UTF-8 and forbidden controls stop without content-bearing error messages', () => {
  rejects(Buffer.from([0x53, 0xc0, 0xaf]), '.txt', 'TEXT_ENCODING_INVALID');
  rejects('SYNTHETIC_SECRET\0', '.md', 'TEXT_CONTROL_INVALID');
});
test('unsupported PDF and images do not imply OCR success', () => {
  for (const extension of ['.pdf', '.png', '.jpeg', '.jpg', '.bmp', '.exe']) rejects('SYNTHETIC_SECRET', extension, 'MARKDOWN_FORMAT_UNSUPPORTED');
});
test('empty and oversized sources are rejected by explicit resource codes', () => {
  rejects('', '.txt', 'INPUT_FILE_LIMIT');
  rejects(Buffer.alloc(RESOURCE_LIMITS.MAX_CSV_SOURCE_BYTES + 1, 0x61), '.csv', 'INPUT_FORMAT_LIMIT');
});

test('CSV keeps original duplicate/blank headers as ordinary values', () => {
  const result = extract(' Name ,Name,\n 001 ,0002,', '.csv');
  assert.strictEqual(result.markdown,
    '| Zeile | Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- | --- |\n' +
    '| 1 | &#32;Name&#32; | Name |  |\n| 2 | &#32;001&#32; | 0002 |  |');
  assert.strictEqual(result.coverage.status, 'complete');
});
test('CSV retains empty records without manufacturing a trailing phantom record', () => {
  const result = extract('A,B\r\n\r\nC,D\r\n', '.csv');
  assert.ok(result.markdown.includes('| 2 |  |  |'));
  assert.ok(result.markdown.includes('| 3 | C | D |'));
  assert.ok(!result.markdown.includes('| 4 |'));
  assert.deepStrictEqual(parseCsvRows('A\n\nB', ','), [['A'], ['B']], 'legacy behavior stays unchanged');
});
for (const delimiter of [',', ';', '\t']) {
  test(`CSV real dialect ${JSON.stringify(delimiter)} keeps all original rows`, () => {
    const result = extract(`First${delimiter}Second\r\nMax${delimiter}Company`, '.csv');
    assert.ok(result.markdown.includes('| 1 | First | Second |'));
    assert.ok(result.markdown.includes('| 2 | Max | Company |'));
  });
}
test('CSV quoted delimiters, multiline values, quotes and Unicode survive literally', () => {
  const result = extract('"A,B","C""D"\r\n"  e\u0301\u00a0X\r\nY\t ","<code>*literal*|_x_"', '.csv');
  assert.ok(result.markdown.includes('A,B | C"D'));
  assert.ok(result.markdown.includes('&#32;&#32;e\u0301\u00a0X&#13;<br>Y&#9;&#32;'));
  assert.ok(result.markdown.includes('&lt;code&gt;\\*literal\\*\\|\\_x\\_'));
});
test('CSV formulas and leading zeroes remain data and are never evaluated', () => {
  const result = extract('Code;Value\n0001;=1+1', '.csv');
  assert.ok(result.markdown.includes('0001 | =1\\+1'));
});
test('malformed quoting and nonblank ragged CSV rows stop explicitly', () => {
  rejects('Name,Value\nSYNTHETIC_SECRET,"unterminated', '.csv', 'CSV_QUOTE_INVALID');
  rejects('A,B\nC', '.csv', 'CSV_ROW_WIDTH_INVALID');
});
test('CSV escaping expansion stops instead of returning a truncated successful prefix', () => {
  rejects(','.repeat(450_000), '.csv', 'TEXT_TOO_LARGE');
});

test('DOCX literal Markdown/HTML and significant run whitespace are retained', () => {
  const result = extract(docx(paragraph('  Max  Mustermann\t<Code> *original* e\u0301\u00a0X\u00adY ')), '.docx');
  assert.strictEqual(result.coverage.status, 'complete');
  assert.ok(result.markdown.includes('&#32;&#32;Max &#32;Mustermann&#9;&lt;Code&gt; \\*original\\* e\u0301\u00a0X\u00adY&#32;'));
});
test('DOCX adjacent rich-text runs do not invent spaces or paragraphs', () => {
  assert.strictEqual(extract(docx(`<w:p>${run('Before')}${run('After')}</w:p>`), '.docx').markdown, 'BeforeAfter');
});
test('DOCX explicit breaks and blank paragraphs are not collapsed', () => {
  const result = extract(docx(`<w:p>${run('A')}<w:r><w:br/><w:br/><w:br/></w:r>${run('B')}</w:p><w:p/>${paragraph('C')}`), '.docx');
  assert.strictEqual(result.markdown, 'A  \n  \n  \nB\n\n\n\nC');
});
test('DOCX headerless table preserves all rows under a neutral positional header', () => {
  const result = extract(docx(`<w:tbl><w:tr><w:tc>${paragraph('Max')}</w:tc><w:tc>${paragraph('One')}</w:tc></w:tr><w:tr><w:tc>${paragraph('Ada')}</w:tc><w:tc>${paragraph('Two')}</w:tc></w:tr></w:tbl>`), '.docx');
  assert.strictEqual(result.markdown, '| Spalte 1 | Spalte 2 |\n| --- | --- |\n| Max | One |\n| Ada | Two |');
  assert.strictEqual(result.coverage.status, 'complete');
});
test('DOCX explicit single header is used without renaming its original labels', () => {
  const result = extract(docx(`<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${paragraph('Name')}</w:tc></w:tr><w:tr><w:tc>${paragraph('Max')}</w:tc></w:tr></w:tbl>`), '.docx');
  assert.strictEqual(result.markdown, '| Name |\n| --- |\n| Max |');
});
test('DOCX repeated header rows remain data instead of being merged or renamed', () => {
  const source=docx('<w:tbl>'+['HeadOne','HeadTwo','Data'].map((value,index)=>`<w:tr>${index<2?'<w:trPr><w:tblHeader/></w:trPr>':''}<w:tc>${paragraph(value)}</w:tc></w:tr>`).join('')+'</w:tbl>');
  assert.strictEqual(extract(source,'.docx').markdown,'| Spalte 1 |\n| --- |\n| HeadOne |\n| HeadTwo |\n| Data |');
});
test('DOCX namespace aliases remain supported in the preservation path', () => {
  const source=docx('',[['word/document.xml',`<d:document xmlns:d="${W}"><d:body><d:p><d:r><d:t>  Alias  </d:t></d:r></d:p></d:body></d:document>`]]);
  const result=extract(source,'.docx');
  assert.strictEqual(result.markdown,'&#32;&#32;Alias&#32;&#32;');
  assert.strictEqual(result.coverage.status,'complete');
});
test('DOCX embedded extraction retains whitespace but never implies complete attachment coverage', () => {
  const source=docx(paragraph('Outer'),[
    ['word/embeddings/nested.docx',docx(paragraph('  Nested  '))],
    ['word/_rels/document.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="nested" Type="${R}/package" Target="embeddings/nested.docx"/></Relationships>`]
  ]);
  const result=extract(source,'.docx');
  assert.ok(result.markdown.includes('&#32;&#32;Nested&#32;&#32;'));
  assert.strictEqual(result.coverage.status,'incomplete');
});
test('DOCX revisions, hidden text, symbols and unknown semantic nodes cannot claim completeness', () => {
  const cases = [
    `<w:ins>${paragraph('Revision')}</w:ins>`,
    `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>Hidden</w:t></w:r></w:p>`,
    `<w:p><w:r><w:sym w:font="Wingdings" w:char="F041"/></w:r></w:p>`,
    `<w:p><w:r><w:footnoteReference w:id="7"/></w:r></w:p>`
  ];
  for (const body of cases) {
    const result = extract(docx(paragraph('Control') + body), '.docx');
    assert.strictEqual(result.coverage.status, 'incomplete');
    assert.ok(result.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
  }
});
test('DOCX unknown content-bearing XML and invalid UTF-8 stop instead of dropping text', () => {
  rejects(docx('<w:unknown>SYNTHETIC_SECRET</w:unknown>'), '.docx', 'DOCX_STRUCTURE_UNSAFE');
  rejects(docx(paragraph('Valid'), [['word/document.xml', Buffer.from([0xc0, 0xaf])]]), '.docx', 'OOXML_ENCODING_INVALID');
});
test('DOCX foreign namespace and invalid merged cells remain fail-closed; valid grid spans retain text', () => {
  const foreign=extract(docx('', [['word/document.xml', '<w:document xmlns:w="urn:fake"><w:body><w:p><w:r><w:t>SYNTHETIC_SECRET</w:t></w:r></w:p></w:body></w:document>']]), '.docx');
  assert.strictEqual(foreign.coverage.status,'incomplete');
  const merged=extract(docx(`<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${paragraph('SYNTHETIC_SECRET')}</w:tc></w:tr></w:tbl>`),'.docx');
  assert.match(merged.markdown,/SYNTHETIC/u);
  rejects(docx(`<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="0"/></w:tcPr>${paragraph('SYNTHETIC_SECRET')}</w:tc></w:tr></w:tbl>`), '.docx', 'DOCX_STRUCTURE_UNSAFE');
});
test('DOCX media and external relationships cannot produce complete extraction', () => {
  const result = extract(docx(paragraph('Control'), [
    ['word/media/image1.png', Buffer.from([137, 80, 78, 71])],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="image1" Type="${R}/image" Target="media/image1.png"/></Relationships>`]
  ]), '.docx');
  assert.strictEqual(result.coverage.status, 'incomplete');
  assert.ok(result.coverage.reason_codes.includes('VISUAL_CONTENT_NOT_EXTRACTED'));
  assert.ok(result.markdown.includes('> Grafikhinweis: Die Grafik selbst ist nicht im Markdown enthalten.'));
  assert.ok(result.markdown.includes('Control'));
  assert.ok(!result.markdown.includes('image1.png'));
  assert.ok(!result.markdown.includes('data:image/'));
});

test('visual cleanup omits only undecodable symbol runs and never mathematical or meaningful Unicode text', () => {
  for (const value of ['\uE000', '\u{F0000}\u{100000}', ' \uFFFD\uE101\t ', '(\uE000)']) {
    assert.strictEqual(unreadableSymbolRun(value), true);
  }
  for (const value of ['Max Mustermann', 'Muster GmbH', '中文 العربية', 'x² = 4 → y', '☐ ☑ ✓ ❌',
    '© 2026 € 22,5', 'A\uE000B', '\uE000 42', '\uE000 →', '...', '']) {
    assert.strictEqual(unreadableSymbolRun(value), false, value);
  }
  const source = 'Max Mustermann\r\n \uE000\uE001 \r\n☐ Vorgang prüfen\n€ 1000\nMuster GmbH\uE002\n';
  assert.deepStrictEqual(cleanOcrSymbolLines(source), {
    text: 'Max Mustermann\r\n\r\n☐ Vorgang prüfen\n€ 1000\nMuster GmbH\uE002\n', omitted: true
  });
  assert.deepStrictEqual(cleanOcrSymbolLines('\uE000'), { text: '', omitted: true });
  assert.strictEqual(visualNotices(), '');
  assert.ok(visualNotices({ symbols: true }).includes('nicht als Text rekonstruiert'));
});

test('XLSX row 10001 is retained by both the existing and extraction renderers', () => {
  const source = xlsx(Array.from({ length: 10001 }, (_, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>ROW${index + 1}</t></is></c></row>`).join(''));
  assert.ok(parseOoxml(source, '.xlsx').markdown.includes('ROW10001'));
  const result = extract(source, '.xlsx');
  assert.ok(result.markdown.includes('ROW10001'));
  assert.strictEqual(result.coverage.status, 'incomplete');
});
test('XLSX column 101 is retained without a successful silent prefix', () => {
  const source = xlsx('<row r="1"><c r="CW1" t="inlineStr"><is><t>COLUMN101</t></is></c></row>');
  assert.ok(parseOoxml(source, '.xlsx').markdown.includes('COLUMN101'));
  assert.ok(extract(source, '.xlsx').markdown.includes('COLUMN101'));
});
test('XLSX real resource overflow stops before expanding a huge sparse table', () => {
  const source = xlsx(Array.from({ length: 200 }, (_, index) => `<row r="${index + 1}"><c r="XFD${index + 1}"><v>1</v></c></row>`).join(''));
  assert.throws(() => parseOoxml(source, '.xlsx'), (error) => error.code === 'XLSX_STRUCTURE_LIMIT');
  rejects(source, '.xlsx', 'XLSX_STRUCTURE_LIMIT');
});
test('XLSX formulas keep literal expression plus stored value and stay incomplete', () => {
  const result = extract(xlsx('<row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row>'), '.xlsx');
  assert.ok(result.markdown.includes('Formel: 1\\+1<br>Gespeicherter Wert: 2'));
  assert.strictEqual(result.coverage.status, 'incomplete');
});
test('XLSX invalid shared-string references stop rather than becoming numeric text', () => {
  rejects(xlsx('<row r="1"><c r="A1" t="s"><v>999</v></c></row>'), '.xlsx', 'XLSX_SHARED_STRING_INVALID');
});
test('XLSX empty cells, sparse rows, quote styles and both namespace families preserve exact coordinates', () => {
  for (const strict of [false, true]) for (const prefix of ['', 'sheet']) for (const quote of ['"', "'"]) {
    const result = extract(xlsxCounterexample({ strict, prefix, quote }), '.xlsx');
    assert.strictEqual(result.markdown, '# Arbeitsblatt: Ledger\n\n| Spalte 1 | Spalte 2 |\n| --- | --- |\n' +
      '| Debit | Credit |\n|  | 1000 |\n|  |  |\n|  | Original &amp; literal |\n|  | Max Mustermann |');
    assert.strictEqual(result.coverage.status, 'incomplete');
  }
});
test('XLSX comment and CDATA tokens cannot manufacture cells or change text order', () => {
  const result = extract(xlsx('<row r="1"><c r="A1" t="inlineStr"><is><t><![CDATA[A<c r="B1"/>]]><!-- ignored -->B</t></is></c><c r="B1"/></row>'), '.xlsx');
  assert.ok(result.markdown.includes('| A&lt;c r="B1"/&gt;B |  |'));
});
test('XLSX duplicate coordinates, invalid rows and foreign vocabulary never overwrite or reinterpret values', () => {
  for (const rows of ['<row r="1"><c r="A1"/><c r="A1"><v>5</v></c></row>',
    '<row r="1"><c r="B2"><v>5</v></c></row>', '<row r="2"/><row r="1"/>',
    '<row r="1"><c r="A0"><v>5</v></c></row>']) rejects(xlsx(rows), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
  rejects(xlsx('', [['xl/worksheets/sheet1.xml', '<worksheet xmlns="urn:foreign"/>']]), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
});
test('XLSX malformed XML in any part fails even after a complete first record', () => {
  const prefix = `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SYNTHETIC_SECRET</t></is></c></row>`;
  const damaged = [prefix, prefix + '<row r="2"><c r="B2"><v>1000</v></row></sheetData></worksheet>',
    prefix + '</sheetData></worksheet><worksheet/>', prefix + '<!-- broken -- comment --></sheetData></worksheet>',
    prefix + '<row r="2" r="3"/></sheetData></worksheet>', prefix + '<?xml version="1.0"?></sheetData></worksheet>'];
  for (const xml of damaged) rejects(xlsxCounterexample({ overrides: [['xl/worksheets/sheet1.xml', xml]] }), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
  for (const part of ['xl/workbook.xml', 'xl/sharedStrings.xml', 'xl/styles.xml', 'docProps/core.xml', 'xl/_rels/workbook.xml.rels']) {
    rejects(xlsxCounterexample({ overrides: [[part, '<root><complete/><truncated>']] }), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
  }
  rejects(xlsxCounterexample({ overrides: [['xl/styles.xml', '<!DOCTYPE root [<!ENTITY x "SYNTHETIC_SECRET">]><root/>']] }), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
  rejects(xlsxCounterexample({ overrides: [['xl/styles.xml', '<root xmlns:a="urn:a" xmlns:b="urn:a" a:x="1" b:x="2"/>']] }), '.xlsx', 'XLSX_STRUCTURE_UNSAFE');
});
test('XLSX XML depth and sparse output are bounded independently of ZIP integrity', () => {
  rejects(xlsxCounterexample({ overrides: [['xl/styles.xml', '<a>'.repeat(129) + '</a>'.repeat(129)]] }), '.xlsx', 'XLSX_STRUCTURE_LIMIT');
  rejects(xlsx('<row r="1048576"><c r="XFD1048576"><v>1</v></c></row>'), '.xlsx', 'XLSX_STRUCTURE_LIMIT');
});
test('XLSX hidden/namespace-incomplete semantics never pass a complete gate', () => {
  assert.strictEqual(extract(xlsx('<row r="9" hidden="1"><c r="A9"><v>7</v></c></row>', [], 'state="veryHidden"'), '.xlsx').coverage.status, 'incomplete');
  assert.strictEqual(extract(xlsx('', [['xl/worksheets/sheet1.xml', `<s:worksheet xmlns:s="${S}"><s:sheetData><s:row><s:c r="A1"><s:v>7</s:v></s:c></s:row></s:sheetData></s:worksheet>`]]), '.xlsx').coverage.status, 'incomplete');
});
test('PPTX preserves numeric notes and rich-text run order, labels source sequence not filename', () => {
  const result = extract(pptx(), '.pptx');
  assert.ok(result.markdown.startsWith('# Folie 1\n\nBeforeAfter  \nNext'));
  assert.ok(result.markdown.includes('## Notizen\n\n123456'));
  assert.strictEqual(result.coverage.status, 'incomplete');
});

test('PPTX slide lists and notes bind expanded XML names rather than prefix spellings', () => {
  for (const strict of [false, true]) for (const prefix of ['p', 'q', '']) for (const relationshipPrefix of ['r', 'rel']) {
    const p = strict ? 'http://purl.oclc.org/ooxml/presentationml/main' : P;
    const a = strict ? 'http://purl.oclc.org/ooxml/drawingml/main' : A;
    const r = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R;
    const tag = name => prefix ? `${prefix}:${name}` : name;
    const presentation = `<${tag('presentation')} xmlns${prefix ? `:${prefix}` : ''}="${p}" xmlns:${relationshipPrefix}="${r}"><${tag('sldIdLst')}><${tag('sldId')} id="256" ${relationshipPrefix}:id="s1"/></${tag('sldIdLst')}></${tag('presentation')}>`;
    const notes = `<q:notes xmlns:q="${p}" xmlns:d="${a}"><q:cSld><q:spTree><q:sp><q:txBody><d:p><d:r><d:t>Änne </d:t></d:r><d:fld id="x" type="slidenum"><d:t>Berger</d:t></d:fld><d:br/><d:r><d:t>123456</d:t></d:r></d:p></q:txBody></q:sp></q:spTree></q:cSld></q:notes>`;
    const bytes = pptx([['ppt/presentation.xml', presentation], ['ppt/notesSlides/notesSlide2.xml', notes]]);
    const original = Buffer.from(bytes);
    for (const markdownOutput of ['notes-v1', 'content-v1']) {
      const result = extractMarkdownBuffer(bytes, '.pptx', { markdownOutput, partialExtraction: true });
      assert.match(result.markdown, /BeforeAfter/u);
      assert.match(result.markdown, /Änne Berger[\s\S]*123456/u);
      assert.equal((result.markdown.match(/Änne Berger/gu) || []).length, 1);
    }
    assert.deepEqual(bytes, original);
  }
});

test('PPTX namespaced notes select one MC branch and never read foreign-owner lookalikes', () => {
  const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const paragraph = value => `<d:p><d:r><d:t>${value}</d:t></d:r></d:p>`;
  const notes = `<q:notes xmlns:q="${P}" xmlns:d="${A}" xmlns:mc="${mc}" xmlns:u="urn:unknown"><q:cSld><q:spTree><q:sp><q:txBody>` +
    `<mc:AlternateContent><mc:Choice Requires="d">${paragraph('SELECTED_NOTE')}</mc:Choice><mc:Fallback>${paragraph('NOT_SELECTED_NOTE')}</mc:Fallback></mc:AlternateContent>` +
    `<mc:AlternateContent><mc:Choice Requires="u">${paragraph('UNKNOWN_CHOICE')}</mc:Choice><mc:Fallback>${paragraph('FALLBACK_NOTE')}</mc:Fallback></mc:AlternateContent>` +
    `<u:p><d:r><d:t>FOREIGN_OWNER</d:t></d:r></u:p><u:container>${paragraph('FOREIGN_WRAPPER')}</u:container>` +
    `<d:p xmlns:d="urn:foreign"><d:r><d:t>WRONG_URI</d:t></d:r></d:p>` +
    `</q:txBody></q:sp></q:spTree></q:cSld></q:notes>`;
  const result = extractMarkdownBuffer(pptx([['ppt/notesSlides/notesSlide2.xml', notes]]), '.pptx',
    { markdownOutput: 'content-v1', partialExtraction: true });
  const literal = result.markdown.replace(/\\_/gu, '_');
  assert.match(literal, /SELECTED_NOTE[\s\S]*FALLBACK_NOTE/u);
  assert.doesNotMatch(literal, /NOT_SELECTED_NOTE|UNKNOWN_CHOICE|FOREIGN_OWNER|FOREIGN_WRAPPER|WRONG_URI/u);
});

test('PPTX slide references reject wrong URI, unqualified id and lookalike owners', () => {
  for (const list of [
    '<q:sldIdLst xmlns:q="urn:foreign"><q:sldId r:id="s1"/></q:sldIdLst>',
    '<p:sldIdLst><p:sldId id="s1"/></p:sldIdLst>',
    '<p:sldIdLst><p:sldId xmlns:r="urn:foreign" r:id="s1"/></p:sldIdLst>',
    '<p:sldIdLst><p:sldId r:id="s1" xmlns:t="http://purl.oclc.org/ooxml/officeDocument/relationships" t:id="s1"/></p:sldIdLst>',
    '<u:wrapper xmlns:u="urn:foreign"><p:sldIdLst><p:sldId r:id="s1"/></p:sldIdLst></u:wrapper>'
  ]) {
    const presentation = `<p:presentation xmlns:p="${P}" xmlns:r="${R}">${list}</p:presentation>`;
    const result = extractMarkdownBuffer(pptx([['ppt/presentation.xml', presentation]]), '.pptx',
      { markdownOutput: 'content-v1', partialExtraction: true });
    assert.equal(result.markdown, '');
    assert.equal(result.coverage.status, 'incomplete');
  }
});

test('PPTX slide-list MC choice is selected once and duplicate relationship ids cannot duplicate source text', () => {
  const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  for (const required of ['p', 'unknown']) {
    const chosen = '<p:sldIdLst><p:sldId id="256" r:id="s1"/><p:sldId id="257" r:id="s1"/></p:sldIdLst>';
    const ignored = '<p:sldIdLst><p:sldId id="258" r:id="missing"/></p:sldIdLst>';
    const main = `<p:presentation xmlns:p="${P}" xmlns:r="${R}" xmlns:mc="${mc}" xmlns:unknown="urn:unknown">` +
      `<mc:AlternateContent><mc:Choice Requires="${required}">${required === 'p' ? chosen : ignored}</mc:Choice>` +
      `<mc:Fallback>${required === 'p' ? ignored : chosen}</mc:Fallback></mc:AlternateContent></p:presentation>`;
    const result = extractMarkdownBuffer(pptx([['ppt/presentation.xml', main]]), '.pptx',
      { markdownOutput: 'content-v1', partialExtraction: true });
    assert.equal((result.markdown.match(/BeforeAfter/gu) || []).length, 1);
    assert.equal(result.coverage.status, 'incomplete');
  }
});

test('PPTX MC ignores unselected semantic subtrees and direct payload cannot acquire branch authority', () => {
  const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const declaration = `xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:mc="${mc}" xmlns:u="urn:unknown"`;
  const badChoice = '<mc:Choice Requires="u"><u:container><mc:Choice Requires="u"/></u:container></mc:Choice>';
  const fallback = '<p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst>';
  const main = `<p:presentation ${declaration}><mc:AlternateContent>` +
    '<p:sldIdLst><p:sldId id="257" r:id="missing"/></p:sldIdLst>' + badChoice +
    `<mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent></p:presentation>`;
  const notes = `<p:notes ${declaration}><p:cSld><p:spTree><p:sp><p:txBody><mc:AlternateContent>` +
    '<a:p><a:r><a:t>DIRECT_PAYLOAD</a:t></a:r></a:p>' + badChoice +
    '<mc:Fallback><a:p><a:r><a:t>SAFE_FALLBACK</a:t></a:r></a:p></mc:Fallback>' +
    '</mc:AlternateContent></p:txBody></p:sp></p:spTree></p:cSld></p:notes>';
  const result = extractMarkdownBuffer(pptx([['ppt/presentation.xml', main], ['ppt/notesSlides/notesSlide2.xml', notes]]), '.pptx',
    { markdownOutput: 'content-v1', partialExtraction: true });
  assert.match(result.markdown, /BeforeAfter/u);
  assert.match(result.markdown.replace(/\\_/gu, '_'), /SAFE_FALLBACK/u);
  assert.doesNotMatch(result.markdown.replace(/\\_/gu, '_'), /DIRECT_PAYLOAD/u);
});
test('PPTX malformed XML in any package part fails before returning a readable prefix', () => {
  for (const part of ['ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels',
    'ppt/slides/slide7.xml', 'ppt/slides/_rels/slide7.xml.rels', 'ppt/notesSlides/notesSlide2.xml']) {
    rejects(pptx([[part, '<root>SYNTHETIC_SECRET<truncated>']]), '.pptx', 'PPTX_STRUCTURE_UNSAFE');
  }
  rejects(pptx([['docProps/core.xml', '<!DOCTYPE root [<!ENTITY x "SYNTHETIC_SECRET">]><root/>']]),
    '.pptx', 'PPTX_STRUCTURE_UNSAFE');
});
test('PPTX XML depth is bounded independently of ZIP integrity', () => {
  rejects(pptx([['docProps/core.xml', '<a>'.repeat(129) + '</a>'.repeat(129)]]),
    '.pptx', 'PPTX_STRUCTURE_LIMIT');
});
test('malformed ZIP never returns a partial success or raw parser exception', () => {
  rejects('SYNTHETIC_SECRET', '.docx', 'MARKDOWN_EXTRACTION_FAILED');
});

const partialOptions = Object.freeze({ preserveText: true, literalMarkup: true, partialExtraction: true,
  referencedImagesOnly: true });
function damagedPayload(archive, name) {
  const copy = Buffer.from(archive);
  let offset = 0;
  while (copy.readUInt32LE(offset) === 0x04034b50) {
    const length = copy.readUInt16LE(offset + 26), extra = copy.readUInt16LE(offset + 28);
    const start = offset + 30 + length + extra, size = copy.readUInt32LE(offset + 18);
    if (copy.subarray(offset + 30, offset + 30 + length).toString('utf8') === name) {
      copy[start] ^= 1;
      return copy;
    }
    offset = start + size;
  }
  throw new Error('synthetic part missing');
}

test('explicit partial Office extraction keeps valid source text, never damaged image bytes or private reason details', () => {
  const archive = damagedPayload(docx(paragraph('Valid ä ö ü ß text'), [
    ['word/media/image1.png', 'SYNTHETIC_BROKEN_IMAGE']
  ]), 'word/media/image1.png');
  const before = Buffer.from(archive);
  const parsed = parseOoxml(archive, '.docx', undefined, partialOptions);
  assert.strictEqual(parsed.markdown, 'Valid ä ö ü ß text');
  assert.deepStrictEqual(parsed.attachments, []);
  assert.deepStrictEqual(parsed.partial_findings, [{ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 }]);
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
  assert.ok(!JSON.stringify(parsed.partial_findings).includes('SYNTHETIC'));
  const extracted = extractMarkdownBuffer(archive, '.docx', { partialExtraction: true, markdownOutput: 'content-v1' });
  assert.strictEqual(extracted.coverage.status, 'incomplete');
  assert.ok(extracted.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  assert.deepStrictEqual(archive, before);
  assert.throws(() => parseOoxml(archive, '.docx', undefined, { preserveText: true }));
});

test('partial DOCX retains an independent referenced header and main story after a malformed footer', () => {
  const archive = docx(paragraph('Body survives') + '<w:sectPr><w:headerReference r:id="h1"/><w:footerReference r:id="f1"/></w:sectPr>', [
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="h1" Type="${R}/header" Target="header1.xml"/><Relationship Id="f1" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}">${paragraph('Header survives')}</w:hdr>`],
    ['word/footer1.xml', `<w:ftr xmlns:w="${W}">${paragraph('SYNTHETIC_BAD_PREFIX')}<w:p>`]
  ]);
  const parsed = parseOoxml(archive, '.docx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('Body survives'));
  assert.ok(parsed.markdown.includes('Header survives'));
  assert.ok(!parsed.markdown.includes('SYNTHETIC_BAD_PREFIX'));
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('partial DOCX missing referenced header bytes never cause a TypeError or discard main and footer text', () => {
  const original = docx(paragraph('Main survives') + '<w:sectPr><w:headerReference r:id="h1"/><w:footerReference r:id="f1"/></w:sectPr>', [
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="h1" Type="${R}/header" Target="header1.xml"/><Relationship Id="f1" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}">${paragraph('SYNTHETIC_BAD_HEADER')}</w:hdr>`],
    ['word/footer1.xml', `<w:ftr xmlns:w="${W}">${paragraph('Footer survives')}</w:ftr>`]
  ]);
  const damaged = damagedPayload(original, 'word/header1.xml');
  const malformed = docx(paragraph('Main survives') + '<w:sectPr><w:headerReference r:id="h1"/><w:footerReference r:id="f1"/></w:sectPr>', [
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="h1" Type="${R}/header" Target="header1.xml"/><Relationship Id="f1" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}">${paragraph('SYNTHETIC_BAD_HEADER')}<w:p>`],
    ['word/footer1.xml', `<w:ftr xmlns:w="${W}">${paragraph('Footer survives')}</w:ftr>`]
  ]);
  for (const archive of [damaged, malformed]) {
    const parsed = parseOoxml(archive, '.docx', undefined, partialOptions);
    assert.ok(parsed.markdown.includes('Main survives'));
    assert.ok(parsed.markdown.includes('Footer survives'));
    assert.ok(!parsed.markdown.includes('SYNTHETIC_BAD_HEADER'));
    assert.deepStrictEqual(parsed.partial_findings, [{ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 }]);
  }
});

test('partial PPTX keeps only completely validated reachable slides and notes after malformed XML', () => {
  const archive = pptx([
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/><p:sldId id="257" r:id="s2"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide7.xml"/><Relationship Id="s2" Type="${R}/slide" Target="slides/slide8.xml"/></Relationships>`],
    ['ppt/slides/slide8.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><a:p><a:t>SYNTHETIC_BAD_PREFIX</a:t>`]
  ]);
  const parsed = parseOoxml(archive, '.pptx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('BeforeAfter'));
  assert.ok(parsed.markdown.includes('123456'));
  assert.ok(!parsed.markdown.includes('SYNTHETIC_BAD_PREFIX'));
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('partial Office recovery keeps XML invalidity scoped to an independent part and never accepts DTD or bad encoding text', () => {
  for (const source of [Buffer.from('<root><prefix>SYNTHETIC_BAD_PREFIX</prefix><unclosed>'),
    Buffer.from('<!DOCTYPE root [<!ENTITY x "SYNTHETIC_BAD_PREFIX">]><root>&x;</root>'),
    Buffer.from([0x3c, 0x78, 0x3e, 0xc3, 0x28, 0x3c, 0x2f, 0x78, 0x3e])]) {
    const parsed = parseOoxml(docx(paragraph('Valid body'), [['docProps/custom.xml', source]]),
      '.docx', undefined, partialOptions);
    assert.strictEqual(parsed.markdown, 'Valid body');
    assert.ok(!parsed.markdown.includes('SYNTHETIC_BAD_PREFIX'));
    assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
  }
  const parsed = parseOoxml(pptx([['ppt/notesSlides/notesSlide2.xml',
    `<p:wrong xmlns:p="${P}" xmlns:a="${A}"><a:p><a:r><a:t>SYNTHETIC_WRONG_ROOT</a:t></a:r></a:p></p:wrong>`]]),
    '.pptx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('BeforeAfter'));
  assert.ok(!parsed.markdown.includes('SYNTHETIC_WRONG_ROOT'));
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('partial XLSX does not guess shared strings but preserves independently valid inline-string worksheets', () => {
  const archive = xlsx('<row><c r="A1" t="inlineStr"><is><t>Inline survives</t></is></c></row>', [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Inline" sheetId="1" r:id="s1"/><sheet name="Dependent" sheetId="2" r:id="s2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="str" Type="${R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ['xl/worksheets/sheet2.xml', `<worksheet xmlns="${S}"><sheetData><row><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`],
    ['xl/sharedStrings.xml', `<sst xmlns="${S}"><si><t>SYNTHETIC_INVALID_STRING</t>`]
  ]);
  const parsed = parseOoxml(archive, '.xlsx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('Inline survives'));
  assert.ok(!parsed.markdown.includes('Dependent'));
  assert.ok(!parsed.markdown.includes('SYNTHETIC_INVALID_STRING'));
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('partial XLSX rejects one malformed coordinate atomically instead of leaking that worksheet prefix', () => {
  const archive = xlsx('<row><c r="A1" t="inlineStr"><is><t>Valid sheet</t></is></c></row>', [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Good" sheetId="1" r:id="s1"/><sheet name="Bad" sheetId="2" r:id="s2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`],
    ['xl/worksheets/sheet2.xml', `<worksheet xmlns="${S}"><sheetData><row><c r="A1" t="inlineStr"><is><t>SYNTHETIC_PREFIX</t></is></c><c r="A1"><v>7</v></c></row></sheetData></worksheet>`]
  ]);
  const parsed = parseOoxml(archive, '.xlsx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('Valid sheet'));
  assert.ok(!parsed.markdown.includes('SYNTHETIC_PREFIX'));
  assert.ok(!parsed.markdown.includes('# Arbeitsblatt: Bad'));
  assert.ok(parsed.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('partial parser quarantines external image references without following file or network targets', () => {
  for (const target of ['https://SYNTHETIC_SECRET.invalid/image.png', 'file:///SYNTHETIC_SECRET/image.png']) {
    const archive = docx(paragraph('Local body'), [['word/_rels/document.xml.rels',
      `<Relationships xmlns="${PR}"><Relationship Id="i1" Type="${R}/image" Target="${target}" TargetMode="External"/></Relationships>`]]);
    const parsed = parseOoxml(archive, '.docx', undefined, partialOptions);
    assert.ok(parsed.markdown.includes('Local body'));
    assert.deepStrictEqual(parsed.attachments, []);
    assert.deepStrictEqual(parsed.partial_findings, [{ reason: 'EXTERNAL_CONTENT_NOT_READ', count: 1 }]);
    assert.ok(!JSON.stringify(parsed.partial_findings).includes('SYNTHETIC_SECRET'));
  }
});

test('partial parser still refuses broken controls, broken main-part binding and global malformed containers', () => {
  const archive = docx(paragraph('Safe body'));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    assert.throws(() => parseOoxml(damagedPayload(archive, name), '.docx', undefined, partialOptions));
  }
  assert.throws(() => parseOoxml(Buffer.concat([archive, Buffer.from('trailing')]), '.docx', undefined, partialOptions));
  assert.throws(() => parseOoxml(docx(paragraph('Body'), [['_rels/.rels', '<Relationships><broken>']]),
    '.docx', undefined, partialOptions));
});

function budgetDocx(mainText, stories = []) {
  const reference = stories.map((story, index) => `<w:${story.kind}Reference r:id="s${index}"/>`).join('');
  const type = kind => `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`;
  return zipStore([
    ...opcControlEntries('docx', { additionalOverrides: stories.map(story => ({
      part: `word/${story.part}`, contentType: type(story.kind)
    })) }),
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${paragraph(mainText)}<w:sectPr>${reference}</w:sectPr></w:body></w:document>`],
    ...(stories.length ? [['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}">${stories.map((story, index) =>
      `<Relationship Id="s${index}" Type="${R}/${story.kind}" Target="${story.part}"/>`).join('')}</Relationships>`]] : []),
    ...stories.map(story => [`word/${story.part}`, `<w:${story.kind === 'header' ? 'hdr' : 'ftr'} xmlns:w="${W}">${paragraph(story.text)}</w:${story.kind === 'header' ? 'hdr' : 'ftr'}>`])
  ]);
}

function budgetXlsx(values) {
  return zipStore([
    ...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets>${values.map((_value, index) =>
      `<sheet name="Sheet${index + 1}" sheetId="${index + 1}" r:id="s${index}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}">${values.map((_value, index) =>
      `<Relationship Id="s${index}" Type="${R}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`],
    ...values.map((value, index) => [`xl/worksheets/sheet${index + 1}.xml`, `<worksheet xmlns="${S}"><sheetData><row><c r="A1" t="inlineStr"><is><t>${xml(value)}</t></is></c></row></sheetData></worksheet>`])
  ]);
}

test('partial DOCX caps whole sections during assembly instead of losing a valid 7.9M main story to its footer', () => {
  const source = budgetDocx('a'.repeat(7_900_000), [{ kind: 'footer', part: 'footer1.xml', text: 'b'.repeat(200_000) }]);
  const parsed = parseOoxml(source, '.docx', undefined, partialOptions);
  assert.strictEqual(parsed.markdown, 'a'.repeat(7_900_000));
  assert.deepStrictEqual(parsed.sections.map(section => section.source_part), ['word/document.xml']);
  assert.deepStrictEqual(parsed.partial_findings, [{ reason: 'TEXT_LIMIT_PARTIAL', count: 1 }]);
  for (const markdownOutput of ['content-v1', 'notes-v1']) {
    const extracted = extractMarkdownBuffer(source, '.docx', { partialExtraction: true, markdownOutput });
    assert.strictEqual(extracted.markdown, parsed.markdown);
    assert.ok(extracted.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
  }
  assert.ok(parseOoxml(source, '.docx', undefined, { preserveText: true, literalMarkup: true }).markdown.length > 8_000_000);
  rejects(source, '.docx', 'TEXT_TOO_LARGE');
});

test('partial XLSX retains one whole 4M sheet when two independently valid sheets exceed the document budget', () => {
  const source = budgetXlsx(['a'.repeat(4_000_000), 'b'.repeat(4_000_000)]);
  const parsed = parseOoxml(source, '.xlsx', undefined, partialOptions);
  assert.strictEqual(parsed.sections.length, 1);
  assert.strictEqual(parsed.sections[0].source_part, 'xl/worksheets/sheet1.xml');
  assert.ok(parsed.markdown.length < 8_000_000);
  assert.ok(!parsed.markdown.includes('b'.repeat(32)));
  assert.ok(parsed.warnings.includes('TEXT_LIMIT_PARTIAL'));
  const extracted = extractMarkdownBuffer(source, '.xlsx', { partialExtraction: true, markdownOutput: 'content-v1' });
  const contentParsed = parseOoxml(source, '.xlsx', undefined, { ...partialOptions, contentMode: true });
  assert.strictEqual(contentParsed.sections.length, 1);
  assert.strictEqual(contentParsed.sections[0].source_part, 'xl/worksheets/sheet1.xml');
  assert.ok(contentParsed.markdown.includes('Quellzeile'));
  assert.ok(!contentParsed.markdown.includes('b'.repeat(32)));
  assert.strictEqual(extracted.markdown, contentParsed.markdown);
  assert.ok(extracted.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
});

test('an over-budget middle story is omitted whole while a later small story still fits in source order', () => {
  const parsed = parseOoxml(budgetDocx('a'.repeat(7_900_000), [
    { kind: 'header', part: 'header1.xml', text: 'H'.repeat(200_000) },
    { kind: 'footer', part: 'footer1.xml', text: 'Z' }
  ]), '.docx', undefined, partialOptions);
  assert.deepStrictEqual(parsed.sections.map(section => section.source_part), ['word/document.xml', 'word/footer1.xml']);
  assert.ok(parsed.markdown.endsWith('\n\n## Fußzeile\n\nZ'));
  assert.ok(!parsed.markdown.includes('H'));
  assert.deepStrictEqual(parsed.partial_findings, [{ reason: 'TEXT_LIMIT_PARTIAL', count: 1 }]);
});

test('whole-section budget includes every two-character separator and preserves the exact 8M boundary', () => {
  for (const overflow of [0, 1]) {
    const main = 'a'.repeat(8_000_000 - 16 + overflow);
    const parsed = parseOoxml(budgetDocx(main, [{ kind: 'footer', part: 'footer1.xml', text: 'Z' }]),
      '.docx', undefined, partialOptions);
    assert.strictEqual(parsed.markdown, overflow ? main : `${main}\n\n## Fußzeile\n\nZ`);
    assert.strictEqual(parsed.markdown.length, overflow ? main.length : 8_000_000);
    assert.strictEqual(parsed.warnings.includes('TEXT_LIMIT_PARTIAL'), Boolean(overflow));
  }
  const source = budgetDocx('Original äöüß', [{ kind: 'footer', part: 'footer1.xml', text: 'Kleine Fußzeile' }]);
  assert.strictEqual(parseOoxml(source, '.docx', undefined, partialOptions).markdown,
    parseOoxml(source, '.docx', undefined, { preserveText: true, literalMarkup: true }).markdown);
});

test('actual content projection precedes budgeting and is idempotent at the chart-label boundary', () => {
  const make = value => pptx([
    ...opcControlEntries('pptx', { additionalOverrides: [{ part: 'ppt/charts/chart1.xml',
      contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' }] }),
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>BeforeAfter</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="c1"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="../charts/chart1.xml"/></Relationships>`],
    ['ppt/charts/chart1.xml', `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>${value}</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>1</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`]
  ]);
  const overhead = officeContent(parseOoxml(make('x'), '.pptx', undefined,
    { preserveText: true, literalMarkup: true }).sections).length - 1;
  const source = make('x'.repeat(8_000_000 - overhead));
  const content = parseOoxml(source, '.pptx', undefined, { ...partialOptions,
    sectionRenderer: section => officeContent([section]) });
  assert.strictEqual(content.markdown.length, 8_000_000);
  assert.strictEqual(officeContent(content.sections), content.markdown);
  assert.ok(content.sections.some(section => section.source_part === 'ppt/charts/chart1.xml'));
  assert.ok(!content.warnings.includes('TEXT_LIMIT_PARTIAL'));
  const notes = parseOoxml(source, '.pptx', undefined, partialOptions);
  assert.ok(!notes.sections.some(section => section.source_part === 'ppt/charts/chart1.xml'));
  assert.ok(notes.warnings.includes('TEXT_LIMIT_PARTIAL'));
});

test('parent embedding pushes share the document budget and never leave an isolated generated embedding header', () => {
  const nested = budgetXlsx(['N'.repeat(200_000)]);
  const make = value => pptx([
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${value}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="n1" Type="${R}/notesSlide" Target="../notesSlides/notesSlide2.xml"/><Relationship Id="e1" Type="${R}/package" Target="../embeddings/table.xlsx"/></Relationships>`],
    ['ppt/embeddings/table.xlsx', nested]
  ]);
  const parsed = parseOoxml(make('a'.repeat(7_900_000)), '.pptx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('123456'));
  assert.ok(!parsed.markdown.includes('Eingebettetes Dokument'));
  assert.ok(!parsed.markdown.includes('N'.repeat(32)));
  assert.ok(parsed.warnings.includes('TEXT_LIMIT_PARTIAL'));
  assert.ok(parsed.markdown.length < 8_000_000);
  const small = make('Kleine Folie');
  assert.strictEqual(parseOoxml(small, '.pptx', undefined, partialOptions).markdown,
    parseOoxml(small, '.pptx', undefined, { preserveText: true, literalMarkup: true }).markdown);
});

test('partial notes keep a full boundary-sized body even when the optional visual notice no longer fits', () => {
  const body = 'a'.repeat(8_000_000);
  const source = docx(paragraph(body), [
    ['word/media/image1.png', Buffer.from([137, 80, 78, 71])],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="image1" Type="${R}/image" Target="media/image1.png"/></Relationships>`]
  ]);
  const extracted = extractMarkdownBuffer(source, '.docx', { partialExtraction: true, markdownOutput: 'notes-v1' });
  assert.strictEqual(extracted.markdown, body);
  assert.ok(extracted.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
  assert.ok(extracted.coverage.reason_codes.includes('VISUAL_CONTENT_NOT_EXTRACTED'));
});

test('an omitted 8M slide cannot become a notice-only result while its separate OCR entrance stays recoverable', () => {
  const image = Buffer.from([137, 80, 78, 71]);
  const source = pptx([
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree>` +
      `<p:sp><p:txBody><a:p><a:r><a:t>${'a'.repeat(8_000_000)}</a:t></a:r></a:p></p:txBody></p:sp>` +
      '<p:pic><a:blip r:embed="i1"/></p:pic></p:spTree></p:cSld></p:sld>'],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}">` +
      `<Relationship Id="i1" Type="${R}/image" Target="../media/image1.png"/></Relationships>`],
    ['ppt/media/image1.png', image]
  ]);
  const before = Buffer.from(source);
  const parsed = parseOoxml(source, '.pptx', undefined, partialOptions);
  assert.strictEqual(parsed.sections.length, 0, 'the generated slide heading puts this whole section above 8M');
  assert.strictEqual(parsed.markdown, '');
  assert.strictEqual(parsed.attachments.length, 1);
  assert.ok(parsed.warnings.includes('TEXT_LIMIT_PARTIAL'));
  for (const markdownOutput of ['content-v1', 'notes-v1']) {
    assert.throws(() => extractMarkdownBuffer(source, '.pptx', { partialExtraction: true, markdownOutput }),
      error => error instanceof MarkdownExtractionError && error.code === 'TEXT_TOO_LARGE');
    const { extraction, attachments } = extractOfficeMarkdownAndMedia(source, '.pptx', {
      partialExtraction: true, markdownOutput
    });
    assert.strictEqual(extraction.markdown, '', 'neither the media entrance nor its native checkpoint may contain a generated notice');
    assert.strictEqual(extraction.coverage.status, 'incomplete');
    assert.ok(extraction.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
    assert.ok(extraction.coverage.reason_codes.includes('VISUAL_CONTENT_NOT_EXTRACTED'));
    assert.strictEqual(attachments.length, 1);
    assert.deepStrictEqual(Buffer.from(attachments[0].data, 'base64'), image);
    const content_options = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: true, imageOcr: true };
    assert.throws(() => appendOfficeOcr(extraction, [], content_options), error => error.code === 'CONVERSION_OCR_TEXT_EMPTY');
    // This is an already validated synthetic transcript, not a claim that OCR
    // ran here. The actual append path must still permit later real image text.
    const transcript = createMarkdownExtraction({ source_type: 'png', content_options,
      markdown: 'Synthetischer Rastertext', coverage: { status: 'incomplete',
        reason_codes: ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] } });
    const recovered = appendOfficeOcr(extraction, [transcript], content_options);
    assert.strictEqual(recovered.markdown, transcript.markdown);
    assert.ok(recovered.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
    assert.strictEqual(recovered.coverage.status, 'incomplete');
  }
  assert.deepStrictEqual(source, before);
});

function pictureOnlyPptx(extension, bytes, extra = []) {
  return pptx([
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree>` +
      '<p:pic><a:blip r:embed="i1"/></p:pic></p:spTree></p:cSld></p:sld>'],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}">` +
      `<Relationship Id="i1" Type="${R}/image" Target="../media/image1.${extension}"/></Relationships>`],
    [`ppt/media/image1.${extension}`, bytes],
    ...extra
  ]);
}

test('partial picture-only PPTX has no generated native text while its authorized raster plan remains available', () => {
  const white = encodePng({ width: 1, height: 1, rgba: Buffer.from([255,255,255,255]) });
  const contrast = encodePng({ width: 2, height: 1, rgba: Buffer.from([0,0,0,255,255,255,255,255]) });
  for (const [extension, bytes] of [['emf', Buffer.from('unsupported EMF')], ['png', white], ['png', contrast]]) {
    const source = pictureOnlyPptx(extension, bytes), before = Buffer.from(source);
    const parsed = parseOoxml(source, '.pptx', undefined, partialOptions);
    assert.strictEqual(parsed.markdown, '');
    assert.deepStrictEqual(parsed.sections, []);
    assert.strictEqual(parsed.attachments.length, 1, 'textless reached slide still owns its picture');
    for (const markdownOutput of ['content-v1', 'notes-v1']) {
      const { extraction, attachments } = extractOfficeMarkdownAndMedia(source, '.pptx', {
        partialExtraction: true, markdownOutput
      });
      assert.strictEqual(extraction.markdown, '', 'no Folie/Notizen/generated visual notice is source text');
      assert.strictEqual(attachments.length, 1);
      const plan = preparePartialOfficeImagePlan(attachments);
      assert.strictEqual(plan.length, 1);
      assert.strictEqual(plan[0].ordinal, 1);
      const content_options = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: true };
      const reason = extension === 'emf' ? 'IMAGE_CONTENT_DAMAGED' : 'OCR_TEXT_EMPTY';
      assert.deepStrictEqual(plan[0].bytes, bytes);
      if (extension === 'emf') {
        assert.strictEqual(plan[0].visual,true);
        assert.throws(()=>require('../plugins/data-secure/server/standalone/office-visual-decoder').inspectOfficeVisual(plan[0].bytes,'emf'),{code:'VISUAL_CONTENT_DAMAGED'});
      }
      const omitted = createMarkdownExtraction({ source_type: 'pptx', content_options, markdown: '',
        coverage: { status: 'incomplete', reason_codes: [reason] } });
      assert.throws(() => appendOfficeOcr(extraction, [omitted], content_options), error => error.code === 'CONVERSION_OCR_TEXT_EMPTY');
      // A validated synthetic image transcript proves the separate append
      // entrance still works. Actual recognition belongs to the native gate.
      if (extension === 'png') {
        const transcript = createMarkdownExtraction({ source_type: 'png', content_options,
          markdown: 'Synthetischer Bildtext äöüß', coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } });
        assert.strictEqual(appendOfficeOcr(extraction, [transcript], content_options).markdown, transcript.markdown);
      }
      for (const item of plan) item.bytes?.fill(0);
    }
    assert.deepStrictEqual(source, before);
    assert.strictEqual(parseOoxml(source, '.pptx', undefined, { preserveText: true, literalMarkup: true }).markdown,
      '# Folie 1\n\n', 'historical strict renderer retains its exact generated label');
  }
});

test('partial PPTX skips empty slide and note labels without deleting authored lookalike headings or changing source numbering', () => {
  const authored = '# Folie 1\n## Notizen';
  const source = pictureOnlyPptx('emf', Buffer.from('unsupported EMF'), [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/><p:sldId id="257" r:id="s2"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide7.xml"/><Relationship Id="s2" Type="${R}/slide" Target="slides/slide8.xml"/></Relationships>`],
    ['ppt/slides/slide8.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${authored}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="i1" Type="${R}/image" Target="../media/image1.emf"/><Relationship Id="n1" Type="${R}/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>`],
    ['ppt/notesSlides/notesSlide2.xml', `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`]
  ]);
  const parsed = parseOoxml(source, '.pptx', undefined, partialOptions);
  assert.deepStrictEqual(parsed.sections.map(section => section.source_part), ['ppt/slides/slide8.xml']);
  assert.strictEqual(parsed.markdown, '# Folie 2\n\n\\# Folie 1  \n\\#\\# Notizen');
  assert.strictEqual(parsed.attachments.length, 1);
  const legacy = parseOoxml(source, '.pptx', undefined, { preserveText: true, literalMarkup: true });
  assert.strictEqual(legacy.markdown, '# Folie 1\n\n\n\n## Notizen\n\n\n\n# Folie 2\n\n\\# Folie 1  \n\\#\\# Notizen');
});

test('partial textless PPTX owns only its reached embedding and never an orphan slide or chart package', () => {
  const reached = budgetXlsx(['REACHED_EMBEDDED_VALUE']), orphan = budgetXlsx(['ORPHAN_EMBEDDED_VALUE']);
  const source = pictureOnlyPptx('emf', Buffer.from('unsupported EMF'), [
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="i1" Type="${R}/image" Target="../media/image1.emf"/><Relationship Id="e1" Type="${R}/package" Target="../embeddings/reached.xlsx"/></Relationships>`],
    ['ppt/embeddings/reached.xlsx', reached],
    ['ppt/slides/slide99.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree/></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide99.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="e1" Type="${R}/package" Target="../embeddings/orphan.xlsx"/></Relationships>`],
    ['ppt/charts/chart99.xml', '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:v></c:v></c:chartSpace>'],
    ['ppt/charts/_rels/chart99.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="e1" Type="${R}/package" Target="../embeddings/orphan.xlsx"/></Relationships>`],
    ['ppt/embeddings/orphan.xlsx', orphan]
  ]);
  const parsed = parseOoxml(source, '.pptx', undefined, partialOptions);
  assert.ok(parsed.markdown.includes('REACHED\\_EMBEDDED\\_VALUE'));
  assert.ok(!parsed.markdown.includes('ORPHAN'));
  assert.ok(!parsed.sections.some(section => section.source_part === 'ppt/slides/slide7.xml'));
  assert.strictEqual(parsed.attachments.length, 1);
});

test('partial empty chart, layout, master and table labels cannot invent source text or revoke a reached chart embedding', () => {
  const source = pictureOnlyPptx('emf', Buffer.from('unsupported EMF'), [
    ...opcControlEntries('pptx', { additionalOverrides: [{ part: 'ppt/charts/chart1.xml',
      contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' }] }),
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide7.xml"/><Relationship Id="m1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><p:cSld><p:spTree><p:pic><a:blip r:embed="i1"/></p:pic><p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t></a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="c1"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="i1" Type="${R}/image" Target="../media/image1.emf"/><Relationship Id="c1" Type="${R}/chart" Target="../charts/chart1.xml"/><Relationship Id="l1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/charts/chart1.xml', '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart/></c:plotArea></c:chart></c:chartSpace>'],
    ['ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="m1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldMaster>`]
  ]);
  const parsed = parseOoxml(source, '.pptx', undefined, partialOptions);
  assert.strictEqual(parsed.markdown, '');
  assert.deepStrictEqual(parsed.sections, []);
  assert.strictEqual(parsed.attachments.length, 1);
  const legacy = parseOoxml(source, '.pptx', undefined, { preserveText: true, literalMarkup: true });
  for (const heading of ['# Folie 1', '## Tabelle', '## Diagrammdaten chart1.xml', '## Folienlayout slideLayout1.xml', '## Folienmaster slideMaster1.xml']) assert.ok(legacy.markdown.includes(heading));
  const nested = budgetXlsx(['REACHED_CHART_VALUE']);
  const withEmbedding = pictureOnlyPptx('emf', Buffer.from('unsupported EMF'), [
    ...require('../plugins/data-secure/server/zip-reader').readZip(source),
    ['ppt/charts/_rels/chart1.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="e1" Type="${R}/package" Target="../embeddings/chart.xlsx"/></Relationships>`],
    ['ppt/embeddings/chart.xlsx', nested]
  ]);
  const embedded = parseOoxml(withEmbedding, '.pptx', undefined, partialOptions);
  assert.ok(embedded.markdown.includes('REACHED\\_CHART\\_VALUE'));
  assert.ok(!embedded.markdown.includes('## Diagrammdaten'));
});

done();
