'use strict';

// Actual production migration and child publishers; adversarial FS seams below
// exercise refusal/budget contracts, not native macOS/package acceptance.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), cp = require('node:child_process');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('Standalone bounded history migration snapshots');
const repository = path.resolve(__dirname, '..');
const storeFile = path.join(repository, 'plugins/data-secure/server/gateway/standalone-history-store.js');
const store = require(storeFile);
const originalEnvironment = { ...process.env };
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-migration-race-'));
const rootIdentity = fs.lstatSync(root, { bigint: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const row = index => ({ token: sha(`migration-row-${index}`), product_channel: 'standalone',
  processing_mode: 'markdown-only', created_at: new Date(Date.UTC(2026, 9, 19, 0, 0, index)).toISOString(), items: [] });
let sequence = 0;
function fixture({ exports = true } = {}) {
  const data = path.join(root, `case-${++sequence}`);
  process.env.EU_PRIVACY_DATA_ROOT = data;
  process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  const summaries = path.join(data, 'standalone-run-history');
  for (const name of ['standalone-run-history', 'result-export-owners', 'batches', ...(exports ? ['result-export-state'] : [])])
    fs.mkdirSync(path.join(data, name), { recursive: true, mode: 0o700 });
  return { data, summaries, exports: path.join(data, 'result-export-state'), index: path.join(data, 'standalone-history-window/recent.json') };
}
function save(f, state) {
  const file = path.join(f.summaries, `${state.token}.json`);
  fs.writeFileSync(file, JSON.stringify(store.summarizeState(state))); return file;
}
function childSave(state) {
  const answer = cp.spawnSync(process.execPath, ['-e',
    'const s=require(process.argv[1]);if(!s.recordStandaloneState(JSON.parse(process.argv[2])))process.exit(73)',
    storeFile, JSON.stringify(state)], { cwd: repository, env: { ...process.env }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.ifError(answer.error); assert.equal(answer.status, 0, answer.stderr);
}
function patched(overrides, action) {
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, fs[key]]));
  Object.assign(fs, overrides);
  try { return action(); } finally { Object.assign(fs, previous); }
}
function unavailable(action) {
  assert.throws(action, error => error.code === 'STANDALONE_HISTORY_UNAVAILABLE');
}
function noIndex(f) { assert.equal(fs.existsSync(f.index), false, 'failed migration must not publish an index'); }
function legacy(f, index = 1, size = 0) {
  const id = `re_${index.toString(16).padStart(32, '0')}`;
  const value = { schema: 'datasecure-result-export/2', product_channel: 'standalone',
    run_directory: 'Lauf-20261018-120000-1234abcd', items: [] };
  if (size) value.padding = 'x'.repeat(size - Buffer.byteLength(JSON.stringify({ ...value, padding: '' })));
  const file = path.join(f.exports, `${id}.json`); fs.writeFileSync(file, JSON.stringify(value)); return file;
}

// Load actual complete module bodies with fixed private function exports for
// error/close assertions. This does not change any product export or authorize
// publication. All real IO below remains inside this suite's synthetic root.
function historyInternals(file, names) {
  const mod = { exports: {} }, localRequire = require('node:module').createRequire(file);
  require('node:vm').runInNewContext(fs.readFileSync(file, 'utf8') +
    '\nmodule.exports.__review = {' + names.join(',') + '};\n',
  { module: mod, exports: mod.exports, require: localRequire, Buffer, process }, { filename: file });
  return mod.exports.__review;
}
const windowFile = path.join(path.dirname(storeFile), 'standalone-history-window.js');
function localHistoryIoCase(kind, phase, options = {}) {
  const f = fixture(), bound = require('../plugins/data-secure/server/core/bound-file-io');
  const api = kind === 'window' ? historyInternals(windowFile, ['publish'])
    : historyInternals(storeFile, ['readJson', 'writeJson', 'historyWindowMigration']);
  const name = 'a'.repeat(64);
  let file, directory;
  if (kind === 'read') {
    file = save(f, row(20));
    if (phase === 'parse') fs.writeFileSync(file, '{');
  } else if (kind === 'locator') legacy(f);
  else if (kind === 'window') {
    const target = path.join(f.data, 'standalone-history-window');
    fs.mkdirSync(target, { mode: 0o700 }); directory = bound.bindDirectory(target);
  }
  const primary = options.primary, secondary = Object.hasOwn(options, 'close') ? options.close : new Error('secondary close');
  const original = Object.fromEntries(['openSync', 'closeSync', 'readSync', 'writeSync', 'fsyncSync',
    'fstatSync', 'lstatSync', 'renameSync', 'unlinkSync'].map(key => [key, fs[key]]));
  let held, nativeFd, temporary, closes = 0, renames = 0, unlinks = 0, didThrow = false, error, value;
  const own = target => typeof target === 'string' && (kind === 'read' ? target === file :
    kind === 'window' ? path.dirname(target) === directory.path && path.basename(target).startsWith('recent.json.') && target.endsWith('.tmp') :
      path.dirname(target) === f.summaries && target.endsWith('.tmp') &&
      path.basename(target).startsWith(kind === 'locator' ? 'legacy-' : name + '.json.'));
  const actual = fd => fd === held && nativeFd !== undefined ? nativeFd : fd;
  try {
    value = patched({
      openSync(target, ...args) {
        if (own(target) && phase === 'open') throw primary;
        const fd = original.openSync.call(this, target, ...args);
        if (!own(target)) return fd;
        nativeFd = fd; held = options.zero ? 0 : fd;
        if (kind !== 'read') temporary = target;
        return held;
      },
      lstatSync(target, ...args) {
        if (phase === 'parent' && held !== undefined && target === f.data) throw primary;
        return original.lstatSync.call(this, target, ...args);
      },
      fstatSync(fd, ...args) {
        if (fd === held && phase === 'stat') throw primary;
        return original.fstatSync.call(this, actual(fd), ...args);
      },
      readSync(fd, ...args) {
        if (fd === held && phase === 'read') throw primary;
        return original.readSync.call(this, actual(fd), ...args);
      },
      writeSync(fd, ...args) {
        if (fd === held && phase === 'write') throw primary;
        return original.writeSync.call(this, actual(fd), ...args);
      },
      fsyncSync(fd) {
        if (fd === held && phase === 'flush') throw primary;
        return original.fsyncSync.call(this, actual(fd));
      },
      closeSync(fd) {
        if (fd !== held) return original.closeSync.call(this, fd);
        closes++; original.closeSync.call(this, actual(fd));
        if (options.closeFailure !== false) throw secondary;
      },
      renameSync(from, to) {
        if (from === temporary) renames++;
        return original.renameSync.call(this, from, to);
      },
      unlinkSync(target) {
        if (target === temporary) unlinks++;
        return original.unlinkSync.call(this, target);
      }
    }, () => kind === 'read' ? api.readJson(file) : kind === 'write' ? api.writeJson(name, { value: 'synthetic' }) :
      kind === 'locator' ? api.historyWindowMigration() : api.publish(directory, null, []));
  } catch (caught) { didThrow = true; error = caught; }
  if (nativeFd !== undefined) assert.throws(() => original.fstatSync(nativeFd), caught => caught.code === 'EBADF');
  if (didThrow && temporary) assert.equal(fs.existsSync(temporary), true, 'failed own temporary remains; no cleanup by name');
  return { didThrow, error, value, secondary, closes, renames, unlinks, temporary, file };
}
test('actual history read/write/locator/window bodies preserve a first failure including falsy values through close refusal', () => {
  const phases = { read: ['stat', 'read'], write: ['write', 'flush'],
    locator: ['parent', 'write', 'flush', 'stat'], window: ['write', 'flush'] };
  for (const [kind, operations] of Object.entries(phases)) for (const phase of operations)
    for (const primary of [Object.freeze(new Error('primary')), undefined, null, false, 0, '']) {
      const result = localHistoryIoCase(kind, phase, { primary });
      assert.equal(result.didThrow, true, kind + '/' + phase);
      assert.strictEqual(result.error, primary, kind + '/' + phase);
      assert.equal(result.closes, 1); assert.equal(result.renames, 0); assert.equal(result.unlinks, 0);
    }
});
test('actual history close-only and failed-open paths never return success, rename or close twice', () => {
  for (const kind of ['read', 'write', 'locator', 'window']) {
    for (const close of [Object.freeze(new Error('close')), undefined, null, false, 0, '']) {
      const result = localHistoryIoCase(kind, 'none', { close });
      assert.equal(result.didThrow, true); assert.strictEqual(result.error, close);
      assert.equal(result.closes, 1); assert.equal(result.renames, 0); assert.equal(result.unlinks, 0);
    }
    const primary = Object.freeze(new Error('open'));
    const result = localHistoryIoCase(kind, 'open', { primary });
    assert.equal(result.didThrow, true); assert.strictEqual(result.error, primary);
    assert.equal(result.closes, 0); assert.equal(result.renames, 0); assert.equal(result.unlinks, 0);
  }
  const parsed = localHistoryIoCase('read', 'parse');
  assert.equal(parsed.didThrow, true); assert.equal(parsed.error.name, 'SyntaxError');
  assert.notStrictEqual(parsed.error, parsed.secondary); assert.equal(parsed.closes, 1);
  const zero = localHistoryIoCase('read', 'none', { zero: true, closeFailure: false });
  assert.equal(zero.didThrow, false); assert.equal(zero.value.batch_id, row(20).token);
  assert.equal(zero.closes, 1);
});

test('actual child publishes the first summary under the index lock; full second snapshot succeeds', () => {
  const f = fixture(), state = row(1), readdir = fs.readdirSync;
  let scans = 0, children = 0;
  const result = patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && ++scans === 1) { childSave(state); children++; }
    return names;
  } }, () => store.readRecentHistory());
  assert.equal(children, 1); assert.equal(scans, 4);
  assert.deepEqual(result, [{ batch_id: state.token, created_at: state.created_at }]);
  assert.deepEqual(store.readRecentHistory(), result);
});

