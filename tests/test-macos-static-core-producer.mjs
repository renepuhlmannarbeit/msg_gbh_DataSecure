// Source/IO/EventEmitter models only: no compiler, signing, artifact approval or native Mac proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as url from 'node:url';
import * as timers from 'node:timers';
import * as contract from '../scripts/macos-static-core/build-contract.mjs';
import * as final from '../scripts/macos-static-core/final-core-contract.mjs';
import { readMacCoreBuildProcessLifecycle } from '../scripts/lib/macos-core-process-lifecycle.mjs';
import { main, assertProducerRepository, capturePythonIdentity, revalidatePythonIdentity } from '../scripts/macos-static-core/build-driver.mjs';
import * as realHelper from '../scripts/macos-static-core/producer-io-lifecycle.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const producer = path.join(root, 'scripts/macos-static-core');
const source = name => fs.readFileSync(path.join(producer, name), 'utf8');
const helper = source('producer-io-lifecycle.mjs');
const driver = source('build-driver.mjs');
const sharedSource = fs.readFileSync(path.join(root, 'plugins/data-secure/server/core/bound-file-io.js'), 'utf8');
let passed = 0;
const results = [];
async function check(name, callback) { await callback(); passed++; results.push(name); }
const tick = () => new Promise(resolve => setImmediate(resolve));
await check('build capacity permits a standard 7GB ARM runner only with one compiler', () => {
  const gib = 1024 ** 3;
  for (const bytes of [6 * gib, 7_000_000_000, 7 * gib]) {
    assert.equal(contract.assertBuildCapacity(bytes, '1').profile, 'serial_low_memory');
    for (const jobs of ['2', '3', '4']) assert.throws(() => contract.assertBuildCapacity(bytes, jobs),
      { code: 'MEMORY_AND_PARALLELISM_PROFILE_UNSUPPORTED' });
  }
  for (const jobs of ['1', '2', '3', '4']) assert.equal(contract.assertBuildCapacity(8 * gib, jobs).profile, 'standard');
  for (const bytes of [0, 6 * gib - 1, NaN, Infinity, '8589934592'])
    assert.throws(() => contract.assertBuildCapacity(bytes, '1'), { code: 'MEMORY_AND_PARALLELISM_PROFILE_UNSUPPORTED' });
  for (const jobs of ['0', '5', '01', '', null]) assert.throws(() => contract.assertBuildCapacity(14 * gib, jobs),
    { code: 'MEMORY_AND_PARALLELISM_PROFILE_UNSUPPORTED' });
});

function successfulProcess(step) {
  return { schema: 'datasecure-mac-producer-process/1', step, cause: 'success', spawned: true,
    exit_seen: true, exit_code: 0, exit_signal: null, close_seen: true, close_code: 0, close_signal: null,
    kill_attempted: false, kill_result: 'not_requested', kill_error: null,
    child_end_confirmed: true, group_end_confirmed: false,
    timer_cleanup_failed: false, listener_cleanup_failed: false, detach_failed: false,
    log_fsync_failed: false, log_close_failed: false };
}
const processPair = () => ({ configure: successfulProcess('configure'), make: successfulProcess('make') });
const booleanFields = ['spawned', 'exit_seen', 'close_seen', 'kill_attempted', 'child_end_confirmed',
  'group_end_confirmed', 'timer_cleanup_failed', 'listener_cleanup_failed', 'detach_failed', 'log_fsync_failed', 'log_close_failed'];


const cli = (mode = 'plan', arch = 'arm64', changes = {}) => {
  const options = { role: 'mutating-core', arch, repository: '/repo', 'source-archive': '/inputs/node-v22.23.2.tar.xz',
    ...(mode === 'check-source' ? {} : { 'output-parent': '/repo/dist/macos-static-core', 'job-name': 'macos-' + arch,
      jobs: '2', python: '/tools/python3', 'python-sha256': '1'.repeat(64),
      'converter-archive': '/inputs/node-v22.23.2-darwin-' + arch + '.tar.gz' }), ...changes };
  return [mode, ...Object.entries(options).map(([key, value]) => '--' + key + '=' + value)];
};
const tools = Object.freeze({ clang: '/usr/bin/clang', clangxx: '/usr/bin/clang++', ar: '/usr/bin/ar',
  nm: '/usr/bin/nm', developer: '/Developer', sdk: '/Developer/SDK' });
await check('all four versioned ESM imports link; no native build occurs at import', async () => {
  assert.equal(typeof main, 'function'); assert.equal(realHelper.producerProcessFailure(Error('not observed')), null);
  for (const name of ['build-contract.mjs', 'build-driver.mjs', 'final-core-contract.mjs', 'producer-io-lifecycle.mjs']) {
    assert.equal(source(name).includes('dist/mac-static-core-build-spike'), false);
    for (const match of source(name).matchAll(/from ['"](\.[^'"]+)['"]/gu)) {
      const resolved = path.resolve(producer, match[1]);
      assert.ok(fs.statSync(resolved).isFile(), 'real relative import: ' + match[1]);
    }
  }
});
for (const arch of ['arm64', 'x64']) await check('CLI plan binds source/Core/converter/output roles for ' + arch, async () => {
  const options = contract.parseArguments(cli('plan', arch));
  const plan = contract.commandPlan(options, tools), job = '/repo/dist/macos-static-core/macos-' + arch;
  assert.equal(options['source-archive'], '/inputs/node-v22.23.2.tar.xz');
  assert.equal(plan.job, job); assert.equal(plan.output, job + '/datasecure-core');
  assert.equal(plan.final_manifest, job + '/FINAL-CORE.json'); assert.equal(plan.provenance, job + '/BUILD-PROVENANCE.json');
  assert.notEqual(plan.converter, plan.output); assert.ok(plan.converter.endsWith('/bin/node'));
  assert.deepEqual(plan.configure.args, ['-E', '-s', './configure', '--dest-cpu=' + arch, '--dest-os=mac',
    '--no-cross-compiling', '--use_clang', '--with-intl=full-icu', '--download=none', '-C', '--config-dir=' + job + '/gyp-config']);
  assert.deepEqual(plan.make.args, ['-j2', 'V=1', 'PYTHON=/tools/python3', 'node']);
  assert.equal(plan.environment.HOME, undefined); assert.equal(plan.environment.NODE_OPTIONS, undefined);
  assert.equal(plan.environment.CXX, '/usr/bin/clang++'); assert.equal(plan.final_sealing.later_core_mutation, false);
  assert.equal(plan.product_trusted_attestation, false); assert.equal(plan.mac_runtime_certified, false);
});
for (const [changes, code] of [
  [{ role: 'converter' }, 'ROLE_MUST_BE_MUTATING_CORE'], [{ arch: 'universal' }, 'ARCH_INVALID'],
  [{ repository: 'relative' }, 'REPOSITORY_MUST_BE_ABSOLUTE'],
  [{ 'source-archive': 'node-v22.23.2.tar.xz' }, 'SOURCE_ARCHIVE_MUST_BE_ABSOLUTE'],
  [{ 'source-archive': '/inputs/other.tar.xz' }, 'SOURCE_ARCHIVE_NAME_INVALID'],
  [{ 'output-parent': '/outside' }, 'CONSUMER_OUTPUT_LOCATION_INVALID'],
  [{ 'job-name': 'another' }, 'JOB_NAME_MUST_MATCH_CONSUMER_TARGET'], [{ jobs: '5' }, 'JOBS_MUST_BE_1_TO_4'],
  [{ 'converter-archive': '/inputs/node-v22.23.2-darwin-x64.tar.gz' }, 'OFFICIAL_CONVERTER_ARCHIVE_ROLE_MISMATCH'],
  [{ 'source-archive': '/repo/dist/macos-static-core/macos-arm64/node-v22.23.2.tar.xz' }, 'INPUT_OUTPUT_ROLE_OVERLAP']
]) await check('CLI rejects ' + code, async () => assert.throws(() => contract.parseArguments(cli('plan', 'arm64', changes)), { code }));
await check('unknown/legacy/duplicate options and check-source build extras fail closed', async () => {
  for (const args of [[...cli(), '--source-spike=/old'], [...cli(), '--repository=/repo'], [...cli('check-source'), '--jobs=2']])
    assert.throws(() => contract.parseArguments(args));
  assert.equal(contract.parseArguments(cli('check-source')).mode, 'check-source');
});
await check('repository binding rejects another checkout before filesystem observation', async () => {
  const selected = path.resolve('synthetic-producer-root'), driverUrl = url.pathToFileURL(path.join(selected, 'scripts/macos-static-core/build-driver.mjs'));
  let calls = 0; const native = file => { calls++; return file; };
  assert.equal(assertProducerRepository(selected, driverUrl, { realpathSync: { native } }), selected);
  assert.equal(calls, 2); calls = 0;
  assert.throws(() => assertProducerRepository(path.resolve('other-checkout'), driverUrl, { realpathSync: { native } }), { code: 'PRODUCER_REPOSITORY_MISMATCH' });
  assert.equal(calls, 0);
  assert.throws(() => assertProducerRepository(selected, driverUrl, { realpathSync: { native: () => (++calls === 1 ? selected : selected + '-changed') } }), { code: 'PRODUCER_REPOSITORY_MISMATCH' });
});
await check('actual checkout C and consumer source adapters match all fixed producer input pins', async () => {
  for (const [name, relative] of Object.entries(contract.REPOSITORY_INPUTS))
    contract.verifyBytes(name, fs.readFileSync(path.join(root, relative)), contract.PINS[name]);
});
await check('non-Darwin build rejects before repository/input/tool/output access', async () => {
  if (process.platform !== 'darwin') await assert.rejects(main(cli('build')), { code: 'NATIVE_DARWIN_HOST_REQUIRED' });
  else assert.throws(() => contract.assertNativeHost({ platform: 'win32' }, 'arm64'), { code: 'NATIVE_DARWIN_HOST_REQUIRED' });
});
await check('seal has exactly ad-hoc runtime and allow-jit; no later Cargo/sign approval', async () => {
  assert.equal(final.MAX_CORE_BYTES, 134217728);
  const seal = final.finalSealPlan('/private/job/datasecure-core', '/private/job');
  assert.deepEqual(seal.sign.args, ['--force', '--sign', '-', '--timestamp=none', '--options', 'runtime',
    '--entitlements', '/private/job/macos-core-jit.entitlements.plist', '/private/job/datasecure-core']);
  final.assertSealDetails('CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+1\nSignature=adhoc\n', final.ENTITLEMENTS);
  assert.throws(() => final.assertSealDetails('Signature=adhoc\n', final.ENTITLEMENTS));
  assert.throws(() => final.assertSealDetails('CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+1\nSignature=adhoc\n', { ...final.ENTITLEMENTS, 'com.apple.security.cs.disable-library-validation': true }));
  assert.ok(driver.indexOf('runSealTool(sealing.sign)') < driver.indexOf('const core = binaryRecord(plan.output)'));
  assert.ok(driver.indexOf('writeFresh(plan.provenance') < driver.indexOf('writeFresh(plan.final_manifest'));
  assert.equal(driver.includes('approved_artifacts'), false); assert.ok(driver.includes('group_end_confirmed: records.provenance.process_lifecycle.configure.group_end_confirmed &&'));
  assert.ok(driver.includes('processLifecycle: { configure: configureProcess, make: makeProcess }'));
  assert.ok(driver.includes('process_lifecycle: records.provenance.process_lifecycle'));
  assert.ok(driver.includes('process_contract_sha256:'));
  assert.ok(driver.includes('final_contract_sha256:'));
});
const finalValue = arch => ({ arch, jobs: 2, inputs: { guard_c_sha256: contract.PINS['inputs/ownership-guard.c'],
    adapter_cc_sha256: contract.PINS['inputs/ownership-guard-link.cc'], adapter_h_sha256: contract.PINS['inputs/ownership-guard-link.h'],
    transform_sha256: contract.PINS['macos-core-source.mjs'] }, prepared: contract.PATCHED, processLifecycle: processPair(),
    toolchain: { xcode: 'Xcode 16.0', sdk: '15.0', python: '3.13.0', clang: 'Apple clang version 16.0', python_sha256: '1'.repeat(64), clang_sha256: '2'.repeat(64) },
    logs: { configure_sha256: '3'.repeat(64), make_sha256: '4'.repeat(64), compile_commands_sha256: '5'.repeat(64) },
    unsigned: { bytes: 100, sha256: '6'.repeat(64) }, core: { bytes: 110, sha256: '7'.repeat(64) },
    converter: { bytes: 120, sha256: '8'.repeat(64), archive_sha256: contract.CONVERTER_PINS[arch], license_sha256: '9'.repeat(64) },
    license: { bytes: 130, sha256: 'a'.repeat(64) } });

