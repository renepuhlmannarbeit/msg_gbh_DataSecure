import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertSeaDirectory, readSeaFile, seaHash, seaTreeInventory,
  createSeaSourceEvidence, assertSeaSourceEvidence } from '../scripts/lib/sea-source-evidence.mjs';

const { createSuite } = createRequire(import.meta.url)('./helpers');
const { test, done, assert } = createSuite('SEA source evidence: synthetic files only');
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-sea-source-test-'));
const plugin = path.join(temporary, 'plugin');
const manifest = path.join(plugin, '.claude-plugin', 'plugin.json');
const source = path.join(plugin, 'server', 'index.js');
const contract = path.join(temporary, 'contract.json');
const dispatcher = path.join(temporary, 'dispatcher');
fs.mkdirSync(path.dirname(manifest), { recursive: true });
fs.mkdirSync(path.dirname(source));
fs.writeFileSync(manifest, JSON.stringify({ version: '1.0.0-test' }));
fs.writeFileSync(source, 'synthetic source');
fs.writeFileSync(contract, '{}');
fs.writeFileSync(dispatcher, 'synthetic dispatcher');
const evidence = () => createSeaSourceEvidence(plugin, contract, dispatcher);
const original = evidence();
function changed(file, bytes, check) {
  const old = readSeaFile(file);
  try { fs.writeFileSync(file, bytes); check(); }
  finally { fs.writeFileSync(file, old); }
}

try {
  test('deterministic inventory uses relative names and hashes, never absolute paths', () => {
    assert.deepStrictEqual(evidence(), original);
    const inventory = seaTreeInventory(plugin);
    assert.deepStrictEqual(inventory.map(file => file.path), ['.claude-plugin/plugin.json', 'server/index.js']);
    assert.strictEqual(inventory[1].sha256, seaHash(Buffer.from('synthetic source')));
    assert.ok(!JSON.stringify(original).includes(temporary));
    assertSeaSourceEvidence(original, evidence());
  });
  test('copying the tree to a different directory preserves its identity', () => {
    const copy = path.join(temporary, 'copy');
    fs.cpSync(plugin, copy, { recursive: true });
    assert.deepStrictEqual(createSeaSourceEvidence(copy, contract, dispatcher), original);
  });
  test('a source-byte change invalidates the previous evidence', () => {
    changed(source, 'changed source', () => {
      assert.notStrictEqual(evidence().plugin_tree_sha256, original.plugin_tree_sha256);
      assert.throws(() => assertSeaSourceEvidence(original, evidence()), /SEA_SOURCE_EVIDENCE_MISMATCH/);
    });
  });
  test('version changes bind both the version and the source tree', () => {
    changed(manifest, JSON.stringify({ version: '1.0.1-test' }), () => {
      assert.strictEqual(evidence().plugin_version, '1.0.1-test');
      assert.notStrictEqual(evidence().plugin_tree_sha256, original.plugin_tree_sha256);
    });
  });
  test('launcher contract changes invalidate evidence independently of plugin bytes', () => {
    changed(contract, '{"changed":true}', () => {
      assert.notStrictEqual(evidence().launcher_contract_sha256, original.launcher_contract_sha256);
      assert.strictEqual(evidence().plugin_tree_sha256, original.plugin_tree_sha256);
      assert.throws(() => assertSeaSourceEvidence(original, evidence()), /MISMATCH/);
    });
  });
  test('dispatcher changes invalidate evidence independently of plugin bytes', () => {
    changed(dispatcher, 'changed dispatcher', () => {
      assert.notStrictEqual(evidence().dispatcher_sha256, original.dispatcher_sha256);
      assert.throws(() => assertSeaSourceEvidence(original, evidence()), /MISMATCH/);
    });
  });
  test('evidence is a closed schema: missing, extra, old-schema and forged fields stop', () => {
    for (const bad of [null, [], {}, { ...original, schema: 'v0' },
      { ...original, extra: true }, { ...original, plugin_tree_sha256: '0'.repeat(64) },
      { ...original, plugin_version: undefined }]) {
      assert.throws(() => assertSeaSourceEvidence(bad, original), /MISMATCH/);
    }
  });
  test('oversized reads and directories masquerading as files stop', () => {
    assert.throws(() => readSeaFile(source, 1), /SEA_FILE_UNSAFE/);
    assert.throws(() => readSeaFile(plugin), /SEA_FILE_UNSAFE/);
    assert.strictEqual(readSeaFile(contract, 2).toString(), '{}');
  });
  test('invalid plugin versions stop', () => {
    for (const version of ['', 42, '../path', '1.0']) {
      changed(manifest, JSON.stringify({ version }), () => assert.throws(evidence, /SEA_PLUGIN_VERSION_INVALID/));
    }
  });
  test('hard-linked source files are rejected without altering the base file', () => {
    const link = path.join(temporary, 'hardlink');
    fs.linkSync(source, link);
    try {
      assert.throws(evidence, /SEA_FILE_UNSAFE/);
      assert.throws(() => readSeaFile(link), /SEA_FILE_UNSAFE/);
    } finally {
      assert.ok(fs.lstatSync(link).isFile());
      fs.unlinkSync(link); // Only the explicitly created directory entry.
    }
    assert.strictEqual(readSeaFile(source).toString(), 'synthetic source');
  });
  test('a linked directory or parent is rejected, target remains untouched', () => {
    const link = path.join(temporary, 'linked-parent');
    fs.symlinkSync(plugin, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      assert.throws(() => assertSeaDirectory(link), /SEA_DIRECTORY_UNSAFE/);
      assert.throws(() => readSeaFile(path.join(link, 'server', 'index.js')), /SEA_DIRECTORY_UNSAFE/);
      assert.throws(() => seaTreeInventory(temporary), /SEA_TREE_UNSAFE/);
    } finally {
      assert.ok(fs.lstatSync(link).isSymbolicLink());
      fs.unlinkSync(link); // Unlink only, never traverse the target.
    }
    assert.deepStrictEqual(evidence(), original);
  });
  test('deeply nested inputs hit a bounded traversal limit', () => {
    const deep = path.join(temporary, 'deep');
    fs.mkdirSync(path.join(deep, ...Array(34).fill('d')), { recursive: true });
    assert.throws(() => seaTreeInventory(deep), /SEA_TREE_LIMIT/);
    // Inspect the known, link-free directories deepest-first; remove empty dirs only.
    for (let depth = 34; depth >= 0; depth--) {
      const current = path.join(deep, ...Array(depth).fill('d'));
      assertSeaDirectory(current);
      fs.rmdirSync(current);
    }
  });
} finally {
  assertSeaDirectory(temporary);
  seaTreeInventory(temporary);
  fs.rmSync(temporary, { recursive: true });
}
done();
