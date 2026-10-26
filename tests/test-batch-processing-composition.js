'use strict';

// Actual batch.js composition, Admission, ActiveLock and both orchestrator
// factories execute. Root/kernel, owner filesystem, journal and document work
// are explicit RAM models: no native C/NTFS/Darwin, parser, publication or worker
// execution is claimed. No real private root, file fixture or global env edit.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { createSuite } = require('./helpers');
const { testAsync, test, assert, done } = createSuite('Actual batch admission composition');
const repository = path.resolve(__dirname, '..');
const gateway = 'plugins/data-secure/server/gateway/';
const batchSource = fs.readFileSync(path.join(repository, gateway, 'batch.js'), 'utf8');
const token = 'c'.repeat(64), root = path.resolve(path.parse(repository).root, 'synthetic-admission-composition');
const fail = code => Object.assign(Error(code), { code });
class SafeError extends Error {}

function sourceModule(relative, platform, overrides = {}, source) {
  const filename = path.join(repository, relative), localRequire = Module.createRequire(filename);
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, Buffer, console, setTimeout, clearTimeout,
    process: { platform, arch: 'x64', pid: process.pid, env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } },
    require(id) { return Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id); } });
  vm.runInContext(source ?? fs.readFileSync(filename, 'utf8'), context, { filename, timeout: 1000 });
  return module.exports;
}

function memoryOwnerIo(target, counters, options) {
  const files = new Map(), descriptors = new Map();
  let serial = 10n, nextFd = 100;
  const directory = { ino: 2n, bytes: Buffer.alloc(0), links: 1n, directory: true };
  const missing = () => { throw fail('ENOENT'); };
  const isLeaf = name => name === target || name.startsWith(target + '.prepared-');
  const nodeAt = name => files.get(name) || (isLeaf(name) ? missing() : directory);
  const stat = node => ({ dev: 1n, ino: node.ino, size: BigInt(node.bytes.length),
    birthtimeNs: 1n, nlink: node.links, isFile: () => !node.directory,
    isDirectory: () => Boolean(node.directory), isSymbolicLink: () => false });
  const io = { constants: fs.constants,
    realpathSync: name => path.resolve(name), lstatSync: name => stat(nodeAt(name)),
    openSync(name, flags) {
      if (flags & fs.constants.O_CREAT) {
        if (files.has(name)) throw fail('EEXIST');
        files.set(name, { ino: serial++, bytes: Buffer.alloc(0), links: 1n });
      }
      const node = nodeAt(name); descriptors.set(++nextFd, node); return nextFd;
    },
    fstatSync(fd) { assert(descriptors.has(fd)); return stat(descriptors.get(fd)); },
    writeSync(fd, bytes, offset, length) {
      const node = descriptors.get(fd); assert(node && !node.directory);
      node.bytes = Buffer.concat([node.bytes, bytes.subarray(offset, offset + length)]); return length;
    },
    readSync(fd, output, offset, length, position) {
      const node = descriptors.get(fd); assert(node && !node.directory);
      return node.bytes.copy(output, offset, position, position + length);
    },
    fsyncSync(fd) { assert(descriptors.has(fd)); },
    closeSync(fd) { assert(descriptors.delete(fd)); },
    linkSync(from, to) {
      counters.links++;
      if (options.linkBusy) throw fail('EBUSY');
      if (files.has(to)) throw fail('EEXIST');
      const node = files.get(from); assert(node); node.links++; files.set(to, node);
    },
    unlinkSync(name) {
      const node = files.get(name); if (!node) return missing();
      assert(files.delete(name)); node.links--;
      if (name === target) counters.ownerReleases++;
    }
  };
  return { io, files, descriptors };
}

