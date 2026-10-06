'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBatchDelivery } = require('../plugins/data-secure/server/gateway/batch-delivery');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch delivery boundary');
const token = 'a'.repeat(64);
const ids = ['1', '2', '3'].map((character) => `ds_${character.repeat(32)}`);

function item(index, status = 'delivery_pending', options = {}) {
  return {
    package_id: ids[index],
    status,
    checkpoint: status,
    work_name: `${String(index + 1).padStart(3, '0')}_${String(index + 1).repeat(24)}.txt`,
    analysis_acknowledged: options.acknowledged === true,
    work_copy_cleanup_pending: options.cleanupPending === true
  };
}

function fixture(options = {}) {
  const events = [];
  const active = options.active || new Set();
  const packages = new Set(options.packages || ids);
  const files = new Map(options.files || []);
  let durable = structuredClone(options.state || {
    token,
    items: [item(0)],
    complete: true
  });
  let failWrite = options.failWrite === true;
  const delivery = createBatchDelivery({
    active,
    path: { join: (left, right) => `${left}/${right}` },
    workPath: (batchToken) => `work:${batchToken}`,
    io: {
      constants: { O_RDONLY: 0 },
      openSync(target) { return target; },
      fstatSync(target) { return { isFile: () => files.get(target) === 'file' }; },
      readSync(_fd, buffer, offset, length) {
        buffer.fill(0, offset, offset + length);
        return length;
      },
      closeSync() {},
      existsSync(target) { events.push(`exists:${target}`); return files.has(target); },
      lstatSync(target) {
        events.push(`lstat:${target}`);
        const type = files.get(target);
        return {
          isFile: () => type === 'file',
          isSymbolicLink: () => type === 'symlink'
        };
      },
      unlinkSync(target) {
        events.push(`unlink:${target}`);
        if (options.unlinkFailure === target) throw new Error('UNLINK_FAILED');
        files.delete(target);
      }
    },
    acquireActiveLock(batchToken) {
      events.push(`acquire:${batchToken}`);
      if (options.acquireError) throw options.acquireError;
    },
    releaseActiveLock(batchToken) {
      events.push(`release:${batchToken}`);
      if (options.releaseError) throw options.releaseError;
      return options.refuseRelease !== true;
    },
    readState(batchToken) {
      events.push(`read:${batchToken}`);
      if (options.readError) throw options.readError;
      return structuredClone(durable);
    },
    writeState(state) {
      events.push('write');
      if (failWrite) throw new Error('WRITE_FAILED');
      durable = structuredClone(state);
    },
    assertLocalExecutorAccess(_state, pid) {
      events.push(`access:${pid ?? 'default'}`);
      if (options.accessError) throw options.accessError;
    },
    regularPublishedPackage(packageId) {
      events.push(`verify:${packageId}`);
      return packages.has(packageId);
    },
    issueReadCapability(packageId) {
      events.push(`issue:${packageId}`);
      return { read_capability: 'c'.repeat(43), read_capability_expires_at: '2026-08-26T12:00:00.000Z' };
    },
    publicProgress: (state) => ({ complete: state.items.every((entry) => entry.status === 'released') }),
    writeTerminalEvidence(state) {
      if (state.terminal_evidence?.status === 'exported') return true;
      events.push('evidence');
      return true;
    },
    deliveryPendingStatus: 'delivery_pending',
    mappingPendingStatus: 'mapping_pending'
  });
  return {
    delivery,
    events,
    files,
    durable: () => structuredClone(durable),
    allowWrite() { failWrite = false; }
  };
}

function workName(entry) {
  return `work:${token}/${entry.work_name}`;
}

test('a capability is issued only after the exact published package verifies', () => {
  const value = item(0);
  const denied = fixture({ packages: [] });
  assert.throws(() => denied.delivery.deliveryResult({ items: [value] }, value), /sicher verifiziert/);
  assert.ok(!denied.events.some((event) => event.startsWith('issue:')));

  const allowed = fixture();
  const result = allowed.delivery.deliveryResult({ items: [value] }, value);
  assert.strictEqual(result.package_id, ids[0]);
  assert.strictEqual(result.read_capability, 'c'.repeat(43));
  assert.deepStrictEqual(allowed.events.slice(-2), [`verify:${ids[0]}`, `issue:${ids[0]}`]);
});

