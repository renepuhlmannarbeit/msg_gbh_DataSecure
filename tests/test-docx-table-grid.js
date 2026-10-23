'use strict';

// Synthetic in-memory WordprocessingML. No user documents, native Word,
// installed Office, filesystem converter, OCR, network or GUI are involved.
const { createSuite } = require('./helpers');
const { reviewDocx, paragraph: p } = require('./lib/docx-review-fixtures');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const pii = require('../plugins/data-secure/server/pii-engine');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CheckpointStream } = require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const { test, testAsync, done, assert } = createSuite('DOCX logical table grid');
const tc = (text, properties = '', raw = false) => `<w:tc>${properties ? `<w:tcPr>${properties}</w:tcPr>` : ''}${raw ? text : p(text)}</w:tc>`;
const tr = (cells, properties = '') => `<w:tr>${properties ? `<w:trPr>${properties}</w:trPr>` : ''}${cells.join('')}</w:tr>`;
const tbl = (rows, columns = 0) => `<w:tbl>${columns ? `<w:tblGrid>${'<w:gridCol w:w="1000"/>'.repeat(columns)}</w:tblGrid>` : ''}${rows.join('')}</w:tbl>`;
const span = value => `<w:gridSpan w:val="${value}"/>`;
const vertical = value => value === undefined ? '<w:vMerge/>' : `<w:vMerge w:val="${value}"/>`;
const horizontal = value => value === undefined ? '<w:hMerge/>' : `<w:hMerge w:val="${value}"/>`;
const parse = (body, options = {}) => parseOoxml(reviewDocx(body), '.docx', undefined, options);
const reject = (body, code = 'DOCX_STRUCTURE_UNSAFE') => {
  assert.throws(() => parse(body), error => {
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /SECRET|Anna|Berger|Steuer|word\//u);
    return true;
  });
};
const once = (text, token) => assert.equal(text.split(token).length - 1, 1, token);

test('horizontal span preserves logical columns and every text leaf exactly once', () => {
  const result = parse(tbl([
    tr([tc('IDENTITÄT', span('2')), tc('KONTAKT')], '<w:tblHeader/>'),
    tr([tc('Anna'), tc('Berger'), tc('anna@example.invalid')])
  ], 3));
  assert.deepEqual(result.warnings, ['OFFICE_TABLE_CONTEXT_UNVERIFIED']);
  assert.match(result.markdown, /Zeile 1 \(Kopfzeile\):\n- Spalten 1–2: IDENTITÄT\n- Spalte 3: KONTAKT/u);
  assert.match(result.markdown, /Zeile 2:\n- Spalte 1: Anna\n- Spalte 2: Berger\n- Spalte 3: anna@example.invalid/u);
  for (const value of ['IDENTITÄT', 'KONTAKT', 'Anna', 'Berger', 'anna@example.invalid']) once(result.markdown, value);
});

test('gridSpan augments an underspecified grid, without moving the following cell', () => {
  const result = parse(tbl([tr([tc('WIDE', span('3')), tc('FOLLOWING')])], 2));
  assert.match(result.markdown, /\(4 Spalten\)/u);
  assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–3; Tabellenspalte 2 = Spalte 4/u);
  assert.match(result.markdown, /\| WIDE \| FOLLOWING \|/u);
});

test('valid decimal XML spellings are decoded, bounded and equivalent', () => {
  for (const value of ['2', '002', '+2', ' 2 ', '&#50;']) {
    const result = parse(tbl([tr([tc('ALPHA', span(value)), tc('OMEGA')])]));
    assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3/u);
    assert.match(result.markdown, /\| ALPHA \| OMEGA \|/u);
  }
});

test('vertical merge restarts and both continuation spellings retain their exact owner', () => {
  const result = parse(tbl([
    tr([tc('LABEL', vertical('restart')), tc('VALUE_A')]),
    tr([tc('', vertical()), tc('VALUE_B')]),
    tr([tc('CONTINUATION_TEXT', vertical('continue')), tc('VALUE_C')]),
    tr([tc('NEXT_LABEL'), tc('VALUE_D')])
  ], 2));
  assert.match(result.markdown, /Zeile 2:\n- Spalte 1 \(verbunden mit Zeile 1\): \n- Spalte 2: VALUE_B/u);
  assert.match(result.markdown, /Zeile 3:\n- Spalte 1 \(verbunden mit Zeile 1\): CONTINUATION_TEXT/u);
  assert.match(result.markdown, /Zeile 4:\n- Spalte 1: NEXT_LABEL/u);
  for (const value of ['LABEL', 'VALUE_A', 'VALUE_B', 'VALUE_C', 'VALUE_D', 'CONTINUATION_TEXT']) {
    // LABEL also occurs in NEXT_LABEL; its first row is checked separately.
    if (value !== 'LABEL') once(result.markdown, value);
  }
});

