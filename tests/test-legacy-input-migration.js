'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { SCHEMA, migrateLegacyInputV1, readMarker, _test } = require('../plugins/data-secure/server/gateway/legacy-input-migration');

const { test, done, assert } = createSuite('Versioned legacy Input migration');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-legacy-input-'));
  const input = path.join(root, 'Input');
  const jobs = path.join(root, 'jobs');
  const migrations = path.join(root, 'migrations');
  fs.mkdirSync(jobs); fs.mkdirSync(migrations);
  return { root, input, jobs, migrations, marker: path.join(migrations, 'legacy-input-v1.json'), locations: { jobs, migrations } };
}

const claimName = (jobId, original) => `.processing_${jobId}_${original}`;
function identity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
}

test('64-bit Windows file identities never collapse to a rounded collision or accept Number stats', () => {
  const first = { dev: 1n, ino: 9570149209941131n };
  const second = { dev: 1n, ino: 9570149209941132n };
  assert.strictEqual(Number(first.ino), Number(second.ino), 'counterexample must collide when rounded');
  assert.strictEqual(_test.sameFile(first, second), false);
  assert.strictEqual(_test.sameFile(first, { ...first }), true);
  assert.strictEqual(_test.sameFile({ dev: 1, ino: Number(first.ino) }, { dev: 1, ino: Number(second.ino) }), false);
  const f = fixture(); fs.mkdirSync(f.input);
  const original = path.join(f.input, 'exact.txt');
  fs.writeFileSync(original, 'actual held identity');
  const exact = fs.lstatSync(original, { bigint: true });
  assert.strictEqual(_test.recoveryDestination(f.input, 'exact.txt', exact).alreadyLinked, true);
  const unrelated = { dev: exact.dev, ino: exact.ino + 1n };
  const recovered = _test.recoveryDestination(f.input, 'exact.txt', unrelated);
  assert.strictEqual(recovered.alreadyLinked, false);
  assert.strictEqual(path.basename(recovered.destination), 'exact_wiederhergestellt_2.txt');
});

test('fresh install writes only a private version marker and never creates Input', () => {
  const f = fixture();
  const result = migrateLegacyInputV1({ ...f, now: Date.UTC(2026, 7, 26) });
  assert.strictEqual(result.state, 'not_present');
  assert.strictEqual(fs.existsSync(f.input), false);
  assert.strictEqual(readMarker(f.marker).schema, SCHEMA);
});

test('visible legacy sources and unknown entries remain byte and identity stable', () => {
  const f = fixture(); fs.mkdirSync(f.input);
  const visible = path.join(f.input, 'original.txt'); const dotfile = path.join(f.input, '.private-note');
  fs.writeFileSync(visible, 'source bytes'); fs.writeFileSync(dotfile, 'dot bytes');
  const before = [identity(visible), identity(dotfile)];
  const result = migrateLegacyInputV1(f);
  assert.strictEqual(result.state, 'complete'); assert.strictEqual(result.retained_visible_sources, 2);
  assert.deepStrictEqual([identity(visible), identity(dotfile)], before);
});

test('abandoned claim is hard-linked collision-free while its hidden source object is retained', () => {
  const f = fixture(); fs.mkdirSync(f.input);
  const hidden = path.join(f.input, claimName('legacy_12345678', 'collision.txt'));
  fs.writeFileSync(hidden, 'historical bytes'); fs.writeFileSync(path.join(f.input, 'collision.txt'), 'newer bytes');
  const result = migrateLegacyInputV1({ ...f, isProcessAlive: () => false });
  const recovered = path.join(f.input, 'collision_wiederhergestellt_2.txt');
  assert.strictEqual(result.state, 'complete'); assert.strictEqual(result.claims_preserved, 1);
  assert.strictEqual(fs.existsSync(hidden), true); assert.strictEqual(fs.readFileSync(recovered, 'utf8'), 'historical bytes');
  assert.strictEqual(fs.readFileSync(path.join(f.input, 'collision.txt'), 'utf8'), 'newer bytes');
  assert.strictEqual(identity(hidden).ino, identity(recovered).ino);
  const again = migrateLegacyInputV1({ ...f, isProcessAlive: () => false });
  assert.strictEqual(again.claims_preserved, 1);
  assert.strictEqual(fs.existsSync(path.join(f.input, 'collision_wiederhergestellt_3.txt')), false);
});

