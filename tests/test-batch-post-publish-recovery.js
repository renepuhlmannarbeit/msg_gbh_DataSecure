'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-post-publish-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const {
  beginBatch,
  processBatchNext,
  acknowledgeDeliveredPackage,
  _test
} = require('../plugins/data-secure/server/gateway/batch');

const { testAsync, done, assert } = createSuite('Post-publication batch recovery integration');

async function main() {
  await testAsync('journal failure after output commit adopts once without stopped mapping or reprocessing', async () => {
    const sourceDir = fs.mkdtempSync(path.join(base, 'picker-'));
    const source = path.join(sourceDir, 'post-publish-recovery.txt');
    fs.writeFileSync(source, 'Kunde: Max Mustermann', 'utf8');
    const mapping = path.join(roots().exports, 'DataSecure-Mapping.csv');
    const stat = fs.lstatSync(source);
    const begun = beginBatch({ expectedCount: 1, profile: 'customer', queue: [{ name: path.basename(source), full: source, stat, sourceBytes: stat.size }] });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const originalRenameSync = fs.renameSync;
    let injected = false;
    let pipelineRuns = 0;
    const deps = {
      convertDocument: async (source, options = {}) => ({
        markdown: (options.inputBuffer || fs.readFileSync(source)).toString('utf8'),
        attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
      }),
      // Every processBatchNext call receives this same proof hook. A hidden
      // reprocessing during adoption, mapping, or delivery therefore fails the
      // exact-once assertion below instead of remaining invisible to the test.
      beforePublish: async () => { pipelineRuns++; }
    };
    try {
      fs.renameSync = (from, to) => {
        if (!injected && path.resolve(to) === path.resolve(stateFile)) {
          let candidate;
          try { candidate = JSON.parse(fs.readFileSync(from, 'utf8')); } catch { candidate = null; }
          if (candidate?.items?.[0]?.checkpoint === 'mapping_pending') {
            injected = true;
            const error = new Error('synthetic post-publication journal failure');
            error.code = 'EIO';
            throw error;
          }
        }
        return originalRenameSync(from, to);
      };
      const interrupted = await processBatchNext(begun.batch_token, deps);
      assert.strictEqual(injected, true);
      assert.strictEqual(interrupted.error, 'PROCESSING_INTERRUPTED');
      const checkpoint = _test.readState(begun.batch_token).items[0];
      assert.strictEqual(checkpoint.status, 'processing');
      assert.strictEqual(checkpoint.checkpoint, 'package_published');
      assert.strictEqual(Object.hasOwn(checkpoint, 'document_result'), false);
    } finally {
      fs.renameSync = originalRenameSync;
    }

    const adopted = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(adopted.mapping_pending, 1, JSON.stringify(adopted));
    let delivered = await processBatchNext(begun.batch_token, deps);
    if (delivered.mapping_pending === 1) delivered = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(delivered.delivery_pending, 1, JSON.stringify(delivered));
    assert.strictEqual(pipelineRuns, 1);
    const ledger = fs.readFileSync(mapping, 'utf8');
    assert.strictEqual(ledger.split(`"${delivered.package_id}"`).length - 1, 1);
    assert.doesNotMatch(ledger, /sicher gestoppt/u);
    assert.strictEqual(fs.readdirSync(roots().output).filter((name) => name === delivered.package_id).length, 1);
    acknowledgeDeliveredPackage(begun.batch_token, delivered.package_id);
  });

  done();
}

main();
