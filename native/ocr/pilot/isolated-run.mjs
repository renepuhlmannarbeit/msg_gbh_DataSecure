import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pilotDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pilotDir, '..', '..', '..');
const networkDeny = path.join(pilotDir, 'network-deny.cjs');
const modelDir = path.join(pilotDir, 'models');
const launcher = path.join(repoRoot, 'plugins', 'data-secure', 'server', 'native',
  'windows-x64', 'datasecure-sandbox.exe');
const MEMORY_MIB = 768;
const CPU_MS = 40_000;
const JOB_WALL_MS = 45_000;
const SUPERVISOR_WALL_MS = 50_000;
const OUTPUT_BYTES = 64 * 1024;

function commandFor(script, scriptArgs = []) {
  const nodeArgs = [
    '--permission',
    `--allow-fs-read=${pilotDir}`,
    '--allow-worker',
    '--allow-addons',
    '--disable-proto=throw',
    '--max-old-space-size=512',
    script,
    ...scriptArgs
  ];
  if (process.platform !== 'win32') {
    return { command: process.execPath, args: nodeArgs, mode: 'node_permission_process' };
  }
  const { verifyNativeLauncherArtifact } = require(path.join(repoRoot, 'plugins',
    'data-secure', 'server', 'native-launcher.js'));
  verifyNativeLauncherArtifact(launcher);
  return {
    command: launcher,
    args: [
      '--memory-mib', String(MEMORY_MIB),
      '--cpu-ms', String(CPU_MS),
      '--wall-ms', String(JOB_WALL_MS),
      '--', process.execPath, ...nodeArgs
    ],
    mode: 'windows_job_object'
  };
}

function runBounded(script, scriptArgs = [], options = {}) {
  const invocation = commandFor(script, scriptArgs);
  const timeoutMs = options.timeoutMs ?? SUPERVISOR_WALL_MS;
  const outputLimit = options.outputLimit ?? OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      shell: false,
      env: {
        DATASECURE_OCR_MODEL_DIR: modelDir,
        NODE_OPTIONS: `--require=${networkDeny}`
      }
    });
    const chunks = [];
    let size = 0;
    let stopReason = null;
    let closed = false;
    const stop = (reason) => {
      if (closed || stopReason) return;
      stopReason = reason;
      child.kill();
    };
    const timer = setTimeout(() => stop('OCR_ISOLATION_TIMEOUT'), timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > outputLimit) return stop('OCR_ISOLATION_OUTPUT_LIMIT');
      chunks.push(chunk);
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('OCR_ISOLATION_START_FAILED'));
    });
    child.once('close', (code) => {
      closed = true;
      clearTimeout(timer);
      if (stopReason) return reject(new Error(stopReason));
      if (code === 125) return reject(new Error('OCR_ISOLATION_RESOURCE_LIMIT'));
      if (process.platform === 'win32' && Number.isInteger(code) && code >= 120 && code <= 126) {
        return reject(new Error('OCR_ISOLATION_BOUNDARY_FAILED'));
      }
      if (code !== 0) return reject(new Error('OCR_ISOLATION_WORKER_FAILED'));
      resolve({ bytes: Buffer.concat(chunks), mode: invocation.mode });
    });
  });
}

async function expectFailure(expected, task) {
  try {
    await task();
  } catch (error) {
    assert.equal(error.message, expected);
    return true;
  }
  throw new Error(`NEGATIVE_PROBE_DID_NOT_FAIL_${expected}`);
}

const positive = await runBounded(path.join(pilotDir, 'run.mjs'));
const result = JSON.parse(positive.bytes.toString('utf8'));
assert.equal(result.release_decision, 'no_go');
assert.equal(result.product_image_gate, 'OCR_COVERAGE_UNVERIFIED');
assert.deepStrictEqual(result.passed_gates, []);

const timeoutProbe = await expectFailure('OCR_ISOLATION_TIMEOUT', () => runBounded(
  path.join(pilotDir, 'isolation-fixture.mjs'), ['timeout'], { timeoutMs: 100 }
));
const outputProbe = await expectFailure('OCR_ISOLATION_OUTPUT_LIMIT', () => runBounded(
  path.join(pilotDir, 'isolation-fixture.mjs'), ['flood'], { outputLimit: 1024 }
));

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  evidence_kind: 'bounded-offline-ocr-process-pilot-not-product-release',
  platform: `${process.platform}-${process.arch}`,
  isolation_mode: positive.mode,
  network_policy: 'child-process-preload-deny',
  limits: {
    memory_mib: process.platform === 'win32' ? MEMORY_MIB : null,
    node_heap_mib: 512,
    cpu_ms: process.platform === 'win32' ? CPU_MS : null,
    job_wall_ms: process.platform === 'win32' ? JOB_WALL_MS : null,
    supervisor_wall_ms: SUPERVISOR_WALL_MS,
    output_bytes: OUTPUT_BYTES
  },
  negative_probes: { timeout: timeoutProbe, output_limit: outputProbe },
  mixed_language_ocr: result.mixed_language_ocr,
  release_decision: 'no_go',
  product_image_gate: 'OCR_COVERAGE_UNVERIFIED',
  passed_gates: [
    'pilot-process-boundary',
    'pilot-network-deny',
    'pilot-wallclock-limit',
    'pilot-output-limit'
  ],
  open_work: [
    'native-memory-and-cpu-limits-on-macos-linux',
    'runtime-bundle-integration',
    'adversarial-layout-and-resource-corpus',
    'fresh-plugin-package'
  ]
}, null, 2)}\n`);
