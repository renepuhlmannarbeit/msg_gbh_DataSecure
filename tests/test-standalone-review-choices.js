'use strict';

const { createSuite } = require('./helpers');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { MAX_CHOICES, validStandaloneReviewChoices, prepareStandaloneReviewChoices,
  mergeStandaloneReviewChoices, rememberStandaloneReviewChoices } = require('../plugins/data-secure/server/gateway/standalone-review-choices');

const { test, done, assert } = createSuite('Standalone run-bound review choices');

function state(overrides = {}) {
  return { token: 'a'.repeat(64), product_channel: 'standalone',
    ...createBatchPseudonymState({ productChannel: 'standalone', randomBytes: () => Buffer.alloc(32, 17) }),
    ...overrides };
}

function draft(value, options = {}) {
  const text = `Quelle: ${value}\nEnde`;
  return { original_text: text, anonymized_text: text, allowOrganizationReview: true,
    ambiguities: [{ ambiguity_id: options.id || 'person:v1:000001',
      type: options.type || 'person_prose_ambiguous', replacement_kind: 'PERSON',
      original_start: 8, original_end: 8 + value.length,
      anonymized_start: 8, anonymized_end: 8 + value.length }] };
}

function remember(run, drafts, decision = 'keep') {
  return rememberStandaloneReviewChoices(run, drafts, drafts.map((item, index) => ({
    document_index: index + 1,
    decisions: item.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision }))
  })));
}

test('an exact entity spelling is reused across documents, phases, case and normalized Office whitespace', () => {
  const run = state();
  remember(run, [draft('CAPGEMINI INVENT')], 'redact_organization');
  const later = draft('Capgemini\u00a0Invent', { type: 'person_residual_ambiguous', id: 'person-residual:v1:000009' });
  const plan = prepareStandaloneReviewChoices(run, [later]);
  assert.strictEqual(plan.openDrafts.length, 0);
  assert.deepStrictEqual(mergeStandaloneReviewChoices(plan, { action: 'reviewed', documents: [] }), {
    action: 'reviewed', documents: [{ document_index: 1,
      decisions: [{ ambiguity_id: 'person-residual:v1:000009', decision: 'redact_organization' }] }]
  });
  assert.strictEqual(prepareStandaloneReviewChoices(run, [draft('Capgemini')]).openDrafts.length, 1);
});

test('private choices contain no raw spellings and survive a journal-like JSON restart', () => {
  const run = state();
  remember(run, [draft('Erika Beispiel')], 'keep');
  const encoded = JSON.stringify(run.standalone_review_choices);
  assert.doesNotMatch(encoded, /erika|beispiel|original|start|end/iu);
  const restored = JSON.parse(JSON.stringify(run));
  assert.strictEqual(validStandaloneReviewChoices(restored), true);
  assert.strictEqual(prepareStandaloneReviewChoices(restored, [draft('Erika Beispiel')]).openDrafts.length, 0);
});

test('a different run, seed, policy or product cannot replay the saved table', () => {
  const run = state();
  remember(run, [draft('Erika Beispiel')]);
  assert.strictEqual(prepareStandaloneReviewChoices(state({ token: 'b'.repeat(64) }), [draft('Erika Beispiel')]).openDrafts.length, 1);
  for (const change of [{ token: 'b'.repeat(64) }, { pseudonym_seed: Buffer.alloc(32, 18).toString('base64url') },
    { pseudonym_ruleset_version: 'different/1' }, { core_policy_fingerprint: 'b'.repeat(64) }, { product_channel: 'plugin' }]) {
    const copied = { ...run, ...change };
    assert.strictEqual(validStandaloneReviewChoices(copied), false);
    assert.throws(() => prepareStandaloneReviewChoices(copied, [draft('Erika Beispiel')]),
      (error) => error.code === 'BATCH_REVIEW_DECISION_BINDING_INVALID');
  }
});

test('tampering, duplicates, ordering and unknown choices fail closed without mutation', () => {
  const run = state();
  remember(run, [draft('Erika Beispiel')]);
  for (const mutate of [
    (copy) => { copy.entries[0][1] = 'redact'; },
    (copy) => { copy.entries.push([...copy.entries[0]]); },
    (copy) => { copy.extra = 'private'; },
    (copy) => { copy.authentication = 'A'.repeat(43); },
    (copy) => { copy.entries[0][1] = 'allow_everything'; }
  ]) {
    const changed = JSON.parse(JSON.stringify(run));
    mutate(changed.standalone_review_choices);
    assert.strictEqual(validStandaloneReviewChoices(changed), false);
  }
  const before = JSON.stringify(run);
  assert.throws(() => remember(run, [draft('Erika Beispiel')], 'redact'));
  assert.strictEqual(JSON.stringify(run), before);
});

