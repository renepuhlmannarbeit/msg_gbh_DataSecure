import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { readRegular, sha256, verifyTargetEvidence, readContract } from './lib/bundled-runtime.mjs';
import { loadCargoLicenseInventory } from './lib/cargo-license-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const targets = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
  'desktop-targets.json'), 'utf8'));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const productTarget = argument('--target');
const appArgument = argument('--app');
const target = targets.targets.find((candidate) => candidate.product_target === productTarget);
if (!target || !['macos-x64', 'macos-arm64'].includes(productTarget)) {
  throw new Error('STANDALONE_MACOS_TARGET_INVALID');
}
if (!appArgument) throw new Error('STANDALONE_MACOS_APP_REQUIRED');

const appSource = path.resolve(root, appArgument);
if (path.basename(appSource) !== 'DataSecure Standalone.app' || !fs.statSync(appSource).isDirectory()) {
  throw new Error('STANDALONE_MACOS_APP_INVALID');
}

const folderName = `DataSecure-Standalone-${version}-${productTarget}`;
const stageParent = path.join(root, 'dist', `standalone-macos-package-stage-${productTarget}`);
const stage = path.join(stageParent, folderName);
const appRelative = 'DataSecure Standalone.app';
const output = path.join(root, 'dist', target.package_filename);
const executablePaths = new Set([
  `${appRelative}/Contents/MacOS/datasecure-standalone`,
  `${appRelative}/Contents/MacOS/datasecure-core`,
  `${appRelative}/Contents/Resources/server/standalone/conversion-runtime/node`,
  `${appRelative}/Contents/Resources/server/native/${productTarget}/datasecure-sandbox`
]);

