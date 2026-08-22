'use strict';

// Guards the four places that describe the same artefact: package.json, the
// MCPB manifest, the Claude plugin manifest and the marketplace entry. Version
// drift between them used to be invisible until a user installed the plugin.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Manifest consistency');

const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'plugins', 'data-secure', 'server');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readText = (p) => fs.readFileSync(p, 'utf8');

const pkg = readJson(path.join(root, 'package.json'));
const mcpb = readJson(path.join(root, 'manifest.json'));
const plugin = readJson(path.join(root, 'plugins', 'data-secure', '.claude-plugin', 'plugin.json'));
const marketplace = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
const buildInfo = readJson(path.join(root, 'BUILD_INFO.json'));
const versionFile = readText(path.join(root, 'plugins', 'data-secure', 'VERSION')).trim();

test('every manifest declares the same version', () => {
  const sources = {
    'package.json': pkg.version,
    'manifest.json': mcpb.version,
    'plugin.json': plugin.version,
    'BUILD_INFO.json': buildInfo.version,
    VERSION: versionFile
  };
  const distinct = [...new Set(Object.values(sources))];
  assert.strictEqual(
    distinct.length,
    1,
    `version drift: ${JSON.stringify(sources)}`
  );
});

test('the runtime version module matches package.json', () => {
  const { VERSION } = require(path.join(runtime, 'version.js'));
  assert.strictEqual(VERSION, pkg.version, 'run `npm run version:sync`');
});

test('no runtime module hard-codes a version literal of its own', () => {
  const literal = /['"`]\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?['"`]/;
  for (const rel of ['gateway/common.js', 'index.js']) {
    const text = readText(path.join(runtime, rel));
    assert.ok(
      !literal.test(text),
      `${rel} hard-codes a version; require ./version.js instead so releases cannot drift`
    );
  }
});

test('every skill declares the same version as the plugin', () => {
  const skillsDir = path.join(root, 'plugins', 'data-secure', 'skills');
  for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, 'SKILL.md');
    const text = readText(file);
    const match = /^version:\s*(.+)$/m.exec(text);
    assert.ok(match, `${name}/SKILL.md has no version field`);
    assert.strictEqual(match[1].trim(), plugin.version, `${name}/SKILL.md version drift`);
  }
});

test('MCPB manifest declares the fields the runtime relies on', () => {
  assert.strictEqual(mcpb.manifest_version, '0.4');
  assert.strictEqual(mcpb.server.type, 'node');
  assert.strictEqual(mcpb.server.entry_point, 'server/index.js');
  assert.deepStrictEqual(mcpb.compatibility.platforms, ['win32']);
  assert.match(mcpb.compatibility.runtimes.node, /^>=\s*2[2-9]/);
  for (const key of ['root_dir', 'language', 'visual_mode', 'retention_days']) {
    assert.ok(mcpb.user_config[key], `user_config.${key} missing`);
  }
  for (const key of ['root_dir', 'language', 'visual_mode', 'retention_days']) {
    assert.ok(
      JSON.stringify(mcpb.server.mcp_config.env).includes(`user_config.${key}`),
      `env does not wire user_config.${key}`
    );
  }
});

test('PDF is declared blocked until the native coverage contract is released', () => {
  assert.ok(!buildInfo.formats.includes('pdf'), 'PDF must not appear in released formats');
  assert.deepStrictEqual(buildInfo.blocked_formats, ['pdf']);
  assert.match(mcpb.long_description, /PDF.*sicher gesperrt/u);
  assert.match(readText(path.join(runtime, 'runtime.js')), /PDF_COVERAGE_UNVERIFIED/u);
  assert.strictEqual(fs.existsSync(path.join(runtime, 'pdf-lite.js')), false, 'legacy PDF parser must not ship');
  assert.strictEqual(fs.existsSync(path.join(root, 'tests', 'helpers', 'legacy-pdf-lite.js')), true);
});

// The server declares its tables as `const TOOLS=[...]` / `const PROMPTS=[...]`.
// Reading the names out of the source keeps this check free of a server import.
function declaredNames(source, table) {
  const start = source.indexOf(`const ${table}=[`);
  assert.notStrictEqual(start, -1, `could not find const ${table}=[ in server/index.js`);
  const end = source.indexOf('];', start);
  const body = source.slice(start, end === -1 ? source.length : end);
  // Only top level entries carry a title; nested argument objects do not.
  return [...body.matchAll(/\{\s*name:\s*'([a-z_]+)',\s*title:/g)].map((m) => m[1]);
}

test('MCPB tool list matches the tools the server exposes', () => {
  const index = readText(path.join(runtime, 'index.js'));
  const exposed = declaredNames(index, 'TOOLS');
  const declared = mcpb.tools.map((t) => t.name);
  assert.ok(exposed.length > 0, 'could not read the server tool table');
  assert.deepStrictEqual(
    [...declared].sort(),
    [...exposed].sort(),
    'manifest.json tools and server TOOLS disagree'
  );
});

test('MCPB prompt list matches the prompts the server exposes', () => {
  const index = readText(path.join(runtime, 'index.js'));
  const exposed = declaredNames(index, 'PROMPTS');
  const declared = mcpb.prompts.map((p) => p.name);
  assert.deepStrictEqual([...declared].sort(), [...exposed].sort(), 'prompt lists disagree');
});

test('marketplace entry points at the plugin directory that exists', () => {
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, `marketplace has no entry for ${plugin.name}`);
  const target = path.resolve(root, entry.source);
  assert.ok(fs.existsSync(target), `marketplace source ${entry.source} does not exist`);
  assert.ok(
    fs.existsSync(path.join(target, '.claude-plugin', 'plugin.json')),
    'marketplace source is not a plugin directory'
  );
});

