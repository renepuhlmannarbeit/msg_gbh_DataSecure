// Create-only synthetic desktop campaign. Never starts an app, edits its
// settings, changes ACLs, overwrites results or operates the user's desktop.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readBoundFile } = require('../plugins/data-secure/server/core/bound-file-io');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const FIXTURES = Object.freeze([
  { name: 'profil-01.txt', bytes: 568, sha256: '30bea04e11753272bf8c04c690972dc24aae419f022b4fa811ec782eed491e04' },
  { name: 'kundenliste-01.csv', bytes: 942, sha256: '0852a1e9e156e34df284c7e8861ff86247b7ddcb71324764d60568499921bce5' },
  { name: 'scan-1.png', bytes: 68270, sha256: '3ff5759d10c84100373db413f560c2538b34d2fa50538aa777a22fbd7e0c1005' }
]);
export const CASES = Object.freeze([
  { id: '01-Markdown', inputs: [0, 1, 2], mode: 'markdown-only', ocr: false, results: 2, omitted_without_ocr: 1 },
  { id: '02-Markdown-OCR-Pruefung', inputs: [2], mode: 'markdown-only', ocr: true, ocr_contact_review: true, results: 1 },
  { id: '03-Gefuehrte-Anonymisierung', inputs: [0, 1, 2], mode: 'markdown-and-anonymize', ocr: false, fast_way: false, results: 2, omitted_without_ocr: 1 },
  { id: '04-Schnellweg', inputs: [0, 1, 2], mode: 'markdown-and-anonymize', ocr: true, fast_way: true, results: 3 },
  { id: '05-Vertagen-Neustart', inputs: [2], mode: 'markdown-and-anonymize', ocr: true, fast_way: false, results: 1,
    requires_observed_review: true, unsaved_draft_must_not_become_saved: true, idle_minutes: 5 },
  { id: '06-Export-Status', inputs: [], reuse: '03-Gefuehrte-Anonymisierung', explicit_export: true, expected_export_files: 2 },
  { id: '07-Verlauf-Fuenferfenster', inputs: [0], repeat_runs: 6, mode: 'markdown-only', ocr: false, results_per_run: 1, maximum_history_rows: 5 },
  { id: '08-Neuer-Leerer-Entwurf', inputs: [], reuse: '04-Schnellweg', no_automatic_restart: true },
  { id: '09-Auswahl-Abbrechen', inputs: [0], mode: 'markdown-only', picker_cancel_preserves_selection: true },
  { id: '10-Fehlender-Ergebnisordner', inputs: [0], mode: 'markdown-only', ocr: false, results: 1,
    later_missing_folder_must_not_be_recreated_or_count_as_new_install: true }
]);

function assertPlainAncestors(directory) {
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('DESKTOP_FIXTURE_PARENT_UNSAFE');
    if (path.dirname(current) === current) break;
  }
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (normalize(fs.realpathSync.native(directory)) !== normalize(path.resolve(directory))) throw Error('DESKTOP_FIXTURE_PARENT_REDIRECTED');
}
function readPinned(sourceRoot, row) {
  const source = path.join(sourceRoot, row.name), before = fs.lstatSync(source);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== row.bytes) throw Error('DESKTOP_FIXTURE_SOURCE_UNSAFE');
  const bytes = readBoundFile(source, { maximum: row.bytes, minimum: row.bytes }), after = fs.lstatSync(source);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw Error('DESKTOP_FIXTURE_SOURCE_MISMATCH');
  return bytes;
}
function writeExclusive(target, bytes) {
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('DESKTOP_FIXTURE_COPY_MISMATCH');
}
export function prepareCampaign({ sourceRoot, parent, name }) {
  if (!path.isAbsolute(sourceRoot) || !path.isAbsolute(parent) || !/^RC164-Desktop-Test-[0-9]{8}-[a-f0-9]{8}$/u.test(name))
    throw Error('DESKTOP_FIXTURE_ARGUMENT_INVALID');
  assertPlainAncestors(sourceRoot); assertPlainAncestors(parent);
  // Check all golden bytes before creating any campaign file.
  const inputs = FIXTURES.map(row => readPinned(sourceRoot, row));
  const root = path.join(parent, name);
  if (path.dirname(root) !== path.resolve(parent)) throw Error('DESKTOP_FIXTURE_DESTINATION_INVALID');
  fs.mkdirSync(root, { recursive: false, mode: 0o700 });
  const inventory = [];
  for (const testCase of CASES) {
    const directory = path.join(root, testCase.id);
    fs.mkdirSync(directory, { mode: 0o700 });
    for (const literal of ['EINGABEN', 'ERGEBNISSE', 'BELEGE']) fs.mkdirSync(path.join(directory, literal), { mode: 0o700 });
    for (const index of testCase.inputs) {
      const row = FIXTURES[index], relative = `${testCase.id}/EINGABEN/${row.name}`;
      writeExclusive(path.join(root, relative), inputs[index]);
      inventory.push({ file: relative, bytes: row.bytes, sha256: row.sha256 });
    }
  }
  const manifest = { schema: 'datasecure-desktop-campaign/1', target_app_version: '3.2.0-rc164', synthetic_only: true,
    source_fixture_version: 'unchanged-rc148-corpus', prepared_at: new Date().toISOString(),
    candidate_binding: 'PENDING_EXACT_ARCHIVE_AND_EXE_HASH', acceptance: 'NOT_RUN', native_macos: 'NOT_RUN',
    root, cases: CASES, inputs: inventory };
  writeExclusive(path.join(root, 'CAMPAIGN.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  writeExclusive(path.join(root, 'BITTE-LESEN.txt'), Buffer.from(
    'Nur EINGABEN eines einzelnen Testfalls waehlen, nie diesen Gesamtordner.\n' +
    'ERGEBNISSE ist das Ausgabeziel; BELEGE ist nur fuer Testbelege.\n' +
    'Test 06 verwendet den abgeschlossenen Lauf von Test 03, Test 08 den von Test 04.\n' +
    'Das Erzeugen dieser Ordner ist KEIN bestandener Test und startet keine App.\n' +
    'Pruefplan: docs/acceptance/RC164_DESKTOP_PLAYBOOK_20261018.md im Repository.\n' +
    'Alle Daten sind synthetisch. Nicht anschreiben, anrufen oder fuer Zahlungen verwenden.\n'));
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) throw Error('Usage: node prepare-standalone-desktop-acceptance.mjs <source-input-directory> <existing-parent> <new-campaign-name>');
  const result = prepareCampaign({ sourceRoot: process.argv[2], parent: process.argv[3], name: process.argv[4] });
  console.log(JSON.stringify({ root: result.root, synthetic_files: result.inputs.length, cases: result.cases.length,
    acceptance: result.acceptance, candidate_binding: result.candidate_binding }));
}
