'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { createStandalonePause } = require('../plugins/data-secure/server/gateway/standalone-pause');
const { progressFacts } = require('../plugins/data-secure/server/core/batch-progress');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { test, testAsync, done, assert } = createSuite('Standalone durable pause');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-pause-'));
const token = 'a'.repeat(64);
const state = () => ({ product_channel: 'standalone', token });
const store = createStandalonePause({ root: () => root });
const config = { deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending' };

test('pause intent is durable, idempotent and invalidated only by explicit generation advance', () => {
  const value = state();
  assert.equal(store.requested(value), false);
  store.request(value); store.request(value);
  assert.equal(createStandalonePause({ root: () => root }).requested(value), true);
  assert.equal(store.resume(value), true); assert.equal(value.standalone_control_generation, 1);
  assert.equal(store.requested(value), false);
  assert.equal(store.requested(state()), true, 'old generation stays immutable but cannot pause a resumed generation');
});
test('foreign channels, unsafe generations and zero-day retention are refused', () => {
  assert.equal(store.requested({ product_channel: 'plugin', token }), false);
  for (const value of [{ ...state(), product_channel: 'plugin' }, { ...state(), standalone_control_generation: -1 },
    { ...state(), zero_day_work: true }]) assert.throws(() => store.request(value));
});
test('malformed or hard-linked control state cannot silently start the next file', () => {
  const bad = { ...state(), standalone_control_generation: 22 };
  const file = path.join(root, `${token}.pause-22`);
  fs.writeFileSync(file, '{}'); assert.throws(() => store.requested(bad));
  assert.throws(() => store.claim(bad, () => assert.fail('must not start')), error => error.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
  const linked = { ...state(), standalone_control_generation: 23 };
  fs.linkSync(file, path.join(root, `${token}.pause-23`));
  assert.throws(() => store.requested(linked));
});
test('only a settled inactive boundary is paused and completion always wins', () => {
  const value = { ...state(), standalone_pause_requested: true, items: [{ status: 'released' }, { status: 'pending' }] };
  assert.equal(progressFacts(value, config, true).paused, false);
  assert.equal(progressFacts(value, config, false).batch_phase, 'paused');
  for (const status of ['processing', 'delivery_pending', 'mapping_pending']) {
    assert.equal(progressFacts({ ...value, items: [{ status }, { status: 'pending' }] }, config, false).paused, false);
  }
  assert.equal(progressFacts({ ...value, items: [{ status: 'mapping_pending' }, { status: 'pending' }] }, config, false)
    .batch_phase, 'awaiting_local_mapping_repair');
  const complete = progressFacts({ ...value, items: [{ status: 'released' }] }, config, false);
  assert.equal(complete.complete, true); assert.equal(complete.paused, false); assert.equal(complete.pause_requested, false);
});
test('an accepted pause wins over a later durable claim; an earlier claim is the active file', () => {
  const value = { ...state(), standalone_control_generation: 30 };
  let claims = 0;
  assert.equal(store.claim(value, () => { claims++; }), true);
  store.request(value);
  assert.equal(store.claim(value, () => { claims++; }), false);
  assert.equal(claims, 1);
});
test('private pause transport accepts only the exact run and no paths or mode changes', () => {
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'pause_batch', batch_id: token };
  assert.equal(validatePrivateMessage(message), message);
  for (const extra of [{ batch_id: 'latest' }, { source_paths: ['x'] }, { processing_mode: 'markdown-only' }]) {
    assert.throws(() => validatePrivateMessage({ ...message, ...extra }));
  }
});

// Actual gateway intake, immutable private snapshots, real TXT conversion /
// privacy engine, publication, mapping and lease lifecycle. The only hook
// requests pause after the production active-file claim. No converter mock.
const projectedBatchCases = testAsync('real Markdown and anonymization stop after the active file and resume without reprocessing it', async () => {
  process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'data');
  process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
  process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'output');
  process.env.EU_PRIVACY_RETENTION_DAYS = '7';
  for (const dir of ['data', 'workspace', 'output', 'sources']) fs.mkdirSync(path.join(root, dir));
  const { writeStandaloneRuntime } = await import('../scripts/lib/standalone-runtime-projection.mjs');
  const { writeConversionRuntime } = await import('../scripts/lib/standalone-conversion-runtime.mjs');
  const repo = path.join(__dirname, '..'), server = path.join(root, 'server');
  const target = process.platform === 'win32' ? `windows-${process.arch}` : process.platform === 'darwin' ? `macos-${process.arch}` : 'linux-x64-glibc';
  writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), server, target);
  writeConversionRuntime(repo, path.join(server, 'standalone/conversion-runtime'), target);
  const batch = require(path.join(server, 'gateway/batch'));
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const id = crypto.randomBytes(32).toString('hex');
    const queue = [0, 1].map(index => {
      const name = `${mode}-${index}.txt`, full = path.join(root, 'sources', name);
      fs.writeFileSync(full, 'Name: Anna Beispiel\nE-Mail: anna@example.invalid\nSachinhalt: 42 Projekte.\n');
      return { full, name, sourceBytes: fs.statSync(full).size };
    });
    assert.equal(batch.beginBatch({ token: id, expectedCount: 2, processingMode: mode, queue, profile: 'general',
      documentReview: true }).ok, true);
    assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
    let claims = 0;
    const first = await batch.runLocalBatchExecutor(id, { executorPid: process.pid, onClaimed: () => {
      claims++; batch.requestStandalonePause(id);
    } });
    assert.equal(claims, 1, mode); assert.equal(first.paused, true, mode);
    const before = batch._test.readState(id);
    assert.equal(before.items[0].status, 'released', mode); assert.equal(before.items[1].status, 'pending', mode);
    const releaseFacts = item => ({ status: item.status, artifact_id: item.artifact_id,
      artifact_sha256: item.artifact_sha256, package_id: item.package_id,
      processing_duration_ms: item.processing_duration_ms });
    const originalRelease = releaseFacts(before.items[0]);
    const restart = execFileSync(process.execPath, ['-e', `const b=require(${JSON.stringify(path.join(server, 'gateway/batch'))});process.stdout.write(JSON.stringify(b.readBatchProgress('${id}')));`],
      { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(JSON.parse(restart).paused, true, 'fresh process reads durable pause');
    assert.equal(batch.continueStandaloneBatch(id).ok, true);
    assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
    const final = await batch.runLocalBatchExecutor(id, { executorPid: process.pid, onClaimed: () => { claims++; } });
    assert.equal(final.complete, true, mode); assert.equal(claims, 2, mode);
    assert.deepEqual(releaseFacts(batch._test.readState(id).items[0]), originalRelease, 'released artifact and processing duration untouched');
    assert.equal(final.paused, false); assert.equal(batch.requestStandalonePause(id).complete, true);
    if (mode === 'markdown-and-anonymize') {
      const reviews = require(path.join(server, 'gateway/standalone-document-review-store')).createDocumentReviewStore();
      const listed = reviews.list(id);
      assert.equal(listed.documents.length, 2); assert.equal(listed.unavailable.length, 0);
      const first = listed.documents[0], bytes = reviews.chunk(id, first.document_id, 0, 0);
      assert.equal(first.entity_review_available, true); assert.ok(reviews.entities(id, first.document_id, 0, 0).entities.length >= 2);
      assert.match(bytes.original_text, /Anna Beispiel/u); assert.doesNotMatch(bytes.markdown, /Anna Beispiel/u);
      const approved = reviews.decide(id, first.document_id, { action: 'approve', revision: 0,
        output_sha256: first.output_sha256, ranges: [], operation_id: 'e'.repeat(32) });
      assert.equal(approved.approved, true);
      const selection = [{ document_id: first.document_id, revision: approved.revision, output_sha256: approved.output_sha256 }];
      const operation = 'd'.repeat(32);
      assert.equal(reviews.exportApproved(id, operation, selection).exported_count, 1);
      assert.equal(reviews.exportApproved(id, operation, selection).exported_count, 1, 'same operation is idempotent');
      const exportDir = path.join(root, 'output', 'DataSecure-KI-Export', `Export-${operation}`);
      assert.deepEqual(fs.readdirSync(exportDir), ['Dokument_01.md']);
      assert.equal(fs.readFileSync(path.join(exportDir, 'Dokument_01.md'), 'utf8'), bytes.markdown);
      assert.equal(reviews.list(id).documents.filter(row => row.approved).length, 1, 'unselected document stays open');
      assert.match(fs.readFileSync(queue[0].full, 'utf8'), /Anna Beispiel/u, 'original source unchanged');
    } else {
      const reviews = require(path.join(server, 'gateway/standalone-document-review-store')).createDocumentReviewStore(), listed = reviews.list(id);
      assert.equal(listed.documents.length, 2); assert.equal(listed.unavailable.length, 0);
      const row = listed.documents[0], bytes = reviews.chunk(id, row.document_id, 0, 0);
      assert.equal(row.processing_mode, 'markdown-only'); assert.equal(row.entity_review_available, false);
      const start = bytes.markdown.indexOf('42 Projekte'); assert.ok(start >= 0);
      const changed = reviews.decide(id, row.document_id, { action: 'correct', revision: row.revision, output_sha256: row.output_sha256,
        operation_id: '8'.repeat(32), ranges: [{ start, end: start + 11, replacement: '43 Projekte' }] });
      const approved = reviews.decide(id, row.document_id, { action: 'approve', revision: changed.revision,
        output_sha256: changed.output_sha256, operation_id: '9'.repeat(32), ranges: [] });
      const result = reviews.exportApproved(id, 'f'.repeat(32), [{ document_id: row.document_id, revision: approved.revision, output_sha256: approved.output_sha256 }]);
      assert.equal(result.anonymized, false);
      assert.ok(queue.some(item => item.name === row.name), 'export name must belong to an actual chosen source');
      const correctedDirectory = path.join(root, 'output', 'DataSecure-Markdown-Korrektur', result.folder_name);
      const originalMarkdownName = path.parse(row.name).name + '.md';
      assert.deepEqual(fs.readdirSync(correctedDirectory), [originalMarkdownName], 'raw correction preserves the original basename');
      const copied = fs.readFileSync(path.join(correctedDirectory, originalMarkdownName), 'utf8');
      assert.match(copied, /Anna Beispiel/u); assert.match(copied, /43 Projekte/u);
      assert.match(fs.readFileSync(queue[0].full, 'utf8'), /42 Projekte/u, 'original source unchanged by correction');
    }
  }
  // Real deferred-review publication used to ignore the durable pause entirely.
  // Exercise both sides of its publication claim and replay in a fresh process.
  for (const boundary of ['decisions', 'first-publication']) {
    const id = crypto.randomBytes(32).toString('hex');
    const queue = [0, 1].map(index => {
      const name = `review-pause-${boundary}-${index}.txt`, full = path.join(root, 'sources', name);
      fs.writeFileSync(full, `SYNTHETISCHER HÄRTETEST\nName: Anna Beispiel\nSachinhalt: ${index + 1} Projekte.`);
      return { full, name, sourceBytes: fs.statSync(full).size };
    });
    batch.beginBatch({ token: id, expectedCount: 2, processingMode: 'markdown-and-anonymize', queue,
      profile: 'general', documentReview: true });
    batch.claimLocalBatchExecutor(id, process.pid);
    assert.equal((await batch.runLocalBatchExecutor(id, { executorPid: process.pid })).deferred_review, 2);
    let pause, prompts = 0;
    const first = await batch.reviewDeferredBatch(id, { localFinalize: true,
      reviewTextLocally: async draft => { prompts++; return { action: 'reviewed', redactions: [],
        decisions: draft.ambiguities.map(row => ({ ambiguity_id: row.ambiguity_id, decision: 'keep' })) }; },
      ...(boundary === 'decisions' ? { onReviewDecisionsBound: () => { pause = batch.requestStandalonePause(id); } }
        : { beforePublish: () => { if (!pause) pause = batch.requestStandalonePause(id); } }) });
    const expected = boundary === 'decisions' ? 0 : 1;
    assert.equal(pause.pause_requested, true); assert.equal(first.reviewed_documents, expected, boundary);
    assert.equal(first.locally_released, expected, boundary);
    assert.equal(batch.readBatchProgress(id).paused, true, boundary);
    const before = batch._test.readState(id);
    assert.equal(before.items.filter(row => row.status === 'released').length, expected);
    assert.equal(before.items.filter(row => row.status === 'deferred_review').length, 2 - expected);
    assert.equal(prompts, 1);
    assert.ok(before.standalone_review_choices.entries.length > 0, 'decisions survive before publication');
    const restart = JSON.parse(execFileSync(process.execPath, ['-e', `
      (async()=>{const b=require(${JSON.stringify(path.join(server, 'gateway/batch'))});
      const paused=b.readBatchProgress('${id}').paused;
      b.continueStandaloneBatch('${id}');
      const result=await b.reviewDeferredBatch('${id}',{localFinalize:true,
        reviewTextLocally:async()=>{throw Error('already decided: no second prompt');}});
      process.stdout.write(JSON.stringify({paused,result,items:b._test.readState('${id}').items}));
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `], { cwd: repo, env: process.env, encoding: 'utf8', windowsHide: true }));
    assert.equal(restart.paused, true); assert.equal(restart.result.complete, true);
    assert.equal(restart.result.reviewed_documents, 2 - expected);
    assert.equal(restart.items.filter(row => row.status === 'released').length, 2);
    if (expected) assert.equal(restart.items[0].package_id, before.items[0].package_id);
  }
  // A rejected input has deliberately never acquired a source hash or private
  // work copy. It must neither stop good siblings nor gain review authority.
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const id = crypto.randomBytes(32).toString('hex');
    const sourceFolder = path.join(root, 'sources', mode); fs.mkdirSync(sourceFolder);
    const queue = [['good.txt', 'Name: Anna Beispiel\nSachinhalt: 42 Projekte.\n'], ['broken.docx', 'not an Office container']]
      .map(([name, text]) => { const full = path.join(sourceFolder, name);
        fs.writeFileSync(full, text); return { full, name, sourceBytes: fs.statSync(full).size }; });
    assert.equal(batch.beginBatch({ token: id, expectedCount: 2, processingMode: mode, queue, profile: 'general',
      documentReview: true }).ok, true);
    assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
    assert.equal((await batch.runLocalBatchExecutor(id, { executorPid: process.pid })).complete, true);
    const final = batch._test.readState(id), good = final.items.find(row => row.name === 'good.txt'),
      rejected = final.items.find(row => row.name === 'broken.docx');
    assert.equal(good.status, 'released', `mixed ${mode}: valid sibling must finish`);
    assert.equal(rejected.status, 'stopped'); assert.equal(rejected.sha256, undefined);
    assert.equal(rejected.checkpoint, 'source_preflight_stopped');
    const reviews = require(path.join(server, 'gateway/standalone-document-review-store')).createDocumentReviewStore();
    const listed = reviews.list(id);
    assert.deepEqual(listed.documents.map(row => row.document_id), [good.id]);
    assert.deepEqual(listed.unavailable, []); assert.deepEqual(listed.unclassified_documents, []);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/document-reviews', id, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'datasecure-document-run/2');
    assert.deepEqual(manifest.preflight_rejections, [{ document_id: rejected.id, name: 'broken.docx', reason_code: rejected.error_code }]);
    assert.equal(manifest.documents.length, 1, 'a rejected source is not an approvable document');
    assert.match(fs.readFileSync(queue[0].full, 'utf8'), /Anna Beispiel/u, 'no original changes');
    assert.equal(fs.readFileSync(queue[1].full, 'utf8'), 'not an Office container');
  }
  // No successful conversion will call capture() in an all-rejected run.
  // Intake itself must durably retain the names, without inventing documents.
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const id = crypto.randomBytes(32).toString('hex');
    const name = `all-rejected-${mode}.docx`, full = path.join(root, 'sources', name);
    fs.writeFileSync(full, 'not an Office container');
    assert.equal(batch.beginBatch({ token: id, expectedCount: 1, processingMode: mode,
      queue: [{ full, name, sourceBytes: fs.statSync(full).size }], profile: 'general', documentReview: true }).ok, true);
    assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
    assert.equal((await batch.runLocalBatchExecutor(id, { executorPid: process.pid })).complete, true);
    const rejected = batch._test.readState(id).items[0];
    assert.equal(rejected.status, 'stopped'); assert.equal(rejected.sha256, undefined);
    const create = require(path.join(server, 'gateway/standalone-document-review-store')).createDocumentReviewStore;
    const reviews = create({ expectedDocuments: () => [] }), listed = reviews.list(id);
    assert.deepEqual(listed.documents, []); assert.deepEqual(listed.unavailable, []);
    assert.deepEqual(listed.unclassified_documents, []);
    assert.equal(listed.processing_mode, mode);
    assert.deepEqual(listed.not_processed_documents, [{ document_id: rejected.id, name, reason_code: rejected.error_code }]);
    const summary = reviews.historySummary(id);
    assert.equal(summary.available, true); assert.equal(summary.not_processed_count, 1);
    assert.equal(summary.approved_count, 0); assert.equal(summary.current_exported_count, 0);
    const history = require(path.join(server, 'standalone/run-history')).createRunHistory({
      readStates: () => [], readExports: () => [], recoverableStates: () => [], liveExecutor: () => false });
    assert.deepEqual(history.failures(id), { ok: true, available: true, total: 1,
      files: [{ name, reason_code: rejected.error_code }],
      // This legacy /2 run has no bound extraction-coverage contract. Its
      // retained failure name is proven, but zero known notices is not proof
      // of complete, notice-free provenance. Markdown has no such projection.
      ...(mode === 'markdown-and-anonymize' ? { content_notice_count: 0,
        content_notice_breakdown_complete: false, content_notices: [] } : {}),
      local_ui_only: true, external_disclosure: false },
      'the real history failure action keeps names after processing journal expiry');
    assert.equal(fs.readFileSync(full, 'utf8'), 'not an Office container');
  }
  // Reproduce the journal-commit/capture crash gap with actual missing metadata,
  // then restart a real gateway process. Exercise all journal-removal routes.
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    for (const recovery of ['recoverBatches', 'cleanupExpiredBatchSnapshots', 'readState']) {
      const id = crypto.randomBytes(32).toString('hex'), name = `crash-${mode}-${recovery}.docx`, full = path.join(root, 'sources', name);
      fs.writeFileSync(full, 'not an Office container');
      batch.beginBatch({ token: id, expectedCount: 1, processingMode: mode, documentReview: true, profile: 'general',
        queue: [{ full, name, sourceBytes: fs.statSync(full).size }] });
      const state = batch._test.readStateForMaintenance(id);
      assert.equal(state.items[0].status, 'preflight_mapping_pending');
      if (recovery !== 'recoverBatches') {
        state.expires_at = new Date(Date.now() - 1000).toISOString(); batch._test.writeState(state);
      }
      const manifest = path.join(root, 'data/document-reviews', id, 'manifest.json'), expected = fs.readFileSync(manifest);
      fs.renameSync(manifest, `${manifest}.crash-gap-fixture`);
      const restarted = JSON.parse(execFileSync(process.execPath, ['-e', `
        const b=require(${JSON.stringify(path.join(server, 'gateway/batch'))});
        let result;
        ${recovery === 'readState' ? `try { b._test.readState('${id}'); } catch(error) { result={expired:/abgelaufen/u.test(error.message)}; }`
          : `result=b.${recovery}();`}
        process.stdout.write(JSON.stringify(result));
      `], { cwd: repo, env: process.env, encoding: 'utf8', windowsHide: true }));
      if (recovery === 'readState') assert.equal(restarted.expired, true);
      else assert.equal(restarted.failures, 0, `${mode} ${recovery}`);
      assert.deepEqual(fs.readFileSync(manifest), expected, 'fresh gateway repairs exact membership, no body or approval');
      const reviews = require(path.join(server, 'gateway/standalone-document-review-store')).createDocumentReviewStore();
      assert.deepEqual(reviews.list(id).documents, []);
      const history = require(path.join(server, 'standalone/run-history')).createRunHistory({
        readStates: () => [], readExports: () => [], recoverableStates: () => [], liveExecutor: () => false });
      assert.deepEqual(history.failures(id), { ok: true, available: true, total: 1,
        files: [{ name, reason_code: state.items[0].error_code }],
        ...(mode === 'markdown-and-anonymize' ? { content_notice_count: 0,
          content_notice_breakdown_complete: false, content_notices: [] } : {}),
        local_ui_only: true, external_disclosure: false });
      assert.equal(fs.existsSync(path.join(batch._test.batchRoot(), `${id}.json`)), recovery === 'recoverBatches');
      assert.equal(fs.readFileSync(full, 'utf8'), 'not an Office container');
    }
  }
});
testAsync('projected OCR-review opt-out changes only deferred Markdown work and releases its real owner on refusal', async () => {
  // Reuse the actual projected runtime, offline converter and fresh private
  // roots above, after its executor lifecycles have settled. No journal state,
  // converter result, contact answer or batch service is fabricated here.
  await projectedBatchCases;
  const server = path.join(root, 'server'), batch = require(path.join(server, 'gateway/batch'));
  const markdownStore = require(path.join(server, 'standalone/markdown-store'));
  const { image } = await import('./helpers/conversion-fixtures.mjs');
  const canvas = image(true), context = canvas.getContext('2d');
  let png;
  try {
    context.font = '40px Arial';
    context.fillText('Boris Quastenbach', 35, 90);
    context.fillText('Kontakt: qa11@quality.example.invalid', 35, 170);
    png = canvas.toBuffer('image/png');
  } finally { canvas.width = canvas.height = 1; }
  const sourceBytes = [Buffer.from('SYNTHETISCHER OCR-OPT-OUT-TEST\nBereits veröffentlichter Sachinhalt: 42 Projekte.\n'), png];
  const queue = ['ocr-skip-published.txt', 'ocr-skip-contact.png'].map((name, index) => {
    const full = path.join(root, 'sources', name);
    fs.writeFileSync(full, sourceBytes[index]);
    return { full, name, sourceBytes: sourceBytes[index].length };
  });
  const id = batch.beginBatch({ expectedCount: queue.length, profile: 'general', productChannel: 'standalone',
    processingMode: 'markdown-only', ocrContactReview: true, documentReview: true, queue }).batch_token;
  assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
  const deferred = await batch.runLocalBatchExecutor(id, { executorPid: process.pid });
  assert.equal(deferred.complete, false); assert.equal(deferred.deferred_review, 1);
  const before = batch._test.readState(id), journal = path.join(batch._test.batchRoot(), `${id}.json`);
  assert.equal(before.product_channel, 'standalone'); assert.equal(before.processing_mode, 'markdown-only');
  assert.equal(before.ocr_contact_review, true); assert.notEqual(before.ocr_contact_review_skipped, true);
  assert.equal(before.items[0].status, 'released'); assert.equal(before.items[1].status, 'deferred_review');
  assert.equal(before.items[1].error_code, 'LOCAL_REVIEW_DEFERRED');
  assert.equal(JSON.parse(fs.readFileSync(journal, 'utf8')).items[1].status, 'deferred_review');
  const publishedItem = structuredClone(before.items[0]);
  const publishedFolder = path.join(markdownStore.artifactRoot(), publishedItem.artifact_id);
  const publishedBytes = new Map(fs.readdirSync(publishedFolder).map(name => [name, fs.readFileSync(path.join(publishedFolder, name))]));
  const assertPublishedUnchanged = () => {
    assert.deepEqual(batch._test.readState(id).items[0], publishedItem, 'the full released journal item is immutable');
    assert.deepEqual(fs.readdirSync(publishedFolder), [...publishedBytes.keys()]);
    for (const [name, bytes] of publishedBytes)
      assert.deepEqual(fs.readFileSync(path.join(publishedFolder, name)), bytes, 'published Markdown and manifest bytes are unchanged');
  };
  const contactAnswers = () => fs.readdirSync(batch._test.workPath(id)).filter(name => name.endsWith('.ocrreview'));
  assert.deepEqual(contactAnswers(), [], 'deferral did not invent a reviewed contact record');
  const ownerFile = batch._test.activeLockPath();
  assert.equal(fs.existsSync(ownerFile), false);
  const unavailable = error => error?.code === 'OCR_CONTACT_SKIP_UNAVAILABLE';

  // A real live owner, even in this PID and for the same token, cannot be
  // adopted by the new synchronous transaction or removed on its refusal.
  assert.equal(batch._test.acquireActiveLock(id), true);
  try {
    const ownerBytes = fs.readFileSync(ownerFile), ownerStat = fs.lstatSync(ownerFile, { bigint: true });
    const journalBytes = fs.readFileSync(journal), owner = JSON.parse(ownerBytes);
    assert.equal(owner.token, id); assert.equal(owner.pid, process.pid);
    assert.throws(() => batch.skipStandaloneOcrContactReview(id), unavailable);
    const after = fs.lstatSync(ownerFile, { bigint: true });
    assert.deepEqual([after.dev, after.ino, after.birthtimeNs], [ownerStat.dev, ownerStat.ino, ownerStat.birthtimeNs]);
    assert.deepEqual(fs.readFileSync(ownerFile), ownerBytes); assert.deepEqual(fs.readFileSync(journal), journalBytes);
  } finally { assert.equal(batch._test.releaseActiveLock(id), true); }

  // This refusal happens AFTER the transaction acquired its own real owner.
  // Its validation error must release that owner, without changing the lease.
  assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
  try {
    const journalBytes = fs.readFileSync(journal);
    assert.throws(() => batch.skipStandaloneOcrContactReview(id), unavailable);
    assert.deepEqual(fs.readFileSync(journal), journalBytes);
    assert.equal(fs.existsSync(ownerFile), false, 'validation failure releases its acquired owner');
    assert.equal(batch._test.acquireActiveLock(id), true);
    assert.equal(batch._test.releaseActiveLock(id), true, 'a real subsequent acquisition and release still succeeds');
  } finally { assert.equal(batch.releaseLocalBatchExecutor(id, process.pid), true); }

  const wrongMode = batch.beginBatch({ expectedCount: 1, profile: 'general', productChannel: 'standalone',
    processingMode: 'markdown-and-anonymize', queue: [queue[0]] }).batch_token;
  const wrongJournal = path.join(batch._test.batchRoot(), `${wrongMode}.json`), wrongBytes = fs.readFileSync(wrongJournal);
  assert.throws(() => batch.skipStandaloneOcrContactReview(wrongMode), unavailable);
  assert.deepEqual(fs.readFileSync(wrongJournal), wrongBytes, 'wrong processing mode is not rewritten');
  assert.equal(fs.existsSync(ownerFile), false, 'wrong-mode failure releases its acquired owner');

  const skipped = batch.skipStandaloneOcrContactReview(id), pending = batch._test.readState(id);
  assert.equal(skipped.ok, true); assert.equal(skipped.skipped, true); assert.equal(skipped.complete, false);
  assert.equal(skipped.deferred_review, 0); assert.equal(skipped.remaining, 1); assert.equal(skipped.raw_content_sent_to_claude, false);
  assert.equal(pending.ocr_contact_review_skipped, true); assert.equal(pending.ocr_contact_review, true);
  assert.equal(pending.ocr_review_seed, before.ocr_review_seed); assert.equal(Object.hasOwn(pending, 'pseudonym_seed'), false);
  assert.equal(pending.items[1].status, 'pending'); assert.equal(pending.items[1].checkpoint, 'ocr_contact_review_skipped');
  assert.equal(Object.hasOwn(pending.items[1], 'error_code'), false);
  assert.deepEqual(contactAnswers(), [], 'the opt-out marker is NOT a contact confirmation');
  assert.equal(fs.existsSync(ownerFile), false); assertPublishedUnchanged();
  const skippedJournal = fs.readFileSync(journal);
  assert.throws(() => batch.skipStandaloneOcrContactReview(id), unavailable, 'a second opt-out cannot replay the mutation');
  assert.deepEqual(fs.readFileSync(journal), skippedJournal); assert.equal(fs.existsSync(ownerFile), false);

  assert.equal(batch.claimLocalBatchExecutor(id, process.pid).ok, true);
  let prompts = 0;
  const complete = await batch.runLocalBatchExecutor(id, { executorPid: process.pid, reviewOcrContacts: true,
    reviewTextLocally: async () => { prompts++; throw new Error('opt-out must not synthesize or request a contact answer'); } });
  assert.equal(complete.complete, true); assert.equal(prompts, 0); assertPublishedUnchanged();
  const final = batch._test.readState(id), converted = final.items[1];
  assert.equal(converted.status, 'released');
  const artifact = markdownStore.readMarkdownArtifact(converted.artifact_id, final.content_options);
  assert.equal(artifact.manifest.anonymized, false);
  assert.ok(artifact.manifest.reason_codes.includes('OCR_CONTACT_VALUES_UNVERIFIED'), 'skipped contact uncertainty remains explicit');
  assert.ok(artifact.manifest.reason_codes.includes('OCR_NOT_VERIFIED'), 'general OCR uncertainty is not promoted to verified');
  assert.match(artifact.markdown, /quality\.example\.invalid/u);
  assert.doesNotMatch(artifact.markdown, /OCR-Kontaktwerte wurden lokal bestätigt oder korrigiert/u);
  assert.deepEqual(contactAnswers(), []); assert.equal(fs.existsSync(ownerFile), false);
  queue.forEach((item, index) => assert.deepEqual(fs.readFileSync(item.full), sourceBytes[index], 'selected source bytes stay unchanged'));
});

done();
