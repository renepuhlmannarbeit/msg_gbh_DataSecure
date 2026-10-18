'use strict';
// Headless test participant only. Trust configuration arrives explicitly from
// this test's parent, never from a product environment or checksum sibling.
const { parentPort, workerData } = require('node:worker_threads');
const { createOwnershipGuard } = require('../../plugins/data-secure/server/core/native-ownership-guard');
const port = parentPort || process;
const send = value => parentPort ? parentPort.postMessage(value) : process.send(value);
let factory, held;
async function receive(message) {
  const { id, command } = message;
  try {
    let value;
    if (command === 'initialize') {
      if (factory) throw Error('already initialized');
      factory = createOwnershipGuard({ verifiedArtifact: message.artifact, root: message.root });
      value = { node: process.version };
    } else if (command === 'acquire') {
      if (held) throw Error('already held');
      held = factory.tryAcquire(); value = { acquired: held !== null };
    } else if (command === 'assert') value = held.assertHeld();
    else if (command === 'release') { value = held.release(); held = null; }
    else if (command === 'close') { value = factory.close(); factory = null; }
    else if (command === 'drop-factory') {
      factory = null;
      for (let i = 0; i < 5; ++i) { global.gc(); await new Promise(resolve => setImmediate(resolve)); }
      value = held.assertHeld();
    } else if (command === 'drop-guard') {
      held = null;
      for (let i = 0; i < 5; ++i) { global.gc(); await new Promise(resolve => setImmediate(resolve)); }
      value = true;
    }
    else throw Error('unknown test command');
    send({ id, ok: true, value });
  } catch (error) { send({ id, ok: false, code: error.code || 'TEST_COMMAND_FAILED' }); }
}
port.on('message', receive);
if (workerData) receive({ id: 0, command: 'initialize', ...workerData });
if (!parentPort) process.on('disconnect', () => process.exit(0));
