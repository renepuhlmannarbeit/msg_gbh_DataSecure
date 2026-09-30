'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Standalone frontend');

function element() {
  return { disabled: false, hidden: false, textContent: '', title: '', className: '', listeners: {}, attributes: {},
    value: '', children: [],
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    focus() { this.focused = true; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { this.listeners[type] = listener; } };
}

async function recoveredStatusCase() {
  const ids = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
    'configure-results', 'diagnostics', 'status-icon', 'status-title', 'status-text', 'summary',
    'result-folder', 'result-folder-results', 'source-folders', 'selected-files', 'result-count',
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch', 'product-version', 'drop-zone', 'processing-mode'];
  const elements = htmlElements();
  const timers = [];
  let publicCalls = 0;
  const invoke = async (action) => {
    if (action === 'get_ui_context') return {
      ok: true, result_folder: 'C:\\Results', source_folders: [], selected_files: [],
      local_ui_only: true, external_disclosure: false
    };
    if (action === 'get_public_state') {
      publicCalls += 1;
      if (publicCalls === 1) throw 'STANDALONE_IPC_FAILED';
      return { ok: true, state: 'ready', results_available: false };
    }
    return { ok: true };
  };
  const context = {
    window: { __TAURI__: { core: { invoke }, event: { listen: async () => () => {} } }, addEventListener() {} },
    document: { getElementById: (id) => elements[id], createElement: element },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (callback) => callback(),
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(elements['status-icon'].textContent, '!');
  assert.match(elements['status-title'].textContent, /STANDALONE_IPC_FAILED/u);
  assert.ok(timers.length > 0);
  timers.at(-1)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(elements['status-icon'].textContent, '✓');
  assert.strictEqual(elements['status-title'].textContent, 'Bereit');
  assert.strictEqual(elements['status-text'].textContent, 'Wähle Dateien oder einen ganzen Ordner aus.');
}

async function openFeedbackCase() {
  const ids = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
    'configure-results', 'diagnostics', 'status-icon', 'status-title', 'status-text', 'summary',
    'result-folder', 'result-folder-results', 'source-folders', 'selected-files', 'result-count',
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch', 'product-version', 'drop-zone', 'processing-mode'];
  const elements = htmlElements();
  const calls = [];
  const invoke = async (action) => {
    calls.push(action);
    if (action === 'get_ui_context') return { ok: true, result_folder: 'C:\\Results', latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-1', source_folders: [], selected_files: [], local_ui_only: true, external_disclosure: false };
    if (action === 'get_public_state') return { ok: true, state: 'results_available', results_available: true, result_count: 4 };
    if (action === 'get_run_history') return localHistory([historyEntry('run-1', {
      processing_mode: 'markdown-and-anonymize', ledger_available: true
    })]);
    if (action === 'open_current_results') return { ok: true, handoff_confirmed: true };
    if (action === 'open_history_results' || action === 'open_history_ledger') return { ok: true, handoff_confirmed: true };
    if (action === 'frontend_ready') return { ok: true, product_version: '3.2.0-rc105' };
    return { ok: true };
  };
  const context = {
    window: { __TAURI__: { core: { invoke }, event: { listen: async () => () => {} } }, addEventListener() {} }, document: { getElementById: (id) => elements[id], createElement: element },
    setTimeout: () => 1, clearTimeout: () => {}, requestAnimationFrame: (callback) => callback(), console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(elements['product-version'].textContent, 'Version 3.2.0-rc105');
  assert.strictEqual(elements['settings-result-folder'].textContent, 'C:\\Results');
  assert.strictEqual(elements['settings-result-folder'].title, 'C:\\Results');
  assert.strictEqual(elements['result-folder-results'].textContent, 'C:\\Results\\DataSecure-Output\\Lauf-1');
  assert.strictEqual(elements['home-view'].hidden, false, 'a completed run preserves the default home view');
  elements['tab-process'].listeners.click();
  await elements['process-results'].listeners.click();
  assert.ok(!calls.includes('open_current_results'), 'a historical result never enables the current-session action on startup');
  elements['tab-results'].listeners.click();
  await settleFrontend();
  await rowActions(elements, 0)[0].listeners.click();
  assert.ok(calls.includes('open_history_results'));
  assert.match(elements['action-feedback'].textContent, /Betriebssystem zum Öffnen übergeben/u);
  assert.strictEqual(elements['status-title'].textContent, 'Fertig', 'open feedback must not overwrite the completed run state');
  await rowActions(elements, 0)[1].listeners.click();
  assert.match(elements['action-feedback'].textContent, /Zuordnung.*übergeben/u);
  await elements['identity-mappings-directory'].listeners.click();
  assert.ok(calls.includes('open_identity_mappings_directory'));
  assert.match(elements['action-feedback'].textContent, /vertrauliche Zuordnungsordner.*übergeben/u);
}

async function nativeDropCase() {
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/gu)].map((match) => [match[1], element()]));
  const calls = [];
  const windowEvents = {};
  let nativeListener;
  let removed = 0;
  let releasePoll;
  let holdNextPoll = false;
  let releasePicker;
  const callsByCommand = (name) => calls.filter((call) => call.action === name).length;
  const invoke = async (action, args) => {
    calls.push({ action, args });
    if (action === 'get_ui_context') return { local_ui_only: true, external_disclosure: false, result_folder: 'C:\\Ergebnisse' };
    if (action === 'get_public_state') {
      if (holdNextPoll) { holdNextPoll = false; return new Promise((resolve) => { releasePoll = resolve; }); }
      return { state: 'ready', results_available: false };
    }
    if (action === 'select_files') return new Promise((resolve) => { releasePicker = resolve; });
    return { ok: true };
  };
  const timers = [];
  const context = {
    window: { __TAURI__: { core: { invoke }, event: { listen: async (name, callback) => {
      assert.strictEqual(name, 'datasecure-native-drop'); nativeListener = callback;
      return () => { removed += 1; };
    } } }, addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    document: { getElementById: (id) => elements[id], createElement: element },
    setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout() {},
    requestAnimationFrame: (callback) => callback(), console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(calls.find((call) => call.action === 'frontend_ready').args.nativeDropReady, true);
  assert.strictEqual(elements['drop-zone'].attributes['aria-disabled'], 'false');
  nativeListener({ payload: { phase: 'enter' } });
  assert.match(elements['drop-zone'].className, /active/u);
  holdNextPoll = true;
  const polling = timers.at(-1)();
  await new Promise((resolve) => setImmediate(resolve));
  nativeListener({ payload: { phase: 'checking' } });
  assert.strictEqual(elements['select-files'].disabled, true);
  nativeListener({ payload: { phase: 'accepted', result: { selected_count: 2, total_bytes: 2048,
    ui_context: { local_ui_only: true, external_disclosure: false,
      source_folders: ['C:\\Kunde Müller'], selected_files: ['Profil ä.txt', 'Daten.csv'] } } } });
  assert.strictEqual(elements['status-title'].textContent, 'Auswahl bereit');
  assert.strictEqual(elements.start.hidden, false);
  assert.strictEqual(elements.start.focused, undefined, 'a drop on home must not focus a hidden processing action');
  assert.strictEqual(elements['home-view'].hidden, false);
  assert.strictEqual(elements.start.disabled, true, 'a drop never supplies a processing mode');
  assert.strictEqual(elements['drop-zone'].attributes['aria-disabled'], 'false',
    'another drop can extend a prepared selection before Start');
  assert.strictEqual(elements['select-files'].hidden, false);
  assert.strictEqual(elements['select-files'].textContent, 'Dateien hinzufügen');
  assert.strictEqual(elements['selected-files'].textContent, 'Profil ä.txt, Daten.csv');
  assert.strictEqual(callsByCommand('start_admitted_batch'), 0, 'dropping must never start processing');
  releasePoll({ state: 'ready', results_available: false });
  await polling;
  assert.strictEqual(elements['status-title'].textContent, 'Auswahl bereit', 'old status poll must not overwrite a freshly admitted drop');
  nativeListener({ payload: { phase: 'failed', error_code: 'STANDALONE_SELECTION_INVALID' } });
  assert.match(elements['action-feedback'].textContent, /Dateiauswahl/u);
  assert.strictEqual(elements.start.hidden, false, 'a second drop preserves the prepared selection');
  const cancelledAddition = elements['select-files'].listeners.click();
  assert.strictEqual(callsByCommand('select_files'), 1, 'a prepared admission allows another picker');
  releasePicker({ cancelled: true });
  await cancelledAddition;
  assert.strictEqual(elements['selected-files'].textContent, 'Profil ä.txt, Daten.csv',
    'cancelling an additional picker retains the original admission');
  await elements['task-anonymize'].listeners.click();
  await elements.start.listeners.click();
  assert.strictEqual(callsByCommand('start_admitted_batch'), 1, 'only explicit Start invokes processing');

  const picker = elements['select-files'].listeners.click();
  await elements['select-folder'].listeners.click();
  assert.strictEqual(callsByCommand('select_files'), 2);
  assert.strictEqual(callsByCommand('select_folder'), 0, 'busy is set before waiting on the first picker');
  nativeListener({ payload: { phase: 'rejected', error_code: 'STANDALONE_BUSY' } });
  assert.strictEqual(elements['select-files'].disabled, true, 'rejected native drop cannot unlock an active picker');
  releasePicker({ cancelled: true });
  await picker;
  nativeListener({ payload: { phase: 'checking' } });
  nativeListener({ payload: { phase: 'failed', error_code: 'STANDALONE_DROP_MIXED' } });
  assert.match(elements['action-feedback'].textContent, /entweder Dateien oder genau einen Ordner/u);
  assert.strictEqual(elements['select-files'].disabled, false);
  windowEvents.pagehide();
  windowEvents.pagehide();
  assert.strictEqual(removed, 1, 'native listener is removed exactly once');
}

async function restoredAdmissionCase() {
  const elements = {};
  const calls = [];
  const invoke = async (action, args) => {
    calls.push({ action, args });
    if (action === 'frontend_ready') return { ok: true, admission_prepared: true };
    if (action === 'get_ui_context') return { local_ui_only: true, external_disclosure: false,
      source_folders: ['C:\\Kunde'], selected_files: ['Profil.txt'] };
    return { state: 'ready' };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), {
    window: { __TAURI__: { core: { invoke }, event: { listen: async () => { throw new Error('unavailable'); } } }, addEventListener() {} },
    document: { getElementById: (id) => elements[id] ||= element(), createElement: element },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (callback) => callback(), console
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(calls.find((call) => call.action === 'frontend_ready').args.nativeDropReady, false,
    'native drop is not enabled if the renderer listener failed');
  assert.strictEqual(elements['drop-zone'].hidden, true);
  assert.strictEqual(elements['status-title'].textContent, 'Auswahl bereit');
  assert.strictEqual(elements.start.hidden, false, 'a renderer reload recovers explicit Start for an existing admission');
  assert.strictEqual(elements['selected-files'].textContent, 'Profil.txt');
  assert.strictEqual(elements['home-view'].hidden, false);
  assert.strictEqual(elements['processing-mode'].value, '');
  assert.strictEqual(elements.start.disabled, true);
  assert.doesNotMatch(elements.summary.textContent, /NaN/u);
  assert.ok(!calls.some((call) => call.action === 'get_public_state'), 'ready polling must not overwrite a recovered admission');
  assert.ok(!calls.some((call) => call.action === 'start_admitted_batch'));
}

const settleFrontend = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function localContext(run = 'Lauf-1', selectedFiles = []) {
  return { local_ui_only: true, external_disclosure: false, result_folder: 'C:\\Ergebnisse',
    latest_result_folder: `C:\\Ergebnisse\\DataSecure-Output\\${run}`,
    source_folders: ['C:\\Quellen'], selected_files: selectedFiles };
}
async function firstRunResultFolderGuidanceCase() {
  let cancelled = true;
  const harness = await frontendHarness({
    get_ui_context: () => ({ local_ui_only: true, external_disclosure: false,
      result_folder: 'C:\\Dokumente\\SecureDataMsg', result_folder_is_default: true,
      source_folders: [], selected_files: [] }),
    configure_results: () => cancelled ? { ok: true, cancelled: true } : {
      ok: true, result_folder: 'C:\\Dokumente\\Meine Ergebnisse',
      local_ui_only: true, external_disclosure: false
    }
  });
  const { elements } = harness;
  assert.strictEqual(elements['result-folder-setup'].hidden, false,
    'fresh profiles must show the result-folder choice on the start page');
  assert.strictEqual(elements['suggested-result-folder'].textContent, 'C:\\Dokumente\\SecureDataMsg');
  assert.strictEqual(elements['result-folder'].textContent, 'Vorgeschlagen: C:\\Dokumente\\SecureDataMsg');
  assert.strictEqual(harness.count('start_admitted_batch'), 0,
    'viewing the proposed location never creates a batch');
  await harness.click('setup-results');
  assert.strictEqual(elements['result-folder-setup'].hidden, false,
    'cancelling the native folder picker must keep first-run guidance');
  cancelled = false;
  await harness.click('setup-results');
  assert.strictEqual(elements['result-folder-setup'].hidden, true,
    'an explicitly configured folder completes first-run guidance');
  assert.strictEqual(elements['result-folder'].textContent, 'C:\\Dokumente\\Meine Ergebnisse');
  assert.strictEqual(elements['settings-result-folder'].textContent, 'C:\\Dokumente\\Meine Ergebnisse');
  assert.strictEqual(harness.count('configure_results'), 2);
}
function htmlElements() {
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  return Object.fromEntries([...html.matchAll(/id="([^"]+)"/gu)].map((match) => [match[1], element()]));
}
function historyEntry(batchId, overrides = {}) {
  return { batch_id: batchId, created_at: '2026-09-01T12:00:00Z', processing_mode: 'markdown-only',
    selected_count: 2, result_count: 1, failed_count: 1, status: 'results_available',
    results_available: true, ledger_available: false, resumable: false, ...overrides };
}
function localHistory(entries) { return { ok: true, local_ui_only: true, external_disclosure: false, entries }; }
function rowActions(elements, index) {
  return elements['history-body'].children[index].children[4].children
    .filter((wrapper) => wrapper.children[0]?.listeners.click)
    .map((wrapper) => wrapper.children[0]);
}
async function frontendHarness(overrides = {}) {
  const elements = htmlElements();
  const timers = new Map();
  const calls = [];
  let timerId = 0;
  let nativeListener;
  const invoke = async (action, args) => {
    calls.push({ action, args });
    if (overrides[action]) return overrides[action](args);
    if (action === 'get_ui_context') return localContext();
    if (action === 'get_public_state') return { state: 'ready', results_available: false };
    if (action === 'get_run_history') return localHistory([]);
    return { ok: true };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), {
    window: { confirm: (message) => overrides.confirm ? overrides.confirm(message) : true,
      __TAURI__: { core: { invoke }, event: { listen: async (_name, callback) => {
      nativeListener = callback; return () => {};
    } } }, addEventListener() {} },
    document: { getElementById: (id) => elements[id], createElement: element },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame: (callback) => callback(), console
  });
  await settleFrontend();
  return {
    elements, calls, timers,
    click: (id) => elements[id].listeners.click(),
    native: (payload) => nativeListener({ payload }),
    runTimer() {
      assert.strictEqual(timers.size, 1, 'exactly one next status timer must exist');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      return timer.callback();
    },
    count: (action) => calls.filter((call) => call.action === action).length
  };
}

async function pickerTimerCancellationCase() {
  const picker = deferred();
  const harness = await frontendHarness({ select_files: () => picker.promise });
  const choosing = harness.click('select-files');
  const priorCalls = harness.count('get_public_state');
  await harness.runTimer();
  assert.strictEqual(harness.count('get_public_state'), priorCalls, 'busy picker must not cause competing IPC');
  assert.strictEqual(harness.timers.size, 1, 'a consumed busy timer must retain its successor');
  picker.resolve({ cancelled: true });
  await choosing;
  await harness.runTimer();
  assert.strictEqual(harness.count('get_public_state'), priorCalls + 1, 'polling resumes after cancelling the picker');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Bereit');
  assert.strictEqual(harness.timers.size, 1);
}

async function folderLimitFeedbackCase() {
  const harness = await frontendHarness({
    select_folder: () => { throw 'SOURCE_FORMAT_SIZE_LIMIT'; },
    select_files: () => ({ selected_count: 1, total_bytes: 1, ui_context: localContext('Lauf-1', ['synthetic.txt']) })
  });
  await harness.click('select-folder');
  assert.match(harness.elements['status-title'].textContent, /SOURCE_FORMAT_SIZE_LIMIT/u);
  assert.match(harness.elements['action-feedback'].textContent, /64 MiB/u);
  await harness.runTimer();
  assert.match(harness.elements['status-title'].textContent, /SOURCE_FORMAT_SIZE_LIMIT/u,
    'an idle status poll must not erase the rejected folder reason');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Auswahl bereit');
  assert.strictEqual(harness.elements['action-feedback'].hidden, true);
}

async function selectionEditingCase() {
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 2, total_bytes: 8, ignored_artifact_count: 1,
      ui_context: localContext('Lauf-1', ['Quelle.docx', 'Notiz.md']) }),
    remove_admitted_source: ({ selectionIndex }) => {
      assert.strictEqual(selectionIndex, 1, 'the grouped display retains the original queue index');
      return { ok: true, selected_count: 1, total_bytes: 4,
        ui_context: localContext('Lauf-1', ['Quelle.docx']) };
    },
    cancel_admission: () => ({ ok: true })
  });
  await harness.click('task-markdown');
  await harness.click('select-files');
  assert.match(harness.elements.summary.textContent, /1 temporäre Office-Datei übersprungen/u);
  assert.strictEqual(harness.elements['selection-list'].hidden, false);
  assert.strictEqual(harness.elements['selection-list'].children.length, 4);
  assert.match(harness.elements['selection-list'].children[0].textContent, /Direkt lesbare Textdateien \(1\)/u);
  assert.strictEqual(harness.elements['selection-list'].children[1].children[0].textContent, 'Notiz.md');
  assert.match(harness.elements['selection-list'].children[2].textContent, /Lokal in Markdown umzuwandelnde Dateien \(1\)/u);
  assert.strictEqual(harness.elements['selection-list'].children[3].children[0].textContent, 'Quelle.docx');
  await harness.elements['selection-list'].children[1].children[1].listeners.click();
  assert.strictEqual(harness.count('remove_admitted_source'), 1);
  assert.strictEqual(harness.elements['selection-list'].children.length, 2);
  assert.match(harness.elements['selection-list'].children[0].textContent, /Lokal in Markdown umzuwandelnde Dateien \(1\)/u);
  assert.strictEqual(harness.elements['selection-list'].children[1].children[0].textContent, 'Quelle.docx');
  await harness.click('cancel');
  assert.strictEqual(harness.elements['selection-list'].hidden, true);
  assert.strictEqual(harness.elements['selection-list'].children.length, 0);
}

