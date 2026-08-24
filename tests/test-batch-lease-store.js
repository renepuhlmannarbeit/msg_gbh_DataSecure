'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  LEASE_SCHEMA,
  SLOT_COUNT,
  scanLeases,
  claimPreparationLease,
  assertPreparationLease,
  releasePreparationLease,
  recoverStalePreparationLeases
} = require('../plugins/data-secure/server/gateway/batch-lease-store');

const { test, done, assert } = createSuite('Private batch preparation leases');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-lease-store-'));
const token = 'a'.repeat(64);
const itemA = 'b'.repeat(32);
const itemB = 'c'.repeat(32);
const itemC = 'd'.repeat(32);

function directory(name) { return path.join(base, name); }
function identity(itemId, pid = process.pid) { return { batchToken: token, itemId, pid }; }

test('exactly two opaque preparation slots can be claimed and released', () => {
  const dir = directory('two-slots');
  const first = claimPreparationLease(dir, identity(itemA));
  const second = claimPreparationLease(dir, identity(itemB));
  assert.strictEqual(SLOT_COUNT, 2);
  assert.deepStrictEqual(scanLeases(dir).map((lease) => lease.slot).sort(), [1, 2]);
  assert.strictEqual(assertPreparationLease(dir, first, identity(itemA)), true);
  assert.strictEqual(releasePreparationLease(dir, first, identity(itemA)), true);
  const third = claimPreparationLease(dir, identity(itemC));
  assert.strictEqual(assertPreparationLease(dir, third, identity(itemC)), true);
  assert.strictEqual(releasePreparationLease(dir, second, identity(itemB)), true);
  assert.strictEqual(releasePreparationLease(dir, third, identity(itemC)), true);
  assert.deepStrictEqual(scanLeases(dir), []);
});

test('a third claim or duplicate batch item fails closed', () => {
  const dir = directory('full');
  claimPreparationLease(dir, identity(itemA));
  claimPreparationLease(dir, identity(itemB));
  assert.throws(() => claimPreparationLease(dir, identity(itemC)), /Worker-Sperre/u);
  assert.throws(() => claimPreparationLease(dir, identity(itemA)), /Worker-Sperre/u);
});

test('a wrong identity or lease capability cannot release another slot', () => {
  const dir = directory('capability');
  const lease = claimPreparationLease(dir, identity(itemA));
  assert.throws(() => releasePreparationLease(dir, lease, identity(itemB)), /Worker-Sperre/u);
  assert.throws(() => releasePreparationLease(dir, { ...lease, leaseId: 'e'.repeat(64) }, identity(itemA)), /Worker-Sperre/u);
  assert.strictEqual(scanLeases(dir).length, 1);
  assert.strictEqual(releasePreparationLease(dir, lease, identity(itemA)), true);
});

test('malformed or unexpected local lease entries block instead of being removed', () => {
  const dir = directory('malformed');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const malformed = path.join(dir, 'slot-1.lease');
  fs.writeFileSync(malformed, '{not-json', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.throws(() => claimPreparationLease(dir, identity(itemA)), /Worker-Sperre/u);
  assert.strictEqual(fs.readFileSync(malformed, 'utf8'), '{not-json');

  const extra = directory('extra');
  fs.mkdirSync(extra, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(extra, 'unexpected.txt'), 'private', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.throws(() => claimPreparationLease(extra, identity(itemA)), /Worker-Sperre/u);
});

test('lease records have a closed schema without source metadata', () => {
  const dir = directory('schema');
  const lease = claimPreparationLease(dir, identity(itemA));
  const raw = fs.readFileSync(path.join(dir, `slot-${lease.slot}.lease`), 'utf8');
  const value = JSON.parse(raw);
  assert.strictEqual(value.schema, LEASE_SCHEMA);
  assert.deepStrictEqual(Object.keys(value).sort(), ['batch_token', 'item_id', 'lease_id', 'pid', 'schema']);
  assert.doesNotMatch(raw, /filename|path|hash|content|profile|error/i);
  releasePreparationLease(dir, lease, identity(itemA));
});

test('only a central coordinator can reclaim a verified dead lease for its approved item', () => {
  const dir = directory('recovery');
  const lease = claimPreparationLease(dir, identity(itemA, 4242));
  assert.throws(() => recoverStalePreparationLeases(dir, token, new Set([itemA])), /Worker-Sperre/u);
  assert.deepStrictEqual(recoverStalePreparationLeases(dir, token, new Set([itemA]), {
    coordinator: true,
    processDefinitelyDead: (pid) => pid === 4242
  }), { recovered: 1 });
  assert.deepStrictEqual(scanLeases(dir), []);
  assert.doesNotMatch(JSON.stringify(lease), /filename|path|hash|content|profile|error/i);
});

test('live, unknown or unapproved leases remain fail-closed during recovery', () => {
  const dir = directory('recovery-block');
  const lease = claimPreparationLease(dir, identity(itemA, 5252));
  assert.deepStrictEqual(recoverStalePreparationLeases(dir, token, new Set([itemA]), {
    coordinator: true,
    processDefinitelyDead: () => false
  }), { recovered: 0 });
  assert.strictEqual(scanLeases(dir).length, 1);
  assert.throws(() => recoverStalePreparationLeases(dir, token, new Set([itemB]), {
    coordinator: true,
    processDefinitelyDead: () => true
  }), /Worker-Sperre/u);
  assert.strictEqual(scanLeases(dir).length, 1);
  assert.strictEqual(releasePreparationLease(dir, lease, identity(itemA, 5252)), true);
});

try { done(); } finally { fs.rmSync(base, { recursive: true, force: true }); }
