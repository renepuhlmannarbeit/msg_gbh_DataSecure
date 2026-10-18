'use strict';

const { SafeError } = require('../runtime');
const { notProcessedDocumentResult, isDocumentResultReasonCode } = require('./document-result-grade');
const { ownErrorCode, recordBatchExecutionFailure, documentStabilizationBlocked } = require('./batch-execution-diagnostic');
const { appendMapping, STOPPED } = require('./mapping');
const { classifyPrepublicationError, applyRetryBudget } = require('./prepublication-error');
const { isMarkdownBatch } = require('../core/processing-mode');

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
  const cleanupTerminalWorkCopy = options.cleanupTerminalWorkCopy || (() => {});
  const retryableCodes = options.retryableCodes || new Set();
  const appendStoppedMapping = options.appendMapping || appendMapping;
  const stoppedMappingStatus = options.stoppedMappingStatus || STOPPED;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const maxBatchFiles = options.maxBatchFiles || 100;
  const pauseRequested = options.pauseRequested || (() => false);
  const recordFailure = (phase, error) => {
    try { (options.recordBatchFailure || recordBatchExecutionFailure)(phase, error); }
    catch { /* fixed evidence never changes processing or release */ }
  };

  function isPureConversion(state) {
    return isMarkdownBatch(state);
  }

  // A worker/control failure is not a document decision for unstarted sources.
  // Only an explicitly coded document failure may stabilize an actually active,
  // unpublished item. Unknown/ownership faults remain failclosed checkpoints
  // for explicit recovery; pending/retryable/published work is never demoted.
  function stabilizeUnhandledFailure(token, error) {
    if (documentStabilizationBlocked(error)) return;
    const code = ownErrorCode(error);
    if (code === 'INTERNAL_FAILURE' || !(isDocumentResultReasonCode(code) || retryableCodes.has(code))) return;
    const state = readState(token);
    const conversion = isPureConversion(state);
    const affected = state.items.filter((item) => item.status === 'processing' &&
      !Object.hasOwn(item, 'package_id') && !Object.hasOwn(item, 'artifact_id'));
    if (!affected.length) return;
    const stopped = [];
    for (const item of affected) {
      const classified = applyRetryBudget(item, classifyPrepublicationError(error, retryableCodes));
      item.status = classified.retryable ? 'retryable' : 'stopped';
      item.checkpoint = classified.retryable ? 'retryable' : 'stopped';
      item.error_code = classified.code;
      delete item.processing_started_at_ms;
      if (item.status !== 'stopped') continue;
      item.document_result = notProcessedDocumentResult(classified.code);
      // Markdown-only intentionally has no mapping. Mark that projection as
      // satisfied so a failed conversion can never become mapping-recoverable.
      item.local_mapping_exported = conversion;
      item.work_copy_cleanup_pending = true;
      stopped.push(item);
    }
    // The terminal/retry decision is the authoritative commit. Mapping and
    // work-copy cleanup are independent, retryable projections after it.
    writeState(state);
    for (const item of stopped) {
      if (!conversion) {
        try {
          appendStoppedMapping(item.source_label || item.name, '', stoppedMappingStatus, {
            mappingReference: item.id, documentResult: item.document_result
          });
          item.local_mapping_exported = true;
        } catch { /* explicit mapping debt remains recoverable */ }
      }
      try {
        cleanupTerminalWorkCopy(state, item);
        item.work_copy_cleanup_pending = false;
      } catch { item.work_copy_cleanup_pending = true; }
      writeState(state);
    }
    if (publicProgress(state).complete === true && typeof writeTerminalEvidence === 'function') {
      writeTerminalEvidence(state);
    }
  }

  function stopUnstartedConversionItems(token) {
    const state = readState(token);
    const conversion = isPureConversion(state);
    const pending = state.items.filter(item => ['pending', 'retryable'].includes(item.status));
    for (const item of pending) {
      item.status = 'stopped';
      item.checkpoint = 'stopped';
      item.error_code = 'CONVERSION_TERMINATION_UNCONFIRMED';
      item.document_result = notProcessedDocumentResult(item.error_code);
      item.local_mapping_exported = conversion;
      item.work_copy_cleanup_pending = true;
    }
    // Commit all non-start decisions before materialising their local mapping.
    // This is not proof that the preceding native process was terminated.
    if (pending.length) writeState(state);
    for (const item of pending) {
      if (conversion) continue;
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
    let interrupted = false;
    let lifecycleEntered = false;
    let primaryFailed = false;
    let failurePhase = 'processing';
    try {
      // Progress can fail while acquiring its read guard. The validated lease
      // still belongs to this executor and must pass through exact cleanup.
      let lastProgress = publicProgress(claimed);
      if (!Array.isArray(claimed.items) || claimed.items.length < 1 || claimed.items.length > maxBatchFiles) {
        throw new ErrorType('Der lokale Stapelzustand ist ungültig.');
      }
      lifecycleEntered = true;
      // Expensive but mandatory housekeeping is established exactly once for a
      // claimed local batch. The opaque capability remains process-local.
      const conversion = isMarkdownBatch(claimed);
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
          failurePhase = 'local_delivery_verify';
          lastProgress = finalizePublishedPackageLocally(token, pending.artifact_id || pending.package_id, { ...batchDeps, executorPid });
          failurePhase = 'processing';
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
        // Delivery/mapping above belong to the active file and must settle
        // before pause. Pending sources remain untouched, not failed.
        if (pauseRequested(readState(token))) break;
        const before = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
        const result = await processBatchNext(token, { ...batchDeps, executorPid });
        lastProgress = result;
        if (usesStandaloneConverter && result.error === 'CONVERSION_TERMINATION_UNCONFIRMED') {
          interrupted = true;
          stopUnstartedConversionItems(token);
          break;
        }
        if (typeof result.package_id === 'string' || typeof result.artifact_id === 'string') {
          failurePhase = 'local_delivery_verify';
          lastProgress = finalizePublishedPackageLocally(token, result.artifact_id || result.package_id, { ...batchDeps, executorPid });
          failurePhase = 'processing';
          continue;
        }
        const after = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
        if (before === after) break;
      }
    } catch (error) {
      primaryFailed = true;
      recordFailure(failurePhase, error);
      if (lifecycleEntered && !String(error?.code || '').startsWith('STANDALONE_PAUSE_')) {
        try { stabilizeUnhandledFailure(token, error); }
        catch { /* preserve the primary failure; recovery will see the last durable state */ }
      }
      throw error;
    } finally {
      try {
        if ((await releaseLocalBatchExecutor(token, executorPid)) !== true) {
          throw Object.assign(new ErrorType('Der lokale Stapelprozessor konnte seine Ausführungsberechtigung nicht sicher freigeben.'),
            { code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' });
        }
      } catch (releaseError) {
        recordFailure('executor_lease_release', releaseError);
        if (!primaryFailed) throw releaseError;
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
