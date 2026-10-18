'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const path = require('node:path');
const { types } = require('node:util');
const { processAlive } = require('./process-liveness');
const { verifyNativeLauncherArtifact } = require('../native-launcher');

const ID_RE = /^[a-f0-9]{64}$/u;
const ERROR_CODES = Object.freeze(['PROCESS_IDENTITY_UNAVAILABLE', 'PROCESS_IDENTITY_ACCESS_DENIED',
  'PROCESS_IDENTITY_TOOL_MISSING', 'PROCESS_IDENTITY_TIMEOUT', 'PROCESS_IDENTITY_OUTPUT_INVALID',
  'PROCESS_IDENTITY_PROBE_FAILED']);
const cache = new Map();

function identityFailure(code) {
  return Object.assign(new Error(code), { code });
}

function ownCode(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return undefined;
  return Object.getOwnPropertyDescriptor(error, 'code')?.value;
}

function assertProbeSucceeded(result) {
  const code = ownCode(result?.error);
  if (['EACCES', 'EPERM'].includes(code)) throw identityFailure('PROCESS_IDENTITY_ACCESS_DENIED');
  if (code === 'ENOENT') throw identityFailure('PROCESS_IDENTITY_TOOL_MISSING');
  if (code === 'ETIMEDOUT') throw identityFailure('PROCESS_IDENTITY_TIMEOUT');
  if (code === 'ENOBUFS') throw identityFailure('PROCESS_IDENTITY_OUTPUT_INVALID');
  if (result?.error || result?.signal || result?.status !== 0)
    throw identityFailure('PROCESS_IDENTITY_PROBE_FAILED');
}

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

function windowsBirth(pid, spawnSync = childProcess.spawnSync, verifyArtifact = verifyNativeLauncherArtifact) {
  const executable = path.join(__dirname, '..', 'native', 'windows-x64', 'datasecure-sandbox.exe');
  verifyArtifact(executable);
  const result = spawnSync(executable, ['--process-birth', String(pid)], {
    encoding: 'utf8', windowsHide: true, shell: false, timeout: 2000,
    maxBuffer: 128, env: {}
  });
  assertProbeSucceeded(result);
  const ticks = String(result?.stdout || '').trim();
  if (!/^\d{10,20}$/u.test(ticks)) throw identityFailure('PROCESS_IDENTITY_OUTPUT_INVALID');
  return digest(`win32:${ticks}`);
}

function macosBirth(pid, spawnSync = childProcess.spawnSync) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8', windowsHide: true, shell: false, timeout: 2000,
    maxBuffer: 256, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' }
  });
  assertProbeSucceeded(result);
  const started = String(result?.stdout || '').trim().replace(/\s+/gu, ' ');
  if (!/^[A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(started))
    throw identityFailure('PROCESS_IDENTITY_OUTPUT_INVALID');
  return digest(`darwin:${started}`);
}

// Claims require an identity, not merely a live PID. Preserve the fixed cause
// for that path, while observers below deliberately retain their null/unknown
// contract. No vendor text, stderr, start time, PID or path is diagnostic data.
function requireProcessInstanceIdentity(pid, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw identityFailure('PROCESS_IDENTITY_UNAVAILABLE');
  const alive = options.processAlive || processAlive;
  const platform = options.platform || process.platform;
  const key = `${platform}:${pid}`;
  let identity = null;
  try {
    if (!alive(pid)) throw identityFailure('PROCESS_IDENTITY_UNAVAILABLE');
    if (pid === (options.currentPid || process.pid) && cache.has(key)) return cache.get(key);
    if (platform === 'linux') identity = linuxBirth(pid, options.fs || fs);
    else if (platform === 'win32') identity = windowsBirth(pid, options.spawnSync || childProcess.spawnSync,
      options.verifyArtifact || verifyNativeLauncherArtifact);
    else if (platform === 'darwin') identity = macosBirth(pid, options.spawnSync || childProcess.spawnSync);
  } catch (error) {
    const code = ownCode(error);
    throw identityFailure(ERROR_CODES.includes(code) ? code :
      ['EACCES', 'EPERM'].includes(code) ? 'PROCESS_IDENTITY_ACCESS_DENIED' : 'PROCESS_IDENTITY_PROBE_FAILED');
  }
  if (!ID_RE.test(String(identity || ''))) throw identityFailure('PROCESS_IDENTITY_UNAVAILABLE');
  if (pid === (options.currentPid || process.pid)) cache.set(key, identity);
  return identity;
}

function processInstanceIdentity(pid, options = {}) {
  try { return requireProcessInstanceIdentity(pid, options); }
  catch { return null; }
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

module.exports = { ID_RE, ERROR_CODES, processInstanceIdentity, requireProcessInstanceIdentity,
  processInstanceState, _test: { linuxBirth, windowsBirth, macosBirth } };
