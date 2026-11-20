'use strict';

const childProcess = require('child_process');
const crypto = require('node:crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const { performance } = require('node:perf_hooks');
const { convertDocument } = require('../plugins/data-secure/server/runtime');
const { verifyNativeLauncherArtifact, NativeLauncherVerificationError } = require('../plugins/data-secure/server/native-launcher');

const { test, testAsync, done, assert, failure: suiteFailure } = createSuite('Native Windows parser boundary');
const launcherChildren = [], launcherFailures = firstFailure();
let launcherEndUnconfirmed = false;
const launcher = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'native', 'windows-x64', 'datasecure-sandbox.exe');

function runNode(script, options = {}) {
  return childProcess.spawnSync(launcher, [
    '--memory-mib', String(options.memoryMiB || 128),
    '--cpu-ms', String(options.cpuMs || 5000),
    '--wall-ms', String(options.wallMs || 5000), '--', process.execPath, '-e', script
  ], {
    input: '', encoding: 'utf8', windowsHide: true, shell: false,
    timeout: options.timeout || 10_000, maxBuffer: 64 * 1024
  });
}


// Actual verifier and real owned file descriptors; only failure boundaries are
// modeled. A configured close error is thrown AFTER a real successful close.
// This is not a native CloseHandle/close failure, leak or supervisor UAT claim.
function launcherCloseModel(config = {}) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-launcher-close-model-'));
  const executable = path.join(directory, 'datasecure-sandbox.exe'), checksum = executable.replace(/\.exe$/u, '.sha256');
  const bytes = config.bytes || Buffer.alloc(512);
  if (!config.bytes) {
    bytes.writeUInt16LE(0x5a4d, 0); bytes.writeUInt32LE(0x80, 0x3c);
    bytes.write('PE\0\0', 0x80, 'ascii'); bytes.writeUInt16LE(0x8664, 0x84);
  }
  const expected = config.wrongChecksum ? '0'.repeat(64) : crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(executable, bytes); fs.writeFileSync(checksum, expected + '\n');
  const names = ['openSync', 'fstatSync', 'lstatSync', 'readFileSync', 'closeSync', 'existsSync'];
  const original = Object.fromEntries(names.map(name => [name, fs[name]]));
  const held = new Map(), opened = [], closes = [], realClosed = [], unexpectedCloses = [];
  const closeValues = config.closeValues || new Map();
  const roleFor = file => file === executable ? 'launcher' : file === checksum ? 'checksum' : null;
  const fault = stage => { if (config.bodyAt === stage) throw config.bodyValue; };
  let failed = false, failure, value, unclosedBeforeHarness, harnessCloses = 0, originalsUnchanged;
  fs.existsSync = file => config.missing === roleFor(file) ? false : original.existsSync(file);
  fs.openSync = function(file, ...args) {
    const role = roleFor(file);
    if (!role) return original.openSync(file, ...args);
    fault('open-' + role);
    const real = original.openSync(file, ...args), fd = config.fdZero ? (role === 'launcher' ? 0 : 1) : real;
    assert.equal(held.has(fd), false);
    held.set(fd, { real, role }); opened.push(role); return fd;
  };
  fs.fstatSync = function(fd, ...args) {
    const item = held.get(fd);
    if (!item) return original.fstatSync(fd, ...args);
    fault('stat-' + item.role); return original.fstatSync(item.real, ...args);
  };
  fs.lstatSync = function(file, ...args) {
    const role = roleFor(file);
    if (role) fault('named-' + role);
    const stat = original.lstatSync(file, ...args);
    return config.namedMismatch === role
      ? Object.assign(Object.create(stat), { ino: stat.ino === 0 ? 1 : 0 }) : stat;
  };
  fs.readFileSync = function(fd, ...args) {
    const item = held.get(fd);
    if (!item) return original.readFileSync(fd, ...args);
    fault('read-' + item.role); return original.readFileSync(item.real, ...args);
  };
  fs.closeSync = function(fd) {
    const item = held.get(fd);
    if (!item) { unexpectedCloses.push(fd); throw new Error('unexpected verifier close'); }
    // Remove the slot before the one real close attempt. Harness recovery below
    // only owns descriptors the verifier never attempted to close.
    held.delete(fd); closes.push(item.role); original.closeSync(item.real); realClosed.push(item.role);
    if (closeValues.has(item.role)) throw closeValues.get(item.role);
  };
  try {
    value = verifyNativeLauncherArtifact(executable, config.bufferShortcut
      ? { launcherBytes: bytes, launcherExpectedSha256: expected } : {});
  } catch (error) { failed = true; failure = error; }
  finally {
    unclosedBeforeHarness = [...held.values()].map(item => item.role);
    for (const name of names) fs[name] = original[name];
    try {
      // This is test-fixture recovery of untouched descriptors, excluded from
      // the verifier's recorded attempts. It prevents a failing Before test
      // from leaking the second real descriptor into later test groups.
      for (const item of held.values()) { original.closeSync(item.real); harnessCloses++; }
      originalsUnchanged = original.readFileSync(executable).equals(bytes) &&
        original.readFileSync(checksum, 'utf8') === expected + '\n';
    } finally {
      fs.unlinkSync(checksum); fs.unlinkSync(executable); fs.rmdirSync(directory);
    }
  }
  return { failed, failure, value, executable, opened, closes, realClosed, unexpectedCloses,
    unclosedBeforeHarness, harnessCloses, originalsUnchanged };
}