test('the plugin ships a runnable MCP entry point', () => {
  const serverEntry = path.join(root, 'plugins', 'data-secure', 'server', 'index.js');
  assert.ok(fs.existsSync(serverEntry), 'plugin server/index.js missing');
  const text = readText(serverEntry);
  assert.ok(
    !/require\((['"])(?:\.\.\/){2,}/.test(text),
    'plugin server entry point escapes the plugin root; a marketplace install would not resolve it'
  );
});

test('the MCP config uses the plugin root placeholder', () => {
  const mcp = readJson(path.join(root, 'plugins', 'data-secure', '.mcp.json'));
  const server = mcp['data-secure-local'];
  assert.ok(server, 'data-secure-local server missing');
  assert.strictEqual(server.command, 'node');
  assert.deepStrictEqual(server.args, ['${CLAUDE_PLUGIN_ROOT}/server/index.js']);
  assert.strictEqual(server.env.EU_PRIVACY_RETENTION_DAYS, '7');
});

test('no npm runtime dependencies are declared', () => {
  assert.ok(!pkg.dependencies, 'the offline promise forbids runtime dependencies');
  assert.strictEqual(buildInfo.runtime.includes('no npm'), true);
});

test('native Windows launcher has a reproducible source and release build contract', () => {
  assert.strictEqual(pkg.scripts.pretest, 'npm run native:verify');
  assert.strictEqual(pkg.scripts.prebuild, 'npm run native:verify');
  assert.strictEqual(pkg.scripts['native:update'], 'node scripts/build-native.mjs --update');
  assert.strictEqual(pkg.scripts['native:repro'], 'node scripts/build-native.mjs --verify-reproducible');
  assert.strictEqual(pkg.scripts['native:analyze'], 'node scripts/build-native.mjs --analyze');
  assert.strictEqual(pkg.scripts.posttest, 'node tests/test-native-launcher.js');
  for (const rel of [
    'native/windows/datasecure-sandbox.cpp',
    'scripts/build-native.mjs',
    'scripts/verify-native.mjs',
    'scripts/lib/native-artifact.mjs',
    'tests/test-native-launcher.js',
    'plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe',
    'plugins/data-secure/server/native/windows-x64/datasecure-sandbox.sha256'
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), `native boundary input missing: ${rel}`);
  }
  for (const rel of ['scripts/build-plugin.mjs', 'scripts/build-mcpb.mjs']) {
    assert.match(readText(path.join(root, rel)), /datasecure-sandbox\.exe/,
      `${rel} does not enforce native launcher packaging`);
  }
  const binary = path.join(root, 'plugins', 'data-secure', 'server', 'native', 'windows-x64', 'datasecure-sandbox.exe');
  const expected = readText(binary.replace(/\.exe$/u, '.sha256')).trim();
  const actual = crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  assert.strictEqual(actual, expected, 'tracked native launcher does not match its checksum');
});

test('Claude plugin avoids the reserved top-level bin directory', () => {
  assert.strictEqual(
    fs.existsSync(path.join(root, 'plugins', 'data-secure', 'bin')),
    false,
    'Claude Desktop rejects uploaded plugins that contain a top-level bin directory'
  );
});

test('every test referenced by the npm test script exists', () => {
  const script = pkg.scripts.test;
  const referenced = [...script.matchAll(/node\s+(tests\/[\w.-]+)/g)].map((m) => m[1]);
  assert.ok(referenced.length >= 5, 'test script does not reference the suite');
  for (const rel of referenced) {
    assert.ok(fs.existsSync(path.join(root, rel)), `test script references missing file ${rel}`);
  }
});

test('the repository declares a license consistently', () => {
  assert.ok(pkg.license, 'package.json has no license field');
  assert.strictEqual(plugin.license, pkg.license, 'plugin.json and package.json license differ');
  assert.ok(
    fs.existsSync(path.join(root, 'LICENSE')),
    'a LICENSE file is required, also for UNLICENSED/proprietary code'
  );
});

done();
