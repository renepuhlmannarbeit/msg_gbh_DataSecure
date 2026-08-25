'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-intake-worker-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { roots } = require('../plugins/data-secure/server/gateway/common');
const { readBatchProgress, _test } = require('../plugins/data-secure/server/gateway/batch');
const { startLocalIntakeExecutor, localBatchStateProgress, terminalIntakeProgress } = require('../plugins/data-secure/server/gateway/batch-executor');
const { IO_SUMMARY_SCHEMA, validatePrivateIoSummary } = require('../plugins/data-secure/server/gateway/performance');
const { testAsync, done, assert } = createSuite('Direct picker intake worker');

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForTerminalProgress(token, noticeStage) {
  // Match the worker's own bounded startup allowance. On Windows, process
  // creation can briefly exceed ten seconds under a busy full-suite run even
  // though the isolated worker normally completes in well under two seconds.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (noticeStage()) throw new Error(`local intake stopped at ${noticeStage()}`);
    try {
      const progress = readBatchProgress(token);
      if (progress.complete === true) return progress;
    } catch {
      // The child may not yet have written its private batch checkpoint.
    }
    await pause(25);
  }
  throw new Error('local intake worker did not reach a terminal content-free batch state');
}

async function removeTestRoot() {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.rmSync(base, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await pause(50);
    }
  }
}

async function main() {
  await testAsync('the direct picker completion envelope contains only bounded terminal counters', async () => {
    const completion = terminalIntakeProgress({ type: 'local-intake-complete', batch_total: 3, released: 2, stopped: 1 });
    assert.deepStrictEqual(completion, { complete: true, batch_total: 3, released: 2, stopped: 1 });
    assert.strictEqual(terminalIntakeProgress({ type: 'local-intake-complete', batch_total: 1, released: 1, stopped: 1 }), null);
    assert.strictEqual(terminalIntakeProgress({ type: 'local-intake-complete', batch_total: 0, released: 0, stopped: 0 }), null);
    assert.doesNotMatch(JSON.stringify(completion), /token|path|source|package/i);
    for (const batch_phase of ['awaiting_local_review', 'awaiting_explicit_resume', 'awaiting_local_mapping_repair']) {
      assert.deepStrictEqual(localBatchStateProgress({
        type: 'local-intake-state', complete: false, batch_phase,
        batch_total: 3, released: 1, stopped: 0
      }), { complete: false, batch_phase, batch_total: 3, released: 1, stopped: 0 });
    }
    assert.strictEqual(localBatchStateProgress({
      type: 'local-intake-state', complete: false, batch_phase: 'processing_local_document',
      batch_total: 3, released: 1, stopped: 0
    }), null, 'a live phase is never misreported as a final local notice');
    assert.strictEqual(localBatchStateProgress({
      type: 'local-intake-state', complete: true, batch_phase: 'complete',
      batch_total: 3, released: 1, stopped: 1
    }), null, 'terminal counters must cover the complete batch');
    assert.strictEqual(localBatchStateProgress({
      type: 'local-intake-state', complete: false, batch_phase: 'awaiting_explicit_resume',
      batch_total: 3, released: 2, stopped: 1
    }), null, 'a resting phase must retain at least one unfinished item');
  });

  await testAsync('a real intake worker claims its local executor lease and completes without MCP source disclosure', async () => {
    const source = path.join(base, 'source.txt');
    fs.writeFileSync(source, 'Kunde: Beispielperson\nE-Mail: beispiel@example.test\nVertragliche Leistung', 'utf8');
    let localNotice = null;
    let completionSummary = null;
    const workflowEvents = [];
    const started = startLocalIntakeExecutor([{
      name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size
    }], 'customer', {
      showLocalIntakeNotice: (stage) => { localNotice = stage; },
      showTerminalBatchSummary: (summary) => { completionSummary = summary; return true; },
      recordWorkflowEvent: (event) => { workflowEvents.push(event); return true; }
    });
    assert.strictEqual(started.ok, true);
    assert.strictEqual(started.local_intake_pending, true);
    assert.doesNotMatch(JSON.stringify(started), /source\.txt|beispiel@example\.test|Beispielperson/u);
    const completed = await waitForTerminalProgress(started.batch_token, () => localNotice);
    assert.strictEqual(completed.released, 1);
    assert.strictEqual(completed.remaining, 0);
    assert.strictEqual(completed.processing, 0);
    const completionDeadline = Date.now() + 1_000;
    while (!completionSummary && Date.now() < completionDeadline) await pause(10);
    assert.deepStrictEqual(completionSummary, {
      complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0
    });
    const lifecycleDeadline = Date.now() + 1_000;
    while (!workflowEvents.some((event) => event.event === 'intake_worker_exited') && Date.now() < lifecycleDeadline) await pause(10);
    const eventNames = workflowEvents.map((event) => event.event);
    for (const expected of [
      'intake_worker_spawned', 'intake_ipc_dispatched', 'intake_checkpoint_created',
      'intake_processing_started', 'intake_terminal_state', 'completion_notice_started',
      'completion_notice_finished', 'intake_worker_exited'
    ]) assert.ok(eventNames.includes(expected), `missing lifecycle event ${expected}`);
    assert.doesNotMatch(JSON.stringify(workflowEvents), /source\.txt|beispiel@example\.test|Beispielperson/u);
    const state = _test.readState(started.batch_token);
    assert.strictEqual(validatePrivateIoSummary(state.io_summary), true);
    assert.deepStrictEqual(state.io_summary, {
      schema: IO_SUMMARY_SCHEMA,
      snapshot_preflight_runs: 1,
      snapshot_copy_files: 1,
      snapshot_copy_mib: 1,
      final_gate_runs: 1,
      output_packages_committed: 1,
      audit_receipt_writes: 1,
      batch_maintenance_runs: 1
    });
  });
  await removeTestRoot();
  done();
}

main().catch(async (error) => {
  await removeTestRoot().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