for (const arch of ['arm64', 'x64']) await check('synthetic final DTO is closed, bounded and separated; NOT artifact approval: ' + arch, async () => {
  const value = finalValue(arch);
  const record = final.buildFinalRecords(value);
  assert.equal(record.artifact.target, 'macos-' + arch); assert.equal(record.artifact.build.provenance_sha256, final.digest(final.canonicalBytes(record.provenance)));
  assert.deepEqual(Object.keys(record.artifact).sort(), ['schema', 'role', 'target', 'rust_target', 'node_version', 'upstream', 'static_binding', 'inputs', 'build', 'core', 'converter', 'license', 'signing'].sort());
  assert.deepEqual(record.artifact.signing, { identity: '-', hardened_runtime: true, entitlements: final.ENTITLEMENTS });
  assert.equal(record.provenance.schema, 'datasecure-macos-static-core-build-provenance/2');
  assert.deepEqual(record.provenance.process_lifecycle, value.processLifecycle);
  assert.equal(record.provenance.process_lifecycle.configure.group_end_confirmed, false);
  assert.equal(record.provenance.process_lifecycle.make.group_end_confirmed, false);
  assert.throws(() => final.buildFinalRecords({ ...value, core: { ...value.core, bytes: final.MAX_CORE_BYTES + 1 } }), { code: 'FINAL_CORE_SIZE_INVALID' });
  assert.throws(() => final.buildFinalRecords({ ...value, converter: { ...value.converter, sha256: value.core.sha256 } }), { code: 'FINAL_CORE_ROLE_INVALID' });
  assert.throws(() => final.buildFinalRecords({ ...value, inputs: { ...value.inputs, injected: 'f'.repeat(64) } }), { code: 'FINAL_CORE_SCHEMA_INVALID' });
  assert.throws(() => final.buildFinalRecords({ ...value, logs: { ...value.logs, make_sha256: 'not-a-hash' } }), { code: 'FINAL_CORE_HASH_INVALID' });
});

function memoryFileSystem(mutation = () => {}) {
  let bytes = Buffer.from('pinned source bytes'); const filename = '/audit/inputs/source';
  let counter = 0, closes = 0, reads = 0, flags;
  const entry = (kind, ino, size = 0) => ({ dev: 1n, ino: BigInt(ino), birthtimeNs: 2n,
    mtimeNs: 3n, ctimeNs: 4n, size: BigInt(size), nlink: 1n,
    isFile: () => kind === 'file', isDirectory: () => kind === 'dir', isSymbolicLink: () => kind === 'link' });
  const named = new Map([['/', entry('dir', 1)], ['/audit', entry('dir', 2)], ['/audit/inputs', entry('dir', 3)],
    [filename, entry('file', 4, bytes.length)]]);
  let held;
  const io = {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x100, O_NONBLOCK: 4 },
    lstatSync(file) { assert.ok(named.has(file), 'only fixed RAM namespace'); return { ...named.get(file) }; },
    realpathSync(file) { return file; },
    openSync(file, value) {
      assert.equal(file, filename); flags = value;
      mutation('open', { named, entry, bytes, io });
      if (named.get(file).isDirectory() || !named.get(file).isFile()) {
        if (!(value & io.constants.O_NONBLOCK)) throw Error('MODEL_WOULD_BLOCK_OPEN');
      }
      held = { ...named.get(file) }; return ++counter;
    },
    fstatSync() { return { ...held }; },
    readSync(fd, target, offset, length, position) {
      reads++; mutation('read', { named, entry, held, bytes, io });
      return bytes.copy(target, offset, position, Math.min(bytes.length, position + length));
    },
    closeSync() { closes++; mutation('close', { named, entry, held, bytes, io }); }
  };
  const module = { exports: {} };
  vm.runInNewContext(sharedSource, { module, exports: module.exports, Buffer, process: { platform: 'darwin' }, require(name) {
    return ({ 'node:fs': io, 'node:path': path.posix, 'node:crypto': crypto })[name];
  } }, { filename: 'actual-bound-file-io.js' });
  return { io, bound: module.exports, filename, get bytes() { return bytes; }, state() { return { held, named, entry, bytes, setBytes(value) { bytes = Buffer.from(value); } }; }, get closes() { return closes; }, get reads() { return reads; }, get flags() { return flags; } };
}

// Evaluate exactly the stored helper body; only ESM linkage is replaced.
// The real module is also imported above; no copied algorithm or live process.
async function namespace(bound = {}, selectedPath = path.posix, selectedIo = fs) {
  const body = helper.replace(/^import [^\n]+;\n/gmu, '').replace(/^export /gmu, '');
  const context = { Buffer, URL, path: selectedPath, fileURLToPath: url.fileURLToPath,
    fs: selectedIo, createHash: crypto.createHash, spawn() { assert.fail('model forbids real child'); },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    process: { kill() { assert.fail('model forbids real signals'); } }, bound };
  vm.runInNewContext(body + '\nthis.api = { readProducerFileBounded, readProducerFileRecord, revalidateProducerFileRecord, rewriteProducerFileRecord, syncProducerFileRecord, syncProducerDirectory, writeProducerFresh, producerInputPath, producerFileObservation, producerIoFailure, runProducerBuildStep, producerProcessFailure };', context, { filename: 'actual-producer-io-lifecycle.mjs', timeout: 1000 });
  return context.api;
}

