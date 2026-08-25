'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch journal state store');
const token = 'a'.repeat(64);

function state(overrides = {}) {
  return {
    schema: 'datasecure-batch/1',
    token,
    expires_at: '2026-08-26T00:00:00.000Z',
    items: [{ status: 'pending' }],
    revision: 1,
    ...overrides
  };
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-journal-store-'));
  const target = path.join(root, `${token}.json`);
  const events = [];
  const io = { ...fs, constants: fs.constants, ...(options.io || {}) };
  const store = createBatchJournalStore({
    io,
    SafeError,
    batchPath(value) {
      if (value !== token) throw new Error('invalid token');
      return target;
    },
    safeRemoveWorkDirectory: options.safeRemoveWorkDirectory || (() => { events.push('remove-work'); }),
    randomBytes: options.randomBytes || (() => Buffer.from('abcdef', 'utf8')),
    nowMs: options.nowMs || (() => Date.parse('2026-08-25T00:00:00.000Z')),
    syncParentDirectory: options.syncParentDirectory || (() => { events.push('sync-parent'); return true; })
  });
  return {
    root,
    target,
    temporary: `${target}.tmp_${Buffer.from('abcdef', 'utf8').toString('hex')}`,
    events,
    io,
    store,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

function raw(target) {
  return fs.readFileSync(target, 'utf8');
}

test('writeState integrates positive short writes and zero-progress failure atomically', () => {
  const initial = fixture();
  try {
    initial.store.writeState(state(), { durable: false });
    let calls = 0;
    const shortIo = {
      writeSync(fd, bytes, offset, length, position) {
        calls++;
        return fs.writeSync(fd, bytes, offset, Math.min(7, length), position);
      }
    };
    const shortStore = createBatchJournalStore({
      io: { ...fs, constants: fs.constants, ...shortIo },
      SafeError,
      batchPath: () => initial.target,
      randomBytes: () => Buffer.from('short1'),
      safeRemoveWorkDirectory: () => {},
      nowMs: () => Date.parse('2026-08-25T00:00:00.000Z'),
      syncParentDirectory: () => true
    });
    shortStore.writeState(state({ revision: 2 }), { durable: false });
    assert.ok(calls > 1);
    assert.strictEqual(JSON.parse(raw(initial.target)).revision, 2);

    const before = raw(initial.target);
    const zeroStore = createBatchJournalStore({
      io: { ...fs, constants: fs.constants, writeSync: () => 0 },
      SafeError,
      batchPath: () => initial.target,
      randomBytes: () => Buffer.from('zero00'),
      safeRemoveWorkDirectory: () => {},
      syncParentDirectory: () => true
    });
    assert.throws(() => zeroStore.writeState(state({ revision: 3 }), { durable: false }), /BATCH_JOURNAL_PARTIAL_WRITE/);
    assert.strictEqual(raw(initial.target), before);
    assert.strictEqual(fs.existsSync(`${initial.target}.tmp_${Buffer.from('zero00').toString('hex')}`), false);
  } finally {
    initial.cleanup();
  }
});

test('failures before rename preserve the old journal and clean only the exact temp file', () => {
  for (const phase of ['file-fsync', 'close', 'rename']) {
    const item = fixture();
    try {
      item.store.writeState(state(), { durable: false });
      const before = raw(item.target);
      const io = { ...fs, constants: fs.constants };
      if (phase === 'file-fsync') io.fsyncSync = () => { throw new Error('FILE_FSYNC_FAILED'); };
      if (phase === 'close') io.closeSync = (fd) => { fs.closeSync(fd); throw new Error('CLOSE_FAILED'); };
      if (phase === 'rename') io.renameSync = () => { throw new Error('RENAME_FAILED'); };
      const failing = createBatchJournalStore({
        io,
        SafeError,
        batchPath: () => item.target,
        randomBytes: () => Buffer.from('abcdef'),
        safeRemoveWorkDirectory: () => {},
        syncParentDirectory: () => true
      });
      assert.throws(() => failing.writeState(state({ revision: 2 })), new RegExp(phase.replace('-', '_'), 'i'));
      assert.strictEqual(raw(item.target), before, phase);
      assert.strictEqual(fs.existsSync(item.temporary), false, phase);
    } finally {
      item.cleanup();
    }
  }
});

test('a parent-directory fsync failure surfaces after a complete new journal was published', () => {
  const item = fixture();
  try {
    item.store.writeState(state(), { durable: false });
    const failing = createBatchJournalStore({
      io: { ...fs, constants: fs.constants },
      SafeError,
      batchPath: () => item.target,
      randomBytes: () => Buffer.from('abcdef'),
      safeRemoveWorkDirectory: () => {},
      syncParentDirectory: () => { throw new Error('PARENT_FSYNC_FAILED'); }
    });
    assert.throws(() => failing.writeState(state({ revision: 2 })), /PARENT_FSYNC_FAILED/);
    assert.strictEqual(JSON.parse(raw(item.target)).revision, 2);
    assert.strictEqual(fs.existsSync(item.temporary), false);
  } finally {
    item.cleanup();
  }
});

test('temporary cleanup failure never masks the primary publication error', () => {
  const item = fixture();
  try {
    const failing = createBatchJournalStore({
      io: {
        ...fs,
        constants: fs.constants,
        renameSync: () => { throw new Error('PRIMARY_RENAME_FAILURE'); },
        unlinkSync: () => { throw new Error('SECONDARY_CLEANUP_FAILURE'); }
      },
      SafeError,
      batchPath: () => item.target,
      randomBytes: () => Buffer.from('abcdef'),
      safeRemoveWorkDirectory: () => {},
      syncParentDirectory: () => true
    });
    assert.throws(() => failing.writeState(state()), /PRIMARY_RENAME_FAILURE/);
  } finally {
    item.cleanup();
  }
});

test('both readers fail closed for symlink metadata, non-files and inode replacement', () => {
  for (const mode of ['symlink', 'non-file', 'identity-mismatch']) {
    const item = fixture();
    try {
      fs.writeFileSync(item.target, `${JSON.stringify(state())}\n`, { mode: 0o600 });
      const io = { ...fs, constants: fs.constants };
      if (mode === 'symlink') {
        io.lstatSync = (target) => {
          const named = fs.lstatSync(target);
          return { dev: named.dev, ino: named.ino, isSymbolicLink: () => true };
        };
      } else if (mode === 'non-file') {
        io.fstatSync = (fd) => {
          const stat = fs.fstatSync(fd);
          return { dev: stat.dev, ino: stat.ino, isFile: () => false };
        };
      } else {
        io.lstatSync = (target) => {
          const named = fs.lstatSync(target);
          return { dev: named.dev, ino: BigInt(named.ino) + 1n, isSymbolicLink: () => false };
        };
      }
      const store = createBatchJournalStore({
        io,
        SafeError,
        batchPath: () => item.target,
        safeRemoveWorkDirectory: () => { throw new Error('must not clean'); }
      });
      assert.throws(() => store.readState(token), /nicht gefunden oder ist ungültig/i, mode);
      assert.throws(() => store.readStateForMaintenance(token), /unsafe/i, mode);
      assert.strictEqual(fs.existsSync(item.target), true, mode);
    } finally {
      item.cleanup();
    }
  }
});

test('a close failure never releases a state through either reader', () => {
  const item = fixture();
  try {
    fs.writeFileSync(item.target, `${JSON.stringify(state())}\n`, { mode: 0o600 });
    const io = {
      ...fs,
      constants: fs.constants,
      closeSync(fd) { fs.closeSync(fd); throw new Error('CLOSE_FAILED'); }
    };
    const store = createBatchJournalStore({ io, SafeError, batchPath: () => item.target });
    assert.throws(() => store.readState(token), /nicht gefunden oder ist ungültig/i);
    assert.throws(() => store.readStateForMaintenance(token), /CLOSE_FAILED/);
  } finally {
    item.cleanup();
  }
});

test('normal reads consistently reject invalid schema, token, items and expiry without cleanup', () => {
  const cases = [
    state({ schema: 'other' }),
    state({ token: 'b'.repeat(64) }),
    state({ items: [] }),
    state({ items: 'not-an-array' }),
    state({ expires_at: undefined }),
    state({ expires_at: 'not-a-date' })
  ];
  for (const value of cases) {
    const item = fixture();
    try {
      fs.writeFileSync(item.target, `${JSON.stringify(value)}\n`, { mode: 0o600 });
      assert.throws(() => item.store.readState(token), /Sitzung ist ungültig/i);
      assert.deepStrictEqual(item.events, []);
      assert.strictEqual(fs.existsSync(item.target), true);
    } finally {
      item.cleanup();
    }
  }
});

test('maintenance reads are mutation-free and validate their binding and expiry', () => {
  const item = fixture({ nowMs: () => Date.parse('2026-08-27T00:00:00.000Z') });
  try {
    const expired = state({ expires_at: '2026-08-20T00:00:00.000Z' });
    fs.writeFileSync(item.target, `${JSON.stringify(expired)}\n`, { mode: 0o600 });
    const before = raw(item.target);
    assert.deepStrictEqual(item.store.readStateForMaintenance(token), expired);
    assert.strictEqual(raw(item.target), before);
    assert.deepStrictEqual(item.events, []);

    for (const invalid of [state({ schema: 'other' }), state({ token: 'b'.repeat(64) }), state({ expires_at: 'invalid' })]) {
      fs.writeFileSync(item.target, `${JSON.stringify(invalid)}\n`, { mode: 0o600 });
      assert.throws(() => item.store.readStateForMaintenance(token), /invalid/);
      assert.deepStrictEqual(item.events, []);
      assert.strictEqual(fs.existsSync(item.target), true);
    }
  } finally {
    item.cleanup();
  }
});

test('expired normal reads clean only their own work directory before unlinking the journal', () => {
  const item = fixture({
    nowMs: () => Date.parse('2026-08-27T00:00:00.000Z'),
    safeRemoveWorkDirectory: () => { item.events.push('remove-work'); }
  });
  try {
    fs.writeFileSync(item.target, `${JSON.stringify(state({ expires_at: '2026-08-20T00:00:00.000Z' }))}\n`);
    const originalUnlink = item.io.unlinkSync;
    item.io.unlinkSync = (target) => { item.events.push('unlink-journal'); return originalUnlink(target); };
    assert.throws(() => item.store.readState(token), /Sitzung ist abgelaufen/i);
    assert.deepStrictEqual(item.events, ['remove-work', 'unlink-journal']);
    assert.strictEqual(fs.existsSync(item.target), false);
  } finally {
    item.cleanup();
  }

  const blocked = fixture({
    nowMs: () => Date.parse('2026-08-27T00:00:00.000Z'),
    safeRemoveWorkDirectory: () => { blocked.events.push('remove-work'); throw new Error('cleanup blocked'); }
  });
  try {
    fs.writeFileSync(blocked.target, `${JSON.stringify(state({ expires_at: '2026-08-20T00:00:00.000Z' }))}\n`);
    const originalUnlink = blocked.io.unlinkSync;
    blocked.io.unlinkSync = (target) => { blocked.events.push('unlink-journal'); return originalUnlink(target); };
    assert.throws(() => blocked.store.readState(token), /Sitzung ist abgelaufen/i);
    assert.deepStrictEqual(blocked.events, ['remove-work']);
    assert.strictEqual(fs.existsSync(blocked.target), true);
  } finally {
    blocked.cleanup();
  }
});

test('the batch composition root preserves the three journal test facades', () => {
  const { _test } = require('../plugins/data-secure/server/gateway/batch');
  assert.strictEqual(typeof _test.writeState, 'function');
  assert.strictEqual(typeof _test.readState, 'function');
  assert.strictEqual(typeof _test.readStateForMaintenance, 'function');
});

done();
