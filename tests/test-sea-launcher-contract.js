'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Self-contained MCP launcher contract');
const root = path.join(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'native', 'sea', 'launcher-contract.json'), 'utf8'));
const bootstrap = fs.readFileSync(path.join(root, 'native', 'sea', 'bootstrap.cjs'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'scripts', 'build-sea-launcher.mjs'), 'utf8');
const provenance = fs.readFileSync(path.join(root, 'scripts/lib/sea-launcher-provenance.mjs'), 'utf8');
const verifier = fs.readFileSync(path.join(root, 'scripts', 'verify-sea-launcher.mjs'), 'utf8');
const dispatcher = fs.readFileSync(path.join(root, 'native', 'sea', 'datasecure-mcp'), 'utf8');
const pluginMcp = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'data-secure', '.mcp.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('contract pins one official Node LTS and four target archives by SHA-256', () => {
  assert.strictEqual(contract.schema, 'datasecure-sea-launcher-contract/v1');
  assert.strictEqual(contract.release_enabled, false);
  assert.match(contract.node_version, /^22\.\d+\.\d+$/);
  assert.deepStrictEqual(contract.targets.map((target) => target.id),
    ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']);
  for (const target of contract.targets) {
    assert.match(target.archive_sha256, /^[a-f0-9]{64}$/);
    assert.ok(target.node_path && target.launcher);
  }
});

test('bootstrap exposes only a fixed probe and loads the adjacent inspected server tree', () => {
  assert.strictEqual((bootstrap.match(/__DATASECURE_TARGET__/g) || []).length, 1);
  assert.strictEqual((bootstrap.match(/__DATASECURE_NODE_VERSION__/g) || []).length, 1);
  assert.strictEqual((bootstrap.match(/__DATASECURE_PARSER_ROLE_JSON__/g) || []).length, 1);
  assert.match(bootstrap, /Object\.defineProperty\(globalThis, '__DATASECURE_PARSER_ROLE__'/);
  assert.match(bootstrap, /Object\.freeze\(PARSER_ROLE\.server_files\)/);
  assert.match(builder, /await loadParserRole\(/);
  assert.match(builder, /SEA_PARENT_ARCHIVE_HASH_MISMATCH/);
  assert.match(builder, /COPYFILE_EXCL/);
  assert.match(bootstrap, /createRequire\(entry\)\(entry\)/);
  assert.match(bootstrap, /fs\.lstatSync\(entry\)/);
  assert.match(bootstrap, /stat\.isSymbolicLink\(\)/);
  assert.doesNotMatch(bootstrap, /https?:|fetch\(|node:(?:http|https|net|tls|dns)/);
});

test('one extensionless plugin command has a closed Windows and POSIX dispatch layout', () => {
  assert.strictEqual(contract.plugin_command, '${CLAUDE_PLUGIN_ROOT}/bin/datasecure-mcp');
  assert.strictEqual(contract.dispatch_status, 'unreleased-fixed-single-plugin-dispatcher');
  assert.match(dispatcher, /Darwin:x86_64\) TARGET=macos-x64/);
  assert.match(dispatcher, /Darwin:arm64\) TARGET=macos-arm64/);
  assert.match(dispatcher, /Linux:x86_64\) TARGET=linux-x64/);
  assert.match(dispatcher, /DATASECURE_RUNTIME_UNSUPPORTED/);
  assert.match(dispatcher, /\[ -L "\$\{LAUNCHER\}" \]/);
  assert.doesNotMatch(dispatcher, /curl|wget|npm|npx|powershell|cmd\.exe/i);
});

test('builder refuses cross-target execution and disables snapshots, code cache and NODE_OPTIONS', () => {
  assert.match(builder, /target\.os !== process\.platform \|\| target\.arch !== process\.arch/);
  assert.match(provenance, /useSnapshot: false/);
  assert.match(provenance, /useCodeCache: false/);
  assert.match(provenance, /execArgvExtension: 'none'/);
  assert.match(provenance, /main: 'bootstrap.cjs'/);
  assert.match(provenance, /output: 'sea-prep.blob'/);
  assert.match(builder, /prepareLauncherProvenance\(root, target.id, parserRole\)/);
  assert.match(builder, /fs.writeFileSync\(main, prepared.bootstrap/);
  assert.match(builder, /JSON.stringify\(prepared.config\)/);
  assert.match(builder, /assertLauncherProvenance\(prepared.provenance, prepareLauncherProvenance/);
  assert.match(builder, /assertLauncherBuildEvidence\(evidence, bytes, prepared\)/);
  assert.match(builder, /cwd: temporary/);
  assert.match(builder, /SEA runtime probe mismatch/);
});

test('pilot verifier distinguishes normal/support startup and refuses unproved worker evidence', () => {
  assert.match(verifier, /PATH: ''/);
  assert.match(verifier, /NODE_OPTIONS: '--require=datasecure-must-not-be-loaded'/);
  assert.match(verifier, /method: 'initialize'/);
  assert.match(verifier, /name: 'privacy_status'/);
  assert.match(verifier, /runtime_mode !== 'self_contained_node'/);
  assert.match(verifier, /host_node_required !== false/);
  assert.match(verifier, /method: 'tools\/list'/);
  assert.match(verifier, /EU_PRIVACY_SUPPORT_MODE: '1'/);
  assert.match(verifier, /createSeaSourceEvidence/);
  assert.match(verifier, /execPath: launcher/);
  assert.match(verifier, /SEA_PARSER_CORE_FAILED/);
  assert.match(verifier, /throw new Error\('SEA_PARSER_NEGATIVE_EVIDENCE_REQUIRED'\)/);
  assert.doesNotMatch(verifier, /fs\.writeFileSync\([^\n]*\.mcp-evidence/);
});

test('postject is development-only and the released product command remains unchanged', () => {
  assert.strictEqual(pkg.devDependencies.postject, contract.postject_version);
  assert.ok(!pkg.dependencies || !pkg.dependencies.postject);
  assert.deepStrictEqual(Object.keys(pluginMcp), ['mcpServers']);
  assert.strictEqual(pluginMcp.mcpServers['data-secure-local'].command, 'node');
});

done();
