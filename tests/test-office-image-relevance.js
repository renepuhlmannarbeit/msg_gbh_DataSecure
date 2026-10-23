'use strict';

// Source-only independent relevance oracles. No native OCR or GUI evidence.
const assert = require('node:assert/strict');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const { extractOfficeMarkdownAndMedia, extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { appendOfficeOcr } = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const image = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
const relation = (kind, target, id = 'img') => `<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"/>`;
const relationships = rows => `<Relationships xmlns="${PR}">${rows}</Relationships>`;
function fixture(type, usage = 'visible', reachable = true) {
  let picture = usage === 'unused' ? '' : `<a:blip r:embed="${usage === 'wrong-id' ? 'other' : 'img'}"/>`;
  if (usage === 'comment') picture = `<!-- ${picture} -->`;
  if (usage === 'cdata') picture = `<![CDATA[${picture}]]>`;
  const a = usage === 'wrong-namespace' ? 'urn:not-drawingml' : A;
  const root = { docx: 'word', xlsx: 'xl', pptx: 'ppt' }[type];
  const images = relation('image', `${type === 'docx' ? '' : '../'}media/image.png`) +
    (usage === 'duplicate-id' ? relation('image', `${type === 'docx' ? '' : '../'}media/image.png`) : '');
  const entries = type === 'docx' ? [
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:a="${a}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>NATIVE ORIGINAL</w:t></w:r></w:p>${reachable ? `<w:p><w:r><w:drawing>${picture}</w:drawing></w:r></w:p>` : ''}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', relationships(reachable ? images : relation('header', 'header1.xml', 'head'))],
    ...(!reachable ? [['word/header1.xml', `<w:hdr xmlns:w="${W}" xmlns:a="${a}" xmlns:r="${R}"><w:p><w:r><w:drawing>${picture}</w:drawing></w:r></w:p></w:hdr>`],
      ['word/_rels/header1.xml.rels', relationships(images)]] : [])
  ] : type === 'xlsx' ? [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Tabelle" sheetId="1" r:id="sheet"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', relationships(relation('worksheet', 'worksheets/sheet1.xml', 'sheet'))],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}" xmlns:r="${R}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>NATIVE ORIGINAL</t></is></c></row></sheetData>${reachable ? '<drawing r:id="drawing"/>' : ''}</worksheet>`],
    ['xl/worksheets/_rels/sheet1.xml.rels', relationships(relation('drawing', '../drawings/drawing1.xml', 'drawing'))],
    ['xl/drawings/drawing1.xml', `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${a}" xmlns:r="${R}"><xdr:pic>${picture}</xdr:pic></xdr:wsDr>`],
    ['xl/drawings/_rels/drawing1.xml.rels', relationships(images)]
  ] : [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relationships(relation('slide', 'slides/slide1.xml', 'slide'))],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${a}" xmlns:t="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><t:p><t:r><t:t>NATIVE ORIGINAL</t:t></t:r></t:p></p:txBody></p:sp>${reachable ? `<p:pic>${picture}</p:pic>` : ''}</p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels', relationships(images)],
    ...(!reachable ? [['ppt/slides/slide2.xml', `<p:sld xmlns:p="${P}" xmlns:a="${a}" xmlns:r="${R}"><p:cSld><p:spTree><p:pic>${picture}</p:pic></p:spTree></p:cSld></p:sld>`],
      ['ppt/slides/_rels/slide2.xml.rels', relationships(images)]] : [])
  ];
  return zipStore([...opcControlEntries(type), ...entries, [`${root}/media/image.png`, image]]);
}
let passed = 0, failed = 0;
function test(label, fn) { try { fn(); passed++; console.log(`PASS ${label}`); } catch (error) { failed++; console.error(`FAIL ${label}: ${error.message}`); } }
for (const type of ['docx', 'xlsx', 'pptx']) {
  test(`${type}: actual image node remains available and extraction contains no image bytes`, () => {
    const source = fixture(type);
    const value = extractOfficeMarkdownAndMedia(source, `.${type}`, { markdownOutput: 'content-v1' });
    assert.equal(value.attachments.length, 1);
    assert.match(value.extraction.markdown, /NATIVE ORIGINAL/u);
    assert.equal(Object.hasOwn(value.extraction, 'attachments'), false);
    assert.deepEqual(value.extraction, extractMarkdownBuffer(source, `.${type}`, { markdownOutput: 'content-v1' }));
  });
  for (const usage of ['unused', 'wrong-id', 'wrong-namespace', 'comment', 'cdata', 'duplicate-id']) {
    test(`${type}: ${usage} media reference cannot enter the OCR plan`, () => {
      const source = fixture(type, usage);
      if (type === 'docx' && usage === 'cdata') {
        assert.throws(() => parseOoxml(source, '.docx', undefined, { preserveText: true }), { code: 'DOCX_STRUCTURE_UNSAFE' });
        assert.throws(() => extractOfficeMarkdownAndMedia(source, '.docx', { markdownOutput: 'content-v1' }), { code: 'DOCX_STRUCTURE_UNSAFE' });
        return;
      }
      const legacy = parseOoxml(source, `.${type}`, undefined, { preserveText: true, literalMarkup: true });
      assert.equal(legacy.attachments.length, 1, 'legacy parser behavior must remain unchanged');
      const value = extractOfficeMarkdownAndMedia(source, `.${type}`, { markdownOutput: 'content-v1' });
      assert.equal(value.attachments.length, 0);
      assert.match(value.extraction.markdown, /NATIVE ORIGINAL/u);
    });
  }
  test(`${type}: image node in unreachable story/drawing/slide cannot authorize media`, () => {
    const source = fixture(type, 'visible', false);
    assert.equal(parseOoxml(source, `.${type}`, undefined, { preserveText: true }).attachments.length, 1);
    assert.equal(extractOfficeMarkdownAndMedia(source, `.${type}`, { markdownOutput: 'content-v1' }).attachments.length, 0);
  });
}
test('DOCX: actual header reference authorizes its image, omitted header policy never does', () => {
  const source = zipStore([...opcControlEntries('docx'),
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>NATIVE ORIGINAL</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>`],
    ['word/_rels/document.xml.rels', relationships(relation('header', 'header1.xml', 'header'))],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}"><w:p><w:r><w:drawing><a:blip r:embed="img"/></w:drawing></w:r></w:p></w:hdr>`],
    ['word/_rels/header1.xml.rels', relationships(relation('image', 'media/image.png'))], ['word/media/image.png', image]]);
  assert.equal(extractOfficeMarkdownAndMedia(source, '.docx', { markdownOutput: 'content-v1' }).attachments.length, 1);
  assert.equal(extractOfficeMarkdownAndMedia(source, '.docx', { markdownOutput: 'content-v1', omitDocxHeaderFooter: true }).attachments.length, 0);
});
test('DOCX: only the actually referenced footnote ID authorizes image nodes in a shared story part', () => {
  const source = zipStore([...opcControlEntries('docx'),
    ['word/document.xml', `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>NATIVE ORIGINAL</w:t><w:footnoteReference w:id="5"/></w:r></w:p></w:body></w:document>`],
    ['word/_rels/document.xml.rels', relationships(relation('footnotes', 'footnotes.xml', 'notes'))],
    ['word/footnotes.xml', `<w:footnotes xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}">${[5, 7].map(id => `<w:footnote w:id="${id}"><w:p><w:r><w:drawing><a:blip r:embed="img${id}"/></w:drawing></w:r></w:p></w:footnote>`).join('')}</w:footnotes>`],
    ['word/_rels/footnotes.xml.rels', relationships([5, 7].map(id => relation('image', `media/image${id}.png`, `img${id}`)).join(''))],
    ['word/media/image5.png', image], ['word/media/image7.png', image]]);
  const actual = extractOfficeMarkdownAndMedia(source, '.docx', { markdownOutput: 'content-v1' });
  assert.equal(actual.attachments.length, 1); assert.equal(actual.attachments[0].source_part, 'word/media/image5.png');
  assert.equal(parseOoxml(source, '.docx', undefined, { preserveText: true }).attachments.length, 2);
});
test('internal relevance switch cannot be supplied through the public extraction options', () => {
  assert.throws(() => extractMarkdownBuffer(fixture('docx'), '.docx', { referencedImagesOnly: true }), { code: 'CONVERSION_INPUT_INVALID' });
  assert.throws(() => extractOfficeMarkdownAndMedia(fixture('docx'), '.docx', { referencedImagesOnly: true }), { code: 'CONVERSION_INPUT_INVALID' });
});
test('commented package-root relationship cannot authorize a source or media', () => {
  const controls = opcControlEntries('docx').map(([name, bytes]) => [name, name === '_rels/.rels'
    ? relationships(`<!-- ${relation('officeDocument', 'word/document.xml', 'main')} -->`) : bytes]);
  const source = zipStore([...controls,
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>NATIVE ORIGINAL</w:t><w:drawing><a:blip r:embed="img"/></w:drawing></w:r></w:p></w:body></w:document>`],
    ['word/_rels/document.xml.rels', relationships(relation('image', 'media/image.png'))], ['word/media/image.png', image]]);
  assert.equal(parseOoxml(source, '.docx', undefined, { preserveText: true }).attachments.length, 1);
  assert.equal(extractOfficeMarkdownAndMedia(source, '.docx', { markdownOutput: 'content-v1' }).attachments.length, 0);
});
const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: true };
const base = text => createMarkdownExtraction({ source_type: 'docx', markdown: text,
  coverage: { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED'] } });
const recognized = text => createMarkdownExtraction({ source_type: 'png', markdown: text, content_options: options,
  coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', ...(!text ? ['OCR_TEXT_EMPTY'] : []), 'VISUAL_CONTENT_NOT_EXTRACTED'] } });
test('decorative empty raster does not mark a native-text document as OCR-empty', () => {
  const result = appendOfficeOcr(base('NATIVE ORIGINAL'), [recognized('')], options);
  assert.equal(result.markdown, 'NATIVE ORIGINAL');
  assert.equal(result.coverage.status, 'incomplete');
  assert.equal(result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'), false);
  assert.equal(result.coverage.reason_codes.includes('OCR_NOT_VERIFIED'), true);
});
test('empty raster does not mark another successful OCR transcript as empty', () => {
  const result = appendOfficeOcr(base(''), [recognized(''), recognized('OCR ORIGINAL')], options);
  assert.equal(result.markdown, 'OCR ORIGINAL');
  assert.equal(result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'), false);
});
test('truly empty native and OCR content stops rather than publishing an empty success', () => {
  assert.throws(() => appendOfficeOcr(base(''), [recognized('')], options), { code: 'CONVERSION_OCR_TEXT_EMPTY' });
});
test('empty first raster preserves the subsequent contact ordinal and exact appended text offsets', () => {
  const text = 'qa77@quality.example.invalid';
  const contact = createMarkdownExtraction({ source_type: 'png', markdown: text, content_options: options,
    ocr_contacts: [{ start: 0, end: text.length, page: 1, line: 1, kind: 'email' }],
    coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] } });
  const result = appendOfficeOcr(base('NATIVE ORIGINAL'), [recognized(''), contact], options);
  assert.equal(result.ocr_contacts[0].page, 2);
  assert.equal(result.markdown.slice(result.ocr_contacts[0].start, result.ocr_contacts[0].end), text);
  assert.equal(result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'), false);
});
test('PPTX foreign prose is not promoted to native source text by prefix spelling',()=>{
  const {readZip}=require('../plugins/data-secure/server/zip-reader');
  const entries=readZip(fixture('pptx','wrong-namespace'));
  const part='ppt/slides/slide1.xml';
  entries.set(part,Buffer.from(entries.get(part).toString('utf8').replace(`xmlns:t="${A}"`,'xmlns:t="urn:foreign-text"')));
  const value=extractOfficeMarkdownAndMedia(zipStore([...entries]),'.pptx',{markdownOutput:'content-v1'});
  assert.equal(value.attachments.length,0);
  assert.doesNotMatch(value.extraction.markdown,/NATIVE ORIGINAL/u);
});
console.log(`${passed} passed, ${failed} failed; source-only, no native OCR or GUI run`);
if (failed) process.exitCode = 1;
