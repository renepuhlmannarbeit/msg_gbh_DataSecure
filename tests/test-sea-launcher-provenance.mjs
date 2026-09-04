// Synthetic source/evidence contracts only. No SEA executables, product jobs,
// credentials, network requests or native acceptance probes are executed.
// The isolated temporary fixture is intentionally retained for inspection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { seaHash } from '../scripts/lib/sea-source-evidence.mjs';
import { prepareLauncherProvenance, launcherSeaConfig, assertLauncherProvenance,
  assertLauncherBuildEvidence } from '../scripts/lib/sea-launcher-provenance.mjs';

const { createSuite } = createRequire(import.meta.url)('./helpers.js');
const { test, assert, done } = createSuite('SEA launcher provenance (synthetic fixtures, no native evidence)');
const repository = path.resolve(import.meta.dirname, '..');
const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-sea-launcher-provenance-'));
const contract = JSON.parse(fs.readFileSync(path.join(repository, 'native/sea/launcher-contract.json'), 'utf8'));
const target = 'windows-x64';
const sourceFiles = [
  'server/index.js', 'server/sea-parser-role.js', 'server/document-parser.js',
  'server/network-deny.cjs', 'server/gateway/batch-worker.js', 'server/gateway/review-worker.js',
  'server/companion/stdio-server.js', 'server/shared/transitive-dependency.js',
  'server/shared/config.json', 'server/sea-parent-parser-probe.js',
  'server/sea-background-probe.js', 'server/sea-batch-probe.js', 'assets/fixture.txt'
];
const toolFiles = [
  'package.json', 'package-lock.json', 'scripts/build-sea-launcher.mjs',
  'scripts/lib/sea-launcher-provenance.mjs', 'scripts/lib/sea-source-evidence.mjs',
  'scripts/lib/sea-parser-bundle.mjs', 'node_modules/postject/dist/cli.js',
  'node_modules/postject/dist/transitive-helper.js', 'node_modules/postject/assets/payload.wasm',
  'node_modules/commander/index.js', 'node_modules/commander/lib/command.js'
];
function write(relative, bytes) {
  const destination = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes, { flag: 'wx' });
}
for (const relative of ['native/sea/bootstrap.cjs', 'native/sea/launcher-contract.json', 'native/sea/datasecure-mcp']) {
  write(relative, fs.readFileSync(path.join(repository, relative)));
}
write('plugins/data-secure/.claude-plugin/plugin.json', JSON.stringify({ version: '1.2.3-test' }));
write('plugins/data-secure/.mcp.json', JSON.stringify({ mcpServers: { 'data-secure-local': { command: 'node', args: ['server/index.js'] } } }));
for (const relative of sourceFiles) write('plugins/data-secure/' + relative, '// synthetic fixture: ' + relative + '\n');
for (const relative of toolFiles) write(relative, relative === 'package.json'
  ? JSON.stringify({ name: 'synthetic-sea-fixture', version: '1.2.3-test', devDependencies: { postject: contract.postject_version } })
  : relative === 'package-lock.json' ? JSON.stringify({ name: 'synthetic-sea-fixture', lockfileVersion: 3 })
    : '// synthetic toolchain input: ' + relative + '\n');
write('node_modules/postject/package.json', JSON.stringify({ name: 'postject', version: contract.postject_version,
  dependencies: { commander: '^9.4.0' } }));
write('node_modules/commander/package.json', JSON.stringify({ name: 'commander', version: '9.5.0',
  main: 'index.js', exports: { '.': './index.js' } }));
const role = { schema: 'datasecure-sea-parser-role/v1', target, node_version: contract.node_version,
  bytes: 128, sha256: 'a'.repeat(64), server_files: [{ path: 'document-parser.js',
    sha256: seaHash(fs.readFileSync(path.join(fixture, 'plugins/data-secure/server/document-parser.js'))) }] };
