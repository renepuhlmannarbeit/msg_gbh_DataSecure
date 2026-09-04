// DS-065: legacy credential experiments live under tests/legacy, outside the
// Marketplace source. Reject their return rather than silently shipping a
// different product through Marketplace and the ZIP/MCPB archives.
import fs from 'node:fs';
import { collectFiles } from './zip.mjs';

const legacyFiles = new Set([
  'server/gateway/installation-secret-store.js',
  'server/gateway/private-artifact-runtime.js',
  'server/batch-secret-store.js'
]);

function excludedEngineeringFile(normalized) {
  return normalized === 'server/ocr-runtime' || normalized.startsWith('server/ocr-runtime/') ||
    normalized === 'server/ocr-runtime.provenance.json' ||
    normalized === 'server/ocr-session-harness.js' ||
    normalized === 'server/parallel-preparation-harness.js' ||
    normalized === 'server/sea-background-probe.js' ||
    normalized === 'server/sea-parent-parser-probe.js' ||
    normalized === 'server/sea-batch-probe.js' ||
    normalized === 'server/sea-batch-probe-fixtures.js' ||
    normalized === 'server/standalone' || normalized.startsWith('server/standalone/') ||
    normalized === 'server/converters/markitdown' ||
    normalized.startsWith('server/converters/markitdown/');
}

export function includeInEngineering(name) {
  const normalized = String(name).replaceAll('\\', '/').toLowerCase();
  return includeInProduct(normalized) || excludedEngineeringFile(normalized);
}

export function includeInProduct(name) {
  const normalized = String(name).replaceAll('\\', '/').toLowerCase();
  return !legacyFiles.has(normalized) && normalized !== 'server/vendor/keyring' &&
    !normalized.startsWith('server/vendor/keyring/') &&
    // OCR and MarkItDown remain closed engineering pilots. Disabled runtime or
    // bridge files must not change the current end-user product inventory.
    !excludedEngineeringFile(normalized);
}

export function collectProductFiles(directory) {
  const files = collectFiles(directory);
  for (const file of files) {
    const normalized = file.archivePath.replaceAll('\\', '/').toLowerCase();
    if (!includeInProduct(file.archivePath) && !excludedEngineeringFile(normalized)) {
      throw new Error(`PRODUCT_KEYRING_FILE_FORBIDDEN:${file.archivePath}`);
    }
  }
  return files.filter((file) => includeInProduct(file.archivePath));
}

function verifyKeyringFreeEntries(entries, include) {
  for (const [name, value] of entries) {
    const normalized = String(name).replaceAll('\\', '/');
    const canonical = normalized.toLowerCase();
    if (!include(normalized) || /(?:^|\/)keyring[^/]*\.node$/iu.test(normalized)) {
      throw new Error(`PRODUCT_KEYRING_FILE_FORBIDDEN:${normalized}`);
    }
    // Reject also renamed wrappers and reintroduced native dependency imports.
    // Historical explanatory documentation is not executable runtime.
    if (!canonical.startsWith('server/')) continue;
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const utf8 = bytes.toString('utf8').toLowerCase();
    const utf16 = bytes.toString('utf16le').toLowerCase();
    for (const marker of ['@napi-rs/keyring', 'installation-secret-store',
      'private-artifact-runtime', 'batch-secret-store',
      'de.msg.datasecure.private-artifacts.v1']) {
      if (utf8.includes(marker) || utf16.includes(marker)) {
        throw new Error(`PRODUCT_KEYRING_REFERENCE_FORBIDDEN:${normalized}`);
      }
    }
  }
  return Object.freeze({ ok: true, native_keyring_required: false });
}

export function verifyKeyringFreeProductEntries(entries) {
  return verifyKeyringFreeEntries(entries, includeInProduct);
}

export function verifyKeyringFreeEngineeringEntries(entries) {
  return verifyKeyringFreeEntries(entries, includeInEngineering);
}

export function verifyKeyringFreeProductFiles(files) {
  return verifyKeyringFreeProductEntries(files.map((file) => [file.archivePath, fs.readFileSync(file.fullPath)]));
}
