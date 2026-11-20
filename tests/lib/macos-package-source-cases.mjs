// Actual builder/verifier source model. No codesign/Cargo/native app is executed.
// Only approved-Core acquisition, its native seal and Cargo metadata are supplied.
// Files, bound-directory checks, source markers, ZIP, inventories and Mach-O parsing are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fingerprint from '../../scripts/lib/standalone-build-fingerprint.mjs';
import { collectStandaloneRuntime } from '../../scripts/lib/standalone-runtime-projection.mjs';
import * as bundled from '../../scripts/lib/bundled-runtime.mjs';
import * as core from '../../scripts/lib/macos-core-artifact.mjs';
import * as zip from '../../scripts/lib/zip.mjs';
import { verifyStandaloneInventory } from '../../scripts/lib/standalone-package-integrity.mjs';
import layout from '../../plugins/data-secure/server/standalone/macos-bundle-layout.js';

const require = createRequire(import.meta.url);
const { createSuite } = require('../helpers.js');
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
const requested = process.argv.slice(2);
assert.ok(requested.length === 0 || requested.length === 2 && requested[0] === '--part' &&
  ['build', 'verify'].includes(requested[1]), 'MAC_PACKAGE_MODEL_PART_INVALID');
const part = requested[1] || 'all', expected = { all: 7, build: 5, verify: 2 };
const { testAsync, done, failure } = createSuite('Mac package95-97 actual-source model');
const declared = [], executed = [];
async function runCase(name, body) {
  assert.match(name, /^(95|96|97) /u);
  assert.ok(!declared.includes(name)); declared.push(name);
  if (part === 'all' || part === (name.startsWith('95 ') ? 'build' : 'verify')) {
    executed.push(name); await testAsync(name, body);
  }
}
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const physicalTemporary = fs.realpathSync.native(os.tmpdir());
const target = 'macos-arm64', appName = 'DataSecure Standalone.app';
const desktopRelative = appName + '/Contents/MacOS/datasecure-standalone';
const digest = bundled.sha256;
assert.equal(typeof vm.SourceTextModule, 'function', 'invoke this source model with --experimental-vm-modules');

