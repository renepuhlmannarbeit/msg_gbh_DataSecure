'use strict';

// Actual renderer code in an isolated DOM model. This verifies transitions,
// not browser layout, Tauri IPC injection, native pickers or privacy quality.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Standalone v2 workspace transitions');
const base = path.join(__dirname, '../apps/datasecure-standalone/frontend');
const source = fs.readFileSync(path.join(base, 'workspace.js'), 'utf8');
const html = fs.readFileSync(path.join(base, 'workspace.html'), 'utf8');
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const id = n => n.toString(16).padStart(32, '0');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(options = {}) {
  const nodes = [], roots = new Map(), calls = [], timers = new Set(), intervals = new Set(), listeners = new Map();
  const doc = { activeElement: null };
  const createElement = tag => {
    const node = { tagName: tag.toUpperCase(), id: '', children: [], parent: null, attrs: {}, events: new Map(), dataset: {},
      hidden: false, disabled: false, checked: false, indeterminate: false, open: false, tabIndex: 0, value: '', className: '', ownText: '', textUpdates: 0, textHistory: [],
      append(...children) { for (const child of children) {
        if (child.parent) child.parent.children = child.parent.children.filter(existing => existing !== child);
        child.parent = this; this.children.push(child);
      } },
      replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.ownText = ''; this.append(...children); },
      addEventListener(event, callback) { this.events.set(event, callback); },
      setAttribute(key, value) { this.attrs[key] = String(value); }, removeAttribute(key) { delete this.attrs[key]; },
      focus() { doc.activeElement = this; },
      showModal() { this.open = true; },
      close() { this.open = false; this.events.get('close')?.(); },
      closest(selector) { assert.equal(selector, '[hidden]'); for (let n = this; n; n = n.parent) if (n.hidden) return n; return null; },
      get isConnected() { let n = this; while (n.parent) n = n.parent; return [...roots.values()].includes(n); },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
      set textContent(text) { for (const child of this.children) child.parent = null; this.children = []; this.ownText = String(text); this.textUpdates++; this.textHistory.push(this.ownText); }
    };
    nodes.push(node); return node;
  };
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gu)) {
    const node = createElement(match[1]); node.id = match[3]; node.hidden = /\bhidden(?:\s|>|$)/u.test(match[2]);
    node.value = /\bvalue="([^"]*)"/u.exec(match[2])?.[1] || ''; node.checked = /\bchecked/u.test(match[2]);
    node.className = /\bclass="([^"]*)"/u.exec(match[2])?.[1] || ''; roots.set(node.id, node);
    for (const attr of match[2].matchAll(/\b(role|aria-[a-z-]+)="([^"]*)"/gu)) node.attrs[attr[1]] = attr[2];
  }
  const el = name => roots.get(name) || nodes.find(node => node.id === name && node.isConnected);
  doc.getElementById = el; doc.createElement = createElement;
  doc.querySelectorAll = selector => {
    assert.equal(selector, 'button:not(.nav-tab), input');
    return nodes.filter(node => node.isConnected && (node.tagName === 'INPUT' || node.tagName === 'BUTTON' && !node.className.includes('nav-tab')));
  };
  const model = { catalogue: [], revision: 0, entries: [], state: { state: 'ready', external_disclosure: false } };
  let nativeReviewGeneration = 0;
  const invoke = async (command, args) => {
    calls.push({ command, args });
    const fallback = () => {
      if (command === 'frontend_ready') return { product_version: '3.2.0-rc158' };
      if (command === 'get_ui_context') return { local_ui_only: true, external_disclosure: false,
        source_catalogue: model.catalogue, catalogue_revision: model.revision, result_folder: 'Local results', source_folders: [] };
      if (command === 'get_public_state') return { ...model.state };
      if (command === 'get_run_history') return { local_ui_only: true, external_disclosure: false, entries: model.entries,
        ...(args?.recoverExports === true ? { export_recovery: { batch_id: args.recoverBatchId, outcome: 'pending' } } : {}) };
      if (command === 'get_native_recovery_status') return { phase: 'settling', local_ui_only: true, external_disclosure: false };
      if (command === 'select_files' || command === 'select_folder') {
        model.catalogue = options.catalogue || catalogue(); model.revision++;
        return { ui_context: { local_ui_only: true, external_disclosure: false,
          source_catalogue: model.catalogue, catalogue_revision: model.revision } };
      }
      if (command === 'cancel_admission') { model.catalogue = []; return { ok: true }; }
      if (command === 'start_admitted_batch') {
        model.state = { state: 'processing', batch_id: A, processing_mode: args.processingMode, selected_count: args.sourceIds.length };
        model.catalogue = []; model.revision++;
        return { ok: true, batch_id: A };
      }
      if (command === 'continue_history_batch') {
        const entry = model.entries.find(entry => entry.batch_id === args.batchId);
        model.state = { state: 'processing', batch_id: args.batchId, processing_mode: entry?.processing_mode || 'markdown-only', selected_count: entry?.selected_count || 2 };
        return { ok: true };
      }
      if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, files: [] };
      if (command === 'close_review_window') return { ok: true };
      if (command === 'open_embedded_review') return { ok: true, review_generation: ++nativeReviewGeneration };
      if (command.startsWith('open_')) return { ok: true };
      throw Error(`Unexpected command: ${command}`);
    };
    return options.invoke ? options.invoke(command, args, fallback, model) : fallback();
  };
  const window = { __TAURI__: { core: { invoke }, event: { listen: async (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name); } } },
    addEventListener() {} };
  const context = vm.createContext({ window, document: doc, requestAnimationFrame: options.requestAnimationFrame || (fn => fn()),
    crypto: require('node:crypto').webcrypto,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) });
  vm.runInContext(fs.readFileSync(path.join(base, 'workflow-presentation.js'), 'utf8'), context, { filename: 'workflow-presentation.js' });
  vm.runInContext(source, context, { filename: 'workspace.js' });
  if (options.documentRenderer) vm.runInContext(fs.readFileSync(path.join(base, 'text-positions.js'), 'utf8'), context,
    { filename: 'text-positions.js' });
  if (options.documentRenderer) vm.runInContext(fs.readFileSync(path.join(base, 'document-review.js'), 'utf8'), context,
    { filename: 'document-review.js' });
  return { el, doc, window, calls, model, listeners, nodes,
    async act(node, event = 'click') { if (typeof node === 'string') node = el(node); assert.ok(node, 'actual rendered target exists');
      doc.activeElement = node; node.events.get(event)?.({ preventDefault() {} }); await tick(); },
    async poll() { const fn = [...timers][0]; timers.delete(fn); await fn?.(); await tick(); } };
}
function catalogue() {
  return [{ name: 'One/Inner/A.pdf', source_id: id(1), bytes: 10, selectable: true },
    { name: 'One/Inner/B.docx', source_id: id(2), bytes: 20, selectable: true },
    { name: 'Two/C.txt', source_id: id(3), bytes: 30, selectable: true },
    { name: 'Two/Bad.zip', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED' }];
}
function descendants(node, predicate) {
  return node.children.flatMap(child => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function withClass(node, name) { return descendants(node, child => child.className.split(/\s+/u).includes(name)); }
async function toggleHistorySummary(h, batchId) {
  const toggle = h.el(`history-${batchId}-summary-toggle`);
  if (!toggle) {
    const disclosure = h.el(`history-${batchId}-disclosure`);
    assert.ok(disclosure, 'Markdown status belongs to the native run-details disclosure');
    disclosure.open = !disclosure.open;
    await h.act(disclosure, 'toggle');
    return;
  }
  assert.ok(toggle, 'the selected run has an explicit status disclosure');
  if (toggle.closest('[hidden]')) await h.act(`history-${batchId}-more`);
  assert.equal(toggle.closest('[hidden]'), null, 'status lookup is initiated by an actually visible control');
  await h.act(toggle);
}
function selectedRun(h, batchId) {
  assert.equal(h.el('details-view').hidden, false);
  assert.equal(h.el('nav-details').attrs['aria-selected'], 'true');
  assert.equal(h.el('nav-details').attrs['aria-controls'], 'details-view');
  assert.equal(h.el('nav-history').attrs['aria-controls'], 'history-view');
  assert.equal(h.el('details-run-id').textContent, `Lauf-ID: ${batchId}`);
}
async function selectAndStart(h) {
  await tick(); await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change'); await h.act('start');
}

testAsync('no purpose is preselected and picking alone never starts processing', async () => {
  const h = harness(); await tick();
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  await h.act('select-folder');
  assert.equal(h.el('drop-zone').hidden, true); assert.equal(h.el('catalogue').hidden, false);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
});

testAsync('startup does not wait for detailed history; opening Verlauf loads it read-only', async () => {
  const h = harness(); await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_run_history').length, 0);
  await h.act('nav-history');
  assert.equal(h.calls.filter(call => call.command === 'get_run_history').length, 1);
  assert.equal(h.calls.find(call => call.command === 'get_run_history')?.args, undefined);
});

testAsync('repeated core startup failures stop automatic attempts but keep an explicit status retry', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state') throw Error('STANDALONE_IPC_FAILED');
    return fallback();
  } });
  await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 2);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 2);
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 3);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

for (const code of ['STANDALONE_IPC_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
testAsync(`${code}: two busy status reads keep polling until a real status arrives`, async () => {
  let reads = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state' && ++reads <= 2) throw Error(code);
    return fallback();
  } });
  await tick(); await tick();
  assert.equal(reads, 1);
  assert.doesNotMatch(h.el('feedback').textContent, /Verbindung.*unterbrochen|STANDALONE_(?:IPC|OWNERSHIP_CONTROL|PAUSE_CONTROL)_BUSY/u);
  await h.poll();
  assert.equal(reads, 2);
  assert.doesNotMatch(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll();
  assert.equal(reads, 3);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.calls.some(call => call.command === 'get_native_recovery_status'), false,
    'automatic Busy handling does not add another native read');
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

for (const code of ['STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
for (const readCommand of ['get_public_state', 'get_ui_context'])
testAsync(`${code} during explicit ${readCommand} keeps status unconfirmed despite native Ready and activity`, async () => {
  let refuse = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === readCommand && refuse) throw Error(code);
    if (command === 'get_native_recovery_status') return { phase: 'owned', connection_epoch: 1,
      bootstrap_failure: null, bootstrap_resolution: null, diagnostic_log: 'available', diagnostic_writer: {},
      local_ui_only: true, external_disclosure: false,
      activity: { state: 'active', active: true, action: 'export_approved_documents', phase: 'native', elapsed_ms: 42000 } };
    return fallback();
  } });
  await tick(); await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } });
  await h.act('connection-retry'); await tick();
  assert.match(h.el('feedback').textContent, /Vorgang.*Zustand.*noch nicht bestätigt/u);
  assert.match(h.el('feedback').textContent, /ausgewählte Kopie.*42 Sekunden.*Abschluss steht noch aus/u,
    'the real nonempty native activity description supplements the unconfirmed status');
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt|abgeschlossen|Pause noch nicht bestätigt/u);
  assert.equal(h.el('feedback').className, 'notice');
  if (readCommand === 'get_ui_context') {
    await h.act('select-folder');
    assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 0);
    assert.match(h.el('start-hint').textContent, /Verbindung wird wiederhergestellt/u);
  }
  const before = h.calls.filter(call => call.command === readCommand).length;
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === readCommand).length, before + 1,
    'explicit Busy does not stop the next automatic read');
  assert.match(h.el('feedback').textContent, /Verbindung und Laufstatus sind noch nicht bestätigt/u);
  assert.equal(h.el('job').hidden, true, 'native Ready and a busy read cannot acknowledge a run');
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'continue_history_batch',
    'export_approved_documents', 'decide_document_review_batch'].includes(call.command)), false);
  refuse = false; await h.poll();
  assert.doesNotMatch(h.el('feedback').textContent, /Verbindung und Laufstatus sind noch nicht bestätigt/u,
    'a successful status/context read retires its earlier Busy notice');
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 1,
    'only an actual successful context releases the picker guard');
});

for (const code of ['STANDALONE_OWNERSHIP_RUNTIME_INVALID', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED',
  'STANDALONE_IPC_TIMEOUT', 'STANDALONE_PAUSE_CONTROL_INVALID', 'STANDALONE_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY_UNKNOWN'])
testAsync(`${code}: hard errors and other Busy names still stop automatic status reads`, async () => {
  let reads = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state') { reads++; throw Error(code); }
    return fallback();
  } });
  await tick(); await tick(); await h.poll();
  const expected = ['STANDALONE_OWNERSHIP_RUNTIME_INVALID', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'].includes(code) ? 1 : 2;
  assert.equal(reads, expected);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll(); assert.equal(reads, expected);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

for (const code of ['STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
testAsync(`${code}: a rejected start remains an error and is never replayed by polling`, async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'start_admitted_batch') throw Error(code);
    return fallback();
  } });
  await selectAndStart(h);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.match(h.el('feedback').textContent, new RegExp(code, 'u'));
  assert.equal(h.el('feedback').className, 'notice error');
  assert.equal(h.el('job').hidden, true, 'Busy does not acknowledge a new run');
  for (let n = 0; n < 3; n++) await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.el('job').hidden, true);
});

for (const initial of [true, false]) for (const eventFirst of [true, false])
testAsync(`a bootstrap rights refusal survives ${initial ? 'initial context' : 'replacement status'} generations with event ${eventFirst ? 'before' : 'after'} rejection`, async () => {
  const code = 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE';
  let h, refuse = initial, epoch = initial ? 0 : 1;
  let lastFailure;
  const emit = payload => h.listeners.get('datasecure-connection')({ payload });
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status' && lastFailure) return { phase: 'owned',
      bootstrap_failure: { epoch: lastFailure.epoch, error_code: code }, local_ui_only: true, external_disclosure: false };
    if (refuse && (command === 'get_public_state' || initial && command === 'get_ui_context')) {
      lastFailure = { epoch: ++epoch, state: 'bootstrap_failed', error_code: code };
      const failure = lastFailure;
      if (eventFirst) emit(failure); else setImmediate(() => emit(failure));
      throw Error(code);
    }
    if (!refuse && command === 'get_public_state' && args?.retryBootstrap === true) emit({ epoch: ++epoch, state: 'ready' });
    return fallback();
  } });
  await tick(); await tick();
  if (!initial) {
    refuse = true; emit({ epoch: 1, state: 'recovering' }); await h.poll(); await tick();
  }
  const before = h.calls.filter(call => ['get_public_state', 'get_ui_context', 'get_run_history'].includes(call.command)).length;
  const banner = h.el('feedback').textContent;
  assert.match(banner, /Zugriffsrechte.*Identität.*STANDALONE_OWNERSHIP_STORAGE_UNSAFE/u);
  assert.doesNotMatch(banner, /alte Sitzung|Verbindung unterbrochen/u);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  assert.equal(h.el('connection-help').hidden, false);
  for (let n = 0; n < 20; n++) await h.poll();
  await h.act('nav-history'); await h.act('refresh-history');
  emit(lastFailure); emit({ epoch: lastFailure.epoch, state: 'recovering' });
  await h.act('select-folder'); await h.act('configure-results');
  await h.act('connection-diagnostics'); await tick();
  assert.equal(h.calls.filter(call => ['get_public_state', 'get_ui_context', 'get_run_history'].includes(call.command)).length, before,
    'timers, duplicate events and History cannot bypass the held refusal');
  assert.equal(h.el('feedback').textContent, banner, 'picker/help/diagnostic updates cannot replace the fixed cause');
  await h.act('connection-retry'); await tick();
  const retry = h.calls.filter(call => call.command === 'get_public_state').at(-1);
  assert.equal(retry.args?.retryBootstrap, true, 'only the explicit status command requests another bootstrap');
  const afterRetry = h.calls.filter(call => call.command === 'get_public_state').length;
  for (let n = 0; n < 10; n++) await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, afterRetry);
  assert.equal(h.el('feedback').textContent, banner);
  const staleFailure = lastFailure;
  refuse = false; await h.act('connection-retry'); await tick();
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
  emit(staleFailure); await tick();
  assert.doesNotMatch(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_STORAGE_UNSAFE/u);
  assert.equal(h.calls.some(call => ['select_folder', 'configure_results', 'start_admitted_batch',
    'continue_history_batch', 'export_approved_documents', 'decide_document_review_batch'].includes(call.command)), false);
});

testAsync('an active result-root access refusal is actionable without claiming a trapped Core or offering an unavailable in-app folder change', async () => {
  const h = harness(); await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'bootstrap_failed', error_code: 'STANDALONE_RESULT_ROOT_ACCESS_DENIED' } });
  assert.match(h.el('feedback').textContent, /Ergebnisordner.*Zugriff verweigert/u);
  assert.match(h.el('connection-status').textContent, /Ordner nicht in der App gewechselt/u);
  assert.doesNotMatch(h.el('connection-status').textContent, /Core konnte keine Verbindung|Zertifikat|Vollzugriff|Gatekeeper/u);
  await h.act('configure-results'); await h.poll();
  assert.equal(h.calls.some(call => ['configure_results', 'start_admitted_batch', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('a native bootstrap snapshot preserves the cause when the event is delayed and never grants retry by itself', async () => {
  let h, refuse = false;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status' && refuse) return { phase: 'owned', bootstrap_failure: failure,
      local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state' && refuse) throw Error(failure.error_code);
    return fallback();
  } });
  await tick(); refuse = true;
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } }); await tick();
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_STORAGE_UNSAFE/u);
  const before = h.calls.filter(call => call.command === 'get_public_state').length;
  await h.poll(); assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, before);
  h.listeners.get('datasecure-connection')({ payload: { ...failure, state: 'bootstrap_failed' } });
  await h.act('nav-history'); assert.equal(h.calls.some(call => call.command === 'get_run_history'), false);
});

testAsync('one explicit bootstrap retry remains single-flight and Ready resolution does not resume polling without context', async () => {
  let h, refuse = false, release, contextFails = false, nativeReady = false;
  const resolution = { failure_epoch: 1, ready_epoch: 2 };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status' && refuse) return { phase: 'owned', connection_epoch: nativeReady ? 2 : 1,
      bootstrap_failure: nativeReady ? null : { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' },
      bootstrap_resolution: nativeReady ? resolution : null, local_ui_only: true, external_disclosure: false };
    if (command === 'get_ui_context' && contextFails) throw Error('STANDALONE_IPC_BUSY');
    if (command === 'get_public_state' && refuse) return new Promise(resolve => { release = () => {
      nativeReady = true;
      h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready', bootstrap_resolution: resolution } });
      resolve(fallback());
    }; });
    return fallback();
  } });
  await tick(); refuse = true;
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'bootstrap_failed',
    error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' } });
  await h.act('connection-retry'); await h.act('connection-retry');
  assert.equal(h.calls.filter(call => call.command === 'get_public_state' && call.args?.retryBootstrap === true).length, 1);
  contextFails = true; release(); await tick(); await tick();
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt/u, 'Ready is not a workspace certificate');
  assert.equal(h.el('connection-help').hidden, false);
  const reads = h.calls.filter(call => ['get_public_state', 'get_ui_context'].includes(call.command)).length;
  for (let n = 0; n < 5; n++) await h.poll();
  assert.equal(h.calls.filter(call => ['get_public_state', 'get_ui_context'].includes(call.command)).length, reads);
});

testAsync('native failure snapshot advances the UI epoch before retry so a delayed original event cannot stale its successful status', async () => {
  let h, firstContext = true;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && firstContext) { firstContext = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') return { phase: 'idle', bootstrap_failure: failure,
      local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state' && args?.retryBootstrap === true) {
      h.listeners.get('datasecure-connection')({ payload: { ...failure, state: 'bootstrap_failed' } });
      h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready' } });
    }
    return fallback();
  } });
  await tick(); await tick();
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_STORAGE_UNSAFE/u);
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'get_ui_context').length, 2);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
});

for (const code of ['STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED'])
testAsync(`resolved ${code} stays retired when successful status/context precede Ready and the old failure arrives again`, async () => {
  let h, firstContext = true;
  const failure = { epoch: 1, state: 'bootstrap_failed', error_code: code };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status') return { phase: 'owned',
      bootstrap_failure: { epoch: failure.epoch, error_code: code }, local_ui_only: true, external_disclosure: false };
    if (command === 'get_ui_context' && firstContext) {
      firstContext = false; h.listeners.get('datasecure-connection')({ payload: failure }); throw Error(code);
    }
    // Deliberately return real successful renderer DTOs without delivering
    // Ready yet: native events and invoke responses have independent timing.
    return fallback();
  } });
  await tick(); await tick();
  assert.ok(h.el('feedback').textContent.includes(code));
  await h.act('connection-retry'); await tick();
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  h.listeners.get('datasecure-connection')({ payload: failure });
  h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready' } });
  await tick();
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true, 'the resolved old epoch must not latch a second time');
  const newerCode = code === 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'
    ? 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED' : 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE';
  h.listeners.get('datasecure-connection')({ payload: { epoch: 3, state: 'bootstrap_failed', error_code: newerCode } });
  assert.ok(h.el('feedback').textContent.includes(newerCode), 'a strictly newer failure must still latch');
  await h.poll(); assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
});

for (const code of ['STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED'])
for (const bad of ['unavailable', 'missing', 'epoch-string', 'epoch-zero', 'code-raw', 'extra-field', 'disclosure', 'phase', 'stale'])
testAsync(`unbound ${code} cannot bootstrap with ${bad} snapshot; a later fresh snapshot allows one retry before delayed failure/Ready`, async () => {
  let h, firstContext = true, good = false;
  const nativeEpoch = bad === 'stale' ? 2 : 1;
  const failure = { epoch: nativeEpoch, error_code: code };
  const snapshot = () => ({ phase: 'owned', bootstrap_failure: { ...failure }, local_ui_only: true, external_disclosure: false });
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && firstContext) { firstContext = false; throw Error(code); }
    if (command === 'get_native_recovery_status') {
      if (good) return snapshot();
      if (bad === 'unavailable') throw Error('PRIVATE_VENDOR_PATH');
      const value = snapshot();
      if (bad === 'missing') delete value.bootstrap_failure;
      if (bad === 'epoch-string') value.bootstrap_failure.epoch = String(nativeEpoch);
      if (bad === 'epoch-zero') value.bootstrap_failure.epoch = 0;
      if (bad === 'code-raw') value.bootstrap_failure.error_code = 'PRIVATE_VENDOR_PATH /secret';
      if (bad === 'extra-field') value.bootstrap_failure.vendor = 'PRIVATE_VENDOR_PATH';
      if (bad === 'disclosure') value.external_disclosure = true;
      if (bad === 'phase') value.phase = 'PRIVATE_VENDOR_PATH';
      if (bad === 'stale') value.bootstrap_failure.epoch = 1;
      return value;
    }
    if (command === 'get_public_state') assert.equal(args?.retryBootstrap, true);
    return fallback();
  } });
  await tick(); await tick();
  // Only the actual initial invoke catch supplies provisional UI epoch 0;
  // no native failure authority is hidden in the default mock.
  if (bad === 'stale') h.listeners.get('datasecure-connection')({ payload: { ...failure, state: 'bootstrap_failed' } });
  const banner = h.el('feedback').textContent;
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 0);
  assert.equal(h.calls.filter(call => call.command === 'get_ui_context').length, 1);
  assert.equal(h.el('feedback').textContent, banner);
  assert.match(h.el('connection-status').textContent, /kein neuer Core-Start angefordert/iu);
  assert.doesNotMatch(h.el('connection-status').textContent, /PRIVATE_VENDOR_PATH/u);
  assert.equal(h.el('connection-retry').disabled, false);
  for (let n = 0; n < 3; n++) await h.poll();
  await h.act('nav-history'); await h.act('connection-diagnostics');
  assert.equal(h.calls.filter(call => ['get_public_state', 'get_run_history'].includes(call.command)).length, 0);
  good = true; await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'get_ui_context').length, 2);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  // Success intentionally precedes both the original failure event and Ready.
  h.listeners.get('datasecure-connection')({ payload: { ...failure, state: 'bootstrap_failed' } });
  h.listeners.get('datasecure-connection')({ payload: { epoch: nativeEpoch + 1, state: 'ready' } });
  await tick();
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
  h.listeners.get('datasecure-connection')({ payload: { epoch: nativeEpoch + 2, state: 'bootstrap_failed', error_code: code } });
  assert.ok(h.el('feedback').textContent.includes(code), 'a newer native failure must still latch');
  await h.poll(); assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'continue_history_batch', 'export_approved_documents',
    'decide_document_review_batch'].includes(call.command)), false);
});

for (const code of ['STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED'])
testAsync(`a stale in-flight snapshot for ${code} cannot authorize retry after a newer native failure`, async () => {
  let h, firstContext = true, resolveSnapshot, good = false;
  const nativeSnapshot = epoch => ({ phase: 'owned', bootstrap_failure: { epoch, error_code: code },
    local_ui_only: true, external_disclosure: false });
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && firstContext) { firstContext = false; throw Error(code); }
    if (command === 'get_native_recovery_status') return good ? nativeSnapshot(2)
      : new Promise(resolve => { resolveSnapshot = resolve; });
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await h.act('connection-retry');
  assert.equal(h.calls.filter(call => call.command === 'get_native_recovery_status').length, 1,
    'a second click while the fresh snapshot is pending must not create another retry intent');
  h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'bootstrap_failed', error_code: code } });
  resolveSnapshot(nativeSnapshot(1)); await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 0);
  assert.ok(h.el('feedback').textContent.includes(code));
  good = true; await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'get_ui_context').length, 2);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
});

testAsync('ordinary explicit status without a native failure proof never sets the bootstrap retry flag', async () => {
  const h = harness(); await tick(); await tick(); await h.act('connection-retry'); await tick();
  assert.equal(h.calls.some(call => call.command === 'get_public_state' && call.args?.retryBootstrap === true), false);
});

for (const code of ['STANDALONE_DATA_ROOT_UNSAFE', 'STANDALONE_OWNERSHIP_RUNTIME_INVALID', 'STANDALONE_OWNERSHIP_RUNTIME_DENIED',
  'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED', 'STANDALONE_OWNERSHIP_RUNTIME_LOAD_FAILED'])
testAsync(`${code} keeps the platform-specific startup reason without automatic reconnect`, async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context') throw Error(code);
    return fallback();
  } });
  await tick(); await tick();
  assert.ok(h.el('feedback').textContent.includes(code));
  const banner = h.el('feedback').textContent;
  for (let n = 0; n < 5; n++) await h.poll();
  await h.act('nav-history'); await h.act('connection-diagnostics');
  assert.equal(h.el('feedback').textContent, banner);
  assert.equal(h.calls.filter(call => ['get_public_state', 'get_run_history'].includes(call.command)).length, 0);
  assert.equal(h.el('connection-help').hidden, false);
});

testAsync('a native Mac core trap is explained and stops automatic retry after the first failure', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status') return { phase: 'owned',
      bootstrap_failure: { epoch: 1, error_code: 'STANDALONE_SIDECAR_SIGNAL_TRAP' },
      local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state') throw Error('STANDALONE_SIDECAR_SIGNAL_TRAP');
    return fallback();
  } });
  await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.match(h.el('feedback').textContent, /lokale Core.*Signal 5/u);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 2);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

testAsync('an explicit busy status check can read native activity while Core is occupied and never replays work', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state') throw Error('STANDALONE_IPC_BUSY');
    if (command === 'get_native_recovery_status') return { phase: 'owned', local_ui_only: true, external_disclosure: false,
      activity: { state: 'active', active: true, action: 'export_approved_documents', phase: 'native', elapsed_ms: 42000 } };
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick();
  assert.match(h.el('feedback').textContent, /ausgewählte Kopie.*42 Sekunden.*Abschluss steht noch aus/u);
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'export_approved_documents', 'decide_document_review_batch'].includes(call.command)), false);
});

testAsync('a missing configured destination stays visible and blocks Start until an explicit folder change', async () => {
  let unavailable = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context') return { ...fallback(), result_folder: '', result_folder_status: 'unavailable' };
    if (command === 'select_folder') { const result = fallback(); result.ui_context.result_folder_status = 'unavailable'; return result; }
    if (command === 'configure_results') { unavailable = false; return { local_ui_only: true, external_disclosure: false, result_folder: 'New local results' }; }
    return fallback();
  } });
  await tick(); await tick(); await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.match(h.el('destination').textContent, /Bisheriger Ergebnisordner nicht verfügbar/u);
  await h.act('start'); assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  await h.act('configure-results'); assert.equal(unavailable, false);
  assert.equal(h.el('destination').textContent, 'New local results');
  await h.act('start'); assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
});

testAsync('a restored original destination can be rechecked without a restart or a new selection', async () => {
  let available = false;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context') return { ...fallback(), result_folder_status: available ? 'available' : 'unavailable',
      result_folder: available ? 'Original local results' : '' };
    if (command === 'select_folder') { const result = fallback(); result.ui_context.result_folder_status = 'unavailable'; return result; }
    return fallback();
  } });
  await tick(); await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.equal(h.el('retry-destination').hidden, false);
  const selectedIds = h.model.catalogue.filter(row => row.selectable).map(row => row.source_id);
  available = true; await h.act('retry-destination');
  assert.equal(h.el('retry-destination').hidden, true); assert.equal(h.el('destination').textContent, 'Original local results');
  await h.act('start');
  assert.deepEqual(h.calls.find(call => call.command === 'start_admitted_batch').args.sourceIds, selectedIds);
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 1);
  assert.equal(h.calls.some(call => call.command === 'configure_results'), false);
});

testAsync('a native Windows loader failure is distinguished from IPC timeout and not retried automatically', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state') throw Error('STANDALONE_SIDECAR_WINDOWS_DLL_MISSING');
    return fallback();
  } });
  await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.match(h.el('feedback').textContent, /Programmkomponente fehlt/u);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 1);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

testAsync('a trap during initial context loading blocks pickers and waits for explicit retry', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context') throw Error('STANDALONE_SIDECAR_SIGNAL_TRAP');
    return fallback();
  } });
  await tick(); await tick();
  assert.match(h.el('feedback').textContent, /Signal 5/u);
  assert.match(h.el('connection-status').textContent, /absichtlich gesperrt/u);
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 0);
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 0);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

for (const code of ['STANDALONE_IPC_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
testAsync(`${code}: two busy context reads retain picker gating and allow the next real context`, async () => {
  let contexts = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && ++contexts <= 2) throw Error(code);
    return fallback();
  } });
  await tick(); await tick();
  assert.match(h.el('feedback').textContent, code === 'STANDALONE_IPC_BUSY'
    ? /Core beendet noch einen Vorgang/u : /Vorgang.*Zustand.*noch nicht bestätigt/u);
  assert.doesNotMatch(h.el('feedback').textContent, /Verbindung.*unterbrochen/u);
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 0);
  await h.poll();
  assert.equal(contexts, 2);
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 0);
  assert.match(h.el('start-hint').textContent, /Verbindung wird wiederhergestellt/u);
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt|abgeschlossen/u);
  assert.doesNotMatch(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll(); assert.equal(contexts, 3);
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 1);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});

testAsync('failed context reload also consumes the bounded automatic recovery attempts', async () => {
  let contextReads = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && ++contextReads > 1) throw Error('STANDALONE_IPC_FAILED');
    return fallback();
  } });
  await tick(); await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } });
  await h.poll(); await h.poll();
  assert.equal(contextReads, 3);
  assert.match(h.el('connection-status').textContent, /Automatische Verbindungsversuche sind angehalten/u);
  await h.poll();
  assert.equal(contextReads, 3);
});

testAsync('footer identifies the actual Mac build and architecture without trusting arbitrary metadata', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'frontend_ready') return { product_version: '3.2.0-rc160', build_id: 'a'.repeat(40),
      runtime_target: 'macos-aarch64' };
    return fallback();
  } });
  await tick(); await tick();
  assert.equal(h.el('product-version').textContent, 'Version 3.2.0-rc160 · Build aaaaaaaa · macOS ARM64');
});

testAsync('raw OCR contact review is explicit opt-in, never preselected or silently enabled', async () => {
  for (const optIn of [false, true]) {
    const h = harness(); await tick(); await h.act('select-folder');
    h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
    assert.equal(h.el('ocr-review').checked, false);
    h.el('text-ocr').checked = true; await h.act('text-ocr', 'change');
    if (optIn) { h.el('ocr-review').checked = true; await h.act('ocr-review', 'change'); }
    await h.act('start');
    const started = h.calls.find(call => call.command === 'start_admitted_batch');
    assert.equal(started.args.ocrContactReview, optIn ? true : undefined);
  }
});

testAsync('raw OCR contact review can be declined directly without opening the review frame', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'skip_ocr_contact_review') return { ok: true, skip_requested: true, external_disclosure: false };
    return fallback();
  } });
  await selectAndStart(h);
  h.model.state = { state: 'review_required', batch_id: A, processing_mode: 'markdown-only',
    selected_count: 3, review_count: 3 };
  await h.poll();
  const skip = h.el('job-actions').children.find(node => node.textContent === 'Ohne diesen Vergleich fortfahren');
  assert.ok(skip);
  await h.act(skip);
  assert.equal(h.el('job-skip-confirm').hidden, false);
  assert.equal(h.calls.some(call => call.command === 'open_embedded_review'), false);
  await h.act('job-skip-accept');
  assert.equal(h.calls.filter(call => call.command === 'skip_ocr_contact_review').length, 1);
  assert.equal(h.calls.some(call => call.command === 'open_embedded_review'), false);
});

for (const purpose of ['markdown-only', 'markdown-and-anonymize']) testAsync(`active ${purpose} processing does not offer an unready review decision`, async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  const radio = purpose === 'markdown-only' ? 'mode-markdown' : 'mode-anonymize';
  h.el(radio).checked = true; await h.act(radio, 'change'); await h.act('start');
  h.model.state = { ...h.model.state, state: 'processing', processing_mode: purpose,
    selected_count: 133, completed_count: 47, review_count: 18 };
  await h.poll();
  const ids = h.el('job-actions').children.map(node => node.id);
  assert.ok(ids.includes('job-action-pause'));
  assert.ok(!ids.includes('job-action-review'));
  assert.ok(!ids.includes('job-action-skip-ocr'));
  assert.match(h.el('job-description').textContent, /47 von 133 Dateien abgeschlossen/u);
});

testAsync('Raw start carries the complete content contract and a single explicit OCR choice', async () => {
  for (const enabled of [false, true]) {
    const h = harness(); await tick(); await h.act('select-folder');
    h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
    assert.equal(h.el('text-ocr').checked, false, 'OCR is not implied by the file picker');
    h.el('text-ocr').checked = enabled; await h.act('text-ocr', 'change');
    await h.act('start');
    const args = h.calls.find(call => call.command === 'start_admitted_batch').args;
    assert.deepEqual(JSON.parse(JSON.stringify(args.contentOptions)), {
      schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: enabled, imageOcr: enabled
    });
    assert.equal(args.outputNamingMode, undefined); assert.equal(args.ocrContactReview, undefined);
  }
});

testAsync('anonymization uses the same explicit OCR input but keeps neutral names and mandatory review', async () => {
  for (const enabled of [false, true]) {
    const h = harness(); await tick(); await h.act('select-folder');
    h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
    assert.equal(h.el('text-ocr-options').hidden, false);
    assert.equal(h.el('output-naming').hidden, false);
    assert.equal(h.el('naming-neutral').checked, true);
    assert.equal(h.el('ocr-option').hidden, true);
    assert.equal(h.el('text-ocr').checked, false);
    h.el('text-ocr').checked = enabled; await h.act('text-ocr', 'change'); await h.act('start');
    const args = h.calls.find(call => call.command === 'start_admitted_batch').args;
    assert.deepEqual(JSON.parse(JSON.stringify(args.contentOptions)), {
      schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: enabled, imageOcr: enabled
    });
    assert.equal(args.outputNamingMode, 'neutral'); assert.equal(args.ocrContactReview, undefined);
  }
});

