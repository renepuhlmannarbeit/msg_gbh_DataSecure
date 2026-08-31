// DS-065: legacy credential experiments remain source-test fixtures, never a
// product dependency. Both archives use this same explicit source projection.
import fs from 'node:fs';
import { collectFiles } from './zip.mjs';

const legacyFiles = new Set([
  'server/gateway/installation-secret-store.js',
  'server/gateway/private-artifact-runtime.js',
  'server/batch-secret-store.js',
  'server/batch-pseudonym-context.js'
]);

export function includeInProduct(name) {
  const normalized = String(name).replaceAll('\\', '/').toLowerCase();
  return !legacyFiles.has(normalized) && normalized !== 'server/vendor/keyring' &&
    !normalized.startsWith('server/vendor/keyring/');
}

export function collectProductFiles(directory) {
  return collectFiles(directory).filter((file) => includeInProduct(file.archivePath));
}

export function verifyKeyringFreeProductEntries(entries) {
  for (const [name, value] of entries) {
    const normalized = String(name).replaceAll('\\', '/');
    if (!includeInProduct(normalized) || /(?:^|\/)keyring[^/]*\.node$/iu.test(normalized)) {
      throw new Error(`PRODUCT_KEYRING_FILE_FORBIDDEN:${normalized}`);
    }
    // Reject also renamed wrappers and reintroduced native dependency imports.
    // Historical explanatory documentation is not executable runtime.
    if (!normalized.startsWith('server/')) continue;
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    for (const marker of ['@napi-rs/keyring', 'installation-secret-store',
      'private-artifact-runtime', 'de.msg.datasecure.private-artifacts.v1']) {
      if (bytes.includes(Buffer.from(marker)) || bytes.includes(Buffer.from(marker, 'utf16le'))) {
        throw new Error(`PRODUCT_KEYRING_REFERENCE_FORBIDDEN:${normalized}`);
      }
    }
  }
  return Object.freeze({ ok: true, native_keyring_required: false });
}

export function verifyKeyringFreeProductFiles(files) {
  return verifyKeyringFreeProductEntries(files.map((file) => [file.archivePath, fs.readFileSync(file.fullPath)]));
}
