// Extract the locally built Claude plugin ZIP without external dependencies and
// run the same skill acceptance against the exact packaged files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, 'dist', `DataSecure-Privacy-Preflight-v${pkg.version}.zip`);
if (!fs.existsSync(archive)) throw new Error(`Plugin ZIP fehlt: ${path.basename(archive)}`);

const target = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-plugin-zip-'));
try {
  const entries = readZip(fs.readFileSync(archive));
  for (const [name, bytes] of entries) {
    const destination = path.resolve(target, ...name.split('/'));
    if (!destination.startsWith(`${path.resolve(target)}${path.sep}`)) {
      throw new Error('Plugin ZIP enthält einen unsicheren Pfad.');
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  for (const test of ['test-contract-skill-acceptance.js', 'test-contract-skill-matrix.js']) {
    const acceptance = spawnSync(
      process.execPath,
      [path.join(root, 'tests', test), target],
      { cwd: root, stdio: 'inherit', env: { ...process.env } }
    );
    if (acceptance.error) throw acceptance.error;
    if (acceptance.status !== 0) process.exit(acceptance.status || 1);
  }
  console.log(`Packaged plugin ZIP acceptance: PASS (${entries.size} entries)`);
} finally {
  fs.rmSync(target, { recursive: true, force: true });
}
