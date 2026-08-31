'use strict';

// Synthetic files only. VM supplies the SEA bit and target process; no SEA,
// parser, launcher or server is executed, and production has no test seam.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('SEA parser-role integrity boundary');
const moduleText = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/sea-parser-role.js'), 'utf8');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const targets = [
  ['windows-x64', 'win32', 'x64'], ['macos-x64', 'darwin', 'x64'],
  ['macos-arm64', 'darwin', 'arm64'], ['linux-x64', 'linux', 'x64']
];

function fixture(fn, target = targets[0]) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-role-test-'));
  const server = path.join(temporary, 'server');
  const executable = path.join(server, 'runtime', target[0],
    target[1] === 'win32' ? 'datasecure-parser.exe' : 'datasecure-parser');
  const source = path.join(server, 'parser-worker.js');
  const dependency = path.join(server, 'privacy', 'source.cjs');
  const binary = Buffer.alloc(512);
  if (target[1] === 'win32') {
    binary.writeUInt16LE(0x5a4d, 0);
    binary.writeUInt32LE(0x80, 0x3c);
    binary.write('PE\0\0', 0x80, 'binary');
    binary.writeUInt16LE(0x8664, 0x84);
  } else if (target[1] === 'linux') {
    binary.write('\x7fELF', 0, 'binary');
    binary[4] = 2;
    binary[5] = 1;
    binary.writeUInt16LE(62, 18);
  } else {
    binary.writeUInt32LE(0xfeedfacf, 0);
    binary.writeUInt32LE(target[2] === 'x64' ? 0x01000007 : 0x0100000c, 4);
  }
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(path.dirname(dependency));
  fs.writeFileSync(executable, binary);
  fs.writeFileSync(source, 'module.exports = 123;');
  fs.writeFileSync(dependency, 'module.exports = 456;');
  const role = {
    schema: 'datasecure-sea-parser-role/v1', target: target[0], node_version: '22.23.2',
    bytes: binary.length, sha256: digest(binary), server_files: [
      { path: 'parser-worker.js', sha256: digest(fs.readFileSync(source)) },
      { path: 'privacy/source.cjs', sha256: digest(fs.readFileSync(dependency)) }
    ]
  };
  try { return fn({ temporary, server, executable, source, dependency, binary, role, target }); }
  finally {
    // Only this mkdtemp-owned tree is removed. Refuse links rather than following
    // them if a failed test unexpectedly leaves an unsafe cleanup target behind.
    assert.ok(path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('datasecure-role-test-'));
    function remove(directory) {
      const stat = fs.lstatSync(directory);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
      for (const name of fs.readdirSync(directory)) {
        const child = path.join(directory, name);
        const childStat = fs.lstatSync(child);
        assert.ok(!childStat.isSymbolicLink(), 'Unsafe test cleanup target');
        if (childStat.isDirectory()) remove(child);
        else { assert.ok(childStat.isFile()); fs.unlinkSync(child); }
      }
      fs.rmdirSync(directory);
    }
    remove(temporary);
  }
}

function load(f, options = {}) {
  const state = { reads: 0, opens: 0, closes: 0, bytesRead: 0, files: new Map() };
  const io = Object.create(fs);
  io.readSync = (...args) => {
    state.reads++;
    const count = fs.readSync(...args);
    state.bytesRead += count;
    if (options.afterRead) options.afterRead(args, state);
    return count;
  };
  io.openSync = (...args) => {
    state.opens++;
    const fd = fs.openSync(...args);
    state.files.set(fd, args[0]);
    return fd;
  };
  io.closeSync = (...args) => { state.closes++; state.files.delete(args[0]); return fs.closeSync(...args); };
  if (options.io) Object.assign(io, options.io);
  const context = vm.createContext({
    module: { exports: {} }, Buffer, __dirname: f.server,
    process: { platform: f.target[1], arch: f.target[2], versions: { node: '22.23.2' },
      env: { DATASECURE_SEA: '1', DATASECURE_PARSER_PATH: 'spoofed-parser', NODE_OPTIONS: '--require=evil' },
      ...(options.process || {}) },
    require(name) {
      if (name === 'node:fs') return io;
      if (name === 'node:sea') return { isSea: () => options.sea === undefined ? true : options.sea };
      assert.ok(['node:path', 'node:crypto', 'node:util'].includes(name));
      return require(name);
    }
  });
  if (!options.missing) vm.runInContext(`
    const role = ${JSON.stringify(options.role || f.role)};
    ${options.mutate || ''}
    function freeze(value) {
      if (!value || typeof value !== 'object') return value;
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (Object.hasOwn(descriptor, 'value')) freeze(descriptor.value);
      }
      return Object.freeze(value);
    }
    ${options.noFreeze ? '' : 'freeze(role);'}
    Object.defineProperty(globalThis, '__DATASECURE_PARSER_ROLE__',
      ${options.descriptor || '{ value: role, writable: false, configurable: false }'});
  `, context);
  vm.runInContext(moduleText, context, { timeout: 1000 });
  return { resolve: context.module.exports.resolveSeaParserRole, state };
}

