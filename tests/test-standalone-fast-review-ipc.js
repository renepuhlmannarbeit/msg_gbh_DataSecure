'use strict';
// Fresh production projection and independent real workers. Synthetic sources,
// actual OCR and framed IPC; no renderer, native picker or target-Mac claim.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { firstFailure, within, ownChild, reviewFrames, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-fast-ipc-'));
const stamp = fs.lstatSync(root), children = [];
const primary = firstFailure();
let active, sequence = 0;
async function main() {
  const { writeStandaloneRuntime } = await import('../scripts/lib/standalone-runtime-projection.mjs');
  const { writeConversionRuntime } = await import('../scripts/lib/standalone-conversion-runtime.mjs');
  const { runPackagedFastReviewScenario } = await import('./helpers/standalone-packaged-fast-review.mjs');
  const repo = path.resolve(__dirname, '..'), server = path.join(root, 'server');
  const target = `${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}${process.platform === 'linux' ? '-glibc' : ''}`;
  writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), server, target);
  writeConversionRuntime(repo, path.join(server, 'standalone/conversion-runtime'), target);
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  for (const [key, name] of Object.entries({ HOME:'home', USERPROFILE:'home', LOCALAPPDATA:'local', APPDATA:'roaming',
    TEMP:'temp', TMP:'temp', TMPDIR:'temp', XDG_DATA_HOME:'data', XDG_CONFIG_HOME:'config', XDG_CACHE_HOME:'cache',
    DATASECURE_STANDALONE_DOCUMENTS_DIR:'documents', EU_PRIVACY_RESULT_ROOT:'results', DATASECURE_STANDALONE_DIAGNOSTIC_DIR:'diagnostics' })) {
    env[key] = path.join(root, name); fs.mkdirSync(env[key], { recursive:true });
  }
  env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  const launch = () => {
    const child = spawn(process.execPath, [path.join(server, 'standalone/desktop-sidecar.js')], { env, windowsHide:true, stdio:['pipe','pipe','pipe'] });
    const transport = firstFailure(), pending = new Map();
    let ended = false, stderr = '';
    function failTransport(error) {
      transport.record(error); primary.record(transport.value); process.exitCode = 1;
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(transport.value); }
      pending.clear();
    }
    // Register every returned handle before assuming spawn supplied any pipes.
    const owned = ownChild(child, failTransport);
    const record = { child, owned, stopping: false, stopped: null, request: null, stop: null };
    children.push(record);
    const started = Promise.race([
      new Promise(resolve => child.once('spawn', resolve)),
      owned.error.then(error => { throw error; }),
      owned.done.then(() => { owned.failure.throwIfFailed(); throw Error('FAST_IPC_CLOSED_BEFORE_SPAWN'); })
    ]);
    started.catch(() => {}); // The original startup Promise remains rejecting for its caller.
    child.stdin?.on('error', failTransport);
    child.stdout?.on('error', failTransport);
    child.stderr?.on('error', failTransport);
    child.stderr?.on('data', bytes => { stderr = (stderr + bytes.toString('utf8')).slice(-8192); });
    child.once('exit', (code, signal) => {
      ended = true;
      if (!record.stopping || code !== 0 || signal || pending.size)
        failTransport(Error('FAST_IPC_EXIT:' + code + ':' + stderr));
    });
    child.once('close', (code, signal) => {
      ended = true;
      if (!record.stopping || code !== 0 || signal || pending.size)
        failTransport(Error('FAST_IPC_CLOSE:' + code + ':' + stderr));
    });
    child.stdout?.on('data', reviewFrames(pending, failTransport));
    record.request = async (value, milliseconds = 120000) => {
      const deadlineAt = performance.now() + milliseconds;
      try {
        transport.throwIfFailed();
        await within(started, Math.min(5000, milliseconds), 'FAST_IPC_STARTUP_TIMEOUT');
        transport.throwIfFailed();
        assert.ok(child.stdin && child.stdout && child.stderr, 'FAST_IPC_STDIO_REQUIRED');
        assert.ok(!ended && !owned.closed, 'FAST_IPC_ALREADY_ENDED');
        assert.ok(!pending.has(value.request_id), 'FAST_IPC_DUPLICATE_REQUEST');
        const remaining = deadlineAt - performance.now();
        assert.ok(remaining > 0, 'FAST_IPC_REQUEST_DEADLINE');
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => failTransport(Error('FAST_IPC_TIMEOUT:' + value.action)), remaining);
          pending.set(value.request_id, { resolve, reject, timer });
          try { child.stdin.write(encodeFrame(value), error => { if (error) failTransport(error); }); }
          catch (error) { failTransport(error); }
        });
      } catch (error) { failTransport(error); throw transport.value; }
    };
    record.stop = () => {
      if (!record.stopped) record.stopped = (async () => {
        const failure = firstFailure(); record.stopping = true;
        if (!owned.closed) {
          try {
            const answer = await record.request({ schema:'datasecure-standalone-private-ipc/1',
              request_id:(++sequence).toString(16).padStart(32,'0'), action:'shutdown' }, 5000);
            assert.equal(answer.ok, true);
          } catch (error) { failure.record(error); primary.record(error); }
        }
        try {
          const result = await within(owned.done, 5000, 'FAST_IPC_CLOSE_TIMEOUT');
          assert.equal(result.code, 0); assert.equal(result.signal, null);
        } catch (error) { failure.record(error); primary.record(error); }
        if (owned.failure.failed) failure.record(owned.failure.value);
        if (transport.failed) failure.record(transport.value);
        failure.throwIfFailed();
      })();
      return record.stopped;
    };
    active = record; return record.request;
  };
  const stop = async () => { if (active) await active.stop(); };
  const finish = async () => {
    for (const record of children) {
      try { await record.stop(); } catch (error) { primary.record(error); }
      try { if (!record.owned.closed) record.owned.terminate(); }
      catch (error) { primary.record(error); }
      try { await within(record.owned.done, 5000, 'FAST_IPC_FINISH_TIMEOUT'); }
      catch (error) { primary.record(error); }
      if (record.owned.failure.failed) primary.record(record.owned.failure.value);
    }
  };
  const sources = path.join(root, 'sources'); fs.mkdirSync(sources);
  try {
    await runPackagedFastReviewScenario({ request:launch(), sourceDirectory:sources, restart:async () => { await stop(); return launch(); } });
    await stop();
  } catch (error) { primary.record(error);
  } finally {
    await finish();
  }
  // Preserve this invocation's runtime: host close is not a writer-tree join.
  if (!primary.failed) {
    try {
      assert.ok(children.every(record => record.owned.closed), 'FAST_IPC_CHILD_END_UNCONFIRMED');
      assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
      assert.match(path.basename(root), /^datasecure-fast-ipc-/u);
      const current = fs.lstatSync(root); assert.ok(current.isDirectory() && !current.isSymbolicLink());
      assert.equal(current.dev, stamp.dev); assert.equal(current.ino, stamp.ino);
    } catch (error) { primary.record(error); }
  }
  try { process.stderr.write('FAST_IPC_SCOPE_RETAINED; writer_join=NOT_CLAIMED; deletion=NOT_ATTEMPTED\n'); }
  catch (error) { primary.record(error); }
  primary.throwIfFailed();
}
main().catch(error => endTestCliFailure({ failed: true, error, retainedRoots: [root],
  unconfirmedChildren: children.some(record => !record.owned.closed) }));
