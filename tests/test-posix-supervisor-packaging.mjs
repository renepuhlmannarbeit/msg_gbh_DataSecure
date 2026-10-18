import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyPosixSupervisorArtifacts } from '../scripts/lib/posix-supervisor-artifacts.mjs';
import supervisor from '../plugins/data-secure/server/posix-supervisor.js';

const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-posix-package-'));
let sequence = 0, passed = 0;
function test(name, run) { run(); passed++; console.log(`  PASS ${name}`); }
function fixture(id = 'linux-x64') {
  const nativeRoot = path.join(root, `case-${sequence++}`), target = path.join(nativeRoot, id);
  fs.mkdirSync(target, { recursive: true });
  const executable = path.join(target, 'datasecure-sandbox'), checksum = `${executable}.sha256`, bytes = Buffer.alloc(128);
  if (id === 'linux-x64') {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]); bytes.writeUInt16LE(62, 18);
  } else {
    bytes.writeUInt32LE(0xfeedfacf); bytes.writeInt32LE(id === 'macos-arm64' ? 0x0100000c : 0x01000007, 4);
  }
  fs.writeFileSync(executable, bytes, { mode: 0o755 });
  fs.writeFileSync(checksum, `${crypto.createHash('sha256').update(bytes).digest('hex')}\n`);
  return { nativeRoot, target, executable, checksum, bytes };
}
function withIo(overrides, run) {
  const original = Object.fromEntries(Object.keys(overrides).map(key => [key, fs[key]]));
  try {
    for (const [key, replacement] of Object.entries(overrides)) fs[key] = (...args) => replacement(original[key], ...args);
    return run();
  } finally { Object.assign(fs, original); }
}
try {
  test('absent targets are optional but an incomplete present target fails', () => {
    assert.deepEqual(verifyPosixSupervisorArtifacts(root), []);
    const { nativeRoot, checksum } = fixture(); fs.unlinkSync(checksum);
    assert.throws(() => verifyPosixSupervisorArtifacts(nativeRoot), /POSIX_SUPERVISOR_TARGET_INCOMPLETE/u);
  });
  test('both macOS architectures and Linux validate held target-specific bytes', () => {
    for (const id of ['macos-x64', 'macos-arm64', 'linux-x64']) {
      const { nativeRoot } = fixture(id); assert.deepEqual(verifyPosixSupervisorArtifacts(nativeRoot), [id]);
    }
  });
  test('wrong target headers and forged checksums are refused', () => {
    const { nativeRoot, executable, checksum } = fixture();
    fs.writeFileSync(checksum, '0'.repeat(64));
    assert.throws(() => verifyPosixSupervisorArtifacts(nativeRoot), /POSIX_SUPERVISOR_INTEGRITY_FAILED/u);
    const bytes = Buffer.alloc(128); fs.writeFileSync(executable, bytes);
    fs.writeFileSync(checksum, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.throws(() => verifyPosixSupervisorArtifacts(nativeRoot), /POSIX_SUPERVISOR_TARGET_MISMATCH/u);
  });
  test('exact executable minimum and checksum maximum stay valid', () => {
    const { nativeRoot, executable, checksum, bytes } = fixture(), minimum = bytes.subarray(0, 64);
    fs.writeFileSync(executable, minimum);
    fs.writeFileSync(checksum, `${crypto.createHash('sha256').update(minimum).digest('hex')}\n`.padEnd(supervisor.MAX_CHECKSUM_BYTES, ' '));
    assert.deepEqual(verifyPosixSupervisorArtifacts(nativeRoot), ['linux-x64']);
  });
  test('byte ceilings and minima reject the selected leaf before opening it', () => {
    for (const [leaf, size] of [['executable', BigInt(supervisor.MAX_SUPERVISOR_BYTES) + 1n],
      ['checksum', BigInt(supervisor.MAX_CHECKSUM_BYTES) + 1n], ['executable', 63n], ['checksum', 63n]]) {
      const f = fixture(), target = f[leaf]; let opens = 0;
      withIo({
        lstatSync(original, name, ...args) { const stat = original(name, ...args); return name === target
          ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size }) : stat; },
        openSync(original, name, ...args) { if (name === target) opens++; return original(name, ...args); }
      }, () => { assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_.*_UNSAFE/u); assert.equal(opens, 0); });
    }
  });
  test('short positional reads retain bytes and close every held descriptor', () => {
    const { nativeRoot } = fixture(), handles = new Set(); let reads = 0;
    withIo({
      openSync(original, ...args) { const fd = original(...args); handles.add(fd); return fd; },
      readSync(original, fd, bytes, offset, length, position) { reads++; return original(fd, bytes, offset, Math.min(length, 7), position); },
      closeSync(original, fd) { handles.delete(fd); return original(fd); }
    }, () => { assert.deepEqual(verifyPosixSupervisorArtifacts(nativeRoot), ['linux-x64']); assert.ok(reads > 2); assert.equal(handles.size, 0); });
  });
  test('raced non-regular objects are rejected before any victim read', () => {
    for (const leaf of ['executable', 'checksum']) {
      const f = fixture(), handles = new Map(); let victimReads = 0;
      withIo({
        openSync(original, name, flags, ...args) {
          assert.equal(flags & (fs.constants.O_NONBLOCK || 0), fs.constants.O_NONBLOCK || 0);
          assert.equal(flags & (fs.constants.O_NOFOLLOW || 0), fs.constants.O_NOFOLLOW || 0);
          const fd = original(name, flags, ...args); handles.set(fd, name); return fd;
        },
        fstatSync(original, fd, ...args) { const stat = original(fd, ...args); return handles.get(fd) === f[leaf]
          ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { isFile: () => false }) : stat; },
        readSync(original, fd, ...args) { if (handles.get(fd) === f[leaf]) victimReads++; return original(fd, ...args); },
        closeSync(original, fd) { handles.delete(fd); return original(fd); }
      }, () => { assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_.*_UNSAFE/u); assert.equal(victimReads, 0); assert.equal(handles.size, 0); });
    }
  });
  test('EOF, growth, truncation and close errors never certify a package', () => {
    for (const leaf of ['executable', 'checksum']) for (const fault of ['eof', 'grow', 'truncate', 'close']) {
      const f = fixture(), handles = new Map(); let hit = false;
      withIo({
        openSync(original, name, ...args) { const fd = original(name, ...args); handles.set(fd, name); return fd; },
        readSync(original, fd, ...args) {
          if (handles.get(fd) === f[leaf] && !hit && fault !== 'close') {
            hit = true; if (fault === 'eof') return 0;
            if (fault === 'grow') fs.appendFileSync(f[leaf], 'x'); else fs.truncateSync(f[leaf], 1);
          }
          return original(fd, ...args);
        },
        closeSync(original, fd) { const name = handles.get(fd); handles.delete(fd); original(fd);
          if (fault === 'close' && name === f[leaf]) throw new Error('simulated close failure after release'); }
      }, () => { assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_.*_UNSAFE/u); assert.equal(handles.size, 0); });
    }
  });
  test('parent identity changes during reading are not certified', () => {
    const f = fixture(); let changed = false;
    withIo({
      readSync(original, ...args) { const value = original(...args); changed = true; return value; },
      lstatSync(original, name, ...args) { const stat = original(name, ...args); return changed && name === f.target
        ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1n }) : stat; }
    }, () => assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_EXECUTABLE_UNSAFE/u));
  });
  test('the first leaf remains bound while the checksum leaf is being read', () => {
    const f = fixture(), handles = new Map(); let changed = false;
    withIo({
      openSync(original, name, ...args) { const fd = original(name, ...args); handles.set(fd, name); return fd; },
      readSync(original, fd, ...args) {
        const value = original(fd, ...args);
        if (!changed && handles.get(fd) === f.checksum) {
          changed = true; const bytes = Buffer.from(f.bytes); bytes[80] ^= 1; fs.writeFileSync(f.executable, bytes);
        }
        return value;
      },
      closeSync(original, fd) { handles.delete(fd); return original(fd); }
    }, () => { assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_EXECUTABLE_UNSAFE/u); assert.equal(handles.size, 0); });
  });
  test('non-regular leaves and extra hard links are rejected', () => {
    const f = fixture(); fs.unlinkSync(f.executable); fs.mkdirSync(f.executable);
    assert.throws(() => verifyPosixSupervisorArtifacts(f.nativeRoot), /POSIX_SUPERVISOR_EXECUTABLE_UNSAFE/u);
    const linked = fixture(); fs.linkSync(linked.executable, path.join(linked.target, 'extra-link'));
    assert.throws(() => verifyPosixSupervisorArtifacts(linked.nativeRoot), /POSIX_SUPERVISOR_EXECUTABLE_UNSAFE/u);
  });
  console.log(`POSIX supervisor packaging contract: ${passed} passed, 0 failed`);
} finally {
  if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('datasecure-posix-package-') ||
      !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('unsafe test cleanup target');
  fs.rmSync(root, { recursive: true, force: true });
}
