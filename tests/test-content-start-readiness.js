'use strict';

// Real entry functions with side-effect counters. This is an adapter boundary
// check, not a GUI, converter-semantic or package acceptance test.
const path = require('node:path'), os = require('node:os'), fs = require('node:fs'), vm = require('node:vm');
// Even a deliberately red direct-entry regression must never reach the user's
// default stores if the intended before-effects guard is absent or broken.
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-readiness-'));
for (const [variable, name] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'workspace'], ['EU_PRIVACY_RESULT_ROOT', 'results']]) {
  process.env[variable] = path.join(scope, name); fs.mkdirSync(process.env[variable]);
}
const { createSuite } = require('./helpers');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const { createBatchIntake } = require('../plugins/data-secure/server/gateway/batch-intake');
const { validateBatchMessagePurpose } = require('../plugins/data-secure/server/gateway/batch-queue-envelope');
const { test, testAsync, assert, done } = createSuite('Purpose-specific content start boundaries');
const modes = ['markdown-only', 'markdown-and-anonymize'];
const options = (markdownOutput = 'content-v1', scanOcr = true, imageOcr = false) =>
  ({ schema: 'datasecure-content-options/1', markdownOutput, scanOcr, imageOcr });
const request = mode => ({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16),
  action: 'start_admitted_batch', processing_mode: mode, document_review: true,
  ...(mode === 'markdown-and-anonymize' ? { output_naming_mode: 'neutral' } : {}) });
const code = (action, expected) => assert.throws(action, error => error.code === expected);

test('private IPC preserves Legacy starts and accepts both new content purposes', () => {
  for (const mode of modes) {
    assert.equal(validatePrivateMessage(request(mode)).processing_mode, mode);
    for (const output of ['content-v1', 'notes-v1']) for (const scan of [false, true]) for (const image of [false, true])
      assert.deepEqual(validatePrivateMessage({ ...request(mode), content_options: options(output, scan, image) }).content_options, options(output, scan, image));
  }
});

test('private IPC rejects explicit null, malformed options and the wrong outer alias', () => {
  for (const value of [null, undefined, {}, { ...options(), scanOcr: 'true' }, { ...options(), extra: true }])
    code(() => validatePrivateMessage({ ...request('markdown-only'), content_options: value }), 'CONTENT_OPTIONS_INVALID');
  code(() => validatePrivateMessage({ ...request('markdown-only'), contentOptions: options() }), 'CONTENT_OPTIONS_INVALID');
  code(() => validatePrivateMessage({ ...request('markdown-only'), action: 'continue_current_batch', content_options: options() }), 'CONTENT_OPTIONS_FORBIDDEN');
});

test('direct intake refuses options before storage, source validation, intent or copy', () => {
  let effects = 0;
  for (const mode of modes) {
    const intake = createBatchIntake({ productChannel: 'standalone', SafeError: Error,
      storageStatus() { effects++; throw Error('must not reach storage'); } });
    code(() => intake.beginBatch({ processingMode: mode, documentReview: false, contentOptions: options() }),
      'DOCUMENT_REVIEW_INVALID');
    code(() => intake.beginBatch({ processingMode: mode, contentOptions: null }), 'CONTENT_OPTIONS_INVALID');
    code(() => intake.beginBatch({ processingMode: mode, content_options: options() }), 'CONTENT_OPTIONS_INVALID');
  }
  const plugin = createBatchIntake({ productChannel: 'plugin', SafeError: Error,
    storageStatus() { effects++; throw Error('must not reach storage'); } });
  code(() => plugin.beginBatch({ contentOptions: options() }), 'CONTENT_OPTIONS_FORBIDDEN');
  assert.equal(effects, 0);
});

test('worker purpose envelopes cannot smuggle options into old starts or resume', () => {
  for (const type of ['start-local-intake', 'start-local-markdown-intake']) {
    const mode = type.includes('markdown') ? 'markdown-only' : 'markdown-and-anonymize';
    code(() => validateBatchMessagePurpose({ type, processing_mode: mode, content_options: options() }, 'standalone'), 'CONTENT_OPTIONS_NOT_READY');
    code(() => validateBatchMessagePurpose({ type, processing_mode: mode, content_options: null }, 'standalone'), 'CONTENT_OPTIONS_INVALID');
    code(() => validateBatchMessagePurpose({ type, processing_mode: mode, contentOptions: options() }, 'standalone'), 'CONTENT_OPTIONS_INVALID');
  }
  code(() => validateBatchMessagePurpose({ type: 'start-local-batch', content_options: options() }, 'standalone'), 'CONTENT_OPTIONS_FORBIDDEN');
  code(() => validateBatchMessagePurpose({ type: 'start-local-intake', content_options: options() }, 'plugin'), 'CONTENT_OPTIONS_FORBIDDEN');
});

