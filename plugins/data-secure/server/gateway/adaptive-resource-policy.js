'use strict';

const os = require('os');

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const POLICY_SCHEMA = 'datasecure-adaptive-preparation/1';

function boundedInteger(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : minimum;
}

// Parallel preparation is deliberately closed until both target operating
// systems have supplied acceptance evidence.  The policy can still be
// exercised by the synthetic harness with productActivationProven=true.
function adaptivePreparationPolicy(options = {}) {
  const system = options.os || os;
  const total = Number(system.totalmem?.() || 0);
  const free = Number(system.freemem?.() || 0);
  const cpuCount = Array.isArray(system.cpus?.()) ? system.cpus().length : 1;
  const safeBudget = boundedInteger(Math.min(total * 0.25, free * 0.5, 2 * GIB), 64 * MIB, 2 * GIB);
  const ocrSingleFlight = options.ocrActive === true;
  const eligibleForTwo = options.productActivationProven === true && !ocrSingleFlight &&
    cpuCount >= 4 && total >= 4 * GIB && free >= 512 * MIB && safeBudget >= 256 * MIB;
  return Object.freeze({
    schema: POLICY_SCHEMA,
    maximum_workers: eligibleForTwo ? 2 : 1,
    maximum_staged_bytes: safeBudget,
    ocr_single_flight: ocrSingleFlight,
    product_parallelism_enabled: eligibleForTwo
  });
}

module.exports = { adaptivePreparationPolicy, POLICY_SCHEMA, MIB, GIB };
