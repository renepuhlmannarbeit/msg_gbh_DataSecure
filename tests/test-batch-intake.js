'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchIntake } = require('../plugins/data-secure/server/gateway/batch-intake');
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
    lstatSync(target) {
      events.push(`lstat:${target}`);
      return fs.lstatSync(target);
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
    preflightOoxmlContainers: () => { events.push('preflight'); },
    assertStagingCapacity: () => { events.push('capacity'); },
    tokenPattern: /^[a-f0-9]{64}$/,
    batchPath: () => journal,
    workPath: () => work,
    copySnapshotFile(from, to, stat) {
      events.push(`copy:${from}:${to}`);
      fs.copyFileSync(from, to);
      return { size: stat.size, sha256: 'b'.repeat(64) };
    },
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
    platform: 'win32'
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

done();
