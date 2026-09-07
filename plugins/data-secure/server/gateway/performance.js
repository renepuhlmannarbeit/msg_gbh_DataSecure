'use strict';

const { performance } = require('perf_hooks');
const { RESOURCE_LIMITS } = require('../resource-limits');

// Performance evidence is deliberately local and content-free. It records no
// wall-clock timestamp, filename, path, hash, profile or document property:
// only bounded durations between fixed processing boundaries.
const PHASES = Object.freeze([
  'intake_and_preparation',
  'conversion_and_visual_scan',
  'text_privacy_check',
  'verification',
  'publication'
]);
const MAX_DURATION_MS = 60 * 60 * 1000;
const IO_SUMMARY_SCHEMA = 'datasecure-private-io-summary/1';
const MAX_BATCH_BYTES_MIB = 500;
const IO_SUMMARY_KEYS = Object.freeze([
  'snapshot_preflight_runs', 'snapshot_copy_files', 'snapshot_copy_mib',
  'final_gate_runs', 'output_packages_committed', 'audit_receipt_writes',
  'batch_maintenance_runs'
]);

function monotonicNow() { return performance.now(); }

function safeNow(source) {
  try {
    const value = Number((source || monotonicNow)());
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function boundedDuration(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.trunc(value)));
}

function createPhaseRecorder(options = {}) {
  const now = options.now;
  let previous = safeNow(now);
  const durations = Object.create(null);

  return Object.freeze({
    mark(phase) {
      if (!PHASES.includes(phase) || Object.hasOwn(durations, phase)) return false;
      // A supplied test/host clock may jump backwards. Clamp it instead of
      // letting a later phase absorb the backwards jump as artificial time.
      const current = Math.max(previous, safeNow(now));
      durations[phase] = boundedDuration(current - previous);
      previous = current;
      return true;
    },
    snapshot() {
      return Object.freeze(Object.fromEntries(Object.entries(durations)));
    }
  });
}

function validatePhaseDurations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([phase, duration]) =>
    PHASES.includes(phase) && Number.isSafeInteger(duration) && duration >= 0 && duration <= MAX_DURATION_MS
  );
}

function boundedCount(value, maximum) {
  return Math.min(maximum, Math.max(0, Math.trunc(Number(value) || 0)));
}

function ioMaximum(key) {
  return key === 'snapshot_copy_mib' ? MAX_BATCH_BYTES_MIB : RESOURCE_LIMITS.MAX_BATCH_FILES;
}

function createPrivateIoSummary(values = {}) {
  const summary = { schema: IO_SUMMARY_SCHEMA };
  for (const key of IO_SUMMARY_KEYS) {
    const maximum = ioMaximum(key);
    summary[key] = boundedCount(values[key], maximum);
  }
  return summary;
}

function incrementPrivateIoSummary(summary, key, amount = 1) {
  if (!summary || summary.schema !== IO_SUMMARY_SCHEMA || !IO_SUMMARY_KEYS.includes(key)) return false;
  const maximum = ioMaximum(key);
  summary[key] = boundedCount(summary[key] + boundedCount(amount, maximum), maximum);
  return true;
}

function validatePrivateIoSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== IO_SUMMARY_SCHEMA) return false;
  return Object.keys(value).length === IO_SUMMARY_KEYS.length + 1 && IO_SUMMARY_KEYS.every((key) => {
    const maximum = ioMaximum(key);
    return Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= maximum;
  });
}

module.exports = { PHASES, MAX_DURATION_MS, IO_SUMMARY_SCHEMA, IO_SUMMARY_KEYS, createPhaseRecorder, validatePhaseDurations, createPrivateIoSummary, incrementPrivateIoSummary, validatePrivateIoSummary };