test('multi-ack validates the complete page before any state or byte mutation', () => {
  const first = item(0);
  const second = item(1);
  const firstPath = workName(first);
  const secondPath = workName(second);
  const denied = fixture({
    state: { token, items: [first, second] },
    packages: [ids[0]],
    files: [[firstPath, 'file'], [secondPath, 'file']]
  });
  assert.throws(() => denied.delivery.acknowledgeDeliveredPackages(token, ids.slice(0, 2)), /mindestens ein Paket/);
  assert.deepStrictEqual(denied.durable().items.map((entry) => entry.status), ['delivery_pending', 'delivery_pending']);
  assert.ok(!denied.events.includes('write'));
  assert.ok(!denied.events.some((event) => event.startsWith('unlink:')));
  assert.strictEqual(denied.events.filter((event) => event.startsWith('release:')).length, 1);

  const allowed = fixture({
    state: { token, items: [first, second] },
    files: [[firstPath, 'file'], [secondPath, 'file']]
  });
  const result = allowed.delivery.acknowledgeDeliveredPackages(token, ids.slice(0, 2));
  assert.strictEqual(result.acknowledged_count, 2);
  assert.deepStrictEqual(allowed.durable().items.map((entry) => entry.status), ['released', 'released']);
  assert.strictEqual(allowed.events.filter((event) => event === 'write').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event === 'evidence').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event.startsWith('unlink:')).length, 2);
});

test('repeated single and page acknowledgements are durable no-ops', () => {
  const released = item(0, 'released', { acknowledged: true });
  const value = fixture({ state: { token, items: [released], terminal_evidence: { status: 'exported' } } });
  value.delivery.acknowledgeDeliveredPackage(token, ids[0]);
  value.delivery.acknowledgeDeliveredPackages(token, [ids[0]]);
  assert.strictEqual(value.events.filter((event) => event === 'write').length, 0);
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 2);
});

test('a repeated acknowledgement repairs missing terminal evidence without touching package state or bytes', () => {
  const released = item(0, 'released', { acknowledged: true });
  const value = fixture({ state: { token, items: [released] } });
  const result = value.delivery.acknowledgeDeliveredPackage(token, ids[0]);
  assert.strictEqual(result.local_evidence_exported, true);
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 1);
  assert.strictEqual(value.events.filter((event) => event === 'write').length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 0);
  assert.strictEqual(value.durable().items[0].status, 'released');
});

test('a journal failure after byte cleanup remains retryable and releases the lock', () => {
  const pending = item(0);
  const target = workName(pending);
  const value = fixture({
    state: { token, items: [pending] },
    files: [[target, 'file']],
    failWrite: true
  });
  assert.throws(() => value.delivery.acknowledgeDeliveredPackage(token, ids[0]), /WRITE_FAILED/);
  assert.strictEqual(value.files.has(target), false);
  assert.strictEqual(value.durable().items[0].status, 'delivery_pending');
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);

  value.allowWrite();
  const retried = value.delivery.acknowledgeDeliveredPackage(token, ids[0]);
  assert.strictEqual(retried.ok, true);
  assert.strictEqual(value.durable().items[0].status, 'released');
  assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 1);
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 1);
});

test('lock, read and executor-access failures cannot mutate state', () => {
  const blocked = fixture({ acquireError: new Error('BUSY') });
  assert.throws(() => blocked.delivery.acknowledgeDeliveredPackage(token, ids[0]), /BUSY/);
  assert.strictEqual(blocked.events.filter((event) => event.startsWith('release:')).length, 0);

  for (const options of [{ readError: new Error('READ_FAILED') }, { accessError: new Error('ACCESS_FAILED') }]) {
    const value = fixture(options);
    assert.throws(() => value.delivery.acknowledgeDeliveredPackage(token, ids[0]));
    assert.strictEqual(value.events.filter((event) => event === 'write').length, 0);
    assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 0);
    assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);
  }
});

