'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { processAlive: probeProcessAlive } = require('../plugins/data-secure/server/gateway/process-liveness');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchIntake } = require('../plugins/data-secure/server/gateway/batch-intake');
const { createBatchIntakeIntent } = require('../plugins/data-secure/server/gateway/batch-intake-intent');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch intake boundary');
const token = 'a'.repeat(64);

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-batch-intake-'));
  const source = path.join(root, 'Quelle.docx');
  const journal = path.join(root, `${token}.json`);
  const work = path.join(root, `${token}.work`);
  fs.writeFileSync(source, 'sealed source', { mode: 0o600 });
  const events = [];
  const io = {
    ...fs,
    lstatSync(target, settings) {
      events.push(`lstat:${target}`);
      return fs.lstatSync(target, settings);
    },
    mkdirSync(target, settings) {
      events.push(`mkdir:${target}`);
      return fs.mkdirSync(target, settings);
    }
  };
  const intake = createBatchIntake({
    SafeError,
    io,
    path,
    crypto: { randomBytes: (size) => Buffer.alloc(size, 0xaa) },
    profiles: new Set(['auto', 'general']),
    limits: { MAX_BATCH_FILES: 100 },
    validateBatchLimits: () => {},
    storageStatus: () => ({ safe: true }),
    hasReparseComponent: () => false,
    planBatchAdmission(queue) {
      events.push('plan');
      return typeof options.planBatchAdmission === 'function'
        ? options.planBatchAdmission(queue)
        : queue.map((entry) => ({ entry, admission: 'candidate', error_code: null }));
    },
    assertStagingCapacity(queue) { events.push(`capacity:${queue.length}`); },
    tokenPattern: /^[a-f0-9]{64}$/,
    batchPath: () => journal,
    workPath: () => work,
    copySnapshotFile(from, to, stat) {
      const intent = JSON.parse(fs.readFileSync(path.join(root, `${token}.intake`), 'utf8'));
      assert.strictEqual(intent.schema, 'datasecure-intake/1', 'ownership is durable before any source copying');
      events.push(`copy:${from}:${to}`);
      fs.copyFileSync(from, to);
      return { size: stat.size, sha256: 'b'.repeat(64) };
    },
    privateWorkStore: { ensureReady() { events.push('store-ready'); } },
    batchTtlMs: () => 60_000,
    createPrivateIoSummary: (value) => value,
    writeState(state) {
      events.push('write');
      if (options.publishBeforeWriteError) fs.writeFileSync(journal, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      if (options.writeError) throw options.writeError;
      fs.writeFileSync(journal, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    },
    readStateForMaintenance() {
      events.push('read-journal');
      if (options.readError) throw options.readError;
      if (!fs.existsSync(journal)) throw new Error('missing');
      return JSON.parse(fs.readFileSync(journal, 'utf8'));
    },
    safeRemoveWorkDirectory() {
      events.push('remove-work');
      if (options.cleanupError) throw options.cleanupError;
      fs.rmSync(work, { recursive: true, force: true });
    },
    publicProgress: (state) => ({ total: state.items.length }),
    platform: 'win32',
    productChannel: options.productChannel
  });
  const queueEntry = (name = path.basename(source), full = source) => ({
    name,
    full,
    sourceBytes: fs.statSync(source).size
  });
  return {
    root, source, journal, work, events, intake, queueEntry,
    begin(queue, extra = {}) {
      return intake.beginBatch({ expectedCount: queue.length, queue, token, profile: 'general', ...extra });
    },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test('the declared filename must equal the bound path basename before any source metadata read', () => {
  const item = fixture();
  try {
    assert.throws(() => item.begin([item.queueEntry('Quelle.txt')]), /Dateiauswahl ist ungültig/);
    assert.ok(!item.events.some((event) => event.startsWith('lstat:') || event.startsWith('mkdir:') || event === 'write'));
    assert.strictEqual(fs.existsSync(item.journal), false);
    assert.strictEqual(fs.existsSync(item.work), false);
    assert.strictEqual(fs.readFileSync(item.source, 'utf8'), 'sealed source');
  } finally { item.cleanup(); }
});

test('recovery and retention remove confirmed dead-owner intake copies before expiry, not unknown work or originals', () => {
  for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    const item = fixture({ writeError: new Error('CRASH_BEFORE_JOURNAL'), cleanupError: new Error('SIMULATED_PROCESS_LOSS') });
    try {
      assert.throws(() => item.begin([item.queueEntry()]));
      const unknown = path.join(item.root, `${'b'.repeat(64)}.work`);
      fs.mkdirSync(unknown);
      fs.writeFileSync(path.join(unknown, 'old.txt'), 'unknown original');
      let alive = true;
      const intent = createBatchIntakeIntent({
        io: fs, batchPath: () => item.journal, workPath: () => item.work,
        processAlive: () => alive,
        safeRemoveWorkDirectory: () => fs.rmSync(item.work, { recursive: true })
      });
      const recovery = createBatchRecovery({
        io: fs, batchRoot: () => item.root, intakeIntent: intent,
        nowMs: () => Date.now(),
        readActiveLock: () => null, processAlive: () => false,
        acquireActiveLock() {}, releaseActiveLock() { return true; }
      });
      assert.strictEqual(recovery[method]().removed, 0, 'live intake is protected');
      alive = false;
      assert.ok(Date.parse(intent.read(token).expires_at) > Date.now(), 'the dead-owner copy has not reached its TTL');
      assert.strictEqual(recovery.localCleanupStatus().expired_batch_cleanup_pending, 1);
      assert.strictEqual(recovery[method]().removed, 1);
      assert.strictEqual(fs.existsSync(item.work), false);
      assert.strictEqual(fs.existsSync(path.join(item.root, `${token}.intake`)), false);
      assert.strictEqual(fs.readFileSync(item.source, 'utf8'), 'sealed source');
      assert.strictEqual(fs.readFileSync(path.join(unknown, 'old.txt'), 'utf8'), 'unknown original');
    } finally { item.cleanup(); }
  }
});

test('a replaced work directory or invalid ownership intent never authorizes orphan cleanup', () => {
  for (const scenario of ['replacement', 'malformed', 'owner-uncertain']) {
    const item = fixture({ writeError: new Error('CRASH'), cleanupError: new Error('CRASH') });
    try {
      assert.throws(() => item.begin([item.queueEntry()]));
      const intentPath = path.join(item.root, `${token}.intake`);
      if (scenario === 'replacement') {
        fs.renameSync(item.work, `${item.work}.retained`);
        fs.mkdirSync(item.work);
        fs.writeFileSync(path.join(item.work, 'unknown.txt'), 'preserve');
      }
      if (scenario === 'malformed') fs.writeFileSync(intentPath, '{');
      let removed = 0;
      const intent = createBatchIntakeIntent({
        io: fs, batchPath: () => item.journal, workPath: () => item.work,
        processAlive: () => scenario === 'owner-uncertain' ? undefined : false, safeRemoveWorkDirectory() { removed++; }
      });
      if (scenario === 'owner-uncertain') assert.strictEqual(intent.cleanup(token, Date.now() + 120_000), false);
      else assert.throws(() => intent.cleanup(token, Date.now() + 120_000));
      assert.strictEqual(removed, 0);
      assert.strictEqual(fs.existsSync(intentPath), true);
      assert.strictEqual(fs.readFileSync(item.source, 'utf8'), 'sealed source');
    } finally { item.cleanup(); }
  }
});

test('an intake-intent replacement between ownership read and deletion is preserved', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-intake-swap-'));
  const work = path.join(root, `${token}.work`);
  const target = path.join(root, `${token}.intake`);
  const retained = `${target}.retained`;
  try {
    fs.mkdirSync(work);
    const intent = createBatchIntakeIntent({
      io: fs,
      batchPath: () => path.join(root, `${token}.json`),
      workPath: () => work,
      processAlive: () => false,
      safeRemoveWorkDirectory() {
        fs.renameSync(target, retained);
        fs.writeFileSync(target, 'foreign replacement', { mode: 0o600 });
        fs.rmSync(work, { recursive: true });
      }
    });
    const workIdentity = fs.lstatSync(work, { bigint: true });
    intent.create(token, new Date(Date.now() - 1_000).toISOString(), {
      dev: String(workIdentity.dev), ino: String(workIdentity.ino), birthtimeNs: String(workIdentity.birthtimeNs)
    });
    assert.throws(() => intent.cleanup(token, Date.now()), /BATCH_INTAKE_INTENT_INVALID/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'foreign replacement');
    assert.strictEqual(fs.existsSync(retained), true, 'the originally bound intent is retained for support review');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// Exercise the real flat-copy deletion guard and global lease with only their
// root/process adapters replaced. No configured/live privacy profile is read.
function orphanFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-orphan-boundary-'));
  const io = { ...fs };
  const load = (file, replacements) => {
    const filename = path.join(__dirname, '../plugins/data-secure/server/gateway', file);
    const module = { exports: {} };
    const realRequire = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, process, Buffer, Atomics, SharedArrayBuffer, Int32Array,
      require: name => Object.hasOwn(replacements, name) ? replacements[name] : realRequire(name)
    }, { filename });
    return module.exports;
  };
  const store = load('batch-private-store.js', {
    fs: io,
    '../runtime': { SafeError, dataRoot: () => path.join(root, 'private') },
    './common': {
      ensurePrivateDirectory(parent, name) {
        const target = path.resolve(parent, name);
        const relative = path.relative(root, target);
        assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
        return target;
      },
      hasReparseComponent: require('../plugins/data-secure/server/gateway/common').hasReparseComponent
    }
  });
  const source = path.join(root, 'source.txt');
  const output = path.join(root, 'result.md');
  fs.writeFileSync(source, 'synthetic original');
  fs.writeFileSync(output, 'synthetic published output');
  const work = store.workPath(token);
  const journal = store.batchPath(token);
  const copy = path.join(work, `001_${'c'.repeat(24)}.workcopy`);
  fs.mkdirSync(work);
  fs.copyFileSync(source, copy);
  let ownerState = 'ESRCH';
  const ownerAlive = pid => probeProcessAlive(pid, () => {
    if (ownerState === 'live' || ownerState === 'reused') return;
    throw Object.assign(new Error('synthetic probe failure'), { code: ownerState });
  });
  const intentOptions = { io, batchPath: store.batchPath, workPath: store.workPath,
    safeRemoveWorkDirectory: store.safeRemoveWorkDirectory, processAlive: ownerAlive };
  const intent = createBatchIntakeIntent(intentOptions);
  intent.create(token, new Date(Date.now() + 86400000).toISOString());
  const target = intent.intentPath(token);
  const locks = load('batch-active-lock.js', { './batch-private-store': store }).createBatchActiveLock({
    process: { pid: 424242, kill: pid => { if (pid !== 424242 && !ownerAlive(pid)) throw Object.assign(new Error('dead'), { code: 'ESRCH' }); } }
  });
  const recovery = createBatchRecovery({ io, batchRoot: store.batchRoot, batchPath: store.batchPath,
    intakeIntent: intent, readActiveLock: locks.readActiveLock, processAlive: locks.processAlive,
    acquireActiveLock: locks.acquireActiveLock, releaseActiveLock: locks.releaseActiveLock });
  return { root, source, output, work, copy, journal, target, io, store, intent, intentOptions, locks, recovery,
    setOwnerState: value => { ownerState = value; },
    assertExternalFiles() {
      assert.strictEqual(fs.readFileSync(source, 'utf8'), 'synthetic original');
      assert.strictEqual(fs.readFileSync(output, 'utf8'), 'synthetic published output');
    },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) test(`${method}: actual bound-copy deletion needs only ESRCH, not TTL expiry`, () => {
  const item = orphanFixture();
  try {
    for (const state of ['live', 'reused', 'EPERM', 'EACCES', 'UNKNOWN']) {
      item.setOwnerState(state);
      assert.strictEqual(item.recovery[method]().removed, 0, state);
      assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
    }
    item.setOwnerState('ESRCH');
    assert.ok(Date.parse(item.intent.read(token).expires_at) > Date.now());
    const result = item.recovery[method]();
    assert.strictEqual(result.removed, 1);
    assert.strictEqual(result.failures, 0);
    assert.strictEqual(result.skipped_active, false);
    assert.ok(!fs.existsSync(item.work) && !fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) test(`${method}: the real live or unreadable global lease prevents orphan cleanup`, () => {
  const item = orphanFixture();
  try {
    const ownerToken = 'b'.repeat(64);
    item.locks.acquireActiveLock(ownerToken);
    assert.strictEqual(item.recovery[method]().skipped_active, true);
    assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
    item.locks.releaseActiveLock(ownerToken);
    fs.writeFileSync(item.locks.activeLockPath(), '{');
    assert.strictEqual(item.recovery[method]().skipped_active, true);
    assert.strictEqual(fs.readFileSync(item.locks.activeLockPath(), 'utf8'), '{');
    assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('a present or newly published journal and a PID reused during revalidation preserve private copies', () => {
  for (const scenario of ['journal-present', 'journal-appears', 'pid-reused']) {
    const item = orphanFixture();
    try {
      let probes = 0;
      if (scenario === 'journal-present') fs.writeFileSync(item.journal, 'unreadable journal remains protected');
      const intent = createBatchIntakeIntent({ ...item.intentOptions, processAlive() {
        probes++;
        if (probes === 2 && scenario === 'journal-appears') fs.writeFileSync(item.journal, 'published journal');
        return probes === 2 && scenario === 'pid-reused';
      } });
      assert.strictEqual(intent.cleanup(token, Date.now()), false);
      assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
      item.assertExternalFiles();
    } finally { item.cleanup(); }
  }
});

test('an intent swap during dead-owner revalidation preserves the replacement and both private copies', () => {
  const item = orphanFixture();
  try {
    let probes = 0;
    const intent = createBatchIntakeIntent({ ...item.intentOptions, processAlive() {
      if (++probes === 2) {
        fs.renameSync(item.target, `${item.target}.retained`);
        fs.writeFileSync(item.target, 'foreign replacement');
      }
      return false;
    } });
    assert.throws(() => intent.cleanup(token, Date.now()), /BATCH_INTAKE_OWNERSHIP_CHANGED/u);
    assert.strictEqual(fs.readFileSync(item.target, 'utf8'), 'foreign replacement');
    assert.ok(fs.existsSync(item.copy) && fs.existsSync(`${item.target}.retained`));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('the actual deletion guard refuses a work directory substituted after the intent check', () => {
  const item = orphanFixture();
  try {
    const intent = createBatchIntakeIntent({ ...item.intentOptions, safeRemoveWorkDirectory(value, options) {
      fs.renameSync(item.work, `${item.work}.retained`);
      fs.mkdirSync(item.work);
      fs.writeFileSync(item.copy, 'foreign replacement copy');
      item.store.safeRemoveWorkDirectory(value, options);
    } });
    assert.throws(() => intent.cleanup(token, Date.now()), /konnte nicht sicher bereinigt/u);
    assert.strictEqual(fs.readFileSync(item.copy, 'utf8'), 'foreign replacement copy');
    assert.ok(fs.existsSync(`${item.work}.retained`) && fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('an intake parent-directory swap cannot move cleanup authority to a replacement tree', () => {
  const item = orphanFixture();
  try {
    let probes = 0;
    const directory = path.dirname(item.target);
    const retained = `${directory}.retained`;
    const intent = createBatchIntakeIntent({ ...item.intentOptions, processAlive() {
      if (++probes === 2) {
        fs.renameSync(directory, retained);
        fs.mkdirSync(directory);
        fs.copyFileSync(path.join(retained, path.basename(item.target)), item.target);
        fs.mkdirSync(item.work);
        fs.writeFileSync(item.copy, 'foreign replacement copy');
      }
      return false;
    } });
    // Either the cached private-root identity or the narrower intake-owner
    // identity may observe the parent replacement first. Both are fail-closed
    // before cleanup authority can move to the replacement tree.
    assert.throws(() => intent.cleanup(token, Date.now()),
      /(?:PRIVACY_STORAGE_UNSAFE|BATCH_INTAKE_OWNERSHIP_CHANGED)/u);
    assert.strictEqual(fs.readFileSync(item.copy, 'utf8'), 'foreign replacement copy');
    assert.ok(fs.existsSync(path.join(retained, path.basename(item.work), path.basename(item.copy))));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('an inaccessible journal path prevents orphan cleanup instead of being treated as absent', () => {
  const item = orphanFixture();
  try {
    item.io.lstatSync = (target, options) => {
      if (target === item.journal) throw Object.assign(new Error('hidden journal'), { code: 'EACCES' });
      return fs.lstatSync(target, options);
    };
    const result = item.recovery.recoverBatches();
    assert.strictEqual(result.removed, 0);
    assert.strictEqual(result.failures, 1);
    assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('an external source or output hard link never becomes an owned deletable copy', () => {
  for (const external of ['source', 'output']) {
    const item = orphanFixture();
    try {
      fs.unlinkSync(item.copy);
      fs.linkSync(item[external], item.copy);
      assert.throws(() => item.intent.cleanup(token, Date.now()), /konnte nicht sicher bereinigt/u);
      assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
      item.assertExternalFiles();
    } finally { item.cleanup(); }
  }
});

test('work cleanup errors keep the ownership intent and remain failures without a broader retry', () => {
  const item = orphanFixture();
  try {
    let attempts = 0;
    item.io.unlinkSync = target => {
      if (target === item.copy) { attempts++; throw Object.assign(new Error('locked'), { code: 'EIO' }); }
      return fs.unlinkSync(target);
    };
    const result = item.recovery.recoverBatches();
    assert.strictEqual(result.removed, 0);
    assert.strictEqual(result.failures, 1);
    assert.strictEqual(attempts, 1);
    assert.ok(fs.existsSync(item.copy) && fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('intent cleanup failure is reported and its missing-work remainder can be recovered safely later', () => {
  const item = orphanFixture();
  try {
    item.io.renameSync = (from, to) => {
      if (from === item.target) throw Object.assign(new Error('locked'), { code: 'EIO' });
      return fs.renameSync(from, to);
    };
    const failed = item.recovery.cleanupExpiredBatchSnapshots();
    assert.strictEqual(failed.removed, 0);
    assert.strictEqual(failed.failures, 1);
    assert.ok(!fs.existsSync(item.work) && fs.existsSync(item.target));
    item.io.renameSync = fs.renameSync;
    assert.strictEqual(item.recovery.cleanupExpiredBatchSnapshots().removed, 1);
    assert.ok(!fs.existsSync(item.target));
    item.assertExternalFiles();
  } finally { item.cleanup(); }
});

test('duplicate absolute picker paths are rejected before any source metadata read', () => {
  const item = fixture();
  try {
    assert.throws(() => item.begin([item.queueEntry(), item.queueEntry()]), /mehrfach angegeben/);
    assert.ok(!item.events.some((event) => event.startsWith('lstat:') || event.startsWith('mkdir:') || event === 'write'));
    assert.strictEqual(fs.existsSync(item.journal), false);
    assert.strictEqual(fs.existsSync(item.work), false);
  } finally { item.cleanup(); }
});

test('a pre-publication journal failure removes only the new work tree', () => {
  const item = fixture({ writeError: new Error('PRE_RENAME_FAILED') });
  try {
    assert.throws(() => item.begin([item.queueEntry()]), /konnte nicht sicher lokal übernommen/);
    assert.strictEqual(fs.existsSync(item.journal), false);
    assert.strictEqual(fs.existsSync(item.work), false);
    assert.strictEqual(fs.readFileSync(item.source, 'utf8'), 'sealed source');
    assert.ok(item.events.includes('remove-work'));
  } finally { item.cleanup(); }
});

test('a post-rename durability failure preserves the matching journal and sealed work together', () => {
  const item = fixture({ publishBeforeWriteError: true, writeError: new Error('PARENT_FSYNC_FAILED') });
  try {
    assert.throws(() => item.begin([item.queueEntry()]), /konnte nicht sicher lokal übernommen/);
    assert.strictEqual(fs.existsSync(item.journal), true);
    assert.strictEqual(fs.existsSync(item.work), true);
    assert.strictEqual(JSON.parse(fs.readFileSync(item.journal, 'utf8')).token, token);
    assert.ok(!item.events.includes('remove-work'));
  } finally { item.cleanup(); }
});

test('an unreadable published journal keeps its sealed work fail closed', () => {
  const item = fixture({
    publishBeforeWriteError: true,
    writeError: new Error('PARENT_FSYNC_FAILED'),
    readError: new Error('JOURNAL_READ_UNCERTAIN')
  });
  try {
    assert.throws(() => item.begin([item.queueEntry()]), /konnte nicht sicher lokal übernommen/);
    assert.strictEqual(fs.existsSync(item.journal), true);
    assert.strictEqual(fs.existsSync(item.work), true);
    assert.ok(!item.events.includes('remove-work'));
  } finally { item.cleanup(); }
});

test('cleanup failure never masks the primary intake error or removes an original', () => {
  const primary = new SafeError('PRIMARY_INTAKE_FAILURE');
  const item = fixture({ writeError: primary, cleanupError: new Error('SECONDARY_CLEANUP_FAILURE') });
  try {
    assert.throws(() => item.begin([item.queueEntry()]), /PRIMARY_INTAKE_FAILURE/);
    assert.strictEqual(fs.readFileSync(item.source, 'utf8'), 'sealed source');
    assert.strictEqual(fs.existsSync(item.journal), false);
    assert.strictEqual(fs.existsSync(item.work), true);
  } finally { item.cleanup(); }
});

test('the extracted intake creates the same sealed public response and batch facade', () => {
  const item = fixture();
  try {
    const result = item.begin([item.queueEntry()]);
    assert.deepStrictEqual(result, { ok: true, total: 1, raw_content_sent_to_claude: false });
    assert.strictEqual(fs.existsSync(item.journal), true);
    assert.strictEqual(fs.readdirSync(item.work).length, 1);
    const batch = require('../plugins/data-secure/server/gateway/batch');
    assert.strictEqual(typeof batch.beginBatch, 'function');
  } finally { item.cleanup(); }
});

test('mixed admission journals every position but snapshots only candidates', () => {
  const item = fixture({
    planBatchAdmission(queue) {
      return queue.map((entry, index) => index % 2 === 0
        ? { entry, admission: 'candidate', error_code: null }
        : { entry, admission: 'stopped', error_code: index === 1
          ? 'SOURCE_TYPE_MISMATCH'
          : 'SOURCE_FORMAT_NOT_RELEASED' });
    }
  });
  try {
    const queue = ['one.txt', 'broken.docx', 'three.csv', 'locked.pdf'].map((name, index) => {
      const full = path.join(item.root, name);
      fs.writeFileSync(full, `source ${index}`, { mode: 0o600 });
      return { name, full, sourceBytes: fs.statSync(full).size };
    });
    const result = item.begin(queue);
    assert.deepStrictEqual(result, { ok: true, total: 4, raw_content_sent_to_claude: false });
    assert.strictEqual(item.events.filter((event) => event.startsWith('copy:')).length, 2);
    assert.ok(item.events.includes('capacity:2'));
    assert.strictEqual(fs.readdirSync(item.work).length, 2);
    const state = JSON.parse(fs.readFileSync(item.journal, 'utf8'));
    assert.strictEqual(state.schema, 'datasecure-batch/4');
    assert.strictEqual(state.product_channel, 'plugin');
    assert.strictEqual(state.pseudonym_contract_version, 'batch-pseudonym/v1');
    assert.deepStrictEqual(state.items.map((entry) => entry.status), [
      'pending', 'preflight_mapping_pending', 'pending', 'preflight_mapping_pending'
    ]);
    for (const stopped of state.items.filter((entry) => entry.status === 'preflight_mapping_pending')) {
      assert.strictEqual(stopped.checkpoint, 'source_preflight_rejected');
      assert.strictEqual(stopped.local_mapping_exported, false);
      assert.deepStrictEqual(stopped.document_result, {
        schema: 'datasecure-document-result/1', grade: 'not-processed', omissions: [],
        reason_code: stopped.error_code
      });
      assert.strictEqual(Object.hasOwn(stopped, 'work_name'), false);
      assert.strictEqual(Object.hasOwn(stopped, 'sha256'), false);
      assert.strictEqual(Object.hasOwn(stopped, 'package_id'), false);
    }
    assert.strictEqual(state.io_summary.snapshot_copy_files, 2);
  } finally { item.cleanup(); }
});

test('Standalone intake binds its product channel into the durable journal', () => {
  const item = fixture({ productChannel: 'standalone' });
  try {
    item.begin([item.queueEntry()]);
    const state = JSON.parse(fs.readFileSync(item.journal, 'utf8'));
    assert.strictEqual(state.product_channel, 'standalone');
    assert.strictEqual(state.pseudonym_contract_version, 'batch-pseudonym/v2');
  } finally { item.cleanup(); }
});

test('an all-stopped admission creates a durable repair checkpoint without source copies', () => {
  const item = fixture({
    planBatchAdmission(queue) {
      return queue.map((entry) => ({ entry, admission: 'stopped', error_code: 'SOURCE_TEXT_INVALID' }));
    }
  });
  try {
    const result = item.begin([item.queueEntry()]);
    assert.deepStrictEqual(result, { ok: true, total: 1, raw_content_sent_to_claude: false });
    assert.ok(item.events.includes('capacity:0'));
    assert.strictEqual(item.events.some((event) => event.startsWith('copy:')), false);
    assert.deepStrictEqual(fs.readdirSync(item.work), []);
    const state = JSON.parse(fs.readFileSync(item.journal, 'utf8'));
    assert.strictEqual(state.schema, 'datasecure-batch/4');
    assert.strictEqual(state.items[0].status, 'preflight_mapping_pending');
    assert.strictEqual(state.items[0].document_result.grade, 'not-processed');
    assert.strictEqual(state.items[0].document_result.reason_code, 'SOURCE_TEXT_INVALID');
    assert.strictEqual(state.io_summary.snapshot_copy_files, 0);
    assert.strictEqual(state.io_summary.snapshot_copy_mib, 0);
  } finally { item.cleanup(); }
});

test('a planning trust failure occurs before work, capacity and journal mutations', () => {
  const privateFailure = new Error('private source details');
  privateFailure.code = 'SOURCE_IDENTITY_CHANGED';
  const item = fixture({ planBatchAdmission() { throw privateFailure; } });
  try {
    assert.throws(() => item.begin([item.queueEntry()]), (error) =>
      error.code === 'SOURCE_IDENTITY_CHANGED' && !/private source details/u.test(error.message));
    assert.strictEqual(item.events.some((event) => event.startsWith('capacity:') ||
      event.startsWith('mkdir:') || event.startsWith('copy:') || event === 'write'), false);
    assert.strictEqual(fs.existsSync(item.work), false);
    assert.strictEqual(fs.existsSync(item.journal), false);
  } finally { item.cleanup(); }
});

done();