const prepared = prepareLauncherProvenance(fixture, target, role);
const binary = Buffer.from('synthetic non-executable launcher bytes');
function buildEvidence(value = prepared) {
  return { schema: 'datasecure-sea-build-evidence/v2', release_enabled: false,
    target, node_version: contract.node_version, postject_version: value.postjectVersion,
    bytes: binary.length, sha256: seaHash(binary), runtime_probe: {
      schema: 'datasecure-sea-runtime-probe/v1', target, node_version: contract.node_version, sea: true
    }, parser_role_sha256: value.provenance.parser_role === null ? null
      : seaHash(Buffer.from(JSON.stringify(value.provenance.parser_role))),
    node_source: { binary_sha256: 'b'.repeat(64), archive_sha256: value.provenance.parser_role === null
      ? null : contract.targets.find(item => item.id === target).archive_sha256 },
    parent_provenance: structuredClone(value.provenance) };
}
function changed(relative, bytes, check) {
  const filename = path.join(fixture, relative);
  const original = fs.readFileSync(filename);
  try { fs.writeFileSync(filename, bytes); check(); }
  finally { fs.writeFileSync(filename, original); }
}
function rejectProvenance(mutate) {
  const value = structuredClone(prepared.provenance);
  mutate(value);
  assert.throws(() => assertLauncherProvenance(value, prepared.provenance));
}
function rejectBuild(mutate) {
  const value = buildEvidence();
  mutate(value);
  assert.throws(() => assertLauncherBuildEvidence(value, binary, prepared));
}

