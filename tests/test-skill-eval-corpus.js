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
  'wait-active-batch', 'handoff-start', 'handoff-next', 'handoff-cancel', 'resume', 'stop-cancelled',
  'stop-result-folder', 'result-folder-change', 'result-folder-reset', 'result-folder-notice']);
const normalTools = [
  'start_document_batch_from_picker', 'start_completed_local_results_handoff',
  'continue_local_results_handoff', 'cancel_local_results_handoff',
  'continue_most_recent_document_batch', 'discard_incomplete_document_batches',
  'configure_privacy_folder', 'configure_result_folder', 'open_result_folder', 'open_export_folder'
];
const resultFolderCaseIds = [
  'result-folder-first-use', 'result-folder-required', 'result-folder-reuse',
  'result-folder-change', 'result-folder-reset', 'result-folder-sync-notice'
];
const requireOutcomes = (id, field, expected) => {
  const item = byId.get(id);
  assert.ok(item, 'missing case ' + id);
  for (const outcome of expected) assert.ok(item[field].includes(outcome), id + ' missing ' + outcome);
};

test('corpus has thirty-nine cases and exactly the ten normal tools', () => {
  assert.strictEqual(corpus.schema, 'datasecure-skill-evals/v1');
  assert.strictEqual(corpus.cases.length, 39);
  assert.deepStrictEqual(corpus.normal_tool_names, normalTools);
  assert.match(corpus.contract, /local_only.*ohne Polling oder Lesen/u);
});

test('evaluation tool inventory matches the actual normal MCP surface', () => {
  // Read the declaration without importing the executable MCP server or
  // starting its recovery, private-store or stdio lifecycle.
  const server = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'mcp-server.js'), 'utf8');
  const declaration = server.match(/const NORMAL_TOOL_NAMES\s*=\s*Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\);/u);
  assert.ok(declaration, 'missing declared normal MCP tool surface');
  const actual = [...declaration[1].matchAll(/'([a-z][a-z0-9_]*)'/gu)].map((match) => match[1]);
  assert.deepStrictEqual(corpus.normal_tool_names, actual);
});

test('documented evaluation count matches the complete corpus', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'SKILL_EVALUATION.md'), 'utf8');
  const documentedCount = doc.match(/\b(\d+) synthetische Nutzeranfragen/u);
  assert.ok(documentedCount, 'missing documented synthetic evaluation count');
  assert.strictEqual(Number(documentedCount[1]), corpus.cases.length, 'documented evaluation count is stale');
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
      // A supplied, content-free error envelope is part of the normal response,
      // not permission to call diagnostic_status or another support tool.
      && !['explain_support_only_diagnostics', 'report_diagnostic_hint_and_version'].includes(outcome)),
    item.id + ' has a legacy requirement');
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

test('DS-069 cases are synthetic and bind only the intended public tool arguments', () => {
  for (const id of resultFolderCaseIds) {
    const item = byId.get(id);
    assert.ok(item, 'missing case ' + id);
    assert.match(item.prompt, /synthetisch/iu, id);
    assert.match(item.setup, /synthetisch|result_folder_required/iu, id);
    assert.strictEqual(item.expected_skill, 'anonymize');
    requireOutcomes(id, 'required_outcomes', ['no_direct_upload']);
    requireOutcomes(id, 'forbidden_outcomes', ['request_path', 'call_support_tools']);
    assert.ok(Array.isArray(item.expected_tool_arguments), id);
    assert.strictEqual(item.expected_tool_arguments.length, item.expected_tools.length, id);
    item.expected_tools.forEach((tool, index) => {
      const args = item.expected_tool_arguments[index];
      if (tool === 'start_document_batch_from_picker') {
        assert.deepStrictEqual(args, { profile: 'auto', mode: 'local_only', source_kind: 'files' }, id);
      } else {
        assert.strictEqual(tool, 'configure_result_folder', id);
        assert.deepStrictEqual(args, id === 'result-folder-reset' ? { reset: true } : {}, id);
      }
    });
  }
});

