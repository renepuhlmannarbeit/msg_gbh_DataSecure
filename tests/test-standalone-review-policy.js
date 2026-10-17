'use strict';

// Real journals and independent run anchors; no detector or publication mocks.
// This verifies policy ownership, not the Fastweg's detector choices or native UI.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const vm = require('node:vm'), { createRequire } = require('node:module');
const { createSuite } = require('./helpers');
const { validateReviewPolicy, reviewPolicyForBatch } = require('../plugins/data-secure/server/core/standalone-review-policy');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createContentOperationAuthority } = require('../plugins/data-secure/server/gateway/content-operation-authority');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { copySnapshotFile, exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { test, testAsync, assert, done } = createSuite('Standalone automatic review policy ownership');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
const context = { productChannel: 'standalone', processingMode: 'markdown-and-anonymize', documentReview: true, contentOptions };
const policy = 'automatic-conservative';
const invalid = fn => assert.throws(fn, error => error.code === 'STANDALONE_REVIEW_POLICY_INVALID');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-review-policy-'));

test('only an explicit conservative Standalone anonymization policy with a complete content contract is valid', () => {
  assert.equal(validateReviewPolicy(policy, context), policy);
  for (const value of [undefined, null, false, true, 'guided', 'automatic', 'automatic-all', ''])
    invalid(() => validateReviewPolicy(value, context));
  for (const change of [{ productChannel: 'plugin' }, { processingMode: 'markdown-only' },
    { documentReview: false }, { documentReview: undefined }, { contentOptions: undefined },
    { contentOptions: { ...contentOptions, scanOcr: 'true' } }, { contentOptions: { ...contentOptions, bypass: true } }])
    invalid(() => validateReviewPolicy(policy, { ...context, ...change }));
  invalid(() => validateReviewPolicy(policy));
  invalid(() => validateReviewPolicy(policy, null));
  let traps = 0;
  const proxiedOptions = new Proxy(contentOptions, { ownKeys() { traps++; return Reflect.ownKeys(contentOptions); } });
  invalid(() => validateReviewPolicy(policy, { ...context, contentOptions: proxiedOptions }));
  assert.equal(traps, 0, 'a Proxy is refused before content-option reflection');
});

test('guided legacy state stays absent while aliases, inherited policy and getter-based policy fail closed', () => {
  const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, content_options: contentOptions };
  assert.equal(reviewPolicyForBatch({ schema: 'datasecure-batch/2' }), undefined);
  assert.equal(reviewPolicyForBatch(state), undefined);
  assert.equal(reviewPolicyForBatch({ ...state, standalone_review_policy: policy }), policy);
  for (const change of [{ standalone_review_policy: undefined }, { standalone_review_policy: null },
    { review_policy: policy }, { reviewPolicy: policy }, { standalone_review_policy: policy, schema: 'datasecure-batch/6' },
    { standalone_review_policy: policy, processing_mode: 'markdown-only' }, { standalone_review_policy: policy, product_channel: 'plugin' }])
    invalid(() => reviewPolicyForBatch({ ...state, ...change }));
  invalid(() => reviewPolicyForBatch(Object.assign(Object.create({ standalone_review_policy: policy }), state)));
  let getterCalls = 0;
  const getter = { ...state };
  Object.defineProperty(getter, 'standalone_review_policy', { enumerable: true, get() { getterCalls++; return policy; } });
  invalid(() => reviewPolicyForBatch(getter)); assert.equal(getterCalls, 0);
});

