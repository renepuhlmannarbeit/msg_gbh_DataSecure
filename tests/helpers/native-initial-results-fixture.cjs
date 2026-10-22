'use strict';
// Shared native fixture, OUTSIDE the package. Every product import below is
// from the caller's unchanged package server. No ownership API is substituted.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = stat => [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)];
const failure = () => Object.assign(Error('NATIVE_INITIAL_RESULTS_FAILED'), { code: 'NATIVE_INITIAL_RESULTS_FAILED' });
// TEST-OWNED PRECONDITION, not a native/Tauri provisioning acknowledgement.
// The Windows caller has already restricted this entirely new synthetic parent.
// Use the unchanged package's ordinary setting writer and receipt reader; never
// substitute an ownership API, relax required(), or repair an existing ACL.
function prepareWindowsFixtureResultRoot(server, root) {
  const bound = require(path.join(server, 'core/bound-file-io.js'));
  const config = require(path.join(server, 'gateway/result-folder-config.js'));
  const receipts = require(path.join(server, 'gateway/initial-output-binding.js'));
  const rootBinding = bound.bindDirectory(root); bound.assertDirectory(rootBinding);
  const exact = named => {
    const stat = fs.lstatSync(named, { bigint: true });
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    return { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) };
  };
  for (const child of ['DataSecure-Markdown', 'DataSecure-Output']) {
    const named = path.join(root, child);
    assert.equal(fs.existsSync(named), false); fs.mkdirSync(named, { mode: 0o700 });
  }
  config.saveConfiguredResultRoot(root);
  const settings = bound.readBoundFile(config.configPath(), { minimum: 1, maximum: 128 * 1024 });
  const settingSha256 = digest(settings);
  const binding = { schema: 'datasecure-initial-output-binding/1', root, root_identity: exact(root),
    markdown_identity: exact(path.join(root, 'DataSecure-Markdown')), output_identity: exact(path.join(root, 'DataSecure-Output')) };
  receipts.assertBinding(binding); bound.assertDirectory(rootBinding);
  const target = receipts.receiptPath(root);
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, JSON.stringify({ schema: receipts.SCHEMA, setting_sha256: settingSha256, binding }),
    { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const receipt = receipts.readReceipt(root, { required: true });
  assert.equal(receipt.setting_sha256, settingSha256); assert.deepEqual(receipt.binding, binding);
  assert.deepEqual(bound.readBoundFile(config.configPath(), { minimum: 1, maximum: 128 * 1024 }), settings);
  receipts.assertBinding(binding); bound.assertDirectory(rootBinding);
  return { initial_output_admission: 'TEST_OWNED_PRECONDITION', tauri_native_provisioning: 'NOT_RUN' };
}
function runNativeInitialResults(options) {
  if (!options || Object.keys(options).sort().join(',') !== 'scope,server' ||
      !['win32', 'darwin'].includes(process.platform) || process.version !== 'v22.23.2' ||
      (process.platform === 'win32' ? process.arch !== 'x64' : !['arm64', 'x64'].includes(process.arch)) ||
      process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1' || globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true ||
      ![options.scope, options.server].every(value => typeof value === 'string' && path.isAbsolute(value) &&
        path.resolve(value) === value && !/[\0\r\n]/u.test(value)) ||
      !/^datasecure-(?:windows-ownership-load-|macos-static-native-)/u.test(path.basename(options.scope))) throw failure();
  const target = process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`;
  const executable = process.platform === 'win32'
    ? path.join(path.dirname(options.server), 'datasecure-core-x86_64-pc-windows-msvc.exe')
    : path.join(path.dirname(path.dirname(options.server)), 'MacOS/datasecure-core');
  assert.equal(fs.realpathSync.native(process.execPath), fs.realpathSync.native(executable));
  assert.equal(JSON.stringify(process.execArgv), JSON.stringify(['--require', path.join(options.server, 'network-deny.cjs')]));
  const bound = require(path.join(options.server, 'core/bound-file-io.js'));
  const outer = bound.bindDirectory(options.scope); bound.assertDirectory(outer);
  assert.equal(outer.real, options.scope);
  const serverBinding = bound.bindDirectory(options.server); bound.assertDirectory(serverBinding);
  const control = require(path.join(options.server, 'core/ownership-control.js'));
  control.assertNativeOwnershipRuntime();
  const artifact = process.platform === 'win32'
    ? { schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8, target,
        path: path.join(options.server, 'native/windows-x64/ownership-guard.node'),
        sha256: process.env.DATASECURE_OWNERSHIP_GUARD_SHA256 }
    : { schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8, target,
        core_sha256: process.env.DATASECURE_MACOS_STATIC_CORE_SHA256 };
  const { createOwnershipGuard } = require(path.join(options.server, 'core/native-ownership-guard.js'));
  const own = path.join(options.scope, 'initial-results');
  assert.equal(fs.existsSync(own), false); fs.mkdirSync(own, { mode: 0o700 });
  const ownBinding = bound.bindDirectory(own);
  const resultRoot = path.join(own, 'results');
  const overrides = { EU_PRIVACY_DATA_ROOT: path.join(own, 'private'), EU_PRIVACY_ROOT: path.join(own, 'workspace'),
    EU_PRIVACY_RESULT_ROOT: process.platform === 'win32' ? '' : resultRoot };
  const saved = new Map(Object.keys(overrides).map(key => [key, process.env[key]]));
  let liveCapability = false, completed = false;
  // No child, Worker, timer or async operation is started by this fixture.
  function locked(callback) {
    const factory = createOwnershipGuard({ root: destination.output.path, verifiedArtifact: artifact });
    let guard, failed = false, primary, result;
    try {
      guard = factory.tryAcquire(); assert.ok(guard); liveCapability = true;
      assert.equal(guard.assertHeld(), true); result = callback(); assert.equal(guard.assertHeld(), true);
    } catch (error) { failed = true; primary = error; }
    finally {
      try { if (guard) assert.equal(guard.release(), true); }
      catch (error) { if (!failed) { failed = true; primary = error; } }
      try { assert.equal(factory.close(), true); if (!failed) liveCapability = false; }
      catch (error) { if (!failed) { failed = true; primary = error; } }
    }
    if (failed) throw primary;
    return result;
  }
  function countMkdir(callback) {
    const original = fs.mkdirSync; let calls = 0;
    fs.mkdirSync = function (named, ...args) {
      const candidate = path.resolve(String(named));
      if (candidate === visible || candidate.startsWith(visible + path.sep)) calls++;
      return original.call(this, named, ...args);
    };
    try { callback(); return calls; } finally { fs.mkdirSync = original; }
  }
  let destination, visible, admissionProof;
  try {
    Object.assign(process.env, overrides);
    fs.mkdirSync(resultRoot, { mode: 0o700 });
    const { roots } = require(path.join(options.server, 'gateway/common.js'));
    const exporter = require(path.join(options.server, 'gateway/result-export.js')), io = exporter._test;
    assert.equal(exporter.RESULT_LAYOUT, 'datasecure-visible-markdown/1');
    const packageRoot = roots().output, originals = [], items = [];
    if (process.platform === 'win32') admissionProof = prepareWindowsFixtureResultRoot(options.server, resultRoot);
    const id = crypto.randomBytes(32).toString('hex');
    for (let index = 1; index <= 2; index++) {
      const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
      const bytes = Buffer.from(`# Synthetischer nativer Fall ${index}\n[PERSON_001] bearbeitet ${index} Projekte.\n`);
      const source = path.join(own, `original-${index}.txt`); fs.writeFileSync(source, bytes, { flag: 'wx', mode: 0o600 });
      originals.push({ source, bytes, identity: identity(fs.lstatSync(source, { bigint: true })) });
      const directory = path.join(packageRoot, packageId); fs.mkdirSync(directory, { mode: 0o700 });
      fs.writeFileSync(path.join(directory, `${packageId}.md`), bytes, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/2',
        package_id: packageId, profile: 'general', created_at: '2026-10-20T01:00:00.000Z',
        document: `${packageId}.md`, document_sha256: digest(bytes), assets: [] }), { flag: 'wx', mode: 0o600 });
      items.push({ package_id: packageId, file: index === 1 ? 'Dokument_01.md' : 'Unterordner/Dokument_02.md',
        sha256: digest(bytes), source_label: `original-${index}.txt` });
    }
    const record = { schema: exporter.SCHEMA, result_layout: exporter.RESULT_LAYOUT, batch_id: id,
      run_directory: `Lauf-20261020-010000-${id.slice(-8)}`, product_channel: 'standalone',
      processing_mode: 'markdown-and-anonymize', destination_id: '', complete: false, items };
    destination = io.activeDestination(record); record.destination_id = destination.id;
    visible = path.join(destination.output.path, record.run_directory);
    assert.equal(destination.output.exact, true);
    const progress = io.initialProgress(record, destination);
    const attempt = `directory-attempt-${digest(record.run_directory)}.json`;
    const refused = locked(() => countMkdir(() => {
      assert.throws(() => io.ensurePlainDirectory(destination, record.run_directory, progress), { code: 'OWNERSHIP_GUARD_BUSY' });
    }));
    assert.equal(refused, 0); assert.equal(fs.existsSync(visible), false); assert.equal(progress.read(attempt), null);
    let run;
    const created = countMkdir(() => {
      run = io.ensurePlainDirectory(destination, record.run_directory, progress);
      for (const item of items) assert.equal(io.exportOne(destination, run, item, undefined, record, progress), true);
    });
    assert.equal(created, 2);
    const before = items.map(item => identity(fs.lstatSync(path.join(run.path, item.file), { bigint: true })));
    const reopened = locked(() => countMkdir(() => {
      const nextDestination = io.activeDestination(record, { create: false });
      const nextProgress = io.initialProgress(record, nextDestination);
      const nextRun = io.ensurePlainDirectory(nextDestination, record.run_directory, nextProgress);
      for (const [index, item] of items.entries()) {
        assert.equal(io.exportOne(nextDestination, nextRun, item, undefined, record, nextProgress), false);
        assert.deepEqual(io.inspectInitialLeaf(nextProgress, nextRun, item).bytes, originals[index].bytes);
        assert.deepEqual(identity(fs.lstatSync(path.join(nextRun.path, item.file), { bigint: true })), before[index]);
      }
    }));
    assert.equal(reopened, 0);
    assert.deepEqual(fs.readdirSync(destination.output.path).sort(), [record.run_directory, 'ownership-control.lock'].sort());
    assert.deepEqual(fs.readdirSync(run.path).sort(), ['Dokument_01.md', 'Unterordner']);
    assert.deepEqual(fs.readdirSync(path.join(run.path, 'Unterordner')), ['Dokument_02.md']);
    const lock = fs.lstatSync(path.join(destination.output.path, 'ownership-control.lock'), { bigint: true });
    assert.ok(lock.isFile() && !lock.isSymbolicLink() && lock.size === 0n && lock.nlink === 1n);
    for (const original of originals) {
      assert.deepEqual(fs.readFileSync(original.source), original.bytes);
      assert.deepEqual(identity(fs.lstatSync(original.source, { bigint: true })), original.identity);
    }
    assert.equal(liveCapability, false); bound.assertDirectory(outer); bound.assertDirectory(ownBinding);
    bound.assertDirectory(serverBinding); completed = true;
  } finally {
    for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  assert.ok(completed && !liveCapability);
  // Entirely new synchronous scope only, after all native release/close proofs.
  // Preflight every exact entry before removal; no recursive rm/following links,
  // external path cleanup or cleanup following a failed/uncertain operation.
  const entries = [];
  function inspect(named) {
    const relative = path.relative(own, named); assert.ok(relative === '' || relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.ok(entries.length < 128); const stat = fs.lstatSync(named, { bigint: true });
    assert.ok(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()));
    assert.ok(stat.isDirectory() || stat.nlink === 1n);
    const children = stat.isDirectory() ? fs.readdirSync(named).sort() : null;
    entries.push({ named, identity: identity(stat), directory: stat.isDirectory(), children,
      sha256: stat.isFile() ? digest(fs.readFileSync(named)) : null });
    for (const child of children || []) inspect(path.join(named, child));
  }
  inspect(own); bound.assertDirectory(outer); bound.assertDirectory(ownBinding);
  for (const entry of entries) {
    const stat = fs.lstatSync(entry.named, { bigint: true }); assert.deepEqual(identity(stat), entry.identity);
    assert.equal(stat.isSymbolicLink(), false); assert.equal(stat.isDirectory(), entry.directory);
    if (entry.directory) assert.deepEqual(fs.readdirSync(entry.named).sort(), entry.children);
    else { assert.equal(stat.nlink, 1n); assert.equal(digest(fs.readFileSync(entry.named)), entry.sha256); }
  }
  for (const entry of entries.reverse()) {
    bound.assertDirectory(outer); assert.deepEqual(identity(fs.lstatSync(entry.named, { bigint: true })), entry.identity);
    if (entry.directory) { assert.deepEqual(fs.readdirSync(entry.named), []); fs.rmdirSync(entry.named); }
    else fs.unlinkSync(entry.named);
  }
  assert.equal(fs.existsSync(own), false); bound.assertDirectory(outer);
  return { schema: 'datasecure-native-initial-results/1', target, native_output_guard: true,
    ...(admissionProof || {}),
    refused_guard_mkdirs: 0, refused_guard_attempt_absent: true, created_directories: 2, written_documents: 2,
    read_only_reopen_under_output_lock: true, reopen_mkdirs: 0, exact_visible_markdown_inventory: true,
    lock_only_in_output_container: true, original_inputs_unchanged: true, fixture_cleanup_confirmed: true };
}
module.exports = Object.freeze({ runNativeInitialResults });
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--server' || args[2] !== '--scope') throw failure();
    console.log(JSON.stringify(runNativeInitialResults({ server: args[1], scope: args[3] })));
  } catch (error) {
    const codes = new Set(['NATIVE_INITIAL_RESULTS_FAILED', 'RESULT_ROOT_UNSAFE', 'STANDALONE_RESULT_ROOT_UNSAFE',
      'STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'OWNERSHIP_GUARD_BUSY']);
    let fixturePreserved = false;
    try {
      const args = process.argv.slice(2), scope = args[3];
      if (args.length === 4 && args[0] === '--server' && args[2] === '--scope' && path.isAbsolute(scope) &&
          /^datasecure-(?:windows-ownership-load-|macos-static-native-)/u.test(path.basename(scope))) {
        const stat = fs.lstatSync(path.join(scope, 'initial-results'));
        fixturePreserved = stat.isDirectory() && !stat.isSymbolicLink();
      }
    } catch { /* no existing synthetic fixture was confirmed */ }
    console.error(JSON.stringify({ schema: 'datasecure-native-initial-results/1', native_status: 'FAILED',
      ...(process.platform === 'win32' ? { phase: 'initial_result_output_guard',
        error_code: codes.has(error?.code) ? error.code : 'NATIVE_INITIAL_RESULTS_FAILED', fixture_preserved: fixturePreserved } : {}) }));
    process.exitCode = 1;
  }
}
