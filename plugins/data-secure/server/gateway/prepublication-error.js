'use strict';

const { normalizeDocumentResultReasonCode } = require('./document-result-grade');

const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const MAX_SAME_ERROR_FAILURES = 3;

// Preserve only an opaque machine code while an untrusted implementation
// error is converted into a SafeError. Messages, paths, stacks and arbitrary
// object properties never cross that boundary. The final classifier below is
// still authoritative and collapses codes outside the product catalogue to
// INTERNAL_FAILURE.
function preserveOpaqueErrorCode(source, target) {
  if (ERROR_CODE.test(String(source?.code || ''))) target.code = source.code;
  return target;
}

// Only an explicitly coded member of the product retry catalogue may be
// resumed. A caught exception proves that the worker returned control; it is
// therefore not evidence that the process disappeared. Real process loss is
// derived separately by batch reconciliation from a durable, orphaned
// `processing` checkpoint.
function classifyPrepublicationError(error, retryableCodes, options = {}) {
  const deferredCode = options.deferredCode || null;
  const raw = typeof error?.code === 'string' && error.code.length > 0
    ? error.code
    : 'INTERNAL_FAILURE';
  const code = raw === deferredCode || retryableCodes.has(raw)
    ? raw
    : normalizeDocumentResultReasonCode(raw);
  return Object.freeze({
    code,
    retryable: retryableCodes.has(code),
    deferred: deferredCode !== null && code === deferredCode
  });
}

// An explicitly transient error may still be persistent on a broken target
// installation. Keep the failure identity and bound repeated manual resumes so
// the user can never be trapped in an endless Continue loop. A different
// transient cause starts its own bounded sequence.
function applyRetryBudget(item, classification, limit = MAX_SAME_ERROR_FAILURES) {
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
  preserveOpaqueErrorCode
};
