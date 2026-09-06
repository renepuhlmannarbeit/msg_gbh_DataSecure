// DS-065: legacy credential experiments live under tests/legacy, outside the
// Marketplace source. Reject their return rather than silently shipping a
// different product through Marketplace and the ZIP/MCPB archives.
import fs from 'node:fs';
import path from 'node:path';
import { collectFiles } from './zip.mjs';

const legacyFiles = new Set([
  'server/gateway/installation-secret-store.js',
  'server/gateway/private-artifact-runtime.js',
  'server/batch-secret-store.js'
]);

// The shared journal/result/recovery code imports these modules, including
// lazy controller dependencies. Keep this exact allowlist closed: the native
// converter entrypoint, UI/service and its Node/OCR/PDF resources are not part
// of Cowork. The processing-mode gate still forbids markdown-only in a plugin.
const sharedStandaloneModules = new Set([
  'server/standalone/conversion-runtime-resolver.js',
  'server/standalone/conversion-worker-contract.js',
  'server/standalone/conversion-worker.js',
  'server/standalone/convert-next.js',
  'server/standalone/markdown-artifact.js',
  'server/standalone/markdown-contract.js',
  'server/standalone/markdown-retention.js',
  'server/standalone/markdown-store.js'
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
    normalized === 'server/standalone' || (normalized.startsWith('server/standalone/') && !sharedStandaloneModules.has(normalized)) ||
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
    // Standalone converter payloads and MarkItDown remain excluded from Cowork;
    // only the exact common-core dependencies above may cross the projection.
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
  const selected = files.filter((file) => includeInProduct(file.archivePath));
  verifyProductRelativeRequires(selected.map(file => [file.archivePath, fs.readFileSync(file.fullPath)]));
  return selected;
}

// Archive-level check, independent of the source-tree module loader. This
// catches newly added shared imports even when developer tests find them in
// the full checkout and therefore conceal a missing shipped dependency.
export function verifyProductRelativeRequires(entries) {
  const files = new Map(entries);
  for (const [name, bytes] of files) {
    if (!name.startsWith('server/') || !/\.(?:c?js)$/u.test(name)) continue;
    const source = Buffer.from(bytes).toString('utf8');
    const literal = /\brequire\(\s*(['"])([^'"\r\n]+)\1\s*\)/gu;
    for (const match of source.matchAll(literal)) {
      const request = match[2];
      if (!request.startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), request));
      const candidates = [resolved, `${resolved}.js`, `${resolved}.cjs`, `${resolved}.json`, `${resolved}/index.js`];
      if (!resolved.startsWith('server/') || !candidates.some(candidate => files.has(candidate))) {
        throw new Error(`PRODUCT_MODULE_DEPENDENCY_MISSING:${name}:${request}`);
      }
    }
  }
  return Object.freeze({ ok: true });
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
