'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const vm = require('vm');
const { EventEmitter } = require('events');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-ipc-'));
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const { PICKER_CANCELLED, PICKER_TITLE, validateSelectedPath, pickerCommands, pickSource, pickSources, pickSourcesAsync, batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');
const { FOLDER_PICKER_CANCELLED, FOLDER_PICKER_TITLE, pickerCommands: folderPickerCommands, pickFolder, pickFolderAsync } = require('../plugins/data-secure/server/companion/folder-picker');
const { readConfiguredPrivacyRoot, saveConfiguredPrivacyRoot, clearConfiguredPrivacyRoot } = require('../plugins/data-secure/server/gateway/privacy-config');
const { startConfirmationText, startConfirmationCommands, confirmBatchStart } = require('../plugins/data-secure/server/companion/batch-start-confirmation');
const { IPC_VERSION, signFrame, createCompanionSession } = require('../plugins/data-secure/server/companion/ipc-session');

const { test, testAsync, done, assert } = createSuite('Companion private IPC and file picker');
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
  assert.strictEqual(pickerCommands('win32', { SystemRoot: 'C:\\Windows' })[0].command,
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('Standalone file picker names both purposes without claiming anonymization', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const commands = pickerCommands(platform, { SystemRoot: 'C:\\Windows' }, ['txt', 'pdf'], true, 'standalone');
    assert.ok(commands.length > 0);
    for (const command of commands) {
      const args = command.args.join(' ');
      assert.match(args, /Dateien mit DataSecure lokal verarbeiten/u);
      assert.doesNotMatch(args, /lokal anonymisieren/u);
    }
  }
});

testAsync('Standalone result-folder picker names the result purpose on every platform', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const seen = [];
    await assert.rejects(pickFolderAsync({ platform, purpose: 'result',
      env: { SystemRoot: 'C:\\Windows' }, runner: async (command, args) => {
        seen.push(args.join(' ')); return { status: 0, stdout: FOLDER_PICKER_CANCELLED };
      } }), error => error.code === 'LOCAL_SELECTION_CANCELLED');
    assert.equal(seen.length, 1);
    assert.match(seen[0], /Ergebnisordner auswählen/u);
    assert.doesNotMatch(seen[0], /Privacy-Ordner auswählen/u);
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
  assert.strictEqual(folderPickerCommands('win32', { SystemRoot: 'C:\\Windows' })[0].command,
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
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
  assert.match(text.message, /TXT, Markdown, CSV, DOCX, XLSX und PPTX/);
  assert.match(text.message, /Bilder bleiben standardmäßig lokal/);
  assert.doesNotMatch(JSON.stringify(text), /C:\\|\.docx|Musterfrau/i);
  for (const platform of ['win32', 'darwin', 'linux']) {
    const specs = startConfirmationCommands(summary, { platform, env: { SystemRoot: 'C:\\Windows' } });
    assert.ok(specs.length >= 1);
    assert.strictEqual(confirmBatchStart(summary, { platform, runner: () => platform === 'win32' ? { status: 0, stdout: 'START_CONFIRMED' } : (platform === 'darwin' ? { status: 0, stdout: 'Starten' } : { status: 0 }) }), true);
  }
});

test('macOS picker filters the allowlist and returns counted newline-delimited POSIX paths without shell interpolation', () => {
  const [spec] = pickerCommands('darwin', {}, ['txt', 'md', 'csv', 'docx'], true);
  assert.strictEqual(spec.command, '/usr/bin/osascript');
  assert.match(spec.args.join(' '), /multiple selections allowed/);
  assert.match(spec.args.join(' '), /POSIX path/);
  assert.match(spec.args.join(' '), /linefeed/);
  assert.match(spec.args.join(' '), /selectionCount to count of selectedPaths/);
  assert.match(spec.args.join(' '), /selectionCount as text/);
  assert.match(spec.args.join(' '), /of type \{"docx", "txt", "md", "markdown", "csv"\}/);
  const [single] = pickerCommands('darwin', {}, ['txt']);
  assert.match(single.args.join(' '), /of type \{"txt"\}/);
});

