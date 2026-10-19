'use strict';

// Observe actual detached worker completion so cleanup cannot race a process.
// No parser, journal, request, response, environment identity or result mock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const root = process.env.DATASECURE_TEST_DOCUMENT_START_ROOT;
assert.ok(root && path.isAbsolute(root));
assert.match(path.basename(path.dirname(root)), /^datasecure-standalone-ipc-/u);
assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
const worker = path.join(path.dirname(root), 'packaged-server/gateway/batch-worker.js');
if (path.resolve(process.argv[1]) === worker) {
  const identity = require('../../plugins/data-secure/server/gateway/process-identity')
    .requireProcessInstanceIdentity(process.pid);
  fs.writeFileSync(path.join(root, 'worker-identity.json'), JSON.stringify({ pid: process.pid, identity }), { flag: 'wx' });
  process.on('exit', code => fs.writeFileSync(path.join(root, 'worker-exit.json'), JSON.stringify({ pid: process.pid, identity, code }), { flag: 'wx' }));
  const batch = require(path.join(path.dirname(worker), 'batch'));
  const run = batch.runLocalBatchExecutor;
  batch.runLocalBatchExecutor = async (...args) => {
    const result = await run(...args);
    fs.writeFileSync(path.join(root, 'worker-complete.json'), JSON.stringify(result));
    return result;
  };
} else {
  const fork = childProcess.fork;
  childProcess.fork = function observedFork(file, args, options) {
    if (path.resolve(file) !== worker) return fork.call(this, file, args, options);
    const child = fork.call(this, file, args, { ...options,
      execArgv: [...options.execArgv, `--require=${__filename}`],
      env: { ...options.env, DATASECURE_TEST_DOCUMENT_START_ROOT: root } });
    child.once('spawn', () => fs.writeFileSync(path.join(root, 'worker-spawned.json'), JSON.stringify({ pid: child.pid })));
    return child;
  };
}
