'use strict';

// Test-only native process/fixture boundary. Reuse the existing fresh private
// ACL setup, but never widen its cleanup grammar or accept an existing root.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { createPrivateFixture, participant } = require('./native-ownership-epoch-release-fixture.cjs');
const { writeFully, syncParentDirectory } = require('../../plugins/data-secure/server/gateway/batch-journal-io');
const { readHeldBytes, fileIdentity, sameFile } = require('../../plugins/data-secure/server/core/bound-file-io');
const TOKEN_RE = /^[a-f0-9]{64}$/u;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = stat => [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)];
const same = (stat, expected) => JSON.stringify(identity(stat)) === JSON.stringify(expected);
const fixed = code => Object.assign(Error(code), { code });

function readBounded(file, maximum) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maximum))
    throw fixed('NATIVE_LEASE_FINISH_INPUT_INVALID');
  const bound = fileIdentity(before, true), fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(fs.fstatSync(fd, { bigint: true }), bound)) throw fixed('NATIVE_LEASE_FINISH_INPUT_CHANGED');
    const bytes = readHeldBytes(fd, Number(before.size), fs, maximum);
    if (!sameFile(fs.fstatSync(fd, { bigint: true }), bound) || !sameFile(fs.lstatSync(file, { bigint: true }), bound))
      throw fixed('NATIVE_LEASE_FINISH_INPUT_CHANGED');
    return bytes;
  } finally { fs.closeSync(fd); }
}

