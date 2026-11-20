'use strict';
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Raw Markdown table cell ownership');
const { scanTableCells, tableCellRanges, unescapeMarkdownPunctuation } = require('../plugins/data-secure/server/privacy/markdown-table-cells');
const entities = require('../plugins/data-secure/server/privacy/entities');
const structured = require('../plugins/data-secure/server/privacy/structured');
const pii = require('../plugins/data-secure/server/pii-engine');
const base = require('../plugins/data-secure/server/privacy/base');
const { sourceIntervals } = require('../plugins/data-secure/server/privacy/source-field-restoration');
const { CONTENT_PERSON_FIELD_POLICY } = require('../plugins/data-secure/server/core/person-field-policy');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const content = { productChannel: 'standalone', contentOptions: { schema: 'datasecure-content-options/1',
  markdownOutput: 'content-v1', scanOcr: false, imageOcr: false }, captureTransformPlan: true };
const slash = String.fromCharCode(92);
test('literal end pipes and non-punctuation backslashes retain their real values', () => {
  const cases = [
    ['| A | B |', ['A', 'B']], ['A | B', ['A', 'B']],
    [String.raw`A | B\|`, ['A', 'B|']], [String.raw`| A | B\| |`, ['A', 'B|']],
    [String.raw`A | C:\Temp\Mappe`, ['A', String.raw`C:\Temp\Mappe`]],
    [String.raw`A | a\Qb`, ['A', String.raw`a\Qb`]], ['A | B' + slash, ['A', 'B' + slash]],
    ['A | |', ['A', '']]
  ];
  for (let count = 0; count <= 6; count++) cases.push(['A | B' + slash.repeat(count) + '|',
    ['A', 'B' + slash.repeat(Math.floor(count / 2)) + (count % 2 ? '|' : '')]]);
  for (const [line, expected] of cases) {
    assert.deepEqual(entities.markdownTableCells(line), expected, line);
    for (const ending of ['\n', '\r\n']) assert.deepEqual(entities.markdownTableColumnValues(
      ['Left | Name', '--- | ---', line].join(ending), /^Name$/u), [expected[1]]);
  }
  assert.equal(entities.markdownTableCells('|'), null);
  assert.deepEqual(entities.markdownTableCells('|', true), ['']);
  assert.equal(entities.markdownTableCells(String.raw`single\|`), null);
  assert.equal(entities.markdownTableCells(String.raw`single\|`, true), null);
  assert.deepEqual(entities.markdownTableCells(String.raw`| B\| |`, true), ['B|']);
});
test('raw ranges agree with independent backward parity and preserve duplicate UTF16 positions', () => {
  const expected = line => {
    const pipes = [];
    for (let at = 0; at < line.length; at++) if (line[at] === '|') {
      let backslashes = 0;
      for (let before = at - 1; before >= 0 && line[before] === slash; before--) backslashes++;
      if (backslashes % 2 === 0) pipes.push(at);
    }
    const cuts = [-1, ...pipes, line.length], ranges = [];
    for (let index = 1; index < cuts.length; index++) ranges.push({ start: cuts[index - 1] + 1, end: cuts[index] });
    if (pipes[0] === line.length - line.trimStart().length) ranges.shift();
    if ((pipes.at(-1) ?? -1) === line.trimEnd().length - 1) ranges.pop();
    return ranges;
  };
  const alphabet = ['x', '|', slash, ' '];
  let rows = [''];
  for (let length = 0; length <= 6; length++) {
    for (const line of rows) assert.deepEqual(tableCellRanges(line), expected(line), JSON.stringify(line));
    rows = rows.flatMap(line => alphabet.map(character => line + character));
  }
  const line = String.raw`😀 ÄÖÜß | gleich\| | gleich\|`;
  const ranges = tableCellRanges(line);
  assert.deepEqual(ranges.map(range => line.slice(range.start, range.end).trim()), ['😀 ÄÖÜß', String.raw`gleich\|`, String.raw`gleich\|`]);
  assert.notEqual(ranges[1].start, ranges[2].start);
  let visits = 0; const facts = scanTableCells(line, () => visits++);
  assert.equal(visits, 3); assert.equal(facts.count, 3); assert.equal(facts.trailingPipe, false);
});
test('only the closed ASCII punctuation set is decoded, never letters or language characters', () => {
  for (let code = 0x21; code <= 0x7e; code++) {
    const character = String.fromCharCode(code), punctuation = /[^a-z0-9]/iu.test(character);
    assert.equal(unescapeMarkdownPunctuation(slash + character), punctuation ? character : slash + character);
  }
  for (const text of [String.raw`C:\Temp\Mappe`, String.raw`Ä\Ö\Ü\ß`, String.raw`\u0041`, String.raw`\Anna\Berger`])
    assert.equal(unescapeMarkdownPunctuation(text), text);
});
test('credential end-pipe values retain complete raw spans under LF and CRLF', () => {
  for (const ending of ['\n', '\r\n']) for (let count = 0; count <= 5; count++) {
    const value = 'secret' + slash.repeat(count) + '|';
    const source = ['😀 Fachtext', 'Left | Passwort', '--- | ---', 'q | ' + value].join(ending);
    const expected = 'secret' + slash.repeat(count);
    const start = source.lastIndexOf('secret'), end = start + expected.length + (count % 2);
    const spans = structured.findStructuredSpans(source).filter(row => row.type === 'CREDENTIAL');
    assert.ok(spans.some(row => row.start === start && row.end === end && row.text === source.slice(start, end)));
    const actual = pii.anonymize(source, 'general', content);
    assert.ok(!actual.text.includes('secret'));
    assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, content), []);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  }
});
test('actual field consumers cannot invent identities or convert literal end pipes into structural columns', () => {
  for (const ending of ['\n', '\r\n']) {
    const source = ['Left | Unternehmen', '--- | ---', String.raw`q | Nordlicht GmbH\|`].join(ending);
    for (const options of [{}, content]) {
      const actual = pii.anonymize(source, 'general', options);
      assert.ok(!actual.text.includes('Nordlicht'));
      assert.equal(entities.markdownTableCells(actual.text.split(/\r?\n/u).at(-1)).length, 2);
      assert.ok(actual.dictionary.every(row => !String(row.value || '').endsWith(slash)));
      assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, options), []);
    }
    for (const [label, raw, phantom] of [['Name', String.raw`Anna\Berger`, 'AnnaBerger'],
      ['Unternehmen', String.raw`Nord\licht GmbH`, 'Nordlicht GmbH']]) {
      const text = ['Left | ' + label, '--- | ---', 'q | ' + raw].join(ending);
      const actual = pii.anonymize(text, 'general', content);
      assert.ok(!actual.dictionary.some(row => row.value === phantom));
      assert.ok(!actual.text.includes(raw));
    }
  }
});
test('restoration binds each duplicate raw field independently and factual paths stay unchanged', () => {
  const value = String.raw`Qvx\|`, source = '😀 Technik\r\nLeft | Name\r\n--- | ---\r\nq | ' + value + '\r\nq | ' + value;
  const ranges = sourceIntervals(source, CONTENT_PERSON_FIELD_POLICY);
  for (const index of [source.indexOf(value), source.lastIndexOf(value)])
    assert.ok(ranges.some(range => range.start <= index && range.end >= index + value.length));
  const factual = 'Left | Fachtext\n--- | ---\nq | ' + String.raw`C:\Temp\Mappe`;
  assert.equal(pii.anonymize(factual, 'general', content).text, factual);
});
test('known table bodies retain single-cell ownership and sensitive width failures stay hard', () => {
  for (const ending of ['\n', '\r\n']) for (const raw of [String.raw`|Qvx\|`, String.raw`|Qvx\\\|`, 'Qvx|']) {
    const source = ['|Name|', '|---|', raw].join(ending);
    assert.deepEqual(base.tableHeadersAt(source, source.indexOf('Qvx'), CONTENT_PERSON_FIELD_POLICY).headers, ['Name']);
    const actual = pii.anonymize(source, 'general', content);
    assert.ok(!actual.text.includes('Qvx'));
    assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, content), []);
    for (const rows of [['|Name|Fachtext|', '|---|---|', raw], ['|Name|', '|---|---|', raw]]) {
      const malformed = rows.join(ending);
      assert.equal(base.hasAmbiguousSensitiveTable(malformed, CONTENT_PERSON_FIELD_POLICY), true);
      assert.throws(() => pii.anonymize(malformed, 'general', content), { code: 'RESIDUAL_PII' });
    }
  }
  for (const raw of [String.raw`|Qvx\|`, String.raw`Qvx\|`, 'Qvx|'])
    assert.equal(base.tableHeadersAt(raw, raw.indexOf('Qvx'), CONTENT_PERSON_FIELD_POLICY), null);
  const factual = String.raw`|Fachtext|
|---|
|FHIR\|`;
  assert.equal(pii.anonymize(factual, 'general', content).text, factual);
});
done();