test('two actual membership publications reach the third full snapshot, never a mixed projection', () => {
  const f = fixture(), readdir = fs.readdirSync; let scans = 0;
  const result = patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && [1, 3].includes(++scans)) childSave(row(scans));
    return names;
  } }, () => store.readRecentHistory());
  assert.equal(scans, 6);
  assert.deepEqual(result.map(value => value.batch_id), [row(3).token, row(1).token]);
});

test('third actual membership change is final; no fourth scan and no index', () => {
  const f = fixture(), readdir = fs.readdirSync; let scans = 0;
  patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && [1, 3, 5].includes(++scans)) childSave(row(scans));
    return names;
  } }, () => unavailable(() => store.readRecentHistory()));
  assert.equal(scans, 6); noIndex(f);
});

function publicationFixture(kind) {
  const f = fixture(), state = row(8);
  const next = { ...state, items: [{ id: 'a'.repeat(32), status: 'stopped' }] };
  let target, sequence = 0;
  if (kind === 'summary') target = save(f, state);
  else {
    const name = `re_${sha(state.token).slice(0, 32)}.json`;
    fs.writeFileSync(path.join(f.exports, name), JSON.stringify({ schema: 'datasecure-result-export/2',
      product_channel: 'standalone', run_directory: 'Lauf-20261018-120000-1234abcd', items: [] }));
    const owner = path.join(f.data, 'result-export-owners', name), journal = path.join(f.data, 'batches', `${state.token}.json`);
    fs.writeFileSync(owner, JSON.stringify({ schema: 'datasecure-content-export-owner/1', product_channel: 'standalone',
      record_name: name, batch_id: state.token }));
    fs.writeFileSync(journal, JSON.stringify(state));
    target = kind === 'owner' ? owner : journal;
  }
  const before = fs.readFileSync(target), identity = fs.lstatSync(target, { bigint: true });
  const expected = kind === 'summary' ? Buffer.from(JSON.stringify(store.summarizeState(next))) : before;
  const publish = () => {
    if (kind === 'summary') childSave(next);
    else {
      const temporary = `${target}.replacement-${++sequence}`;
      fs.copyFileSync(target, temporary, fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporary, target);
    }
  };
  return { f, state, target, before, identity, expected, publish };
}
for (const kind of ['summary', 'owner', 'journal']) {
  test(`actual ${kind} publication during held read proves either replacement or native Windows refusal`, () => {
    const p = publicationFixture(kind), { f, state, target } = p;
    const open = fs.openSync, close = fs.closeSync, read = fs.readSync;
    const handles = new Set(); let injected = false, opens = 0, closes = 0, publisherError, readError, result;
    try {
      result = patched({
        openSync(file, ...args) { const fd = open.call(this, file, ...args); if (file === target) { handles.add(fd); opens++; } return fd; },
        closeSync(fd) { if (handles.delete(fd)) closes++; return close.call(this, fd); },
        readSync(fd, ...args) {
          const count = read.call(this, fd, ...args);
          if (handles.has(fd) && !injected) {
            injected = true;
            try { p.publish(); } catch (error) { publisherError = error; throw error; }
          }
          return count;
        }
      }, () => store.readRecentHistory());
    } catch (error) { readError = error; }
    assert.equal(injected, true); assert.equal(handles.size, 0); assert.equal(closes, opens);
    if (publisherError) {
      // The synchronous writer barrier cannot finish while this host refuses
      // rename over the held reader. No publication happened: retrying would
      // merely wash away the publisher's failure and return the old record.
      assert.equal(process.platform, 'win32');
      assert.match(publisherError.code === 'EPERM' ? publisherError.code : publisherError.message, /EPERM/u);
      assert.equal(readError?.code, 'BOUND_FILE_CHANGED'); assert.equal(opens, 1); noIndex(f);
      assert.deepEqual(fs.readFileSync(target), p.before);
      const now = fs.lstatSync(target, { bigint: true });
      for (const key of ['dev', 'ino', 'birthtimeNs', 'ctimeNs', 'mtimeNs', 'size', 'nlink']) assert.equal(now[key], p.identity[key], key);
      // A separate real publication after confirmed close must succeed; no
      // rights/open-flag change or product retry is used for this control.
      p.publish();
      assert.notEqual(fs.lstatSync(target, { bigint: true }).ino, p.identity.ino);
      result = store.readRecentHistory();
    } else {
      assert.equal(readError, undefined); assert.equal(opens, 2);
      assert.notEqual(fs.lstatSync(target, { bigint: true }).ino, p.identity.ino);
    }
    assert.deepEqual(fs.readFileSync(target), p.expected);
    assert.deepEqual(result, [{ batch_id: state.token, created_at: state.created_at }]);
  });
  test(`actual ${kind} pre-open publication restarts the full snapshot from the same original parents`, () => {
    const p = publicationFixture(kind), open = fs.openSync, close = fs.closeSync;
    const handles = new Set(); let injected = false, opens = 0, closes = 0;
    const result = patched({
      openSync(file, ...args) {
        if (file === p.target && !injected) { injected = true; p.publish(); }
        const fd = open.call(this, file, ...args); if (file === p.target) { handles.add(fd); opens++; } return fd;
      },
      closeSync(fd) { if (handles.delete(fd)) closes++; return close.call(this, fd); }
    }, () => store.readRecentHistory());
    assert.equal(injected, true); assert.equal(opens, 2); assert.equal(closes, 2); assert.equal(handles.size, 0);
    assert.notEqual(fs.lstatSync(p.target, { bigint: true }).ino, p.identity.ino);
    assert.deepEqual(fs.readFileSync(p.target), p.expected);
    assert.deepEqual(result, [{ batch_id: p.state.token, created_at: p.state.created_at }]);
    assert.equal(fs.readdirSync(p.f.summaries).some(value => value.startsWith('legacy-')), false);
  });
}

