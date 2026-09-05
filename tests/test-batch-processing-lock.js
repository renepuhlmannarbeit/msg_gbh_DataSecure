'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-processing-lock-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');

const { roots } = require('../plugins/data-secure/server/gateway/common');
const {
  beginBatch,
  processBatchNext,
  acknowledgeDeliveredPackage,
  _test
} = require('../plugins/data-secure/server/gateway/batch');

const { testAsync, done, assert } = createSuite('Batch processing lock integration');

function enteredOrTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('TEST_PUBLISH_BARRIER_NOT_REACHED')), 2000);
    })
  ]).finally(() => clearTimeout(timer));
}

async function main() {
  await testAsync('active and filesystem locks remain held until the item promise settles', async () => {
    const sourceDir = fs.mkdtempSync(path.join(base, 'picker-'));
    const source = path.join(sourceDir, 'processing-lock.txt');
    fs.writeFileSync(source, 'Kunde: Max Mustermann', 'utf8');
    const stat = fs.lstatSync(source);
    const begun = beginBatch({ expectedCount: 1, profile: 'customer', queue: [{ name: path.basename(source), full: source, stat, sourceBytes: stat.size }] });

    let releasePublish;
    let signalPublishEntered;
    const publishEntered = new Promise((resolve) => { signalPublishEntered = resolve; });
    const publishBarrier = new Promise((resolve) => { releasePublish = resolve; });
    let pipelineRuns = 0;
    const deps = {
      convertDocument: async (_logicalName, options) => ({
        markdown: options.inputBuffer.toString('utf8'),
        attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
      }),
      beforePublish: async () => {
        pipelineRuns++;
        signalPublishEntered();
        await publishBarrier;
      }
    };

    const first = processBatchNext(begun.batch_token, deps);
    await enteredOrTimeout(publishEntered);
    assert.strictEqual(fs.existsSync(_test.activeLockPath()), true);
    await assert.rejects(
      () => processBatchNext(begun.batch_token, deps),
      /bereits eine Verarbeitung/u
    );
    assert.strictEqual(fs.existsSync(_test.activeLockPath()), true);

    releasePublish();
    const delivered = await first;
    assert.strictEqual(delivered.delivery_pending, 1, JSON.stringify(delivered));
    assert.strictEqual(pipelineRuns, 1);
    assert.strictEqual(fs.existsSync(_test.activeLockPath()), false);
    acknowledgeDeliveredPackage(begun.batch_token, delivered.package_id);
    fs.unlinkSync(source);
  });

  await testAsync('locks remain held through rejection and are released without leaking the pipeline error', async () => {
    const sourceDir = fs.mkdtempSync(path.join(base, 'picker-'));
    const source = path.join(sourceDir, 'processing-lock-reject.txt');
    fs.writeFileSync(source, 'Kunde: Erika Musterfrau', 'utf8');
    const stat = fs.lstatSync(source);
    const begun = beginBatch({ expectedCount: 1, profile: 'customer', queue: [{ name: path.basename(source), full: source, stat, sourceBytes: stat.size }] });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);

    let releasePublish;
    let signalPublishEntered;
    const publishEntered = new Promise((resolve) => { signalPublishEntered = resolve; });
    const publishBarrier = new Promise((resolve) => { releasePublish = resolve; });
    const privateSentinel = 'Erika Musterfrau C:\\private\\source.txt';
    const deps = {
      convertDocument: async (_logicalName, options) => ({
        markdown: options.inputBuffer.toString('utf8'),
        attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
      }),
      beforePublish: async () => {
        signalPublishEntered();
        await publishBarrier;
        throw new Error(privateSentinel);
      }
    };

    const first = processBatchNext(begun.batch_token, deps);
    await enteredOrTimeout(publishEntered);
    assert.strictEqual(fs.existsSync(_test.activeLockPath()), true);
    await assert.rejects(
      () => processBatchNext(begun.batch_token, deps),
      /bereits eine Verarbeitung/u
    );

    const originalRenameSync = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (path.resolve(to) === path.resolve(stateFile)) {
        const error = new Error('synthetic journal failure');
        error.code = 'EIO';
        throw error;
      }
      return originalRenameSync(from, to);
    };
    try {
      releasePublish();
      await assert.rejects(first, (error) => {
        assert.strictEqual(error.code, 'EIO');
        assert.doesNotMatch(String(error.message), /Erika Musterfrau|private\\source/u);
        return true;
      });
    } finally {
      fs.renameSync = originalRenameSync;
    }

    assert.strictEqual(fs.existsSync(_test.activeLockPath()), false);
    const resumed = await processBatchNext(begun.batch_token, {
      convertDocument: deps.convertDocument
    });
    assert.notStrictEqual(resumed?.message, 'Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  });

  done();
}

main();
