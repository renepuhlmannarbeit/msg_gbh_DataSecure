'use strict';
// Actual mapping/commit bodies and closed diagnostic sender/reader execute in
// RAM. Publication, lock release and filesystem seams are explicit models, not
// native admission, result publication, desktop or crash-recovery evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { test } = require('node:test');
const diagnostic = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
const { sanitizeWorkflowEvent } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
const grades = require('../plugins/data-secure/server/gateway/document-result-grade');
const policy = require('../plugins/data-secure/server/gateway/prepublication-error');
const { withSynchronousDocumentControl } = require('../plugins/data-secure/server/gateway/standalone-document-control');
const { normalizePostPreflightWriteError } = require('../plugins/data-secure/server/gateway/storage-capacity');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const fixed = code => Object.assign(Error('PRIVATE /person/path'), { code, path: 'PRIVATE', stack: 'PRIVATE' });
class SafeError extends Error {}
function evaluate(relative, dependencies, suffix = '') {
  const filename = path.join(root, relative), module = { exports: {} };
  const context = vm.createContext({ module, Buffer, JSON, process,
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id === './prepublication-error') return policy;
      if (id.startsWith('node:') || ['fs', 'path', 'crypto'].includes(id)) return require(id);
      throw Error('UNEXPECTED_RAM_DEPENDENCY:' + id);
    }
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8') + suffix, context, { filename, timeout: 1000 });
  return module.exports;
}
function observer(options = {}) {
  const events = [], frames = [], originals = [];
  const api = { recordBatchExecutionFailure(phase, error) {
    originals.push([phase, error]);
    if (options.brokenObserver) throw Error('PRIVATE sink');
    return diagnostic.recordBatchExecutionFailure(phase, error, {
      recordWorkflowEvent(event) { if (options.brokenSink) throw Error('PRIVATE sink'); events.push(plain(event)); },
      send(frame) { if (options.brokenSink) throw Error('PRIVATE sink'); frames.push(plain(frame)); }
    });
  } };
  function check() {
    assert.equal(events.length, frames.length);
    for (const [index, event] of events.entries()) {
      assert.deepEqual(plain(diagnostic.readBatchExecutionDiagnostic(frames[index])), event);
      assert.equal(sanitizeWorkflowEvent(event).phase, event.phase);
      assert.deepEqual(Object.keys(event).sort(), ['error_code', 'event', 'outcome', 'phase']);
      assert.doesNotMatch(JSON.stringify(event), /PRIVATE|person|path|stack|token|hash/iu);
    }
    return events.map(event => [event.phase, event.error_code]);
  }
  return { api, events, frames, originals, check };
}
function thrown(action) { try { action(); } catch (error) { return { threw: true, error }; } return { threw: false }; }
function commitFixture(options = {}) {
  const observations = observer(options), calls = [];
  let confirmations = 0;
  const boundary = (name, value) => {
    calls.push(name); if (options.stage === name) throw options.error; return value;
  };
  const publication = { state: 'verified', publication_binding: { schema: 'explicit-publication-model/1' },
    document_result: { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null } };
  const api = evaluate('plugins/data-secure/server/gateway/standalone-anonymized-mapping.js', {
    '../runtime': { dataRoot: () => '/ram/private', SafeError }, './common': {}, '../core/bound-file-io': {},
    './bound-private-file': {}, './batch-journal-io': {}, './storage-capacity': {},
    './mapping': { appendMapping() { return boundary('csv', true); } },
    './standalone-anonymized-batch': { confirmPublication() { return boundary(++confirmations === 1 ? 'publication' : 'recheck', publication); } },
    './batch-execution-diagnostic': observations.api
  }, '\nmodule.exports = { ...module.exports, __install: hooks => { ensurePrivateMappingIntent = hooks.intent; removePrivateMappingIntent = hooks.finish; } };');
  api.__install({ intent() { return boundary('intent', {}); }, finish() { return boundary('finish', true); } });
  return { ...observations, calls, run: () => api.commitPrivateMapping({}, { name: 'PRIVATE-source.txt', package_id: 'PRIVATE-package' }) };
}
test('commit observation preserves successful order and does not generate diagnostic noise', () => {
  const f = commitFixture(); assert.equal(f.run(), true);
  assert.deepEqual(f.calls, ['publication', 'intent', 'recheck', 'csv', 'finish']); assert.deepEqual(f.check(), []);
});
for (const [stage, phase] of [['publication', 'mapping_publication'], ['intent', 'mapping_intent'],
  ['recheck', 'mapping_recheck'], ['csv', 'mapping_csv'], ['finish', 'mapping_intent_finish']])
  test(`commit ${stage} retains the exact exception and reports only its closed phase/code`, () => {
    const error = fixed('EIO'), f = commitFixture({ stage, error }), result = thrown(f.run);
    assert.equal(result.threw, true); assert.equal(result.error, error); assert.equal(f.calls.at(-1), stage);
    assert.deepEqual(f.check(), [[phase, 'EIO']]); assert.equal(f.originals[0][1], error);
  });
