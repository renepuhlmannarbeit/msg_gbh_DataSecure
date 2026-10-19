'use strict';
// RAM-only observer semantics probe. No native Mac/GUI/product PASS claim.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm'), crypto = require('node:crypto');
const directory = __dirname, repository = path.resolve(directory, '../..');
const observerSource = fs.readFileSync(path.join(directory, 'standalone-history-read-observer.cjs'), 'utf8');
const boundSource = fs.readFileSync(path.join(repository, 'plugins/data-secure/server/core/bound-file-io.js'), 'utf8');
const sentinel = 'PRIVATE_PATH_PID_CONTENT_STAT_STACK_SENTINEL';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pins = { observer: digest(observerSource), boundary: digest(boundSource) };
const fixtureRoot = path.join(directory, 'datasecure-standalone-ipc-RAMONLY');
const caseRoot = path.join(fixtureRoot, 'content-format-workflow'), server = path.join(fixtureRoot, 'packaged-server');
const leaf = path.join(caseRoot, sentinel, 'result-export-state', 're_' + 'a'.repeat(32) + '.json');
const parent = filename => ({ filename: path.join(server, filename) });
let passed = 0;
function host({ failHash = false, failWrite = false } = {}) {
  let mode = 'success', read = false, rawBound, primary, output = '', callLog = [], held = false;
  const realpathError = Object.assign(Error(sentinel), { code: 'EACCES' });
  const closeError = Object.assign(Error(sentinel), { code: 'EIO' });
  let fds = 0;
  function stat(file) {
    const isLeaf = file === leaf;
    return { dev: 1n, ino: isLeaf ? 44n : 22n, birthtimeNs: 111n,
      size: isLeaf ? 4n : 0n, nlink: 1n, mode: isLeaf ? 0o100600n : 0o40700n,
      mtimeNs: isLeaf && read && mode === 'changed' ? 223n : 222n, ctimeNs: 333n,
      isFile() { return isLeaf; }, isDirectory() { return !isLeaf; }, isSymbolicLink() { return false; } };
  }
  const ramFs = { constants: fs.constants,
    lstatSync(file) { callLog.push(['lstatSync', file]); return stat(file); },
    realpathSync(file) { callLog.push(['realpathSync', file]); if (mode === 'realpath') throw realpathError; return file; },
    openSync(file) { callLog.push(['openSync', file]); held = true; return ++fds; },
    fstatSync(fd) { callLog.push(['fstatSync', fd]); return stat(leaf); },
    readSync(fd, buffer, offset, length, position) {
      callLog.push(['readSync', fd, offset, length, position]);
      Buffer.from('DATA').copy(buffer, offset, position, position + length); read = true; return length;
    },
    closeSync(fd) { callLog.push(['closeSync', fd]); held = false; if (mode === 'close') throw closeError; }
  };
  const installBoundary = { bindDirectory: file => ({ real: file }), assertDirectory() {},
    readBoundFile: () => Buffer.from('same-frozen-source-model') };
  const rawExport = { readStandaloneExportHistoryEntry() {
    const api = fakeModule._load('../core/bound-file-io', parent('gateway/result-export.js'));
    return api.readBoundFileSnapshot(leaf, { minimum: 1, maximum: 1024 });
  } };
  const rawHistory = { readHistoryLocator() { return null; }, readStandaloneSummary() { return null; } };
  function loadBoundary() {
    if (rawBound) return rawBound;
    const sandbox = { module: { exports: {} }, exports: {}, Buffer, Symbol, process: { platform: process.platform },
      require(request) { return fakeModule._load(request, parent('core/bound-file-io.js')); } };
    vm.runInNewContext(boundSource, sandbox, { filename: 'ACTUAL_BOUND_SOURCE_RAM_FS' });
    rawBound = sandbox.module.exports;
    const actual = rawBound.readBoundFileSnapshot;
    rawBound.readBoundFileSnapshot = function (...args) {
      try { return Reflect.apply(actual, this, args); } catch (error) { primary = error; throw error; }
    };
    return rawBound;
  }
  const fakeModule = { _load(request) {
    if (request === 'node:fs') return ramFs;
    if (request === 'node:path') return path;
    if (request === 'node:crypto') return crypto;
    if (request === '../core/bound-file-io') return loadBoundary();
    if (request === '../gateway/result-export') return rawExport;
    if (request === '../gateway/standalone-history-store') return rawHistory;
    throw Error('unexpected RAM import');
  } };
  const processStub = { stderr: { write() {} }, env: {}, argv: [], platform: process.platform };
  const sandbox = { module: { exports: {} }, exports: {}, __dirname: directory, Buffer, process: processStub,
    setTimeout, clearTimeout, require(request) {
      if (request === 'node:fs') return fs;
      if (request === 'node:path') return path;
      if (request === 'node:crypto') return crypto;
      if (request === 'node:module') return fakeModule;
      if (request === 'node:util') return require('node:util');
      if (request === '../../plugins/data-secure/server/core/bound-file-io') return installBoundary;
      throw Error('unexpected observer RAM import');
    } };
  sandbox.require.cache = Object.create(null);
  vm.runInNewContext(observerSource, sandbox, { filename: 'CANDIDATE_OBSERVER_RAM' });
  const observer = sandbox.module.exports;
  const restore = observer.install({ caseRoot, server,
    identityHash(bytes) { if (failHash) throw Error(sentinel); return digest(bytes); },
    write(line) { if (failWrite) throw Error(sentinel); output += line; } });
  const reader = fakeModule._load('../gateway/result-export', parent('standalone/application-service.js'));
  const history = fakeModule._load('../gateway/standalone-history-store', parent('standalone/run-history.js'));
  return { observer, restore, read(next) { mode = next; read = false; primary = undefined; return reader.readStandaloneExportHistoryEntry(); },
    raw(next) { mode = next; read = false; primary = undefined; return loadBoundary().readBoundFileSnapshot(leaf, { minimum: 1, maximum: 1024 }); },
    exhaust() { for (let index = 0; index < 100; index++) assert.equal(history.readHistoryLocator(), null); },
    primary: () => primary, output: () => output,
    log() { const value = callLog; callLog = []; return value; }, held: () => held };
}
function rows(h) { return h.output().trim().split('\n').filter(Boolean).map(line => {
  assert.ok(Buffer.byteLength(line + '\n') <= 512); assert.ok(line.startsWith(h.observer.PREFIX));
  const event = JSON.parse(line.slice(h.observer.PREFIX.length)); assert.ok(h.observer.safeEvent(event)); return event;
}); }
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
test('successful snapshot returns exact bytes and emits no private IO ring', () => {
  const h = host(); try { assert.equal(h.read('success').toString(), 'DATA');
    assert.equal(rows(h).filter(row => row.kind === 'io').length, 0); assert.equal(h.held(), false);
  } finally { h.restore(); }
});
test('exhausted routine budget retains current eight-point causal ring and exact primary error', () => {
  const h = host(); try {
    h.exhaust(); const before = rows(h); assert.equal(before.length, 64);
    assert.throws(() => h.read('changed'), error => error === h.primary() && error.code === 'BOUND_FILE_CHANGED');
    const current = rows(h).slice(before.length), io = current.filter(row => row.kind === 'io');
    assert.equal(io.length, 8); assert.ok(io.every(row => row.call > 100));
    assert.ok(io.some(row => row.operation === 'fstatSync' && row.role === 'leaf' && row.object_sha256));
    assert.ok(io.some(row => row.operation === 'closeSync')); assert.equal(h.held(), false);
    assert.ok(current.some(row => row.kind === 'error' && row.operation === 'readBoundFileSnapshot'));
    assert.ok(!h.output().includes(sentinel) && !h.output().includes(caseRoot));
  } finally { h.restore(); }
});
test('realpath failure checkpoint survives routine exhaustion and keeps original error object', () => {
  const h = host(); try { h.exhaust();
    assert.throws(() => h.read('realpath'), error => error === h.primary() && error.code === 'EACCES');
    assert.ok(rows(h).some(row => row.kind === 'io' && row.operation === 'realpathSync' && row.role === 'parent' && row.code === 'EACCES'));
  } finally { h.restore(); }
});
test('close failure remains dominant and diagnostic field hashes are split and sanitized', () => {
  const h = host(); try {
    assert.throws(() => h.read('close'), error => error === h.primary() && error.code === 'BOUND_FILE_CLOSE_FAILED');
    const events = rows(h), facts = events.filter(row => row.kind === 'io' && row.object_sha256);
    assert.ok(facts.length > 0); for (const fact of facts) {
      for (const key of ['object_sha256', 'content_sha256', 'fact_sha256']) assert.match(fact[key], /^[a-f0-9]{64}$/u);
      assert.ok(['zero', 'one', 'other'].includes(fact.links)); assert.ok(['regular', 'symlink', 'other'].includes(fact.type));
      assert.equal(h.observer.safeEvent({ ...fact, raw_path: sentinel }), null);
    }
    assert.ok(events.some(row => row.kind === 'io' && row.operation === 'closeSync' && row.code === 'EIO'));
    assert.equal(h.held(), false);
  } finally { h.restore(); }
});
test('all delegated filesystem operations and their order match the unobserved boundary', () => {
  const observed = host(); let observedLog;
  try { assert.throws(() => observed.read('changed')); observedLog = observed.log(); }
  finally { observed.restore(); }
  const baseline = host(); try { baseline.restore(); assert.throws(() => baseline.raw('changed'));
    assert.deepEqual(baseline.log(), observedLog);
  } finally { baseline.restore(); }
});
test('throwing diagnostic sink/hash cannot replace actual error or successful returned bytes', () => {
  for (const options of [{ failHash: true }, { failWrite: true }]) {
    const h = host(options); try { assert.equal(h.read('success').toString(), 'DATA');
      assert.throws(() => h.read('changed'), error => error === h.primary() && error.code === 'BOUND_FILE_CHANGED');
      assert.equal(h.held(), false);
    } finally { h.restore(); }
  }
});
test('global 128 limit and collector closed schema/512-byte transport remain enforced', () => {
  const h = host(); try { h.exhaust(); for (let index = 0; index < 100; index++) assert.throws(() => h.read('changed'));
    const events = rows(h); assert.equal(events.length, 128); assert.equal(events.at(-1).seq, 128);
    assert.ok(!h.output().includes(sentinel));
    let text = ''; const collector = h.observer.createCollector({ write(line) { text += line; } });
    collector.append(Buffer.from(h.output()));
    collector.promote(0); assert.equal(text, h.output(), 'zero-budget promotion flushes synchronously without adding a wait');
  } finally { h.restore(); }
});
test('retained observation becomes inert after restoration', () => {
  const h = host(); h.exhaust(); h.restore(); const previous = h.output();
  assert.throws(() => h.read('changed'), error => error === h.primary()); assert.equal(h.output(), previous);
});
assert.equal(digest(fs.readFileSync(path.join(directory, 'standalone-history-read-observer.cjs'))), pins.observer);
assert.equal(digest(fs.readFileSync(path.join(repository, 'plugins/data-secure/server/core/bound-file-io.js'))), pins.boundary);
console.log(JSON.stringify({ classification: 'RAM_OBSERVER_COUNTERCASES_NOT_MAC_OR_PRODUCT_ACCEPTANCE', passed,
  source_sha256: pins, native_mac: 'NOT_RUN', product_source_edits: false }));
