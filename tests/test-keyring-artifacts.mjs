// Keep the existing test command, but DS-065 now proves native keyring ABSENCE
// from the product projection. Never loads a native module or OS credential.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { includeInProduct, collectProductFiles, verifyKeyringFreeProductEntries,
  verifyKeyringFreeProductFiles } from '../scripts/lib/product-files.mjs';

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
  'server/batch-secret-store.js', 'server/batch-pseudonym-context.js'
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
    'server/gateway/private-artifact-crypto.js']) assert.ok(names.has(name));
  assert.deepStrictEqual(verifyKeyringFreeProductFiles(files), { ok: true, native_keyring_required: false });
});

test('renamed wrappers and native keyring binaries are rejected', () => {
  for (const text of ["require('@napi-rs/keyring')", "require('./installation-secret-store')",
    "require('./private-artifact-runtime')", "const namespace = 'de.msg.datasecure.private-artifacts.v1'"])
    assert.throws(() => verifyKeyringFreeProductEntries(entry('server/renamed.js', text)), /PRODUCT_KEYRING_REFERENCE_FORBIDDEN/u);
  assert.throws(() => verifyKeyringFreeProductEntries(entry('server/native/keyring.other.node')), /PRODUCT_KEYRING_FILE_FORBIDDEN/u);
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
  for (const file of ['build-plugin.mjs', 'build-mcpb.mjs', 'verify-plugin-zip.mjs', 'verify-mcpb.mjs',
    'build-portable-plugin.mjs', 'verify-portable-plugin-zip.mjs', 'build-sea-plugin.mjs']) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.match(source, /lib\/product-files\.mjs/u);
    assert.doesNotMatch(source, /verifyKeyringArtifacts/u);
  }
});

done();
