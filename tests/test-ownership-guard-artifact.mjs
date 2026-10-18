// Structural parser/build-input tests only. Synthetic PE/Mach-O bytes are not
// executable addons or valid Mac signatures, and establish no package/OS gate.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  OWNERSHIP_MARKER_PREFIX, OWNERSHIP_MARKER_SUFFIX, ownershipGuardBuildLocation,
  loadOwnershipGuardBuild, assertOwnershipGuardMarker, verifyOwnershipGuardPackage
} from '../scripts/lib/ownership-guard-artifact.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(repository, 'scripts/lib/ownership-guard-artifact.mjs');
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const HEADERS = 'daaf13ec5d45a38bbcfcff06d0723f72a6813b89ab27bb5af2ac8e1f6259dde0';
const LIBRARY = 'ac15f1e9d7c8279353723a77f6319967f1a41c06026521094a8234c2e6fbe052';
const sourceBytes = Buffer.from('isolated native source fixture\n');
const helperBytes = Buffer.from('isolated build-helper fixture\n');
const marker = digest => Buffer.from(OWNERSHIP_MARKER_PREFIX + digest + OWNERSHIP_MARKER_SUFFIX);
const invalid = /STANDALONE_OWNERSHIP_GUARD_BUILD_INVALID/u;

function pe({ machine = 0x8664, dll = true, imports = ['KERNEL32.dll', 'ADVAPI32.dll'], delayed = ['node.exe'] } = {}) {
  const bytes = Buffer.alloc(0x2200), optional = 0x98;
  bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(0x80, 60); bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(machine, 0x84); bytes.writeUInt16LE(1, 0x86); bytes.writeUInt16LE(240, 0x94);
  bytes.writeUInt16LE(dll ? 0x2000 : 0, 0x96);
  bytes.writeUInt16LE(0x20b, optional); bytes.writeUInt32LE(0x200, optional + 60);
  bytes.writeUInt32LE(16, optional + 108);
  bytes.writeUInt32LE(0x2000, 0x190); bytes.writeUInt32LE(0x1000, 0x194);
  bytes.writeUInt32LE(0x2000, 0x198); bytes.writeUInt32LE(0x200, 0x19c);
  function table(index, names, descriptor, stride, strings) {
    if (!names.length) return;
    bytes.writeUInt32LE(descriptor + 0xe00, optional + 112 + index * 8);
    bytes.writeUInt32LE((names.length + 1) * stride, optional + 116 + index * 8);
    let offset = strings;
    for (const [i, name] of names.entries()) {
      if (stride === 32) bytes.writeUInt32LE(1, descriptor + i * stride);
      bytes.writeUInt32LE(offset + 0xe00, descriptor + i * stride + (stride === 32 ? 4 : 12));
      bytes.write(name + '\0', offset, 'ascii'); offset += name.length + 1;
    }
  }
  table(1, imports, 0x200, 20, 0x400); table(13, delayed, 0x800, 32, 0xc00);
  return bytes;
}
function macho(target, { minimum = 0x0d0500, signed = true, type = 8,
  libraries = ['/usr/lib/libSystem.B.dylib'], rpaths = [] } = {}) {
  const version = Buffer.alloc(24); version.writeUInt32LE(0x32); version.writeUInt32LE(24, 4);
  version.writeUInt32LE(1, 8); version.writeUInt32LE(minimum, 12);
  const stringCommand = (command, text, base) => {
    const result = Buffer.alloc(Math.ceil((base + Buffer.byteLength(text) + 1) / 8) * 8);
    result.writeUInt32LE(command); result.writeUInt32LE(result.length, 4); result.writeUInt32LE(base, 8);
    result.write(text, base); return result;
  };
  const commands = [version, ...libraries.map(text => stringCommand(0xc, text, 24)),
    ...rpaths.map(text => stringCommand(0x8000001c, text, 12))];
  if (signed) {
    const signature = Buffer.alloc(16); signature.writeUInt32LE(0x1d); signature.writeUInt32LE(16, 4);
    signature.writeUInt32LE(32 + commands.reduce((sum, command) => sum + command.length, 16), 8);
    signature.writeUInt32LE(16, 12); commands.push(signature);
  }
  const header = Buffer.alloc(32); header.writeUInt32LE(0xfeedfacf);
  header.writeUInt32LE(target === 'macos-arm64' ? 0x0100000c : 0x01000007, 4);
  header.writeUInt32LE(type, 12); header.writeUInt32LE(commands.length, 16);
  header.writeUInt32LE(commands.reduce((sum, command) => sum + command.length, 0), 20);
  return Buffer.concat([header, ...commands, ...(signed ? [Buffer.alloc(16)] : [])]);
}

