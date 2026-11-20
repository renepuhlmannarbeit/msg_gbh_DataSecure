'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { test, done, assert } = createSuite('Plain private work store (no secrets)');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-plain-store-')));
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
test('distinct 64-bit file IDs never compare equal after Number rounding', () => {
  const file = target(); fs.writeFileSync(file, 'safe'); const io = Object.create(fs);
  const first = 9007199254740992n, second = first + 1n; let reads = 0;
  io.lstatSync = (candidate, options) => {
    const stat = fs.lstatSync(candidate, options);
    if (candidate === file) stat.ino = options?.bigint ? first : Number(first);
    return stat;
  };
  io.fstatSync = (fd, options) => {
    const stat = fs.fstatSync(fd, options); stat.ino = options?.bigint ? second : Number(second); return stat;
  };
  io.readSync = (...args) => { reads++; return fs.readSync(...args); };
  assert.throws(() => store({ fs: io }).readFile(file), { code: 'PRIVATE_ARTIFACT_READ_FAILED' });
  assert.equal(reads, 0);
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
  assert.throws(() => store({ fs: io }).readFile(file), { code: 'PRIVATE_ARTIFACT_READ_FAILED' });
});
test('pre-open content changes and during-read hardlinks are refused', () => {
  for (const stage of ['before-open', 'during-read']) {
    const file = target(); fs.writeFileSync(file, 'safe'); const io = Object.create(fs);
    if (stage === 'before-open') io.openSync = (...args) => {
      fs.writeFileSync(file, 'evil'); const stat = fs.statSync(file);
      fs.utimesSync(file, stat.atime, new Date(Date.now() + 10000));
      return fs.openSync(...args);
    };
    else io.readSync = (...args) => { fs.linkSync(file, target()); return fs.readSync(...args); };
    assert.throws(() => store({ fs: io }).readFile(file), error => /^PRIVATE_ARTIFACT_/u.test(error.code));
  }
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

test('a replaced regular parent is refused before any private byte is written', () => {
  const fixture = path.join(root, `parent-${++sequence}`); fs.mkdirSync(fixture);
  const parent = path.join(fixture, 'work'); fs.mkdirSync(parent);
  const parked = path.join(fixture, 'retained');
  const file = path.join(parent, 'private.snapshot');
  const io = Object.create(fs); let written = 0, temporary;
  io.openSync = (name, ...args) => {
    if (name.endsWith('.tmp')) {
      fs.renameSync(parent, parked); fs.mkdirSync(parent); temporary = name;
    }
    return fs.openSync(name, ...args);
  };
  io.writeSync = (...args) => { written++; return fs.writeSync(...args); };
  const subject = createPrivateWorkStore({ privateRoot: fixture, fs: io });
  assert.throws(() => subject.writeFile(file, Buffer.from('private synthetic text')), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
  assert.equal(written, 0); assert.equal(fs.existsSync(file), false);
  // An uncertain parent is not cleanup authority, even for an empty leaf.
  assert.equal(fs.statSync(temporary).size, 0);
  assert.equal(fs.readdirSync(parked).length, 0);
});
test('a descendant redirect before temporary open receives no private bytes', () => {
  const fixture = path.join(root, `redirect-${++sequence}`); fs.mkdirSync(fixture);
  const privateRoot = path.join(fixture, 'private'); fs.mkdirSync(privateRoot);
  const parent = path.join(privateRoot, 'work'); fs.mkdirSync(parent);
  const parked = path.join(privateRoot, 'retained');
  const sibling = path.join(fixture, 'own-sibling'); fs.mkdirSync(sibling);
  const marker = path.join(sibling, 'marker.txt'); fs.writeFileSync(marker, 'unchanged');
  const file = path.join(parent, 'private.snapshot');
  const io = Object.create(fs); let written = 0, temporary;
  io.openSync = (name, ...args) => {
    if (name.endsWith('.tmp')) {
      fs.renameSync(parent, parked);
      fs.symlinkSync(sibling, parent, process.platform === 'win32' ? 'junction' : 'dir');
      temporary = path.join(sibling, path.basename(name));
    }
    return fs.openSync(name, ...args);
  };
  io.writeSync = (...args) => { written++; return fs.writeSync(...args); };
  const subject = createPrivateWorkStore({ privateRoot, fs: io });
  assert.throws(() => subject.writeFile(file, Buffer.from('private synthetic text')), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
  assert.equal(written, 0); assert.equal(fs.existsSync(file), false);
  assert.equal(fs.statSync(temporary).size, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'unchanged');
  fs.unlinkSync(parent);
});
test('an extra link created while opening the temporary refuses its first write', () => {
  const file = target(); const io = Object.create(fs); let written = 0, temporary;
  const link = target();
  io.openSync = (name, ...args) => {
    const fd = fs.openSync(name, ...args);
    if (name.endsWith('.tmp')) { temporary = name; fs.linkSync(name, link); }
    return fd;
  };
  io.writeSync = (...args) => { written++; return fs.writeSync(...args); };
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('synthetic')), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
  assert.equal(written, 0); assert.equal(fs.existsSync(file), false);
  assert.equal(fs.statSync(link).size, 0); assert.equal(fs.existsSync(temporary), true);
});
test('growth or truncation before publication refuses the complete snapshot', () => {
  for (const length of [0, 8]) {
    const file = target(); const io = Object.create(fs); let temporary;
    io.openSync = (name, ...args) => { const fd = fs.openSync(name, ...args); if (name.endsWith('.tmp')) temporary = name; return fd; };
    io.fsyncSync = fd => { fs.fsyncSync(fd); fs.ftruncateSync(fd, length); };
    assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('four')), { code: 'PRIVATE_ARTIFACT_PATH_INVALID' });
    assert.equal(fs.existsSync(file), false); assert.equal(fs.existsSync(temporary), false);
  }
});
test('temporary replacement during publication preserves the foreign object', () => {
  const file = target(); const io = Object.create(fs); const retained = target(); let temporary;
  io.linkSync = (from, to) => {
    temporary = from; fs.renameSync(from, retained); fs.writeFileSync(from, 'foreign'); fs.linkSync(from, to);
  };
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('private')), { code: 'PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN' });
  assert.equal(fs.readFileSync(retained, 'utf8'), 'private');
  assert.equal(fs.readFileSync(temporary, 'utf8'), 'foreign');
  assert.equal(fs.readFileSync(file, 'utf8'), 'foreign');
});
test('lost link acknowledgement preserves the committed target and original failure', () => {
  const file = target(); const io = Object.create(fs); let temporary;
  const original = Object.assign(new Error('lost acknowledgement'), { code: 'EIO' });
  io.linkSync = (from, to) => { temporary = from; fs.linkSync(from, to); throw original; };
  const subject = store({ fs: io });
  assert.throws(() => subject.writeFile(file, Buffer.from('committed')), error => error === original);
  assert.equal(fs.existsSync(temporary), false);
  assert.equal(fs.statSync(file).nlink, 1);
  assert.equal(subject.readFile(file).toString(), 'committed');
});
test('an unowned second link is never mistaken for a committed target', () => {
  const file = target(); const io = Object.create(fs); const other = target(); let temporary;
  const original = Object.assign(new Error('not committed'), { code: 'EIO' });
  io.linkSync = from => { temporary = from; fs.linkSync(from, other); throw original; };
  assert.throws(() => store({ fs: io }).writeFile(file, Buffer.from('uncommitted')), error => error === original);
  assert.equal(fs.existsSync(file), false); assert.equal(fs.existsSync(temporary), true);
  assert.equal(fs.statSync(other).nlink, 2);
  assert.equal(fs.readFileSync(other, 'utf8'), 'uncommitted');
});

// Only this freshly-created test directory is owned by this suite.
fs.rmSync(root, { recursive: true, force: true });
done();