testAsync('anonymization can retain a source filename with suffix only when explicitly selected', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
  h.el('naming-neutral').checked = false; h.el('naming-source').checked = true;
  await h.act('naming-source', 'change');
  assert.match(h.el('output-naming-help').textContent, /personenbezogenen Angaben/u);
  await h.act('start');
  const args = h.calls.find(call => call.command === 'start_admitted_batch').args;
  assert.equal(args.outputNamingMode, 'source-with-suffix');
});

testAsync('Fastweg is explicit for a new anonymization and cannot leak into raw or later tasks', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
  assert.equal(h.el('fast-anonymize-option').hidden, false); assert.equal(h.el('fast-anonymize').checked, false);
  h.el('fast-anonymize').checked = true; await h.act('fast-anonymize', 'change'); await h.act('start');
  assert.equal(h.calls.find(call => call.command === 'start_admitted_batch').args.reviewPolicy, 'automatic-conservative');
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-and-anonymize',
    selected_count: 3, completed_count: 3, result_count: 3, results_available: true };
  await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Neue Verarbeitung'));
  assert.equal(h.el('fast-anonymize').checked, false);
  await h.act('select-folder'); h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
  h.el('fast-anonymize').checked = true;
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.equal(h.el('fast-anonymize').checked, false); assert.equal(h.el('fast-anonymize-option').hidden, true);
  await h.act('start');
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').at(-1).args.reviewPolicy, undefined);
});

for (const automatic of [false, true]) for (const ocr of [false, true])
testAsync(`named anonymization choice keeps the existing exact start contract: automatic=${automatic}, OCR=${ocr}`, async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
  assert.equal(h.el('manual-anonymize').checked, true, 'the existing guided default needs no extra click');
  assert.equal(h.el('fast-anonymize').checked, false);
  // The VM is not a native radio-group implementation. Supply the checked
  // state emitted by that group; browser coverage verifies real exclusivity.
  h.el('manual-anonymize').checked = !automatic; h.el('fast-anonymize').checked = automatic;
  await h.act(automatic ? 'fast-anonymize' : 'manual-anonymize', 'change');
  assert.equal(h.el('text-ocr').checked, false, 'workflow choice never enables OCR');
  h.el('text-ocr').checked = ocr; await h.act('text-ocr', 'change'); await h.act('start');
  const starts = h.calls.filter(call => call.command === 'start_admitted_batch');
  assert.equal(starts.length, 1); assert.equal(starts[0].args.processingMode, 'markdown-and-anonymize');
  assert.equal(starts[0].args.reviewPolicy, automatic ? 'automatic-conservative' : undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(starts[0].args.contentOptions)), {
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: ocr, imageOcr: ocr
  });
  assert.equal(starts[0].args.ocrContactReview, undefined);
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-and-anonymize',
    selected_count: 3, completed_count: 3, result_count: 3, results_available: true };
  await h.poll(); await h.act(h.el('job-actions').children.find(node => node.textContent === 'Neue Verarbeitung'));
  assert.equal(h.el('manual-anonymize').checked, true); assert.equal(h.el('fast-anonymize').checked, false);
  assert.equal(h.el('text-ocr').checked, false);
});

testAsync('Markdown-only does not send anonymization naming even after changing the setup choice', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change');
  h.el('naming-neutral').checked = false; h.el('naming-source').checked = true;
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.equal(h.el('output-naming').hidden, true);
  assert.equal(h.el('naming-neutral').checked, true);
  assert.equal(h.el('naming-source').checked, false);
  await h.act('start');
  const args = h.calls.find(call => call.command === 'start_admitted_batch').args;
  assert.equal(args.outputNamingMode, undefined);
});

testAsync('a new task does not inherit the previous OCR consent', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  h.el('text-ocr').checked = true; await h.act('text-ocr', 'change');
  h.el('ocr-review').checked = true; await h.act('start');
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-only',
    selected_count: 3, completed_count: 3, result_count: 3, results_available: true };
  await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Neue Verarbeitung'));
  assert.equal(h.el('text-ocr').checked, false);
  assert.equal(h.el('ocr-review').checked, false);
});

testAsync('OCR corrections are independent and cannot silently turn recognition on', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  h.el('ocr-review').checked = true;
  await h.act('start');
  const args = h.calls.find(call => call.command === 'start_admitted_batch').args;
  assert.equal(args.ocrContactReview, undefined); assert.equal(args.contentOptions.imageOcr, false);
});

for (const picker of ['select-files', 'select-folder']) testAsync(`${picker} with a preselected purpose never starts or navigates`, async () => {
  const h = harness(); await tick();
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  await h.act(picker);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  assert.equal(h.el('new-view').hidden, false);
  assert.equal(h.el('history-view').hidden, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'false');
});

testAsync('confirmed Start highlights only its real working history row, displays progress and removes activity on completion', async () => {
  const h = harness({ invoke(command, args, fallback, model) {
    const value = fallback();
    if (command === 'start_admitted_batch') model.entries = [
      { batch_id: A, created_at: '2026-10-08T09:00:00Z', processing_mode: 'markdown-only', selected_count: 3, completed_count: 1, result_count: 1, status: 'processing' },
      { batch_id: B, created_at: '2026-10-07T09:00:00Z', processing_mode: 'markdown-only', selected_count: 3, completed_count: 3, result_count: 3, status: 'completed' }
    ];
    return value;
  } });
  await selectAndStart(h);
  assert.equal(h.el('new-view').hidden, true, 'confirmed processing selects its run details');
  selectedRun(h, A);
  assert.equal(h.el('history-view').hidden, true);
  await h.act('nav-history');
  assert.equal(h.el('history-view').hidden, false);
  let [active, old] = h.el('history-list').children;
  assert.equal(active.dataset.current, 'true'); assert.equal(active.attrs['aria-busy'], 'true');
  assert.match(active.textContent, /Aktueller Lauf.*Wird verarbeitet.*1 von 3/u);
  assert.equal(old.dataset.current, 'false'); assert.equal(old.attrs['aria-busy'], 'false');
  h.model.entries[0].status = 'completed'; h.model.entries[0].completed_count = 3;
  h.model.state = { state: 'results_available', batch_id: A, result_count: 3, batch_complete: true };
  await h.poll();
  [active] = h.el('history-list').children;
  assert.equal(active.dataset.current, 'false'); assert.equal(active.attrs['aria-busy'], 'false');
  assert.doesNotMatch(active.textContent, /Wird verarbeitet/u);
});
testAsync('background progress and file changes retain working controls and focus, but a pause transition removes its action', async () => {
  const h = harness({ invoke(command, args, fallback, model) {
    if (command === 'pause_batch') { model.state = { ...model.state, pause_requested: true }; return { ok: true }; }
    return fallback();
  } }); await selectAndStart(h);
  const pause = h.el('job-action-pause'), history = h.el('job-action-history');
  pause.focus();
  for (const [completed_count, current_file] of [[1, 'Synthetic/Two.txt'], [1, 'Synthetic/Three.txt'], [2, 'Synthetic/Three.txt']]) {
    h.model.state = { ...h.model.state, completed_count, current_file }; await h.poll();
    assert.equal(h.el('job-action-pause'), pause); assert.equal(h.el('job-action-history'), history);
    assert.equal(pause.isConnected, true); assert.equal(h.doc.activeElement, pause);
    assert.equal(h.el('job-current').textContent, current_file);
    assert.equal(h.el('job-progress').value, completed_count);
  }
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'pause_batch').length, 0, 'reads never click a command');
  await h.act(pause);
  assert.equal(h.calls.filter(call => call.command === 'pause_batch').length, 1);
  assert.equal(h.el('job-action-pause'), undefined, 'real pause ownership changes remove the command');
  assert.equal(pause.isConnected, false);
  assert.match(h.el('job-description').textContent, /Pause angefordert/u);
  assert.equal(h.doc.activeElement, h.el('job-title'), 'focus is restored only when the action actually retires');
});
testAsync('a real processing phase change and completion still replace working controls', async () => {
  const h = harness(); await selectAndStart(h);
  const pause = h.el('job-action-pause');
  h.model.state = { ...h.model.state, state: 'preparing' }; await h.poll();
  assert.equal(pause.isConnected, false); assert.equal(h.el('job-action-pause'), undefined);
  h.model.state = { ...h.model.state, state: 'processing' }; await h.poll();
  assert.ok(h.el('job-action-pause')?.isConnected);
  h.model.state = { ...h.model.state, state: 'results_available', completed_count: 3, result_count: 3, results_available: true };
  await h.poll();
  assert.equal(h.el('job-action-pause'), undefined); assert.ok(h.el('job-action-results'));
});
testAsync('a large catalogue stays selectable while the actual processing subset is bounded', async () => {
  const h = harness({ catalogue: Array.from({ length: 201 }, (_, n) => ({ name: `Synthetic/${n}.txt`, source_id: id(n + 1), bytes: 4, selectable: true })) });
  await tick(); await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  assert.equal(h.el('selection-limit').hidden, false); assert.match(h.el('selection-limit').textContent, /Häkchenauswahl verkleinern/u);
  assert.equal(h.el('start').attrs['aria-describedby'], 'start-hint selection-limit');
  assert.equal(h.el('selection-summary').textContent, '201 Dateien ausgewählt');
  await h.act('start'); assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  h.el(`source-${id(201)}`).checked = false; await h.act(`source-${id(201)}`, 'change');
  assert.equal(h.el('selection-limit').hidden, true); assert.equal(h.el('start').attrs['aria-disabled'], 'false');
  assert.equal(h.el('start').attrs['aria-describedby'], 'start-hint');
  assert.equal(h.doc.activeElement.id, `source-${id(201)}`, 'checkbox focus survives the new count and warning');
  await h.act('start'); assert.equal(h.calls.find(call => call.command === 'start_admitted_batch').args.sourceIds.length, 200);
  assert.equal(h.calls.find(call => call.command === 'start_admitted_batch').args.sourceIds.includes(id(201)), false);
});
testAsync('the exact 500 MiB subset can start but one extra selected byte cannot', async () => {
  const h = harness({ catalogue: Array.from({ length: 9 }, (_, n) => ({ name: `${n}.docx`, source_id: id(n + 1),
    bytes: n < 7 ? 64 * 1024 * 1024 : n === 7 ? 52 * 1024 * 1024 : 1, selectable: true })) });
  await tick(); await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  assert.equal(h.el('start').attrs['aria-disabled'], 'true'); assert.equal(h.el('selection-limit').hidden, false);
  await h.act('start'); assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  h.el(`source-${id(9)}`).checked = false; await h.act(`source-${id(9)}`, 'change');
  assert.equal(h.el('start').attrs['aria-disabled'], 'false'); assert.equal(h.el('selection-limit').hidden, true);
  await h.act('start'); assert.equal(h.calls.find(call => call.command === 'start_admitted_batch').args.sourceIds.length, 8);
});
testAsync('parent checkboxes include descendants and mixed state survives adding sources', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  const parent = h.el('group-select-0'); parent.checked = false; await h.act(parent, 'change');
  assert.equal(h.el('selection-count').textContent, '1 von 3 ausgewählt');
  assert.equal(h.el('select-all').indeterminate, true);
  await h.act('add-more'); assert.equal(h.el('add-options').hidden, false);
  await h.act('add-folder'); assert.equal(h.el('selection-count').textContent, '1 von 3 ausgewählt');
  h.el('mode-anonymize').checked = true; await h.act('mode-anonymize', 'change'); await h.act('start');
  const start = h.calls.find(call => call.command === 'start_admitted_batch');
  assert.deepEqual(Array.from(start.args.sourceIds), [id(3)]); assert.equal(start.args.catalogueRevision, 2);
  assert.equal(start.args.outputNamingMode, 'neutral'); assert.equal('sourcePaths' in start.args, false);
  assert.deepEqual(JSON.parse(JSON.stringify(start.args.contentOptions)), {
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false
  });
});
function ocrFolder(h, name) {
  const group = h.el('source-tree').children.find(node => descendants(node.children[0],
    child => child.tagName === 'LABEL' && child.children.some(part => part.textContent === name)).length);
  assert.ok(group, `actual folder ${name} is rendered`);
  return group;
}
function ocrFolderBadges(h, name) { return withClass(ocrFolder(h, name).children[0], 'folder-ocr'); }
function ocrCatalogue() {
  return [
    { name: 'Inbox/Top.png', source_id: id(1), selectable: true, bytes: 10, ocr_required: true },
    { name: 'Inbox/Deep/Nested/Scan.bmp', source_id: id(2), selectable: true, bytes: 20, ocr_required: true },
    { name: 'Inbox/Deep/Note.txt', source_id: id(3), selectable: true, bytes: 30, ocr_required: null },
    { name: 'Other/Report.pdf', source_id: id(4), selectable: true, bytes: 40, ocr_required: null },
    { name: 'Other/Unknown.png', source_id: id(5), selectable: true, bytes: 50, ocr_required: 'true' },
    { name: 'Unavailable/Scan.png', selectable: false, ocr_required: true, reason_code: 'SOURCE_FILE_EMPTY' }
  ];
}
testAsync('folder OCR badges count known available descendants once, not unknown PDFs or unavailable images', async () => {
  const h = harness({ catalogue: ocrCatalogue() }); await tick(); await h.act('select-folder');
  assert.equal(h.el('catalogue-ocr-count')?.textContent, '2 Dateien benötigen OCR');
  assert.equal(h.el('catalogue-ocr-count').hidden, false);
  assert.deepEqual(ocrFolderBadges(h, 'Inbox').map(node => node.textContent), ['2 Dateien benötigen OCR']);
  for (const name of ['Deep', 'Nested'])
    assert.deepEqual(ocrFolderBadges(h, name).map(node => node.textContent), ['1 Datei benötigt OCR']);
  for (const name of ['Other', 'Unavailable']) assert.equal(ocrFolderBadges(h, name).length, 0);
  assert.equal(withClass(h.el('source-tree'), 'file-row').filter(row =>
    row.children.some(child => child.textContent === 'OCR')).length, 2, 'existing per-file badges stay unchanged');
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'configure_results'].includes(call.command)), false);
});
testAsync('collapsed folders keep their OCR badge outside hidden content, including a fully collapsed tree', async () => {
  const h = harness({ catalogue: ocrCatalogue() }); await tick(); await h.act('select-folder');
  const deep = ocrFolder(h, 'Deep');
  await h.act(deep.children[0].children.find(node => node.tagName === 'BUTTON'));
  assert.equal(ocrFolder(h, 'Deep').children[1].hidden, true);
  assert.equal(ocrFolderBadges(h, 'Deep')[0].closest('[hidden]'), null);
  assert.equal(ocrFolder(h, 'Nested').hidden, true);
  assert.equal(ocrFolderBadges(h, 'Inbox')[0].textContent, '2 Dateien benötigen OCR');
  await h.act('expand-all'); await h.act('expand-all');
  assert.equal(ocrFolder(h, 'Inbox').children[1].hidden, true);
  assert.equal(ocrFolderBadges(h, 'Inbox')[0].closest('[hidden]'), null);
  assert.equal(h.el('catalogue-ocr-count').hidden, false);
});
for (const purpose of ['mode-markdown', 'mode-anonymize'])
testAsync(`folder OCR badges describe contents independently of selection and OCR consent in ${purpose}`, async () => {
  const h = harness({ catalogue: ocrCatalogue() }); await tick(); await h.act('select-folder');
  h.el(purpose).checked = true; await h.act(purpose, 'change');
  await h.act('choose-none');
  assert.equal(h.el('selection-count').textContent, '0 von 5 ausgewählt');
  assert.doesNotMatch(h.el('selection-summary').textContent, /OCR/u);
  for (const enabled of [false, true, false]) {
    h.el('text-ocr').checked = enabled; await h.act('text-ocr', 'change');
    assert.equal(ocrFolderBadges(h, 'Inbox')[0].textContent, '2 Dateien benötigen OCR');
    assert.equal(h.el('catalogue-ocr-count').textContent, '2 Dateien benötigen OCR');
    assert.equal(h.el('text-ocr').checked, enabled);
  }
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
});
testAsync('top-level file grouping does not count OCR files from sibling folders twice', async () => {
  const h = harness({ catalogue: [
    { name: 'Top.jpg', source_id: id(10), selectable: true, bytes: 5, ocr_required: true }, ...ocrCatalogue()
  ] }); await tick(); await h.act('select-files');
  assert.equal(h.el('catalogue-ocr-count').textContent, '3 Dateien benötigen OCR');
  assert.deepEqual(ocrFolderBadges(h, 'Dateien').map(node => node.textContent), ['1 Datei benötigt OCR']);
  assert.equal(ocrFolderBadges(h, 'Inbox')[0].textContent, '2 Dateien benötigen OCR');
});
testAsync('clearing and replacing admission removes stale folder OCR badges and updates newly added descendants', async () => {
  const options = { catalogue: ocrCatalogue() }, h = harness(options);
  await tick(); await h.act('select-folder');
  options.catalogue = [...options.catalogue,
    { name: 'Inbox/Deep/Extra.jpeg', source_id: id(11), selectable: true, bytes: 5, ocr_required: true }];
  await h.act('add-more'); await h.act('add-folder');
  assert.equal(h.el('catalogue-ocr-count').textContent, '3 Dateien benötigen OCR');
  assert.equal(ocrFolderBadges(h, 'Deep')[0].textContent, '2 Dateien benötigen OCR');
  await h.act('clear-files');
  assert.equal(h.el('catalogue-ocr-count').hidden, true);
  assert.equal(h.el('catalogue-ocr-count').textContent, '');
  assert.equal(h.el('source-tree').children.length, 0);
  options.catalogue = [{ name: 'Plain/Report.pdf', source_id: id(12), selectable: true, bytes: 5, ocr_required: null }];
  await h.act('select-folder');
  assert.equal(h.el('catalogue-ocr-count').hidden, true);
  assert.equal(ocrFolderBadges(h, 'Plain').length, 0);
  options.catalogue = ocrCatalogue(); await h.act('select-folder');
  assert.equal(h.el('catalogue-ocr-count').textContent, '2 Dateien benötigen OCR');
});
testAsync('new processing after completion clears folder OCR counts and computes the next admission afresh', async () => {
  const h = harness({ catalogue: ocrCatalogue() }); await selectAndStart(h);
  assert.equal(h.el('catalogue-ocr-count').hidden, true, 'accepted Start consumes the previous admission');
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-only',
    selected_count: 5, completed_count: 5, result_count: 5, results_available: true };
  await h.poll(); await h.act(h.el('job-actions').children.find(node => node.textContent === 'Neue Verarbeitung'));
  assert.equal(h.el('catalogue-ocr-count').textContent, '');
  await h.act('select-folder');
  assert.equal(h.el('catalogue-ocr-count').textContent, '2 Dateien benötigen OCR');
  assert.equal(ocrFolderBadges(h, 'Inbox')[0].textContent, '2 Dateien benötigen OCR');
  assert.equal(h.el('text-ocr').checked, false, 'a badge does not enable OCR');
});
testAsync('all ancestors of an initially blocked deep file are visible in a large catalogue', async () => {
  const files = Array.from({length: 13}, (_, n) => ({ name: `One/${n}.txt`, source_id: id(n + 1), bytes: 1, selectable: true }));
  files.push({name: 'Two/Inner/Bad.zip', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED'});
  const h = harness({catalogue: files}); await tick(); await h.act('select-folder');
  const inner = h.nodes.find(node => node.dataset.depth === '1' && node.children[0]?.textContent.includes('Inner'));
  assert.ok(inner); assert.equal(inner.hidden, false);
  assert.equal(h.el('group-toggle-1').attrs['aria-expanded'], 'true');
  assert.match(h.el('source-tree').textContent, /Bad.zip.*Dieses Dateiformat wird nicht unterstützt/u);
});
for (const total of [1, 2]) testAsync(`source/run/review headings and Markdown review status use the ${total === 1 ? 'singular' : 'plural'} without changing the handoff`, async () => {
  const files = Array.from({ length: total }, (_, index) => ({ name: `Source-${index + 1}.txt`,
    source_id: id(index + 1), bytes: 10, selectable: true }));
  const h = harness({ catalogue: files }); await tick(); await h.act('select-files');
  const countLabel = `${total} ${total === 1 ? 'Datei' : 'Dateien'}`;
  assert.equal(h.el('catalogue-count').textContent, countLabel);
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change'); await h.act('start');
  assert.equal(h.el('job-count').textContent, countLabel);
  const start = h.calls.filter(call => call.command === 'start_admitted_batch');
  assert.equal(start.length, 1);
  assert.deepEqual(Array.from(start[0].args.sourceIds), files.map(file => file.source_id));
  assert.equal(start[0].args.processingMode, 'markdown-only');
  h.model.state = { ...h.model.state, state: 'review_required', review_count: total };
  h.model.entries = [{ batch_id: A, processing_mode: 'markdown-only', selected_count: total,
    status: 'review_required', resumable: true }];
  await h.poll();
  assert.ok(h.el('job-description').textContent.startsWith(`${countLabel} ${total === 1 ? 'wartet' : 'warten'} auf deine Entscheidung.`));
  await h.act('job-action-review');
  assert.equal(h.el('review-scope').textContent, `${countLabel} · Entscheidungen gelten für diesen Lauf`);
  assert.equal(h.el('review-frame').src, 'review.html?embedded=1');
  assert.equal(h.calls.filter(call => call.command === 'open_embedded_review').length, 1);
  assert.equal(h.calls.some(call => ['submit_review', 'decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('historical continuation adopts the exact run instead of rendering the old job', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.entries = [{ batch_id: B, created_at: '2026-10-07T09:00:00Z', processing_mode: 'markdown-and-anonymize', selected_count: 7, resumable: true, status: 'stopped' }];
  await h.act('nav-history');
  const resume = h.el(`history-${B}-continue`);
  await h.act(resume);
  assert.equal(h.el('job-name').textContent, `Lauf ${B.slice(0, 8)}`);
  assert.equal(h.el('job-count').textContent, '7 Dateien'); assert.equal(h.el('job-files-toggle').hidden, true);
  h.model.state = { state: 'review_required', batch_id: B, review_count: 7 }; await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Jetzt prüfen'));
  assert.equal(h.calls.filter(call => call.command === 'continue_history_batch').at(-1).args.batchId, B);
  selectedRun(h, B); assert.equal(h.doc.activeElement.id, 'review-heading');
  assert.equal(h.el('review-heading').textContent, `Prüfen: Lauf ${B.slice(0, 8)}`);
  assert.equal(h.el('review-scope').textContent, '7 Dateien · Entscheidungen gelten für diesen Lauf');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  assert.equal(h.el('review-view').hidden, true); selectedRun(h, B);
  assert.equal(h.doc.activeElement.id, 'details-heading');
});
testAsync('review opened directly from history returns focus to the same run overview', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 7, resumable: true, status: 'review_required' }];
  await h.act('nav-history');
  const review = h.el(`history-${B}-continue`);
  await h.act(review);
  assert.equal(h.el('review-view').hidden, false);
  selectedRun(h, B);
  assert.equal(h.el('review-heading').textContent, `Prüfen: Lauf ${B.slice(0, 8)}`);
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  selectedRun(h, B);
  assert.equal(h.doc.activeElement.id, 'details-heading');
});
testAsync('the same run retains its known friendly title and selected file list when opened from history', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.entries = [{ batch_id: A, processing_mode: 'markdown-only', selected_count: 3, resumable: true, status: 'review_required' }];
  await h.act('nav-history');
  await h.act(h.el('history-list').children[0].children[1].children.find(node => node.textContent === 'Jetzt prüfen'));
  assert.equal(h.el('review-heading').textContent, 'Prüfen: Dateiauswahl');
  assert.equal(h.el('job-files').children.length, 3);
  assert.equal(h.el('job-files-toggle').hidden, false);
});
testAsync('visible history automatically follows run readiness without replacing unchanged controls', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 7, status: 'processing' }];
  await h.act('nav-history');
  const initial = h.el('history-list').children[0];
  await h.poll(); assert.equal(h.el('history-list').children[0], initial);
  h.model.entries[0] = { ...h.model.entries[0], resumable: true, status: 'review_required' };
  await h.poll();
  assert.ok(h.el('history-list').children[0].children[1].children.some(node => node.textContent === 'Jetzt prüfen'));
  assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
});
testAsync('history loads approval metadata only on demand and distinguishes old exports from current approvals', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') {
      assert.equal(args.batchId, B); assert.equal(Object.keys(args).length, 1);
      return { ok: true, local_ui_only: true, external_disclosure: false, available: true,
        processing_mode: 'markdown-and-anonymize', reviewable_count: 2, approved_count: 0, unavailable_count: 1, unclassified_source_count: 1,
        recorded_export_count: 3, current_exported_count: 0, pending_export_count: 2, pending_incomplete_count: 1, pending_confirmation_count: 1,
        last_recorded_export: { processing_mode: 'markdown-and-anonymize', document_count: 1, recorded_at: '2026-10-07T10:15:00.000Z' } };
    }
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 3, result_count: 3, status: 'results_available' }];
  await h.act('nav-history'); await h.poll();
  assert.equal(h.calls.some(row => row.command === 'get_document_review_history_summary'), false, 'ordinary polling never replays all documents');
  await toggleHistorySummary(h, B);
  const summary = h.el(`history-${B}-summary`);
  assert.match(summary.textContent, /2 gespeicherte Ergebnisstände.*keine zusätzliche Dateiauswahl, Dokumentfreigabe oder Exportbestätigung nötig/u);
  assert.match(summary.textContent, /1 Dokumentprüfstände nicht verfügbar/u);
  assert.match(summary.textContent, /1 Quelldateien mit unklarem früheren Ergebnisstatus/u);
  assert.match(summary.textContent, /vollständige Verarbeitung dieses Laufs ist nicht belegbar/u);
  assert.match(summary.textContent, /3 frühere zusätzliche Kopien mit Beleg/u);
  assert.match(summary.textContent, /1 unvollständige Exportaufträge · 1 fertige Kopien mit offener Empfangsbestätigung/u);
  const reload = h.el(`history-${B}-summary-reload`); reload.focus(); await h.poll();
  assert.equal(h.el(`history-${B}-summary-reload`), reload); assert.equal(h.doc.activeElement, reload);
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 1);
  await h.act('nav-new'); await h.act('nav-history'); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /2 gespeicherte Ergebnisstände/u, 'the expanded summary is reloaded instead of appearing blank');
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 2);
});

testAsync('the completed-copy link loads only its own durable history summary after explicit navigation', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return reviewSummary({ reviewable_count: 2,
      approved_count: 2, recorded_export_count: 1, current_exported_count: 2 });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  h.el('nav-history').dataset.openSummaryBatchId = B;
  await h.act('nav-history'); await tick();
  assert.equal(h.el('nav-history').dataset.openSummaryBatchId, undefined);
  assert.equal(h.el(`history-${B}-summary`).hidden, false);
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 1);
  assert.match(h.el('history-list').textContent, /1 frühere zusätzliche Kopien mit Beleg/u);
  assert.equal(h.doc.activeElement, h.el('history-list').children[0]);
  noAutomaticDecision(h);
});

testAsync('a failed post-copy history read never re-labels a completed copy as absent', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') throw Error('STANDALONE_IPC_TIMEOUT');
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  h.el('nav-history').dataset.openSummaryBatchId = B;
  await h.act('nav-history'); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisstatus nicht verfügbar/u);
  assert.match(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen/u);
  assert.doesNotMatch(h.el('history-list').textContent, /0\/2 freigegeben|noch keine abgeschlossene Kopie belegt/u);
  noAutomaticDecision(h);
});

testAsync('a failed reload removes stale approval and KI-copy claims from the completion card', async () => {
  let reads = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') {
      if (++reads > 1) throw Error('STANDALONE_IPC_TIMEOUT');
      return reviewSummary({ reviewable_count: 2, approved_count: 2,
        recorded_export_count: 1, current_exported_count: 2 });
    }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  assert.match(h.el('history-list').textContent, /1 frühere zusätzliche Kopien mit Beleg/u);
  await h.act(`history-${B}-summary-reload`);
  assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisstatus nicht verfügbar/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /1 frühere zusätzliche Kopien mit Beleg/u);
  assert.match(h.el('history-list').textContent, /Ergebnisdateien bereit/u, 'an optional metadata failure does not undo the original processing completion');
  noAutomaticDecision(h);
});

testAsync('a long approval-summary read suspends background Core polls on Windows and Mac', async () => {
  let resolveSummary;
  const waiting = new Promise(resolve => { resolveSummary = resolve; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? waiting : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const before = h.calls.filter(call => call.command === 'get_public_state').length;
  const historyBefore = h.calls.filter(call => call.command === 'get_run_history').length;
  await h.act('refresh-history');
  assert.equal(h.calls.filter(call => call.command === 'get_run_history').length, historyBefore,
    'a manual list reload must not queue behind a long review summary');
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, before);
  await h.act('connection-retry');
  assert.match(h.el('connection-status').textContent, /Prüfstatus wird gerade lokal abgeglichen/u);
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, before);
  resolveSummary(reviewSummary({ reviewable_count: 2 })); await tick();
  await h.poll();
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > before);
  noAutomaticDecision(h);
});

testAsync('a status poll queued before a history-summary read cannot leave a false timeout after it ends', async () => {
  let rejectStatus, stallNext = false;
  const stalled = new Promise((_, reject) => { rejectStatus = reject; });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state' && stallNext) { stallNext = false; return stalled; }
    if (command === 'get_document_review_history_summary') return reviewSummary({ reviewable_count: 2 });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  stallNext = true;
  const queuedPoll = h.poll(); await tick();
  await toggleHistorySummary(h, B);
  rejectStatus(Error('STANDALONE_IPC_TIMEOUT')); await queuedPoll;
  assert.doesNotMatch(h.el('feedback').textContent, /STANDALONE_IPC_TIMEOUT/u);
  await h.poll();
  assert.match(h.el(`history-${B}-summary`).textContent, /gespeicherte Ergebnisstände/u);
  noAutomaticDecision(h);
});

testAsync('a retired Core summary read cannot block status polling on the replacement connection', async () => {
  let resolveSummary;
  const waiting = new Promise(resolve => { resolveSummary = resolve; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? waiting : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const before = h.calls.filter(call => call.command === 'get_public_state').length;
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  await tick(); await h.poll();
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > before);
  resolveSummary(reviewSummary({ reviewable_count: 2 })); await tick();
  assert.doesNotMatch(h.el('history-list').textContent, /Export mit Abschlussbeleg/u);
  noAutomaticDecision(h);
});

testAsync('plain Markdown history never advertises text approval or saved raw copies as anonymized KI exports', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return { ok: true, local_ui_only: true, external_disclosure: false, available: true,
      processing_mode: 'markdown-only', reviewable_count: 2, approved_count: 1, unavailable_count: 0, unclassified_source_count: 0,
      recorded_export_count: 1, current_exported_count: 1, pending_export_count: 0, pending_incomplete_count: 0, pending_confirmation_count: 0,
      last_recorded_export: { processing_mode: 'markdown-only', document_count: 2, recorded_at: null } };
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', selected_count: 2, result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const text = h.el(`history-${B}-summary`).textContent;
  assert.match(text, /2 gespeicherte Ergebnisstände/u);
  assert.match(text, /1 frühere zusätzliche Kopien mit Beleg/u);
  assert.match(text, /keine zusätzliche Dateiauswahl, Dokumentfreigabe oder Exportbestätigung nötig/u);
  assert.equal(h.el(`history-${B}-summary-toggle`), undefined, 'no duplicate Markdown-copy status action');
  assert.equal(h.el(`history-${B}-summary`).parent, h.el(`history-${B}-disclosure`));
  assert.equal(h.el(`history-${B}-summary-reload`).textContent, 'Ergebnisstatus aktualisieren');
  assert.doesNotMatch(text, /abgeschlossene Exporte|menschlich freigegeben|Neuester datierter/u);
});

function markdownHistoryEntry(batch_id = B, overrides = {}) {
  return { batch_id, processing_mode: 'markdown-only', selected_count: 2, result_count: 2,
    status: 'results_available', results_available: true, result_location: 'available', ...overrides };
}
function markdownCopySummary(overrides = {}) {
  return reviewSummary({ processing_mode: 'markdown-only', approved_count: 0,
    recorded_export_count: 0, current_exported_count: 0, ...overrides });
}
testAsync('Markdown details are the only copy-status disclosure and never read unopened sibling runs', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return markdownCopySummary({ recorded_export_count: 4,
      pending_export_count: 1, pending_confirmation_count: 1 });
    return fallback();
  } }); await tick();
  h.model.entries = [markdownHistoryEntry(), markdownHistoryEntry(A)];
  await h.act('nav-history');
  const disclosure = h.el(`history-${B}-disclosure`), summary = h.el(`history-${B}-summary`);
  const opener = h.el(`history-${B}-results`), editor = h.el(`history-${B}-documents`);
  assert.equal(disclosure.open, false); assert.equal(summary.hidden, true);
  assert.equal(summary.parent, disclosure);
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.equal(h.el(`history-${B}-summary-toggle`), undefined);
  disclosure.open = true; await h.act(disclosure, 'toggle'); await h.act(disclosure, 'toggle');
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args), [{ batchId: B }]);
  assert.match(summary.textContent, /4 frühere zusätzliche Kopien/u);
  assert.match(summary.textContent, /1 fertige Kopien mit offener Empfangsbestätigung/u);
  assert.match(summary.textContent, /nicht neu exportieren/u);
  assert.equal(h.el(`history-${A}-summary`).hidden, true);
  assert.equal(h.el(`history-${B}-results`), opener); assert.equal(opener.className, 'primary');
  assert.equal(h.el(`history-${B}-documents`), editor); assert.equal(editor.textContent, 'Nachkorrektur öffnen (optional)');
  assert.equal(h.doc.activeElement, disclosure);
  noAutomaticDecision(h);
});

for (const failure of [false, true])
testAsync(`closed Markdown details discard a late ${failure ? 'failed' : 'successful'} copy-status read and stay closed through changed polling`, async () => {
  let settle, reads = 0;
  const waiting = new Promise((resolve, reject) => { settle = () => failure ? reject(Error('STANDALONE_IPC_TIMEOUT'))
    : resolve(markdownCopySummary({ recorded_export_count: 77 })); });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return ++reads === 1 ? waiting : markdownCopySummary({ recorded_export_count: 5 });
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()];
  await h.act('nav-history'); await toggleHistorySummary(h, B); await toggleHistorySummary(h, B);
  const summary = h.el(`history-${B}-summary`);
  assert.equal(summary.hidden, true); assert.equal(summary.attrs['aria-busy'], undefined);
  settle(); await tick();
  assert.doesNotMatch(summary.textContent, /77 zusätzliche|nicht verfügbar/u);
  h.model.entries[0] = markdownHistoryEntry(B, { content_notice_count: 1 });
  await h.poll(); await tick();
  assert.equal(h.el(`history-${B}-disclosure`).open, false);
  assert.equal(h.el(`history-${B}-summary`).hidden, true); assert.equal(reads, 1);
  await toggleHistorySummary(h, B);
  assert.equal(reads, 2); assert.match(h.el(`history-${B}-summary`).textContent, /5 frühere zusätzliche Kopien/u);
  assert.equal(h.el(`history-${B}-summary-reload`).textContent, 'Ergebnisstatus aktualisieren');
  noAutomaticDecision(h);
});

