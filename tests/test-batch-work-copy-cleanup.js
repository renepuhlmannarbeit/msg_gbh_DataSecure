'use strict';
// Real private filesystem objects; fault hooks model the named metadata or
// callback boundary only. No native guard, desktop or atomic unlinkat claim.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Bound terminal work-copy cleanup');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-bound-work-cleanup-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'private'); process.env.EU_PRIVACY_ROOT = path.join(scope, 'workspace');
const { createBatchDelivery } = require('../plugins/data-secure/server/gateway/batch-delivery');
const { workPath } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { encodeSourceSnapshot } = require('../plugins/data-secure/server/core/source-snapshot-storage');
const owned = target => { assert.ok(path.resolve(target).startsWith(path.resolve(scope) + path.sep)); return target; };
function fixture({ framed = false, missingRoot = false, missingLeaf = false, junction = false, fault = null } = {}) {
  const bytes = Buffer.from('Own synthetic cleanup payload.\n'), token = crypto.randomBytes(32).toString('hex');
  const state = { schema: 'datasecure-batch/' + (framed ? '8' : '7'), token, product_channel: 'standalone',
    standalone_document_review: true, processing_mode: 'markdown-only', content_options: {
      schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
  const item = { id: crypto.randomBytes(16).toString('hex'), work_name: '001_' + crypto.randomBytes(12).toString('hex') + (framed ? '.workcopy' : '.txt'),
    private_artifact_plain: true, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), work_copy_cleanup_pending: true };
  let payload = bytes;
  if (framed) { const framedBytes = encodeSourceSnapshot(state, item, bytes); payload = framedBytes.bytes; item.source_snapshot_storage = framedBytes.descriptor; }
  const work = workPath(token), outside = owned(path.join(scope, 'outside-' + token)), retired = owned(work + '.retired');
  if (!missingRoot) {
    if (junction) { fs.mkdirSync(outside); fs.symlinkSync(outside, work, process.platform === 'win32' ? 'junction' : 'dir'); }
    else fs.mkdirSync(work);
  }
  const full = path.join(work, item.work_name), actual = path.join(junction ? outside : work, item.work_name);
  if (!missingRoot && !missingLeaf) fs.writeFileSync(actual, payload, { flag: 'wx' });
  const descriptors = new Map(), events = []; let changed = false, readObserved = false, mutationRefusal;
  const io = { ...fs,
    lstatSync(target, options) {
      if (target === work && fault === 'parent-access') throw Object.assign(Error('fixed'), { code: 'EACCES' });
      if (target === full && fault === 'leaf-io') throw Object.assign(Error('fixed'), { code: 'EIO' });
      return fs.lstatSync(target, options);
    },
    openSync(target, flags, mode) { const fd = fs.openSync(target, flags, mode); descriptors.set(fd, target); return fd; },
    readSync(fd, buffer, offset, length, position) {
      const count = fs.readSync(fd, buffer, offset, length, position);
      if (descriptors.get(fd) === full && fault === 'parent-after-close') readObserved = true;
      if (!changed && descriptors.get(fd) === full && ['parent-after-read', 'leaf-after-read'].includes(fault)) {
        if (fault === 'parent-after-read') {
          try { fs.renameSync(owned(work), retired); } catch (error) { mutationRefusal = error; throw error; }
          fs.mkdirSync(work);
        } else fs.renameSync(owned(full), owned(full + '.retired'));
        changed = true;
        fs.writeFileSync(full, 'Unrelated replacement, must survive.', { flag: 'wx' });
      }
      return count;
    },
    closeSync(fd) {
      const target = descriptors.get(fd); descriptors.delete(fd); fs.closeSync(fd);
      if (readObserved && target === full && fault === 'parent-after-close' && !changed) {
        fs.renameSync(owned(work), retired); fs.mkdirSync(work); changed = true;
        fs.writeFileSync(full, 'Unrelated replacement, must survive.', { flag: 'wx' });
      }
      if (fault === 'close') throw Object.assign(Error('fixed'), { code: 'EIO' });
    },
    unlinkSync(target) { owned(target); events.push('unlink'); fs.unlinkSync(target); }
  };
  return { state, item, work, full, actual, retired, payload, events, io, changed: () => changed, mutationRefusal: () => mutationRefusal, delivery: createBatchDelivery({ io }) };
}
for (const framed of [false, true]) {
  test('normal ' + (framed ? '/8 frame' : '/7 raw') + ' is removed once and clears only its cleanup debt', () => {
    const f = fixture({ framed }); f.delivery.cleanupTerminalWorkCopy(f.state, f.item);
    assert.equal(fs.existsSync(f.full), false); assert.deepEqual(f.events, ['unlink']); assert.equal(f.item.work_copy_cleanup_pending, undefined);
  });
  for (const missing of ['root', 'leaf']) test('genuine stable missing ' + missing + ' for ' + (framed ? '/8' : '/7') + ' needs no unlink', () => {
    const f = fixture({ framed, missingRoot: missing === 'root', missingLeaf: missing === 'leaf' });
    f.delivery.cleanupTerminalWorkCopy(f.state, f.item); assert.deepEqual(f.events, []); assert.equal(f.item.work_copy_cleanup_pending, undefined);
  });
  for (const missingLeaf of [false, true]) test('a redirected parent is refused before ' + (missingLeaf ? 'missing-child acknowledgement' : 'any external leaf deletion') + (framed ? ' /8' : ' /7'), () => {
    const f = fixture({ framed, junction: true, missingLeaf });
    assert.throws(() => f.delivery.cleanupTerminalWorkCopy(f.state, f.item));
    assert.deepEqual(f.events, []); assert.equal(f.item.work_copy_cleanup_pending, true);
    if (!missingLeaf) assert.deepEqual(fs.readFileSync(f.actual), f.payload);
  });
}
for (const fault of ['parent-access', 'leaf-io', 'close', 'parent-after-read', 'parent-after-close', 'leaf-after-read'])
  test('refused ' + fault + ' never deletes or confirms cleanup', () => {
    const f = fixture({ fault }); assert.throws(() => f.delivery.cleanupTerminalWorkCopy(f.state, f.item));
    assert.deepEqual(f.events, []); assert.equal(f.item.work_copy_cleanup_pending, true);
    if (fault === 'parent-after-read' || fault === 'parent-after-close') {
      if (fault === 'parent-after-close') assert.equal(f.changed(), true, 'the post-close parent exchange must actually execute');
      if (f.changed()) assert.deepEqual(fs.readFileSync(path.join(f.retired, f.item.work_name)), f.payload);
      else {
        assert.equal(fault, 'parent-after-read');
        assert.ok(['EPERM', 'EACCES', 'EBUSY'].includes(f.mutationRefusal()?.code));
        assert.deepEqual(fs.readFileSync(f.full), f.payload);
      }
    }
    else if (fault === 'leaf-after-read') assert.deepEqual(fs.readFileSync(f.full + '.retired'), f.payload);
    else assert.deepEqual(fs.readFileSync(f.actual), f.payload);
  });
test('hardlinked copies remain untouched at both names', () => {
  const f = fixture(), second = owned(f.full + '.second'); fs.linkSync(f.full, second);
  assert.throws(() => f.delivery.cleanupTerminalWorkCopy(f.state, f.item));
  assert.deepEqual(fs.readFileSync(f.full), f.payload); assert.deepEqual(fs.readFileSync(second), f.payload);
  assert.deepEqual(f.events, []); assert.equal(f.item.work_copy_cleanup_pending, true);
});
for (const primary of [undefined, null, false, 0, '', Object.freeze(Object.assign(Error('fixed'), { code: 'EBUSY' }))])
  test('a throwing unlink callback retains the exact primary, including ' + String(primary?.code ?? primary), () => {
    const f = fixture(); let thrown = false, observed;
    try { f.delivery.cleanupTerminalWorkCopy(f.state, f.item, { unlinkWorkCopy() { throw primary; } }); }
    catch (error) { thrown = true; observed = error; }
    assert.equal(thrown, true); assert.equal(observed, primary); assert.deepEqual(fs.readFileSync(f.full), f.payload);
    assert.equal(f.item.work_copy_cleanup_pending, true); assert.deepEqual(f.events, []);
  });
test('a no-op callback cannot confirm a deletion', () => {
  const f = fixture(); let called = 0;
  assert.throws(() => f.delivery.cleanupTerminalWorkCopy(f.state, f.item, { unlinkWorkCopy() { called++; return true; } }));
  assert.equal(called, 1); assert.deepEqual(fs.readFileSync(f.full), f.payload); assert.equal(f.item.work_copy_cleanup_pending, true);
});
test('a changed parent after actual deletion remains unconfirmed and is not retried', () => {
  const f = fixture(); let called = 0, didDelete = false, didSwap = false;
  assert.throws(() => f.delivery.cleanupTerminalWorkCopy(f.state, f.item, { unlinkWorkCopy(target) {
    called++; fs.unlinkSync(owned(target)); didDelete = true;
    fs.renameSync(owned(f.work), f.retired); fs.mkdirSync(f.work); didSwap = true;
  } }), error => error.code === 'BOUND_FILE_CHANGED');
  assert.equal(didDelete, true); assert.equal(didSwap, true);
  assert.equal(called, 1); assert.equal(f.item.work_copy_cleanup_pending, true); assert.deepEqual(f.events, []);
});

done(() => {
  if (process.exitCode) return; // Retain failed own fixtures for diagnosis.
  assert.equal(path.dirname(scope), fs.realpathSync.native(os.tmpdir()));
  assert.ok(path.basename(scope).startsWith('datasecure-bound-work-cleanup-'));
  assert.equal(fs.realpathSync.native(scope), scope);
  fs.rmSync(scope, { recursive: true });
});
