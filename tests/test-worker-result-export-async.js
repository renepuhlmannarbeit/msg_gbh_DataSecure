'use strict';
// Eventually tests/test-worker-result-export-async.js. The optional RAM product
// image is supplied by the unapplied-delta runner only; normal test loading uses
// the integrated production files. No native/OS/PID proof is claimed here.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os');
const path = require('node:path'), crypto = require('node:crypto'), Module = require('node:module');
const originalStackLimit = Error.stackTraceLimit; Error.stackTraceLimit = 80;
const repo = process.env.DS_ASYNC_EXPORT_REPO || path.resolve(__dirname, '..');
const product = path.join(repo, 'plugins/data-secure/server');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ds-worker-export-async-'));
for (const [variable, directory] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'workspace'], ['EU_PRIVACY_RESULT_ROOT', 'results']]) {
  process.env[variable] = path.join(scope, directory); fs.mkdirSync(process.env[variable], { mode: 0o700 });
}
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const rawBusy = () => Object.assign(Error('raw busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
let faults = [], entries = 0, holds = 0, waits = 0, virtualNow = 0, checks = 0;
const heldRoots = new Map();
const count = value => { assert.ok(value); checks++; };
const realLoad = Module._load;
let actualAdmission;
let admittedFault;
Module._load = function(id, parent, isMain) {
  const filename = !Module.isBuiltin(id) ? Module._resolveFilename(id, parent) : id;
  if (filename === path.join(product, 'core/ownership-control.js')) return { withOwnershipControl(root, action) {
    assert.ok([process.env.EU_PRIVACY_DATA_ROOT, path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Output')].includes(root),
      'only private control and the exact output container are ownership roles, never a result run');
    const prior = heldRoots.get(root);
    if (prior) { prior.assertHeld(); const value = action(prior);
      assert.ok(!value || typeof value.then !== 'function', 'no Promise may escape a reentrant kernel callback');
      prior.assertHeld(); return value; }
    const stack = Error().stack;
    const fault = admittedFault && !admittedFault.done ? admittedFault : faults.find(value => !value.done && stack.includes(value.where));
    if (fault?.before) { fault.count++; if (fault.count >= fault.times) fault.done = true; throw fault.error; }
    const guard = { assertHeld() { assert.equal(heldRoots.get(root), guard); } };
    holds++; entries++; heldRoots.set(root, guard);
    try {
      const value = action(guard);
      assert.ok(!value || typeof value.then !== 'function', 'no Promise may escape a held kernel callback');
      if (fault) { fault.count++; fault.done = true; throw fault.error; }
      return value;
    } finally { heldRoots.delete(root); holds--; }
  } };
  if (filename === path.join(product, 'gateway/synchronous-ownership-admission.js')) {
    actualAdmission ||= realLoad.apply(this, arguments).admitSynchronousOwnership;
    return { admitSynchronousOwnership(control, action, options) {
      const stack = Error().stack, fault = faults.find(value => !value.done && stack.includes(value.where));
      const wrapped = callback => { const previous = admittedFault; admittedFault = fault;
        try { return control(callback); } finally { admittedFault = previous; } };
      return actualAdmission(wrapped, action, { ...options, monotonicNow: () => virtualNow,
        async delay(milliseconds) { assert.equal(holds, 0, 'wait must be outside native callback'); waits++; virtualNow += milliseconds; } });
    } };
  }
  return realLoad.apply(this, arguments);
};
const req = name => require(path.join(product, name));
const batch = req('gateway/batch'), exporter = req('gateway/result-export');
const { createDocumentReviewStore } = req('gateway/standalone-document-review-store');
const { createBatchActiveLock } = req('gateway/batch-active-lock');
const { createContentOperationAuthority } = req('gateway/content-operation-authority');
const { createPrivateWorkStore } = req('gateway/private-work-store');
const { copySnapshotFile, exactPendingEntry } = req('gateway/batch-snapshot');
const { createBatchPseudonymState, withBatchPseudonymRegistry } = req('batch-pseudonym-context');
const { createPrivateIoSummary } = req('gateway/performance');
const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
function inject(where, error = rawBusy(), before = true, times = 1) { faults.push({ where, error, before, times, count: 0, done: false }); }
async function fixture() {
  faults = [];
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex');
  const bytes = Buffer.from('Fachlicher Bericht.\n'), source = path.join(scope, `source-${id}.txt`);
  fs.writeFileSync(source, bytes, { flag: 'wx', mode: 0o600 });
  const item = { id, name: 'synthetic.txt', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    work_name: `001_${crypto.randomBytes(12).toString('hex')}.txt`, private_artifact_plain: true, status: 'processing', checkpoint: 'processing_started' };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, standalone_review_policy: 'automatic-conservative', content_options: content,
    profile: 'general', remove_images: false, output_naming_mode: 'neutral', created_at: new Date().toISOString(),
    expires_at: '2099-01-01T00:00:00.000Z', io_summary: createPrivateIoSummary(),
    ...createBatchPseudonymState({ productChannel: 'standalone' }), items: [item] };
  const work = batch._test.workPath(token); fs.mkdirSync(work, { mode: 0o700 });
  const workStore = createPrivateWorkStore({ privateRoot: batch._test.batchRoot() });
  copySnapshotFile(source, path.join(work, item.work_name), fs.statSync(source), { privateWorkStore: workStore, expectedSha256: item.sha256 });
  batch._test.writeState(state);
  const review = createDocumentReviewStore(); review.captureRun(state);
  const lock = createBatchActiveLock({ lockPath: () => path.join(work, 'test-owner.lock') }); lock.acquireActiveLock(token);
  const authority = createContentOperationAuthority({ active: new Set([token]), readStateForMaintenance: batch._test.readStateForMaintenance,
    writeState: batch._test.writeState, captureOwnedEpoch: lock.captureOwnedEpoch, assertOwnedEpoch: lock.assertOwnedEpoch, documentReview: review,
    exactPendingEntry: (saved, member) => exactPendingEntry(saved, member, { privateWorkStore: workStore, workPath: () => work }) });
  const context = authority.consume(authority.issue(token, id, 'publication'));
  try {
    const result = await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(token), registry =>
      req('gateway/content-publication-operation').publishPersistedContent(context, { pseudonymRegistry: registry,
        async convertBuffer(input, extension, settings) {
          const raw = req('standalone/markdown-extractor').extractMarkdownBuffer(input, extension, { markdownOutput: 'content-v1' });
          return req('standalone/markdown-contract').createMarkdownExtraction({ source_type: raw.source_type, markdown: raw.markdown,
            coverage: raw.coverage, content_options: settings.contentOptions });
        }, reviewText() { throw Error('not a human review test'); }, afterPublish() { review.recordPublication(token, id); } }));
    assert.equal(result.ok, true);
  } finally { context.dispose(); lock.releaseActiveLock(token); }
  const saved = batch._test.readStateForMaintenance(token), member = saved.items[0];
  member.status = 'released'; member.checkpoint = 'released_locally'; member.package_id = `ds_${id}`;
  const artifact = req('standalone/anonymized-store').readAnonymizedArtifact(member.package_id, review.publicationExpectation(token, id));
  member.document_result = artifact.manifest.document_result;
  batch._test.writeState(saved);
  return { token, id, state: saved, item: member, review, source, bytes,
    publication: path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', token, id, 'published.json'),
    membership: path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', token, `published-${id}.json`) };
}
const plain = value => JSON.parse(JSON.stringify(value));
async function actualWorker(filename, platform, token) {
  const vm = require('node:vm'), events = {}, frames = [], exits = [];
  let exportCalls = 0, exportSettled = false;
  const gateway = { ...batch,
    async runLocalBatchExecutor(value) { assert.equal(value, token); return batch.readBatchProgress(token); },
    async reviewDeferredBatch(value) { assert.equal(value, token); return batch.readBatchProgress(token); },
    exportCompletedBatchResults() { throw Error('worker must not use the synchronous export API'); },
    async exportCompletedBatchResultsAsync(value) { exportCalls++;
      const result = await batch.exportCompletedBatchResultsAsync(value); exportSettled = true; return result; }
  };
  const fullPath = path.join(product, 'gateway', filename), normalRequire = Module.createRequire(fullPath);
  vm.runInNewContext(fs.readFileSync(fullPath, 'utf8'), {
    require(id) {
      if (id === './batch') return gateway;
      if (id === './workflow-diagnostics') return { recordWorkflowEvent() {} };
      if (id === '../companion/completion-summary') return new Proxy({}, { get() { return () => { throw Error('NO_GUI'); }; } });
      return normalRequire(id);
    }, Buffer, console,
    setTimeout() { return {}; }, clearTimeout() {},
    process: { platform, pid: process.pid, env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' },
      once(name, callback) { events[name] = callback; }, exit(code) { exits.push(code); },
      send(frame, done) { if (frame.type.endsWith('-state')) {
        assert.equal(exportSettled, true, 'no terminal envelope before awaited export settles');
        assert.equal(frame.result_exported_count, 1); assert.equal(frame.result_export_pending_count, 0);
      } frames.push(plain(frame)); done?.(); }
    }
  }, { filename: fullPath, timeout: 1000 });
  await events.message({ type: filename === 'batch-worker.js' ? 'start-local-batch' : 'start-local-review', batch_token: token });
  count(exportCalls === 1 && exits.length === 1 && exits[0] === 0);
  count(frames.some(frame => frame.type === (filename === 'batch-worker.js' ? 'local-batch-state' : 'local-review-state')));
}
async function main() {
  // Direct admission truth table: same exact error identity; no action replay.
  const admission = require(path.join(product, 'gateway/synchronous-ownership-admission.js')).admitSynchronousOwnership;
  for (const code of ['STANDALONE_BUSY', 'BATCH_ACTIVE_LOCK_BUSY', 'OWNERSHIP_GUARD_INVALID', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED']) {
    let calls = 0, actions = 0; const error = Object.assign(Error(code), { code });
    await assert.rejects(admission(() => { calls++; throw error; }, () => actions++), value => value === error);
    count(calls === 1 && actions === 0);
  }
  for (const after of [false, true]) {
    let actions = 0, calls = 0; const error = rawBusy();
    await assert.rejects(admission(callback => { calls++; const value = callback({ assertHeld() {} }); if (after) throw error; return value; },
      () => { actions++; if (!after) throw error; return true; }), value => value === error);
    count(calls === 1 && actions === 1);
  }
  let attempted = 0, ran = 0; const exhausted = rawBusy(), priorWaits = waits;
  await assert.rejects(admission(() => { attempted++; throw exhausted; }, () => ran++), error => error === exhausted);
  count(attempted === 11 && ran === 0 && waits - priorWaits === 10);
  count(await admission(callback => callback({ assertHeld() {} }), () => false) === false);
  await assert.rejects(admission(() => false, () => true), { code: 'OWNERSHIP_GUARD_UNCONFIRMED' }); checks++;
  await assert.rejects(admission(() => Promise.resolve(true), () => true), { code: 'OWNERSHIP_GUARD_UNCONFIRMED' }); checks++;
  await assert.rejects(admission(callback => callback({ assertHeld() {} }), () => Promise.resolve(true)), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' }); checks++;
  const logicalPath = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'admitted-test.lock');
  const owner = createBatchActiveLock({ lockPath: () => logicalPath });
  const contender = createBatchActiveLock({ lockPath: () => logicalPath });
  const logicalToken = 'a'.repeat(64); let logicalActions = 0;
  owner.acquireActiveLock(logicalToken);
  const retained = fs.readFileSync(logicalPath), logicalWaits = waits;
  await assert.rejects(contender.withSynchronousActiveLockAdmitted(logicalToken, () => logicalActions++), { code: 'BATCH_ACTIVE_LOCK_BUSY' });
  count(logicalActions === 0 && waits === logicalWaits); assert.deepEqual(fs.readFileSync(logicalPath), retained); checks++;
  count(owner.releaseActiveLock(logicalToken));
  const actionFailure = rawBusy(); let actionCalls = 0;
  await assert.rejects(contender.withSynchronousActiveLockAdmitted(logicalToken, () => { actionCalls++; throw actionFailure; }), value => value === actionFailure);
  count(actionCalls === 1 && waits === logicalWaits && !fs.existsSync(logicalPath));
  const closeFailure = rawBusy(); inject('withSynchronousActiveLockAdmitted', closeFailure, false);
  await assert.rejects(contender.withSynchronousActiveLockAdmitted(logicalToken, () => { actionCalls++; return true; }), value => value === closeFailure);
  count(actionCalls === 2 && waits === logicalWaits && !fs.existsSync(logicalPath));
  faults = [];

  // Actual batch facade -> exporter plan -> actual review store -> full actual
  // reconcile -> membership. No ensureRecord/confirm/store/IO-body replacements.
  const f = await fixture();
  fs.unlinkSync(f.publication); fs.unlinkSync(f.membership);
  inject('publicationExpectationAsync', rawBusy(), true, 2);
  inject('recordPublicationAsync', rawBusy(), true, 2);
  inject('acquireExportClaimAsync', rawBusy(), true, 2);
  inject('releaseExportClaimAsync', rawBusy(), true, 2);
  inject('exportOneAsync', rawBusy(), true, 2);
  inject('prepareResultCompanions', rawBusy(), true, 2);
  inject('readResultCompanions', rawBusy(), true, 2);
  const beforeWaits = waits;
  const result = await exporter.terminalVisibleExportAsync({ complete: true, released: 1 }, () => batch.exportCompletedBatchResultsAsync(f.token));
  assert.deepEqual(plain(result), { exported: 1, pending: 0, available: true }); checks++;
  assert.deepEqual({ waits: waits - beforeWaits, faults: faults.map(({ where, count, done }) => ({ where, count, done })) },
    { waits: 14, faults: ['publicationExpectationAsync', 'recordPublicationAsync', 'acquireExportClaimAsync', 'releaseExportClaimAsync', 'exportOneAsync',
      'prepareResultCompanions', 'readResultCompanions']
      .map(where => ({ where, count: 2, done: true })) }); checks++;
  count(fs.existsSync(f.publication) && fs.existsSync(f.membership));
  const record = JSON.parse(fs.readFileSync(exporter.recordPath(f.token), 'utf8'));
  count(record.complete && record.items[0].exported);
  const run = exporter.visibleExportDirectory(f.token), markdown = fs.readFileSync(path.join(run, record.items[0].file));
  assert.deepEqual(markdown, Buffer.from(req('standalone/anonymized-store').readAnonymizedArtifact(f.item.package_id,
    f.review.publicationExpectation(f.token, f.id)).markdown)); checks++;
  count(record.result_layout === exporter.CONFIDENTIAL_RESULT_LAYOUT && !fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')));
  count(fs.readFileSync(path.join(run, 'Vertraulich/Dateizuordnung.csv'), 'utf8').includes(record.items[0].file));
  count(fs.readFileSync(path.join(run, 'Vertraulich/Personen-Pseudonym-Zuordnung.txt'), 'utf8').includes('VERTRAULICH'));
  count(fs.readFileSync(exporter.privateResultLedger(f.token), 'utf8').includes('synthetic.txt'));
  assert.deepEqual(fs.readFileSync(f.source), f.bytes); checks++;
  count(!fs.existsSync(exporter._test.claimPath(exporter.recordPath(f.token))));
  const sync = batch.exportCompletedBatchResults(f.token);
  count(sync && typeof sync.then !== 'function' && sync.exported === 1);
  for (const platform of ['win32', 'darwin']) for (const worker of ['batch-worker.js', 'review-worker.js']) {
    faults = []; inject('acquireExportClaimAsync', rawBusy(), true, 2);
    const oldWaits = waits;
    await actualWorker(worker, platform, f.token);
    count(waits - oldWaits === 2 && faults[0].count === 2);
  }

  // Current synchronous status/history route must NOT quietly await or retry.
  const syncFixture = await fixture(); inject('at confirmPublication (', rawBusy());
  const syncWaits = waits, syncPending = batch.exportCompletedBatchResults(syncFixture.token);
  assert.deepEqual(plain(syncPending), { exported: 0, pending: 1, available: false }); checks++;
  count(waits === syncWaits && !syncPending.then);

  // New companion admission retries only raw pre-entry kernel contention.
  // Logical Busy or post-action/close uncertainty cannot replay the action or
  // fabricate completion, even if all MD leaves were already committed.
  for (const where of ['prepareResultCompanions', 'readResultCompanions']) for (const fault of [
    { error: Object.assign(Error('logical'), { code: 'BATCH_ACTIVE_LOCK_BUSY' }), before: true },
    { error: rawBusy(), before: false },
    { error: Object.assign(Error('close'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' }), before: false }
  ]) {
    const bad = await fixture(); inject(where, fault.error, fault.before);
    const oldWaits = waits, result = await batch.exportCompletedBatchResultsAsync(bad.token);
    count(result.available === false && result.exported + result.pending === 1);
    count(waits === oldWaits && faults[0].count === 1 && faults[0].done === true);
  }

  // A logical collision / malformed binding / post-action or close failure is
  // fail-closed pending, never an admitted root wait or plan/copy replay.
  for (const scenario of [
    { where: 'publicationExpectationAsync', error: Object.assign(Error('logical'), { code: 'STANDALONE_BUSY' }), before: true },
    { where: 'recordPublicationAsync', error: rawBusy(), before: false },
    { where: 'recordPublicationAsync', error: Object.assign(Error('close'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' }), before: false },
    { where: 'releaseExportClaimAsync', error: rawBusy(), before: false }
  ]) {
    const bad = await fixture(); inject(scenario.where, scenario.error, scenario.before);
    const oldWaits = waits, value = await batch.exportCompletedBatchResultsAsync(bad.token);
    count(value.available === false && value.pending === 1 && waits === oldWaits && faults[0].count === 1);
  }
  const exhaustedPlan = await fixture();
  inject('publicationExpectationAsync', rawBusy(), true, 99);
  const exhaustedWaits = waits, exhaustedResult = await batch.exportCompletedBatchResultsAsync(exhaustedPlan.token);
  count(exhaustedResult.pending === 1 && exhaustedResult.available === false && waits - exhaustedWaits === 10 && faults[0].count === 11);
  count(!fs.existsSync(exporter.recordPath(exhaustedPlan.token)) && !fs.existsSync(exporter._test.claimPath(exporter.recordPath(exhaustedPlan.token))));
  const corrupted = await fixture();
  const membership = JSON.parse(fs.readFileSync(corrupted.membership, 'utf8'));
  membership.output_sha256 = '0'.repeat(64); fs.writeFileSync(corrupted.membership, JSON.stringify(membership));
  const invalid = await batch.exportCompletedBatchResultsAsync(corrupted.token);
  count(invalid.available === false && invalid.pending === 1);

  // Exact opaque claim capability survives admission Busy; no PID adoption and
  // no retry of false or a completed remove whose native-close failed.
  faults = [];
  const target = exporter.recordPath('e'.repeat(64)), claim = await exporter._test.acquireExportClaimAsync(target);
  inject('releaseExportClaimAsync', rawBusy(), true, 2);
  count(await exporter._test.releaseExportClaimAsync(target, claim) === true);
  const falseWaits = waits;
  count(await exporter._test.releaseExportClaimAsync(target, claim) === false && waits === falseWaits);
  count(await exporter._test.releaseExportClaimAsync(target, { ...claim }) === false);
  count(holds === 0);
  process.stdout.write(JSON.stringify({ checks, entries, waits, source_adapter: true, native: false }) + '\n');
}
main().finally(() => {
  Module._load = realLoad;
  Error.stackTraceLimit = originalStackLimit;
  // Exactly this test-created temp directory; never a product/user root. A
  // failed/locked cleanup is a test failure, not a stronger deletion fallback.
  const resolved = fs.realpathSync.native(scope), parent = fs.realpathSync.native(os.tmpdir());
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('ds-worker-export-async-'));
  const inspect = directory => { for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name), info = fs.lstatSync(target);
    assert.ok(!info.isSymbolicLink()); if (info.isDirectory()) inspect(target); else assert.ok(info.isFile());
  } };
  inspect(resolved); fs.rmSync(resolved, { recursive: true });
}).catch(error => { console.error(error); process.exitCode = 1; });
