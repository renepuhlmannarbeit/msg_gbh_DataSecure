'use strict';

// Standalone's byte-only static PNG leaf. The narrow own 8-bit decoder remains
// unchanged for other consumers. A native fallback is reached ONLY after the
// complete source/chunk/CRC/zlib/scanline check, never after a decoder failure.
// PNG 3: https://www.w3.org/TR/png-3/ (critical chunks and Adam7 scanlines).
const zlib = require('node:zlib');
const { ImageSafetyError, MAX_IMAGE_BYTES, MAX_PIXELS } = require('../images/common');
const { decodePng } = require('../images/png');
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CHANNELS = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });
const DEPTHS = Object.freeze({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] });
const ADAM7 = Object.freeze([[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]);
// These ancillary records are CRC/extent/order checked but deliberately NOT
// passed into the native codec. Like the existing own decoder, this leaf reads
// sample values, not text metadata/ICC profiles/EXIF or animation instructions.
const ANCILLARY = new Set(['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV', 'cLLI',
  'bKGD', 'hIST', 'pHYs', 'sPLT', 'tIME', 'tEXt', 'zTXt', 'iTXt', 'eXIf']);
const BEFORE_PALETTE = new Set(['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV', 'cLLI']);
const BEFORE_DATA = new Set([...BEFORE_PALETTE, 'bKGD', 'hIST', 'pHYs', 'sPLT']);
const REPEATABLE = new Set(['sPLT', 'tEXt', 'zTXt', 'iTXt', 'fcTL', 'fdAT']);
class PngRasterError extends ImageSafetyError {
  constructor(code) { super(code); this.code = code; }
}
class PngUnsupportedFeatureError extends PngRasterError {
  constructor(feature) { super('PNG_FEATURE_UNSUPPORTED'); this.feature = feature; }
}
const invalid = () => { throw new PngRasterError('CONVERSION_IMAGE_INVALID'); };
const limit = () => { throw new PngRasterError('CONVERSION_PIXEL_LIMIT'); };
let table;
function crc32(bytes) {
  table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  let c = 0xffffffff; for (const byte of bytes) c = table[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function scanlines(raw, passes, channels, depth, paletteEntries) {
  let offset = 0;
  for (const pass of passes) {
    if (paletteEntries === null) {
      for (let y = 0; y < pass.height; y++) {
        if (raw[offset] > 4) invalid(); offset += pass.rowBytes + 1;
      }
      continue;
    }
    const bpp = Math.max(1, Math.ceil(channels * depth / 8));
    let previous = Buffer.alloc(pass.rowBytes), current = Buffer.alloc(pass.rowBytes);
    try {
      for (let y = 0; y < pass.height; y++) {
        const filter = raw[offset++]; if (filter > 4) invalid();
        for (let x = 0; x < pass.rowBytes; x++) {
          const a = x >= bpp ? current[x - bpp] : 0, b = previous[x], c = x >= bpp ? previous[x - bpp] : 0;
          current[x] = (raw[offset++] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
        }
        if (paletteEntries !== null) for (let x = 0; x < pass.width; x++) {
          const sample = depth === 8 ? current[x] : (current[(x * depth) >>> 3] >>> (8 - depth - x * depth % 8)) & ((1 << depth) - 1);
          if (sample >= paletteEntries) invalid();
        }
        [previous, current] = [current, previous];
      }
    } finally { previous.fill(0); current.fill(0); }
  }
  if (offset !== raw.length) invalid();
}

function inspectStaticPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) invalid();
  if (bytes.length > MAX_IMAGE_BYTES) throw new PngRasterError('INPUT_FORMAT_LIMIT');
  let cursor = 8, count = 0, header, palette, transparency, ended = false, dataStarted = false, dataEnded = false;
  let width, height, depth, color, interlace, unsupportedFeature;
  const idats = [], seen = new Set(), critical = [];
  while (cursor < bytes.length) {
    if (++count > 10000) limit();
    if (cursor + 12 > bytes.length) invalid();
    const length = bytes.readUInt32BE(cursor), name = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (length > 0x7fffffff || length > bytes.length - cursor - 12 ||
        !bytes.subarray(cursor + 4, cursor + 8).every(value => value >= 65 && value <= 90 || value >= 97 && value <= 122) ||
        !/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(name)) invalid();
    const end = cursor + length + 12, data = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (bytes.readUInt32BE(cursor + 8 + length) !== crc32(bytes.subarray(cursor + 4, cursor + 8 + length))) invalid();
    if (!header && name !== 'IHDR') invalid();
    if (seen.has(name) && !REPEATABLE.has(name) && name !== 'IDAT') invalid();
    seen.add(name);
    if (name !== 'IDAT' && dataStarted) dataEnded = true;
    if (name === 'IHDR') {
      if (header || length !== 13 || cursor !== 8 || data[10] !== 0 || data[11] !== 0 || ![0, 1].includes(data[12])) invalid();
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12];
      if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || !DEPTHS[color]?.includes(depth)) invalid();
      if (width * height > MAX_PIXELS) limit();
      header = data;
    } else if (name === 'PLTE') {
      if (dataStarted || transparency || [0, 4].includes(color) || !length || length % 3 || length > 768 ||
          (color === 3 && length / 3 > 2 ** depth)) invalid();
      palette = data;
    } else if (name === 'tRNS') {
      if (dataStarted || ![0, 2, 3].includes(color) || (color === 0 && length !== 2) ||
          (color === 2 && length !== 6) || (color === 3 && (!palette || !length || length > palette.length / 3))) invalid();
      transparency = data;
    } else if (name === 'IDAT') {
      if (dataEnded || (color === 3 && !palette)) invalid();
      dataStarted = true; idats.push(data);
    } else if (name === 'IEND') {
      if (length || !dataStarted || end !== bytes.length) invalid(); ended = true;
    } else if (['acTL', 'fcTL', 'fdAT'].includes(name)) {
      // Record the typed feature, but still validate all source extents/CRCs.
      // No APNG byte stream ever reaches Canvas, including default-image APNG.
      if (name === 'acTL' && (length !== 8 || dataStarted) || name === 'fcTL' && length !== 26 || name === 'fdAT' && length < 4) invalid();
      unsupportedFeature = 'APNG';
    } else if (ANCILLARY.has(name)) {
      if ((BEFORE_DATA.has(name) && dataStarted) || (BEFORE_PALETTE.has(name) && palette) ||
          (name === 'hIST' && (!palette || length !== palette.length / 3 * 2)) ||
          (name === 'bKGD' && (length !== (color === 3 ? 1 : [0, 4].includes(color) ? 2 : 6) ||
            color === 3 && (!palette || data[0] >= palette.length / 3))) ||
          (name === 'pHYs' && (length !== 9 || data[8] > 1)) ||
          (name === 'gAMA' && (length !== 4 || !data.readUInt32BE(0))) ||
          (name === 'cHRM' && length !== 32) || (name === 'sRGB' && (length !== 1 || data[0] > 3)) ||
          (name === 'tIME' && length !== 7)) invalid();
      if (name === 'sBIT' && (length !== (color === 3 ? 3 : CHANNELS[color]) ||
          [...data].some(value => value < 1 || value > (color === 3 ? 8 : depth)))) invalid();
      if (['tEXt', 'zTXt', 'iTXt', 'iCCP', 'sPLT'].includes(name)) {
        const zero = data.indexOf(0); if (zero < 1 || zero > 79) invalid();
      }
    } else unsupportedFeature ||= (name.charCodeAt(0) & 32) ? 'UNKNOWN_ANCILLARY' : 'UNKNOWN_CRITICAL';
    if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(name)) {
      if (name === 'tRNS' && color !== 3 && depth < 16) {
        // PNG 3 ignores unused high sample bits. Normalize only those ignored
        // bits so a native backend cannot turn a valid low-depth key opaque.
        const normalized = Buffer.from(bytes.subarray(cursor, end)), mask = 2 ** depth - 1;
        for (let i = 0; i < length; i += 2) normalized.writeUInt16BE(data.readUInt16BE(i) & mask, 8 + i);
        normalized.writeUInt32BE(crc32(normalized.subarray(4, 8 + length)), 8 + length); critical.push(normalized);
      } else critical.push(bytes.subarray(cursor, end));
    }
    cursor = end;
    if (ended) break;
  }
  if (!ended || cursor !== bytes.length || !idats.length || (color === 3 && !palette) || seen.has('iCCP') && seen.has('sRGB')) invalid();
  // A concatenated/extra zlib stream is not pixel data. Bound decompression to
  // the exact pass lengths before native code can allocate or interpret it.
  const passes = (interlace ? ADAM7 : [[0, 0, 1, 1]]).map(([x, y, dx, dy]) => ({
    width: width <= x ? 0 : Math.ceil((width - x) / dx), height: height <= y ? 0 : Math.ceil((height - y) / dy)
  })).filter(pass => pass.width && pass.height).map(pass => ({ ...pass, rowBytes: Math.ceil(pass.width * CHANNELS[color] * depth / 8) }));
  const expected = passes.reduce((sum, pass) => sum + (pass.rowBytes + 1) * pass.height, 0);
  let raw;
  try {
    const compressed = Buffer.concat(idats), result = zlib.inflateSync(compressed, { maxOutputLength: expected, info: true });
    raw = result.buffer;
    if (raw.length !== expected || result.engine.bytesWritten !== compressed.length) invalid();
    scanlines(raw, passes, CHANNELS[color], depth, color === 3 ? palette.length / 3 : null);
  } catch (error) {
    if (error instanceof PngRasterError) throw error;
    invalid();
  } finally { raw?.fill(0); }
  if (unsupportedFeature) throw new PngUnsupportedFeatureError(unsupportedFeature);
  return { width, height, depth, color, interlace, ownSubset: depth === 8 && interlace === 0 && color !== 3,
    // Native receives a private static pixel-only reconstruction. Metadata,
    // ICC/EXIF/text and any caller mutation after await cannot reach the codec.
    nativeBytes: Buffer.concat([SIGNATURE, ...critical]) };
}

