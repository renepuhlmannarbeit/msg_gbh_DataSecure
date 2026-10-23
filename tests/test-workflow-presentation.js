'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Standalone display-only workflow projection');
const { projectRun, failureAdvice, conversionSummary, validateConversionFeedback, contentNoticeSummary, resultPublication } = require('../apps/datasecure-standalone/frontend/workflow-presentation');
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
test('terminal run without results is complete, but has no approval or export', () => {
  const result = processor({ state: 'completed_without_results', selected_count: 2, completed_count: 2,
    result_count: 0, failed_count: 2 });
  assert.equal(result.phase, 'completed_without_results');
  assert.match(result.heading, /beendet ohne Ergebnisdateien/u);
  assert.match(result.next, /nichts freizugeben oder zu exportieren/u);
  assert.doesNotMatch(result.next, /noch nicht abgeschlossen/u);
  assert.equal(result.stages[0].status, 'warning');
  assert.equal(result.stages[2].status, 'pending');
});
test('abandoned visible export remains explicitly incomplete', () => {
  const result = processor({ state: 'export_abandoned', completed_count: 3 });
  assert.equal(result.phase, 'delivery_abandoned');
  assert.match(result.next, /keine vollständige Freigabe zur Weitergabe/u);
});
for (const processing_mode of ['markdown-only', 'markdown-and-anonymize'])
  test(processing_mode + ': confirmed review deferral is an open user step, not background activity or completion', () => {
    const value = processor({ source: 'review', processing_mode, review_phase: 'deferred' });
    assert.equal(value.phase, 'review_deferred'); assert.equal(value.busy, false);
    assert.match(value.heading, /vertagt/u); assert.match(value.next, /im Verlauf ausdrücklich fortsetzen/u);
    assert.doesNotMatch(value.heading + ' ' + value.next, /arbeitet weiter|werden vorbereitet|bitte warten/iu);
    assert.equal(value.stages[1].status, 'current');
    assert.equal(value.stages.slice(2).some(stage => stage.status === 'done'), false);
    if (processing_mode === 'markdown-only') {
      assert.match(value.next, /nicht anonymisiert/u); assert.doesNotMatch(value.next, /Dokumentfreigabe/u);
    } else assert.match(value.next, /Weder Dokumentfreigabe noch Export sind damit bestätigt/u);
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
test('technical completion exposes result files without claiming a human approval or additional copy', () => {
  const result = processor({ state: 'results_available', completed_count: 3 });
  assert.equal(result.phase, 'results_ready'); assert.equal(result.stages[2].status, 'done'); assert.equal(result.stages[3].status, 'optional');
  assert.match(result.heading, /Anonymisierungslauf abgeschlossen/u);
  assert.match(result.next, /Ergebnisordner öffnen.*keine zusätzliche Freigabe oder Exportbestätigung/u);
});

test('successful anonymization keeps source coverage hints separate from completion and approval', () => {
  const value = { state: 'results_available', completed_count: 3, result_count: 3,
    content_notice_count: 2, content_notice_breakdown_complete: true };
  const result = processor(value);
  assert.match(result.heading, /abgeschlossen mit Hinweisen/u);
  assert.match(result.next, /2 erstellte Dateien.*Inhaltshinweise/u);
  assert.equal(result.stages[0].status, 'warning');
  assert.equal(result.stages[2].status, 'done');
  const clean = processor({ ...value, content_notice_count: 0 });
  assert.equal(clean.heading, 'Anonymisierungslauf abgeschlossen');
});

test('old or malformed coverage summaries cannot prove absence of source hints', () => {
  const owner = { processing_mode: 'markdown-and-anonymize', result_count: 3,
    content_notice_count: 0, content_notice_breakdown_complete: true };
  assert.equal(contentNoticeSummary(owner).attention, false);
  for (const extra of [{ content_notice_count: undefined }, { content_notice_count: -1 },
    { content_notice_count: 4 }, { content_notice_count: '0' }, { content_notice_breakdown_complete: false }]) {
    const result = contentNoticeSummary({ ...owner, ...extra });
    assert.equal(result.complete, false); assert.equal(result.attention, true);
    assert.match(result.description, /nicht vollständig verfügbar/u);
  }
  assert.equal(contentNoticeSummary({ ...owner, processing_mode: 'markdown-only' }), null);
  assert.match(contentNoticeSummary({ ...owner, content_notice_count: 1, content_notice_breakdown_complete: false }).description,
    /^Mindestens 1 erstellte Datei/u);
});

test('automatic approvals of available files cannot close a still-running batch', () => {
  const incomplete = documents({ approved_count: 3, automatically_approved_count: 3, processing_complete: false });
  assert.equal(incomplete.heading, 'Verfügbare Ergebnisse ansehen (optional)');
  assert.match(incomplete.next, /Laufabschluss ist noch nicht bestätigt/u);
  const complete = documents({ approved_count: 3, automatically_approved_count: 3, review_policy: 'automatic-conservative' });
  assert.equal(complete.heading, 'Anonymisierte Ergebnisse bereit');
  assert.match(complete.next, /nicht manuell geprüft/u);
  const status = processor({ state: 'results_available', completed_count: 3, review_policy: 'automatic-conservative' });
  assert.match(status.heading, /abgeschlossen/u); assert.match(status.next, /automatisch maskiert/u);
  assert.equal(status.stages[1].label, 'Fundstellen automatisch behandeln');
  assert.equal(status.stages[2].label, 'Ergebnisdateien bereitstellen');
  assert.equal(status.stages[3].status, 'optional', 'editing is not a mandatory post-run step');
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
test('a durable copy receipt is separate from a stale document projection', () => {
  for (const extra of [{ fresh: false }, { busy: true }, { fresh: false, busy: true }]) {
    const result = documents({ ...extra, confirmed_copy_count: 2 });
    assert.equal(result.phase, 'copy_confirmed');
    assert.match(result.next, /Kopie ist abgeschlossen.*Änderungen.*gesperrt/u);
    assert.equal(result.stages[0].status, 'pending', 'a copy receipt is not a full processing receipt');
  }
  for (const confirmed_copy_count of [-1, 0, 201, '2'])
    assert.notEqual(documents({ fresh: false, confirmed_copy_count }).phase, 'copy_confirmed');
  assert.notEqual(documents({ fresh: false, confirmed_copy_count: 2, export_pending: true }).phase, 'copy_confirmed');
});
test('optional old approvals do not prevent result availability', () => {
  const result = documents({ approved_count: 2 }); assert.equal(result.phase, 'results_ready'); assert.match(result.counts, /^3 Ergebnisdateien/u);
});
test('result availability does not demand a separate explicit export', () => {
  const result = documents({ approved_count: 3 }); assert.equal(result.phase, 'results_ready'); assert.equal(result.stages[3].status, 'optional'); assert.match(result.next, /keine zusätzliche Freigabe oder Exportbestätigung/u);
});
test('dirty correction prevents the previously confirmed export from appearing finished', () => {
  assert.equal(documents({ approved_count: 3, dirty: true, export_complete: true }).phase, 'editing');
});
test('an older pending copy is separate from current result availability', () => {
  assert.equal(documents({ approved_count: 3, export_complete: true, export_pending: true }).phase, 'results_ready');
});
test('a past export flag is not the normal completion condition', () => {
  assert.equal(documents({ approved_count: 3, export_complete: true }).phase, 'results_ready');
  assert.notEqual(documents({ approved_count: 3, export_complete: true, problem_count: 1 }).phase, 'exported');
});
test('invalid counters and unknown totals do not manufacture progress', () => {
  for (const extra of [{ completed_count: 201 }, { failed_count: -1 }, { completed_count: 3, failed_count: 4 }]) assert.equal(processor({ state: 'processing', ...extra }).phase, 'unknown');
  assert.match(processor({ selected_count: 0, state: 'processing' }).counts, /wird abgeglichen/u);
});
test('guidance preserves OS facts and never recommends a security bypass', () => {
  assert.match(failureAdvice('CONVERSION_EXECUTABLE_DENIED'), /IT prüfen.*nicht deaktivieren/u);
  assert.match(failureAdvice('CONVERSION_TERMINATION_UNCONFIRMED'), /Nicht erneut starten/u);
  for (const code of ['SOURCE_ENCRYPTED_UNSUPPORTED', 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED']) {
    const advice = failureAdvice(code);
    assert.match(advice, /Eine berechtigt entschlüsselte Kopie separat auswählen\./u);
    assert.match(advice, /Schutzrechte werden nicht umgangen; das Original bleibt unverändert\./u);
  }
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
    assert.equal(result.phase, 'results_ready'); assert.equal(result.stages[1].status, 'optional');
    assert.match(result.counts, /3 Ergebnisdateien/u); assert.doesNotMatch(result.counts, /textgeprüft|freigegeben/u);
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
  assert.match(anonymized.next, /Zum Abschluss desselben Laufs.*Keine zweite Dateiauswahl/u);
});
test('raw follow-up contacts and waiting are not document approval or full OCR verification', () => {
  for (const phase of ['continue', 'waiting']) {
    const result = processor({ source: 'review', processing_mode: 'markdown-only', review_phase: phase, completed_count: 1 });
    assert.match(result.next, /Kontakt/u);
    assert.doesNotMatch(result.next, /Dokumentfreigabe|OCR.*vollständig geprüft/u);
    assert.notEqual(result.phase, 'review_complete');
  }
});

const { historyReviewProjection } = require('../apps/datasecure-standalone/frontend/workflow-presentation');
const receiptEntry = extra => ({ batch_id: id, processing_mode: 'markdown-and-anonymize', status: 'results_available',
  selected_count: 2, result_count: 2, failed_count: 0, results_available: true, result_location: 'available', ...extra });
const receiptSummary = extra => ({ ok: true, local_ui_only: true, external_disclosure: false, available: true,
  processing_mode: 'markdown-and-anonymize', reviewable_count: 2, approved_count: 2, unavailable_count: 0,
  unclassified_source_count: 0, recorded_export_count: 1, current_exported_count: 2,
  pending_export_count: 0, pending_incomplete_count: 0, pending_confirmation_count: 0, ...extra });

test('bound history snapshot: current approvals and stored copy receipts improve the guide without inventing a byte recheck', () => {
  const result = historyReviewProjection(receiptEntry(), receiptSummary());
  assert.equal(result.phase, 'results_ready'); assert.equal(result.stages[2].status, 'done'); assert.equal(result.stages[3].status, 'optional');
  assert.match(result.next, /keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.doesNotMatch(result.next, /noch vergleichen und freigeben/u);
});
test('bound history snapshot: approvals, older copies and pending copies stay distinct', () => {
  const approved = historyReviewProjection(receiptEntry(), receiptSummary({ current_exported_count: 0 }));
  assert.equal(approved.phase, 'results_ready'); assert.equal(approved.stages[3].status, 'optional');
  const unapproved = historyReviewProjection(receiptEntry(), receiptSummary({ approved_count: 1 }));
  assert.equal(unapproved.phase, 'results_ready'); assert.equal(unapproved.stages[3].status, 'optional');
  const pending = historyReviewProjection(receiptEntry(), receiptSummary({ pending_export_count: 1, pending_confirmation_count: 1 }));
  assert.equal(pending.phase, 'results_ready'); assert.match(pending.next, /keine zusätzliche Freigabe oder Exportbestätigung/u);
});
test('bound history snapshot: active, paused, erroneous, incomplete, raw and mismatched summaries cannot improve a processor guide', () => {
  for (const change of [{status:'processing'},{status:'paused'},{status:'failed'},{resumable:true},{processing:true},
    {completion_pending:true},{failed_count:1},{selected_count:3},{result_count:1},{result_location:'unknown'},
    {results_available:false},{processing_mode:'markdown-only'},{batch_id:'old'}])
    assert.equal(historyReviewProjection(receiptEntry(change), receiptSummary()), null);
  for (const change of [{available:false},{local_ui_only:false},{external_disclosure:true},{reviewable_count:1},
    {unavailable_count:1},{unclassified_source_count:1},{not_processed_count:1},{approved_count:3},
    {recorded_export_count:0},{current_exported_count:3},{pending_export_count:1},
    {review_policy:'automatic-conservative',automatically_approved_count:2},{processing_mode:'markdown-only'}])
    assert.equal(historyReviewProjection(receiptEntry(), receiptSummary(change)), null);
  assert.equal(historyReviewProjection(receiptEntry(), null), null);
});
test('bound history snapshot: the automatic policy and source-coverage warnings remain visible after copy completion', () => {
  const result = historyReviewProjection(receiptEntry({review_policy:'automatic-conservative',
    content_notice_count:1,content_notice_breakdown_complete:true}),
    receiptSummary({review_policy:'automatic-conservative',automatically_approved_count:2}));
  assert.equal(result.phase,'results_ready'); assert.match(result.next,/automatisch maskiert, nicht manuell geprüft/u);
  assert.match(result.next,/Inhaltshinweise/u); assert.equal(result.stages[0].status,'warning');
});

test('bound history snapshot: 2 result revisions from 3 sources close approval and copy while retaining the journal-proven OCR warning',()=>{
  const {isAnonymizationOcrOmission}=require('../plugins/data-secure/server/standalone/conversion-feedback');
  const state={schema:'datasecure-batch/7',product_channel:'standalone',processing_mode:'markdown-and-anonymize',
    content_options:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},
    items:[{status:'released'},{status:'released'},{status:'stopped',error_code:'IMAGE_OCR_REQUIRED',local_mapping_exported:true}]};
  const omitted=state.items.filter(item=>isAnonymizationOcrOmission(state,item)).length;
  assert.equal(omitted,1);
  assert.equal(isAnonymizationOcrOmission(state,{...state.items[2],error_code:'INTERNAL_FAILURE'}),false);
  assert.equal(isAnonymizationOcrOmission({...state,content_options:{...state.content_options,scanOcr:true,imageOcr:true}},state.items[2]),false);
  const result=historyReviewProjection(receiptEntry({selected_count:3,completed_count:3,failed_count:1,
    expected_ocr_omission_count:omitted,failure_reason_breakdown_complete:true,
    content_notice_count:0,content_notice_breakdown_complete:true}),receiptSummary({not_processed_count:1}));
  assert.equal(result.phase,'results_ready');assert.match(result.counts,/2 Ergebnisdateien/u);
  assert.match(result.counts,/2 von 3 Quellen als Ergebnis verfügbar.*1 ohne OCR nicht umgewandelt/u);
  assert.match(result.next,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.match(result.next,/1 Bild- oder Scan-Datei.*nicht umgewandelt.*kein technischer Fehler/u);
  assert.match(result.next,/nicht verarbeitete Quelle ist nicht in den Ergebnisdateien enthalten/u);
  assert.equal(result.stages[0].status,'warning');assert.equal(result.stages[2].status,'done');assert.equal(result.stages[3].status,'optional');
  assert.doesNotMatch(result.next,/3 verfügbaren Ergebnisstände|3 von 3.*freigegeben/u);
});
test('bound history snapshot: 2-of-3 totals reject unknown, technical, legacy and incoherent failure ledgers',()=>{
  const entry=receiptEntry({selected_count:3,completed_count:3,failed_count:1,expected_ocr_omission_count:1,failure_reason_breakdown_complete:true});
  const data=receiptSummary({not_processed_count:1});
  for(const extra of [{failure_reason_breakdown_complete:false},{failure_reason_breakdown_complete:undefined},
    {expected_ocr_omission_count:0},{expected_ocr_omission_count:2},{expected_ocr_omission_count:'1'},{expected_ocr_omission_count:null},
    {privacy_stop_count:1},{privacy_stop_count:null},{selected_count:4},{completed_count:2},{result_count:1},{failed_count:0},{problem_count:2}])
    assert.equal(historyReviewProjection({...entry,...extra},data),null);
  for(const extra of [{not_processed_count:undefined},{not_processed_count:null},{not_processed_count:0},{not_processed_count:2},{not_processed_count:'1'},
    {reviewable_count:1},{reviewable_count:3},{unavailable_count:1},{unclassified_source_count:1},
    {approved_count:3},{current_exported_count:3},{recorded_export_count:0}])
    assert.equal(historyReviewProjection(entry,{...data,...extra}),null);
  const old=historyReviewProjection(entry,{...data,current_exported_count:0});
  assert.equal(old.phase,'results_ready');assert.equal(old.stages[0].status,'warning');assert.equal(old.stages[3].status,'optional');
  const revoked=historyReviewProjection(entry,{...data,approved_count:1});
  assert.equal(revoked.phase,'results_ready');assert.equal(revoked.stages[3].status,'optional');
  const pending=historyReviewProjection(entry,{...data,pending_export_count:1,pending_confirmation_count:1});
  assert.equal(pending.phase,'results_ready');assert.match(pending.next,/keine zusätzliche Freigabe oder Exportbestätigung/u);
});

function classifiedStopSummary(results,omitted,privacyStops){
  const {isAnonymizationOcrOmission,isAnonymizationPrivacyStop}=require('../plugins/data-secure/server/standalone/conversion-feedback');
  const state={schema:'datasecure-batch/7',product_channel:'standalone',processing_mode:'markdown-and-anonymize',
    content_options:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},
    items:[...Array.from({length:results},()=>({status:'released'})),
      ...Array.from({length:omitted},()=>({status:'stopped',error_code:'IMAGE_OCR_REQUIRED',local_mapping_exported:true})),
      ...Array.from({length:privacyStops},(_,index)=>({status:'stopped',error_code:index%2?'AMBIGUITY_REVIEW_REQUIRED':'RESIDUAL_PII',local_mapping_exported:true}))]};
  const ocr=state.items.filter(item=>isAnonymizationOcrOmission(state,item)).length;
  const privacy=state.items.filter(item=>isAnonymizationPrivacyStop(state,item)).length;
  assert.equal(ocr,omitted);assert.equal(privacy,privacyStops);
  assert.equal(isAnonymizationPrivacyStop(state,{status:'stopped',error_code:'INTERNAL_FAILURE',local_mapping_exported:true}),false);
  assert.equal(isAnonymizationPrivacyStop(state,{status:'stopped',error_code:'RESIDUAL_PII',local_mapping_exported:false}),false);
  return {entry:receiptEntry({selected_count:state.items.length,completed_count:state.items.length,result_count:results,
    failed_count:omitted+privacyStops,expected_ocr_omission_count:ocr,privacy_stop_count:privacy,
    failure_reason_breakdown_complete:true,content_notice_count:0,content_notice_breakdown_complete:true}),
    data:receiptSummary({reviewable_count:results,approved_count:results,current_exported_count:results,not_processed_count:omitted+privacyStops})};
}
for(const [results,ocr,privacy]of [[2,0,1],[115,17,1],[2,0,2]])test('bound history snapshot: classified privacy/OCR '+[results,ocr,privacy].join('/')+' closes only available result revisions',()=>{
  const {entry,data}=classifiedStopSummary(results,ocr,privacy),value=historyReviewProjection(entry,data),stopped=ocr+privacy;
  assert.equal(value.phase,'results_ready');assert.equal(value.stages[0].status,'warning');assert.equal(value.stages[1].status,'warning');
  assert.equal(value.stages[2].status,'done');assert.equal(value.stages[3].status,'optional');
  assert.match(value.counts,new RegExp(results+' Ergebnisdateien','u'));
  assert.match(value.counts,new RegExp(results+' von '+entry.selected_count+' Quellen als Ergebnis verfügbar','u'));
  assert.match(value.next,new RegExp(privacy+' Quelle'+(privacy===1?' wurde':'n wurden')+' aus Datenschutzgründen angehalten','u'));
  assert.match(value.next,/keinen freigabefähigen Prüfstand/u);
  assert.match(value.next,stopped===1?/nicht verarbeitete Quelle ist nicht in den Ergebnisdateien enthalten/u:
    new RegExp(stopped+' nicht verarbeiteten Quellen sind nicht in den Ergebnisdateien enthalten','u'));
  assert.match(value.next,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  if(ocr)assert.match(value.counts,new RegExp(ocr+' ohne OCR nicht umgewandelt','u'));
});
test('bound history snapshot: 133-source classification cannot absorb an unknown or technical remainder',()=>{
  const {entry,data}=classifiedStopSummary(115,17,1);
  for(const change of [{privacy_stop_count:undefined},{privacy_stop_count:0},{privacy_stop_count:2},{privacy_stop_count:'1'},
    {privacy_stop_count:null},{expected_ocr_omission_count:18},{failure_reason_breakdown_complete:false},
    {selected_count:134,completed_count:134,failed_count:19}])assert.equal(historyReviewProjection({...entry,...change},data),null);
  // One extra terminal technical stop is fully counted in the failure ledger,
  // but not classified as an OCR omission or privacy stop. It stays unknown here.
  assert.equal(historyReviewProjection({...entry,selected_count:134,completed_count:134,failed_count:19},
    {...data,not_processed_count:19}),null);
  for(const change of [{not_processed_count:17},{not_processed_count:19},{unavailable_count:1},
    {unclassified_source_count:1},{reviewable_count:114},{approved_count:116},{current_exported_count:116}])
    assert.equal(historyReviewProjection(entry,{...data,...change}),null);
  const old=historyReviewProjection(entry,{...data,current_exported_count:114});assert.equal(old.phase,'results_ready');
  const pending=historyReviewProjection(entry,{...data,pending_export_count:1,pending_confirmation_count:1});
  assert.equal(pending.phase,'results_ready');assert.match(pending.next,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  const empty=classifiedStopSummary(0,17,1);assert.equal(historyReviewProjection(empty.entry,empty.data),null);
});

test('guided results no longer advertise a mandatory separate document approval step', () => {
  const value = documents({});
  assert.equal(value.stages[2].label, 'Ergebnisdateien bereitstellen');
  assert.match(value.next, /keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.doesNotMatch(value.heading, /Prüfung offen/u);
});

test('current result publication is distinct from a pending or conflicting saved revision', () => {
  for (const state of ['initial', 'current']) {
    const result = documents({ result_publication: { state, generation_id: state === 'current' ? 'e'.repeat(32) : null, count: 3, current_revision: 0 } });
    assert.equal(result.phase, 'results_ready');
    assert.equal(result.stages[2].status, 'done'); assert.equal(result.stages[3].status, 'optional');
  }
  for (const state of ['pending', 'conflict']) {
    const result = documents({ result_publication: { state, generation_id: null, count: 3, current_revision: 0 }, approved_count: 3, export_complete: true });
    assert.equal(result.phase, 'result_pending'); assert.notEqual(result.stages[2].status, 'done');
    assert.match(result.next, /Ergebnisstand erneut abgleichen/u);
    assert.equal(processor({ state: 'results_available', completed_count: 3, result_count: 3,
      result_publication: { state, generation_id: null, count: 3, current_revision: 0 } }).phase, 'result_pending');
  }
  assert.equal(documents({ has_modified_results: true }).phase, 'result_pending', 'old private revisions alone do not prove current visible files');
});
test('malformed publication metadata never upgrades the displayed result generation', () => {
  for (const result_publication of [{ state: 'done' }, { state: 'current', generation_id: null },
    { state: 'current', generation_id: 'e'.repeat(64) }, { state: 'current', generation_id: '../private' },
    { state: 'current', count: 201 }, { state: 'current', count: -1 },
    { state: 'current', generation_id: 'e'.repeat(32), count: 2 }, { state: 'current', current_revision: '1' },
    { state: 'current', current_revision: 1001 }, { state: 'initial', approved: true }]) {
    assert.notEqual(documents({ result_publication }).phase, 'results_ready');
    assert.notEqual(processor({ state: 'results_available', completed_count: 3, result_count: 3, result_publication }).phase, 'results_ready');
  }
});
test('an unavailable completed result directory is not pending processing or a failed run', () => {
  for (const processing_mode of ['markdown-only', 'markdown-and-anonymize']) {
    const result_publication = { state: 'unavailable', generation_id: null, count: 3, current_revision: 0 };
    for (const result of [documents({ processing_mode, result_publication }), processor({ processing_mode,
      state: 'results_available', completed_count: 3, result_count: 3, result_publication })]) {
      assert.equal(result.phase, 'results_unavailable');
      assert.equal(result.stages[2].status, 'done'); assert.equal(result.busy, false);
      assert.match(result.heading, /Verarbeitung abgeschlossen.*Ergebnisordner nicht verfügbar/u);
      assert.match(result.next, /Private Prüfstände bleiben erhalten/u);
      assert.doesNotMatch(result.next, /erneut abgleichen|blind starten|noch nicht bestätigt/u);
    }
  }
});

const repairPublication = () => ({ state: 'repair_required', generation_id: null, count: 3, current_revision: 2, repair_binding: '9'.repeat(64) });
test('a complete repair projection displays an active private step, not current public files or a publication retry', () => {
  const publication = repairPublication(), before = JSON.stringify(publication);
  for (const result of [documents({ result_publication: publication }), processor({ state: 'results_available', completed_count: 3,
    result_count: 3, results_available: true, result_publication: publication })]) {
    assert.equal(result.phase, 'result_repair_required'); assert.equal(result.stages[3].status, 'current');
    assert.notEqual(result.stages[2].status, 'done'); assert.equal(result.busy, false);
    assert.match(result.heading, /Gespeicherte Anonymisierung.*nachbearbeiten/u);
    assert.match(result.next, /bewusst.*maskieren.*ersetzen.*Basisstand/u);
    assert.doesNotMatch(result.next, /Ergebnisordner öffnen|Bereitstellung erneut prüfen|Ergebnisstand erneut abgleichen/u);
    assert.equal(JSON.stringify(result).includes(publication.repair_binding), false, 'opaque authority token is not UI copy');
  }
  assert.equal(JSON.stringify(publication), before); assert.equal(resultPublication(publication), publication);
});
test('repair metadata is closed and its token exists exclusively in the repair-required state', () => {
  for (const mutate of [value => { delete value.repair_binding; },value => { value.repair_binding = null; },value => { value.repair_binding = undefined; },
    value => { value.repair_binding = false; },value => { value.repair_binding = 'A'.repeat(64); },value => { value.repair_binding = 'a'.repeat(63); },
    value => { value.repair_binding = 'a'.repeat(65); },value => { delete value.generation_id; },value => { delete value.count; },
    value => { delete value.current_revision; },value => { value.generation_id = '../other'; },value => { value.count = 201; },
    value => { value.generation_id = undefined; },value => { value.count = undefined; },value => { value.current_revision = undefined; },
    value => { value.current_revision = -1; },value => { value.current_revision = '1'; },value => { value.extra = true; }]) {
    const value = repairPublication(); mutate(value); assert.equal(resultPublication(value), null);
    for (const result of [documents({ result_publication: value }), processor({ state: 'results_available', completed_count: 3, result_count: 3, result_publication: value })])
      assert.ok(!['results_ready','result_repair_required'].includes(result.phase));
  }
  for (const state of ['initial','current','pending','conflict','unavailable']) {
    const value = { ...repairPublication(), state, generation_id: state === 'current' ? 'e'.repeat(32) : null };
    assert.equal(resultPublication(value), null); delete value.repair_binding; assert.notEqual(resultPublication(value), null);
  }
});
test('repair state cannot authorize a raw, unfinished, mismatched-count or stale display', () => {
  for (const result of [documents({ processing_mode: 'markdown-only', result_publication: repairPublication() }),
    documents({ processing_complete: false, result_publication: repairPublication() }),
    documents({ fresh: false, result_publication: repairPublication() }),
    documents({ result_publication: { ...repairPublication(), count: 2 } }),
    processor({ processing_mode: 'markdown-only', state: 'results_available', completed_count: 3, result_count: 3, result_publication: repairPublication() }),
    processor({ state: 'results_available', completed_count: 2, result_count: 3, result_publication: repairPublication() })])
    assert.ok(!['results_ready','result_repair_required'].includes(result.phase));
});

done();