test('unknown/falsy/getter/proxy failures are not inspected or turned into authority', () => {
  let traps = 0;
  const getter = Object.defineProperties({}, { code: { get() { traps++; throw Error('PRIVATE'); } },
    message: { get() { traps++; throw Error('PRIVATE'); } } });
  const proxy = new Proxy({}, { get() { traps++; throw Error('PRIVATE'); },
    getOwnPropertyDescriptor() { traps++; throw Error('PRIVATE'); }, getPrototypeOf() { traps++; throw Error('PRIVATE'); } });
  for (const error of [null, undefined, '', getter, proxy, fixed('EIO_PRIVATE')]) {
    const f = commitFixture({ stage: 'publication', error }), result = thrown(f.run);
    assert.equal(result.threw, true); assert.equal(result.error, error); assert.deepEqual(f.calls, ['publication']);
    assert.deepEqual(f.check(), [['mapping_publication', 'INTERNAL_FAILURE']]);
  }
  assert.equal(traps, 0);
});
for (const failure of ['brokenObserver', 'brokenSink']) test(`${failure} never changes the primary exception or attempts a retry`, () => {
  const error = fixed('STANDALONE_BUSY'), f = commitFixture({ [failure]: true, stage: 'recheck', error }), result = thrown(f.run);
  assert.equal(result.error, error); assert.deepEqual(f.calls, ['publication', 'intent', 'recheck']); assert.deepEqual(f.check(), []);
});
for (const stage of ['intent', 'finish']) test(`actual ${stage} boundary observes EIO before its unchanged mapping normalization`, () => {
  const error = fixed('EIO'), observations = observer(), folder = path.resolve('/ram/private/intents');
  const api = evaluate('plugins/data-secure/server/gateway/standalone-anonymized-mapping.js', {
    '../runtime': { dataRoot: () => '/ram/private', SafeError },
    './common': { ensurePrivateDirectory: () => folder },
    '../core/bound-file-io': { bindDirectory: named => ({ path: named }), readBoundFileRecord() { throw error; } },
    './bound-private-file': {}, './batch-journal-io': {}, './storage-capacity': { normalizePostPreflightWriteError },
    './mapping': {}, './standalone-anonymized-batch': {}, './batch-execution-diagnostic': observations.api
  }, '\nmodule.exports = { ...module.exports, __finish: removePrivateMappingIntent };');
  const state = { token: 'a'.repeat(64) }, item = { id: 'b'.repeat(32), name: 'PRIVATE-source.txt',
    package_id: 'ds_' + 'b'.repeat(32), status: 'mapping_pending' };
  const publication = { state: 'verified', publication_binding: { package_id: item.package_id }, document_result: {} };
  const target = path.join(folder, 'intent.json');
  const result = thrown(() => stage === 'intent' ? api.ensurePrivateMappingIntent(state, item, publication)
    : api.__finish({ target, record: { path: target } }));
  assert.equal(result.threw, true); assert.ok(result.error instanceof SafeError); assert.equal(result.error.code, 'LOCAL_MAPPING_EXPORT_PENDING');
  assert.deepEqual(observations.check(), [[stage === 'intent' ? 'mapping_intent' : 'mapping_intent_finish', 'EIO']]);
  assert.equal(observations.originals[0][1], error);
});
for (const stage of ['default-publication', 'directory-binding'])
  test(`intent pre-boundary ${stage} retains its exact raw exception without normalization`, () => {
    const error = fixed(stage === 'default-publication' ? 'STANDALONE_BUSY' : 'EIO'), observations = observer(), calls = [];
    const api = evaluate('plugins/data-secure/server/gateway/standalone-anonymized-mapping.js', {
      '../runtime': { dataRoot: () => '/ram/private', SafeError },
      './common': { ensurePrivateDirectory() { calls.push('intent-directory'); return path.resolve('/ram/private/intents'); } },
      '../core/bound-file-io': { bindDirectory() { calls.push('bind'); throw error; } },
      './bound-private-file': {}, './batch-journal-io': {},
      './storage-capacity': { normalizePostPreflightWriteError() { assert.fail('pre-boundary faults must not be normalized'); } },
      './mapping': {}, './standalone-anonymized-batch': { confirmPublication() { calls.push('confirm'); throw error; } },
      './batch-execution-diagnostic': observations.api
    });
    const state = { token: 'a'.repeat(64) }, item = { id: 'b'.repeat(32) };
    const result = thrown(() => api.ensurePrivateMappingIntent(state, item, stage === 'default-publication' ? undefined : {}));
    assert.equal(result.threw, true); assert.equal(result.error, error);
    assert.deepEqual(calls, stage === 'default-publication' ? ['confirm'] : ['intent-directory', 'bind']);
    assert.deepEqual(observations.check(), [[stage === 'default-publication' ? 'mapping_publication' : 'mapping_intent', error.code]]);
  });

