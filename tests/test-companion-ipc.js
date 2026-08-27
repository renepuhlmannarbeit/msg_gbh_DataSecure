'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-ipc-'));
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const { PICKER_CANCELLED, PICKER_TITLE, validateSelectedPath, pickerCommands, pickSource, pickSources, batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');
const { FOLDER_PICKER_CANCELLED, FOLDER_PICKER_TITLE, pickerCommands: folderPickerCommands, pickFolder } = require('../plugins/data-secure/server/companion/folder-picker');
const { readConfiguredPrivacyRoot, saveConfiguredPrivacyRoot, clearConfiguredPrivacyRoot } = require('../plugins/data-secure/server/gateway/privacy-config');
const { startConfirmationText, startConfirmationCommands, confirmBatchStart } = require('../plugins/data-secure/server/companion/batch-start-confirmation');
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
      assert.match(spec.args.join(' '), new RegExp(PICKER_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('privacy-folder picker is local on all supported platforms and never returns a folder through MCP', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const specs = folderPickerCommands(platform, { SystemRoot: 'C:\\Windows' });
    assert.ok(specs.length >= 1);
    for (const spec of specs) {
      assert.doesNotMatch(`${spec.command} ${spec.args.join(' ')}`, /https?:|localhost|127\.0\.0\.1/i);
      assert.match(spec.args.join(' '), new RegExp(FOLDER_PICKER_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
  const folder = path.join(root, 'local-privacy');
  fs.mkdirSync(folder);
  assert.strictEqual(pickFolder({ platform: 'linux', runner: () => ({ status: 0, stdout: `${folder}\n` }) }), folder);
  assert.throws(() => pickFolder({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, runner: () => ({ status: 0, stdout: FOLDER_PICKER_CANCELLED }) }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
});

test('chosen privacy root is stored locally and can be reset without exposing its value', () => {
  const folder = path.join(root, 'persisted-local-privacy');
  fs.mkdirSync(folder);
  clearConfiguredPrivacyRoot();
  saveConfiguredPrivacyRoot(folder);
  assert.strictEqual(readConfiguredPrivacyRoot(), folder);
  clearConfiguredPrivacyRoot();
  assert.strictEqual(readConfiguredPrivacyRoot(), '');
});

test('batch start confirmation contains only bounded selection facts and a clear privacy explanation', () => {
  const summary = { selected_count: 3, total_bytes: 2 * 1024 * 1024 };
  const text = startConfirmationText(summary);
  assert.match(text.title, /lokalen Stapel starten/i);
  assert.match(text.message, /3 Datei/);
  assert.match(text.message, /2 MB/);
  assert.match(text.message, /TXT, Markdown, CSV und DOCX/);
  assert.match(text.message, /Bilder bleiben standardmäßig lokal/);
  assert.doesNotMatch(JSON.stringify(text), /C:\\|\.docx|Musterfrau/i);
  for (const platform of ['win32', 'darwin', 'linux']) {
    const specs = startConfirmationCommands(summary, { platform, env: { SystemRoot: 'C:\\Windows' } });
    assert.ok(specs.length >= 1);
    assert.strictEqual(confirmBatchStart(summary, { platform, runner: () => platform === 'win32' ? { status: 0, stdout: 'START_CONFIRMED' } : (platform === 'darwin' ? { status: 0, stdout: 'Starten' } : { status: 0 }) }), true);
  }
});

test('macOS picker filters the current allowlist and returns newline-delimited POSIX paths without shell interpolation', () => {
  const [spec] = pickerCommands('darwin', {}, ['txt', 'md', 'csv', 'docx'], true);
  assert.strictEqual(spec.command, '/usr/bin/osascript');
  assert.match(spec.args.join(' '), /multiple selections allowed/);
  assert.match(spec.args.join(' '), /POSIX path/);
  assert.match(spec.args.join(' '), /linefeed/);
  assert.match(spec.args.join(' '), /of type \{"docx", "txt", "md", "markdown", "csv"\}/);
  const [single] = pickerCommands('darwin', {}, ['txt']);
  assert.match(single.args.join(' '), /of type \{"txt"\}/);
});

test('Linux multi-picker explicitly requests one path per line', () => {
  const specs = pickerCommands('linux', {}, ['txt', 'md', 'csv', 'docx'], true);
  const zenity = specs.find((spec) => spec.command === 'zenity');
  const kdialog = specs.find((spec) => spec.command === 'kdialog');
  assert.ok(zenity.args.includes('--multiple'));
  assert.ok(zenity.args.includes('--separator=\n'));
  assert.ok(kdialog.args.includes('--multiple'));
  assert.ok(kdialog.args.includes('--separate-output'));
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
  const longMarkdown = path.join(root, 'profile.markdown');
  fs.writeFileSync(longMarkdown, 'synthetic');
  assert.strictEqual(validateSelectedPath(longMarkdown, { allowedTypes: ['md'] }).sourceType, 'md');
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

test('Windows multi-picker validates up to 100 distinct local files', () => {
  const first = path.join(root, 'first.txt');
  const second = path.join(root, 'second.csv');
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(second, 'second');
  const selected = pickSources({
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    allowedTypes: ['txt', 'md', 'csv', 'docx'],
    runner: (_command, args) => {
      assert.match(args.join(' '), /Multiselect = \$true/);
      return { status: 0, stdout: `${first}\r\n${second}` };
    }
  });
  assert.deepStrictEqual(selected.map((item) => item.sourceType), ['txt', 'csv']);
  assert.throws(() => pickSources({
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, maxSources: 1,
    runner: () => ({ status: 0, stdout: `${first}\r\n${second}` })
  }), /höchstens 1/);
});

test('picker selections keep equal basenames as independently sealed local sources', () => {
  const first = path.join(root, 'first.txt');
  const second = path.join(root, 'second.csv');
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(second, 'second');
  assert.deepStrictEqual(batchQueueFromSelection([
    { sourcePath: first, sourceType: 'txt', sourceBytes: 5 },
    { sourcePath: second, sourceType: 'csv', sourceBytes: 6 }
  ]), [
    { name: 'first.txt', full: first, sourceBytes: 5, sourceLabel: 'first.txt' },
    { name: 'second.csv', full: second, sourceBytes: 6, sourceLabel: 'second.csv' }
  ]);
  assert.throws(() => batchQueueFromSelection([{ sourcePath: 'relative.txt', sourceBytes: 1 }]), /ungültig/);
  const equalBasenames = batchQueueFromSelection([
    { sourcePath: first, sourceBytes: 5 },
    { sourcePath: path.join(root, 'nested', 'FIRST.TXT'), sourceBytes: 1 }
  ]);
  assert.deepStrictEqual(equalBasenames.map((entry) => entry.name), ['first.txt', 'FIRST.TXT']);
  assert.notStrictEqual(equalBasenames[0].full, equalBasenames[1].full);
  assert.doesNotMatch(JSON.stringify(equalBasenames.map((entry) => entry.name)), /nested|\\|\//u);
});

test('Windows picker disposes the dialog and reports closing as an explicit cancellation', () => {
  const [spec] = pickerCommands('win32', { SystemRoot: 'C:\\Windows' }, ['txt', 'docx'], true);
  const command = spec.args.join(' ');
  assert.match(command, /DialogResult\]::OK/);
  assert.match(command, /\.Dispose\(\)/);
  assert.match(command, new RegExp(PICKER_CANCELLED));
  assert.throws(() => pickSources({
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner: () => ({ status: 0, stdout: PICKER_CANCELLED })
  }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
});

test('macOS and Linux dialog closing is the same explicit terminal cancellation', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.throws(() => pickSources({
      platform,
      runner: () => ({ status: 1, stdout: '' })
    }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED', `${platform} closing must not become a retryable picker error`);
  }
});

test('picker timeout is distinguished from a start failure', () => {
  assert.throws(() => pickSources({
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner: () => ({ error: { code: 'ETIMEDOUT' } })
  }), /Zeitüberschreitung/);
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
  const journal = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'companion-jobs', result.job.job_id, '000001.json');
  assert.doesNotMatch(fs.readFileSync(journal, 'utf8'), /employee|sourcePath|original_path/i);
});

test('authenticated multi-selection creates private jobs without returning paths', () => {
  const first = path.join(root, 'batch-one.txt');
  const second = path.join(root, 'batch-two.txt');
  fs.writeFileSync(first, 'one');
  fs.writeFileSync(second, 'two');
  const sessionId = crypto.randomUUID();
  const session = createCompanionSession({
    secret,
    sessionId,
    pickSources: () => [first, second].map((sourcePath) => ({
      sourcePath, sourceType: 'txt', sourceBytes: 3
    }))
  });
  const result = session.dispatch(frame(sessionId, 1, 'pick_sources', { profile: 'auto' }));
  assert.strictEqual(result.selected_count, 2);
  assert.strictEqual(result.jobs.length, 2);
  assert.ok(result.jobs.every((job) => session.hasPrivateSource(job.job_id)));
  assert.doesNotMatch(JSON.stringify(result), /batch-one|batch-two|sourcePath|original_path/i);
});

test('cancelling the batch start confirmation creates no private job', () => {
  const source = path.join(root, 'cancel-before-start.txt');
  fs.writeFileSync(source, 'one');
  const sessionId = crypto.randomUUID();
  const session = createCompanionSession({
    secret, sessionId,
    pickSources: () => [{ sourcePath: source, sourceType: 'txt', sourceBytes: 3 }],
    confirmBatchStart: () => false
  });
  assert.throws(
    () => session.dispatch(frame(sessionId, 1, 'pick_sources', { profile: 'auto' })),
    (error) => error.code === 'LOCAL_SELECTION_CANCELLED'
  );
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
  assert.deepStrictEqual(options, {
    removeImages: true, automaticBatchApproval: true, batchIndex: 1, batchTotal: 1
  });
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