await check('actual shared FD/identity primitives: bounded bytes, nonblocking flags and one close', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  assert.ok(api.readProducerFileBounded(f.filename).equals(f.bytes));
  assert.ok(f.flags & f.io.constants.O_NONBLOCK); assert.ok(f.flags & f.io.constants.O_NOFOLLOW);
  assert.equal(f.closes, 1);
});
await check('read size refused before open and allocation', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  assert.throws(() => api.readProducerFileBounded(f.filename, 1)); assert.equal(f.flags, undefined); assert.equal(f.closes, 0);
  assert.throws(() => api.readProducerFileBounded(f.filename, 512 * 1024 * 1024 + 1));
});
for (const kind of ['fifo', 'link']) await check('raced ' + kind + ' refused after nonblocking open, FD closed', async () => {
  const f = memoryFileSystem((phase, state) => { if (phase === 'open') state.named.set('/audit/inputs/source', state.entry(kind, 99)); });
  const api = await namespace(f.bound, path.posix, f.io); assert.throws(() => api.readProducerFileBounded(f.filename));
  assert.ok(f.flags & f.io.constants.O_NONBLOCK); assert.equal(f.reads, 0); assert.equal(f.closes, 1);
});
await check('parent identity changed during read is refused, FD closed', async () => {
  const f = memoryFileSystem((phase, state) => { if (phase === 'read') state.named.set('/audit/inputs', state.entry('dir', 99)); });
  const api = await namespace(f.bound, path.posix, f.io); assert.throws(() => api.readProducerFileBounded(f.filename)); assert.equal(f.closes, 1);
});
await check('ctime drift is refused without accepting a warm identity', async () => {
  const f = memoryFileSystem((phase, state) => { if (phase === 'read') state.held.ctimeNs = 8n; });
  const api = await namespace(f.bound, path.posix, f.io); assert.throws(() => api.readProducerFileBounded(f.filename)); assert.equal(f.closes, 1);
});
await check('read FD close failure preserves its exact primary object', async () => {
  const injected = Object.assign(Error('injected close'), { code: 'EIO' });
  const f = memoryFileSystem(phase => { if (phase === 'close') throw injected; });
  const api = await namespace(f.bound, path.posix, f.io);
  assert.throws(() => api.readProducerFileBounded(f.filename), error => error === injected);
  assert.equal(api.producerIoFailure(injected).close_failed, true); assert.equal(f.closes, 1);
});
await check('file-URL conversion preserves the actual host path without opening it', async () => {
  const filename = path.resolve('synthetic-never-created-input');
  const api = await namespace({}, path); assert.equal(api.producerInputPath(url.pathToFileURL(filename)), filename);
});

class Child extends EventEmitter {
  constructor() { super(); this.pid = 41001; this.exitCode = null; this.signalCode = null; this.detached = false; }
  unref() { this.detached = true; }
  exit(code = 0, signal = null) { this.exitCode = code; this.signalCode = signal; this.emit('exit', code, signal); }
  close(code = this.exitCode, signal = this.signalCode) { this.emit('close', code, signal); }
}
const api = await namespace();
function scenario(overrides = {}) {
  const child = new Child(), controller = new AbortController(), activeTimers = new Set();
  const log = { opens: 0, closes: 0, fsyncs: 0 }, kills = [];
  let abortAdds = 0, abortRemoves = 0;
  const signal = { get aborted() { return controller.signal.aborted; },
    addEventListener(...args) { abortAdds++; controller.signal.addEventListener(...args); },
    removeEventListener(...args) { abortRemoves++; controller.signal.removeEventListener(...args); } };
  const model = { io: {
    openSync(file, flag, mode) { assert.equal(file, '/private/job/configure.log'); assert.equal(flag, 'wx'); assert.equal(mode, 0o600); log.opens++; return 81; },
    fsyncSync(fd) { assert.equal(fd, 81); log.fsyncs++; }, closeSync(fd) { assert.equal(fd, 81); log.closes++; }
  }, spawn(executable, args, options) { assert.equal(executable, '/pinned/python');
    assert.deepEqual([...options.stdio], ['ignore', 81, 81]); assert.equal(options.detached, true); assert.equal(options.shell, false); return child; },
  killGroup(pid, requested) { kills.push([pid, requested]); return true; },
  setTimeout(fn, ms) { const timer = timers.setTimeout(() => { activeTimers.delete(timer); fn(); }, ms); activeTimers.add(timer); return timer; },
  clearTimeout(timer) { timers.clearTimeout(timer); activeTimers.delete(timer); }, timeoutMs: 150, reapMs: 12 };
  overrides.configure?.({ model, child, signal, controller, log, kills });
  const pending = api.runProducerBuildStep({ executable: '/pinned/python', args: ['configure'], cwd: '/private/source' },
    { LANG: 'C' }, '/private/job', 'configure', signal, model);
  let settled = false, success, failure;
  const end = pending.then(value => { settled = true; success = value; }, error => { settled = true; failure = error; });
  return { child, controller, signal, log, kills, model, activeTimers, end,
    get settled() { return settled; }, get success() { return success; }, get failure() { return failure; },
    get record() { return api.producerProcessFailure(failure); },
    clean() { for (const timer of activeTimers) timers.clearTimeout(timer); activeTimers.clear(); },
    assertCleanup(confirmed = true) {
      assert.equal(log.closes, 1); assert.equal(abortAdds, abortRemoves);
      if (confirmed) { assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('close'), 0); assert.equal(child.listenerCount('error'), 0); }
      assert.equal(activeTimers.size, 0);
    } };
}
async function life(name, body, configure) { await check(name, async () => { const s = scenario({ configure }); try { await body(s); } finally { s.clean(); } }); }
await life('exit zero alone is not success; normal matching close succeeds', async s => {
  s.child.exit(); await tick(); assert.equal(s.settled, false); s.child.close(); await s.end;
  assert.equal(s.failure, undefined); assert.equal(s.success.child_end_confirmed, true);
  assert.equal(s.success.group_end_confirmed, false); assert.equal(Object.isFrozen(s.success), true); s.assertCleanup();
});
await life('exit without close is bounded, never signals an exited numeric PID', async s => {
  s.child.exit(); await s.end; assert.ok(s.failure); assert.equal(s.record.child_end_confirmed, false);
  assert.equal(s.record.cause, 'close_unconfirmed'); assert.equal(s.kills.length, 0); assert.equal(s.child.detached, true);
  s.child.emit('error', Error('late owned child error')); s.child.close(); s.assertCleanup();
});
for (const mode of ['false', 'EPERM', 'ESRCH', 'throw']) await life('deadline kill ' + mode + ' cannot claim success or a close', async s => {
  await s.end; assert.ok(s.failure); assert.equal(s.record.cause, 'deadline'); assert.equal(s.record.child_end_confirmed, false);
  assert.equal(s.record.kill_result, mode === 'ESRCH' ? 'missing' : 'failed'); assert.equal(s.kills.length, 1);
  assert.equal(s.child.detached, true); s.child.emit('error', Error('late')); s.child.close(null, 'SIGKILL'); s.assertCleanup();
}, ({ model, kills }) => { model.timeoutMs = 4; model.killGroup = (pid, requested) => {
  kills.push([pid, requested]); if (mode === 'false') return false;
  throw mode === 'throw' ? Error('injected') : Object.assign(Error('injected'), { code: mode });
}; });
await life('sent kill still needs matching exit and close, deadline remains primary', async s => {
  await s.end; assert.ok(s.failure); assert.equal(s.record.cause, 'deadline'); assert.equal(s.record.child_end_confirmed, true);
  assert.equal(s.record.kill_result, 'sent'); assert.equal(s.record.exit_signal, 'SIGKILL'); s.assertCleanup();
}, ({ model, child, kills }) => { model.timeoutMs = 4; model.killGroup = (pid, requested) => {
  kills.push([pid, requested]); queueMicrotask(() => { child.exit(null, 'SIGKILL'); child.close(); }); return true;
}; });
await life('abort after spawn requests only one kill and preserves abort through close', async s => {
  s.controller.abort(); s.controller.abort(); s.child.exit(null, 'SIGKILL'); s.child.close(); await s.end;
  assert.equal(s.record.cause, 'aborted'); assert.equal(s.kills.length, 1); assert.equal(s.record.child_end_confirmed, true); s.assertCleanup();
});
await life('nonzero exit plus close is failure, not a kill/retry', async s => {
  s.child.exit(7); s.child.close(); await s.end; assert.equal(s.record.cause, 'exit_failed');
  assert.equal(s.record.exit_code, 7); assert.equal(s.record.close_code, 7); assert.equal(s.kills.length, 0); s.assertCleanup();
});
await life('close without exit/error cannot become success', async s => {
  s.child.close(0, null); await s.end; assert.equal(s.record.cause, 'protocol_invalid'); s.assertCleanup();
});
await life('spawn error close -2 retains exact primary error and true close data', async s => {
  const primary = Object.assign(Error('synthetic spawn'), { code: 'ENOENT' }); s.child.emit('error', primary); s.child.close(-2, null); await s.end;
  assert.equal(s.failure, primary); assert.equal(s.record.close_code, -2); assert.equal(s.record.child_end_confirmed, true); s.assertCleanup();
}, ({ child }) => { child.pid = undefined; });
await life('synchronous spawn throw closes log without an owned child', async s => {
  await s.end; assert.equal(s.record.cause, 'spawn_failed'); assert.equal(s.record.spawned, false); assert.equal(s.kills.length, 0); s.assertCleanup();
}, ({ model }) => { model.spawn = () => { throw Object.assign(Error('spawn'), { code: 'EACCES' }); }; });
await life('timer creation failure cannot escape or hang after spawned child', async s => {
  await s.end; assert.ok(s.failure); assert.equal(s.record.cause, 'timer_failed'); assert.equal(s.record.child_end_confirmed, false);
  assert.equal(s.kills.length, 1); s.child.close(null, 'SIGKILL'); s.assertCleanup();
}, ({ model }) => { model.setTimeout = () => { throw Error('timer'); }; });
await life('process primary survives secondary log-close failure', async s => {
  const primary = Error('primary'); s.child.emit('error', primary); s.child.exit(9); s.child.close(); await s.end;
  assert.equal(s.failure, primary); assert.equal(s.record.log_close_failed, true); assert.equal(s.record.cause, 'process_error'); s.assertCleanup();
}, ({ model, log }) => { model.io.closeSync = () => { log.closes++; throw Error('secondary log close'); }; });
await life('normal child with failed fsync or log-close cannot become success', async s => {
  s.child.exit(); s.child.close(); await s.end; assert.ok(s.failure); assert.equal(s.record.cause, 'log_fsync_failed');
  assert.equal(s.record.log_fsync_failed, true); assert.equal(s.record.log_close_failed, true);
}, ({ model, log }) => { model.io.fsyncSync = () => { throw Error('fsync'); }; model.io.closeSync = () => { log.closes++; throw Error('close'); }; });
await life('EPIPE while detaching unconfirmed streams is consumed, not an unhandled error', async s => {
  await s.end; assert.equal(s.record.child_end_confirmed, false); assert.equal(s.child.stdout.destroyed, true);
  s.child.stdout.emit('error', Object.assign(Error('late pipe'), { code: 'EPIPE' })); s.child.stdout.emit('close'); s.child.close(null, 'SIGKILL'); s.assertCleanup();
}, ({ model, child }) => { model.timeoutMs = 4; const stream = new EventEmitter();
  stream.destroy = () => { stream.destroyed = true; stream.emit('error', Object.assign(Error('pipe'), { code: 'EPIPE' })); };
  stream.unref = () => {}; child.stdout = stream;
});
await life('timer cancellation failure cannot report success or keep a watchdog referenced', async s => {
  s.child.exit(); s.child.close(); await s.end;
  assert.ok(s.failure); assert.equal(s.record.cause, 'cleanup_failed'); assert.equal(s.record.timer_cleanup_failed, true);
  assert.equal(s.record.child_end_confirmed, true); assert.equal(s.log.closes, 1);
  assert.ok(s.activeTimers.size > 0); for (const timer of s.activeTimers) assert.equal(timer.hasRef(), false);
  assert.equal(s.child.listenerCount('error'), 0); assert.equal(s.child.listenerCount('close'), 0);
}, ({ model }) => { model.clearTimeout = () => { throw Error('cancel timer'); }; });
await life('listener cleanup failure is explicit, never success or a later abort kill', async s => {
  s.child.exit(); s.child.close(); await s.end;
  assert.ok(s.failure); assert.equal(s.record.listener_cleanup_failed, true);
  s.controller.abort(); assert.equal(s.kills.length, 0);
}, ({ signal }) => { signal.removeEventListener = () => { throw Error('remove abort listener'); }; });
await life('mismatching close metadata cannot confirm a successful result', async s => {
  s.child.exit(); s.child.close(2, null); await s.end;
  assert.ok(s.failure); assert.equal(s.record.cause, 'protocol_invalid'); s.assertCleanup();
});
await life('abort race during listener registration is observed before the watchdog', async s => {
  await s.end; assert.equal(s.record.cause, 'aborted'); assert.equal(s.kills.length, 1);
  assert.equal(s.record.child_end_confirmed, false); s.child.close(null, 'SIGKILL'); s.assertCleanup();
}, ({ signal, controller }) => { const original = signal.addEventListener;
  signal.addEventListener = (...args) => { controller.abort(); original(...args); };
});
await check('already aborted signal starts no child and opens no log', async () => {
  const c = new AbortController(); c.abort();
  await assert.rejects(api.runProducerBuildStep({}, {}, '/unused', 'configure', c.signal), { code: 'BUILD_ABORTED' });
});

