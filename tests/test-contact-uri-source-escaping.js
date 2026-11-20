'use strict';
const crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Source-bound escaped phone URIs');
const structured = require('../plugins/data-secure/server/privacy/structured');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const content = { productChannel: 'standalone', contentOptions:
  { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function checked(source, expected, options = content) {
  const before = sha(source), result = anonymizeMarkdown(source, 'general', options);
  assert.equal(result.text, expected); assert.ok(!result.text.includes('301234567'));
  assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary, options), []);
  assert.equal(sha(source), before);
}
test('raw escaped phone spans include every original code unit after emoji and CRLF', () => {
  for (const scheme of ['tel', 'sms']) for (let count = 0; count <= 6; count++) {
    const slash = String.fromCharCode(92).repeat(count), uri = `${scheme}:+49${slash}(0${slash})301234567`;
    const prefix = '😀 ÄÖÜß\r\nKontakt ', source = prefix + uri + '. Fachinhalt';
    const spans = structured.findStructuredSpans(source).filter(span => span.type === 'CONTACT_URI');
    assert.equal(spans.length, 1); assert.equal(spans[0].start, prefix.length);
    assert.equal(spans[0].end, prefix.length + uri.length); assert.equal(spans[0].text, uri);
    checked(uri, '[CONTACT_REDACTED]');
  }
});
test('both policies protect escaped URI parentheses and preserve external prose', () => {
  for (const options of [{}, content]) for (const scheme of ['tel', 'sms']) {
    const uri = scheme + String.raw`:\+49\(0\)301234567`;
    checked(uri, '[CONTACT_REDACTED]', options);
    checked('Kontakt nutzen ' + uri + '. Fachinhalt bleibt.', 'Kontakt nutzen [CONTACT_REDACTED]. Fachinhalt bleibt.', options);
  }
});
test('real Office extraction feeds complete phone URI values into actual Standalone compliance', () => {
  const xml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  for (const scheme of ['tel', 'sms']) for (const prefix of ['', 'Kontakt nutzen ', 'Telefon: ']) {
    const text = prefix + scheme + ':+49(0)301234567';
    const bytes = zipStore([...opcControlEntries('docx'), ['word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${xml(text)}</w:t></w:r></w:p></w:body></w:document>`]]);
    const before = sha(bytes), extracted = extractMarkdownBuffer(bytes, '.docx', { markdownOutput: 'content-v1', partialExtraction: true });
    assert.ok(extracted.markdown.includes(String.raw`\(0\)`));
    const result = anonymizeMarkdown(extracted.markdown, 'general', content);
    assert.ok(result.text.includes('[CONTACT_REDACTED]')); assert.ok(!result.text.includes('301234567'));
    assert.ok(result.text.includes(prefix.trim()) || !prefix);
    assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary, content), []);
    assert.equal(sha(bytes), before);
  }
});
test('unescaped, percent, SMS and parameter forms preserve their established complete boundary', () => {
  for (const source of ['tel:+49(0)301234567', 'tel:%2B49%280%29301234567',
    String.raw`tel:030\.1234567`, String.raw`tel:030\-1234567`, String.raw`tel:030\/1234567`,
    'sms:+49301234567,+498765432', 'tel:+49301234567;ext=42', 'tel:+49301234567?ext=42']) checked(source, '[CONTACT_REDACTED]');
  checked('tel:0301234567.Fachtext', '[CONTACT_REDACTED].Fachtext');
  checked('tel:0301234567. Fachtext', '[CONTACT_REDACTED]. Fachtext');
  checked('tel:', 'tel:');
  checked('mailto:anna@example.test', '[CONTACT_REDACTED]');
});
test('explicit credential fields keep their own higher-priority metadata protection', () => {
  const source = String.raw`Passwort: tel:\+49\(0\)301234567`;
  const result = pii.anonymize(source, 'general', content);
  assert.ok(!result.text.includes('301234567'));
  assert.ok(result.findings.length && result.findings.every(row => row.type === 'CREDENTIAL' && !Object.hasOwn(row, 'value_hash')));
});
done();
