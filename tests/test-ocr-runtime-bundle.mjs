import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || (process.platform === 'win32' ? 'windows-x64' : null);
if (!target) throw new Error('OCR_BUNDLE_TEST_TARGET_REQUIRED');
const bundle = path.join(root, 'dist', 'ocr-runtime', target);
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'bundle-manifest.json'), 'utf8'));
assert.equal(manifest.schema, 'data-secure-ocr-runtime-bundle/v1');
assert.equal(manifest.target, target);
assert.equal(manifest.release_enabled, false);
assert.equal(manifest.contract, 'data-secure-ocr-result/v1');
assert.deepStrictEqual(manifest.models, ['deu', 'eng']);
assert.equal(manifest.components.length, 13);
assert.ok(manifest.components.every((item) => item.name !== '@napi-rs/canvas'));
assert.ok(manifest.components.every((item) => item.license_file));
assert.equal(manifest.components.find((item) => item.name === 'tr46').license_file,
  'fallback:tr46-0.0.3-MIT.txt');
const paths = new Set();
for (const item of manifest.files) {
  assert.ok(!paths.has(item.path));
  paths.add(item.path);
  assert.ok(!path.isAbsolute(item.path) && !item.path.split('/').includes('..'));
  const file = path.join(bundle, ...item.path.split('/'));
  assert.equal(fs.statSync(file).size, item.bytes);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), item.sha256);
}
for (const required of [
  'runtime-worker.mjs', 'ocr-contract.mjs', 'network-deny.cjs', 'runtime-package.json',
  'models/deu.traineddata', 'models/eng.traineddata', 'models/LICENSE',
  'THIRD_PARTY_NOTICES.md', 'node_modules/tesseract.js/package.json',
  'node_modules/tesseract.js-core/package.json'
]) assert.ok(paths.has(required), `bundle misses ${required}`);
assert.ok(paths.has(target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox'));
const notices = fs.readFileSync(path.join(bundle, 'THIRD_PARTY_NOTICES.md'), 'utf8');
for (const component of manifest.components) assert.ok(notices.includes(`## ${component.name} ${component.version}`));
assert.ok(notices.includes('## tessdata_fast deu/eng — Apache-2.0'));
assert.ok(notices.includes('Copyright (c) Sebastian Mayr'));
assert.ok(notices.includes('Permission is hereby granted'));
process.stdout.write(`OCR runtime bundle ${target}: ${manifest.files.length + 1} files verified.\n`);
