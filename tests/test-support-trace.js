'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-support-trace-')));
const {
  SUPPORT_TRACE_SCHEMA, sanitizeSupportTrace, recordSupportTrace,
  supportTraceStatus, _test
} = require('../plugins/data-secure/server/gateway/support-trace');

const enabledEnv = { EU_PRIVACY_SUPPORT_MODE: '1', DATASECURE_RUN_ID: 'abcdef12' };
const TRACE_NOW = Date.UTC(2026, 8, 4);

const { SUPPORT_ERROR_CODES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
for (const error_code of SUPPORT_ERROR_CODES) {
  assert.strictEqual(sanitizeSupportTrace({ error_code }, { env: enabledEnv }).error_code, error_code,
    'support retains every fixed code from the shared catalog');
}

assert.strictEqual(recordSupportTrace({ event: 'rpc_received', method: 'initialize' },
  { dataRoot: root, env: {} }), false, 'normal product must not create support trace events');
assert.ok(!fs.existsSync(_test.traceDirectory({ dataRoot: root })), 'disabled trace must not create its directory');

const hostile = sanitizeSupportTrace({
  event: 'C:\\Secret\\Private Person.docx', method: 'token-secret', operation: 'mailto:private@example.org',
  trace_id: 'not-safe', run_id: 'also-not-safe', error_code: 'secret/path', duration_ms: -1
}, { env: enabledEnv, now: Date.UTC(2026, 8, 4) });
assert.strictEqual(hostile.schema, SUPPORT_TRACE_SCHEMA);
assert.strictEqual(hostile.product_channel, 'plugin');
assert.strictEqual(hostile.event, 'rpc_failed');
assert.strictEqual(hostile.method, 'unknown');
assert.strictEqual(hostile.operation, 'none');
assert.strictEqual(hostile.trace_id, 'none');
assert.strictEqual(hostile.run_id, 'none');
assert.strictEqual(hostile.error_code, 'INTERNAL_FAILURE');
assert.ok(!JSON.stringify(hostile).includes('Private Person'));
assert.ok(!JSON.stringify(hostile).includes('private@example.org'));
assert.strictEqual(sanitizeSupportTrace({ error_code: 'PRIVATE_CUSTOMER_NAME' },
  { env: enabledEnv }).error_code, 'INTERNAL_FAILURE',
  'syntactically plausible values must not escape the closed error-code catalog');
const standalone = sanitizeSupportTrace({
  trace_id: '1234abcd', event: 'standalone_batch_stopped', operation: 'standalone_batch',
  outcome: 'stopped', error_code: 'STANDALONE_ENGINE_NOT_READY'
}, { env: { ...enabledEnv, DATASECURE_PRODUCT_CHANNEL: 'standalone' }, now: TRACE_NOW });
assert.strictEqual(standalone.event, 'standalone_batch_stopped');
assert.strictEqual(standalone.product_channel, 'standalone');
assert.strictEqual(standalone.method, 'unknown');
assert.strictEqual(standalone.operation, 'standalone_batch');
assert.strictEqual(standalone.error_code, 'STANDALONE_ENGINE_NOT_READY');

assert.strictEqual(recordSupportTrace({
  timestamp: new Date(Date.UTC(2026, 7, 1)).toISOString(), trace_id: 'ffffffff',
  event: 'tool_completed', method: 'tools/call', operation: 'privacy_status', outcome: 'ok'
}, { dataRoot: root, env: enabledEnv, now: TRACE_NOW }), true);

for (let index = 0; index < 100; index++) {
  assert.strictEqual(recordSupportTrace({
    trace_id: index.toString(16).padStart(8, '0'), event: index % 2 ? 'tool_started' : 'tool_completed',
    method: 'tools/call', operation: 'start_document_batch_from_picker',
    outcome: index % 2 ? 'progress' : 'ok', duration_ms: index
  }, { dataRoot: root, env: enabledEnv, now: TRACE_NOW }), true);
}
const status = supportTraceStatus(20, { dataRoot: root, env: enabledEnv, now: TRACE_NOW });
const files = _test.eventFiles({ dataRoot: root });
assert.strictEqual(files.length, 100, 'immutable per-event files prevent lost updates and expired files are removed physically');
assert.strictEqual(new Set(files).size, files.length, 'event files must be unique');
assert.strictEqual(status.enabled, true);
assert.strictEqual(status.retained_events, 100);
assert.strictEqual(status.returned_events, 20);
assert.strictEqual(status.raw_json_rpc_logged, false);
assert.strictEqual(status.arguments_logged, false);
assert.strictEqual(status.tokens_logged, false);
assert.ok(status.events.every((event) => event.operation === 'start_document_batch_from_picker'));

const linkedRoot = path.join(root, 'linked-root');
const outside = path.join(root, 'linked-outside');
fs.mkdirSync(linkedRoot);
fs.mkdirSync(outside);
try {
  fs.symlinkSync(outside, path.join(linkedRoot, 'diagnostics'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.strictEqual(recordSupportTrace({ event: 'rpc_received', method: 'initialize' },
    { dataRoot: linkedRoot, env: enabledEnv }), false);
  assert.deepStrictEqual(fs.readdirSync(outside), [], 'support logging never writes through a linked parent');
} catch (error) {
  if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
}

fs.rmSync(root, { recursive: true, force: true });
console.log('SUPPORT TRACE PASS');
