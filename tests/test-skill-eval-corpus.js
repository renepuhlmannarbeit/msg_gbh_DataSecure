'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Skill behavior evaluation corpus');
const root = path.join(__dirname, '..');
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'skill-behavior-cases.json'), 'utf8'));
const byId = new Map(corpus.cases.map((item) => [item.id, item]));
const validSkills = new Set(['anonymize', 'explain', 'none']);
const validRoutes = new Set(['dialog', 'folder', 'stop-prior-upload', 'blocked-pdf',
  'blocked-format', 'blocked-host', 'support-unavailable', 'explain', 'none',
  'wait-active-batch', 'handoff-start', 'handoff-next', 'handoff-cancel', 'resume', 'stop-cancelled']);
const normalTools = [
  'start_document_batch_from_picker', 'start_completed_local_results_handoff',
  'continue_local_results_handoff', 'cancel_local_results_handoff',
  'continue_most_recent_document_batch', 'discard_incomplete_document_batches',
  'configure_privacy_folder', 'open_export_folder'
];
const requireOutcomes = (id, field, expected) => {
  const item = byId.get(id);
  assert.ok(item, 'missing case ' + id);
  for (const outcome of expected) assert.ok(item[field].includes(outcome), id + ' missing ' + outcome);
};

test('corpus has thirty-three cases and exactly the eight normal tools', () => {
  assert.strictEqual(corpus.schema, 'datasecure-skill-evals/v1');
  assert.strictEqual(corpus.cases.length, 33);
  assert.deepStrictEqual(corpus.normal_tool_names, normalTools);
  assert.match(corpus.contract, /local_only.*ohne Polling oder Lesen/u);
  const doc = fs.readFileSync(path.join(root, 'docs', 'SKILL_EVALUATION.md'), 'utf8');
  assert.match(doc, new RegExp(corpus.cases.length + ' synthetische Nutzeranfragen'));
});

test('identifiers and expectations are complete and never require a support tool', () => {
  assert.strictEqual(byId.size, corpus.cases.length);
  for (const item of corpus.cases) {
    assert.match(item.id, /^[a-z0-9-]+$/u);
    assert.ok(item.prompt.length >= 12);
    assert.ok(validSkills.has(item.expected_skill), item.id);
    assert.ok(validRoutes.has(item.expected_route), item.id);
    assert.strictEqual(item.session_mode, 'normal');
    assert.ok(Array.isArray(item.required_outcomes) && item.required_outcomes.length > 0);
    assert.ok(Array.isArray(item.forbidden_outcomes) && item.forbidden_outcomes.length > 0);
    assert.ok(Array.isArray(item.expected_tools));
    assert.ok(item.expected_tools.every((tool) => normalTools.includes(tool)), item.id);
    assert.ok(!item.required_outcomes.some((outcome) =>
      /privacy_status|diagnostic|package_ids|purge_scope|continue_original_task/u.test(outcome)
      && outcome !== 'explain_support_only_diagnostics'), item.id + ' has a legacy requirement');
  }
});

test('positive, explanation and non-trigger coverage remains separate', () => {
  const count = (skill) => corpus.cases.filter((item) => item.expected_skill === skill).length;
  assert.ok(count('anonymize') >= 12);
  assert.ok(count('explain') >= 2);
  assert.ok(count('none') >= 3);
  assert.deepStrictEqual(byId.get('privacy-boundary-explanation').expected_tools, []);
});

test('each local start finishes without polling or reading and uses the right picker kind', () => {
  const starts = corpus.cases.filter((item) => item.workflow_stage === 'start');
  assert.ok(starts.length >= 8);
  for (const item of starts) {
    assert.deepStrictEqual(item.expected_tools, ['start_document_batch_from_picker']);
    assert.strictEqual(item.expected_mode, 'local_only');
    requireOutcomes(item.id, 'required_outcomes', ['single_local_picker_confirmation', 'start_local_only_once', 'end_task_after_start']);
    requireOutcomes(item.id, 'forbidden_outcomes', ['poll_after_start', 'read_results_after_start', 'call_support_tools']);
    if (item.expected_route === 'folder') requireOutcomes(item.id, 'required_outcomes', ['source_kind_folder']);
  }
  assert.strictEqual(byId.get('markdown-without-image-pixels').expected_route, 'dialog');
  assert.strictEqual(byId.get('no-image-removal-consent').expected_route, 'dialog');
});

