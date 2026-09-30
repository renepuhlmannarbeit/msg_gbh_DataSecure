'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ledger = require('../plugins/data-secure/server/standalone/identity-ledger');

const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-identity-test-'));
const options = { dataRoot: root };
const token = 'a'.repeat(64);
const first = 'b'.repeat(32);
const second = 'c'.repeat(32);
const state = { product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token,
  items: [{ id: first, status: 'released', source_label: 'quelle/Erstes.docx' },
    { id: second, status: 'released', source_label: 'quelle/Zweites.xlsx' }] };

try {
  assert.equal(ledger.identityStatus(state, options).available, false);
  assert.equal(ledger.documentAvailable(token, options), false);
  assert.deepEqual(ledger.capture(token, first, `ds_${first}`, [
    { pseudonym: '[PERSON_011]', original: 'Denise Koch' },
    { pseudonym: '[UNTERNEHMEN_001]', original: 'Muster GmbH' }
  ], options), { captured: true, existing: false });
  assert.equal(ledger.resolveDirectory(options), path.join(root, 'identity-ledgers'),
    'older mappings remain reachable outside the last-20 run history');
  assert.equal(ledger.capture(token, first, `ds_${first}`, [
    { pseudonym: '[PERSON_011]', original: 'Denise Koch' },
    { pseudonym: '[UNTERNEHMEN_001]', original: 'Muster GmbH' }
  ], options).existing, true, 'a retry is idempotent');
  let result = ledger.materialize(state, options);
  assert.equal(result.complete, false, 'a missing item is explicitly incomplete');
  assert.match(fs.readFileSync(result.local_path, 'utf8'), /Vollständigkeit der erfassten Ergebnisdateien: 1\/2/u);
  assert.match(fs.readFileSync(result.local_path, 'utf8'), /OHNE ZUORDNUNG: quelle\/Zweites\.xlsx/u);
  ledger.capture(token, second, `ds_${second}`, [
    { pseudonym: '[PERSON_012]', original: 'Max Mustermann' }
  ], options);
  result = ledger.materialize(state, options);
  assert.equal(result.complete, true);
  const content = fs.readFileSync(result.local_path, 'utf8');
  assert.match(content, /\[PERSON_011\] = Denise Koch/u);
  assert.match(content, /\[PERSON_012\] = Max Mustermann/u);
  assert.match(content, /NICHT in KI-Systeme hochladen/u);
  assert.doesNotMatch(content, /OHNE ZUORDNUNG/u);
  const output = path.join(root, 'visible', 'DataSecure-Output');
  const run = path.join(output, 'Lauf-20260930-203000-abcdef01');
  fs.mkdirSync(run, { recursive: true });
  const published = ledger.publishDocumentToRun(token, run, options);
  assert.equal(published.published, true);
  assert.equal(published.local_path, path.join(run, 'VERTRAULICH-NICHT-HOCHLADEN',
    'DataSecure-Identitaeten-VERTRAULICH.txt'));
  assert.equal(fs.readFileSync(published.local_path, 'utf8'), content,
    'only the human-readable mapping is placed under the marked result subfolder');
  assert.deepEqual(fs.readdirSync(path.dirname(published.local_path)), ['DataSecure-Identitaeten-VERTRAULICH.txt']);
  assert.equal(ledger.publishDocumentToRun(token, run, options).existing, true);
  fs.unlinkSync(published.local_path);
  assert.equal(ledger.publishDocumentToRun(token, run, options).local_path, result.local_path,
    'a user-removed visible copy is never silently recreated');
  const beforeOpen = fs.statSync(result.local_path).mtimeMs;
  ledger.materialize(state, options);
  assert.equal(fs.statSync(result.local_path).mtimeMs, beforeOpen,
    'reopening an unchanged document does not replace a file already open in an editor');
  ledger.capture(token, second, `ds_${second}`, [
    { pseudonym: '[PERSON_012]', original: 'Max Mustermann' }
  ], { ...options, unmappedLabels: ['[PROJEKT_003]'] });
  assert.equal(ledger.materialize(state, options).complete, false,
    'a visible typed pseudonym without a unique source remains incomplete');
  assert.match(fs.readFileSync(result.local_path, 'utf8'), /OHNE EINDEUTIGE ZUORDNUNG: \[PROJEKT_003\]/u);
  assert.equal(ledger.documentAvailable(token, options), true,
    'the document remains available without a background expiry or journal');
  const stoppedId = 'd'.repeat(32);
  ledger.capture(token, stoppedId, `ds_${stoppedId}`, [
    { pseudonym: '[PERSON_013]', original: 'Nicht publizierter Rohwert' }
  ], options);
  assert.equal(ledger.pruneStopped({ ...state, items: [...state.items,
    { id: stoppedId, status: 'stopped' }] }, options), 1,
  'an uncommitted stopped snapshot is cleaned without deleting the completed mapping');
  assert.equal(ledger.documentAvailable(token, options), true);
  assert.throws(() => ledger.capture(token, first, `ds_${first}`, [
    { pseudonym: '[PERSON_011]', original: 'Zeile\nmit Umbruch' }
  ], options), /STANDALONE_IDENTITY_MAPPING_INVALID/u);
  const markdownOnly = { ...state, processing_mode: 'markdown-only' };
  assert.equal(ledger.identityStatus(markdownOnly, options).available, false);
  const cowork = { ...state, product_channel: 'plugin' };
  assert.equal(ledger.identityStatus(cowork, options).available, false);
  assert.equal(ledger.documentAvailable(token, options), true,
    'private mappings have no automatic expiry or application delete action');
  console.log('STANDALONE IDENTITY LEDGER PASS');
} finally {
  const resolved = fs.realpathSync.native(root);
  assert.ok(resolved.startsWith(fs.realpathSync.native(os.tmpdir()) + path.sep), 'test cleanup stays in temporary storage');
  fs.rmSync(resolved, { recursive: true });
}