function safeResetStage() {
  const resolved = path.resolve(stageParent);
  const dist = path.resolve(root, 'dist');
  if (path.dirname(resolved) !== dist || path.basename(resolved) !== `standalone-macos-package-stage-${productTarget}`) {
    throw new Error('STANDALONE_MACOS_STAGE_UNSAFE');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
}

function copyRegular(source, destination, mode = null) {
  const before = fs.lstatSync(source, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > 256n * 1024n * 1024n) {
    throw new Error('STANDALONE_MACOS_SOURCE_UNSAFE');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const after = fs.lstatSync(source, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      !fs.readFileSync(source).equals(fs.readFileSync(destination))) {
    throw new Error('STANDALONE_MACOS_SOURCE_CHANGED');
  }
  fs.chmodSync(destination, mode ?? Number(before.mode & 0o777n));
}

function copyTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('STANDALONE_MACOS_APP_LINK');
  if (!stat.isDirectory()) throw new Error('STANDALONE_MACOS_APP_ENTRY_INVALID');
  fs.mkdirSync(destination, { mode: stat.mode & 0o777 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyRegular(from, to);
    else throw new Error('STANDALONE_MACOS_APP_ENTRY_INVALID');
  }
}

function inventory(directory, ignored = new Set()) {
  return collectFiles(directory)
    .filter((file) => !ignored.has(file.archivePath))
    .map((file) => {
      const bytes = readRegular(file.fullPath, 256 * 1024 * 1024);
      return { path: file.archivePath, bytes: bytes.length, sha256: sha256(bytes),
        executable: executablePaths.has(file.archivePath) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

safeResetStage();
copyTree(appSource, path.join(stage, appRelative));

const contract = readContract(root);
const runtimeTarget = contract.targets.find((candidate) => candidate.id === productTarget);
if (!runtimeTarget) throw new Error('STANDALONE_MACOS_RUNTIME_TARGET_MISSING');
const runtimeDir = path.join(root, 'dist', productTarget);
const runtime = path.join(runtimeDir, runtimeTarget.launcher);
const runtimeLicense = path.join(runtimeDir, 'LICENSE.node.txt');
const runtimeEvidence = JSON.parse(readRegular(path.join(runtimeDir, 'runtime-evidence.json'), 64 * 1024));
const runtimeBytes = readRegular(runtime, 128 * 1024 * 1024);
const licenseBytes = readRegular(runtimeLicense, 2 * 1024 * 1024);
verifyTargetEvidence(runtimeEvidence, runtimeBytes, licenseBytes, runtimeTarget, contract);

for (const [source, destination] of [
  [runtimeLicense, 'LICENSE.node.txt'],
  [path.join(root, 'LICENSE'), 'LICENSE'],
  [path.join(root, 'apps', 'datasecure-standalone', 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'],
  [path.join(root, 'apps', 'datasecure-standalone', 'MACOS-START.md'), 'MACOS-START.md']
]) copyRegular(source, path.join(stage, destination), 0o600);

const evidence = {
  schema: 'datasecure-standalone-runtime-evidence/1',
  targets: [{ target: productTarget, node_version: contract.node_version,
    archive: runtimeEvidence.archive, archive_sha256: runtimeEvidence.archive_sha256,
    bytes: runtimeEvidence.bytes, sha256: runtimeEvidence.sha256,
    license_bytes: runtimeEvidence.license_bytes, license_sha256: runtimeEvidence.license_sha256,
    runtime_probe: runtimeEvidence.runtime_probe }]
};
fs.writeFileSync(path.join(stage, 'RUNTIME-EVIDENCE.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });

const cargoManifest = path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'Cargo.toml');
const rustLicenses = loadCargoLicenseInventory(cargoManifest, target.rust_target);
fs.writeFileSync(path.join(stage, 'RUST-LICENSE-INVENTORY.json'), `${JSON.stringify(rustLicenses, null, 2)}\n`, { flag: 'wx' });
const conversionPath = path.join(stage, appRelative, 'Contents', 'Resources', 'server', 'standalone', 'conversion-runtime');
const conversion = JSON.parse(fs.readFileSync(path.join(conversionPath, 'RUNTIME.json'), 'utf8'));
if (conversion.target !== productTarget) throw new Error('STANDALONE_MACOS_CONVERSION_TARGET_INVALID');
const sbom = {
  spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
  name: folderName, documentNamespace: `https://internal.msg.example/datasecure/${version}/${productTarget}`,
  creationInfo: { created: '2026-09-04T00:00:00Z', creators: ['Tool: DataSecure standalone macOS package builder'] },
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
      downloadLocation: 'NOASSERTION', filesAnalyzed: false,
      licenseConcluded: 'Apache-2.0', licenseDeclared: 'Apache-2.0' },
    ...rustLicenses.components.map((crate, index) => ({ name: crate.name,
      SPDXID: `SPDXRef-Crate-${index}`, versionInfo: crate.version, downloadLocation: crate.source,
      filesAnalyzed: false, licenseConcluded: crate.license, licenseDeclared: crate.license,
      comment: crate.license_basis === 'cargo_license_file' ? `Lizenzbasis: ${crate.license_file}` : 'Lizenzangabe aus Cargo-Metadaten.' }))
  ]
};
fs.writeFileSync(path.join(stage, 'SBOM.spdx.json'), `${JSON.stringify(sbom, null, 2)}\n`, { flag: 'wx' });

const payload = inventory(stage);
const manifest = {
  schema: 'datasecure-standalone-package/1', product: 'DataSecure Standalone', version,
  target: productTarget, rust_target: target.rust_target, release_status: 'engineering_pilot',
  minimum_system_version: target.minimum_system_version,
  signing: 'adhoc', requires_claude: false, requires_cowork: false,
  requires_node_install: false, requires_rust_install: false, requires_network: false,
  requires_webview2: false, files: payload
};
fs.writeFileSync(path.join(stage, 'STANDALONE-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const hashes = inventory(stage, new Set(['SHA256SUMS']));
fs.writeFileSync(path.join(stage, 'SHA256SUMS'), `${hashes.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`, { flag: 'wx' });

const archiveFiles = collectFiles(stageParent).map((file) => {
  const relative = file.archivePath.slice(folderName.length + 1);
  return { ...file, mode: executablePaths.has(relative) ? 0o100755 : 0o100644 };
});
fs.rmSync(output, { force: true });
fs.rmSync(`${output}.sha256`, { force: true });
const archive = writeZip(output, archiveFiles);
const zipBytes = readRegular(output, 768 * 1024 * 1024);
fs.writeFileSync(`${output}.sha256`, `${crypto.createHash('sha256').update(zipBytes).digest('hex')}  ${path.basename(output)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ok: true, output, sha256: sha256(zipBytes), ...archive })}\n`);
