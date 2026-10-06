// Operator-driven, package-bound Tauri/WebView acceptance. Preparing fixtures
// does not prove native interaction; no automatic Node decision is used here.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { readCentralModes } from '../../scripts/lib/zip.mjs';
import { packagedReviewFixtures, assertPackagedReviewOutputs } from '../helpers/standalone-packaged-review.mjs';
import { packagedOcrFixtures, assertPackagedOcrOutputs, contactReferences, correctedPhone, correctionSentinel } from '../helpers/standalone-packaged-ocr-review.mjs';
import { verifyExtractedCandidate } from '../helpers/standalone-candidate-integrity.mjs';
import { verifyStandaloneInventory, verifyArchiveChecksum } from '../../scripts/lib/standalone-package-integrity.mjs';
import { nativeDiagnosticEvents } from '../helpers/native-diagnostic-events.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
const { mainReady, reviewReady } = require('../helpers/native-review-readiness.js');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const infoName = 'NATIVE-REVIEW-CAMPAIGN.json';
const receiptName = 'NATIVE-REVIEW-RECEIPT.json';
const targetForHost = () => process.platform === 'win32' ? 'windows-x64'
  : process.platform === 'darwin' ? `macos-${process.arch}` : null;
function checkedScope(scope) {
  const parent = fs.realpathSync.native(os.tmpdir());
  const resolved = path.resolve(scope);
  assert.equal(path.dirname(resolved), parent, 'CAMPAIGN_SCOPE_INVALID');
  assert.match(path.basename(resolved), /^\.tmp-standalone-native-[a-f0-9]{32}$/u);
  const stat = fs.lstatSync(resolved);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(fs.realpathSync.native(resolved), resolved, 'CAMPAIGN_SCOPE_REDIRECTED');
  return resolved;
}
function events(scope) {
  return nativeDiagnosticEvents(path.join(scope, 'temp', 'SecureDataMsg-Standalone'));
}
function writeReceipt(scope, metadata, status, detail = {}) {
  const receipt = { schema: 'datasecure-native-review-campaign/1', status,
    target: metadata.target, version: metadata.version, archive_sha256: metadata.archive_sha256,
    campaign_kind: metadata.campaign_kind || 'entity-review',
    coverage: 'operator-driven-native-Tauri-WebView-review-with-output-checks', ...detail };
  fs.writeFileSync(path.join(scope, receiptName), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
function verifyCandidate(scope, metadata) {
  const bytes = fs.readFileSync(metadata.archive);
  assert.equal(hash(bytes), metadata.archive_sha256, 'CAMPAIGN_ARCHIVE_CHANGED');
  const entries = readZip(bytes, { maxEntries: 15000, maxUncompressed: 768 * 1024 * 1024 });
  const prefix = `DataSecure-Standalone-${metadata.version}-${metadata.target}/`;
  const relative = new Map([...entries].map(([name, value]) => {
    assert.ok(name.startsWith(prefix), 'CAMPAIGN_ARCHIVE_ROOT_INVALID');
    return [name.slice(prefix.length), value];
  }));
  const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json'));
  verifyStandaloneInventory(relative, manifest);
  verifyExtractedCandidate(path.join(scope, 'candidate'), entries, readCentralModes(bytes));
}
function check(scope) {
  scope = checkedScope(scope);
  const metadata = readJson(path.join(scope, infoName));
  assert.equal(metadata.target, targetForHost(), 'CAMPAIGN_HOST_MISMATCH');
  assert.equal(hash(fs.readFileSync(metadata.archive)), metadata.archive_sha256, 'CAMPAIGN_ARCHIVE_CHANGED');
  assert.equal(metadata.operator_attestation, true, 'CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED');
  assert.ok(['entity-review', 'ocr-contact'].includes(metadata.campaign_kind || 'entity-review'), 'CAMPAIGN_KIND_INVALID');
  const ocr = metadata.campaign_kind === 'ocr-contact';
  verifyCandidate(scope, metadata);
  const records = events(scope);
  const starts = records.filter(record => record.event === 'application_started' && record.product_version === metadata.version);
  const sessions = [...new Set(starts.map(record => record.session_id))];
  assert.equal(sessions.length, ocr ? 3 : 2, 'CAMPAIGN_RESTART_NOT_OBSERVED');
  for (const id of sessions) {
    const session = records.filter(record => record.session_id === id);
    assert.equal(mainReady(session), true, 'CAMPAIGN_MAIN_IPC_NOT_SUCCESSFUL');
    assert.equal(reviewReady(session), true, 'CAMPAIGN_REVIEW_IPC_NOT_SUCCESSFUL');
  }
  const successful = action => records.filter(record => record.event === 'ipc_response_ok' && record.action === action).length;
  assert.ok(successful('submit_review') >= (ocr ? 5 : 3), 'CAMPAIGN_DEFER_AND_BOTH_REVIEW_GROUPS_NOT_OBSERVED');
  assert.ok(successful('continue_history_batch') + successful('continue_current_batch') +
    successful('continue_review_session') >= (ocr ? 3 : 2), 'CAMPAIGN_NATIVE_CONTINUATION_NOT_OBSERVED');
  if (!ocr) assert.ok(successful('get_run_failures') >= 1, 'CAMPAIGN_NATIVE_FAILED_FILENAME_REQUEST_NOT_OBSERVED');
  const visible = path.join(scope, 'Ergebnisse', 'DataSecure-Output');
  const runs = fs.readdirSync(visible).filter(name => /^Lauf-/u.test(name));
  assert.equal(runs.length, 1, 'CAMPAIGN_RESUME_MUST_NOT_CREATE_A_SECOND_RUN');
  const run = path.join(visible, runs[0]);
  const files = fs.readdirSync(run).filter(name => name.endsWith('.md'));
  assert.equal(files.length, ocr ? 2 : 4, 'CAMPAIGN_RESULTS_INCOMPLETE');
  const outputs = files.map(name => fs.readFileSync(path.join(run, name), 'utf8'));
  if (ocr) assertPackagedOcrOutputs(outputs);
  else assertPackagedReviewOutputs(outputs);
  const mapping = fs.readFileSync(path.join(run, 'DataSecure-Zuordnung.csv'), 'utf8');
  if (ocr) for (const { name } of contactReferences) assert.ok(mapping.includes(name), 'CAMPAIGN_OCR_SOURCE_MAPPING_MISSING');
  else assert.match(mapping, /05-nicht-verarbeitet\.csv/u);
  for (const [name, bytes] of ocr ? packagedOcrFixtures() : packagedReviewFixtures())
    assert.deepEqual(fs.readFileSync(path.join(scope, 'Quellen', name)), bytes);
  return writeReceipt(scope, metadata, 'PASS', { native_sessions: sessions.length, result_count: ocr ? 2 : 4,
    failed_source: ocr ? null : '05-nicht-verarbeitet.csv', operator_attestation: true });
}

async function launch(scope) {
  scope = checkedScope(scope); const metadata = readJson(path.join(scope, infoName));
  assert.equal(metadata.target, targetForHost(), 'CAMPAIGN_HOST_MISMATCH');
  assert.equal(hash(fs.readFileSync(metadata.archive)), metadata.archive_sha256, 'CAMPAIGN_ARCHIVE_CHANGED');
  metadata.operator_attestation = false;
  fs.writeFileSync(path.join(scope, infoName), JSON.stringify(metadata, null, 2) + '\n');
  writeReceipt(scope, metadata, 'NOT_RUN');
  const product = path.join(scope, 'candidate', `DataSecure-Standalone-${metadata.version}-${metadata.target}`);
  const executable = process.platform === 'win32' ? path.join(product, 'DataSecure Standalone.exe')
    : path.join(product, 'DataSecure Standalone.app', 'Contents', 'MacOS', 'datasecure-standalone');
  const environment = { PATH: process.platform === 'win32' ? '' : '/usr/bin:/bin',
    DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT: scope, WEBVIEW2_USER_DATA_FOLDER: path.join(scope, 'webview', 'main') };
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec']) if (process.env[key]) environment[key] = process.env[key];
  if (process.platform === 'darwin') Object.assign(environment, { HOME: path.join(scope, 'profile'),
    XDG_DATA_HOME: path.join(scope, 'profile', 'Xdg'), TMPDIR: path.join(scope, 'temp'),
    DATASECURE_STANDALONE_DOCUMENTS_DIR: path.join(scope, 'profile', 'Documents') });
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const ocr = metadata.campaign_kind === 'ocr-contact';
  try {
    for (const phase of ocr ? [1, 2, 3] : [1, 2]) {
      verifyCandidate(scope, metadata);
      process.stdout.write(phase === 1
        ? `\n1. Ergebnisordner auf ${path.join(scope, 'Ergebnisse')} setzen.\n2. Quellenordner ${path.join(scope, 'Quellen')} anonymisieren.\n3. Im Lauf die Prüfung öffnen, „Später entscheiden“ wählen und die App normal schließen.\n`
        : ocr
          ? phase === 2
            ? `\n4. Genau denselben Lauf fortsetzen. E-Mail der ersten Datei ausdrücklich zu ${contactReferences[0].corrected} und Telefon zu ${correctedPhone} korrigieren und freigeben.\n5. Im selben Fenster die Kontakte der zweiten Datei prüfen: E-Mail zu ${contactReferences[1].corrected} und Telefon zu ${correctedPhone} korrigieren und freigeben.\n6. Erst danach auf die normale Entitätsprüfung warten. Dort müssen BEIDE geänderten E-Mails und die geänderte Telefonnummer im Quellkontext stehen, nicht die alten Bildwerte. „Später entscheiden“ wählen und App normal schließen.\n`
            : `\n7. Denselben Lauf erneut fortsetzen. BEIDE GEÄNDERTEN E-Mails und die Telefonnummer müssen weiterhin im Quellkontext stehen. ${correctionSentinel} beibehalten und freigeben.\n8. Im selben Fenster bis zum Abschluss warten. Beide Ergebnisse kontrollieren; App normal schließen. Keine bloße Bestätigung anstelle der Korrektur verwenden.\n`
          : '\n4. Genau denselben Lauf im Verlauf fortsetzen.\n5. SYNTHETISCHER HÄRTETEST als Unternehmen, TESTRUN VERIFIZIERER als Person markieren und freigeben.\n6. Im selben Prüffenster warten; anschließend SYNTHETISCHER FOLGETEST beibehalten und freigeben.\n7. Den konkreten CSV-Dateinamen samt Grund kontrollieren; App normal schließen.\n');
      const child = spawn(executable, [], { cwd: path.dirname(executable), env: environment, shell: false,
        windowsHide: false, stdio: ['ignore', 'ignore', 'inherit'] });
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
      assert.equal(code, 0, 'CAMPAIGN_NATIVE_APP_EXIT_FAILED');
      const expected = phase === 1 ? 'DEFERRED' : ocr ? phase === 2 ? 'CORRECTED_AND_DEFERRED' : 'CORRECTED' : 'REVIEWED';
      const answer = await readline.question(`Nach tatsächlicher Bedienung ${expected} eingeben (sonst bleibt NOT_RUN): `);
      assert.equal(answer.trim(), expected, 'CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED');
    }
    metadata.operator_attestation = true;
    fs.writeFileSync(path.join(scope, infoName), JSON.stringify(metadata, null, 2) + '\n');
    process.stdout.write(JSON.stringify(check(scope)) + '\n');
  } finally { readline.close(); }
}

const [mode, argument] = process.argv.slice(2);
if (!['--prepare', '--prepare-ocr', '--launch', '--check'].includes(mode) || !argument) {
  throw new Error('Usage: node tests/manual/standalone-native-review-campaign.mjs --prepare[-ocr] <exact ZIP> | --launch <printed scope> | --check <printed scope>');
}
if (!targetForHost()) { process.stderr.write('NATIVE REVIEW CAMPAIGN NOT_RUN (Windows/macOS host required)\n'); process.exitCode = 77; }
else if (['--prepare', '--prepare-ocr'].includes(mode)) {
  const archive = path.resolve(argument), bytes = fs.readFileSync(archive), entries = readZip(bytes, { maxEntries: 15000, maxUncompressed: 768 * 1024 * 1024 });
  verifyArchiveChecksum(bytes, archive, fs.readFileSync(`${archive}.sha256`, 'utf8'));
  const top = entries.keys().next().value.split('/')[0];
  const relative = new Map([...entries].map(([name, data]) => { assert.ok(name.startsWith(`${top}/`)); return [name.slice(top.length + 1), data]; }));
  const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json')); verifyStandaloneInventory(relative, manifest);
  assert.equal(manifest.target, targetForHost(), 'CAMPAIGN_HOST_MISMATCH');
  const verifier = manifest.target === 'windows-x64' ? ['scripts/verify-standalone-package.mjs', archive]
    : ['scripts/verify-standalone-macos-package.mjs', '--target', manifest.target, '--archive', archive];
  const verified = spawnSync(process.execPath, verifier, { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(verified.status, 0, verified.stderr);
  const scope = path.join(fs.realpathSync.native(os.tmpdir()), `.tmp-standalone-native-${crypto.randomUUID().replaceAll('-', '')}`);
  fs.mkdirSync(scope, { mode: 0o700 });
  for (const folder of ['candidate', 'profile/Local', 'profile/Roaming', 'profile/Xdg', 'profile/Documents',
    'temp/SecureDataMsg-Standalone', 'webview/main', 'Quellen', 'Ergebnisse']) fs.mkdirSync(path.join(scope, ...folder.split('/')), { recursive: true });
  const modes = readCentralModes(bytes);
  for (const [name, data] of entries) {
    const destination = path.join(scope, 'candidate', ...name.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, data, { flag: 'wx' });
    if (process.platform === 'darwin') fs.chmodSync(destination, modes.get(name) & 0o777);
  }
  for (const [name, data] of mode === '--prepare-ocr' ? packagedOcrFixtures() : packagedReviewFixtures())
    fs.writeFileSync(path.join(scope, 'Quellen', name), data, { flag: 'wx' });
  const metadata = { archive, archive_sha256: hash(bytes), version: manifest.version, target: manifest.target,
    campaign_kind: mode === '--prepare-ocr' ? 'ocr-contact' : 'entity-review', operator_attestation: false };
  fs.writeFileSync(path.join(scope, infoName), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  writeReceipt(scope, metadata, 'NOT_RUN');
  process.stdout.write(`Native Tauri/WebView campaign prepared, NOT_RUN.\nnode tests/manual/standalone-native-review-campaign.mjs --launch "${scope}"\nSynthetic profile retained for inspection; no user profile or existing run is used.\n`);
} else if (mode === '--launch') await launch(argument);
else process.stdout.write(JSON.stringify(check(argument)) + '\n');
