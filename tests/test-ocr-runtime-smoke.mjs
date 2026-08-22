import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) throw new Error('OCR_BUNDLE_SMOKE_TARGET_REQUIRED');
const bundle = path.join(root, 'dist', 'ocr-runtime', target);
const launcher = path.join(bundle, target === 'windows-x64'
  ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox');
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
const nodeArgs = [
  '--no-warnings',
  '--permission',
  `--allow-fs-read=${bundle}`,
  '--allow-worker',
  '--disable-proto=throw',
  '--max-old-space-size=512',
  path.join(bundle, 'runtime-worker.mjs')
];
const run = childProcess.spawnSync(launcher, [
  '--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000',
  '--', process.execPath, ...nodeArgs
], {
  input: canvas.toBuffer('image/png'),
  encoding: 'utf8',
  windowsHide: true,
  shell: false,
  timeout: 50_000,
  maxBuffer: 20 * 1024 * 1024,
  env: {
    DATASECURE_OCR_IMAGE_WIDTH: String(canvas.width),
    DATASECURE_OCR_IMAGE_HEIGHT: String(canvas.height),
    NODE_OPTIONS: `--require=${path.join(bundle, 'network-deny.cjs')}`
  }
});
assert.ifError(run.error);
assert.equal(run.status, 0, `bundled OCR exited ${run.status}`);
assert.equal(run.stderr, '');
const result = JSON.parse(run.stdout);
assert.equal(result.schema, 'data-secure-ocr-result/v1');
assert.deepStrictEqual(result.languages, ['deu', 'eng']);
assert.equal(result.quality.requires_visual_review, true);
assert.ok(result.words.length > 8);
for (const expected of ['Projektmanager', 'Alice Example', 'Software Tester',
  'Berlin', 'Example GmbH', 'Health IT']) {
  assert.ok(result.text.includes(expected), `bundle OCR misses ${expected}`);
}
const invalid = childProcess.spawnSync(launcher, [
  '--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000',
  '--', process.execPath, ...nodeArgs
], {
  input: Buffer.alloc(0), encoding: 'utf8', windowsHide: true, shell: false,
  timeout: 50_000, maxBuffer: 64 * 1024,
  env: {
    DATASECURE_OCR_IMAGE_WIDTH: '1', DATASECURE_OCR_IMAGE_HEIGHT: '1',
    NODE_OPTIONS: `--require=${path.join(bundle, 'network-deny.cjs')}`
  }
});
assert.ifError(invalid.error);
assert.equal(invalid.status, 120);
assert.equal(invalid.stdout, '');
assert.equal(invalid.stderr, '');
process.stdout.write(`${JSON.stringify({
  target,
  contract: result.schema,
  words: result.words.length,
  confidence: result.confidence,
  offline: true,
  invalid_input_content_free: true,
  release_enabled: false
})}\n`);
