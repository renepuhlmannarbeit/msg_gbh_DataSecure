'use strict';

// Independent, deterministic countercases for a LOCAL history-window read retry.
// Run with Node 22.23.2, optionally --repository <absolute checkout>.
// All publishers call the real registerHistory in a separate process. Readers
// use the real bound-file implementation; no successful bytes/stat/DTO are mocked.
// BOUND_FILE_CHANGED is not a unique race diagnosis: it also normalizes other
// IO failures. Every allowed retry must therefore repeat all original checks.
// Every synthetic fixture is preserved. No existing fixture or product is removed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const PRODUCT = 'plugins/data-secure/server/gateway/standalone-history-window.js';
const BOUND = 'plugins/data-secure/server/core/bound-file-io.js';
const SCHEMA = 'datasecure-standalone-history-window/1';
const UNAVAILABLE = 'STANDALONE_HISTORY_UNAVAILABLE';
const OWNER_ENV = 'DATASECURE_HISTORY_COUNTERCASE_TOKEN';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const CASES = [
  { name: 'stable-bound-read', attempts: 1 },
  { name: 'publisher-after-lstat-before-open', phases: ['lstat'], attempts: 2 },
  { name: 'publisher-after-read-before-postcheck', phases: ['read'], attempts: 2 },
  { name: 'two-publishers-third-bound-read-succeeds', phases: ['lstat', 'lstat'], attempts: 3 },
  { name: 'continuous-publishers-stop-after-three', continuous: true, attempts: 3, fails: true },
  { name: 'damaged-json-is-not-retried', damage: 'json', attempts: 1, fails: true },
  { name: 'invalid-schema-is-not-retried', damage: 'schema', attempts: 1, fails: true },
  { name: 'invalid-sort-order-is-not-retried', damage: 'sort-order', attempts: 1, fails: true },
  { name: 'invalid-batch-id-is-not-retried', damage: 'batch-id', attempts: 1, fails: true },
  { name: 'empty-file-is-not-retried', damage: 'empty', attempts: 1, fails: true },
  { name: 'oversized-file-is-not-retried', damage: 'oversize', attempts: 1, fails: true },
  { name: 'multiply-linked-file-is-not-retried', damage: 'hardlink', attempts: 1, fails: true },
  { name: 'close-failure-is-not-retried', closeFailure: true, attempts: 1, fails: true },
  { name: 'changed-then-close-failure-is-not-retried', phases: ['lstat'], closeFailureAttempt: 2, attempts: 2, fails: true },
  { name: 'retry-revalidates-new-schema', phases: ['lstat'], afterPublishDamage: 'schema', attempts: 2, fails: true },
  { name: 'retry-revalidates-new-sort-order', phases: ['lstat'], afterPublishDamage: 'sort-order', attempts: 2, fails: true },
  { name: 'retry-revalidates-new-batch-id', phases: ['lstat'], afterPublishDamage: 'batch-id', attempts: 2, fails: true },
  { name: 'retry-revalidates-new-link-count', phases: ['lstat'], afterPublishDamage: 'hardlink', attempts: 2, fails: true },
  { name: 'changed-then-missing-never-migrates-or-repairs', phases: ['lstat'], afterPublishMissing: true, attempts: 2, fails: true },
  { name: 'initial-missing-then-replaced-directory-never-rebinds', initialMissingDirectory: 'replaced', fails: true },
  { name: 'initial-missing-then-missing-directory-never-rebinds', initialMissingDirectory: 'missing', fails: true },
  { name: 'directory-replacement-is-never-rebound', replaceDirectory: true, fails: true }
];

