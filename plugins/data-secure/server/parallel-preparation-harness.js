'use strict';

// Engineering-only proof harness for BL-011.12. The product path remains
// serial. At most two opaque preparation jobs may run; irreversible commits
// remain central and follow source order.
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

async function runParallelPreparationHarness({ itemIds, prepare, commit, maximumWorkers = 2,
  maximumStagedBytes = 256 * 1024 * 1024 } = {}) {
  if (!Array.isArray(itemIds) || itemIds.length < 1 || !itemIds.every((id) => ITEM_RE.test(String(id))) ||
      new Set(itemIds).size !== itemIds.length || typeof prepare !== 'function' || typeof commit !== 'function' ||
      !Number.isInteger(maximumWorkers) || maximumWorkers < 1 || maximumWorkers > 2 ||
      !Number.isSafeInteger(maximumStagedBytes) || maximumStagedBytes < 1) throw harnessError('PARALLEL_HARNESS_INVALID');
  const prepared = new Array(itemIds.length);
  let cursor = 0, active = 0, peakWorkers = 0, stagedBytes = 0, resourceLimited = false;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= itemIds.length) return;
      active++; peakWorkers = Math.max(peakWorkers, active);
      try {
        const value = validatePrepared(await prepare(Object.freeze({ itemId: itemIds[index], position: index + 1 })),
          itemIds[index], maximumStagedBytes);
        stagedBytes += value.staged_bytes;
        if (stagedBytes > maximumStagedBytes) throw harnessError('PARALLEL_RESOURCE_LIMIT');
        prepared[index] = { state: 'prepared', value };
      } catch (error) {
        if (error?.code === 'PARALLEL_RESOURCE_LIMIT') resourceLimited = true;
        prepared[index] = { state: 'retryable' };
      }
      finally { active--; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(maximumWorkers, itemIds.length) }, () => worker()));

  const states = [];
  if (resourceLimited) {
    return Object.freeze({ peakWorkers, states: Object.freeze(itemIds.map((itemId, index) =>
      Object.freeze({ position: index + 1, item_id: itemId, status: 'retryable' }))) });
  }
  for (let index = 0; index < prepared.length; index++) {
    const entry = prepared[index];
    if (entry.state !== 'prepared') {
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'retryable' }));
      continue;
    }
    try {
      await commit(Object.freeze({ itemId: itemIds[index], position: index + 1,
        stageCapability: entry.value.stage_capability, stagedBytes: entry.value.staged_bytes }));
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'committed' }));
    } catch {
      states.push(Object.freeze({ position: index + 1, item_id: itemIds[index], status: 'retryable' }));
      for (let later = index + 1; later < prepared.length; later++) {
        states.push(Object.freeze({ position: later + 1, item_id: itemIds[later], status: 'blocked' }));
      }
      break;
    }
  }
  return Object.freeze({ peakWorkers, states: Object.freeze(states) });
}

module.exports = { runParallelPreparationHarness, _test: { validatePrepared } };
