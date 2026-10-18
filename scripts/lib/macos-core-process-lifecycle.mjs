// Closed build observations, not artifact approval or process-group proof.
import { types } from 'node:util';
const fail = () => { throw Error('MACOS_CORE_PROCESS_LIFECYCLE_INVALID'); };
const KEYS = Object.freeze(['schema', 'step', 'cause', 'spawned', 'exit_seen', 'exit_code', 'exit_signal',
  'close_seen', 'close_code', 'close_signal', 'kill_attempted', 'kill_result', 'kill_error',
  'child_end_confirmed', 'group_end_confirmed', 'timer_cleanup_failed', 'listener_cleanup_failed',
  'detach_failed', 'log_fsync_failed', 'log_close_failed']);
const TRUE = Object.freeze(['spawned', 'exit_seen', 'close_seen', 'child_end_confirmed']);
const FALSE = Object.freeze(['kill_attempted', 'timer_cleanup_failed', 'listener_cleanup_failed',
  'detach_failed', 'log_fsync_failed', 'log_close_failed']);
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(key => !keys.includes(key))) fail();
  const result = {};
  for (const key of keys) {
    const field = descriptors[key];
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
    result[key] = field.value;
  }
  return result;
}
function processRecord(value, step) {
  const record = fields(value, KEYS);
  if (record.schema !== 'datasecure-mac-producer-process/1' || record.step !== step || record.cause !== 'success' ||
      record.exit_code !== 0 || record.exit_signal !== null || record.close_code !== 0 || record.close_signal !== null ||
      record.kill_result !== 'not_requested' || record.kill_error !== null ||
      [...TRUE, ...FALSE, 'group_end_confirmed'].some(key => typeof record[key] !== 'boolean') ||
      TRUE.some(key => record[key] !== true) || FALSE.some(key => record[key] !== false)) fail();
  // False is an honest open native gate. Neither child close nor this schema
  // validates all descendants; do not coerce/default/upgrade this observation.
  return Object.freeze(record);
}
export function readMacCoreBuildProcessLifecycle(value) {
  const pair = fields(value, ['configure', 'make']);
  return Object.freeze({ configure: processRecord(pair.configure, 'configure'), make: processRecord(pair.make, 'make') });
}
