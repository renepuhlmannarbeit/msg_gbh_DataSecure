'use strict';

const { STANDALONE_POLICY_FILES, STANDALONE_POLICY_FINGERPRINT, PACKAGED_STANDALONE_FINGERPRINT, calculatePolicyFingerprint,
  calculateStandalonePolicyFingerprint, packagedStandaloneFingerprint } = require('./core/standalone-policy-fingerprint');

// Preserve the exact historical Cowork file order and durable identity.
const CORE_POLICY_FILES = Object.freeze(STANDALONE_POLICY_FILES.flatMap(relative =>
  relative === 'resource-limits.js'
    ? [relative, 'companion/text-review.js', 'companion/processor.js'] : [relative]));

function calculateCorePolicyFingerprint(options = {}) {
  return calculatePolicyFingerprint(CORE_POLICY_FILES, options);
}

const CORE_POLICY_FINGERPRINT = PACKAGED_STANDALONE_FINGERPRINT || calculateCorePolicyFingerprint();

module.exports = { CORE_POLICY_FILES, CORE_POLICY_FINGERPRINT, STANDALONE_POLICY_FILES,
  STANDALONE_POLICY_FINGERPRINT, calculateCorePolicyFingerprint,
  calculateStandalonePolicyFingerprint, packagedStandaloneFingerprint };