function csvFixture(options = {}) {
  const observations = observer(options), calls = [], folder = path.resolve('/ram/private/exports');
  const target = path.join(folder, 'DataSecure-Mapping.csv'); let releases = 0;
  const boundary = name => { calls.push(name); if (options.stage === name) throw options.error; };
  const io = { constants: fs.constants,
    lstatSync() { boundary('parent'); return { isDirectory: () => true, isSymbolicLink: () => false }; },
    openSync(named, flags) { boundary(flags === 'wx' ? 'lock' : 'write'); return 41; },
    writeFileSync() { boundary('lock-write'); }, closeSync() { calls.push('close'); },
    existsSync(named) { return named === target && options.previous !== undefined; },
    unlinkSync() { calls.push('unlink-own-temporary'); }, fsyncSync() { calls.push('sync'); }
  };
  const api = evaluate('plugins/data-secure/server/gateway/mapping.js', {
    fs: io, '../core/bound-file-io': { readBoundFile() { boundary('read'); return Buffer.from(options.previous); } },
    './bound-private-file': {}, '../runtime': { SafeError }, './common': { roots() { boundary('root'); return { exports: folder }; } },
    './storage-capacity': { assertWritableCapacity() { boundary('capacity'); }, normalizePostPreflightWriteError },
    './batch-journal-io': { writeFully() { calls.push('body-write'); }, syncParentDirectory() {},
      renameWithTransientRetry() { boundary('rename'); } },
    './document-result-grade': grades, './batch-execution-diagnostic': observations.api
  }, '\nmodule.exports.__installRelease = hook => { releaseMappingLock = hook; };');
  api.__installRelease(() => { releases++; calls.push('release'); return true; });
  return { ...observations, calls, releases: () => releases,
    run: () => api.appendMapping('PRIVATE-source.txt', 'ds_' + '1'.repeat(32), undefined,
      { fs: io, documentResult: { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null } }) };
}
test('CSV success keeps one lock/write/release and produces no failure evidence', () => {
  const f = csvFixture(); assert.equal(f.run(), true); assert.equal(f.releases(), 1);
  assert.equal(f.calls.filter(value => value === 'lock').length, 1); assert.equal(f.calls.filter(value => value === 'rename').length, 1);
  assert.deepEqual(f.check(), []);
});
for (const [stage, phase] of [['root', 'mapping_csv_root'], ['parent', 'mapping_csv_root'],
  ['lock', 'mapping_csv_lock'], ['lock-write', 'mapping_csv_lock'], ['read', 'mapping_csv_read'],
  ['capacity', 'mapping_csv_write'], ['write', 'mapping_csv_write'], ['rename', 'mapping_csv_write']])
  test(`CSV ${stage} records its original EACCES before existing normalization`, () => {
    const error = fixed('EACCES'), f = csvFixture({ stage, error, ...(stage === 'read' ? { previous: 'model previous bytes' } : {}) });
    const result = thrown(f.run); assert.equal(result.threw, true);
    if (stage === 'root') assert.equal(result.error, error);
    else assert.ok(result.error instanceof SafeError);
    assert.ok(f.check().some(([actualPhase, code]) => actualPhase === phase && code === 'EACCES'));
    assert.ok(f.originals.some(([actualPhase, actualError]) => actualPhase === phase && actualError === error));
    assert.equal(f.calls.filter(value => value === stage).length, 1, 'observation adds no retry');
    assert.equal(f.releases(), ['root', 'parent', 'lock', 'lock-write'].includes(stage) ? 0 : 1);
  });
