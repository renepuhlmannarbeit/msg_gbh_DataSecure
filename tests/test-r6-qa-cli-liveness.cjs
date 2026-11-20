'use strict';
// Actual parent exit is observed. A child deadline receipt is not a child-close witness.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'r6-cli-liveness-'));
const ownedFixtures = [];
function assertAdmittedCut(events, mode) {
  const marker = mode === 'artifact-parser' ? 'cut-message-observed' : 'cut-expectation-admitted';
  const cut = events.findIndex(value => value.name === marker);
  const firstStop = events.findIndex(value => value.name === 'saved-termination-request');
  assert.ok(cut >= 0, 'the intended actual cut must be admitted');
  assert.ok(firstStop < 0 || cut < firstStop,
    'actual cut must precede the first saved termination request');
}
async function checkDirectChildSelfDeadline() {
  const directory = path.join(root, 'direct-child-self-deadline'); fs.mkdirSync(directory);
  const child = spawn(process.execPath, [path.join(__dirname, 'helpers/qa-cli-liveness-fixture.cjs'),
    '--held', directory, 'hold'], { windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const failure = firstFailure(), owned = ownChild(child, error => failure.record(error)); ownedFixtures.push(owned);
  child.stderr?.on('data', () => {});
  let readyResolve, stageResolve, cutResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const stage = new Promise(resolve => { stageResolve = resolve; });
  const cut = new Promise(resolve => { cutResolve = resolve; });
  child.on('message', value => {
    if (value?.fixture === 'ready') readyResolve();
    if (value?.fixture === 'stage') stageResolve(value.expectation);
    if (value?.expectation && value.fixture === undefined) cutResolve(value.expectation);
  });
  const setup = promise => within(Promise.race([promise,
    owned.error.then(error => { throw error; }), owned.done.then(() => { throw Error('CHILD_PROBE_EARLY_EXIT'); })
  ]), 10000, 'CHILD_PROBE_SETUP_UNCONFIRMED');
  const send = message => within(new Promise((resolve, reject) => {
    try { child.send(message, error => error ? reject(error) : resolve()); } catch (error) { reject(error); }
  }), 10000, 'CHILD_PROBE_SEND_UNCONFIRMED');
  try {
    await setup(ready); await send('prepare');
    assert.deepEqual(await setup(stage), { owned_fixture: true });
    await send('run'); assert.deepEqual(await setup(cut), { owned_fixture: true });
    // Driver stays alive and owns this direct handle, including on Windows.
    const end = await within(Promise.race([owned.done, owned.error.then(error => { throw error; })]),
      10000, 'CHILD_PROBE_DEADLINE_UNCONFIRMED');
    assert.equal(end.code, 73); assert.equal(end.signal, null); assert.equal(owned.closed, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'child-self-deadline.json'), 'utf8')).code, 73);
    fs.writeFileSync(path.join(directory, 'direct-child-close-observed.json'), JSON.stringify(end));
  } catch (error) { failure.record(error); }
  finally {
    try { owned.terminate('SIGKILL'); } catch (error) { failure.record(error); }
    try { await within(owned.done, 1000, 'CHILD_PROBE_CLOSE_UNCONFIRMED'); }
    catch (error) { failure.record(error); }
  }
  failure.throwIfFailed();
}
async function run(mode, kind, expectedCode, expectedPrimary, held) {
  const directory = path.join(root, mode + '-' + kind); fs.mkdirSync(directory);
  const child = spawn(process.execPath, [path.join(__dirname, 'helpers/qa-cli-liveness-fixture.cjs'),
    mode, directory, kind], { windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  const failure = firstFailure(), owned = ownChild(child, error => failure.record(error)); ownedFixtures.push(owned);
  let stderr = '';
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-65536); });
  let end;
  try { end = await within(Promise.race([owned.done, owned.error.then(error => { throw error; })]),
    60000, 'CLI_FIXTURE_PARENT_EXIT_UNCONFIRMED'); }
  catch (error) { failure.record(error); }
  finally {
    try { owned.terminate('SIGKILL'); } catch (error) { failure.record(error); }
    try { await within(owned.done, 1000, 'CLI_FIXTURE_PARENT_CLOSE_UNCONFIRMED'); }
    catch (error) { failure.record(error); }
  }
  failure.throwIfFailed();
  assert.equal(end.code, expectedCode); assert.equal(end.signal, null); assert.equal(owned.closed, true);
  assert.equal(fs.existsSync(directory), true, 'owned evidence root is retained');
  // Deliberately resume later; no post-parent child receipt or file absence is required.
  if (held && kind === 'delayed-driver') await new Promise(resolve => setTimeout(resolve, 1000));
  const events = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const has = name => events.some(value => value.name === name);
  if (mode === 'delayed-startup') {
    assert.equal(has('startup-admitted'), false); assert.equal(has('expectation-admitted'), false);
    assert.equal(fs.existsSync(path.join(directory, 'child-startup-withheld.json')), true);
  } else if (mode !== 'artifact-spawn') {
    assert.equal(has('startup-admitted'), true); assert.equal(has('expectation-admitted'), true);
    assertAdmittedCut(events, mode);
  }
  assert.deepEqual(events.filter(value => value.name !== 'saved-termination-request').slice(-4).map(value => value.name),
    ['final-own-stop', 'final-close-wait', 'independent-cleanup-check', 'teardown-finished']);
  if (expectedCode === 0) {
    assert.equal(fs.existsSync(path.join(directory, 'success.json')), true, 'failure-only exit must spare success');
    assert.equal(stderr.includes('R6_TEST_CLI_FAILURE:'), false);
  } else {
    assert.equal(fs.existsSync(path.join(directory, 'success.json')), false);
    assert.ok(stderr.includes('R6_TEST_CLI_PRIMARY:' + expectedPrimary), stderr);
    const line = stderr.split('\n').find(value => value.startsWith('R6_TEST_CLI_FAILURE:'));
    assert.ok(line, stderr); const verdict = JSON.parse(line.slice('R6_TEST_CLI_FAILURE:'.length));
    assert.equal(verdict.verdict, 'FAILED'); assert.equal(verdict.teardown, 'ALL_KNOWN_ATTEMPTED');
    assert.equal(verdict.fixture, 'STATUS_UNCONFIRMED'); assert.equal(verdict.writer_join, 'NOT_CLAIMED');
    assert.deepEqual(verdict.scope_roots, [directory]);
    if (held) {
      assert.equal(verdict.child_end, 'UNCONFIRMED');
      assert.equal(events.filter(value => value.name === 'saved-termination-request').length, 1);
      // Parent close may end its child through the normal platform Job policy.
      // No survival, later child file, detach or descendant join is required here.
      fs.writeFileSync(path.join(directory, 'parent-close-observed.json'), JSON.stringify(end));
    }
  }
}
(async () => {
  // Real successful parent/child and both artifact helper controls precede faults.
  await run('success', 'none', 0);
  await run('artifact-before', 'none', 0);
  await run('artifact-after', 'none', 0);
  // Exercise the SAME validation function used by the actual run, not a copied oracle.
  const vector = names => names.map(name => ({ name }));
  assert.doesNotThrow(() => assertAdmittedCut(vector([
    'startup-admitted', 'expectation-admitted', 'cut-expectation-admitted', 'saved-termination-request'
  ]), 'artifact-timeout'));
  assert.throws(() => assertAdmittedCut(vector([
    'startup-admitted', 'expectation-admitted', 'saved-termination-request', 'cut-expectation-admitted'
  ]), 'artifact-timeout'), /actual cut must precede/);
  await checkDirectChildSelfDeadline();
  await run('failure', 'undefined', 1, 'undefined', true);
  await run('failure', 'frozen', 1, 'Error: ORIGINAL_PRIMARY', true);
  await run('failure', 'delayed-driver', 1, 'Error: ORIGINAL_PRIMARY', true);
  await run('suite-failure', 'false', 1, 'false', true);
  await run('artifact-timeout', 'none', 1, 'Error: ARTIFACT_CRASH_WAIT_UNCONFIRMED', true);
  await run('artifact-parser', 'none', 1, 'TypeError:', true);
  await run('artifact-spawn', 'none', 1, 'Error: spawn ', false);
  await run('delayed-startup', 'none', 1, 'Error: FIXTURE_SETUP_READY_UNCONFIRMED', false);
  console.log('PASS actual portable parent exits and direct child deadline close; no writer-tree claim: ' + root);
})().catch(async error => {
  const failure = firstFailure(); failure.record(error);
  for (const owned of ownedFixtures) { try { owned.terminate('SIGKILL'); } catch (secondary) { failure.record(secondary); } }
  try { await within(Promise.all(ownedFixtures.map(owned => owned.done)), 1000, 'CLI_TEST_PARENT_CLOSE_UNCONFIRMED'); }
  catch (secondary) { failure.record(secondary); }
  endTestCliFailure({ failed: true, error: failure.value, retainedRoots: [root],
    unconfirmedChildren: ownedFixtures.some(owned => !owned.closed) });
});