function put(root, relative, bytes) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  return file;
}
function copy(root, relative) {
  const destination = path.join(root, relative);
  if (fs.existsSync(destination)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(repository, relative), destination, { recursive: true, errorOnExist: true, force: false });
}
function cleanup(fixture) {
  assert.equal(path.dirname(fixture.scope), physicalTemporary);
  assert.ok(path.basename(fixture.scope).startsWith('datasecure-mac-package95-'));
  fs.rmSync(fixture.scope, { recursive: true, force: true });
}
// Inert Mach-O header/commands for the real structural parser; no cryptographic
// seal, native execution, approved Core or real official Node origin is claimed.
function macho(label, fileType = 2) {
  const bytes = Buffer.alloc(2048);
  bytes.writeUInt32LE(0xfeedfacf, 0); bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(fileType, 12); bytes.writeUInt32LE(2, 16); bytes.writeUInt32LE(40, 20);
  bytes.writeUInt32LE(0x32, 32); bytes.writeUInt32LE(24, 36);
  bytes.writeUInt32LE(1, 40); bytes.writeUInt32LE(0x0d0500, 44);
  bytes.writeUInt32LE(0x1d, 56); bytes.writeUInt32LE(16, 60);
  bytes.writeUInt32LE(72, 64); bytes.writeUInt32LE(16, 68);
  bytes.write(label, 128);
  return bytes;
}
function fixture() {
  const scope = fs.mkdtempSync(path.join(physicalTemporary, 'datasecure-mac-package95-'));
  try {
    for (const relative of fingerprint.SOURCE_INPUT_FILES) copy(scope, relative);
    for (const relative of fingerprint.SOURCE_INPUT_TREES) copy(scope, relative);
    for (const file of collectStandaloneRuntime(path.join(repository, 'plugins/data-secure/server'), null)) {
      const relative = 'plugins/data-secure/server/' + file.relative, destination = path.join(scope, relative);
      if (fs.existsSync(destination)) assert.deepEqual(fs.readFileSync(destination), file.bytes);
      else put(scope, relative, file.bytes);
    }
    for (const relative of ['LICENSE', 'apps/datasecure-standalone/THIRD_PARTY_NOTICES.md',
      'plugins/data-secure/server/zip-reader.js']) copy(scope, relative);
    const contract = bundled.readContract(scope), runtimeTarget = contract.targets.find(row => row.id === target);
    const converter = macho('official-converter source-model fixture'), coreBytes = macho('custom-core source-model fixture');
    const sandbox = macho('sandbox source-model fixture'), canvas = macho('canvas source-model fixture', 6);
    const license = Buffer.from('synthetic Node license for source-model packaging only\n');
    const evidence = { schema: 'datasecure-bundled-runtime-target/v1', target,
      node_version: contract.node_version, archive: runtimeTarget.archive, archive_sha256: runtimeTarget.archive_sha256,
      bytes: converter.length, sha256: digest(converter), license_bytes: license.length, license_sha256: digest(license),
      runtime_probe: { version: contract.node_version, platform: runtimeTarget.os, arch: runtimeTarget.arch } };
    put(scope, 'dist/' + target + '/' + runtimeTarget.launcher, converter);
    put(scope, 'dist/' + target + '/LICENSE.node.txt', license);
    put(scope, 'dist/' + target + '/runtime-evidence.json', JSON.stringify(evidence));
    const identity = fingerprint.standaloneBuildFingerprint(scope);
    const provenanceBytes = Buffer.from('{"source_model_only":true}');
    const artifact = { schema: core.CORE_SCHEMA, target, node_version: contract.node_version,
      upstream: { archive: 'synthetic-core-source.tar.gz', sha256: 'a'.repeat(64) },
      static_binding: layout.STATIC_OWNERSHIP_BUILTIN,
      core: { bytes: coreBytes.length, sha256: digest(coreBytes) },
      build: { provenance_sha256: digest(provenanceBytes) },
      converter: { archive_sha256: runtimeTarget.archive_sha256, bytes: converter.length,
        sha256: digest(converter), license_sha256: digest(license) } };
    const build = { artifact, artifactSha256: digest(core.canonicalBytes(artifact)),
      bytes: coreBytes, licenseBytes: license, provenanceBytes };
    const marker = Buffer.from(fingerprint.SOURCE_MARKER_PREFIX + identity.fingerprint + fingerprint.SOURCE_MARKER_SUFFIX);
    const desktop = Buffer.concat([macho('desktop source-model fixture'), marker,
      Buffer.from(core.CORE_MARKER_PREFIX + artifact.core.sha256 + core.CORE_MARKER_SUFFIX),
      Buffer.from(core.PROVENANCE_MARKER_PREFIX + build.artifactSha256 + core.PROVENANCE_MARKER_SUFFIX)]);
    put(scope, appName + '/Contents/Info.plist', '<plist><dict/></plist>\n');
    put(scope, desktopRelative, desktop);
    put(scope, appName + '/Contents/MacOS/datasecure-core', coreBytes);
    for (const file of identity.files.filter(row => row.path.startsWith('plugins/data-secure/server/')))
      put(scope, appName + '/Contents/Resources/server/' + file.path.slice('plugins/data-secure/server/'.length),
        fs.readFileSync(path.join(scope, file.path)));
    const roles = layout.nativeRoles(target);
    put(scope, appName + '/Contents/' + roles.conversion_node.destination, converter);
    put(scope, appName + '/Contents/' + roles.sandbox.destination, sandbox);
    put(scope, appName + '/Contents/' + roles.canvas.destination, canvas);
    put(scope, appName + '/Contents/Resources/server/' + roles.sandbox.checksum, digest(sandbox) + '\n');
    const record = (name, bytes) => ({ path: name, bytes: bytes.length, sha256: digest(bytes),
      source_sha256: digest(bytes), executable: name === 'node' });
    const conversion = { schema: 'datasecure-conversion-runtime/1', target, native_layout: layout.LAYOUT,
      native_inventory_finalized: true, packages: [],
      files: [record(roles.conversion_node.inventory, converter), record(roles.canvas.inventory, canvas)] };
    const conversionRoot = appName + '/Contents/Resources/server/standalone/conversion-runtime/';
    put(scope, conversionRoot + 'RUNTIME.json', JSON.stringify(conversion));
    put(scope, conversionRoot + 'THIRD_PARTY_NOTICES.txt', 'Synthetic conversion fixture; no native execution.\n');
    put(scope, appName + '/Contents/Resources/RUNTIME-EVIDENCE.json', core.canonicalBytes(core.macRuntimeEvidence(build)));
    put(scope, appName + '/Contents/Resources/MACOS-CORE-ARTIFACT.json', core.canonicalBytes(artifact));
    const version = JSON.parse(fs.readFileSync(path.join(scope, 'package.json'))).version;
    const folderName = 'DataSecure-Standalone-' + version + '-' + target;
    return { scope, build, identity, folderName, packageFilename: folderName + '.zip',
      output: path.join(scope, 'dist', folderName + '.zip'), seams: { cores: 0, seals: 0, cargo: 0 } };
  } catch (error) { cleanup({ scope }); throw error; }
}
async function evaluateActual(relative, value, args, io = fs) {
  const context = vm.createContext({ Buffer, URL, TextDecoder, TextEncoder,
    process: { argv: [process.execPath, path.join(value.scope, relative), ...args],
      platform: process.platform, stdout: { write() {} } } });
  const cache = new Map();
  const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, item] of Object.entries(exports)) this.setExport(name, item);
  }, { context });
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = new vm.SourceTextModule(fs.readFileSync(path.join(repository, file), 'utf8'), {
      context, identifier: pathToFileURL(path.join(value.scope, file)).href,
      initializeImportMeta(meta) { meta.url = pathToFileURL(path.join(value.scope, file)).href; }
    });
    cache.set(file, module);
    await module.link(async specifier => {
      if (specifier === 'node:fs') return synthetic({ default: io });
      if (specifier.startsWith('node:')) return synthetic(await import(specifier));
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (next === 'scripts/lib/macos-core-artifact.mjs') return synthetic({ ...core,
        loadMacStaticCore(root, requested) {
          assert.equal(root, value.scope); assert.equal(requested, target); value.seams.cores++; return value.build;
        },
        verifyMacBundleSeal(app, loaded) {
          assert.equal(loaded, value.build); core.assertMacCoreBundle(app, loaded); value.seams.seals++;
        }
      });
      if (next === 'scripts/lib/cargo-license-inventory.mjs') return synthetic({
        loadCargoLicenseInventory(cargo, rustTarget) {
          assert.equal(cargo, path.join(value.scope, 'apps/datasecure-standalone/tauri-contract/Cargo.toml'));
          assert.equal(rustTarget, 'aarch64-apple-darwin'); value.seams.cargo++;
          return { schema: 'datasecure-rust-license-inventory/1',
            components: [{ name: 'synthetic-cargo-component', version: '1.0.0', license: 'MIT', source: 'NOASSERTION' }] };
        }
      });
      // Evaluate actual IO-owning helpers too, so a named FS fault/collision
      // reaches the real exclusive-write code rather than a copied algorithm.
      // Keep the actual strict font-notice validator in the same realm as the
      // verifier's JSON values. No assertion or native/Core seam is replaced.
      if (['scripts/lib/zip.mjs', 'scripts/lib/standalone-macos-package.mjs',
        'scripts/lib/standalone-font-license.mjs'].includes(next)) return load(next);
      return synthetic(await import(pathToFileURL(path.join(repository, next)).href));
    });
    return module;
  }
  const module = await load(relative);
  await module.evaluate({ timeout: 30000 });
}
const build = (value, extra = [], io = fs) => evaluateActual('scripts/build-standalone-macos-package.mjs',
  value, ['--target', target, '--app', appName, ...extra], io);
