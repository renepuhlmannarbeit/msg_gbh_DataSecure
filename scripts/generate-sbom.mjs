// Deterministic SPDX 2.3 inventory for verified self-contained product ZIPs.
// MCPB may be added only with --engineering; disabled OCR/SEA artefacts are
// never treated as product runtime dependencies.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readContract, sha256 } from './lib/bundled-runtime.mjs';
import { verifyUatInventory } from './lib/cowork-candidate.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'BUILD_INFO.json'), 'utf8'));
const contract = readContract(root);
if (pkg.version !== buildInfo.version) throw new Error('SBOM_VERSION_MISMATCH');

function productArguments() {
  const result = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] !== '--archive') continue;
    const value = process.argv[++index];
    if (!value) throw new Error('SBOM_ARCHIVE_ARGUMENT_MISSING');
    const resolved = path.resolve(value);
    if (path.dirname(resolved) !== dist || !resolved.endsWith('.zip')) throw new Error('SBOM_ARCHIVE_PATH_UNSAFE');
    result.push(resolved);
  }
  if (result.length) return [...new Set(result)];
  const host = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
    : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
      : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
  if (!host) throw new Error('SBOM_ARCHIVE_HOST_UNSUPPORTED');
  return [path.join(dist, `DataSecure-Privacy-Preflight-${host}-v${pkg.version}.zip`)];
}

function hashes(name, bytes, extra = {}) {
  return { name, sha1: crypto.createHash('sha1').update(bytes).digest('hex'), sha256: sha256(bytes), ...extra };
}

const runtimeTargets = new Set();
const runtimeFiles = [];
const artefacts = productArguments().map((file) => {
  if (!fs.existsSync(file)) throw new Error(`SBOM_PRODUCT_MISSING:${path.basename(file)}`);
  const bytes = fs.readFileSync(file), entries = readZip(bytes);
  const evidenceBytes = entries.get('RUNTIME-EVIDENCE.json');
  const licenseBytes = entries.get('runtime/LICENSE.node.txt');
  if (!evidenceBytes || !licenseBytes) throw new Error('SBOM_SELF_CONTAINED_RUNTIME_MISSING');
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  if (evidence.schema !== 'datasecure-bundled-plugin/v1' || evidence.product_version !== pkg.version ||
      evidence.host_node_required !== false || evidence.runtime_dependency_install !== false ||
      evidence.plugin_command !== contract.plugin_command || !/^[a-f0-9]{40}$/u.test(evidence.source_commit || '') ||
      !Array.isArray(evidence.targets) || !evidence.targets.length) {
    throw new Error('SBOM_RUNTIME_EVIDENCE_INVALID');
  }
  const mcp = JSON.parse(entries.get('.mcp.json') || 'null');
  if (mcp?.mcpServers?.['data-secure-local']?.command !== contract.plugin_command ||
      JSON.stringify(mcp?.mcpServers?.['data-secure-local']?.args) !== JSON.stringify([contract.runtime_entry])) {
    throw new Error('SBOM_PRODUCT_START_COMMAND_INVALID');
  }
  for (const target of evidence.targets) {
    if (!contract.targets.some((item) => item.id === target.target) || target.license_sha256 !== sha256(licenseBytes)) {
      throw new Error('SBOM_RUNTIME_EVIDENCE_INVALID');
    }
    const runtimeName = target.target === 'windows-x64' ? 'runtime/datasecure-node.exe' : `runtime/targets/${target.target}/node`;
    const runtime = entries.get(runtimeName);
    if (!runtime || target.bytes !== runtime.length || target.sha256 !== sha256(runtime)) {
      throw new Error(`SBOM_RUNTIME_HASH_INVALID:${runtimeName}`);
    }
    runtimeTargets.add(target.target);
  }
  const name = path.basename(file);
  runtimeFiles.push(hashes(`${name}!/RUNTIME-EVIDENCE.json`, evidenceBytes, { kind: 'runtime-evidence' }));
  runtimeFiles.push(hashes(`${name}!/runtime/LICENSE.node.txt`, licenseBytes, { kind: 'runtime-license' }));
  return hashes(name, bytes, { kind: 'product-archive', bytes: bytes.length, source_commit: evidence.source_commit });
});
const uatIndex = process.argv.indexOf('--cowork-uat');
if (uatIndex >= 0) {
  const uatArgument = process.argv[uatIndex + 1];
  if (!uatArgument) throw new Error('SBOM_UAT_ARGUMENT_MISSING');
  const uatFile = path.resolve(uatArgument);
  const name = `DataSecure-Cowork-UAT-Evidence-v${pkg.version}.zip`;
  if (path.dirname(uatFile) !== dist || path.basename(uatFile) !== name) throw new Error('SBOM_UAT_PATH_UNSAFE');
  const bytes = fs.readFileSync(uatFile);
  verifyUatInventory(bytes, artefacts, pkg.version);
  artefacts.push(hashes(name, bytes, {kind: 'uat-evidence'}));
}
if (process.argv.includes('--engineering')) {
  const name = `DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`, file = path.join(dist, name);
  if (!fs.existsSync(file)) throw new Error(`SBOM_ENGINEERING_ARTEFACT_MISSING:${name}`);
  artefacts.push(hashes(name, fs.readFileSync(file), { kind: 'engineering-mcpb' }));
}
artefacts.sort((left, right) => left.name.localeCompare(right.name, 'en'));

