'use strict';

// One owned process per source. OCR uses worker_threads inside this process;
// there are no detached children, source paths, network reads or raw temp files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { extractMarkdownBuffer, extractOfficeMarkdownAndMedia } = require('./markdown-extractor');
const { prepareOfficeImagePlan, appendOfficeOcr } = require('./office-image-ocr');
const { markdownImageContent, extractMarkdownImageMedia } = require('./markdown-image-content');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { unreadableSymbolRun, cleanOcrSymbolLines } = require('./markdown-visuals');
const { contactQuality } = require('./ocr-quality');
const { readableText, readableNotice } = require('./readable-markdown');
const { refineOcr } = require('./ocr-refinement');
const { contactSpans } = require('../core/ocr-contact-review');
const { attachContactCrops } = require('./ocr-contact-crops');
const { nativeTextSeparator, paintedTextGeometryAvailable, nativeTextRegions, nativeSingleTokenRegions, uncoveredOcrText } = require('./pdf-text-layout');
const { SOURCE_TYPES, ERROR_CODES, MAX_INPUT_BYTES } = require('../core/conversion-worker-contract');
const { decodePng } = require('../images/png');
const { decodeBmp } = require('../images/bmp');
const { MAX_PIXELS, MAX_IMAGE_BYTES } = require('../images/common');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { pdfOcrAction } = require('../core/content-ocr-plan');
const { PDF_KEYS, validatePrivateDocumentMetadata } = require('../core/private-document-metadata');
const root = path.join(__dirname, 'conversion-runtime');
const localRequire = createRequire(path.join(root, 'package.json'));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const errors = new Set(ERROR_CODES);
let requestedContentOptions;
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