for (const failure of [false, true])
testAsync(`rapid Markdown details close/reopen serializes one fresh read after the retired ${failure ? 'failed' : 'successful'} read`, async () => {
  let settleOld, settleNew, reads = 0;
  const old = new Promise((resolve, reject) => { settleOld = () => failure ? reject(Error('STANDALONE_IPC_FAILED'))
    : resolve(markdownCopySummary({ recorded_export_count: 77 })); });
  const fresh = new Promise(resolve => { settleNew = () => resolve(markdownCopySummary({ recorded_export_count: 6 })); });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return ++reads === 1 ? old : fresh;
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()];
  await h.act('nav-history'); await toggleHistorySummary(h, B); await toggleHistorySummary(h, B); await toggleHistorySummary(h, B);
  const summary = h.el(`history-${B}-summary`), reload = h.el(`history-${B}-summary-reload`);
  assert.equal(reads, 1); assert.equal(summary.hidden, false);
  assert.match(summary.textContent, /vorherige Ergebnisstatusabgleich.*Danach/u);
  assert.equal(summary.attrs['aria-busy'], 'true'); assert.equal(reload.disabled, true);
  const statusReads = h.calls.filter(call => call.command === 'get_public_state').length;
  await h.poll(); await h.act(h.el(`history-${B}-disclosure`), 'toggle');
  assert.equal(reads, 1); assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, statusReads);
  settleOld(); await tick();
  assert.equal(reads, 2); assert.equal(reload.disabled, true); assert.equal(summary.attrs['aria-busy'], 'true');
  assert.doesNotMatch(summary.textContent, /77 zusätzliche|nicht verfügbar/u);
  settleNew(); await tick();
  assert.match(summary.textContent, /6 frühere zusätzliche Kopien/u);
  assert.equal(reload.disabled, false); assert.equal(summary.attrs['aria-busy'], undefined);
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').every(call =>
    Object.keys(call.args).length === 1 && call.args.batchId === B), true);
  noAutomaticDecision(h);
});

testAsync('Markdown detail polling retains disclosure and reload focus while refreshed copy receipts stay exact and read-only', async () => {
  let copies = 1;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return markdownCopySummary({ recorded_export_count: copies });
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry(), markdownHistoryEntry(A)];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const reloadId = `history-${B}-summary-reload`, originalReload = h.el(reloadId);
  originalReload.focus(); await h.poll();
  assert.equal(h.el(reloadId), originalReload); assert.equal(h.doc.activeElement, originalReload);
  copies = 3; h.model.entries[0] = markdownHistoryEntry(B, { exported_count: 3 });
  await h.poll(); await tick();
  assert.equal(h.el(`history-${B}-disclosure`).open, true); assert.equal(h.el(`history-${B}-summary`).hidden, false);
  assert.equal(h.doc.activeElement, h.el(reloadId));
  assert.match(h.el(`history-${B}-summary`).textContent, /3 frühere zusätzliche Kopien/u);
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [B, B]);
  await h.act(`history-${B}-details`); await tick();
  h.el(reloadId).focus(); copies = 4;
  h.model.entries[0] = markdownHistoryEntry(B, { exported_count: 4 });
  await h.poll(); await tick();
  assert.equal(h.doc.activeElement, h.el(reloadId), 'a changed selected-run snapshot retains keyboard focus as well');
  assert.match(h.el(`history-${B}-summary`).textContent, /4 frühere zusätzliche Kopien/u);
  const disclosure = h.el(`history-${B}-disclosure`);
  assert.equal(disclosure.open, true);
  disclosure.open = false; await h.act(disclosure, 'toggle');
  const disclosureToggleId = `history-${B}-disclosure-toggle`;
  h.el(disclosureToggleId).focus();
  const before = h.calls.filter(call => call.command === 'get_document_review_history_summary').length;
  h.model.entries[0] = markdownHistoryEntry(B, { exported_count: 5 });
  await h.poll(); await tick();
  assert.equal(h.el(`history-${B}-disclosure`).open, false);
  assert.equal(h.el(`history-${B}-summary`).hidden, true);
  assert.equal(h.doc.activeElement, h.el(disclosureToggleId), 'the collapsed native summary keeps its own keyboard target');
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, before);
  noAutomaticDecision(h);
});

testAsync('closing reopened Markdown details again cancels the deferred fresh read without losing the later reload', async () => {
  let finish, reads = 0;
  const pending = new Promise(resolve => { finish = () => resolve(markdownCopySummary({ recorded_export_count: 77 })); });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return ++reads === 1 ? pending : markdownCopySummary({ recorded_export_count: 8 });
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()]; await h.act('nav-history');
  for (let n = 0; n < 4; n++) await toggleHistorySummary(h, B);
  finish(); await tick();
  assert.equal(reads, 1); assert.equal(h.el(`history-${B}-summary`).hidden, true);
  assert.equal(h.el(`history-${B}-summary`).attrs['aria-busy'], undefined);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /77 zusätzliche/u);
  await toggleHistorySummary(h, B);
  assert.equal(reads, 2); assert.match(h.el(`history-${B}-summary`).textContent, /8 frühere zusätzliche Kopien/u);
  noAutomaticDecision(h);
});

testAsync('a native folder command cannot leave a deferred Markdown copy-status reload permanently locked', async () => {
  let finishSummary, finishFolder, reads = 0;
  const pending = new Promise(resolve => { finishSummary = () => resolve(markdownCopySummary({ recorded_export_count: 77 })); });
  const folder = new Promise(resolve => { finishFolder = () => resolve({ ok: true }); });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return ++reads === 1 ? pending : markdownCopySummary({ recorded_export_count: 9 });
    if (command === 'open_history_results') return folder;
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()]; await h.act('nav-history');
  await toggleHistorySummary(h, B); await toggleHistorySummary(h, B); await toggleHistorySummary(h, B);
  await h.act(`history-${B}-results`); finishSummary(); await tick();
  assert.equal(reads, 1, 'a new summary cannot bypass the current native-command lock');
  assert.match(h.el(`history-${B}-summary`).textContent, /nach einem anderen lokalen Vorgang nicht bestätigt/u);
  assert.equal(h.el(`history-${B}-summary`).attrs['aria-busy'], undefined);
  assert.equal(h.el(`history-${B}-summary-reload`).disabled, true, 'the native command still owns the global lock');
  finishFolder(); await tick();
  assert.equal(h.el(`history-${B}-summary-reload`).disabled, false);
  await h.act(`history-${B}-summary-reload`);
  assert.equal(reads, 2); assert.match(h.el(`history-${B}-summary`).textContent, /9 frühere zusätzliche Kopien/u);
  noAutomaticDecision(h);
});

testAsync('a new Core epoch retires the deferred Markdown read without releasing its successor reload lock', async () => {
  let finishOld, finishNew, reads = 0;
  const old = new Promise(resolve => { finishOld = () => resolve(markdownCopySummary({ recorded_export_count: 77 })); });
  const fresh = new Promise(resolve => { finishNew = () => resolve(markdownCopySummary({ recorded_export_count: 10 })); });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return ++reads === 1 ? old : fresh;
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()]; await h.act('nav-history');
  await toggleHistorySummary(h, B); await toggleHistorySummary(h, B); await toggleHistorySummary(h, B);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready' } }); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisstatus nach Verbindungswechsel nicht bestätigt/u);
  await h.act(`history-${B}-summary-reload`); assert.equal(reads, 2);
  const reload = h.el(`history-${B}-summary-reload`), summary = h.el(`history-${B}-summary`);
  finishOld(); await tick();
  assert.equal(reads, 2); assert.equal(reload.disabled, true); assert.equal(summary.attrs['aria-busy'], 'true');
  assert.doesNotMatch(summary.textContent, /77 zusätzliche/u);
  finishNew(); await tick();
  assert.equal(reload.disabled, false); assert.equal(summary.attrs['aria-busy'], undefined);
  assert.match(summary.textContent, /10 frühere zusätzliche Kopien/u);
  noAutomaticDecision(h);
});

testAsync('Markdown copy-status error discards old receipts and only an explicit reload obtains the current count', async () => {
  let fail = false, copies = 2;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') {
      if (fail) throw Error('DOCUMENT_REVIEW_POLICY_CHANGED');
      return markdownCopySummary({ recorded_export_count: copies });
    }
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  assert.match(h.el(`history-${B}-summary`).textContent, /2 frühere zusätzliche Kopien/u);
  fail = true; await h.act(`history-${B}-summary-reload`);
  assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisstatus nicht verfügbar.*älteren, nicht übernehmbaren Prüfvertrag/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /2 zusätzliche|0 zusätzliche/u);
  const before = h.calls.filter(call => call.command === 'get_document_review_history_summary').length;
  await h.poll(); assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, before);
  fail = false; copies = 7; await h.act(`history-${B}-summary-reload`);
  assert.match(h.el(`history-${B}-summary`).textContent, /7 frühere zusätzliche Kopien/u);
  assert.equal(h.el(`history-${B}-summary-reload`).textContent, 'Ergebnisstatus aktualisieren');
  assert.equal(h.doc.activeElement, h.el(`history-${B}-summary-reload`));
  noAutomaticDecision(h);
});

testAsync('an explicit Markdown completion target opens only its own details, not another expanded copy-status read', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? markdownCopySummary() : fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry(), markdownHistoryEntry(A)];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  h.el('nav-history').dataset.openSummaryBatchId = A; await h.act('nav-history'); await tick();
  assert.equal(h.el(`history-${A}-disclosure`).open, true); assert.equal(h.el(`history-${A}-summary`).hidden, false);
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [B, A]);
  assert.equal(h.doc.activeElement, h.el(`history-${A}-disclosure`).parent.parent);
  noAutomaticDecision(h);
});

testAsync('changed history rows reload an expanded review summary instead of leaving an empty panel', async () => {
  let approved = 0;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return { ok: true, local_ui_only: true, external_disclosure: false,
      available: true, processing_mode: 'markdown-and-anonymize', reviewable_count: 2, approved_count: approved,
      unavailable_count: 0, unclassified_source_count: 0, recorded_export_count: 0, current_exported_count: 0,
      pending_export_count: 0, pending_incomplete_count: 0, pending_confirmation_count: 0, last_recorded_export: null };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    selected_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  assert.match(h.el(`history-${B}-summary`).textContent, /2 gespeicherte Ergebnisstände/u);
  approved = 1; h.model.entries[0] = { ...h.model.entries[0], approved_count: 1 };
  await h.poll(); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /2 gespeicherte Ergebnisstände/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /1 von 2.*freigegeben/u, 'legacy approval does not become a new mandatory action');
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 2);
});

testAsync('history has one next action and keyboard disclosure retains its state across a changed poll', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    results_available: true, ledger_available: true, status: 'stopped', resumable: true }];
  await h.act('nav-history');
  const extra = h.el(`history-${B}-extra`), more = h.el(`history-${B}-more`);
  const main = h.nodes.filter(node => node.isConnected && node.attrs['data-history-main'] === 'true');
  assert.equal(main.length, 1); assert.equal(main[0].textContent, 'Fortsetzen');
  assert.equal(h.el(`history-${B}-summary`).hidden, true, 'metadata is secondary, not an extra primary click');
  assert.equal(h.el(`history-${B}-summary-toggle`), undefined, 'one details disclosure, no duplicate copy/approval action');
  assert.equal(h.el(`history-${B}-summary`).parent, h.el(`history-${B}-disclosure`));
  assert.equal(extra.hidden, true); assert.equal(more.attrs['aria-expanded'], 'false');
  assert.equal(more.attrs['aria-controls'], extra.id);
  assert.ok(extra.children.every(node => node.className !== 'primary'));
  await h.act(more); assert.equal(extra.hidden, false); assert.equal(more.attrs['aria-expanded'], 'true');
  h.model.entries[0].selected_count = 3; await h.poll();
  assert.equal(h.el(extra.id).hidden, false); assert.equal(h.el(more.id).attrs['aria-expanded'], 'true');
  assert.equal(h.doc.activeElement, h.el(more.id));
  assert.equal(h.calls.some(call => ['continue_history_batch', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('secondary status loading never locks the direct document action', async () => {
  let resolve; const delayed = new Promise(yes => { resolve = yes; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? delayed : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); const main = h.el(`history-${B}-documents`);
  await toggleHistorySummary(h, B);
  assert.equal(main.disabled, false); assert.equal(h.el(`history-${B}-summary-reload`).disabled, true);
  resolve(reviewSummary()); await tick();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el(`history-${B}-summary-reload`).hidden, false);
});

testAsync('collapsing an in-flight approval summary keeps the direct action and discards the late response', async () => {
  let resolve; const delayed = new Promise(yes => { resolve = yes; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? delayed : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); const main = h.el(`history-${B}-documents`);
  await toggleHistorySummary(h, B); await toggleHistorySummary(h, B);
  assert.equal(main.disabled, false); assert.equal(h.el(`history-${B}-summary`).hidden, true);
  resolve(reviewSummary()); await tick(); await h.poll();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Nachbearbeitung öffnen (optional)');
});

testAsync('finishing a native folder action cannot restore a superseded summary loading lock', async () => {
  let resolveSummary, resolveFolder;
  const summary = new Promise(yes => { resolveSummary = yes; }), folder = new Promise(yes => { resolveFolder = yes; });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return summary;
    if (command === 'open_history_results') return folder;
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    results_available: true, status: 'results_available' }];
  await h.act('nav-history'); const main = h.el(`history-${B}-documents`);
  await toggleHistorySummary(h, B); await h.act(`history-${B}-results`);
  resolveSummary(reviewSummary()); await tick(); assert.equal(main.disabled, true, 'native command remains in flight');
  resolveFolder({ ok: true }); await tick();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el(`history-${B}-summary-reload`).hidden, false);
  assert.match(h.el(`history-${B}-summary`).textContent, /anderer lokaler Vorgang/u);
});

function reviewSummary(overrides = {}) {
  return { ok: true, local_ui_only: true, external_disclosure: false, available: true,
    processing_mode: 'markdown-and-anonymize', reviewable_count: 2, approved_count: 2,
    unavailable_count: 0, unclassified_source_count: 0, recorded_export_count: 3, current_exported_count: 1,
    pending_export_count: 0, pending_incomplete_count: 0, pending_confirmation_count: 0,
    last_recorded_export: null, ...overrides };
}

function documentResponse(mode = 'markdown-and-anonymize', length = 72) {
  return { local_ui_only: true, external_disclosure: false, processing_mode: mode,
    documents: Array.from({ length }, (_, index) => ({ document_id: id(index + 1), name: `Synthetic-${index + 1}.md`,
      revision: 0, output_sha256: 'c'.repeat(64), approved: false, processing_mode: mode, chunks: 1 })) };
}
function noAutomaticDecision(h) {
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents',
    'abandon_document_export', 'start_admitted_batch'].includes(call.command)), false);
}

testAsync('R6 New always exposes setup while the same selected run has a separate read-only details tab', async () => {
  const h = harness(); await selectAndStart(h);
  selectedRun(h, A); assert.equal(h.el('job').hidden, false);
  const before = h.calls.length;
  await h.act('nav-new');
  assert.equal(h.el('new-view').hidden, false); assert.equal(h.el('setup').hidden, false);
  assert.equal(h.el('job').hidden, true); assert.equal(h.el('details-view').hidden, true);
  await h.act('nav-details'); selectedRun(h, A);
  assert.equal(h.el('job').hidden, false);
  assert.equal(h.calls.slice(before).some(call => ['start_admitted_batch', 'continue_history_batch',
    'continue_current_batch', 'continue_review_session', 'cancel_admission'].includes(call.command)), false);
});

testAsync('R6 New can explicitly start a successor after confirmed terminal completion without resetting the previous run', async () => {
  const h=harness();await selectAndStart(h);
  h.model.state={...h.model.state,state:'results_available',batch_complete:true,results_available:true};await h.poll();
  await h.act('nav-new');await h.act('select-folder');
  assert.equal(h.el('start').attrs['aria-disabled'],'false');
  await h.act('start');
  assert.equal(h.calls.filter(call=>call.command==='start_admitted_batch').length,2);
  assert.equal(h.calls.filter(call=>call.command==='cancel_admission').length,0,'predecessor need not be cleared to start valid admitted sources');
});

testAsync('R6 New explains an active predecessor rather than advertising a start it will silently ignore', async () => {
  const h=harness();await selectAndStart(h);await h.act('nav-new');await h.act('select-folder');
  assert.equal(h.el('start').attrs['aria-disabled'],'true');
  assert.match(h.el('start-hint').textContent,/Lauf.*noch nicht abgeschlossen/u);
  await h.act('start');assert.equal(h.calls.filter(call=>call.command==='start_admitted_batch').length,1);
});

for(const leaveEarly of [false,true])testAsync(`R6 historical details delayed by a summary ${leaveEarly?'do not replace a later destination':'load without a second click'}`,async()=>{
  let finishSummary;
  const h=harness({invoke(command,args,fallback){
    if(command==='get_document_review_history_summary')return new Promise(resolve=>{finishSummary=resolve});
    return fallback();
  }});await tick();
  h.model.entries=[{batch_id:A,processing_mode:'markdown-and-anonymize',status:'results_available',result_count:1,selected_count:1}];
  await h.act('nav-history');await toggleHistorySummary(h,A);await h.act(`history-${A}-details`);
  selectedRun(h,A);assert.match(h.el('run-history-detail').textContent,/geladen|abgeglichen/u);
  if(leaveEarly)await h.act('nav-settings');
  finishSummary({ok:true,local_ui_only:true,external_disclosure:false,available:false});await tick();await h.poll();
  if(leaveEarly){assert.equal(h.el('settings-view').hidden,false);assert.equal(h.el('details-view').hidden,true)}
  else {selectedRun(h,A);assert.equal(h.el(`history-${A}-details`),undefined,'the detail card does not point to a duplicate detail view');
    assert.ok(h.el(`history-${A}-disclosure`),'same run card loaded after old read retires')}
  assert.equal(h.calls.some(call=>['continue_history_batch','start_admitted_batch','export_approved_documents','decide_document_review'].includes(call.command)),false);
});

testAsync('R6 a historical overview and collapsed details never continue, approve or copy that run', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return reviewSummary();
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'stopped',
    resumable: true, selected_count: 2, result_count: 1, failed_count: 0 }];
  await h.act('nav-history');
  assert.equal(h.el('run-guide').hidden, true, 'the list has no global guide for an implicit run');
  const before = h.calls.length;
  await h.act(`history-${B}-details`); selectedRun(h, B);
  assert.equal(h.el('history-view').hidden, true); assert.equal(h.el('job').hidden, true);
  const disclosure = h.el(`history-${B}-disclosure`);
  assert.equal(disclosure.open, true); disclosure.open = false;
  await h.act(disclosure, 'toggle'); await h.poll();
  assert.equal(h.calls.slice(before).some(call => ['continue_history_batch', 'continue_current_batch',
    'continue_review_session', 'open_embedded_review', 'decide_document_review',
    'decide_document_review_batch', 'preview_document_export', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('R6 rapid documents A to History to Settings shares one delayed native close and keeps the last destination', async () => {
  let finishClose;
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') { assert.equal(args.batchId, A); return documentResponse('markdown-only', 1); }
    if (command === 'close_document_reviews') return new Promise(resolve => { finishClose = resolve; });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: A, processing_mode: 'markdown-only', status: 'results_available', result_count: 1 }];
  await h.act('nav-history'); await h.act(`history-${A}-more`); await h.act(`history-${A}-documents`);
  selectedRun(h, A); assert.equal(h.window.__DATASECURE_DOCUMENTS__.activeBatchId(), A);
  await h.act('nav-history');
  assert.equal(h.window.__DATASECURE_DOCUMENTS__.activeBatchId(), null, 'the actual renderer clears ownership before native close settles');
  await h.act('nav-settings');
  assert.equal(h.calls.filter(call => call.command === 'close_document_reviews').length, 1);
  finishClose({ ok: true }); await tick(); await tick();
  assert.equal(h.el('settings-view').hidden, false); assert.equal(h.el('documents-view').hidden, true);
  assert.equal(h.el('nav-settings').attrs['aria-selected'], 'true');
  assert.equal(h.el('nav-history').attrs['aria-controls'], 'history-view');
  assert.equal(h.el('details-run-id').textContent, `Lauf-ID: ${A}`);
  noAutomaticDecision(h);
});

for (const refusal of ['dirty', 'busy']) testAsync(`R6 ${refusal} document navigation refuses without changing run identity or private context`, async () => {
  let finishReload, hold = false;
  const response = documentResponse('markdown-only', 1);
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return hold ? new Promise(resolve => { finishReload = resolve; }) : response;
    if (command === 'get_document_review_chunk') return { ...response.documents[0], chunk_index: 0,
      original_text: 'Synthetic private source', markdown: 'Synthetic private draft', local_ui_only: true, external_disclosure: false };
    return fallback();
  } }); await tick();
  h.model.entries = [A, B].map(batch_id => ({ batch_id, processing_mode: 'markdown-only', status: 'results_available', result_count: 1 }));
  await h.act('nav-history'); await h.act(`history-${A}-more`); await h.act(`history-${A}-documents`);
  if (refusal === 'dirty') {
    await h.act(descendants(h.el('documents-list'), node => node.tagName === 'BUTTON')[0]);
    h.el('document-markdown').value = 'Unsaved draft bound to A'; await h.act('document-markdown', 'input');
  } else { hold = true; await h.act('documents-reload'); }
  const before = h.calls.length, title = h.el('documents-run').textContent, draft = h.el('document-markdown').value;
  await h.act('nav-history'); await h.act('nav-settings'); await h.act('nav-new');
  selectedRun(h, A); assert.equal(h.el('documents-view').hidden, false);
  assert.equal(h.window.__DATASECURE_DOCUMENTS__.activeBatchId(), A);
  assert.equal(h.el('documents-run').textContent, title); assert.equal(h.el('document-markdown').value, draft);
  assert.equal(h.calls.slice(before).some(call => call.command === 'close_document_reviews'), false);
  assertNoExportOrRestart(h);
  if (finishReload) { finishReload(response); await tick(); }
});

for (const wrongAck of [false, true]) testAsync(`R6 completed copy ${wrongAck ? 'rejects a foreign operation ACK' : 'returns after its exact durable ACK'} without replay`, async () => {
  let acknowledge;
  const response = documentResponse('markdown-and-anonymize', 1);
  response.documents[0].approved = true;
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return response;
    if (command === 'close_document_reviews') return { ok: true };
    if (command === 'preview_document_export') return { ok: true, processing_mode: 'markdown-and-anonymize',
      files: [{ name: 'Dokument_01.md', sha256: args.selection[0].output_sha256 }], local_ui_only: true, external_disclosure: false };
    if (command === 'export_approved_documents') {
      assert.equal(args.batchId, A);
      const receipt = { ok: true, operation_id: args.operationId, exported_count: 1,
        folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false };
      if (args.acknowledge) return new Promise(resolve => { acknowledge = () => resolve({ ...receipt,
        ...(wrongAck ? { operation_id: 'e'.repeat(32) } : {}) }); });
      return receipt;
    }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: A, processing_mode: 'markdown-and-anonymize', status: 'results_available', result_count: 1 }];
  await h.act('nav-history'); await h.act(`history-${A}-documents`);
  h.el('documents-all').checked = true; await h.act('documents-all', 'change');
  await h.act('documents-export'); await h.act('document-export-confirm');
  assert.equal(h.el('document-export-close').disabled, true); selectedRun(h, A);
  assert.equal(h.el('documents-view').hidden, false); assert.equal(h.el('details-receipt').hidden, true);
  acknowledge(); await tick(); await tick();
  const exports = h.calls.filter(call => call.command === 'export_approved_documents');
  assert.equal(exports.length, 2); assert.equal(exports[1].args.acknowledge, true);
  assert.equal(exports[0].args.operationId, exports[1].args.operationId);
  assert.deepEqual(exports[0].args.selection, exports[1].args.selection);
  if (wrongAck) {
    assert.notEqual(h.el('document-export-title').textContent, 'Export abgeschlossen');
    await h.act('document-export-close'); assert.equal(h.el('documents-view').hidden, false);
    assert.equal(h.el('details-receipt').hidden, true);
  } else {
    assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
    await h.act('document-export-close'); await tick(); selectedRun(h, A);
    assert.equal(h.el('documents-view').hidden, false, 'closing the success dialog retains the last completed step');
    assert.equal(h.el('documents-completion').hidden, false);
    assert.equal(h.el('details-overview-panel').hidden, true, 'receipt belongs to the separate hidden overview');
    await h.act('documents-completion-details'); await tick(); selectedRun(h, A);
    assert.equal(h.el('documents-view').hidden, true); assert.equal(h.el('details-receipt').hidden, false);
    assert.match(h.el('details-receipt-text').textContent, new RegExp(exports[0].args.operationId, 'u'));
    await h.act('nav-history'); await h.act('nav-details');
  }
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2);
  assert.equal(h.calls.some(call => ['decide_document_review', 'continue_history_batch', 'start_admitted_batch'].includes(call.command)), false);
});

testAsync('one history click opens the actual document renderer with 72 unapproved results, not a metadata summary', async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') { assert.equal(args.batchId, B); return documentResponse(); }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 72, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  assert.equal(h.el('documents-view').hidden, false); assert.equal(h.el('history-view').hidden, true);
  selectedRun(h, B);
  assert.equal(h.el('documents-list').children.length, 72);
  assert.equal(h.el('documents-selected').textContent, '72 angezeigt · 72 Ergebnisdateien verfügbar');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.equal(h.el('documents-approve').disabled, true); assert.equal(h.el('documents-export').disabled, true);
  noAutomaticDecision(h);
});

testAsync('historical document guide uses the selected batch proof, not the latest run status', async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return { ...documentResponse('markdown-and-anonymize', 2),
      // This case isolates batch ownership. Missing historical content proof
      // correctly produces a warning and is tested separately below.
      processing_complete: true, content_notice_count: 0,
      content_notice_breakdown_complete: true, content_notices: [] };
    return fallback();
  } }); await tick();
  h.model.state = { state: 'processing', batch_id: A, processing_mode: 'markdown-and-anonymize',
    selected_count: 1, completed_count: 0, batch_complete: false };
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    selected_count: 2, failed_count: 0, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  assert.equal(h.el('run-guide').hidden, false);
  assert.doesNotMatch(h.el('run-guide-next').textContent, /Laufabschluss ist noch nicht bestätigt/u);
  assert.equal(h.el('run-guide-stages').children[0].dataset.status, 'done');
  assert.equal(h.el('run-guide-scope').textContent.includes(B.slice(0, 8)), true);
});

testAsync('document copy suspends background status polling and resumes it after the copy', async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return documentResponse();
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 72, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  h.window.__DATASECURE_RUN_GUIDE__.documents({ batch_id: B, processing_mode: 'markdown-and-anonymize',
    source: 'documents', fresh: true, busy: true, document_count: 72 });
  const before = h.calls.filter(call => call.command === 'get_public_state').length;
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, before,
    'a long document copy must not start a competing status request');
  h.window.__DATASECURE_RUN_GUIDE__.documents({ batch_id: B, processing_mode: 'markdown-and-anonymize',
    source: 'documents', fresh: true, busy: false, document_count: 72 });
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, before + 1);
});

testAsync('a status read queued before a document copy cannot leave a false timeout banner', async () => {
  let failNext = false, rejectStatus;
  const stalled = new Promise((_, reject) => { rejectStatus = reject; });
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return documentResponse();
    if (command === 'get_public_state' && failNext) { failNext = false; return stalled; }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 72, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  failNext = true;
  const pending = h.poll(); await tick();
  h.window.__DATASECURE_RUN_GUIDE__.documents({ batch_id: B, processing_mode: 'markdown-and-anonymize',
    source: 'documents', fresh: true, busy: true, document_count: 72 });
  rejectStatus(Error('STANDALONE_IPC_TIMEOUT')); await pending;
  assert.doesNotMatch(h.el('feedback').textContent, /STANDALONE_IPC_TIMEOUT/u);
  h.window.__DATASECURE_RUN_GUIDE__.documents({ batch_id: B, processing_mode: 'markdown-and-anonymize',
    source: 'documents', fresh: true, busy: false, document_count: 72 });
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length >= 3, true);
});

for (const mode of ['markdown-and-anonymize']) testAsync(`owned final review returns to same-run details and ready results without opening a second document selection`, async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: false, run_complete: true };
    if (command === 'get_document_reviews') { assert.equal(args.batchId, B); return documentResponse(mode); }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: mode, selected_count: 72, resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  h.model.state = { state: 'results_available', batch_id: B, processing_mode: mode, selected_count: 72,
    completed_count: 72, result_count: 72, failed_count: 0, results_available: true, batch_complete: true };
  h.model.entries = [{ ...h.model.state, status: 'results_available', result_location: 'available' }];
  // Native event can arrive before the close command's response.
  const closing = h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await closing;
  assert.equal(h.el('review-frame').src, 'about:blank'); assert.equal(h.el('review-view').hidden, true);
  assert.equal(h.el('documents-view').hidden, true); assert.equal(h.el('details-view').hidden, false);
  assert.equal(h.doc.activeElement.id, 'details-heading'); selectedRun(h, B);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
  assert.match(h.el('feedback').textContent, /Fundstellenprüfung abgeschlossen.*Ergebnisdateien/u);
  assert.equal(h.el('job-action-results').className, 'primary'); noAutomaticDecision(h);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  assert.equal(h.el('details-view').hidden, false, 'duplicate close cannot leave the completed run overview');
});

for (const purpose of ['markdown-only', 'markdown-and-anonymize']) testAsync(`${purpose}: unrequested closure and a completion flag on a ready session cannot navigate or imply final completion`, async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: true, run_complete: true };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: purpose, resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  assert.equal(h.el('review-view').hidden, false);
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  selectedRun(h, B); assert.equal(h.el('documents-view').hidden, true);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
});

testAsync('failed closure cannot advance and missing document component gives a reason rather than silently doing nothing', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'close_review_window') throw Error('STANDALONE_REVIEW_WINDOW_FAILED');
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('close_review_window'), /WINDOW_FAILED/u);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  assert.equal(h.el('review-view').hidden, false);
  const absent = harness(); await tick();
  absent.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 72, status: 'results_available' }];
  await absent.act('nav-history'); await absent.act(`history-${B}-documents`);
  selectedRun(absent, B);
  assert.match(absent.el('feedback').textContent, /gespeicherten Entscheidungen bleiben erhalten.*STANDALONE_DOCUMENT_VIEW_UNAVAILABLE/u);
  noAutomaticDecision(absent);
});

testAsync('an old native close generation cannot close a successor even while its own close is pending', async () => {
  let resolveClose, delayClose = false;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'close_review_window' && delayClose) return new Promise(resolve => { resolveClose = resolve; });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 1 } });
  await h.act(`history-${B}-continue`); delayClose = true;
  const closing = h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 1 } });
  assert.equal(h.el('review-view').hidden, false);
  resolveClose({ ok: true }); await closing;
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 2 } });
  selectedRun(h, B);
});

testAsync('late completion from a retired connection cannot mark a newly opened review complete', async () => {
  let resolveSession;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_review_session') return new Promise(resolve => { resolveSession = resolve; });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  const old = h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  const rejected = assert.rejects(old, /SURFACE_INVALID/u);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } }); await h.poll();
  await h.act(`history-${B}-continue`);
  resolveSession({ ready: false, run_complete: true }); await rejected;
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 2 } });
  selectedRun(h, B);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
});

testAsync('manual closure freezes the known phase; a late status reply cannot turn leaving into final review navigation', async () => {
  let resolveSession;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_review_session') return new Promise(resolve => { resolveSession = resolve; });
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  const pending = h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  const rejected = assert.rejects(pending, /SURFACE_INVALID/u);
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  resolveSession({ ready: false, run_complete: true }); await rejected;
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 1 } });
  selectedRun(h, B); assert.equal(h.el('documents-view').hidden, true);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
});
testAsync('fresh approval summary improves the next action without changing an active, resumable or failed run', async () => {
  for (const [state, label] of [
    [{ status: 'processing' }, null],
    [{ status: 'review_required', resumable: true }, 'Jetzt prüfen'],
    [{ status: 'stopped', resumable: true, failed_count: 1 }, 'Fortsetzen'],
    [{ status: 'export_pending' }, 'Bereitstellung erneut prüfen'],
    [{ status: 'results_available', failed_count: 1 }, 'Nachbearbeitung öffnen (optional)']
  ]) {
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
    }}); await tick();
    h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, ...state }];
    await h.act('nav-history'); await toggleHistorySummary(h, B);
    const main = h.nodes.find(node => node.isConnected && node.attrs['data-history-main'] === 'true');
    assert.equal(main?.textContent || null, label);
    if (label === 'Bereitstellung erneut prüfen') {
      await h.act(main); assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
    }
    if (label === 'Nachbearbeitung öffnen (optional)') {
      assert.equal(h.el(`history-${B}-problems`).hidden, false, 'file failures remain a visible parallel action');
      assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
    }
  }
});

testAsync('incomplete anonymization export needs explicit consent and never becomes a completed result', async () => {
  const h = harness({ invoke(command, args, fallback, model) {
    if (command === 'abandon_result_export') {
      model.entries[0] = { ...model.entries[0], status: 'export_abandoned' };
      return { ok: true, abandoned: true, exported: 1, pending: 2, available: false };
    }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 3,
    result_count: 3, exported_count: 1, export_pending_count: 2, status: 'export_pending' }];
  await h.act('nav-history');
  await h.act(`history-${B}-more`);
  await h.act(`history-${B}-abandon-export`);
  assert.equal(h.el('result-abandon-dialog').open, true);
  assert.match(h.el('result-abandon-counts').textContent, new RegExp(`Lauf ${B.slice(0, 8)}.*3 technisch erstellte Ergebnisse.*1 Ergebnisse wurden sichtbar kopiert.*2 fehlen noch`, 'u'));
  assert.equal(h.el('result-abandon-accept').disabled, true);
  await h.act('result-abandon-accept');
  assert.equal(h.calls.some(call => call.command === 'abandon_result_export'), false);
  h.el('result-abandon-check').checked = true; await h.act('result-abandon-check', 'change');
  assert.equal(h.el('result-abandon-accept').disabled, false);
  await h.act('result-abandon-accept');
  assert.equal(h.calls.filter(call => call.command === 'abandon_result_export').length, 1);
  assert.equal(h.el('result-abandon-dialog').open, false);
  await h.poll();
  assert.ok(h.el('history-list').textContent.includes('Bereitstellung aufgegeben'));
  assert.equal(h.el(`history-${B}-abandon-export`), undefined);
  assert.equal(h.el(`history-${B}-documents`), undefined);
});

testAsync('current abandoned export does not offer a result folder or document approval', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.state = { ...h.model.state, state: 'export_abandoned', processing_mode: 'markdown-and-anonymize',
    result_count: 2, completed_count: 2, results_available: true, exported_count: 1,
    export_pending_count: 1, failed_count: 0 };
  await h.poll();
  assert.equal(h.el('job-actions').children.some(node => ['job-action-results', 'job-action-documents'].includes(node.id)), false);
  assert.equal(h.el('job-secondary-actions').children.some(node => ['job-action-results', 'job-action-documents', 'job-action-abandon-export'].includes(node.id)), false);
  assert.match(h.el('job-description').textContent, /keine vollständige Ergebnisfreigabe/u);
});

testAsync('completed anonymization with bound OCR-off omissions leads to document review, not a technical error list', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary'
      ? reviewSummary({ reviewable_count: 115, approved_count: 0, not_processed_count: 18 }) : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 133,
    result_count: 115, failed_count: 18, expected_ocr_omission_count: 18, status: 'results_available',
    results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  const row = h.el('history-list').children[0];
  assert.match(row.textContent, /18 ohne OCR nicht umgewandelt · 0 technische Fehler/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.nodes.some(node => node.isConnected && node.id === `history-${B}-problems-main`), false);
  await toggleHistorySummary(h, B);
  assert.match(row.textContent, /Verarbeitung abgeschlossen · Ergebnisdateien bereit/u);
  assert.match(row.textContent, /18 ohne OCR nicht umgewandelt/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});
testAsync('anonymization history separates a privacy stop from OCR omissions and technical failures', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false,
      files: [{ name: 'scan.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' },
        { name: 'long.txt', reason_code: 'AMBIGUITY_REVIEW_REQUIRED', classification: 'privacy_stop' }] };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 133,
    result_count: 115, failed_count: 18, expected_ocr_omission_count: 17, privacy_stop_count: 1,
    status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent,
    /17 ohne OCR nicht umgewandelt · 1 aus Datenschutzgründen angehalten · 0 technische Fehler/u);
  assert.equal(h.el(`history-${B}-problems-main`), undefined);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el(`history-${B}-problems`).textContent, '18 Ausnahmen ansehen');
  assert.match(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen – mit Hinweisen/u);
  const marks = withClass(h.el('history-list'), 'history-completion-marks')[0];
  assert.ok(marks.textContent.includes('✓!'), 'completion and warning have distinct visible marks');
  assert.equal(h.el('history-list').children[0].dataset.outcome, 'partial');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  await h.act(`history-${B}-problems`);
  assert.match(h.el(`history-${B}-files`).textContent, /1 Datei ohne OCR nicht umgewandelt/u);
  assert.ok(h.el(`history-${B}-files`).children.some(node => node.className === 'notice-card' && /scan.png/u.test(node.textContent)));
  assert.ok(h.el(`history-${B}-files`).children.some(node => node.className === 'problem-card' && /Datenschutz-Prüfstopp/u.test(node.textContent)));
});