async function decodeRasterPng(bytes, api) {
  const plan = inspectStaticPng(bytes);
  try {
    if (plan.ownSubset) {
      try { return decodePng(bytes); } finally { plan.nativeBytes.fill(0); }
    }
    // Explicitly typed feature dispatch, not catch-all decoder-error recovery.
    throw new PngUnsupportedFeatureError('SUPPORTED_STATIC_VARIANT');
  } catch (error) {
    if (!(error instanceof PngUnsupportedFeatureError) || error.feature !== 'SUPPORTED_STATIC_VARIANT') throw error;
  }
  if (typeof api?.loadImage !== 'function' || typeof api?.createCanvas !== 'function') {
    plan.nativeBytes.fill(0);
    throw new PngRasterError('CONVERSION_POLICY_FAILED');
  }
  let canvas;
  try {
    const image = await api.loadImage(plan.nativeBytes);
    if (image.width !== plan.width || image.height !== plan.height) invalid();
    canvas = api.createCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, plan.width, plan.height);
    context.drawImage(image, 0, 0, plan.width, plan.height);
    return { width: plan.width, height: plan.height, rgba: context.getImageData(0, 0, plan.width, plan.height).data };
  } catch (error) {
    if (error instanceof PngRasterError) throw error;
    invalid();
  } finally { plan.nativeBytes.fill(0); if (canvas) { canvas.width = 1; canvas.height = 1; } }
}

module.exports = Object.freeze({ inspectStaticPng, decodeRasterPng, PngRasterError, PngUnsupportedFeatureError });
