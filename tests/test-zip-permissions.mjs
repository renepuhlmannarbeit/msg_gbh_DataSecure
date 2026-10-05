import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFiles, readCentralModes, writeZip } from '../scripts/lib/zip.mjs';
import { nativeDiagnosticEvents } from './helpers/native-diagnostic-events.mjs';

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
  assert.throws(() => writeZip(archive, files, { maximumFileBytes: 5 }), /BOUND_FILE_UNSAFE/u);
  writeZip(archive, files, { maximumFileBytes: 512 * 1024 * 1024 });
  assert.equal(readCentralModes(fs.readFileSync(archive)).size, 2);
  assert.throws(() => writeZip(archive, files, { maximumFileBytes: 512 * 1024 * 1024 + 1 }), /ZIP_FILE_LIMIT_INVALID/u);
  fs.writeFileSync(path.join(directory, 'desktop-interactions.jsonl'), '{"session_id":"first"}\n');
  fs.writeFileSync(path.join(directory, `desktop-interactions.123.${'ab'.repeat(16)}.jsonl`), '{"session_id":"second"}\n');
  fs.writeFileSync(path.join(directory, 'desktop-interactions.previous.jsonl'), '{"session_id":"archive-not-a-session"}\n');
  assert.deepEqual(nativeDiagnosticEvents(directory).map(event => event.session_id).sort(), ['first', 'second']);
  process.stdout.write('Deterministic ZIP modes and explicit bounded caller limits: 5 checks passed.\n');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
