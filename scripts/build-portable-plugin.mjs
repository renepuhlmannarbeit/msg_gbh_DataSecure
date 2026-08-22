import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeIndex = process.argv.indexOf('--runtime');
if (runtimeIndex < 0 || !process.argv[runtimeIndex + 1]) {
  throw new Error('Usage: node scripts/build-portable-plugin.mjs --runtime <universal-runtime>');
}
const runtime = path.resolve(process.argv[runtimeIndex + 1]);
const outputIndex = process.argv.indexOf('--output');
const manifestFile = path.join(runtime, 'bundle-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const targetOrder = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];
if (manifest.schema !== 'data-secure-ocr-runtime-bundle/v2' || manifest.target !== 'universal' ||
  manifest.release_enabled !== false || manifest.contract !== 'data-secure-ocr-result/v1' ||
  JSON.stringify(manifest.targets?.map((item) => item.target)) !==
    JSON.stringify(targetOrder) ||
  !Array.isArray(manifest.files)) {
  throw new Error('PORTABLE_PLUGIN_RUNTIME_NOT_ENGINEERING_V2');
}
for (const item of manifest.targets) {
  const name = item.target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox';
  if (item.launcher !== `targets/${item.target}/${name}`) {
    throw new Error('PORTABLE_PLUGIN_RUNTIME_TARGET_INVALID');
  }
}
function runtimeFiles(directory, base = directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('PORTABLE_PLUGIN_RUNTIME_SYMLINK_REFUSED');
    if (entry.isDirectory()) result.push(...runtimeFiles(full, base));
    else if (entry.isFile()) result.push(path.relative(base, full).split(path.sep).join('/'));
    else throw new Error('PORTABLE_PLUGIN_RUNTIME_SPECIAL_FILE_REFUSED');
  }
  return result.sort();
}
const expectedRuntime = new Set();
for (const item of manifest.files) {
  if (!item || expectedRuntime.has(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
    !/^[a-f0-9]{64}$/u.test(String(item.sha256)) || item.path.includes('\\') ||
    item.path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('PORTABLE_PLUGIN_RUNTIME_INVENTORY_INVALID');
  }
  expectedRuntime.add(item.path);
  const file = path.join(runtime, ...item.path.split('/'));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.bytes ||
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== item.sha256) {
    throw new Error(`PORTABLE_PLUGIN_RUNTIME_HASH_FAILED_${item.path}`);
  }
}
const actualRuntime = runtimeFiles(runtime).filter((item) => item !== 'bundle-manifest.json');
if (actualRuntime.length !== expectedRuntime.size || actualRuntime.some((item) => !expectedRuntime.has(item))) {
  throw new Error('PORTABLE_PLUGIN_RUNTIME_INVENTORY_INVALID');
}
const dist = path.join(root, 'dist');
const stage = path.join(dist, '.portable-plugin-stage');
const pluginSource = path.join(root, 'plugins', 'data-secure');
if (fs.existsSync(path.join(pluginSource, 'server', 'ocr-runtime'))) {
  throw new Error('PORTABLE_PLUGIN_CANONICAL_RUNTIME_COLLISION');
}
fs.rmSync(stage, { recursive: true, force: true });
try {
  fs.cpSync(pluginSource, stage, { recursive: true, errorOnExist: true, force: false });
  fs.cpSync(runtime, path.join(stage, 'server', 'ocr-runtime'), {
    recursive: true, errorOnExist: true, force: false
  });
  const plugin = JSON.parse(fs.readFileSync(path.join(stage, '.claude-plugin', 'plugin.json'), 'utf8'));
  const archive = outputIndex >= 0 && process.argv[outputIndex + 1]
    ? path.resolve(process.argv[outputIndex + 1])
    : path.join(dist, `DataSecure-Privacy-Preflight-Portable-Engineering-v${plugin.version}.zip`);
  const relativeArchive = path.relative(dist, archive);
  if (!relativeArchive || relativeArchive.startsWith('..') || path.isAbsolute(relativeArchive)) {
    throw new Error('PORTABLE_PLUGIN_OUTPUT_OUTSIDE_DIST');
  }
  const files = collectFiles(stage).map((file) => ({
    ...file,
    mode: /^server\/ocr-runtime\/targets\/(?:macos-x64|macos-arm64|linux-x64)\//u
      .test(file.archivePath) ? 0o100755 : 0o100644
  }));
  fs.rmSync(archive, { force: true });
  const result = writeZip(archive, files);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  process.stdout.write(`${JSON.stringify({
    archive, entries: result.entries, bytes: result.bytes, sha256: hash,
    runtime_release_enabled: false
  })}\n`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