async function selectionExtensionCase() {
  let pickerCalls = 0;
  const harness = await frontendHarness({
    select_files: () => {
      pickerCalls += 1;
      if (pickerCalls === 3) throw 'STANDALONE_SELECTION_INVALID';
      const names = pickerCalls === 1 ? ['Erste.txt'] : ['Erste.txt', 'Zweite.docx'];
      return { selected_count: names.length, total_bytes: names.length * 4,
        ui_context: localContext('Lauf-1', names) };
    },
    select_folder: () => ({ selected_count: 3, total_bytes: 12, already_selected_count: 1,
      ui_context: { ...localContext('Lauf-1', ['Erste.txt', 'Zweite.docx', 'Unterordner/Dritte.csv']),
        source_kind: 'folder' } })
  });
  await harness.click('task-markdown');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['select-files'].hidden, false);
  assert.strictEqual(harness.elements['select-files'].textContent, 'Dateien hinzufügen');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Erste.txt, Zweite.docx');
  assert.strictEqual(harness.elements.summary.textContent.includes('2 Dateien'), true);
  await harness.click('select-files');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Auswahl bereit',
    'a failed addition must not replace a valid admission with a stopped state');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Erste.txt, Zweite.docx');
  await harness.click('select-folder');
  assert.strictEqual(harness.elements['selected-files'].textContent,
    'Erste.txt, Zweite.docx, Unterordner/Dritte.csv');
  assert.match(harness.elements.summary.textContent, /3 Dateien.*einschließlich Unterordnern/u);
  assert.match(harness.elements['action-feedback'].textContent, /nicht doppelt hinzugefügt/u);
  assert.strictEqual(harness.count('start_admitted_batch'), 0,
    'extending the prepared selection never implicitly starts the batch');
}

