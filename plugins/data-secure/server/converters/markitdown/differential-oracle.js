'use strict';

// Engineering-only bridge used to compare converter coverage. Product format
// release remains disabled in runtime-contract.json until the native supervisor,
// bundled runtime and format gates are complete.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TextDecoder } = require('node:util');
const { recordSupportTrace, newTraceId } = require('../../gateway/support-trace');

const contract = Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, 'runtime-contract.json'), 'utf8')));
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

function stopped(code) {
  return Object.assign(new Error('Die lokale Konvertierung wurde sicher gestoppt.'), { code });
}

function minimalEnvironment(options) {
  const source = options.environment || process.env;
  return {
    ...(source.SystemRoot ? { SystemRoot: source.SystemRoot } : {}),
    ...(source.WINDIR ? { WINDIR: source.WINDIR } : {}),
    DATASECURE_ENGINEERING_MODE: '1',
    DATASECURE_ENGINEERING_MARKITDOWN_ROOT: options.runtimeRoot,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONHASHSEED: '0',
    EU_PRIVACY_SUPPORT_MODE: source.EU_PRIVACY_SUPPORT_MODE === '1' ? '1' : '0'
  };
}

function convertDocxForDifferential(payload, options = {}) {
  const traceId = newTraceId();
  const startedAt = Date.now();
  const trace = (event, outcome, errorCode = 'NONE') => recordSupportTrace({
    trace_id: traceId, event, method: 'unknown', operation: 'markitdown_docx_differential',
    outcome, duration_ms: Date.now() - startedAt, error_code: errorCode
  }, { env: options.environment || process.env, dataRoot: options.dataRoot });
  trace('converter_started', 'progress');
  return new Promise((resolve, reject) => {
    if (options.engineeringMode !== true || contract.product_enabled !== false) {
      trace('converter_stopped', 'stopped', 'CONVERTER_NOT_RELEASED');
      reject(stopped('CONVERTER_NOT_RELEASED'));
      return;
    }
    if (!Buffer.isBuffer(payload) || payload.length < 1 || payload.length > MAX_INPUT_BYTES) {
      trace('converter_stopped', 'stopped', 'CONVERTER_INPUT_INVALID');
      reject(stopped('CONVERTER_INPUT_INVALID'));
      return;
    }
    if (!path.isAbsolute(String(options.pythonExecutable || '')) || !path.isAbsolute(String(options.runtimeRoot || ''))) {
      trace('converter_stopped', 'stopped', 'CONVERTER_RUNTIME_INVALID');
      reject(stopped('CONVERTER_RUNTIME_INVALID'));
      return;
    }
    const child = (options.spawn || spawn)(options.pythonExecutable, ['-I', '-S', path.join(__dirname, 'bridge.py'), '.docx'], {
      env: minimalEnvironment(options), stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true
    });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = (error, markdown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        trace('converter_stopped', 'stopped', error.code || 'CONVERTER_FAILED');
        reject(error);
      } else {
        trace('converter_completed', 'ok');
        resolve(markdown);
      }
    };
    const timer = setTimeout(() => {
      finish(stopped('CONVERTER_TIMEOUT'));
      child.kill();
    }, Math.max(1000, Math.min(120000, Number(options.timeoutMs) || 30000)));
    child.stderr.on('data', () => {});
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        finish(stopped('CONVERTER_OUTPUT_TOO_LARGE'));
        child.kill();
      } else chunks.push(chunk);
    });
    child.once('error', () => finish(stopped('CONVERTER_RUNTIME_FAILED')));
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) return finish(stopped('CONVERTER_FAILED'));
      let markdown;
      try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { return finish(stopped('CONVERTER_OUTPUT_INVALID')); }
      finish(null, markdown);
    });
    child.stdin.on('error', () => finish(stopped('CONVERTER_RUNTIME_FAILED')));
    child.stdin.end(payload);
  });
}

module.exports = { contract, convertDocxForDifferential, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, minimalEnvironment };
