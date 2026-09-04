'use strict';

// All binaries and MCP/parser records below are SYNTHETIC TEST FIXTURES.
// They are never executed, installed, or counted as real host/SEA evidence.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSuite } = require('./helpers');
const { readZip } = require('../plugins/data-secure/server/zip-reader');
const { zipStore } = require('./lib/zip');
const { test, done, assert } = createSuite('Self-contained plugin assembly gate (synthetic only)');
const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const parserBoundary = { schema: 'datasecure-sea-parser-boundary/v1',
  txt: true, docx: true, permission: true, network_denied: true };
let assembleSeaPlugin, createSeaSourceEvidence, seaTreeInventory, seaHash, readCentralModes, prepareLauncherProvenance;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const saveJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
function withFixture(fn) {
  // /var is an OS-owned symlink on macOS; resolve only the trusted temp base,
  // never an untrusted source, target or output path.
  const temporaryBase = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryBase, 'datasecure-sea-assembly-test-'));
  const links = [];
  function write(relative, value) {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
  }
  const contract = readJson(path.join(root, 'native', 'sea', 'launcher-contract.json'));
  const contractFile = write('native/sea/launcher-contract.json', JSON.stringify(contract));
  const dispatcherFile = write('native/sea/datasecure-mcp', '#!/bin/sh\n# Synthetic non-executed dispatcher\n');
  // These are hashed fixture inputs, not executed build tools or native jobs.
  for (const relative of ['native/sea/bootstrap.cjs', 'package.json', 'package-lock.json',
    'scripts/build-sea-launcher.mjs', 'scripts/lib/sea-launcher-provenance.mjs',
    'scripts/lib/sea-source-evidence.mjs', 'scripts/lib/sea-parser-bundle.mjs']) {
    write(relative, fs.readFileSync(path.join(root, relative)));
  }
  write('node_modules/postject/package.json', JSON.stringify({ version: contract.postject_version,
    dependencies: { commander: '^9.4.0' } }));
  write('node_modules/commander/package.json', JSON.stringify({ name: 'commander', version: '9.5.0',
    exports: { '.': './index.js' } }));
  write('node_modules/commander/index.js', '// SYNTHETIC COMMANDER\n');
  write('node_modules/postject/dist/cli.js', '// SYNTHETIC NON-EXECUTED POSTJECT FIXTURE\n');
  const source = path.join(directory, 'plugins', 'data-secure');
  const sourceEntries = [
    ['.claude-plugin/plugin.json', JSON.stringify({ name: 'synthetic-test-only', version: '1.0.0-test' })],
    ['.mcp.json', JSON.stringify({ mcpServers: { 'data-secure-local': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server/index.js'] } } })],
    ['server/index.js', '// SYNTHETIC TEST ONLY\n'],
    ['server/gateway/batch-worker.js', '// SYNTHETIC BACKGROUND ENTRY\n'],
    ['server/gateway/batch-executor.js', '// SYNTHETIC BACKGROUND DEPENDENCY\n'],
    ['skills/synthetic/SKILL.md', '# Synthetic fixture\n'],
    ['server/native/windows-x64/datasecure-sandbox.exe', 'synthetic helper'],
    ...['macos-x64', 'macos-arm64', 'linux-x64'].flatMap(target => [
      ['server/native/' + target + '/datasecure-sandbox', 'synthetic POSIX parser helper'],
      ['server/ocr-runtime/targets/' + target + '/datasecure-ocr-sandbox', 'synthetic disabled OCR helper']
    ])
  ];
  for (const [name, value] of sourceEntries) write('plugins/data-secure/' + name, value);
  write('originals/input.docx', 'SYNTHETIC ORIGINAL MUST NOT CHANGE');
  write('originals/private-state.json', '{"synthetic_private_state":"preserve"}');
  write('dist/.sea-plugin-stage/old-state.txt', 'OLD STAGE MUST NOT CHANGE');
  const launchersRoot = path.join(directory, 'launchers');
  const sourceEvidence = createSeaSourceEvidence(source, contractFile, dispatcherFile);
  const files = contract.targets.map(target => {
    const bytes = Buffer.alloc(128);
    if (target.os === 'win32') {
      bytes.write('MZ'); bytes.writeUInt32LE(64, 60);
      bytes.write('PE\0\0', 64, 'binary'); bytes.writeUInt16LE(0x8664, 68);
    } else if (target.os === 'linux') {
      bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]); bytes.writeUInt16LE(0x3e, 18);
    } else {
      bytes.set([0xcf, 0xfa, 0xed, 0xfe]); bytes.writeUInt32LE(target.arch === 'arm64' ? 0x0100000c : 0x01000007, 4);
    }
    const launcher = write('launchers/' + target.id + '/' + target.launcher, bytes);
    const prepared = prepareLauncherProvenance(directory, target.id, null);
    saveJson(launcher + '.evidence.json', {
      schema: 'datasecure-sea-build-evidence/v2', release_enabled: false,
      target: target.id, node_version: contract.node_version, postject_version: contract.postject_version,
      sha256: seaHash(bytes), bytes: bytes.length,
      runtime_probe: { schema: 'datasecure-sea-runtime-probe/v1', node_version: contract.node_version, target: target.id, sea: true },
      parser_role_sha256: null, node_source: { binary_sha256: 'a'.repeat(64), archive_sha256: null },
      parent_provenance: prepared.provenance
    });
    saveJson(launcher + '.mcp-evidence.json', {
      schema: 'datasecure-sea-mcp-evidence/v2', release_enabled: false, synthetic_test_only: true,
      target: target.id, launcher_sha256: seaHash(bytes), plugin_command: contract.plugin_command,
      runtime_mode: 'self_contained_node', runtime_target: target.id, host_node_required: false,
      path_empty: true, node_options_ignored: true, raw_content_sent_to_claude: false,
      source_evidence: sourceEvidence, parser_boundary: parserBoundary
    });
    return launcher;
  });
  const output = path.join(directory, 'dist', 'synthetic-only.zip');
  const run = (options = {}) => assembleSeaPlugin({ repositoryRoot: directory, launchersRoot, output, ...options });
  const update = (index, suffix, modify) => {
    const file = files[index] + suffix, value = readJson(file);
    modify(value); saveJson(file, value);
  };
  function assertOriginals() {
    assert.strictEqual(fs.readFileSync(path.join(directory, 'originals/input.docx'), 'utf8'), 'SYNTHETIC ORIGINAL MUST NOT CHANGE');
    assert.strictEqual(fs.readFileSync(path.join(directory, 'originals/private-state.json'), 'utf8'), '{"synthetic_private_state":"preserve"}');
    assert.strictEqual(fs.readFileSync(path.join(directory, 'dist/.sea-plugin-stage/old-state.txt'), 'utf8'), 'OLD STAGE MUST NOT CHANGE');
  }
  const noNewStage = () => assert.deepStrictEqual(fs.readdirSync(path.join(directory, 'dist')).filter(name => name.startsWith('.sea-plugin-stage-')), []);
  function reject(pattern, options) {
    assert.throws(() => run(options), pattern);
    assert.ok(!fs.existsSync(output), 'rejected evidence must not publish an archive');
    assertOriginals(); noNewStage();
  }
  function directoryLink(existing, link) {
    fs.symlinkSync(existing, link, process.platform === 'win32' ? 'junction' : 'dir');
    links.push(link);
  }
  try { return fn({ directory, source, sourceEntries, contract, contractFile, dispatcherFile,
    sourceEvidence, files, output, launchersRoot, write, run, update, reject, assertOriginals, noNewStage, directoryLink }); }
  finally {
    // Only synthetic fixture targets are removed. Remove explicitly registered
    // links themselves before recursively deleting this owned temporary tree.
    for (const link of links.reverse()) {
      const stat = fs.lstatSync(link);
      assert.ok(stat.isSymbolicLink());
      fs.unlinkSync(link);
    }
    assert.strictEqual(path.dirname(directory), temporaryBase);
    assert.match(path.basename(directory), /^datasecure-sea-assembly-test-/);
    assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
    fs.rmSync(directory, { recursive: true });
  }
}
function patchFs(name, replacement, fn) {
  const original = fs[name];
  fs[name] = (...args) => replacement(original, ...args);
  try { return fn(); } finally { fs[name] = original; }
}
function rewriteArchivePayload(buffer, change) {
  const modes = readCentralModes(buffer), entries = readZip(buffer);
  change(entries);
  // Independent stored-ZIP writer recalculates sizes and CRCs. Keep original
  // central-directory modes so rejection must come from payload binding.
  const rewritten = zipStore([...entries]);
  let cursor = rewritten.readUInt32LE(rewritten.length - 6);
  for (let index = 0; index < entries.size; index++) {
    assert.strictEqual(rewritten.readUInt32LE(cursor), 0x02014b50);
    const length = rewritten.readUInt16LE(cursor + 28);
    const name = rewritten.toString('utf8', cursor + 46, cursor + 46 + length);
    rewritten.writeUInt32LE((modes.get(name) * 65536) >>> 0, cursor + 38);
    cursor += 46 + length;
  }
  assert.deepStrictEqual(readCentralModes(rewritten), modes);
  assert.deepStrictEqual(readZip(rewritten), entries, 'rewritten synthetic ZIP has valid CRCs and sizes');
  return rewritten;
}

(async () => {
  ({ assembleSeaPlugin } = await import(pathToFileURL(path.join(root, 'scripts/build-sea-plugin.mjs')).href));
  ({ createSeaSourceEvidence, seaTreeInventory, seaHash } = await import(pathToFileURL(path.join(root, 'scripts/lib/sea-source-evidence.mjs')).href));
  ({ prepareLauncherProvenance } = await import(pathToFileURL(path.join(root, 'scripts/lib/sea-launcher-provenance.mjs')).href));
  ({ readCentralModes } = await import(pathToFileURL(path.join(root, 'scripts/lib/zip.mjs')).href));

  test('valid synthetic four-target evidence assembles a ZIP without altering source, old stages or originals', () => withFixture(f => {
    const before = seaTreeInventory(f.source), result = f.run();
    const bytes = fs.readFileSync(result.archive), entries = readZip(bytes);
    assert.strictEqual(result.release_enabled, false);
    assert.strictEqual(result.targets, 4);
    assert.strictEqual(result.sha256, seaHash(bytes));
    assert.strictEqual(fs.lstatSync(result.archive).nlink, 1);
    assert.deepStrictEqual(seaTreeInventory(f.source), before);
    const mcp = JSON.parse(entries.get('.mcp.json'));
    assert.deepStrictEqual(Object.keys(mcp), ['mcpServers']);
    assert.strictEqual(mcp.mcpServers['data-secure-local'].command, '${CLAUDE_PLUGIN_ROOT}/bin/datasecure-mcp');
    assert.deepStrictEqual(mcp.mcpServers['data-secure-local'].args, []);
    const assembly = JSON.parse(entries.get('SEA-ENGINEERING-EVIDENCE.json'));
    assert.strictEqual(assembly.schema, 'datasecure-sea-plugin-assembly/v2');
    assert.strictEqual(assembly.release_enabled, false);
    assert.deepStrictEqual(assembly.source_evidence, f.sourceEvidence);
    assert.deepStrictEqual(assembly.parser_boundary, parserBoundary);
    for (const [name, value] of f.sourceEntries) if (name !== '.mcp.json') assert.strictEqual(entries.get(name).toString(), value);
    f.assertOriginals(); f.noNewStage();
  }));

  test('all existing POSIX helpers plus SEA launchers have executable archive modes, nothing else does', () => withFixture(f => {
    const result = f.run(), bytes = fs.readFileSync(result.archive), modes = readCentralModes(bytes);
    for (const [name, mode] of modes) {
      const executable = name === 'bin/datasecure-mcp' ||
        /^server\/runtime\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-mcp$/.test(name) ||
        /^server\/native\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-sandbox$/.test(name) ||
        /^server\/ocr-runtime\/targets\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-ocr-sandbox$/.test(name);
      assert.strictEqual(mode, executable ? 0o100755 : 0o100644, name);
    }
    assert.strictEqual([...modes.values()].filter(mode => mode === 0o100755).length, 10);
  }));

  for (let index = 0; index < 4; index++) {
    test('missing target ' + index + ' prevents assembly', () => withFixture(f => {
      fs.unlinkSync(f.files[index]); f.reject(/SEA_TARGET_MISSING/);
    }));
    test('wrong binary platform/architecture on target ' + index + ' prevents assembly', () => withFixture(f => {
      fs.writeFileSync(f.files[index], Buffer.alloc(128)); f.reject(/SEA_TARGET_ARCH_MISMATCH/);
    }));
    test('valid container magic with a wrong CPU on target ' + index + ' prevents assembly', () => withFixture(f => {
      const bytes = fs.readFileSync(f.files[index]), target = f.contract.targets[index];
      if (target.os === 'win32') bytes.writeUInt16LE(0xaa64, 68);
      else if (target.os === 'linux') bytes.writeUInt16LE(0xb7, 18);
      else bytes.writeUInt32LE(target.arch === 'arm64' ? 0x01000007 : 0x0100000c, 4);
      fs.writeFileSync(f.files[index], bytes); f.reject(/SEA_TARGET_ARCH_MISMATCH/);
    }));
  }
  for (const [name, modify] of [
    ['schema', value => { value.schema = 'wrong'; }],
    ['release switch', value => { value.release_enabled = true; }],
    ['target', value => { value.target = 'other'; }],
    ['Node version', value => { value.node_version = '0.0.1'; }],
    ['postject version', value => { value.postject_version = '0.0.1'; }],
    ['hash', value => { value.sha256 = '0'.repeat(64); }],
    ['size', value => { value.bytes++; }],
    ['probe schema', value => { value.runtime_probe.schema = 'wrong'; }],
    ['probe Node version', value => { value.runtime_probe.node_version = '0.0.1'; }],
    ['probe target', value => { value.runtime_probe.target = 'other'; }],
    ['probe SEA flag', value => { value.runtime_probe.sea = false; }],
    ['legacy v1', value => { value.schema = 'datasecure-sea-build-evidence/v1'; }],
    ['missing parent provenance', value => { delete value.parent_provenance; }],
    ['extra parent provenance field', value => { value.parent_provenance.extra = true; }],
    ['missing parent provenance field', value => { delete value.parent_provenance[Object.keys(value.parent_provenance)[0]]; }],
    ['extra build field', value => { value.synthetic_test_only = true; }],
    ['missing parser role hash', value => { delete value.parser_role_sha256; }],
    ['missing Node source', value => { delete value.node_source; }],
    ['malformed Node source hash', value => { value.node_source.binary_sha256 = 'not-a-hash'; }],
    ['extra Node source field', value => { value.node_source.extra = true; }]
  ]) test('build evidence rejects mismatched ' + name, () => withFixture(f => {
    f.update(0, '.evidence.json', modify);
    let stages = 0;
    patchFs('mkdtempSync', (original, ...args) => { stages++; return original(...args); },
      () => f.reject(/SEA_BUILD_EVIDENCE_MISMATCH/));
    assert.strictEqual(stages, 0, 'invalid build provenance must fail before creating a stage');
  }));

  for (const relative of ['native/sea/bootstrap.cjs', 'scripts/lib/sea-launcher-provenance.mjs',
    'scripts/lib/sea-source-evidence.mjs', 'scripts/build-sea-launcher.mjs',
    'node_modules/commander/index.js',
    'plugins/data-secure/server/gateway/batch-worker.js', 'plugins/data-secure/server/gateway/batch-executor.js']) {
    test('stale parent provenance rejects changed ' + relative + ' even with fresh MCP source evidence before staging', () => withFixture(f => {
      fs.appendFileSync(path.join(f.directory, relative), '\n// SYNTHETIC SOURCE CHANGE\n');
      const refreshed = createSeaSourceEvidence(f.source, f.contractFile, f.dispatcherFile);
      for (let index = 0; index < f.files.length; index++) {
        f.update(index, '.mcp-evidence.json', value => { value.source_evidence = refreshed; });
      }
      let stages = 0;
      patchFs('mkdtempSync', (original, ...args) => { stages++; return original(...args); },
        () => f.reject(/SEA_BUILD_EVIDENCE_MISMATCH/));
      assert.strictEqual(stages, 0, 'stale parent provenance must fail before creating a stage');
    }));
  }
  test('fresh build and MCP evidence cannot rebase the initial assembly source snapshot before staging', () => withFixture(f => {
    let changed = false, stages = 0, regenerated = 0;
    // The first build sidecar is read only after the assembly source snapshot.
    // Mutate before lstat returns so this is coherent new evidence, not a
    // short-read/file-identity failure in readSeaFile's defensive snapshot.
    patchFs('lstatSync', (original, file, ...args) => {
      if (!changed && file === f.files[0] + '.evidence.json') {
        changed = true;
        fs.appendFileSync(path.join(f.source, 'server/gateway/batch-executor.js'), '\n// SYNTHETIC SNAPSHOT REBASE\n');
        const refreshed = createSeaSourceEvidence(f.source, f.contractFile, f.dispatcherFile);
        assert.notDeepStrictEqual(refreshed, f.sourceEvidence);
        for (const [index, target] of f.contract.targets.entries()) {
          const prepared = prepareLauncherProvenance(f.directory, target.id, null);
          assert.deepStrictEqual(prepared.provenance.source_evidence, refreshed);
          f.update(index, '.evidence.json', value => { value.parent_provenance = prepared.provenance; });
          f.update(index, '.mcp-evidence.json', value => { value.source_evidence = refreshed; });
          regenerated++;
        }
      }
      return original(file, ...args);
    }, () => patchFs('mkdtempSync', (original, ...args) => { stages++; return original(...args); },
      () => f.reject(/SEA_BUILD_EVIDENCE_MISMATCH:windows-x64/)));
    assert.strictEqual(changed, true, 'the mutation must occur after source capture at the first build read');
    assert.strictEqual(regenerated, 4, 'all target records must match the changed source');
    assert.strictEqual(stages, 0, 'the original source snapshot must reject rebasing before staging');
  }));
  test('embedded parser parents remain pending until parser-role assembly is implemented', () => withFixture(f => {
    f.update(0, '.evidence.json', value => {
      value.parser_role_sha256 = 'b'.repeat(64);
      value.parent_provenance.parser_role = { schema: 'datasecure-sea-parser-role/v1' };
    });
    let stages = 0;
    patchFs('mkdtempSync', (original, ...args) => { stages++; return original(...args); },
      () => f.reject(/SEA_PARENT_ROLE_ASSEMBLY_PENDING/));
    assert.strictEqual(stages, 0);
  }));

  for (const [name, modify] of [
    ['legacy v1', value => { value.schema = 'datasecure-sea-mcp-evidence/v1'; }],
    ['hash', value => { value.launcher_sha256 = '0'.repeat(64); }],
    ['runtime target', value => { value.runtime_target = 'other'; }],
    ['host Node requirement', value => { value.host_node_required = true; }],
    ['ambient NODE_OPTIONS', value => { value.node_options_ignored = false; }],
    ['PATH dependency', value => { value.path_empty = false; }],
    ['raw-content claim', value => { value.raw_content_sent_to_claude = true; }]
  ]) test('MCP evidence rejects ' + name, () => withFixture(f => {
    f.update(0, '.mcp-evidence.json', modify); f.reject(/SEA_MCP_EVIDENCE_MISMATCH/);
  }));

  for (const key of ['schema', 'txt', 'docx', 'permission', 'network_denied']) {
    test('parser-boundary proof requires exact ' + key, () => withFixture(f => {
      f.update(0, '.mcp-evidence.json', value => { value.parser_boundary[key] = key === 'schema' ? 'wrong' : false; });
      f.reject(/SEA_PARSER_BOUNDARY_EVIDENCE_MISSING/);
    }));
  }
  test('initialize/privacy_status-only evidence cannot stand in for real parser boundary checks', () => withFixture(f => {
    f.update(0, '.mcp-evidence.json', value => { delete value.parser_boundary; });
    f.reject(/SEA_PARSER_BOUNDARY_EVIDENCE_MISSING/);
  }));
  test('extra or string-valued parser-boundary claims are rejected', () => withFixture(f => {
    f.update(0, '.mcp-evidence.json', value => { value.parser_boundary.extra = true; });
    f.reject(/SEA_PARSER_BOUNDARY_EVIDENCE_MISSING/);
    f.update(0, '.mcp-evidence.json', value => { delete value.parser_boundary.extra; value.parser_boundary.txt = 'true'; });
    f.reject(/SEA_PARSER_BOUNDARY_EVIDENCE_MISSING/);
  }));
  for (const [name, change] of [
    ['runtime source', f => fs.appendFileSync(path.join(f.source, 'server/index.js'), '// modified')],
    ['plugin version', f => saveJson(path.join(f.source, '.claude-plugin/plugin.json'), { version: '2.0.0-test' })],
    ['dispatcher', f => fs.appendFileSync(f.dispatcherFile, '# modified')],
    ['launcher contract', f => { f.contract.node_version = '22.99.0'; saveJson(f.contractFile, f.contract); }]
  ]) test('old source evidence cannot certify changed ' + name, () => withFixture(f => {
    change(f); f.reject(/SEA_(?:SOURCE_EVIDENCE_MISMATCH|BUILD_EVIDENCE_MISMATCH)/);
  }));
  test('missing source binding fails closed', () => withFixture(f => {
    f.update(0, '.mcp-evidence.json', value => { delete value.source_evidence; });
    f.reject(/SEA_SOURCE_EVIDENCE_MISMATCH/);
  }));
  test('malformed JSON evidence fails closed', () => withFixture(f => {
    fs.writeFileSync(f.files[0] + '.evidence.json', '{');
    f.reject(/SEA_BUILD_EVIDENCE_INVALID/);
  }));
  test('hard-linked source, launcher and evidence files cannot enter the artifact', () => {
    for (const which of ['source', 'launcher', 'build', 'mcp']) withFixture(f => {
      const file = which === 'source' ? path.join(f.source, 'server/index.js') : f.files[0] + (which === 'build' ? '.evidence.json' : which === 'mcp' ? '.mcp-evidence.json' : '');
      fs.linkSync(file, path.join(f.directory, 'hardlink-fixture'));
      f.reject(/SEA_(?:FILE_UNSAFE|TARGET_UNSAFE|BUILD_EVIDENCE_INVALID|MCP_EVIDENCE_INVALID)/);
    });
  });
  test('junction or symlink ancestors of launchers and sources are rejected', () => {
    for (const which of ['launcher', 'source']) withFixture(f => {
      const directory = which === 'launcher' ? path.dirname(f.files[0]) : path.join(f.source, 'server');
      const outside = path.join(f.directory, 'linked-target');
      fs.renameSync(directory, outside); f.directoryLink(outside, directory);
      f.reject(/SEA_(?:TARGET_UNSAFE|TREE_UNSAFE|DIRECTORY_UNSAFE)/);
    });
  });
  test('dist junction is rejected without touching the linked originals', () => withFixture(f => {
    const dist = path.join(f.directory, 'dist'), saved = path.join(f.directory, 'saved-dist');
    fs.renameSync(dist, saved); f.directoryLink(path.join(f.directory, 'originals'), dist);
    assert.throws(() => f.run(), /SEA_DIRECTORY_UNSAFE/);
    assert.strictEqual(fs.readFileSync(path.join(f.directory, 'originals/input.docx'), 'utf8'), 'SYNTHETIC ORIGINAL MUST NOT CHANGE');
    assert.ok(!fs.existsSync(path.join(f.directory, 'originals/synthetic-only.zip')));
    assert.strictEqual(fs.readFileSync(path.join(saved, '.sea-plugin-stage/old-state.txt'), 'utf8'), 'OLD STAGE MUST NOT CHANGE');
  }));
  test('nested, traversal, non-ZIP, alternate-stream and reserved output names are rejected', () => withFixture(f => {
    for (const name of ['nested/result.zip', '../originals/result.zip', 'original.docx', 'result.zip:stream.zip', 'CON.zip']) {
      f.reject(/SEA_PLUGIN_OUTPUT_OUTSIDE_DIST/, { output: path.join(f.directory, 'dist', name) });
    }
  }));
  test('existing archive or directory output is never overwritten or deleted', () => withFixture(f => {
    fs.writeFileSync(f.output, 'OLD ARCHIVE SENTINEL');
    assert.throws(() => f.run(), /SEA_PLUGIN_OUTPUT_EXISTS/);
    assert.strictEqual(fs.readFileSync(f.output, 'utf8'), 'OLD ARCHIVE SENTINEL');
    const directory = path.join(f.directory, 'dist/directory.zip');
    fs.mkdirSync(directory);
    assert.throws(() => f.run({ output: directory }), /SEA_PLUGIN_OUTPUT_EXISTS/);
    assert.ok(fs.lstatSync(directory).isDirectory());
    f.assertOriginals(); f.noNewStage();
  }));
  test('late destination collision cannot truncate the competing archive', () => withFixture(f => {
    patchFs('linkSync', (original, from, to) => {
      if (to === f.output) fs.writeFileSync(to, 'LATE SENTINEL');
      return original(from, to);
    }, () => assert.throws(() => f.run(), error => error.code === 'EEXIST'));
    assert.strictEqual(fs.readFileSync(f.output, 'utf8'), 'LATE SENTINEL');
    f.assertOriginals(); f.noNewStage();
  }));
  test('unsupported exclusive publication has no overwrite fallback', () => withFixture(f => {
    patchFs('linkSync', () => { throw Object.assign(new Error('synthetic unsupported'), { code: 'ENOTSUP' }); },
      () => f.reject(/synthetic unsupported/));
  }));
  test('a launcher changed after evidence validation cannot be copied into the archive', () => withFixture(f => {
    let changed = false;
    patchFs('writeFileSync', (original, file, ...args) => {
      const result = original(file, ...args);
      if (!changed && String(file).includes('.sea-plugin-stage-') && String(file).endsWith('index.js')) {
        changed = true; original(f.files[0], Buffer.alloc(128));
      }
      return result;
    }, () => f.reject(/SEA_TARGET_CHANGED/));
    assert.ok(changed);
  }));
  test('copied source tampering fails its source binding and cleans only the owned stage', () => withFixture(f => {
    patchFs('writeFileSync', (original, file, ...args) => {
      if (String(file).includes('.sea-plugin-stage-') && String(file).endsWith('index.js')) args[0] = '// changed fixture';
      return original(file, ...args);
    }, () => f.reject(/SEA_SOURCE_EVIDENCE_MISMATCH/));
  }));
  for (const relative of ['server/index.js', '.mcp.json']) {
    test('stage mutation after source binding cannot redefine expected bytes: ' + relative, () => withFixture(f => {
      let changed = false;
      patchFs('writeFileSync', (original, file, ...args) => {
        const result = original(file, ...args);
        if (!changed && String(file).includes('.sea-plugin-stage-') && String(file).endsWith(path.join('bin', 'datasecure-mcp'))) {
          changed = true;
          const stage = path.dirname(path.dirname(file));
          original(path.join(stage, relative), relative === '.mcp.json'
            ? JSON.stringify({ mcpServers: { 'data-secure-local': { command: 'synthetic-changed', env: { SYNTHETIC_UNEXPECTED: '1' } } } })
            : '// mutation after source validation');
        }
        return result;
      }, () => f.reject(/SEA_STAGE_PAYLOAD_MISMATCH/));
      assert.ok(changed);
    }));
  }
  test('writeZip rereading different bytes cannot escape the original expected inventory', () => withFixture(f => {
    let replaced = false;
    patchFs('readFileSync', (original, file, ...args) => {
      const result = original(file, ...args);
      if (String(file).includes('.sea-plugin-stage-') && String(file).endsWith(path.join('server', 'index.js'))) {
        replaced = true;
        return Buffer.alloc(result.length, 0x41);
      }
      return result;
    }, () => f.reject(/SEA_ARCHIVE_PAYLOAD_MISMATCH/));
    assert.ok(replaced);
  }));
  for (const relative of ['server/index.js', '.mcp.json', 'bin/datasecure-mcp.exe', 'SEA-ENGINEERING-EVIDENCE.json']) {
    test('final ZIP rejects changed payload with valid CRC, equal length and correct modes: ' + relative, () => withFixture(f => {
      let replaced = false;
      patchFs('writeFileSync', (original, file, ...args) => {
        if (String(file).endsWith('.sea-archive.zip')) {
          replaced = true;
          args[0] = rewriteArchivePayload(args[0], entries => entries.set(relative, Buffer.alloc(entries.get(relative).length, 0x41)));
        }
        return original(file, ...args);
      }, () => f.reject(/SEA_ARCHIVE_PAYLOAD_MISMATCH/));
      assert.ok(replaced);
    }));
  }
  test('final ZIP rejects changed payload length even with valid CRC and modes', () => withFixture(f => {
    patchFs('writeFileSync', (original, file, ...args) => {
      if (String(file).endsWith('.sea-archive.zip')) {
        args[0] = rewriteArchivePayload(args[0], entries => entries.set('server/index.js', Buffer.from('// synthetic longer replacement payload')));
      }
      return original(file, ...args);
    }, () => f.reject(/SEA_ARCHIVE_PAYLOAD_MISMATCH/));
  }));
  test('declared ZIP expansion above the explicit 1 GiB budget stops before inflation', () => withFixture(f => {
    patchFs('writeFileSync', (original, file, ...args) => {
      if (String(file).endsWith('.sea-archive.zip')) {
        const bytes = Buffer.from(args[0]), central = bytes.readUInt32LE(bytes.length - 6);
        const local = bytes.readUInt32LE(central + 42);
        bytes.writeUInt32LE(1024 * 1024 * 1024 + 1, central + 24);
        bytes.writeUInt32LE(1024 * 1024 * 1024 + 1, local + 22);
        args[0] = bytes;
      }
      return original(file, ...args);
    }, () => f.reject(/SEA_ARCHIVE_PAYLOAD_INVALID/));
  }));
  test('archive central-directory mode corruption is rejected before publication', () => withFixture(f => {
    patchFs('writeFileSync', (original, file, ...args) => {
      if (String(file).endsWith('.sea-archive.zip')) {
        const bytes = Buffer.from(args[0]), name = bytes.lastIndexOf(Buffer.from('server/index.js'));
        assert.strictEqual(bytes.readUInt32LE(name - 46), 0x02014b50);
        bytes.writeUInt32LE((0o100755 * 65536) >>> 0, name - 46 + 38);
        args[0] = bytes;
      }
      return original(file, ...args);
    }, () => f.reject(/SEA_ARCHIVE_MODE_INVALID/));
  }));
  test('contract cannot add path-traversing targets or switch release on', () => withFixture(f => {
    const original = clone(f.contract);
    f.contract.targets[0].launcher = '../outside.exe'; saveJson(f.contractFile, f.contract);
    f.reject(/SEA_CONTRACT_INVALID/);
    original.release_enabled = true; saveJson(f.contractFile, original);
    f.reject(/SEA_RELEASE_SWITCH_MUST_REMAIN_FALSE/);
  }));
  test('assembly source has no network or child-process execution path', () => {
    const source = fs.readFileSync(path.join(root, 'scripts/build-sea-plugin.mjs'), 'utf8');
    assert.doesNotMatch(source, /https?:|\b(?:fetch|execSync|spawnSync)\s*\(/i);
  });
  done();
})().catch(error => { console.error(error); process.exitCode = 1; });
