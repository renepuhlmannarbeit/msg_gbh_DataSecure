import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function filesBelow(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('OCR_UNIVERSAL_SYMLINK_REFUSED');
    if (entry.isDirectory()) result.push(...filesBelow(full, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error('OCR_UNIVERSAL_SPECIAL_FILE_REFUSED');
  }
  return result.sort();
}
function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('OCR_UNIVERSAL_PATH_INVALID');
  }
  const file = path.join(root, ...relative.split('/'));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('OCR_UNIVERSAL_FILE_INVALID');
  return { file, stat };
}
function loadSource(root) {
  const manifestFile = path.join(root, 'bundle-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.schema !== 'data-secure-ocr-runtime-bundle/v1' || !targets.includes(manifest.target) ||
    manifest.release_enabled !== false || manifest.contract !== 'data-secure-ocr-result/v1' ||
    JSON.stringify(manifest.models) !== JSON.stringify(['deu', 'eng']) ||
    !Array.isArray(manifest.files)) throw new Error('OCR_UNIVERSAL_SOURCE_MANIFEST_INVALID');
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || seen.has(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(String(item.sha256))) throw new Error('OCR_UNIVERSAL_SOURCE_INVENTORY_INVALID');
    seen.add(item.path);
    const { file, stat } = safeFile(root, item.path);
    if (stat.size !== item.bytes || sha256(file) !== item.sha256) throw new Error('OCR_UNIVERSAL_SOURCE_HASH_FAILED');
  }
  const actual = filesBelow(root).filter((item) => item !== 'bundle-manifest.json');
  if (actual.length !== seen.size || actual.some((item) => !seen.has(item))) {
    throw new Error('OCR_UNIVERSAL_SOURCE_INVENTORY_INVALID');
  }
  return { root, manifest, manifestSha256: sha256(manifestFile) };
}
function launcherName(target) {
  return target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox';
}
function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  if (path.basename(destination) === 'datasecure-ocr-sandbox' && process.platform !== 'win32') {
    fs.chmodSync(destination, 0o755);
  }
}

function assemble(sourceRoots, output) {
  if (!Array.isArray(sourceRoots) || sourceRoots.length !== targets.length) {
    throw new Error('OCR_UNIVERSAL_FOUR_SOURCES_REQUIRED');
  }
  const resolvedOutput = path.resolve(output);
  const distRoot = path.join(repoRoot, 'dist');
  const relativeOutput = path.relative(distRoot, resolvedOutput);
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error('OCR_UNIVERSAL_OUTPUT_OUTSIDE_DIST');
  }
  const sources = sourceRoots.map((source) => loadSource(path.resolve(source)));
  const byTarget = new Map(sources.map((source) => [source.manifest.target, source]));
  if (byTarget.size !== targets.length || targets.some((target) => !byTarget.has(target))) {
    throw new Error('OCR_UNIVERSAL_TARGET_SET_INVALID');
  }
  const base = byTarget.get('windows-x64');
  const shared = base.manifest.files.filter((item) => item.path !== launcherName('windows-x64'));
  for (const target of targets) {
    const source = byTarget.get(target);
    const candidate = source.manifest.files.filter((item) => item.path !== launcherName(target));
    if (JSON.stringify(candidate) !== JSON.stringify(shared) ||
      JSON.stringify(source.manifest.components) !== JSON.stringify(base.manifest.components)) {
      throw new Error(`OCR_UNIVERSAL_SHARED_CONTENT_DIFFERS_${target}`);
    }
  }
  fs.rmSync(resolvedOutput, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutput, { recursive: true });
  for (const item of shared) {
    copyFile(path.join(base.root, ...item.path.split('/')), path.join(resolvedOutput, ...item.path.split('/')));
  }
  const targetEntries = [];
  for (const target of targets) {
    const name = launcherName(target);
    const relative = `targets/${target}/${name}`;
    copyFile(path.join(byTarget.get(target).root, name), path.join(resolvedOutput, ...relative.split('/')));
    targetEntries.push({ target, launcher: relative, source_manifest_sha256: byTarget.get(target).manifestSha256 });
  }
  const inventory = filesBelow(resolvedOutput).map((relative) => ({
    path: relative,
    bytes: fs.statSync(path.join(resolvedOutput, ...relative.split('/'))).size,
    sha256: sha256(path.join(resolvedOutput, ...relative.split('/')))
  }));
  const manifest = {
    schema: 'data-secure-ocr-runtime-bundle/v2', target: 'universal', release_enabled: false,
    contract: 'data-secure-ocr-result/v1', models: ['deu', 'eng'],
    components: base.manifest.components, targets: targetEntries, files: inventory
  };
  fs.writeFileSync(path.join(resolvedOutput, 'bundle-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { output: resolvedOutput, manifest };
}

function discover(input) {
  const found = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'bundle-manifest.json') found.push(path.dirname(full));
    }
  }
  walk(path.resolve(input));
  return found;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const inputIndex = process.argv.indexOf('--input');
  const outputIndex = process.argv.indexOf('--output');
  if (inputIndex < 0 || outputIndex < 0 || !process.argv[inputIndex + 1] || !process.argv[outputIndex + 1]) {
    throw new Error('Usage: node scripts/assemble-ocr-runtime.mjs --input <download-root> --output <dist-path>');
  }
  const result = assemble(discover(process.argv[inputIndex + 1]), process.argv[outputIndex + 1]);
  process.stdout.write(`${JSON.stringify({
    schema: result.manifest.schema,
    targets: result.manifest.targets.map((item) => item.target),
    files: result.manifest.files.length + 1,
    bytes: result.manifest.files.reduce((sum, item) => sum + item.bytes, 0),
    release_enabled: result.manifest.release_enabled
  })}\n`);
}

export { assemble, discover };
