'use strict';

// Actual start functions and worker envelopes; native package acceptance is
// a separate gate. No source or private user store can be reached in this test.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-md-start-'));
for (const [key, dir] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'work'], ['EU_PRIVACY_RESULT_ROOT', 'results']]) {
  process.env[key] = path.join(scope, dir); fs.mkdirSync(process.env[key]);
}
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Bound Markdown start transport');
const { assertMarkdownContentStart } = require('../plugins/data-secure/server/core/content-options');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { validateBatchMessagePurpose } = require('../plugins/data-secure/server/gateway/batch-queue-envelope');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const contract = (markdownOutput = 'content-v1', scanOcr = true, imageOcr = true) =>
  ({ schema: 'datasecure-content-options/1', markdownOutput, scanOcr, imageOcr });
const ipc = () => ({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16),
  action: 'start_admitted_batch', processing_mode: 'markdown-only', document_review: true });
const throws = (fn, expected) => assert.throws(fn, error => error.code === expected);

test('all option combinations create an immutable Raw-only start copy', () => {
  for (const output of ['content-v1', 'notes-v1']) for (const scan of [false, true]) for (const image of [false, true]) {
    const original = contract(output, scan, image), request = { processingMode: 'markdown-only', documentReview: true, contentOptions: original };
    const copy = assertMarkdownContentStart(request, 'contentOptions', 'standalone');
    assert.deepEqual(copy, original); assert.notEqual(copy, original); assert.equal(Object.isFrozen(copy), true);
    original.imageOcr = !image; assert.equal(copy.imageOcr, image);
  }
});

test('both new purposes require the bound document workflow', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    assert.deepEqual(assertMarkdownContentStart({ processingMode: mode, documentReview: true,
      contentOptions: contract() }, 'contentOptions', 'standalone'), contract());
    for (const value of [undefined, false, 'true']) throws(() => assertMarkdownContentStart({ processingMode: mode,
      documentReview: value, contentOptions: contract() }, 'contentOptions', 'standalone'), 'DOCUMENT_REVIEW_INVALID');
  }
  throws(() => assertMarkdownContentStart({ processingMode: 'markdown-only', documentReview: true,
    contentOptions: contract() }, 'contentOptions', 'plugin'), 'CONTENT_OPTIONS_FORBIDDEN');
});

test('null, alias, inherited and accessor inputs do not become legacy or invoke getters', () => {
  let reads = 0;
  const valid = { processingMode: 'markdown-only', documentReview: true };
  for (const value of [null, undefined, {}, { ...contract(), extra: true }])
    throws(() => assertMarkdownContentStart({ ...valid, contentOptions: value }, 'contentOptions', 'standalone'), 'CONTENT_OPTIONS_INVALID');
  for (const field of ['contentOptions', 'processingMode', 'documentReview']) {
    const request = { ...valid, contentOptions: contract() };
    Object.defineProperty(request, field, { enumerable: true, get() { reads++; return contract(); } });
    throws(() => assertMarkdownContentStart(request, 'contentOptions', 'standalone'), 'CONTENT_OPTIONS_INVALID');
  }
  throws(() => assertMarkdownContentStart({ ...valid, content_options: contract() }, 'contentOptions', 'standalone'), 'CONTENT_OPTIONS_INVALID');
  throws(() => assertMarkdownContentStart(Object.create({ contentOptions: contract() }), 'contentOptions', 'standalone'), 'CONTENT_OPTIONS_INVALID');
  assert.equal(reads, 0);
});

test('private IPC permits options at both content starts and preserves the exact contract', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize'])
    for (const output of ['content-v1', 'notes-v1']) for (const scan of [false, true]) for (const image of [false, true]) {
      const request = { ...ipc(), processing_mode: mode, ...(mode === 'markdown-and-anonymize' ? { output_naming_mode: 'neutral' } : {}),
        content_options: contract(output, scan, image) };
      assert.deepEqual(validatePrivateMessage(request).content_options, request.content_options);
    }
  throws(() => validatePrivateMessage({ ...ipc(), content_options: contract(), action: 'continue_current_batch' }), 'CONTENT_OPTIONS_FORBIDDEN');
  throws(() => validatePrivateMessage({ ...ipc(), contentOptions: contract() }), 'CONTENT_OPTIONS_INVALID');
  throws(() => validatePrivateMessage({ ...ipc(), content_options: contract(), document_review: false }), 'DOCUMENT_REVIEW_INVALID');
});

