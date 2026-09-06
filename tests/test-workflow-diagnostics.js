'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  WORKFLOW_DIAGNOSTIC_SCHEMA,
  WORKFLOW_RETENTION_DAYS,
  MAX_WORKFLOW_EVENTS,
  sanitizeWorkflowEvent,
  recordWorkflowEvent,
  workflowDiagnosticStatus,
  _test
} = require('../plugins/data-secure/server/gateway/workflow-diagnostics');

const { test, done, assert } = createSuite('Content-free workflow diagnostics');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-workflow-diagnostics-'));
const NOW = Date.UTC(2026, 7, 24, 12, 0, 0);

test('every shared cause survives both the workflow journal and its actual support mirror', () => {
  const { CAUSE_CODES, WORKFLOW_ERROR_CODES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
  const { supportTraceStatus } = require('../plugins/data-secure/server/gateway/support-trace');
  const dataRoot = path.join(base, 'shared-catalog');
  const env = { EU_PRIVACY_SUPPORT_MODE: '1' };
  for (const [index, error_code] of WORKFLOW_ERROR_CODES.entries()) {
    assert.strictEqual(sanitizeWorkflowEvent({ error_code }).error_code, error_code);
    assert.strictEqual(recordWorkflowEvent({ event: 'mcp_start_response', outcome: 'stopped',
      error_code, timestamp: new Date(NOW + index).toISOString(), message: 'PRIVATE_SENTINEL' },
    { dataRoot, env, now: NOW + 1000 }), true);
  }
  const workflow = workflowDiagnosticStatus(100, { dataRoot, env, now: NOW + 1000 });
  const support = supportTraceStatus(200, { dataRoot, env, now: NOW + 1000 });
  assert.strictEqual(workflow.returned_events, 50, 'the public status remains bounded');
  assert.strictEqual(workflow.retained_events, WORKFLOW_ERROR_CODES.length);
  assert.deepStrictEqual(_test.readWorkflowEvents({ dataRoot, env, now: NOW + 1000 })
    .map(event => event.error_code).sort(), [...WORKFLOW_ERROR_CODES].sort());
  assert.deepStrictEqual(support.events.map(event => event.error_code).sort(), [...WORKFLOW_ERROR_CODES].sort());
  assert.ok(CAUSE_CODES.every(code => support.events.some(event => event.error_code === code)));
  assert.doesNotMatch(JSON.stringify({ workflow, support }), /PRIVATE_SENTINEL/u);
  assert.strictEqual(sanitizeWorkflowEvent({ error_code: 'PRIVATE_CODE' }).error_code, 'INTERNAL_FAILURE');
});

test('workflow events retain only fixed lifecycle metadata', () => {
  const event = sanitizeWorkflowEvent({
    timestamp: new Date(NOW).toISOString(), event: 'picker_selection_accepted', outcome: 'ok',
    item_count: 4, filename: 'Mitarbeiterprofil.docx', path: 'C:\\Personal\\Profil.docx',
    raw_content: 'Max Mustermann', token: 'secret', hash: 'a'.repeat(64), message: 'private'
  }, { now: NOW });
  const encoded = JSON.stringify(event);
  assert.strictEqual(event.schema, WORKFLOW_DIAGNOSTIC_SCHEMA);
  assert.strictEqual(event.event, 'picker_selection_accepted');
  assert.strictEqual(event.item_count, 4);
  assert.doesNotMatch(encoded, /Mitarbeiterprofil|Personal|Mustermann|secret|raw_content|filename|path|hash|message/i);
});

test('recorded lifecycle identifies a notice boundary without document data', () => {
  const dataRoot = path.join(base, 'lifecycle');
  for (const [index, event] of [
    { event: 'picker_requested', outcome: 'progress' },
    { event: 'picker_selection_accepted', outcome: 'ok', item_count: 4 },
    { event: 'intake_worker_spawned', outcome: 'ok', item_count: 4 },
    { event: 'completion_notice_started', outcome: 'progress', item_count: 4 }
  ].entries()) assert.strictEqual(recordWorkflowEvent({ ...event, timestamp: new Date(NOW + index).toISOString() },
    { dataRoot, now: NOW + 100 }), true);
  const status = workflowDiagnosticStatus(20, { dataRoot, now: NOW });
  assert.strictEqual(status.events.length, 4);
  assert.strictEqual(status.events[0].event, 'completion_notice_started');
  assert.strictEqual(status.raw_content_logged, false);
  assert.strictEqual(status.paths_logged, false);
  assert.strictEqual(status.tokens_logged, false);
});

test('review diagnostics identify reconstruction, local UI and terminal boundaries without private data', () => {
  const dataRoot = path.join(base, 'review-lifecycle');
  for (const [index, event] of [
    { event: 'review_worker_spawned', outcome: 'ok' },
    { event: 'review_reconstruction_started', outcome: 'progress', item_count: 2 },
    { event: 'review_ui_started', outcome: 'progress', item_count: 2 },
    { event: 'review_ui_failed', outcome: 'stopped', item_count: 2, error_code: 'LOCAL_REVIEW_TIMEOUT' },
    { event: 'review_terminal_state', outcome: 'stopped', error_code: 'LOCAL_REVIEW_CANCELLED' }
  ].entries()) assert.strictEqual(recordWorkflowEvent({ ...event, timestamp: new Date(NOW + index).toISOString(),
    token: 'private', filename: 'Mitarbeiterprofil.docx', raw_content: 'Max Mustermann' },
    { dataRoot, now: NOW + 100 }), true);
  const status = workflowDiagnosticStatus(20, { dataRoot, now: NOW + 100 });
  assert.deepStrictEqual(status.events.map((event) => event.event), [
    'review_terminal_state', 'review_ui_failed', 'review_ui_started',
    'review_reconstruction_started', 'review_worker_spawned'
  ]);
  assert.strictEqual(status.events[1].error_code, 'LOCAL_REVIEW_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(status), /"private"|Mitarbeiterprofil|Mustermann|"filename":|"raw_content":|"token":/i);
});

test('automatic local review transitions remain content-free and distinguish safe deferral', () => {
  for (const input of [
    { event: 'automatic_review_started', outcome: 'progress', item_count: 3 },
    { event: 'automatic_review_finished', outcome: 'stopped', item_count: 3,
      error_code: 'LOCAL_REVIEW_DEFERRED' },
    { event: 'automatic_review_claim_failed', outcome: 'stopped', error_code: 'LOCAL_REVIEW_BUSY' },
    { event: 'automatic_review_release_failed', outcome: 'stopped', error_code: 'LOCAL_REVIEW_RELEASE_FAILED' }
  ]) {
    const event = sanitizeWorkflowEvent({ ...input, token: 'private', raw_content: 'Max Mustermann' }, { now: NOW });
    assert.strictEqual(event.event, input.event);
    assert.strictEqual(event.error_code, input.error_code || 'NONE');
    assert.doesNotMatch(JSON.stringify(event), /private|Mustermann|raw_content|token/u);
  }
});

test('a detached notice dispatch is distinct from a completed synchronous notice', () => {
  for (const name of ['completion_notice_dispatched', 'completion_notice_finished']) {
    const event = sanitizeWorkflowEvent({ event: name, outcome: 'ok' }, { now: NOW });
    assert.strictEqual(event.event, name);
  }
});

test('result-folder choice has its own lifecycle boundaries', () => {
  for (const name of ['result_folder_picker_requested', 'result_folder_picker_accepted', 'result_folder_picker_failed']) {
    const event = sanitizeWorkflowEvent({ event: name, outcome: name.endsWith('failed') ? 'stopped' : 'ok',
      error_code: name.endsWith('failed') ? 'RESULT_FOLDER_REQUIRED' : 'NONE' }, { now: NOW });
    assert.strictEqual(event.event, name);
  }
});

test('workflow journal applies retention and a hard event cap', () => {
  const dataRoot = path.join(base, 'retention');
  recordWorkflowEvent({ timestamp: new Date(NOW - (WORKFLOW_RETENTION_DAYS + 1) * 86400000).toISOString(),
    event: 'picker_requested' }, { dataRoot, now: NOW });
  for (let index = 0; index < MAX_WORKFLOW_EVENTS + 3; index++) {
    recordWorkflowEvent({ timestamp: new Date(NOW - (MAX_WORKFLOW_EVENTS + 3 - index) * 1000).toISOString(),
      event: 'mcp_start_response', outcome: 'ok' }, { dataRoot, now: NOW });
  }
  const events = _test.readWorkflowEvents({ dataRoot, now: NOW });
  assert.strictEqual(events.length, MAX_WORKFLOW_EVENTS);
  assert.ok(events.every((event) => Date.parse(event.timestamp) >= NOW - WORKFLOW_RETENTION_DAYS * 86400000));
  assert.strictEqual(_test.workflowEventFiles({ dataRoot }).length, MAX_WORKFLOW_EVENTS,
    'expired and over-cap workflow event files are removed from disk');
});

test('forged rows cannot introduce arbitrary lifecycle text', () => {
  const dataRoot = path.join(base, 'forged');
  const file = _test.workflowDiagnosticFile({ dataRoot });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: WORKFLOW_DIAGNOSTIC_SCHEMA,
    timestamp: new Date(NOW).toISOString(), event: 'Max Mustermann', raw_content: 'Secret' })}\n`, 'utf8');
  const status = workflowDiagnosticStatus(20, { dataRoot, now: NOW });
  assert.strictEqual(status.events.length, 1);
  assert.strictEqual(status.events[0].event, 'mcp_start_response');
  assert.doesNotMatch(JSON.stringify(status), /Mustermann|Secret|"raw_content":/i);
});

test('new workflow events use immutable files while legacy JSONL remains readable', () => {
  const dataRoot = path.join(base, 'immutable');
  const legacy = _test.workflowDiagnosticFile({ dataRoot });
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, `${JSON.stringify(sanitizeWorkflowEvent({
    timestamp: new Date(NOW - 1).toISOString(), event: 'picker_requested'
  }, { now: NOW }))}\n`, 'utf8');
  assert.strictEqual(recordWorkflowEvent({ timestamp: new Date(NOW).toISOString(),
    event: 'picker_selection_accepted' }, { dataRoot, now: NOW }), true);
  assert.strictEqual(_test.workflowEventFiles({ dataRoot }).length, 1);
  assert.deepStrictEqual(_test.readWorkflowEvents({ dataRoot, now: NOW }).map((event) => event.event),
    ['picker_requested', 'picker_selection_accepted']);
});

test('a linked diagnostics ancestor is refused before any event is written through it', () => {
  const dataRoot = path.join(base, 'linked-root');
  const outside = path.join(base, 'linked-outside');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  try { fs.symlinkSync(outside, path.join(dataRoot, 'diagnostics'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch { return; }
  assert.strictEqual(recordWorkflowEvent({ event: 'picker_requested' }, { dataRoot, now: NOW }), false);
  assert.deepStrictEqual(fs.readdirSync(outside), [], 'logging never creates a file through a linked parent');
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
done();