test('a refused or failed lock release cannot report delivery success', () => {
  for (const options of [{ refuseRelease: true }, { releaseError: new Error('EPERM') }]) {
    const value = fixture(options);
    assert.throws(() => value.delivery.acknowledgeDeliveredPackage(token, ids[0]), /nicht sicher freigegeben/u);
  }
});

test('terminal cleanup rejects names, links and directories and retries only a regular bound file', () => {
  const invalid = item(0, 'released', { cleanupPending: true });
  invalid.work_name = '../outside.txt';
  const value = fixture({ state: { token, items: [invalid] } });
  assert.deepStrictEqual(value.delivery.retryReleasedWorkCopyCleanup(value.durable()), { changed: false, pending: 1 });

  for (const type of ['symlink', 'directory']) {
    const candidate = item(0, 'released', { cleanupPending: true });
    const target = workName(candidate);
    const guarded = fixture({ state: { token, items: [candidate] }, files: [[target, type]] });
    const state = guarded.durable();
    assert.deepStrictEqual(guarded.delivery.retryReleasedWorkCopyCleanup(state), { changed: false, pending: 1 });
    assert.strictEqual(guarded.files.has(target), true);
  }

  const regular = item(0, 'released', { cleanupPending: true });
  const target = workName(regular);
  const retried = fixture({ state: { token, items: [regular] }, files: [[target, 'file']] });
  const state = retried.durable();
  assert.deepStrictEqual(retried.delivery.retryReleasedWorkCopyCleanup(state), { changed: true, pending: 0 });
  assert.strictEqual(retried.files.has(target), false);
  assert.strictEqual(Object.hasOwn(state.items[0], 'work_copy_cleanup_pending'), false);
});

test('local finalization verifies before mutation and writes one terminal state', () => {
  const pending = item(0);
  const denied = fixture({ state: { token, items: [pending] }, packages: [] });
  assert.throws(() => denied.delivery.finalizePublishedPackageLocally(token, ids[0]), /sicher abgeschlossen/);
  assert.strictEqual(denied.durable().items[0].status, 'delivery_pending');
  assert.ok(!denied.events.includes('write'));
  assert.strictEqual(denied.events.filter((event) => event.startsWith('release:')).length, 1);

  const target = workName(pending);
  const allowed = fixture({ state: { token, items: [pending] }, files: [[target, 'file']] });
  const result = allowed.delivery.finalizePublishedPackageLocally(token, ids[0]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(allowed.durable().items[0].checkpoint, 'released_locally');
  assert.strictEqual(allowed.durable().items[0].analysis_acknowledged, false);
  assert.strictEqual(allowed.events.filter((event) => event === 'write').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event === 'evidence').length, 1);
});

