import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import { inspectMachO } from './macos-native-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const relocatorSource = path.join(root, 'native/macos/relocate-bundle-native.c');
export const relocatorPath = testHook => path.join(root, 'dist', testHook ? 'macos-build-tools-test' : 'macos-build-tools', 'datasecure-relocate-native');
export const relocatorMarker = hash => `DATASECURE_MACOS_RELOCATOR_SOURCE_SHA256_V1:${hash}:END_DATASECURE_MACOS_RELOCATOR_SOURCE_SHA256`;
export const relocatorMode = testHook => `DATASECURE_MACOS_RELOCATOR_MODE_V1:${testHook ? 'test' : 'production'}:END`;

export function checkedRelocator(testHook = false) {
  if (process.platform !== 'darwin') throw new Error('MACOS_RELOCATOR_NATIVE_HOST_REQUIRED');
  const source = boundFileIo.readBoundFile(relocatorSource, { maximum: 128 * 1024, checkCtime: true });
  const helper = boundFileIo.readBoundFileRecord(relocatorPath(testHook), { maximum: 4 * 1024 * 1024, checkCtime: true });
  const native = inspectMachO(helper.bytes), marker = relocatorMarker(digest(source)), mode = relocatorMode(testHook);
  if (!native || native.architecture !== process.arch || native.fileType !== 2 ||
      !helper.bytes.includes(Buffer.from(marker)) || !helper.bytes.includes(Buffer.from(mode)) ||
      helper.bytes.includes(Buffer.from(relocatorMode(!testHook)))) throw new Error('MACOS_RELOCATOR_BUILD_MISMATCH');
  const probe = childProcess.spawnSync(relocatorPath(testHook), ['--contract'], {
    env: {}, shell: false, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000, maxBuffer: 4096
  });
  if (probe.error || probe.status !== 0 || probe.stdout !== `${marker}\n${mode}\n` || probe.stderr !== '')
    throw new Error('MACOS_RELOCATOR_CONTRACT_INVALID');
  return relocatorPath(testHook);
}

export function buildMacRelocator({ testHook = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('MACOS_RELOCATOR_NATIVE_HOST_REQUIRED');
  const source = boundFileIo.readBoundFile(relocatorSource, { maximum: 128 * 1024, checkCtime: true });
  const output = relocatorPath(testHook), directory = path.dirname(output);
  fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
  const parent = boundFileIo.bindDirectory(directory);
  if (fs.existsSync(output)) throw new Error('MACOS_RELOCATOR_OUTPUT_EXISTS');
  const result = childProcess.spawnSync('/usr/bin/clang', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
    `-DDATASECURE_RELOCATOR_SOURCE_SHA256="${digest(source)}"`,
    ...(testHook ? ['-DDATASECURE_RELOCATION_TEST_HOOK=1'] : []), relocatorSource, '-o', output], {
    env: {}, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 64 * 1024
  });
  boundFileIo.assertDirectory(parent);
  if (result.error || result.status !== 0) throw new Error('MACOS_RELOCATOR_BUILD_FAILED');
  return checkedRelocator(testHook);
}
