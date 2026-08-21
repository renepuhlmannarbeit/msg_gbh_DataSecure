import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { summarizeSarif } from '../scripts/check-sarif.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-sarif-'));
const write = (name, results) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify({ version: '2.1.0', runs: [{ results }] }));
  return file;
};

try {
  write('clean.sarif', []);
  assert.deepEqual(summarizeSarif(root), { files: 1, results: 0, rules: {} });
  fs.rmSync(path.join(root, 'clean.sarif'));

  const finding = write('finding.sarif', [
    { ruleId: 'js/example', message: { text: 'must not be printed' }, locations: [] }
  ]);
  assert.deepEqual(summarizeSarif(finding), {
    files: 1, results: 1, rules: { 'js/example': 1 }
  });
  const run = spawnSync(process.execPath, ['scripts/check-sarif.mjs', finding], {
    cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /"js\/example":1/);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /must not be printed/);

  assert.throws(() => summarizeSarif(path.join(root, 'missing')), /fehlt/);
  process.stdout.write('SARIF release gate: 4 checks passed\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
