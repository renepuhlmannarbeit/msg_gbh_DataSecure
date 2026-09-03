'use strict';

// A detached batch worker outlives the Cowork tool call and, on Windows
// regularly, its MCP parent process: the host may end the parent shortly after
// the tool response, before the worker reaches its terminal state. The parent
// presents the content-free terminal notice while it still listens; otherwise
// the worker presents the very same bounded counters itself. The durable
// journal claim (`claimTerminalNotice`) makes exactly one presenter win, and the
// parent's acknowledgement lets a worker with a live parent finish without
// waiting for the grace period. Nothing here carries a token, path, name or
// document content beyond the private IPC channel that already existed.

const PARENT_ACK_TYPE = 'local-terminal-notice-claimed';
const DEFAULT_PARENT_GRACE_MS = 3000;
const MAX_PARENT_GRACE_MS = 30000;

function boundedGrace(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= MAX_PARENT_GRACE_MS ? number : DEFAULT_PARENT_GRACE_MS;
}

// Real IPC channel of a forked worker. `send` resolves false when the parent is
// gone: Node reports a closed channel only through the send callback, never as
// a synchronous throw, and `notify()`-style helpers that ignore the callback
// error would report a phantom success.
function processChannel(proc = process) {
  return {
    connected: () => proc.connected === true && typeof proc.send === 'function',
    send: (payload) => new Promise((resolve) => {
      try {
        if (proc.connected !== true || typeof proc.send !== 'function') return resolve(false);
        proc.send(payload, (error) => resolve(!error));
      } catch {
        resolve(false);
      }
    }),
    waitForParent: (milliseconds) => new Promise((resolve) => {
      let timer;
      const finish = (outcome) => {
        clearTimeout(timer);
        proc.removeListener('message', onMessage);
        proc.removeListener('disconnect', onDisconnect);
        resolve(outcome);
      };
      const onMessage = (message) => { if (message && message.type === PARENT_ACK_TYPE) finish('claimed'); };
      const onDisconnect = () => finish('disconnected');
      if (proc.connected !== true) return finish('disconnected');
      proc.on('message', onMessage);
      proc.once('disconnect', onDisconnect);
      timer = setTimeout(() => finish('timeout'), milliseconds);
    })
  };
}

// Delivers one terminal envelope and guarantees a single local presentation.
// `claim(token, 'worker')` is the durable arbiter; `present(envelope)` opens the
// native window; `record(event)` writes the content-free lifecycle evidence
// that used to exist only in the parent process.
async function presentTerminalEnvelope(options = {}) {
  const channel = options.channel || processChannel();
  const claim = typeof options.claim === 'function' ? options.claim : () => true;
  const record = typeof options.record === 'function' ? options.record : () => {};
  const envelope = options.envelope;
  if (!envelope || typeof envelope !== 'object' || typeof options.present !== 'function') {
    throw new Error('TERMINAL_PRESENTATION_INVALID');
  }
  const graceMs = boundedGrace(options.graceMs);
  let delivered = false;
  if (channel.connected()) delivered = await channel.send(envelope);
  if (delivered && channel.connected()) {
    const outcome = await channel.waitForParent(graceMs);
    if (outcome === 'claimed') return { presenter: 'parent', delivered, outcome };
    if (!claim(options.token, 'worker')) return { presenter: 'parent', delivered, outcome };
    return presentLocally(options.present, envelope, record, options.evidence, { delivered, outcome });
  }
  if (!claim(options.token, 'worker')) return { presenter: 'parent', delivered, outcome: 'unreachable' };
  return presentLocally(options.present, envelope, record, options.evidence, { delivered, outcome: 'unreachable' });
}

function presentLocally(present, envelope, record, evidence, result) {
  if (evidence && typeof evidence === 'object') safeRecord(record, evidence);
  safeRecord(record, { event: 'completion_notice_started', outcome: 'progress', item_count: evidence?.item_count });
  try {
    present(envelope);
    safeRecord(record, { event: 'completion_notice_dispatched', outcome: 'ok', item_count: evidence?.item_count });
    return { presenter: 'worker', ...result };
  } catch {
    safeRecord(record, { event: 'completion_notice_failed', outcome: 'stopped', item_count: evidence?.item_count,
      error_code: 'LOCAL_NOTICE_FAILED' });
    return { presenter: 'none', ...result };
  }
}

function safeRecord(record, event) {
  try { record(event); } catch { /* diagnostics never change the terminal state */ }
}

module.exports = { PARENT_ACK_TYPE, DEFAULT_PARENT_GRACE_MS, processChannel, presentTerminalEnvelope };
