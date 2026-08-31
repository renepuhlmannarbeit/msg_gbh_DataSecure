'use strict';

// Compatibility regression: reading/listing old records is never a migration.
// All input bytes here are synthetic; no native credential store is involved.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-review-plain-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { encodePng } = require('../plugins/data-secure/server/image-sanitizer');
const { migrateLegacyReviewPreviews, listReviewItems, approveReviewAsset, removePreviewAfterDecision } = require('../plugins/data-secure/server/gateway/review');
const { test, done, assert } = createSuite('Review plaintext and legacy preservation');
const png = encodePng({ width: 2, height: 2, rgba: Buffer.alloc(16, 255) });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function fixture(overrides = {}, bytes = png) {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  const dir = path.join(roots().review, packageId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reviewId = `${packageId}__asset-001`;
  const metaPath = path.join(dir, 'asset-001.review.json');
  const meta = {
    schema_version: 2, review_id: reviewId, package_id: packageId,
    asset_id: 'asset-001', reason: 'visual_local_review_required',
    preview_file: 'asset-001.png', preview_sha256: hash(bytes),
    preview_storage: 'local-plain', preview_encrypted: false,
    created_at: new Date().toISOString(), approved: false, package_dir: packageId,
    ...overrides
  };
  const preview = path.join(dir, meta.preview_file);
  fs.writeFileSync(preview, bytes, { mode: 0o600 });
  fs.writeFileSync(metaPath, JSON.stringify(meta), { mode: 0o600 });
  const packageDir = path.join(roots().output, packageId);
  fs.mkdirSync(packageDir, { recursive: true, mode: 0o700 });
  const markdownPath = path.join(packageDir, `${packageId}.md`);
  fs.writeFileSync(markdownPath, 'Synthetic de-identified profile');
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2', package_id: packageId, profile: 'general',
    created_at: meta.created_at, document: `${packageId}.md`,
    document_sha256: hash(fs.readFileSync(markdownPath)),
    assets: [{ asset_id: 'asset-001', status: 'review_required' }]
  }));
  return { dir, meta, preview, metaPath, reviewId, packageDir, markdownPath, bytes };
}

test('obsolete migration entrypoint performs no IO or credential operation', () => {
  const h = fixture();
  const before = fs.readFileSync(h.metaPath);
  const forbidden = new Proxy({}, { get() { throw new Error('No legacy IO allowed'); } });
  assert.deepStrictEqual(migrateLegacyReviewPreviews({ fs: forbidden, privateArtifactCrypto: forbidden }), { ok: true, migrated: 0 });
  assert.deepStrictEqual(fs.readFileSync(h.preview), h.bytes);
  assert.deepStrictEqual(fs.readFileSync(h.metaPath), before);
  assert.strictEqual(fs.existsSync(path.join(h.dir, 'asset-001.dsart')), false);
});

test('mixed listing marks the old encrypted item without blocking the new item or rewriting either', () => {
  const old = fixture({ preview_file: 'asset-001.dsart', preview_encrypted: true }, Buffer.from('DSARTF01synthetic'));
  const current = fixture();
  const before = fs.readFileSync(old.metaPath);
  const items = listReviewItems().items;
  const oldItem = items.find((item) => item.review_id === old.reviewId);
  assert.strictEqual(oldItem.reason, 'legacy_encrypted_review_unavailable');
  assert.strictEqual(oldItem.preview_available, false);
  assert.strictEqual(items.find((item) => item.review_id === current.reviewId).preview_available, true);
  assert.deepStrictEqual(fs.readFileSync(old.metaPath), before);
  assert.deepStrictEqual(fs.readFileSync(old.preview), old.bytes);
});

test('an encrypted preview cannot be approved or removed via the decision cleanup', () => {
  const h = fixture({ preview_file: 'asset-001.dsart', preview_encrypted: true }, Buffer.from('DSARTF01synthetic'));
  assert.throws(() => approveReviewAsset(h.reviewId, true), /ältere Review-Kopie ist verschlüsselt/u);
  assert.strictEqual(removePreviewAfterDecision(h.dir, h.meta), false);
  assert.deepStrictEqual(fs.readFileSync(h.preview), h.bytes);
  assert.strictEqual(fs.existsSync(path.join(h.packageDir, 'assets')), false);
});

test('dsart extension is protected even if encrypted metadata is false', () => {
  const h = fixture({ preview_file: 'asset-001.dsart' });
  assert.throws(() => approveReviewAsset(h.reviewId, true), /verschlüsselt/u);
  assert.strictEqual(removePreviewAfterDecision(h.dir, h.meta), false);
  assert.deepStrictEqual(fs.readFileSync(h.preview), h.bytes);
});

test('plaintext PNG requires a current explicit storage contract', () => {
  const h = fixture({ schema_version: 1 });
  assert.throws(() => approveReviewAsset(h.reviewId, true), /aktuelle lokale/u);
  assert.deepStrictEqual(fs.readFileSync(h.preview), h.bytes);
});

test('a current synthetic PNG is approved with no injected keyring and its private preview removed', () => {
  const h = fixture();
  assert.throws(() => approveReviewAsset(h.reviewId, false), /ausdrücklicher/u);
  const result = approveReviewAsset(h.reviewId, true);
  assert.strictEqual(result.approved, true);
  assert.strictEqual(result.preview_removed, true);
  assert.deepStrictEqual(fs.readFileSync(path.join(h.packageDir, 'assets', 'asset-001_reviewed.png')), png);
  assert.strictEqual(fs.existsSync(h.preview), false);
});

test('changed private preview hash is rejected without public output', () => {
  const h = fixture();
  fs.appendFileSync(h.preview, 'changed');
  assert.throws(() => approveReviewAsset(h.reviewId, true), /verändert/u);
  assert.strictEqual(fs.existsSync(path.join(h.packageDir, 'assets')), false);
});

test('renamed encrypted bytes never become a PNG even with matching plaintext metadata hash', () => {
  const h = fixture({}, Buffer.from('DSARTF01synthetic cipher bytes'));
  assert.throws(() => approveReviewAsset(h.reviewId, true));
  assert.deepStrictEqual(fs.readFileSync(h.preview), h.bytes);
  assert.strictEqual(fs.existsSync(path.join(h.packageDir, 'assets')), false);
});

test('non-PNG bytes cannot be approved just by naming them png and supplying a hash', () => {
  const h = fixture({}, Buffer.from('synthetic-not-a-png'));
  assert.throws(() => approveReviewAsset(h.reviewId, true), /kein sicher lesbares PNG/u);
  assert.strictEqual(fs.existsSync(path.join(h.packageDir, 'assets')), false);
});

test('PNG with appended bytes is not accepted as a metadata-free preview', () => {
  const h = fixture({}, Buffer.concat([png, Buffer.from('synthetic metadata')]));
  assert.throws(() => approveReviewAsset(h.reviewId, true), /PNG/u);
  assert.strictEqual(fs.existsSync(path.join(h.packageDir, 'assets')), false);
});

try { done(); } finally { fs.rmSync(base, { recursive: true, force: true }); }
