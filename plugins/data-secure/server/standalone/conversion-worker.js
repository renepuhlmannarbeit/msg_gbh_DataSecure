'use strict';

const path = require('node:path');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const { types } = require('node:util');
const { resolveConversionRuntime } = require('./conversion-runtime-resolver');
const { verifyNativeLauncherArtifact } = require('../native-launcher');
const { verifyPosixSupervisor } = require('../posix-supervisor');
const { createMarkdownExtraction, validateMarkdownExtractionForOptions, exactKeys, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { SOURCE_TYPES, ERROR_CODES, MAX_INPUT_BYTES } = require('../core/conversion-worker-contract');
const ERROR_SET = new Set(ERROR_CODES);
const DEFAULT_TIMEOUT_MS = 300_000;
const TERMINATION_GRACE_MS = 1500;
// Transient private cropped PNGs have their own explicit 2 MiB compressed
// budget (base64 overhead included), independent of Markdown size.
const MAX_RESPONSE_BYTES = MAX_MARKDOWN_CHARS * 6 + Math.ceil(2 * 1024 * 1024 / 3) * 4 + 256 * 1024;
const error = code => Object.assign(new Error('Die lokale Markdown-Konvertierung konnte nicht abgeschlossen werden.'), { code });
const intrinsicAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const intrinsicAddListener = EventTarget.prototype.addEventListener;
const intrinsicRemoveListener = EventTarget.prototype.removeEventListener;

function checkedAbortSignal(signal) {
  if (signal === undefined) return undefined;
  const check = () => {
    if (!signal || types.isProxy(signal) || Object.getPrototypeOf(signal) !== AbortSignal.prototype ||
        Reflect.ownKeys(Object.getOwnPropertyDescriptors(signal)).some(key =>
          !Object.hasOwn(Object.getOwnPropertyDescriptor(signal, key), 'value'))) throw error('CONVERSION_INPUT_INVALID');
  };
  const read = () => { try { check(); return intrinsicAborted.call(signal); } catch { throw error('CONVERSION_INPUT_INVALID'); } };
  read(); // Native brand check before runtime/source processing, no own getter.
  return Object.freeze({ aborted: read,
    subscribe(listener) { try { check(); intrinsicAddListener.call(signal, 'abort', listener, { once: true }); } catch { throw error('CONVERSION_INPUT_INVALID'); } },
    unsubscribe(listener) { try { check(); intrinsicRemoveListener.call(signal, 'abort', listener); } catch { /* Cleanup cannot replace the bounded result. */ } }
  });
}

// Classify the OS fact, not a guessed cause (for example antivirus software).
// Raw vendor messages, executable paths and source content never escape here.
function conversionStartFailureCode(failure, executable, io = fs) {
  if (['EACCES', 'EPERM'].includes(failure?.code)) return 'CONVERSION_EXECUTABLE_DENIED';
  if (['ENOEXEC', 'EFTYPE'].includes(failure?.code)) return 'CONVERSION_ARCHITECTURE_INVALID';
  if (['ENOENT', 'ENOTDIR'].includes(failure?.code)) {
    try {
      if (io.lstatSync(executable).isFile()) return 'CONVERSION_DEPENDENCY_MISSING';
    } catch { /* Missing executable or an unresolvable path, not a known policy block. */ }
    return 'CONVERSION_EXECUTABLE_MISSING';
  }
  return 'CONVERSION_START_FAILED';
}

function nativeConversionExitCode(code, platform = process.platform) {
  // These codes are reserved by both native launchers; the untrusted parser
  // guard prevents a document process from forging the supervisor's facts.
  if (['win32', 'darwin', 'linux'].includes(platform)) {
    if (code === 127) return 'CONVERSION_EXECUTABLE_MISSING';
    if (code === 128) return 'CONVERSION_EXECUTABLE_DENIED';
    if (code === 129) return 'CONVERSION_ARCHITECTURE_INVALID';
  }
  if (platform !== 'win32' && code === 132) return 'CONVERSION_DEPENDENCY_MISSING';
  if (platform !== 'win32' && [130, 131, 134, 135].includes(code)) return 'CONVERSION_LIMIT_SETUP_FAILED';
  if (code === 125) return 'CONVERSION_RESOURCE_LIMIT';
  if (Number.isInteger(code) && code >= 120 && code <= 126) return 'CONVERSION_ISOLATION_FAILED';
  return null;
}

function launch(runtime, sourceType, inputBytes, timeoutMs, omitDocxHeaderFooter, passiveObjects, markdownOutput, contentOptions) {
  const server = path.resolve(__dirname, '..');
  const script = path.join(__dirname, 'conversion-worker-child.js');
  const nodeArgs = ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
    ...(runtime.canvasNative ? [`--allow-fs-read=${runtime.canvasNative}`] : []),
    '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
    `--require=${path.join(server, 'network-deny.cjs')}`, script, sourceType, String(inputBytes),
    ...(omitDocxHeaderFooter ? ['omit-docx-header-footer'] : []),
    ...(passiveObjects ? ['passive-document-objects'] : []),
    ...(markdownOutput ? [`markdown-output-${markdownOutput}`] : []),
    ...(contentOptions ? [`content-options-v1:${Buffer.from(serializeContentOptions(contentOptions)).toString('base64url')}`] : [])];
  let command;
  if (process.platform === 'win32' && process.arch === 'x64') {
    command = path.join(server, 'native', 'windows-x64', 'datasecure-sandbox.exe');
    try { verifyNativeLauncherArtifact(command); } catch { throw error('CONVERSION_ISOLATION_UNAVAILABLE'); }
  } else {
    const supervisor = verifyPosixSupervisor();
    if (!supervisor.available) throw error({ executable_denied: 'CONVERSION_EXECUTABLE_DENIED',
      executable_missing: 'CONVERSION_EXECUTABLE_MISSING', dependency_missing: 'CONVERSION_DEPENDENCY_MISSING', executable_format: 'CONVERSION_ARCHITECTURE_INVALID'
    }[supervisor.reason] || 'CONVERSION_ISOLATION_UNAVAILABLE');
    command = supervisor.executable;
  }
  return { command, args: ['--memory-mib', '1024', '--cpu-ms', String(DEFAULT_TIMEOUT_MS),
    '--wall-ms', String(Math.max(1000, timeoutMs + 500)), '--', runtime.node, ...nodeArgs], server };
}

