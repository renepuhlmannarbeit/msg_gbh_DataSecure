// Synthetic engineering experiment only; never imported by a product runtime.
// Re-render contact regions from original PDF bytes, not from an enlarged PNG.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { qualityCases } from './generate-quality-corpus.mjs';
const repo = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const [supplied, childMarker] = process.argv.slice(2), destination = path.resolve(supplied || '');
if (!supplied || path.dirname(destination) !== path.join(repo, 'dist') ||
    !/^pdf-contact-resolution-[a-z0-9-]+$/u.test(path.basename(destination))) throw Error('PDF_RESEARCH_SCOPE_REQUIRED');
if (!childMarker) {
  const child = spawn(process.execPath, ['--max-old-space-size=1024', import.meta.filename, destination, 'owned-reader'],
    { stdio: 'inherit', windowsHide: true });
  let timeout = false;
  const timer = setTimeout(() => { timeout = true; child.kill('SIGTERM'); }, 180000);
  const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); })
    .finally(() => clearTimeout(timer));
  if (timeout || result.signal || result.code !== 0) throw Error(timeout ? 'PDF_RESEARCH_DEADLINE' : 'PDF_RESEARCH_CHILD_FAILED');
  process.exit(0);
}
if (childMarker !== 'owned-reader' || fs.existsSync(destination)) throw Error('PDF_RESEARCH_EXCLUSIVE_DESTINATION_REQUIRED');
fs.mkdirSync(destination);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pilot = path.join(repo, 'native/ocr/pilot'), local = createRequire(path.join(pilot, 'package.json'));
const canvasApi = local('@napi-rs/canvas'), { createCanvas } = canvasApi;
for (const key of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[key] ||= canvasApi[key];
const pdfFile = path.join(repo, 'native/pdfjs/pilot/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pdfRoot = path.resolve(path.dirname(pdfFile), '../..');
const resource = directory => `${path.join(pdfRoot, directory).replaceAll('\\', '/')}/`;
const standardFonts = Object.fromEntries(fs.readdirSync(path.join(pdfRoot, 'standard_fonts'), { withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => [entry.name, hash(fs.readFileSync(path.join(pdfRoot, 'standard_fonts', entry.name)))]));
const { getDocument } = await import(pathToFileURL(pdfFile).href);
const { isContactLine } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { validBox, refineOcr } = require('../plugins/data-secure/server/standalone/ocr-refinement');
const weights = JSON.parse(fs.readFileSync(path.join(pilot, 'models.lock.json')));
for (const [language, pin] of Object.entries(weights.models)) {
  if (hash(fs.readFileSync(path.join(pilot, 'models', `${language}.traineddata`))) !== pin.sha256) throw Error('PDF_RESEARCH_WEIGHT_MISMATCH');
}
const inputs = (await qualityCases()).filter(item => item.format === 'pdf');
const frozen = inputs.map(item => ({ file: item.file, source_sha256: hash(item.bytes), variant: item.ocr_variant === 'text' ? 'native' : item.ocr_variant,
  expected_contacts: item.sample.reference.split('\n').filter(line => item.sample.entities.some(entity =>
    ['EMAIL', 'PHONE'].includes(entity.type) && line.includes(entity.value))) }));
fs.writeFileSync(path.join(destination, 'inputs.json'), JSON.stringify(frozen, null, 2), { flag: 'wx' });
for (const apiName of ['node:http', 'node:https']) { const api = require(apiName); api.get = api.request = () => { throw Error('PDF_RESEARCH_NETWORK_FORBIDDEN'); }; }
globalThis.fetch = () => { throw Error('PDF_RESEARCH_NETWORK_FORBIDDEN'); };
const { createWorker, OEM } = local('tesseract.js');
const options = { langPath: path.join(pilot, 'models'), gzip: false, cacheMethod: 'none', logging: false, logger() {} };
const normal = text => text.replace(/\s+/gu, ' ').trim();
function distance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) { let diagonal = previous[0]; previous[0] = row;
    for (let col = 1; col <= b.length; col++) { const old = previous[col]; previous[col] = Math.min(old + 1, previous[col - 1] + 1,
      diagonal + (a[row - 1] === b[col - 1] ? 0 : 1)); diagonal = old; } }
  return previous[b.length];
}
let baseline, reader;
const results = [];
try {
  baseline = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, options);
  reader = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, options);
  await reader.setParameters({ tessedit_pageseg_mode: '7' });
  for (const [index, input] of inputs.entries()) {
    if (hash(input.bytes) !== frozen[index].source_sha256) throw Error('PDF_RESEARCH_SOURCE_MUTATED');
    const task = getDocument({ data: Uint8Array.from(input.bytes), isEvalSupported: false, stopAtErrors: true,
      disableAutoFetch: true, disableStream: true, disableRange: true, useWorkerFetch: false,
      useSystemFonts: false, enableXfa: false, verbosity: 0, cMapUrl: resource('cmaps'), cMapPacked: true,
      standardFontDataUrl: resource('standard_fonts'), iccUrl: resource('iccs'), wasmUrl: resource('wasm') });
    try {
      const document = await task.promise;
      // First-page-only experiment. Does not claim full-document coverage.
      const page = await document.getPage(1), viewport = page.getViewport({ scale: 2 });
      if (Math.ceil(viewport.width) * Math.ceil(viewport.height) > 30000000) throw Error('PDF_RESEARCH_PAGE_BUDGET');
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
        const raw = await baseline.recognize(canvas.toBuffer('image/png'), {}, { text: true, blocks: true });
        const data = await refineOcr(raw.data, canvas, baseline, createCanvas);
        const lines = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []))
          .filter(line => isContactLine(line.text));
        const row = { ...frozen[index], page: 1, total_pages: document.numPages, baseline: data.text, regions: [] };
        let passes = 0, pixels = 0;
        for (const [lineIndex, line] of lines.entries()) {
          if (!validBox(line.bbox, canvas.width, canvas.height)) { row.regions.push({ skipped: 'GEOMETRY_INVALID' }); continue; }
          const box = line.bbox, x = Math.max(0, Math.floor(box.x0) - 12), y = Math.max(0, Math.floor(box.y0) - 12);
          const width = Math.min(canvas.width, Math.ceil(box.x1) + 12) - x, height = Math.min(canvas.height, Math.ceil(box.y1) + 12) - y;
          for (const scale of [2, 3, 4]) {
            const factor = scale / 2, w = Math.ceil(width * factor), h = Math.ceil(height * factor);
            if (passes >= 6 || w * h > 200000 || pixels + w * h > 2000000) { row.regions.push({ scale, skipped: 'ROI_BUDGET' }); continue; }
            passes++; pixels += w * h;
            const crop = createCanvas(w, h);
            try {
              await page.render({ canvasContext: crop.getContext('2d'), viewport: page.getViewport({ scale }),
                transform: [1, 0, 0, 1, -x * factor, -y * factor], background: 'white' }).promise;
              // Prove the translation/clipping independently of OCR or reference.
              if (scale === 2) {
                const sourcePixels = canvas.getContext('2d').getImageData(x, y, width, height).data;
                const cropPixels = crop.getContext('2d').getImageData(0, 0, w, h).data;
                if (!Buffer.from(sourcePixels).equals(Buffer.from(cropPixels))) throw Error('PDF_RESEARCH_CLIP_MISMATCH');
              }
              const bytes = crop.toBuffer('image/png');
              const prediction = await reader.recognize(bytes, {}, { text: true });
              // Independent reference is consulted only AFTER selection/render/read.
              const closest = [...frozen[index].expected_contacts].sort((a, b) => distance(normal(a), normal(line.text)) - distance(normal(b), normal(line.text)))[0];
              fs.writeFileSync(path.join(destination, `${input.sample.id}-${input.ocr_variant}-${lineIndex}-${scale}.png`), bytes, { flag: 'wx' });
              row.regions.push({ scale, geometry_at_scale_2: { x, y, width, height }, crop_sha256: hash(bytes),
                baseline: line.text, text: prediction.data.text.trim(), expected_line: closest,
                baseline_exact_line: normal(line.text) === normal(closest || ''),
                exact_line: normal(prediction.data.text) === normal(closest || '') });
            } finally { crop.width = crop.height = 1; }
          }
        }
        results.push(row);
      } finally { canvas.width = canvas.height = 1; }
    } finally { await task.destroy(); }
  }
} finally {
  const cleanup = await Promise.allSettled([baseline?.terminate(), reader?.terminate()]);
  if (cleanup.some(result => result.status === 'rejected')) throw Error('PDF_RESEARCH_CLEANUP_FAILED');
}
const summary = Object.fromEntries(['native', 'scan'].map(variant => [variant, Object.fromEntries([2, 3, 4].map(scale => {
  const passes = results.filter(row => row.variant === variant).flatMap(row => row.regions).filter(region => region.scale === scale && !region.skipped);
  return [scale, { passes: passes.length, exact_lines: passes.filter(pass => pass.exact_line).length,
    baseline_exact_lines: passes.filter(pass => pass.baseline_exact_line).length,
    new_errors: passes.filter(pass => pass.baseline_exact_line && !pass.exact_line).length }];
}))]));
fs.writeFileSync(path.join(destination, 'results.json'), JSON.stringify({ engineering_only: true, automatic_corrections: 0,
  script_sha256: hash(fs.readFileSync(import.meta.filename)), target: `${process.platform}-${process.arch}`,
  models: weights.models, tesseract: local('tesseract.js/package.json').version, canvas: local('@napi-rs/canvas/package.json').version,
  pdfjs_sha256: hash(fs.readFileSync(pdfFile)), standard_fonts: standardFonts, scale_2_pixel_clipping_verified: true, summary, results,
  limitations: ['First page only; Tesseract-selected contact lines, no full-document detection metric.',
    'Whole-line reference equality, not address-only precision.', 'Scan PDF may contain fixed-resolution raster images: more samples are not more source detail.',
    'Synthetic Windows engineering probe, not native Mac or exact release acceptance.', 'Bounded extra ROI pixels/passes and process deadline, no native OS memory quota.'] }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
