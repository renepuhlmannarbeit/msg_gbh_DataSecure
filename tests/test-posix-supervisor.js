'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');
const { createSuite } = require('./helpers');
const { CONTRACT, DARWIN_CONTRACT, MAX_SUPERVISOR_BYTES, MAX_CHECKSUM_BYTES,
  verifyPosixSupervisor, clearPosixSupervisorCache } = require('../plugins/data-secure/server/posix-supervisor');
const { test, done, assert } = createSuite('POSIX supervisor contract');
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'data-secure-posix-supervisor-'));

function elf() { const bytes = Buffer.alloc(128); bytes.write('\x7fELF', 0, 'binary'); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18); return bytes; }
function artifact(name = 'datasecure-sandbox') {
  const file = path.join(root, name); const bytes = elf();
  fs.writeFileSync(file, bytes, { mode: 0o700 });
  fs.writeFileSync(`${file}.sha256`, `${crypto.createHash('sha256').update(bytes).digest('hex')}\n`);
  return file;
}
function withIo(overrides, run) {
  const original = Object.fromEntries(Object.keys(overrides).map(key => [key, fs[key]]));
  try {
    for (const [key, replacement] of Object.entries(overrides)) fs[key] = (...args) => replacement(original[key], ...args);
    return run();
  } finally { Object.assign(fs, original); }
}
function verify(file, spawnSync = () => ({ status: 0, stdout: CONTRACT })) {
  return verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file, spawnSync });
}

test('verified Linux supervisor accepts only the fixed contract with empty environment', () => {
  clearPosixSupervisorCache(); const file = artifact('ok'); let invocation;
  const result = verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file, spawnSync(command, args, options) { invocation = { command, args, options }; return { status: 0, stdout: CONTRACT }; } });
  assert.deepStrictEqual(result, { available: true, reason: 'ok', executable: file });
  assert.strictEqual(invocation.command, file); assert.deepStrictEqual(invocation.args, ['--sandbox-contract']);
  assert.deepStrictEqual(invocation.options.env, {}); assert.strictEqual(invocation.options.shell, false);
  assert.equal(invocation.options.timeout, 5000); assert.equal(invocation.options.maxBuffer, 4096);
  assert.equal(invocation.options.killSignal, 'SIGKILL');
});

test('tampered binary or incorrect contract fails closed', () => {
  clearPosixSupervisorCache(); const file = artifact('tampered'); fs.appendFileSync(file, 'x');
  assert.deepStrictEqual(verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file }), { available: false, reason: 'integrity_failed' });
  clearPosixSupervisorCache(); const contract = artifact('contract');
  assert.deepStrictEqual(verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: contract, spawnSync: () => ({ status: 0, stdout: '{}' }) }), { available: false, reason: 'contract_failed' });
});

test('macOS verifies its truthful RSS-based resource contract', () => {
  clearPosixSupervisorCache();
  const file = path.join(root, 'darwin');
  const bytes = Buffer.alloc(128);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeInt32LE(0x0100000c, 4);
  fs.writeFileSync(file, bytes, { mode: 0o700 });
  fs.writeFileSync(`${file}.sha256`, `${crypto.createHash('sha256').update(bytes).digest('hex')}\n`);
  assert.deepStrictEqual(verifyPosixSupervisor({
    platform: 'darwin', arch: 'arm64', executable: file,
    spawnSync: () => ({ status: 0, stdout: DARWIN_CONTRACT })
  }), { available: true, reason: 'ok', executable: file });
});

test('typed probe errors distinguish a missing loader from a vanished verified executable', () => {
  for (const [code, reason] of [['ENOENT', 'dependency_missing'], ['EACCES', 'executable_denied'], ['ENOEXEC', 'executable_format']]) {
    clearPosixSupervisorCache(); const file = artifact(`probe-${code}`);
    assert.equal(verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file,
      spawnSync: () => ({ error: Object.assign(new Error('PRIVATE DETAILS'), { code }) }) }).reason, reason);
  }
  clearPosixSupervisorCache(); const file = artifact('probe-vanished');
  assert.equal(verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file,
    spawnSync: () => { fs.unlinkSync(file); return { error: { code: 'ENOENT' } }; } }).reason, 'executable_missing');
});

