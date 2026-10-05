import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MANIFEST = 'STANDALONE-MANIFEST.json';
const SUMS = 'SHA256SUMS';

function checkedPath(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(value.length > 0 && !/[\\:\u0000-\u001f\u007f]/u.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..'), code);
  return value;
}

function exactSet(actual, expected, code) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), code);
}

function verifyInventory(entries, records, excluded, code) {
  assert.ok(Array.isArray(records) && records.length > 0, `${code}_INVALID`);
  const seen = new Set();
  for (const file of records) {
    assert.ok(file && typeof file === 'object', `${code}_INVALID`);
    const name = checkedPath(file.path, `${code}_PATH_INVALID`);
    assert.ok(!seen.has(name), `${code}_DUPLICATE:${name}`);
    seen.add(name);
    assert.ok(!excluded.has(name), `${code}_SELF_REFERENCE:${name}`);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0 &&
      /^[a-f0-9]{64}$/u.test(file.sha256 || '') && typeof file.executable === 'boolean', `${code}_INVALID`);
    const value = entries.get(name);
    assert.ok(Buffer.isBuffer(value), `${code}_MISSING:${name}`);
    assert.equal(value.length, file.bytes, `${code}_BYTES:${name}`);
    assert.equal(sha256(value), file.sha256, `${code}_HASH:${name}`);
  }
  exactSet(seen, [...entries.keys()].filter(name => !excluded.has(name)), `${code}_COVERAGE`);
}

// Builders inventory the payload, then append the manifest, then inventory
// everything except SHA256SUMS. These explicit exclusions avoid impossible
// self-hashes; they must not become a blanket exception for runtime files.
export function verifyStandaloneInventory(entries, manifest) {
  for (const name of entries.keys()) checkedPath(name, 'STANDALONE_ZIP_PATH_INVALID');
  assert.ok(entries.has(MANIFEST) && entries.has(SUMS), 'STANDALONE_INVENTORIES_MISSING');
  verifyInventory(entries, manifest.files, new Set([MANIFEST, SUMS]), 'STANDALONE_MANIFEST');
  const text = entries.get(SUMS).toString('utf8');
  assert.ok(text.length > 0 && !text.startsWith('\ufeff'), 'STANDALONE_SHA256SUMS_INVALID');
  const seen = new Set();
  const lines = text.replace(/\r?\n$/u, '').split(/\r?\n/u);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert.ok(match, 'STANDALONE_SHA256SUMS_INVALID');
    const name = checkedPath(match[2], 'STANDALONE_SHA256SUMS_PATH_INVALID');
    assert.ok(name !== SUMS, 'STANDALONE_SHA256SUMS_SELF_REFERENCE');
    assert.ok(!seen.has(name), `STANDALONE_SHA256SUMS_DUPLICATE:${name}`);
    seen.add(name);
    const value = entries.get(name);
    assert.ok(Buffer.isBuffer(value), `STANDALONE_SHA256SUMS_MISSING:${name}`);
    assert.equal(sha256(value), match[1], `STANDALONE_SHA256SUMS_HASH:${name}`);
  }
  exactSet(seen, [...entries.keys()].filter(name => name !== SUMS), 'STANDALONE_SHA256SUMS_COVERAGE');
}

export function verifyConversionInventory(entries, prefix, manifest) {
  const files = new Map([...entries].filter(([name]) => name.startsWith(prefix))
    .map(([name, bytes]) => [name.slice(prefix.length), bytes]));
  // RUNTIME.json and the generated license summary are appended after the
  // conversion inventory. Both are covered by the enclosing package manifest
  // and SHA256SUMS; all other conversion payload files must occur exactly once.
  assert.ok(files.has('RUNTIME.json') && files.has('THIRD_PARTY_NOTICES.txt'), 'CONVERSION_INVENTORIES_MISSING');
  verifyInventory(files, manifest.files, new Set(['RUNTIME.json', 'THIRD_PARTY_NOTICES.txt']), 'CONVERSION_MANIFEST');
}

export function verifyArchiveChecksum(bytes, archive, checksum) {
  assert.equal(checksum.trim(), `${sha256(bytes)}  ${path.basename(archive)}`, 'STANDALONE_ARCHIVE_CHECKSUM_INVALID');
}