test('all terminal cleanup callers preserve renamed legacy magic with bounded short reads', () => {
  const candidate = item(0, 'stopped', { cleanupPending: true });
  candidate.work_name = '001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy';
  const bytes = Buffer.from('DSARTF01legacy ciphertext, not a real secret');
  let readBytes = 0;
  let unlinks = 0;
  const stat = { dev: 1, ino: 2, size: bytes.length, mtimeMs: 1, isFile: () => true, isSymbolicLink: () => false };
  const delivery = createBatchDelivery({
    workPath: () => 'owned-work',
    io: {
      constants: { O_RDONLY: 0 }, existsSync: () => true,
      lstatSync: () => stat, fstatSync: () => stat,
      openSync: () => 7, closeSync() {},
      readSync(_fd, buffer, offset, length, position) {
        const count = Math.min(2, length);
        bytes.copy(buffer, offset, position, position + count);
        readBytes += count;
        return count;
      },
      unlinkSync() { unlinks++; }
    }
  });
  assert.throws(() => delivery.cleanupTerminalWorkCopy({ token }, candidate), (error) =>
    error.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
  assert.strictEqual(readBytes, 8);
  assert.strictEqual(unlinks, 0);
  assert.strictEqual(candidate.work_copy_cleanup_pending, true);
});

test('whole-work cleanup preflights siblings and leaves unexpected nested trees untouched', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-cleanup-guard-'));
  const previous = { privacy: process.env.EU_PRIVACY_ROOT, local: process.env.LOCALAPPDATA };
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.LOCALAPPDATA = path.join(base, 'localapp');
  const { workPath, safeRemoveWorkDirectory } = require('../plugins/data-secure/server/gateway/batch-private-store');
  try {
    const work = workPath(token);
    fs.mkdirSync(work);
    const first = path.join(work, '001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy');
    const second = path.join(work, '002_bbbbbbbbbbbbbbbbbbbbbbbb.workcopy');
    fs.writeFileSync(first, 'plain synthetic copy');
    fs.writeFileSync(second, 'DSARTF01synthetic legacy envelope');
    assert.throws(() => safeRemoveWorkDirectory(token));
    assert.strictEqual(fs.readFileSync(first, 'utf8'), 'plain synthetic copy');
    assert.strictEqual(fs.readFileSync(second, 'utf8'), 'DSARTF01synthetic legacy envelope');
    fs.writeFileSync(second, 'plain synthetic second copy');
    const temporary = path.join(work, '.001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy.cccccccccccccccccccccccc.tmp');
    fs.linkSync(first, temporary);
    safeRemoveWorkDirectory(token);
    assert.strictEqual(fs.existsSync(work), false);
    fs.mkdirSync(work);
    fs.writeFileSync(first, 'an external hard link is not owned');
    const original = path.join(base, 'synthetic-original.txt');
    fs.linkSync(first, original);
    assert.throws(() => safeRemoveWorkDirectory(token));
    assert.strictEqual(fs.readFileSync(original, 'utf8'), 'an external hard link is not owned');
    assert.strictEqual(fs.existsSync(first), true);
    fs.unlinkSync(original);
    const nested = path.join(work, 'nested');
    fs.mkdirSync(nested);
    const nestedCopy = path.join(nested, 'regular.txt');
    fs.writeFileSync(nestedCopy, 'DSARTF01nested legacy envelope');
    assert.throws(() => safeRemoveWorkDirectory(token));
    assert.strictEqual(fs.existsSync(first), true, 'nested legacy preflight protects the whole tree');
    fs.writeFileSync(nestedCopy, 'regular synthetic helper file');
    assert.throws(() => safeRemoveWorkDirectory(token));
    assert.strictEqual(fs.existsSync(work), true, 'unexpected nested trees remain for explicit local support review');
    assert.strictEqual(fs.readFileSync(first, 'utf8'), 'an external hard link is not owned');
    assert.strictEqual(fs.readFileSync(nestedCopy, 'utf8'), 'regular synthetic helper file');
  } finally {
    for (const [name, value] of [['EU_PRIVACY_ROOT', previous.privacy], ['LOCALAPPDATA', previous.local]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('whole-work cleanup retries bounded transient Windows delete failures without weakening identity checks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-cleanup-retry-'));
  const previous = { privacy: process.env.EU_PRIVACY_ROOT, local: process.env.LOCALAPPDATA };
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.LOCALAPPDATA = path.join(base, 'localapp');
  const { workPath, safeRemoveWorkDirectory } = require('../plugins/data-secure/server/gateway/batch-private-store');
  const originalUnlink = fs.unlinkSync;
  const originalRmdir = fs.rmdirSync;
  let unlinkAttempts = 0;
  let rmdirAttempts = 0;
  try {
    const work = workPath(token);
    fs.mkdirSync(work);
    const source = path.join(work, '001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy');
    fs.writeFileSync(source, 'plain synthetic copy');
    fs.unlinkSync = (target) => {
      unlinkAttempts += 1;
      if (unlinkAttempts === 1) throw Object.assign(new Error('scanner race'), { code: 'EPERM' });
      return originalUnlink(target);
    };
    fs.rmdirSync = (target) => {
      rmdirAttempts += 1;
      if (rmdirAttempts === 1) throw Object.assign(new Error('scanner race'), { code: 'EBUSY' });
      return originalRmdir(target);
    };
    safeRemoveWorkDirectory(token);
    assert.strictEqual(unlinkAttempts, 2);
    assert.strictEqual(rmdirAttempts, 2);
    assert.strictEqual(fs.existsSync(work), false);
  } finally {
    fs.unlinkSync = originalUnlink;
    fs.rmdirSync = originalRmdir;
    for (const [name, value] of [['EU_PRIVACY_ROOT', previous.privacy], ['LOCALAPPDATA', previous.local]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test('a real interrupted OCR correction write stays private and both owned hardlinks can be safely cleaned', () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-contact-crash-')));
  const previous = { privacy: process.env.EU_PRIVACY_ROOT, local: process.env.LOCALAPPDATA, data: process.env.EU_PRIVACY_DATA_ROOT };
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.LOCALAPPDATA = path.join(base, 'localapp');
  process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'data');
  const { workPath, safeRemoveWorkDirectory } = require('../plugins/data-secure/server/gateway/batch-private-store');
  const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
  const work = workPath(token); fs.mkdirSync(work);
  const target = path.join(work, '001_aaaaaaaaaaaaaaaaaaaaaaaa.ocrreview');
  const modulePath = require.resolve('../plugins/data-secure/server/gateway/private-work-store');
  let cleaned = false;
  try {
    // Exercise the actual maximum batch, not merely a single contact file.
    for (let index = 1; index <= 200; index++) {
      const stem = `${String(index).padStart(3, '0')}_${'a'.repeat(24)}`;
      fs.writeFileSync(path.join(work, `${stem}.workcopy`), 'synthetic immutable source');
      if (index !== 1) fs.writeFileSync(path.join(work, `${stem}.ocrreview`), 'synthetic checkpoint');
    }
    const script = `const fs=require('node:fs'); const {createPrivateWorkStore}=require(${JSON.stringify(modulePath)});` +
      `const unlink=fs.unlinkSync; fs.unlinkSync=(file)=>{if(file.endsWith('.tmp'))process.exit(55); return unlink(file);};` +
      `createPrivateWorkStore({privateRoot:${JSON.stringify(base)}}).writeFile(${JSON.stringify(target)},Buffer.from('synthetic private correction'));`;
    const result = require('node:child_process').spawnSync(process.execPath, ['-e', script], { windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 55, result.stderr?.toString());
    assert.equal(fs.readdirSync(work).length, 401, 'maximum batch plus abrupt write retains the bounded published/temporary names');
    assert.equal(fs.statSync(target, { bigint: true }).nlink, 2n);
    assert.throws(() => createPrivateWorkStore({ privateRoot: base }).readFile(target), 'an unconfirmed two-link checkpoint cannot resume');
    safeRemoveWorkDirectory(token); cleaned = true;
    assert.equal(fs.existsSync(work), false, 'the retention/discard cleanup guard accepts only these owned links');
  } finally {
    for (const [key, value] of [['EU_PRIVACY_ROOT', previous.privacy], ['LOCALAPPDATA', previous.local], ['EU_PRIVACY_DATA_ROOT', previous.data]])
      value === undefined ? delete process.env[key] : process.env[key] = value;
    // No broader cleanup fallback if the identity-checked work deletion failed.
    if (cleaned) {
      const inspect = directory => { for (const name of fs.readdirSync(directory)) {
        const full = path.join(directory, name), info = fs.lstatSync(full);
        assert.ok(!info.isSymbolicLink() && (info.isDirectory() || info.isFile()));
        assert.ok(fs.realpathSync.native(full).startsWith(base + path.sep));
        if (info.isDirectory()) { inspect(full); fs.rmdirSync(full); } else fs.unlinkSync(full);
      } };
      assert.equal(path.dirname(base), fs.realpathSync.native(os.tmpdir()));
      inspect(base); fs.rmdirSync(base);
    }
  }
});

test('whole-work cleanup distinguishes exact inodes above the safe integer range', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-cleanup-inode-')));
  const previous = { privacy: process.env.EU_PRIVACY_ROOT, local: process.env.LOCALAPPDATA,
    data: process.env.EU_PRIVACY_DATA_ROOT };
  process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
  process.env.LOCALAPPDATA = path.join(base, 'localapp');
  process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'private');
  const { workPath, safeRemoveWorkDirectory } = require('../plugins/data-secure/server/gateway/batch-private-store');
  const original = { lstatSync: fs.lstatSync, fstatSync: fs.fstatSync, openSync: fs.openSync, closeSync: fs.closeSync };
  const descriptors = new Map();
  let completed = false;
  try {
    const work = workPath(token);
    fs.mkdirSync(work);
    const names = ['001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy', '002_bbbbbbbbbbbbbbbbbbbbbbbb.workcopy'];
    const ids = [9007199254740992n, 9007199254740993n];
    assert.strictEqual(Number(ids[0]), Number(ids[1]), 'the fixture must reproduce a Number identity collision');
    const files = new Map(names.map((name, index) => [path.join(work, name), ids[index]]));
    for (const file of files.keys()) fs.writeFileSync(file, 'synthetic owned snapshot');
    function exactStat(stat, id, options) {
      assert.strictEqual(options?.bigint, true, 'identity-bearing stat calls must request exact integers');
      stat.ino = id;
      return stat;
    }
    fs.lstatSync = (file, options) => {
      const stat = original.lstatSync(file, options);
      return files.has(file) ? exactStat(stat, files.get(file), options) : stat;
    };
    fs.openSync = (file, ...args) => {
      const fd = original.openSync(file, ...args);
      if (files.has(file)) descriptors.set(fd, files.get(file));
      return fd;
    };
    fs.fstatSync = (fd, options) => {
      const stat = original.fstatSync(fd, options);
      return descriptors.has(fd) ? exactStat(stat, descriptors.get(fd), options) : stat;
    };
    fs.closeSync = (fd) => { descriptors.delete(fd); return original.closeSync(fd); };
    // All reads and unlink/rmdir operations use real files. Only inode values
    // are elevated deterministically so every host covers the NTFS defect.
    safeRemoveWorkDirectory(token);
    assert.strictEqual(fs.existsSync(work), false);
    completed = true;
  } finally {
    Object.assign(fs, original);
    for (const [name, value] of [['EU_PRIVACY_ROOT', previous.privacy], ['LOCALAPPDATA', previous.local],
      ['EU_PRIVACY_DATA_ROOT', previous.data]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    // Never retry a failed work-tree removal. Successful execution leaves only
    // these exact, owned, empty directories; remove each without recursion.
    if (completed) {
      assert.strictEqual(path.dirname(base), fs.realpathSync(os.tmpdir()));
      for (const directory of [path.join(base, 'private', 'batches'), path.join(base, 'private'), base]) {
        const stat = fs.lstatSync(directory);
        assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
        assert.strictEqual(fs.realpathSync(directory), directory);
        assert.deepStrictEqual(fs.readdirSync(directory), []);
        fs.rmdirSync(directory);
      }
    }
  }
});

test('plain-work validation rejects an inode substitution hidden by Number rounding before reading', () => {
  const { assertPlainWorkFile } = require('../plugins/data-secure/server/gateway/batch-private-store');
  const namedId = 9007199254740992n;
  const openedId = 9007199254740993n;
  assert.strictEqual(Number(namedId), Number(openedId));
  let reads = 0, closes = 0;
  const stat = (ino, options) => {
    assert.strictEqual(options?.bigint, true);
    return { isFile: () => true, isSymbolicLink: () => false, dev: 1n, ino, size: 8n, mtimeNs: 1n };
  };
  assert.throws(() => assertPlainWorkFile('synthetic.workcopy', {
    constants: { O_RDONLY: 0 },
    lstatSync: (_file, options) => stat(namedId, options),
    fstatSync: (_fd, options) => stat(openedId, options),
    openSync: () => 1,
    readSync() { reads++; return 0; },
    closeSync() { closes++; }
  }), /BATCH_WORK_UNSAFE/);
  assert.strictEqual(reads, 0);
  assert.strictEqual(closes, 1);
});

test('the batch composition root preserves every delivery facade', () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  for (const name of ['acknowledgeDeliveredPackage', 'acknowledgeDeliveredPackages', 'finalizePublishedPackageLocally']) {
    assert.strictEqual(typeof batch[name], 'function', name);
  }
  assert.strictEqual(typeof batch._test.retryReleasedWorkCopyCleanup, 'function');
});

done();
