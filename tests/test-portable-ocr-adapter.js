'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const {
  runtimeTarget, portableOcrStatus, ocrPngDetailedPortable, PortableOcrError
} = require('../plugins/data-secure/server/portable-ocr');
const { portableOcrOptions } = require('../plugins/data-secure/server/runtime');

let passed = 0;
// Some module-isolation cases deliberately emulate Windows on a Mac host.
// Canonical fixtures avoid passing that Windows boundary an OS-owned /var alias.
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (error) { console.error(`  fail ${name}`); throw error; }
}
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function isolatedCachedAdapter() {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'portable-ocr-cache-'));
  const server = path.join(root, 'server'); fs.mkdirSync(server);
  const bundle = path.join(server, 'ocr-runtime'); fs.renameSync(fixture(), bundle);
  const source = require.resolve('../plugins/data-secure/server/portable-ocr');
  const instance = { exports: {} };
  // Only isolate the module cache/default installation path. Parsing, bound
  // readers, hashes and filesystem calls remain the actual production code.
  vm.runInNewContext(`(function(require,module,exports,__dirname,process){${fs.readFileSync(source, 'utf8')}\n})`,
    { Buffer, setTimeout, clearTimeout }, { filename: source })(createRequire(source), instance,
    instance.exports, server, { platform: 'win32', arch: 'x64' });
  return { root, bundle, adapter: instance.exports };
}
function fixture(released = true) {
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'portable-ocr-test-'));
  const files = {
    'datasecure-ocr-sandbox.exe': Buffer.from('launcher'),
    'runtime-worker.mjs': Buffer.from('worker'),
    'network-deny.cjs': Buffer.from('deny'),
    'models/deu.traineddata': Buffer.from('deu'),
    'models/eng.traineddata': Buffer.from('eng'),
    'THIRD_PARTY_NOTICES.md': Buffer.from('notices')
  };
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  const manifest = {
    schema: 'data-secure-ocr-runtime-bundle/v1', target: 'windows-x64',
    release_enabled: released, contract: 'data-secure-ocr-result/v1', models: ['deu', 'eng'],
    components: [], files: Object.entries(files).map(([relative, data]) => ({
      path: relative, bytes: data.length, sha256: hash(data)
    }))
  };
  fs.writeFileSync(path.join(root, 'bundle-manifest.json'), JSON.stringify(manifest));
  return root;
}
function fakeSpawn(result, exitCode = 0) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => setImmediate(() => {
      if (result) child.stdout.emit('data', Buffer.from(JSON.stringify(result)));
      child.emit('close', exitCode);
    });
    child.kill = () => true;
    return child;
  };
}
function recordingSpawn(record, result) {
  return (command, args, options) => {
    record.command = command;
    record.args = args;
    record.options = options;
    return fakeSpawn(result)();
  };
}
function hangingSpawn() {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => {};
    child.kill = () => { setImmediate(() => child.emit('close', null)); return true; };
    return child;
  };
}

