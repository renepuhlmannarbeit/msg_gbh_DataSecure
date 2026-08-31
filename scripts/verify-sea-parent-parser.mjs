// Engineering acceptance for the REAL SEA MCP parent selecting the fixed-role
// parser. Only synthetic fixtures are used; no V2 MCP/release evidence is saved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readSeaFile, seaHash, assertSeaDirectory, seaTreeInventory,
  createSeaSourceEvidence, assertSeaSourceEvidence } from './lib/sea-source-evidence.mjs';
import { bundleSeaParser, parserToolchainEvidence, assertParserProvenance } from './lib/sea-parser-bundle.mjs';
import { prepareLauncherProvenance, assertLauncherBuildEvidence } from './lib/sea-launcher-provenance.mjs';

const root = path.resolve(import.meta.dirname, '..');
const FORMATS = ['txt', 'md', 'markdown', 'csv', 'docx'];
const PROBE_FLAG = '--datasecure-parser-integration-probe';
const PROBE_SCHEMA = 'datasecure-sea-parent-parser-probe/v1';
const ACCEPTANCE_SCHEMA = 'datasecure-sea-parent-parser-acceptance/v1';
let failedPhase = 'provenance';

function argumentsOf(argv) {
  if (argv.length !== 4) throw new Error('SEA_PARENT_PARSER_ARGUMENTS_INVALID');
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!['--parent', '--parser-directory'].includes(argv[index]) || result.has(argv[index]) ||
        !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('SEA_PARENT_PARSER_ARGUMENTS_INVALID');
    result.set(argv[index], path.resolve(argv[index + 1]));
  }
  if (result.size !== 2) throw new Error('SEA_PARENT_PARSER_ARGUMENTS_INVALID');
  return result;
}

// Reject even a failed process if it emits document text, paths, stacks or
// arbitrary diagnostics. Bootstrap failures may use only fixed uppercase
// error codes, either as a line or in the small structured failure envelope.
function assertSafeFailureOutput(output) {
  assert.equal(typeof output, 'string');
  assert.ok(output.length <= 2048);
  for (const line of output.split(/\r?\n/u).filter(Boolean)) {
    if (/^(?:DATASECURE|SEA)_[A-Z0-9_]{1,100}$/.test(line)) continue;
    const value = JSON.parse(line);
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.ok(Object.keys(value).length > 0);
    assert.ok(Object.keys(value).every(key => ['schema', 'error', 'ok'].includes(key)));
    assert.match(value.error, /^(?:DATASECURE|SEA)_[A-Z0-9_]{1,100}$/);
    if ('schema' in value) assert.match(value.schema, /^datasecure-sea-[a-z-]{1,80}\/v1$/);
    if ('ok' in value) assert.equal(value.ok, false);
  }
}

