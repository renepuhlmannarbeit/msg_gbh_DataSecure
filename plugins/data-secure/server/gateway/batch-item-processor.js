'use strict';

const {
  notProcessedDocumentResult,
  positiveDocumentResult,
  sameDocumentResult
} = require('./document-result-grade');
const { validateCoverage } = require('../standalone/markdown-contract');
const { verifyMarkdownItem } = require('../standalone/markdown-store');
const { processingModeForBatch } = require('../core/processing-mode');
const { classifyPrepublicationError, applyRetryBudget, clearRetryBudget } = require('./prepublication-error');

function conversionBatch(state) {
  return state?.schema === 'datasecure-batch/5' && state.processing_mode === 'markdown-only' && state.product_channel === 'standalone';
}
function conversionIdentity(value, expected) {
  if (value?.artifact_id !== expected || !/^[a-f0-9]{64}$/u.test(String(value.artifact_sha256 || '')) ||
      !Number.isSafeInteger(value.artifact_bytes) || value.artifact_bytes < 0) throw new Error('MARKDOWN_ARTIFACT_INVALID');
  validateCoverage({ status: value.extraction_grade, reason_codes: value.reason_codes });
  return { artifact_id: expected, artifact_sha256: value.artifact_sha256, artifact_bytes: value.artifact_bytes,
    extraction_grade: value.extraction_grade, reason_codes: [...value.reason_codes] };
}

