import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, LIMITS, OcrContractError, normalizeOcrResult } from '../native/ocr/pilot/ocr-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; process.stdout.write(`  ✓ ${name}\n`); }
  catch (error) { process.stderr.write(`  ✗ ${name}\n`); throw error; }
}
function page(overrides = {}) {
  return {
    text: 'Alice Example\r\nHealth IT', confidence: 94.6,
    blocks: [{ paragraphs: [{ lines: [
      { words: [
        { text: 'Alice', confidence: 98.2, bbox: { x0: 10.2, y0: 5.8, x1: 51.1, y1: 25.2 } },
        { text: 'Example', confidence: 67.2, bbox: { x0: 55, y0: 6, x1: 120, y1: 25 } }
      ] },
      { words: [
        { text: 'Health', confidence: 96, bbox: { x0: 10, y0: 40, x1: 60, y1: 60 } },
        { text: 'IT', confidence: 99, bbox: { x0: 65, y0: 40, x1: 80, y1: 60 } }
      ] }
    ] }] }], ...overrides
  };
}
function expectCode(code, fn) {
  assert.throws(fn, (error) => error instanceof OcrContractError && error.code === code);
}

process.stdout.write('OCR result contract\n');
test('normalizes mixed-language words, confidence and half-open pixel boxes', () => {
  const result = normalizeOcrResult(page(), { width: 200, height: 100, languages: ['eng', 'deu', 'eng'] });
  assert.equal(result.schema, 'data-secure-ocr-result/v1');
  assert.equal(result.status, 'recognized');
  assert.deepStrictEqual(result.languages, ['deu', 'eng']);
  assert.equal(result.text, 'Alice Example\nHealth IT');
  assert.equal(result.confidence, 95);
  assert.deepStrictEqual(result.words[0], {
    index: 0, line_index: 0, text: 'Alice', confidence: 98,
    bbox: { x0: 10, y0: 5, x1: 52, y1: 26 }
  });
  assert.equal(result.words[2].line_index, 1);
  assert.deepStrictEqual(result.quality, {
    requires_visual_review: true,
    reasons: ['NON_TEXTUAL_MEANING_UNVERIFIED', 'OCR_LOW_CONFIDENCE_PRESENT']
  });
});
test('keeps a valid empty result fail-closed for visual review', () => {
  const result = normalizeOcrResult({ text: '', confidence: 0, blocks: [] },
    { width: 1, height: 1, languages: ['deu'] });
  assert.equal(result.status, 'empty');
  assert.deepStrictEqual(result.quality.reasons, ['NON_TEXTUAL_MEANING_UNVERIFIED', 'OCR_EMPTY']);
});
test('does not discard low-confidence words', () => {
  const result = normalizeOcrResult(page(), { width: 200, height: 100, languages: ['deu', 'eng'] });
  assert.equal(result.words.find((word) => word.text === 'Example').confidence, 67);
  assert.equal(result.words.length, 4);
});
test('rejects text without explicitly requested positioned block output', () => {
  expectCode('OCR_RESULT_INVALID', () => normalizeOcrResult(
    { text: 'hidden', confidence: 90, blocks: [] }, { width: 10, height: 10, languages: ['deu'] }
  ));
});
test('rejects invalid confidence and out-of-image boxes', () => {
  const invalidConfidence = page();
  invalidConfidence.blocks[0].paragraphs[0].lines[0].words[0].confidence = Number.NaN;
  expectCode('OCR_RESULT_INVALID', () => normalizeOcrResult(invalidConfidence,
    { width: 200, height: 100, languages: ['deu', 'eng'] }));
  const invalidBox = page();
  invalidBox.blocks[0].paragraphs[0].lines[0].words[0].bbox.x1 = 201;
  expectCode('OCR_RESULT_INVALID', () => normalizeOcrResult(invalidBox,
    { width: 200, height: 100, languages: ['deu', 'eng'] }));
});
test('enforces the shared decoded-pixel bound', () => {
  expectCode('OCR_INPUT_LIMIT', () => normalizeOcrResult(
    { text: '', confidence: 0, blocks: [] },
    { width: LIMITS.maxPixels + 1, height: 1, languages: ['deu'] }
  ));
});
test('publishes only the fixed content-free error-code vocabulary', () => {
  assert.deepStrictEqual(ERROR_CODES, [
    'OCR_INPUT_INVALID', 'OCR_INPUT_LIMIT', 'OCR_MODEL_UNAVAILABLE',
    'OCR_MODEL_INTEGRITY_FAILED', 'OCR_BACKEND_UNAVAILABLE', 'OCR_TIMEOUT',
    'OCR_RESOURCE_LIMIT', 'OCR_OUTPUT_LIMIT', 'OCR_RESULT_INVALID',
    'OCR_NETWORK_POLICY_FAILED', 'OCR_CANCELLED'
  ]);
  for (const code of ERROR_CODES) assert.doesNotMatch(code, /[\\/:]|alice|example/iu);
});
test('machine-readable schema is strict and carries every normalized field', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'canonical', 'contracts',
    'ocr-result-v1.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'data-secure-ocr-result/v1');
  assert.equal(schema.properties.quality.properties.requires_visual_review.const, true);
  assert.equal(schema.properties.words.maxItems, LIMITS.maxWords);
  assert.equal(schema.properties.text.maxLength, LIMITS.maxTextChars);
});
process.stdout.write(`${passed} OCR contract tests passed.\n`);
