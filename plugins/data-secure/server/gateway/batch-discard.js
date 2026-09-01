'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchPath, safeRemoveWorkDirectory } = require('./batch-private-store');

function createBatchDiscard(options = {}) {
  const io = options.io || fs;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const ErrorType = options.SafeError || SafeError;
  const journalPath = options.batchPath || batchPath;
  const removeWorkDirectory = options.safeRemoveWorkDirectory || safeRemoveWorkDirectory;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const recoverableBatchStates = options.recoverableBatchStates;
  const liveLocalExecutor = options.liveLocalExecutor;
  const removeState = options.removeState;

  function discardIncompleteBatches() {
    const maintenanceToken = randomBytes(32).toString('hex');
    acquireActiveLock(maintenanceToken);
    try {
      const states = recoverableBatchStates({ ignoreActiveLock: true, includeActiveExecutors: true });
      if (states.some((state) => liveLocalExecutor(state))) {
        throw new ErrorType('Ein lokaler Dokumentstapel wird noch verarbeitet und kann nicht verworfen werden.');
      }
      let discarded = 0;
      for (const state of states) {
        // A discard is a local, user-confirmed abandonment of the sealed source
        // snapshot. It never touches originals, published output packages,
        // the durable local mapping ledger or terminal evidence.
        removeWorkDirectory(state.token);
        removeState(state);
        discarded += 1;
      }
      return { ok: true, discarded_batches: discarded, raw_content_sent_to_claude: false };
    } finally {
      releaseActiveLock(maintenanceToken);
    }
  }

  return { discardIncompleteBatches };
}

module.exports = { createBatchDiscard };
