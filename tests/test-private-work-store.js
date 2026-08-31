'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { test, done, assert } = createSuite('Plain private work store (no secrets)');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-plain-store-'));
let sequence = 0;
function target() { return path.join(root, `${++sequence}.snapshot`); }
function store(options = {}) { return createPrivateWorkStore({ privateRoot: root, ...options }); }

test('ready without keyring or secret store', () => {
  assert.deepStrictEqual(createPrivateWorkStore({ privateRoot: root, get secretStore() { throw new Error('secret access'); } }).ensureReady(),
    { available: true, backend: 'local_plain_files', encrypted: false });
});
test('snapshot is exact plain bytes and caller buffer unchanged', () => {
  const file = target(); const bytes = Buffer.from('Lokales Profil: Testperson');
  store().writeFile(file, bytes);
  assert.deepStrictEqual(fs.readFileSync(file), bytes);
  assert.deepStrictEqual(store().readFile(file), bytes);
});
test('empty snapshot roundtrip', () => {
  const file = target(); store().writeFile(file, Buffer.alloc(0));
  assert.strictEqual(store().readFile(file).length, 0);
});
test('never overwrite existing file', () => {
  const file = target(); fs.writeFileSync(file, 'original');
  assert.throws(() => store().writeFile(file, Buffer.from('replace')), { code: 'PRIVATE_ARTIFACT_ALREADY_EXISTS' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'original');
});
test('outside-root write refused', () => {
  assert.throws(() => store().writeFile(path.join(root, '..', 'outside'), Buffer.from('x')), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
});
test('write limit before file creation', () => {
  const file = target(); assert.throws(() => store({ maxBytes: 1 }).writeFile(file, Buffer.from('xx')));
  assert.strictEqual(fs.existsSync(file), false);
});
test('read limit', () => {
  const file = target(); fs.writeFileSync(file, 'xx'); assert.throws(() => store({ maxBytes: 1 }).readFile(file));
});
test('legacy encrypted extension remains untouched', () => {
  const file = target() + '.dsart'; fs.writeFileSync(file, 'old');
  assert.throws(() => store().readFile(file), { code: 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'old');
});
test('renamed legacy envelope remains untouched', () => {
  const file = target(); fs.writeFileSync(file, 'DSARTF01oldcipher');
  assert.throws(() => store().readFile(file), { code: 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'DSARTF01oldcipher');
});
test('short writes complete fully', () => {
  const file = target(); const io = Object.create(fs);
  io.writeSync = (fd, data, off, len, pos) => fs.writeSync(fd, data, off, Math.min(2, len), pos);
  store({ fs: io }).writeFile(file, Buffer.from('abcdefgh'));
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'abcdefgh');
});
test('partial-write failure leaves no published file', () => {
  const file = target(); const io = Object.create(fs); io.writeSync = () => 0;
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('x')));
  assert.strictEqual(fs.existsSync(file), false);
  assert.strictEqual(fs.readdirSync(root).some((name) => name.endsWith('.tmp')), false);
});
test('short reads complete fully', () => {
  const file = target(); fs.writeFileSync(file, 'abcdefgh'); const io = Object.create(fs);
  io.readSync = (fd, data, off, len, pos) => fs.readSync(fd, data, off, Math.min(2, len), pos);
  assert.strictEqual(store({ fs: io }).readFile(file).toString(), 'abcdefgh');
});
test('premature EOF refuses a partial snapshot', () => {
  const file = target(); fs.writeFileSync(file, 'x'); const io = Object.create(fs); io.readSync = () => 0;
  assert.throws(() => store({ fs: io }).readFile(file), { code: 'PRIVATE_ARTIFACT_READ_FAILED' });
});
test('hard-linked read refused', () => {
  const file = target(); fs.writeFileSync(file, 'original'); const link = target(); fs.linkSync(file, link);
  assert.throws(() => store().readFile(link), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
});

test('close failure prevents publication', () => {
  const file = target(); const io = Object.create(fs);
  io.closeSync = (fd) => { fs.closeSync(fd); throw new Error('close failed'); };
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('x')), /close failed/);
  assert.strictEqual(fs.existsSync(file), false);
});
test('read close failure never returns bytes', () => {
  const file = target(); fs.writeFileSync(file, 'x'); const io = Object.create(fs);
  io.closeSync = (fd) => { fs.closeSync(fd); throw new Error('close failed'); };
  assert.throws(() => store({ fs: io }).readFile(file), /close failed/);
});
test('publication race cannot replace an existing destination', () => {
  const file = target(); const io = Object.create(fs);
  io.linkSync = (from, to) => { fs.writeFileSync(to, 'other'); fs.linkSync(from, to); };
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('x')), { code: 'PRIVATE_ARTIFACT_ALREADY_EXISTS' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'other');
});
test('post-publication directory sync failure preserves the published bytes', () => {
  const file = target(); const io = Object.create(fs); let calls = 0;
  io.fsyncSync = (fd) => { if (++calls === 2) throw new Error('sync failed'); fs.fsyncSync(fd); };
  // Emulate a directory descriptor portably; the second fsync is still invoked.
  io.openSync = (filePath, ...args) => fs.openSync(filePath === root ? file : filePath, ...args);
  assert.throws(() => store({ fs: io, platform: 'linux' }).writeFile(file, Buffer.from('x')), { code: 'PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'x');
});

// Only this freshly-created test directory is owned by this suite.
fs.rmSync(root, { recursive: true, force: true });
done();
