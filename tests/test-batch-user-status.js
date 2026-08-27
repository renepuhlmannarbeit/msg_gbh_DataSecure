'use strict';

const { createSuite } = require('./helpers');
const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { evidenceRecord } = require('../plugins/data-secure/server/gateway/batch-evidence');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('Batch user status');

function progress(overrides = {}) {
  return {
    batch_total: 100,
    completed: 47,
    released: 45,
    stopped: 2,
    complete: false,
    batch_phase: 'ready_for_next_document',
    ...overrides
  };
}

test('each server phase has a short German next-step message without source data', () => {
  const cases = [
    ['ready_for_next_document', 'process_next_document', /Stapel bereit/],
    ['processing_local_batch', 'wait_for_local_batch', /Lokale Stapelverarbeitung läuft/],
    ['processing_local_document', 'wait_for_current_document', /Lokale Verarbeitung läuft/],
    ['awaiting_delivery_acknowledgement', 'read_and_confirm_result', /Ergebnis wird sicher bereitgestellt/],
    ['awaiting_explicit_resume', 'resume_batch', /Stapel angehalten/],
    ['awaiting_local_review', 'review_local_decisions', /Lokale Prüfung erforderlich/],
    ['awaiting_local_mapping_repair', 'local_mapping_repair', /Ergebnis lokal sicher erstellt/],
    ['complete', 'open_local_overview', /Stapel abgeschlossen/]
  ];
  for (const [phase, nextAction, text] of cases) {
    const result = _test.batchUserStatus(progress({
      batch_phase: phase,
      complete: phase === 'complete'
    }));
    assert.strictEqual(result.next_action, nextAction);
    assert.match(result.user_status, text);
    assert.match(result.user_status, /47 von 100|45 Ergebnisse bereitgestellt/);
    assert.doesNotMatch(result.user_status, /Musterfrau|C:\\|\.docx/i);
  }
});

test('every supported status message keeps an estimated time bounded and content-free', () => {
  for (const phase of [
    'ready_for_next_document', 'processing_local_batch', 'processing_local_document'
  ]) {
    const result = _test.batchUserStatus(progress({
      batch_phase: phase,
      estimated_remaining_seconds: 119
    }));
    assert.match(result.user_status, /Gemessene Restzeit.*2 Minuten/);
    assert.doesNotMatch(result.user_status, /Musterfrau|C:\\|\.docx|[A-Fa-f0-9]{64}/i);
  }
});

test('public progress exposes only the bounded user status and no item name', () => {
  const result = _test.publicProgress({
    token: 'a'.repeat(64),
    items: [
      { name: 'Erika-Musterfrau-Vertrag.docx', status: 'released' },
      { name: 'Kundenakte.docx', status: 'stopped' }
    ]
  });
  assert.strictEqual(result.next_action, 'open_local_overview');
  assert.match(result.user_status, /1 Ergebnisse bereitgestellt, 1 sicher gestoppt/);
  assert.deepStrictEqual(result.result_grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 2 });
  assert.strictEqual(result.result_grades_verified, false);
  assert.doesNotMatch(JSON.stringify(result), /Erika|Musterfrau|Kundenakte|\.docx/i);
});

