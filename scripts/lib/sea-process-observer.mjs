// Engineering protocol only. Worker exit is not batch success, parent-crash
// evidence, process-tree cleanup permission or product release evidence.
export function createObserverOutputBudget(limit = 4096) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('SEA_OBSERVER_OUTPUT_LIMIT_INVALID');
  let used = 0, exceeded = false;
  return Object.freeze({
    accept(chunk) {
      if (exceeded) return false;
      const bytes = Buffer.byteLength(chunk);
      if (bytes > limit - used) { exceeded = true; return false; }
      used += bytes;
      return true;
    }
  });
}

export function createObserverProtocol(parentExitRequired = false) {
  if (typeof parentExitRequired !== 'boolean') throw new Error('SEA_OBSERVER_MODE_INVALID');
  let state = 'init';
  let exitCode;
  function reject() { state = 'invalid'; throw new Error('SEA_OBSERVER_PROTOCOL_INVALID'); }
  function exact(value, keys) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === keys.sort().join(',');
  }
  return Object.freeze({
    get state() { return state; },
    accept(line) {
      if (['invalid', 'finished', 'exited'].includes(state) || typeof line !== 'string' ||
          Buffer.byteLength(line) > 1024) return reject();
      let value;
      try { value = JSON.parse(line); } catch { return reject(); }
      if (value?.schema !== 'datasecure-sea-process-observer/v1') return reject();
      if (value.event === 'listening' && state === 'init' && exact(value, ['schema', 'event'])) state = 'listening';
      else if (value.event === 'armed' && state === 'listening' && exact(value, ['schema', 'event'])) state = 'armed';
      else if (value.event === 'parent-exited' && parentExitRequired && state === 'armed' &&
          exact(value, ['schema', 'event'])) state = 'parent-exited';
      else if (value.event === 'exited' && state === (parentExitRequired ? 'parent-exited' : 'armed') && exact(value, ['schema', 'event', 'exit_code']) &&
          Number.isInteger(value.exit_code) && value.exit_code >= 0 && value.exit_code <= 0xffffffff) {
        state = 'exited'; exitCode = value.exit_code;
      } else return reject();
    },
    finish(code, signal, stderr) {
      if (state !== 'exited' || code !== 0 || signal !== null || stderr !== '') return reject();
      state = 'finished';
      return Object.freeze({ worker_exit_observed: true, exit_code: exitCode,
        ...(parentExitRequired ? { parent_exit_observed: true, worker_alive_at_parent_exit: true } : {}) });
    }
  });
}
