'use strict';

// The synchronous support tool must finish inside its MCP supervisor window.
// The detached local review is deliberately independent from that request and
// gives a human substantially more time to finish the native dialog.
const DEFAULT_REVIEW_TIMEOUT_MS = 5 * 60 * 1000;
// The detached local reviewer is outside the Cowork request lifecycle. A human
// decision must not expire merely because the user needs more time; cancel and
// defer remain explicit UI actions. `null` means no process timeout.
const DETACHED_REVIEW_TIMEOUT_MS = null;

module.exports = { DEFAULT_REVIEW_TIMEOUT_MS, DETACHED_REVIEW_TIMEOUT_MS };
