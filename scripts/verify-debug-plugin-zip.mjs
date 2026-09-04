import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
  : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
    : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
if (!target) throw new Error('DEBUG_ARCHIVE_HOST_UNSUPPORTED');
const archive = path.join(root, 'dist', `DataSecure-Privacy-Preflight-${target}-debug-v${pkg.version}.zip`);
const result = spawnSync(process.execPath,
  [path.join(root, 'scripts', 'verify-plugin-zip.mjs'), '--archive', archive],
  { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status || 0);
