'use strict';

// Explicit OS-process timing fixture, never imported by product code. Both the
// desktop sidecar and batch worker remain the actual product entry points. The
// timing seams hold the real worker after its real durable intake/lease until
// parent IPC disconnects, or delay delivery of a real status result. No parser,
// journal, response payload or IPC mock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const root = process.env.DATASECURE_TEST_SIDECAR_LIFECYCLE_ROOT;
assert.ok(root && path.isAbsolute(root));
assert.match(path.basename(path.dirname(root)), /^datasecure-standalone-ipc-/u);
assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
const batchFile = path.resolve(__dirname, '../../plugins/data-secure/server/gateway/batch-worker.js');

if (path.resolve(process.argv[1]) === batchFile) {
  // This is the real detached product worker, with only a bounded timing hold.
  const batch = require('../../plugins/data-secure/server/gateway/batch');
  const run = batch.runLocalBatchExecutor;
  const exitRecord = path.join(root, 'worker-exit.json');
  process.on('exit', (code) => fs.writeFileSync(exitRecord, JSON.stringify({ pid: process.pid, code })));
  const deadline = setTimeout(() => process.exit(72), 20_000);
  batch.runLocalBatchExecutor = async (...args) => {
    const [token] = args;
    fs.writeFileSync(path.join(root, 'worker-ready.json'), JSON.stringify({
      pid: process.pid, token, progress: batch.readBatchProgress(token)
    }));
    if (process.connected) await new Promise((resolve) => process.once('disconnect', resolve));
    fs.writeFileSync(path.join(root, 'worker-disconnected.json'), JSON.stringify({ pid: process.pid }));
    const result = await run(...args);
    const terminalState = batch._test.readStateForMaintenance(token);
    fs.writeFileSync(path.join(root, 'worker-complete.json'), JSON.stringify({
      pid: process.pid, complete: result.complete, released: result.released,
      progress: batch.readBatchProgress(token),
      items: terminalState.items.map((item) => ({
        status: item.status,
        checkpoint: item.checkpoint || null,
        error_code: item.error_code || null,
        has_package_id: typeof item.package_id === 'string',
        has_document_result: Boolean(item.document_result),
        local_mapping_exported: item.local_mapping_exported ?? null,
        mapping_outbox_persisted: item.mapping_outbox_persisted ?? null,
        work_copy_cleanup_pending: item.work_copy_cleanup_pending ?? null
      }))
    }));
    clearTimeout(deadline);
    return result;
  };
} else {
  const { StandaloneApplicationService } = require('../../plugins/data-secure/server/standalone/application-service');
  const status = StandaloneApplicationService.prototype.status;
  StandaloneApplicationService.prototype.status = function deferredStatus(...args) {
    const result = status.apply(this, args);
    if (!fs.existsSync(path.join(root, 'defer-status'))) return result;
    // Preserve the real status result and delay only delivery, to prove that
    // EOF cancels the request queue even across an outstanding async dispatch.
    fs.writeFileSync(path.join(root, 'status-waiting.json'), JSON.stringify({ waiting: true }));
    return new Promise((resolve) => setTimeout(() => resolve(result), 10000));
  };
  const fork = childProcess.fork;
  childProcess.fork = function lifecycleFork(file, args, options) {
    if (path.resolve(file) !== batchFile) return fork.call(this, file, args, options);
    const isolated = {};
    for (const key of ['USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TMPDIR', 'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME', 'DATASECURE_STANDALONE_DOCUMENTS_DIR']) isolated[key] = process.env[key];
    const worker = fork.call(this, file, args, {
      ...options,
      execArgv: [...options.execArgv, `--require=${__filename}`],
      env: { ...options.env, ...isolated, DATASECURE_TEST_SIDECAR_LIFECYCLE_ROOT: root }
    });
    worker.once('spawn', () => fs.writeFileSync(path.join(root, 'worker-spawned.json'),
      JSON.stringify({ pid: worker.pid })));
    return worker;
  };
}
