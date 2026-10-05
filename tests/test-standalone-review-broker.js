'use strict';

const { createSuite } = require('./helpers');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');
const { encodeFrame, FrameDecoder, MAX_FRAME_BYTES } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { MAX_STANDALONE_REVIEW_FINDINGS } = require('../plugins/data-secure/server/gateway/standalone-review-budget');

const { test, done, assert } = createSuite('Standalone review broker');
const reviewId = 'a'.repeat(32);
const batchId = 'b'.repeat(64);
const original = 'Denise Koch erstellt den Bericht.';
const draft = buildReviewDraft(original, original, 'general', [{
  ambiguity_id: 'person:v1:000001', type: 'person_prose_ambiguous', replacement_kind: 'PERSON',
  original_start: 0, original_end: 12, anonymized_start: 0, anonymized_end: 12
}], { allowDefer: true });

function child() {
  const messages = [];
  return { messages, send(message) { messages.push(message); } };
}

test('a private draft is chunked and one complete answer reaches only its owning worker', () => {
  const broker = createReviewBroker();
  const owner = child();
  assert.strictEqual(broker.receive(owner, { type: 'standalone-review-draft', review_id: reviewId,
    batch_token: batchId, draft }), true);
  const session = broker.session();
  assert.strictEqual(session.ready, true);
  const payload = Buffer.concat(Array.from({ length: session.chunk_count }, (_, index) => {
    const part = broker.chunk(reviewId, index);
    assert.strictEqual(part.index, index);
    return Buffer.from(part.data, 'base64');
  }));
  assert.deepStrictEqual(JSON.parse(payload.toString('utf8')), draft);
  assert.throws(() => broker.chunk('b'.repeat(32), 0), { code: 'STANDALONE_REVIEW_SESSION_INVALID' });
  assert.throws(() => broker.submit(reviewId, { action: 'reviewed', decisions: [], redactions: [] }),
    { code: 'STANDALONE_REVIEW_DECISION_INVALID' });
  assert.strictEqual(owner.messages.length, 0);
  assert.deepStrictEqual(broker.submit(reviewId, { action: 'reviewed', redactions: [], decisions: [
    { ambiguity_id: 'person:v1:000001', decision: 'redact' }
  ] }), { accepted: true, action: 'reviewed' });
  assert.deepStrictEqual(owner.messages[0].answer.decisions, [
    { ambiguity_id: 'person:v1:000001', decision: 'redact' }
  ]);
  assert.strictEqual(broker.session().ready, false);
  assert.strictEqual(broker.lastReviewedBatchId(), batchId);
});

test('overlapping drafts are deferred, and worker exit discards only its draft', () => {
  const broker = createReviewBroker();
  const first = child();
  const second = child();
  broker.receive(first, { type: 'standalone-review-draft', review_id: reviewId,
    batch_token: batchId, draft });
  broker.receive(second, { type: 'standalone-review-draft', review_id: 'b'.repeat(32),
    batch_token: batchId, draft });
  assert.deepStrictEqual(second.messages[0].answer, { action: 'deferred' });
  broker.release(second);
  assert.strictEqual(broker.session().ready, true);
  broker.release(first);
  assert.strictEqual(broker.session().ready, false);
});

test('only an explicitly enabled Standalone draft carries a company choice through the broker', () => {
  const answer = { action: 'reviewed', redactions: [], decisions: [
    { ambiguity_id: 'person:v1:000001', decision: 'redact_organization' }
  ] };
  for (const enabled of [false, true]) {
    const broker = createReviewBroker();
    const owner = child();
    const ownedDraft = { ...draft, ...(enabled ? { allow_organization_review: true } : {}) };
    broker.receive(owner, { type: 'standalone-review-draft', review_id: reviewId,
      batch_token: batchId, draft: ownedDraft });
    if (enabled) {
      assert.equal(broker.submit(reviewId, answer).accepted, true);
      assert.equal(owner.messages[0].answer.decisions[0].decision, 'redact_organization');
    } else {
      assert.throws(() => broker.submit(reviewId, answer), { code: 'STANDALONE_REVIEW_DECISION_INVALID' });
      assert.equal(owner.messages.length, 0);
    }
  }
});

