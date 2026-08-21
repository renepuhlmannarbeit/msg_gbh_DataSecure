'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const { rasterizeToPng, ocrPngDetailed } = require('./windows-visual');

class SafeError extends Error {}

function dataRoot() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'ClaudeEUPrivacyDocumentGatewayV32');
}

function helperScript(name) {
  return path.join(__dirname, '..', 'scripts', name);
}

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// The visual pipeline depends on the Windows PowerShell bridge. Reporting it as
// ready unconditionally - as this function used to - hides the difference
// between "no graphics in this document" and "graphics could not be checked and
// were all withheld", which is exactly what an operator needs to know.
function visualBridgeStatus() {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'not_windows' };
  }
  for (const name of ['windows-ocr.ps1', 'rasterize-image.ps1']) {
    if (!fs.existsSync(helperScript(name))) {
      return { available: false, reason: `helper_missing:${name}` };
    }
  }
  if (!fs.existsSync(powershellPath())) {
    return { available: false, reason: 'powershell_missing' };
  }
  return { available: true, reason: 'ok' };
}

// Text processing has no external dependency: parsers and the privacy engine
// are bundled Node code, so the text path is ready whenever the process runs.
function runtimeReady() {
  return true;
}

function readStatus() {
  const visual = visualBridgeStatus();
  return {
    phase: visual.available ? 'ready' : 'ready_text_only',
    message: visual.available
      ? 'Bundled offline privacy engine ready.'
      : `Textverarbeitung bereit. Visuelle Prüfung nicht verfügbar (${visual.reason}); Grafiken werden lokal zurückgehalten.`,
    text_engine: 'ready',
    visual_bridge: visual.available ? 'available' : 'unavailable',
    visual_bridge_reason: visual.reason
  };
}

const PARSER_TIMEOUT_MS = 45_000;
const MAX_PARSER_RESPONSE_BYTES = 160 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_CHARS = 42 * 1024 * 1024;

function validateParserResult(value) {
  if (!value || typeof value !== 'object' || typeof value.markdown !== 'string' ||
    value.markdown.length > 20_000_000 || !Array.isArray(value.attachments) ||
    value.attachments.length > 150 || !Array.isArray(value.warnings) || value.warnings.length > 200) {
    throw new SafeError('Der isolierte Dokumentparser lieferte kein gültiges Ergebnis.');
  }
  let decodedAttachmentBytes = 0;
  for (const attachment of value.attachments) {
    if (!attachment || typeof attachment !== 'object' || typeof attachment.data !== 'string' ||
      attachment.data.length > MAX_ATTACHMENT_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data) ||
      Object.keys(attachment).sort().join(',') !== 'data,extension,mimeType,name,source_part,type') {
      throw new SafeError('Ein isoliert extrahiertes Asset ist ungültig oder zu groß.');
    }
    const decodedBytes = Buffer.byteLength(attachment.data, 'base64');
    if (decodedBytes > 30 * 1024 * 1024) throw new SafeError('Ein isoliert extrahiertes Asset ist zu groß.');
    decodedAttachmentBytes += decodedBytes;
  }
  if (decodedAttachmentBytes > 100 * 1024 * 1024) throw new SafeError('Die isoliert extrahierten Assets sind insgesamt zu groß.');
  if (!value.warnings.every((item) => typeof item === 'string' && item.length <= 1000)) {
    throw new SafeError('Der isolierte Dokumentparser lieferte ungültige Warnungen.');
  }
  return value;
}

async function convertDocument(source, options = {}) {
  const ext = path.extname(source).toLowerCase();
  const supported = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg', '.bmp']);
  if (!supported.has(ext)) throw new SafeError('Nicht unterstütztes Format.');
  const worker = path.join(__dirname, 'parser-worker.js');
  const spawn = options.spawn || childProcess.spawn;
  const fd = fs.openSync(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let child;
  try {
    child = spawn(options.execPath || process.execPath, [
      '--permission', `--allow-fs-read=${__dirname}`, '--disable-proto=throw', '--max-old-space-size=384', worker, ext
    ], {
      stdio: ['ignore', 'pipe', 'ignore', fd],
      windowsHide: true,
      shell: false,
      env: {}
    });
  } catch {
    fs.closeSync(fd);
    throw new SafeError('Der isolierte Dokumentparser konnte nicht gestartet werden.');
  }
  fs.closeSync(fd);
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already stopped */ }
      finish(new SafeError('Der isolierte Dokumentparser hat das Zeitlimit überschritten.'));
    }, options.timeoutMs ?? PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_PARSER_RESPONSE_BYTES) {
        try { child.kill(); } catch { /* already stopped */ }
        finish(new SafeError('Der isolierte Dokumentparser lieferte zu viele Daten.'));
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => finish(new SafeError('Der isolierte Dokumentparser konnte nicht gestartet werden.')));
    child.once('close', (code) => {
      if (settled) return;
      let response;
      try { response = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* handled below */ }
      const responseKeys = response && typeof response === 'object' ? Object.keys(response).sort().join(',') : '';
      if (code !== 0 || response?.schema !== 'data-secure-parser-result/1' || !response?.ok ||
        responseKeys !== 'ok,result,schema') {
        finish(new SafeError(`Die ${ext.slice(1).toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden.`));
        return;
      }
      try { finish(null, validateParserResult(response.result)); }
      catch (error) { finish(error); }
    });
  });
}

module.exports = {
  SafeError,
  dataRoot,
  runtimeReady,
  readStatus,
  visualBridgeStatus,
  PARSER_TIMEOUT_MS,
  MAX_PARSER_RESPONSE_BYTES,
  validateParserResult,
  convertDocument,
  rasterizeToPng,
  ocrPngDetailed
};