function repositoryRoot(explicit) {
  // cwd is the normal invocation. The __dirname fallback also works when this
  // file is later copied directly into tests/. Never bake in a developer path.
  const candidates = explicit ? [path.resolve(explicit)] :
    [process.cwd(), path.resolve(__dirname, '..')];
  const repository = candidates.find(candidate => fs.existsSync(path.join(candidate, PRODUCT)));
  assert.ok(repository, 'Use the checkout cwd or --repository <absolute checkout>');
  return fs.realpathSync.native(repository);
}
function environmentFor(root) {
  const env = { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone',
    EU_PRIVACY_DATA_ROOT: path.join(root, 'private'),
    EU_PRIVACY_ROOT: path.join(root, 'workspace'),
    EU_PRIVACY_RESULT_ROOT: path.join(root, 'results') };
  // This is the explicit source protocol, not a native Core/admission proof.
  delete env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return env;
}
function row(number) {
  return { batch_id: sha(`independent-history-countercase-${number}`),
    created_at: `2026-10-19T00:00:${String(number).padStart(2, '0')}.000Z` };
}
function expectedEntries(publishers) {
  return Array.from({ length: publishers + 1 }, (_, number) => row(number)).reverse().slice(0, 5);
}
function verifyFixture(root, fresh) {
  const temporary = fs.realpathSync.native(os.tmpdir());
  const parent = path.dirname(root);
  assert.equal(path.dirname(parent), temporary);
  assert.match(path.basename(parent), /^datasecure-history-countercases-[A-Za-z0-9]+$/u);
  assert.match(path.basename(root), /^case-\d{2}$/u);
  assert.equal(fs.realpathSync.native(parent), parent);
  assert.equal(fs.realpathSync.native(root), root);
  for (const candidate of [parent, root]) {
    const stat = fs.lstatSync(candidate);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  }
  const token = process.env[OWNER_ENV];
  assert.match(token || '', /^[a-f0-9]{64}$/u);
  for (const [key, leaf] of Object.entries({ EU_PRIVACY_DATA_ROOT: 'private', EU_PRIVACY_ROOT: 'workspace', EU_PRIVACY_RESULT_ROOT: 'results' }))
    assert.equal(process.env[key], path.join(root, leaf), 'internal processes may address only their new fixture');
  assert.equal(process.env.DATASECURE_PRODUCT_CHANNEL, 'standalone');
  assert.notEqual(process.env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  const marker = path.join(root, 'COUNTERCASE-OWNER.json');
  if (fresh) {
    assert.deepEqual(fs.readdirSync(root), [], 'never reuse a preserved/nonempty case root');
    fs.writeFileSync(marker, JSON.stringify({ root, owner_sha256: sha(token) }), { flag: 'wx', mode: 0o600 });
  } else {
    const stat = fs.lstatSync(marker);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.deepEqual(JSON.parse(fs.readFileSync(marker)), { root, owner_sha256: sha(token) });
  }
}
function runPublisher(repository, root, number, allowEmpty) {
  const window = require(path.join(repository, PRODUCT));
  const registered = window.registerHistory(row(number), () => {
    assert.equal(allowEmpty, true, 'an existing index must not migrate');
    return [];
  });
  assert.deepEqual(registered, allowEmpty ? [row(number)] : expectedEntries(number));
  return { writer_exit: 0, registered: row(number).batch_id };
}

function runCase(repository, root, specification) {
  const productFile = path.join(repository, PRODUCT);
  const productBefore = sha(fs.readFileSync(productFile));
  const directory = path.join(root, 'private', 'standalone-history-window');
  const index = path.join(directory, 'recent.json');
  const bound = require(path.join(repository, BOUND));
  const readBoundFileRecord = bound.readBoundFileRecord;
  const bindDirectory = bound.bindDirectory;
  const methods = ['lstatSync', 'openSync', 'readSync', 'closeSync', 'readdirSync', 'opendirSync',
    'writeFileSync', 'renameSync', 'linkSync', 'mkdirSync', 'unlinkSync', 'rmdirSync', 'truncateSync'];
  const real = Object.fromEntries(methods.map(name => [name, fs[name]]));
  const call = (name, ...args) => Reflect.apply(real[name], fs, args);
  const metrics = { attempts: 0, opens: 0, reads: 0, closes: 0, publishers: 0,
    read_errors: [], publisher_exits: [], writes: 0, scans: 0, migrations: 0,
    directory_binds: 0, directory_moved: false, directory_replaced: false, initial_enoent: 0 };
  const directories = [];
  const held = new Set();
  let observing = false, leafStats = 0, publishedOnRead = false;
  let injectionFailure = null, expectedBytes, result, observedError, caseFailure, expectedAbsent = false;
  const attemptOptions = [];
  const unobserved = action => {
    const previous = observing;
    observing = false;
    try { return action(); } finally { observing = previous; }
  };
  const isIndex = candidate => typeof candidate === 'string' && path.resolve(candidate) === index;
  const noMigration = () => { metrics.migrations++; throw Error('COUNTERCASE_MIGRATION_FORBIDDEN'); };
  const writeFlags = flags => typeof flags === 'number'
    ? Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT |
      fs.constants.O_TRUNC | fs.constants.O_APPEND)) : /[wa+]/u.test(String(flags));

  function damage(kind) {
    if (kind === 'hardlink') {
      call('linkSync', index, path.join(root, `preserved-hardlink-${metrics.publishers}.json`));
    } else {
      // Preserve the actual prior index instead of deleting/overwriting it.
      const backup = path.join(root, `preserved-index-${metrics.publishers}.json`);
      assert.equal(fs.existsSync(backup), false);
      call('renameSync', index, backup);
      const bytes = kind === 'json' ? Buffer.from('{damaged') :
        kind === 'schema' ? Buffer.from(JSON.stringify({ schema: 'wrong-history-schema', entries: [] })) :
          kind === 'sort-order' ? Buffer.from(JSON.stringify({ schema: SCHEMA, entries: [row(0), row(1)] })) :
            kind === 'batch-id' ? Buffer.from(JSON.stringify({ schema: SCHEMA,
              entries: [{ ...row(0), batch_id: 'not-a-64-hex-batch-id' }] })) :
              kind === 'empty' ? Buffer.alloc(0) : Buffer.alloc(4097, 32);
      call('writeFileSync', index, bytes, { flag: 'wx', mode: 0o600 });
    }
    expectedBytes = fs.readFileSync(index);
  }
  function publish(allowEmpty = false, phase = 'lstat') {
    const beforePublication = allowEmpty ? null : fs.readFileSync(index, { flag: 'r' });
    const number = ++metrics.publishers;
    const writer = cp.spawnSync(process.execPath, [__filename, '--publisher', repository, root,
      String(number), allowEmpty ? 'empty' : 'existing'], {
      cwd: repository, env: environmentFor(root), encoding: 'utf8', windowsHide: true,
      timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024
    });
    metrics.publisher_exits.push({ code: writer.status, signal: writer.signal, error: writer.error?.code || null });
    assert.ifError(writer.error);
    assert.equal(writer.signal, null, 'publisher must end normally');
    if (phase === 'read' && process.platform === 'win32' && writer.status === 1 &&
        writer.stdout.trim() === '' && writer.stderr.trim() === 'EPERM' &&
        fs.readFileSync(index).equals(beforePublication)) {
      // No synthetic success/reopened descriptor to evade Windows sharing.
      // This exact real-publisher interleaving remains a POSIX host case.
      throw Object.assign(Error('Windows refused the actual publisher rename while the reader descriptor remained open'),
        { code: 'COUNTERCASE_AFTER_READ_RENAME_UNAVAILABLE' });
    }
    assert.equal(writer.status, 0, writer.stderr.slice(-2048));
    const receipt = JSON.parse(writer.stdout.trim());
    assert.equal(receipt.writer_exit, 0);
    assert.equal(receipt.registered, row(number).batch_id);
    expectedBytes = fs.readFileSync(index);
    const published = JSON.parse(expectedBytes);
    assert.equal(published.schema, SCHEMA);
    assert.deepEqual(Object.keys(published).sort(), ['entries', 'schema']);
    assert.deepEqual(published.entries,
      allowEmpty ? [row(number)] : expectedEntries(number), 'actual publisher index bytes');
    if (specification.afterPublishDamage) damage(specification.afterPublishDamage);
    if (specification.afterPublishMissing) {
      const preserved = path.join(root, 'preserved-index-before-missing.json');
      assert.equal(fs.existsSync(preserved), false);
      call('renameSync', index, preserved);
      assert.deepEqual(fs.readFileSync(preserved), expectedBytes);
      expectedAbsent = true;
    }
  }
  function inject(action) {
    try { return unobserved(action); }
    catch (error) { injectionFailure ||= error; throw error; }
  }
  function wants(phase) {
    return specification.continuous ? phase === 'lstat' :
      specification.phases?.[metrics.attempts - 1] === phase;
  }
  function moveDirectory(replacement) {
    const preserved = path.join(root, 'preserved-original-history-directory');
    assert.equal(fs.existsSync(preserved), false);
    call('renameSync', directory, preserved);
    metrics.directory_moved = true;
    if (replacement) {
      call('mkdirSync', directory, { mode: 0o700 });
      metrics.directory_replaced = true;
      publish(true); // The replacement has a real, valid child-published index.
      expectedAbsent = false;
    } else expectedAbsent = true;
  }

  // Observation only: always delegate each attempt to the real boundary. The
  // overflow guard turns an accidental unbounded retry into a finite failure.
  bound.bindDirectory = function observedBind(candidate, options) {
    if (observing && typeof candidate === 'string' && path.resolve(candidate) === directory)
      metrics.directory_binds++;
    return bindDirectory(candidate, options);
  };
  bound.readBoundFileRecord = function observedRead(target, options) {
    if (!observing || !isIndex(target)) return readBoundFileRecord(target, options);
    metrics.attempts++;
    directories.push(options?.directory);
    attemptOptions.push({ maximum: options?.maximum, minimum: options?.minimum });
    if (metrics.attempts > 3) throw Object.assign(Error('COUNTERCASE_ATTEMPT_OVERFLOW'),
      { code: 'COUNTERCASE_ATTEMPT_OVERFLOW' });
    leafStats = 0;
    publishedOnRead = false;
    try { return readBoundFileRecord(target, options); }
    catch (error) { metrics.read_errors.push(error.code || error.name); throw error; }
  };
  const window = require(productFile);
  try {
    // Initial leaf ENOENT retains the existing one-time migration contract.
    // It must be distinguished from ENOENT after a failed bound read attempt.
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    let initialMigrations = 0;
    assert.deepEqual(window.readRecentHistory(() => { initialMigrations++; return [row(0)]; }), [row(0)]);
    assert.equal(initialMigrations, 1);
    expectedBytes = fs.readFileSync(index);
    if (specification.damage) damage(specification.damage);
    if (specification.initialMissingDirectory) {
      const preserved = path.join(root, 'preserved-index-before-initial-enoent.json');
      assert.equal(fs.existsSync(preserved), false);
      call('renameSync', index, preserved);
      assert.deepEqual(fs.readFileSync(preserved), expectedBytes);
      expectedAbsent = true;
    }

    fs.lstatSync = function observedLstat(candidate, ...args) {
      let before;
      try { before = call('lstatSync', candidate, ...args); }
      catch (error) {
        if (observing && isIndex(candidate) && error?.code === 'ENOENT' &&
            specification.initialMissingDirectory && !metrics.directory_moved) {
          metrics.initial_enoent++;
          // The initial ENOENT is a real lstat failure, not an invented error.
          // Change the directory before the reader handles that same failure.
          inject(() => moveDirectory(specification.initialMissingDirectory === 'replaced'));
        }
        throw error;
      }
      if (observing && isIndex(candidate) && ++leafStats === 1) {
        if (specification.replaceDirectory && !metrics.directory_replaced) {
          inject(() => moveDirectory(true));
        } else if (wants('lstat')) inject(() => publish());
      }
      return before; // Real stat of A, after the real publisher has installed B.
    };
    fs.openSync = function observedOpen(candidate, flags, ...args) {
      if (observing && writeFlags(flags)) {
        metrics.writes++;
        throw Error('COUNTERCASE_PARENT_WRITE_FORBIDDEN');
      }
      const fd = call('openSync', candidate, flags, ...args);
      if (observing && isIndex(candidate)) { metrics.opens++; held.add(fd); }
      return fd;
    };
    fs.readSync = function observedRead(fd, ...args) {
      const count = call('readSync', fd, ...args);
      if (observing && held.has(fd)) {
        metrics.reads++;
        if (count > 0 && !publishedOnRead && wants('read')) {
          publishedOnRead = true;
          inject(() => publish(false, 'read')); // Bytes were really read before replacement.
        }
      }
      return count;
    };
    fs.closeSync = function observedClose(fd, ...args) {
      const watched = observing && held.has(fd);
      // Even the injected error case actually closes the descriptor; no leak.
      const value = call('closeSync', fd, ...args);
      held.delete(fd);
      if (watched) {
        metrics.closes++;
        if (specification.closeFailure || metrics.attempts === specification.closeFailureAttempt)
          throw Object.assign(Error('synthetic close error'), { code: 'EIO' });
      }
      return value;
    };
    for (const name of ['readdirSync', 'opendirSync']) fs[name] = function forbiddenScan(...args) {
      if (observing) { metrics.scans++; throw Error('COUNTERCASE_SCAN_FORBIDDEN'); }
      return call(name, ...args);
    };
    for (const name of ['writeFileSync', 'renameSync', 'linkSync', 'mkdirSync', 'unlinkSync', 'rmdirSync', 'truncateSync']) {
      fs[name] = function forbiddenMutation(...args) {
        if (observing) { metrics.writes++; throw Error('COUNTERCASE_PARENT_WRITE_FORBIDDEN'); }
        return call(name, ...args);
      };
    }
    observing = true;
    try { result = window.readRecentHistory(noMigration); }
    catch (error) { observedError = error; }
    finally { observing = false; }

    if (injectionFailure) throw injectionFailure;
    assert.equal(metrics.scans, 0, 'a retry must not scan history');
    assert.equal(metrics.writes, 0, 'a read must not repair/create an index or lock');
    assert.equal(metrics.migrations, 0, 'a retry must not call migration');
    assert.equal(metrics.directory_binds, 1, 'one original directory binding only');
    assert.equal(held.size, 0, 'all real reader descriptors closed');
    assert.ok(metrics.attempts >= 1 && metrics.attempts <= 3, 'at most three full bound attempts');
    // Assert outside the product catch boundary, so a swallowed observation
    // assertion cannot accidentally satisfy an expected fail-closed case.
    assert.ok(directories[0]);
    assert.ok(directories.every(binding => binding === directories[0]), 'never rebind the directory');
    for (const options of attemptOptions) assert.deepEqual(options, { maximum: 4096, minimum: 1 });
    if (specification.attempts !== undefined) assert.equal(metrics.attempts, specification.attempts);
    if (specification.fails) {
      assert.equal(observedError?.code, UNAVAILABLE);
      assert.equal(result, undefined);
    } else {
      assert.ifError(observedError);
      assert.deepEqual(result, expectedEntries(metrics.publishers));
    }
    if (specification.continuous) assert.equal(metrics.publishers, 3);
    if (specification.phases) assert.equal(metrics.publishers, specification.phases.length);
    if (specification.replaceDirectory) {
      assert.equal(metrics.directory_replaced, true);
      assert.equal(metrics.publishers, 1);
      assert.deepEqual(JSON.parse(fs.readFileSync(index)).entries, [row(1)]);
    }
    if (specification.initialMissingDirectory) {
      assert.equal(metrics.initial_enoent, 1, 'the first leaf read really returned ENOENT');
      assert.equal(metrics.read_errors[0], 'ENOENT');
      assert.equal(metrics.directory_moved, true);
      const replacement = specification.initialMissingDirectory === 'replaced';
      assert.equal(metrics.directory_replaced, replacement);
      assert.equal(metrics.publishers, replacement ? 1 : 0);
      assert.equal(fs.existsSync(directory), replacement, 'no directory repair after initial ENOENT');
      if (replacement) assert.deepEqual(JSON.parse(fs.readFileSync(index)).entries, [row(1)]);
    }
    if (specification.damage === 'hardlink' || specification.afterPublishDamage === 'hardlink')
      assert.ok(metrics.read_errors.includes('BOUND_FILE_UNSAFE'));
    if (specification.closeFailure) assert.deepEqual(metrics.read_errors, ['BOUND_FILE_CLOSE_FAILED']);
    if (specification.closeFailureAttempt) {
      assert.deepEqual(metrics.read_errors, ['BOUND_FILE_CHANGED', 'BOUND_FILE_CLOSE_FAILED']);
      assert.equal(metrics.closes, 2, 'both real descriptors were closed before failure was reported');
    }
    if (expectedAbsent) assert.equal(fs.existsSync(index), false, 'CHANGED then ENOENT must not repair/create an index');
    else assert.deepEqual(fs.readFileSync(index), expectedBytes, 'no index repair or silent rewrite');
  } catch (error) { caseFailure = error; }
  finally {
    observing = false;
    for (const name of methods) fs[name] = real[name];
    bound.readBoundFileRecord = readBoundFileRecord;
    bound.bindDirectory = bindDirectory;
    // These descriptors belong only to this case. Preserve all fixture paths.
    for (const fd of held) { try { call('closeSync', fd); } catch (error) { caseFailure ||= error; } }
    held.clear();
    try { assert.equal(sha(fs.readFileSync(productFile)), productBefore, 'product bytes unchanged'); }
    catch (error) { caseFailure ||= error; }
  }
  const notRun = caseFailure?.code === 'COUNTERCASE_AFTER_READ_RENAME_UNAVAILABLE';
  return { case: specification.name, passed: !caseFailure, status: notRun ? 'NOT_RUN' : caseFailure ? 'FAILED' : 'PASS', metrics,
    observed_error: observedError?.code || null,
    ...(caseFailure ? { assertion: caseFailure.message, error_code: caseFailure.code || caseFailure.name } : {}),
    fixture_preserved: root, product_file_sha256: productBefore };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--publisher') {
    assert.equal(argv.length, 5);
    const repository = repositoryRoot(argv[1]), root = fs.realpathSync.native(argv[2]);
    verifyFixture(root, false);
    const number = Number(argv[3]);
    assert.ok(Number.isInteger(number) && number >= 1 && number <= 3);
    assert.ok(['empty', 'existing'].includes(argv[4]));
    console.log(JSON.stringify(runPublisher(repository, root, number, argv[4] === 'empty')));
    return;
  }
  if (argv[0] === '--case') {
    assert.equal(argv.length, 4);
    const repository = repositoryRoot(argv[1]), root = fs.realpathSync.native(argv[2]);
    verifyFixture(root, true);
    const specification = CASES.find(value => value.name === argv[3]);
    assert.ok(specification);
    const report = runCase(repository, root, specification);
    console.log(JSON.stringify(report));
    process.exitCode = report.passed ? 0 : report.status === 'NOT_RUN' ? 77 : 1;
    return;
  }
  assert.ok(argv.length === 0 || argv.length === 2 && argv[0] === '--repository');
  const repository = repositoryRoot(argv[1]);
  const fingerprints = Object.fromEntries([PRODUCT, BOUND].map(name => [name, sha(fs.readFileSync(path.join(repository, name)))]));
  const temporary = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporary, 'datasecure-history-countercases-'));
  assert.equal(path.dirname(root), temporary);
  assert.equal(fs.realpathSync.native(root), root);
  const reports = [];
  const token = crypto.randomBytes(32).toString('hex');
  for (const [number, specification] of CASES.entries()) {
    const fixture = path.join(root, `case-${String(number + 1).padStart(2, '0')}`);
    fs.mkdirSync(fixture, { mode: 0o700 }); // Create-only; every case is preserved.
    const child = cp.spawnSync(process.execPath, [__filename, '--case', repository, fixture, specification.name], {
      cwd: repository, env: { ...environmentFor(fixture), [OWNER_ENV]: token }, encoding: 'utf8', windowsHide: true,
      timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024
    });
    let report;
    try { report = JSON.parse(child.stdout.trim()); }
    catch { report = { case: specification.name, passed: false,
      error_code: child.error?.code || 'COUNTERCASE_CHILD_NO_REPORT',
      fixture_preserved: fixture, diagnostic: child.stderr.slice(-2048) }; }
    if (child.error || child.signal || child.status !== (report.passed ? 0 : report.status === 'NOT_RUN' ? 77 : 1)) {
      report.passed = false;
      report.status = 'FAILED';
      report.child_error = child.error?.code || null;
      report.child_exit = child.status;
      report.child_signal = child.signal;
    }
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  const unchanged = Object.entries(fingerprints).every(([name, hash]) => sha(fs.readFileSync(path.join(repository, name))) === hash);
  const passed = reports.filter(report => report.passed).length;
  const notRun = reports.filter(report => report.status === 'NOT_RUN').length;
  const failed = reports.length - passed - notRun;
  console.log(JSON.stringify({ schema: 'datasecure-history-read-countercases/1', passed, total: CASES.length,
    failed, not_run: notRun, product_sources_unchanged: unchanged, fixtures_preserved: root,
    native_macos: 'NOT_RUN', gui: 'NOT_RUN', global_cleanup: 'NOT_RUN' }));
  // Platform-inapplicable real interleavings are reported explicitly, never counted as PASS.
  process.exitCode = failed || !unchanged ? 1 : 0;
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.code || error.stack); process.exitCode = 1; }
}
