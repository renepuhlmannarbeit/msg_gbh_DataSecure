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
      hidden: false, disabled: false, checked: false, indeterminate: false, open: false, tabIndex: 0, value: '', className: '', ownText: '', textUpdates: 0,
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.ownText = ''; this.append(...children); },
      addEventListener(event, callback) { this.events.set(event, callback); },
      setAttribute(key, value) { this.attrs[key] = String(value); }, removeAttribute(key) { delete this.attrs[key]; },
      focus() { doc.activeElement = this; },
      showModal() { this.open = true; },
      close() { this.open = false; this.events.get('close')?.(); },
      closest(selector) { assert.equal(selector, '[hidden]'); for (let n = this; n; n = n.parent) if (n.hidden) return n; return null; },
      get isConnected() { let n = this; while (n.parent) n = n.parent; return [...roots.values()].includes(n); },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
      set textContent(text) { for (const child of this.children) child.parent = null; this.children = []; this.ownText = String(text); this.textUpdates++; }
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
  const context = vm.createContext({ window, document: doc, requestAnimationFrame: fn => fn(),
    crypto: require('node:crypto').webcrypto,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) });
  vm.runInContext(fs.readFileSync(path.join(base, 'workflow-presentation.js'), 'utf8'), context, { filename: 'workflow-presentation.js' });
  vm.runInContext(source, context, { filename: 'workspace.js' });
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

