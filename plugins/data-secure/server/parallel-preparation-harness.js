'use strict';

// Engineering-only proof harness for BL-047.1. The product path remains
// serial until target-host evidence exists. At most two opaque preparation
// jobs may run in a sliding window; irreversible commits remain central and
// follow source order.
const ITEM_RE = /^[a-f0-9]{32}$/u;
const CAPABILITY_RE = /^[a-f0-9]{64}$/u;

function harnessError(code) { const error = new Error(code); error.code = code; return error; }

function validatePrepared(value, expectedItemId, maximumBytes) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'item_id,stage_capability,staged_bytes,status' ||
      value.status !== 'prepared' || value.item_id !== expectedItemId ||
      !CAPABILITY_RE.test(String(value.stage_capability || '')) ||
      !Number.isSafeInteger(value.staged_bytes) || value.staged_bytes < 0 ||
      value.staged_bytes > maximumBytes) throw harnessError('PARALLEL_PREPARATION_INVALID');
  return Object.freeze({ ...value });
}

async function runParallelPreparationHarness({ itemIds, prepare, commit, discard = async () => {}, maximumWorkers = 2,
  maximumStagedBytes = 256 * 1024 * 1024, signal } = {}) {
  if (!Array.isArray(itemIds) || itemIds.length < 1 || !itemIds.every((id) => ITEM_RE.test(String(id))) ||
      new Set(itemIds).size !== itemIds.length || typeof prepare !== 'function' || typeof commit !== 'function' || typeof discard !== 'function' ||
      !Number.isInteger(maximumWorkers) || maximumWorkers < 1 || maximumWorkers > 2 ||
      !Number.isSafeInteger(maximumStagedBytes) || maximumStagedBytes < 1) throw harnessError('PARALLEL_HARNESS_INVALID');
  const inFlight = new Map();
  const preparedValues = new Map();
  const states = [];
  let nextLaunch = 0, active = 0, peakWorkers = 0, peakStagedBytes = 0, stagedBytes = 0, resourceLimited = false;
  const cancelled = () => signal?.aborted === true;
  const launch = (index) => {
    active++; peakWorkers = Math.max(peakWorkers, active);
    const promise = Promise.resolve().then(() => {
      if (cancelled()) throw harnessError('PARALLEL_CANCELLED');
      return prepare(Object.freeze({ itemId: itemIds[index], position: index + 1 }));
    }).then((raw) => {
      const value = validatePrepared(raw, itemIds[index], maximumStagedBytes);
      stagedBytes += value.staged_bytes;
      peakStagedBytes = Math.max(peakStagedBytes, stagedBytes);
      if (stagedBytes > maximumStagedBytes) {
        resourceLimited = true;
        throw harnessError('PARALLEL_RESOURCE_LIMIT');
      }
      preparedValues.set(index, value);
      return { state: 'prepared', value };
    }).catch((error) => ({ state: error?.code === 'PARALLEL_CANCELLED' ? 'cancelled' : 'retryable' }))
      .finally(() => { active--; });
    inFlight.set(index, promise);
  };
  const fillWindow = () => {
    while (!cancelled() && !resourceLimited && nextLaunch < itemIds.length && inFlight.size < maximumWorkers) {
      launch(nextLaunch++);
    }
  };

  fillWindow();
  for (let index = 0; index < itemIds.length; index++) {
    if (!inFlight.has(index)) {
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: cancelled() ? 'retryable' : 'blocked' }));
      continue;
    }
    const entry = await inFlight.get(index);
    inFlight.delete(index);
    if (resourceLimited || cancelled()) {
      if (entry.state === 'prepared') await discard(Object.freeze({ itemId: itemIds[index], position: index + 1, stageCapability: entry.value.stage_capability }));
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'retryable' }));
      continue;
    }
    if (entry.state !== 'prepared') {
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'retryable' }));
      fillWindow();
      continue;
    }
    try {
      await commit(Object.freeze({ itemId: itemIds[index], position: index + 1,
        stageCapability: entry.value.stage_capability, stagedBytes: entry.value.staged_bytes }));
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'committed' }));
      stagedBytes -= entry.value.staged_bytes;
      preparedValues.delete(index);
      fillWindow();
    } catch {
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'retryable' }));
      stagedBytes -= entry.value.staged_bytes;
      await discard(Object.freeze({ itemId: itemIds[index], position: index + 1, stageCapability: entry.value.stage_capability }));
      for (const [later, promise] of inFlight) {
        const value = await promise;
        if (value.state === 'prepared') await discard(Object.freeze({ itemId: itemIds[later], position: later + 1, stageCapability: value.value.stage_capability }));
      }
      for (let later = index + 1; later < itemIds.length; later++) {
        states.push(Object.freeze({ position: later + 1, item_id: itemIds[later], status: 'blocked' }));
      }
      break;
    }
  }
  if (resourceLimited || cancelled()) {
    for (const [index, promise] of inFlight) {
      const entry = await promise;
      if (entry.state === 'prepared') await discard(Object.freeze({ itemId: itemIds[index], position: index + 1, stageCapability: entry.value.stage_capability }));
    }
    return Object.freeze({ peakWorkers, peakStagedBytes, states: Object.freeze(itemIds.map((itemId, index) =>
      Object.freeze({ position: index + 1, item_id: itemId, status: 'retryable' }))) });
  }
  return Object.freeze({ peakWorkers, peakStagedBytes, states: Object.freeze(states) });
}

module.exports = { runParallelPreparationHarness, _test: { validatePrepared } };
