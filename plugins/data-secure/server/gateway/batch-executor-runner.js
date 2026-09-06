'use strict';

const { SafeError } = require('../runtime');
const { notProcessedDocumentResult } = require('./document-result-grade');
const { appendMapping, STOPPED } = require('./mapping');

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
  const writeTerminalEvidence = options.writeTerminalEvidence;
  const releaseLocalBatchExecutor = options.releaseLocalBatchExecutor;
  const appendStoppedMapping = options.appendMapping || appendMapping;
  const stoppedMappingStatus = options.stoppedMappingStatus || STOPPED;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const maxBatchFiles = options.maxBatchFiles || 100;

  function stopUnstartedConversionItems(token) {
    const state = readState(token);
    const pending = state.items.filter(item => ['pending', 'retryable'].includes(item.status));
    for (const item of pending) {
      item.status = 'stopped';
      item.checkpoint = 'stopped';
      item.error_code = 'CONVERSION_TERMINATION_UNCONFIRMED';
      item.document_result = notProcessedDocumentResult(item.error_code);
      item.local_mapping_exported = false;
      item.work_copy_cleanup_pending = true;
    }
    // Commit all non-start decisions before materialising their local mapping.
    // This is not proof that the preceding native process was terminated.
    if (pending.length) writeState(state);
    for (const item of pending) {
      try {
        appendStoppedMapping(item.source_label || item.name, '', stoppedMappingStatus, {
          mappingReference: item.id, documentResult: item.document_result
        });
        item.local_mapping_exported = true;
        writeState(state);
      } catch { /* terminal mapping debt remains explicitly repairable */ }
    }
  }

  async function runLocalBatchExecutor(token, deps = {}) {
    const executorPid = Number(deps.executorPid ?? currentPid());
    const claimed = readState(token);
    // A failed ownership check must not enter the release-protected region:
    // an untrusted caller may never clear another process' valid lease.
    if (!liveLocalExecutor(claimed) || claimed.local_executor_pid !== executorPid) {
      throw new ErrorType('Der lokale Stapelprozessor besitzt keine gültige Ausführungsberechtigung.');
    }
    let lastProgress = publicProgress(claimed);
    let interrupted = false;
    try {
      if (!Array.isArray(claimed.items) || claimed.items.length < 1 || claimed.items.length > maxBatchFiles) {
        throw new ErrorType('Der lokale Stapelzustand ist ungültig.');
      }
      // Expensive but mandatory housekeeping is established exactly once for a
      // claimed local batch. The opaque capability remains process-local.
      const conversion = claimed.schema === 'datasecure-batch/5' && claimed.processing_mode === 'markdown-only' && claimed.product_channel === 'standalone';
      const usesStandaloneConverter = claimed.product_channel === 'standalone';
      if (usesStandaloneConverter && claimed.items.some(item => item.error_code === 'CONVERSION_TERMINATION_UNCONFIRMED')) {
        interrupted = true;
        stopUnstartedConversionItems(token);
      }
      const preparedRun = conversion ? undefined : prepareProcessingRun(deps);
      if (!interrupted && incrementPrivateIoSummary(claimed.io_summary, 'batch_maintenance_runs')) {
        writeState(claimed);
      }
      const batchDeps = { ...deps, preparedRun };
      const maximumSteps = claimed.items.length * 3 + 3;
      for (let step = 0; !interrupted && step < maximumSteps; step++) {
        if (lastProgress.delivery_pending > 0) {
          const state = readState(token);
          const pending = state.items.find((item) => item.status === deliveryPendingStatus);
          if (!pending) break;
          lastProgress = finalizePublishedPackageLocally(token, pending.artifact_id || pending.package_id, { ...batchDeps, executorPid });
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
        if (usesStandaloneConverter && result.error === 'CONVERSION_TERMINATION_UNCONFIRMED') {
          interrupted = true;
          stopUnstartedConversionItems(token);
          break;
        }
        if (typeof result.package_id === 'string' || typeof result.artifact_id === 'string') {
          lastProgress = finalizePublishedPackageLocally(token, result.artifact_id || result.package_id, { ...batchDeps, executorPid });
          continue;
        }
        const after = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
        if (before === after) break;
      }
    } finally {
      if (releaseLocalBatchExecutor(token, executorPid) !== true) {
        throw new ErrorType('Der lokale Stapelprozessor konnte seine Ausführungsberechtigung nicht sicher freigeben.');
      }
    }
    // Publication and stopped-item paths already attempt this commit. Reconcile
    // once more at the worker boundary so an independently recoverable evidence
    // write cannot race the bounded terminal IPC summary. The operation is
    // idempotent and never changes a released/stopped document decision.
    let finalState = readState(token);
    let finalProgress = publicProgress(finalState);
    if (finalProgress.complete === true && typeof writeTerminalEvidence === 'function') {
      writeTerminalEvidence(finalState);
      finalProgress = publicProgress(readState(token));
    }
    return { ok: !interrupted, ...finalProgress,
      ...(interrupted ? { error: 'CONVERSION_TERMINATION_UNCONFIRMED' } : {}), raw_content_sent_to_claude: false };
  }

  return { runLocalBatchExecutor };
}

module.exports = { createBatchExecutorRunner };