function rejects(resolve) {
  assert.throws(resolve, error => error.code === 'SEA_PARSER_ROLE_INVALID' &&
    error.message === 'SEA_PARSER_ROLE_INVALID' && error.cause === undefined);
}

test('ordinary Node ignores environment and even absent or mutable role metadata', () => fixture(f => {
  for (const options of [{ missing: true }, { noFreeze: true }, { role: { spoof: true } }]) {
    const loaded = load(f, { ...options, sea: false });
    assert.strictEqual(loaded.resolve(), null);
    assert.strictEqual(loaded.state.reads, 0);
  }
}));

for (const target of targets) test(`valid ${target[0]} role selects only the fixed server-relative binary`, () => fixture(f => {
  const result = load(f).resolve();
  assert.deepStrictEqual({ ...result }, { executable: f.executable, target: target[0] });
  assert.ok(Object.isFrozen(result));
}, target));

for (const target of targets) test(`${target[0]} rejects wrong binary format or CPU despite a matching hash`, () => fixture(f => {
  const wrongMagic = Buffer.from(f.binary);
  wrongMagic[0] ^= 1;
  const wrongCpu = Buffer.from(f.binary);
  wrongCpu[target[1] === 'win32' ? 0x84 : target[1] === 'linux' ? 18 : 4] ^= 1;
  const cases = [wrongMagic, wrongCpu, Buffer.alloc(32)];
  if (target[1] === 'win32') {
    const invalidPeOffset = Buffer.from(f.binary);
    invalidPeOffset.writeUInt32LE(0xffffffff, 0x3c);
    cases.push(invalidPeOffset);
  }
  for (const binary of cases) {
    fs.writeFileSync(f.executable, binary);
    const role = { ...f.role, bytes: binary.length, sha256: digest(binary) };
    rejects(load(f, { role }).resolve);
  }
}, target));

test('missing, mutable, configurable, accessor and extra metadata fail closed', () => fixture(f => {
  const cases = [
    { missing: true }, { noFreeze: true },
    { noFreeze: true, mutate: 'Object.freeze(role);' },
    { noFreeze: true, mutate: 'Object.freeze(role.server_files); Object.freeze(role);' },
    { descriptor: '{ value: role, writable: true, configurable: false }' },
    { descriptor: '{ value: role, writable: false, configurable: true }' },
    { descriptor: '{ get() { throw new Error("accessor must not run"); }, configurable: false }' },
    { mutate: 'role.extra = true;' },
    { mutate: 'role[Symbol("extra")] = true;' },
    { mutate: 'role.server_files[0].extra = true;' },
    { mutate: 'role.server_files.extra = true;' },
    { mutate: 'Object.defineProperty(role, "bytes", { get() { throw new Error("accessor must not run"); } });' },
    { mutate: 'Object.defineProperty(role.server_files, "0", { get() { throw new Error("accessor must not run"); } });' },
    { mutate: 'Object.setPrototypeOf(role, { extra: true });' },
    { mutate: 'role.server_files[0] = new Proxy(role.server_files[0], {});' }
  ];
  for (const options of cases) {
    const loaded = load(f, options);
    rejects(loaded.resolve);
    assert.strictEqual(loaded.state.reads, 0);
  }
}));

test('role and real process target/version must all agree', () => fixture(f => {
  for (const options of [
    { role: { ...f.role, target: 'linux-x64' } },
    { role: { ...f.role, node_version: '22.23.1' } },
    { process: { versions: { node: '22.23.1' } } },
    { process: { platform: 'win32', arch: 'arm64' } }, { sea: undefined, mutate: 'role.schema = "wrong";' },
    { sea: null }
  ]) rejects(load(f, options).resolve);
}));

test('binary metadata bounds, missing files and incorrect hashes fail closed', () => fixture(f => {
  for (const bytes of [0, -1, 1.5, 128 * 1024 * 1024 + 1, f.binary.length + 1])
    rejects(load(f, { role: { ...f.role, bytes } }).resolve);
  for (const sha256 of ['0'.repeat(64), 'A'.repeat(64), 'f'.repeat(63), null])
    rejects(load(f, { role: { ...f.role, sha256 } }).resolve);
  fs.unlinkSync(f.executable);
  rejects(load(f).resolve);
}));

test('source records cannot escape server, choose runtime/vendor code, or use aliases', () => fixture(f => {
  for (const relative of ['../secret.js', 'privacy/../parser-worker.js', '/parser-worker.js',
    'C:/parser-worker.js', 'privacy\\source.cjs', 'privacy//source.cjs', 'privacy/./source.cjs',
    'runtime/source.js', 'RUNTIME/source.js', 'ocr-runtime/source.js', 'vendor/source.js',
    'privacy/node_modules/source.js', 'source.txt', 'con.js', 'privacy./source.js', 'source.js:stream']) {
    const role = { ...f.role, server_files: [{ ...f.role.server_files[0], path: relative }] };
    rejects(load(f, { role }).resolve);
  }
  for (const sources of [[], [f.role.server_files[0], f.role.server_files[0]],
    [{ ...f.role.server_files[0], sha256: '0'.repeat(64) }]])
    rejects(load(f, { role: { ...f.role, server_files: sources } }).resolve);
}));

