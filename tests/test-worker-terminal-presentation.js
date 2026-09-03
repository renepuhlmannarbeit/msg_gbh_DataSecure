'use strict';

// The detached worker must present the content-free terminal notice itself
// whenever its MCP parent no longer listens (the Cowork host may end the parent
// right after the tool response), and must stay silent whenever the parent has
// claimed the notice. Exactly one presenter, no token or content in any event.

const fs = require('node:fs');
const path = require('node:path');
const { createSuite } = require('./helpers');
const {
  PARENT_ACK_TYPE, DEFAULT_PARENT_GRACE_MS, presentTerminalEnvelope, processChannel
} = require('../plugins/data-secure/server/gateway/worker-terminal-presentation');

const { testAsync, test, assert, done } = createSuite('Worker terminal presentation');
const TOKEN = 'b'.repeat(64);
const ENVELOPE = Object.freeze({
  type: 'local-intake-state', complete: true, batch_phase: 'complete', batch_total: 2, released: 2, stopped: 0,
  result_grade_counts: { complete: 2, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
  result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
  result_grades_verified: true, result_exported_count: 2, result_export_pending_count: 0, result_output_available: true
});
const EVIDENCE = Object.freeze({ event: 'intake_terminal_state', outcome: 'ok', phase: 'complete', item_count: 2, released_count: 2, stopped_count: 0 });

function fakeChannel({ connected = true, sendResult = true, parentOutcome = 'timeout', disconnectAfterSend = false } = {}) {
  const calls = { sent: [], waited: [] };
  let live = connected;
  return {
    calls,
    connected: () => live,
    send: async (payload) => { calls.sent.push(payload); if (disconnectAfterSend) live = false; return sendResult; },
    waitForParent: async (ms) => { calls.waited.push(ms); return parentOutcome; }
  };
}

function harness(channelOptions, { claimResult = true, presentThrows = false } = {}) {
  const channel = fakeChannel(channelOptions);
  const presented = [];
  const claims = [];
  const events = [];
  const run = () => presentTerminalEnvelope({
    token: TOKEN, envelope: ENVELOPE, channel, evidence: EVIDENCE,
    claim: (token, presenter) => { claims.push({ token, presenter }); return claimResult; },
    present: (envelope) => { if (presentThrows) throw new Error('PRIVATE dialog failure'); presented.push(envelope); },
    record: (event) => events.push(event)
  });
  return { channel, presented, claims, events, run };
}

async function main() {
  await testAsync('a live parent that acknowledges the claim presents; the worker stays silent', async () => {
    const h = harness({ parentOutcome: 'claimed' });
    const result = await h.run();
    assert.deepStrictEqual(result, { presenter: 'parent', delivered: true, outcome: 'claimed' });
    assert.strictEqual(h.channel.calls.sent.length, 1, 'the envelope is delivered exactly once');
    assert.deepStrictEqual(h.channel.calls.waited, [DEFAULT_PARENT_GRACE_MS]);
    assert.strictEqual(h.claims.length, 0, 'an acknowledged parent needs no worker claim');
    assert.strictEqual(h.presented.length, 0);
    assert.strictEqual(h.events.length, 0, 'the parent records its own lifecycle evidence');
  });

  await testAsync('a parent that vanished before the envelope leaves presentation and evidence to the worker', async () => {
    const h = harness({ connected: false });
    const result = await h.run();
    assert.deepStrictEqual(result, { presenter: 'worker', delivered: false, outcome: 'unreachable' });
    assert.strictEqual(h.channel.calls.sent.length, 0, 'nothing is sent into a closed channel');
    assert.deepStrictEqual(h.claims, [{ token: TOKEN, presenter: 'worker' }]);
    assert.strictEqual(h.presented.length, 1);
    assert.deepStrictEqual(h.events.map((event) => event.event),
      ['intake_terminal_state', 'completion_notice_started', 'completion_notice_dispatched']);
    assert.doesNotMatch(JSON.stringify(h.events), /[a-f0-9]{64}|token|path|name/u, 'worker evidence stays content-free');
  });

  await testAsync('a parent that disconnects after receiving the envelope but before claiming yields to the worker', async () => {
    const h = harness({ parentOutcome: 'disconnected' });
    const result = await h.run();
    assert.strictEqual(result.presenter, 'worker');
    assert.strictEqual(result.delivered, true);
    assert.strictEqual(h.presented.length, 1);
    assert.strictEqual(h.claims.length, 1);
  });

  await testAsync('a silent parent within the grace period does not block the worker', async () => {
    const h = harness({ parentOutcome: 'timeout' });
    const result = await h.run();
    assert.strictEqual(result.presenter, 'worker');
    assert.strictEqual(result.outcome, 'timeout');
    assert.strictEqual(h.presented.length, 1);
  });

  await testAsync('a durable claim already taken by the parent suppresses the worker window', async () => {
    const h = harness({ parentOutcome: 'timeout' }, { claimResult: false });
    const result = await h.run();
    assert.strictEqual(result.presenter, 'parent');
    assert.strictEqual(h.presented.length, 0, 'never two windows for one batch');
    assert.strictEqual(h.events.length, 0);
  });

  await testAsync('a send that fails because the channel closed counts as an unreachable parent', async () => {
    const h = harness({ sendResult: false });
    const result = await h.run();
    assert.strictEqual(result.presenter, 'worker');
    assert.strictEqual(result.delivered, false);
    assert.strictEqual(h.channel.calls.waited.length, 0, 'a failed delivery is not awaited');
    assert.strictEqual(h.presented.length, 1);
  });

  await testAsync('a failing native presenter is recorded as a bounded notice failure and never throws', async () => {
    const h = harness({ connected: false }, { presentThrows: true });
    const result = await h.run();
    assert.strictEqual(result.presenter, 'none');
    assert.strictEqual(h.events.at(-1).event, 'completion_notice_failed');
    assert.strictEqual(h.events.at(-1).error_code, 'LOCAL_NOTICE_FAILED');
    assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE/u);
  });

  await testAsync('invalid envelopes or presenters are rejected before any channel use', async () => {
    const channel = fakeChannel();
    await assert.rejects(presentTerminalEnvelope({ token: TOKEN, envelope: null, channel, present: () => {} }), /TERMINAL_PRESENTATION_INVALID/u);
    await assert.rejects(presentTerminalEnvelope({ token: TOKEN, envelope: ENVELOPE, channel }), /TERMINAL_PRESENTATION_INVALID/u);
    assert.strictEqual(channel.calls.sent.length, 0);
  });

  await testAsync('the real process channel reports a disconnected parent without waiting', async () => {
    const fake = { connected: false, send: () => { throw new Error('never'); }, on() {}, once() {}, removeListener() {} };
    const channel = processChannel(fake);
    assert.strictEqual(channel.connected(), false);
    assert.strictEqual(await channel.send({ type: 'x' }), false);
    assert.strictEqual(await channel.waitForParent(5000), 'disconnected');
  });

  await testAsync('the real process channel treats a send callback error as a lost parent', async () => {
    const listeners = new Map();
    const fake = {
      connected: true,
      send: (_payload, callback) => callback(Object.assign(new Error('closed'), { code: 'ERR_IPC_CHANNEL_CLOSED' })),
      on: (name, fn) => listeners.set(name, fn), once: (name, fn) => listeners.set(name, fn),
      removeListener: (name) => listeners.delete(name)
    };
    const channel = processChannel(fake);
    assert.strictEqual(await channel.send({ type: 'x' }), false);
    const waiting = channel.waitForParent(5000);
    listeners.get('message')({ type: PARENT_ACK_TYPE });
    assert.strictEqual(await waiting, 'claimed');
    assert.strictEqual(listeners.size, 0, 'listeners are removed after settling');
  });

  test('parent executor and worker agree on the acknowledgement type and the worker is wired to the presenter', () => {
    const executor = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/gateway/batch-executor.js'), 'utf8');
    assert.ok(executor.includes(`'${PARENT_ACK_TYPE}'`), 'the executor acknowledges with the same literal type');
    assert.ok(executor.includes('claimTerminalNoticeAsParent('), 'the parent claims before presenting');
    const worker = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/gateway/batch-worker.js'), 'utf8');
    for (const marker of ['presentTerminalEnvelope(', 'claim: claimTerminalNotice', 'showBatchStateNotice(', 'showLocalIntakeNotice(', 'record: recordWorkflowEvent']) {
      assert.ok(worker.includes(marker), `batch-worker.js must contain ${marker}`);
    }
    assert.ok(!/await notify\(\{\s*type: isNewIntake \? 'local-intake-state'/u.test(worker),
      'the terminal envelope no longer bypasses the presenter');
    const testDouble = fs.readFileSync(path.join(__dirname, 'lib', 'detached-batch-worker.js'), 'utf8');
    assert.ok(testDouble.includes('presentTerminalEnvelope('), 'the test double mirrors the product protocol');
  });

  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