test('independent reconstruction is deterministic and carries no absolute source paths', () => {
  assert.deepStrictEqual(prepareLauncherProvenance(fixture, target, role), prepared);
  assertLauncherProvenance(structuredClone(prepared.provenance), prepared.provenance);
  assert.strictEqual(prepared.provenance.schema, 'datasecure-sea-launcher-provenance/v1');
  assert.strictEqual(prepared.provenance.bootstrap_sha256, seaHash(Buffer.from(prepared.bootstrap)));
  assert.strictEqual(prepared.provenance.bootstrap_template_sha256,
    seaHash(fs.readFileSync(path.join(fixture, 'native/sea/bootstrap.cjs'))));
  assert.deepStrictEqual(prepared.provenance.parser_role, role);
  assert.deepStrictEqual(prepared.provenance.config, prepared.config);
  assert.ok(!JSON.stringify(prepared.provenance).includes(fixture));
  assert.ok(!prepared.bootstrap.includes('__DATASECURE_TARGET__'));
  assert.ok(!prepared.bootstrap.includes('__DATASECURE_NODE_VERSION__'));
  assert.ok(!prepared.bootstrap.includes('__DATASECURE_PARSER_ROLE_JSON__'));
});
test('relocation of an independently reconstructed source tree preserves evidence', () => {
  const copy = path.join(fixture, 'relocated-repository');
  fs.cpSync(path.join(fixture, 'native'), path.join(copy, 'native'), { recursive: true });
  fs.cpSync(path.join(fixture, 'plugins'), path.join(copy, 'plugins'), { recursive: true });
  fs.cpSync(path.join(fixture, 'scripts'), path.join(copy, 'scripts'), { recursive: true });
  fs.cpSync(path.join(fixture, 'node_modules'), path.join(copy, 'node_modules'), { recursive: true });
  fs.copyFileSync(path.join(fixture, 'package.json'), path.join(copy, 'package.json'));
  fs.copyFileSync(path.join(fixture, 'package-lock.json'), path.join(copy, 'package-lock.json'));
  assert.deepStrictEqual(prepareLauncherProvenance(copy, target, role), prepared);
});
test('exact SEA configuration fixes bootstrap paths, arguments and environment extension policy', () => {
  assert.deepStrictEqual(launcherSeaConfig(), { main: 'bootstrap.cjs', output: 'sea-prep.blob',
    disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false,
    execArgv: ['--no-warnings', '--max-old-space-size=512'], execArgvExtension: 'none' });
  for (const mutate of [value => { value.config.execArgvExtension = 'env'; },
    value => { value.config.execArgv.push('--require=untrusted'); },
    value => { value.config.main = '../untrusted.cjs'; },
    value => { value.config.output = 'another.blob'; },
    value => { value.config.useSnapshot = true; },
    value => { value.config.extra = true; }]) rejectProvenance(mutate);
});
for (const relative of sourceFiles) test('whole plugin source binding detects mutation: ' + relative, () => {
  changed('plugins/data-secure/' + relative, '// changed synthetic source\n', () => {
    const reconstructed = prepareLauncherProvenance(fixture, target, role);
    assert.notStrictEqual(reconstructed.provenance.source_evidence.plugin_tree_sha256,
      prepared.provenance.source_evidence.plugin_tree_sha256);
    assert.throws(() => assertLauncherProvenance(prepared.provenance, reconstructed.provenance));
    assert.throws(() => assertLauncherBuildEvidence(buildEvidence(), binary, reconstructed));
  });
});
test('bootstrap bytes are independently bound even when plugin and parser bytes are unchanged', () => {
  const template = fs.readFileSync(path.join(fixture, 'native/sea/bootstrap.cjs'));
  changed('native/sea/bootstrap.cjs', Buffer.concat([template, Buffer.from('\n// source mutation\n')]), () => {
    const current = prepareLauncherProvenance(fixture, target, role);
    assert.deepStrictEqual(current.provenance.source_evidence, prepared.provenance.source_evidence);
    assert.notStrictEqual(current.provenance.bootstrap_sha256, prepared.provenance.bootstrap_sha256);
    assert.notStrictEqual(current.provenance.bootstrap_template_sha256, prepared.provenance.bootstrap_template_sha256);
    assert.throws(() => assertLauncherProvenance(prepared.provenance, current.provenance));
  });
});
test('missing or duplicated bootstrap substitution markers stop preparation', () => {
  const template = fs.readFileSync(path.join(fixture, 'native/sea/bootstrap.cjs'), 'utf8');
  for (const marker of ['__DATASECURE_TARGET__', '__DATASECURE_NODE_VERSION__', '__DATASECURE_PARSER_ROLE_JSON__']) {
    changed('native/sea/bootstrap.cjs', template.replace(marker, 'removed-marker'), () => {
      assert.throws(() => prepareLauncherProvenance(fixture, target, role));
    });
    changed('native/sea/bootstrap.cjs', template + '\n// ' + marker, () => {
      assert.throws(() => prepareLauncherProvenance(fixture, target, role));
    });
  }
});
for (const relative of toolFiles) test('complete parent toolchain binding detects mutation: ' + relative, () => {
  const old = fs.readFileSync(path.join(fixture, relative));
  changed(relative, Buffer.concat([old, Buffer.from('\n ')]), () => {
    const current = prepareLauncherProvenance(fixture, target, role);
    assert.notDeepStrictEqual(current.provenance.toolchain, prepared.provenance.toolchain);
    assert.throws(() => assertLauncherProvenance(prepared.provenance, current.provenance));
  });
});
test('postject inventory contains its entire tree, including transitive helpers and non-JS assets', () => {
  const paths = prepared.provenance.toolchain.map(file => file.path);
  for (const relative of [...toolFiles, 'node_modules/postject/package.json']) assert.ok(paths.includes(relative), relative);
  assert.strictEqual(new Set(paths).size, paths.length);
});
test('installed postject version cannot silently differ from the pinned contract', () => {
  changed('node_modules/postject/package.json', JSON.stringify({ name: 'postject', version: '9.9.9' }), () => {
    assert.throws(() => prepareLauncherProvenance(fixture, target, role));
  });
});
test('plugin version, dispatcher and contract drift cannot reuse earlier evidence', () => {
  for (const [relative, replacement] of [
    ['plugins/data-secure/.claude-plugin/plugin.json', JSON.stringify({ version: '1.2.4-test' })],
    ['native/sea/datasecure-mcp', '# synthetic changed dispatcher\n'],
    ['native/sea/launcher-contract.json', JSON.stringify({ ...contract, dispatch_status: 'synthetic-changed-status' })]
  ]) changed(relative, replacement, () => {
    const current = prepareLauncherProvenance(fixture, target, role);
    assert.throws(() => assertLauncherProvenance(prepared.provenance, current.provenance));
  });
});
test('null parser role is explicit and cannot be substituted for bound role evidence', () => {
  const withoutRole = prepareLauncherProvenance(fixture, target, null);
  assert.strictEqual(withoutRole.provenance.parser_role, null);
  assert.notStrictEqual(withoutRole.provenance.bootstrap_sha256, prepared.provenance.bootstrap_sha256);
  assert.throws(() => assertLauncherProvenance(withoutRole.provenance, prepared.provenance));
  assert.throws(() => assertLauncherProvenance(prepared.provenance, withoutRole.provenance));
  assertLauncherBuildEvidence(buildEvidence(withoutRole), binary, withoutRole);
  const bad = buildEvidence(withoutRole);
  bad.parser_role_sha256 = 'a'.repeat(64);
  assert.throws(() => assertLauncherBuildEvidence(bad, binary, withoutRole));
  bad.parser_role_sha256 = null;
  bad.node_source.archive_sha256 = contract.targets[0].archive_sha256;
  assert.throws(() => assertLauncherBuildEvidence(bad, binary, withoutRole));
});
test('provenance schema rejects missing, extra, duplicate and evidence-selected input rows', () => {
  for (const key of Object.keys(prepared.provenance)) rejectProvenance(value => { delete value[key]; });
  for (const mutate of [value => { value.extra = true; }, value => { value.schema = 'datasecure-sea-launcher-provenance/v0'; },
    value => { value.target = 'linux-x64'; }, value => { value.node_version = '0.0.0'; },
    value => { value.bootstrap_sha256 = '0'.repeat(64); }, value => { value.bootstrap_template_sha256 = '0'.repeat(64); },
    value => { value.parser_role = null; }, value => { value.parser_role.sha256 = '0'.repeat(64); },
    value => { value.source_evidence.extra = true; }, value => { value.source_evidence.plugin_tree_sha256 = '0'.repeat(64); },
    value => { value.toolchain = []; }, value => { value.toolchain.pop(); },
    value => { value.toolchain.push(value.toolchain[0]); }, value => { value.toolchain.reverse(); },
    value => { value.toolchain[0].path = '../../untrusted'; },
    value => { value.toolchain[0].sha256 = '0'.repeat(64); }, value => { value.toolchain[0].extra = true; }]) rejectProvenance(mutate);
  for (const value of [null, [], {}, 'invalid']) assert.throws(() => assertLauncherProvenance(value, prepared.provenance));
});
test('valid V2 build binds binary, role, complete parent provenance and fixed runtime probe', () => {
  assertLauncherBuildEvidence(buildEvidence(), binary, prepared);
});
test('legacy builds, omitted provenance and every missing or unknown top-level field fail closed', () => {
  for (const key of Object.keys(buildEvidence())) rejectBuild(value => { delete value[key]; });
  rejectBuild(value => { value.schema = 'datasecure-sea-build-evidence/v1'; });
  rejectBuild(value => { value.extra = true; });
  rejectBuild(value => { value.privacy_release_verified = true; });
  for (const value of [null, [], {}, 'invalid']) assert.throws(() => assertLauncherBuildEvidence(value, binary, prepared));
});
test('binary, runtime, source and role mismatches cannot pass build verification', () => {
  for (const mutate of [value => { value.release_enabled = true; }, value => { value.bytes++; },
    value => { value.bytes = String(value.bytes); }, value => { value.sha256 = '0'.repeat(64); },
    value => { value.target = 'linux-x64'; }, value => { value.node_version = '0.0.0'; },
    value => { value.postject_version = '0.0.0'; }, value => { value.parser_role_sha256 = null; },
    value => { value.parser_role_sha256 = '0'.repeat(64); }, value => { value.parent_provenance = null; },
    value => { value.runtime_probe.sea = false; }, value => { value.runtime_probe.extra = true; },
    value => { value.runtime_probe.target = 'macos-arm64'; }, value => { value.runtime_probe.node_version = '0.0.0'; },
    value => { value.node_source = null; }, value => { value.node_source.binary_sha256 = 'not-a-hash'; },
    value => { value.node_source.binary_sha256 = ['a'.repeat(64)]; },
    value => { value.node_source.archive_sha256 = null; }, value => { value.node_source.archive_sha256 = '0'.repeat(64); },
    value => { value.node_source.extra = true; }]) rejectBuild(mutate);
  assert.throws(() => assertLauncherBuildEvidence(buildEvidence(), Buffer.from('mutated synthetic launcher'), prepared));
  const sameSize = Buffer.from(binary); sameSize[0] ^= 1;
  assert.throws(() => assertLauncherBuildEvidence(buildEvidence(), sameSize, prepared));
});
test('restored fixture retains the original independent source and build identity', () => {
  assert.deepStrictEqual(prepareLauncherProvenance(fixture, target, role), prepared);
  assertLauncherBuildEvidence(buildEvidence(), binary, prepared);
});
done();
