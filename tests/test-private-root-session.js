'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Verified private root session');

test('cached roots avoid repeated ancestor walks but reject a same-path replacement', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-root-session-'));
  const previousRoot = process.env.EU_PRIVACY_ROOT;
  const previousDataRoot = process.env.EU_PRIVACY_DATA_ROOT;
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'runtime');
  const commonPath = require.resolve('../plugins/data-secure/server/gateway/common');
  delete require.cache[commonPath];
  const common = require(commonPath);
  try {
    const first = common.roots();
    const { assertRootSeparation } = require('../plugins/data-secure/server/gateway/root-boundary');
    let separationCalls = 0;
    let cachedCalls = 0;
    let count = 'separation';
    const originalLstat = fs.lstatSync;
    fs.lstatSync = (...args) => {
      if (count === 'separation') separationCalls++;
      else cachedCalls++;
      return originalLstat(...args);
    };
    try {
      assertRootSeparation();
      count = 'cached';
      assert.strictEqual(common.roots(), first);
    }
    finally { fs.lstatSync = originalLstat; }
    // The mandatory root-separation check has host-path-dependent work. Only
    // the cached private-root overhead should be bounded by returned roots,
    // rather than a fixed total lstat count tied to local path depth.
    assert.ok(cachedCalls <= separationCalls + Object.keys(first).length + 2,
      `cached verification unexpectedly walked ancestors (${cachedCalls} versus ${separationCalls} separation lstat calls)`);

    const disposable = path.join(first.output, 'Dokument_20260906_120000_anonymisiert');
    fs.mkdirSync(disposable);
    fs.writeFileSync(path.join(disposable, 'document.md'), '# anonymisiert\n');
    const retention = require('../plugins/data-secure/server/gateway/retention');
    const purged = retention.purgeLocalData('output', true, {
      roots: first,
      includeMarkdownArtifacts: false
    });
    assert.strictEqual(purged.removed.output, 1);
    assert.strictEqual(fs.existsSync(disposable), false);
    assert.strictEqual(common.roots(), first,
      'a confirmed child purge must not invalidate or recreate verified root identities');

    const moved = `${first.output}.saved`;
    fs.renameSync(first.output, moved);
    fs.mkdirSync(first.output);
    assert.throws(() => common.roots(), /PRIVACY_STORAGE_UNSAFE/u);
    fs.rmdirSync(first.output);
    fs.renameSync(moved, first.output);
  } finally {
    if (previousRoot === undefined) delete process.env.EU_PRIVACY_ROOT;
    else process.env.EU_PRIVACY_ROOT = previousRoot;
    if (previousDataRoot === undefined) delete process.env.EU_PRIVACY_DATA_ROOT;
    else process.env.EU_PRIVACY_DATA_ROOT = previousDataRoot;
    fs.rmSync(base, { recursive: true, force: true });
  }
});

done();
