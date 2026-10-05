'use strict';

const { validateReviewResult } = require('../companion/text-review');
const { MAX_STANDALONE_REVIEW_FINDINGS } = require('../gateway/standalone-review-budget');

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
  let run = null;

  function beginAttempt(batchId) {
    if (active || run?.workerActive || !BATCH_ID_RE.test(String(batchId || ''))) {
      throw failure('STANDALONE_REVIEW_SESSION_INVALID');
    }
    const attempt = Object.freeze({});
    run = { child: null, batchId, phase: 'preparing', workerActive: true, errorCode: null, attempt };
    return attempt;
  }

  function begin(child, batchId) {
    if (active || !child || typeof child.send !== 'function' ||
        !BATCH_ID_RE.test(String(batchId || ''))) throw failure('STANDALONE_REVIEW_SESSION_INVALID');
    const attempt = run?.batchId === batchId ? run.attempt : Object.freeze({});
    run = { child, batchId, phase: 'preparing', workerActive: true, errorCode: null, attempt };
  }

  function failed(child, code = 'LOCAL_REVIEW_FAILED') {
    if (run?.child !== child) return;
    if (run.phase === 'failed' && run.errorCode && code === 'LOCAL_REVIEW_WORKER_EXITED') return;
    run.phase = 'failed';
    run.errorCode = ['LOCAL_REVIEW_TOO_LARGE', 'LOCAL_REVIEW_TIMEOUT',
      'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_FAILED', 'LOCAL_REVIEW_WORKER_EXITED',
      'LOCAL_REVIEW_START_MISSING', 'LOCAL_REVIEW_START_DENIED',
      'LOCAL_REVIEW_START_ARCHITECTURE', 'LOCAL_REVIEW_START_FAILED',
      'BATCH_REVIEW_RECONSTRUCTION_FAILED'].includes(code) ? code : 'LOCAL_REVIEW_FAILED';
  }

  function startFailed(batchId, code, child, attempt) {
    if (!run || run.batchId !== batchId || run.attempt !== attempt ||
        (run.child !== null && run.child !== child)) return;
    failed(run.child, code);
    // A failure before worker binding owns no running review. Bound live
    // workers retain ownership until observeWorker confirms their actual exit.
    if (run.child === null) run.workerActive = false;
  }

  function receive(child, message) {
    if (message?.type === 'standalone-review-failed') {
      if (run?.child === child && message.batch_token === run.batchId) failed(child, message.error_code);
      return true;
    }
    if (message?.type !== 'standalone-review-draft') return false;
    if (active || !child || typeof child.send !== 'function' ||
        (run?.workerActive && (run.child !== child || run.batchId !== message.batch_token)) ||
        !REVIEW_ID_RE.test(String(message.review_id || '')) ||
        !BATCH_ID_RE.test(String(message.batch_token || '')) ||
        message.draft?.schema !== 'data-secure-text-review/3' ||
        !Array.isArray(message.draft.ambiguities) || message.draft.allow_defer !== true) {
      try { child.send({ type: 'standalone-review-answer', review_id: message.review_id, answer: { action: 'deferred' } }); }
      catch { /* worker disconnect remains fail-closed */ }
      return true;
    }
    if (!run || run.child !== child) begin(child, message.batch_token);
    if (message.draft.ambiguities.length > MAX_STANDALONE_REVIEW_FINDINGS) {
      failed(child, 'LOCAL_REVIEW_TOO_LARGE');
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
      failed(child, 'LOCAL_REVIEW_TOO_LARGE');
      try { child.send({ type: 'standalone-review-answer', review_id: message.review_id, answer: { action: 'deferred' } }); }
      catch { /* worker disconnect remains fail-closed */ }
      return true;
    }
    active = { child, reviewId: message.review_id, batchId: message.batch_token,
      draft: message.draft, bytes };
    run.phase = 'ready';
    run.errorCode = null;
    return true;
  }

  function session() {
    const lifecycle = run ? { batch_id: run.batchId, phase: run.phase,
      worker_active: run.workerActive, ...(run.errorCode ? { error_code: run.errorCode } : {}) } : {};
    return active ? {
      ready: true, review_id: active.reviewId,
      chunk_count: Math.ceil(active.bytes.length / CHUNK_BYTES),
      byte_count: active.bytes.length, ...lifecycle
    } : { ready: false, ...lifecycle };
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
    catch { failed(current.child); throw failure('STANDALONE_REVIEW_SESSION_INVALID'); }
    run.phase = validated.action === 'reviewed' ? 'publishing' : 'deferred';
    lastReviewedBatchId = validated.action === 'reviewed' ? current.batchId : null;
    return { accepted: true, action: validated.action };
  }

  function release(child, options = {}) {
    if (active?.child === child) active = null;
    if (run?.child !== child) return;
    if (options.failed === true || ['preparing', 'ready'].includes(run.phase)) {
      failed(child, options.errorCode || 'LOCAL_REVIEW_WORKER_EXITED');
    }
    run.workerActive = false;
    run.child = null;
    if (run.phase === 'publishing') run.phase = 'idle';
  }

  return Object.freeze({ beginAttempt, begin, startFailed, failed, receive, session, chunk, submit, release,
    boundBatchId: () => run?.batchId || null,
    lastReviewedBatchId: () => lastReviewedBatchId });
}

module.exports = { createReviewBroker, CHUNK_BYTES, MAX_DRAFT_BYTES };
