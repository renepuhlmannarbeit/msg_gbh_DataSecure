import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readCentralModes } from '../scripts/lib/zip.mjs';
import { isolatedSidecarEnvironment, removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { office, passivePresentation, embeddedWorkbookPresentation, image, pdf, text as conversionText } from './helpers/conversion-fixtures.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const { xlsxCounterexample } = require('./lib/conversion-counterexamples.js');
const { zipStore } = require('./lib/zip.js');
const { opcControlEntries } = require('./lib/opc.js');
const { positiveProfileFixtures } = require('../docs/acceptance/UAT_TEST_KIT/tools/generate-synthetic-uat-fixtures.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const productTarget = process.platform === 'darwin' ? `macos-${process.arch}` : 'windows-x64';
assert.ok(['windows-x64', 'macos-x64', 'macos-arm64'].includes(productTarget));
const zip = path.resolve(process.argv[2] || path.join(root, 'dist', `DataSecure-Standalone-${version}-${productTarget}.zip`));
const extraction = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
const install = path.join(extraction, 'Leerzeichen ünicode');
const sourceDirectory = path.join(extraction, 'Quellen');
const resultDirectory = path.join(extraction, 'Ergebnisse');

function safeRemove() {
  removePackageSmokeScope(root, extraction);
}

function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

function childProcessPath(value) {
  if (process.platform !== 'win32') return value;
  if (value.startsWith('\\\\?\\UNC\\')) return `\\\\${value.slice(8)}`;
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

function relativeFiles(rootDirectory) {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else files.push(relative);
    }
  };
  visit(rootDirectory);
  return files.sort();
}

function protocolClient(child, stderr) {
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const failAll = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (length < 2 || length > 1024 * 1024) return failAll(new Error('STANDALONE_SMOKE_FRAME_INVALID'));
      if (buffer.length < length + 4) return;
      let value;
      try { value = JSON.parse(buffer.subarray(4, 4 + length)); }
      catch { return failAll(new Error('STANDALONE_SMOKE_RESPONSE_INVALID')); }
      buffer = buffer.subarray(4 + length);
      const waiter = pending.get(value.request_id);
      if (!waiter) return failAll(new Error('STANDALONE_SMOKE_RESPONSE_UNEXPECTED'));
      pending.delete(value.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  });
  child.once('error', () => failAll(new Error('STANDALONE_SMOKE_SPAWN_FAILED')));
  child.stdin.on('error', () => failAll(new Error('STANDALONE_SMOKE_STDIN_FAILED')));
  child.once('exit', (code) => failAll(new Error(`STANDALONE_SMOKE_EXIT:${code}`)));
  return {
    request(value) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(value.request_id);
          reject(new Error(`STANDALONE_SMOKE_TIMEOUT:${stderr.value.slice(0, 500)}`));
        }, 45000);
        pending.set(value.request_id, { resolve, reject, timer });
        child.stdin.write(frame(value));
      });
    }
  };
}

