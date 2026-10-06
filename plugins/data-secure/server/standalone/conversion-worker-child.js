'use strict';

// One owned process per source. OCR uses worker_threads inside this process;
// there are no detached children, source paths, network reads or raw temp files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { extractMarkdownBuffer } = require('./markdown-extractor');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { unreadableSymbolRun, cleanOcrSymbolLines, visualNotices } = require('./markdown-visuals');
const { contactQuality, qualityNotice } = require('./ocr-quality');
const { refineOcr } = require('./ocr-refinement');
const { contactSpans } = require('../core/ocr-contact-review');
const { nativeTextSeparator, paintedTextGeometryAvailable, nativeTextRegions, uncoveredOcrText } = require('./pdf-text-layout');
const { SOURCE_TYPES, ERROR_CODES, MAX_INPUT_BYTES } = require('../core/conversion-worker-contract');
const { decodePng } = require('../images/png');
const { decodeBmp } = require('../images/bmp');
const { MAX_PIXELS, MAX_IMAGE_BYTES } = require('../images/common');
const root = path.join(__dirname, 'conversion-runtime');
const localRequire = createRequire(path.join(root, 'package.json'));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const errors = new Set(ERROR_CODES);
// Vendor console messages must not contaminate the framed response or logs.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = () => {};

function canvasApi() {
  if (localRequire('@napi-rs/canvas/package.json').version !== '1.0.7') fail('CONVERSION_POLICY_FAILED');
  return localRequire('@napi-rs/canvas');
}
function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    fail('CONVERSION_PIXEL_LIMIT');
  }
}
function checkedModels() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'models.lock.json'), 'utf8'));
  for (const language of ['deu', 'eng']) {
    const expected = lock.models?.[language];
    if (expected?.file !== `${language}.traineddata` || !/^[a-f0-9]{64}$/u.test(expected.sha256)) fail('CONVERSION_MODEL_INVALID');
    const model = fs.readFileSync(path.join(root, 'models', expected.file));
    if (model.length !== expected.bytes || crypto.createHash('sha256').update(model).digest('hex') !== expected.sha256) fail('CONVERSION_MODEL_INVALID');
  }
}

async function createOcr() {
  checkedModels();
  if (localRequire('tesseract.js/package.json').version !== '7.0.0') fail('CONVERSION_POLICY_FAILED');
  const { createWorker, OEM } = localRequire('tesseract.js');
  process.stderr.write('CONVERSION_OCR_STARTING\n');
  const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
    langPath: path.join(root, 'models'), cacheMethod: 'none', gzip: false, logging: false,
    logger() {}, errorHandler() {}
  });
  process.stderr.write('CONVERSION_OCR_READY\n');
  return worker;
}

