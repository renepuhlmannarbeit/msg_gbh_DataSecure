'use strict';

const { normalizeDocumentResultReasonCode } = require('./document-result-grade');
const { types } = require('node:util');

const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const MAX_SAME_ERROR_FAILURES = 3;
function ownCode(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return '';
  const value = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof value === 'string' && value.length <= 100 ? value : '';
}
const isDocumentControlBusy = error => ownCode(error) === 'STANDALONE_BUSY';
const isOwnershipControlFailure = error => {
  const code = ownCode(error);
  return code === 'BATCH_OWNERSHIP_CHANGED' || /^(?:OWNERSHIP_GUARD_|STANDALONE_OWNERSHIP_)/u.test(code);
};

// Only idempotent document metadata operations belong here, never extraction,
// privacy processing, publication, registry actions or an entire callback.
// The synchronous control attempt has ended before the event-loop wait.
async function retryDocumentControl(action, options = {}) {
  const attempts = options.attempts ?? 50, delayMs = options.delayMs ?? 100;
  if (typeof action !== 'function' || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 50 ||
      !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 1000) throw new TypeError('DOCUMENT_CONTROL_RETRY_INVALID');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await action(); }
    catch (error) {
      if (!isDocumentControlBusy(error) || attempt + 1 === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Preserve only an opaque machine code while an untrusted implementation
// error is converted into a SafeError. Messages, paths, stacks and arbitrary
// object properties never cross that boundary. The final classifier below is
// still authoritative and collapses codes outside the product catalogue to
// INTERNAL_FAILURE.
function preserveOpaqueErrorCode(source, target) {
  const code = ownCode(source);
  if (ERROR_CODE.test(code)) target.code = code;
  return target;
}

// Only an explicitly coded member of the product retry catalogue may be
// resumed. A caught exception proves that the worker returned control; it is
// therefore not evidence that the process disappeared. Real process loss is
// derived separately by batch reconciliation from a durable, orphaned
// `processing` checkpoint.
function classifyPrepublicationError(error, retryableCodes, options = {}) {
  const deferredCode = options.deferredCode || null;
  const raw = ownCode(error) || 'INTERNAL_FAILURE';
  const controlBusy = isDocumentControlBusy(error);
  const code = controlBusy || raw === deferredCode || retryableCodes.has(raw)
    ? raw
    : normalizeDocumentResultReasonCode(raw);
  return Object.freeze({
    code,
    retryable: controlBusy || retryableCodes.has(code),
    deferred: deferredCode !== null && code === deferredCode
  });
}

// An explicitly transient error may still be persistent on a broken target
// installation. Keep the failure identity and bound repeated manual resumes so
// the user can never be trapped in an endless Continue loop. A different
// transient cause starts its own bounded sequence.
function applyRetryBudget(item, classification, limit = MAX_SAME_ERROR_FAILURES) {
  // Control admission says nothing about the document. It neither consumes
  // nor clears an earlier parser-failure budget, even after repeated resumes.
  if (classification.code === 'STANDALONE_BUSY' && classification.retryable)
    return Object.freeze({ ...classification, retryFailures: 0, exhausted: false });
  if (!classification.retryable) return Object.freeze({ ...classification, retryFailures: 0, exhausted: false });
  const previous = item?.retry_failure_code === classification.code &&
    Number.isSafeInteger(item?.retry_failure_count) && item.retry_failure_count > 0
    ? item.retry_failure_count
    : 0;
  const retryFailures = Math.min(limit, previous + 1);
  const exhausted = retryFailures >= limit;
  item.retry_failure_code = classification.code;
  item.retry_failure_count = retryFailures;
  return Object.freeze({
    ...classification,
    code: exhausted ? 'RETRY_LIMIT_EXCEEDED' : classification.code,
    retryable: !exhausted,
    retryCode: classification.code,
    retryFailures,
    exhausted
  });
}

function clearRetryBudget(item) {
  delete item.retry_failure_code;
  delete item.retry_failure_count;
}

module.exports = {
  MAX_SAME_ERROR_FAILURES,
  classifyPrepublicationError,
  applyRetryBudget,
  clearRetryBudget,
  preserveOpaqueErrorCode,
  isDocumentControlBusy,
  isOwnershipControlFailure,
  retryDocumentControl
};
