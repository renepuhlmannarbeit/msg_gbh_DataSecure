'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
// The hosted Windows TMP spelling may be an alias. The real result-root
// boundary must receive the physical fixture path, not an equivalent alias.
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-standalone-history-')));
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'private');
process.env.EU_PRIVACY_ROOT = path.join(base, 'workspace');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const originalResultRoot = path.join(base, 'original-results');
fs.mkdirSync(originalResultRoot);
process.env.EU_PRIVACY_RESULT_ROOT = originalResultRoot;

const batch = require('../plugins/data-secure/server/gateway/batch');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const exportsApi = require('../plugins/data-secure/server/gateway/result-export');
const { readConfiguredResultRoot } = require('../plugins/data-secure/server/gateway/result-folder-config');
const reservation = require('../plugins/data-secure/server/gateway/batch-intake-reservation');
const historyStore = require('../plugins/data-secure/server/gateway/standalone-history-store');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const { conversionFeedback, isOcrOmission } = require('../plugins/data-secure/server/standalone/conversion-feedback');
const identityLedger = require('../plugins/data-secure/server/standalone/identity-ledger');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const { validateSelectedPathAsync, batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const now = Date.now();
const makeHistory = () => createRunHistory({
  readStates: batch.readStandaloneHistoryStates,
  readExports: exportsApi.readStandaloneExportHistory,
  recoverableStates: batch.standaloneRecoverableStates,
  liveExecutor: batch._test.liveLocalExecutor
});
function stateFixture(character, offset = 0, extra = {}) {
  const token = character.repeat(64);
  const state = {
    schema: 'datasecure-batch/1', token, product_channel: 'standalone', profile: 'general',
    created_at: new Date(now + offset).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
    items: [{ id: character.repeat(32), name: 'private-source-name.txt', status: 'retryable',
      error_code: 'PROCESSING_INTERRUPTED', checkpoint: 'stopped' }], ...extra
  };
  if (state.schema !== 'datasecure-batch/5') Object.assign(state,
    createBatchPseudonymState({ productChannel: state.product_channel }));
  if (state.product_channel === 'standalone') batch._test.writeState(state);
  else {
    // A foreign negative fixture must not be admitted by the live product
    // writer. Place synthetic metadata directly to exercise history filtering.
    assert.throws(() => batch._test.writeState(state), { code: 'BATCH_PRODUCT_CHANNEL_MISMATCH' });
    fs.writeFileSync(path.join(batch._test.batchRoot(), `${token}.json`), JSON.stringify(state), { flag: 'wx' });
  }
  return state;
}
function completeFixture(character, offset, identities = null) {
  const itemId = character.repeat(32);
  const packageId = `ds_${itemId}`;
  const directory = path.join(roots().output, packageId);
  fs.mkdirSync(directory);
  const bytes = Buffer.from('Bereinigter lokaler Testinhalt');
  const document = `${packageId}.md`;
  fs.writeFileSync(path.join(directory, document), bytes);
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2', package_id: packageId, profile: 'general', document,
    document_sha256: crypto.createHash('sha256').update(bytes).digest('hex'), assets: [],
    created_at: new Date(now + offset).toISOString()
  }));
  const state = stateFixture(character, offset, { items: [{ id: itemId, name: 'private-source-name.txt',
    status: 'released', package_id: packageId, source_label: 'private-source-name.txt' }] });
  if (identities) identityLedger.capture(state.token, itemId, packageId, identities);
  assert.equal(exportsApi.exportCompletedState(state).available, true);
  return state;
}
function dependencies(runHistory, overrides = {}) {
  return {
    runHistory, initializeProduct: () => ({ ok: true }),
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }),
    continueStandaloneBatch: batch.continueStandaloneBatch,
    reserveIntake: reservation.reserveIntake, releaseIntake: reservation.releaseIntake,
    ...overrides
  };
}
function code(expected) { return (error) => error?.code === expected; }

