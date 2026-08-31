import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeZip, readCentralModes } from './lib/zip.mjs';
import { includeInProduct, verifyKeyringFreeProductEntries } from './lib/product-files.mjs';
import { expectedExecutableEntries } from './lib/archive-modes.mjs';
import { prepareLauncherProvenance, assertLauncherBuildEvidence } from './lib/sea-launcher-provenance.mjs';
import { assertSeaDirectory, readSeaFile, seaTreeInventory, seaHash,
  createSeaSourceEvidence, assertSeaSourceEvidence } from './lib/sea-source-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { readZip } = createRequire(import.meta.url)('../plugins/data-secure/server/zip-reader.js');
const MAX_ASSEMBLY_BYTES = 1024 * 1024 * 1024;
const MAX_ASSEMBLY_ENTRIES = 10016;
const TARGETS = [
  ['windows-x64', 'win32', 'x64', 'datasecure-mcp.exe'],
  ['macos-x64', 'darwin', 'x64', 'datasecure-mcp'],
  ['macos-arm64', 'darwin', 'arm64', 'datasecure-mcp'],
  ['linux-x64', 'linux', 'x64', 'datasecure-mcp']
];
const PARSER_BOUNDARY = Object.freeze({ schema: 'datasecure-sea-parser-boundary/v1',
  txt: true, docx: true, permission: true, network_denied: true });
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error('missing ' + name);
  return process.argv[index + 1];
}
function readJson(file, code) {
  try { return JSON.parse(readSeaFile(file, 65536)); } catch { throw new Error(code); }
}
function binaryMatchesTarget(bytes, target) {
  if (target.os === 'win32') {
    if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
    const pe = bytes.readUInt32LE(0x3c);
    return pe + 6 <= bytes.length && bytes.subarray(pe, pe + 4).equals(Buffer.from('PE\0\0')) &&
      bytes.readUInt16LE(pe + 4) === 0x8664;
  }
  if (target.os === 'linux') return bytes.length >= 20 &&
    bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
    bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 0x3e;
  if (target.os === 'darwin') {
    const cpu = target.arch === 'arm64' ? 0x0100000c : 0x01000007;
    return bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) &&
      bytes.readUInt32LE(4) === cpu;
  }
  return false;
}
function assertParserBoundary(actual, target) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual) ||
      Object.keys(actual).sort().join(',') !== Object.keys(PARSER_BOUNDARY).sort().join(',') ||
      Object.keys(PARSER_BOUNDARY).some(key => actual[key] !== PARSER_BOUNDARY[key])) {
    throw new Error('SEA_PARSER_BOUNDARY_EVIDENCE_MISSING:' + target);
  }
}
function assertAbsent(file) {
  try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('SEA_PLUGIN_OUTPUT_EXISTS');
}
function ensureDirectory(directory) {
  assertSeaDirectory(path.dirname(directory));
  try { fs.mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  assertSeaDirectory(directory);
}
function writeStageFile(stage, expected, relative, bytes, replace = false) {
  const file = path.join(stage, relative);
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  // Bind intended bytes before handing them to filesystem code. Re-reading a
  // mutable stage is not allowed to redefine this source-bound inventory.
  const record = { path: relative, bytes: payload.length, sha256: seaHash(payload) };
  const total = expected.bytes - (expected.files.get(relative)?.bytes || 0) + record.bytes;
  if (total > MAX_ASSEMBLY_BYTES || (!expected.files.has(relative) && expected.files.size >= MAX_ASSEMBLY_ENTRIES)) {
    throw new Error('SEA_ASSEMBLY_LIMIT');
  }
  // Names come from a checked inventory or the fixed target contract.
  assertSeaDirectory(stage);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertSeaDirectory(path.dirname(file));
  if (replace) readSeaFile(file);
  fs.writeFileSync(file, payload, { flag: replace ? 'w' : 'wx', mode: 0o600 });
  expected.files.set(relative, record);
  expected.bytes = total;
}
function readExpectedStageFile(stage, expected, relative) {
  const bytes = readSeaFile(path.join(stage, relative)), record = expected.files.get(relative);
  if (!record || record.bytes !== bytes.length || record.sha256 !== seaHash(bytes)) throw new Error('SEA_STAGE_PAYLOAD_MISMATCH');
  return bytes;
}
function assertStageInventory(inventory, expected) {
  if (inventory.length !== expected.files.size || inventory.some(file => {
    const record = expected.files.get(file.path);
    return !record || record.bytes !== file.bytes || record.sha256 !== file.sha256;
  })) throw new Error('SEA_STAGE_PAYLOAD_MISMATCH');
}
function assertArchivePayload(archiveBytes, expected) {
  let entries;
  try { entries = readZip(archiveBytes, { maxEntries: MAX_ASSEMBLY_ENTRIES, maxUncompressed: MAX_ASSEMBLY_BYTES }); }
  catch { throw new Error('SEA_ARCHIVE_PAYLOAD_INVALID'); }
  if (entries.size !== expected.files.size) throw new Error('SEA_ARCHIVE_PAYLOAD_MISMATCH');
  verifyKeyringFreeProductEntries(entries);
  for (const [name, bytes] of entries) {
    const record = expected.files.get(name);
    if (!record || record.bytes !== bytes.length || record.sha256 !== seaHash(bytes)) throw new Error('SEA_ARCHIVE_PAYLOAD_MISMATCH');
  }
}
function cleanupStage(stage, identity) {
  assertSeaDirectory(stage);
  const current = fs.lstatSync(stage);
  if (current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('SEA_STAGE_CHANGED');
  // Never traverse a substituted link; a previous stage is not a cleanup target.
  function inspect(directory) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('SEA_STAGE_UNSAFE');
      if (stat.isDirectory()) inspect(file);
      else if (!stat.isFile()) throw new Error('SEA_STAGE_UNSAFE');
    }
  }
  inspect(stage);
  fs.rmSync(stage, { recursive: true });
}

