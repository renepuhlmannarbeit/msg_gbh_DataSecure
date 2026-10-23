import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { derivePdfjsTextPaintModule } from '../scripts/lib/pdfjs-text-paint-hook.mjs';

const require = createRequire(import.meta.url);
const { bindTextRuns, classifyPdfTextVisibility, wordCandidates } = require('../plugins/data-secure/server/standalone/pdf-text-visibility');
const { uncoveredOcrText, renderPdfOcrLayer, nativeColumnOrder } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfRoot = path.join(root, 'native', 'pdfjs', 'pilot', 'node_modules', 'pdfjs-dist');
const original = fs.readFileSync(path.join(pdfRoot, 'legacy', 'build', 'pdf.mjs'));
assert.throws(() => derivePdfjsTextPaintModule(Buffer.concat([original, Buffer.from(' ')])), /SOURCE_MISMATCH/u);
const canvasApi = require('../native/ocr/pilot/node_modules/@napi-rs/canvas');
for (const key of ['DOMMatrix', 'Path2D', 'ImageData']) globalThis[key] = canvasApi[key];
const derived = derivePdfjsTextPaintModule(original);
// Create-only generated derivative; never alter the installed upstream package
// or input fixtures. Retain it as diagnostic evidence if a test fails.
const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-pdf-visibility-'));
const moduleFile = path.join(scope, 'pdf.mjs');
fs.writeFileSync(moduleFile, derived, { flag: 'wx' });
const pdfjs = await import(pathToFileURL(moduleFile).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.worker.mjs')).href;
class CanvasFactory {
  create(width, height) { const canvas = canvasApi.createCanvas(width, height); return { canvas, context: canvas.getContext('2d') }; }
  reset(value, width, height) { value.canvas.width = width; value.canvas.height = height; }
  destroy(value) { value.canvas.width = 1; value.canvas.height = 1; value.canvas = null; value.context = null; }
}
function pdf(stream, { wrongToUnicode = false } = {}) {
  // Font glyph painting stays ABC; the syntactically valid but incorrect
  // semantic CMap claims XYZ. Native TextContent and glyph.unicode share it.
  const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SyntheticMap def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n3 beginbfchar\n<41> <0058>\n<42> <0059>\n<43> <005A>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend end';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> /ExtGState << /GS0 << /ca 0 /CA 0 >> /GSweak << /ca 0.000000001 /CA 0.000000001 >> >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding ${wrongToUnicode ? '/ToUnicode 6 0 R' : ''} >>`,
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`];
  let output = '%PDF-1.7\n'; const offsets = [0];
  for (const [index, value] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${value}\nendobj\n`; }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output));
}
async function check(name, stream, expected, options = {}) {
  const task = pdfjs.getDocument({ data: pdf(stream, { wrongToUnicode: options.wrongToUnicode === true }), CanvasFactory,
    isEvalSupported: false, stopAtErrors: true, disableAutoFetch: true,
    disableStream: true, disableRange: true, useWorkerFetch: false, useSystemFonts: false,
    enableXfa: false, verbosity: 0, standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/' });
  const document = await task.promise;
  try {
    const page = await document.getPage(1), text = await page.getTextContent({ disableNormalization: true });
    const result = await classifyPdfTextVisibility({ page, textItems: text.items,
      viewport: page.getViewport({ scale: 1 }), createCanvas: canvasApi.createCanvas,
      setTextPaintObserver: pdfjs.setDataSecureTextPaintObserver,
      annotationMode: pdfjs.AnnotationMode.DISABLE, ...options });
    assert.deepEqual(result.items.filter(item => item.str.trim()).map(item => item.str), expected, name);
    console.log(`PASS ${name}`);
    return result;
  } finally { await task.destroy(); }
}

await check('visible ordinary text retained', 'BT /F1 20 Tf 30 200 Td (Visible) Tj ET', ['Visible']);
await check('Tr3 native hidden text excluded', 'BT /F1 20 Tf 3 Tr 30 200 Td (Hidden) Tj ET', []);
await check('zero alpha native text excluded', 'q /GS0 gs BT /F1 20 Tf 30 200 Td (Hidden) Tj ET Q', []);
await check('later white paint hides text', 'BT /F1 20 Tf 30 200 Td (Hidden) Tj ET 1 1 1 rg 0 0 400 300 re f', []);
await check('merged hidden and visible operations remain unknown', 'BT /F1 20 Tf 30 200 Td 3 Tr (Hidden) Tj 0 Tr (Visible) Tj ET', ['HiddenVisible']);
await check('partially covered text retained', 'BT /F1 20 Tf 30 200 Td (Visible) Tj ET 1 1 1 rg 30 190 10 40 re f', ['Visible']);
await check('clipping text is unknown and retained', 'BT /F1 20 Tf 7 Tr 30 200 Td (Hidden) Tj ET', ['Hidden']);
await check('probe budget exhausted retains native text', 'BT /F1 20 Tf 3 Tr 30 200 Td (Hidden) Tj ET', ['Hidden'], { maxProbes: 0 });
await check('repeated text at separate positions not removed', 'BT /F1 20 Tf 30 200 Td (Same) Tj 0 -30 Td (Same) Tj ET', ['Same', 'Same']);
await check('rotated hidden glyph excluded', 'BT /F1 20 Tf 0.7 0.7 -0.7 0.7 100 100 Tm 3 Tr (R) Tj ET', []);
await check('rotated visible glyph retained', 'BT /F1 20 Tf 0.7 0.7 -0.7 0.7 100 100 Tm (R) Tj ET', ['R']);
await check('shared document budget exhausted retains text', 'BT /F1 20 Tf 3 Tr 30 200 Td (Hidden) Tj ET', ['Hidden'],
  { budget: { remainingProbes: 0, remainingPixels: 100_000_000 } });
await check('tiny legitimate native text retained despite zero final pixels', 'BT /F1 0.001 Tf 30 200 Td (Tiny) Tj ET', ['Tiny']);
await check('white native text is unknown and retained', '1 1 1 rg BT /F1 20 Tf 30 200 Td (White) Tj ET', ['White']);
await check('near-transparent native text retained', 'q /GSweak gs BT /F1 20 Tf 30 200 Td (Weak) Tj ET Q', ['Weak']);

const spaced = await check('spaced native words retained', 'BT /F1 20 Tf 30 200 Td (Alpha          Beta) Tj ET', ['Alpha', 'Beta']);
assert.deepEqual(spaced.wordRegions.map(region => region.text), ['Alpha', 'Beta']);
const [alphaRegion, betaRegion] = spaced.wordRegions;
assert.ok(alphaRegion.x1 + 20 < betaRegion.x0, 'large whitespace is not a covered region');
const graphic = { x0: alphaRegion.x1 + 5, y0: alphaRegion.y0, x1: alphaRegion.x1 + 20, y1: alphaRegion.y1 };
const ocr = { text: 'Alpha Alpha Beta', blocks: [{ paragraphs: [{ lines: [{ text: 'Alpha Alpha Beta', words: [
  { text: 'Alpha', bbox: alphaRegion }, { text: 'Alpha', bbox: graphic }, { text: 'Beta', bbox: betaRegion }
] }] }] }] };
assert.equal(uncoveredOcrText(ocr, spaced.wordRegions, { singleTokenOnly: true }).trim(), 'Alpha',
  'graphic word in whitespace survives exact native-word deduplication');
console.log('PASS actual glyph word bounds do not bridge whitespace');

const kerning = await check('numeric TJ advances remain literal', 'BT /F1 20 Tf 30 200 Td [(Alpha) -1500 (Beta)] TJ ET', ['Alpha', 'Beta']);
assert.deepEqual(kerning.wordRegions.map(region => region.text), ['Alpha', 'Beta']);
assert.ok(kerning.wordRegions[0].x1 + 20 < kerning.wordRegions[1].x0);
for (const gap of [-150, -200, -240, -250]) {
  const split = await check(`TJ ${gap} cannot suppress a token absent from native text`,
    `BT /F1 20 Tf 30 200 Td [(Alpha) ${gap} (Beta)] TJ ET`, ['Alpha Beta']);
  assert.ok(!split.wordRegions.some(region => region.text === 'AlphaBeta'));
  const ocr = { text: 'AlphaBeta\n', blocks: [{ paragraphs: [{ lines: [{ text: 'AlphaBeta\n', words: [
    { text: 'AlphaBeta', bbox: { x0: 31, y0: 85, x1: 120, y1: 105 } }
  ] }] }] }] };
  assert.equal(uncoveredOcrText(ocr, split.wordRegions, { singleTokenOnly: true }), ocr.text);
}
const repeated = await check('repeated native words keep separate word regions', 'BT /F1 20 Tf 30 200 Td (Same Same) Tj ET', ['Same Same']);
assert.deepEqual(repeated.wordRegions.map(region => region.text), ['Same', 'Same']);
assert.ok(repeated.wordRegions[0].x1 < repeated.wordRegions[1].x0);
const mixedCover = await check('hidden word in visible native item is not OCR coverage',
  'BT /F1 20 Tf 30 200 Td (Alpha Beta) Tj ET 1 1 1 rg 85 190 65 40 re f', ['Alpha Beta']);
assert.deepEqual(mixedCover.wordRegions.map(region => region.text), ['Alpha']);
console.log('PASS per-word visibility and repeated-position countercases');

const viewport = { convertToViewportPoint: (x, y) => [x, y] };
const item = { str: 'A', dir: 'ltr', transform: [10, 0, 0, 10, 5, 6], fontName: 'F' };
const run = { text: 'A', eligible: true, baseline: [5, 6], fontName: 'F' };
assert.deepEqual(bindTextRuns([item], [run, run], viewport), [], 'ambiguous renderer runs remain unknown');
assert.deepEqual(bindTextRuns([item, item], [run], viewport), [], 'merged native items remain unknown');
assert.deepEqual(bindTextRuns([{ ...item, dir: 'rtl' }], [run], viewport), [], 'RTL remains unknown');
assert.deepEqual(bindTextRuns(Array.from({ length: 10001 }, () => item), [run], viewport), [], 'oversized item set remains unknown');
assert.deepEqual(bindTextRuns([item], Array.from({ length: 4097 }, () => run), viewport), [], 'oversized render set remains unknown');
assert.deepEqual(bindTextRuns(Array.from({ length: 1000 }, () => item), Array.from({ length: 1000 }, () => run), viewport), [],
  'comparison budget terminates ambiguous binding without guessing');
console.log('PASS conservative matching and source pin negatives');

for (const value of ['Alpha\u0000Beta', 'Alpha\u0080Beta', 'Alpha\uFFFFBeta', 'Alpha\uE001Beta', 'Alpha\uFFFDBeta']) {
  assert.deepEqual(wordCandidates({ geometryEligible: true, glyphCount: 1, glyphs: [{ index: 0, text: value,
    supported: true, space: false, x0: 5, x1: 50, baseline: 30, height: 10 }] }), [],
  'a token affected by extraction hygiene cannot authorize suppression before OCR hygiene');
}
console.log('PASS undecodable or hygiene-changing tokens cannot authorize OCR suppression');

let allocations = 0;
const exhausted = await classifyPdfTextVisibility({ page: {}, textItems: [item],
  viewport: { width: 20, height: 20 }, createCanvas: () => { allocations++; throw new Error('MUST_NOT_ALLOCATE'); },
  setTextPaintObserver() {}, budget: { remainingProbes: 0, remainingPixels: 0 } });
assert.equal(exhausted.items.length, 1); assert.equal(allocations, 0);
console.log('PASS exhausted document budget skips allocation and rendering');

let unboundRenders = 0;
const sharedUnboundBudget = { remainingProbes: 1, remainingPixels: 400 };
for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
  const canvas = { width: 20, height: 20, getContext: () => ({ clearRect() {},
    getImageData: () => ({ data: new Uint8ClampedArray(1600) }) }) };
  const actual = await classifyPdfTextVisibility({ page: { render: () => { unboundRenders++; return { promise: Promise.resolve() }; } },
    textItems: [{ ...item, dir: 'rtl' }], viewport: { width: 20, height: 20, convertToViewportPoint: (x, y) => [x, y] },
    createCanvas: () => canvas, setTextPaintObserver() {}, budget: sharedUnboundBudget });
  assert.equal(actual.items.length, 1);
}
assert.equal(unboundRenders, 1, 'even an unbindable baseline render consumes the shared document budget');
assert.deepEqual(sharedUnboundBudget, { remainingProbes: 0, remainingPixels: 0 });
console.log('PASS baseline and unbindable-page rendering is charged to the shared budget');

let observer = null, renderCount = 0;
const fakeItems = [item, { ...item, str: 'B', transform: [10, 0, 0, 10, 10, 6] }];
const fakeCanvas = { width: 20, height: 20, getContext: () => ({ clearRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(1600) }) }) };
const fakePage = { render: () => ({ promise: Promise.resolve().then(() => {
  renderCount++;
  observer(run);
  observer({ ...run, text: renderCount === 4 ? 'Changed' : 'B', baseline: [10, 6] });
}) }) };
const unstable = await classifyPdfTextVisibility({ page: fakePage, textItems: fakeItems,
  viewport: { ...viewport, width: 20, height: 20 }, createCanvas: () => fakeCanvas,
  setTextPaintObserver: value => { observer = value; }, annotationMode: 0 });