test('a live historical owner defers without a visible link or completion marker', () => {
  const f = fixture(); fs.mkdirSync(f.input); const jobId = 'active_12345678';
  fs.writeFileSync(path.join(f.input, claimName(jobId, 'active.txt')), 'active bytes');
  const job = path.join(f.jobs, jobId); fs.mkdirSync(job);
  fs.writeFileSync(path.join(job, '.owner.json'), JSON.stringify({ pid: process.pid, created_at: new Date().toISOString(), nonce: 'a'.repeat(32) }));
  const result = migrateLegacyInputV1({ ...f, isProcessAlive: () => true });
  assert.strictEqual(result.state, 'deferred'); assert.strictEqual(result.active, 1);
  assert.strictEqual(fs.existsSync(path.join(f.input, 'active.txt')), false); assert.strictEqual(fs.existsSync(f.marker), false);
});

test('a live historical owner still defers when its visible recovery hardlink already exists', () => {
  const f = fixture(); fs.mkdirSync(f.input); const jobId = 'linked_12345678';
  const hidden = path.join(f.input, claimName(jobId, 'linked.txt'));
  fs.writeFileSync(hidden, 'active linked bytes'); fs.linkSync(hidden, path.join(f.input, 'linked.txt'));
  const job = path.join(f.jobs, jobId); fs.mkdirSync(job);
  fs.writeFileSync(path.join(job, '.owner.json'), JSON.stringify({ pid: process.pid, created_at: new Date().toISOString(), nonce: 'c'.repeat(32) }));
  const result = migrateLegacyInputV1({ ...f, isProcessAlive: () => true });
  assert.strictEqual(result.state, 'deferred'); assert.strictEqual(result.active, 1);
  assert.strictEqual(fs.existsSync(f.marker), false);
});

test('an invalid owner blocks even when its visible recovery hardlink already exists', () => {
  const f = fixture(); fs.mkdirSync(f.input); const jobId = 'invalid_12345678';
  const hidden = path.join(f.input, claimName(jobId, 'invalid.txt'));
  fs.writeFileSync(hidden, 'invalid linked bytes'); fs.linkSync(hidden, path.join(f.input, 'invalid.txt'));
  const job = path.join(f.jobs, jobId); fs.mkdirSync(job);
  fs.writeFileSync(path.join(job, '.owner.json'), '{invalid');
  const result = migrateLegacyInputV1(f);
  assert.strictEqual(result.state, 'blocked'); assert.strictEqual(result.failures, 1);
  assert.strictEqual(fs.existsSync(f.marker), false);
});

test('a malformed claim blocks the complete preflight before a valid claim is linked', () => {
  const f = fixture(); fs.mkdirSync(f.input);
  fs.writeFileSync(path.join(f.input, claimName('valid_12345678', 'valid.txt')), 'valid bytes');
  fs.writeFileSync(path.join(f.input, '.processing_malformed'), 'unknown bytes');
  const result = migrateLegacyInputV1({ ...f, isProcessAlive: () => false });
  assert.strictEqual(result.state, 'blocked'); assert.ok(result.failures > 0);
  assert.strictEqual(fs.existsSync(path.join(f.input, 'valid.txt')), false); assert.strictEqual(fs.existsSync(f.marker), false);
});

test('a linked Input root is refused without touching its external target', () => {
  const f = fixture(); const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'sentinel.txt'); fs.writeFileSync(sentinel, 'outside bytes');
  try { fs.symlinkSync(outside, f.input, 'junction'); } catch { return; }
  assert.throws(() => migrateLegacyInputV1(f), /kein sicherer lokaler Ordner/u);
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'outside bytes');
});

test('a malformed or future marker blocks before inspecting or mutating Input', () => {
  const f = fixture(); fs.mkdirSync(f.input); const hidden = path.join(f.input, claimName('future_12345678', 'future.txt'));
  fs.writeFileSync(hidden, 'future bytes'); fs.writeFileSync(f.marker, JSON.stringify({ schema: 'datasecure-legacy-input-migration/2' }));
  assert.throws(() => migrateLegacyInputV1(f), /LEGACY_INPUT_MARKER_INVALID/u);
  assert.strictEqual(fs.existsSync(path.join(f.input, 'future.txt')), false); assert.strictEqual(fs.readFileSync(hidden, 'utf8'), 'future bytes');
});

