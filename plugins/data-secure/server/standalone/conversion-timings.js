'use strict';

// Diagnostic-only elapsed work within this process, not exact OS transport or
// CPU accounting. Stages may be inclusive (for example OCR initialization
// includes model verification); their sum is not the overall worker lifetime.
const { types } = require('node:util');
const contract = require('../core/conversion-timing-contract');
const { SCHEMA, PREFIX, FRAME_PREFIX, STAGES, MAX_LINE_BYTES, MAX_STDERR_BYTES, MAX_DURATION_MS, MAX_COUNT, createConversionTimingStream } = contract;
const noop = () => {};

function validateConversionTimings(value, expectedType) {
  try {
    if (!value || types.isProxy(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (types.isProxy(descriptors.durations_ms?.value) || types.isProxy(descriptors.counts?.value)) return null;
    return contract.validateConversionTimings(value, expectedType);
  } catch { return null; }
}

function createConversionTimings(now = () => process.hrtime.bigint()) {
  let enabled = true, last, finished = false;
  function clock() {
    if (!enabled) return null;
    try {
      const value = now();
      if (typeof value !== 'bigint' || value < 0n || (last !== undefined && value < last)) { enabled = false; return null; }
      last = value; return value;
    } catch { enabled = false; return null; }
  }
  const start = clock(), totals = Object.fromEntries(STAGES.map(stage => [stage, 0n]));
  const counts = Object.fromEntries(STAGES.map(stage => [stage, 0]));
  function begin(stage) {
    if (finished || !STAGES.includes(stage) || counts[stage] >= MAX_COUNT) return noop;
    const before = clock(); if (before === null) return noop;
    counts[stage]++;
    let ended = false;
    return () => { if (ended || finished) return; ended = true;
      const after = clock(); if (after !== null) totals[stage] += after - before; };
  }
  return Object.freeze({ begin,
    measure(stage, operation) { const end = begin(stage); try { return operation(); } finally { end(); } },
    async measureAsync(stage, operation) { const end = begin(stage); try { return await operation(); } finally { end(); } },
    finish(sourceType, outcome) {
      if (finished) return null;
      const end = clock(); finished = true;
      if (start === null || end === null || !enabled) return null;
      const ms = value => Number(value / 1_000_000n);
      return validateConversionTimings({ schema: SCHEMA, source_type: sourceType, outcome,
        worker_total_ms: ms(end - start), durations_ms: Object.fromEntries(STAGES.map(stage => [stage, ms(totals[stage])])), counts });
    }
  });
}

function serializeConversionTimings(value) {
  const parsed = validateConversionTimings(value); if (!parsed) return null;
  const line = `${FRAME_PREFIX}${JSON.stringify(parsed)}\n`;
  return Buffer.byteLength(line) <= MAX_LINE_BYTES ? line : null;
}

module.exports = Object.freeze({ SCHEMA, PREFIX, STAGES, MAX_LINE_BYTES, MAX_STDERR_BYTES, MAX_DURATION_MS, MAX_COUNT,
  createConversionTimings, validateConversionTimings, serializeConversionTimings, createConversionTimingStream });
