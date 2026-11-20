'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Credential interval coverage and private metadata');
const { credentialIntervals, overlapsCredential } = require('../plugins/data-secure/server/privacy/credential-interval-coverage');
const structured = require('../plugins/data-secure/server/privacy/structured');
const pii = require('../plugins/data-secure/server/pii-engine');
const { normalizeText } = require('../plugins/data-secure/server/privacy/base');

test('nested, equal-start and adjacent ranges form immutable geometry without source metadata', () => {
  const input = Object.freeze([
    Object.freeze({ type: 'CREDENTIAL', start: 20, end: 30, text: 'private', value_hash: 'private-hash' }),
    Object.freeze({ type: 'CREDENTIAL', start: 10, end: 60, identity: 'private-id' }),
    Object.freeze({ type: 'CREDENTIAL', start: 10, end: 40 }),
    Object.freeze({ type: 'CREDENTIAL', start: 60, end: 65 }),
    Object.freeze({ type: 'CREDENTIAL', start: 80, end: 90 }),
    Object.freeze({ type: 'EMAIL', start: 0, end: 100 })
  ]);
  const before = JSON.stringify(input), union = credentialIntervals(input);
  assert.deepEqual(union, [{ start: 10, end: 65 }, { start: 80, end: 90 }]);
  assert.ok(Object.isFrozen(union));
  assert.ok(union.every(range => Object.isFrozen(range) && Object.keys(range).join(',') === 'start,end'));
  assert.equal(JSON.stringify(input), before);
});
test('half-open boundaries, empty queries and real gaps never gain coverage', () => {
  const index = credentialIntervals([{ type: 'CREDENTIAL', start: 10, end: 30 }, { type: 'CREDENTIAL', start: 40, end: 50 }]);
  for (const [start, end, expected] of [[0, 10, false], [10, 11, true], [29, 30, true], [30, 40, false],
    [39, 40, false], [40, 41, true], [50, 51, false], [10, 10, false], [20, 20, false], [0, 60, true]]) {
    assert.equal(overlapsCredential(index, start, end), expected, `${start}:${end}`);
  }
  assert.equal(overlapsCredential(credentialIntervals([]), 0, 1), false);
});
test('bounded differential queries agree with an independent direct overlap oracle', () => {
  let seed = 171;
  for (let n = 0; n < 32; n++) {
    const raw = [];
    for (let k = 0; k < 10; k++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const start = seed % 48;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      raw.push({ type: 'CREDENTIAL', start, end: start + 1 + seed % 16 });
    }
    const index = credentialIntervals(raw);
    for (let start = 0; start <= 64; start++) for (let end = start; end <= 64; end++) {
      assert.equal(overlapsCredential(index, start, end), start < end && raw.some(range => range.start < end && start < range.end));
    }
  }
});
test('invalid credential coordinates and queries fail explicitly instead of losing protection', () => {
  for (const [start, end] of [[-1, 3], [0, NaN], [0, Infinity], [0.5, 3], ['0', 3], [3, 2], [3, 3]]) {
    assert.throws(() => credentialIntervals([{ type: 'CREDENTIAL', start, end }]), { code: 'PRIVACY_INTERVAL_INVALID' });
  }
  for (const [start, end] of [[-1, 3], [0, NaN], [0, Infinity], [0.5, 3], ['0', 3], [3, 2]]) {
    assert.throws(() => overlapsCredential([], start, end), { code: 'PRIVACY_INTERVAL_INVALID' });
  }
  assert.deepEqual(credentialIntervals([{ type: 'EMAIL', start: -1, end: NaN }]), []);
});
test('real nested GFM credential fields suppress secondary hashes, raw residuals and locators', () => {
  for (const ending of ['\n', '\r\n']) for (const value of ['x@example.test', '192.168.1.1', '2001:db8::1']) {
    const source = ['X | Passwort | Hinweis', '--- | --- | ---', `Passwort: ÄÖÜß😀 | secret | ${value}`].join(ending);
    const expected = ['X | Passwort | Hinweis', '--- | --- | ---', 'Passwort: [CREDENTIAL_REDACTED]'].join(ending);
    const hits = [];
    assert.equal(structured.replaceStructured(source, hits), expected);
    assert.ok(hits.length && hits.every(hit => hit.type === 'CREDENTIAL' && !Object.hasOwn(hit, 'value_hash')));
    assert.ok(structured.scanStructured(source).every(hit => hit.type === 'CREDENTIAL' && hit.text === ''));
    for (const options of [{}, { productChannel: 'standalone', contentOptions:
      { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } }]) {
      const result = pii.anonymize(source, 'general', options);
      assert.equal(result.text, normalizeText(expected));
      assert.ok(result.findings.length && result.findings.every(hit => hit.type === 'CREDENTIAL' && !Object.hasOwn(hit, 'value_hash')));
      const residual = pii.scanResidual(source, 'general', [], options);
      assert.ok(residual.length && residual.every(hit => ['CREDENTIAL', 'SENSITIVE_FIELD'].includes(hit.type) && hit.text === '' && !Object.hasOwn(hit, 'value_hash')));
      assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary, options), []);
      // The real caller supplies its normalized displayed source for locators.
      const locators = pii.sensitiveSpans(normalizeText(source), 'general', options);
      assert.ok(locators.length && locators.every(hit => hit.type === 'CREDENTIAL' && hit.text === ''));
    }
  }
});
test('an identifier outside the union remains detected, masked and independently refused when raw', () => {
  const source = 'X | Passwort | Hinweis\n--- | --- | ---\nPasswort: abc | secret | inside@example.test\n\nEmail: outside@example.test';
  const result = pii.anonymize(source, 'general');
  assert.ok(result.findings.some(hit => hit.type === 'EMAIL' && hit.value_hash));
  assert.ok(!result.text.includes('inside@example.test') && !result.text.includes('outside@example.test'));
  for (const hits of [structured.scanStructured(source), pii.scanResidual(source), pii.sensitiveSpans(source)]) {
    assert.ok(hits.some(hit => hit.type === 'EMAIL' && hit.text === 'outside@example.test'));
    assert.ok(!hits.some(hit => hit.text === 'inside@example.test'));
  }
});
done();
