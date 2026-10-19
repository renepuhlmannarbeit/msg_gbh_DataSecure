'use strict';
// Targeted observation countercases. No Mac/native-product acceptance claim.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Module = require('node:module'), vm = require('node:vm'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events'), cp = require('node:child_process');
const observer = require('./standalone-history-read-observer.cjs');
const repository = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const PRIVATE = 'PRIVATE_OBSERVER_CANARY';
const checkFiles = ['tests/lib/standalone-history-read-observer.cjs', 'tests/test-standalone-sidecar.js',
  'tests/lib/standalone-history-read-observer-cases.cjs', 'plugins/data-secure/server/gateway/result-export.js',
  'plugins/data-secure/server/gateway/batch-journal-store.js', 'plugins/data-secure/server/core/bound-file-io.js',
  'plugins/data-secure/server/standalone/run-history.js', 'plugins/data-secure/server/gateway/standalone-history-store.js',
  'plugins/data-secure/server/gateway/standalone-document-review-store.js'];
const pins = Object.fromEntries(checkFiles.map(file => [file, hash(fs.readFileSync(path.join(repository, file)))]));
function parentAt(server, relative) {
  const parent = new Module(path.join(server, relative)); parent.filename = parent.id;
  parent.paths = Module._nodeModulePaths(path.dirname(parent.filename)); return parent;
}
function lines(text) { return text.trim().split('\n').filter(Boolean).map(line => {
  assert.ok(line.startsWith(observer.PREFIX)); return JSON.parse(line.slice(observer.PREFIX.length));
}); }
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
if (process.argv[2] === '--publish') {
  const file = process.argv[3]; assert.ok(path.basename(file) === 'atomic-record.json' || /^re_[a-f0-9]{32}\.json$/u.test(path.basename(file)));
  assert.ok(path.resolve(file).startsWith(path.join(repository, 'dist') + path.sep));
  const tmp = file + '.new-' + process.pid;
  const payload = path.basename(file) === 'atomic-record.json' ? '{"version":2}' : JSON.stringify({
    schema: 'datasecure-result-export/2', product_channel: 'standalone', run_directory: 'Lauf-20261019-000000-aaaaaaaa',
    items: [], complete: false, destination_id: 'b'.repeat(64) });
  fs.writeFileSync(tmp, payload, { flag: 'wx' }); fs.renameSync(tmp, file);
  process.stdout.write('PUBLISHED\n');
} else (async () => {
  assert.equal(process.version, 'v22.23.2');
  const evidence = fs.mkdtempSync(path.join(repository, 'dist', 'rc164-history-read-observer-'));
  const fixture = fs.mkdtempSync(path.join(evidence, 'datasecure-standalone-ipc-'));
  const caseRoot = path.join(fixture, 'content-format-workflow'), server = path.join(fixture, 'packaged-server');
  fs.mkdirSync(caseRoot);
  const { collectStandaloneRuntime } = await import('../../scripts/lib/standalone-runtime-projection.mjs');
  // Common actual production closure, no native or conversion binaries needed.
  for (const file of collectStandaloneRuntime(path.join(repository, 'plugins/data-secure/server'), null)) {
    const target = path.join(server, file.relative); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.bytes, { flag: 'wx' });
  }
  await test('wrong synthetic scope/server and reparse projection are refused before product import', () => {
    assert.throws(() => observer.install({ caseRoot: caseRoot + '-wrong', server }));
    assert.throws(() => observer.install({ caseRoot, server: path.join(caseRoot, 'packaged-server') }));
    const other = fs.mkdtempSync(path.join(evidence, 'datasecure-standalone-ipc-'));
    const otherCase = path.join(other, 'content-format-workflow'); fs.mkdirSync(otherCase);
    fs.symlinkSync(server, path.join(other, 'packaged-server'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => observer.install({ caseRoot: otherCase, server: path.join(other, 'packaged-server') }));
  });
  await test('a projected source-byte mismatch is refused, not blessed as the original product', () => {
    const other = fs.mkdtempSync(path.join(evidence, 'datasecure-standalone-ipc-'));
    const otherCase = path.join(other, 'content-format-workflow'), otherServer = path.join(other, 'packaged-server');
    fs.mkdirSync(otherCase); fs.mkdirSync(path.join(otherServer, 'standalone'), { recursive: true });
    fs.writeFileSync(path.join(otherServer, 'standalone/application-service.js'), '// wrong bytes', { flag: 'wx' });
    assert.throws(() => observer.install({ caseRoot: otherCase, server: otherServer }), /HISTORY_READ_OBSERVER_SOURCE/u);
  });
  const appParent = parentAt(server, 'standalone/application-service.js');
  const historyParent = parentAt(server, 'standalone/run-history.js');
  const storeParent = parentAt(server, 'gateway/standalone-history-store.js');
  const exportParent = parentAt(server, 'gateway/result-export.js');
  const privateRoot = path.join(caseRoot, 'private'); fs.mkdirSync(privateRoot);
  process.env.EU_PRIVACY_DATA_ROOT = privateRoot;
  process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  const token = 'a'.repeat(64), exportId = 're_' + hash(token).slice(0, 32);
  for (const name of ['standalone-run-history', 'batches', 'result-export-state', 'result-export-owners'])
    fs.mkdirSync(path.join(privateRoot, name));
  let output = '', restore = observer.install({ caseRoot, server, write: line => { output += line; } });
  const originalLoad = Module._load;
  // These requires have the actual projected caller filename. The real module
  // bytes execute; the observer does not use checkout-only gateway identities.
  const batch = appParent.require('../gateway/batch');
  const exports = appParent.require('../gateway/result-export');
  const store = historyParent.require('../gateway/standalone-history-store');
  const runHistory = appParent.require('./run-history');
  const rawBatch = require(path.join(server, 'gateway/batch.js'));
  const rawExports = require(path.join(server, 'gateway/result-export.js'));
  try {
    await test('real projected absent locator/summary/export stay null, no repair or retry', () => {
      assert.equal(store.readHistoryLocator(token), null);
      assert.equal(store.readStandaloneSummary(token), null);
      assert.equal(exports.readStandaloneExportHistoryEntry(token), null);
      const events = lines(output);
      for (const phase of ['locator', 'saved_summary', 'export']) assert.ok(events.some(row => row.phase === phase));
      assert.deepEqual(fs.readdirSync(path.join(privateRoot, 'result-export-state')), []);
    });
    await test('real projected malformed journal is classified without changing public failure', () => {
      fs.writeFileSync(path.join(privateRoot, 'batches', token + '.json'), '{"product_channel":"standalone"}', { flag: 'wx' });
      assert.throws(() => batch.readStandaloneHistoryState(token), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
      assert.ok(lines(output).some(row => row.phase === 'journal' && row.kind === 'error'));
    });
    await test('real projected malformed export exposes inner bound/read and outer export phase', () => {
      fs.writeFileSync(path.join(privateRoot, 'result-export-state', exportId + '.json'), PRIVATE, { flag: 'wx' });
      assert.throws(() => exports.readStandaloneExportHistoryEntry(token), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
      assert.ok(lines(output).some(row => row.phase === 'export' && row.operation === 'readStandaloneExportHistoryEntry' && row.kind === 'error'));
      assert.ok(!output.includes(PRIVATE) && !output.includes(caseRoot));
    });
    await test('actual targeted export owner and document-anchor reads have separate closed phases', () => {
      for (const [letter, namespace, phase] of [['b', 'result-export-owners', 'export_owner'], ['c', 'document-reviews', 'export_anchor']]) {
        const id = letter.repeat(64), name = 're_' + hash(id).slice(0, 32) + '.json';
        fs.writeFileSync(path.join(privateRoot, 'result-export-state', name), JSON.stringify({ schema: 'datasecure-result-export/2',
          product_channel: 'standalone', run_directory: 'Lauf-20261019-000000-aaaaaaaa', items: [], complete: false, destination_id: '' }), { flag: 'wx' });
        const file = namespace === 'document-reviews' ? path.join(privateRoot, namespace, id, 'manifest.json') : path.join(privateRoot, namespace, name);
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '{}', { flag: 'wx' });
        assert.throws(() => exports.readStandaloneExportHistoryEntry(id), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
        assert.ok(lines(output).some(row => row.phase === phase && row.operation === 'readBoundFile'));
      }
    });
    await test('actual journal content-anchor refusal has its own phase and unchanged public code', () => {
      const id = 'd'.repeat(64), file = path.join(privateRoot, 'document-reviews', id, 'manifest.json');
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '{}', { flag: 'wx' });
      fs.writeFileSync(path.join(privateRoot, 'batches', id + '.json'), JSON.stringify({ schema: 'datasecure-batch/2', token: id,
        product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(), items: [{ id: 'a'.repeat(32), name: 'synthetic.txt', status: 'pending' }] }), { flag: 'wx' });
      assert.throws(() => batch.readStandaloneHistoryState(id), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
      assert.ok(lines(output).some(row => row.phase === 'journal_anchor'));
    });
    await test('observer writer/hash failures cannot replace the exact original error or return object (model seam)', () => {
      // A tiny import seam isolates observer semantics. No native/product PASS
      // is inferred from these deliberately injected functions.
      const method = rawBatch.readStandaloneHistoryState, own = { ok: true }, error = Object.assign(Error(PRIVATE), { code: 'EACCES' });
      try {
        rawBatch.readStandaloneHistoryState = () => { throw error; };
        const view = appParent.require('../gateway/batch');
        assert.throws(() => view.readStandaloneHistoryState(token), caught => caught === error);
        rawBatch.readStandaloneHistoryState = () => own;
        assert.equal(appParent.require('../gateway/batch').readStandaloneHistoryState(token), own);
      } finally { rawBatch.readStandaloneHistoryState = method; }
    });
    await test('no getters/proxies or private vendor codes become closed error fields', () => {
      const hostile = Object.defineProperty({}, 'code', { get() { throw Error(PRIVATE); } });
      assert.equal(observer.safeCode(hostile), 'OTHER');
      assert.equal(observer.safeCode(new Proxy({}, { getOwnPropertyDescriptor() { throw Error(PRIVATE); } })), 'OTHER');
      assert.equal(observer.safeCode({ code: PRIVATE }), 'OTHER');
      assert.equal(observer.safeEvent({ seq: 1, call: 1, kind: 'error', phase: 'export', operation: 'readBoundFile', code: 'EIO', path: PRIVATE }), null);
    });
    await test('actual production factory/resolveResults returns the identical resolver error', () => {
      const error = Object.assign(Error(PRIVATE), { code: 'EIO' });
      const resolver = runHistory.createRunHistory({ readState() { throw error; }, readExport() {}, readStates() { return []; } });
      assert.throws(() => resolver.resolveResults(token), caught => caught === error);
      assert.ok(lines(output).some(row => row.phase === 'resolver' && row.kind === 'error' && row.code === 'EIO'));
    });
  } finally { restore(); }
  assert.notEqual(Module._load, originalLoad);

  await test('fresh unused-budget retained wrappers are inert after restore', () => {
    // A fresh empty output budget prevents exhaustion from hiding live hooks.
    // Cached product modules are intentionally removed only in this test host.
    for (const key of Object.keys(require.cache)) if (key.startsWith(server + path.sep)) delete require.cache[key];
    let count = 0, hashes = 0;
    restore = observer.install({ caseRoot, server, write() { count++; }, identityHash(bytes) { hashes++; return hash(bytes); } });
    const retained = appParent.require('../gateway/batch'); restore(); count = 0; hashes = 0;
    assert.throws(() => retained.readStandaloneHistoryState(token), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
    assert.equal(count, 0);
    assert.equal(hashes, 0, 'retained/destructured observation performs no hashing after restore');
  });
  await test('throwing sink and failed optional identity hashing preserve real I/O/errors', () => {
    for (const key of Object.keys(require.cache)) if (key.startsWith(server + path.sep)) delete require.cache[key];
    restore = observer.install({ caseRoot, server, write() { throw Error(PRIVATE); }, identityHash() { throw Error(PRIVATE); } });
    try {
      const heldBatch = appParent.require('../gateway/batch');
      // Fail only the observer's hash, never crypto used by real production.
      assert.throws(() => heldBatch.readStandaloneHistoryState(token), { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
      const raw = require(path.join(server, 'gateway/batch.js')), method = raw.readStandaloneHistoryState;
      const originalError = Object.assign(Error(PRIVATE), { code: 'EACCES' }), originalReturn = {};
      try {
        raw.readStandaloneHistoryState = () => { throw originalError; };
        assert.throws(() => appParent.require('../gateway/batch').readStandaloneHistoryState(token), error => error === originalError);
        raw.readStandaloneHistoryState = () => originalReturn;
        assert.equal(appParent.require('../gateway/batch').readStandaloneHistoryState(token), originalReturn);
      } finally { raw.readStandaloneHistoryState = method; }
    } finally { restore(); }
  });
  await test('max128 closed records reserve error capacity after routine metadata reaches64', () => {
    for (const key of Object.keys(require.cache)) if (key.startsWith(server + path.sep)) delete require.cache[key];
    let text = ''; restore = observer.install({ caseRoot, server, write: line => { text += line; } });
    try {
      const held = historyParent.require('../gateway/standalone-history-store');
      for (let n = 0; n < 100; n++) assert.equal(held.readHistoryLocator(token), null);
      const heldBatch = appParent.require('../gateway/batch');
      const raw = require(path.join(server, 'gateway/batch.js')), method = raw.readStandaloneHistoryState;
      try {
        raw.readStandaloneHistoryState = () => { throw Object.assign(Error(PRIVATE), { code: 'STANDALONE_RESULTS_MISSING' }); };
        const pending = appParent.require('../gateway/batch');
        for (let n = 0; n < 100; n++) assert.throws(() => pending.readStandaloneHistoryState(token));
      } finally { raw.readStandaloneHistoryState = method; }
      for (let n = 0; n < 150; n++) assert.throws(() => heldBatch.readStandaloneHistoryState(token));
      const events = lines(text); assert.equal(events.length, 128);
      assert.ok(events.some(row => row.kind === 'error' && row.phase === 'journal'));
      assert.ok(!text.includes(PRIVATE) && !text.includes(privateRoot));
    } finally { restore(); }
  });

  // Execute the exact real protocolClient function, not a regex assertion.
  const source = fs.readFileSync(path.join(repository, 'tests/test-standalone-sidecar.js'), 'utf8');
  const functionBytes = source.slice(source.indexOf('function protocolClient('), source.indexOf('\nconst sidecarFile ='));
  const { encodeFrame } = require('../../plugins/data-secure/server/standalone/desktop-ipc');
  const responseFrame = value => { const bytes = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
    header.writeUInt32BE(bytes.length); return Buffer.concat([header, bytes]); };
  const protocolClient = vm.runInNewContext('(' + functionBytes.trim() + ')', { Buffer, Promise, Date, Error, clearTimeout, setTimeout, encodeFrame });
  function fakeChild() { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { write() {} }; return child; }
  const event = (seq, code = 'BOUND_FILE_CHANGED') => observer.PREFIX + JSON.stringify({ seq, call: 1, phase: 'export',
    operation: 'readBoundFile', kind: 'error', code }) + '\n';
  await test('normal error response without exit promotes split stderr before caller cleanup', async () => {
    const child = fakeChild(), order = [], collector = observer.createCollector({ write(line) { order.push('trace'); assert.ok(!line.includes(PRIVATE)); } });
    const client = protocolClient(child, undefined, undefined, collector);
    const response = client.send('resolve_history_results', '1'.repeat(16), { batch_id: token });
    child.stdout.emit('data', responseFrame({ request_id: '1'.repeat(16), ok: false, error_code: 'STANDALONE_HISTORY_UNAVAILABLE' }));
    // Simulate stdout arriving before its earlier stderr write, no exit event.
    setImmediate(() => { const value = event(1); child.stderr.emit('data', Buffer.from(value.slice(0, 20)));
      child.stderr.emit('data', Buffer.from(value.slice(20))); });
    const received = await response; order.push('cleanup');
    assert.equal(received.error_code, 'STANDALONE_HISTORY_UNAVAILABLE'); assert.deepEqual(order, ['trace', 'cleanup']);
  });
  await test('collector failure never replaces original parsed response; no trace on successful response', async () => {
    const child = fakeChild(), client = protocolClient(child, undefined, undefined,
      { append() { throw Error(PRIVATE); }, promote() { throw Error(PRIVATE); } });
    const response = client.send('resolve_history_results', '2'.repeat(16), { batch_id: token });
    child.stderr.emit('data', Buffer.from(PRIVATE));
    child.stdout.emit('data', responseFrame({ request_id: '2'.repeat(16), ok: false, error_code: 'STANDALONE_HISTORY_UNAVAILABLE' }));
    assert.equal((await response).error_code, 'STANDALONE_HISTORY_UNAVAILABLE');
    let promotions = 0; const second = fakeChild(), success = protocolClient(second, undefined, undefined,
      { append() {}, promote() { promotions++; } }).send('get_ui_context', '3'.repeat(16));
    second.stdout.emit('data', responseFrame({ request_id: '3'.repeat(16), ok: true, result: { canary: PRIVATE } }));
    assert.equal((await success).result.canary, PRIVATE); assert.equal(promotions, 0);
    const pendingChild = fakeChild(), pending = protocolClient(pendingChild, undefined, undefined,
      { append() {}, promote() { promotions++; } }).send('resolve_history_results', '4'.repeat(16), { batch_id: token });
    pendingChild.stdout.emit('data', responseFrame({ request_id: '4'.repeat(16), ok: false, error_code: 'STANDALONE_RESULTS_MISSING' }));
    assert.equal((await pending).error_code, 'STANDALONE_RESULTS_MISSING'); assert.equal(promotions, 0, 'existing allowed-pending polling is not delayed');
  });
  await test('collector rejects extra fields/unknown codes/oversized partials and caps128 records', async () => {
    let text = ''; const collector = observer.createCollector({ write(line) { text += line; } });
    collector.append(Buffer.from(observer.PREFIX + JSON.stringify({ seq: 1, call: 1, kind: 'error', phase: 'export', operation: 'readBoundFile', code: PRIVATE }) + '\n'));
    collector.append(Buffer.from(observer.PREFIX + 'x'.repeat(4096)));
    collector.append(Buffer.from('\n' + PRIVATE + '\n'));
    for (let n = 1; n <= 200; n++) collector.append(Buffer.from(event(n)));
    await collector.promote(); assert.equal(lines(text).length, 128); assert.ok(!text.includes(PRIVATE));
  });
  await test('zero remaining IPC budget does not add a diagnostic wait', async () => {
    const collector = observer.createCollector(); let complete = false;
    await collector.promote(0); complete = true; assert.equal(complete, true);
  });
  await test('old optional ENOENT or earlier resolver errors cannot satisfy a later response trace drain', async () => {
    const collector = observer.createCollector({ write() {} });
    collector.append(Buffer.from(event(1, 'ENOENT') + event(2, 'STANDALONE_RESULTS_MISSING')));
    const checkpoint = collector.checkpoint(); assert.equal(checkpoint, 2);
    let promoted = false;
    const pending = collector.promote(75, checkpoint, 'STANDALONE_HISTORY_UNAVAILABLE').then(() => { promoted = true; });
    await Promise.resolve(); assert.equal(promoted, false);
    collector.append(Buffer.from(event(3, 'STANDALONE_HISTORY_UNAVAILABLE')));
    await pending; assert.equal(promoted, true);
  });
  await test('actual child atomic publisher causes real bound reader change, no successful bytes substituted', () => {
    const file = path.join(evidence, 'atomic-record.json'); fs.writeFileSync(file, '{"version":1}', { flag: 'wx' });
    const original = require('../../plugins/data-secure/server/core/bound-file-io');
    const io = { ...fs }; let exchanged = false, closed = 0;
    io.lstatSync = function (...args) {
      const result = Reflect.apply(fs.lstatSync, this, args);
      if (args[0] === file && !exchanged) {
        exchanged = true;
        const child = cp.spawnSync(process.execPath, [__filename, '--publish', file], { encoding: 'utf8', windowsHide: true,
          timeout: 5000, maxBuffer: 4096, env: { ...process.env, [observer.ENV]: undefined } });
        assert.ifError(child.error); assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, 'PUBLISHED\n');
      }
      return result;
    };
    io.closeSync = function (...args) { closed++; return Reflect.apply(fs.closeSync, this, args); };
    assert.throws(() => original.readBoundFileRecord(file, { io, maximum: 4096 }), { code: 'BOUND_FILE_CHANGED' });
    assert.equal(exchanged, true); assert.equal(closed, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"version":2}');
    // This is a genuine reader/publisher interleaving, not proof that the
    // current Intel failure used this leaf or even this underlying cause.
  });
  await test('three real child replacements exhaust the actual bounded targeted export reader and expose its changed code', () => {
    for (const key of Object.keys(require.cache)) if (key.startsWith(server + path.sep)) delete require.cache[key];
    let text = ''; restore = observer.install({ caseRoot, server, write: line => { text += line; } });
    const id = 'e'.repeat(64), name = 're_' + hash(id).slice(0, 32) + '.json', file = path.join(privateRoot, 'result-export-state', name);
    const value = { schema: 'datasecure-result-export/2', product_channel: 'standalone', run_directory: 'Lauf-20261019-000000-aaaaaaaa',
      items: [], complete: false, destination_id: '' };
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
    try {
      const reader = appParent.require('../gateway/result-export');
      assert.equal(reader.readStandaloneExportHistoryEntry(id).complete, false, 'initial record is genuinely valid');
      const open = fs.openSync; let publishers = 0;
      fs.openSync = function (...args) {
        // Publish after each actual named stat but before open/fstat. This
        // is the read seam only; all writers and all I/O values remain real.
        if (args[0] === file && typeof args[1] === 'number' && (args[1] & 3) === 0 && publishers < 3) {
          const child = cp.spawnSync(process.execPath, [__filename, '--publish', file], { encoding: 'utf8', windowsHide: true,
            timeout: 5000, maxBuffer: 4096, env: { ...process.env, [observer.ENV]: undefined } });
          assert.ifError(child.error); assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, 'PUBLISHED\n'); publishers++;
        }
        return Reflect.apply(open, this, args);
      };
      try { assert.throws(() => reader.readStandaloneExportHistoryEntry(id), { code: 'STANDALONE_HISTORY_UNAVAILABLE' }); }
      finally { fs.openSync = open; }
      assert.equal(publishers, 3, 'all three actual snapshot attempts were changed, without a fourth read');
      assert.equal(reader.readStandaloneExportHistoryEntry(id).complete, false, 'published replacement remains genuinely valid');
      assert.ok(lines(text).some(row => row.phase === 'export' && row.operation === 'readBoundFileSnapshot' && row.code === 'BOUND_FILE_CHANGED'));
      assert.ok(lines(text).some(row => row.phase === 'export' && row.operation === 'readStandaloneExportHistoryEntry' && row.code === 'STANDALONE_HISTORY_UNAVAILABLE'));
    } finally { restore(); }
  });
  await test('all test/product source input bytes unchanged during cases', () => {
    for (const [file, pin] of Object.entries(pins)) assert.equal(hash(fs.readFileSync(path.join(repository, file))), pin);
  });
  fs.writeFileSync(path.join(evidence, 'RESULT.json'), JSON.stringify({ classification: 'ENGINEERING_PROBE/NOT_PRODUCT_ACCEPTANCE',
    passed, node: process.version, source_pins: pins, fixture, mac_native: 'NOT_RUN', current_intel_cause: 'NOT_PROVEN' }, null, 2), { flag: 'wx' });
  console.log(`${passed} history-read observer countercases PASS; evidence preserved: ${evidence}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