async function verify() {
  const args = argumentsOf(process.argv.slice(2));
  // Other matrix rows remain unproved. Never simulate a different OS/arch.
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('SEA_PARENT_PARSER_NATIVE_MATRIX_PENDING');
  const target = 'windows-x64';
  const parentSource = args.get('--parent');
  const parserDirectory = args.get('--parser-directory');
  const parentBytes = readSeaFile(parentSource);
  const parentEvidence = JSON.parse(readSeaFile(`${parentSource}.evidence.json`));
  const parserBytes = readSeaFile(path.join(parserDirectory, 'datasecure-parser.exe'));
  const evidence = JSON.parse(readSeaFile(path.join(parserDirectory, 'parser-build.json')));
  const contractFile = path.join(root, 'native/sea/launcher-contract.json');
  const contractBytes = readSeaFile(contractFile);
  const contract = JSON.parse(contractBytes);
  const targetContract = contract.targets.find(item => item.id === target);
  assert.equal(contract.release_enabled, false);
  assert.equal(targetContract.os, process.platform);
  assert.equal(targetContract.arch, process.arch);
  assert.equal(evidence.schema, 'datasecure-sea-parser-build/v1');
  assert.equal(evidence.release_enabled, false);
  assert.equal(evidence.role, 'parser');
  assert.equal(evidence.target, target);
  assert.equal(evidence.node_version, contract.node_version);
  assert.equal(evidence.archive_sha256, targetContract.archive_sha256);
  assert.match(evidence.node_sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.launcher_contract_sha256, seaHash(contractBytes));
  assert.equal(evidence.bytes, parserBytes.length);
  assert.equal(evidence.sha256, seaHash(parserBytes));
  assert.equal(evidence.probe?.schema, 'datasecure-sea-parser-probe/v1');
  assert.equal(evidence.probe.target, target);
  assert.equal(evidence.probe.node_version, contract.node_version);
  assert.equal(evidence.probe.role, 'parser');
  assert.equal(evidence.probe.sea, true);
  assert.deepEqual(evidence.probe.failures, []);
  // Rebuild the complete CURRENT closure, not an evidence-selected subset.
  assertParserProvenance(evidence, await bundleSeaParser(root, target, contract.node_version), parserToolchainEvidence(root));
  const role = { schema: 'datasecure-sea-parser-role/v1', target, node_version: contract.node_version,
    bytes: parserBytes.length, sha256: evidence.sha256,
    server_files: evidence.inputs.filter(file => file.path.startsWith('plugins/data-secure/server/'))
      .map(file => ({ path: file.path.slice('plugins/data-secure/server/'.length), sha256: file.sha256 })) };
  const prepared = prepareLauncherProvenance(root, target, role);
  assertLauncherBuildEvidence(parentEvidence, parentBytes, prepared);
  const sourceRoot = path.join(root, 'plugins/data-secure');
  const dispatcherSource = path.join(root, contract.posix_dispatcher);
  const sourceEvidence = prepared.provenance.source_evidence;
  assertSeaSourceEvidence(createSeaSourceEvidence(sourceRoot, contractFile, dispatcherSource), sourceEvidence);
  const tempBase = assertSeaDirectory(fs.realpathSync(os.tmpdir()));
  const temporary = fs.mkdtempSync(path.join(tempBase, 'datasecure-sea-parent-parser-'));
  const negativeCases = [];
  let checks = 0;
  function inside(file) {
    const absolute = path.resolve(file);
    const relative = path.relative(temporary, absolute);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('SEA_PARENT_PARSER_PRIVATE_PATH_INVALID');
    }
    assertSeaDirectory(path.dirname(absolute));
    return absolute;
  }
  function absent(file) {
    inside(file);
    try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    throw new Error('SEA_PARENT_PARSER_PRIVATE_TARGET_EXISTS');
  }
  function moveRegular(from, to) {
    inside(from); absent(to); readSeaFile(from);
    fs.renameSync(from, to);
  }
  function removeRegular(file) {
    inside(file); readSeaFile(file);
    fs.unlinkSync(file);
  }
  try {
    const plugin = path.join(temporary, 'Plugin mit Leerzeichen und Umlaut ü');
    const cwd = path.join(temporary, 'Fremder Arbeitsordner Ä');
    fs.mkdirSync(cwd);
    fs.cpSync(sourceRoot, plugin, { recursive: true, dereference: false });
    assertSeaSourceEvidence(createSeaSourceEvidence(plugin, contractFile, dispatcherSource), sourceEvidence);
    const bin = path.join(plugin, 'bin');
    const runtime = path.join(plugin, 'server/runtime', target);
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(runtime, { recursive: true });
    const parent = inside(path.join(bin, 'datasecure-mcp.exe'));
    const parser = inside(path.join(runtime, 'datasecure-parser.exe'));
    fs.writeFileSync(parent, parentBytes, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(parser, parserBytes, { flag: 'wx', mode: 0o600 });
    function run(probeArgs = [PROBE_FLAG], input = '') {
      return spawnSync(parent, probeArgs, { cwd, input, encoding: 'utf8', shell: false,
        windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024,
        env: { PATH: '', NODE_OPTIONS: '--require=datasecure-must-not-be-loaded',
          SystemRoot: process.env.SystemRoot || '', LOCALAPPDATA: path.join(temporary, 'localapp'),
          EU_PRIVACY_ROOT: path.join(temporary, 'privacy'), TEMP: temporary, TMP: temporary } });
    }
    function assertFailure(result) {
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.ok(Number.isInteger(result.status) && result.status !== 0);
      assertSafeFailureOutput(result.stdout);
      assertSafeFailureOutput(result.stderr);
      checks++;
    }
    failedPhase = 'parser';
    const positive = run();
    assert.equal(positive.error, undefined);
    assert.equal(positive.status, 0);
    assert.equal(positive.stderr, '');
    assert.deepEqual(JSON.parse(positive.stdout), { schema: PROBE_SCHEMA, target,
      parent_sea: true, formats: FORMATS, privacy_release_verified: false });
    checks++;
    failedPhase = 'background';
    const background = run(['--datasecure-background-integration-probe']);
    if (background.status !== 0) { assertSafeFailureOutput(background.stdout); process.stderr.write(background.stdout); }
    assert.equal(background.error, undefined); assert.equal(background.status, 0); assert.equal(background.stderr, '');
    assert.deepEqual(JSON.parse(background.stdout), {
      schema: 'datasecure-sea-background-probe/v1', target, parent_sea: true,
      roles: ['batch', 'review', 'companion'], batch_start_types: ['start-local-batch', 'start-local-intake'],
      checks: {
        batch_malformed_token_exit_2: true, batch_disconnect_exit_2: true,
        batch_missing_token_stopped_exit_1: true, intake_invalid_queue_before_checkpoint_exit_1: true,
        review_malformed_token_exit_2: true, review_disconnect_exit_2: true, review_missing_token_exit_1: true,
        companion_authenticated_capabilities: true, companion_bad_secret_exit_2: true
      }, full_positive_job_verified: false, privacy_release_verified: false
    });
    checks++;
    failedPhase = 'mcp';
    const protocol = run([], [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    ].map(value => JSON.stringify(value)).join('\n') + '\n');
    assert.equal(protocol.error, undefined); assert.equal(protocol.status, 0); assert.equal(protocol.stderr, '');
    const responses = protocol.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(responses.find(value => value.id === 1)?.result?.serverInfo?.version, sourceEvidence.plugin_version);
    assert.deepEqual(responses.find(value => value.id === 2)?.result?.tools?.map(tool => tool.name).sort(),
      ['start_document_batch_from_picker', 'start_completed_local_results_handoff', 'continue_local_results_handoff',
        'cancel_local_results_handoff', 'continue_most_recent_document_batch', 'discard_incomplete_document_batches',
        'configure_privacy_folder', 'open_export_folder'].sort());
    checks++;
    failedPhase = 'negative-controls';
    // An extra argument must not turn this into a generic dispatch surface.
    assertFailure(run([PROBE_FLAG, 'extra']));
    negativeCases.push({ case: 'extra-argument', result: 'rejected' });
    for (const flag of ['--datasecure-batch-worker', '--datasecure-review-worker']) {
      assertFailure(run([flag]));
      negativeCases.push({ case: `${flag.replace('--datasecure-', '')}-without-ipc`, result: 'rejected' });
    }
    for (const flag of ['--datasecure-batch-worker', '--datasecure-review-worker', '--datasecure-companion']) {
      assertFailure(run([flag, 'extra']));
      negativeCases.push({ case: `${flag.replace('--datasecure-', '')}-extra-argument`, result: 'rejected' });
    }

    const parserBackup = inside(path.join(runtime, 'parser-original.bin'));
    moveRegular(parser, parserBackup);
    try {
      const mutated = Buffer.from(parserBytes);
      mutated[mutated.length - 1] ^= 1;
      absent(parser);
      fs.writeFileSync(parser, mutated, { flag: 'wx' });
      try { assertFailure(run()); } finally { removeRegular(parser); }
      negativeCases.push({ case: 'mutated-parser', result: 'rejected' });
      assertFailure(run());
      negativeCases.push({ case: 'missing-parser', result: 'rejected' });
    } finally { moveRegular(parserBackup, parser); }

    const boundSource = inside(path.join(plugin, 'server/document-parser.js'));
    const sourceBackup = inside(path.join(plugin, 'server/document-parser.original'));
    const originalSource = readSeaFile(boundSource);
    moveRegular(boundSource, sourceBackup);
    try {
      absent(boundSource);
      fs.writeFileSync(boundSource, Buffer.concat([originalSource, Buffer.from('\n// SYNTHETIC SOURCE MUTATION\n')]), { flag: 'wx' });
      try { assertFailure(run()); } finally { removeRegular(boundSource); }
      negativeCases.push({ case: 'modified-bound-server-source', result: 'rejected' });
    } finally { moveRegular(sourceBackup, boundSource); }

    for (const kind of ['symlink', 'hardlink']) {
      moveRegular(parser, parserBackup);
      let created = false;
      try {
        absent(parser);
        try {
          if (kind === 'symlink') fs.symlinkSync(parserBackup, parser, 'file');
          else fs.linkSync(parserBackup, parser);
          created = true;
        } catch (error) {
          if (!['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP'].includes(error.code)) throw error;
          absent(parser);
        }
        if (created) {
          assertFailure(run());
          negativeCases.push({ case: `${kind}-parser`, result: 'rejected' });
        } else negativeCases.push({ case: `${kind}-parser`, result: 'not-supported-on-host' });
      } finally {
        if (created) {
          // Remove this one known link without recursive traversal. Verify its
          // exact path and relationship to the private backing file first.
          inside(parser); inside(parserBackup);
          const stat = fs.lstatSync(parser);
          const backing = fs.lstatSync(parserBackup);
          assert.ok(backing.isFile() && !backing.isSymbolicLink());
          if (kind === 'symlink') {
            assert.ok(stat.isSymbolicLink());
            assert.equal(path.resolve(path.dirname(parser), fs.readlinkSync(parser)), parserBackup);
            assert.equal(backing.nlink, 1);
          } else {
            assert.ok(stat.isFile() && !stat.isSymbolicLink());
            assert.equal(stat.dev, backing.dev); assert.equal(stat.ino, backing.ino);
            assert.equal(stat.nlink, 2); assert.equal(backing.nlink, 2);
          }
          fs.unlinkSync(parser);
        }
        moveRegular(parserBackup, parser);
      }
    }
    // Binding still works after all negative controls have been restored.
    const restored = run();
    assert.equal(restored.error, undefined); assert.equal(restored.status, 0);
    assert.equal(restored.stderr, '');
    assert.deepEqual(JSON.parse(restored.stdout), JSON.parse(positive.stdout));
    checks++;
    return { schema: ACCEPTANCE_SCHEMA, release_enabled: false, target,
      formats: FORMATS, conversions_per_parent: 10, passed: checks, negative_cases: negativeCases,
      parent_dispatch_verified: true, mcp_startup_verified: true, background_ipc_verified: true,
      background_full_job_verified: false, privacy_release_verified: false };
  } finally {
    // This exact mkdtemp child is the only recursive target. Link/file safety
    // failures stop cleanup instead of retrying with broader permissions.
    assert.equal(path.dirname(temporary), tempBase);
    assert.match(path.basename(temporary), /^datasecure-sea-parent-parser-[A-Za-z0-9]+$/);
    assertSeaDirectory(temporary);
    seaTreeInventory(temporary);
    fs.rmSync(temporary, { recursive: true });
  }
}

try {
  process.stdout.write(`${JSON.stringify(await verify())}\n`);
} catch {
  // Assertion messages can contain captured parser output. Never serialize
  // them, causes, stacks, filesystem names or synthetic document contents.
  process.stdout.write(`${JSON.stringify({ schema: ACCEPTANCE_SCHEMA, ok: false,
    error: 'SEA_PARENT_PARSER_ACCEPTANCE_FAILED', phase: failedPhase, privacy_release_verified: false })}\n`);
  process.exitCode = 1;
}
