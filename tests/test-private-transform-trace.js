'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Private actual transformation provenance');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { createTransformTrace, replayTransformTrace, entityPlanFromTrace } = require('../plugins/data-secure/server/privacy/transform-plan');

test('default detector result has no trace and opt-in does not change output or findings', () => {
  const raw = 'Name: Anna Beispiel\nE-Mail: anna@example.invalid\nTelefon: +49 30 555 1000';
  const normal = pii.anonymize(raw), captured = pii.anonymize(raw, 'general', { captureTransformPlan: true });
  assert.equal(Object.hasOwn(normal, 'transform_trace'), false);
  assert.equal(captured.transform_trace.complete, true);
  assert.equal(replayTransformTrace(captured.transform_trace), captured.text);
  const { transform_trace, ...rest } = captured; assert.deepEqual(rest, normal);
  const edits = transform_trace.steps.flatMap(step => step.edits);
  assert.ok(edits.some(edit => edit.kind === 'EMAIL'));
  assert.ok(edits.some(edit => edit.kind === 'PERSON'));
  assert.ok(edits.every(edit => edit.original !== edit.replacement));
});

test('personnel edits retain exact offsets including tables, customer and project heading', () => {
  const raw = '# Personalprofil\nName: Anna Beispiel\nArbeitgeber: Morgenstern GmbH\n| Standort | Berlin |\nKunde: Seeblick AG\n## Projekterfahrung\n### Hafenwerke AG – Projekt Orion\nWaldtal GmbH';
  const result = pii.anonymize(raw, 'personnel_profile', { captureTransformPlan: true });
  assert.equal(result.transform_trace.complete, true);
  assert.equal(replayTransformTrace(result.transform_trace), result.text);
  const edits = result.transform_trace.steps.filter(step => step.phase === 'personnel').flatMap(step => step.edits);
  assert.ok(edits.some(edit => edit.kind === 'EMPLOYER'));
  assert.ok(edits.some(edit => edit.kind === 'LOCATION'));
  assert.ok(edits.some(edit => edit.kind === 'PROJECT'));
});

