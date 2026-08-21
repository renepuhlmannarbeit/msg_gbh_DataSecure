'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-ipc-'));
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const { validateSelectedPath, pickerCommands, pickSource } = require('../plugins/data-secure/server/companion/file-picker');
const { IPC_VERSION, signFrame, createCompanionSession } = require('../plugins/data-secure/server/companion/ipc-session');

const { test, done, assert } = createSuite('Companion private IPC and file picker');
const secret = crypto.randomBytes(32);

function frame(sessionId, sequence, command, params = {}, key = secret) {
  return signFrame(key, { session_id: sessionId, sequence, command, params });
}

test('platform pickers use argument arrays and no network transport', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const specs = pickerCommands(platform, { SystemRoot: 'C:\\Windows' });
    assert.ok(specs.length >= 1);
    for (const spec of specs) {
      assert.strictEqual(typeof spec.command, 'string');
      assert.ok(Array.isArray(spec.args));
      assert.doesNotMatch(`${spec.command} ${spec.args.join(' ')}`, /https?:|localhost|127\.0\.0\.1/i);
    }
  }
});

test('selected source must be an absolute regular supported file', () => {
  const source = path.join(root, 'profile.docx');
  fs.writeFileSync(source, 'synthetic');
  assert.deepStrictEqual(validateSelectedPath(source), {
    sourcePath: source,
    sourceType: 'docx',
    sourceBytes: 9
  });
  assert.throws(() => validateSelectedPath('relative.docx'), /nicht absolut/);
  const directory = path.join(root, 'folder.pdf');
  fs.mkdirSync(directory);
  assert.throws(() => validateSelectedPath(directory), /keine reguläre/);
});

test('linux picker falls back locally and validates the result', () => {
  const source = path.join(root, 'scan.pdf');
  fs.writeFileSync(source, 'synthetic pdf');
  let calls = 0;
  const selected = pickSource({
    platform: 'linux',
    runner() {
      calls++;
      return calls === 1 ? { error: { code: 'ENOENT' } } : { status: 0, stdout: `${source}\n` };
    }
  });
  assert.strictEqual(calls, 2);
  assert.strictEqual(selected.sourceType, 'pdf');
});

test('descriptor promises authenticated inherited stdio without model authority', () => {
  const session = createCompanionSession({ secret, sessionId: crypto.randomUUID() });
  const descriptor = session.descriptor();
  assert.strictEqual(descriptor.ipc_version, IPC_VERSION);
  assert.strictEqual(descriptor.transport, 'inherited_stdio');
  assert.strictEqual(descriptor.network_listener, false);
  assert.strictEqual(descriptor.authenticated_frames, true);
  assert.strictEqual(descriptor.model_authority, false);
});

test('wrong MAC, extra fields and replayed sequence fail closed', () => {
  const sessionId = crypto.randomUUID();
  const session = createCompanionSession({ secret, sessionId });
  assert.throws(() => session.dispatch(frame(sessionId, 1, 'capabilities', {}, crypto.randomBytes(32))), /Authentifizierung/);
  assert.throws(() => session.dispatch({ ...frame(sessionId, 1, 'capabilities'), extra: true }), /Ungültiger.*Frame/);
  assert.strictEqual(session.dispatch(frame(sessionId, 1, 'capabilities')).session_id, sessionId);
  assert.throws(() => session.dispatch(frame(sessionId, 1, 'capabilities')), /nicht für diese Session/);
});

test('authenticated file selection returns no path and stores it only in memory', () => {
  const source = path.join(root, 'employee.txt');
  fs.writeFileSync(source, 'synthetic profile');
  const sessionId = crypto.randomUUID();
  const session = createCompanionSession({
    secret,
    sessionId,
    pickSource: () => ({ sourcePath: source, sourceType: 'txt', sourceBytes: 17 })
  });
  const result = session.dispatch(frame(sessionId, 1, 'pick_source', { profile: 'personnel_profile' }));
  assert.ok(result.ok);
  assert.strictEqual(session.hasPrivateSource(result.job.job_id), true);
  assert.doesNotMatch(JSON.stringify(result), /employee|sourcePath|original_path/i);
  const journal = path.join(process.env.LOCALAPPDATA, 'ClaudeEUPrivacyDocumentGatewayV32', 'companion-jobs', result.job.job_id, '000001.json');
  assert.doesNotMatch(fs.readFileSync(journal, 'utf8'), /employee|sourcePath|original_path/i);
});

test('image-removal intent is accepted only as a literal true flag', () => {
  const source = path.join(root, 'text-only.docx');
  fs.writeFileSync(source, 'synthetic');
  const sessionId = crypto.randomUUID();
  let options;
  const session = createCompanionSession({
    secret,
    sessionId,
    pickSource: () => ({ sourcePath: source, sourceType: 'docx', sourceBytes: 9 }),
    processCompanionJob: async (_jobId, _sourcePath, _profile, received) => {
      options = received;
      return { ok: true };
    }
  });
  assert.throws(
    () => session.dispatch(frame(sessionId, 1, 'pick_source', { profile: 'customer', remove_images: false })),
    /Ungültiges Profil/
  );
  const picked = session.dispatch(frame(sessionId, 2, 'pick_source', { profile: 'customer', remove_images: true }));
  session.dispatch(frame(sessionId, 3, 'process_source', { job_id: picked.job.job_id }));
  assert.deepStrictEqual(options, { removeImages: true });
});

test('authenticated cancel creates local evidence and drops the private source', () => {
  const source = path.join(root, 'cancel.txt');
  fs.writeFileSync(source, 'synthetic');
  const sessionId = crypto.randomUUID();
  const session = createCompanionSession({
    secret,
    sessionId,
    pickSource: () => ({ sourcePath: source, sourceType: 'txt', sourceBytes: 9 })
  });
  const picked = session.dispatch(frame(sessionId, 1, 'pick_source', { profile: 'customer' }));
  const cancelled = session.dispatch(frame(sessionId, 2, 'cancel_job', { job_id: picked.job.job_id }));
  assert.strictEqual(cancelled.job.state, 'Cancelled');
  assert.strictEqual(session.hasPrivateSource(picked.job.job_id), false);
});

test('stdio server boots with the session key on inherited fd 3 and no network code', () => {
  const server = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'companion', 'stdio-server.js');
  const secretFile = path.join(root, 'bootstrap-secret.bin');
  fs.writeFileSync(secretFile, secret);
  const secretFd = fs.openSync(secretFile, 'r');
  let run;
  try {
    run = childProcess.spawnSync(process.execPath, [server], {
      input: '',
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe', secretFd],
      env: { ...process.env, LOCALAPPDATA: process.env.LOCALAPPDATA }
    });
  } finally {
    fs.closeSync(secretFd);
  }
  assert.strictEqual(run.status, 0, run.stderr);
  const ready = JSON.parse(run.stdout.trim());
  assert.strictEqual(ready.type, 'ready');
  assert.strictEqual(ready.transport, 'inherited_stdio');
  assert.strictEqual(ready.network_listener, false);
  const source = fs.readFileSync(server, 'utf8');
  assert.match(source, /readBootstrapSecret\(fd = 3\)/);
  assert.doesNotMatch(source, /process\.env|createServer|listen\(|http|net\./i);
});

done();
