'use strict';

const fs = require('fs');
const readline = require('readline');
const { SafeError } = require('../runtime');
const { createCompanionSession } = require('./ipc-session');

function readBootstrapSecret(fd = 3) {
  const secret = fs.readFileSync(fd);
  if (secret.length !== 32) throw new SafeError('Ungültiger privater Companion-Bootstrap.');
  return secret;
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
        code: error instanceof SafeError ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR',
        message: error instanceof SafeError ? error.message : 'Companion-Anfrage wurde sicher abgebrochen.'
      });
    }
  });
});
