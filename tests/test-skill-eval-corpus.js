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

test('corpus has the versioned schema and twenty cases', () => {
  assert.strictEqual(corpus.schema, 'datasecure-skill-evals/v1');
  assert.strictEqual(corpus.cases.length, 20);
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
    'already-anonymized-markdown'
  ]) assert.ok(ids.has(required), `missing critical scenario ${required}`);
});

test('a personnel image decision precedes selection and an uploaded original stops processing', () => {
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  const imageChoice = byId.get('no-image-removal-consent');
  assert.strictEqual(imageChoice.expected_route, 'clarify-image-removal');
  assert.strictEqual(imageChoice.remove_images, null);
  assert.ok(imageChoice.required_outcomes.includes('ask_image_handling_before_picker'));
  assert.ok(imageChoice.forbidden_outcomes.includes('open_picker_before_image_choice'));

  const uploaded = byId.get('already-uploaded-original');
  assert.strictEqual(uploaded.expected_route, 'stop-prior-upload');
  assert.ok(uploaded.forbidden_outcomes.includes('process_uploaded_attachment'));
  assert.ok(uploaded.forbidden_outcomes.includes('open_picker_in_exposed_chat'));
});

test('every processing case forbids direct upload and every released-content task continues safely', () => {
  const processing = corpus.cases.filter((item) => item.expected_skill === 'anonymize' && !['cleanup'].includes(item.expected_route));
  assert.ok(processing.every((item) => item.required_outcomes.includes('no_direct_upload')));
  const continuation = corpus.cases.filter((item) => item.required_outcomes.includes('continue_original_task'));
  assert.ok(continuation.length >= 4);
  assert.ok(continuation.every((item) => item.expected_skill === 'anonymize'));
});

done();
