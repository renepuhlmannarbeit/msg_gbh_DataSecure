import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fork, spawn } from 'node:child_process';
import { createSuite } from './helpers.js';
import { loopbackCanaries } from './lib/loopback-network-canaries.mjs';
import { collectProductFiles } from '../scripts/lib/product-files.mjs';
import { collectStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';

const { testAsync, assert, done } = createSuite('Projected product isolation and offline workers');
const server = path.resolve(import.meta.dirname, '../plugins/data-secure/server');
const projectionTarget = process.platform === 'win32' ? 'windows-x64' :
  process.platform === 'darwin' ? `macos-${process.arch}` : 'portable-source';
const projections = {
  plugin: new Map(collectProductFiles(path.dirname(server)).filter(file => file.archivePath.startsWith('server/'))
    .map(file => [file.archivePath.slice(7), fs.readFileSync(file.fullPath)])),
  standalone: new Map(collectStandaloneRuntime(server, projectionTarget).map(file => [file.relative, file.bytes]))
};
// Projection validation may fail before a test starts; allocate owned scratch
// space only after it succeeds so that setup failures leave no orphaned root.
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ds-product-isolation-'));
const initial = fs.lstatSync(temporary);
const children = [];
const staged = {};

async function bounded(promise, label, timeout = 60000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}
function environment(channel) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  // Same synthetic OS account, separate real product namespaces. Do not fake
  // the distinction by merely assigning arbitrary EU_PRIVACY_DATA_ROOT values.
  for (const [key, folder] of Object.entries({ HOME: 'home', USERPROFILE: 'home', LOCALAPPDATA: 'localapp',
    APPDATA: 'roaming', TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp', XDG_DATA_HOME: 'xdg-data',
    XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', DATASECURE_STANDALONE_DOCUMENTS_DIR: 'documents' })) {
    env[key] = path.join(temporary, 'account', folder);
    fs.mkdirSync(env[key], { recursive: true });
  }
  env.DATASECURE_PRODUCT_CHANNEL = channel;
  env.EU_PRIVACY_RESULT_ROOT = path.join(temporary, `${channel}-results`);
  fs.mkdirSync(env.EU_PRIVACY_RESULT_ROOT, { recursive: true });
  env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR = path.join(temporary, 'diagnostics');
  return env;
}
function launch(channel) {
  const directory = path.join(temporary, `projected-${channel}`, 'server');
  for (const [relative, bytes] of projections[channel]) {
    const target = path.join(directory, ...relative.split('/'));
    assert.ok(within(temporary, target));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o700 });
  }
  staged[channel] = directory;
  const worker = path.join(import.meta.dirname, 'lib', 'product-isolation-worker.cjs');
  const child = fork(worker, [directory, channel], { cwd: path.dirname(directory), execArgv: [],
    env: environment(channel), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = '', sequence = 0;
  const pending = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdout.on('data', bytes => { stderr += bytes; });
  child.on('message', message => {
    if (message.ready) { readyResolve(); return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(message.id);
    if (message.ok) waiter.resolve(message.result); else waiter.reject(new Error(message.error));
  });
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    const error = new Error(`ISOLATION_WORKER_EXIT:${code}:${signal}:${stderr}`);
    readyReject(error);
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear(); resolve({ code, signal });
  }));
  child.once('error', readyReject);
  const request = (action, fields = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`ISOLATION_TIMEOUT:${action}`)); }, 90000);
    pending.set(id, { resolve, reject, timer }); child.send({ id, action, ...fields });
  });
  const client = { child, ready, closed, request,
    stop: async () => { if (child.connected) await request('stop'); } };
  children.push(client);
  return client;
}