function fixture(platform, options = {}) {
  const requested = () => false, observeRequested = () => false;
  const counters = { attempts: 0, reentrant: 0, delays: 0, links: 0, ownerReleases: 0,
    admissionFactories: 0, processingFactories: 0, reviewFactories: 0,
    reads: 0, documents: 0, maintenance: 0, legacyAcquires: 0 };
  const target = path.join(root, 'batches', 'active-processing.json');
  const memory = memoryOwnerIo(target, counters, options);
  const state = { schema: 'datasecure-batch/4', token, product_channel: 'standalone',
    items: [1, 2, 3].map(id => ({ id, status: 'pending', checkpoint: 'sealed' })) };
  const response = { ok: true, remaining: 2, synthetic_document_result: true };
  const captured = {};
  let held = false, clock = 0;
  const dataRoot = () => root;
  function control(actualRoot, action) {
    assert.strictEqual(actualRoot, root);
    const guard = { assertHeld() { assert.strictEqual(held, true); return true; } };
    if (held) { counters.reentrant++; return action(guard); }
    counters.attempts++;
    if (counters.attempts <= (options.kernelBusy || 0)) throw fail('OWNERSHIP_GUARD_BUSY');
    held = true;
    try { return action(guard); }
    finally { held = false; if (options.closeBusy) throw fail('OWNERSHIP_GUARD_BUSY'); }
  }
  const runtime = { SafeError, dataRoot };
  const privateStore = { TOKEN_RE: /^[a-f0-9]{64}$/u, batchRoot: () => path.dirname(target),
    batchPath: value => path.join(root, 'batches', value + '.json'), workPath: () => path.join(root, 'work') };
  const journalIo = require('../plugins/data-secure/server/gateway/batch-journal-io');
  const activeModule = sourceModule(gateway + 'batch-active-lock.js', platform, {
    '../runtime': runtime, './batch-private-store': privateStore,
    './batch-journal-io': { ...journalIo,
      syncParentDirectory: (name, io) => journalIo.syncParentDirectory(name, io, platform),
      linkWithTransientRetry() { assert.fail('legacy publication retries are not the Once API'); },
      renameWithTransientRetry() { assert.fail('not a replacement publisher'); } }
  });
  const owner = activeModule.createBatchActiveLock({ fs: memory.io, lockPath: () => target,
    withOwnershipControl: control, process: { pid: process.pid, kill() {} },
    retryDelay() { assert.fail('no held unlink backoff'); } });
  const importedOwner = { ...owner, acquireActiveLock() { counters.legacyAcquires++; assert.fail('Processing must use the actual Once API'); } };
  const actualAdmission = sourceModule(gateway + 'batch-processing-admission.js', platform).createBatchProcessingAdmission;
  const actualProcessing = sourceModule(gateway + 'batch-processing-orchestrator.js', platform).createBatchProcessingOrchestrator;
  const actualReview = sourceModule(gateway + 'batch-review-orchestrator.js', platform, {
    '../core/local-review-model': { MAX_REVIEW_CHARS: 10000, MAX_DARWIN_REVIEW_FINDINGS: 10000 }
  }).createBatchReviewOrchestrator;
  const modules = {
    fs: memory.io, path, crypto: require('node:crypto'), '../runtime': runtime,
    '../core/ownership-control': { withOwnershipControl: control }, './batch-active-lock': importedOwner,
    './batch-private-store': privateStore, './common': { PROFILES: {}, LIMITS: { MAX_BATCH_FILES: 100 } },
    './batch-processing-admission': { createBatchProcessingAdmission(deps) {
      counters.admissionFactories++; captured.admission = deps;
      if (deps.acquireActiveLock !== owner.acquireActiveLockOnce) throw fail('COMPOSITION_ONCE_API_REQUIRED');
      assert.strictEqual(deps.withOwnershipControl, control); assert.strictEqual(deps.dataRoot, dataRoot);
      return actualAdmission({ ...deps, monotonicNow: () => clock, async delay(ms) {
        assert.strictEqual(held, false); assert.strictEqual(memory.files.has(target), false);
        assert.strictEqual(captured.processing.active.has(token), true);
        counters.delays++; clock += ms; await Promise.resolve();
      } });
    } },
    './batch-processing-orchestrator': { createBatchProcessingOrchestrator(deps) {
      counters.processingFactories++; captured.processing = deps;
      return actualProcessing(deps);
    } },
    './batch-review-orchestrator': { createBatchReviewOrchestrator(deps) {
      counters.reviewFactories++; captured.review = deps; return actualReview(deps);
    } },
    './batch-journal-store': { createBatchJournalStore: () => ({
      readState(value) { assert.strictEqual(value, token); counters.reads++; return state; },
      writeState() { assert.fail('no modeled processing journal write before document'); },
      readStateForMaintenance() { assert.fail('not a maintenance reconstruction test'); }
    }) },
    './batch-executor-lease': { createBatchExecutorLease: () => ({ assertLocalExecutorAccess() {} }) },
    './batch-next-maintenance': { createBatchNextMaintenance: () => ({ maintainBeforeNext() { counters.maintenance++; } }) },
    './batch-item-processor': { createBatchItemProcessor: () => ({ processSingleBatchItem() {
      assert.strictEqual(held, false, 'no kernel guard over asynchronous work');
      assert.strictEqual(memory.files.has(target), true, 'real ActiveLock publication remains owned');
      assert.strictEqual(captured.processing.active.has(token), true);
      counters.documents++; return response;
    } }) },
    './batch-snapshot': { exactPendingEntry: () => ({ synthetic_sealed_entry: true }) },
    './batch-private-artifact-migration': { migrateLegacyBatchState() {} },
    '../batch-pseudonym-context': { withBatchPseudonymRegistry: (_state, action) => action(undefined) },
    './standalone-pause': { createStandalonePause: () => ({ requested, observeRequested }) },
    './batch-progress': { createBatchProgress: deps => { captured.progress = deps; return { publicProgress: () => ({ remaining: 3 }) }; } },
    './batch-executor-lease-finish': { createBatchExecutorLeaseFinish: () => function () {} }
  };
  // Only unrelated factory construction is replaced. Unexpected module loads
  // throw: there is no permissive proxy, implicit real IO or generic fallback.
  for (const [id, name] of Object.entries({
    './batch-terminal-evidence': 'createBatchTerminalEvidence', './batch-results': 'createBatchResultAccess',
    './batch-reconciliation': 'createBatchReconciliation', './batch-recovery': 'createBatchRecovery',
    './batch-retention-protection': 'createBatchRetentionProtection', './batch-delivery': 'createBatchDelivery',
    './batch-mapping-maintenance': 'createBatchMappingMaintenance', './batch-intake': 'createBatchIntake',
    './batch-discard': 'createBatchDiscard', './batch-continuation': 'createBatchContinuation',
    './batch-snapshot-invalidation': 'createBatchSnapshotInvalidation', './batch-executor-runner': 'createBatchExecutorRunner',
    './batch-review-capture': 'createBatchReviewCapture', './batch-review-state': 'createBatchReviewState',
    './batch-review-publication': 'createBatchReviewPublication', './ocr-contact-store': 'createContactStore',
    './batch-contact-review': 'createBatchContactReview',
    './content-operation-authority': 'createContentOperationAuthority',
    './standalone-document-review-store': 'createDocumentReviewStore'
  })) modules[id] = { [name]: deps => { if (name === 'createBatchExecutorRunner') captured.executor = deps; return {}; } };
  for (const id of ['../standalone/convert-next', '../standalone/identity-ledger', './orchestrator', './retention',
    './mapping', './document-result-grade', './package-identity', './performance', './local-review-adapter',
    './private-work-store', './batch-lock-release', './process-identity', './result-export',
    './batch-source-admission', './batch-review-policy', './batch-journal-io']) modules[id] = {};
  const module = { exports: {} }, filename = path.join(repository, gateway, 'batch.js');
  const context = vm.createContext({ module, exports: module.exports, Buffer, console,
    process: { platform, pid: process.pid, env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } },
    require(id) {
      if (Object.hasOwn(modules, id)) return modules[id];
      if (id === '../core/processing-mode') return require('../plugins/data-secure/server/core/processing-mode');
      if (id === '../core/content-options') return require('../plugins/data-secure/server/core/content-options');
      throw fail('UNEXPECTED_COMPOSITION_REQUIRE:' + id);
    } });
  vm.runInContext(options.source || batchSource, context, { filename, timeout: 1000 });
  return { api: module.exports, captured, counters, state, response, memory, target, requested, observeRequested, held: () => held,
    run: () => module.exports.processBatchNext(token, { executorPid: process.pid }) };
}

