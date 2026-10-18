'use strict';

// Explicit native integration gate. No parser, publisher, product retention or
// GUI behavior is simulated as an end-to-end document/result implementation.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createLeaseFinishNativeFixture, readBounded, digest } = require('./helpers/native-executor-lease-finish-fixture.cjs');
const { configureOwnershipControl, withOwnershipControl } = require('../plugins/data-secure/server/core/ownership-control');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const { createBatchExecutorLeaseFinish } = require('../plugins/data-secure/server/gateway/batch-executor-lease-finish');
const { processInstanceIdentity } = require('../plugins/data-secure/server/gateway/process-identity');
const { processAlive } = require('../plugins/data-secure/server/gateway/process-liveness');
const { SafeError, dataRoot } = require('../plugins/data-secure/server/runtime');

if (process.version !== 'v22.23.2' || !['win32', 'darwin'].includes(process.platform) || process.argv.length !== 4 ||
    !/^[a-f0-9]{64}$/u.test(process.argv[3])) throw Error('NATIVE_LEASE_FINISH_NODE_MANIFEST_REQUIRED');
const nodeSha = digest(readBounded(process.execPath, 128 * 1024 * 1024));
assert.equal(nodeSha, process.argv[3], 'explicit trusted test Node digest must match');
const manifestPath = path.resolve(process.argv[2]), manifestBytes = readBounded(manifestPath, 65536);
const manifest = JSON.parse(manifestBytes), artifact = manifest.verified_artifact;
assert.equal(manifest.schema, 'datasecure-native-ownership-guard-build/1');
assert.equal(manifest.node_headers_version, '22.23.2');
assert.equal(manifest.source_sha256, digest(readBounded(path.join(__dirname, '../native/ownership-guard/ownership-guard.c'), 1024 * 1024)));
assert.equal(artifact.sha256, digest(readBounded(artifact.path, 4 * 1024 * 1024)));
configureOwnershipControl(artifact); // Explicit test DTO, never product environment trust.
const loader = path.resolve(__dirname, '../plugins/data-secure/server/core/native-ownership-guard.js');
const birth = processInstanceIdentity(process.pid);
assert.ok(/^[a-f0-9]{64}$/u.test(birth || ''), 'actual own process birth identity is required');
const observedSources = ['core/ownership-control.js', 'core/native-ownership-guard.js', 'gateway/batch-active-lock.js',
  'gateway/batch-executor-lease.js', 'gateway/batch-executor-lease-finish.js', 'gateway/process-identity.js'];
const sourceHashes = Object.fromEntries(observedSources.map(relative => [relative,
  digest(readBounded(path.join(__dirname, '../plugins/data-secure/server', relative), 1024 * 1024))]));
function unchangedSources() {
  for (const relative of observedSources) assert.equal(digest(readBounded(path.join(__dirname,
    '../plugins/data-secure/server', relative), 1024 * 1024)), sourceHashes[relative], 'source changed during native gate');
}
const savedKeys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'DATASECURE_NATIVE_EXPORT_CHANNEL', 'DATASECURE_OWNERSHIP_GUARD_SHA256'];
const saved = savedKeys.map(key => process.env[key]);
const fixed = code => Object.assign(Error(code), { code });
let fixture, holder, completed = false, failed = false, primary, phase = 'fixture_setup';
const modes = [];

