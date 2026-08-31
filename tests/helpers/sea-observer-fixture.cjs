'use strict';
// Synthetic processes only: no product imports, files, keyring or documents.
const { fork } = require('node:child_process');
const net = require('node:net');
if (process.argv[2] === 'parent') {
  const worker = fork(__filename, ['worker'], { windowsHide: true, detached: true,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  worker.on('message', frame => { if (process.connected) process.send(frame); });
  worker.on('exit', code => { if (process.connected) process.send({ type: 'worker-exit', code }); });
  worker.on('close', () => process.exit(0));
  process.on('message', frame => {
    // Controlled parent exit, not ChildProcess.kill(): Windows kill semantics
    // can also terminate descendants and invalidate the independent observation.
    if (frame.type === 'exit-parent') process.exit(23);
    if (worker.connected) worker.send(frame);
  });
  process.on('disconnect', () => { if (worker.connected) worker.send({ type: 'stop' }); });
} else if (process.argv[2] === 'worker') {
  let socket;
  const timer = setTimeout(() => process.exit(90), 8000);
  process.on('disconnect', () => setTimeout(() => process.exit(7), 150));
  process.on('message', frame => {
    if (frame.type === 'stop') { clearTimeout(timer); process.exit(frame.code ?? 0); }
    if (frame.type !== 'connect') return;
    socket = net.createConnection(frame.pipe);
    let text = '';
    socket.on('error', () => {});
    socket.on('connect', () => socket.write(`hello ${frame.badNonce ? '0'.repeat(64) : frame.nonce}\n`));
    socket.on('data', bytes => {
      text += bytes.toString('utf8');
      if (text === `challenge ${frame.nonce}\n`) {
        socket.write(`ready ${frame.nonce}\n`); text = '';
      }
    });
  });
  process.send({ type: 'worker-ready', pid: process.pid });
} else process.exit(2);
