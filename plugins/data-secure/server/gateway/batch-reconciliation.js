'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBoundFile, bindDirectory, assertDirectory } = require('../core/bound-file-io');
const { SafeError } = require('../runtime');
const { roots } = require('./common');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, STOPPED } = require('./mapping');
const {
  GRADES,
  validateDocumentResult,
  positiveDocumentResult,
  sameDocumentResult,
  notProcessedDocumentResult,
  validateManifestDocumentResult
} = require('./document-result-grade');
const { packageIdentityMatches } = require('./package-identity');
const { artifactRoot, readMarkdownArtifact, metadata, verifyMarkdownItem } = require('../standalone/markdown-store');
const { applyRetryBudget, clearRetryBudget, isDocumentControlBusy, isOwnershipControlFailure, retryDocumentControl } = require('./prepublication-error');
const { isMarkdownBatch } = require('../core/processing-mode');
const { contentOptionsForBatch, serializeContentOptions } = require('../core/content-options');
const { privatePublicationRecord, confirmPublication } = require('./standalone-anonymized-batch');

function createBatchReconciliation(options = {}) {
  const io = options.io || fs;
  const pathApi = options.path || path;
  const storageRoots = options.roots || roots;
  const hashBytes = options.sha256Bytes || (bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  const persistMappingIntent = options.ensureMappingOutbox || ensureMappingOutbox;
  const writeMapping = options.appendMapping || appendMapping;
  const clearMappingIntent = options.removeMappingOutbox || removeMappingOutbox;
  const ErrorType = options.SafeError || SafeError;
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const preflightMappingPendingStatus = options.preflightMappingPendingStatus || 'preflight_mapping_pending';

  function publishedMarkdownArtifactRecord(artifactId, contentOptions, state, item) {
    if (state && contentOptions) {
      try {
        if (!isMarkdownBatch(state) || serializeContentOptions(contentOptions) !== serializeContentOptions(contentOptionsForBatch(state)))
          return { state: 'unsafe' };
        require('./standalone-document-review-store').createDocumentReviewStore().assertDocumentBinding(state, item);
      } catch { return { state: 'unsafe' }; }
    }
    if (!/^dm_[a-f0-9]{32}$/u.test(String(artifactId || ''))) return { state: 'unsafe' };
    // Only the absence of the publication directory means "not published".
    // A missing member of an existing directory is an incomplete/unsafe
    // publication, not permission to overwrite that deterministic identity.
    let target, directory;
    try { const output = artifactRoot(); directory = bindDirectory(output); target = path.join(output, artifactId); }
    catch { return { state: 'unsafe' }; }
    try { fs.lstatSync(target); }
    catch (error) {
      try {
        assertDirectory(directory);
        if (state && contentOptions && (['delivery_pending', 'released'].includes(item.status) || item.checkpoint === 'package_published' ||
            require('./standalone-document-review-store').createDocumentReviewStore().hasPublicationEvidence(state, item)))
          return { state: 'unsafe' };
        return { state: error?.code === 'ENOENT' ? 'missing' : 'unsafe' };
      }
      catch { return { state: 'unsafe' }; }
    }
    try { const record = metadata(readMarkdownArtifact(artifactId, contentOptions).manifest); assertDirectory(directory);
      return { state: 'verified', ...record }; }
    catch { return { state: 'unsafe' }; }
  }

  function packageIdForItem(item) {
    if (!/^[a-f0-9]{32}$/i.test(String(item?.id || ''))) {
      throw new ErrorType('Die lokale Batch-Identität ist ungültig.');
    }
    return `ds_${item.id}`;
  }

  function publishedPackageRecord(packageId, state, item) {
    const record = (state, documentResult = null) => ({ state, document_result: documentResult });
    if (state) {
      try {
        if (contentOptionsForBatch(state)) return privatePublicationRecord(packageId, state, item);
      } catch (error) {
        if (isDocumentControlBusy(error) || isOwnershipControlFailure(error)) throw error;
        return record('unsafe');
      }
    }
    if (!/^ds_[a-f0-9]{32}$/i.test(String(packageId || ''))) return record('unsafe');
    let output;
    try { output = storageRoots().output; } catch { return record('unsafe'); }
    const target = pathApi.join(output, packageId);
    if (pathApi.dirname(target) !== output) return record('unsafe');
    if (!io.existsSync(target)) return record('missing');
    try {
      const folder = io.lstatSync(target);
      if (!folder.isDirectory() || folder.isSymbolicLink()) return record('structurally_unsafe');
      const manifestPath = pathApi.join(target, 'manifest.json');
      const documentPath = pathApi.join(target, `${packageId}.md`);
      const manifestStat = io.lstatSync(manifestPath);
      const documentStat = io.lstatSync(documentPath);
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink() ||
          !documentStat.isFile() || documentStat.isSymbolicLink()) return record('structurally_unsafe');
      const directory = bindDirectory(target, { io });
      const manifest = JSON.parse(readBoundFile(manifestPath, { io, directory, maximum: 1024 * 1024, minimum: 1 }));
      const documentBytes = readBoundFile(documentPath, { io, directory, maximum: 32 * 1024 * 1024 });
      const supportedSchema = ['eu-privacy-package/2', 'eu-privacy-package/3'].includes(manifest?.schema);
      const documentResult = manifest?.schema === 'eu-privacy-package/3'
        ? validateManifestDocumentResult(manifest)
        : null;
      const verified = supportedSchema && manifest.package_id === packageId && manifest.document === `${packageId}.md` &&
        /^[a-f0-9]{64}$/i.test(String(manifest.document_sha256 || '')) &&
        hashBytes(documentBytes) === manifest.document_sha256;
      return verified ? record('verified', documentResult) : record('unsafe');
    } catch { return record('unsafe'); }
  }

  function publishedPackageState(packageId, state, item) {
    const value = publishedPackageRecord(packageId, state, item).state;
    return value === 'structurally_unsafe' ? false : value;
  }

  function publishedPackageIdentityRecord(item, state) {
    if (state && contentOptionsForBatch(state)) return publishedPackageRecord(item?.package_id, state, item);
    const documentResult = item?.document_result || null;
    try {
      positiveDocumentResult(documentResult);
      return packageIdentityMatches(item?.package_id, item?.package_identity)
        ? { state: 'verified', document_result: documentResult }
        : { state: 'unsafe', document_result: null };
    } catch {
      return { state: 'unsafe', document_result: null };
    }
  }

  function regularPublishedPackage(packageId, state, item) {
    return publishedPackageState(packageId, state, item) === 'verified';
  }

  function applyMappingPending(item, packageId, documentResult, published) {
    if (published.state !== 'verified') {
      throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
    }
    if (published.document_result) {
      positiveDocumentResult(documentResult);
      if (!sameDocumentResult(documentResult, published.document_result)) {
        throw new ErrorType('Der Ergebnisgrad stimmt nicht mit dem veröffentlichten Paket überein.');
      }
      item.document_result = documentResult;
    } else if (documentResult !== undefined && documentResult !== null) {
      throw new ErrorType('Ein historisches Paket darf keinen nachträglich erfundenen Ergebnisgrad erhalten.');
    }
    // Mapping is a durable local convenience ledger, not the publication
    // commit point. The caller persists this state before the CSV replacement.
    item.status = mappingPendingStatus;
    item.checkpoint = 'mapping_pending';
    item.package_id = packageId;
    item.error_code = 'LOCAL_MAPPING_EXPORT_PENDING';
    if (item.mapping_outbox_persisted !== true) item.mapping_outbox_persisted = false;
    item.work_copy_cleanup_pending = true;
  }

  function markMappingPending(item, packageId, documentResult, state) {
    return applyMappingPending(item, packageId, documentResult, publishedPackageRecord(packageId, state, item));
  }

  async function markMappingPendingAsync(item, packageId, documentResult, state) {
    // The private reader performs only idempotent metadata verification. Keep
    // the item mutation outside its retry boundary and execute it once.
    const published = await retryDocumentControl(() => publishedPackageRecord(packageId, state, item));
    return applyMappingPending(item, packageId, documentResult, published);
  }

  function commitPendingMapping(item, packageId, state) {
    if (state && contentOptionsForBatch(state)) {
      if (packageId !== `ds_${item.id}`) throw new ErrorType('Die veröffentlichte Paketidentität ist ungültig.');
      require('./standalone-anonymized-mapping').commitPrivateMapping(state, item);
      delete item.mapping_outbox_persisted;
      return;
    }
    // Recovery order is contractual: durable intent, idempotent CSV, then
    // removal of the intent. Journal publication remains the caller's duty.
    const outbox = persistMappingIntent(item.source_label || item.name, packageId, item.document_result);
    item.mapping_outbox_persisted = true;
    writeMapping(item.source_label || item.name, packageId, undefined, { documentResult: item.document_result });
    clearMappingIntent(outbox);
    delete item.mapping_outbox_persisted;
  }

  async function commitPendingMappingAsync(item, packageId, state) {
    if (state && contentOptionsForBatch(state)) {
      if (packageId !== `ds_${item.id}`) throw new ErrorType('Die veröffentlichte Paketidentität ist ungültig.');
      await require('./standalone-anonymized-mapping').commitPrivateMappingAsync(state, item);
      delete item.mapping_outbox_persisted;
      return;
    }
    // Existing legacy intent/CSV/finish semantics, once and without retries.
    return commitPendingMapping(item, packageId, state);
  }

  function reconcilePendingMappings(state) {
    let changed = false;
    for (const item of state.items || []) {
      if (item.status !== mappingPendingStatus) continue;
      const packageId = String(item.package_id || '');
      const published = publishedPackageRecord(packageId, state, item);
      if (published.state !== 'verified') continue;
      if (published.document_result && !sameDocumentResult(item.document_result, published.document_result)) continue;
      if (!published.document_result && Object.hasOwn(item, 'document_result')) continue;
      try {
        commitPendingMapping(item, packageId, state);
        item.status = deliveryPendingStatus;
        item.checkpoint = 'delivery_pending';
        delete item.error_code;
        changed = true;
      } catch (error) {
        if (isDocumentControlBusy(error) || isOwnershipControlFailure(error)) throw error;
        // Keep the verified package and durable pending state local. Never
        // manufacture a stopped row or expose mapping identity through MCP.
      }
    }
    return changed;
  }

  function reconcilePreflightStoppedMappings(state) {
    let changed = false;
    for (const item of state.items || []) {
      const preflightPending = item.status === preflightMappingPendingStatus &&
        item.checkpoint === 'source_preflight_rejected';
      const stoppedPending = item.status === 'stopped' && item.local_mapping_exported === false;
      if (!preflightPending && !stoppedPending) continue;
      if (!/^[a-f0-9]{32}$/i.test(String(item.id || '')) ||
        !/^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || '')) ||
        Object.hasOwn(item, 'package_id')) {
        continue;
      }
      if (preflightPending && (Object.hasOwn(item, 'work_name') || Object.hasOwn(item, 'sha256'))) continue;
      try {
        validateDocumentResult(item.document_result);
        if (item.document_result.grade !== GRADES.NOT_PROCESSED ||
          item.document_result.reason_code !== item.error_code) continue;
        if (!isMarkdownBatch(state)) writeMapping(item.source_label || item.name, '', STOPPED, {
          mappingReference: item.id, documentResult: item.document_result
        });
        item.status = 'stopped';
        if (preflightPending) item.checkpoint = 'source_preflight_stopped';
        item.local_mapping_exported = true;
        changed = true;
      } catch {
        // The terminal decision is durable already. Keep its local mapping
        // checkpoint pending; a later maintenance pass retries the same
        // idempotent row without reopening or reparsing the source.
      }
    }
    return changed;
  }

  function reconcilePublishedItems(state) {
    let changed = false;
    for (const item of state.items || []) {
      if (item.status !== 'processing') continue;
      if (isMarkdownBatch(state)) {
        if (!/^[a-f0-9]{32}$/u.test(String(item.id || ''))) continue;
        const record = publishedMarkdownArtifactRecord(`dm_${item.id}`, contentOptionsForBatch(state), state, item);
        if (record.state !== 'verified') continue;
        const { state: ignored, ...identity } = record;
        Object.assign(item, identity);
        clearRetryBudget(item);
        delete item.document_result;
        delete item.error_code;
        delete item.processing_started_at_ms;
        item.status = deliveryPendingStatus;
        item.checkpoint = 'delivery_pending';
        item.work_copy_cleanup_pending = true;
        changed = true;
        continue;
      }
      let packageId;
      try { packageId = packageIdForItem(item); } catch { continue; }
      // Verify again inside markMappingPending. Output may change between the
      // two reads; there is intentionally no cache in this trust boundary.
      const published = publishedPackageRecord(packageId, state, item);
      if (published.state !== 'verified') continue;
      if (!published.document_result && state.schema !== 'datasecure-batch/1') continue;
      // A V1 journal can have crashed after publishing a V2 package but before
      // its legacy mapping commit. Finish that exact historical commit without
      // manufacturing a DS-045 result; never process the deterministic package
      // path a second time.
      if (contentOptionsForBatch(state)) confirmPublication(state, item);
      markMappingPending(item, packageId, published.document_result, state);
      clearRetryBudget(item);
      changed = true;
    }
    return changed;
  }

  function markInterruptedItemsRetryable(state) {
    let recovered = 0;
    const stopRecovery = (item, code = 'RECOVERY_FAILED') => {
      item.status = 'stopped';
      item.checkpoint = code === 'RECOVERY_FAILED' ? 'recovery_failed' : 'stopped';
      item.error_code = code;
      item.document_result = notProcessedDocumentResult(code);
      if (isMarkdownBatch(state)) { delete item.local_mapping_exported; return; }
      item.local_mapping_exported = false;
      try {
        writeMapping(item.source_label || item.name, '', STOPPED, {
          mappingReference: item.id, documentResult: item.document_result
        });
        item.local_mapping_exported = true;
      } catch { /* the durable stopped-mapping checkpoint remains repairable */ }
    };
    for (const item of state.items || []) {
      if (item.status !== 'processing') continue;
      if (isMarkdownBatch(state)) {
        const publication = publishedMarkdownArtifactRecord(`dm_${item.id}`, contentOptionsForBatch(state), state, item);
        // A verified publication belongs to reconcilePublishedItems, never a
        // fresh conversion. A missing target is safe to retry after clearing
        // its unverified locator; unknown/mutated files are not overwritten.
        if (publication.state === 'verified') continue;
        for (const field of ['artifact_id', 'artifact_sha256', 'artifact_bytes', 'extraction_grade', 'reason_codes']) delete item[field];
        if (publication.state !== 'missing') {
          stopRecovery(item);
          recovered++;
          continue;
        }
      } else {
        let packageId;
        try { packageId = packageIdForItem(item); }
        catch { stopRecovery(item); recovered++; continue; }
        const publication = publishedPackageRecord(packageId, state, item);
        if (publication.state === 'verified') continue;
        if (publication.state !== 'missing') {
          stopRecovery(item);
          recovered++;
          continue;
        }
      }
      const retry = applyRetryBudget(item, {
        code: 'PROCESSING_INTERRUPTED', retryable: true, deferred: false
      });
      if (retry.retryable) {
        item.status = 'retryable';
        item.error_code = 'PROCESSING_INTERRUPTED';
        item.checkpoint = 'retryable';
      } else stopRecovery(item, 'RETRY_LIMIT_EXCEEDED');
      recovered++;
    }
    return recovered;
  }

  return {
    packageIdForItem,
    publishedPackageRecord,
    publishedMarkdownArtifactRecord,
    verifyMarkdownItem,
    publishedPackageIdentityRecord,
    publishedPackageState,
    regularPublishedPackage,
    markMappingPending,
    markMappingPendingAsync,
    commitPendingMapping,
    commitPendingMappingAsync,
    reconcilePendingMappings,
    reconcilePreflightStoppedMappings,
    reconcilePublishedItems,
    markInterruptedItemsRetryable
  };
}

module.exports = { createBatchReconciliation };
