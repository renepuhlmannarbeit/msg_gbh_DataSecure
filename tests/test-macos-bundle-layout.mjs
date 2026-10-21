// Host-independent source/layout proof, not a native macOS signing or M2 test.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import layout from '../plugins/data-secure/server/standalone/macos-bundle-layout.js';
import { relocateMacNative, planMacNativeRelocation, nativeRelocationArguments, finalizeMacNativeInventory } from '../scripts/lib/macos-bundle-native.mjs';
import { verifyMacNativeContract } from '../scripts/lib/macos-native-contract.mjs';
import { verifyConversionInventory } from '../scripts/lib/standalone-package-integrity.mjs';
import { collectStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import boundFileIo from '../plugins/data-secure/server/core/bound-file-io.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function write(file, bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
function macho(target, type = 2, { minimum = 0x0d0500, signed = true } = {}) {
  const header = Buffer.alloc(32), version = Buffer.alloc(24), signature = Buffer.alloc(16);
  header.writeUInt32LE(0xfeedfacf); header.writeUInt32LE(target === 'macos-arm64' ? 0x0100000c : 0x01000007, 4);
  header.writeUInt32LE(type, 12); header.writeUInt32LE(signed ? 2 : 1, 16); header.writeUInt32LE(signed ? 40 : 24, 20);
  version.writeUInt32LE(0x32); version.writeUInt32LE(24, 4); version.writeUInt32LE(1, 8); version.writeUInt32LE(minimum, 12);
  signature.writeUInt32LE(0x1d); signature.writeUInt32LE(16, 4); signature.writeUInt32LE(72, 8); signature.writeUInt32LE(16, 12);
  return signed ? Buffer.concat([header, version, signature, Buffer.alloc(16)]) : Buffer.concat([header, version]);
}
function fixture(target = 'macos-arm64') {
  const scope = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-macos-layout-'));
  const app = path.join(scope, 'DataSecure Standalone.app'), contents = path.join(app, 'Contents');
  const server = path.join(contents, 'Resources/server'), conversion = path.join(server, 'standalone/conversion-runtime');
  write(path.join(contents, 'Info.plist'), 'synthetic plist');
  write(path.join(contents, 'MacOS/datasecure-standalone'), macho(target));
  write(path.join(contents, 'MacOS/datasecure-core'), macho(target));
  const files = new Map();
  const add = (name, bytes) => { files.set(name, bytes); write(path.join(conversion, name), bytes); };
  const roles = layout.nativeRoles(target);
  add('node', macho(target)); add(roles.canvas.inventory, macho(target, 6));
  for (const name of ['LICENSE.node.txt', 'models/deu.traineddata', 'models/eng.traineddata',
    'node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.datasecure.mjs', 'node_modules/tesseract.js/src/index.js',
    'node_modules/@napi-rs/canvas/index.js', 'node_modules/mdast-util-from-markdown/index.js', 'node_modules/parse5/dist/index.js']) add(name, Buffer.from('synthetic data'));
  const packages = [{ name: 'mdast-util-from-markdown', version: '2.0.2', license: 'MIT' }, { name: 'parse5', version: '7.3.0', license: 'MIT' }];
  for (const item of packages) add(`node_modules/${item.name}/package.json`, Buffer.from(JSON.stringify(item)));
  const manifest = { schema: 'datasecure-conversion-runtime/1', target, node_file: 'node', packages,
    syntax_reader_contract: 'datasecure-markdown-syntax/1', pdf_text_paint_contract: 'datasecure-pdf-text-paint/1', files: [...files].map(([name, bytes]) =>
      ({ path: name, bytes: bytes.length, sha256: hash(bytes), executable: name === 'node' })) };
  const manifestFile = path.join(conversion, 'RUNTIME.json');
  write(manifestFile, JSON.stringify(manifest)); write(path.join(conversion, 'THIRD_PARTY_NOTICES.txt'), 'synthetic licenses');
  for (const record of Object.values(roles).filter(record => record.checksum)) {
    const bytes = macho(target, 2);
    write(path.join(server, record.source), bytes);
    write(path.join(server, record.checksum), `${hash(bytes)}\n`);
  }
  return { scope, app, contents, server, conversion, manifestFile, target, roles,
    manifest: () => JSON.parse(fs.readFileSync(manifestFile)), cleanup: () => removePackageSmokeScope(root, scope) };
}
function entries(value) {
  const result = new Map();
  const walk = (directory, prefix = '') => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${item.name}` : item.name, file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file, name); else result.set(name, fs.readFileSync(file));
    }
  };
  walk(value.app); return new Map([...result].map(([name, bytes]) => [`DataSecure Standalone.app/${name}`, bytes]));
}

// Actual private production function, evaluated as a host-independent source
// model with controlled syscall boundaries. NOT an APFS/O_RDWR diagnosis or a
// native relocation/signing proof; no test-only production export is added.
function replacementModel(value, role, { point = null, field = null, ioFailure = null, closeFailure = false } = {}) {
  const filename = value.manifestFile;
  const original = boundFileIo.readBoundFileRecord(filename, { maximum: 2 * 1024 * 1024, checkCtime: true });
  const replacement = Buffer.from('{"source_model_replacement":true}\n');
  const counts = { opens: 0, closes: 0, truncates: 0, writes: 0, syncs: 0 }, lines = [];
  const io = Object.create(fs); let namedCalls = 0;
  const changed = (stat, at) => {
    if (point !== at) return stat;
    const copy = Object.create(stat);
    if (field === 'type') Object.defineProperty(copy, 'isFile', { value: () => false });
    else if (field === 'oversize') Object.defineProperty(copy, 'size', { value: BigInt(2 * 1024 * 1024 + 1) });
    else Object.defineProperty(copy, field, { value: stat[field] + 1n });
    return copy;
  };
  io.openSync = (...args) => {
    counts.opens++; assert.equal(args[0], filename);
    assert.equal(args[1] & fs.constants.O_TRUNC, 0, 'opening must not truncate');
    if (ioFailure === 'open') throw false;
    return fs.openSync(...args);
  };
  io.lstatSync = (...args) => {
    assert.equal(args[0], filename); namedCalls++;
    if (ioFailure === 'named-postopen' && namedCalls === 2) throw false;
    return changed(fs.lstatSync(...args), namedCalls === 1 ? 'named-preopen' : 'named-postopen');
  };
  io.fstatSync = (...args) => {
    if (ioFailure === 'held-postopen') throw false;
    return changed(fs.fstatSync(...args), 'held-postopen');
  };
  io.ftruncateSync = (...args) => { counts.truncates++; return fs.ftruncateSync(...args); };
  io.writeFileSync = (...args) => { counts.writes++; return fs.writeFileSync(...args); };
  io.fsyncSync = (...args) => { counts.syncs++; return fs.fsyncSync(...args); };
  io.closeSync = fd => { counts.closes++; fs.closeSync(fd); if (closeFailure) throw false; };
  const source = fs.readFileSync(path.join(root, 'scripts/lib/macos-bundle-native.mjs'), 'utf8');
  const start = source.indexOf('const hash ='), end = source.indexOf('export function macNativeContext');
  assert.ok(start >= 0 && end > start);
  let threw = false, error;
  try {
    vm.runInNewContext(source.slice(start, end) + '\nreplaceChecked(filename, original.stat, replacement, role, parent);', {
      fs: io, path, crypto, Buffer, boundFileIo, filename, original, replacement, role,
      parent: boundFileIo.bindDirectory(path.dirname(filename)),
      console: { error(line) { lines.push(line); } }
    }, { timeout: 5000, filename: 'macos-manifest-replacement-source-model' });
  } catch (value) { threw = true; error = value; }
  const prefix = 'STANDALONE_MACOS_MANIFEST_REPLACE:';
  const diagnostics = lines.map(line => {
    assert.ok(typeof line === 'string' && line.startsWith(prefix));
    assert.equal(line.includes(filename), false); assert.equal(line.includes(value.scope), false);
    assert.equal(line.includes(original.bytes.toString('utf8')), false);
    const record = JSON.parse(line.slice(prefix.length));
    assert.deepEqual(Object.keys(record).sort(), ['close', 'comparisons', 'outcome', 'phase', 'role', 'schema']);
    assert.equal(record.schema, 'datasecure-macos-manifest-replacement-diagnostic/1');
    assert.ok(['relocation-manifest', 'finalization-manifest'].includes(record.role));
    assert.ok(['parent-before-open', 'named-preopen', 'open', 'held-postopen', 'named-postopen', 'comparison',
      'parent-before-truncate', 'truncate', 'write', 'sync', 'written', 'close', 'closed'].includes(record.phase));
    assert.ok(['not-opened', 'pending', 'closed', 'failed'].includes(record.close));
    assert.deepEqual(Object.keys(record.comparisons).sort(), ['heldPostOpen', 'namedPostOpen', 'namedPreOpen', 'originalReadStat']);
    for (const facts of Object.values(record.comparisons)) if (facts !== null) {
      assert.deepEqual(Object.keys(facts).sort(), ['birthtimeNs', 'ctimeNs', 'dev', 'ino', 'link_count_equal',
        'mtimeNs', 'object_equal', 'single_link', 'size', 'type', 'within_maximum']);
      assert.ok(Object.values(facts).every(flag => typeof flag === 'boolean'), 'no raw IDs/times/paths/content');
    }
    return record;
  });
  return { counts, diagnostics, threw, error, original: original.bytes, replacement };
}
for (const role of ['relocation-manifest', 'finalization-manifest']) {
  test(`SOURCE MODEL ${role}: closed pass diagnosis and one held-descriptor replacement`, () => {
    const value = fixture();
    try {
      const result = replacementModel(value, role);
      assert.equal(result.threw, false); assert.deepEqual(result.counts, { opens: 1, closes: 1, truncates: 1, writes: 1, syncs: 1 });
      assert.equal(result.diagnostics.length, 1); assert.equal(result.diagnostics[0].outcome, 'pass');
      assert.equal(result.diagnostics[0].phase, 'closed'); assert.equal(result.diagnostics[0].close, 'closed');
      assert.ok(Object.values(result.diagnostics[0].comparisons).every(facts => Object.values(facts).every(Boolean)));
      assert.deepEqual(fs.readFileSync(value.manifestFile), result.replacement);
    } finally { value.cleanup(); }
  });
  for (const point of ['named-preopen', 'held-postopen', 'named-postopen']) {
    const fields = point === 'named-preopen' ? ['ctimeNs'] : ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'birthtimeNs', 'nlink', 'type', 'oversize'];
    for (const field of fields) test(`SOURCE MODEL ${role}: ${point}/${field} refuses before truncate without adoption`, () => {
      const value = fixture();
      try {
        const result = replacementModel(value, role, { point, field });
        assert.equal(result.threw, true); assert.equal(result.error.message, 'STANDALONE_MACOS_NATIVE_LAYOUT_INVALID');
        assert.deepEqual(result.counts, { opens: 1, closes: 1, truncates: 0, writes: 0, syncs: 0 });
        assert.deepEqual(fs.readFileSync(value.manifestFile), result.original);
        assert.equal(result.diagnostics.length, 1); const diagnosis = result.diagnostics[0];
        assert.equal(diagnosis.outcome, 'fail'); assert.equal(diagnosis.phase, 'comparison');
        assert.equal(diagnosis.close, 'closed');
        const snapshot = diagnosis.comparisons[({ 'named-preopen': 'namedPreOpen', 'held-postopen': 'heldPostOpen', 'named-postopen': 'namedPostOpen' })[point]];
        assert.equal(snapshot[field === 'nlink' ? 'link_count_equal' : field === 'oversize' ? 'within_maximum' : field], false);
      } finally { value.cleanup(); }
    });
  }
  for (const ioFailure of ['open', 'held-postopen', 'named-postopen']) test(`SOURCE MODEL ${role}: falsy ${ioFailure} is retained and descriptor consumed once`, () => {
    const value = fixture();
    try {
      const result = replacementModel(value, role, { ioFailure });
      assert.equal(result.threw, true); assert.equal(result.error, false);
      assert.deepEqual(result.counts, { opens: 1, closes: ioFailure === 'open' ? 0 : 1, truncates: 0, writes: 0, syncs: 0 });
      assert.deepEqual(fs.readFileSync(value.manifestFile), result.original);
      assert.equal(result.diagnostics.length, 1); assert.equal(result.diagnostics[0].outcome, 'fail');
      assert.equal(result.diagnostics[0].phase, ioFailure);
    } finally { value.cleanup(); }
  });
  test(`SOURCE MODEL ${role}: falsy close failure cannot become a successful replacement`, () => {
    const value = fixture();
    try {
      const result = replacementModel(value, role, { closeFailure: true });
      assert.equal(result.threw, true); assert.equal(result.error, false);
      assert.deepEqual(result.counts, { opens: 1, closes: 1, truncates: 1, writes: 1, syncs: 1 });
      assert.deepEqual(fs.readFileSync(value.manifestFile), result.replacement, 'failure after writing is not a claim that nothing changed');
      assert.equal(result.diagnostics[0].outcome, 'fail'); assert.equal(result.diagnostics[0].phase, 'close');
      assert.equal(result.diagnostics[0].close, 'failed');
    } finally { value.cleanup(); }
  });
  test(`SOURCE MODEL ${role}: primary falsy failure and close failure both survive`, () => {
    const value = fixture();
    try {
      const result = replacementModel(value, role, { ioFailure: 'held-postopen', closeFailure: true });
      assert.equal(result.threw, true); assert.equal(result.error.name, 'AggregateError');
      assert.deepEqual(Array.from(result.error.errors), [false, false]);
      assert.deepEqual(result.counts, { opens: 1, closes: 1, truncates: 0, writes: 0, syncs: 0 });
      assert.deepEqual(fs.readFileSync(value.manifestFile), result.original);
      assert.equal(result.diagnostics[0].outcome, 'fail'); assert.equal(result.diagnostics[0].close, 'failed');
    } finally { value.cleanup(); }
  });
}
test('SOURCE MODEL replacement diagnostic role is closed, never a supplied path or label', () => {
  const value = fixture();
  try {
    const result = replacementModel(value, value.manifestFile);
    assert.equal(result.threw, true); assert.equal(result.error.message, 'STANDALONE_MACOS_NATIVE_LAYOUT_INVALID');
    assert.equal(result.counts.opens, 0); assert.equal(result.counts.closes, 0); assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(fs.readFileSync(value.manifestFile), result.original);
    const source = fs.readFileSync(path.join(root, 'scripts/lib/macos-bundle-native.mjs'), 'utf8');
    assert.match(source, /replaceChecked\(manifestFile, manifestRead\.stat,[^\n]+ 'relocation-manifest', manifestParent\)/u);
    assert.match(source, /replaceChecked\(manifestFile, manifestRead\.stat,[^\n]+ 'finalization-manifest', manifestParent\)/u);
  } finally { value.cleanup(); }
});
function resolver(value) {
  const source = path.join(root, 'plugins/data-secure/server/standalone/conversion-runtime-resolver.js');
  const loaded = new Module(source); loaded.filename = source;
  loaded.paths = Module._nodeModulePaths(path.dirname(source));
  loaded.require = name => name === './macos-bundle-layout'
    ? { ...layout, bundleContext: server => layout.bundleContext(server, 'darwin', value.target.slice(6)) }
    : name.startsWith('.') ? require(path.resolve(path.dirname(source), name)) : require(name);
  // Only platform facts and the synthetic package directory are injected. The
  // production resolver and real filesystem/hash checks run unchanged.
  const compiled = new Function('require', 'module', 'exports', '__dirname', 'process', fs.readFileSync(source, 'utf8'));
  compiled(loaded.require.bind(loaded), loaded, loaded.exports, path.join(value.server, 'standalone'),
    { platform: 'darwin', arch: value.target.slice(6) });
  return loaded.exports.resolveConversionRuntime;
}

function supervisor(value) {
  const source = path.join(root, 'plugins/data-secure/server/posix-supervisor.js');
  const loaded = { exports: {} };
  const load = name => name === './standalone/macos-bundle-layout' ? layout
    : name.startsWith('.') ? require(path.resolve(path.dirname(source), name)) : require(name);
  new Function('require', 'module', 'exports', '__dirname', 'process', fs.readFileSync(source, 'utf8'))(
    load, loaded, loaded.exports, value.server, { platform: 'darwin', arch: value.target.slice(6) });
  return loaded.exports;
}

// Fixture assembly only: this is deliberately NOT the production relocator or
// a native macOS proof. Runtime/hash gates below consume a modeled final app.
function modelLayoutFixture(value) {
  const plan = planMacNativeRelocation(value.app, value.target);
  for (const item of plan.prepared) {
    write(item.destination, item.sourceRead.bytes); fs.unlinkSync(item.source);
  }
  const manifest = value.manifest(); manifest.native_layout = layout.LAYOUT;
  fs.writeFileSync(value.manifestFile, JSON.stringify(manifest));
  return { roles: plan.prepared.map(item => item.role) };
}

test('fixed roles have no free paths; Windows/Linux do not opt into macOS layout', () => {
  for (const target of ['macos-x64', 'macos-arm64']) {
    const roles = layout.nativeRoles(target);
    assert.deepEqual(Object.keys(roles), ['conversion_node', 'sandbox', 'canvas']);
    assert.equal(Object.hasOwn(roles, 'ownership_guard'), false);
    for (const record of Object.values(roles)) {
      assert.ok(!record.destination.split('/').includes('..'));
      assert.ok(record.destination.startsWith('MacOS/') || record.destination.startsWith('Frameworks/'));
    }
  }
  assert.throws(() => layout.nativeRoles('macos-arm64/../../outside'));
  assert.equal(layout.LAYOUT, 'datasecure-macos-native-layout/2');
  assert.deepEqual(layout.STATIC_OWNERSHIP_BUILTIN, { name: 'datasecure_ownership_guard', abi: 1, napi: 8, node: '22.23.2' });
  // This source/layout fixture uses the current host filesystem namespace;
  // passing Darwin facts does not replace node:path's actual host semantics.
  const candidate = path.resolve(path.sep, 'an app.app/Contents/Resources/server');
  const context = layout.bundleContext(candidate, 'darwin', 'arm64');
  assert.equal(context.core, path.resolve(path.sep, 'an app.app/Contents/MacOS/datasecure-core'));
  assert.equal(context.ownershipBuiltin, layout.STATIC_OWNERSHIP_BUILTIN);
  assert.equal(layout.bundleContext(candidate, 'win32', 'x64'), null);
  assert.equal(layout.bundleContext(candidate, 'linux', 'x64'), null);
  assert.equal(layout.bundleContext('/development/server', 'darwin', 'arm64'), null);
});

test('synthetic final layouts for both architectures preserve three role bytes and bind final inventory (not native relocation)', () => {
  for (const target of ['macos-x64', 'macos-arm64']) {
    const value = fixture(target);
    try {
      const before = new Map(Object.entries(value.roles).map(([role, record]) =>
        [role, fs.readFileSync(path.join(value.server, record.source))]));
      assert.throws(resolver(value), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' }, 'packaged runtime cannot silently retain old layout');
      const plan = planMacNativeRelocation(value.app, target), args = nativeRelocationArguments(plan);
      assert.equal(args.length, 12);
      assert.deepEqual(args.filter((_, index) => index % 2 === 0), [
        '--app', '--target', '--app-id', '--expect-node', '--expect-sandbox', '--expect-canvas'
      ]);
      assert.equal(args.at(-1), `${before.get('canvas').length}:${hash(before.get('canvas'))}`);
      assert.deepEqual(modelLayoutFixture(value).roles, ['conversion_node', 'sandbox', 'canvas']);
      finalizeMacNativeInventory(value.app, target);
      for (const [role, record] of Object.entries(value.roles)) {
        assert.equal(fs.existsSync(path.join(value.server, record.source)), false);
        assert.deepEqual(fs.readFileSync(path.join(value.contents, record.destination)), before.get(role));
      }
      assert.equal(value.manifest().native_layout, layout.LAYOUT);
      assert.equal(value.manifest().native_inventory_finalized, true);
      const resolved = resolver(value)();
      assert.equal(resolved.node, path.join(value.contents, value.roles.conversion_node.destination));
      assert.equal(resolved.canvasNative, path.join(value.contents, value.roles.canvas.destination));
      assert.equal(resolved.root, value.conversion);
      const archive = entries(value), prefix = 'DataSecure Standalone.app/Contents/Resources/server/standalone/conversion-runtime/';
      verifyConversionInventory(archive, prefix, value.manifest());
      const native = verifyMacNativeContract(archive, { target, minimumVersion: '13.5', bundleRoot: 'DataSecure Standalone.app' });
      assert.equal(native.length, 5);
      assert.equal(native.some(file => /ownership-guard\.node$/u.test(file.path)), false);
      assert.throws(() => planMacNativeRelocation(value.app, target), /LAYOUT_INVALID/u);
      const finalized = fs.readFileSync(value.manifestFile);
      assert.throws(() => finalizeMacNativeInventory(value.app, target), /LAYOUT_INVALID/u);
      assert.deepEqual(fs.readFileSync(value.manifestFile), finalized, 'second finalization cannot rewrite a sealed inventory');
    } finally { value.cleanup(); }
  }
});

test('read-only relocation planning rejects existing targets, corrupt inventory and foreign architectures before any mutation', () => {
  for (const mutation of [
    value => write(path.join(value.contents, value.roles.canvas.destination), 'existing native target'),
    value => write(path.join(value.server, value.roles.conversion_node.source), 'changed native bytes'),
    value => write(path.join(value.server, value.roles.sandbox.source), macho('macos-x64'))
  ]) {
    const value = fixture();
    try {
      mutation(value);
      assert.throws(() => planMacNativeRelocation(value.app, value.target));
      for (const record of Object.values(value.roles)) assert.equal(fs.existsSync(path.join(value.server, record.source)), true);
    } finally { value.cleanup(); }
  }
});

test('static ownership is not a relocated role and planning cannot mutate the separate Core', () => {
  const value = fixture();
  try {
    const core = path.join(value.contents, 'MacOS/datasecure-core'), original = fs.readFileSync(core);
    const plan = planMacNativeRelocation(value.app, value.target);
    assert.deepEqual(plan.prepared.map(item => item.role), ['conversion_node', 'sandbox', 'canvas']);
    assert.equal(plan.prepared.some(item => item.source === core || item.destination === core), false);
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    assert.deepEqual(fs.readFileSync(core), original);
    for (const forbidden of ['Frameworks/datasecure-ownership-guard.node',
      'Resources/server/native/' + value.target + '/ownership-guard.node'])
      assert.equal(fs.existsSync(path.join(value.contents, forbidden)), false);
  } finally { value.cleanup(); }
});

test('production relocation has no JavaScript path-mutating fallback; the native source uses held-directory operations', () => {
  const value = fixture();
  try {
    if (process.platform !== 'darwin') assert.throws(() => relocateMacNative(value.app, value.target), /MACOS_RELOCATOR_NATIVE_HOST_REQUIRED/u);
    const source = fs.readFileSync(path.join(root, 'scripts/lib/macos-bundle-native.mjs'), 'utf8');
    assert.doesNotMatch(source, /fs\.(?:chmodSync|unlinkSync|renameSync|mkdirSync)\(/u);
    assert.doesNotMatch(source, /fs\.writeFileSync\(item\.destination/u);
    const native = fs.readFileSync(path.join(root, 'native/macos/relocate-bundle-native.c'), 'utf8');
    for (const required of ['openat(', 'O_EXCL', 'O_NOFOLLOW', 'fchmod(', 'unlinkat(', 'fstatat(', 'directories_unchanged()']) assert.ok(native.includes(required));
    assert.match(native, /#define ROLE_COUNT 3/u);
    assert.match(native, /struct role roles\[ROLE_COUNT\]/u);
    assert.match(native, /argc != 13/u);
    assert.match(native, /strcmp\(argv\[11\], "--expect-canvas"\)/u);
    assert.match(native, /parse_expected\(argv\[12\], &roles\[2\]\)/u);
    assert.match(native, /#define MAX_NATIVE_BYTES \(128ULL \* 1024ULL \* 1024ULL\)/u);
    assert.equal((native.match(/i < ROLE_COUNT/gu) || []).length, 5, 'initialization, validation, copy, deletion and cleanup cover all three roles');
    assert.doesNotMatch(native, /roles\[3\]|MAX_OWNERSHIP_GUARD_BYTES|--expect-ownership-guard/u);
    assert.doesNotMatch(native, /\b(?:chmod|unlink|rename|mkdir)\s*\(/u);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/standalone-macos-sandbox.yml'), 'utf8');
    assert.ok(workflow.includes('node tests/manual/standalone-macos-relocator-native.mjs'));
    const probe = fs.readFileSync(path.join(root, 'tests/manual/standalone-macos-relocator-native.mjs'), 'utf8');
    for (const regression of ['destination_parent', 'source_parent', 'canvas_destination_parent',
      'sandbox_source_parent', 'outsideSnapshot', "child.stdin.end('g')"])
      assert.ok(probe.includes(regression));
    const projected = collectStandaloneRuntime(path.join(root, 'plugins/data-secure/server'), null);
    assert.equal(projected.some(file => /datasecure-relocate-native|relocate-bundle-native\.c|macos-build-relocator/u.test(file.relative)), false);
  } finally { value.cleanup(); }
});

test('finalization cannot bless a modified native file by recomputing its checksum', () => {
  for (const role of ['conversion_node', 'sandbox', 'canvas']) {
    const value = fixture();
    try {
      modelLayoutFixture(value);
      const before = fs.readFileSync(value.manifestFile);
      const checksum = value.roles[role].checksum && fs.readFileSync(path.join(value.server, value.roles[role].checksum));
      fs.appendFileSync(path.join(value.contents, value.roles[role].destination), 'changed after relocation');
      assert.throws(() => finalizeMacNativeInventory(value.app, value.target), /LAYOUT_INVALID/u);
      assert.deepEqual(fs.readFileSync(value.manifestFile), before);
      if (checksum) assert.deepEqual(fs.readFileSync(path.join(value.server, value.roles[role].checksum)), checksum);
    } finally { value.cleanup(); }
  }
});

test('Core is mandatory only in MacOS as signed MH_EXECUTE; legacy ownership addons are forbidden', () => {
  const value = fixture();
  try {
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    const original = entries(value), core = 'DataSecure Standalone.app/Contents/MacOS/datasecure-core';
    const verify = archive => verifyMacNativeContract(archive, { target: value.target,
      minimumVersion: '13.5', bundleRoot: 'DataSecure Standalone.app' });
    const missing = new Map(original); missing.delete(core);
    assert.throws(() => verify(missing), /BUNDLE_CODE_MISSING/u);
    for (const suffix of ['Frameworks/datasecure-ownership-guard.node',
      'Resources/server/native/' + value.target + '/ownership-guard.node']) {
      const duplicate = new Map(original);
      duplicate.set('DataSecure Standalone.app/Contents/' + suffix, macho(value.target, 8));
      assert.throws(() => verify(duplicate), /BUNDLE_LOCATION_INVALID/u);
    }
    for (const [bytes, error] of [
      [macho(value.target, 6), /BUNDLE_LOCATION_INVALID/u], [macho(value.target, 8), /BUNDLE_LOCATION_INVALID/u],
      [macho(value.target, 2, { signed: false }), /SIGNATURE_MISSING/u],
      [macho(value.target, 2, { minimum: 0x0e0000 }), /MINIMUM_TOO_HIGH/u],
      [macho('macos-x64', 2), /ARCHITECTURE_MISMATCH/u]
    ]) {
      const changed = new Map(original); changed.set(core, bytes);
      assert.throws(() => verify(changed), error);
    }
    // This is Mach-O shape/layout evidence only. Core hash/approval, hardened
    // sealing and actual linked-binding execution remain separate native gates.
  } finally { value.cleanup(); }
});

test('legacy layout /1 cannot be reinterpreted or silently upgraded during runtime resolution', () => {
  const value = fixture();
  try {
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    const manifest = value.manifest(); manifest.native_layout = 'datasecure-macos-native-layout/1';
    fs.writeFileSync(value.manifestFile, JSON.stringify(manifest)); const before = entries(value);
    assert.throws(resolver(value), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
    assert.throws(() => planMacNativeRelocation(value.app, value.target));
    assert.throws(() => finalizeMacNativeInventory(value.app, value.target));
    assert.deepEqual(entries(value), before, 'legacy layout refusal cannot rewrite package bytes');
  } finally { value.cleanup(); }
});

test('mapped native files remain hash-checked; a missing canvas inventory cannot authorize loading it', () => {
  const value = fixture();
  try {
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    const resolve = resolver(value); resolve();
    const canvasFile = path.join(value.contents, value.roles.canvas.destination), canvas = fs.readFileSync(canvasFile);
    fs.appendFileSync(canvasFile, 'changed'); assert.throws(resolve, { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
    fs.writeFileSync(canvasFile, canvas); resolve();
    const manifest = value.manifest(); manifest.files = manifest.files.filter(entry => entry.path !== value.roles.canvas.inventory);
    fs.writeFileSync(value.manifestFile, JSON.stringify(manifest));
    assert.throws(resolve, { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
  } finally { value.cleanup(); }
});

test('the actual POSIX resolver probes the relocated sandbox against its resources checksum with no ambient environment', () => {
  const value = fixture();
  try {
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    const native = supervisor(value); let call;
    const result = native.verifyPosixSupervisor({ spawnSync(command, args, options) {
      call = { command, args, options }; return { status: 0, stdout: native.DARWIN_CONTRACT };
    } });
    assert.equal(result.available, true);
    assert.equal(call.command, path.join(value.contents, value.roles.sandbox.destination));
    assert.deepEqual(call.args, ['--sandbox-contract']); assert.deepEqual(call.options.env, {});
    assert.equal(call.options.shell, false);
    native.clearPosixSupervisorCache();
    fs.writeFileSync(path.join(value.server, value.roles.sandbox.checksum), `${'0'.repeat(64)}\n`);
    assert.equal(native.verifyPosixSupervisor({ spawnSync() { assert.fail('tampered checksum cannot launch'); } }).reason, 'integrity_failed');
  } finally { value.cleanup(); }
});

test('a manifest cannot redirect native roles using traversal or duplicate files in Resources', () => {
  const value = fixture();
  try {
    modelLayoutFixture(value); finalizeMacNativeInventory(value.app, value.target);
    const original = value.manifest(), changed = structuredClone(original);
    changed.files.find(entry => entry.path === 'node').path = '../../MacOS/other-node';
    fs.writeFileSync(value.manifestFile, JSON.stringify(changed));
    assert.throws(resolver(value), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
    fs.writeFileSync(value.manifestFile, JSON.stringify(original));
    const archive = entries(value), prefix = 'DataSecure Standalone.app/Contents/Resources/server/standalone/conversion-runtime/';
    archive.set(`${prefix}node`, macho(value.target));
    assert.throws(() => verifyConversionInventory(archive, prefix, original), /CONVERSION_NATIVE_DUPLICATE/u);
    assert.throws(() => verifyMacNativeContract(archive, { target: value.target, minimumVersion: '13.5', bundleRoot: 'DataSecure Standalone.app' }), /BUNDLE_LOCATION_INVALID/u);
  } finally { value.cleanup(); }
});

test('packaging pipeline moves before inner evidence and final seal; no deep signing or developer trust is claimed', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/standalone-macos-sandbox.yml'), 'utf8');
  const move = workflow.indexOf('node scripts/relocate-standalone-macos-native.mjs');
  const nativeBuild = workflow.indexOf('node scripts/build-standalone-macos-relocator.mjs');
  const nativeProbe = workflow.indexOf('node tests/manual/standalone-macos-relocator-native.mjs');
  const evidence = workflow.indexOf('node scripts/finalize-standalone-macos-runtime-evidence.mjs');
  const seal = workflow.indexOf('codesign --force --sign - --options runtime "$bundle"');
  assert.ok(move > 0 && evidence > move && seal > evidence);
  const approval = workflow.indexOf('Require the independently reviewed final ad-hoc sealed static Core before Prepare or Cargo');
  const prepare = workflow.indexOf('node scripts/prepare-standalone-runtime.mjs');
  assert.ok(approval > 0 && prepare > approval && move > prepare);
  assert.ok(workflow.includes('tauri build --bundles app --no-sign'));
  assert.doesNotMatch(workflow, /codesign --force --sign -[^\n]*"\$core"/u);
  assert.ok(workflow.includes('CUSTOM_CORE_PRE_CARGO_BYTES_PRESERVED=true'));
  assert.ok(nativeBuild > 0 && nativeProbe > nativeBuild && move > nativeProbe);
  assert.doesNotMatch(workflow, /codesign[^\n]*--(?:force[^\n]*)?deep[^\n]*--sign/u);
  assert.ok(workflow.includes('Pinned vendor converter entitlement inventory changed'));
  assert.ok(workflow.includes('NOT a Developer-ID/notarization release gate'));
});
