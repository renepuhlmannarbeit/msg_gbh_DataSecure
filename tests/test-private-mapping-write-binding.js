'use strict';
// Actual intent writer and owned filesystem objects. Publication is an explicit
// prevalidated fact fixture; this is not a native Guard/ACL/desktop test.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Private mapping intent write binding');
const parent = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'datasecure-mapping-binding-'));
const identity = fs.lstatSync(root, { bigint: true }), oldRoot = process.env.EU_PRIVACY_DATA_ROOT;
const mapping = require('../plugins/data-secure/server/gateway/standalone-anonymized-mapping');
const originals = Object.fromEntries(['openSync', 'closeSync', 'writeSync', 'linkSync'].map(key => [key, fs[key]]));
function fixture(action) {
  const base = fs.mkdtempSync(path.join(root, 'case-')), product = path.join(base, 'product'), outside = path.join(base, 'outside');
  fs.mkdirSync(product); fs.mkdirSync(outside); process.env.EU_PRIVACY_DATA_ROOT = product;
  const state = { token: 'a'.repeat(64) }, item = { id: 'b'.repeat(32), package_id: 'ds_' + 'b'.repeat(32),
    status: 'mapping_pending', source_label: 'SYNTHETIC-PRIVATE-SOURCE.txt' };
  const publication = { state: 'verified', publication_binding: { package_id: item.package_id },
    document_result: { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null } };
  const directory = path.join(product, 'standalone-anonymized-mapping-intents');
  const context = { base, product, outside, directory, state, item, publication,
    create: () => mapping.ensurePrivateMappingIntent(state, item, publication) };
  try { action(context); }
  finally { Object.assign(fs, originals); }
}
const isTemporary = (file, context) => path.dirname(String(file)) === context.directory && /^\.am_[a-f0-9]{32}\.tmp$/u.test(path.basename(String(file)));
const pending = operation => assert.throws(operation, { code: 'LOCAL_MAPPING_EXPORT_PENDING' });

test('normal creation and same-intent replay retain exact bytes and one link', () => fixture(context => {
  const first = context.create(), bytes = fs.readFileSync(first.target);
  assert.equal(JSON.parse(bytes).source_label, context.item.source_label);
  assert.equal(context.create().target, first.target);
  assert.deepEqual(fs.readFileSync(first.target), bytes);
  assert.equal(fs.lstatSync(first.target).nlink, 1);
  assert.deepEqual(fs.readdirSync(context.directory), [path.basename(first.target)]);
}));

test('real pre-open parent exchange refuses before any private payload reaches the redirected directory', () => fixture(context => {
  let exchanged = false, descriptor, writes = 0;
  fs.openSync = function(file, ...args) {
    if (!exchanged && isTemporary(file, context)) {
      fs.renameSync(context.directory, path.join(context.product, 'retired-intents'));
      fs.symlinkSync(context.outside, context.directory, process.platform === 'win32' ? 'junction' : 'dir');
      exchanged = true; descriptor = originals.openSync.call(fs, file, ...args); return descriptor;
    }
    return originals.openSync.call(fs, file, ...args);
  };
  fs.writeSync = function(fd, ...args) { if (fd === descriptor) writes++; return originals.writeSync.call(fs, fd, ...args); };
  pending(context.create);
  assert.equal(exchanged, true); assert.equal(writes, 0);
  assert.ok(fs.readdirSync(context.outside).length > 0, 'the attempted exclusive open may leave an empty owned file');
  for (const leaf of fs.readdirSync(context.outside)) assert.equal(fs.readFileSync(path.join(context.outside, leaf)).length, 0);
  assert.deepEqual(fs.readdirSync(path.join(context.product, 'retired-intents')), []);
}));

