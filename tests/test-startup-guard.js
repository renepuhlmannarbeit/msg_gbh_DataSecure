'use strict';

// Review rc91, Finding A: a fail-closed startup refusal crashed with a raw
// stack trace (absolute paths) on stderr and left no durable trace, although
// stdout is the MCP channel and the host does not surface stderr. R-1: the
// bundled interpreter was never checked against RUNTIME-EVIDENCE.json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { createSuite } = require('./helpers');
const guard = require('../plugins/data-secure/server/gateway/startup-guard');
const workflowDiagnostics = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
const { VERSION } = require('../plugins/data-secure/server/version');

const { test, done, assert } = createSuite('Startup guard');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-startup-guard-'));

test('every startup failure maps to a fixed code and never to message text', () => {
  assert.strictEqual(guard.startupCodeFor(new Error('PRIVACY_STORAGE_UNSAFE')), 'UNSAFE_STORAGE_LOCATION');
  assert.strictEqual(guard.startupCodeFor(new Error('Batch recovery failed closed.')), 'STARTUP_RECOVERY_FAILED');
  assert.strictEqual(guard.startupCodeFor(new Error('Mapping outbox recovery failed closed.')), 'STARTUP_OUTBOX_RECOVERY_FAILED');
  assert.strictEqual(guard.startupCodeFor(new Error('Legacy input migration failed closed.')), 'STARTUP_MIGRATION_FAILED');
  assert.strictEqual(guard.startupCodeFor(new Error('Private working-copy cleanup failed closed.')), 'STARTUP_CLEANUP_FAILED');
  assert.strictEqual(guard.startupCodeFor(Object.assign(new Error('x'), { code: 'RUNTIME_INTEGRITY_FAILED' })), 'RUNTIME_INTEGRITY_FAILED');
  assert.strictEqual(guard.startupCodeFor(Object.assign(new Error('EPERM: operation not permitted, mkdir C:\\Users\\x'), { code: 'EPERM' })), 'UNSAFE_STORAGE_LOCATION');
  assert.strictEqual(guard.startupCodeFor(new Error('C:\\Users\\someone\\secret.docx exploded')), 'STARTUP_FAILED');
  assert.strictEqual(guard.startupCodeFor(null), 'STARTUP_FAILED');
  for (const code of Object.keys(guard.STARTUP_CODES)) assert.ok(guard.STARTUP_CODES[code].length > 10);
});