test('horizontal and vertical spans share the exact same range in every continued row', () => {
  const result = parse(tbl([
    tr([tc('OWNER', span('2') + vertical('restart')), tc('A')]),
    tr([tc('', span('2') + vertical()), tc('B')]),
    tr([tc('NEW', span('2') + vertical('restart')), tc('C')]),
    tr([tc('', span('2') + vertical()), tc('D')])
  ], 3));
  assert.match(result.markdown, /Zeile 2:\n- Spalten 1–2 \(verbunden mit Zeile 1\)/u);
  assert.match(result.markdown, /Zeile 4:\n- Spalten 1–2 \(verbunden mit Zeile 3\)/u);
  once(result.markdown, 'OWNER'); once(result.markdown, 'NEW');
});

test('skipped leading/trailing grid columns remain explicit instead of shifting values', () => {
  const result = parse(tbl([
    tr([tc('FIRST'), tc('SECOND'), tc('THIRD'), tc('FOURTH')]),
    tr([tc('MIDDLE')], '<w:gridBefore w:val="1"/><w:gridAfter w:val="2"/>')
  ], 4));
  assert.match(result.markdown, /Zeile 2:\n- Spalte 2: MIDDLE/u);
  assert.doesNotMatch(result.markdown, /Spalte 1: MIDDLE/u);
});

test('ordinary tables with declared grid retain aligned trailing empty cells', () => {
  assert.equal(parse(tbl([tr([tc('ALPHA')])], 3)).markdown,
    '| ALPHA |  |  |\n| --- | --- | --- |');
});

test('nested merged tables have independent vertical owners and preserve outer cell order', () => {
  const nested = tbl([
    tr([tc('INNER_OWNER', span('2') + vertical('restart')), tc('INNER_VALUE')]),
    tr([tc('', span('2') + vertical()), tc('INNER_NEXT')])
  ], 3);
  const result = parse(tbl([tr([tc(p('OUTER_BEFORE') + nested + p('OUTER_AFTER'), span('2'), true), tc('OUTER_RIGHT')])], 3));
  const values = ['OUTER_BEFORE', 'INNER_OWNER', 'INNER_VALUE', 'INNER_NEXT', 'OUTER_AFTER', 'OUTER_RIGHT'];
  let previous = -1;
  for (const value of values) {
    const current = result.markdown.indexOf(value); assert.ok(current > previous); previous = current; once(result.markdown, value);
  }
  assert.match(result.markdown, /verbunden mit Zeile 1/u);
});

test('unsupported Choice properties cannot affect the selected fallback grid', () => {
  const properties = '<mc:AlternateContent><mc:Choice Requires="vendor"><w:gridSpan w:val="9999999999"/>' +
    '<w:vMerge/></mc:Choice><mc:Fallback><w:gridSpan w:val="2"/></mc:Fallback></mc:AlternateContent>';
  const result = parse(tbl([tr([tc('SELECTED', properties), tc('RIGHT')])], 3));
  assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3/u);
  assert.match(result.markdown, /\| SELECTED \| RIGHT \|/u);
});

test('supported Choice is selected once without applying fallback span or text', () => {
  const body = '<mc:AlternateContent><mc:Choice Requires="wps">' + tbl([tr([tc('CHOICE', span('2')), tc('RIGHT')])], 3) +
    '</mc:Choice><mc:Fallback>' + tbl([tr([tc('FALLBACK', span('3'))])], 3) + '</mc:Fallback></mc:AlternateContent>';
  const result = parse(body); once(result.markdown, 'CHOICE'); assert.doesNotMatch(result.markdown, /FALLBACK/u);
});

test('namespace aliases and Strict WordprocessingML retain their grid semantics', () => {
  const body = tbl([tr([tc('ÄÖÜ ß Ελληνικά 中文 😀', span('2')), tc('RECHTS')])], 3);
  for (const namespace of ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']) {
    const result = parseOoxml(reviewDocx(body, { prefix: 'other', namespace }), '.docx');
    assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3/u);
    assert.match(result.markdown, /\| ÄÖÜ ß Ελληνικά 中文 😀 \| RECHTS \|/u);
  }
});

test('preserveText and content-v1 retain Unicode/whitespace/escapes in source cells', () => {
  const source = reviewDocx(tbl([tr([tc('  ÄÖÜ ß 😀 A|B\\C  ', span('2')), tc('Ω')])], 3));
  const preserved = parseOoxml(source, '.docx', undefined, { preserveText: true }).markdown;
  assert.ok(preserved.includes('&#32;&#32;ÄÖÜ ß 😀 A\\|B\\\\C&#32;&#32;'));
  const content = extractMarkdownBuffer(source, '.docx', { markdownOutput: 'content-v1' });
  assert.match(content.markdown, /ÄÖÜ ß 😀 A\\\|B\\\\C/u);
  assert.match(content.markdown, /Tabellenspalte 2 = Spalte 3/u);
  assert.match(content.markdown, / \| Ω \|/u);
});

