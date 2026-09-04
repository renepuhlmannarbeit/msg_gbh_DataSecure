'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { schedulePendingResultExportReplay } = require('../plugins/data-secure/server/gateway/result-export-replay');

const { testAsync, done, assert } = createSuite('Result export startup replay');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-export-replay-'));

function worker(name, source) {
  const file = path.join(root, name);
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

async function main() {
  await testAsync('slow replay never stalls the MCP event loop', async () => {
    const slow = worker('slow.js', `
      const { parentPort } = require('worker_threads');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      parentPort.postMessage({ exported: 2, pending: 1, failures: 0 });
    `);
    let turns = 0;
    const interval = setInterval(() => { turns++; }, 5);
    const started = Date.now();
    const scheduled = schedulePendingResultExportReplay({ workerFile: slow, timeoutMs: 2000 });
    assert.ok(Date.now() - started < 50, 'scheduling must not run replay work inline');
    const summary = await scheduled.settled;
    clearInterval(interval);
    assert.deepStrictEqual(summary, { exported: 2, pending: 1, failures: 0 });
    assert.ok(turns >= 10, `the main event loop must keep turning during replay (turns=${turns})`);
  });

  await testAsync('worker crash and timeout resolve fail-closed without rejection', async () => {
    // The production MCP stdin keeps its process alive. Mirror that host handle
    // while proving the replay worker itself is deliberately unreferenced.
    const hostHandle = setInterval(() => {}, 1000);
    const crashing = worker('crash.js', `throw new Error('private synthetic path must not escape');`);
    const crashed = await schedulePendingResultExportReplay({ workerFile: crashing, timeoutMs: 1000 }).settled;
    assert.deepStrictEqual(crashed, { exported: 0, pending: 0, failures: 1 });

    const hanging = worker('hang.js', `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);`);
    const timedOut = await schedulePendingResultExportReplay({ workerFile: hanging, timeoutMs: 30 }).settled;
    assert.deepStrictEqual(timedOut, { exported: 0, pending: 0, failures: 1 });
    clearInterval(hostHandle);
  });

  fs.rmSync(root, { recursive: true, force: true });
  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
