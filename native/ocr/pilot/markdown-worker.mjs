// Private engineering child: stdin is image bytes, stdout one bounded response.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import contract from '../../../plugins/data-secure/server/standalone/markdown-contract.js';
import imageLimits from '../../../plugins/data-secure/server/images/common.js';
import png from '../../../plugins/data-secure/server/images/png.js';
import bmp from '../../../plugins/data-secure/server/images/bmp.js';

const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const fixedCodes = new Set(['OCR_INPUT_INVALID', 'OCR_INPUT_LIMIT', 'OCR_SOURCE_TYPE_UNSUPPORTED',
  'OCR_IMAGE_INVALID', 'OCR_BACKEND_UNAVAILABLE', 'OCR_MODEL_UNAVAILABLE', 'OCR_MODEL_INTEGRITY_FAILED',
  'OCR_NETWORK_POLICY_FAILED', 'OCR_EXTRACTION_FAILED', 'OCR_OUTPUT_INVALID', 'TEXT_TOO_LARGE']);
const diagnostic = (code) => process.stderr.write(`${code}\n`);

function verifyLocalModels() {
  let inventory;
  try { inventory = JSON.parse(fs.readFileSync(path.join(directory, 'models.lock.json'), 'utf8')); }
  catch { fail('OCR_MODEL_UNAVAILABLE'); }
  for (const language of ['deu', 'eng']) {
    const entry = inventory.models?.[language];
    if (entry?.file !== `${language}.traineddata` || !/^[a-f0-9]{64}$/u.test(entry.sha256)) fail('OCR_MODEL_INTEGRITY_FAILED');
    let data;
    try {
      const file = path.join(directory, 'models', `${language}.traineddata`);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) fail('OCR_MODEL_INTEGRITY_FAILED');
      data = fs.readFileSync(file);
    } catch (error) {
      if (error?.code === 'OCR_MODEL_INTEGRITY_FAILED') throw error;
      fail('OCR_MODEL_UNAVAILABLE');
    }
    if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) fail('OCR_MODEL_INTEGRITY_FAILED');
  }
}

async function convert() {
  if (globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true ||
      !process.permission || process.permission.has('fs.write') ||
      process.env.DISABLE_SYSTEM_FONTS_LOAD !== '1') fail('OCR_NETWORK_POLICY_FAILED');
  const sourceType = process.argv[2];
  if (process.argv.length !== 3 || !['png', 'bmp'].includes(sourceType)) fail('OCR_SOURCE_TYPE_UNSUPPORTED');
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > imageLimits.MAX_IMAGE_BYTES) fail('OCR_INPUT_LIMIT');
    chunks.push(chunk);
  }
  if (length < 1) fail('OCR_INPUT_INVALID');
  let decoded;
  try { decoded = (sourceType === 'png' ? png.decodePng : bmp.decodeBmp)(Buffer.concat(chunks)); }
  catch { fail('OCR_IMAGE_INVALID'); }
  // Re-encode only the bounded decoded pixels. No original metadata or native
  // decoder fallback reaches OCR; transparent pixels are composited on white.
  for (let index = 0; index < decoded.rgba.length; index += 4) {
    const alpha = decoded.rgba[index + 3];
    for (let channel = 0; channel < 3; channel++) {
      decoded.rgba[index + channel] = Math.round((decoded.rgba[index + channel] * alpha + 255 * (255 - alpha)) / 255);
    }
    decoded.rgba[index + 3] = 255;
  }
  verifyLocalModels();
  let createWorker, OEM, createCanvas, ImageData;
  try {
    if (require('tesseract.js/package.json').version !== '7.0.0' ||
        require('@napi-rs/canvas/package.json').version !== '1.0.7') fail('OCR_BACKEND_UNAVAILABLE');
    ({ createWorker, OEM } = require('tesseract.js'));
    ({ createCanvas, ImageData } = require('@napi-rs/canvas'));
  } catch { fail('OCR_BACKEND_UNAVAILABLE'); }
  const canvas = createCanvas(decoded.width, decoded.height);
  canvas.getContext('2d').putImageData(new ImageData(
    new Uint8ClampedArray(decoded.rgba.buffer, decoded.rgba.byteOffset, decoded.rgba.byteLength),
    decoded.width, decoded.height), 0, 0);
  const image = canvas.toBuffer('image/png');
  diagnostic('OCR_WORKER_STARTING');
  const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
    langPath: path.join(directory, 'models'), cacheMethod: 'none', gzip: false,
    logging: false, logger: () => {}, errorHandler: () => {}
  });
  try {
    diagnostic('OCR_WORKER_READY');
    const result = await worker.recognize(image, {}, { text: true });
    const text = result?.data?.text;
    if (typeof text !== 'string') fail('OCR_OUTPUT_INVALID');
    // Preserve exactly the engine's text. The normal anonymizing OCR adapter's
    // normalization and PII processing deliberately do not participate here.
    const reasons = ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'];
    if (!text.trim()) reasons.push('OCR_TEXT_EMPTY');
    return contract.createMarkdownExtraction({ source_type: sourceType, markdown: text,
      coverage: { status: 'incomplete', reason_codes: reasons.sort() } });
  } finally { await worker.terminate(); }
}

function respond(message, code) {
  process.stdout.write(`${JSON.stringify({ schema: 'datasecure-ocr-markdown-response/1', ...message })}\n`,
    () => process.exit(code));
}
process.stdout.on('error', () => process.exit(2));
convert().then((result) => respond({ ok: true, result }, 0), (error) => {
  const code = fixedCodes.has(error?.code) ? error.code : 'OCR_EXTRACTION_FAILED';
  diagnostic(code);
  respond({ ok: false, error_code: code }, 2);
});