testAsync('privacy stop stays visible without hiding completed processing and 132 saved approvals', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary'
      ? reviewSummary({ reviewable_count: 132, approved_count: 132, not_processed_count: 1,
        recorded_export_count: 0, current_exported_count: 0, last_recorded_export: null }) : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 133,
    result_count: 132, failed_count: 1, privacy_stop_count: 1, status: 'results_available',
    results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent, /Verarbeitung abgeschlossen/u);
  await toggleHistorySummary(h, B);
  assert.match(h.el('history-list').textContent,
    /Verarbeitung abgeschlossen · Ergebnisdateien bereit/u);
  assert.equal(h.el(`history-${B}-problems-main`), undefined);
  assert.equal(h.el(`history-${B}-problems`).textContent, '1 Ausnahme ansehen');
  assert.match(h.el(`history-${B}-summary`).textContent, /132 gespeicherte Ergebnisstände/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /Export: noch kein abgeschlossener Export/u);
});

testAsync('successful OCR anonymization exposes content hints directly without reopening or failing the run', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, files: [],
      content_notice_count: 1, content_notice_breakdown_complete: true,
      content_notices: [{ name: 'scan.png', reason_codes: ['OCR_NOT_VERIFIED'] }] };
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available',
    content_notice_count: 1, content_notice_breakdown_complete: true }];
  await h.act('nav-history');
  const row = h.el('history-list').children[0];
  assert.match(row.textContent, /Anonymisierungslauf abgeschlossen – mit Hinweisen/u);
  assert.match(row.textContent, /1 erstellte Datei enthält Inhaltshinweise/u);
  assert.equal(row.dataset.outcome, 'partial');
  assert.equal(h.el(`history-${B}-problems`).textContent, 'Hinweise ansehen');
  assert.equal(h.el(`history-${B}-problems`).parent.className, 'history-actions');
  await h.act(`history-${B}-problems`);
  assert.match(h.el(`history-${B}-files`).textContent, /Automatisch erkannter Text kann Lesefehler enthalten/u);
  assert.doesNotMatch(row.textContent, /Verarbeitung noch nicht abgeschlossen/u);
  noAutomaticDecision(h);
});

testAsync('retained anonymization history cannot present missing content evidence as zero hints', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, files: [],
      content_notice_count: 0, content_notice_breakdown_complete: false, content_notices: [] };
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent, /Inhaltshinweise.*nicht vollständig verfügbar/u);
  await h.act(`history-${B}-problems`);
  assert.match(h.el(`history-${B}-files`).textContent, /keine Bestätigung fehlerfreier Texterkennung/u);
  h.model.entries[0] = { ...h.model.entries[0], content_notice_count: 0, content_notice_breakdown_complete: true };
  await h.act('refresh-history');
  assert.match(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen/u);
  assert.doesNotMatch(h.el('history-list').textContent, /abgeschlossen – mit Hinweisen/u);
  noAutomaticDecision(h);
});

testAsync('current completed anonymization announces OCR hints and keeps their details available', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, files: [],
      content_notice_count: 1, content_notice_breakdown_complete: true,
      content_notices: [{ name: 'scan.png', reason_codes: ['OCR_NOT_VERIFIED'] }] };
    return fallback();
  }}); await tick();
  await h.act('select-folder'); h.el('mode-anonymize').checked = true;
  await h.act('mode-anonymize', 'change'); await h.act('start');
  h.model.state = { ...h.model.state, state: 'results_available', processing_mode: 'markdown-and-anonymize',
    selected_count: 3, completed_count: 3, result_count: 3, failed_count: 0, results_available: true,
    warning_count: 1, content_notice_count: 1, content_notice_breakdown_complete: true };
  await h.poll(); await tick();
  assert.equal(h.el('job-title').textContent, 'Anonymisierungslauf abgeschlossen mit Hinweisen');
  assert.equal(h.el('job-icon').textContent, '✓ !');
  assert.equal(h.el('file-problems').hidden, false);
  assert.match(h.el('job-announcement').textContent, /1 erstellte Datei enthält Inhaltshinweise/u);
  assert.match(h.el('problem-list').textContent, /Automatisch erkannter Text kann Lesefehler enthalten/u);
  assert.equal(h.calls.some(call => call.command === 'continue_current_batch'), false);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.calls.some(call => ['decide_document_review', 'decide_document_review_batch', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('a single technical file failure does not turn a usable anonymization run into a failed run', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 133,
    result_count: 114, failed_count: 19, expected_ocr_omission_count: 17, privacy_stop_count: 1,
    status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  const row = h.el('history-list').children[0];
  assert.equal(row.dataset.outcome, 'partial');
  assert.match(row.textContent, /Anonymisierungslauf abgeschlossen – mit Dateifehlern/u);
  assert.match(row.textContent, /1 Datei hat einen technischen Fehler/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el(`history-${B}-problems`).textContent, 'Betroffene Dateien');
});

testAsync('an explicit live zero-reason breakdown distinguishes a real file error from expired reasons', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 1, failed_count: 1, failure_reason_breakdown_complete: true,
    status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen – mit Dateifehlern/u);
  assert.match(h.el('history-list').textContent, /1 Datei hat einen technischen Fehler/u);
});

testAsync('retained history without source-journal reasons never invents technical file failures', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 133,
    result_count: 115, failed_count: 18, status: 'results_available',
    results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  const row = h.el('history-list').children[0];
  assert.equal(row.dataset.outcome, 'partial');
  assert.match(row.textContent, /Anonymisierungslauf abgeschlossen – mit ungeklärten Ausnahmen/u);
  assert.match(row.textContent, /18 Dateien wurden nicht verarbeitet; die Gründe sind im kompakten Verlauf nicht mehr klassifiziert/u);
  assert.doesNotMatch(row.textContent, /18 technische Fehler|mit Dateifehlern/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el(`history-${B}-problems`).textContent, 'Betroffene Dateien');
  h.model.entries[0] = { ...h.model.entries[0], expected_ocr_omission_count: 0 };
  await h.act('refresh-history');
  assert.doesNotMatch(h.el('history-list').textContent, /18 technische Fehler|mit Dateifehlern/u);
  noAutomaticDecision(h);
});

testAsync('unbound or inconsistent history counts cannot manufacture a completed-run badge', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 3,
    result_count: 2, failed_count: 0, status: 'results_available', results_available: true, result_location: 'available' }];
  await h.act('nav-history');
  assert.doesNotMatch(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen/u);
  h.model.entries[0] = { ...h.model.entries[0], failed_count: 1, result_location: 'unsafe' };
  await h.act('refresh-history');
  assert.doesNotMatch(h.el('history-list').textContent, /Anonymisierungslauf abgeschlossen/u);
});

testAsync('a total processing failure is red, while an OCR-off all-omitted run is a finished warning', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 1,
    result_count: 0, failed_count: 1, status: 'failed', resumable: false }];
  await h.act('nav-history');
  assert.equal(h.el('history-list').children[0].dataset.outcome, 'error');
  assert.match(h.el('history-list').textContent, /Der Lauf wurde nicht abgeschlossen/u);
  h.model.entries[0] = { ...h.model.entries[0], status: 'completed_without_results',
    expected_ocr_omission_count: 1 };
  await h.act('refresh-history');
  assert.equal(h.el('history-list').children[0].dataset.outcome, 'partial');
  assert.match(h.el('history-list').textContent, /Verarbeitung ist beendet, aber keine Datei wurde umgewandelt/u);
  assert.match(h.el('history-list').textContent, /Verarbeitung beendet – keine Ergebnisse erstellt/u);
  assert.match(h.el('history-list').textContent, /Es gibt keine freizugebenden oder exportierbaren Ergebnisse/u);
  h.model.entries[0] = { ...h.model.entries[0], failed_count: 0 };
  await h.act('refresh-history');
  assert.doesNotMatch(h.el('history-list').textContent, /Verarbeitung beendet – keine Ergebnisse erstellt/u,
    'inconsistent retained counts cannot assert a finished empty run');
});

testAsync('legacy approval and additional-copy debt never replace the normal result-folder action', async () => {
  for (const [summary, location, label, primary] of [
    [reviewSummary(), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ current_exported_count: 2 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ approved_count: 1 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ pending_export_count: 1, pending_confirmation_count: 1 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ unavailable_count: 1 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ unclassified_source_count: 1 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ not_processed_count: 1 }), 'available', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary(), 'unsafe', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary(), 'unknown', 'Nachbearbeitung öffnen (optional)', false],
    [reviewSummary({ reviewable_count: 0, approved_count: 0, current_exported_count: 0 }), 'available', 'Nachbearbeitung öffnen (optional)', false]
  ]) {
    const opened = [];
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? summary : fallback();
    }});
    h.window.__DATASECURE_DOCUMENTS__ = { canOpen() { return true; }, async open(...args) { opened.push(args); } };
    await tick(); h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
      result_location: location, status: 'results_available' }];
    await h.act('nav-history');
    const main = h.el(`history-${B}-documents`); await toggleHistorySummary(h, B);
    assert.equal(main.textContent, label); assert.equal(main.className === 'primary', primary);
    if (summary.pending_export_count)
      assert.match(h.el(`history-${B}-summary`).textContent, /offener Empfangsbestätigung/u);
    await h.act(main); assert.deepEqual(opened, [[B, { exportPreview: false }]]);
    assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'continue_history_batch'].includes(call.command)), false);
  }
});

testAsync('a deleted result folder blocks only file opening, not independent private document review', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    failed_count: 1, status: 'results_available', result_location: 'missing', results_available: false }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  assert.equal(h.el(`history-${B}-documents`).attrs['data-history-main'], 'true');
  assert.match(h.el(`history-${B}-state`).textContent, /Ergebnisordner fehlt/u);
  assert.equal(h.el(`history-${B}-results`), undefined);
  assert.equal(h.calls.some(call => call.command.startsWith('open_')), false);
});

testAsync('expected OCR omissions cannot hide a confirmed copy or make optional review the primary action', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ current_exported_count: 2,
      not_processed_count: 1 }) : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 3,
    completed_count: 3, result_count: 2, failed_count: 1, expected_ocr_omission_count: 1,
    privacy_stop_count: 0, results_available: true, result_location: 'available', status: 'results_available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const label = h.el(`history-${B}-state`).textContent;
  assert.match(label, /Verarbeitung abgeschlossen · Ergebnisdateien bereit/u);
  assert.match(h.el('history-list').textContent, /1 ohne OCR nicht umgewandelt/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.notEqual(h.el(`history-${B}-documents`).className, 'primary');
});

for (const failure of [false, true]) testAsync(`late ${failure ? 'failed' : 'successful'} approval summary is discarded after navigation`, async () => {
  let resolve, reject;
  const delayed = new Promise((yes, no) => { resolve = yes; reject = no; });
  let reads = 0;
  const h = harness({ invoke(command, args, fallback) { return command === 'get_document_review_history_summary'
    ? ++reads === 1 ? delayed : new Promise(() => {}) : fallback(); }});
  await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  await h.act('nav-new'); await h.act('nav-history');
  if (failure) reject(Error('STANDALONE_IPC_FAILED'));
  else resolve({ ok: true, available: false, local_ui_only: true, external_disclosure: false });
  await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisstatus nach Ansichtswechsel nicht bestätigt/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /älteren Lauf|nicht verfügbar|abgeschlossene Kopie/u);
});

testAsync('unavailable history summary shows a reason and offers reload without zero counts or mutations', async () => {
  let fail = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') { if (fail) throw Error('DOCUMENT_REVIEW_POLICY_CHANGED');
      return { ok: true, available: false, local_ui_only: true, external_disclosure: false }; }
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  assert.match(h.el(`history-${B}-summary`).textContent, /älteren, nicht übernehmbaren Prüfvertrag/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /0 von|0 abgeschlossene/u);
  assert.equal(h.el(`history-${B}-summary-reload`).disabled, false);
  fail = false; await h.act(`history-${B}-summary-reload`);
  assert.match(h.el(`history-${B}-summary`).textContent, /keine nachträgliche Textkorrektur verfügbar/u);
  assert.equal(h.calls.some(row => ['decide_document_review', 'export_approved_documents', 'continue_history_batch'].includes(row.command)), false);
});

testAsync('automatic history updates preserve expanded file problems and stable keyboard focus', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', selected_count: 7, failed_count: 1, result_count: 2, status: 'processing' }];
  await h.act('nav-history');
  const buttonId = `history-${B}-problems`, filesId = `history-${B}-files`;
  await h.act(buttonId);
  assert.equal(h.el(filesId).hidden, false); assert.equal(h.el(buttonId).attrs['aria-expanded'], 'true');
  h.model.entries[0] = { ...h.model.entries[0], result_count: 3 };
  await h.poll();
  assert.equal(h.el(filesId).hidden, false); assert.equal(h.el(buttonId).attrs['aria-expanded'], 'true');
  assert.equal(h.doc.activeElement, h.el(buttonId));
  await h.act(buttonId); assert.equal(h.el(filesId).hidden, true);
});
testAsync('job progress preserves keyboard focus and completion returns removed actions to the stable heading', async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-details');
  h.el('job-action-pause').focus();
  h.model.state = { ...h.model.state, completed_count: 1, current_file: 'One/A.txt' }; await h.poll();
  assert.equal(h.doc.activeElement, h.el('job-action-pause')); assert.equal(h.doc.activeElement.isConnected, true);
  h.model.state = { ...h.model.state, state: 'results_available', result_count: 3, results_available: true }; await h.poll();
  assert.equal(h.doc.activeElement, h.el('job-title')); assert.equal(h.doc.activeElement.isConnected, true);
});

testAsync('background job updates never steal focus from navigation or another panel', async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-settings');
  h.el('diagnostics').focus();
  h.model.state = { ...h.model.state, completed_count: 1 }; await h.poll();
  assert.equal(h.doc.activeElement, h.el('diagnostics'));
  await h.act('nav-new'); h.el('nav-new').focus();
  h.model.state = { ...h.model.state, completed_count: 2 }; await h.poll();
  assert.equal(h.doc.activeElement, h.el('nav-new'));
});

testAsync('polite job announcements report phase changes and new errors without announcing every file counter', async () => {
  const h = harness(); await selectAndStart(h);
  const region = h.el('job-announcement');
  assert.equal(region.attrs.role, 'status'); assert.equal(region.attrs['aria-live'], 'polite');
  assert.match(region.textContent, /wird verarbeitet/iu); const processing = region.textUpdates;
  h.model.state = { ...h.model.state, completed_count: 1 }; await h.poll();
  assert.equal(region.textUpdates, processing);
  h.model.state = { ...h.model.state, failed_count: 1 }; await h.poll();
  assert.match(region.textContent, /Dateien mit Hinweisen/u); const problem = region.textUpdates;
  h.model.state = { ...h.model.state, failed_count: 2 }; await h.poll(); assert.equal(region.textUpdates, problem);
  h.model.state = { ...h.model.state, state: 'results_available', result_count: 1, results_available: true }; await h.poll();
  assert.match(region.textContent, /Textübernahme abgeschlossen/u); assert.match(region.textContent, /2 Dateien mit Problemen/u);
  const terminal = region.textUpdates; await h.poll(); assert.equal(region.textUpdates, terminal);
});

testAsync('a mismatched run snapshot never offers review or opens another run result', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.state = { state: 'review_required', batch_id: B, review_count: 2 }; await h.poll();
  assert.equal(h.el('job-actions').textContent, 'Verlauf öffnen');
  assert.match(h.el('job-title').textContent, /abgeglichen/u);
  assert.equal(h.calls.some(call => call.command === 'open_embedded_review'), false);
});
testAsync('prepared sources are not replaced by continuing an unrelated historical run', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 7, resumable: true, status: 'review_required' }];
  await h.act('nav-history');
  const resume = h.el('history-list').children[0].children[1].children.find(node => node.textContent === 'Jetzt prüfen');
  await h.act(resume);
  assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
  assert.equal(h.calls.some(call => call.command === 'open_embedded_review'), false);
  assert.equal(h.el('selection-count').textContent, '3 von 3 ausgewählt');
  assert.match(h.el('feedback').textContent, /Dateiauswahl zuerst leeren/u);
});
for (const failure of [false, true]) testAsync(`late ${failure ? 'failed' : 'successful'} file details cannot populate a later preparation`, async () => {
  let resolve, reject;
  const delayed = new Promise((yes, no) => { resolve = yes; reject = no; });
  const h = harness({invoke(command, args, fallback) { return command === 'get_run_failures' ? delayed : fallback(); }});
  await selectAndStart(h);
  h.model.state = { state: 'results_available', batch_id: A, failed_count: 1 };
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_run_failures').length, 1);
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Neue Verarbeitung'));
  const before = h.el('problem-list').textContent;
  if (failure) reject(Error('STANDALONE_IPC_FAILED'));
  else resolve({local_ui_only: true, external_disclosure: false, files: [{name: 'Previous.docx', reason_code: 'SOURCE_READ_FAILED'}]});
  await tick();
  assert.equal(h.el('problem-list').textContent, before);
  assert.equal(h.el('file-problems').hidden, true);
});
testAsync('an uncertain Start is not retried and the UI directs to actual run history', async () => {
  const h = harness({invoke(command, args, fallback) { if (command === 'start_admitted_batch') throw Error('STANDALONE_START_FAILED'); return fallback(); }});
  await selectAndStart(h); await h.act('start');
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.el('history-view').hidden, false); assert.match(h.el('feedback').textContent, /nicht nochmals gestartet/u);
});
testAsync('a live run after reconnect adopts only the server-bound identity and metadata', async () => {
  const h = harness({invoke(command, args, fallback, model) {
    if (command === 'get_public_state') model.state = { state: 'processing', batch_id: B, processing_mode: 'markdown-only', selected_count: 8 };
    return fallback();
  }}); await tick();
  assert.equal(h.el('job-name').textContent, `Lauf ${B.slice(0, 8)}`); assert.equal(h.el('job-count').textContent, '8 Dateien');
  assert.equal(h.el('job-files').children.length, 0);
});
testAsync('the embedded command facade is closed and available only during an explicitly opened review', async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-details');
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('get_review_session'), /SURFACE_INVALID/u);
  h.model.state = { state: 'review_required', batch_id: A, review_count: 3 }; await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Jetzt prüfen'));
  const before = h.calls.length;
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('select_files'), /SURFACE_INVALID/u);
  assert.equal(h.calls.length, before, 'no generic parent IPC escape');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window').catch(() => {});
  assert.equal(h.calls.at(-1).command, 'close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  assert.equal(h.doc.activeElement.id, 'details-heading', 'status refresh cannot remove the focus return target');
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('submit_review', {}), /SURFACE_INVALID/u);
});
testAsync('connection recovery clears stale source IDs and reloads display only without replaying Start', async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  h.model.entries = [{ batch_id: B, status: 'results_available', processing_mode: 'markdown-and-anonymize',
    selected_count: 1, completed_count: 1, result_count: 1, results_available: true }];
  await h.act('nav-history');
  assert.equal(h.el('history-list').children.length, 1);
  h.window.__DATASECURE_DOCUMENTS__ = { invalidateConnection() {} };
  const prior = h.calls.filter(call => call.command === 'start_admitted_batch').length;
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  await tick();
  assert.equal(h.el('connection-help').hidden, false);
  assert.match(h.el('connection-status').textContent, /sicher abgeglichen/u);
  assert.equal(h.calls.at(-1).command, 'get_native_recovery_status');
  assert.equal(h.el('history-list').children.length, 0, 'stale run actions are removed while disconnected');
  assert.match(h.el('history-status').textContent, /nicht bestätigt/u);
  await h.act('connection-diagnostics');
  assert.equal(h.calls.at(-1).command, 'open_diagnostic_folder',
    'native diagnostics must remain available without a sidecar connection');
  assert.equal(h.el('catalogue').hidden, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  await h.act('start');
  h.model.catalogue = [];
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'ready'}});
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, prior);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
});

testAsync('diagnostic bundle saves and cancels independently while Core is disconnected and preserves the recovery banner', async () => {
  let result = { ok: true, saved: true, cancelled: false, partial: true, local_ui_only: true, external_disclosure: false };
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'save_diagnostic_bundle') { assert.equal(args, undefined); return result; }
    return fallback();
  } });
  await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  await tick();
  const banner = h.el('connection-status').textContent;
  const mutations = h.calls.filter(call => ['start_admitted_batch', 'continue_current_batch', 'export_approved_documents'].includes(call.command)).length;
  await h.act('connection-diagnostic-save');
  assert.equal(h.calls.at(-1).command, 'save_diagnostic_bundle');
  assert.match(h.el('connection-diagnostic-save-status').textContent, /lokal gespeichert.*gekennzeichnet/u);
  assert.equal(h.el('connection-help').hidden, false);
  assert.equal(h.el('connection-status').textContent, banner);
  result = { ok: true, saved: false, cancelled: true, local_ui_only: true, external_disclosure: false };
  await h.act('diagnostic-save');
  assert.match(h.el('diagnostic-save-status').textContent, /Abgebrochen/u);
  assert.equal(h.el('connection-help').hidden, false);
  assert.equal(h.calls.filter(call => ['start_admitted_batch', 'continue_current_batch', 'export_approved_documents'].includes(call.command)).length, mutations);
});

testAsync('diagnostic save remains available during an owned long operation without releasing global busy ownership', async () => {
  let release;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'select_folder') return new Promise(resolve => { release = () => resolve(fallback()); });
    if (command === 'save_diagnostic_bundle') return { ok: true, saved: true, cancelled: false, partial: false, external_disclosure: false };
    return fallback();
  } });
  await tick(); await h.act('select-folder');
  assert.equal(h.el('configure-results').disabled, true);
  assert.equal(h.el('diagnostic-save').disabled, false);
  assert.equal(h.el('document-export-diagnostic-save').disabled, false);
  await h.act('document-export-diagnostic-save');
  assert.match(h.el('diagnostic-save-status').textContent, /lokal gespeichert/u);
  assert.match(h.el('document-export-diagnostic-status').textContent, /lokal gespeichert/u);
  assert.equal(h.el('configure-results').disabled, true, 'diagnostics cannot release another operation\'s busy token');
  release(); await tick();
  assert.equal(h.el('configure-results').disabled, false);
});

testAsync('diagnostic save failure is not a connection failure and never exposes vendor text or claims success', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'save_diagnostic_bundle') throw Error('PRIVATE/person/source.pdf');
    return fallback();
  } });
  await tick(); await h.act('diagnostic-save');
  const message = h.el('diagnostic-save-status').textContent;
  assert.match(message, /konnte nicht bestätigt werden/u);
  assert.doesNotMatch(message, /PRIVATE|source\.pdf/u);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.el('diagnostic-save').disabled, false);
});
testAsync('picker clicks during recovery explain the block and record a content-free native event', async () => {
  const h = harness(); await tick();
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  await tick();
  const before = h.calls.filter(call => call.command === 'select_folder' || call.command === 'configure_results').length;
  await h.act('select-folder');
  await h.act('configure-results');
  assert.equal(h.calls.filter(call => call.command === 'select_folder' || call.command === 'configure_results').length, before);
  assert.equal(h.calls.filter(call => call.command === 'report_blocked_picker').length, 2);
  assert.deepEqual(h.calls.filter(call => call.command === 'report_blocked_picker').map(call => [call.args.action, call.args.reason]),
    [['select_folder', 'reconnecting'], ['configure_results', 'reconnecting']]);
  assert.equal(h.el('connection-help').hidden, false);
  assert.match(h.el('connection-status').textContent, /Dateiauswahl und Ergebnisordner/u);
});
testAsync('an unavailable native diagnostic sink is visible in recovery guidance', async () => {
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_native_recovery_status') return {phase: 'blocked', diagnostic_log: 'unavailable', local_ui_only: true, external_disclosure: false};
    return fallback();
  }});
  await tick();
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  await tick();
  assert.match(h.el('connection-status').textContent, /Diagnoseprotokoll konnte nicht geschrieben/u);
});
testAsync('connection retry only reloads status and shows a blocked native phase without claiming completion', async () => {
  let blocked = false;
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_public_state' && blocked) throw Error('STANDALONE_CONNECTION_RECOVERY_BLOCKED');
    if (command === 'get_native_recovery_status') return {phase: blocked ? 'blocked' : 'idle', local_ui_only: true, external_disclosure: false};
    return fallback();
  }});
  await tick(); blocked = true;
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  await tick();
  assert.match(h.el('connection-status').textContent, /nicht bestätigt werden/u);
  const starts = h.calls.filter(call => call.command === 'start_admitted_batch').length;
  await h.act('connection-retry');
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, starts);
  assert.equal(h.el('connection-help').hidden, false);
  assert.match(h.el('connection-status').textContent, /nicht bestätigt werden/u);
  blocked = false; await h.act('connection-retry');
  assert.equal(h.el('connection-help').hidden, true);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, starts);
});
testAsync('successful status retry replaces a stale IPC timeout without replaying an uncertain export', async () => {
  let timedOut = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state' && timedOut) throw Error('STANDALONE_IPC_TIMEOUT');
    return fallback();
  } });
  await tick(); await tick();
  assert.match(h.el('feedback').textContent, /STANDALONE_IPC_TIMEOUT/u);
  assert.equal(h.el('connection-help').hidden, false);
  timedOut = false;
  await h.act('connection-retry'); await tick();
  assert.doesNotMatch(h.el('feedback').textContent, /STANDALONE_IPC_TIMEOUT/u);
  assert.match(h.el('feedback').textContent, /Laufstatus sind wieder erreichbar.*nicht erneut ausgeführt/u);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents' || call.command === 'start_admitted_batch'), false);
});
testAsync('status success does not erase an unrelated review error', async () => {
  let invalid = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_public_state' && invalid) throw Error('DOCUMENT_REVIEW_INVALID');
    return fallback();
  } });
  await tick(); await tick();
  assert.match(h.el('feedback').textContent, /DOCUMENT_REVIEW_INVALID/u);
  invalid = false;
  await h.act('connection-retry'); await tick();
  assert.match(h.el('feedback').textContent, /DOCUMENT_REVIEW_INVALID/u);
});
testAsync('a lost connection closes the empty document surface and returns to unconfirmed history', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, status: 'results_available' }];
  let invalidated = 0;
  h.window.__DATASECURE_DOCUMENTS__ = { canOpen() { return true; }, async open() {}, invalidateConnection() { invalidated++; } };
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  assert.equal(h.el('documents-view').hidden, false);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  assert.equal(invalidated, 1);
  assert.equal(h.el('documents-view').hidden, true);
  assert.equal(h.el('history-view').hidden, false);
  assert.match(h.el('history-status').textContent, /nicht bestätigt/u);
});
testAsync('failed replacement startup keeps recovery and diagnostic controls visible', async () => {
  let failed = false;
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_public_state' && failed) throw Error('STANDALONE_RUNTIME_MISSING');
    return fallback();
  }});
  await tick(); failed = true;
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  await tick(); await h.act('connection-retry');
  assert.equal(h.el('connection-help').hidden, false);
  assert.match(h.el('feedback').textContent, /STANDALONE_RUNTIME_MISSING/u);
  assert.equal(h.el('connection-retry').disabled, false);
  await h.act('connection-diagnostics');
  assert.equal(h.calls.at(-1).command, 'open_diagnostic_folder');
});
testAsync('retry during an ongoing status read explains that no second run starts', async () => {
  let hold = false; let release;
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_public_state' && hold) return new Promise(resolve => { release = () => resolve(fallback()); });
    return fallback();
  }});
  await tick(); hold = true;
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  const pending = h.poll(); await tick();
  assert.equal(typeof release, 'function');
  await h.act('connection-retry');
  assert.match(h.el('connection-status').textContent, /bereits geprüft/u);
  assert.equal(h.calls.some(call => call.command === 'start_admitted_batch'), false);
  release(); await pending;
});
testAsync('a failed history refresh removes stale clickable run actions until a fresh read succeeds', async () => {
  let unavailable = false;
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_run_history' && unavailable) throw Error('STANDALONE_CONNECTION_RECOVERY_BLOCKED');
    return fallback();
  }});
  await tick();
  h.model.entries = [{ batch_id: B, status: 'results_available', processing_mode: 'markdown-and-anonymize',
    selected_count: 1, completed_count: 1, result_count: 1, results_available: true }];
  await h.act('nav-history');
  assert.equal(h.el('history-list').children.length, 1);
  unavailable = true; await h.act('refresh-history');
  assert.equal(h.el('history-list').children.length, 0);
  assert.match(h.el('history-status').textContent, /Diagnose öffnen/u);
  unavailable = false; await h.act('refresh-history');
  assert.equal(h.el('history-list').children.length, 1, 'fresh authoritative history restores actions');
});
testAsync('connection loss hides old active-run controls instead of offering unusable Pause or Review actions', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.state = { state: 'processing', batch_id: A, processing_mode: 'markdown-only',
    selected_count: 3, completed_count: 1 };
  await h.poll();
  assert.ok(h.el('job-actions').children.length > 0);
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  assert.equal(h.el('job-actions').children.length, 0);
  assert.equal(h.el('job-secondary-actions').children.length, 0);
  assert.match(h.el('job-title').textContent, /Verbindungsausfall/u);
  assert.match(h.el('job-description').textContent, /nicht bestätigt/u);
});
testAsync('an old history response cannot replace the history after a connection epoch changes', async () => {
  let finish, delay = false;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args, fallback) { return delay && command === 'get_run_history' ? pending : fallback(); }});
  await tick(); delay = true; await h.act('nav-history');
  h.listeners.get('datasecure-connection')({payload: {epoch: 2, state: 'recovering'}});
  finish({local_ui_only: true, external_disclosure: false, entries: [{batch_id: B, status: 'completed', selected_count: 2, result_count: 2}]});
  await tick();
  assert.equal(h.el('history-list').textContent.includes(B.slice(0, 8)), false);
});
testAsync('a late picker response cannot restore a catalogue after connection invalidation', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args, fallback) { return command === 'select_folder' ? pending : fallback(); }});
  await tick(); await h.act('select-folder');
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  finish({ok: true, catalogue_revision: 1, catalogue: [{source_id: 'c'.repeat(32), name: 'Old.txt', selectable: true, bytes: 10}]});
  await tick();
  assert.equal(h.el('catalogue').hidden, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  assert.doesNotMatch(h.el('feedback').textContent, /Dateien aufgenommen/u);
});

testAsync('interrupted native drop releases its busy ownership and stale completion cannot unlock a new picker', async () => {
  let finish, delayed = false;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args, fallback) { return delayed && command === 'select_folder' ? pending : fallback(); }});
  await tick();
  const drop = h.listeners.get('datasecure-native-drop');
  drop({payload: {phase: 'checking', epoch: 0}});
  assert.equal(h.el('select-folder').disabled, true);
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  drop({payload: {phase: 'failed', epoch: 0, error_code: 'STANDALONE_CONNECTION_CHANGED'}});
  h.listeners.get('datasecure-connection')({payload: {epoch: 2, state: 'ready'}});
  await h.poll();
  assert.equal(h.el('select-folder').disabled, false);
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > 1);
  delayed = true; await h.act('select-folder');
  drop({payload: {phase: 'failed', epoch: 0, error_code: 'STANDALONE_IPC_FAILED'}});
  assert.equal(h.el('select-folder').disabled, true, 'old drop completion cannot release the new picker');
  finish({cancelled: true}); await tick();
  assert.equal(h.el('select-folder').disabled, false);
});

testAsync('an old picker finally cannot unlock a successor after connection recovery', async () => {
  const completions = [];
  const h = harness({invoke(command, args, fallback) {
    return command === 'select_folder' ? new Promise(resolve => completions.push(resolve)) : fallback();
  }});
  await tick(); await h.act('select-folder');
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  h.listeners.get('datasecure-connection')({payload: {epoch: 2, state: 'ready'}});
  await h.poll(); await h.act('select-folder');
  completions[0]({cancelled: true}); await tick();
  assert.equal(h.el('select-folder').disabled, true);
  assert.equal(h.el('admission-status').hidden, false);
  completions[1]({cancelled: true}); await tick();
  assert.equal(h.el('select-folder').disabled, false);
  assert.equal(h.el('admission-status').hidden, true);
});

testAsync('initial Core bootstrap keeps pickers closed until context is confirmed', async () => {
  let finish, initial = true;
  const delayed = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; return delayed; }
    return fallback();
  }});
  await tick();
  h.listeners.get('datasecure-connection')({payload: {epoch: 0, state: 'ready'}});
  await h.act('select-folder');
  assert.equal(h.calls.filter(call => call.command === 'select_folder').length, 0);
  assert.match(h.el('connection-status').textContent, /Dateiauswahl und Ergebnisordner/u);
  finish({local_ui_only: true, external_disclosure: false, source_catalogue: [], catalogue_revision: 0});
  await tick(); await tick();
  await h.act('select-folder');
  assert.equal(h.el('selection-count').textContent, '3 von 3 ausgewählt');
  assert.equal(h.el('catalogue').hidden, false);
});

for (const purpose of ['markdown-only', 'markdown-and-anonymize']) testAsync(`one next primary action after technical completion for ${purpose}`, async () => {
  const h = harness(); await tick(); await h.act('select-folder');
  const radio = purpose === 'markdown-only' ? 'mode-markdown' : 'mode-anonymize';
  h.el(radio).checked = true; await h.act(radio, 'change'); await h.act('start');
  h.model.state = { ...h.model.state, state: 'results_available', processing_mode: purpose,
    result_count: 3, completed_count: 3, results_available: true, failed_count: 0 };
  await h.poll();
  const primary = h.el('job-actions').children.filter(node => node.className === 'primary');
  assert.equal(primary.length, 1);
  assert.equal(primary[0].id, 'job-action-results');
  assert.match(h.el('job-title').textContent, purpose === 'markdown-only' ? /Textübernahme abgeschlossen/u : /Anonymisierungslauf abgeschlossen/u);
});