test('malformed CSV keeps its existing exact SafeError and read-phase classification', () => {
  const f = csvFixture({ previous: 'PRIVATE malformed CSV' }), result = thrown(f.run);
  assert.equal(result.threw, true); assert.ok(result.error instanceof SafeError); assert.equal(f.releases(), 1);
  assert.equal(f.originals[0][1], result.error); assert.deepEqual(f.check(), [['mapping_csv_read', 'INTERNAL_FAILURE']]);
  assert.equal(f.calls.includes('rename'), false);
});
for (const failure of ['brokenObserver', 'brokenSink']) test(`CSV ${failure} leaves its normalizer and one release unchanged`, () => {
  const f = csvFixture({ [failure]: true, stage: 'rename', error: fixed('EIO') }), result = thrown(f.run);
  assert.equal(result.threw, true); assert.ok(result.error instanceof SafeError); assert.equal(f.releases(), 1);
  assert.equal(f.calls.filter(value => value === 'rename').length, 1); assert.deepEqual(f.check(), []);
});
test('all new closed mapping phases survive the actual sender/reader and workflow sanitizer', () => {
  const phases = diagnostic.PHASES.filter(phase => phase.startsWith('mapping_'));
  assert.equal(phases.length, 9);
  const f = observer();
  for (const phase of phases) f.api.recordBatchExecutionFailure(phase, fixed('EPERM'));
  assert.deepEqual(f.check(), phases.map(phase => [phase, 'EPERM']));
  assert.equal(diagnostic.recordBatchExecutionFailure('mapping_PRIVATE', fixed('EIO')), false);
});

