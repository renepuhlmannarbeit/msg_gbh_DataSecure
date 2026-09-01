'use strict';

const crypto = require('crypto');
const { createSuite } = require('./helpers');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const {
  SECRET_BYTES, canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
} = require('../plugins/data-secure/server/batch-pseudonym-registry');

const { test, done, assert } = createSuite('Batch pseudonym registry');

test('canonical form is Unicode-stable and HMAC output is safe Base32', () => {
  assert.strictEqual(canonicalValue('  M\u00fcller\n Beispiel '), canonicalValue('Mu\u0308ller Beispiel'));
  assert.match(base32(Buffer.from([0, 255, 16])), /^[A-Z2-7]+$/u);
});

test('the same entity keeps its deterministic pseudonym across separate documents', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  const one = pii.anonymize('Ansprechpartner: Erika Beispiel', 'customer', { registry }).text;
  const two = pii.anonymize('Kontaktperson: Erika Beispiel', 'customer', { registry }).text;
  const marker = one.match(/\[PERSON_[A-Z2-7]+\]/u)?.[0];
  assert.ok(marker, 'first document must contain a batch pseudonym');
  assert.ok(two.includes(marker), 'same entity must keep its batch pseudonym');
  assert.doesNotMatch(marker, /\d{3}\]/u, 'legacy per-document counter must not be used');
  registry.dispose();
  secret.fill(0);
});

test('the existing release gate accepts only an injected in-memory batch registry', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  const first = anonymizeMarkdown('Kundin: Erika Beispiel', 'customer', { registry });
  const second = anonymizeMarkdown('Kontakt: Erika Beispiel', 'customer', { registry });
  const marker = first.text.match(/\[PERSON_[A-Z2-7]+\]/u)?.[0];
  assert.ok(marker, 'the batch registry marker must reach the regular release gate');
  assert.ok(second.text.includes(marker), 'the release gate must retain the same batch mapping');
  assert.strictEqual(Object.hasOwn(first, 'registry'), false, 'a release result must never expose its registry');
  registry.dispose();
  secret.fill(0);
});

test('personnel organizations, employers and locations work through the batch registry', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 3);
  const registry = createBatchPseudonymRegistry(secret);
  const result = pii.anonymize([
    'Arbeitgeber: Interne Arbeitgeber AG',
    'Kunde: Externe Klinik GmbH',
    'Standort: Berlin, Privatstraße 12'
  ].join('\n'), 'personnel_profile', { registry });
  assert.match(result.text, /\[ARBEITGEBER_001\]/u);
  assert.match(result.text, /\[KUNDE_[A-Z2-7]+\]/u);
  assert.doesNotMatch(result.text, /Interne Arbeitgeber|Externe Klinik|Privatstraße/u);
  registry.dispose();
  secret.fill(0);
});

test('different secrets unlink batches while entity kinds remain separated', () => {
  const firstSecret = Buffer.alloc(SECRET_BYTES, 1);
  const secondSecret = Buffer.alloc(SECRET_BYTES, 2);
  const one = createBatchPseudonymRegistry(firstSecret);
  const two = createBatchPseudonymRegistry(secondSecret);
  assert.notStrictEqual(one.assign('PERSON', 'Erika Beispiel'), two.assign('PERSON', 'Erika Beispiel'));
  assert.notStrictEqual(one.assign('PERSON', 'Erika Beispiel'), one.assign('ORG', 'Erika Beispiel'));
  one.dispose();
  two.dispose();
  firstSecret.fill(0);
  secondSecret.fill(0);
});

test('a truncated-label collision deterministically extends rather than merges entities', () => {
  const labels = new Map();
  const first = Buffer.alloc(32, 0);
  const second = Buffer.alloc(32, 0);
  second[7] = 1; // same first ten Base32 characters, different full HMAC value
  const firstLabel = placeholderForDigest('PERSON', first, labels);
  labels.set(firstLabel.placeholder, firstLabel.digestId);
  const secondLabel = placeholderForDigest('PERSON', second, labels);
  assert.notStrictEqual(firstLabel.placeholder, secondLabel.placeholder);
  assert.ok(secondLabel.placeholder.length > firstLabel.placeholder.length);
  first.fill(0);
  second.fill(0);
});

test('registry is memory-only and cannot be used after disposal', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  registry.assign('CUSTOMER', 'Beispiel Klinik GmbH');
  assert.strictEqual(Object.hasOwn(registry, 'map'), false);
  assert.strictEqual(registry.entriesForKind('CUSTOMER').length, 1);
  const publicCounts = registry.counts;
  assert.ok(Object.isFrozen(publicCounts));
  assert.throws(() => { publicCounts.CUSTOMER = 99; }, TypeError);
  assert.strictEqual(registry.counts.CUSTOMER, 1, 'public counters must not mutate registry state');
  registry.dispose();
  assert.throws(() => registry.entriesForKind('CUSTOMER'), (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
  assert.throws(() => registry.assign('CUSTOMER', 'Beispiel Klinik GmbH'),
    (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
  secret.fill(0);
});

done();
