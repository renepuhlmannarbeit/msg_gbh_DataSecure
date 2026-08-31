'use strict';

// Fixed synthetic engineering acceptance, never a document-processing or
// privacy-release test. The SEA bootstrap checks the parser-role binding;
// that check does not attest this probe or the background-module closure.
const { isSea } = require('node:sea');

const CHILD_DEADLINE_MS = 8_000;
const EXIT_DEADLINE_MS = 2_000;
const SYNTHETIC_MISSING_TOKEN = 'e'.repeat(64);
const FAILURE_CODES = new Set([
  'SEA_BACKGROUND_PROBE_FAILED',
  'SEA_BACKGROUND_PROBE_CHILD_DEADLINE',
  'SEA_BACKGROUND_PROBE_CHILD_CLEANUP_FAILED',
  'SEA_BACKGROUND_PROBE_EXIT_ZERO',
  'SEA_BACKGROUND_PROBE_EXIT_ONE',
  'SEA_BACKGROUND_PROBE_EXIT_TWO',
  'SEA_BACKGROUND_PROBE_FRAME_INVALID'
]);

function fail() {
  throw new Error('SEA_BACKGROUND_PROBE_FAILED');
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function within(promise, milliseconds, code) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(code)), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}

// Observe only the ChildProcess returned by the fixed production launcher.
// In particular, never enumerate PIDs or invoke a process-tree kill utility.
function observeChild(child, ipcWorker) {
  if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function') fail();
  let closed = false;
  let error = false;
  let exitResult;
  let disconnected = child.connected === false;
  const completion = new Promise((resolve) => {
    const completeIpcWorker = () => {
      // Node on Windows can omit `close` when disconnect() is called before
      // its asynchronous spawn event, even though `exit` reports code 2.
      // These workers have ignored stdio: actual OS exit plus drained IPC is
      // the complete lifecycle. Never accept disconnect alone as an exit.
      if (ipcWorker && exitResult && disconnected) {
        closed = true;
        resolve({ ...exitResult, error });
      }
    };
    child.once('error', () => { error = true; });
    child.once('exit', (code, signal) => {
      exitResult = { code, signal };
      completeIpcWorker();
    });
    child.once('disconnect', () => {
      disconnected = true;
      completeIpcWorker();
    });
    child.once('close', (code, signal) => {
      closed = true;
      resolve({ code, signal, error });
    });
  });
  // Pipe errors are checked through the child lifecycle, not printed with
  // document-derived text or allowed to become uncaught stream errors.
  for (const stream of child.stdio || []) {
    if (stream && typeof stream.on === 'function') stream.on('error', () => { error = true; });
  }
  return {
    completion,
    async stop() {
      if (closed) return;
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill(); } catch { /* bounded close check below */ }
      }
      await within(completion, EXIT_DEADLINE_MS, 'SEA_BACKGROUND_PROBE_CHILD_CLEANUP_FAILED');
    }
  };
}

async function withChild(child, operation, ipcWorker = false) {
  const observed = observeChild(child, ipcWorker);
  try {
    return await within(operation(observed.completion), CHILD_DEADLINE_MS,
      'SEA_BACKGROUND_PROBE_CHILD_DEADLINE');
  } finally {
    await observed.stop();
  }
}

async function workerProbe(launchBackgroundRole, role, message, expectedCode, expectedFrame) {
  const child = launchBackgroundRole(role, { env: process.env });
  return withChild(child, async (completion) => {
    let messageCount = 0;
    let invalidFrame = false;
    child.on('message', (frame) => {
      messageCount++;
      if (!expectedFrame || !exactKeys(frame, ['type', 'stage']) ||
          frame.type !== expectedFrame.type || frame.stage !== expectedFrame.stage) invalidFrame = true;
    });
    if (!child.connected || typeof child.send !== 'function') fail();
    if (message === null) child.disconnect();
    else await new Promise((resolve, reject) => {
      child.send(message, (error) => error ? reject(new Error('SEA_BACKGROUND_PROBE_FAILED')) : resolve());
    });
    const result = await completion;
    if (result.error || result.signal !== null) fail();
    if (result.code !== expectedCode) throw new Error(
      ['SEA_BACKGROUND_PROBE_EXIT_ZERO', 'SEA_BACKGROUND_PROBE_EXIT_ONE', 'SEA_BACKGROUND_PROBE_EXIT_TWO'][result.code] ||
      'SEA_BACKGROUND_PROBE_FAILED');
    if (invalidFrame || messageCount !== (expectedFrame ? 1 : 0)) throw new Error('SEA_BACKGROUND_PROBE_FRAME_INVALID');
  }, true);
}

function validDescriptor(value, ready) {
  const keys = ['ipc_version', 'session_id', 'transport', 'network_listener', 'authenticated_frames', 'model_authority'];
  if (ready) keys.push('type');
  return exactKeys(value, keys) && (!ready || value.type === 'ready') &&
    value.ipc_version === 'data-secure-companion-ipc/1' &&
    typeof value.session_id === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.session_id) &&
    value.transport === 'inherited_stdio' && value.network_listener === false &&
    value.authenticated_frames === true && value.model_authority === false;
}