test('a mixed recursive folder stops as a whole instead of becoming a silent supported subset', () => {
  const item = byId.get('mixed-format-folder');
  assert.strictEqual(item.workflow_stage, 'preflight-stop');
  assert.strictEqual(item.expected_route, 'folder');
  assert.deepStrictEqual(item.expected_tools, ['start_document_batch_from_picker']);
  requireOutcomes(item.id, 'required_outcomes', [
    'source_kind_folder', 'complete_folder_preflight',
    'stop_whole_folder_on_blocked_format', 'report_content_free_counts'
  ]);
  requireOutcomes(item.id, 'forbidden_outcomes', ['silently_process_supported_subset', 'claim_batch_started']);
});

test('combined initial requests explain two steps but never authorize automatic handoff', () => {
  for (const id of ['single-contract-docx', 'multiple-mixed-docx', 'no-image-removal-consent', 'tender-and-contract-comparison']) {
    requireOutcomes(id, 'required_outcomes', ['explain_two_steps_before_start', 'require_later_explicit_handoff_request']);
    requireOutcomes(id, 'forbidden_outcomes', ['automatically_continue_original_analysis']);
    assert.strictEqual(byId.get(id).workflow_stage, 'start');
  }
});

test('later result requests and paging use only the token-free handoff', () => {
  for (const id of ['partial-batch-result', 'partial-batch-continues-original-analysis', 'zero-release-result']) {
    assert.strictEqual(byId.get(id).workflow_stage, 'followup');
    assert.deepStrictEqual(byId.get(id).expected_tools, ['start_completed_local_results_handoff']);
  }
  requireOutcomes('partial-batch-result', 'required_outcomes', ['report_exact_counts', 'report_omissions', 'use_token_free_handoff']);
  requireOutcomes('partial-batch-continues-original-analysis', 'required_outcomes', ['compare_only_released_content', 'perform_later_requested_analysis']);
  assert.deepStrictEqual(byId.get('handoff-next-page').expected_tools, ['continue_local_results_handoff']);
  requireOutcomes('handoff-next-page', 'required_outcomes', ['no_repeated_batch_summary', 'preserve_result_grade']);
  requireOutcomes('handoff-next-page', 'forbidden_outcomes', ['request_cursor_or_token', 'start_new_handoff']);
  requireOutcomes('zero-release-result', 'required_outcomes', ['no_content_task_without_release']);
  requireOutcomes('zero-release-result', 'forbidden_outcomes', ['call_support_tools', 'fabricate_summary']);
});

test('cancelling a handoff does not delete local results', () => {
  assert.deepStrictEqual(byId.get('cancel-results-handoff').expected_tools, ['cancel_local_results_handoff']);
  requireOutcomes('cancel-results-handoff', 'required_outcomes', ['preserve_originals_and_local_results']);
  requireOutcomes('cancel-results-handoff', 'forbidden_outcomes', ['delete_local_results']);
});

test('support-only diagnosis and cleanup remain unreachable in normal mode', () => {
  for (const id of ['support-diagnostics-normal-mode', 'all-local-data-delete-confirmed', 'delete-without-confirmation']) {
    assert.strictEqual(byId.get(id).expected_route, 'support-unavailable');
    assert.deepStrictEqual(byId.get(id).expected_tools, []);
    requireOutcomes(id, 'required_outcomes', ['refer_to_it']);
    requireOutcomes(id, 'forbidden_outcomes', ['enable_support_mode_automatically']);
  }
  requireOutcomes('support-diagnostics-normal-mode', 'required_outcomes', ['do_not_infer_missing_connector']);
  requireOutcomes('all-local-data-delete-confirmed', 'forbidden_outcomes', ['delete_with_general_filesystem']);
});

test('blocked hosts require the supported local session and picker, never a diagnostic preflight', () => {
  const ids = ['web-visible-skill-without-local-mcp', 'mobile-visible-plugin-without-local-mcp',
    'scheduled-cloud-original-processing', 'desktop-skill-present-connector-disconnected'];
  for (const id of ids) {
    assert.strictEqual(byId.get(id).expected_route, 'blocked-host');
    assert.deepStrictEqual(byId.get(id).expected_tools, []);
    requireOutcomes(id, 'required_outcomes', ['no_direct_upload', 'require_supported_local_session_and_picker', 'stop_without_file_access']);
    requireOutcomes(id, 'forbidden_outcomes', ['call_support_tools', 'use_general_filesystem']);
    assert.ok(!byId.get(id).required_outcomes.includes('require_successful_privacy_status'));
  }
});

