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
  assert.strictEqual(elements['drop-zone'].attributes['aria-disabled'], 'true');
  assert.strictEqual(elements['selected-files'].textContent, 'Profil ä.txt, Daten.csv');
  assert.strictEqual(callsByCommand('start_admitted_batch'), 0, 'dropping must never start processing');
  releasePoll({ state: 'ready', results_available: false });
  await polling;
  assert.strictEqual(elements['status-title'].textContent, 'Auswahl bereit', 'old status poll must not overwrite a freshly admitted drop');
  nativeListener({ payload: { phase: 'rejected', error_code: 'STANDALONE_SELECTION_PREPARED' } });
  assert.match(elements['action-feedback'].textContent, /bereits vorbereitet/u);
  assert.strictEqual(elements.start.hidden, false, 'a second drop preserves the prepared selection');
  await elements['select-files'].listeners.click();
  assert.strictEqual(callsByCommand('select_files'), 0, 'prepared admission blocks another picker');
  await elements['task-anonymize'].listeners.click();
  await elements.start.listeners.click();
  assert.strictEqual(callsByCommand('start_admitted_batch'), 1, 'only explicit Start invokes processing');

  const picker = elements['select-files'].listeners.click();
  await elements['select-folder'].listeners.click();
  assert.strictEqual(callsByCommand('select_files'), 1);
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
    window: { __TAURI__: { core: { invoke }, event: { listen: async (_name, callback) => {
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

async function selectionEditingCase() {
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 2, total_bytes: 8,
      ui_context: localContext('Lauf-1', ['a.txt', 'b.txt']) }),
    remove_admitted_source: ({ selectionIndex }) => {
      assert.strictEqual(selectionIndex, 0);
      return { ok: true, selected_count: 1, total_bytes: 4,
        ui_context: localContext('Lauf-1', ['b.txt']) };
    },
    cancel_admission: () => ({ ok: true })
  });
  await harness.click('task-markdown');
  await harness.click('select-files');
  assert.strictEqual(harness.elements['selection-list'].hidden, false);
  assert.strictEqual(harness.elements['selection-list'].children.length, 2);
  await harness.elements['selection-list'].children[0].children[1].listeners.click();
  assert.strictEqual(harness.count('remove_admitted_source'), 1);
  assert.strictEqual(harness.elements['selection-list'].children.length, 1);
  assert.strictEqual(harness.elements['selection-list'].children[0].children[0].textContent, 'b.txt');
  await harness.click('cancel');
  assert.strictEqual(harness.elements['selection-list'].hidden, true);
  assert.strictEqual(harness.elements['selection-list'].children.length, 0);
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
  assert.match(harness.elements['result-warning'].textContent, /2 Datei.*nicht umgewandelt.*Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = false;
  await harness.runTimer();
  assert.match(harness.elements['result-warning'].textContent, /Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = true;
  await harness.runTimer();
  assert.match(harness.elements['status-text'].textContent, /keine Zuordnungsdatei erstellt/u);
  assert.match(harness.elements['result-warning'].textContent, /Diagnose öffnen/u);
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
  assert.strictEqual(harness.elements['status-title'].textContent, 'Fertig');
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

async function recoverableModeLockCase() {
  let state = { state: 'stopped', resumable_count: 1 };
  const harness = await frontendHarness({ get_public_state: () => state });
  const mode = harness.elements['processing-mode'];
  for (const name of ['stopped', 'review_required', 'processing', 'preparing', 'export_pending', 'blocked']) {
    state = { state: name, resumable_count: 1, review_count: 1, export_pending_count: 1 };
    await harness.runTimer();
    assert.strictEqual(mode.disabled, true, `${name} does not permit changing the current batch mode`);
    await harness.click('configure-results');
    assert.strictEqual(mode.disabled, true, `finishing an unrelated RPC must not unlock ${name}`);
  }
  state = { state: 'stopped', resumable_count: 1 };
  await harness.runTimer();
  mode.value = 'markdown-only';
  await harness.click('continue');
  await settleFrontend();
  const continued = harness.calls.filter((call) => call.action === 'continue_current_batch');
  assert.strictEqual(continued.length, 0, 'the global button cannot resume an implicit latest run');
  assert.strictEqual(harness.elements['results-view'].hidden, false, 'the user selects the exact run in history');
  assert.strictEqual(harness.count('continue_history_batch'), 0, 'navigation alone never resumes a batch');
  assert.strictEqual(mode.disabled, true);
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
    processing_mode: 'markdown-and-anonymize', ledger_available: true, resumable: index === 7
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
  assert.strictEqual(buttons.length, 3);
  assert.strictEqual(rowActions(harness.elements, 0)[2].disabled, true);
  assert.match(rowActions(harness.elements, 0)[2].title, /Keine Fortsetzung/u);
  const feedback = harness.elements['history-body'].children[7].children[4].children.at(-1);
  assert.strictEqual(feedback.attributes.role, 'status');
  assert.strictEqual(feedback.hidden, true);
  for (const button of buttons) {
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
  response = localHistory([historyEntry('failed-run', { results_available: false, ledger_available: false, resumable: false, status: 'completed_without_results' })]);
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

(async () => {
  await testAsync('home is the default, mode must be explicit, and terminal updates never navigate', homeAndExplicitChoiceCase);
  await testAsync('tabs use manual activation and roving arrow, Home and End focus', accessibleTabsCase);
  await testAsync('history renders at most 20 rows and every action binds its exact batch ID', historyRowBindingCase);
  await testAsync('history preserves focus, ignores progress polls and rejects stale replies and actions', historyFreshnessCase);
  await testAsync('history requires a local-only envelope and explains disabled actions', historyPrivacyAndAvailabilityCase);
  await testAsync('a native admission invalidates pending history and refreshes the selected panel safely', historyAdmissionRaceCase);
  await testAsync('a successful status poll clears an earlier IPC error atomically', recoveredStatusCase);
  await testAsync('result and ledger actions show a separate confirmed handoff', openFeedbackCase);
  await testAsync('native drops prepare without starting and preserve admission across races', nativeDropCase);
  await testAsync('a renderer reload restores a prepared selection and listener failure preserves picker fallback', restoredAdmissionCase);
  await testAsync('a poll timer consumed by a cancelled picker keeps polling alive', pickerTimerCancellationCase);
  await testAsync('a prepared selection supports per-file removal and clearing before Start', selectionEditingCase);
  await testAsync('an unconfirmed slow start is observed until completion without restarting the batch', uncertainStartPollingCase);
  await testAsync('an unconfirmed start of a restored admission starts status recovery', restoredAdmissionUncertainStartCase);
  await testAsync('fast consecutive terminal runs refresh their exact result folder without repeated idle export reads', consecutiveTerminalRunsCase);
  await testAsync('a stale poll cannot overwrite a new run after selection and Start both completed', stalePollAfterStartCase);
  await testAsync('a delayed terminal context cannot overwrite a newly prepared selection', staleContextAfterAdmissionCase);
  await testAsync('a delayed terminal context remains stale after the new selection was already started', () => staleContextAfterAdmissionCase(true));
  await testAsync('late cancellation context preserves a freshly dropped selection', cancelledAdmissionContextRaceCase);
  await testAsync('a failed pure conversion never offers a mapping even if stale state claims one', failedConversionNeverOffersLedgerCase);
  await testAsync('completion metadata debt is visible without claiming zero missing documents or no results', completionPendingCase);
  await testAsync('explicit Start sends one immutable camelCase processing mode and locks it before checkpoint', explicitStartModeCase);
  await testAsync('anonymization offers one explicit filename choice with neutral privacy-preserving default', explicitOutputNamingCase);
  await testAsync('unavailable conversion keeps the admission without a silent anonymization fallback', unavailableModePreservesAdmissionCase);
  await testAsync('active and recoverable modes stay locked and global continue only opens history', recoverableModeLockCase);
  await testAsync('pure conversion stays selected during intake and reports raw results and OCR warnings honestly', pureConversionCase);
  done();
})();
