'use strict';
// Pure projection tests use actual core traces and typed review edits. They
// prove no native file opening, publication, detector quality or GUI behavior.
const crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { createConfidentialOverview, renderConfidentialOverview } = require('../plugins/data-secure/server/standalone/confidential-overview');
const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { createTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const pii = require('../plugins/data-secure/server/pii-engine');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { test, assert, done } = createSuite('Standalone confidential revision overview');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function actual(raw = 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid') {
  const result = pii.anonymize(raw, 'general', { captureTransformPlan: true });
  return { markdown: result.text, entities: initialEntities({ markdown: result.text, transform_trace: result.transform_trace }) };
}
function document(value, id = '1'.repeat(32)) { return { document_id: id, name: `nested/${id}.pdf`,
  revision: 0, output_sha256: hash(value.markdown), markdown: value.markdown, entities: value.entities }; }
function overview(values) { const builder = createConfidentialOverview('a'.repeat(64)); values.forEach(row => builder.add(row)); return builder.finish(); }
function readable(raw, strategy = 'general', prime) {
  const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 1), { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    if (prime) pii.anonymize(prime, strategy, { registry, captureTransformPlan: true });
    const result = pii.anonymize(raw, strategy, { registry, captureTransformPlan: true });
    return { markdown: result.text, entities: initialEntities({ markdown: result.text, transform_trace: result.transform_trace }) };
  } finally { registry.dispose(); }
}
test('actual edits map exact source fragments and do not copy document bodies or direct contact values', () => {
  const result = overview([document(actual())]);
  assert.equal(result.value.confidential, true); assert.equal(result.value.ai_upload_allowed, false);
  assert.equal(result.value.documents[0].entries[0].occurrences, 2);
  assert.deepEqual(result.value.documents[0].entries[0].originals, ['Anna Beispiel']);
  assert.doesNotMatch(result.text, /anna@example|42 Projekte/u);
  assert.match(result.text, /NICHT AN KI|Keine automatische Löschung/u);
});
test('typed HMAC replacements are read from the current bytes, not the original numeric marker', () => {
  const value = actual(), person = value.entities.find(row => row.kind === 'PERSON');
  const edited = applyEntityDecisions(value.markdown, value.entities, [{ entity_id: person.entity_id, decision: 'organization' }], Buffer.alloc(32, 7));
  const result = overview([document(edited)]), entry = result.value.documents[0].entries[0];
  assert.match(entry.replacement, /^\[UNTERNEHMEN_[A-Z2-7]{52}\]$/u); assert.equal(entry.kind, 'ORGANIZATION');
  assert.equal(edited.markdown.includes(entry.replacement), true);
});
test('keep and overlapping masks never become re-identification entries', () => {
  const value = actual(), person = value.entities.find(row => row.kind === 'PERSON');
  const kept = applyEntityDecisions(value.markdown, value.entities, [{ entity_id: person.entity_id, decision: 'keep' }], Buffer.alloc(32));
  assert.equal(overview([document(kept)]).value.documents[0].entries.length, 0);
  const masked = { ...value, entities: value.entities.map(row => row.kind === 'PERSON' ? { ...row, disabled: true } : row) };
  assert.equal(overview([document(masked)]).value.documents[0].entries.length, 0);
});
test('imported marker-looking source without an actual trace grants no identity mapping', () => {
  const result = overview([document({ markdown: 'Name: [PERSON_011]', entities: null })]);
  assert.equal(result.value.documents[0].trace_available, false); assert.deepEqual(result.value.documents[0].entries, []);
});
test('marker collisions are document scoped and different originals in one marker are explicitly ambiguous', () => {
  const a = actual('Name: Anna Beispiel'), b = actual('Name: Bernd Muster');
  const result = overview([document(a), document(b, '2'.repeat(32))]);
  assert.deepEqual(result.value.documents.map(row => row.entries[0].originals), [['Anna Beispiel'], ['Bernd Muster']]);
  const joined = { markdown: a.markdown + '\n' + b.markdown,
    entities: [...a.entities, ...b.entities.map(row => ({ ...row, occurrence_id: 'occ_900001',
      start: row.start + a.markdown.length + 1, end: row.end + a.markdown.length + 1 }))] };
  assert.equal(overview([document(joined)]).value.documents[0].entries.length, 0);
  assert.equal(overview([document(joined)]).value.documents[0].excluded.ambiguous, 2);
});
test('an unanchored surname and uncertain generic marker never claim a unique identity', () => {
  const raw = 'Beispiel', markdown = '[PERSON_UNKLAR]', trace = createTransformTrace(raw);
  trace.append('entities', raw, markdown, [{ start: 0, end: raw.length, original: raw, replacement: markdown, kind: 'PERSON_ALIAS' }]);
  const value = { markdown, entities: initialEntities({ markdown, transform_trace: trace.finish(markdown) }) };
  assert.deepEqual(overview([document(value)]).value.documents[0].entries, []);
});

