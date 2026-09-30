'use strict';

const { validateReviewResult } = require('../companion/text-review');

const CHUNK_BYTES = 128 * 1024;
const MAX_DRAFT_BYTES = 40 * 1024 * 1024;
const REVIEW_ID_RE = /^[a-f0-9]{32}$/u;
const BATCH_ID_RE = /^[a-f0-9]{64}$/u;

function failure(code) { return Object.assign(new Error(code), { code }); }

// This broker exists only in the Standalone sidecar. Sensitive drafts never
// enter the content-free main renderer, a journal, diagnostics or Cowork.
function createReviewBroker() {
  let active = null;
  let lastReviewedBatchId = null;

  function receive(child, message) {
    if (message?.type !== 'standalone-review-draft') return false;
    if (active || !child || typeof child.send !== 'function' ||
        !REVIEW_ID_RE.test(String(message.review_id || '')) ||
        !BATCH_ID_RE.test(String(message.batch_token || '')) ||
        message.draft?.schema !== 'data-secure-text-review/3' ||
        !Array.isArray(message.draft.ambiguities) || message.draft.allow_defer !== true) {
      try { child.send({ type: 'standalone-review-answer', review_id: message.review_id, answer: { action: 'deferred' } }); }
      catch { /* worker disconnect remains fail-closed */ }
      return true;
    }
    let bytes;
    try { bytes = Buffer.from(JSON.stringify(message.draft), 'utf8'); }
    catch {
      try { child.send({ type: 'standalone-review-answer', review_id: message.review_id, answer: { action: 'deferred' } }); }
      catch { /* worker disconnect remains fail-closed */ }
      return true;
    }
    if (bytes.length < 1 || bytes.length > MAX_DRAFT_BYTES) {
      try { child.send({ type: 'standalone-review-answer', review_id: message.review_id, answer: { action: 'deferred' } }); }
      catch { /* worker disconnect remains fail-closed */ }
      return true;
    }
    active = { child, reviewId: message.review_id, batchId: message.batch_token,
      draft: message.draft, bytes };
    return true;
  }

  function session() {
    return active ? {
      ready: true, review_id: active.reviewId,
      chunk_count: Math.ceil(active.bytes.length / CHUNK_BYTES),
      byte_count: active.bytes.length
    } : { ready: false };
  }

  function chunk(reviewId, index) {
    if (!active || reviewId !== active.reviewId ||
        !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(active.bytes.length / CHUNK_BYTES)) {
      throw failure('STANDALONE_REVIEW_SESSION_INVALID');
    }
    const start = index * CHUNK_BYTES;
    return { review_id: reviewId, index, data: active.bytes.subarray(start, start + CHUNK_BYTES).toString('base64') };
  }

  function submit(reviewId, answer) {
    if (!active || reviewId !== active.reviewId) throw failure('STANDALONE_REVIEW_SESSION_INVALID');
    let validated;
    try { validated = validateReviewResult(answer, active.draft); }
    catch { throw failure('STANDALONE_REVIEW_DECISION_INVALID'); }
    const current = active;
    active = null;
    try { current.child.send({ type: 'standalone-review-answer', review_id: reviewId, answer: validated }); }
    catch { throw failure('STANDALONE_REVIEW_SESSION_INVALID'); }
    lastReviewedBatchId = validated.action === 'reviewed' ? current.batchId : null;
    return { accepted: true, action: validated.action };
  }

  function release(child) {
    if (active?.child === child) active = null;
  }

  return Object.freeze({ receive, session, chunk, submit, release,
    lastReviewedBatchId: () => lastReviewedBatchId });
}

module.exports = { createReviewBroker, CHUNK_BYTES, MAX_DRAFT_BYTES };
