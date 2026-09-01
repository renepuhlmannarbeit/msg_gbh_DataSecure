// Keep the existing test command, but DS-065 now proves native keyring ABSENCE
// from both the raw Marketplace source and archives. Never loads a native
// module or OS credential.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { includeInProduct, collectProductFiles, verifyKeyringFreeProductEntries,
  verifyKeyringFreeProductFiles } from '../scripts/lib/product-files.mjs';
import { collectFiles } from '../scripts/lib/zip.mjs';
import { verifyKeyringArtifacts } from '../scripts/lib/keyring-artifacts.mjs';

const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers.js');
const { test, done, assert } = createSuite('Keyring-free product artifact projection');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'plugins', 'data-secure');
const entry = (name, text = '') => new Map([[name, Buffer.from(text)]]);

for (const name of [
  'server/vendor/keyring', 'server/vendor/keyring/package.json',
  'server/vendor/keyring/node_modules/@napi-rs/keyring-win32-x64-msvc/keyring.win32-x64-msvc.node',
  'server/gateway/installation-secret-store.js', 'server/gateway/private-artifact-runtime.js',
  'server/batch-secret-store.js'
]) {
  test(`excludes legacy source and archive path ${name}`, () => {
    assert.strictEqual(includeInProduct(name), false);
    assert.strictEqual(includeInProduct(name.replaceAll('/', '\\')), false);
    assert.throws(() => verifyKeyringFreeProductEntries(entry(name)), /PRODUCT_KEYRING_FILE_FORBIDDEN/u);
  });
}

test('current product projection retains plaintext store and its pure path helper', () => {
  const files = collectProductFiles(pluginDir);
  const names = new Set(files.map((file) => file.archivePath));
  for (const name of ['server/index.js', 'server/gateway/private-work-store.js',
    'server/gateway/private-artifact-crypto.js',
    'server/batch-pseudonym-context.js']) assert.ok(names.has(name));
  assert.deepStrictEqual(verifyKeyringFreeProductFiles(files), { ok: true, native_keyring_required: false });
});

test('current keyring-free pseudonym context and imports are valid product code', () => {
  assert.strictEqual(includeInProduct('server/batch-pseudonym-context.js'), true);
  assert.doesNotThrow(() => verifyKeyringFreeProductEntries(entry(
    'server/gateway/batch-intake.js', "require('../batch-pseudonym-context')"
  )));
});

test('development Marketplace source projects to a keyring-free product tree', () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugin = marketplace.plugins.find((value) => value.name === 'data-secure');
  assert.ok(plugin, 'Marketplace plugin registration missing');
  assert.strictEqual(path.resolve(root, plugin.source), pluginDir);
  const rawFiles = collectFiles(path.resolve(root, plugin.source));
  assert.ok(rawFiles.length > 0);
  const productFiles = collectProductFiles(pluginDir);
  assert.deepStrictEqual(verifyKeyringFreeProductFiles(productFiles), { ok: true, native_keyring_required: false });
  const productNames = new Set(productFiles.map((file) => file.archivePath));
  const developmentOnly = rawFiles.filter((file) => !productNames.has(file.archivePath));
  assert.ok(developmentOnly.length > 0, 'The development catalogue must expose its disabled OCR evidence explicitly');
  assert.ok(developmentOnly.every((file) => file.archivePath === 'server/ocr-runtime.provenance.json' ||
    file.archivePath.startsWith('server/ocr-runtime/')),
    'Only the documented disabled OCR bundle may differ from the product projection');
  const sourceMcp = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf8'));
  assert.strictEqual(sourceMcp['data-secure-local'].command, 'node',
    'The relative Marketplace entry is development-only until a self-contained release projection exists');
});

test('reintroduced historical wrappers fail product collection instead of being silently filtered', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-marketplace-projection-'));
  try {
    fs.mkdirSync(path.join(directory, 'server', 'gateway'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'server', 'gateway', 'installation-secret-store.js'),
      'module.exports = {};');
    assert.throws(() => collectProductFiles(directory), /PRODUCT_KEYRING_FILE_FORBIDDEN/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('historical binary fixtures remain outside the Marketplace product with pinned integrity', () => {
  const directory = path.join(root, 'tests', 'legacy', 'keyring', 'vendor', 'keyring');
  assert.ok(!directory.startsWith(`${pluginDir}${path.sep}`));
  assert.doesNotThrow(() => verifyKeyringArtifacts(directory));
  for (const name of ['installation-secret-store.js', 'private-artifact-runtime.js',
    'batch-secret-store.js', 'batch-pseudonym-context.js']) {
    assert.ok(fs.existsSync(path.join(root, 'tests', 'legacy', 'keyring', name)));
  }
});

test('renamed wrappers and native keyring binaries are rejected', () => {
  for (const text of ["require('@napi-rs/keyring')", "require('./installation-secret-store')",
    "require('./private-artifact-runtime')", "require('./batch-secret-store')",
    "const namespace = 'de.msg.datasecure.private-artifacts.v1'"])
    assert.throws(() => verifyKeyringFreeProductEntries(entry('server/renamed.js', text)), /PRODUCT_KEYRING_REFERENCE_FORBIDDEN/u);
  assert.throws(() => verifyKeyringFreeProductEntries(entry('server/native/keyring.other.node')), /PRODUCT_KEYRING_FILE_FORBIDDEN/u);
  assert.throws(() => verifyKeyringFreeProductEntries(entry('Server/renamed.js', "require('@NAPI-RS/KEYRING')")),
    /PRODUCT_KEYRING_REFERENCE_FORBIDDEN/u);
});

test('UTF16 encoded runtime credential reference is rejected', () => {
  assert.throws(() => verifyKeyringFreeProductEntries(new Map([
    ['server/native/renamed.node', Buffer.from('@napi-rs/keyring', 'utf16le')]
  ])), /PRODUCT_KEYRING_REFERENCE_FORBIDDEN/u);
});

test('historical documentation may explain the excluded legacy module', () => {
  assert.doesNotThrow(() => verifyKeyringFreeProductEntries(entry('docs/canonical/DECISIONS.md',
    '@napi-rs/keyring installation-secret-store private-artifact-runtime')));
});

test('ZIP and MCPB build and verify scripts share the same product projection', () => {
  for (const file of ['build-runtime-plugin.mjs', 'build-mcpb.mjs', 'verify-plugin-zip.mjs', 'verify-mcpb.mjs',
    'build-portable-plugin.mjs', 'verify-portable-plugin-zip.mjs', 'build-sea-plugin.mjs']) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.match(source, /lib\/product-files\.mjs/u);
    assert.doesNotMatch(source, /verifyKeyringArtifacts/u);
  }
  const mcpb = fs.readFileSync(path.join(root, 'scripts/build-mcpb.mjs'), 'utf8');
  assert.match(mcpb, /verifyKeyringFreeProductFiles\(collectProductFiles\(pluginDir\)\)/u);
  assert.ok(mcpb.indexOf('verifyKeyringFreeProductFiles(collectProductFiles(pluginDir))') < mcpb.indexOf('fs.mkdtempSync('));
  assert.doesNotMatch(mcpb, /filter:\s*\(source\)\s*=>\s*includeInProduct/u);
});

done();