test('compliance composes real engine passes; Unicode normalization is technical, not an entity', () => {
  const raw = '😀 Name: Anna Beispiel\nE-Mail: anna@example.invalid\nFachtext: Cafe\u0301 &amp; Daten';
  const result = anonymizeMarkdown(raw, 'general', { captureTransformPlan: true });
  assert.equal(result.transform_trace.complete, true);
  assert.equal(replayTransformTrace(result.transform_trace), result.text);
  assert.ok(result.transform_trace.steps.every(step => /^pass:[1-3]\//u.test(step.phase)));
  assert.ok(result.transform_trace.steps.some(step => step.phase.endsWith('/canonicalization') && step.edits[0].kind === 'NORMALIZATION'));
});

test('replay rejects altered original fragments, overlapping offsets and intermediate or final hashes', () => {
  const result = pii.anonymize('Name: Anna Beispiel\nE-Mail: anna@example.invalid', 'general', { captureTransformPlan: true });
  for (const mutate of [trace => { trace.steps[0].edits[0].original = 'untrue'; },
    trace => { trace.steps[0].output_hash = '0'.repeat(64); }, trace => { trace.output_hash = '0'.repeat(64); },
    trace => { trace.steps[0].edits.push({ ...trace.steps[0].edits[0] }); }]) {
    const trace = structuredClone(result.transform_trace); mutate(trace);
    assert.throws(() => replayTransformTrace(trace), error => error.code === 'TRANSFORM_TRACE_INVALID');
  }
});

test('unrecorded transformations and split Unicode offsets cannot become complete provenance', () => {
  const trace = createTransformTrace('😀 Anna');
  trace.append('entities', '😀 Anna', '[PERSON_001]', [{ start: 1, end: 7, original: '\ude00 Anna', replacement: '[PERSON_001]', kind: 'PERSON' }]);
  assert.equal(trace.finish('[PERSON_001]').complete, false);
  assert.equal(createTransformTrace('Original').finish('changed').complete, false);
});
test('entity coordinates compose across real sequential passes without interpreting imported markers', () => {
  const raw = '😀 Name: Anna Beispiel\nE-Mail: anna@example.invalid\nImport: [PERSON_999]';
  const first = pii.anonymize(raw, 'general', { captureTransformPlan: true });
  const second = pii.anonymize(first.text, 'general', { captureTransformPlan: true });
  const trace = createTransformTrace(raw); trace.appendTrace('first', first.transform_trace); trace.appendTrace('second', second.transform_trace);
  const plan = entityPlanFromTrace(trace.finish(second.text));
  assert.ok(plan.occurrences.some(row => row.kind === 'PERSON' && row.original === 'Anna Beispiel'));
  assert.ok(plan.occurrences.some(row => row.kind === 'EMAIL' && row.original === 'anna@example.invalid'));
  assert.ok(plan.occurrences.every(row => row.original !== '[PERSON_999]'));
  for (const row of plan.occurrences) {
    assert.equal(raw.slice(row.source_start, row.source_end), row.original);
    assert.equal(second.text.slice(row.output_start, row.output_end), row.replacement);
  }
});
test('temporary reservations restore source provenance and a later real human edit is captured', () => {
  const raw = '😀 Technischer Begriff', token = '[PERSON_REVIEW_000001]';
  const trace = createTransformTrace(raw);
  trace.append('reserve', raw, `😀 ${token}`, [{ start: 3, end: raw.length, original: raw.slice(3), replacement: token, kind: 'RESERVATION' }]);
  trace.append('restore', `😀 ${token}`, raw, [{ start: 3, end: 3 + token.length, original: token, replacement: raw.slice(3), kind: 'RESERVATION_RESTORE' }]);
  trace.append('human', raw, '😀 [UNTERNEHMEN_001]', [{ start: 3, end: raw.length, original: raw.slice(3), replacement: '[UNTERNEHMEN_001]', kind: 'ORGANIZATION' }]);
  const plan = entityPlanFromTrace(trace.finish('😀 [UNTERNEHMEN_001]'));
  assert.equal(plan.occurrences.length, 1); assert.equal(plan.occurrences[0].original, 'Technischer Begriff');
});
test('an operation cutting generated text is replayable but cannot fabricate reversible source entities', () => {
  const trace = createTransformTrace('Anna');
  trace.append('first', 'Anna', '[PERSON_001]', [{ start: 0, end: 4, original: 'Anna', replacement: '[PERSON_001]', kind: 'PERSON' }]);
  trace.append('second', '[PERSON_001]', '[X_001]', [{ start: 1, end: 7, original: 'PERSON', replacement: 'X', kind: 'PERSON' }]);
  const complete = trace.finish('[X_001]'); assert.equal(replayTransformTrace(complete), '[X_001]');
  assert.throws(() => entityPlanFromTrace(complete), error => error.code === 'TRANSFORM_TRACE_INVALID');
});
test('semantic identity groups honorific and plain applied fragments without losing their different originals', () => {
  const raw = 'Frau Anna Beispiel\nAnna Beispiel';
  const result = pii.anonymize(raw, 'general', { captureTransformPlan: true }), plan = entityPlanFromTrace(result.transform_trace);
  assert.equal(plan.occurrences.length, 2); assert.equal(new Set(plan.occurrences.map(row => row.entity_id)).size, 1);
  assert.deepEqual(plan.occurrences.map(row => row.original), ['Frau Anna Beispiel', 'Anna Beispiel']);
});

test('the actual registry binds full name, hyphenated spelling and honorific surname without guessing from source markers', () => {
  const raw = 'Name: Anna Beispiel\nAnna-Beispiel schrieb den Bericht.\nFrau Beispiel antwortet.\nImport: [PERSON_001]';
  const result = pii.anonymize(raw, 'general', { captureTransformPlan: true }), plan = entityPlanFromTrace(result.transform_trace);
  const names = plan.occurrences.filter(row => ['PERSON', 'PERSON_ALIAS'].includes(row.kind));
  assert.deepEqual(names.map(row => row.original), ['Anna Beispiel', 'Anna-Beispiel', 'Frau Beispiel']);
  assert.equal(new Set(names.map(row => row.entity_id)).size, 1);
  assert.equal(new Set(names.map(row => row.identity_key)).size, 1);
  assert.equal(plan.occurrences.some(row => row.original === '[PERSON_001]'), false);
  const changed = require('../plugins/data-secure/server/gateway/standalone-entity-review').applyEntityDecisions(result.text,
    require('../plugins/data-secure/server/gateway/standalone-entity-review').initialEntities({ markdown: result.text, transform_trace: result.transform_trace }),
    [{ entity_id: names[0].entity_id, decision: 'organization' }], Buffer.alloc(32, 1));
  assert.equal(new Set(changed.entities.map(row => changed.markdown.slice(row.start, row.end))).size, 1);
});
test('a surname made ambiguous in a later document is never captured as the old complete identity', () => {
  const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
  const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 1), { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    pii.anonymize('Name: Anna Beispiel\nFrau Beispiel schrieb.', 'general', { registry, captureTransformPlan: true });
    const result = pii.anonymize('Name: Anna Beispiel\nName: Bernd Beispiel\nFrau Beispiel antwortete.', 'general', { registry, captureTransformPlan: true });
    const names = entityPlanFromTrace(result.transform_trace).occurrences;
    const anna = names.find(row => row.original === 'Anna Beispiel'), surname = names.find(row => row.original === 'Frau Beispiel');
    assert.ok(anna); assert.ok(surname); assert.match(surname.replacement, /PERSON_UNKLAR/u);
    assert.notEqual(anna.entity_id, surname.entity_id); assert.notEqual(anna.identity_key, surname.identity_key);
  } finally { registry.dispose(); }
});
test('seventy actual reservations restore in one bounded trace step rather than exhausting the step budget', () => {
  const raw = Array.from({ length: 70 }, (_, n) => `CLOUD ${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + n % 26)}BERATUNG`).join('\n');
  const reserve = require('../plugins/data-secure/server/gateway/orchestrator')._test.reservePersonReviewCandidates(raw, null, true, 'general');
  assert.equal(reserve.mask_edits.length, 70);
  const trace = createTransformTrace(raw); trace.append('reserve', raw, reserve.masked, reserve.mask_edits);
  const output = reserve.restore(reserve.masked, (before, after, edits) => trace.append('restore', before, after, edits));
  const captured = trace.finish(output); assert.equal(captured.steps.length, 2); assert.equal(captured.complete, true);
  assert.equal(replayTransformTrace(captured), raw); assert.equal(entityPlanFromTrace(captured).occurrences.length, 0);
});
done();
