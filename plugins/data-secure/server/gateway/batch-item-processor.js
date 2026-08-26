'use strict';

function createBatchItemProcessor(options = {}) {
  const SafeError = options.SafeError;
  const writeState = options.writeState;
  const anonymizeNext = options.anonymizeNext;
  const packageIdForItem = options.packageIdForItem;
  const createPhaseRecorder = options.createPhaseRecorder;
  const reviewSingleBatchTextLocally = options.reviewSingleBatchTextLocally;
  const incrementPrivateIoSummary = options.incrementPrivateIoSummary;
  const ensureMappingOutbox = options.ensureMappingOutbox;
  const markMappingPending = options.markMappingPending;
  const cleanupTerminalWorkCopy = options.cleanupTerminalWorkCopy;
  const commitPendingMapping = options.commitPendingMapping;
  const appendMapping = options.appendMapping;
  const invalidateUnpublishedBatchCopies = options.invalidateUnpublishedBatchCopies;
  const publicProgress = options.publicProgress;
  const writeTerminalEvidence = options.writeTerminalEvidence;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const retryableCodes = options.retryableCodes || new Set();
  const mappingStoppedStatus = options.mappingStoppedStatus || 'sicher gestoppt';
  const nowMs = options.nowMs || Date.now;

  function publicationUnconfirmed() {
    const error = new SafeError('Die lokale Paketveröffentlichung konnte nicht sicher bestätigt werden. Der Zustand wird lokal automatisch abgeglichen.');
    error.code = 'BATCH_PUBLICATION_UNCONFIRMED';
    return error;
  }

  function publicFailureMessage(code) {
    const fixed = {
      BATCH_SNAPSHOT_CHANGED: 'Der bestätigte Dateistapel wurde verändert. Die unveröffentlichten privaten Kopien wurden sicher gestoppt.',
      LOCAL_REVIEW_DEFERRED: 'Die lokale Prüfung wurde vertagt. Das Dokument bleibt lokal und wird nicht freigegeben.',
      REQUEST_CANCELLED: 'Die lokale Verarbeitung wurde auf Anforderung sicher abgebrochen.'
    };
    return fixed[code] || 'Die lokale Verarbeitung wurde sicher unterbrochen. Es wurde kein Paket freigegeben.';
  }

  function publishedFailure(state, item, expectedPackageId, error) {
    item.status = 'processing';
    item.checkpoint = 'package_published';
    item.package_id = expectedPackageId;
    item.error_code = 'PROCESSING_INTERRUPTED';
    item.work_copy_cleanup_pending = true;
    delete item.processing_started_at_ms;
    writeState(state);
    return {
      ok: false,
      error: error?.code === 'BATCH_PUBLICATION_UNCONFIRMED'
        ? 'BATCH_PUBLICATION_UNCONFIRMED'
        : 'PROCESSING_INTERRUPTED',
      message: 'Das lokale Ergebnis wurde veröffentlicht, aber die nachgelagerte Verarbeitung nicht vollständig bestätigt. Der Zustand wird automatisch abgeglichen.',
      ...publicProgress(state),
      local_mapping_exported: null,
      local_evidence_exported: null,
      raw_content_sent_to_claude: false
    };
  }

  async function processSingleBatchItem(state, item, entry, deps = {}) {
    item.status = 'processing';
    item.checkpoint = 'processing_started';
    item.processing_started_at_ms = nowMs();
    const phaseRecorder = createPhaseRecorder({ now: deps.performanceNow });
    const expectedPackageId = packageIdForItem(item);
    let packagePublished = false;
    let publishCallbackCount = 0;
    writeState(state);
    try {
      const checkpoint = (phase, performancePhase) => {
        if (performancePhase) phaseRecorder.mark(performancePhase);
        item.checkpoint = phase;
        writeState(state, { durable: false });
      };
      const result = await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: expectedPackageId,
        onClaimed: async () => {
          checkpoint('private_copy_claimed', 'intake_and_preparation');
          if (deps.onClaimed) await deps.onClaimed();
        },
        onExtracted: async (converted) => {
          checkpoint('extracted', 'conversion_and_visual_scan');
          if (deps.onExtracted) await deps.onExtracted(converted);
        },
        onDetected: async (details) => {
          checkpoint('text_privacy_checked', 'text_privacy_check');
          if (deps.onDetected) await deps.onDetected(details);
        },
        reviewText: (input) => reviewSingleBatchTextLocally(input, state, item, deps),
        beforePublish: async (details) => {
          incrementPrivateIoSummary(state.io_summary, 'final_gate_runs');
          checkpoint('package_verified', 'verification');
          if (deps.beforePublish) await deps.beforePublish(details);
        },
        afterPublish: async () => {
          publishCallbackCount++;
          if (publishCallbackCount !== 1) throw publicationUnconfirmed();
          // The atomic output rename is the commit point. From this line on,
          // no later error may become a parser stop or delete the work copy.
          packagePublished = true;
          try {
            ensureMappingOutbox(item.name, expectedPackageId);
            item.mapping_outbox_persisted = true;
          } catch {
            item.mapping_outbox_persisted = false;
          }
          checkpoint('package_published', 'publication');
        }
      });
      phaseRecorder.mark('publication');
      if (!packagePublished || publishCallbackCount !== 1 || result?.package_id !== expectedPackageId) {
        throw publicationUnconfirmed();
      }
      markMappingPending(item, expectedPackageId);
      writeState(state);
      try {
        ensureMappingOutbox(item.name, expectedPackageId);
        item.mapping_outbox_persisted = true;
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      writeState(state);
      try { cleanupTerminalWorkCopy(state, item, deps); }
      catch { item.work_copy_cleanup_pending = true; }
      writeState(state);
      try {
        commitPendingMapping(item, expectedPackageId);
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      item.status = deliveryPendingStatus;
      item.checkpoint = 'delivery_pending';
      delete item.error_code;
      item.processing_duration_ms = Math.max(0, nowMs() - Number(item.processing_started_at_ms || nowMs()));
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.package_id = expectedPackageId;
      incrementPrivateIoSummary(state.io_summary, 'output_packages_committed');
      if (result.audit_receipt_retained === true) {
        incrementPrivateIoSummary(state.io_summary, 'audit_receipt_writes');
      }
      writeState(state);
      return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      if (packagePublished) {
        return publishedFailure(state, item, expectedPackageId, error);
      }
      if (error?.code === 'BATCH_PUBLICATION_UNCONFIRMED') {
        item.status = 'processing';
        item.checkpoint = 'publication_unconfirmed';
        item.package_id = expectedPackageId;
        item.error_code = 'PROCESSING_INTERRUPTED';
        item.work_copy_cleanup_pending = true;
        delete item.processing_started_at_ms;
        writeState(state);
        return {
          ok: false,
          error: 'BATCH_PUBLICATION_UNCONFIRMED',
          message: error.message,
          ...publicProgress(state),
          local_mapping_exported: null,
          local_evidence_exported: null,
          raw_content_sent_to_claude: false
        };
      }
      const code = error?.code || 'PROCESSING_INTERRUPTED';
      if (code === 'BATCH_SNAPSHOT_CHANGED') {
        invalidateUnpublishedBatchCopies(state, deps, item);
      }
      item.status = code === 'LOCAL_REVIEW_DEFERRED'
        ? deferredReviewStatus
        : (retryableCodes.has(code) ? 'retryable' : 'stopped');
      item.checkpoint = item.status === 'retryable'
        ? 'retryable'
        : (item.status === deferredReviewStatus ? 'awaiting_local_review' : 'stopped');
      if (item.status === 'stopped') {
        item.processing_duration_ms = Math.max(0, nowMs() - Number(item.processing_started_at_ms || nowMs()));
      }
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.error_code = code;
      if (item.status === 'stopped') {
        try {
          appendMapping(item.name, '', mappingStoppedStatus);
          item.local_mapping_exported = true;
        } catch { item.local_mapping_exported = false; }
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
      }
      writeState(state);
      const localEvidenceExported = writeTerminalEvidence(state);
      return {
        ok: false,
        error: code,
        message: publicFailureMessage(code),
        ...publicProgress(state),
        local_mapping_exported: item.status === 'stopped' ? item.local_mapping_exported : null,
        local_evidence_exported: localEvidenceExported,
        raw_content_sent_to_claude: false
      };
    }
  }

  return { processSingleBatchItem };
}

module.exports = { createBatchItemProcessor };
