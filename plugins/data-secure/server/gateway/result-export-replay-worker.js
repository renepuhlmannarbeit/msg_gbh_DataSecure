'use strict';

// Startup recovery runs outside the MCP event loop.  Export records and every
// file operation remain governed by result-export's fail-closed contracts; a
// worker failure merely leaves the durable record pending for a later retry.
const { parentPort } = require('worker_threads');
const { replayPendingResultExports } = require('./result-export');

let result = { exported: 0, pending: 0, failures: 1 };
try {
  const replayed = replayPendingResultExports();
  if (replayed && [replayed.exported, replayed.pending, replayed.failures]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) result = replayed;
} catch {
  // No exception or private path crosses the worker boundary.
}

try { parentPort?.postMessage(result); } catch {}
