'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Standalone display-only workflow projection');
const { projectRun, failureAdvice, conversionSummary, validateConversionFeedback } = require('../apps/datasecure-standalone/frontend/workflow-presentation');
const id = 'a'.repeat(64);
const processor = extra => projectRun({ batch_id: id, processing_mode: 'markdown-and-anonymize',
  source: 'processor', selected_count: 3, completed_count: 0, failed_count: 0, ...extra });
const documents = extra => projectRun({ batch_id: id, processing_mode: 'markdown-and-anonymize',
  source: 'documents', fresh: true, processing_complete: true, document_count: 3, approved_count: 0, problem_count: 0, ...extra });

test('invalid identity, purpose and surface cannot produce a workflow', () => {
  for (const extra of [{ batch_id: '../old' }, { processing_mode: 'other' }, { source: 'untrusted' }]) assert.equal(processor(extra), null);
});
for (const state of ['preparing', 'processing']) test(`${state} is activity, not approval`, () => {
  const result = processor({ state }); assert.equal(result.phase, 'processing'); assert.equal(result.busy, true);
  assert.equal(result.stages.filter(row => row.status === 'done').length, 0); assert.match(result.next, /momentan nichts/u);
});
test('pause request explains the exact file boundary', () => {
  assert.match(processor({ state: 'processing', pause_requested: true }).next, /aktuelle Datei.*danach beginnt keine weitere/u);
});
for (const state of ['paused', 'stopped', 'failed', 'blocked', 'completed_without_results', 'export_pending', 'export_abandoned']) test(`${state} never completes future phases`, () => {
  assert.equal(processor({ state }).stages.filter(row => row.status === 'done').length, 0);
});
test('abandoned visible export remains explicitly incomplete', () => {
  const result = processor({ state: 'export_abandoned', completed_count: 3 });
  assert.equal(result.phase, 'delivery_abandoned');
  assert.match(result.next, /keine vollständige Ergebnis- oder KI-Freigabe/u);
});
test('a partial review cannot claim all source extraction complete', () => {
  const result = processor({ source: 'review', completed_count: 1 }); assert.equal(result.phase, 'review'); assert.equal(result.stages[0].status, 'pending');
});
test('opted-in raw OCR contact review names the purpose without implying anonymization or document approval', () => {
  const pending = processor({ state: 'review_required', processing_mode: 'markdown-only', selected_count: 133,
    completed_count: 115 });
  assert.match(pending.heading, /OCR-Kontaktprüfung offen/u);
  assert.match(pending.next, /beim Start gewählte Prüfung/u);
  const open = processor({ source: 'review', processing_mode: 'markdown-only', review_phase: 'ready', selected_count: 133,
    completed_count: 115 });
  assert.match(open.heading, /OCR-Kontaktprüfung dieses Laufs/u);
  assert.match(open.next, /Originalbild.*vormerken/u);
  assert.equal(open.stages.some(row => row.status === 'done'), false);
});
test('technical completion is not a human approval or KI export', () => {
  const result = processor({ state: 'results_available', completed_count: 3 });
  assert.equal(result.phase, 'documents'); assert.equal(result.stages[2].status, 'current'); assert.equal(result.stages[3].status, 'pending');
  assert.match(result.next, /noch keine menschliche Freigabe/u);
});
test('raw completion keeps optional correction and unmasked contents explicit', () => {
  const result = processor({ state: 'results_available', processing_mode: 'markdown-only', completed_count: 3 });
  assert.equal(result.stages.length, 3); assert.equal(result.stages[1].status, 'optional'); assert.match(result.next, /nicht anonymisiert/u);
});
test('stale, busy, corrupt or empty document states never imply completion', () => {
  for (const extra of [{ fresh: false }, { busy: true }, { approved_count: 4 }, { document_count: 0, approved_count: 0 }]) {
    const result = documents(extra); assert.equal(result.stages.filter(row => row.status === 'done').length, 0);
  }
});
test('partial approvals show actual available counts', () => {
  const result = documents({ approved_count: 2 }); assert.equal(result.phase, 'documents'); assert.match(result.counts, /^2 von 3/u);
});
test('all current approvals require a separate explicit export', () => {
  const result = documents({ approved_count: 3 }); assert.equal(result.phase, 'approved'); assert.equal(result.stages[3].status, 'current'); assert.match(result.next, /ausdrücklich bestätigen/u);
});
test('dirty correction prevents the previously confirmed export from appearing finished', () => {
  assert.equal(documents({ approved_count: 3, dirty: true, export_complete: true }).phase, 'editing');
});
test('lost export receipt takes precedence over a completed copy claim', () => {
  assert.equal(documents({ approved_count: 3, export_complete: true, export_pending: true }).phase, 'export_pending');
});
test('only an explicitly confirmed full current clean selection completes export', () => {
  assert.equal(documents({ approved_count: 3, export_complete: true }).phase, 'exported');
  assert.notEqual(documents({ approved_count: 3, export_complete: true, problem_count: 1 }).phase, 'exported');
});
test('invalid counters and unknown totals do not manufacture progress', () => {
  for (const extra of [{ completed_count: 201 }, { failed_count: -1 }, { completed_count: 3, failed_count: 4 }]) assert.equal(processor({ state: 'processing', ...extra }).phase, 'unknown');
  assert.match(processor({ selected_count: 0, state: 'processing' }).counts, /wird abgeglichen/u);
});
test('guidance preserves OS facts and never recommends a security bypass', () => {
  assert.match(failureAdvice('CONVERSION_EXECUTABLE_DENIED'), /IT prüfen.*nicht deaktivieren/u);
  assert.match(failureAdvice('CONVERSION_TERMINATION_UNCONFIRMED'), /Nicht erneut starten/u);
  assert.match(failureAdvice('SOURCE_ENCRYPTED_UNSUPPORTED'), /ungeschützte Kopie/u);
  assert.match(failureAdvice('UNKNOWN_CAUSE'), /Ursache.*nicht bestätigt/u);
  assert.match(failureAdvice('MARKDOWN_CONTENT_TRANSFORM_FAILED'), /separaten Kopie.*keine unklar begrenzten Inhalte/u);
});
test('available document bodies alone do not prove the whole run complete', () => {
  const result = documents({ document_count: 1, approved_count: 1, export_complete: true, processing_complete: false });
  assert.notEqual(result.phase, 'exported');
  assert.equal(result.stages[0].status, 'pending');
  assert.match(result.next, /Laufabschluss.*nicht bestätigt/u);
});
test('raw summary requires consistent current purpose, complete counts and available results', () => {
  const feedback = { schema: 'datasecure-conversion-feedback/1', ocr_enabled: false, selected_count: 3, result_count: 2,
    not_converted_count: 1, ocr_omitted_count: 1, error_count: 0, content_notice_count: 1, pending_count: 0, complete: true };
  const owner = { processing_mode: 'markdown-only', status: 'results_available', selected_count: 3, result_count: 2, failed_count: 1,
    result_location: 'available', conversion_feedback: feedback };
  assert.match(conversionSummary(owner).heading, /mit Hinweisen/u);
  assert.match(conversionSummary(owner).description, /keine Freigabe erforderlich/u);
  for (const extra of [{ processing_mode: 'markdown-and-anonymize' }, { status: 'export_pending' },
    { status: 'paused' }, { resumable: true }, { result_location: 'missing' }, { result_count: 1 }, { failed_count: -1 },
    { conversion_feedback: { ...feedback, ocr_enabled: true } }, { conversion_feedback: { ...feedback, content_notice_count: 3 } },
    { conversion_feedback: { ...feedback, arbitrary: true } }]) assert.equal(conversionSummary({ ...owner, ...extra }), null);
  assert.equal(validateConversionFeedback({ ...feedback, pending_count: 1 }), null);
  const result = processor({ ...owner, status: undefined, state: 'results_available', completed_count: 3 });
  assert.equal(result.phase, 'converted'); assert.match(result.heading, /mit Hinweisen/u);
  const allOmitted = processor({ processing_mode: 'markdown-only', state: 'completed_without_results', selected_count: 1,
    completed_count: 1, result_count: 0, failed_count: 1,
    conversion_feedback: { ...feedback, selected_count: 1, result_count: 0, content_notice_count: 0 } });
  assert.equal(allOmitted.phase, 'converted_without_results'); assert.match(allOmitted.heading, /mit Hinweisen/u);
  assert.equal(allOmitted.stages[2].status, 'pending');
});

