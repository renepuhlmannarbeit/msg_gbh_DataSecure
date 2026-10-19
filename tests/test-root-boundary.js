'use strict';

// Real filesystem/configuration tests. Fault injection below replaces only one
// failing I/O operation; actual reservation files and descriptors remain real.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Hosted Windows runners may expose TMP through a junction or differently
// cased alias. Root policy deliberately refuses those aliases; construct the
// synthetic fixture under its physical path so the test exercises separation.
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-root-boundary-')));
const keys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT'];
const saved = new Map(keys.map(key => [key, process.env[key]]));
const boundary = require('../plugins/data-secure/server/gateway/root-boundary');
const privacy = require('../plugins/data-secure/server/gateway/privacy-config');
const result = require('../plugins/data-secure/server/gateway/result-folder-config');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const reservations = require('../plugins/data-secure/server/gateway/root-reservations');
let passed = 0;

function fixture() {
  const scope = fs.mkdtempSync(path.join(base, 'case-'));
  for (const key of keys) delete process.env[key];
  const item = { scope, data: path.join(scope, 'internal'), private: path.join(scope, 'private'), visible: path.join(scope, 'visible') };
  process.env.EU_PRIVACY_DATA_ROOT = item.data;
  fs.mkdirSync(item.visible);
  return item;
}
function configBytes(api) { return fs.readFileSync(api.configPath()); }
function blocked(action) { assert.throws(action, error => error.code === 'PRIVACY_STORAGE_UNSAFE' && !error.message.includes(base)); }
function test(name, action) { action(fixture()); passed++; console.log(`  ok ${name}`); }
function rawResult(root, schema = result.SCHEMA) {
  fs.mkdirSync(path.dirname(result.configPath()), { recursive: true });
  fs.writeFileSync(result.configPath(), JSON.stringify({ schema, root, identity: {}, notices: { sync: false, network: false } }));
}
function rawPrivacy(root) {
  fs.mkdirSync(path.dirname(privacy.configPath()), { recursive: true });
  fs.writeFileSync(privacy.configPath(), JSON.stringify({ version: 1, root }));
}
function removeFixtureTree(target) {
  const relative = path.relative(base, target);
  assert.ok(target === base || (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)));
  const stat = fs.lstatSync(target);
  // Never traverse a link/junction, even in a test-only tree.
  if (stat.isSymbolicLink() || stat.isFile()) { fs.unlinkSync(target); return; }
  assert.ok(stat.isDirectory());
  for (const name of fs.readdirSync(target)) removeFixtureTree(path.join(target, name));
  fs.rmdirSync(target);
}
function fixedStorageFailure(action) {
  assert.throws(action, error => {
    assert.strictEqual(error.code, 'PRIVACY_STORAGE_UNSAFE');
    assert.strictEqual(error.message, 'PRIVACY_STORAGE_UNSAFE');
    assert.strictEqual(Object.hasOwn(error, 'cause'), false);
    assert.doesNotMatch(`${error.stack}\n${JSON.stringify(error)}`, /NATIVE_PRIVATE_DETAIL/u);
    return true;
  });
}
function withTargetFailure(target, operation, code, action) {
  const comparable = value => ['win32', 'darwin'].includes(process.platform) ? path.resolve(value).toLowerCase() : path.resolve(value);
  const requested = comparable(target);
  const original = operation === 'realpath' ? fs.realpathSync.native : fs[operation];
  let calls = 0;
  const failing = (value, ...args) => {
    if (typeof value === 'string' && comparable(value) === requested) {
      calls++;
      throw Object.assign(new Error(`NATIVE_PRIVATE_DETAIL ${target}`), { code });
    }
    return original(value, ...args);
  };
  if (operation === 'realpath') fs.realpathSync.native = failing;
  else fs[operation] = failing;
  try { return action(() => calls); }
  finally {
    if (operation === 'realpath') fs.realpathSync.native = original;
    else fs[operation] = original;
  }
}
function assertStartupPreflight() {
  // The real shared bootstrap and root gate; later phases only record order.
  // No engine, maintenance process or native macOS permission is simulated.
  const { initializeProduct } = require('../plugins/data-secure/server/core/product-bootstrap');
  const phases = ['verifyBundledRuntime', 'ensureDurableRuntime', 'migrateLegacyAuditReceipts',
    'openBatchPackageProtection', 'cleanupLocalData', 'cleanupUiJobs', 'recoverBatches',
    'replayMappingOutbox', 'startBatchMaintenance', 'migrateLegacyInput', 'cleanupAbandonedWorkingJobs'];
  const calls = [];
  const deps = Object.fromEntries(phases.map(name => [name, () => {
    calls.push(name);
    return { failures: 0, active: false, ids: [], complete: true, stop() {} };
  }]));
  deps.assertRootSeparation = () => { boundary.assertRootSeparation(); calls.push('separation'); };
  deps.cleanupExpiredBatchSnapshots = () => {};
  deps.refuseStartup = () => { assert.fail('a retired destination cannot refuse safe startup'); };
  initializeProduct(deps);
  assert.deepStrictEqual(calls, ['separation', ...phases], 'no recovery or cleanup phase may be skipped');
}

