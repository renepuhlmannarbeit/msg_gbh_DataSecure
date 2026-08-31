// Synthetic engineering acceptance for the actual fixed-role executable and
// native supervisor. This is NOT evidence that the MCP parent selects it yet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readSeaFile, seaHash, assertSeaDirectory, seaTreeInventory } from './lib/sea-source-evidence.mjs';
import { bundleSeaParser, parserToolchainEvidence, assertParserProvenance } from './lib/sea-parser-bundle.mjs';
const require = createRequire(import.meta.url);
const { verifyNativeLauncherArtifact } = require('../plugins/data-secure/server/native-launcher');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { zipStore } = require('../tests/lib/zip');
const { opcControlEntries } = require('../tests/lib/opc');
const root = path.resolve(import.meta.dirname, '..');
const index = process.argv.indexOf('--directory');
if (index < 0 || !process.argv[index + 1]) throw new Error('SEA_PARSER_DIRECTORY_REQUIRED');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('SEA_PARSER_NATIVE_MATRIX_PENDING');
const directory = path.resolve(process.argv[index + 1]);
const evidence = JSON.parse(readSeaFile(path.join(directory, 'parser-build.json')));
const bytes = readSeaFile(path.join(directory, 'datasecure-parser.exe'));
assert.equal(evidence.schema, 'datasecure-sea-parser-build/v1');
assert.equal(evidence.release_enabled, false);
assert.equal(evidence.sha256, seaHash(bytes));
assert.equal(evidence.bytes, bytes.length);
const contractBytes = readSeaFile(path.join(root, 'native/sea/launcher-contract.json'));
const contract = JSON.parse(contractBytes);
assert.equal(evidence.launcher_contract_sha256, seaHash(contractBytes));
assert.equal(evidence.node_version, contract.node_version);
assert.equal(evidence.target, 'windows-x64'); assert.equal(evidence.role, 'parser');
assert.equal(evidence.archive_sha256, contract.targets.find(target => target.id === 'windows-x64').archive_sha256);
assertParserProvenance(evidence, await bundleSeaParser(root, 'windows-x64', contract.node_version), parserToolchainEvidence(root));
const supervisor = verifyNativeLauncherArtifact(path.join(root, 'plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe'));
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-sea-parser-test-'));
let passed = 0;
try {
  const relocated = path.join(temporary, 'Ort mit Leerzeichen und Umlaut ü');
  const cwd = path.join(temporary, 'different-working-directory');
  fs.mkdirSync(relocated); fs.mkdirSync(cwd);
  const executable = path.join(relocated, 'datasecure-parser.exe');
  fs.writeFileSync(executable, bytes, { flag: 'wx' });
  const canaryFile = path.join(cwd, '.datasecure-parser-outside-read');
  fs.writeFileSync(canaryFile, 'SYNTHETIC OUTSIDE FILE', { flag: 'wx' });
  function run(args, input = Buffer.alloc(0)) {
    return spawnSync(supervisor, ['--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000', '--', executable, ...args],
      { cwd, encoding: 'utf8', input, env: { PATH: '', NODE_OPTIONS: '--require=must-never-load' },
        shell: false, windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  }
  const probe = run(['--datasecure-parser-boundary-probe']);
  assert.equal(probe.error, undefined); assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout).failures, []);
  assert.equal(JSON.parse(probe.stdout).node_version, contract.node_version);
  assert.equal(JSON.parse(probe.stdout).target, 'windows-x64');
  assert.equal(JSON.parse(probe.stdout).role, 'parser');
  assert.equal(JSON.parse(probe.stdout).sea, true);
  assert.equal(fs.readFileSync(canaryFile, 'utf8'), 'SYNTHETIC OUTSIDE FILE');
  assert.equal(fs.existsSync(path.join(cwd, '.datasecure-parser-denied-write')), false);
  passed++;
  const docx = zipStore([...opcControlEntries('docx'), ['word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>SEA_PARSER_CANARY</w:t></w:r></w:p></w:body></w:document>']]);
  for (const ext of ['.txt', '.md', '.markdown', '.csv', '.docx']) {
    const input = ext === '.docx' ? docx : Buffer.from(ext === '.csv' ? 'Rolle;Zertifikat\nProduct Owner;PSPO I' : 'SEA_PARSER_CANARY\nScrum.org PSPO I');
    const result = run([ext, '0'], input);
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.result, parseDocumentBuffer(input, ext));
    passed++;
  }
  // The supervisor requires at least one child argument (native usage error
  // 120). Test that contract separately from the parser's JSON protocol.
  const emptyInvocation = run([]);
  assert.equal(emptyInvocation.error, undefined); assert.equal(emptyInvocation.status, 120);
  assert.equal(emptyInvocation.stdout, ''); passed++;
  const emptyParser = spawnSync(executable, [], { cwd, encoding: 'utf8', input: '', env: { PATH: '', NODE_OPTIONS: '--require=must-never-load' },
    shell: false, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.equal(emptyParser.error, undefined); assert.equal(emptyParser.status, 2);
  assert.deepEqual(JSON.parse(emptyParser.stdout), { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' }); passed++;
  for (const args of [['.txt'], ['.txt', '3'], ['.txt', '0', 'extra'], ['.TXT', '0'], ['.pdf', '0'], ['.xlsx', '0'],
    ['-e', 'process.exit(0)'], ['foreign.js', '0'], ['--node-options=--allow-fs-write=*'], ['--permission', '.txt', '0']]) {
    const result = run(args, Buffer.from('SYNTHETIC INPUT NOT TO PARSE'));
    assert.equal(result.error, undefined); assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' });
    passed++;
  }
  const malformed = run(['.docx', '0'], Buffer.from('not-a-zip'));
  assert.notEqual(malformed.status, 0); assert.equal(JSON.parse(malformed.stdout).ok, false); passed++;
  process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-parser-acceptance/v1', release_enabled: false,
    target: 'windows-x64', passed, launcher_sha256: evidence.sha256, supervisor: 'verified-native',
    parent_dispatch_verified: false, privacy_release_verified: false }) + '\n');
} finally {
  assertSeaDirectory(temporary); seaTreeInventory(temporary);
  fs.rmSync(temporary, { recursive: true });
}
