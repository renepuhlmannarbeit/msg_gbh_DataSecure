import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = Number(process.argv[2] || 50);
if (!Number.isSafeInteger(requested) || requested < 1 || requested > 200) {
  throw new Error('Run count must be an integer between 1 and 200.');
}

const testFile = path.join(root, 'tests', 'test-direct-picker-intake-worker.js');
for (let run = 1; run <= requested; run++) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 45_000,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0 || result.error) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.slice(-8000);
    process.stderr.write(`Intake worker stress failed at run ${run}/${requested}.\n${output}`);
    process.exit(1);
  }
}

process.stdout.write(`Intake worker stress: ${requested}/${requested} passed.\n`);
