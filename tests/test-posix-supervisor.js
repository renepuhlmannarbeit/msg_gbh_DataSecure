'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { CONTRACT, DARWIN_CONTRACT, verifyPosixSupervisor, clearPosixSupervisorCache } = require('../plugins/data-secure/server/posix-supervisor');
const { test, done, assert } = createSuite('POSIX supervisor contract');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-posix-supervisor-'));

function elf() { const bytes = Buffer.alloc(128); bytes.write('\x7fELF', 0, 'binary'); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18); return bytes; }
function artifact(name = 'datasecure-sandbox') {
  const file = path.join(root, name); const bytes = elf();
  fs.writeFileSync(file, bytes, { mode: 0o700 });
  fs.writeFileSync(`${file}.sha256`, `${crypto.createHash('sha256').update(bytes).digest('hex')}\n`);
  return file;
}

test('verified Linux supervisor accepts only the fixed contract with empty environment', () => {
  clearPosixSupervisorCache(); const file = artifact('ok'); let invocation;
  const result = verifyPosixSupervisor({ platform: 'linux', arch: 'x64', executable: file, spawnSync(command, args, options) { invocation = { command, args, options }; return { status: 0, stdout: CONTRACT }; } });
  assert.deepStrictEqual(result, { available: true, reason: 'ok', executable: file });
  assert.strictEqual(invocation.command, file); assert.deepStrictEqual(invocation.args, ['--sandbox-contract']);
  assert.deepStrictEqual(invocation.options.env, {}); assert.strictEqual(invocation.options.shell, false);
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
done();
