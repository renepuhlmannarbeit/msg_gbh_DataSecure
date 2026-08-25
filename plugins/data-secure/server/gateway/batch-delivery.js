'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { workPath } = require('./batch-private-store');

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
    if (!WORK_NAME_RE.test(String(item?.work_name || ''))) {
      throw new ErrorType('Private Arbeitskopie ist nicht sicher bereinigbar.');
    }
    const full = pathApi.join(resolveWorkPath(state.token), item.work_name);
    if (io.existsSync(full)) {
      const stat = io.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new ErrorType('Private Arbeitskopie ist nicht sicher bereinigbar.');
      }
      (deps.unlinkWorkCopy || io.unlinkSync)(full);
    }
    delete item.work_copy_cleanup_pending;
  }

  function enter(token, operation) {
    if (active.has(token)) throw new ErrorType('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    acquireActiveLock(token);
    active.add(token);
    try {
      return operation();
    } finally {
      active.delete(token);
      releaseActiveLock(token);
    }
  }

  function acknowledgeDeliveredPackage(token, packageId, deps = {}) {
    return enter(token, () => {
      const state = readState(token);
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
      const item = state.items.find((candidate) =>
        candidate.status === deliveryPendingStatus && candidate.package_id === packageId
      );
      if (!item || !regularPublishedPackage(packageId)) {
        throw new ErrorType('Das lokal veröffentlichte Paket konnte nicht sicher abgeschlossen werden.');
      }
      item.status = 'released';
      item.checkpoint = 'released_locally';
      item.analysis_acknowledged = false;
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
