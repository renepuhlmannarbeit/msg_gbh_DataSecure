'use strict';

const assert = require('node:assert');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');

function protocolClient(child) {
  let buffer = Buffer.alloc(0);
  let stderr = '';
  const pending = new Map();
  const failAll = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  child.once('exit', (code) => failAll(new Error(`sidecar exited ${code}: ${stderr}`)));
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (length < 2 || length > 1024 * 1024) return failAll(new Error('sidecar frame invalid'));
      if (buffer.length < length + 4) return;
      let value;
      try { value = JSON.parse(buffer.subarray(4, length + 4).toString('utf8')); }
      catch (error) { return failAll(error); }
      buffer = buffer.subarray(length + 4);
      const waiter = pending.get(value.request_id);
      if (!waiter) return failAll(new Error('unexpected sidecar response'));
      pending.delete(value.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  });
  return {
    send(action, id, fields = {}, trailingFrame = Buffer.alloc(0)) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`sidecar response timeout: ${stderr}`));
        }, 60000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(Buffer.concat([encodeFrame({
          schema: 'datasecure-standalone-private-ipc/1', request_id: id, action, ...fields
        }), trailingFrame]));
      });
    }
};
}

const sidecarFile = path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js');
const lifecycleFixture = path.join(__dirname, 'lib/standalone-sidecar-lifecycle.cjs');

function isolatedEnvironment(root) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'COMSPEC', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const directories = {
    HOME: 'home', USERPROFILE: 'home', LOCALAPPDATA: 'localapp', APPDATA: 'roaming',
    TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp', XDG_DATA_HOME: 'data',
    XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache',
    DATASECURE_STANDALONE_DOCUMENTS_DIR: 'documents', EU_PRIVACY_RESULT_ROOT: 'output',
    DATASECURE_STANDALONE_DIAGNOSTIC_DIR: 'diagnostics'
  };
  for (const [key, folder] of Object.entries(directories)) {
    env[key] = path.join(root, folder);
    fs.mkdirSync(env[key], { recursive: true });
  }
  if (process.platform === 'win32') {
    env.HOMEDRIVE = path.parse(env.USERPROFILE).root.replace(/[\\/]$/u, '');
    env.HOMEPATH = env.USERPROFILE.slice(env.HOMEDRIVE.length);
  }
  env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION = 'a'.repeat(32);
  return env;
}

function trackChild(child, children) {
  child.closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  child.stdin.on('error', () => {}); // Expected when intentionally testing a closed private pipe.
  children.push(child);
  return child;
}

