import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capturePackageSmokeScope, finishPackageSmokeParent, removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function rejectsExactly(operation, expected) {
  let caught = false, actual;
  try { await operation; } catch (error) { caught = true; actual = error; }
  assert.equal(caught, true); assert.strictEqual(actual, expected);
}
async function bounded(operation) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PARENT_QA_TEST_DEADLINE')), 2000);
  })]); } finally { clearTimeout(timer); }
}
function ownChild(closeOnTerminate = true) {
  let closed = false, kills = 0, resolve;
  const done = new Promise(ready => { resolve = ready; });
  const close = () => { closed = true; resolve(); };
  const entry = Object.freeze({ done, closed: () => closed,
    terminate() { kills++; if (closeOnTerminate) close(); },
    get pid() { throw new Error('NO_PID_DISCOVERY'); },
    get child() { throw new Error('NO_LATE_HANDLE_LOOKUP'); } });
  return { entry, close, kills: () => kills };
}
function steps(events) {
  return { restoreSpawn() { events.push('spawn'); },
    restoreEnvironment: [() => events.push('environment')] };
}

// Successful baselines precede every injected liveness/cleanup fault.
{
  const events = [], child = ownChild();
  await bounded(finishPackageSmokeParent({ children: [child.entry], ...steps(events), waitMs: 25 }));
  assert.deepEqual(events, ['spawn', 'environment']); assert.equal(child.kills(), 1);
  const alreadyClosed = ownChild(); alreadyClosed.close(); events.length = 0;
  await bounded(finishPackageSmokeParent({ children: [alreadyClosed.entry], ...steps(events), waitMs: 25 }));
  assert.equal(alreadyClosed.kills(), 0); assert.deepEqual(events, ['spawn', 'environment']);
}
{
  const events = [], child = ownChild(false);
  await assert.rejects(bounded(finishPackageSmokeParent({ children: [child.entry], ...steps(events), waitMs: 25 })),
    { code: 'STANDALONE_SMOKE_CLOSE_UNCONFIRMED' });
  assert.equal(child.kills(), 1); assert.deepEqual(events, ['spawn']);
  child.close(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ['spawn'], 'late close cannot restore roots or schedule a late deletion');
}
for (const error of [new Error('PRIMARY'), null, undefined, false, 0, '']) {
  const events = [], child = ownChild(false);
  await rejectsExactly(bounded(finishPackageSmokeParent({ children: [child.entry], ...steps(events),
    failed: true, error, waitMs: 25 })), error);
  assert.deepEqual(events, ['spawn']); child.close();
}
{
  const primary = new Error('PRIMARY_WITH_CLEANUP_FAILURE'), events = [];
  await rejectsExactly(bounded(finishPackageSmokeParent({ children: [], ...steps(events), failed: true, error: primary,
    restoreEnvironment: [() => { events.push('first'); throw 0; }, () => events.push('second')], waitMs: 25 })), primary);
  assert.deepEqual(events, ['spawn', 'first', 'second'], 'restore attempts continue; failed evidence is retained');
  await rejectsExactly(bounded(finishPackageSmokeParent({ children: [], ...steps([]),
    restoreSpawn() { throw false; }, waitMs: 25 })), false);
}

{
  const events = [];
  await rejectsExactly(bounded(finishPackageSmokeParent({ children: [], ...steps(events),
    failed: true, error: null, waitMs: 25 })), null);
  assert.deepEqual(events, ['spawn', 'environment'], 'closed failed run retains its own execution evidence');
  const neverClosed = Object.freeze({ done: new Promise(() => {}), closed: () => false, terminate() { throw false; } });
  await assert.rejects(bounded(finishPackageSmokeParent({ children: [neverClosed], ...steps([]), waitMs: 25 })),
    { code: 'STANDALONE_SMOKE_CLOSE_UNCONFIRMED' });
}

// Filesystem baseline uses only this test's newly created exact scopes.
function scratch() {
  const directory = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-parent-qa-'));
  const token = capturePackageSmokeScope(repo, directory);
  return { directory, token };
}
{
  const own = scratch(); fs.writeFileSync(path.join(own.directory, 'scratch.txt'), 'reproducible scratch', { flag: 'wx' });
  removePackageSmokeScope(repo, own.directory, own.token); assert.equal(fs.existsSync(own.directory), false);
}
{
  const first = scratch(), second = scratch();
  fs.writeFileSync(path.join(second.directory, 'evidence.txt'), 'keep this newly owned evidence', { flag: 'wx' });
  assert.throws(() => removePackageSmokeScope(repo, second.directory, first.token), /STANDALONE_SMOKE_CLEANUP_UNSAFE/u);
  assert.throws(() => removePackageSmokeScope(repo, second.directory, Object.freeze({})), /STANDALONE_SMOKE_CLEANUP_UNSAFE/u);
  assert.equal(fs.readFileSync(path.join(second.directory, 'evidence.txt'), 'utf8'), 'keep this newly owned evidence');
  removePackageSmokeScope(repo, first.directory, first.token);
  removePackageSmokeScope(repo, second.directory, second.token);
}
{
  const original = scratch(), retired = original.directory + '-retired';
  // Move only this invocation's own new scope within the verified repository.
  assert.equal(path.dirname(original.directory), repo);
  assert.equal(path.dirname(retired), repo);
  assert.equal(fs.existsSync(retired), false);
  fs.renameSync(original.directory, retired);
  const retiredToken = capturePackageSmokeScope(repo, retired);
  fs.mkdirSync(original.directory);
  const replacementToken = capturePackageSmokeScope(repo, original.directory);
  fs.writeFileSync(path.join(original.directory, 'marker.txt'), 'preserve replacement', { flag: 'wx' });
  assert.throws(() => removePackageSmokeScope(repo, original.directory, original.token), /STANDALONE_SMOKE_CLEANUP_UNSAFE/u);
  assert.equal(fs.readFileSync(path.join(original.directory, 'marker.txt'), 'utf8'), 'preserve replacement');
  // Only successful, fully asserted own fixtures are removed; failures retain evidence.
  removePackageSmokeScope(repo, original.directory, replacementToken);
  removePackageSmokeScope(repo, retired, retiredToken);
}
console.log('PASS bounded parent cleanup and own scratch identities; modeled close states, no native process/tree claim');
