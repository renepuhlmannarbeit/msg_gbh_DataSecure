'use strict';
class ImageSafetyError extends Error {}
const MAX_IMAGE_BYTES = require('../resource-limits').RESOURCE_LIMITS.MAX_IMAGE_SOURCE_BYTES;
const MAX_PIXELS = 30_000_000;
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
module.exports={ImageSafetyError,MAX_IMAGE_BYTES,MAX_PIXELS,clamp};