async function createLeaseFinishNativeFixture({ artifact, loader }) {
  const base = await createPrivateFixture(), baseIdentity = identity(fs.lstatSync(base.path, { bigint: true }));
  const directories = new Map([[base.path, baseIdentity]]), owned = new Map(), anchors = new Map();
  const holders = [], syncReceipts = [], holderReceipts = [];
  let failedChild = false, cleaned = false;
  const childEnvironment = { SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || '' };
  function verifyDirectory(directory) {
    const expected = directories.get(directory), current = fs.lstatSync(directory, { bigint: true });
    if (!expected || !current.isDirectory() || current.isSymbolicLink() || !same(current, expected) || fs.realpathSync(directory) !== directory)
      throw fixed('NATIVE_LEASE_FINISH_FIXTURE_CHANGED');
  }
  function register(file, bytes) {
    verifyDirectory(path.dirname(file));
    const current = fs.lstatSync(file, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n ||
        !readBounded(file, 1024 * 1024).equals(bytes)) throw fixed('NATIVE_LEASE_FINISH_FILE_CHANGED');
    owned.set(file, { identity: identity(current), bytes: Buffer.from(bytes) });
  }
  function unchanged(file) {
    const expected = owned.get(file), current = fs.lstatSync(file, { bigint: true });
    verifyDirectory(path.dirname(file));
    if (!expected || !current.isFile() || current.isSymbolicLink() || current.nlink !== 1n ||
        !same(current, expected.identity) || !readBounded(file, 1024 * 1024).equals(expected.bytes))
      throw fixed('NATIVE_LEASE_FINISH_FILE_CHANGED');
  }
  function root() {
    verifyDirectory(base.path);
    const value = base.root(); directories.set(value, identity(fs.lstatSync(value, { bigint: true })));
    const batches = path.join(value, 'batches'); fs.mkdirSync(batches, { mode: 0o700 });
    directories.set(batches, identity(fs.lstatSync(batches, { bigint: true })));
    return value;
  }
  function createFile(directory, name, bytes) {
    verifyDirectory(directory);
    if (!/^(?:published-sentinel\.(?:md|json)|[a-f0-9]{64}\.json)$/u.test(name)) throw fixed('NATIVE_LEASE_FINISH_FILE_ROLE');
    const file = path.join(directory, name);
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }); register(file, Buffer.from(bytes));
    return file;
  }
  function writeJournal(file, value) {
    if (!TOKEN_RE.test(path.basename(file, '.json')) || path.basename(path.dirname(file)) !== 'batches' || !owned.has(file))
      throw fixed('NATIVE_LEASE_FINISH_JOURNAL_ROLE');
    unchanged(file);
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (bytes.length > 65536) throw fixed('NATIVE_LEASE_FINISH_JOURNAL_BOUND');
    const temporary = file + '.native-gate-' + crypto.randomBytes(12).toString('hex') + '.tmp';
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600); writeFully(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      unchanged(file); fs.renameSync(temporary, file); syncParentDirectory(file); register(file, bytes);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      // Unknown/unfinished temporaries remain on any failure. No blind unlink.
    }
  }
  function rememberAnchor(root) {
    const file = path.join(root, 'ownership-control.lock'), current = fs.lstatSync(file, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n) throw fixed('NATIVE_LEASE_FINISH_ANCHOR_INVALID');
    anchors.set(file, identity(current));
  }
  function unchangedAnchors() {
    for (const [file, expected] of anchors) {
      const current = fs.lstatSync(file, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || !same(current, expected))
        throw fixed('NATIVE_LEASE_FINISH_ANCHOR_CHANGED');
    }
  }
  function spawnHolder() {
    const holder = participant(path.join(__dirname, 'native-ownership-guard-child.cjs'), { rpcMs: 5000, graceMs: 1000, reapMs: 2000 });
    if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0 || holder.pid === process.pid) throw fixed('NATIVE_LEASE_FINISH_CHILD_PID');
    holders.push(holder);
    return holder;
  }
  async function stopAll() {
    for (const holder of holders) {
      if (holderReceipts.some(receipt => receipt.pid === holder.pid)) continue;
      const stopped = await holder.stop();
      holderReceipts.push({ pid: holder.pid, ...stopped });
      if (!stopped.closed || !stopped.exited || !stopped.normal || !stopped.ipc_disconnected || !stopped.stderr_closed) failedChild = true;
    }
    return holderReceipts.map(receipt => ({ ...receipt }));
  }
  function competitor(root, expected) {
    verifyDirectory(root);
    // Exactly one bounded synchronous child. Its stdout is emitted only after
    // C release/close; synchronous status confirms completion, not an invented
    // asynchronous ChildProcess 'close' event.
    const source = 'const{createOwnershipGuard}=require(' + JSON.stringify(loader) + ');' +
      'const f=createOwnershipGuard({verifiedArtifact:JSON.parse(process.argv[1]),root:process.argv[2]});' +
      'let g=f.tryAcquire();const acquired=!!g;if(g&&g.release()!==true)throw Error("RELEASE");' +
      'if(f.close()!==true)throw Error("CLOSE");process.stdout.write(JSON.stringify({acquired}));';
    const result = spawnSync(process.execPath, ['-e', source, JSON.stringify(artifact), root], {
      env: childEnvironment, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 8192
    });
    const completed = !result.error && result.status === 0 && result.signal === null &&
      Number.isSafeInteger(result.pid) && result.pid > 0 && result.pid !== process.pid;
    const receipt = { pid: result.pid || null, completed_synchronously: completed,
      exit_code: result.status, signal: result.signal, stdout_bytes: result.stdout?.length || 0, stderr_bytes: result.stderr?.length || 0 };
    syncReceipts.push(receipt);
    if (!completed) { failedChild = true; throw fixed('NATIVE_LEASE_FINISH_SYNC_CHILD_NOT_COMPLETE'); }
    assert.equal(result.stderr.length, 0);
    assert.deepEqual(JSON.parse(result.stdout), { acquired: expected });
    return receipt;
  }
  function cleanup() {
    if (cleaned || failedChild || holders.length === 0 || holderReceipts.length !== holders.length ||
        holderReceipts.some(receipt => !receipt.closed || !receipt.normal || !receipt.ipc_disconnected || !receipt.stderr_closed) ||
        syncReceipts.length === 0 || syncReceipts.some(receipt => !receipt.completed_synchronously))
      throw fixed('NATIVE_LEASE_FINISH_CHILD_QUIESCENCE_REQUIRED');
    unchangedAnchors();
    // Validate the ENTIRE own scope before deleting any own payload. The reused
    // base helper will then see only its original narrow anchor/root grammar.
    const seenDirectories = new Set(), seenFiles = new Set();
    function inspect(directory, depth = 0) {
      if (depth > 3) throw fixed('NATIVE_LEASE_FINISH_CLEANUP_BOUND');
      verifyDirectory(directory); seenDirectories.add(directory);
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      if (entries.length > 12) throw fixed('NATIVE_LEASE_FINISH_CLEANUP_BOUND');
      for (const entry of entries) {
        const file = path.join(directory, entry.name), current = fs.lstatSync(file, { bigint: true });
        if (current.isSymbolicLink() || fs.realpathSync(file) !== file) throw fixed('NATIVE_LEASE_FINISH_CLEANUP_UNSAFE');
        if (current.isDirectory()) inspect(file, depth + 1);
        else if (owned.has(file)) { unchanged(file); seenFiles.add(file); }
        else if (!anchors.has(file) || !current.isFile() || current.nlink !== 1n || !same(current, anchors.get(file)))
          throw fixed('NATIVE_LEASE_FINISH_CLEANUP_UNKNOWN');
      }
    }
    inspect(base.path);
    if (seenDirectories.size !== directories.size || seenFiles.size !== owned.size) throw fixed('NATIVE_LEASE_FINISH_CLEANUP_MISSING');
    for (const file of owned.keys()) { verifyDirectory(base.path); unchanged(file); fs.unlinkSync(file); }
    base.cleanup(); cleaned = true;
  }
  return { path: base.path, root, createFile, writeJournal, readJournal: file => JSON.parse(readBounded(file, 65536)),
    unchanged, rememberAnchor, unchangedAnchors, spawnHolder, stopAll, competitor, cleanup,
    evidence: () => ({ fixture_cleaned: cleaned, synchronous_children: syncReceipts.map(receipt => ({ ...receipt })),
      holder_termination: holderReceipts.map(receipt => ({ ...receipt })) }) };
}

module.exports = { createLeaseFinishNativeFixture, readBounded, digest };