// Actual async mapping bodies + actual synchronous document admission and retry
// classifier. Locks/publication/intent/CSV IO below are explicit RAM boundaries,
// not native/GUI evidence. Only the test wait uses three zero-delay attempts.
function admittedMappingFixture(options = {}) {
  const observations = observer(), calls = [], attempts = { publication: 0, recheck: 0 }, actions = { publication: 0, recheck: 0 };
  const sourceBytes = Buffer.from('Änne Beispiel ß — immutable original');
  const state = { token: 'a'.repeat(64) }, item = { id: 'b'.repeat(32), name: 'PRIVATE-source.txt',
    package_id: 'ds_' + 'b'.repeat(32), status: 'mapping_pending' };
  const input = JSON.stringify({ state, item }), original = Buffer.from(sourceBytes);
  const published = { state: 'verified', publication_binding: { package_id: item.package_id, pin: 'one' },
    document_result: { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null } };
  let stage = 'publication';
  const injected = options.error || fixed(options.mode === 'logical' ? 'BATCH_ACTIVE_LOCK_BUSY' : 'OWNERSHIP_GUARD_BUSY');
  function confirmPublication() {
    const current = stage; attempts[current]++; calls.push(current);
    const fault = options.stage === current && (options.persistent || attempts[current] <= (options.failures ?? 2));
    const gate = { withSynchronousActiveLock(_token, action) {
      if (fault && options.mode !== 'post-action') throw injected;
      const result = action();
      if (fault && options.mode === 'post-action') throw injected;
      return result;
    } };
    return withSynchronousDocumentControl(gate, state.token, () => {
      actions[current]++;
      const result = plain(published);
      if (current === 'recheck' && options.change === 'binding') result.publication_binding.pin = 'changed';
      if (current === 'recheck' && options.change === 'grade') result.document_result.grade = 'usable-with-omissions';
      return result;
    });
  }
  const boundary = name => { calls.push(name); if (options.stage === name) throw injected; };
  const api = evaluate('plugins/data-secure/server/gateway/standalone-anonymized-mapping.js', {
    '../runtime': { dataRoot: () => '/ram/private', SafeError }, './common': {}, '../core/bound-file-io': {},
    './bound-private-file': {}, './batch-journal-io': {}, './storage-capacity': {},
    './prepublication-error': { ...policy, retryDocumentControl: action => policy.retryDocumentControl(action, { attempts: 3, delayMs: 0 }) },
    './mapping': { appendMapping() { boundary('csv'); return true; } },
    './standalone-anonymized-batch': { confirmPublication }, './batch-execution-diagnostic': observations.api
  }, '\nmodule.exports = { ...module.exports, __install: hooks => { ensurePrivateMappingIntent = hooks.intent; removePrivateMappingIntent = hooks.finish; } };');
  api.__install({ intent(_state, _item, publication) {
    assert.deepEqual(plain(publication), published); boundary('intent'); stage = 'recheck'; return {};
  }, finish() { boundary('finish'); } });
  return { ...observations, api, state, item, attempts, actions, calls, published, injected,
    run: () => api.commitPrivateMappingAsync(state, item),
    ensure: publication => api.ensurePrivateMappingIntentAsync(state, item, publication),
    unchanged() { assert.equal(JSON.stringify({ state, item }), input); assert.deepEqual(sourceBytes, original); } };
}
for (const stage of ['publication', 'recheck']) for (const mode of ['native', 'logical'])
  test(`async mapping waits only for ${stage} ${mode} admission, never repeats writes`, async () => {
    const f = admittedMappingFixture({ stage, mode });
    assert.equal(await f.run(), true); assert.equal(f.attempts[stage], 3);
    assert.equal(f.actions[stage], 1); assert.equal(f.actions[stage === 'publication' ? 'recheck' : 'publication'], 1);
    for (const write of ['intent', 'csv', 'finish']) assert.equal(f.calls.filter(name => name === write).length, 1);
    assert.deepEqual(f.check(), []); f.unchanged();
  });
for (const stage of ['publication', 'recheck']) for (const mode of ['native', 'logical'])
  test(`async mapping exhausts ${stage} ${mode} contention without a CSV or finish`, async () => {
    const f = admittedMappingFixture({ stage, mode, persistent: true });
    await assert.rejects(f.run(), { code: 'STANDALONE_BUSY' });
    assert.equal(f.attempts[stage], 3); assert.equal(f.actions[stage], 0);
    assert.equal(f.calls.includes('csv'), false); assert.equal(f.calls.includes('finish'), false);
    assert.equal(f.calls.filter(name => name === 'intent').length, stage === 'publication' ? 0 : 1);
    assert.deepEqual(f.check(), [[stage === 'publication' ? 'mapping_publication' : 'mapping_recheck', 'STANDALONE_BUSY']]); f.unchanged();
  });
for (const stage of ['publication', 'recheck']) for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'BATCH_OWNERSHIP_CHANGED', 'EIO'])
  test(`async mapping never replays post-action ${stage} ${code}`, async () => {
    const error = fixed(code), f = admittedMappingFixture({ stage, mode: 'post-action', error });
    await assert.rejects(f.run(), actual => actual === error);
    assert.equal(f.attempts[stage], 1); assert.equal(f.actions[stage], 1);
    assert.equal(f.calls.includes('csv'), false); assert.equal(f.calls.includes('finish'), false);
    assert.equal(f.originals.at(-1)[1], error); f.check(); f.unchanged();
  });
for (const stage of ['intent', 'csv', 'finish']) for (const code of ['STANDALONE_BUSY', 'EIO'])
  test(`async mapping executes ${stage} once even when it throws ${code}`, async () => {
    const error = fixed(code), f = admittedMappingFixture({ stage, error });
    await assert.rejects(f.run(), actual => actual === error);
    assert.equal(f.calls.filter(name => name === stage).length, 1);
    assert.equal(f.calls.filter(name => name === 'csv').length, stage === 'intent' ? 0 : 1);
    assert.equal(f.originals.at(-1)[1], error); f.check(); f.unchanged();
  });
