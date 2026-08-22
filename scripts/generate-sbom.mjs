// Generates a deterministic SPDX 2.3 SBOM for the two distributable archives.
//
// DataSecure intentionally has no third-party runtime dependencies. The SBOM
// therefore describes the product package and binds it to the exact ZIP/MCPB
// files through SHA-256 checksums. SHA256SUMS is generated separately so an
// operator can verify downloaded release files without an SPDX parser.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'BUILD_INFO.json'), 'utf8'));

if (pkg.version !== buildInfo.version) {
  throw new Error(`version mismatch: package.json=${pkg.version}, BUILD_INFO.json=${buildInfo.version}`);
}

const expectedNames = [
  `DataSecure-Privacy-Preflight-v${pkg.version}.zip`,
  `DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`
];
const artefacts = expectedNames
  .map((name) => {
    const file = path.join(dist, name);
    if (!fs.existsSync(file)) throw new Error(`release artefact missing: ${name}`);
    const bytes = fs.readFileSync(file);
    return {
      name,
      sha1: crypto.createHash('sha1').update(bytes).digest('hex'),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name, 'en'));
const nativeInputs = [
  ['plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe', 'native-launcher'],
  ['native/windows/datasecure-sandbox.cpp', 'native-source']
].map(([relative, kind]) => {
  const bytes = fs.readFileSync(path.join(root, relative));
  return {
    name: relative,
    kind,
    sha1: crypto.createHash('sha1').update(bytes).digest('hex'),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
});

const safeId = (name) => `SPDXRef-File-${name.replace(/[^A-Za-z0-9.-]+/gu, '-')}`;
const packageId = 'SPDXRef-Package-DataSecure';
const containedFiles = [
  ...artefacts,
  nativeInputs.find(({ kind }) => kind === 'native-launcher')
];
const packageVerificationCode = crypto.createHash('sha1')
  .update(containedFiles.map(({ sha1 }) => sha1).sort().join(''))
  .digest('hex');
const created = `${buildInfo.build_date}T00:00:00Z`;
if (!/^\d{4}-\d{2}-\d{2}T00:00:00Z$/u.test(created)) {
  throw new Error(`invalid BUILD_INFO build_date: ${buildInfo.build_date}`);
}

const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `DataSecure Privacy Preflight ${pkg.version}`,
  documentNamespace: `https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/${encodeURIComponent(pkg.version)}/sbom`,
  creationInfo: {
    created,
    creators: ['Tool: DataSecure-SBOM-Generator-1.0']
  },
  documentDescribes: [packageId],
  packages: [{
    name: pkg.name,
    SPDXID: packageId,
    versionInfo: pkg.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: true,
    packageVerificationCode: { packageVerificationCodeValue: packageVerificationCode },
    comment: `Runtime dependency inventory: none; the shipped implementation uses Node.js core modules plus a Windows launcher with statically linked MSVC CRT. Repository source and reviewed binary are linked below; toolchain: ${buildInfo.native_toolchain}.`,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: 'NOASSERTION',
    copyrightText: 'NOASSERTION'
  }],
  files: [...artefacts, ...nativeInputs].map(({ name, sha1, sha256 }) => ({
    fileName: `./${name}`,
    SPDXID: safeId(name),
    checksums: [
      ...(sha1 ? [{ algorithm: 'SHA1', checksumValue: sha1 }] : []),
      { algorithm: 'SHA256', checksumValue: sha256 }
    ],
    licenseConcluded: 'NOASSERTION',
    copyrightText: 'NOASSERTION'
  })),
  relationships: [
    ...artefacts.map(({ name }) => ({
      spdxElementId: packageId,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: safeId(name)
    })),
    {
      spdxElementId: packageId,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: safeId('plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe')
    },
    {
      spdxElementId: safeId('plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe'),
      relationshipType: 'GENERATED_FROM',
      relatedSpdxElement: safeId('native/windows/datasecure-sandbox.cpp')
    }
  ]
};

// Keep SPDX packageVerificationCode aligned with every file declared as
// package content. This catches accidental provenance drift when files or
// relationships are added later.
const filesById = new Map(sbom.files.map((file) => [file.SPDXID, file]));
const containedSha1 = sbom.relationships
  .filter((relationship) => relationship.spdxElementId === packageId &&
    relationship.relationshipType === 'CONTAINS')
  .map((relationship) => filesById.get(relationship.relatedSpdxElement)
    ?.checksums.find((checksum) => checksum.algorithm === 'SHA1')?.checksumValue);
if (containedSha1.some((value) => !value)) throw new Error('SPDX contained file lacks SHA-1');
const verifiedCode = crypto.createHash('sha1').update(containedSha1.sort().join('')).digest('hex');
if (verifiedCode !== packageVerificationCode) throw new Error('SPDX package verification code mismatch');

fs.mkdirSync(dist, { recursive: true });
const sbomName = `DataSecure-Privacy-Preflight-v${pkg.version}.spdx.json`;
const sbomPath = path.join(dist, sbomName);
fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');

const sbomHash = crypto.createHash('sha256').update(fs.readFileSync(sbomPath)).digest('hex');
const checksums = [...artefacts, { name: sbomName, sha256: sbomHash }]
  .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  .map(({ name, sha256 }) => `${sha256}  ${name}`)
  .join('\n');
fs.writeFileSync(path.join(dist, 'SHA256SUMS'), `${checksums}\n`, 'utf8');

console.log(`${sbomPath}\n  files=${artefacts.length + nativeInputs.length}\n${path.join(dist, 'SHA256SUMS')}`);
