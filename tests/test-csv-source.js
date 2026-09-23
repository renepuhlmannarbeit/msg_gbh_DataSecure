'use strict';

const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const {
  parseCsvRows,
  parseCsvDialect,
  csvDelimiter,
  csvToMarkdown,
  parseDocumentBuffer
} = require('../plugins/data-secure/server/document-parser');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');

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

test('dialect selection parses the selected CSV only once', () => {
  const dialect = parseCsvDialect('Name;Rolle\nErika Beispiel;Tester');
  assert.strictEqual(dialect.delimiter, ';');
  assert.deepStrictEqual(dialect.rows, [['Name', 'Rolle'], ['Erika Beispiel', 'Tester']]);
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

test('embedded JSON scalars follow the real CSV conversion and gateway privacy path without losing metadata', () => {
  const payload = {
    email: 'alex.beispiel@example.org', ipv4: '192.0.2.42', ipv6: '2001:db8::42',
    schema: 'network_event_v1', protocol: 'HTTPS', technology: 'Kubernetes',
    standard: 'ISO 27001', attempts: 3, success: true, note: null
  };
  const json = JSON.stringify(payload);
  const source = `Datensatz,Payload\r\nevent-001,"${json.replace(/"/gu, '""')}"\r\n`;
  const bytes = Buffer.from(source, 'utf8');
  const parsed = parseDocumentBuffer(bytes, '.csv');
  const table = '# Tabelleninhalt\n\n| Datensatz | Payload |\n| --- | --- |\n';
  // Conversion alone preserves the original scalar values; JSON remains cell
  // content and does not introduce a new supported input format or parser.
  assert.strictEqual(parsed.markdown, `${table}| event-001 | ${json} |`);
  const redacted = JSON.stringify({ ...payload, email: '[EMAIL_REDACTED]',
    ipv4: '[IP_REDACTED]', ipv6: '[IP_REDACTED]' });
  for (const profile of ['general', 'personnel_profile']) {
    const result = anonymizeMarkdown(parsed.markdown, profile);
    assert.strictEqual(result.text, `${table}| event-001 | ${redacted} |`,
      'only the identifiers change; JSON keys, scalar types and professional content stay exact');
  }
  assert.strictEqual(bytes.toString('utf8'), source, 'the source buffer stays unchanged');
  assert.strictEqual(parsed.markdown, `${table}| event-001 | ${json} |`,
    'anonymization does not mutate the pure-conversion result');
});

test('formula-looking CSV text is inert but still passes through de-identification', () => {
  const parsed = parseDocumentBuffer(Buffer.from([
    'Wert',
    '"=HYPERLINK(\"\"mailto:max.mustermann@example.de\"\",\"\"Max Mustermann\"\")"',
    '"=HYPERLINK(\"\"mailto:erika%2Ebeispiel%40example%2Ede\"\",\"\"Erika Beispiel\"\")"',
    '"=HYPERLINK(\"\"tel:+49 170 1234567\"\",\"\"Erika Beispiel\"\")"',
    '"=HYPERLINK(\"\"sms:+49 160 7654321\"\",\"\"Maria Muster\"\")"',
    '"=HYPERLINK(\"\"callto:+49 30 123456\"\",\"\"Klaus Beispiel\"\")"',
    '"=HYPERLINK(\"\"sip:jana.beispiel%40example%2Ede\"\",\"\"Jana Beispiel\"\")"',
    '"=HYPERLINK(\"\"xmpp:leon.muster%40example%2Ede\"\",\"\"Leon Muster\"\")"'
  ].join('\n')), '.csv');
  const anonymized = pii.anonymize(parsed.markdown, 'personnel_profile').text;
  assertAbsent(anonymized, 'Max Mustermann', 'formula-looking CSV person');
  assertAbsent(anonymized, 'max.mustermann@example.de', 'formula-looking CSV email');
  assertAbsent(anonymized, 'erika%2Ebeispiel%40example%2Ede', 'percent-encoded CSV email');
  assertAbsent(anonymized, 'Erika Beispiel', 'formula-looking CSV phone-contact person');
  assertAbsent(anonymized, '+49 170 1234567', 'formula-looking CSV phone');
  assertAbsent(anonymized, 'Maria Muster', 'formula-looking CSV SMS-contact person');
  assertAbsent(anonymized, '+49 160 7654321', 'formula-looking CSV SMS phone');
  assertAbsent(anonymized, 'Klaus Beispiel', 'formula-looking CSV callto-contact person');
  assertAbsent(anonymized, '+49 30 123456', 'formula-looking CSV callto phone');
  assertAbsent(anonymized, 'Jana Beispiel', 'formula-looking CSV SIP-contact person');
  assertAbsent(anonymized, 'jana.beispiel%40example%2Ede', 'formula-looking CSV SIP address');
  assertAbsent(anonymized, 'Leon Muster', 'formula-looking CSV XMPP-contact person');
  assertAbsent(anonymized, 'leon.muster%40example%2Ede', 'formula-looking CSV XMPP address');
  assertPresent(anonymized, '=HYPERLINK(', 'formula-looking CSV stays literal source');
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
