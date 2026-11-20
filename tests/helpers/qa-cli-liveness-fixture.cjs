'use strict';
// Bounded own-fixture process for the CLI policy, never a product/native owner.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./qa-parent-lifecycle.cjs');
const { finishArtifactCrash } = require('./artifact-crash-process.cjs');
const mode = process.argv[2], root = process.argv[3], kind = process.argv[4];
const STARTUP_MS = 10000, STARTUP_SELF_MS = 15000, CHILD_SELF_MS = 3000;
const expectation = { owned_fixture: true };
const event = name => { try { fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({ name, at: Date.now() }) + '\n'); } catch {} };
if (mode === '--held') {
  const childEvent = name => fs.appendFileSync(path.join(root, 'child-events.jsonl'), JSON.stringify({ name }) + '\n');
  let running = false;
  let deadline = setTimeout(() => {
    childEvent('startup-self-deadline');
    fs.writeFileSync(path.join(root, 'child-startup-deadline.json'), JSON.stringify({ code: 74 }));
    process.exit(74);
  }, STARTUP_SELF_MS);
  process.on('disconnect', () => { childEvent('parent-disconnected'); });
  process.on('message', message => {
    if (message === 'prepare') {
      childEvent('expectation-prepared');
      process.send({ fixture: 'stage', expectation }, () => {}); return;
    }
    if (message === 'run') {
      if (running) return;
      running = true; clearTimeout(deadline);
      // This short deadline starts only after the parent's positive stage admission.
      deadline = setTimeout(() => {
        childEvent('self-deadline');
        fs.writeFileSync(path.join(root, 'child-self-deadline.json'), JSON.stringify({ code: 73 }));
        process.exit(73);
      }, CHILD_SELF_MS);
      childEvent('cut-sent');
      process.send(kind === 'bad-message' ? null : { expectation }, () => {
        if (kind === 'after') { clearTimeout(deadline); childEvent('after-cut'); process.exit(79); }
      }); return;
    }
    if (message !== 'finish') return;
    clearTimeout(deadline); fs.writeFileSync(path.join(root, 'child-normal-exit.json'), '{}'); process.exit(0);
  });
  const boot = process.hrtime.bigint();
  const ready = () => process.send({ fixture: 'ready', elapsed_ms: Number((process.hrtime.bigint() - boot) / 1000000n) }, () => {});
  if (kind === 'late-ready') fs.writeFileSync(path.join(root, 'child-startup-withheld.json'), '{}');
  process.send({ fixture: 'started' }, () => {});
  if (kind === 'late-ready') setTimeout(ready, 1500);
  else ready();
} else {
  const children = [], primary = firstFailure();
  let parentDeadline;
  function armParentDeadline(milliseconds) {
    clearTimeout(parentDeadline);
    // Referenced on purpose: exitCode-only must not pass after natural handle retirement.
    parentDeadline = setTimeout(() => {
      try { fs.writeSync(2, 'FIXTURE_PARENT_SELF_DEADLINE_UNCONFIRMED\n'); } catch {}
      process.exit(75);
    }, milliseconds);
  }
  armParentDeadline(45000);
  function cause() {
    if (kind === 'undefined') return undefined;
    if (kind === 'false') return false;
    return Object.freeze(Error('ORIGINAL_PRIMARY'));
  }
  (async () => {
    try {
      const artifactCase = mode.startsWith('artifact-');
      const child = mode === 'artifact-spawn'
        ? spawn(path.join(root, 'absent-executable'), [], { stdio: ['ignore', 'pipe', 'pipe'] })
        : fork(__filename, ['--held', root, mode === 'delayed-startup' ? 'late-ready' :
          mode === 'artifact-after' ? 'after' : mode === 'artifact-parser' ? 'bad-message' : 'hold'],
          { windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      const uncertain = ['failure', 'suite-failure', 'artifact-timeout', 'artifact-parser'].includes(mode);
      if (uncertain) child.kill = () => { event('saved-termination-request'); return false; };
      // Own immediately. The artifact helper later receives this SAME record.
      const owned = ownChild(child, error => primary.record(error)); children.push(owned);
      child.stderr?.on('data', () => {});
      let startedResolve, readyResolve, preparedResolve, sendFault;
      const started = new Promise(resolve => { startedResolve = resolve; });
      const ready = new Promise(resolve => { readyResolve = resolve; });
      const prepared = new Promise(resolve => { preparedResolve = resolve; });
      const sendFailure = new Promise(resolve => { sendFault = resolve; });
      const send = message => {
        const fail = error => { if (error) { primary.record(error); sendFault(error); } };
        try { child.send(message, fail); } catch (error) { primary.record(error); sendFault(error); }
      };
      const setup = (promise, code, milliseconds = STARTUP_MS) => within(Promise.race([
        promise, sendFailure.then(error => { throw error; }), owned.error.then(error => { throw error; }),
        owned.done.then(() => { throw Error('FIXTURE_SETUP_CHILD_EXIT'); })
      ]), milliseconds, code);
      const observeStartup = value => {
        if (value?.fixture === 'started') { event('child-started'); startedResolve(); }
        if (value?.fixture === 'ready') readyResolve(value);
        if (value?.fixture === 'stage') preparedResolve(value.expectation);
      };
      // A real failed spawn goes directly through the actual artifact helper below.
      if (mode !== 'artifact-spawn') {
        child.on('message', observeStartup);
        try {
          await setup(started, 'FIXTURE_SETUP_START_UNCONFIRMED');
          const readyBudget = mode === 'delayed-startup' ? 1000 : STARTUP_MS, readyAt = Date.now();
          const report = await setup(ready, 'FIXTURE_SETUP_READY_UNCONFIRMED', readyBudget);
          // Child monotonic time also rejects late readiness if the observer resumed late.
          if (Date.now() - readyAt >= readyBudget || report.elapsed_ms >= readyBudget)
            throw Error('FIXTURE_SETUP_READY_UNCONFIRMED');
          event('startup-admitted'); send('prepare');
          assert.deepEqual(await setup(prepared, 'FIXTURE_SETUP_EXPECTATION_UNCONFIRMED'), expectation);
          event('expectation-admitted');
        } finally { child.removeListener('message', observeStartup); }
      }
      primary.throwIfFailed();
      if (mode !== 'artifact-spawn') armParentDeadline(8000);
      if (artifactCase) {
        const phase = mode === 'artifact-after' || mode === 'artifact-spawn' ? 'after' : 'before';
        child.once('message', value => event(value?.expectation?.owned_fixture === true ?
          'cut-expectation-admitted' : 'cut-message-observed'));
        const finished = finishArtifactCrash(child, phase, {
          waitMs: mode === 'artifact-timeout' ? 1000 : 5000, closeMs: 25, owned
        });
        if (mode !== 'artifact-spawn') send('run');
        const result = await finished;
        assert.equal(result.timedOut, false); assert.equal(result.stderr, '');
        assert.deepEqual(result.expectation, expectation);
        assert.ok(![73, 74, 75, 78].includes(result.exited), 'a fixture self-deadline is never a normal artifact cut');
        if (phase === 'after') assert.equal(result.exited, 79);
        fs.writeFileSync(path.join(root, 'artifact-direct-close.json'), JSON.stringify(result));
      } else {
        const cut = new Promise(resolve => child.once('message', resolve));
        send('run');
        assert.deepEqual((await setup(cut, 'FIXTURE_SETUP_CUT_UNCONFIRMED')).expectation, expectation);
        event('cut-expectation-admitted'); primary.throwIfFailed();
        if (mode === 'success') {
          send('finish');
          assert.equal((await within(owned.done, 5000, 'FIXTURE_CLOSE_DEADLINE')).code, 0);
        } else if (mode === 'suite-failure') {
          const { testAsync, done, failure } = require('../helpers').createSuite('owned CLI failure fixture');
          await testAsync('falsy body failure consumed by harness', async () => { throw cause(); });
          const before = failure(); assert.equal(before.failed, true); primary.record(before.error);
          await done(); assert.equal(failure().error, before.error);
        } else throw cause();
      }
    } catch (error) { primary.record(error); }
    finally {
      event('final-own-stop');
      for (const owned of children) { try { owned.terminate('SIGKILL'); } catch (error) { primary.record(error); } }
      event('final-close-wait');
      try { await within(Promise.all(children.map(owned => owned.done)), 25, 'FIXTURE_CLOSE_UNCONFIRMED'); }
      catch (error) { primary.record(error); }
      event('independent-cleanup-check');
      if (primary.failed) { try { throw Error('SECONDARY_CLEANUP'); } catch (error) { primary.record(error); } }
      event('teardown-finished');
    }
    endTestCliFailure({ failed: primary.failed, error: primary.value, retainedRoots: [root],
      unconfirmedChildren: children.some(owned => !owned.closed) });
    if (!primary.failed) {
      fs.writeFileSync(path.join(root, 'success.json'), '{}');
      clearTimeout(parentDeadline);
    }
  })().catch(error => endTestCliFailure({ failed: true, error, retainedRoots: [root],
    unconfirmedChildren: children.some(owned => !owned.closed) }));
}