test('a typed decision cannot turn a proven ambiguous registry binding into a full identity', () => {
  const value = readable('Name: Anna Beispiel\nName: Bernd Beispiel\nFrau Beispiel antwortet.', 'general',
    'Name: Anna Beispiel\nFrau Beispiel schrieb.'), surname = value.entities.find(row => row.original === 'Frau Beispiel');
  assert.match(surname.identity_key, /PERSON_UNKLAR/u);
  for (const decision of ['person', 'organization']) {
    const edited = applyEntityDecisions(value.markdown, value.entities, [{ entity_id: surname.entity_id, decision }], Buffer.alloc(32, 9));
    const result = overview([document(edited)]).value.documents[0];
    assert.equal(result.excluded.ambiguous, 1);
    assert.equal(result.entries.some(row => row.originals.includes('Frau Beispiel')), false);
  }
});

test('actual unique registry binding preserves full, hyphenated and surname source fragments', () => {
  const value = readable('Name: Anna Beispiel\nAnna-Beispiel schrieb.\nFrau Beispiel antwortet.');
  assert.equal(new Set(value.entities.map(row => row.identity_key)).size, 1);
  const result = overview([document(value)]).value.documents[0];
  assert.equal(result.entries.length, 1); assert.equal(result.excluded.ambiguous, 0);
  assert.equal(result.entries[0].occurrences, 3);
  assert.deepEqual(result.entries[0].originals, ['Anna Beispiel', 'Anna-Beispiel', 'Frau Beispiel']);
});

test('actual readable employer and customer fields map organizations including table whitespace', () => {
  for (const raw of ['Arbeitgeber: Muster GmbH\nKunde: Nordlicht AG', '| Arbeitgeber | Muster GmbH |\n| Kunde | Nordlicht AG |']) {
    const value = readable(raw, 'personnel_profile'), result = overview([document(value)]).value.documents[0];
    assert.equal(result.entries.length, 2); assert.equal(result.excluded.not_identity, 0);
    assert.ok(result.entries.every(row => row.kind === 'ORGANIZATION' && row.replacement.startsWith('[UNTERNEHMEN_')));
  }
  const baseline = pii.anonymize('Arbeitgeber: Muster GmbH', 'personnel_profile', { captureTransformPlan: true });
  const generic = { markdown: baseline.text, entities: initialEntities({ markdown: baseline.text, transform_trace: baseline.transform_trace }) };
  assert.equal(overview([document(generic)]).value.documents[0].entries.length, 0);
});

