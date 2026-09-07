'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Private Markdown retention');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-markdown-retention-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'data');
process.env.EU_PRIVACY_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'visible');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const journals = path.join(root, 'journals'); fs.mkdirSync(journals);
const { roots, safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { publishMarkdownArtifact, artifactRoot, verifyMarkdownItem } = require('../plugins/data-secure/server/standalone/markdown-store');
const { cleanupMarkdownArtifacts } = require('../plugins/data-secure/server/standalone/markdown-retention');
const { cleanupLocalData } = require('../plugins/data-secure/server/gateway/retention');
const { createBatchRetentionProtection } = require('../plugins/data-secure/server/gateway/batch-retention-protection');
const { exportCompletedState, visibleExportDirectory, completedMarkdownExportMatches } = require('../plugins/data-secure/server/gateway/result-export');
const { openBatchPackageProtection } = createBatchRetentionProtection({ batchRoot: () => journals });
const NOW = Date.now();
const DAY = 86400000;
let serial = 0;
const nextId = () => (++serial).toString(16).padStart(32, '0');
function old(item) { const when = new Date(NOW - 9 * DAY); fs.utimesSync(path.join(artifactRoot(), item.artifact_id), when, when); }
async function fixture(name = 'synthetic.txt') {
  const id = nextId();
  const text = 'Max Mustermann · Nordstern GmbH · DE89 3704 0044 0532 0130 00';
  const identity = await publishMarkdownArtifact(createMarkdownExtraction({ source_type: 'txt', markdown: text,
    coverage: { status: 'complete', reason_codes: [] } }), `dm_${id}`);
  return { id, ...identity, status: 'released', name, source_label: name };
}
function journal(items) {
  const state = { schema: 'datasecure-batch/5', product_channel: 'standalone', processing_mode: 'markdown-only',
    token: crypto.randomBytes(32).toString('hex'), created_at: new Date(NOW - 10 * DAY).toISOString(), items };
  fs.writeFileSync(path.join(journals, `${state.token}.json`), JSON.stringify(state), { flag: 'wx' });
  return state;
}
function sweep() {
  const protection = openBatchPackageProtection();
  return cleanupLocalData({ roots: roots(), scope: 'all', includeMarkdownArtifacts: true,
    now: NOW, retentionDays: 7, protectedIds: protection.ids, outputProtectionComplete: protection.complete });
}
async function run() {
  await testAsync('only expired committed private dm copies are removed; originals and visible basename-preserving Markdown survive', async () => {
    const item = await fixture(); old(item);
    const state = journal([item]);
    const original = path.join(root, 'customer-original.txt'); fs.writeFileSync(original, 'private original');
    assert.strictEqual(exportCompletedState(state).available, true);
    const visible = visibleExportDirectory(state.token);
    const document = path.join(visible, 'synthetic.md');
    assert.strictEqual(fs.existsSync(path.join(visible, 'DataSecure-Zuordnung.csv')), false);
    const before = [original, document].map((file) => fs.readFileSync(file));
    assert.strictEqual(completedMarkdownExportMatches(state), true);
    assert.strictEqual(openBatchPackageProtection().ids.has(item.artifact_id), false);
    const result = sweep();
    assert.strictEqual(result.removed_markdown_artifacts, 1);
    assert.strictEqual(fs.existsSync(path.join(artifactRoot(), item.artifact_id)), false);
    assert.strictEqual(verifyMarkdownItem(item), false, 'private content is genuinely gone');
    assert.strictEqual(completedMarkdownExportMatches(state), true, 'historical export does not need expired private bytes');
    assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 0, available: true });
    assert.strictEqual(visibleExportDirectory(state.token), visible);
    [original, document].forEach((file, index) => assert.deepStrictEqual(fs.readFileSync(file), before[index]));
    const swapped = structuredClone(state); swapped.items[0].artifact_sha256 = '0'.repeat(64);
    assert.strictEqual(completedMarkdownExportMatches(swapped), false);
    assert.strictEqual(exportCompletedState(swapped).available, false);
  });
  await testAsync('open siblings protect already converted and not-yet-acknowledged artifacts despite expiry', async () => {
    const released = await fixture('ready.txt'); old(released);
    const committing = await fixture('committing.txt'); old(committing);
    committing.status = 'processing'; committing.checkpoint = 'publication_unconfirmed';
    for (const field of ['artifact_sha256', 'artifact_bytes', 'extraction_grade', 'reason_codes']) delete committing[field];
    const state = journal([released, committing, { id: nextId(), status: 'retryable', source_label: 'later.txt' }]);
    const protection = openBatchPackageProtection();
    assert.strictEqual(protection.complete, true);
    for (const item of state.items) assert.ok(protection.ids.has(`dm_${item.id}`));
    assert.strictEqual(sweep().removed_markdown_artifacts, 0);
    assert.ok(fs.existsSync(path.join(artifactRoot(), released.artifact_id)));
    assert.ok(fs.existsSync(path.join(artifactRoot(), committing.artifact_id)));
  });
  await testAsync('completed processing with pending visible export stays protected until its run commit', async () => {
    const item = await fixture('export-pending.txt'); old(item);
    const state = journal([item]);
    assert.ok(openBatchPackageProtection().ids.has(item.artifact_id));
    assert.strictEqual(sweep().removed_markdown_artifacts, 0);
    assert.strictEqual(exportCompletedState(state).available, true);
    assert.ok(!openBatchPackageProtection().ids.has(item.artifact_id));
    assert.strictEqual(sweep().removed_markdown_artifacts, 1);
  });
  await testAsync('fresh owned and unknown-name entries are retained without touching their bytes', async () => {
    const fresh = await fixture('fresh.txt');
    const unknown = path.join(artifactRoot(), 'user-notes.txt'); fs.writeFileSync(unknown, 'not generated');
    const expiredOrphan = await fixture('orphan.txt'); old(expiredOrphan);
    const result = sweep();
    assert.strictEqual(result.removed_markdown_artifacts, 1);
    assert.ok(fs.existsSync(path.join(artifactRoot(), fresh.artifact_id)));
    assert.strictEqual(fs.readFileSync(unknown, 'utf8'), 'not generated');
  });
  await testAsync('an unreadable/corrupt journal blocks all private conversion retention, including force', async () => {
    const item = await fixture(); old(item);
    const malformed = path.join(journals, 'malformed.json'); fs.writeFileSync(malformed, '{');
    const protection = openBatchPackageProtection();
    assert.strictEqual(protection.complete, false);
    const result = cleanupMarkdownArtifacts({ cutoff: NOW, force: true, protectedIds: protection.ids, protectionComplete: protection.complete });
    assert.strictEqual(result.removed, 0); assert.strictEqual(result.skipped, true);
    assert.ok(fs.existsSync(path.join(artifactRoot(), item.artifact_id)));
    fs.unlinkSync(malformed);
  });
  await testAsync('a generated-looking directory containing an additional source file stops the plan before deletion', async () => {
    const item = await fixture(); old(item);
    const extra = path.join(artifactRoot(), item.artifact_id, 'original.txt'); fs.writeFileSync(extra, 'must remain'); old(item);
    const result = sweep();
    assert.strictEqual(result.removed_markdown_artifacts, 0);
    assert.strictEqual(result.markdown_cleanup_skipped, true);
    assert.ok(result.errors > 0);
    assert.strictEqual(fs.readFileSync(extra, 'utf8'), 'must remain');
    fs.unlinkSync(extra);
  });
  await testAsync('a locked deletion stops once and never retries with broader primitives', async () => {
    const first = await fixture(); old(first);
    const second = await fixture(); old(second);
    const originalUnlink = fs.unlinkSync;
    let calls = 0;
    fs.unlinkSync = function(file) {
      if (String(file).startsWith(artifactRoot() + path.sep)) {
        calls++;
        throw Object.assign(new Error('synthetic lock'), { code: 'EBUSY' });
      }
      return originalUnlink.call(fs, file);
    };
    let result;
    try { result = sweep(); } finally { fs.unlinkSync = originalUnlink; }
    assert.strictEqual(calls, 1);
    assert.strictEqual(result.removed_markdown_artifacts, 0);
    assert.strictEqual(result.markdown_cleanup_skipped, true);
    assert.ok(fs.existsSync(path.join(artifactRoot(), first.artifact_id)));
    assert.ok(fs.existsSync(path.join(artifactRoot(), second.artifact_id)));
  });
}
run().finally(() => { safeRemovePrivateTree(path.dirname(root), path.basename(root)); done(); });
