import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFiles, readCentralModes, writeZip } from '../scripts/lib/zip.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-zip-mode-'));
try {
  const executable = path.join(directory, 'launcher');
  const regular = path.join(directory, 'notice.txt');
  fs.writeFileSync(executable, 'launcher');
  fs.writeFileSync(regular, 'notice');
  fs.chmodSync(executable, 0o755);
  fs.chmodSync(regular, 0o644);
  const archive = path.join(directory, 'test.zip');
  const files = collectFiles(directory).filter((item) => item.archivePath !== 'test.zip').map((item) => ({
    ...item,
    mode: item.archivePath === 'launcher' ? 0o100755 : 0o100644
  }));
  writeZip(archive, files);
  const modes = readCentralModes(fs.readFileSync(archive));
  assert.equal(modes.get('launcher') & 0o777, 0o755);
  assert.equal(modes.get('notice.txt') & 0o777, 0o644);
  process.stdout.write('Deterministic ZIP POSIX modes: 2 checks passed.\n');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
