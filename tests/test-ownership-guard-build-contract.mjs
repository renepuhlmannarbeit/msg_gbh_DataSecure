// Explicit headless build-contract regression. No compiler, codesign, native
// artifact load, download or product packaging is performed by this test.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(root, 'scripts', 'build-ownership-guard.mjs');
const source = fs.readFileSync(helper, 'utf8');
const dist = path.join(root, 'dist');
let checks = 0;
function test(name, run) {
  try { run(); checks++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
function refused(argv, expected) {
  const result = cp.spawnSync(process.execPath, [helper, ...argv], {
    cwd: root, encoding: 'utf8', windowsHide: true, shell: false,
    timeout: 3_000, maxBuffer: 256 * 1024
  });
  assert.equal(result.error, undefined, 'CLI must exit, not hit its timeout');
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, expected);
  assert.equal(result.stdout, '');
}

test('CLI requires explicit inputs', () => {
  refused([], /Use --output <new-directory-under-dist> --fetch-official-inputs/u);
  refused(['--output', '', '--wrong-flag'], /Use --output/u);
});

if (['win32', 'darwin'].includes(process.platform) &&
    (process.arch === 'x64' || process.platform === 'darwin' && process.arch === 'arm64')) {
  test('empty, dist-root and outside outputs fail before any build/download', () => {
    for (const output of ['', dist, root, path.join(root, 'outside-guard-build')])
      refused(['--output', output, '--fetch-official-inputs'], /Unsafe build output/u);
  });
  // This sole fixture is fresh, empty and under ignored dist. Existing-output
  // refusal is immediately before mkdir/download, so CLI checks cannot build.
  const distStat = fs.lstatSync(dist);
  assert.ok(distStat.isDirectory() && !distStat.isSymbolicLink());
  const scope = fs.mkdtempSync(path.join(dist, 'ownership-guard-build-contract-'));
  const initial = fs.lstatSync(scope, { bigint: true });
  try {
    test('existing fresh directory is never reused', () => {
      refused(['--output', scope, '--fetch-official-inputs'], /Build output must not already exist/u);
      assert.deepEqual(fs.readdirSync(scope), []);
    });
    if (process.platform === 'win32') {
      test('Windows mixed-case dist terminates at existing-output gate', () => {
        const mixed = path.join(path.dirname(dist), 'DIST', path.basename(scope));
        assert.equal(path.relative(dist, mixed), path.basename(scope));
        assert.notEqual(path.dirname(mixed), dist);
        refused(['--output', mixed, '--fetch-official-inputs'], /Build output must not already exist/u);
        assert.deepEqual(fs.readdirSync(scope), []);
      });
      test('Windows mixed-case ancestor and drive also terminate', () => {
        const mixed = scope.replace(root, root.toUpperCase());
        assert.equal(path.relative(dist, mixed), path.basename(scope));
        refused(['--output', mixed, '--fetch-official-inputs'], /Build output must not already exist/u);
        assert.deepEqual(fs.readdirSync(scope), []);
      });
    }
  } finally {
    // No recursive deletion or traversal; refuse cleanup if identity changed.
    const current = fs.lstatSync(scope, { bigint: true });
    assert.equal(path.dirname(scope), dist);
    assert.match(path.basename(scope), /^ownership-guard-build-contract-/u);
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.deepEqual([current.dev, current.ino], [initial.dev, initial.ino]);
    assert.deepEqual(fs.readdirSync(scope), []);
    fs.rmdirSync(scope);
  }
}

// Execute only the actual platform/build/manifest source with an in-memory
// command/filesystem oracle. These are source-contract checks, NOT Mac runs.
const declaration = 'let compiler, dependencies;';
const buildStart = source.indexOf(declaration);
const macMarker = '\n} else {';
const macStart = source.indexOf(macMarker, buildStart);
const manifestStart = source.indexOf('\nconst manifest = {', macStart);
const macEnd = source.lastIndexOf('\n}', manifestStart);
assert.ok(buildStart > 0 && macStart > buildStart && macEnd > macStart && manifestStart > macEnd);
// Do not evaluate the unrelated Windows top-level await in a VM Script. Keep
// the actual Mac body and subsequent manifest publication byte-for-byte.
const buildSource = source.slice(buildStart, buildStart + declaration.length) +
  source.slice(macStart + macMarker.length, macEnd) + source.slice(manifestStart);
const artifact = '/isolated/build/ownership-guard.node';
const nativeSource = Buffer.from('independent source oracle');
const unsigned = Buffer.from('unsigned native artifact');
const signed = Buffer.from('signed native artifact');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function macContract(arch, { imports, failStage } = {}) {
  const events = [], files = new Map(), writes = new Map();
  const context = vm.createContext({
    process: { platform: 'darwin', arch }, path: path.posix,
    output: '/isolated/build', include: '/isolated/headers', artifact, source: '/isolated/guard.c',
    NODE: '22.23.2', HEADERS_SHA: 'headers-oracle', LIB_SHA: 'windows-library-oracle',
    console: { log() {} },
    hash(bytes) { events.push(['hash', bytes.toString()]); return sha(bytes); },
    fs: {
      readFileSync(file) {
        if (file === '/isolated/guard.c') return nativeSource;
        assert.equal(file, artifact); assert.ok(files.has(file)); return files.get(file);
      },
      writeFileSync(file, bytes, options) {
        assert.equal(options.flag, 'wx'); assert.ok(!writes.has(file));
        events.push(['write', file]); writes.set(file, bytes);
      }
    },
    run(command, argv) {
      const stage = command === '/usr/bin/clang' ? (argv[0] === '--version' ? 'version' : 'compile') :
        command === '/usr/bin/otool' ? 'imports' :
          command === '/usr/bin/codesign' ? (argv.includes('--verify') ? 'verify' : 'sign') : 'unknown';
      events.push([stage, command, Array.from(argv)]);
      assert.notEqual(stage, 'unknown', 'unexpected external command');
      if (stage === failStage) throw Error(`ORACLE_${stage}_FAILURE`);
      if (stage === 'compile') { files.set(artifact, unsigned); return ''; }
      if (stage === 'version') return 'independent clang version\n';
      if (stage === 'imports') return imports ?? `${artifact}:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1.0.0)\n`;
      if (stage === 'sign') { assert.equal(files.get(artifact), unsigned); files.set(artifact, signed); return ''; }
      assert.equal(files.get(artifact), signed, 'verification must inspect signed bytes'); return '';
    }
  });
  let error;
  try { vm.runInContext(buildSource, context, { timeout: 500 }); }
  catch (caught) { error = caught; }
  return { events, writes, error };
}

for (const [arch, clangArch] of [['arm64', 'arm64'], ['x64', 'x86_64']]) {
  test(`macOS ${arch} exact deployment/arch/sign/verify/final-hash contract`, () => {
    const result = macContract(arch);
    assert.equal(result.error, undefined);
    const compile = result.events.find(event => event[0] === 'compile')[2];
    assert.equal(compile.filter(arg => arg.startsWith('-mmacos')).length, 1);
    assert.ok(compile.includes('-mmacosx-version-min=13.5'));
    assert.equal(compile.filter(arg => arg === '-arch').length, 1);
    assert.equal(compile[compile.indexOf('-arch') + 1], clangArch);
    assert.ok(compile.includes('-DNAPI_VERSION=8'));
    assert.deepEqual(result.events.find(event => event[0] === 'imports').slice(1), ['/usr/bin/otool', ['-L', artifact]]);
    assert.deepEqual(result.events.find(event => event[0] === 'sign').slice(1),
      ['/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', artifact]]);
    assert.deepEqual(result.events.find(event => event[0] === 'verify').slice(1),
      ['/usr/bin/codesign', ['--verify', '--strict', artifact]]);
    const stages = result.events.map(event => event[0]);
    assert.ok(stages.indexOf('compile') < stages.indexOf('sign'));
    assert.ok(stages.indexOf('sign') < stages.indexOf('verify'));
    assert.ok(stages.indexOf('verify') < stages.indexOf('hash'));
    assert.deepEqual(result.events.filter(event => event[0] === 'hash').map(event => event[1]),
      [nativeSource.toString(), signed.toString()]);
    const manifest = JSON.parse(result.writes.get('/isolated/build/build-manifest.json'));
    assert.equal(manifest.verified_artifact.sha256, sha(signed));
    assert.notEqual(manifest.verified_artifact.sha256, sha(unsigned));
    assert.equal(manifest.verified_artifact.target, `macos-${arch}`);
    assert.equal(manifest.source_sha256, sha(nativeSource));
    assert.deepEqual(manifest.dependencies, ['/usr/lib/libSystem.B.dylib']);
  });
}
for (const failStage of ['compile', 'imports', 'sign', 'verify']) {
  test(`macOS ${failStage} failure publishes no digest/manifest`, () => {
    const result = macContract('arm64', { failStage });
    assert.match(result.error?.message || '', new RegExp(`ORACLE_${failStage}_FAILURE`, 'u'));
    assert.ok(!result.events.some(event => event[0] === 'hash'));
    assert.ok(!result.writes.has('/isolated/build/build-manifest.json'));
    if (failStage === 'sign') assert.ok(!result.events.some(event => event[0] === 'verify'));
  });
}
for (const [name, imports] of [
  ['empty', `${artifact}:\n`],
  ['foreign', `${artifact}:\n\t/usr/lib/libOther.dylib (compatibility version 1.0.0)\n`],
  ['additional', `${artifact}:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/usr/lib/libOther.dylib (compatibility version 1.0.0)\n`],
  ['duplicate', `${artifact}:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n`]
]) {
  test(`macOS ${name} dependency list fails closed`, () => {
    const result = macContract('arm64', { imports });
    assert.match(result.error?.message || '', /Unexpected native macOS dependency/u);
    assert.ok(!result.events.some(event => ['sign', 'verify', 'hash'].includes(event[0])));
    assert.ok(!result.writes.has('/isolated/build/build-manifest.json'));
  });
}
console.log(JSON.stringify({ schema: 'datasecure-ownership-guard-build-contract-test/1',
  node: process.version, platform: process.platform, checks, native_mac_build: false,
  compiler_started: false, network_requested: false }));
