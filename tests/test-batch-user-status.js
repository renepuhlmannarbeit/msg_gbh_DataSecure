'use strict';

const { createSuite } = require('./helpers');
const { _test } = require('../plugins/data-secure/server/gateway/batch');

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
    ['processing_local_document', 'wait_for_current_document', /Lokale Verarbeitung läuft/],
    ['awaiting_delivery_acknowledgement', 'read_and_confirm_result', /Ergebnis wird sicher bereitgestellt/],
    ['awaiting_explicit_resume', 'resume_batch', /Stapel angehalten/],
    ['awaiting_local_review', 'review_local_decisions', /Lokale Prüfung erforderlich/],
    ['complete', 'open_local_overview', /Stapel abgeschlossen/]
  ];
  for (const [phase, nextAction, text] of cases) {
    const result = _test.batchUserStatus(progress({
      batch_phase: phase,
      complete: phase === 'complete'
    }));
    assert.strictEqual(result.next_action, nextAction);
    assert.match(result.user_status, text);
    assert.match(result.user_status, /47 von 100|45 erfolgreich vorbereitet/);
    assert.doesNotMatch(result.user_status, /Musterfrau|C:\\|\.docx/i);
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
  assert.match(result.user_status, /1 erfolgreich vorbereitet, 1 sicher gestoppt/);
  assert.doesNotMatch(JSON.stringify(result), /Erika|Musterfrau|Kundenakte|\.docx/i);
});

test('an unknown persisted phase never falls through to processing another document', () => {
  const result = _test.batchUserStatus(progress({ batch_phase: 'unexpected_future_phase' }));
  assert.strictEqual(result.next_action, 'check_privacy_status');
  assert.match(result.user_status, /Status ist unklar.*keine weitere Datei verarbeitet/i);
  assert.doesNotMatch(result.user_status, /Musterfrau|C:\\|\.docx/i);
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
