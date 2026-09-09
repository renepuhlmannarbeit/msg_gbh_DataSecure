'use strict';

const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { signFrame } = require('./ipc-session');
const { launchBackgroundRole } = require('../background-role-launcher');

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const READY_TIMEOUT_MS = 10_000;
const ENV_ALLOWLIST = new Set([
  'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
  'TMP', 'TEMP', 'TMPDIR', 'PATH', 'LANG', 'LC_ALL', 'DISPLAY',
  'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'
]);

function companionEnvironment(source = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    const upper = key.toUpperCase();
    if (ENV_ALLOWLIST.has(upper) || upper.startsWith('EU_PRIVACY_')) result[key] = value;
  }
  return result;
}

function terminateProcessTree(child, options = {}) {
  if (!child) return;
  const platform = options.platform || process.platform;
  if (platform === 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0) {
    const runner = options.killTreeRunner || childProcess.spawnSync;
    const systemRoot = options.systemRoot || process.env.SystemRoot || 'C:\\Windows';
    try {
      const result = runner(path.win32.join(systemRoot, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
        shell: false,
        timeout: 10_000
      });
      if (!result?.error && result?.status === 0) return;
    } catch { /* fall through to the direct child as a last resort */ }
  }
  try { child.kill(); } catch { /* process already exited */ }
}

function launchCompanion(options = {}) {
  const secret = crypto.randomBytes(32);
  let child;
  try {
    child = launchBackgroundRole('companion', {
      spawn: options.spawn, execPath: options.execPath, server: options.server, networkDeny: options.networkDeny,
      env: companionEnvironment(options.env || process.env)
    });
  } catch {
    secret.fill(0);
    throw new SafeError('Companion-Prozess konnte nicht sicher gestartet werden.');
  }
  let buffer = '';
  let descriptor;
  let readyResolve;
  let readyReject;
  let closed = false;
  let hasExited = false;
  let terminationRequested = false;
  let nextSequence = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let exitedResolve;
  const exited = new Promise(resolve => { exitedResolve = resolve; });
  const readyDeadline = setTimeout(() => {
    abort(new SafeError('Companion-Start hat das lokale Zeitlimit überschritten.'));
  }, READY_TIMEOUT_MS);
  readyDeadline.unref?.();

  function rejectAll(error) {
    clearTimeout(readyDeadline);
    readyReject(error);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  function abort(error) {
    closed = true;
    secret.fill(0);
    rejectAll(error);
    // Local session disposal cannot depend on a successful OS kill. Conversely,
    // never target a PID again after exit or a prior termination attempt.
    if (!hasExited && !terminationRequested) {
      terminationRequested = true;
      terminateProcessTree(child, options);
    }
  }

  function handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { throw new SafeError('Companion lieferte eine ungültige IPC-Antwort.'); }
    if (message.type === 'ready' && !descriptor) {
      if (message.transport !== 'inherited_stdio' || message.network_listener !== false) {
        throw new SafeError('Companion meldet keinen privaten Transport.');
      }
      descriptor = message;
      clearTimeout(readyDeadline);
      readyResolve(message);
      return;
    }
    const item = pending.get(message.sequence);
    if (!item) throw new SafeError('Companion-Antwort gehört zu keiner offenen Anfrage.');
    pending.delete(message.sequence);
    clearTimeout(item.timer);
    if (message.type === 'result') item.resolve(message.result);
    else {
      const selectionCancelled = message.code === 'LOCAL_SELECTION_CANCELLED';
      const error = new SafeError(selectionCancelled
        ? 'Die lokale Dateiauswahl wurde abgebrochen.'
        : 'Die lokale Companion-Anfrage wurde sicher abgewiesen.');
      error.code = selectionCancelled ? 'LOCAL_SELECTION_CANCELLED' : 'REQUEST_REJECTED';
      item.reject(error);
    }
  }

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf8') > MAX_RESPONSE_BYTES) {
      abort(new SafeError('Companion-IPC-Antwort ist zu groß.'));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try { handleLine(line); } catch (error) { abort(error); return; }
    }
  });
  child.once('error', () => {
    if (!child.pid) { hasExited = true; exitedResolve(null); }
    abort(new SafeError('Companion-Prozess konnte nicht gestartet werden.'));
  });
  child.once('exit', (code) => {
    hasExited = true;
    closed = true;
    secret.fill(0);
    rejectAll(new SafeError('Companion-Prozess wurde beendet.'));
    exitedResolve(code);
  });
  child.stdio[3].once('error', () => {
    abort(new SafeError('Companion-Bootstrap konnte nicht privat übertragen werden.'));
  });
  try { child.stdio[3].end(secret); }
  catch {
    abort(new SafeError('Companion-Bootstrap konnte nicht privat übertragen werden.'));
  }

  async function request(command, params = {}) {
    await ready;
    if (closed) throw new SafeError('Companion-Session ist beendet.');
    const sequence = nextSequence++;
    const frame = signFrame(secret, { session_id: descriptor.session_id, sequence, command, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(sequence);
        const error = new SafeError('Companion-Anfrage hat das lokale Zeitlimit überschritten.');
        reject(error);
        abort(error);
      }, options.timeoutMs || REQUEST_TIMEOUT_MS);
      pending.set(sequence, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(frame)}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          pending.delete(sequence);
          reject(new SafeError('Companion-Anfrage konnte nicht privat übertragen werden.'));
        }
      });
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    secret.fill(0);
    child.stdin.end();
  }

  return { ready, request, close, exited,
    terminate: () => abort(new SafeError('Companion-Session wurde lokal beendet.')) };
}

module.exports = {
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  READY_TIMEOUT_MS,
  companionEnvironment,
  terminateProcessTree,
  launchCompanion
};
