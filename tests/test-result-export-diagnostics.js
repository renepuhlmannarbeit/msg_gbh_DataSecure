'use strict';

// Actual outer result-export bodies and the actual closed diagnostic sender /
// reader execute in RAM. Inner claim/plan/copy/release boundaries are explicit
// fault models, NOT native IO, real publication reconciliation or crash proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const diagnostic = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
const { WORKFLOW_ERROR_CODES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
const filename = path.resolve(__dirname, '../plugins/data-secure/server/gateway/result-export.js');
const source = fs.readFileSync(filename, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const fixed = code => Object.assign(new Error('PRIVATE /path/person'), { code });
const pending = { exported: 0, pending: 3, available: false };

function fixture(options = {}) {
  const events = [], frames = [], calls = [], capability = Object.freeze({});
  const state = { token: 'd'.repeat(64), product_channel: 'standalone', processing_mode: 'markdown-only',
    items: [1, 2, 3].map(() => ({ status: 'released', checkpoint: 'released_locally' })) };
  const record = { schema: 'datasecure-result-export/6', complete: false,
    items: [1, 2, 3].map(() => ({ exported: false })) };
  const module = { exports: {} };
  const context = vm.createContext({ module, Buffer, process: { platform: 'win32', pid: 12345, env: {} },
    require(id) {
      if (['path', 'crypto', 'node:util'].includes(id)) return require(id);
      if (id === '../standalone/result-companions') return require('../plugins/data-secure/server/standalone/result-companions');
      if (id === './batch-execution-diagnostic') return {
        ...diagnostic,
        recordBatchExecutionFailure(phase, error) {
          if (options.throwDiagnostic) throw Error('PRIVATE sink');
          return diagnostic.recordBatchExecutionFailure(phase, error, {
            recordWorkflowEvent(event) { events.push(plain(event)); },
            send(frame) { frames.push(frame); }
          });
        }
      };
      if (id === './standalone-history-store') return { recordStandaloneState() { calls.push('history'); } };
      return {}; // no real inner product implementation claimed by these models
    }
  });
  vm.runInContext(source + '\nmodule.exports.__installBoundaries = hooks => {' +
    ' recordPath = hooks.path; acquireExportClaim = hooks.acquire; ensureRecord = hooks.plan;' +
    ' releaseExportClaim = hooks.release; waiverExists = hooks.waiver;' +
    ' activeDestination = hooks.destination; exportOpenItems = hooks.copy; readRecord = hooks.read; };',
  context, { filename, timeout: 1000 });
  module.exports.__installBoundaries({
    path() { if (Object.hasOwn(options, 'pathError')) throw options.pathError; return '/ram/own-record.json'; },
    acquire() {
      calls.push('acquire');
      if (Object.hasOwn(options, 'acquireError')) throw options.acquireError;
      return options.claimNull ? null : capability;
    },
    waiver() { if (Object.hasOwn(options, 'waiverError')) throw options.waiverError; return false; },
    plan() {
      calls.push('plan');
      if (Object.hasOwn(options, 'planError')) throw options.planError;
      return { target: '/ram/own-record.json', value: record };
    },
    destination() { calls.push('destination'); return options.noDestination ? null : { id: 'ram' }; },
    read() { calls.push('read'); return record; },
    copy() {
      calls.push('copy');
      if (Object.hasOwn(options, 'copyError')) throw options.copyError;
      return { ...record, complete: true };
    },
    release(target, proof) {
      calls.push('release'); assert.equal(target, '/ram/own-record.json'); assert.equal(proof, capability);
      if (Object.hasOwn(options, 'releaseError')) throw options.releaseError;
      return options.releaseFalse ? false : true;
    }
  });
  function run() { return plain(module.exports.exportCompletedState(state)); }
  function observations() {
    assert.equal(frames.length, events.length);
    for (const [index, event] of events.entries()) {
      assert.deepEqual(Object.keys(event).sort(), ['event', 'outcome', 'phase', 'error_code'].sort());
      assert.deepEqual(Object.keys(frames[index]).sort(), ['type', 'phase', 'error_code'].sort());
      assert.deepEqual(plain(diagnostic.readBatchExecutionDiagnostic(frames[index])), event);
      assert.ok(!JSON.stringify(event).includes('PRIVATE'));
    }
    return events.map(event => [event.phase, event.error_code]);
  }
  return { run, api: module.exports, calls, observations, events, frames };
}

test('success and exact same-capability release keep the existing public result without evidence noise', () => {
  const f = fixture(); assert.deepEqual(f.run(), { exported: 3, pending: 0, available: true });
  assert.deepEqual(f.calls, ['history', 'acquire', 'plan', 'destination', 'read', 'copy', 'release']);
  assert.deepEqual(f.observations(), []);
});

test('first plan control error and later release control error survive separately in execution order', () => {
  const f = fixture({ planError: fixed('STANDALONE_BUSY'), releaseError: fixed('OWNERSHIP_GUARD_BUSY') });
  assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.calls, ['history', 'acquire', 'plan', 'release']);
  assert.deepEqual(f.observations(), [['result_export_plan', 'STANDALONE_BUSY'],
    ['result_export_claim_release', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']]);
});

test('exact historical code-free plan message survives but is never retry or success authority', () => {
  const f = fixture({ planError: new Error('RESULT_EXPORT_SOURCE_INVALID') });
  assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_SOURCE_INVALID']]);
  assert.equal(f.calls.filter(call => call === 'plan').length, 1);
  assert.equal(f.calls.filter(call => call === 'release').length, 1);
});

test('copy primary and close-unconfirmed cleanup cause are both retained without copy replay', () => {
  const f = fixture({ copyError: new Error('RESULT_EXPORT_VERIFY_FAILED'), releaseError: fixed('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED') });
  assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.observations(), [['result_export_copy', 'RESULT_EXPORT_VERIFY_FAILED'],
    ['result_export_claim_release', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']]);
  assert.equal(f.calls.filter(call => call === 'copy').length, 1);
});

test('release false remains pending and produces a distinct unconfirmed observation', () => {
  const f = fixture({ releaseFalse: true }); assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.observations(), [['result_export_claim_release', 'RESULT_EXPORT_RELEASE_UNCONFIRMED']]);
  assert.equal(f.calls.filter(call => call === 'release').length, 1);
});

test('a fixed plan primary is not overwritten by release false', () => {
  const f = fixture({ planError: fixed('CONTENT_OPTIONS_BINDING_INVALID'), releaseFalse: true });
  assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.observations(), [['result_export_plan', 'CONTENT_OPTIONS_BINDING_INVALID'],
    ['result_export_claim_release', 'RESULT_EXPORT_RELEASE_UNCONFIRMED']]);
});

test('raw kernel acquire Busy does not enter plan, copy or release and is not retried', () => {
  const f = fixture({ acquireError: fixed('OWNERSHIP_GUARD_BUSY') }); assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.calls, ['history', 'acquire']);
  assert.deepEqual(f.observations(), [['result_export_claim', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']]);
});

test('null claim means unavailable, not established Busy; unknown acquire error stays separate', () => {
  const unavailable = fixture({ claimNull: true }); assert.deepEqual(unavailable.run(), pending);
  assert.deepEqual(unavailable.observations(), [['result_export_claim', 'RESULT_EXPORT_CLAIM_UNAVAILABLE']]);
  assert.deepEqual(unavailable.calls, ['history', 'acquire'], 'no release without a minted acquisition capability');
  const unknown = fixture({ acquireError: Error('PRIVATE unknown') }); assert.deepEqual(unknown.run(), pending);
  assert.deepEqual(unknown.observations(), [['result_export_claim', 'RESULT_EXPORT_CLAIM_FAILED']]);
  assert.deepEqual(unknown.calls, ['history', 'acquire']);
});

test('an actual explicit fixed Busy cause remains Busy rather than becoming claim-unavailable', () => {
  for (const acquireError of [fixed('RESULT_EXPORT_BUSY'), new Error('RESULT_EXPORT_BUSY')]) {
    const f = fixture({ acquireError }); assert.deepEqual(f.run(), pending);
    assert.deepEqual(f.observations(), [['result_export_claim', 'RESULT_EXPORT_BUSY']]);
    assert.deepEqual(f.calls, ['history', 'acquire']);
  }
});

test('all exact bounded IO causes reduce to a fixed cause without raw message/path', () => {
  for (const code of ['EIO', 'EACCES', 'EPERM', 'ENOSPC', 'EDQUOT', 'EROFS', 'EMFILE', 'ENFILE']) {
    const f = fixture({ planError: fixed(code) }); assert.deepEqual(f.run(), pending);
    assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_IO_FAILED']], code);
  }
});

test('exact code-free export catalog messages use the closed channel', () => {
  for (const code of WORKFLOW_ERROR_CODES.filter(code => code.startsWith('RESULT_EXPORT_'))) {
    const f = fixture({ planError: new Error(code) }); assert.deepEqual(f.run(), pending);
    assert.deepEqual(f.observations(), [['result_export_plan', code]], code);
  }
});

test('a valid code wins over an unrelated own message and explicit INTERNAL_FAILURE stays exact', () => {
  for (const code of ['CONTENT_OPTIONS_BINDING_MISSING', 'STANDALONE_PUBLICATION_INVALID', 'INTERNAL_FAILURE']) {
    const f = fixture({ planError: Object.assign(Error('RESULT_EXPORT_STATE_UNSAFE'), { code }) });
    assert.deepEqual(f.run(), pending); assert.deepEqual(f.observations(), [['result_export_plan', code]]);
  }
});

test('message getters/proxies/inheritance are never evaluated or accepted', () => {
  let traps = 0;
  const getter = Object.defineProperty({}, 'message', { get() { traps++; throw Error('PRIVATE'); } });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw Error('PRIVATE'); } });
  const inherited = Object.create({ message: 'RESULT_EXPORT_STATE_UNSAFE', code: 'STANDALONE_BUSY' });
  for (const planError of [getter, proxy, inherited]) {
    const f = fixture({ planError }); assert.deepEqual(f.run(), pending);
    assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_PLAN_FAILED']]);
  }
  assert.equal(traps, 0);
});

test('fixed-code prefixes, paths, stacks and vendor strings do not enter diagnostics', () => {
  for (const planError of [Error('RESULT_EXPORT_SOURCE_INVALID:/PRIVATE/path'), fixed('RESULT_EXPORT_SOURCE_INVALID_PRIVATE'),
    Error('/PRIVATE/person'), Object.assign(Error('PRIVATE'), { stack: 'PRIVATE', path: 'PRIVATE' }), undefined]) {
    const f = fixture({ planError }); assert.deepEqual(f.run(), pending);
    assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_PLAN_FAILED']]);
  }
});

test('diagnostic sink failure neither changes the public result nor suppresses same-capability release', () => {
  const f = fixture({ planError: fixed('STANDALONE_BUSY'), throwDiagnostic: true });
  assert.deepEqual(f.run(), pending); assert.deepEqual(f.calls, ['history', 'acquire', 'plan', 'release']);
  assert.deepEqual(f.observations(), []);
});

test('unknown copy and release errors use stage-specific fixed fallbacks', () => {
  const f = fixture({ copyError: undefined, releaseError: undefined }); assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.observations(), [['result_export_copy', 'RESULT_EXPORT_COPY_FAILED'],
    ['result_export_claim_release', 'RESULT_EXPORT_RELEASE_UNCONFIRMED']]);
});

test('waiver read failure is reported before the plan boundary and still releases exactly once', () => {
  const f = fixture({ waiverError: Error('RESULT_EXPORT_STATE_UNSAFE') }); assert.deepEqual(f.run(), pending);
  assert.deepEqual(f.calls, ['history', 'acquire', 'release']);
  assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_STATE_UNSAFE']]);
});

test('missing destination keeps existing pending semantics without fabricating an exception', () => {
  const f = fixture({ noDestination: true }); assert.deepEqual(f.run(), pending);
  assert.equal(f.calls.includes('copy'), false); assert.deepEqual(f.observations(), []);
});

test('real terminal wrapper preserves a pre-export primary and strips all diagnostic authority', () => {
  const f = fixture({ pathError: fixed('OWNERSHIP_GUARD_UNSAFE') });
  assert.deepEqual(plain(f.api.terminalVisibleExport({ complete: true, released: 3 }, () => f.run())), pending);
  assert.deepEqual(f.observations(), [['result_export_prepare', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE']]);
  assert.deepEqual(f.calls, ['history']);
});

test('terminal projection does not erase earlier plan and cleanup observations or expose them publicly', () => {
  const f = fixture({ planError: new Error('RESULT_EXPORT_STATE_CONFLICT'), releaseError: fixed('OWNERSHIP_GUARD_BUSY') });
  const value = plain(f.api.terminalVisibleExport({ complete: true, released: 3 }, () => f.run()));
  assert.deepEqual(value, pending); assert.deepEqual(Object.keys(value).sort(), ['available', 'exported', 'pending']);
  assert.deepEqual(f.observations(), [['result_export_plan', 'RESULT_EXPORT_STATE_CONFLICT'],
    ['result_export_claim_release', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']]);
});

test('malformed terminal counters and unknown preparation exception have distinct fixed observations', () => {
  const invalid = fixture();
  assert.deepEqual(plain(invalid.api.terminalVisibleExport({ complete: true, released: 3 }, () => ({ exported: 4, pending: 0, available: true }))), pending);
  assert.deepEqual(invalid.observations(), [['result_export_prepare', 'RESULT_EXPORT_TERMINAL_INVALID']]);
  const unknown = fixture();
  assert.deepEqual(plain(unknown.api.terminalVisibleExport({ complete: true, released: 3 }, () => { throw undefined; })), pending);
  assert.deepEqual(unknown.observations(), [['result_export_prepare', 'RESULT_EXPORT_PREPARE_FAILED']]);
});

test('nonterminal state never invokes the exporter or emits an export failure', () => {
  const f = fixture(); let calls = 0;
  assert.deepEqual(plain(f.api.terminalVisibleExport({ complete: false, released: 3 }, () => { calls++; })),
    { exported: 0, pending: 0, available: false });
  assert.equal(calls, 0); assert.deepEqual(f.observations(), []);
});

test('diagnostic receiver rejects extras, getters, proxies and unknown values without authorization', () => {
  let traps = 0;
  const valid = { type: 'local-batch-diagnostic', phase: 'result_export_plan', error_code: 'RESULT_EXPORT_PLAN_FAILED' };
  assert.ok(diagnostic.readBatchExecutionDiagnostic(valid));
  for (const frame of [{ ...valid, ack: true }, { ...valid, phase: 'result_export_PRIVATE' },
    { ...valid, error_code: 'RESULT_EXPORT_PRIVATE' },
    { type: valid.type, phase: valid.phase, get error_code() { traps++; throw Error('PRIVATE'); } },
    new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw Error('PRIVATE'); } })]) {
    assert.equal(diagnostic.readBatchExecutionDiagnostic(frame), null);
  }
  assert.equal(traps, 0);
});

test('all export causes survive actual workflow/support sanitizers without opening their storage', () => {
  const { sanitizeWorkflowEvent } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
  const { sanitizeSupportTrace } = require('../plugins/data-secure/server/gateway/support-trace');
  const phases = ['result_export_prepare', 'result_export_claim', 'result_export_plan',
    'result_export_copy', 'result_export_claim_release'];
  for (const phase of phases) for (const error_code of WORKFLOW_ERROR_CODES.filter(code => code.startsWith('RESULT_EXPORT_'))) {
    const workflow = sanitizeWorkflowEvent({ event: 'batch_worker_failed', outcome: 'stopped', phase, error_code,
      message: 'PRIVATE', path: '/PRIVATE/person' });
    const support = sanitizeSupportTrace({ event: 'workflow_event', operation: 'standalone_batch', outcome: 'stopped', error_code,
      message: 'PRIVATE', path: '/PRIVATE/person' });
    assert.equal(workflow.phase, phase); assert.equal(workflow.error_code, error_code);
    assert.equal(support.error_code, error_code); assert.ok(!JSON.stringify([workflow, support]).includes('PRIVATE'));
  }
});
