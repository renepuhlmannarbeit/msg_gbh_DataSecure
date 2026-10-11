'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Safe private-tree cleanup');
const { safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { fileIdentity } = require('../plugins/data-secure/server/core/bound-file-io');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-private-tree-'));

function parent(name) {
  const value = path.join(root, name);
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  return value;
}

test('removes only a regular literal child tree', () => {
  const base = parent('regular-parent');
  const target = path.join(base, 'job');
  fs.mkdirSync(path.join(target, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(target, 'nested', 'data.txt'), 'local');
  assert.strictEqual(safeRemovePrivateTree(base, 'job'), true);
  assert.strictEqual(fs.existsSync(target), false);
  assert.strictEqual(fs.existsSync(base), true);
});

test('refuses non-literal children without touching the parent', () => {
  const base = parent('literal-parent');
  fs.writeFileSync(path.join(base, 'keep.txt'), 'keep');
  for (const child of ['..', 'a/b', path.resolve(base, 'absolute')]) {
    assert.throws(() => safeRemovePrivateTree(base, child), /PRIVACY_STORAGE_UNSAFE/);
  }
  assert.strictEqual(fs.readFileSync(path.join(base, 'keep.txt'), 'utf8'), 'keep');
});

test('refuses a direct link or junction and leaves its external target untouched', () => {
  const base = parent('link-parent');
  const outside = parent('link-outside');
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'outside');
  fs.symlinkSync(outside, path.join(base, 'job'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => safeRemovePrivateTree(base, 'job'), /PRIVACY_STORAGE_UNSAFE/);
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'outside');
});

test('refuses a nested link or junction without traversing it', () => {
  const base = parent('nested-link-parent');
  const target = path.join(base, 'job');
  const outside = parent('nested-link-outside');
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.mkdirSync(target);
  fs.writeFileSync(sentinel, 'outside');
  fs.symlinkSync(outside, path.join(target, 'nested'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => safeRemovePrivateTree(base, 'job'), /PRIVACY_STORAGE_UNSAFE/);
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'outside');
  assert.strictEqual(fs.existsSync(target), true);
});

test('stops if a directory is replaced during listing before any external child is touched', () => {
  const base = parent('swap-parent');
  const target = path.join(base, 'job');
  const saved = path.join(base, 'saved-job');
  const outside = parent('swap-outside');
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'local.txt'), 'local');
  fs.writeFileSync(sentinel, 'outside');
  const originalReadDir = fs.readdirSync;
  let swapped = false;
  fs.readdirSync = function patchedReadDir(candidate, ...args) {
    if (!swapped && path.resolve(candidate) === path.resolve(target)) {
      swapped = true;
      fs.renameSync(target, saved);
      fs.symlinkSync(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return originalReadDir.call(fs, candidate, ...args);
  };
  try {
    assert.throws(() => safeRemovePrivateTree(base, 'job'), /PRIVACY_STORAGE_UNSAFE/);
  } finally {
    fs.readdirSync = originalReadDir;
    try { fs.unlinkSync(target); } catch { /* test cleanup only */ }
    try { fs.renameSync(saved, target); } catch { /* test cleanup only */ }
  }
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'outside');
  assert.strictEqual(fs.readFileSync(path.join(target, 'local.txt'), 'utf8'), 'local');
});

function boundOptions(base, target) {
  const identity = (target) => {
    const stat = fs.lstatSync(target, { bigint: true });
    return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
  };
  return { expectedParentIdentity: identity(base), expectedIdentity: identity(target) };
}

test('bound cleanup validates the whole tree before removing any ordinary sibling of an unsafe entry', () => {
  const base = parent('bound-preflight');
  const target = path.join(base, 'job');
  const outside = parent('bound-outside');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'a-keep.txt'), 'preserved');
  fs.symlinkSync(outside, path.join(target, 'z-link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => safeRemovePrivateTree(base, 'job', boundOptions(base, target)), /PRIVACY_STORAGE_UNSAFE/u);
  assert.strictEqual(fs.readFileSync(path.join(target, 'a-keep.txt'), 'utf8'), 'preserved');
});

test('content-bound cleanup rejects changed bytes on the same object before rebinding deletion authority', () => {
  const base = parent('bound-content');
  const target = path.join(base, 'preview.png');
  fs.writeFileSync(target, 'old');
  const options = { ...boundOptions(base, target),
    expectedFileSnapshot: fileIdentity(fs.lstatSync(target, { bigint: true }), true) };
  fs.writeFileSync(target, 'replacement that must survive');
  assert.throws(() => safeRemovePrivateTree(base, 'preview.png', options), /PRIVACY_STORAGE_UNSAFE/u);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'replacement that must survive');
  assert.throws(() => safeRemovePrivateTree(base, 'preview.png', {
    expectedFileSnapshot: options.expectedFileSnapshot
  }), /PRIVACY_STORAGE_UNSAFE/u);
  const fresh = { ...boundOptions(base, target),
    expectedFileSnapshot: fileIdentity(fs.lstatSync(target, { bigint: true }), true) };
  assert.strictEqual(safeRemovePrivateTree(base, 'preview.png', fresh), true);
});

test('content-bound cleanup rechecks the original snapshot immediately before unlink', () => {
  const base = parent('bound-content-late');
  const target = path.join(base, 'preview.png');
  fs.writeFileSync(target, 'old');
  const options = { ...boundOptions(base, target),
    expectedFileSnapshot: fileIdentity(fs.lstatSync(target, { bigint: true }), true) };
  const original = fs.lstatSync;
  let targetReads = 0;
  fs.lstatSync = (candidate, ...args) => {
    if (candidate === target && ++targetReads === 3) {
      fs.writeFileSync(target, 'replacement after preflight');
    }
    return original(candidate, ...args);
  };
  try {
    assert.throws(() => safeRemovePrivateTree(base, 'preview.png', options), /PRIVACY_STORAGE_UNSAFE/u);
  } finally { fs.lstatSync = original; }
  assert.ok(targetReads >= 3);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'replacement after preflight');
});

test('bound cleanup rejects wrong parent and target identities and accepts the exact regular tree', () => {
  const base = parent('bound-identities');
  const target = path.join(base, 'job');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'data.txt'), 'synthetic');
  const options = boundOptions(base, target);
  for (const field of ['expectedIdentity', 'expectedParentIdentity']) {
    assert.throws(() => safeRemovePrivateTree(base, 'job', { ...options,
      [field]: { ...options[field], ino: '0' } }), /PRIVACY_STORAGE_UNSAFE/u);
    assert.strictEqual(fs.existsSync(path.join(target, 'data.txt')), true);
  }
  assert.strictEqual(safeRemovePrivateTree(base, 'job', options), true);
});

done();
