import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { derivePdfjsTextPaintModule } from '../scripts/lib/pdfjs-text-paint-hook.mjs';

const require = createRequire(import.meta.url);
const { bindTextRuns, classifyPdfTextVisibility, wordCandidates } = require('../plugins/data-secure/server/standalone/pdf-text-visibility');
const { uncoveredOcrText } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
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
function pdf(stream) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> /ExtGState << /GS0 << /ca 0 /CA 0 >> /GSweak << /ca 0.000000001 /CA 0.000000001 >> >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let output = '%PDF-1.7\n'; const offsets = [0];
  for (const [index, value] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${value}\nendobj\n`; }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output));
}
async function check(name, stream, expected, options = {}) {
  const task = pdfjs.getDocument({ data: pdf(stream), CanvasFactory,
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
