import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProductFiles, verifyKeyringFreeProductFiles } from './lib/product-files.mjs';
import { writeZip, readCentralModes } from './lib/zip.mjs';
import { readContract, readRegular, sha256, verifyTargetEvidence } from './lib/bundled-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`BUNDLED_PLUGIN_ARGUMENT_MISSING:${name}`);
  return process.argv[index + 1];
}

function safeStage(stage) {
  const resolved = path.resolve(stage), base = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== base || !/^datasecure-runtime-plugin-[A-Za-z0-9_-]+$/u.test(path.basename(resolved))) {
    throw new Error('BUNDLED_PLUGIN_STAGE_UNSAFE');
  }
  return resolved;
}

function copyRegular(source, destination, mode = 0o600) {
  const bytes = readRegular(source, 128 * 1024 * 1024);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode });
  return bytes;
}

export function buildRuntimePlugin({ repositoryRoot = root, runtimesRoot, targetId, output } = {}) {
  const repository = path.resolve(repositoryRoot);
  const contract = readContract(repository);
  const selected = targetId === 'universal' ? contract.targets : contract.targets.filter((item) => item.id === targetId);
  if (!selected.length || (targetId !== 'universal' && selected.length !== 1)) throw new Error('BUNDLED_PLUGIN_TARGET_INVALID');
  const pluginRoot = path.join(repository, 'plugins', 'data-secure');
  const plugin = JSON.parse(readRegular(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 64 * 1024));
  const dist = path.join(repository, 'dist');
  const suffix = targetId === 'universal' ? 'universal-marketplace' : targetId;
  const archive = output ? path.resolve(output) : path.join(dist, `DataSecure-Privacy-Preflight-${suffix}-v${plugin.version}.zip`);
  if (path.dirname(archive) !== dist || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/u.test(path.basename(archive))) {
    throw new Error('BUNDLED_PLUGIN_OUTPUT_UNSAFE');
  }
  const targetEvidence = [];
  for (const target of selected) {
    const directory = path.join(path.resolve(runtimesRoot), target.id);
    const launcher = path.join(directory, target.launcher);
    let bytes, licenseBytes, evidence;
    try {
      bytes = readRegular(launcher, 128 * 1024 * 1024);
      licenseBytes = readRegular(path.join(directory, 'LICENSE.node.txt'), 2 * 1024 * 1024);
      evidence = JSON.parse(readRegular(path.join(directory, 'runtime-evidence.json'), 64 * 1024));
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`BUNDLED_PLUGIN_RUNTIME_MISSING:${target.id}`);
      throw error;
    }
    verifyTargetEvidence(evidence, bytes, licenseBytes, target, contract);
    targetEvidence.push({ target: target.id, bytes: bytes.length, sha256: sha256(bytes),
      license_bytes: licenseBytes.length, license_sha256: sha256(licenseBytes) });
  }
  const stage = safeStage(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-runtime-plugin-')));
  try {
    const sourceFiles = collectProductFiles(pluginRoot);
    verifyKeyringFreeProductFiles(sourceFiles);
    for (const file of sourceFiles) copyRegular(file.fullPath, path.join(stage, ...file.archivePath.split('/')));
    const mcpFile = path.join(stage, '.mcp.json');
    const mcp = JSON.parse(readRegular(mcpFile, 64 * 1024));
    const server = mcp?.['data-secure-local'];
    if (!server || server.command !== 'node' || JSON.stringify(server.args) !== JSON.stringify([contract.runtime_entry])) {
      throw new Error('BUNDLED_PLUGIN_MCP_SOURCE_INVALID');
    }
    server.command = contract.plugin_command;
    fs.writeFileSync(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`, { flag: 'w', mode: 0o600 });

    const executable = new Set();
    if (selected.some((item) => item.os === 'darwin')) {
      copyRegular(path.join(repository, 'native', 'runtime', 'datasecure-node'), path.join(stage, 'runtime', 'datasecure-node'), 0o700);
      executable.add('runtime/datasecure-node');
    }
    for (const [index, target] of selected.entries()) {
      const source = path.join(path.resolve(runtimesRoot), target.id, target.launcher);
      const destination = target.os === 'win32'
        ? path.join(stage, 'runtime', 'datasecure-node.exe')
        : path.join(stage, 'runtime', 'targets', target.id, 'node');
      copyRegular(source, destination, target.os === 'win32' ? 0o600 : 0o700);
      if (target.os !== 'win32') executable.add(path.relative(stage, destination).split(path.sep).join('/'));
      if (sha256(readRegular(destination, 128 * 1024 * 1024)) !== targetEvidence[index].sha256) throw new Error('BUNDLED_PLUGIN_RUNTIME_CHANGED');
    }
    const licenseHashes = new Set(targetEvidence.map((item) => item.license_sha256));
    if (licenseHashes.size !== 1) throw new Error('BUNDLED_PLUGIN_LICENSE_MISMATCH');
    copyRegular(path.join(path.resolve(runtimesRoot), selected[0].id, 'LICENSE.node.txt'),
      path.join(stage, 'runtime', 'LICENSE.node.txt'));
    fs.writeFileSync(path.join(stage, 'RUNTIME-EVIDENCE.json'), `${JSON.stringify({
      schema: 'datasecure-bundled-plugin/v1', product_version: plugin.version,
      mode: targetId === 'universal' ? 'marketplace-universal' : 'direct-upload-target',
      host_node_required: false, runtime_dependency_install: false,
      plugin_command: contract.plugin_command, targets: targetEvidence
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

    const files = collectProductFiles(stage).map((file) => ({ ...file, mode: executable.has(file.archivePath) ? 0o100755 : 0o100644 }));
    if (files.some((file) => file.archivePath === 'bin' || file.archivePath.startsWith('bin/') || file.archivePath.startsWith('server/ocr-runtime'))) {
      throw new Error('BUNDLED_PLUGIN_PRODUCT_INVENTORY_INVALID');
    }
    fs.mkdirSync(dist, { recursive: true });
    const temporary = `${archive}.tmp-${process.pid}`;
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = writeZip(temporary, files);
    const limit = targetId === 'universal' ? contract.archive_limit_bytes : contract.direct_upload_limit_bytes;
    if (result.bytes > limit) throw new Error('BUNDLED_PLUGIN_ARCHIVE_LIMIT');
    const modes = readCentralModes(readRegular(temporary, limit));
    for (const file of files) if (modes.get(file.archivePath) !== file.mode) throw new Error('BUNDLED_PLUGIN_ARCHIVE_MODE');
    try { fs.unlinkSync(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.renameSync(temporary, archive);
    const bytes = readRegular(archive, limit);
    return { archive, entries: result.entries, bytes: bytes.length, sha256: sha256(bytes), targets: selected.length, target: targetId };
  } finally {
    safeStage(stage);
    fs.rmSync(stage, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildRuntimePlugin({ runtimesRoot: path.resolve(argument('--runtimes')),
    targetId: argument('--target') });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
