'use strict';

function createBatchProgress(deps) {
  const {
    deliveryPendingStatus,
    deferredReviewStatus,
    mappingPendingStatus,
    preflightMappingPendingStatus = 'preflight_mapping_pending',
    liveLocalExecutor
  } = deps;

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
      return {
        user_status: `Stapel abgeschlossen: ${progress.released} erfolgreich vorbereitet, ${progress.stopped} sicher gestoppt.`,
        next_action: 'open_local_overview'
      };
    }
    if (progress.batch_phase === 'awaiting_local_review') {
      return {
        user_status: `Lokale Prüfung erforderlich: ${completed} von ${total} Dateien sind abgeschlossen.`,
        next_action: 'review_local_decisions'
      };
    }
    if (progress.batch_phase === 'awaiting_local_mapping_repair') {
      return {
        user_status: `Ergebnis lokal sicher erstellt: ${completed} von ${total} Dateien sind abgeschlossen. Die Zuordnungsübersicht wird lokal nachgetragen.`,
        next_action: 'local_mapping_repair'
      };
    }
    if (progress.batch_phase === 'awaiting_explicit_resume') {
      return {
        user_status: `Stapel angehalten: ${completed} von ${total} Dateien sind abgeschlossen.`,
        next_action: 'resume_batch'
      };
    }
    if (progress.batch_phase === 'awaiting_delivery_acknowledgement') {
      return {
        user_status: `Ergebnis wird sicher bereitgestellt: ${completed} von ${total} Dateien sind abgeschlossen.`,
        next_action: 'read_and_confirm_result'
      };
    }
    if (progress.batch_phase === 'processing_local_batch') {
      return {
        user_status: `Lokale Stapelverarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
        next_action: 'wait_for_local_batch'
      };
    }
    if (progress.batch_phase === 'processing_local_document') {
      return {
        user_status: `Lokale Verarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
        next_action: 'wait_for_current_document'
      };
    }
    if (progress.batch_phase !== 'ready_for_next_document') {
      return {
        user_status: `Lokaler Stapelstatus ist unklar: ${completed} von ${total} Dateien sind abgeschlossen. Es wurde keine weitere Datei verarbeitet.`,
        next_action: 'check_privacy_status'
      };
    }
    return {
      user_status: `Stapel bereit: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
      next_action: 'process_next_document'
    };
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

  function publicProgress(state) {
    const items = Array.isArray(state.items) ? state.items : [];
    const invalidState = items.length === 0;
    const released = items.filter((item) => item.status === 'released').length;
    const deliveryPending = items.filter((item) => item.status === deliveryPendingStatus).length;
    const processing = items.filter((item) => item.status === 'processing').length;
    const stopped = items.filter((item) => item.status === 'stopped' && item.local_mapping_exported !== false).length;
    const retryable = items.filter((item) => item.status === 'retryable').length;
    const deferredReview = items.filter((item) => item.status === deferredReviewStatus).length;
    const mappingPending = items.filter((item) =>
      item.status === mappingPendingStatus || item.status === preflightMappingPendingStatus ||
      (item.status === 'stopped' && item.local_mapping_exported === false)
    ).length;
    const remaining = items.filter((item) => item.status === 'pending').length;
    const completed = released + stopped;
    const complete = !invalidState && remaining === 0 && retryable === 0 && deferredReview === 0 && mappingPending === 0 && deliveryPending === 0 && processing === 0;
    const processingIndex = items.findIndex((item) => item.status === 'processing');
    const pendingIndex = items.findIndex((item) => item.status === 'pending');
    const localProcessing = liveLocalExecutor(state);
    const progress = {
      batch_token: state.token,
      batch_total: items.length,
      attempted: released + stopped + retryable + deferredReview + deliveryPending + processing,
      completed,
      completion_percent: invalidState ? 0 : Math.floor((completed * 100) / items.length),
      released,
      delivery_pending: deliveryPending,
      processing,
      stopped,
      retryable,
      deferred_review: deferredReview,
      mapping_pending: mappingPending,
      remaining,
      local_processing_active: localProcessing,
      estimated_remaining_seconds: retryable === 0 && deferredReview === 0
        ? measuredRemainingSeconds(state, remaining)
        : null,
      awaiting_resume: retryable > 0 && remaining === 0 && deliveryPending === 0 && processing === 0,
      complete,
      batch_phase: invalidState ? 'invalid_local_state' : (complete ? 'complete' : (localProcessing ? 'processing_local_batch' : (processing > 0 ? 'processing_local_document' : (deliveryPending > 0 ? 'awaiting_delivery_acknowledgement' : (deferredReview > 0 && remaining === 0 ? 'awaiting_local_review' : (mappingPending > 0 && remaining === 0 ? 'awaiting_local_mapping_repair' : (retryable > 0 && remaining === 0 ? 'awaiting_explicit_resume' : 'ready_for_next_document'))))))),
      next_position: processingIndex >= 0 ? processingIndex + 1 : (pendingIndex >= 0 ? pendingIndex + 1 : null)
    };
    return { ...progress, ...batchUserStatus(progress) };
  }

  return { batchUserStatus, formatRemainingTime, measuredRemainingSeconds, publicProgress };
}

module.exports = { createBatchProgress };
