'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { CONTRACT, verifyPosixSupervisor, clearPosixSupervisorCache } = require('../plugins/data-secure/server/posix-supervisor');
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

done();
