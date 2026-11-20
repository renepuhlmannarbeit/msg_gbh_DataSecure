'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Complete Markdown header collection');
const base = require('../plugins/data-secure/server/privacy/base');
const { CONTENT_PERSON_FIELD_POLICY, LEGACY_PERSON_FIELD_POLICY } = require('../plugins/data-secure/server/core/person-field-policy');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const pii = require('../plugins/data-secure/server/pii-engine');
const options = { productChannel: 'standalone', contentOptions:
  { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
function table(headers, body = 'X|Y', separator = '---|---', ending = '\n') {
  return [...headers, separator, body].join(ending);
}
test('one, two and three row headers retain source order and independently reconstructed columns', () => {
  for (const ending of ['\n', '\r\n']) for (const policy of [CONTENT_PERSON_FIELD_POLICY, LEGACY_PERSON_FIELD_POLICY]) {
    for (const [headers, expected] of [
      [['Name|Kategorie'], 'Name'], [['Telefon|Kategorie', 'privat|Klasse'], 'Telefon (privat)'],
      [['API|Kategorie', ' |Klasse', 'Key|Art'], 'Key']
    ]) {
      const source = table(headers, 'X|Y', '---|---', ending), at = source.lastIndexOf('X');
      assert.equal(base.hasAmbiguousSensitiveTable(source, policy), false);
      assert.equal(base.tableHeaderAt(source, at, policy), expected);
      assert.equal(base.tableHeaderAt(source, source.lastIndexOf('Y'), policy), headers.at(-1).split('|')[1]);
    }
  }
});
test('older sensitive fragments and width mismatches cannot be discarded as irrelevant rows', () => {
  for (const count of [1, 3, 31, 6000]) {
    const middle = Array(count).fill('A|B');
    for (const headers of [
      ['Name|B', ...middle], ['API|B', ...middle, 'Key|B'], ['Name|B|C', ...middle]
    ]) {
      const source = table(headers);
      assert.equal(base.hasAmbiguousSensitiveTable(source, CONTENT_PERSON_FIELD_POLICY), true);
      assert.throws(() => base.assertPersonFieldStructure(source, CONTENT_PERSON_FIELD_POLICY), { code: 'RESIDUAL_PII' });
    }
    const mismatched = table(['Name|B', ...middle], 'X|Y|Z', '---|---|---');
    assert.equal(base.hasAmbiguousSensitiveTable(mismatched, CONTENT_PERSON_FIELD_POLICY), true);
    assert.throws(() => base.assertPersonFieldStructure(mismatched, CONTENT_PERSON_FIELD_POLICY), { code: 'RESIDUAL_PII' });
  }
});
test('a moderate complete neutral header block remains readable through the actual anonymization API', () => {
  const source = table(Array(6000).fill('A|B'));
  assert.equal(base.hasAmbiguousSensitiveTable(source, CONTENT_PERSON_FIELD_POLICY), false);
  assert.equal(base.tableHeaderAt(source, source.lastIndexOf('X'), CONTENT_PERSON_FIELD_POLICY), 'A');
  const result = anonymizeMarkdown(source, 'general', options);
  assert.equal(result.text, source);
  assert.deepEqual(result.dictionary, []);
  assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary, options), []);
});
done();
