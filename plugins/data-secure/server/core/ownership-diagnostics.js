'use strict';

const { desktopErrorCode } = require('./desktop-error-contract');
const { types } = require('node:util');

// Fixed codes only; no native messages, paths, IDs, stacks or error causes.
function ownershipErrorCode(value) {
  const internal = typeof value === 'string' ? value : value && !types.isProxy(value) &&
    Object.getOwnPropertyDescriptor(value, 'code')?.value;
  const code = desktopErrorCode(internal);
  return code.startsWith('STANDALONE_OWNERSHIP_') ? code : null;
}
function observeOwnershipOutcome(outcome, diagnostic) {
  try {
    const code = ownershipErrorCode(outcome && !types.isProxy(outcome) &&
      Object.getOwnPropertyDescriptor(outcome, 'ownership_error_code')?.value);
    if (code) diagnostic?.('ownership_control_check_failed', { outcome: 'failed', phase: 'reconcile', error_code: code });
  } catch { /* diagnostics never change the completed or pending transaction */ }
  return outcome;
}
module.exports = Object.freeze({ ownershipErrorCode, observeOwnershipOutcome });
