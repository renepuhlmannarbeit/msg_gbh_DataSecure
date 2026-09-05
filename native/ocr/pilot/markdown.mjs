// Engineering-only image conversion. A bounded child plus a Node preload guard
// is not an integrated OS sandbox and does not enable product image support.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import contract from '../../../plugins/data-secure/server/standalone/markdown-contract.js';
import imageLimits from '../../../plugins/data-secure/server/images/common.js';

const pilotDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(pilotDirectory, '../../../plugins/data-secure/server');
const SOURCE_TYPES = Object.freeze(['png', 'bmp']);
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 60_000;
const TERMINATION_GRACE_MS = 1000;
const MAX_RESPONSE_BYTES = contract.MAX_MARKDOWN_CHARS * 6 + 4096;
const ERROR_CODES = new Set(['OCR_INPUT_INVALID', 'OCR_INPUT_LIMIT', 'OCR_SOURCE_TYPE_UNSUPPORTED',
  'OCR_IMAGE_INVALID', 'OCR_BACKEND_UNAVAILABLE', 'OCR_MODEL_UNAVAILABLE', 'OCR_MODEL_INTEGRITY_FAILED',
  'OCR_NETWORK_POLICY_FAILED', 'OCR_EXTRACTION_FAILED', 'OCR_OUTPUT_INVALID', 'TEXT_TOO_LARGE']);

function failure(code) { return Object.assign(new Error(code), { code }); }

function childEnvironment() {
  // No inherited credentials, NODE_OPTIONS, model-path override or cache root.
  const environment = { DISABLE_SYSTEM_FONTS_LOAD: '1' };
  for (const key of ['SystemRoot', 'WINDIR']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function decodeResponse(bytes, sourceType, exitCode) {
  let message;
  try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('OCR_OUTPUT_INVALID'); }
  if (message?.schema !== 'datasecure-ocr-markdown-response/1') throw failure('OCR_OUTPUT_INVALID');
  if (exitCode === 2 && contract.exactKeys(message, ['schema', 'ok', 'error_code']) &&
      message.ok === false && ERROR_CODES.has(message.error_code)) throw failure(message.error_code);
  if (exitCode !== 0 || !contract.exactKeys(message, ['schema', 'ok', 'result']) || message.ok !== true) {
    throw failure('OCR_OUTPUT_INVALID');
  }
  try {
    const result = contract.validateMarkdownExtraction(message.result);
    const expectedReasons = ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'];
    if (!result.markdown.trim()) expectedReasons.push('OCR_TEXT_EMPTY');
    expectedReasons.sort();
    if (result.source_type !== sourceType || result.coverage.status !== 'incomplete' ||
        JSON.stringify(result.coverage.reason_codes) !== JSON.stringify(expectedReasons)) throw failure('OCR_OUTPUT_INVALID');
    return contract.createMarkdownExtraction({ source_type: result.source_type,
      markdown: result.markdown, coverage: result.coverage });
  } catch { throw failure('OCR_OUTPUT_INVALID'); }
}

export async function extractImageMarkdown(bytes, sourceType, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some((key) => !['signal', 'timeoutMs'].includes(key))) throw failure('OCR_INPUT_INVALID');
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw failure('OCR_INPUT_INVALID');
  if (signal?.aborted) throw failure('REQUEST_CANCELLED');
  if (!SOURCE_TYPES.includes(sourceType)) throw failure('OCR_SOURCE_TYPE_UNSUPPORTED');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) throw failure('OCR_INPUT_INVALID');
  if (bytes.byteLength > imageLimits.MAX_IMAGE_BYTES) throw failure('OCR_INPUT_LIMIT');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw failure('OCR_INPUT_INVALID');
  // Snapshot only the supplied view. Do not detach or subsequently mutate the
  // caller's buffer, and never let Tesseract interpret a string as a URL/path.
  const input = Buffer.from(bytes);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(process.execPath, [
        '--no-warnings', '--permission', `--allow-fs-read=${pilotDirectory}`,
        `--allow-fs-read=${serverDirectory}`, '--allow-worker', '--allow-addons',
        '--disable-proto=throw', '--max-old-space-size=512',
        `--require=${path.join(serverDirectory, 'network-deny.cjs')}`,
        path.join(pilotDirectory, 'markdown-worker.mjs'), sourceType
      ], { cwd: pilotDirectory, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
        windowsHide: true, env: childEnvironment() });
    } catch { reject(failure('OCR_BACKEND_UNAVAILABLE')); return; }
    const chunks = [];
    let outputBytes = 0;
    let diagnosticBytes = 0;
    let stoppedCode = null;
    let closed = false;
    let settled = false;
    let terminationTimer;
    const settleFailure = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      signal?.removeEventListener('abort', cancel);
      reject(failure(code));
    };
    const stop = (code) => {
      if (closed || stoppedCode) return;
      stoppedCode = code;
      // A refused kill or missing close event is not a confirmed shutdown.
      // Bound the reply anyway, report the distinct failure, never retry or
      // escalate to another process-killing primitive.
      terminationTimer = setTimeout(() => settleFailure('OCR_TERMINATION_UNCONFIRMED'), TERMINATION_GRACE_MS);
      // Tesseract creates worker_threads, not detached processes. Terminating
      // this exclusively owned child therefore also ends a hung worker startup.
      try { child.kill('SIGKILL'); } catch { /* bounded termination grace handles refusal */ }
    };
    const cancel = () => stop('REQUEST_CANCELLED');
    const timer = setTimeout(() => stop('OCR_TIMEOUT'), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.once('error', () => stop('OCR_BACKEND_UNAVAILABLE'));
    child.stdin.on('error', () => { /* early rejection/termination can close input before it is drained */ });
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_RESPONSE_BYTES) { stop('OCR_OUTPUT_INVALID'); return; }
      if (!stoppedCode) chunks.push(chunk);
    });
    // Drain without persisting or forwarding dependency messages or raw errors.
    // The owned worker emits only fixed phase codes; an excessive stream fails.
    child.stderr.on('data', (chunk) => {
      diagnosticBytes += chunk.length;
      if (diagnosticBytes > 16 * 1024) stop('OCR_OUTPUT_INVALID');
    });
    child.once('close', (exitCode) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      signal?.removeEventListener('abort', cancel);
      if (settled) return;
      if (stoppedCode) { settleFailure(stoppedCode); return; }
      settled = true;
      try { resolve(decodeResponse(Buffer.concat(chunks), sourceType, exitCode)); }
      catch (error) { reject(error); }
    });
    if (signal?.aborted) cancel();
    if (!stoppedCode) child.stdin.end(input);
  });
}

export const imageMarkdownEngineeringContract = Object.freeze({
  product_enabled: false, source_types: SOURCE_TYPES, ocr_languages: Object.freeze(['deu', 'eng']),
  network_policy: 'owned-process-and-worker-thread-preload-deny', integrated_os_sandbox: false,
  model_downloads: false, model_cache_writes: false, raw_intermediate_files: false,
  maximum_input_bytes: imageLimits.MAX_IMAGE_BYTES, maximum_pixels: imageLimits.MAX_PIXELS,
  maximum_markdown_characters: contract.MAX_MARKDOWN_CHARS,
  default_timeout_ms: DEFAULT_TIMEOUT_MS, maximum_timeout_ms: MAX_TIMEOUT_MS,
  termination_grace_ms: TERMINATION_GRACE_MS
});