async function bounded(promise, message, timeout = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

async function waitForFile(file, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < deadline, `missing test receipt: ${path.basename(file)}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function workerEnded(root) {
  const spawnedFile = path.join(root, 'worker-spawned.json');
  if (!fs.existsSync(spawnedFile)) return;
  const spawned = JSON.parse(fs.readFileSync(spawnedFile, 'utf8'));
  const exited = await waitForFile(path.join(root, 'worker-exit.json'), 22000);
  assert.strictEqual(exited.pid, spawned.pid);
  const deadline = Date.now() + 5000;
  while (processAlive(exited.pid)) {
    assert.ok(Date.now() < deadline, 'own fixture worker did not end; preserve its test directory');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return exited;
}

function removeOwnedRoot(root, initial) {
  const stat = fs.lstatSync(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.strictEqual(stat.dev, initial.dev);
  assert.strictEqual(stat.ino, initial.ino);
  assert.match(path.basename(root), /^datasecure-standalone-ipc-/u);
  assert.strictEqual(path.dirname(root), fs.realpathSync(os.tmpdir()));
  const targets = [];
  const inspect = (candidate) => {
    const relative = path.relative(root, candidate);
    assert.ok(!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    const entry = fs.lstatSync(candidate);
    assert.ok(!entry.isSymbolicLink(), 'never traverse links or junctions during test cleanup');
    assert.ok(entry.isDirectory() || entry.isFile());
    targets.push(candidate);
    if (entry.isDirectory()) for (const name of fs.readdirSync(candidate)) inspect(path.join(candidate, name));
  };
  inspect(root);
  assert.ok(targets.length > 0 && targets[0] === root);
  fs.rmSync(root, { recursive: true });
}

(async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-standalone-ipc-'));
  const initial = fs.lstatSync(root);
  const children = [];
  const fixtureRoots = [];
  const environment = isolatedEnvironment(root);
  const diagnostics = environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR;
  const sourceDirectory = path.join(root, 'sources');
  const sourceFile = path.join(sourceDirectory, 'profil.txt');
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(sourceFile, 'Erika Muster, erika@example.org');
  const child = trackChild(childProcess.spawn(process.execPath, [sidecarFile], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: environment
    }), children);
  let blockedChild;
  try {
    const client = protocolClient(child);
    const status = await client.send('get_public_state', 'a'.repeat(16));
    assert.strictEqual(status.schema, 'datasecure-standalone-private-response/1');
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.result.product_channel, 'standalone');
    assert.strictEqual(status.result.external_disclosure, false);
    assert.doesNotMatch(JSON.stringify(status), /source_path|raw_content|mapping/u);
    const emptyHistory = await client.send('get_run_history', 'ab'.repeat(8));
    assert.strictEqual(emptyHistory.ok, true);
    assert.strictEqual(emptyHistory.result.local_ui_only, true);
    assert.deepStrictEqual(emptyHistory.result.entries, []);
    for (const action of ['resolve_history_results', 'resolve_history_ledger', 'continue_history_batch']) {
      const unknown = await client.send(action, 'ac'.repeat(8), { batch_id: 'd'.repeat(64) });
      assert.strictEqual(unknown.ok, false, 'a missing history entry must not resolve or resume the latest run');
      assert.strictEqual(unknown.error_code, 'STANDALONE_HISTORY_MISSING');
    }
    const admitted = await client.send('admit_selected_sources', 'b'.repeat(16), {
      source_kind: 'files', source_paths: [sourceFile]
    });
    assert.strictEqual(admitted.ok, true);
    assert.deepStrictEqual(admitted.result.ui_context.selected_files, ['profil.txt']);
    const context = await client.send('get_ui_context', 'c'.repeat(16));
    assert.strictEqual(context.ok, true);
    assert.deepStrictEqual(context.result.selected_files, ['profil.txt']);
    assert.throws(() => encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: '9'.repeat(16), action: 'start_admitted_batch', processing_mode: 'unknown-purpose' }),
      { code: 'PROCESSING_MODE_INVALID' });
    const retained = await client.send('get_ui_context', '8'.repeat(16));
    assert.deepStrictEqual(retained.result.selected_files, ['profil.txt']);
    const unchanged = await client.send('get_public_state', '7'.repeat(16));
    assert.strictEqual(unchanged.result.preparing, false);
    assert.strictEqual(unchanged.result.processing, false);
    const cancelled = await client.send('cancel_admission', 'd'.repeat(16));
    assert.strictEqual(cancelled.ok, true);
    const stopped = await client.send('shutdown', 'e'.repeat(16));
    assert.strictEqual(stopped.ok, true);
    assert.strictEqual((await bounded(child.closed, 'sidecar did not stop')).code, 0);

    const blockedBase = path.join(root, 'blocked-root');
    fs.mkdirSync(blockedBase);
    const blockedEnvironment = isolatedEnvironment(blockedBase);
    const blockedDataRoot = process.platform === 'win32' ? blockedEnvironment.LOCALAPPDATA
      : process.platform === 'darwin' ? path.join(blockedEnvironment.HOME, 'Library/Application Support')
        : blockedEnvironment.XDG_DATA_HOME;
    fs.mkdirSync(blockedDataRoot, { recursive: true });
    fs.writeFileSync(path.join(blockedDataRoot, 'SecureDataMsg-Standalone'), 'not a directory');
    blockedChild = trackChild(childProcess.spawn(process.execPath, [sidecarFile], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        env: { ...blockedEnvironment,
          DATASECURE_STANDALONE_DIAGNOSTIC_SESSION: 'invalid session',
          DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics }
      }), children);
    const blockedClient = protocolClient(blockedChild);
    const blocked = await blockedClient.send('get_public_state', 'f'.repeat(16));
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.error_code, 'STANDALONE_DATA_ROOT_UNSAFE');
    const blockedStopped = await blockedClient.send('shutdown', '0'.repeat(16));
    assert.strictEqual(blockedStopped.ok, true);
    assert.strictEqual((await bounded(blockedChild.closed, 'blocked sidecar did not stop')).code, 0);
    const interactionLog = fs.readFileSync(path.join(diagnostics, 'sidecar-interactions.jsonl'), 'utf8');
    const events = interactionLog.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'service_initialized'));
    assert.ok(events.some((event) => event.event === 'request_received' && event.action === 'get_public_state'));
    assert.ok(events.some((event) => event.session_id === 'a'.repeat(32)));
    assert.ok(!events.some((event) => event.session_id === 'invalid session'));
    assert.doesNotMatch(interactionLog, /source_paths|source_path|selected_files|raw_content|mapping|request_id/iu);
    process.stdout.write('✓ standalone sidecar exchanges bounded content-free frames\n');

    // Exercise the actual private endpoint and actual product batch worker. Its
    // only fixture seam holds execution after a real durable intake/lease until
    // parent IPC disconnects; this makes the former referenced-channel leak
    // deterministic instead of hoping a tiny TXT is still processing at EOF.
    for (const scenario of ['eof', 'pending-request-eof', 'truncated-header', 'truncated-payload', 'invalid-frame', 'shutdown-queue', 'output-error']) {
      const caseRoot = path.join(root, scenario);
      fs.mkdirSync(caseRoot);
      fixtureRoots.push(caseRoot);
      const env = isolatedEnvironment(caseRoot);
      const fixtureSource = path.join(caseRoot, 'synthetic.txt');
      const sourceText = 'Kontakt: erika@example.org\nTechnologie: Java\n';
      fs.writeFileSync(fixtureSource, sourceText);
      const host = trackChild(childProcess.spawn(process.execPath,
        [`--require=${lifecycleFixture}`, sidecarFile], {
          stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
          env: { ...env, DATASECURE_TEST_SIDECAR_LIFECYCLE_ROOT: caseRoot }
        }), children);
      const hostClient = protocolClient(host);
      assert.strictEqual((await hostClient.send('get_public_state', '1'.repeat(16))).ok, true);
      assert.strictEqual((await hostClient.send('admit_selected_sources', '2'.repeat(16), {
        source_kind: 'files', source_paths: [fixtureSource]
      })).ok, true);
      assert.strictEqual((await hostClient.send('start_admitted_batch', '3'.repeat(16), {
        processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral'
      })).ok, true);
      const ready = await waitForFile(path.join(caseRoot, 'worker-ready.json'));
      assert.strictEqual(ready.progress.batch_total, 1);
      assert.notStrictEqual(ready.progress.complete, true, 'worker must still own unfinished durable work');
      let expectedCode = 0;
      const frame = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
        request_id: '4'.repeat(16), action: 'get_public_state' });
      if (scenario === 'eof') host.stdin.end();
      else if (scenario === 'pending-request-eof') {
        fs.writeFileSync(path.join(caseRoot, 'defer-status'), '');
        const queued = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
          request_id: '5'.repeat(16), action: 'configure_results', source_paths: [path.join(caseRoot, 'must-not-create')] });
        host.stdin.write(Buffer.concat([frame, queued]));
        await waitForFile(path.join(caseRoot, 'status-waiting.json'));
        host.stdin.end();
      }
      else if (scenario.startsWith('truncated-')) {
        host.stdin.end(frame.subarray(0, scenario === 'truncated-header' ? 3 : 12));
        expectedCode = 65;
      } else if (scenario === 'invalid-frame') {
        host.stdin.write(Buffer.from([0xff, 0xff, 0xff, 0xff]));
        expectedCode = 65;
      } else if (scenario === 'shutdown-queue') {
        const queued = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
          request_id: '5'.repeat(16), action: 'configure_results', source_paths: [path.join(caseRoot, 'must-not-create')] });
        assert.strictEqual((await hostClient.send('shutdown', '4'.repeat(16), {}, queued)).ok, true);
      } else {
        host.stdout.destroy();
        host.stdin.write(frame);
        expectedCode = 1;
      }
      const ended = await bounded(host.closed, `${scenario}: control host stayed alive after channel termination`);
      assert.strictEqual(ended.code, expectedCode, scenario);
      const completed = await waitForFile(path.join(caseRoot, 'worker-complete.json'));
      assert.strictEqual(completed.pid, ready.pid);
      assert.strictEqual(completed.complete, true, `${scenario}: independent worker must finish its journal`);
      assert.strictEqual(completed.released, 1,
        `${scenario}: real parser/package processing was not completed: ${JSON.stringify(completed.items)}`);
      assert.strictEqual((await workerEnded(caseRoot)).code, 0);
      assert.strictEqual(fs.readFileSync(fixtureSource, 'utf8'), sourceText, 'original remains untouched');
      const log = fs.readFileSync(path.join(env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl'), 'utf8');
      const records = log.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
      const expectedEvent = ['eof', 'pending-request-eof'].includes(scenario) ? 'private_ipc_closed'
        : scenario.startsWith('truncated-') ? 'private_ipc_truncated'
          : scenario === 'invalid-frame' ? 'private_ipc_invalid'
            : scenario === 'shutdown-queue' ? 'sidecar_shutdown' : 'private_ipc_output_failed';
      assert.ok(records.some((event) => event.event === expectedEvent), scenario);
      assert.ok(!records.some((event) => event.action === 'configure_results'), 'queued requests are discarded during shutdown');
      assert.ok(!fs.existsSync(path.join(caseRoot, 'must-not-create')));
      assert.doesNotMatch(log, /synthetic\.txt|erika@example|source_paths|request_id/iu);
      assert.ok(!log.includes(caseRoot) && !log.includes(ready.token));
      process.stdout.write(`✓ standalone real sidecar/worker lifecycle: ${scenario}\n`);
    }
  } finally {
    for (const own of children) {
      if (own.exitCode === null && own.signalCode === null) own.kill();
      await bounded(own.closed, 'own sidecar process did not close; preserve its test directory');
    }
    // Never kill by a recorded PID: wait for the fixture's own bounded lifetime
    // and recorded exit, then validate all exact deletion targets before cleanup.
    for (const caseRoot of fixtureRoots) await workerEnded(caseRoot);
    removeOwnedRoot(root, initial);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
