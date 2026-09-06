import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isolatedSidecarEnvironment, removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { office, image, pdf, text as conversionText } from './helpers/conversion-fixtures.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zip = path.resolve(process.argv[2] || path.join(root, 'dist', `DataSecure-Standalone-${version}-windows-x64.zip`));
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
  const entries = readZip(fs.readFileSync(zip), { maxEntries: 2000, maxUncompressed: 512 * 1024 * 1024 });
  const prefix = `DataSecure-Standalone-${version}-windows-x64/`;
  for (const [name, bytes] of entries) {
    assert.ok(name.startsWith(prefix));
    const relative = name.slice(prefix.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const destination = path.join(install, ...relative.split('/'));
    assert.equal(path.relative(install, destination).startsWith('..'), false);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
  // Exercise the shipped parser/worker chain, not a replacement worker or one
  // synthetic TXT path. All four fixtures describe the same synthetic parties.
  const fixtureRoot = path.join(root, 'docs', 'acceptance', 'UAT_TEST_KIT', 'inputs', '01-positive');
  const sourceNames = ['personnel-profile.txt', 'personnel-profile.md', 'personnel-profile.csv', 'personnel-profile.docx'];
  const originals = sourceNames.map((name) => fs.readFileSync(path.join(fixtureRoot, name)));
  const sourceFiles = sourceNames.map((name, index) => {
    const destination = path.join(sourceDirectory, name);
    fs.writeFileSync(destination, originals[index], { flag: 'wx' });
    return destination;
  });
  const launchRoot = process.platform === 'win32' ? `\\\\?\\${install}` : install;
  const runtime = path.join(launchRoot, 'datasecure-core-x86_64-pc-windows-msvc.exe');
  const sidecar = path.join(launchRoot, 'server', 'standalone', 'desktop-sidecar.js');
  const deny = path.join(install, 'server', 'network-deny.cjs');
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
  const { request } = protocolClient(child, stderr);
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
  assert.equal(freshContext.result.latest_result_folder, '', 'a fresh profile must not recover any real-user run');
  assert.equal(fs.statSync(path.join(environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl')).isFile(), true);
  const admitted = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b'.repeat(16),
    action: 'admit_selected_sources', source_kind: 'files', source_paths: sourceFiles });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.result.selected_count, 4);
  assert.deepEqual([...admitted.result.ui_context.selected_files].sort(), [...sourceNames].sort());
  assert.deepEqual(admitted.result.ui_context.source_folders, [sourceDirectory]);
  const configured = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(16),
    action: 'configure_results', source_paths: [resultDirectory] });
  assert.equal(configured.ok, true);
  assert.equal(configured.result.result_folder, resultDirectory);
  const context = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'd'.repeat(16), action: 'get_ui_context' });
  assert.equal(context.ok, true);
  assert.equal(context.result.result_folder, resultDirectory);
  assert.deepEqual([...context.result.selected_files].sort(), [...sourceNames].sort());
  const started = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'e'.repeat(16),
    action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize' });
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
  for (const name of sourceNames) assert.ok(mappingText.includes(name), 'every source must have a mapping row');
  const outputs = fs.readdirSync(exactRun).filter((name) => name.endsWith('.md')).sort();
  assert.equal(outputs.length, 4, 'the actual mixed-format run must export all four results');
  let expectedAliases;
  for (const name of outputs) {
    const markdown = fs.readFileSync(path.join(exactRun, name), 'utf8');
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
    action: 'start_admitted_batch', processing_mode: 'markdown-and-anonymize' });
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
  assert.equal(failedTerminal.ledger_available, true);
  const failedContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '7'.repeat(16), action: 'get_ui_context' });
  assert.equal(failedContext.ok, true);
  const failedRun = failedContext.result.latest_result_folder;
  assert.equal(path.dirname(failedRun), path.join(resultDirectory, 'DataSecure-Output'));
  assert.notEqual(failedRun, exactRun);
  assert.deepEqual(fs.readdirSync(failedRun), ['DataSecure-Zuordnung.csv']);
  const failedMapping = path.join(failedRun, 'DataSecure-Zuordnung.csv');
  const failureText = fs.readFileSync(failedMapping, 'utf8');
  assert.ok(failureText.includes(failedSourceName));
  assert.match(failureText, /Kein Ergebnis – gestoppt/u);
  assert.doesNotMatch(failureText, /personnel-profile|Dokument-\d+-anonymisiert/u);
  const resolvedFailureMapping = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '8'.repeat(16), action: 'resolve_local_ledger' });
  assert.deepEqual(resolvedFailureMapping.result, {
    ok: true, target_kind: 'file', local_path: failedMapping, external_disclosure: false
  });
  assert.deepEqual(fs.readFileSync(failedSource), failedOriginal, 'the parser failure must not modify its source');
  assert.equal(fs.readFileSync(mapping, 'utf8'), mappingText, 'the previous successful mapping remains unchanged');
  sourceFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), originals[index]));
  if (Number.isSafeInteger(failedTerminal.presentation_generation)) {
    await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a1'.repeat(8),
      action: 'ack_terminal_presented', presentation_generation: failedTerminal.presentation_generation });
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
  const convertedCsv = fs.readFileSync(convertedMapping, 'utf8');
  conversionSources.forEach((file, index) => {
    assert.ok(convertedCsv.includes(path.basename(file)), 'every success and failure appears in the run mapping');
    assert.deepEqual(fs.readFileSync(file), beforeConversion[index]);
  });
  const convertedFiles = fs.readdirSync(convertedRun).filter(name => name.endsWith('.md'));
  assert.equal(convertedFiles.length, 11);
  const texts = convertedFiles.map(name => fs.readFileSync(path.join(convertedRun, name), 'utf8'));
  assert.equal(texts.filter(value => /Lina(?: |&#32;)Testfeld/u.test(value)).length, 4, 'all original four formats preserve person identities');
  assert.equal(texts.filter(value => /Max(?: |&#32;)Mustermann/u.test(value)).length, 7, 'all new converters, including OCR, preserve person identities');
  for (const value of texts) assert.doesNotMatch(value, /\[PERSON_|\[UNTERNEHMEN_|anonymized: true/u);
  assert.ok(texts.includes(originals[0].toString('utf8')), 'TXT contents are not normalized or redacted');
  assert.ok(texts.includes(originals[1].toString('utf8')), 'existing Markdown contents are preserved');
  for (const [action, expectedPath] of [['resolve_current_results', convertedRun], ['resolve_local_ledger', convertedMapping]]) {
    const result = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: action === 'resolve_current_results' ? 'c4'.repeat(8) : 'c5'.repeat(8), action });
    assert.equal(result.ok, true); assert.equal(result.result.local_path, expectedPath);
  }
  assert.equal(fs.readFileSync(mapping, 'utf8'), mappingText, 'conversion never rewrites a previous anonymized result');
  const supportDirectory = path.join(environment.LOCALAPPDATA, 'SecureDataMsg-Standalone', 'diagnostics', 'support-events');
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
  await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'f'.repeat(16), action: 'shutdown' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('STANDALONE_SMOKE_SHUTDOWN_TIMEOUT')); }, 10000);
    closePromise.then((code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`STANDALONE_SMOKE_SHUTDOWN:${code}`));
    });
  });
  process.stdout.write('STANDALONE PACKAGE ISOLATED SIDECAR SMOKE PASS\n');
} finally {
  if (child && !childClosed && child.exitCode === null) {
    child.kill();
    await closePromise;
  }
  if (process.env.DATASECURE_SMOKE_KEEP === '1') process.stderr.write(`STANDALONE_SMOKE_KEPT:${extraction}\n`);
  else safeRemove();
}
