'use strict';

const crypto = require('node:crypto');
const { types } = require('node:util');

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
  const currentPid = deps.currentPid || (() => process.pid);
  const randomBytes = deps.randomBytes || crypto.randomBytes;
  // The public claim DTO is unchanged. Only this exact successful result object
  // carries process-local release authority; JSON, copies and IPC cannot mint it.
  const claimedEpochs = new WeakMap();
  const clearLease = state => {
    delete state.local_executor_pid;
    delete state.local_executor_started_at;
    delete state.local_executor_birth_id;
    delete state.local_executor_lease_id;
  };
  const ordinaryBusy = error => error && typeof error === 'object' && !types.isProxy(error) &&
    ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'].includes(
      Object.getOwnPropertyDescriptor(error, 'code')?.value);
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

  function transaction(token, action) {
    if (typeof deps.withSynchronousActiveLock === 'function') return deps.withSynchronousActiveLock(token, action);
    // Existing source/test adapters have a separate legacy lock protocol. A
    // real native composition must wire the explicit transaction, never fall
    // back to separated native acquire/release calls after a wiring mistake.
    if (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' && ['win32', 'darwin'].includes(process.platform))
      throw Object.assign(new SafeError('Die native Sperrtransaktion ist nicht verfügbar.'), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    acquireActiveLock(token);
    let failed = false;
    try { return action(); }
    catch (error) { failed = true; throw error; }
    finally {
      let released = false;
      try { released = releaseActiveLock(token) === true; }
      catch (error) { if (!failed) throw error; }
      if (!released && !failed) throw new SafeError('Die lokale Stapelsperre konnte nicht sicher freigegeben werden.');
    }
  }

  function assertLocalExecutorAccess(state, executorPid) {
    if (!leaseLive(state)) {
      if (state.local_executor_pid !== undefined) {
        clearLease(state);
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
    let epoch;
    const result = transaction(token, () => {
      const state = readState(token);
      if (leaseLive(state)) {
        throw new SafeError('Dieser Dokumentstapel wird bereits vollständig lokal verarbeitet.');
      }
      if (otherLiveExecutor(token)) {
        throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.');
      }
      clearLease(state);
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
      state.local_executor_lease_id = randomBytes(16).toString('hex');
      if (!/^[a-f0-9]{32}$/u.test(state.local_executor_lease_id)) throw new TypeError('EXECUTOR_LEASE_ID_INVALID');
      epoch = Object.freeze({ token, pid, birth: processBirthId,
        started: state.local_executor_started_at, leaseId: state.local_executor_lease_id });
      writeState(state);
      return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    });
    // Register only after the FULL transaction, including kernel guard close.
    // A committed journal followed by an uncertain ACK has no issued capability.
    if (epoch) claimedEpochs.set(result, epoch);
    return result;
  }

  function releaseClaimedLocalBatchExecutor(proof) {
    const epoch = claimedEpochs.get(proof);
    if (!epoch) return false;
    let entered = false;
    try {
      const released = transaction(epoch.token, () => {
        entered = true;
        const state = readState(epoch.token);
        if (state.token !== epoch.token || state.local_executor_pid !== epoch.pid || state.local_executor_birth_id !== epoch.birth ||
            state.local_executor_started_at !== epoch.started || state.local_executor_lease_id !== epoch.leaseId) return false;
        clearLease(state);
        writeState(state);
        return true;
      });
      claimedEpochs.delete(proof);
      return released;
    } catch (error) {
      // Only pre-action kernel contention retains this SAME capability. A write,
      // namespace, close or other uncertain outcome never becomes retry authority.
      if (entered || !ordinaryBusy(error)) claimedEpochs.delete(proof);
      throw error;
    }
  }

  function releaseLocalBatchExecutor(token, pid) {
    // Compatibility/self-worker path. A parent must use its original claim
    // capability, never re-probe a possibly reused foreign PID after child exit.
    try {
      if (pid !== currentPid()) return false;
      return transaction(token, () => {
        const state = readState(token);
        const processBirthId = processInstanceIdentity(pid);
        if (state.local_executor_pid !== pid || !processBirthId || state.local_executor_birth_id !== processBirthId) return false;
        clearLease(state);
        writeState(state);
        return true;
      });
    } catch { return false; } // Compatibility/self-worker cleanup remains nonthrowing.
  }

  return { assertLocalExecutorAccess, claimLocalBatchExecutor, releaseLocalBatchExecutor, releaseClaimedLocalBatchExecutor };
}

module.exports = { createBatchExecutorLease };