function assertComposition(value) {
  assert.strictEqual(value.counters.processingFactories, 1);
  assert.strictEqual(value.counters.reviewFactories, 1);
  assert.strictEqual(value.counters.admissionFactories, 1);
  assert.strictEqual(typeof value.captured.processing.acquireProcessingOwner, 'function');
  assert.strictEqual(Object.hasOwn(value.captured.review, 'acquireProcessingOwner'), false);
  assert.strictEqual(value.captured.progress.observePauseRequested, value.observeRequested);
  assert.strictEqual(value.captured.processing.pauseRequested, value.requested);
  assert.strictEqual(value.captured.executor.pauseRequested, value.requested);
  assert.notStrictEqual(value.requested, value.observeRequested);
}

function moveAdmissionBackToReview(source) {
  // Mutation input only: positive verdicts above execute actual unmodified
  // composition. The historical miswire must be rejected as behavior, not by
  // a positive includes/regex assertion that could match another callsite.
  const line = '  acquireProcessingOwner: createBatchProcessingAdmission({ dataRoot, withOwnershipControl, acquireActiveLock: acquireActiveLockOnce }),\n';
  assert.strictEqual(source.split(line).length, 2);
  let result = source.replace(line, '');
  const anchor = 'const { reviewDeferredBatch } = createBatchReviewOrchestrator({\n';
  assert.strictEqual(result.split(anchor).length, 2);
  return result.replace(anchor, anchor + line);
}