test('new intake message is explicit; old worker messages cannot acknowledge new semantics', () => {
  const request = { type: 'start-local-content-markdown-intake', processing_mode: 'markdown-only', document_review: true,
    content_options: contract() };
  assert.equal(validateBatchMessagePurpose(request, 'standalone'), 'markdown-only');
  const anonymize = { ...request, type: 'start-local-content-anonymize-intake', processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' };
  assert.equal(validateBatchMessagePurpose(anonymize, 'standalone'), 'markdown-and-anonymize');
  throws(() => validateBatchMessagePurpose({ ...anonymize, processing_mode: 'markdown-only' }, 'standalone'), 'PROCESSING_MODE_INVALID');
  for (const type of ['start-local-intake', 'start-local-markdown-intake', 'start-local-batch', 'start-local-markdown-batch'])
    throws(() => validateBatchMessagePurpose({ ...request, type }, 'standalone'), type.endsWith('-intake') ? 'CONTENT_OPTIONS_NOT_READY' : 'CONTENT_OPTIONS_FORBIDDEN');
  const absent = { ...request }; delete absent.content_options;
  throws(() => validateBatchMessagePurpose(absent, 'standalone'), 'CONTENT_OPTIONS_INVALID');
  throws(() => validateBatchMessagePurpose({ ...request, processing_mode: 'markdown-and-anonymize' }, 'standalone'), 'PROCESSING_MODE_INVALID');
});

test('native entry rejects proxy owners, contracts, prototypes and environment getters without executing them', () => {
  const { contentStartOptions, contentStartChannel } = require('../plugins/data-secure/server/gateway/content-start-boundary');
  const { startLocalIntakeExecutor } = require('../plugins/data-secure/server/gateway/batch-executor');
  let traps = 0, effects = 0;
  const handler = Object.fromEntries(['has', 'get', 'getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']
    .map(name => [name, () => { traps++; throw Error(name); }]));
  const valid = { processingMode: 'markdown-only', documentReview: true, contentOptions: contract(),
    reserveIntake() { effects++; }, forkProcess() { effects++; } };
  const candidates = [new Proxy(valid, handler), { ...valid, contentOptions: new Proxy(contract(), handler) },
    Object.assign(Object.create(new Proxy({}, handler)), valid)];
  for (const value of candidates) {
    throws(() => contentStartOptions(value, 'contentOptions', 'standalone'), 'CONTENT_OPTIONS_INVALID');
    throws(() => startLocalIntakeExecutor([], 'auto', value), 'CONTENT_OPTIONS_INVALID');
  }
  const envGetter = Object.defineProperty({ ...valid }, 'env', { enumerable: true, get() { effects++; return {}; } });
  throws(() => contentStartChannel(envGetter, process.env), 'CONTENT_OPTIONS_INVALID');
  throws(() => startLocalIntakeExecutor([], 'auto', envGetter), 'CONTENT_OPTIONS_INVALID');
  const inherited = Object.create({ get env() { effects++; throw Error('inherited environment'); } });
  throws(() => startLocalIntakeExecutor([], 'auto', inherited), 'CONTENT_OPTIONS_INVALID');
  const environment = { DATASECURE_PRODUCT_CHANNEL: 'standalone' };
  Object.defineProperty(environment, Symbol('getter'), { enumerable: true, get() { effects++; throw Error('symbol'); } });
  throws(() => startLocalIntakeExecutor([], 'auto', { ...valid, env: environment }), 'CONTENT_OPTIONS_INVALID');
  const revoked = Proxy.revocable({}, handler); revoked.revoke();
  throws(() => startLocalIntakeExecutor([], 'auto', revoked.proxy), 'CONTENT_OPTIONS_INVALID');
  const request = new Proxy(ipc(), handler);
  throws(() => validatePrivateMessage(request), 'CONTENT_OPTIONS_INVALID');
  assert.equal(traps, 0); assert.equal(effects, 0);
});

async function main() {
  await testAsync('application transports the owned options and only the explicit catalogue selection', async () => {
    const calls = [], original = contract();
    const service = new StandaloneApplicationService({ dependencies: {
      reserveIntake() { calls.push('reserve'); return { reservation_id: 'a'.repeat(32) }; },
      releaseIntake() { calls.push('release'); },
      startLocalIntakeExecutor(queue, profile, options) {
        calls.push({ queue, profile, options });
        original.imageOcr = false;
        return { ok: true, batch_token: 'b'.repeat(64), local_intake_pending: true,
          ipcAcknowledgement: Promise.resolve() };
      }
    } });
    service.ensureResultRoot = () => calls.push('root');
    const queue = [{ full: path.join(scope, 'Quelle.txt'), name: 'Quelle.txt', sourceBytes: 4 }];
    service.admittedQueue = queue;
    const result = await service.startAdmittedBatch({ processingMode: 'markdown-only', documentReview: true, contentOptions: original });
    assert.equal(result.ok, true); assert.equal(result.batch_id, 'b'.repeat(64));
    const sent = calls.find(item => typeof item === 'object');
    assert.equal(sent.queue, queue); assert.equal(sent.options.processingMode, 'markdown-only');
    assert.equal(sent.options.documentReview, true); assert.equal(sent.options.contentOptions.imageOcr, true);
    assert.equal(Object.isFrozen(sent.options.contentOptions), true);
    assert.equal(Object.hasOwn(sent.options, 'outputNamingMode'), false);
    assert.equal(service.admittedQueue, null);
  });
  await done(() => require('../plugins/data-secure/server/gateway/common').safeRemovePrivateTree(path.dirname(scope), path.basename(scope)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
