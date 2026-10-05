'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');

const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-review-ipc-'));
const initial = fs.lstatSync(root);
const environment = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'COMSPEC', 'PATHEXT']) {
  if (process.env[key]) environment[key] = process.env[key];
}
for (const [key, folder] of Object.entries({ HOME: 'home', USERPROFILE: 'home', LOCALAPPDATA: 'localapp',
  APPDATA: 'roaming', TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp', XDG_DATA_HOME: 'data',
  XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', DATASECURE_STANDALONE_DOCUMENTS_DIR: 'documents',
  EU_PRIVACY_RESULT_ROOT: 'results', DATASECURE_STANDALONE_DIAGNOSTIC_DIR: 'diagnostics' })) {
  environment[key] = path.join(root, folder);
  fs.mkdirSync(environment[key], { recursive: true });
}
if (process.platform === 'win32') {
  environment.HOMEDRIVE = path.parse(environment.USERPROFILE).root.replace(/[\\/]$/u, '');
  environment.HOMEPATH = environment.USERPROFILE.slice(environment.HOMEDRIVE.length);
}
environment.DATASECURE_PRODUCT_CHANNEL = 'standalone';
environment.DATASECURE_TEST_REVIEW_IPC_ROOT = root;

const child = childProcess.spawn(process.execPath, [
  `--require=${path.join(__dirname, 'lib/standalone-review-ipc-fault.cjs')}`,
  path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js')
], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: environment });
const closed = new Promise((resolve) => child.once('close', (code) => resolve(code)));
let buffer = Buffer.alloc(0);
let stderr = '';
let sequence = 0;
const waiters = new Map();
child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
child.stdin.on('error', () => {});
child.once('exit', (code) => {
  for (const waiter of waiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`sidecar exited ${code}: ${stderr}`)); }
  waiters.clear();
});
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32BE(0);
    assert.ok(size > 1 && size <= 1024 * 1024);
    if (buffer.length < size + 4) return;
    const answer = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
    buffer = buffer.subarray(size + 4);
    const waiter = waiters.get(answer.request_id);
    assert.ok(waiter, 'only requested production frames are accepted');
    waiters.delete(answer.request_id); clearTimeout(waiter.timer); waiter.resolve(answer);
  }
});
function send(action, fields = {}) {
  const id = (++sequence).toString(16).padStart(16, '0');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`IPC timeout: ${action}: ${stderr}`)); }, 10000);
    waiters.set(id, { resolve, reject, timer });
    child.stdin.write(encodeFrame({ schema: 'datasecure-standalone-private-ipc/1', request_id: id, action, ...fields }));
  });
}
async function until(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    assert.ok(Date.now() < deadline, `${description}; ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function session() {
  const answer = await send('get_review_session');
  assert.equal(answer.ok, true);
  return answer.result;
}
async function readDraft(ready) {
  const parts = [];
  for (let index = 0; index < ready.chunk_count; index++) {
    const answer = await send('get_review_chunk', { review_id: ready.review_id, chunk_index: index });
    assert.equal(answer.ok, true); parts.push(Buffer.from(answer.result.data, 'base64'));
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function cleanOwnedRoot() {
  const info = fs.lstatSync(root);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(info.dev, initial.dev); assert.equal(info.ino, initial.ino);
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.match(path.basename(root), /^datasecure-review-ipc-/u);
  const inspect = (candidate) => {
    const relative = path.relative(root, candidate);
    assert.ok(!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    const stat = fs.lstatSync(candidate);
    assert.ok(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()));
    if (stat.isDirectory()) for (const name of fs.readdirSync(candidate)) inspect(path.join(candidate, name));
  };
  inspect(root); fs.rmSync(root, { recursive: true });
}

(async () => {
  let cleanupSafe = false;
  try {
    const source = path.join(root, 'synthetic.md');
    const text = 'Name: Max Mustermann\nE-Mail: max@example.org\n' +
      '| Begriff | Wert |\n| --- | --- |\n| SYNTHETISCHER HÄRTETEST | 2 |\n';
    fs.writeFileSync(source, text);
    assert.equal((await send('get_public_state')).ok, true);
    assert.equal((await send('admit_selected_sources', { source_kind: 'files', source_paths: [source] })).ok, true);
    assert.equal((await send('start_admitted_batch', { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' })).ok, true);
    const entry = await until(async () => {
      const history = await send('get_run_history');
      const first = history.result?.entries?.[0];
      if (first?.status !== 'review_required') return false;
      // The durable checkpoint can precede intake-worker exit. Match the
      // public app readiness contract before asking it to start another worker.
      const publicState = await send('get_public_state');
      assert.equal(publicState.ok, true);
      return publicState.result.state === 'review_required' ? first : false;
    }, 'real automatic anonymization must produce an open review');
    fs.writeFileSync(path.join(root, 'fail-next-review'), 'fault injection');
    const firstReviewStart = await send('continue_history_batch', { batch_id: entry.batch_id });
    assert.equal(firstReviewStart.ok, true, JSON.stringify(firstReviewStart));
    const failed = await until(async () => {
      const value = await session();
      return value.phase === 'failed' && value.retry_available === true ? value : false;
    }, 'first-draft failure must be run-bound and explicitly retryable');
    assert.equal(failed.ready, false);
    assert.equal(failed.error_code, 'LOCAL_REVIEW_FAILED');
    assert.equal(failed.continuation_available, true);
    assert.equal((await send('continue_review_session')).ok, true);
    let retryStatus;
    const ready = await until(async () => {
      retryStatus = await session();
      assert.ok(!(retryStatus.phase === 'failed' && retryStatus.worker_active !== true),
        `retry failed before a production draft: ${JSON.stringify(retryStatus)}`);
      return retryStatus.ready ? retryStatus : false;
    }, 'retry must yield the actual production draft');
    assert.equal(ready.phase, 'ready');
    const draft = await readDraft(ready);
    assert.equal(draft.allow_organization_review, true);
    assert.ok(draft.ambiguities.length > 0);
    assert.ok(draft.ambiguities.every((candidate) =>
      draft.original_text.slice(candidate.original_start, candidate.original_end) === 'SYNTHETISCHER HÄRTETEST'));
    // The real serialized frame must reach the broker and owning review worker;
    // this corporate choice used to terminate the entire sidecar at decoding.
    const submitted = await send('submit_review', { review_id: ready.review_id,
      answer: { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((candidate) => ({
        ambiguity_id: candidate.ambiguity_id, decision: 'redact_organization' })) } });
    assert.equal(submitted.ok, true); assert.equal(submitted.result.accepted, true);
    await until(async () => (await session()).run_complete === true, 'review and visible export must complete');
    const output = await send('resolve_history_results', { batch_id: entry.batch_id });
    assert.equal(output.ok, true);
    const results = fs.readdirSync(output.result.local_path).filter((name) => name.endsWith('.md'));
    assert.equal(results.length, 1);
    const released = fs.readFileSync(path.join(output.result.local_path, results[0]), 'utf8');
    assert.match(released, /\[UNTERNEHMEN_\d+\]/u);
    assert.doesNotMatch(released, /SYNTHETISCHER HÄRTETEST|Max Mustermann|max@example\.org/u);
    assert.equal(fs.readFileSync(source, 'utf8'), text);
    const history = await send('get_run_history');
    assert.equal(history.ok, true, 'the sidecar survives a real corporate answer');
    assert.equal(history.result.entries[0].failed_count, 0);
    assert.equal((await send('admit_selected_sources', { source_kind: 'files', source_paths: [source] })).ok, true);
    assert.equal((await send('start_admitted_batch', { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' })).ok, true);
    const later = await until(async () => {
      const current = (await send('get_run_history')).result?.entries?.[0];
      if (current?.batch_id === entry.batch_id || current?.status !== 'review_required') return false;
      const publicState = await send('get_public_state');
      assert.equal(publicState.ok, true);
      return publicState.result.state === 'review_required' ? current : false;
    }, 'second real run must get its own independent review');
    assert.equal((await send('continue_history_batch', { batch_id: later.batch_id })).ok, true);
    const laterReady = await until(async () => { const value = await session(); return value.ready ? value : false; }, 'second draft');
    const laterDraft = await readDraft(laterReady);
    const invalid = await send('submit_review', { review_id: laterReady.review_id, answer: { action: 'reviewed',
      redactions: [], decisions: [{ ambiguity_id: 'person:v1:unknown', decision: 'redact_organization' }] } });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error_code, 'STANDALONE_REVIEW_DECISION_INVALID');
    assert.equal((await session()).ready, true, 'broker authorization failure never consumes the real draft');
    assert.equal((await send('submit_review', { review_id: laterReady.review_id, answer: { action: 'deferred' } })).ok, true);
    const deferred = await until(async () => { const value = await session(); return value.continuation_available ? value : false; }, 'deferred worker must release before continuation');
    assert.equal(deferred.run_complete, false);
    assert.equal(deferred.retry_available, false, 'intentional deferral is not a technical failure');
    assert.equal((await send('continue_review_session')).ok, true);
    const resumed = await until(async () => { const value = await session(); return value.ready ? value : false; }, 'deferred run resumes inside its run-bound window');
    const resumedDraft = await readDraft(resumed);
    assert.deepEqual(resumedDraft.ambiguities, laterDraft.ambiguities);
    assert.equal((await send('submit_review', { review_id: resumed.review_id, answer: { action: 'reviewed', redactions: [],
      decisions: resumedDraft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision: 'keep' })) } })).ok, true);
    await until(async () => (await session()).run_complete === true, 'second run must finish after explicit human keep');
    const log = fs.readFileSync(path.join(environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl'), 'utf8');
    assert.doesNotMatch(log, /SYNTHETISCHER|Mustermann|synthetic\.md|max@example/u);
    process.stdout.write('✓ real Standalone sidecar → worker → broker → serialized corporate answer → typed publication; first-draft fault/retry; invalid answer; defer/resume\n');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        const current = await session();
        if (current.ready) await send('submit_review', { review_id: current.review_id, answer: { action: 'deferred' } });
        await send('shutdown');
      } catch { child.kill(); }
    }
    await until(() => child.exitCode !== null || child.signalCode !== null, 'own sidecar must close', 5000);
    await closed;
    // Each explicitly instrumented worker has a bounded lifetime and an exit
    // receipt. Do not kill any process using a potentially recycled PID.
    await until(() => fs.readdirSync(root).filter((name) => /^review-spawn-\d+\.json$/u.test(name))
      .every((name) => fs.existsSync(path.join(root, name.replace('review-spawn-', 'review-exit-')))),
    'own review workers must exit before fixture cleanup', 27000);
    cleanupSafe = true;
    if (cleanupSafe) cleanOwnedRoot();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
