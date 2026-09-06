import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { readRegular, sha256, verifyTargetEvidence, readContract } from './lib/bundled-runtime.mjs';
import { writeStandaloneRuntime } from './lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from './lib/standalone-conversion-runtime.mjs';
import { loadCargoLicenseInventory } from './lib/cargo-license-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const productTarget = 'windows-x64';
const rustTarget = 'x86_64-pc-windows-msvc';
const folderName = `DataSecure-Standalone-${version}-${productTarget}`;
const stageParent = path.join(root, 'dist', 'standalone-package-stage');
const stage = path.join(stageParent, folderName);
const output = path.join(root, 'dist', `${folderName}.zip`);

function safeResetStage() {
  const resolved = path.resolve(stageParent);
  const dist = path.resolve(root, 'dist');
  if (path.dirname(resolved) !== dist || path.basename(resolved) !== 'standalone-package-stage') {
    throw new Error('STANDALONE_STAGE_UNSAFE');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
}

function copyFile(source, relative, mode = 0o600) {
  const bytes = readRegular(source, 160 * 1024 * 1024);
  const destination = path.join(stage, ...relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode });
}

function copyCargoExecutable(source, relative) {
  const before = fs.statSync(source, { bigint: true });
  if (!before.isFile() || before.size < 1024n || before.size > 64n * 1024n * 1024n) {
    throw new Error('STANDALONE_EXECUTABLE_UNSAFE');
  }
  const destination = path.join(stage, relative);
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const after = fs.statSync(source, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      !fs.readFileSync(source).equals(fs.readFileSync(destination))) {
    throw new Error('STANDALONE_EXECUTABLE_CHANGED');
  }
}

function inventory(directory, ignored = new Set()) {
  return collectFiles(directory)
    .filter((file) => !ignored.has(file.archivePath))
    .map((file) => {
      const bytes = readRegular(file.fullPath, 160 * 1024 * 1024);
      return { path: file.archivePath, bytes: bytes.length, sha256: sha256(bytes),
        executable: file.archivePath.endsWith('.exe') };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

safeResetStage();
const executable = path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'target', 'release', 'datasecure-standalone.exe');
const runtimeDir = path.join(root, 'dist', productTarget);
const runtime = path.join(runtimeDir, 'datasecure-node.exe');
const runtimeLicense = path.join(runtimeDir, 'LICENSE.node.txt');
const runtimeEvidence = JSON.parse(readRegular(path.join(runtimeDir, 'runtime-evidence.json'), 64 * 1024));
const contract = readContract(root);
const target = contract.targets.find((candidate) => candidate.id === productTarget);
const runtimeBytes = readRegular(runtime, 128 * 1024 * 1024);
const licenseBytes = readRegular(runtimeLicense, 2 * 1024 * 1024);
verifyTargetEvidence(runtimeEvidence, runtimeBytes, licenseBytes, target, contract);

copyCargoExecutable(executable, 'DataSecure Standalone.exe');
copyFile(runtime, `datasecure-core-${rustTarget}.exe`, 0o700);
// Build the closed runtime projection from the current source tree. Packaging
// must never trust a possibly stale generated-runtime directory left by an
// earlier desktop build.
writeStandaloneRuntime(
  path.join(root, 'plugins', 'data-secure', 'server'),
  path.join(stage, 'server'),
  productTarget
);
writeConversionRuntime(root, path.join(stage, 'server', 'standalone', 'conversion-runtime'), productTarget);
copyFile(runtimeLicense, 'LICENSE.node.txt');
copyFile(path.join(root, 'LICENSE'), 'LICENSE');
copyFile(path.join(root, 'apps', 'datasecure-standalone', 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md');
copyFile(path.join(root, 'apps', 'datasecure-standalone', 'START-WINDOWS.md'), 'START-WINDOWS.md');

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
const rustLicenses = loadCargoLicenseInventory(cargoManifest, rustTarget);
fs.writeFileSync(path.join(stage, 'RUST-LICENSE-INVENTORY.json'), `${JSON.stringify(rustLicenses, null, 2)}\n`, { flag: 'wx' });
const sbom = {
  spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
  name: folderName, documentNamespace: `https://internal.msg.example/datasecure/${version}/${productTarget}`,
  creationInfo: { created: '2026-09-04T00:00:00Z', creators: ['Tool: DataSecure standalone package builder'] },
  packages: [
    { name: 'DataSecure Standalone', SPDXID: 'SPDXRef-DataSecure', versionInfo: version,
      downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: 'LicenseRef-Proprietary', licenseDeclared: 'LicenseRef-Proprietary' },
    { name: 'Node.js', SPDXID: 'SPDXRef-Nodejs', versionInfo: contract.node_version,
      downloadLocation: `https://nodejs.org/dist/v${contract.node_version}/${target.archive}`,
      checksums: [{ algorithm: 'SHA256', checksumValue: runtimeEvidence.archive_sha256 }],
      filesAnalyzed: false, licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION' },
    ...JSON.parse(fs.readFileSync(path.join(stage, 'server', 'standalone', 'conversion-runtime', 'RUNTIME.json'), 'utf8')).packages
      .map((item, index) => ({ name: item.name, SPDXID: `SPDXRef-Conversion-${index}`, versionInfo: item.version,
        downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: item.license, licenseDeclared: item.license })),
    { name: 'tessdata-fast', SPDXID: 'SPDXRef-Tessdata', versionInfo: '4.1.0', downloadLocation: 'NOASSERTION',
      filesAnalyzed: false, licenseConcluded: 'Apache-2.0', licenseDeclared: 'Apache-2.0' },
    ...rustLicenses.components.map((crate, index) => ({ name: crate.name, SPDXID: `SPDXRef-Crate-${index}`,
      versionInfo: crate.version, downloadLocation: crate.source, filesAnalyzed: false,
      licenseConcluded: crate.license, licenseDeclared: crate.license,
      comment: crate.license_basis === 'cargo_license_file' ? `Lizenzbasis: ${crate.license_file}` : 'Lizenzangabe aus Cargo-Metadaten.' }))
  ]
};
fs.writeFileSync(path.join(stage, 'SBOM.spdx.json'), `${JSON.stringify(sbom, null, 2)}\n`, { flag: 'wx' });

const payload = inventory(stage);
const manifest = {
  schema: 'datasecure-standalone-package/1', product: 'DataSecure Standalone', version,
  target: productTarget, rust_target: rustTarget, release_status: 'engineering_pilot',
  requires_claude: false, requires_cowork: false, requires_node_install: false,
  requires_rust_install: false, requires_network: false, requires_webview2: true,
  files: payload
};
fs.writeFileSync(path.join(stage, 'STANDALONE-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const hashes = inventory(stage, new Set(['SHA256SUMS']));
fs.writeFileSync(path.join(stage, 'SHA256SUMS'), `${hashes.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`, { flag: 'wx' });

const archiveFiles = collectFiles(stageParent).map((file) => ({ ...file,
  mode: file.archivePath.endsWith('.exe') ? 0o100755 : 0o100644 }));
fs.rmSync(output, { force: true });
const archive = writeZip(output, archiveFiles);
const zipBytes = readRegular(output, 512 * 1024 * 1024);
fs.writeFileSync(`${output}.sha256`, `${crypto.createHash('sha256').update(zipBytes).digest('hex')}  ${path.basename(output)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, output, sha256: sha256(zipBytes), ...archive })}\n`);
