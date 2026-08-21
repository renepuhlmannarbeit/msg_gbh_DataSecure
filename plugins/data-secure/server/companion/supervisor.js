'use strict';

const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { signFrame } = require('./ipc-session');

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 64 * 1024;
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

function launchCompanion(options = {}) {
  const spawn = options.spawn || childProcess.spawn;
  const secret = crypto.randomBytes(32);
  const server = options.server || path.join(__dirname, 'stdio-server.js');
  const child = spawn(options.execPath || process.execPath, [server], {
    stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
    windowsHide: true,
    env: companionEnvironment(options.env || process.env)
  });
  child.stdio[3].end(secret);

  let buffer = '';
  let descriptor;
  let readyResolve;
  let readyReject;
  let closed = false;
  let nextSequence = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

  function rejectAll(error) {
    readyReject(error);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  function handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { throw new SafeError('Companion lieferte eine ungültige IPC-Antwort.'); }
    if (message.type === 'ready' && !descriptor) {
      if (message.transport !== 'inherited_stdio' || message.network_listener !== false) {
        throw new SafeError('Companion meldet keinen privaten Transport.');
      }
      descriptor = message;
      readyResolve(message);
      return;
    }
    const item = pending.get(message.sequence);
    if (!item) throw new SafeError('Companion-Antwort gehört zu keiner offenen Anfrage.');
    pending.delete(message.sequence);
    clearTimeout(item.timer);
    if (message.type === 'result') item.resolve(message.result);
    else item.reject(new SafeError(String(message.message || 'Companion-Anfrage wurde abgewiesen.')));
  }

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf8') > MAX_RESPONSE_BYTES) {
      rejectAll(new SafeError('Companion-IPC-Antwort ist zu groß.'));
      child.kill();
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try { handleLine(line); } catch (error) { rejectAll(error); child.kill(); return; }
    }
  });
  child.once('error', () => rejectAll(new SafeError('Companion-Prozess konnte nicht gestartet werden.')));
  child.once('exit', () => {
    closed = true;
    secret.fill(0);
    rejectAll(new SafeError('Companion-Prozess wurde beendet.'));
  });

  async function request(command, params = {}) {
    await ready;
    if (closed) throw new SafeError('Companion-Session ist beendet.');
    const sequence = nextSequence++;
    const frame = signFrame(secret, { session_id: descriptor.session_id, sequence, command, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(sequence);
        reject(new SafeError('Companion-Anfrage hat das lokale Zeitlimit überschritten.'));
        child.kill();
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

  return { ready, request, close };
}

module.exports = { REQUEST_TIMEOUT_MS, MAX_RESPONSE_BYTES, companionEnvironment, launchCompanion };
