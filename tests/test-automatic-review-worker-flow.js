'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { continueIntoLocalReview } = require('../plugins/data-secure/server/gateway/automatic-local-review');
const processingMode = require('../plugins/data-secure/server/core/processing-mode');

const { testAsync, done, assert } = createSuite('Automatic review worker orchestration contract');
const workerFile = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'batch-worker.js');
const workerSource = fs.readFileSync(workerFile, 'utf8');
const token = 'b'.repeat(64);
const waiting = Object.freeze({
  ok: true, complete: false, batch_phase: 'awaiting_local_review', batch_total: 2,
  released: 1, stopped: 0, deferred_review: 1,
  result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 2 },
  result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
  result_grades_verified: false, raw_content_sent_to_claude: false
});
const complete = Object.freeze({
  ok: true, complete: true, batch_phase: 'complete', batch_total: 2,
  released: 2, stopped: 0, deferred_review: 0,
  result_grade_counts: { complete: 2, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
  result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
  result_grades_verified: true, raw_content_sent_to_claude: false
});

async function runWorker(reviewOutcome, initial = waiting) {
  const calls = { review: 0, claim: 0, release: 0, exports: 0, presentations: 0, notices: 0, events: [], sent: [], exits: [] };
  const listeners = {};
  const fakeProcess = {
    pid: 8080,
    env: {},
    send(payload, callback) { calls.sent.push(payload); callback?.(null); },
    once(event, listener) { listeners[event] = listener; },
    exit(code) { calls.exits.push(code); }
  };
  const batch = {
    readBatchProcessingMode(value) { assert.strictEqual(value, token); return processingMode.MODES.ANONYMIZE; },
    async runLocalBatchExecutor() { return initial; },
    claimLocalBatchExecutor(value, pid) { calls.claim++; assert.strictEqual(value, token); assert.strictEqual(pid, 8080); return { ok: true }; },
    releaseLocalBatchExecutor(value, pid) { calls.release++; assert.strictEqual(value, token); assert.strictEqual(pid, 8080); return true; },
    async reviewDeferredBatch(value, options) {
      calls.review++;
      assert.strictEqual(value, token);
      assert.strictEqual(options.localFinalize, true);
      if (reviewOutcome instanceof Error) throw reviewOutcome;
      return reviewOutcome;
    },
    readBatchProgress() { return waiting; },
    exportCompletedBatchResults() { calls.exports++; return { exported: 2, pending: 0, available: true }; },
    reserveTerminalNotice() { return { ok: true, reservation_id: 'c'.repeat(32) }; },
    markTerminalNoticePresented() { return true; },
    releaseTerminalNoticeReservation() { return true; }
  };
  const module = { exports: {} };
  vm.runInNewContext(workerSource, {
    module, exports: module.exports, process: fakeProcess,
    setTimeout: () => ({ unref() {} }), clearTimeout() {},
    require(name) {
      if (name === './batch') return batch;
      if (name === '../core/processing-mode') return processingMode;
      if (name === './batch-intake-reservation') return { releaseIntake: () => true, RESERVATION_ID_RE: /^[a-f0-9]{64}$/u };
      if (name === './result-export') return {
        terminalVisibleExport(progress, exporter) {
          return progress.complete === true ? exporter() : { exported: 0, pending: 0, available: false };
        }
      };
      if (name === './worker-terminal-presentation') return {
        async presentTerminalEnvelope(options) {
          calls.presentations++;
          calls.envelope = options.envelope;
          await options.present();
          return { presenter: 'worker' };
        }
      };
      if (name === '../companion/completion-summary') return {
        showBatchStateNoticeConfirmed(progress, options) { calls.notices++; calls.notice = progress; calls.noticeOptions = options; return true; },
        showLocalIntakeNoticeConfirmed() { throw new Error('unexpected failure notice'); }
      };
      if (name === './workflow-diagnostics') return { recordWorkflowEvent(event) { calls.events.push(event); return true; } };
      if (name === './automatic-local-review') return { continueIntoLocalReview };
      if (name === './batch-queue-envelope') {
        return require('../plugins/data-secure/server/gateway/batch-queue-envelope');
      }
      throw new Error(`Unexpected dependency ${name}`);
    }
  }, { filename: workerFile, timeout: 1000 });
  await listeners.message({ type: 'start-local-batch', batch_token: token });
  return calls;
}

async function main() {
  await testAsync('an awaiting batch opens review automatically and presents only the reviewed terminal state', async () => {
    const calls = await runWorker(complete);
    assert.strictEqual(calls.review, 1);
    assert.strictEqual(calls.claim, 1);
    assert.strictEqual(calls.release, 1);
    assert.strictEqual(calls.presentations, 1);
    assert.strictEqual(calls.notices, 1);
    assert.strictEqual(calls.noticeOptions.batchToken, token, 'the orphan-worker presenter retains its local batch binding');
    assert.strictEqual(calls.envelope.batch_phase, 'complete');
    assert.strictEqual(calls.exports, 1);
    assert.strictEqual(JSON.stringify(calls.sent), JSON.stringify([{ type: 'local-batch-accepted' }]));
    assert.deepStrictEqual(calls.exits, [0]);
    assert.doesNotMatch(JSON.stringify(calls.envelope), /batch_token|source|filename|path|raw_content|bbbb/u);
  });

  await testAsync('Später keeps the batch resumable without opening a second local notice', async () => {
    const deferred = { ...waiting, ok: false, error: 'LOCAL_REVIEW_DEFERRED' };
    const calls = await runWorker(deferred);
    assert.strictEqual(calls.review, 1);
    assert.strictEqual(calls.exports, 0);
    assert.strictEqual(calls.presentations, 0, 'the local Later choice is not followed by another dialog');
    assert.strictEqual(calls.notices, 0);
    assert.strictEqual(calls.envelope, undefined);
    assert.strictEqual(JSON.stringify(calls.sent), JSON.stringify([
      { type: 'local-batch-accepted' }, { type: 'local-review-paused' }
    ]));
    assert.deepStrictEqual(calls.exits, [0]);
  });

  await testAsync('a reviewer failure fails closed at the durable awaiting-review checkpoint', async () => {
    const calls = await runWorker(new Error('private reviewer failure'));
    assert.strictEqual(calls.review, 1);
    assert.strictEqual(calls.envelope.batch_phase, 'awaiting_local_review');
    assert.strictEqual(calls.exports, 0);
    assert.strictEqual(calls.presentations, 1);
    assert.deepStrictEqual(calls.exits, [0]);
    assert.doesNotMatch(JSON.stringify(calls), /private reviewer failure/u);
  });

  await testAsync('a clear completed batch skips review and retains the single terminal presentation', async () => {
    const calls = await runWorker(null, complete);
    assert.strictEqual(calls.review, 0);
    assert.strictEqual(calls.claim, 0);
    assert.strictEqual(calls.release, 0);
    assert.strictEqual(calls.presentations, 1);
    assert.strictEqual(calls.notices, 1);
    assert.strictEqual(calls.envelope.batch_phase, 'complete');
  });
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
