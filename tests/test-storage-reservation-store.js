'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  RESERVATION_SCHEMA,
  readReservation,
  claimStorageReservation
} = require('../plugins/data-secure/server/gateway/storage-reservation-store');

const { test, done, assert } = createSuite('Private storage reservation store');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-reservation-store-'));
const token = 'a'.repeat(64);
function directory(name) { return path.join(base, name); }

test('a coordinator materializes a closed private reservation record', () => {
  const dir = directory('materialized');
  const claimed = claimStorageReservation(dir, { batchToken: token, reservedBytes: 16_384 }, { coordinator: true });
  assert.strictEqual(fs.statSync(path.join(dir, 'reservation.bin')).size, 16_384);
  assert.deepStrictEqual(readReservation(dir), claimed);
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'reservation.json'), 'utf8'));
  assert.strictEqual(record.schema, RESERVATION_SCHEMA);
  assert.deepStrictEqual(Object.keys(record).sort(), ['batch_token', 'reservation_id', 'reserved_bytes', 'schema', 'state']);
  assert.doesNotMatch(JSON.stringify(record), /filename|path|hash|content|profile|error/i);
});

test('a duplicate claim, malformed record or unknown directory entry fails closed', () => {
  const dir = directory('blocked');
  claimStorageReservation(dir, { batchToken: token, reservedBytes: 1024 }, { coordinator: true });
  assert.throws(() => claimStorageReservation(dir, { batchToken: token, reservedBytes: 1024 }, { coordinator: true }), /Speicherreservierung/u);

  const malformed = directory('malformed');
  fs.mkdirSync(malformed, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(malformed, 'reservation.json'), '{', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.throws(() => readReservation(malformed), /Speicherreservierung/u);

  const extra = directory('extra');
  fs.mkdirSync(extra, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(extra, 'unknown.tmp'), 'x', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.throws(() => claimStorageReservation(extra, { batchToken: token, reservedBytes: 1024 }, { coordinator: true }), /Speicherreservierung/u);
});

test('claim requires an explicit coordinator and leaves no sparse placeholder', () => {
  const dir = directory('authorization');
  assert.throws(() => claimStorageReservation(dir, { batchToken: token, reservedBytes: 1024 }), /Speicherreservierung/u);
  const claimed = claimStorageReservation(dir, { batchToken: token, reservedBytes: 1024 }, { coordinator: true });
  const bytes = fs.readFileSync(path.join(dir, 'reservation.bin'));
  assert.strictEqual(bytes.length, claimed.reservedBytes);
  assert.ok(bytes.every((value) => value === 0));
});

test('a pre-record reservation file is never deleted by a competing claimant', () => {
  const dir = directory('race-protection');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const data = path.join(dir, 'reservation.bin');
  fs.writeFileSync(data, Buffer.alloc(2048), { flag: 'wx', mode: 0o600 });
  assert.throws(() => claimStorageReservation(dir, { batchToken: token, reservedBytes: 1024 }, { coordinator: true }), /Speicherreservierung/u);
  assert.strictEqual(fs.statSync(data).size, 2048);
  assert.strictEqual(fs.existsSync(path.join(dir, 'reservation.json')), false);
});

try { done(); } finally { fs.rmSync(base, { recursive: true, force: true }); }
