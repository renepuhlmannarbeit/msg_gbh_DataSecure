'use strict';

const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const {
  parseCsvRows,
  csvDelimiter,
  csvToMarkdown,
  parseDocumentBuffer
} = require('../plugins/data-secure/server/document-parser');
const pii = require('../plugins/data-secure/server/pii-engine');

const { test, done, assert } = createSuite('CSV source contract');

test('RFC-4180 quotes, doubled quotes and multiline fields become one Markdown table', () => {
  const source = 'Name,Notiz\n"Max Mustermann","Zeile 1\nZeile ""2"""';
  const markdown = csvToMarkdown(source);
  assert.match(markdown, /^# Tabelleninhalt/m);
  assert.match(markdown, /Max Mustermann/);
  assert.match(markdown, /Zeile 1<br>Zeile "2"/);
  assert.deepStrictEqual(parseCsvRows(source, ','), [
    ['Name', 'Notiz'], ['Max Mustermann', 'Zeile 1\nZeile "2"']
  ]);
});

test('German semicolon and tab dialects are detected from consistent records', () => {
  assert.strictEqual(csvDelimiter('Name;Rolle\nErika Beispiel;Tester'), ';');
  assert.strictEqual(csvDelimiter('Name\tRolle\nErika Beispiel\tTester'), '\t');
  assert.match(csvToMarkdown('Name;Rolle\nErika Beispiel;Tester'), /\| Name \| Rolle \|/);
});

test('ambiguous multi-column dialects and inconsistent widths fail closed', () => {
  assert.throws(() => csvDelimiter('eins,zwei;drei'), /CSV_DELIMITER_AMBIGUOUS/);
  assert.throws(() => csvToMarkdown('A,B\n1,2,3'), /CSV_ROW_WIDTH_INVALID/);
});

test('unclosed, misplaced and trailing quote text fails instead of being guessed', () => {
  for (const source of ['A,B\n"eins,zwei', 'A,B\neins"zwei,ok', 'A,B\n"eins"x,ok']) {
    assert.throws(() => csvToMarkdown(source), /CSV_QUOTE_INVALID/);
  }
});

test('empty and duplicate headers become stable visible column names', () => {
  const markdown = csvToMarkdown(',Name,Name\n1,Erika,Max');
  assert.match(markdown, /\| Spalte 1 \| Name \| Name \(2\) \|/);
});

test('formula-looking cells remain literal Markdown text and never become spreadsheet output', () => {
  const markdown = csvToMarkdown('Wert\n=SUM(A1:A2)\n+1\n-2\n@cmd');
  for (const value of ['=SUM(A1:A2)', '+1', '-2', '@cmd']) assertPresent(markdown, value, 'formula-looking value');
  assert.doesNotMatch(markdown, /```csv|\.xlsx|formula=/iu);
});

test('PII in headers and cells remains visible to the normal de-identification pass', () => {
  const parsed = parseDocumentBuffer(Buffer.from('Kontakt,E-Mail\nMax Mustermann,max@example.de'), '.csv');
  const anonymized = pii.anonymize(parsed.markdown, 'customer').text;
  assertAbsent(anonymized, 'Max Mustermann', 'CSV name');
  assertAbsent(anonymized, 'max@example.de', 'CSV email');
  assertPresent(anonymized, '# Tabelleninhalt', 'table heading');
});

test('UTF-8 decoding and graph coverage are shared with text sources', () => {
  assert.throws(() => parseDocumentBuffer(Buffer.from([0xC3, 0x28]), '.csv'), /TEXT_ENCODING_INVALID/);
  const parsed = parseDocumentBuffer(Buffer.from('A,B\r\nÄrger,Übung'), '.csv');
  assert.strictEqual(parsed.content_graph.nodes[0].kind, 'table');
  assert.strictEqual(parsed.content_graph.nodes[0].locator.selector.end, parsed.markdown.length);
});

test('large CSV conversion is deterministic without a runtime dependency', () => {
  const source = `A,B,C\n${'1,2,3\n'.repeat(40_000)}`;
  assert.strictEqual(csvToMarkdown(source), csvToMarkdown(source));
});

done();
