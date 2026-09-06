'use strict';

// Invoked by the gateway regression with an owned, empty test directory. Each
// product gets a fresh module graph so its real intake channel is selected at
// startup, not changed later by mutating a journal or mocking the privacy gate.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { originalDocument, expectedDocument } = require('./identifier-compatibility');
const directory = path.resolve(process.argv[2]);
const channel = process.argv[3];
assert.ok(['plugin', 'standalone'].includes(channel));
assert.equal(path.basename(directory), `identifier-${channel}`);
assert.ok(fs.lstatSync(directory).isDirectory());
assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
process.env.DATASECURE_PRODUCT_CHANNEL = channel;
process.env.EU_PRIVACY_DATA_ROOT = path.join(directory, 'data');
process.env.EU_PRIVACY_ROOT = path.join(directory, 'privacy');
process.env.LOCALAPPDATA = path.join(directory, 'localapp');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(directory, 'results');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const batch = require('../../plugins/data-secure/server/gateway/batch');
const { readOutput } = require('../../plugins/data-secure/server/gateway/package-store');
const source = path.join(directory, 'synthetic.txt');
fs.writeFileSync(source, originalDocument, { flag: 'wx' });
const stat = fs.lstatSync(source);
const digest = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

(async () => {
  const begun = batch.beginBatch({ expectedCount: 1, profile: 'general',
    queue: [{ name: 'synthetic.txt', full: source, stat, sourceBytes: stat.size }] });
  assert.equal(batch._test.readState(begun.batch_token).product_channel, channel);
  let verified = 0;
  const result = await batch.processBatchNext(begun.batch_token, { beforePublish(release) {
    assert.equal(release.reviewed_content_sha256, digest(expectedDocument));
    verified++;
  } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(verified, 1);
  const released = readOutput(result.package_id, result.read_capability, 0, 30000).text;
  assert.ok(released.includes('-->\n\n'));
  assert.equal(released.slice(released.indexOf('-->\n\n') + 5).trimEnd(), expectedDocument);
  assert.deepEqual(fs.readFileSync(source), Buffer.from(originalDocument));
  assert.equal(fs.lstatSync(source).ino, stat.ino);
  batch.acknowledgeDeliveredPackage(begun.batch_token, result.package_id);
  process.stdout.write(`IDENTIFIER PRODUCT ${channel}: PASS\n`);
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
