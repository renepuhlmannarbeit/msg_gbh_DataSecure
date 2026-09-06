'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Standalone frontend');

function element() {
  return { disabled: false, hidden: false, textContent: '', title: '', className: '', listeners: {}, attributes: {},
    value: 'markdown-and-anonymize',
    focus() { this.focused = true; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { this.listeners[type] = listener; } };
}

async function recoveredStatusCase() {
  const ids = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
    'configure-results', 'diagnostics', 'status-icon', 'status-title', 'status-text', 'summary',
    'result-folder', 'result-folder-results', 'source-folders', 'selected-files', 'result-count',
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch', 'product-version', 'drop-zone', 'processing-mode'];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
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
    document: { getElementById: (id) => elements[id] },
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
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const calls = [];
  const invoke = async (action) => {
    calls.push(action);
    if (action === 'get_ui_context') return { ok: true, result_folder: 'C:\\Results', latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-1', source_folders: [], selected_files: [], local_ui_only: true, external_disclosure: false };
    if (action === 'get_public_state') return { ok: true, state: 'results_available', results_available: true, result_count: 4 };
    if (action === 'open_current_results' || action === 'open_local_ledger') return { ok: true, handoff_confirmed: true };
    if (action === 'frontend_ready') return { ok: true, product_version: '3.2.0-rc105' };
    return { ok: true };
  };
  const context = {
    window: { __TAURI__: { core: { invoke }, event: { listen: async () => () => {} } }, addEventListener() {} }, document: { getElementById: (id) => elements[id] },
    setTimeout: () => 1, clearTimeout: () => {}, requestAnimationFrame: (callback) => callback(), console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(elements['product-version'].textContent, 'Version 3.2.0-rc105');
  assert.strictEqual(elements['result-folder-results'].textContent, 'C:\\Results\\DataSecure-Output\\Lauf-1');
  assert.strictEqual(elements['results-view'].hidden, false, 'a completed run opens the results view');
  await elements.results.listeners.click();
  assert.ok(calls.includes('open_current_results'));
  assert.match(elements['action-feedback'].textContent, /Betriebssystem zum Öffnen übergeben/u);
  assert.strictEqual(elements['status-title'].textContent, 'Fertig', 'open feedback must not overwrite the completed run state');
  await elements.ledger.listeners.click();
  assert.match(elements['action-feedback'].textContent, /Zuordnungsdatei.*übergeben/u);
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
    document: { getElementById: (id) => elements[id] },
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
  assert.strictEqual(elements.start.focused, true);
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
    document: { getElementById: (id) => elements[id] ||= element() },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (callback) => callback(), console
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(calls.find((call) => call.action === 'frontend_ready').args.nativeDropReady, false,
    'native drop is not enabled if the renderer listener failed');
  assert.strictEqual(elements['drop-zone'].hidden, true);
  assert.strictEqual(elements['status-title'].textContent, 'Auswahl bereit');
  assert.strictEqual(elements.start.hidden, false, 'a renderer reload recovers explicit Start for an existing admission');
  assert.strictEqual(elements['selected-files'].textContent, 'Profil.txt');
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
async function frontendHarness(overrides = {}) {
  const elements = {};
  const timers = new Map();
  const calls = [];
  let timerId = 0;
  let nativeListener;
  const invoke = async (action, args) => {
    calls.push({ action, args });
    if (overrides[action]) return overrides[action](args);
    if (action === 'get_ui_context') return localContext();
    if (action === 'get_public_state') return { state: 'ready', results_available: false };
    return { ok: true };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), {
    window: { __TAURI__: { core: { invoke }, event: { listen: async (_name, callback) => {
      nativeListener = callback; return () => {};
    } } }, addEventListener() {} },
    document: { getElementById: (id) => elements[id] ||= element() },
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

async function uncertainStartPollingCase() {
  const start = deferred();
  let state = { state: 'ready', results_available: false };
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil.txt']) }),
    start_admitted_batch: () => start.promise,
    get_public_state: () => state
  });
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
  await harness.click('select-files');
  await harness.click('start');
  await harness.runTimer();
  assert.match(harness.elements['result-folder-results'].textContent, /Lauf-B$/u,
    'identical terminal state and counts do not identify the previous run');
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

async function failedRunLedgerAvailabilityCase() {
  let ledgerAvailable;
  const harness = await frontendHarness({
    get_public_state: () => ({ state: 'completed_without_results', results_available: false,
      processing_mode: 'markdown-only', failed_count: 2, ledger_available: ledgerAvailable })
  });
  assert.strictEqual(harness.elements.ledger.hidden, true, 'missing availability is not a promise of a run ledger');
  assert.match(harness.elements['status-text'].textContent, /Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['status-text'].textContent, /Details stehen in der lokalen Zuordnung/u);
  assert.strictEqual(harness.elements['result-warning'].hidden, false);
  assert.match(harness.elements['result-warning'].textContent, /2 Datei.*nicht umgewandelt.*Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = false;
  await harness.runTimer();
  assert.strictEqual(harness.elements.ledger.hidden, true);
  assert.match(harness.elements['result-warning'].textContent, /Zuordnungsdatei ist nicht verfügbar.*Diagnose öffnen/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  ledgerAvailable = true;
  await harness.runTimer();
  assert.strictEqual(harness.elements.ledger.hidden, false);
  assert.match(harness.elements['status-text'].textContent, /Details stehen in der lokalen Zuordnung/u);
  assert.match(harness.elements['result-warning'].textContent, /Details stehen in der Zuordnungsdatei/u);
  assert.doesNotMatch(harness.elements['result-warning'].textContent, /Diagnose öffnen/u);
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
  assert.strictEqual(harness.elements.ledger.hidden, true);
  assert.strictEqual(harness.elements.results.hidden, true);
  completionPending = false;
  await harness.runTimer();
  assert.strictEqual(harness.elements['status-title'].textContent, 'Fertig');
  assert.strictEqual(harness.elements.ledger.hidden, false);
  assert.strictEqual(harness.elements.results.hidden, false);
}

async function explicitStartModeCase() {
  const start = deferred();
  const harness = await frontendHarness({
    select_files: () => ({ selected_count: 1, ui_context: localContext('Lauf-1', ['Profil.txt']) }),
    start_admitted_batch: () => start.promise
  });
  assert.strictEqual(harness.elements['processing-mode'].disabled, false);
  await harness.click('select-files');
  assert.strictEqual(harness.elements['processing-mode'].disabled, false, 'a prepared selection has not bound its mode yet');
  const starting = harness.click('start');
  assert.strictEqual(harness.elements['processing-mode'].disabled, true, 'the pending start locks the selector');
  assert.strictEqual(JSON.stringify(harness.calls.find((call) => call.action === 'start_admitted_batch').args),
    JSON.stringify({ processingMode: 'markdown-and-anonymize' }), 'Tauri receives the selected mode under its camelCase argument');
  harness.elements['processing-mode'].value = 'markdown-only';
  start.resolve({ ok: true });
  await starting;
  assert.strictEqual(harness.elements['processing-mode'].disabled, true, 'accepted but not yet polled intake remains locked');
  assert.strictEqual(harness.calls.find((call) => call.action === 'start_admitted_batch').args.processingMode,
    'markdown-and-anonymize', 'a later selector change cannot mutate the submitted start');
  assert.strictEqual(harness.count('start_admitted_batch'), 1);
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
  assert.strictEqual(continued.length, 1);
  assert.strictEqual(continued[0].args, undefined, 'continue never sends the current selector value');
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

(async () => {
  await testAsync('a successful status poll clears an earlier IPC error atomically', recoveredStatusCase);
  await testAsync('result and ledger actions show a separate confirmed handoff', openFeedbackCase);
  await testAsync('native drops prepare without starting and preserve admission across races', nativeDropCase);
  await testAsync('a renderer reload restores a prepared selection and listener failure preserves picker fallback', restoredAdmissionCase);
  await testAsync('a poll timer consumed by a cancelled picker keeps polling alive', pickerTimerCancellationCase);
  await testAsync('an unconfirmed slow start is observed until completion without restarting the batch', uncertainStartPollingCase);
  await testAsync('an unconfirmed start of a restored admission starts status recovery', restoredAdmissionUncertainStartCase);
  await testAsync('fast consecutive terminal runs refresh their exact result folder without repeated idle export reads', consecutiveTerminalRunsCase);
  await testAsync('a stale poll cannot overwrite a new run after selection and Start both completed', stalePollAfterStartCase);
  await testAsync('a delayed terminal context cannot overwrite a newly prepared selection', staleContextAfterAdmissionCase);
  await testAsync('a delayed terminal context remains stale after the new selection was already started', () => staleContextAfterAdmissionCase(true));
  await testAsync('late cancellation context preserves a freshly dropped selection', cancelledAdmissionContextRaceCase);
  await testAsync('a failed run offers its ledger only when the backend confirms availability', failedRunLedgerAvailabilityCase);
  await testAsync('completion metadata debt is visible without claiming zero missing documents or no results', completionPendingCase);
  await testAsync('explicit Start sends one immutable camelCase processing mode and locks it before checkpoint', explicitStartModeCase);
  await testAsync('unavailable conversion keeps the admission without a silent anonymization fallback', unavailableModePreservesAdmissionCase);
  await testAsync('active and recoverable modes stay locked after unrelated RPCs and continue sends no mode', recoverableModeLockCase);
  await testAsync('pure conversion stays selected during intake and reports raw results and OCR warnings honestly', pureConversionCase);
  done();
})();
