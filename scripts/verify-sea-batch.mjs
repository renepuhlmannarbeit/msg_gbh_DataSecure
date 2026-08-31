// Historical account-gated harness: NOT approved under DS-063 until redesigned.
// Explicit engineering acceptance in a separately provisioned Windows test
// account on a real local host, never a VM. NEVER called by CI. An operator acknowledgement is not an OS
// attestation. All synthetic trees are retained; no account credentials are
// exported, renamed, removed or substituted by this verifier.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readSeaFile, seaHash, assertSeaDirectory, createSeaSourceEvidence,
  assertSeaSourceEvidence } from './lib/sea-source-evidence.mjs';
import { loadParserRole } from './lib/sea-parser-bundle.mjs';
import { prepareLauncherProvenance, assertLauncherBuildEvidence } from './lib/sea-launcher-provenance.mjs';

const root = path.resolve(import.meta.dirname, '..');
const FLAG = '--datasecure-batch-acceptance-probe';
const SCENARIOS = ['positive', 'disconnect', 'worker-resume'];
const CHECKS = ['actual_worker_exit', 'journal_complete', 'three_unique_verified_packages',
  'grades_verified', 'pii_removed', 'qualification_preserved', 'originals_unchanged',
  'mapping_exactly_once', 'ipc_disconnect_survived', 'worker_crash_observed', 'released_packages_preserved'];
function fail(code) { throw new Error(code); }
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

export function parseArguments(argv) {
  // This check precedes artifact I/O, staging, product imports and all spawns.
  if (!argv.includes('--isolated-test-account')) fail('SEA_BATCH_ISOLATED_ACCOUNT_REQUIRED');
  const values = new Map();
  let acknowledged = false;
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--isolated-test-account') {
      if (acknowledged) fail('SEA_BATCH_ARGUMENTS_INVALID');
      acknowledged = true;
      continue;
    }
    if (!['--parent', '--parser-directory', '--scenario'].includes(key) || values.has(key) ||
        !argv[index + 1] || argv[index + 1].startsWith('--')) fail('SEA_BATCH_ARGUMENTS_INVALID');
    values.set(key, argv[++index]);
  }
  if (!values.has('--parent') || !values.has('--parser-directory') ||
      (values.has('--scenario') && !SCENARIOS.includes(values.get('--scenario')))) fail('SEA_BATCH_ARGUMENTS_INVALID');
  return { parent: path.resolve(values.get('--parent')), parserDirectory: path.resolve(values.get('--parser-directory')),
    scenarios: values.has('--scenario') ? [values.get('--scenario')] : [...SCENARIOS] };
}

export function validateResult(value, scenario) {
  if (!exact(value, ['schema', 'scenario', 'target', 'checks', 'cleanup_safe', 'privacy_release_verified']) ||
      value.schema !== 'datasecure-sea-batch-probe/v1' || value.scenario !== scenario ||
      value.target !== 'windows-x64' || value.privacy_release_verified !== false || value.cleanup_safe !== true ||
      !exact(value.checks, CHECKS) ||
      CHECKS.some(key => typeof value.checks[key] !== 'boolean' ||
        value.checks[key] !== (key === 'ipc_disconnect_survived' ? scenario === 'disconnect' :
          ['worker_crash_observed', 'released_packages_preserved'].includes(key) ? scenario === 'worker-resume' : true)) ||
      !SCENARIOS.includes(scenario)) fail('SEA_BATCH_RESULT_INVALID');
  return value;
}

async function prepareAssembly(args) {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('SEA_BATCH_HOST_PENDING');
  const contractFile = path.join(root, 'native/sea/launcher-contract.json');
  const contract = JSON.parse(readSeaFile(contractFile, 65536));
  const target = contract.targets.find(item => item.id === 'windows-x64');
  if (contract.release_enabled !== false || !target) fail('SEA_BATCH_PROVENANCE_INVALID');
  const role = await loadParserRole(root, args.parserDirectory, target, contract);
  const parentBytes = readSeaFile(args.parent);
  const evidence = JSON.parse(readSeaFile(`${args.parent}.evidence.json`, 65536));
  const prepared = prepareLauncherProvenance(root, target.id, role);
  try {
    assertLauncherBuildEvidence(evidence, parentBytes, prepared);
  } catch { fail('SEA_BATCH_PROVENANCE_INVALID'); }
  const parserBytes = readSeaFile(path.join(args.parserDirectory, 'datasecure-parser.exe'));
  if (parserBytes.length !== role.bytes || seaHash(parserBytes) !== role.sha256) fail('SEA_BATCH_PROVENANCE_INVALID');
  const source = path.join(root, 'plugins/data-secure');
  const dispatcher = path.join(root, contract.posix_dispatcher);
  const expected = prepared.provenance.source_evidence;
  assertSeaSourceEvidence(createSeaSourceEvidence(source, contractFile, dispatcher), expected);
  const temporaryRoot = assertSeaDirectory(fs.realpathSync(os.tmpdir()));
  const stage = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-sea-batch-'));
  const plugin = path.join(stage, 'plugin');
  fs.cpSync(source, plugin, { recursive: true, dereference: false });
  assertSeaSourceEvidence(createSeaSourceEvidence(plugin, contractFile, dispatcher), expected);
  const bin = path.join(plugin, 'bin');
  const runtime = path.join(plugin, 'server/runtime/windows-x64');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(runtime, { recursive: true });
  assertSeaDirectory(bin); assertSeaDirectory(runtime);
  const parent = path.join(bin, 'datasecure-mcp.exe');
  fs.writeFileSync(parent, parentBytes, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(runtime, 'datasecure-parser.exe'), parserBytes, { flag: 'wx', mode: 0o600 });
  const cwd = path.join(stage, 'foreign-cwd');
  fs.mkdirSync(cwd);
  return { stage, parent, cwd, temporaryRoot };
}

