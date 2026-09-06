'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { workPath, assertPlainWorkFile } = require('./batch-private-store');
const { releaseOwnedLock } = require('./batch-lock-release');
const { verifyMarkdownItem } = require('../standalone/markdown-store');

function conversionBatch(state) {
  return state?.schema === 'datasecure-batch/5' && state.processing_mode === 'markdown-only' && state.product_channel === 'standalone';
}

const WORK_NAME_RE = /^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/i;

function createBatchDelivery(options = {}) {
  const ErrorType = options.SafeError || SafeError;
  const io = options.io || fs;
  const pathApi = options.path || path;
  const resolveWorkPath = options.workPath || workPath;
  const active = options.active;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const readState = options.readState;
  const writeState = options.writeState;
  const assertLocalExecutorAccess = options.assertLocalExecutorAccess;
  const regularPublishedPackage = options.regularPublishedPackage;
  const issueReadCapability = options.issueReadCapability;
  const publicProgress = options.publicProgress;
  const writeTerminalEvidence = options.writeTerminalEvidence;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';

  function deliveryResult(state, item) {
    if (conversionBatch(state)) {
      if (!verifyMarkdownItem(item)) throw new ErrorType('Das lokale Konvertat konnte nicht sicher verifiziert werden.');
      return { ok: true, artifact_id: item.artifact_id, processing_mode: 'markdown-only', anonymized: false,
        extraction_grade: item.extraction_grade, reason_codes: [...item.reason_codes],
        ...publicProgress(state), raw_content_sent_to_claude: false };
    }
    const packageId = String(item?.package_id || '');
    if (!regularPublishedPackage(packageId)) {
      throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
    }
    const readGrant = issueReadCapability(packageId);
    return {
      ok: true,
      package_id: packageId,
      read_capability: readGrant.read_capability,
      read_capability_expires_at: readGrant.read_capability_expires_at,
      verification: 'passed',
      raw_content_sent_to_claude: false,
      ...publicProgress(state)
    };
  }

  function cleanupTerminalWorkCopy(state, item, deps = {}) {
    if (state?.schema === 'datasecure-batch/3' || Object.hasOwn(item || {}, 'private_artifact_encrypted') ||
        Object.hasOwn(item || {}, 'legacy_work_name')) {
      const error = new ErrorType('Eine alte verschlüsselte Arbeitskopie bleibt unverändert erhalten.');
      error.code = 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED';
      throw error;
    }
    if (!WORK_NAME_RE.test(String(item?.work_name || ''))) {
      throw new ErrorType('Private Arbeitskopie ist nicht sicher bereinigbar.');
    }
    const full = pathApi.join(resolveWorkPath(state.token), item.work_name);
    if (io.existsSync(full)) {
      const stat = io.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new ErrorType('Private Arbeitskopie ist nicht sicher bereinigbar.');
      }
      assertPlainWorkFile(full, io);
      (deps.unlinkWorkCopy || io.unlinkSync)(full);
    }
    delete item.work_copy_cleanup_pending;
  }

  function enter(token, operation) {
    if (active.has(token)) throw new ErrorType('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    acquireActiveLock(token);
    active.add(token);
    let primaryError = false;
    try {
      return operation();
    } catch (error) {
      primaryError = true;
      throw error;
    } finally {
      active.delete(token);
      releaseOwnedLock(releaseActiveLock, token, ErrorType, primaryError);
    }
  }

  function acknowledgeDeliveredPackage(token, packageId, deps = {}) {
    return enter(token, () => {
      const state = readState(token);
      if (state.schema === 'datasecure-batch/5' || state.processing_mode === 'markdown-only') {
        throw new ErrorType('Nicht anonymisierte Konvertate sind keine Claude-Übergaben.');
      }
      assertLocalExecutorAccess(state, deps.executorPid);
      const item = state.items.find((candidate) =>
        [deliveryPendingStatus, 'released'].includes(candidate.status) && candidate.package_id === packageId
      );
      if (!item) throw new ErrorType('Für dieses Paket liegt keine bestätigbare Batch-Übergabe vor.');
      if (!regularPublishedPackage(packageId)) {
        throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
      }
      let changed = false;
      if (item.status === deliveryPendingStatus) {
        item.status = 'released';
        item.checkpoint = 'released';
        changed = true;
        try {
          cleanupTerminalWorkCopy(state, item, deps);
        } catch {
          item.work_copy_cleanup_pending = true;
        }
      }
      if (item.analysis_acknowledged !== true) {
        item.analysis_acknowledged = true;
        changed = true;
      }
      if (changed) writeState(state);
      return {
        ok: true,
        ...publicProgress(state),
        local_evidence_exported: writeTerminalEvidence(state),
        raw_content_sent_to_claude: false
      };
    });
  }

  function acknowledgeDeliveredPackages(token, packageIds, deps = {}) {
    if (!Array.isArray(packageIds) || packageIds.length < 1 || packageIds.length > 10 ||
      new Set(packageIds).size !== packageIds.length) {
      throw new ErrorType('Bitte zwischen 1 und 10 unterschiedliche Pakete bestätigen.');
    }
    return enter(token, () => {
      const state = readState(token);
      if (state.schema === 'datasecure-batch/5' || state.processing_mode === 'markdown-only') {
        throw new ErrorType('Nicht anonymisierte Konvertate sind keine Claude-Übergaben.');
      }
      assertLocalExecutorAccess(state, deps.executorPid);
      // Validate the whole page before changing any acknowledgement.
      const items = packageIds.map((packageId) => {
        const item = state.items.find((candidate) =>
          [deliveryPendingStatus, 'released'].includes(candidate.status) && candidate.package_id === packageId
        );
        if (!item || !regularPublishedPackage(packageId)) {
          throw new ErrorType('Für mindestens ein Paket liegt keine bestätigbare Batch-Übergabe vor.');
        }
        return item;
      });
      let changed = false;
      for (const item of items) {
        if (item.status === deliveryPendingStatus) {
          item.status = 'released';
          item.checkpoint = 'released';
          changed = true;
          try {
            cleanupTerminalWorkCopy(state, item, deps);
          } catch {
            item.work_copy_cleanup_pending = true;
          }
        }
        if (item.analysis_acknowledged !== true) {
          item.analysis_acknowledged = true;
          changed = true;
        }
      }
      if (changed) writeState(state);
      return {
        ok: true,
        acknowledged_count: items.length,
        ...publicProgress(state),
        local_evidence_exported: writeTerminalEvidence(state),
        raw_content_sent_to_claude: false
      };
    });
  }

  function finalizePublishedPackageLocally(token, packageId, deps = {}) {
    return enter(token, () => {
      const state = readState(token);
      assertLocalExecutorAccess(state, deps.executorPid);
      const converting = conversionBatch(state);
      const item = state.items.find((candidate) =>
        candidate.status === deliveryPendingStatus && (converting ? candidate.artifact_id : candidate.package_id) === packageId
      );
      if (!item || !(converting ? verifyMarkdownItem(item) : regularPublishedPackage(packageId))) {
        throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher abgeschlossen werden.');
      }
      item.status = 'released';
      item.checkpoint = 'released_locally';
      if (!converting) item.analysis_acknowledged = false;
      try {
        cleanupTerminalWorkCopy(state, item, deps);
      } catch {
        item.work_copy_cleanup_pending = true;
      }
      writeState(state);
      return {
        ok: true,
        ...publicProgress(state),
        local_evidence_exported: writeTerminalEvidence(state),
        raw_content_sent_to_claude: false
      };
    });
  }

  function retryReleasedWorkCopyCleanup(state, deps = {}) {
    let changed = false;
    let pending = 0;
    for (const item of state.items || []) {
      if (!['released', 'stopped', mappingPendingStatus].includes(item.status) ||
        item.work_copy_cleanup_pending !== true) continue;
      if (!WORK_NAME_RE.test(String(item.work_name || ''))) {
        pending++;
        continue;
      }
      try {
        cleanupTerminalWorkCopy(state, item, deps);
        changed = true;
      } catch {
        pending++;
      }
    }
    return { changed, pending };
  }

  return {
    deliveryResult,
    cleanupTerminalWorkCopy,
    acknowledgeDeliveredPackage,
    acknowledgeDeliveredPackages,
    finalizePublishedPackageLocally,
    retryReleasedWorkCopyCleanup
  };
}

module.exports = { createBatchDelivery, WORK_NAME_RE };
