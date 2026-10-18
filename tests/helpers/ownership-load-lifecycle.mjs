// Shared only by the headless native ownership-load gates. These bounds are
// infrastructure limits, not evidence of native loader/signing compatibility.
const MAXIMUM_FRAME = 1024 * 1024;
const REQUEST_ID = '9'.repeat(16);
const SIGNALS = new Set(['SIGTRAP', 'SIGABRT', 'SIGKILL', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGTERM']);

function waitForProcess(child, { encodeFrame, safeCodes = new Set(), deadlineMs = 20000, reapMs = 2000,
  timers = { setTimeout, clearTimeout }, command = false } = {}) {
  return new Promise(resolve => {
    let settled = false, closed = false, exited = false, stopping = false;
    let ready = false, shutdown = false, buffer = Buffer.alloc(0), readyCode = null;
    let failure = null, deadlineExceeded = false, timerFailed = false;
    let killStatus = 'not_requested', deadlineTimer = null, reapTimer = null;
    let exitCode = null, exitSignal = null;
    const remember = code => { failure ||= code; };
    const detach = () => {
      // Do not escalate to a second kill primitive or mistake unref for reap.
      // Keep error listeners: destroy/late native errors must not be unhandled.
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        try { stream?.destroy(); } catch { remember('OWNERSHIP_LOAD_STREAM_CLOSE_FAILED'); }
        try { stream?.unref?.(); } catch { remember('OWNERSHIP_LOAD_UNREF_FAILED'); }
      }
      try { child.unref(); } catch { remember('OWNERSHIP_LOAD_UNREF_FAILED'); }
    };
    const clear = name => {
      const timer = name === 'deadline' ? deadlineTimer : reapTimer;
      if (name === 'deadline') deadlineTimer = null; else reapTimer = null;
      if (timer === null) return;
      try { timers.clearTimeout(timer); } catch {
        timerFailed = true; remember('OWNERSHIP_LOAD_TIMER_FAILED');
        // A broken clear operation must not retain the event loop. The callback
        // also observes settled, so a late callback cannot kill a reused PID.
        try { timer?.unref?.(); } catch { /* already a failed timer contract */ }
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clear('deadline'); clear('reap');
      if (!closed) { remember('OWNERSHIP_LOAD_PROCESS_NOT_REAPED'); detach(); }
      const complete = command || (ready && shutdown && buffer.length === 0);
      if (!complete || exitCode !== 0 || exitSignal) remember('OWNERSHIP_LOAD_CORE_NOT_COMPLETE');
      resolve(Object.freeze({ ok: closed && !failure && !deadlineExceeded && complete,
        closed, exited, ready, shutdown, error_code: failure, ready_error_code: readyCode,
        exit_code: Number.isSafeInteger(exitCode) ? exitCode : null,
        signal: SIGNALS.has(exitSignal) ? exitSignal : null, deadline_exceeded: deadlineExceeded,
        timer_failed: timerFailed, kill_status: killStatus, fixture_cleanup_allowed: closed,
        // Only setup commands return stdout. Gate diagnostics must select fixed
        // status fields, never serialize raw stdout/stderr or vendor errors.
        ...(command ? { stdout: buffer } : {}) }));
    };
    const schedule = (callback, delay) => {
      try { return timers.setTimeout(() => { if (!settled) callback(); }, delay); }
      catch { timerFailed = true; remember('OWNERSHIP_LOAD_TIMER_FAILED'); return null; }
    };
    const stop = code => {
      if (settled) return;
      remember(code);
      if (closed) { finish(); return; }
      if (stopping) return;
      stopping = true; clear('deadline');
      // Register the bounded reap wait BEFORE kill: native error/close may arrive
      // during kill. Failure to install a timer cannot leave a pending Promise.
      reapTimer = schedule(finish, reapMs);
      if (exited || child.exitCode != null || child.signalCode != null) killStatus = 'already_exited';
      else {
        killStatus = 'requested';
        try { killStatus = child.kill('SIGKILL') ? 'sent' : 'refused'; }
        catch { killStatus = 'error'; remember('OWNERSHIP_LOAD_KILL_FAILED'); }
      }
      if (reapTimer === null && !settled) finish();
    };
    const onData = bytes => {
      if (settled || stopping) return;
      try {
        if (!Buffer.isBuffer(bytes) || bytes.length > MAXIMUM_FRAME + 4 - buffer.length)
          throw Error('invalid frame');
        buffer = Buffer.concat([buffer, bytes]);
        if (command) return;
        while (buffer.length >= 4 && !stopping && !settled) {
          const count = buffer.readUInt32BE(0);
          if (count <= 1 || count > MAXIMUM_FRAME) throw Error('invalid frame');
          if (buffer.length < count + 4) break;
          const frame = JSON.parse(buffer.subarray(4, count + 4)); buffer = buffer.subarray(count + 4);
          if (!ready) {
            if (frame?.schema !== 'datasecure-standalone-ready/1') throw Error('invalid ready');
            if (frame.ok !== true) {
              readyCode = safeCodes.has(frame.error_code) ? frame.error_code : 'STANDALONE_OPERATION_FAILED';
              throw Error('refused');
            }
            ready = true;
            // Keep stdin open: EOF can retire the Core before its queued ACK.
            child.stdin.write(encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
              action: 'shutdown', request_id: REQUEST_ID }), error => {
              if (error) stop('OWNERSHIP_LOAD_STDIN_FAILED');
            });
          } else {
            if (shutdown || frame?.request_id !== REQUEST_ID || frame.ok !== true) throw Error('invalid ACK');
            shutdown = true;
          }
        }
      } catch { stop('OWNERSHIP_LOAD_PROTOCOL_FAILED'); }
    };
    child.on('error', () => stop('OWNERSHIP_LOAD_PROCESS_ERROR'));
    child.on('exit', (code, signal) => { if (!settled) { exited = true; exitCode = code; exitSignal = signal; } });
    child.on('close', (code, signal) => {
      if (settled) return;
      closed = true; exitCode = code; exitSignal = signal; finish();
    });
    for (const stream of [child.stdin, child.stdout, child.stderr])
      stream?.on('error', () => stop('OWNERSHIP_LOAD_STREAM_FAILED'));
    child.stdout.on('data', onData);
    child.stderr.on('data', () => {}); // Drain, but never disclose dyld/vendor text.
    deadlineTimer = schedule(() => { deadlineExceeded = true; stop('OWNERSHIP_LOAD_DEADLINE_EXCEEDED'); }, deadlineMs);
    if (deadlineTimer === null) stop('OWNERSHIP_LOAD_TIMER_FAILED');
  });
}

export function probeOwnershipLoad(child, options) { return waitForProcess(child, options); }

// Windows ACL setup must not introduce an unbounded synchronous subprocess
// before the Core's own deadline. Its output is consumed only for the SID.
export function runOwnershipLoadCommand(child, options) {
  return waitForProcess(child, { ...options, command: true, deadlineMs: options?.deadlineMs ?? 5000 });
}
