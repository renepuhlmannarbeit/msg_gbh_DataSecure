import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import layout from '../../plugins/data-secure/server/standalone/macos-bundle-layout.js';

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
  if (manifest.native_layout !== undefined) {
    assert.equal(manifest.native_layout, layout.LAYOUT, 'CONVERSION_NATIVE_LAYOUT_INVALID');
    assert.equal(manifest.native_inventory_finalized, true, 'CONVERSION_NATIVE_NOT_FINALIZED');
    const suffix = 'Resources/server/standalone/conversion-runtime/';
    assert.ok(prefix.endsWith(suffix), 'CONVERSION_NATIVE_PREFIX_INVALID');
    const contents = prefix.slice(0, -suffix.length);
    for (const record of Object.values(layout.nativeRoles(manifest.target)).filter(record => record.inventory)) {
      assert.ok(!files.has(record.inventory), 'CONVERSION_NATIVE_DUPLICATE');
      const bytes = entries.get(`${contents}${record.destination}`);
      assert.ok(Buffer.isBuffer(bytes), 'CONVERSION_NATIVE_MISSING');
      files.set(record.inventory, bytes);
    }
  }
  // RUNTIME.json and the generated license summary are appended after the
  // conversion inventory. Both are covered by the enclosing package manifest
  // and SHA256SUMS; all other conversion payload files must occur exactly once.
  assert.ok(files.has('RUNTIME.json') && files.has('THIRD_PARTY_NOTICES.txt'), 'CONVERSION_INVENTORIES_MISSING');
  verifyInventory(files, manifest.files, new Set(['RUNTIME.json', 'THIRD_PARTY_NOTICES.txt']), 'CONVERSION_MANIFEST');
  // Earlier packages retain their historical runtime contract. New packages
  // explicitly inventory the unchanged upstream and the named derivative.
  if (manifest.pdf_text_paint_contract !== undefined || files.has('node_modules/pdfjs-dist/legacy/build/pdf.datasecure.mjs')) {
    assert.equal(manifest.pdf_text_paint_contract, 'datasecure-pdf-text-paint/1', 'CONVERSION_PDF_PAINT_CONTRACT_INVALID');
    for (const name of ['pdf.mjs', 'pdf.datasecure.mjs']) {
      assert.ok(files.has(`node_modules/pdfjs-dist/legacy/build/${name}`), 'CONVERSION_PDF_PAINT_MODULE_MISSING');
    }
  }
  // Earlier exact packages retain their historical inventory contract.
  const hasSyntax = [...files.keys()].some(name => /^node_modules\/(?:mdast-util-from-markdown|parse5)\//u.test(name)) ||
    manifest.packages?.some(item => ['mdast-util-from-markdown', 'parse5'].includes(item.name));
  if (hasSyntax || manifest.syntax_reader_contract !== undefined) {
    assert.equal(manifest.syntax_reader_contract, 'datasecure-markdown-syntax/1', 'CONVERSION_SYNTAX_CONTRACT_INVALID');
    for (const [name, version] of [['mdast-util-from-markdown', '2.0.2'], ['parse5', '7.3.0']]) {
      assert.ok(manifest.packages?.some(item => item.name === name && item.version === version && item.license === 'MIT'),
        'CONVERSION_SYNTAX_PIN_MISSING');
      assert.equal(JSON.parse(files.get(`node_modules/${name}/package.json`)).version, version, 'CONVERSION_SYNTAX_VERSION_INVALID');
    }
    const pending = ['mdast-util-from-markdown', 'parse5'], visited = new Set();
    while (pending.length) {
      const name = pending.pop();
      if (visited.has(name)) continue;
      visited.add(name);
      assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu, 'CONVERSION_SYNTAX_DEPENDENCY_INVALID');
      const metadataBytes = files.get(`node_modules/${name}/package.json`);
      assert.ok(metadataBytes, 'CONVERSION_SYNTAX_DEPENDENCY_MISSING');
      const metadata = JSON.parse(metadataBytes);
      const records = manifest.packages.filter(item => item.name === name);
      assert.equal(records.length, 1, 'CONVERSION_SYNTAX_PACKAGE_DUPLICATE');
      assert.equal(metadata.name, name, 'CONVERSION_SYNTAX_DEPENDENCY_INVALID');
      assert.equal(records[0].version, metadata.version, 'CONVERSION_SYNTAX_DEPENDENCY_INVALID');
      pending.push(...Object.keys(metadata.dependencies || {}));
    }
  }
}

export function verifyArchiveChecksum(bytes, archive, checksum) {
  assert.equal(checksum.trim(), `${sha256(bytes)}  ${path.basename(archive)}`, 'STANDALONE_ARCHIVE_CHECKSUM_INVALID');
}
