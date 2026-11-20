// Actual full build-script source; external child/network effects are replaced.
// The guard directory cases delegate to real owned filesystem fixtures and the
// real common directory-binding contract. No compiler/download/native app runs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

const require = createRequire(import.meta.url);
const { testAsync, done } = require('../helpers.js').createSuite('Native build ownership/source models');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nativeSource = fs.readFileSync(path.join(repository, 'scripts/build-native.mjs'), 'utf8');
const artifactSource = fs.readFileSync(path.join(repository, 'scripts/lib/native-artifact.mjs'), 'utf8');
const guardSource = fs.readFileSync(path.join(repository, 'scripts/build-ownership-guard.mjs'), 'utf8');
assert.equal(typeof vm.SourceTextModule, 'function', 'run with --experimental-vm-modules');
const owns = (object, key) => Object.hasOwn(object, key);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function actualModule(source, identifier, supplied) {
  const context = vm.createContext({ Buffer, console: { log() {} }, process: supplied.process });
  const cache = new Map();
  const synthetic = (name, exports) => {
    if (!cache.has(name)) cache.set(name, new vm.SyntheticModule(Object.keys(exports), function() {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: name }));
    return cache.get(name);
  };
  const textModule = (body, name) => new vm.SourceTextModule(body, {
    context, identifier: name, initializeImportMeta(meta) { meta.url = name; }
  });
  const artifact = textModule(artifactSource, new URL('./lib/native-artifact.mjs', identifier).href);
  const entry = textModule(source, identifier);
  let failed = false, error;
  try {
    await entry.link(async request => {
      if (request === './lib/native-artifact.mjs') {
        if (artifact.status === 'unlinked') await artifact.link(linkBuiltin);
        return artifact;
      }
      return linkBuiltin(request);
    });
    await entry.evaluate({ timeout: 2000 });
  } catch (caught) { failed = true; error = caught; }
  return { failed, error };

  function linkBuiltin(request) {
    const objects = {
      'node:fs': supplied.fs, 'node:path': supplied.path,
      'node:child_process': supplied.childProcess, 'node:crypto': crypto,
      'node:os': supplied.os, 'node:https': supplied.https
    };
    if (request === 'node:url') return synthetic(request, { fileURLToPath: supplied.fileURLToPath });
    if (request === '../plugins/data-secure/server/core/bound-file-io.js')
      return synthetic(request, { default: boundFileIo });
    assert.ok(owns(objects, request) && objects[request], 'undeclared import ' + request);
    return synthetic(request, { default: objects[request] });
  }
}

