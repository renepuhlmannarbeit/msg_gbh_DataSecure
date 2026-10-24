'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readZip } = require('../plugins/data-secure/server/zip-reader');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { readXlsxSheetContext, readXlsxTableContext, createXlsxContextSession, MIME } = require('../plugins/data-secure/server/xlsx-content-context');
const { extractMarkdownBuffer, extractOfficeMarkdownAndMedia } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { appendOfficeOcr } = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');

const X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const rels = body => `<Relationships xmlns="${PKG}">${body}</Relationships>`;
const relation = (id, kind, target) => `<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"/>`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const opts = { markdownOutput: 'content-v1', partialExtraction: true };
let passed = 0;
function test(name, fn) { fn(); console.log(`PASS ${++passed} ${name}`); }

class ObservedMap extends Map {
  relationshipGets = 0;
  payloadGets = 0;
  get(key) {
    if (typeof key === 'string' && key.endsWith('.rels')) this.relationshipGets++;
    if (typeof key === 'string' && /\/(?:sheet|table)\d+\.xml$/u.test(key)) this.payloadGets++;
    return super.get(key);
  }
}

function workbook(count = 1) {
  const entries = new ObservedMap(), types = [], sheets = [], edges = [];
  types.push(`<Override PartName="/xl/workbook.xml" ContentType="${MIME.workbook}"/>`);
  for (let i = 1; i <= count; i++) {
    types.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="${MIME.worksheet}"/><Override PartName="/xl/tables/table${i}.xml" ContentType="${MIME.table}"/>`);
    sheets.push(`<sheet name="Quelle${i}" sheetId="${i}" r:id="s${i}"/>`);
    edges.push(relation(`s${i}`, 'worksheet', `worksheets/sheet${i}.xml`));
    entries.set(`xl/worksheets/sheet${i}.xml`, Buffer.from(`<worksheet xmlns="${X}" xmlns:r="${R}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Qvx</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="t"/></tableParts></worksheet>`));
    entries.set(`xl/worksheets/_rels/sheet${i}.xml.rels`, Buffer.from(rels(relation('t', 'table', `../tables/table${i}.xml`))));
    entries.set(`xl/tables/table${i}.xml`, Buffer.from(`<table xmlns="${X}" id="${i}" name="T${i}" displayName="T${i}" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="Name"/></tableColumns></table>`));
  }
  entries.set('[Content_Types].xml', Buffer.from(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types.join('')}</Types>`));
  entries.set('xl/workbook.xml', Buffer.from(`<workbook xmlns="${X}" xmlns:r="${R}"><sheets>${sheets.join('')}</sheets></workbook>`));
  entries.set('xl/_rels/workbook.xml.rels', Buffer.from(rels(edges.join(''))));
  return entries;
}

for (const count of [10, 20, 40, 80]) test(`private session reads each control relationship once across both phases, ${count} sheets`, () => {
  const entries = workbook(count), session = createXlsxContextSession(entries);
  const indexes = [];
  for (let i = 1; i <= count; i++) {
    const options = { sheetPart: `xl/worksheets/sheet${i}.xml` };
    const first = session.readTableContext(options), full = session.readSheetContext(options);
    assert.equal(first.tables[0].columns[0].name, 'Name');
    assert.deepEqual(first.tables, full.tables);
    assert.ok(Object.isFrozen(first.ownerIndexParts));
    indexes.push(first.ownerIndexParts);
  }
  assert.equal(entries.relationshipGets, count + 1);
  assert.equal(entries.payloadGets, count * 4); // both payload trees are transient in each phase
  assert.equal(indexes[0], indexes.at(-1)); // no S-sized index array copy per sheet
});

test('public helper calls never reuse CT/relationship authority after Map replacement', () => {
  for (const read of [readXlsxTableContext, readXlsxSheetContext]) {
    const entries = workbook(), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
    assert.equal(read(entries, options).tables.length, 1);
    entries.set('[Content_Types].xml', Buffer.from(entries.get('[Content_Types].xml').toString().replace(MIME.table, 'application/xml')));
    assert.throws(() => read(entries, options), { code: 'XLSX_STRUCTURE_UNSAFE' });
  }
});

test('public helpers reparse in-place changed control buffers, not just object identity', () => {
  const entries = workbook(), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
  assert.equal(readXlsxTableContext(entries, options).tables.length, 1);
  entries.get('xl/worksheets/_rels/sheet1.xml.rels').fill(0);
  assert.throws(() => readXlsxTableContext(entries, options), { code: 'XLSX_STRUCTURE_UNSAFE' });
});

test('parser quarantine invalidation revokes cached MIME and duplicate-owner indexes', () => {
  for (const mutate of [
    entries => entries.set('[Content_Types].xml', Buffer.from(entries.get('[Content_Types].xml').toString().replace(MIME.table, 'application/xml'))),
    entries => entries.set('xl/worksheets/_rels/sheet2.xml.rels', Buffer.from(rels(relation('t', 'table', '../tables/table1.xml')))),
    entries => entries.get('xl/_rels/workbook.xml.rels').fill(0)
  ]) {
    const entries = workbook(2), session = createXlsxContextSession(entries), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
    assert.equal(session.readTableContext(options).tables.length, 1);
    mutate(entries); session.invalidate();
    assert.throws(() => session.readTableContext(options), { code: 'XLSX_STRUCTURE_UNSAFE' });
  }
});

test('selected worksheet and TablePart payload ASTs are not retained between phase reads', () => {
  for (const part of ['xl/worksheets/sheet1.xml', 'xl/tables/table1.xml']) {
    const entries = workbook(), session = createXlsxContextSession(entries), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
    assert.equal(session.readTableContext(options).tables.length, 1);
    entries.get(part).fill(0);
    assert.throws(() => session.readSheetContext(options), { code: 'XLSX_STRUCTURE_UNSAFE' });
  }
});

test('Table-only owner authority is separate from a failed full optional-comment graph', () => {
  const entries = workbook(2);
  entries.set('xl/worksheets/_rels/sheet2.xml.rels', Buffer.from(rels(relation('t', 'table', '../tables/table2.xml') + relation('c', 'comments', '../comments2.xml'))));
  entries.set('xl/comments2.xml', Buffer.from(`<comments xmlns="${X}"/>`));
  const session = createXlsxContextSession(entries), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
  const table = session.readTableContext(options);
  assert.equal(table.tables.length, 1);
  assert.throws(() => session.readSheetContext(options), { code: 'XLSX_STRUCTURE_UNSAFE' });
  assert.equal(table.tables[0].columns[0].name, 'Name');
});

test('cached owner graph does not admit duplicate workbook targets, external targets or wrong relationship roles', () => {
  for (const mutate of [
    entries => entries.set('xl/_rels/workbook.xml.rels', Buffer.from(rels(relation('s1', 'worksheet', 'worksheets/sheet1.xml') + relation('s2', 'worksheet', 'worksheets/sheet1.xml')))),
    entries => entries.set('xl/worksheets/_rels/sheet1.xml.rels', Buffer.from(rels(`<Relationship Id="t" Type="${R}/table" Target="https://invalid.example/table.xml" TargetMode="External"/>`))),
    entries => entries.set('xl/worksheets/_rels/sheet1.xml.rels', Buffer.from(rels(relation('t', 'image', '../tables/table1.xml'))))
  ]) {
    const entries = workbook(2); mutate(entries);
    assert.throws(() => createXlsxContextSession(entries).readTableContext({ sheetPart: 'xl/worksheets/sheet1.xml' }), { code: 'XLSX_STRUCTURE_UNSAFE' });
  }
});

test('session output matches fresh readers and remains independent across package parses', () => {
  const first = workbook(2), second = workbook(2), options = { sheetPart: 'xl/worksheets/sheet1.xml' };
  const session = createXlsxContextSession(first);
  assert.deepEqual(session.readSheetContext(options), readXlsxSheetContext(first, options));
  second.set('xl/tables/table1.xml', Buffer.from(second.get('xl/tables/table1.xml').toString().replace('name="Name"', 'name="Preis"')));
  assert.equal(readXlsxTableContext(second, options).tables[0].columns[0].name, 'Preis');
  assert.equal(session.readTableContext(options).tables[0].columns[0].name, 'Name');
});

test('actual OPC parser creates one context session and uses both phases for each selected sheet', () => {
  const fs = require('node:fs'), Module = require('node:module'), path = require('node:path');
  const filename = path.resolve(__dirname, '../plugins/data-secure/server/ooxml.js'), regular = Module.createRequire(filename);
  const actual = regular('./xlsx-content-context'); let sessions = 0, tables = 0, full = 0;
  const isolated = new Module(filename, module); isolated.filename = filename; isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated.require = request => request === './xlsx-content-context' ? { ...actual, createXlsxContextSession(entries) {
    sessions++; const session = actual.createXlsxContextSession(entries);
    return Object.freeze({ ...session,
      readTableContext(options) { tables++; return session.readTableContext(options); },
      readSheetContext(options) { full++; return session.readSheetContext(options); }
    });
  } } : regular(request);
  isolated._compile(fs.readFileSync(filename, 'utf8'), filename);
  const entries = workbook(20);
  entries.set('_rels/.rels', Buffer.from(rels(relation('main', 'officeDocument', 'xl/workbook.xml'))));
  const out = isolated.exports.parseOoxml(zipStore([...entries]), '.xlsx', undefined, { preserveText: true, contentMode: true, literalMarkup: true, partialExtraction: true });
  assert.equal(sessions, 1); assert.equal(tables, 20); assert.equal(full, 20);
  assert.equal(out.markdown.split('Qvx').length - 1, 20);
});

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const D = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const M = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
const MR = 'http://schemas.microsoft.com/office/2018/10/relationships/';
const AUTHOR = '{12345678-1234-1234-1234-123456789012}';
const COMMENT = '{22345678-1234-1234-1234-123456789012}';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
function presentation({ bad = false, orphan = false } = {}) {
  return zipStore([
    ...opcControlEntries('pptx', { additionalOverrides: [
      { part: 'ppt/slides/slide1.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml' },
      { part: 'ppt/authors.xml', contentType: 'application/vnd.ms-powerpoint.authors+xml' },
      { part: 'ppt/comments/modernComment_a_b.xml', contentType: 'application/vnd.ms-powerpoint.comments+xml' },
      { part: 'ppt/media/image1.png', contentType: 'image/png' }
    ] }),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', rels(relation('s', 'slide', 'slides/slide1.xml') + `<Relationship Id="a" Type="${MR}authors" Target="authors.xml"/>`)],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${D}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Name: Qvx / Qvy</a:t></a:r></a:p><a:p><a:r><a:t>INDEPENDENT_SLIDE_BODY FHIR REST 123</a:t></a:r></a:p></p:txBody></p:sp>${orphan ? '' : '<p:pic><p:blipFill><a:blip r:embed="img"/></p:blipFill><p:spPr/></p:pic>'}</p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels', rels(`<Relationship Id="c" Type="${MR}comments" Target="../comments/modernComment_a_b.xml"/>` + (orphan ? '' : relation('img', 'image', '../media/image1.png')))],
    ['ppt/authors.xml', `<p:authorLst xmlns:p="${M}"><p:author id="${AUTHOR}" name="Anna Berger"/></p:authorLst>`],
    ['ppt/comments/modernComment_a_b.xml', `<p:cmLst xmlns:p="${M}" xmlns:a="${D}"><p:cm id="${COMMENT}" authorId="${bad ? COMMENT : AUTHOR}" created="2026-10-24T10:00:00Z"><p:txBody><a:p><a:r><a:t>COMMENT_BODY</a:t></a:r></a:p></p:txBody></p:cm></p:cmLst>`],
    ['ppt/media/image1.png', PNG]
  ]);
}

test('original bad-comment counterexample preserves valid native slide and exact independent image bytes', () => {
  for (const bad of [false, true]) {
    const source = presentation({ bad }), before = hash(source), out = extractOfficeMarkdownAndMedia(source, '.pptx', opts);
    assert.ok(out.extraction.markdown.includes('INDEPENDENT\\_SLIDE\\_BODY'));
    assert.equal(out.extraction.markdown.includes('COMMENT\\_BODY'), !bad);
    assert.equal(out.attachments.length, 1);
    assert.equal(hash(Buffer.from(out.attachments[0].data, 'base64')), hash(PNG));
    assert.equal(out.attachments[0].occurrences[0].index, 1);
    assert.equal(out.extraction.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'), bad);
    assert.equal(hash(source), before);
  }
});

test('comment quarantine never sweeps orphan media or grants an image relationship from comment parts', () => {
  const source = presentation({ bad: true, orphan: true }), entries = readZip(source);
  entries.set('ppt/comments/_rels/modernComment_a_b.xml.rels', Buffer.from(rels(relation('img', 'image', '../media/image1.png'))));
  const out = extractOfficeMarkdownAndMedia(zipStore([...entries]), '.pptx', opts);
  assert.equal(out.attachments.length, 0);
  assert.ok(out.extraction.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
});

test('wrong comment MIME retains hard container refusal', () => {
  const entries = readZip(presentation());
  entries.set('[Content_Types].xml', Buffer.from(entries.get('[Content_Types].xml').toString().replace('application/vnd.ms-powerpoint.comments+xml', 'application/xml')));
  assert.throws(() => extractOfficeMarkdownAndMedia(zipStore([...entries]), '.pptx', opts), { code: 'MARKDOWN_EXTRACTION_FAILED' });
});

test('external comment content is not read and does not authorize media', () => {
  const entries = readZip(presentation());
  entries.set('ppt/slides/_rels/slide1.xml.rels', Buffer.from(rels(`<Relationship Id="c" Type="${MR}comments" Target="https://invalid.example/comment.xml" TargetMode="External"/>`)));
  const out = extractOfficeMarkdownAndMedia(zipStore([...entries]), '.pptx', opts);
  assert.equal(out.attachments.length, 0);
  assert.doesNotMatch(out.extraction.markdown, /COMMENT/u);
  assert.ok(out.extraction.coverage.reason_codes.includes('EXTERNAL_CONTENT_NOT_READ'));
});

test('actual malformed slide cannot acquire media authority through the optional-comment exception', () => {
  const entries = readZip(presentation({ bad: true }));
  entries.set('ppt/slides/slide1.xml', Buffer.from(`<p:sld xmlns:p="${P}"><broken></p:sld>`));
  let out;
  try { out = extractOfficeMarkdownAndMedia(zipStore([...entries]), '.pptx', opts); }
  catch (error) { assert.ok(error.code); return; }
  assert.equal(out.attachments.length, 0);
  assert.doesNotMatch(out.extraction.markdown, /INDEPENDENT/u);
});

test('optional-comment boundary catches only its two typed model errors, not cancellation/policy/unknown errors', () => {
  const fs = require('node:fs'), Module = require('node:module'), path = require('node:path');
  const filename = path.resolve(__dirname, '../plugins/data-secure/server/ooxml.js');
  const source = fs.readFileSync(filename, 'utf8'), regular = Module.createRequire(filename);
  for (const code of ['PPTX_STRUCTURE_UNSAFE', 'PPTX_STRUCTURE_LIMIT', 'REQUEST_CANCELLED', 'REQUEST_TIMEOUT', 'CONVERSION_POLICY_FAILED', 'INPUT_FORMAT_LIMIT', null]) {
    const error = code ? Object.assign(new Error(code), { code }) : new Error('ordinary unexpected model failure');
    const isolated = new Module(filename, module); isolated.filename = filename; isolated.paths = Module._nodeModulePaths(path.dirname(filename));
    isolated.require = request => request === './presentation-comments' ? { readPresentationComments() { throw error; } } : regular(request);
    isolated._compile(source, filename);
    const run = () => isolated.exports.parseOoxml(presentation(), '.pptx', undefined, { preserveText: true, contentMode: true, literalMarkup: true, partialExtraction: true, referencedImagesOnly: true });
    if (code === 'PPTX_STRUCTURE_UNSAFE' || code === 'PPTX_STRUCTURE_LIMIT') {
      const out = run(); assert.equal(out.attachments.length, 1);
      assert.match(out.markdown, /INDEPENDENT/u); assert.ok(out.warnings.includes('DOCUMENT_PARTS_DAMAGED'));
    } else assert.throws(run, candidate => candidate === error);
  }
});

async function privacyChain(source, extension, imageOcr = false) {
  const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
  const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
  const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
  const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
  const { bindStandaloneDocumentKeeps } = require('../plugins/data-secure/server/privacy/residual-person-review');
  const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: imageOcr, imageOcr };
  const extracted = await extractSourceForPrivacy(source, extension, { contentOptions, convertBuffer: async bytes => {
    const out = extractOfficeMarkdownAndMedia(bytes, extension, opts);
    let result = createMarkdownExtraction({ source_type: out.extraction.source_type, markdown: out.extraction.markdown, coverage: out.extraction.coverage, content_options: contentOptions });
    if (imageOcr) {
      assert.equal(out.attachments.length, 1);
      // Exact real attachment pipeline plus a controlled OCR text result. This
      // is not an optical/native-recognition accuracy claim.
      const ocr = createMarkdownExtraction({ source_type: 'pptx', markdown: 'Name: Qza / Qzb\nHTTP/2 IMAGE_CONTEXT', coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] }, content_options: contentOptions });
      result = appendOfficeOcr(result, [ocr], contentOptions, out.attachments[0].occurrences.map(o => ({ ...o, ordinal: 1, result: 0 })));
    }
    return result;
  } });
  for (const profile of ['general', 'personnel_profile']) {
    const prepared = prepareTextPrivacyReview({ text: extracted.markdown, profile, productChannel: 'standalone', consumerOptions: { productChannel: 'standalone', contentOptions }, registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    const proof = { markdown: final.markdown, profile, content_options: contentOptions, source_extraction: extracted.sourceExtraction, dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates };
    assert.ok(verifyAnonymizedPublication(proof));
    assert.doesNotMatch(final.markdown, /Qvx|Qvy|Qza|Qzb|Qzx|Qzy|Anna Berger/u);
    if (extension === '.pptx') assert.match(final.markdown, /FHIR/u);
    else { assert.match(final.markdown, /100/u); assert.match(final.markdown, /200/u); }
    const entities = initialEntities({ markdown: final.markdown, transform_trace: final.transform_trace });
    const entity = entities.find(v => v.original.includes(extension === '.pptx' ? 'Qvx' : 'Qzx'));
    assert.ok(entity);
    const kept = applyEntityDecisions(final.markdown, entities, [{ entity_id: entity.entity_id, decision: 'keep' }], Buffer.alloc(32, 7));
    assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: kept.markdown, reviewed_person_candidates: bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(e => e.decision === 'keep').map(({ start, end }) => ({ start, end }))) }), { code: 'STANDALONE_PUBLICATION_INVALID' });
    console.log(`PASS ${++passed} actual ${extension}/OCR=${imageOcr} source -> privacy/trace/publication/Keep ${profile}`);
  }
}

(async () => {
  await privacyChain(presentation({ bad: true }), '.pptx', true);
  // Reconstruct the exact original damaged-comment regression, not a weaker
  // replacement with a visible worksheet Name header.
  const fixture = require('./lib/rc176-xlsx-field-countercases.cjs')['COUNTERCASE-HIDDEN-NAME-TABLE.xlsx'];
  const entries = readZip(Buffer.from(fixture.base64, 'base64'));
  entries.set('xl/comments1.xml', Buffer.from(entries.get('xl/comments1.xml').toString().replace('authorId="0"', 'authorId="99"')));
  const source = zipStore([...entries]), expected = '962031bc27b29ac2459f470b618c700d865b83832d51930606a156de98d7a431';
  assert.equal(hash(source), expected); await privacyChain(source, '.xlsx'); assert.equal(hash(source), expected);
  console.log(`${passed} Office context session/isolation groups passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
