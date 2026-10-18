'use strict';
// Test-only fixture/process harness. Never accepts an existing data root,
// broad cleanup path, host-selected native artifact, or product ACL mutation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const HOLDER_ROLE = '--native-ownership-epoch-release-holder';
const STOP_TYPE = 'datasecure-native-epoch-release-stop/1';
const holderHelper = path.join(__dirname, 'native-ownership-guard-child.cjs');
const fixed = code => Object.assign(Error(code), { code });
const identity = stat => [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)];
const same = (stat, expected) => JSON.stringify(identity(stat)) === JSON.stringify(expected);
const childPath = (parent, leaf) => {
  const full = path.resolve(parent, leaf);
  if (path.dirname(full) !== parent || path.basename(full) !== leaf) throw fixed('NATIVE_EPOCH_GATE_FIXTURE_PATH');
  return full;
};
async function createPrivateFixture() {
  const temporary = fs.realpathSync(os.tmpdir());
  const base = fs.mkdtempSync(path.join(temporary, 'ds-epoch-release-'));
  let roots = 0;
  const initial = fs.lstatSync(base, { bigint: true }), baseIdentity = identity(initial);
  function verifyBase() {
    if (path.dirname(base) !== temporary || !path.basename(base).startsWith('ds-epoch-release-'))
      throw fixed('NATIVE_EPOCH_GATE_FIXTURE_PATH');
    const current = fs.lstatSync(base, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink() || !same(current, baseIdentity) ||
        fs.realpathSync(base) !== base) throw fixed('NATIVE_EPOCH_GATE_FIXTURE_CHANGED');
  }
  try {
    verifyBase();
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
      if (typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot)) throw fixed('NATIVE_EPOCH_GATE_SYSTEM_ROOT');
      const system = path.join(systemRoot, 'System32');
      const { runOwnershipLoadCommand } = await import('./ownership-load-lifecycle.mjs');
      async function command(executable, args) {
        verifyBase();
        const child = cp.spawn(executable, args, { windowsHide: true, shell: false,
          stdio: ['ignore', 'pipe', 'pipe'], env: { SystemRoot: systemRoot, WINDIR: systemRoot } });
        const result = await runOwnershipLoadCommand(child, { deadlineMs: 5000, reapMs: 1000 });
        verifyBase();
        if (!result.ok) throw fixed('NATIVE_EPOCH_GATE_ACL_SETUP_FAILED');
        return result.stdout.toString('utf8');
      }
      const account = await command(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
      const sid = account.match(/"(S-1-[0-9-]+)"/u)?.[1];
      if (!sid) throw fixed('NATIVE_EPOCH_GATE_ACCOUNT_SID');
      // Exact freshly owned base only. Children inherit only this user's DACL.
      await command(path.join(system, 'icacls.exe'), [base, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F']);
    } else {
      fs.chmodSync(base, 0o700); // Fresh own fixture, never an existing directory.
      verifyBase();
      if ((fs.lstatSync(base).mode & 0o077) !== 0) throw fixed('NATIVE_EPOCH_GATE_FIXTURE_MODE');
    }
    verifyBase();
  } catch (error) {
    // Retain on incomplete ACL setup/process termination rather than guessing.
    const refusal = fixed(error.code || 'NATIVE_EPOCH_GATE_FIXTURE_SETUP_FAILED');
    refusal.fixturePath = base;
    throw refusal;
  }
  return {
    path: base,
    root() {
      verifyBase();
      const root = childPath(base, 'root-' + (++roots));
      fs.mkdirSync(root, { mode: 0o700 });
      const current = fs.lstatSync(root);
      if (!current.isDirectory() || current.isSymbolicLink()) throw fixed('NATIVE_EPOCH_GATE_FIXTURE_CHANGED');
      return root;
    },
    cleanup() {
      verifyBase();
      const plan = [];
      function inspect(directory, depth = 0) {
        if (depth > 12) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_BOUND');
        const stat = fs.lstatSync(directory, { bigint: true });
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_UNSAFE');
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (plan.length >= 128) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_BOUND');
          const target = childPath(directory, entry.name), current = fs.lstatSync(target, { bigint: true });
          const relative = path.relative(base, target);
          if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ||
              (current.isSymbolicLink() || fs.realpathSync(target) !== target)) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_UNSAFE');
          const parts = relative.split(path.sep), number = /^root-([1-9][0-9]*)$/u.exec(parts[0]);
          if (!number || Number(number[1]) > roots) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_UNSAFE');
          // The export-admission probe also uses the real, now empty outbox.
          // No retained claim/record leaf is allowed by this cleanup contract.
          const expectedDirectory = parts.length === 1 || parts.length === 2 &&
            ['batches', 'result-export-state'].includes(parts[1]);
          const expectedFile = parts.length === 2 && parts[1] === 'ownership-control.lock' ||
            parts.length === 3 && parts[1] === 'batches' &&
              /^active-processing\.json(?:\.prepared-[a-f0-9]{32}\.tmp)?$/u.test(parts[2]);
          if (expectedDirectory ? !current.isDirectory() : !expectedFile || !current.isFile())
            throw fixed('NATIVE_EPOCH_GATE_CLEANUP_UNSAFE');
          if (current.isDirectory()) inspect(target, depth + 1);
          else if (!current.isFile() || current.nlink !== 1n) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_UNSAFE');
          if (plan.length >= 128) throw fixed('NATIVE_EPOCH_GATE_CLEANUP_BOUND');
          plan.push({ path: target, directory: current.isDirectory(), identity: identity(current) });
        }
      }
      inspect(base); // Inspect ALL targets before deleting anything.
      for (const entry of plan) {
        verifyBase();
        const current = fs.lstatSync(entry.path, { bigint: true });
        if (!same(current, entry.identity) || current.isSymbolicLink() || fs.realpathSync(entry.path) !== entry.path ||
            (entry.directory ? !current.isDirectory() : !current.isFile() || current.nlink !== 1n))
          throw fixed('NATIVE_EPOCH_GATE_CLEANUP_CHANGED');
        if (entry.directory) fs.rmdirSync(entry.path); else fs.unlinkSync(entry.path);
      }
      verifyBase(); fs.rmdirSync(base);
    }
  };
}
function participant(helper, options = {}) {
  if (path.resolve(helper) !== holderHelper) throw fixed('NATIVE_EPOCH_GATE_CHILD_ROLE');
  const child = (options.fork || cp.fork)(__filename, [HOLDER_ROLE], {
    execPath: process.execPath, execArgv: [], windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || '' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let sequence = 0, closed = false, exited = false, code = null, signal = null, processError = false, stopping;
  let disconnected = false, stderrClosed = !child.stderr, stopRequest = 'not_requested';
  const pending = new Map(), closers = new Set();
  const rpcMs = options.rpcMs ?? 5000, graceMs = options.graceMs ?? 1000, reapMs = options.reapMs ?? 2000;
  function rejectPending(reason) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(fixed(reason)); }
    pending.clear();
  }
  child.on('error', () => { processError = true; rejectPending('NATIVE_EPOCH_GATE_CHILD_ERROR'); });
  child.on('disconnect', () => { disconnected = true; });
  child.on('exit', (value, why) => { exited = true; code = value; signal = why; rejectPending('NATIVE_EPOCH_GATE_CHILD_EXIT'); });
  child.on('close', (value, why) => {
    closed = true; code = value; signal = why; rejectPending('NATIVE_EPOCH_GATE_CHILD_CLOSE');
    for (const done of [...closers]) done(true);
  });
  child.on('message', message => {
    const entry = pending.get(message?.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    if (message.ok === true) entry.resolve(message.value);
    else entry.reject(fixed(/^[A-Z][A-Z0-9_]{2,79}$/u.test(message.code || '') ? message.code : 'NATIVE_EPOCH_GATE_CHILD_PROTOCOL'));
  });
  child.stderr?.on('error', () => { processError = true; rejectPending('NATIVE_EPOCH_GATE_CHILD_STREAM'); });
  child.stderr?.on('close', () => { stderrClosed = true; });
  child.stderr?.on('data', () => {}); // Drain; do not publish vendor messages.
  function waitClose(milliseconds) {
    if (closed) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer;
      const done = value => { clearTimeout(timer); closers.delete(done); resolve(value); };
      closers.add(done); timer = setTimeout(() => done(false), milliseconds);
    });
  }
  return {
    pid: child.pid,
    request(command, fields = {}) {
      if (closed || exited || processError || stopping) return Promise.reject(fixed('NATIVE_EPOCH_GATE_CHILD_UNAVAILABLE'));
      return new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => {
          pending.delete(id); reject(fixed('NATIVE_EPOCH_GATE_CHILD_DEADLINE'));
        }, rpcMs);
        pending.set(id, { resolve, reject, timer });
        try { child.send({ id, command, ...fields }, error => {
          if (!error) return;
          const entry = pending.get(id);
          if (entry) { pending.delete(id); clearTimeout(timer); entry.reject(fixed('NATIVE_EPOCH_GATE_CHILD_SEND')); }
        }); } catch {
          pending.delete(id); clearTimeout(timer); reject(fixed('NATIVE_EPOCH_GATE_CHILD_SEND'));
        }
      });
    },
    stop() {
      if (stopping) return stopping;
      stopping = (async () => {
        rejectPending('NATIVE_EPOCH_GATE_CHILD_STOPPING');
        let killStatus = 'not_requested';
        if (!closed) {
          // Do not disconnect the parent's IPC endpoint: Node 22.23.2 can then
          // observe exit(0) without ChildProcess close (the IPC close count is
          // advanced by peer EOF, not this manual parent-side close). Ask our
          // fixed test role to exit; its peer EOF must still produce real close.
          if (!exited && child.connected) {
            stopRequest = 'pending';
            try { child.send({ type: STOP_TYPE }, error => {
              stopRequest = error ? 'error' : 'write_complete';
              if (error) processError = true;
            }); } catch { stopRequest = 'error'; processError = true; }
          } else stopRequest = exited ? 'already_exited' : 'unavailable';
          await waitClose(graceMs);
        }
        if (!closed) {
          if (exited || child.exitCode != null || child.signalCode != null) killStatus = 'already_exited';
          else {
            try { killStatus = child.kill('SIGKILL') ? 'sent' : 'refused'; }
            catch { killStatus = 'error'; }
          }
          await waitClose(reapMs);
        }
        if (!closed) {
          for (const stream of [child.stdin, child.stdout, child.stderr]) {
            try { stream?.destroy(); } catch {}
            try { stream?.unref?.(); } catch {}
          }
          try { child.channel?.unref?.(); } catch {}
          try { child.unref(); } catch {}
        }
        return { exited, closed,
          normal: closed && !processError && code === 0 && !signal && killStatus === 'not_requested',
          exit_code: code, signal, kill_status: killStatus, stop_request: stopRequest,
          ipc_disconnected: disconnected, stderr_closed: stderrClosed, process_error: processError };
      })();
      return stopping;
    }
  };
}
module.exports = { createPrivateFixture, participant };

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== HOLDER_ROLE) throw fixed('NATIVE_EPOCH_GATE_CHILD_ROLE');
  // Registered before the unchanged direct C-API participant. This closed
  // test-only control frame is never a guard request or a product IPC command.
  process.on('message', message => {
    if (message && typeof message === 'object' && !Array.isArray(message) &&
        Object.keys(message).length === 1 && message.type === STOP_TYPE) process.exit(0);
  });
  require(holderHelper);
}