async function uncertainStartPollingCase() {
  const start = deferred();
  let state = { state: 'ready', results_available: false };
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil.txt']) }),
    start_admitted_batch: () => start.promise,
    get_public_state: () => state
  });
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Auswahl bereit');
  const starting = harness.click('start');
  await harness.runTimer();
  state = { state: 'processing', selected_count: 1, completed_count: 0, results_available: false };
  start.reject('STANDALONE_START_FAILED');
  await starting;
  assert.match(harness.elements['status-title'].textContent, /STANDALONE_START_FAILED/u);
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Anonymisierung läuft');
  assert.strictEqual(harness.elements.start.hidden, true);
  state = { state: 'results_available', result_count: 1, results_available: true };
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Fertig');
  assert.strictEqual(harness.count('start_admitted_batch'), 1, 'an uncertain start is observed, never implicitly retried');
}

async function restoredAdmissionUncertainStartCase() {
  const harness = await frontendHarness({
    frontend_ready: () => ({ ok: true, admission_prepared: true }),
    get_ui_context: () => localContext('Lauf-1', ['Profil.txt']),
    start_admitted_batch: () => { throw 'STANDALONE_START_FAILED'; },
    get_public_state: () => ({ state: 'processing', selected_count: 1, completed_count: 0 })
  });
  assert.strictEqual(harness.timers.size, 0, 'restoring an admission does not poll over the selection');
  await harness.click('task-anonymize');
  await harness.click('start');
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Anonymisierung läuft');
  assert.strictEqual(harness.count('start_admitted_batch'), 1);
}

async function consecutiveTerminalRunsCase() {
  let currentRun = 'Lauf-A';
  let presentationGeneration;
  const harness = await frontendHarness({
    get_ui_context: () => localContext(currentRun),
    get_public_state: () => ({ state: 'results_available', result_count: 1, results_available: true,
      presentation_generation: presentationGeneration }),
    select_files: () => ({ selected_count: 1, ui_context: localContext(currentRun, ['Neues-Profil.txt']) }),
    start_admitted_batch: () => { currentRun = 'Lauf-B'; return { ok: true }; }
  });
  assert.match(harness.elements['result-folder-results'].textContent, /Lauf-A$/u);
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  await harness.runTimer();
  assert.match(harness.elements['result-folder-results'].textContent, /Lauf-B$/u,
    'identical terminal state and counts do not identify the previous run');
  assert.strictEqual(harness.elements['process-results'].disabled, false,
    'the exact result created in this UI session enables the process action');
  const contextCalls = harness.count('get_ui_context');
  await harness.runTimer();
  assert.strictEqual(harness.count('get_ui_context'), contextCalls, 'unchanged terminal polls do not repeatedly resolve exports');
  currentRun = 'Lauf-C';
  presentationGeneration = 3;
  await harness.runTimer();
  assert.match(harness.elements['result-folder-results'].textContent, /Lauf-C$/u,
    'a fresh backend presentation generation also invalidates the terminal context');
}

async function completedResultRemainsAvailableDuringNextSelectionCase() {
  let currentRun = 'Lauf-A';
  let state = { state: 'ready', results_available: false };
  const harness = await frontendHarness({
    get_ui_context: () => localContext(currentRun),
    get_public_state: () => state,
    select_files: () => ({ selected_count: 1, ui_context: localContext(currentRun, ['Neues-Profil.txt']) }),
    start_admitted_batch: () => { state = { state: 'processing', selected_count: 1, completed_count: 0 }; return { ok: true }; }
  });
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  currentRun = 'Lauf-B';
  state = { state: 'results_available', result_count: 1, results_available: true };
  await harness.runTimer();
  assert.strictEqual(harness.elements['process-results'].disabled, false);

  await harness.click('select-files');
  assert.strictEqual(harness.elements['process-results'].disabled, false,
    'preparing another selection must not discard the completed result from this UI session');
}

