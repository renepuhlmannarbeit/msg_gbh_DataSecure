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

async function waitForSettledProgress(token, noticeStage) {
  // Match the worker's own bounded startup allowance. On Windows, process
  // creation can briefly exceed ten seconds under a busy full-suite run even
  // though the isolated worker normally completes in well under two seconds.
  const deadline = Date.now() + 30_000;
  let lastProgress = null;
  while (Date.now() < deadline) {
    try {
      const progress = readBatchProgress(token);
      lastProgress = progress;
      if (progress.complete === true || (
        progress.local_processing_active === false &&
        ['awaiting_explicit_resume', 'awaiting_local_review', 'awaiting_local_mapping_repair', 'awaiting_delivery_acknowledgement']
          .includes(progress.batch_phase)
      )) return progress;
    } catch {
      // The child may not yet have written its private batch checkpoint.
    }
    if (noticeStage()) {
      let itemState = null;
      try {
        const state = _test.readState(token);
        const item = state.items?.[0];
        itemState = item && { status: item.status, checkpoint: item.checkpoint, error_code: item.error_code };
      } catch {}
      throw new Error(`local intake stopped at ${noticeStage()}: ${JSON.stringify(lastProgress && {
        released: lastProgress.released,
        stopped: lastProgress.stopped,
        remaining: lastProgress.remaining,
        retryable: lastProgress.retryable,
        processing: lastProgress.processing,
        delivery_pending: lastProgress.delivery_pending,
        mapping_pending: lastProgress.mapping_pending,
        deferred_review: lastProgress.deferred_review,
        local_processing_active: lastProgress.local_processing_active,
        batch_phase: lastProgress.batch_phase
      })}; item=${JSON.stringify(itemState)}`);
    }
    await pause(25);
  }
  throw new Error(`local intake worker did not reach a settled content-free batch state: ${JSON.stringify(lastProgress && {
    released: lastProgress.released,
    stopped: lastProgress.stopped,
    remaining: lastProgress.remaining,
    retryable: lastProgress.retryable,
    processing: lastProgress.processing,
    delivery_pending: lastProgress.delivery_pending,
    mapping_pending: lastProgress.mapping_pending,
    deferred_review: lastProgress.deferred_review,
    local_processing_active: lastProgress.local_processing_active,
    batch_phase: lastProgress.batch_phase
  })}`);
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
    assert.deepStrictEqual(completion, {
      complete: true, batch_total: 3, released: 2, stopped: 1,
      result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 3 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      result_grades_verified: false
    });
    assert.strictEqual(terminalIntakeProgress({ type: 'local-intake-complete', batch_total: 1, released: 1, stopped: 1 }), null);
    assert.strictEqual(terminalIntakeProgress({ type: 'local-intake-complete', batch_total: 0, released: 0, stopped: 0 }), null);
    assert.doesNotMatch(JSON.stringify(completion), /token|path|source|package/i);
    for (const batch_phase of ['awaiting_local_review', 'awaiting_explicit_resume', 'awaiting_local_mapping_repair']) {
      assert.deepStrictEqual(localBatchStateProgress({
        type: 'local-intake-state', complete: false, batch_phase,
        batch_total: 3, released: 1, stopped: 0
      }), {
        complete: false, batch_phase, batch_total: 3, released: 1, stopped: 0,
        result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 3 },
        result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
        result_grades_verified: false
      });
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
    for (const [status, counter, phase] of [
      ['processing', 'processing', 'processing_local_document'],
      ['mapping_pending', 'mapping_pending', 'awaiting_local_mapping_repair'],
      ['delivery_pending', 'delivery_pending', 'awaiting_delivery_acknowledgement']
    ]) {
      const observed = _test.publicProgress({ token: 'f'.repeat(64), items: [{ status }] });
      assert.strictEqual(observed.remaining, 0, `${status} has left the pending queue`);
      assert.strictEqual(observed[counter], 1, `${status} retains its explicit unfinished counter`);
      assert.strictEqual(observed.complete, false, `${status} is never terminal`);
      assert.strictEqual(observed.batch_phase, phase);
    }
  });

  await testAsync('a real intake worker claims its lease and reaches a terminal or resumable content-free checkpoint', async () => {
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
    const completed = await waitForSettledProgress(started.batch_token, () => localNotice);
    const state = _test.readState(started.batch_token);
    assert.strictEqual(completed.released + completed.stopped + completed.retryable, 1);
    assert.strictEqual(completed.remaining, 0);
    assert.strictEqual(completed.processing, 0);
    const completionDeadline = Date.now() + 1_000;
    while (!completionSummary && Date.now() < completionDeadline) await pause(10);
    // The read-side poll may observe the terminal item immediately before the
    // worker durably binds terminal evidence. The completion notice is emitted
    // only after that binding and must therefore carry the verified RC65 grade.
    assert.deepStrictEqual(completionSummary, {
      complete: true,
      batch_phase: 'complete',
      batch_total: 1,
      released: 1,
      stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      result_grades_verified: true
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
    assert.strictEqual(validatePrivateIoSummary(state.io_summary), true);
    assert.strictEqual(state.io_summary.schema, IO_SUMMARY_SCHEMA);
    assert.strictEqual(state.io_summary.snapshot_preflight_runs, 1);
    assert.strictEqual(state.io_summary.snapshot_copy_files, 1);
    assert.strictEqual(state.io_summary.snapshot_copy_mib, 1);
    assert.strictEqual(state.io_summary.batch_maintenance_runs, 1);
    for (const key of ['final_gate_runs', 'output_packages_committed', 'audit_receipt_writes']) {
      assert.ok([0, 1].includes(state.io_summary[key]), `${key} remains a bounded real-work counter`);
    }
    assert.strictEqual(state.io_summary.output_packages_committed, completed.released);
  });
  await removeTestRoot();
  done();
}

main().catch(async (error) => {
  await removeTestRoot().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
