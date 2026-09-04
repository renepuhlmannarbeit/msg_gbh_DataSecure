// Canonical product build: assemble a self-contained Claude Cowork plugin
// from a previously verified, platform-native Node runtime. Source-only ZIPs
// are intentionally not a product artefact.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntimePlugin } from './build-runtime-plugin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  if (!process.argv[index + 1]) throw new Error(`PRODUCT_BUILD_ARGUMENT_MISSING:${name}`);
  return process.argv[index + 1];
}

function hostTarget() {
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'macos-x64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  throw new Error('PRODUCT_BUILD_HOST_UNSUPPORTED');
}

const targetId = option('--target') || hostTarget();
const runtimesRoot = path.resolve(option('--runtimes') || path.join(root, 'dist'));
const supportMode = process.argv.includes('--support');
const result = buildRuntimePlugin({ repositoryRoot: root, runtimesRoot, targetId, supportMode });
process.stdout.write(`${JSON.stringify(result)}\n`);
