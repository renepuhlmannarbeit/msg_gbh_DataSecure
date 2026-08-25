'use strict';

const fs = require('fs');
const path = require('path');
const { batchRoot } = require('./batch-private-store');

function createBatchRetentionProtection(options = {}) {
  const defaultIo = options.io || fs;
  const pathApi = options.path || path;
  const rootPath = options.batchRoot || batchRoot;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';

  // Cross-reference every still-open batch item with the Output scope so
  // retention never deletes a package a batch still needs for delivery or
  // mapping. Any incomplete inspection blocks the whole automatic cleanup;
  // a bad private journal can therefore delay retention, never weaken it.
  function openBatchPackageProtection(fsApi = defaultIo) {
    const ids = new Set();
    // Resolve the configured root for every scan. A configuration error is
    // intentionally distinct from an unreadable existing directory.
    const dir = rootPath();
    let entries;
    try {
      entries = fsApi.readdirSync(dir, { withFileTypes: true });
    } catch {
      return { ids, complete: false };
    }
    for (const entry of entries) {
      if (!entry.isFile || !entry.isFile() || !entry.name.endsWith('.json')) continue;
      let state;
      try {
        state = JSON.parse(fsApi.readFileSync(pathApi.join(dir, entry.name), 'utf8'));
      } catch {
        return { ids, complete: false };
      }
      if (state?.schema !== 'datasecure-batch/1' || !Array.isArray(state.items)) {
        return { ids, complete: false };
      }
      for (const item of state.items) {
        if ((item?.status === deliveryPendingStatus || item?.status === mappingPendingStatus) &&
          /^ds_[a-f0-9]{32}$/i.test(String(item?.package_id || ''))) {
          ids.add(item.package_id);
        }
      }
    }
    return { ids, complete: true };
  }

  return { openBatchPackageProtection };
}

module.exports = { createBatchRetentionProtection };
