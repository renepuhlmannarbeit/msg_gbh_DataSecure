'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// This list is intentionally explicit. Adding, removing or changing a shared
// privacy-policy component must change the durable resume identity.
const CORE_POLICY_FILES = Object.freeze([
  'batch-pseudonym-registry.js',
  'batch-pseudonym-context.js',
  'pii-engine.js',
  'resource-limits.js',
  'companion/text-review.js',
  'companion/processor.js',
  'core/batch-next-action.js',
  'core/conversion-worker-contract.js',
  'core/document-result-grade.js',
  'core/markdown-first-privacy.js',
  'core/processing-mode.js',
  'gateway/batch-review-publication.js',
  'gateway/batch-review-policy.js',
  'gateway/compliance.js',
  'gateway/common.js',
  'gateway/orchestrator.js',
  'privacy/base.js',
  'privacy/credential-catalog.js',
  'privacy/credential-catalog.json',
  'privacy/credentials.js',
  'privacy/engine.js',
  'privacy/entities.js',
  'privacy/iban-boundary.js',
  'privacy/person-ambiguities.js',
  'privacy/personnel.js',
  'privacy/policy.js',
  'privacy/residual-person-review.js',
  'privacy/spans.js',
  'privacy/structured.js'
]);

function calculateCorePolicyFingerprint(options = {}) {
  const root = path.resolve(options.root || __dirname);
  const io = options.fs || fs;
  const hash = crypto.createHash('sha256');
  for (const relative of CORE_POLICY_FILES) {
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

const CORE_POLICY_FINGERPRINT = calculateCorePolicyFingerprint();

module.exports = { CORE_POLICY_FILES, CORE_POLICY_FINGERPRINT, calculateCorePolicyFingerprint };
