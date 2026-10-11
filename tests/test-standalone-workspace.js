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
  const nodes = [], roots = new Map(), calls = [], timers = new Set(), listeners = new Map();
  const doc = { activeElement: null };
  const createElement = tag => {
    const node = { tagName: tag.toUpperCase(), id: '', children: [], parent: null, attrs: {}, events: new Map(), dataset: {},
      hidden: false, disabled: false, checked: false, indeterminate: false, tabIndex: 0, value: '', className: '', ownText: '', textUpdates: 0,
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.ownText = ''; this.append(...children); },
      addEventListener(event, callback) { this.events.set(event, callback); },
      setAttribute(key, value) { this.attrs[key] = String(value); }, removeAttribute(key) { delete this.attrs[key]; },
      focus() { doc.activeElement = this; },
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
      if (command === 'get_run_history') return { local_ui_only: true, external_disclosure: false, entries: model.entries };
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
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn) });
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

testAsync('raw OCR contact review is explicit opt-in, never preselected or silently enabled', async () => {
  for (const optIn of [false, true]) {
    const h = harness(); await tick(); await h.act('select-folder');
    h.el('mode-markdown').checked = true; await h.act('mode-markdown', 'change');
    assert.equal(h.el('ocr-review').checked, false);
    if (optIn) { h.el('ocr-review').checked = true; await h.act('ocr-review', 'change'); }
    await h.act('start');
    const started = h.calls.find(call => call.command === 'start_admitted_batch');
    assert.equal(started.args.ocrContactReview, optIn ? true : undefined);
  }
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
  assert.match(summary.textContent, /0 von 2 verfügbaren Dokumentprüfständen menschlich freigegeben/u);
  assert.match(summary.textContent, /1 Dokumentprüfstände nicht verfügbar/u);
  assert.match(summary.textContent, /1 Quelldateien mit unklarem früheren Ergebnisstatus/u);
  assert.match(summary.textContent, /vollständige Freigabe dieses Laufs ist nicht belegbar/u);
  assert.match(summary.textContent, /3 abgeschlossene KI-Exporte/u);
  assert.match(summary.textContent, /1 unvollständige Exportaufträge · 1 fertige Kopien mit offener Empfangsbestätigung/u);
  const reload = h.el(`history-${B}-summary-reload`); reload.focus(); await h.poll();
  assert.equal(h.el(`history-${B}-summary-reload`), reload); assert.equal(h.doc.activeElement, reload);
  assert.equal(h.calls.filter(row => row.command === 'get_document_review_history_summary').length, 1);
  await h.act('nav-new'); await h.act('nav-history');
  assert.doesNotMatch(h.el(`history-${B}-summary`).textContent, /0 von 2/u, 're-entry never labels the previous snapshot as current');
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
  assert.match(text, /1 von 2 verfügbaren Dokumentprüfständen textgeprüft · nicht anonymisiert/u);
  assert.match(text, /1 abgeschlossene Markdown-Exporte · nicht anonymisiert/u);
  assert.doesNotMatch(text, /abgeschlossene KI-Exporte|menschlich freigegeben|Neuester datierter/u);
});

testAsync('history has one next action and keyboard disclosure retains its state across a changed poll', async () => {
  const h = harness(); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
    results_available: true, ledger_available: true, status: 'results_available' }];
  await h.act('nav-history');
  const extra = h.el(`history-${B}-extra`), more = h.el(`history-${B}-more`);
  const main = h.nodes.filter(node => node.isConnected && node.attrs['data-history-main'] === 'true');
  assert.equal(main.length, 1); assert.equal(main[0].textContent, 'Ergebnisse prüfen und freigeben');
  assert.equal(h.el(`history-${B}-summary`).hidden, true, 'metadata is secondary, not an extra primary click');
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
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Ergebnisse prüfen und freigeben');
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
  assert.equal(main.disabled, false); assert.equal(main.textContent, 'Ergebnisse prüfen und freigeben');
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
  assert.equal(h.el('documents-list').children.length, 72);
  assert.equal(h.el('documents-selected').textContent, '0 ausgewählt · 0 von 72 freigegeben');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_history_summary'), false);
  assert.equal(h.el('documents-approve').disabled, true); assert.equal(h.el('documents-export').disabled, true);
  noAutomaticDecision(h);
});

