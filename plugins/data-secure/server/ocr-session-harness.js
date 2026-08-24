'use strict';

// Engineering-only preparatory harness for BL-024.4. It is intentionally not
// imported by the product path: enabling persistent OCR needs native per-frame
// limits and real three-platform evidence first.
const MAX_FRAME_BYTES = 25 * 1024 * 1024;
const MAX_FRAME_PIXELS = 80_000_000;
const RESULT_SCHEMA = 'datasecure-ocr-session-result/v1';

function frameError(code) { const error = new Error(code); error.code = code; return error; }
function encodeFrame(requestId, width, height, image) {
  if (!/^[a-f0-9]{32}$/u.test(String(requestId)) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > MAX_FRAME_PIXELS ||
      !Buffer.isBuffer(image) || !image.length || image.length > MAX_FRAME_BYTES) {
    throw frameError('OCR_SESSION_FRAME_INVALID');
  }
  const header = Buffer.from(JSON.stringify({ schema: 'datasecure-ocr-session-frame/v1', request_id: requestId, width, height }), 'utf8');
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length + 1 + image.length, 0);
  return Buffer.concat([length, header, Buffer.from([0]), image]);
}
function decodeFrame(frame) {
  let header;
  const separator = Buffer.isBuffer(frame) ? frame.indexOf(0, 4) : -1;
  try { header = JSON.parse(frame.subarray(4, separator).toString('utf8')); } catch { header = null; }
  const headerKeys = header && typeof header === 'object' && !Array.isArray(header)
    ? Object.keys(header).sort().join(',')
    : '';
  if (!Buffer.isBuffer(frame) || frame.length < 7 || frame.readUInt32BE(0) !== frame.length - 4 ||
      frame.length > MAX_FRAME_BYTES + 1024 || separator < 5 || separator >= frame.length - 1 ||
      !header || headerKeys !== 'height,request_id,schema,width' ||
      header.schema !== 'datasecure-ocr-session-frame/v1' ||
      !/^[a-f0-9]{32}$/u.test(String(header.request_id)) ||
      !Number.isSafeInteger(header.width) || !Number.isSafeInteger(header.height) ||
      header.width < 1 || header.height < 1 || header.width * header.height > MAX_FRAME_PIXELS ||
      frame.length - separator - 1 > MAX_FRAME_BYTES) {
    throw frameError('OCR_SESSION_FRAME_INVALID');
  }
  return Object.freeze({
    requestId: header.request_id,
    width: header.width,
    height: header.height,
    image: frame.subarray(separator + 1)
  });
}

function createOcrSessionHarness({
  execute,
  validateResult,
  maxFrames = 1,
  maxSessionBytes = MAX_FRAME_BYTES,
  maxSessionMs = 60_000,
  now = () => Date.now()
} = {}) {
  if (typeof execute !== 'function' || typeof validateResult !== 'function' ||
      !Number.isInteger(maxFrames) || maxFrames < 1 ||
      !Number.isSafeInteger(maxSessionBytes) || maxSessionBytes < 1 ||
      !Number.isSafeInteger(maxSessionMs) || maxSessionMs < 1 || typeof now !== 'function') {
    throw new TypeError('OCR_SESSION_HARNESS_INVALID');
  }
  let active = false;
  let closed = false;
  let frames = 0;
  let sessionBytes = 0;
  const startedAt = now();
  const seen = new Set();
  async function request(frame, options = {}) {
    if (closed) throw frameError('OCR_SESSION_CLOSED');
    if (active) { closed = true; throw frameError('OCR_SESSION_SINGLE_FLIGHT'); }
    let decoded;
    try { decoded = decodeFrame(frame); } catch (error) { closed = true; throw error; }
    if (seen.has(decoded.requestId)) { closed = true; throw frameError('OCR_SESSION_REQUEST_REPLAY'); }
    if (sessionBytes + decoded.image.length > maxSessionBytes || now() - startedAt > maxSessionMs) {
      closed = true; throw frameError('OCR_SESSION_RESOURCE_LIMIT');
    }
    if (options.signal?.aborted) { closed = true; throw frameError('OCR_SESSION_ABORTED'); }
    seen.add(decoded.requestId);
    active = true;
    try {
      const response = await execute(Object.freeze({
        requestId: decoded.requestId,
        width: decoded.width,
        height: decoded.height,
        image: decoded.image
      }));
      if (options.signal?.aborted) throw frameError('OCR_SESSION_ABORTED');
      if (!response || typeof response !== 'object' || Array.isArray(response) ||
          Object.keys(response).sort().join(',') !== 'request_id,result,schema' ||
          response.schema !== RESULT_SCHEMA || response.request_id !== decoded.requestId) {
        throw frameError('OCR_SESSION_RESPONSE_MISMATCH');
      }
      validateResult(response.result);
      frames++;
      sessionBytes += decoded.image.length;
      if (frames >= maxFrames) closed = true;
      return response.result;
    } catch (error) {
      closed = true;
      throw error;
    } finally { active = false; }
  }
  return Object.freeze({
    request,
    close: () => { closed = true; },
    status: () => ({ active, closed, frames, sessionBytes })
  });
}
module.exports = {
  MAX_FRAME_BYTES,
  MAX_FRAME_PIXELS,
  RESULT_SCHEMA,
  encodeFrame,
  decodeFrame,
  createOcrSessionHarness
};
