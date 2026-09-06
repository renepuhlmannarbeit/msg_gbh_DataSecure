'use strict';

const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('Truthful async test verdicts');
const helper = require.resolve('./helpers');
const run = source => spawnSync(process.execPath, ['-e',
  `const {test,testAsync,done,assert}=require(${JSON.stringify(helper)}).createSuite('sentinel');${source}`
], { encoding: 'utf8', timeout: 5000, windowsHide: true });

test('a late async failure is awaited and exits nonzero even without caller await', () => {
  const result = run("testAsync('late',async()=>{await new Promise(r=>setTimeout(r,25));assert.fail('LATE');});done();");
  assert.equal(result.status, 1); assert.match(result.stdout, /0 passed, 1 failed/);
  assert.doesNotMatch(result.stdout, /0 failed/);
});
test('done called inside an async case awaits its late failure before one cleanup and verdict', () => {
  const result = run("let settled=false;testAsync('late',async()=>{const a=done(()=>{assert.equal(settled,true);console.log('CLEANED');});assert.equal(a,done());await new Promise(r=>setTimeout(r,25));settled=true;assert.fail('LATE_AFTER_VERDICT');});");
  assert.equal(result.status, 1); assert.match(result.stdout, /0 passed, 1 failed/);
  assert.doesNotMatch(result.stdout, /0 failed/);
  assert.equal(result.stdout.match(/CLEANED/g)?.length, 1);
  assert.ok(result.stdout.indexOf('FAIL late') < result.stdout.indexOf('CLEANED'));
  assert.ok(result.stdout.indexOf('CLEANED') < result.stdout.indexOf('0 passed'));
});
test('done called inside a synchronous case runs cleanup only after its callback and verdict accounting', () => {
  for (const failing of [false, true]) {
    const result = run(`let settled=false;test('sync',()=>{const a=done(()=>{assert.equal(settled,true);console.log('CLEANED');});assert.equal(a,done());settled=true;${failing ? "assert.fail('SYNC_FAILED');" : ''}});`);
    assert.equal(result.status, failing ? 1 : 0);
    assert.match(result.stdout, failing ? /0 passed, 1 failed/ : /1 passed, 0 failed/);
    assert.equal(result.stdout.match(/CLEANED/g)?.length, 1);
    assert.ok(result.stdout.indexOf(failing ? 'FAIL sync' : 'ok   sync') < result.stdout.indexOf('CLEANED'));
  }
});
test('a misplaced async result from a sync case cannot race a reentrant done cleanup', () => {
  const result = run("let settled=false;test('wrong API',()=>{done(()=>{assert.equal(settled,true);console.log('CLEANED');});return new Promise((_,reject)=>setTimeout(()=>{settled=true;reject(new Error('LATE_ASYNC_FAILURE'));},25));});");
  assert.equal(result.status, 1); assert.match(result.stdout, /ASYNC_CASE_REQUIRES_TEST_ASYNC/);
  assert.match(result.stdout, /LATE_ASYNC_FAILURE/); assert.match(result.stdout, /0 passed, 2 failed/);
  assert.equal(result.stdout.match(/CLEANED/g)?.length, 1);
  assert.ok(result.stdout.indexOf('LATE_ASYNC_FAILURE') < result.stdout.indexOf('CLEANED'));
});
test('all delayed cases finish before one async cleanup and one verdict', () => {
  const result = run("let count=0; for(const ms of [30,5,15]) testAsync('delay',async()=>{await new Promise(r=>setTimeout(r,ms));count++;}); const a=done(async()=>{assert.equal(count,3);await new Promise(r=>setTimeout(r,5));console.log('CLEANED');});assert.equal(a,done());");
  assert.equal(result.status, 0); assert.match(result.stdout, /3 passed, 0 failed/);
  assert.equal(result.stdout.match(/CLEANED/g).length, 1);
  assert.ok(result.stdout.indexOf('CLEANED') < result.stdout.indexOf('3 passed'));
});
test('an unresolved case cannot silently exit green', () => {
  const result = run("testAsync('never',()=>new Promise(()=>{}));done();");
  assert.equal(result.status, 1); assert.match(result.stdout, /TESTS_OR_CLEANUP_DID_NOT_SETTLE/);
});
test('missing done and failed async cleanup both fail the suite', () => {
  assert.equal(run("test('ok',()=>{});").status, 1);
  const result=run("test('ok',()=>{});done(async()=>{throw new Error('CLEANUP_FAILED');});");
  assert.equal(result.status, 1); assert.match(result.stdout, /CLEANUP_FAILED/);
});
test('async functions accidentally passed to test are never counted as a sync success', () => {
  const result=run("test('wrong API',async()=>{await new Promise(r=>setTimeout(r,10));});done();");
  assert.equal(result.status, 1); assert.match(result.stdout, /ASYNC_CASE_REQUIRES_TEST_ASYNC/);
});
test('sequential await remains compatible and late registration fails', () => {
  const result=run("(async()=>{await testAsync('a',async()=>{});await testAsync('b',async()=>{});await done();assert.throws(()=>test('late',()=>{}),/TEST_REGISTERED_AFTER_DONE/);})();");
  assert.equal(result.status, 0); assert.match(result.stdout, /2 passed, 0 failed/);
});
done();