async function runMode(zeroDay) {
  const root = fixture.root(), batches = path.join(root, 'batches');
  process.env.EU_PRIVACY_DATA_ROOT = root; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
  assert.equal(dataRoot(), root);
  const token = (zeroDay ? 'b' : 'a').repeat(64), target = path.join(batches, 'active-processing.json');
  const markdown = Buffer.from('# Explicit synthetic already-published sentinel\n\nNot parser/publisher evidence.\n');
  const metadata = Buffer.from('{"schema":"datasecure-native-lease-finish-sentinel/1","synthetic":true}\n');
  const sentinelFiles = [fixture.createFile(root, 'published-sentinel.md', markdown), fixture.createFile(root, 'published-sentinel.json', metadata)];
  const sentinels = sentinelFiles.map((file, i) => ({ name: path.basename(file), sha256: digest([markdown, metadata][i]) }));
  const journal = fixture.createFile(batches, token + '.json', Buffer.from(JSON.stringify({
    schema: 'datasecure-native-lease-finish-fixture/1', token, zero_day_work: zeroDay,
    fixture_run_ready: true, already_published_sentinels: sentinels
  }, null, 2) + '\n'));
  let observe = false, logicalPublished = 0, logicalReleased = 0, outerAttempts = 0, callbackEntries = 0;
  let releaseCalls = 0, finishCalls = 0, releaseJournalWrites = 0, finishJournalWrites = 0, journalPhase = 'setup';
  const logicalIds = [], delays = [];
  const owner = createBatchActiveLock({ lockPath: () => target, fs: { ...fs, constants: fs.constants,
    linkSync(from, to) {
      const result = fs.linkSync(from, to);
      if (observe && to === target) logicalPublished++;
      return result;
    },
    unlinkSync(file) {
      if (observe && file === target) logicalReleased++;
      return fs.unlinkSync(file);
    }
  } }); // Actual PID, actual C controller, actual owner records, no guard seam.
  function captureConfirmedLogicalOwner() {
    // Observe only after publication/verification has completed. Reading from
    // linkSync would inspect the still-legitimate two-link prepared pair and
    // must not introduce an artificial publication failure into this gate.
    const record = owner.readActiveLock();
    assert.equal(record.schema, 'datasecure-active-batch/2'); assert.equal(record.pid, process.pid);
    logicalIds.push(record.lock_id);
  }
  const lease = createBatchExecutorLease({
    SafeError, processAlive, processInstanceIdentity, currentPid: () => process.pid,
    liveLocalExecutor: owner.liveLocalExecutor,
    withSynchronousActiveLock: owner.withSynchronousActiveLock,
    readState(value) { assert.equal(value, token); return fixture.readJournal(journal); },
    writeState(value) {
      assert.equal(fs.existsSync(target), true, 'actual logical owner spans journal commit');
      if (journalPhase === 'release') captureConfirmedLogicalOwner();
      fixture.writeJournal(journal, value);
      if (journalPhase === 'release') releaseJournalWrites++;
    },
    // This is an explicitly synthetic lease fixture, not product document state.
    publicProgress: value => ({ complete: false, remaining: value.fixture_run_ready ? 1 : 0,
      delivery_pending: 0, mapping_pending: 0, deferred_review: 0, retryable: 0 })
  });
  assert.equal(lease.claimLocalBatchExecutor(token, process.pid).ok, true);
  owner.withSynchronousActiveLock(token, () => {
    const state = fixture.readJournal(journal); state.fixture_run_ready = false; fixture.writeJournal(journal, state);
  });
  const claimedBytes = readBounded(journal, 65536), claimed = JSON.parse(claimedBytes);
  assert.equal(claimed.local_executor_pid, process.pid); assert.equal(claimed.local_executor_birth_id, birth);
  assert.ok(/^[a-f0-9]{32}$/u.test(claimed.local_executor_lease_id || ''));
  fixture.rememberAnchor(root);
  assert.deepEqual(await holder.request('initialize', { artifact, root }), { node: 'v22.23.2' });
  assert.deepEqual(await holder.request('acquire'), { acquired: true });
  assert.equal(await holder.request('assert'), true);
  phase = 'lease_finish';
  observe = true;
  const releaseAndFinish = createBatchExecutorLeaseFinish({
    dataRoot,
    withOwnershipControl(value, action) {
      outerAttempts++; assert.equal(value, root);
      return withOwnershipControl(value, guard => { callbackEntries++; return action(guard); });
    },
    releaseLocalBatchExecutor(value, pid) {
      releaseCalls++; journalPhase = 'release';
      const released = lease.releaseLocalBatchExecutor(value, pid);
      assert.equal(released, true);
      assert.equal(fs.existsSync(target), false, 'first actual logical transaction has completed');
      const current = fixture.readJournal(journal);
      assert.equal(current.local_executor_pid, undefined); assert.equal(current.local_executor_birth_id, undefined);
      assert.equal(current.local_executor_started_at, undefined);
      assert.equal(current.local_executor_lease_id, undefined);
      // Exact observed bug boundary: lease factory has RETURNED success and
      // unlinked its logical owner; finish has not started. A separate process
      // must still be denied the actual C root guard by the outer capability.
      assert.equal(finishCalls, 0);
      phase = 'between_steps_probe';
      fixture.competitor(root, false);
      return released;
    },
    finishZeroDayOperation(value) {
      finishCalls++; journalPhase = 'finish';
      phase = 'finish_step';
      assert.equal(fs.existsSync(target), false, 'no nested logical acquisition/adoption');
      return owner.withSynchronousActiveLock(value, () => {
        assert.equal(fs.existsSync(target), true);
        captureConfirmedLogicalOwner();
        withOwnershipControl(root, guard => assert.equal(guard.assertHeld(), true));
        const state = fixture.readJournal(journal);
        assert.equal(state.local_executor_pid, undefined);
        for (const file of sentinelFiles) fixture.unchanged(file);
        assert.deepEqual(state.already_published_sentinels, sentinels);
        if (!state.zero_day_work) return null;
        // Only a labelled fixture journal projection. The private product
        // finishZeroDayWork/parser/publisher implementation is NOT impersonated.
        state.fixture_zero_day_boundary_completed = true;
        fixture.writeJournal(journal, state); finishJournalWrites++;
        return state;
      });
    },
    async delay(milliseconds) {
      delays.push(milliseconds);
      assert.equal(outerAttempts, 1); assert.equal(callbackEntries, 0);
      assert.equal(releaseCalls, 0); assert.equal(finishCalls, 0);
      assert.equal(logicalPublished, 0); assert.equal(logicalReleased, 0);
      assert.equal(fs.existsSync(target), false);
      assert.ok(readBounded(journal, 65536).equals(claimedBytes));
      assert.equal(await holder.request('assert'), true, 'foreign process really holds the C guard during helper await');
      assert.equal(await holder.request('release'), true); // ACK after actual C unlock.
      assert.equal(await holder.request('close'), true); // Native factory root handle closed before retry.
      await new Promise(resolve => setTimeout(resolve, milliseconds));
    }
  });
  assert.equal(await releaseAndFinish(token, process.pid), true);
  phase = 'mode_postconditions';
  observe = false;
  assert.equal(outerAttempts, 2); assert.equal(callbackEntries, 1);
  assert.deepEqual(delays, [10]); assert.equal(releaseCalls, 1); assert.equal(finishCalls, 1);
  assert.equal(releaseJournalWrites, 1); assert.equal(finishJournalWrites, zeroDay ? 1 : 0);
  assert.equal(logicalPublished, 2); assert.equal(logicalReleased, 2); assert.equal(new Set(logicalIds).size, 2);
  assert.equal(fs.existsSync(target), false);
  const finalBytes = readBounded(journal, 65536), finalState = JSON.parse(finalBytes);
  assert.equal(finalState.local_executor_pid, undefined); assert.equal(finalState.local_executor_birth_id, undefined);
  assert.equal(finalState.local_executor_started_at, undefined);
  assert.equal(finalState.local_executor_lease_id, undefined);
  assert.equal(finalState.fixture_zero_day_boundary_completed, zeroDay ? true : undefined);
  assert.deepEqual(finalState.already_published_sentinels, sentinels);
  for (const file of sentinelFiles) fixture.unchanged(file);
  fixture.unchangedAnchors();
  phase = 'after_return_probe';
  fixture.competitor(root, true); // Actual C exclusion ends after outer return.
  return { zero_day_work: zeroDay, outer_attempts: outerAttempts, callback_entries: callbackEntries, delays,
    lease_calls: releaseCalls, finish_calls: finishCalls, confirmed_logical_publications: logicalPublished,
    confirmed_logical_releases: logicalReleased, distinct_logical_owners: new Set(logicalIds).size,
    lease_journal_commits: releaseJournalWrites, fixture_finish_journal_commits: finishJournalWrites,
    between_steps_native_child_refused: true, after_return_native_child_acquired: true,
    journal_before: claimed, journal_after: finalState, journal_before_sha256: digest(claimedBytes),
    journal_after_sha256: digest(finalBytes), unchanged_published_sentinels: sentinels };
}

