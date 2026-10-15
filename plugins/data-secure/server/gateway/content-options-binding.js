'use strict';

// Cryptographic persistence belongs to the local adapter, not the pure core
// contract used by projections and future renderer consumers.
const crypto = require('node:crypto');
const { serializeContentOptions } = require('../core/content-options');
function contentOptionsDigest(value) {
  return crypto.createHash('sha256').update(serializeContentOptions(value), 'utf8').digest('hex');
}
module.exports = Object.freeze({ contentOptionsDigest });
