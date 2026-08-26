'use strict';

const { SafeError } = require('../runtime');

function createBatchExecutorRunner(options = {}) {
  const ErrorType = options.SafeError || SafeError;
  const currentPid = options.currentPid || (() => process.pid);
  const readState = options.readState;
  const writeState = options.writeState;
  const liveLocalExecutor = options.liveLocalExecutor;
  const publicProgress = options.publicProgress;
  const prepareProcessingRun = options.prepareProcessingRun;
  const incrementPrivateIoSummary = options.incrementPrivateIoSummary;
  const processBatchNext = options.processBatchNext;
  const finalizePublishedPackageLocally = options.finalizePublishedPackageLocally;
  const releaseLocalBatchExecutor = options.releaseLocalBatchExecutor;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';

  async function runLocalBatchExecutor(token, deps = {}) {
    const executorPid = Number(deps.executorPid ?? currentPid());
    const claimed = readState(token);
    // A failed ownership check must not enter the release-protected region:
    // an untrusted caller may never clear another process' valid lease.
    if (!liveLocalExecutor(claimed) || claimed.local_executor_pid !== executorPid) {
      throw new ErrorType('Der lokale Stapelprozessor besitzt keine gültige Ausführungsberechtigung.');
    }
    let lastProgress = publicProgress(claimed);
    try {
      // Expensive but mandatory housekeeping is established exactly once for a
      // claimed local batch. The opaque capability remains process-local.
      const preparedRun = prepareProcessingRun(deps);
      if (incrementPrivateIoSummary(claimed.io_summary, 'batch_maintenance_runs')) {
        writeState(claimed);
      }
      const batchDeps = { ...deps, preparedRun };
      const maximumSteps = claimed.items.length * 3 + 3;
      for (let step = 0; step < maximumSteps; step++) {
        if (lastProgress.delivery_pending > 0) {
          const state = readState(token);
          const pending = state.items.find((item) => item.status === deliveryPendingStatus);
          if (!pending) break;
          lastProgress = finalizePublishedPackageLocally(token, pending.package_id, { ...batchDeps, executorPid });
          continue;
        }
        if (lastProgress.mapping_pending > 0) {
          const before = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
          lastProgress = await processBatchNext(token, { ...batchDeps, executorPid });
          const after = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
          if (before === after) break;
          continue;
        }
        if (lastProgress.remaining === 0) break;
        const before = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
        const result = await processBatchNext(token, { ...batchDeps, executorPid });
        lastProgress = result;
        if (typeof result.package_id === 'string') {
          lastProgress = finalizePublishedPackageLocally(token, result.package_id, { ...batchDeps, executorPid });
          continue;
        }
        const after = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
        if (before === after) break;
      }
    } finally {
      releaseLocalBatchExecutor(token, executorPid);
    }
    return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
  }

  return { runLocalBatchExecutor };
}

module.exports = { createBatchExecutorRunner };
