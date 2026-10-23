'use strict';

// Pure parser-local model/serializer probes. No user documents, OCR, native
// applications, files, registry persistence, platform permissions or network.
const { createSuite } = require('./helpers');
const { literalTableCell } = require('../plugins/data-secure/server/core/markdown-literal-content');
const { renderTableCells, tableFieldPlan } = require('../plugins/data-secure/server/office-table-projection');
const { test, assert, done } = createSuite('Office source-bound table cell projection');
const cell = (text, column = 0, span = 1, continuationOf = null) => ({ column, span, continuationOf, text });
const row = (number, cells, header = false) => ({ number, header, cells });
const options = { escapeCell: literalTableCell };
const emit = rows => renderTableCells(rows, options);
const labels = rows => [...tableFieldPlan(rows).values()];
const tables = text => [...text.matchAll(/^\| ([^\n]*) \|\n\| --- \|\n\| ([^\n]*) \|$/gmu)].map(match => [match[1], match[2]]);
const PROTECTED = 'Geschützter Tabellenwert';

test('each nonempty source cell appears exactly once in one independent GFM value cell', () => {
  const rows = [row(1, [cell('Name'), cell('Fachtext', 1)], true), row(2, [cell('Qvx'), cell('FHIR R4', 1)])];
  const original = JSON.stringify(rows), output = emit(rows);
  assert.deepEqual(tables(output), [['Inhalt', 'Name'], ['Inhalt', 'Fachtext'], ['Name', 'Qvx'], ['Inhalt', 'FHIR R4']]);
  assert.equal(output.split('Qvx').length - 1, 1); assert.equal(output.split('FHIR R4').length - 1, 1);
  assert.equal(JSON.stringify(rows), original);
});

test('the source header is not rendered as a Name-valued person or duplicated as source metadata', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Qvx')])];
  const calls = [];
  renderTableCells(rows, { escapeCell: value => { calls.push(value); return literalTableCell(value); } });
  assert.equal(calls.filter(value => value === 'Name').length, 1);
  assert.deepEqual(labels(rows), ['Inhalt', 'Name']);
});

test('raw label-like source text is not a caller-provided field authority', () => {
  const rows = [row(1, [cell('Name: Qvx'), cell('Fachtext', 1)], true), row(2, [cell('Rtz'), cell('FHIR', 1)])];
  assert.deepEqual(labels(rows), [PROTECTED, 'Inhalt', 'Inhalt', 'Inhalt']);
  assert.ok(emit(rows).includes('Name: Qvx'));
});

test('exact logical spans cover values without shifting a following factual column', () => {
  const rows = [row(1, [cell('Name', 0, 2), cell('Fachtext', 2)], true),
    row(2, [cell('Qvx'), cell('Rtz', 1), cell('FHIR', 2)])];
  assert.deepEqual(labels(rows), ['Inhalt', 'Inhalt', 'Name', 'Name', 'Inhalt']);
  assert.match(emit(rows), /Zeile 1 · Spalten 1–2/u);
});

test('narrower known subheaders shadow a broad Kontakt group without blanket person fields', () => {
  const rows = [row(1, [cell('Kontakt', 0, 3)], true),
    row(2, [cell('Name'), cell('Fachtext', 1), cell('Telefon', 2)], true),
    row(3, [cell('Qvx'), cell('FHIR R4', 1), cell('12345', 2)])];
  assert.deepEqual(labels(rows).slice(-3), ['Name', 'Inhalt', 'Telefon']);
});

test('a new broader header cannot erase an already narrower field owner', () => {
  const rows = [row(1, [cell('Name'), cell('Fachtext', 1)], true),
    row(2, [cell('Kontakt', 0, 2)], true), row(3, [cell('Qvx'), cell('FHIR', 1)])];
  assert.deepEqual(labels(rows).slice(-2), ['Name', 'Inhalt']);
});

test('a value spanning sensitive and factual columns is explicitly ambiguous, not guessed Name', () => {
  const rows = [row(1, [cell('Name'), cell('Fachtext', 1)], true), row(2, [cell('Qvx und Fachinhalt', 0, 2)])];
  assert.equal(tableFieldPlan(rows).get(rows[1].cells[0]), PROTECTED);
});

test('a partial span into an unowned interval remains protected instead of losing short values', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Qvx', 0, 2)])];
  assert.equal(tableFieldPlan(rows).get(rows[1].cells[0]), PROTECTED);
});

test('an exact two-cell vertical key binds its actual empty continuations only', () => {
  const rows = [row(1, [cell('Name'), cell('Qvx', 1)]), row(2, [cell('', 0, 1, 1), cell('Rtz', 1)])];
  assert.deepEqual(labels(rows), ['Inhalt', 'Name', 'Inhalt', 'Name']);
  assert.equal(tables(emit(rows)).length, 3);
  assert.ok(!emit(rows).includes('|  |'));
});