for (const platform of ['win32', 'darwin']) {
  test(`${platform}: a progress/control miswire is caught by actual factory composition`, () => {
    const source = batchSource.replace('observePauseRequested: standalonePause.observeRequested', 'observePauseRequested: standalonePause.requested');
    assert.notStrictEqual(source, batchSource);
    assert.throws(() => assertComposition(fixture(platform, { source })), /reference-equal|strictly equal/iu);
  });
  testAsync(`${platform}: actual public batch facade executes correctly composed admission, Once publisher and exact epoch release`, async () => {
    const value = fixture(platform); assertComposition(value);
    const running = value.run();
    const synchronousDocuments = value.counters.documents;
    assert.strictEqual(await running, value.response);
    assert.strictEqual(synchronousDocuments, 1, 'normal admission adds no await before document');
    assert.strictEqual(value.counters.links, 1); assert.strictEqual(value.counters.ownerReleases, 1);
    assert.strictEqual(value.counters.legacyAcquires, 0); assert.strictEqual(value.counters.delays, 0);
    assert.strictEqual(value.counters.reads, 1); assert.strictEqual(value.counters.maintenance, 1);
    assert.strictEqual(value.captured.processing.active.size, 0); assert.strictEqual(value.held(), false);
    assert.strictEqual(value.memory.files.size, 0); assert.strictEqual(value.memory.descriptors.size, 0);
  });
  testAsync(`${platform}: captured functional admission retries only pre-callback modeled kernel Busy and processes once`, async () => {
    const value = fixture(platform, { kernelBusy: 2 }); assertComposition(value);
    assert.strictEqual(await value.run(), value.response);
    assert.strictEqual(value.counters.delays, 2); assert.strictEqual(value.counters.documents, 1);
    assert.strictEqual(value.counters.links, 1); assert.strictEqual(value.counters.ownerReleases, 1);
    assert.strictEqual(value.counters.legacyAcquires, 0); assert.strictEqual(value.memory.files.size, 0);
  });
  testAsync(`${platform}: historical wrong-factory composition is a red control and native Processing fails before work`, async () => {
    const value = fixture(platform, { source: moveAdmissionBackToReview(batchSource) });
    assert.throws(() => assertComposition(value));
    assert.strictEqual(typeof value.captured.review.acquireProcessingOwner, 'function');
    await assert.rejects(value.run(), error => error.code === 'OWNERSHIP_GUARD_UNAVAILABLE');
    assert.strictEqual(value.counters.reads, 0); assert.strictEqual(value.counters.documents, 0);
    assert.strictEqual(value.counters.links, 0); assert.strictEqual(value.counters.ownerReleases, 0);
    assert.strictEqual(value.captured.processing.active.size, 0);
  });
  test(`${platform}: a replacement with the ordinary acquire API fails the executed factory contract`, () => {
    const source = batchSource.replace('withOwnershipControl, acquireActiveLock: acquireActiveLockOnce }),',
      'withOwnershipControl, acquireActiveLock }),');
    assert.notStrictEqual(source, batchSource);
    assert.throws(() => fixture(platform, { source }), error => error.code === 'COMPOSITION_ONCE_API_REQUIRED');
  });
  testAsync(`${platform}: actual Once link Busy cannot sleep or replay under the outer guard`, async () => {
    const value = fixture(platform, { linkBusy: true }); assertComposition(value);
    await assert.rejects(value.run());
    assert.strictEqual(value.counters.links, 1); assert.strictEqual(value.counters.delays, 0);
    assert.strictEqual(value.counters.documents, 0); assert.strictEqual(value.counters.ownerReleases, 0);
    assert.strictEqual(value.counters.legacyAcquires, 0); assert.strictEqual(value.memory.files.has(value.target), false);
    assert.strictEqual(value.memory.files.size, 1, 'uncommitted own temp conservatively retained in RAM');
    assert.strictEqual(value.memory.descriptors.size, 0); assert.strictEqual(value.held(), false);
  });
  testAsync(`${platform}: Busy after actual logical publication is not pre-callback retry or success authority`, async () => {
    const value = fixture(platform, { closeBusy: true }); assertComposition(value);
    await assert.rejects(value.run(), error => error.code === 'OWNERSHIP_GUARD_BUSY');
    assert.strictEqual(value.counters.links, 1); assert.strictEqual(value.counters.delays, 0);
    assert.strictEqual(value.counters.documents, 0); assert.strictEqual(value.counters.reads, 0);
    assert.strictEqual(value.counters.ownerReleases, 0); assert.strictEqual(value.memory.files.has(value.target), true);
    assert.strictEqual(value.memory.descriptors.size, 0); assert.strictEqual(value.held(), false);
  });
}
module.exports = done();
