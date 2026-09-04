import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { buildRuntimePlugin } from '../scripts/build-runtime-plugin.mjs';
import { assertBinaryTarget, extractRuntime, readContract, sha256, verifyTargetEvidence } from '../scripts/lib/bundled-runtime.mjs';
import { readCentralModes } from '../scripts/lib/zip.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}

function binary(target) {
  const bytes = Buffer.alloc(2048, 0x41);
  if (target.os === 'win32') {
    bytes[0] = 0x4d; bytes[1] = 0x5a; bytes.writeUInt32LE(64, 0x3c);
    Buffer.from('PE\0\0').copy(bytes, 64); bytes.writeUInt16LE(0x8664, 68);
  } else {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target.arch === 'arm64' ? 0x0100000c : 0x01000007, 4);
  }
  return bytes;
}

function tar(name, value) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000755\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${value.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header[156] = 48;
  return Buffer.concat([header, value, Buffer.alloc(Math.ceil(value.length / 512) * 512 - value.length), Buffer.alloc(1024)]);
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-runtime-test-'));
  fs.mkdirSync(path.join(directory, 'native/runtime'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'plugins/data-secure/.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'plugins/data-secure/server'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'plugins/data-secure/server/ocr-runtime'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.copyFileSync(new URL('../native/runtime/runtime-contract.json', import.meta.url), path.join(directory, 'native/runtime/runtime-contract.json'));
  fs.copyFileSync(new URL('../native/runtime/datasecure-node', import.meta.url), path.join(directory, 'native/runtime/datasecure-node'));
  fs.writeFileSync(path.join(directory, 'plugins/data-secure/.claude-plugin/plugin.json'), JSON.stringify({ name: 'data-secure', version: '1.0.0-test' }));
  fs.writeFileSync(path.join(directory, 'plugins/data-secure/.mcp.json'), JSON.stringify({ mcpServers: {
    'data-secure-local': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server/index.js'], env: { EU_PRIVACY_VISUAL_MODE: 'strict' } }
  } }));
  fs.writeFileSync(path.join(directory, 'plugins/data-secure/server/index.js'), 'process.stdin.resume();\n');
  fs.writeFileSync(path.join(directory, 'plugins/data-secure/server/ocr-runtime/disabled.bin'), 'MUST NOT SHIP');
  fs.writeFileSync(path.join(directory, 'plugins/data-secure/server/ocr-runtime.provenance.json'), '{}');
  const contract = readContract(directory);
  const runtimes = path.join(directory, 'runtimes');
  for (const target of contract.targets) {
    const root = path.join(runtimes, target.id); fs.mkdirSync(root, { recursive: true });
    const bytes = binary(target), licenseBytes = Buffer.from('Node.js license fixture\n'.repeat(10));
    fs.writeFileSync(path.join(root, target.launcher), bytes);
    fs.writeFileSync(path.join(root, 'LICENSE.node.txt'), licenseBytes);
    fs.writeFileSync(path.join(root, 'runtime-evidence.json'), JSON.stringify({
      schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
      node_version: contract.node_version, archive: target.archive, archive_sha256: target.archive_sha256,
      bytes: bytes.length, sha256: sha256(bytes), license_bytes: licenseBytes.length,
      license_sha256: sha256(licenseBytes), runtime_probe: { version: contract.node_version, platform: target.os, arch: target.arch }
    }));
  }
  return { directory, contract, runtimes, close() { fs.rmSync(directory, { recursive: true }); } };
}

test('contract has exactly the supported Cowork desktop targets and no top-level bin command', () => {
  const contract = readContract(path.resolve(import.meta.dirname, '..'));
  assert.deepEqual(contract.targets.map((target) => target.id), ['windows-x64', 'macos-x64', 'macos-arm64']);
  assert.equal(contract.plugin_command, '${CLAUDE_PLUGIN_ROOT}/runtime/datasecure-node');
  assert.ok(!contract.plugin_command.includes('/bin/'));
});

test('binary header gate distinguishes every target architecture', () => {
  const contract = readContract(path.resolve(import.meta.dirname, '..'));
  for (const target of contract.targets) {
    const bytes = binary(target); assert.doesNotThrow(() => assertBinaryTarget(bytes, target));
    for (const other of contract.targets.filter((item) => item.id !== target.id)) {
      assert.throws(() => assertBinaryTarget(bytes, other), /BUNDLED_RUNTIME_BINARY_TARGET/);
    }
  }
});

test('bounded tar.gz extraction returns only the exact declared runtime', () => {
  const target = readContract(path.resolve(import.meta.dirname, '..')).targets[1];
  const bytes = binary(target), archive = zlib.gzipSync(tar(target.node_path, bytes));
  assert.deepEqual(extractRuntime(archive, target), bytes);
  assert.throws(() => extractRuntime(zlib.gzipSync(tar('other/node', bytes)), target), /BUNDLED_RUNTIME_NODE_MISSING/);
  assert.throws(() => extractRuntime(Buffer.from('not gzip'), target), /BUNDLED_RUNTIME_ARCHIVE_INVALID/);
});

test('target evidence is exact and tampering fails closed', () => {
  const contract = readContract(path.resolve(import.meta.dirname, '..')), target = contract.targets[0], bytes = binary(target);
  const licenseBytes = Buffer.from('Node.js license fixture');
  const evidence = { schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
    node_version: contract.node_version, archive: target.archive, archive_sha256: target.archive_sha256,
    bytes: bytes.length, sha256: sha256(bytes), license_bytes: licenseBytes.length,
    license_sha256: sha256(licenseBytes), runtime_probe: { version: contract.node_version, platform: target.os, arch: target.arch } };
  assert.doesNotThrow(() => verifyTargetEvidence(evidence, bytes, licenseBytes, target, contract));
  evidence.runtime_probe.arch = 'arm64';
  assert.throws(() => verifyTargetEvidence(evidence, bytes, licenseBytes, target, contract), /BUNDLED_RUNTIME_EVIDENCE_INVALID/);
});

for (const targetId of ['windows-x64', 'macos-x64', 'macos-arm64', 'universal']) {
  test(`${targetId} package is self-contained, deterministic in scope and excludes disabled OCR`, () => {
    const f = fixture();
    try {
      const result = buildRuntimePlugin({ repositoryRoot: f.directory, runtimesRoot: f.runtimes, targetId });
      const bytes = fs.readFileSync(result.archive), entries = readZip(bytes), modes = readCentralModes(bytes);
      const mcp = JSON.parse(entries.get('.mcp.json'));
      assert.deepEqual(Object.keys(mcp), ['mcpServers']);
      assert.equal(mcp.mcpServers['data-secure-local'].command, f.contract.plugin_command);
      assert.deepEqual(mcp.mcpServers['data-secure-local'].args, [f.contract.runtime_entry]);
      assert.ok(entries.has('RUNTIME-EVIDENCE.json'));
      assert.ok(entries.has('runtime/LICENSE.node.txt'));
      assert.ok(![...entries.keys()].some((name) => name === 'bin' || name.startsWith('bin/') || name.startsWith('server/ocr-runtime')));
      if (targetId === 'windows-x64') {
        assert.ok(entries.has('runtime/datasecure-node.exe')); assert.ok(!entries.has('runtime/datasecure-node'));
      } else if (targetId === 'universal') {
        assert.ok(entries.has('runtime/datasecure-node.exe')); assert.ok(entries.has('runtime/datasecure-node'));
        assert.equal(JSON.parse(entries.get('RUNTIME-EVIDENCE.json')).targets.length, 3);
      } else {
        assert.ok(entries.has('runtime/datasecure-node'));
        assert.ok(entries.has(`runtime/targets/${targetId}/node`));
      }
      for (const [name, mode] of modes) {
        const executable = name === 'runtime/datasecure-node' || /^runtime\/targets\/macos-(?:x64|arm64)\/node$/u.test(name);
        assert.equal(mode, executable ? 0o100755 : 0o100644, name);
      }
    } finally { f.close(); }
  });
}

test('missing target, stale evidence and wrong binary refuse publication', () => {
  for (const kind of ['missing', 'evidence', 'binary']) {
    const f = fixture();
    try {
      const target = f.contract.targets[0], file = path.join(f.runtimes, target.id, target.launcher);
      if (kind === 'missing') fs.unlinkSync(file);
      if (kind === 'evidence') {
        const evidenceFile = path.join(f.runtimes, target.id, 'runtime-evidence.json');
        const evidence = JSON.parse(fs.readFileSync(evidenceFile)); evidence.sha256 = '0'.repeat(64);
        fs.writeFileSync(evidenceFile, JSON.stringify(evidence));
      }
      if (kind === 'binary') fs.writeFileSync(file, Buffer.alloc(256));
      assert.throws(() => buildRuntimePlugin({ repositoryRoot: f.directory, runtimesRoot: f.runtimes,
        targetId: target.id }), /BUNDLED_(?:PLUGIN_RUNTIME_MISSING|RUNTIME_(?:FILE_UNSAFE|EVIDENCE_INVALID|BINARY_TARGET))/);
      assert.equal(fs.readdirSync(path.join(f.directory, 'dist')).length, 0);
    } finally { f.close(); }
  }
});

console.log(`Bundled runtime/package contract: ${passed} passed`);