test('same-name replacement after the held read is caught by the final record snapshot', () => {
  const f = fixture(), state = row(4); save(f, state);
  const readdir = fs.readdirSync; let scans = 0;
  const result = patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && ++scans === 2) childSave({ ...state, items: [{ id: 'b'.repeat(32), status: 'stopped' }] });
    return names;
  } }, () => store.readRecentHistory());
  assert.equal(scans, 4); assert.equal(result[0].batch_id, state.token);
});

for (const parent of ['standalone-run-history', 'result-export-state', 'result-export-owners', 'batches']) {
  test(`replacement ${parent} is never rebound on a retry`, () => {
    const f = fixture(), readdir = fs.readdirSync, target = path.join(f.data, parent); let scans = 0;
    patched({ readdirSync(file, ...args) {
      const names = readdir.call(this, file, ...args);
      if (file === f.summaries && ++scans === 1) {
        fs.renameSync(target, `${target}-original`); fs.mkdirSync(target, { mode: 0o700 });
      }
      return names;
    } }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_CHANGED'));
    assert.equal(scans, 1); noIndex(f);
    assert.deepEqual(readdir(target), [], 'replacement namespace receives no projection or locator');
  });
}

test('initially absent export directory appearing during the scan fails closed, without rebinding', () => {
  const f = fixture({ exports: false }), readdir = fs.readdirSync; let scans = 0;
  patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && ++scans === 1) fs.mkdirSync(f.exports, { mode: 0o700 });
    return names;
  } }, () => unavailable(() => store.readRecentHistory()));
  assert.equal(scans, 1); noIndex(f);
});