test('only entity-name decisions are saved; certificate issuer keep remains occurrence-bound', () => {
  const run = state();
  const issuer = draft('Microsoft', { type: 'credential_issuer_ambiguous', id: 'credential:v2:000001' });
  remember(run, [issuer], 'keep');
  assert.strictEqual(run.standalone_review_choices.entries.length, 0);
  assert.strictEqual(prepareStandaloneReviewChoices(run, [issuer]).openDrafts.length, 1);
});

test('only open IDs reach the reviewer and document indices are restored exactly', () => {
  const run = state();
  remember(run, [draft('Erika Beispiel')], 'keep');
  const known = draft('Erika Beispiel');
  const mixed = draft('Unbekannte Person', { id: 'person:v1:000002' });
  mixed.original_text += '\nErika Beispiel';
  mixed.anonymized_text = mixed.original_text;
  const at = mixed.original_text.lastIndexOf('Erika Beispiel');
  mixed.ambiguities.push({ ...known.ambiguities[0], original_start: at, original_end: at + 14,
    anonymized_start: at, anonymized_end: at + 14 });
  const empty = { original_text: 'Original', anonymized_text: '[PERSON_001]', ambiguities: [], allowOrganizationReview: true };
  const plan = prepareStandaloneReviewChoices(run, [known, mixed, empty]);
  assert.deepStrictEqual(plan.openIndices, [1]);
  assert.deepStrictEqual(plan.openDrafts[0].ambiguities.map((candidate) => candidate.ambiguity_id), ['person:v1:000002']);
  const outcome = mergeStandaloneReviewChoices(plan, { action: 'reviewed', documents: [{ document_index: 1,
    decisions: [{ ambiguity_id: 'person:v1:000002', decision: 'redact' }] }] });
  assert.deepStrictEqual(outcome.documents.map((document) => document.document_index), [1, 2, 3]);
  assert.deepStrictEqual(outcome.documents[1].decisions.map((choice) => choice.decision), ['redact', 'keep']);
  assert.deepStrictEqual(outcome.documents[2].decisions, []);
  assert.strictEqual(mixed.ambiguities.length, 2);
});

test('defer and pre-submit Undo create no durable choice', () => {
  const run = state();
  const plan = prepareStandaloneReviewChoices(run, [draft('Erika Beispiel')]);
  assert.deepStrictEqual(mergeStandaloneReviewChoices(plan, { action: 'deferred', documents: [] }),
    { action: 'deferred', documents: [] });
  assert.strictEqual(Object.hasOwn(run, 'standalone_review_choices'), false);
  assert.throws(() => mergeStandaloneReviewChoices(plan, { action: 'reviewed', documents: [{ document_index: 1, decisions: [] }] }));
  assert.strictEqual(Object.hasOwn(run, 'standalone_review_choices'), false);
});

test('a changed or invalid source span cannot receive a known choice', () => {
  const run = state();
  remember(run, [draft('Erika Beispiel')]);
  for (const change of [{ original_start: -1 }, { original_end: 10000 }, { anonymized_start: 0 }]) {
    const later = draft('Erika Beispiel');
    Object.assign(later.ambiguities[0], change);
    assert.throws(() => prepareStandaloneReviewChoices(run, [later]));
  }
  assert.strictEqual(prepareStandaloneReviewChoices(run, [draft('Erika Andere')]).openDrafts.length, 1);
  const unsupported = draft('Erika Beispiel');
  delete unsupported.allowOrganizationReview;
  remember(state(), [draft('Firma Beispiel')], 'redact_organization');
  const companyRun = state();
  remember(companyRun, [draft('Erika Beispiel')], 'redact_organization');
  assert.throws(() => prepareStandaloneReviewChoices(companyRun, [unsupported]));
});

test('the table is bounded and overflow cannot partially persist a new group', () => {
  const run = state();
  const drafts = Array.from({ length: MAX_CHOICES + 1 }, (_, index) => draft(`Test Unternehmen ${index}`));
  assert.throws(() => remember(run, drafts));
  assert.strictEqual(Object.hasOwn(run, 'standalone_review_choices'), false);
});

done();