test('raw copy consent never becomes a claim of human text quality or a mandatory approval phase', () => {
  for (const approved of [0, 1, 3]) {
    const result = documents({ processing_mode: 'markdown-only', approved_count: approved, expected_omission_count: 2 });
    assert.equal(result.phase, 'documents'); assert.equal(result.stages[1].status, 'optional');
    assert.match(result.counts, /3 Markdown-Dateien verfügbar/u); assert.doesNotMatch(result.counts, /textgeprüft|freigegeben/u);
    assert.match(result.next, /kein technischer Fehler/u);
  }
});

test('completed raw contact review names its limited purpose and no mandatory document approval', () => {
  const result = processor({ source: 'review', processing_mode: 'markdown-only', review_phase: 'complete', completed_count: 3 });
  assert.equal(result.phase, 'review_complete');
  assert.match(result.heading, /OCR-Kontaktprüfung abgeschlossen/u);
  assert.match(result.next, /optional|freiwillig/u);
  assert.doesNotMatch(result.next, /Freigabe und Export|Dokumentprüfung.*geöffnet/u);
  const anonymized = processor({ source: 'review', review_phase: 'complete', completed_count: 3 });
  assert.match(anonymized.next, /Dokumentprüfung.*geöffnet.*Freigabe/u);
});
test('raw follow-up contacts and waiting are not document approval or full OCR verification', () => {
  for (const phase of ['continue', 'waiting']) {
    const result = processor({ source: 'review', processing_mode: 'markdown-only', review_phase: phase, completed_count: 1 });
    assert.match(result.next, /Kontakt/u);
    assert.doesNotMatch(result.next, /Dokumentfreigabe|OCR.*vollständig geprüft/u);
    assert.notEqual(result.phase, 'review_complete');
  }
});

done();
