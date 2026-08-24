// Central-directory mode checks for DataSecure distribution archives.
// Windows executables intentionally remain regular 0644 entries; only the
// POSIX launchers require an executable bit in a ZIP/MCPB installation.
export function expectedExecutableEntries(names) {
  return new Set([...names].filter((name) =>
    /^server\/native\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-sandbox$/u.test(name) ||
    /^server\/ocr-runtime\/targets\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-ocr-sandbox$/u.test(name)
  ));
}

export function verifyDataSecureArchiveModes(modes, names) {
  const expected = expectedExecutableEntries(names);
  if (modes.size !== names.size) throw new Error('ARCHIVE_MODE_INVENTORY_MISMATCH');
  for (const name of names) {
    const actual = modes.get(name);
    const required = expected.has(name) ? 0o100755 : 0o100644;
    if (actual !== required) throw new Error(`ARCHIVE_MODE_INVALID:${name}`);
  }
  for (const name of modes.keys()) if (!names.has(name)) throw new Error('ARCHIVE_MODE_UNEXPECTED_ENTRY');
  return { executable_entries: expected.size, regular_entries: names.size - expected.size };
}
