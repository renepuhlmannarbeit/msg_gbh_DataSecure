'use strict';

const { SafeError } = require('../runtime');
const { releaseOwnedLock } = require('./batch-lock-release');

function createBatchContinuation(options = {}) {
  const ErrorType = options.SafeError || SafeError;
  const active = options.active;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const readState = options.readState;
  const writeState = options.writeState;
  const assertLocalExecutorAccess = options.assertLocalExecutorAccess;
  const reconcilePublishedItems = options.reconcilePublishedItems;
  const reconcilePendingMappings = options.reconcilePendingMappings;
  const reconcilePreflightStoppedMappings = options.reconcilePreflightStoppedMappings || (() => false);
  const markInterruptedItemsRetryable = options.markInterruptedItemsRetryable;
  const recoverableBatchStates = options.recoverableBatchStates;
  const publicProgress = options.publicProgress;
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';
  const preflightMappingPendingStatus = options.preflightMappingPendingStatus || 'preflight_mapping_pending';
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';

  function resumeBatch(token) {
    if (active.has(token)) throw new ErrorType('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    acquireActiveLock(token);
    active.add(token);
    let primaryError = false;
    try {
      const state = readState(token);
      assertLocalExecutorAccess(state);
      if (state.invalidated === true) {
        throw new ErrorType('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
      }
      // The caller owns the live global lock at this point. A leftover
      // `processing` state can therefore only be from a previous interrupted
      // owner, never from a concurrent worker. First adopt a verified package,
      // then make any remaining interrupted item eligible for this explicit
      // resume request.
      let changed = reconcilePublishedItems(state);
      if (reconcilePendingMappings(state)) changed = true;
      if (reconcilePreflightStoppedMappings(state)) changed = true;
      if (markInterruptedItemsRetryable(state) > 0) changed = true;
      let resumed = 0;
      for (const item of state.items) {
        if (item.status !== 'retryable') continue;
        item.status = 'pending';
        item.checkpoint = 'resumed';
        delete item.error_code;
        resumed++;
      }
      if (!resumed) {
        if (changed) writeState(state);
        return {
          ok: false,
          error: state.items.some((item) => item.status === deferredReviewStatus)
            ? 'batch_review_required'
            : (state.items.some((item) =>
              item.status === mappingPendingStatus || item.status === preflightMappingPendingStatus)
              ? 'local_mapping_repair_pending'
              : 'no_retryable_documents'),
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      writeState(state);
      return { ok: true, resumed, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      primaryError = true;
      throw error;
    } finally {
      active.delete(token);
      releaseOwnedLock(releaseActiveLock, token, ErrorType, primaryError);
    }
  }

  function continueMostRecentBatch() {
    const states = recoverableBatchStates().sort((left, right) =>
      Date.parse(right.created_at) - Date.parse(left.created_at)
    );
    if (!states.length) {
      return { ok: false, error: 'no_incomplete_batch', raw_content_sent_to_claude: false };
    }
    const selected = states[0];
    // resumeBatch alone acquires the global owner lock. A live worker stays
    // protected by the recovery scan; a dead one becomes retryable only after
    // this explicit continuation. Deferred review remains on its shared local
    // review path instead of falling back to one-file UI.
    const before = readState(selected.token);
    if (before.items.some((item) => item.status === 'retryable' || item.status === 'processing')) {
      const resumed = resumeBatch(selected.token);
      if (resumed.ok === false) {
        const reconciled = readState(selected.token);
        // Recovery may have adopted the already-published result instead of
        // retrying extraction. That delivery is executable on this same click;
        // it is not a failed continuation just because `resumed` is zero.
        // The same applies when reconciliation leaves only review or mapping
        // work, including a review position beside the adopted delivery.
        if (reconciled.items.some(item => ['processing', 'retryable'].includes(item.status)) ||
            !reconciled.items.some(item => ['pending', deliveryPendingStatus, deferredReviewStatus,
              mappingPendingStatus, preflightMappingPendingStatus].includes(item.status) ||
              (item.status === 'stopped' && item.local_mapping_exported === false))) return resumed;
      }
    }
    return {
      ok: true,
      batch_token: selected.token,
      ...publicProgress(readState(selected.token)),
      raw_content_sent_to_claude: false
    };
  }

  // The local history action selects one explicit journal. Re-read and check
  // channel, lifetime and executability while owning the global batch lock;
  // a stale renderer row must never fall through to a newer batch.
  function continueStandaloneBatch(token) {
    const fail = (code) => Object.assign(new ErrorType('Der ausgewählte lokale Lauf kann nicht fortgesetzt werden.'), { code });
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token)) throw fail('STANDALONE_HISTORY_INVALID');
    if (active.size) throw fail('STANDALONE_BUSY');
    try { acquireActiveLock(token); } catch { throw fail('STANDALONE_BUSY'); }
    active.add(token);
    let primaryError = false;
    try {
      const candidates = recoverableBatchStates({ ignoreActiveLock: true, includeActiveExecutors: true });
      if (candidates.some((state) => options.liveLocalExecutor?.(state))) throw fail('STANDALONE_BUSY');
      if (!candidates.some((state) => state.token === token && state.product_channel === 'standalone')) {
        throw fail('STANDALONE_NOTHING_TO_CONTINUE');
      }
      const state = options.readStateForMaintenance(token);
      if (state.product_channel !== 'standalone' || state.invalidated === true || Date.now() > Date.parse(state.expires_at)) {
        throw fail('STANDALONE_NOTHING_TO_CONTINUE');
      }
      assertLocalExecutorAccess(state);
      let changed = reconcilePublishedItems(state);
      if (reconcilePendingMappings(state)) changed = true;
      if (reconcilePreflightStoppedMappings(state)) changed = true;
      if (markInterruptedItemsRetryable(state) > 0) changed = true;
      for (const item of state.items) {
        if (item.status !== 'retryable') continue;
        item.status = 'pending'; item.checkpoint = 'resumed'; delete item.error_code;
        changed = true;
      }
      if (changed) writeState(state);
      if (!state.items.some((item) => ['pending', deliveryPendingStatus, deferredReviewStatus,
        mappingPendingStatus, preflightMappingPendingStatus].includes(item.status) ||
        (item.status === 'stopped' && item.local_mapping_exported === false))) {
        throw fail('STANDALONE_NOTHING_TO_CONTINUE');
      }
      return { ok: true, ...publicProgress(state), batch_token: token, raw_content_sent_to_claude: false };
    } catch (error) {
      primaryError = true;
      if (/^STANDALONE_/u.test(error?.code || '')) throw error;
      throw fail('STANDALONE_NOTHING_TO_CONTINUE');
    } finally {
      active.delete(token);
      releaseOwnedLock(releaseActiveLock, token, ErrorType, primaryError);
    }
  }

  return { resumeBatch, continueMostRecentBatch, continueStandaloneBatch };
}

module.exports = { createBatchContinuation };