test('a refusal leaves a journal line, a marker file and one content-free stderr sentence', () => {
  const dataRoot = path.join(base, 'refusal');
  const recorded = [];
  let stderr = '';
  const outcome = guard.recordStartupRefusal(new Error('Batch recovery failed closed. C:\\Users\\someone\\batches'), {
    dataRoot,
    recordWorkflowEvent: (event) => { recorded.push(event); return true; },
    stderr: { write: (chunk) => { stderr += chunk; } },
    now: Date.UTC(2026, 8, 3, 12, 0, 0)
  });
  assert.deepStrictEqual(outcome.code, 'STARTUP_RECOVERY_FAILED');
  assert.strictEqual(outcome.recorded, true);
  assert.strictEqual(outcome.marker, true);
  assert.deepStrictEqual(recorded, [{ event: 'startup_refused', outcome: 'stopped', error_code: 'STARTUP_RECOVERY_FAILED' }]);
  const marker = JSON.parse(fs.readFileSync(guard.markerFile({ dataRoot }), 'utf8'));
  assert.deepStrictEqual(Object.keys(marker).sort(), ['at', 'code', 'gateway_version', 'journal_recorded', 'schema']);
  assert.strictEqual(marker.code, 'STARTUP_RECOVERY_FAILED');
  assert.strictEqual(marker.gateway_version, VERSION);
  assert.strictEqual(stderr.split('\n').filter(Boolean).length, 1, 'exactly one line');
  assert.match(stderr, /^DataSecure-Start verweigert: STARTUP_RECOVERY_FAILED \(DataSecure-Version: /u);
  assert.doesNotMatch(stderr, /Users|batches|\\|\//u, 'no path fragments leave the process');
  assert.doesNotMatch(JSON.stringify(marker), /Users|batches|\\/u, 'the marker carries no path fragments');
});

test('a refusal never throws when neither journal nor marker directory is writable', () => {
  let stderr = '';
  const outcome = guard.recordStartupRefusal(new Error('PRIVACY_STORAGE_UNSAFE'), {
    dataRoot: path.join(base, 'file-as-root'),
    fs: { mkdirSync() { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } },
    recordWorkflowEvent: () => { throw new Error('journal down'); },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });
  assert.strictEqual(outcome.code, 'UNSAFE_STORAGE_LOCATION');
  assert.strictEqual(outcome.recorded, false);
  assert.strictEqual(outcome.marker, false);
  assert.match(stderr, /UNSAFE_STORAGE_LOCATION/u);
});

test('a refusal never follows a linked diagnostics directory', () => {
  const dataRoot = path.join(base, 'linked-refusal');
  const outside = path.join(base, 'linked-refusal-outside');
  fs.mkdirSync(dataRoot);
  fs.mkdirSync(outside);
  const diagnostics = path.join(dataRoot, 'diagnostics');
  fs.symlinkSync(outside, diagnostics, process.platform === 'win32' ? 'junction' : 'dir');
  const outcome = guard.recordStartupRefusal(new Error('synthetic'), {
    dataRoot,
    recordWorkflowEvent: () => false,
    stderr: { write() {} }
  });
  assert.strictEqual(outcome.marker, false);
  assert.strictEqual(fs.existsSync(path.join(outside, 'startup-refused.json')), false, 'external target stays untouched');
  fs.rmSync(diagnostics);
});

// Counter-review rc93: the marker was refused when the data root was spelled
// with a different letter case than the on-disk name (Windows is
// case-insensitive; LOCALAPPDATA and the native realpath may differ).
test('a differently cased data root still receives its marker on Windows', () => {
  const canonical = path.join(base, 'CasedProfile', 'SecureDataMsg');
  fs.mkdirSync(canonical, { recursive: true });
  const variants = process.platform === 'win32'
    ? [canonical.replace('CasedProfile', 'casedprofile'), canonical.charAt(0).toLowerCase() + canonical.slice(1)]
    : [canonical];
  for (const dataRoot of variants) {
    const outcome = guard.recordStartupRefusal(new Error('synthetic'), {
      dataRoot, recordWorkflowEvent: () => false, stderr: { write() {} }
    });
    assert.strictEqual(outcome.marker, true, `marker written for ${dataRoot === canonical ? 'canonical' : 'differently cased'} root`);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(canonical, 'diagnostics', 'startup-refused.json'), 'utf8')).code, 'STARTUP_FAILED');
    fs.rmSync(path.join(canonical, 'diagnostics'), { recursive: true, force: true });
  }
});

test('refuseStartup records and exits with code 1', () => {
  const exits = [];
  guard.refuseStartup(new Error('Legacy input migration failed closed.'), {
    dataRoot: path.join(base, 'exit'),
    recordWorkflowEvent: () => true,
    stderr: { write() {} },
    exit: (code) => exits.push(code)
  });
  assert.deepStrictEqual(exits, [1]);
});

test('the bundled runtime is verified against RUNTIME-EVIDENCE.json only in the self-contained product', () => {
  const dir = path.join(base, 'runtime');
  fs.mkdirSync(dir, { recursive: true });
  const executable = path.join(dir, 'datasecure-node.exe');
  fs.writeFileSync(executable, crypto.randomBytes(3000));
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  const evidenceFile = path.join(dir, 'RUNTIME-EVIDENCE.json');
  const writeEvidence = (hash, bytes = 3000) => fs.writeFileSync(evidenceFile, JSON.stringify({
    schema: 'datasecure-bundled-plugin/v1', targets: [{ target: 'windows-x64', bytes, sha256: hash }]
  }));
  writeEvidence(sha256);
  const self = { runtime_mode: 'self_contained_node', runtime_target: 'windows-x64' };
  assert.deepStrictEqual(guard.verifyBundledRuntime({ runtimeInfo: () => ({ runtime_mode: 'host_node', runtime_target: null }) }), { checked: false, reason: 'host_node' });
  assert.deepStrictEqual(guard.verifyBundledRuntime({ runtimeInfo: () => self, evidenceFile, executable }), { checked: true, target: 'windows-x64' });
  writeEvidence('f'.repeat(64));
  assert.throws(() => guard.verifyBundledRuntime({ runtimeInfo: () => self, evidenceFile, executable }), (error) => error.code === 'RUNTIME_INTEGRITY_FAILED');
  writeEvidence(sha256, 2999);
  assert.throws(() => guard.verifyBundledRuntime({ runtimeInfo: () => self, evidenceFile, executable }), (error) => error.code === 'RUNTIME_INTEGRITY_FAILED', 'size mismatch stops before hashing');
  fs.unlinkSync(evidenceFile);
  assert.throws(() => guard.verifyBundledRuntime({ runtimeInfo: () => self, evidenceFile, executable }), (error) => error.code === 'RUNTIME_INTEGRITY_FAILED', 'missing evidence is a refusal, not a skip');
  writeEvidence(sha256);
  fs.writeFileSync(executable, Buffer.concat([fs.readFileSync(executable), Buffer.from([1])]));
  assert.throws(() => guard.verifyBundledRuntime({ runtimeInfo: () => self, evidenceFile, executable }), (error) => error.code === 'RUNTIME_INTEGRITY_FAILED', 'a tampered executable is refused');
});

