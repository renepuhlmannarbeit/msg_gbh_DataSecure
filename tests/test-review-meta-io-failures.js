'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Review metadata IO ownership and primary failures');
const { writeFileAtomically, writeReviewMetaAtomically } = require('../plugins/data-secure/server/gateway/review-meta-io');
const { syncParentDirectory } = require('../plugins/data-secure/server/gateway/batch-journal-io');
const constants = require('node:fs').constants;
const target = 'synthetic-private-meta.json';
function caught(action) {
  let thrown = false, value;
  try { action(); } catch (error) { thrown = true; value = error; }
  assert.equal(thrown, true); return value;
}
// Fixed synchronous filesystem boundary only. No native file, collision,
// descriptor reuse, ACL mutation, user path or durability claim is performed.
function model(options = {}) {
  const state = { events: [], closes: [], unlinks: [], buffers: [], chunks: [], entries: new Map(), temporary: null };
  const failure = key => { if (Object.hasOwn(options, key)) throw options[key]; };
  const io = { constants,
    openSync(name, flags, mode) {
      const file = Boolean(flags & constants.O_CREAT); state.events.push(file ? 'open-file' : 'open-parent');
      if (file) {
        state.temporary = name;
        if (Object.hasOwn(options, 'openFailure')) { state.entries.set(name, 'foreign-before-open'); failure('openFailure'); }
        assert.equal(mode, 0o600); assert.ok(flags & constants.O_EXCL); state.entries.set(name, 'owned');
      } else failure('parentOpenFailure');
      return file ? 17 : 29;
    },
    writeSync(fd, bytes, offset, length) {
      assert.equal(fd, 17); state.events.push('write'); state.buffers.push(bytes); failure('writeFailure');
      const count = Math.min(length, 3); state.chunks.push(Buffer.from(bytes.subarray(offset, offset + count))); return count;
    },
    fsyncSync(fd) { state.events.push(fd === 17 ? 'sync-file' : 'sync-parent'); failure(fd === 17 ? 'fileSyncFailure' : 'parentSyncFailure'); },
    closeSync(fd) { state.closes.push(fd); state.events.push('close-' + fd); failure(fd === 17 ? 'fileCloseFailure' : 'parentCloseFailure'); },
    renameSync(from, to) {
      state.events.push('rename'); failure('renameFailure');
      state.entries.set(to, state.entries.get(from)); state.entries.delete(from);
      if (options.replaceOldName) state.entries.set(from, 'foreign-after-rename');
    },
    unlinkSync(name) { state.unlinks.push(name); state.entries.delete(name); }
  };
  return { io, state };
}
test('failed exclusive open never removes an existing unowned temporary name', () => {
  const error = Object.freeze(Object.assign(new Error('occupied'), { code: 'EEXIST' })), { io, state } = model({ openFailure: error });
  assert.strictEqual(caught(() => writeFileAtomically(target, 'value', io, 'win32')), error);
  assert.deepEqual(state.unlinks, []); assert.deepEqual(state.closes, []);
  assert.equal(state.entries.get(state.temporary), 'foreign-before-open');
});
test('successful rename never cleans up a later object at the old name', () => {
  const { io, state } = model({ replaceOldName: true });
  writeFileAtomically(target, 'value', io, 'win32');
  assert.equal(state.entries.get(target), 'owned');
  assert.equal(state.entries.get(state.temporary), 'foreign-after-rename'); assert.deepEqual(state.unlinks, []);
});
test('a close-only failure is propagated and its descriptor is never closed twice', () => {
  const error = Object.freeze(new Error('close')), { io, state } = model({ fileCloseFailure: error });
  assert.strictEqual(caught(() => writeFileAtomically(target, 'value', io, 'win32')), error);
  assert.deepEqual(state.closes, [17]); assert.ok(!state.events.includes('rename')); assert.deepEqual(state.unlinks, []);
});
test('write and sync failures retain original identity including falsy values through cleanup failure', () => {
  for (const primary of [Object.freeze(new Error('primary')), null, undefined, false, 0]) {
    for (const operation of ['writeFailure', 'fileSyncFailure']) {
      const { io, state } = model({ [operation]: primary, fileCloseFailure: new Error('secondary') });
      assert.strictEqual(caught(() => writeFileAtomically(target, Buffer.from('private'), io, 'win32')), primary);
      assert.deepEqual(state.closes, [17]); assert.deepEqual(state.unlinks, []); assert.ok(!state.events.includes('rename'));
      assert.ok(state.buffers.every(bytes => bytes.every(byte => byte === 0)));
    }
  }
});
test('POSIX directory sync preserves the first failure and attempts close once', () => {
  for (const primary of [Object.freeze(new Error('sync')), null, undefined, false, 0]) {
    const { io, state } = model({ parentSyncFailure: primary, parentCloseFailure: new Error('close') });
    assert.strictEqual(caught(() => syncParentDirectory(target, io, 'darwin')), primary);
    assert.deepEqual(state.closes, [29]);
  }
  const error = new Error('close-only'), { io, state } = model({ parentCloseFailure: error });
  assert.strictEqual(caught(() => syncParentDirectory(target, io, 'darwin')), error); assert.deepEqual(state.closes, [29]);
});
test('successful short writes preserve the input and flush file then renamed parent', () => {
  const input = Buffer.from('ÄÖÜß😀 private metadata'), before = Buffer.from(input), { io, state } = model();
  writeFileAtomically(target, input, io, 'darwin');
  assert.deepEqual(input, before); assert.deepEqual(Buffer.concat(state.chunks), before);
  assert.ok(state.buffers.every(bytes => bytes.every(byte => byte === 0)));
  assert.deepEqual(state.closes, [17, 29]); assert.deepEqual(state.unlinks, []);
  assert.ok(state.events.indexOf('sync-file') < state.events.indexOf('rename'));
  assert.ok(state.events.indexOf('rename') < state.events.indexOf('sync-parent'));
});
test('failed rename retains its original error and private temporary evidence', () => {
  const error = Object.freeze(Object.assign(new Error('rename'), { code: 'EIO' })), { io, state } = model({ renameFailure: error });
  assert.strictEqual(caught(() => writeFileAtomically(target, 'value', io, 'darwin')), error);
  assert.deepEqual(state.closes, [17]); assert.deepEqual(state.unlinks, []);
  assert.equal(state.entries.get(state.temporary), 'owned'); assert.ok(!state.events.includes('sync-parent'));
});
test('Windows never claims a portable directory sync and JSON failure starts no IO', () => {
  const { io, state } = model(); assert.equal(syncParentDirectory(target, io, 'win32'), false);
  assert.deepEqual(state.events, []);
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => writeReviewMetaAtomically(target, cycle, io, 'win32'), TypeError); assert.deepEqual(state.events, []);
});
done();