async function stalePollAfterStartCase() {
  const oldPoll = deferred();
  let held = false;
  let currentRun = 'Lauf-A';
  const harness = await frontendHarness({
    get_ui_context: () => localContext(currentRun),
    get_public_state: () => held ? oldPoll.promise : { state: 'results_available', result_count: 1, results_available: true },
    select_files: () => ({ selected_count: 1, ui_context: localContext(currentRun, ['Neu.txt']) }),
    start_admitted_batch: () => { currentRun = 'Lauf-B'; return { ok: true }; }
  });
  held = true;
  const polling = harness.runTimer();
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  held = false;
  oldPoll.resolve({ state: 'ready', results_available: false });
  await polling;
  assert.strictEqual(harness.elements['status-title'].textContent, 'Stapel wird vorbereitet',
    'a pre-selection response remains stale even after admission was consumed by Start');
  await harness.runTimer();
  assert.match(harness.elements['result-folder-results'].textContent, /Lauf-B$/u);
  assert.strictEqual(harness.elements['status-title'].textContent, 'Fertig');
}

async function staleContextAfterAdmissionCase(startNewRun = false) {
  const pendingContext = deferred();
  let holdContext = false;
  let generation = 1;
  let currentRun = 'Lauf-A';
  const harness = await frontendHarness({
    get_ui_context: () => holdContext ? pendingContext.promise : localContext(currentRun),
    get_public_state: () => ({ state: 'results_available', result_count: 1, results_available: true,
      presentation_generation: generation }),
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-A', ['Neu.txt']) }),
    start_admitted_batch: () => { currentRun = 'Lauf-B'; return { ok: true }; }
  });
  holdContext = true;
  generation = 2;
  const polling = harness.runTimer();
  await settleFrontend();
  await harness.click('task-anonymize');
  await harness.click('select-files');
  if (startNewRun) await harness.click('start');
  holdContext = false;
  pendingContext.resolve(localContext('Lauf-Alt', ['Alt.txt']));
  await polling;
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Neu.txt');
  assert.strictEqual(harness.elements['status-title'].textContent, startNewRun ? 'Stapel wird vorbereitet' : 'Auswahl bereit');
  assert.strictEqual(harness.elements.start.hidden, startNewRun);
  if (startNewRun) {
    await harness.runTimer();
    assert.match(harness.elements['result-folder-results'].textContent, /Lauf-B$/u);
  }
}

async function cancelledAdmissionContextRaceCase() {
  const pendingContext = deferred();
  let holdContext = false;
  const harness = await frontendHarness({
    get_ui_context: () => holdContext ? pendingContext.promise : localContext(),
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Alt.txt']) })
  });
  await harness.click('select-files');
  holdContext = true;
  const cancellation = harness.click('cancel');
  await settleFrontend();
  harness.native({ phase: 'checking' });
  harness.native({ phase: 'accepted', result: { selected_count: 1, ui_context: localContext('Lauf-1', ['Neu.txt']) } });
  pendingContext.resolve(localContext('Lauf-1'));
  await cancellation;
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Neu.txt');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Auswahl bereit',
    'late cancellation context must not reset a fresh native admission to Ready');
  assert.strictEqual(harness.elements.start.hidden, false);
}

async function failedConversionNeverOffersLedgerCase() {
  let ledgerAvailable;
  const harness = await frontendHarness({
    get_public_state: () => ({ state: 'completed_without_results', results_available: false,
      processing_mode: 'markdown-only', failed_count: 2, ledger_available: ledgerAvailable })
  });
  assert.match(harness.elements['status-text'].textContent, /Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['status-text'].textContent, /Details stehen in der lokalen Zuordnung/u);
  assert.strictEqual(harness.elements['result-warning'].hidden, false);
  assert.match(harness.elements['result-warning'].textContent, /2 Datei.*nicht umgewandelt.*Dateien stehen im Abschluss unten oder im Verlauf/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = false;
  await harness.runTimer();
  assert.match(harness.elements['result-warning'].textContent, /Dateien stehen im Abschluss unten oder im Verlauf/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = true;
  await harness.runTimer();
  assert.match(harness.elements['status-text'].textContent, /keine Zuordnungsdatei erstellt/u);
  assert.match(harness.elements['result-warning'].textContent, /Dateien stehen im Abschluss unten oder im Verlauf/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Zuordnungsdatei/u);
}

async function completionPendingCase() {
  let completionPending = true;
  const harness = await frontendHarness({
    get_public_state: () => completionPending
      ? { state: 'export_pending', result_count: 0, results_available: false,
        export_pending_count: 0, completion_pending: true, failed_count: 1 }
      : { state: 'results_available', result_count: 2, results_available: true,
        export_pending_count: 0, failed_count: 1 }
  });
  assert.strictEqual(harness.elements['status-title'].textContent, 'Abschlussübersicht wird bereitgestellt');
  assert.match(harness.elements['status-text'].textContent, /Zuordnungsdatei|Abschlussnachweis/u);
  assert.doesNotMatch(harness.elements['status-text'].textContent, /0 anonymisierte|kein anonymisiertes Ergebnis/u);
  completionPending = false;
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Abgeschlossen mit Hinweisen');
}

async function explicitStartModeCase() {
  const start = deferred();
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil.txt']) }),
    start_admitted_batch: () => start.promise
  });
  assert.strictEqual(harness.elements['processing-mode'].disabled, false);
  await harness.click('task-anonymize');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['processing-mode'].disabled, false, 'a prepared selection has not bound its mode yet');
  const starting = harness.click('start');
  assert.strictEqual(harness.elements['processing-mode'].disabled, true, 'the pending start locks the selector');
  assert.strictEqual(JSON.stringify(harness.calls.find((call) => call.action === 'start_admitted_batch').args),
    JSON.stringify({ processingMode: 'markdown-and-anonymize', outputNamingMode: 'neutral' }),
  'Tauri receives the selected purpose and privacy-preserving naming under camelCase arguments');
  harness.elements['processing-mode'].value = 'markdown-only';
  start.resolve({ ok: true });
  await starting;
  assert.strictEqual(harness.elements['processing-mode'].disabled, true, 'accepted but not yet polled intake remains locked');
  assert.strictEqual(harness.calls.find((call) => call.action === 'start_admitted_batch').args.processingMode,
    'markdown-and-anonymize', 'a later selector change cannot mutate the submitted start');
  assert.strictEqual(harness.calls.find((call) => call.action === 'start_admitted_batch').args.outputNamingMode,
    'neutral', 'a later UI change cannot mutate the submitted naming choice');
  assert.strictEqual(harness.count('start_admitted_batch'), 1);
}

async function explicitOutputNamingCase() {
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil_Person_001.docx']) })
  });
  assert.strictEqual(harness.elements['output-naming'].hidden, true);
  await harness.click('task-anonymize');
  assert.strictEqual(harness.elements['output-naming'].hidden, false);
  assert.strictEqual(harness.elements['output-naming-mode'].value, 'neutral');
  assert.match(harness.elements['output-naming-help'].textContent, /Dokument-001-anonymisiert/u);
  assert.match(harness.elements['output-naming-help'].textContent, /Unterordnernamen bleiben unverändert/u);
  assert.match(harness.elements['output-naming-help'].textContent, /Zuordnungsdatei enthält Originalnamen/u);
  const resultNotice = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  assert.match(resultNotice, /id="result-sharing-notice"[^>]*>Vor einer Weitergabe:[^<]+nie den ganzen Laufordner/u);
  assert.match(resultNotice, /Reine Markdown-Konvertierung anonymisiert keine Inhalte/u);
  harness.elements['output-naming-mode'].value = 'source-with-suffix';
  harness.elements['output-naming-mode'].listeners.change();
  assert.match(harness.elements['output-naming-help'].textContent, /Originaldateiname bleibt sichtbar/u);
  assert.match(harness.elements['output-naming-help'].textContent, /personenbezogenen Angaben/u);
  await harness.click('select-files');
  await harness.click('start');
  assert.strictEqual(harness.calls.find((call) => call.action === 'start_admitted_batch').args.outputNamingMode,
    'source-with-suffix');
}