await check('secondary failed failure-evidence write preserves the actual driver primary', async () => {
  const start = driver.indexOf('  } catch (error) {\n    const lifecycle = producerProcessFailure(error);');
  const end = driver.indexOf('  } finally {', start);
  assert.ok(start > 0 && end > start);
  const catchBody = driver.slice(start + '  } catch (error) {\n'.length, end);
  const primary = Error('synthetic primary'); let writes = 0;
  const context = { error: primary, created: true, plan: { job: '/private/fresh-owned-job' },
    producerProcessFailure: () => null, producerIoFailure: () => null, producerToolFailure: () => null,
    writeEvidence() { writes++; throw Error('secondary evidence close'); } };
  assert.throws(() => vm.runInNewContext(catchBody, context), error => error === primary); assert.equal(writes, 1);
});

// R2: actual opaque-FD operations in a closed RAM filesystem. No disk fixture.
function writableFileSystem(mutation = () => {}) {
  const f = memoryFileSystem(mutation), calls = { truncate: 0, write: 0, fsync: 0 };
  Object.assign(f.io.constants, { O_RDWR: 2, O_CREAT: 0x200, O_EXCL: 0x800, O_DIRECTORY: 0x100000 });
  const originalOpen = f.io.openSync;
  f.io.openSync = (file, flags, mode) => {
    if (flags & f.io.constants.O_CREAT) {
      if (f.state().named.has(file)) throw Object.assign(Error('exists'), { code: 'EEXIST' });
      f.state().named.set(file, f.state().entry('file', 77, 0));
    }
    return originalOpen(file, flags, mode);
  };
  const update = bytes => {
    const s = f.state(); s.setBytes(bytes);
    for (const stat of [s.held, s.named.get(f.filename)]) {
      stat.size = BigInt(bytes.length); stat.mtimeNs = 10n; stat.ctimeNs = 10n;
    }
  };
  f.io.ftruncateSync = (fd, size) => {
    assert.equal(size, 0); assert.equal(f.flags & 0x400, 0, 'no destructive open flag');
    assert.equal(f.state().held.isFile(), true); assert.equal(f.state().held.nlink, 1n);
    calls.truncate++; update(Buffer.alloc(0));
  };
  f.io.writeFileSync = (fd, bytes) => { calls.write++; update(Buffer.from(bytes)); };
  f.io.fsyncSync = () => { calls.fsync++; };
  return { ...f, f, calls };
}
await check('R2 source wiring contains no direct existing-file open or O_TRUNC', async () => {
  assert.equal(driver.includes('fs.openSync('), false);
  assert.ok(driver.includes('rewriteProducerFileRecord(sourceRecords[name], value)'));
  assert.ok(driver.includes('syncProducerFileRecord(sealedRecord)'));
  assert.ok(driver.includes('syncProducerDirectory(path.dirname(file))'));
  assert.ok(driver.includes('writeProducerFresh(file, bytes, mode)'));
  assert.ok(driver.includes('producerIoFailure(error)'));
});
await check('R2 Core fsync uses exact read proof, nonblocking open, and one close per FD', async () => {
  const { f, calls } = writableFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  const record = api.readProducerFileRecord(f.filename);
  api.syncProducerFileRecord(record);
  assert.ok(f.flags & f.io.constants.O_NONBLOCK); assert.ok(f.flags & f.io.constants.O_NOFOLLOW);
  assert.equal(f.closes, 2); assert.equal(calls.fsync, 1); assert.equal(calls.truncate, 0);
});
for (const action of ['syncProducerFileRecord', 'rewriteProducerFileRecord']) {
  for (const kind of ['fifo', 'other-inode', 'hardlink', 'parent']) await check('R2 ' + action + ' refuses raced ' + kind + ' without truncation', async () => {
    let opens = 0;
    const { f, calls } = writableFileSystem((phase, state) => {
      if (phase !== 'open' || ++opens !== 2) return;
      if (kind === 'parent') state.named.set('/audit/inputs', state.entry('dir', 99));
      else if (kind === 'hardlink') state.named.get('/audit/inputs/source').nlink = 2n;
      else state.named.set('/audit/inputs/source', state.entry(kind === 'fifo' ? 'fifo' : 'file', 99, state.bytes.length));
    });
    const api = await namespace(f.bound, path.posix, f.io), record = api.readProducerFileRecord(f.filename);
    assert.throws(() => api[action](record, ...(action.startsWith('rewrite') ? [Buffer.from('patch')] : [])));
    assert.ok(f.flags & f.io.constants.O_NONBLOCK); assert.equal(f.closes, 2);
    assert.equal(calls.truncate, 0); assert.equal(calls.write, 0);
  });
}
await check('R2 source rewrite validates held preimage before ftruncate and verifies written bytes', async () => {
  const { f, calls } = writableFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  const record = api.readProducerFileRecord(f.filename), bytes = Buffer.from('patched source');
  const updated = api.rewriteProducerFileRecord(record, bytes);
  assert.equal(calls.truncate, 1); assert.equal(calls.write, 1); assert.equal(calls.fsync, 1);
  assert.ok(updated.bytes.equals(bytes)); assert.equal(f.closes, 2);
  assert.throws(() => api.revalidateProducerFileRecord(record), { code: 'BOUND_FILE_CHANGED' });
  assert.ok(api.revalidateProducerFileRecord(updated).bytes.equals(bytes));
});
for (const failing of ['read', 'truncate', 'write', 'fsync']) await check('R2 ' + failing + ' primary survives secondary close failure identically', async () => {
  const { f } = writableFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  const record = api.readProducerFileRecord(f.filename);
  const primary = Object.assign(Error('primary'), { code: 'ENOSPC' }), closing = Object.assign(Error('close'), { code: 'EIO' });
  if (failing === 'read') f.io.readSync = () => { throw primary; };
  if (failing === 'truncate') f.io.ftruncateSync = () => { throw primary; };
  if (failing === 'write') f.io.writeFileSync = () => { throw primary; };
  if (failing === 'fsync') f.io.fsyncSync = () => { throw primary; };
  const close = f.io.closeSync; f.io.closeSync = () => { close(); throw closing; };
  assert.throws(() => failing === 'fsync' || failing === 'read'
    ? api.syncProducerFileRecord(record) : api.rewriteProducerFileRecord(record, Buffer.from('new')),
    error => error === primary);
  assert.equal(f.closes, 2); assert.equal(api.producerIoFailure(primary).close_failed, true);
  assert.equal(api.producerIoFailure(primary).close_code, 'EIO');
});
await check('R2 forged and serialized file proofs cannot acquire authority', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  assert.throws(() => api.syncProducerFileRecord({ bytes: Buffer.from('not a proof') }), { code: 'PRODUCER_FILE_PROOF_INVALID' });
  assert.equal(f.flags, undefined);
});
await check('R2 directory fsync binds opened directory and all named ancestors', async () => {
  const { f, calls } = writableFileSystem(), directory = '/audit/inputs';
  const named = f.state().named;
  f.io.openSync = (file, flags) => { assert.equal(file, directory); assert.ok(flags & f.io.constants.O_NONBLOCK); assert.ok(flags & f.io.constants.O_NOFOLLOW); return 88; };
  f.io.fstatSync = () => ({ ...named.get(directory) });
  const api = await namespace(f.bound, path.posix, f.io);
  assert.equal(api.syncProducerDirectory(directory, { io: f.io, platform: 'darwin' }), true);
  assert.equal(f.closes, 1); assert.equal(calls.fsync, 1);
  f.io.fsyncSync = () => { named.set(directory, f.state().entry('dir', 99)); };
  assert.throws(() => api.syncProducerDirectory(directory, { io: f.io, platform: 'darwin' }), { code: 'BOUND_FILE_CHANGED' });
  assert.equal(f.closes, 2);
});
await check('R2 fresh create is exclusive, bounded and preserves close failures', async () => {
  const { f, calls } = writableFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  assert.throws(() => api.writeProducerFresh(f.filename, Buffer.from('no'), 0o600, { io: f.io }), { code: 'EEXIST' });
  assert.equal(calls.write, 0); f.state().named.delete(f.filename);
  assert.equal(api.writeProducerFresh(f.filename, Buffer.from('new'), 0o600, { io: f.io }), true);
  assert.equal(calls.write, 1); assert.equal(f.closes, 1);
  assert.ok(f.flags & f.io.constants.O_NONBLOCK); assert.ok(f.flags & f.io.constants.O_NOFOLLOW);
});

