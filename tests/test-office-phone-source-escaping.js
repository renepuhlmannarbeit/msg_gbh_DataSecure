'use strict';
const crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Office phone source corridors');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { normalizeEncodedIdentifiers } = require('../plugins/data-secure/server/privacy/encoded-identifiers');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const content = { productChannel: 'standalone', contentOptions:
  { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const phoneRanges = text => [...text.matchAll(/\+49\(0\)301234567/gu)]
  .map(match => ({ start: match.index, end: match.index + match[0].length }));
function checked(source, options) {
  const result = anonymizeMarkdown(source, 'general', { ...options, captureTransformPlan: true });
  assert.ok(!result.text.includes('301234567'));
  assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary, options), []);
  assert.equal(result.transform_trace.complete, true);
  assert.equal(replayTransformTrace(result.transform_trace), result.text);
  return result.text;
}
test('actual Word extraction protects parenthesized phones without a URI owner', () => {
  for (const source of ['Kontakt per +49(0)301234567 ist möglich.',
    'Kontakt per +49301234567 ist möglich.', 'Telefon: +49(0)301234567']) {
    const bytes = zipStore([...opcControlEntries('docx'), ['word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${source}</w:t></w:r></w:p></w:body></w:document>`]]);
    const before = sha(bytes), extracted = extractMarkdownBuffer(bytes, '.docx', { markdownOutput: 'content-v1', partialExtraction: true });
    for (const options of [{}, content]) {
      const result = checked(extracted.markdown, options);
      if (source.startsWith('Kontakt')) assert.ok(result.includes('Kontakt per ') && result.includes('ist möglich'));
    }
    assert.equal(sha(bytes), before);
  }
});
test('each occurrence is removed after emoji and mixed line endings, including literal code', () => {
  for (const options of [{}, content]) for (const raw of [
    String.raw`Kontakt per \+49\(0\)301234567 ist möglich\.`,
    String.raw`Kontakt per +49\(0\)301234567 ist möglich.`,
    '`Kontakt +49\\(0\\)301234567`',
    '```text\nKontakt +49\\(0\\)301234567\n```']) {
    const source = '😀 ÄÖÜß\r\n' + raw + '\n' + raw;
    assert.ok(checked(source, options).startsWith('😀 ÄÖÜß'));
  }
});
test('bounded nested decoding preserves every raw code unit outside positive phone corridors', () => {
  const prefix = String.raw`😀 ÄÖÜß \(fachlich\) `, suffix = String.raw` \(bleibt\)`;
  for (let depth = 1; depth <= 17; depth++) {
    const slash = String.fromCharCode(92).repeat(depth), raw = '+49' + slash + '(0' + slash + ')301234567';
    const source = prefix + raw + suffix;
    assert.equal(normalizeEncodedIdentifiers(source, value => value, phoneRanges),
      depth <= 16 ? prefix + '+49(0)301234567' + suffix : source);
  }
  const source = prefix + String.raw`+49\(0\)301234567` + suffix + '\r\n' + String.raw`+49\(0\)301234567`;
  assert.equal(normalizeEncodedIdentifiers(source, value => value, phoneRanges),
    prefix + '+49(0)301234567' + suffix + '\r\n+49(0)301234567');
});
test('ordinary math, paths and unknown entities are unchanged without a positive corridor', () => {
  for (const source of [String.raw`f\(x\)`, String.raw`42 \(3+5\)`, String.raw`C:\Temp\Mappe`,
    String.raw`ÄÖÜß \(fachlich\)`, String.raw`&unknown; \(wörtlich\)`, String.raw`\(x\) `.repeat(5000)]) {
    assert.equal(normalizeEncodedIdentifiers(source, value => value, () => []), source);
  }
  const source = String.raw`Text +49\(0\)301234567`;
  assert.equal(normalizeEncodedIdentifiers(source, value => value, () => [{ start: -1, end: 4 }, { start: 2, end: 2 }]), source);
});
test('source locators still refuse shifted coordinates while actual plain spans retain UTF16 positions', () => {
  const raw = String.raw`Kontakt per +49\(0\)301234567 ist möglich.`;
  assert.throws(() => pii.sensitiveSpans(raw, 'general', content), { code: 'SOURCE_EXTRACTION_INVALID' });
  const prefix = '😀 ÄÖÜß\r\nKontakt ', source = prefix + '+49(0)301234567';
  const spans = pii.sensitiveSpans(source, 'general', content).filter(row => row.type === 'PHONE');
  assert.equal(spans.length, 1); assert.equal(spans[0].start, prefix.length);
  assert.equal(source.slice(spans[0].start, spans[0].end), '+49(0)301234567');
});
done();