test('macOS picker rejects a selected path split into other valid files by a newline', () => {
  const first = path.join(root, 'mac-first.txt');
  const second = path.join(root, 'mac-second.txt');
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(second, 'second');
  assert.deepStrictEqual(pickSources({ platform: 'darwin', allowedTypes: ['txt'],
    runner: () => ({ status: 0, stdout: `2\n${first}\n${second}\n` })
  }).map(item => item.sourcePath), [first, second]);
  assert.throws(() => pickSources({ platform: 'darwin', allowedTypes: ['txt'],
    runner: () => ({ status: 0, stdout: `1\n${first}\n${second}\n` })
  }), /nicht eindeutig/u);
  for (const invalid of ['0', '3', '01', '1e0', '1.0', '']) {
    assert.throws(() => pickSources({ platform: 'darwin', allowedTypes: ['txt'],
      runner: () => ({ status: 0, stdout: `${invalid}\n${first}\n` })
    }), /nicht eindeutig/u);
  }
});

testAsync('macOS asynchronous picker checks the actual selection count before reading paths', async () => {
  const first = path.join(root, 'mac-async-first.txt');
  const second = path.join(root, 'mac-async-second.txt');
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(second, 'second');
  const valid = await pickSourcesAsync({ platform: 'darwin', allowedTypes: ['txt'],
    runner: async () => ({ status: 0, stdout: `2\n${first}\n${second}\n` }) });
  assert.deepStrictEqual(valid.map(item => item.sourcePath), [first, second]);
  await assert.rejects(pickSourcesAsync({ platform: 'darwin', allowedTypes: ['txt'],
    runner: async () => ({ status: 0, stdout: `1\n${first}\n${second}\n` }) }), /nicht eindeutig/u);
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

test('proven Office owner files are rejected across OPC types while real ~$ documents remain sources', () => {
  for (const [extension, sourceType] of [['docx', 'docx'], ['xlsx', 'xlsx'], ['PPTX', 'pptx']]) {
    const source = path.join(root, `04-opened-${sourceType}.${extension}`);
    const owner = path.join(root, `~$-opened-${sourceType}.${extension}`);
    fs.writeFileSync(source, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64)]));
    fs.writeFileSync(owner, 'owner');
    assert.throws(() => validateSelectedPath(owner), (error) => error.code === 'SOURCE_ARTIFACT_IGNORED');
    const legitimate = path.join(root, `~$legitimate-${sourceType}.${extension}`);
    fs.writeFileSync(legitimate, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(32)]));
    assert.equal(validateSelectedPath(legitimate).sourceType, sourceType,
      'a real OPC document is never ignored by name alone');
  }
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