function launchAdapter(channel) {
  const standalone = channel === 'standalone';
  const child = spawn(process.execPath, [path.join(staged[channel], standalone ? 'standalone/desktop-sidecar.js' : 'index.js')], {
    cwd: path.dirname(staged[channel]), env: { ...environment(channel), EU_PRIVACY_SUPPORT_MODE: '1' },
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let buffer = Buffer.alloc(0), stderr = '', sequence = 0;
  const pending = new Map();
  const fail = error => { for (const waiter of pending.values()) waiter.reject(error); pending.clear(); };
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdin.on('error', fail);
  child.once('error', fail);
  child.stdout.on('data', bytes => {
    buffer = Buffer.concat([buffer, bytes]);
    try {
      assert.ok(buffer.length <= 1024 * 1024, 'bounded adapter response');
      for (;;) {
        let body;
        if (standalone) {
          if (buffer.length < 4) break;
          const length = buffer.readUInt32BE(0);
          assert.ok(length >= 2 && length <= 1024 * 1024);
          if (buffer.length < 4 + length) break;
          body = buffer.subarray(4, 4 + length); buffer = buffer.subarray(4 + length);
        } else {
          const end = buffer.indexOf(10);
          if (end < 0) break;
          body = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
        }
        const value = JSON.parse(body.toString('utf8'));
        const id = standalone ? value.request_id : value.id;
        const waiter = pending.get(id);
        assert.ok(waiter, 'correlated real adapter response');
        pending.delete(id); waiter.resolve(value);
      }
    } catch (error) { fail(error); }
  });
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    fail(new Error(`ADAPTER_EXIT:${code}:${signal}:${stderr}`)); resolve({ code, signal });
  }));
  const send = (action, fields = {}) => {
    const id = standalone ? (++sequence).toString(16).padStart(16, '0') : ++sequence;
    const payload = standalone ? { schema: 'datasecure-standalone-private-ipc/1', request_id: id, action, ...fields }
      : { jsonrpc: '2.0', id, method: action, params: fields };
    const body = Buffer.from(JSON.stringify(payload));
    let wire;
    if (standalone) { const header = Buffer.alloc(4); header.writeUInt32BE(body.length); wire = Buffer.concat([header, body]); }
    else wire = Buffer.concat([body, Buffer.from('\n')]);
    return bounded(new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject }); child.stdin.write(wire);
    }), `ADAPTER_TIMEOUT:${action}`).finally(() => pending.delete(id));
  };
  const client = { child, closed, send, stop: async () => {
    if (standalone && child.exitCode === null) await send('shutdown');
    child.stdin.end();
  } };
  children.push(client);
  return client;
}

let pair;
await testAsync('both real projections process simultaneously and reject foreign journals and read grants', async () => {
  const plugin = launch('plugin'), standalone = launch('standalone');
  await bounded(Promise.all([plugin.ready, standalone.ready]), 'ISOLATION_READY_TIMEOUT');
  assert.notStrictEqual(plugin.child.pid, standalone.child.pid);
  const [left, right] = await Promise.all([plugin.request('start'), standalone.request('start')]);
  assert.ok(within(temporary, left.dataRoot) && within(temporary, right.dataRoot));
  assert.notStrictEqual(left.dataRoot, right.dataRoot);
  assert.notStrictEqual(left.workspace, right.workspace);
  assert.notStrictEqual(left.token, right.token);
  assert.ok(left.dataRoot.endsWith(`${path.sep}SecureDataMsg`));
  assert.ok(right.dataRoot.endsWith(`${path.sep}SecureDataMsg-Standalone`));
  assert.deepStrictEqual(await Promise.all([plugin.request('cross', { foreign: right }),
    standalone.request('cross', { foreign: left })]), [{ isolated: true }, { isolated: true }]);
  pair = { plugin, standalone, left, right };
});

await testAsync('real MCP and private sidecar expose only their own isolated runs', async () => {
  assert.ok(pair);
  const mcp = launchAdapter('plugin'), sidecar = launchAdapter('standalone');
  const [initialization, state] = await Promise.all([mcp.send('initialize', {}), sidecar.send('get_public_state')]);
  assert.ok(initialization.result);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.result.product_channel, 'standalone');
  assert.strictEqual(state.result.external_disclosure, false);
  const call = (name, args = {}) => mcp.send('tools/call', { name, arguments: args });
  const [own, foreign, read, history] = await Promise.all([
    call('document_batch_status', { batch_token: pair.left.token }),
    call('document_batch_status', { batch_token: pair.right.token }),
    call('read_anonymized_document', { package_id: pair.right.package_id, read_capability: pair.right.read_capability }),
    sidecar.send('get_run_history')
  ]);
  assert.notStrictEqual(own.result.isError, true, 'own Cowork journal remains available through real MCP');
  assert.strictEqual(own.result.structuredContent.batch_token, pair.left.token);
  assert.strictEqual(foreign.result.isError, true);
  assert.strictEqual(read.result.isError, true);
  assert.strictEqual(history.ok, true);
  assert.deepStrictEqual(history.result.entries.map(entry => entry.batch_id), [pair.right.token]);
  for (const action of ['resolve_history_results', 'resolve_history_ledger', 'continue_history_batch']) {
    const result = await sidecar.send(action, { batch_id: pair.left.token });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error_code, 'STANDALONE_HISTORY_MISSING');
  }
  const publicResponses = JSON.stringify({ state, foreign, read, history });
  for (const privateValue of [pair.left.marker, pair.right.marker, pair.left.read_capability, pair.right.read_capability,
    pair.left.workspace, pair.right.workspace]) assert.ok(!publicResponses.includes(privateValue));
  await Promise.all([mcp.stop(), sidecar.stop()]);
  for (const client of [mcp, sidecar]) assert.strictEqual((await bounded(client.closed, 'ADAPTER_CLOSE_TIMEOUT', 10000)).code, 0);
});

