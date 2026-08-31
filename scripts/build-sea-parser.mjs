// Engineering-only fixed-role parser builder. Uses an already present official
// archive, never downloads or substitutes the machine's Node runtime.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { assertSeaDirectory, readSeaFile, seaTreeInventory, seaHash } from './lib/sea-source-evidence.mjs';
import { bundleSeaParser, parserSeaConfig, parserToolchainEvidence } from './lib/sea-parser-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { readZip } = createRequire(import.meta.url)('../plugins/data-secure/server/zip-reader.js');
const contractBytes = readSeaFile(path.join(root, 'native/sea/launcher-contract.json'));
const contract = JSON.parse(contractBytes);
function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error('SEA_PARSER_ARGUMENT_MISSING');
  return process.argv[index + 1];
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || root, env: { ...process.env, NODE_OPTIONS: '' },
    windowsHide: true, shell: false, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) {
    let failures = [];
    try { const value = JSON.parse(result.stdout); failures = value.failures || [value.error]; } catch { /* fixed code below */ }
    const detail = failures.filter(value => typeof value === 'string' && /^[a-z:-]{1,80}$/.test(value)).join(',');
    throw new Error('SEA_PARSER_BUILD_FAILED' + (detail ? ':' + detail : ''));
  }
  return result.stdout;
}
const target = contract.targets.find(item => item.id === arg('--target'));
if (contract.release_enabled !== false || !target || target.os !== process.platform || target.arch !== process.arch) {
  throw new Error('SEA_PARSER_TARGET_INVALID');
}
// First bounded host slice; tar archive validation is not silently simulated.
if (target.id !== 'windows-x64') throw new Error('SEA_PARSER_ARCHIVE_VERIFIER_PENDING');
const archive = readSeaFile(path.resolve(arg('--node-archive')));
if (seaHash(archive) !== target.archive_sha256) throw new Error('SEA_PARSER_ARCHIVE_HASH_MISMATCH');
const nodeBytes = readZip(archive, { maxEntries: 20000, maxUncompressed: 512 * 1024 * 1024 }).get(target.node_path);
if (!nodeBytes) throw new Error('SEA_PARSER_NODE_MISSING');
const dist = path.join(root, 'dist');
assertSeaDirectory(dist);
const destination = path.resolve(arg('--output-dir'));
if (path.dirname(destination) !== dist || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,80}$/.test(path.basename(destination))) {
  throw new Error('SEA_PARSER_OUTPUT_UNSAFE');
}
try { fs.lstatSync(destination); throw new Error('SEA_PARSER_OUTPUT_EXISTS'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-parser-build-'));
try {
  const node = path.join(temporary, 'node.exe');
  fs.writeFileSync(node, nodeBytes, { flag: 'wx' });
  const status = JSON.parse(run(node, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})']));
  if (status.version !== contract.node_version || status.platform !== target.os || status.arch !== target.arch) throw new Error('SEA_PARSER_NODE_MISMATCH');
  const toolchain = parserToolchainEvidence(root);
  const bundle = await bundleSeaParser(root, target.id, contract.node_version);
  const { source } = bundle;
  fs.writeFileSync(path.join(temporary, 'parser.cjs'), source, { flag: 'wx' });
  const config = parserSeaConfig();
  fs.writeFileSync(path.join(temporary, 'config.json'), JSON.stringify(config), { flag: 'wx' });
  run(node, ['--experimental-sea-config', 'config.json'], { cwd: temporary });
  const executable = path.join(temporary, 'datasecure-parser.exe');
  fs.writeFileSync(executable, nodeBytes, { flag: 'wx' });
  run(process.execPath, [path.join(root, 'node_modules/postject/dist/cli.js'), executable,
    'NODE_SEA_BLOB', path.join(temporary, 'parser.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);
  const probe = JSON.parse(run(executable, ['--datasecure-parser-boundary-probe'], { cwd: temporary }));
  if (probe.schema !== 'datasecure-sea-parser-probe/v1' || probe.target !== target.id || probe.node_version !== contract.node_version ||
      probe.role !== 'parser' || probe.sea !== true || !Array.isArray(probe.failures) || probe.failures.length) throw new Error('SEA_PARSER_BOUNDARY_FAILED');
  const bytes = readSeaFile(executable);
  const evidence = { schema: 'datasecure-sea-parser-build/v1', release_enabled: false, role: 'parser', target: target.id,
    node_version: contract.node_version, archive_sha256: target.archive_sha256, node_sha256: seaHash(nodeBytes),
    bundle_sha256: bundle.bundle_sha256, launcher_contract_sha256: seaHash(contractBytes),
    inputs: bundle.inputs, toolchain,
    bytes: bytes.length, sha256: seaHash(bytes), config, probe };
  assertSeaDirectory(dist);
  fs.mkdirSync(destination); // Exclusive, no recursive/overwrite fallback.
  fs.writeFileSync(path.join(destination, 'datasecure-parser.exe'), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(destination, 'parser-build.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ target: target.id, bytes: bytes.length, sha256: evidence.sha256, probe }) + '\n');
} finally {
  assertSeaDirectory(temporary);
  seaTreeInventory(temporary);
  fs.rmSync(temporary, { recursive: true });
}
