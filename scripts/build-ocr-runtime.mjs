import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeArtifact } from './lib/native-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pilot = path.join(root, 'native', 'ocr', 'pilot');
const target = process.argv[2];
const targets = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];
if (!targets.includes(target)) throw new Error('OCR_BUNDLE_TARGET_INVALID');
const output = path.join(root, 'dist', 'ocr-runtime', target);
const packages = [
  'tesseract.js', 'tesseract.js-core', 'bmp-js', 'idb-keyval', 'is-url', 'node-fetch',
  'opencollective-postinstall', 'regenerator-runtime', 'wasm-feature-detect', 'zlibjs',
  'whatwg-url', 'tr46', 'webidl-conversions'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function ensureTreeSafe(source) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const full = path.join(source, entry.name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error('OCR_BUNDLE_SYMLINK_REFUSED');
    if (stat.isDirectory()) ensureTreeSafe(full);
    else if (!stat.isFile()) throw new Error('OCR_BUNDLE_SPECIAL_FILE_REFUSED');
  }
}
function copyTree(source, destination) {
  ensureTreeSafe(source);
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
}
function filesBelow(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(full, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error('OCR_BUNDLE_SPECIAL_FILE_REFUSED');
  }
  return result.sort();
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'node_modules'), { recursive: true });
for (const name of ['runtime-worker.mjs', 'ocr-contract.mjs', 'network-deny.cjs']) {
  fs.copyFileSync(path.join(pilot, name), path.join(output, name), fs.constants.COPYFILE_EXCL);
}
fs.writeFileSync(path.join(output, 'runtime-package.json'), JSON.stringify({
  name: 'datasecure-offline-ocr-runtime', private: true, version: '1.0.0'
}, null, 2) + '\n', { flag: 'wx' });
copyTree(path.join(pilot, 'models'), path.join(output, 'models'));

const components = [];
let notice = '# DataSecure OCR – Drittanbieterhinweise\n\n';
for (const name of packages) {
  const source = path.join(pilot, 'node_modules', ...name.split('/'));
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  copyTree(source, path.join(output, 'node_modules', ...name.split('/')));
  const licenseFile = fs.readdirSync(source).find((file) => /^(licen[cs]e|copying)([-.]|$)/iu.test(file));
  components.push({ name, version: metadata.version, license: metadata.license, license_file: licenseFile || null });
  notice += `## ${name} ${metadata.version} — ${metadata.license}\n\n`;
  if (licenseFile) notice += `${fs.readFileSync(path.join(source, licenseFile), 'utf8').trim()}\n\n`;
  else notice += `Paketmetadaten: ${metadata.license}. Autor: ${metadata.author || 'nicht angegeben'}. ` +
    `Quelle: ${typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url || 'nicht angegeben'}.\n\n`;
}
notice += '## tessdata_fast deu/eng — Apache-2.0\n\n' +
  fs.readFileSync(path.join(pilot, 'models', 'LICENSE'), 'utf8').trim() + '\n';
fs.writeFileSync(path.join(output, 'THIRD_PARTY_NOTICES.md'), notice, { flag: 'wx' });

if (target === 'windows-x64') {
  const launcher = path.join(root, 'plugins', 'data-secure', 'server', 'native',
    'windows-x64', 'datasecure-sandbox.exe');
  const checksum = launcher.slice(0, -4) + '.sha256';
  verifyNativeArtifact(launcher, checksum);
  fs.copyFileSync(launcher, path.join(output, 'datasecure-ocr-sandbox.exe'), fs.constants.COPYFILE_EXCL);
} else {
  const launcher = process.env.DATASECURE_OCR_POSIX_LAUNCHER;
  if (!launcher || !path.isAbsolute(launcher) || !fs.statSync(launcher).isFile()) {
    throw new Error('OCR_BUNDLE_POSIX_LAUNCHER_MISSING');
  }
  fs.copyFileSync(launcher, path.join(output, 'datasecure-ocr-sandbox'), fs.constants.COPYFILE_EXCL);
  fs.chmodSync(path.join(output, 'datasecure-ocr-sandbox'), 0o755);
}

const inventory = filesBelow(output).map((relative) => ({
  path: relative,
  bytes: fs.statSync(path.join(output, ...relative.split('/'))).size,
  sha256: sha256(path.join(output, ...relative.split('/')))
}));
const manifest = {
  schema: 'data-secure-ocr-runtime-bundle/v1',
  target,
  release_enabled: false,
  contract: 'data-secure-ocr-result/v1',
  models: ['deu', 'eng'],
  components,
  files: inventory
};
fs.writeFileSync(path.join(output, 'bundle-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(`${JSON.stringify({
  target,
  files: inventory.length + 1,
  bytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
  components: components.length,
  release_enabled: false
})}\n`);