for (const purpose of ['markdown-only', 'markdown-and-anonymize']) {
  for (const phase of ['review_required', 'paused', 'stopped', 'export_pending']) testAsync(`partial ${purpose} ${phase} keeps preceding main action first`, async () => {
    const h = harness(); await tick(); await h.act('select-folder');
    const radio = purpose === 'markdown-only' ? 'mode-markdown' : 'mode-anonymize';
    h.el(radio).checked = true; await h.act(radio, 'change'); await h.act('start');
    h.model.state = { ...h.model.state, state: phase, processing_mode: purpose, result_count: 1, completed_count: 1,
      results_available: true, failed_count: 0, review_count: phase === 'review_required' ? 2 : 0 };
    await h.poll();
    const primary = h.el('job-actions').children.filter(node => node.className === 'primary');
    assert.ok(primary.length <= 1);
    assert.ok(!primary.some(node => node.id === 'job-action-documents'));
  });
}
// Actual workspace bridge + shared projector. Native DTOs are explicit RAM
// models; no child process, OCR, file publication or native acceptance is claimed.
async function openDeferredGuideFixture(purpose, invoke) {
  const h = harness({ invoke }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: purpose, selected_count: 1, resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act('history-' + B + '-continue');
  return h;
}
function assertNoReviewAutorun(h, before) {
  assert.equal(h.calls.slice(before).some(call => ['start_admitted_batch', 'continue_history_batch',
    'continue_current_batch', 'continue_review_session', 'decide_document_review', 'export_approved_documents'].includes(call.command)), false);
}
for (const purpose of ['markdown-and-anonymize', 'markdown-only'])
testAsync(purpose + ': accepted native defer immediately retires the waiting guide and polling cannot resurrect it', async () => {
  let session = { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 };
  const h = await openDeferredGuideFixture(purpose, (command, args, fallback) => {
    if (command === 'get_review_session') return session;
    if (command === 'submit_review') return { accepted: true, action: 'deferred' };
    if (command === 'continue_review_session') return { ok: true, event: 'batch_continued' };
    return fallback();
  });
  const bridge = h.window.__DATASECURE_REVIEW__;
  await bridge.invoke('get_review_session');
  const before = h.calls.length;
  await bridge.invoke('submit_review', { reviewId: 'a'.repeat(32), answer: { action: 'deferred' } });
  assert.match(h.el('run-guide-title').textContent, /vertagt/u);
  assert.match(h.el('run-guide-next').textContent, /im Verlauf ausdrücklich fortsetzen/u);
  assert.doesNotMatch(h.el('run-guide-next').textContent, /arbeitet weiter|bitte warten/iu);
  await h.poll();
  assert.match(h.el('run-guide-title').textContent, /vertagt/u);
  assert.equal(h.el('review-view').hidden, false);
  assert.equal(h.el('run-guide-stages').children.slice(2).some(stage => stage.dataset.status === 'done'), false);
  assertNoReviewAutorun(h, before);
  session = { ready: false, phase: 'deferred', worker_active: false, run_complete: false, continuation_available: false };
  await bridge.invoke('get_review_session');
  assert.match(h.el('run-guide-title').textContent, /vertagt/u);
  session = { ready: false, phase: 'retry_available', worker_active: false, run_complete: false, continuation_available: true };
  await bridge.invoke('get_review_session');
  assert.match(h.el('run-guide-title').textContent, /sind bereit/u);
  assertNoReviewAutorun(h, before);
  await bridge.invoke('continue_review_session');
  assert.match(h.el('run-guide-title').textContent, /werden vorbereitet/u);
  assert.equal(h.calls.slice(before).filter(call => call.command === 'continue_review_session').length, 1);
});
for (const purpose of ['markdown-and-anonymize', 'markdown-only'])
testAsync(purpose + ': native deferred snapshot is understood without a click or manufactured approval', async () => {
  const h = await openDeferredGuideFixture(purpose, (command, args, fallback) => command === 'get_review_session'
    ? { ready: false, phase: 'deferred', worker_active: false, run_complete: false } : fallback());
  const before = h.calls.length; await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  assert.match(h.el('run-guide-title').textContent, /vertagt/u); assertNoReviewAutorun(h, before);
});
for (const result of [null, { accepted: false, action: 'deferred' }, { accepted: true }, { accepted: true, action: 'reviewed' }])
testAsync('defer guide requires the exact native accepted/action DTO: ' + JSON.stringify(result), async () => {
  const h = await openDeferredGuideFixture('markdown-and-anonymize', (command, args, fallback) => command === 'submit_review' ? result : fallback());
  const before = h.calls.length;
  await h.window.__DATASECURE_REVIEW__.invoke('submit_review', { reviewId: 'a'.repeat(32), answer: { action: 'deferred' } });
  assert.doesNotMatch(h.el('run-guide-title').textContent, /vertagt/u);
  assertNoReviewAutorun(h, before);
});
for (const late of ['preparing', 'ready', 'complete', 'error'])
testAsync('accepted defer cannot be overwritten by an older native session ' + late, async () => {
  let settle, reject;
  const pending = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
  const h = await openDeferredGuideFixture('markdown-and-anonymize', (command, args, fallback) => {
    if (command === 'get_review_session') return pending;
    if (command === 'submit_review') return { accepted: true, action: 'deferred' };
    return fallback();
  });
  const bridge = h.window.__DATASECURE_REVIEW__, read = bridge.invoke('get_review_session');
  const observed = late === 'error' ? assert.rejects(read, /OLD_READ_FAILED/u) : read;
  await bridge.invoke('submit_review', { reviewId: 'a'.repeat(32), answer: { action: 'deferred' } });
  if (late === 'error') reject(Error('OLD_READ_FAILED'));
  else settle(late === 'complete' ? { ready: false, run_complete: true } : { ready: late === 'ready', phase: late });
  await observed;
  assert.match(h.el('run-guide-title').textContent, /vertagt/u);
  await bridge.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({ payload: { closed: true, review_generation: 1 } });
  selectedRun(h, B);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false, 'old complete cannot open a mandatory result review');
});
testAsync('late accepted defer from a retired native connection cannot relabel a successor review', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await openDeferredGuideFixture('markdown-and-anonymize', (command, args, fallback) => {
    if (command === 'submit_review') return pending;
    if (command === 'get_review_session') return { ready: true, review_id: 'b'.repeat(32), chunk_count: 1 };
    return fallback();
  });
  const old = h.window.__DATASECURE_REVIEW__.invoke('submit_review', { reviewId: 'a'.repeat(32), answer: { action: 'deferred' } });
  const refused = assert.rejects(old, /SURFACE_INVALID/u);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } }); await h.poll();
  await h.act('history-' + B + '-continue'); await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  finish({ accepted: true, action: 'deferred' }); await refused;
  assert.doesNotMatch(h.el('run-guide-title').textContent, /vertagt/u);
  assert.equal(h.el('review-view').hidden, false);
});

testAsync('native review readiness, not the opened iframe, controls the common guide', async () => {
  let session = { ready: false, phase: 'preparing', worker_active: true };
  const h = harness({ invoke(command, args, fallback) { return command === 'get_review_session' ? session : fallback(); } });
  await selectAndStart(h);
  h.model.state = { ...h.model.state, state: 'review_required', review_count: 2 }; await h.poll();
  await h.act('job-action-review');
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  assert.match(h.el('run-guide-next').textContent, /warten/iu);
  assert.doesNotMatch(h.el('run-guide-next').textContent, /vormerken/u);
  session = { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 };
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  assert.match(h.el('run-guide-next').textContent, /vormerken/u);
  session = { ready: false, phase: 'failed', worker_active: false };
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  assert.doesNotMatch(h.el('run-guide-next').textContent, /vormerken/u);
});

function conversionFeedback(overrides = {}) {
  return { schema: 'datasecure-conversion-feedback/1', ocr_enabled: false, selected_count: 133, result_count: 116,
    not_converted_count: 17, ocr_omitted_count: 17, error_count: 0, content_notice_count: 35, pending_count: 0, complete: true, ...overrides };
}
const partialContentNotices = [
  ['OFFICE_TABLE_CONTEXT_UNVERIFIED', /Office-Tabell.*Feldzuordnung/u],
  ['OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED', /EMF-Grafiken/u],
  ['OFFICE_IMAGE_FORMAT_WMF_UNSUPPORTED', /WMF-Grafiken/u],
  ['OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED', /SVG-Grafiken/u],
  ['OFFICE_IMAGE_FORMAT_GIF_UNSUPPORTED', /GIF-Bilder/u],
  ['OFFICE_IMAGE_FORMAT_TIFF_UNSUPPORTED', /TIFF-Bilder/u],
  ['OFFICE_IMAGE_FORMAT_WEBP_UNSUPPORTED', /WebP-Bilder/u],
  ['OFFICE_IMAGE_FORMAT_OTHER_UNSUPPORTED', /nicht unterstütztes Bildformat/u],
  ['IMAGE_CONTENT_DAMAGED', /Bild ist beschädigt/u],
  ['IMAGE_PROCESSING_LIMIT', /Bildverarbeitung.*technische Grenze/u],
  ['IMAGE_OCR_FAILED', /Texterkennung.*fehlgeschlagen/u],
  ['DOCUMENT_PARTS_DAMAGED', /Beschädigte Dokumentteile/u],
  ['EXTERNAL_CONTENT_NOT_READ', /Extern verknüpfte Inhalte.*nicht nachgeladen/u],
  ['CONVERSION_RESOURCE_LIMIT_PARTIAL', /Ressourcenbegrenzung/u],
  ['CONVERSION_TIMEOUT_PARTIAL', /Verarbeitungszeit.*ausgeschöpft/u],
  ['TEXT_LIMIT_PARTIAL', /Textmengengrenze/u],
  ['PDF_PAGE_NOT_READ', /PDF-Seite.*nicht gelesen/u],
  ['PDF_IMAGE_NOT_READ', /Bildbereich der PDF.*nicht gelesen/u]
];
for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const [code, expected] of partialContentNotices)
testAsync(`partial content notice has a concrete German reason and never restarts: ${mode}/${code}`, async () => {
  const fb = conversionFeedback({ ocr_enabled: true, selected_count: 1, result_count: 1,
    not_converted_count: 0, ocr_omitted_count: 0, error_count: 0, content_notice_count: 1 });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, available: true,
      total: 0, files: [], content_notice_count: 1, content_notice_breakdown_complete: true,
      ...(mode === 'markdown-only' ? { conversion_feedback: fb } : {}),
      content_notices: [{ name: 'Inhalt.pptx', reason_codes: [code] }] };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: mode, status: 'results_available', selected_count: 1,
    result_count: 1, failed_count: 0, results_available: true, result_location: 'available',
    content_notice_count: 1, content_notice_breakdown_complete: true,
    ...(mode === 'markdown-only' ? { conversion_feedback: fb } : {}) }];
  await h.act('nav-history'); await h.act(`history-${B}-problems`);
  const notices = withClass(h.el(`history-${B}-files`), 'notice-card');
  assert.equal(notices.length, 1); assert.match(notices[0].textContent, expected);
  assert.match(notices[0].textContent, /nur teilweise übernommen|nur ein Teil des Dokuments/u);
  assert.doesNotMatch(notices[0].textContent, new RegExp(code, 'u'));
  assert.doesNotMatch(notices[0].textContent, /ausgeschaltet|ohne OCR|vollständig übernommen|vollständig anonymisiert/u);
  assert.match(h.el('history-list').children[0].textContent, /abgeschlossen.*mit Hinweisen/u);
  assert.equal(h.el(`history-${B}-results`).textContent, 'Ergebnisordner öffnen');
  noAutomaticDecision(h);
  assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
});

testAsync('actual pure CSV notice presenter spells out all partial reasons without changing legacy anonymization columns', async () => {
  // Execute the real pure presenter and CSV/source-label helpers in isolation.
  // This checks presentation bytes only, not filesystem publication or native authority.
  const exporter = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/gateway/result-export.js'), 'utf8');
  const mapping = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/gateway/mapping.js'), 'utf8');
  const between = (text, first, next) => {
    const start = text.indexOf(first), end = text.indexOf(next, start);
    assert.ok(start >= 0 && end > start); return text.slice(start, end);
  };
  const constants = ['SCHEMA', 'CONTENT_ANONYMIZED_SCHEMA', 'LEGACY_MARKDOWN_SCHEMA', 'VISIBLE_MAPPING_HEADER'].map(name => {
    const match = exporter.match(new RegExp(`^const ${name} = '[^']*';`, 'mu')); assert.ok(match); return match[0];
  }).join('\n');
  const present = vm.runInNewContext(constants + '\n' +
    between(mapping, 'function quoteCsvField(', 'function sourceIdentityNote(') + '\n' +
    between(exporter, 'function validSourceLabel(', 'function validResultFile(') + '\n' +
    between(exporter, 'function visibleMappingBytes(', 'function exportVisibleMapping(') + '\nvisibleMappingBytes;', { Buffer });
  const legacySchema = /const LEGACY_MARKDOWN_SCHEMA = '([^']+)';/u.exec(exporter)[1];
  const normalized=present({schema:legacySchema,items:[{source_label:'Quelle.pptx',file:'Quelle.md',
    extraction_grade:'incomplete',reason_codes:['OFFICE_TABLE_LAYOUT_NORMALIZED']}]}).toString('utf8');
  assert.match(normalized,/Zellabschnitte mit Koordinaten.*bei Anonymisierung/u);
  assert.doesNotMatch(normalized,/OFFICE_TABLE_LAYOUT_NORMALIZED/u);
  for (const [code, expected] of partialContentNotices) {
    const csv = present({ schema: legacySchema, items: [{ source_label: 'Quelle.pptx', file: 'Quelle.md',
      extraction_grade: 'incomplete', reason_codes: [code] }] }).toString('utf8');
    assert.match(csv, expected); assert.match(csv, /nur teilweise übernommen|nur ein Teil des Dokuments/u);
    assert.doesNotMatch(csv, new RegExp(code, 'u'));
    assert.doesNotMatch(csv, /ausgeschaltet|ohne OCR|Text vollständig extrahiert/u);
  }
  const anonymousSchema = /const CONTENT_ANONYMIZED_SCHEMA = '([^']+)';/u.exec(exporter)[1];
  const anonymous = present({ schema: anonymousSchema, items: [{ source_label: 'Quelle.pptx', file: 'Dokument_01.md',
    extraction_grade: 'incomplete', reason_codes: ['IMAGE_OCR_FAILED'] }] }).toString('utf8');
  assert.equal(anonymous, '\uFEFFOriginaldatei;Anonymisiertes Ergebnis\r\n"Quelle.pptx";"Dokument_01.md"\r\n');
});

for(const mode of ['markdown-only','markdown-and-anonymize'])testAsync(`normalised table remains a completed result with a concrete notice: ${mode}`,async()=>{
  const fb=conversionFeedback({ocr_enabled:false,selected_count:1,result_count:1,not_converted_count:0,ocr_omitted_count:0,error_count:0,content_notice_count:1});
  const h=harness({invoke(command,args,fallback){if(command==='get_run_failures')return{
    local_ui_only:true,external_disclosure:false,available:true,total:0,files:[],content_notice_count:1,
    content_notice_breakdown_complete:true,...(mode==='markdown-only'?{conversion_feedback:fb}:{}),
    content_notices:[{name:'Tabelle.docx',reason_codes:['OFFICE_TABLE_LAYOUT_NORMALIZED']}]};return fallback();}});await tick();
  h.model.entries=[{batch_id:B,processing_mode:mode,status:'results_available',selected_count:1,result_count:1,
    failed_count:0,results_available:true,result_location:'available',content_notice_count:1,content_notice_breakdown_complete:true,
    ...(mode==='markdown-only'?{conversion_feedback:fb}:{})}];
  await h.act('nav-history');await h.act(`history-${B}-problems`);
  assert.match(h.el(`history-${B}-files`).textContent,/Zellabschnitte mit Koordinaten.*bei Anonymisierung/u);
  assert.equal(h.el(`history-${B}-results`).textContent,'Ergebnisordner öffnen');
  assert.equal(h.calls.some(call=>call.command==='continue_history_batch'),false);noAutomaticDecision(h);
});

testAsync('bound raw completion makes results primary, explains omissions and separates content notices', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, available: true, total: 17,
      conversion_feedback: conversionFeedback(), files: [{ name: 'Scans/Original.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' }],
      content_notices: [{ name: 'Berichte/Inhalt.docx', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }] };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'results_available', selected_count: 133,
    result_count: 116, failed_count: 17, results_available: true, result_location: 'available', conversion_feedback: conversionFeedback() }];
  await h.act('nav-history');
  const row = h.el('history-list').children[0];
  assert.match(row.textContent, /Lauf abgeschlossen mit Hinweisen/u);
  assert.match(row.textContent, /17 ohne OCR nicht umgewandelt · 0 technische Fehler/u);
  assert.match(row.textContent, /35 erstellte Dateien mit Inhaltshinweisen/u);
  const main = h.el(`history-${B}-results`); assert.equal(main.className, 'primary');
  assert.equal(main.textContent, 'Ergebnisordner öffnen');
  await h.act(main); assert.equal(h.calls.at(-1).command, 'open_history_results');
  assert.equal(h.calls.some(row => /decide|export_approved/u.test(row.command)), false);
  await h.act(`history-${B}-problems`);
  const files = h.el(`history-${B}-files`);
  assert.equal(files.children.some(node => node.className === 'problem-card'), false);
  assert.ok(files.children.some(node => node.className === 'notice-card'));
  assert.ok(files.children.some(node => node.tagName === 'DETAILS' && /Inhaltshinweisen/u.test(node.textContent)));
  assert.doesNotMatch(row.textContent, /Freigaben und Exporte|17 Probleme/u);
});
testAsync('a real file error stays visible without hiding usable raw results', async () => {
  const fb = conversionFeedback({ ocr_omitted_count: 16, error_count: 1 });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, conversion_feedback: fb,
      files: [{ name: 'Defekt.pdf', reason_code: 'SOURCE_READ_FAILED', classification: 'error' },
        { name: 'Scan.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' }] };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'results_available', selected_count: 133,
    result_count: 116, failed_count: 17, results_available: true, conversion_feedback: fb }];
  await h.act('nav-history');
  assert.equal(h.el(`history-${B}-results`).textContent, 'Ergebnisordner öffnen');
  assert.equal(h.el('history-list').children[0].dataset.outcome, 'partial');
  await h.act(`history-${B}-problems`);
  assert.match(h.el('history-list').textContent, /Lauf abgeschlossen mit Fehlern/u);
  assert.ok(h.el(`history-${B}-files`).children.some(node => node.className === 'problem-card' && /Defekt.pdf/u.test(node.textContent)));
  assert.ok(h.el(`history-${B}-files`).children.some(node => node.className === 'notice-card' && /Scan.png/u.test(node.textContent)));
});
testAsync('all expected OCR omissions finish without offering an empty result folder', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'completed_without_results', selected_count: 17,
    result_count: 0, failed_count: 17, results_available: false, conversion_feedback: conversionFeedback({ selected_count: 17,
      result_count: 0, content_notice_count: 0 }) }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent, /Lauf abgeschlossen mit Hinweisen/u);
  assert.match(h.el('history-list').textContent, /Keine Ergebnisdateien vorhanden/u);
  assert.equal(h.el(`history-${B}-results`), undefined);
  assert.equal(h.el(`history-${B}-summary-toggle`), undefined);
});
testAsync('expired or missing raw evidence cannot turn stopped files into harmless omissions', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'results_available', selected_count: 133,
    result_count: 116, failed_count: 17, results_available: true }];
  await h.act('nav-history');
  assert.equal(h.el(`history-${B}-results`).textContent, 'Ergebnisordner öffnen');
  assert.equal(h.el(`history-${B}-problems`).textContent, 'Betroffene Dateien');
  assert.doesNotMatch(h.el('history-list').textContent, /0 technische Fehler|ohne OCR nicht umgewandelt/u);
});
testAsync('the actual job and common guide use the backend terminal total without double counting omissions', async () => {
  const h = harness({ catalogue: Array.from({ length: 133 }, (_, n) => ({ name: `Synthetic/${n}.txt`, source_id: id(n + 1), bytes: 4, selectable: true })) });
  await selectAndStart(h);
  h.model.state = { batch_id: A, state: 'results_available', processing_mode: 'markdown-only', selected_count: 133,
    completed_count: 133, result_count: 116, failed_count: 17, batch_complete: true, results_available: true,
    conversion_feedback: conversionFeedback() };
  await h.poll();
  assert.equal(h.el('job-progress').value, 133);
  assert.equal(h.el('job-title').textContent, 'Lauf abgeschlossen mit Hinweisen');
  assert.equal(h.el('run-guide').hidden, true, 'active run has one completion card, not a duplicate guide');
  assert.match(h.el('job-description').textContent, /keine Freigabe erforderlich/u);
  assert.equal(h.el('job-status').className, 'job-status success');
  assert.equal(h.el('file-problems').open, false, 'expected notices are collapsed by default');
  assert.equal(h.el('job-action-results').className, 'primary');
  assert.equal(h.el('job-action-documents').className, '');
});

testAsync('a delivery notice is scoped to its run and retires only after its confirmed completion', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'export_pending', selected_count: 2,
    result_count: 2, failed_count: 0 }];
  await h.act('nav-history');
  assert.match(h.el('history-list').textContent, /Ergebnisdateien dieses Laufs lokal ergänzen.*keinen Export/u);
  assert.ok(h.calls.filter(call => call.command === 'get_run_history').every(call => call.args === undefined),
    'startup and ordinary display reads cannot publish a pending result export');
  const pending = h.el('history-list').children[0].children[1].children.find(node => /Bereitstellung/u.test(node.textContent));
  assert.ok(pending); await h.act(pending);
  assert.equal(h.calls.filter(call => call.command === 'get_run_history' && call.args?.recoverExports === true &&
    call.args?.recoverBatchId === B).length,
    1, 'only the explicit delivery action requests reconciliation');
  assert.match(h.el('feedback').textContent, /noch nicht als vollständig bestätigt/u);
  assert.doesNotMatch(h.el('feedback').className, /error/u);
  h.model.entries.unshift({ batch_id: A, processing_mode: 'markdown-only', status: 'results_available', result_count: 1 });
  await h.poll(); assert.match(h.el('feedback').textContent, /noch nicht als vollständig bestätigt/u, 'another run cannot clear the notice');
  h.model.entries[1].status = 'results_available'; h.model.entries[1].results_available = true;
  h.model.entries[1].result_location = 'available'; h.model.entries[1].completion_pending = true;
  await h.poll(); assert.match(h.el('feedback').textContent, /noch nicht als vollständig bestätigt/u, 'pending completion cannot clear it');
  h.model.entries[1].completion_pending = false;
  await h.poll(); assert.equal(h.el('feedback').hidden, true); assert.equal(h.el('feedback').textContent, '');
});

testAsync('a completed journal cannot dismiss pending delivery when the bound result folder is missing', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'export_pending',
    selected_count: 1, result_count: 1, failed_count: 0 }];
  await h.act('nav-history'); await h.act(`history-${B}-delivery`);
  h.model.entries[0] = { ...h.model.entries[0], status: 'results_available', results_available: false, result_location: 'missing' };
  await h.poll();
  assert.match(h.el('feedback').textContent, /noch nicht als vollständig bestätigt/u);
});

testAsync('explicit result recovery distinguishes verified, pending, skipped and failed outcomes', async () => {
  for (const [outcome, phrase, error] of [
    ['available', /gebundene Ergebnisordner sind bestätigt/u, false],
    ['pending', /noch nicht als vollständig bestätigt/u, false],
    ['not_attempted', /keine neue Bereitstellung begonnen/u, false],
    ['failed', /konnte nicht abgeschlossen werden/u, true]
  ]) {
    const h = harness({ invoke(command, args, fallback, model) {
      if (command === 'get_run_history' && args?.recoverExports === true) return { local_ui_only: true,
        external_disclosure: false, entries: model.entries,
        export_recovery: { batch_id: args.recoverBatchId, outcome } };
      return fallback();
    } }); await tick();
    h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'export_pending',
      selected_count: 1, result_count: 1, failed_count: 0 }];
    await h.act('nav-history'); await h.act(`history-${B}-delivery`);
    assert.match(h.el('feedback').textContent, phrase, outcome);
    assert.equal(h.el('feedback').className.includes('error'), error, outcome);
    assert.equal(h.calls.filter(call => call.command === 'get_run_history' && call.args?.recoverExports === true).length, 1);
  }
});

testAsync('a recovery reply for another run cannot claim this result folder is available', async () => {
  const h = harness({ invoke(command, args, fallback, model) {
    if (command === 'get_run_history' && args?.recoverExports === true) return { local_ui_only: true,
      external_disclosure: false, entries: model.entries, export_recovery: { batch_id: A, outcome: 'available' } };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'export_pending',
    selected_count: 1, result_count: 1, failed_count: 0 }];
  await h.act('nav-history'); await h.act(`history-${B}-delivery`);
  assert.doesNotMatch(h.el('feedback').textContent, /sind bestätigt/u);
  assert.match(h.el('feedback').textContent, /Bereitstellung konnte nicht bestätigt werden/u);
  assert.match(h.el('feedback').className, /error/u);
});

testAsync('explicit result recovery owns IPC while pending; background polls and duplicate clicks do not queue', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_run_history' && args?.recoverExports === true ? held : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'export_pending',
    selected_count: 1, result_count: 1, failed_count: 0 }];
  await h.act('nav-history');
  await h.act(`history-${B}-delivery`);
  assert.match(h.el('history-status').textContent, /Bereitstellung dieses Laufs wird geprüft/u);
  assert.equal(h.el('refresh-history').disabled, true, 'other local actions remain disabled while recovery owns IPC');
  const statusCalls = h.calls.filter(call => call.command === 'get_public_state').length;
  const historyCalls = h.calls.filter(call => call.command === 'get_run_history').length;
  await h.poll(); await h.act('refresh-history'); await h.act(`history-${B}-delivery`);
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, statusCalls);
  assert.equal(h.calls.filter(call => call.command === 'get_run_history').length, historyCalls);
  release({ local_ui_only: true, external_disclosure: false, entries: h.model.entries,
    export_recovery: { batch_id: B, outcome: 'pending' } });
  await tick(); await tick();
  assert.equal(h.el('refresh-history').disabled, false);
  assert.equal(h.calls.filter(call => call.command === 'get_run_history' && call.args?.recoverExports).length, 1);
  await h.poll();
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > statusCalls);
});

testAsync('connection change releases an obsolete recovery lock without adopting its late history', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_run_history' && args?.recoverExports === true ? held : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'export_pending',
    selected_count: 1, result_count: 1, failed_count: 0 }];
  await h.act('nav-history'); await h.act(`history-${B}-delivery`);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  assert.equal(h.el('refresh-history').disabled, false);
  const statusCalls = h.calls.filter(call => call.command === 'get_public_state').length;
  h.model.entries = [{ batch_id: A, processing_mode: 'markdown-only', status: 'results_available',
    selected_count: 1, result_count: 1, failed_count: 0 }];
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } });
  await h.act('connection-retry');
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > statusCalls,
    'new-session status retry cannot wait for an old-session history request');
  release({ local_ui_only: true, external_disclosure: false, entries: [{ batch_id: B, processing_mode: 'markdown-and-anonymize',
    status: 'export_pending', selected_count: 1, result_count: 1, failed_count: 0 }] });
  await tick(); await tick();
  assert.doesNotMatch(h.el('history-list').textContent, /Anonymisierung/u,
    'a late old-session response cannot restore stale history actions');
});

for (const origin of ['new', 'history']) testAsync(`owned raw contact completion from ${origin} returns to its run details, never opens a second mandatory review`, async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: false, run_complete: true };
    if (command === 'get_document_reviews') return documentResponse('markdown-only');
    return fallback();
  }});
  if (origin === 'new') {
    await selectAndStart(h);
    h.model.state = { ...h.model.state, state: 'review_required', review_count: 2 };
    await h.poll(); await h.act('job-action-review');
  } else {
    await tick(); h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', selected_count: 72, resumable: true, status: 'review_required' }];
    await h.act('nav-history'); await h.act(`history-${B}-continue`);
  }
  const batchId = origin === 'new' ? A : B;
  const startsBefore = h.calls.filter(call => call.command === 'start_admitted_batch').length;
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  h.model.state = { state: 'processing', batch_id: origin === 'new' ? batchId : A,
    processing_mode: 'markdown-and-anonymize', selected_count: 999, completed_count: 998 };
  await h.poll();
  assert.match(h.el('run-guide-scope').textContent, /Nur umwandeln/u,
    'later status cannot overwrite the purpose of the owned contact review');
  assert.equal(h.el('run-guide-title').textContent, origin === 'history'
    ? 'OCR-Kontaktprüfung abgeschlossen' : 'Laufstatus abgleichen',
    'foreign counters stay out; contradictory same-run activity still requires status reconciliation');
  h.model.state = { state: 'results_available', batch_id: batchId, processing_mode: 'markdown-only', selected_count: 72,
    completed_count: 72, result_count: 72, failed_count: 0, results_available: true };
  h.model.entries = [{ batch_id: batchId, processing_mode: 'markdown-only', selected_count: 72, result_count: 72,
    resumable: false, results_available: true, status: 'results_available' }];
  const closing = h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await closing; await tick();
  assert.equal(h.el('documents-view').hidden, true);
  selectedRun(h, batchId);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
  assert.match(h.el('feedback').textContent, /OCR-Kontaktprüfung abgeschlossen/u);
  assert.doesNotMatch(h.el('feedback').textContent, /ausdrücklich frei|Export/u);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, startsBefore);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'abandon_document_export'].includes(call.command)), false);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  selectedRun(h, batchId);
  await h.act('job-action-documents');
  assert.equal(h.el('documents-view').hidden, false, 'explicit optional editing remains available');
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, startsBefore);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'abandon_document_export'].includes(call.command)), false);
});

testAsync('unknown review purpose cannot fall through to anonymized document navigation', async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: false, run_complete: true };
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, selected_count: 2, resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  selectedRun(h, B); assert.equal(h.el('documents-view').hidden, true);
  assert.match(h.el('feedback').textContent, /Verarbeitungszweck.*nicht bestätigt/u);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
  assert.equal(h.el('job-task').textContent, 'Verarbeitungszweck nicht bestätigt');
  assert.match(h.el('history-list').textContent, /Verarbeitungszweck nicht bestätigt/u);
  assert.doesNotMatch(h.el('history-list').textContent, /Anonymisierung/u);
  await tick(); // Finish the close handler's pending status refresh before a new snapshot.
  h.model.state = { state: 'results_available', batch_id: B, result_count: 2, results_available: true };
  h.model.entries = [{ batch_id: B, result_count: 2, results_available: true, status: 'results_available' }];
  await h.poll();
  assert.equal(h.el('job-title').textContent, 'Verarbeitungszweck nicht bestätigt');
  assert.match(h.el('job-description').textContent, /unbestätigtem Verarbeitungszweck/u);
  assert.doesNotMatch(h.el('job-description').textContent, /anonymisiert/u);
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  await h.act('nav-history');
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Nachbearbeitung öffnen (optional)');
  assert.doesNotMatch(h.el('history-list').textContent, /Anonymisierung|freigeben/u);
  noAutomaticDecision(h);
});

testAsync('history cannot relabel an unsaved private document draft as another run', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'results_available',
    selected_count: 1, result_count: 1, results_available: true }];
  h.el('documents-run').textContent = `Lauf ${A.slice(0, 8)}`;
  let opened = 0;
  h.window.__DATASECURE_DOCUMENTS__ = {
    activeBatchId() { return A; },
    canOpen(batchId) { assert.equal(batchId, B); return false; },
    async open() { opened++; },
    async close() { return false; }
  };
  await h.act('nav-history');
  await h.act(`history-${B}-documents`);
  assert.equal(opened, 0);
  assert.equal(h.el('documents-view').hidden, false);
  assert.equal(h.el('documents-run').textContent, `Lauf ${A.slice(0, 8)}`);
});

testAsync('cross-volume result folder is rejected with an actionable explanation', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') throw Error('AI_EXPORT_VOLUME_MISMATCH');
    return fallback();
  } });
  await tick();
  const previous = h.el('destination').textContent;
  await h.act('configure-results');
  assert.match(h.el('feedback').textContent, /anderen Laufwerk.*selben Laufwerk/u);
  assert.equal(h.el('destination').textContent, previous);
});

for (const button of ['configure-results', 'change-destination'])
for (const [form, failure] of [
  ['Error', () => Error('AI_EXPORT_CONFLICT')],
  ['string', () => 'AI_EXPORT_CONFLICT'],
  ['coded vendor error', () => ({ code: 'AI_EXPORT_CONFLICT', message: '/vendor/private/raw-path' })],
  ['JSON rejection', () => JSON.stringify({ code: 'AI_EXPORT_CONFLICT', detail: '/vendor/private/raw-path' })]
])
testAsync('result folder conflict: ' + button + ' uses fixed configuration guidance for ' + form, async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') throw failure();
    return fallback();
  } });
  await tick(); await h.act('select-folder');
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  const before = { destination: h.el('destination').textContent, settings: h.el('settings-destination').textContent,
    catalogue: h.el('catalogue').textContent, start: h.el('start').attrs['aria-disabled'] };
  await h.act(button);
  const message = h.el('feedback').textContent;
  assert.match(message, /Ergebnisordner konnte nicht sicher vorbereitet werden/u);
  assert.match(message, /bisherige Einstellung bleibt unverändert/u);
  assert.match(message, /kein Dokumentlauf und kein Export gestartet/u);
  assert.match(message, /Diagnose und aktuellen Laufstatus prüfen; keinen Lauf oder Export blind wiederholen/u);
  assert.match(message, /\(AI_EXPORT_CONFLICT\)$/u);
  assert.doesNotMatch(message, /vendor|raw-path|Rechte|Berechtigung|Zugriff verweigert/u);
  assert.equal(h.el('destination').textContent, before.destination);
  assert.equal(h.el('settings-destination').textContent, before.settings);
  assert.equal(h.el('catalogue').textContent, before.catalogue);
  assert.equal(h.el('start').attrs['aria-disabled'], before.start);
  assert.equal(h.el(button).disabled, false);
  assert.equal(h.el('connection-help').hidden, true, 'a destination conflict is not a connection failure');
  for (let i = 0; i < 3; i++) await h.poll();
  assert.equal(h.el('feedback').textContent, message, 'status reads do not erase this command failure');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'continue_current_batch', 'continue_history_batch',
    'export_approved_documents', 'decide_document_review', 'decide_document_review_batch'].includes(call.command)), false);
});

testAsync('result folder conflict: the same code from another perform command keeps generic guidance', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'open_identity_mappings_directory') throw Error('AI_EXPORT_CONFLICT');
    return fallback();
  } });
  await tick(); await h.act('identities');
  assert.equal(h.el('feedback').textContent,
    'Der lokale Vorgang konnte nicht abgeschlossen werden. Bitte Diagnose und aktuellen Laufstatus prüfen. (AI_EXPORT_CONFLICT)');
  assert.equal(h.calls.some(call => call.command === 'configure_results'), false);
});

testAsync('completed working directory: an unavailable code from another action is not downgraded', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'open_identity_mappings_directory') throw Error('RESULT_DIRECTORY_UNAVAILABLE');
    return fallback();
  } });
  await tick(); await h.act('identities');
  assert.equal(h.el('feedback').className, 'notice error');
  assert.match(h.el('feedback').textContent, /lokale Vorgang konnte nicht abgeschlossen werden/u);
  assert.doesNotMatch(h.el('feedback').textContent, /Verarbeitung ist abgeschlossen|Arbeitskopien/u);
  assert.equal(h.calls.some(call => ['publish_current_results', 'publish_history_results'].includes(call.command)), false);
});

testAsync('result folder conflict: an unscoped native-drop error keeps generic guidance', async () => {
  const h = harness(); await tick();
  h.listeners.get('datasecure-native-drop')({ payload: { phase: 'failed', error_code: 'AI_EXPORT_CONFLICT' } });
  assert.equal(h.el('feedback').textContent,
    'Der lokale Vorgang konnte nicht abgeschlossen werden. Bitte Diagnose und aktuellen Laufstatus prüfen. (AI_EXPORT_CONFLICT)');
});

testAsync('result folder conflict: unknown configure failure never becomes a preparation diagnosis or raw text', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') throw Error('/vendor/private/raw-path: access denied');
    return fallback();
  } });
  await tick(); await h.act('configure-results');
  assert.equal(h.el('feedback').textContent,
    'Der lokale Vorgang konnte nicht abgeschlossen werden. Bitte Diagnose und aktuellen Laufstatus prüfen. (STANDALONE_OPERATION_FAILED)');
});

testAsync('result folder conflict: a configure IPC failure retains connectivity guidance', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') throw Error('STANDALONE_IPC_FAILED');
    return fallback();
  } });
  await tick(); await h.act('configure-results');
  assert.match(h.el('feedback').textContent, /Verbindung wurde unterbrochen/u);
  assert.doesNotMatch(h.el('feedback').textContent, /bisherige Einstellung bleibt unverändert/u);
  assert.equal(h.el('connection-help').hidden, false);
});

testAsync('result folder conflict: busy ownership never replays a pending configuration', async () => {
  let reject;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') return new Promise((resolve, fail) => { reject = fail; });
    return fallback();
  } });
  await tick(); await h.act('configure-results'); await h.act('change-destination');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.el('configure-results').disabled, true);
  reject(Error('AI_EXPORT_CONFLICT')); await tick();
  assert.match(h.el('feedback').textContent, /bisherige Einstellung bleibt unverändert/u);
  assert.equal(h.el('configure-results').disabled, false);
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
});