test('merged cell source contacts reach anonymization, ordinary qualifications survive', () => {
  const qualification = 'HL7 FHIR und Testautomatisierung';
  const result = parse(tbl([
    tr([tc('Name: Max Mustermann', span('2')), tc('Kontakt: max.mustermann@example.org')]),
    tr([tc(qualification), tc('Name: Erika Beispiel'), tc('Kontakt: erika.beispiel@example.org')])
  ], 3));
  const anonymous = pii.anonymize(result.markdown, 'personnel_profile').text;
  for (const value of ['Max Mustermann', 'max.mustermann@example.org', 'Erika Beispiel', 'erika.beispiel@example.org']) {
    assert.ok(result.markdown.includes(value)); assert.ok(!anonymous.includes(value), value);
  }
  assert.ok(anonymous.includes(qualification));
});

test('content mode omits only whitespace-only Word paragraphs, never source-bearing indentation', () => {
  const body = p('BEFORE') + '<w:p/>' + p('   ') + '<w:p><w:r><w:tab/><w:tab/></w:r></w:p>' + p('  CODE  ') + p('AFTER');
  const legacy = parse(body, { preserveText: true }).markdown;
  assert.match(legacy, /&#9;/u);
  const content = parse(body, { preserveText: true, contentMode: true }).markdown;
  assert.equal(content, 'BEFORE\n\n&#32;&#32;CODE&#32;&#32;\n\nAFTER');
  assert.equal(parse(tbl([tr([tc('   ', span('2')), tc('VALUE')])]), { preserveText: true, contentMode: true }).markdown,
    'Logische Spaltenbereiche (3 Spalten): Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3\n\n' +
    '| Spalte 1 | Spalte 2 |\n| --- | --- |\n|  | VALUE |');
});

test('uniform horizontal spans retain physical header/value binding without duplicating source text', () => {
  const result = parse(tbl([
    tr([tc('Name', span('2')), tc('Fachtext')], '<w:tblHeader/>'),
    tr([tc('Qvx', span('2')), tc('FHIR')])
  ], 3), { preserveText: true, contentMode: true });
  assert.equal(result.markdown, 'Logische Spaltenbereiche (3 Spalten): Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3\n\n' +
    '| Name | Fachtext |\n| --- | --- |\n| Qvx | FHIR |');
  for (const value of ['Name', 'Fachtext', 'Qvx', 'FHIR']) once(result.markdown, value);
});

test('different horizontal partitions, offsets and vertical merges never become an inferred GFM partition', () => {
  for (const body of [
    tbl([tr([tc('Name', span('2')), tc('Fachtext')]), tr([tc('Qvx'), tc('FHIR', span('2'))])], 3),
    tbl([tr([tc('Name', span('2'))], '<w:gridBefore w:val="1"/>'), tr([tc('Qvx', span('2'))], '<w:gridBefore w:val="1"/>')], 3),
    tbl([tr([tc('Name', span('2'))]), tr([tc('Qvx', span('2'))])], 3),
    tbl([tr([tc('Name', span('2') + vertical('restart')), tc('Fachtext')]),
      tr([tc('', span('2') + vertical()), tc('FHIR')])], 3)
  ]) {
    const result = parse(body, { preserveText: true, contentMode: true });
    assert.match(result.markdown, /^Tabelle als Zellabschnitte/u);
    assert.doesNotMatch(result.markdown, /Logische Spaltenbereiche/u);
    assert.ok(result.warnings.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  }
});

testAsync('actual uniform gridSpan DOCX reaches bound source privacy and residual protection for short Name values', async () => {
  const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const contract = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
  for (const header of [false, true]) {
    const bytes = reviewDocx(tbl([
      tr([tc('Name', span('2')), tc('Fachtext')], header ? '<w:tblHeader/>' : ''),
      tr([tc('Qvx', span('2')), tc('FHIR')])
    ], 3)), before = Buffer.from(bytes);
    const converted = extractMarkdownBuffer(bytes, '.docx', { markdownOutput: 'content-v1', partialExtraction: true });
    const bound = await extractSourceForPrivacy(bytes, '.docx', { contentOptions: contract,
      convertBuffer: async () => createMarkdownExtraction({ source_type: 'docx', markdown: converted.markdown,
        coverage: converted.coverage, content_options: contract }) });
    assert.deepEqual(bytes, before);
    assert.match(bound.markdown, /\| Name \| Fachtext \|/u);
    assert.equal(bound.markdown.split('Name').length - 1, 1, 'no copied source header');
    const result = anonymizeMarkdown(bound.markdown, 'general', { productChannel: 'standalone', contentOptions: contract });
    assert.ok(!result.text.includes('Qvx')); assert.ok(result.text.includes('[PERSON_'));
    assert.ok(result.text.includes('FHIR')); assert.ok(result.entityCount >= 1); assert.equal(result.passes, 1);
  }
});

testAsync('content nested grids normalize and protect fields; legacy notes keep the old refusal', async () => {
  const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const strict of [false, true]) {
    const contract = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: false };
    for (const innerMerged of [false, true]) for (const outerMerged of [false, true]) {
      const inner = tbl([tr([tc('Name', innerMerged ? span('2') : ''), tc('Fachtext')]),
        tr([tc('Qvx', innerMerged ? span('2') : ''), tc('FHIR')])], innerMerged ? 3 : 2);
      const body = tbl([tr([tc(p('VORHER') + inner + p('NACHHER'), outerMerged ? span('3') : '', true)])], outerMerged ? 3 : 1);
      const bytes = reviewDocx(body, strict ? { prefix: 'q', namespace: 'http://purl.oclc.org/ooxml/wordprocessingml/main' } : {});
      const before = Buffer.from(bytes);
      const converted = extractMarkdownBuffer(bytes, '.docx', { markdownOutput, partialExtraction: true });
      assert.equal(converted.coverage.reason_codes.includes('OFFICE_TABLE_CONTEXT_UNVERIFIED'),markdownOutput==='notes-v1');
      for (const value of ['Qvx', 'FHIR', 'VORHER', 'NACHHER']) once(converted.markdown, value);
      if(markdownOutput==='notes-v1')once(converted.markdown,'Name');
      else assert.equal((converted.markdown.match(/\| --- \|\n\| Name \|/gu)||[]).length,1,'one original header payload');
      assert.ok(converted.markdown.indexOf('VORHER') < converted.markdown.indexOf('Name'));
      assert.ok(converted.markdown.indexOf('Qvx') < converted.markdown.indexOf('NACHHER'));
      let conversions = 0;
      const operation=extractSourceForPrivacy(bytes, '.docx', { contentOptions: contract, convertBuffer: async input => {
        conversions++; assert.deepEqual(input, before);
        // Transport binding only: source parsing and coverage are actual, not
        // a handwritten Markdown/coverage stand-in for the broken sequence.
        const actual = extractMarkdownBuffer(input, '.docx', { markdownOutput, partialExtraction: true });
        return createMarkdownExtraction({ source_type: 'docx', markdown: actual.markdown,
          coverage: actual.coverage, content_options: contract });
      } });
      if(markdownOutput==='notes-v1')await assert.rejects(operation,error => error.code === 'PARSER_COVERAGE_UNVERIFIED' && !/Qvx|VORHER|NACHHER/u.test(error.message));
      else{
        const source=await operation;
        const actual=require('../plugins/data-secure/server/gateway/compliance').anonymizeMarkdown(source.markdown,'general',{productChannel:'standalone',contentOptions:contract});
        assert.doesNotMatch(actual.text,/Qvx/u);assert.match(actual.text,/FHIR/u);
        assert.match(actual.text,/VORHER/u);assert.match(actual.text,/NACHHER/u);
      }
      assert.equal(conversions, 1); assert.deepEqual(bytes, before);
    }
  }
});

