'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createSuite } = require('./helpers');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { contactSpans, buildContactDraft, validateContactAnswer, validateContactDraft, applyContactAnswer } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { createContactStore } = require('../plugins/data-secure/server/gateway/ocr-contact-store');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
const { encodeFrame, FrameDecoder } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { test, done, assert } = createSuite('Source-bound pre-privacy OCR contact review');
const text = 'E-Mail: garbled@business.invalid\nTelefon: +49 40 1234567\nName: Amina Lindenfels';
function input(source = text) { return { original_text: source, source_type: 'png',
  contacts: contactSpans(source, contactQuality({}, source)) }; }
function answer(draft, changes = {}) { return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item, index) =>
  Object.hasOwn(changes, index) ? { ambiguity_id: item.ambiguity_id, decision: 'correct_contact', replacement: changes[index] }
    : { ambiguity_id: item.ambiguity_id, decision: 'confirm_contact' }) }; }
test('high-confidence plausible wrong addresses still require occurrence confirmation', () => {
  const quality = contactQuality({ blocks: [{ paragraphs: [{ lines: [{ text: text.split('\n')[0], words: [{ confidence: 100 }] }] }] }] }, text);
  assert.equal(quality.low_confidence_lines.length, 0);
  const contacts = contactSpans(text, quality);
  assert.equal(contacts.length, 2);
  assert.equal(text.slice(contacts[0].start, contacts[0].end), 'garbled@business.invalid');
  const draft = buildContactDraft({ ...input(), contacts });
  assert.throws(() => validateContactAnswer({ action: 'skipped' }, draft));
  assert.equal(applyContactAnswer(input(), answer(draft)), text);
});
test('a new Unicode address and a longer phone are corrected before the real privacy engine', () => {
  const source = input(), draft = buildContactDraft(source);
  const corrected = applyContactAnswer(source, answer(draft, { 0: 'amína@other.example.invalid', 1: '+49 (040) 987654321' }));
  assert.equal(corrected, text.replace('garbled@business.invalid', 'amína@other.example.invalid').replace('+49 40 1234567', '+49 (040) 987654321'));
  const result = require('../plugins/data-secure/server/pii-engine').anonymize(corrected, 'personnel_profile');
  assert.ok(!result.text.includes('other.example.invalid'));
  assert.ok(!result.text.includes('987654321'));
  assert.ok(!result.text.includes('Amina Lindenfels'));
});
test('same OCR spelling at two occurrences can deliberately be different contacts', () => {
  const source = input('E-Mail: same@wrong.invalid\nE-Mail: same@wrong.invalid');
  const draft = buildContactDraft(source);
  assert.deepEqual(draft.decision_groups, []);
  const corrected = applyContactAnswer(source, answer(draft, { 0: 'first@example.invalid', 1: 'second@example.invalid' }));
  assert.equal(corrected, 'E-Mail: first@example.invalid\nE-Mail: second@example.invalid');
});
test('long subscriber blocks are fully removed but business numbers stay factual; unsafe phone remnants remain independently gated', () => {
  const engine = require('../plugins/data-secure/server/pii-engine');
  for (const source of ['Telefon: 030 234567890', 'Phone: +44 (020) 794600123',
    'Rückruf +49 (040) 987654321', '| Telefon | Menge |\n| --- | --- |\n| 030 123456789012 | 987654321 |']) {
    const result = engine.anonymize(source, 'personnel_profile');
    assert.match(result.text, /\[PHONE_REDACTED\]/u);
    assert.equal(engine.scanResidual(result.text, 'personnel_profile', result.dictionary).length, 0);
    if (source.startsWith('|')) assert.ok(result.text.includes('987654321'), 'adjacent business amount is not a phone');
    else assert.doesNotMatch(result.text, /234567890|794600123|987654321/u);
  }
  const factual = 'Auftrag 030 / 123456789\nMenge: 987654321\nVersion 0049.30';
  assert.equal(engine.anonymize(factual, 'personnel_profile').text, factual);
  for (const source of ['Telefon: 030 -- 123456', 'Rückruf +49 (040) 12 -- 3456', 'Telefon: +49 (040) 123456789012'])
    assert.ok(engine.scanResidual(source, 'personnel_profile', []).some(item => item.type === 'PHONE'), source);
});
test('missing at-signs and unscored labelled values are not guessed or silently skipped', () => {
  const source = input('E-Mail: qa90 quality example invalid\nTelefon: 030 123456');
  assert.equal(source.contacts.length, 2);
  assert.equal(source.contacts[0].kind, 'email');
  assert.equal(applyContactAnswer(source, answer(buildContactDraft(source), { 0: 'different@new.invalid' })).split('\n')[0], 'E-Mail: different@new.invalid');
});
test('LF, CRLF, CR and mixed OCR line endings retain exact source positions and mandatory maps', () => {
  for (const separator of ['\n', '\r\n', '\r']) {
    const value = `Header${separator}E-Mail: wrong@new.invalid${separator}Telefon: +44 (020) 794600123`;
    const source = input(value), draft = buildContactDraft(source);
    assert.deepEqual(source.contacts.map(item => [item.line, value.slice(item.start, item.end)]),
      [[2, 'wrong@new.invalid'], [3, '+44 (020) 794600123']]);
    assert.ok(applyContactAnswer(source, answer(draft, { 0: 'right@new.invalid' })).includes('right@new.invalid'));
  }
  const mixed = input('Heading\rE-Mail: one@new.invalid\r\nHeading\nE-Mail: two@new.invalid');
  assert.deepEqual(mixed.contacts.map(item => item.line), [2, 4]);
  const malformed = input('OCR: (wrong)@(new.invalid)');
  assert.equal(malformed.contacts.length, 1, 'warned malformed contact never disappears from the map');
  const base = { source_type: 'png', markdown: text, coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] } };
  for (const ocr_contacts of [undefined, []]) assert.throws(() => createMarkdownExtraction({ ...base,
    ...(ocr_contacts === undefined ? {} : { ocr_contacts }) }));
  createMarkdownExtraction({ ...base, ocr_contacts: input().contacts });
});
test('foreign spans, overlaps, native-format maps and arbitrary fields fail closed', () => {
  for (const contacts of [[{ ...input().contacts[0], start: -1 }], [input().contacts[0], input().contacts[0]],
    [{ ...input().contacts[0], page: 0 }], [{ ...input().contacts[0], payload: 'raw' }]]) assert.throws(() => buildContactDraft({ ...input(), contacts }));
  assert.throws(() => buildContactDraft({ ...input(), source_type: 'docx' }));
  const draft = buildContactDraft(input());
  assert.throws(() => validateContactDraft({ ...draft, allow_organization_review: true }));
  assert.throws(() => validateContactDraft({ ...draft, anonymized_text: 'different' }));
  assert.throws(() => validateContactDraft({ ...draft, ambiguities: [{ ...draft.ambiguities[0], ambiguity_id: 'foreign' }] }));
});
test('each explicit contact section is reviewed even when another contact on the same line has a valid shape', () => {
  for (const [source, expected] of [
    ['E-Mail: qa90 quality example invalid Telefon: +49 40 1234567', ['qa90 quality example invalid', '+49 40 1234567']],
    ['E-Mail: valid@new.invalid; Telefon: 030 123456', ['valid@new.invalid', '030 123456']],
    ['Telefon: 030 123456 E-Mail: broken new invalid', ['030 123456', 'broken new invalid']]]) {
    const mapped = input(source);
    assert.deepEqual(mapped.contacts.map(item => source.slice(item.start, item.end)), expected);
    assert.deepEqual(mapped.contacts.map(item => item.kind), source.startsWith('Telefon') ? ['phone', 'email'] : ['email', 'phone']);
    buildContactDraft(mapped);
  }
});
test('correction cannot inject Markdown, markers, controls, surplus choices or bypass keep', () => {
  const draft = buildContactDraft(input());
  for (const replacement of ['bad\n@new.invalid', '[PERSON_001]', '<fake@new.invalid>', 'a\u200b@new.invalid', 'a'.repeat(257) + '@x.invalid', 'not-an-email'])
    assert.throws(() => validateContactAnswer(answer(draft, { 0: replacement }), draft));
  for (const decision of ['keep', 'redact', 'redact_organization']) {
    const supplied = answer(draft); supplied.decisions[0].decision = decision;
    assert.throws(() => validateContactAnswer(supplied, draft));
  }
  const duplicated = answer(draft); duplicated.decisions[1] = duplicated.decisions[0];
  assert.throws(() => validateContactAnswer(duplicated, draft));
  assert.throws(() => applyContactAnswer(input(), { action: 'deferred' }), error => error.code === 'LOCAL_REVIEW_DEFERRED');
});
test('contact answers remain inside the original IPC byte limit, independently of the entity limit', () => {
  const source = input(Array(400).fill('E-Mail: a@b.invalid').join('\n'));
  const draft = buildContactDraft(source);
  const supplied = answer(draft, Object.fromEntries(Array.from({ length: 400 }, (_, index) => [index, `${'é'.repeat(245)}@x.invalid`])));
  assert.ok(Buffer.byteLength(JSON.stringify(supplied), 'utf8') < 900 * 1024);
  validateContactAnswer(supplied, draft);
  assert.throws(() => buildContactDraft(input(Array(401).fill('E-Mail: a@b.invalid').join('\n'))), error => error.code === 'LOCAL_REVIEW_TOO_LARGE');
});
test('durable private corrections survive reopen but reject changed extraction, run, seed and tampering', () => {
  // macOS can expose /var as a symlink. Exercise storage with the canonical
  // fixture root, without relaxing the product's redirected-ancestor guard.
  const temporary = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporary, 'datasecure-contact-'));
  const state = { product_channel: 'standalone', token: 'a'.repeat(64), pseudonym_seed: Buffer.alloc(32, 7).toString('base64url'),
    core_policy_fingerprint: 'c'.repeat(64), pseudonym_contract_version: 'test/1', pseudonym_ruleset_version: 'test/1' };
  const item = { id: 'item-1', work_name: `001_${'b'.repeat(24)}.workcopy`, sha256: 'd'.repeat(64) };
  const options = { privateWorkStore: createPrivateWorkStore({ privateRoot: root }), workPath: () => root };
  const store = createContactStore(options), source = input(), supplied = answer(buildContactDraft(source), { 0: 'right@new.invalid' });
  const target = path.join(root, `001_${'b'.repeat(24)}.ocrreview`);
  try {
    assert.equal(store.read(state, item, source), null);
    assert.equal(store.write(state, item, source, supplied), text.replace('garbled@business.invalid', 'right@new.invalid'));
    assert.equal(createContactStore(options).read(state, item, source), text.replace('garbled@business.invalid', 'right@new.invalid'));
    assert.throws(() => store.read(state, item, input(text + '\nExtra')), error => error.code === 'OCR_CONTACT_REVIEW_INVALID');
    assert.throws(() => store.read({ ...state, token: 'e'.repeat(64) }, item, source));
    assert.throws(() => store.read({ ...state, pseudonym_seed: Buffer.alloc(32, 8).toString('base64url') }, item, source));
    assert.throws(() => store.read(state, { ...item, sha256: 'e'.repeat(64) }, source));
    const record = JSON.parse(fs.readFileSync(target, 'utf8')); record.answer.decisions[0].replacement = 'forged@new.invalid';
    fs.writeFileSync(target, JSON.stringify(record));
    assert.throws(() => store.read(state, item, source));
    assert.ok(!JSON.stringify(state).includes('new.invalid'));
  } finally { fs.unlinkSync(target); fs.rmdirSync(root); }
});
test('the actual broker sends a contact answer only to its bound owned worker', () => {
  const sent = [], child = { send: value => sent.push(value) }, broker = createReviewBroker();
  const draft = buildContactDraft(input());
  broker.receive(child, { type: 'standalone-review-draft', batch_token: 'a'.repeat(64), review_id: 'b'.repeat(32), draft });
  assert.equal(broker.session().ready, true);
  assert.throws(() => broker.submit('c'.repeat(32), answer(draft)));
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'd'.repeat(16), action: 'submit_review',
    review_id: 'b'.repeat(32), answer: answer(draft, { 0: 'new@example.invalid' }) };
  const decoded = new FrameDecoder().push(encodeFrame(message))[0];
  assert.equal(broker.submit(decoded.review_id, decoded.answer).accepted, true);
  assert.equal(sent[0].answer.decisions[0].replacement, 'new@example.invalid');
  assert.ok(!JSON.stringify(broker.session()).includes('new@example.invalid'));
});
test('transport contact shapes never authorize a contact action against an entity draft', () => {
  const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');
  const broker = createReviewBroker(), child = { send() {} };
  const draft = buildReviewDraft('Anna Linden', 'Anna Linden', 'general', [{ ambiguity_id: 'person:v1:000001',
    type: 'person_prose_ambiguous', replacement_kind: 'PERSON', original_start: 0, original_end: 11, anonymized_start: 0, anonymized_end: 11 }], { allowDefer: true });
  broker.receive(child, { type: 'standalone-review-draft', batch_token: 'a'.repeat(64), review_id: 'b'.repeat(32), draft });
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'd'.repeat(16), action: 'submit_review', review_id: 'b'.repeat(32),
    answer: { action: 'reviewed', redactions: [], decisions: [{ ambiguity_id: 'ocr-contact:v1:000001', decision: 'correct_contact', replacement: 'a@b.invalid' }] } };
  const decoded = new FrameDecoder().push(encodeFrame(message))[0];
  assert.throws(() => broker.submit(decoded.review_id, decoded.answer), error => error.code === 'STANDALONE_REVIEW_DECISION_INVALID');
  assert.equal(broker.session().ready, true);
});
done();
