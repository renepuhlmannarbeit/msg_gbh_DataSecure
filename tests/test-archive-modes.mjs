import assert from 'node:assert/strict';
import { expectedExecutableEntries, verifyDataSecureArchiveModes } from '../scripts/lib/archive-modes.mjs';

const names = new Set([
  'server/index.js',
  'server/native/windows-x64/datasecure-sandbox.exe',
  'server/native/linux-x64/datasecure-sandbox',
  'server/ocr-runtime/targets/macos-arm64/datasecure-ocr-sandbox'
]);
const expected = expectedExecutableEntries(names);
assert.deepEqual([...expected].sort(), [
  'server/native/linux-x64/datasecure-sandbox',
  'server/ocr-runtime/targets/macos-arm64/datasecure-ocr-sandbox'
]);
const modes = new Map([
  ['server/index.js', 0o100644],
  ['server/native/windows-x64/datasecure-sandbox.exe', 0o100644],
  ['server/native/linux-x64/datasecure-sandbox', 0o100755],
  ['server/ocr-runtime/targets/macos-arm64/datasecure-ocr-sandbox', 0o100755]
]);
assert.deepEqual(verifyDataSecureArchiveModes(modes, names), { executable_entries: 2, regular_entries: 2 });
modes.set('server/index.js', 0o100755);
assert.throws(() => verifyDataSecureArchiveModes(modes, names), /ARCHIVE_MODE_INVALID/);
console.log('Archive mode contract: 3 passed, 0 failed');