function fixture(automatic = true) {
  const root = path.join(scope, crypto.randomBytes(8).toString('hex')); fs.mkdirSync(root);
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex');
  const source = path.join(root, 'synthetic.txt'), bytes = Buffer.from('Vollständiger Name: Anna Beispiel\n');
  fs.writeFileSync(source, bytes);
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, content_options: contentOptions, ...(automatic ? { standalone_review_policy: policy } : {}),
    ...createBatchPseudonymState({ productChannel: 'standalone' }), output_naming_mode: 'neutral', profile: 'general',
    created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00.000Z',
    items: [{ id, name: 'synthetic.txt', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
      work_name: `001_${crypto.randomBytes(12).toString('hex')}.txt`, private_artifact_plain: true,
      status: 'pending', checkpoint: 'sealed' }] };
  const file = path.join(root, `${token}.json`), data = path.join(root, 'private');
  const reviews = createDocumentReviewStore({ dataRoot: data });
  const create = () => createBatchJournalStore({ batchPath: value => {
    assert.equal(value, token); return file;
  }, documentReviewDataRoot: data, productChannel: 'standalone' });
  const store = create(); store.writeState(state); reviews.captureRun(state);
  return { root, token, bytes, source, file, state, reviews, store, create };
}

test('an actual independent run anchor and journal retain the selected policy across restart', () => {
  for (const automatic of [false, true]) {
    const f = fixture(automatic), saved = f.create().readState(f.token);
    assert.equal(reviewPolicyForBatch(saved), automatic ? policy : undefined);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.root, 'private', 'document-reviews', f.token, 'manifest.json')));
    assert.equal(manifest.schema, automatic ? 'datasecure-document-run/4' : 'datasecure-document-run/3');
    assert.equal(manifest.review_policy, automatic ? policy : undefined);
    saved.items[0].status = 'processing'; saved.items[0].checkpoint = 'processing_started';
    f.store.writeState(saved);
    assert.equal(f.create().readStateForMaintenance(f.token).items[0].status, 'processing');
  }
});

test('resume cannot add or remove policy through a remembered state or a freshly cloned journal write', () => {
  for (const automatic of [false, true]) for (const clone of [false, true]) {
    const f = fixture(automatic), saved = f.store.readState(f.token), changed = clone ? structuredClone(saved) : saved;
    const before = fs.readFileSync(f.file);
    if (automatic) delete changed.standalone_review_policy; else changed.standalone_review_policy = policy;
    assert.throws(() => (clone ? f.create() : f.store).writeState(changed), error => error.code === 'BATCH_PROCESSING_MODE_CHANGED');
    assert.ok(fs.readFileSync(f.file).equals(before));
    assert.equal(reviewPolicyForBatch(f.create().readState(f.token)), automatic ? policy : undefined);
  }
});

