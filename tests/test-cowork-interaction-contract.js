'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const {
  INTERACTIONS, assertInteractionBinding, namesForSurface, annotationsForTool
} = require('../plugins/data-secure/server/cowork-interaction-contract');
const {STATUS_SCHEMA, withCoworkStatus} = require('../plugins/data-secure/server/cowork-status-envelope');

const server = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'mcp-server.js'), 'utf8');
const skillMainPath = path.join(root, 'plugins', 'data-secure', 'skills',
  'gbh-datasecure-dokument-anonymisieren', 'SKILL.md');
const skillMain = fs.readFileSync(skillMainPath, 'utf8');
const engineeringManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const declared = [...server.slice(server.indexOf('const TOOLS=['), server.indexOf('];', server.indexOf('const TOOLS=[')))
  .matchAll(/\{name:'([a-z][a-z0-9_]*)',title:/gu)].map((match) => ({name: match[1]}));

assertInteractionBinding(declared);
assert.strictEqual(Object.keys(INTERACTIONS).length, 27);
assert.strictEqual(namesForSurface('normal').size, 10);
assert.strictEqual(namesForSurface('support').size, 17);
assert.deepStrictEqual(
  engineeringManifest.tools.map((tool) => tool.name).sort(),
  Object.keys(INTERACTIONS).sort(),
  'engineering manifest and Cowork interaction registry differ'
);
assert.ok(Buffer.byteLength(skillMain, 'utf8') <= 7000,
  'the always-loaded Cowork skill must remain a compact routing and safety contract');
for (const reference of ['normalstart.md', 'ergebnisuebergabe.md', 'fortsetzung-und-verwerfen.md', 'konfiguration.md']) {
  assert.match(skillMain, new RegExp(`references/${reference.replace('.', '\\.')}`, 'u'),
    `progressive skill reference missing: ${reference}`);
}
const routeReferences = {
  'normalstart.md': [],
  'ergebnisuebergabe.md': ['start_completed_local_results_handoff', 'continue_local_results_handoff',
    'cancel_local_results_handoff', 'open_result_folder', 'open_export_folder'],
  'fortsetzung-und-verwerfen.md': ['continue_most_recent_document_batch', 'discard_incomplete_document_batches'],
  'konfiguration.md': ['configure_result_folder', 'configure_privacy_folder']
};
for (const [reference, allowedTools] of Object.entries(routeReferences)) {
  const body = fs.readFileSync(path.join(path.dirname(skillMainPath), 'references', reference), 'utf8');
  const mentionedNormalTools = [...namesForSurface('normal')].filter((name) => body.includes('`' + name));
  assert.deepStrictEqual(mentionedNormalTools.sort(), allowedTools.sort(),
    `${reference} must remain an isolated progressive route`);
}

for (const tool of declared) {
  const interaction = INTERACTIONS[tool.name];
  const annotations = annotationsForTool(tool);
  assert.ok(interaction, `missing interaction ${tool.name}`);
  assert.strictEqual(annotations.openWorldHint, false);
  assert.strictEqual(annotations.destructiveHint, interaction.effect === 'destructive_checkpoint');
  assert.strictEqual(annotations.idempotentHint, interaction.idempotent);
  assert.strictEqual(annotations.readOnlyHint, interaction.effect === 'read');
  if (interaction.effect === 'destructive_checkpoint' && !tool.name.startsWith('acknowledge_')) {
    assert.ok(interaction.human_gates.includes('explicit_confirmation') ||
      interaction.human_gates.includes('second_explicit_confirmation') ||
      interaction.human_gates.includes('explicit_support_request'), `${tool.name} lacks a human gate`);
  }
  assert.match(interaction.phase, /^(status|configuration|selection|processing|handoff|review|export|support)$/u);
  assert.match(interaction.gate_assurance,
    /^(none|runtime_argument|native_dialog|skill_contract|support_process|mixed|skill_contract_plus_runtime_argument)$/u);
}

const accepted = withCoworkStatus('start_document_batch_from_picker', {
  ok: true,
  local_intake_pending: true,
  next_action: 'local_intake_handoff_confirmed',
  gateway_version: '3.2.0-test',
  raw_content_sent_to_claude: false
});
assert.strictEqual(accepted.cowork_status.schema, STATUS_SCHEMA);
assert.strictEqual(accepted.cowork_status.outcome, 'accepted');
assert.strictEqual(accepted.cowork_status.local_work_state, 'accepted');
assert.strictEqual(accepted.cowork_status.interaction_terminal, true);
assert.strictEqual(accepted.cowork_status.original_content_sent_to_claude, false);
assert.strictEqual(accepted.cowork_status.content_boundary, 'metadata_only');
assert.strictEqual(accepted.cowork_status.embedded_instructions_authorized, false);
assert.strictEqual(accepted.cowork_status.human_gate_assurance, 'mixed');

const handoff = withCoworkStatus('continue_local_results_handoff', {
  ok: true,
  documents: [{text: '# anonymisiert', has_more: false, content_is_verified_anonymized_markdown: true}],
  more: false,
  content_is_verified_anonymized_markdown: true
});
assert.strictEqual(handoff.cowork_status.content_boundary, 'verified_anonymized_markdown');
assert.strictEqual(handoff.cowork_status.content_trust, 'untrusted_document_data');
assert.strictEqual(handoff.cowork_status.interaction_terminal, true);
assert.strictEqual(withCoworkStatus('continue_local_results_handoff', {ok: true, more: true})
  .cowork_status.interaction_terminal, false);
assert.strictEqual(withCoworkStatus('continue_anonymized_batch_in_chat', {
  ok: true, next_cursor: 'next', documents: []
}).cowork_status.interaction_terminal, false);
assert.strictEqual(withCoworkStatus('continue_local_results_handoff', {
  ok: true, documents: [{text: 'x', has_more: true, content_is_verified_anonymized_markdown: true}],
  content_is_verified_anonymized_markdown: true
}).cowork_status.interaction_terminal, false);
const emptyHandoff = withCoworkStatus('continue_local_results_handoff', {
  ok: true, documents: [], more: false, content_is_verified_anonymized_markdown: true
});
assert.strictEqual(emptyHandoff.cowork_status.content_boundary, 'metadata_only');
assert.strictEqual(emptyHandoff.cowork_status.content_trust, 'none');

const review = withCoworkStatus('review_deferred_document_batch', {
  ok: true, local_review_started: true, batch_phase: 'processing_local_review',
  next_action: 'complete_review_in_local_window'
});
assert.strictEqual(review.cowork_status.outcome, 'accepted');
assert.strictEqual(review.cowork_status.local_work_state, 'active');
assert.strictEqual(review.cowork_status.interaction_terminal, true);

// Use the production Core progress vocabulary, not invented envelope fixtures.
const { publicProgress } = require('../plugins/data-secure/server/gateway/batch-progress').createBatchProgress({
  deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending',
  liveLocalExecutor: (state) => state.testLive === true, publishedPackageRecord: () => null
});
for (const [itemStatus, testLive, expected] of [
  ['processing', false, 'active'], ['pending', true, 'active'], ['deferred_review', false, 'awaiting_review'],
  ['deferred_review', true, 'active'], ['stopped', false, 'completed']
]) {
  const progress = publicProgress({token: 'a'.repeat(64), testLive, items: [{status: itemStatus}]}, {skipResultProjection: true});
  for (const payload of [progress, {batch: progress}]) {
    const actual = withCoworkStatus('document_batch_status', {ok: true, ...payload}, {supportMode: true}).cowork_status;
    assert.strictEqual(actual.local_work_state, expected, `${itemStatus}/${testLive}/${Boolean(payload.batch)}`);
  }
}
for (const [facts, expected] of [
  [{}, 'unknown'], [{local_processing_active: true}, 'active'], [{local_intake_pending: true}, 'accepted']
]) {
  const status = withCoworkStatus('continue_most_recent_document_batch', {
    ok: false, error: 'batch_active', local_processing_started: false, ...facts,
    next_action: 'wait_for_local_release_before_retry'
  }).cowork_status;
  assert.strictEqual(status.outcome, 'stopped');
  assert.strictEqual(status.local_work_state, expected);
}
for (const cause of ['LOCAL_IPC_ACK_TIMEOUT', 'LOCAL_WORKER_SPAWN_FAILED', 'LOCAL_IPC_ACK_INVALID', 'INTERNAL_FAILURE']) {
  const status = withCoworkStatus('continue_most_recent_document_batch', {
    ok: false, error: 'local_start_failed', local_processing_started: false,
    batch_phase: 'awaiting_local_review', diagnostic: {phase: 'continuation', cause},
    next_action: 'restart_only_on_explicit_request'
  }).cowork_status;
  assert.strictEqual(status.local_work_state, 'unknown', cause);
  assert.strictEqual(status.retry_class, 'explicit_request');
}

const cancelled = withCoworkStatus('start_document_batch_from_picker', {
  ok: false, error: 'local_selection_cancelled', next_action: 'no_action'
});
assert.strictEqual(cancelled.cowork_status.outcome, 'cancelled');
assert.strictEqual(cancelled.cowork_status.local_work_state, 'not_started');
assert.strictEqual(cancelled.cowork_status.retry_class, 'not_retryable');

const opened = withCoworkStatus('open_result_folder', {ok: true, handoff_confirmed: true});
assert.strictEqual(opened.cowork_status.interaction_terminal, true);
assert.strictEqual(opened.cowork_status.local_work_state, 'not_applicable');
assert.strictEqual(opened.cowork_status.next_action, 'no_action');

const stopped = withCoworkStatus('continue_most_recent_document_batch', {
  ok: false,
  error: 'source_container_corrupt',
  retryable: 12,
  diagnostic: {retryable: false}
});
assert.strictEqual(stopped.cowork_status.outcome, 'stopped');
assert.strictEqual(stopped.cowork_status.retry_class, 'not_retryable');
assert.strictEqual(stopped.cowork_status.local_work_state, 'failed');
assert.strictEqual(stopped.cowork_status.safe_counts.retryable_items, 12);

assert.throws(() => withCoworkStatus('open_result_folder', {ok: true, next_action: 'invented_action'}),
  /Unknown Cowork next action/u);
assert.throws(() => withCoworkStatus('continue_local_results_handoff', {
  ok: true, package_id: 'private-package'
}), /Private Cowork field crossed normal boundary/u);

const configured = withCoworkStatus('configure_result_folder', {
  ok: true, user_status: 'Der Ergebnisordner wurde lokal geändert.'
});
assert.strictEqual(configured.cowork_status.user_status, 'Der Ergebnisordner wurde lokal geändert.');
assert.deepStrictEqual(INTERACTIONS.configure_result_folder.variants, {set: ['os_selection'], reset: []});

console.log('COWORK INTERACTION CONTRACT PASS (27 bound interactions, public status envelope)');