test('accessor and inherited contracts are invalid without evaluating the requested value', () => {
  const { assertLegacyContentOperation } = require('../plugins/data-secure/server/core/content-options');
  let reads = 0;
  const getter = Object.defineProperty({}, 'contentOptions', { enumerable: true, get() { reads++; return options(); } });
  code(() => assertLegacyContentOperation(getter, 'contentOptions', 'standalone', 'start'), 'CONTENT_OPTIONS_INVALID');
  code(() => assertLegacyContentOperation(Object.create({ contentOptions: options() }), 'contentOptions', 'standalone', 'start'), 'CONTENT_OPTIONS_INVALID');
  code(() => assertLegacyContentOperation(Object.create({ content_options: options() }), 'contentOptions', 'standalone', 'start'), 'CONTENT_OPTIONS_INVALID');
  const callable = Object.assign(() => {}, { contentOptions: options() });
  code(() => assertLegacyContentOperation(callable, 'contentOptions', 'standalone', 'start'), 'CONTENT_OPTIONS_INVALID');
  assert.equal(reads, 0);
});

test('real executor entries deny before reservation, fork and resume journal reads', () => {
  const { startLocalIntakeExecutor, startLocalBatchExecutor, startLocalReviewExecutor } = require('../plugins/data-secure/server/gateway/batch-executor');
  let effects = 0;
  const deps = { env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' }, contentOptions: options(),
    reserveIntake() { effects++; }, forkProcess() { effects++; }, readBatchProcessingMode() { effects++; } };
  for (const mode of modes)
    code(() => startLocalIntakeExecutor([], 'auto', { ...deps, processingMode: mode }),
      'DOCUMENT_REVIEW_INVALID');
  code(() => startLocalBatchExecutor('a'.repeat(64), deps), 'CONTENT_OPTIONS_FORBIDDEN');
  code(() => startLocalReviewExecutor('a'.repeat(64), deps), 'CONTENT_OPTIONS_FORBIDDEN');
  code(() => startLocalIntakeExecutor([], 'auto', { ...deps, env: { DATASECURE_PRODUCT_CHANNEL: 'plugin' } }), 'CONTENT_OPTIONS_FORBIDDEN');
  assert.equal(effects, 0);
});

