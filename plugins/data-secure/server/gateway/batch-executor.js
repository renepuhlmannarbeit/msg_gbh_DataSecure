'use strict';

const path = require('path');
const { fork } = require('child_process');
const { SafeError } = require('../runtime');
const {
  claimLocalBatchExecutor,
  releaseLocalBatchExecutor,
  readBatchProgress
} = require('./batch');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const WORKER_ENV_KEYS = Object.freeze([
  'SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA',
  'HOME', 'XDG_DATA_HOME', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_LANGUAGE',
  'EU_PRIVACY_VISUAL_MODE', 'EU_PRIVACY_RETENTION_DAYS'
]);

function batchWorkerEnvironment(source = process.env) {
  const clean = Object.create(null);
  for (const key of WORKER_ENV_KEYS) {
    if (typeof source[key] === 'string' && source[key].length > 0) clean[key] = source[key];
  }
  return clean;
}

function startLocalBatchExecutor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Batch-Sitzung ist ungültig.');
  const forkProcess = options.forkProcess || fork;
  let child;
  try {
    child = forkProcess(path.join(__dirname, 'batch-worker.js'), [], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--require=${path.join(__dirname, '..', 'network-deny.cjs')}`],
      env: batchWorkerEnvironment(options.env || process.env),
      serialization: 'json'
    });
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    const claimed = claimLocalBatchExecutor(token, child.pid);
    if (claimed.ok === false) {
      try { child.kill(); } catch { /* only the just-created helper is targeted */ }
      return claimed;
    }
    child.send({ type: 'start-local-batch', batch_token: token }, (error) => {
      if (error) releaseLocalBatchExecutor(token, child.pid);
      try { child.disconnect?.(); } catch { /* helper exits if IPC closes */ }
      child.unref?.();
    });
    return {
      ok: true,
      local_processing_started: true,
      ...readBatchProgress(token),
      raw_content_sent_to_claude: false
    };
  } catch {
    if (child && Number.isSafeInteger(child.pid)) {
      releaseLocalBatchExecutor(token, child.pid);
      try { child.kill(); } catch { /* only the just-created helper is targeted */ }
    }
    throw new SafeError('Der lokale Stapelprozessor konnte nicht sicher gestartet werden.');
  }
}

module.exports = { WORKER_ENV_KEYS, batchWorkerEnvironment, startLocalBatchExecutor };