test('unchanged artifacts are read and hashed again while only the contract probe is cached', () => {
  clearPosixSupervisorCache(); const file = artifact('fresh-hash'); let reads = 0, probes = 0;
  const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
  withIo({ readSync(original, ...args) { reads++; return original(...args); } }, () => {
    const first = verify(file, spawn), firstReads = reads;
    assert.equal(first.available, true); assert.ok(firstReads >= 2);
    assert.equal(verify(file, spawn).available, true);
    assert.ok(reads >= firstReads * 2); assert.equal(probes, 1);
    assert.ok(Object.isFrozen(first));
  });
});

test('in-place tampering of either leaf with restored mtime never reuses a successful integrity result', () => {
  for (const suffix of ['', '.sha256']) {
    clearPosixSupervisorCache(); const file = artifact(`restored-mtime-${suffix.length}`), target = `${file}${suffix}`; let probes = 0;
    const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
    assert.equal(verify(file, spawn).available, true);
    const stat = fs.statSync(target), changed = fs.readFileSync(target); changed[suffix ? 10 : 80] ^= 1;
    fs.writeFileSync(target, changed); fs.utimesSync(target, stat.atime, stat.mtime);
    assert.equal(verify(file, spawn).reason, 'integrity_failed'); assert.equal(probes, 1);
    clearPosixSupervisorCache(); assert.equal(verify(file, spawn).reason, 'integrity_failed');
  }
});

test('even a model with every leaf stat unchanged must rehash bytes and clear failed cache entries', () => {
  clearPosixSupervisorCache(); const file = artifact('same-stat');
  const originalBytes = fs.readFileSync(file), saved = new Map([file, `${file}.sha256`].map(name => [name, fs.lstatSync(name, { bigint: true })]));
  const handles = new Map(); let probes = 0;
  const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
  withIo({
    openSync(original, name, ...args) { const fd = original(name, ...args); handles.set(fd, name); return fd; },
    closeSync(original, fd) { handles.delete(fd); return original(fd); },
    lstatSync(original, name, ...args) { return saved.get(name) || original(name, ...args); },
    fstatSync(original, fd, ...args) { return saved.get(handles.get(fd)) || original(fd, ...args); }
  }, () => {
    assert.equal(verify(file, spawn).available, true);
    const bytes = Buffer.from(originalBytes); bytes[80] ^= 1; fs.writeFileSync(file, bytes);
    assert.equal(verify(file, spawn).reason, 'integrity_failed');
    fs.writeFileSync(file, originalBytes);
    assert.equal(verify(file, spawn).available, true);
    assert.equal(probes, 2, 'the failure must evict the formerly successful contract entry');
    assert.equal(handles.size, 0);
  });
});

test('checksum replacement and ctime-only changes invalidate the contract binding', () => {
  clearPosixSupervisorCache(); const file = artifact('binding-change'); let probes = 0;
  const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
  assert.equal(verify(file, spawn).available, true);
  const checksum = `${file}.sha256`, replacement = `${checksum}.replacement`;
  fs.writeFileSync(replacement, fs.readFileSync(checksum)); fs.renameSync(replacement, checksum);
  assert.equal(verify(file, spawn).available, true); assert.equal(probes, 2);
  const handles = new Map();
  const altered = (stat, name) => {
    if (name === checksum) return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ctimeNs: stat.ctimeNs + 1n });
    return stat;
  };
  withIo({
    openSync(original, name, ...args) { const fd = original(name, ...args); handles.set(fd, name); return fd; },
    closeSync(original, fd) { handles.delete(fd); return original(fd); },
    lstatSync(original, name, ...args) { return altered(original(name, ...args), name); },
    fstatSync(original, fd, ...args) { return altered(original(fd, ...args), handles.get(fd)); }
  }, () => { assert.equal(verify(file, spawn).available, true); assert.equal(probes, 3); assert.equal(handles.size, 0); });
});

