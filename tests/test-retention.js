'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const runtime = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const {
  DEFAULT_RETENTION_DAYS,
  retentionDays,
  cleanupLocalData,
  dueCounts,
  purgeLocalData,
  retentionStatus
} = require(path.join(runtime, 'gateway', 'retention.js'));

const { test, done, assert } = createSuite('Retention and local deletion');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-retention-'));
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);

function sandbox(name) {
  const root = path.join(base, name);
  const result = {
    root,
    input: path.join(root, 'Input'),
    output: path.join(root, 'Output'),
    processed: path.join(root, 'Processed'),
    review: path.join(root, 'Needs Visual Review'),
    audit: path.join(root, 'audit'),
    jobs: path.join(root, 'jobs')
  };
  for (const dir of Object.values(result)) fs.mkdirSync(dir, { recursive: true });
  return result;
}

function file(target, content = 'data') {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function old(target, ageDays = 8) {
  const when = new Date(NOW - ageDays * DAY);
  fs.utimesSync(target, when, when);
}

function reviewItem(root, name, ageDays) {
  const dir = path.join(root.review, name);
  fs.mkdirSync(dir, { recursive: true });
  file(path.join(dir, 'asset-001.png'), 'preview bytes');
  file(
    path.join(dir, 'asset-001.review.json'),
    JSON.stringify({ review_id: `${name}__asset-001`, preview_file: 'asset-001.png', preview_sha256: 'abc' })
  );
  old(dir, ageDays);
  return dir;
}

test('retention configuration defaults safely and accepts zero', () => {
  assert.strictEqual(retentionDays({}), DEFAULT_RETENTION_DAYS);
  assert.strictEqual(retentionDays({ EU_PRIVACY_RETENTION_DAYS: '0' }), 0);
  assert.strictEqual(retentionDays({ EU_PRIVACY_RETENTION_DAYS: '14' }), 14);
  assert.strictEqual(retentionDays({ EU_PRIVACY_RETENTION_DAYS: '-1' }), DEFAULT_RETENTION_DAYS);
  assert.strictEqual(retentionDays({ EU_PRIVACY_RETENTION_DAYS: 'n/a' }), DEFAULT_RETENTION_DAYS);
});

test('expired processed files, output packages and review previews are cleaned', () => {
  const r = sandbox('expired');
  const oldProcessed = path.join(r.processed, 'old.pdf');
  const freshProcessed = path.join(r.processed, 'fresh.pdf');
  file(oldProcessed);
  file(freshProcessed);
  old(oldProcessed);
  old(freshProcessed, 1);

  const oldOutput = path.join(r.output, 'old-package');
  const freshOutput = path.join(r.output, 'fresh-package');
  file(path.join(oldOutput, 'manifest.json'), '{}');
  file(path.join(freshOutput, 'manifest.json'), '{}');
  old(oldOutput);
  old(freshOutput, 1);

  const expiredReview = reviewItem(r, 'old-review', 8);
  const freshReview = reviewItem(r, 'fresh-review', 1);
  const audit = path.join(r.audit, 'hash-only.json');
  file(audit, '{"sha256":"abc"}');
  old(audit);

  const result = cleanupLocalData({ roots: r, now: NOW, retentionDays: 7 });
  assert.deepStrictEqual(result.removed, { processed: 1, output: 1, review: 1 });
  assert.ok(!fs.existsSync(oldProcessed));
  assert.ok(fs.existsSync(freshProcessed));
  assert.ok(!fs.existsSync(oldOutput));
  assert.ok(fs.existsSync(freshOutput));
  assert.ok(!fs.existsSync(path.join(expiredReview, 'asset-001.png')));
  assert.ok(fs.existsSync(path.join(expiredReview, 'asset-001.review.json')), 'review evidence remains');
  assert.ok(fs.existsSync(path.join(freshReview, 'asset-001.png')));
  const meta = JSON.parse(fs.readFileSync(path.join(expiredReview, 'asset-001.review.json'), 'utf8'));
  assert.strictEqual(meta.preview_expired, true);
  assert.strictEqual(meta.preview_file, null);
  assert.ok(fs.existsSync(audit), 'audit evidence must never be part of retention cleanup');
});

test('hidden staging and current-job directories are never touched', () => {
  const r = sandbox('staging');
  for (const parent of [r.processed, r.output, r.review]) {
    const staging = path.join(parent, '.current-job');
    file(path.join(staging, 'working.bin'));
    old(staging);
  }
  cleanupLocalData({ roots: r, now: NOW, retentionDays: 0 });
  for (const parent of [r.processed, r.output, r.review]) {
    assert.ok(fs.existsSync(path.join(parent, '.current-job', 'working.bin')));
  }
});

test('purge requires literal confirmation and obeys its selected scope', () => {
  const r = sandbox('purge');
  file(path.join(r.processed, 'source.pdf'));
  file(path.join(r.output, 'package', 'manifest.json'), '{}');
  file(path.join(r.audit, 'receipt.json'), '{}');
  assert.throws(() => purgeLocalData('processed', false, { roots: r }), /Bestätigung/);
  assert.throws(() => purgeLocalData('processed', 'true', { roots: r }), /Bestätigung/);
  const result = purgeLocalData('processed', true, { roots: r, now: NOW });
  assert.strictEqual(result.removed.processed, 1);
  assert.ok(fs.existsSync(path.join(r.output, 'package', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(r.audit, 'receipt.json')));
  assert.strictEqual(result.audit_retained, true);
});

test('status due counts use entry mtimes without waiting in real time', () => {
  const r = sandbox('due');
  const processed = path.join(r.processed, 'old.pdf');
  file(processed);
  old(processed);
  const output = path.join(r.output, 'fresh-package');
  file(path.join(output, 'manifest.json'), '{}');
  old(output, 1);
  reviewItem(r, 'old-review', 8);
  assert.deepStrictEqual(dueCounts({ roots: r, now: NOW, retentionDays: 7 }), {
    processed: 1,
    output: 0,
    review: 1,
    total: 2
  });
});

test('a deletion failure is recorded and does not abort other entries', () => {
  const r = sandbox('failure');
  const first = path.join(r.processed, 'first.pdf');
  const second = path.join(r.processed, 'second.pdf');
  file(first);
  file(second);
  old(first);
  old(second);
  let calls = 0;
  const result = cleanupLocalData({
    roots: r,
    now: NOW,
    retentionDays: 7,
    scope: 'processed',
    removeEntry(target) {
      calls++;
      if (path.basename(target) === 'first.pdf') throw new Error('locked');
      fs.unlinkSync(target);
    }
  });
  assert.strictEqual(calls, 2);
  assert.strictEqual(result.errors, 1);
  assert.strictEqual(result.removed.processed, 1);
  assert.ok(fs.existsSync(first));
  assert.ok(!fs.existsSync(second));
});

// A single entry that is not a regular file used to abort the whole review loop
// after some previews were already unlinked, leaving evidence that still claimed
// preview_file and preview_sha256 for bytes that were gone.
test('a blocked entry does not leave evidence claiming a deleted preview', () => {
  const root = sandbox('review-partial');
  const dir = reviewItem(root, 'Paket_partial', 9);
  fs.mkdirSync(path.join(dir, 'blocker'));
  old(dir, 9);

  const result = cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, scope: ['review'] });

  assert.ok(!fs.existsSync(path.join(dir, 'asset-001.png')), 'preview bytes must be gone');
  assert.strictEqual(result.removed.review, 1, 'a deleted preview must be counted');
  assert.strictEqual(result.errors, 1, 'the blocked entry must be reported');
  assert.strictEqual(result.errors_by_scope.review, 1, 'the failure must name its scope');
  assert.ok(Object.keys(result.error_codes).length > 0, 'a reason must be recorded');
  assert.ok(
    !JSON.stringify(result).includes('Paket_partial'),
    'no path or entry name may reach the status record'
  );

  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'asset-001.review.json'), 'utf8'));
  assert.strictEqual(meta.preview_file, null, 'evidence must not outlive the bytes');
  assert.strictEqual(meta.preview_sha256, null);
  assert.strictEqual(meta.preview_expired, true);
});