async function unavailableModePreservesAdmissionCase() {
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil.txt']) }),
    start_admitted_batch: (args) => {
      if (args.processingMode === 'markdown-only') throw 'MARKDOWN_CONVERSION_NOT_READY';
      return { ok: true };
    }
  });
  await harness.click('select-files');
  // A stale backend/package may reject the now-supported purpose. The UI must
  // describe that installed-version mismatch, never silently anonymize instead.
  harness.elements['processing-mode'].value = 'markdown-only';
  await harness.click('start');
  assert.match(harness.elements['status-title'].textContent, /MARKDOWN_CONVERSION_NOT_READY/u);
  assert.match(harness.elements['status-text'].textContent, /installierte Version.*aktuelle Standalone-Version/u);
  assert.doesNotMatch(harness.elements['status-text'].textContent, /noch in Entwicklung/u);
  assert.match(harness.elements['status-text'].textContent, /nicht gestartet.*Dateiauswahl bleibt erhalten/u);
  assert.strictEqual(harness.elements.start.hidden, false);
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Profil.txt');
  assert.strictEqual(harness.elements['processing-mode'].disabled, false);
  await harness.runTimer();
  assert.strictEqual(harness.count('start_admitted_batch'), 1, 'unsupported conversion never falls back automatically');
  harness.elements['processing-mode'].value = 'markdown-and-anonymize';
  await harness.click('start');
  assert.strictEqual(harness.count('start_admitted_batch'), 2, 'only another explicit Start can use the supported mode');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Stapel wird vorbereitet');
}

async function networkResultFolderNoticeCase() {
  const harness = await frontendHarness({
    configure_results: () => ({ ok: true, result_folder: '\\\\server\\share',
      network_folder_notice: true, local_ui_only: true, external_disclosure: false })
  });
  await harness.click('configure-results');
  assert.match(harness.elements['action-feedback'].textContent, /Netzlaufwerk.*andere Systeme/u);
  assert.strictEqual(harness.elements['result-folder'].textContent, '\\\\server\\share');
  assert.strictEqual(harness.elements['settings-result-folder'].textContent, '\\\\server\\share');
  assert.strictEqual(harness.elements['settings-result-folder'].title, '\\\\server\\share');
}

async function recoverableModeLockCase() {
  let state = { state: 'stopped', resumable_count: 1 };
  const harness = await frontendHarness({
    get_public_state: () => state,
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-neu', ['Neu.txt']) })
  });
  const mode = harness.elements['processing-mode'];
  for (const name of ['processing', 'preparing', 'blocked']) {
    state = { state: name, resumable_count: 1, review_count: 1, export_pending_count: 1 };
    await harness.runTimer();
    assert.strictEqual(mode.disabled, true, `${name} blocks a concurrent new batch`);
    await harness.click('configure-results');
    assert.strictEqual(mode.disabled, true, `finishing an unrelated RPC must not unlock active ${name}`);
  }
  for (const name of ['stopped', 'review_required', 'export_pending']) {
    state = { state: name, resumable_count: 1, review_count: 1, export_pending_count: 1 };
    await harness.runTimer();
    assert.strictEqual(mode.disabled, false, `${name} remains an optional historical action`);
    assert.strictEqual(harness.elements['select-files'].hidden, false, `${name} keeps file selection visible`);
    assert.strictEqual(harness.elements['select-folder'].hidden, false, `${name} keeps folder selection visible`);
    assert.strictEqual(harness.elements['drop-zone'].attributes['aria-disabled'], 'false');
  }
  state = { state: 'stopped', resumable_count: 1 };
  await harness.runTimer();
  await harness.click('continue');
  await settleFrontend();
  const continued = harness.calls.filter((call) => call.action === 'continue_current_batch');
  assert.strictEqual(continued.length, 0, 'the global button cannot resume an implicit latest run');
  assert.strictEqual(harness.elements['results-view'].hidden, false, 'the user selects the exact run in history');
  assert.strictEqual(harness.count('continue_history_batch'), 0, 'navigation alone never resumes a batch');
  assert.strictEqual(mode.disabled, false);
  await harness.click('task-markdown');
  assert.strictEqual(mode.value, 'markdown-only', 'a previous interrupted run never disables a new task');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Neu.txt');
}

async function pureConversionCase() {
  let state = { state: 'ready' };
  const harness = await frontendHarness({
    get_public_state: () => state,
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Scan.pdf']) }),
    start_admitted_batch: () => { state = { state: 'preparing', processing_mode: 'markdown-and-anonymize' }; return { ok: true }; }
  });
  harness.elements['processing-mode'].value = 'markdown-only';
  await harness.click('select-files');
  await harness.click('start');
  assert.strictEqual(harness.calls.find(call => call.action === 'start_admitted_batch').args.processingMode, 'markdown-only');
  assert.strictEqual(Object.hasOwn(harness.calls.find(call => call.action === 'start_admitted_batch').args, 'outputNamingMode'), false,
    'pure conversion never receives an anonymization naming option');
  await harness.runTimer();
  assert.strictEqual(harness.elements['processing-mode'].value, 'markdown-only', 'intake must not reuse the previous batch purpose');
  state = { state: 'results_available', processing_mode: 'markdown-only', results_available: true, result_count: 1, warning_count: 1 };
  await harness.runTimer();
  assert.match(harness.elements['status-text'].textContent, /Markdown-Datei wurde erstellt.*nicht anonymisiert/iu);
  assert.match(harness.elements['result-warning'].textContent, /1 Datei.*Extraktionshinweise/u);
  assert.doesNotMatch(harness.elements['result-label'].textContent, /Anonymisierte/u);
  state = { ...state, termination_unconfirmed: true };
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Verarbeitung unterbrochen');
  assert.strictEqual(harness.elements['status-icon'].textContent, '!');
  assert.match(harness.elements['status-text'].textContent, /Ende.*nicht bestätigt.*nicht gestartet/u);
  assert.doesNotMatch(harness.elements['status-text'].textContent, /sicher beendet|sicher gestoppt/u);
}

async function homeAndExplicitChoiceCase() {
  let state = { state: 'results_available', results_available: true, result_count: 2, presentation_generation: 7 };
  const harness = await frontendHarness({
    get_public_state: () => state,
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Dokument.txt']) })
  });
  assert.strictEqual(harness.elements['home-view'].hidden, false);
  assert.strictEqual(harness.elements['process-view'].hidden, true);
  assert.strictEqual(harness.elements['results-view'].hidden, true);
  assert.strictEqual(harness.elements['processing-mode'].value, '');
  assert.strictEqual(harness.elements['tab-home'].attributes['aria-selected'], 'true');
  assert.strictEqual(harness.count('get_run_history'), 0, 'opening home does not resolve historical artifacts');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Fertig', 'terminal status remains visible outside the panels');
  assert.strictEqual(harness.calls.find((call) => call.action === 'ack_terminal_presented').args.presentationGeneration, 7);
  await harness.click('select-files');
  assert.strictEqual(harness.elements.start.disabled, true);
  await harness.click('start');
  assert.strictEqual(harness.count('start_admitted_batch'), 0, 'missing mode blocks even a synthetic Start click');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Dokument.txt');
  await harness.click('task-markdown');
  assert.strictEqual(harness.elements['processing-mode'].value, 'markdown-only');
  assert.strictEqual(harness.elements['process-view'].hidden, false);
  assert.strictEqual(harness.elements.start.disabled, false);
  await harness.click('start');
  state = { ...state, presentation_generation: 8 };
  await harness.runTimer();
  assert.strictEqual(harness.elements['process-view'].hidden, false, 'completion never changes the selected panel');
  await harness.click('tab-results');
  await settleFrontend();
  await harness.click('new-batch');
  assert.strictEqual(harness.elements['home-view'].hidden, false);
  assert.strictEqual(harness.elements['processing-mode'].value, '');
  state = { ...state, presentation_generation: 9 };
  await harness.runTimer();
  assert.strictEqual(harness.elements['home-view'].hidden, false, 'a new terminal poll does not undo the explicit return home');
}

