'use strict';

// Source bytes are never guessed or repaired. Standalone additionally accepts
// UTF-16 only when the source declares its byte order with an exact leading
// BOM. The legacy direct/Cowork UTF-8 contract stays separate.
function sourceTextEncoding(bytes, allowUtf16 = false) {
  if (!Buffer.isBuffer(bytes) || typeof allowUtf16 !== 'boolean') throw new TypeError('TEXT_SOURCE_CODEC_INPUT_INVALID');
  if (allowUtf16 && bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  }
  return 'utf-8';
}

function decodeStandaloneTextSource(bytes) {
  const encoding = sourceTextEncoding(bytes, true);
  let text;
  try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: false }).decode(bytes); }
  catch { throw new Error('TEXT_ENCODING_INVALID'); }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error('TEXT_CONTROL_INVALID');
  return text;
}

module.exports = Object.freeze({ sourceTextEncoding, decodeStandaloneTextSource });