test('short reads preserve byte order and every descriptor closes, including descriptor zero', () => {
  clearPosixSupervisorCache(); const file = artifact('short-read'); const handles = new Set(); let held, closes = 0;
  withIo({
    openSync(original, ...args) { held = original(...args); handles.add(held); return 0; },
    fstatSync(original, fd, ...args) { assert.equal(fd, 0); return original(held, ...args); },
    readSync(original, fd, bytes, offset, length, position) { assert.equal(fd, 0); return original(held, bytes, offset, Math.min(length, 7), position); },
    closeSync(original, fd) { assert.equal(fd, 0); handles.delete(held); closes++; return original(held); }
  }, () => { assert.equal(verify(file).available, true); assert.equal(handles.size, 0); assert.equal(closes, 2); });
});

test('a raced FIFO is opened nonblocking then rejected before reading or probing for both leaves', () => {
  for (const suffix of ['', '.sha256']) {
    clearPosixSupervisorCache(); const file = artifact(`fifo-${suffix.length}`), target = `${file}${suffix}`;
    const handles = new Map(); let victim, reads = 0, probes = 0, opens = 0;
    withIo({
      openSync(original, name, flags, ...args) {
        const fd = original(name, flags, ...args); handles.set(fd, name);
        if (name === target) {
          victim = fd; opens++;
          assert.equal(flags & (fs.constants.O_NOFOLLOW || 0), fs.constants.O_NOFOLLOW || 0);
          assert.equal(flags & (fs.constants.O_NONBLOCK || 0), fs.constants.O_NONBLOCK || 0);
        }
        return fd;
      },
      fstatSync(original, fd, ...args) { const stat = original(fd, ...args); return fd === victim
        ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { isFile: () => false, isFIFO: () => true }) : stat; },
      readSync(original, fd, ...args) { if (fd === victim) reads++; return original(fd, ...args); },
      closeSync(original, fd) { handles.delete(fd); return original(fd); }
    }, () => {
      const result = verify(file, () => { probes++; return { status: 0, stdout: CONTRACT }; });
      assert.equal(result.available, false); assert.equal(opens, 1); assert.equal(reads, 0);
      assert.equal(probes, 0); assert.equal(handles.size, 0);
    });
  }
});

test('byte ceilings and regular-file minima reject before allocation or read', () => {
  for (const [suffix, size] of [['', BigInt(MAX_SUPERVISOR_BYTES) + 1n], ['.sha256', BigInt(MAX_CHECKSUM_BYTES) + 1n], ['', 63n], ['.sha256', 63n]]) {
    clearPosixSupervisorCache(); const file = artifact(`size-${suffix.length}-${size}`), target = `${file}${suffix}`; let opens = 0;
    withIo({
      lstatSync(original, name, ...args) { const stat = original(name, ...args); return name === target
        ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size }) : stat; },
      openSync(original, name, ...args) { if (name === target) opens++; return original(name, ...args); }
    }, () => { assert.equal(verify(file).available, false); assert.equal(opens, 0); });
  }
});

test('incomplete reads, mutations and close failures cannot cache success or leak held descriptors', () => {
  for (const fault of ['short-eof', 'growth', 'truncate', 'close']) {
    clearPosixSupervisorCache(); const file = artifact(`fault-${fault}`), handles = new Map(); let hit = false, probes = 0;
    const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
    withIo({
      openSync(original, name, ...args) { const fd = original(name, ...args); handles.set(fd, name); return fd; },
      readSync(original, fd, ...args) {
        if (handles.get(fd) === file && !hit && fault !== 'close') {
          hit = true;
          if (fault === 'short-eof') return 0;
          if (fault === 'growth') fs.appendFileSync(file, 'x');
          else fs.truncateSync(file, 64);
        }
        return original(fd, ...args);
      },
      closeSync(original, fd) { const name = handles.get(fd); handles.delete(fd); original(fd);
        if (fault === 'close' && name === file) throw new Error('simulated close failure after release'); }
    }, () => { assert.equal(verify(file, spawn).available, false); assert.equal(probes, 0); assert.equal(handles.size, 0); });
    fs.writeFileSync(file, elf()); assert.equal(verify(file, spawn).available, true); assert.equal(probes, 1);
  }
});

