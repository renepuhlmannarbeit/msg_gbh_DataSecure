// Independent semantic expectations for the package-bound Fastweg campaign.
// No product privacy/extraction/normalization module is used by this oracle.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MarkdownIt = require('markdown-it');
const reader = new MarkdownIt({ html: false, linkify: false });

export function fastContentFixtures() {
  return new Map([
    ['01-fakten.txt', Buffer.from('Name: Anna Beispiel\nE-Mail: anna@example.invalid\n\nDer Motor startet nicht.\nDas Ventil bleibt geschlossen.\nDruck: 42 kPa.\nTemperatur: -12,5 °C.\nMenge: 7 kg.\nFreigabe: nein.\nReserve: 0 Stück.\n')],
    ['02-fakten.md', Buffer.from('Name: Anna Beispiel  \nE-Mail: anna@example.invalid\n\n# Messung\n\n- Die Pumpe darf nicht starten.\n- Der Test ist nicht bestanden.\n- Spannung: 24 V.\n- Grenzwert: 17 mm.\n- Anteil: 12,5 %.\n- Dauer: 3 h.\n- Freigabe: nein.\n')],
    ['03-fakten.csv', Buffer.from('Probe,Person,Druck (kPa),Menge (kg),Freigabe,Kontrollsatz\neins,Anna Beispiel,42,7,nein,Die Pumpe darf nicht starten.\nzwei,Berta Muster,17,19,ja,Das Ventil bleibt geschlossen.\n')]
  ]);
}

function inlineText(token) {
  assert.ok(Array.isArray(token.children), 'FAST_CONTENT_INLINE_INVALID');
  return token.children.map(child => {
    assert.ok(['text', 'softbreak', 'hardbreak', 'code_inline'].includes(child.type),
      `FAST_CONTENT_UNEXPECTED_INLINE:${child.type}`);
    return ['softbreak', 'hardbreak'].includes(child.type) ? '\n' : child.content;
  }).join('');
}
function tokens(text) {
  assert.equal(typeof text, 'string');
  assert.doesNotMatch(text, /Anna Beispiel|Berta Muster|anna@example\.invalid/u, 'FAST_CONTENT_PII_REMAINS');
  return reader.parse(text, {});
}
function prose(text, expectedFacts) {
  const parsed = tokens(text);
  assert.ok(parsed.every(token => ['paragraph_open', 'paragraph_close', 'inline', 'heading_open', 'heading_close',
    'bullet_list_open', 'bullet_list_close', 'list_item_open', 'list_item_close'].includes(token.type)),
  'FAST_CONTENT_UNEXPECTED_PROSE_STRUCTURE');
  const lines = parsed.filter(token => token.type === 'inline').flatMap(token => inlineText(token).split('\n'));
  assert.equal(lines.length, expectedFacts.length + 2, 'FAST_CONTENT_MISSING_DUPLICATED_OR_EXTRA_LINES');
  const person = /^Name: (\[PERSON_\d{3,5}\])$/u.exec(lines[0]);
  assert.ok(person, 'FAST_CONTENT_PERSON_TOKEN_INVALID');
  assert.match(lines[1], /^E-Mail: \[EMAIL_(?:REDACTED|\d{3,5})\]$/u, 'FAST_CONTENT_EMAIL_TOKEN_INVALID');
  assert.deepEqual(lines.slice(2), expectedFacts, 'FAST_CONTENT_FACT_CHANGED_REMOVED_OR_REORDERED');
  return person[1];
}
function table(text, anna) {
  const parsed = tokens(text), rows = [];
  let row = null, tables = 0;
  for (const token of parsed) {
    assert.ok(['table_open', 'table_close', 'thead_open', 'thead_close', 'tbody_open', 'tbody_close',
      'tr_open', 'tr_close', 'th_open', 'th_close', 'td_open', 'td_close', 'inline'].includes(token.type),
    'FAST_CONTENT_UNEXPECTED_TABLE_STRUCTURE');
    if (token.type === 'table_open') tables++;
    if (token.type === 'tr_open') { assert.equal(row, null); row = []; }
    if (token.type === 'inline') { assert.ok(row); row.push(inlineText(token)); }
    if (token.type === 'tr_close') { assert.ok(row); rows.push(row); row = null; }
  }
  assert.equal(tables, 1, 'FAST_CONTENT_TABLE_COUNT');
  assert.equal(row, null); assert.equal(rows.length, 3, 'FAST_CONTENT_TABLE_ROW_COUNT');
  assert.deepEqual(rows[0], ['Probe', 'Person', 'Druck (kPa)', 'Menge (kg)', 'Freigabe', 'Kontrollsatz'],
    'FAST_CONTENT_TABLE_HEADERS_CHANGED');
  assert.equal(rows[1].length, 6); assert.equal(rows[2].length, 6);
  assert.equal(rows[1][1], anna, 'FAST_CONTENT_SAME_PERSON_ID_CHANGED');
  assert.match(rows[2][1], /^\[PERSON_\d{3,5}\]$/u, 'FAST_CONTENT_SECOND_PERSON_TOKEN_INVALID');
  assert.notEqual(rows[2][1], anna, 'FAST_CONTENT_DISTINCT_PERSONS_COLLAPSED');
  assert.deepEqual(rows[1].filter((_cell, index) => index !== 1),
    ['eins', '42', '7', 'nein', 'Die Pumpe darf nicht starten.'], 'FAST_CONTENT_TABLE_FIRST_ROW_CHANGED');
  assert.deepEqual(rows[2].filter((_cell, index) => index !== 1),
    ['zwei', '17', '19', 'ja', 'Das Ventil bleibt geschlossen.'], 'FAST_CONTENT_TABLE_SECOND_ROW_CHANGED');
}

