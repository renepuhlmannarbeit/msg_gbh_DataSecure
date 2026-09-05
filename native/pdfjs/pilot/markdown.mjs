// Engineering converter, deliberately not imported by the shipped product.
// Product activation also needs the supervised worker, runtime inventory and
// full object/OCR coverage. PDF text extraction alone cannot prove completeness.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import contract from '../../../plugins/data-secure/server/standalone/markdown-contract.js';

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 8_000_000;
const CLEANUP_TIMEOUT_MS = 1000;
const resources = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules', 'pdfjs-dist');
const localResource = (directory) => `${path.join(resources, directory).replaceAll('\\', '/')}/`;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function localPdfOptions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES) {
    fail('PDF_INPUT_INVALID');
  }
  // PDF.js may transfer ownership of the array: never detach caller/source bytes.
  return Object.freeze({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    stopAtErrors: true,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    useWorkerFetch: false,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
    cMapUrl: localResource('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: localResource('standard_fonts'),
    iccUrl: localResource('iccs'),
    wasmUrl: localResource('wasm')
  });
}

function populated(value) {
  if (!value) return false;
  if (value instanceof Map) return value.size > 0;
  return Object.keys(value).length > 0;
}

// A literal fenced block preserves extracted text without converting a URL,
// HTML tag or source-provided Markdown into active presentation instructions.
function literalText(text) {
  let longest = 2;
  for (const match of text.matchAll(/`+/gu)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`;
}

async function extractDocumentMarkdown(bytes, { signal } = {}, scan = false) {
  if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function')) fail('PDF_INPUT_INVALID');
  if (signal?.aborted) fail('REQUEST_CANCELLED');
  const task = getDocument(localPdfOptions(bytes));
  let destruction;
  const destroyOnce = () => {
    destruction ??= Promise.resolve().then(() => task.destroy()).then(() => true, () => false);
    return destruction;
  };
  const abort = () => { void destroyOnce(); };
  // PDF.js destruction does not settle every outstanding loading/page promise.
  // Race each wait against cancellation, removing its listener afterwards so
  // documents with many pages cannot accumulate cancellation handlers.
  const waitFor = async (operation) => {
    if (signal?.aborted) fail('REQUEST_CANCELLED');
    if (!signal) return operation();
    let rejectCancellation;
    const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
    const cancelWait = () => rejectCancellation(Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' }));
    signal.addEventListener('abort', cancelWait, { once: true });
    try {
      if (signal.aborted) cancelWait();
      return await Promise.race([
        Promise.resolve().then(() => {
          if (signal.aborted) fail('REQUEST_CANCELLED');
          return operation();
        }),
        cancellation
      ]);
    } finally { signal.removeEventListener('abort', cancelWait); }
  };
  const finishCleanup = async () => {
    let timer;
    try {
      return await Promise.race([
        destroyOnce(),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), CLEANUP_TIMEOUT_MS); })
      ]);
    } finally { clearTimeout(timer); }
  };
  let processingFailed = false;
  let ocrTerminationUnconfirmed = false;
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const document = await waitFor(() => task.promise);
    if (signal?.aborted) fail('REQUEST_CANCELLED');
    // No password UI or active content execution in the converter.
    if (await waitFor(() => document.getPermissions()) !== null) fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    if (document.isPureXfa || populated(await waitFor(() => document.getFieldObjects())) ||
        populated(await waitFor(() => document.getAttachments())) || await waitFor(() => document.hasJSActions()) ||
        populated(await waitFor(() => document.getJSActions()))) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    const sections = [];
    const reasons = new Set(['SOURCE_COVERAGE_UNVERIFIED']);
    let characters = 0;
    for (let number = 1; number <= document.numPages; number++) {
      if (signal?.aborted) fail('REQUEST_CANCELLED');
      const page = await waitFor(() => document.getPage(number));
      try {
        if (page.isPureXfa || populated(await waitFor(() => page.getJSActions()))) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        const annotations = await waitFor(() => page.getAnnotations());
        if (annotations.length) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        let text = '';
        if (scan) {
          // Rasterise the whole page exactly once. Do not concatenate an
          // existing OCR/text layer with a second OCR result (duplicate text).
          const { extractRenderedPage } = await waitFor(() => import('./scan-page.mjs'));
          // Rendering owns its PDF cancellation race. Once OCR starts, its
          // child-process adapter must confirm close (or explicitly report a
          // bounded unconfirmed termination) before this outer operation ends.
          // A generic waitFor race would return while OCR was still running.
          let ocr;
          try { ocr = await extractRenderedPage(page, { signal }); }
          catch (error) {
            ocrTerminationUnconfirmed = error?.code === 'OCR_TERMINATION_UNCONFIRMED';
            throw error;
          }
          contract.validateMarkdownExtraction(ocr);
          text = ocr.markdown;
          for (const reason of ocr.coverage.reason_codes) reasons.add(reason);
        } else {
          const content = await waitFor(() => page.getTextContent({ disableNormalization: true }));
          for (const item of content.items) {
            if (typeof item.str !== 'string') fail('PDF_TEXT_RESULT_INVALID');
            const value = item.str + (item.hasEOL ? '\n' : '');
            if (characters + text.length + value.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
            text += value;
          }
        }
        if (!text.trim()) reasons.add('OCR_TEXT_EMPTY');
        const section = `## Seite ${number}\n\n${literalText(text)}`;
        characters += section.length + (sections.length ? 2 : 0);
        if (characters > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        sections.push(section);
      } finally {
        try { page.cleanup(); } catch (error) { if (!signal?.aborted && !ocrTerminationUnconfirmed) throw error; }
      }
    }
    if (signal?.aborted) fail('REQUEST_CANCELLED');
    return contract.createMarkdownExtraction({
      source_type: 'pdf',
      markdown: sections.join('\n\n'),
      coverage: { status: 'incomplete', reason_codes: [...reasons].sort() }
    });
  } catch (error) {
    processingFailed = true;
    if (ocrTerminationUnconfirmed) fail('OCR_TERMINATION_UNCONFIRMED');
    if (signal?.aborted) fail('REQUEST_CANCELLED');
    if (error?.name === 'PasswordException') fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    if (['SOURCE_ENCRYPTED_UNSUPPORTED', 'PDF_OBJECT_COVERAGE_UNVERIFIED', 'PDF_TEXT_RESULT_INVALID', 'TEXT_TOO_LARGE', 'PDF_PIXEL_LIMIT'].includes(error?.code)) throw error;
    fail('PDF_EXTRACTION_FAILED');
  } finally {
    signal?.removeEventListener('abort', abort);
    // This engineering wrapper must not turn a pending PDF.js teardown into
    // an unanswered cancellation. A future supervised product worker still
    // owns the hard process/resource boundary; this is not a hard-kill claim.
    const cleaned = await finishCleanup();
    if (signal?.aborted && !ocrTerminationUnconfirmed) fail('REQUEST_CANCELLED');
    if (!cleaned && !processingFailed) fail('PDF_CLEANUP_FAILED');
  }
}

export function extractPdfMarkdown(bytes, options = {}) {
  return extractDocumentMarkdown(bytes, options, false);
}

export function extractScanPdfMarkdown(bytes, options = {}) {
  return extractDocumentMarkdown(bytes, options, true);
}

export const pdfConversionEngineeringContract = Object.freeze({
  product_enabled: false, network_allowed: false, page_limit: null,
  maximum_input_bytes: MAX_PDF_BYTES, maximum_markdown_characters: MAX_MARKDOWN_CHARS,
  coverage: 'text-extraction-only-not-full-document-proof'
});