for (const code of ['STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED'])
testAsync('result folder conflict: a later configuration rejection cannot replace ' + code, async () => {
  let reject;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') return new Promise((resolve, fail) => { reject = fail; });
    return fallback();
  } });
  await tick(); await h.act('configure-results');
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'bootstrap_failed', error_code: code } });
  const message = h.el('feedback').textContent;
  reject(Error('AI_EXPORT_CONFLICT')); await tick();
  assert.equal(h.el('feedback').textContent, message);
  assert.match(message, new RegExp(code, 'u'));
  assert.doesNotMatch(message, /bisherige Einstellung bleibt unverändert/u);
  await h.act('change-destination'); await h.act('select-files'); await h.act('start'); await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.calls.some(call => ['select_files', 'start_admitted_batch', 'export_approved_documents'].includes(call.command)), false);
  assert.equal(h.el('connection-help').hidden, false);
});

testAsync('result folder conflict: a late refusal cannot overwrite recovery or release its picker guard', async () => {
  let reject;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') return new Promise((resolve, fail) => { reject = fail; });
    return fallback();
  } });
  await tick(); await h.act('configure-results');
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  await tick(); const message = h.el('feedback').textContent;
  reject(Error('AI_EXPORT_CONFLICT')); await tick(); await h.act('change-destination');
  assert.equal(h.el('feedback').textContent, message);
  assert.doesNotMatch(message, /bisherige Einstellung bleibt unverändert/u);
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'export_approved_documents'].includes(call.command)), false);
  assert.equal(h.el('connection-help').hidden, false);
});

for (const cancelled of [true, false])
testAsync('result folder conflict: ' + (cancelled ? 'cancelled' : 'successful') + ' selection keeps its existing contract', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'configure_results') return cancelled ? { ok: true, cancelled: true } : {
      ok: true, local_ui_only: true, external_disclosure: false, result_folder: 'New local results' };
    return fallback();
  } });
  await tick(); const previous = h.el('destination').textContent; await h.act('configure-results');
  assert.equal(h.el('destination').textContent, cancelled ? previous : 'New local results');
  assert.equal(h.el('settings-destination').textContent, cancelled ? previous : 'New local results');
  if (!cancelled) assert.match(h.el('feedback').textContent, /Ergebnisordner gespeichert/u);
  assert.doesNotMatch(h.el('feedback').textContent, /AI_EXPORT_CONFLICT|konnte nicht sicher vorbereitet werden/u);
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'export_approved_documents'].includes(call.command)), false);
});

/* Historical bootstrap resolution regressions: actual native snapshot/event DTOs. */
for (const delivery of ['event', 'lost'])
for (const failedRead of ['get_public_state', 'get_ui_context'])
for (const code of ['STANDALONE_IPC_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
testAsync('historical resolution: ' + delivery + ' Ready then ' + failedRead + ' ' + code + ' recovers only on another click', async () => {
  let h, initial = true, ready = false, reject = true, holdContext, deferContext = false;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  const resolution = { failure_epoch: 1, ready_epoch: 2 };
  const snapshot = () => ({ phase: 'owned', connection_epoch: ready ? 2 : 1,
    bootstrap_failure: ready ? null : { ...failure }, bootstrap_resolution: ready ? { ...resolution } : null,
    activity: { state: 'idle', active: false }, diagnostic_log: 'available', diagnostic_writer: {},
    local_ui_only: true, external_disclosure: false });
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') return snapshot();
    if (command === 'get_public_state' && args?.retryBootstrap === true) {
      ready = true;
      if (delivery === 'event') h.listeners.get('datasecure-connection')({
        payload: { epoch: 2, state: 'ready', bootstrap_resolution: { ...resolution } } });
    }
    if (ready && command === failedRead && reject) { reject = false; throw Error(code); }
    if (command === 'get_ui_context' && deferContext) return new Promise(resolve => { holdContext = () => resolve(fallback()); });
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick();
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt/u);
  const first = h.calls.length;
  for (let n = 0; n < 4; n++) await h.poll();
  await h.act('select-files'); await h.act('configure-results');
  assert.equal(h.calls.slice(first).some(call => ['get_public_state', 'get_ui_context', 'select_files', 'configure_results'].includes(call.command)), false,
    'explicit recovery remains paused and mutations blocked even after native Ready');
  deferContext = true; const before = h.calls.length;
  await h.act('connection-retry'); await h.act('connection-retry'); await tick();
  assert.equal(typeof holdContext, 'function', 'second click must reach current context');
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt/u);
  await h.act('select-files');
  assert.equal(h.calls.slice(before).some(call => call.command === 'select_files'), false);
  holdContext(); await tick(); await tick();
  const reads = h.calls.slice(before).filter(call => ['get_public_state', 'get_ui_context'].includes(call.command));
  assert.deepEqual(reads.map(call => [call.command, call.args]), [['get_public_state', undefined], ['get_ui_context', undefined]]);
  assert.equal(h.calls.filter(call => call.args?.retryBootstrap === true).length, 1);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('connection-help').hidden, true);
  h.listeners.get('datasecure-connection')({ payload: { ...failure, state: 'bootstrap_failed' } });
  assert.equal(h.el('connection-help').hidden, true);
});

for (const delivery of ['event', 'lost', 'late'])
testAsync('historical resolution: ' + delivery + ' Ready survives real context timeout, retirement and later ordinary status bootstrap', async () => {
  let h, initial = true, nativeEpoch = 1, nativeFailure = true, phase = 'idle', timeout = true, retired = false, spawns = 0, blocked = 0;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  const resolution = { failure_epoch: 1, ready_epoch: 2 };
  const readyEvent = () => h.listeners.get('datasecure-connection')({
    payload: { epoch: 2, state: 'ready', bootstrap_resolution: { ...resolution } } });
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') return { phase, connection_epoch: nativeEpoch,
      bootstrap_failure: nativeFailure ? { ...failure } : null, bootstrap_resolution: nativeFailure ? null : { ...resolution },
      local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state' && args?.retryBootstrap === true) {
      assert.equal(nativeFailure, true); nativeFailure = false; nativeEpoch = 2; phase = 'owned'; spawns++;
      if (delivery === 'event') readyEvent();
    } else if (command === 'get_public_state' && nativeEpoch === 3) {
      assert.equal(args?.retryBootstrap, undefined, 'resolved failure must not authorize another bootstrap override');
      if (!retired) { blocked++; throw Error('STANDALONE_CONNECTION_RECOVERY_BLOCKED'); }
      spawns++; nativeEpoch = 4; phase = 'owned';
      h.listeners.get('datasecure-connection')({ payload: { epoch: 4, state: 'ready', bootstrap_resolution: { ...resolution } } });
    }
    if (command === 'get_ui_context' && timeout) {
      timeout = false; nativeEpoch = 3; phase = 'settling';
      // Actual native transport-error contract: unusable + retirement + new epoch.
      h.listeners.get('datasecure-connection')({ payload: { epoch: 3, state: 'recovering' } });
      if (delivery === 'late') readyEvent();
      throw Error('STANDALONE_IPC_TIMEOUT');
    }
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick(); await tick();
  const afterTimeout = h.calls.length;
  for (let n = 0; n < 4; n++) await h.poll();
  assert.equal(h.calls.slice(afterTimeout).some(call => ['get_public_state', 'get_ui_context'].includes(call.command)), false);
  await h.act('connection-retry'); await tick();
  assert.equal(blocked, 1, 'normal status must reach and obey the native unconfirmed-retirement gate');
  assert.equal(spawns, 1); assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt/u);
  retired = true; phase = 'idle';
  await h.act('connection-retry'); await tick(); await tick();
  assert.equal(spawns, 2); assert.equal(h.calls.filter(call => call.args?.retryBootstrap === true).length, 1);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  // Receipt Ready 2 did not rewind epoch 3: delayed Ready 2 cannot hide newer failure 3.
  h.listeners.get('datasecure-connection')({ payload: { epoch: 5, state: 'bootstrap_failed', error_code: 'STANDALONE_OWNERSHIP_RUNTIME_INVALID' } });
  readyEvent();
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_RUNTIME_INVALID/u);
});

for (const bad of ['missing', 'null', 'wrong-failure', 'same-ready', 'future-ready', 'extra', 'string',
  'stale-snapshot', 'missing-current', 'missing-null', 'disclosure', 'phase'])
testAsync('historical resolution rejects ' + bad + ' receipt/snapshot and does not fall through to ordinary status', async () => {
  let h, initial = true, ready = false;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') {
      if (!ready) return { phase: 'idle', connection_epoch: 1, bootstrap_failure: failure, bootstrap_resolution: null,
        local_ui_only: true, external_disclosure: false };
      const value = { phase: 'owned', connection_epoch: 2, bootstrap_failure: null,
        bootstrap_resolution: { failure_epoch: 1, ready_epoch: 2 }, local_ui_only: true, external_disclosure: false };
      if (bad === 'missing') delete value.bootstrap_resolution;
      if (bad === 'null') value.bootstrap_resolution = null;
      if (bad === 'wrong-failure') value.bootstrap_resolution.failure_epoch = 0;
      if (bad === 'same-ready') value.bootstrap_resolution.ready_epoch = 1;
      if (bad === 'future-ready') value.bootstrap_resolution.ready_epoch = 3;
      if (bad === 'extra') value.bootstrap_resolution.vendor = '/private/raw';
      if (bad === 'string') value.bootstrap_resolution.ready_epoch = '2';
      if (bad === 'stale-snapshot') value.connection_epoch = 0;
      if (bad === 'missing-current') delete value.connection_epoch;
      if (bad === 'missing-null') delete value.bootstrap_failure;
      if (bad === 'disclosure') value.external_disclosure = true;
      if (bad === 'phase') value.phase = 'vendor/raw';
      return value;
    }
    if (command === 'get_public_state' && args?.retryBootstrap === true) { ready = true; throw Error('STANDALONE_IPC_BUSY'); }
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick();
  const before = h.calls.length; await h.act('connection-retry'); await tick();
  assert.equal(h.calls.slice(before).some(call => ['get_public_state', 'get_ui_context'].includes(call.command)), false);
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_STORAGE_UNSAFE/u);
});

testAsync('historical resolution never binds provisional invoke epoch zero or erases a newer native failure', async () => {
  let h, currentFailure = null;
  const resolution = { failure_epoch: 1, ready_epoch: 2 };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context') throw Error('STANDALONE_OWNERSHIP_STORAGE_UNSAFE');
    if (command === 'get_native_recovery_status') return { phase: 'idle', connection_epoch: currentFailure ? 3 : 2,
      bootstrap_failure: currentFailure, bootstrap_resolution: resolution, local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state') throw Error('STANDALONE_OWNERSHIP_RUNTIME_INVALID');
    return fallback();
  } });
  await tick(); await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready', bootstrap_resolution: resolution } });
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').length, 0, 'unbound invoke error is not failure 1');
  currentFailure = { epoch: 3, error_code: 'STANDALONE_OWNERSHIP_RUNTIME_INVALID' };
  h.listeners.get('datasecure-connection')({ payload: { ...currentFailure, state: 'bootstrap_failed' } });
  await h.act('connection-retry'); await tick();
  assert.equal(h.calls.filter(call => call.command === 'get_public_state').at(-1).args.retryBootstrap, true);
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_RUNTIME_INVALID/u);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready', bootstrap_resolution: resolution } });
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_RUNTIME_INVALID/u);
});

testAsync('historical resolution snapshot stays single-flight and cannot resolve a replaced failure', async () => {
  let h, initial = true, ready = false, resolveSnapshot;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') return ready ? new Promise(resolve => { resolveSnapshot = resolve; })
      : { phase: 'idle', connection_epoch: 1, bootstrap_failure: failure, bootstrap_resolution: null, local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state' && args?.retryBootstrap === true) { ready = true; throw Error('STANDALONE_IPC_BUSY'); }
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick();
  const before = h.calls.length; await h.act('connection-retry'); await h.act('connection-retry');
  assert.equal(h.calls.slice(before).filter(call => call.command === 'get_native_recovery_status').length, 1);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 3, state: 'bootstrap_failed', error_code: 'STANDALONE_OWNERSHIP_RUNTIME_INVALID' } });
  resolveSnapshot({ phase: 'idle', connection_epoch: 2, bootstrap_failure: null,
    bootstrap_resolution: { failure_epoch: 1, ready_epoch: 2 }, local_ui_only: true, external_disclosure: false });
  await tick(); await tick();
  assert.equal(h.calls.slice(before).some(call => ['get_public_state', 'get_ui_context'].includes(call.command)), false);
  assert.match(h.el('feedback').textContent, /STANDALONE_OWNERSHIP_RUNTIME_INVALID/u);
});

testAsync('historical resolution never unlocks mutations or automatic retry on an invalid current context', async () => {
  let h, initial = true, ready = false, invalid = true;
  const failure = { epoch: 1, error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' };
  const resolution = { failure_epoch: 1, ready_epoch: 2 };
  h = harness({ invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; throw Error(failure.error_code); }
    if (command === 'get_native_recovery_status') return { phase: ready ? 'owned' : 'idle', connection_epoch: ready ? 2 : 1,
      bootstrap_failure: ready ? null : failure, bootstrap_resolution: ready ? resolution : null,
      local_ui_only: true, external_disclosure: false };
    if (command === 'get_public_state' && args?.retryBootstrap === true) {
      ready = true;
      h.listeners.get('datasecure-connection')({ payload: { epoch: 2, state: 'ready', bootstrap_resolution: resolution } });
    }
    if (command === 'get_ui_context' && ready && invalid) return { ...fallback(), local_ui_only: false };
    return fallback();
  } });
  await tick(); await tick(); await h.act('connection-retry'); await tick();
  assert.doesNotMatch(h.el('feedback').textContent, /wiederhergestellt/u);
  const before = h.calls.length;
  for (let n = 0; n < 3; n++) await h.poll();
  await h.act('select-files'); await h.act('configure-results');
  assert.equal(h.calls.slice(before).some(call => ['get_public_state', 'get_ui_context', 'select_files', 'configure_results'].includes(call.command)), false);
  invalid = false; await h.act('connection-retry'); await tick(); await tick();
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.calls.filter(call => call.args?.retryBootstrap === true).length, 1);
});

// Same actual workspace/DOM harness as all other transitions. No test-only
// renderer hook, private state injection, native process or file IO is added.
async function finishedAnonymousWorkspace(options = {}, omitted = 0, privacyStops = 0, resultCount = 2) {
  const h = harness(options); await tick();
  h.model.state = { state:'processing', batch_id:A, processing_mode:'markdown-and-anonymize',
    selected_count:resultCount + omitted + privacyStops, completed_count:0, failed_count:0, batch_complete:false };
  await h.poll();
  h.model.state = { state:'results_available', batch_id:A, processing_mode:'markdown-and-anonymize',
    selected_count:resultCount + omitted + privacyStops, completed_count:resultCount + omitted + privacyStops, result_count:resultCount, failed_count:omitted + privacyStops, batch_complete:true, results_available:true,
    content_notice_count:0, content_notice_breakdown_complete:true };
  h.model.entries = [{batch_id:A, processing_mode:'markdown-and-anonymize', status:'results_available',
    selected_count:resultCount + omitted + privacyStops, completed_count:resultCount + omitted + privacyStops, result_count:resultCount, failed_count:omitted + privacyStops, results_available:true, result_location:'available',
    ...(omitted ? {expected_ocr_omission_count:omitted} : {}),
    ...(privacyStops ? {privacy_stop_count:privacyStops} : {}),
    ...(omitted + privacyStops ? {failure_reason_breakdown_complete:true} : {}),
    content_notice_count:0,content_notice_breakdown_complete:true}];
  await h.poll(); return h;
}
async function openFinishedSnapshot(h) {
  h.el('nav-history').dataset.openSummaryBatchId = A;
  await h.act('nav-history'); await tick();
  const disclosure = h.el(`history-${A}-disclosure`);
  assert.equal(h.el('run-guide').hidden, true, 'history never exposes an implicit global guide');
  disclosure.open = true; await h.act(disclosure, 'toggle');
  assert.equal(disclosure.open, true, 'the asserted completion stages are explicitly expanded');
}
const fullCopySummary = extra => reviewSummary({recorded_export_count:1,current_exported_count:2,...extra});

async function openHistoryDisclosure(h, batchId) {
  const disclosure = h.el(`history-${batchId}-disclosure`);
  assert.ok(disclosure?.isConnected);
  disclosure.open = true; await h.act(disclosure, 'toggle');
  return disclosure;
}
async function acknowledgedDocumentWorkspace(options = {}) {
  const backend = { rows: documentResponse('markdown-and-anonymize', 2).documents,
    selection: null, operation: null, acknowledged: false };
  const summary = () => fullCopySummary({ approved_count: backend.rows.filter(row => row.approved).length,
    recorded_export_count: backend.selection ? 1 : 0,
    ...(backend.rows.some(row => row.text_modified === true) ? { result_publication: { state: 'pending', generation_id: null,
      count: backend.rows.length, current_revision: Math.max(...backend.rows.map(row => row.revision)) } } : {}),
    current_exported_count: backend.rows.filter(row => backend.selection?.some(saved => saved.document_id === row.document_id &&
      saved.revision === row.revision && saved.output_sha256 === row.output_sha256)).length });
  const h = await finishedAnonymousWorkspace({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return { ...documentResponse('markdown-and-anonymize', 2),
      documents: structuredClone(backend.rows), processing_complete: true, unavailable: [], unclassified_documents: [],
      not_processed_documents: [], content_notice_count: 0, content_notice_breakdown_complete: true, content_notices: [],
      export_receipts: backend.selection ? [{ operation_id: backend.operation, exported_count: 2,
        folder_name: `Export-${backend.operation}`, processing_mode: 'markdown-and-anonymize' }] : [] };
    if (command === 'decide_document_review_batch') {
      assert.equal(args.batchId, A); assert.equal(args.decision.action, 'approve');
      assert.equal(args.decision.selection.length, 2);
      for (const selected of args.decision.selection) {
        const row = backend.rows.find(row => row.document_id === selected.document_id);
        assert.equal(selected.revision, row.revision); assert.equal(selected.output_sha256, row.output_sha256);
        row.revision++; row.approved = true;
      }
      return { ok: true, operation_id: args.decision.operation_id, affected_count: 2,
        documents: structuredClone(backend.rows), local_ui_only: true, external_disclosure: false };
    }
    if (command === 'preview_document_export') return { ok: true, processing_mode: 'markdown-and-anonymize',
      files: args.selection.map((row, index) => ({ name: `Dokument_${index + 1}.md`, sha256: row.output_sha256 })),
      local_ui_only: true, external_disclosure: false };
    if (command === 'export_approved_documents') {
      assert.equal(args.batchId, A);
      if (!args.acknowledge) {
        assert.equal(backend.selection, null, 'exactly one explicit copy');
        backend.selection = structuredClone(args.selection); backend.operation = args.operationId;
      } else {
        assert.equal(args.operationId, backend.operation);
        assert.deepEqual(args.selection, backend.selection); backend.acknowledged = true;
      }
      return { ok: true, operation_id: backend.operation, exported_count: 2,
        folder_name: `Export-${backend.operation}`, local_ui_only: true, external_disclosure: false };
    }
    if (command === 'close_document_reviews') return options.close ? options.close() : { ok: true };
    if (command === 'get_document_review_history_summary') {
      assert.equal(args.batchId, A);
      return options.summary ? options.summary(summary()) : summary();
    }
    return fallback();
  } });
  h.model.entries.push({ ...h.model.entries[0], batch_id: B });
  await h.act('job-action-documents');
  h.el('documents-all').checked = true; await h.act('documents-all', 'change');
  await h.act('documents-approve'); await h.act('documents-approve-proceed'); await tick();
  assert.match(h.el('documents-selected').textContent, /2 angezeigt · 2 Ergebnisdateien verfügbar/u);
  h.el('documents-all').checked = true; await h.act('documents-all', 'change');
  await h.act('documents-export'); await h.act('document-export-confirm'); await tick();
  assert.equal(backend.acknowledged, true);
  assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
  await h.act('document-export-close');
  return { h, backend };
}
function navigationMutations(h) {
  return h.calls.filter(call => ['decide_document_review', 'decide_document_review_batch', 'preview_document_export',
    'export_approved_documents', 'start_admitted_batch', 'continue_history_batch', 'continue_current_batch'].includes(call.command));
}
testAsync('actual RunGuide completion link reconciles only its 2/2 explicitly approved and acknowledged export', async () => {
  const { h, backend } = await acknowledgedDocumentWorkspace();
  const mutations = navigationMutations(h).length;
  await h.act('documents-completion-history'); await tick(); await tick();
  assert.equal(h.el('history-view').hidden, false);
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [A]);
  assert.match(h.el(`history-${A}-state`).textContent, /Ergebnisdateien bereit/u);
  assert.match(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien mit Beleg/u);
  assert.match(h.el(`history-${A}-guide-next`).textContent, /keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.deepEqual(h.el(`history-${A}-guide-stages`).children.map(stage => stage.dataset.status), ['done', 'done', 'done', 'optional']);
  assert.equal(h.el(`history-${B}-summary`).textContent.includes('1 frühere zusätzliche Kopien'), false);
  assert.equal(h.el(`history-${B}-summary`).hidden, true);
  await openHistoryDisclosure(h, A); await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 1,
    'completion navigation, native toggle and unchanged polls share the same fresh read');
  assert.equal(navigationMutations(h).length, mutations);
  const copies = h.calls.filter(call => call.command === 'export_approved_documents');
  assert.equal(copies.length, 2); assert.equal(copies[1].args.acknowledge, true);
  assert.equal(copies[0].args.operationId, backend.operation);
  assert.equal(copies[1].args.operationId, backend.operation);
});
testAsync('actual RunGuide target does not re-read another previously expanded run', async () => {
  const response = { ...documentResponse('markdown-and-anonymize', 2), processing_complete: true,
    content_notice_count: 0, content_notice_breakdown_complete: true, content_notices: [] };
  response.documents.forEach(row => { row.approved = true; });
  const h = await finishedAnonymousWorkspace({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') return response;
    if (command === 'close_document_reviews') return { ok: true };
    return command === 'get_document_review_history_summary' ? fullCopySummary() : fallback();
  } });
  h.model.entries.push({ ...h.model.entries[0], batch_id: B });
  await h.act('nav-history'); await openHistoryDisclosure(h, B);
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [B]);
  await h.act(`history-${A}-documents`); await h.act('documents-completion-history'); await tick(); await tick();
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [B, A]);
  assert.match(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien mit Beleg/u);
  assert.equal(h.el(`history-${B}-summary`).textContent.includes('1 frühere zusätzliche Kopien'), false);
  noAutomaticDecision(h);
});
testAsync('one exact fresh summary owns only its optional metadata; the initial result readiness remains usable', async () => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const h = await finishedAnonymousWorkspace({ invoke: (command, args, fallback) =>
    command === 'get_document_review_history_summary' ? pending : fallback() });
  h.model.entries.push({ ...h.model.entries[0], batch_id: B });
  await h.act('nav-history'); await h.poll();
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.match(h.el(`history-${A}-state`).textContent, /Ergebnisdateien bereit/u);
  for (const [index, status] of [[2, 'done'], [3, 'optional']]) {
    assert.equal(h.el(`history-${A}-guide-stages`).children[index].dataset.status, status);
    assert.equal(h.el(`history-${A}-guide-stages`).children[index].attrs['aria-current'], undefined);
  }
  const disclosure = await openHistoryDisclosure(h, A);
  await h.act(disclosure, 'toggle');
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_history_summary').map(call => call.args.batchId), [A]);
  assert.doesNotMatch(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien/u);
  resolve(fullCopySummary()); await tick(); await tick();
  assert.match(h.el(`history-${A}-guide-title`).textContent, /Anonymisierte Ergebnisse bereit/u);
  assert.match(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien/u);
  assert.equal(h.doc.activeElement, disclosure);
  await h.act(disclosure, 'toggle'); await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 1);
  assert.equal(h.doc.activeElement, disclosure);
  noAutomaticDecision(h);
});
testAsync('actual completion link reads newer revisions instead of upgrading the old ACK into current approval', async () => {
  const { h, backend } = await acknowledgedDocumentWorkspace();
  backend.rows[0].revision++; backend.rows[0].output_sha256 = 'd'.repeat(64); backend.rows[0].approved = false; backend.rows[0].text_modified = true;
  const mutations = navigationMutations(h).length;
  await h.act('documents-completion-history'); await tick(); await tick();
  assert.match(h.el(`history-${A}-state`).textContent, /nicht bestätigt/u);
  assert.doesNotMatch(h.el(`history-${A}-guide-next`).textContent, /kein weiterer Export nötig/u);
  assert.equal(h.el(`history-${A}-guide-stages`).children[2].dataset.status, 'current');
  assert.equal(h.el(`history-${A}-guide-stages`).children[3].dataset.status, 'optional');
  assert.equal(h.el(`history-${A}-results`).disabled, true);
  assert.equal(navigationMutations(h).length, mutations);
});
testAsync('superseding an actual completion-link native close cannot leave a later automatic history request', async () => {
  let finishClose;
  const { h } = await acknowledgedDocumentWorkspace({ close: () => new Promise(resolve => { finishClose = resolve; }) });
  const mutations = navigationMutations(h).length;
  await h.act('documents-completion-history'); await h.act('nav-settings');
  finishClose({ ok: true }); await tick(); await tick();
  assert.equal(h.el('settings-view').hidden, false);
  await h.act('nav-history');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.equal(navigationMutations(h).length, mutations);
});
testAsync('actual completion-link failed summary stays neutral and explicit reload alone can establish the current receipt', async () => {
  let fail = true;
  const { h } = await acknowledgedDocumentWorkspace({ summary: data => {
    if (fail) throw Error('STANDALONE_IPC_TIMEOUT'); return data;
  } });
  await h.act('documents-completion-history'); await tick(); await tick();
  assert.match(h.el(`history-${A}-summary`).textContent, /Ergebnisstatus nicht verfügbar/u);
  assert.doesNotMatch(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien/u);
  for (const [index, status] of [[2, 'done'], [3, 'optional']]) assert.equal(h.el(`history-${A}-guide-stages`).children[index].dataset.status, status);
  const mutations = navigationMutations(h).length;
  fail = false; await h.act(`history-${A}-summary-reload`);
  assert.match(h.el(`history-${A}-summary`).textContent, /1 frühere zusätzliche Kopien/u);
  assert.equal(navigationMutations(h).length, mutations);
});
for (const transition of ['navigation', 'connection', 'generation', 'stale'])
testAsync(`explicit disclosure cannot adopt a ${transition} retired or incompatible summary`, async () => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const h = await finishedAnonymousWorkspace({ invoke: (command, args, fallback) =>
    command === 'get_document_review_history_summary' ? pending : fallback() });
  await h.act('nav-history'); await openHistoryDisclosure(h, A);
  if (transition === 'navigation') await h.act('nav-settings');
  if (transition === 'connection') h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } });
  if (transition === 'generation') await h.act(`history-${A}-results`);
  resolve(fullCopySummary(transition === 'stale' ? { processing_mode: 'markdown-only' } : {}));
  await tick(); await tick();
  assert.doesNotMatch(h.el('history-list').textContent, /Export mit Abschlussbeleg|kein weiterer Export nötig/u);
  assert.notEqual(h.el(`history-${A}-guide-stages`)?.children[3].dataset.status, 'done');
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 1);
  noAutomaticDecision(h);
});

// Actual workspace + document renderer, with explicit native DTO models.
// Approval remains an explicit user action. No native process or GUI claim.
async function documentApprovalWorkspace({ approved = false, omitted = 0, privacyStops = 0, resultCount = 1 } = {}) {
  const rows = documentResponse('markdown-and-anonymize', resultCount).documents.map(row => ({ ...row, approved }));
  const backend = { rows, failReload: false, deferReload: null };
  const h = await finishedAnonymousWorkspace({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') {
      if (backend.failReload) throw Error('DOCUMENT_REVIEW_INVALID');
      const data = { local_ui_only: true, external_disclosure: false, processing_mode: 'markdown-and-anonymize',
        processing_complete: true, documents: structuredClone(backend.rows), unavailable: [], unclassified_documents: [],
        not_processed_documents: [], content_notice_count: 0, content_notice_breakdown_complete: true, content_notices: [] };
      return backend.deferReload ? backend.deferReload(data) : data;
    }
    if (command === 'decide_document_review') {
      assert.equal(args.batchId, A);
      const row = backend.rows.find(row => row.document_id === args.documentId);
      assert.equal(args.decision.revision, row.revision); assert.equal(args.decision.output_sha256, row.output_sha256);
      assert.ok(['approve', 'revoke'].includes(args.decision.action));
      row.revision++; row.approved = args.decision.action === 'approve';
      return { ok: true, ...structuredClone(row), local_ui_only: true, external_disclosure: false };
    }
    if (command === 'close_document_reviews') return { ok: true };
    return fallback();
  } }, omitted, privacyStops, resultCount);
  await h.act('job-action-documents');
  return { h, backend };
}
function assertNoExportOrRestart(h) {
  assert.equal(h.calls.some(call => ['preview_document_export', 'export_approved_documents',
    'continue_history_batch', 'continue_current_batch', 'continue_review_session', 'start_admitted_batch'].includes(call.command)), false);
}
testAsync('actual optional editor and nav-details preserve ready files without a second approval/export action', async () => {
  const { h } = await documentApprovalWorkspace();
  assert.match(h.el('run-guide-title').textContent, /Anonymisierte Ergebnisse bereit/u);
  assert.equal(h.el('documents-approval-extras').hidden, true);
  assert.equal(h.el('documents-export').hidden, true);
  assert.match(h.el('documents-selected').textContent, /1 angezeigt · 1 Ergebnisdateien verfügbar/u);
  assert.equal(h.el('run-guide-stages').children[2].dataset.status, 'done');
  assert.equal(h.el('run-guide-stages').children[3].dataset.status, 'optional');
  await h.act('nav-details'); await tick();
  selectedRun(h, A); assert.equal(h.el('documents-view').hidden, true);
  assert.match(h.el('job-description').textContent, /Ergebnisordner öffnen/u);
  assert.doesNotMatch(h.el('job-description').textContent, /noch vergleichen und freigeben|kein weiterer Export nötig|Export abgeschlossen/u);
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  assert.match(h.el('job-announcement').textContent, /Ergebnisordner öffnen/u);
  await h.poll();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 0);
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: freshly loaded approvals can improve the retained job, not copied status', async () => {
  const { h } = await documentApprovalWorkspace({ approved: true, resultCount: 2 });
  await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  assert.doesNotMatch(h.el('job-description').textContent, /kein weiterer Export nötig|noch vergleichen und freigeben/u);
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false); assertNoExportOrRestart(h);
});
for (const patch of [
  { fresh: false }, { busy: true }, { dirty: true }, { processing_complete: false },
  { document_count: 2 }, { approved_count: 0 }, { result_count: 2 }, { problem_count: 1 },
  { expected_omission_count: 1 }, { review_policy: 'automatic-conservative' },
  { export_pending: true }, { export_complete: true }
]) testAsync('document approval snapshot: superseding unconfirmed/incompatible metadata retires approval ' + JSON.stringify(patch), async () => {
  const { h } = await documentApprovalWorkspace({ approved: true });
  h.window.__DATASECURE_RUN_GUIDE__.documents({ batch_id: A, source: 'documents', processing_mode: 'markdown-and-anonymize',
    fresh: true, busy: false, dirty: false, processing_complete: true, document_count: 1, result_count: 1, approved_count: 1,
    problem_count: 0, expected_omission_count: 0, export_pending: false, export_complete: false,
    content_notice_count: 0, content_notice_breakdown_complete: true, ...patch });
  // Boundary-only metadata probe. Actual renderer lifecycle/ACK behavior is
  // covered above and below; its internal busy/draft state is not overwritten.
  await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  assert.doesNotMatch(h.el('job-description').textContent, /Freigegebene Dokumente auswählen|kein weiterer Export nötig/u);
  assertNoExportOrRestart(h);
});
for (const state of ['processing', 'paused', 'failed', 'export_pending'])
testAsync('document approval snapshot: a later public ' + state + ' cannot retain approval for the job', async () => {
  const { h } = await documentApprovalWorkspace({ approved: true });
  h.model.state = { ...h.model.state, state }; await h.poll(); await h.act('nav-details'); await tick();
  assert.doesNotMatch(h.el('job-description').textContent, /Freigegebene Dokumente auswählen|kein weiterer Export nötig/u);
  assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: actual reload with revocation retires the former approval', async () => {
  const { h, backend } = await documentApprovalWorkspace({ approved: true });
  backend.rows[0].approved = false; backend.rows[0].revision++;
  await h.act('documents-reload'); await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)'); assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: failed actual reload retires the former approval', async () => {
  const { h, backend } = await documentApprovalWorkspace({ approved: true });
  backend.failReload = true; await h.act('documents-reload'); await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)'); assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: connection retirement and late actual reload cannot restore old approval', async () => {
  const { h, backend } = await documentApprovalWorkspace({ approved: true });
  let finish; backend.deferReload = data => new Promise(resolve => { finish = () => resolve(data); });
  await h.act('documents-reload');
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'recovering' } });
  finish(); await tick(); await tick();
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } }); await h.poll();
  await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)'); assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: another run cannot relabel the retained job', async () => {
  const { h } = await documentApprovalWorkspace({ approved: true });
  await h.act('nav-history'); await tick();
  h.model.entries.push({ ...h.model.entries[0], batch_id: B }); await h.act('refresh-history');
  await h.act('history-' + B + '-documents'); await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)'); assertNoExportOrRestart(h);
});
testAsync('document approval snapshot: ordinary command generation retires the display-only approval', async () => {
  const { h } = await documentApprovalWorkspace({ approved: true });
  await h.act('nav-details'); await tick(); await h.act('job-action-results');
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)'); assertNoExportOrRestart(h);
});
for (const exceptions of [{ omitted: 1 }, { privacyStops: 1 }])
testAsync('document approval snapshot: partial-source runs still require the existing classified history contract ' + JSON.stringify(exceptions), async () => {
  const { h } = await documentApprovalWorkspace({ approved: true, ...exceptions });
  await h.act('nav-details'); await tick();
  assert.equal(h.el('job-action-documents').textContent, 'Nachbearbeitung öffnen (optional)');
  assert.match(h.el('job-description').textContent, /1 Datei mit Problemen/u);
  assertNoExportOrRestart(h);
});