testAsync('actual top-level simple and uniform DOCX controls still protect short Name values without a nested-context refusal', async () => {
  const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const merged of [false, true]) {
    const contract = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: false };
    const bytes = reviewDocx(tbl([tr([tc('Name', merged ? span('2') : ''), tc('Fachtext')]),
      tr([tc('Qvx', merged ? span('2') : ''), tc('FHIR')])], merged ? 3 : 2)), before = Buffer.from(bytes);
    const bound = await extractSourceForPrivacy(bytes, '.docx', { contentOptions: contract, convertBuffer: async input => {
      const actual = extractMarkdownBuffer(input, '.docx', { markdownOutput, partialExtraction: true });
      assert.ok(!actual.coverage.reason_codes.includes('OFFICE_TABLE_CONTEXT_UNVERIFIED'));
      return createMarkdownExtraction({ source_type: 'docx', markdown: actual.markdown,
        coverage: actual.coverage, content_options: contract });
    } });
    const anonymous = anonymizeMarkdown(bound.markdown, 'general', { productChannel: 'standalone', contentOptions: contract });
    assert.ok(!anonymous.text.includes('Qvx')); assert.ok(anonymous.text.includes('[PERSON_'));
    assert.ok(anonymous.text.includes('FHIR')); assert.equal(anonymous.passes, 1); assert.deepEqual(bytes, before);
  }
});

