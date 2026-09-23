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

try {
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
    const selected = Array.from({ length: 4 }, (_, i) => path.join(f.scope, `public-${i}`));
    selected.forEach(root => fs.mkdirSync(root));
    const worker = `require(${JSON.stringify(require.resolve('../plugins/data-secure/server/gateway/result-folder-config'))}).saveConfiguredResultRoot(process.argv[1]);`;
    const launcher = `const {spawn}=require('child_process'); Promise.all(${JSON.stringify(selected)}.map(root=>new Promise(resolve=>{ const child=spawn(process.execPath,['-e',${JSON.stringify(worker)},root],{stdio:['ignore','ignore','pipe'],windowsHide:true}); child.stderr.on('data',bytes=>process.stderr.write(bytes)); child.on('error',()=>resolve(99)); child.on('exit',code=>resolve(code)); }))).then(codes=>{process.exitCode=codes.some(code=>code!==0)?1:0;});`;
    const child = spawnSync(process.execPath, ['-e', launcher], { env: { ...process.env }, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(child.status, 0, child.stderr);
    const recorded = reservations.readReservations(f.data).filter(item => item.kind === 'public').map(item => item.root);
    for (const root of selected) assert.ok(recorded.includes(boundary.canonicalPath(root)), 'a competing selection must not erase a reserved result location');
  });
  console.log(`ROOT BOUNDARY: ${passed} real-filesystem cases passed`);
} finally {
  for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  removeFixtureTree(base);
}