test('Windows multi-picker validates the 200-file product boundary for distinct local files', () => {
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

test('Linux multi-picker keeps case-distinct files instead of applying Windows path identity', () => {
  const upper = path.join(root, 'CaseDistinct.txt');
  const lower = path.join(root, 'casedistinct.txt');
  fs.writeFileSync(upper, 'upper');
  fs.writeFileSync(lower, 'lower');
  const selected = pickSources({
    platform: 'linux',
    allowedTypes: ['txt'],
    runner: () => ({ status: 0, stdout: `${upper}\n${lower}` })
  });
  assert.deepStrictEqual(selected.map((item) => item.sourcePath), [upper, lower]);
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

test('macOS cancellation is normalized to a marker and Linux accepts only its documented cancel exit', () => {
  assert.match(pickerCommands('darwin', {}, ['txt'], true)[0].args.at(-1), new RegExp(PICKER_CANCELLED));
  assert.throws(() => pickSources({ platform: 'darwin', runner: () => ({ status: 0, stdout: PICKER_CANCELLED }) }),
    (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
  assert.throws(() => pickSources({ platform: 'linux', runner: () => ({ status: 1, stdout: '' }) }),
    (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
});

test('native helper crashes without stdout are technical failures, never user cancellation', () => {
  for (const platform of ['win32', 'darwin', 'linux']) for (const status of [2, 5, 139]) {
    for (const picker of [pickSource, pickSources]) {
      assert.throws(() => picker({ platform, runner: () => ({ status, stdout: '' }) }),
        (error) => error.code !== 'LOCAL_SELECTION_CANCELLED');
    }
    assert.throws(() => pickFolder({ platform, runner: () => ({ status, stdout: '' }) }),
      (error) => error.code !== 'LOCAL_SELECTION_CANCELLED');
  }
});

testAsync('async privacy picker is abortable and 200-file selection receives a bounded long-path buffer', async () => {
  const controller = new AbortController();
  let privacySignal;
  const pending = pickFolderAsync({ platform: 'win32', signal: controller.signal, runner: async (_c, _a, _i, _e, signal) => {
    privacySignal = signal;
    controller.abort();
    return { status: 0, stdout: root };
  } });
  await assert.rejects(pending, (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
  assert.strictEqual(privacySignal, controller.signal);

  let maxBuffer = 0;
  await pickSourcesAsync({
    platform: 'linux', maxSources: 200,
    fs: { lstatSync: () => ({ size: 1, isFile: () => true, isSymbolicLink: () => false }) },
    fsPromises: { lstat: async () => ({ size: 1, isFile: () => true, isSymbolicLink: () => false }) },
    hasReparseComponent: () => false,
    runner: async (_c, _a, _i, _e, _s, budget) => { maxBuffer = budget; return { status: 0, stdout: path.resolve(root, 'long.txt') }; }
  });
  assert.ok(maxBuffer > 16 * 1024 * 1024 && maxBuffer < 20 * 1024 * 1024,
    '200 maximally long native paths require a bounded buffer below 20 MiB');
});

test('synchronous file and privacy-folder pickers never accept partial stdout from a failed native helper', () => {
  const source = path.join(root, 'partial-helper-output.txt');
  fs.writeFileSync(source, 'synthetic');
  for (const picker of [pickSource, pickSources]) {
    assert.throws(() => picker({
      platform: 'linux',
      runner: () => ({ status: 2, stdout: source })
    }), /nicht sicher gelesen|nicht gestartet/u);
  }
  assert.throws(() => pickFolder({
    platform: 'linux',
    runner: () => ({ status: 2, stdout: root })
  }), /nicht sicher gelesen|nicht gestartet/u);
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
  assert.doesNotMatch(source, /createServer|listen\(|http|net\./i);
});

// Execute the actual entry source with explicitly modeled OS/stdio boundaries.
// The real session implementation still validates and copies the FD-only key;
// this is not a native Darwin Core/signature proof or a synthetic picker run.
function stdioStartupFixture(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/companion/stdio-server.js'), 'utf8');
  const events = [], envReads = [], output = [], input = new EventEmitter();
  const bytes = options.bytes || secret;
  let consumed = 0, scratch, sessionSecret;
  const environment = new Proxy({
    DATASECURE_NATIVE_EXPORT_CHANNEL: options.channel,
    COMPANION_SESSION_KEY: Buffer.alloc(32, 83).toString('hex')
  }, {
    get(target, name) {
      envReads.push(name);
      assert.strictEqual(name, 'DATASECURE_NATIVE_EXPORT_CHANNEL', 'only the fixed native-role selector is an environment input');
      return target[name];
    }
  });
  function run() {
    vm.runInNewContext(source, {
      Buffer,
      process: {
        platform: options.platform || 'darwin', env: environment, stdin: input,
        stdout: { write(value) { events.push('stdout'); output.push(JSON.parse(value)); } }
      },
      require(name) {
        if (name === '../core/ownership-control') return { assertNativeOwnershipRuntime() {
          events.push('native-runtime');
          if (options.guardError) throw options.guardError;
        } };
        if (name === 'fs') return { readSync(fd, target, offset, length) {
          events.push('read-fd'); scratch = target;
          assert.strictEqual(fd, 3);
          assert.ok(length > 0 && length <= 33);
          const count = Math.min(length, bytes.length - consumed);
          bytes.copy(target, offset, consumed, consumed + count); consumed += count;
          return count;
        } };
        if (name === 'readline') return { createInterface({ input: selected }) {
          assert.strictEqual(selected, input); return input;
        } };
        if (name === '../runtime') return require('../plugins/data-secure/server/runtime');
        if (name === './release-verifier') { events.push('release-verifier'); return {}; }
        if (name === './ipc-session') return { createCompanionSession(received) {
          events.push('session'); sessionSecret = Buffer.from(received.secret);
          return createCompanionSession(received);
        } };
        assert.fail('unexpected entry dependency: ' + name);
      }
    }, { filename: 'actual-companion-stdio-startup.js', timeout: 1000 });
  }
  return { run, events, envReads, output, consumed: () => consumed,
    scratch: () => scratch, sessionSecret: () => sessionSecret };
}

test('stdio startup reads only the native selector, never an environment session key', () => {
  for (const [platform, channel, native] of [
    ['win32', '1', false], ['linux', '1', false], ['darwin', undefined, false],
    ['darwin', '0', false], ['darwin', 'true', false], ['darwin', '1', true]
  ]) {
    const f = stdioStartupFixture({ platform, channel }); f.run();
    assert.deepStrictEqual(f.envReads, platform === 'darwin' ? ['DATASECURE_NATIVE_EXPORT_CHANNEL'] : []);
    assert.strictEqual(f.events.filter(event => event === 'native-runtime').length, native ? 1 : 0);
    if (native) assert.strictEqual(f.events[0], 'native-runtime', 'native validation precedes private bootstrap/session/ready');
    assert.deepStrictEqual(f.sessionSecret(), secret);
    assert.strictEqual(f.consumed(), 32);
    assert.ok(f.scratch().every(byte => byte === 0));
    assert.strictEqual(f.output.length, 1);
    assert.strictEqual(f.output[0].type, 'ready');
    assert.strictEqual(f.output[0].ipc_version, IPC_VERSION);
    assert.strictEqual(f.output[0].authenticated_frames, true);
    assert.strictEqual(f.output[0].model_authority, false);
    assert.doesNotMatch(JSON.stringify(f.output), /COMPANION_SESSION_KEY|53535353/);
  }
});

test('native Darwin startup rejects an invalid Core before reading the secret or emitting ready', () => {
  const failure = Object.assign(new Error('synthetic fixed native failure'), { code: 'OWNERSHIP_GUARD_INTEGRITY_FAILED' });
  const f = stdioStartupFixture({ platform: 'darwin', channel: '1', guardError: failure });
  assert.throws(f.run, error => error === failure);
  assert.deepStrictEqual(f.events, ['native-runtime']);
  assert.strictEqual(f.consumed(), 0);
  assert.strictEqual(f.sessionSecret(), undefined);
  assert.deepStrictEqual(f.output, []);
});

test('environment key canaries cannot replace a short or oversized inherited bootstrap', () => {
  for (const length of [0, 31, 33]) {
    const f = stdioStartupFixture({ platform: 'darwin', channel: '1', bytes: Buffer.alloc(length, 61) });
    assert.throws(f.run, /Ungültiger privater Companion-Bootstrap/);
    assert.strictEqual(f.events[0], 'native-runtime');
    assert.strictEqual(f.sessionSecret(), undefined);
    assert.deepStrictEqual(f.output, []);
    assert.ok(f.consumed() <= 33);
    assert.ok(f.scratch().every(byte => byte === 0));
    assert.deepStrictEqual(f.envReads, ['DATASECURE_NATIVE_EXPORT_CHANNEL']);
  }
});

done();