try {
  for (const code of ['EACCES', 'EPERM']) for (const phase of ['second_preflight', 'later_bootstrap']) {
    test(`actual standalone refusal adapter preserves ${code} from ${phase} without fabricating Ready`, f => {
      result.saveConfiguredResultRoot(f.visible);
      boundary.assertRootSeparation(); // actual first Standalone preflight
      const serviceSource = fs.readFileSync(require.resolve('../plugins/data-secure/server/standalone/application-service'), 'utf8');
      const start = serviceSource.indexOf('refuseStartup: (error) => {');
      const end = serviceSource.indexOf('\n          }', start);
      assert.ok(start >= 0 && end > start);
      // Run the actual adapter function bytes, not a hand-copied wrapper. The
      // diagnostic writer alone is replaced to keep this test write-free after
      // refusal. This is a source adapter / real filesystem countercase, not
      // native macOS TCC evidence.
      let refusalCount = 0, originalError;
      const refuse = require('node:vm').runInNewContext(`(${serviceSource.slice(start, end).replace('refuseStartup: ', '')}\n})`, {
        refuseStartup(error) { assert.equal(error, originalError); refusalCount++; return { code: 'UNSAFE_STORAGE_LOCATION' }; },
        rootSeparationFailure: boundary.rootSeparationFailure,
        ownershipErrorCode: () => null,
        fixedFailure: (value, message) => Object.assign(Error(message), { code: value })
      });
      const phases = ['verifyBundledRuntime', 'ensureDurableRuntime', 'migrateLegacyAuditReceipts',
        'openBatchPackageProtection', 'cleanupLocalData', 'cleanupUiJobs', 'recoverBatches',
        'replayMappingOutbox', 'startBatchMaintenance', 'cleanupExpiredBatchSnapshots',
        'migrateLegacyInput', 'cleanupAbandonedWorkingJobs'];
      const later = [];
      const deps = Object.fromEntries(phases.map(name => [name, () => {
        later.push(name); return { failures: 0, active: false, ids: [], complete: true, stop() {} };
      }]));
      const denied = () => withTargetFailure(f.visible, 'lstatSync', code, () => {
        try { boundary.assertRootSeparation(); } catch (error) { originalError = error; throw error; }
      });
      deps.assertRootSeparation = phase === 'second_preflight' ? denied : boundary.assertRootSeparation;
      if (phase === 'later_bootstrap') deps.cleanupLocalData = denied;
      deps.refuseStartup = refuse;
      assert.throws(() => require('../plugins/data-secure/server/core/product-bootstrap').initializeProduct(deps), error => {
        assert.equal(error, originalError);
        assert.equal(boundary.rootSeparationFailure(error), 'active_public_access_denied');
        assert.equal(error.code, 'PRIVACY_STORAGE_UNSAFE');
        return true;
      });
      assert.equal(refusalCount, 1);
      assert.ok(!later.includes('recoverBatches'), 'no recovery or successful Ready may follow the refusal');
    });
  }
  test('result destination status distinguishes first installation, lost target and replacement', f => {
    assert.deepStrictEqual(result.readConfiguredResultRootStatus(), {
      status: 'unconfigured', root: '', recorded_root: ''
    });
    assert.strictEqual(fs.existsSync(f.data), false, 'status reads never create a first-install setting');
    result.saveConfiguredResultRoot(f.visible);
    assert.deepStrictEqual(result.readConfiguredResultRootStatus(), {
      status: 'available', root: f.visible, recorded_root: f.visible
    });
    const savedConfiguration = configBytes(result);
    const moved = path.join(f.scope, 'temporarily-unmounted');
    fs.renameSync(f.visible, moved);
    assert.deepStrictEqual(result.readConfiguredResultRootStatus(), {
      status: 'unavailable', root: '', recorded_root: f.visible
    });
    assert.strictEqual(result.readConfiguredResultRoot(), '', 'display-only paths never become usable targets');
    assert.strictEqual(fs.existsSync(f.visible), false, 'a status read must not recreate a lost destination');
    fs.mkdirSync(f.visible);
    assert.deepStrictEqual(result.readConfiguredResultRootStatus(), {
      status: 'unavailable', root: '', recorded_root: f.visible
    });
    assert.deepStrictEqual(configBytes(result), savedConfiguration, 'unavailable reads never replace the original identity');
    fs.renameSync(f.visible, path.join(f.scope, 'replacement'));
    fs.renameSync(moved, f.visible);
    assert.strictEqual(result.readConfiguredResultRootStatus().status, 'available', 'the original target can recover without a new choice');
  });
  test('an explicit missing environment destination is unavailable, never a first installation', f => {
    const missing = path.join(f.scope, 'offline-target');
    process.env.EU_PRIVACY_RESULT_ROOT = missing;
    assert.deepStrictEqual(result.readConfiguredResultRootStatus(), {
      status: 'unavailable', root: '', recorded_root: missing
    });
    assert.strictEqual(fs.existsSync(missing), false);
    assert.strictEqual(fs.existsSync(f.data), false);
  });
  test('separate roots persist, resolve and reset without changing published output', f => {
    privacy.saveConfiguredPrivacyRoot(f.private);
    result.saveConfiguredResultRoot(f.visible);
    assert.strictEqual(privacy.readConfiguredPrivacyRoot(), f.private);
    assert.strictEqual(result.readConfiguredResultRoot(), f.visible);
    const privateRoots = roots();
    assert.ok(fs.statSync(privateRoots.exports).isDirectory());
    const output = result.resultOutputDirectory();
    fs.writeFileSync(path.join(output, 'released.md'), '# synthetic');
    privacy.clearConfiguredPrivacyRoot();
    assert.strictEqual(roots().root, path.join(f.data, 'workspace'));
    result.clearConfiguredResultRoot();
    assert.strictEqual(result.readConfiguredResultRoot(), '');
    assert.strictEqual(fs.readFileSync(path.join(output, 'released.md'), 'utf8'), '# synthetic');
  });
  test('privacy selection rejects equal, ancestor and descendant of recorded results before saving', f => {
    privacy.saveConfiguredPrivacyRoot(f.private);
    result.saveConfiguredResultRoot(f.visible);
    const before = configBytes(privacy);
    for (const selected of [f.visible, f.scope, path.join(f.visible, 'DataSecure-Output', 'future-private')]) {
      blocked(() => privacy.saveConfiguredPrivacyRoot(selected));
      assert.deepStrictEqual(configBytes(privacy), before);
    }
    assert.deepStrictEqual(fs.readdirSync(f.visible), []);
  });
  test('result selection rejects the private workspace and the separate internal journal root', f => {
    privacy.saveConfiguredPrivacyRoot(f.private);
    fs.mkdirSync(f.private);
    result.saveConfiguredResultRoot(f.visible);
    const before = configBytes(result);
    for (const selected of [f.data, f.private, f.scope, path.join(f.data, 'settings'), path.join(f.private, 'future-result')]) {
      if (!fs.existsSync(selected)) fs.mkdirSync(selected);
      blocked(() => result.saveConfiguredResultRoot(selected));
      blocked(() => result.resultOutputDirectory({ root: selected }));
      assert.deepStrictEqual(configBytes(result), before);
      assert.strictEqual(fs.existsSync(path.join(selected, 'DataSecure-Output')), false);
    }
  });
  test('nonexistent environment destinations cannot bypass the private selection gate', f => {
    process.env.EU_PRIVACY_RESULT_ROOT = path.join(f.scope, 'future-visible');
    const selected = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'private');
    blocked(() => privacy.saveConfiguredPrivacyRoot(selected));
    assert.strictEqual(fs.existsSync(f.data), false);
    assert.strictEqual(fs.existsSync(selected), false);
  });
  test('environment private and data root overrides remain protected even when selection is saved', f => {
    process.env.EU_PRIVACY_ROOT = f.private;
    fs.mkdirSync(f.private);
    blocked(() => result.saveConfiguredResultRoot(f.private));
    assert.strictEqual(fs.existsSync(f.data), false);
    process.env.EU_PRIVACY_DATA_ROOT = path.join(f.visible, 'private-data');
    blocked(() => result.saveConfiguredResultRoot(f.visible));
    assert.strictEqual(fs.existsSync(process.env.EU_PRIVACY_DATA_ROOT), false);
  });
  test('persisted collisions stop root creation and result resolution, including legacy records', f => {
    for (const schema of [result.SCHEMA, result.LEGACY_SCHEMA]) {
      rawPrivacy(path.join(f.visible, 'private'));
      rawResult(f.visible, schema);
      blocked(() => roots());
      blocked(() => result.readConfiguredResultRoot());
      assert.strictEqual(fs.existsSync(path.join(f.visible, 'private')), false);
    }
  });
  test('existing cached private roots do not bypass a newly colliding result override', f => {
    process.env.EU_PRIVACY_ROOT = f.private;
    roots();
    process.env.EU_PRIVACY_RESULT_ROOT = f.private;
    blocked(() => roots());
    blocked(() => result.resultOutputDirectory());
    assert.strictEqual(fs.existsSync(path.join(f.private, 'DataSecure-Output')), false);
  });
  test('reset checks the prospective default and does not delete configuration on failure', f => {
    privacy.saveConfiguredPrivacyRoot(f.private);
    const before = configBytes(privacy);
    rawResult(path.join(f.data, 'workspace', 'results'));
    blocked(() => privacy.clearConfiguredPrivacyRoot());
    assert.deepStrictEqual(configBytes(privacy), before);
    process.env.EU_PRIVACY_RESULT_ROOT = f.data;
    const resultBefore = configBytes(result);
    blocked(() => result.clearConfiguredResultRoot());
    assert.deepStrictEqual(configBytes(result), resultBefore);
  });
  test('a replaced or missing recorded destination remains protected from private writes', f => {
    result.saveConfiguredResultRoot(f.visible);
    fs.renameSync(f.visible, path.join(f.scope, 'moved-results'));
    blocked(() => privacy.saveConfiguredPrivacyRoot(path.join(f.visible, 'new-private')));
    assert.strictEqual(fs.existsSync(f.visible), false);
  });
  test('canonical dot segments and segment boundaries are handled without string-prefix errors', f => {
    assert.strictEqual(boundary.pathsOverlap(f.visible, path.join(f.visible, 'one', '..', 'two')), true);
    assert.strictEqual(boundary.pathsOverlap(f.visible, `${f.visible}-private`), false);
    assert.strictEqual(boundary.pathsOverlap(f.visible, path.join(f.scope, 'private')), false);
    if (['win32', 'darwin'].includes(process.platform)) {
      assert.strictEqual(boundary.pathsOverlap(f.visible.toUpperCase(), path.join(f.visible, 'NEW')), true);
    }
  });
  test('relative, blank or missing configuration arguments never become the working directory', f => {
    for (const selected of ['', 'relative', undefined]) {
      assert.throws(() => privacy.saveConfiguredPrivacyRoot(selected), /PRIVACY_CONFIG_UNSAFE/u);
      assert.throws(() => result.saveConfiguredResultRoot(selected), /RESULT_ROOT_UNSAFE/u);
    }
    assert.strictEqual(fs.existsSync(f.data), false);
  });
  test('consuming absent result notices is read-only and never initializes first-install settings', f => {
    assert.deepStrictEqual(result.consumeConfiguredResultNotices(), { sync: false, network: false });
    assert.strictEqual(fs.existsSync(f.data), false);
  });
  test('real junction/symlink aliases cannot hide an overlap in either direction', f => {
    const alias = path.join(f.scope, 'alias');
    fs.symlinkSync(f.visible, alias, process.platform === 'win32' ? 'junction' : 'dir');
    result.saveConfiguredResultRoot(f.visible);
    assert.strictEqual(boundary.pathsOverlap(alias, path.join(f.visible, 'future')), true);
    blocked(() => privacy.saveConfiguredPrivacyRoot(path.join(alias, 'private')));
    process.env.EU_PRIVACY_ROOT = alias;
    blocked(() => boundary.assertRootSeparation({ resultRoot: f.visible }));
  });
  test('redirected settings and malformed records fail closed without creating private outputs', f => {
    const outside = path.join(f.scope, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(f.data);
    fs.symlinkSync(outside, path.join(f.data, 'settings'), process.platform === 'win32' ? 'junction' : 'dir');
    blocked(() => privacy.saveConfiguredPrivacyRoot(f.private));
    assert.deepStrictEqual(fs.readdirSync(outside), []);
    fs.unlinkSync(path.join(f.data, 'settings'));
    fs.mkdirSync(path.join(f.data, 'settings'));
    fs.writeFileSync(result.configPath(), '{broken');
    blocked(() => roots());
    assert.strictEqual(fs.existsSync(path.join(f.data, 'workspace')), false);
  });
  test('read-only child process rejects persisted collision without inheriting the parent cache', f => {
    rawPrivacy(path.join(f.visible, 'private'));
    rawResult(f.visible);
    const code = `try { require(${JSON.stringify(require.resolve('../plugins/data-secure/server/gateway/common'))}).roots(); process.exitCode=2; } catch(error) { if(error.code!=='PRIVACY_STORAGE_UNSAFE') process.exitCode=3; }`;
    const child = spawnSync(process.execPath, ['-e', code], { env: { ...process.env }, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(child.status, 0, child.stderr);
    assert.strictEqual(fs.existsSync(path.join(f.visible, 'private')), false);
  });
  test('real MCP startup with a data/result overlap writes no cache, journal or refusal marker', f => {
    process.env.EU_PRIVACY_DATA_ROOT = path.join(f.visible, 'internal');
    process.env.EU_PRIVACY_RESULT_ROOT = f.visible;
    const entry = require.resolve('../plugins/data-secure/server/index');
    const child = spawnSync(process.execPath, [entry], { env: { ...process.env }, input: '', encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(child.status, 1, child.stderr);
    assert.strictEqual(child.stdout, '');
    assert.match(child.stderr, /^DataSecure-Start verweigert: UNSAFE_STORAGE_LOCATION /u);
    assert.strictEqual(child.stderr.trim().split(/\r?\n/u).length, 1);
    assert.ok(!child.stderr.includes(f.scope));
    assert.deepStrictEqual(fs.readdirSync(f.visible), [], 'even diagnostics cannot create a private child in the public root');
  });
  test('a legacy collision cannot be erased by an ordinary reset that forgets its public root', f => {
    rawPrivacy(path.join(f.visible, 'private'));
    rawResult(f.visible);
    const oldResult = path.join(f.visible, 'existing.md');
    fs.writeFileSync(oldResult, '# keep');
    blocked(() => result.clearConfiguredResultRoot());
    assert.strictEqual(fs.existsSync(result.configPath()), true);
    assert.strictEqual(fs.existsSync(reservations.directory(f.data)), false,
      'an invalid legacy configuration must not become an unrepairable contradictory reservation history');
    assert.strictEqual(fs.readFileSync(oldResult, 'utf8'), '# keep');
    assert.strictEqual(fs.existsSync(path.join(f.visible, 'private')), false);
    // Simulate an explicitly supervised OFFLINE correction after stopping all
    // processes and disconnecting the wrong host share. Only these known
    // configuration files change; no result or private document is moved.
    fs.unlinkSync(result.configPath());
    rawPrivacy(f.private);
    result.saveConfiguredResultRoot(f.visible);
    assert.strictEqual(result.readConfiguredResultRoot(), f.visible);
    assert.strictEqual(fs.readFileSync(oldResult, 'utf8'), '# keep');
  });
  test('earlier result roots stay reserved after a different selection and after reset', f => {
    result.saveConfiguredResultRoot(f.visible);
    const next = path.join(f.scope, 'next-visible');
    fs.mkdirSync(next);
    result.saveConfiguredResultRoot(next);
    result.clearConfiguredResultRoot();
    for (const selected of [f.visible, next, path.join(f.visible, 'private'), f.scope]) blocked(() => privacy.saveConfiguredPrivacyRoot(selected));
    assert.strictEqual(result.readConfiguredResultRoot(), '');
  });
  test('earlier private roots stay reserved after changing them and after resetting to default', f => {
    privacy.saveConfiguredPrivacyRoot(f.private);
    const next = path.join(f.scope, 'next-private');
    fs.mkdirSync(f.private); fs.mkdirSync(next);
    privacy.saveConfiguredPrivacyRoot(next);
    privacy.clearConfiguredPrivacyRoot();
    for (const selected of [f.private, next, f.data, f.scope]) blocked(() => result.saveConfiguredResultRoot(selected));
  });
  for (const code of ['EACCES', 'EPERM']) {
    for (const operation of ['lstatSync', 'realpath']) {
      test(`retired public root ${operation} ${code} cannot block startup, status or a safe selection`, f => {
        result.saveConfiguredResultRoot(f.visible);
        const next = path.join(f.scope, 'next-visible'), newest = path.join(f.scope, 'newest-visible');
        fs.mkdirSync(next); fs.mkdirSync(newest);
        result.saveConfiguredResultRoot(next);
        const directory = reservations.directory(f.data);
        const before = new Map(fs.readdirSync(directory).map(name => [name, fs.readFileSync(path.join(directory, name))]));
        withTargetFailure(f.visible, operation, code, calls => {
          assertStartupPreflight();
          assert.strictEqual(result.readConfiguredResultRoot(), next);
          assert.ok(fs.statSync(roots().output).isDirectory());
          result.resultOutputDirectory();
          result.saveConfiguredResultRoot(newest);
          assert.strictEqual(result.readConfiguredResultRoot(), newest);
          result.clearConfiguredResultRoot();
          assert.strictEqual(result.readConfiguredResultRootStatus().status, 'unconfigured');
          assert.strictEqual(calls(), 0, 'historical target paths must not be touched, not merely caught');
          fixedStorageFailure(() => boundary.assertRootSeparation({ resultRoot: f.visible }));
          assert.throws(() => result.resultOutputDirectory({ root: f.visible }), error => error.code === code,
            'a reservation never authorizes an export into its inaccessible target');
          assert.ok(calls() > 0, 'an explicitly reused destination still requires fresh canonicalization');
        });
        for (const [name, bytes] of before) assert.deepStrictEqual(fs.readFileSync(path.join(directory, name)), bytes,
          'safe transitions preserve existing reservation bytes and filenames');
        for (const selected of [f.visible, path.join(f.visible, 'private'), f.scope]) blocked(() => privacy.saveConfiguredPrivacyRoot(selected));
      });
      test(`retired private root ${operation} ${code} remains a boundary without blocking safe private roots`, f => {
        fs.mkdirSync(f.private);
        privacy.saveConfiguredPrivacyRoot(f.private);
        const next = path.join(f.scope, 'next-private');
        privacy.saveConfiguredPrivacyRoot(next);
        result.saveConfiguredResultRoot(f.visible);
        withTargetFailure(f.private, operation, code, calls => {
          assertStartupPreflight();
          assert.strictEqual(roots().root, next);
          assert.strictEqual(result.readConfiguredResultRoot(), f.visible);
          privacy.clearConfiguredPrivacyRoot();
          assert.strictEqual(roots().root, path.join(f.data, 'workspace'));
          assert.strictEqual(calls(), 0);
          fixedStorageFailure(() => boundary.assertRootSeparation({ privacyRoot: f.private }));
          assert.ok(calls() > 0, 'a historical private reservation cannot authorize its live reuse');
        });
        blocked(() => result.saveConfiguredResultRoot(f.private));
      });
      for (const kind of ['private', 'public']) {
        test(`active ${kind} root ${operation} ${code} still refuses reads, writes and replacement`, f => {
          fs.mkdirSync(f.private);
          privacy.saveConfiguredPrivacyRoot(f.private);
          result.saveConfiguredResultRoot(f.visible);
          const target = kind === 'private' ? f.private : f.visible;
          const next = path.join(f.scope, 'next-visible'); fs.mkdirSync(next);
          const privacyBefore = configBytes(privacy), resultBefore = configBytes(result);
          withTargetFailure(target, operation, code, calls => {
            let actualFailure;
            try { boundary.assertRootSeparation(); } catch (error) { actualFailure = error; }
            assert.ok(actualFailure);
            assert.strictEqual(boundary.rootSeparationFailure(actualFailure), kind === 'public' ? 'active_public_access_denied' : 'unsafe_or_unconfirmed');
            assert.strictEqual(boundary.rootSeparationFailure(Object.assign(Error(actualFailure.message), actualFailure)), 'unsafe_or_unconfirmed',
              'a copied code/property bag cannot impersonate our actual canonical failure');
            fixedStorageFailure(() => boundary.assertRootSeparation());
            fixedStorageFailure(() => roots());
            fixedStorageFailure(() => result.readConfiguredResultRootStatus());
            fixedStorageFailure(() => result.saveConfiguredResultRoot(next));
            fixedStorageFailure(() => privacy.clearConfiguredPrivacyRoot());
            fixedStorageFailure(() => result.clearConfiguredResultRoot());
            assert.ok(calls() >= 6, 'a reservation never substitutes for active-root I/O');
          });
          assert.deepStrictEqual(configBytes(privacy), privacyBefore);
          assert.deepStrictEqual(configBytes(result), resultBefore);
          assert.strictEqual(fs.existsSync(path.join(f.private, 'Output')), false);
          assert.strictEqual(fs.existsSync(path.join(next, 'DataSecure-Output')), false);
        });
      }
    }
  }
  for (const code of ['EIO', 'ENOTDIR']) {
    test(`public-root ${code} is not misclassified as a proven access refusal`, f => {
      result.saveConfiguredResultRoot(f.visible);
      withTargetFailure(f.visible, 'lstatSync', code, () => {
        let failure; try { boundary.assertRootSeparation(); } catch (error) { failure = error; }
        assert.ok(failure); assert.strictEqual(boundary.rootSeparationFailure(failure), 'unsafe_or_unconfirmed');
      });
    });
  }
  for (const code of ['EACCES', 'EPERM']) {
    for (const operation of ['lstatSync', 'realpath']) {
      for (const redirection of ['leaf', 'ancestor']) {
        test(`a current public ${redirection} alias hidden by ${operation} ${code} cannot borrow its old reservation for Ready`, f => {
          const workspace = path.join(f.data, 'workspace');
          fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
          const publicParent = path.join(f.scope, 'public-parent');
          if (redirection === 'ancestor') fs.mkdirSync(publicParent);
          const selected = redirection === 'leaf' ? f.visible : path.join(publicParent, 'results');
          if (redirection === 'ancestor') fs.mkdirSync(selected);
          result.saveConfiguredResultRoot(selected);
          const reserved = boundary.canonicalPath(selected), before = configBytes(result);
          assert.ok(reservations.readReservations(f.data).some(record => record.kind === 'public' && record.root === reserved),
            'the counterexample has the exact valid canonical reservation, not a missing/legacy record');
          if (redirection === 'ancestor') fs.mkdirSync(path.join(workspace, 'results'));
          fs.renameSync(redirection === 'leaf' ? selected : publicParent, path.join(f.scope, 'original-public'));
          fs.symlinkSync(workspace, redirection === 'leaf' ? selected : publicParent, process.platform === 'win32' ? 'junction' : 'dir');
          assert.strictEqual(boundary.pathsOverlap(workspace, selected), true,
            'the actual current result path is demonstrably inside the active private tree');
          const next = path.join(f.scope, 'new-public'); fs.mkdirSync(next);
          withTargetFailure(selected, operation, code, calls => {
            // A history-only projection passes, even though the actual active A
            // is now private. This is a countermodel, NOT permission to reset:
            // reserveRootSeparation must still validate current and next roots.
            assert.strictEqual(boundary.assertRootSeparation({ resetResult: true }), true);
            fixedStorageFailure(() => boundary.assertRootSeparation());
            fixedStorageFailure(() => roots());
            fixedStorageFailure(() => result.readConfiguredResultRootStatus());
            fixedStorageFailure(() => result.saveConfiguredResultRoot(next));
            assert.ok(calls() >= 4);
          });
          const worker = `
            const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
            const [target,operation,code,home]=process.argv.slice(1);
            const comparable=value=>['win32','darwin'].includes(process.platform)?path.resolve(value).toLowerCase():path.resolve(value);
            const original=operation==='realpath'?fs.realpathSync.native:fs[operation];
            const failing=(value,...args)=>{if(typeof value==='string'&&comparable(value)===comparable(target))throw Object.assign(Error('NATIVE_PRIVATE_DETAIL'),{code});return original(value,...args)};
            if(operation==='realpath')fs.realpathSync.native=failing;else fs[operation]=failing;
            const {StandaloneApplicationService}=require(${JSON.stringify(require.resolve('../plugins/data-secure/server/standalone/application-service'))});
            const phases=[];let service,error;
            try { service=new StandaloneApplicationService({home,dataRoot:process.env.EU_PRIVACY_DATA_ROOT,startupDiagnostic:event=>phases.push(event)}); }
            catch(caught){error=caught;}
            finally { service?.startup?.batchMaintenance?.stop();if(operation==='realpath')fs.realpathSync.native=original;else fs[operation]=original; }
            assert.equal(error?.code,'PRIVACY_STORAGE_UNSAFE','unknown active aliases must not become service Ready');
            assert.equal(error?.message,'PRIVACY_STORAGE_UNSAFE');
            assert.equal(phases.includes('product_bootstrap_finished'),false);
          `;
          const child = spawnSync(process.execPath, ['-e', worker, selected, operation, code, f.scope], {
            env: { ...process.env }, encoding: 'utf8', timeout: 30000, windowsHide: true
          });
          assert.ifError(child.error);
          assert.strictEqual(child.status, 0, child.stderr);
          assert.deepStrictEqual(configBytes(result), before);
          assert.strictEqual(fs.existsSync(path.join(workspace, 'Output')), false, 'no private processing tree before separation');
          assert.strictEqual(fs.existsSync(path.join(f.data, 'batches')), false, 'no recovery journal writes before separation');
          assert.strictEqual(fs.existsSync(path.join(next, 'DataSecure-Output')), false);
        });
      }
    }
  }
  test('a retired public name redirected to private storage remains a negative role boundary', f => {
    fs.mkdirSync(f.private); privacy.saveConfiguredPrivacyRoot(f.private);
    result.saveConfiguredResultRoot(f.visible);
    const next = path.join(f.scope, 'next-visible'); fs.mkdirSync(next);
    result.saveConfiguredResultRoot(next);
    fs.renameSync(f.visible, path.join(f.scope, 'original-visible'));
    fs.symlinkSync(f.private, f.visible, process.platform === 'win32' ? 'junction' : 'dir');
    assertStartupPreflight();
    assert.strictEqual(roots().root, f.private);
    const before = configBytes(privacy);
    for (const selected of [f.visible, path.join(f.visible, 'new-private')]) {
      fixedStorageFailure(() => boundary.assertRootSeparation({ privacyRoot: selected }));
      fixedStorageFailure(() => privacy.saveConfiguredPrivacyRoot(selected));
    }
    fixedStorageFailure(() => boundary.assertRootSeparation({ resultRoot: f.visible }));
    assert.throws(() => result.resultOutputDirectory({ root: f.visible }), /RESULT_ROOT_UNSAFE/u);
    assert.deepStrictEqual(configBytes(privacy), before);
    assert.strictEqual(fs.existsSync(path.join(f.private, 'DataSecure-Output')), false);
  });
  test('a retired private name redirected to public storage cannot become a public destination', f => {
    fs.mkdirSync(f.private); privacy.saveConfiguredPrivacyRoot(f.private);
    const next = path.join(f.scope, 'next-private'); privacy.saveConfiguredPrivacyRoot(next);
    result.saveConfiguredResultRoot(f.visible);
    fs.renameSync(f.private, path.join(f.scope, 'original-private'));
    fs.symlinkSync(f.visible, f.private, process.platform === 'win32' ? 'junction' : 'dir');
    assertStartupPreflight();
    fixedStorageFailure(() => boundary.assertRootSeparation({ resultRoot: f.private }));
    assert.throws(() => result.resultOutputDirectory({ root: f.private }), /RESULT_ROOT_UNSAFE/u);
    assert.strictEqual(fs.existsSync(path.join(f.visible, 'DataSecure-Output')), false);
  });
  test('fresh aliases still resolve against historical public boundaries after selection and reset', f => {
    result.saveConfiguredResultRoot(f.visible); result.clearConfiguredResultRoot();
    const alias = path.join(f.scope, 'fresh-alias');
    fs.symlinkSync(f.visible, alias, process.platform === 'win32' ? 'junction' : 'dir');
    for (const selected of [alias, path.join(alias, 'new-private')]) blocked(() => privacy.saveConfiguredPrivacyRoot(selected));
    assert.strictEqual(fs.existsSync(path.join(f.visible, 'new-private')), false);
  });
  test('legacy schema-1 normalized reservation spellings stay immutable and retain role protection', f => {
    const spelling = ['win32', 'darwin'].includes(process.platform) ? f.visible.toUpperCase() : f.visible;
    reservations.publishReservations(f.data, [{ kind: 'public', root: spelling }]);
    const directory = reservations.directory(f.data), name = fs.readdirSync(directory)[0];
    const bytes = fs.readFileSync(path.join(directory, name));
    const original = reservations.readReservations(f.data)[0];
    assert.deepStrictEqual(original, { schema: 'datasecure-root-reservation/1', kind: 'public', root: spelling });
    withTargetFailure(f.visible, 'lstatSync', 'EACCES', calls => {
      assertStartupPreflight(); boundary.reserveRootSeparation();
      assert.strictEqual(calls(), 0);
    });
    assert.deepStrictEqual(fs.readFileSync(path.join(directory, name)), bytes);
    assert.deepStrictEqual(reservations.readReservations(f.data).filter(record => record.kind === 'public'), [original]);
    blocked(() => privacy.saveConfiguredPrivacyRoot(path.join(f.visible, 'private')));
  });
  for (const shape of ['dot', 'parent', 'trailing-separator', 'nul']) {
    test(`ambiguous ${shape} historical paths fail closed instead of becoming lexical authority`, f => {
      const value = boundary.canonicalPath(f.visible);
      const root = shape === 'dot' ? `${value}${path.sep}.` : shape === 'parent' ? `${value}${path.sep}child${path.sep}..` :
        shape === 'trailing-separator' ? `${value}${path.sep}` : `${value}\0suffix`;
      reservations.publishReservations(f.data, [{ kind: 'public', root }]);
      const directory = reservations.directory(f.data), name = fs.readdirSync(directory)[0];
      const bytes = fs.readFileSync(path.join(directory, name));
      fixedStorageFailure(() => roots());
      fixedStorageFailure(() => boundary.reserveRootSeparation());
      assert.deepStrictEqual(fs.readFileSync(path.join(directory, name)), bytes);
      assert.strictEqual(fs.existsSync(path.join(f.data, 'workspace')), false);
    });
  }
  test('conflicting historical roles still refuse startup without touching retired targets', f => {
    const root = boundary.canonicalPath(f.visible);
    reservations.publishReservations(f.data, [{ kind: 'private', root }, { kind: 'public', root: path.join(root, 'released') }]);
    withTargetFailure(f.visible, 'lstatSync', 'EACCES', calls => {
      fixedStorageFailure(() => boundary.assertRootSeparation());
      fixedStorageFailure(() => roots());
      assert.strictEqual(calls(), 0, 'a lexical history conflict is already authoritative');
    });
    assert.strictEqual(fs.existsSync(path.join(f.data, 'workspace')), false);
  });
  test('corrupt or linked historical reservation records fail closed rather than being ignored', f => {
    result.saveConfiguredResultRoot(f.visible);
    const directory = reservations.directory(f.data);
    const target = path.join(directory, fs.readdirSync(directory).find(name => name.startsWith('public-')));
    const original = fs.readFileSync(target);
    fs.writeFileSync(target, '{broken');
    blocked(() => roots());
    fs.writeFileSync(target, original);
    const moved = path.join(f.scope, 'reservation.json');
    fs.renameSync(target, moved);
    // File symlinks need privileges on Windows; a real hardlink also must not
    // be accepted as a uniquely owned immutable metadata file.
    fs.linkSync(moved, target);
    blocked(() => roots());
  });
  for (const replacement of ['identical', 'changed-root', 'hardlink']) {
    test(`reservation reader handles an atomic ${replacement} replacement between inspection and open`, f => {
      reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
      const directory = reservations.directory(f.data);
      const target = path.join(directory, fs.readdirSync(directory)[0]);
      const originalOpen = fs.openSync;
      let replacements = 0;
      // Execute the same real atomic replacement a competing stale publisher
      // can perform, at the precise lstat/open boundary. No stat/content result
      // is mocked; the reader opens the actual new filesystem object.
      const worker = `const fs=require('fs'); const [target,mode,alias]=process.argv.slice(1); const temporary=target+'.replacement'; const record=JSON.parse(fs.readFileSync(target,'utf8')); if(mode==='changed-root') record.root+='-different'; fs.writeFileSync(temporary,JSON.stringify(record)+'\\n',{flag:'wx'}); if(mode==='hardlink') fs.linkSync(temporary,alias); fs.renameSync(temporary,target);`;
      fs.openSync = (value, ...args) => {
        if (value === target && replacements++ === 0) {
          const child = spawnSync(process.execPath, ['-e', worker, target, replacement, path.join(f.scope, 'outside-record.json')], {
            encoding: 'utf8', timeout: 30000, windowsHide: true
          });
          assert.strictEqual(child.status, 0, child.stderr);
        }
        return originalOpen(value, ...args);
      };
      try {
        if (replacement === 'identical') {
          assert.deepStrictEqual(reservations.readReservations(f.data), [{ schema: reservations.SCHEMA, kind: 'private', root: f.private }]);
        } else blocked(() => reservations.readReservations(f.data));
      } finally { fs.openSync = originalOpen; }
      assert.strictEqual(replacements, 1, 'one synchronized replacement, no read retry loop');
    });
  }
  test('reservation history is bounded and additional roots never silently evict older protection', f => {
    const entries = Array.from({ length: reservations.MAX_RECORDS }, (_, index) => ({
      schema: reservations.SCHEMA, kind: 'private', root: path.join(f.scope, `reserved-${index}`)
    }));
    reservations.publishReservations(f.data, entries);
    blocked(() => reservations.publishReservations(f.data, [{ schema: reservations.SCHEMA, kind: 'private', root: f.private }]));
    assert.strictEqual(reservations.readReservations(f.data).length, reservations.MAX_RECORDS);
  });
  for (const operation of ['lstatSync', 'openSync', 'fstatSync', 'readSync', 'closeSync']) {
    test(`reservation file ${operation} failures expose only the fixed storage code`, f => {
      reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
      const directory = reservations.directory(f.data);
      const target = path.join(directory, fs.readdirSync(directory)[0]);
      const before = fs.readFileSync(target);
      const originalOpen = fs.openSync;
      const original = fs[operation];
      const descriptors = new Set();
      let injected = 0;
      const fault = () => { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL ${target}`); };
      fs.openSync = (file, ...args) => {
        if (file === target && operation === 'openSync') return fault();
        const fd = originalOpen(file, ...args);
        if (file === target) descriptors.add(fd);
        return fd;
      };
      if (operation !== 'openSync') fs[operation] = (value, ...args) => {
        if (value === target || descriptors.has(value)) {
          if (operation === 'closeSync') { original(value, ...args); descriptors.delete(value); }
          return fault();
        }
        return original(value, ...args);
      };
      try { fixedStorageFailure(() => reservations.readReservations(f.data)); }
      finally { fs[operation] = original; fs.openSync = originalOpen; }
      assert.strictEqual(injected, 1);
      assert.deepStrictEqual(fs.readFileSync(target), before);
      assert.strictEqual(reservations.readReservations(f.data).length, 1);
    });
  }
  for (const operation of ['opendirSync', 'readSync', 'closeSync']) {
    test(`reservation directory ${operation} failures expose only the fixed storage code`, f => {
      reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
      const directory = reservations.directory(f.data);
      const originalOpen = fs.opendirSync;
      let injected = 0;
      const fault = () => { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL ${directory}`); };
      fs.opendirSync = (value, ...args) => {
        if (value === directory && operation === 'opendirSync') return fault();
        const handle = originalOpen(value, ...args);
        if (value === directory) {
          const original = handle[operation].bind(handle);
          handle[operation] = (...values) => {
            if (operation === 'closeSync') original(...values);
            return fault();
          };
        }
        return handle;
      };
      try { fixedStorageFailure(() => reservations.readReservations(f.data)); }
      finally { fs.opendirSync = originalOpen; }
      assert.strictEqual(injected, 1);
      assert.strictEqual(reservations.readReservations(f.data).length, 1);
    });
  }
  test('a reservation close failure prevents the real root preflight from creating private output', f => {
    reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
    const directory = reservations.directory(f.data);
    const originalOpen = fs.openSync;
    const originalClose = fs.closeSync;
    const descriptors = new Set();
    let injected = 0;
    fs.openSync = (value, ...args) => {
      const fd = originalOpen(value, ...args);
      if (path.dirname(String(value)) === directory) descriptors.add(fd);
      return fd;
    };
    fs.closeSync = fd => {
      originalClose(fd);
      if (descriptors.delete(fd)) { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL ${directory}`); }
    };
    try { fixedStorageFailure(() => roots()); }
    finally { fs.openSync = originalOpen; fs.closeSync = originalClose; }
    assert.strictEqual(injected, 1);
    assert.strictEqual(fs.existsSync(path.join(f.data, 'workspace')), false);
    assert.strictEqual(fs.existsSync(f.private), false);
  });
  for (const operation of ['mkdirSync', 'lstatSync', 'realpath', 'openSync', 'writeSync', 'fsyncSync', 'closeSync', 'renameSync']) {
    test(`reservation publication ${operation} failures expose only the fixed storage code`, f => {
      reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
      const directory = reservations.directory(f.data);
      const originalOpen = fs.openSync;
      const original = operation === 'realpath' ? fs.realpathSync.native : fs[operation];
      const descriptors = new Set();
      let injected = 0;
      let directoryStats = 0;
      const fault = () => { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL ${directory}`); };
      fs.openSync = (file, ...args) => {
        const temporary = path.dirname(String(file)) === directory && String(file).endsWith('.tmp');
        if (temporary && operation === 'openSync') return fault();
        const fd = originalOpen(file, ...args);
        if (temporary) descriptors.add(fd);
        return fd;
      };
      const inject = (value, ...args) => {
        const matched = operation === 'mkdirSync' ? value === f.data
          : operation === 'lstatSync' ? value === directory && ++directoryStats === 2
            : operation === 'realpath' ? value === directory
            : operation === 'renameSync' ? path.dirname(String(value)) === directory && String(value).endsWith('.tmp')
              : descriptors.has(value);
        if (matched) {
          if (operation === 'closeSync') { original(value, ...args); descriptors.delete(value); }
          return fault();
        }
        return original(value, ...args);
      };
      if (operation === 'realpath') fs.realpathSync.native = inject;
      else if (operation !== 'openSync') fs[operation] = inject;
      try { fixedStorageFailure(() => reservations.publishReservations(f.data, [{ kind: 'public', root: f.visible }])); }
      finally {
        if (operation === 'realpath') fs.realpathSync.native = original;
        else fs[operation] = original;
        fs.openSync = originalOpen;
      }
      assert.strictEqual(injected, 1);
      assert.strictEqual(reservations.readReservations(f.data).length, 1, 'failed temporary metadata cannot authorize a new root');
    });
  }
  for (const operation of ['readSync', 'writeSync']) {
    test(`reservation ${operation} plus cleanup-close failure cannot reveal either native error`, f => {
      reservations.publishReservations(f.data, [{ kind: 'private', root: f.private }]);
      const directory = reservations.directory(f.data);
      const originalOpen = fs.openSync;
      const originalClose = fs.closeSync;
      const originalIo = fs[operation];
      const descriptors = new Set();
      let injected = 0;
      fs.openSync = (value, ...args) => {
        const fd = originalOpen(value, ...args);
        if (path.dirname(String(value)) === directory &&
            (operation === 'writeSync') === String(value).endsWith('.tmp')) descriptors.add(fd);
        return fd;
      };
      fs[operation] = (fd, ...args) => {
        if (descriptors.has(fd)) { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL original ${directory}`); }
        return originalIo(fd, ...args);
      };
      fs.closeSync = fd => {
        originalClose(fd);
        if (descriptors.delete(fd)) { injected++; throw new Error(`NATIVE_PRIVATE_DETAIL close ${directory}`); }
      };
      try {
        fixedStorageFailure(() => operation === 'readSync' ? reservations.readReservations(f.data)
          : reservations.publishReservations(f.data, [{ kind: 'public', root: f.visible }]));
      } finally { fs.openSync = originalOpen; fs.closeSync = originalClose; fs[operation] = originalIo; }
      assert.strictEqual(injected, 2, 'both real descriptor operations must reach their injected failure');
      assert.strictEqual(reservations.readReservations(f.data).length, 1);
    });
  }
  test('concurrent real processes retain every distinct result-root reservation', f => {
    // Exercise the immutable reservation contract, not simultaneous mutable
    // settings replacements. Bound settings reads deliberately reject swaps.
    boundary.reserveRootSeparation();
    const selected = Array.from({ length: 4 }, (_, i) => path.join(f.scope, `public-${i}`));
    selected.forEach(root => fs.mkdirSync(root));
    const worker = `require(${JSON.stringify(require.resolve('../plugins/data-secure/server/gateway/root-boundary'))}).reserveRootSeparation({resultRoot:process.argv[1]});`;
    const launcher = `const {spawn}=require('child_process'); Promise.all(${JSON.stringify(selected)}.map(root=>new Promise(resolve=>{ const child=spawn(process.execPath,['-e',${JSON.stringify(worker)},root],{stdio:['ignore','ignore','pipe'],windowsHide:true}); child.stderr.on('data',bytes=>process.stderr.write(bytes)); child.on('error',()=>resolve(99)); child.on('exit',code=>resolve(code)); }))).then(codes=>{process.exitCode=codes.some(code=>code!==0)?1:0;});`;
    const child = spawnSync(process.execPath, ['-e', launcher], { env: { ...process.env }, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(child.status, 0, child.stderr);
    const recorded = reservations.readReservations(f.data).filter(item => item.kind === 'public').map(item => item.root);
    for (const root of selected) assert.ok(recorded.includes(boundary.canonicalPath(root)), 'a competing selection must not erase a reserved result location');
    assert.strictEqual(fs.existsSync(result.configPath()), false, 'reservation alone never changes the selected result root');
  });
  test('a concurrent settings replacement fails closed without overwriting it; an explicit fresh save succeeds', f => {
    result.saveConfiguredResultRoot(f.visible);
    const competing = path.join(f.scope, 'competing-public');
    const requested = path.join(f.scope, 'requested-public');
    fs.mkdirSync(competing); fs.mkdirSync(requested);
    boundary.reserveRootSeparation({ resultRoot: competing });
    const file = result.configPath();
    const replacement = `${file}.test-replacement`;
    const record = JSON.parse(configBytes(result));
    assert.strictEqual(record.schema, result.EXACT_SCHEMA, 'fresh settings use the exact Node identity contract');
    record.root = competing;
    const stat = fs.lstatSync(competing);
    record.identity = { dev: String(stat.dev), ino: String(stat.ino), birthtime_ms: String(Math.trunc(stat.birthtimeMs)) };
    const exact = fs.lstatSync(competing, { bigint: true });
    record.exact_identity = { dev: String(exact.dev), ino: String(exact.ino), birthtime_ns: String(exact.birthtimeNs) };
    fs.writeFileSync(replacement, JSON.stringify(record), { flag: 'wx' });
    const competingBytes = fs.readFileSync(replacement);
    const originalOpen = fs.openSync;
    let swaps = 0;
    fs.openSync = (value, ...args) => {
      if (String(value) === file && swaps === 0) {
        swaps++;
        fs.renameSync(replacement, file);
      }
      return originalOpen(value, ...args);
    };
    try { fixedStorageFailure(() => result.saveConfiguredResultRoot(requested)); }
    finally { fs.openSync = originalOpen; }
    assert.strictEqual(swaps, 1, 'actual atomic replacement must occur during the held read');
    assert.deepStrictEqual(configBytes(result), competingBytes, 'rejected save cannot overwrite a competing publication');
    assert.strictEqual(result.readConfiguredResultRoot(), competing, 'competing publication remains a valid bound configuration');
    const afterFailure = reservations.readReservations(f.data).filter(item => item.kind === 'public').map(item => item.root);
    assert.ok(afterFailure.includes(boundary.canonicalPath(f.visible)));
    assert.ok(afterFailure.includes(boundary.canonicalPath(competing)));
    assert.ok(!afterFailure.includes(boundary.canonicalPath(requested)), 'rejected request has not reserved its new root');
    result.saveConfiguredResultRoot(requested);
    assert.strictEqual(result.readConfiguredResultRoot(), requested);
    const afterRetry = reservations.readReservations(f.data).filter(item => item.kind === 'public').map(item => item.root);
    for (const root of [f.visible, competing, requested]) assert.ok(afterRetry.includes(boundary.canonicalPath(root)));
  });
  console.log(`ROOT BOUNDARY: ${passed} real-filesystem cases passed`);
} finally {
  for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  removeFixtureTree(base);
}
