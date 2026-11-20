'use strict';

// Real Node process death, not native SEA qualification. Sources are synthetic;
// no product credential store, parser GUI or network is used. Small test trees
// remain in their unique temp roots for inspection; there is no bulk cleanup.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { fork } = require('child_process');
const base = process.argv[2] === '--worker' ? process.argv[3]
  : fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-stage-integration-'));
if (process.argv[2] !== '--worker') {
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.LOCALAPPDATA = path.join(base, 'appdata');
  process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'product-data');
  process.env.EU_PRIVACY_RESULT_ROOT = path.join(base, 'results');
} else {
  for (const [key, leaf] of [['EU_PRIVACY_ROOT', 'privacy'], ['EU_PRIVACY_DATA_ROOT', 'product-data'], ['EU_PRIVACY_RESULT_ROOT', 'results'], ['LOCALAPPDATA', 'appdata']]) {
    assert.strictEqual(process.env[key], path.join(base, leaf), 'worker must inherit its exact parent namespace');
  }
}
const source = path.join(base, 'source.txt');
const originalText = 'Technologien: Java, TypeScript. Kontakt: test.person@example.org';
const { anonymizeSelectedSource, prepareProcessingRun } = require('../plugins/data-secure/server/gateway/orchestrator');
const { inspectStaging } = require('../plugins/data-secure/server/gateway/package-staging');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { ownChild, within, firstFailure, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const children = new Set();
const convertDocument = async () => ({ markdown: originalText, attachments: [], warnings: [] });
const dependencies = { convertDocument, cleanupLocalData: () => ({}), migrateLegacyAuditReceipts: () => ({}) };

async function worker() {
  // Independent fixture guard: a failed parent stop cannot leave this writer
  // indefinitely alive. Exit78 never satisfies the intentional crash oracle.
  setTimeout(() => process.exit(78), 40000);
  const phase = process.argv[4];
  const hold = async () => {
    process.send({ ready: phase });
    await new Promise(() => { setInterval(() => {}, 1000); });
  };
  const deps = { ...dependencies, packageId: `ds_${'a'.repeat(32)}` };
  if (phase === 'before-publish') deps.beforePublish = hold;
  else deps.publishPackage = (from, to) => {
    fs.renameSync(from, to);
    // Crash precisely after atomic rename, before the ownership receipt can
    // be finished. Exit only this dedicated fixture process.
    process.exit(79);
  };
  await anonymizeSelectedSource(source, 'general', deps);
  throw new Error('fixture unexpectedly returned');
}

async function crashAt(phase) {
  const child = fork(__filename, ['--worker', base, phase], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  const failure = firstFailure(), owned = ownChild(child, error => failure.record(error));
  children.add(owned);
  let ready = false, errorText = '', closed;
  try {
    child.stderr.on('error', error => failure.record(error));
    child.stderr.on('data', data => { errorText += data.toString().slice(0, 2000 - errorText.length); });
    child.on('message', message => {
      if (message?.ready === phase && phase === 'before-publish') {
        ready = true;
        try { assert.strictEqual(inspectStaging().pending, 1); }
        catch (error) { failure.record(error); }
        finally {
          try { owned.terminate('SIGKILL'); } catch (error) { failure.record(error); }
        }
      }
    });
    closed = await within(Promise.race([owned.done, owned.error.then(error => { throw error; })]),
      20000, 'STAGING_FIXTURE_DEADLINE');
    failure.throwIfFailed();
    assert.strictEqual(errorText, '', 'fixture stderr');
    assert.notStrictEqual(closed.code, 78, 'the independent fixture guard is a failure, never the intended crash');
    if (phase === 'before-publish') assert.strictEqual(ready, true);
    else assert.strictEqual(closed.code, 79);
    assert.notStrictEqual(closed.code, 0);
  } catch (error) { failure.record(error); }
  finally {
    if (!owned.closed) {
      try { owned.terminate('SIGKILL'); } catch (error) { failure.record(error); }
      try { await within(owned.done, 2000, 'STAGING_FIXTURE_CLOSE_UNCONFIRMED'); }
      catch (error) { failure.record(error); }
    }
    if (owned.closed) children.delete(owned);
  }
  failure.throwIfFailed();
}

async function main() {
  fs.writeFileSync(source, originalText, { flag: 'wx' });
  const r = roots();
  const kept = path.join(r.output, 'prior-result');
  fs.mkdirSync(kept);
  fs.writeFileSync(path.join(kept, 'keep.md'), 'previous result');
  await crashAt('before-publish');
  assert.strictEqual(inspectStaging().pending, 1);
  assert.deepStrictEqual(fs.readdirSync(r.output), ['prior-result']);
  prepareProcessingRun(dependencies);
  assert.deepStrictEqual(inspectStaging(), { pending: 0, failures: 0, unbound: 0 });
  console.log('PASS real pre-publication child death leaves a bound stage recovered by run preparation');

  await crashAt('after-rename');
  assert.strictEqual(inspectStaging().pending, 1);
  const final = path.join(r.output, `ds_${'a'.repeat(32)}`);
  const manifestBefore = fs.readFileSync(path.join(final, 'manifest.json'));
  prepareProcessingRun(dependencies);
  assert.deepStrictEqual(inspectStaging(), { pending: 0, failures: 0, unbound: 0 });
  assert.deepStrictEqual(fs.readFileSync(path.join(final, 'manifest.json')), manifestBefore);
  console.log('PASS real post-rename process exit only retires the receipt; final package is preserved');

  const success = await anonymizeSelectedSource(source, 'general', dependencies);
  assert.strictEqual(success.ok, true);
  const text = fs.readFileSync(path.join(r.output, success.package_id, success.document_id), 'utf8');
  assert(!text.includes('test.person@example.org'));
  assert(text.includes('Java'));
  assert.deepStrictEqual(inspectStaging(), { pending: 0, failures: 0, unbound: 0 });
  assert.strictEqual(fs.readFileSync(source, 'utf8'), originalText);
  assert.strictEqual(fs.readFileSync(path.join(kept, 'keep.md'), 'utf8'), 'previous result');
  console.log('PASS one-off generated package names, content gates, original and prior-output preservation');

  await assert.rejects(anonymizeSelectedSource(source, 'general', {
    ...dependencies, beforePublish: async () => { throw new Error('synthetic failure'); }
  }));
  assert.deepStrictEqual(inspectStaging(), { pending: 0, failures: 0, unbound: 0 });
  assert.strictEqual(fs.readFileSync(source, 'utf8'), originalText);
  console.log('PASS ordinary failure discards the exact bound stage without changing originals');

  let recoveryCalls = 0;
  const preparedRun = prepareProcessingRun({ ...dependencies, recoverAbandonedStages() {
    recoveryCalls++;
    return { removed: 0, active: 0, failures: 0, unbound: 0 };
  } });
  for (let i = 0; i < 3; i++) await anonymizeSelectedSource(source, 'general', {
    ...dependencies, preparedRun, recoverAbandonedStages() { throw new Error('redundant recovery'); }
  });
  assert.strictEqual(recoveryCalls, 1);
  assert.deepStrictEqual(inspectStaging(), { pending: 0, failures: 0, unbound: 0 });
  console.log('PASS staging recovery is amortized once for three sequential prepared-run documents');
}

(process.argv[2] === '--worker' ? worker() : main()).catch(error => {
  endTestCliFailure({ failed: true, error, retainedRoots: [base],
    unconfirmedChildren: [...children].some(child => !child.closed) });
});