function windowsUrl(file) {
  return 'file:///' + file.replaceAll('\\', '/').split('/')
    .map((piece, index) => index === 0 ? piece : encodeURIComponent(piece)).join('/');
}
function peBytes() {
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80, 'ascii'); bytes.writeUInt16LE(0x8664, 0x84);
  return bytes;
}
async function nativeBuild(config = {}) {
  const win = path.win32;
  const root = config.root || 'C:\\isolated\\workspace with spaces';
  const temporaryParent = config.temporaryParent || 'C:\\isolated\\temporary with spaces';
  const temporary = win.join(temporaryParent, 'datasecure-native-Own123');
  const output = win.join(temporary, 'datasecure-sandbox.exe');
  const object = win.join(temporary, 'datasecure-sandbox.obj');
  const trackedDir = win.join(root, 'plugins/data-secure/server/native/windows-x64');
  const trackedOutput = win.join(trackedDir, 'datasecure-sandbox.exe');
  const trackedChecksum = win.join(trackedDir, 'datasecure-sandbox.sha256');
  const builtBytes = peBytes(), trackedBytes = Buffer.from(builtBytes);
  if (config.drift) trackedBytes[300] = 1;
  const files = new Map([[trackedOutput, trackedBytes], [trackedChecksum, Buffer.from(digest(trackedBytes) + '\n')]]);
  const discovery = [], commands = [], removed = [], copies = [], writes = [];
  let rootStats = 0, cleanupAttempts = 0, trackedMkdirs = 0;
  const stat = (directory, identity = 1) => ({
    dev: 1, ino: identity,
    isSymbolicLink: () => false, isDirectory: () => directory, isFile: () => !directory
  });
  const io = {
    existsSync(file) {
      if (file === output || file === object || file === trackedOutput || file === trackedChecksum) return files.has(file);
      if (file.endsWith('vswhere.exe')) return true;
      return !config.inputsMissing;
    },
    mkdtempSync(prefix) { assert.equal(prefix, win.join(temporaryParent, 'datasecure-native-')); return temporary; },
    lstatSync(file) {
      if (file === temporary) {
        rootStats++;
        if (rootStats > 1) {
          if (rootStats === 2) cleanupAttempts++;
          if (owns(config, 'cleanupValue')) throw config.cleanupValue;
          if (config.rootChanged) return stat(true, 2);
          if (config.linkedRoot) return { ...stat(true), isSymbolicLink: () => true };
        }
        return stat(true);
      }
      assert.ok(files.has(file), 'model lstat owns its file'); return stat(false, file === output ? 2 : 3);
    },
    readdirSync(file) { assert.equal(file, temporary); return [output, object].filter(name => files.has(name)).map(name => win.basename(name)); },
    rmdirSync(file) { assert.equal(file, temporary); removed.push(file); },
    unlinkSync(file) { assert.ok(file === output || file === object); assert.ok(files.has(file)); removed.push(file); files.delete(file); },
    mkdirSync(file, options) { assert.equal(file, trackedDir); assert.equal(options.recursive, true); trackedMkdirs++; },
    readFileSync(file, encoding) {
      if (file === output && owns(config, 'readValue')) throw config.readValue;
      assert.ok(files.has(file), 'model read owns its file');
      return encoding ? files.get(file).toString(encoding) : Buffer.from(files.get(file));
    },
    copyFileSync(from, to) {
      assert.equal(from, output); assert.equal(to, trackedOutput); copies.push([from, to]); files.set(to, Buffer.from(files.get(from)));
    },
    writeFileSync(file, bytes, encoding) {
      assert.equal(file, trackedChecksum); assert.equal(encoding, 'utf8'); writes.push(file); files.set(file, Buffer.from(bytes));
    }
  };
  const childProcess = { spawnSync(command, argv, options) {
    if (command.endsWith('vswhere.exe')) {
      discovery.push([command, Array.from(argv), options]);
      return { status: 0, stdout: (config.installation || 'C:\\Visual Studio\\Build Tools') + '\n' };
    }
    commands.push([command, Array.from(argv), options]);
    if (owns(config, 'bodyValue')) throw config.bodyValue;
    files.set(output, Buffer.from(builtBytes)); files.set(object, Buffer.from('own object'));
    return { status: 0, stdout: 'MODEL_COMPILE_COMPLETED', stderr: '' };
  } };
  const result = await actualModule(nativeSource, windowsUrl(win.join(root, 'scripts/build-native.mjs')), {
    fs: io, path: win, childProcess, os: { tmpdir: () => temporaryParent },
    fileURLToPath: url => fileURLToPath(url, { windows: true }),
    process: { argv: ['node', 'build-native.mjs', config.mode || '--analyze'], platform: 'win32', arch: 'x64', env: {} }
  });
  return { ...result, commands, discovery, removed, copies, writes, cleanupAttempts, trackedMkdirs,
    temporary, trackedOutput, trackedChecksum, files, builtBytes };
}

