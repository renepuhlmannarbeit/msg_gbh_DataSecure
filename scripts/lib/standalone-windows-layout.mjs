import assert from 'node:assert/strict';

// Keep the version in the archive name and manifest, without repeating it in
// Explorer's default extraction directory and every packaged dependency path.
export const WINDOWS_PACKAGE_ROOT = 'DataSecure';

export function windowsPackageRoots(version) {
  assert.match(version, /^[0-9A-Za-z][0-9A-Za-z.-]*$/u, 'STANDALONE_PACKAGE_VERSION_INVALID');
  return [WINDOWS_PACKAGE_ROOT, `DataSecure-Standalone-${version}-windows-x64`];
}

// Only the current short root and the exact historical versioned root are
// supported. Never infer an arbitrary root from the first archive entry.
export function windowsPackagePrefix(entries, version) {
  const matches = windowsPackageRoots(version).map(root => `${root}/`)
    .filter(prefix => entries.has(`${prefix}STANDALONE-MANIFEST.json`));
  assert.equal(matches.length, 1, 'STANDALONE_ZIP_ROOT_INVALID');
  const prefix = matches[0];
  for (const name of entries.keys()) {
    assert.ok(name.startsWith(prefix) && name.length > prefix.length, 'STANDALONE_ZIP_ROOT_INVALID');
  }
  return prefix;
}