test('non-BMP format characters are escaped losslessly without introducing invalid Unicode', () => {
  const value = { ...document(actual()), name: 'nested/\u{E0001}datei.pdf' }, result = overview([value]);
  const nameLine = result.text.split('\n').find(line => line.startsWith('Datei: ')).slice(7);
  assert.equal(JSON.parse(nameLine), value.name); assert.equal(result.text.isWellFormed(), true);
  assert.equal(result.text.includes('\u{E0001}'), false);
});
test('binding changes with revision or typed decision, remains deterministic across document ordering', () => {
  const a = document(actual()), b = document(actual('Name: Bernd Muster'), '2'.repeat(32));
  assert.deepEqual(overview([a, b]), overview([b, a]));
  assert.notEqual(overview([a]).binding_sha256, overview([{ ...a, revision: 1 }]).binding_sha256);
});
test('closed projections reject bad hashes, duplicate IDs, foreign keys, invalid offsets and Unicode splits', () => {
  const value = document(actual());
  for (const changed of [{ ...value, output_sha256: 'f'.repeat(64) }, { ...value, local_path: 'C:/secret' },
    { ...value, entities: [{ ...value.entities[0], start: -1 }] },
    { ...value, markdown: '😀', output_sha256: hash('😀'), entities: [{ ...value.entities[0], start: 1, end: 2 }] }])
    assert.throws(() => overview([changed]), error => error.code === 'DOCUMENT_REVIEW_INVALID');
  assert.throws(() => overview([value, value]), error => error.code === 'DOCUMENT_REVIEW_INVALID');
  assert.throws(() => overview([]), error => error.code === 'DOCUMENT_REVIEW_MISSING');
});
test('confidential exclusion summary requires four distinct counters', () => {
  const generated = overview([document(actual())]);
  const altered = structuredClone(generated.value);
  altered.documents[0].excluded = { 'ambiguous,kept': 0, masked: 0, not_identity: 0 };
  assert.throws(() => renderConfidentialOverview(altered), error => error.code === 'DOCUMENT_REVIEW_INVALID');
});

function repeatedProjection(count, contact = true) {
  const seed = actual(contact ? 'E-Mail: anna@example.invalid' : 'Name: Anna Beispiel');
  assert.equal(seed.entities.length, 1);
  const markdown = Array(count).fill(seed.markdown).join('\n');
  return { markdown, entities: Array.from({ length: count }, (_, index) => ({ ...seed.entities[0],
    occurrence_id: `occ_${String(index + 1).padStart(6, '0')}`,
    start: seed.entities[0].start + index * (seed.markdown.length + 1),
    end: seed.entities[0].end + index * (seed.markdown.length + 1) })) };
}
test('contact and repeated-identity counters are not materialized identity-row limits', () => {
  for (const count of [10000, 10001]) {
    const contacts = overview([document(repeatedProjection(count))]);
    assert.equal(contacts.value.documents[0].excluded.not_identity, count);
    assert.equal(contacts.value.documents[0].entries.length, 0);
    assert.doesNotMatch(contacts.text, /anna@example/u);
    assert.equal(renderConfidentialOverview(contacts.value), contacts.text, 'immutable export reference can be reopened');
    const people = overview([document(repeatedProjection(count, false))]);
    assert.equal(people.value.documents[0].entries.length, 1);
    assert.equal(people.value.documents[0].entries[0].occurrences, count);
  }
});
test('every contact beyond the former limit is still validated, never filtered first', () => {
  const value = repeatedProjection(10001);
  for (const changed of [{ start: -1 }, { occurrence_id: value.entities[0].occurrence_id }, { foreign: true }]) {
    const entities = [...value.entities]; entities[10000] = { ...entities[10000], ...changed };
    assert.throws(() => overview([document({ ...value, entities })]), error => error.code === 'DOCUMENT_REVIEW_INVALID');
  }
});
test('the unchanged global occurrence budget also bounds stored rendered counters', () => {
  const value = overview([document(repeatedProjection(100000))]);
  assert.equal(value.value.documents[0].excluded.not_identity, 100000);
  assert.throws(() => overview([document(repeatedProjection(100001))]), error => error.code === 'DOCUMENT_REVIEW_LIMIT');
  const extra = structuredClone(value.value.documents[0]); extra.document_id = '2'.repeat(32);
  extra.excluded.not_identity = 1;
  assert.throws(() => renderConfidentialOverview({ ...value.value, documents: [...value.value.documents, extra] }),
    error => error.code === 'DOCUMENT_REVIEW_LIMIT');
});
done();
