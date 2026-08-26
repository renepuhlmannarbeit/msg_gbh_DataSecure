'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots, sha256File } = require('./common');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, STOPPED } = require('./mapping');

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

  function publishedPackageState(packageId) {
    if (!/^ds_[a-f0-9]{32}$/i.test(String(packageId || ''))) return 'unsafe';
    let output;
    try { output = storageRoots().output; } catch { return 'unsafe'; }
    const target = pathApi.join(output, packageId);
    if (pathApi.dirname(target) !== output) return 'unsafe';
    if (!io.existsSync(target)) return 'missing';
    try {
      const folder = io.lstatSync(target);
      if (!folder.isDirectory() || folder.isSymbolicLink()) return false;
      const manifestPath = pathApi.join(target, 'manifest.json');
      const documentPath = pathApi.join(target, `${packageId}.md`);
      const manifestStat = io.lstatSync(manifestPath);
      const documentStat = io.lstatSync(documentPath);
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink() ||
          !documentStat.isFile() || documentStat.isSymbolicLink()) return false;
      const manifest = JSON.parse(io.readFileSync(manifestPath, 'utf8'));
      return manifest?.schema === 'eu-privacy-package/2' && manifest.package_id === packageId &&
        manifest.document === `${packageId}.md` && /^[a-f0-9]{64}$/i.test(String(manifest.document_sha256 || '')) &&
        hashFile(documentPath) === manifest.document_sha256 ? 'verified' : 'unsafe';
    } catch { return 'unsafe'; }
  }

  function regularPublishedPackage(packageId) {
    return publishedPackageState(packageId) === 'verified';
  }

  function markMappingPending(item, packageId) {
    if (!regularPublishedPackage(packageId)) {
      throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
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
    const outbox = persistMappingIntent(item.name, packageId);
    item.mapping_outbox_persisted = true;
    writeMapping(item.name, packageId);
    clearMappingIntent(outbox);
    delete item.mapping_outbox_persisted;
  }

  function reconcilePendingMappings(state) {
    let changed = false;
    for (const item of state.items || []) {
      if (item.status !== mappingPendingStatus) continue;
      const packageId = String(item.package_id || '');
      if (!regularPublishedPackage(packageId)) continue;
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
      if (item.status !== preflightMappingPendingStatus) continue;
      if (!/^[a-f0-9]{32}$/i.test(String(item.id || '')) ||
        item.checkpoint !== 'source_preflight_rejected' ||
        !/^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || '')) ||
        Object.hasOwn(item, 'work_name') || Object.hasOwn(item, 'sha256') ||
        Object.hasOwn(item, 'package_id')) {
        continue;
      }
      try {
        writeMapping(item.name, '', STOPPED, { mappingReference: item.id });
        item.status = 'stopped';
        item.checkpoint = 'source_preflight_stopped';
        item.local_mapping_exported = true;
        changed = true;
      } catch {
        // The terminal admission decision is durable already. Keep its local
        // mapping checkpoint pending; a later maintenance pass retries the
        // same idempotent row without ever snapshotting or parsing the source.
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
      if (!regularPublishedPackage(packageId)) continue;
      markMappingPending(item, packageId);
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
