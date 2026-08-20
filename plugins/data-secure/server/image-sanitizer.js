'use strict';

// Image primitives used by the visual gate in gateway/visuals.js.
//
// This barrel used to also export sanitizeImageAttachment() from
// images/sanitize.js: a second, never-called implementation of the visual
// release policy with different rules than the one that actually ran. Two
// divergent copies of a security decision is worse than none, so the unused
// copy was removed.

const { ImageSafetyError } = require('./images/common');
const { decodePng, encodePng } = require('./images/png');
const { decodeBmp, encodeBmp } = require('./images/bmp');
const { stripJpegMetadata } = require('./images/jpeg');
const {
  flattenWords,
  entityRects,
  normalizeMime,
  extForMime,
  reencodeMetadataFree,
  redactEditable
} = require('./images/ocr-map');

module.exports = {
  ImageSafetyError,
  decodePng,
  encodePng,
  decodeBmp,
  encodeBmp,
  stripJpegMetadata,
  flattenWords,
  entityRects,
  normalizeMime,
  extForMime,
  reencodeMetadataFree,
  redactEditable
};