async function explicitNewRunAfterTerminalCase() {
  let state = { state: 'ready', results_available: false };
  let context = localContext('Vorheriger-Lauf', []);
  const harness = await frontendHarness({
    get_public_state: () => state,
    get_ui_context: () => context,
    select_files: () => {
      context = localContext('Vorheriger-Lauf', ['Neues-Dokument.txt']);
      return { selected_count: 1, ui_context: context };
    },
    cancel_admission: () => {
      context = { ...context, source_folders: [], selected_files: [] };
      return { ok: true };
    },
    start_admitted_batch: () => {
      state = { state: 'processing', processing_mode: 'markdown-only', selected_count: 1, completed_count: 0 };
      return { ok: true };
    }
  });
  await harness.click('task-markdown');
  await harness.click('select-files');
  await harness.click('start');
  await harness.runTimer();
  state = { state: 'results_available', processing_mode: 'markdown-only', result_count: 1,
    failed_count: 0, results_available: true, presentation_generation: 1 };
  await harness.runTimer();
  assert.strictEqual(harness.elements['process-form'].hidden, true, 'terminal run hides the old input form');
  assert.strictEqual(harness.elements['process-completion'].hidden, false);
  assert.strictEqual(harness.elements['select-files'].hidden, false, 'hidden form, not deleted controls');
  assert.strictEqual(harness.elements['processing-mode'].disabled, true, 'old task cannot be changed inside the completion');
  assert.strictEqual(harness.elements['drop-zone'].attributes['aria-disabled'], 'true');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Neues-Dokument.txt', 'old detail remains only in the hidden form until reset');
  await harness.click('prepare-new-run');
  assert.strictEqual(harness.count('cancel_admission'), 1);
  assert.strictEqual(harness.elements['process-form'].hidden, false);
  assert.strictEqual(harness.elements['process-completion'].hidden, true);
  assert.strictEqual(harness.elements['processing-mode'].value, '');
  assert.strictEqual(harness.elements['selected-files'].textContent, 'Noch nicht ausgewählt');
  assert.strictEqual(harness.elements['source-folders'].textContent, 'Noch nicht ausgewählt');
  assert.strictEqual(harness.elements['process-results'].disabled, true, 'the prior run remains available only from history');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Bereit für einen neuen Lauf');
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Bereit für einen neuen Lauf',
    'a stale terminal poll cannot bring back the preceding run');
  assert.strictEqual(harness.elements['processing-mode'].disabled, false);
  await harness.click('task-anonymize');
  assert.strictEqual(harness.elements['processing-mode'].value, 'markdown-and-anonymize');
}

async function activeLocalReviewExplainsBlockedNewRunCase() {
  let state = { state: 'ready', results_available: false };
  const harness = await frontendHarness({
    get_public_state: () => state,
    select_files: () => ({ selected_count: 1, ui_context: localContext('Prueflauf', ['Quelle.pdf']) }),
    start_admitted_batch: () => {
      state = { state: 'processing', processing_mode: 'markdown-and-anonymize',
        selected_count: 12, completed_count: 11, review_count: 1, results_available: false };
      return { ok: true };
    }
  });
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  assert.ok(html.indexOf('id="new-batch"') < html.indexOf('id="home-view"'),
    'new task action belongs to the shared navigation, not a single view');
  assert.strictEqual(html.split('id="new-batch"').length, 2);
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  await harness.runTimer();
  assert.strictEqual(harness.elements['selection-list'].hidden, true,
    'completed selection must not show dead Remove buttons during processing');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Lokale Prüfung erforderlich');
  assert.match(harness.elements['status-text'].textContent, /lokale Prüfung/u);
  await harness.click('tab-results');
  await harness.click('new-batch');
  assert.match(harness.elements['new-batch-feedback'].textContent, /aktuelle Lauf ist noch aktiv/u);
  assert.strictEqual(harness.elements['new-batch-feedback'].hidden, false);
  assert.strictEqual(harness.count('cancel_admission'), 0,
    'an active review must never be cancelled by a new-task click');
}

async function reviewActionStaysWithRunCase() {
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  assert.ok(html.indexOf('id="process-form"') < html.indexOf('id="review-open"') &&
    html.indexOf('id="review-open"') < html.indexOf('id="process-completion"'),
  'the live review action belongs to the current run rather than the global navigation');
  const batchId = 'c'.repeat(64);
  let state = { state: 'ready', results_available: false };
  let continuationRejected = true;
  const harness = await frontendHarness({
    get_public_state: () => state,
    get_run_history: () => localHistory([historyEntry(batchId, { status: 'review_required',
      results_available: false, resumable: true, processing_mode: 'markdown-and-anonymize' })]),
    select_files: () => ({ selected_count: 1, ui_context: localContext('Prueflauf', ['Quelle.pdf']) }),
    continue_current_batch: () => {
      if (continuationRejected) throw 'STANDALONE_BUSY';
      state = { state: 'processing', processing_mode: 'markdown-and-anonymize',
        selected_count: 1, completed_count: 0, review_count: 1, results_available: false };
      return { ok: true };
    },
    start_admitted_batch: () => {
      state = { state: 'processing', processing_mode: 'markdown-and-anonymize',
        selected_count: 1, completed_count: 0, review_count: 1, results_available: false };
      return { ok: true };
    }
  });
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  await harness.runTimer();
  assert.equal(harness.elements['review-open'].hidden, false);
  await harness.click('review-open');
  assert.equal(harness.count('open_review_window'), 1);
  state = { state: 'review_required', processing_mode: 'markdown-and-anonymize',
    selected_count: 1, review_count: 1, result_count: 0, results_available: false };
  await harness.runTimer();
  assert.equal(harness.elements['review-open'].hidden, true);
  assert.equal(harness.elements['process-completion-review'].hidden, false);
  await harness.click('process-completion-review');
  assert.equal(harness.count('open_review_window'), 1, 'a refused continuation never opens a misleading review window');
  assert.equal(harness.elements['process-completion-review'].hidden, false);
  continuationRejected = false;
  await harness.click('process-completion-review');
  assert.equal(harness.count('open_review_window'), 2);
  assert.equal(harness.count('get_run_history'), 0, 'direct review does not load or navigate to History');
  assert.equal(harness.elements['process-view'].hidden, false);
  assert.equal(harness.elements['results-view'].hidden, true);
  assert.equal(harness.elements['process-completion-review'].hidden, true);
  assert.equal(harness.elements['process-completion'].hidden, true);
  await harness.click('process-completion-review');
  assert.equal(harness.count('continue_current_batch'), 2, 'the accepted continuation cannot be started twice');
  state = { state: 'review_required', processing_mode: 'markdown-and-anonymize',
    selected_count: 1, review_count: 1, result_count: 0, results_available: false };
  await harness.runTimer();
  assert.equal(harness.elements['process-completion-history'].textContent, 'Lauf im Verlauf ansehen');
  assert.equal(harness.elements['process-completion-history'].className, '');
  await harness.click('process-completion-history');
  await settleFrontend();
  assert.equal(harness.count('continue_history_batch'), 0, 'navigation alone does not resume the run');
  const resume = rowActions(harness.elements, 0).find(button => button.textContent === 'Prüfung fortsetzen');
  assert.ok(resume);
  await resume.listeners.click();
  assert.equal(JSON.stringify(harness.calls.find(call => call.action === 'continue_history_batch').args),
    JSON.stringify({ batchId }));
}

async function noResultCompletionIsNotSuccessCase() {
  let state = { state: 'ready', results_available: false };
  const harness = await frontendHarness({
    get_public_state: () => state,
    get_ui_context: () => ({ local_ui_only: true, external_disclosure: false,
      result_folder: 'C:\\Ergebnisse', source_folders: [], selected_files: [] }),
    select_files: () => ({ selected_count: 1, ui_context: localContext('Fehllauf', ['Quelle.pdf']) }),
    start_admitted_batch: () => {
      state = { state: 'processing', processing_mode: 'markdown-and-anonymize', selected_count: 1 };
      return { ok: true };
    }
  });
  await harness.click('task-anonymize');
  await harness.click('select-files');
  await harness.click('start');
  state = { state: 'completed_without_results', processing_mode: 'markdown-and-anonymize',
    result_count: 0, failed_count: 1, results_available: false };
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Keine Ergebnisse erstellt');
  assert.strictEqual(harness.elements['status-icon'].textContent, '!', 'all stopped is not shown as a green success');
  assert.strictEqual(harness.elements['process-completion'].hidden, false);
  assert.strictEqual(harness.elements['process-completion-results'].disabled, true);
}

