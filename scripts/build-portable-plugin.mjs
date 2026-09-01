import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { includeInProduct, verifyKeyringFreeProductFiles } from './lib/product-files.mjs';
import { validateUniversalRuntime } from './lib/ocr-universal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeIndex = process.argv.indexOf('--runtime');
if (runtimeIndex < 0 || !process.argv[runtimeIndex + 1]) {
  throw new Error('Usage: node scripts/build-portable-plugin.mjs --runtime <universal-runtime>');
}
const runtime = path.resolve(process.argv[runtimeIndex + 1]);
const outputIndex = process.argv.indexOf('--output');
const runtimeEvidence = validateUniversalRuntime(runtime, { releaseEnabled: false });
const executableOcrEntries = new Set(runtimeEvidence.manifest.targets
  .filter((target) => target.target !== 'windows-x64')
  .map((target) => `server/ocr-runtime/${target.launcher}`));
const dist = path.join(root, 'dist');
const stage = path.join(dist, '.portable-plugin-stage');
const pluginSource = path.join(root, 'plugins', 'data-secure');
const canonicalRuntime = path.join(pluginSource, 'server', 'ocr-runtime');
const canonicalEvidence = fs.existsSync(canonicalRuntime)
  ? validateUniversalRuntime(canonicalRuntime, { releaseEnabled: false }) : null;
if (canonicalEvidence && canonicalEvidence.manifestSha256 !== runtimeEvidence.manifestSha256) {
  throw new Error('PORTABLE_PLUGIN_CANONICAL_RUNTIME_DIFFERS');
}
fs.rmSync(stage, { recursive: true, force: true });
try {
  fs.cpSync(pluginSource, stage, {
    recursive: true, errorOnExist: true, force: false,
    filter: (source) => includeInProduct(path.relative(pluginSource, source))
  });
  // The normal product allowlist deliberately excludes the disabled OCR
  // runtime. This explicit Engineering builder must add the already verified
  // bundle back after copying the product tree; otherwise it silently emits a
  // "portable" archive without the backend it claims to exercise.
  fs.cpSync(runtime, path.join(stage, 'server', 'ocr-runtime'), {
    recursive: true, errorOnExist: true, force: false
  });
  validateUniversalRuntime(path.join(stage, 'server', 'ocr-runtime'), { releaseEnabled: false });
  const plugin = JSON.parse(fs.readFileSync(path.join(stage, '.claude-plugin', 'plugin.json'), 'utf8'));
  const archive = outputIndex >= 0 && process.argv[outputIndex + 1]
    ? path.resolve(process.argv[outputIndex + 1])
    : path.join(dist, `DataSecure-Privacy-Preflight-Portable-Engineering-v${plugin.version}.zip`);
  const relativeArchive = path.relative(dist, archive);
  if (!relativeArchive || relativeArchive.startsWith('..') || path.isAbsolute(relativeArchive)) {
    throw new Error('PORTABLE_PLUGIN_OUTPUT_OUTSIDE_DIST');
  }
  if (archive === stage || archive.startsWith(`${stage}${path.sep}`)) {
    throw new Error('PORTABLE_PLUGIN_OUTPUT_RESERVED');
  }
  const staged = collectFiles(stage);
  const normalProductFiles = staged.filter((file) => !file.archivePath.replaceAll('\\', '/').startsWith('server/ocr-runtime/'));
  // Non-OCR entries still obey the exact user-product exclusion boundary.
  for (const file of normalProductFiles) {
    if (!includeInProduct(file.archivePath)) throw new Error(`PORTABLE_PLUGIN_NON_PRODUCT_FILE:${file.archivePath}`);
  }
  verifyKeyringFreeProductFiles(normalProductFiles);
  const files = staged.map((file) => ({
    ...file,
    mode: executableOcrEntries.has(file.archivePath) ? 0o100755 : 0o100644
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