test('the real server refuses a broken data root with one content-free line and a marker, exit 1', () => {
  const localAppData = path.join(base, 'localappdata');
  fs.mkdirSync(path.join(localAppData, 'SecureDataMsg'), { recursive: true });
  // A file where the batch directory must be makes the private root unusable.
  fs.writeFileSync(path.join(localAppData, 'SecureDataMsg', 'batches'), 'not a directory');
  const entry = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js');
  const result = spawnSync(process.execPath, [entry], {
    input: '',
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, LOCALAPPDATA: localAppData, EU_PRIVACY_ROOT: '', EU_PRIVACY_SUPPORT_MODE: '0' }
  });
  assert.strictEqual(result.status, 1, `exit code 1, got ${result.status} (${result.signal || 'no signal'})`);
  assert.strictEqual(result.stdout, '', 'the MCP channel stays silent');
  const lines = result.stderr.split(/\r?\n/u).filter(Boolean);
  assert.strictEqual(lines.length, 1, `one stderr line, got: ${JSON.stringify(result.stderr)}`);
  assert.match(lines[0], /^DataSecure-Start verweigert: UNSAFE_STORAGE_LOCATION \(DataSecure-Version: /u);
  assert.doesNotMatch(result.stderr, /Users|msg_gbh|\.js|\\|\//u, 'no stack trace, no path');
  const marker = JSON.parse(fs.readFileSync(path.join(localAppData, 'SecureDataMsg', 'diagnostics', 'startup-refused.json'), 'utf8'));
  assert.strictEqual(marker.code, 'UNSAFE_STORAGE_LOCATION');
  const events = workflowDiagnostics._test.readWorkflowEvents({ dataRoot: path.join(localAppData, 'SecureDataMsg') });
  assert.strictEqual(events.at(-1).event, 'startup_refused');
  assert.strictEqual(events.at(-1).error_code, 'UNSAFE_STORAGE_LOCATION');
  assert.strictEqual(marker.journal_recorded, true);
});

test('an early product-module load failure is caught by the tiny bootstrap without a stack trace', () => {
  const localAppData = path.join(base, 'early-load-localappdata');
  const entry = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js');
  const child = [
    "const Module=require('module')",
    'const original=Module._load',
    "Module._load=function(request){if(request==='./mcp-server')throw new Error('synthetic C:\\\\Users\\\\someone\\\\secret.js load failure');return original.apply(this,arguments)}",
    `require(${JSON.stringify(entry)})`
  ].join(';');
  const result = spawnSync(process.execPath, ['-e', child], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
    env: { ...process.env, LOCALAPPDATA: localAppData, EU_PRIVACY_ROOT: '', EU_PRIVACY_SUPPORT_MODE: '0' }
  });
  assert.strictEqual(result.status, 1);
  assert.strictEqual(result.stdout, '');
  const lines = result.stderr.split(/\r?\n/u).filter(Boolean);
  assert.strictEqual(lines.length, 1, JSON.stringify(result.stderr));
  assert.match(lines[0], /^DataSecure-Start verweigert: STARTUP_FAILED \(DataSecure-Version: /u);
  assert.doesNotMatch(result.stderr, /secret|someone|\.js| at |\\|\//u);
  const marker = JSON.parse(fs.readFileSync(path.join(localAppData, 'SecureDataMsg', 'diagnostics', 'startup-refused.json'), 'utf8'));
  assert.strictEqual(marker.code, 'STARTUP_FAILED');
});

test('bootstrap fallback stays path-free even when the regular startup guard cannot load', () => {
  const entry = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js');
  const child = [
    "const Module=require('module')",
    'const original=Module._load',
    "Module._load=function(request){if(request==='./mcp-server'||request==='./gateway/startup-guard')throw new Error('synthetic C:\\\\Users\\\\someone\\\\secret.js load failure');return original.apply(this,arguments)}",
    `require(${JSON.stringify(entry)})`
  ].join(';');
  const result = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.strictEqual(result.status, 1);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, 'DataSecure-Start verweigert: STARTUP_FAILED. Lokale Verarbeitung ist nicht verfügbar.\n');
});

done(() => fs.rmSync(base, { recursive: true, force: true }));
