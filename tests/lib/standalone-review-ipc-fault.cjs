'use strict';

// Fault injection only: the test still starts the real product sidecar and real
// detached review worker, processes real source bytes, journals and packages,
// and exchanges production length-prefixed IPC. No fabricated success response.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const root = process.env.DATASECURE_TEST_REVIEW_IPC_ROOT;
assert.ok(root && path.isAbsolute(root));
assert.match(path.basename(root), /^datasecure-review-ipc-/u);
assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
const reviewFile = path.resolve(__dirname, '../../plugins/data-secure/server/gateway/review-worker.js');

if (path.resolve(process.argv[1]) === reviewFile) {
  const batch = require('../../plugins/data-secure/server/gateway/batch');
  const original = batch.reviewDeferredBatch;
  const deadline = setTimeout(() => process.exit(72), 25000);
  process.on('exit', (code) => {
    clearTimeout(deadline);
    fs.writeFileSync(path.join(root, `review-exit-${process.pid}.json`), JSON.stringify({ pid: process.pid, code }));
  });
  batch.reviewDeferredBatch = async (...args) => {
    if (fs.existsSync(path.join(root, 'fail-next-review'))) {
      fs.unlinkSync(path.join(root, 'fail-next-review'));
      throw Object.assign(new Error('Injected reconstruction failure before the first draft'),
        { code: 'BATCH_REVIEW_RECONSTRUCTION_FAILED' });
    }
    return original(...args);
  };
} else {
  const fork = childProcess.fork;
  childProcess.fork = function reviewFork(file, args, options) {
    if (path.resolve(file) !== reviewFile) return fork.call(this, file, args, options);
    const child = fork.call(this, file, args, {
      ...options, execArgv: [...options.execArgv, `--require=${__filename}`],
      env: { ...options.env, DATASECURE_TEST_REVIEW_IPC_ROOT: root }
    });
    child.once('spawn', () => fs.writeFileSync(path.join(root, `review-spawn-${child.pid}.json`),
      JSON.stringify({ pid: child.pid })));
    return child;
  };
}
