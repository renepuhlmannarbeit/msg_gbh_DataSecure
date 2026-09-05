import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const IPC_SCHEMA = 'datasecure-standalone-private-ipc/1';
const RESPONSE_SCHEMA = 'datasecure-standalone-private-response/1';
const install = path.resolve(process.argv[2] || '');

function childProcessPath(value) {
  if (process.platform !== 'win32') return value;
  if (value.startsWith('\\\\?\\UNC\\')) return `\\\\${value.slice(8)}`;
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

function event(name, details = {}) {
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-standalone-install-diagnostic/1',
    time: new Date().toISOString(),
    event: name,
    ...details
  })}\n`);
}

function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

function receive(child, stderr) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error('STANDALONE_IPC_TIMEOUT')), 15000);
    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32BE(0);
      if (buffer.length < length + 4) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(buffer.subarray(4, length + 4).toString('utf8'))); }
      catch { reject(new Error('STANDALONE_IPC_RESPONSE_INVALID')); }
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('STANDALONE_RUNTIME_START_FAILED')); });
    child.once('exit', (code) => {
      if (buffer.length >= 4) return;
      clearTimeout(timer);
      reject(new Error(`STANDALONE_RUNTIME_EXIT_${code ?? 'UNKNOWN'}:${stderr.value.slice(0, 300)}`));
    });
  });
}

async function request(child, stderr, action, id) {
  const pending = receive(child, stderr);
  child.stdin.write(frame({ schema: IPC_SCHEMA, request_id: id, action }));
  return pending;
}

if (!install || !fs.statSync(install, { throwIfNoEntry: false })?.isDirectory()) {
  event('install_invalid', { outcome: 'failed' });
  process.exit(2);
}

const runtime = path.join(install, 'datasecure-core-x86_64-pc-windows-msvc.exe');
const sidecar = path.join(install, 'server', 'standalone', 'desktop-sidecar.js');
const deny = path.join(install, 'server', 'network-deny.cjs');
for (const [component, file] of Object.entries({ runtime, sidecar, network_deny: deny })) {
  const safe = fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true &&
    fs.lstatSync(file).isSymbolicLink() === false;
  event('component_checked', { component, outcome: safe ? 'ready' : 'missing' });
  if (!safe) process.exit(3);
}

const allowedEnvironment = {};
for (const key of [
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
  'LOCALAPPDATA', 'APPDATA', 'XDG_DATA_HOME', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'DATASECURE_STANDALONE_DOCUMENTS_DIR', 'DATASECURE_STANDALONE_DIAGNOSTIC_DIR'
]) {
  if (process.env[key]) allowedEnvironment[key] = process.env[key];
}
allowedEnvironment.DATASECURE_PRODUCT_CHANNEL = 'standalone';
event('runtime_starting', { outcome: 'progress' });
const child = childProcess.spawn(childProcessPath(runtime), ['--require=../network-deny.cjs', path.basename(sidecar)], {
  cwd: childProcessPath(path.dirname(sidecar)), windowsHide: true, shell: false,
  stdio: ['pipe', 'pipe', 'pipe'], env: allowedEnvironment
});
const stderr = { value: '' };
child.stderr.on('data', (chunk) => { stderr.value += chunk.toString('utf8'); });
try {
  const state = await request(child, stderr, 'get_public_state', 'a'.repeat(16));
  event('public_state_received', {
    outcome: state.schema === RESPONSE_SCHEMA && state.ok === true ? 'ready' : 'failed',
    error_code: state.error_code || null
  });
  const context = await request(child, stderr, 'get_ui_context', 'b'.repeat(16));
  event('ui_context_received', {
    outcome: context.schema === RESPONSE_SCHEMA && context.ok === true ? 'ready' : 'failed',
    error_code: context.error_code || null
  });
  await request(child, stderr, 'shutdown', 'c'.repeat(16));
  event('diagnostic_completed', { outcome: 'ready' });
} catch (error) {
  event('diagnostic_failed', { outcome: 'failed', error_code: String(error.message).split(':')[0] });
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) child.kill();
}