// Exported for synthetic assembly tests. CLI users cannot override the source
// repository. This assembles engineering artifacts, never platform evidence.
export function assembleSeaPlugin({ repositoryRoot = root, launchersRoot, output } = {}) {
  const repository = assertSeaDirectory(repositoryRoot);
  const source = path.join(repository, 'plugins', 'data-secure'), dist = path.join(repository, 'dist');
  const contractFile = path.join(repository, 'native', 'sea', 'launcher-contract.json');
  const dispatcherFile = path.join(repository, 'native', 'sea', 'datasecure-mcp');
  const contract = readJson(contractFile, 'SEA_CONTRACT_INVALID');
  if (contract?.release_enabled !== false) throw new Error('SEA_RELEASE_SWITCH_MUST_REMAIN_FALSE');
  if (contract.schema !== 'datasecure-sea-launcher-contract/v1' ||
      contract.posix_dispatcher !== 'native/sea/datasecure-mcp' ||
      contract.plugin_command !== '${CLAUDE_PLUGIN_ROOT}/bin/datasecure-mcp' ||
      !Array.isArray(contract.targets) || contract.targets.length !== TARGETS.length ||
      TARGETS.some(([id, os, arch, launcher], index) => {
        const actual = contract.targets[index];
        return !actual || actual.id !== id || actual.os !== os || actual.arch !== arch || actual.launcher !== launcher;
      })) throw new Error('SEA_CONTRACT_INVALID');
  assertSeaDirectory(launchersRoot);
  const sourceEvidence = createSeaSourceEvidence(source, contractFile, dispatcherFile);
  const archive = output ? path.resolve(output)
    : path.join(dist, 'DataSecure-Privacy-Preflight-SEA-Engineering-v' + sourceEvidence.plugin_version + '.zip');
  if (path.dirname(archive) !== dist || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(path.basename(archive)) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(path.basename(archive))) {
    throw new Error('SEA_PLUGIN_OUTPUT_OUTSIDE_DIST');
  }
  try { assertSeaDirectory(dist); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assertAbsent(archive);
  const targetEvidence = [];
  for (const target of contract.targets) {
    const launcher = path.join(launchersRoot, target.id, target.launcher);
    let bytes;
    try { bytes = readSeaFile(launcher); } catch (error) {
      throw new Error((error.code === 'ENOENT' ? 'SEA_TARGET_MISSING:' : 'SEA_TARGET_UNSAFE:') + target.id);
    }
    if (!binaryMatchesTarget(bytes, target)) throw new Error('SEA_TARGET_ARCH_MISMATCH:' + target.id);
    const digest = seaHash(bytes);
    const build = readJson(launcher + '.evidence.json', 'SEA_BUILD_EVIDENCE_INVALID:' + target.id);
    const mcp = readJson(launcher + '.mcp-evidence.json', 'SEA_MCP_EVIDENCE_INVALID:' + target.id);
    // This legacy matrix assembler does not yet stage parser-role executables.
    if (build?.parent_provenance?.parser_role != null) throw new Error('SEA_PARENT_ROLE_ASSEMBLY_PENDING');
    try {
      const prepared = prepareLauncherProvenance(repositoryRoot, target.id, null);
      assertLauncherBuildEvidence(build, bytes, prepared);
      assertSeaSourceEvidence(sourceEvidence, prepared.provenance.source_evidence);
    } catch {
      throw new Error('SEA_BUILD_EVIDENCE_MISMATCH:' + target.id);
    }
    if (mcp?.schema !== 'datasecure-sea-mcp-evidence/v2' || mcp.release_enabled !== false ||
        mcp.target !== target.id || mcp.launcher_sha256 !== digest ||
        mcp.plugin_command !== contract.plugin_command || mcp.runtime_mode !== 'self_contained_node' ||
        mcp.runtime_target !== target.id || mcp.host_node_required !== false ||
        mcp.path_empty !== true || mcp.node_options_ignored !== true || mcp.raw_content_sent_to_claude !== false) {
      throw new Error('SEA_MCP_EVIDENCE_MISMATCH:' + target.id);
    }
    assertSeaSourceEvidence(mcp.source_evidence, sourceEvidence);
    assertParserBoundary(mcp.parser_boundary, target.id);
    targetEvidence.push({ target: target.id, sha256: digest, bytes: bytes.length });
  }
  ensureDirectory(dist);
  assertAbsent(archive);
  const stage = fs.mkdtempSync(path.join(dist, '.sea-plugin-stage-'));
  fs.chmodSync(stage, 0o700);
  const stageIdentity = fs.lstatSync(stage);
  const expected = { files: new Map(), bytes: 0 };
  try {
    for (const entry of seaTreeInventory(source)) {
      if (!includeInProduct(entry.path)) continue;
      const bytes = readSeaFile(path.join(source, entry.path));
      if (bytes.length !== entry.bytes || seaHash(bytes) !== entry.sha256) throw new Error('SEA_SOURCE_CHANGED');
      writeStageFile(stage, expected, entry.path, bytes);
    }
    // Compare the copied tree before changing its MCP command.
    assertSeaSourceEvidence(createSeaSourceEvidence(stage, contractFile, dispatcherFile), sourceEvidence);
    const dispatcher = readSeaFile(dispatcherFile, 65536);
    if (seaHash(dispatcher) !== sourceEvidence.dispatcher_sha256) throw new Error('SEA_SOURCE_CHANGED');
    writeStageFile(stage, expected, 'bin/datasecure-mcp', dispatcher);
    for (const [index, target] of contract.targets.entries()) {
      const bytes = readSeaFile(path.join(launchersRoot, target.id, target.launcher));
      if (bytes.length !== targetEvidence[index].bytes || seaHash(bytes) !== targetEvidence[index].sha256) throw new Error('SEA_TARGET_CHANGED');
      const destination = target.os === 'win32' ? 'bin/' + target.launcher : 'server/runtime/' + target.id + '/' + target.launcher;
      writeStageFile(stage, expected, destination, bytes);
    }
    let mcp;
    const mcpBytes = readExpectedStageFile(stage, expected, '.mcp.json');
    try { mcp = JSON.parse(mcpBytes); } catch { throw new Error('SEA_PLUGIN_MCP_INVALID'); }
    if (!mcp || typeof mcp !== 'object' || Array.isArray(mcp) ||
        !mcp['data-secure-local'] || typeof mcp['data-secure-local'] !== 'object' ||
        Array.isArray(mcp['data-secure-local'])) throw new Error('SEA_PLUGIN_MCP_INVALID');
    mcp['data-secure-local'].command = contract.plugin_command;
    mcp['data-secure-local'].args = [];
    writeStageFile(stage, expected, '.mcp.json', JSON.stringify(mcp, null, 2) + '\n', true);
    writeStageFile(stage, expected, 'SEA-ENGINEERING-EVIDENCE.json', JSON.stringify({
      schema: 'datasecure-sea-plugin-assembly/v2', release_enabled: false,
      plugin_command: contract.plugin_command, node_version: contract.node_version,
      source_evidence: sourceEvidence, parser_boundary: PARSER_BOUNDARY, targets: targetEvidence
    }, null, 2) + '\n');
    const inventory = seaTreeInventory(stage);
    assertStageInventory(inventory, expected);
    const executable = expectedExecutableEntries(inventory.map(file => file.path));
    executable.add('bin/datasecure-mcp');
    for (const target of contract.targets) if (target.os !== 'win32') executable.add('server/runtime/' + target.id + '/' + target.launcher);
    const files = inventory.map(file => ({
      archivePath: file.path, fullPath: path.join(stage, file.path),
      mode: executable.has(file.path) ? 0o100755 : 0o100644
    }));
    const temporaryArchive = path.join(stage, '.sea-archive.zip');
    assertAbsent(temporaryArchive);
    const result = writeZip(temporaryArchive, files);
    const archiveBytes = readSeaFile(temporaryArchive, MAX_ASSEMBLY_BYTES);
    const modes = readCentralModes(archiveBytes);
    if (modes.size !== files.length || files.some(file => modes.get(file.archivePath) !== file.mode)) throw new Error('SEA_ARCHIVE_MODE_INVALID');
    assertArchivePayload(archiveBytes, expected);
    const sha256 = seaHash(archiveBytes);
    assertSeaDirectory(dist);
    assertAbsent(archive);
    // Atomic exclusive publication on this filesystem; never unlink or truncate
    // an existing destination. No unsafe copy/overwrite fallback is permitted.
    fs.linkSync(temporaryArchive, archive);
    fs.unlinkSync(temporaryArchive);
    return { archive, entries: result.entries, bytes: archiveBytes.length, sha256, release_enabled: false, targets: targetEvidence.length };
  } finally { cleanupStage(stage, stageIdentity); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = assembleSeaPlugin({ launchersRoot: path.resolve(argument('--launchers')),
    output: process.argv.includes('--output') ? argument('--output') : undefined });
  process.stdout.write(JSON.stringify(result) + '\n');
}