test('parent identity changes during held reads or after a successful contract fail closed', () => {
  for (const phase of ['read', 'probe']) {
    clearPosixSupervisorCache(); const file = artifact(`parent-${phase}`), parent = path.dirname(file); let changed = false, probes = 0;
    withIo({
      lstatSync(original, name, ...args) { const stat = original(name, ...args); return changed && name === parent
        ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1n }) : stat; },
      readSync(original, ...args) { const result = original(...args); if (phase === 'read') changed = true; return result; }
    }, () => {
      assert.equal(verify(file, () => { probes++; changed = true; return { status: 0, stdout: CONTRACT }; }).available, false);
      assert.equal(probes, phase === 'probe' ? 1 : 0);
    });
    assert.equal(verify(file, () => { probes++; return { status: 0, stdout: CONTRACT }; }).available, true);
    assert.equal(probes, phase === 'probe' ? 2 : 1);
  }
});

test('failed or timed-out contract probes never become cached successes', () => {
  clearPosixSupervisorCache(); const file = artifact('probe-failure'); let probes = 0;
  for (const response of [{ status: 0, stdout: CONTRACT, error: { code: 'ETIMEDOUT' } }, { status: null, signal: 'SIGKILL', stdout: CONTRACT }, { status: 1, stdout: CONTRACT }]) {
    assert.equal(verify(file, () => { probes++; return response; }).available, false);
  }
  assert.equal(verify(file, () => { probes++; return { status: 0, stdout: CONTRACT }; }).available, true);
  assert.equal(probes, 4);
});

test('architecture and platform changes do not share a contract cache or accept unsupported targets', () => {
  clearPosixSupervisorCache(); const file = artifact('platform'); assert.equal(verify(file).available, true);
  assert.equal(verifyPosixSupervisor({ platform: 'darwin', arch: 'arm64', executable: file }).available, false);
  assert.equal(verifyPosixSupervisor({ platform: 'linux', arch: 'arm64', executable: file }).reason, 'unsupported_target');
  assert.equal(verifyPosixSupervisor({ platform: 'win32', arch: 'x64', executable: file }).reason, 'unsupported_target');
});

test('contract cache is bounded and replacing a historical key requires a fresh probe', () => {
  clearPosixSupervisorCache(); const first = artifact('cache-first'); let firstProbes = 0;
  const spawn = () => { firstProbes++; return { status: 0, stdout: CONTRACT }; };
  assert.equal(verify(first, spawn).available, true);
  for (let index = 0; index < 8; index++) assert.equal(verify(artifact(`cache-${index}`)).available, true);
  assert.equal(verify(first, spawn).available, true); assert.equal(firstProbes, 2);
});

test('a contract cache hit preserves the current caller path rather than an earlier alias', () => {
  clearPosixSupervisorCache(); const file = artifact('path-alias'), relative = path.relative(process.cwd(), file); let probes = 0;
  const spawn = () => { probes++; return { status: 0, stdout: CONTRACT }; };
  assert.equal(verify(file, spawn).executable, file);
  assert.equal(verify(relative, spawn).executable, relative); assert.equal(probes, 1);
});