test('actual text in a continuation is retained once and marked ambiguous', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Qvx', 0, 1, 1)])];
  assert.deepEqual(labels(rows), ['Inhalt', PROTECTED]);
  assert.deepEqual(tables(emit(rows)), [['Inhalt', 'Name'], [PROTECTED, 'Qvx']]);
});

test('physical DrawingML horizontal continuation inside its owner span retains its real text', () => {
  const rows = [row(1, [cell('Name', 0, 2), cell('Qvx', 1, 1, 1), cell('Fachtext', 2)], true),
    row(2, [cell('Rtz', 0, 2), cell('FHIR', 2)])];
  assert.deepEqual(labels(rows), ['Inhalt', PROTECTED, 'Inhalt', 'Name', 'Inhalt']);
  assert.equal(tables(emit(rows)).filter(([_label, value]) => value === 'Qvx').length, 1);
});

test('partial DrawingML vertical and horizontal continuations can reference the same exact source owner', () => {
  const rows = [row(1, [cell('Name', 0, 2)], true),
    row(2, [cell('', 0, 2, 1), cell('Qvx', 1, 1, 1)])];
  assert.deepEqual(labels(rows), ['Inhalt', 'Name', PROTECTED]);
  assert.equal(tables(emit(rows)).length, 2);
});

test('a non-two-cell vertical key corridor cannot leave unknown short values unprotected', () => {
  const rows = [row(1, [cell('Name'), cell('Qvx', 1)]),
    row(2, [cell('', 0, 1, 1), cell('Rtz', 1), cell('Fachtext', 2)])];
  assert.equal(tableFieldPlan(rows).get(rows[1].cells[1]), PROTECTED);
});

test('a vertical label reference across a source-row gap is generic, not a proved precise Name', () => {
  const rows = [row(1, [cell('Name'), cell('Qvx', 1)]), row(3, [cell('', 0, 1, 1), cell('Rtz', 1)])];
  assert.equal(tableFieldPlan(rows).get(rows[1].cells[1]), PROTECTED);
});

test('an unmarked key/value-vs-header row protects unknown values of any shape', () => {
  for (const value of ['Qvx', '12345', 'Unknown Technical Phrase', 'x'.repeat(300)]) {
    const rows = [row(1, [cell('Name'), cell(value, 1)])];
    assert.deepEqual(labels(rows), ['Inhalt', PROTECTED]);
  }
});

test('a familiar technical heading spelling is not proof that an unmarked row value is harmless', () => {
  const rows = [row(1, [cell('Name'), cell('Wert', 1)])];
  assert.deepEqual(labels(rows), ['Inhalt', PROTECTED]);
});

test('unknown adjacent values in a repeated header remain protected without invented persons', () => {
  const rows = [row(1, [cell('Name'), cell('Qvx', 1)], true), row(2, [cell('Rtz'), cell('Vwx', 1)]),
    row(3, [cell('Name'), cell('Zqx', 1)], true), row(4, [cell('Wvx'), cell('Yqx', 1)])];
  assert.deepEqual(labels(rows), ['Inhalt', PROTECTED, 'Name', PROTECTED, 'Inhalt', PROTECTED, 'Name', PROTECTED]);
});

test('an unmarked heading change cannot erase prior sensitive evidence or invent a new identity type', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Qvx')]),
    row(3, [cell('Company')]), row(4, [cell('Rtz')])];
  assert.deepEqual(labels(rows), ['Inhalt', 'Name', 'Inhalt', PROTECTED]);
});

test('unmarked factual headings cannot free a previous Name column',()=>{
  const rows=[row(1,[cell('Name'),cell('Name',1),cell('Fachtext',2,2)],true),
    row(2,[cell('Qvx'),cell('Rtz',1),cell('FHIR',2,2)]),
    row(3,[cell('Company'),cell('Status',1),cell('Kommentar',2,2)]),
    row(4,[cell('Ryx'),cell('Tzx',1),cell('Java',2,2)])];
  const plan=tableFieldPlan(rows);
  assert.equal(plan.get(rows[3].cells[1]),PROTECTED);
});
test('a repeated same-row sensitive key is protected even inside an existing Name corridor',()=>{
  const rows=[row(1,[cell('Name'),cell('Fachtext',1),cell('Status',2,2)],true),
    row(2,[cell('Qvx'),cell('FHIR',1),cell('Open',2,2)]),
    row(3,[cell('Name'),cell('Rtz',1),cell('Rust',2,2)])];
  assert.equal(tableFieldPlan(rows).get(rows[2].cells[1]),PROTECTED);
});
test('a text-bearing nonanchor label cannot silently free the following source value',()=>{
  const rows=[row(1,[cell('Fachtext',0,2),cell('Name',1,1,1)]),row(2,[cell('',0),cell('Qvx',1)])];
  assert.equal(tableFieldPlan(rows).get(rows[1].cells[1]),PROTECTED);
});

