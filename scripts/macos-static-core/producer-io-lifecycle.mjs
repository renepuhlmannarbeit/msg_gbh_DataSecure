// Producer IO/lifecycle helper. Source/model evidence is not native Mac evidence.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';

const records = new WeakMap();
const object = value => value !== null && ['object', 'function'].includes(typeof value);
const fixed = code => Object.assign(Error(code), { code });
const codeOf = error => {
  try { const d = object(error) && Object.getOwnPropertyDescriptor(error, 'code');
    return d && Object.hasOwn(d, 'value') && typeof d.value === 'string' ? d.value : null;
  } catch { return null; }
};
export function producerProcessFailure(error) {
  return object(error) ? records.get(error) || null : null;
}

// Fixed producer-tool observations are deliberately NOT Configure/Make
// provenance records. No CLI/env can select the explicit model seams below.
const toolFailures = new WeakMap();
export function producerToolFailure(error) { return object(error) ? toolFailures.get(error) || null : null; }
export async function runProducerTool(step, environment, options, model = {}) {
  const { signal, label, timeoutMs = 20000, maximum = 8 * 1024 * 1024, input } = options || {};
  const absolute = value => typeof value === 'string' && value.startsWith('/') && !/[\0\r\n]/u.test(value);
  if (!['read', 'source_extract', 'converter_extract', 'seal', 'seal_details'].includes(label) ||
      !step || !absolute(step.executable) || !absolute(step.cwd) || !Array.isArray(step.args) || step.args.length > 64 ||
      step.args.some(value => typeof value !== 'string' || value.includes('\0') || value.length > 32768) ||
      !signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
      !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 512 * 1024 * 1024 ||
      input !== undefined && (!Buffer.isBuffer(input) || input.length > maximum)) throw fixed('PRODUCER_TOOL_ARGUMENT_INVALID');
  if (signal.aborted) throw fixed('BUILD_ABORTED');
  const start = model.spawn || spawn, later = model.setTimeout || setTimeout, cancel = model.clearTimeout || clearTimeout;
  const reapMs = model.reapMs ?? 5000;
  if (!Number.isSafeInteger(reapMs) || reapMs < 1 || reapMs > 5000) throw fixed('PRODUCER_TOOL_ARGUMENT_INVALID');
  const state = { schema: 'datasecure-mac-producer-tool/1', label, cause: 'success', spawned: false,
    exit_seen: false, exit_code: null, exit_signal: null, close_seen: false, close_code: null, close_signal: null,
    stdout_bytes: 0, stderr_bytes: 0, stdin_finished: input === undefined,
    kill_attempted: false, kill_result: 'not_requested', kill_error: null,
    child_end_confirmed: false, group_end_confirmed: false, timer_cleanup_failed: false,
    listener_cleanup_failed: false, detach_failed: false };
  const stdout = [], stderr = []; let failed = false, primary;
  const fail = (cause, code = 'PRODUCER_TOOL_FAILED') => {
    if (!failed) { failed = true; state.cause = cause; primary = fixed(code); }
  };
  await new Promise(resolve => {
    let child, deadline, reaper, finished = false, stopRequested = false, abortInstalled = false;
    const listeners = [];
    const listen = (emitter, event, callback) => { emitter.on(event, callback); listeners.push([emitter, event, callback]); };
    const cleanup = () => {
      for (const timer of [deadline, reaper]) if (timer !== undefined) {
        try { cancel(timer); } catch {
          state.timer_cleanup_failed = true;
          try { timer?.unref?.(); } catch { state.detach_failed = true; }
        }
      }
      if (abortInstalled) try { signal.removeEventListener('abort', abort); } catch { state.listener_cleanup_failed = true; }
      for (const [emitter, event, callback] of listeners) {
        try { emitter.removeListener(event, callback); } catch { state.listener_cleanup_failed = true; }
      }
    };
    const detach = () => {
      const protect = emitter => {
        if (!emitter) return;
        const drain = () => {};
        try { emitter.on('error', drain); emitter.once('close', () => { try { emitter.removeListener('error', drain); } catch {} }); }
        catch { state.listener_cleanup_failed = true; }
      };
      protect(child);
      for (const stream of [child?.stdin, child?.stdout, child?.stderr]) {
        protect(stream);
        try { stream?.destroy?.(); } catch { state.detach_failed = true; }
        try { stream?.unref?.(); } catch { state.detach_failed = true; }
      }
      try { child?.unref(); } catch { state.detach_failed = true; }
    };
    const finish = confirmed => {
      if (finished) return;
      finished = true; state.child_end_confirmed = confirmed;
      if (!confirmed) fail('close_unconfirmed', 'PRODUCER_TOOL_END_UNCONFIRMED');
      cleanup();
      if (!confirmed) detach();
      if (state.timer_cleanup_failed || state.listener_cleanup_failed || state.detach_failed) fail('cleanup_failed');
      resolve();
    };
    const armReaper = () => {
      if (finished || reaper !== undefined) return;
      try { reaper = later(() => finish(false), reapMs); }
      catch { fail('timer_failed'); finish(false); }
    };
    const stop = (cause, code) => {
      if (finished || stopRequested) return;
      stopRequested = true; fail(cause, code);
      // Exactly one signal through our live ChildProcess, never a numeric PID
      // or a process group and never after observed exit/close. Not a reap ACK.
      if (child && !state.exit_seen && !state.close_seen && Number.isSafeInteger(child.pid) && child.pid > 0 &&
          child.exitCode === null && child.signalCode === null) {
        state.kill_attempted = true;
        try { state.kill_result = child.kill('SIGKILL') === true ? 'sent' : 'failed';
          if (state.kill_result === 'failed') state.kill_error = 'unconfirmed'; }
        catch (error) { const code = codeOf(error); state.kill_result = code === 'ESRCH' ? 'missing' : 'failed';
          state.kill_error = code === 'ESRCH' ? 'missing' : ['EACCES', 'EPERM'].includes(code) ? 'denied' : 'other'; }
      } else state.kill_result = 'not_live';
      armReaper();
    };
    const abort = () => stop('aborted', 'BUILD_ABORTED');
    const pipeError = () => stop('stream_error', 'PRODUCER_TOOL_STREAM_FAILED');
    const data = (chunks, field) => bytes => {
      if (finished || failed) return;
      if (!Buffer.isBuffer(bytes)) { stop('protocol_invalid'); return; }
      if (bytes.length > maximum - state.stdout_bytes - state.stderr_bytes) {
        stop('output_limit', 'PRODUCER_TOOL_OUTPUT_LIMIT'); return;
      }
      state[field] += bytes.length; chunks.push(bytes);
    };
    const validCode = value => value === null || Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
    const validSignal = value => value === null || typeof value === 'string' && /^SIG[A-Z0-9]{1,16}$/u.test(value);
    const exit = (code, exitSignal) => {
      if (finished) return;
      state.exit_seen = true;
      if (!validCode(code) || !validSignal(exitSignal) || (code === null) === (exitSignal === null)) fail('protocol_invalid');
      else { state.exit_code = code; state.exit_signal = exitSignal; }
      if (code !== 0 || exitSignal !== null) fail('exit_failed');
      armReaper(); // Direct exit alone is not closed stdio or descendant proof.
    };
    const close = (code, closeSignal) => {
      if (finished) return;
      state.close_seen = true;
      if (!validCode(code) || !validSignal(closeSignal)) fail('protocol_invalid');
      else { state.close_code = code; state.close_signal = closeSignal; }
      if (!state.exit_seen || code !== state.exit_code || closeSignal !== state.exit_signal) fail('protocol_invalid');
      if (code !== 0 || closeSignal !== null) fail('exit_failed');
      if (!state.spawned || !state.stdin_finished) fail('input_or_spawn_unconfirmed');
      finish(true);
    };
    try {
      child = start(step.executable, step.args, { cwd: step.cwd, env: environment, shell: false,
        windowsHide: true, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
      if (!child || typeof child.on !== 'function' || typeof child.kill !== 'function' || typeof child.unref !== 'function' ||
          !child.stdout || !child.stderr || input !== undefined && !child.stdin) { fail('spawn_failed'); finish(false); return; }
      state.spawned = Number.isSafeInteger(child.pid) && child.pid > 0;
      listen(child, 'error', () => stop(state.spawned ? 'process_error' : 'spawn_failed'));
      listen(child, 'exit', exit); listen(child, 'close', close);
      for (const [stream, chunks, field] of [[child.stdout, stdout, 'stdout_bytes'], [child.stderr, stderr, 'stderr_bytes']]) {
        listen(stream, 'error', pipeError); listen(stream, 'data', data(chunks, field));
      }
      if (input !== undefined) {
        listen(child.stdin, 'error', pipeError);
        listen(child.stdin, 'finish', () => { state.stdin_finished = true; });
      }
      abortInstalled = true; signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      deadline = later(() => stop('deadline', 'PRODUCER_TOOL_DEADLINE'), timeoutMs);
      if (input !== undefined) child.stdin.end(input);
    } catch { fail(child ? 'setup_failed' : 'spawn_failed'); if (child) stop(state.cause); else finish(false); }
  });
  const observation = Object.freeze({ ...state });
  if (failed) { toolFailures.set(primary, observation); throw primary; }
  return Object.freeze({ stdout: Buffer.concat(stdout, state.stdout_bytes), stderr: Buffer.concat(stderr, state.stderr_bytes), observation });
}

// Opaque producer observations, not serializable authority or artifact approval.
const fileProofs = new WeakMap();
const ioFailures = new WeakMap();
const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const MAXIMUM = 512 * 1024 * 1024;
export function producerIoFailure(error) { return object(error) ? ioFailures.get(error) || null : null; }
export function producerInputPath(file) {
  const selected = file instanceof URL ? fileURLToPath(file) : file;
  if (typeof selected !== 'string') throw fixed('REGULAR_BOUNDED_INPUT_REQUIRED');
  return path.resolve(selected);
}
function maximumBytes(maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > MAXIMUM)
    throw fixed('REGULAR_BOUNDED_INPUT_REQUIRED');
  return maximum;
}
function regular(stat, maximum) {
  const size = Number(stat.size);
  if (!stat.isFile() || stat.isSymbolicLink() || !Number.isSafeInteger(size) ||
      size < 0 || size > maximum || Number(stat.nlink) !== 1) throw fixed('BOUND_FILE_UNSAFE');
  return size;
}
function withDescriptor(operation, io, open, action) {
  let fd, value, primary, failed = false, closing = null, closeFailed = false;
  try { fd = open(); value = action(fd); }
  catch (error) { failed = true; primary = error; }
  finally {
    if (fd !== undefined) {
      const held = fd; fd = undefined;
      try { io.closeSync(held); } catch (error) {
        closing = error; closeFailed = true;
        if (!failed) { failed = true; primary = error; }
      }
    }
  }
  if (failed) {
    if (object(primary)) ioFailures.set(primary, Object.freeze({
      schema: 'datasecure-mac-producer-io-failure/1', operation,
      close_failed: closeFailed,
      close_code: !closeFailed ? null : ['EIO', 'EBADF', 'EACCES', 'EPERM', 'ENOSPC'].includes(codeOf(closing))
        ? codeOf(closing) : 'other'
    }));
    throw primary;
  }
  return value;
}
function proof(record) {
  const held = object(record) && fileProofs.get(record);
  if (!held) throw fixed('PRODUCER_FILE_PROOF_INVALID');
  return held;
}
function fileOperation(file, maximum, expected, operation, replacement, model = {}) {
  maximumBytes(maximum);
  const absolute = producerInputPath(file), io = expected?.io || model.io || fs;
  if (model.io && model.io !== io) throw fixed('PRODUCER_FILE_PROOF_INVALID');
  const directory = expected?.directory || bound.bindDirectory(path.dirname(absolute), { io, platform: model.platform || process.platform });
  if (directory.path !== path.dirname(absolute) || directory.io !== io ||
      expected && expected.path !== absolute) throw fixed('PRODUCER_FILE_PROOF_INVALID');
  bound.assertDirectory(directory);
  const named = io.lstatSync(absolute, { bigint: true }), size = regular(named, maximum);
  const identity = bound.fileIdentity(named, true);
  if (expected && !bound.sameFile(named, expected.identity)) throw fixed('BOUND_FILE_CHANGED');
  const bytesToWrite = replacement === null ? null : Buffer.isBuffer(replacement) ? replacement : Buffer.from(replacement);
  if (bytesToWrite && bytesToWrite.length > maximum) throw fixed('REGULAR_BOUNDED_INPUT_REQUIRED');
  const value = withDescriptor(operation, io, () => io.openSync(absolute,
    (bytesToWrite === null ? io.constants.O_RDONLY : io.constants.O_RDWR) |
      io.constants.O_NOFOLLOW | io.constants.O_NONBLOCK), fd => {
    const opened = io.fstatSync(fd, { bigint: true });
    if (!bound.sameFile(opened, identity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(directory);
    const original = bound.readHeldBytes(fd, size, io, maximum);
    if (expected && digestBytes(original) !== expected.sha256) throw fixed('BOUND_FILE_CHANGED');
    if (!bound.sameFile(io.fstatSync(fd, { bigint: true }), identity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(directory);
    if (bytesToWrite !== null) {
      // No O_TRUNC at open: regularity, nlink=1, held identity, exact preimage
      // and parents are checked BEFORE the first destructive operation.
      io.ftruncateSync(fd, 0);
      io.writeFileSync(fd, bytesToWrite);
      io.fsyncSync(fd);
    } else if (operation === 'sync-file') io.fsyncSync(fd);
    const after = io.fstatSync(fd, { bigint: true }), afterSize = regular(after, maximum);
    if (!bound.sameObject(after, bound.objectIdentity(opened)) ||
        bytesToWrite === null && !bound.sameFile(after, identity) ||
        bytesToWrite !== null && afterSize !== bytesToWrite.length) throw fixed('BOUND_FILE_CHANGED');
    const bytes = bytesToWrite === null ? original : bound.readHeldBytes(fd, afterSize, io, maximum);
    if (bytesToWrite !== null && !bytes.equals(bytesToWrite)) throw fixed('BOUND_FILE_CHANGED');
    const finalIdentity = bound.fileIdentity(after, true);
    if (!bound.sameFile(io.fstatSync(fd, { bigint: true }), finalIdentity) ||
        !bound.sameFile(io.lstatSync(absolute, { bigint: true }), finalIdentity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(directory);
    return { bytes, path: absolute, maximum, identity: finalIdentity, directory, io, sha256: digestBytes(bytes) };
  });
  const record = Object.freeze({ bytes: value.bytes });
  fileProofs.set(record, value); return record;
}
export function readProducerFileRecord(file, maximum = 128 * 1024 * 1024, model = {}) {
  return fileOperation(file, maximum, null, 'read-file', null, model);
}
export function readProducerFileBounded(file, maximum = 128 * 1024 * 1024, model = {}) {
  return readProducerFileRecord(file, maximum, model).bytes;
}
export function producerFileObservation(record) {
  const held = proof(record);
  return Object.freeze({ path: held.path, sha256: held.sha256, dev: held.identity.dev, ino: held.identity.ino, bytes: Number(held.identity.size) });
}
export function revalidateProducerFileRecord(record, model = {}) {
  const held = proof(record);
  return fileOperation(held.path, held.maximum, held, 'revalidate-file', null, model);
}
export function rewriteProducerFileRecord(record, bytes, model = {}) {
  const held = proof(record);
  if (!Buffer.isBuffer(bytes) && typeof bytes !== 'string') throw fixed('PRODUCER_WRITE_INVALID');
  return fileOperation(held.path, held.maximum, held, 'rewrite-file', bytes, model);
}
export function syncProducerFileRecord(record, model = {}) {
  const held = proof(record);
  return fileOperation(held.path, held.maximum, held, 'sync-file', null, model);
}
export function writeProducerFresh(file, bytes, mode = 0o600, model = {}) {
  if (![0o600, 0o700].includes(mode)) throw fixed('PRODUCER_WRITE_INVALID');
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  maximumBytes(data.length);
  const absolute = producerInputPath(file), io = model.io || fs;
  const directory = bound.bindDirectory(path.dirname(absolute), { io, platform: model.platform || process.platform });
  bound.assertDirectory(directory);
  return withDescriptor('create-file', io, () => io.openSync(absolute,
    io.constants.O_RDWR | io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_NOFOLLOW | io.constants.O_NONBLOCK, mode), fd => {
    const opened = io.fstatSync(fd, { bigint: true });
    if (regular(opened, MAXIMUM) !== 0) throw fixed('BOUND_FILE_CHANGED');
    const identity = bound.objectIdentity(opened);
    if (!bound.sameFile(io.lstatSync(absolute, { bigint: true }), bound.fileIdentity(opened, true))) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(directory);
    io.writeFileSync(fd, data); io.fsyncSync(fd);
    const after = io.fstatSync(fd, { bigint: true });
    if (regular(after, MAXIMUM) !== data.length || !bound.sameObject(after, identity)) throw fixed('BOUND_FILE_CHANGED');
    if (!bound.readHeldBytes(fd, data.length, io, MAXIMUM).equals(data)) throw fixed('BOUND_FILE_CHANGED');
    const finalIdentity = bound.fileIdentity(after, true);
    if (!bound.sameFile(io.fstatSync(fd, { bigint: true }), finalIdentity) ||
        !bound.sameFile(io.lstatSync(absolute, { bigint: true }), finalIdentity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(directory); return true;
  });
}
export function syncProducerDirectory(directory, model = {}) {
  const absolute = producerInputPath(directory), io = model.io || fs;
  const binding = bound.bindDirectory(absolute, { io, platform: model.platform || process.platform });
  bound.assertDirectory(binding);
  const named = io.lstatSync(absolute, { bigint: true }), identity = bound.objectIdentity(named);
  return withDescriptor('sync-directory', io, () => io.openSync(absolute,
    io.constants.O_RDONLY | io.constants.O_DIRECTORY | io.constants.O_NOFOLLOW | io.constants.O_NONBLOCK), fd => {
    const opened = io.fstatSync(fd, { bigint: true });
    if (!opened.isDirectory() || opened.isSymbolicLink() || !bound.sameObject(opened, identity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(binding); io.fsyncSync(fd);
    if (!bound.sameObject(io.fstatSync(fd, { bigint: true }), identity)) throw fixed('BOUND_FILE_CHANGED');
    bound.assertDirectory(binding); return true;
  });
}

// Only the producer calls this API. The last argument is a model-test seam,
// never selected from CLI/environment or forwarded to the built Core.
export const BUILD_STEP_TIMEOUTS = Object.freeze({ configure: 10 * 60 * 1000, make: 5 * 60 * 60 * 1000 });
export async function runProducerBuildStep(step, environment, job, label, signal, model = {}) {
  if (!['configure', 'make'].includes(label) || !signal || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')
    throw fixed('BUILD_STEP_ARGUMENT_INVALID');
  if (signal.aborted) throw fixed('BUILD_ABORTED');
  const io = model.io || fs, start = model.spawn || spawn;
  const killGroup = model.killGroup || ((pid, requested) => process.kill(-pid, requested));
  const later = model.setTimeout || setTimeout, cancel = model.clearTimeout || clearTimeout;
  // Native evidence showed healthy serial V8 compilation still active after
  // two hours on the standard 7-GB ARM runner. This is a BUILD-only budget;
  // product RPC/worker/ownership deadlines are deliberately unaffected.
  const timeoutMs = model.timeoutMs ?? BUILD_STEP_TIMEOUTS[label];
  const reapMs = model.reapMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BUILD_STEP_TIMEOUTS[label] ||
      !Number.isSafeInteger(reapMs) || reapMs < 1 || reapMs > 5000)
    throw fixed('BUILD_STEP_ARGUMENT_INVALID');
  const log = io.openSync(path.join(job, label + '.log'), 'wx', 0o600);
  const state = {
    schema: 'datasecure-mac-producer-process/1', step: label, cause: 'success', spawned: false,
    exit_seen: false, exit_code: null, exit_signal: null,
    close_seen: false, close_code: null, close_signal: null,
    kill_attempted: false, kill_result: 'not_requested', kill_error: null,
    child_end_confirmed: false, group_end_confirmed: false,
    timer_cleanup_failed: false, listener_cleanup_failed: false, detach_failed: false,
    log_fsync_failed: false, log_close_failed: false
  };
  let primary, failed = false;
  const fail = (reason, error) => {
    if (failed) return;
    failed = true; state.cause = reason;
    primary = object(error) ? error : fixed(reason === 'aborted' ? 'BUILD_ABORTED' : 'BUILD_STEP_FAILED');
  };
  try {
    await new Promise((resolve, reject) => {
      let child, deadline, reaper, finished = false, stopRequested = false, abortInstalled = false;
      const cleanup = () => {
        for (const timer of [deadline, reaper]) if (timer !== undefined) {
          try { cancel(timer); } catch {
            state.timer_cleanup_failed = true;
            // A broken cancellation cannot keep a long watchdog referenced.
            try { timer?.unref?.(); } catch { state.detach_failed = true; }
          }
        }
        if (abortInstalled) {
          try { signal.removeEventListener('abort', abort); }
          catch { state.listener_cleanup_failed = true; }
        }
        if (child) for (const [event, listener] of [['error', error], ['exit', exit], ['close', close]]) {
          try { child.removeListener(event, listener); }
          catch { state.listener_cleanup_failed = true; }
        }
      };
      const detachUnconfirmed = () => {
        // Never invent a successful close, retry a PID, or upgrade the kill
        // primitive. The job/logs remain preserved by the producer's caller.
        const guardLateErrors = emitter => {
          const drain = () => {};
          const lateClose = () => { try { emitter.removeListener('error', drain); } catch { /* already unconfirmed */ } };
          try { emitter.on('error', drain); emitter.once('close', lateClose); }
          catch { state.listener_cleanup_failed = true; }
        };
        if (child) guardLateErrors(child);
        for (const stream of [child?.stdin, child?.stdout, child?.stderr]) {
          if (stream && typeof stream.on === 'function') guardLateErrors(stream);
          try { stream?.destroy?.(); } catch { state.detach_failed = true; }
          try { stream?.unref?.(); } catch { state.detach_failed = true; }
        }
        if (child) {
          // An eventual error must not become an unhandled EventEmitter error
          // after the bounded wait. Remove this safety listener on late close.
          try { child.unref(); } catch { state.detach_failed = true; }
        }
      };
      const finish = confirmed => {
        if (finished) return;
        finished = true;
        state.child_end_confirmed = confirmed;
        if (!confirmed) fail('close_unconfirmed');
        cleanup();
        if (!confirmed) detachUnconfirmed();
        if (state.timer_cleanup_failed || state.listener_cleanup_failed || state.detach_failed)
          fail('cleanup_failed');
        if (failed) reject(primary); else resolve();
      };
      const armReaper = () => {
        if (finished || reaper !== undefined) return;
        try { reaper = later(() => finish(false), reapMs); }
        catch (error) { fail('timer_failed', error); finish(false); }
      };
      const stop = reason => {
        if (finished || stopRequested) return;
        stopRequested = true; fail(reason);
        // A direct exit/close makes later numeric process-group signalling
        // unsafe. Only this still-live, owned ChildProcess may be targeted once.
        if (child && !state.exit_seen && !state.close_seen && Number.isSafeInteger(child.pid) && child.pid > 0 &&
            child.exitCode === null && child.signalCode === null) {
          state.kill_attempted = true;
          try {
            if (killGroup(child.pid, 'SIGKILL') === true) state.kill_result = 'sent';
            else { state.kill_result = 'failed'; state.kill_error = 'unconfirmed'; }
          } catch (error) {
            const code = codeOf(error);
            state.kill_result = code === 'ESRCH' ? 'missing' : 'failed';
            state.kill_error = code === 'ESRCH' ? 'missing' : ['EPERM', 'EACCES'].includes(code) ? 'denied' : 'other';
          }
        } else state.kill_result = 'not_live';
        armReaper();
      };
      const abort = () => stop('aborted');
      const error = problem => {
        if (finished) return;
        fail(state.spawned ? 'process_error' : 'spawn_failed', problem);
        stop(state.cause);
      };
      const validCode = value => value === null || Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
      const validSignal = value => value === null || typeof value === 'string' && /^SIG[A-Z0-9]{1,16}$/u.test(value);
      const exit = (code, exitSignal) => {
        if (finished) return;
        state.exit_seen = true;
        if (!validCode(code) || !validSignal(exitSignal) || (code === null) === (exitSignal === null)) {
          fail('protocol_invalid'); armReaper(); return;
        }
        state.exit_code = code; state.exit_signal = exitSignal;
        if (code !== 0 || exitSignal !== null) fail('exit_failed');
        // exit is not close. Even normal exit gets only a bounded close wait.
        armReaper();
      };
      const close = (code, closeSignal) => {
        if (finished) return;
        state.close_seen = true;
        if (!validCode(code) || !validSignal(closeSignal)) fail('protocol_invalid');
        else { state.close_code = code; state.close_signal = closeSignal; }
        if (!state.exit_seen) {
          if (!failed) fail('protocol_invalid');
        } else if (code !== state.exit_code || closeSignal !== state.exit_signal) fail('protocol_invalid');
        if (code !== 0 || closeSignal !== null) fail('exit_failed');
        finish(true);
      };
      try {
        child = start(step.executable, step.args, { cwd: step.cwd, env: environment,
          shell: false, windowsHide: true, detached: true, stdio: ['ignore', log, log] });
        if (!child || typeof child.on !== 'function' || typeof child.removeListener !== 'function' ||
            typeof child.once !== 'function' || typeof child.unref !== 'function') {
          fail('spawn_failed'); finish(false); return;
        }
        state.spawned = Number.isSafeInteger(child.pid) && child.pid > 0;
        child.on('error', error); child.once('exit', exit); child.once('close', close);
        abortInstalled = true;
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        deadline = later(() => stop('deadline'), timeoutMs);
      } catch (problem) {
        fail(child ? 'timer_failed' : 'spawn_failed', problem);
        if (child) stop(state.cause); else finish(true);
      }
    });
    try { io.fsyncSync(log); }
    catch (error) { state.log_fsync_failed = true; fail('log_fsync_failed', error); }
  } catch (error) { if (!failed) fail('process_error', error); }
  finally {
    try { io.closeSync(log); }
    catch (error) { state.log_close_failed = true; fail('log_close_failed', error); }
  }
  const record = Object.freeze({ ...state });
  if (failed) { records.set(primary, record); throw primary; }
  return record;
}