function runCase(assembly, scenario) {
  const caseRoot = path.join(assembly.stage, `case-${scenario}`);
  fs.mkdirSync(caseRoot, { mode: 0o700 });
  assertSeaDirectory(caseRoot);
  fs.writeFileSync(path.join(caseRoot, 'acceptance-scope.json'), JSON.stringify({
    schema: 'datasecure-sea-batch-scope/v1', scenario, isolated_test_account_acknowledged: true
  }), { flag: 'wx', mode: 0o600 });
  const env = { PATH: '', SystemRoot: process.env.SystemRoot || '',
    LOCALAPPDATA: path.join(caseRoot, 'localapp'), EU_PRIVACY_ROOT: path.join(caseRoot, 'privacy'),
    TEMP: assembly.temporaryRoot, TMP: assembly.temporaryRoot };
  return new Promise((resolve, reject) => {
    let child, timer, stdout = '', stderr = '', failure = null, ended = false, closed = false;
    let finished = false, exitCode, stopRequested = false;
    function stop(code) {
      failure ||= code;
      if (child && !ended && !stopRequested) {
        stopRequested = true;
        try { child.kill(); } catch { /* retained scope, never broad process cleanup */ }
      }
    }
    function complete() {
      if (finished || !closed) return; // piped output must drain through close
      finished = true; clearTimeout(timer);
      try {
        if (failure || exitCode !== 0 || stderr !== '') fail(failure || 'SEA_BATCH_PROBE_FAILED');
        const value = JSON.parse(stdout);
        resolve(validateResult(value, scenario));
      } catch { reject(new Error(failure || 'SEA_BATCH_PROBE_FAILED')); }
    }
    try {
      child = spawn(assembly.parent, [FLAG], { cwd: assembly.cwd, env, shell: false, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    } catch { reject(new Error('SEA_BATCH_PROBE_START_FAILED')); return; }
    timer = setTimeout(() => {
      stop('SEA_BATCH_PROBE_DEADLINE');
      // A killed parent may leave a worker alive. Retain the entire synthetic
      // scope; neither this timeout nor a kill return is cleanup evidence.
      if (!finished) {
        finished = true;
        try { if (child.connected) child.disconnect(); } catch {}
        child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
        reject(new Error('SEA_BATCH_PROBE_DEADLINE'));
      }
    }, 150_000);
    child.on('error', () => stop('SEA_BATCH_PROBE_START_FAILED'));
    child.once('exit', code => { ended = true; exitCode = code; });
    child.once('close', code => { ended = true; closed = true; exitCode = code; complete(); });
    for (const [stream, key] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.on('error', () => stop('SEA_BATCH_PROBE_OUTPUT_INVALID'));
      stream.on('data', chunk => {
        if (failure) return;
        if (stdout.length + stderr.length + chunk.length > 16384) { stop('SEA_BATCH_PROBE_OUTPUT_INVALID'); return; }
        if (key === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      });
    }
    try {
      child.send({ type: 'start-sea-batch-acceptance', scenario, root: caseRoot,
        isolated_test_account_acknowledged: true }, error => { if (error) stop('SEA_BATCH_PROBE_IPC_FAILED'); });
    } catch { stop('SEA_BATCH_PROBE_IPC_FAILED'); }
  });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArguments(argv);
    // DS-063 rejects the old account-based prerequisite. Keep argument guards,
    // but an acknowledgement alone must never activate product/keyring jobs.
    fail('SEA_BATCH_TEST_ISOLATION_PENDING');
    const assembly = await prepareAssembly(args);
    const results = [];
    // Sequential first initialization: separate roots do not independently lock
    // the shared OS credential. Never initialize test cases concurrently.
    for (const scenario of args.scenarios) results.push(await runCase(assembly, scenario));
    process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-batch-acceptance/v1', target: 'windows-x64',
      isolated_account_operator_acknowledged: true, os_isolation_attested: false,
      synthetic_tree_retained: true, results, parent_crash_verified: false,
      worker_resume_verified: results.some(result => result.scenario === 'worker-resume'),
      privacy_release_verified: false }) + '\n');
  } catch (error) {
    const code = /^SEA_BATCH_[A-Z_]{1,80}$/.test(error?.message || '') ? error.message : 'SEA_BATCH_ACCEPTANCE_FAILED';
    process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-batch-acceptance/v1', ok: false,
      error: code, privacy_release_verified: false }) + '\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