// All writable paths are tracked under one fresh real temporary directory.
// Cleanup enumerates the exact inventory, validates identities and never follows
// links or uses recursive deletion. Unexpected files/identity changes abort it.
function fixture() {
  const scope = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-ownership-artifact-'));
  const records = new Map([[scope, fs.lstatSync(scope, { bigint: true })]]);
  function target(relative) {
    assert.ok(typeof relative === 'string' && relative && !path.isAbsolute(relative));
    assert.ok(relative.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes('\\')));
    const file = path.join(scope, ...relative.split('/'));
    const within = path.relative(scope, file);
    assert.ok(within && within !== '..' && !within.startsWith('..' + path.sep) && !path.isAbsolute(within));
    return file;
  }
  function same(file) {
    const expected = records.get(file), current = fs.lstatSync(file, { bigint: true });
    assert.ok(expected && !current.isSymbolicLink());
    assert.deepEqual([current.dev, current.ino], [expected.dev, expected.ino]);
    assert.equal(current.isDirectory(), expected.isDirectory());
    assert.ok(current.isDirectory() || current.isFile()); return current;
  }
  function write(relative, bytes) {
    const file = target(relative), segments = relative.split('/').slice(0, -1);
    let parent = scope; same(scope);
    for (const segment of segments) {
      const next = path.join(parent, segment); same(parent);
      if (!records.has(next)) { assert.equal(fs.existsSync(next), false); fs.mkdirSync(next, { mode: 0o700 }); records.set(next, fs.lstatSync(next, { bigint: true })); }
      assert.ok(same(next).isDirectory()); parent = next;
    }
    if (records.has(file)) { assert.ok(same(file).isFile()); assert.equal(same(file).nlink, 1n); }
    else assert.equal(fs.existsSync(file), false);
    fs.writeFileSync(file, bytes, { flag: records.has(file) ? 'w' : 'wx', mode: 0o600 });
    if (!records.has(file)) records.set(file, fs.lstatSync(file, { bigint: true }));
    same(file); return file;
  }
  function prepare(targetName = 'windows-x64', bytes = pe(), relative = 'dist/inputs') {
    const artifactPath = write(relative + '/ownership-guard.node', bytes);
    const manifest = {
      schema: 'datasecure-native-ownership-guard-build/1', node_headers_version: '22.23.2',
      headers_sha256: HEADERS, node_lib_sha256: LIBRARY, source_sha256: hash(sourceBytes),
      compiler: 'synthetic parser fixture; not compiled', dependencies: [],
      verified_artifact: { schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8,
        target: targetName, path: artifactPath, sha256: hash(bytes) }
    };
    const relativeManifest = relative + '/build-manifest.json';
    const manifestFile = write(relativeManifest, JSON.stringify(manifest));
    return { manifest, manifestFile, bytes, options: { manifest: manifestFile },
      save() { write(relativeManifest, JSON.stringify(manifest)); } };
  }
  function cleanup() {
    assert.equal(path.dirname(scope), temporaryRoot);
    assert.match(path.basename(scope), /^datasecure-ownership-artifact-/u);
    const found = new Set();
    function inspect(file) {
      assert.ok(found.size < 64); const stat = same(file); found.add(file);
      if (stat.isDirectory()) for (const name of fs.readdirSync(file)) inspect(path.join(file, name));
    }
    inspect(scope); assert.equal(found.size, records.size);
    for (const file of [...found].sort((a, b) => b.length - a.length)) {
      const stat = same(file);
      if (stat.isDirectory()) { assert.deepEqual(fs.readdirSync(file), []); fs.rmdirSync(file); }
      else { assert.equal(stat.nlink, 1n); fs.unlinkSync(file); }
    }
  }
  try {
    write('native/ownership-guard/ownership-guard.c', sourceBytes);
    write('scripts/build-ownership-guard.mjs', helperBytes);
  } catch (error) { cleanup(); throw error; }
  return { scope, write, prepare, cleanup };
}
function scoped(callback) { const f = fixture(); try { return callback(f); } finally { f.cleanup(); } }

