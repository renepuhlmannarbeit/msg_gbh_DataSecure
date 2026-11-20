'use strict';
// Controlled Node TEST roles only. No product worker, PID search, unref or deletion.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./qa-parent-lifecycle.cjs');
const { fastModel, intakeModel } = require('../lib/small-process-parent-source.cjs');
if (process.argv[2] === '--child') {
  const role = process.argv[4], held = role.endsWith('held');
  const finish = (selfDeadline = false) => {
    clearTimeout(childGuard);
    if (selfDeadline) { try { fs.writeSync(2, 'SMALL_CHILD_SELF_DEADLINE\n'); } catch {} }
    process.exit(selfDeadline ? 78 : 0);
  };
  const childGuard = setTimeout(() => finish(true), 15000);
  if (role.startsWith('fast')) {
    let input = Buffer.alloc(0);
    process.stdin.on('data', bytes => {
      input = Buffer.concat([input, bytes]);
      while (input.length >= 4) {
        const size = input.readUInt32BE(0);
        if (input.length < size + 4) return;
        const request = JSON.parse(input.subarray(4, size + 4).toString('utf8'));
        input = input.subarray(size + 4);
        if (!held && request.action === 'shutdown') {
          const body = Buffer.from(JSON.stringify({ request_id: request.request_id, ok: true }));
          const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
          process.stdout.write(Buffer.concat([header, body]), () => setTimeout(finish, 30));
        }
      }
    });
    process.send({ type: 'ready' });
  } else {
    process.on('message', value => {
      if (value.type === 'release') { if (!held) setTimeout(finish, 30); return; }
      if (value.type !== 'acquire') return;
      if (role === 'intake-close') { setTimeout(finish, 30); return; }
      const type = role === 'intake-blocked' ? 'blocked' : 'acquired';
      process.send({ type }, () => { if (!held && (type === 'blocked' || value.hold !== true)) setTimeout(finish, 30); });
    });
  }
} else {
  const root = path.resolve(process.argv[2]), mode = process.argv[3], failed = process.argv[4] === 'failure';
  const handles = [], observations = [], kills = [], events = [], setupFailure = firstFailure();
  let readyResolve, readyReject, admitted, parentTimer, model;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  const setupError = error => { setupFailure.record(error); readyReject(error); };
  function armParentGuard(milliseconds, code) {
    clearTimeout(parentTimer);
    parentTimer = setTimeout(() => {
      // A reserved guard is a failed fixture, never normal exit1 or teardown proof.
      try { fs.writeFileSync(path.join(root, 'parent-guard.json'), JSON.stringify({
        code, admitted: admitted || null, real_exit_code: process.exitCode,
        view_exit_code: model?.processView.exitCode, writer_join: 'NOT_CLAIMED'
      }) + '\n', { flag: 'wx' }); } catch {}
      try { fs.writeSync(2, 'SMALL_CLI_PARENT_GUARD:' + code + '\n'); } catch {}
      process.exit(code);
    }, milliseconds);
  }
  armParentGuard(15000, 76);
  function admit() {
    if (admitted) return;
    setupFailure.throwIfFailed();
    assert.ok(!failed || kills.length === 0, 'SMALL_FAULT_AFTER_TERMINATION');
    admitted = { mode, failed, stage: failed ? 'fault' : 'positive',
      primary: failed ? mode === 'fast' ? 'undefined' : 'INTAKE_CLOSED_BEFORE_MESSAGE' : null,
      parent_guard_code: 75, exit_code_binding: 'REAL_SYMMETRIC_VERIFIED' };
    fs.writeFileSync(path.join(root, 'admitted.json'), JSON.stringify(admitted) + '\n', { flag: 'wx' });
    events.push('stage-admitted');
    armParentGuard(failed ? 8000 : 15000, 75);
    process.send?.({ type: 'stage-admitted', ...admitted }, error => { if (error) setupError(error); });
  }
  function participant(role, options) {
    const child = cp.fork(__filename, ['--child', root, role], {
      ...options, execArgv: [], windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    const owned = ownChild(child, setupError);
    const index = handles.length; handles.push(child); observations.push(owned);
    child.stderr?.on('error', setupError);
    child.stderr?.on('data', () => {});
    child.once('close', (code, signal) => {
      events.push('direct-close:' + index);
      if (failed && role === 'intake-close') {
        try { assert.equal(code, 0); assert.equal(signal, null); admit(); } catch (error) { setupError(error); }
      }
    });
    child.on('message', value => {
      if (index === 0 && (value?.type === 'ready' || value?.type === 'acquired')) {
        readyResolve();
        if (mode === 'intake' && !failed) { try { admit(); } catch (error) { setupError(error); } }
      }
    });
    if (role.endsWith('held')) child.kill = () => { events.push('source-terminate:' + index); kills.push(index); return false; };
    return child;
  }
  function verifyProcessBinding(view) {
    const saved = process.exitCode;
    try {
      view.exitCode = 17; assert.equal(process.exitCode, 17);
      process.exitCode = 19; assert.equal(view.exitCode, 19);
    } finally { process.exitCode = saved; }
  }
  async function run() {
    let result;
    const options = { root, processHost: process, end: endTestCliFailure,
      // Startup/first-message admission stays generous; only admitted fault cleanup is accelerated.
      milliseconds: () => !failed || !admitted ? 10000 : mode === 'fast' ? 100 : 500 };
    if (mode === 'fast') {
      model = fastModel((file, args, launchOptions) => participant(failed ? 'fast-held' : 'fast-positive', launchOptions), {
        ...options, scenario: async () => {
          await within(ready, 10000, 'FIXTURE_READY_TIMEOUT'); admit(); if (failed) throw undefined;
        }
      });
      verifyProcessBinding(model.processView);
      result = await capture(() => model.run());
    } else {
      model = intakeModel((file, args, launchOptions) => {
        const index = handles.length;
        const role = failed ? (index === 0 ? 'intake-held' : 'intake-close') :
          index === 1 ? 'intake-blocked' : 'intake-positive';
        return participant(role, launchOptions);
      }, options);
      verifyProcessBinding(model.processView);
      result = await capture(() => model.main());
      await model.suite.done();
    }
    setupFailure.throwIfFailed();
    assert.ok(admitted, 'SMALL_STAGE_NOT_ADMITTED');
    fs.writeFileSync(path.join(root, 'finished.json'), JSON.stringify({
      failed: result.failed, removed: model.operations.includes('remove'), kills, events, admitted,
      exit_code_binding: 'REAL_SYMMETRIC_VERIFIED',
      primary_kind: result.failed ? result.error === null ? 'null' : typeof result.error : null,
      primary_message: result.failed ? String(result.error?.message ?? result.error) : null,
      fixture_children: observations.map(value => ({ closed: value.closed, code: value.exitCode, signal: value.signal })),
      evidence: 'ACTUAL_PARENT_METHODS_AND_CLI_HOOK; TEST_NODE_CHILDREN_ONLY'
    }) + '\n', { flag: 'wx' });
    if (result.failed) model.end(result.error);
    if (!result.failed && !failed) clearTimeout(parentTimer);
  }
  async function capture(action) {
    try { return { failed: false, value: await action() }; }
    catch (error) { return { failed: true, error }; }
  }
  run().catch(async error => {
    for (const owned of observations) {
      try { if (!owned.closed) owned.terminate(); } catch {}
      try { await within(owned.done, 1000, 'SMALL_FIXTURE_CLOSE_UNCONFIRMED'); } catch {}
    }
    // Setup failures and reserved guards cannot satisfy the expected lifecycle result.
    try { fs.writeSync(2, 'SMALL_CLI_FIXTURE_SETUP_FAILED:' + String(error) + '\n'); } catch {}
    process.exit(2);
  });
}