for (const change of ['binding', 'grade']) test(`async mapping refuses changed ${change} after admission`, async () => {
  const f = admittedMappingFixture({ change }); await assert.rejects(f.run(), { code: 'LOCAL_MAPPING_EXPORT_PENDING' });
  assert.equal(f.calls.filter(name => name === 'intent').length, 1); assert.equal(f.calls.includes('csv'), false);
  assert.equal(f.calls.includes('finish'), false); f.unchanged();
});
test('async initial intent waits only for its default metadata; a supplied publication never waits', async () => {
  const f = admittedMappingFixture({ stage: 'publication', mode: 'logical' }); await f.ensure();
  assert.equal(f.attempts.publication, 3); assert.equal(f.calls.filter(name => name === 'intent').length, 1); f.unchanged();
  const supplied = admittedMappingFixture({ stage: 'publication', persistent: true }); await supplied.ensure(supplied.published);
  assert.equal(supplied.attempts.publication, 0); assert.deepEqual(supplied.calls, ['intent']); supplied.unchanged();
});
test('async initial intent preserves hard admission and write failures without retrying intent', async () => {
  for (const stage of ['publication', 'intent']) {
    const error = fixed(stage === 'intent' ? 'STANDALONE_BUSY' : 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
    const f = admittedMappingFixture({ stage, mode: 'post-action', error });
    await assert.rejects(f.ensure(), actual => actual === error);
    assert.equal(f.calls.filter(name => name === 'intent').length, stage === 'intent' ? 1 : 0); f.unchanged();
  }
});
test('sync mapping still returns a non-Promise and never starts admission retries', () => {
  const f = commitFixture(); const result = f.run(); assert.equal(result, true); assert.equal(result?.then, undefined);
  assert.deepEqual(f.calls, ['publication', 'intent', 'recheck', 'csv', 'finish']);
});

test('actual worker compositions select only async mapping dependencies; sync recovery remains available', () => {
  const source = fs.readFileSync(path.join(root, 'plugins/data-secure/server/gateway/batch.js'), 'utf8');
  for (const factory of ['createBatchItemProcessor', 'createBatchReviewPublication']) {
    const start = source.indexOf('= ' + factory + '({') + 2, end = source.indexOf('\n});', start) + 4;
    assert.ok(start > 1 && end > start); const expression = source.slice(start, end), context = {};
    for (const name of new Set(expression.match(/[a-zA-Z_$][\w$]*/gu))) context[name] = () => {};
    const mark = () => {}, commit = () => {}; let wired;
    Object.assign(context, { markMappingPendingAsync: mark, commitPendingMappingAsync: commit,
      standalonePause: { claim() {} }, identityLedger: { capture() {} }, [factory](options) { wired = options; return {}; } });
    new vm.Script(expression).runInNewContext(context);
    assert.equal(wired.markMappingPending, mark); assert.equal(wired.commitPendingMapping, commit);
  }
  // Evaluate only the actual export expression. Importing batch itself here would
  // initialize normal profile/diagnostic dependencies outside this RAM harness.
  const exportExpression = source.slice(source.lastIndexOf('module.exports = ')), context = {};
  for (const name of new Set(exportExpression.match(/[a-zA-Z_$][\w$]*/gu))) context[name] = () => {};
  const syncCommit = () => {}, syncReconcile = () => {};
  Object.assign(context, { module: { exports: {} }, Object, RETRYABLE_CODES: [],
    commitPendingMapping: syncCommit, reconcilePendingMappings: syncReconcile });
  new vm.Script(exportExpression).runInNewContext(context);
  const facade = context.module.exports._test;
  assert.equal(facade.commitPendingMapping, syncCommit); assert.equal(facade.reconcilePendingMappings, syncReconcile);
});

function reconciliationAdmissionFixture(options = {}) {
  let attempts = 0, commits = 0, release;
  const calls = [], originalError = fixed(options.code || 'BATCH_ACTIVE_LOCK_BUSY');
  const complete = { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null };
  const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', token: 'a'.repeat(64),
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
  const item = { id: 'b'.repeat(32), name: 'PRIVATE-source.txt', status: 'processing' }, packageId = 'ds_' + item.id;
  const api = evaluate('plugins/data-secure/server/gateway/batch-reconciliation.js', {
    '../core/bound-file-io': {}, '../runtime': { SafeError }, './common': {},
    './mapping': { appendMapping() { calls.push('csv'); }, ensureMappingOutbox() { calls.push('intent'); return {}; },
      removeMappingOutbox() { calls.push('finish'); } }, './document-result-grade': grades,
    './package-identity': {}, '../standalone/markdown-store': {},
    './prepublication-error': { ...policy, retryDocumentControl: action => policy.retryDocumentControl(action, { attempts: 3, delayMs: 0 }) },
    '../core/processing-mode': require('../plugins/data-secure/server/core/processing-mode'),
    '../core/content-options': require('../plugins/data-secure/server/core/content-options'),
    './standalone-anonymized-batch': { privatePublicationRecord() {
      attempts++;
      return withSynchronousDocumentControl({ withSynchronousActiveLock(_token, action) {
        if (options.fail && (options.persistent || attempts < 3)) throw originalError;
        const value = action(); if (options.postAction) throw originalError; return value;
      } }, state.token, () => ({ state: 'verified', document_result: options.badGrade ? { ...complete, grade: 'not-processed' } : complete }));
    } },
    './standalone-anonymized-mapping': { commitPrivateMappingAsync() {
      commits++; return new Promise(resolve => { release = resolve; });
    } }
  }).createBatchReconciliation();
  return { api, state, item, packageId, complete, calls, originalError,
    attempts: () => attempts, commits: () => commits, release: () => release() };
}
test('async mark waits for logical metadata admission before mutating the item exactly once', async () => {
  const f = reconciliationAdmissionFixture({ fail: true }), before = plain(f.item), input = plain(f.state);
  const pending = f.api.markMappingPendingAsync(f.item, f.packageId, f.complete, f.state);
  assert.deepEqual(f.item, before); await pending; assert.equal(f.attempts(), 3);
  assert.equal(f.item.status, 'mapping_pending'); assert.equal(f.item.package_id, f.packageId);
  assert.deepEqual(f.state, input); assert.deepEqual(f.calls, []);
});
for (const options of [{ fail: true, persistent: true }, { postAction: true, code: 'OWNERSHIP_GUARD_BUSY' },
  { postAction: true, code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' }, { postAction: true, code: 'BATCH_OWNERSHIP_CHANGED' },
  { fail: true, code: 'EIO' }, { badGrade: true }])
  test('async mark retains item after rejected metadata ' + JSON.stringify(options), async () => {
    const f = reconciliationAdmissionFixture(options), before = plain(f.item);
    await assert.rejects(f.api.markMappingPendingAsync(f.item, f.packageId, f.complete, f.state));
    assert.deepEqual(f.item, before); assert.deepEqual(f.calls, []);
    assert.equal(f.attempts(), options.persistent ? 3 : 1);
  });
test('async mapping facade clears its debt only after awaited commit; sync and legacy facades stay non-Promise', async () => {
  const f = reconciliationAdmissionFixture(); f.item.mapping_outbox_persisted = true;
  const pending = f.api.commitPendingMappingAsync(f.item, f.packageId, f.state);
  assert.equal(typeof pending.then, 'function'); assert.equal(f.commits(), 1);
  assert.equal(f.item.mapping_outbox_persisted, true); f.release(); await pending;
  assert.equal(Object.hasOwn(f.item, 'mapping_outbox_persisted'), false);
  const legacy = { schema: 'datasecure-batch/4' }, original = { name: 'legacy.txt' };
  const result = f.api.commitPendingMapping(original, f.packageId, legacy);
  assert.equal(result, undefined); assert.deepEqual(f.calls, ['intent', 'csv', 'finish']);
  f.calls.length = 0; await f.api.commitPendingMappingAsync(original, f.packageId, legacy);
  assert.deepEqual(f.calls, ['intent', 'csv', 'finish']); assert.equal(f.commits(), 1);
  assert.equal(f.api.markMappingPending(f.item, f.packageId, f.complete, f.state), undefined);
});
