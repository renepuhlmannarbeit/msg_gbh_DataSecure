import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from '../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
const require = createRequire(import.meta.url), repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createPassivePdfContent, MAX_STRING } = require('../plugins/data-secure/server/standalone/pdf-passive-content');
const { passivePdf, buildPdf, pdfString } = require('./lib/pdf-passive-fixtures.cjs');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { bindStandaloneDocumentKeeps } = require('../plugins/data-secure/server/privacy/residual-person-review');
const { scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
const { CONTENT_PERSON_FIELD_POLICY } = require('../plugins/data-secure/server/core/person-field-policy');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ownInputs = ['plugins/data-secure/server/standalone/pdf-passive-content.js',
  'plugins/data-secure/server/standalone/conversion-worker-child.js', 'tests/lib/pdf-passive-fixtures.cjs', 'tests/test-pdf-passive-content.mjs'];
const inputHashes = () => Object.fromEntries(ownInputs.map(file => [file, hash(fs.readFileSync(path.join(repo, file)))]));
const beforeInputs = inputHashes();
const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const ref = '9R', widget = overrides => ({ id: ref, subtype: 'Widget', fieldType: 'Tx', fieldName: 'Name',
  fieldValue: 'Qvx', password: false, fieldFlags: 0, rect: [20, 50, 200, 80], actions: null, ...overrides });
// Actual partial /T names, reciprocal /Parent-/Kids and a page-owned widget.
// Unlike a flat field whose /T illegally contains a dot, this is a real PDF
// hierarchy; PDF.js constructs the qualified name itself.
function qualifiedPdf({ parent = 'Applicant', leaf = 'Name', value = 'Qvx / Qvy' } = {}) {
  const body = 'BT /F1 14 Tf 20 250 Td (BODY_NATIVE) Tj ET';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [8 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
    '<< /Fields [7 0 R] /DR << /Font << /F1 4 0 R >> >> /DA (/F1 14 Tf 0 g) >>',
    `<< /T ${pdfString(parent)} /Kids [8 0 R] >>`,
    `<< /Type /Annot /Subtype /Widget /Parent 7 0 R /FT /Tx /T ${pdfString(leaf)} /V ${pdfString(value)} /Rect [20 150 320 185] /P 3 0 R >>`
  ]);
}
await test('API guards reject getters/proxies/prototypes/falsy shape and malformed Unicode before projection', () => {
  for (const fieldObjects of [false, '', 0, [], new Proxy({}, {}), Object.create({ Name: [] })])
    assert.throws(() => createPassivePdfContent({ fieldObjects }), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
  let read = false; const getter = {}; Object.defineProperty(getter, 'Name', { enumerable: true, get() { read = true; return []; } });
  assert.throws(() => createPassivePdfContent({ fieldObjects: getter })); assert.equal(read, false);
  const plan = createPassivePdfContent({ fieldObjects: null });
  for (const input of [false, null, [widget({ password: 0 })], [widget({ fieldValue: '\ud800' })],
    [widget({ fieldValue: 'x'.repeat(MAX_STRING + 1) + '\udc00' })], [widget({ rect: [1, 2, 3, NaN] })],
    [new Proxy(widget(), {})], [Object.create(widget())]])
    assert.throws(() => plan.readPage({ annotations: input, pageNumber: 1 }), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
});
await test('source label/value stays inert in a real cell, non-sensitive technical values are not assigned fake identity', () => {
  const actual = createPassivePdfContent({ fieldObjects: null }).readPage({ pageNumber: 1, annotations: [widget({
    fieldName: 'Name', fieldValue: 'Qvx\rQvy | <img src=private> 😀 Äß' }), widget({ id: '10R', fieldName: 'Preis', fieldValue: '123 EUR' })] });
  assert.match(actual.markdown, /Name: Qvx&#13;Qvy \\n?\|/u); assert.ok(!actual.markdown.includes('<img'));
  assert.match(actual.markdown, /Preis: 123 EUR/u); assert.ok(!actual.markdown.includes('Geschützter Tabellenwert'));
});
await test('qualified API fields preserve the full name and closed real role, never guessing from values or lookalike dots', () => {
  for (const [fieldName, role] of [['Applicant.Name', 'Name'], ['Anträge😀.氏名', 'Name'], ['Applicant\\.Name', 'Name'],
    ['Applicant.Name (1)', 'Name'], ['Applicant.Full Name (1) (2)', 'Name'], ['Applicant.Company (1)', 'Unternehmen'],
    ['Application.Company', 'Unternehmen'], ['Application.Telefon', 'Telefon'], ['Application.Geburtsdatum', 'Geburtsdatum'],
    ['Application.Passwort', 'Geschützter Tabellenwert'], ['Application..Name', 'Geschützter Tabellenwert']]) {
    const actual = createPassivePdfContent({ fieldObjects: null }).readPage({ pageNumber: 1, annotations: [widget({ fieldName, fieldValue: 'Qvx\rQvy | <img> 😀 Äß' })] });
    assert.ok(actual.markdown.includes(`| ${role} |\n| --- |`), fieldName);
    assert.equal((actual.markdown.match(/Qvx/gu) || []).length, 1); assert.ok(actual.markdown.includes('Qvx&#13;Qvy \\| &lt;img&gt; 😀 Äß'));
    assert.ok(actual.markdown.includes('| PDF-Feldname |')); assert.ok(!actual.markdown.includes('<img>'));
    if (fieldName === 'Applicant\\.Name') assert.ok(actual.markdown.includes('Applicant\\\\.Name'));
  }
  for (const fieldName of ['Applicant.Preis', 'Applicant.Status', 'Applicant.Nameless', 'Applicant.Na\\me', 'Applicant．Name', 'Applicant&#46;Name']) {
    const actual = createPassivePdfContent({ fieldObjects: null }).readPage({ pageNumber: 1, annotations: [widget({ fieldName, fieldValue: 'Qvx / Qvy' })] });
    assert.ok(!actual.markdown.includes('| PDF-Feldname |'), fieldName); assert.ok(!actual.markdown.includes('| Name |'), fieldName);
    assert.ok(actual.markdown.includes('Qvx / Qvy'));
  }
  const extra = createPassivePdfContent({ fieldObjects: { 'Applicant.Name': [{ id: '11R', type: 'text', name: 'Applicant.Name', page: -1, value: 'Qvx / Qvy' }] } }).finalize();
  assert.match(extra.markdown, /\| Name \|\n\| --- \|\n\| Qvx \/ Qvy \|/u);
});
await test('optional oversize values are omitted whole while independent useful values survive', () => {
  const actual = createPassivePdfContent({ fieldObjects: null }).readPage({ pageNumber: 1,
    annotations: [widget({ fieldValue: 'X'.repeat(MAX_STRING + 1) }), widget({ id: '10R', fieldValue: 'Safe' })] });
  assert.ok(!actual.markdown.includes('XXXX')); assert.match(actual.markdown, /Safe/u);
  assert.ok(actual.reason_codes.includes('TEXT_LIMIT_PARTIAL')); assert.equal(actual.meaningful, true);
});
await test('canonical graph ambiguities and resource exhaustion are explicit, never inferred from equal strings', () => {
  const fields = { Name: [{ id: '1R', type: '', name: 'Name', page: -1, kidIds: ['2R'] },
    { id: '2R', type: 'text', name: 'Name', page: 0, value: 'Qvx', kidIds: ['1R'] }] };
  const actual = createPassivePdfContent({ fieldObjects: fields }).readPage({ pageNumber: 1, annotations: [widget({ id: '2R' })] });
  assert.ok(actual.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED')); assert.match(actual.markdown, /nicht eindeutig/u);
  for (const value of [false, 0, {}, { id: '1R', type: 'text', page: false, value: 'secret' }])
    assert.throws(() => createPassivePdfContent({ fieldObjects: { Name: [value] } }), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
  const many = Array.from({ length: 140 }, (_, index) => widget({ id: `${index + 1}R`, fieldValue: '&'.repeat(MAX_STRING) }));
  const bounded = createPassivePdfContent({ fieldObjects: null }).readPage({ annotations: many, pageNumber: 1 });
  assert.ok(bounded.markdown.length <= 8_000_000); assert.ok(bounded.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
  assert.equal(bounded.meaningful, true);
  const unsupported = createPassivePdfContent({ fieldObjects: null }).readPage({ pageNumber: 1,
    annotations: [widget({ subtype: undefined }), widget({ id: '10R', fieldType: 'Unknown' }), widget({ id: '11R', fieldValue: 'Useful' })] });
  assert.match(unsupported.markdown, /Useful/u); assert.match(unsupported.markdown, /nicht unterstützte PDF-Objekte/u);
  assert.ok(unsupported.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
});
const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
  : process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch) ? `macos-${process.arch}`
    : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
if (!target) throw new Error('PDF_PASSIVE_TEST_HOST_UNSUPPORTED');
const canvasRequire = createRequire(path.join(repo, 'native/ocr/pilot/package.json'));
process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
const { createCanvas, Path2D, DOMMatrix, ImageData } = canvasRequire('@napi-rs/canvas');
// PDF.js's development folder can contain another optional Canvas install.
// Keep these RAM-render primitives in the same fixed role as our test canvas.
globalThis.Path2D = Path2D; globalThis.DOMMatrix = DOMMatrix; globalThis.ImageData = ImageData;
const pdfRoot = path.join(repo, 'native/pdfjs/pilot/node_modules/pdfjs-dist');
const pdfjs = await import(pathToFileURL(path.join(pdfRoot, 'legacy/build/pdf.mjs')).href);
assert.equal(pdfjs.version, '6.2.108');
assert.equal(hash(fs.readFileSync(path.join(pdfRoot, 'legacy/build/pdf.mjs'))), '842284e0d1d439e60701e3355c2128cd3016ebebf14220e27f512467682aad66');
async function document(bytes, run) {
  const original = hash(bytes), resource = directory => `${path.join(pdfRoot, directory).replaceAll('\\', '/')}/`;
  const task = pdfjs.getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useSystemFonts: false,
    enableXfa: false, useWorkerFetch: false, stopAtErrors: true, verbosity: 0,
    standardFontDataUrl: resource('standard_fonts'), cMapUrl: resource('cmaps'), cMapPacked: true,
    wasmUrl: resource('wasm'), iccUrl: resource('iccs') });
  try { return await run(await task.promise); } finally { await task.destroy(); assert.equal(hash(bytes), original); }
}
async function projected(bytes) { return document(bytes, async pdf => {
  const fields = await pdf.getFieldObjects(), plan = createPassivePdfContent({ fieldObjects: fields }), pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber), annotations = await page.getAnnotations({ intent: 'display' });
    try { pages.push({ annotations, result: plan.readPage({ pageNumber, annotations }) }); } finally { page.cleanup(); }
  }
  return { fields, pages, extra: plan.finalize() };
}); }
await test('real PDF.js parent/Kids and two page widgets retain each actual use; equal AP text is not doubled', async () => {
  const actual = await projected(passivePdf({ fields: [{ name: 'Name', value: 'Qvx', parent: true, widgets: 2, appearance: 'Qvx' }] }));
  assert.ok(Object.values(actual.fields).flat().some(field => field.kidIds?.length === 2));
  assert.equal((actual.pages[0].result.markdown.match(/Name: Qvx/gu) || []).length, 2);
  assert.equal(actual.extra.meaningful, false); assert.match(actual.pages[0].result.markdown, /API-Elternobjekt/u);
});
await test('real PDF.js same-name disconnected canonical/widget records remain distinct, not a string/name repair', async () => {
  const actual = await projected(passivePdf({ fields: [{ name: 'Name', value: 'WIDGET_VALUE', orphan: true, canonicalValue: 'CANONICAL_VALUE' }] }));
  assert.match(actual.pages[0].result.markdown, /Name: WIDGET\\_VALUE/u);
  assert.match(actual.extra.markdown, /Name: CANONICAL\\_VALUE/u);
  assert.match(actual.pages[0].result.markdown, /keine eindeutige Zuordnung/u);
  assert.ok(actual.extra.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
});
await test('real PDF.js constructs an actual Parent.Name label before safe closed-role projection', async () => {
  const actual = await projected(qualifiedPdf({ value: 'Qvx\rQvy' }));
  assert.ok(actual.fields['Applicant.Name'].some(field => field.id === '8R' && field.name === 'Applicant.Name'));
  assert.equal(actual.pages[0].annotations[0].fieldName, 'Applicant.Name');
  assert.equal(actual.pages[0].annotations[0].fieldValue, 'Qvx\rQvy');
  assert.match(actual.pages[0].result.markdown, /\| PDF-Feldname \|\n\| --- \|\n\| Applicant\.Name \|/u);
  assert.match(actual.pages[0].result.markdown, /\| Name \|\n\| --- \|\n\| Qvx&#13;Qvy \|/u);
});
await test('real PDF appearance pixels/text can contradict the field value; neither overwrites the other', async () => {
  const bytes = passivePdf({ body: '', fields: [{ name: 'Name', value: 'STORED_VALUE', appearance: 'VISIBLE_OTHER' }] });
  await document(bytes, async pdf => {
    const page = await pdf.getPage(1), annotations = await page.getAnnotations({ intent: 'display' });
    assert.equal(annotations[0].fieldValue, 'STORED_VALUE'); assert.ok(annotations[0].textContent.join('').includes('VISIBLE_OTHER'));
    const actual = createPassivePdfContent({ fieldObjects: await pdf.getFieldObjects() }).readPage({ pageNumber: 1, annotations });
    assert.match(actual.markdown, /STORED\\_VALUE/u); assert.match(actual.markdown, /VISIBLE\\_OTHER/u); assert.match(actual.markdown, /unterscheiden sich/u);
    const counts = [];
    for (const annotationMode of [pdfjs.AnnotationMode.DISABLE, pdfjs.AnnotationMode.ENABLE]) {
      const canvas = createCanvas(400, 300);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: 1 }), background: 'white', annotationMode }).promise;
        const pixels = canvas.getContext('2d').getImageData(20, 115, 300, 35).data;
        let count = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 220) count++;
        counts.push(count); pixels.fill(0);
      } finally { canvas.width = 1; canvas.height = 1; }
    }
    assert.equal(counts[0], 0); assert.ok(counts[1] > 50); page.cleanup();
  });
});
await test('real choice multiselect export/display labels and checkbox state are read without selecting a new option', async () => {
  const actual = await projected(passivePdf({ fields: [{ name: 'Status', type: 'Ch', value: ['A', 'B'], options: [['A', 'Alpha'], ['B', 'Beta'], ['C', 'NOT_SELECTED']] },
    { name: 'Auswahl', type: 'Btn', value: 'Yes', appearance: 'X' }] }));
  const markdown = actual.pages[0].result.markdown;
  for (const value of ['Status: A', 'Status: B', 'Status: Alpha', 'Status: Beta', 'Auswahl: Yes']) assert.ok(markdown.includes(value), value);
  assert.ok(!markdown.includes('NOT_SELECTED'));
});
await test('real Text/FreeText keep author and differing passive appearance; Link/JS/password/signature payload never copied', async () => {
  const actual = await projected(passivePdf({ docAction: true, fields: [
    { name: 'SECRET_PASSWORD_LABEL', value: 'PASSWORD_SECRET', password: true },
    { name: 'SECRET_ACTION_LABEL', value: 'ACTION_SECRET', action: true }, { name: 'Sig', type: 'Sig' }],
    comments: [{ value: 'Name: Anna Berger', author: 'Max Mustermann' },
      { type: 'FreeText', value: 'STORED_NOTE', appearance: 'AP_NOTE' }, { type: 'Link', value: 'LINK_SECRET', link: true }] }));
  const markdown = actual.pages[0].result.markdown + actual.extra.markdown;
  assert.match(markdown, /Autor: Max Mustermann/u); assert.match(markdown, /Name: Anna Berger/u);
  assert.match(markdown, /STORED\\_NOTE/u); assert.match(markdown, /AP\\_NOTE/u);
  assert.doesNotMatch(markdown, /PASSWORD|ACTION|SIGNATURE|LINK_SECRET|NO_FETCH/u);
});
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-pdf-passive-'));
const server = path.join(scope, 'server'), runtime = path.join(server, 'standalone/conversion-runtime');
const originalSpawn = childProcess.spawn, children = [];
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args), entry = { child, closed: false };
  entry.done = new Promise(resolve => child.once('close', () => { entry.closed = true; resolve(); })); children.push(entry); return child;
};
try {
  writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), server, target); writeConversionRuntime(repo, runtime, target);
  const { convertBuffer } = require(path.join(server, 'standalone/conversion-worker.js'));
  async function convert(bytes, choices = options, legacy = false) {
    const original = hash(bytes), result = await convertBuffer(bytes, '.pdf', legacy ? {} : { contentOptions: choices, passiveObjects: true });
    assert.equal(hash(bytes), original); assert.ok(children.every(child => child.closed)); return result;
  }
  await test('actual isolated worker reads form-only data with OCR disabled; notes/content both use the same source values', async () => {
    const bytes = passivePdf({ body: '', fields: [{ name: 'Name', value: 'Qvx', appearance: 'Qvx' }] });
    for (const markdownOutput of ['content-v1', 'notes-v1']) {
      const result = await convert(bytes, { ...options, markdownOutput });
      assert.match(result.markdown, /Name: Qvx/u); assert.ok(result.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
      assert.ok(!result.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    }
    await assert.rejects(convert(bytes, options, true), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
    await assert.rejects(convertBuffer(bytes, '.pdf', { contentOptions: options }), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
  });
  await test('actual isolated repeated-page and stale-appearance values remain page/object bound without a repaint', async () => {
    const bytes = passivePdf({ pages: 2, fields: [{ name: 'Name', value: 'STORED_VALUE', appearance: 'VISIBLE_OTHER', parent: true, widgets: 2, repeatPages: true }] });
    const result = await convert(bytes);
    assert.equal((result.markdown.match(/Name: STORED\\_VALUE/gu) || []).length, 2);
    assert.equal((result.markdown.match(/Name: VISIBLE\\_OTHER/gu) || []).length, 2);
    assert.match(result.markdown, /Seite 1/u); assert.match(result.markdown, /Seite 2/u);
    assert.match(result.markdown, /unterscheiden sich/u); assert.ok(!result.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    const legacy = await convertBuffer(bytes, '.pdf', { passiveObjects: true });
    assert.match(legacy.markdown, /BODY/u); assert.doesNotMatch(legacy.markdown, /STORED|VISIBLE|PDF-Formularfeld/u);
  });
  for (const profile of ['general', 'personnel_profile']) await test(`actual isolated worker→prepare→proof→Keep refusal ${profile}`, async () => {
    const bytes = passivePdf({ fields: [{ name: 'Name', value: 'Qvx / Qvy', appearance: 'Qvx / Qvy' }, { name: 'Preis', value: '123 EUR', appearance: '123 EUR' }] });
    const source = await extractSourceForPrivacy(bytes, '.pdf', { contentOptions: options, convertBuffer: input => convert(input) });
    const consumer = { productChannel: 'standalone', contentOptions: options, captureTransformPlan: true };
    const prepared = prepareTextPrivacyReview({ text: source.markdown, profile, productChannel: 'standalone', consumerOptions: consumer,
      registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    const proof = { markdown: final.markdown, profile, content_options: options, source_extraction: source.sourceExtraction,
      dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates };
    assert.ok(verifyAnonymizedPublication(proof)); assert.doesNotMatch(final.markdown, /Qvx|Qvy/u); assert.match(final.markdown, /123 EUR/u);
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    const entities = initialEntities({ markdown: final.markdown, transform_trace: final.transform_trace });
    const entity = entities.find(item => item.original.includes('Qvx')); assert.ok(entity);
    const kept = applyEntityDecisions(final.markdown, entities, [{ entity_id: entity.entity_id, decision: 'keep' }], Buffer.alloc(32, 13));
    const keepBinding = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(item => item.decision === 'keep').map(({ start, end }) => ({ start, end })));
    assert.ok(scanResidual(kept.markdown, profile, [], { ...consumer, originalSourceText: source.markdown,
      reviewedPersonCandidates: keepBinding }).some(item => item.type === 'SENSITIVE_FIELD'));
    assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: kept.markdown, reviewed_person_candidates: keepBinding }), { code: 'STANDALONE_PUBLICATION_INVALID' });
  });
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile'])
    await test(`actual qualified field whole-value protection and Keep refusal ${markdownOutput}/${profile}`, async () => {
      const choices = { ...options, markdownOutput }, consumer = { productChannel: 'standalone', contentOptions: choices, captureTransformPlan: true };
      for (const spec of [{ value: 'Qvx\rQvy' }, { value: 'Qvx / Qvy' }, { value: '[PERSON_999]' },
        { leaf:'Name (1)', value:'Qvx / Qvy' }, { leaf:'Full Name (1) (2)', value:'Qvx\rQvy' }, { leaf:'Company (1)', value:'Qvx / Qvy' },
        { parent: 'Anträge😀\\', value: 'Qvx\rQvy 😀 日本語 Äß' }]) {
        const bytes = qualifiedPdf(spec), original = hash(bytes);
        const source = await extractSourceForPrivacy(bytes, '.pdf', { contentOptions: choices, convertBuffer: input => convert(input, choices) });
        const role=spec.leaf?.startsWith('Company')?'Unternehmen':'Name';
        assert.equal(hash(bytes), original); assert.ok(source.markdown.includes(`| ${role} |\n| --- |`));
        const prepared = prepareTextPrivacyReview({ text: source.markdown, profile, productChannel: 'standalone', consumerOptions: consumer,
          registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
        const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
        const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
        const proof = { markdown: final.markdown, profile, content_options: choices, source_extraction: source.sourceExtraction,
          dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates };
        assert.ok(verifyAnonymizedPublication(proof)); assert.doesNotMatch(final.markdown, /Qvx|Qvy|PERSON[_\\]*999/u);
        assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
        // Exercise actual entity Keep whenever this complete field produced an
        // editable entity. Imported variables/opaque generic masks may have no
        // such GUI entity; the independent output check still rejects a forged
        // cell restoration with a real document-bound Keep candidate.
        const entities = initialEntities({ markdown: final.markdown, transform_trace: final.transform_trace });
        const entity = entities.find(item => item.original.includes('Qvx'));
        if (entity) {
          const kept = applyEntityDecisions(final.markdown, entities, [{ entity_id: entity.entity_id, decision: 'keep' }], Buffer.alloc(32, 19));
          const binding = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(item => item.decision === 'keep').map(({ start, end }) => ({ start, end })));
          assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: kept.markdown, reviewed_person_candidates: binding }), { code: 'STANDALONE_PUBLICATION_INVALID' });
        }
        const restored = canonicalizeRenderedText(source.markdown, CONTENT_PERSON_FIELD_POLICY);
        const header=`| ${role} |\n| --- |\n`;
        const valueStart = restored.lastIndexOf(header) + header.length;
        assert.ok(valueStart > 0);
        const binding = bindStandaloneDocumentKeeps(restored, [], [{ start: valueStart, end: restored.length }]);
        assert.ok(scanResidual(restored, profile, [], { ...consumer, originalSourceText: source.markdown, reviewedPersonCandidates: binding }).some(item => item.type === 'SENSITIVE_FIELD'));
        assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: restored, reviewed_person_candidates: binding }), { code: 'STANDALONE_PUBLICATION_INVALID' });
      }
      const technical = await convert(qualifiedPdf({ leaf: 'Preis', value: '123 EUR' }), choices);
      assert.match(technical.markdown, /Applicant\.Preis: 123 EUR/u); assert.doesNotMatch(technical.markdown, /\| Name \||Geschützter Tabellenwert/u);
    });
  await test('actual isolated worker retains independent body while refusing active/password/signature payloads', async () => {
    const bytes = passivePdf({ docAction: true, fields: [{ name: 'Name', value: 'SAFE_FIELD' },
      { name: 'SECRET_PASSWORD_LABEL', value: 'PASSWORD_SECRET', password: true }, { name: 'SECRET_ACTION_LABEL', value: 'ACTION_SECRET', action: true },
      { type: 'Sig', name: 'SECRET_SIG' }] });
    const result = await convert(bytes); assert.match(result.markdown, /BODY/u); assert.match(result.markdown, /SAFE\\_FIELD/u);
    assert.doesNotMatch(result.markdown, /PASSWORD|ACTION|SIGNATURE|SECRET_SIG/u);
  });
  await test('actual XFA dataset substitution is detected before new field reads and never exposed by the worker', async () => {
    const bytes = passivePdf({ xfa: true, fields: [{ name: 'Name', omitValue: true, appearance: null }] });
    await document(bytes, async pdf => {
      assert.equal((await pdf.getMetadata()).info.IsXFAPresent, true);
      assert.equal(pdf.isPureXfa, false, 'enableXfa:false alone does not identify hybrid dataset substitution');
      const fields = await pdf.getFieldObjects(); assert.ok(Object.values(fields).flat().some(field => field.value === 'XFA_SECRET_VALUE'));
    });
    const result = await convert(bytes); assert.match(result.markdown, /BODY/u); assert.match(result.markdown, /XFA-Inhalte/u);
    assert.doesNotMatch(result.markdown, /XFA_SECRET|Feldstand des Seitenwidgets/u);
  });
  const afterInputs = inputHashes(); assert.deepEqual(afterInputs, beforeInputs);
  console.log(`${passed} passive PDF groups passed (${target}); real child close confirmed; 4 authored inputs unchanged`);
  console.log(JSON.stringify({ inputs_unchanged: true, input_hashes: afterInputs }));
} finally {
  childProcess.spawn = originalSpawn;
  for (const entry of children) if (!entry.closed) entry.child.kill('SIGTERM');
  let timer;
  try { await Promise.race([Promise.all(children.map(entry => entry.done)), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PDF_PASSIVE_TEST_CLOSE_UNCONFIRMED')), 6000);
  })]); } finally { clearTimeout(timer); }
  removePackageSmokeScope(repo, scope);
}
