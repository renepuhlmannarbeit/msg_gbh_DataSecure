// Bind evidence to the byte snapshot actually validated, not a pathname that
// another build may replace. Shared by UAT creation and final release inventory.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function bindVerifiedArchive(bytes, report, {name, version, mode, target}) {
  if (report?.schema !== 'datasecure-product-zip-verification/1' || report.status !== 'NATIVE_PASS' ||
      Object.keys(report).sort().join(',') !== 'bytes,schema,sha256,status' ||
      report.bytes !== bytes.length || report.sha256 !== digest(bytes)) {
    throw new Error('COWORK_UAT_VERIFIED_BYTES_MISMATCH');
  }
  const evidence = JSON.parse(readZip(bytes).get('RUNTIME-EVIDENCE.json') || 'null');
  if (evidence?.product_version !== version || evidence?.mode !== mode ||
      !/^[a-f0-9]{40}$/u.test(evidence.source_commit || '') ||
      !Array.isArray(evidence.targets) || evidence.targets.length !== 1 || evidence.targets[0]?.target !== target) {
    throw new Error('COWORK_UAT_ARTEFACT_EVIDENCE_INVALID');
  }
  return Object.freeze({name, bytes: bytes.length, sha256: report.sha256,
    source_commit: evidence.source_commit, package_verifier: report});
}

export function verifyUatInventory(bytes, products, version) {
  const candidate = JSON.parse(readZip(bytes).get('CANDIDATE.json') || 'null');
  const names = [`DataSecure-Privacy-Preflight-windows-x64-v${version}.zip`,
    `DataSecure-Privacy-Preflight-windows-x64-debug-v${version}.zip`];
  // The Windows UAT template binds exactly two ZIPs. A multi-platform release
  // inventory may additionally contain the two normal Mac ZIPs, but must never
  // treat this Windows native receipt as macOS execution evidence.
  const allowedProducts = new Set([...names,
    `DataSecure-Privacy-Preflight-macos-x64-v${version}.zip`,
    `DataSecure-Privacy-Preflight-macos-arm64-v${version}.zip`]);
  if (candidate?.schema !== 'datasecure-cowork-uat-candidate/2' || candidate.product_version !== version ||
      !/^[a-f0-9]{40}$/u.test(candidate.candidate_commit || '') ||
      candidate.platform !== 'Windows' || candidate.architecture !== 'x64' ||
      candidate.model_gates?.full_matrix_41x3 !== 'NOT_RUN' || candidate.model_gates?.candidate_smoke_12x3 !== 'NOT_RUN' ||
      !Array.isArray(candidate.artifacts) || candidate.artifacts.length !== 2 ||
      !Array.isArray(products) || products.length < 2 || products.length > 4 ||
      new Set(products.map((item) => item?.name)).size !== products.length ||
      products.some((item) => !allowedProducts.has(item?.name) ||
        item.source_commit !== candidate.candidate_commit ||
        !/^[a-f0-9]{64}$/u.test(item.sha256 || '') || !Number.isSafeInteger(item.bytes) || item.bytes < 1) ||
      new Set(candidate.artifacts.map((item) => item?.name)).size !== 2) {
    throw new Error('SBOM_UAT_BINDING_INVALID');
  }
  for (const name of names) {
    const recorded = candidate.artifacts.find((item) => item?.name === name);
    const actual = products.find((item) => item.name === name);
    if (!recorded || !actual || !/^[a-f0-9]{64}$/u.test(actual.sha256 || '') ||
        !Number.isSafeInteger(actual.bytes) || actual.bytes < 1 ||
        recorded.bytes !== actual.bytes || recorded.sha256 !== actual.sha256 ||
        recorded.source_commit !== candidate.candidate_commit || actual.source_commit !== candidate.candidate_commit ||
        recorded.package_verifier?.schema !== 'datasecure-product-zip-verification/1' ||
        recorded.package_verifier.status !== 'NATIVE_PASS' ||
        recorded.package_verifier.sha256 !== actual.sha256 || recorded.package_verifier.bytes !== actual.bytes) {
      throw new Error('SBOM_UAT_BINDING_INVALID');
    }
  }
  return candidate;
}
