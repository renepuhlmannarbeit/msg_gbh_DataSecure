'use strict';

// Startup refusal without a raw stack trace. stdout is the MCP channel and the
// host swallows stderr, so a fail-closed refusal used to leave no trace at all
// (review rc91, Finding A). Every refusal now leaves a content-free line in the
// workflow journal, a small marker file next to it, and exactly one fixed
// sentence on stderr. Codes are a closed list; no message text is copied.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { VERSION } = require('../version');
const { dataRoot } = require('../runtime');
const { runtimeInfo } = require('../runtime-info');
const { recordWorkflowEvent } = require('./workflow-diagnostics');

const STARTUP_CODES = Object.freeze({
  UNSAFE_STORAGE_LOCATION: 'Der lokale Datenordner ist kein sicherer Ort oder nicht zugreifbar.',
  STARTUP_RECOVERY_FAILED: 'Die Wiederherstellung offener Stapel ist fail-closed gestoppt.',
  STARTUP_OUTBOX_RECOVERY_FAILED: 'Die Wiederherstellung der Zuordnungsübersicht ist fail-closed gestoppt.',
  STARTUP_MIGRATION_FAILED: 'Die Migration älterer lokaler Daten ist fail-closed gestoppt oder noch aktiv.',
  STARTUP_CLEANUP_FAILED: 'Die Bereinigung privater Arbeitskopien ist fail-closed gestoppt.',
  RUNTIME_INTEGRITY_FAILED: 'Die gebündelte Laufzeit stimmt nicht mit dem Nachweis des Pakets überein.',
  STARTUP_FAILED: 'Der Start wurde aus einem anderen Grund sicher verweigert.'
});

const MESSAGE_CODES = Object.freeze([
  ['PRIVACY_STORAGE_UNSAFE', 'UNSAFE_STORAGE_LOCATION'],
  ['Batch recovery failed closed.', 'STARTUP_RECOVERY_FAILED'],
  ['Mapping outbox recovery failed closed.', 'STARTUP_OUTBOX_RECOVERY_FAILED'],
  ['Legacy input migration failed closed.', 'STARTUP_MIGRATION_FAILED'],
  ['Private working-copy cleanup failed closed.', 'STARTUP_CLEANUP_FAILED']
]);

function startupCodeFor(error) {
  const code = String(error?.code || '');
  if (Object.hasOwn(STARTUP_CODES, code)) return code;
  const message = String(error?.message || '');
  for (const [needle, mapped] of MESSAGE_CODES) if (message.includes(needle)) return mapped;
  const nativeCode = String(error?.code || '').toUpperCase();
  if (['EPERM', 'EACCES', 'ENOTDIR', 'EROFS', 'ENOENT'].includes(nativeCode)) return 'UNSAFE_STORAGE_LOCATION';
  return 'STARTUP_FAILED';
}

function markerFile(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'startup-refused.json');
}

// Best effort on every channel; a refusal must never throw a second time.
function recordStartupRefusal(error, options = {}) {
  const code = startupCodeFor(error);
  const record = options.recordWorkflowEvent || recordWorkflowEvent;
  let recorded = false;
  try { recorded = record({ event: 'startup_refused', outcome: 'stopped', error_code: code }) === true; } catch { /* journal unavailable */ }
  let marker = false;
  try {
    const io = options.fs || fs;
    const file = markerFile(options);
    io.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    io.writeFileSync(temporary, `${JSON.stringify({
      schema: 'data-secure-startup-refusal/1',
      at: new Date(options.now || Date.now()).toISOString(),
      gateway_version: VERSION,
      code,
      journal_recorded: recorded
    })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    io.renameSync(temporary, file);
    marker = true;
  } catch { /* marker directory unavailable */ }
  const line = `DataSecure-Start verweigert: ${code} (DataSecure-Version: ${VERSION}). ${STARTUP_CODES[code]}\n`;
  try { (options.stderr || process.stderr).write(line); } catch { /* nothing else to do */ }
  return { code, recorded, marker, line };
}

function refuseStartup(error, options = {}) {
  const outcome = recordStartupRefusal(error, options);
  (options.exit || process.exit)(1);
  return outcome;
}

// The bundled interpreter runs all product code, yet only the narrower native
// sandbox launcher was hash-checked at spawn (review rc91, R-1). In the
// self-contained product the running executable must match the package's
// RUNTIME-EVIDENCE.json; a source checkout on a host Node skips the check.
function sha256File(file, io = fs) {
  const hash = crypto.createHash('sha256');
  const fd = io.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const read = io.readSync(fd, buffer, 0, buffer.length, null);
      if (read <= 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    io.closeSync(fd);
  }
  return hash.digest('hex');
}

function verifyBundledRuntime(options = {}) {
  const info = typeof options.runtimeInfo === 'function' ? options.runtimeInfo() : runtimeInfo();
  if (info.runtime_mode !== 'self_contained_node' || !info.runtime_target) return { checked: false, reason: 'host_node' };
  const io = options.fs || fs;
  const evidenceFile = options.evidenceFile || path.resolve(__dirname, '..', '..', 'RUNTIME-EVIDENCE.json');
  const executable = options.executable || process.execPath;
  let evidence;
  try { evidence = JSON.parse(io.readFileSync(evidenceFile, 'utf8')); } catch {
    throw Object.assign(new Error('runtime evidence unreadable'), { code: 'RUNTIME_INTEGRITY_FAILED' });
  }
  const target = Array.isArray(evidence?.targets) ? evidence.targets.find((entry) => entry?.target === info.runtime_target) : null;
  const expected = String(target?.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw Object.assign(new Error('runtime evidence incomplete'), { code: 'RUNTIME_INTEGRITY_FAILED' });
  let actual;
  try {
    const stat = io.lstatSync(executable);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    if (Number.isSafeInteger(Number(target.bytes)) && Number(target.bytes) !== stat.size) {
      throw new Error('size mismatch');
    }
    actual = (options.sha256File || sha256File)(executable, io);
  } catch {
    throw Object.assign(new Error('runtime executable unreadable'), { code: 'RUNTIME_INTEGRITY_FAILED' });
  }
  if (actual !== expected) throw Object.assign(new Error('runtime hash mismatch'), { code: 'RUNTIME_INTEGRITY_FAILED' });
  return { checked: true, target: info.runtime_target };
}

module.exports = { STARTUP_CODES, startupCodeFor, recordStartupRefusal, refuseStartup, verifyBundledRuntime, markerFile, sha256File };
