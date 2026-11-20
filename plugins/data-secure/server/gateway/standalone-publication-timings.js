'use strict';

const { performance } = require('node:perf_hooks');

const phases = Object.freeze([
  'result_resume_check', 'result_privacy_decisions', 'result_residual_check',
  'result_identity_snapshot', 'result_registry_commit', 'result_prepared_write',
  'result_prepared_read', 'result_private_publish', 'result_private_confirm',
  'result_public_claim', 'result_public_plan', 'result_public_file', 'result_public_file_ack',
  'result_public_companions', 'result_public_inventory', 'result_public_complete',
  'converter_lookahead_start', 'converter_lookahead_hit'
]);
const allowed = new Set(phases);
const omit = () => {};
let totals;

function begin(phase) {
  const run = totals;
  if (!run || !allowed.has(phase)) return omit;
  const start = performance.now();
  return () => {
    const metric = run.get(phase) ?? { count: 0, duration: 0 };
    metric.count++;
    metric.duration += Math.max(0, performance.now() - start);
    run.set(phase, metric);
  };
}

function measure(phase, action) {
  const end = begin(phase);
  try { return action(); }
  finally { end(); }
}

async function measureAsync(phase, action) {
  const end = begin(phase);
  try { return await action(); }
  finally { end(); }
}

function start() { totals = new Map(); }

function finish(record) {
  const complete = totals;
  totals = undefined;
  if (!complete) return;
  for (const [phase, { count, duration }] of complete) {
    try { record({ event: 'standalone_publication_timing', phase, outcome: 'progress',
      item_count: count, duration_ms: Math.round(duration) }); }
    catch { /* Numeric diagnostics cannot affect publication. */ }
  }
}

module.exports = Object.freeze({ phases, begin, measure, measureAsync, start, finish });