module.exports = (async () => {
  process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1'; delete process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
  try {
    fixture = await createLeaseFinishNativeFixture({ artifact, loader }); holder = fixture.spawnHolder();
    modes.push(await runMode(false)); modes.push(await runMode(true)); completed = true; phase = 'child_close';
  } catch (error) { failed = true; primary = error; }
  finally {
    if (fixture) {
      try {
        const receipts = await fixture.stopAll();
        if (receipts.length !== 1 || !receipts[0].normal || !receipts[0].closed || !receipts[0].ipc_disconnected || !receipts[0].stderr_closed)
          throw fixed('NATIVE_LEASE_FINISH_CHILD_NOT_CLOSED');
      } catch (error) { if (!failed) { failed = true; primary = error; } }
      if (!failed && completed) {
        try { phase = 'fixture_cleanup'; unchangedSources(); fixture.cleanup(); }
        catch (error) { failed = true; primary = error; }
      }
    }
    savedKeys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
  const evidence = { schema: 'datasecure-native-executor-lease-finish-gate/1', outcome: failed ? 'failed' : 'passed',
    node: process.version, node_sha256: nodeSha, platform: process.platform,
    manifest_sha256: digest(manifestBytes), native_source_sha256: manifest.source_sha256, addon_sha256: artifact.sha256,
    source_sha256: sourceHashes,
    actual_process_pid: process.pid, actual_process_birth_sha256: birth, modes, ...fixture?.evidence(),
    document_pipeline_evidence: false, synthetic_journal_projection: true };
  if (failed) {
    evidence.error_code = /^[A-Z][A-Z0-9_]{2,99}$/u.test(primary?.code || '') ? primary.code : 'NATIVE_LEASE_FINISH_GATE_FAILED';
    evidence.phase = phase;
    evidence.retained_own_fixture = fixture?.path || primary?.fixturePath || null;
    console.error(JSON.stringify(evidence)); process.exitCode = 1;
  } else console.log(JSON.stringify(evidence));
  return evidence;
})().catch(error => { console.error('NATIVE_LEASE_FINISH_HARNESS_FAILED'); process.exitCode = 1; });