function assertLauncherClosed(result, roles) {
  assert.deepStrictEqual(result.closes, roles, 'every acquired descriptor must get exactly one verifier close attempt');
  assert.deepStrictEqual(result.realClosed, roles, 'modeled exception is after a real successful close');
  assert.deepStrictEqual(result.unclosedBeforeHarness, [], 'a harness close must not masquerade as verifier cleanup');
  assert.strictEqual(result.harnessCloses, 0);
  assert.deepStrictEqual(result.unexpectedCloses, []);
  assert.strictEqual(result.originalsUnchanged, true);
}
function assertLauncherUnreadable(result) {
  assert.strictEqual(result.failed, true);
  assert.ok(result.failure instanceof NativeLauncherVerificationError);
  assert.strictEqual(result.failure.reason, 'unreadable');
  assert.strictEqual(result.failure.message, 'Native launcher verification failed.');
}

async function main() {
test('LAUNCHER-CLOSE-MODEL: actual verifier closes both real descriptors on success, including logical FD zero', () => {
  for (const fdZero of [false, true]) {
    const result = launcherCloseModel({ fdZero });
    assert.strictEqual(result.failed, false); assert.strictEqual(result.value, result.executable);
    assertLauncherClosed(result, ['launcher', 'checksum']);
  }
});

test('LAUNCHER-CLOSE-MODEL: body failure cannot skip a second close or expose private close text', () => {
  for (const bodyAt of ['open-launcher', 'open-checksum', 'stat-launcher', 'named-launcher',
    'stat-checksum', 'named-checksum', 'read-checksum', 'read-launcher']) {
    const result = launcherCloseModel({ bodyAt, bodyValue: new Error('private read path'),
      closeValues: new Map([['launcher', new Error('private first-close path')], ['checksum', new Error('private second-close path')]]) });
    assertLauncherUnreadable(result);
    const roles = bodyAt === 'open-launcher' ? [] : bodyAt === 'open-checksum' ? ['launcher'] : ['launcher', 'checksum'];
    assert.deepStrictEqual(result.opened, roles);
    assertLauncherClosed(result, roles);
  }
});

test('LAUNCHER-CLOSE-MODEL: typed body primary survives both close failures by identity', () => {
  for (const roles of [['launcher'], ['checksum'], ['launcher', 'checksum']]) {
    const primary = new NativeLauncherVerificationError('unreadable');
    const result = launcherCloseModel({ bodyAt: 'read-launcher', bodyValue: primary,
      closeValues: new Map(roles.map(role => [role, new Error('private cleanup ' + role)])) });
    assert.strictEqual(result.failed, true); assert.strictEqual(result.failure, primary);
    assertLauncherClosed(result, ['launcher', 'checksum']);
  }
  const mismatch = launcherCloseModel({ namedMismatch: 'launcher',
    closeValues: new Map([['launcher', new Error('private cleanup')]]) });
  assertLauncherUnreadable(mismatch); assertLauncherClosed(mismatch, ['launcher', 'checksum']);
});

test('LAUNCHER-CLOSE-MODEL: close-only and falsey IO failures remain typed refusals after each owned close', () => {
  for (const thrown of [new Error('private close detail'), undefined, null, false, 0, '']) {
    for (const roles of [['launcher'], ['checksum'], ['launcher', 'checksum']]) {
      const result = launcherCloseModel({ closeValues: new Map(roles.map(role => [role, thrown])) });
      assertLauncherUnreadable(result); assertLauncherClosed(result, ['launcher', 'checksum']);
    }
    const result = launcherCloseModel({ bodyAt: 'read-launcher', bodyValue: thrown,
      closeValues: new Map([['launcher', false], ['checksum', null]]) });
    assertLauncherUnreadable(result); assertLauncherClosed(result, ['launcher', 'checksum']);
  }
});

test('LAUNCHER-CLOSE-MODEL: existing missing/checksum/PE refusals and supplied-buffer seam keep their contracts', () => {
  for (const [missing, reason] of [['launcher', 'missing'], ['checksum', 'checksum_missing']]) {
    const result = launcherCloseModel({ missing });
    assert.strictEqual(result.failed, true); assert.strictEqual(result.failure.reason, reason);
    assert.deepStrictEqual(result.opened, []); assertLauncherClosed(result, []);
  }
  const wrongChecksum = launcherCloseModel({ wrongChecksum: true });
  assert.strictEqual(wrongChecksum.failure.reason, 'integrity_failed'); assertLauncherClosed(wrongChecksum, ['launcher', 'checksum']);
  const notPe = launcherCloseModel({ bytes: Buffer.from('matching checksum but not PE') });
  assert.strictEqual(notPe.failure.reason, 'not_pe'); assertLauncherClosed(notPe, ['launcher', 'checksum']);
  const alternate = Buffer.alloc(512); alternate.writeUInt16LE(0x5a4d, 0); alternate.writeUInt32LE(0x80, 0x3c);
  alternate.write('PE\0\0', 0x80, 'ascii'); alternate.writeUInt16LE(0xaa64, 0x84);
  const wrongArch = launcherCloseModel({ bytes: alternate });
  assert.strictEqual(wrongArch.failure.reason, 'not_amd64_pe'); assertLauncherClosed(wrongArch, ['launcher', 'checksum']);
  const shortcut = launcherCloseModel({ bufferShortcut: true });
  assert.strictEqual(shortcut.failed, false); assert.strictEqual(shortcut.value, shortcut.executable);
  assert.deepStrictEqual(shortcut.opened, []); assertLauncherClosed(shortcut, []);
});

await testAsync('real parser receives source bytes through inherited stdin and returns no path', async () => {
  if (process.platform !== 'win32') return;
  assert.strictEqual(fs.existsSync(launcher), true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-native-parser-'));
  const source = path.join(root, 'private-marker.txt');
  fs.writeFileSync(source, 'Berufliche Rolle: Product Owner', 'utf8');
  try {
    const parsed = await convertDocument(source);
    assert.strictEqual(parsed.markdown, 'Berufliche Rolle: Product Owner');
    assert.doesNotMatch(JSON.stringify(parsed), /private-marker|data-secure-native-parser/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ACTIVE_PROCESS=1 blocks child creation below Node permissions', () => {
  if (process.platform !== 'win32') return;
  const result = runNode([
    "try {",
    "  require('child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);",
    "  process.stdout.write('CHILD_STARTED'); process.exit(9);",
    "} catch { process.stdout.write('CHILD_BLOCKED'); }"
  ].join(''));
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, 'CHILD_BLOCKED');
});

test('ACTIVE_PROCESS=1 also blocks child creation from the PowerShell visual host', () => {
  if (process.platform !== 'win32') return;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = [
    "$ErrorActionPreference='Stop'",
    "try { Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/c','exit 0' -WindowStyle Hidden",
    "  [Console]::Out.Write('CHILD_STARTED'); exit 9",
    "} catch { [Console]::Out.Write('CHILD_BLOCKED') }"
  ].join(';');
  const result = childProcess.spawnSync(launcher, [
    '--memory-mib', '128', '--cpu-ms', '5000', '--wall-ms', '5000', '--', powershell,
    '-NoProfile', '-NonInteractive', '-Command', command
  ], { encoding: 'utf8', windowsHide: true, shell: false, timeout: 10_000, maxBuffer: 64 * 1024 });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, 'CHILD_BLOCKED');
});

test('job memory limit terminates an allocating worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode("const a=[];setInterval(()=>a.push(Buffer.alloc(8*1024*1024,1)),5)", {
    memoryMiB: 64, timeout: 10_000
  });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

test('job CPU limit terminates a busy worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode('for(;;){}', { cpuMs: 100, timeout: 10_000 });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

test('job wallclock limit terminates an idle worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode('setInterval(()=>{},1000)', { wallMs: 200, timeout: 5000 });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

await testAsync('closing the launcher job handle removes the worker', async () => {
  if (process.platform !== 'win32') return;
  const failure = firstFailure(), deadlineAt = performance.now() + 30000;
  let owned, pidTimer, stopRequested = false, workerEnded = false;
  const fail = error => { failure.record(error); launcherFailures.record(error); };
  try {
    const child = childProcess.spawn(launcher, [
      '--memory-mib', '128', '--cpu-ms', '30000', '--wall-ms', '30000', '--', process.execPath, '-e',
      "process.stdout.write(String(process.pid)+'\\n');setInterval(()=>{},1000)"
    ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: false });
    owned = ownChild(child, fail); launcherChildren.push(owned);
    const pid = new Promise((resolve, reject) => {
      let text = '';
      pidTimer = setTimeout(() => reject(new Error('worker pid unavailable')), 5000);
      // A failed spawn can have null stdout. Preserve its observed OS error.
      if (child.stdout) {
        child.stdout.on('error', error => { fail(error); reject(error); });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          try {
            text += chunk;
            if (text.includes('\n')) { clearTimeout(pidTimer); resolve(Number(text.trim())); }
          } catch (error) { fail(error); reject(error); }
        });
      }
    });
    const workerPid = await Promise.race([pid, owned.error.then(error => { throw error; }),
      owned.done.then(() => { owned.failure.throwIfFailed(); throw new Error('worker pid unavailable before launcher close'); })]);
    assert.ok(Number.isSafeInteger(workerPid) && workerPid > 0);
    assert.ok(child.exitCode === null && child.signalCode === null, 'the owned launcher has not already exited');
    stopRequested = true;
    assert.equal(owned.terminate(), true, 'the owned launcher accepts its stop request');
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      try { process.kill(workerPid, 0); }
      catch (error) {
        if (error?.code !== 'ESRCH') throw error;
        workerEnded = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(workerEnded, 'worker remained alive or its end was unconfirmed after launcher stop');
  } catch (error) { fail(error); }
  finally {
    try { clearTimeout(pidTimer); } catch (error) { fail(error); }
    if (owned && !owned.closed) {
      if (!stopRequested && owned.child.exitCode === null && owned.child.signalCode === null) {
        stopRequested = true;
        try { if (!owned.terminate()) fail(new Error('launcher stop unconfirmed')); } catch (error) { fail(error); }
      }
      try { await within(owned.done, Math.max(0, Math.min(5000, deadlineAt - performance.now())),
        'LAUNCHER_CLOSE_UNCONFIRMED'); } catch (error) { fail(error); }
    }
    if (owned) { try { owned.failure.throwIfFailed(); } catch (error) { fail(error); } }
    if (owned && (!owned.closed || !workerEnded)) launcherEndUnconfirmed = true;
  }
  failure.throwIfFailed();
});
await done();
const result = suiteFailure();
endTestCliFailure({ failed: result.failed || launcherFailures.failed,
  error: result.failed ? result.error : launcherFailures.value,
  unconfirmedChildren: launcherEndUnconfirmed || launcherChildren.length === 0 || launcherChildren.some(owned => !owned.closed) });
}

main().catch(error => {
  const result = suiteFailure();
  endTestCliFailure({ failed: true, error: result.failed ? result.error : error,
    unconfirmedChildren: launcherEndUnconfirmed || launcherChildren.length === 0 || launcherChildren.some(owned => !owned.closed) });
});