test('first use and reuse both start once without separate folder-tool or confirmation requests', () => {
  for (const id of ['result-folder-first-use', 'result-folder-reuse']) {
    const item = byId.get(id);
    assert.strictEqual(item.workflow_stage, 'start');
    assert.deepStrictEqual(item.expected_tools, ['start_document_batch_from_picker']);
    requireOutcomes(id, 'required_outcomes', ['single_local_picker_confirmation', 'start_local_only_once', 'end_task_after_start']);
    requireOutcomes(id, 'forbidden_outcomes', [
      'call_folder_tool_before_start', 'ask_extra_folder_confirmation',
      'ask_extra_start_confirmation', 'poll_after_start', 'read_results_after_start'
    ]);
  }
  requireOutcomes('result-folder-first-use', 'required_outcomes', [
    'first_result_folder_picker_before_source_picker', 'remember_result_folder_locally'
  ]);
  requireOutcomes('result-folder-first-use', 'forbidden_outcomes', ['claim_connected_cowork_folder_detected']);
  requireOutcomes('result-folder-reuse', 'required_outcomes', ['reuse_saved_result_folder', 'source_picker_only']);
  requireOutcomes('result-folder-reuse', 'forbidden_outcomes', ['reselect_saved_result_folder', 'change_result_folder_for_new_chat']);
});

test('result_folder_required explains the supplied failure and never repeats the completed tool call', () => {
  const item = byId.get('result-folder-required');
  assert.strictEqual(item.workflow_stage, 'tool-result');
  assert.strictEqual(item.expected_route, 'stop-result-folder');
  assert.match(item.setup, /ok=false, error=result_folder_required/u);
  assert.deepStrictEqual(item.expected_tools, []);
  requireOutcomes(item.id, 'required_outcomes', [
    'report_result_folder_required_without_path', 'report_diagnostic_hint_and_version',
    'explain_result_folder_picker_on_next_start', 'report_no_batch_started', 'wait_for_explicit_restart'
  ]);
  requireOutcomes(item.id, 'forbidden_outcomes', [
    'automatic_retry', 'reopen_local_picker_automatically', 'configure_result_folder_automatically',
    'claim_batch_started', 'invent_diagnostic_cause'
  ]);
});

test('explicit result-folder change and reset never mutate the private root or request another confirmation', () => {
  for (const id of ['result-folder-change', 'result-folder-reset']) {
    const item = byId.get(id);
    assert.strictEqual(item.workflow_stage, 'configuration');
    assert.strictEqual(item.expected_route, id);
    assert.deepStrictEqual(item.expected_tools, ['configure_result_folder']);
    requireOutcomes(id, 'required_outcomes', ['preserve_existing_results_and_private_data']);
    requireOutcomes(id, 'forbidden_outcomes', [
      'ask_extra_folder_confirmation', 'invent_confirmed_argument',
      'configure_privacy_folder_instead', 'start_document_processing'
    ]);
  }
  requireOutcomes('result-folder-change', 'required_outcomes', [
    'configure_result_folder_once', 'local_folder_picker_is_confirmation', 'keep_result_folder_path_private'
  ]);
  requireOutcomes('result-folder-change', 'forbidden_outcomes', ['read_results_after_configuration', 'move_or_delete_existing_results']);
  requireOutcomes('result-folder-reset', 'required_outcomes', [
    'reset_result_folder_selection_only', 'explain_result_folder_picker_on_next_start'
  ]);
  requireOutcomes('result-folder-reset', 'forbidden_outcomes', [
    'open_picker_immediately_after_reset', 'delete_local_results', 'use_general_filesystem'
  ]);
});

test('an accepted start with a sync notice is informational, one-shot and not a completed processing claim', () => {
  const item = byId.get('result-folder-sync-notice');
  assert.strictEqual(item.workflow_stage, 'tool-result');
  assert.strictEqual(item.expected_route, 'result-folder-notice');
  assert.strictEqual(item.expected_mode, 'local_only');
  assert.match(item.setup, /next_action=local_intake_accepted_checkpoint_pending/u);
  assert.match(item.setup, /sync_folder_notice=true/u);
  assert.deepStrictEqual(item.expected_tools, []);
  requireOutcomes(item.id, 'required_outcomes', [
    'report_accepted_handoff_with_returned_version', 'show_sync_folder_notice_once',
    'explain_released_results_may_sync', 'reject_legal_anonymity_claim',
    'treat_sync_notice_as_information', 'end_task_after_start'
  ]);
  requireOutcomes(item.id, 'forbidden_outcomes', [
    'ask_sync_confirmation', 'block_sync_result_folder', 'change_result_folder_automatically',
    'claim_durable_checkpoint', 'claim_anonymization_already_running', 'claim_batch_complete',
    'repeat_start_tool_call', 'poll_after_start', 'read_results_after_start'
  ]);
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
