'use strict';

const { createBackgroundRoleLauncher } = require('./core/background-process-launcher');
const { resolveDurableRuntimeRoot } = require('./durable-runtime-cache');

const launchBackgroundRole = createBackgroundRoleLauncher({
  batch: { entry: 'gateway/batch-worker.js', flag: '--datasecure-batch-worker', transport: 'json-ipc' },
  review: { entry: 'gateway/review-worker.js', flag: '--datasecure-review-worker', transport: 'json-ipc' },
  companion: { entry: 'companion/stdio-server.js', flag: '--datasecure-companion', transport: 'fd3' }
}, resolveDurableRuntimeRoot);

module.exports = { launchBackgroundRole };
