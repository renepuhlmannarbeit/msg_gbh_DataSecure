'use strict';

const { createBackgroundRoleLauncher } = require('./core/background-process-launcher');

const launchBackgroundRole = createBackgroundRoleLauncher({
  batch: { entry: 'gateway/batch-worker.js', flag: '--datasecure-batch-worker', transport: 'json-ipc' },
  review: { entry: 'gateway/review-worker.js', flag: '--datasecure-review-worker', transport: 'json-ipc' }
});

module.exports = Object.freeze({ launchBackgroundRole });