async function main() {
  await testAsync('actual anonymization orchestrator rejects new contracts before source, maintenance or claim effects', async () => {
    const { anonymizeNext } = require('../plugins/data-secure/server/gateway/orchestrator');
    for (const [field, value, expected] of [['contentOptions', options(), 'CONTENT_OPTIONS_NOT_READY'],
      ['contentOptions', null, 'CONTENT_OPTIONS_INVALID'], ['content_options', options(), 'CONTENT_OPTIONS_INVALID']]) {
      let effects = 0;
      const deps = { productChannel: 'standalone', [field]: value, onClaimed() { effects++; } };
      Object.defineProperty(deps, 'inputQueue', { enumerable: true, get() { effects++; throw new Error('source reached'); } });
      await assert.rejects(anonymizeNext('auto', deps), error => error.code === expected);
      assert.equal(effects, 0);
    }
    let reads = 0;
    const deps = { contentOptions: options() };
    Object.defineProperty(deps, 'productChannel', { enumerable: true, get() { reads++; throw new Error('private channel getter'); } });
    await assert.rejects(anonymizeNext('auto', deps), error => error.code === 'CONTENT_OPTIONS_INVALID');
    assert.equal(reads, 0);
    for (const intermediate of [false, true]) {
      let traps = 0, effects = 0;
      const proxy = new Proxy({ contentOptions: options() }, { has() { traps++; return false; },
        getPrototypeOf() { traps++; return Object.prototype; } });
      const inherited = Object.create(intermediate ? Object.create(proxy) : proxy);
      Object.defineProperty(inherited, 'productChannel', { value: 'standalone', enumerable: true });
      Object.defineProperty(inherited, 'inputQueue', { enumerable: true, get() { effects++; throw new Error('source reached'); } });
      await assert.rejects(anonymizeNext('auto', inherited), error => error.code === 'CONTENT_OPTIONS_INVALID');
      assert.equal(traps, 0); assert.equal(effects, 0);
    }
  });
  await testAsync('legacy picker and current continuation deny before status, selection or resume', async () => {
    for (const method of ['anonymize', 'continueCurrentBatch']) for (const [field, value] of
      [['contentOptions', options()], ['contentOptions', null], ['content_options', options()]]) {
      let effects = 0;
      const service = new StandaloneApplicationService({ dependencies: {
        lightweightStatus() { effects++; throw Error('status reached'); }
      } });
      service.observedBatchId = 'b'.repeat(64);
      service.continueHistoryBatch = async () => { effects++; return { ok: true }; };
      const expected = value === null || field === 'content_options' ? 'CONTENT_OPTIONS_INVALID' :
        method === 'anonymize' ? 'CONTENT_OPTIONS_NOT_READY' : 'CONTENT_OPTIONS_FORBIDDEN';
      await assert.rejects(method === 'anonymize' ? service.anonymize({ [field]: value }) :
        service.continueCurrentBatch(undefined, { [field]: value }), error => error.code === expected);
      assert.equal(effects, 0); assert.equal(service.interactionActive, false);
      assert.equal(service.observedBatchId, 'b'.repeat(64));
    }
  });
  await testAsync('actual review worker handler rejects options before acceptance, journal or review', async () => {
    const workerSource = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/gateway/review-worker.js'), 'utf8');
    for (const [field, value, expected] of [['content_options', options(), 'CONTENT_OPTIONS_FORBIDDEN'],
      ['content_options', null, 'CONTENT_OPTIONS_INVALID'], ['contentOptions', options(), 'CONTENT_OPTIONS_INVALID']]) {
      const events = new Map(), messages = [], exits = []; let effects = 0;
      const guarded = () => { effects++; throw Error('work reached'); };
      vm.runInNewContext(workerSource, { setTimeout: () => ({}), clearTimeout() {},
        process: { env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' }, pid: 12345,
          once: (name, fn) => events.set(name, fn), send: (message, callback) => { messages.push(message); callback(); },
          exit: code => exits.push(code) },
        require(id) {
          if (id === 'node:crypto') return require(id);
          if (id === '../core/content-options') return require('../plugins/data-secure/server/core/content-options');
          if (id === './batch') return { readBatchProgress: guarded, reviewDeferredBatch: guarded, releaseLocalBatchExecutor: guarded };
          if (id === './workflow-diagnostics') return { recordWorkflowEvent() {} };
          if (id === '../companion/review-timeouts') return { DETACHED_REVIEW_TIMEOUT_MS: 300000 };
          return {};
        }
      }, { filename: 'review-worker.js' });
      await events.get('message')({ type: 'start-local-review', batch_token: 'a'.repeat(64), [field]: value });
      assert.equal(effects, 0); assert.deepEqual(exits, [2]);
      assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'local-review-rejected', error_code: expected }]);
    }
  });
  await testAsync('application denial leaves the prepared catalogue untouched and has no start side effects', async () => {
    for (const mode of modes) for (const [field, value, expected] of [
      ['contentOptions', options(), 'DOCUMENT_REVIEW_INVALID'], ['contentOptions', null, 'CONTENT_OPTIONS_INVALID'],
      ['content_options', options(), 'CONTENT_OPTIONS_INVALID']
    ]) {
      const effects = [];
      const service = new StandaloneApplicationService({ dependencies: {
        reserveIntake() { effects.push('reservation'); }, startLocalIntakeExecutor() { effects.push('worker'); }
      } });
      service.ensureResultRoot = () => effects.push('root');
      const queue = [{ full: path.join(os.tmpdir(), 'synthetic-content-start.txt'), name: 'synthetic-content-start.txt', sourceBytes: 4 }];
      service.admittedQueue = queue; service.admissionRevision = 7; service.sourceIds.set('source', 'id');
      await assert.rejects(service.startAdmittedBatch({ processingMode: mode, documentReview: false, [field]: value }), error => error.code === expected);
      assert.deepEqual(effects, []); assert.equal(service.admittedQueue, queue);
      assert.equal(service.admissionRevision, 7); assert.equal(service.sourceIds.get('source'), 'id');
    }
  });
  await done(() => require('../plugins/data-secure/server/gateway/common').safeRemovePrivateTree(path.dirname(scope), path.basename(scope)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
