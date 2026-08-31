'use strict';

const fs = require('fs');
const readline = require('readline');
const { SafeError } = require('../runtime');
const { createCompanionSession } = require('./ipc-session');

function readBootstrapSecret(fd = 3) {
  // Read one extra byte to reject an oversized bootstrap without buffering an
  // unbounded pipe. The supervisor owns the finite startup deadline.
  const bootstrap = Buffer.alloc(33);
  try {
    let length = 0;
    while (length < bootstrap.length) {
      const count = fs.readSync(fd, bootstrap, length, bootstrap.length - length, null);
      if (!Number.isInteger(count) || count < 0 || count > bootstrap.length - length) {
        throw new SafeError('Ungültiger privater Companion-Bootstrap.');
      }
      if (count === 0) break;
      length += count;
    }
    if (length !== 32) throw new SafeError('Ungültiger privater Companion-Bootstrap.');
    return Buffer.from(bootstrap.subarray(0, 32));
  } finally { bootstrap.fill(0); }
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const session = createCompanionSession({ secret: readBootstrapSecret() });
write({ type: 'ready', ...session.descriptor() });

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let sequence = Promise.resolve();
input.on('line', (line) => {
  sequence = sequence.then(async () => {
    let frameSequence = null;
    try {
      if (Buffer.byteLength(line, 'utf8') > 16 * 1024) throw new SafeError('Companion-IPC-Frame ist zu groß.');
      const frame = JSON.parse(line);
      frameSequence = frame?.sequence ?? null;
      const result = await session.dispatch(frame);
      write({ type: 'result', sequence: frame?.sequence ?? null, result });
    } catch (error) {
      write({
        type: 'error', sequence: frameSequence,
        code: error instanceof SafeError ? (error.code || 'REQUEST_REJECTED') : 'INTERNAL_ERROR',
        message: error instanceof SafeError ? error.message : 'Companion-Anfrage wurde sicher abgebrochen.'
      });
    }
  });
});
