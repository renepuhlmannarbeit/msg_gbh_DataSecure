'use strict';

const {
  notProcessedDocumentResult,
  normalizeDocumentResultReasonCode,
  positiveDocumentResult,
  sameDocumentResult
} = require('./document-result-grade');

function createBatchReviewPublication(options = {}) {
  const anonymizeNext = options.anonymizeNext;
  const exactPendingEntry = options.exactPendingEntry;
  const packageIdForItem = options.packageIdForItem;
  const reviewedBatchText = options.reviewedBatchText;
  const writeState = options.writeState;
  const ensureMappingOutbox = options.ensureMappingOutbox;
  const markMappingPending = options.markMappingPending;
  const cleanupTerminalWorkCopy = options.cleanupTerminalWorkCopy;
  const commitPendingMapping = options.commitPendingMapping;
  const deliveryResult = options.deliveryResult;
  const appendMapping = options.appendMapping;
  const invalidDecisionError = options.invalidDecisionError;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const retryableCodes = options.retryableCodes || new Set();
  const mappingStoppedStatus = options.mappingStoppedStatus || 'sicher gestoppt';

  function invalidBinding() {
    return invalidDecisionError(
      'BATCH_REVIEW_DECISION_BINDING_INVALID',
      'Die lokale Stapelentscheidung konnte den Dokumenten nicht sicher zugeordnet werden. Es wurde nichts freigegeben.'
    );
  }

  function unconfirmedPublication() {
    return invalidDecisionError(
      'BATCH_REVIEW_PUBLICATION_UNCONFIRMED',
      'Die lokale Paketveröffentlichung konnte nicht sicher bestätigt werden. Der Stapel bleibt lokal fortsetzbar.'
    );
  }

  function bindReviewedDocuments(items, drafts, reviewedDocuments) {
    if (!Array.isArray(items) || items.length < 1 || !Array.isArray(drafts) ||
        drafts.length !== items.length || !Array.isArray(reviewedDocuments) ||
        reviewedDocuments.length !== items.length) throw invalidBinding();

    const decisionsByIndex = new Map();
    for (const document of reviewedDocuments) {
      const index = document?.document_index;
      if (!document || Object.keys(document).sort().join(',') !== 'decisions,document_index' ||
          !Number.isSafeInteger(index) || index < 1 || index > items.length ||
          decisionsByIndex.has(index) || !Array.isArray(document.decisions)) {
        throw invalidBinding();
      }
      decisionsByIndex.set(index, document.decisions);
    }

    for (let index = 1; index <= items.length; index++) {
      const draft = drafts[index - 1];
      const decisions = decisionsByIndex.get(index);
      const ambiguities = Array.isArray(draft?.ambiguities) ? draft.ambiguities : null;
      if (!ambiguities || !decisions) throw invalidBinding();
      const expectedIds = new Set();
      for (const ambiguity of ambiguities) {
        const id = ambiguity?.ambiguity_id;
        if (typeof id !== 'string' || id.length < 1 || expectedIds.has(id)) throw invalidBinding();
        expectedIds.add(id);
      }
      const decisionIds = new Set();
      for (const decision of decisions) {
        const id = decision?.ambiguity_id;
        if (!decision || Object.keys(decision).sort().join(',') !== 'ambiguity_id,decision' ||
            typeof id !== 'string' || !expectedIds.has(id) || decisionIds.has(id) ||
            !['keep', 'redact'].includes(decision.decision)) throw invalidBinding();
        decisionIds.add(id);
      }
      if (decisionIds.size !== expectedIds.size) throw invalidBinding();
      try { reviewedBatchText(draft, decisions); }
      catch { throw invalidBinding(); }
    }
    return decisionsByIndex;
  }

  async function publishReviewedBatch(state, items, drafts, reviewedDocuments, deps = {}) {
    // Validate the complete local result before the first durable status change
    // or publication. Array order is irrelevant; document_index is the binding.
    const decisionsByIndex = bindReviewedDocuments(items, drafts, reviewedDocuments);
    const packages = [];
    let locallyReleased = 0;
    let failed = 0;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const previous = {
        status: item.status,
        checkpoint: item.checkpoint,
        hasErrorCode: Object.hasOwn(item, 'error_code'),
        errorCode: item.error_code
      };
      item.status = 'processing';
      item.checkpoint = 'batch_review_publish_started';
      delete item.error_code;
      try { writeState(state); }
      catch (error) {
        item.status = previous.status;
        item.checkpoint = previous.checkpoint;
        if (previous.hasErrorCode) item.error_code = previous.errorCode;
        else delete item.error_code;
        throw error;
      }
      let packagePublished = false;
      let publishedPackageId;
      let publicationContractFailed = false;
      let verifiedDocumentResult;
      let publishedDocumentResult;
      try {
        const entry = exactPendingEntry(state, item);
        const result = await anonymizeNext(state.profile, {
          ...deps,
          inputQueue: [entry],
          copyClaim: true,
          removeImages: state.remove_images,
          packageId: packageIdForItem(item),
          reviewText: (input) => reviewedBatchText(input, decisionsByIndex.get(index + 1)),
          beforePublish: async (details) => {
            positiveDocumentResult(details?.document_result);
            verifiedDocumentResult = details.document_result;
            item.checkpoint = 'package_verified';
            writeState(state, { durable: false });
            if (deps.beforePublish) await deps.beforePublish(details);
          },
          afterPublish: async (details) => {
            // The output rename is the publication commit point. Every later
            // failure must remain recoverable through package reconciliation;
            // it must never be downgraded to a parser stop or trigger cleanup.
            packagePublished = true;
            publishedPackageId = packageIdForItem(item);
            positiveDocumentResult(details?.document_result);
            if (!sameDocumentResult(details.document_result, verifiedDocumentResult)) throw unconfirmedPublication();
            publishedDocumentResult = details.document_result;
            item.checkpoint = 'package_published';
            writeState(state, { durable: false });
          }
        });
        if (!packagePublished || typeof result?.package_id !== 'string' || result.package_id !== publishedPackageId ||
          !sameDocumentResult(result?.document_result, verifiedDocumentResult) ||
          !sameDocumentResult(result?.document_result, publishedDocumentResult)) {
          publicationContractFailed = true;
          item.status = 'processing';
          item.checkpoint = packagePublished ? 'package_published' : 'publication_unconfirmed';
          item.package_id = publishedPackageId || packageIdForItem(item);
          item.error_code = 'PROCESSING_INTERRUPTED';
          item.work_copy_cleanup_pending = true;
          throw unconfirmedPublication();
        }
        markMappingPending(item, result.package_id, result.document_result);
        writeState(state);
        try {
          ensureMappingOutbox(item.name, result.package_id, item.document_result);
          item.mapping_outbox_persisted = true;
        } catch {
          continue;
        }
        writeState(state);
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
        writeState(state);
        try { commitPendingMapping(item, result.package_id); }
        catch { continue; }
        if (deps.localFinalize === true) {
          item.status = 'released';
          item.checkpoint = 'released_locally';
          item.analysis_acknowledged = false;
          try { cleanupTerminalWorkCopy(state, item, deps); }
          catch { item.work_copy_cleanup_pending = true; }
        } else {
          item.status = deliveryPendingStatus;
          item.checkpoint = 'delivery_pending';
          delete item.error_code;
          item.work_copy_cleanup_pending = true;
        }
        writeState(state);
        if (deps.localFinalize === true) locallyReleased++;
        else packages.push(deliveryResult(state, item));
      } catch (error) {
        if (publicationContractFailed) throw error;
        if (packagePublished) {
          item.status = 'processing';
          item.checkpoint = 'package_published';
          item.package_id = publishedPackageId;
          item.error_code = 'PROCESSING_INTERRUPTED';
          item.work_copy_cleanup_pending = true;
          failed++;
          continue;
        }
        const reportedCode = String(error?.code || 'PROCESSING_INTERRUPTED');
        const code = retryableCodes.has(reportedCode)
          ? reportedCode
          : normalizeDocumentResultReasonCode(reportedCode);
        item.status = retryableCodes.has(code) ? 'retryable' : 'stopped';
        item.checkpoint = item.status === 'retryable' ? 'retryable' : 'stopped';
        item.error_code = code;
        if (item.status === 'stopped') {
          item.document_result = notProcessedDocumentResult(code);
          item.local_mapping_exported = false;
          item.work_copy_cleanup_pending = true;
          writeState(state);
          try {
            appendMapping(item.name, '', mappingStoppedStatus, {
              mappingReference: item.id,
              documentResult: item.document_result
            });
            item.local_mapping_exported = true;
            writeState(state);
          }
          catch { failed++; continue; }
          try {
            cleanupTerminalWorkCopy(state, item, deps);
            item.work_copy_cleanup_pending = false;
          }
          catch { item.work_copy_cleanup_pending = true; }
        }
        failed++;
        writeState(state);
      }
    }
    return { packages, locallyReleased, failed };
  }

  return { bindReviewedDocuments, publishReviewedBatch };
}

module.exports = { createBatchReviewPublication };