await testAsync('F1 actual launcher source keeps primary identity when cleanup also fails, including falsy throws', async () => {
  for (const primary of [new Error('MODEL_PRIMARY'), undefined, null, false, 0, '']) {
    const cleanup = new Error('MODEL_CLEANUP');
    const result = await nativeBuild({ bodyValue: primary, cleanupValue: cleanup });
    assert.equal(result.failed, true); assert.equal(result.error, primary);
    assert.equal(result.commands.length, 1); assert.equal(result.cleanupAttempts, 1);
    assert.deepEqual(result.removed, []); assert.deepEqual(result.copies, []);
    assert.deepEqual(result.writes, []);
  }
});
await testAsync('F1 actual read primary stays first and cleanup-only failure stays hard, including falsy throws', async () => {
  for (const cleanup of [new Error('MODEL_CLEANUP'), undefined, null, false, 0, '']) {
    const result = await nativeBuild({ cleanupValue: cleanup });
    assert.equal(result.failed, true); assert.equal(result.error, cleanup);
    assert.equal(result.cleanupAttempts, 1); assert.deepEqual(result.removed, []);
  }
  const primary = new Error('MODEL_READ_PRIMARY');
  const result = await nativeBuild({ readValue: primary, cleanupValue: new Error('MODEL_CLEANUP') });
  assert.equal(result.failed, true); assert.equal(result.error, primary); assert.equal(result.cleanupAttempts, 1);
  assert.deepEqual(result.copies, []); assert.deepEqual(result.writes, []);
});
await testAsync('F1 acquired root is cleaned once after setup refusal; changed or linked roots are not deleted', async () => {
  const missing = await nativeBuild({ inputsMissing: true });
  assert.equal(missing.failed, true); assert.match(String(missing.error), /inputs are incomplete/u);
  assert.equal(missing.cleanupAttempts, 1); assert.deepEqual(missing.removed, [missing.temporary]);
  assert.equal(missing.commands.length, 0);
  for (const config of [{ rootChanged: true }, { linkedRoot: true }]) {
    const result = await nativeBuild(config);
    assert.equal(result.failed, true); assert.match(String(result.error), /NATIVE_BUILD_CLEANUP_UNSAFE/u);
    assert.equal(result.cleanupAttempts, 1); assert.deepEqual(result.removed, []);
  }
});
await testAsync('F2 actual launcher refuses shell metacharacter metadata before command spawn', async () => {
  for (const token of ['%TEMP%', '!', '?', '&', '|', '<', '>', '^', '"', '\r', '\n']) {
    for (const config of [
      { installation: 'C:\\tool' + token + '\\VC' },
      { root: 'C:\\workspace' + token },
      { temporaryParent: 'C:\\temporary' + token }
    ]) {
      const result = await nativeBuild(config);
      assert.equal(result.failed, true, 'reject shell spelling ' + JSON.stringify(config));
      assert.match(String(result.error), /Unsafe build argument/u);
      assert.equal(result.commands.length, 0); assert.equal(result.cleanupAttempts, 1);
      assert.deepEqual(result.copies, []); assert.deepEqual(result.writes, []);
    }
  }
});
await testAsync('F1/F2 full source keeps three modes, whole-byte repro and existing hardening without implicit update', async () => {
  for (const mode of ['--analyze', '--verify-reproducible', '--update']) {
    const result = await nativeBuild({ mode });
    assert.equal(result.failed, false);
    assert.equal(result.discovery.length, 1); assert.equal(result.commands.length, 1);
    const [command, args, options] = result.commands[0], text = args[args.length - 1];
    assert.equal(command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(args.slice(0, -1), ['/d', '/v:off', '/c']);
    assert.equal(options.windowsHide, true); assert.equal(options.shell, false);
    assert.equal(options.windowsVerbatimArguments, true); assert.equal(options.maxBuffer, 4 * 1024 * 1024);
    for (const token of ['x64 10.0.26100.0', '/std:c++17', '/O2', '/MT', '/W4', '/WX', '/sdl', '/guard:cf',
      '/Brepro', '/CETCOMPAT', '/DYNAMICBASE', '/NXCOMPAT', '/HIGHENTROPYVA']) assert.ok(text.includes(token), token);
    assert.equal(text.includes('findstr'), mode !== '--analyze');
    assert.equal(result.cleanupAttempts, 1);
    assert.equal(result.removed[result.removed.length - 1], result.temporary);
    assert.equal(result.copies.length, mode === '--update' ? 1 : 0);
    assert.equal(result.writes.length, mode === '--update' ? 1 : 0);
    assert.ok(result.files.get(result.trackedOutput).equals(result.builtBytes));
  }
  const drift = await nativeBuild({ mode: '--verify-reproducible', drift: true });
  assert.equal(drift.failed, true); assert.match(String(drift.error), /source\/binary drift/u);
  assert.equal(drift.cleanupAttempts, 1); assert.deepEqual(drift.copies, []); assert.deepEqual(drift.writes, []);
});

const physicalTemporary = fs.realpathSync.native(os.tmpdir());
async function guardBoundary(config = {}) {
  const scope = fs.mkdtempSync(path.join(physicalTemporary, 'datasecure-guard-build-source-'));
  const identity = fs.lstatSync(scope, { bigint: true });
  const output = path.join(scope, 'dist', 'new-parent', 'guard');
  const sentinelName = 'ownership-guard.obj', sentinel = Buffer.from('OTHER_OWNER_GUARD_OBJECT');
  let competed = false, rebound = false, downloads = 0, commands = 0;
  const stop = new Error('MODEL_STOP_AT_FIRST_NETWORK_BOUNDARY');
  const mkdirs = [], affected = [];
  let before, result;
  const assertScope = () => {
    assert.equal(path.dirname(scope), physicalTemporary); assert.match(path.basename(scope), /^datasecure-guard-build-source-/u);
    const current = fs.lstatSync(scope, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
  };
  const io = { ...fs, mkdirSync(directory, options) {
    mkdirs.push({ directory, recursive: options?.recursive === true });
    if (path.resolve(directory) === output && config.compete && !competed) {
      competed = true; fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, sentinelName), sentinel, { flag: 'wx' });
      before = fs.lstatSync(output, { bigint: true });
    }
    const value = fs.mkdirSync(directory, options);
    if (path.resolve(directory) === output && config.rebindParent && !rebound) {
      rebound = true;
      const parent = path.dirname(output), retired = parent + '-retired';
      fs.renameSync(parent, retired); fs.mkdirSync(parent); fs.mkdirSync(output);
      fs.writeFileSync(path.join(output, sentinelName), sentinel, { flag: 'wx' });
      affected.push(retired);
    }
    return value;
  } };
  try {
    if (config.existing) {
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, sentinelName), sentinel, { flag: 'wx' });
      before = fs.lstatSync(output, { bigint: true });
    }
    if (config.parentFile) {
      fs.mkdirSync(path.join(scope, 'dist'));
      fs.writeFileSync(path.dirname(output), sentinel, { flag: 'wx' });
    }
    if (config.linkedParent) {
      const target = path.join(scope, 'own-link-target');
      fs.mkdirSync(target); fs.mkdirSync(path.join(scope, 'dist'));
      fs.writeFileSync(path.join(target, 'KEEP'), sentinel, { flag: 'wx' });
      fs.symlinkSync(target, path.dirname(output), process.platform === 'win32' ? 'junction' : 'dir');
      affected.push(path.dirname(output));
    }
    result = await actualModule(guardSource, pathToFileURL(path.join(scope, 'scripts/build-ownership-guard.mjs')).href, {
      fs: io, path, fileURLToPath, os,
      childProcess: { spawnSync() { commands++; throw new Error('UNEXPECTED_BUILD_COMMAND'); } },
      https: { get() { downloads++; throw stop; } },
      process: { argv: ['node', 'build-ownership-guard.mjs', '--output', output, '--fetch-official-inputs'],
        platform: process.platform === 'win32' ? 'win32' : 'darwin', arch: 'x64', env: {} }
    });
    const finalLeaf = fs.existsSync(output) ? fs.lstatSync(output, { bigint: true }) : null;
    const witness = fs.existsSync(path.join(output, sentinelName)) ? fs.readFileSync(path.join(output, sentinelName)) : null;
    if (config.linkedParent) assert.ok(fs.readFileSync(path.join(scope, 'own-link-target/KEEP')).equals(sentinel));
    if (config.parentFile) assert.ok(fs.readFileSync(path.dirname(output)).equals(sentinel));
    return { ...result, downloads, commands, stop, competed, rebound, mkdirs,
      output, before, finalLeaf, witness, sentinel };
  } finally {
    // Remove only this fresh physically bound fixture. Explicit synthetic links
    // are unlinked as links; never traverse their targets during cleanup.
    assertScope();
    for (const item of affected) {
      if (fs.existsSync(item) && fs.lstatSync(item).isSymbolicLink()) fs.unlinkSync(item);
    }
    const inspect = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name), current = fs.lstatSync(child);
        assert.ok(!current.isSymbolicLink() && (current.isDirectory() || current.isFile()));
        if (current.isDirectory()) inspect(child);
      }
    };
    inspect(scope); assertScope(); fs.rmSync(scope, { recursive: true, force: false });
  }
}
await testAsync('F3 actual leaf mkdir refuses a competing owner before any download or command', async () => {
  const result = await guardBoundary({ compete: true });
  assert.equal(result.competed, true); assert.equal(result.failed, true);
  assert.equal(result.error?.code, 'EEXIST'); assert.equal(result.downloads, 0); assert.equal(result.commands, 0);
  assert.ok(result.witness.equals(result.sentinel));
  assert.equal(result.before.dev, result.finalLeaf.dev); assert.equal(result.before.ino, result.finalLeaf.ino);
  assert.equal(result.mkdirs.filter(row => path.resolve(row.directory) === result.output).length, 1);
});
await testAsync('F3 actual source creates missing parents and one exclusive new leaf', async () => {
  const result = await guardBoundary();
  assert.equal(result.failed, true); assert.equal(result.error, result.stop);
  assert.equal(result.downloads, 1); assert.equal(result.commands, 0);
  const leaves = result.mkdirs.filter(row => path.resolve(row.directory) === result.output);
  assert.equal(leaves.length, 1); assert.equal(leaves[0].recursive, false);
  assert.ok(result.finalLeaf.isDirectory() && !result.finalLeaf.isSymbolicLink());
});
await testAsync('F3 existing output, linked parent and file parent remain refusals with original witnesses', async () => {
  for (const config of [{ existing: true }, { linkedParent: true }, { parentFile: true }]) {
    const result = await guardBoundary(config);
    assert.equal(result.failed, true); assert.notEqual(result.error, result.stop);
    assert.equal(result.downloads, 0); assert.equal(result.commands, 0);
    if (config.existing) {
      assert.ok(result.witness.equals(result.sentinel));
      assert.equal(result.before.dev, result.finalLeaf.dev); assert.equal(result.before.ino, result.finalLeaf.ino);
    }
  }
});
await testAsync('F3 captured parent replacement refuses before the first network boundary', async () => {
  const result = await guardBoundary({ rebindParent: true });
  assert.equal(result.rebound, true); assert.equal(result.failed, true);
  assert.match(result.error?.code || '', /^BOUND_FILE_(?:CHANGED|UNSAFE)$/u);
  assert.equal(result.downloads, 0); assert.equal(result.commands, 0);
  assert.ok(result.witness.equals(result.sentinel));
});
await done();
