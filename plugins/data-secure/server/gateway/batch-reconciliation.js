'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots, sha256File } = require('./common');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, STOPPED } = require('./mapping');
const {
  GRADES,
  validateDocumentResult,
  positiveDocumentResult,
  sameDocumentResult,
  validateManifestDocumentResult
} = require('./document-result-grade');
const { packageIdentityMatches } = require('./package-identity');

function createBatchReconciliation(options = {}) {
  const io = options.io || fs;
  const pathApi = options.path || path;
  const storageRoots = options.roots || roots;
  const hashFile = options.sha256File || sha256File;
  const persistMappingIntent = options.ensureMappingOutbox || ensureMappingOutbox;
  const writeMapping = options.appendMapping || appendMapping;
  const clearMappingIntent = options.removeMappingOutbox || removeMappingOutbox;
  const ErrorType = options.SafeError || SafeError;
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const preflightMappingPendingStatus = options.preflightMappingPendingStatus || 'preflight_mapping_pending';

  function packageIdForItem(item) {
    if (!/^[a-f0-9]{32}$/i.test(String(item?.id || ''))) {
      throw new ErrorType('Die lokale Batch-Identität ist ungültig.');
    }
    return `ds_${item.id}`;
  }

  function publishedPackageRecord(packageId) {
    const record = (state, documentResult = null) => ({ state, document_result: documentResult });
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
      const manifest = JSON.parse(io.readFileSync(manifestPath, 'utf8'));
      const supportedSchema = ['eu-privacy-package/2', 'eu-privacy-package/3'].includes(manifest?.schema);
      const documentResult = manifest?.schema === 'eu-privacy-package/3'
        ? validateManifestDocumentResult(manifest)
        : null;
      const verified = supportedSchema && manifest.package_id === packageId && manifest.document === `${packageId}.md` &&
        /^[a-f0-9]{64}$/i.test(String(manifest.document_sha256 || '')) &&
        hashFile(documentPath) === manifest.document_sha256;
      return verified ? record('verified', documentResult) : record('unsafe');
    } catch { return record('unsafe'); }
  }

  function publishedPackageState(packageId) {
    const value = publishedPackageRecord(packageId).state;
    return value === 'structurally_unsafe' ? false : value;
  }

  function publishedPackageIdentityRecord(item) {
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

  function regularPublishedPackage(packageId) {
    return publishedPackageState(packageId) === 'verified';
  }

  function markMappingPending(item, packageId, documentResult) {
    const published = publishedPackageRecord(packageId);
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

  function commitPendingMapping(item, packageId) {
    // Recovery order is contractual: durable intent, idempotent CSV, then
    // removal of the intent. Journal publication remains the caller's duty.
    const outbox = persistMappingIntent(item.source_label || item.name, packageId, item.document_result);
    item.mapping_outbox_persisted = true;
    writeMapping(item.source_label || item.name, packageId, undefined, { documentResult: item.document_result });
    clearMappingIntent(outbox);
    delete item.mapping_outbox_persisted;
  }

  function reconcilePendingMappings(state) {
    let changed = false;
    for (const item of state.items || []) {
      if (item.status !== mappingPendingStatus) continue;
      const packageId = String(item.package_id || '');
      const published = publishedPackageRecord(packageId);
      if (published.state !== 'verified') continue;
      if (published.document_result && !sameDocumentResult(item.document_result, published.document_result)) continue;
      if (!published.document_result && Object.hasOwn(item, 'document_result')) continue;
      try {
        commitPendingMapping(item, packageId);
        item.status = deliveryPendingStatus;
        item.checkpoint = 'delivery_pending';
        delete item.error_code;
        changed = true;
      } catch {
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
        writeMapping(item.source_label || item.name, '', STOPPED, {
          mappingReference: item.id,
          documentResult: item.document_result
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
      let packageId;
      try { packageId = packageIdForItem(item); } catch { continue; }
      // Verify again inside markMappingPending. Output may change between the
      // two reads; there is intentionally no cache in this trust boundary.
      const published = publishedPackageRecord(packageId);
      if (published.state !== 'verified') continue;
      if (!published.document_result && state.schema !== 'datasecure-batch/1') continue;
      // A V1 journal can have crashed after publishing a V2 package but before
      // its legacy mapping commit. Finish that exact historical commit without
      // manufacturing a DS-045 result; never process the deterministic package
      // path a second time.
      markMappingPending(item, packageId, published.document_result);
      changed = true;
    }
    return changed;
  }

  function markInterruptedItemsRetryable(state) {
    let recovered = 0;
    for (const item of state.items || []) {
      if (item.status !== 'processing') continue;
      item.status = 'retryable';
      item.error_code = 'PROCESSING_INTERRUPTED';
      item.checkpoint = 'retryable';
      recovered++;
    }
    return recovered;
  }

  return {
    packageIdForItem,
    publishedPackageRecord,
    publishedPackageIdentityRecord,
    publishedPackageState,
    regularPublishedPackage,
    markMappingPending,
    commitPendingMapping,
    reconcilePendingMappings,
    reconcilePreflightStoppedMappings,
    reconcilePublishedItems,
    markInterruptedItemsRetryable
  };
}

module.exports = { createBatchReconciliation };
