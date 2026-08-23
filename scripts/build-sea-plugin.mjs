import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'native', 'sea', 'launcher-contract.json'), 'utf8'));

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file, code) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(code);
  }
}

function binaryMatchesTarget(file, target) {
  const bytes = fs.readFileSync(file);
  if (target.os === 'win32') {
    if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
    const pe = bytes.readUInt32LE(0x3c);
    return pe + 6 <= bytes.length && bytes.subarray(pe, pe + 4).equals(Buffer.from('PE\0\0')) &&
      bytes.readUInt16LE(pe + 4) === 0x8664;
  }
  if (target.os === 'linux') {
    return bytes.length >= 20 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 0x3e;
  }
  if (target.os === 'darwin') {
    const expectedCpu = target.arch === 'arm64' ? 0x0100000c : 0x01000007;
    return bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) &&
      bytes.readUInt32LE(4) === expectedCpu;
  }
  return false;
}

const launchersRoot = path.resolve(argument('--launchers'));
const dist = path.join(root, 'dist');
const stage = path.join(dist, '.sea-plugin-stage');
const source = path.join(root, 'plugins', 'data-secure');
const outputIndex = process.argv.indexOf('--output');
const targetEvidence = [];

if (contract.release_enabled !== false) throw new Error('SEA_RELEASE_SWITCH_MUST_REMAIN_FALSE');

for (const target of contract.targets) {
  const directory = path.join(launchersRoot, target.id);
  const launcher = path.join(directory, target.launcher);
  let stat;
  try {
    stat = fs.lstatSync(launcher);
  } catch {
    throw new Error(`SEA_TARGET_MISSING:${target.id}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`SEA_TARGET_UNSAFE:${target.id}`);
  if (!binaryMatchesTarget(launcher, target)) throw new Error(`SEA_TARGET_ARCH_MISMATCH:${target.id}`);
  const digest = sha256(launcher);
  const build = readJson(`${launcher}.evidence.json`, `SEA_BUILD_EVIDENCE_INVALID:${target.id}`);
  const mcp = readJson(`${launcher}.mcp-evidence.json`, `SEA_MCP_EVIDENCE_INVALID:${target.id}`);
  if (build.schema !== 'datasecure-sea-build-evidence/v1' || build.release_enabled !== false ||
      build.target !== target.id || build.node_version !== contract.node_version ||
      build.postject_version !== contract.postject_version || build.sha256 !== digest ||
      build.runtime_probe?.sea !== true || build.runtime_probe?.target !== target.id) {
    throw new Error(`SEA_BUILD_EVIDENCE_MISMATCH:${target.id}`);
  }
  if (mcp.schema !== 'datasecure-sea-mcp-evidence/v1' || mcp.release_enabled !== false ||
      mcp.target !== target.id || mcp.launcher_sha256 !== digest ||
      mcp.plugin_command !== contract.plugin_command || mcp.runtime_mode !== 'self_contained_node' ||
      mcp.runtime_target !== target.id || mcp.host_node_required !== false ||
      mcp.path_empty !== true || mcp.node_options_ignored !== true ||
      mcp.raw_content_sent_to_claude !== false) {
    throw new Error(`SEA_MCP_EVIDENCE_MISMATCH:${target.id}`);
  }
  targetEvidence.push({ target: target.id, sha256: digest, bytes: stat.size });
}

fs.rmSync(stage, { recursive: true, force: true });
try {
  fs.cpSync(source, stage, { recursive: true, errorOnExist: true, force: false });
  const bin = path.join(stage, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.copyFileSync(path.join(root, contract.posix_dispatcher), path.join(bin, 'datasecure-mcp'));
  for (const target of contract.targets) {
    const launcher = path.join(launchersRoot, target.id, target.launcher);
    const destination = target.os === 'win32'
      ? path.join(bin, target.launcher)
      : path.join(stage, 'server', 'runtime', target.id, target.launcher);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(launcher, destination);
  }
  const mcpFile = path.join(stage, '.mcp.json');
  const mcp = readJson(mcpFile, 'SEA_PLUGIN_MCP_INVALID');
  mcp['data-secure-local'].command = contract.plugin_command;
  mcp['data-secure-local'].args = [];
  fs.writeFileSync(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`, 'utf8');

  const assembly = {
    schema: 'datasecure-sea-plugin-assembly/v1',
    release_enabled: false,
    plugin_command: contract.plugin_command,
    node_version: contract.node_version,
    targets: targetEvidence
  };
  fs.writeFileSync(path.join(stage, 'SEA-ENGINEERING-EVIDENCE.json'),
    `${JSON.stringify(assembly, null, 2)}\n`, 'utf8');

  const plugin = readJson(path.join(stage, '.claude-plugin', 'plugin.json'), 'SEA_PLUGIN_MANIFEST_INVALID');
  const archive = outputIndex >= 0 && process.argv[outputIndex + 1]
    ? path.resolve(process.argv[outputIndex + 1])
    : path.join(dist, `DataSecure-Privacy-Preflight-SEA-Engineering-v${plugin.version}.zip`);
  const relative = path.relative(dist, archive);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('SEA_PLUGIN_OUTPUT_OUTSIDE_DIST');
  }
  const executable = new Set([
    'bin/datasecure-mcp',
    ...contract.targets.filter((target) => target.os !== 'win32')
      .map((target) => `server/runtime/${target.id}/${target.launcher}`)
  ]);
  const files = collectFiles(stage).map((file) => ({
    ...file,
    mode: executable.has(file.archivePath) ? 0o100755 : 0o100644
  }));
  fs.rmSync(archive, { force: true });
  const result = writeZip(archive, files);
  const archiveSha256 = sha256(archive);
  process.stdout.write(`${JSON.stringify({
    archive,
    entries: result.entries,
    bytes: result.bytes,
    sha256: archiveSha256,
    release_enabled: false,
    targets: targetEvidence.length
  })}\n`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
