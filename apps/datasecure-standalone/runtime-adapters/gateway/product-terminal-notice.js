'use strict';

function unavailable() {
  throw new Error('STANDALONE_PRESENTER_UNAVAILABLE');
}

module.exports = Object.freeze({
  showBatchStateNoticeConfirmed: unavailable,
  showLocalIntakeNoticeConfirmed: unavailable,
  presentTerminalEnvelope: unavailable
});
