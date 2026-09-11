'use strict';

const assert = require('assert');
const {
  INTERACTIONS, assertInteractionBinding, namesForSurface, annotationsForTool
} = require('../plugins/data-secure/server/cowork-interaction-contract');
const {
  withCoworkStatus, hasContinuation, hasVerifiedContent, assertNormalResponseBoundary
} = require('../plugins/data-secure/server/cowork-status-envelope');

const declared = Object.keys(INTERACTIONS).map((name) => ({name}));

// Mutated registries and tool tables must never be accepted as a partial match.
assert.throws(() => assertInteractionBinding(declared.slice(1)), /differ/u);
assert.throws(() => assertInteractionBinding([...declared, declared[0]]), /differ/u);
assert.throws(() => assertInteractionBinding([...declared.slice(1), {name: 'invented_tool'}]), /differ/u);
assert.throws(() => namesForSurface('hidden'), /Unknown Cowork surface/u);
assert.throws(() => annotationsForTool({name: 'invented_tool'}), /Missing Cowork interaction/u);

// Every private continuation/capability field is rejected at every nesting depth.
for (const key of ['batch_token', 'package_id', 'read_capability', 'cursor', 'next_cursor',
  'document_continuations']) {
  assert.throws(() => assertNormalResponseBoundary({outer: [{[key]: 'private'}]}),
    new RegExp(`Private Cowork field.*${key}`, 'u'));
  assert.throws(() => withCoworkStatus('open_result_folder', {ok: true, nested: {[key]: 'private'}}),
    /Private Cowork field/u);
}

// Positive raw-content markers are a hard contradiction, not metadata that may be projected away.
for (const key of ['raw_content_sent_to_claude', 'original_content_sent_to_claude']) {
  assert.throws(() => withCoworkStatus('open_result_folder', {ok: true, [key]: true}),
    /Original content crossed/u);
}

// A content marker alone is insufficient: actual, explicitly verified Markdown is required.
assert.strictEqual(hasVerifiedContent({ok: true, text: '# original'}), false);
assert.strictEqual(hasVerifiedContent({ok: true, content_is_verified_anonymized_markdown: true}), false);
assert.strictEqual(hasVerifiedContent({
  ok: true, content_is_verified_anonymized_markdown: true,
  documents: [{text: '# result', content_is_verified_anonymized_markdown: false}]
}), false);
assert.strictEqual(hasVerifiedContent({
  ok: true, content_is_verified_anonymized_markdown: true,
  documents: [{text: '# result', content_is_verified_anonymized_markdown: true}]
}), true);
assert.strictEqual(withCoworkStatus('continue_local_results_handoff', {
  ok: true, text: '# unverified'
}).cowork_status.content_boundary, 'metadata_only');

// Mutating any supported continuation shape to an open value keeps the interaction non-terminal.
for (const result of [
  {more: true}, {has_more: true}, {next_cursor: 'next'}, {still_open: 1},
  {document_continuations: [{}]}, {documents: [{has_more: true}]}
]) assert.strictEqual(hasContinuation(result), true);
for (const result of [
  {more: false}, {has_more: false}, {next_cursor: ''}, {still_open: 0},
  {document_continuations: []}, {documents: [{has_more: false}]}
]) assert.strictEqual(hasContinuation(result), false);

// Unknown success actions fail closed; errors remain terminal and cannot invent a retry route.
assert.throws(() => withCoworkStatus('open_result_folder', {
  ok: true, next_action: 'invented_action'
}), /Unknown Cowork next action/u);
assert.strictEqual(withCoworkStatus('continue_most_recent_document_batch', {
  ok: false, error: 'deterministic_failure', next_action: 'invented_action'
}).cowork_status.retry_class, 'not_retryable');

for (const [nextAction, retryClass] of [
  ['choose_other_selection', 'user_action_required'],
  ['restart_only_on_explicit_request', 'explicit_request'],
  ['wait_for_local_batch', 'wait_or_inspect'],
  ['no_action', 'not_retryable']
]) {
  const status = withCoworkStatus('continue_most_recent_document_batch', {
    ok: false, error: 'typed_failure', next_action: nextAction
  }).cowork_status;
  assert.strictEqual(status.outcome, 'stopped');
  assert.strictEqual(status.retry_class, retryClass);
}

// Numeric item counts may be reported safely but must never become a Boolean retry grant.
const counted = withCoworkStatus('document_batch_status', {
  ok: false, error: 'typed_failure', retryable: 2, batch_total: 200, released: 201
}, {supportMode: true}).cowork_status;
assert.deepStrictEqual(counted.safe_counts, {batch_total: 200, retryable_items: 2});
assert.strictEqual(counted.retry_class, 'not_retryable');

assert.throws(() => withCoworkStatus('open_result_folder', null), /Invalid Cowork result/u);
assert.throws(() => withCoworkStatus('invented_tool', {ok: true}), /Unknown Cowork operation/u);
assert.throws(() => withCoworkStatus('open_result_folder', {
  ok: true, user_status: 'x'.repeat(2001)
}), /Invalid Cowork user status/u);

console.log('COWORK BOUNDARY MUTATION PASS (registry, content, continuation, retry, counts)');
