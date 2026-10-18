'use strict';
// Explicit Windows-only artifact-bound native gate, never a default/source-CI test.
// Real C contention; no product overlay, document pipeline or GUI acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const repo = path.resolve(__dirname, '..');
const helperRelative = 'tests/helpers/native-ownership-epoch-release-fixture.cjs';
const holderRelative = 'tests/helpers/native-ownership-guard-child.cjs';
const gateway = 'plugins/data-secure/server/gateway/';
const core = 'plugins/data-secure/server/core/';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fixed = code => Object.assign(Error(code), { code });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const { readBoundFile } = require(path.join(repo, core, 'bound-file-io.js'));
const readBounded = (file, maximum) => readBoundFile(file, { maximum, minimum: 1, checkCtime: true });
const savedKeys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'DATASECURE_NATIVE_EXPORT_CHANNEL', 'DATASECURE_OWNERSHIP_GUARD_SHA256'];
const saved = savedKeys.map(key => process.env[key]);
const report = { schema: 'datasecure-native-processing-admission-gate/1',
  platform: process.platform, arch: process.arch, node: process.version, parent_pid: process.pid,
  manifest_path: null, node_sha256: null, native_source_sha256: null, native_artifact_sha256: null,
  sources_before: {}, sources_after: {}, cases: [], child: null, fixture_acl_actions: [],
  native_boundary_pass: false, fixture_cleaned: false,
  document_pipeline_evidence: false, native_gui_evidence: false, darwin_evidence: false };
let assertions = 0, fixture, holder, held = false, holderOpen = false, own, epoch, stage = 'preflight';
const check = (actual, expected, code) => { assertions++; assert.deepEqual(actual, expected, code); };
const sourceFiles = [gateway + 'batch-processing-admission.js', gateway + 'batch-active-lock.js',
  gateway + 'synchronous-ownership-admission.js', gateway + 'result-export.js',
  gateway + 'batch-execution-diagnostic.js', gateway + 'batch-journal-io.js',
  core + 'ownership-control.js', core + 'native-ownership-guard.js', core + 'bound-file-io.js',
  'plugins/data-secure/server/runtime.js', helperRelative, holderRelative];
