'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Standalone frontend');

function element() {
  return { disabled: false, hidden: false, textContent: '', title: '', className: '', listeners: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { this.listeners[type] = listener; } };
}

async function recoveredStatusCase() {
  const ids = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
    'configure-results', 'diagnostics', 'status-icon', 'status-title', 'status-text', 'summary',
    'result-folder', 'result-folder-results', 'source-folders', 'selected-files', 'result-count',
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch'];
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
    window: { __TAURI__: { core: { invoke } } },
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
    'action-feedback', 'tab-process', 'tab-results', 'process-view', 'results-view', 'new-batch'];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const calls = [];
  const invoke = async (action) => {
    calls.push(action);
    if (action === 'get_ui_context') return { ok: true, result_folder: 'C:\\Results', latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-1', source_folders: [], selected_files: [], local_ui_only: true, external_disclosure: false };
    if (action === 'get_public_state') return { ok: true, state: 'results_available', results_available: true, result_count: 4 };
    if (action === 'open_current_results' || action === 'open_local_ledger') return { ok: true, handoff_confirmed: true };
    return { ok: true };
  };
  const context = {
    window: { __TAURI__: { core: { invoke } } }, document: { getElementById: (id) => elements[id] },
    setTimeout: () => 1, clearTimeout: () => {}, requestAnimationFrame: (callback) => callback(), console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/app.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(elements['result-folder-results'].textContent, 'C:\\Results\\DataSecure-Output\\Lauf-1');
  assert.strictEqual(elements['results-view'].hidden, false, 'a completed run opens the results view');
  await elements.results.listeners.click();
  assert.ok(calls.includes('open_current_results'));
  assert.match(elements['action-feedback'].textContent, /Betriebssystem zum Öffnen übergeben/u);
  assert.strictEqual(elements['status-title'].textContent, 'Fertig', 'open feedback must not overwrite the completed run state');
  await elements.ledger.listeners.click();
  assert.match(elements['action-feedback'].textContent, /Zuordnungsdatei.*übergeben/u);
}

(async () => {
  await testAsync('a successful status poll clears an earlier IPC error atomically', recoveredStatusCase);
  await testAsync('result and ledger actions show a separate confirmed handoff', openFeedbackCase);
  done();
})();
