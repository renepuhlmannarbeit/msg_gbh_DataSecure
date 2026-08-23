'use strict';

const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const {
  decodeUtf8Source,
  parseDocumentBuffer
} = require('../plugins/data-secure/server/document-parser');
const { validateContentGraph } = require('../plugins/data-secure/server/content-graph');
const pii = require('../plugins/data-secure/server/pii-engine');

const { test, done, assert } = createSuite('Text and Markdown source contract');

test('UTF-8 BOM is removed and line endings plus Unicode are normalized', () => {
  const source = Buffer.concat([
    Buffer.from([0xEF, 0xBB, 0xBF]),
    Buffer.from('# A\u0308rger\r\n\rZeile', 'utf8')
  ]);
  const parsed = parseDocumentBuffer(source, '.md');
  assert.strictEqual(parsed.markdown, '# Ärger\n\nZeile');
});

test('malformed UTF-8 fails instead of inserting a replacement character', () => {
  assert.throws(() => decodeUtf8Source(Buffer.from([0x61, 0xC3, 0x28])), /TEXT_ENCODING_INVALID/);
  assert.throws(() => decodeUtf8Source(Buffer.from([0xED, 0xA0, 0x80])), /TEXT_ENCODING_INVALID/);
});

test('invisible terminal controls and NUL fail closed while tab and newlines remain valid', () => {
  assert.throws(() => decodeUtf8Source(Buffer.from('alpha\u0000beta')), /TEXT_CONTROL_INVALID/);
  assert.throws(() => decodeUtf8Source(Buffer.from('alpha\u001bbeta')), /TEXT_CONTROL_INVALID/);
  assert.strictEqual(decodeUtf8Source(Buffer.from('alpha\tbeta\n')), 'alpha\tbeta\n');
});

test('CommonMark and GFM-shaped professional structure is preserved literally', () => {
  const source = [
    '# Profil', '', '> Product Owner', '',
    '- **Scrum**', '- `Java`', '',
    '| Rolle | Erfahrung |', '| --- | ---: |', '| Tester | 8 Jahre |', '',
    '```text', 'Zertifizierung: PSM I', '```', '',
    '[Portfolio](https://example.invalid/profil)', '',
    '![Lokales Diagramm](assets/skills.png)'
  ].join('\n');
  assert.strictEqual(parseDocumentBuffer(Buffer.from(source), '.md').markdown, source);
});

test('raw HTML, frontmatter and remote links stay inert literal source', () => {
  const source = [
    '---', 'title: Profil', '---',
    '<script>fetch("https://example.invalid/leak")</script>',
    '<https://example.invalid/a>',
    '![remote](https://example.invalid/image.png)'
  ].join('\n');
  const parsed = parseDocumentBuffer(Buffer.from(source), '.md');
  assert.strictEqual(parsed.markdown, source);
  assert.deepStrictEqual(parsed.attachments, []);
  assert.deepStrictEqual(parsed.warnings, []);
});

test('PII inside Markdown text and destinations remains subject to de-identification', () => {
  const source = '## Profil\n\nName: Max Mustermann\n\n[Kontakt](mailto:max.mustermann@example.de)';
  const parsed = parseDocumentBuffer(Buffer.from(source), '.md');
  const anonymized = pii.anonymize(parsed.markdown, 'personnel_profile').text;
  assertAbsent(anonymized, 'Max Mustermann', 'Markdown person');
  assertAbsent(anonymized, 'max.mustermann@example.de', 'Markdown e-mail');
  assertPresent(anonymized, '## Profil', 'heading');
  assertPresent(anonymized, '[Kontakt](mailto:', 'link structure');
});

test('the complete normalized Markdown is covered by one validated graph', () => {
  const parsed = parseDocumentBuffer(Buffer.from('# Titel\n\nText\tmit Tabelle | Wert'), '.md');
  assert.strictEqual(validateContentGraph(parsed.content_graph, parsed.markdown, []), parsed.content_graph);
  assert.strictEqual(parsed.content_graph.nodes.length, 1);
  assert.deepStrictEqual(parsed.content_graph.nodes[0].locator.selector, {
    type: 'TextPositionSelector', start: 0, end: parsed.markdown.length
  });
});

test('large valid Markdown is deterministic and remains within the shared parser path', () => {
  const source = `${'# Abschnitt\n\n- Rolle: Entwickler\n'.repeat(30_000)}Ende`;
  const first = parseDocumentBuffer(Buffer.from(source), '.md');
  const second = parseDocumentBuffer(Buffer.from(source), '.md');
  assert.strictEqual(first.markdown, source);
  assert.deepStrictEqual(second, first);
});

done();
