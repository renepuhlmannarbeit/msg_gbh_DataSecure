'use strict';

// Metadata-only discovery is deliberately larger than the processing envelope.
// Budget the complete admission response and its private envelope below the
// 1-MiB IPC frame, including duplicate labels and ignored metadata artifacts.
module.exports = Object.freeze({ MAX_CATALOGUE_SOURCES: 1000, MAX_CATALOGUE_METADATA_BYTES: 512 * 1024 });
