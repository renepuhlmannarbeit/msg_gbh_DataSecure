import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TARGETS = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];

function validateUniversalManifest(manifest, options = {}) {
  const keys = ['components', 'contract', 'files', 'models', 'release_enabled', 'schema', 'target', 'targets'];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
    Object.keys(manifest).sort().join(',') !== keys.join(',') ||
    manifest.schema !== 'data-secure-ocr-runtime-bundle/v2' || manifest.target !== 'universal' ||
    manifest.release_enabled !== (options.releaseEnabled ?? false) ||
    manifest.contract !== 'data-secure-ocr-result/v1' ||
    JSON.stringify(manifest.models) !== JSON.stringify(['deu', 'eng']) ||
    !Array.isArray(manifest.components) || manifest.components.length !== 13 ||
    manifest.components.some((item) => !item || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).sort().join(',') !== 'license,license_file,name,version' ||
      !['license', 'license_file', 'name', 'version'].every((key) => typeof item[key] === 'string' && item[key])) ||
    !Array.isArray(manifest.files) || manifest.files.length !== 243 ||
    JSON.stringify(manifest.targets?.map((item) => item.target)) !== JSON.stringify(TARGETS)) {
    throw new Error('OCR_UNIVERSAL_MANIFEST_INVALID');
  }
  for (const item of manifest.targets) {
    const name = item.target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox';
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).sort().join(',') !== 'launcher,source_manifest_sha256,target' ||
      item.launcher !== `targets/${item.target}/${name}` ||
      !/^[a-f0-9]{64}$/u.test(String(item.source_manifest_sha256))) {
      throw new Error('OCR_UNIVERSAL_TARGET_INVALID');
    }
  }
  const expected = new Set();
  for (const item of manifest.files) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).sort().join(',') !== 'bytes,path,sha256' || expected.has(item.path) ||
      !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/u.test(String(item.sha256)) ||
      typeof item.path !== 'string' || item.path.includes('\\') ||
      item.path.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('OCR_UNIVERSAL_INVENTORY_INVALID');
    }
    expected.add(item.path);
  }
  return expected;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function treeFiles(directory, base = directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('OCR_UNIVERSAL_SYMLINK_REFUSED');
    if (entry.isDirectory()) result.push(...treeFiles(full, base));
    else if (entry.isFile()) result.push(path.relative(base, full).split(path.sep).join('/'));
    else throw new Error('OCR_UNIVERSAL_SPECIAL_FILE_REFUSED');
  }
  return result.sort();
}

function validateUniversalRuntime(directory, options = {}) {
  const root = path.resolve(directory);
  const rootInfo = fs.lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('OCR_UNIVERSAL_ROOT_INVALID');
  const manifestFile = path.join(root, 'bundle-manifest.json');
  const manifestInfo = fs.lstatSync(manifestFile);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 1024 * 1024) {
    throw new Error('OCR_UNIVERSAL_MANIFEST_INVALID');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const expected = validateUniversalManifest(manifest, options);
  let bytes = 0;
  for (const item of manifest.files) {
    bytes += item.bytes;
    const file = path.join(root, ...item.path.split('/'));
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== item.bytes || sha256(file) !== item.sha256) {
      throw new Error(`OCR_UNIVERSAL_HASH_FAILED_${item.path}`);
    }
  }
  const actual = treeFiles(root).filter((item) => item !== 'bundle-manifest.json');
  if (actual.length !== expected.size || actual.some((item) => !expected.has(item)) || bytes >= 65 * 1024 * 1024) {
    throw new Error('OCR_UNIVERSAL_INVENTORY_INVALID');
  }
  for (const required of ['runtime-worker.mjs', 'network-deny.cjs', 'models/deu.traineddata',
    'models/eng.traineddata', 'THIRD_PARTY_NOTICES.md', ...manifest.targets.map((item) => item.launcher)]) {
    if (!expected.has(required)) throw new Error('OCR_UNIVERSAL_INCOMPLETE');
  }
  return { root, manifest, manifestSha256: sha256(manifestFile), bytes, files: manifest.files.length + 1 };
}

export { TARGETS, validateUniversalManifest, validateUniversalRuntime };
