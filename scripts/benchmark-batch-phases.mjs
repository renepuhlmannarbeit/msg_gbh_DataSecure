// Manual local benchmark for the real TXT/CSV/DOCX parser and batch path.
// Stdout contains aggregate, content-free measurements only. Every file-count
// runs in a fresh child process; its first pass is cold and its second is warm.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { syntheticDocument } from './lib/performance-fixtures.mjs';

const require = createRequire(import.meta.url);
const counts = [...new Set((process.argv.find((arg) => arg.startsWith('--counts='))?.slice(9) || '1,10,100')
  .split(',').map(Number).filter((count) => Number.isInteger(count) && count > 0 && count <= 100))]
  .sort((left, right) => left - right);
const temperatures = [...new Set((process.argv.find((arg) => arg.startsWith('--temperatures='))?.slice(15) || 'cold,warm')
  .split(',').filter((value) => value === 'cold' || value === 'warm'))];
const workerCount = Number(process.argv.find((arg) => arg.startsWith('--worker-count='))?.slice(15) || 0);
if (counts.length === 0) throw new Error('Use --counts=1,10,100 with values from 1 to 100.');
if (temperatures.length === 0) throw new Error('Use --temperatures=cold,warm.');

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(percentileValue * ordered.length) - 1)];
}

function distribution(values) {
  const bounded = values.map((value) => Math.max(0, Math.trunc(Number(value) || 0)));
  return { p50_ms: percentile(bounded, 0.50), p95_ms: percentile(bounded, 0.95), total_ms: bounded.reduce((sum, value) => sum + value, 0) };
}

async function runWorker(count) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-phase-benchmark-'));
  process.env.LOCALAPPDATA = path.join(tempRoot, 'localapp');
  process.env.EU_PRIVACY_RETENTION_DAYS = '7';
  const { roots } = require('../plugins/data-secure/server/gateway/common');
  const { beginBatch, claimLocalBatchExecutor, runLocalBatchExecutor, _test } = require('../plugins/data-secure/server/gateway/batch');
  const { installBatchPrivateArtifactCrypto } = require('../tests/lib/private-artifact-test-runtime');
  installBatchPrivateArtifactCrypto(_test, _test.batchRoot());
  const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
  const { PHASES } = require('../plugins/data-secure/server/gateway/performance');

  const aggregate = (items) => Object.fromEntries(PHASES.map((phase) => [phase,
    distribution(items.map((item) => item.performance_phases_ms?.[phase] || 0))]));
  const measure = async (temperature, ordinal) => {
    // A fresh root for each pass preserves the source-retention contract and
    // guarantees the next pass sees exactly the requested synthetic files.
    process.env.EU_PRIVACY_ROOT = path.join(tempRoot, `run-${ordinal}`);
    roots();
    const sources = path.join(tempRoot, `sources-${ordinal}`);
    fs.mkdirSync(sources, { recursive: false, mode: 0o700 });
    const formats = new Set();
    const queue = [];
    for (let index = 0; index < count; index++) {
      const fixture = syntheticDocument(index);
      formats.add(fixture.extension.slice(1));
      const name = `${String(index + 1).padStart(3, '0')}${fixture.extension}`;
      const full = path.join(sources, name);
      fs.writeFileSync(full, fixture.data);
      queue.push({ name, full, sourceBytes: fixture.data.length });
    }
    const cpuStart = process.cpuUsage();
    const startedAt = performance.now();
    const batch = beginBatch({ expectedCount: count, profile: 'general', queue });
    claimLocalBatchExecutor(batch.batch_token, process.pid);
    const result = await runLocalBatchExecutor(batch.batch_token, {
      convertDocument: async (source) => parseDocumentBuffer(fs.readFileSync(source), path.extname(source).toLowerCase())
    });
    const elapsedMs = Math.max(0, Math.trunc(performance.now() - startedAt));
    const cpu = process.cpuUsage(cpuStart);
    const state = _test.readState(batch.batch_token);
    const phases = aggregate(state.items);
    const attributedMs = Object.values(phases).reduce((sum, phase) => sum + phase.total_ms, 0);
    const itemTotals = state.items.map((item) => Object.values(item.performance_phases_ms || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    return {
      files: count, temperature, formats_exercised: [...formats].sort(), total_time_ms: elapsedMs,
      unattributed_time_ms: Math.max(0, elapsedMs - attributedMs), item_latency: distribution(itemTotals), phases,
      cpu_ms: { user: Math.max(0, Math.trunc(cpu.user / 1000)), system: Math.max(0, Math.trunc(cpu.system / 1000)) },
      peak_rss_mib: Math.max(0, Math.ceil(process.resourceUsage().maxRSS / 1024)), released: result.released, stopped: result.stopped
    };
  };

  try {
    const runs = [];
    let ordinal = 0;
    for (const temperature of ['cold', 'warm'].filter((value) => temperatures.includes(value))) runs.push(await measure(temperature, ++ordinal));
    return runs;
  } finally {
    const resolved = path.resolve(tempRoot);
    const expectedPrefix = `${path.resolve(os.tmpdir())}${path.sep}datasecure-phase-benchmark-`;
    if (resolved.startsWith(expectedPrefix)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 0 });
  }
}

if (Number.isInteger(workerCount) && workerCount > 0 && workerCount <= 100) {
  process.stdout.write(`${JSON.stringify({ runs: await runWorker(workerCount) })}\n`);
} else {
  const runs = [];
  for (const count of counts) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--worker-count=${count}`, `--temperatures=${temperatures.join(',')}`], {
      encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024
    });
    if (child.status !== 0) throw new Error('BENCHMARK_WORKER_FAILED');
    const report = JSON.parse(child.stdout);
    if (!report || !Array.isArray(report.runs)) throw new Error('BENCHMARK_WORKER_INVALID');
    runs.push(...report.runs);
  }
  process.stdout.write(`${JSON.stringify({ schema: 'datasecure-batch-phase-benchmark/2', clock: 'monotonic', runs }, null, 2)}\n`);
}
