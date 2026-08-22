'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Milestone-zero architecture contracts');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'docs', 'canonical', 'contracts', name), 'utf8');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('batch snapshot contract fixes originals, private copies and crash semantics', () => {
  const text = read('BATCH_SNAPSHOT_V1.md');
  for (const required of [
    'BL-011.1', 'Originale', 'Arbeitskopien', 'atomar', 'SHA-256', 'fsync',
    'Symlink', 'Reparse-Point', '14 Tagen', 'Rechnerneustart', 'höchstens ein Stapel'
  ]) assert.ok(text.includes(required), `snapshot contract missing: ${required}`);
  assert.match(text, /Originalpfad wird nicht erneut geöffnet/u);
  assert.match(text, /Quellpfade werden nicht[\s\S]*Antworten geschrieben/u);
});

test('pseudonym contract is restart-stable without a raw mapping table', () => {
  const text = read('BATCH_PSEUDONYM_V1.md');
  for (const required of [
    'BL-030.1', '256-Bit', 'HMAC-SHA-256', 'DPAPI', 'Keychain', 'Secret Service',
    'Base32', '14 Tagen', 'Rohwert und Platzhalter', 'Rechnerneustart'
  ]) assert.ok(text.includes(required), `pseudonym contract missing: ${required}`);
  assert.match(text, /Klartext-Fallback ist verboten/u);
  assert.match(text, /Zwischen Stapeln.*keine stabile Verknüpfung/u);
});

test('PDF and OCR stay blocked until every platform risk cell is proven', () => {
  const text = read('PDF_OCR_RISK_GATE_V1.md');
  for (const platform of ['Windows', 'macOS', 'Linux']) assert.ok(text.includes(platform));
  for (const risk of ['PDFium', 'Offline', 'Unicode', 'Verschlüsselung', 'Fuzzing', 'SBOM']) {
    assert.ok(text.includes(risk), `PDF/OCR gate missing: ${risk}`);
  }
  assert.match(text, /\| gepinnte gepflegte PDF-Engine und Lieferkette \| offen \| offen \| offen \|/u);
  assert.match(text, /Bis jede Pflichtzelle positiv belegt ist.*gesperrt/su);
});

test('PDF/OCR risk sources and the four required runner targets are pinned', () => {
  const lock = readJson('native/pdfium/pdf-ocr-risk.lock.json');
  assert.strictEqual(lock.release_enabled, false);
  assert.strictEqual(lock.pdf.repository, 'https://pdfium.googlesource.com/pdfium');
  assert.strictEqual(lock.ocr_candidate.repository, 'https://github.com/tesseract-ocr/tesseract');
  assert.deepStrictEqual(lock.ocr_candidate.models.languages, ['deu', 'eng']);
  assert.deepStrictEqual(lock.platforms.map((item) => item.id), [
    'windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'
  ]);
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pdf-ocr-risk.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `risk workflow missing ${runner}`);
  }
  assert.match(workflow, /Community PDFium spike became releasable/u);
});

test('PDF.js pilot is locked, offline, non-release and tested on four runner targets', () => {
  const pilotPackage = readJson('native/pdfjs/pilot/package.json');
  assert.deepStrictEqual(pilotPackage.dependencies, {
    '@napi-rs/canvas': '1.0.7',
    'pdfjs-dist': '6.2.108'
  });
  const pilotLock = readJson('native/pdfjs/pilot/package-lock.json');
  assert.strictEqual(pilotLock.lockfileVersion, 3);
  assert.match(pilotLock.packages['node_modules/pdfjs-dist'].integrity, /^sha512-/u);
  assert.match(pilotLock.packages['node_modules/@napi-rs/canvas'].integrity, /^sha512-/u);
  const source = fs.readFileSync(path.join(root, 'native', 'pdfjs', 'pilot', 'run.mjs'), 'utf8');
  for (const token of ['data: bytes', 'isEvalSupported: false', 'disableAutoFetch: true',
    'useWorkerFetch: false', "release_decision: 'no_go'", 'networkAttempts']) {
    assert.ok(source.includes(token), `PDF.js pilot missing safeguard ${token}`);
  }
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows',
    'pdfjs-stack-pilot.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `PDF.js pilot workflow missing ${runner}`);
  }
  assert.match(workflow, /npm ci --prefix native\/pdfjs\/pilot --ignore-scripts/u);
  assert.doesNotMatch(workflow, /curl|wget|Invoke-WebRequest/iu);
});