(async () => {
  try {
    // Pure display policy inputs are not themselves journal authority. Product
    // composition uses readStateForMaintenance's independent options anchor.
    const displayState = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode: 'markdown-only',
      content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
      items: [...Array.from({ length: 116 }, (_, index) => ({ status: 'released', extraction_grade: index < 35 ? 'incomplete' : 'complete',
        reason_codes: index < 35 ? ['SOURCE_COVERAGE_UNVERIFIED'] : [] })),
      ...Array.from({ length: 17 }, (_, index) => ({ status: 'stopped', error_code: index < 13 ? 'IMAGE_OCR_REQUIRED' : 'PDF_TEXT_UNAVAILABLE_BY_POLICY' }))] };
    const before = JSON.stringify(displayState);
    // Test the real service composition, not a self-declared UI checkbox.
    const checkPresentation = () => {
    const presentationState = { ...displayState, token: 'e'.repeat(64), items: [
      { id: '1'.repeat(32), name: 'good.txt', status: 'released' },
      { id: '2'.repeat(32), name: 'missing.txt', status: 'released' },
      { id: '3'.repeat(32), name: 'scan.png', source_label: 'nested/scan.png', status: 'stopped', error_code: 'IMAGE_OCR_REQUIRED' }] };
    const documentData = { processing_mode: 'markdown-only', documents: [{ document_id: '1'.repeat(32), name: 'good.txt' }],
      unavailable: [{ document_id: '2'.repeat(32), name: 'missing.txt' }],
      not_processed_documents: [{ document_id: '3'.repeat(32), name: 'nested/scan.png', reason_code: 'IMAGE_OCR_REQUIRED' }] };
    let projectedState = presentationState, projectedDocuments = documentData;
    const projectionHistory = createRunHistory({ readStates: () => projectedState ? [projectedState] : [] });
    const projectionService = new StandaloneApplicationService({ dependencies: {
      documentReviews: { list: () => structuredClone(projectedDocuments) }, runHistory: projectionHistory } });
    assert.equal(projectionService.documentReviews(presentationState.token).not_processed_documents[0].classification, 'ocr_omission');
    assert.equal(projectionService.documentReviews(presentationState.token).conversion_feedback.ocr_enabled, false);
    projectedState = { ...presentationState, items: presentationState.items.map((item, index) => index === 0 ?
      { ...item, extraction_grade: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] } : item) };
    assert.deepEqual(projectionService.documentReviews(presentationState.token).content_notices,
      [{ document_id: '1'.repeat(32), name: 'good.txt', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }],
      'only the journal-bound released document receives a file-specific notice');
    projectedDocuments = { ...documentData, documents: [{ ...documentData.documents[0], name: 'different.txt' }] };
    assert.equal(projectionService.documentReviews(presentationState.token).content_notices, undefined,
      'a mismatched display name cannot label another private review row');
    projectedDocuments = documentData; projectedState = presentationState;
    for (const patch of [{ name: 'another.png' }, { document_id: '4'.repeat(32) }, { reason_code: 'SOURCE_READ_FAILED' }]) {
      projectedDocuments = { ...documentData, not_processed_documents: [{ ...documentData.not_processed_documents[0], ...patch }] };
      assert.equal(projectionService.documentReviews(presentationState.token).conversion_feedback, undefined, 'mismatch grants no harmless label');
    }
    projectedDocuments = { ...documentData, unclassified_documents: [{ document_id: '5'.repeat(32), name: 'old.txt' }] };
    assert.equal(projectionService.documentReviews(presentationState.token).conversion_feedback, undefined);
    projectedDocuments = documentData; projectedState = null;
    assert.equal(projectionService.documentReviews(presentationState.token).conversion_feedback, undefined, 'retired evidence never infers OCR-off');
    projectedState = { ...presentationState, content_options: { ...presentationState.content_options, imageOcr: true, scanOcr: true } };
    assert.equal(projectionService.documentReviews(presentationState.token).not_processed_documents[0].classification, 'error');
    assert.equal(JSON.stringify(documentData), JSON.stringify(projectedDocuments), 'display merge does not mutate saved data');
    };
    assert.deepEqual(conversionFeedback(displayState), { schema: 'datasecure-conversion-feedback/1', ocr_enabled: false,
      selected_count: 133, result_count: 116, not_converted_count: 17, ocr_omitted_count: 17, error_count: 0,
      content_notice_count: 35, pending_count: 0, complete: true });
    assert.equal(JSON.stringify(displayState), before, 'projection never mutates technical completion');
    for (const extra of [{ product_channel: 'plugin' }, { processing_mode: 'markdown-and-anonymize' },
      { schema: 'datasecure-batch/5' }, { content_options: { ...displayState.content_options, markdownOutput: 'notes-v1' } },
      { content_options: null }]) assert.equal(conversionFeedback({ ...displayState, ...extra }), null);
    const ocrOn = { ...displayState, content_options: { ...displayState.content_options, imageOcr: true, scanOcr: true } };
    assert.equal(conversionFeedback(ocrOn).ocr_omitted_count, 0); assert.equal(conversionFeedback(ocrOn).error_count, 17);
    for (const item of [{ status: 'retryable', error_code: 'IMAGE_OCR_REQUIRED' },
      { status: 'mapping_pending', error_code: 'IMAGE_OCR_REQUIRED' },
      { status: 'stopped', error_code: 'IMAGE_OCR_REQUIRED', local_mapping_exported: false },
      { status: 'stopped', error_code: 'SOURCE_READ_FAILED' }]) assert.equal(isOcrOmission(displayState, item), false);
    const mixed = structuredClone(displayState); mixed.items[116].error_code = 'CONVERSION_EXECUTABLE_DENIED';
    assert.equal(conversionFeedback(mixed).error_count, 1); assert.equal(conversionFeedback(mixed).ocr_omitted_count, 16);
    const retry = { ...displayState, items: [{ status: 'retryable', error_code: 'IMAGE_OCR_REQUIRED' }] };
    assert.equal(conversionFeedback(retry).complete, false);
    assert.equal(readConfiguredResultRoot(), originalResultRoot,
      'real result-root admission must accept the physical history fixture');
    // The shared product loads the store without the Standalone UI adapter.
    // Its channel guards must return before even creating history storage.
    const historyDirectory = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history');
    assert.equal(fs.existsSync(historyDirectory), false, 'loading the store has no filesystem side effect');
    historyStore.recordStandaloneState({ product_channel: 'plugin', token: '9'.repeat(64),
      created_at: new Date(now).toISOString(), items: [{ status: 'released' }] });
    historyStore.recordStandaloneExport(path.join(base, `re_${'9'.repeat(32)}.json`),
      { product_channel: 'plugin', complete: true }, path.join(base, 'missing-run'));
    historyStore.recordStandaloneExport(path.join(base, `re_${'9'.repeat(32)}.json`),
      { product_channel: 'standalone', complete: false }, path.join(base, 'missing-run'));
    assert.equal(fs.existsSync(historyDirectory), false, 'plugin and incomplete exports never write Standalone history');
    checkPresentation();

    const older = stateFixture('a', -10000, { schema: 'datasecure-batch/5', processing_mode: 'markdown-only' });
    const newer = stateFixture('b', 0);
    const plugin = stateFixture('c', 1000, { product_channel: 'plugin' });
    let history = makeHistory();
    let snapshot = history.history();
    // Startup/history projection must not begin a potentially long visible
    // export while the native desktop is still waiting for its first reply.
    const pendingExport = { ...older, schema: 'datasecure-batch/7',
      processing_mode: 'markdown-and-anonymize', standalone_document_review: true,
      content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1',
        scanOcr: false, imageOcr: false },
      items: [{ id: 'a'.repeat(32), name: 'synthetic.txt', status: 'released' }] };
    let recoveryCalls = 0;
    const recoveryHistory = createRunHistory({ readStates: () => [pendingExport], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false,
      exportCompletedBatchResults: () => { recoveryCalls++; return { available: false }; } });
    assert.ok(recoveryHistory.history({ recoverExports: false }).entries.some(row => row.batch_id === pendingExport.token));
    assert.equal(recoveryCalls, 0, 'bootstrap projection cannot perform result export');
    recoveryHistory.find(pendingExport.token);
    assert.equal(recoveryCalls, 0, 'a lookup cannot unexpectedly start result export');
    recoveryHistory.history();
    assert.equal(recoveryCalls, 1, 'explicit history reconciliation resumes the pending export');
    const completeOcrOff = { ...pendingExport, token: 'd'.repeat(64), items: [
      { id: 'd'.repeat(32), name: 'synthetic.txt', status: 'released' },
      { id: 'e'.repeat(32), name: 'scan.png', status: 'stopped', error_code: 'IMAGE_OCR_REQUIRED' }] };
    const ocrHistory = createRunHistory({ readStates: () => [completeOcrOff], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false });
    assert.equal(ocrHistory.history({ recoverExports: false }).entries.find(row =>
      row.batch_id === completeOcrOff.token).expected_ocr_omission_count, 1,
    'only a matching completed anonymization run exposes its expected OCR-off omission');
    const mixedPrivacy = { ...completeOcrOff, items: [...completeOcrOff.items,
      { id: 'f'.repeat(32), name: 'long.txt', status: 'stopped', error_code: 'AMBIGUITY_REVIEW_REQUIRED' }] };
    const mixedHistory = createRunHistory({ readStates: () => [mixedPrivacy], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false });
    assert.equal(mixedHistory.history({ recoverExports: false }).entries.find(row =>
      row.batch_id === mixedPrivacy.token).privacy_stop_count, 1,
    'a bound privacy stop remains distinct from both OCR omission and technical failure');
    assert.deepEqual(mixedHistory.failures(mixedPrivacy.token).files.map(row => row.classification),
      ['ocr_omission', 'privacy_stop'], 'file details preserve the same exact categories as the summary');
    const ocrEnabled = { ...completeOcrOff, content_options: { ...completeOcrOff.content_options,
      scanOcr: true, imageOcr: true } };
    assert.equal(createRunHistory({ readStates: () => [ocrEnabled], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false }).history({ recoverExports: false }).entries.find(row =>
      row.batch_id === completeOcrOff.token).expected_ocr_omission_count, undefined);
    // History must project pause from the same journal snapshot. A separate
    // full progress read for every old run can race a publishing worker and
    // make the entire history unavailable while its rows are otherwise sound.
    const pauseJournal = { ...older, standalone_pause_requested: true,
      items: [{ status: 'pending', id: 'f'.repeat(32), name: 'synthetic.txt' }] };
    let pauseWorkerLive = false;
    const snapshotHistory = createRunHistory({ readStates: () => [pauseJournal], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => pauseWorkerLive,
      pauseProgress: () => { throw Error('a second progress read is not allowed'); } });
    assert.equal(snapshotHistory.history().entries.find(row => row.batch_id === older.token).status, 'paused');
    pauseWorkerLive = true;
    assert.equal(snapshotHistory.history().entries.find(row => row.batch_id === older.token).status, 'processing');
    assert.deepEqual(snapshot.entries.map((entry) => entry.batch_id), [newer.token, older.token]);
    assert.equal(snapshot.local_ui_only, true);
    assert.equal(snapshot.external_disclosure, false);
    assert.equal(snapshot.entries[0].resumable, true);
    assert.doesNotMatch(JSON.stringify(snapshot), /private-source-name|batch_token|local_path|workspace|original-results/u);
    assert.throws(() => history.resolveResults('../untrusted'), code('STANDALONE_HISTORY_INVALID'));
    assert.throws(() => history.resolveResults(plugin.token), code('STANDALONE_HISTORY_MISSING'));

    let selectedToken;
    let acknowledge;
    const ack = new Promise((resolve) => { acknowledge = resolve; });
    const service = new StandaloneApplicationService({ dependencies: dependencies(history, {
      startLocalBatchExecutor: (token) => {
        selectedToken = token;
        assert.equal(batch.readBatchProcessingMode(token), 'markdown-only', 'continuation preserves the journal processing mode');
        return { ok: true, local_processing_started: true, ipcAcknowledgement: ack };
      }
    }) });
    service.admittedQueue = [{ name: 'prepared-source.txt' }];
    await assert.rejects(service.continueHistoryBatch(older.token), code('STANDALONE_BUSY'));
    assert.equal(service.admittedQueue.length, 1, 'history resume preserves a prepared selection');
    service.admittedQueue = null;
    service.selectionContext = { sourceKind: 'files', sourceFolders: ['previous-selection'], selectedFiles: ['newer-source.txt'] };
    let confirmed = false;
    const continuation = service.continueHistoryBatch(older.token).then(() => { confirmed = true; });
    assert.equal(selectedToken, older.token);
    assert.equal(service.selectionContext, null, 'resuming history never displays source hints from a different admission');
    assert.equal(confirmed, false, 'confirmation waits for worker IPC');
    assert.equal(batch._test.readStateForMaintenance(older.token).items[0].status, 'pending');
    assert.equal(batch._test.readStateForMaintenance(newer.token).items[0].status, 'retryable');
    await assert.rejects(service.continueHistoryBatch(newer.token), code('STANDALONE_BUSY'));
    acknowledge(); await continuation;
    assert.equal(reservation.intakeReservationActive(), false);

    // A second interruption leaves two recoverable runs. The generic current
    // action must keep the observed older conversion instead of selecting the
    // newer anonymization journal or changing its saved processing purpose.
    const interruptedAgain = batch._test.readStateForMaintenance(older.token);
    interruptedAgain.items[0].status = 'retryable';
    interruptedAgain.items[0].error_code = 'PROCESSING_INTERRUPTED';
    batch._test.writeState(interruptedAgain);
    assert.deepEqual(new Set(batch.standaloneRecoverableStates().map((state) => state.token)), new Set([older.token, newer.token]));
    selectedToken = null;
    await service.continueCurrentBatch();
    assert.equal(selectedToken, older.token, 'the second continuation remains bound to the observed older run');
    assert.equal(batch._test.readStateForMaintenance(older.token).items[0].status, 'pending');
    assert.equal(batch._test.readStateForMaintenance(newer.token).items[0].status, 'retryable');
    assert.equal(batch.readBatchProcessingMode(older.token), 'markdown-only');
    assert.equal(batch.readBatchProcessingMode(newer.token), 'markdown-and-anonymize');

    // Revalidation happens after the renderer read, under the backend lock.
    const stale = new StandaloneApplicationService({ dependencies: dependencies(history, {
      continueStandaloneBatch(token) {
        const state = batch._test.readStateForMaintenance(token);
        state.invalidated = true; batch._test.writeState(state);
        return batch.continueStandaloneBatch(token);
      }, startLocalBatchExecutor() { throw new Error('STALE_BATCH_STARTED'); }
    }) });
    await assert.rejects(stale.continueHistoryBatch(newer.token), code('STANDALONE_NOTHING_TO_CONTINUE'));
    assert.throws(() => batch.continueStandaloneBatch(plugin.token), code('STANDALONE_NOTHING_TO_CONTINUE'));
    batch._test.acquireActiveLock('9'.repeat(64));
    try { assert.throws(() => batch.continueStandaloneBatch(older.token), code('STANDALONE_BUSY')); }
    finally { batch._test.releaseActiveLock('9'.repeat(64)); }

    const completed = completeFixture('d', 2000,
      [{ pseudonym: '[PERSON_001]', original: 'Synthetischer Testname' }]);
    const originalRun = exportsApi.visibleExportDirectory(completed.token);
    const completedTwo = completeFixture('e', 3000);
    const secondRun = exportsApi.visibleExportDirectory(completedTwo.token);
    assert.notEqual(originalRun, secondRun);
    assert.equal(history.resolveResults(completed.token).local_path, originalRun);
    assert.equal(history.resolveLedger(completed.token).local_path, path.join(originalRun, 'DataSecure-Zuordnung.csv'));
    assert.equal(history.resolveResults(completedTwo.token).local_path, secondRun);
    assert.equal(fs.existsSync(path.join(originalRun, 'VERTRAULICH-NICHT-HOCHLADEN',
      'DataSecure-Identitaeten-VERTRAULICH.txt')), true,
    'a completed standalone export creates only the marked human-readable copy');
    assert.equal(history.find(completed.token).identity_mapping_available, true);
    assert.doesNotMatch(JSON.stringify(history.history()), /Synthetischer Testname/u,
      'history returns only the availability bit, never an identity value');
    const identityTarget = history.resolveIdentityMapping(completed.token);
    assert.equal(identityTarget.target_kind, 'file');
    assert.equal(identityTarget.local_path, path.join(originalRun, 'VERTRAULICH-NICHT-HOCHLADEN',
      'DataSecure-Identitaeten-VERTRAULICH.txt'));
    assert.match(fs.readFileSync(identityTarget.local_path, 'utf8'), /\[PERSON_001\] = Synthetischer Testname/u);
    assert.equal(history.find(completed.token).identity_mapping_available, true);
    assert.equal(history.resolveResults(completed.token).local_path, originalRun,
      'the confidential copy does not change the anonymized result binding');
    const publishIdentity = identityLedger.publishDocumentToRun;
    identityLedger.publishDocumentToRun = () => { throw Object.assign(new Error('PRIVATE PATH'), { code: 'EACCES' }); };
    try {
      const fallback = history.resolveIdentityMapping(completed.token);
      assert.equal(fallback.publication_available, false);
      assert.equal(fallback.identity_mapping_warning, 'STANDALONE_IDENTITY_PUBLICATION_FAILED');
      assert.equal(fallback.local_path, identityLedger.resolveDocument(completed.token));
    } finally { identityLedger.publishDocumentToRun = publishIdentity; }
    const materializeIdentity = identityLedger.materialize;
    identityLedger.materialize = () => { throw Object.assign(new Error('PRIVATE PATH'), { code: 'ENOSPC' }); };
    try { assert.throws(() => history.resolveIdentityMapping(completed.token), code('STANDALONE_IDENTITY_MAPPING_INVALID')); }
    finally { identityLedger.materialize = materializeIdentity; }
    // User removal is permanent: history reports the missing publication, but
    // never silently restores it on opening the retained private fallback.
    fs.unlinkSync(identityTarget.local_path);
    assert.equal(history.find(completed.token).identity_mapping_warning, 'STANDALONE_IDENTITY_PUBLICATION_FAILED');
    assert.equal(history.resolveIdentityMapping(completed.token).publication_available, false);
    assert.equal(fs.existsSync(identityTarget.local_path), false);
    await assert.rejects(service.continueHistoryBatch(completed.token), code('STANDALONE_NOTHING_TO_CONTINUE'));

    const allStopped = stateFixture('4', 1500, { items: [{ id: '4'.repeat(32), name: 'blocked.docx',
      source_label: 'blocked.docx', status: 'stopped', error_code: 'DOCX_STRUCTURE_UNSUPPORTED' }] });
    assert.deepEqual(exportsApi.exportCompletedState(allStopped), { exported: 0, pending: 0, available: false });
    history = makeHistory();
    assert.equal(history.find(allStopped.token).status, 'completed_without_results');
    assert.equal(history.find(allStopped.token).results_available, false);
    assert.equal(history.find(allStopped.token).ledger_available, false);
    assert.equal(history.find(allStopped.token).identity_mapping_warning, undefined);
    assert.deepEqual(history.failures(allStopped.token), {
      ok: true, available: true, total: 1,
      files: [{ name: 'blocked.docx', reason_code: 'DOCX_STRUCTURE_UNSUPPORTED' }],
      local_ui_only: true, external_disclosure: false
    });
    assert.doesNotMatch(JSON.stringify(history.history()), /blocked\.docx/u,
      'file names are returned on demand, not persisted in content-free history rows');
    const failureService = new StandaloneApplicationService({ dependencies: dependencies(history) });
    failureService.observedBatchId = allStopped.token;
    assert.deepEqual(failureService.runFailures(), history.failures(allStopped.token),
      'current failure details belong to the observed run, never the newest different run');
    assert.deepEqual(failureService.runFailures(completed.token), {
      ok: true, available: true, total: 0, files: [], local_ui_only: true, external_disclosure: false
    }, 'an explicit successful run never borrows failures from the observed run');
    failureService.observedBatchId = null;
    assert.throws(() => failureService.runFailures(), code('STANDALONE_HISTORY_MISSING'),
      'an unbound request must not guess a run or disclose another source filename');
    const summaryOnly = createRunHistory({
      readStates: () => [], readExports: exportsApi.readStandaloneExportHistory,
      recoverableStates: () => [], liveExecutor: () => false
    });
    assert.deepEqual(summaryOnly.failures(allStopped.token), {
      ok: true, available: false, total: 1, files: [],
      local_ui_only: true, external_disclosure: false
    });
    const retainedRejection = { document_id: '4'.repeat(32), name: 'nested/rejected.docx', reason_code: 'SOURCE_CONTAINER_CORRUPT' };
    const retained = rows => createRunHistory({ readStates: () => [], readExports: exportsApi.readStandaloneExportHistory,
      recoverableStates: () => [], liveExecutor: () => false, readRejectedInputs: () => rows }).failures(allStopped.token);
    assert.deepEqual(retained([retainedRejection]), { ok: true, available: true, total: 1,
      files: [{ name: 'nested/rejected.docx', reason_code: 'SOURCE_CONTAINER_CORRUPT' }], local_ui_only: true, external_disclosure: false });
    const mappingPending = stateFixture('5', 1501, { items: [{ id: '5'.repeat(32), name: 'pending-rejection.docx',
      status: 'preflight_mapping_pending', checkpoint: 'source_preflight_rejected', local_mapping_exported: false,
      error_code: 'SOURCE_CONTAINER_CORRUPT' }] });
    assert.equal(history.find(mappingPending.token).failed_count, 0, 'the summary has not counted terminal mapping yet');
    const afterJournalLoss = createRunHistory({ readStates: () => [], readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false, readRejectedInputs: () => [{
        ...retainedRejection, document_id: mappingPending.items[0].id, name: 'pending-rejection.docx' }] });
    assert.deepEqual(afterJournalLoss.failures(mappingPending.token), { ok: true, available: true, total: 1,
      files: [{ name: 'pending-rejection.docx', reason_code: 'SOURCE_CONTAINER_CORRUPT' }],
      local_ui_only: true, external_disclosure: false }, 'durable source rejection outranks a stale terminal counter');
    for (const invalid of [null, [retainedRejection, retainedRejection], [{ ...retainedRejection, name: '../foreign.docx' }],
      [{ ...retainedRejection, document_id: 'unknown' }], [{ ...retainedRejection, reason_code: 'arbitrary text' }]])
      assert.deepEqual(retained(invalid), summaryOnly.failures(allStopped.token), 'invalid private evidence cannot supply filenames');
    assert.throws(() => history.resolveResults(allStopped.token), code('STANDALONE_RESULTS_MISSING'));
    assert.throws(() => history.resolveLedger(allStopped.token), code('STANDALONE_LEDGER_MISSING'));

    // An older three-file converter resumed beside a newer one-file completed
    // anonymization must own mode, counters, result context and terminal ACK.
    const markdown = stateFixture('6', -20000, { schema: 'datasecure-batch/5', processing_mode: 'markdown-only',
      items: [1, 2, 3].map((index) => ({ id: (600 + index).toString(16).padStart(32, '0'),
        name: `synthetic-${index}.txt`, status: 'pending' })) });
    assert.equal(batch.claimLocalBatchExecutor(markdown.token, process.pid).ok, true);
    let pendingNotice = { token: completedTwo.token, generation: 70 };
    const notices = [];
    const observedDependencies = dependencies(history, {
      validateSelectedPathAsync, batchQueueFromSelection,
      publicStatusSnapshot(selectedBatchId) {
        const snapshot = batch.productStatusSnapshot('standalone', { localUiSelection: true, selectedBatchId });
        return { ...snapshot, current: { engine_ready: true, local_intake_pending: false, ...snapshot.recovery } };
      },
      readConfiguredResultRoot: () => process.env.EU_PRIVACY_RESULT_ROOT,
      latestProductResultDirectory: batch.latestProductResultDirectory,
      fs,
      pendingStandaloneTerminalNoticeGeneration: (token) => pendingNotice?.token === token ? pendingNotice.generation : null,
      acknowledgeStandaloneTerminalNotice(generation, token) {
        if (pendingNotice?.generation !== generation || pendingNotice.token !== token) return false;
        notices.push({ generation, token }); pendingNotice = null; return true;
      },
      startLocalIntakeExecutor(_queue, _profile, options) {
        reservation.releaseIntake(options.intakeReservationId);
        return { ok: true, local_intake_pending: true, batch_token: 'd'.repeat(64),
          ipcAcknowledgement: Promise.resolve() };
      }
    });
    const observing = new StandaloneApplicationService({ dependencies: observedDependencies });
    const activeState = observing.status();
    assert.equal(activeState.state, 'processing');
    assert.equal(activeState.processing_mode, 'markdown-only');
    assert.equal(activeState.selected_count, 3);
    assert.equal(activeState.result_count, 0);
    assert.equal(activeState.presentation_generation, undefined);
    assert.equal(observing.uiContext().latest_result_folder, '', 'an active older run never borrows the newer result path');
    assert.throws(() => observing.resolveResults(), code('STANDALONE_RESULTS_MISSING'));
    const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
    const { publishMarkdownArtifact } = require('../plugins/data-secure/server/standalone/markdown-store');
    const terminalMarkdown = batch._test.readStateForMaintenance(markdown.token);
    for (const item of terminalMarkdown.items) {
      const artifact = await publishMarkdownArtifact(createMarkdownExtraction({ source_type: 'txt',
        markdown: 'Synthetischer konvertierter Testinhalt', coverage: { status: 'complete', reason_codes: [] } }), `dm_${item.id}`);
      Object.assign(item, artifact, { status: 'released' });
    }
    batch._test.writeState(terminalMarkdown);
    assert.equal(exportsApi.exportCompletedState(terminalMarkdown).available, true);
    assert.equal(batch.releaseLocalBatchExecutor(markdown.token, process.pid), true);
    const markdownRun = exportsApi.visibleExportDirectory(markdown.token);
    const terminalState = observing.status();
    assert.equal(terminalState.state, 'results_available');
    assert.equal(terminalState.processing_mode, 'markdown-only');
    assert.equal(terminalState.selected_count, 3);
    assert.equal(terminalState.completed_count, 3);
    assert.equal(terminalState.result_count, 3);
    assert.equal(terminalState.resumable, false, 'other paused histories cannot replace this terminal presentation');
    assert.equal(terminalState.presentation_generation, undefined);
    assert.equal(observing.acknowledgeTerminalPresented(70).acknowledged, false);
    assert.equal(observing.uiContext().latest_result_folder, markdownRun);
    assert.equal(observing.resolveResults().local_path, markdownRun);
    assert.throws(() => observing.resolveLedger(), code('STANDALONE_LEDGER_MISSING'));
    assert.equal(history.find(markdown.token).ledger_available, false);
    pendingNotice = { token: markdown.token, generation: 71 };
    assert.equal(observing.status().presentation_generation, 71);
    assert.equal(observing.acknowledgeTerminalPresented(71).acknowledged, true);
    assert.deepEqual(notices, [{ token: markdown.token, generation: 71 }]);
    assert.doesNotMatch(JSON.stringify(terminalState), /observed_batch_id|batch_token|[a-f0-9]{64}/u);
    const freshDefault = new StandaloneApplicationService({ dependencies: observedDependencies });
    assert.equal(freshDefault.status().selected_count, 0,
      'without active work or an explicit History choice, an earlier run never becomes current after restart');
    assert.equal(freshDefault.status().state, 'ready');
    assert.equal(freshDefault.uiContext().latest_result_folder, '',
      'older result folders remain available only through their exact History row');
    const nextSource = path.join(base, 'next-source.txt');
    fs.writeFileSync(nextSource, 'Synthetischer nächster Lauf');
    await observing.admitSelectedSources([nextSource]);
    await observing.startAdmittedBatch({ profile: 'auto', processingMode: 'markdown-and-anonymize' });
    assert.equal(observing.observedBatchId, 'd'.repeat(64),
      'a new intake binds the exact returned run even when it finishes before the first status poll');
    assert.equal(observing.status().selected_count, 1,
      'a just-confirmed run that is already terminal remains current before the first poll');
    assert.equal(observing.uiContext().latest_result_folder, originalRun,
      'the fast terminal run resolves its own result instead of a newer historical folder');

    // Restart and source retention do not lose summary or original destination.
    const retiredJournal = path.join(batch._test.batchRoot(), `${completed.token}.json`);
    fs.renameSync(retiredJournal, `${retiredJournal}.retired-test-fixture`);
    const replacementResultRoot = path.join(base, 'new-results'); fs.mkdirSync(replacementResultRoot);
    process.env.EU_PRIVACY_RESULT_ROOT = replacementResultRoot;
    history = makeHistory();
    assert.equal(history.resolveResults(completed.token).local_path, originalRun);
    assert.equal(history.find(completed.token).result_location, 'available');
    assert.equal(history.find(completed.token).resumable, false);
    assert.equal(history.find(completed.token).result_count, 1);
    assert.equal(fs.readdirSync(replacementResultRoot).length, 0, 'history never creates missing output folders');
    const restarted = JSON.parse(execFileSync(process.execPath, ['-e', `
      const batch = require('./plugins/data-secure/server/gateway/batch');
      const exportsApi = require('./plugins/data-secure/server/gateway/result-export');
      const {createRunHistory} = require('./plugins/data-secure/server/standalone/run-history');
      const history = createRunHistory({readStates:batch.readStandaloneHistoryStates,
        readExports:exportsApi.readStandaloneExportHistory,recoverableStates:batch.standaloneRecoverableStates,
        liveExecutor:batch._test.liveLocalExecutor});
      process.stdout.write(JSON.stringify(history.resolveResults('${completed.token}')));
    `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true }));
    assert.equal(restarted.local_path, originalRun, 'a fresh process resolves the persisted original run');

    // Missing mapping and replaced run folder fail individually; never select
    // the second/newest run and never recreate the user's removed files.
    fs.renameSync(path.join(originalRun, 'DataSecure-Zuordnung.csv'), path.join(originalRun, 'mapping-retired-test-fixture.csv'));
    assert.equal(history.find(completed.token).ledger_available, false);
    assert.throws(() => history.resolveLedger(completed.token), code('STANDALONE_LEDGER_MISSING'));
    fs.renameSync(originalRun, `${originalRun}-retired-test-fixture`);
    assert.equal(history.find(completed.token).result_location, 'missing', 'a deleted original folder differs from a replacement');
    assert.throws(() => history.resolveResults(completed.token), code('STANDALONE_RESULTS_MISSING'));
    fs.mkdirSync(originalRun);
    assert.equal(history.find(completed.token).result_location, 'unsafe', 'a new directory at the same path never regains the old binding');
    assert.throws(() => history.resolveResults(completed.token), code('STANDALONE_RESULTS_MISSING'));
    assert.equal(fs.readdirSync(originalRun).length, 0);

    const expired = stateFixture('f', 4000, { expires_at: new Date(now - 1000).toISOString() });
    assert.equal(history.find(expired.token).resumable, false);
    assert.throws(() => batch.continueStandaloneBatch(expired.token), code('STANDALONE_NOTHING_TO_CONTINUE'));
    assert.equal(fs.existsSync(path.join(batch._test.batchRoot(), `${expired.token}.json`)), true, 'history and refused resume are read-only for expired journals');

    // Existing export plans without a surviving journal or history summary
    // still produce one honest, stable, non-resumable row.
    const orphan = completeFixture('8', 5000);
    const orphanJournal = path.join(batch._test.batchRoot(), `${orphan.token}.json`);
    fs.renameSync(orphanJournal, `${orphanJournal}.retired-test-fixture`);
    const orphanSummary = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `${orphan.token}.json`);
    fs.renameSync(orphanSummary, `${orphanSummary}.retired-test-fixture`);
    const orphanRow = history.history().entries.find((entry) => entry.created_at === new Date(now + 5000).toISOString().replace(/\.\d{3}Z$/u, '.000Z'));
    assert.ok(orphanRow);
    assert.notEqual(orphanRow.batch_id, orphan.token);
    assert.equal(orphanRow.resumable, false);
    assert.equal(makeHistory().find(orphanRow.batch_id).batch_id, orphanRow.batch_id);

    // History counts and review readiness must use the same terminal meaning
    // as live progress. A stopped source with an unfinished mapping is open.
    const historyCases = [
      [{ status: 'stopped', local_mapping_exported: false }],
      [{ status: 'released' }, { status: 'stopped', local_mapping_exported: false }],
      [{ status: 'released' }, { status: 'stopped', local_mapping_exported: true }],
      [{ status: 'stopped' }],
      [{ status: 'released' }, { status: 'deferred_review' }],
      ...['pending', 'retryable', 'processing', 'delivery_pending', 'mapping_pending', 'preflight_mapping_pending']
        .map(status => [{ status: 'released' }, { status: 'deferred_review' }, { status }]),
      [{ status: 'deferred_review' }, { status: 'stopped', local_mapping_exported: false }],
      [{ status: 'released' }, { status: 'stopped', local_mapping_exported: false },
        { status: 'deferred_review' }, { status: 'delivery_pending' }, { status: 'mapping_pending' },
        { status: 'preflight_mapping_pending' }, { status: 'retryable' }, { status: 'pending' }]
    ];
    for (const items of historyCases) {
      const candidate = stateFixture('7', 6000, { items: items.map((item, index) => ({
        id: (700 + index).toString(16).padStart(32, '0'), name: 'synthetic.txt', ...item,
        ...(item.status === 'preflight_mapping_pending' ? { checkpoint: 'source_preflight_rejected',
          error_code: 'SOURCE_CONTAINER_CORRUPT', local_mapping_exported: false } : {})
      })) });
      const progress = batch._test.publicProgress(batch._test.readStateForMaintenance(candidate.token), { skipResultProjection: true });
      const row = makeHistory().find(candidate.token);
      assert.deepEqual([row.selected_count, row.result_count, row.failed_count, row.completed_count, row.review_count],
        [progress.batch_total, progress.released, progress.stopped, progress.completed, progress.deferred_review], JSON.stringify(items));
      assert.equal(row.resumable, !progress.complete, JSON.stringify(items));
      assert.equal(row.status, progress.complete
        ? (progress.released > 0 ? 'export_pending' : 'completed_without_results') :
        progress.batch_phase === 'awaiting_local_review' ? 'review_required' : 'stopped', JSON.stringify(items));
      assert.equal(row.results_available, false); assert.equal(row.ledger_available, false);
      const saved = JSON.parse(fs.readFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `${candidate.token}.json`), 'utf8'));
      assert.equal(saved.complete, progress.complete);
      assert.equal(saved.failed_count, progress.stopped); assert.equal(saved.completed_count, progress.completed);
      const details = makeHistory().failures(candidate.token);
      const problems = items.filter(item => ['stopped', 'preflight_mapping_pending', 'mapping_pending', 'retryable'].includes(item.status));
      assert.equal(details.total, problems.length, 'an unfinished local mapping must not conceal a stopped filename');
      if (items.some(item => item.status === 'stopped' && item.local_mapping_exported === false)) {
        assert.ok(details.files.some(file => file.name === 'synthetic.txt' && file.stage === 'mapping_pending'));
        assert.ok(row.problem_count > row.failed_count, 'the local row can offer details without corrupting completed counts');
      }
      if (problems.length > 0 && items.some(item => item.status === 'pending')) {
        assert.equal(details.pending_total, items.filter(item => item.status === 'pending').length);
        assert.deepEqual(details.pending_files, [{ name: 'synthetic.txt' }]);
      }
      assert.doesNotMatch(JSON.stringify(saved), /synthetic\.txt/u, 'failure names never enter the content-free history summary');
    }
    const activeHistory = stateFixture('7', 6000, { items: [{ id: '7'.repeat(32), name: 'synthetic.txt', status: 'pending' },
      { id: '6'.repeat(32), name: 'synthetic-review.txt', status: 'deferred_review' }] });
    assert.deepEqual(makeHistory().reviewTargets(activeHistory.token), ['synthetic-review.txt'],
      'a review-process failure names only the pending review files from its exact run');
    assert.deepEqual(makeHistory().reviewTargets('8'.repeat(64)), [],
      'a different run never borrows the failed review target list');
    assert.equal(batch.claimLocalBatchExecutor(activeHistory.token, process.pid).ok, true);
    try {
      const activeRow = makeHistory().find(activeHistory.token);
      assert.equal(activeRow.status, 'processing'); assert.equal(activeRow.resumable, false);
      assert.equal(activeRow.completed_count, 0); assert.equal(activeRow.review_count, 1);
    } finally { assert.equal(batch.releaseLocalBatchExecutor(activeHistory.token, process.pid), true); }

    identityLedger.capture(completedTwo.token, completedTwo.items[0].id, completedTwo.items[0].package_id,
      [{ pseudonym: '[PERSON_002]', original: 'Älterer synthetischer Name' }]);
    const olderIdentity = identityLedger.materialize(completedTwo).local_path;
    for (let index = 0; index < 25; index++) {
      const token = (1000 + index).toString(16).padStart(64, '0');
      const state = { ...older, token, created_at: new Date(now + 10000 + index * 1000).toISOString() };
      batch._test.writeState(state);
    }
    snapshot = makeHistory().history();
    assert.equal(snapshot.entries.length, 20);
    assert.equal(snapshot.entries[0].batch_id, (1024).toString(16).padStart(64, '0'));
    assert.equal(snapshot.entries.at(-1).batch_id, (1005).toString(16).padStart(64, '0'));
    assert.throws(() => history.resolveResults(completedTwo.token), code('STANDALONE_HISTORY_MISSING'), 'out-of-window stale IDs fail closed');
    assert.equal(fs.existsSync(olderIdentity), true, 'last-20 history never deletes an older human mapping');
    assert.equal(path.dirname(path.dirname(olderIdentity)), identityLedger.resolveDirectory(),
      'the private directory action keeps older mappings locally reachable');
    assert.equal(fs.existsSync(secondRun), true, 'last-20 retention never deletes visible results');
    process.stdout.write('STANDALONE HISTORY PASS\n');
  } finally {
    if (path.dirname(base) !== temporaryRoot || !path.basename(base).startsWith('datasecure-standalone-history-')) throw new Error('TEST_CLEANUP_TARGET_INVALID');
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
