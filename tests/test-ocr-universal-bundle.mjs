import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUniversalManifest } from '../scripts/lib/ocr-universal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'plugins', 'data-secure', 'server', 'ocr-runtime');
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'bundle-manifest.json'), 'utf8'));
assert.doesNotThrow(() => validateUniversalManifest(manifest, { releaseEnabled: false }));
assert.equal(manifest.schema, 'data-secure-ocr-runtime-bundle/v2');
assert.equal(manifest.target, 'universal');
assert.equal(manifest.release_enabled, false);
assert.equal(manifest.contract, 'data-secure-ocr-result/v1');
assert.deepStrictEqual(manifest.models, ['deu', 'eng']);
assert.equal(manifest.components.length, 13);
assert.deepStrictEqual(manifest.targets.map((item) => item.target),
  ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']);
const paths = new Set();
for (const item of manifest.files) {
  assert.ok(!paths.has(item.path));
  paths.add(item.path);
  const file = path.join(bundle, ...item.path.split('/'));
  assert.equal(fs.statSync(file).size, item.bytes);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), item.sha256);
}
for (const required of ['runtime-worker.mjs', 'network-deny.cjs', 'models/deu.traineddata',
  'models/eng.traineddata', 'THIRD_PARTY_NOTICES.md']) assert.ok(paths.has(required));
for (const item of manifest.targets) assert.ok(paths.has(item.launcher));
assert.equal([...paths].filter((item) => item === 'models/deu.traineddata').length, 1);
assert.ok(manifest.files.reduce((sum, item) => sum + item.bytes, 0) < 65 * 1024 * 1024);
for (const mutate of [
  (value) => { value.unexpected = true; },
  (value) => { value.components[0].unexpected = true; },
  (value) => { value.files.push({ ...value.files[0] }); },
  (value) => { value.targets[0].source_manifest_sha256 = '0'.repeat(63); },
  (value) => { value.models = ['eng', 'deu']; }
]) {
  const changed = structuredClone(manifest);
  mutate(changed);
  assert.throws(() => validateUniversalManifest(changed, { releaseEnabled: false }), /OCR_UNIVERSAL_/u);
}
process.stdout.write(`Universal OCR runtime: ${manifest.files.length + 1} files verified.\n`);