test('a newly reached disjoint field corridor cannot silently free its following short values', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Firma', 5), cell('Qvx', 6)]),
    row(3, [cell('Rtz', 5), cell('Vwx', 6)])];
  assert.deepEqual(labels(rows).slice(-4), ['Inhalt', PROTECTED, 'Unternehmen', PROTECTED]);
});

test('ordinary technical tables without sensitive field evidence never gain generated sensitivity', () => {
  const rows = [row(1, [cell('Technologien'), cell('Version', 1)], true),
    row(2, [cell('FHIR R4'), cell('4.0.1', 1)]), row(3, [cell('Java'), cell('22', 1)])];
  assert.ok(labels(rows).every(value => value === 'Inhalt'));
});

test('a physical gap cannot manufacture a precise Name link or silently free its corridor', () => {
  const rows = [row(1, [cell('Name'), cell('Fachtext', 1)], true), row(3, [cell('Qvx'), cell('FHIR', 1)])];
  assert.deepEqual(labels(rows).slice(-2), [PROTECTED, 'Inhalt']);
});

test('a column gap does not make an unrelated technical cell a same-row key value', () => {
  const rows = [row(1, [cell('Name'), cell('FHIR', 2)])];
  assert.deepEqual(labels(rows), ['Inhalt', 'Inhalt']);
});

test('scope is fresh per call and nested callers can keep plans by actual cell identity', () => {
  const outer = [row(1, [cell('Fachtext')], true), row(2, [cell('outside')])];
  const inner = [row(1, [cell('Name')], true), row(2, [cell('Qvx')])];
  const outerPlan = tableFieldPlan(outer), innerPlan = tableFieldPlan(inner);
  assert.equal(outerPlan.get(outer[1].cells[0]), 'Inhalt');
  assert.equal(innerPlan.get(inner[1].cells[0]), 'Name');
  assert.equal(innerPlan.get(outer[1].cells[0]), undefined);
  assert.deepEqual(labels([row(1, [cell('Qvx')])]), ['Inhalt']);
});

test('source duplicates at distinct positions are not deduplicated by value', () => {
  const rows = [row(1, [cell('Name')], true), row(2, [cell('Qvx')]), row(3, [cell('Qvx')])];
  assert.equal(tables(emit(rows)).filter(([_label, value]) => value === 'Qvx').length, 2);
});

