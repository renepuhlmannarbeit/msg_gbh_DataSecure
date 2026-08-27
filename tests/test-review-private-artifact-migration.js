'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-review-migrate-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { migrateLegacyReviewPreviews } = require('../plugins/data-secure/server/gateway/review');
const { createTestPrivateArtifactCrypto } = require('./lib/private-artifact-test-runtime');

const { test, done, assert } = createSuite('Review private artifact migration');

function legacyFixture(packageId = `ds_${crypto.randomBytes(16).toString('hex')}`) {
  const reviewRoot = roots().review;
  const dir = path.join(reviewRoot, packageId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from('synthetic png bytes without real identity', 'utf8');
  const reviewId = `${packageId}__asset-001`;
  const metaPath = path.join(dir, 'asset-001.review.json');
  fs.writeFileSync(path.join(dir, 'asset-001.png'), bytes, { mode: 0o600 });
  fs.writeFileSync(metaPath, JSON.stringify({
    review_id: reviewId,
    package_id: packageId,
    asset_id: 'asset-001',
    reason: 'visual_local_review_required',
    preview_file: 'asset-001.png',
    preview_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    created_at: new Date().toISOString(),
    approved: false,
    package_dir: packageId
  }), { mode: 0o600 });
  return { reviewRoot, dir, bytes, reviewId, metaPath };
}

test('legacy review bytes become authenticated ciphertext before plaintext deletion', () => {
  const h = legacyFixture();
  const artifactCrypto = createTestPrivateArtifactCrypto(h.reviewRoot);
  const result = migrateLegacyReviewPreviews({ privateArtifactCrypto: artifactCrypto });
  assert.strictEqual(result.migrated, 1);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.png')), false);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.dsart')), true);
  const meta = JSON.parse(fs.readFileSync(h.metaPath, 'utf8'));
  assert.strictEqual(meta.preview_encrypted, true);
  assert.strictEqual(meta.preview_file, 'asset-001.dsart');
  assert.ok(!Object.hasOwn(meta, 'legacy_preview_file'));
  const plain = artifactCrypto.readEncrypted(path.join(h.dir, meta.preview_file), {
    purpose: 'review-preview', objectId: h.reviewId
  });
  assert.deepStrictEqual(plain, h.bytes);
  plain.fill(0);
});

test('metadata publication failure leaves plaintext authoritative and retry adopts ciphertext', () => {
  const h = legacyFixture();
  const artifactCrypto = createTestPrivateArtifactCrypto(h.reviewRoot);
  let failed = false;
  const flakyFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'renameSync') return (...args) => {
        if (!failed) { failed = true; throw new Error('meta-publish-failed'); }
        return target.renameSync(...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  assert.throws(
    () => migrateLegacyReviewPreviews({ fs: flakyFs, privateArtifactCrypto: artifactCrypto }),
    /meta-publish-failed/u
  );
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.png')), true);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.dsart')), true);
  assert.strictEqual(migrateLegacyReviewPreviews({ privateArtifactCrypto: artifactCrypto }).migrated, 1);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.png')), false);
});

test('changed legacy preview never becomes an encrypted trusted artifact', () => {
  const h = legacyFixture();
  fs.writeFileSync(path.join(h.dir, 'asset-001.png'), 'changed', 'utf8');
  const artifactCrypto = createTestPrivateArtifactCrypto(h.reviewRoot);
  assert.throws(
    () => migrateLegacyReviewPreviews({ privateArtifactCrypto: artifactCrypto }),
    /verändert/u
  );
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.png')), true);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.dsart')), false);
});

try { done(); } finally { fs.rmSync(base, { recursive: true, force: true }); }
