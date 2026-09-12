// Source-level regressions never pretend to execute fixture runtimes. The
// optional artifact gate compares the real built ZIP and its final projection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildMarketplaceRepo, defaultZip } from '../scripts/build-marketplace-repo.mjs';
import { collectProductFiles, verifyProductSourceEntries, verifyBundledProductMcp,
  verifyBundledProductRuntimeLicense } from '../scripts/lib/product-files.mjs';
import { readCentralModes, writeZip } from '../scripts/lib/zip.mjs';
import { readContract, sha256 } from '../scripts/lib/bundled-runtime.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const source = path.join(root, 'plugins', 'data-secure');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
const entries = new Map(collectProductFiles(source).map(file => [file.archivePath, fs.readFileSync(file.fullPath)]));
verifyProductSourceEntries(entries, source);
const contract = readContract(root);
const mcpEntry = JSON.parse(entries.get('.mcp.json').toString('utf8'));
mcpEntry.mcpServers['data-secure-local'].command = contract.plugin_command;
entries.set('.mcp.json', Buffer.from(`${JSON.stringify(mcpEntry)}\n`));
assert.doesNotThrow(() => verifyBundledProductMcp(entries, source, contract));
const extraMcp = JSON.parse(entries.get('.mcp.json').toString('utf8'));
extraMcp.mcpServers['unreviewed-sidecar'] = { command: 'not-approved', args: [] };
const extraMcpEntries = new Map(entries);
extraMcpEntries.set('.mcp.json', Buffer.from(`${JSON.stringify(extraMcp)}\n`));
assert.throws(() => verifyBundledProductMcp(extraMcpEntries, source, contract), /PRODUCT_ARCHIVE_MCP_INVALID/u);
const license = Buffer.from('Node runtime license fixture\n'.repeat(12));
const licenseEvidence = { targets: [{ license_sha256: sha256(license), license_bytes: license.length }] };
const licenseEntries = new Map([['runtime/LICENSE.node.txt', license]]);
assert.doesNotThrow(() => verifyBundledProductRuntimeLicense(licenseEntries, licenseEvidence));
licenseEvidence.targets[0].license_sha256 = '0'.repeat(64);
assert.throws(() => verifyBundledProductRuntimeLicense(licenseEntries, licenseEvidence), /PRODUCT_RUNTIME_LICENSE_INVALID/u);
for (const name of ['server/mcp-server.js', '.claude-plugin/plugin.json',
  'skills/gbh-datasecure-dokument-anonymisieren/SKILL.md']) {
  assert.ok(entries.has(name));
  const changed = new Map(entries);
  changed.set(name, Buffer.concat([entries.get(name), Buffer.from('\n// stale candidate\n')]));
  assert.throws(() => verifyProductSourceEntries(changed, source), /PRODUCT_ARCHIVE_SOURCE_DRIFT/u);
  changed.delete(name);
  assert.throws(() => verifyProductSourceEntries(changed, source), /PRODUCT_ARCHIVE_SOURCE_DRIFT/u);
}
for (const name of ['server/obsolete-unused-review-module.js', 'skills/removed-skill/SKILL.md',
  'runtime/old-launcher', 'skills/gbh-datasecure-debug-anonymisieren/SKILL.md']) {
  const obsolete = new Map(entries);
  obsolete.set(name, Buffer.from('stale file'));
  assert.throws(() => verifyProductSourceEntries(obsolete, source), /PRODUCT_ARCHIVE_UNEXPECTED_FILE/u);
}

const hostTarget = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
  : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
    : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
if (hostTarget) {
  const expected = path.join(dist, `DataSecure-Privacy-Preflight-${hostTarget}-v${version}.zip`);
  if (fs.existsSync(expected)) assert.equal(defaultZip(version), expected);
  else assert.throws(() => defaultZip(version), /MARKETPLACE_REPO_ZIP_MISSING/u);
} else assert.throws(() => defaultZip(version), /MARKETPLACE_REPO_EXPLICIT_ZIP_REQUIRED/u);

// Real malformed ZIP: its matching version must not authorize deleting an
// existing projection. No runtime or parser mock participates in this check.
fs.mkdirSync(dist, { recursive: true });
const fixture = fs.mkdtempSync(path.join(dist, '.tmp-marketplace-projection-'));
const archive = `${fixture}-windows-x64-v${version}.zip`;
try {
  const manifest = path.join(fixture, 'sentinel.json');
  const sentinel = entries.get('.claude-plugin/plugin.json');
  fs.writeFileSync(manifest, sentinel);
  writeZip(archive, [{archivePath: '.claude-plugin/plugin.json', fullPath: manifest}]);
  assert.throws(() => buildMarketplaceRepo({zip: archive, output: fixture}), /PRODUCT_ARCHIVE_SOURCE_DRIFT/u);
  assert.deepEqual(fs.readdirSync(fixture), ['sentinel.json']);
  assert.ok(fs.readFileSync(manifest).equals(sentinel));
  writeZip(archive, [
    {archivePath: '.claude-plugin/plugin.json', fullPath: manifest},
    {archivePath: 'server/obsolete-unused-review-module.js', fullPath: manifest}
  ]);
  assert.throws(() => buildMarketplaceRepo({zip: archive, output: fixture}), /PRODUCT_ARCHIVE_UNEXPECTED_FILE/u);
  assert.deepEqual(fs.readdirSync(fixture), ['sentinel.json']);
  assert.ok(fs.readFileSync(manifest).equals(sentinel));
} finally {
  // Exact generated direct children; no recursive deletion or link traversal.
  assert.equal(path.dirname(fixture), dist);
  assert.equal(path.dirname(archive), dist);
  assert.ok(!fs.lstatSync(fixture).isSymbolicLink());
  for (const name of fs.readdirSync(fixture)) {
    assert.equal(name, 'sentinel.json');
    const file = path.join(fixture, name);
    assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
    fs.unlinkSync(file);
  }
  fs.rmdirSync(fixture);
  if (fs.existsSync(archive)) {
    assert.ok(fs.lstatSync(archive).isFile() && !fs.lstatSync(archive).isSymbolicLink());
    fs.unlinkSync(archive);
  }
}

if (process.argv.includes('--artifact')) {
  const archiveFile = defaultZip(version);
  const bytes = fs.readFileSync(archiveFile);
  const actualEntries = readZip(bytes), modes = readCentralModes(bytes);
  const output = path.join(dist, 'marketplace-repo');
  const evidence = JSON.parse(fs.readFileSync(path.join(output, 'PROJECTION-EVIDENCE.json')));
  assert.equal(evidence.archive, path.basename(archiveFile));
  assert.equal(evidence.archive_sha256, sha256(bytes));
  assert.equal(evidence.target, hostTarget);
  assert.equal(evidence.source_bytes_verified, true);
  assert.equal(evidence.native_execution_verified, false, 'projection is not execution evidence');
  verifyProductSourceEntries(actualEntries, source, {targets: [hostTarget]});
  for (const [name, content] of actualEntries) {
    const file = path.join(output, 'plugins', 'data-secure', ...name.split('/'));
    assert.ok(fs.readFileSync(file).equals(content), `actual projected bytes: ${name}`);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, modes.get(name) & 0o777);
  }
  console.log(`Marketplace actual ZIP projection PASS: ${evidence.target} ${evidence.archive_sha256}`);
}
console.log('Marketplace source drift, exact host choice and failure-before-write: PASS');
