'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Standalone frontend');

function element() {
  return { disabled: false, hidden: false, textContent: '', title: '', className: '', listeners: {}, attributes: {},
    focus() { this.focused = true; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { this.listeners[type] = listener; } };
}

async function recoveredStatusCase() {
  const ids = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
    'configure-results', 'diagnostics', 'status-icon', 'status-title', 'status-text', 'summary',
    'result-folder', 'result-folder-results', 'source-folders', 'selected-files', 'result-count',
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch', 'product-version', 'drop-zone'];
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
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch', 'product-version', 'drop-zone'];
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

(async () => {
  await testAsync('a successful status poll clears an earlier IPC error atomically', recoveredStatusCase);
  await testAsync('result and ledger actions show a separate confirmed handoff', openFeedbackCase);
  await testAsync('native drops prepare without starting and preserve admission across races', nativeDropCase);
  await testAsync('a renderer reload restores a prepared selection and listener failure preserves picker fallback', restoredAdmissionCase);
  done();
})();
