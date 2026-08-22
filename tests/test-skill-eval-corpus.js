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
const validRoutes = new Set(['dialog', 'folder', 'clarify-purpose', 'clarify-image-removal', 'stop-prior-upload', 'blocked-pdf', 'cleanup', 'explain', 'none']);

test('corpus has the versioned schema and twenty-four cases', () => {
  assert.strictEqual(corpus.schema, 'datasecure-skill-evals/v1');
  assert.strictEqual(corpus.cases.length, 24);
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
    'multiple-mixed-docx', 'mixed-format-folder', 'explicit-image-removal',
    'no-image-removal-consent', 'standalone-scan-unknown-purpose', 'pdf-blocked', 'already-uploaded-original',
    'skip-mandatory-review', 'partial-batch-result', 'zero-release-result',
    'all-local-data-delete-confirmed', 'privacy-boundary-explanation',
    'already-anonymized-markdown', 'existing-input-before-run',
    'declared-one-status-two', 'resumable-twenty-five-files',
    'first-file-stops-continue-rest'
  ]) assert.ok(ids.has(required), `missing critical scenario ${required}`);
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

test('ordinary processing uses the resumable local input route instead of a long picker call', () => {
  const ordinary = corpus.cases.filter((item) => ['single-contract-docx', 'multiple-mixed-docx'].includes(item.id));
  assert.ok(ordinary.every((item) => item.expected_route === 'folder'));
  assert.ok(ordinary.every((item) => item.required_outcomes.includes('wait_for_local_input_confirmation')));
});

test('large and partially failing runs are split into single-file tool calls', () => {
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  assert.ok(byId.get('resumable-twenty-five-files').required_outcomes.includes('one_tool_call_per_document'));
  assert.ok(byId.get('resumable-twenty-five-files').forbidden_outcomes.includes('single_long_batch_tool_call'));
  assert.ok(byId.get('first-file-stops-continue-rest').required_outcomes.includes('increment_skip_stopped'));
  assert.ok(byId.get('first-file-stops-continue-rest').forbidden_outcomes.includes('retry_stopped_file'));
});

test('every processing case forbids direct upload and every released-content task continues safely', () => {
  const processing = corpus.cases.filter((item) => item.expected_skill === 'anonymize' && !['cleanup'].includes(item.expected_route));
  assert.ok(processing.every((item) => item.required_outcomes.includes('no_direct_upload')));
  const continuation = corpus.cases.filter((item) => item.required_outcomes.includes('continue_original_task'));
  assert.ok(continuation.length >= 4);
  assert.ok(continuation.every((item) => item.expected_skill === 'anonymize'));
});

done();