async function convertBuffer(bytes, extension, options = {}) {
  const allowed = ['signal', 'timeoutMs', 'omitDocxHeaderFooter', 'passiveObjects', 'markdownOutput', 'contentOptions'];
  try {
    if (!options || typeof options !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw error('CONVERSION_INPUT_INVALID');
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowed.includes(key) ||
        !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw error('CONVERSION_INPUT_INVALID');
    options = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch { throw error('CONVERSION_INPUT_INVALID'); }
  let contentOptions;
  if (Object.hasOwn(options, 'contentOptions')) {
    try { contentOptions = validateContentOptions(options.contentOptions); }
    catch { throw error('CONVERSION_INPUT_INVALID'); }
    if (Object.hasOwn(options, 'markdownOutput')) throw error('CONVERSION_INPUT_INVALID');
  }
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, omitDocxHeaderFooter = false, passiveObjects = false } = options;
  const abortSignal = checkedAbortSignal(signal);
  if (abortSignal?.aborted()) throw error('REQUEST_CANCELLED');
  if (options.markdownOutput !== undefined && !['content-v1', 'notes-v1'].includes(options.markdownOutput)) throw error('CONVERSION_INPUT_INVALID');
  const suffix = typeof extension === 'string' ? extension.toLowerCase() : '';
  const type = Object.hasOwn(SOURCE_TYPES, suffix) ? SOURCE_TYPES[suffix] : null;
  if (!type) throw error('MARKDOWN_FORMAT_UNSUPPORTED');
  if (typeof omitDocxHeaderFooter !== 'boolean' || (omitDocxHeaderFooter && type !== 'docx') ||
      typeof passiveObjects !== 'boolean' || (passiveObjects && !['pdf', 'pptx'].includes(type)) ||
      !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_INPUT_BYTES ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS) throw error('CONVERSION_INPUT_INVALID');
  if (contentOptions && ['png', 'bmp', 'jpeg'].includes(type) && !contentOptions.imageOcr) throw error('IMAGE_OCR_REQUIRED');
  const input = Buffer.from(bytes); // The worker cannot detach or mutate originals.
  const runtime = resolveConversionRuntime();
  const invocation = launch(runtime, type, input.length, timeoutMs, omitDocxHeaderFooter, passiveObjects, options.markdownOutput, contentOptions);
  if (abortSignal?.aborted()) throw error('REQUEST_CANCELLED');
  const environment = { DISABLE_SYSTEM_FONTS_LOAD: '1', PATH: '' };
  // Only the verified fixed macOS bundle role may select the native addon.
  // Ambient NAPI_RS_* / NODE_* settings are deliberately not inherited.
  if (runtime.canvasNative) environment.NAPI_RS_NATIVE_LIBRARY_PATH = runtime.canvasNative;
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) environment[key] = process.env[key];
  return new Promise((resolve, reject) => {
    let child;
    try { child = childProcess.spawn(invocation.command, invocation.args, { cwd: runtime.root,
      env: environment, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true }); }
    catch (failure) { reject(error(conversionStartFailureCode(failure, invocation.command))); return; }
    const chunks = [];
    let size = 0, stderrSize = 0, stopped = null, closed = false, settled = false, inputFlushed = false, grace;
    const finish = (failure, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(grace);
      abortSignal?.unsubscribe(abort);
      if (failure) reject(error(failure)); else resolve(result);
    };
    const stop = code => {
      if (closed || stopped) return;
      stopped = code;
      grace = setTimeout(() => finish('CONVERSION_TERMINATION_UNCONFIRMED'), TERMINATION_GRACE_MS);
      // SIGTERM lets the POSIX supervisor reap its process group. Windows closes
      // the Job Object on launcher termination, including all worker threads.
      try { child.kill('SIGTERM'); } catch { /* bounded, explicitly unconfirmed below */ }
    };
    const abort = () => stop('REQUEST_CANCELLED');
    const timer = setTimeout(() => stop('CONVERSION_TIMEOUT'), timeoutMs);
    try {
      abortSignal?.subscribe(abort);
      if (abortSignal?.aborted()) abort();
    } catch { stop('CONVERSION_INPUT_INVALID'); }
    child.once('error', failure => stop(conversionStartFailureCode(failure, invocation.command)));
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) { stop('CONVERSION_OUTPUT_LIMIT'); return; }
      chunks.push(chunk);
    });
    // Drain vendor diagnostics, never return/persist raw document text or paths.
    child.stderr.on('data', chunk => { stderrSize += chunk.length; if (stderrSize > 64 * 1024) stop('CONVERSION_OUTPUT_LIMIT'); });
    child.stdin.on('error', () => stop('CONVERSION_INPUT_INCOMPLETE'));
    child.once('close', code => {
      closed = true;
      // A launcher that cannot start its parser can close stdin first (EPIPE).
      // Keep the confirmed inner OS fact instead of hiding it behind that
      // secondary incomplete-input symptom; deliberate cancellation still wins.
      const nativeFailure = nativeConversionExitCode(code);
      if (nativeFailure && stopped === 'CONVERSION_INPUT_INCOMPLETE') {
        finish(nativeFailure); return;
      }
      if (stopped) { finish(stopped); return; }
      if (nativeFailure) { finish(nativeFailure); return; }
      try {
        const response = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        const responseSchema = contentOptions ? 'datasecure-conversion-response/2' : 'datasecure-conversion-response/1';
        if (code === 2 && exactKeys(response, ['schema', 'ok', 'error_code']) && response.ok === false &&
            response.schema === responseSchema && ERROR_SET.has(response.error_code)) {
          finish(response.error_code); return;
        }
        if (code !== 0 || !exactKeys(response, ['schema', 'ok', 'result']) || response.ok !== true ||
            response.schema !== responseSchema) throw error('CONVERSION_RESPONSE_INVALID');
        validateMarkdownExtractionForOptions(response.result, contentOptions);
        if (response.result.source_type !== type) throw error('CONVERSION_RESPONSE_INVALID');
        if (!inputFlushed) { finish('CONVERSION_INPUT_INCOMPLETE'); return; }
        finish(null, createMarkdownExtraction({ source_type: type, markdown: response.result.markdown, coverage: response.result.coverage,
          ...(contentOptions ? { content_options: contentOptions } : {}),
          ...(response.result.private_document_metadata ? { private_document_metadata: response.result.private_document_metadata } : {}),
          ...(response.result.ocr_contacts ? { ocr_contacts: response.result.ocr_contacts } : {}) }));
      } catch { finish('CONVERSION_RESPONSE_INVALID'); }
    });
    if (!stopped) child.stdin.end(input, failure => {
      if (failure) stop('CONVERSION_INPUT_INCOMPLETE'); else inputFlushed = true;
    });
    else child.stdin.destroy();
  });
}

module.exports = { convertBuffer, conversionStartFailureCode, nativeConversionExitCode, DEFAULT_TIMEOUT_MS, TERMINATION_GRACE_MS };