async function recognize(canvas, ocr, nativeRegions = []) {
  // Keep word confidence local to this isolated worker. A high whole-page
  // confidence does not establish that a contact value was read correctly.
  const result = await ocr.recognize(canvas.toBuffer('image/png'), {}, { text: true, blocks: true });
  if (typeof result?.data?.text !== 'string') fail('CONVERSION_OCR_FAILED');
  if (result.data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
  // Re-segmentation stays in original pixel coordinates. Never change OCR
  // geometry when a native PDF mask is in use, or duplicate its exact text.
  const data = nativeRegions.length ? result.data : await refineOcr(result.data, canvas, ocr, canvasApi().createCanvas);
  if (data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
  const recognized = cleanOcrSymbolLines(nativeRegions.length ? uncoveredOcrText(data, nativeRegions) : data.text);
  return { ...recognized, quality: contactQuality(data, recognized.text), wordData: data.blocks };
}

async function imageMarkdown(bytes, type) {
  if (bytes.length > MAX_IMAGE_BYTES) fail('INPUT_FORMAT_LIMIT');
  const { createCanvas, ImageData, loadImage } = canvasApi();
  let canvas;
  try {
    if (type === 'jpeg') {
      // Buffer-only API: no URL, file name or SVG input can reach loadImage.
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) fail('CONVERSION_IMAGE_INVALID');
      const image = await loadImage(bytes);
      dimensions(image.width, image.height);
      canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
    } else {
      const decoded = type === 'png' ? decodePng(bytes) : decodeBmp(bytes);
      dimensions(decoded.width, decoded.height);
      canvas = createCanvas(decoded.width, decoded.height);
      // Composite transparency against white before OCR (not black text loss).
      const rgba = Uint8ClampedArray.from(decoded.rgba);
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        for (let channel = 0; channel < 3; channel++) rgba[i + channel] = Math.round((rgba[i + channel] * alpha + 255 * (255 - alpha)) / 255);
        rgba[i + 3] = 255;
      }
      canvas.getContext('2d').putImageData(new ImageData(rgba, decoded.width, decoded.height), 0, 0);
    }
  } catch (cause) { if (errors.has(cause?.code)) throw cause; fail('CONVERSION_IMAGE_INVALID'); }
  let ocr;
  try {
    ocr = await createOcr();
    const recognized = await recognize(canvas, ocr);
    const text = recognized.text;
    const reasons = ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'];
    if (recognized.quality.contact_lines.length) reasons.push('OCR_CONTACT_VALUES_UNVERIFIED');
    if (!text.trim()) reasons.push('OCR_TEXT_EMPTY');
    const notices = [visualNotices({ image: true, symbols: recognized.omitted }), qualityNotice(recognized.quality)]
      .filter(Boolean).join('\n\n');
    return createMarkdownExtraction({ source_type: type, markdown: `${text}${text ? '\n\n' : ''}${notices}`,
      ...(recognized.quality.contact_lines.length ? { ocr_contacts: contactSpans(text, recognized.quality) } : {}),
      coverage: { status: 'incomplete', reason_codes: reasons.sort() } });
  } finally {
    if (ocr) await ocr.terminate();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

function literal(text) {
  let longest = 2;
  for (const match of text.matchAll(/`+/gu)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`;
}

function populated(value) {
  if (!value) return false;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'object' ? Object.keys(value).length > 0 : true;
}

function additionalOcrText(nativeText, ocrText) {
  // Comparison only: the native text and every retained OCR line keep their
  // original spelling/whitespace. Rendering a text layer with its underlying
  // scan must not silently append the same page a second time.
  const comparable = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
  const native = comparable(nativeText);
  if (native === comparable(ocrText)) return '';
  const nativeLines = new Set(nativeText.split(/\r\n|\r|\n/u).map(comparable).filter(Boolean));
  const paddedNative = ` ${native} `;
  return (ocrText.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) || []).filter(line => {
    const value = comparable(line);
    return !value || (!nativeLines.has(value) && !paddedNative.includes(` ${value} `));
  }).join('');
}

async function pdfMarkdown(bytes, passiveObjects = false) {
  if (bytes.length > 25 * 1024 * 1024) fail('INPUT_FORMAT_LIMIT');
  const pdfRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  const { getDocument, OPS, AnnotationMode } = await import(pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.mjs')).href);
  // Actual painted operators, not merely image resources declared in the PDF.
  // These are the image operations of the bundled PDF.js display API.
  const imageOperations = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup, OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask]);
  const resource = directory => `${path.join(pdfRoot, directory).replaceAll('\\', '/')}/`;
  const task = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, stopAtErrors: true,
    disableAutoFetch: true, disableStream: true, disableRange: true, useWorkerFetch: false,
    useSystemFonts: false, enableXfa: false, verbosity: 0, cMapUrl: resource('cmaps'), cMapPacked: true,
    standardFontDataUrl: resource('standard_fonts'), iccUrl: resource('iccs'), wasmUrl: resource('wasm') });
  let ocr;
  try {
    const document = await task.promise;
    if (await document.getPermissions() !== null) fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    // Never execute forms, JavaScript or attachments. Markdown-only and
    // Standalone Markdown-first privacy may omit them with incomplete source
    // coverage; the privacy gate still inspects all extracted Markdown.
    if (document.isPureXfa) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    const hasDocumentObjects = await document.hasJSActions() || populated(await document.getFieldObjects()) ||
      populated(await document.getAttachments());
    if (hasDocumentObjects && !passiveObjects) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    const outline = await document.getOutline();
    const metadata = await document.getMetadata();
    const metadataKeys = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer',
      'CreationDate', 'ModDate', 'Trapped', 'Custom'];
    if (((Array.isArray(outline) && outline.length > 0) || metadata?.metadata !== null) && !passiveObjects) {
      fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    }
    const metadataLines = [];
    for (const key of metadataKeys) {
      const value = metadata?.info?.[key];
      if (value === undefined || value === '') continue;
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        if (passiveObjects) continue;
        fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
      }
      metadataLines.push(`${key}: ${String(value)}`);
    }
    const sections = metadataLines.length ? [`# Dokumentmetadaten\n\n${literal(metadataLines.join('\n'))}`] : [];
    const reasons = new Set(['SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']);
    const contacts = [];
    let total = sections.reduce((sum, section, index) => sum + section.length + (index ? 2 : 0), 0);
    if (total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      let canvas;
      try {
        if (page.isPureXfa) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        if (!passiveObjects && (populated(await page.getJSActions()) ||
            (await page.getAnnotations({ intent: 'display' })).length > 0)) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        const content = await page.getTextContent({ disableNormalization: true });
        let text = '';
        let omittedSymbols = false;
        let previousTextItem;
        for (const item of content.items) {
          // PDF.js may emit marked-content boundaries; these contain no text.
          if (!Object.hasOwn(item, 'str')) continue;
          if (typeof item.str !== 'string') fail('PDF_EXTRACTION_FAILED');
          if (item.str.trim() && !text.endsWith('\n')) {
            const separator = nativeTextSeparator(previousTextItem, item);
            if (separator === '\n' || (separator && !/\s/u.test(text.slice(-1)) && !/^\s/u.test(item.str))) text += separator;
          }
          if (unreadableSymbolRun(item.str)) {
            // Private font glyphs cannot be reconstructed from a code point.
            // Preserve a boundary and try local raster OCR below; do not emit
            // cryptic glyphs or silently concatenate their neighbouring words.
            omittedSymbols = true;
            text += item.hasEOL ? '\n' : ' ';
          } else text += item.str + (item.hasEOL ? '\n' : '');
          if (item.hasEOL) previousTextItem = undefined;
          else if (item.str.trim()) previousTextItem = item;
          if (text.length + total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        }
        const nativeText = text;
        const hasNativeText = Boolean(nativeText.trim());
        const operators = await page.getOperatorList();
        const hasPaintedImage = operators?.fnArray.some(operation => imageOperations.has(operation));
        let additional = '';
        let ocrNotice = '';
        let retainedContacts = [];
        let nativePrefix = true;
        if (!hasNativeText || hasPaintedImage || omittedSymbols) {
          const viewport = page.getViewport({ scale: 2 });
          const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
          dimensions(width, height);
          canvas = canvasApi().createCanvas(width, height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white',
            annotationMode: AnnotationMode.DISABLE }).promise;
          ocr ??= await createOcr(); // One session per document, never across customers.
          const regions = hasNativeText && paintedTextGeometryAvailable(operators, OPS)
            ? nativeTextRegions(content.items, content.styles, viewport) : [];
          const recognized = await recognize(canvas, ocr, regions);
          omittedSymbols ||= recognized.omitted;
          if (hasNativeText) additional = additionalOcrText(nativeText, recognized.text);
          else text = recognized.text;
          reasons.add('OCR_NOT_VERIFIED');
          // Only retained OCR text carries a warning. Native text suppressed
          // by the geometry mask is not falsely reported as an uncertain scan.
          const retained = hasNativeText ? additional : text;
          nativePrefix = hasNativeText;
          const quality = retained === recognized.text ? recognized.quality : contactQuality({ blocks: recognized.wordData }, retained);
          if (quality.contact_lines.length) {
            reasons.add('OCR_CONTACT_VALUES_UNVERIFIED');
            ocrNotice = qualityNotice(quality, number);
            retainedContacts = contactSpans(retained, quality, number);
          }
          if (!recognized.text.trim() && !hasNativeText) reasons.add('OCR_TEXT_EMPTY');
        }
        const notices = [visualNotices({ image: Boolean(hasPaintedImage), symbols: omittedSymbols }), ocrNotice]
          .filter(Boolean).join('\n\n');
        const section = `## Seite ${number}\n\n${literal(text)}` +
          (additional.trim() ? `\n\n### Zusätzlicher Bildtext (OCR)\n\n${literal(additional)}` : '') +
          (notices ? `\n\n${notices}` : '');
        // Bind to the emitted literal's payload, not a searched page heading
        // or matching native text. Fence length may vary with source backticks.
        if (retainedContacts.length) {
          const prefix = `## Seite ${number}\n\n` + (nativePrefix
            ? `${literal(text)}\n\n### Zusätzlicher Bildtext (OCR)\n\n` : '');
          const payload = nativePrefix ? additional : text;
          const fenceHeaderLength = literal(payload).indexOf('\n') + 1;
          const offset = total + (sections.length ? 2 : 0) + prefix.length + fenceHeaderLength;
          contacts.push(...retainedContacts.map(item => ({ ...item, start: offset + item.start, end: offset + item.end })));
        }
        total += section.length + (sections.length ? 2 : 0);
        if (total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        sections.push(section);
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
        page.cleanup();
      }
    }
    return createMarkdownExtraction({ source_type: 'pdf', markdown: sections.join('\n\n'),
      ...(contacts.length ? { ocr_contacts: contacts } : {}),
      coverage: { status: 'incomplete', reason_codes: [...reasons].sort() } });
  } catch (cause) {
    if (cause?.name === 'PasswordException') fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    if (errors.has(cause?.code)) throw cause;
    fail('PDF_EXTRACTION_FAILED');
  } finally {
    if (ocr) await ocr.terminate();
    await task.destroy(); // Outer supervisor owns a bounded exit even during teardown.
  }
}