test('UNSAFE hardlink substitution is final and reads no unchecked bytes', () => {
  const f = fixture(), file = save(f, row(5)), lstat = fs.lstatSync, read = fs.readSync, open = fs.openSync, close = fs.closeSync;
  const handles = new Set();
  let leafStats = 0, reads = 0;
  patched({
    lstatSync(target, ...args) {
      if (target === file && ++leafStats === 2) fs.linkSync(file, `${file}.second-link`);
      return lstat.call(this, target, ...args);
    },
    openSync(target, ...args) { const fd = open.call(this, target, ...args); if (target === file) handles.add(fd); return fd; },
    closeSync(fd) { handles.delete(fd); return close.call(this, fd); },
    readSync(fd, ...args) { if (handles.has(fd)) reads++; return read.call(this, fd, ...args); }
  }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_UNSAFE'));
  assert.equal(leafStats, 2); assert.equal(reads, 0); noIndex(f);
});

test('unconfirmed close is final, with no second read and no leaked descriptor', () => {
  const f = fixture(), file = save(f, row(6)), open = fs.openSync, close = fs.closeSync;
  const handles = new Set(); let opens = 0, closes = 0;
  patched({ openSync(target, ...args) {
    const fd = open.call(this, target, ...args); if (target === file) { opens++; handles.add(fd); } return fd;
  }, closeSync(fd) {
    const target = handles.delete(fd); close.call(this, fd);
    if (target) { closes++; throw Error('synthetic close refusal after actual close'); }
  } }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_CLOSE_FAILED'));
  assert.equal(opens, 1); assert.equal(closes, 1); assert.equal(handles.size, 0); noIndex(f);
});

test('stable damaged JSON and unsupported summary schema are skipped, never retried or repaired', () => {
  const f = fixture(), readdir = fs.readdirSync; let scans = 0;
  fs.writeFileSync(path.join(f.summaries, `${sha('damaged')}.json`), '{damaged');
  fs.writeFileSync(path.join(f.summaries, `${sha('unsupported')}.json`), JSON.stringify({ schema: 'unknown/1' }));
  const result = patched({ readdirSync(file, ...args) { if (file === f.summaries) scans++; return readdir.call(this, file, ...args); } },
    () => store.readRecentHistory());
  assert.deepEqual(result, []); assert.equal(scans, 2);
  assert.equal(fs.readFileSync(path.join(f.summaries, `${sha('damaged')}.json`), 'utf8'), '{damaged');
});

test('entry budget is shared across full scan attempts (explicit adversarial inventory seam)', () => {
  const f = fixture(), readdir = fs.readdirSync; let scans = 0;
  const inventory = Array.from({ length: 6000 }, (_, index) => `${index.toString(16).padStart(64, '0')}.json`);
  patched({ readdirSync(file, ...args) {
    if (file === f.summaries) { scans++; return inventory; }
    return readdir.call(this, file, ...args);
  } }, () => unavailable(() => store.readRecentHistory()));
  assert.equal(scans, 2); noIndex(f);
});

test('a generic failed read is final even after actual bytes were read; it cannot buy another snapshot', () => {
  const f = fixture(), files = Array.from({ length: 33 }, (_, index) => legacy(f, index + 1, 1024 * 1024));
  const open = fs.openSync, close = fs.closeSync, read = fs.readSync, readdir = fs.readdirSync;
  const handles = new Map(); let injected = false, actualBytes = 0, scans = 0;
  patched({ openSync(target, ...args) { const fd = open.call(this, target, ...args); handles.set(fd, target); return fd; },
    closeSync(fd) { handles.delete(fd); return close.call(this, fd); },
    readSync(fd, ...args) {
      const count = read.call(this, fd, ...args); actualBytes += count;
      if (!injected && handles.get(fd) === files[32]) { injected = true; throw Error('failure after actual bytes were read'); }
      return count;
    }, readdirSync(file, ...args) { if (file === f.summaries) scans++; return readdir.call(this, file, ...args); }
  }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_CHANGED'));
  assert.equal(injected, true); assert.equal(scans, 1); assert.ok(actualBytes <= 64 * 1024 * 1024);
  assert.equal(handles.size, 0); noIndex(f);
});

test('actual replacement in a completed snapshot cannot reset the cumulative 64 MiB read budget', () => {
  const f = fixture(), files = Array.from({ length: 33 }, (_, index) => legacy(f, index + 1, 1024 * 1024));
  const open = fs.openSync, close = fs.closeSync, read = fs.readSync, readdir = fs.readdirSync;
  const handles = new Map(), legacyFiles = new Set(files);
  let injected = false, actualBytes = 0, scans = 0, locatorWrites = 0;
  patched({
    openSync(target, ...args) {
      const fd = open.call(this, target, ...args); if (legacyFiles.has(target)) handles.set(fd, target);
      if (path.basename(String(target)).startsWith('legacy-') && String(target).endsWith('.tmp')) locatorWrites++;
      return fd;
    },
    closeSync(fd) { handles.delete(fd); return close.call(this, fd); },
    readSync(fd, ...args) {
      const count = read.call(this, fd, ...args);
      if (legacyFiles.has(handles.get(fd))) actualBytes += count;
      return count;
    },
    readdirSync(file, ...args) {
      const names = readdir.call(this, file, ...args);
      if (file === f.summaries && ++scans === 2) {
        assert.equal(actualBytes, 33 * 1024 * 1024);
        assert.equal(handles.size, 0, 'replacement here occurs after every held read closed');
        fs.copyFileSync(files[32], files[32] + '.replacement');
        fs.renameSync(files[32] + '.replacement', files[32]); injected = true;
      }
      return names;
    }
  }, () => unavailable(() => store.readRecentHistory()));
  assert.equal(injected, true); assert.equal(scans, 3);
  assert.equal(actualBytes, 64 * 1024 * 1024); assert.equal(handles.size, 0);
  assert.equal(locatorWrites, 0); noIndex(f);
});
test('generic IO, forged public change codes and same-object mutation do not retry migration reads', () => {
  for (const fault of ['EIO', 'EACCES', 'BOUND_FILE_CHANGED', 'inplace']) {
    const f = fixture(), file = save(f, row(23)), open = fs.openSync, close = fs.closeSync, read = fs.readSync, readdir = fs.readdirSync;
    const handles = new Set(); let opens = 0, closes = 0, scans = 0;
    patched({
      openSync(target, ...args) { const fd = open.call(this, target, ...args); if (target === file) { handles.add(fd); opens++; } return fd; },
      closeSync(fd) { if (handles.delete(fd)) closes++; return close.call(this, fd); },
      readSync(fd, ...args) {
        const count = read.call(this, fd, ...args);
        if (handles.has(fd)) {
          if (fault === 'inplace') fs.appendFileSync(file, ' ');
          else throw Object.assign(new Error('fixed synthetic read refusal'), { code: fault });
        }
        return count;
      },
      readdirSync(target, ...args) { if (target === f.summaries) scans++; return readdir.call(this, target, ...args); }
    }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_CHANGED'));
    assert.equal(opens, 1); assert.equal(closes, 1); assert.equal(scans, 1);
    assert.equal(handles.size, 0); noIndex(f);
  }
});
test('an ENOENT code with a still-present leaf cannot restart migration', () => {
  const f = fixture(), file = save(f, row(24)), lstat = fs.lstatSync, readdir = fs.readdirSync;
  const primary = Object.freeze(Object.assign(new Error('one synthetic missing response'), { code: 'ENOENT' }));
  let stats = 0, scans = 0;
  patched({
    lstatSync(target, ...args) {
      if (target === file && ++stats === 2) throw primary;
      return lstat.call(this, target, ...args);
    },
    readdirSync(target, ...args) { if (target === f.summaries) scans++; return readdir.call(this, target, ...args); }
  }, () => assert.throws(() => store.readRecentHistory(), error => error === primary));
  assert.equal(stats, 3); assert.equal(scans, 1); assert.equal(fs.existsSync(file), true); noIndex(f);
});
test('actual leaf disappearance between outer metadata and held-reader lstat restarts only the whole snapshot', () => {
  const f = fixture(), file = save(f, row(25)), lstat = fs.lstatSync, readdir = fs.readdirSync;
  let stats = 0, scans = 0, removed = false;
  const rows = patched({
    lstatSync(target, ...args) {
      if (target === file && ++stats === 2) { fs.renameSync(file, file + '.removed'); removed = true; }
      return lstat.call(this, target, ...args);
    },
    readdirSync(target, ...args) { if (target === f.summaries) scans++; return readdir.call(this, target, ...args); }
  }, () => store.readRecentHistory());
  assert.equal(removed, true); assert.deepEqual(rows, []); assert.equal(scans, 3);
  assert.equal(fs.existsSync(file), false);
});
test('actual window reads retry only privately classified replacement, never generic codes or changed-then-absence', () => {
  const bound = require('../plugins/data-secure/server/core/bound-file-io');
  const api = historyInternals(windowFile, ['read']);
  for (const mode of ['replace', 'replace-missing', 'EIO', 'BOUND_FILE_CHANGED', 'fake-ENOENT']) {
    const f = fixture(), target = path.join(f.data, 'standalone-history-window');
    fs.mkdirSync(target, { mode: 0o700 });
    const file = path.join(target, 'recent.json'), bytes = JSON.stringify({ schema: 'datasecure-standalone-history-window/1', entries: [] });
    fs.writeFileSync(file, bytes);
    const directory = bound.bindDirectory(target), open = fs.openSync, close = fs.closeSync, read = fs.readSync, lstat = fs.lstatSync;
    const held = new Set(); let opens = 0, closes = 0, stats = 0;
    const action = () => patched({
      lstatSync(name, ...args) {
        if (name === file && ++stats === 1 && mode === 'fake-ENOENT') throw Object.assign(new Error('not absent'), { code: 'ENOENT' });
        return lstat.call(this, name, ...args);
      },
      openSync(name, ...args) {
        if (name === file) {
          opens++;
          if (opens === 1 && mode.startsWith('replace')) {
            fs.writeFileSync(file + '.next', bytes); fs.renameSync(file + '.next', file);
          }
        }
        const fd = open.call(this, name, ...args); if (name === file) held.add(fd); return fd;
      },
      readSync(fd, ...args) {
        if (held.has(fd) && ['EIO', 'BOUND_FILE_CHANGED'].includes(mode))
          throw Object.assign(new Error('fixed read refusal'), { code: mode });
        return read.call(this, fd, ...args);
      },
      closeSync(fd) {
        const own = held.delete(fd); close.call(this, fd);
        if (own) { closes++; if (closes === 1 && mode === 'replace-missing') fs.renameSync(file, file + '.removed'); }
      }
    }, () => api.read(directory));
    if (mode === 'replace') {
      const result = action(); assert.equal(result.entries.length, 0); assert.equal(opens, 2); assert.equal(closes, 2);
    } else {
      unavailable(action); assert.equal(opens, mode === 'fake-ENOENT' ? 0 : 1); assert.equal(closes, opens);
    }
    assert.equal(held.size, 0);
    assert.equal(fs.readdirSync(target).some(name => name.endsWith('.tmp')), false, 'read-only refusal creates no replacement index');
  }
  const f = fixture(), target = path.join(f.data, 'standalone-history-window');
  fs.mkdirSync(target, { mode: 0o700 });
  assert.equal(api.read(bound.bindDirectory(target)), null, 'only genuine first absence admits migration');
});

test('legacy locator writes wait for the stable attempt and preserve exact legacy identity/five-row limit', () => {
  const f = fixture(), readdir = fs.readdirSync, open = fs.openSync;
  for (let index = 1; index <= 6; index++) legacy(f, index);
  let scans = 0, locatorWrites = 0;
  const result = patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && ++scans === 1) {
      assert.equal(names.some(name => name.startsWith('legacy-')), false);
      childSave(row(7));
    }
    return names;
  }, openSync(target, ...args) {
    if (typeof target === 'string' && path.basename(target).startsWith('legacy-') && target.endsWith('.tmp')) {
      locatorWrites++; assert.equal(scans, 4, 'no locator writes for an abandoned snapshot');
    }
    return open.call(this, target, ...args);
  } }, () => store.readRecentHistory());
  assert.equal(result.length, 5); assert.equal(result[0].batch_id, row(7).token); assert.equal(locatorWrites, 4);
  for (const entry of result.filter(entry => entry.legacy_export_id)) {
    assert.equal(entry.batch_id, sha(`standalone-history:${entry.legacy_export_id}`));
    assert.equal(store.readHistoryLocator(entry.batch_id), entry.legacy_export_id);
  }
  assert.equal(readdir(f.exports).length, 6, 'migration never repairs or retires old exports');
});