test('Tesseract.js pilot is locked to verified local models and four runner targets', () => {
  const pilotPackage = readJson('native/ocr/pilot/package.json');
  assert.deepStrictEqual(pilotPackage.dependencies, {
    '@napi-rs/canvas': '1.0.7',
    'tesseract.js': '7.0.0'
  });
  const pilotLock = readJson('native/ocr/pilot/package-lock.json');
  assert.strictEqual(pilotLock.lockfileVersion, 3);
  for (const dependency of ['tesseract.js', 'tesseract.js-core', '@napi-rs/canvas']) {
    assert.match(pilotLock.packages[`node_modules/${dependency}`].integrity, /^sha512-/u);
  }

  const models = readJson('native/ocr/pilot/models.lock.json');
  assert.strictEqual(models.raw_base,
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast');
  assert.strictEqual(models.commit, '65727574dfcd264acbb0c3e07860e4e9e9b22185');
  assert.deepStrictEqual(models.license, {
    file: 'LICENSE',
    spdx: 'Apache-2.0',
    bytes: 11358,
    sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
  });
  assert.deepStrictEqual(Object.keys(models.models), ['deu', 'eng']);
  assert.strictEqual(models.models.deu.sha256,
    '19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d');
  assert.strictEqual(models.models.eng.sha256,
    '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2');

  const fetchSource = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'fetch-models.mjs'), 'utf8');
  for (const token of ['raw.githubusercontent.com', 'MODEL_SOURCE_NOT_ALLOWLISTED',
    'MODEL_HASH_', "flag: 'wx'"]) {
    assert.ok(fetchSource.includes(token), `OCR model fetch missing safeguard ${token}`);
  }
  const source = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot', 'run.mjs'), 'utf8');
  for (const token of ["langPath: modelDir", "cacheMethod: 'none'", 'gzip: false',
    "release_decision: 'no_go'", "product_image_gate: 'OCR_COVERAGE_UNVERIFIED'"]) {
    assert.ok(source.includes(token), `OCR pilot missing safeguard ${token}`);
  }
  const networkDeny = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'network-deny.cjs'), 'utf8');
  for (const token of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns',
    'globalThis.fetch']) assert.ok(networkDeny.includes(token), `network deny missing ${token}`);
  const supplyChain = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'verify-supply-chain.mjs'), 'utf8');
  for (const token of ["'Apache-2.0', 'MIT', 'BSD-2-Clause'", 'PACKAGE_INTEGRITY_MISSING_',
    'PACKAGE_LICENSE_NOT_ALLOWED_', "sbom.bomFormat, 'CycloneDX'", 'model_hashes_verified']) {
    assert.ok(supplyChain.includes(token), `OCR supply-chain check missing ${token}`);
  }
  const isolated = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'isolated-run.mjs'), 'utf8');
  for (const token of ['windows_job_object', 'node_permission_process', '--permission',
    '--allow-worker', '--allow-addons', '--max-old-space-size=512',
    'OCR_ISOLATION_TIMEOUT', 'OCR_ISOLATION_OUTPUT_LIMIT', 'verifyNativeLauncherArtifact',
    "passed_gates: ["]) {
    assert.ok(isolated.includes(token), `OCR isolated pilot missing safeguard ${token}`);
  }
  assert.doesNotMatch(isolated, /\.\.\.process\.env/u);
  assert.match(isolated, /stdio: \['ignore', 'pipe', 'ignore'\]/u);

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows',
    'tesseractjs-ocr-pilot.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `OCR pilot workflow missing ${runner}`);
  }
  assert.match(workflow, /npm ci --prefix native\/ocr\/pilot --ignore-scripts/u);
  assert.match(workflow, /NODE_OPTIONS: --require=/u);
  assert.match(workflow, /npm sbom --prefix native\/ocr\/pilot --package-lock-only --sbom-format cyclonedx/u);
  assert.match(workflow, /verify-supply-chain\.mjs/u);
  assert.match(workflow, /isolated-run\.mjs/u);
});

done();
