'use strict';

// Cowork-only adapter. Standalone has no companion jobs and refuses a package
// that claims one rather than importing the Cowork journal reader.
const { readEvents } = require('./job-store');
const { installCompanionReleaseVerifier } = require('../gateway/package-store');

installCompanionReleaseVerifier(readEvents);
