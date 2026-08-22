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
  assert.match(text, /\| eigener gepinnter PDFium-Build \| offen \| offen \| offen \|/u);
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

done();
