import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { qualitySourceIdentity } from './benchmark-quality.mjs';
const require = createRequire(import.meta.url);
const { qualityHasFindings, summarizeQuality } = require('../benchmarks/evaluate-quality');

// An engineering regression gate, not a legal or human acceptance certificate.
// Partial executions, unassessed OCR and missing final outputs must stay red.
export function qualityGateFailures(report, expected) {
  const failures = [];
  if (!report || report.schema !== 'datasecure-quality-report/1' || !Array.isArray(report.results)) return ['QUALITY_REPORT_INVALID'];
  if (report.synthetic_only !== true || report.review_decisions !== 'synthetic-reference-bound') failures.push('QUALITY_REFERENCE_CONTRACT_INVALID');
  if (report.runtime_cleanup !== 'confirmed') failures.push('QUALITY_WORKER_CLEANUP_UNCONFIRMED');
  const expectedFiles = new Set(expected.files || []);
  if (!report.full_corpus_executed || report.corpus_selection !== 'all-formats' || report.results.length !== expected.variants ||
      new Set(report.results.map(result => result.file)).size !== expected.variants ||
      expectedFiles.size !== expected.variants || report.results.some(result => !expectedFiles.has(result.file))) failures.push('QUALITY_CORPUS_INCOMPLETE');
  if (report.version !== expected.version || report.target !== expected.target ||
      report.core_policy_fingerprint !== expected.core_policy_fingerprint ||
      report.runtime_sha256 !== expected.runtime_sha256 ||
      typeof expected.conversion_runtime_sha256 !== 'string' ||
      report.conversion_runtime_sha256 !== expected.conversion_runtime_sha256 ||
      JSON.stringify(report.evaluation_sha256) !== JSON.stringify(expected.evaluation_sha256) ||
      report.reference_sha256 !== expected.reference_sha256) failures.push('QUALITY_REPORT_STALE');
  try {
    const summary = summarizeQuality(report.results);
    if (JSON.stringify(report.summary) !== JSON.stringify(summary)) failures.push('QUALITY_SUMMARY_MISMATCH');
    if (qualityHasFindings({ ...report, summary })) failures.push('QUALITY_FINDINGS_OPEN');
  } catch { failures.push('QUALITY_REPORT_INVALID'); }
  return [...new Set(failures)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: check-quality-gate.mjs local-QUALITAET.json');
  const reportPath = path.resolve(process.argv[2]);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const referencePath = path.join(path.dirname(path.dirname(reportPath)), 'REFERENZ.json');
  const referenceBytes = fs.readFileSync(referencePath);
  const reference = JSON.parse(referenceBytes);
  if (reference.schema !== 'datasecure-quality-reference/1' || reference.synthetic_only !== true ||
      reference.logical_documents !== 60 || reference.variants !== 72 || !Array.isArray(reference.entries) ||
      reference.entries.length !== 72 || new Set(reference.entries.map(entry => entry.file)).size !== 72) {
    throw new Error('QUALITY_CORPUS_INVALID');
  }
  const target = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? `macos-${process.arch}` : 'linux-x64-glibc';
  const expected = { ...qualitySourceIdentity(target), target, variants: reference.variants, files: reference.entries.map(entry => entry.file),
    version: require('../package.json').version,
    core_policy_fingerprint: require('../plugins/data-secure/server/core-policy-fingerprint').calculateCorePolicyFingerprint(),
    reference_sha256: require('node:crypto').createHash('sha256').update(referenceBytes).digest('hex') };
  const failures = qualityGateFailures(report, expected);
  // Only opaque codes on stdout. Source-bearing findings remain local.
  process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, scope: 'synthetic-engineering-only', failures })}\n`);
  if (failures.length) process.exitCode = 1;
}
