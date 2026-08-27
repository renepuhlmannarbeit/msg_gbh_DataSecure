'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { createTestPrivateArtifactCrypto } = require('./lib/private-artifact-test-runtime');
const { migrateLegacyBatchState } = require('../plugins/data-secure/server/gateway/batch-private-artifact-migration');
const { exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');

const { test, done, assert } = createSuite('Batch private artifact migration');

function fixture(schema = 'datasecure-batch/2', workName = '001_aaaaaaaaaaaaaaaaaaaaaaaa.txt') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-batch-migrate-'));
  const work = path.join(root, 'work');
  fs.mkdirSync(work, { mode: 0o700 });
  const bytes = Buffer.from('Kunde: Synthetische Person 4711', 'utf8');
  const item = {
    id: '0123456789abcdef0123456789abcdef',
    name: 'synthetic.txt',
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    work_name: workName,
    status: 'pending',
    checkpoint: 'sealed'
  };
  const state = { schema, token: 'a'.repeat(48), profile: 'general', items: [item] };
  return {
    root, work, bytes, state,
    crypto: createTestPrivateArtifactCrypto(root),
    deps(writeState = () => {}) { return { artifactCrypto: this.crypto, workPath: () => work, writeState }; },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test('a v2 plaintext snapshot becomes an authenticated v3 artifact before plaintext deletion', () => {
  const h = fixture();
  try {
    const legacy = path.join(h.work, h.state.items[0].work_name);
    fs.writeFileSync(legacy, h.bytes, { mode: 0o600 });
    const writes = [];
    migrateLegacyBatchState(h.state, h.deps((state) => writes.push(JSON.parse(JSON.stringify(state)))));
    assert.strictEqual(h.state.schema, 'datasecure-batch/3');
    assert.strictEqual(h.state.items[0].private_artifact_encrypted, true);
    assert.strictEqual(fs.existsSync(legacy), false);
    assert.ok(writes.some((state) => state.items[0].legacy_work_name));
    assert.ok(!Object.hasOwn(writes.at(-1).items[0], 'legacy_work_name'));
    const result = exactPendingEntry(h.state, h.state.items[0], {
      artifactCrypto: h.crypto,
      workPath: () => h.work
    });
    assert.deepStrictEqual(result.private_bytes, h.bytes);
    result.private_bytes.fill(0);
  } finally { h.cleanup(); }
});

test('a journal publication failure preserves the authoritative legacy plaintext', () => {
  const h = fixture();
  try {
    const legacy = path.join(h.work, h.state.items[0].work_name);
    fs.writeFileSync(legacy, h.bytes, { mode: 0o600 });
    assert.throws(
      () => migrateLegacyBatchState(h.state, h.deps(() => { throw new Error('journal-failed'); })),
      /journal-failed/u
    );
    assert.strictEqual(h.state.schema, 'datasecure-batch/2');
    assert.deepStrictEqual(fs.readFileSync(legacy), h.bytes);
    assert.deepStrictEqual(fs.readdirSync(h.work), [path.basename(legacy)]);
  } finally { h.cleanup(); }
});

test('a pre-release encrypted v2 snapshot is adopted without double encryption', () => {
  const h = fixture('datasecure-batch/2', '001_bbbbbbbbbbbbbbbbbbbbbbbb.dsart');
  try {
    const target = path.join(h.work, h.state.items[0].work_name);
    h.crypto.writeEncrypted(target, h.bytes, {
      purpose: 'batch-snapshot', objectId: `${h.state.token}:${h.state.items[0].id}`
    });
    const before = fs.readFileSync(target);
    migrateLegacyBatchState(h.state, h.deps());
    assert.strictEqual(h.state.schema, 'datasecure-batch/3');
    assert.strictEqual(h.state.items[0].work_name, path.basename(target));
    assert.deepStrictEqual(fs.readFileSync(target), before);
  } finally { h.cleanup(); }
});

test('v1 state is preserved and requires an explicit separate migration', () => {
  const h = fixture('datasecure-batch/1');
  try {
    const legacy = path.join(h.work, h.state.items[0].work_name);
    fs.writeFileSync(legacy, h.bytes, { mode: 0o600 });
    assert.throws(
      () => migrateLegacyBatchState(h.state, h.deps()),
      (error) => error.code === 'PRIVATE_ARTIFACT_LEGACY_MIGRATION_REQUIRED'
    );
    assert.deepStrictEqual(fs.readFileSync(legacy), h.bytes);
  } finally { h.cleanup(); }
});

done();