const nativeInputs = [
  ['plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe', 'native-launcher'],
  ['native/windows/datasecure-sandbox.cpp', 'native-source']
].map(([relative, kind]) => hashes(relative, fs.readFileSync(path.join(root, relative)), { kind }));
const safeId = (name) => `SPDXRef-File-${name.replace(/[^A-Za-z0-9.-]+/gu, '-')}`;
const statusPrefix = 'plugins/data-secure/server/status-app/';
const statusFiles = ['status-card.html', 'artifact.json', 'THIRD_PARTY_NOTICES.md', 'bundled-dependencies.json']
  .map((name) => hashes(statusPrefix + name, fs.readFileSync(path.join(root, statusPrefix, name))));
const statusInventory = JSON.parse(fs.readFileSync(path.join(root, statusPrefix, 'bundled-dependencies.json'), 'utf8'));
if (statusInventory.schema !== 'datasecure-status-app-dependencies/v1' || !statusInventory.dependencies.length) throw new Error('SBOM_STATUS_INVENTORY_INVALID');
const statusPackages = statusInventory.dependencies.map((item) => ({
  name: item.name, SPDXID: `SPDXRef-StatusPackage-${item.name.replace(/[^A-Za-z0-9.-]+/gu, '-')}`,
  versionInfo: item.version, downloadLocation: 'NOASSERTION', filesAnalyzed: false,
  licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION', copyrightText: 'NOASSERTION',
  comment: `Bundled into the default-disabled status card. npm integrity: ${item.integrity}; license SHA-256: ${item.license_sha256}.`
}));
const nodePackage = {
  name: 'Node.js', SPDXID: 'SPDXRef-Package-Node.js', versionInfo: contract.node_version,
  downloadLocation: contract.sources.node_release, filesAnalyzed: false,
  licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION', copyrightText: 'NOASSERTION',
  comment: `Self-contained runtimes for: ${[...runtimeTargets].sort().join(', ')}. The complete upstream LICENSE file is embedded in every product archive.`
};
const packageId = 'SPDXRef-Package-DataSecure';
const containedFiles = [...artefacts, ...statusFiles, nativeInputs.find(({ kind }) => kind === 'native-launcher'), ...runtimeFiles];
const packageVerificationCode = crypto.createHash('sha1').update(containedFiles.map(({ sha1 }) => sha1).sort().join('')).digest('hex');
const created = `${buildInfo.build_date}T00:00:00Z`;
if (!/^\d{4}-\d{2}-\d{2}T00:00:00Z$/u.test(created)) throw new Error('SBOM_BUILD_DATE_INVALID');

