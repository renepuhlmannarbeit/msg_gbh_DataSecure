// Verify an exact self-contained Cowork product ZIP. A source-only archive or
// an Engineering SEA/OCR/MCPB payload is rejected rather than being mistaken
// for a user-facing product.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readCentralModes } from './lib/zip.mjs';
import { collectProductFiles, verifyKeyringFreeProductEntries } from './lib/product-files.mjs';
import { readContract, sha256 } from './lib/bundled-runtime.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const contract = readContract(root);

function archiveArgument() {
  const index = process.argv.indexOf('--archive');
  if (index >= 0) {
    if (!process.argv[index + 1]) throw new Error('PRODUCT_ARCHIVE_ARGUMENT_MISSING');
    const value = path.resolve(process.argv[index + 1]);
    if (path.dirname(value) !== path.join(root, 'dist')) throw new Error('PRODUCT_ARCHIVE_PATH_UNSAFE');
    return value;
  }
  const host = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
    : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
      : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
  if (!host) throw new Error('PRODUCT_ARCHIVE_HOST_UNSUPPORTED');
  return path.join(root, 'dist', `DataSecure-Privacy-Preflight-${host}-v${pkg.version}.zip`);
}

function expectedRuntimeNames(targets) {
  const names = new Set(['runtime/LICENSE.node.txt']);
  if (targets.some((target) => target.target === 'windows-x64')) names.add('runtime/datasecure-node.exe');
  if (targets.some((target) => target.target.startsWith('macos-'))) {
    names.add('runtime/datasecure-node');
    for (const target of targets.filter((item) => item.target.startsWith('macos-'))) {
      names.add(`runtime/targets/${target.target}/node`);
    }
  }
  return names;
}

const archive = archiveArgument();
if (!fs.existsSync(archive)) throw new Error(`Plugin ZIP fehlt: ${path.basename(archive)}`);
const bytes = fs.readFileSync(archive);
const entries = readZip(bytes);
const evidenceBytes = entries.get('RUNTIME-EVIDENCE.json');
if (!evidenceBytes) throw new Error('PRODUCT_RUNTIME_EVIDENCE_MISSING');
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
if (evidence.schema !== 'datasecure-bundled-plugin/v1' || evidence.product_version !== pkg.version ||
    evidence.host_node_required !== false || evidence.runtime_dependency_install !== false ||
    evidence.plugin_command !== contract.plugin_command || !Array.isArray(evidence.targets) || !evidence.targets.length) {
  throw new Error('PRODUCT_RUNTIME_EVIDENCE_INVALID');
}
const targetIds = evidence.targets.map((item) => item.target);
const allowed = contract.targets.map((item) => item.id);
if (new Set(targetIds).size !== targetIds.length || targetIds.some((id) => !allowed.includes(id)) ||
    (evidence.mode === 'marketplace-universal' ? targetIds.length !== allowed.length : targetIds.length !== 1)) {
  throw new Error('PRODUCT_RUNTIME_TARGETS_INVALID');
}
const limit = evidence.mode === 'marketplace-universal' ? contract.archive_limit_bytes : contract.direct_upload_limit_bytes;
if (bytes.length > limit) throw new Error('PRODUCT_ARCHIVE_BUDGET_EXCEEDED');
const license = entries.get('runtime/LICENSE.node.txt');
if (!license || new Set(evidence.targets.map((item) => item.license_sha256)).size !== 1 ||
    evidence.targets.some((item) => item.license_sha256 !== sha256(license) || item.license_bytes !== license.length)) {
  throw new Error('PRODUCT_RUNTIME_LICENSE_INVALID');
}
const runtimeNames = expectedRuntimeNames(evidence.targets);
for (const name of runtimeNames) if (!entries.has(name)) throw new Error(`PRODUCT_RUNTIME_MISSING:${name}`);
for (const target of evidence.targets) {
  const name = target.target === 'windows-x64' ? 'runtime/datasecure-node.exe' : `runtime/targets/${target.target}/node`;
  const runtime = entries.get(name);
  if (!runtime || target.bytes !== runtime.length || target.sha256 !== sha256(runtime)) throw new Error(`PRODUCT_RUNTIME_HASH_INVALID:${name}`);
}
if ([...entries.keys()].some((name) => name === 'bin' || name.startsWith('bin/') ||
    name.startsWith('server/ocr-runtime') || name.endsWith('.mcpb'))) {
  throw new Error('PRODUCT_ENGINEERING_PAYLOAD_FORBIDDEN');
}
const mcp = JSON.parse(entries.get('.mcp.json') || 'null');
assert.equal(mcp?.['data-secure-local']?.command, contract.plugin_command);
assert.deepEqual(mcp?.['data-secure-local']?.args, [contract.runtime_entry]);

// Every canonical product source byte must be present unchanged, except for
// .mcp.json (rewritten to the bundled launcher); runtime evidence is additive.
for (const file of collectProductFiles(path.join(root, 'plugins', 'data-secure'))) {
  if (file.archivePath === '.mcp.json') continue;
  if (!entries.get(file.archivePath)?.equals(fs.readFileSync(file.fullPath))) {
    throw new Error(`PRODUCT_ARCHIVE_SOURCE_DRIFT:${file.archivePath}`);
  }
}
verifyKeyringFreeProductEntries(entries);
const modes = readCentralModes(bytes);
if (modes.size !== entries.size) throw new Error('PRODUCT_ARCHIVE_MODE_INVENTORY');
for (const name of entries.keys()) {
  const executable = name === 'runtime/datasecure-node' || /^runtime\/targets\/macos-(?:x64|arm64)\/node$/u.test(name);
  if (modes.get(name) !== (executable ? 0o100755 : 0o100644)) throw new Error(`PRODUCT_ARCHIVE_MODE_INVALID:${name}`);
}

const target = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-product-zip-'));
try {
  for (const [name, value] of entries) {
    const destination = path.resolve(target, ...name.split('/'));
    if (!destination.startsWith(`${path.resolve(target)}${path.sep}`)) throw new Error('PRODUCT_ARCHIVE_PATH_TRAVERSAL');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, value, { flag: 'wx' });
  }
  for (const test of ['test-contract-skill-acceptance.js', 'test-contract-skill-matrix.js']) {
    const result = spawnSync(process.execPath, [path.join(root, 'tests', test), target], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
} finally {
  fs.rmSync(target, { recursive: true });
}
console.log(`Self-contained product ZIP: PASS (${path.basename(archive)}, ${entries.size} entries, ${targetIds.join(', ')})`);
