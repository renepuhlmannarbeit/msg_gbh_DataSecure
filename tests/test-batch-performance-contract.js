'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { createSuite } = require('./helpers');
const {
  PHASES,
  MAX_DURATION_MS,
  IO_SUMMARY_SCHEMA,
  IO_SUMMARY_KEYS,
  createPhaseRecorder,
  validatePhaseDurations,
  createPrivateIoSummary,
  incrementPrivateIoSummary,
  validatePrivateIoSummary
} = require('../plugins/data-secure/server/gateway/performance');

const { test, done, assert } = createSuite('Batch performance contract');

test('phase recorder contains only fixed labels and bounded durations', () => {
  const values = [100, 125, 225, 230, 290, 340];
  const recorder = createPhaseRecorder({ now: () => values.shift() });
  for (const phase of PHASES) assert.strictEqual(recorder.mark(phase), true);
  const snapshot = recorder.snapshot();
  assert.deepStrictEqual(snapshot, {
    intake_and_preparation: 25,
    conversion_and_visual_scan: 100,
    text_privacy_check: 5,
    verification: 60,
    publication: 50
  });
  assert.strictEqual(validatePhaseDurations(snapshot), true);
  assert.doesNotMatch(JSON.stringify(snapshot), /name|path|hash|content|profile/i);
});

test('phase timing is non-authoritative and remains safe for bad clocks', () => {
  const recorder = createPhaseRecorder({ now: () => Number.NaN });
  assert.strictEqual(recorder.mark('intake_and_preparation'), true);
  assert.strictEqual(recorder.mark('not_a_phase'), false);
  assert.strictEqual(recorder.mark('intake_and_preparation'), false);
  assert.deepStrictEqual(recorder.snapshot(), { intake_and_preparation: 0 });
  assert.strictEqual(validatePhaseDurations({ publication: MAX_DURATION_MS + 1 }), false);
});

test('phase recorder clamps a backwards host clock monotonically', () => {
  const values = [100, 125, 110, 140];
  const recorder = createPhaseRecorder({ now: () => values.shift() });
  recorder.mark('intake_and_preparation');
  recorder.mark('conversion_and_visual_scan');
  recorder.mark('text_privacy_check');
  assert.deepStrictEqual(recorder.snapshot(), {
    intake_and_preparation: 25,
    conversion_and_visual_scan: 0,
    text_privacy_check: 15
  });
});

test('private I/O summary has only fixed, bounded and content-free counters', () => {
  const summary = createPrivateIoSummary({
    snapshot_preflight_runs: 3,
    snapshot_copy_files: 101,
    snapshot_copy_mib: 999,
    final_gate_runs: 2
  });
  assert.strictEqual(summary.schema, IO_SUMMARY_SCHEMA);
  assert.deepStrictEqual(Object.keys(summary).sort(), ['schema', ...IO_SUMMARY_KEYS].sort());
  assert.strictEqual(summary.snapshot_preflight_runs, 3);
  assert.strictEqual(summary.snapshot_copy_files, 100);
  assert.strictEqual(summary.snapshot_copy_mib, 500);
  assert.strictEqual(incrementPrivateIoSummary(summary, 'audit_receipt_writes'), true);
  assert.strictEqual(summary.audit_receipt_writes, 1);
  assert.strictEqual(incrementPrivateIoSummary(summary, 'filename'), false);
  assert.strictEqual(validatePrivateIoSummary(summary), true);
  assert.strictEqual(validatePrivateIoSummary({ ...summary, filename: 'private.docx' }), false);
  assert.doesNotMatch(JSON.stringify(summary), /filename|path|hash|content|profile|token/i);
});

test('manual benchmark covers real TXT, CSV and DOCX parsing with bounded cold/warm aggregates', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'benchmark-batch-phases.mjs'), '--counts=3'
  ], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000 });
  assert.strictEqual(result.status, 0, result.stderr || 'benchmark failed');
  const report = JSON.parse(result.stdout);
  assert.deepStrictEqual(Object.keys(report).sort(), ['clock', 'runs', 'schema']);
  assert.strictEqual(report.schema, 'datasecure-batch-phase-benchmark/2');
  assert.strictEqual(report.clock, 'monotonic');
  assert.deepStrictEqual(report.runs.map((run) => run.temperature), ['cold', 'warm']);
  for (const run of report.runs) {
    assert.strictEqual(run.files, 3);
    assert.deepStrictEqual(run.formats_exercised, ['csv', 'docx', 'txt']);
    assert.deepStrictEqual(Object.keys(run).sort(), ['cpu_ms', 'files', 'formats_exercised', 'item_latency', 'peak_rss_mib', 'phases', 'released', 'stopped', 'temperature', 'total_time_ms', 'unattributed_time_ms']);
    assert.deepStrictEqual(Object.keys(run.phases).sort(), [...PHASES].sort());
    for (const distribution of [run.item_latency, ...Object.values(run.phases)]) {
      assert.deepStrictEqual(Object.keys(distribution).sort(), ['p50_ms', 'p95_ms', 'total_ms']);
      assert.ok(Object.values(distribution).every((value) => Number.isInteger(value) && value >= 0));
    }
    assert.ok(Number.isInteger(run.total_time_ms) && run.total_time_ms >= 0);
    assert.ok(Number.isInteger(run.unattributed_time_ms) && run.unattributed_time_ms >= 0);
    assert.ok(Number.isInteger(run.peak_rss_mib) && run.peak_rss_mib > 0);
    assert.deepStrictEqual(Object.keys(run.cpu_ms).sort(), ['system', 'user']);
  }
  // A deliberately generous relative guard catches orders-of-magnitude
  // regressions without making shared/slow CI runners flaky.
  assert.ok(report.runs[1].total_time_ms <= report.runs[0].total_time_ms * 4 + 5000);
  assert.doesNotMatch(result.stdout, /datasecure-phase-benchmark-|Synthetischer Fachabschnitt|source|path|hash|filename/i);
});

done();
