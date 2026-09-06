'use strict';

// Bounded default for direct internal callers and engineering fixtures.
// Both normal and support MCP review routes now delegate to a detached worker;
// neither waits synchronously for the human decision in the MCP process.
const DEFAULT_REVIEW_TIMEOUT_MS = 5 * 60 * 1000;
// The detached local reviewer is outside the Cowork request lifecycle. A human
// decision must not expire merely because the user needs more time; cancel and
// defer remain explicit UI actions. `null` means no process timeout.
const DETACHED_REVIEW_TIMEOUT_MS = null;

module.exports = { DEFAULT_REVIEW_TIMEOUT_MS, DETACHED_REVIEW_TIMEOUT_MS };
