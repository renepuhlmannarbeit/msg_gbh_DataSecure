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
input.on('line', (line) => {
  try {
    const frame = JSON.parse(line);
    write({ type: 'result', sequence: frame?.sequence ?? null, result: session.dispatch(frame) });
  } catch (error) {
    write({
      type: 'error',
      code: error instanceof SafeError ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR',
      message:
        error instanceof SafeError
          ? error.message
          : 'Companion-Anfrage wurde sicher abgebrochen.'
    });
  }
});