async function companionProbe(launchCompanion) {
  // No spawn, executable, script, module or parser override is accepted. The
  // production supervisor constructs and authenticates the actual IPC frame.
  const companion = launchCompanion({ env: process.env, timeoutMs: CHILD_DEADLINE_MS });
  let exited = false;
  const completion = companion.exited.then((code) => { exited = true; return code; });
  try {
    await within((async () => {
      const descriptor = await companion.ready;
      if (!validDescriptor(descriptor, true)) fail();
      const capabilities = await companion.request('capabilities', {});
      if (!validDescriptor(capabilities, false) || capabilities.session_id !== descriptor.session_id) fail();
      companion.close();
      if (await completion !== 0) fail();
    })(), CHILD_DEADLINE_MS, 'SEA_BACKGROUND_PROBE_CHILD_DEADLINE');
  } finally {
    companion.close();
    if (!exited) {
      companion.terminate();
      await within(completion, EXIT_DEADLINE_MS, 'SEA_BACKGROUND_PROBE_CHILD_CLEANUP_FAILED');
    }
  }
}

async function badCompanionSecretProbe(launchBackgroundRole) {
  const child = launchBackgroundRole('companion', { env: process.env });
  await withChild(child, async (completion) => {
    let outputSeen = false;
    if (!child.stdout || !child.stdin || !child.stdio?.[3]) fail();
    child.stdout.on('data', (chunk) => { if (chunk.length) outputSeen = true; });
    child.stdio[3].end(Buffer.alloc(31));
    child.stdin.end();
    const result = await completion;
    if (result.signal !== null || result.code !== 2 || outputSeen) fail();
  });
}

async function runBackgroundProbe() {
  if (!isSea() || process.platform !== 'win32' || process.arch !== 'x64' ||
      process.argv.length !== 3 || process.argv[0] !== process.execPath ||
      process.argv[1] !== process.execPath ||
      process.argv[2] !== '--datasecure-background-integration-probe') {
    throw new Error('SEA_BACKGROUND_PROBE_CONTEXT_INVALID');
  }
  let stage = 0;
  try {
    const { launchBackgroundRole } = require('./background-role-launcher');
    const { launchCompanion } = require('./companion/supervisor');
    await workerProbe(launchBackgroundRole, 'batch',
      { type: 'start-local-batch', batch_token: 'invalid' }, 2);
    stage++;
    await workerProbe(launchBackgroundRole, 'batch', null, 2);
    stage++;
    await workerProbe(launchBackgroundRole, 'batch',
      { type: 'start-local-batch', batch_token: SYNTHETIC_MISSING_TOKEN }, 1,
      { type: 'local-batch-stopped', stage: 'after_checkpoint' });
    stage++;
    // An invalid picker envelope fails before source reads, a checkpoint or
    // private-artifact key creation. It exercises the second start-frame type.
    await workerProbe(launchBackgroundRole, 'batch',
      { type: 'start-local-intake', batch_token: SYNTHETIC_MISSING_TOKEN, queue: [{}] }, 1,
      { type: 'local-intake-stopped', stage: 'before_checkpoint' });
    stage++;
    await workerProbe(launchBackgroundRole, 'review',
      { type: 'start-local-review', batch_token: 'invalid' }, 2);
    stage++;
    await workerProbe(launchBackgroundRole, 'review', null, 2);
    stage++;
    // A missing synthetic journal fails before any human-review UI is opened.
    await workerProbe(launchBackgroundRole, 'review',
      { type: 'start-local-review', batch_token: SYNTHETIC_MISSING_TOKEN }, 1);
    stage++;
    await companionProbe(launchCompanion);
    stage++;
    await badCompanionSecretProbe(launchBackgroundRole);
  } catch (error) {
    const failure = new Error(FAILURE_CODES.has(error?.message) ? error.message : 'SEA_BACKGROUND_PROBE_FAILED');
    failure.stage = stage;
    throw failure;
  }
  // Deliberately fixed, token-free, path-free and free of child stdout. Passing
  // these bounded cases is not evidence of a successful document job.
  return {
    schema: 'datasecure-sea-background-probe/v1',
    target: 'windows-x64',
    parent_sea: true,
    roles: ['batch', 'review', 'companion'],
    batch_start_types: ['start-local-batch', 'start-local-intake'],
    checks: {
      batch_malformed_token_exit_2: true,
      batch_disconnect_exit_2: true,
      batch_missing_token_stopped_exit_1: true,
      intake_invalid_queue_before_checkpoint_exit_1: true,
      review_malformed_token_exit_2: true,
      review_disconnect_exit_2: true,
      review_missing_token_exit_1: true,
      companion_authenticated_capabilities: true,
      companion_bad_secret_exit_2: true
    },
    full_positive_job_verified: false,
    privacy_release_verified: false
  };
}

module.exports = { runBackgroundProbe };