test('marker accepts matching repeats and rejects absent/truncated/conflicting/malformed pins', () => {
  const pin = 'a'.repeat(64), good = marker(pin);
  assert.doesNotThrow(() => assertOwnershipGuardMarker(Buffer.concat([Buffer.from('prefix'), good, good]), pin));
  for (const binary of [Buffer.alloc(0), good.subarray(0, good.length - 1), marker('b'.repeat(64)),
    Buffer.concat([good, marker('b'.repeat(64))]), Buffer.from(OWNERSHIP_MARKER_PREFIX), 'not a Buffer'])
    assert.throws(() => assertOwnershipGuardMarker(binary, pin), invalid);
  for (const bad of [undefined, '', 'A'.repeat(64), pin + '\n', 'a'.repeat(63)])
    assert.throws(() => assertOwnershipGuardMarker(good, bad), invalid);
});

test('deterministic build location binds both source and helper with independent length framing', () => scoped(f => {
  const expected = hash(Buffer.concat([Buffer.from(`${sourceBytes.length}:`), sourceBytes,
    Buffer.from(`${helperBytes.length}:`), helperBytes]));
  const first = ownershipGuardBuildLocation(f.scope, 'windows-x64');
  assert.equal(first.output, path.join(f.scope, 'dist/native-ownership-guard', `windows-x64-${expected}`));
  assert.equal(first.manifest, path.join(first.output, 'build-manifest.json'));
  f.write('scripts/build-ownership-guard.mjs', Buffer.from('changed helper'));
  assert.notEqual(ownershipGuardBuildLocation(f.scope, 'windows-x64').manifest, first.manifest);
  f.write('scripts/build-ownership-guard.mjs', helperBytes);
  f.write('native/ownership-guard/ownership-guard.c', Buffer.from('changed source'));
  assert.notEqual(ownershipGuardBuildLocation(f.scope, 'windows-x64').manifest, first.manifest);
  assert.throws(() => ownershipGuardBuildLocation(f.scope, 'linux-x64'), invalid);
}));

test('synthetic PE build input validates bytes, pin, source and frozen returned descriptors', () => scoped(f => {
  const input = f.prepare(), build = loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options);
  assert.deepEqual(build.bytes, input.bytes); assert.equal(build.artifact.sha256, hash(input.bytes));
  assert.equal(build.manifestFile, input.manifestFile);
  assert.ok(Object.isFrozen(build) && Object.isFrozen(build.artifact));
  for (const target of ['linux-x64', 'macos-arm64', 'macos-x64'])
    assert.throws(() => loadOwnershipGuardBuild(f.scope, target, input.options), invalid);
}));

test('manifest contracts reject schema/input/source/ABI/NAPI/target/hash drift', () => scoped(f => {
  const changes = [
    m => { m.schema = 'other'; }, m => { m.node_headers_version = '22.0.0'; },
    m => { m.headers_sha256 = '0'.repeat(64); }, m => { m.source_sha256 = '0'.repeat(64); },
    m => { m.node_lib_sha256 = '0'.repeat(64); }, m => { m.verified_artifact.schema = 'other'; },
    m => { m.verified_artifact.abi = 2; }, m => { m.verified_artifact.napi = 9; },
    m => { m.verified_artifact.target = 'macos-arm64'; }, m => { m.verified_artifact.sha256 = 'g'.repeat(64); },
    m => { m.verified_artifact.sha256 = '0'.repeat(64); }
  ];
  for (const change of changes) {
    const input = f.prepare(); change(input.manifest); input.save();
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options), invalid);
  }
}));

