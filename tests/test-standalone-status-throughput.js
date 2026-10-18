'use strict';

// Real held journal bytes. Hints are process-local negative status knowledge,
// not cached mutation/cleanup authority and not a native desktop benchmark.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const base = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(base, 'datasecure-status-throughput-'));
const count = process.argv.includes('--profile=320') ? 320 : 8;
assert.ok(process.argv.slice(2).every(arg => arg === '--profile=320'));
let validations = 0, livePid = false, anchorAvailable = true;
const now = Date.now(), pid = 12345, pseudonyms = createBatchPseudonymState({ productChannel: 'standalone' });
const journal = createBatchJournalStore({ batchPath: token => path.join(root, `${token}.json`),
  productChannel: 'standalone', assertContentBinding() { validations++; if (!anchorAvailable) throw Error('ANCHOR_UNAVAILABLE'); },
  processAlive: value => value === pid && livePid });
const states = [];
const { publicProgress } = createBatchProgress({ liveLocalExecutor: () => false });
const recovery = createBatchRecovery({ batchRoot: () => root, batchPath: token => path.join(root, `${token}.json`),
  readStateForMaintenance: journal.readStateForMaintenance, terminalStatusUnchanged: journal.terminalStatusUnchanged,
  readActiveLock: () => null, processAlive: () => false, liveLocalExecutor: () => false,
  publicProgress, recoverableState: () => true, visibleExportStatus: () => ({ exported: 0, pending: 0, available: false }) });
const snapshot = selectedBatchId => recovery.productStatusSnapshot('standalone',
  { localUiSelection: true, skipUnobservedTerminal: true, selectedBatchId });
try {
  for (let i = 1; i <= count; i++) {
    const token = i.toString(16).padStart(64, '0');
    const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone', ...pseudonyms,
      created_at: new Date(now + i).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
      items: [{ id: i.toString(16).padStart(32, '0'), name: 'synthetic.txt', status: 'stopped', error_code: 'SOURCE_READ_FAILED' }] };
    journal.writeState(state); states.push(state);
  }
  validations = 0; snapshot();
  assert.equal(validations, count, 'a fresh process fully validates each terminal journal once');
  validations = 0;
  const started = process.hrtime.bigint();
  for (let i = 0; i < 3; i++) {
    const result = snapshot();
    assert.equal(result.recovery.recoverable_batches, 0); assert.equal(result.latest, null);
  }
  const warmMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(validations, 0, 'idle polls skip historical semantic/content checks, not held-byte verification');
  snapshot(states[0].token);
  assert.equal(validations, 1, 'explicitly observed history always takes the full reader');
  validations = 0; recovery.recoverableBatchStatus(); assert.equal(validations, 0);
  const first = states[0], target = path.join(root, `${first.token}.json`), original = fs.readFileSync(target);
  const stamp = fs.statSync(target);
  const changed = Buffer.from(original.toString().replace('SOURCE_READ_FAILED', 'SOURCE_READ_DENIED'));
  assert.equal(changed.length, original.length);
  fs.writeFileSync(target, changed); fs.utimesSync(target, stamp.atime, stamp.mtime);
  assert.equal(journal.terminalStatusUnchanged(first.token), false, 'equal size and restored mtime cannot conceal changed bytes');
  journal.readStateForMaintenance(first.token);
  const replacement = `${target}.replacement`; fs.writeFileSync(replacement, changed);
  fs.renameSync(target, `${target}.old`); fs.renameSync(replacement, target);
  assert.equal(journal.terminalStatusUnchanged(first.token), false, 'byte-identical file replacement cannot reuse the original binding');
  journal.readStateForMaintenance(first.token);
  first.items[0].status = 'retryable'; journal.writeState(first);
  assert.equal(journal.terminalStatusUnchanged(first.token), false, 'publication invalidates before the next read');
  const pending = snapshot(); assert.equal(pending.recovery.recoverable_batches, 1);
  assert.equal(recovery.recoverableBatchStatus().recoverable_batches, 1);
  for (const patch of [{ local_mapping_exported: false }, { work_copy_cleanup_pending: true }]) {
    const state = { ...first, items: [{ ...first.items[0], status: 'stopped', ...patch }] };
    journal.writeState(state); journal.readStateForMaintenance(first.token);
    assert.equal(journal.terminalStatusUnchanged(first.token), false, 'terminal-looking cleanup/mapping debt is never skipped');
  }
  const terminal = { ...first, local_executor_pid: pid, items: [{ ...first.items[0], status: 'stopped' }] };
  journal.writeState(terminal); journal.readStateForMaintenance(first.token);
  livePid = true; assert.equal(journal.terminalStatusUnchanged(first.token), false, 'PID liveness is observed afresh');
  livePid = false; assert.equal(journal.terminalStatusUnchanged(first.token), true);
  // The hint is not a read/cleanup capability. Original operations still check
  // the dependency even when a status-only hint matches identical journal bytes.
  anchorAvailable = false;
  assert.throws(() => journal.readStateForMaintenance(first.token), /ANCHOR_UNAVAILABLE/u);
  assert.throws(() => journal.readState(first.token), /ANCHOR_UNAVAILABLE/u);
  anchorAvailable = true;
  const deleted = journal.readStateForMaintenance(first.token);
  assert.equal(journal.removeState(deleted), true);
  assert.equal(journal.terminalStatusUnchanged(first.token), false);
  const fresh = createBatchJournalStore({ batchPath: token => path.join(root, `${token}.json`), assertContentBinding() {} });
  assert.equal(fresh.terminalStatusUnchanged(states[1].token), false, 'no terminal hint survives a fresh reader/process');
  console.log(JSON.stringify({ terminal_runs: count, repeated_idle_polls: 3, semantic_revalidations: 0,
    held_journal_bytes_still_checked: true, warm_polls_ms: warmMs }));
  console.log('PASS: bounded status hints, exact observed reads, byte/replacement/liveness/debt invalidation');
} finally {
  assert.equal(path.dirname(root), base); assert.ok(path.basename(root).startsWith('datasecure-status-throughput-'));
  fs.rmSync(root, { recursive: true, force: true });
}
