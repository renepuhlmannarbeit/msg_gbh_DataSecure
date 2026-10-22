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