test('manifest and artifact paths cannot escape dist, use relative paths or change the native leaf', () => scoped(f => {
  const input = f.prepare();
  for (const supplied of ['relative.json', f.scope, path.join(f.scope, 'dist'),
    path.join(f.scope, 'outside/build-manifest.json'), path.join(f.scope, 'dist-neighbor/build-manifest.json')])
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', { manifest: supplied }), invalid);
  for (const supplied of ['relative.node', path.join(f.scope, 'ownership-guard.node'),
    path.join(f.scope, 'dist-neighbor/ownership-guard.node'), path.join(f.scope, 'dist/inputs/other.node'),
    path.dirname(input.manifestFile) + path.sep + '..' + path.sep + 'inputs' + path.sep + 'ownership-guard.node']) {
    input.manifest.verified_artifact.path = supplied; input.save();
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options), invalid);
  }
}));

test('missing/malformed/oversized manifest, source drift and invalid artifact size cannot authorize a build', () => scoped(f => {
  assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', { manifest: path.join(f.scope, 'dist/missing.json') }));
  const input = f.prepare();
  for (const payload of ['{', 'null', '{}', ' '.repeat(16385)]) {
    f.write('dist/inputs/build-manifest.json', payload);
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options));
  }
  input.save(); f.write('native/ownership-guard/ownership-guard.c', 'changed');
  assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options), invalid);
  f.write('native/ownership-guard/ownership-guard.c', sourceBytes);
  for (const bytes of [Buffer.alloc(63), Buffer.alloc(4 * 1024 * 1024 + 1)]) {
    f.write('dist/inputs/ownership-guard.node', bytes);
    input.manifest.verified_artifact.sha256 = hash(bytes); input.save();
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options));
  }
}));

test('PE parser rejects wrong CPU/non-DLL/foreign imports and missing or extra delay hosts', () => scoped(f => {
  for (const options of [{ machine: 0xaa64 }, { dll: false }, { imports: ['USER32.dll'] },
    { delayed: [] }, { delayed: ['node.exe', 'SHELL32.dll'] }, { imports: ['node.exe'] },
    { delayed: ['other.exe'] }]) {
    const input = f.prepare('windows-x64', pe(options));
    assert.throws(() => loadOwnershipGuardBuild(f.scope, 'windows-x64', input.options),
      /(?:STANDALONE_OWNERSHIP_GUARD_BUILD_INVALID|WINDOWS_NATIVE_)/u);
  }
}));

for (const target of ['macos-arm64', 'macos-x64']) {
  test(`${target} structural model requires correct bundle CPU, advertised minimum and native closure`, () => scoped(f => {
    const positive = f.prepare(target, macho(target));
    assert.equal(loadOwnershipGuardBuild(f.scope, target, positive.options).artifact.target, target);
    for (const options of [{ type: 2 }, { signed: false }, { minimum: 0x0d0600 },
      { libraries: [] }, { libraries: ['/usr/lib/libOther.dylib'] },
      { libraries: ['/usr/lib/libSystem.B.dylib', '/usr/lib/libSystem.B.dylib'] }, { rpaths: ['/usr/lib'] }]) {
      const input = f.prepare(target, macho(target, options));
      assert.throws(() => loadOwnershipGuardBuild(f.scope, target, input.options), invalid);
    }
    const opposite = target === 'macos-arm64' ? 'macos-x64' : 'macos-arm64';
    const wrong = f.prepare(target, macho(opposite));
    assert.throws(() => loadOwnershipGuardBuild(f.scope, target, wrong.options), invalid);
  }));
}

test('default content-addressed manifest and explicit build environment select the same checked input', () => scoped(f => {
  const location = ownershipGuardBuildLocation(f.scope, 'windows-x64');
  const relative = path.relative(f.scope, location.output).split(path.sep).join('/');
  const input = f.prepare('windows-x64', pe(), relative);
  const previous = process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST;
  try {
    delete process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST;
    assert.equal(loadOwnershipGuardBuild(f.scope, 'windows-x64').manifestFile, input.manifestFile);
    process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST = input.manifestFile;
    assert.equal(loadOwnershipGuardBuild(f.scope, 'windows-x64').artifact.sha256, hash(input.bytes));
  } finally {
    if (previous === undefined) delete process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST;
    else process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST = previous;
  }
}));

