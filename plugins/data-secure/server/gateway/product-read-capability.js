'use strict';

// Standalone publishes its local results through its own bound result store.
// Cowork alone grants short-lived model read capabilities for released packages.
const coworkReader = './package-store';
function issueReadCapability(packageId) {
  if (process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone') return {};
  return require(coworkReader).issueReadCapability(packageId);
}

module.exports = { issueReadCapability };
