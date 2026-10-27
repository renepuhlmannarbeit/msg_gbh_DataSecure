'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const serverRoot = path.resolve(__dirname, '..');

// Order and exact bytes define the durable Standalone resume identity.
const STANDALONE_POLICY_FILES = Object.freeze([
  'batch-pseudonym-registry.js',
  'batch-pseudonym-context.js',
  'pii-engine.js',
  'resource-limits.js',
  'core/batch-next-action.js',
  'core/conversion-worker-contract.js',
  'core/document-result-grade.js',
  'core/local-review-model.js',
  'core/markdown-first-privacy.js',
  'core/person-field-policy.js',
  'core/processing-mode.js',
  'core/source-text-codec.js',
  'standalone/anonymized-artifact.js',
  'standalone/anonymized-store.js',
  'gateway/batch-review-publication.js',
  'gateway/standalone-anonymized-batch.js',
  'gateway/content-operation-authority.js',
  'gateway/bound-content-input.js',
  'gateway/content-publication-operation.js',
  'gateway/prepared-registry-commit.js',
  'gateway/prepared-publication.js',
  'gateway/standalone-document-review-store.js',
  'gateway/content-consumer-dependencies.js',
  'gateway/batch-review-policy.js',
  'gateway/standalone-review-choices.js',
  'gateway/compliance.js',
  'gateway/common.js',
  'gateway/orchestrator.js',
  'gateway/privacy-text-operation.js',
  'privacy/base.js',
  'privacy/credential-catalog.js',
  'privacy/credential-catalog.json',
  'privacy/credentials.js',
  'privacy/encoded-identifiers.js',
  'privacy/engine.js',
  'privacy/entities.js',
  'privacy/field-value-coverage.js',
  'privacy/iban-boundary.js',
  'privacy/markdown-literals.js',
  'privacy/numeric-identifier-residual.js',
  'privacy/person-ambiguities.js',
  'privacy/personnel.js',
  'privacy/policy.js',
  'privacy/residual-person-review.js',
  'privacy/source-field-restoration.js',
  'privacy/spans.js',
  'privacy/structured.js',
  'privacy/transform-plan.js'
]);

function calculatePolicyFingerprint(files, options = {}) {
  const root = path.resolve(options.root || serverRoot);
  const io = options.fs || fs;
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    const target = path.resolve(root, ...relative.split('/'));
    if (path.relative(root, target).startsWith('..')) throw new Error('CORE_POLICY_FILE_INVALID');
    const bytes = io.readFileSync(target);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1) throw new Error('CORE_POLICY_FILE_INVALID');
    hash.update(relative, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(bytes);
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

function calculateStandalonePolicyFingerprint(options = {}) {
  return calculatePolicyFingerprint(STANDALONE_POLICY_FILES, options);
}

function packagedStandaloneFingerprint() {
  const receiptPath = path.join(serverRoot, 'standalone-core-policy-fingerprint.json');
  if (!fs.existsSync(receiptPath)) return null;
  const stat = fs.lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 100 || stat.size > 16 * 1024)
    throw new Error('STANDALONE_POLICY_RECEIPT_INVALID');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const expectedFiles = STANDALONE_POLICY_FILES;
  if (receipt?.schema !== 'datasecure-standalone-core-policy/2' ||
      !/^[a-f0-9]{64}$/.test(String(receipt.fingerprint || '')) ||
      !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files) ||
      Object.keys(receipt.files).length !== expectedFiles.length ||
      Object.keys(receipt).sort().join(',') !== 'files,fingerprint,schema')
    throw new Error('STANDALONE_POLICY_RECEIPT_INVALID');
  const aggregate = crypto.createHash('sha256');
  for (const relative of expectedFiles) {
    const expected = receipt.files[relative];
    const bytes = fs.readFileSync(path.join(serverRoot, relative));
    if (!/^[a-f0-9]{64}$/.test(String(expected || '')) ||
        crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('STANDALONE_POLICY_RECEIPT_INVALID');
    aggregate.update(relative, 'utf8').update('\0', 'utf8').update(bytes).update('\0', 'utf8');
  }
  if (aggregate.digest('hex') !== receipt.fingerprint)
    throw new Error('STANDALONE_POLICY_RECEIPT_INVALID');
  return receipt.fingerprint;
}

const PACKAGED_STANDALONE_FINGERPRINT = packagedStandaloneFingerprint();
const STANDALONE_POLICY_FINGERPRINT = PACKAGED_STANDALONE_FINGERPRINT || calculateStandalonePolicyFingerprint();

module.exports = { STANDALONE_POLICY_FILES, STANDALONE_POLICY_FINGERPRINT,
  PACKAGED_STANDALONE_FINGERPRINT, calculatePolicyFingerprint,
  calculateStandalonePolicyFingerprint, packagedStandaloneFingerprint };