test('Cargo CLI emits the parser-verified pin and watches, without compiling or loading native code', () => scoped(f => {
  const input = f.prepare();
  const child = spawnSync(process.execPath, [helper, '--cargo', f.scope, 'x86_64-pc-windows-msvc'], {
    cwd: repository, encoding: 'utf8', windowsHide: true, shell: false, timeout: 3_000,
    maxBuffer: 256 * 1024, env: { ...process.env, DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST: input.manifestFile }
  });
  assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/u);
  assert.deepEqual(lines, [
    'cargo:rerun-if-env-changed=DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST',
    `cargo:rerun-if-changed=${input.manifestFile}`, `cargo:rerun-if-changed=${input.manifest.verified_artifact.path}`,
    `cargo:rustc-env=DATASECURE_OWNERSHIP_GUARD_SHA256=${hash(input.bytes)}`
  ]);
  const bad = spawnSync(process.execPath, [helper, '--cargo', f.scope, 'unsupported-target'], {
    cwd: repository, encoding: 'utf8', windowsHide: true, shell: false, timeout: 3_000,
    maxBuffer: 256 * 1024, env: { ...process.env, DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST: input.manifestFile }
  });
  assert.equal(bad.error, undefined); assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
  assert.match(bad.stderr, invalid);
  const linux = spawnSync(process.execPath, [helper, '--cargo', f.scope, 'x86_64-unknown-linux-gnu'], {
    cwd: repository, encoding: 'utf8', windowsHide: true, shell: false, timeout: 3_000,
    maxBuffer: 256 * 1024, env: { ...process.env, DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST: input.manifestFile }
  });
  assert.equal(linux.error, undefined); assert.equal(linux.status, 0, linux.stderr);
  assert.equal(linux.stdout, 'cargo:rustc-env=DATASECURE_OWNERSHIP_GUARD_SHA256=not_applicable\n');
}));

test('inventory DTO model binds marker and exact checksum to the fixed native role', () => {
  assert.throws(() => verifyOwnershipGuardPackage(new Map(), 'linux-x64'), invalid);
  assert.throws(() => verifyOwnershipGuardPackage({}, 'windows-x64'), invalid);
  for (const [target, bundle] of [['windows-x64', null], ['macos-arm64', 'Fixture.app']]) {
    const bytes = target === 'windows-x64' ? pe() : macho(target), pin = hash(bytes);
    const native = bundle ? `${bundle}/Contents/Frameworks/datasecure-ownership-guard.node` : `server/native/${target}/ownership-guard.node`;
    const checksum = bundle ? `${bundle}/Contents/Resources/server/native/${target}/ownership-guard.sha256` : `server/native/${target}/ownership-guard.sha256`;
    const desktop = bundle ? `${bundle}/Contents/MacOS/datasecure-standalone` : 'DataSecure Standalone.exe';
    const entries = new Map([[native, bytes], [checksum, Buffer.from(pin + '\n')], [desktop, marker(pin)]]);
    assert.deepEqual(verifyOwnershipGuardPackage(entries, target, bundle), { path: native, sha256: pin });
    for (const key of [native, checksum, desktop]) {
      const missing = new Map(entries); missing.delete(key);
      assert.throws(() => verifyOwnershipGuardPackage(missing, target, bundle), invalid);
    }
    const wrong = new Map(entries); wrong.set(checksum, Buffer.from(pin));
    assert.throws(() => verifyOwnershipGuardPackage(wrong, target, bundle), invalid);
    wrong.set(checksum, Buffer.from('0'.repeat(64) + '\n'));
    assert.throws(() => verifyOwnershipGuardPackage(wrong, target, bundle), invalid);
    if (bundle) {
      const duplicate = new Map(entries); duplicate.set(`${bundle}/Contents/Resources/server/native/${target}/ownership-guard.node`, bytes);
      assert.throws(() => verifyOwnershipGuardPackage(duplicate, target, bundle), invalid);
    }
  }
});