test('multiline and Unicode source values stay in one escaped GFM data cell', () => {
  const value = 'Äß😀 Qvx\r\nRtz\nDwx\rÜ\t| **literal** & <br>';
  const rows = [row(1, [cell('Name')], true), row(2, [cell(value)])];
  const output = emit(rows), rendered = tables(output);
  assert.equal(rendered.length, 2); assert.equal(rendered[1][0], 'Name');
  assert.equal(rendered[1][1], literalTableCell(value));
  assert.match(rendered[1][1], /Äß😀 Qvx&#13;<br>Rtz<br>Dwx&#13;Ü&#9;/u);
  assert.ok(!rendered[1][1].includes('\n'));
});

test('a sensitive label and unknown short value inside one source cell stays protected, not a future header', () => {
  for (const text of ['Name\nQvx', 'Name: Qvx', 'Telefon:\r\n12345']) {
    const rows = [row(1, [cell(text)], true), row(2, [cell('FHIR R4')])];
    assert.deepEqual(labels(rows), [PROTECTED, 'Inhalt']);
  }
});

test('sparse source coordinates retain XFD and the maximum worksheet row without matrix expansion', () => {
  const rows = [row(1, [cell('Name', 16383)], true), row(1048576, [cell('Qvx', 16383)])];
  assert.deepEqual(labels(rows), ['Inhalt', PROTECTED]);
  assert.match(emit(rows), /Zeile 1048576 · Spalte 16384/u);
  const diagonal = Array.from({ length: 450 }, (_unused, index) => row(index + 1,
    [cell(index ? `diagonal${index}` : 'Name', index)]));
  assert.equal(tables(emit(diagonal)).length, 450);
  const actualRows = Array.from({ length: 10001 }, (_unused, index) => row(index + 1, [cell(`row${index}`)]));
  assert.equal(tableFieldPlan(actualRows).size, 10001, 'no new 10k XLSX record limit');
});

test('closed canonical field labels preserve type rather than making all values persons', () => {
  const sourceLabels = ['First Name', 'Firma', 'Phone', 'Geburtsdatum', 'Steuer-ID', 'API Key', 'IBAN', 'E-Mail', 'Kunde'];
  const expected = ['Name', 'Unternehmen', 'Telefon', 'Geburtsdatum', 'Steuer-ID', PROTECTED, PROTECTED, PROTECTED, PROTECTED];
  const rows = [row(1, sourceLabels.map((text, column) => cell(text, column)), true),
    row(2, sourceLabels.map((_text, column) => cell(`value${column}`, column)))];
  assert.deepEqual(labels(rows).slice(-expected.length), expected);
});

test('exact supported line-split and multirow header fragments can retain one closed field class', () => {
  assert.deepEqual(labels([row(1, [cell('Vor\nname')], true), row(2, [cell('Qvx')])]), ['Inhalt', 'Name']);
  const rows = [row(1, [cell('Geburts')], true), row(2, [cell('datum')], true), row(3, [cell('01.01.1980')])];
  assert.equal(labels(rows).at(-1), 'Geburtsdatum');
});

test('unknown sensitive subheaders are protected while known factual subheaders remain factual', () => {
  const rows = [row(1, [cell('Kontakt', 0, 2)], true), row(2, [cell('Qvx'), cell('Fachtext', 1)], true),
    row(3, [cell('Rtz'), cell('FHIR', 1)])];
  assert.deepEqual(labels(rows).slice(-4), [PROTECTED, 'Inhalt', PROTECTED, 'Inhalt']);
});

test('factual text in a nonanchor header continuation cannot erase the sensitive owner corridor', () => {
  const rows = [row(1, [cell('Name', 0, 2), cell('Fachtext', 1, 1, 1)], true),
    row(2, [cell('Qvx'), cell('Rtz', 1)]), row(3, [cell('Company'), cell('Status', 1)]),
    row(4, [cell('Ryx'), cell('Tzx', 1)])];
  assert.deepEqual(labels(rows).slice(-2), [PROTECTED, PROTECTED]);
  assert.equal(tables(emit(rows)).filter(([_label, value]) => value === 'Tzx').length, 1);
});

test('coordinate callback receives the exact source objects without adding source-value copies', () => {
  const rows = [row(5, [cell('Qvx', 2, 2)])], seen = [];
  const output = renderTableCells(rows, { ...options, coordinates: (r, c) => {
    seen.push([r, c]); return 'Tabelle 7 · Zeile 5 · Spalten 3–4';
  } });
  assert.equal(seen[0][0], rows[0]); assert.equal(seen[0][1], rows[0].cells[0]);
  assert.match(output, /^Tabelle 7 · Zeile 5 · Spalten 3–4/u);
  assert.equal(output.split('Qvx').length - 1, 1);
});

test('empty and whitespace-only cells do not invent source values or zero-column tables', () => {
  assert.equal(emit([]), ''); assert.equal(emit([row(1, [cell(''), cell(' \t\r\n', 1)])]), '');
});

test('invalid and overlapping grids are refused with fixed content-free errors', () => {
  const invalidRows = [null, [row(1, [cell('SECRET', 0, 0)])], [row(1, [cell('SECRET'), cell('x')])],
    [row(1, [cell('SECRET', 0, 1, 99)])], [row(1, []), row(1, [])],
    [row(1, [cell('SECRET', 16384)])], [row(1048577, [cell('SECRET')])]];
  for (const rows of invalidRows) assert.throws(() => tableFieldPlan(rows), error =>
    /^OFFICE_TABLE_PROJECTION_(?:INVALID|LIMIT)$/u.test(error.code) && !error.message.includes('SECRET'));
});

test('a continuation spanning two different owners and reused cell identities are refused', () => {
  const overlapping = [row(1, [cell('Name'), cell('Firma', 1)], true), row(2, [cell('SECRET', 0, 2, 1)])];
  assert.throws(() => tableFieldPlan(overlapping), { code: 'OFFICE_TABLE_PROJECTION_INVALID' });
  const reused = cell('SECRET');
  assert.throws(() => tableFieldPlan([row(1, [reused]), row(2, [reused])]), { code: 'OFFICE_TABLE_PROJECTION_INVALID' });
});

test('a broken cell escaper cannot inject another GFM column or physical data row', () => {
  for (const text of ['Qvx|Rtz', 'Qvx\nRtz', 'Qvx\rRtz']) {
    assert.throws(() => renderTableCells([row(1, [cell(text)])], { escapeCell: value => value }),
      { code: 'OFFICE_TABLE_PROJECTION_INVALID' });
  }
});

done();
