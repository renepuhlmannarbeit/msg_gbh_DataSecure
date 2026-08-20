'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { normalizeText } = require('./privacy/base');
const { parseOoxml } = require('./ooxml');
const { parsePdf } = require('./pdf-lite');
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

// Text is normalised the moment it leaves a parser, so every later stage sees
// one form. A decomposed umlaut or a Word soft hyphen inside a surname would
// otherwise walk straight past the name patterns.
function normalized(result) {
  return { ...result, markdown: normalizeText(result.markdown) };
}

async function convertDocument(source) {
  const ext = path.extname(source).toLowerCase();
  const buf = fs.readFileSync(source);
  try {
    if (['.docx', '.xlsx', '.pptx'].includes(ext)) return normalized(parseOoxml(buf, ext));
    if (ext === '.pdf') return normalized(parsePdf(buf));
    if (ext === '.md' || ext === '.txt') {
      return normalized({ markdown: buf.toString('utf8'), attachments: [], warnings: [] });
    }
    if (ext === '.csv') {
      const body = buf.toString('utf8').replace(/```/g, '` ` `');
      return normalized({
        markdown: `# Tabelleninhalt\n\n\`\`\`csv\n${body}\n\`\`\``,
        attachments: [],
        warnings: []
      });
    }
    throw new SafeError('Nicht unterstütztes Format.');
  } catch (e) {
    if (e instanceof SafeError) throw e;
    throw new SafeError(
      `Die ${ext.replace('.', '').toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden: ` +
        `${String(e.message || e).slice(0, 240)}`
    );
  }
}

module.exports = {
  SafeError,
  dataRoot,
  runtimeReady,
  readStatus,
  visualBridgeStatus,
  convertDocument,
  rasterizeToPng,
  ocrPngDetailed
};
