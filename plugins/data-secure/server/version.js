'use strict';

// Single source of truth for the runtime version. scripts/set-version.mjs
// propagates the version in package.json to this file and to every manifest;
// tests/test-manifest.js fails the build if any copy drifts.
module.exports = { VERSION: '3.2.0-rc4' };