testAsync('bound history snapshot: the actual guide, completion warning and nav-details job agree after a confirmed copy', async () => {
  const h = await finishedAnonymousWorkspace({ invoke:(command,args,fallback) =>
    command === 'get_document_review_history_summary' ? fullCopySummary() : fallback() });
  await openFinishedSnapshot(h);
  assert.match(h.el('history-' + A + '-guide-title').textContent,/Anonymisierte Ergebnisse bereit/u);
  assert.match(h.el('history-' + A + '-guide-next').textContent,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.equal(h.el('history-' + A + '-guide-stages').children[2].dataset.status,'done');
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  const row = h.el('history-list').children[0];
  assert.doesNotMatch(row.textContent,/Freigabe- und Exportstand sind noch nicht abgeglichen/u);
  await h.act(`history-${A}-details`);
  assert.match(h.el('job-description').textContent,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.doesNotMatch(h.el('job-description').textContent,/noch vergleichen und freigeben/u);
  assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');
  assert.notEqual(h.el('job-action-documents').className,'primary');
  assert.match(h.el('job-announcement').textContent,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  const statusReads = h.calls.filter(call=>call.command==='get_public_state').length;
  await h.poll();
  assert.ok(h.calls.filter(call=>call.command==='get_public_state').length>statusReads);
  assert.match(h.el('job-description').textContent,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  noAutomaticDecision(h);
});

testAsync('terminal announcements: exported predecessor stays silent through a new Markdown draft and cancelled extra picker, then returns neutral once', async () => {
  let picks = 0;
  const draft = [{ name: 'Draft.txt', source_id: id(21), bytes: 9, selectable: true }];
  const h = await finishedAnonymousWorkspace({ catalogue: draft, invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return fullCopySummary();
    if (command === 'select_files' && ++picks === 2) return { cancelled: true };
    return fallback();
  } });
  await openFinishedSnapshot(h); await h.act(`history-${A}-details`);
  const region = h.el('job-announcement');
  assert.match(region.textContent, /keine zusätzliche Freigabe oder Exportbestätigung/u);
  const departing = region.textHistory.length;
  await h.act('nav-new');
  assert.deepEqual(region.textHistory.slice(departing), [''], 'leaving clears the old terminal announcement without a transient replacement');
  h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
  await h.act('select-files');
  assert.equal(h.el('selection-count').textContent, '1 von 1 ausgewählt');
  await h.act('add-more'); await h.act('add-files');
  assert.equal(picks, 2);
  assert.equal(h.el('selection-count').textContent, '1 von 1 ausgewählt');
  assert.equal(h.el(`source-${id(21)}`).checked, true);
  assert.equal(h.el('mode-markdown').checked, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'false');
  const reads = h.calls.filter(call => call.command === 'get_public_state').length;
  await h.poll(); await h.poll();
  assert.ok(h.calls.filter(call => call.command === 'get_public_state').length > reads);
  assert.equal(region.textContent, '');
  assert.deepEqual(region.textHistory.slice(departing), [''], 'accepted intake, cancellation and polling cannot announce the retained predecessor');
  assert.equal(h.calls.filter(call => call.command === 'cancel_admission').length, 0);
  const returning = region.textUpdates;
  await h.act('nav-details'); selectedRun(h, A);
  assert.equal(h.el('job').hidden, false, 'the predecessor job itself is retained');
  assert.equal(region.textUpdates, returning + 1);
  assert.match(region.textContent, /Ergebnisordner öffnen/u);
  assert.doesNotMatch(region.textContent, /noch vergleichen und freigeben|kein weiterer Export nötig/u,
    'the invalidated export snapshot is neither preserved nor turned into a missing-approval claim');
  await h.poll(); await h.act('nav-details');
  assert.equal(region.textUpdates, returning + 1, 'unchanged visible status is announced exactly once');
  await h.act('nav-new');
  const immediateReturn = region.textUpdates;
  await h.act('nav-details');
  assert.equal(region.textUpdates, immediateReturn + 1, 'return also announces once without an intervening hidden poll');
  await h.act('nav-new');
  assert.equal(h.el('selection-count').textContent, '1 von 1 ausgewählt');
  assert.equal(h.el('mode-markdown').checked, true);
  assertNoExportOrRestart(h);
});

for (const destination of ['history', 'settings']) testAsync(`terminal announcements: departing to ${destination} cannot transiently announce snapshot invalidation in the former Details view`, async () => {
  const h = await finishedAnonymousWorkspace({ invoke: (command, args, fallback) =>
    command === 'get_document_review_history_summary' ? fullCopySummary() : fallback() });
  await openFinishedSnapshot(h); await h.act(`history-${A}-details`);
  const region = h.el('job-announcement');
  assert.match(region.textContent, /keine zusätzliche Freigabe oder Exportbestätigung/u);
  const before = region.textHistory.length;
  await h.act('nav-' + destination); await h.poll();
  assert.equal(region.textContent, '');
  assert.deepEqual(region.textHistory.slice(before), [''], 'clearRunReview must use the destination before view assignment');
  assertNoExportOrRestart(h);
});

for (const state of ['results_available', 'completed_without_results', 'export_abandoned', 'failed'])
testAsync(`terminal announcements: ${state} is scoped to the visible owned card and reannounced once on return`, async () => {
  const h = await finishedAnonymousWorkspace();
  h.model.state = { ...h.model.state, state }; await h.poll();
  await h.act('nav-history'); await h.act(`history-${A}-details`);
  const region = h.el('job-announcement');
  assert.ok(region.textContent);
  const before = region.textHistory.length;
  await h.act('nav-new'); await h.poll();
  assert.deepEqual(region.textHistory.slice(before), ['']);
  const returning = region.textUpdates;
  await h.act('nav-details');
  assert.equal(region.textUpdates, returning + 1);
  await h.poll();
  assert.equal(region.textUpdates, returning + 1);
  assertNoExportOrRestart(h);
});

testAsync('terminal announcements: a foreign historical Details card cannot announce the retained current job', async () => {
  const h = await finishedAnonymousWorkspace({ invoke: (command, args, fallback) =>
    command === 'get_document_review_history_summary'
      ? { ok: true, local_ui_only: true, external_disclosure: false, available: false } : fallback() });
  h.model.entries.push({ ...h.model.entries[0], batch_id: B });
  await h.act('nav-history'); await h.act(`history-${A}-details`);
  const region = h.el('job-announcement'), before = region.textHistory.length;
  await h.act('nav-history'); await h.act(`history-${B}-details`); selectedRun(h, B);
  assert.equal(h.el('job').hidden, true);
  await h.poll();
  assert.equal(region.textContent, '');
  assert.deepEqual(region.textHistory.slice(before), ['']);
  await h.act('nav-history');
  const returning = region.textUpdates;
  await h.act(`history-${A}-details`); selectedRun(h, A);
  assert.equal(h.el('job').hidden, false);
  assert.equal(region.textUpdates, returning + 1);
  await h.poll(); assert.equal(region.textUpdates, returning + 1);
  assertNoExportOrRestart(h);
});

testAsync('terminal announcements: the actual acknowledged copy receipt hides the job card and keeps its old terminal poll silent', async () => {
  const response = documentResponse('markdown-and-anonymize', 2);
  response.processing_complete = true;
  for (const row of response.documents) row.approved = true;
  const h = await finishedAnonymousWorkspace({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return fullCopySummary();
    if (command === 'get_document_reviews') return response;
    if (command === 'close_document_reviews') return { ok: true };
    if (command === 'preview_document_export') return { ok: true, processing_mode: 'markdown-and-anonymize',
      files: args.selection.map((row, index) => ({ name: `Dokument_${index + 1}.md`, sha256: row.output_sha256 })),
      local_ui_only: true, external_disclosure: false };
    if (command === 'export_approved_documents') return { ok: true, operation_id: args.operationId, exported_count: 2,
      folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false };
    return fallback();
  } });
  await h.act('nav-history'); await h.act(`history-${A}-details`);
  const region = h.el('job-announcement'), before = region.textHistory.length;
  await h.act('job-action-documents');
  h.el('documents-all').checked = true; await h.act('documents-all', 'change');
  await h.act('documents-export'); await h.act('document-export-confirm'); await tick();
  assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
  await h.act('document-export-close'); await h.act('documents-completion-details'); await tick();
  selectedRun(h, A);
  assert.equal(h.el('details-receipt').hidden, false);
  assert.equal(h.el('job').hidden, true);
  await h.poll(); await h.act('nav-new'); await h.poll(); await h.act('nav-details'); await h.poll();
  assert.equal(h.el('details-receipt').hidden, false);
  assert.equal(h.el('job').hidden, true);
  assert.equal(region.textContent, '');
  assert.deepEqual(region.textHistory.slice(before), ['']);
  const copies = h.calls.filter(call => call.command === 'export_approved_documents');
  assert.equal(copies.length, 2, 'only the explicitly requested copy and its exact ACK were sent');
  assert.equal(copies[1].args.acknowledge, true);
  assert.equal(copies[0].args.operationId, copies[1].args.operationId);
  assert.equal(h.calls.some(call => ['decide_document_review', 'start_admitted_batch', 'continue_history_batch'].includes(call.command)), false);
});

for (const [state, text] of [['preparing', /vorbereitet/iu], ['processing', /Pause angefordert/u],
  ['review_required', /Entscheidung/u], ['paused', /pausiert/iu], ['export_pending', /Bereitstellung/iu],
  ['ready', /Kein aktiver Lauf/u], ['start_failed', /Lokaler Start nicht bestätigt/u]])
testAsync(`terminal announcement scoping leaves ${state} background warnings unchanged`, async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-new');
  const region = h.el('job-announcement'), before = region.textUpdates;
  h.model.state = { ...h.model.state, state, ...(state === 'processing' ? { pause_requested: true } : {}),
    ...(state === 'review_required' ? { review_count: 1 } : {}),
    ...(state === 'start_failed' ? { intake_failure: { intake_id: A, error_code: 'STANDALONE_START_FAILED', worker_active: true } } : {}) };
  await h.poll();
  assert.equal(h.el('new-view').hidden, false);
  assert.match(region.textContent, text);
  assert.equal(region.textUpdates, before + 1);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'continue_current_batch'].includes(call.command)), false);
});

testAsync('terminal announcement scoping preserves the first real background processing error without repeating each count', async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-new');
  const region = h.el('job-announcement'), before = region.textUpdates;
  h.model.state = { ...h.model.state, failed_count: 1 }; await h.poll();
  assert.match(region.textContent, /Dateien mit Hinweisen/u);
  assert.equal(region.textUpdates, before + 1);
  h.model.state = { ...h.model.state, failed_count: 2 }; await h.poll();
  assert.equal(region.textUpdates, before + 1);
  assert.equal(h.el('new-view').hidden, false);
});

for (const destination of ['history', 'settings']) testAsync(`terminal announcements: a running job still announces its first real background completion in ${destination} once`, async () => {
  const h = harness(); await selectAndStart(h); await h.act('nav-' + destination);
  const region = h.el('job-announcement'), before = region.textHistory.length;
  h.model.state = { ...h.model.state, state: 'results_available', completed_count: 3,
    result_count: 3, results_available: true, batch_complete: true };
  await h.poll();
  assert.equal(h.el(destination + '-view').hidden, false);
  assert.match(region.textContent, /Textübernahme abgeschlossen/u,
    'the first genuine terminal transition is not a stale snapshot replay');
  const completion = region.textContent;
  await h.poll(); await h.poll();
  assert.deepEqual(region.textHistory.slice(before).filter(Boolean), [completion],
    'background polling cannot repeat the terminal phase');
  const returning = region.textUpdates;
  await h.act('nav-details');
  assert.equal(region.textUpdates, returning + 1, 'the same retained card still announces once on explicit return');
  await h.poll(); assert.equal(region.textUpdates, returning + 1);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'continue_current_batch'].includes(call.command)), false);
});

testAsync('bound history snapshot: fresh approvals without a current copy improve both views, not to export success', async () => {
  const h = await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>
    command==='get_document_review_history_summary'?fullCopySummary({current_exported_count:0}):fallback()});
  await openFinishedSnapshot(h);
  assert.equal(h.el('history-' + A + '-guide-stages').children[2].dataset.status,'done');
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  await h.act('nav-details');
  assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');
  assert.doesNotMatch(h.el('job-description').textContent,/noch vergleichen und freigeben|kein weiterer Export nötig/u);
  noAutomaticDecision(h);
});
testAsync('bound history snapshot: a pending copy never becomes export success despite complete older receipts', async () => {
  const h = await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'
    ?fullCopySummary({pending_export_count:1,pending_confirmation_count:1}):fallback()});
  await openFinishedSnapshot(h);
  assert.match(h.el('history-' + A + '-summary').textContent,/offener Empfangsbestätigung/u);
  assert.match(h.el('history-' + A + '-guide-next').textContent,/keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  await h.act('nav-details'); assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');
  noAutomaticDecision(h);
});
testAsync('bound history snapshot: failed reload removes guide, job and completion-footer success together', async () => {
  let fail = false;
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>{
    if(command==='get_document_review_history_summary'){if(fail)throw Error('STANDALONE_IPC_TIMEOUT');return fullCopySummary()}
    return fallback();
  }});await openFinishedSnapshot(h);
  assert.match(h.el('history-' + A + '-summary').textContent,/1 frühere zusätzliche Kopien mit Beleg/u);
  fail=true;await h.act('history-'+A+'-summary-reload');
  assert.doesNotMatch(h.el('history-list').textContent,/2\/2 freigegeben · Export mit Abschlussbeleg/u,
    'the stable primary folder action must not retain a previous positive summary after failed reload');
  assert.equal(h.el('history-'+A+'-results').textContent,'Ergebnisordner öffnen');
  assert.equal(h.el('history-'+A+'-results').className,'primary');
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  assert.match(h.el('history-' + A + '-summary').textContent,/Ergebnisstatus nicht verfügbar/u);
  await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);
  assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');noAutomaticDecision(h);
});
testAsync('bound history snapshot: another run summary cannot improve the current run or its job', async () => {
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?fullCopySummary():fallback()});
  h.model.entries.push({...h.model.entries[0],batch_id:B});await h.act('nav-history');await toggleHistorySummary(h, B);
  assert.equal(h.el('run-guide').hidden, true);
  assert.match(h.el('history-' + B + '-guide-title').textContent,/Anonymisierte Ergebnisse bereit/u);
  assert.match(h.el('history-' + B + '-summary').textContent,/1 frühere zusätzliche Kopien mit Beleg/u);
  assert.equal(h.el('history-' + A + '-summary').textContent.includes('1 frühere zusätzliche Kopien'),false);
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
});
for(const state of ['processing','paused','failed','export_pending']) testAsync('bound history snapshot: '+state+' current status overrides an older finished history snapshot',async()=>{
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?fullCopySummary():fallback()});
  h.model.state={...h.model.state,state};await h.poll();await openFinishedSnapshot(h);
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  assert.notEqual(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'done');
  await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
});
for(const transition of ['navigation','connection','generation']) testAsync('bound history snapshot: late response after '+transition+' cannot promote the guide or job',async()=>{
  let resolve;const pending=new Promise(yes=>{resolve=yes});
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?pending:fallback()});
  await openFinishedSnapshot(h);
  if(transition==='navigation')await h.act('nav-new');
  else if(transition==='connection'){h.listeners.get('datasecure-connection')({payload:{epoch:1,state:'recovering'}});await tick()}
  else { await h.act('history-'+A+'-more'); await h.act('history-'+A+'-results'); }
  resolve(fullCopySummary());await tick();await tick();
  assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);
  assert.ok(h.el('run-guide').hidden||h.el('history-' + A + '-guide-stages').children[3].dataset.status!=='done');noAutomaticDecision(h);
});
testAsync('bound history snapshot: entering the actual document renderer retires the cached current-approval projection',async()=>{
  let opened=false;
  const h=await finishedAnonymousWorkspace({documentRenderer:true,invoke:(command,args,fallback)=>{
    if(command==='get_document_review_history_summary')return fullCopySummary(opened?{approved_count:0,current_exported_count:0}:{});
    if(command==='get_document_reviews'){opened=true;return {...documentResponse('markdown-and-anonymize',2),processing_complete:true,content_notice_count:0,content_notice_breakdown_complete:true,content_notices:[]}}
    return fallback();
  }});
  await openFinishedSnapshot(h);await h.act('history-'+A+'-documents');
  assert.equal(h.el('documents-view').hidden,false);await h.act('documents-back');await tick();
  await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
});

testAsync('bound history snapshot: a higher native Ready immediately retires the previous connection snapshot',async()=>{
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?fullCopySummary():fallback()});
  await openFinishedSnapshot(h);
  h.listeners.get('datasecure-connection')({payload:{epoch:1,state:'ready'}});await tick();
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
});

testAsync('bound history snapshot: retired read cannot publish or release a successor read after higher Ready',async()=>{
  let reads=0,resolveOld,resolveFresh;
  const oldRead=new Promise(resolve=>{resolveOld=resolve}),freshRead=new Promise(resolve=>{resolveFresh=resolve});
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'
    ?++reads===1?fullCopySummary():reads===2?oldRead:freshRead:fallback()});
  await openFinishedSnapshot(h);
  await h.act('history-'+A+'-summary-reload');
  h.listeners.get('datasecure-connection')({payload:{epoch:1,state:'ready'}});await tick();
  assert.doesNotMatch(h.el('history-'+A+'-guide-next').textContent,/kein weiterer Export nötig/u);
  await h.act('history-'+A+'-summary-reload');assert.equal(reads,3,'replacement connection can perform its own read');
  resolveOld(fullCopySummary());await tick();
  assert.doesNotMatch(h.el('history-'+A+'-guide-next').textContent,/kein weiterer Export nötig/u);
  assert.equal(h.el('history-'+A+'-summary').attrs['aria-busy'],'true','retired finally cannot release successor');
  assert.equal(h.el('history-'+A+'-summary-reload').disabled,true);
  resolveFresh(fullCopySummary({approved_count:0,current_exported_count:0,recorded_export_count:0}));await tick();
  assert.equal(h.el('history-'+A+'-summary-reload').disabled,false);
  assert.equal(h.el('history-'+A+'-guide-stages').children[3].dataset.status,'optional');
  const statusReads=h.calls.filter(call=>call.command==='get_public_state').length;
  await h.poll();assert.ok(h.calls.filter(call=>call.command==='get_public_state').length>statusReads,'retired ownership cannot block later polling');
  noAutomaticDecision(h);
});
testAsync('bound history snapshot: loading and unavailable metadata cannot retain earlier success',async()=>{
  let resolve,reads=0;const pending=new Promise(yes=>{resolve=yes});
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?(++reads===1?fullCopySummary():pending):fallback()});
  await openFinishedSnapshot(h);await h.act('history-'+A+'-summary-reload');
  assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig/u);
  assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);
  resolve({ok:true,local_ui_only:true,external_disclosure:false,available:false});await tick();
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');noAutomaticDecision(h);
});

testAsync('bound history snapshot: the actual 3-source 2-result OCR-off completion stays yellow and closes only its two result revisions',async()=>{
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'
    ?fullCopySummary({not_processed_count:1}):fallback()},1);
  assert.equal(h.model.state.selected_count,3);assert.equal(h.model.state.completed_count,3);
  assert.equal(h.model.state.result_count,2);assert.equal(h.model.state.failed_count,1);
  assert.equal(Object.hasOwn(h.model.state,'expected_ocr_omission_count'),false,'public status has no invented omission classifier');
  await openFinishedSnapshot(h);
  assert.equal(h.calls.filter(call=>call.command==='get_document_review_history_summary').at(-1).args.batchId,A);
  assert.match(h.el('history-' + A + '-guide-title').textContent,/Anonymisierte Ergebnisse bereit/u);
  assert.match(h.el('history-' + A + '-guide-counts').textContent,/2 Ergebnisdateien.*2 von 3 Quellen.*1 ohne OCR nicht umgewandelt/u);
  assert.equal(h.el('history-' + A + '-guide-stages').children[0].dataset.status,'warning','existing CSS renders warning yellow');
  for(const index of [1,2])assert.equal(h.el('history-' + A + '-guide-stages').children[index].dataset.status,'done');
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  assert.match(h.el('history-' + A + '-guide-next').textContent,/keine zusätzliche Freigabe oder Exportbestätigung.*1 Bild- oder Scan-Datei.*nicht umgewandelt/u);
  assert.match(h.el('history-' + A + '-guide-next').textContent,/nicht verarbeitete Quelle ist nicht in den Ergebnisdateien enthalten/u);
  assert.equal(h.el('history-list').children[0].dataset.outcome,'partial');
  assert.match(h.el('history-list').textContent,/1 ohne OCR nicht umgewandelt/u);
  await h.act('nav-details');
  assert.match(h.el('job-title').textContent,/abgeschlossen mit Hinweisen/u);assert.match(h.el('job-icon').textContent,/!/u);
  assert.match(h.el('job-description').textContent,/keine zusätzliche Freigabe oder Exportbestätigung.*1 Bild- oder Scan-Datei.*nicht umgewandelt/u);
  assert.doesNotMatch(h.el('job-description').textContent,/noch vergleichen und freigeben|1 Datei mit Problemen|3 verfügbaren Ergebnisstände/u);
  assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');
  assert.equal(h.el('job-description').className,'run-notice','existing warning styling keeps the omitted source visibly yellow on nav-details');
  await h.poll();assert.equal(h.el('job-description').className,'run-notice');
  assert.equal(h.el('file-problems').hidden,false,'the omitted source notice remains reachable');
  noAutomaticDecision(h);
});
for(const kind of ['missing-ledger','unavailable','unknown','old-copy','pending','technical','status-count-mismatch'])
  testAsync('bound history snapshot: 2-of-3 '+kind+' never becomes all-clear or a 3-source export claim',async()=>{
    const data=fullCopySummary({not_processed_count:1});
    if(kind==='missing-ledger')delete data.not_processed_count;
    if(kind==='unavailable'){data.reviewable_count=1;data.approved_count=1;data.current_exported_count=1;data.unavailable_count=1}
    if(kind==='unknown'){data.reviewable_count=1;data.approved_count=1;data.current_exported_count=1;data.unclassified_source_count=1}
    if(kind==='old-copy')data.current_exported_count=0;
    if(kind==='pending'){data.pending_export_count=1;data.pending_confirmation_count=1}
    const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?data:fallback()},1);
    if(kind==='technical')delete h.model.entries[0].expected_ocr_omission_count;
    if(kind==='status-count-mismatch'){h.model.state={...h.model.state,result_count:1};await h.poll()}
    await openFinishedSnapshot(h);
    assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig|3 verfügbaren Ergebnisstände|3 von 3.*freigegeben/u);
    assert.notEqual(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'done');
    await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
  });

testAsync('bound history snapshot: a different public run permanently retires the 2-of-3 snapshot before the old run returns',async()=>{
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'
    ?fullCopySummary({not_processed_count:1}):fallback()},1);
  await openFinishedSnapshot(h);await h.act('nav-details');const saved={...h.model.state};
  h.model.state={...saved,batch_id:B};await h.poll();
  assert.equal(h.el('job-description').className,'muted');
  h.model.state=saved;await h.poll();
  assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);
  assert.equal(h.el('job-description').className,'muted');noAutomaticDecision(h);
});

for(const [results,ocr,privacy]of [[2,0,1],[115,17,1]])testAsync('bound history snapshot: actual classified completion '+[results,ocr,privacy].join('/')+' keeps every stopped source excluded and yellow',async()=>{
  const stopped=ocr+privacy,total=results+stopped;
  const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'
    ?fullCopySummary({reviewable_count:results,approved_count:results,current_exported_count:results,not_processed_count:stopped}):fallback()},ocr,privacy,results);
  assert.equal(h.model.state.selected_count,total);assert.equal(h.model.state.completed_count,total);
  assert.equal(h.model.state.result_count,results);assert.equal(h.model.state.failed_count,stopped);
  assert.equal(Object.hasOwn(h.model.state,'expected_ocr_omission_count'),false);
  assert.equal(Object.hasOwn(h.model.state,'privacy_stop_count'),false);
  await openFinishedSnapshot(h);
  assert.equal(h.calls.filter(call=>call.command==='get_document_review_history_summary').at(-1).args.batchId,A);
  assert.match(h.el('history-' + A + '-guide-title').textContent,/Anonymisierte Ergebnisse bereit/u);
  assert.match(h.el('history-' + A + '-guide-counts').textContent,new RegExp(results+' Ergebnisdateien','u'));
  assert.match(h.el('history-' + A + '-guide-counts').textContent,new RegExp(results+' von '+total+' Quellen als Ergebnis verfügbar','u'));
  assert.match(h.el('history-' + A + '-guide-counts').textContent,new RegExp(privacy+' aus Datenschutzgründen angehalten','u'));
  for(const index of [0,1])assert.equal(h.el('history-' + A + '-guide-stages').children[index].dataset.status,'warning');
  assert.equal(h.el('history-' + A + '-guide-stages').children[2].dataset.status,'done');
  assert.equal(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'optional');
  assert.match(h.el('history-' + A + '-guide-next').textContent,/keine zusätzliche Freigabe oder Exportbestätigung.*aus Datenschutzgründen angehalten/u);
  assert.match(h.el('history-' + A + '-guide-next').textContent,stopped===1?/nicht verarbeitete Quelle ist nicht in den Ergebnisdateien enthalten/u:
    new RegExp(stopped+' nicht verarbeiteten Quellen sind nicht in den Ergebnisdateien enthalten','u'));
  assert.equal(h.el('history-list').children[0].dataset.outcome,'partial');
  assert.match(h.el('history-list').textContent,new RegExp(privacy+' aus Datenschutzgründen angehalten','u'));
  await h.act('nav-details');
  assert.equal(h.el('job-description').className,'run-notice');assert.match(h.el('job-title').textContent,/abgeschlossen mit Hinweisen/u);
  assert.match(h.el('job-description').textContent,new RegExp(results+' technisch geprüfte anonymisierte Ergebnisse verfügbar.*keine zusätzliche Freigabe oder Exportbestätigung','u'));
  assert.match(h.el('job-description').textContent,/aus Datenschutzgründen angehalten.*keinen freigabefähigen Prüfstand/u);
  assert.doesNotMatch(h.el('job-description').textContent,new RegExp(total+' verfügbaren Ergebnisstände|'+stopped+' Dateien mit Problemen|noch vergleichen und freigeben','u'));
  if(ocr)assert.match(h.el('job-description').textContent,new RegExp(ocr+' Bild- oder Scan-Dateien.*nicht umgewandelt','u'));
  assert.equal(h.el('job-action-documents').textContent,'Nachbearbeitung öffnen (optional)');assert.equal(h.el('file-problems').hidden,false);
  noAutomaticDecision(h);
});
for(const kind of ['technical-remainder','unknown-reason','legacy-classification','incoherent-ledger','unavailable-result','old-copy','pending-copy'])
  testAsync('bound history snapshot: mixed OCR/privacy '+kind+' cannot become an all-clear completion',async()=>{
    const data=fullCopySummary({reviewable_count:115,approved_count:115,current_exported_count:115,not_processed_count:18});
    if(kind==='incoherent-ledger')data.not_processed_count=17;
    if(kind==='unavailable-result'){data.reviewable_count=114;data.approved_count=114;data.current_exported_count=114;data.unavailable_count=1}
    if(kind==='old-copy')data.current_exported_count=114;
    if(kind==='pending-copy'){data.pending_export_count=1;data.pending_confirmation_count=1}
    const h=await finishedAnonymousWorkspace({invoke:(command,args,fallback)=>command==='get_document_review_history_summary'?data:fallback()},17,1,115);
    if(kind==='technical-remainder'){
      h.model.entries[0]={...h.model.entries[0],selected_count:134,completed_count:134,failed_count:19};data.not_processed_count=19;
      h.model.state={...h.model.state,selected_count:134,completed_count:134,failed_count:19};await h.poll();
    }
    if(kind==='unknown-reason')delete h.model.entries[0].privacy_stop_count;
    if(kind==='legacy-classification')h.model.entries[0].failure_reason_breakdown_complete=false;
    await openFinishedSnapshot(h);
    assert.doesNotMatch(h.el('history-' + A + '-guide-next').textContent,/kein weiterer Export nötig|133 verfügbaren Ergebnisstände|134 verfügbaren Ergebnisstände/u);
    assert.notEqual(h.el('history-' + A + '-guide-stages').children[3].dataset.status,'done');
    await h.act('nav-details');assert.doesNotMatch(h.el('job-description').textContent,/kein weiterer Export nötig/u);noAutomaticDecision(h);
  });

testAsync('an incomplete or unconfirmed run never displays the successful completion check', async () => {
  for (const state of ['stopped', 'review_required', 'paused', 'export_pending', 'export_abandoned', 'failed', 'blocked']) {
    const h = harness(); await selectAndStart(h);
    h.model.state = { state, batch_id: A, processing_mode: 'markdown-and-anonymize', selected_count: 3,
      completed_count: 2, result_count: 2, failed_count: 0, review_count: 0, batch_complete: false };
    await h.poll();
    assert.equal(h.el('job-icon').textContent, state === 'paused' ? 'Ⅱ' : '!');
    assert.equal(h.el('job-status').className.includes('success'), false);
  }
});

for (const batchId of [A, B, undefined]) testAsync('service Ready after an OCR-omission completion retires the old card, batch=' + String(batchId), async () => {
  const h = await finishedAnonymousWorkspace({ invoke(command, args, fallback) {
    if (command === 'configure_results') {
      h.model.state = { state: 'ready', ...(batchId ? { batch_id: batchId } : {}) };
      return { local_ui_only: true, external_disclosure: false, result_folder: 'New local results' };
    }
    return fallback();
  } }, 1);
  assert.match(h.el('job-title').textContent, /abgeschlossen mit Hinweisen/u);
  await h.act('nav-settings'); await h.act('configure-results'); await h.poll(); await h.act('nav-new');
  assert.equal(h.el('job-title').textContent, 'Kein aktiver Lauf');
  assert.doesNotMatch(h.el('job-icon').textContent, /✓/u);
  assert.equal(h.el('job-status').className, 'job-status'); assert.equal(h.el('job-progress').hidden, true);
  assert.equal(h.el('job-action-history').textContent, 'Verlauf öffnen');
  assert.equal(h.el('job-action-results'), undefined); assert.equal(h.el('job-action-documents'), undefined);
  assert.equal(h.calls.some(call => call.command === 'cancel_admission'), false);
  h.model.state = { state: 'processing', batch_id: A, processing_mode: 'markdown-and-anonymize',
    selected_count: 3, completed_count: 1, result_count: 1, failed_count: 0, review_count: 0 };
  await h.poll();
  assert.equal(h.el('job-progress').hidden, false); assert.equal(h.el('job-icon').textContent, '⚙');
});

testAsync('incomplete delivery offers primary history navigation without an automatic retry or copy', async () => {
  const h = await finishedAnonymousWorkspace({}, 1);
  h.model.state = { ...h.model.state, state: 'export_pending' }; await h.poll();
  assert.equal(h.el('job-icon').textContent, '!');
  assert.equal(h.el('job-action-history').textContent, 'Bereitstellung im Verlauf prüfen');
  assert.equal(h.nodes.filter(node => node.isConnected && node.id === 'job-action-history').length, 1);
  assert.match(h.el('job-description').textContent, /noch nicht bestätigt/u);
  assert.doesNotMatch(h.el('job-description').textContent, /Zugriffsrechte/u);
  const before = h.calls.length; await h.act('job-action-history');
  assert.equal(h.el('history-view').hidden, false);
  assert.equal(h.calls.slice(before).some(call => ['continue_history_batch', 'continue_current_batch', 'export_approved_documents'].includes(call.command)), false);
});

for (const interim of ['ready', 'ready-missing-id', 'mismatch']) testAsync('returning from ' + interim + ' restores the identical processing DTO and live announcement', async () => {
  const h = harness(); await selectAndStart(h);
  const processing = { ...h.model.state };
  assert.match(h.el('job-icon').className, /working/u);
  h.model.state = interim === 'mismatch' ? { ...processing, batch_id: B }
    : { state: 'ready', ...(interim === 'ready' ? { batch_id: A } : {}) };
  await h.poll();
  assert.equal(h.el('job-icon').className, 'status-icon');
  assert.equal(h.el('job-progress').hidden, true);
  h.model.state = processing; await h.poll();
  assert.match(h.el('job-icon').className, /working/u);
  assert.equal(h.el('job-progress').hidden, false);
  assert.equal(h.el('job-action-pause').textContent, 'Pausieren');
  assert.match(h.el('job-announcement').textContent, /Verarbeitung bleibt lokal/u);
  assert.doesNotMatch(h.el('job-announcement').textContent, /Kein aktiver Lauf|Status gehört nicht/u);
});

testAsync('consumed source rows disappear from the actual New tab after a terminal run', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.state = { ...h.model.state, state: 'results_available', batch_complete: true, results_available: true };
  await h.poll(); await h.act('nav-history'); await h.act('nav-new');
  assert.equal(h.el('catalogue').hidden, true);
  assert.equal(h.el('source-tree').children.length, 0);
  assert.equal(h.el('drop-zone').hidden, false);
  assert.equal(h.el('selection-count').textContent, '0 von 0 ausgewählt');
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  await h.act('start');
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'cancel_admission').length, 0);
});

testAsync('a newly prepared unstarted selection survives History and New tab navigation', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.state = { ...h.model.state, state: 'results_available', batch_complete: true, results_available: true };
  await h.poll(); await h.act('nav-new'); await h.act('select-folder');
  const source = h.model.catalogue.find(row => row.selectable), checkbox = h.el(`source-${source.source_id}`);
  checkbox.checked = false; await h.act(checkbox, 'change');
  h.el('text-ocr').checked = true; await h.act('text-ocr', 'change');
  const selection = h.el('selection-count').textContent;
  await h.act('nav-history'); await h.act('nav-new');
  assert.equal(h.el('catalogue').hidden, false);
  assert.equal(h.el(`source-${source.source_id}`).checked, false);
  assert.equal(h.el('selection-count').textContent, selection);
  assert.equal(h.el('text-ocr').checked, true);
  assert.equal(h.calls.filter(call => call.command === 'cancel_admission').length, 0);
});

testAsync('a lost Start ACK consumes only its local selection without an unbound cancellation or replay', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    if (command === 'start_admitted_batch') { fallback(); throw Error('STANDALONE_IPC_TIMEOUT'); }
    return fallback();
  } });
  await selectAndStart(h); await h.act('nav-new');
  assert.equal(h.el('source-tree').children.length, 0);
  assert.equal(h.el('catalogue').hidden, true);
  assert.equal(h.calls.filter(call => call.command === 'cancel_admission').length, 0);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 1);
});

testAsync('history status is first and later summary updates preserve title and file counts', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ pending_export_count: 1,
      pending_confirmation_count: 1 }) : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', result_location: 'available', results_available: true }];
  await h.act('nav-history');
  const detail = h.el('history-list').children[0].children[0];
  assert.match(detail.children[0].className, /history-status-heading/u);
  const title = detail.children.find(row => row.className === 'history-title').textContent;
  const counters = detail.children.find(row => row.className === 'history-meta' && row !== h.el(`history-${B}-state`)).textContent;
  await toggleHistorySummary(h, B);
  assert.equal(detail.children.find(row => row.className === 'history-title').textContent, title);
  assert.equal(detail.children.find(row => row.className === 'history-meta' && row !== h.el(`history-${B}-state`)).textContent, counters);
  assert.match(h.el(`history-${B}-state`).textContent, /Ergebnisdateien bereit/u);
  assert.match(h.el(`history-${B}-summary`).textContent, /offener Empfangsbestätigung/u);
});

testAsync('history accessibility names and stable openers stay bound to their own visible run after summary', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ approved_count: 2,
      reviewable_count: 2, current_exported_count: 0 }) : fallback();
  } }); await tick();
  h.model.entries = [A, B].map(batch_id => ({ batch_id, created_at: '2026-10-18T11:15:00Z',
    processing_mode: 'markdown-and-anonymize', selected_count: 2, result_count: 2, failed_count: 0,
    status: 'results_available', result_location: 'available', results_available: true }));
  await h.act('nav-history');
  for (const batchId of [A, B]) {
    const prefix = `history-${batchId}`, row = h.el(`${prefix}-title`).parent.parent;
    assert.equal(row.attrs['aria-labelledby'], `${prefix}-title ${prefix}-identity`);
    assert.equal(h.el(`${prefix}-identity`).textContent, `Lauf ${batchId.slice(0, 8)}`);
    for (const key of ['documents', 'details', 'results', 'more', 'visibility']) {
      const control = h.el(`${prefix}-${key}`);
      assert.equal(control.attrs['aria-labelledby'], `${control.id} ${prefix}-title ${prefix}-identity`);
      assert.equal(control.attrs['aria-label'], undefined, 'no stale duplicate of a changing visible label');
    }
  }
  const main = h.el(`history-${B}-documents`), binding = main.attrs['aria-labelledby'];
  await toggleHistorySummary(h, B);
  assert.equal(main.textContent, 'Nachbearbeitung öffnen (optional)');
  assert.equal(main.attrs['aria-labelledby'], binding, 'self-reference follows the live label without replacing run context');
  assert.equal(h.calls.some(call => ['start_admitted_batch', 'continue_history_batch', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('history hiding is explicit, persistent through the backend and never deletes or repeats work', async () => {
  let hidden = false;
  const entry = { batch_id: B, status: 'results_available', processing_mode: 'markdown-and-anonymize',
    result_count: 2, selected_count: 2, failed_count: 0, results_available: true, result_location: 'available' };
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_history') return { local_ui_only: true, external_disclosure: false,
      entries: hidden && !args?.includeHidden ? [] : [{ ...entry, hidden }], hidden_count: hidden ? 1 : 0, open_count: 0 };
    if (command === 'set_run_history_visibility') { assert.equal(args.batchId, B); hidden = args.hidden;
      return { ok: true, batch_id: B, hidden, local_ui_only: true, external_disclosure: false }; }
    return fallback();
  } }); await tick(); await h.act('nav-history'); await h.act(`history-${B}-more`);
  await h.act(`history-${B}-visibility`);
  assert.equal(hidden, true); assert.equal(h.el('history-list').children.length, 0);
  assert.match(h.el('history-status').textContent, /Keine sichtbaren/u);
  h.el('history-include-hidden').checked = true; await h.act('history-include-hidden', 'change');
  assert.equal(h.calls.filter(row => row.command === 'get_run_history').at(-1).args.includeHidden, true);
  assert.equal(h.el(`history-${B}-visibility`).textContent, 'Wieder im Verlauf anzeigen');
  await h.act(`history-${B}-visibility`); assert.equal(hidden, false);
  assert.equal(h.calls.some(row => /delete|remove|abandon|start_|continue_|export_approved/u.test(row.command)), false);
});