test('unchanged files use the all-file hash cache without reopening files', () => fixture(f => {
  const loaded = load(f);
  loaded.resolve();
  const reads = loaded.state.reads;
  const opens = loaded.state.opens;
  loaded.resolve();
  loaded.resolve();
  assert.strictEqual(loaded.state.reads, reads);
  assert.strictEqual(loaded.state.opens, opens);
  assert.strictEqual(opens, f.role.server_files.length + 1);
  assert.strictEqual(loaded.state.opens, loaded.state.closes);
}));

for (const kind of ['executable', 'source', 'dependency']) test(`same-length ${kind} mutation invalidates cached integrity`, () => fixture(f => {
  const loaded = load(f);
  loaded.resolve();
  const baseline = loaded.state.reads;
  const filename = f[kind];
  const original = fs.readFileSync(filename);
  const before = fs.statSync(filename);
  const changed = Buffer.from(original);
  changed[0] ^= 1;
  fs.writeFileSync(filename, changed);
  fs.utimesSync(filename, before.atime, before.mtime);
  rejects(loaded.resolve);
  assert.ok(loaded.state.reads > baseline, 'Changed identity must force hashing again');
  assert.strictEqual(loaded.state.opens, loaded.state.closes);
}));

test('changed contents fail on the first verification as well as after cache warmup', () => fixture(f => {
  fs.writeFileSync(f.source, 'module.exports = 999;');
  rejects(load(f).resolve);
}));

test('hard-linked binary and sources are rejected including after a cache hit', () => fixture(f => {
  for (const filename of [f.executable, f.source]) {
    const loaded = load(f);
    loaded.resolve();
    const link = path.join(f.temporary, 'hardlink');
    fs.linkSync(filename, link);
    try { rejects(loaded.resolve); rejects(load(f).resolve); }
    finally { fs.unlinkSync(link); }
  }
}));

test('symbolic files and linked parents fail on initial and cached checks', () => fixture(f => {
  for (const unsafe of [f.executable, f.source, f.server, path.dirname(f.executable), path.dirname(f.dependency)]) {
    let linked = false;
    const loaded = load(f, { io: { lstatSync(filename, options) {
      const stat = fs.lstatSync(filename, options);
      if (linked && filename === unsafe) stat.isSymbolicLink = () => true;
      return stat;
    } } });
    loaded.resolve();
    const baseline = loaded.state.reads;
    linked = true;
    rejects(loaded.resolve);
    assert.strictEqual(loaded.state.reads, baseline, 'Reject links without trusting cached hashes');
  }
}));

test('a different held file identity cannot pass pre-read validation', () => fixture(f => {
  const loaded = load(f, { io: { fstatSync(fd, options) {
    const stat = fs.fstatSync(fd, options);
    stat.ino += 1n;
    return stat;
  } } });
  rejects(loaded.resolve);
  assert.strictEqual(loaded.state.reads, 0);
  assert.strictEqual(loaded.state.opens, loaded.state.closes);
}));

test('parent identity replacement invalidates cache even without a symbolic link', () => fixture(f => {
  let replaced = false;
  const loaded = load(f, { io: { lstatSync(filename, options) {
    const stat = fs.lstatSync(filename, options);
    if (replaced && filename === f.server) stat.ino += 1n;
    return stat;
  } } });
  loaded.resolve();
  const baseline = loaded.state.reads;
  replaced = true;
  // A stable replacement parent causes a full re-verification; it must not be
  // accepted as a cache hit merely because individual file identities match.
  loaded.resolve();
  assert.ok(loaded.state.reads > baseline);
}));

test('growth during reading is rejected and read length remains bounded', () => fixture(f => {
  const loaded = load(f, { afterRead(args, state) {
    if (state.reads === 1) fs.appendFileSync(f.executable, 'unexpected growth');
  } });
  rejects(loaded.resolve);
  assert.ok(loaded.state.bytesRead <= f.binary.length + 24);
  assert.strictEqual(loaded.state.opens, loaded.state.closes);
}));

test('final all-file identity check catches earlier source mutation while hashing a later one', () => fixture(f => {
  const loaded = load(f, { afterRead(args, state) {
    if (state.files.get(args[0]) === f.dependency) fs.appendFileSync(f.source, 'changed');
  } });
  rejects(loaded.resolve);
  assert.strictEqual(loaded.state.opens, loaded.state.closes);
}));

test('I/O errors expose only a fixed code, never paths or native error details', () => fixture(f => {
  rejects(load(f, { io: { lstatSync() { throw new Error(`private path: ${f.source}`); } } }).resolve);
}));

done();