function createBatchItemProcessor(options = {}) {
  const SafeError = options.SafeError;
  const writeState = options.writeState;
  const anonymizeNext = options.anonymizeNext;
  const convertNext = options.convertNext || require('../standalone/convert-next').convertNext;
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

  function publicFailureMessage(code, classification = {}) {
    const fixed = {
      BATCH_SNAPSHOT_CHANGED: 'Der bestätigte Dateistapel wurde verändert. Die unveröffentlichten privaten Kopien wurden sicher gestoppt.',
      CONVERSION_TERMINATION_UNCONFIRMED: 'Die Verarbeitung wurde unterbrochen. Das Ende des Konvertierungsprozesses konnte nicht bestätigt werden. Weitere Dateien werden nicht gestartet.',
      LOCAL_REVIEW_DEFERRED: 'Die lokale Prüfung wurde vertagt. Das Dokument bleibt lokal und wird nicht freigegeben.',
      REQUEST_CANCELLED: 'Die lokale Verarbeitung wurde auf Anforderung sicher abgebrochen.'
    };
    if (classification.exhausted) {
      return 'Die Verarbeitung ist mit demselben technischen Fehler wiederholt fehlgeschlagen und wird nicht erneut fortgesetzt. Bitte die Diagnose prüfen und einen neuen Lauf starten.';
    }
    if (classification.retryable) {
      return 'Die lokale Verarbeitung wurde technisch unterbrochen. Sie kann ausdrücklich fortgesetzt werden.';
    }
    if (code === 'RESIDUAL_PII') {
      return 'Die Datenschutzprüfung hat mögliche Identifikatoren gefunden. Das Dokument wurde nicht freigegeben.';
    }
    return 'Die Datei wurde sicher nicht verarbeitet. Es wurde kein Paket freigegeben. Bitte die Diagnose prüfen.';
  }

  function publishedFailure(state, item, expectedPackageId, error) {
    item.status = 'processing';
    item.checkpoint = 'package_published';
    if (conversionBatch(state)) {
      item.artifact_id = expectedPackageId;
      delete item.artifact_sha256;
      delete item.artifact_bytes;
      delete item.extraction_grade;
      delete item.reason_codes;
    } else item.package_id = expectedPackageId;
    item.error_code = 'PROCESSING_INTERRUPTED';
    item.work_copy_cleanup_pending = true;
    // A failed write may have happened after markMappingPending mutated the
    // in-memory item. The recoverable package-published checkpoint deliberately
    // carries no terminal grade; recovery rebinds it from the verified manifest.
    delete item.document_result;
    delete item.mapping_outbox_persisted;
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
    if (state?.schema === 'datasecure-batch/5' || state?.processing_mode === 'markdown-only') processingModeForBatch(state);
    const converting = conversionBatch(state);
    if (!converting && (state?.schema === 'datasecure-batch/5' || state?.processing_mode === 'markdown-only')) {
      throw new SafeError('Die Konvertierung gehört ausschließlich zur lokalen Standalone-Anwendung.');
    }
    item.status = 'processing';
    item.checkpoint = 'processing_started';
    item.processing_started_at_ms = nowMs();
    const phaseRecorder = createPhaseRecorder({ now: deps.performanceNow });
    const expectedPackageId = converting ? `dm_${item.id}` : packageIdForItem(item);
    let packagePublished = false;
    let publishCallbackCount = 0;
    let verifiedDocumentResult;
    let publishedDocumentResult;
    writeState(state);
    try {
      const checkpoint = (phase, performancePhase) => {
        if (performancePhase) phaseRecorder.mark(performancePhase);
        item.checkpoint = phase;
        // Diagnostic phases stay in memory. Recovery uses the durable
        // processing marker and the deterministic published package, not
        // intermediate parser progress. Avoid rewriting the whole batch
        // five times per document just to record transient phase changes.
      };
      const result = await (converting ? (deps.convertNext || convertNext) : anonymizeNext)(state.profile, {
        ...deps,
        productChannel: state.product_channel,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        ...(converting ? { artifactId: expectedPackageId } : { packageId: expectedPackageId }),
        retainPublishedOnAfterPublishFailure: true,
        onClaimed: async () => {
          checkpoint('private_copy_claimed', 'intake_and_preparation');
          if (deps.onClaimed) await deps.onClaimed();
        },
        onExtracted: async (converted) => {
          checkpoint('extracted', 'conversion_and_visual_scan');
          if (deps.onExtracted) await deps.onExtracted(converted);
        },
        onDetected: converting ? undefined : async (details) => {
          checkpoint('text_privacy_checked', 'text_privacy_check');
          if (deps.onDetected) await deps.onDetected(details);
        },
        reviewText: converting ? undefined : (input) => reviewSingleBatchTextLocally(input, state, item, deps),
        beforePublish: async (details) => {
          if (converting) {
            verifiedDocumentResult = conversionIdentity(details, expectedPackageId);
            checkpoint('package_verified', 'verification');
            if (deps.beforePublish) await deps.beforePublish(details);
            return;
          }
          positiveDocumentResult(details?.document_result);
          verifiedDocumentResult = details.document_result;
          incrementPrivateIoSummary(state.io_summary, 'final_gate_runs');
          checkpoint('package_verified', 'verification');
          // Alias bindings must be durable before the package rename. A crash
          // may otherwise publish document N while document N+1 restarts with
          // a surname-only alias that no longer resolves to the same person.
          // Persist only the alias contract at the last durable processing
          // boundary. `package_verified` is diagnostic in-memory progress and
          // must not become a recovery promise before the atomic publication.
          if (deps.persistPseudonymContext) {
            const transientCheckpoint = item.checkpoint;
            item.checkpoint = 'processing_started';
            try { deps.persistPseudonymContext(); }
            finally { item.checkpoint = transientCheckpoint; }
          }
          if (deps.beforePublish) await deps.beforePublish(details);
        },
        afterPublish: async (details) => {
          publishCallbackCount++;
          // The atomic output rename has already committed before this callback.
          // Bind every subsequent validation failure to published recovery.
          packagePublished = true;
          if (publishCallbackCount !== 1) throw publicationUnconfirmed();
          if (converting) {
            publishedDocumentResult = conversionIdentity(details, expectedPackageId);
            if (JSON.stringify(publishedDocumentResult) !== JSON.stringify(verifiedDocumentResult)) throw publicationUnconfirmed();
            checkpoint('package_published', 'publication');
            return;
          }
          positiveDocumentResult(details?.document_result);
          if (!sameDocumentResult(details.document_result, verifiedDocumentResult)) throw publicationUnconfirmed();
          publishedDocumentResult = details.document_result;
          checkpoint('package_published', 'publication');
        }
      });
      phaseRecorder.mark('publication');
      if (converting) {
        const identity = conversionIdentity(result, expectedPackageId);
        if (!packagePublished || publishCallbackCount !== 1 ||
            JSON.stringify(identity) !== JSON.stringify(verifiedDocumentResult) ||
            JSON.stringify(identity) !== JSON.stringify(publishedDocumentResult) || !verifyMarkdownItem(identity)) {
          throw publicationUnconfirmed();
        }
        Object.assign(item, identity);
        clearRetryBudget(item);
        delete item.document_result;
        item.status = deliveryPendingStatus;
        item.checkpoint = 'delivery_pending';
        item.work_copy_cleanup_pending = true;
        delete item.error_code;
        item.processing_duration_ms = Math.max(0, nowMs() - Number(item.processing_started_at_ms || nowMs()));
        item.performance_phases_ms = phaseRecorder.snapshot();
        delete item.processing_started_at_ms;
        // The durable journal is the source→artifact ledger. The shared visible
        // exporter atomically materialises its human-readable run CSV at finish.
        writeState(state);
        try { cleanupTerminalWorkCopy(state, item, deps); } catch { item.work_copy_cleanup_pending = true; }
        writeState(state);
        return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
      }
      if (!packagePublished || publishCallbackCount !== 1 || result?.package_id !== expectedPackageId ||
        !sameDocumentResult(result?.document_result, verifiedDocumentResult) ||
        !sameDocumentResult(result?.document_result, publishedDocumentResult)) {
        throw publicationUnconfirmed();
      }
      markMappingPending(item, expectedPackageId, result.document_result);
      clearRetryBudget(item);
      writeState(state);
      try {
        ensureMappingOutbox(item.source_label || item.name, expectedPackageId, item.document_result);
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
      try {
        commitPendingMapping(item, expectedPackageId);
      } catch {
        // Preserve cleanup debt on this early return; the ordinary path
        // includes it in the final durable delivery checkpoint below.
        writeState(state);
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
        if (converting) item.artifact_id = expectedPackageId;
        else item.package_id = expectedPackageId;
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
      const classified = applyRetryBudget(item, classifyPrepublicationError(error, retryableCodes, {
        deferredCode: 'LOCAL_REVIEW_DEFERRED'
      }));
      const { code } = classified;
      if (code === 'BATCH_SNAPSHOT_CHANGED') {
        invalidateUnpublishedBatchCopies(state, { ...deps, writeState }, item);
      }
      item.status = classified.deferred
        ? deferredReviewStatus
        : (classified.retryable ? 'retryable' : 'stopped');
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
        item.document_result = notProcessedDocumentResult(code);
        item.local_mapping_exported = false;
        item.work_copy_cleanup_pending = true;
        // The stop decision is the authoritative commit point. Mapping and
        // cleanup are separately recoverable projections of that decision.
        writeState(state);
        try {
          appendMapping(item.source_label || item.name, '', mappingStoppedStatus, {
            mappingReference: item.id,
            documentResult: item.document_result
          });
          item.local_mapping_exported = true;
          writeState(state);
        } catch {
          return {
            ok: false,
            error: code,
            message: publicFailureMessage(code),
            ...publicProgress(state),
            local_mapping_exported: false,
            local_evidence_exported: false,
            raw_content_sent_to_claude: false
          };
        }
        try {
          cleanupTerminalWorkCopy(state, item, deps);
          item.work_copy_cleanup_pending = false;
        } catch { item.work_copy_cleanup_pending = true; }
        writeState(state);
      } else {
        writeState(state);
      }
      const localEvidenceExported = item.status === 'stopped' && item.local_mapping_exported !== true
        ? false
        : writeTerminalEvidence(state);
      return {
        ok: false,
        error: code,
        message: publicFailureMessage(code, classified),
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
