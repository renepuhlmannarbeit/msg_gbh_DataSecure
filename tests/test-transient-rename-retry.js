'use strict';

// Windows real-time scanners briefly hold freshly written temporary files, so
// a publication operation can fail with EPERM although nothing is wrong.
// Every temp-file publication retries such transient codes a bounded number of
// times and otherwise fails closed exactly as before.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');
const {
  renameWithTransientRetry, linkWithTransientRetry, TRANSIENT_RENAME_CODES, RENAME_ATTEMPTS
} = require('../plugins/data-secure/server/gateway/batch-journal-io');

const { test, assert, done } = createSuite('Transient rename retry');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-rename-retry-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'data');

function flakyIo(failures, code = 'EPERM') {
  const calls = [];
  return {
    calls,
    renameSync(from, to) {
      calls.push([from, to]);
      if (calls.length <= failures) throw Object.assign(new Error(`${code} synthetic`), { code });
      return fs.renameSync(from, to);
    }
  };
}

test('a transient EPERM on the publication rename is retried and the write still lands', () => {
  const from = path.join(base, 'a.tmp');
  const to = path.join(base, 'a.json');
  fs.writeFileSync(from, '{}');
  const delays = [];
  const io = flakyIo(2);
  renameWithTransientRetry(from, to, io, { retryDelay: (ms) => delays.push(ms) });
  assert.strictEqual(io.calls.length, 3, 'two failures, one success');
  assert.deepStrictEqual(delays, [10, 20], 'bounded, growing back-off');
  assert.ok(fs.existsSync(to) && !fs.existsSync(from));
});

test('a persistent transient failure fails closed after the bounded attempts', () => {
  const from = path.join(base, 'b.tmp');
  const to = path.join(base, 'b.json');
  fs.writeFileSync(from, '{}');
  const io = flakyIo(Infinity, 'EBUSY');
  assert.throws(() => renameWithTransientRetry(from, to, io, { retryDelay: () => {} }), /EBUSY/u);
  assert.strictEqual(io.calls.length, RENAME_ATTEMPTS);
  assert.ok(fs.existsSync(from) && !fs.existsSync(to), 'the temporary file is left to the caller');
});

test('non-transient errors are never retried', () => {
  const io = flakyIo(Infinity, 'ENOENT');
  assert.throws(() => renameWithTransientRetry(path.join(base, 'missing.tmp'), path.join(base, 'c.json'), io, { retryDelay: () => { throw new Error('must not delay'); } }), /ENOENT/u);
  assert.strictEqual(io.calls.length, 1);
  for (const code of ['EPERM', 'EACCES', 'EBUSY']) assert.ok(TRANSIENT_RENAME_CODES.has(code));
  assert.strictEqual(TRANSIENT_RENAME_CODES.has('EXDEV'), false, 'a cross-device rename is a real error');
});

test('a transient hard-link publication failure is retried without weakening create-if-absent', () => {
  const from = path.join(base, 'linked.tmp');
  const to = path.join(base, 'linked.json');
  fs.writeFileSync(from, '{}');
  let calls = 0;
  const io = Object.create(fs);
  io.linkSync = (source, target) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('EPERM synthetic'), { code: 'EPERM' });
    return fs.linkSync(source, target);
  };
  linkWithTransientRetry(from, to, io, { retryDelay: () => {} });
  assert.strictEqual(calls, 2);
  assert.strictEqual(fs.readFileSync(to, 'utf8'), '{}');
  assert.throws(() => linkWithTransientRetry(from, to, io, { retryDelay: () => {} }), /EEXIST/u,
    'an existing destination is never replaced or retried');
});

test('the workflow journal survives a transient rename failure without losing the event', () => {
  const { recordWorkflowEvent, _test } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
  const dataRoot = path.join(base, 'journal');
  let failures = 1;
  const io = Object.create(fs);
  io.renameSync = (from, to) => {
    if (failures-- > 0) throw Object.assign(new Error('EPERM synthetic'), { code: 'EPERM' });
    return fs.renameSync(from, to);
  };
  const now = Date.UTC(2026, 8, 3, 12, 0, 0);
  assert.strictEqual(recordWorkflowEvent({ timestamp: new Date(now).toISOString(), event: 'mcp_start_response', outcome: 'ok' }, { dataRoot, now, fs: io }), true);
  assert.strictEqual(_test.readWorkflowEvents({ dataRoot, now }).length, 1);
  assert.strictEqual(fs.readdirSync(path.dirname(_test.workflowDiagnosticFile({ dataRoot }))).filter((name) => name.endsWith('.tmp')).length, 0,
    'no temporary file is left behind after a successful retry');
});

test('the visible result export retries exclusive publication of a released document', () => {
  const { exportCompletedState } = require('../plugins/data-secure/server/gateway/result-export');
  const { roots } = require('../plugins/data-secure/server/gateway/common');
  const cowork = path.join(base, 'cowork');
  fs.mkdirSync(cowork, { recursive: true });
  process.env.EU_PRIVACY_RESULT_ROOT = cowork;
  const id = `ds_${'9'.repeat(32)}`;
  const directory = path.join(roots().output, id);
  fs.mkdirSync(directory, { recursive: true });
  const bytes = Buffer.from('# Bereinigt\n\n[PERSON_1]', 'utf8');
  fs.writeFileSync(path.join(directory, `${id}.md`), bytes);
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2', package_id: id, profile: 'general', created_at: '2026-09-03T12:00:00.000Z',
    document: `${id}.md`, document_sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), assets: []
  }));
  const realLink = fs.linkSync;
  let injected = 0;
  const linkTargets = [];
  fs.linkSync = function (from, to) {
    linkTargets.push(String(to));
    if (String(to).endsWith('profil-anonymisiert.md') && injected++ === 0) {
      throw Object.assign(new Error('EPERM synthetic'), { code: 'EPERM' });
    }
    return realLink.call(fs, from, to);
  };
  try {
    const result = exportCompletedState({
      schema: 'datasecure-batch/4',
      token: 'a'.repeat(64),
      created_at: '2026-09-03T12:00:00.000Z',
      product_channel: 'standalone',
      items: [{ status: 'released', package_id: id, source_label: 'profil.txt' }]
    });
    assert.deepStrictEqual(result, { exported: 1, pending: 0, available: true }, 'one transient failure does not leave the export pending');
  } finally {
    fs.linkSync = realLink;
    delete process.env.EU_PRIVACY_RESULT_ROOT;
  }
  assert.strictEqual(injected, 2,
    `one failed attempt plus the successful retry reached the exclusive link; targets=${JSON.stringify(linkTargets)}`);
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
done();