test('durable terminal grades avoid package reopens but a changed state fails closed', () => {
  const documentResult = releasedDocumentResult({
    parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  const state = {
    schema: 'datasecure-batch/2',
    token: '9'.repeat(64),
    created_at: '2026-08-27T08:00:00.000Z',
    profile: 'general',
    remove_images: false,
    items: [{ status: 'released', package_id: `ds_${'8'.repeat(32)}`, document_result: documentResult }]
  };
  const receiptId = '7'.repeat(32);
  const record = evidenceRecord(state, '2026-08-27T08:01:00.000Z', receiptId, {
    publishedPackageRecord: () => ({ state: 'verified', document_result: documentResult })
  });
  state.terminal_evidence = {
    schema: 'datasecure-batch-terminal-evidence/2', status: 'exported', receipt_id: receiptId, record
  };
  let packageReads = 0;
  const progressFacade = createBatchProgress({
    deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending', liveLocalExecutor: () => false,
    publishedPackageRecord: () => { packageReads++; throw new Error('PACKAGE_REOPENED'); }
  });
  const stable = progressFacade.publicProgress(state);
  assert.strictEqual(stable.result_grades_verified, true);
  assert.strictEqual(packageReads, 0);

  state.items[0].document_result = { ...documentResult, grade: 'usable-with-omissions' };
  const changed = progressFacade.publicProgress(state);
  assert.strictEqual(changed.result_grades_verified, false);
  assert.strictEqual(changed.result_grade_counts.unavailable, 1);
  assert.strictEqual(packageReads, 0);
});

test('an unknown persisted phase never falls through to processing another document', () => {
  const result = _test.batchUserStatus(progress({ batch_phase: 'unexpected_future_phase' }));
  assert.strictEqual(result.next_action, 'check_privacy_status');
  assert.match(result.user_status, /Status ist unklar.*keine weitere Datei verarbeitet/i);
  assert.doesNotMatch(result.user_status, /Musterfrau|C:\\|\.docx/i);
});

test('an empty or malformed checkpoint is never reported as complete', () => {
  const result = _test.publicProgress({ token: 'e'.repeat(64), items: [] });
  assert.strictEqual(result.batch_total, 0);
  assert.strictEqual(result.completion_percent, 0);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.awaiting_resume, false);
  assert.strictEqual(result.batch_phase, 'invalid_local_state');
  assert.strictEqual(result.next_action, 'check_privacy_status');
});

test('a preflight mapping checkpoint is visible only as aggregate local repair work', () => {
  const result = _test.publicProgress({
    token: 'f'.repeat(64),
    items: [
      { name: 'Private-Defekt.docx', status: 'preflight_mapping_pending' },
      { name: 'Weiter.txt', status: 'pending' }
    ]
  });
  assert.strictEqual(result.mapping_pending, 1);
  assert.strictEqual(result.stopped, 0);
  assert.strictEqual(result.remaining, 1);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.next_position, 2);
  assert.doesNotMatch(JSON.stringify(result), /Private|Defekt|Weiter|\.docx|\.txt/u);
});

test('a durable stop is non-terminal until its permanent local mapping exists', () => {
  const result = _test.publicProgress({
    token: '1'.repeat(64),
    items: [{ name: 'Private-Defekt.docx', status: 'stopped', local_mapping_exported: false }]
  });
  assert.strictEqual(result.mapping_pending, 1);
  assert.strictEqual(result.stopped, 0);
  assert.strictEqual(result.completed, 0);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.batch_phase, 'awaiting_local_mapping_repair');
  assert.doesNotMatch(JSON.stringify(result), /Private|Defekt|\.docx/u);
});

test('rest time is a bounded median from at least three local processing samples', () => {
  const result = _test.publicProgress({
    token: 'b'.repeat(64),
    items: [
      { name: 'Anna-Muster.txt', status: 'released', processing_duration_ms: 1000 },
      { name: 'Berta-Beispiel.txt', status: 'released', processing_duration_ms: 3000 },
      { name: 'Carla-Test.txt', status: 'stopped', processing_duration_ms: 9000 },
      { name: 'Dora-Privat.txt', status: 'pending' },
      { name: 'Erika-Intern.txt', status: 'pending' }
    ]
  });
  assert.strictEqual(result.estimated_remaining_seconds, 6);
  assert.match(result.user_status, /Gemessene Restzeit.*unter 1 Minute/);
  assert.doesNotMatch(JSON.stringify(result), /Anna|Muster|Berta|Beispiel|\.txt/i);
});

test('rest time remains absent while a human decision or explicit recovery is pending', () => {
  const items = [
    { status: 'released', processing_duration_ms: 1000 },
    { status: 'released', processing_duration_ms: 2000 },
    { status: 'stopped', processing_duration_ms: 3000 },
    { status: 'pending' },
    { status: 'retryable' }
  ];
  assert.strictEqual(_test.publicProgress({ token: 'c'.repeat(64), items }).estimated_remaining_seconds, null);
  items[4] = { status: 'deferred_review' };
  assert.strictEqual(_test.publicProgress({ token: 'd'.repeat(64), items }).estimated_remaining_seconds, null);
});

done();