test('serialized company decisions cross the actual frame decoder but still require an authorized draft', () => {
  const request = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(16),
    action: 'submit_review', review_id: reviewId, answer: { action: 'reviewed', redactions: [],
      decisions: [{ ambiguity_id: 'person:v1:000001', decision: 'redact_organization' }] } };
  const bytes = encodeFrame(request);
  const decoder = new FrameDecoder();
  assert.deepStrictEqual(decoder.push(bytes.subarray(0, 17)), []);
  const [decoded] = decoder.push(bytes.subarray(17));
  assert.deepStrictEqual(decoded, request);
  for (const enabled of [true, false]) {
    const broker = createReviewBroker();
    const owner = child();
    broker.begin(owner, batchId);
    broker.receive(owner, { type: 'standalone-review-draft', review_id: reviewId,
      batch_token: batchId, draft: { ...draft, ...(enabled ? { allow_organization_review: true } : {}) } });
    if (enabled) assert.strictEqual(broker.submit(decoded.review_id, decoded.answer).accepted, true);
    else assert.throws(() => broker.submit(decoded.review_id, decoded.answer), { code: 'STANDALONE_REVIEW_DECISION_INVALID' });
  }
});

test('the shared app decision budget fits the real 1 MiB frame even at maximum ID length', () => {
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(64),
    action: 'submit_review', review_id: reviewId, answer: { action: 'reviewed', redactions: [],
      decisions: Array.from({ length: MAX_STANDALONE_REVIEW_FINDINGS }, () => ({
        ambiguity_id: 'a'.repeat(80), decision: 'redact_organization' })) } };
  assert.ok(encodeFrame(message).length - 4 <= MAX_FRAME_BYTES);
  message.answer.decisions.push(message.answer.decisions[0]);
  assert.throws(() => encodeFrame(message), { code: 'DESKTOP_IPC_REVIEW_INVALID' });
});

test('worker failure before the first draft retains its exact run and does not become an unconditional continuation', () => {
  const broker = createReviewBroker();
  const owner = child();
  broker.begin(owner, batchId);
  assert.deepStrictEqual(broker.session(), { ready: false, batch_id: batchId,
    phase: 'preparing', worker_active: true });
  broker.receive(child(), { type: 'standalone-review-failed', batch_token: batchId,
    error_code: 'LOCAL_REVIEW_TOO_LARGE' });
  assert.strictEqual(broker.session().phase, 'preparing', 'a foreign worker cannot fail the session');
  broker.receive(owner, { type: 'standalone-review-failed', batch_token: batchId,
    error_code: 'LOCAL_REVIEW_TOO_LARGE' });
  broker.release(owner, { failed: true, errorCode: 'LOCAL_REVIEW_WORKER_EXITED' });
  assert.deepStrictEqual(broker.session(), { ready: false, batch_id: batchId,
    phase: 'failed', worker_active: false, error_code: 'LOCAL_REVIEW_TOO_LARGE' });
  assert.strictEqual(broker.boundBatchId(), batchId);
  assert.strictEqual(broker.lastReviewedBatchId(), null);
  const replacement = child();
  broker.begin(replacement, batchId);
  assert.strictEqual(broker.session().phase, 'preparing');
  assert.strictEqual(broker.session().error_code, undefined);
});

test('a late native error from an older spawn attempt cannot fail a new attempt on the same run', () => {
  const broker = createReviewBroker();
  const attempt = broker.beginAttempt(batchId);
  broker.startFailed(batchId, 'LOCAL_REVIEW_START_MISSING', null, attempt);
  const replacement = broker.beginAttempt(batchId);
  broker.startFailed(batchId, 'LOCAL_REVIEW_START_DENIED', null, attempt);
  assert.strictEqual(broker.session().phase, 'preparing');
  assert.strictEqual(broker.session().error_code, undefined);
  broker.startFailed(batchId, 'LOCAL_REVIEW_START_ARCHITECTURE', null, replacement);
  assert.strictEqual(broker.session().error_code, 'LOCAL_REVIEW_START_ARCHITECTURE');
});

test('a malformed draft is deferred without appearing in the UI', () => {
  const broker = createReviewBroker();
  const owner = child();
  broker.receive(owner, { type: 'standalone-review-draft', review_id: reviewId,
    batch_token: batchId, draft: { ...draft, ambiguities: undefined } });
  assert.deepStrictEqual(owner.messages[0].answer, { action: 'deferred' });
  assert.strictEqual(broker.session().ready, false);
});

test('review continuation identity is not borrowed from a malformed or deferred draft', () => {
  const broker = createReviewBroker();
  const owner = child();
  broker.receive(owner, { type: 'standalone-review-draft', review_id: reviewId, draft });
  assert.deepStrictEqual(owner.messages[0].answer, { action: 'deferred' });
  assert.strictEqual(broker.lastReviewedBatchId(), null);
  const valid = child();
  broker.receive(valid, { type: 'standalone-review-draft', review_id: reviewId,
    batch_token: batchId, draft });
  broker.submit(reviewId, { action: 'deferred' });
  assert.strictEqual(broker.lastReviewedBatchId(), null);
});

done();
