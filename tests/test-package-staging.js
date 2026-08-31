'use strict';

// Filesystem unit/negative tests with a separate, explicitly named temporary
// privacy root for every case. No real product files, keyring, parser or GUI.
// Synthetic trees are deliberately retained: no glob/recursive test cleanup.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('Owned package staging (synthetic local scopes only)');
const staging = require('../plugins/data-secure/server/gateway/package-staging');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const id = (character = 'a') => `ds_${character.repeat(32)}`;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function snapshot(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = [];
  function walk(current) {
    assert.ok(entries.length < 200, 'only the bounded synthetic fixture may be inspected');
    const stat = fs.lstatSync(current);
    const entry = { name: path.relative(directory, current), dev: stat.dev, ino: stat.ino };
    if (stat.isSymbolicLink()) { entries.push({ ...entry, kind: 'link', target: fs.readlinkSync(current) }); return; }
    if (stat.isFile()) { entries.push({ ...entry, kind: 'file', hash: hash(fs.readFileSync(current)) }); return; }
    assert.ok(stat.isDirectory());
    entries.push({ ...entry, kind: 'directory' });
    for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name));
  }
  walk(directory);
  return entries;
}

function scoped(operation) {
  const previousPrivacy = process.env.EU_PRIVACY_ROOT;
  const previousLocal = process.env.LOCALAPPDATA;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-package-stage-test-'));
  const privacy = path.join(base, 'privacy');
  process.env.EU_PRIVACY_ROOT = privacy;
  process.env.LOCALAPPDATA = path.join(base, 'localapp');
  try {
    const storage = roots();
    assert.strictEqual(storage.root, privacy);
    const stageRoot = path.join(privacy, '.datasecure-staging');
    const source = path.join(base, 'synthetic-original.txt');
    fs.writeFileSync(source, 'synthetic source must remain unchanged', { flag: 'wx' });
    const sourceBefore = fs.readFileSync(source);
    const sourceIdentity = fs.lstatSync(source);
    const scope = {
      base, privacy, storage, stageRoot, source,
      create(character = 'a', options) {
        const stage = staging.createStage(id(character), options);
        assert.ok(stage && typeof stage.path === 'string');
        const relative = path.relative(stageRoot, stage.path);
        assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        return stage;
      },
      payload(stage, text = 'synthetic protected draft') {
        const file = path.join(stage.path, 'synthetic-draft.md');
        fs.writeFileSync(file, text, { flag: 'wx' });
        return file;
      },
      destination(character = 'a') { return path.join(storage.output, id(character)); },
      recover(options = {}) { return staging.recoverAbandonedStages({ isProcessAlive: () => false, ...options }); }
    };
    operation(scope);
    assert.deepStrictEqual(fs.readFileSync(source), sourceBefore);
    const after = fs.lstatSync(source);
    assert.strictEqual(after.dev, sourceIdentity.dev); assert.strictEqual(after.ino, sourceIdentity.ino);
  } finally {
    if (previousPrivacy === undefined) delete process.env.EU_PRIVACY_ROOT;
    else process.env.EU_PRIVACY_ROOT = previousPrivacy;
    if (previousLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocal;
  }
}

function counts(result, expected, mode = 'recover') {
  const keys = mode === 'inspect' ? ['pending', 'failures', 'unbound'] : ['removed', 'active', 'failures', 'unbound'];
  assert.deepStrictEqual(Object.keys(result).sort(), keys.sort());
  for (const key of keys) assert.ok(Number.isSafeInteger(result[key]) && result[key] >= 0);
  for (const [key, value] of Object.entries(expected)) assert.strictEqual(result[key], value, key);
}

function bindingFiles(stageRoot, stage) {
  const files = snapshot(stageRoot).filter((entry) => entry.kind === 'file')
    .map((entry) => path.join(stageRoot, entry.name))
    .filter((file) => {
      const relative = path.relative(stage.path, file);
      return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    });
  const rootMarkers = files.filter((file) => path.dirname(file) === stageRoot);
  const records = files.filter((file) => path.dirname(file) !== stageRoot);
  assert.strictEqual(rootMarkers.length, 1, 'a fresh synthetic root has one root marker');
  assert.strictEqual(records.length, 1, 'one synthetic stage has exactly one external ownership record');
  for (const file of files) {
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  }
  return { marker: rootMarkers[0], record: records[0] };
}

test('empty inspection is readonly, has bounded counters and does not adopt a staging root', () => scoped(({ privacy, stageRoot }) => {
  const before = snapshot(privacy);
  counts(staging.inspectStaging(), { pending: 0, failures: 0, unbound: 0 }, 'inspect');
  assert.deepStrictEqual(snapshot(privacy), before);
  assert.strictEqual(fs.existsSync(stageRoot), false);
}));

test('create returns a frozen owned stage outside released Output and assert accepts it', () => scoped(({ create, payload, storage }) => {
  const stage = create(); payload(stage);
  assert.ok(Object.isFrozen(stage));
  assert.notStrictEqual(path.dirname(stage.path), storage.output);
  assert.ok(fs.lstatSync(stage.path).isDirectory());
  assert.doesNotThrow(() => staging.assertStage(stage));
  counts(staging.inspectStaging(), { pending: 1, failures: 0, unbound: 0 }, 'inspect');
}));

test('publishing commits the exact payload once and removes its ownership bookkeeping', () => scoped(({ create, payload, destination, recover }) => {
  const stage = create(); const draft = payload(stage);
  const expected = fs.readFileSync(draft);
  let calls = 0;
  staging.publishStage(stage, destination(), (from, to) => {
    calls++; assert.strictEqual(from, stage.path); assert.strictEqual(to, destination()); fs.renameSync(from, to);
  });
  assert.strictEqual(calls, 1);
  assert.strictEqual(fs.existsSync(stage.path), false);
  assert.deepStrictEqual(fs.readFileSync(path.join(destination(), path.basename(draft))), expected);
  counts(recover(), { removed: 0, failures: 0, unbound: 0 });
  counts(staging.inspectStaging(), { pending: 0, failures: 0, unbound: 0 }, 'inspect');
}));

test('discard removes only its owned payload and leaves other active stages intact', () => scoped(({ create, payload }) => {
  const one = create('a'); payload(one);
  const two = create('b'); const survivor = payload(two, 'must survive');
  staging.discardStage(one);
  assert.strictEqual(fs.existsSync(one.path), false);
  assert.strictEqual(fs.readFileSync(survivor, 'utf8'), 'must survive');
  assert.doesNotThrow(() => staging.assertStage(two));
}));

test('recovery removes only a provably dead synthetic owner and is idempotent', () => scoped(({ create, payload, recover }) => {
  const stage = create(); payload(stage);
  counts(recover(), { removed: 1, active: 0, failures: 0, unbound: 0 });
  assert.strictEqual(fs.existsSync(stage.path), false);
  counts(recover(), { removed: 0, active: 0, failures: 0, unbound: 0 });
}));

test('a living owner is retained even if stage filesystem timestamps are old', () => scoped(({ create, payload, recover }) => {
  const stage = create(); const draft = payload(stage);
  fs.utimesSync(stage.path, new Date(0), new Date(0));
  const before = fs.readFileSync(draft);
  counts(recover({ isProcessAlive: () => true }), { removed: 0, active: 1, failures: 0 });
  assert.deepStrictEqual(fs.readFileSync(draft), before);
}));

test('unknown children and legacy partial outputs are preserved, never adopted as owned work', () => scoped(({ create, stageRoot, storage, recover }) => {
  create();
  const unknown = path.join(stageRoot, 'unknown-user-file.txt');
  const legacy = path.join(storage.output, '.legacy-partial-output');
  fs.writeFileSync(unknown, 'unknown data', { flag: 'wx' });
  fs.mkdirSync(legacy); fs.writeFileSync(path.join(legacy, 'original.txt'), 'legacy data', { flag: 'wx' });
  const legacyBefore = snapshot(legacy);
  const result = recover();
  assert.ok(result.unbound >= 1 || result.failures >= 1);
  assert.strictEqual(fs.readFileSync(unknown, 'utf8'), 'unknown data');
  assert.deepStrictEqual(snapshot(legacy), legacyBefore);
}));

test('an existing unknown staging root is not silently adopted or recursively removed', () => scoped(({ stageRoot, create, recover }) => {
  fs.mkdirSync(stageRoot);
  const canary = path.join(stageRoot, 'user-owned.txt'); fs.writeFileSync(canary, 'never delete', { flag: 'wx' });
  const before = snapshot(stageRoot);
  assert.throws(() => create());
  const result = recover();
  assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.deepStrictEqual(snapshot(stageRoot), before);
}));

test('stage directory substitution invalidates the handle and preserves both old and replacement payloads', () => scoped(({ create, payload, base, recover }) => {
  const stage = create(); payload(stage, 'original stage');
  const saved = path.join(base, 'saved-stage'); fs.renameSync(stage.path, saved);
  fs.mkdirSync(stage.path); const replacement = path.join(stage.path, 'replacement.txt');
  fs.writeFileSync(replacement, 'replacement is not owned', { flag: 'wx' });
  assert.throws(() => staging.assertStage(stage));
  assert.throws(() => staging.discardStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.strictEqual(fs.readFileSync(replacement, 'utf8'), 'replacement is not owned');
  assert.strictEqual(fs.readFileSync(path.join(saved, 'synthetic-draft.md'), 'utf8'), 'original stage');
}));

test('hardlinked payloads are refused during discard/recovery and keep their external backing file', () => scoped(({ create, source, recover }) => {
  const stage = create(); const linked = path.join(stage.path, 'hardlink.txt'); fs.linkSync(source, linked);
  assert.throws(() => staging.discardStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1);
  assert.ok(fs.existsSync(linked)); assert.strictEqual(fs.lstatSync(source).nlink, 2);
}));

test('a linked child directory is never traversed by discard/recovery', () => scoped(({ create, source, base, recover }) => {
  const stage = create(); const outside = path.join(base, 'outside'); fs.mkdirSync(outside);
  const canary = path.join(outside, 'original.txt'); fs.copyFileSync(source, canary, fs.constants.COPYFILE_EXCL);
  const linked = path.join(stage.path, 'linked');
  fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => staging.discardStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1);
  assert.strictEqual(fs.readFileSync(canary, 'utf8'), 'synthetic source must remain unchanged');
  assert.ok(fs.lstatSync(linked).isSymbolicLink());
}));

test('foreign, forged and incomplete handles cannot authorize cleanup or publication', () => scoped(({ create, payload, destination }) => {
  const stage = create(); const draft = payload(stage);
  for (const handle of [null, {}, { path: stage.path }, { ...stage, path: path.dirname(stage.path) }]) {
    assert.throws(() => staging.assertStage(handle));
    assert.throws(() => staging.discardStage(handle));
    assert.throws(() => staging.publishStage(handle, destination()));
  }
  assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic protected draft');
}));

test('invalid package IDs fail before staging mutation', () => scoped(({ privacy }) => {
  const before = snapshot(privacy);
  for (const invalid of [undefined, null, '', '../outside', 'ds_', id() + '/child', 'x'.repeat(129), 'a'.repeat(15), 'a'.repeat(20) + '.tmp']) {
    assert.throws(() => staging.createStage(invalid));
  }
  assert.deepStrictEqual(snapshot(privacy), before);
}));

test('publication refuses an occupied destination without replacing existing output', () => scoped(({ create, payload, destination }) => {
  const stage = create(); payload(stage);
  fs.mkdirSync(destination()); const canary = path.join(destination(), 'already-released.md');
  fs.writeFileSync(canary, 'published content', { flag: 'wx' });
  assert.throws(() => staging.publishStage(stage, destination()));
  assert.strictEqual(fs.readFileSync(canary, 'utf8'), 'published content');
  assert.ok(fs.existsSync(stage.path));
}));

test('publication never accepts a destination outside this privacy root or under a different package ID', () => scoped(({ create, payload, base, destination }) => {
  const stage = create(); payload(stage);
  for (const final of [path.join(base, 'outside-package'), destination('b'), path.dirname(destination())]) {
    assert.throws(() => staging.publishStage(stage, final));
    assert.ok(fs.existsSync(stage.path));
  }
}));

test('failed publication retains recoverable owned staging, not a partially released result', () => scoped(({ create, payload, destination, recover }) => {
  const stage = create(); payload(stage);
  assert.throws(() => staging.publishStage(stage, destination(), () => { throw new Error('synthetic rename failure'); }));
  assert.ok(fs.existsSync(stage.path)); assert.strictEqual(fs.existsSync(destination()), false);
  counts(recover(), { removed: 1, failures: 0, unbound: 0 });
}));

test('missing staging after an already committed rename cleans bookkeeping only and preserves output', () => scoped(({ create, payload, destination, recover }) => {
  const stage = create(); payload(stage, 'already committed');
  fs.renameSync(stage.path, destination()); // synthetic crash between commit and record cleanup
  const outputBefore = snapshot(destination());
  const result = recover(); assert.strictEqual(result.failures, 0); assert.strictEqual(result.unbound, 0);
  assert.deepStrictEqual(snapshot(destination()), outputBefore);
  counts(staging.inspectStaging(), { pending: 0, failures: 0, unbound: 0 }, 'inspect');
}));

test('inspection does not mutate live staging payloads, marker files or ownership records', () => scoped(({ create, payload, stageRoot }) => {
  payload(create());
  const before = snapshot(stageRoot);
  counts(staging.inspectStaging(), { pending: 1, failures: 0, unbound: 0 }, 'inspect');
  assert.deepStrictEqual(snapshot(stageRoot), before);
}));

test('missing ownership record leaves its unbound payload untouched instead of guessing ownership', () => scoped(({ create, payload, stageRoot, recover }) => {
  const stage = create(); const draft = payload(stage);
  const { record } = bindingFiles(stageRoot, stage);
  fs.unlinkSync(record); // This exact generated, regular fixture record only.
  assert.throws(() => staging.assertStage(stage));
  assert.throws(() => staging.discardStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.unbound >= 1 || result.failures >= 1);
  assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic protected draft');
}));

test('missing root binding never causes initialization over an existing private staging tree', () => scoped(({ create, payload, stageRoot, recover }) => {
  const stage = create(); const draft = payload(stage);
  const { marker } = bindingFiles(stageRoot, stage);
  fs.unlinkSync(marker); // Only the known marker in this synthetic root.
  const before = snapshot(stageRoot);
  assert.throws(() => staging.assertStage(stage));
  assert.throws(() => create('b'));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.deepStrictEqual(snapshot(stageRoot), before);
  assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic protected draft');
}));

test('corrupted ownership metadata fails closed without deleting its payload', () => scoped(({ create, payload, stageRoot, recover }) => {
  const stage = create(); const draft = payload(stage);
  const { record } = bindingFiles(stageRoot, stage);
  fs.writeFileSync(record, '{"synthetic":"incomplete metadata"', { flag: 'w' });
  assert.throws(() => staging.assertStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic protected draft');
}));

test('a hardlinked ownership record cannot authorize removing its stage', () => scoped(({ create, payload, stageRoot, base, recover }) => {
  const stage = create(); const draft = payload(stage);
  const { record } = bindingFiles(stageRoot, stage);
  const linked = path.join(base, 'ownership-record-backup.json'); fs.linkSync(record, linked);
  assert.throws(() => staging.assertStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic protected draft');
  assert.strictEqual(fs.lstatSync(linked).nlink, 2);
}));

test('replacing the staging root by a directory with copied metadata does not rebind old ownership', () => scoped(({ create, payload, stageRoot, base, recover }) => {
  const stage = create(); payload(stage);
  const saved = path.join(base, 'original-staging-root');
  const inventory = snapshot(stageRoot);
  assert.ok(inventory.every((entry) => entry.kind === 'file' || entry.kind === 'directory'));
  fs.renameSync(stageRoot, saved);
  // Recreate only the bounded, inspected synthetic inventory; never traverse
  // a symbolic link or copy a user-selected tree.
  for (const entry of inventory) {
    const source = path.join(saved, entry.name);
    const target = path.join(stageRoot, entry.name);
    const relative = path.relative(stageRoot, target);
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    if (entry.kind === 'directory') fs.mkdirSync(target, { mode: 0o700 });
    else fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
  const before = snapshot(stageRoot);
  assert.throws(() => staging.assertStage(stage));
  const result = recover(); assert.strictEqual(result.removed, 0); assert.ok(result.failures >= 1 || result.unbound >= 1);
  assert.deepStrictEqual(snapshot(stageRoot), before);
  assert.strictEqual(snapshot(saved).filter((entry) => entry.kind === 'file').length,
    inventory.filter((entry) => entry.kind === 'file').length);
}));

test('explicit malformed job/owner bindings are rejected before staging mutation', () => scoped(({ privacy }) => {
  const before = snapshot(privacy);
  for (const options of [{ jobId: '../outside', ownerNonce: 'a'.repeat(32) },
    { jobId: 'synthetic_12345678', ownerNonce: '../secret' },
    { jobId: 'synthetic_12345678', ownerNonce: '' }]) {
    assert.throws(() => staging.createStage(id(), options));
  }
  assert.deepStrictEqual(snapshot(privacy), before);
}));

done();
