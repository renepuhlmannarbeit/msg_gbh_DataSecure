'use strict';

const { STANDALONE_POLICY_FILES, STANDALONE_POLICY_FINGERPRINT,
  calculateStandalonePolicyFingerprint, packagedStandaloneFingerprint } = require('./core/standalone-policy-fingerprint');

module.exports = {
  CORE_POLICY_FILES: STANDALONE_POLICY_FILES,
  CORE_POLICY_FINGERPRINT: STANDALONE_POLICY_FINGERPRINT,
  STANDALONE_POLICY_FILES,
  STANDALONE_POLICY_FINGERPRINT,
  calculateCorePolicyFingerprint: calculateStandalonePolicyFingerprint,
  calculateStandalonePolicyFingerprint,
  packagedStandaloneFingerprint
};
