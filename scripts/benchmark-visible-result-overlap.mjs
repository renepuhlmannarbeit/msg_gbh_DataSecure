import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prefix = 'datasecure-overlap-benchmark-';
const systemTemp = fs.realpathSync.native(os.tmpdir());
const scope = fs.mkdtempSync(path.join(systemTemp, prefix));
const sourceRoot = path.join(scope, 'Quellen');
const resultRoot = path.join(scope, 'Ergebnisse');
const privateRoot = path.join(scope, 'Privat');

function percentile(sorted, quantile) {
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

function removeOwnedScope() {
  const resolved = fs.realpathSync.native(scope);
  assert.equal(path.dirname(resolved), systemTemp, 'benchmark cleanup must stay directly below the system temp directory');
  assert.ok(path.basename(resolved).startsWith(prefix), 'benchmark cleanup needs its owned prefix');
  assert.equal(fs.lstatSync(resolved).isSymbolicLink(), false, 'benchmark scope must not be a symbolic link');
  fs.rmSync(resolved, { recursive: true, force: false });
}

try {
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(resultRoot, { recursive: true });
  fs.mkdirSync(privateRoot, { recursive: true });
  const candidates = [sourceRoot];
  for (let directoryIndex = 0; directoryIndex < 20; directoryIndex += 1) {
    const directory = path.join(sourceRoot, `gruppe-${String(directoryIndex + 1).padStart(2, '0')}`);
    fs.mkdirSync(directory);
    for (let fileIndex = 0; fileIndex < 10; fileIndex += 1) {
      const file = path.join(directory, `dokument-${String(fileIndex + 1).padStart(2, '0')}.txt`);
      fs.writeFileSync(file, 'synthetic benchmark content\n', { flag: 'wx' });
      candidates.push(file);
    }
  }
  process.env.EU_PRIVACY_ROOT = privateRoot;
  process.env.EU_PRIVACY_RESULT_ROOT = resultRoot;
  const { visibleResultTreeOverlaps } = require('../plugins/data-secure/server/gateway/result-folder-config.js');
  assert.equal(visibleResultTreeOverlaps(sourceRoot), false);
  assert.equal(visibleResultTreeOverlaps(path.join(resultRoot, 'DataSecure-Output')), true);
  assert.equal(visibleResultTreeOverlaps(path.join(resultRoot, 'DataSecure-Markdown', 'run')), true);

  const run = () => {
    const started = performance.now();
    for (const candidate of candidates) assert.equal(visibleResultTreeOverlaps(candidate), false);
    return performance.now() - started;
  };
  const coldMs = run();
  run();
  run();
  const samples = Array.from({ length: 30 }, run).sort((left, right) => left - right);
  const p50Ms = percentile(samples, 0.50);
  const p95Ms = percentile(samples, 0.95);
  const localReferenceBudgetMs = 250;
  assert.ok(p95Ms <= localReferenceBudgetMs,
    `overlap benchmark p95 ${p95Ms.toFixed(3)}ms exceeds local-reference budget ${localReferenceBudgetMs}ms`);
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-visible-result-overlap-benchmark/1',
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    candidates: candidates.length,
    directories: 20,
    warm_runs: samples.length,
    cold_ms: Number(coldMs.toFixed(3)),
    p50_ms: Number(p50Ms.toFixed(3)),
    p95_ms: Number(p95Ms.toFixed(3)),
    max_ms: Number(samples.at(-1).toFixed(3)),
    local_reference_budget_ms: localReferenceBudgetMs,
    cache_signal: 'not_indicated_on_local_reference_host',
    network_or_sync_root_evidence: 'open'
  })}\n`);
} finally {
  removeOwnedScope();
}