test('three abandoned snapshots produce no legacy locator writes', () => {
  const f = fixture(), readdir = fs.readdirSync, open = fs.openSync; legacy(f);
  let scans = 0, writes = 0;
  patched({ readdirSync(file, ...args) {
    const names = readdir.call(this, file, ...args);
    if (file === f.summaries && [1, 3, 5].includes(++scans)) childSave(row(scans));
    return names;
  }, openSync(target, ...args) {
    if (typeof target === 'string' && path.basename(target).startsWith('legacy-') && target.endsWith('.tmp')) writes++;
    return open.call(this, target, ...args);
  } }, () => unavailable(() => store.readRecentHistory()));
  assert.equal(scans, 6); assert.equal(writes, 0); noIndex(f);
  assert.equal(readdir(f.summaries).some(name => name.startsWith('legacy-')), false);
});

test('parent exchange at locator temp open prevents payload/rename into the replacement directory', () => {
  const f = fixture(), open = fs.openSync, write = fs.writeSync, rename = fs.renameSync;
  legacy(f); let exchanged = false, payloadWrites = 0, locatorRenames = 0, held;
  patched({ openSync(target, ...args) {
    if (typeof target === 'string' && path.basename(target).startsWith('legacy-') && target.endsWith('.tmp')) {
      exchanged = true; rename.call(fs, f.summaries, `${f.summaries}-original`); fs.mkdirSync(f.summaries, { mode: 0o700 });
      held = open.call(this, target, ...args); return held;
    }
    return open.call(this, target, ...args);
  }, writeSync(fd, ...args) { if (fd === held) payloadWrites++; return write.call(this, fd, ...args); },
    renameSync(from, to) { if (path.basename(to).startsWith('legacy-')) locatorRenames++; return rename.call(this, from, to); }
  }, () => assert.throws(() => store.readRecentHistory(), error => error.code === 'BOUND_FILE_CHANGED'));
  assert.equal(exchanged, true); assert.equal(payloadWrites, 0); assert.equal(locatorRenames, 0); noIndex(f);
  assert.throws(() => fs.fstatSync(held), error => error.code === 'EBADF');
  assert.equal(fs.readdirSync(f.summaries).some(name => /^legacy-[a-f0-9]{64}\.json$/u.test(name)), false);
});

