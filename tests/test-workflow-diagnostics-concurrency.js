'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WRITER_TIMEOUT_MS = 30000;
const STOP_WAIT_MS = 1000;

function writerOwner() {
  const owned = [];
  let failed = false, primary, wakeFailure;
  const failure = new Promise(resolve => { wakeFailure = resolve; });
  const fail = value => {
    if (!failed) { failed = true; primary = value; wakeFailure(); }
  };
  const closedWithin = async (records, milliseconds) => {
    if (records.every(record => record.closed)) return true;
    let timer;
    try {
      return await Promise.race([
        Promise.all(records.map(record => record.close)).then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })
      ]);
    } finally { clearTimeout(timer); }
  };
  return {
    async group(commands) {
      const records = [];
      for (const args of commands) {
        if (failed) break;
        let child;
        try { child = spawn(process.execPath, args, { stdio: 'ignore', windowsHide: true }); }
        catch (value) { fail(value); break; }
        let resolveClose;
        const record = { child, closed: false, close: new Promise(resolve => { resolveClose = resolve; }) };
        owned.push(record); records.push(record);
        // Register ownership and both observers before another launch or await.
        // An error (including a failed spawn with null stdio) is not close.
        child.on('error', fail);
        child.once('close', (code, signal) => {
          record.closed = true;
          if (code !== 0 || signal !== null) fail(new Error(`diagnostic writer closed ${code}/${signal}`));
          resolveClose();
        });
      }
      let timer;
      try {
        timer = setTimeout(() => fail(new Error('DIAGNOSTIC_WRITER_TIMEOUT')), WRITER_TIMEOUT_MS);
        await Promise.race([Promise.all(records.map(record => record.close)), failure]);
        if (failed) throw primary;
      } finally { clearTimeout(timer); }
    },
    async finish() {
      const errors = [];
      // Each stage attempts every still-open own handle, even if kill throws
      // or returns false. Neither a request nor a timeout fabricates close.
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const pending = owned.filter(record => !record.closed);
        if (!pending.length) break;
        for (const record of pending) {
          if (record.closed) continue;
          try {
            if (!record.child.kill(signal)) errors.push(new Error('DIAGNOSTIC_WRITER_STOP_NOT_SENT'));
          } catch (value) { errors.push(value); }
        }
        if (await closedWithin(pending, STOP_WAIT_MS)) break;
      }
      return { closed: owned.every(record => record.closed), errors, failed, primary };
    }
  };
}

async function main() {
  const owner = writerOwner();
  let dataRoot, failed = false, primary;
  const fail = value => { if (!failed) { failed = true; primary = value; } };
  try {
    // Permanent cases evaluate this actual CLI source, including its finalizer.
    await require('./lib/workflow-diagnostics-lifecycle-cases.cjs')(__filename);
    const { _test } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
    dataRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-workflow-concurrency-')));
    fs.mkdirSync(_test.workflowDiagnosticDirectory({ dataRoot }), { recursive: true });
    const modulePath = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'workflow-diagnostics.js');
    const writer = `const {recordWorkflowEvent}=require(process.argv[1]);const root=process.argv[2],run=process.argv[3];for(let i=0;i<50;i++){if(!recordWorkflowEvent({event:'intake_processing_started',outcome:'progress',run_id:run},{dataRoot:root}))process.exit(65);}`;
    await owner.group(['00000001', '00000002', '00000003', '00000004'].map(runId =>
      ['-e', writer, modulePath, dataRoot, runId]));
    const events = _test.readWorkflowEvents({ dataRoot });
    assert.strictEqual(events.length, 200, 'concurrent writers must not lose events');
    for (const runId of ['00000001', '00000002', '00000003', '00000004']) {
      assert.strictEqual(events.filter(event => event.run_id === runId).length, 50);
    }
    const diagnosticModule = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'diagnostics.js');
    const diagnosticWriter = `const {recordDiagnostic}=require(process.argv[1]);const root=process.argv[2];for(let i=0;i<50;i++){if(!recordDiagnostic({route:'batch',stage:'converted',result:'released',source_type:'txt',profile:'general'},{dataRoot:root}))process.exit(65);}`;
    await owner.group(['a', 'b', 'c', 'd'].map(() => ['-e', diagnosticWriter, diagnosticModule, dataRoot]));
    const { _test: diagnosticTest } = require('../plugins/data-secure/server/gateway/diagnostics');
    assert.strictEqual(diagnosticTest.readEvents({ dataRoot }).length, 200,
      'the general diagnostic spool must not lose concurrent writers');
    assert.strictEqual(diagnosticTest.diagnosticEventFiles({ dataRoot }).length, 200);
  } catch (value) { fail(value); }

  const teardown = await owner.finish();
  if (teardown.failed) fail(teardown.primary);
  for (const value of teardown.errors) fail(value);
  if (!teardown.closed) fail(new Error('DIAGNOSTIC_WRITER_CLOSE_UNCONFIRMED'));
  // Remove only this successful invocation's new root. Failed evidence and
  // an unconfirmed writer both keep it; this grants no old-root cleanup.
  if (!failed && dataRoot !== undefined && teardown.closed) {
    try { fs.rmSync(dataRoot, { recursive: true, force: true }); }
    catch (value) { fail(value); }
  }
  if (failed) throw primary;
  console.log('WORKFLOW AND GENERAL DIAGNOSTICS CONCURRENCY PASS');
}

const completed = main();
completed.catch(() => {
  // All finite stop/join attempts and eligible cleanup ran first. Preserve the
  // exact rejection internally; send no primary contents through diagnostics.
  try { fs.writeSync(2, 'WORKFLOW AND GENERAL DIAGNOSTICS CONCURRENCY FAILED\n'); } catch {}
  process.exit(1);
});
