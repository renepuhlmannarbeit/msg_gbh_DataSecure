'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { _test } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-workflow-concurrency-'));
fs.mkdirSync(_test.workflowDiagnosticDirectory({ dataRoot }), { recursive: true });
const modulePath = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'workflow-diagnostics.js');
const writer = `const {recordWorkflowEvent}=require(process.argv[1]);const root=process.argv[2],run=process.argv[3];for(let i=0;i<50;i++){if(!recordWorkflowEvent({event:'intake_processing_started',outcome:'progress',run_id:run},{dataRoot:root}))process.exit(65);}`;
const children = ['00000001', '00000002', '00000003', '00000004'].map((runId) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', writer, modulePath, dataRoot, runId], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`writer exited ${code}`)));
  }));

Promise.all(children).then(() => {
  const events = _test.readWorkflowEvents({ dataRoot });
  assert.strictEqual(events.length, 200, 'concurrent writers must not lose events');
  for (const runId of ['00000001', '00000002', '00000003', '00000004']) {
    assert.strictEqual(events.filter((event) => event.run_id === runId).length, 50);
  }
  const diagnosticModule = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'diagnostics.js');
  const diagnosticWriter = `const {recordDiagnostic}=require(process.argv[1]);const root=process.argv[2];for(let i=0;i<50;i++){if(!recordDiagnostic({route:'batch',stage:'converted',result:'released',source_type:'txt',profile:'general'},{dataRoot:root}))process.exit(65);}`;
  return Promise.all(['a', 'b', 'c', 'd'].map(() => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', diagnosticWriter, diagnosticModule, dataRoot], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`diagnostic writer exited ${code}`)));
  })));
}).then(() => {
  const { _test: diagnosticTest } = require('../plugins/data-secure/server/gateway/diagnostics');
  assert.strictEqual(diagnosticTest.readEvents({ dataRoot }).length, 200,
    'the general diagnostic spool must not lose concurrent writers');
  assert.strictEqual(diagnosticTest.diagnosticEventFiles({ dataRoot }).length, 200);
  fs.rmSync(dataRoot, { recursive: true, force: true });
  console.log('WORKFLOW AND GENERAL DIAGNOSTICS CONCURRENCY PASS');
}, (error) => {
  try { fs.rmSync(dataRoot, { recursive: true, force: true }); } catch {}
  console.error(error);
  process.exit(1);
});
