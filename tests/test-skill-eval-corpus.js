'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Skill behavior evaluation corpus');
const corpus = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'evals', 'skill-behavior-cases.json'),
  'utf8'
));
const validSkills = new Set(['anonymize', 'explain', 'none']);
const validRoutes = new Set(['dialog', 'folder', 'clarify-purpose', 'clarify-image-removal', 'stop-prior-upload', 'blocked-pdf', 'blocked-host', 'cleanup', 'explain', 'none', 'wait-active-batch']);

test('corpus has the versioned schema and thirty-three cases', () => {
  assert.strictEqual(corpus.schema, 'datasecure-skill-evals/v1');
  assert.strictEqual(corpus.cases.length, 33);
});

test('case identifiers are unique and every expectation is structurally complete', () => {
  const ids = new Set();
  for (const item of corpus.cases) {
    assert.match(item.id, /^[a-z0-9-]+$/u);
    assert.ok(!ids.has(item.id), `duplicate case ${item.id}`);
    ids.add(item.id);
    assert.ok(item.prompt.length >= 12);
    assert.ok(validSkills.has(item.expected_skill), `bad skill in ${item.id}`);
    assert.ok(validRoutes.has(item.expected_route), `bad route in ${item.id}`);
    assert.ok(Array.isArray(item.required_outcomes) && item.required_outcomes.length > 0);
    assert.ok(Array.isArray(item.forbidden_outcomes) && item.forbidden_outcomes.length > 0);
  }
});

test('trigger, non-trigger and coexistence decisions all have representative coverage', () => {
  const count = (skill) => corpus.cases.filter((item) => item.expected_skill === skill).length;
  assert.ok(count('anonymize') >= 12);
  assert.ok(count('explain') >= 2);
  assert.ok(count('none') >= 3);
});

test('critical privacy and usability scenarios cannot disappear from the corpus', () => {
  const ids = new Set(corpus.cases.map((item) => item.id));
  for (const required of [
    'multiple-mixed-docx', 'mixed-format-folder', 'markdown-without-image-pixels',
    'no-image-removal-consent', 'standalone-scan-unknown-purpose', 'pdf-blocked', 'already-uploaded-original',
    'skip-mandatory-review', 'partial-batch-result', 'zero-release-result',
    'all-local-data-delete-confirmed', 'privacy-boundary-explanation',
    'already-anonymized-markdown', 'existing-input-before-run',
    'declared-one-status-two', 'resumable-twenty-five-files',
    'first-file-stops-continue-rest', 'resume-latest-batch-new-chat', 'local-selection-cancelled', 'host-processing-cancelled',
    'active-local-batch', 'partial-batch-continues-original-analysis',
    'web-visible-skill-without-local-mcp', 'mobile-visible-plugin-without-local-mcp',
    'scheduled-cloud-original-processing', 'desktop-skill-present-connector-disconnected'
  ]) assert.ok(ids.has(required), `missing critical scenario ${required}`);
});

test('negative host classes require the live local gate and forbid every workaround', () => {
  const ids = [
    'web-visible-skill-without-local-mcp',
    'mobile-visible-plugin-without-local-mcp',
    'scheduled-cloud-original-processing',
    'desktop-skill-present-connector-disconnected'
  ];
  const cases = ids.map((id) => corpus.cases.find((item) => item.id === id));
  assert.ok(cases.every(Boolean));
  assert.ok(cases.every((item) => item.expected_route === 'blocked-host'));
  assert.ok(cases.every((item) => item.required_outcomes.includes('no_direct_upload')));
  assert.ok(cases.every((item) => item.required_outcomes.includes('require_successful_privacy_status')));
  assert.ok(cases.every((item) => item.required_outcomes.includes('stop_without_file_access')));
  assert.ok(cases.every((item) => item.forbidden_outcomes.some((outcome) => [
    'infer_local_mcp_from_ui', 'schedule_original_processing'
  ].includes(outcome))));
});

test('a locally cancelled selection never becomes an automatic replacement run', () => {
  const cancelled = corpus.cases.find((item) => item.id === 'local-selection-cancelled');
  assert.ok(cancelled.required_outcomes.includes('wait_for_explicit_restart'));
  assert.ok(cancelled.forbidden_outcomes.includes('reopen_local_picker_automatically'));
  assert.ok(cancelled.forbidden_outcomes.includes('start_replacement_batch'));
});

test('an active local batch is never replaced or restarted', () => {
  const active = corpus.cases.find((item) => item.id === 'active-local-batch');
  assert.strictEqual(active.expected_route, 'wait-active-batch');
  assert.ok(active.required_outcomes.includes('wait_without_new_folder_or_dialog'));
  assert.ok(active.forbidden_outcomes.includes('open_input_folder'));
  assert.ok(active.forbidden_outcomes.includes('begin_replacement_batch'));
  assert.ok(active.forbidden_outcomes.includes('reopen_local_picker_automatically'));
});

