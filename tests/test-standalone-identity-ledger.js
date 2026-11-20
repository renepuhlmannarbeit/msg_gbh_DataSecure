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
  const snapshots = [first, second].map(id => path.join(ledger.privateRoot(options), token, `${id}.json`));
  const snapshotBytes = snapshots.map(file => fs.readFileSync(file));
  function withReadFault(fault, action) {
    const read = fs.readFileSync, counts = new Map();
    fs.readFileSync = function(file, ...args) {
      if (snapshots.includes(file)) {
        const count = (counts.get(file) || 0) + 1; counts.set(file, count);
        if (fault(file, count)) throw Object.assign(new Error('synthetic snapshot refusal'), { code: 'EACCES' });
      }
      return read.call(this, file, ...args);
    };
    try { return { value: action(), counts }; }
    finally { fs.readFileSync = read; }
  }
  const once = withReadFault((_file, count) => count > 1, () => ledger.materialize(state, options));
  assert.equal(once.value.complete, true);
  assert.deepEqual([...once.counts.values()], [1, 1], 'each rendered snapshot is read exactly once');
  assert.equal(fs.readFileSync(result.local_path, 'utf8'), content);
  const partial = withReadFault(file => file === snapshots[0], () => ledger.materialize(state, options));
  assert.equal(partial.value.complete, false);
  const partialBytes = fs.readFileSync(result.local_path);
  assert.match(partialBytes.toString('utf8'), /Vollständigkeit der erfassten Ergebnisdateien: 1\/2/u);
  assert.doesNotMatch(partialBytes.toString('utf8'), /Denise Koch/u);
  assert.throws(() => withReadFault(() => true, () => ledger.materialize(state, options)),
    { code: 'STANDALONE_IDENTITY_MAPPING_INVALID' });
  assert.deepEqual(fs.readFileSync(result.local_path), partialBytes, 'zero valid snapshots never replace the previous aid');
  const historical = { ...state }; delete historical.processing_mode;
  assert.equal(ledger.materialize(historical, options).complete, true, 'legacy mode omission remains eligible');
  assert.equal(fs.readFileSync(result.local_path, 'utf8'), content);
  for (const value of [{ ...state, processing_mode: 'markdown-only' }, { ...state, product_channel: 'plugin' },
    { ...state, token: 'invalid' }, { ...state, items: [] }]) {
    assert.throws(() => ledger.materialize(value, options), { code: 'STANDALONE_IDENTITY_MAPPING_INVALID' });
    assert.equal(fs.readFileSync(result.local_path, 'utf8'), content);
  }
  const open = fs.openSync, write = fs.writeFileSync, lstat = fs.lstatSync;
  const directory = path.dirname(result.local_path);
  let temporaryOpens = 0, temporaryFd;
  fs.openSync = function(file, ...args) {
    const fd = open.call(this, file, ...args);
    if (typeof file === 'string' && file.startsWith(directory + path.sep) && file.endsWith('.tmp')) {
      temporaryOpens++; temporaryFd = fd;
    }
    return fd;
  };
  try {
    fs.lstatSync = function(file, ...args) {
      if (file === directory) throw Object.assign(new Error('synthetic directory refusal'), { code: 'EACCES' });
      return lstat.call(this, file, ...args);
    };
    assert.throws(() => ledger.materialize(state, options));
    assert.equal(temporaryOpens, 0, 'private directory admission precedes the writer open');
    fs.lstatSync = lstat;
    fs.writeFileSync = function(file, ...args) {
      if (file === temporaryFd) throw Object.assign(new Error('synthetic writer failure'), { code: 'EIO' });
      return write.call(this, file, ...args);
    };
    assert.throws(() => ledger.materialize(state, options), { code: 'EIO' });
  } finally { fs.openSync = open; fs.writeFileSync = write; fs.lstatSync = lstat; }
  assert.equal(temporaryOpens, 1);
  assert.equal(fs.readFileSync(result.local_path, 'utf8'), content, 'writer failure preserves the completed aid');
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp')), false);
  assert.deepEqual(snapshots.map(file => fs.readFileSync(file)), snapshotBytes);
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
  assert.match(fs.readFileSync(result.local_path, 'utf8'), /Nicht eindeutig zuordenbare Pseudonymstellen: 1\./u);
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
  const largeToken = 'e'.repeat(64);
  const entries = Array.from({ length: 400 }, (_, index) => ({
    pseudonym: `[PERSON_${String(index + 1).padStart(3, '0')}]`, original: `Synthetischer langer Originalname ${index} für die Kapazitätsgegenprobe`
  }));
  const largeState = { ...state, token: largeToken, items: Array.from({ length: 100 }, (_, index) => ({
    id: index.toString(16).padStart(32, '0'), status: 'released', source_label: `Unterordner/Datei-${index}.docx`
  })) };
  for (const item of largeState.items) ledger.capture(largeToken, item.id, `ds_${item.id}`, entries, options);
  const large = ledger.materialize(largeState, options);
  assert.equal(large.complete, true);
  assert.ok(fs.statSync(large.local_path).size > 2 * 1024 * 1024, 'aggregate crosses single-snapshot limit');
  assert.equal(ledger.documentAvailable(largeToken, options), true);
  const largeRun = path.join(output, 'Lauf-20261005-123000-abcdef02');
  fs.mkdirSync(largeRun);
  assert.equal(ledger.publishDocumentToRun(largeToken, largeRun, options).published, true);
  assert.equal(ledger.publishDocumentToRun(largeToken, largeRun, options).existing, true);
  const largeTime = fs.statSync(large.local_path).mtimeMs;
  ledger.materialize(largeState, options);
  assert.equal(fs.statSync(large.local_path).mtimeMs, largeTime);
  // A historical public aid is an immutable user copy. A different private
  // rendering must not overwrite that copy or rewrite its publication marker.
  const legacyToken = 'f'.repeat(64), legacyState = { ...state, token: legacyToken, items: [state.items[0]] };
  ledger.capture(legacyToken, first, `ds_${first}`, [{ pseudonym: '[PERSON_011]', original: 'Denise Koch' }], options);
  const legacyPrivate = ledger.materialize(legacyState, options).local_path;
  fs.writeFileSync(legacyPrivate, 'Historical confidential mapping: [PERSON_011] = Denise Koch\r\n');
  const legacyRun = path.join(output, 'Lauf-20261005-123000-abcdef03'); fs.mkdirSync(legacyRun);
  const legacyPublic = ledger.publishDocumentToRun(legacyToken, legacyRun, options).local_path;
  const marker = path.join(ledger.privateRoot(options), legacyToken, 'publication.json');
  const oldPublic = fs.readFileSync(legacyPublic), oldMarker = fs.readFileSync(marker);
  assert.equal(ledger.materialize(legacyState, options).complete, true);
  assert.throws(() => ledger.publishDocumentToRun(legacyToken, legacyRun, options),
    { code: 'STANDALONE_IDENTITY_MAPPING_INVALID' });
  assert.deepEqual(fs.readFileSync(legacyPublic), oldPublic);
  assert.deepEqual(fs.readFileSync(marker), oldMarker);
  assert.equal(ledger.documentAvailable(legacyToken, options), true, 'the current private aid remains available');
  console.log('STANDALONE IDENTITY LEDGER PASS');
} finally {
  const resolved = fs.realpathSync.native(root);
  assert.ok(resolved.startsWith(fs.realpathSync.native(os.tmpdir()) + path.sep), 'test cleanup stays in temporary storage');
  fs.rmSync(resolved, { recursive: true });
}
