'use strict';
// Explicit test process preload, never a runtime dependency or environment
// feature in the product. The caller chooses this file with --require.
const fs = require('node:fs'), path = require('node:path');
const manifest = process.env.DATASECURE_TEST_OWNERSHIP_MANIFEST;
const server = process.env.DATASECURE_TEST_OWNERSHIP_SERVER;
if (!manifest || !server || !path.isAbsolute(manifest) || !path.isAbsolute(server)) throw Error('OWNERSHIP_TEST_CONFIG_INVALID');
const artifact = JSON.parse(fs.readFileSync(manifest, 'utf8')).verified_artifact;
require(path.join(server, 'core/ownership-control.js')).configureOwnershipControl(artifact);
