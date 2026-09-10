'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let probeStage = 'loading';

// Each scenario gets a fresh product process and private namespace. The actual
// extractor is injected only instead of its native process launcher, not as a
// canned result: intake, conversion, manifest, journal, delivery, projection,
// export and resume are the production implementations.
async function probe(scenario, root) {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
  const { readMarkdownArtifact, artifactRoot } = require('../plugins/data-secure/server/standalone/markdown-store');
  const { saveConfiguredResultRoot } = require('../plugins/data-secure/server/gateway/result-folder-config');
  const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
  const token = 'c'.repeat(64);
  const raw = '# Auftrag\nName: Max Mustermann\nArbeitgeber: Nordstern Medizin GmbH\n';
  const source = path.join(root, 'synthetic.md');
  const results = path.join(root, 'results');
  fs.mkdirSync(results);
  fs.writeFileSync(source, raw);
  saveConfiguredResultRoot(results);
  const terminationScenario = ['unconfirmed-termination', 'restored-unconfirmed-termination'].includes(scenario);
  const continuationScenario = /^(?:crash|active)-v[45]$/u.test(scenario);
  const processingMode = scenario.endsWith('-v4') ? 'markdown-and-anonymize' : 'markdown-only';
  const sources = [source];
  if (terminationScenario) {
    const other = path.join(root, 'second.md'); fs.writeFileSync(other, raw); sources.push(other);
  }
  batch.beginBatch({ token, expectedCount: sources.length, processingMode, profile: 'auto',
    queue: sources.map(full => ({ name: path.basename(full), full, sourceBytes: Buffer.byteLength(raw) })) });
  const initial = batch._test.readState(token);
  const itemId = initial.items[0].id;
  if (continuationScenario) {
    let starts = 0, pipelineRuns = 0, execution;
    const deps = { executorPid: process.pid,
      convertBuffer: (bytes, extension) => extractMarkdownBuffer(bytes, extension),
      // Use the actual text extractor in both purpose paths. Only its native
      // launch boundary is replaced, as in the other integration scenarios.
      convertDocument: async (_source, options) => {
        const extracted = await extractMarkdownBuffer(options.inputBuffer, '.md');
        return { markdown: extracted.markdown, attachments: [], warnings: [],
          unreviewedVisualCount: 0, requiresExplicitProfile: false };
      },
      beforePublish: async () => { pipelineRuns++; }
    };
    const statusSnapshot = () => {
      const snapshot = batch.productStatusSnapshot('standalone');
      return { current: { ...snapshot.recovery, engine_ready: true }, latest: snapshot.latest };
    };
    const app = new StandaloneApplicationService({ dependencies: {
      publicStatusSnapshot: statusSnapshot, lightweightStatus: () => statusSnapshot().current,
      continueMostRecentBatch: batch.continueMostRecentBatch,
      startLocalBatchExecutor(batchToken) {
        starts++;
        const claimed = batch.claimLocalBatchExecutor(batchToken, process.pid);
        if (claimed.ok !== true) throw new Error('Fixture claim failed');
        execution = batch.runLocalBatchExecutor(batchToken, deps);
        return { ok: true, local_processing_started: true, ipcAcknowledgement: Promise.resolve() };
      }
    } });
    batch.claimLocalBatchExecutor(token, process.pid);
    if (scenario.startsWith('active-')) {
      probeStage = 'active-checkpoint';
      const processing = batch._test.readState(token);
      processing.items[0].status = 'processing'; processing.items[0].checkpoint = 'processing_started';
      batch._test.writeState(processing);
      try {
        probeStage = 'active-status';
        const status = app.status();
        probeStage = 'active-continue';
        let rejected;
        try { await app.continueCurrentBatch(); } catch (error) { rejected = error.code; }
        return { state: status.state, processing: status.processing, resumable: status.resumable,
          rejected, starts, unchanged: batch._test.readState(token).items[0].status === 'processing' };
      } finally { probeStage = 'active-release'; batch.releaseLocalBatchExecutor(token, process.pid); }
    }
    const journal = path.join(batch._test.batchRoot(), `${token}.json`);
    const rename = fs.renameSync;
    let injected = false, interrupted;
    try {
      fs.renameSync = (from, to) => {
        if (!injected && path.resolve(to) === path.resolve(journal)) {
          let candidate;
          try { candidate = JSON.parse(fs.readFileSync(from, 'utf8')); } catch { /* unrelated atomic file */ }
          const checkpoint = processingMode === 'markdown-only' ? 'delivery_pending' : 'mapping_pending';
          if (candidate?.items?.[0]?.checkpoint === checkpoint) {
            injected = true;
            throw Object.assign(new Error('Synthetic journal interruption after real publication'), { code: 'EIO' });
          }
        }
        return rename(from, to);
      };
      interrupted = await batch.processBatchNext(token, deps);
    } finally { fs.renameSync = rename; batch.releaseLocalBatchExecutor(token, process.pid); }
    const before = app.status();
    const checkpoint = batch._test.readState(token).items[0];
    let continued, failure;
    try { continued = await app.continueCurrentBatch(); } catch (error) { failure = error.code; }
    if (execution) await execution;
    const after = batch._test.readState(token);
    const exported = batch.exportCompletedBatchResults(token);
    return { injected, interrupted: interrupted.ok === false, checkpoint: checkpoint.status,
      before: before.state, recoverable: before.recoverable_count, continued: continued?.ok === true,
      failure: failure || null, starts, pipelineRuns, item: after.items[0].status,
      mode: batch.readBatchProcessingMode(token), exported: exported.available,
      after: app.status().state, original_unchanged: fs.readFileSync(source, 'utf8') === raw };
  }
  if (scenario === 'purpose-guards') {
    const { migrateLegacyBatchState } = require('../plugins/data-secure/server/gateway/batch-private-artifact-migration');
    const { exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
    const rejected = [];
    for (const mutate of [state => { state.product_channel = 'plugin'; }, state => { state.processing_mode = 'markdown-and-anonymize'; }]) {
      for (const check of [state => migrateLegacyBatchState(state), state => exactPendingEntry(state, state.items[0])]) {
        const clone = structuredClone(initial); mutate(clone);
        try { check(clone); rejected.push(false); } catch (error) { rejected.push(['PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN'].includes(error.code)); }
      }
    }
    return { rejected, unchanged: JSON.stringify(batch._test.readState(token)) === JSON.stringify(initial) };
  }
  if (['missing-published-artifact', 'unsafe-published-artifact', 'unsafe-recovery-mapping-debt'].includes(scenario)) {
    initial.items[0].status = 'processing';
    initial.items[0].checkpoint = 'publication_unconfirmed';
    initial.items[0].artifact_id = `dm_${itemId}`;
    batch._test.writeState(initial);
    if (scenario.startsWith('unsafe-')) {
      const folder = path.join(artifactRoot(), `dm_${itemId}`);
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'manifest.json'), '{}');
    }
    if (scenario === 'unsafe-recovery-mapping-debt') {
      const { createBatchReconciliation } = require('../plugins/data-secure/server/gateway/batch-reconciliation');
      const reconciliation = createBatchReconciliation({ appendMapping() { throw new Error('Synthetic mapping failure'); } });
      reconciliation.markInterruptedItemsRetryable(initial);
      batch._test.writeState(initial);
      const before = batch.recoverableBatchStatus();
      const debt = batch._test.readState(token).items[0];
      const repaired = batch._test.readState(token);
      batch._test.reconcilePreflightStoppedMappings(repaired);
      batch._test.writeState(repaired);
      return { status: debt.status, mapping_pending: debt.local_mapping_exported === false,
        recoverable: before.recoverable_batches, repaired: batch._test.readState(token).items[0].local_mapping_exported,
        recoverable_after: batch.recoverableBatchStatus().recoverable_batches };
    }
    const resumed = batch.resumeBatch(token);
    const state = batch._test.readState(token);
    return { ok: resumed.ok, status: state.items[0].status, error_code: state.items[0].error_code || null,
      artifact_present: Object.hasOwn(state.items[0], 'artifact_id'), mode: state.processing_mode,
      released: state.items.filter(item => item.status === 'released').length };
  }
  if (scenario === 'restored-unconfirmed-termination') {
    // Crash after the first durable failure, before the old executor reached
    // its stop-siblings guard. A new executor must not start the pending item.
    const item = initial.items[0]; item.status = 'stopped'; item.checkpoint = 'stopped';
    item.error_code = 'CONVERSION_TERMINATION_UNCONFIRMED'; item.local_mapping_exported = true;
    item.document_result = require('../plugins/data-secure/server/gateway/document-result-grade').notProcessedDocumentResult(item.error_code);
    batch._test.writeState(initial);
  }
  probeStage = 'claiming';
  batch.claimLocalBatchExecutor(token, process.pid);
  probeStage = 'processing';
  let conversions = 0;
  const convertBuffer = terminationScenario ? async () => {
    conversions++;
    throw Object.assign(new Error('Fixed synthetic termination boundary'), { code: 'CONVERSION_TERMINATION_UNCONFIRMED' });
  } : (bytes, extension) => extractMarkdownBuffer(bytes, extension);
  const result = await batch.runLocalBatchExecutor(token, { executorPid: process.pid, convertBuffer });
  probeStage = 'read-final';
  const state = batch._test.readState(token);
  if (terminationScenario) {
    const latest = batch.productStatusSnapshot('standalone');
    const app = new StandaloneApplicationService({ dependencies: {
      publicStatusSnapshot: () => ({ current: { ...latest.recovery, engine_ready: true }, latest: latest.latest }),
      lightweightStatus: () => ({ ...latest.recovery, engine_ready: true })
    } });
    return { ok: result.ok, error: result.error, conversions, complete: result.complete,
      statuses: state.items.map(item => item.status), codes: state.items.map(item => item.error_code),
      recoverable: batch.recoverableBatchStatus().recoverable_batches,
      resume_ok: batch.resumeBatch(token).ok, termination_unconfirmed: app.status().termination_unconfirmed,
      originals_unchanged: sources.every(full => fs.readFileSync(full, 'utf8') === raw) };
  }
  if (state.items[0].status !== 'released') return {
    failed: state.items[0].error_code || 'ITEM_NOT_RELEASED', stage: state.items[0].checkpoint,
    item_status: state.items[0].status, complete: result.complete
  };
  probeStage = 'read-artifact';
  const stored = readMarkdownArtifact(`dm_${itemId}`);
  probeStage = 'export';
  const visible = batch.exportCompletedBatchResults(token);
  if (scenario === 'retained-visible-result') {
    const { cleanupMarkdownArtifacts } = require('../plugins/data-secure/server/standalone/markdown-retention');
    const protection = batch.openBatchPackageProtection();
    const cleanup = cleanupMarkdownArtifacts({ protectionComplete: protection.complete, protectedIds: protection.ids,
      cutoff: Date.now() + 1000 });
    if (cleanup.removed !== 1 || cleanup.errors !== 0) throw Object.assign(new Error('Fixture retention failed'), { code: 'PROBE_FAILED' });
    const progress = batch.readBatchProgress(token);
    return { removed: cleanup.removed, grades_verified: progress.result_grades_verified,
      terminal: batch._test.writeTerminalEvidence(batch._test.readState(token)),
      exported: batch.exportCompletedBatchResults(token).available,
      result_count: batch.latestProductBatchStatus('standalone').result_count,
      source_unchanged: fs.readFileSync(source, 'utf8') === raw };
  }
  const statusSnapshot = () => {
    const snapshot = batch.productStatusSnapshot('standalone');
    return { current: { ...snapshot.recovery, engine_ready: true }, latest: snapshot.latest };
  };
  const app = new StandaloneApplicationService({ dependencies: {
    publicStatusSnapshot: statusSnapshot,
    lightweightStatus: () => statusSnapshot().current
  } });
  probeStage = 'app-status';
  const status = app.status();
  return { complete: result.complete, released: result.released,
    mode: state.processing_mode, stored_raw: stored.markdown === raw,
    anonymized: stored.manifest.anonymized, privacy_receipt: Object.hasOwn(state, 'terminal_evidence'),
    pseudonym_state: Object.keys(state).some(key => key.startsWith('pseudonym_')),
    visible: visible.available, state: status.state, result_count: status.result_count,
    original_unchanged: fs.readFileSync(source, 'utf8') === raw };
}

