'use strict';

const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  MAX_CONSOLE_BYTES,
  VISUAL_JOB_MEMORY_MIB,
  VISUAL_JOB_CPU_MS,
  VISUAL_JOB_WALL_MS,
  VisualBridgeError,
  VisualBudgetError,
  bridgeEnvironment,
  runPs,
  visualBridgeStatus,
  validateOcrResult
} = require('../plugins/data-secure/server/windows-visual');

const { testAsync, test, done, assert } = createSuite('Bounded Windows visual bridge');

function fakeChild(action) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit('close', null));
    return true;
  };
  queueMicrotask(() => action(child));
  return child;
}

async function main() {
  const launcherBytes = Buffer.alloc(512);
  launcherBytes.writeUInt16LE(0x5a4d, 0);
  launcherBytes.writeUInt32LE(0x80, 0x3c);
  launcherBytes.write('PE\0\0', 0x80, 'ascii');
  launcherBytes.writeUInt16LE(0x8664, 0x84);
  const nativeOptions = {
    platform: 'win32', arch: 'x64', launcherPath: 'C:\\DataSecure\\datasecure-sandbox.exe',
    existsSync: () => true,
    launcherBytes,
    launcherExpectedSha256: crypto.createHash('sha256').update(launcherBytes).digest('hex')
  };

  test('bridge environment excludes unrelated cloud and API secrets', () => {
    assert.deepStrictEqual(bridgeEnvironment({
      SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp', API_KEY: 'secret', PATH: 'unsafe'
    }), { SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp' });
  });

  test('OCR result validation accepts only the bounded exact schema', () => {
    const valid = { text: 'Hallo', words: [{ text: 'Hallo', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] };
    assert.strictEqual(validateOcrResult(valid), valid);
    assert.throws(() => validateOcrResult({ ...valid, source: 'private.png' }), VisualBudgetError);
    assert.throws(() => validateOcrResult({ text: 'x', words: [{ text: 'x', bbox: { x0: -1, y0: 0, x1: 1, y1: 1 } }] }), VisualBudgetError);
  });

  await testAsync('PowerShell starts only through the native Job Object launcher', async () => {
    let invocation;
    const output = await runPs('safe.ps1', ['-InputPath', 'private'], {
      ...nativeOptions, systemRoot: 'C:\\Windows', env: { SystemRoot: 'C:\\Windows', API_KEY: 'secret' },
      spawn(command, args, options) {
        invocation = { command, args, options };
        return fakeChild((child) => { child.stdout.end('ok'); child.emit('close', 0); });
      }
    });
    assert.equal(output, 'ok');
    assert.match(invocation.command, /datasecure-sandbox\.exe$/i);
    assert.deepStrictEqual(invocation.args.slice(0, 8), [
      '--memory-mib', String(VISUAL_JOB_MEMORY_MIB),
      '--cpu-ms', String(VISUAL_JOB_CPU_MS),
      '--wall-ms', String(VISUAL_JOB_WALL_MS), '--', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    ]);
    assert.deepStrictEqual(invocation.args.slice(-2), ['-InputPath', 'private']);
    assert.ok(invocation.args.includes('-NoProfile'));
    assert.ok(invocation.args.includes('-NonInteractive'));
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.options.env.API_KEY, undefined);
  });

  await testAsync('missing or corrupt native visual boundary never falls back to PowerShell', async () => {
    let spawned = false;
    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions,
      existsSync: () => false,
      spawn() { spawned = true; throw new Error('must not run'); }
    }), VisualBridgeError);
    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions,
      launcherExpectedSha256: '0'.repeat(64),
      spawn() { spawned = true; throw new Error('must not run'); }
    }), VisualBridgeError);
    assert.strictEqual(spawned, false);
  });

  test('visual capability is ready only with a verified native host boundary', () => {
    assert.deepStrictEqual(visualBridgeStatus({
      ...nativeOptions, existsSync: () => true, hostProbeStatus: 0, systemRoot: 'C:\\Windows'
    }), { available: true, mode: 'windows_job_object', reason: 'ok' });
    assert.deepStrictEqual(visualBridgeStatus({
      ...nativeOptions, existsSync: () => true, hostProbeStatus: 126, systemRoot: 'C:\\Windows'
    }), { available: false, mode: 'unavailable', reason: 'unsupported_host_architecture' });
  });

  await testAsync('native resource and setup exits become fixed content-free visual errors', async () => {
    const run = (code) => runPs('safe.ps1', ['private-patient-name'], {
      ...nativeOptions,
      spawn: () => fakeChild((child) => child.emit('close', code))
    });
    await assert.rejects(run(125), (error) =>
      error instanceof VisualBudgetError && !/patient/.test(error.message));
    await assert.rejects(run(123), (error) =>
      error instanceof VisualBridgeError && !/patient/.test(error.message));
  });

  await testAsync('console flooding terminates the complete process tree', async () => {
    let killedPid;
    let child;
    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions, timeoutMs: 1000,
      killTreeRunner(_exe, args) {
        killedPid = args[1];
        queueMicrotask(() => child.emit('close', 1));
        return { status: 0 };
      },
      spawn: () => (child = fakeChild((process) => process.stderr.write(Buffer.alloc(MAX_CONSOLE_BYTES + 1, 65))))
    }), VisualBudgetError);
    assert.equal(killedPid, '4242');
  });

  await testAsync('timeout terminates the process tree with a fixed content-free error', async () => {
    let child;
    await assert.rejects(runPs('safe.ps1', ['private-source-name'], {
      ...nativeOptions, timeoutMs: 5,
      killTreeRunner() { queueMicrotask(() => child.emit('close', 1)); return { status: 0 }; },
      spawn: () => (child = fakeChild(() => {}))
    }), (error) => error instanceof VisualBudgetError && !/private-source-name/.test(error.message));
  });

  await testAsync('process errors cannot bypass confirmed termination', async () => {
    let child;
    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions, timeoutMs: 5, terminationGraceMs: 10,
      killTreeRunner() { return { status: 1 }; },
      spawn: () => {
        child = fakeChild(() => {});
        child.kill = () => {
          queueMicrotask(() => child.emit('error', new Error('kill raced')));
          return true;
        };
        return child;
      }
    }), (error) => error instanceof VisualBridgeError &&
      error.message === 'Die sichere Beendigung der Windows-Bildverarbeitung konnte nicht bestätigt werden.');

    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions,
      spawn: () => fakeChild((process) => process.emit('error', new Error('spawn failed')))
    }), (error) => error instanceof VisualBridgeError &&
      error.message === 'Windows-Bildverarbeitung konnte nicht gestartet werden.');
  });

  await testAsync('PowerShell stderr is never reflected into an error', async () => {
    await assert.rejects(runPs('safe.ps1', [], {
      ...nativeOptions,
      spawn: () => fakeChild((child) => {
        child.stderr.end('private patient content');
        child.emit('close', 1);
      })
    }), (error) => error instanceof VisualBridgeError && !/patient/.test(error.message));
  });

  done();
}

main();