function pythonModel(api) {
  const start = driver.indexOf('const pythonProofs ='), end = driver.indexOf('async function inspectTools(', start);
  assert.ok(start >= 0 && end > start);
  const context = { Object, WeakMap, readProducerFileRecord: api.readProducerFileRecord,
    revalidateProducerFileRecord: api.revalidateProducerFileRecord, verifyBytes: contract.verifyBytes, fail: contract.fail };
  vm.runInNewContext(driver.slice(start, end).replace(/^export /gmu, '') +
    '\nthis.api = { capturePythonIdentity, revalidatePythonIdentity };', context);
  return context.api;
}
await check('R2 actual Python identity contract accepts stable original but rejects forged identity and caller repin', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io), identity = pythonModel(api);
  const options = { python: f.filename, 'python-sha256': contract.sha256(f.bytes) };
  const token = identity.capturePythonIdentity(options);
  assert.equal(identity.revalidatePythonIdentity(options, token), options['python-sha256']);
  assert.throws(() => identity.revalidatePythonIdentity(options, { ...token }), { code: 'PYTHON_IDENTITY_INVALID' });
  assert.throws(() => identity.revalidatePythonIdentity({ ...options, 'python-sha256': 'f'.repeat(64) }, token), { code: 'PYTHON_IDENTITY_INVALID' });
  assert.throws(() => identity.capturePythonIdentity({ ...options, 'python-sha256': 'f'.repeat(64) }));
});
for (const kind of ['bytes', 'inode', 'parent', 'ctime']) await check('R2 actual Python identity contract refuses later ' + kind + ' change', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io), identity = pythonModel(api);
  const options = { python: f.filename, 'python-sha256': contract.sha256(f.bytes) }, token = identity.capturePythonIdentity(options);
  const state = f.state();
  if (kind === 'bytes') state.setBytes(Buffer.alloc(f.bytes.length, 0x78)); // even if stat metadata were restored
  if (kind === 'inode') state.named.set(f.filename, state.entry('file', 99, f.bytes.length));
  if (kind === 'parent') state.named.set('/audit/inputs', state.entry('dir', 99));
  if (kind === 'ctime') state.named.get(f.filename).ctimeNs = 99n;
  assert.throws(() => identity.revalidatePythonIdentity(options, token), { code: 'BOUND_FILE_CHANGED' });
});
await check('R2 observed Python exchange during actual inspectTools cannot reach successful inspection or provenance', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io), identity = pythonModel(api);
  const options = { python: f.filename, arch: 'arm64', 'python-sha256': contract.sha256(f.bytes) };
  const start = driver.indexOf('async function inspectTools('), end = driver.indexOf('async function tarMembers(', start);
  let calls = 0;
  const context = { process: { platform: 'darwin', version: 'v22.23.2', arch: 'arm64' }, basicEnv: {}, rosettaProbe: 'MODEL_ONLY',
    fs: { realpathSync: { native: file => file } }, cleanPosix: contract.cleanPosix, appleToolInvocation: contract.appleToolInvocation,
    sha256: contract.sha256, readFileBounded: file => Buffer.from('model Apple tool: ' + file),
    capturePythonIdentity: identity.capturePythonIdentity, revalidatePythonIdentity: identity.revalidatePythonIdentity,
    assertNativeHost: contract.assertNativeHost, fail: contract.fail,
    execRead(exe, args) {
      if (exe.endsWith('xcode-select')) return '/Developer';
      if (exe.endsWith('xcodebuild')) return 'Xcode 16.0\nBuild version MODEL';
      if (exe.endsWith('xcrun')) {
        if (args.includes('--show-sdk-path')) return '/Developer/SDK';
        if (args.includes('--show-sdk-version')) return '15.0';
        return '/Developer/usr/bin/' + args.at(-1);
      }
      if (exe.endsWith('/clang')) return 'Apple clang version 16.0';
      if (exe.endsWith('/arch') && args.includes(options.python)) {
        calls++; f.state().setBytes(Buffer.alloc(f.bytes.length, 0x78));
        return JSON.stringify({ translated: 0, machine: 'arm64', python: '3.13.0' });
      }
      assert.fail('unexpected model tool');
    } };
  vm.runInNewContext(driver.slice(start, end) + '\nthis.run = inspectTools;', context);
  await assert.rejects(context.run(options), { code: 'BOUND_FILE_CHANGED' }); assert.equal(calls, 1);
});
await check('R2 Python revalidation is wired before/after Configure+Make and before provenance+commit', async () => {
  for (const label of ['configure', 'make']) {
    const line = "    const " + label + "Process = await runBuildStep(plan." + label + ", plan.environment, plan.job, '" + label + "', abort.signal);";
    assert.ok(driver.includes('    revalidatePythonIdentity(options, inspection.pythonIdentity);\n' + line +
      '\n    revalidatePythonIdentity(options, inspection.pythonIdentity);'));
  }
  assert.ok(driver.includes('const pythonSha256 = revalidatePythonIdentity(options, inspection.pythonIdentity)'));
  assert.ok(driver.includes('python_sha256: pythonSha256,'));
  const commit = driver.slice(driver.lastIndexOf('    await checkPrivateParent(plan.job, abort.signal);'), driver.indexOf('    return evidence;'));
  assert.ok(commit.indexOf('revalidatePythonIdentity') < commit.indexOf('writeFresh(plan.final_manifest'));
});


await check('R2 binary observations come from the same held file record, not a separate lstat', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  const record = api.readProducerFileRecord(f.filename), measured = api.producerFileObservation(record);
  assert.equal(measured.ino, '4'); assert.equal(measured.sha256, contract.sha256(f.bytes));
  assert.equal(measured.bytes, f.bytes.length); assert.equal(Object.isFrozen(measured), true);
  assert.ok(driver.includes('return producerFileObservation(readProducerFileRecord(file, maximum))'));
  assert.throws(() => api.producerFileObservation({ bytes: f.bytes }), { code: 'PRODUCER_FILE_PROOF_INVALID' });
});
await check('R2 fresh write primary preserves simultaneous close failure', async () => {
  const { f } = writableFileSystem(), api = await namespace(f.bound, path.posix, f.io);
  f.state().named.delete(f.filename);
  const primary = Object.assign(Error('write'), { code: 'ENOSPC' });
  f.io.writeFileSync = () => { throw primary; };
  const close = f.io.closeSync; f.io.closeSync = () => { close(); throw Object.assign(Error('close'), { code: 'EIO' }); };
  assert.throws(() => api.writeProducerFresh(f.filename, Buffer.from('new'), 0o600, { io: f.io }), error => error === primary);
  assert.equal(f.closes, 1); assert.equal(api.producerIoFailure(primary).operation, 'create-file');
  assert.equal(api.producerIoFailure(primary).close_failed, true);
});
await check('R2 invalid rewrite payload cannot become a successful readonly operation', async () => {
  const f = memoryFileSystem(), api = await namespace(f.bound, path.posix, f.io), record = api.readProducerFileRecord(f.filename);
  assert.throws(() => api.rewriteProducerFileRecord(record, null), { code: 'PRODUCER_WRITE_INVALID' });
  assert.equal(f.closes, 1);
});


