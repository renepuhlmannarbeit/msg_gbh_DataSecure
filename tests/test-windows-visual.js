'use strict';

const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createSuite } = require('./helpers');
const {
  MAX_CONSOLE_BYTES,
  VisualBridgeError,
  VisualBudgetError,
  bridgeEnvironment,
  runPs,
  validateOcrResult
} = require('../plugins/data-secure/server/windows-visual');

const { testAsync, test, done, assert } = createSuite('Bounded Windows visual bridge');

function fakeChild(action) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  queueMicrotask(() => action(child));
  return child;
}

async function main() {
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

  await testAsync('PowerShell uses an absolute executable, argument array and no shell', async () => {
    let invocation;
    const output = await runPs('safe.ps1', ['-InputPath', 'private'], {
      platform: 'win32', systemRoot: 'C:\\Windows', env: { SystemRoot: 'C:\\Windows', API_KEY: 'secret' },
      spawn(command, args, options) {
        invocation = { command, args, options };
        return fakeChild((child) => { child.stdout.end('ok'); child.emit('close', 0); });
      }
    });
    assert.equal(output, 'ok');
    assert.match(invocation.command, /WindowsPowerShell.*powershell\.exe$/i);
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.options.env.API_KEY, undefined);
    assert.deepStrictEqual(invocation.args.slice(-2), ['-InputPath', 'private']);
  });

  await testAsync('console flooding terminates the complete process tree', async () => {
    let killedPid;
    await assert.rejects(runPs('safe.ps1', [], {
      platform: 'win32', timeoutMs: 1000,
      killTreeRunner(_exe, args) { killedPid = args[1]; return { status: 0 }; },
      spawn: () => fakeChild((child) => child.stderr.write(Buffer.alloc(MAX_CONSOLE_BYTES + 1, 65)))
    }), VisualBudgetError);
    assert.equal(killedPid, '4242');
  });

  await testAsync('timeout terminates the process tree with a fixed content-free error', async () => {
    await assert.rejects(runPs('safe.ps1', ['private-source-name'], {
      platform: 'win32', timeoutMs: 5,
      killTreeRunner() { return { status: 0 }; },
      spawn: () => fakeChild(() => {})
    }), (error) => error instanceof VisualBudgetError && !/private-source-name/.test(error.message));
  });

  await testAsync('PowerShell stderr is never reflected into an error', async () => {
    await assert.rejects(runPs('safe.ps1', [], {
      platform: 'win32',
      spawn: () => fakeChild((child) => {
        child.stderr.end('private patient content');
        child.emit('close', 1);
      })
    }), (error) => error instanceof VisualBridgeError && !/patient/.test(error.message));
  });

  done();
}

main();
