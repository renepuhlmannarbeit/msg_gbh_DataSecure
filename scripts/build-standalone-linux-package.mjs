import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { readRegular, sha256, verifyTargetEvidence, readStandaloneRuntimeContract } from './lib/bundled-runtime.mjs';
import { loadCargoLicenseInventory } from './lib/cargo-license-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const targets = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
  'desktop-targets.json'), 'utf8'));
const productTarget = 'linux-x64-glibc';
const target = targets.targets.find((candidate) => candidate.product_target === productTarget);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const appImageArgument = argument('--appimage');
if (!target || !appImageArgument) throw new Error('STANDALONE_LINUX_APPIMAGE_REQUIRED');
const appImageSource = path.resolve(root, appImageArgument);
const appImageBytes = readRegular(appImageSource, 512 * 1024 * 1024);
if (!path.basename(appImageSource).endsWith('.AppImage') ||
    !appImageBytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
  throw new Error('STANDALONE_LINUX_APPIMAGE_INVALID');
}

const folderName = `DataSecure-Standalone-${version}-${productTarget}`;
const stageParent = path.join(root, 'dist', `standalone-linux-package-stage-${productTarget}`);
const stage = path.join(stageParent, folderName);
const appImageRelative = 'DataSecure Standalone.AppImage';
const output = path.join(root, 'dist', target.package_filename);

function safeResetStage() {
  const resolved = path.resolve(stageParent), dist = path.resolve(root, 'dist');
  if (path.dirname(resolved) !== dist || path.basename(resolved) !== `standalone-linux-package-stage-${productTarget}`) {
    throw new Error('STANDALONE_LINUX_STAGE_UNSAFE');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
}

function writeFile(relative, bytes, mode = 0o600) {
  const destination = path.join(stage, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode });
}

function inventory(ignored = new Set()) {
  return collectFiles(stage).filter((file) => !ignored.has(file.archivePath)).map((file) => {
    const bytes = readRegular(file.fullPath, 512 * 1024 * 1024);
    return { path: file.archivePath, bytes: bytes.length, sha256: sha256(bytes),
      executable: file.archivePath === appImageRelative };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

safeResetStage();
writeFile(appImageRelative, appImageBytes, 0o700);
for (const [source, destination] of [
  [path.join(root, 'LICENSE'), 'LICENSE'],
  [path.join(root, 'apps', 'datasecure-standalone', 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'],
  [path.join(root, 'apps', 'datasecure-standalone', 'LINUX-START.md'), 'LINUX-START.md']
]) writeFile(destination, readRegular(source, 2 * 1024 * 1024));

const contract = readStandaloneRuntimeContract(root);
const runtimeTarget = contract.targets.find((candidate) => candidate.id === productTarget);
if (!runtimeTarget) throw new Error('STANDALONE_LINUX_RUNTIME_TARGET_MISSING');
const runtimeDirectory = path.join(root, 'dist', productTarget);
const runtimeBytes = readRegular(path.join(runtimeDirectory, runtimeTarget.launcher), 128 * 1024 * 1024);
const licenseBytes = readRegular(path.join(runtimeDirectory, 'LICENSE.node.txt'), 2 * 1024 * 1024);
const runtimeEvidence = JSON.parse(readRegular(path.join(runtimeDirectory, 'runtime-evidence.json'), 64 * 1024));
verifyTargetEvidence(runtimeEvidence, runtimeBytes, licenseBytes, runtimeTarget, contract);
writeFile('LICENSE.node.txt', licenseBytes);
writeFile('RUNTIME-EVIDENCE.json', Buffer.from(`${JSON.stringify({
  schema: 'datasecure-standalone-runtime-evidence/1', targets: [runtimeEvidence]
}, null, 2)}\n`));

const rustLicenses = loadCargoLicenseInventory(
  path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'Cargo.toml'), target.rust_target);
writeFile('RUST-LICENSE-INVENTORY.json', Buffer.from(`${JSON.stringify(rustLicenses, null, 2)}\n`));
const conversion = JSON.parse(readRegular(path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract',
  'generated-runtime', 'server', 'standalone', 'conversion-runtime', 'RUNTIME.json'), 4 * 1024 * 1024));
if (conversion.target !== productTarget) throw new Error('STANDALONE_LINUX_CONVERSION_TARGET_INVALID');
const sbom = {
  spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
  name: folderName, documentNamespace: `https://internal.msg.example/datasecure/${version}/${productTarget}`,
  creationInfo: { created: '2026-09-04T00:00:00Z', creators: ['Tool: DataSecure standalone Linux package builder'] },
  packages: [
    { name: 'DataSecure Standalone', SPDXID: 'SPDXRef-DataSecure', versionInfo: version,
      downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: 'LicenseRef-Proprietary', licenseDeclared: 'LicenseRef-Proprietary' },
    { name: 'Node.js', SPDXID: 'SPDXRef-Nodejs', versionInfo: contract.node_version,
      downloadLocation: `https://nodejs.org/dist/v${contract.node_version}/${runtimeTarget.archive}`,
      checksums: [{ algorithm: 'SHA256', checksumValue: runtimeEvidence.archive_sha256 }],
      filesAnalyzed: false, licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION' },
    ...conversion.packages.map((item, index) => ({ name: item.name,
      SPDXID: `SPDXRef-Conversion-${index}`, versionInfo: item.version, downloadLocation: 'NOASSERTION',
      filesAnalyzed: false, licenseConcluded: item.license, licenseDeclared: item.license })),
    { name: 'tessdata-fast', SPDXID: 'SPDXRef-Tessdata', versionInfo: '4.1.0',
      downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: 'Apache-2.0', licenseDeclared: 'Apache-2.0' },
    ...rustLicenses.components.map((crate, index) => ({ name: crate.name,
      SPDXID: `SPDXRef-Crate-${index}`, versionInfo: crate.version, downloadLocation: crate.source,
      filesAnalyzed: false, licenseConcluded: crate.license, licenseDeclared: crate.license }))
  ]
};
writeFile('SBOM.spdx.json', Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`));
const payload = inventory();
const manifest = {
  schema: 'datasecure-standalone-package/1', product: 'DataSecure Standalone', version,
  target: productTarget, rust_target: target.rust_target, release_status: 'engineering_pilot',
  distribution_format: target.distribution_format, minimum_glibc_version: target.minimum_glibc_version,
  signing: 'unsigned', requires_claude: false, requires_cowork: false,
  requires_node_install: false, requires_rust_install: false, requires_network: false,
  files: payload
};
writeFile('STANDALONE-MANIFEST.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
const hashes = inventory(new Set(['SHA256SUMS']));
writeFile('SHA256SUMS', Buffer.from(`${hashes.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`));

const archiveFiles = collectFiles(stageParent).map((file) => {
  const relative = file.archivePath.slice(folderName.length + 1);
  return { ...file, mode: relative === appImageRelative ? 0o100755 : 0o100644 };
});
fs.rmSync(output, { force: true });
fs.rmSync(`${output}.sha256`, { force: true });
const archive = writeZip(output, archiveFiles, { maximumFileBytes: 512 * 1024 * 1024 });
const zipBytes = readRegular(output, 768 * 1024 * 1024);
const digest = crypto.createHash('sha256').update(zipBytes).digest('hex');
fs.writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ok: true, output, sha256: digest, ...archive })}\n`);