test('unsupported images and PDFs stop without unnecessary purpose questions or upload workarounds', () => {
  assert.strictEqual(byId.get('standalone-scan-unknown-purpose').expected_route, 'blocked-format');
  requireOutcomes('standalone-scan-unknown-purpose', 'forbidden_outcomes', ['ask_unnecessary_purpose_question', 'claim_image_supported']);
  assert.strictEqual(byId.get('pdf-blocked').expected_route, 'blocked-pdf');
  requireOutcomes('pdf-blocked', 'forbidden_outcomes', ['direct_chat_upload', 'claim_pdf_supported']);
});

test('cancelled, active and interrupted work never gets an automatic replacement', () => {
  requireOutcomes('local-selection-cancelled', 'required_outcomes', ['wait_for_explicit_restart']);
  requireOutcomes('local-selection-cancelled', 'forbidden_outcomes', ['reopen_local_picker_automatically', 'start_replacement_batch']);
  requireOutcomes('active-local-batch', 'required_outcomes', ['end_task_without_polling', 'wait_without_new_folder_or_dialog']);
  requireOutcomes('active-local-batch', 'forbidden_outcomes', ['begin_replacement_batch', 'poll_status']);
  requireOutcomes('host-processing-cancelled', 'required_outcomes', ['disclose_unknown_local_progress', 'wait_for_explicit_resume', 'do_not_claim_partial_package']);
  requireOutcomes('host-processing-cancelled', 'forbidden_outcomes', ['automatic_retry', 'claim_worker_stopped_without_evidence']);
});

test('paused work permits a new selection while explicit resume starts asynchronously and ends', () => {
  requireOutcomes('existing-input-before-run', 'required_outcomes', ['allow_new_picker_with_paused_batch', 'do_not_inspect_legacy_input']);
  requireOutcomes('existing-input-before-run', 'forbidden_outcomes', ['force_old_batch_resolution']);
  assert.deepStrictEqual(byId.get('resume-latest-batch-new-chat').expected_tools, ['continue_most_recent_document_batch']);
  requireOutcomes('resume-latest-batch-new-chat', 'required_outcomes', ['ask_explicit_resume_confirmation', 'end_task_after_resume']);
  requireOutcomes('resume-latest-batch-new-chat', 'forbidden_outcomes', ['automatic_resume_without_confirmation', 'poll_after_resume', 'read_results_after_resume']);
});

test('image defaults, prior-upload stop and large local batches retain their protections', () => {
  requireOutcomes('no-image-removal-consent', 'required_outcomes', ['default_images_to_local_withhold']);
  requireOutcomes('no-image-removal-consent', 'forbidden_outcomes', ['ask_unnecessary_image_question']);
  requireOutcomes('markdown-without-image-pixels', 'forbidden_outcomes', ['invent_remove_images_argument']);
  requireOutcomes('already-uploaded-original', 'forbidden_outcomes', ['process_uploaded_attachment', 'open_picker_in_exposed_chat']);
  requireOutcomes('resumable-twenty-five-files', 'required_outcomes', ['one_persistent_local_executor', 'model_read_progress_separate']);
  requireOutcomes('resumable-twenty-five-files', 'forbidden_outcomes', ['model_call_per_document', 'single_long_batch_tool_call']);
  for (const item of corpus.cases.filter((item) => item.expected_skill === 'anonymize')) {
    requireOutcomes(item.id, 'required_outcomes', ['no_direct_upload']);
  }
});

test('operational references are linked and explicitly preserve the two-step lifecycle', () => {
  const skillDir = path.join(root, 'plugins', 'data-secure', 'skills', 'gbh-datasecure-dokument-anonymisieren');
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  for (const file of fs.readdirSync(path.join(skillDir, 'references')).filter((name) => name.endsWith('.md'))) {
    assert.ok(skill.includes('(references/' + file + ')'), 'unlinked reference ' + file);
  }
  const examples = fs.readFileSync(path.join(skillDir, 'references', 'beispiele.md'), 'utf8');
  assert.match(skill, /vor dem Startaufruf/u);
  assert.match(skill, /kombinierte Erstauftrag löst keine automatische Ergebnisübergabe aus/u);
  assert.match(examples, /neuer ausdrücklicher Auftrag/u);
  assert.match(examples, /start_completed_local_results_handoff/u);
  assert.doesNotMatch(examples, /verwende nur die Paket-IDs|Lies danach alle freigegebenen/u);
  const formats = fs.readFileSync(path.join(skillDir, 'references', 'unterstuetzte-formate.md'), 'utf8');
  assert.doesNotMatch(formats, /Claude erhält nur Token/u);
});

done();
