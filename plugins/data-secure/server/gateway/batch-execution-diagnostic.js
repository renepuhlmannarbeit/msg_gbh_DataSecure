'use strict';

// Observational only. No token, item, PID, path or message can enter this DTO.
const { types } = require('node:util');
const { ownershipErrorCode } = require('../core/ownership-diagnostics');
const PHASES = Object.freeze(['item_epoch_release', 'registry_finalize', 'local_delivery_verify',
  'executor_lease_release', 'processing',
  'result_export_prepare', 'result_export_claim', 'result_export_plan', 'result_export_copy', 'result_export_claim_release']);
const CODES = new Set(require('./diagnostic-causes').WORKFLOW_ERROR_CODES);
// Restriction only, never processing authority: a secondary release fault must
// not turn the preserved primary exception into permission for journal writes.
const controlUnconfirmed = new WeakSet();
function blockDocumentStabilization(error) {
  if (error && ['object', 'function'].includes(typeof error)) controlUnconfirmed.add(error);
}
function documentStabilizationBlocked(error) {
  return Boolean(error && ['object', 'function'].includes(typeof error) && controlUnconfirmed.has(error));
}
function ownErrorCode(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return '';
  const value = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof value === 'string' && value.length <= 100 ? value : '';
}
function diagnosticCode(error) {
  const raw = ownErrorCode(error), ownership = ownershipErrorCode(raw);
  return ownership || (CODES.has(raw) ? raw : 'INTERNAL_FAILURE');
}
function readBatchExecutionDiagnostic(message) {
  if (!message || typeof message !== 'object' || types.isProxy(message) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(message))) return null;
  const fields = Object.getOwnPropertyDescriptors(message), keys = Reflect.ownKeys(fields);
  if (keys.length !== 3 || keys.some(key => !['type', 'phase', 'error_code'].includes(key) ||
      !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) return null;
  const type = fields.type?.value, phase = fields.phase?.value, code = fields.error_code?.value;
  if (type !== 'local-batch-diagnostic' || !PHASES.includes(phase) || !CODES.has(code)) return null;
  return Object.freeze({ event: 'batch_worker_failed', outcome: 'stopped', phase, error_code: code });
}
function recordBatchExecutionFailure(phase, error, options = {}) {
  if (!PHASES.includes(phase)) return false;
  const record = { event: 'batch_worker_failed', outcome: 'stopped', phase, error_code: diagnosticCode(error) };
  try { (options.recordWorkflowEvent || require('./workflow-diagnostics').recordWorkflowEvent)(record); }
  catch { /* evidence never replaces a primary or release error */ }
  try {
    const send = Object.hasOwn(options, 'send') ? options.send :
      (typeof process.send === 'function' ? process.send.bind(process) : null);
    if (typeof send === 'function') send({ type: 'local-batch-diagnostic', phase, error_code: record.error_code }, () => {});
  } catch { /* IPC diagnostics grant no acknowledgement or processing authority */ }
  return true;
}
module.exports = Object.freeze({ PHASES, ownErrorCode, diagnosticCode,
  readBatchExecutionDiagnostic, recordBatchExecutionFailure, blockDocumentStabilization, documentStabilizationBlocked });
