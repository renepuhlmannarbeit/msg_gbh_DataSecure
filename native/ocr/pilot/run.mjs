import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, OEM } from 'tesseract.js';

const pilotDir = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(process.env.DATASECURE_OCR_MODEL_DIR || path.join(pilotDir, 'models'));
const canvas = createCanvas(1400, 420);
const context = canvas.getContext('2d');
context.fillStyle = '#ffffff';
context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = '#000000';
context.font = '48px Arial';
context.fillText('Projektmanager Alice Example', 40, 90);
context.fillText('Software Tester in Berlin', 40, 180);
context.fillText('Invoice Example GmbH', 40, 270);
context.fillText('Health IT und Qualität', 40, 360);
const png = canvas.toBuffer('image/png');

const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
  langPath: modelDir,
  cacheMethod: 'none',
  gzip: false,
  logger: () => {}
});

try {
  const result = await worker.recognize(png);
  const normalized = result.data.text.normalize('NFKC');
  for (const expected of ['Projektmanager', 'Alice Example', 'Software Tester',
    'Berlin', 'Example GmbH', 'Health IT']) {
    assert.ok(normalized.includes(expected), `OCR_EXPECTED_TOKEN_MISSING_${expected.replaceAll(' ', '_')}`);
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    story: 'BL-024.1',
    evidence_kind: 'offline-ocr-open-source-pilot-not-product-proof',
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    tesseractjs_version: '7.0.0',
    languages: ['deu', 'eng'],
    local_models: true,
    mixed_language_ocr: true,
    network_policy: 'process-preload-deny',
    mean_confidence: Math.round(result.data.confidence),
    release_decision: 'no_go',
    product_image_gate: 'OCR_COVERAGE_UNVERIFIED',
    passed_gates: [],
    open_work: [
      'model-bundling-and-notices',
      'pixel-redaction-integration',
      'resource-and-process-isolation',
      'scan-pdf-integration',
      'adversarial-layout-corpus',
      'fresh-plugin-package'
    ]
  }, null, 2)}\n`);
} finally {
  await worker.terminate();
}
