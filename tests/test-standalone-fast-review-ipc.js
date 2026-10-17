'use strict';
// Fresh production projection and independent real workers. Synthetic sources,
// actual OCR and framed IPC; no renderer, native picker or target-Mac claim.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-fast-ipc-'));
const stamp = fs.lstatSync(root), children = [];
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
    children.push(child);
    const exited = new Promise(resolve => child.once('close', resolve));
    let buffer = Buffer.alloc(0), stderr = ''; const pending = new Map();
    child.stdin.on('error', () => {}); child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString('utf8')).slice(-8192); });
    child.once('exit', code => { for (const value of pending.values()) { clearTimeout(value.timer); value.reject(Error(`FAST_IPC_EXIT:${code}:${stderr}`)); } pending.clear(); });
    child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const count = buffer.readUInt32BE(0); assert.ok(count > 1 && count <= 1024 * 1024);
        if (buffer.length < count + 4) return;
        const value = JSON.parse(buffer.subarray(4, count + 4).toString('utf8')); buffer = buffer.subarray(count + 4);
        const receiver = pending.get(value.request_id); assert.ok(receiver, 'unrequested frame'); pending.delete(value.request_id);
        clearTimeout(receiver.timer); receiver.resolve(value);
      }
    });
    const request = value => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(value.request_id); reject(Error('FAST_IPC_TIMEOUT:' + value.action)); }, 120000);
      pending.set(value.request_id, { resolve, reject, timer }); child.stdin.write(encodeFrame(value));
    });
    active = { child, exited, request }; return request;
  };
  const stop = async () => {
    if (!active || active.child.exitCode !== null || active.child.signalCode !== null) return;
    const answer = await active.request({ schema:'datasecure-standalone-private-ipc/1', request_id:(++sequence).toString(16).padStart(32,'0'), action:'shutdown' });
    assert.equal(answer.ok, true); assert.equal(await active.exited, 0);
  };
  const sources = path.join(root, 'sources'); fs.mkdirSync(sources);
  try {
    await runPackagedFastReviewScenario({ request:launch(), sourceDirectory:sources, restart:async () => { await stop(); return launch(); } });
    await stop();
  } finally {
    // Only own ChildProcess objects; never PID discovery or a system-wide kill.
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
  }
  // Preserve a failed fixture for diagnosis. Remove only the completed, exact
  // temporary root, after every owned sidecar and its completed worker exits.
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.match(path.basename(root), /^datasecure-fast-ipc-/u);
  const current = fs.lstatSync(root); assert.ok(current.isDirectory() && !current.isSymbolicLink());
  assert.equal(current.dev, stamp.dev); assert.equal(current.ino, stamp.ino);
  require('../plugins/data-secure/server/gateway/common').safeRemovePrivateTree(path.dirname(root), path.basename(root));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