testAsync('a native Mac core trap is explained and stops automatic retry after the first failure', async () => {
  const h = harness({ invoke(command, args, fallback) {
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
  assert.equal(h.el('new-view').hidden, false, 'confirmed processing stays on the active run page');
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
testAsync('all ancestors of an initially blocked deep file are visible in a large catalogue', async () => {
  const files = Array.from({length: 13}, (_, n) => ({ name: `One/${n}.txt`, source_id: id(n + 1), bytes: 1, selectable: true }));
  files.push({name: 'Two/Inner/Bad.zip', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED'});
  const h = harness({catalogue: files}); await tick(); await h.act('select-folder');
  const inner = h.nodes.find(node => node.dataset.depth === '1' && node.children[0]?.textContent.includes('Inner'));
  assert.ok(inner); assert.equal(inner.hidden, false);
  assert.equal(h.el('group-toggle-1').attrs['aria-expanded'], 'true');
  assert.match(h.el('source-tree').textContent, /Bad.zip.*Dieses Dateiformat wird nicht unterstützt/u);
});
testAsync('historical continuation adopts the exact run instead of rendering the old job', async () => {
  const h = harness(); await selectAndStart(h);
  h.model.entries = [{ batch_id: B, created_at: '2026-10-07T09:00:00Z', processing_mode: 'markdown-and-anonymize', selected_count: 7, resumable: true, status: 'stopped' }];
  await h.act('nav-history');
  const resume = h.el('history-list').children[0].children[1].children.find(node => node.textContent === 'Fortsetzen');
  await h.act(resume);
  assert.equal(h.el('job-name').textContent, `Lauf ${B.slice(0, 8)}`);
  assert.equal(h.el('job-count').textContent, '7 Dateien'); assert.equal(h.el('job-files-toggle').hidden, true);
  h.model.state = { state: 'review_required', batch_id: B, review_count: 7 }; await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Jetzt prüfen'));
  assert.equal(h.calls.filter(call => call.command === 'continue_history_batch').at(-1).args.batchId, B);
  assert.equal(h.el('nav-history').attrs['aria-selected'], 'true'); assert.equal(h.doc.activeElement.id, 'review-heading');
  assert.equal(h.el('review-heading').textContent, `Prüfen: Lauf ${B.slice(0, 8)}`);
  assert.equal(h.el('review-scope').textContent, '7 Dateien · Entscheidungen gelten für diesen Lauf');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  assert.equal(h.el('review-view').hidden, true); assert.equal(h.el('new-view').hidden, false);
  assert.equal(h.doc.activeElement.id, 'job-title');
});
testAsync('review opened directly from history returns focus to stable history navigation', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', selected_count: 7, resumable: true, status: 'review_required' }];
  await h.act('nav-history');
  const review = h.el('history-list').children[0].children[1].children.find(node => node.textContent === 'Jetzt prüfen');
  await h.act(review);
  assert.equal(h.el('review-view').hidden, false);
  assert.equal(h.el('nav-history').attrs['aria-controls'], 'review-view');
  assert.equal(h.el('review-heading').textContent, `Prüfen: Lauf ${B.slice(0, 8)}`);
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  assert.equal(h.el('history-view').hidden, false);
  assert.equal(h.doc.activeElement.id, 'nav-history');
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
  await h.act(`history-${B}-summary-toggle`);
  const summary = h.el(`history-${B}-summary`);
  assert.match(summary.textContent, /Dokumentprüfung: 0 von 2 verfügbaren Dokumentständen freigegeben/u);
  assert.match(summary.textContent, /1 Dokumentprüfstände nicht verfügbar/u);
  assert.match(summary.textContent, /1 Quelldateien mit unklarem früheren Ergebnisstatus/u);
  assert.match(summary.textContent, /vollständige Freigabe dieses Laufs ist nicht belegbar/u);
  assert.match(summary.textContent, /KI-Kopie: 3 abgeschlossene Exporte mit Beleg/u);
  assert.match(summary.textContent, /1 unvollständige Exportaufträge · 1 fertige Kopien mit offener Empfangsbestätigung/u);
  const reload = h.el(`history-${B}-summary-reload`); reload.focus(); await h.poll();
  assert.equal(h.el(`history-${B}-summary-reload`), reload); assert.equal(h.doc.activeElement, reload);
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 1);
  await h.act('nav-new'); await h.act('nav-history'); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /0 von 2/u, 'the expanded summary is reloaded instead of appearing blank');
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 2);
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
  await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
  const text = h.el(`history-${B}-summary`).textContent;
  assert.match(text, /Optionale Kopien: 1 von 2 verfügbaren Dokumentständen zum Kopieren bestätigt/u);
  assert.match(text, /1 zusätzliche Markdown-Kopien gespeichert · nicht anonymisiert/u);
  assert.match(text, /ursprünglichen Markdown-Ergebnisse.*keine Freigabe erforderlich/u);
  assert.equal(h.el(`history-${B}-summary-toggle`).textContent, 'Nachkorrekturen und Kopien');
  assert.doesNotMatch(text, /abgeschlossene KI-Exporte|menschlich freigegeben|Neuester datierter/u);
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
  await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
  assert.match(h.el(`history-${B}-summary`).textContent, /0 von 2/u);
  approved = 1; h.model.entries[0] = { ...h.model.entries[0], approved_count: 1 };
  await h.poll(); await tick();
  assert.match(h.el(`history-${B}-summary`).textContent, /1 von 2/u);
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 2);
});

testAsync('history has one next action and keyboard disclosure retains its state across a changed poll', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    results_available: true, ledger_available: true, status: 'results_available' }];
  await h.act('nav-history');
  const extra = h.el(`history-${B}-extra`), more = h.el(`history-${B}-more`);
  const main = h.nodes.filter(node => node.isConnected && node.attrs['data-history-main'] === 'true');
  assert.equal(main.length, 1); assert.equal(main[0].textContent, 'Dokumente und Freigaben öffnen');
  assert.equal(h.el(`history-${B}-summary`).hidden, true, 'metadata is secondary, not an extra primary click');
  assert.equal(extra.children.includes(h.el(`history-${B}-summary-toggle`)), false,
    'approval and export status is directly reachable without expanding extra actions');
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
  await h.act(`history-${B}-summary-toggle`);
  assert.equal(main.disabled, false); assert.equal(h.el(`history-${B}-summary-reload`).disabled, true);
  resolve(reviewSummary()); await tick();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Exportvorschau');
  assert.equal(h.el(`history-${B}-summary-reload`).hidden, false);
});

