'use strict';

// Compatibility facade for the Standalone product. The shared implementation
// now also serves the deliberately narrower Cowork Office projection.
const core = require('../core/markdown-first-privacy');

module.exports = Object.freeze({
  WIDE_EXTENSIONS: core.WIDE_EXTENSIONS,
  MARKDOWN_FIRST_PRIVACY_EXTENSIONS: core.STANDALONE_EXTENSIONS,
  isWidePrivacyExtension: core.isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension(extension, contentOptions) {
    return core.isMarkdownFirstPrivacyExtension(extension, 'standalone', contentOptions);
  },
  extractWideSourceForPrivacy(bytes, extension, options = {}) {
    if (!options || typeof options !== 'object' || require('node:util').types.isProxy(options))
      throw Object.assign(new Error('SOURCE_EXTRACTION_INVALID'), { code: 'SOURCE_EXTRACTION_INVALID' });
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')))
      throw Object.assign(new Error('SOURCE_EXTRACTION_INVALID'), { code: 'SOURCE_EXTRACTION_INVALID' });
    delete descriptors.productChannel;
    const bound = Object.defineProperties(Object.create(Object.getPrototypeOf(options)), descriptors);
    Object.defineProperty(bound, 'productChannel', { value: 'standalone', enumerable: true });
    return core.extractSourceForPrivacy(bytes, extension, bound);
  }
});