function sources() {
  return Object.fromEntries(sourceFiles.map(relative => {
    const file = path.join(repo, relative), st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > 1024 * 1024)
      throw fixed('ADMISSION_GATE_SOURCE_UNSAFE');
    const bytes = readBounded(file, 1024 * 1024);
    return [relative, { sha256: hash(bytes), lf_sha256: hash(bytes.toString('utf8').replace(/\r\n/gu, '\n')) }];
  }));
}
async function main() {
  check([process.platform, process.arch, process.version], ['win32', 'x64', 'v22.23.2'], 'ADMISSION_GATE_TARGET');
  check(process.argv.length, 4, 'ADMISSION_GATE_MANIFEST_NODE_SHA_REQUIRED');
  check(/^[a-f0-9]{64}$/u.test(process.argv[3]), true, 'ADMISSION_GATE_TRUSTED_NODE_SHA_REQUIRED');
  const manifestPath = path.resolve(process.argv[2]);
  report.manifest_path = manifestPath;
  report.node_sha256 = hash(readBounded(process.execPath, 128 * 1024 * 1024));
  check(report.node_sha256, process.argv[3], 'ADMISSION_GATE_NODE_PIN');
  const manifestStat = fs.lstatSync(manifestPath);
  check(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.nlink === 1 && manifestStat.size < 65536, true, 'ADMISSION_GATE_MANIFEST_SHAPE');
  const manifestBytes = readBounded(manifestPath, 65536), manifest = JSON.parse(manifestBytes);
  report.manifest_sha256 = hash(manifestBytes);
  check(manifest.schema, 'datasecure-native-ownership-guard-build/1', 'ADMISSION_GATE_MANIFEST_SCHEMA');
  check(manifest.node_headers_version, '22.23.2', 'ADMISSION_GATE_HEADERS_VERSION');
  const cSource = path.join(repo, 'native/ownership-guard/ownership-guard.c');
  report.native_source_sha256 = hash(readBounded(cSource, 1024 * 1024));
  check(manifest.source_sha256, report.native_source_sha256, 'ADMISSION_GATE_MANIFEST_CHECKOUT_C_PIN');
  const artifact = manifest.verified_artifact;
  check([artifact.schema, artifact.abi, artifact.napi, artifact.target], ['datasecure-native-ownership-guard/1', 1, 8, 'windows-x64'], 'ADMISSION_GATE_ABI');
  check(typeof artifact.path === 'string' && path.isAbsolute(artifact.path) && path.resolve(artifact.path) === artifact.path, true, 'ADMISSION_GATE_ARTIFACT_PATH');
  check(/^[a-f0-9]{64}$/u.test(artifact.sha256), true, 'ADMISSION_GATE_ARTIFACT_SHA');
  report.native_artifact_sha256 = hash(readBounded(artifact.path, 4 * 1024 * 1024));
  check(artifact.sha256, report.native_artifact_sha256, 'ADMISSION_GATE_MANIFEST_ARTIFACT_PIN');
  report.sources_before = sources();
  const { configureOwnershipControl, withOwnershipControl } = require(path.join(repo, core, 'ownership-control.js'));
  const { createBatchActiveLock } = require(path.join(repo, gateway, 'batch-active-lock.js'));
  const { createBatchProcessingAdmission, BACKOFF_MS, MAX_WAIT_MS } = require(path.join(repo, gateway, 'batch-processing-admission.js'));
  const { dataRoot } = require(path.join(repo, 'plugins/data-secure/server/runtime.js'));
  const { participant, createPrivateFixture } = require(path.join(repo, helperRelative));
  configureOwnershipControl(artifact); process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
  delete process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
  stage = 'fresh_private_fixture';
  fixture = await createPrivateFixture(); report.fixture_path = fixture.path;
  report.fixture_acl_actions = [{ operation: 'restrict_fresh_own_base_only', path: fixture.path,
    helper: 'createPrivateFixture', preexisting_root_accepted: false }];
  holder = participant(path.join(repo, holderRelative), { rpcMs: 2500, graceMs: 1000, reapMs: 2000 });
  check(Number.isSafeInteger(holder.pid) && holder.pid > 0 && holder.pid !== process.pid, true, 'ADMISSION_GATE_TWO_REAL_PROCESSES');
  report.child_pid = holder.pid;
  async function bind(root) {
    process.env.EU_PRIVACY_DATA_ROOT = root; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
    check(await holder.request('initialize', { artifact, root }), { node: 'v22.23.2' }, 'ADMISSION_GATE_CHILD_NODE'); holderOpen = true;
    check(await holder.request('acquire'), { acquired: true }, 'ADMISSION_GATE_CHILD_REAL_HOLD'); held = true;
    check(await holder.request('assert'), true, 'ADMISSION_GATE_CHILD_HELD');
  }
  async function release() {
    check(await holder.request('release'), true, 'ADMISSION_GATE_CHILD_RELEASE'); held = false;
    check(await holder.request('close'), true, 'ADMISSION_GATE_CHILD_CLOSE_ROOT'); holderOpen = false;
  }
  stage = 'transient';
  {
    const root = fixture.root(); fs.mkdirSync(path.join(root, 'batches')); const token = 'a'.repeat(64), target = path.join(root, 'batches', 'active-processing.json');
    const observation = { case: 'actual_busy_then_release', actions: 0, waits: [], before_release_actions: null,
      child_held_confirmed_in_wait: false, returned_promise: false, confirmed: false, epoch_released: false };
    report.cases.push(observation); await bind(root);
    own = createBatchActiveLock();
    const admission = createBatchProcessingAdmission({ dataRoot, withOwnershipControl, acquireActiveLock: own.acquireActiveLockOnce,
      delay: async milliseconds => {
        observation.waits.push(milliseconds);
        check(observation.actions, 0, 'ADMISSION_GATE_NO_ACTION_WHILE_HELD');
        check(fs.existsSync(target), false, 'ADMISSION_GATE_NO_LOGICAL_OWNER_WHILE_HELD');
        check(await holder.request('assert'), true, 'ADMISSION_GATE_CHILD_HELD_DURING_ACTUAL_BUSY');
        observation.child_held_confirmed_in_wait = true; observation.before_release_actions = observation.actions;
        // This explicit observation seam is reached only after the actual C
        // Acquire returned Busy. B is intentionally a separate direct-API holder;
        // no product JS callback retains a kernel guard across this await.
        await release(); await pause(milliseconds);
      } });
    const started = performance.now(), pending = admission(token);
    observation.returned_promise = Boolean(pending && typeof pending.then === 'function');
    check(observation.returned_promise, true, 'ADMISSION_GATE_NATIVE_BUSY_REACHED');
    check(observation.actions, 0, 'ADMISSION_GATE_NO_EARLY_ACTION');
    check(await pending, true, 'ADMISSION_GATE_LATER_ADMITTED'); observation.confirmed = true;
    epoch = own.captureOwnedEpoch(token); check(own.assertOwnedEpoch(epoch), true, 'ADMISSION_GATE_REAL_OWNED_EPOCH');
    const published = JSON.parse(readBounded(target, 4096));
    check([published.schema, published.pid, published.token], ['datasecure-active-batch/2', process.pid, token], 'ADMISSION_GATE_REAL_OWNER_RECORD');
    observation.actions++; // The caller's synthetic document boundary, not passed to the retry helper.
    check(observation.actions, 1, 'ADMISSION_GATE_EXACTLY_ONE_ACTION');
    check(observation.waits, [BACKOFF_MS[0]], 'ADMISSION_GATE_ONE_ACTUAL_BUSY_WAIT');
    check(own.releaseOwnedEpoch(epoch), true, 'ADMISSION_GATE_OWN_EPOCH_RELEASE'); epoch = undefined;
    check(fs.existsSync(target), false, 'ADMISSION_GATE_NO_OWNER_AFTER_RELEASE');
    observation.epoch_released = true; observation.elapsed_ms = Math.round((performance.now() - started) * 1000) / 1000;
  }
  stage = 'persistent';
  {
    const root = fixture.root(); fs.mkdirSync(path.join(root, 'batches')); const token = 'b'.repeat(64), target = path.join(root, 'batches', 'active-processing.json');
    const observation = { case: 'actual_persistent_busy', actions: 0, default_timers: true, error_code: null,
      child_still_held_after_refusal: false, logical_owner_absent: false, configured_budget_ms: MAX_WAIT_MS };
    report.cases.push(observation); await bind(root); own = createBatchActiveLock();
    // No injected delay or clock: actual production timer schedule/budget.
    const admission = createBatchProcessingAdmission({ dataRoot, withOwnershipControl, acquireActiveLock: own.acquireActiveLockOnce });
    const started = performance.now(), pending = admission(token);
    check(Boolean(pending && typeof pending.then === 'function'), true, 'ADMISSION_GATE_PERSISTENT_ASYNC_WAIT');
    try { await pending; observation.actions++; throw fixed('ADMISSION_GATE_PERSISTENT_FALSE_SUCCESS'); }
    catch (error) { observation.error_code = error.code; check(error.code, 'OWNERSHIP_GUARD_BUSY', 'ADMISSION_GATE_PERSISTENT_EXACT_BUSY'); }
    observation.elapsed_ms = Math.round((performance.now() - started) * 1000) / 1000;
    check(observation.actions, 0, 'ADMISSION_GATE_PERSISTENT_NO_ACTION');
    check(fs.existsSync(target), false, 'ADMISSION_GATE_PERSISTENT_NO_OWNER'); observation.logical_owner_absent = true;
    check(await holder.request('assert'), true, 'ADMISSION_GATE_PERSISTENT_CHILD_STILL_HELD'); observation.child_still_held_after_refusal = true;
    await release();
    const direct = admission(token);
    check(direct, true, 'ADMISSION_GATE_UNCONTENDED_STAYS_SYNCHRONOUS');
    epoch = own.captureOwnedEpoch(token); check(own.releaseOwnedEpoch(epoch), true, 'ADMISSION_GATE_UNCONTENDED_RELEASE'); epoch = undefined;
    check(fs.existsSync(target), false, 'ADMISSION_GATE_UNCONTENDED_NO_OWNER');
    observation.post_release_sync_control = true;
  }
  stage = 'worker_export_admission';
  {
    const root = fixture.root(); fs.mkdirSync(path.join(root, 'batches'));
    const token = 'c'.repeat(64), target = path.join(root, 'batches', 'active-processing.json');
    const observation = { case: 'actual_worker_export_transaction_admission', actions: 0, waits: 0,
      claim_release_waits: 0, callback_not_held_across_wait: false, exact_claim_release: false };
    report.cases.push(observation); await bind(root);
    own = createBatchActiveLock({ admissionDelay: async milliseconds => {
      observation.waits++;
      check(observation.actions, 0, 'ADMISSION_GATE_EXPORT_NO_ACTION_WHILE_HELD');
      check(fs.existsSync(target), false, 'ADMISSION_GATE_EXPORT_NO_LOGICAL_OWNER_WHILE_HELD');
      check(await holder.request('assert'), true, 'ADMISSION_GATE_EXPORT_REAL_BUSY');
      await release(); await pause(milliseconds);
    } });
    const result = await own.withSynchronousActiveLockAdmitted(token, () => {
      observation.actions++;
      // A fresh real C acquisition inside this synchronous callback must be
      // reentrant only through the actual product's held-root context.
      withOwnershipControl(root, guard => { guard.assertHeld(); return true; });
      return 'one-action';
    });
    check(result, 'one-action', 'ADMISSION_GATE_EXPORT_RETURN');
    check([observation.actions, observation.waits], [1, 1], 'ADMISSION_GATE_EXPORT_ONE_ACTION_AFTER_BUSY');
    check(fs.existsSync(target), false, 'ADMISSION_GATE_EXPORT_EXACT_LOGICAL_RELEASE');
    observation.callback_not_held_across_wait = true;
    const exporter = require(path.join(repo, gateway, 'result-export.js'));
    const record = exporter.recordPath(token), claim = await exporter._test.acquireExportClaimAsync(record);
    check(Boolean(claim), true, 'ADMISSION_GATE_EXPORT_REAL_CLAIM');
    check(fs.existsSync(exporter._test.claimPath(record)), true, 'ADMISSION_GATE_EXPORT_REAL_CLAIM_FILE');
    await bind(root);
    const released = await exporter._test.releaseExportClaimAsync(record, claim, { admissionDelay: async milliseconds => {
      observation.claim_release_waits++;
      check(fs.existsSync(exporter._test.claimPath(record)), true, 'ADMISSION_GATE_EXPORT_CLAIM_RETAINED_DURING_BUSY');
      check(await holder.request('assert'), true, 'ADMISSION_GATE_EXPORT_CLAIM_RELEASE_REAL_BUSY');
      await release(); await pause(milliseconds);
    } });
    check(released, true, 'ADMISSION_GATE_EXPORT_SAME_OPAQUE_CLAIM_RELEASE');
    check(observation.claim_release_waits, 1, 'ADMISSION_GATE_EXPORT_SINGLE_RELEASE_WAIT');
    check(fs.existsSync(exporter._test.claimPath(record)), false, 'ADMISSION_GATE_EXPORT_CLAIM_REMOVED');
    check(await exporter._test.releaseExportClaimAsync(record, claim), false, 'ADMISSION_GATE_EXPORT_NO_REUSE');
    check(await exporter._test.releaseExportClaimAsync(record, { ...claim }), false, 'ADMISSION_GATE_EXPORT_NO_CLONED_AUTHORITY');
    observation.exact_claim_release = true;
  }
  report.native_boundary_pass = true; stage = 'source_recheck'; report.sources_after = sources();
  for (const relative of sourceFiles)
    check(report.sources_after[relative], report.sources_before[relative], 'ADMISSION_GATE_EXECUTED_SOURCE_DRIFT');
  check(hash(readBounded(process.execPath, 128 * 1024 * 1024)), report.node_sha256, 'ADMISSION_GATE_NODE_POST_PIN');
  check(hash(readBounded(artifact.path, 4 * 1024 * 1024)), report.native_artifact_sha256, 'ADMISSION_GATE_ADDON_POST_PIN');
  check(hash(readBounded(manifestPath, 65536)), report.manifest_sha256, 'ADMISSION_GATE_MANIFEST_POST_PIN');
  check(hash(readBounded(cSource, 1024 * 1024)), report.native_source_sha256, 'ADMISSION_GATE_CHECKOUT_C_POST_PIN');
}
module.exports = (async () => {
  try { await main(); }
  catch (error) {
    report.failure = { stage, code: /^[A-Z][A-Z0-9_]{2,99}$/u.test(error?.code || '') ? error.code :
      error?.code === 'ERR_ASSERTION' ? 'ADMISSION_GATE_ASSERTION_FAILED' : 'ADMISSION_GATE_FAILED',
      assertion: error?.code === 'ERR_ASSERTION' && /^ADMISSION_GATE_[A-Z0-9_]+$/u.test(error.message || '') ? error.message : undefined };
  } finally {
    if (holder) {
      if (held) { try { if (await holder.request('release') === true) held = false; } catch {} }
      if (holderOpen && !held) { try { if (await holder.request('close') === true) holderOpen = false; } catch {} }
      report.child = await holder.stop();
    }
    if (epoch && !held) {
      try { report.final_parent_epoch_release = own.releaseOwnedEpoch(epoch) === true; } catch { report.final_parent_epoch_release = false; }
    }
    // Retain on unconfirmed process end or failed assertions; no broad cleanup.
    if (fixture && report.native_boundary_pass && !report.failure && report.child?.normal === true && !held && !holderOpen) {
      try { fixture.cleanup(); report.fixture_cleaned = true; }
      catch { report.failure = { stage: 'cleanup', code: 'ADMISSION_GATE_CLEANUP_FAILED' }; }
    }
    savedKeys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
    report.assertions = assertions;
    report.ok = report.native_boundary_pass && !report.failure && report.child?.normal === true && report.fixture_cleaned;
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.ok ? 0 : 1;
    return report;
  }
})();
