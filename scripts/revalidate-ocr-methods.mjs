// Engineering-only research. Never imported into either product runtime.
// Setup is the only network-enabled stage. Run accepts only this script's
// synthetic corpus, uses pinned local weights and never overwrites OCR text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { contactMethodCases } from '../benchmarks/ocr-contact-method-reference.mjs';
const repo = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const pilotRequire = createRequire(path.join(repo, 'native/ocr/pilot/package.json'));
const { createCanvas, GlobalFonts, loadImage } = pilotRequire('@napi-rs/canvas');
const { isContactLine } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { refineOcr } = require('../plugins/data-secure/server/standalone/ocr-refinement');
const { qualityCases } = await import('./generate-quality-corpus.mjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const modelRevision = '89d3a50e2c27e2e7cceeab0e944c25c807d5db4f';
const modelSha = '7888113072263cb471b93f66dd5e2ad70548dc526fa1ace760d0d973dd121498';
const configBlob = '89550cda19e4cebea8807bbbc632a8980bbc8880';
const runtimeVersion = '1.30.0';
const runtimeIntegrity = 'sha512-twhs1C2C/BFkz1yc5OY0KIU2GUq6DURO7hD4bx5Q2Qy3nAMJwRXW8xU3NVczE29VA9lolLOYepoD8fjTGOfIqw==';
const modelBase = `https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/${modelRevision}`;
const [action, supplied] = process.argv.slice(2);
const directory = path.resolve(supplied || '');
if (!supplied || path.dirname(directory) !== path.join(repo, 'dist') ||
    !/^ocr-methods-[a-z0-9-]+$/u.test(path.basename(directory))) throw Error('EXCLUSIVE_ENGINEERING_SCOPE_REQUIRED');
// A hard process deadline also covers startup and hung WASM/native inference.
// The heap cap is not a claim that native memory is OS-limited. All readers
// live in this owned child and its threads, not external helpers.
if (action === 'run') {
  const child = spawn(process.execPath, ['--max-old-space-size=2048', import.meta.filename, 'measure', directory],
    { stdio: 'inherit', windowsHide: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 600000);
  const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); })
    .finally(() => clearTimeout(timer));
  if (timedOut || result.signal || result.code !== 0) throw Error(timedOut ? 'RESEARCH_DEADLINE' : 'RESEARCH_CHILD_FAILED');
  process.exit(0);
}
async function download(url, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw Error('RESEARCH_DOWNLOAD_FAILED');
  const parts = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > limit) throw Error('RESEARCH_DOWNLOAD_LIMIT'); parts.push(part); }
  return Buffer.concat(parts);
}
function dictionary(yaml) {
  const tail = yaml.split('  character_dict:\n')[1];
  if (!tail) throw Error('MODEL_DICTIONARY_MISSING');
  const values = tail.trimEnd().split('\n').map(line => {
    if (!line.startsWith('  - ')) throw Error('MODEL_DICTIONARY_INVALID');
    const scalar = line.slice(4);
    return scalar.startsWith("'") && scalar.endsWith("'") ? scalar.slice(1, -1).replaceAll("''", "'") : scalar;
  });
  return ['blank', ...values, ' ']; // official CTCLabelDecode blank + use_space_char
}
if (action === 'setup') {
  if (fs.existsSync(directory)) throw Error('RESEARCH_DESTINATION_EXISTS');
  fs.mkdirSync(directory, { recursive: false });
  const model = await download(`${modelBase}/inference.onnx`, 9 * 1024 * 1024);
  if (model.length !== 8042023 || hash(model) !== modelSha) throw Error('MODEL_PIN_MISMATCH');
  const yaml = await download(`${modelBase}/inference.yml`, 10000);
  const gitBlob = crypto.createHash('sha1').update(`blob ${yaml.length}\0`).update(yaml).digest('hex');
  if (gitBlob !== configBlob) throw Error('MODEL_CONFIG_PIN_MISMATCH');
  const chars = dictionary(yaml.toString('utf8'));
  fs.writeFileSync(path.join(directory, 'inference.onnx'), model, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'inference.yml'), yaml, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'research-lock.json'), JSON.stringify({ engineering_only: true,
    model_revision: modelRevision, model_sha256: modelSha, config_sha256: hash(yaml), license: 'Apache-2.0',
    onnxruntime_node_version: runtimeVersion, onnxruntime_node_license: 'MIT',
    onnxruntime_node_integrity: runtimeIntegrity,
    chars, source: modelBase }, null, 2), { flag: 'wx' });
  console.log('Engineering model/config downloaded and hash-verified. Install the pinned runtime separately, with scripts disabled.');
} else if (action === 'measure') {
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'research-lock.json')));
  const model = fs.readFileSync(path.join(directory, 'inference.onnx'));
  const yaml = fs.readFileSync(path.join(directory, 'inference.yml'));
  const chars = dictionary(yaml.toString('utf8'));
  if (lock.model_revision !== modelRevision || lock.model_sha256 !== modelSha || hash(model) !== modelSha ||
      crypto.createHash('sha1').update(`blob ${yaml.length}\0`).update(yaml).digest('hex') !== configBlob ||
      hash(yaml) !== lock.config_sha256 || JSON.stringify(lock.chars) !== JSON.stringify(chars)) throw Error('RESEARCH_PIN_MISMATCH');
  const researchRequire = createRequire(path.join(directory, 'package.json'));
  const ort = researchRequire('onnxruntime-node');
  if (lock.onnxruntime_node_version !== runtimeVersion || researchRequire('onnxruntime-node/package.json').version !== runtimeVersion) throw Error('RESEARCH_RUNTIME_MISMATCH');
  const npmLock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json')));
  if (lock.onnxruntime_node_integrity !== runtimeIntegrity || npmLock.packages['node_modules/onnxruntime-node'].integrity !== runtimeIntegrity) throw Error('RESEARCH_RUNTIME_INTEGRITY_MISMATCH');
  const reportDirectory = path.join(directory, 'measurement');
  if (fs.existsSync(reportDirectory)) throw Error('RESEARCH_MEASUREMENT_EXISTS');
  fs.mkdirSync(reportDirectory); fs.mkdirSync(path.join(reportDirectory, 'inputs')); fs.mkdirSync(path.join(reportDirectory, 'diagnostics'));
  // This generator records the real font bytes. Never substitute an unknown
  // font and claim it was tested. The saved rasters are portable test inputs.
  const fontPaths = { arial: 'C:/Windows/Fonts/arial.ttf', times: 'C:/Windows/Fonts/times.ttf', consolas: 'C:/Windows/Fonts/consola.ttf' };
  const fonts = Object.fromEntries(Object.entries(fontPaths).map(([name, file]) => {
    const bytes = fs.readFileSync(file); if (!GlobalFonts.register(bytes, `Research-${name}`)) throw Error('FONT_REGISTRATION_FAILED');
    return [name, { sha256: hash(bytes), bytes: bytes.length }];
  }));
  const inputs = [];
  for (const sample of contactMethodCases) for (const variant of ['clean', 'native-small', 'skew-jpeg']) {
    const small = variant === 'native-small', size = small ? 14 : 26;
    const canvas = createCanvas(small ? 1000 : 1600, small ? 150 : 260), ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = `${size}px Research-${sample.font}`;
    if (variant === 'skew-jpeg') { ctx.translate(12, 0); ctx.rotate(0.8 * Math.PI / 180); }
    ctx.fillText(sample.line, 25, small ? 40 : 70); ctx.fillText(sample.noncontact, 25, small ? 75 : 140);
    const bytes = variant === 'skew-jpeg' ? canvas.toBuffer('image/jpeg', 60) : canvas.toBuffer('image/png');
    const file = `${sample.id}-${variant}.${variant === 'skew-jpeg' ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(reportDirectory, 'inputs', file), bytes, { flag: 'wx' });
    inputs.push({ ...sample, variant, file, bytes: bytes.length, sha256: hash(bytes) });
  }
  // Keep 32 previous variants (28 case IDs, including four scan PDFs) as a
  // regression cohort, separate from the new 24 logical cases/72 rasters.
  // Scan PDFs are rasterized at the same scale=2, not re-created from ground
  // truth. BMP uses the existing byte decoder, never a file/URL image API.
  const canvasApi = pilotRequire('@napi-rs/canvas');
  for (const key of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[key] ||= canvasApi[key];
  const { getDocument } = await import(pathToFileURL(path.join(repo, 'native/pdfjs/pilot/node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  for (const fixture of await qualityCases()) {
    if (!['png', 'jpg', 'jpeg', 'bmp'].includes(fixture.format) && fixture.ocr_variant !== 'scan') continue;
    let bytes = fixture.bytes, preparation = 'source-raster';
    if (fixture.format === 'bmp') {
      const { width, height, rgba } = require('../plugins/data-secure/server/images/bmp').decodeBmp(bytes);
      const canvas = createCanvas(width, height); canvas.getContext('2d').putImageData(new canvasApi.ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      bytes = canvas.toBuffer('image/png'); preparation = 'decoded-bmp'; canvas.width = canvas.height = 1; rgba.fill(0);
    } else if (fixture.format === 'pdf') {
      const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, disableFontFace: true });
      const document = await task.promise;
      try { const page = await document.getPage(1), viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
        bytes = canvas.toBuffer('image/png'); preparation = 'scan-pdf-scale-2'; canvas.width = canvas.height = 1;
      } finally { await task.destroy(); }
    }
    const file = `regression-${path.basename(fixture.file)}.${fixture.format === 'bmp' || fixture.format === 'pdf' ? 'png' : fixture.format}`;
    fs.writeFileSync(path.join(reportDirectory, 'inputs', file), bytes, { flag: 'wx' });
    inputs.push({ id: fixture.sample.id, split: 'regression', variant: fixture.ocr_variant, file, original_file: fixture.file,
      original_sha256: hash(fixture.bytes), preparation, expected_text: fixture.sample.reference,
      // Literal independently annotated EMAIL/PHONE occurrences, not a
      // detector or guessed label. Includes prose/parenthesized contacts.
      expected_lines: fixture.sample.reference.split('\n').filter(line => fixture.sample.entities.some(entity =>
        ['EMAIL', 'PHONE'].includes(entity.type) && line.includes(entity.value))),
      bytes: bytes.length, sha256: hash(bytes) });
  }
  // Freeze the independent corpus before either reader is started.
  const corpus = { schema: 'ocr-contact-method-corpus/1', fonts, source_sha256: hash(fs.readFileSync(path.join(repo,
    'benchmarks/ocr-contact-method-reference.mjs'))), inputs };
  fs.writeFileSync(path.join(reportDirectory, 'corpus.json'), JSON.stringify(corpus, null, 2), { flag: 'wx' });
  // No runtime network: explicit local Tesseract paths, no model/CDN fallback.
  for (const protocol of ['node:http', 'node:https']) { const api = require(protocol); api.request = api.get = () => { throw Error('RESEARCH_NETWORK_FORBIDDEN'); }; }
  globalThis.fetch = () => { throw Error('RESEARCH_NETWORK_FORBIDDEN'); };
  const pilot = path.join(repo, 'native/ocr/pilot');
  const tessLock = JSON.parse(fs.readFileSync(path.join(pilot, 'models.lock.json')));
  for (const [language, pin] of Object.entries(tessLock.models)) if (hash(fs.readFileSync(path.join(pilot, 'models', `${language}.traineddata`))) !== pin.sha256) throw Error('TESSERACT_PIN_MISMATCH');
  const { createWorker, OEM } = pilotRequire('tesseract.js');
  const options = { langPath: path.join(pilot, 'models'), gzip: false, cacheMethod: 'none', logging: false, logger() {} };
  const features = pilotRequire('wasm-feature-detect');
  const selectedCore = `tesseract-core-${await features.relaxedSimd() ? 'relaxedsimd-' : await features.simd() ? 'simd-' : ''}lstm`;
  const coreRoot = path.dirname(pilotRequire.resolve('tesseract.js-core/package.json'));
  const provenance = { script_sha256: hash(fs.readFileSync(import.meta.filename)),
    reference_sha256: corpus.source_sha256, corpus_sha256: hash(fs.readFileSync(path.join(reportDirectory, 'corpus.json'))),
    node: process.version, platform: process.platform, arch: process.arch,
    tesseract_js: pilotRequire('tesseract.js/package.json').version,
    tesseract_core: pilotRequire('tesseract.js-core/package.json').version, selected_core: selectedCore,
    selected_core_js_sha256: hash(fs.readFileSync(path.join(coreRoot, `${selectedCore}.wasm.js`))),
    selected_core_wasm_sha256: hash(fs.readFileSync(path.join(coreRoot, `${selectedCore}.wasm`))),
    models: tessLock.models, onnxruntime: runtimeVersion, onnxruntime_integrity: runtimeIntegrity,
    canvas: pilotRequire('@napi-rs/canvas/package.json').version,
    refinement_sha256: hash(fs.readFileSync(path.join(repo, 'plugins/data-secure/server/standalone/ocr-refinement.js'))),
    selection_sha256: hash(fs.readFileSync(path.join(repo, 'plugins/data-secure/server/standalone/ocr-quality.js'))) };
  let baseline, diagnostics, session;
  const results = [];
  const normal = value => value.replace(/\s+/gu, ' ').trim();
  // Levenshtein remains independent of the product and the reader confidence.
  function distance(a, b) {
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row++) { let diagonal = previous[0]; previous[0] = row;
      for (let col = 1; col <= b.length; col++) { const old = previous[col]; previous[col] = Math.min(old + 1, previous[col - 1] + 1, diagonal + (a[row - 1] === b[col - 1] ? 0 : 1)); diagonal = old; } }
    return previous[b.length];
  }
  function choices(hocr, text, expected) {
    const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos);/gu, match => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[match])
      .replace(/&#(x[a-f0-9]+|[0-9]+);/giu, (_, code) => String.fromCodePoint(code.startsWith('x') ? parseInt(code.slice(1), 16) : Number(code)));
    const groups = Array.from(hocr.matchAll(/<span class='ocrx_cinfo' id='lstm_choices_[^']+'>\s*((?:<span class='ocrx_cinfo' id='choice_[^']+' title='x_confs [^']+'>[\s\S]*?<\/span>\s*)+)<\/span>/gu), match =>
      Array.from(match[1].matchAll(/title='x_confs [^']+'>([\s\S]*?)<\/span>/gu), candidate => decode(candidate[1])));
    const observed = text.replace(/\s/gu, ''), truth = expected.replace(/\s/gu, '');
    // Unequal-length strings require a genuine insertion/deletion alignment,
    // not a guessed fixed-position character correction.
    if (observed.length !== truth.length || groups.length !== observed.length) return { groups: groups.length,
      position_comparable: false, edit_distance: distance(truth, observed), alternatives: groups };
    const substitutions = [];
    for (let index = 0; index < truth.length; index++) if (truth[index] !== observed[index]) substitutions.push({
      index, expected: truth[index], observed: observed[index], expected_in_choices: groups[index].includes(truth[index]) });
    return { groups: groups.length, position_comparable: true, substitutions, alternatives: groups };
  }
  async function paddle(canvas) {
    const h = 48, w = Math.max(320, Math.ceil(h * canvas.width / canvas.height));
    if (w > 3200) return { skipped: 'PADDLE_WIDTH_LIMIT' };
    const resized = createCanvas(w, h), ctx = resized.getContext('2d');
    const resizedWidth = Math.min(w, Math.ceil(h * canvas.width / canvas.height));
    ctx.drawImage(canvas, 0, 0, resizedWidth, h);
    const rgba = ctx.getImageData(0, 0, w, h).data, data = new Float32Array(3 * w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < resizedWidth; x++) for (let c = 0; c < 3; c++) {
      const p = y * w + x; data[c * w * h + p] = (rgba[p * 4 + (2 - c)] / 255 - 0.5) / 0.5;
    } // padding stays zero in normalized CHW space, as in the reference reader.
    const started = performance.now();
    const prediction = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, h, w]) });
    const output = prediction[session.outputNames[0]], [batch, steps, classes] = output.dims;
    if (batch !== 1 || classes !== chars.length) throw Error('PADDLE_CTC_DICTIONARY_MISMATCH');
    let last = -1, text = '';
    for (let t = 0; t < steps; t++) { let best = 0; for (let c = 1; c < classes; c++) if (output.data[t * classes + c] > output.data[t * classes + best]) best = c;
      if (best && best !== last) text += chars[best]; last = best; }
    data.fill(0); rgba.fill(0); resized.width = resized.height = 1;
    return { text, ms: performance.now() - started };
  }
  try {
    baseline = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, options);
    diagnostics = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, options);
    session = await ort.InferenceSession.create(model, { executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1, logSeverityLevel: 3 });
    await diagnostics.setParameters({ lstm_choice_mode: '2', hocr_char_boxes: '1', tessedit_pageseg_mode: '7' });
    for (const sample of inputs) {
      const started = performance.now(), bytes = fs.readFileSync(path.join(reportDirectory, 'inputs', sample.file));
      if (hash(bytes) !== sample.sha256) throw Error('CORPUS_MUTATED');
      const raster = await loadImage(bytes), canvas = createCanvas(raster.width, raster.height); canvas.getContext('2d').drawImage(raster, 0, 0);
      const raw = await baseline.recognize(bytes, {}, { text: true, blocks: true });
      const refined = await refineOcr(raw.data, canvas, baseline, createCanvas);
      const lines = (refined.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(p => p.lines || []));
      const selected = lines.filter(line => isContactLine(line.text));
      const expectedText = sample.expected_text || `${sample.line}\n${sample.noncontact}`;
      const expectedLines = sample.expected_lines;
      const row = { id: sample.id, split: sample.split, variant: sample.variant, file: sample.file,
        baseline: refined.text, baseline_exact: normal(refined.text) === normal(expectedText),
        baseline_contact_exact: JSON.stringify(selected.map(line => normal(line.text))) === JSON.stringify(expectedLines.map(normal)),
        factual_preserved: sample.noncontact ? normal(refined.text).includes(normal(sample.noncontact)) : null,
        baseline_edits: distance(normal(expectedText), normal(refined.text)),
        rois: [], missing_contact_geometry: selected.length === 0 && expectedLines.length > 0 };
      let passes = 0, pixels = 0;
      for (const [index, line] of selected.entries()) {
        const box = line.bbox;
        if (!box || !['x0', 'y0', 'x1', 'y1'].every(key => Number.isSafeInteger(box[key])) ||
            box.x0 < 0 || box.y0 < 0 || box.x1 <= box.x0 || box.y1 <= box.y0 ||
            box.x1 > canvas.width || box.y1 > canvas.height) { row.rois.push({ skipped: 'GEOMETRY_INVALID' }); continue; }
        const x = Math.max(0, box.x0 - 12), y = Math.max(0, box.y0 - 12), w = Math.min(canvas.width, box.x1 + 12) - x, h = Math.min(canvas.height, box.y1 + 12) - y;
        for (const scale of [1, 1.5, 2]) {
          const cw = Math.round(w * scale), ch = Math.round(h * scale), cost = cw * ch;
          if (passes >= 6 || cost > 200000 || pixels + cost > 2000000) { row.rois.push({ skipped: 'ROI_BUDGET', index, scale }); continue; }
          passes++; pixels += cost;
          const crop = createCanvas(cw, ch); crop.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, cw, ch);
          const passStart = performance.now();
          const reading = await diagnostics.recognize(crop.toBuffer('image/png'), {}, { text: true, blocks: true, hocr: true, imageGrey: true, imageBinary: true });
          const other = await paddle(crop), hocr = reading.data.hocr || '';
          const closest = [...expectedLines].sort((a, b) => distance(normal(a), normal(line.text)) - distance(normal(b), normal(line.text)))[0] || '';
          const kind = sample.split === 'regression' ? closest.startsWith('Telefon:') ? 'phone' : 'email' : sample.kind;
          const prefix = `${sample.id}-${sample.variant}-${index}-${String(scale).replace('.', '_')}`;
          fs.writeFileSync(path.join(reportDirectory, 'diagnostics', `${prefix}.hocr`), hocr);
          fs.writeFileSync(path.join(reportDirectory, 'diagnostics', `${prefix}.png`), crop.toBuffer('image/png'));
          for (const kind of ['imageGrey', 'imageBinary']) if (reading.data[kind]) fs.writeFileSync(path.join(reportDirectory, 'diagnostics', `${prefix}-${kind}.png`), Buffer.from(reading.data[kind].replace(/^data:image\/png;base64,/u, ''), 'base64'));
          // Ground truth is used here, after both predictions, for measurement
          // only. No reference-dependent ROI selection or correction.
          row.rois.push({ index, scale, kind, geometry: { x, y, width: w, height: h }, tesseract: reading.data.text.trim(), paddle: other,
            choices: choices(hocr, reading.data.text, closest),
            baseline_contact_exact: expectedLines.some(expected => normal(line.text) === normal(expected)),
            tesseract_contact_exact: expectedLines.some(expected => normal(reading.data.text) === normal(expected)),
            paddle_contact_exact: !other.skipped && expectedLines.some(expected => normal(other.text) === normal(expected)),
            reader_disagreement: !other.skipped && normal(other.text) !== normal(reading.data.text),
            ms: performance.now() - passStart });
          crop.width = crop.height = 1;
        }
      }
      row.ms = performance.now() - started; results.push(row); canvas.width = canvas.height = 1;
      if (results.length % 12 === 0) console.log(`${results.length}/${inputs.length} synthetic variants measured`);
    }
  } finally {
    const cleanup = await Promise.allSettled([baseline?.terminate(), diagnostics?.terminate(), session?.release()]);
    if (cleanup.some(result => result.status === 'rejected')) throw Error('RESEARCH_CLEANUP_FAILED');
  }
  const summary = Object.fromEntries(['development', 'holdout', 'regression'].map(split => {
    const rows = results.filter(row => row.split === split);
    return [split, { variants: rows.length, baseline_exact: rows.filter(row => row.baseline_exact).length,
      baseline_contact_exact: rows.filter(row => row.baseline_contact_exact).length,
      missing_contact_geometry: rows.filter(row => row.missing_contact_geometry).length,
      scales: Object.fromEntries([1, 1.5, 2].map(scale => {
        const passes = rows.flatMap(row => row.rois).filter(roi => roi.scale === scale && !roi.skipped);
        return [scale, { passes: passes.length, tesseract_contact_exact: passes.filter(roi => roi.tesseract_contact_exact).length,
          baseline_contact_exact: passes.filter(roi => roi.baseline_contact_exact).length,
          paddle_contact_exact: passes.filter(roi => roi.paddle_contact_exact).length,
          by_kind: Object.fromEntries(['email', 'phone', 'damaged-email', 'negative'].map(kind => {
            const sameKind = passes.filter(roi => roi.kind === kind);
            return [kind, { passes: sameKind.length, baseline_exact_lines: sameKind.filter(roi => roi.baseline_contact_exact).length,
              tesseract_exact_lines: sameKind.filter(roi => roi.tesseract_contact_exact).length,
              paddle_exact_lines: sameKind.filter(roi => roi.paddle_contact_exact).length }];
          })),
          tesseract_new_errors: passes.filter(roi => roi.baseline_contact_exact && !roi.tesseract_contact_exact).length,
          paddle_new_errors: passes.filter(roi => roi.baseline_contact_exact && !roi.paddle_contact_exact).length,
          comparable_choice_substitutions: passes.flatMap(roi => roi.choices.substitutions || []).length,
          truth_in_choices: passes.flatMap(roi => roi.choices.substitutions || []).filter(item => item.expected_in_choices).length,
          reader_disagreement: passes.filter(roi => roi.reader_disagreement).length }];
      })) }];
  }));
  fs.writeFileSync(path.join(reportDirectory, 'results.json'), JSON.stringify({ engineering_only: true, automatic_corrections: 0,
    product_model_changed: false, license: lock.license, model_sha256: modelSha, provenance,
    limitations: ['Whole-line equality includes labels/whitespace, not independent address accuracy.',
      'ROI selection uses the production Tesseract contact detector; no independent Paddle detection.',
      'Paddle Canvas preprocessing is not numerically validated against OpenCV.',
      'Upscaling existing rasters is not new PDF raster detail.', 'Ground-truth alternatives are diagnostic observations, not automatic corrections.',
      'Node heap/deadline are bounded; native memory has no OS quota in this synthetic experiment.',
      'No Mac/native WebView/exact-release acceptance is implied.'],
    fonts, summary, results }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(summary, null, 2));
} else throw Error('USE_SETUP_OR_RUN');