export function assertFastContentOracle(outputs) {
  assert.ok(outputs instanceof Map);
  assert.deepEqual([...outputs.keys()].sort(), ['01-fakten.txt', '02-fakten.md', '03-fakten.csv'],
    'FAST_CONTENT_DOCUMENT_SET_CHANGED');
  const anna = prose(outputs.get('01-fakten.txt'), ['Der Motor startet nicht.', 'Das Ventil bleibt geschlossen.',
    'Druck: 42 kPa.', 'Temperatur: -12,5 °C.', 'Menge: 7 kg.', 'Freigabe: nein.', 'Reserve: 0 Stück.']);
  assert.equal(prose(outputs.get('02-fakten.md'), ['Messung', 'Die Pumpe darf nicht starten.',
    'Der Test ist nicht bestanden.', 'Spannung: 24 V.', 'Grenzwert: 17 mm.', 'Anteil: 12,5 %.',
    'Dauer: 3 h.', 'Freigabe: nein.']), anna, 'FAST_CONTENT_CROSS_DOCUMENT_PERSON_ID_CHANGED');
  table(outputs.get('03-fakten.csv'), anna);
  return { documents: 3, factual_prose_lines: 15, table_rows: 2, table_columns: 6,
    negations: true, numbers_units_and_signs: true, row_and_column_association: true,
    complete_visible_content: true, consistent_distinct_person_tokens: true };
}

export function fastContentOracleSelfTest() {
  // Hand-authored positive result, independent of the actual product output.
  const positive = new Map([
    ['01-fakten.txt', 'Name: [PERSON_001]  \nE-Mail: [EMAIL_REDACTED]\n\nDer Motor startet nicht.  \nDas Ventil bleibt geschlossen.  \nDruck: 42 kPa.  \nTemperatur: -12,5 °C.  \nMenge: 7 kg.  \nFreigabe: nein.  \nReserve: 0 Stück.'],
    ['02-fakten.md', 'Name: [PERSON_001]  \nE-Mail: [EMAIL_REDACTED]\n\n# Messung\n\n- Die Pumpe darf nicht starten.\n- Der Test ist nicht bestanden.\n- Spannung: 24 V.\n- Grenzwert: 17 mm.\n- Anteil: 12,5 %.\n- Dauer: 3 h.\n- Freigabe: nein.'],
    ['03-fakten.csv', '| Probe | Person | Druck (kPa) | Menge (kg) | Freigabe | Kontrollsatz |\n| --- | --- | --- | --- | --- | --- |\n| eins | [PERSON_001] | 42 | 7 | nein | Die Pumpe darf nicht starten. |\n| zwei | [PERSON_002] | 17 | 19 | ja | Das Ventil bleibt geschlossen. |']
  ]);
  assertFastContentOracle(positive);
  const corruptions = [
    ['01-fakten.txt', text => text.replace('startet nicht', 'startet')],
    ['01-fakten.txt', text => text.replace('42 kPa', '24 kPa')],
    ['01-fakten.txt', text => text.replace('-12,5 °C', '12,5 °C')],
    ['02-fakten.md', text => text.replace('17 mm', '17 m')],
    ['02-fakten.md', text => text.replace('- Dauer: 3 h.\n', '')],
    ['02-fakten.md', text => text + '\n- Freigabe: ja.'],
    ['03-fakten.csv', text => text.replace('| 42 | 7 |', '| 7 | 42 |')],
    ['03-fakten.csv', text => text.split('\n').slice(0, 3).join('\n')],
    ['03-fakten.csv', text => text.replace('[PERSON_002]', '[PERSON_001]')],
    ['03-fakten.csv', text => text.replace('| nein | Die Pumpe', '| ja | Die Pumpe')],
    ['01-fakten.txt', text => text.replace('Das Ventil bleibt geschlossen.', '[TECHNISCH_REDACTED]')]
  ];
  for (const [name, corrupt] of corruptions) {
    const changed = new Map(positive); changed.set(name, corrupt(changed.get(name)));
    assert.throws(() => assertFastContentOracle(changed), undefined, `oracle must reject ${name}`);
  }
  return { positive: 1, semantic_counterexamples_rejected: corruptions.length };
}