async function namedLocalFailuresCase() {
  const rejected = JSON.stringify({ code: 'SOURCE_FOLDER_UNSUPPORTED_FILES',
    details: { unsupported_files: ['BEGLEITDATEIEN/ERWARTUNGEN.json', 'DATEILISTE.csv'], unsupported_count: 2 } });
  const selection = await frontendHarness({ select_folder: () => { throw rejected; } });
  await selection.click('task-anonymize');
  await selection.click('select-folder');
  assert.match(selection.elements['action-feedback'].textContent, /BEGLEITDATEIEN\/ERWARTUNGEN\.json/u);
  assert.match(selection.elements['action-feedback'].textContent, /DATEILISTE\.csv/u);
  assert.strictEqual(selection.elements['status-title'].textContent, 'Sicher gestoppt · SOURCE_FOLDER_UNSUPPORTED_FILES');
  selection.native({ phase: 'failed', error_code: 'SOURCE_FOLDER_UNSUPPORTED_FILES',
    error_details: { unsupported_files: ['nested/unbekannt.bin'], unsupported_count: 1 } });
  assert.match(selection.elements['action-feedback'].textContent, /nested\/unbekannt\.bin/u);

  let state = { state: 'ready', results_available: false };
  const batchId = 'a'.repeat(64);
  const details = { ok: true, available: true, total: 2, local_ui_only: true, external_disclosure: false,
    files: [{ name: 'gruppe/Quelle.pdf', reason_code: 'PARSER_COVERAGE_UNVERIFIED' },
      { name: 'andere/Quelle.pdf', reason_code: 'PERSON_CANDIDATE' }] };
  const run = await frontendHarness({
    get_public_state: () => state,
    select_files: () => ({ selected_count: 2, ui_context: localContext('Namenslauf', ['gruppe/Quelle.pdf', 'andere/Quelle.pdf']) }),
    start_admitted_batch: () => { state = { state: 'processing', selected_count: 2 }; return { ok: true }; },
    get_run_failures: () => details,
    get_run_history: () => localHistory([historyEntry(batchId, { result_count: 0, failed_count: 2,
      status: 'completed_without_results', results_available: false })])
  });
  await run.click('task-anonymize');
  await run.click('select-files');
  await run.click('start');
  state = { state: 'completed_without_results', processing_mode: 'markdown-and-anonymize',
    result_count: 0, failed_count: 2, results_available: false };
  await run.runTimer();
  assert.strictEqual(run.elements['process-failure-details'].hidden, false);
  assert.strictEqual(run.elements['process-failure-details'].open, true);
  const currentFiles = run.elements['process-failure-list'].children[0].children;
  assert.strictEqual(currentFiles.length, 2);
  assert.match(currentFiles[0].textContent, /gruppe\/Quelle\.pdf.*PARSER_COVERAGE_UNVERIFIED/u);
  await run.click('tab-results');
  await settleFrontend();
  const historyFailureButton = rowActions(run.elements, 0).find(button => button.textContent === 'Gestoppte Dateien anzeigen');
  await historyFailureButton.listeners.click();
  const failureWrapper = run.elements['history-body'].children[0].children[4].children
    .find(wrapper => wrapper.children[0]?.textContent === 'Gestoppte Dateien anzeigen');
  const historyFiles = failureWrapper.children[1].children[0].children;
  assert.strictEqual(historyFiles.length, 2);
  assert.match(historyFiles[1].textContent, /andere\/Quelle\.pdf.*PERSON_CANDIDATE/u);
  assert.strictEqual(JSON.stringify(run.calls.filter(call => call.action === 'get_run_failures').map(call => call.args)),
    JSON.stringify([{ batchId: null }, { batchId }]));
}

async function accessibleTabsCase() {
  const harness = await frontendHarness();
  let prevented = 0;
  const key = (id, value) => harness.elements[id].listeners.keydown({ key: value, preventDefault() { prevented += 1; } });
  key('tab-home', 'ArrowRight');
  assert.strictEqual(harness.elements['tab-process'].focused, true);
  assert.strictEqual(harness.elements['tab-process'].attributes.tabindex, '0');
  assert.strictEqual(harness.elements['tab-home'].attributes.tabindex, '-1');
  assert.strictEqual(harness.elements['home-view'].hidden, false, 'arrows move focus; Enter or Space activates the native button');
  key('tab-process', 'End');
  assert.strictEqual(harness.elements['tab-results'].attributes.tabindex, '0');
  key('tab-results', 'Home');
  assert.strictEqual(harness.elements['tab-home'].attributes.tabindex, '0');
  key('tab-home', 'ArrowLeft');
  assert.strictEqual(harness.elements['tab-results'].attributes.tabindex, '0');
  assert.strictEqual(harness.count('get_run_history'), 0, 'focus alone must not perform a history read');
  await harness.click('tab-results');
  await settleFrontend();
  assert.strictEqual(harness.elements['tab-results'].attributes['aria-selected'], 'true');
  assert.strictEqual(harness.elements['results-view'].hidden, false);
  assert.strictEqual(prevented, 4);
}

async function historyRowBindingCase() {
  const batchId = '<img src=x onerror=bad()> exact-run-7';
  const entries = Array.from({ length: 25 }, (_, index) => historyEntry(index === 7 ? batchId : `run-${index}`, {
    processing_mode: 'markdown-and-anonymize', ledger_available: true, resumable: index === 7,
    result_count: 2, failed_count: 0
  }));
  const harness = await frontendHarness({
    get_run_history: () => localHistory(entries),
    open_history_results: () => ({ ok: true, handoff_confirmed: true }),
    open_history_ledger: () => ({ ok: true, handoff_confirmed: true })
  });
  await harness.click('tab-results');
  await settleFrontend();
  assert.strictEqual(harness.elements['history-body'].children.length, 20);
  assert.strictEqual(harness.elements['history-body'].children[7].children[0].attributes.scope, 'row');
  assert.strictEqual(harness.elements['history-body'].children[7].children[0].children[0].textContent, `Lauf ${batchId.slice(-8)}`);
  const buttons = rowActions(harness.elements, 7);
  assert.strictEqual(buttons.length, 4);
  assert.strictEqual(rowActions(harness.elements, 0)[2].disabled, true, 'private mapping is absent');
  assert.strictEqual(rowActions(harness.elements, 0)[3].disabled, true);
  assert.match(rowActions(harness.elements, 0)[3].title, /Keine Fortsetzung/u);
  const feedback = harness.elements['history-body'].children[7].children[4].children.at(-1);
  assert.strictEqual(feedback.attributes.role, 'status');
  assert.strictEqual(feedback.hidden, true);
  for (const button of buttons.filter(button => !button.disabled)) {
    await button.listeners.click(); await settleFrontend();
    assert.strictEqual(feedback.hidden, false);
    assert.match(feedback.textContent, /übergeben|Fortsetzung/u, 'feedback remains next to the activated row');
  }
  for (const command of ['open_history_results', 'open_history_ledger', 'continue_history_batch']) {
    const call = harness.calls.find((candidate) => candidate.action === command);
    assert.strictEqual(JSON.stringify(call.args), JSON.stringify({ batchId }));
  }
  assert.strictEqual(harness.count('open_current_results'), 0);
  assert.strictEqual(harness.count('open_local_ledger'), 0);
  assert.strictEqual(harness.count('continue_current_batch'), 0);
  assert.strictEqual(harness.elements['results-view'].hidden, false);
}

async function privateIdentityHistoryCase() {
  const batchId = 'd'.repeat(64);
  const harness = await frontendHarness({
    get_run_history: () => localHistory([historyEntry(batchId, { failed_count: 0,
      processing_mode: 'markdown-and-anonymize', identity_mapping_available: true })]),
    open_history_identity_mapping: () => ({ ok: true, handoff_confirmed: true })
  });
  await harness.click('tab-results');
  await settleFrontend();
  const buttons = rowActions(harness.elements, 0);
  const open = buttons.find(button => button.textContent === 'Identitäten (vertraulich)');
  const remove = buttons.find(button => button.textContent === 'Identitätszuordnung löschen');
  assert.ok(open);
  assert.equal(remove, undefined, 'the run has no identity delete button');
  assert.equal(open.disabled, false);
  await open.listeners.click();
  assert.equal(harness.count('open_history_identity_mapping'), 1);
  assert.equal(harness.count('delete_history_identity_mapping'), 0);
}

