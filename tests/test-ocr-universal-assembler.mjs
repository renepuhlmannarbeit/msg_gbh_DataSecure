import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../scripts/assemble-ocr-runtime.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { portableOcrStatus } = require('../plugins/data-secure/server/portable-ocr');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-universal-sources-'));
const output = path.join(root, 'dist', `test-ocr-universal-${process.pid}`);

function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function makeSource(target) {
  const directory = path.join(temporary, target);
  const launcher = target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox';
  const files = {
    'runtime-worker.mjs': Buffer.from('worker'), 'network-deny.cjs': Buffer.from('deny'),
    'models/deu.traineddata': Buffer.from('deu'), 'models/eng.traineddata': Buffer.from('eng'),
    'THIRD_PARTY_NOTICES.md': Buffer.from('notices'), 'runtime-package.json': Buffer.from('{}'),
    [launcher]: Buffer.from(`launcher-${target}`)
  };
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(directory, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  const manifest = {
    schema: 'data-secure-ocr-runtime-bundle/v1', target, release_enabled: false,
    contract: 'data-secure-ocr-result/v1', models: ['deu', 'eng'],
    components: [{ name: 'runtime', version: '1.0.0', license: 'MIT', license_file: 'LICENSE' }],
    files: Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([relative, data]) => ({
      path: relative, bytes: data.length, sha256: hash(data)
    }))
  };
  fs.writeFileSync(path.join(directory, 'bundle-manifest.json'), JSON.stringify(manifest));
  return directory;
}

try {
  const sources = targets.map(makeSource);
  const { manifest } = assemble(sources, output);
  assert.equal(manifest.schema, 'data-secure-ocr-runtime-bundle/v2');
  assert.equal(manifest.release_enabled, false);
  assert.deepStrictEqual(manifest.targets.map((item) => item.target), targets);
  assert.equal(manifest.files.filter((item) => item.path === 'models/deu.traineddata').length, 1);
  assert.equal(manifest.files.filter((item) => item.path.startsWith('targets/')).length, 4);
  assert.deepStrictEqual(portableOcrStatus({
    runtimeRoot: output, platform: 'linux', arch: 'x64'
  }), { available: false, mode: 'bundled_disabled', reason: 'coverage_unverified', target: 'linux-x64' });

  const changed = path.join(sources[2], 'runtime-worker.mjs');
  fs.writeFileSync(changed, 'different-but-valid');
  const changedManifestFile = path.join(sources[2], 'bundle-manifest.json');
  const changedManifest = JSON.parse(fs.readFileSync(changedManifestFile, 'utf8'));
  const changedItem = changedManifest.files.find((item) => item.path === 'runtime-worker.mjs');
  changedItem.bytes = fs.statSync(changed).size;
  changedItem.sha256 = hash(fs.readFileSync(changed));
  fs.writeFileSync(changedManifestFile, JSON.stringify(changedManifest));
  assert.throws(() => assemble(sources, output), /OCR_UNIVERSAL_SHARED_CONTENT_DIFFERS_macos-arm64/u);
  process.stdout.write('Universal OCR assembler: 8 checks passed.\n');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.rmSync(output, { recursive: true, force: true });
}
