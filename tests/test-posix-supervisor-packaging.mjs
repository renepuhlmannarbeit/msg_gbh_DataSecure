import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyPosixSupervisorArtifacts } from '../scripts/lib/posix-supervisor-artifacts.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-posix-package-'));
try {
  assert.deepEqual(verifyPosixSupervisorArtifacts(root), []);
  const target = path.join(root, 'linux-x64');
  fs.mkdirSync(target);
  assert.throws(() => verifyPosixSupervisorArtifacts(root), /POSIX_SUPERVISOR_TARGET_INCOMPLETE/);

  const executable = path.join(target, 'datasecure-sandbox');
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  bytes.writeUInt16LE(62, 18);
  fs.writeFileSync(executable, bytes, { mode: 0o755 });
  fs.writeFileSync(`${executable}.sha256`, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(verifyPosixSupervisorArtifacts(root), ['linux-x64']);

  fs.writeFileSync(`${executable}.sha256`, '0'.repeat(64));
  assert.throws(() => verifyPosixSupervisorArtifacts(root), /POSIX_SUPERVISOR_INTEGRITY_FAILED/);
  console.log('POSIX supervisor packaging contract: 3 passed, 0 failed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