test('a valid completion marker prevents every later legacy Input inspection', () => {
  const f = fixture();
  const first = migrateLegacyInputV1({ ...f, now: Date.UTC(2026, 7, 26) });
  assert.strictEqual(first.state, 'not_present');
  fs.mkdirSync(f.input);
  const hidden = path.join(f.input, '.processing_malformed'); fs.writeFileSync(hidden, 'later bytes');
  const second = migrateLegacyInputV1({ ...f, now: Date.UTC(2026, 7, 27) });
  assert.strictEqual(second.state, 'not_present'); assert.strictEqual(second.failures, 0);
  assert.strictEqual(fs.readFileSync(hidden, 'utf8'), 'later bytes');
});

test('marker failure leaves both hard links safe and a retry creates no duplicate', () => {
  const f = fixture(); fs.mkdirSync(f.input); const hidden = path.join(f.input, claimName('retry_12345678', 'retry.txt'));
  fs.writeFileSync(hidden, 'retry bytes');
  const failingIo = new Proxy(fs, { get(target, property) { if (property === 'renameSync') return () => { throw new Error('injected marker failure'); }; return target[property]; } });
  assert.throws(() => migrateLegacyInputV1({ ...f, io: failingIo }), /injected marker failure/u);
  assert.strictEqual(fs.existsSync(hidden), true); assert.strictEqual(fs.existsSync(path.join(f.input, 'retry.txt')), true);
  const retry = migrateLegacyInputV1(f); assert.strictEqual(retry.state, 'complete');
  assert.strictEqual(fs.existsSync(path.join(f.input, 'retry_wiederhergestellt_2.txt')), false);
});

test('an active migration lock defers before any legacy mutation', () => {
  const f = fixture(); fs.mkdirSync(f.input); fs.writeFileSync(path.join(f.input, claimName('locked_12345678', 'locked.txt')), 'locked bytes');
  const held = _test.acquireLock(f.migrations, { isProcessAlive: () => true });
  try {
    const result = migrateLegacyInputV1({ ...f, isProcessAlive: () => true });
    assert.strictEqual(result.state, 'deferred'); assert.strictEqual(fs.existsSync(path.join(f.input, 'locked.txt')), false);
  } finally { _test.releaseLock(held); }
});

test('a stale migration lock is reclaimed using identity binding', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.migrations, '.legacy-input-v1.lock'), JSON.stringify({ schema: SCHEMA, pid: 2147483647, created_at: '2020-01-01T00:00:00.000Z', nonce: 'b'.repeat(32) }));
  const result = migrateLegacyInputV1({ ...f, now: Date.UTC(2026, 7, 26), isProcessAlive: () => false });
  assert.strictEqual(result.state, 'not_present'); assert.strictEqual(fs.existsSync(path.join(f.migrations, '.legacy-input-v1.lock')), false);
});

test('stale-lock reclaim never removes a replacement lock', () => {
  const f = fixture(); fs.mkdirSync(f.input);
  const lock = path.join(f.migrations, '.legacy-input-v1.lock');
  fs.writeFileSync(lock, JSON.stringify({ schema: SCHEMA, pid: 2147483647, created_at: '2020-01-01T00:00:00.000Z', nonce: 'd'.repeat(32) }));
  const replacement = JSON.stringify({ schema: SCHEMA, pid: process.pid, created_at: new Date().toISOString(), nonce: 'e'.repeat(32) });
  assert.throws(() => migrateLegacyInputV1({
    ...f,
    now: Date.UTC(2026, 7, 26),
    isProcessAlive: () => false,
    beforeLockQuarantine() { fs.unlinkSync(lock); fs.writeFileSync(lock, replacement); }
  }), /LEGACY_INPUT_MIGRATION_LOCK_CHANGED/u);
  assert.strictEqual(fs.readFileSync(lock, 'utf8'), replacement);
  assert.strictEqual(fs.existsSync(f.marker), false);
});

test('lock release never removes a replacement lock', () => {
  const f = fixture();
  const held = _test.acquireLock(f.migrations, { isProcessAlive: () => true });
  const replacement = JSON.stringify({ schema: SCHEMA, pid: process.pid, created_at: new Date().toISOString(), nonce: 'f'.repeat(32) });
  assert.throws(() => _test.releaseLock(held, {
    beforeLockQuarantine() { fs.unlinkSync(held.target); fs.writeFileSync(held.target, replacement); }
  }), /LEGACY_INPUT_MIGRATION_LOCK_CHANGED/u);
  assert.strictEqual(fs.readFileSync(held.target, 'utf8'), replacement);
});

done();