testAsync('open work and export-only legacy entries never advertise a supported hide action', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: A, status: 'review_required', resumable: true },
    { batch_id: B, status: 'results_available', visibility_supported: false }];
  await h.act('nav-history');
  assert.equal(h.el(`history-${A}-visibility`).disabled, true);
  assert.equal(h.el(`history-${B}-visibility`).disabled, true);
  assert.equal(h.calls.some(row => row.command === 'set_run_history_visibility'), false);
});

testAsync('a degraded export inventory keeps valid rows and never advertises automatic recovery', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    if (command === 'get_run_history') return { local_ui_only: true, external_disclosure: false, history_degraded: true,
      entries: [{ batch_id: B, processing_mode: 'markdown-and-anonymize', status: 'results_available', result_count: 2,
        selected_count: 2, failed_count: 0, result_location: 'unknown', results_available: false }] };
    return fallback();
  } }); await tick(); await h.act('nav-history');
  assert.equal(h.el('history-list').children.length, 1);
  assert.match(h.el('history-status').textContent, /momentan nicht bestätigbar/u);
  assert.equal(h.el(`history-${B}-results`), undefined);
  assert.equal(h.el(`history-${B}-delivery`), undefined);
  assert.equal(h.el(`history-${B}-documents`).attrs['data-history-main'], 'true');
});

testAsync('actual Executor -> Service -> public state renders a journal-free intake failure and ACKs only its visible two-frame receipt', async () => {
  const { createFixture } = require('./test-standalone-intake-failure');
  const f = createFixture(), frames = [];
  const frame = () => { const pending = frames.splice(0); for (const callback of pending) callback(); };
  const h = harness({ requestAnimationFrame: callback => frames.push(callback),
    async invoke(command, args, fallback) {
      if (command === 'get_public_state') return f.service.status({ localUi: true });
      if (command === 'get_ui_context') return f.service.uiContext();
      if (command === 'select_folder') return f.admit();
      if (command === 'start_admitted_batch') {
        // Native IPC transports JSON; do not pass a VM prototype directly into
        // the Service's intentionally strict plain-object content contract.
        const result = f.service.startAdmittedBatch({ ...JSON.parse(JSON.stringify(args)), documentReview: true });
        result.catch(() => {});
        f.children.at(-1)?.emit('message', { type: 'local-intake-accepted' });
        return result;
      }
      if (command === 'ack_terminal_presented') return f.service.acknowledgeTerminalPresented(args.presentationGeneration);
      if (command === 'cancel_admission') return f.service.cancelAdmission();
      return fallback();
    }
  });
  try {
    await selectAndStart(h);
    assert.equal(f.starts.length, 1);
    const started = f.starts[0], state = f.fail(started);
    await h.poll();
    assert.equal(h.el('details-view').hidden, false); assert.equal(h.el('job').hidden, false);
    assert.equal(h.el('job-title').textContent, 'Lokaler Start nicht bestätigt');
    assert.match(h.el('job-description').textContent, /kein bestätigter gespeicherter Lauf/u);
    assert.match(h.el('job-description').textContent, /Ende des lokalen Prozesses ist noch nicht bestätigt/u);
    assert.equal(h.el('job-progress').hidden, true); assert.equal(h.el('file-problems').hidden, true);
    assert.equal(h.el('job-actions').children.length, 0, 'a live failed child offers no new start');
    assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 0);
    frame(); assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 0);
    await h.act('nav-settings'); frame(); await tick();
    assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 0, 'hidden receipt is not acknowledged');
    started.child.exit(); await h.poll();
    assert.equal(f.service.status({ localUi: true }).presentation_generation, state.presentation_generation);
    await h.act('nav-details');
    assert.equal(h.el('job-title').textContent, 'Lokaler Start nicht bestätigt');
    assert.ok(h.el('job-action-new')); assert.equal(h.el('job-action-resume'), undefined);
    assert.equal(h.el('job-action-results'), undefined); assert.equal(h.el('job-action-documents'), undefined);
    frame(); frame(); await tick();
    const acknowledgements = h.calls.filter(call => call.command === 'ack_terminal_presented');
    assert.equal(acknowledgements.length, 1); assert.equal(acknowledgements[0].args.presentationGeneration, state.presentation_generation);
    const announcements = h.el('job-announcement').textUpdates;
    await h.poll(); frame(); frame(); await tick();
    assert.equal(h.el('job-title').textContent, 'Lokaler Start nicht bestätigt', 'message survives its render ACK and child exit');
    assert.equal(h.el('job-announcement').textUpdates, announcements, 'unchanged polling/ACK does not repeat the live failure announcement');
    assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 1);
    assert.equal(f.starts.length, 1, 'polling/navigation/ACK never restarts the intake');
    assert.equal(f.historyCalls, 0); assert.equal(f.osDialogs, 0);
  } finally { f.close(); }
});

testAsync('superseded job/attempt cannot ACK an old journal-free failure even when the display reuses the same batch reference', async () => {
  const frames = [], h = harness({ requestAnimationFrame: callback => frames.push(callback),
    invoke(command, _args, fallback) {
      if (command === 'ack_terminal_presented') return { ok: true, acknowledged: true };
      return fallback();
    }
  });
  const flush = () => { for (let round = 0; round < 3; round++) { const pending = frames.splice(0); for (const callback of pending) callback(); } };
  await selectAndStart(h);
  h.model.state = { state: 'start_failed', intake_failure: { intake_id: A, error_code: 'STANDALONE_START_FAILED', worker_active: false }, presentation_generation: 81 };
  await h.poll(); assert.equal(h.el('job-title').textContent, 'Lokaler Start nicht bestätigt');
  await h.act('job-action-new');
  await h.act('select-folder'); h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change'); await h.act('start');
  h.model.state = { state: 'start_failed', intake_failure: { intake_id: A, error_code: 'STANDALONE_START_FAILED', worker_active: false }, presentation_generation: 82 };
  await h.poll(); flush(); await tick();
  const acknowledgements = h.calls.filter(call => call.command === 'ack_terminal_presented');
  assert.deepEqual(acknowledgements.map(call => call.args.presentationGeneration), [82]);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, 2, 'only the two explicit user starts run');
});

testAsync('ordinary journal notice rendered while hidden is ACKed only after revisiting the same unchanged visible card', async () => {
  const frames = [], h = harness({ requestAnimationFrame: callback => frames.push(callback),
    invoke(command, _args, fallback) { return command === 'ack_terminal_presented' ? { ok: true, acknowledged: true } : fallback(); }
  });
  const flush = () => { for (let round = 0; round < 3; round++) { const pending = frames.splice(0); for (const callback of pending) callback(); } };
  await selectAndStart(h); await h.act('nav-settings');
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-only', selected_count: 3,
    completed_count: 3, failed_count: 0, result_count: 3, results_available: true, presentation_generation: 91 };
  await h.poll(); flush(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 0);
  await h.act('nav-details'); flush(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'ack_terminal_presented').length, 1);
  assert.equal(h.calls.find(call => call.command === 'ack_terminal_presented').args.presentationGeneration, 91);
});

for (const code of ['STANDALONE_IPC_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY'])
testAsync('review read contention preserves an already acknowledged decision: ' + code, async () => {
  let rejectRead = false;
  const h = await openDeferredGuideFixture('markdown-and-anonymize', (command, args, fallback) => {
    if (command === 'get_review_session') {
      if (rejectRead) throw Error(code);
      return { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 };
    }
    if (command === 'submit_review') return { accepted: true, action: 'reviewed' };
    return fallback();
  });
  const bridge = h.window.__DATASECURE_REVIEW__;
  await bridge.invoke('get_review_session');
  await bridge.invoke('submit_review', { reviewId: 'a'.repeat(32), answer: { action: 'reviewed' } });
  const title = h.el('run-guide-title').textContent;
  rejectRead = true;
  await assert.rejects(bridge.invoke('get_review_session'), new RegExp(code, 'u'));
  assert.equal(h.el('run-guide-title').textContent, title);
  assert.doesNotMatch(h.el('run-guide-title').textContent, /unklar/u);
  assert.equal(h.calls.filter(call => call.command === 'submit_review').length, 1);
});

testAsync('busy mutation acknowledgement still remains uncertain, unlike a rejected status read', async () => {
  const h = await openDeferredGuideFixture('markdown-and-anonymize', (command, args, fallback) => {
    if (command === 'submit_review') throw Error('STANDALONE_OWNERSHIP_CONTROL_BUSY');
    return fallback();
  });
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('submit_review', {
    reviewId: 'a'.repeat(32), answer: { action: 'reviewed' }
  }), /OWNERSHIP_CONTROL_BUSY/u);
  assert.match(h.el('run-guide-title').textContent, /unklar/u);
  assert.equal(h.calls.filter(call => call.command === 'submit_review').length, 1);
});

for (const processing_mode of ['markdown-only', 'markdown-and-anonymize']) for (const coverage of ['unapproved', 'approved', 'exported'])
testAsync(`finished history keeps result opener first/green and stable separate review action: ${processing_mode}/${coverage}`, async () => {
  const h = harness({ invoke(command, _args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ processing_mode,
      reviewable_count: 2, approved_count: coverage === 'unapproved' ? 0 : 2,
      current_exported_count: coverage === 'exported' ? 2 : 0 }) : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode, selected_count: 2, result_count: 2, failed_count: 0,
    status: 'results_available', result_location: 'available', results_available: true,
    ...(processing_mode === 'markdown-only' ? { conversion_feedback: conversionFeedback({ selected_count: 2, result_count: 2,
      not_converted_count: 0, ocr_omitted_count: 0, content_notice_count: 1 }) } : {}),
    content_notice_count: 1, content_notice_breakdown_complete: true }];
  await h.act('nav-history');
  const opener = h.el(`history-${B}-results`), review = h.el(`history-${B}-documents`), actions = opener.parent;
  assert.equal(opener.textContent, 'Ergebnisordner öffnen'); assert.equal(opener.className, 'primary');
  assert.equal(opener.attrs['data-history-main'], 'true');
  assert.equal(review.textContent, processing_mode === 'markdown-only' ? 'Nachkorrektur öffnen (optional)' : 'Nachbearbeitung öffnen (optional)');
  assert.deepEqual(actions.children.filter(node => node.tagName === 'BUTTON').map(node => node.id),
    ['results', 'documents', 'details', 'problems', 'more'].map(key => `history-${B}-${key}`));
  const label = review.textContent;
  await toggleHistorySummary(h, B);
  assert.equal(opener.textContent, 'Ergebnisordner öffnen'); assert.equal(opener.className, 'primary');
  assert.equal(review.textContent, label);
  assert.equal(h.calls.some(call => ['decide_document_review', 'decide_document_review_batch', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('anonymization mode copy promises direct results after necessary processing, not another selection or approval', async () => {
  const input = html.indexOf('id="mode-anonymize"');
  assert.ok(input >= 0);
  const start = html.lastIndexOf('<label', input), end = html.indexOf('</label>', input);
  assert.ok(start >= 0 && end > input);
  const copy = html.slice(start, end + '</label>'.length).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
  assert.match(copy, /Danach liegen die fertigen Dateien im Ergebnisordner/u);
  assert.match(copy, /keine zusätzliche Dateiauswahl, Freigabe oder Exportbestätigung/u);
  assert.doesNotMatch(copy, /Erst eine gesonderte Dokumentfreigabe erlaubt den Export/u);
  const extras = /<details\b[^>]*id="documents-approval-extras"[\s\S]*?<\/details>/u.exec(html)?.[0];
  assert.ok(extras);
  assert.match(extras, /Freigaben verwalten \(optional\)/u);
  assert.match(extras, /\bhidden\b/u, 'legacy approval management is not a normal visible action');
});

testAsync('entity-change guidance describes consequential saving and automatic complete-result delivery', async () => {
  const marker = html.indexOf('class="entity-guide meta"');
  assert.ok(marker >= 0);
  const start = html.lastIndexOf('<ol', marker), end = html.indexOf('</ol>', marker);
  assert.ok(start >= 0 && end > marker);
  const copy = html.slice(start, end + '</ol>'.length).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
  assert.match(copy, /Originalwert beibehalten/u);
  assert.match(copy, /personenbezogene Angaben sichtbar machen/u);
  assert.match(copy, /Vor dem Speichern die gewählte Behandlung prüfen/u);
  assert.match(copy, /gesamte aktuelle Ergebnisstand ohne zweite Freigabe oder Exportbestätigung bereitgestellt/u);
  assert.match(copy, /Standard ist „Nur diese Datei“/u);
  assert.match(copy, /höchstens 500 unterschiedliche Werte/u);
  assert.match(copy, /Frühere Ergebnisstände bleiben unverändert/u);
  assert.doesNotMatch(copy, /ausdrücklich freigeben; ein Export startet dadurch nicht/u);
});

testAsync('rendered history summary needs no second approval/export and remains strictly read-only', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 2,
    result_count: 2, failed_count: 0, status: 'results_available', result_location: 'available', results_available: true }];
  await h.act('nav-history');
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 0);
  await toggleHistorySummary(h, B);
  const summary = h.el(`history-${B}-summary`);
  assert.equal(summary.hidden, false);
  assert.match(summary.textContent, /keine zusätzliche Dateiauswahl, Dokumentfreigabe oder Exportbestätigung nötig/u);
  assert.doesNotMatch(summary.textContent, /Dokumentfreigaben und Exporte sind getrennte Schritte/u);
  const reads = h.calls.filter(call => call.command === 'get_document_review_history_summary');
  assert.equal(reads.length, 1); assert.deepEqual(reads[0].args, { batchId: B });
  assert.equal(h.calls.some(call => ['decide_document_review', 'decide_document_review_batch', 'export_approved_documents',
    'configure_results', 'start_admitted_batch', 'continue_history_batch', 'continue_current_batch',
    'continue_review_session', 'abandon_document_export', 'abandon_result_export'].includes(call.command)), false,
    'copy disclosure itself cannot approve, export, configure, start or continue work');
});

for (const processing_mode of ['markdown-only', 'markdown-and-anonymize'])
  for (const state of ['initial', 'current', 'pending', 'conflict', 'unavailable'])
    testAsync(`${processing_mode}: history uses exact ${state} result-publication truth, independent of old approval and copy receipts`, async () => {
      const publication = { state, generation_id: state === 'current' ? 'e'.repeat(32) : null, count: 2, current_revision: 0 };
      const h = harness({ invoke(command, _args, fallback) {
        return command === 'get_document_review_history_summary' ? reviewSummary({ processing_mode, approved_count: 0,
          current_exported_count: 0, recorded_export_count: 3, pending_export_count: 1, pending_confirmation_count: 1,
          result_publication: publication }) : fallback();
      } }); await tick();
      h.model.entries = [{ ...markdownHistoryEntry(B), processing_mode, selected_count: 2, completed_count: 2, failed_count: 0 }];
      await h.act('nav-history');
      const opener = h.el(`history-${B}-results`), editor = h.el(`history-${B}-documents`);
      assert.equal(opener.textContent, 'Ergebnisordner öffnen'); assert.equal(opener.className, 'primary');
      assert.equal(opener.parent.children.filter(node => node.tagName === 'BUTTON')[0], opener);
      assert.notEqual(editor.className, 'primary');
      assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
      await toggleHistorySummary(h, B);
      const unsettled = state === 'pending' || state === 'conflict';
      assert.equal(opener.disabled, unsettled || state === 'unavailable');
      assert.match(h.el(`history-${B}-summary`).textContent, /3 frühere zusätzliche Kopien mit Beleg/u);
      if (state === 'unavailable') {
        assert.match(h.el(`history-${B}-state`).textContent, /Verarbeitung abgeschlossen.*Ergebnisordner nicht verfügbar/u);
        assert.match(h.el(`history-${B}-summary`).textContent, /Verarbeitung ist abgeschlossen.*nicht mehr sicher erreichbar/u);
        assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /aktuellen Nachbearbeitungsstands.*noch nicht bestätigt/u);
      } else if (unsettled) {
        assert.match(h.el(`history-${B}-state`).textContent, /aktueller Ergebnisstand noch nicht bestätigt/u);
        assert.match(h.el(`history-${B}-summary`).textContent, /Nachbearbeitung.*Ergebnisstand abgleichen/u);
        if (processing_mode === 'markdown-and-anonymize') assert.doesNotMatch(h.el(`history-${B}-guide-title`).textContent, /Ergebnisse bereit/u);
      } else {
        assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisdateien erstellt/u);
        assert.doesNotMatch(h.el(`history-${B}-state`).textContent, /Freigabe.*offen|Export im Abgleich/u);
      }
      assert.equal(h.calls.filter(call => call.command === 'get_document_review_history_summary').length, 1);
      assert.equal(h.calls.some(call => ['publish_result_documents', 'decide_document_review', 'decide_document_review_batch',
        'preview_document_export', 'export_approved_documents', 'abandon_document_export'].includes(call.command)), false);
    });

testAsync('a no-longer-available completed result directory reports a neutral local notice without repeating work', async () => {
  const h = harness({ invoke(command, _args, fallback) {
    if (command === 'open_history_results') throw Object.assign(Error('RESULT_DIRECTORY_UNAVAILABLE'), { code: 'RESULT_DIRECTORY_UNAVAILABLE' });
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry()]; await h.act('nav-history');
  await h.act(`history-${B}-results`);
  assert.equal(h.el('feedback').className, 'notice');
  assert.match(h.el('feedback').textContent, /Verarbeitung ist abgeschlossen.*private Prüfstände bleiben erhalten/u);
  assert.equal(h.el('connection-help').hidden, true);
  assert.equal(h.calls.filter(call => call.command === 'open_history_results').length, 1);
  noAutomaticDecision(h);
});

for (const result_publication of [{ state: 'current', generation_id: null, count: 2 },
  { state: 'current', generation_id: 'e'.repeat(64), count: 2 }, { state: 'initial', generation_id: null, count: 1 },
  { state: 'current', generation_id: 'e'.repeat(32), count: 2, approved: true }])
  testAsync(`history rejects malformed result generation without inventing current delivery: ${JSON.stringify(result_publication)}`, async () => {
    const h = harness({ invoke(command, _args, fallback) {
      return command === 'get_document_review_history_summary' ? reviewSummary({ result_publication }) : fallback();
    } }); await tick();
    h.model.entries = [{ ...markdownHistoryEntry(B), processing_mode: 'markdown-and-anonymize' }];
    await h.act('nav-history'); await toggleHistorySummary(h, B);
    assert.match(h.el(`history-${B}-summary`).textContent, /DOCUMENT_REVIEW_INVALID/u);
    assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /gespeicherte Ergebnisstände|frühere zusätzliche Kopien mit Beleg/u);
    assert.equal(h.el(`history-${B}-summary-reload`).disabled, false);
    noAutomaticDecision(h);
    assert.equal(h.calls.some(call => ['publish_result_documents', 'preview_document_export'].includes(call.command)), false);
  });

testAsync('a superseded pending-publication reply cannot replace a newer exact current-generation summary or release its read lock', async () => {
  let reads = 0, finishOld, finishNew;
  const oldRead = new Promise(resolve => { finishOld = resolve; }), newRead = new Promise(resolve => { finishNew = resolve; });
  const h = await finishedAnonymousWorkspace({ invoke(command, _args, fallback) {
    return command === 'get_document_review_history_summary' ? ++reads === 1 ? oldRead : newRead : fallback();
  } });
  await h.act('nav-history'); await openHistoryDisclosure(h, A);
  h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } }); await tick();
  await h.act(`history-${A}-summary-reload`);
  finishOld(fullCopySummary({ result_publication: { state: 'pending', generation_id: null, count: 2, current_revision: 1 } }));
  await tick();
  assert.equal(h.el(`history-${A}-summary`).attrs['aria-busy'], 'true');
  assert.equal(h.el(`history-${A}-summary-reload`).disabled, true);
  assert.doesNotMatch(h.el(`history-${A}-state`).textContent, /aktueller Ergebnisstand noch nicht bestätigt/u);
  finishNew(fullCopySummary({ result_publication: { state: 'current', generation_id: 'e'.repeat(32), count: 2, current_revision: 1 } }));
  await tick(); await tick();
  assert.equal(h.el(`history-${A}-summary-reload`).disabled, false);
  assert.equal(h.el(`history-${A}-results`).disabled, false);
  assert.match(h.el(`history-${A}-guide-title`).textContent, /Anonymisierte Ergebnisse bereit/u);
  assert.equal(reads, 2); noAutomaticDecision(h);
  assert.equal(h.calls.some(call => ['publish_result_documents', 'preview_document_export'].includes(call.command)), false);
});

const historyCountProjection = (entries, open_count, extra = {}) => ({ local_ui_only: true,
  external_disclosure: false, entries, open_count, ...extra });
const countEntry = (batch_id, extra = {}) => ({ batch_id, processing_mode: 'markdown-and-anonymize',
  selected_count: 1, result_count: 0, failed_count: 0, resumable: true, status: 'stopped', ...extra });

for (const otherOpen of [0, 1]) testAsync(`own resumed job completion refreshes the global badge with ${otherOpen} other open runs, without opening history details`, async () => {
  let open = 1 + otherOpen;
  const h = harness({ invoke(command, args, fallback, model) {
    if (command === 'get_run_history') {
      assert.equal(args?.recoverExports, undefined, 'badge reads never request publication/recovery');
      return historyCountProjection(args?.batchId ? model.entries.filter(row => row.batch_id === args.batchId) : model.entries,
        args?.batchId ? 0 : open);
    }
    return fallback();
  } });
  await tick(); h.model.entries = [countEntry(A), ...(otherOpen ? [countEntry(B)] : [])];
  await h.act('nav-history'); assert.equal(h.el('open-count').textContent, `${1 + otherOpen} offen`);
  await h.act(`history-${A}-continue`); await tick();
  assert.equal(h.el('run-history-detail').hidden, true, 'the own resumed job uses its retained job card');
  h.model.state = { state: 'results_available', batch_id: A, processing_mode: 'markdown-and-anonymize',
    selected_count: 1, completed_count: 1, result_count: 1, failed_count: 0, batch_complete: true, results_available: true };
  h.model.entries[0] = countEntry(A, { status: 'results_available', resumable: false, result_count: 1, results_available: true });
  open = otherOpen;
  const before = h.calls.filter(row => row.command === 'get_run_history').length;
  await h.poll();
  assert.equal(h.el('open-count').textContent, `${otherOpen} offen`);
  assert.equal(h.el('open-count').hidden, otherOpen === 0);
  assert.equal(h.calls.filter(row => row.command === 'get_run_history').length, before + 1);
  assert.equal(h.calls.filter(row => row.command === 'continue_history_batch').length, 1);
  assert.equal(h.calls.some(row => ['publish_result_documents', 'export_approved_documents'].includes(row.command)), false);
});

testAsync('an authoritative changed global count updates before the unchanged-row render cache', async () => {
  let open = 2;
  const h = harness({ invoke(command, _args, fallback, model) {
    return command === 'get_run_history' ? historyCountProjection(model.entries, open) : fallback();
  } }); await tick(); h.model.entries = [countEntry(A), countEntry(B)];
  await h.act('nav-history'); const firstRow = h.el('history-list').children[0];
  open = 1; await h.poll();
  assert.equal(h.el('open-count').textContent, '1 offen'); assert.equal(h.el('open-count').hidden, false);
  assert.equal(h.el('history-list').children[0], firstRow, 'count-only changes do not rebuild focused history rows');
});

testAsync('a targeted detail count cannot erase another run from the global navigation badge', async () => {
  const h = harness({ invoke(command, args, fallback, model) {
    return command === 'get_run_history' ? historyCountProjection(args?.batchId
      ? model.entries.filter(row => row.batch_id === args.batchId) : model.entries, args?.batchId ? 0 : 1) : fallback();
  } }); await tick(); h.model.entries = [countEntry(A), countEntry(B,
    { status: 'results_available', resumable: false, result_count: 1, results_available: true })];
  await h.act('nav-history'); assert.equal(h.el('open-count').textContent, '1 offen');
  await h.act(`history-${B}-details`);
  assert.ok(h.calls.some(row => row.command === 'get_run_history' && row.args?.batchId === B));
  assert.equal(h.el('open-count').textContent, '1 offen'); assert.equal(h.el('open-count').hidden, false);
});

for (const rejected of ['busy', 'missing-count', 'degraded']) testAsync(`${rejected} global badge refresh stays unknown, not zero, and a later read can confirm it`, async () => {
  let rejectCount = false;
  const h = harness({ invoke(command, _args, fallback, model) {
    if (command === 'get_run_history') {
      if (rejectCount && rejected === 'busy') throw Error('STANDALONE_IPC_BUSY');
      if (rejectCount && rejected === 'missing-count') return { local_ui_only: true, external_disclosure: false, entries: model.entries };
      return historyCountProjection(model.entries, rejectCount ? 0 : 1, rejectCount ? { history_degraded: true } : {});
    }
    return fallback();
  } }); await tick(); h.model.entries = [countEntry(A)]; await h.act('nav-history');
  await h.act('nav-new'); rejectCount = true;
  await h.act('select-files'); assert.equal(h.el('open-count').hidden, true, 'a new interaction retires the old count');
  await h.poll(); assert.equal(h.el('open-count').hidden, true); assert.equal(h.el('open-count').textContent, '1 offen');
  assert.equal(h.el('open-count').textHistory.includes('0 offen'), false);
  rejectCount = false; await h.poll(); assert.equal(h.el('open-count').hidden, false);
  assert.equal(h.el('open-count').textContent, '1 offen');
  assert.equal(h.calls.some(row => row.command === 'get_run_history' && row.args?.recoverExports), false);
});

testAsync('a badge-only global read and a visible history load share one in-flight projection', async () => {
  let delay = false, finish, reads = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, _args, fallback, model) {
    if (command === 'get_run_history') { reads++; return delay ? pending : historyCountProjection(model.entries, 1); }
    return fallback();
  } }); await tick(); h.model.entries = [countEntry(A), countEntry(B)]; await h.act('nav-history');
  await h.act('nav-new'); await h.act('select-files'); delay = true;
  const poll = h.poll(); await tick(); assert.equal(reads, 2);
  await h.act('nav-history'); assert.equal(reads, 2, 'navigation joins the badge read instead of issuing a duplicate poll');
  finish(historyCountProjection(h.model.entries, 2)); await poll; await tick();
  assert.equal(h.el('open-count').textContent, '2 offen'); assert.equal(h.el('open-count').hidden, false);
  assert.equal(h.el('history-list').children.length, 2);
});

testAsync('an unconfirmed public-state Busy read retires the known badge until a fresh global count', async () => {
  let refuse = false;
  const h = harness({ invoke(command, _args, fallback, model) {
    if (command === 'get_public_state' && refuse) throw Error('STANDALONE_OWNERSHIP_CONTROL_BUSY');
    return command === 'get_run_history' ? historyCountProjection(model.entries, 1) : fallback();
  } }); await tick(); h.model.entries = [countEntry(A)]; await h.act('nav-history'); await h.act('nav-new');
  refuse = true; await h.poll(); assert.equal(h.el('open-count').hidden, true);
  assert.equal(h.el('open-count').textHistory.includes('0 offen'), false);
  refuse = false; await h.poll(); assert.equal(h.el('open-count').textContent, '1 offen');
  assert.equal(h.el('open-count').hidden, false);
});

for (const retirement of ['interaction', 'connection']) testAsync(`a delayed global count is shared and retired by ${retirement}, without overwriting its successor`, async () => {
  let delay = false, finishOld, reads = 0;
  const pending = new Promise(resolve => { finishOld = resolve; });
  const h = harness({ invoke(command, _args, fallback, model) {
    if (command === 'get_run_history') {
      reads++; return delay ? pending : historyCountProjection(model.entries, reads === 1 ? 1 : 2);
    }
    return fallback();
  } }); await tick(); h.model.entries = [countEntry(A), countEntry(B)]; await h.act('nav-history');
  delay = true; await h.act('refresh-history'); await h.act('refresh-history');
  assert.equal(reads, 2, 'repeated list requests share the same actual read');
  if (retirement === 'interaction') { await h.act('nav-new'); await h.act('select-files'); }
  else h.listeners.get('datasecure-connection')({ payload: { epoch: 1, state: 'ready' } });
  assert.equal(h.el('open-count').hidden, true);
  finishOld(historyCountProjection(h.model.entries, 0)); await tick(); await tick();
  assert.equal(h.el('open-count').textHistory.includes('0 offen'), false, 'the retired snapshot cannot invent a completed global state');
  delay = false; await h.poll(); await tick();
  assert.equal(reads, 3); assert.equal(h.el('open-count').textContent, '2 offen'); assert.equal(h.el('open-count').hidden, false);
});

const privateRepairPublication = () => ({ state: 'repair_required', generation_id: null, count: 2, current_revision: 2, repair_binding: '9'.repeat(64) });
testAsync('history repair projection blocks result opening and offers private repair without automatic mutation', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ result_publication: privateRepairPublication() }) : fallback();
  } }); await tick();
  h.model.entries = [markdownHistoryEntry(B, { processing_mode: 'markdown-and-anonymize', selected_count: 2, completed_count: 2, failed_count: 0 })];
  await h.act('nav-history'); await toggleHistorySummary(h, B);
  const opener = h.el(`history-${B}-results`), editor = h.el(`history-${B}-documents`);
  assert.equal(opener.disabled, true); assert.equal(editor.disabled, false); assert.match(editor.textContent, /Gespeicherte Texte nachbearbeiten/u);
  assert.match(h.el(`history-${B}-state`).textContent, /Gespeicherte Anonymisierung.*nachbearbeiten/u);
  assert.match(h.el(`history-${B}-summary`).textContent, /private Dokumentstände.*nichts automatisch geändert/u);
  assert.match(h.el(`history-${B}-summary`).textContent, /Erst alle betroffenen Dokumente reparieren/u);
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /Ergebnisdateien erstellt|Ergebnisstand abgleichen/u);
  await h.act(opener); assert.equal(h.calls.some(call => call.command === 'open_history_results'), false);
  assert.equal(h.calls.some(call => ['publish_result_documents','decide_document_review','decide_document_review_batch','export_approved_documents'].includes(call.command)), false);
});
testAsync('a failed or malformed history refresh cannot release a previously confirmed repair restriction', async () => {
  let phase = 'repair';
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return reviewSummary({ result_publication: phase === 'current'
      ? { state: 'current', generation_id: 'e'.repeat(32), count: 2, current_revision: 3 }
      : { ...privateRepairPublication(), ...(phase === 'malformed' ? { repair_binding: 'A'.repeat(64) } : {}) } });
    return fallback();
  } }); await tick(); h.model.entries = [markdownHistoryEntry(B, { processing_mode: 'markdown-and-anonymize', selected_count: 2, completed_count: 2, failed_count: 0 })];
  await h.act('nav-history'); await toggleHistorySummary(h, B); assert.equal(h.el(`history-${B}-results`).disabled, true);
  phase = 'malformed'; await h.act(`history-${B}-summary-reload`); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /DOCUMENT_REVIEW_INVALID/u); assert.equal(h.el(`history-${B}-results`).disabled, true);
  await h.act(`history-${B}-results`); assert.equal(h.calls.some(call => call.command === 'open_history_results'), false);
  phase = 'current'; await h.act(`history-${B}-summary-reload`); await tick();
  assert.equal(h.el(`history-${B}-results`).disabled, false); assert.match(h.el(`history-${B}-summary`).textContent, /Ergebnisdateien erstellt/u);
  assert.equal(h.calls.some(call => ['publish_result_documents','decide_document_review','export_approved_documents'].includes(call.command)), false);
});
testAsync('the retained current job uses its bound repair projection as a private action instead of a green result opener', async () => {
  const h = await finishedAnonymousWorkspace({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ result_publication: privateRepairPublication() }) : fallback();
  } }); await openFinishedSnapshot(h); await h.act('nav-details');
  assert.match(h.el('job-title').textContent, /Gespeicherte Anonymisierung.*nachbearbeiten/u);
  assert.doesNotMatch(h.el('job-status').className, /success/u);
  assert.equal(h.el('job-action-results'), undefined);
  assert.equal(h.el('job-action-documents').className, 'primary');
  assert.match(h.el('job-action-documents').textContent, /Gespeicherte Texte nachbearbeiten/u);
  assert.doesNotMatch(h.el('job-description').textContent, /technisch geprüfte anonymisierte Ergebnisse.*verfügbar|Ergebnisordner öffnen/u);
  assert.equal(h.calls.some(call => ['publish_result_documents','decide_document_review','export_approved_documents','open_history_results'].includes(call.command)), false);
});
testAsync('a failed bound repair-summary refresh cannot restore the retained current-job opener', async () => {
  let malformed = false;
  const h = await finishedAnonymousWorkspace({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary({ result_publication: {
      ...privateRepairPublication(), ...(malformed ? { repair_binding: 'A'.repeat(64) } : {}) } }) : fallback();
  } }); await openFinishedSnapshot(h);
  malformed = true; await h.act(`history-${A}-summary-reload`); await tick();
  assert.match(h.el(`history-${A}-summary`).textContent, /DOCUMENT_REVIEW_INVALID/u);
  await h.act('nav-details');
  assert.match(h.el('job-title').textContent, /Gespeicherte Anonymisierung.*nachbearbeiten/u);
  assert.equal(h.el('job-action-results'), undefined); assert.equal(h.el('job-action-documents').className, 'primary');
  assert.equal(h.calls.some(call => ['publish_result_documents','decide_document_review','export_approved_documents','open_history_results'].includes(call.command)), false);
});
testAsync('actual document-view navigation retains repair restrictions and then authoritative normal pending without granting an opener', async () => {
  let publication = privateRepairPublication();
  const h = await finishedAnonymousWorkspace({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') return reviewSummary({ result_publication: publication, approved_count: 0 });
    if (command === 'get_document_reviews') return { ...documentResponse('markdown-and-anonymize', 2),
      processing_complete: true, result_publication: publication, unavailable: [], content_notices: [],
      content_notice_count: 0, content_notice_breakdown_complete: true };
    return fallback();
  } }); await openFinishedSnapshot(h); await h.act(`history-${A}-documents`); await tick(); await tick();
  assert.equal(h.el('documents-view').hidden, false); assert.equal(h.el('documents-open-results').disabled, true);
  await h.act('documents-back'); await tick();
  assert.equal(h.el('job-action-results'), undefined); assert.match(h.el('job-title').textContent, /sicher nachbearbeiten/u);
  await h.act('job-action-documents'); await tick(); await tick();
  publication = { state: 'pending', generation_id: null, count: 2, current_revision: 3 };
  await h.act('documents-reload'); await tick(); assert.equal(h.el('documents-open-results').disabled, true);
  await h.act('documents-back'); await tick();
  assert.equal(h.el('job-action-results'), undefined); assert.match(h.el('job-title').textContent, /Ergebnisstand.*nicht bestätigt/u);
  assert.equal(h.calls.some(call => ['publish_result_documents','decide_document_review','decide_document_review_batch','export_approved_documents','open_history_results'].includes(call.command)), false);
});

done();