test('deleting or adding the on-disk policy cannot bypass the independent immutable run anchor', () => {
  for (const automatic of [false, true]) {
    const f = fixture(automatic), forged = JSON.parse(fs.readFileSync(f.file));
    if (automatic) delete forged.standalone_review_policy; else forged.standalone_review_policy = policy;
    fs.writeFileSync(f.file, JSON.stringify(forged));
    assert.throws(() => f.create().readStateForMaintenance(f.token), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.throws(() => f.create().readState(f.token), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
  }
});

test('owned publication contexts expose the bound policy only for an automatic run and keep it immutable', () => {
  for (const automatic of [false, true]) {
    const f = fixture(automatic), work = path.join(f.root, 'work'); fs.mkdirSync(work);
    const sourceStore = createPrivateWorkStore({ privateRoot: f.root });
    copySnapshotFile(f.source, path.join(work, f.state.items[0].work_name), fs.statSync(f.source),
      { privateWorkStore: sourceStore, expectedSha256: f.state.items[0].sha256 });
    f.state.items[0].status = 'processing'; f.state.items[0].checkpoint = 'processing_started'; f.store.writeState(f.state);
    const lock = createBatchActiveLock({ lockPath: () => path.join(f.root, 'owner.lock') }); lock.acquireActiveLock(f.token);
    let operation;
    try {
      const authority = createContentOperationAuthority({ active: new Set([f.token]),
        readStateForMaintenance: f.store.readStateForMaintenance, writeState: f.store.writeState, documentReview: f.reviews,
        captureOwnedEpoch: lock.captureOwnedEpoch, assertOwnedEpoch: lock.assertOwnedEpoch,
        exactPendingEntry: (state, item) => exactPendingEntry(state, item, { privateWorkStore: sourceStore, workPath: () => work }) });
      operation = authority.consume(authority.issue(f.token, f.state.items[0].id, 'publication'));
      assert.equal(operation.review_policy, automatic ? policy : undefined);
      assert.equal(Object.hasOwn(operation, 'review_policy'), automatic); assert.ok(Object.isFrozen(operation));
      assert.throws(() => { operation.review_policy = 'automatic-all'; }, TypeError);
      assert.equal(operation.revalidate(), true); assert.deepEqual(operation.takeSourceBytes(), f.bytes);
    } finally { operation?.dispose(); lock.releaseActiveLock(f.token); }
  }
});

testAsync('the actual worker handler carries policy into intake and rejects supplied resume, Raw or legacy policies before acknowledgement', async () => {
  const file = path.join(__dirname, '../plugins/data-secure/server/gateway/batch-worker.js');
  const actualRequire = createRequire(file), source = fs.readFileSync(file, 'utf8');
  async function invoke(extra) {
    const messages = [], exits = [], starts = [], events = new Map(); let journalReads = 0;
    vm.runInNewContext(source, { setTimeout: () => ({}), clearTimeout() {},
      process: { env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' }, pid: 8765,
        once: (event, handler) => events.set(event, handler), send: (message, callback) => { messages.push(message); callback(); },
        exit: code => exits.push(code) },
      require(name) {
        if (name === './batch') return { beginBatch(options) { starts.push(options); return { ok: false }; },
          readBatchProcessingMode() { journalReads++; throw Error('resume journal reached'); } };
        if (name === './batch-intake-reservation') return { releaseIntake: () => true, RESERVATION_ID_RE: /^[a-f0-9]{64}$/u };
        return actualRequire(name);
      }
    }, { filename: file });
    const message = { type: 'start-local-content-anonymize-intake', batch_token: 'a'.repeat(64),
      intake_reservation_id: 'b'.repeat(64), processing_mode: 'markdown-and-anonymize', content_options: contentOptions,
      document_review: true, review_policy: policy,
      queue: [{ full: path.join(scope, 'synthetic.txt'), name: 'synthetic.txt', sourceBytes: 12 }], ...extra };
    if (Object.hasOwn(extra, 'content_options') && extra.content_options === undefined) delete message.content_options;
    await events.get('message')(message);
    return { messages: JSON.parse(JSON.stringify(messages)), exits, starts, journalReads };
  }
  const accepted = await invoke({});
  assert.deepEqual(accepted.messages, [{ type: 'local-intake-accepted' }]);
  assert.equal(accepted.starts.length, 1); assert.equal(accepted.starts[0].reviewPolicy, policy);
  assert.deepEqual(accepted.exits, [1]);
  for (const change of [{ review_policy: null }, { review_policy: 'guided' }, { reviewPolicy: policy },
    { type: 'start-local-content-markdown-intake', processing_mode: 'markdown-only' },
    { type: 'start-local-intake', content_options: undefined },
    { type: 'start-local-batch', content_options: undefined }]) {
    // Absent content options on a resume/legacy message must really be absent.
    const result = await invoke(change);
    assert.equal(result.starts.length, 0); assert.equal(result.journalReads, 0);
    assert.equal(result.messages[0].error_code, 'STANDALONE_REVIEW_POLICY_INVALID');
    assert.equal(result.messages.some(message => message.type.endsWith('-accepted')), false);
    assert.deepEqual(result.exits, [2]);
  }
});

done(() => {
  const temporary = fs.realpathSync.native(os.tmpdir());
  assert.equal(path.dirname(scope), temporary); assert.match(path.basename(scope), /^datasecure-review-policy-/u);
  assert.equal(fs.lstatSync(scope).isSymbolicLink(), false);
  fs.rmSync(scope, { recursive: true });
});