// Bound observations are mandatory even though no process-group proof exists.
for (const step of ['configure', 'make']) {
  for (const key of booleanFields) await check('provenance requires a real boolean for ' + step + '.' + key, async () => {
    for (const value of [0, 1, 'false', 'true', null, new Boolean(false)]) {
      const input = finalValue('arm64'); input.processLifecycle[step][key] = value;
      assert.throws(() => final.buildFinalRecords(input), { code: 'FINAL_CORE_PROCESS_LIFECYCLE_INVALID' });
    }
  });
  await check('provenance closes all fields and requires observed success for ' + step, async () => {
    const good = successfulProcess(step);
    for (const key of Object.keys(good)) {
      const input = finalValue('x64'); delete input.processLifecycle[step][key];
      assert.throws(() => final.buildFinalRecords(input), { code: 'FINAL_CORE_PROCESS_LIFECYCLE_INVALID' });
    }
    for (const [key, value] of Object.entries({ schema: 'other', step: step === 'make' ? 'configure' : 'make',
      cause: 'close_unconfirmed', spawned: false, exit_seen: false, exit_code: 1, exit_signal: 'SIGKILL',
      close_seen: false, close_code: 1, close_signal: 'SIGKILL', kill_attempted: true,
      kill_result: 'sent', kill_error: 'other', child_end_confirmed: false, timer_cleanup_failed: true,
      listener_cleanup_failed: true, detach_failed: true, log_fsync_failed: true, log_close_failed: true, extra: true })) {
      const input = finalValue('x64'); input.processLifecycle[step][key] = value;
      assert.throws(() => final.buildFinalRecords(input), { code: 'FINAL_CORE_PROCESS_LIFECYCLE_INVALID' });
    }
  });
}
await check('missing pair, extra pair members, symbols, nonenumerables, getters and proxies are not DTOs', async () => {
  for (const value of [undefined, null, {}, { ...processPair(), other: successfulProcess('make') }]) {
    const input = finalValue('arm64'); input.processLifecycle = value;
    assert.throws(() => final.buildFinalRecords(input), { code: 'FINAL_CORE_PROCESS_LIFECYCLE_INVALID' });
  }
  let calls = 0;
  const accessor = successfulProcess('configure');
  Object.defineProperty(accessor, 'spawned', { enumerable: true, get() { calls++; return true; } });
  const hidden = successfulProcess('configure'); Object.defineProperty(hidden, 'spawned', { value: true, enumerable: false });
  const symbol = successfulProcess('configure'); symbol[Symbol('extra')] = true;
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('trap'); } });
  for (const value of [accessor, hidden, symbol, proxy])
    assert.throws(() => readMacCoreBuildProcessLifecycle({ configure: value, make: successfulProcess('make') }));
  assert.throws(() => readMacCoreBuildProcessLifecycle(new Proxy({}, { ownKeys() { calls++; throw Error('pair trap'); } })));
  assert.equal(calls, 0);
});
await check('lifecycle is a frozen snapshot; false stays false and every observation enters the digest', async () => {
  const input = finalValue('arm64'), result = final.buildFinalRecords(input);
  assert.equal(Object.isFrozen(result.provenance.process_lifecycle), true);
  for (const step of ['configure', 'make']) assert.equal(Object.isFrozen(result.provenance.process_lifecycle[step]), true);
  input.processLifecycle.configure.group_end_confirmed = true;
  assert.equal(result.provenance.process_lifecycle.configure.group_end_confirmed, false);
  const changed = final.buildFinalRecords(input);
  assert.notEqual(changed.artifact.build.provenance_sha256, result.artifact.build.provenance_sha256);
  assert.notEqual(changed.artifact_sha256, result.artifact_sha256);
  assert.equal(changed.provenance.process_lifecycle.configure.group_end_confirmed, true);
  assert.equal(changed.provenance.process_lifecycle.make.group_end_confirmed, false);
});
async function observedSuccessProcess(step) {
  const child = new Child(), controller = new AbortController(); let closes = 0, fsyncs = 0;
  const pending = realHelper.runProducerBuildStep({ executable: '/model/' + step, args: [], cwd: '/model/source' }, {},
    '/model/job', step, controller.signal, { timeoutMs: 1000, reapMs: 10,
      io: { openSync(file, flags, mode) { assert.equal(file, path.join('/model/job', step + '.log')); assert.equal(flags, 'wx'); assert.equal(mode, 0o600); return 91; },
        fsyncSync() { fsyncs++; }, closeSync() { closes++; } },
      spawn() { return child; }, killGroup() { assert.fail('normal close must not signal'); } });
  child.exit(); child.close();
  const observed = await pending; assert.equal(closes, 1); assert.equal(fsyncs, 1);
  assert.deepEqual(observed, successfulProcess(step)); return observed;
}
const observedProcesses = { configure: await observedSuccessProcess('configure'), make: await observedSuccessProcess('make') };
await check('both actual lifecycle bodies feed final records without manufacturing group completion', async () => {
  const input = finalValue('x64'); input.processLifecycle = observedProcesses;
  const result = final.buildFinalRecords(input);
  assert.deepEqual(result.provenance.process_lifecycle, observedProcesses);
  assert.equal(result.provenance.process_lifecycle.configure.group_end_confirmed, false);
  assert.equal(result.provenance.process_lifecycle.make.group_end_confirmed, false);
});
await check('actual Main commit block binds both returned DTOs before provenance and final marker; invalid DTO writes neither', async () => {
  const start = driver.indexOf('    const records = buildFinalRecords({');
  const end = driver.indexOf('    return evidence;', start); assert.ok(start > 0 && end > start);
  async function commit(processes, abortAtFinal = false) {
    const input = finalValue('arm64'), writes = [], log = { configure: Buffer.from('configure model'), make: Buffer.from('make model'), db: Buffer.from('database model') };
    const job = '/model/job', converter = job + '/official/bin/node';
    const available = new Map([[job + '/configure.log', log.configure], [job + '/make.log', log.make], [job + '/official/LICENSE', Buffer.from('converter license')]]);
    const context = { options: { arch: 'arm64', jobs: 2 }, finalInputs: input.inputs, finalPrepared: input.prepared,
      configureProcess: processes.configure, makeProcess: processes.make,
      inspection: { tools: { xcode: input.toolchain.xcode, sdkVersion: input.toolchain.sdk, clangVersion: input.toolchain.clang },
        pythonFacts: { python: input.toolchain.python }, toolIdentities: { clang: { sha256: input.toolchain.clang_sha256 } } },
      pythonSha256: input.toolchain.python_sha256, unsigned: input.unsigned, core: input.core,
      converterAfter: input.converter, converter, pin: input.converter.archive_sha256, licenseBytes: Buffer.from('model license'), database: log.db,
      plan: { job, output: job + '/datasecure-core', provenance: job + '/BUILD-PROVENANCE.json', final_manifest: job + '/FINAL-CORE.json' },
      PINS: contract.PINS, PATCHED: contract.PATCHED, checks: { source_model: true }, path: path.posix,
      sha256: contract.sha256, canonicalBytes: final.canonicalBytes, buildFinalRecords: final.buildFinalRecords,
      readFileBounded(file) { assert.ok(available.has(file), 'only model log/license bytes'); return available.get(file); },
      writeFresh(file, bytes) { writes.push({ file, bytes }); }, writeEvidence(job, name, value) { writes.push({ file: job + '/' + name, value }); },
      abort: { signal: { aborted: false } },
      checkPrivateParent() {}, revalidatePythonIdentity() { return input.toolchain.python_sha256; },
      binaryRecord() { if (abortAtFinal) context.abort.signal.aborted = true; return input.core; }, fail: contract.fail };
    let failure;
    try { await vm.runInNewContext('(async()=>{' + driver.slice(start, end) +
      '\nthis.records = records; this.evidence = evidence;})()', context, { timeout: 1000 }); }
    catch (error) { failure = error; }
    return { context, writes, failure };
  }
  const good = await commit(observedProcesses); assert.equal(good.failure, undefined);
  assert.deepEqual(good.writes.map(entry => path.posix.basename(entry.file)), ['BUILD-PROVENANCE.json', 'BUILD-CANDIDATE.json', 'FINAL-CORE.json']);
  const provenance = JSON.parse(good.writes[0].bytes), artifact = JSON.parse(good.writes[2].bytes);
  assert.deepEqual(provenance.process_lifecycle, observedProcesses);
  assert.equal(artifact.build.provenance_sha256, final.digest(final.canonicalBytes(provenance)));
  assert.equal(good.context.evidence.process_lifecycle, good.context.records.provenance.process_lifecycle);
  assert.equal(good.context.evidence.group_end_confirmed, false);
  assert.equal(good.context.evidence.mac_runtime_certified, false); assert.equal(good.context.evidence.product_trusted_attestation, false);
  assert.equal(good.context.evidence.status, 'SEALED_FINAL_BYTES_NOT_APPROVED');
  const broken = await commit({ configure: { ...observedProcesses.configure, close_seen: false }, make: observedProcesses.make });
  assert.equal(broken.failure.code, 'FINAL_CORE_PROCESS_LIFECYCLE_INVALID'); assert.equal(broken.writes.length, 0);
  const aborted = await commit(observedProcesses, true);
  assert.equal(aborted.failure.code, 'BUILD_ABORTED');
  assert.deepEqual(aborted.writes.map(entry => path.posix.basename(entry.file)), ['BUILD-PROVENANCE.json', 'BUILD-CANDIDATE.json']);
  assert.deepEqual(Object.keys(provenance.process_lifecycle).sort(), ['configure', 'make']);
});

