'use strict';
// Actual QA caller bodies with modeled direct children. No product import,
// real spawn, fixture deletion or assertion of native writer quiescence.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { EventEmitter } = require('events');
const { createSuite } = require('./helpers');
const { ownChild, within, firstFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const suite = createSuite('QA reservation and staging owned-child teardown');
const { assert, testAsync } = suite;
const rootSource = fs.readFileSync(path.join(__dirname, 'test-root-boundary.js'), 'utf8');
const stageSource = fs.readFileSync(path.join(__dirname, 'test-package-staging-integration.js'), 'utf8');
function body(source, begin, end) {
  const start = source.indexOf(begin), finish = source.indexOf(end, start);
  assert.ok(start >= 0 && start === source.lastIndexOf(begin) && finish > start);
  return source.slice(start, finish);
}
const rootBody = body(rootSource, 'async function runReservationWriters(', '\nfunction fixture(');
const stageBody = body(stageSource, 'async function crashAt(', '\nasync function main(');
class Child extends EventEmitter {
  stderr = new EventEmitter();
  calls = []; exitCode = null; signalCode = null;
  killMode = 'close';
  kill(signal) {
    this.calls.push(signal);
    if (this.killMode === 'throw') throw 0;
    if (this.killMode === 'false') return false;
    this.exitCode = null; this.signalCode = 'SIGKILL';
    this.emit('close', null, 'SIGKILL'); return true;
  }
}
function fixture(kind, fault) {
  const children = [], retained = [], receipts = [];
  const primary = Object.freeze({ fixture: 'owned child error' });
  const spawn = () => {
    const child = new Child(), index = children.length; children.push(child);
    if (fault === 'guard78') child.killMode = 'false';
    if (index === 0 && ['kill-false', 'kill-throws', 'exit-without-close'].includes(fault))
      child.killMode = fault === 'kill-throws' ? 'throw' : 'false';
    queueMicrotask(() => {
      if (index === 0 && fault === 'process-error') { child.emit('error', primary); return; }
      if (index === 0 && fault === 'kill-false') return;
      if (index === 0 && fault === 'kill-throws') return;
      if (index === 0 && fault === 'exit-without-close') { child.exitCode = 0; child.emit('exit', 0, null); return; }
      if (index === 0 && fault === 'stderr-error') { child.stderr.emit('error', primary); return; }
      if (kind === 'stage' && ['before', 'guard78'].includes(fault)) {
        child.emit('message', { ready: 'before-publish' });
        if (fault === 'guard78') child.emit('close', 78, null);
      }
      else child.emit('close', fault === 'code17' ? 17 : kind === 'stage' ? 79 : 0,
        fault === 'signal' ? 'SIGTERM' : null);
    });
    return child;
  };
  const helpers = { ownChild, firstFailure,
    within: (promise, milliseconds, code) => within(promise, Math.min(milliseconds, 25), code),
    endTestCliFailure(result) {
      if (!result.failed) return;
      retained.push(result);
      const stop = new Error('MODELED_TEST_CLI_EXIT_1'); stop.exitCode = 1; throw stop;
    }
  };
  const context = { require(name) {
    if (name === 'child_process') return { spawn };
    if (name === 'owned-helper') return helpers;
    if (name === 'crypto') return require('crypto');
    throw Error('unlisted caller dependency ' + name);
  }, process: { execPath: 'owned-model-node', stdout: { write: bytes => receipts.push(JSON.parse(bytes)) } },
  fork: spawn, __filename: 'owned-model-stage.js', base: 'owned-model-root',
  ownChild, within: helpers.within, firstFailure, children: new Set(), assert,
  inspectStaging: () => ({ pending: 1 }) };
  return { context, children, retained, receipts, primary };
}
async function main() {
  for (const fault of ['healthy', 'process-error', 'stderr-error', 'kill-false', 'kill-throws',
    'exit-without-close', 'code17', 'signal']) {
    await testAsync(`reservation actual caller: ${fault}`, async () => {
      const f = fixture('reservation', fault);
      const run = vm.runInNewContext(rootBody + '\nrunReservationWriters;', f.context);
      if (fault === 'healthy') {
        await run(['one', 'two', 'three', 'four'], 'owned-worker', 'owned-helper');
        assert.equal(f.receipts.length, 1); assert.equal(f.receipts[0].closed.length, 4);
        assert.ok(f.children.every(child => child.calls.length === 0)); assert.equal(f.retained.length, 0);
      } else {
        await assert.rejects(run(['one', 'two', 'three', 'four'], 'owned-worker', 'owned-helper'),
          error => error.exitCode === 1);
        assert.equal(f.receipts.length, 0); assert.equal(f.retained.length, 1);
        if (['process-error', 'stderr-error'].includes(fault)) assert.strictEqual(f.retained[0].error, f.primary);
        if (['kill-false', 'kill-throws', 'exit-without-close'].includes(fault)) {
          assert.equal(f.retained[0].unconfirmedChildren, true);
          assert.equal(f.children[0].calls.length, 1);
        }
        assert.ok(f.children.every(child => child.calls.length <= 1));
      }
    });
  }
  for (const fault of ['before', 'after', 'guard78', 'process-error', 'stderr-error', 'kill-false', 'kill-throws', 'exit-without-close', 'code17']) {
    await testAsync(`staging actual caller: ${fault}`, async () => {
      const f = fixture('stage', fault);
      const run = vm.runInNewContext(stageBody + '\ncrashAt;', f.context);
      let failed = false, error;
      try { await run(['before', 'guard78'].includes(fault) ? 'before-publish' : 'after-rename'); }
      catch (value) { failed = true; error = value; }
      if (fault === 'before' || fault === 'after') {
        assert.equal(failed, false); assert.equal(f.context.children.size, 0);
      } else {
        assert.equal(failed, true);
        if (fault === 'guard78') assert.match(error.message, /independent fixture guard/);
        if (['process-error', 'stderr-error'].includes(fault)) assert.strictEqual(error, f.primary);
        if (['kill-false', 'kill-throws', 'exit-without-close'].includes(fault)) {
          assert.equal(f.context.children.size, 1); assert.equal(f.children[0].calls.length, 1);
        }
      }
      assert.ok(f.children.every(child => child.calls.length <= 1));
    });
  }
  await suite.done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
