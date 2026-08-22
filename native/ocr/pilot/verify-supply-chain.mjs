import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pilotDir = path.dirname(fileURLToPath(import.meta.url));
const sbomPath = process.argv[2];
if (!sbomPath) throw new Error('SBOM_PATH_REQUIRED');

const packageLock = JSON.parse(fs.readFileSync(path.join(pilotDir, 'package-lock.json'), 'utf8'));
const modelLock = JSON.parse(fs.readFileSync(path.join(pilotDir, 'models.lock.json'), 'utf8'));
const sbom = JSON.parse(fs.readFileSync(path.resolve(sbomPath), 'utf8'));
const allowedLicenses = new Set(['Apache-2.0', 'MIT', 'BSD-2-Clause']);
const inventory = [];

for (const [location, metadata] of Object.entries(packageLock.packages)) {
  if (!location || !metadata.version) continue;
  assert.ok(metadata.integrity?.startsWith('sha512-'), `PACKAGE_INTEGRITY_MISSING_${location}`);
  assert.ok(allowedLicenses.has(metadata.license), `PACKAGE_LICENSE_NOT_ALLOWED_${location}`);
  inventory.push({
    package: location.replace(/^node_modules\//u, ''),
    version: metadata.version,
    license: metadata.license
  });
}

assert.equal(sbom.bomFormat, 'CycloneDX');
assert.equal(sbom.specVersion, '1.5');
assert.ok(Array.isArray(sbom.components));
for (const required of ['tesseract.js', 'tesseract.js-core', '@napi-rs/canvas']) {
  assert.ok(sbom.components.some((component) => component.name === required),
    `SBOM_COMPONENT_MISSING_${required}`);
}

const modelDir = path.join(pilotDir, 'models');
for (const entry of [...Object.values(modelLock.models), modelLock.license]) {
  const bytes = fs.readFileSync(path.join(modelDir, entry.file));
  assert.equal(bytes.length, entry.bytes, `MODEL_FILE_SIZE_MISMATCH_${entry.file}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256,
    `MODEL_FILE_HASH_MISMATCH_${entry.file}`);
}

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  evidence_kind: 'ocr-pilot-supply-chain-not-product-release',
  platform: `${process.platform}-${process.arch}`,
  cyclonedx_spec: sbom.specVersion,
  package_components: inventory.length,
  licenses: [...new Set(inventory.map((item) => item.license))].sort(),
  package_integrity_complete: true,
  model_commit: modelLock.commit,
  model_license: modelLock.license.spdx,
  model_hashes_verified: true,
  release_decision: 'no_go',
  passed_gates: [],
  open_work: [
    'redistributable-runtime-bundle',
    'complete-notice-text-inventory',
    'vulnerability-policy',
    'isolated-resource-bounded-worker',
    'fresh-plugin-package'
  ]
}, null, 2)}\n`);
