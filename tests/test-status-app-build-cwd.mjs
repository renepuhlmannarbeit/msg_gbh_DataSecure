import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'build-status-app.mjs');
const outsideRepository = os.tmpdir();
const result = spawnSync(process.execPath, [script, '--check'], {
  cwd: outsideRepository,
  encoding: 'utf8',
  windowsHide: true
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /Status card verified:/u);
assert.equal(result.stderr, '');
console.log('Status app build is repository-bound and independent of caller CWD: PASS');