// Fixed-tool liveness models: actual helper, no child/tool/signals/filesystem.
function toolScenario(configure = () => {}, input) {
  const child = new Child(), controller = new AbortController(), active = new Set(), kills = [];
  const state = { destroys: 0, unrefs: 0, spawns: 0, received: null };
  for (const name of ['stdout', 'stderr', 'stdin']) {
    const stream = child[name] = new EventEmitter();
    stream.destroy = () => { state.destroys++; }; stream.unref = () => { state.unrefs++; };
  }
  child.stdin.end = bytes => { state.received = Buffer.from(bytes); queueMicrotask(() => child.stdin.emit('finish')); };
  child.kill = value => { kills.push(value); return true; };
  const options = { signal: controller.signal, label: 'read', timeoutMs: 150, maximum: 64, input };
  const model = { reapMs: 10, spawn(executable, args, selected) {
    state.spawns++; assert.equal(executable, '/fixed/tool'); assert.equal(selected.shell, false);
    assert.equal(selected.env.AMBIENT, undefined); assert.equal(selected.detached, undefined);
    assert.deepEqual(selected.stdio, [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']); return child;
  }, setTimeout(callback, ms) {
    const timer = timers.setTimeout(() => { active.delete(timer); callback(); }, ms); active.add(timer); return timer;
  }, clearTimeout(timer) { timers.clearTimeout(timer); active.delete(timer); } };
  configure({ child, controller, options, model, state, kills });
  let value, error;
  const end = realHelper.runProducerTool({ executable: '/fixed/tool', args: ['--fixed'], cwd: '/private/job' },
    { LANG: 'C' }, options, model).then(result => { value = result; }, failure => { error = failure; });
  return { child, controller, options, model, state, kills, active, end,
    get value() { return value; }, get error() { return error; }, get record() { return realHelper.producerToolFailure(error); },
    clean() { for (const timer of active) timers.clearTimeout(timer); active.clear(); } };
}
async function toolCase(name, body, configure, input) {
  await check('fixed-tool: ' + name, async () => { const s = toolScenario(configure, input); try { await body(s); } finally { s.clean(); } });
}
await toolCase('normal matching close yields bounded byte buffers, not a group claim', async s => {
  s.child.stdout.emit('data', Buffer.from('ok ')); s.child.stderr.emit('data', Buffer.from('warn'));
  s.child.stdout.emit('data', Buffer.from('ä')); s.child.exit(); await tick(); assert.equal(s.value, undefined);
  s.child.close(); await s.end; assert.equal(s.error, undefined); assert.equal(s.value.stdout.toString(), 'ok ä');
  assert.equal(s.value.stderr.toString(), 'warn'); assert.equal(s.value.observation.child_end_confirmed, true);
  assert.equal(s.value.observation.group_end_confirmed, false); assert.equal(s.active.size, 0); assert.equal(s.kills.length, 0);
});
for (const mode of ['sent', 'false', 'throw']) await toolCase('deadline + ' + mode + ' kill is one bounded attempt, never a reap ACK', async s => {
  await s.end; assert.equal(s.error.code, 'PRODUCER_TOOL_DEADLINE'); assert.equal(s.record.cause, 'deadline');
  assert.equal(s.record.child_end_confirmed, false); assert.equal(s.record.group_end_confirmed, false);
  assert.deepEqual(s.kills, ['SIGKILL']); assert.equal(s.child.detached, true); assert.equal(s.state.destroys, 3);
  assert.equal(s.record.kill_result, mode === 'sent' ? 'sent' : 'failed');
  assert.doesNotThrow(() => s.child.stderr.emit('error', Error('late pipe')));
}, ({ options, child, kills }) => { options.timeoutMs = 4; child.kill = value => {
  kills.push(value); if (mode === 'throw') throw Object.assign(Error('PRIVATE'), { code: 'EPERM' }); return mode === 'sent';
}; });
await toolCase('exit without close is bounded and never signals the exited Child', async s => {
  s.child.exit(); await s.end; assert.equal(s.error.code, 'PRODUCER_TOOL_END_UNCONFIRMED');
  assert.equal(s.record.child_end_confirmed, false); assert.equal(s.kills.length, 0); assert.equal(s.child.detached, true);
});
await toolCase('abort stops once and remains primary through matching forced close', async s => {
  s.controller.abort(); s.controller.abort(); s.child.exit(null, 'SIGKILL'); s.child.close(); await s.end;
  assert.equal(s.error.code, 'BUILD_ABORTED'); assert.equal(s.record.child_end_confirmed, true); assert.deepEqual(s.kills, ['SIGKILL']);
});
await toolCase('combined stdout+stderr bound refuses before retaining the overflowing chunk', async s => {
  s.child.stdout.emit('data', Buffer.alloc(5)); s.child.stderr.emit('data', Buffer.alloc(4));
  s.child.exit(null, 'SIGKILL'); s.child.close(); await s.end;
  assert.equal(s.error.code, 'PRODUCER_TOOL_OUTPUT_LIMIT'); assert.equal(s.record.stdout_bytes, 5); assert.equal(s.record.stderr_bytes, 0);
  assert.equal(s.value, undefined); assert.equal(s.error.stdout, undefined); assert.deepEqual(s.kills, ['SIGKILL']);
}, ({ options }) => { options.maximum = 8; });
await toolCase('stream error is closed and cannot become success after exit zero', async s => {
  s.child.stdout.emit('error', Object.assign(Error('PRIVATE'), { code: 'EIO' })); s.child.exit(); s.child.close(); await s.end;
  assert.equal(s.error.code, 'PRODUCER_TOOL_STREAM_FAILED'); assert.equal(s.record.cause, 'stream_error'); assert.equal(s.record.child_end_confirmed, true);
});
await toolCase('binary stdin must finish before close; all bytes stay unchanged', async s => {
  await tick(); assert.ok(s.state.received.equals(Buffer.from([0, 255, 1])));
  s.child.exit(); s.child.close(); await s.end; assert.equal(s.error, undefined); assert.equal(s.value.observation.stdin_finished, true);
}, undefined, Buffer.from([0, 255, 1]));
await toolCase('unfinished stdin cannot certify a normal child', async s => {
  s.child.exit(); s.child.close(); await s.end; assert.ok(s.error); assert.equal(s.record.stdin_finished, false);
}, ({ child }) => { child.stdin.end = () => {}; }, Buffer.from('input'));
await toolCase('spawn throw is fixed, starts no alternative tool and claims no close', async s => {
  await s.end; assert.equal(s.error.code, 'PRODUCER_TOOL_FAILED'); assert.equal(s.record.spawned, false);
  assert.equal(s.record.child_end_confirmed, false); assert.equal(s.kills.length, 0);
}, ({ model }) => { model.spawn = () => { throw Object.assign(Error('PRIVATE'), { code: 'EACCES' }); }; });
await toolCase('timer creation failure kills at most once and detaches, without hanging', async s => {
  await s.end; assert.ok(s.error); assert.equal(s.record.child_end_confirmed, false); assert.equal(s.kills.length, 1);
}, ({ model }) => { model.setTimeout = () => { throw Error('PRIVATE timer'); }; });
await toolCase('timer cancellation failure cannot return buffers as success', async s => {
  s.child.exit(); s.child.close(); await s.end; assert.ok(s.error); assert.equal(s.record.timer_cleanup_failed, true);
  assert.equal(s.record.child_end_confirmed, true); for (const timer of s.active) assert.equal(timer.hasRef(), false);
}, ({ model }) => { model.clearTimeout = () => { throw Error('PRIVATE cancel'); }; });
await check('fixed-tool: preaborted and invalid contracts never spawn', async () => {
  const c = new AbortController(); c.abort(); let calls = 0;
  await assert.rejects(realHelper.runProducerTool({ executable: '/fixed/tool', args: [], cwd: '/private' }, {},
    { signal: c.signal, label: 'read' }, { spawn() { calls++; } }), { code: 'BUILD_ABORTED' });
  await assert.rejects(realHelper.runProducerTool({ executable: 'relative', args: [], cwd: '/private' }, {},
    { signal: new AbortController().signal, label: 'read' }, { spawn() { calls++; } }), { code: 'PRODUCER_TOOL_ARGUMENT_INVALID' });
  assert.equal(calls, 0);
});

// Caller models execute the actual private source bodies. Tool/filesystem
// dependencies are explicit RAM spies, not evidence of native Darwin tools.
function actualDriverBlock(startMarker, endMarker) {
  const start = driver.indexOf(startMarker), end = driver.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start); assert.equal(driver.lastIndexOf(startMarker), start);
  return driver.slice(start, end);
}
await check('fixed-tool callers: actual reader yields, preserves bytes/primary and supplies the bounded tool contract', async () => {
  let settle, calls = 0;
  const signal = new AbortController().signal, environment = Object.freeze({ LANG: 'C' });
  const context = { basicEnv: environment, runProducerTool(step, env, options) {
    calls++; assert.deepEqual(JSON.parse(JSON.stringify(step)), { executable: '/fixed/tool', args: ['--fixed'], cwd: '/private/job' });
    assert.equal(env, environment); assert.equal(options.signal, signal); assert.equal(options.label, 'read');
    assert.equal(options.timeoutMs, 20000); assert.equal(options.maximum, 8 * 1024 * 1024);
    return new Promise(resolve => { settle = resolve; });
  } };
  vm.runInNewContext(actualDriverBlock('async function execRead(', 'function syncParent(') + '\nthis.run = execRead;', context);
  let completed = false;
  const result = context.run('/fixed/tool', ['--fixed'], signal, environment, '/private/job').then(value => { completed = true; return value; });
  await tick(); assert.equal(completed, false); assert.equal(calls, 1);
  settle({ stdout: Buffer.from(' \u00e4 result\n') }); assert.equal(await result, '\u00e4 result');
  const primary = Object.assign(Error('fixed'), { code: 'PRODUCER_TOOL_DEADLINE' });
  context.runProducerTool = async () => { throw primary; };
  await assert.rejects(context.run('/fixed/tool', [], signal), error => error === primary);
});
await check('fixed-tool callers: actual source extraction awaits its one bounded tool before reading the extracted tree', async () => {
  const signal = new AbortController().signal, events = []; let release;
  const context = { job: '/private/job', archive: '/private/job/inputs/node.tar.xz', signal, basicEnv: Object.freeze({ LANG: 'C' }),
    async tarMembers(archive, prefix, selected) { assert.equal(selected, signal); events.push('members'); return [prefix + '/file']; },
    async execRead(exe, args, selected) { assert.equal(selected, signal); assert.deepEqual(Array.from(args), ['-tvf', context.archive]); events.push('listing'); return '-rw file'; },
    runProducerTool(step, env, options) {
      assert.equal(step.executable, '/usr/bin/tar'); assert.equal(step.cwd, context.job);
      assert.deepEqual(Array.from(step.args), ['-xf', context.archive, '-C', context.job + '/source']);
      assert.equal(env, context.basicEnv); assert.equal(options.signal, signal); assert.equal(options.label, 'source_extract');
      assert.equal(options.timeoutMs, 60000); assert.equal(options.maximum, 1024 * 1024);
      events.push('extract'); return new Promise(resolve => { release = resolve; });
    }, fail: contract.fail, after() { events.push('after'); } };
  const body = actualDriverBlock("  const members = await tarMembers(archive, 'node-v22.23.2', signal);", "  const root = job + '/source/node-v22.23.2';");
  const pending = vm.runInNewContext('(async()=>{' + body + '\nafter();})()', context);
  await tick(); assert.deepEqual(events, ['members', 'listing', 'extract']);
  release({ stdout: Buffer.alloc(0) }); await pending; assert.deepEqual(events, ['members', 'listing', 'extract', 'after']);
  const primary = Object.assign(Error('fixed'), { code: 'PRODUCER_TOOL_END_UNCONFIRMED' });
  context.runProducerTool = async () => { throw primary; }; events.length = 0;
  await assert.rejects(vm.runInNewContext('(async()=>{' + body + '\nafter();})()', context), error => error === primary);
  assert.deepEqual(events, ['members', 'listing']);
});
await check('fixed-tool callers: actual converter awaits listings/extraction and writes only the two exact binary members', async () => {
  const signal = new AbortController().signal, writes = [], calls = [], prefix = 'node-v22.23.2-darwin-arm64';
  const bytes = Buffer.from('archive model'), nodeBytes = Buffer.from([0, 255, 1]), licenseBytes = Buffer.from('license model');
  const context = { fileLimit: 128 * 1024 * 1024, basicEnv: Object.freeze({ LANG: 'C' }), fail: contract.fail,
    writeFresh(file, value, mode) { writes.push({ file, value: Buffer.from(value), mode }); }, mkdirFresh() {},
    async execRead(exe, args, selected) {
      assert.equal(exe, '/usr/bin/tar'); assert.equal(selected, signal); await tick();
      return args[0] === '-tf' ? prefix + '/bin/node\n' + prefix + '/LICENSE' : '-rw MODEL_ONLY';
    }, async runProducerTool(step, env, options) {
      const before = writes.length; assert.equal(env, context.basicEnv); assert.equal(options.signal, signal);
      assert.equal(options.label, 'converter_extract'); assert.equal(options.maximum, 128 * 1024 * 1024); assert.equal(options.timeoutMs, 20000);
      assert.equal(step.executable, '/usr/bin/tar'); assert.equal(step.cwd, '/private/job');
      assert.equal(step.args[0], '-xOf'); assert.equal(step.args[1], '/private/job/inputs/' + prefix + '.tar.gz');
      calls.push(step.args[2]); await tick(); assert.equal(writes.length, before, 'no unawaited member may be written');
      return { stdout: step.args[2].endsWith('/bin/node') ? nodeBytes : licenseBytes };
    } };
  vm.runInNewContext(actualDriverBlock('async function tarMembers(', 'async function prepareSource(') +
    actualDriverBlock('async function prepareConverter(', 'async function runBuildStep(') + '\nthis.run = prepareConverter;', context);
  assert.equal(await context.run('/private/job', { arch: 'arm64' }, bytes, signal), '/private/job/official-converter/' + prefix + '/bin/node');
  assert.deepEqual(calls, [prefix + '/bin/node', prefix + '/LICENSE']);
  assert.deepEqual(writes.map(entry => entry.file), ['/private/job/inputs/' + prefix + '.tar.gz',
    '/private/job/official-converter/' + prefix + '/bin/node', '/private/job/official-converter/' + prefix + '/LICENSE']);
  assert.ok(writes[0].value.equals(bytes)); assert.ok(writes[1].value.equals(nodeBytes)); assert.ok(writes[2].value.equals(licenseBytes));
  assert.equal(writes[1].mode, 0o700); assert.equal(writes[2].mode, 0o600);
});
await check('fixed-tool callers: actual sealing sequence awaits all five calls and reads details from stderr with unchanged plist input', async () => {
  const signal = new AbortController().signal, calls = [], sealing = final.finalSealPlan('/private/job/datasecure-core', '/private/job');
  const entitlementBytes = Buffer.from(final.ENTITLEMENTS_XML), details = 'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+1\nSignature=adhoc\n';
  const context = { plan: { job: '/private/job' }, sealing, abort: { signal }, basicEnv: Object.freeze({ LANG: 'C' }),
    assertSealDetails: final.assertSealDetails,
    async runProducerTool(step, env, options) {
      assert.equal(step.cwd, context.plan.job); assert.equal(env, context.basicEnv); assert.equal(options.signal, signal);
      assert.equal(options.timeoutMs, 20000); assert.equal(options.maximum, 1024 * 1024);
      const index = calls.length; calls.push(Array.from(step.args)); await tick(); assert.equal(calls.length, index + 1, 'no parallel/unawaited seal launch');
      assert.equal(options.label, index === 2 ? 'seal_details' : 'seal');
      if (index === 2) return { stdout: Buffer.from('not the seal details'), stderr: Buffer.from(details) };
      if (index === 3) return { stdout: entitlementBytes };
      if (index === 4) { assert.ok(options.input.equals(entitlementBytes)); return { stdout: Buffer.from(JSON.stringify(final.ENTITLEMENTS)) }; }
      assert.equal(options.input, undefined); return { stdout: Buffer.alloc(0) };
    } };
  await vm.runInNewContext('(async()=>{' + actualDriverBlock('    const runSealTool = async', '    const sealedRecord =') + '})()', context);
  assert.deepEqual(calls, [sealing.sign, sealing.verify, sealing.details, sealing.entitlementsRead, sealing.plist].map(step => step.args));
});
await check('fixed-tool callers: actual candidate evidence awaits every role probe; a tool failure cannot produce candidate evidence', async () => {
  const signal = new AbortController().signal, environment = Object.freeze({ LANG: 'C' }), calls = [];
  const tools = { lipo: '/tools/lipo', nm: '/tools/nm', otool: '/tools/otool' }, core = '/private/core', converter = '/private/converter';
  const context = { fail: contract.fail, async execRead(exe, args, selected, env) {
    assert.equal(selected, signal); assert.equal(env, environment); const before = calls.length; calls.push(exe); await tick();
    assert.equal(calls.length, before + 1, 'no parallel/unawaited role probe');
    if (exe === tools.lipo) return 'arm64';
    if (exe === tools.nm) return '00000000 T _datasecure_ownership_guard_napi_init';
    if (exe === tools.otool) return core + ':\n /usr/lib/libSystem.B.dylib (compatibility version 1.0.0)';
    return JSON.stringify({ version: 'v22.23.2', arch: 'arm64', abi: exe === core ? 1 : null, methods: exe === core });
  } };
  vm.runInNewContext(actualDriverBlock('async function candidateEvidence(', 'export async function main(') + '\nthis.run = candidateEvidence;', context);
  const evidence = await context.run(core, converter, { arch: 'arm64' }, tools, environment, signal);
  assert.equal(evidence.coreProbe.abi, 1); assert.equal(evidence.converterProbe.abi, null);
  assert.deepEqual(calls, [tools.lipo, tools.nm, tools.otool, core, converter]);
  const primary = Object.assign(Error('fixed'), { code: 'PRODUCER_TOOL_DEADLINE' });
  context.execRead = async () => { throw primary; };
  await assert.rejects(context.run(core, converter, { arch: 'arm64' }, tools, environment, signal), error => error === primary);
});

console.log(JSON.stringify({ schema: 'mac-static-core-producer-source-model-test/3', node: process.version,
  passed, failed: 0, native_macos: 'NOT_RUN', native_build: 'NOT_RUN', actual_signals: 'NONE',
  artifact_approval: 'NONE', filesystem_writes: 'NONE', results }, null, 2));