test('an added hardlink after exclusive open prevents the first payload write', () => fixture(context => {
  let linked = false, descriptor, writes = 0;
  fs.openSync = function(file, ...args) {
    const fd = originals.openSync.call(fs, file, ...args);
    if (!linked && isTemporary(file, context)) {
      descriptor = fd; fs.linkSync(file, path.join(context.outside, 'owned-alias')); linked = true;
    }
    return fd;
  };
  fs.writeSync = function(fd, ...args) { if (fd === descriptor) writes++; return originals.writeSync.call(fs, fd, ...args); };
  pending(context.create);
  assert.equal(linked, true); assert.equal(writes, 0);
  assert.equal(fs.readFileSync(path.join(context.outside, 'owned-alias')).length, 0);
}));

test('actual short writes still publish the complete exact intent without temporary aliases', () => fixture(context => {
  const descriptors = new Set(); let writes = 0;
  fs.openSync = function(file, ...args) {
    const fd = originals.openSync.call(fs, file, ...args); if (isTemporary(file, context)) descriptors.add(fd); return fd;
  };
  fs.closeSync = function(fd) { descriptors.delete(fd); return originals.closeSync.call(fs, fd); };
  fs.writeSync = function(fd, bytes, offset, length, position) {
    if (descriptors.has(fd)) { writes++; length = Math.min(length, 7); }
    return originals.writeSync.call(fs, fd, bytes, offset, length, position);
  };
  const result = context.create();
  assert.ok(writes > 1); assert.equal(JSON.parse(fs.readFileSync(result.target)).source_label, context.item.source_label);
  assert.equal(fs.lstatSync(result.target).nlink, 1);
  assert.deepEqual(fs.readdirSync(context.directory), [path.basename(result.target)]);
}));

test('a concurrent different final intent is preserved on atomic-link conflict', () => fixture(context => {
  let conflictingTarget;
  fs.linkSync = function(from, to) {
    if (isTemporary(from, context)) { conflictingTarget = to; fs.writeFileSync(to, 'foreign synthetic intent', { flag: 'wx' }); }
    return originals.linkSync.call(fs, from, to);
  };
  pending(context.create);
  assert.ok(conflictingTarget); assert.equal(fs.readFileSync(conflictingTarget, 'utf8'), 'foreign synthetic intent');
  assert.deepEqual(fs.readdirSync(context.directory), [path.basename(conflictingTarget)]);
}));

test('a changed temporary object at link cannot be accepted or deleted as the original', () => fixture(context => {
  let replaced = false, replacement, retired;
  fs.linkSync = function(from, to) {
    if (isTemporary(from, context)) {
      retired = path.join(context.product, 'retired-owned-temp'); fs.renameSync(from, retired);
      fs.writeFileSync(from, 'foreign synthetic replacement', { flag: 'wx' }); replacement = from; replaced = true;
    }
    return originals.linkSync.call(fs, from, to);
  };
  pending(context.create);
  assert.equal(replaced, true); assert.equal(fs.readFileSync(replacement, 'utf8'), 'foreign synthetic replacement');
  assert.equal(JSON.parse(fs.readFileSync(retired)).source_label, context.item.source_label);
}));

test('a post-write close refusal remains pending and cleans only the captured own temporary object', () => fixture(context => {
  let descriptor, refused = false;
  fs.openSync = function(file, ...args) {
    const fd = originals.openSync.call(fs, file, ...args); if (isTemporary(file, context)) descriptor = fd; return fd;
  };
  fs.closeSync = function(fd) {
    const value = originals.closeSync.call(fs, fd);
    if (fd === descriptor && !refused) { refused = true; throw Object.assign(new Error('synthetic close'), { code: 'EIO' }); }
    return value;
  };
  pending(context.create);
  assert.equal(refused, true); assert.deepEqual(fs.readdirSync(context.directory), []);
}));

if (oldRoot === undefined) delete process.env.EU_PRIVACY_DATA_ROOT; else process.env.EU_PRIVACY_DATA_ROOT = oldRoot;
done();
if (!process.exitCode) {
  const current = fs.lstatSync(root, { bigint: true });
  assert.equal(path.dirname(root), parent); assert.equal(fs.realpathSync.native(root), root);
  assert.ok(path.basename(root).startsWith('datasecure-mapping-binding-'));
  assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
  fs.rmSync(root, { recursive: true, force: false });
}