if (process.argv[2] === '--probe') {
  probe(process.argv[3], process.argv[4]).then(result => process.stdout.write(JSON.stringify(result)), error => {
    // Only fixed code families; never exception messages/source content.
    const code = /^[A-Z][A-Z0-9_]{0,95}$/u.test(error?.code || '') ? error.code : 'PROBE_FAILED';
    process.stdout.write(JSON.stringify({ failed: code, stage: probeStage }));
    process.exitCode = 1;
  });
} else {
  const { createSuite } = require('./helpers');
  const { test, assert, done } = createSuite('Markdown lifecycle independent review');
  function cleanup(root) {
    const resolved = fs.realpathSync(root);
    assert.strictEqual(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('datasecure-md-review-'));
    const plan = [];
    function inspect(folder) {
      for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name); const stat = fs.lstatSync(full);
        assert.ok(!stat.isSymbolicLink()); assert.strictEqual(fs.realpathSync(full), full);
        if (stat.isDirectory()) inspect(full); else assert.ok(stat.isFile());
        plan.push({ full, directory: stat.isDirectory() });
      }
    }
    inspect(resolved);
    for (const target of plan) {
      if (target.directory) fs.rmdirSync(target.full); else fs.unlinkSync(target.full);
    }
    fs.rmdirSync(resolved);
  }
  function run(scenario) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-md-review-')));
    try {
      fs.mkdirSync(path.join(root, 'private'));
      const child = spawnSync(process.execPath, [__filename, '--probe', scenario, root], {
        windowsHide: true, timeout: 20000, encoding: 'utf8', maxBuffer: 65536,
        env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone',
          EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_DATA_ROOT: path.join(root, 'private'),
          LOCALAPPDATA: path.join(root, 'localapp'), EU_PRIVACY_RETENTION_DAYS: '7' }
      });
      assert.strictEqual(child.stderr, '');
      assert.strictEqual(child.status, 0, child.stdout);
      return JSON.parse(child.stdout);
    } finally { cleanup(root); }
  }
  test('real v5 executor publishes raw Markdown without privacy state and the application shows the result', () => {
    assert.deepStrictEqual(run('complete'), {
      complete: true, released: 1, mode: 'markdown-only', stored_raw: true,
      anonymized: false, privacy_receipt: false, pseudonym_state: false,
      visible: true, state: 'results_available', result_count: 1, original_unchanged: true
    });
  });
  test('a missing publication target can resume without an unverified dm locator in retry state', () => {
    assert.deepStrictEqual(run('missing-published-artifact'), {
      ok: true, status: 'pending', error_code: null, artifact_present: false,
      mode: 'markdown-only', released: 0
    });
  });
  test('an unsafe publication target is stopped without overwriting it or inventing a successful result', () => {
    assert.deepStrictEqual(run('unsafe-published-artifact'), {
      ok: false, status: 'stopped', error_code: 'RECOVERY_FAILED', artifact_present: false,
      mode: 'markdown-only', released: 0
    });
  });
  test('v5 snapshot and compatibility entry points reject cross-purpose journals before reading bytes', () => {
    assert.deepStrictEqual(run('purpose-guards'), { rejected: [true, true, true, true], unchanged: true });
  });
  test('unsafe publication mapping debt stays repairable without restarting conversion', () => {
    assert.deepStrictEqual(run('unsafe-recovery-mapping-debt'), {
      status: 'stopped', mapping_pending: true, recoverable: 1, repaired: true, recoverable_after: 0
    });
  });
  for (const scenario of ['unconfirmed-termination', 'restored-unconfirmed-termination']) {
    test(`${scenario} stops unstarted siblings, preserves the cause and cannot resume that batch`, () => {
      assert.deepStrictEqual(run(scenario), {
        ok: false, error: 'CONVERSION_TERMINATION_UNCONFIRMED', conversions: scenario.startsWith('restored') ? 0 : 1,
        complete: true, statuses: ['stopped', 'stopped'],
        codes: ['CONVERSION_TERMINATION_UNCONFIRMED', 'CONVERSION_TERMINATION_UNCONFIRMED'],
        recoverable: 0, resume_ok: false, termination_unconfirmed: true, originals_unchanged: true
      });
    });
  }
  test('private conversion retention preserves the completed visible transaction and terminal projection', () => {
    assert.deepStrictEqual(run('retained-visible-result'), {
      removed: 1, grades_verified: true, terminal: true, exported: true, result_count: 1, source_unchanged: true
    });
  });
  test('fixed conversion and purpose causes survive all diagnostic projections without raw text', () => {
    const { ERROR_CODES, LIFECYCLE_ERROR_CODES } = require('../plugins/data-secure/server/standalone/conversion-worker-contract');
    const sanitizers = [
      require('../plugins/data-secure/server/gateway/workflow-diagnostics').sanitizeWorkflowEvent,
      require('../plugins/data-secure/server/gateway/diagnostics').sanitizeDiagnostic,
      require('../plugins/data-secure/server/gateway/support-trace').sanitizeSupportTrace
    ];
    for (const error_code of [...ERROR_CODES, ...LIFECYCLE_ERROR_CODES, 'PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN',
      'PRODUCT_CHANNEL_INVALID', 'BATCH_PROCESSING_MODE_CHANGED', 'BATCH_MARKDOWN_STATE_INVALID']) {
      for (const sanitize of sanitizers) {
        const projection = sanitize({ error_code, raw: 'NEVER_LOG_SYNTHETIC_INPUT', path: 'NEVER_LOG_SYNTHETIC_PATH' });
        assert.strictEqual(projection.error_code, error_code);
        assert.ok(!JSON.stringify(projection).includes('NEVER_LOG'));
        assert.strictEqual(sanitize({ error_code: 'NEVER_LOG_SYNTHETIC_INPUT' }).error_code, 'INTERNAL_FAILURE');
      }
    }
  });
  for (const version of ['v4', 'v5']) {
    test(`${version}: real post-publication recovery is shown as resumable and one Continue completes delivery`, () => {
      assert.deepStrictEqual(run(`crash-${version}`), {
        injected: true, interrupted: true, checkpoint: 'processing', before: 'stopped', recoverable: 1,
        continued: true, failure: null, starts: 1, pipelineRuns: 1, item: 'released',
        mode: version === 'v4' ? 'markdown-and-anonymize' : 'markdown-only', exported: true,
        after: 'results_available', original_unchanged: true
      });
    });
    test(`${version}: a real live executor remains processing and blocks Continue before another start`, () => {
      assert.deepStrictEqual(run(`active-${version}`), {
        state: 'processing', processing: true, resumable: false,
        rejected: 'STANDALONE_BUSY', starts: 0, unchanged: true
      });
    });
  }
  done();
}
