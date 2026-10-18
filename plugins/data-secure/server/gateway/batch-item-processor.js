'use strict';

const {
  notProcessedDocumentResult,
  positiveDocumentResult,
  sameDocumentResult
} = require('./document-result-grade');
const { validateCoverage } = require('../standalone/markdown-contract');
const { verifyMarkdownItem } = require('../standalone/markdown-store');
const { isMarkdownBatch } = require('../core/processing-mode');
const { contentOptionsForBatch } = require('../core/content-options');
const { bindContentDependencies, bindContentReviewDependencies } = require('./content-consumer-dependencies');
const { expectedPublication, confirmPublication } = require('./standalone-anonymized-batch');
const { classifyPrepublicationError, applyRetryBudget, clearRetryBudget, retryDocumentControl, isOwnershipControlFailure } = require('./prepublication-error');

function conversionBatch(state) {
  return isMarkdownBatch(state);
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
  const captureStandaloneIdentitySnapshot = options.captureStandaloneIdentitySnapshot;
  const contactStore = options.contactStore;
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
    if (code === 'STANDALONE_BUSY')
      return 'Die lokale Dokumentverwaltung ist vorübergehend belegt. Das Dokument bleibt unverändert zur ausdrücklichen Fortsetzung erhalten.';
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
      return 'Die Datenschutzprüfung hat mögliche Identifikatoren oder unlesbare Zeichen gefunden. Das Dokument wurde nicht freigegeben. Bitte eine lesbare Kopie der Quelldatei prüfen.';
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
    const converting = conversionBatch(state);
    const contentOptions = contentOptionsForBatch(state), contentDependencies = contentOptions
      ? bindContentReviewDependencies(state, deps).dependencies : bindContentDependencies(state, deps);
    const claimed = (options.claimStandaloneDocument || ((_state, action) => { action(); return true; }))(state, () => {
      item.status = 'processing';
      item.checkpoint = 'processing_started';
      item.processing_started_at_ms = nowMs();
      writeState(state);
    });
    if (!claimed) return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    const phaseRecorder = createPhaseRecorder({ now: deps.performanceNow });
    const expectedPackageId = converting ? `dm_${item.id}` : packageIdForItem(item);
    let packagePublished = false;
    let publishCallbackCount = 0;
    let verifiedDocumentResult;
    let publishedDocumentResult;
    try {
      const checkpoint = (phase, performancePhase) => {
        if (performancePhase) phaseRecorder.mark(performancePhase);
        item.checkpoint = phase;
        // Diagnostic phases stay in memory. Recovery uses the durable
        // processing marker and the deterministic published package, not
        // intermediate parser progress. Avoid rewriting the whole batch
        // five times per document just to record transient phase changes.
      };
      if (contentOptions && !converting && typeof options.runStandaloneItem !== 'function')
        throw Object.assign(Error('CONTENT_OPTIONS_NOT_READY'), { code: 'CONTENT_OPTIONS_NOT_READY' });
      const operation = converting ? (deps.convertNext || convertNext) :
        contentOptions ? (_profile, hooks) => options.runStandaloneItem(state.token, item.id, hooks) : anonymizeNext;
      const operationHooks = {
        ...contentDependencies,
        productChannel: state.product_channel,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        ...(converting ? { artifactId: expectedPackageId } : { packageId: expectedPackageId }),
        ...(converting && state.ocr_contact_review === true ? {
          ocrContactReview: true,
          ocrContactReviewSkipped: state.ocr_contact_review_skipped === true,
          prepareOcrContacts: async input => {
            const stored = contactStore.read(state, item, input);
            if (stored !== null) return stored;
            // Keep earlier exact answers; only unanswered contacts may stay
            // unconfirmed after the user's durable run-wide opt-out.
            if (state.ocr_contact_review_skipped === true) return null;
            if (deps.reviewOcrContacts !== true || typeof deps.reviewTextLocally !== 'function') {
              throw Object.assign(new Error('LOCAL_REVIEW_DEFERRED'), { code: 'LOCAL_REVIEW_DEFERRED' });
            }
            const { buildContactDraft, validateContactAnswer } = require('../core/ocr-contact-review');
            const draft = buildContactDraft(input);
            const answer = validateContactAnswer(await deps.reviewTextLocally(draft), draft);
            if (answer.action !== 'reviewed') throw Object.assign(new Error('LOCAL_REVIEW_DEFERRED'), { code: 'LOCAL_REVIEW_DEFERRED' });
            return contactStore.write(state, item, input, answer);
          }
        } : {}),
        retainPublishedOnAfterPublishFailure: true,
        ...(state.product_channel === 'standalone' && state.standalone_document_review === true ? {
          persistStandaloneDocumentReview: value => retryDocumentControl(() => require('./standalone-document-review-store')
            .createDocumentReviewStore().capture(state, item, value))
        } : {}),
        ...(!converting && state.product_channel === 'standalone' && captureStandaloneIdentitySnapshot
          ? { persistStandaloneIdentitySnapshot: async ({ package_id, entries, unmapped_labels }) => {
              // This is an additional private human aid, not a precondition
              // for safe anonymization. Missing records remain visibly
              // incomplete in the human mapping document.
              try { captureStandaloneIdentitySnapshot(state.token, item.id, package_id, entries, { unmappedLabels: unmapped_labels }); }
              catch { /* never replace a verified privacy result with a mapping write failure */ }
            } } : {}),
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
          if (contentOptions && (details?.package_id !== expectedPackageId ||
              JSON.stringify(details.publication_binding) !== JSON.stringify(await retryDocumentControl(() => expectedPublication(state, item)))))
            throw Object.assign(new SafeError('Die private Publikationsbindung ist ungültig.'), { code: 'STANDALONE_PUBLICATION_INVALID' });
          verifiedDocumentResult = details.document_result;
          incrementPrivateIoSummary(state.io_summary, 'final_gate_runs');
          checkpoint('package_verified', 'verification');
          // Alias bindings must be durable before the package rename. A crash
          // may otherwise publish document N while document N+1 restarts with
          // a surname-only alias that no longer resolves to the same person.
          // Persist only the alias contract at the last durable processing
          // boundary. `package_verified` is diagnostic in-memory progress and
          // must not become a recovery promise before the atomic publication.
          if (!contentOptions && deps.persistPseudonymContext) {
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
            if (state.product_channel === 'standalone' && state.standalone_document_review === true)
              await retryDocumentControl(() => require('./standalone-document-review-store')
                .createDocumentReviewStore().recordPublication(state.token, item.id));
            checkpoint('package_published', 'publication');
            return;
          }
          positiveDocumentResult(details?.document_result);
          if (!sameDocumentResult(details.document_result, verifiedDocumentResult)) throw publicationUnconfirmed();
          publishedDocumentResult = details.document_result;
          if (contentOptions && JSON.stringify(details.publication_binding) !==
              JSON.stringify((await retryDocumentControl(() => confirmPublication(state, item))).publication_binding)) throw publicationUnconfirmed();
          if (state.product_channel === 'standalone' && state.standalone_document_review === true)
            await retryDocumentControl(() => require('./standalone-document-review-store')
              .createDocumentReviewStore().recordPublication(state.token, item.id));
          checkpoint('package_published', 'publication');
        }
      };
      const result = await operation(state.profile, contentOptions && !converting
        ? require('./bound-content-input').publicationHooksFromServices(operationHooks) : operationHooks);
      phaseRecorder.mark('publication');
      if (converting) {
        const identity = conversionIdentity(result, expectedPackageId);
        if (!packagePublished || publishCallbackCount !== 1 ||
            JSON.stringify(identity) !== JSON.stringify(verifiedDocumentResult) ||
            JSON.stringify(identity) !== JSON.stringify(publishedDocumentResult) || !verifyMarkdownItem(identity, contentOptions)) {
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
      if (contentOptions && JSON.stringify(result?.publication_binding) !==
          JSON.stringify((await retryDocumentControl(() => confirmPublication(state, item))).publication_binding)) throw publicationUnconfirmed();
      markMappingPending(item, expectedPackageId, result.document_result, state);
      clearRetryBudget(item);
      writeState(state);
      try {
        if (contentOptions) require('./standalone-anonymized-mapping').ensurePrivateMappingIntent(state, item);
        else ensureMappingOutbox(item.source_label || item.name, expectedPackageId, item.document_result);
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
        commitPendingMapping(item, expectedPackageId, state);
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
      // A failed ownership boundary is not a decision about this document and
      // cannot authorize another journal write or source-copy cleanup here.
      if (isOwnershipControlFailure(error)) throw error;
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
        invalidateUnpublishedBatchCopies(state, { ...contentDependencies, writeState }, item);
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
        if (converting) delete item.local_mapping_exported;
        else item.local_mapping_exported = false;
        item.work_copy_cleanup_pending = true;
        // The stop decision is the authoritative commit point. Mapping and
        // cleanup are separately recoverable projections of that decision.
        writeState(state);
        try {
          if (!converting) {
            appendMapping(item.source_label || item.name, '', mappingStoppedStatus, {
              mappingReference: item.id,
              documentResult: item.document_result
            });
            item.local_mapping_exported = true;
            writeState(state);
          }
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
      const localEvidenceExported = !converting && item.status === 'stopped' && item.local_mapping_exported !== true
        ? false
        : writeTerminalEvidence(state);
      return {
        ok: false,
        error: code,
        message: publicFailureMessage(code, classified),
        ...publicProgress(state),
        local_mapping_exported: !converting && item.status === 'stopped' ? item.local_mapping_exported : null,
        local_evidence_exported: localEvidenceExported,
        raw_content_sent_to_claude: false
      };
    }
  }

  return { processSingleBatchItem };
}

module.exports = { createBatchItemProcessor, retryDocumentControl };
