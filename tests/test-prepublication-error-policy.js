'use strict';

const { createSuite } = require('./helpers');
const {
  classifyPrepublicationError,
  applyRetryBudget,
  clearRetryBudget,
  preserveOpaqueErrorCode,
  isDocumentControlBusy,
  isOwnershipControlFailure
} = require('../plugins/data-secure/server/gateway/prepublication-error');

const { test, done, assert } = createSuite('Prepublication error policy');
const retryable = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PROCESSING_INTERRUPTED']);

test('uncoded and unknown failures stop as INTERNAL_FAILURE', () => {
  for (const candidate of [null, new Error('boom'), Object.assign(new Error('boom'), { code: 'ENOENT' }),
    Object.assign(new Error('boom'), { code: 'SOME_FUTURE_UNKNOWN_CODE' })]) {
    assert.deepEqual(classifyPrepublicationError(candidate, retryable), {
      code: 'INTERNAL_FAILURE', retryable: false, deferred: false
    });
  }
});

test('only explicit catalogue members remain retryable', () => {
  for (const code of retryable) {
    assert.deepEqual(classifyPrepublicationError(Object.assign(new Error('opaque'), { code }), retryable), {
      code, retryable: true, deferred: false
    });
  }
  assert.deepEqual(classifyPrepublicationError(Object.assign(new Error('opaque'), { code: 'RESIDUAL_PII' }), retryable), {
    code: 'RESIDUAL_PII', retryable: false, deferred: false
  });
});

test('deferred review is explicit and never retryable', () => {
  assert.deepEqual(classifyPrepublicationError(
    Object.assign(new Error('opaque'), { code: 'LOCAL_REVIEW_DEFERRED' }), retryable,
    { deferredCode: 'LOCAL_REVIEW_DEFERRED' }
  ), { code: 'LOCAL_REVIEW_DEFERRED', retryable: false, deferred: true });
});

test('safe wrapping preserves only an opaque syntactically valid code', () => {
  const wrapped = preserveOpaqueErrorCode(
    Object.assign(new Error('private details'), { code: 'REQUEST_CANCELLED', path: 'C:\\private\\source.docx' }),
    new Error('safe public message')
  );
  assert.equal(wrapped.code, 'REQUEST_CANCELLED');
  assert.equal(wrapped.message, 'safe public message');
  assert.equal(wrapped.path, undefined);

  // Platform codes may survive this narrow transport boundary but the
  // authoritative classifier above still collapses them to INTERNAL_FAILURE.
  assert.equal(preserveOpaqueErrorCode({ code: 'ENOENT' }, new Error('safe')).code, 'ENOENT');
  assert.equal(classifyPrepublicationError(
    preserveOpaqueErrorCode({ code: 'ENOENT' }, new Error('safe')), retryable
  ).code, 'INTERNAL_FAILURE');

  for (const code of ['request_cancelled', 'A', 'HAS-DASH', '../SECRET']) {
    const target = preserveOpaqueErrorCode({ code }, new Error('safe'));
    assert.equal(target.code, undefined);
  }
});

test('the same transient error is bounded and success clears its durable budget', () => {
  const item = {};
  const transient = classifyPrepublicationError(Object.assign(new Error('opaque'), { code: 'PARSER_TIMEOUT' }), retryable);
  assert.deepEqual(applyRetryBudget(item, transient), {
    code: 'PARSER_TIMEOUT', retryable: true, deferred: false, retryCode: 'PARSER_TIMEOUT',
    retryFailures: 1, exhausted: false
  });
  assert.equal(applyRetryBudget(item, transient).retryable, true);
  const exhausted = applyRetryBudget(item, transient);
  assert.equal(exhausted.code, 'RETRY_LIMIT_EXCEEDED');
  assert.equal(exhausted.retryCode, 'PARSER_TIMEOUT');
  assert.equal(exhausted.retryable, false);
  assert.equal(exhausted.exhausted, true);
  assert.equal(item.retry_failure_count, 3);
  clearRetryBudget(item);
  assert.deepEqual(item, {});
});

test('a different transient code starts a separate bounded sequence', () => {
  const item = { retry_failure_code: 'PARSER_TIMEOUT', retry_failure_count: 2 };
  const changed = applyRetryBudget(item, classifyPrepublicationError(
    Object.assign(new Error('opaque'), { code: 'REQUEST_CANCELLED' }), retryable
  ));
  assert.equal(changed.retryFailures, 1);
  assert.equal(changed.retryable, true);
  assert.deepEqual(item, { retry_failure_code: 'REQUEST_CANCELLED', retry_failure_count: 1 });
});

test('document-control admission never consumes or clears an existing parser budget', () => {
  const busy = Object.assign(Error('fixed contention'), { code: 'STANDALONE_BUSY' });
  const pending = classifyPrepublicationError(busy, retryable);
  assert.deepEqual(pending, { code: 'STANDALONE_BUSY', retryable: true, deferred: false });
  for (const initial of [{}, { retry_failure_code: 'PARSER_TIMEOUT', retry_failure_count: 2 },
    { retry_failure_code: 'STANDALONE_BUSY', retry_failure_count: 3 }]) {
    const item = { ...initial };
    for (let repeat = 0; repeat < 100; repeat++) {
      const result = applyRetryBudget(item, pending);
      assert.equal(result.code, 'STANDALONE_BUSY'); assert.equal(result.retryable, true);
      assert.equal(result.exhausted, false); assert.deepEqual(item, initial);
    }
  }
  const parser = { retry_failure_code: 'PARSER_TIMEOUT', retry_failure_count: 2 };
  applyRetryBudget(parser, pending);
  assert.equal(applyRetryBudget(parser, classifyPrepublicationError({ code: 'PARSER_TIMEOUT' }, retryable)).code, 'RETRY_LIMIT_EXCEEDED');
});

test('control classification reads only own data codes, never foreign getters or proxy traps', () => {
  let effects = 0;
  for (const value of [{ get code() { effects++; return 'STANDALONE_BUSY'; } },
    Object.create({ code: 'STANDALONE_BUSY' }), new Proxy({}, { get() { effects++; }, getOwnPropertyDescriptor() { effects++; } })]) {
    assert.equal(isDocumentControlBusy(value), false); assert.equal(isOwnershipControlFailure(value), false);
    assert.equal(classifyPrepublicationError(value, retryable).code, 'INTERNAL_FAILURE');
    assert.equal(preserveOpaqueErrorCode(value, Error('safe')).code, undefined);
  }
  assert.equal(effects, 0);
  for (const code of ['BATCH_OWNERSHIP_CHANGED', 'OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED',
    'STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']) {
    const error = Object.assign(Error('fixed refusal'), { code });
    assert.equal(isDocumentControlBusy(error), false); assert.equal(isOwnershipControlFailure(error), true);
  }
});

done();