testAsync('collapsing an in-flight approval summary keeps the direct action and discards the late response', async () => {
  let resolve; const delayed = new Promise(yes => { resolve = yes; });
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? delayed : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); const main = h.el(`history-${B}-documents`);
  await h.act(`history-${B}-summary-toggle`); await h.act(`history-${B}-summary-toggle`);
  assert.equal(main.disabled, false); assert.equal(h.el(`history-${B}-summary`).hidden, true);
  resolve(reviewSummary()); await tick(); await h.poll();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Dokumente und Freigaben öffnen');
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
  await h.act(`history-${B}-summary-toggle`); await h.act(`history-${B}-more`); await h.act(`history-${B}-results`);
  resolveSummary(reviewSummary()); await tick(); assert.equal(main.disabled, true, 'native command remains in flight');
  resolveFolder({ ok: true }); await tick();
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Dokumente und Freigaben öffnen');
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

testAsync('one history click opens the actual document renderer with 72 unapproved results, not a metadata summary', async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_document_reviews') { assert.equal(args.batchId, B); return documentResponse(); }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 72, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-documents`);
  assert.equal(h.el('documents-view').hidden, false); assert.equal(h.el('history-view').hidden, true);
  assert.equal(h.el('nav-history').attrs['aria-controls'], 'documents-view');
  assert.equal(h.el('documents-list').children.length, 72);
  assert.equal(h.el('documents-selected').textContent, '0 ausgewählt · 0 von 72 freigegeben');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.equal(h.el('documents-approve').disabled, true); assert.equal(h.el('documents-export').disabled, true);
  noAutomaticDecision(h);
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

for (const mode of ['markdown-and-anonymize']) testAsync(`owned final review opens actual ${mode} results of the same run without approval or export`, async () => {
  const h = harness({ documentRenderer: true, invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: false, run_complete: true };
    if (command === 'get_document_reviews') { assert.equal(args.batchId, B); return documentResponse(mode); }
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: mode, selected_count: 72, resumable: true, status: 'review_required' }];
  await h.act('nav-history'); await h.act(`history-${B}-continue`);
  await h.window.__DATASECURE_REVIEW__.invoke('get_review_session');
  // Native event can arrive before the close command's response.
  const closing = h.window.__DATASECURE_REVIEW__.invoke('close_review_window');
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await closing;
  assert.equal(h.el('review-frame').src, 'about:blank'); assert.equal(h.el('review-view').hidden, true);
  assert.equal(h.el('documents-view').hidden, false); assert.equal(h.el('history-view').hidden, true);
  assert.equal(h.el('documents-run').textContent, `Lauf ${B.slice(0, 8)}`);
  assert.equal(h.el('documents-list').children.length, 72); assert.equal(h.doc.activeElement.id, 'documents-heading');
  assert.match(h.el('feedback').textContent, /Fundstellenprüfung abgeschlossen.*ausdrücklich frei/u);
  assert.equal(h.el('documents-all').checked, false); noAutomaticDecision(h);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  assert.equal(h.el('documents-view').hidden, false, 'duplicate close cannot leave the new view');
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
  assert.equal(h.el('history-view').hidden, false); assert.equal(h.el('documents-view').hidden, true);
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
  assert.equal(absent.el('history-view').hidden, false);
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
  assert.equal(h.el('history-view').hidden, false);
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
  assert.equal(h.el('history-view').hidden, false);
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
  assert.equal(h.el('history-view').hidden, false); assert.equal(h.el('documents-view').hidden, true);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
});
testAsync('fresh approval summary improves the next action without changing an active, resumable or failed run', async () => {
  for (const [state, label] of [
    [{ status: 'processing' }, null],
    [{ status: 'review_required', resumable: true }, 'Jetzt prüfen'],
    [{ status: 'stopped', resumable: true, failed_count: 1 }, 'Fortsetzen'],
    [{ status: 'export_pending' }, 'Bereitstellung erneut prüfen'],
    [{ status: 'results_available', failed_count: 1 }, 'Probleme ansehen']
  ]) {
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
    }}); await tick();
    h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, ...state }];
    await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
    const main = h.nodes.find(node => node.isConnected && node.attrs['data-history-main'] === 'true');
    assert.equal(main?.textContent || null, label);
    if (label === 'Bereitstellung erneut prüfen' || label === 'Probleme ansehen') {
      await h.act(main); assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
    }
    if (label === 'Probleme ansehen') {
      assert.equal(h.el(`history-${B}-files`).hidden, false);
      assert.equal(h.doc.activeElement, h.el(`history-${B}-files`));
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
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Dokumente und Freigaben öffnen');
  assert.equal(h.nodes.some(node => node.isConnected && node.id === `history-${B}-problems-main`), false);
  await h.act(`history-${B}-summary-toggle`);
  assert.match(row.textContent, /Verarbeitung beendet · 0\/115 freigegeben · 18 ohne OCR nicht umgewandelt/u);
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Dokumente und Freigaben öffnen');
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
  assert.equal(h.el(`history-${B}-problems-main`).textContent, 'Prüfhalte ansehen');
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Prüfung öffnen');
  await h.act(`history-${B}-problems-main`);
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
  assert.match(h.el('history-list').textContent, /Verarbeitung beendet/u);
  await h.act(`history-${B}-summary-toggle`);
  assert.match(h.el('history-list').textContent,
    /Verarbeitung beendet · 132\/132 freigegeben · aktueller Stand noch nicht als KI-Kopie belegt/u);
  assert.equal(h.el(`history-${B}-problems-main`).textContent, 'Prüfhalte ansehen');
  assert.match(h.el(`history-${B}-summary`).textContent, /KI-Kopie: noch keine abgeschlossene Kopie belegt/u);
});

