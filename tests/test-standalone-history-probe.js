'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), Module = require('node:module'), crypto = require('node:crypto');
const { install, safeProbeLines } = require('./lib/standalone-history-probe.cjs');
const PRIVATE = 'PRIVATE_HISTORY_PROBE_CANARY';
if (process.argv[2] === '--child') {
  const root = fs.realpathSync.native(process.argv[3]);
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.match(path.basename(root), /^datasecure-history-probe-/u);
  const originalLoad = Module._load, originalReaddir = fs.readdirSync;
  const windowFile = path.resolve(__dirname, '../plugins/data-secure/server/gateway/standalone-history-window.js');
  const parent = new Module(windowFile);
  parent.filename = windowFile;
  parent.paths = Module._nodeModulePaths(path.dirname(windowFile));
  const originalBoundary = require('../plugins/data-secure/server/core/bound-file-io');
  const restore = install(root);
  let boundary, leaf, summaries;
  try {
    boundary = parent.require('../core/bound-file-io');
    assert.notEqual(boundary, originalBoundary);
    const storeParent = new Module(path.resolve(__dirname, '../plugins/data-secure/server/gateway/standalone-history-store.js'));
    storeParent.filename = storeParent.id;
    storeParent.paths = Module._nodeModulePaths(path.dirname(storeParent.filename));
    const migrationBoundary = storeParent.require('../core/bound-file-io');
    assert.notEqual(migrationBoundary, originalBoundary, 'direct migration reads receive the same observation');
    leaf = path.join(root, PRIVATE + '.txt');
    fs.writeFileSync(leaf, PRIVATE, { flag: 'wx', mode: 0o600 });
    const record = boundary.readBoundFileRecord(leaf, { maximum: 4096 });
    assert.equal(record.bytes.toString('utf8'), PRIVATE, 'the real successful bytes remain unchanged');
    const syntheticFailure = Object.assign(Error(PRIVATE), { code: 'EACCES' });
    const bind = originalBoundary.bindDirectory;
    originalBoundary.bindDirectory = () => { throw syntheticFailure; };
    try { assert.throws(() => boundary.bindDirectory(root), error => error === syntheticFailure); }
    finally { originalBoundary.bindDirectory = bind; }
    summaries = path.join(root, 'standalone-run-history');
    fs.mkdirSync(summaries, { mode: 0o700 });
    fs.writeFileSync(path.join(summaries, 'a'.repeat(64) + '.json'), '{}', { flag: 'wx' });
    fs.writeFileSync(path.join(summaries, PRIVATE), PRIVATE, { flag: 'wx' });
    assert.equal(fs.readdirSync(summaries).length, 2, 'observation never filters the actual directory result');
    const hash = crypto.createHash;
    crypto.createHash = () => { throw Error(PRIVATE); };
    try {
      assert.equal(boundary.readBoundFileRecord(leaf, { maximum: 4096 }).bytes.toString('utf8'), PRIVATE);
      assert.equal(fs.readdirSync(summaries).length, 2, 'failed hashing cannot replace real I/O');
    } finally { crypto.createHash = hash; }
    for (let index = 0; index < 150; index++)
      assert.throws(() => boundary.readBoundFileRecord(path.join(root, 'missing'), { maximum: 4096 }), { code: 'ENOENT' });
  } finally {
    restore();
    assert.equal(Module._load, originalLoad);
    assert.equal(fs.readdirSync, originalReaddir);
  }
  // Use a FRESH installation whose budget has never been consumed. Otherwise
  // budget guards alone could hide an incorrectly active captured wrapper.
  const freshRestore = install(root);
  const freshBoundary = parent.require('../core/bound-file-io');
  const freshMembership = fs.readdirSync;
  freshRestore();
  // Even already-destructured wrappers must be inert after restoration.
  const hash = crypto.createHash; let observerCalls = 0;
  crypto.createHash = function (...args) { observerCalls++; return Reflect.apply(hash, this, args); };
  try {
    assert.equal(freshBoundary.readBoundFileRecord(leaf, { maximum: 4096 }).bytes.toString('utf8'), PRIVATE);
    assert.equal(freshMembership(summaries).length, 2);
    assert.equal(observerCalls, 0);
  } finally { crypto.createHash = hash; }
  process.stdout.write('PASS real I/O, same error identity, no filtering, nonfatal observer failures, bounded events, restored hooks\n');
} else {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-history-probe-'));
  const child = cp.spawnSync(process.execPath, [__filename, '--child', root],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024 });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  const lines = safeProbeLines(child.stderr);
  assert.equal(lines.length, 128, 'test diagnostics cannot grow without a bound');
  assert.doesNotMatch(child.stderr, new RegExp(PRIVATE, 'u'));
  assert.doesNotMatch(child.stderr, /datasecure-history-probe-/u, 'no fixture paths are emitted');
  assert.ok(lines.some(line => line.includes('"code":"EACCES"')));
  assert.ok(lines.some(line => line.includes('"kind":"membership"')));
  assert.ok(lines.some(line => line.includes('"kind":"record"')));
  const hostile = ['null', '[]', '{"kind":"error","phase":"migration","code":"PRIVATE"}',
    '{"kind":"error","phase":"migration","code":"OTHER","path":"PRIVATE"}',
    '{"kind":"membership","namespace":"summaries","count":-1,"sha256":"' + 'a'.repeat(64) + '"}',
    '{"kind":"record","bytes":4097,"sha256":"' + 'a'.repeat(64) + '"}', '{broken'];
  assert.deepEqual(safeProbeLines(hostile.map(value => 'STANDALONE_HISTORY_PROBE:' + value).join('\n')), []);
  assert.deepEqual(safeProbeLines('STANDALONE_HISTORY_PROBE:' + 'x'.repeat(513)), []);
  console.log(child.stdout.trim());
  console.log('PASS closed diagnostics; synthetic fixture preserved; no native Mac/GUI claim');
}