test('exact minimum executable and maximum checksum bounds remain usable', () => {
  clearPosixSupervisorCache(); const file = artifact('exact-bounds'), bytes = elf().subarray(0, 64);
  fs.writeFileSync(file, bytes);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(`${file}.sha256`, `${digest}\n`.padEnd(MAX_CHECKSUM_BYTES, ' '));
  assert.equal(verify(file).available, true);
  fs.appendFileSync(`${file}.sha256`, ' '); assert.equal(verify(file).available, false);
});
test('nonzero POSIX open flags and FIFO rejection are exercised even on a Windows test host', () => {
  for (const suffix of ['', '.sha256']) {
    const file = artifact(`model-fifo-${suffix.length}`), target = `${file}${suffix}`;
    const nonblock = 0x10000000, nofollow = 0x20000000, handles = new Map();
    let openedFlags, reachedFstat = false, victimReads = 0, probes = 0;
    const io = { ...fs, constants: { ...fs.constants, O_NONBLOCK: nonblock, O_NOFOLLOW: nofollow },
      openSync(name, flags, ...args) {
        if (name === target) {
          openedFlags = flags;
          if (!(flags & nonblock)) throw new Error('model: FIFO open would block before fstat');
        }
        const fd = fs.openSync(name, (flags & ~(nonblock | nofollow)) |
          (fs.constants.O_NONBLOCK || 0) | (fs.constants.O_NOFOLLOW || 0), ...args);
        handles.set(fd, name); return fd;
      },
      fstatSync(fd, ...args) {
        const stat = fs.fstatSync(fd, ...args);
        if (handles.get(fd) !== target) return stat;
        reachedFstat = true;
        return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { isFile: () => false });
      },
      readSync(fd, ...args) { if (handles.get(fd) === target) victimReads++; return fs.readSync(fd, ...args); },
      closeSync(fd) { handles.delete(fd); return fs.closeSync(fd); }
    };
    function loadSource(filename, overrides = {}) {
      const localRequire = createRequire(filename), module = { exports: {} };
      const source = fs.readFileSync(filename, 'utf8');
      new Function('require', 'module', 'exports', '__filename', '__dirname', source)(request =>
        request === 'fs' || request === 'node:fs' ? io : Object.hasOwn(overrides, request)
          ? overrides[request] : localRequire(request), module, module.exports, filename, path.dirname(filename));
      return module.exports;
    }
    const bound = loadSource(require.resolve('../plugins/data-secure/server/core/bound-file-io'));
    const supervisor = loadSource(require.resolve('../plugins/data-secure/server/posix-supervisor'), { './core/bound-file-io': bound });
    const result = supervisor.verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file,
      spawnSync() { probes++; return { status: 0, stdout: CONTRACT }; } });
    assert.equal(result.available, false); assert.equal(openedFlags & nonblock, nonblock);
    assert.equal(openedFlags & nofollow, nofollow); assert.equal(reachedFstat, true);
    assert.equal(victimReads, 0); assert.equal(probes, 0); assert.equal(handles.size, 0);
  }
});

test('leaf changes during the contract probe cannot publish or cache a successful result', () => {
  for (const suffix of ['', '.sha256']) {
    clearPosixSupervisorCache(); const file = artifact(`probe-mutation-${suffix.length}`), target = `${file}${suffix}`;
    const bytes = fs.readFileSync(target); let probes = 0;
    assert.equal(verify(file, () => {
      probes++; const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; fs.writeFileSync(target, changed);
      return { status: 0, stdout: CONTRACT };
    }).available, false);
    fs.writeFileSync(target, bytes);
    assert.equal(verify(file, () => { probes++; return { status: 0, stdout: CONTRACT }; }).available, true);
    assert.equal(probes, 2);
  }
});
done(() => {
  if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('data-secure-posix-supervisor-') ||
      !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('unsafe test cleanup target');
  const files = fs.readdirSync(root, { withFileTypes: true });
  if (files.some(entry => !entry.isFile() || entry.isSymbolicLink())) throw new Error('unexpected test cleanup entry');
  for (const entry of files) fs.unlinkSync(path.join(root, entry.name));
  fs.rmdirSync(root);
});
