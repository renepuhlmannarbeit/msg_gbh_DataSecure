'use strict';

// All fixtures are synthetic in-memory bytes passed through real ZIP/XML/CSV
// parsers. No paths, subprocesses, product state, keys or external runtime.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractMarkdownBuffer, MarkdownExtractionError } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { validateMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { parseDocumentBuffer, parseCsvRows } = require('../plugins/data-secure/server/document-parser');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const { test, done, assert } = createSuite('Content-preserving engineering Markdown extraction');

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
function pptx() {
  return zipStore([
    ...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide7.xml"/></Relationships>`],
    ['ppt/slides/slide7.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Before</a:t></a:r><a:r><a:t>After</a:t></a:r><a:br/><a:r><a:t>Next</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide7.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="n1" Type="${R}/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>`],
    ['ppt/notesSlides/notesSlide2.xml', `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>123456</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`]
  ]);
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
test('DOCX malformed/foreign namespace and merged cells remain fail-closed', () => {
  const foreign=extract(docx('', [['word/document.xml', '<w:document xmlns:w="urn:fake"><w:body><w:p><w:r><w:t>SYNTHETIC_SECRET</w:t></w:r></w:p></w:body></w:document>']]), '.docx');
  assert.strictEqual(foreign.coverage.status,'incomplete');
  rejects(docx(`<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${paragraph('SYNTHETIC_SECRET')}</w:tc></w:tr></w:tbl>`), '.docx', 'DOCX_STRUCTURE_UNSAFE');
});
test('DOCX media and external relationships cannot produce complete extraction', () => {
  const result = extract(docx(paragraph('Control'), [
    ['word/media/image1.png', Buffer.from([137, 80, 78, 71])],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="image1" Type="${R}/image" Target="media/image1.png"/></Relationships>`]
  ]), '.docx');
  assert.strictEqual(result.coverage.status, 'incomplete');
  assert.ok(result.coverage.reason_codes.includes('VISUAL_CONTENT_NOT_EXTRACTED'));
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
test('malformed ZIP never returns a partial success or raw parser exception', () => {
  rejects('SYNTHETIC_SECRET', '.docx', 'MARKDOWN_EXTRACTION_FAILED');
});

done();