async function main() {
  if (globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true || !process.permission || process.permission.has('fs.write') ||
      process.env.DISABLE_SYSTEM_FONTS_LOAD !== '1') fail('CONVERSION_POLICY_FAILED');
  const type = process.argv[2];
  const expectedBytes = Number(process.argv[3]);
  const policies = process.argv.slice(4);
  if (process.argv.length > 6 || !Object.values(SOURCE_TYPES).includes(type) ||
      !/^[1-9][0-9]*$/u.test(process.argv[3]) || !Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_INPUT_BYTES) fail('CONVERSION_INPUT_INVALID');
  if (new Set(policies).size !== policies.length || policies.some(policy =>
    !((policy === 'omit-docx-header-footer' && type === 'docx') ||
      (policy === 'passive-document-objects' && ['pdf', 'pptx'].includes(type))))) {
    fail('CONVERSION_INPUT_INVALID');
  }
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('INPUT_FILE_LIMIT');
    chunks.push(chunk);
  }
  if (size !== expectedBytes) fail('CONVERSION_INPUT_INCOMPLETE');
  const bytes = Buffer.concat(chunks);
  if (type === 'pdf') return pdfMarkdown(bytes, policies.includes('passive-document-objects'));
  if (['png', 'bmp', 'jpeg'].includes(type)) return imageMarkdown(bytes, type);
  return extractMarkdownBuffer(bytes, `.${type}`,
    policies.includes('omit-docx-header-footer') ? { omitDocxHeaderFooter: true } : {});
}

process.stdout.on('error', () => process.exit(2));
main().then(result => process.stdout.write(JSON.stringify({ schema: 'datasecure-conversion-response/1', ok: true, result }), () => process.exit(0)),
  cause => process.stdout.write(JSON.stringify({ schema: 'datasecure-conversion-response/1', ok: false,
    error_code: errors.has(cause?.code) ? cause.code : 'CONVERSION_EXTRACTION_FAILED' }), () => process.exit(2)));
