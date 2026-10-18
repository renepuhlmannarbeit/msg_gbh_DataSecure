'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ownershipErrorCode, observeOwnershipOutcome } = require('../plugins/data-secure/server/core/ownership-diagnostics');
test('ownership diagnostics accept only fixed mapped codes and never vendor details', () => {
  for (const [internal, expected] of [
    ['OWNERSHIP_GUARD_ACCESS_DENIED', 'STANDALONE_OWNERSHIP_RUNTIME_DENIED'],
    ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'],
    ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']
  ]) {
    assert.equal(ownershipErrorCode(internal), expected);
    assert.equal(ownershipErrorCode(Object.assign(Error('PRIVATE_VENDOR /Users/private'), { code: internal })), expected);
    assert.equal(ownershipErrorCode(expected), expected);
  }
  for (const input of [null, undefined, false, 42, 'OWNERSHIP_GUARD_PRIVATE_VENDOR', 'STANDALONE_OPERATION_FAILED',
    { get code() { throw Error('must not execute'); } }, new Proxy({}, { getOwnPropertyDescriptor() { throw Error('must not reflect'); } })])
    assert.equal(ownershipErrorCode(input), null);
});
test('hidden export causes reach bounded diagnostics without widening their public envelope', () => {
  const result = { exported: 0, pending: 1, failures: 1 }, recorded = [];
  Object.defineProperty(result, 'ownership_error_code', { value: 'OWNERSHIP_GUARD_ACCESS_DENIED' });
  assert.equal(observeOwnershipOutcome(result, (...args) => recorded.push(args)), result);
  assert.deepEqual(recorded, [['ownership_control_check_failed', { outcome: 'failed', phase: 'reconcile',
    error_code: 'STANDALONE_OWNERSHIP_RUNTIME_DENIED' }]]);
  assert.equal(JSON.stringify(result), '{"exported":0,"pending":1,"failures":1}');
  assert.equal(observeOwnershipOutcome(result, () => { throw Error('diagnostic sink failed'); }), result);
});
test('diagnostic hooks do not evaluate foreign getter/proxy outcomes or alter successes', () => {
  for (const result of [{ exported: 2, pending: 0 }, null, undefined,
    { get ownership_error_code() { throw Error('must not execute'); } },
    new Proxy({}, { getOwnPropertyDescriptor() { throw Error('must not reflect'); } })])
    assert.equal(observeOwnershipOutcome(result, () => assert.fail('not a closed cause')), result);
});
test('real Standalone wiring observes both replay and history export and preserves startup ownership causes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/standalone/application-service.js'), 'utf8');
  assert.match(source, /exportCompletedBatchResults: \(\.\.\.args\) => observeOwnershipOutcome\(exportCompletedBatchResults\(\.\.\.args\), startupEvent\)/u);
  assert.match(source, /replayPendingResultExports: \(\) => observeOwnershipOutcome\(replayPendingResultExports\(\), startupEvent\)/u);
  assert.match(source, /fixedFailure\(ownershipErrorCode\(error\) \|\| outcome\.code/u);
});
test('shared lock-release cleanup preserves fixed native causes without replacing a primary failure', () => {
  const { releaseOwnedLock, RELEASE_MESSAGE } = require('../plugins/data-secure/server/gateway/batch-lock-release');
  const native = Object.assign(Error('PRIVATE /Users/private'), { code: 'OWNERSHIP_GUARD_UNSAFE' });
  assert.throws(() => releaseOwnedLock(() => { throw native; }, 'private token'), error =>
    error.code === 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' && error.message === RELEASE_MESSAGE);
  assert.equal(releaseOwnedLock(() => { throw native; }, 'private token', Error, true), false);
});
