'use strict';

// Legacy MCP support export. Standalone diagnosis is saved by the native host;
// the neutral logger deliberately has no dependency on this module.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renameWithTransientRetry } = require('./batch-journal-io');
const { VERSION } = require('../version');
const { roots } = require('./common');
const { assertWritableCapacity } = require('./storage-capacity');
const { diagnosticStatus, MAX_EVENTS } = require('./diagnostics');

const DIAGNOSTIC_EXPORT_SCHEMA = 'data-secure-diagnostic-export/1';

function digestArtifact(role, target, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(target, io.constants?.O_RDONLY || fs.constants.O_RDONLY);
    const stat = io.fstatSync(descriptor);
    const named = io.lstatSync(target);
    if (!stat.isFile() || named.isSymbolicLink() || stat.dev !== named.dev || stat.ino !== named.ino || stat.size > 64 * 1024 * 1024) {
      throw new Error('unsafe artifact');
    }
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < stat.size) {
      const read = io.readSync(descriptor, buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (read <= 0) throw new Error('truncated artifact');
      hash.update(buffer.subarray(0, read));
      position += read;
    }
    return { role, sha256: hash.digest('hex'), bytes: stat.size };
  } finally { if (descriptor !== undefined) io.closeSync(descriptor); }
}

function diagnosticExportPath(options = {}) {
  return options.exportPath || path.join((options.roots || roots)().exports, 'DataSecure-Diagnose.json');
}

function exportDiagnosticPackage(options = {}) {
  if (options.confirmed !== true) throw new Error('Diagnostic export requires explicit confirmation.');
  const io = options.fs || fs;
  const target = diagnosticExportPath(options);
  const root = path.dirname(target);
  const artifacts = [
    digestArtifact('mcp_bootstrap', path.join(__dirname, '..', 'index.js'), io),
    digestArtifact('mcp_server', path.join(__dirname, '..', 'mcp-server.js'), io),
    digestArtifact('native_launcher', path.join(__dirname, '..', 'native-launcher.js'), io)
  ];
  const native = path.join(__dirname, '..', 'native', 'windows-x64', 'datasecure-sandbox.exe');
  if (io.existsSync(native)) artifacts.push(digestArtifact('windows_x64_sandbox', native, io));
  const receipt = {
    schema: DIAGNOSTIC_EXPORT_SCHEMA,
    exported_at: new Date().toISOString(),
    gateway_version: VERSION,
    platform: process.platform,
    architecture: process.arch,
    artifacts,
    diagnostics: diagnosticStatus(MAX_EVENTS, options),
    raw_content_logged: false,
    filenames_logged: false,
    paths_logged: false,
    document_hashes_logged: false,
    automatic_transmission: false
  };
  // The export is a local, replaceable support snapshot. Keep the same strict
  // no-follow/atomic write properties as the journals and never return its path.
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  try {
    io.mkdirSync(root, { recursive: true, mode: 0o700 });
    const rootStat = io.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe export directory');
    (options.assertWritableCapacity || assertWritableCapacity)({
      directory: root,
      bytes: Buffer.byteLength(serialized, 'utf8')
    });
    io.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameWithTransientRetry(temporary, target, io);
  } catch {
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* preserve the prior export */ }
    throw new Error('The local diagnostic export could not be created safely.');
  }
  return { ok: true, exported: true, schema: DIAGNOSTIC_EXPORT_SCHEMA, raw_content_sent_to_claude: false };
}

module.exports = {
  exportDiagnosticPackage,
  _test: { diagnosticExportPath, digestArtifact }
};