test('a host-level cancellation never creates an automatic replacement or a partial release', () => {
  const cancelled = corpus.cases.find((item) => item.id === 'host-processing-cancelled');
  assert.ok(cancelled.required_outcomes.includes('report_safe_checkpoint'));
  assert.ok(cancelled.required_outcomes.includes('wait_for_explicit_resume'));
  assert.ok(cancelled.forbidden_outcomes.includes('automatic_retry'));
  assert.ok(cancelled.required_outcomes.includes('do_not_claim_partial_package'));
  assert.ok(cancelled.forbidden_outcomes.includes('reopen_local_picker_automatically'));
});

test('a new chat requires confirmation before it resumes the latest local batch', () => {
  const resumed = corpus.cases.find((item) => item.id === 'resume-latest-batch-new-chat');
  assert.ok(resumed.required_outcomes.includes('ask_explicit_resume_confirmation'));
  assert.ok(resumed.required_outcomes.includes('continue_latest_local_batch'));
  assert.ok(resumed.forbidden_outcomes.includes('automatic_resume_without_confirmation'));
});

test('personnel images default safely without an extra question and an uploaded original stops processing', () => {
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  const imageChoice = byId.get('no-image-removal-consent');
  assert.strictEqual(imageChoice.expected_route, 'folder');
  assert.strictEqual(imageChoice.remove_images, false);
  assert.ok(imageChoice.required_outcomes.includes('default_images_to_local_withhold'));
  assert.ok(imageChoice.forbidden_outcomes.includes('ask_unnecessary_image_question'));

  const uploaded = byId.get('already-uploaded-original');
  assert.strictEqual(uploaded.expected_route, 'stop-prior-upload');
  assert.ok(uploaded.forbidden_outcomes.includes('process_uploaded_attachment'));
  assert.ok(uploaded.forbidden_outcomes.includes('open_picker_in_exposed_chat'));
});

test('a Markdown-only request keeps image pixels local without enabling strict local image discard', () => {
  const markdownOnly = corpus.cases.find((item) => item.id === 'markdown-without-image-pixels');
  assert.strictEqual(markdownOnly.expected_route, 'folder');
  assert.strictEqual(markdownOnly.remove_images, false);
  assert.ok(markdownOnly.required_outcomes.includes('markdown_without_image_pixels'));
  assert.ok(markdownOnly.forbidden_outcomes.includes('unnecessarily_enable_strict_local_image_discard'));
});

test('ordinary processing uses the direct local picker with one user confirmation', () => {
  const ordinary = corpus.cases.filter((item) => ['single-contract-docx', 'multiple-mixed-docx'].includes(item.id));
  assert.ok(ordinary.every((item) => item.expected_route === 'dialog'));
  assert.ok(ordinary.every((item) => item.required_outcomes.includes('single_local_picker_confirmation')));
});

test('large and partially failing runs use local execution with separate model reading', () => {
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  assert.ok(byId.get('resumable-twenty-five-files').required_outcomes.includes('one_persistent_local_executor'));
  assert.ok(byId.get('resumable-twenty-five-files').required_outcomes.includes('model_read_progress_separate'));
  assert.ok(byId.get('resumable-twenty-five-files').forbidden_outcomes.includes('model_call_per_document'));
  assert.ok(byId.get('resumable-twenty-five-files').forbidden_outcomes.includes('single_long_batch_tool_call'));
  assert.ok(byId.get('first-file-stops-continue-rest').required_outcomes.includes('increment_skip_stopped'));
  assert.ok(byId.get('first-file-stops-continue-rest').forbidden_outcomes.includes('retry_stopped_file'));
});

test('every processing case forbids direct upload and every released-content task continues safely', () => {
  const processing = corpus.cases.filter((item) => item.expected_skill === 'anonymize' && !['cleanup'].includes(item.expected_route));
  assert.ok(processing.every((item) => item.required_outcomes.includes('no_direct_upload')));
  const continuation = corpus.cases.filter((item) => item.required_outcomes.includes('continue_original_task'));
  assert.ok(continuation.length >= 5);
  assert.ok(continuation.every((item) => item.expected_skill === 'anonymize'));
  const partial = corpus.cases.find((item) => item.id === 'partial-batch-continues-original-analysis');
  assert.ok(partial.required_outcomes.includes('report_exact_counts'));
  assert.ok(partial.required_outcomes.includes('compare_only_released_content'));
  assert.ok(partial.forbidden_outcomes.includes('request_original_for_comparison'));
});

done();