async function recognize(canvas, ocr, nativeRegions = [], singleTokenOnly = false) {
  // Keep word confidence local to this isolated worker. A high whole-page
  // confidence does not establish that a contact value was read correctly.
  const result = await ocr.recognize(canvas.toBuffer('image/png'), {}, { text: true, blocks: true });
  if (typeof result?.data?.text !== 'string') fail('CONVERSION_OCR_FAILED');
  if (result.data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
  // Re-segmentation stays in original pixel coordinates. Never change OCR
  // geometry when a native PDF mask is in use, or duplicate its exact text.
  const data = nativeRegions.length ? result.data : await refineOcr(result.data, canvas, ocr, canvasApi().createCanvas);
  if (data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
  const recognized = cleanOcrSymbolLines(nativeRegions.length ? uncoveredOcrText(data, nativeRegions, { singleTokenOnly }) : data.text);
  return { ...recognized, quality: contactQuality(data, recognized.text), wordData: data.blocks,
    cropText: nativeRegions.length ? null : data.text };
}

function hasRasterContrast(canvas) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  try {
    // Exact pixel fact, not a confidence/size heuristic: a uniformly colored
    // raster has no contrasting visible glyphs. In particular, avoid OCR
    // inventing a character from a one-pixel decorative image.
    const rgba = pixels.data;
    for (let index = 4; index < rgba.length; index += 4) {
      if (rgba[index] !== rgba[0] || rgba[index + 1] !== rgba[1] || rgba[index + 2] !== rgba[2] || rgba[index + 3] !== rgba[3]) return true;
    }
    return false;
  } finally { pixels.data.fill(0); }
}

async function imageMarkdown(bytes, type, markdownOutput, contentOptions, ownedOfficeSession) {
  if (contentOptions && !contentOptions.imageOcr) fail('IMAGE_OCR_REQUIRED');
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
    let recognized;
    if (hasRasterContrast(canvas)) {
      ocr = ownedOfficeSession?.ocr || await createOcr();
      if (ownedOfficeSession) ownedOfficeSession.ocr = ocr;
      recognized = await recognize(canvas, ocr);
    } else recognized = { text: '', omitted: false, quality: contactQuality(null, ''), wordData: [], cropText: '' };
    const text = recognized.text;
    if (contentOptions && !text.trim() && !ownedOfficeSession) fail('CONVERSION_OCR_TEXT_EMPTY');
    const reasons = ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'];
    if (recognized.quality.contact_lines.length) reasons.push('OCR_CONTACT_VALUES_UNVERIFIED');
    if (!text.trim()) reasons.push('OCR_TEXT_EMPTY');
    const contacts = recognized.quality.contact_lines.length ? attachContactCrops(
      contactSpans(text, recognized.quality), text, recognized.wordData, canvas,
      ownedOfficeSession?.cropBudget || { bytes: 0 }, recognized.cropText) : [];
    const rendered = readableText(text, contacts);
    const notices = markdownOutput === 'content-v1' ? '' : readableNotice({ image: true, symbols: recognized.omitted, ocr: Boolean(text.trim()), contacts: contacts.length > 0,
      disagreement: recognized.quality.disagreement_lines.length > 0,
      lowConfidence: recognized.quality.low_confidence_lines.length > 0,
      unscored: recognized.quality.unscored_contact_lines.length > 0 });
    return createMarkdownExtraction({ source_type: type, markdown: `${rendered.markdown}${text && notices ? '\n\n' : ''}${notices}`,
      ...(contentOptions ? { content_options: contentOptions } : {}),
      ...(contacts.length ? { ocr_contacts: rendered.contacts } : {}),
      coverage: { status: 'incomplete', reason_codes: reasons.sort() } });
  } finally {
    if (ocr && !ownedOfficeSession) await ocr.terminate();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

async function officeImageMarkdown(bytes, type, extractionOptions, contentOptions) {
  // One parser supplies both text and its authorized attachment list. Do not
  // re-open ZIP media separately or read Relationship targets from disk/URLs.
  const { extraction, attachments } = extractOfficeMarkdownAndMedia(bytes, `.${type}`, extractionOptions);
  const plan = prepareOfficeImagePlan(attachments);
  if (!plan.length) return createMarkdownExtraction({ source_type: type, markdown: extraction.markdown,
    coverage: extraction.coverage, content_options: contentOptions });
  const session = { ocr: null, cropBudget: { bytes: 0, pixels: 0 } };
  try {
    // imageMarkdown starts the shared session only after its image decoder has
    // accepted the first raster; metadata-only preflight is not decode proof.
    const recognized = [];
    let outputChars = extraction.markdown.length, contactCount = 0;
    for (const item of plan) {
      const result = await imageMarkdown(item.bytes, item.type, 'content-v1', contentOptions, session);
      outputChars += result.markdown.length + (result.markdown && outputChars ? 2 : 0);
      contactCount += result.ocr_contacts?.length || 0;
      // Bound the whole document while building it, not only after 150
      // individually valid image transcripts have accumulated in memory.
      if (outputChars > MAX_MARKDOWN_CHARS || contactCount > 5000) fail('TEXT_TOO_LARGE');
      recognized.push(result);
    }
    // Text is appended once per relationship-checked media part. Its original
    // paragraph/slide placement is not invented; source coverage remains incomplete.
    return appendOfficeOcr(extraction, recognized, contentOptions);
  } finally {
    try { if (session.ocr) await session.ocr.terminate(); }
    finally { for (const item of plan) item.bytes.fill(0); }
  }
}

async function markdownRasterImages(transformed, contentOptions) {
  // Planning every embedded raster before the first decoder/OCR call makes a
  // later external/unsupported reference an all-or-nothing policy failure.
  const plan = prepareOfficeImagePlan(transformed.media);
  const session = { ocr: null, cropBudget: { bytes: 0, pixels: 0 } }, recognized = [];
  try {
    let outputChars = transformed.markdown.length, contactCount = 0;
    for (const item of plan) {
      const result = await imageMarkdown(item.bytes, item.type, 'content-v1', contentOptions, session);
      outputChars += result.markdown.length + 4;
      contactCount += result.ocr_contacts?.length || 0;
      if (outputChars > MAX_MARKDOWN_CHARS || contactCount > 5000) fail('TEXT_TOO_LARGE');
      recognized.push(result);
    }
    // Keep source table/list/quote/code structure intact instead of injecting
    // multiline OCR into an inline image/table cell. Append raster transcripts
    // in actual image-node order, with private ordinal/crop provenance and
    // explicit incomplete visual/layout coverage, just like Office media OCR.
    const extraction = createMarkdownExtraction({ source_type: 'md', markdown: transformed.markdown, content_options: contentOptions,
      coverage: transformed.imageNodesRemoved ? { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED'] }
        : { status: 'complete', reason_codes: [] } });
    return appendOfficeOcr(extraction, recognized, contentOptions);
  } finally {
    try { if (session.ocr) await session.ocr.terminate(); }
    finally { for (const item of plan) item.bytes.fill(0); }
  }
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

async function pdfMarkdown(bytes, passiveObjects = false, markdownOutput, contentOptions) {
  if (bytes.length > 25 * 1024 * 1024) fail('INPUT_FORMAT_LIMIT');
  const pdfRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  const { getDocument, OPS, AnnotationMode } = await import(pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.mjs')).href);
  // Actual painted operators, not merely image resources declared in the PDF.
  // These are the image operations of the bundled PDF.js display API.
  const imageOperations = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup, OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask]);
  // A PDF may paint letters as vector outlines, with no image XObject and no
  // TextContent entry. This is a need-for-raster fact, never a scan role claim.
  const graphicOperations = new Set(['constructPath', 'rawFillPath', 'fill', 'eoFill', 'stroke', 'closeStroke',
    'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke', 'shadingFill'].map(key => OPS[key]).filter(Number.isInteger));
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
    const metadataKeys = PDF_KEYS;
    if (((Array.isArray(outline) && outline.length > 0) || metadata?.metadata !== null) && !passiveObjects) {
      fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    }
    const metadataLines = [];
    const metadataEntries = [];
    for (const key of metadataKeys) {
      const value = metadata?.info?.[key];
      if (value === undefined || value === '') continue;
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        if (passiveObjects) continue;
        fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
      }
      metadataLines.push(`${key}: ${String(value)}`);
      if (contentOptions) metadataEntries.push({ key, value: String(value) });
    }
    let privateMetadata;
    if (metadataEntries.length) {
      try { privateMetadata = validatePrivateDocumentMetadata({ schema: 'datasecure-private-document-metadata/1', source_type: 'pdf', entries: metadataEntries }); }
      catch { fail('CONVERSION_METADATA_LIMIT'); }
    }
    const sections = [];
    const reasons = new Set(['SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']);
    const contacts = [];
    const cropBudget = { bytes: 0 };
    const documentNotice = { image: false, symbols: false, ocr: false, contacts: false,
      disagreement: false, lowConfidence: false, unscored: false };
    let total = sections.reduce((sum, section, index) => sum + section.length + (index ? 2 : 0), 0);
    let meaningfulText = false;
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
        const hasNonTextGraphicPaint = operators?.fnArray.some(operation => graphicOperations.has(operation));
        let additional = '';
        let retainedContacts = [];
        let retainedOcr = false;
        const plan = contentOptions ? pdfOcrAction(contentOptions, { hasNativeText, hasPaintedImage: Boolean(hasPaintedImage),
          hasNonTextGraphicPaint: Boolean(hasNonTextGraphicPaint), omittedSymbols }) : null;
        if (plan?.action === 'scope-required') fail('PDF_OCR_SCOPE_REQUIRED');
        for (const code of plan?.reason_codes || []) reasons.add(code);
        if (plan ? plan.action === 'page' : (!hasNativeText || hasPaintedImage || omittedSymbols)) {
          const viewport = page.getViewport({ scale: 2 });
          const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
          dimensions(width, height);
          canvas = canvasApi().createCanvas(width, height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white',
            annotationMode: AnnotationMode.DISABLE }).promise;
          ocr ??= await createOcr(); // One session per document, never across customers.
          const regions = hasNativeText && paintedTextGeometryAvailable(operators, OPS, { strictMarkedContent: Boolean(contentOptions) })
            ? (contentOptions ? nativeSingleTokenRegions : nativeTextRegions)(content.items, content.styles, viewport) : [];
          const recognized = await recognize(canvas, ocr, regions, Boolean(contentOptions));
          omittedSymbols ||= recognized.omitted;
          // New contracts require visible geometric/exact duplication evidence.
          // No lexical/casefold suppression of equal text elsewhere on the page.
          if (hasNativeText) additional = contentOptions ? recognized.text : additionalOcrText(nativeText, recognized.text);
          else text = recognized.text;
          reasons.add('OCR_NOT_VERIFIED');
          // Only retained OCR text carries a warning. Native text suppressed
          // by the geometry mask is not falsely reported as an uncertain scan.
          const retained = hasNativeText ? additional : text;
          retainedOcr = Boolean(retained.trim());
          const quality = retained === recognized.text ? recognized.quality : contactQuality({ blocks: recognized.wordData }, retained);
          documentNotice.disagreement ||= quality.disagreement_lines.length > 0;
          documentNotice.lowConfidence ||= quality.low_confidence_lines.length > 0;
          documentNotice.unscored ||= quality.unscored_contact_lines.length > 0;
          if (quality.contact_lines.length) {
            reasons.add('OCR_CONTACT_VALUES_UNVERIFIED');
            retainedContacts = attachContactCrops(contactSpans(retained, quality, number),
              retained, recognized.wordData, canvas, cropBudget, recognized.cropText);
          }
          if (!recognized.text.trim() && !hasNativeText) reasons.add('OCR_TEXT_EMPTY');
        }
        meaningfulText ||= Boolean(text.trim() || additional.trim());
        const main = readableText(text, hasNativeText ? [] : retainedContacts);
        let section = `## Seite ${number}\n\n${main.markdown}`;
        let renderedContacts = main.contacts;
        let contactOffset = `## Seite ${number}\n\n`.length;
        if (additional.trim()) {
          const supplement = readableText(additional, retainedContacts);
          contactOffset = section.length + 2;
          section += `\n\n${supplement.markdown}`;
          renderedContacts = supplement.contacts;
        }
        const offset = total + (sections.length ? 2 : 0) + contactOffset;
        contacts.push(...renderedContacts.map(item => ({ ...item, start: offset + item.start, end: offset + item.end })));
        documentNotice.image ||= Boolean(hasPaintedImage);
        documentNotice.symbols ||= omittedSymbols;
        documentNotice.ocr ||= retainedOcr;
        documentNotice.contacts ||= retainedContacts.length > 0;
        total += section.length + (sections.length ? 2 : 0);
        if (total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        sections.push(section);
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
        page.cleanup();
      }
    }
    // Metadata and a single concise notice do not interrupt the page prose.
    // They are retained, not silently removed, and receive no invented values.
    if (contentOptions && !meaningfulText) fail(!contentOptions.scanOcr && !contentOptions.imageOcr
      ? 'PDF_TEXT_UNAVAILABLE_BY_POLICY' : 'CONVERSION_OCR_TEXT_EMPTY');
    if (metadataLines.length && (!contentOptions || markdownOutput === 'notes-v1')) sections.push(`## Dokumentinformationen\n\n${readableText(metadataLines.join('\n')).markdown}`);
    const notice = markdownOutput === 'content-v1' ? '' : readableNotice(documentNotice);
    if (notice) sections.push(notice);
    return createMarkdownExtraction({ source_type: 'pdf', markdown: sections.join('\n\n'),
      ...(contentOptions ? { content_options: contentOptions } : {}),
      ...(privateMetadata ? { private_document_metadata: privateMetadata } : {}),
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
  if (process.platform === 'darwin')
    require('../core/macos-static-ownership-guard').assertParserCore('CONVERSION_POLICY_FAILED');
  if (globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true || !process.permission || process.permission.has('fs.write') ||
      process.env.DISABLE_SYSTEM_FONTS_LOAD !== '1') fail('CONVERSION_POLICY_FAILED');
  const type = process.argv[2];
  const expectedBytes = Number(process.argv[3]);
  const policies = process.argv.slice(4);
  if (process.argv.length > 7 || !Object.values(SOURCE_TYPES).includes(type) ||
      !/^[1-9][0-9]*$/u.test(process.argv[3]) || !Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_INPUT_BYTES) fail('CONVERSION_INPUT_INVALID');
  if (new Set(policies).size !== policies.length || policies.some(policy =>
    !((policy === 'omit-docx-header-footer' && type === 'docx') ||
      (policy === 'passive-document-objects' && ['pdf', 'pptx'].includes(type)) ||
      ['markdown-output-content-v1', 'markdown-output-notes-v1'].includes(policy) || policy.startsWith('content-options-v1:')))) {
    fail('CONVERSION_INPUT_INVALID');
  }
  const outputPolicies = policies.filter(policy => policy.startsWith('markdown-output-'));
  const contentPolicies = policies.filter(policy => policy.startsWith('content-options-v1:'));
  if (outputPolicies.length > 1 || contentPolicies.length > 1 || (outputPolicies.length && contentPolicies.length)) fail('CONVERSION_INPUT_INVALID');
  if (contentPolicies.length) {
    try {
      const encoded = contentPolicies[0].slice('content-options-v1:'.length);
      if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) fail('CONVERSION_INPUT_INVALID');
      const bytes = Buffer.from(encoded, 'base64url');
      const options = validateContentOptions(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      if (Buffer.from(serializeContentOptions(options)).toString('base64url') !== encoded) fail('CONVERSION_INPUT_INVALID');
      requestedContentOptions = options;
    } catch { fail('CONVERSION_INPUT_INVALID'); }
  }
  const contentOptions = requestedContentOptions;
  const markdownOutput = contentOptions?.markdownOutput || outputPolicies[0]?.slice('markdown-output-'.length);
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('INPUT_FILE_LIMIT');
    chunks.push(chunk);
  }
  if (size !== expectedBytes) fail('CONVERSION_INPUT_INCOMPLETE');
  const bytes = Buffer.concat(chunks);
  if (type === 'pdf') return pdfMarkdown(bytes, policies.includes('passive-document-objects'), markdownOutput, contentOptions);
  if (['png', 'bmp', 'jpeg'].includes(type)) return imageMarkdown(bytes, type, markdownOutput, contentOptions);
  const extractionOptions = {
    ...(policies.includes('omit-docx-header-footer') ? { omitDocxHeaderFooter: true } : {}),
    ...(markdownOutput && type !== 'md' ? { markdownOutput } : {})
  };
  if (contentOptions?.imageOcr && ['docx', 'xlsx', 'pptx'].includes(type)) {
    return officeImageMarkdown(bytes, type, extractionOptions, contentOptions);
  }
  const result = extractMarkdownBuffer(bytes, `.${type}`, extractionOptions);
  if (type !== 'md' || (markdownOutput !== 'content-v1' && !contentOptions?.imageOcr)) return contentOptions
    ? createMarkdownExtraction({ source_type: result.source_type, markdown: result.markdown, coverage: result.coverage, content_options: contentOptions }) : result;
  for (const [name, version] of [['mdast-util-from-markdown', '2.0.2'], ['parse5', '7.3.0']]) {
    if (JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version !== version) fail('CONVERSION_POLICY_FAILED');
  }
  const { fromMarkdown } = await import(pathToFileURL(path.join(root, 'node_modules', 'mdast-util-from-markdown', 'index.js')).href);
  const { parseFragment } = await import(pathToFileURL(path.join(root, 'node_modules', 'parse5', 'dist', 'index.js')).href);
  if (contentOptions?.imageOcr) {
    const transformed = extractMarkdownImageMedia(result.markdown, { fromMarkdown, parseFragment });
    return markdownRasterImages(transformed, contentOptions);
  }
  const transformed = markdownImageContent(result.markdown, { fromMarkdown, parseFragment });
  if (markdownOutput !== 'content-v1') return createMarkdownExtraction({ source_type: type, markdown: result.markdown,
    coverage: result.coverage, content_options: contentOptions });
  return createMarkdownExtraction({ source_type: type, markdown: transformed.markdown,
    ...(contentOptions ? { content_options: contentOptions } : {}),
    coverage: transformed.imageNodesRemoved ? { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED'] } : result.coverage });
}

process.stdout.on('error', () => process.exit(2));
main().then(result => process.stdout.write(JSON.stringify({ schema: requestedContentOptions ? 'datasecure-conversion-response/2' : 'datasecure-conversion-response/1', ok: true, result }), () => process.exit(0)),
  cause => process.stdout.write(JSON.stringify({ schema: requestedContentOptions ? 'datasecure-conversion-response/2' : 'datasecure-conversion-response/1', ok: false,
    error_code: errors.has(cause?.code) ? cause.code : 'CONVERSION_EXTRACTION_FAILED' }), () => process.exit(2)));