const verify = (value, archive) => evaluateActual('scripts/verify-standalone-macos-package.mjs',
  value, ['--target', target, '--archive', archive]);

await runCase('95 actual builder refuses existing ZIP or checksum and preserves the reserved old stage', async () => {
  for (const existing of ['zip', 'checksum', 'both']) {
    const value = fixture();
    try {
      const zipWitness = Buffer.from('SYNTHETIC-EXISTING-RELEASE95');
      const checksumWitness = Buffer.from('SYNTHETIC-EXISTING-CHECKSUM95');
      const stageWitness = put(value.scope, 'dist/standalone-macos-package-stage-' + target + '/KEEP95', 'OLD-STAGE95');
      if (existing !== 'checksum') fs.writeFileSync(value.output, zipWitness, { flag: 'wx' });
      if (existing !== 'zip') fs.writeFileSync(value.output + '.sha256', checksumWitness, { flag: 'wx' });
      let failure;
      try { await build(value); } catch (error) { failure = error; }
      if (existing !== 'checksum') assert.equal(fs.readFileSync(value.output).equals(zipWitness), true, 'old ZIP bytes must survive');
      if (existing !== 'zip') assert.equal(fs.readFileSync(value.output + '.sha256').equals(checksumWitness), true, 'old checksum bytes must survive');
      assert.equal(fs.readFileSync(stageWitness, 'utf8'), 'OLD-STAGE95');
      assert.equal(failure?.code, 'EEXIST', 'the old public CLI must refuse a preexisting output, not replace it');
    } finally { cleanup(value); }
  }
});
await runCase('95 fresh candidates preserve a preexisting stage and compare identical ZIP bytes at distinct destinations', async () => {
  const value = fixture();
  try {
    const oldStage = put(value.scope, 'dist/standalone-macos-package-stage-' + target + '/KEEP95', 'PREEXISTING-STAGE95');
    await build(value);
    assert.equal(fs.readFileSync(oldStage, 'utf8'), 'PREEXISTING-STAGE95', 'fresh stage must not reset an adopted name');
    const first = fs.readFileSync(value.output), firstChecksum = fs.readFileSync(value.output + '.sha256');
    await verify(value, value.output);
    await build(value, ['--engineering-directory', 'engineering-repro95']);
    const second = path.join(value.scope, 'dist/engineering-repro95', value.packageFilename);
    assert.equal(fs.readFileSync(value.output).equals(first), true, 'canonical artifact remains untouched');
    assert.equal(fs.readFileSync(value.output + '.sha256').equals(firstChecksum), true);
    assert.equal(fs.readFileSync(second).equals(first), true, 'destination name never enters the ZIP root/content');
    await verify(value, second);
    const names = [...readZip(first).keys()];
    assert.ok(names.every(name => name.startsWith(value.folderName + '/')));
    assert.ok(names.every(name => !name.includes('engineering-repro95')));
    assert.ok(value.seams.seals >= 4 && value.seams.cargo === 2 && value.seams.cores >= 4,
      'positive actual builder/verifier reached the explicitly modelled native/Core/Cargo seams');
    const witness = put(value.scope, 'dist/engineering-existing95/KEEP95', 'EXISTING-CANDIDATE95');
    await assert.rejects(build(value, ['--engineering-directory', 'engineering-existing95']), error => error.code === 'EEXIST');
    assert.equal(fs.readFileSync(witness, 'utf8'), 'EXISTING-CANDIDATE95');
  } finally { cleanup(value); }
});
await runCase('95 physical ancestor check refuses a linked dist before deleting an old stage witness', async () => {
  const value = fixture();
  try {
    const old = put(value.scope, 'dist/standalone-macos-package-stage-' + target + '/KEEP95', 'LINK-TARGET-STAGE95');
    const realDist = path.join(value.scope, 'real-dist95');
    fs.renameSync(path.join(value.scope, 'dist'), realDist);
    fs.symlinkSync(realDist, path.join(value.scope, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(build(value));
    assert.equal(fs.readFileSync(path.join(realDist, path.relative(path.join(value.scope, 'dist'), old)), 'utf8'),
      'LINK-TARGET-STAGE95', 'a lexical child spelling cannot authorize deletion through a linked ancestor');
    assert.equal(fs.existsSync(value.output), false);
  } finally { cleanup(value); }
});
await runCase('95 final ZIP and checksum opens are exclusive at the actual write boundary', async () => {
  for (const suffix of ['', '.sha256']) {
    const value = fixture();
    try {
      const destination = value.output + suffix, witness = Buffer.from('SYNTHETIC-LATE-OWNER95' + suffix);
      let injected = false;
      const io = { ...fs, writeFileSync(file, bytes, options) {
        if (path.resolve(String(file)) === destination && !injected) {
          injected = true; fs.writeFileSync(destination, witness, { flag: 'wx', mode: 0o600 });
        }
        return fs.writeFileSync(file, bytes, options);
      } };
      let failure;
      try { await build(value, [], io); } catch (error) { failure = error; }
      assert.equal(injected, true, 'the actual final writer must reach the declared collision seam');
      assert.equal(fs.readFileSync(destination).equals(witness), true, 'exclusive write preserves another owner at that name');
      assert.equal(failure?.code, 'EEXIST');
    } finally { cleanup(value); }
  }
});
await runCase('95 engineering CLI accepts a name only and rejects malformed or missing values', async () => {
  const value = fixture();
  try {
    for (const args of [['--engineering-directory', '../escape95'], ['--engineering-directory', 'engineering-a/child'],
      ['--engineering-directory', 'engineering-UPPER'], ['--engineering-directory'],
      ['--engineering-directory', 'engineering-a', '--engineering-directory', 'engineering-b']]) {
      await assert.rejects(build(value, args), /STANDALONE_MACOS_STAGE_UNSAFE/u);
      assert.equal(fs.existsSync(value.output), false);
    }
  } finally { cleanup(value); }
});

await runCase('96 actual archive verifier binds the manifest to archived Desktop source bytes despite repaired inventories', async () => {
  const value = fixture();
  try {
    await build(value); await verify(value, value.output); // Full positive control, all existing validators active.
    const bytes = fs.readFileSync(value.output), entries = readZip(bytes), modes = zip.readCentralModes(bytes);
    const prefix = value.folderName + '/';
    for (const [index, replacement] of [undefined, null, 'z'.repeat(64),
      (value.identity.fingerprint[0] === 'a' ? 'b' : 'a') + value.identity.fingerprint.slice(1)].entries()) {
      const relative = new Map([...entries].map(([name, bytes]) => {
        assert.ok(name.startsWith(prefix)); return [name.slice(prefix.length), Buffer.from(bytes)];
      }));
      const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json'));
      if (replacement === undefined) delete manifest.source_fingerprint;
      else manifest.source_fingerprint = replacement;
      relative.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
      // Fixture serialization only: keep every ordinary checksum valid so the
      // new source-binding rejection cannot be attributed to a stale inventory.
      relative.set('SHA256SUMS', Buffer.from([...relative].filter(([name]) => name !== 'SHA256SUMS')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, bytes]) => digest(bytes) + '  ' + name).join('\n') + '\n'));
      verifyStandaloneInventory(relative, manifest);
      core.verifyMacCorePackage(relative, value.build, appName);
      const tree = path.join(value.scope, 'case96-' + index);
      for (const [name, content] of relative) put(tree, prefix + name, content);
      const archive = path.join(tree, value.packageFilename);
      zip.writeZip(archive, zip.collectFiles(tree).map(file => {
        assert.ok(modes.has(file.archivePath)); return { ...file, mode: modes.get(file.archivePath) };
      }), { createOnly: true });
      fs.writeFileSync(archive + '.sha256', digest(fs.readFileSync(archive)) + '  ' + path.basename(archive) + '\n', { flag: 'wx' });
      await assert.rejects(verify(value, archive), /STANDALONE_DESKTOP_SOURCE_(?:MARKER_INVALID|MISMATCH)/u);
    }
  } finally { cleanup(value); }
});
await runCase('97 actual workflow ERE flags each forbidden component with an available real grep engine', async () => {
  const workflow = fs.readFileSync(path.join(repository, '.github/workflows/standalone-macos-sandbox.yml'), 'utf8');
  const line = workflow.split('\n').find(line => line.includes('if find "$bundle" -print | grep -E'));
  assert.ok(line);
  const pattern = /grep -E '([^']+)'/u.exec(line)?.[1];
  assert.ok(pattern);
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/grep.exe'), 'grep']
    : ['grep'];
  let executable;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-E', '^portable$'], { input: 'portable\n', encoding: 'utf8',
      windowsHide: true, shell: false, timeout: 5000 });
    if (probe.status === 0) { executable = candidate; break; }
  }
  assert.ok(executable, 'CAPACITY: real grep required for this portable ERE regression; not a native macOS claim');
  for (const [name, expected] of [
    ['/app/.claude-plugin/plugin.json', 0], ['/app/skills/local', 0], ['/app/Claude/local', 0],
    ['/app/Cowork/local', 0], ['/app/.mcp.json', 0], ['/app/.claude-pluginish/local', 1],
    ['/app/skills-extra/local', 1], ['/app/.mcp.json.bak', 1]
  ]) {
    const result = spawnSync(executable, ['-E', pattern], { input: name + '\n', encoding: 'utf8',
      windowsHide: true, shell: false, timeout: 5000 });
    assert.equal(result.status, expected, name + ': ' + String(result.error || result.stderr || ''));
  }
});
assert.equal(declared.length, 7, 'MAC_PACKAGE_MODEL_DECLARATIONS_CHANGED');
assert.equal(executed.length, expected[part], 'MAC_PACKAGE_MODEL_PART_INCOMPLETE');
await done();
if (!failure().failed) process.stdout.write('MAC_PACKAGE_SOURCE_RESULT ' + JSON.stringify({
  schema: 'datasecure-macos-package-source-model-part/1', part, declared: declared.length,
  executed: executed.length, cases: executed,
  helper_sha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  native_mac: 'NOT_RUN'
}) + '\n');
