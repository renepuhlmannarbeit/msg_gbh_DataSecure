'use strict';

function createBatchExecutorLease(deps) {
  const {
    SafeError,
    processAlive,
    liveLocalExecutor,
    acquireActiveLock,
    releaseActiveLock,
    readState,
    writeState,
    publicProgress
  } = deps;
  const nowIso = deps.nowIso || (() => new Date().toISOString());
  const processInstanceIdentity = deps.processInstanceIdentity;
  if (typeof processInstanceIdentity !== 'function') throw new Error('PROCESS_IDENTITY_PROVIDER_REQUIRED');
  const leaseLive = (state) => {
    if (!Number.isSafeInteger(state?.local_executor_pid) || state.local_executor_pid <= 0 ||
        !processAlive(state.local_executor_pid)) return false;
    if (typeof state.local_executor_birth_id !== 'string') return true;
    const actual = processInstanceIdentity(state.local_executor_pid);
    return !actual || actual === state.local_executor_birth_id;
  };
  // DS-022: at most one batch is processed per user. The per-journal lease
  // alone cannot enforce that; a claim must also fail closed while any other
  // journal still has a live executor.
  const otherLiveExecutor = deps.otherLiveExecutor || (() => false);

  function assertLocalExecutorAccess(state, executorPid) {
    if (!leaseLive(state)) {
      if (state.local_executor_pid !== undefined) {
        delete state.local_executor_pid;
        delete state.local_executor_started_at;
        delete state.local_executor_birth_id;
        writeState(state);
      }
      return;
    }
    const identity = processInstanceIdentity(executorPid);
    if (state.local_executor_pid !== executorPid || state.local_executor_birth_id !== identity) {
      throw new SafeError('Dieser Dokumentstapel wird bereits vollständig lokal verarbeitet.');
    }
  }

  function claimLocalBatchExecutor(token, pid) {
    const candidateAlive = Number.isSafeInteger(pid) && pid > 0 && processAlive(pid);
    const processBirthId = candidateAlive ? processInstanceIdentity(pid) : null;
    if (!candidateAlive || !processBirthId) {
      throw new SafeError('Der lokale Stapelprozessor konnte nicht sicher gestartet werden.');
    }
    acquireActiveLock(token);
    let primaryError = null;
    try {
      const state = readState(token);
      if (leaseLive(state)) {
        throw new SafeError('Dieser Dokumentstapel wird bereits vollständig lokal verarbeitet.');
      }
      if (otherLiveExecutor(token)) {
        throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.');
      }
      delete state.local_executor_pid;
      delete state.local_executor_started_at;
      delete state.local_executor_birth_id;
      const progress = publicProgress(state);
      if (progress.complete || (
        progress.remaining === 0 && progress.delivery_pending === 0 && progress.mapping_pending === 0 &&
        progress.deferred_review === 0 && progress.retryable === 0
      )) {
        return { ok: false, error: 'batch_not_runnable', ...progress, raw_content_sent_to_claude: false };
      }
      state.local_executor_pid = pid;
      state.local_executor_birth_id = processBirthId;
      state.local_executor_started_at = nowIso();
      writeState(state);
      return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      const released = releaseActiveLock(token);
      if (!released && !primaryError) {
        throw new SafeError('Die lokale Stapelsperre konnte nicht sicher freigegeben werden.');
      }
    }
  }

  function releaseLocalBatchExecutor(token, pid) {
    try { acquireActiveLock(token); } catch { return false; }
    let releasedLease = false;
    try {
      const state = readState(token);
      const processBirthId = processInstanceIdentity(pid);
      if (state.local_executor_pid !== pid || !processBirthId || state.local_executor_birth_id !== processBirthId) return false;
      delete state.local_executor_pid;
      delete state.local_executor_started_at;
      delete state.local_executor_birth_id;
      writeState(state);
      releasedLease = true;
    } catch {
      releasedLease = false;
    } finally {
      const releasedLock = releaseActiveLock(token);
      if (!releasedLock) releasedLease = false;
    }
    return releasedLease;
  }

  return { assertLocalExecutorAccess, claimLocalBatchExecutor, releaseLocalBatchExecutor };
}

module.exports = { createBatchExecutorLease };