async function historyFreshnessCase() {
  const older = deferred();
  let response = localHistory([historyEntry('run-first')]);
  let state = { state: 'processing', completed_count: 0, result_count: 0 };
  const harness = await frontendHarness({ get_run_history: () => response, get_public_state: () => state });
  await harness.click('tab-results');
  await settleFrontend();
  const initialButton = rowActions(harness.elements, 0)[0];
  initialButton.focus();
  const initialReads = harness.count('get_run_history');
  state = { ...state, completed_count: 1, result_count: 1 };
  await harness.runTimer();
  assert.strictEqual(harness.count('get_run_history'), initialReads, 'progress polls do not repeatedly read history');
  await harness.click('tab-results');
  await settleFrontend();
  assert.strictEqual(rowActions(harness.elements, 0)[0], initialButton, 'unchanged entries preserve the focused DOM row');
  response = older.promise;
  await harness.click('tab-results');
  response = localHistory([historyEntry('run-new')]);
  await harness.click('tab-home');
  await harness.click('tab-results');
  await settleFrontend();
  older.resolve(localHistory([historyEntry('run-stale')]));
  await settleFrontend();
  assert.strictEqual(harness.elements['history-body'].children[0].children[0].children[0].textContent, 'Lauf run-new');
  await initialButton.listeners.click();
  assert.strictEqual(harness.count('open_history_results'), 0, 'an action from a replaced snapshot is inert');
}

async function historyPrivacyAndAvailabilityCase() {
  let response = { ok: true, local_ui_only: false, external_disclosure: false, entries: [historyEntry('invalid-envelope')] };
  const harness = await frontendHarness({ get_run_history: () => response });
  await harness.click('tab-results');
  await settleFrontend();
  assert.strictEqual(harness.elements['history-body'].children.length, 0);
  assert.match(harness.elements['history-feedback'].textContent, /nicht geladen/u);
  response = localHistory([historyEntry('failed-run', { results_available: false, ledger_available: false,
    resumable: false, status: 'completed_without_results', failed_count: 0 })]);
  await harness.click('tab-results');
  await settleFrontend();
  for (const button of rowActions(harness.elements, 0)) {
    assert.strictEqual(button.disabled, true);
    assert.ok(button.title.length > 0);
    await button.listeners.click();
  }
  assert.strictEqual(harness.count('open_history_results'), 0);
  assert.strictEqual(harness.count('open_history_ledger'), 0);
  assert.strictEqual(harness.count('continue_history_batch'), 0);
}

async function historyAdmissionRaceCase() {
  const stale = deferred();
  let response = stale.promise;
  const harness = await frontendHarness({ get_run_history: () => response });
  await harness.click('tab-results');
  harness.native({ phase: 'checking' });
  response = localHistory([historyEntry('run-current')]);
  harness.native({ phase: 'accepted', result: { selected_count: 1, ui_context: localContext('Lauf-1', ['Neu.txt']) } });
  await settleFrontend();
  stale.resolve(localHistory([historyEntry('run-obsolete')]));
  await settleFrontend();
  assert.strictEqual(harness.elements['history-body'].children[0].children[0].children[0].textContent, 'Lauf -current');
  assert.strictEqual(rowActions(harness.elements, 0)[0].disabled, false, 'accepted native drop refreshes the currently visible history');
  assert.strictEqual(harness.elements['results-view'].hidden, false, 'a drop preserves the selected panel');
  assert.strictEqual(harness.elements['status-title'].textContent, 'Auswahl bereit');
}

function selectionActionsStayAboveLongFileListsCase() {
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/index.html'), 'utf8');
  const dropZone = html.indexOf('id="drop-zone"');
  const addFiles = html.indexOf('id="select-files"');
  const addFolder = html.indexOf('id="select-folder"');
  const selectedFiles = html.indexOf('id="selection-list"');
  assert.ok(dropZone >= 0 && dropZone < addFiles && addFiles < addFolder && addFolder < selectedFiles,
    'both picker actions remain visible immediately after the drop zone, before a potentially long selection');
  assert.strictEqual(html.split('id="select-files"').length, 2, 'only one file picker action is rendered');
  assert.strictEqual(html.split('id="select-folder"').length, 2, 'only one folder picker action is rendered');
}

(async () => {
  await testAsync('home is the default, mode must be explicit, and terminal updates never navigate', homeAndExplicitChoiceCase);
  await testAsync('a finished run requires an explicit clean transition before another task', explicitNewRunAfterTerminalCase);
  await testAsync('active local review explains a blocked global new-task click', activeLocalReviewExplainsBlockedNewRunCase);
  await testAsync('review actions stay with their exact run and history navigation does not resume it', reviewActionStaysWithRunCase);
  await testAsync('a run with no results is visibly a failure rather than a green completion', noResultCompletionIsNotSuccessCase);
  await testAsync('local folder errors and stopped runs reveal affected file names without logging content', namedLocalFailuresCase);
  await testAsync('first start distinguishes a proposed result folder from a chosen one', firstRunResultFolderGuidanceCase);
  await testAsync('tabs use manual activation and roving arrow, Home and End focus', accessibleTabsCase);
  await testAsync('history renders at most 20 rows and every action binds its exact batch ID', historyRowBindingCase);
  await testAsync('private identity mapping opens locally without a delete action', privateIdentityHistoryCase);
  await testAsync('history preserves focus, ignores progress polls and rejects stale replies and actions', historyFreshnessCase);
  await testAsync('history requires a local-only envelope and explains disabled actions', historyPrivacyAndAvailabilityCase);
  await testAsync('a native admission invalidates pending history and refreshes the selected panel safely', historyAdmissionRaceCase);
  await testAsync('a successful status poll clears an earlier IPC error atomically', recoveredStatusCase);
  await testAsync('result and ledger actions show a separate confirmed handoff', openFeedbackCase);
  await testAsync('native drops prepare without starting and preserve admission across races', nativeDropCase);
  await testAsync('a renderer reload restores a prepared selection and listener failure preserves picker fallback', restoredAdmissionCase);
  await testAsync('a poll timer consumed by a cancelled picker keeps polling alive', pickerTimerCancellationCase);
  await testAsync('an oversized nested folder explains the limit until a valid selection replaces it', folderLimitFeedbackCase);
  await testAsync('a prepared selection supports per-file removal and clearing before Start', selectionEditingCase);
  await testAsync('an existing selection accepts later files and folders without losing it on errors', selectionExtensionCase);
  await testAsync('file and folder addition stays discoverable above long prepared lists', selectionActionsStayAboveLongFileListsCase);
  await testAsync('an unconfirmed slow start is observed until completion without restarting the batch', uncertainStartPollingCase);
  await testAsync('an unconfirmed start of a restored admission starts status recovery', restoredAdmissionUncertainStartCase);
  await testAsync('fast consecutive terminal runs refresh their exact result folder without repeated idle export reads', consecutiveTerminalRunsCase);
  await testAsync('a completed result remains available while the next selection is prepared', completedResultRemainsAvailableDuringNextSelectionCase);
  await testAsync('a stale poll cannot overwrite a new run after selection and Start both completed', stalePollAfterStartCase);
  await testAsync('a delayed terminal context cannot overwrite a newly prepared selection', staleContextAfterAdmissionCase);
  await testAsync('a delayed terminal context remains stale after the new selection was already started', () => staleContextAfterAdmissionCase(true));
  await testAsync('late cancellation context preserves a freshly dropped selection', cancelledAdmissionContextRaceCase);
  await testAsync('a failed pure conversion never offers a mapping even if stale state claims one', failedConversionNeverOffersLedgerCase);
  await testAsync('completion metadata debt is visible without claiming zero missing documents or no results', completionPendingCase);
  await testAsync('explicit Start sends one immutable camelCase processing mode and locks it before checkpoint', explicitStartModeCase);
  await testAsync('anonymization offers one explicit filename choice with neutral privacy-preserving default', explicitOutputNamingCase);
  await testAsync('unavailable conversion keeps the admission without a silent anonymization fallback', unavailableModePreservesAdmissionCase);
  await testAsync('a configured network result folder produces a visible local warning', networkResultFolderNoticeCase);
  await testAsync('only active work blocks admission while historical recovery remains optional', recoverableModeLockCase);
  await testAsync('pure conversion stays selected during intake and reports raw results and OCR warnings honestly', pureConversionCase);
  done();
})();