assert.equal(unstable.hiddenIndices.size, 0, 'later event mismatch invalidates earlier classifications');
assert.equal(unstable.items.length, 2);
assert.equal(observer, null, 'observer released');
console.log('PASS event reproducibility failure discards all prior classifications');

async function renderOcrPixels(stream, ocrRaster, wrongToUnicode = false) {
  const task = pdfjs.getDocument({ data: pdf(stream, { wrongToUnicode }), CanvasFactory,
    isEvalSupported: false, stopAtErrors: true, disableAutoFetch: true,
    disableStream: true, disableRange: true, useWorkerFetch: false, useSystemFonts: false,
    enableXfa: false, verbosity: 0, standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/' });
  const document = await task.promise;
  const canvas = canvasApi.createCanvas(400, 300);
  try {
    const page = await document.getPage(1), content = await page.getTextContent({ disableNormalization: true });
    const viewport = page.getViewport({ scale: 1 });
    if (ocrRaster) await renderPdfOcrLayer({ page, canvas, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE });
    else await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white', annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
    return { pixels: Uint8ClampedArray.from(canvas.getContext('2d').getImageData(0, 0, 400, 300).data), png: canvas.toBuffer('image/png'),
      native: content.items.filter(item => item.str).map(item => item.str),
      ordered: nativeColumnOrder(content.items, viewport).filter(item => item.str).map(item => item.str) };
  } finally { canvas.width = 1; canvas.height = 1; await task.destroy(); }
}

const rasterAndVector = 'q 80 0 0 40 200 150 cm BI /W 2 /H 2 /CS /RGB /BPC 8 /F /AHx ID FF000000FF000000FF000000> EI Q 0 0 1 rg 240 80 40 30 re f';
const nativeStream = '0 0 0 rg BT /F1 20 Tf 30 200 Td (Native address 42) Tj ET';
const rasterExpected = await renderOcrPixels(rasterAndVector, false);
const ordinary = await renderOcrPixels(`${rasterAndVector} ${nativeStream}`, false);
const rasterUnchanged = await renderOcrPixels(`${rasterAndVector} ${nativeStream}`, true);
assert.deepEqual(rasterUnchanged.native, ['Native address 42'], 'complete native transcript remains available');
assert.deepEqual(rasterUnchanged.pixels, ordinary.pixels,
  'actual pinned PDF.js OCR raster preserves every original native/raster/vector pixel');
assert.notDeepEqual(ordinary.pixels, rasterExpected.pixels, 'counterfactual is causal, ordinary renderer does paint native glyphs');
console.log('PASS actual single-render OCR raster preserves all native/raster/vector paint and native text');

const glyphStream = `${rasterAndVector} 0 0 0 rg BT /F1 40 Tf 30 180 Td (ABC) Tj ET`;
const correctGlyphs = await renderOcrPixels(glyphStream, false);
const wrongMap = await renderOcrPixels(glyphStream, false, true);
const wrongMapOcr = await renderOcrPixels(glyphStream, true, true);
assert.deepEqual(correctGlyphs.native, ['ABC']); assert.deepEqual(wrongMap.native, ['XYZ']);
assert.deepEqual(wrongMap.pixels, correctGlyphs.pixels, 'ToUnicode changes semantic text but not visible ABC glyphs');
assert.deepEqual(wrongMapOcr.pixels, wrongMap.pixels, 'OCR must still see the complete visible ABC despite Unicode agreement on XYZ');
assert.notDeepEqual(wrongMapOcr.pixels, rasterExpected.pixels, 'visible glyphs cannot disappear into the graphics-only raster');
const wrongRegions = await check('wrong ToUnicode retains native search text without owning differently OCR-read glyphs',
  glyphStream, ['XYZ'], { wrongToUnicode: true });
assert.equal(wrongRegions.wordRegions.length, 1);
const independentAbc = { text: 'ABC\n', blocks: [{ paragraphs: [{ lines: [{ text: 'ABC\n', words: [
  { text: 'ABC', bbox: wrongRegions.wordRegions[0] }
] }] }] }] };
assert.equal(uncoveredOcrText(independentAbc, wrongRegions.wordRegions, { singleTokenOnly: true }), independentAbc.text,
  'exact post-OCR comparison retains independently read ABC rather than trusting the same untrusted ToUnicode twice');
console.log('PASS actual wrong-ToUnicode regression retains visible ABC pixels and exact differing OCR text');

const tableStream = 'BT /F1 16 Tf 10 250 Td (Name) Tj 170 0 Td (Account) Tj ET ' +
  'BT /F1 16 Tf 10 225 Td (Anna) Tj 170 0 Td (111) Tj ET ' +
  'BT /F1 16 Tf 10 200 Td (Bob) Tj 170 0 Td (222) Tj ET';
const tableNative = await renderOcrPixels(tableStream, true);
assert.deepEqual(tableNative.native.filter(text => text.trim()), ['Name', 'Account', 'Anna', '111', 'Bob', '222']);
assert.deepEqual(tableNative.ordered, tableNative.native,
  'actual pinned PDF.js table TextContent retains row-bound names/accounts rather than column prose');
console.log('PASS actual native table regression preserves Anna/111 and Bob/222 row binding');

for (const stream of [
  'BT /F1 20 Tf 3 Tr 30 200 Td (Search text) Tj ET',
  'BT /F1 20 Tf 7 Tr 30 200 Td (Clip text) Tj ET 0 0 1 rg 0 0 400 300 re f',
  'BT /F1 20 Tf 0.7 0.7 -0.7 0.7 100 100 Tm (Rotated) Tj ET',
  'q /GSweak gs BT /F1 20 Tf 30 200 Td (Weak) Tj ET Q'
]) {
  const original = await renderOcrPixels(stream, false), actual = await renderOcrPixels(stream, true);
  assert.deepEqual(actual.pixels, original.pixels, 'unknown/invisible/clipping/rotated/weak paint unchanged');
  assert.deepEqual(actual.native, original.native, 'search text always retained');
}
console.log('PASS actual clipping, rotation, transparent and invisible search-layer safety negatives');

// Real local Tesseract7/PSM3 countercase. Rasterize a separate text source into
// an inline PDF image (no native text layer for these words), then place native
// ABC with the incorrect XYZ map over a different area. Both independent image
// words and the visible differently mapped glyphs must reach the OCR result.
const imageText = await renderOcrPixels('BT /F1 32 Tf 30 60 Td (IMAGE DETAIL) Tj ET', false);
const rgb = Buffer.alloc(400 * 300 * 3);
for (let source = 0, destination = 0; source < imageText.pixels.length; source += 4) {
  rgb[destination++] = imageText.pixels[source]; rgb[destination++] = imageText.pixels[source + 1]; rgb[destination++] = imageText.pixels[source + 2];
}
const imageStream = `q 400 0 0 300 0 0 cm BI /W 400 /H 300 /CS /RGB /BPC 8 /F /AHx ID ${rgb.toString('hex')}> EI Q`;
const completeImageStream = `${imageStream} 0 0 0 rg BT /F1 40 Tf 30 180 Td (ABC) Tj ET`;
const completeImage = await renderOcrPixels(completeImageStream, true, true);
assert.deepEqual(completeImage.native, ['XYZ'], 'genuine image words are not present in native TextContent');
const completeRegions = await check('mixed inline image obtains its own source-bound native word regions',
  completeImageStream, ['XYZ'], { wrongToUnicode: true });
const modelRoot = path.join(root, 'native/ocr/pilot');
const lock = JSON.parse(fs.readFileSync(path.join(modelRoot, 'models.lock.json'), 'utf8'));
const { createHash } = await import('node:crypto');
for (const language of ['deu', 'eng']) {
  const model = fs.readFileSync(path.join(modelRoot, 'models', lock.models[language].file));
  assert.equal(model.length, lock.models[language].bytes);
  assert.equal(createHash('sha256').update(model).digest('hex'), lock.models[language].sha256);
}
const { createWorker, OEM } = require('../native/ocr/pilot/node_modules/tesseract.js');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'native/ocr/pilot/node_modules/tesseract.js/package.json'),'utf8')).version, '7.0.0');
let ocrWorker;
try {
  ocrWorker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, { langPath: path.join(modelRoot, 'models'),
    cacheMethod: 'none', gzip: false, logger() {}, errorHandler() {} });
  await ocrWorker.setParameters({ tessedit_pageseg_mode: '3' });
  const result = await ocrWorker.recognize(completeImage.png, {}, { text: true, blocks: true });
  assert.match(result.data.text, /ABC/u); assert.match(result.data.text, /IMAGE\s+DETAIL/u);
  const retained = uncoveredOcrText(result.data, completeRegions.wordRegions, { singleTokenOnly: true });
  assert.match(retained, /ABC/u); assert.match(retained, /IMAGE\s+DETAIL/u);
  await ocrWorker.setParameters({ tessedit_pageseg_mode: '6' });
  const singleBlock = await ocrWorker.recognize(completeImage.png, {}, { text: true, blocks: true });
  const singleRetained = uncoveredOcrText(singleBlock.data, completeRegions.wordRegions, { singleTokenOnly: true });
  assert.match(singleRetained, /ABC/u); assert.match(singleRetained, /IMAGE\s+DETAIL/u);
  // The identical production fixture is not native text: large vector-outline
  // CLOUD is classified as a graphic by AUTO on this page. SINGLE_BLOCK must
  // retain it without removing any pixels/native text or guessing its spelling.
  const { pdf: fixturePdf } = await import('./helpers/conversion-fixtures.mjs');
  const vectorTask = pdfjs.getDocument({ data: Uint8Array.from(fixturePdf([{text:'Native prose',vectorText:'CLOUD'}])), CanvasFactory,
    isEvalSupported:false,stopAtErrors:true,useWorkerFetch:false,useSystemFonts:false,enableXfa:false,verbosity:0,
    standardFontDataUrl:path.join(pdfRoot,'standard_fonts').replaceAll('\\','/')+'/' });
  let vectorCanvas;
  try {
    const doc=await vectorTask.promise,page=await doc.getPage(1),content=await page.getTextContent({disableNormalization:true});
    assert.deepEqual(content.items.filter(item=>item.str.trim()).map(item=>item.str),['Native prose']);
    const viewport=page.getViewport({scale:2}); vectorCanvas=canvasApi.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await renderPdfOcrLayer({page,canvas:vectorCanvas,viewport,annotationMode:pdfjs.AnnotationMode.DISABLE});
    const recognized=await ocrWorker.recognize(vectorCanvas.toBuffer('image/png'),{}, {text:true,blocks:true});
    assert.match(recognized.data.text,/CLOUD/u,'large vector-outline text reaches the actual selected OCR mode');
    assert.ok(recognized.data.blocks.some(block=>(block.paragraphs||[]).some(paragraph=>(paragraph.lines||[]).some(line=>
      (line.words||[]).some(word=>word.text==='CLOUD'&&word.bbox.y0>300)))),'vector recognition keeps actual source-pixel location');
  } finally {if(vectorCanvas){vectorCanvas.width=1;vectorCanvas.height=1;}await vectorTask.destroy();}
} finally { if (ocrWorker) await ocrWorker.terminate(); }
console.log('PASS actual local pinned Tesseract7 AUTO retains native-mismapped glyphs and genuine inline-image text');
console.log('PASS actual local pinned Tesseract7 SINGLE_BLOCK retains vector-outline CLOUD and wrong-ToUnicode image context');