for (const value of ['0', '-1', '1.5', '1e2', '', 'garbage']) {
  test(`invalid gridSpan ${JSON.stringify(value)} fails without content leakage`, () => reject(tbl([tr([tc('SECRET', span(value))])])));
}
for (const value of ['1025', '9999999999999999999999999999']) {
  test(`oversized gridSpan ${value} is a resource failure`, () => reject(tbl([tr([tc('SECRET', span(value))])]), 'DOCX_STRUCTURE_LIMIT'));
}
test('missing span attribute and unknown vertical value fail closed', () => {
  reject(tbl([tr([tc('SECRET', '<w:gridSpan/>')])]));
  reject(tbl([tr([tc('SECRET', '<w:vMerge w:val="invalid"/>')])]));
});
test('unmatched or mismatched vertical continuation cannot adopt another label', () => {
  reject(tbl([tr([tc('SECRET', vertical())])]));
  reject(tbl([tr([tc('OWNER', span('2') + vertical('restart'))]), tr([tc('SECRET', vertical())])], 2));
  reject(tbl([tr([tc('OWNER', vertical('restart')), tc('OTHER')]), tr([tc('OTHER'), tc('SECRET', vertical())])], 2));
  reject(tbl([tr([tc('OWNER', vertical('restart'))]), tr([tc('BREAK')]), tr([tc('SECRET', vertical())])]));
});
test('vertical continuation cannot cross a table or adopt a nested table owner', () => {
  reject(tbl([tr([tc('OWNER', vertical('restart'))])]) + tbl([tr([tc('SECRET', vertical())])]));
  reject(tbl([tr([tc(tbl([tr([tc('OWNER', vertical('restart'))])]), '', true)]), tr([tc('SECRET', vertical())])]));
});
test('duplicate properties, invalid owners and non-leaf properties fail closed', () => {
  for (const properties of [span('2') + span('2'), vertical('restart') + vertical('restart'), '<w:gridSpan w:val="2"><w:p/></w:gridSpan>']) {
    reject(tbl([tr([tc('SECRET', properties)])]));
  }
  reject(span('2') + p('SECRET'));
  reject(tbl([tr([`<w:tc>${span('2')}${p('SECRET')}</w:tc>`])]));
  reject(tbl([tr([`<w:tc><w:tcPr>${span('2')}</w:tcPr><w:tcPr>${span('2')}</w:tcPr>${p('SECRET')}</w:tc>`])]));
  reject(tbl([tr([tc('SECRET')], '<w:gridBefore w:val="1"/><w:gridBefore w:val="2"/>')]));
});
test('legacy horizontal restart and both continuation spellings preserve one logical owner', () => {
  for (const continuation of [undefined, 'continue']) {
    const result = parse(tbl([tr([tc('LEFT'), tc('MERGED', horizontal('restart')),
      tc('', horizontal(continuation)), tc('RIGHT')])], 4), { preserveText: true, contentMode: true });
    assert.ok(!result.warnings.includes('OFFICE_TABLE_CONTEXT_UNVERIFIED'));
    assert.match(result.markdown, /Tabellenspalte 1 = Spalte 1; Tabellenspalte 2 = Spalten 2–3; Tabellenspalte 3 = Spalte 4/u);
    assert.match(result.markdown, /\| LEFT \| MERGED \| RIGHT \|/u);
    for (const value of ['LEFT', 'MERGED', 'RIGHT']) once(result.markdown, value);
  }
});

test('horizontal group closure, adjacent restarts and singleton restart do not steal other cells', () => {
  const body = tbl([tr([tc('FIRST', horizontal('restart')), tc('', horizontal()),
    tc('SECOND', horizontal('restart')), tc('', horizontal()), tc('ORDINARY'), tc('SINGLE', horizontal('restart'))])], 6);
  const result = parse(body, { preserveText: true, contentMode: true });
  assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalten 3–4; Tabellenspalte 3 = Spalte 5; Tabellenspalte 4 = Spalte 6/u);
  assert.match(result.markdown, /\| FIRST \| SECOND \| ORDINARY \| SINGLE \|/u);
  for (const value of ['FIRST', 'SECOND', 'ORDINARY', 'SINGLE']) once(result.markdown, value);
});