(async () => {
  console.log('\nPortable OCR adapter');
  await test('maps only the four supported platform targets', () => {
    assert.strictEqual(runtimeTarget('win32', 'x64'), 'windows-x64');
    assert.strictEqual(runtimeTarget('darwin', 'x64'), 'macos-x64');
    assert.strictEqual(runtimeTarget('darwin', 'arm64'), 'macos-arm64');
    assert.strictEqual(runtimeTarget('linux', 'x64'), 'linux-x64');
    assert.strictEqual(runtimeTarget('win32', 'arm64'), null);
  });
  await test('keeps a valid but unreleased bundle disabled', () => {
    const root = fixture(false);
    try { assert.deepStrictEqual(portableOcrStatus({ runtimeRoot: root, platform: 'win32', arch: 'x64' }), {
      available: false, mode: 'bundled_disabled', reason: 'coverage_unverified', target: 'windows-x64'
    }); } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('rejects a modified bundle before execution', () => {
    const root = fixture(true);
    try {
      fs.appendFileSync(path.join(root, 'runtime-worker.mjs'), 'tampered');
      assert.strictEqual(portableOcrStatus({ runtimeRoot: root, platform: 'win32', arch: 'x64' }).reason,
        'bundle_integrity_failed');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('rejects an unlisted file in the executable bundle tree', () => {
    const root = fixture(true);
    try {
      fs.writeFileSync(path.join(root, 'node-options-injection.cjs'), 'unexpected');
      assert.strictEqual(portableOcrStatus({ runtimeRoot: root, platform: 'win32', arch: 'x64' }).reason,
        'bundle_integrity_failed');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('a cached runtime also rejects a new nearer unmanifested dependency', () => {
    const { root, bundle, adapter } = isolatedCachedAdapter();
    try {
      assert.equal(adapter.portableOcrStatus().available, true);
      const injected = path.join(bundle, 'node_modules/tesseract.js/src/worker-script/utils/node_modules/bmp-js/index.js');
      fs.mkdirSync(path.dirname(injected), { recursive: true }); fs.writeFileSync(injected, 'unmanifested');
      assert.equal(adapter.portableOcrStatus().available, false);
      assert.equal(adapter.portableOcrStatus({ noCache: true }).reason, 'bundle_integrity_failed');
    } finally { fs.rmSync(root, { recursive: true }); }
  });
  await test('an uncached alternate runtime cannot replace only the cached identity bindings', () => {
    const { root, bundle, adapter } = isolatedCachedAdapter();
    try {
      const first = adapter.portableOcrStatus(); assert.equal(first.available, true);
      fs.unlinkSync(path.join(bundle, 'bundle-manifest.json'));
      fs.writeFileSync(path.join(bundle, 'datasecure-ocr-sandbox.exe'), 'changed old launcher');
      fs.renameSync(fixture(), path.join(bundle, 'windows-x64'));
      const uncached = adapter.portableOcrStatus({ noCache: true });
      assert.equal(uncached.available, true); assert.notEqual(uncached.launcher, first.launcher);
      const normal = adapter.portableOcrStatus();
      assert.equal(normal.available, true); assert.equal(normal.launcher, uncached.launcher);
      assert.notEqual(normal.launcher, first.launcher);
    } finally { fs.rmSync(root, { recursive: true }); }
  });
  await test('executes a released verified bundle through the bounded adapter', async () => {
    const root = fixture(true);
    const result = {
      schema: 'data-secure-ocr-result/v1', status: 'recognized', languages: ['deu', 'eng'],
      image: { width: 1, height: 1 }, text: 'Hallo', confidence: 99,
      words: [{ index: 0, line_index: 0, text: 'Hallo', confidence: 99,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }],
      quality: { requires_visual_review: true, reasons: ['NON_TEXTUAL_MEANING_UNVERIFIED'] }
    };
    const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
    try {
      const actual = await ocrPngDetailedPortable(png, 'de-DE', {
        runtimeRoot: root, platform: 'win32', arch: 'x64', spawn: fakeSpawn(result)
      });
      assert.strictEqual(actual.text, 'Hallo');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('passes the network preload as an argv item when the installation path contains spaces', async () => {
    const base = fs.mkdtempSync(path.join(temporaryRoot, 'portable ocr parent-'));
    const original = fixture(true);
    const root = path.join(base, 'Data Secure Plugin');
    fs.renameSync(original, root);
    const result = {
      schema: 'data-secure-ocr-result/v1', status: 'empty', languages: ['deu', 'eng'],
      image: { width: 1, height: 1 }, text: '', confidence: 100, words: [],
      quality: { requires_visual_review: true, reasons: ['NON_TEXTUAL_MEANING_UNVERIFIED', 'OCR_EMPTY'] }
    };
    const record = {};
    const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
    try {
      await ocrPngDetailedPortable(png, 'de-DE', {
        runtimeRoot: root, platform: 'win32', arch: 'x64', spawn: recordingSpawn(record, result)
      });
      const requireIndex = record.args.indexOf('--require');
      assert.ok(requireIndex > 0);
      assert.strictEqual(record.args[requireIndex + 1], path.join(root, 'network-deny.cjs'));
      assert.strictEqual(Object.hasOwn(record.options.env, 'NODE_OPTIONS'), false);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  await test('returns only a fixed error when the worker fails', async () => {
    const root = fixture(true);
    const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]) });
    try {
      await assert.rejects(() => ocrPngDetailedPortable(png, 'de-DE', {
        runtimeRoot: root, platform: 'win32', arch: 'x64', spawn: fakeSpawn(null, 125)
      }), (error) => error instanceof PortableOcrError && error.code === 'OCR_RESOURCE_LIMIT' &&
        !error.message.includes(root));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('propagates the visual timeout and cancellation signal into portable OCR', () => {
    const signal = new AbortController().signal;
    assert.deepStrictEqual(portableOcrOptions({ timeoutMs: 1234, signal, portableOcr: { noCache: true } }),
      { noCache: true, timeoutMs: 1234, signal });
    assert.deepStrictEqual(portableOcrOptions({ timeoutMs: 1234, portableOcr: { timeoutMs: 99 } }),
      { timeoutMs: 99 });
  });
  await test('stops a running worker with the stable cancellation code', async () => {
    const root = fixture(true);
    const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]) });
    const controller = new AbortController();
    try {
      const pending = ocrPngDetailedPortable(png, 'de-DE', {
        runtimeRoot: root, platform: 'win32', arch: 'x64', spawn: hangingSpawn(),
        signal: controller.signal, terminationGraceMs: 100
      });
      controller.abort();
      await assert.rejects(pending, (error) => error instanceof PortableOcrError && error.code === 'OCR_CANCELLED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('honours a shorter caller timeout and terminates the worker', async () => {
    const root = fixture(true);
    const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]) });
    try {
      await assert.rejects(() => ocrPngDetailedPortable(png, 'de-DE', {
        runtimeRoot: root, platform: 'win32', arch: 'x64', spawn: hangingSpawn(),
        timeoutMs: 1, terminationGraceMs: 100
      }), (error) => error instanceof PortableOcrError && error.code === 'OCR_TIMEOUT');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  await test('uses only errors from the canonical OCR V1 vocabulary', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'data-secure',
      'server', 'portable-ocr.js'), 'utf8');
    const actual = [...source.matchAll(/new PortableOcrError\('([A-Z_]+)'\)/gu)].map((match) => match[1]);
    const allowed = new Set(['OCR_INPUT_INVALID', 'OCR_INPUT_LIMIT', 'OCR_MODEL_UNAVAILABLE',
      'OCR_MODEL_INTEGRITY_FAILED', 'OCR_BACKEND_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_RESOURCE_LIMIT',
      'OCR_OUTPUT_LIMIT', 'OCR_RESULT_INVALID', 'OCR_NETWORK_POLICY_FAILED', 'OCR_CANCELLED']);
    assert.ok(actual.length > 5);
    assert.ok(actual.every((code) => allowed.has(code)));
  });
  console.log(`Portable OCR adapter: ${passed} passed, 0 failed`);
})().catch(() => { process.exitCode = 1; });
