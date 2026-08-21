import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAndValidateLock } from '../scripts/pdfium-spike.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = readAndValidateLock();
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok   ${name}`);
}

console.log('PDFium engineering-spike contract');

test('lock is explicitly non-release and uses an unofficial provenance label', () => {
  assert.equal(lock.purpose, 'engineering-spike-only');
  assert.equal(lock.release_enabled, false);
  assert.equal(lock.distribution.affiliation, 'unofficial-third-party');
});

test('distribution and upstream revisions plus both binary hashes are immutable', () => {
  assert.match(lock.distribution.commit, /^[a-f0-9]{40}$/);
  assert.match(lock.upstream.commit, /^[a-f0-9]{40}$/);
  assert.match(lock.distribution.sha256, /^[a-f0-9]{64}$/);
  assert.match(lock.payload.dll_sha256, /^[a-f0-9]{64}$/);
});

test('V8 and XFA are disabled in the pinned build contract', () => {
  assert.equal(lock.build_contract.pdf_enable_v8, false);
  assert.equal(lock.build_contract.pdf_enable_xfa, false);
  assert.equal(lock.build_contract.is_component_build, false);
});

test('license inventory covers PDFium and bundled codec/runtime notices', () => {
  for (const expected of ['licenses/pdfium.txt', 'licenses/freetype.txt',
    'licenses/icu.txt', 'licenses/libopenjpeg.txt', 'licenses/libjpeg_turbo.md']) {
    assert.ok(lock.required_notices.includes(expected));
  }
});

test('probe is isolated from the product parser and emits no extracted text field', () => {
  const source = fs.readFileSync(path.join(root, 'native', 'windows',
    'datasecure-pdfium-probe.cpp'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server',
    'parser-worker.js'), 'utf8');
  assert.ok(!worker.includes('pdfium'));
  assert.ok(!source.includes('\\"text\\"'));
  assert.ok(source.includes('FPDF_LoadMemDocument64'));
  const pluginRoot = path.join(root, 'plugins', 'data-secure');
  const packagedNames = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else packagedNames.push(path.relative(pluginRoot, full).replaceAll('\\', '/'));
    }
  };
  walk(pluginRoot);
  assert.ok(packagedNames.every((name) => !/pdfium|pdfium-probe/i.test(name)));
  for (const builder of ['build-plugin.mjs', 'build-mcpb.mjs']) {
    const buildSource = fs.readFileSync(path.join(root, 'scripts', builder), 'utf8');
    assert.ok(!buildSource.includes('native/pdfium'));
    assert.ok(!buildSource.includes('datasecure-pdfium-probe'));
  }
});

test('runtime gate remains fail-closed while spike release flag is false', () => {
  const runtime = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server',
    'runtime.js'), 'utf8');
  assert.ok(runtime.includes('PDF_COVERAGE_UNVERIFIED'));
  assert.equal(lock.release_enabled, false);
});

console.log(`PDFium spike contract: ${passed} cases`);
