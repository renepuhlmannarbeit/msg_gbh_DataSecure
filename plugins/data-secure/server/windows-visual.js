'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CONSOLE_BYTES = 64 * 1024;
const MAX_RASTER_BYTES = 30 * 1024 * 1024;
const MAX_OCR_JSON_BYTES = 20 * 1024 * 1024;
const MAX_OCR_TEXT_CHARS = 5_000_000;
const MAX_OCR_WORDS = 100_000;

class VisualBridgeError extends Error {}
class VisualBudgetError extends VisualBridgeError {}

function terminateProcessTree(child, options = {}) {
  if (!child) return;
  const platform = options.platform || process.platform;
  if (platform === 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0) {
    const runner = options.killTreeRunner || childProcess.spawnSync;
    const systemRoot = options.systemRoot || process.env.SystemRoot || 'C:\\Windows';
    try {
      const result = runner(path.join(systemRoot, 'System32', 'taskkill.exe'),
        ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true, stdio: 'ignore', shell: false, timeout: 10_000
        });
      if (!result?.error && result?.status === 0) return;
    } catch { /* use direct child fallback */ }
  }
  try { child.kill(); } catch { /* process already exited */ }
}

function bridgeEnvironment(source = process.env) {
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (typeof source[key] === 'string') result[key] = source[key];
  }
  return result;
}

function runPs(script, args, options = {}) {
  return new Promise((resolve, reject) => {
    const platform = options.platform || process.platform;
    if (platform !== 'win32') {
      reject(new VisualBridgeError('Windows visual bridge unavailable on this platform.'));
      return;
    }
    const timeoutMs = Math.max(1, Math.min(DEFAULT_TIMEOUT_MS, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
    const spawn = options.spawn || childProcess.spawn;
    const systemRoot = options.systemRoot || process.env.SystemRoot || 'C:\\Windows';
    const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
        env: bridgeEnvironment(options.env || process.env)
      });
    let stdout = Buffer.alloc(0);
    let consoleBytes = 0;
    let settled = false;
    let timer;

    const finish = (error, value = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const rejectOversized = () => {
      terminateProcessTree(child, options);
      finish(new VisualBudgetError('Windows-Bildverarbeitung überschritt das Ausgabelimit.'));
    };
    const collect = (chunk, keep) => {
      if (settled) return;
      consoleBytes += chunk.length;
      if (consoleBytes > MAX_CONSOLE_BYTES) return rejectOversized();
      if (keep) stdout = Buffer.concat([stdout, chunk]);
    };
    child.stdout.on('data', (chunk) => collect(Buffer.from(chunk), true));
    child.stderr.on('data', (chunk) => collect(Buffer.from(chunk), false));
    child.once('error', () => finish(new VisualBridgeError('Windows-Bildverarbeitung konnte nicht gestartet werden.')));
    child.once('close', (code) => {
      if (code !== 0) finish(new VisualBridgeError('Windows-Bildverarbeitung ist fehlgeschlagen.'));
      else finish(null, stdout.toString('utf8').trim());
    });
    timer = setTimeout(() => {
      terminateProcessTree(child, options);
      finish(new VisualBudgetError('Windows-Bildverarbeitung überschritt das Zeitlimit.'));
    }, timeoutMs);
  });
}

function scriptPath(name) {
  return path.join(__dirname, '..', 'scripts', name);
}

function readBoundedFile(file, maxBytes, label) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new VisualBudgetError(`${label} überschritt das sichere Ausgabelimit.`);
    }
    return fs.readFileSync(fd);
  } catch (error) {
    if (error instanceof VisualBudgetError) throw error;
    throw new VisualBridgeError(`${label} lieferte keine sichere Ausgabe.`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function validateOcrResult(value) {
  if (!exactKeys(value, ['text', 'words']) || typeof value.text !== 'string' ||
      value.text.length > MAX_OCR_TEXT_CHARS || !Array.isArray(value.words) ||
      value.words.length > MAX_OCR_WORDS) {
    throw new VisualBudgetError('OCR lieferte kein gültiges begrenztes Ergebnis.');
  }
  for (const word of value.words) {
    if (!exactKeys(word, ['text', 'bbox']) || typeof word.text !== 'string' || word.text.length > 1_000 ||
        !exactKeys(word.bbox, ['x0', 'y0', 'x1', 'y1'])) {
      throw new VisualBudgetError('OCR lieferte kein gültiges begrenztes Ergebnis.');
    }
    const { x0, y0, x1, y1 } = word.bbox;
    if (![x0, y0, x1, y1].every(Number.isFinite) || x0 < 0 || y0 < 0 ||
        x1 < x0 || y1 < y0 || x1 > 10_000_000 || y1 > 10_000_000) {
      throw new VisualBudgetError('OCR lieferte kein gültiges begrenztes Ergebnis.');
    }
  }
  return value;
}

async function rasterizeToPng(buffer, ext, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_RASTER_BYTES) {
    throw new VisualBudgetError('Grafik überschritt das sichere Eingabelimit.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-vis-'));
  const safeExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const input = path.join(dir, `input.${safeExt}`);
  const output = path.join(dir, 'output.png');
  fs.writeFileSync(input, buffer, { flag: 'wx' });
  try {
    await runPs(scriptPath('rasterize-image.ps1'), ['-InputPath', input, '-OutputPath', output], options);
    return readBoundedFile(output, MAX_RASTER_BYTES, 'Rasterisierung');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

async function ocrPngDetailed(buffer, language = 'de-DE', options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_RASTER_BYTES) {
    throw new VisualBudgetError('OCR-Grafik überschritt das sichere Eingabelimit.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-ocr-'));
  const input = path.join(dir, 'input.png');
  const output = path.join(dir, 'ocr.json');
  fs.writeFileSync(input, buffer, { flag: 'wx' });
  try {
    await runPs(scriptPath('windows-ocr.ps1'),
      ['-InputPath', input, '-OutputPath', output, '-Language', language], options);
    const raw = readBoundedFile(output, MAX_OCR_JSON_BYTES, 'OCR');
    let parsed;
    try { parsed = JSON.parse(raw.toString('utf8')); }
    catch { throw new VisualBridgeError('OCR lieferte kein gültiges Ergebnis.'); }
    return validateOcrResult(parsed);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS, MAX_CONSOLE_BYTES, MAX_RASTER_BYTES, MAX_OCR_JSON_BYTES,
  MAX_OCR_TEXT_CHARS, MAX_OCR_WORDS, VisualBridgeError, VisualBudgetError,
  terminateProcessTree, bridgeEnvironment, runPs, readBoundedFile, validateOcrResult,
  rasterizeToPng, ocrPngDetailed
};
