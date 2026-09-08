'use strict';

// Compatibility facade for the Standalone product. The shared implementation
// now also serves the deliberately narrower Cowork Office projection.
const core = require('../core/markdown-first-privacy');

module.exports = Object.freeze({
  WIDE_EXTENSIONS: core.WIDE_EXTENSIONS,
  MARKDOWN_FIRST_PRIVACY_EXTENSIONS: core.STANDALONE_EXTENSIONS,
  isWidePrivacyExtension: core.isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension(extension) {
    return core.isMarkdownFirstPrivacyExtension(extension, 'standalone');
  },
  extractWideSourceForPrivacy(bytes, extension, options = {}) {
    return core.extractSourceForPrivacy(bytes, extension, { ...options, productChannel: 'standalone' });
  }
});
