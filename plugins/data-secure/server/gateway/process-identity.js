'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const path = require('node:path');
const { processAlive } = require('./process-liveness');

const ID_RE = /^[a-f0-9]{64}$/u;
const cache = new Map();

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function linuxBirth(pid, io = fs) {
  const stat = io.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  if (close < 1) return null;
  const fields = stat.slice(close + 2).trim().split(/\s+/u);
  const startTicks = fields[19]; // proc(5), field 22; the remainder starts at field 3.
  const bootId = io.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  if (!/^\d+$/u.test(startTicks || '') || !/^[a-f0-9-]{32,40}$/iu.test(bootId)) return null;
  return digest(`linux:${bootId.toLowerCase()}:${startTicks}`);
}

function windowsBirth(pid, spawnSync = childProcess.spawnSync, environment = process.env) {
  const systemRoot = String(environment.SystemRoot || environment.WINDIR || 'C:\\Windows');
  const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `$p=Get-Process -Id ${pid} -ErrorAction Stop;[Console]::Out.Write($p.StartTime.ToUniversalTime().Ticks)`;
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
    // A cold Windows PowerShell start on a loaded target host can exceed 2 s.
    // Keep a finite bound, but do not mistake startup latency for PID reuse.
    encoding: 'utf8', windowsHide: true, shell: false, timeout: 8000,
    maxBuffer: 4096, env: { SystemRoot: systemRoot, WINDIR: systemRoot }
  });
  const ticks = String(result?.stdout || '').trim();
  if (result?.status !== 0 || !/^\d{10,20}$/u.test(ticks)) return null;
  return digest(`win32:${ticks}`);
}

function macosBirth(pid, spawnSync = childProcess.spawnSync) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8', windowsHide: true, shell: false, timeout: 2000,
    maxBuffer: 256, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' }
  });
  const started = String(result?.stdout || '').trim().replace(/\s+/gu, ' ');
  if (result?.status !== 0 || !/^[A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(started)) return null;
  return digest(`darwin:${started}`);
}

function processInstanceIdentity(pid, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const alive = options.processAlive || processAlive;
  if (!alive(pid)) return null;
  const platform = options.platform || process.platform;
  const key = `${platform}:${pid}`;
  if (pid === (options.currentPid || process.pid) && cache.has(key)) return cache.get(key);
  let identity = null;
  try {
    if (platform === 'linux') identity = linuxBirth(pid, options.fs || fs);
    else if (platform === 'win32') identity = windowsBirth(pid, options.spawnSync || childProcess.spawnSync, options.env || process.env);
    else if (platform === 'darwin') identity = macosBirth(pid, options.spawnSync || childProcess.spawnSync);
  } catch { identity = null; }
  if (!ID_RE.test(String(identity || ''))) return null;
  if (pid === (options.currentPid || process.pid)) cache.set(key, identity);
  return identity;
}

// `unknown` deliberately blocks recovery. Only a dead process or a different
// birth identity proves that a persisted PID no longer owns the lease.
function processInstanceState(pid, expectedIdentity, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'dead';
  const alive = options.processAlive || processAlive;
  if (!alive(pid)) return 'dead';
  if (!ID_RE.test(String(expectedIdentity || ''))) return 'unknown';
  const actual = (options.processInstanceIdentity || processInstanceIdentity)(pid);
  if (!ID_RE.test(String(actual || ''))) return 'unknown';
  return actual === expectedIdentity ? 'same' : 'different';
}

module.exports = { ID_RE, processInstanceIdentity, processInstanceState, _test: { linuxBirth, windowsBirth, macosBirth } };