const allFiles = [...artefacts, ...nativeInputs, ...statusFiles, ...runtimeFiles];
const sbom = {
  spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
  name: `DataSecure Privacy Preflight ${pkg.version}`,
  documentNamespace: `https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/${encodeURIComponent(pkg.version)}/sbom`,
  creationInfo: { created, creators: ['Tool: DataSecure-SBOM-Generator-2.0'] },
  documentDescribes: [packageId],
  packages: [{
    name: pkg.name, SPDXID: packageId, versionInfo: pkg.version, downloadLocation: 'NOASSERTION',
    filesAnalyzed: true, packageVerificationCode: { packageVerificationCodeValue: packageVerificationCode },
    comment: 'Self-contained Claude Cowork plugin ZIP(s). MCPB, SEA and disabled OCR are Engineering-only and are not product runtime dependencies.',
    licenseConcluded: 'NOASSERTION', licenseDeclared: 'NOASSERTION', copyrightText: 'NOASSERTION'
  }, nodePackage, ...statusPackages],
  files: allFiles.map(({ name, sha1, sha256: digest }) => ({
    fileName: `./${name}`, SPDXID: safeId(name), checksums: [
      { algorithm: 'SHA1', checksumValue: sha1 }, { algorithm: 'SHA256', checksumValue: digest }
    ], licenseConcluded: 'NOASSERTION', copyrightText: 'NOASSERTION'
  })),
  relationships: [
    ...containedFiles.map(({ name }) => ({ spdxElementId: packageId, relationshipType: 'CONTAINS', relatedSpdxElement: safeId(name) })),
    ...statusPackages.map((item) => ({ spdxElementId: safeId(statusPrefix + 'status-card.html'), relationshipType: 'GENERATED_FROM', relatedSpdxElement: item.SPDXID })),
    ...runtimeFiles.filter(({ kind }) => kind === 'runtime-license').map(({ name }) => ({ spdxElementId: safeId(name), relationshipType: 'DESCRIBES', relatedSpdxElement: nodePackage.SPDXID })),
    { spdxElementId: safeId('plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe'), relationshipType: 'GENERATED_FROM', relatedSpdxElement: safeId('native/windows/datasecure-sandbox.cpp') }
  ]
};
const filesById = new Map(sbom.files.map((file) => [file.SPDXID, file]));
const containedSha1 = sbom.relationships.filter((item) => item.spdxElementId === packageId && item.relationshipType === 'CONTAINS')
  .map((item) => filesById.get(item.relatedSpdxElement)?.checksums.find((sum) => sum.algorithm === 'SHA1')?.checksumValue);
if (containedSha1.some((value) => !value) || crypto.createHash('sha1').update(containedSha1.sort().join('')).digest('hex') !== packageVerificationCode) {
  throw new Error('SBOM_PACKAGE_VERIFICATION_CODE_INVALID');
}

fs.mkdirSync(dist, { recursive: true });
const sbomName = `DataSecure-Privacy-Preflight-v${pkg.version}.spdx.json`;
const sbomPath = path.join(dist, sbomName);
fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
const sums = [...artefacts, { name: sbomName, sha256: sha256(fs.readFileSync(sbomPath)) }]
  .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  .map(({ name, sha256: digest }) => `${digest}  ${name}`).join('\n');
fs.writeFileSync(path.join(dist, 'SHA256SUMS'), `${sums}\n`, 'utf8');
console.log(`${sbomPath}\n  products=${artefacts.filter((item) => item.kind === 'product-archive').length}, runtimes=${runtimeTargets.size}, files=${sbom.files.length}\n${path.join(dist, 'SHA256SUMS')}`);