// Once the bytes are gone the preview no longer appears in the directory scan,
// so a marking step missed by an interrupted run could never catch up.
test('evidence left inconsistent by an earlier run is repaired', () => {
  const root = sandbox('review-heal');
  const dir = reviewItem(root, 'Paket_heal', 9);
  fs.unlinkSync(path.join(dir, 'asset-001.png'));
  old(dir, 9);

  cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, scope: ['review'] });

  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'asset-001.review.json'), 'utf8'));
  assert.strictEqual(meta.preview_file, null, 'a stale claim must be healed');
  assert.strictEqual(meta.preview_expired, true);
});

test('a purge is recorded as a purge, not as an ordinary retention run', () => {
  const root = sandbox('trigger');
  file(path.join(root.output, 'Paket_fresh', 'x.md'));

  assert.ok(purgeLocalData('output', true, { roots: root, now: NOW }).ok);

  const status = retentionStatus({ roots: root, retentionDays: 7, now: NOW });
  assert.strictEqual(status.last_cleanup.trigger, 'purge', 'the trigger must be visible');
  assert.strictEqual(status.last_cleanup.forced, true, 'an ignored expiry window must be visible');
});

test('every evidence record is closed when two records name the same preview', () => {
  const root = sandbox('duplicate-evidence');
  const dir = reviewItem(root, 'Paket_duplicate', 9);
  file(
    path.join(dir, 'asset-002.review.json'),
    JSON.stringify({
      review_id: 'Paket_duplicate__asset-002',
      preview_file: 'asset-001.png',
      preview_sha256: 'abc'
    })
  );
  old(dir, 9);

  const result = cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, scope: 'review' });

  assert.strictEqual(result.removed.review, 1, 'removed.review counts review entries, not files');
  assert.strictEqual(result.removed_review_previews, 1, 'the file count is reported separately');
  for (const asset of ['asset-001', 'asset-002']) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${asset}.review.json`), 'utf8'));
    assert.strictEqual(meta.preview_file, null, `${asset} must not retain a stale preview claim`);
    assert.strictEqual(meta.preview_expired, true);
  }
});

test('reconcile rejects a non-basename preview claim without inspecting or deleting outside data', () => {
  const root = sandbox('invalid-preview-path');
  const dir = path.join(root.review, 'Paket_invalid');
  const outside = path.join(root.review, 'outside.png');
  file(outside, 'must survive');
  file(
    path.join(dir, 'asset-001.review.json'),
    JSON.stringify({
      review_id: 'Paket_invalid__asset-001',
      preview_file: '../outside.png',
      preview_sha256: 'abc'
    })
  );
  old(dir, 9);

  cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, scope: 'review' });

  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'must survive');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'asset-001.review.json'), 'utf8'));
  assert.strictEqual(meta.preview_file, null, 'an invalid claim must fail closed');
  assert.strictEqual(meta.preview_expired, true);
});

test('evidence write failures stay visible without leaking a document name and heal next run', () => {
  const root = sandbox('evidence-write-failure');
  const dir = reviewItem(root, 'Paket_sensitive-customer', 9);
  const metaPath = path.join(dir, 'asset-001.review.json');
  const failingFs = Object.create(fs);
  failingFs.writeFileSync = (target, ...args) => {
    if (path.resolve(target) === path.resolve(metaPath)) {
      throw new Error('cannot update Paket_sensitive-customer');
    }
    return fs.writeFileSync(target, ...args);
  };

  const failed = cleanupLocalData({
    roots: root,
    retentionDays: 7,
    now: NOW,
    scope: 'review',
    fs: failingFs
  });
  assert.ok(!fs.existsSync(path.join(dir, 'asset-001.png')), 'bytes were already deleted');
  assert.ok(failed.errors > 0, 'the evidence failure must be reported');
  assert.deepStrictEqual(Object.keys(failed.error_codes), ['UNKNOWN']);
  assert.ok(!JSON.stringify(failed).includes('sensitive-customer'), 'status must not leak names');

  // Deleting the preview refreshed the directory mtime, so healing must not
  // wait another retention window before repairing the stale evidence.
  const healed = cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, scope: 'review' });
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assert.strictEqual(meta.preview_file, null);
  assert.strictEqual(meta.preview_expired, true);
  assert.strictEqual(healed.errors, 0);
});

test('initial and ordinary cleanup status keep a stable diagnostic shape', () => {
  const before = retentionStatus({ roots: sandbox('initial-shape'), retentionDays: 7, now: NOW });
  assert.strictEqual(before.output_protection_complete, true);
  for (const field of ['forced', 'errors_by_scope', 'error_codes', 'removed_review_previews', 'output_protection_complete', 'output_cleanup_skipped']) {
    assert.ok(Object.hasOwn(before.last_cleanup, field), `initial last_cleanup.${field} missing`);
  }

  const root = sandbox('ordinary-trigger');
  cleanupLocalData({ roots: root, retentionDays: 7, now: NOW, trigger: 'run' });
  const after = retentionStatus({ roots: root, retentionDays: 7, now: NOW }).last_cleanup;
  assert.strictEqual(after.trigger, 'run');
  assert.strictEqual(after.forced, false);
});

test('an incomplete batch-journal inspection fails closed for automatic output cleanup only', () => {
  const root = sandbox('incomplete-output-protection');
  const processed = path.join(root.processed, 'old-source.txt');
  const output = path.join(root.output, 'ds_' + 'a'.repeat(32));
  file(processed);
  file(path.join(output, 'manifest.json'), '{}');
  old(processed);
  old(output);

  const result = cleanupLocalData({
    roots: root,
    retentionDays: 7,
    now: NOW,
    outputProtectionComplete: false
  });

  assert.ok(!fs.existsSync(processed), 'independent processed retention must continue');
  assert.ok(fs.existsSync(output), 'all output must survive an incomplete journal inspection');
  assert.strictEqual(result.removed.processed, 1);
  assert.strictEqual(result.removed.output, 0);
  assert.strictEqual(result.output_protection_complete, false);
  assert.strictEqual(result.output_cleanup_skipped, true);
  assert.deepStrictEqual(dueCounts({
    roots: root,
    retentionDays: 7,
    now: NOW,
    outputProtectionComplete: false
  }), { processed: 0, output: 0, review: 0, total: 0 });
});

test('a complete inspection protects only referenced packages while confirmed purge remains authoritative', () => {
  const root = sandbox('complete-output-protection');
  const protectedId = 'ds_' + 'b'.repeat(32);
  const expiredId = 'ds_' + 'c'.repeat(32);
  for (const id of [protectedId, expiredId]) {
    file(path.join(root.output, id, 'manifest.json'), '{}');
    old(path.join(root.output, id));
  }

  const automatic = cleanupLocalData({
    roots: root,
    retentionDays: 7,
    now: NOW,
    protectedIds: new Set([protectedId]),
    outputProtectionComplete: true,
    scope: 'output'
  });
  assert.ok(fs.existsSync(path.join(root.output, protectedId)));
  assert.ok(!fs.existsSync(path.join(root.output, expiredId)));
  assert.strictEqual(automatic.removed.output, 1);

  const purged = purgeLocalData('output', true, {
    roots: root,
    now: NOW,
    protectedIds: new Set([protectedId]),
    outputProtectionComplete: false
  });
  assert.strictEqual(purged.removed.output, 1);
  assert.ok(!fs.existsSync(path.join(root.output, protectedId)));
});

test('a preview inspection error is reported and never mistaken for missing bytes', () => {
  const root = sandbox('preview-inspection-error');
  const dir = reviewItem(root, 'Paket_inspection', 1);
  const preview = path.join(dir, 'asset-001.png');
  const metaPath = path.join(dir, 'asset-001.review.json');
  const deniedFs = Object.create(fs);
  deniedFs.lstatSync = (target) => {
    if (path.resolve(target) === path.resolve(preview)) {
      const err = new Error('access denied');
      err.code = 'EACCES';
      throw err;
    }
    return fs.lstatSync(target);
  };

  const result = cleanupLocalData({
    roots: root,
    retentionDays: 7,
    now: NOW,
    scope: 'review',
    fs: deniedFs
  });

  assert.strictEqual(result.error_codes.EACCES, 1);
  assert.ok(fs.existsSync(preview), 'unverified bytes must remain untouched');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assert.strictEqual(meta.preview_file, 'asset-001.png', 'evidence must not claim deletion');
  assert.ok(!meta.preview_expired);
});

try {
  fs.rmSync(base, { recursive: true, force: true });
} catch {
  /* best effort */
}
done();