test('each physical horizontal member consumes its own gridSpan and retains nonempty source payload', () => {
  const result = parse(tbl([tr([tc('ORIGIN', span('2') + horizontal('restart')),
    tc('CONTINUATION', span('3') + horizontal()), tc('FOLLOWING')])], 2), { preserveText: true, contentMode: true });
  assert.ok(result.warnings.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.match(result.markdown, /^Tabelle als Zellabschnitte \(6 logische Spalten\)/u);
  assert.match(result.markdown, /Zeile 1 · Spalten 1–5\n\n\| Inhalt \|\n\| --- \|\n\| ORIGIN<br>CONTINUATION \|/u);
  assert.match(result.markdown, /Zeile 1 · Spalte 6/u);
  for (const value of ['ORIGIN', 'CONTINUATION', 'FOLLOWING']) once(result.markdown, value);
});

test('parser-local horizontal views retain original cell identities and nested ownership without mutation', () => {
  const { bindWordTableGrids } = require('../plugins/data-secure/server/word-table-grid');
  const paragraph = text => ({ type: 'p', children: [text] });
  const nested = { type: 'tbl', children: [{ type: 'tr', children: [{ type: 'tc', children: [paragraph('NESTED')] }] }] };
  const first = { type: 'tc', gridSpan: 2, horizontalMerge: 'restart', children: [paragraph('ORIGIN')] };
  const second = { type: 'tc', horizontalMerge: 'continue', children: [paragraph('BEFORE'), nested, paragraph('AFTER')] };
  const row = { type: 'tr', children: [first, second] }, table = { type: 'tbl', children: [row] };
  const before = JSON.stringify(table);
  bindWordTableGrids(table, limit => Object.assign(new Error('test structure'), { code: limit ? 'LIMIT' : 'INVALID' }));
  assert.equal(table.grid.columns, 3); assert.equal(table.grid.rows[0].cells.length, 1);
  const owner = table.grid.rows[0].cells[0];
  assert.equal(owner.span, 3); assert.deepEqual(owner.cell.sourceCells, [first, second]);
  assert.equal(owner.cell.children[2], nested); assert.equal(nested.grid.columns, 1);
  assert.equal(row.children[0], first); assert.equal(row.children[1], second);
  assert.equal(first.gridSpan, 2); assert.equal(second.gridSpan, undefined);
  assert.equal(JSON.stringify(table, (key, value) => key === 'grid' ? undefined : value), before);
});

test('valid rectangular hMerge and vMerge groups bind the complete range across changing physical partitions', () => {
  const result = parse(tbl([
    tr([tc('TOP', horizontal('restart') + vertical('restart')), tc('', horizontal() + vertical('restart')), tc('A')]),
    tr([tc('MIDDLE', span('2') + vertical()), tc('B')]),
    tr([tc('BOTTOM', horizontal('restart') + vertical()), tc('', horizontal() + vertical('continue')), tc('C')]),
    tr([tc('NEW', span('2') + vertical('restart')), tc('D')]),
    tr([tc('', horizontal('restart') + vertical()), tc('', horizontal() + vertical()), tc('E')])
  ], 3), { preserveText: true, contentMode: true });
  for (const row of [2, 3]) assert.match(result.markdown, new RegExp(`Zeile ${row} · Spalten 1–2 · verbunden mit Zeile 1`, 'u'));
  assert.match(result.markdown, /Zeile 5 · Spalten 1–2 · verbunden mit Zeile 4 · ohne eigenen Zelltext/u);
  for (const value of ['TOP', 'MIDDLE', 'BOTTOM', 'NEW']) once(result.markdown, value);
});

test('horizontal grouping respects row offsets, source headers and nested paragraph order', () => {
  const nested = tbl([tr([tc('Name', horizontal('restart')), tc('', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
    tr([tc('Qvx', horizontal('restart')), tc('', horizontal()), tc('FHIR')])], 3);
  const body = tbl([tr([tc('OUTERBEFORE', horizontal('restart')),
    tc(p('INNERBEFORE') + nested + p('INNERAFTER'), horizontal(), true), tc('OUTERAFTER')],
  '<w:gridBefore w:val="1"/><w:gridAfter w:val="1"/>')], 5);
  const result = parse(body, { preserveText: true, contentMode: true });
  let previous = -1;
  for (const token of ['OUTERBEFORE', 'INNERBEFORE', '| Name | Fachtext |', '| Qvx | FHIR |', 'INNERAFTER', 'OUTERAFTER']) {
    const current = result.markdown.indexOf(token); assert.ok(current > previous, token); once(result.markdown, token); previous = current;
  }
  assert.match(result.markdown, /Zeile 1 · Spalten 2–3/u);
  assert.match(result.markdown, /Zeile 1 · Spalte 4/u);
});

test('horizontal properties obey active MC branches and exact canonical namespaces', () => {
  const chosen = '<mc:AlternateContent><mc:Choice Requires="vendor"><w:hMerge w:val="invalid"/></mc:Choice>' +
    '<mc:Fallback><w:hMerge w:val="restart"/></mc:Fallback></mc:AlternateContent>';
  const ignored = '<mc:AlternateContent><mc:Choice Requires="wps"><w:hMerge/></mc:Choice>' +
    '<mc:Fallback><w:hMerge w:val="invalid"/></mc:Fallback></mc:AlternateContent>';
  const body = tbl([tr([tc('ÄÖÜ ß Ελληνικά 中文 😀 A|B\\C', chosen), tc('', ignored), tc('RIGHT')])], 3);
  for (const namespace of ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']) {
    const source = reviewDocx(body, { prefix: 'actual', namespace });
    const result = parseOoxml(source, '.docx', undefined, { preserveText: true, contentMode: true });
    assert.match(result.markdown, /Tabellenspalte 1 = Spalten 1–2; Tabellenspalte 2 = Spalte 3/u);
    assert.match(result.markdown, /ÄÖÜ ß Ελληνικά 中文 😀 A\\\|B\\\\C/u);
    once(result.markdown, 'RIGHT');
  }
});

test('split physical header payloads normalize before privacy rather than fabricating a GFM label', () => {
  const result = parse(tbl([
    tr([tc('Na', horizontal('restart')), tc('me', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
    tr([tc('Qvx', horizontal('restart')), tc('', horizontal()), tc('FHIR')])
  ], 3), { preserveText: true, contentMode: true });
  assert.ok(result.warnings.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.match(result.markdown, /\| Inhalt \|\n\| --- \|\n\| Na<br>me \|/u);
  assert.match(result.markdown, /\| Name \|\n\| --- \|\n\| Qvx \|/u);
  assert.doesNotMatch(result.markdown, /Logische Spaltenbereiche/u);
  once(result.markdown, 'Qvx'); once(result.markdown, 'FHIR');
});

test('unmatched horizontal continuation cannot adopt a previous row, ordinary cell or another table', () => {
  reject(tbl([tr([tc('SECRET', horizontal())])]));
  reject(tbl([tr([tc('ORDINARY'), tc('SECRET', horizontal())])]));
  reject(tbl([tr([tc('ORIGIN', horizontal('restart')), tc('BREAK'), tc('SECRET', horizontal())])]));
  reject(tbl([tr([tc('ORIGIN', horizontal('restart'))]), tr([tc('SECRET', horizontal())])]));
  reject(tbl([tr([tc('ORIGIN', horizontal('restart'))])]) + tbl([tr([tc('SECRET', horizontal())])]));
  reject(tbl([tr([tc(tbl([tr([tc('ORIGIN', horizontal('restart'))])]), '', true), tc('SECRET', horizontal())])]));
});

test('horizontal property validation keeps enum, duplicate, owner and leaf guards hard', () => {
  for (const properties of [horizontal('invalid'), horizontal(''), horizontal('restart') + horizontal(),
    '<w:hMerge w:val="restart" extra="value"/>', '<w:hMerge w:val="restart"><w:p/></w:hMerge>']) {
    reject(tbl([tr([tc('SECRET', properties)])]));
  }
  reject(horizontal('restart') + p('SECRET'));
  reject(tbl([tr([`<w:tc>${horizontal('restart')}${p('SECRET')}</w:tc>`])]));
  reject(tbl([tr([tc('SECRET')], horizontal('restart'))]));
});

test('horizontal/vertical mixed states and partial rectangles never inherit an invented owner', () => {
  for (const pair of [[vertical('restart'), ''], ['', vertical('restart')], [vertical(), vertical('restart')]]) {
    reject(tbl([tr([tc('SECRET', horizontal('restart') + pair[0]), tc('PRIVATE', horizontal() + pair[1])])]));
  }
  reject(tbl([tr([tc('ORIGIN', horizontal('restart') + vertical('restart')), tc('', horizontal() + vertical('restart'))]),
    tr([tc('SECRET', vertical()), tc('PRIVATE')])], 2));
  reject(tbl([tr([tc('ORIGIN', vertical('restart')), tc('OTHER', vertical('restart'))]),
    tr([tc('SECRET', horizontal('restart') + vertical()), tc('', horizontal() + vertical())])], 2));
});

test('horizontal groups retain existing physical, logical-grid and rendering bounds', () => {
  reject(tbl([tr([tc('SECRET', span('1024') + horizontal('restart')), tc('', horizontal())])]), 'DOCX_STRUCTURE_LIMIT');
  reject(tbl(Array.from({ length: 200 }, () => tr([tc('', horizontal('restart')), tc('', horizontal())])), 1024), 'DOCX_STRUCTURE_LIMIT');
});

test('source-segment field checks do not double the existing logical-grid budget', () => {
  const body = tbl(Array.from({ length: 195 }, (_, index) => tr([
    tc(`LEFT${index}`, span('512') + horizontal('restart')),
    tc(`RIGHT${index}`, span('512') + horizontal())])), 1024);
  const actual = parse(body, { preserveText: true, contentMode: true });
  assert.ok(actual.warnings.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.match(actual.markdown, /195 · Spalten 1–1024/u);
  for (const value of ['LEFT0<br>RIGHT0', 'LEFT194<br>RIGHT194']) once(actual.markdown, value);
});
testAsync('actual hMerge source extraction, review, trace, publication and Keep retain field protection', async () => {
  const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
  const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
  const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
  const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
  const { bindStandaloneDocumentKeeps } = require('../plugins/data-secure/server/privacy/residual-person-review');
  const examples = [
    { uniform: true, body: tbl([
      tr([tc('Name', horizontal('restart')), tc('', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', horizontal('restart')), tc('', horizontal()), tc('FHIR')])], 3) },
    { body: tbl([
      tr([tc('Na', horizontal('restart')), tc('me', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', horizontal('restart')), tc('Qvy', horizontal()), tc('FHIR')])], 3) },
    { body: tbl([tr([tc('Name', horizontal('restart')), tc('Qvx', horizontal()), tc('FHIR')])], 3) },
    { body: tbl([
      tr([tc('Name', horizontal('restart') + vertical('restart')), tc('', horizontal() + vertical('restart')), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', span('2') + vertical()), tc('FHIR')])], 3) },
    { body: tbl([tr([tc(p('VORHER') + tbl([
      tr([tc('Name', horizontal('restart')), tc('', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', horizontal('restart')), tc('', horizontal()), tc('FHIR')])], 3) + p('NACHHER'), '', true)])]) },
    { body: tbl([
      tr([tc('Technologie', horizontal('restart')), tc('Name', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', span('2')), tc('FHIR')])], 3) },
    { body: tbl([
      tr([tc('Name', horizontal('restart')), tc('Unternehmen', horizontal()), tc('Fachtext')], '<w:tblHeader/>'),
      tr([tc('Qvx', horizontal('restart')), tc('Qvy', horizontal()), tc('FHIR')])], 3) }
  ];
  for (const [index, example] of examples.entries()) for (const markdownOutput of example.uniform ? ['content-v1', 'notes-v1'] : ['content-v1'])
    for (const profile of ['general', 'personnel_profile']) {
      const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: false };
      const consumerOptions = { productChannel: 'standalone', contentOptions };
      const source = reviewDocx(example.body), before = Buffer.from(source);
      const extracted = await extractSourceForPrivacy(source, '.docx', { contentOptions, convertBuffer: async input => {
        assert.deepEqual(input, before);
        const actual = extractMarkdownBuffer(input, '.docx', { markdownOutput, partialExtraction: true });
        assert.ok(!actual.coverage.reason_codes.includes('OFFICE_TABLE_CONTEXT_UNVERIFIED'));
        return createMarkdownExtraction({ source_type: 'docx', markdown: actual.markdown, coverage: actual.coverage, content_options: contentOptions });
      } });
      once(extracted.markdown, 'Qvx'); once(extracted.markdown, 'FHIR');
      if (index === 1) once(extracted.markdown, 'Qvy');
      const prepared = prepareTextPrivacyReview({ text: extracted.markdown, profile, productChannel: 'standalone', consumerOptions,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
      const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
      const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
      assert.doesNotMatch(final.markdown, /Qvx|Qvy/u); assert.match(final.markdown, /FHIR/u);
      if (index === 4) { once(final.markdown, 'VORHER'); once(final.markdown, 'NACHHER'); }
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = { markdown: final.markdown, profile, content_options: contentOptions, source_extraction: extracted.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates };
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({ markdown: final.markdown, transform_trace: final.transform_trace });
      const target = entities.find(entity => entity.original.includes('Qvx')); assert.ok(target, `bound source occurrence ${index}`);
      if (index >= 5) assert.equal(target.replacement, '[FIELD_REDACTED]', 'uncertain header unions must not invent a person identity');
      const kept = applyEntityDecisions(final.markdown, entities, [{ entity_id: target.entity_id, decision: 'keep' }], Buffer.alloc(32, 9));
      const keepProof = bindStandaloneDocumentKeeps(kept.markdown, [],
        kept.entities.filter(entity => entity.decision === 'keep').map(({ start, end }) => ({ start, end })));
      assert.ok(pii.scanResidual(kept.markdown, profile, final.dictionary, { ...consumerOptions,
        originalSourceText: extracted.markdown, reviewedPersonCandidates: keepProof }).length > 0);
      assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: kept.markdown, reviewed_person_candidates: keepProof }),
        { code: 'STANDALONE_PUBLICATION_INVALID' });
      assert.deepEqual(source, before);
    }
});

test('offset beyond the declared grid is not guessed into another header column', () => {
  reject(tbl([tr([tc('SECRET')], '<w:gridBefore w:val="4"/>')], 3));
  reject(tbl([tr([tc('SECRET')], '<w:gridAfter w:val="4"/>')], 3));
});
test('grid column and aggregate logical padding limits are independent of text size', () => {
  reject(tbl([tr([tc('SECRET')])], 1025), 'DOCX_STRUCTURE_LIMIT');
  reject(tbl([tr([tc('SECRET', span('1024')), tc('OTHER')])]), 'DOCX_STRUCTURE_LIMIT');
  reject(tbl(Array.from({ length: 10001 }, () => tr([tc('')]))), 'DOCX_STRUCTURE_LIMIT');
  reject(tbl(Array.from({ length: 200 }, () => tr([tc('')])), 1024), 'DOCX_STRUCTURE_LIMIT');
});

test('actual permission-bound conversion child retains merged content in both OCR-option branches', () => {
  assert.equal(process.version, 'v22.23.2', 'Run this source-worker proof with pinned Node22');
  const server = path.resolve(__dirname, '../plugins/data-secure/server');
  const firstRows = [
    tr([tc('ÄÖÜ ß 😀 CONTEXT', span('2') + vertical('restart')), tc('VALUEFIRST')]),
    tr([tc('ÄÖÜ ß 😀 CONTEXT', horizontal('restart') + vertical('restart')),
      tc('', horizontal() + vertical('restart')), tc('VALUEFIRST')])
  ];
  for (const firstRow of firstRows) for (const imageOcr of [false, true]) {
    const source = reviewDocx(tbl([firstRow, tr([tc('', span('2') + vertical()), tc('VALUELAST')])], 3));
    const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr };
    const policy = 'content-options-v1:' + Buffer.from(JSON.stringify(contentOptions)).toString('base64url');
    const child = spawnSync(process.execPath, ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
      '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
      `--require=${path.join(server, 'network-deny.cjs')}`, path.join(server, 'standalone/conversion-worker-child.js'),
      'docx', String(source.length), policy], {
      input: source, timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
      env: { SystemRoot: process.env.SystemRoot || '', WINDIR: process.env.WINDIR || '', PATH: '', DISABLE_SYSTEM_FONTS_LOAD: '1' }
    });
    assert.ifError(child.error); assert.equal(child.signal, null); assert.equal(child.status, 0);
    const stream = new CheckpointStream('docx', contentOptions); stream.push(child.stdout);
    const response = stream.response(); assert.equal(response.ok, true);
    assert.match(response.result.markdown, /Spalten 1–2/u);
    assert.match(response.result.markdown, /\| ÄÖÜ ß 😀 CONTEXT \|/u);
    assert.match(response.result.markdown, /verbunden mit Zeile 1/u);
    once(response.result.markdown, 'VALUEFIRST'); once(response.result.markdown, 'VALUELAST');
  }
});

done();
