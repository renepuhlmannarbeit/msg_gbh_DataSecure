'use strict';

const { batchReviewReady } = require('./batch-next-action');

function formatRemainingTime(seconds) {
  if (seconds < 60) return 'unter 1 Minute';
  return `${Math.max(1, Math.round(seconds / 60))} Minuten`;
}

function batchUserStatus(progress) {
  const completed = progress.completed;
  const total = progress.batch_total;
  const eta = Number.isSafeInteger(progress.estimated_remaining_seconds) && progress.estimated_remaining_seconds >= 0
    ? ` Gemessene Restzeit für die verbleibende automatische Verarbeitung: ca. ${formatRemainingTime(progress.estimated_remaining_seconds)}.`
    : '';
  if (progress.complete) {
    const grades = progress.result_grade_counts;
    const summary = progress.result_grades_verified === true
      ? `${grades.complete} vollständig verarbeitet, ${grades.usable_with_omissions} mit Auslassungen verwendbar, ${grades.not_processed} sicher nicht verarbeitet.`
      : `${progress.released} Ergebnisse bereitgestellt, ${progress.stopped} sicher gestoppt. Ergebnisgrade sind nicht verfügbar.`;
    return { user_status: `Stapel abgeschlossen: ${summary}`, next_action: 'open_local_overview' };
  }
  const states = {
    awaiting_local_review: [`Lokale Prüfung erforderlich: ${completed} von ${total} Dateien sind abgeschlossen.`, 'review_local_decisions'],
    awaiting_local_mapping_repair: [`Ergebnis lokal sicher erstellt: ${completed} von ${total} Dateien sind abgeschlossen. Die Zuordnungsübersicht wird lokal nachgetragen.`, 'local_mapping_repair'],
    awaiting_explicit_resume: [`Stapel angehalten: ${completed} von ${total} Dateien sind abgeschlossen.`, 'resume_batch'],
    awaiting_delivery_acknowledgement: [`Ergebnis wird sicher bereitgestellt: ${completed} von ${total} Dateien sind abgeschlossen.`, 'read_and_confirm_result'],
    processing_local_batch: [`Lokale Stapelverarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`, 'wait_for_local_batch'],
    processing_local_document: [`Lokale Verarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`, 'wait_for_current_document']
  };
  if (states[progress.batch_phase]) {
    return { user_status: states[progress.batch_phase][0], next_action: states[progress.batch_phase][1] };
  }
  if (progress.batch_phase !== 'ready_for_next_document') {
    return {
      user_status: `Lokaler Stapelstatus ist unklar: ${completed} von ${total} Dateien sind abgeschlossen. Es wurde keine weitere Datei verarbeitet.`,
      next_action: 'check_privacy_status'
    };
  }
  return { user_status: `Stapel bereit: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`, next_action: 'process_next_document' };
}

function measuredRemainingSeconds(state, remaining) {
  if (!Number.isSafeInteger(remaining) || remaining <= 0) return null;
  const samples = (state.items || [])
    .map((item) => Number(item.processing_duration_ms))
    .filter((duration) => Number.isSafeInteger(duration) && duration >= 0 && duration <= 60 * 60 * 1000)
    .sort((left, right) => left - right);
  if (samples.length < 3) return null;
  const median = samples[Math.floor(samples.length / 2)];
  const seconds = Math.ceil((median * remaining) / 1000);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function progressFacts(state, config = {}, localProcessing = false) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const released = items.filter((item) => item.status === 'released').length;
  const deliveryPending = items.filter((item) => item.status === config.deliveryPendingStatus).length;
  const processing = items.filter((item) => item.status === 'processing').length;
  const stopped = items.filter((item) => item.status === 'stopped' && item.local_mapping_exported !== false).length;
  const retryable = items.filter((item) => item.status === 'retryable').length;
  const deferredReview = items.filter((item) => item.status === config.deferredReviewStatus).length;
  const mappingPending = items.filter((item) =>
    item.status === config.mappingPendingStatus || item.status === (config.preflightMappingPendingStatus || 'preflight_mapping_pending') ||
    (item.status === 'stopped' && item.local_mapping_exported === false)
  ).length;
  const remaining = items.filter((item) => item.status === 'pending').length;
  const completed = released + stopped;
  const accounted = completed + deferredReview + mappingPending + deliveryPending + processing + retryable + remaining;
  const invalidState = items.length === 0 || accounted !== items.length;
  const reviewReady = batchReviewReady({ batch_total: items.length, completed,
    deferred_review: deferredReview, remaining, retryable,
    delivery_pending: deliveryPending, mapping_pending: mappingPending, processing });
  const complete = !invalidState && remaining === 0 && retryable === 0 && deferredReview === 0 && mappingPending === 0 && deliveryPending === 0 && processing === 0;
  const processingIndex = items.findIndex((item) => item.status === 'processing');
  const pendingIndex = items.findIndex((item) => item.status === 'pending');
  return {
    ...(state.schema === 'datasecure-batch/5' ? { processing_mode: 'markdown-only',
      warning_count: items.filter((item) => item.status === 'released' && item.extraction_grade === 'incomplete').length } : {}),
    batch_token: state.token,
    batch_total: items.length,
    attempted: released + stopped + retryable + deferredReview + deliveryPending + processing,
    completed,
    completion_percent: items.length === 0 ? 0 : Math.floor((completed * 100) / items.length),
    released,
    delivery_pending: deliveryPending,
    processing,
    stopped,
    retryable,
    deferred_review: deferredReview,
    mapping_pending: mappingPending,
    remaining,
    local_processing_active: localProcessing === true,
    estimated_remaining_seconds: retryable === 0 && deferredReview === 0 ? measuredRemainingSeconds(state, remaining) : null,
    awaiting_resume: retryable > 0 && remaining === 0 && deliveryPending === 0 && processing === 0,
    complete,
    batch_phase: invalidState ? 'invalid_local_state' : (complete ? 'complete' : (localProcessing ? 'processing_local_batch' : (processing > 0 ? 'processing_local_document' : (deliveryPending > 0 ? 'awaiting_delivery_acknowledgement' : (reviewReady ? 'awaiting_local_review' : (mappingPending > 0 && remaining === 0 ? 'awaiting_local_mapping_repair' : (retryable > 0 && remaining === 0 ? 'awaiting_explicit_resume' : 'ready_for_next_document'))))))),
    next_position: processingIndex >= 0 ? processingIndex + 1 : (pendingIndex >= 0 ? pendingIndex + 1 : null)
  };
}

function finalizeProgress(progress, projection) {
  const value = {
    ...progress,
    result_grade_counts: projection.grade_counts,
    result_omission_counts: projection.omission_counts,
    result_grades_verified: projection.grades_verified
  };
  return { ...value, ...batchUserStatus(value) };
}

module.exports = Object.freeze({ batchUserStatus, formatRemainingTime, measuredRemainingSeconds, progressFacts, finalizeProgress });
