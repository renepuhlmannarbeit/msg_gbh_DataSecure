'use strict';
// Real filesystem writes and durable private anchors, with one explicit
// metadata model for adjacent u64 inode values which collapse as JS Numbers.
// This is not a claim of a reproduced native OS race or packaged Mac test.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Initial results: exact identities and restart anchors');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-initial-exact-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const { roots, ensurePrivateDirectory } = require('../plugins/data-secure/server/gateway/common');
const exporter = require('../plugins/data-secure/server/gateway/result-export'), io = exporter._test;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let serial = 0;
function fixture(name = 'Dokument.md') {
  const id = (++serial).toString(16).padStart(32, '0'), results = path.join(root, `results-${serial}`);
  fs.mkdirSync(results); process.env.EU_PRIVACY_RESULT_ROOT = results;
  const packageId = `ds_${id}`, bytes = Buffer.from('# Synthetisch\n[PERSON_001] hat 42 Projekte.\n');
  const packagePath = path.join(roots().output, packageId); fs.mkdirSync(packagePath);
  fs.writeFileSync(path.join(packagePath, `${packageId}.md`), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(packagePath, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/2', package_id: packageId,
    profile: 'general', created_at: '2026-10-20T01:00:00.000Z', document: `${packageId}.md`, document_sha256: hash(bytes), assets: [] }), { flag: 'wx' });
  const item = { package_id: packageId, file: name, sha256: hash(bytes), source_label: name.replace(/\.md$/u, '.txt') };
  const record = { schema: exporter.SCHEMA, result_layout: exporter.RESULT_LAYOUT, batch_id: id.repeat(2),
    run_directory: `Lauf-20261020-010000-${id.slice(-8)}`, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    destination_id: '', complete: false, items: [item] };
  const destination = io.activeDestination(record); record.destination_id = destination.id;
  return { results, record, item, destination, bytes,
    begin() { const progress = io.initialProgress(record, destination), run = io.ensurePlainDirectory(destination, record.run_directory, progress);
      return { progress, run }; } };
}
function overrides(values, action) {
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, fs[key]]));
  for (const [key, factory] of Object.entries(values)) fs[key] = factory(originals[key]);
  try { return action(); } finally { Object.assign(fs, originals); }
}
function ownershipControl(control, action) {
  const modulePath = require.resolve('../plugins/data-secure/server/core/ownership-control');
  const original = require(modulePath);
  require.cache[modulePath].exports = Object.freeze({ ...original, withOwnershipControl: control });
  try { return action(); } finally { require.cache[modulePath].exports = original; }
}
function changedInode(stat, ino, bigint) {
  const value = Object.create(stat);
  Object.defineProperty(value, 'ino', { value: bigint ? ino : Number(ino), enumerable: true });
  return value;
}
test('new destination IDs are versioned exact bindings; legacy IDs retain their old material', () => {
  const f = fixture(), checked = require('../plugins/data-secure/server/gateway/result-folder-config').inspectRoot(f.results);
  const old = { ...f.record }; delete old.result_layout;
  const legacy = io.activeDestination(old), rootBinding = legacy.root, out = legacy.output;
  const legacyMaterial = `${checked.root}\0${checked.identity.dev}\0${checked.identity.ino}\0${checked.identity.birthtime_ms}`;
  assert.equal(legacy.id, hash(`${legacyMaterial}\0${out.real}\0${out.dev}\0${out.ino}\0${out.birthtime}`));
  assert.equal(legacy.legacyId, hash(legacyMaterial)); assert.equal(rootBinding.exact, undefined);
  assert.equal(f.destination.legacyId, null); assert.equal(f.destination.root.exact, true);
  assert.notEqual(f.destination.id, legacy.id);
});
test('adjacent same-Number inode replacement is refused for the object and every retained ancestor', () => {
  const f = fixture(), child = path.join(f.results, 'child'); fs.mkdirSync(child);
  const first = 70931694135686584n, second = first + 1n; assert.equal(Number(first), Number(second));
  let changed = false;
  const rewrite = original => (target, options) => {
    const stat = original(target, options);
    return path.resolve(String(target)) === f.results ? changedInode(stat, changed ? second : first, options?.bigint === true) : stat;
  };
  overrides({ lstatSync: rewrite, statSync: rewrite }, () => {
    const legacy = io.bindPlainDirectory(f.results), exactRoot = io.bindPlainDirectory(f.results, null, true), exactChild = io.bindPlainDirectory(child, exactRoot);
    changed = true;
    assert.doesNotThrow(() => io.assertDirectoryBinding(legacy), 'causal old representation collision, not an OS bypass claim');
    assert.throws(() => io.assertDirectoryBinding(exactRoot));
    assert.throws(() => io.assertDirectoryBinding(exactChild), 'unchanged child cannot hide a replaced ancestor');
  });
});
test('durable directory and successful leaf anchors survive a fresh export call without another copy', () => {
  const f = fixture('nested/Dokument.md'), { progress, run } = f.begin();
  assert.equal(io.exportOne(f.destination, run, f.item, undefined, f.record, progress), true);
  const leaf = path.join(run.path, f.item.file), before = fs.statSync(leaf, { bigint: true });
  const freshDestination = io.activeDestination(f.record), freshProgress = io.initialProgress(f.record, freshDestination);
  const freshRun = io.ensurePlainDirectory(freshDestination, f.record.run_directory, freshProgress);
  assert.equal(io.exportOne(freshDestination, freshRun, f.item, undefined, f.record, freshProgress), false);
  assert.deepEqual(fs.readFileSync(leaf), f.bytes);
  assert.equal(fs.statSync(leaf, { bigint: true }).ino, before.ino);
  assert.deepEqual(io.inspectInitialLeaf(freshProgress, freshRun, f.item).bytes, f.bytes);
});
test('pre-existing unrecorded run, subfolder and equal-byte leaf are never adopted', () => {
  const orphanRun = fixture();
  fs.mkdirSync(path.join(orphanRun.destination.output.path, orphanRun.record.run_directory));
  assert.throws(() => io.initialProgress(orphanRun.record, orphanRun.destination));
  const crashRun = fixture(), progress = io.initialProgress(crashRun.record, crashRun.destination);
  fs.mkdirSync(path.join(crashRun.destination.output.path, crashRun.record.run_directory));
  assert.throws(() => io.ensurePlainDirectory(crashRun.destination, crashRun.record.run_directory, progress));
  const f = fixture('nested/Dokument.md'), owned = f.begin(); fs.mkdirSync(path.join(owned.run.path, 'nested'));
  assert.throws(() => io.exportOne(f.destination, owned.run, f.item, undefined, f.record, owned.progress));
  const g = fixture(), own = g.begin(); fs.writeFileSync(path.join(own.run.path, g.item.file), g.bytes, { flag: 'wx' });
  assert.throws(() => io.exportOne(g.destination, own.run, g.item, undefined, g.record, own.progress));
  assert.deepEqual(fs.readFileSync(path.join(own.run.path, g.item.file)), g.bytes);
});
test('refused output ownership starts neither a directory attempt nor mkdir', () => {
  const f = fixture(), progress = io.initialProgress(f.record, f.destination);
  const target = path.join(f.destination.output.path, f.record.run_directory), relative = path.relative(f.destination.output.path, target);
  const attempt = `directory-attempt-${hash(relative)}.json`;
  let mkdirCount = 0, callbackCount = 0;
  ownershipControl((guardRoot, _callback) => {
    assert.equal(guardRoot, f.destination.output.path); callbackCount++;
    throw Object.assign(Error('OWNERSHIP_GUARD_UNAVAILABLE'), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
  }, () => overrides({ mkdirSync: original => (named, ...args) => {
    if (String(named) === target) mkdirCount++; return original(named, ...args);
  } }, () => assert.throws(() => io.ensurePlainDirectory(f.destination, f.record.run_directory, progress),
    error => error.code === 'OWNERSHIP_GUARD_UNAVAILABLE')));
  assert.equal(callbackCount, 1); assert.equal(mkdirCount, 0); assert.equal(progress.read(attempt), null);
  assert.equal(fs.existsSync(target), false);
});
test('new Run and subfolder creation stay inside one synchronous exact-output guard callback each', () => {
  const f = fixture('nested/Dokument.md'), progress = io.initialProgress(f.record, f.destination);
  let active = false, scopes = 0, checks = 0, mkdirCount = 0;
  ownershipControl((guardRoot, callback) => {
    assert.equal(guardRoot, f.destination.output.path); assert.notEqual(guardRoot, f.results);
    assert.notEqual(callback.constructor.name, 'AsyncFunction'); assert.equal(active, false);
    active = true; scopes++;
    try {
      const value = callback(Object.freeze({ assertHeld() { assert.equal(active, true); checks++; } }));
      assert.equal(typeof value?.then, 'undefined', 'no Promise escapes the critical section'); return value;
    } finally { active = false; }
  }, () => overrides({ mkdirSync: original => (named, ...args) => {
    if (String(named).startsWith(f.destination.output.path + path.sep)) { assert.equal(active, true); mkdirCount++; }
    return original(named, ...args);
  } }, () => {
    const run = io.ensurePlainDirectory(f.destination, f.record.run_directory, progress);
    io.ensureResultParent(f.destination, run, f.item.file, progress);
    assert.deepEqual(fs.readdirSync(run.path), ['nested'], 'control metadata is never put in shareable results');
  }));
  assert.equal(scopes, 2); assert.equal(mkdirCount, 2); assert.ok(checks >= 10); assert.equal(active, false);
});
test('output or ancestor replacement during ownership admission fails before any attempt or mkdir', () => {
  const f = fixture(), progress = io.initialProgress(f.record, f.destination);
  const target = path.join(f.destination.output.path, f.record.run_directory);
  let mkdirCount = 0;
  ownershipControl((guardRoot, callback) => {
    assert.equal(guardRoot, f.destination.output.path);
    fs.renameSync(guardRoot, guardRoot + '-preserved'); fs.mkdirSync(guardRoot);
    return callback(Object.freeze({ assertHeld() { return true; } }));
  }, () => overrides({ mkdirSync: original => (named, ...args) => {
    if (String(named) === target) mkdirCount++; return original(named, ...args);
  } }, () => assert.throws(() => io.ensurePlainDirectory(f.destination, f.record.run_directory, progress))));
  assert.equal(mkdirCount, 0); assert.equal(fs.existsSync(target), false);
  const privateProgress = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-publication-progress', f.record.batch_id);
  assert.deepEqual(fs.readdirSync(privateProgress), ['intent.json']);
});
test('guard close uncertainty propagates despite a recorded directory and read-only reopen does not take mutation authority', () => {
  const f = fixture(), progress = io.initialProgress(f.record, f.destination);
  let scopes = 0;
  ownershipControl((guardRoot, callback) => {
    assert.equal(guardRoot, f.destination.output.path); scopes++;
    callback(Object.freeze({ assertHeld() { return true; } }));
    throw Object.assign(Error('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
  }, () => assert.throws(() => io.ensurePlainDirectory(f.destination, f.record.run_directory, progress),
    error => error.code === 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'));
  assert.equal(scopes, 1);
  const freshDestination = io.activeDestination(f.record), fresh = io.initialProgress(f.record, freshDestination);
  ownershipControl(() => { throw Error('recorded directory reopen must remain read-only'); }, () => {
    const run = io.ensurePlainDirectory(freshDestination, f.record.run_directory, fresh);
    assert.deepEqual(fs.readdirSync(run.path), []);
  });
});
test('crash after a real mkdir and later external deletion cannot issue a second mkdir', () => {
  for (const nested of [false, true]) {
    const f = fixture(nested ? 'nested/Dokument.md' : 'Dokument.md');
    const progress = io.initialProgress(f.record, f.destination);
    const run = nested ? io.ensurePlainDirectory(f.destination, f.record.run_directory, progress) : null;
    const target = nested ? path.join(run.path, 'nested') : path.join(f.destination.output.path, f.record.run_directory);
    let mkdirCount = 0;
    const fault = original => (named, ...args) => {
      const result = original(named, ...args);
      if (String(named) === target) { mkdirCount++; throw Error('synthetic crash after actual mkdir before success anchor'); }
      return result;
    };
    overrides({ mkdirSync: fault }, () => assert.throws(() => nested
      ? io.ensureResultParent(f.destination, run, f.item.file, progress)
      : io.ensurePlainDirectory(f.destination, f.record.run_directory, progress), /synthetic crash/u));
    assert.equal(mkdirCount, 1); assert.equal(fs.statSync(target).isDirectory(), true);
    // Simulate the user's later removal of this one fresh, empty fixture.
    const relative = path.relative(root, target), stat = fs.lstatSync(target);
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink()); assert.deepEqual(fs.readdirSync(target), []);
    fs.rmdirSync(target);
    const freshDestination = io.activeDestination(f.record), fresh = io.initialProgress(f.record, freshDestination);
    overrides({ mkdirSync: original => (named, ...args) => {
      if (String(named) === target) mkdirCount++; return original(named, ...args);
    } }, () => assert.throws(() => {
      const freshRun = io.ensurePlainDirectory(freshDestination, f.record.run_directory, fresh);
      if (nested) io.ensureResultParent(freshDestination, freshRun, f.item.file, fresh);
    }, /RESULT_EXPORT_STATE_UNSAFE/u));
    assert.equal(mkdirCount, 1, 'durable pre-mutation attempt survives removal of its unrecorded directory');
    assert.equal(fs.existsSync(target), false);
  }
});
test('crash after a real link and later external deletion cannot issue a second link', () => {
  const f = fixture(), { progress, run } = f.begin(), target = path.join(run.path, f.item.file);
  let linkCount = 0;
  overrides({ linkSync: original => (source, named) => {
    const result = original(source, named);
    if (String(named) === target) { linkCount++; throw Error('synthetic crash after actual link before success anchor'); }
    return result;
  } }, () => assert.throws(() => io.exportOne(f.destination, run, f.item, undefined, f.record, progress), /synthetic crash/u));
  assert.equal(linkCount, 1); assert.deepEqual(fs.readFileSync(target), f.bytes);
  assert.equal(progress.read(`file-${hash(f.item.file)}.json`), null);
  const relative = path.relative(root, target), stat = fs.lstatSync(target);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  assert.ok(stat.isFile() && !stat.isSymbolicLink()); fs.unlinkSync(target);
  const freshDestination = io.activeDestination(f.record), fresh = io.initialProgress(f.record, freshDestination);
  const freshRun = io.ensurePlainDirectory(freshDestination, f.record.run_directory, fresh);
  overrides({ linkSync: original => (source, named) => { if (String(named) === target) linkCount++; return original(source, named); } },
    () => assert.throws(() => io.exportOne(freshDestination, freshRun, f.item, undefined, f.record, fresh), /RESULT_EXPORT_STATE_UNSAFE/u));
  assert.equal(linkCount, 1, 'durable pre-mutation attempt survives removal of its unrecorded file');
  assert.equal(fs.existsSync(target), false);
});
test('manual run or anchored subfolder deletion is not repaired on restart', () => {
  for (const name of ['Dokument.md', 'nested/Dokument.md']) {
    const f = fixture(name), { progress, run } = f.begin();
    io.exportOne(f.destination, run, f.item, undefined, f.record, progress);
    const missing = name.includes('/') ? path.join(run.path, 'nested') : run.path;
    fs.renameSync(missing, missing + '-preserved');
    const fresh = io.initialProgress(f.record, io.activeDestination(f.record));
    assert.throws(() => {
      const reopened = io.ensurePlainDirectory(f.destination, f.record.run_directory, fresh);
      io.exportOne(f.destination, reopened, f.item, undefined, f.record, fresh);
    });
    assert.equal(fs.existsSync(missing), false, 'no silent mkdir resurrection');
  }
});
test('same-byte leaf replacement is rejected against its successful pre-existing private anchor', () => {
  const f = fixture(), { progress, run } = f.begin(); io.exportOne(f.destination, run, f.item, undefined, f.record, progress);
  const target = path.join(run.path, f.item.file); fs.renameSync(target, target + '.preserved'); fs.writeFileSync(target, f.bytes, { flag: 'wx' });
  assert.throws(() => io.inspectInitialLeaf(progress, run, f.item));
  assert.throws(() => io.exportOne(f.destination, run, f.item, undefined, f.record, progress));
  assert.deepEqual(fs.readFileSync(target), f.bytes); assert.deepEqual(fs.readFileSync(target + '.preserved'), f.bytes);
});
test('temp metadata and post-link ownership do not accept rounded u64 collisions', () => {
  for (const phase of ['temp', 'link']) {
    const f = fixture(), { progress, run } = f.begin(), first = 70931694135686584n, second = first + 1n;
    let temporary, linked = false;
    overrides({
      openSync: original => (target, ...args) => { const fd = original(target, ...args);
        if (String(target).startsWith(run.path + path.sep + '.Dokument.md.')) temporary = String(target); return fd; },
      fstatSync: original => (fd, options) => { const stat = original(fd, options);
        return temporary && stat.isFile() && stat.size === (options?.bigint ? BigInt(f.bytes.length) : f.bytes.length)
          ? changedInode(stat, first, options?.bigint === true) : stat; },
      lstatSync: original => (target, options) => { const stat = original(target, options);
        return String(target) === temporary || linked && String(target) === path.join(run.path, f.item.file)
          ? changedInode(stat, phase === 'temp' || linked ? second : first, options?.bigint === true) : stat; },
      linkSync: original => (source, target) => { const result = original(source, target); if (String(source) === temporary) linked = true; return result; }
    }, () => assert.throws(() => io.exportOne(f.destination, run, f.item, undefined, f.record, progress), /RESULT_EXPORT_(?:PATH_UNSAFE|VERIFY_FAILED)/u));
    assert.equal(progress.read(`file-${hash(f.item.file)}.json`), null, 'failed metadata comparison cannot mint success');
    if (phase === 'temp') assert.equal(fs.existsSync(path.join(run.path, f.item.file)), false);
  }
});
test('new layout never upgrades a partial legacy Number destination ID', () => {
  const f = fixture(), legacy = { ...f.record }; delete legacy.result_layout;
  const oldId = io.activeDestination(legacy).id;
  assert.notEqual(oldId, f.record.destination_id);
  const record = { ...f.record, destination_id: oldId };
  assert.throws(() => io.initialProgress(record, f.destination));
});
test('large private Unicode CSV uses a separate budget and remains byte-bound, not overwritten', () => {
  const directory = ensurePrivateDirectory(process.env.EU_PRIVACY_DATA_ROOT, 'large-mapping-test');
  const record = { schema: exporter.SCHEMA, items: Array.from({ length: 200 }, (_, index) => ({
    source_label: `${'界'.repeat(1000)}-${index}.txt`, file: `${'例'.repeat(1000)}-${index}.md` })) };
  const bytes = io.visibleMappingBytes(record); assert.ok(bytes.length > 1024 * 1024);
  const batchId = 'f'.repeat(64); io.writePrivateResultMapping(directory, batchId, bytes);
  io.writePrivateResultMapping(directory, batchId, bytes);
  assert.deepEqual(fs.readFileSync(path.join(directory, `${batchId}-Zuordnung.csv`)), bytes);
  assert.throws(() => io.writePrivateResultMapping(directory, batchId, Buffer.from('foreign mapping')));
  assert.deepEqual(fs.readFileSync(path.join(directory, `${batchId}-Zuordnung.csv`)), bytes);
});
done();
