'use strict';

// Deliberately excluded from `npm test`: this local acceptance writes and
// hashes a real 500 MiB private snapshot. Run with
// `npm run test:batch-500mb-local` when the machine has at least 1.1 GiB free.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const temporaryParent = fs.realpathSync(os.tmpdir());
const base = fs.mkdtempSync(path.join(temporaryParent, 'datasecure-500mb-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');

const { LIMITS, roots } = require('../../plugins/data-secure/server/gateway/common');
const {
  beginBatch,
  discardIncompleteBatches,
  _test
} = require('../../plugins/data-secure/server/gateway/batch');
const { installBatchPrivateArtifactCrypto } = require('../lib/private-artifact-test-runtime');
installBatchPrivateArtifactCrypto(_test, _test.batchRoot());

const started = Date.now();
const rssBefore = process.memoryUsage().rss;

try {
  const input = fs.mkdtempSync(path.join(base, 'picker-'));
  const fileBytes = 5 * 1024 * 1024;
  const extensions = ['txt', 'md', 'csv'];
  const sources = [];
  for (let index = 0; index < 100; index++) {
    const source = path.join(
      input,
      `synthetic-${String(index + 1).padStart(3, '0')}.${extensions[index % extensions.length]}`
    );
    fs.writeFileSync(source, Buffer.from('x'));
    fs.truncateSync(source, fileBytes);
    sources.push(source);
  }
  assert.strictEqual(sources.reduce((total, source) => total + fs.statSync(source).size, 0), 500 * 1024 * 1024);

  const queue = sources.map((full) => { const stat = fs.lstatSync(full); return { name: path.basename(full), full, stat, sourceBytes: stat.size }; });
  const result = beginBatch({ expectedCount: 100, profile: 'auto', queue });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.batch_total, 100);
  const state = _test.readState(result.batch_token);
  assert.strictEqual(state.items.reduce((total, item) => total + item.size, 0), LIMITS.MAX_BATCH_TOTAL_BYTES);
  assert.ok(state.items.every((item) => item.size === fileBytes));
  assert.ok(state.items.every((item) => /^[a-f0-9]{64}$/u.test(item.sha256)));
  const privateCopies = state.items.map((item) => path.join(_test.workPath(result.batch_token), item.work_name));
  assert.ok(privateCopies.every((privateCopy) => fs.statSync(privateCopy).size === fileBytes));
  assert.strictEqual(discardIncompleteBatches().discarded_batches, 1);
  assert.ok(privateCopies.every((privateCopy) => fs.existsSync(privateCopy) === false));
  assert.ok(sources.every((source) => fs.statSync(source).size === fileBytes));

  const rssGrowth = Math.max(0, process.memoryUsage().rss - rssBefore);
  assert.ok(rssGrowth < 128 * 1024 * 1024, `unexpected RSS growth: ${rssGrowth}`);
  process.stdout.write(`${JSON.stringify({
    result: 'PASS',
    bytes: LIMITS.MAX_BATCH_TOTAL_BYTES,
    files: 100,
    formats: extensions,
    elapsed_ms: Date.now() - started,
    rss_growth_bytes: rssGrowth,
    source_preserved: true,
    private_snapshot_removed: true
  })}\n`);
} finally {
  const resolved = path.resolve(base);
  const expectedPrefix = `${temporaryParent}${path.sep}datasecure-500mb-`;
  if (!resolved.startsWith(expectedPrefix) || path.dirname(resolved) !== temporaryParent) {
    throw new Error('refusing unsafe temporary acceptance cleanup');
  }
  fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 0 });
}
