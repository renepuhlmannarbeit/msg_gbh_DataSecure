'use strict';

const { createSuite } = require('./helpers');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');

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