for (const mode of ['markdown-only', 'markdown-and-anonymize']) testAsync(`owned final review opens actual ${mode} results of the same run without approval or export`, async () => {
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

testAsync('unrequested closure and a completion flag on a ready session cannot navigate or imply final completion', async () => {
  const h = harness({ invoke(command, args, fallback) {
    if (command === 'get_review_session') return { ready: true, run_complete: true };
    return fallback();
  } }); await tick();
  h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', resumable: true, status: 'review_required' }];
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
    [{ status: 'export_pending' }, 'Bereitstellung prüfen'],
    [{ status: 'results_available', failed_count: 1 }, 'Probleme ansehen']
  ]) {
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? reviewSummary() : fallback();
    }}); await tick();
    h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2, ...state }];
    await h.act('nav-history'); await h.act(`history-${B}-summary-toggle`);
    const main = h.nodes.find(node => node.isConnected && node.attrs['data-history-main'] === 'true');
    assert.equal(main?.textContent || null, label);
    if (label === 'Bereitstellung prüfen' || label === 'Probleme ansehen') {
      await h.act(main); assert.equal(h.calls.some(call => call.command === 'continue_history_batch'), false);
    }
    if (label === 'Probleme ansehen') {
      assert.equal(h.el(`history-${B}-files`).hidden, false);
      assert.equal(h.doc.activeElement, h.el(`history-${B}-files`));
    }
  }
});

testAsync('exact current export coverage and pending debt determine the explicit history action', async () => {
  for (const [summary, location, label, primary] of [
    [reviewSummary(), 'available', 'Exportvorschau', true],
    [reviewSummary({ current_exported_count: 2 }), 'available', 'Prüfung öffnen', false],
    [reviewSummary({ approved_count: 1 }), 'available', 'Ergebnisse prüfen und freigeben', true],
    [reviewSummary({ pending_export_count: 1, pending_confirmation_count: 1 }), 'available', 'Export abgleichen', true],
    [reviewSummary({ unavailable_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary({ unclassified_source_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary({ not_processed_count: 1 }), 'available', 'Prüfstände ansehen', true],
    [reviewSummary(), 'unsafe', 'Prüfstände ansehen', true],
    [reviewSummary(), 'unknown', 'Prüfstände ansehen', true],
    [reviewSummary({ reviewable_count: 0, approved_count: 0, current_exported_count: 0 }), 'available', 'Ergebnisse prüfen und freigeben', true]
  ]) {
    const opened = [];
    const h = harness({ invoke(command, args, fallback) {
      return command === 'get_document_review_history_summary' ? summary : fallback();
    }});
    h.window.__DATASECURE_DOCUMENTS__ = { async open(...args) { opened.push(args); } };
    await tick(); h.model.entries = [{ batch_id: B, processing_mode: 'markdown-and-anonymize', result_count: 2,
      result_location: location, status: 'results_available' }];
    await h.act('nav-history');
    const main = h.el(`history-${B}-documents`); await h.act(`history-${B}-summary-toggle`);
    assert.equal(main.textContent, label); assert.equal(main.className === 'primary', primary);
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
  const h = harness({ invoke(command, args, fallback) { return command === 'get_document_review_history_summary' ? delayed : fallback(); }});
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
  assert.match(h.el(`history-${B}-summary`).textContent, /kein nachträglicher Dokumentprüfstand erfasst/u);
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
  assert.match(region.textContent, /Verarbeitung abgeschlossen/u); assert.match(region.textContent, /2 Dateien mit Problemen/u);
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
  h.window.__DATASECURE_DOCUMENTS__ = { invalidateConnection() {} };
  const prior = h.calls.filter(call => call.command === 'start_admitted_batch').length;
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'recovering'}});
  assert.equal(h.el('catalogue').hidden, true);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
  await h.act('start');
  h.model.catalogue = [];
  h.listeners.get('datasecure-connection')({payload: {epoch: 1, state: 'ready'}});
  await h.poll();
  assert.equal(h.calls.filter(call => call.command === 'start_admitted_batch').length, prior);
  assert.match(h.el('feedback').textContent, /wiederhergestellt/u);
  assert.equal(h.el('start').attrs['aria-disabled'], 'true');
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

testAsync('initial Ready neither discards a valid picker nor lets an older initial context erase it', async () => {
  let finish, initial = true;
  const delayed = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args, fallback) {
    if (command === 'get_ui_context' && initial) { initial = false; return delayed; }
    return fallback();
  }});
  await tick();
  h.listeners.get('datasecure-connection')({payload: {epoch: 0, state: 'ready'}});
  await h.act('select-folder');
  finish({local_ui_only: true, external_disclosure: false, source_catalogue: [], catalogue_revision: 0});
  await tick(); await tick();
  assert.equal(h.el('selection-count').textContent, '3 von 3 ausgewählt');
  assert.equal(h.el('catalogue').hidden, false);
});

done();