let child;
let childClosed = false;
let closePromise;
try {
  const environment = isolatedSidecarEnvironment(root, extraction);
  // Exercise the optional trace through the actual packaged child chain, not
  // only an in-process logger double. This opt-in is scoped to this test child.
  environment.EU_PRIVACY_SUPPORT_MODE = '1';
  fs.mkdirSync(install, { recursive: true });
  const archiveBytes = fs.readFileSync(zip);
  const entries = readZip(archiveBytes, { maxEntries: 15000, maxUncompressed: 768 * 1024 * 1024 });
  const modes = readCentralModes(archiveBytes);
  const prefix = `DataSecure-Standalone-${version}-${productTarget}/`;
  for (const [name, bytes] of entries) {
    assert.ok(name.startsWith(prefix));
    const relative = name.slice(prefix.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const destination = path.join(install, ...relative.split('/'));
    assert.equal(path.relative(install, destination).startsWith('..'), false);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
    if (process.platform === 'darwin') fs.chmodSync(destination, modes.get(name) & 0o777);
  }
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
  // Exercise the shipped parser/worker chain, not a replacement worker or one
  // synthetic TXT path. All four fixtures describe the same synthetic parties.
  const fixtures = positiveProfileFixtures();
  const sourceNames = ['txt/personnel-profile.txt', 'markdown/personnel-profile.md',
    'csv/personnel-profile.csv', 'docx/personnel-profile.docx'];
  const originals = sourceNames.map((name) => fixtures.get(path.posix.basename(name)));
  const sourceFiles = sourceNames.map((name, index) => {
    const destination = path.join(sourceDirectory, ...name.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, originals[index], { flag: 'wx' });
    return destination;
  });
  const launchRoot = process.platform === 'win32' ? `\\\\?\\${install}` : install;
  const bundle = path.join(launchRoot, 'DataSecure Standalone.app', 'Contents');
  const server = process.platform === 'darwin' ? path.join(bundle, 'Resources', 'server') : path.join(launchRoot, 'server');
  const runtime = process.platform === 'darwin' ? path.join(bundle, 'MacOS', 'datasecure-core')
    : path.join(launchRoot, 'datasecure-core-x86_64-pc-windows-msvc.exe');
  const sidecar = path.join(server, 'standalone', 'desktop-sidecar.js');
  const deny = path.join(server, 'network-deny.cjs');
  assert.equal(fs.statSync(deny).isFile(), true);
  child = childProcess.spawn(childProcessPath(runtime), ['--require=../network-deny.cjs', path.basename(sidecar)], {
    cwd: childProcessPath(path.dirname(sidecar)), windowsHide: true, shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: environment
  });
  closePromise = new Promise((resolve) => child.once('close', (code) => {
    childClosed = true;
    resolve(code);
  }));
  const stderr = { value: '' };
  child.stderr.on('data', (chunk) => { stderr.value = (stderr.value + chunk.toString('utf8')).slice(-4096); });
  let { request } = protocolClient(child, stderr);
  const status = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'get_public_state' });
  assert.equal(status.schema, 'datasecure-standalone-private-response/1');
  assert.equal(status.request_id, 'a'.repeat(16));
  assert.equal(status.ok, true);
  assert.equal(status.result.product_channel, 'standalone');
  const freshContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '9'.repeat(16), action: 'get_ui_context' });
  assert.equal(freshContext.ok, true);
  assert.equal(freshContext.result.result_folder, path.join(environment.DATASECURE_STANDALONE_DOCUMENTS_DIR, 'SecureDataMsg'),
    'fresh default Documents must be isolated before configuring an explicit result destination');
  assert.equal(freshContext.result.result_folder_is_default, true,
    'the UI must distinguish a proposed default path from a chosen result folder');
  assert.equal(fs.existsSync(freshContext.result.result_folder), false,
    'reading the first-run context must not silently create the proposed result folder');
  assert.equal(freshContext.result.latest_result_folder, '', 'a fresh profile must not recover any real-user run');
  assert.equal(fs.statSync(path.join(environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl')).isFile(), true);
  const admitted = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b'.repeat(16),
    action: 'admit_selected_sources', source_kind: 'folder', source_paths: [sourceDirectory] });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.result.selected_count, 4);
  assert.deepEqual([...admitted.result.ui_context.selected_files].sort(), [...sourceNames].sort());
  assert.deepEqual(admitted.result.ui_context.source_folders, [sourceDirectory]);
  const supplemental = path.join(sourceDirectory, 'supplemental.md');
  fs.writeFileSync(supplemental, '# Additional synthetic document\n', { flag: 'wx' });
  const extended = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b1'.repeat(8),
    action: 'admit_selected_sources', source_kind: 'files', source_paths: [supplemental] });
  assert.equal(extended.ok, true);
  assert.equal(extended.result.selected_count, 5,
    'the shipped sidecar must append a later picker choice before Start');
  assert.ok(extended.result.ui_context.selected_files.includes('supplemental.md'));
  const duplicate = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b2'.repeat(8),
    action: 'admit_selected_sources', source_kind: 'files', source_paths: [supplemental] });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.result.selected_count, 5);
  assert.equal(duplicate.result.already_selected_count, 1);
  const removedAddition = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b3'.repeat(8),
    action: 'remove_admitted_source', selection_index: 4 });
  assert.equal(removedAddition.ok, true);
  assert.equal(removedAddition.result.selected_count, 4,
    'removing the late addition restores the exact original selection');
  const configured = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(16),
    action: 'configure_results', source_paths: [resultDirectory] });
  assert.equal(configured.ok, true);
  assert.equal(configured.result.result_folder, resultDirectory);
  const context = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'd'.repeat(16), action: 'get_ui_context' });
  assert.equal(context.ok, true);
  assert.equal(context.result.result_folder, resultDirectory);
  assert.equal(context.result.result_folder_is_default, false,
    'the selected result folder must dismiss first-run guidance');
  assert.deepEqual([...context.result.selected_files].sort(), [...sourceNames].sort());
  const started = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'e'.repeat(16),
    action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' });
  assert.equal(started.ok, true);
  assert.equal(started.result.event, 'batch_accepted');
  let terminal;
  const terminalStates = new Set(['review_required', 'stopped', 'export_pending', 'results_available', 'completed_without_results']);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const requestId = attempt.toString(16).padStart(16, '0');
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: requestId, action: 'get_public_state' });
    assert.equal(polled.ok, true);
    if (terminalStates.has(polled.result.state)) { terminal = polled.result; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(terminal, 'the real packaged worker handoff must reach a durable terminal state');
  assert.equal(terminal.state, 'results_available');
  assert.equal(terminal.result_count, 4);
  const completedContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '1'.repeat(16), action: 'get_ui_context' });
  assert.equal(completedContext.ok, true);
  const exactRun = completedContext.result.latest_result_folder;
  assert.equal(typeof exactRun, 'string');
  assert.equal(path.dirname(exactRun), path.join(resultDirectory, 'DataSecure-Output'));
  assert.match(path.basename(exactRun), /^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u);
  assert.equal(fs.statSync(exactRun).isDirectory(), true);
  const mapping = path.join(exactRun, 'DataSecure-Zuordnung.csv');
  assert.equal(fs.statSync(mapping).isFile(), true,
    'a completed standalone run must publish its human-readable mapping in the exact run directory');
  const mappingText = fs.readFileSync(mapping, 'utf8');
  assert.equal(mappingText.charCodeAt(0), 0xfeff,
    'the visible mapping must carry an UTF-8 BOM so Excel decodes German punctuation correctly');
  for (const name of sourceNames) assert.ok(mappingText.includes(name), 'every source must have a mapping row');
  const confidentialFolder = path.join(exactRun, 'VERTRAULICH-NICHT-HOCHLADEN');
  const identities = path.join(confidentialFolder, 'DataSecure-Identitaeten-VERTRAULICH.txt');
  assert.equal(fs.statSync(identities).isFile(), true,
    'the shipped Standalone sidecar places the human mapping in the marked run subfolder');
  assert.deepEqual(fs.readdirSync(confidentialFolder), ['DataSecure-Identitaeten-VERTRAULICH.txt'],
    'private per-file snapshots never enter the result directory');
  assert.match(fs.readFileSync(identities, 'utf8'), /NICHT in KI-Systeme hochladen/u);
  assert.match(fs.readFileSync(identities, 'utf8'), /\[PERSON_001\] = lina testfeld/iu);
  const outputs = relativeFiles(exactRun).filter((name) => name.endsWith('.md'));
  assert.equal(outputs.length, 4, 'the actual mixed-format run must export all four results');
  assert.deepEqual(outputs, ['csv/Dokument-001-anonymisiert.md', 'docx/Dokument-002-anonymisiert.md',
    'markdown/Dokument-003-anonymisiert.md', 'txt/Dokument-004-anonymisiert.md'],
  'the shipped neutral naming mode must preserve folders while hiding source basenames');
  let expectedAliases;
  for (const name of outputs) {
    const markdown = fs.readFileSync(path.join(exactRun, ...name.split('/')), 'utf8');
    assert.doesNotMatch(markdown, /Lina|Testfeld|Nordstern|Falken|lina\.testfeld/iu);
    const persons = [...new Set(markdown.match(/\[PERSON_\d{3,}\]/gu))].sort();
    const companies = [...new Set(markdown.match(/\[UNTERNEHMEN_\d{3,}\]/gu))].sort();
    assert.equal(persons.length, 1, 'every result needs one readable person identity');
    assert.equal(companies.length, 2, 'employer and customer remain distinct company identities');
    const aliases = { persons, companies };
    if (expectedAliases) assert.deepEqual(aliases, expectedAliases, 'the same parties keep their labels across TXT/MD/CSV/DOCX');
    else expectedAliases = aliases;
    assert.ok(mappingText.includes(name), 'every output must be identifiable through the local mapping');
  }
  sourceFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), originals[index], 'source bytes stay unchanged'));
  const resolvedRun = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '2'.repeat(16), action: 'resolve_current_results' });
  assert.deepEqual(resolvedRun.result, {
    ok: true, target_kind: 'directory', local_path: exactRun, external_disclosure: false
  });
  const resolvedMapping = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '3'.repeat(16), action: 'resolve_local_ledger' });
  assert.deepEqual(resolvedMapping.result, {
    ok: true, target_kind: 'file', local_path: mapping, external_disclosure: false
  });
  if (Number.isSafeInteger(terminal.presentation_generation)) {
    await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: '4'.repeat(16),
      action: 'ack_terminal_presented', presentation_generation: terminal.presentation_generation });
  }
  // A syntactically broken CSV passes safe UTF-8 intake but must fail in the
  // real packaged parser. Its own completed run must never resolve run A's CSV.
  const failedSourceName = 'synthetisch-offenes-zitat.csv';
  const failedSource = path.join(sourceDirectory, failedSourceName);
  const failedOriginal = Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n', 'utf8');
  fs.writeFileSync(failedSource, failedOriginal, { flag: 'wx' });
  const failedAdmission = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: '5'.repeat(16),
    action: 'admit_selected_sources', source_kind: 'files', source_paths: [failedSource] });
  assert.equal(failedAdmission.ok, true, 'malformed CSV remains an admissible regular UTF-8 source');
  assert.equal(failedAdmission.result.selected_count, 1);
  const failedStart = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: '6'.repeat(16),
    action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' });
  assert.equal(failedStart.ok, true);
  let failedTerminal;
  let lastFailureState;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (0x1000 + attempt).toString(16).padStart(16, '0'), action: 'get_public_state' });
    assert.equal(polled.ok, true);
    lastFailureState = { state: polled.result.state, selected_count: polled.result.selected_count,
      failed_count: polled.result.failed_count, resumable: polled.result.resumable,
      export_pending_count: polled.result.export_pending_count };
    if (polled.result.selected_count === 1 && polled.result.state === 'completed_without_results') {
      failedTerminal = polled.result; break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(failedTerminal, `the real parser failure must finish its own batch; last content-free state: ${JSON.stringify(lastFailureState)}`);
  assert.equal(failedTerminal.result_count, 0);
  assert.equal(failedTerminal.failed_count, 1);
  assert.equal(failedTerminal.ledger_available, false);
  const failedContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '7'.repeat(16), action: 'get_ui_context' });
  assert.equal(failedContext.ok, true);
  const failedRun = failedContext.result.latest_result_folder;
  assert.equal(failedRun, '', 'an all-stopped run does not expose an empty result folder');
  const resolvedFailureMapping = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '8'.repeat(16), action: 'resolve_local_ledger' });
  assert.equal(resolvedFailureMapping.ok, false);
  assert.equal(resolvedFailureMapping.error_code, 'STANDALONE_RESULTS_MISSING');
  assert.deepEqual(fs.readFileSync(failedSource), failedOriginal, 'the parser failure must not modify its source');
  assert.equal(fs.readFileSync(mapping, 'utf8'), mappingText, 'the previous successful mapping remains unchanged');
  sourceFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), originals[index]));
  if (Number.isSafeInteger(failedTerminal.presentation_generation)) {
    await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a1'.repeat(8),
      action: 'ack_terminal_presented', presentation_generation: failedTerminal.presentation_generation });
  }
  // Reproduce the former RC113 defect through the shipped executable: a useful
  // XLSX extraction whose source coverage is explicitly incomplete must still
  // have its generated Markdown anonymized. Source coverage and privacy status
  // remain separate, visible facts; no raw intermediate Markdown is published.
  const wideSourceName = 'Privacy-Tabelle.xlsx';
  const wideSource = path.join(sourceDirectory, wideSourceName);
  const strictSpreadsheetNamespace = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
  const wideOriginal = xlsxCounterexample({ prefix: 'sheet', quote: "'", strict: true, overrides: [[
    'xl/worksheets/sheet1.xml',
    `<sheet:worksheet xmlns:sheet='${strictSpreadsheetNamespace}'><sheet:sheetData>` +
      `<sheet:row r='1'><sheet:c r='A1' t='inlineStr'><sheet:is><sheet:t>Feld</sheet:t></sheet:is></sheet:c>` +
      `<sheet:c r='B1' t='inlineStr'><sheet:is><sheet:t>Wert</sheet:t></sheet:is></sheet:c></sheet:row>` +
      `<sheet:row r='2'><sheet:c r='A2' t='inlineStr'><sheet:is><sheet:t>person</sheet:t></sheet:is></sheet:c>` +
      `<sheet:c r='B2' t='inlineStr'><sheet:is><sheet:t>Max Mustermann</sheet:t></sheet:is></sheet:c></sheet:row>` +
      `</sheet:sheetData></sheet:worksheet>`
  ]] });
  fs.writeFileSync(wideSource, wideOriginal, { flag: 'wx' });
  const docxSourceName = 'Privacy-Profil.docx';
  const docxSource = path.join(sourceDirectory, docxSourceName);
  const docxOriginal = zipStore([
    ...opcControlEntries('docx', { additionalOverrides: [{
      part: 'customXml/itemProps1.xml',
      contentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml'
    }] }),
    ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Name: Lara Beispiel</w:t></w:r></w:p></w:body></w:document>'],
    ['customXml/item1.xml', '<profile><department>Interne Testabteilung</department></profile>'],
    ['customXml/itemProps1.xml', '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>']
  ]);
  fs.writeFileSync(docxSource, docxOriginal, { flag: 'wx' });
  const wideAdmission = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'b1'.repeat(8), action: 'admit_selected_sources', source_kind: 'files',
    source_paths: [wideSource, docxSource] });
  assert.equal(wideAdmission.ok, true);
  assert.equal(wideAdmission.result.selected_count, 2);
  const wideStart = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'b2'.repeat(8), action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize',
    output_naming_mode: 'source-with-suffix' });
  assert.equal(wideStart.ok, true);
  let wideTerminal;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (0x1800 + attempt).toString(16).padStart(16, '0'), action: 'get_public_state' });
    assert.equal(polled.ok, true);
    if (polled.result.selected_count === 2 && terminalStates.has(polled.result.state)) {
      wideTerminal = polled.result; break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(wideTerminal, 'the packaged XLSX Markdown-first privacy run must terminate');
  assert.equal(wideTerminal.state, 'results_available', JSON.stringify(wideTerminal));
  assert.equal(wideTerminal.result_count, 2);
  assert.equal(wideTerminal.failed_count, 0);
  const wideContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'b3'.repeat(8), action: 'get_ui_context' });
  const wideRun = wideContext.result.latest_result_folder;
  const wideOutputs = fs.readdirSync(wideRun).filter(name => name.endsWith('.md'));
  assert.deepEqual(wideOutputs.sort(), ['Privacy-Profil-anonymisiert.md', 'Privacy-Tabelle-anonymisiert.md']);
  const wideMarkdown = wideOutputs.map(name => fs.readFileSync(path.join(wideRun, name), 'utf8')).join('\n');
  assert.match(wideMarkdown, /Extraktionsstatus: Markdown erzeugt; Vollständigkeit des Originalcontainers nicht garantiert/u);
  assert.match(wideMarkdown, /Anonymisierungsstatus: extrahierter Markdown-Inhalt vollständig geprüft/u);
  assert.doesNotMatch(wideMarkdown, /Max(?: |&#32;)Mustermann|Lara(?: |&#32;)Beispiel/u);
  assert.match(wideMarkdown, /\[PERSON_\d{3,}\]/u);
  assert.deepEqual(fs.readFileSync(wideSource), wideOriginal, 'wide privacy never modifies the XLSX source');
  assert.deepEqual(fs.readFileSync(docxSource), docxOriginal, 'Markdown-first privacy never modifies the DOCX source');
  const wideMapping = path.join(wideRun, 'DataSecure-Zuordnung.csv');
  assert.equal(fs.statSync(wideMapping).isFile(), true);
  const wideMappingText = fs.readFileSync(wideMapping, 'utf8');
  assert.equal(wideMappingText.charCodeAt(0), 0xfeff,
    'the real packaged XLSX mapping must be UTF-8 with BOM');
  assert.equal(wideMappingText,
    `\uFEFFOriginaldatei;Anonymisiertes Ergebnis\r\n` +
      `"${wideSourceName}";"Privacy-Tabelle-anonymisiert.md"\r\n` +
      `"${docxSourceName}";"Privacy-Profil-anonymisiert.md"\r\n`,
    'the real packaged XLSX/DOCX run must map each source to exactly its final successful result');
  assert.doesNotMatch(wideMappingText, /PARSER_COVERAGE_UNVERIFIED|Kein Ergebnis|â€“/u,
    'a successful Markdown-first XLSX run must not retain a preliminary stop or broken punctuation');
  if (Number.isSafeInteger(wideTerminal.presentation_generation)) {
    await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b4'.repeat(8),
      action: 'ack_terminal_presented', presentation_generation: wideTerminal.presentation_generation });
  }
  // Real second product purpose, in the very same shipped sidecar after two
  // anonymization runs. No mocked parser, worker, journal or export endpoint.
  const canvas = image();
  const png = canvas.toBuffer('image/png'), jpeg = canvas.toBuffer('image/jpeg');
  const { decodePng } = require('../plugins/data-secure/server/images/png');
  const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
  const extraSources = [
    ['Tabelle.xlsx', office('xlsx')], ['Folien.pptx', office('pptx')],
    ['Text.pdf', pdf([{ text: conversionText }])], ['Scan.pdf', pdf([{ image: jpeg }])],
    ['Bild.png', png], ['Bild.jpeg', jpeg], ['Bild.bmp', encodeBmp(decodePng(png))]
  ];
  const conversionSources = [...sourceFiles, ...extraSources.map(([name, bytes]) => {
    const destination = path.join(sourceDirectory, name);
    fs.writeFileSync(destination, bytes, { flag: 'wx' }); return destination;
  }), failedSource];
  const beforeConversion = conversionSources.map(file => fs.readFileSync(file));
  const conversionAdmission = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'c1'.repeat(8), action: 'admit_selected_sources', source_kind: 'files', source_paths: conversionSources });
  assert.equal(conversionAdmission.ok, true);
  assert.equal(conversionAdmission.result.selected_count, 12);
  const conversionStart = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'c2'.repeat(8), action: 'start_admitted_batch', processing_mode: 'markdown-only' });
  assert.equal(conversionStart.ok, true);
  let converted;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (0x2000 + attempt).toString(16).padStart(16, '0'), action: 'get_public_state' });
    assert.equal(polled.ok, true);
    lastFailureState = polled.result;
    if (polled.result.processing_mode === 'markdown-only' && terminalStates.has(polled.result.state)) {
      converted = polled.result; break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(converted, `conversion must finish without a review dialog: ${JSON.stringify(lastFailureState)}`);
  assert.equal(converted.state, 'results_available', JSON.stringify(converted));
  assert.equal(converted.result_count, 11);
  assert.equal(converted.failed_count, 1);
  assert.ok(converted.warning_count >= 6, 'Office/scan/image omissions are explicit and never block pure conversion');
  const convertedContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'c3'.repeat(8), action: 'get_ui_context' });
  const convertedRun = convertedContext.result.latest_result_folder;
  assert.equal(path.dirname(convertedRun), path.join(resultDirectory, 'DataSecure-Markdown'));
  const convertedMapping = path.join(convertedRun, 'DataSecure-Zuordnung.csv');
  assert.equal(fs.existsSync(convertedMapping), false, 'pure conversion does not create a redundant source mapping');
  conversionSources.forEach((file, index) => {
    assert.deepEqual(fs.readFileSync(file), beforeConversion[index]);
  });
  const convertedFiles = relativeFiles(convertedRun).filter(name => name.endsWith('.md'));
  assert.equal(convertedFiles.length, 11);
  assert.deepEqual(convertedFiles, ['Bild.md', 'Bild (2).md', 'Bild (3).md', 'Folien.md', 'Scan.md', 'Tabelle.md',
    'Text.md', 'personnel-profile.md', 'personnel-profile (2).md', 'personnel-profile (3).md',
    'personnel-profile (4).md'].sort(),
  'an explicit multi-file selection has no shared root; basenames survive and deterministic collision suffixes are added');
  const texts = convertedFiles.map(name => fs.readFileSync(path.join(convertedRun, ...name.split('/')), 'utf8'));
  assert.equal(texts.filter(value => /Lina(?: |&#32;)Testfeld/u.test(value)).length, 4, 'all original four formats preserve person identities');
  assert.equal(texts.filter(value => /Max(?: |&#32;)Mustermann/u.test(value)).length, 7, 'all new converters, including OCR, preserve person identities');
  for (const value of texts) assert.doesNotMatch(value, /\[PERSON_|\[UNTERNEHMEN_|anonymized: true/u);
  assert.ok(texts.includes(originals[0].toString('utf8')), 'TXT contents are not normalized or redacted');
  assert.ok(texts.includes(originals[1].toString('utf8')), 'existing Markdown contents are preserved');
  const convertedResults = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'c4'.repeat(8), action: 'resolve_current_results' });
  assert.equal(convertedResults.ok, true); assert.equal(convertedResults.result.local_path, convertedRun);
  const convertedLedger = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'c5'.repeat(8), action: 'resolve_local_ledger' });
  assert.equal(convertedLedger.ok, false); assert.equal(convertedLedger.error_code, 'STANDALONE_LEDGER_MISSING');
  assert.equal(fs.readFileSync(mapping, 'utf8'), mappingText, 'conversion never rewrites a previous anonymized result');
  const productDataBase = process.platform === 'darwin'
    ? path.join(environment.HOME, 'Library', 'Application Support') : environment.LOCALAPPDATA;
  const supportDirectory = path.join(productDataBase, 'SecureDataMsg-Standalone', 'diagnostics', 'support-events');
  const conversionEvents = fs.readdirSync(supportDirectory).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(fs.readFileSync(path.join(supportDirectory, name), 'utf8')))
    .filter(event => ['converter_started', 'coverage_checked', 'converter_completed', 'converter_stopped'].includes(event.event));
  for (const [event, expected] of [['converter_started', 12], ['coverage_checked', 11],
    ['converter_completed', 11], ['converter_stopped', 1]]) {
    assert.equal(conversionEvents.filter(record => record.event === event).length, expected,
      `the shipped worker must persist ${event} without a source/runtime mock`);
  }
  assert.ok(conversionEvents.every(record => record.product_channel === 'standalone'));
  assert.doesNotMatch(JSON.stringify(conversionEvents), /Mustermann|Testfeld|Nordstern|personnel-profile|Tabelle\.xlsx|Quellen|Ergebnisse/u);
  process.stdout.write('STANDALONE REAL MIXED MARKDOWN CONVERSION PASS (11 results, 1 failed CSV, both modes)\n');
  const historyBefore = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'd1'.repeat(8), action: 'get_run_history' });
  assert.equal(historyBefore.ok, true);
  assert.equal(historyBefore.result.local_ui_only, true);
  assert.equal(historyBefore.result.entries.length, 4, 'each real run appears once, including wide privacy and the all-failed run');
  const historyRows = historyBefore.result.entries;
  assert.deepEqual(historyRows.map(row => row.processing_mode), ['markdown-only', 'markdown-and-anonymize',
    'markdown-and-anonymize', 'markdown-and-anonymize']);
  assert.ok(historyRows.every(row => !row.resumable));
  const expectedRuns = [convertedRun, wideRun, '', exactRun];
  for (const [index, row] of historyRows.entries()) {
    const resolvedResults = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: 'd2'.repeat(8), action: 'resolve_history_results', batch_id: row.batch_id });
    assert.equal(resolvedResults.ok, index !== 2);
    if (index === 2) assert.equal(resolvedResults.error_code, 'STANDALONE_RESULTS_MISSING');
    else assert.equal(resolvedResults.result.local_path, expectedRuns[index], 'history actions must never substitute the latest run');
    const resolvedLedger = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: 'd4'.repeat(8), action: 'resolve_history_ledger', batch_id: row.batch_id });
    assert.equal(resolvedLedger.ok, index !== 0 && index !== 2);
    if (index === 0 || index === 2) assert.equal(resolvedLedger.error_code, 'STANDALONE_LEDGER_MISSING');
    else assert.equal(resolvedLedger.result.local_path, path.join(expectedRuns[index], 'DataSecure-Zuordnung.csv'));
    const resume = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: 'd3'.repeat(8), action: 'continue_history_batch', batch_id: row.batch_id });
    assert.equal(resume.ok, false);
    assert.equal(resume.error_code, 'STANDALONE_NOTHING_TO_CONTINUE');
  }
  const nextRoot = path.join(extraction, 'Naechster-Ergebnisordner');
  fs.mkdirSync(nextRoot);
  assert.equal((await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'e4'.repeat(8), action: 'configure_results', source_paths: [nextRoot] })).ok, true);
  await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'f'.repeat(16), action: 'shutdown' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('STANDALONE_SMOKE_SHUTDOWN_TIMEOUT')); }, 10000);
    closePromise.then((code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`STANDALONE_SMOKE_SHUTDOWN:${code}`));
    });
  });
  // Fresh installed control process, same isolated user namespace: no frontend
  // cache or service double may supply the history or old destination paths.
  childClosed = false;
  child = childProcess.spawn(childProcessPath(runtime), ['--require=../network-deny.cjs', path.basename(sidecar)], {
    cwd: childProcessPath(path.dirname(sidecar)), windowsHide: true, shell: false,
    stdio: ['pipe', 'pipe', 'pipe'], env: environment
  });
  closePromise = new Promise(resolve => child.once('close', code => { childClosed = true; resolve(code); }));
  child.stderr.on('data', chunk => { stderr.value = (stderr.value + chunk.toString('utf8')).slice(-4096); });
  ({ request } = protocolClient(child, stderr));
  const restarted = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'd5'.repeat(8), action: 'get_run_history' });
  assert.equal(restarted.ok, true);
  assert.deepEqual(restarted.result.entries, historyRows, 'history survives fresh process and result root change');
  for (const [index, row] of historyRows.entries()) {
    const resolved = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: 'd6'.repeat(8), action: 'resolve_history_results', batch_id: row.batch_id });
    assert.equal(resolved.ok, index !== 2);
    if (index === 2) assert.equal(resolved.error_code, 'STANDALONE_RESULTS_MISSING');
    else assert.equal(resolved.result.local_path, expectedRuns[index]);
  }
  // RC143 regression: pure conversion of a PDF with passive objects worked,
  // but the subsequent Standalone anonymization used a different converter
  // policy and stopped before any result. Exercise the actual shipped sidecar,
  // admission, worker, privacy core, mapping and run history together.
  const passivePdfSource = path.join(sourceDirectory, 'Passives-Formular.pdf');
  const passivePptxSource = path.join(sourceDirectory, 'Passive-Folien.pptx');
  const embeddedPptxSource = path.join(sourceDirectory, 'Eingebettete-Tabelle.pptx');
  const passivePdfBytes = pdf([{ text: 'Name: Max Mustermann', annotation: true }], '', { form: true });
  const passivePptxBytes = passivePresentation();
  const embeddedPptxBytes = embeddedWorkbookPresentation();
  fs.writeFileSync(passivePdfSource, passivePdfBytes, { flag: 'wx' });
  fs.writeFileSync(passivePptxSource, passivePptxBytes, { flag: 'wx' });
  fs.writeFileSync(embeddedPptxSource, embeddedPptxBytes, { flag: 'wx' });
  const passiveAdmission = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'e7'.repeat(8), action: 'admit_selected_sources', source_kind: 'files',
    source_paths: [passivePdfSource, passivePptxSource, embeddedPptxSource] });
  assert.equal(passiveAdmission.ok, true);
  assert.equal(passiveAdmission.result.selected_count, 3);
  const passiveStart = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'e8'.repeat(8), action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize',
    output_naming_mode: 'neutral' });
  assert.equal(passiveStart.ok, true);
  let passiveTerminal;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (0x2800 + attempt).toString(16).padStart(16, '0'), action: 'get_public_state' });
    assert.equal(polled.ok, true);
    if (polled.result.selected_count === 3 && terminalStates.has(polled.result.state)) {
      passiveTerminal = polled.result; break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(passiveTerminal, 'the passive PDF/PPTX privacy run must terminate');
  assert.equal(passiveTerminal.state, 'results_available', JSON.stringify(passiveTerminal));
  assert.equal(passiveTerminal.result_count, 3);
  assert.equal(passiveTerminal.failed_count, 0);
  const passiveContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: 'e9'.repeat(8), action: 'get_ui_context' });
  const passiveRun = passiveContext.result.latest_result_folder;
  const passiveOutputs = relativeFiles(passiveRun).filter(name => name.endsWith('.md'));
  assert.equal(passiveOutputs.length, 3);
  for (const name of passiveOutputs) {
    const output = fs.readFileSync(path.join(passiveRun, ...name.split('/')), 'utf8');
    assert.match(output, /Extraktionsstatus: Markdown erzeugt; Vollständigkeit des Originalcontainers nicht garantiert/u);
    assert.match(output, /Anonymisierungsstatus: extrahierter Markdown-Inhalt vollständig geprüft/u);
    assert.doesNotMatch(output, /Max(?: |&#32;)Mustermann/u);
  }
  const passiveMapping = fs.readFileSync(path.join(passiveRun, 'DataSecure-Zuordnung.csv'), 'utf8');
  assert.match(passiveMapping, /Passives-Formular\.pdf/u);
  assert.match(passiveMapping, /Passive-Folien\.pptx/u);
  assert.match(passiveMapping, /Eingebettete-Tabelle\.pptx/u);
  assert.deepEqual(fs.readFileSync(passivePdfSource), passivePdfBytes);
  assert.deepEqual(fs.readFileSync(passivePptxSource), passivePptxBytes);
  assert.deepEqual(fs.readFileSync(embeddedPptxSource), embeddedPptxBytes);
  process.stdout.write('STANDALONE REAL PASSIVE PDF/PPTX PRIVACY PASS (3 results, embedded XLSX, separate source coverage)\n');
  const log = fs.readFileSync(path.join(environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl'), 'utf8');
  for (const row of historyRows) assert.ok(!log.includes(row.batch_id), 'run identifiers stay out of diagnostics');
  assert.ok(!log.includes(exactRun) && !log.includes(convertedRun));
  await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'f'.repeat(16), action: 'shutdown' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('STANDALONE_SMOKE_SHUTDOWN_TIMEOUT')); }, 10000);
    closePromise.then(code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`STANDALONE_SMOKE_SHUTDOWN:${code}`)); });
  });
  process.stdout.write('STANDALONE REAL HISTORY PASS (both purposes, failed run, exact targets, restart, changed result root)\n');
  process.stdout.write('STANDALONE PACKAGE ISOLATED SIDECAR SMOKE PASS\n');
} finally {
  if (child && !childClosed && child.exitCode === null) {
    child.kill();
    await closePromise;
  }
  if (process.env.DATASECURE_SMOKE_KEEP === '1') process.stderr.write(`STANDALONE_SMOKE_KEPT:${extraction}\n`);
  else safeRemove();
}
