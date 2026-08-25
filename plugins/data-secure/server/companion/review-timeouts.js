'use strict';

// The synchronous support tool must finish inside its MCP supervisor window.
// The detached local review is deliberately independent from that request and
// gives a human substantially more time to finish the native dialog.
const DEFAULT_REVIEW_TIMEOUT_MS = 5 * 60 * 1000;
const DETACHED_REVIEW_TIMEOUT_MS = 30 * 60 * 1000;

module.exports = { DEFAULT_REVIEW_TIMEOUT_MS, DETACHED_REVIEW_TIMEOUT_MS };