testAsync('exact current export coverage and pending debt determine the explicit history action', async () => {
  for (const [summary, location, label, primary] of [
    [reviewSummary(), 'available', 'Exportvorschau', true],
    [reviewSummary({ current_exported_count: 2 }), 'available', 'Prüfung öffnen', false],
    [reviewSummary({ approved_count: 1 }), 'available', 'Dokumente und Freigaben öffnen', true],
    [reviewSummary({ pending_export_count: 1, pending_confirmation_count: 1 }), 'available', 'Export abgleichen', true],
    [reviewSummary({ unavailable_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary({ unclassified_source_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary({ not_processed_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary(), 'unsafe', 'Prüfstände ansehen', true],
    [reviewSummary(), 'unknown', 'Prüfstände ansehen', true],
    [reviewSummary({ reviewable_count: 0, approved_count: 0, current_exported_count: 0 }), 'available', 'Dokumente und Freigaben öffnen', true]
  ]) {
    const opened = [];
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? summary : fallback();
    }});
    h.window.__DATASECURE_DOCUMENTS__ = { canOpen() { return true; }, async open(...args) { opened.push(args); } };
    await tick(); h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
      result_location: location, status: 'results_available' }];
    await h.act('nav-history');
    const main = h.el(`history-${B}-documents`); await h.act(`history-${B}-summary-toggle`);
    assert.equal(main.textContent, label); assert.equal(main.className === 'primary', primary);
    if (summary.pending_export_count)
      assert.match(h.el('history-list').children[0].children[0].children[2].textContent, /KI-Kopie im Abgleich/u);
    await h.act(main); assert.deepEqual(opened, [[B, { exportPreview: label === 'Exportvorschau' }]]);
    assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'continue_history_batch'].includes(call.command)), false);
  }
});