test('an oversized skipped leaf replaced by a real same-name summary is not lost', () => {
  const f = fixture(), state = row(12), file = path.join(f.summaries, `${state.token}.json`);
  fs.writeFileSync(file, Buffer.alloc(32769, 32));
  const lstat = fs.lstatSync, readdir = fs.readdirSync;
  let replaced = false, scans = 0;
  const result = patched({
    lstatSync(target, ...args) {
      const before = lstat.call(this, target, ...args);
      if (target === file && !replaced) { replaced = true; childSave(state); }
      return before;
    },
    readdirSync(target, ...args) { if (target === f.summaries) scans++; return readdir.call(this, target, ...args); }
  }, () => store.readRecentHistory());
  assert.equal(replaced, true); assert.equal(scans, 4);
  assert.deepEqual(result, [{ batch_id: state.token, created_at: state.created_at }]);
});

done(() => {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnvironment, key)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('datasecure-migration-race-'));
  const currentRoot = fs.lstatSync(root, { bigint: true });
  assert.ok(currentRoot.isDirectory() && !currentRoot.isSymbolicLink());
  assert.equal(currentRoot.dev, rootIdentity.dev); assert.equal(currentRoot.ino, rootIdentity.ino);
  assert.equal(fs.realpathSync.native(root), root);
  // Every fixture is synthetic and created by this suite; no links to user
  // data are created. Refuse cleanup rather than traverse a foreign reparse.
  const inspect = directory => {
    for (const entry of fs.readdirSync(directory)) {
      const target = path.join(directory, entry), stat = fs.lstatSync(target);
      assert.equal(stat.isSymbolicLink(), false, 'cleanup never follows a link');
      if (stat.isDirectory()) inspect(target);
    }
  };
  inspect(root); fs.rmSync(root, { recursive: true, force: false });
});