await testAsync('copying only a synthetic foreign journal is rejected before package or source access', async () => {
  assert.ok(pair, 'parallel positive controls must finish first');
  const { plugin, standalone, left, right } = pair;
  for (const [source, destination] of [[left, right], [right, left]]) {
    const target = path.join(path.dirname(destination.journal), `${source.token}.json`);
    assert.ok(within(temporary, target));
    fs.copyFileSync(source.journal, target, fs.constants.COPYFILE_EXCL);
    assert.ok(!fs.existsSync(path.join(destination.output, source.package_id)), 'no foreign artifacts were copied');
  }
  assert.deepStrictEqual(await Promise.all([plugin.request('copied-journal', { token: right.token }),
    standalone.request('copied-journal', { token: left.token })]),
  [{ foreign_journal_rejected: true }, { foreign_journal_rejected: true }]);
});

if (process.platform === 'win32' && process.arch === 'x64') {
  await testAsync('real Windows native parser workers deny DNS, sockets, HTTP and proxy canaries', async () => {
    assert.ok(pair);
    const sinks = await loopbackCanaries();
    try {
      await bounded(sinks.positiveControl(), 'CANARY_POSITIVE_TIMEOUT', 10000);
      const before = sinks.snapshot();
      const preload = fs.readFileSync(path.join(import.meta.dirname, 'helpers/packaged-network-canary.cjs'));
      for (const channel of ['plugin', 'standalone']) {
        fs.writeFileSync(path.join(staged[channel], 'offline-canary.cjs'), preload, { flag: 'wx' });
        fs.writeFileSync(path.join(staged[channel], 'offline-canary-targets.json'), JSON.stringify(sinks.targets), { flag: 'wx' });
      }
      const results = await Promise.all([pair.plugin.request('offline', { targets: sinks.targets }),
        pair.standalone.request('offline', { targets: sinks.targets })]);
      assert.deepStrictEqual(results, [
        { native_parser: true, canaries_denied: 11, proxy_controls_absent: true },
        { native_parser: true, canaries_denied: 11, proxy_controls_absent: true }
      ]);
      assert.deepStrictEqual(sinks.snapshot(), before, 'no extra sink request after the positive controls');
      for (const channel of ['plugin', 'standalone']) for (const [relative, bytes] of projections[channel]) {
        assert.deepStrictEqual(fs.readFileSync(path.join(staged[channel], relative)), bytes,
          `projected product byte changed: ${channel}/${relative}`);
      }
    } finally { await sinks.close(); }
  });
} else console.log('  skip Windows native worker canaries require Windows x64 (no other target-host claim)');

await done(async () => {
  const errors = [];
  for (const client of children) {
    try {
      if (client.child.exitCode === null) await bounded(client.stop(), 'ISOLATION_STOP_TIMEOUT', 5000);
      const result = await bounded(client.closed, 'ISOLATION_CLOSE_TIMEOUT', 10000);
      assert.strictEqual(result.code, 0);
    } catch (error) {
      errors.push(error);
      if (client.child.exitCode === null) client.child.kill();
      await bounded(client.closed, 'ISOLATION_KILL_TIMEOUT', 10000);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Product process cleanup failed; preserve owned evidence');
  const current = fs.lstatSync(temporary);
  assert.ok(current.isDirectory() && !current.isSymbolicLink());
  assert.strictEqual(current.dev, initial.dev); assert.strictEqual(current.ino, initial.ino);
  const inspect = directory => {
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name), entry = fs.lstatSync(target);
      assert.ok(within(temporary, target) && !entry.isSymbolicLink());
      assert.ok(entry.isDirectory() || entry.isFile());
      if (entry.isDirectory()) inspect(target);
    }
  };
  inspect(temporary);
  fs.rmSync(temporary, { recursive: true });
});
