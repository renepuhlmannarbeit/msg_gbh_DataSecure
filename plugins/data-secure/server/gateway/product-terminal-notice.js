'use strict';

const path = require('node:path');

// Optional Cowork presenters are loaded only by that product. Keeping this
// boundary explicit lets the closed Standalone projection omit native Cowork
// dialogs while retaining the same worker transaction and journal code.
function coworkModule(relative) {
  if (process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone')
    throw new Error('COWORK_PRESENTER_UNAVAILABLE_IN_STANDALONE');
  return require(path.join(__dirname, relative));
}

function showBatchStateNoticeConfirmed(...args) {
  return coworkModule('../companion/completion-summary.js').showBatchStateNoticeConfirmed(...args);
}

function showLocalIntakeNoticeConfirmed(...args) {
  return coworkModule('../companion/completion-summary.js').showLocalIntakeNoticeConfirmed(...args);
}

function presentTerminalEnvelope(...args) {
  return coworkModule('./worker-terminal-presentation.js').presentTerminalEnvelope(...args);
}

module.exports = Object.freeze({
  showBatchStateNoticeConfirmed, showLocalIntakeNoticeConfirmed, presentTerminalEnvelope
});