testAsync('a deleted result folder has no next-action button while private review remains an explicit extra', async () => {
  const h = harness({ invoke(command, args, fallback) {
    return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    failed_count: 1, status: 'results_available', result_location: 'missing', results_available: false }];
  await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
  assert.equal(h.nodes.some(node => node.isConnected && node.attrs['data-history-main'] === 'true'), false);
  assert.equal(h.el('history-list').children[0].children[0].children[2].textContent, 'Ergebnisordner fehlt');
  assert.ok(h.el(`history-${B}-extra`).children.some(node => node.textContent === 'Prüfung öffnen'));
  assert.equal(h.calls.some(call => call.command.startsWith('open_')), false);
});

for (const failure of [false, true]) testAsync(`late ${failure ? 'failed' : 'successful'} approval summary is discarded after navigation`, async () => {
  let resolve, reject;
  const delayed = new Promise((yes, no) => { resolve = yes; reject = no; });
  let reads = 0;
  const h = harness({ invoke(command, args, fallback) { return command === 'get_document_review_history_summary'
    ? ++reads === 1 ? delayed : new Promise(() => {}) : fallback(); }});
  await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
  await h.act('nav-new'); await h.act('nav-history');
  const before = h.el(`history-${B}-summary`).textContent;
  if (failure) reject(Error('STANDALONE_IPC_FAILED'));
  else resolve({ ok: true, available: false, local_ui_only: true, external_disclosure: false });
  await tick(); assert.equal(h.el(`history-${B}-summary`).textContent, before);
});

testAsync('unavailable history summary shows a reason and offers reload without zero counts or mutations', async () => {
  let fail = true;
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_document_review_history_summary') { if (fail) throw Error('DOCUMENT_REVIEW_POLICY_CHANGED');
      return { ok: true, available: false, local_ui_only: true, external_disclosure: false }; }
    return fallback();
  }}); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', result_count: 2, status: 'results_available' }];
  await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
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
  const h = harness(); await selectAndStart(h); await h.act('nav-new');
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
  const h = harness(); await selectAndStart(h); await h.act('nav-new');
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('get_review_session'), /SURFACE_INVALID/u);
  h.model.state = { state: 'review_required', batch_id: A, review_count: 3 }; await h.poll();
  await h.act(h.el('job-actions').children.find(node => node.textContent === 'Jetzt prüfen'));
  const before = h.calls.length;
  await assert.rejects(h.window.__DATASECURE_REVIEW__.invoke('select_files'), /SURFACE_INVALID/u);
  assert.equal(h.calls.length, before, 'no generic parent IPC escape');
  await h.window.__DATASECURE_REVIEW__.invoke('close_review_window').catch(() => {});
  assert.equal(h.calls.at(-1).command, 'close_review_window');
  h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}}); await tick();
  assert.equal(h.doc.activeElement.id, 'job-title', 'status refresh cannot remove the focus return target');
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
  assert.equal(primary[0].id, purpose === 'markdown-only' ? 'job-action-results' : 'job-action-documents');
  assert.match(h.el('job-title').textContent, purpose === 'markdown-only' ? /Textübernahme abgeschlossen/u : /Dokumentprüfung offen/u);
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
testAsync('a real failure remains primary and red next to expected raw omissions', async () => {
  const fb = conversionFeedback({ ocr_omitted_count: 16, error_count: 1 });
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false, conversion_feedback: fb,
      files: [{ name: 'Defekt.pdf', reason_code: 'SOURCE_READ_FAILED', classification: 'error' },
        { name: 'Scan.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' }] };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-only', status: 'results_available', selected_count: 133,
    result_count: 116, failed_count: 17, results_available: true, conversion_feedback: fb }];
  await h.act('nav-history'); await h.act(`history-${B}-problems-main`);
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
  assert.equal(h.el(`history-${B}-problems-main`).textContent, 'Probleme ansehen');
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
  assert.match(h.el('history-list').textContent, /Ergebnisdateien dieses Laufs lokal ergänzen.*keine KI-Kopie/u);
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

for (const origin of ['new', 'history']) testAsync(`owned raw contact completion returns to ${origin}, never opens a second mandatory review`, async () => {
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
  assert.equal(h.el(`${origin}-view`).hidden, false);
  assert.equal(h.calls.some(call => call.command === 'get_document_reviews'), false);
  assert.match(h.el('feedback').textContent, /OCR-Kontaktprüfung abgeschlossen/u);
  assert.doesNotMatch(h.el('feedback').textContent, /ausdrücklich frei|KI-Export/u);
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, startsBefore);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents', 'abandon_document_export'].includes(call.command)), false);
  await h.listeners.get('datasecure-review-closed')({payload: {closed: true, review_generation: 1}});
  assert.equal(h.el(`${origin}-view`).hidden, false);
  if (origin === 'history') await h.act(`history-${batchId}-documents`);
  else await h.act('job-action-documents');
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
  assert.equal(h.el('history-view').hidden, false); assert.equal(h.el('documents-view').hidden, true);
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
  assert.equal(h.el('job-action-documents').textContent, 'Prüfstände ansehen');
  assert.equal(h.el(`history-${B}-documents`).textContent, 'Prüfstände ansehen');
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

done();
