'use strict';
// Actual document renderer in a minimal DOM: transition evidence, not layout
// or native IPC injection. Browser and packaged tests are separate gates.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Standalone document review renderer');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/document-review.js'), 'utf8');
const positionsSource = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/text-positions.js'), 'utf8');
const positions = require('../apps/datasecure-standalone/frontend/text-positions');
const tick = () => new Promise(resolve => setImmediate(resolve));
const textTree = node => [node.textContent, ...(node.children || []).map(textTree)].join(' ');
const isDecision = call => ['decide_document_review', 'decide_document_review_batch'].includes(call.command);
function harness(options = {}) {
  const nodes = new Map(), calls = [], guides = [], rows = [1, 2].map(n => ({ name: `Quelle-${n}.pdf`, document_id: String(n).repeat(32), revision: 0,
    output_sha256: String(n).repeat(64), chunks: 1, approved: false, text_modified: false, processing_mode: 'markdown-and-anonymize' }));
  let published = options.resultPublication || null;
  const intervals = new Set(); let now = 0, wallClockOffset = 0, resultFolder = options.resultFolder;
  const document = { activeElement: null };
  const create = tag => ({ tag, children: [], events: new Map(), dataset: {}, textContent: '', value: '', disabled: false, checked: false, isConnected: true,
    append(...values) { this.children.push(...values); }, replaceChildren(...values) { this.children = values; },
    setAttribute() {}, focus() { this.focused = true; document.activeElement = this; }, addEventListener(event, fn) { this.events.set(event, fn); },
    click() { this.events.get('click')?.(); },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    showModal() { this.open = true; }, close() { this.open = false; this.events.get('close')?.(); } });
  const el = id => { if (!nodes.has(id)) {
    const node = create('div');
    if (['document-original', 'document-markdown'].includes(id)) {
      let value = '';
      // WHATWG textarea API-value behavior, independently of the production
      // coordinate adapter. Native WebView coverage remains a separate gate.
      Object.defineProperty(node, 'value', { get() { return value; }, set(next) {
        value = String(next).replace(/\r\n?/gu, '\n'); node.selectionStart = node.selectionEnd = value.length;
      } });
    }
    nodes.set(id, node);
  } return nodes.get(id); };
  const invoke = async (command, args) => {
    calls.push({ command, args: structuredClone(args) });
    if (options.invoke) { const response = await options.invoke(command, args); if (response !== undefined) {
      if (command === 'configure_results' && response?.ok === true && response.configuration_changed === true) resultFolder = response.result_folder;
      return response;
    } }
    if (command === 'get_document_reviews') return { documents: structuredClone(rows), unavailable: [], processing_complete: true,
      result_publication: published || { state: rows.some(row => row.text_modified) ? 'pending' : 'initial', generation_id: null,
        count: rows.length, current_revision: Math.max(...rows.map(row => row.revision)) }, local_ui_only: true, external_disclosure: false };
    if (command === 'publish_result_documents') {
      published = { state: 'current', generation_id: 'e'.repeat(32), count: rows.length,
        current_revision: Math.max(...rows.map(row => row.revision)) };
      return { ok: true, batch_id: args.batchId, result_publication: published, local_ui_only: true, external_disclosure: false };
    }
    if (command === 'open_history_results') return { ok: true };
    if (command === 'preview_document_export') return { ok: true, processing_mode: rows[0].processing_mode, result_folder: resultFolder, local_ui_only: true, external_disclosure: false,
      files: args.selection.map((row, index) => ({ name: rows[0].processing_mode === 'markdown-only' ? `Quelle-${index + 1}.md` : `Dokument_${String(index + 1).padStart(2, '0')}.md`, sha256: row.output_sha256 })) };
    if (command === 'get_document_review_chunk') return { ...rows.find(row => row.document_id === args.documentId), chunk_index: args.chunkIndex,
      original_text: 'Anna Beispiel: 42 Projekte.', markdown: options.maskAfterRevision && rows.find(row => row.document_id === args.documentId).revision > 0 ?
        '[PERSON_001]: [MANUAL_REDACTION] Projekte.' : options.strictBindings ? `Stand ${rows.find(row => row.document_id === args.documentId).revision}` :
          '[PERSON_001]: 42 Projekte.', local_ui_only: true, external_disclosure: false };
    if (command === 'decide_document_review_batch') {
      const selected = args.decision.selection.map(binding => {
        const row = rows.find(row => row.document_id === binding.document_id);
        if (options.strictBindings) { assert.equal(binding.revision, row.revision); assert.equal(binding.output_sha256, row.output_sha256); }
        return row;
      });
      for (const row of selected) { row.revision++; row.approved = args.decision.action === 'approve'; }
      return { ok: true, operation_id: args.decision.operation_id, affected_count: selected.length,
        documents: structuredClone(selected), local_ui_only: true, external_disclosure: false };
    }
    if (command === 'decide_document_review') { const row = rows.find(row => row.document_id === args.documentId);
      if (options.strictBindings) { assert.equal(args.decision.revision, row.revision); assert.equal(args.decision.output_sha256, row.output_sha256); }
      row.revision++; row.approved = args.decision.action === 'approve';
      if (!['approve', 'revoke'].includes(args.decision.action)) { row.text_modified = true; published = null; }
      return { ok: true, ...structuredClone(row), local_ui_only: true, external_disclosure: false }; }
    if (command === 'export_approved_documents') return { ok: true, operation_id: args.operationId, exported_count: args.selection.length,
      folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false };
    if (command === 'close_document_reviews') return { ok: true }; throw Error('unexpected command');
  };
  const window = { __TAURI__: { core: { invoke } } };
  document.getElementById = el; document.createElement = create;
  const clock = class extends Date { static now() { return now + wallClockOffset; } };
  const context = vm.createContext({ document, window, crypto: crypto.webcrypto, Date: clock, performance: { now: () => now },
    setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/workflow-presentation.js'), 'utf8'), context);
  vm.runInContext(positionsSource, context);
  window.__DATASECURE_RUN_GUIDE__ = { documents(value) { guides.push(window.__DATASECURE_PRESENTATION__.projectRun(value)); } };
  vm.runInContext(source, context);
  return { el, document, calls, rows, guides, api: window.__DATASECURE_DOCUMENTS__,
    advance(milliseconds) { now += milliseconds; for (const fn of [...intervals]) fn(); },
    adjustWallClock(milliseconds) { wallClockOffset += milliseconds; },
    activeIntervals() { return intervals.size; },
    async act(target, event = 'click') { (typeof target === 'string' ? el(target) : target).events.get(event)?.(); await tick();
      if (target === 'documents-approve' && !options.explicitApproval && !el('documents-approve-confirm').hidden) {
        el('documents-approve-proceed').events.get('click')?.(); await tick();
      } },
    async all() { el('documents-all').checked = true; await this.act('documents-all', 'change'); },
    async mark(start, end) { const node = el('document-markdown'); node.focus(); node.setSelectionRange(start, end); await this.act(node, 'select'); },
    async export() { await this.act('documents-export'); await this.act('document-export-confirm'); } };
}
testAsync('completed anonymization run no longer claims its processing completion is unconfirmed', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, result_publication: { state: 'initial', generation_id: null, count: 2, current_revision: 0 },
      unavailable: [], not_processed_documents: [], local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64));
  const guide = h.guides.at(-1);
  assert.equal(guide.phase, 'results_ready');
  assert.doesNotMatch(guide.next, /Laufabschluss ist noch nicht bestätigt/u);
  assert.match(h.el('document-edit-hint').textContent, /Wähle links ein Dokument/u);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('document guide retains source OCR hints independently of successful publication and later approval', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, unavailable: [], not_processed_documents: [], content_notice_count: 1,
      content_notice_breakdown_complete: true, local_ui_only: true, external_disclosure: false };
  } });
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.guides.at(-1).phase, 'results_ready');
  assert.equal(h.guides.at(-1).stages[0].status, 'warning');
  assert.match(h.guides.at(-1).next, /1 erstellte Datei enthält Inhaltshinweise/u);
  assert.doesNotMatch(h.guides.at(-1).next, /Laufabschluss ist noch nicht bestätigt/u);
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
});
testAsync('automatic masking exposes ready result files without another selection or approval/export', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      review_policy: 'automatic-conservative', processing_complete: true, unavailable: [], not_processed_documents: [],
      local_ui_only: true, external_disclosure: false };
  } });
  for (const row of h.rows) Object.assign(row, { approved: true, approval_basis: 'automatic', review_policy: 'automatic-conservative' });
  await h.api.open('a'.repeat(64));
  assert.match(h.el('documents-purpose').textContent, /nicht manuell geprüft/u);
  assert.match(textTree(h.el('documents-list')), /Ergebnis|Markdown verfügbar/u);
  assert.equal(h.el('documents-main-guide').hidden, true);
  assert.equal(h.guides.at(-1).heading, 'Anonymisierte Ergebnisse bereit');
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
  assert.equal(h.el('documents-approval-extras').hidden, true);
  assert.equal(h.el('documents-export').hidden, true);
  assert.equal(h.el('documents-open-results').disabled, false);
  await h.act('documents-open-results');
  assert.deepEqual(h.calls.filter(call => call.command === 'open_history_results').map(call => call.args), [{ batchId: 'a'.repeat(64) }]);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  assert.equal(h.calls.some(isDecision), false);
});

testAsync('automatic provenance cannot be asserted by an unbound row or a non-basis revision', async () => {
  for (const change of [{ revision: 1 }, { review_policy: undefined }, { approved: false }]) {
    const h = harness();
    Object.assign(h.rows[0], { review_policy: 'automatic-conservative', approval_basis: 'automatic', approved: true }, change);
    await h.api.open('a'.repeat(64));
    assert.equal(h.el('documents-export').disabled, true);
    assert.match(h.el('documents-status').textContent, /nicht konsistent/u);
    assert.equal(h.calls.some(isDecision), false);
  }
});

testAsync('loading a private review never claims the run purpose is missing before the reply arrives', async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const h = harness({ invoke(command) { if (command === 'get_document_reviews') return pending; } });
  const opening = h.api.open('a'.repeat(64));
  assert.match(h.el('documents-heading').textContent, /werden geladen/u);
  assert.match(h.el('documents-purpose').textContent, /Bitte warten/u);
  assert.doesNotMatch(h.el('documents-purpose').textContent, /nicht mehr belegbar/u);
  assert.equal(h.el('documents-export').disabled, true);
  complete({ documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
    processing_complete: true, unavailable: [], not_processed_documents: [],
    local_ui_only: true, external_disclosure: false });
  await opening;
  assert.match(h.el('documents-heading').textContent, /Ergebnisse nachbearbeiten \(optional\)/u);
});
testAsync('bound OCR-off omissions in anonymization are notices, not technical converter errors', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, unavailable: [], local_ui_only: true, external_disclosure: false,
      not_processed_documents: [{ document_id: '3'.repeat(32), name: 'scan.png', reason_code: 'IMAGE_OCR_REQUIRED',
        classification: 'ocr_omission' }] };
  } });
  await h.api.open('a'.repeat(64));
  const panel = h.el('documents-unavailable');
  assert.equal(panel.children.length, 1);
  assert.match(textTree(panel), /Ohne OCR nicht umgewandelt/u);
  assert.doesNotMatch(textTree(panel), /Dateien mit technischen Fehlern/u);
  assert.match(h.guides.at(-1).next, /OCR war ausgeschaltet; 1 Bild- oder Scan-Datei wurde/u);
  assert.doesNotMatch(h.guides.at(-1).next, /Laufabschluss ist noch nicht bestätigt/u);
});
testAsync('bound privacy stop has its own non-reviewable category and accurate next step', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, unavailable: [], local_ui_only: true, external_disclosure: false,
      not_processed_documents: [{ document_id: '3'.repeat(32), name: 'long.txt', reason_code: 'AMBIGUITY_REVIEW_REQUIRED',
        classification: 'privacy_stop' }] };
  } });
  await h.api.open('a'.repeat(64));
  const panel = h.el('documents-unavailable');
  assert.match(textTree(panel), /Aus Datenschutzgründen angehalten/u);
  assert.match(textTree(panel), /keinen freigabefähigen Prüfstand/u);
  assert.doesNotMatch(textTree(panel), /Dateien mit technischen Fehlern/u);
});
testAsync('checkboxes only select; explicit bulk approval covers exactly the selected documents', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all();
  assert.equal(h.calls.some(isDecision), false);
  assert.equal(h.el('documents-export').disabled, false, 'preview can precede the combined export confirmation');
  await h.act('documents-approve'); assert.equal(h.calls.filter(isDecision).length, 1);
  assert.equal(h.calls.find(isDecision).command, 'decide_document_review_batch');
  assert.deepEqual(h.calls.find(isDecision).args.decision.selection.map(row => row.document_id), h.rows.map(row => row.document_id));
  assert.equal(h.el('documents-export').disabled, false);
});

testAsync('unopened anonymized documents require a separate bound human confirmation before bulk approval', async () => {
  const h = harness({ explicitApproval: true }); await h.api.open('a'.repeat(64)); await h.all();
  await h.act('documents-approve');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 0);
  assert.match(h.el('documents-approve-confirm-text').textContent, /2 von 2.*nicht.*geöffnet/u);
  await h.act('documents-approve-cancel');
  assert.equal(h.el('documents-approve-confirm').hidden, true);
  await h.act('documents-approve');
  h.el('documents-all').checked = false; await h.act('documents-all', 'change');
  await h.act('documents-approve-proceed');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 0);
  assert.match(h.el('documents-status').textContent, /Auswahl.*geändert/u);
  await h.all();
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.act('documents-approve');
  assert.match(h.el('documents-approve-confirm-text').textContent, /1 von 2.*nicht.*geöffnet/u);
  await h.act('documents-approve-proceed');
  assert.equal(h.calls.filter(isDecision).length, 1);
});

testAsync('export preview exposes available scope and excluded OCR/privacy sources before copying', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, unavailable: [], local_ui_only: true, external_disclosure: false,
      not_processed_documents: [
        { document_id: '3'.repeat(32), name: 'scan.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' },
        { document_id: '4'.repeat(32), name: 'unsafe.txt', reason_code: 'AMBIGUITY_REVIEW_REQUIRED', classification: 'privacy_stop' }] };
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.act('documents-export');
  assert.equal(h.el('document-export-dialog').open, true);
  assert.match(h.el('document-export-purpose').textContent, /2 ausgewählte.*4 Quelldateien.*2 davon.*1 ohne OCR.*1 aus Datenschutzgründen/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('bulk approval shows only its confirmed progress until the saved state is reloaded', async () => {
  let finish, request;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'decide_document_review_batch') { request = args.decision; return pending; }
  } });
  await h.api.open('a'.repeat(64)); await h.all();
  h.el('documents-approve').events.get('click')();
  const approving = h.el('documents-approve-proceed').events.get('click')();
  await tick();
  assert.equal(h.el('documents-review-controls').hidden, true);
  assert.equal(h.el('documents-bulk-progress').hidden, false);
  assert.match(h.el('documents-bulk-count').textContent, /0 von 2 Entscheidungen bestätigt/u);
  h.rows.forEach(row => { row.revision++; row.approved = true; });
  finish({ ok: true, operation_id: request.operation_id, affected_count: 2, documents: structuredClone(h.rows), local_ui_only: true, external_disclosure: false });
  await approving; await tick();
  assert.equal(h.el('documents-review-controls').hidden, false);
  assert.equal(h.el('documents-bulk-progress').hidden, true);
  assert.match(h.el('documents-status').textContent, /2 Freigabeentscheidungen gespeichert/u);
});

testAsync('reload invalidates changed or removed comparisons and their selection in both purposes', async () => {
  for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
    for (const change of ['revision', 'hash', 'chunks', 'removed']) {
      const h = harness({ strictBindings: true }); h.rows.forEach(row => { row.processing_mode = processingMode; });
      await h.api.open('a'.repeat(64));
      await h.act(h.el('documents-list').children[0].children[1].children[0]);
      await h.all();
      if (change === 'revision') h.rows[0].revision++;
      else if (change === 'hash') h.rows[0].output_sha256 = '4'.repeat(64);
      else if (change === 'chunks') h.rows[0].chunks++;
      else h.rows.shift();
      await h.act('documents-reload');
      assert.equal(h.el('document-original').value, '', `${processingMode}/${change}: no old source comparison`);
      assert.equal(h.el('document-markdown').value, '', `${processingMode}/${change}: no old Markdown comparison`);
      assert.equal(h.el('document-revision').textContent, '');
      assert.equal(h.el('document-entities').hidden, true);
      assert.match(h.el('documents-selected').textContent, /Ergebnisdateien verfügbar/u);
      await h.act('documents-approve');
      assert.deepEqual(h.calls.filter(call => call.command === 'decide_document_review').map(call => call.args.documentId),
        processingMode === 'markdown-only' ? [] : ['2'.repeat(32)], 'changed state cannot inherit a previous checkbox approval intent');
    }
  }
});

testAsync('purpose changes invalidate the full comparison and all approval intent', async () => {
  const h = harness({ strictBindings: true }); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]); await h.all();
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; }); await h.act('documents-reload');
  assert.equal(h.el('document-markdown').value, ''); assert.equal(h.el('documents-approve').disabled, true);
  await h.act('documents-approve'); assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
});

testAsync('another selected document changing cannot inherit intent while the viewed binding remains current', async () => {
  const h = harness({ strictBindings: true }); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]); await h.all();
  h.rows[1].revision++; await h.act('documents-reload');
  assert.equal(h.el('document-markdown').value, 'Stand 0');
  await h.act('documents-approve');
  assert.deepEqual(h.calls.filter(call => call.command === 'decide_document_review').map(call => call.args.documentId), ['1'.repeat(32)]);
});

testAsync('reload retains a comparison and selection only for an unchanged binding', async () => {
  for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
    const h = harness(); h.rows.forEach(row => { row.processing_mode = processingMode; });
    await h.api.open('a'.repeat(64));
    await h.act(h.el('documents-list').children[0].children[1].children[0]); await h.all();
    const original = h.el('document-original').value, markdown = h.el('document-markdown').value;
    await h.act('documents-reload');
    assert.equal(h.el('document-original').value, original);
    assert.equal(h.el('document-markdown').value, markdown);
    assert.match(h.el('document-revision').textContent, /Stand 0/u);
    assert.match(h.el('documents-selected').textContent, /^2 angezeigt · 2 Ergebnisdateien verfügbar/u);
  }
});

testAsync('ordinary reload never overwrites an unsaved raw correction draft', async () => {
  const h = harness(); h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').value = 'Meine noch nicht gespeicherte Korrektur';
  await h.act('document-markdown', 'input');
  const callsBefore = h.calls.length;
  h.rows[0].revision++; await h.act('documents-reload');
  assert.equal(h.calls.length, callsBefore);
  assert.equal(h.el('document-markdown').value, 'Meine noch nicht gespeicherte Korrektur');
  assert.equal(h.el('documents-approve').disabled, true);
});

testAsync('an old history export-preview navigation never creates a new selection or copy', async () => {
  const h = harness(); h.rows.forEach(row => { row.approved = true; row.revision = 7; });
  await h.api.open('a'.repeat(64), { exportPreview: true });
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, 1);
  assert.notEqual(h.el('document-export-dialog').open, true);
  assert.equal(h.el('documents-export').hidden, true);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
  assert.equal(h.calls.some(call => call.command === 'preview_document_export'), false);
});

testAsync('stale history cannot propose a partial, raw, unavailable or pending-intent export', async () => {
  for (const condition of ['revoked', 'raw', 'missing', 'unknown', 'pending', 'empty', 'failure']) {
    const h = harness({ invoke(command) {
      if (command !== 'get_document_reviews') return;
      if (condition === 'failure') throw Error('STANDALONE_BUSY');
      return { documents: condition === 'empty' ? [] : structuredClone(h.rows),
        unavailable: condition === 'missing' ? [{ name: 'missing.pdf', document_id: '3'.repeat(32) }] : [],
        unclassified_documents: condition === 'unknown' ? [{ name: 'unknown.pdf', document_id: '3'.repeat(32) }] : [],
        pending_exports: condition === 'pending' ? [{ operation_id: 'e'.repeat(32), digest: 'd'.repeat(64), status: 'incomplete',
          selection: [{ document_id: '1'.repeat(32), revision: 1, output_sha256: '1'.repeat(64) }], processing_mode: 'markdown-and-anonymize' }] : [],
        local_ui_only: true, external_disclosure: false };
    }});
    h.rows.forEach(row => { row.approved = true; if (condition === 'raw') row.processing_mode = 'markdown-only'; });
    if (condition === 'revoked') h.rows[0].approved = false;
    await h.api.open('a'.repeat(64), { exportPreview: true });
    assert.equal(h.el('document-export-dialog').open === true, condition === 'pending', condition);
    assert.equal(h.calls.some(call => call.command === 'preview_document_export'), condition === 'pending');
    assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
  }
});

testAsync('closing while a history export preview loads prevents the late dialog from opening', async () => {
  let resolve; const delayed = new Promise(yes => { resolve = yes; });
  const h = harness({ invoke(command) { if (command === 'get_document_reviews') return delayed; } });
  h.rows.forEach(row => { row.approved = true; });
  const opening = h.api.open('a'.repeat(64), { exportPreview: true }); await tick();
  assert.equal(await h.api.close(), true);
  resolve({ documents: structuredClone(h.rows), local_ui_only: true, external_disclosure: false }); await opening;
  assert.notEqual(h.el('document-export-dialog').open, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('missing and unproven document names remain visible while comparing another available file', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { local_ui_only: true, external_disclosure: false,
      documents: [{ name: 'available.pdf', document_id: '1'.repeat(32), revision: 0, output_sha256: '1'.repeat(64),
        chunks: 1, approved: false, processing_mode: 'markdown-and-anonymize' }],
      unavailable: [{ name: 'nested/missing.docx', document_id: '2'.repeat(32), reason_code: 'DOCUMENT_REVIEW_MISSING' }],
      unclassified_documents: [{ name: 'nested/unknown.xlsx', document_id: '3'.repeat(32) }] };
  }});
  await h.api.open('a'.repeat(64));
  const panel = h.el('documents-unavailable'); assert.equal(panel.hidden, false);
  const text = () => textTree(panel);
  assert.match(text(), /nested\/missing\.docx.*fehlt oder ist nicht lesbar/u);
  assert.match(text(), /nested\/unknown\.xlsx.*Früherer Ergebnisstatus nicht mehr belegbar/u);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.match(text(), /missing\.docx/u); assert.match(text(), /unknown\.xlsx/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('every terminal processing reason remains display-only and cannot block healthy document review', async () => {
  const codes = [...require('../plugins/data-secure/server/core/document-result-grade').REASON_CODES, 'FUTURE_PROCESSING_FAILURE'];
  for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
    for (const reason of codes) {
      const h = harness({ invoke(command) {
        if (command === 'get_document_reviews') return { local_ui_only: true, external_disclosure: false,
          processing_mode: processingMode, documents: structuredClone(h.rows),
          not_processed_documents: [{ name: 'nested/03-defekt.csv', document_id: '3'.repeat(32), reason_code: reason }] };
      }});
      h.rows.forEach(row => { row.processing_mode = processingMode; });
      await h.api.open('a'.repeat(64));
      assert.equal(h.el('documents-list').children.length, 2, `${processingMode}: ${reason}`);
      const text = textTree(h.el('documents-unavailable'));
      assert.ok(text.includes('nested/03-defekt.csv') && text.includes(reason));
      if (reason === 'PARSE_FAILED') assert.match(text, /Dateiinhalt.*gelesen/u);
      await h.all(); await h.act('documents-approve');
      const decisions = h.calls.filter(isDecision);
      assert.equal(decisions.length, processingMode === 'markdown-only' ? 0 : 1);
      assert.ok(decisions.every(call => call.args.decision.selection.every(row => row.document_id !== '3'.repeat(32))), 'a problem row never grants approval authority');
      assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
    }
  }
});

testAsync('malformed problem codes and duplicate document identities still invalidate the response', async () => {
  for (const change of [{ reason_code: '<script>private</script>' }, { reason_code: null },
    { reason_code: 'A'.repeat(82) }, { document_id: '1'.repeat(32) }]) {
    const h = harness({ invoke(command) {
      if (command === 'get_document_reviews') return { local_ui_only: true, external_disclosure: false,
        documents: structuredClone(h.rows), not_processed_documents: [
          { name: 'bad.csv', document_id: '3'.repeat(32), reason_code: 'PARSE_FAILED', ...change }] };
    }});
    await h.api.open('a'.repeat(64));
    assert.match(h.el('documents-status').textContent, /DOCUMENT_REVIEW_INVALID/u);
    assert.equal(h.el('documents-approve').disabled, true);
    assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  }
});

testAsync('completed export opens only by its run/operation IDs; opening and failure never retry or acknowledge a copy', async () => {
  let reject = false;
  const operation = 'e'.repeat(32), batch = 'a'.repeat(64);
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: [], local_ui_only: true, external_disclosure: false,
      export_receipts: [{ operation_id: operation, exported_count: 1, folder_name: `Export-${operation}`, processing_mode: 'markdown-only' }] };
    if (command === 'open_document_export') { if (reject) throw Error('AI_EXPORT_CONFLICT'); return { ok: true, handoff_confirmed: true, external_disclosure: false }; }
  } });
  await h.api.open(batch);
  const item = h.el('documents-export-receipt-list').children[0], open = item.children[1];
  assert.match(item.children[0].textContent, /DataSecure-Markdown-Korrektur.*nicht anonymisiert/u);
  await h.act(open);
  assert.deepEqual(h.calls.find(call => call.command === 'open_document_export').args, { batchId: batch, operationId: operation });
  assert.match(h.el('documents-status').textContent, /kein neuer Export/u);
  reject = true; await h.act(open);
  assert.match(h.el('documents-status').textContent, /Export-.*AI_EXPORT_CONFLICT/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('a raw run with all document bodies lost retains its purpose, and an unknown purpose stays neutral', async () => {
  let processingMode = 'markdown-only';
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: [], processing_mode: processingMode,
      unavailable: [{ document_id: '1'.repeat(32), name: 'scan.pdf' }],
      unclassified_documents: [{ document_id: '2'.repeat(32), name: 'alt.xlsx' }], local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64));
  assert.match(h.el('documents-heading').textContent, /nicht anonymisiert/u);
  assert.match(h.el('documents-purpose').textContent, /Originalinhalte/u);
  assert.match(h.el('documents-export').textContent, /Markdown-Kopie/u);
  assert.equal(h.el('documents-export').disabled, true);
  await h.api.close(); processingMode = null; await h.api.open('b'.repeat(64));
  assert.equal(h.el('documents-heading').textContent, 'Dokumentprüfstände dieses Laufs');
  assert.equal(h.el('documents-export').textContent, 'Keine belegbare Exportauswahl');
  assert.equal(h.el('documents-export').disabled, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('current and export-specific identity buttons send only their exact identifiers and never approve or copy', async () => {
  const operation = 'e'.repeat(32), batch = 'a'.repeat(64);
  let fail = false;
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), local_ui_only: true, external_disclosure: false,
      export_receipts: [{ operation_id: operation, exported_count: 1, folder_name: `Export-${operation}`,
        processing_mode: 'markdown-and-anonymize', identity_overview_available: true }] };
    if (command === 'open_document_identity_overview') { if (fail) throw Error('STANDALONE_IDENTITY_MAPPING_MISSING');
      return { ok: true, handoff_confirmed: true, external_disclosure: false }; }
  }});
  await h.api.open(batch); assert.equal(h.el('documents-identity-reference').hidden, false);
  await h.act('documents-identities');
  assert.deepEqual(h.calls.find(call => call.command === 'open_document_identity_overview').args, { batchId: batch });
  assert.match(h.el('documents-status').textContent, /keine Freigabe und kein Export/u);
  const frozen = h.el('documents-export-receipt-list').children[0].children[2];
  await h.act(frozen);
  assert.deepEqual(h.calls.filter(call => call.command === 'open_document_identity_overview').at(-1).args,
    { batchId: batch, operationId: operation });
  assert.match(h.el('documents-status').textContent, /Spätere Änderungen verändern sie nicht/u);
  fail = true; await h.act(frozen); assert.match(h.el('documents-status').textContent, /Export-.*STANDALONE_IDENTITY_MAPPING_MISSING/u);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('raw runs offer no current identity reference', async () => {
  const h = harness(); h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-identity-reference').hidden, true);
  await h.act('documents-identities');
  assert.equal(h.calls.some(call => call.command === 'open_document_identity_overview'), false);
});

testAsync('raw correction has no masking action and previews server-bound original names', async () => {
  const h = harness(); h.rows.forEach(row => { row.processing_mode = 'markdown-only'; row.approved = true; });
  await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.equal(h.el('document-redact').hidden, true); assert.equal(h.el('document-redact').disabled, true);
  h.el('document-markdown').selectionStart = 0; h.el('document-markdown').selectionEnd = 3;
  await h.act('document-redact'); assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  await h.all(); await h.act('documents-export');
  assert.deepEqual(h.el('document-export-files').children.map(node => node.textContent), ['Quelle-1.md', 'Quelle-2.md']);
  assert.match(h.el('document-export-filenames-heading').textContent, /Dateinamenplan/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('the private name-error detail identifies only the failed source, not the healthy selection', async () => {
  const h = harness({ invoke(command) {
    if (command === 'preview_document_export') throw JSON.stringify({ code: 'DOCUMENT_EXPORT_NAME_INVALID',
      details: { selection_files: [{ name: 'bad?.pdf', reason_code: 'DOCUMENT_EXPORT_NAME_INVALID' }], selection_count: 1 } });
  } });
  h.rows.forEach(row => { row.approved = true; }); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  assert.match(h.el('documents-status').textContent, /^bad\?\.pdf:/u);
  assert.doesNotMatch(h.el('documents-status').textContent, /Quelle-1|Quelle-2/u);
  assert.equal(h.el('document-export-dialog').open, undefined);
});

testAsync('a delayed authoritative export preview visibly locks every row control until completion', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const h = harness({ async invoke(command, args) {
    if (command !== 'preview_document_export') return;
    await waiting; return { ok: true, processing_mode: 'markdown-and-anonymize', local_ui_only: true, external_disclosure: false,
      files: args.selection.map((row, index) => ({ name: `Dokument_${String(index + 1).padStart(2, '0')}.md`, sha256: row.output_sha256 })) };
  } });
  h.rows.forEach(row => { row.approved = true; }); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  for (const row of h.el('documents-list').children) {
    assert.equal(row.children[0].disabled, true);
    assert.equal(row.children[1].children[0].disabled, true);
  }
  finish(); await tick(); await tick();
  assert.equal(h.el('document-export-dialog').open, true);
  assert.equal(h.el('documents-list').children[0].children[0].disabled, false);
});

testAsync('an unknown run purpose never offers a current identity reference', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: [], processing_mode: null,
      local_ui_only: true, external_disclosure: false };
  }});
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-identity-reference').hidden, true);
  await h.act('documents-identities');
  assert.equal(h.calls.some(call => call.command === 'open_document_identity_overview'), false);
});

testAsync('export dialog previews neutral names and cancel starts no operation and restores focus', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  h.el('documents-export').focus(); await h.act('documents-export');
  assert.equal(h.el('document-export-dialog').open, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  assert.equal(h.el('document-export-files').children[0].textContent, 'Dokument_01.md');
  assert.match(h.el('documents-status').textContent, /Exportvorschau geprüft.*keine neue Kopie.*„Freigeben und exportieren“/u);
  assert.doesNotMatch(h.el('documents-status').textContent, /wird lokal geprüft/u);
  await h.act('document-export-close'); assert.equal(h.el('document-export-dialog').open, false);
  assert.match(h.el('documents-status').textContent, /keine neue Kopie/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  assert.equal(h.el('documents-export').focused, true);
  await h.export(); assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
  assert.match(h.el('document-export-target').textContent, /Export-[a-f0-9]+ \(abgeschlossen\)/u);
  assert.doesNotMatch(h.el('document-export-target').textContent, /noch offen/u);
  assert.equal(h.el('document-export-confirm').hidden, true);
  assert.match(h.el('documents-status').textContent, /nicht erneut ausführen/u);
  assert.match(h.el('documents-selected').textContent, /Ergebnisdateien verfügbar/u);
  assert.equal(h.el('documents-export').textContent, 'Weitere Dateien exportieren');
  assert.equal(h.el('documents-export').disabled, true, 'a second copy needs a new explicit selection');
  assert.match(h.el('documents-purpose').textContent, /ohne weitere Dateiauswahl oder Exportbestätigung/u);
});

testAsync('an in-flight native copy cannot be hidden by close or Escape before its receipt arrives', async () => {
  let releaseCopy;
  const h = harness({ invoke(command, args) {
    if (command === 'export_approved_documents' && !args.acknowledge) return new Promise(resolve => {
      releaseCopy = () => resolve({ ok: true, operation_id: args.operationId, exported_count: args.selection.length,
        folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false });
    });
  } });
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  await h.act('document-export-confirm');
  assert.equal(typeof releaseCopy, 'function');
  assert.equal(h.el('document-export-close').disabled, true);
  await h.act('document-export-close');
  assert.equal(h.el('document-export-dialog').open, true);
  let prevented = false;
  h.el('document-export-dialog').events.get('cancel')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  releaseCopy(); await tick(); await tick(); await tick();
  assert.equal(h.el('document-export-close').disabled, false);
  assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
  await h.act('document-export-close');
  assert.equal(h.el('document-export-dialog').open, false);
});

testAsync('a document-list read failure after durable export ACK never offers the old selection again', async () => {
  let reads = 0;
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews' && ++reads === 2) throw Error('STANDALONE_IPC_TIMEOUT');
  } });
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.export(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2,
    'the copy and its durable receipt were both confirmed');
  assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
  assert.match(h.el('documents-status').textContent, /kein zweiter Export nötig/u);
  assert.match(h.el('documents-selected').textContent, /Ergebnisdateien verfügbar/u);
  assert.equal(h.el('documents-export').disabled, true, 'fresh document state is required before another copy');
  await h.act('document-export-close');
  await h.act('documents-export');
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2);
});

testAsync('incomplete raw export can be abandoned only explicitly; completed copies offer acknowledgement only', async () => {
  let pending = [{ operation_id: 'e'.repeat(32), digest: 'd'.repeat(64), status: 'incomplete', processing_mode: 'markdown-only',
    selection: [{ document_id: '1'.repeat(32), revision: 1, output_sha256: '1'.repeat(64) }] }];
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: [], pending_exports: pending, local_ui_only: true, external_disclosure: false };
    if (command === 'preview_document_export') return { ok: true, processing_mode: 'markdown-only', local_ui_only: true, external_disclosure: false,
      files: [{ name: 'Dokument_01.md', sha256: '1'.repeat(64) }] };
    if (command === 'abandon_document_export') { pending = []; return { ok: true, abandoned: true, operation_id: 'e'.repeat(32), local_ui_only: true, external_disclosure: false }; }
  } });
  await h.api.open('a'.repeat(64)); await h.act('documents-export');
  assert.match(h.el('document-export-purpose').textContent, /Nicht anonymisiert/u);
  assert.match(h.el('document-export-target').textContent, /DataSecure-Markdown-Korrektur/u);
  assert.equal(h.el('document-export-abandon').hidden, false);
  await h.act('document-export-abandon'); assert.equal(pending.length, 1);
  h.el('document-export-abandon-check').checked = true; await h.act('document-export-abandon-check', 'change');
  await h.act('document-export-abandon'); assert.equal(pending.length, 0);
  assert.match(h.el('documents-status').textContent, /nicht gelöscht/u);
  assert.deepEqual(h.calls.find(call => call.command === 'abandon_document_export').args,
    { batchId: 'a'.repeat(64), operationId: 'e'.repeat(32), digest: 'd'.repeat(64) });
  pending = [{ operation_id: 'e'.repeat(32), digest: 'd'.repeat(64), status: 'completed', processing_mode: 'markdown-only',
    selection: [{ document_id: '1'.repeat(32), revision: 1, output_sha256: '1'.repeat(64) }] }];
  await h.api.open('a'.repeat(64)); await h.act('documents-export');
  assert.equal(h.el('document-export-abandon').hidden, true); assert.equal(h.el('document-export-confirm').textContent, 'Empfang bestätigen');
});
testAsync('document comparison loads actual original and Markdown, closing erases both', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.match(h.el('document-original').value, /Anna Beispiel/u); assert.doesNotMatch(h.el('document-markdown').value, /Anna Beispiel/u);
  assert.equal(h.el('document-name').focused, true);
  assert.equal(await h.api.close(), true); assert.equal(h.el('document-original').value, ''); assert.equal(h.el('document-markdown').value, '');
  assert.equal(h.calls.at(-1).command, 'close_document_reviews');
});

testAsync('opening another run clears previous file labels before an unsuccessful load', async () => {
  let failed = false;
  const h = harness({ invoke(command) { if (command === 'get_document_reviews' && failed) throw Error('DOCUMENT_REVIEW_MISSING'); } });
  await h.api.open('a'.repeat(64)); assert.equal(h.el('documents-list').children.length, 2); failed = true;
  await h.api.open('b'.repeat(64));
  assert.equal(h.el('documents-list').children.length, 1);
  assert.doesNotMatch(h.el('documents-list').children[0].textContent, /Quelle-/u);
  assert.match(h.el('documents-status').textContent, /DOCUMENT_REVIEW_MISSING/u);
});
testAsync('an incomplete export retries the same operation and selection, never silently changes it', async () => {
  let failures = 0; const h = harness({ invoke(command) { if (command === 'export_approved_documents' && failures++ === 0) throw Error('AI_EXPORT_INCOMPLETE'); } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.export();
  assert.match(h.el('documents-status').textContent, /noch nicht bestätigt/u); await h.export();
  const exports = h.calls.filter(call => call.command === 'export_approved_documents'); assert.deepEqual(exports[0].args, exports[1].args);
  assert.match(h.el('documents-status').textContent, /2 Dateien exportiert/u);
});
testAsync('lost decision acknowledgement reconciles state without losing the affected filename and reason', async () => {
  const h = harness({ invoke(command) { if (command === 'decide_document_review_batch') throw Error('DOCUMENT_REVIEW_STALE'); } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*DOCUMENT_REVIEW_STALE/u);
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, 2);
  assert.equal(h.rows.some(row => row.approved), false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('an unbound success acknowledgement is not counted as a confirmed document decision', async () => {
  const h = harness({ invoke(command) { if (command === 'decide_document_review_batch') return { ok: true }; } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.equal(h.calls.filter(isDecision).length, 1);
  assert.match(h.el('documents-status').textContent, /gemeinsame Speicherbestätigung ist unklar.*Quelle-1\.pdf/u);
  assert.equal(h.rows.some(row => row.approved), false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('approval cannot adopt an acknowledgement for different Markdown bytes', async () => {
  const h = harness({ invoke(command, args) {
    if (command === 'decide_document_review_batch') return { ok: true, operation_id: args.decision.operation_id, affected_count: 2,
      documents: h.rows.map(row => ({ ...row, revision: 1, output_sha256: 'f'.repeat(64), approved: true })),
      local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.match(h.el('documents-status').textContent, /gemeinsame Speicherbestätigung ist unklar.*DOCUMENT_REVIEW_STALE/u);
  assert.equal(h.rows.some(row => row.approved), false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('entity checkboxes only select and the single central action validates the returned text revision', async () => {
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_entities') return { ok: true, local_ui_only: true, external_disclosure: false,
      ...h.rows[0], page: args.page, pages: 1, entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]',
        disabled: false, kind: 'PERSON', count: 2, decision: 'default', output_start: 0, output_end: 12, source_start: 0, source_end: 13 }] };
  } });
  h.rows[0].entity_review_available = true; h.rows[0].entity_count = 1;
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  h.el('entities-decision').value = 'organization'; await h.act('entities-apply');
  const changes = h.calls.filter(call => call.command === 'decide_document_review'); assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].args.decision.entity_decisions, [{ entity_id: 'entity_000001', decision: 'organization' }]);
  assert.equal(changes[0].args.decision.action, 'entities'); assert.equal(h.rows[0].approved, false);
  assert.match(h.el('documents-status').textContent, /Behandlung gespeichert.*aktueller Ergebnisstand bereitgestellt/u);
});

testAsync('run scope is explicit, refuses ambiguous identities and reports the exact conflicting file', async () => {
  let eligible = false;
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_entities') return { ok: true, local_ui_only: true, external_disclosure: false,
      ...h.rows[0], page: args.page, pages: 1, entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]',
        disabled: false, kind: 'PERSON', run_eligible: eligible, count: 2, decision: 'default', output_start: 0, output_end: 12 }] };
    if (command === 'decide_document_review') return { ok: false, local_ui_only: true, external_disclosure: false,
      reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT', blocked_files: [{ name: 'Unterordner/Vertrag.docx', reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT' }] };
  } });
  h.rows[0].entity_review_available = true; h.rows[0].entity_count = 1; h.rows[0].run_entity_review_available = true;
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  let check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  assert.equal(h.el('entities-scope').value, 'document');
  h.el('entities-scope').value = 'run'; h.el('entities-decision').value = 'organization'; await h.act('entities-scope', 'change'); assert.equal(h.el('entities-apply').disabled, true);
  await h.act('entities-apply'); assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  await h.act('document-discard-draft'); eligible = true; await h.act(h.el('documents-list').children[0].children[1].children[0]);
  check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  h.el('entities-scope').value = 'run'; h.el('entities-decision').value = 'organization'; await h.act('entities-scope', 'change');
  assert.equal(h.el('entities-apply').disabled, false); await h.act('entities-apply');
  assert.equal(h.calls.find(call => call.command === 'decide_document_review').args.decision.scope, 'run');
  assert.match(h.el('documents-status').textContent, /nicht übernommen.*Unterordner\/Vertrag\.docx/u);
  assert.equal(h.rows[0].revision, 0);
});

testAsync('a lost run decision reply refreshes the committed revision and retains the filename and uncertainty', async () => {
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_entities') return { ok: true, local_ui_only: true, external_disclosure: false,
      ...h.rows[0], page: args.page, pages: 1, entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]',
        disabled: false, kind: 'PERSON', run_eligible: true, count: 2, decision: 'default', output_start: 0, output_end: 12 }] };
    if (command === 'decide_document_review') { h.rows[0].revision++; throw Error('STANDALONE_BUSY'); }
  } });
  Object.assign(h.rows[0], { entity_review_available: true, entity_count: 1, run_entity_review_available: true });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  h.el('entities-decision').value = 'organization'; await h.act('entities-apply');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, 2);
  assert.match(h.el('document-revision').textContent, /Stand 1/u);
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*STANDALONE_BUSY.*Bestätigung ist unklar/u);
});

testAsync('a refused export without durable intent is not described as a saved operation', async () => {
  const h = harness({ invoke(command) { if (command === 'export_approved_documents') throw Error('AI_EXPORT_CONFIGURATION_REQUIRED'); } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.export();
  assert.match(h.el('document-export-target').textContent, /Bestätigung des Auftrags noch offen/u);
  assert.doesNotMatch(h.el('document-export-target').textContent, /gespeicherter Auftrag/u);
  assert.equal(h.el('document-export-abandon').hidden, true);
  assert.equal(h.el('document-export-configure').hidden, false);
  assert.equal(h.el('document-export-configure').disabled, false, 'folder picker must be usable after the failed export returns');
  assert.match(h.el('document-export-confirm').textContent, /erneut versuchen/u);
  await h.act('document-export-close'); await h.act('documents-export');
  assert.equal(h.el('document-export-configure').hidden, false, 'reopening must retain the actionable folder repair');
  assert.equal(h.el('document-export-configure').disabled, false);
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*Quelle-2\.pdf.*Ordnerbindung/u);
});

testAsync('a first anonymized export can bind its result folder before any copy is attempted', async () => {
  const h = harness({ invoke(command) {
    if (command === 'configure_results') return { ok: true, configuration_changed: true,
      result_folder: 'C:\\synthetic-results', local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.equal(h.el('documents-completion').hidden, false, 'initial result files need no optional legacy copy');
  await h.act('documents-export');
  assert.equal(h.el('document-export-configure').hidden, false);
  assert.match(h.el('document-export-target').textContent, /Bindung beim Export geprüft/u);
  await h.act('document-export-configure');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 0);
  assert.equal(h.el('document-export-result').hidden, false);
  assert.match(h.el('document-export-result').textContent, /„Freigeben und exportieren“.*kein automatischer Export/u);
  await h.act('document-export-confirm');
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2,
    'only the explicit confirmation may start a copy and its acknowledgement');
  assert.equal(h.el('documents-completion').hidden, false, 'confirmed export remains visible after the dialog');
  assert.equal(h.el('documents-completion-title').textContent, 'Export abgeschlossen');
  assert.match(h.el('documents-completion-text').textContent, /lokal kopiert.*bestätigt.*nicht automatisch wiederholt/u);
  let openedSummaryBatchId = null;
  h.el('nav-history').addEventListener('click', () => { openedSummaryBatchId = h.el('nav-history').dataset.openSummaryBatchId; });
  await h.act('documents-completion-history');
  assert.equal(openedSummaryBatchId, 'a'.repeat(64), 'the completion link requests the exact run summary');
  assert.equal(h.el('document-export-configure').hidden, true);
  await h.act('document-export-configure');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1,
    'a completed export cannot reopen folder selection from its success dialog');
});

testAsync('optional Markdown copy can choose a folder without approving or copying the text', async () => {
  const h = harness({ invoke(command) {
    if (command === 'configure_results') return { ok: true, configuration_changed: true,
      result_folder: 'C:\\synthetic-raw-results', local_ui_only: true, external_disclosure: false };
  } });
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  assert.equal(h.el('document-export-configure').hidden, false);
  await h.act('document-export-configure');
  assert.match(h.el('document-export-result').textContent, /„Kopie speichern“.*kein automatischer Export/u);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('folder choice stays unavailable while an anonymized export is still copying', async () => {
  let finish;
  const copying = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'export_approved_documents' && !args.acknowledge)
      return copying.then(() => ({ ok: true, operation_id: args.operationId,
        exported_count: args.selection.length, folder_name: `Export-${args.operationId}`,
        local_ui_only: true, external_disclosure: false }));
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  await h.act('documents-export'); await h.act('document-export-confirm');
  assert.equal(h.el('document-export-configure').disabled, true);
  assert.match(h.el('document-export-result').textContent, /2 Textstände.*mehrere Minuten.*nicht erneut starten/u);
  assert.equal(h.activeIntervals(), 1);
  h.advance(71000);
  assert.match(h.el('document-export-result').textContent, /Seit 1 Minute 11 Sekunden.*Dateifortschritt ist momentan nicht verfügbar/u);
  await h.act('document-export-configure');
  assert.equal(h.calls.some(call => call.command === 'configure_results'), false);
  finish(); await tick(); await tick();
  assert.equal(h.activeIntervals(), 0);
  assert.equal(h.el('document-export-configure').hidden, true);
});

testAsync('connection loss stops export elapsed-time announcements without claiming a receipt', async () => {
  let finish;
  const copying = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'export_approved_documents' && !args.acknowledge)
      return copying.then(() => ({ ok: true, operation_id: args.operationId, exported_count: args.selection.length,
        folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false }));
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  await h.act('documents-export'); await h.act('document-export-confirm');
  assert.equal(h.activeIntervals(), 1);
  h.api.invalidateConnection();
  assert.equal(h.activeIntervals(), 0);
  assert.match(h.el('documents-status').textContent, /Verbindung unterbrochen/u);
  finish(); await tick(); await tick();
  assert.doesNotMatch(h.el('documents-status').textContent, /Dateien exportiert|Export abgeschlossen/u);
  assert.equal(h.activeIntervals(), 0);
});

async function observedCopy(observation, extra = () => undefined) {
  let release, request;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'get_native_recovery_status') return observation(request);
    if (command === 'export_approved_documents' && !args.acknowledge) {
      request = args;
      return pending.then(() => ({ ok: true, operation_id: args.operationId, exported_count: args.selection.length,
        folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false }));
    }
    return extra(command, args);
  } });
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export'); await h.act('document-export-confirm');
  return { h, request, async finish() { release(); await tick(); await tick(); } };
}
const nativeProgress = (request, changes = {}) => ({ phase: 'owned', local_ui_only: true, external_disclosure: false,
  activity: { state: 'active', active: true, action: 'export_approved_documents', phase: 'native', elapsed_ms: 100,
    export_progress: { operation_id: request.operationId, phase: 'copying', staged_count: 1, total_count: request.selection.length, ...changes } } });

testAsync('export progress uses only the bound independent native snapshot and never treats staged files as completion', async () => {
  let phase = 'copying', staged = 1;
  const copy = await observedCopy(request => nativeProgress(request, { phase, staged_count: staged }));
  const { h } = copy;
  try {
    assert.equal(h.document.activeElement, h.el('document-export-result'));
    h.advance(2000); await tick();
    assert.match(h.el('document-export-result').textContent, /1 von 2 Dateien.*Zwischenbereich/u);
    staged = 2; h.advance(2000); await tick();
    assert.match(h.el('document-export-result').textContent, /2 von 2 Dateien.*Danach.*geprüft/u);
    assert.equal(h.el('document-export-close').disabled, true);
    assert.doesNotMatch(h.el('document-export-title').textContent, /fertig|gespeichert/u);
    phase = 'verifying'; h.advance(2000); await tick();
    assert.match(h.el('document-export-result').textContent, /prüft die kopierten Dateien/u);
    phase = 'receipt'; h.advance(2000); await tick();
    assert.match(h.el('document-export-result').textContent, /Abschlussbeleg/u);
    assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 1);
    assert.equal(h.calls.some(call => ['get_public_state', 'get_run_history'].includes(call.command)), false);
  } finally { await copy.finish(); }
  assert.equal(h.activeIntervals(), 0);
  assert.match(h.el('documents-status').textContent, /2 Dateien exportiert/u);
});

testAsync('foreign malformed or unavailable native export progress cannot claim success or expose arbitrary text', async () => {
  for (const variant of ['foreign', 'total', 'overflow', 'fraction', 'phase', 'extra', 'action', 'disclosure', 'idle', 'blocked', 'failure']) {
    const copy = await observedCopy(request => {
      if (variant === 'failure') throw Error('PRIVATE/source.txt');
      const value = nativeProgress(request);
      const progress = value.activity.export_progress;
      if (variant === 'foreign') progress.operation_id = 'f'.repeat(32);
      if (variant === 'total') progress.total_count = 3;
      if (variant === 'overflow') progress.staged_count = 3;
      if (variant === 'fraction') progress.staged_count = 0.5;
      if (variant === 'phase') progress.phase = 'completed';
      if (variant === 'extra') progress.path = 'PRIVATE/source.txt';
      if (variant === 'action') value.activity.action = 'get_run_history';
      if (variant === 'disclosure') value.external_disclosure = true;
      if (variant === 'idle') value.activity.state = 'idle';
      if (variant === 'blocked') value.phase = 'blocked';
      return value;
    });
    try {
      copy.h.advance(2000); await tick();
      assert.match(copy.h.el('document-export-result').textContent, /Dateifortschritt ist momentan nicht verfügbar/u, variant);
      assert.doesNotMatch(copy.h.el('document-export-result').textContent, /PRIVATE|Kopie ist bestätigt|Dateien exportiert/u, variant);
      assert.equal(copy.h.calls.filter(call => call.command === 'export_approved_documents').length, 1, variant);
    } finally { await copy.finish(); }
  }
});

testAsync('a blocked progress read cannot queue more native observations or fail the ongoing export', async () => {
  let finishRead;
  const pending = new Promise(resolve => { finishRead = resolve; });
  const copy = await observedCopy(() => pending);
  try {
    copy.h.advance(2000); await tick();
    for (let n = 0; n < 5; n++) copy.h.advance(60_000);
    assert.equal(copy.h.calls.filter(call => call.command === 'get_native_recovery_status').length, 1);
    assert.match(copy.h.el('document-export-result').textContent, /5 Minuten/u);
    await copy.finish();
    const complete = copy.h.el('document-export-result').textContent;
    finishRead(nativeProgress(copy.request, { staged_count: 0 })); await tick();
    assert.equal(copy.h.el('document-export-result').textContent, complete, 'late progress cannot replace the accepted receipt');
    assert.equal(copy.h.activeIntervals(), 0);
  } finally { finishRead({}); await copy.finish(); }
});

testAsync('export elapsed time is monotonic across system clock corrections', async () => {
  const copy = await observedCopy(() => ({ phase: 'idle', local_ui_only: true, external_disclosure: false }));
  try {
    copy.h.advance(71_000); await tick();
    assert.match(copy.h.el('document-export-result').textContent, /1 Minute 11 Sekunden/u);
    copy.h.adjustWallClock(3_600_000); copy.h.advance(10_000); await tick();
    assert.match(copy.h.el('document-export-result').textContent, /1 Minute 21 Sekunden/u);
    copy.h.adjustWallClock(-7_200_000); copy.h.advance(10_000); await tick();
    assert.match(copy.h.el('document-export-result').textContent, /1 Minute 31 Sekunden/u);
  } finally { await copy.finish(); }
});

testAsync('connection loss discards a late native observation without replaying the export', async () => {
  let finishRead;
  const pending = new Promise(resolve => { finishRead = resolve; });
  const copy = await observedCopy(() => pending);
  try {
    copy.h.advance(2000); await tick(); copy.h.api.invalidateConnection();
    const message = copy.h.el('documents-status').textContent;
    finishRead(nativeProgress(copy.request, { staged_count: 2 })); await tick();
    assert.equal(copy.h.el('documents-status').textContent, message);
    assert.equal(copy.h.activeIntervals(), 0);
    assert.equal(copy.h.calls.filter(call => call.command === 'export_approved_documents').length, 1);
  } finally { finishRead({}); await copy.finish(); }
});

testAsync('a slow document reload after receipt cannot restart waiting announcements for the finished copy', async () => {
  let finishReload, holdReload = false;
  const pending = new Promise(resolve => { finishReload = resolve; });
  const copy = await observedCopy(request => nativeProgress(request), command => {
    if (command === 'get_document_reviews' && holdReload) return pending;
  });
  try {
    holdReload = true; await copy.finish();
    assert.equal(copy.h.activeIntervals(), 0, 'receipt ends the heartbeat before optional display reload');
    copy.h.advance(120_000);
    assert.match(copy.h.el('documents-status').textContent, /2 Dateien exportiert/u);
    assert.doesNotMatch(copy.h.el('document-export-result').textContent, /Dateifortschritt|Seit/u);
    assert.equal(copy.h.el('document-export-title').textContent, 'Export abgeschlossen');
    assert.equal(copy.h.el('document-export-close').disabled, false);
    assert.equal(copy.h.el('documents-completion').hidden, false, 'durable receipt is visible before the optional read finishes');
    assert.equal(copy.h.el('documents-completion-history').disabled, false, 'optional display read cannot hold navigation hostage');
    assert.equal(copy.h.el('documents-completion-details').disabled, false);
    assert.equal(copy.h.guides.at(-1).phase, 'copy_confirmed');
    assert.equal(copy.h.api.canOpen('b'.repeat(64)), true, 'read-only navigation is not gated on the optional read');
    assert.equal(copy.h.el('documents-approve').disabled, true, 'stale bindings cannot authorize another mutation');
    assert.equal(copy.h.el('documents-reload').disabled, true, 'no duplicate read is queued');
    assert.equal(copy.h.document.activeElement, copy.h.el('document-export-close'));
    await copy.h.act('document-export-close');
    assert.equal(copy.h.el('document-export-dialog').open, false, 'a completed copy can be dismissed while display reload is still pending');
    assert.equal(copy.h.document.activeElement, copy.h.el('documents-completion-history'));
    assert.equal(await copy.h.api.close(), true);
    finishReload({ documents: structuredClone(copy.h.rows), unavailable: [], local_ui_only: true, external_disclosure: false }); await tick();
    assert.equal(copy.h.el('documents-completion').hidden, true, 'late read cannot resurrect a closed surface');
  } finally { finishReload({ documents: [], unavailable: [], local_ui_only: true, external_disclosure: false }); await copy.finish(); }
});

testAsync('a failed post-ACK read keeps the copy complete but blocks changes until an explicit fresh read', async () => {
  let fail = false;
  const copy = await observedCopy(request => nativeProgress(request), command => {
    if (command === 'get_document_reviews' && fail) throw Error('READ_FAILED');
  });
  try {
    fail = true; await copy.finish(); await tick();
    assert.equal(copy.h.el('documents-completion').hidden, false);
    assert.equal(copy.h.el('document-export-title').textContent, 'Export abgeschlossen');
    assert.match(copy.h.el('documents-status').textContent, /kein zweiter Export nötig/u);
    assert.equal(copy.h.el('documents-approve').disabled, true);
    assert.equal(copy.h.api.canOpen('b'.repeat(64)), true);
    fail = false; await copy.h.act('documents-reload');
    assert.equal(copy.h.el('documents-completion').hidden, false);
    assert.equal(copy.h.calls.filter(call => call.command === 'export_approved_documents').length, 2);
  } finally { await copy.finish(); }
});

for (const outcome of ['success', 'failure']) {
  testAsync(`reopening the same run retires an older post-ACK ${outcome} response`, async () => {
    let finishOld, rejectOld, holdNext = false;
    const oldRead = new Promise((resolve, reject) => { finishOld = resolve; rejectOld = reject; });
    const copy = await observedCopy(request => nativeProgress(request), command => {
      if (command === 'get_document_reviews' && holdNext) { holdNext = false; return oldRead; }
    });
    const response = () => ({ documents: structuredClone(copy.h.rows), unavailable: [],
      local_ui_only: true, external_disclosure: false });
    try {
      holdNext = true; await copy.finish();
      await copy.h.act('document-export-close');
      await copy.h.api.open('a'.repeat(64)); await copy.h.all();
      const freshStatus = copy.h.el('documents-status').textContent;
      assert.equal(copy.h.el('documents-export').disabled, false);
      assert.equal(copy.h.el('documents-all').disabled, true, 'new UI has no copy selection');
      if (outcome === 'failure') rejectOld(Error('OLD_POST_ACK_READ_FAILED'));
      else finishOld(response());
      await tick(); await tick();
      assert.equal(copy.h.el('documents-status').textContent, freshStatus,
        'a retired display read cannot replace the reopened run status');
      assert.equal(copy.h.el('documents-export').disabled, false, 'the newer bindings remain fresh');
      assert.equal(copy.h.el('documents-all').disabled, true);
      assert.equal(copy.h.calls.filter(call => call.command === 'export_approved_documents').length, 2,
        'only the original explicit copy and its ACK were sent');
    } finally { finishOld(response()); await copy.finish(); }
  });
}

for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
  testAsync(`a newer ${mode} view ignores an older same-run opening failure, not its own failure`, async () => {
    let rejectOld, reads = 0, failCurrent = false;
    const oldRead = new Promise((resolve, reject) => { rejectOld = reject; });
    const h = harness({ invoke(command) {
      if (command !== 'get_document_reviews') return;
      if (++reads === 1) return oldRead;
      if (failCurrent) throw Error('DOCUMENT_REVIEW_INVALID');
    } });
    h.rows.forEach(row => { row.processing_mode = mode; row.approved = true; });
    const oldOpen = h.api.open('a'.repeat(64)); await tick();
    try {
      await h.api.open('a'.repeat(64)); await h.all();
      const freshStatus = h.el('documents-status').textContent;
      const freshClass = h.el('documents-status').className;
      assert.equal(h.el('documents-export').disabled, false);
      rejectOld(Error('DOCUMENT_REVIEW_INVALID')); await oldOpen;
      assert.equal(h.el('documents-status').textContent, freshStatus,
        'the retired opening error cannot contradict the newer fresh view');
      assert.equal(h.el('documents-status').className, freshClass);
      assert.equal(h.el('documents-export').disabled, false);
      assert.equal(h.el('documents-all').disabled, true);
      assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
      failCurrent = true; await h.api.open('a'.repeat(64));
      assert.match(h.el('documents-status').textContent, /DOCUMENT_REVIEW_INVALID/u,
        'an error belonging to the current view must remain visible');
      assert.equal(h.el('documents-export').disabled, true);
      assert.equal(h.el('documents-all').disabled, true);
    } finally { rejectOld(Error('DOCUMENT_REVIEW_INVALID')); await oldOpen; }
  });
}

testAsync('a different pending export discovered after ACK cannot rewrite the completed dialog', async () => {
  let acknowledged = false, h;
  const other = 'f'.repeat(32);
  const copy = await observedCopy(request => nativeProgress(request), (command, args) => {
    if (command === 'export_approved_documents' && args.acknowledge) acknowledged = true;
    if (command === 'get_document_reviews' && acknowledged) return {
      documents: structuredClone(h.rows), unavailable: [], local_ui_only: true, external_disclosure: false,
      pending_exports: [{ operation_id: other, digest: 'd'.repeat(64), status: 'incomplete',
        processing_mode: 'markdown-and-anonymize', selection: structuredClone(copy.request.selection) }]
    };
  });
  h = copy.h;
  try {
    await copy.finish();
    assert.equal(h.el('document-export-title').textContent, 'Export abgeschlossen');
    assert.match(h.el('document-export-target').textContent, new RegExp(copy.request.operationId));
    assert.doesNotMatch(h.el('document-export-target').textContent, new RegExp(other));
    assert.equal(h.el('document-export-confirm').hidden, true);
    assert.match(h.el('documents-status').textContent, /anderer früherer Export.*nicht die gerade abgeschlossene Kopie/u);
    assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2);
    await h.act('document-export-close'); await h.act('documents-export');
    assert.match(h.el('document-export-target').textContent, new RegExp(other));
    assert.notEqual(h.el('document-export-title').textContent, 'Export abgeschlossen');
    assert.equal(h.el('document-export-confirm').hidden, false);
    assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2,
      'the other durable intent needs its own explicit confirmation');
  } finally { await copy.finish(); }
});

testAsync('missing native export binding offers a direct folder picker and retries only after explicit confirmation', async () => {
  let configured = false;
  const h = harness({ invoke(command) {
    if (command === 'configure_results') { configured = true; return { ok: true, configuration_changed: true,
      result_folder: 'C:\\synthetic-results', local_ui_only: true, external_disclosure: false }; }
    if (command === 'export_approved_documents' && !configured) throw Error('AI_EXPORT_CONFIGURATION_REQUIRED');
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.export();
  const attempts = () => h.calls.filter(call => call.command === 'export_approved_documents');
  const first = attempts()[0].args;
  assert.equal(attempts().length, 1);
  assert.equal(h.el('document-export-configure').disabled, false);
  await h.act('document-export-configure');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(attempts().length, 1, 'folder selection must not start or replay export');
  assert.equal(h.el('document-export-configure').hidden, true);
  assert.match(h.el('document-export-result').textContent, /kein automatischer Export/u);
  await h.act('document-export-confirm');
  assert.equal(attempts()[1].args.operationId, first.operationId);
  assert.deepEqual(attempts()[1].args.selection, first.selection);
  assert.equal(attempts()[2].args.acknowledge, true);
  assert.match(h.el('documents-status').textContent, /2 Dateien exportiert/u);
});

testAsync('a fresh renderer discovers an unconfirmed export and reconciles its original revisions after revocation', async () => {
  let pending = [], loseReply = true;
  const backend = async (command, args) => {
    if (command === 'get_document_reviews') return { documents: [], unavailable: [], pending_exports: structuredClone(pending),
      local_ui_only: true, external_disclosure: false };
    if (command === 'export_approved_documents') {
      if (args.acknowledge) pending = [];
      else { pending = [{ operation_id: args.operationId, selection: structuredClone(args.selection), digest: 'd'.repeat(64), status: 'incomplete', processing_mode: 'markdown-and-anonymize' }];
        if (loseReply) { loseReply = false; throw Error('AI_EXPORT_INCOMPLETE'); } }
    }
  };
  const first = harness({ invoke(command, args) { if (command !== 'get_document_reviews') return backend(command, args); } });
  await first.api.open('a'.repeat(64)); await first.all(); await first.act('documents-approve'); await first.export();
  const originalRequest = first.calls.find(call => call.command === 'export_approved_documents').args;
  assert.equal(await first.api.close(), true);
  const second = harness({ invoke: backend }); await second.api.open('a'.repeat(64));
  assert.match(second.el('documents-status').textContent, /früherer Export/u);
  assert.equal(second.calls.some(call => call.command === 'export_approved_documents'), false);
  await second.export();
  const exports = second.calls.filter(call => call.command === 'export_approved_documents');
  assert.deepEqual(exports[0].args, originalRequest); assert.equal(exports[1].args.acknowledge, true);
  assert.equal(pending.length, 0); assert.match(second.el('documents-status').textContent, /2 Dateien exportiert/u);
});

testAsync('a lost receipt confirmation stays retryable with the same operation, without a new export', async () => {
  let loseReply = true;
  const h = harness({ invoke(command, args) { if (command === 'export_approved_documents' && args.acknowledge && loseReply) {
    loseReply = false; throw Error('AI_EXPORT_INCOMPLETE'); } } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.export();
  assert.match(h.el('documents-status').textContent, /2 Dateien exportiert.*Kopie ist bestätigt.*Empfangsbestätigung/u);
  assert.equal(h.el('documents-export').textContent, 'Empfang erneut abgleichen'); await h.export();
  const exports = h.calls.filter(call => call.command === 'export_approved_documents');
  assert.equal(new Set(exports.map(call => call.args.operationId)).size, 1); assert.equal(exports.length, 3);
  assert.match(h.el('documents-status').textContent, /2 Dateien exportiert/u);
});

testAsync('an ACK saved before its response is lost stays visible as a completed copy in a fresh renderer', async () => {
  let receipt, pending = [], loseReply = true;
  const backend = async (command, args) => {
    if (command === 'export_approved_documents') {
      receipt = { operation_id: args.operationId, folder_name: `Export-${args.operationId}`, exported_count: args.selection.length };
      pending = [{ operation_id: args.operationId, selection: structuredClone(args.selection), digest: 'd'.repeat(64), status: 'completed', processing_mode: 'markdown-and-anonymize' }];
      if (args.acknowledge) { pending = []; if (loseReply) { loseReply = false; throw Error('AI_EXPORT_INCOMPLETE'); } }
    }
    if (command === 'get_document_reviews') return { documents: [], unavailable: [], pending_exports: pending,
      export_receipts: receipt ? [receipt] : [], local_ui_only: true, external_disclosure: false };
  };
  const first = harness({ invoke(command, args) { if (command !== 'get_document_reviews') return backend(command, args); } });
  await first.api.open('a'.repeat(64)); await first.all(); await first.act('documents-approve'); await first.export();
  assert.match(first.el('documents-status').textContent, /2 Dateien exportiert.*Kopie ist bestätigt/u);
  assert.equal(pending.length, 0); assert.equal(await first.api.close(), true);
  const second = harness({ invoke: backend }); await second.api.open('a'.repeat(64));
  assert.equal(second.el('documents-export-receipts').hidden, false);
  assert.match(second.el('documents-export-receipt-list').children[0].children[0].textContent, /Beleg für abgeschlossene Kopie \(2 Dateien\): DataSecure-KI-Export → Export-/u);
  assert.doesNotMatch(second.el('documents-status').textContent, /nicht bestätigt/u);
  assert.equal(second.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('masking previews only marked text then saves with one click and revokes approval', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.equal(h.el('documents-main-guide').hidden, true);
  assert.equal(h.el('documents-approval-extras').hidden, true);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.equal(h.el('document-markdown').readOnly, true);
  assert.match(h.el('document-markdown-caption').textContent, /Aktueller Ergebnistext.*nur markieren/u);
  assert.match(h.el('document-edit-hint').textContent, /schreibgeschützt.*Maskierung speichern/u);
  assert.equal(h.el('document-save-correction').hidden, true);
  await h.mark(14, 16);
  const writesBefore = h.calls.filter(call => call.command === 'decide_document_review').length;
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, writesBefore);
  assert.equal(h.el('document-mask-preview').value, '42');
  assert.equal(h.el('document-change-confirm').hidden, true);
  await h.act('document-redact'); await tick(); await tick();
  const call = h.calls.filter(call => call.command === 'decide_document_review').at(-1);
  assert.equal(call.args.decision.action, 'redact'); assert.deepEqual(call.args.decision.ranges, [{ start: 14, end: 16 }]);
  assert.equal(h.rows[0].approved, false); assert.equal(h.rows[1].approved, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false, 'editing never exports or inherits the old approval');
});
testAsync('mask action explains a missing right-side selection next to the button without writing', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 0; h.el('document-markdown').selectionEnd = 0;
  await h.act('document-redact');
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  assert.equal(h.el('document-action-status').hidden, false);
  assert.match(h.el('document-action-status').textContent, /rechten aktuellen Ergebnistext.*markieren/u);
  assert.match(h.el('documents-status').textContent, /rechten aktuellen Ergebnistext.*markieren/u);
});
testAsync('confirmed mask immediately reopens its new revision and shows a local success receipt', async () => {
  const h = harness({ maskAfterRevision: true }); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.mark(14, 16);
  await h.act('document-redact'); await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
  assert.equal(h.el('document-name').textContent, 'Quelle-1.pdf');
  assert.match(h.el('document-markdown').value, /\[MANUAL_REDACTION\]/u);
  assert.equal(h.el('document-action-status').hidden, false);
  assert.match(h.el('document-action-status').textContent, /Stand 1 gespeichert/u);
  assert.equal(h.rows[0].approved, false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});
testAsync('a plain mask highlight and cancelling the separate basis reset write nothing', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.mark(14, 16);
  assert.equal(h.el('document-change-confirm').hidden, true);
  await h.act('document-restore');
  assert.match(h.el('document-change-confirm-text').textContent, /späteren Text- und Entitätenänderungen/u);
  await h.act('document-change-cancel');
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
});
testAsync('basis reset also requires explicit saving and invalidates the affected approval', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.act('document-restore');
  assert.equal(h.calls.filter(isDecision).length, 1);
  await h.act('document-change-save'); await tick(); await tick();
  const call = h.calls.filter(row => row.command === 'decide_document_review').at(-1);
  assert.equal(call.args.decision.action, 'restore_base');
  assert.equal(h.rows[0].approved, false); assert.equal(h.rows[1].approved, true);
  assert.match(h.el('document-action-status').textContent, /Basisstand als Stand 2 gespeichert/u);
});
testAsync('a highlighted mask cannot be saved after the document revision changes', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.mark(14, 16); h.rows[0].revision++;
  await h.act('documents-reload'); await h.act('document-redact');
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
});
testAsync('failed state recovery does not request stale detail or claim a successful reconciliation', async () => {
  let failed = false;
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_reviews' && failed) throw Error('STANDALONE_BUSY');
    if (command === 'get_document_entities') return { ok: true, local_ui_only: true, external_disclosure: false,
      ...h.rows[0], page: args.page, pages: 1, entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]',
        disabled: false, kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 0, output_end: 12 }] };
    if (command === 'decide_document_review') { failed = true; h.rows[0].revision++; throw Error('STANDALONE_BUSY'); }
  } });
  Object.assign(h.rows[0], { entity_review_available: true, entity_count: 1, run_entity_review_available: true });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  h.el('entities-decision').value = 'organization'; await h.act('entities-apply');
  assert.deepEqual(h.calls.filter(call => call.command === 'get_document_review_chunk').map(call => call.args.revision), [0]);
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*Bestätigung ist unklar.*konnte nicht abgefragt/u);
  assert.doesNotMatch(h.el('documents-status').textContent, /wurde erneut abgefragt/u);
  assert.equal(h.el('documents-approve').disabled, true); assert.equal(h.el('documents-reload').disabled, false);
  failed = false; await h.act('documents-reload'); await h.all(); assert.equal(h.el('documents-approve').disabled, false);
});
testAsync('failed raw save preserves the complete draft, and reload restores it without another write', async () => {
  for (const committed of [false, true]) {
    let text = '[PERSON_001]: 42 Projekte.';
    const h = harness({ invoke(command) {
      if (command === 'decide_document_review') {
        if (committed) { text = '[PERSON_001]: 43 Projekte.'; h.rows[0].revision++; }
        throw Error('STANDALONE_BUSY');
      }
      if (command === 'get_document_review_chunk') return { ...h.rows[0], chunk_index: 0, original_text: 'Original',
        markdown: text, local_ui_only: true, external_disclosure: false };
    } });
    h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
    await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
    h.el('document-markdown').value = '[PERSON_001]: 43 Projekte.'; await h.act('document-markdown', 'input');
    await h.act('document-save-correction');
    assert.equal(h.el('document-recovery-text').value, '[PERSON_001]: 43 Projekte.');
    assert.equal(h.el('document-recovery-draft').hidden, false); assert.equal(await h.api.close(), false);
    await h.act('documents-reload');
    assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
    assert.equal(h.el('document-markdown').value, '[PERSON_001]: 43 Projekte.');
    assert.equal(h.el('document-recovery-draft').hidden, true);
    assert.match(h.el('documents-status').textContent, committed ? /stimmt mit deinem Korrekturentwurf überein/u : /noch nicht gespeichert/u);
    assert.equal(h.el('document-save-correction').disabled, committed);
  }
});
testAsync('a diverging saved Markdown revision never overwrites or silently discards the preserved draft', async () => {
  let text = '[PERSON_001]: 42 Projekte.';
  const h = harness({ invoke(command) {
    if (command === 'decide_document_review') { text = 'Anderer gespeicherter Text'; h.rows[0].revision++; throw Error('STANDALONE_BUSY'); }
    if (command === 'get_document_review_chunk') return { ...h.rows[0], chunk_index: 0, original_text: 'Original',
      markdown: text, local_ui_only: true, external_disclosure: false };
  } });
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').value = 'Mein Entwurf'; await h.act('document-markdown', 'input');
  await h.act('document-save-correction'); await h.act('documents-reload');
  assert.equal(h.el('document-markdown').value, 'Anderer gespeicherter Text'); assert.equal(h.el('document-recovery-text').value, 'Mein Entwurf');
  assert.equal(h.el('document-save-correction').disabled, true); assert.equal(h.el('documents-approve').disabled, true);
  await h.act('document-recovery-discard'); assert.equal(h.el('document-recovery-draft').hidden, true);
});
testAsync('an open export dialog follows completed or incomplete recovery without changing the bound selection', async () => {
  for (const completed of [false, true]) {
    let pending = [];
    const h = harness({ invoke(command, args) {
      if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), pending_exports: pending,
        local_ui_only: true, external_disclosure: false };
      if (command === 'export_approved_documents' && !args.acknowledge) {
        pending = [{ operation_id: args.operationId, digest: 'd'.repeat(64), status: completed ? 'completed' : 'incomplete',
          processing_mode: 'markdown-and-anonymize', selection: args.selection }]; throw Error('AI_EXPORT_INCOMPLETE');
      }
    } });
    await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve'); await h.export();
    assert.equal(h.el('document-export-dialog').open, true);
    assert.equal(h.el('document-export-confirm').textContent, completed ? 'Empfang bestätigen' : 'Export erneut abgleichen');
    assert.equal(h.el('document-export-abandon').hidden, completed);
    const original = h.calls.find(call => call.command === 'export_approved_documents').args;
    if (completed) { await h.act('document-export-confirm');
      const next = h.calls.filter(call => call.command === 'export_approved_documents')[1].args;
      assert.deepEqual(next, { ...original, acknowledge: true }); }
  }
});
testAsync('raw Markdown editing is explicit, protects unsaved changes and submits only a bounded correction', async () => {
  const h = harness(); h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.equal(h.el('document-markdown').readOnly, false);
  assert.match(h.el('document-markdown-caption').textContent, /bearbeitbar/u);
  assert.match(h.el('document-edit-hint').textContent, /direkt bearbeiten.*nicht anonymisiert/u);
  h.el('document-markdown').value = '[PERSON_001]: 43 Projekte.'; await h.act('document-markdown', 'input');
  assert.equal(await h.api.close(), false); assert.equal(h.el('documents-export').disabled, true);
  await h.act('document-save-correction'); const call = h.calls.find(call => call.command === 'decide_document_review');
  assert.equal(call.args.decision.action, 'correct'); assert.deepEqual(call.args.decision.ranges, [{ start: 15, end: 16, replacement: '3' }]);
  assert.equal(h.el('documents-export').textContent, 'Zusätzliche Markdown-Kopie speichern');
  assert.match(h.el('documents-status').textContent, /Änderung gespeichert und aktueller Ergebnisstand bereitgestellt.*frühere Ergebnisstände bleiben unverändert/u);
  assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
});

testAsync('bound raw notices filter the optional editor; selection and navigation stay within the visible files', async () => {
  const h = harness({ invoke(command) {
    if (command !== 'get_document_reviews') return;
    return { local_ui_only: true, external_disclosure: false, processing_mode: 'markdown-only', documents: structuredClone(h.rows),
      unavailable: [], not_processed_documents: [], conversion_feedback: {
        schema: 'datasecure-conversion-feedback/1', ocr_enabled: true, selected_count: 3, result_count: 3,
        not_converted_count: 0, ocr_omitted_count: 0, error_count: 0, content_notice_count: 2, pending_count: 0, complete: true },
      content_notices: [1, 2].map(n => ({ document_id: String(n).repeat(32), name: `Quelle-${n}.pdf`,
        reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] })) };
  }});
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; row.text_modified = false; });
  h.rows.push({ name: 'Quelle-3.pdf', document_id: '3'.repeat(32), revision: 0, output_sha256: '3'.repeat(64),
    chunks: 1, approved: false, text_modified: false, processing_mode: 'markdown-only' });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-filter').value, 'notices');
  assert.equal(h.el('documents-list').children.length, 2);
  assert.match(textTree(h.el('documents-list')), /Inhaltsübernahme nicht vollständig belegbar/u);
  await h.all(); assert.match(h.el('documents-selected').textContent, /^2 angezeigt · 3 Ergebnisdateien verfügbar/u);
  await h.act('documents-export');
  assert.deepEqual(h.calls.find(call => call.command === 'preview_document_export').args.selection.map(row => row.document_id),
    ['1'.repeat(32), '2'.repeat(32)]);
  assert.match(h.el('document-export-purpose').textContent, /2 ausgewählten Dateien/u);
  await h.act('document-export-close');
  h.el('documents-filter').value = 'all'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 3);
  assert.match(h.el('documents-selected').textContent, /^3 angezeigt · 3 Ergebnisdateien verfügbar/u);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.act('document-next');
  assert.equal(h.el('document-name').textContent, 'Quelle-2.pdf');
  h.el('documents-filter').value = 'without'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 1);
  assert.equal(h.el('document-name').textContent, 'Dokument auswählen');
  await h.all(); assert.match(h.el('documents-selected').textContent, /^1 angezeigt · 3 Ergebnisdateien verfügbar/u);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  h.rows[0].text_modified = true; h.rows[0].revision++;
  await h.act('documents-reload');
  h.el('documents-filter').value = 'edited'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 1);
  assert.match(textTree(h.el('documents-list')), /Korrektur gespeichert/u);
  h.el('documents-filter').value = 'notices'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 2, 'a saved correction does not clear the source notice');
});

testAsync('unbound or mismatched notice evidence falls back to all files without claiming warning-free text', async () => {
  for (const variant of ['missing', 'wrong-name', 'wrong-count']) {
    const h = harness({ invoke(command) {
      if (command !== 'get_document_reviews') return;
      return { local_ui_only: true, external_disclosure: false, processing_mode: 'markdown-only', documents: structuredClone(h.rows),
        conversion_feedback: { schema: 'datasecure-conversion-feedback/1', ocr_enabled: true, selected_count: 2,
          result_count: 2, not_converted_count: 0, ocr_omitted_count: 0, error_count: 0,
          content_notice_count: variant === 'wrong-count' ? 2 : 1, pending_count: 0, complete: true },
        ...(variant === 'missing' ? {} : { content_notices: [{ document_id: '1'.repeat(32),
          name: variant === 'wrong-name' ? 'Andere.pdf' : 'Quelle-1.pdf', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }] }) };
    }});
    h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
    await h.api.open('a'.repeat(64));
    assert.equal(h.el('documents-filter').value, 'all');
    assert.equal(h.el('documents-filter').disabled, true);
    assert.equal(h.el('documents-list').children.length, 2);
    assert.match(h.el('documents-filter-summary').textContent, /nicht sicher zuordenbar/u);
  }
});
for (const mixed of [false, true]) testAsync(`${mixed ? 'mixed' : 'rejected-only'} sources show fixed reasons and preview only explicitly requested available approvals`, async () => {
  const available = mixed ? [{ name: 'good.txt', document_id: '1'.repeat(32), revision: 0,
    output_sha256: '1'.repeat(64), chunks: 1, approved: true, processing_mode: 'markdown-and-anonymize' }] : [];
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: available, unavailable: [], unclassified_documents: [],
      not_processed_documents: [{ document_id: '9'.repeat(32), name: 'nested/defekt.docx', reason_code: 'SOURCE_CONTAINER_CORRUPT' }],
      processing_mode: 'markdown-and-anonymize', local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64), { exportPreview: true });
  const panel = h.el('documents-unavailable'), contents = JSON.stringify(panel.children);
  assert.equal(panel.hidden, false); assert.match(contents, /nested\/defekt\.docx/u); assert.match(contents, /SOURCE_CONTAINER_CORRUPT/u);
  assert.match(contents, /Dateicontainer ist beschädigt/u);
  assert.equal(h.el('documents-export').hidden, true);
  assert.notEqual(h.el('document-export-dialog').open, true);
  assert.equal(h.calls.some(call => call.command === 'preview_document_export'), false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('connection loss invalidates the one bulk reply without dispatching another decision', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command) { if (command === 'decide_document_review_batch') return pending; }});
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  h.api.invalidateConnection();
  finish({ok: true, ...h.rows[0], revision: 1, approved: true, local_ui_only: true, external_disclosure: false});
  await tick(); await tick();
  assert.equal(h.calls.filter(isDecision).length, 1);
  assert.match(h.el('documents-status').textContent, /Verbindung unterbrochen/u);
  assert.equal(h.el('documents-approve').disabled, true);
});

testAsync('a late export reply never sends an automatic receipt acknowledgement after connection loss', async () => {
  let finish, request;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command, args) { if (command === 'export_approved_documents') { request = args; return pending; } }});
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.export();
  h.api.invalidateConnection();
  finish({ok: true, operation_id: request.operationId, exported_count: request.selection.length,
    folder_name: `Export-${request.operationId}`, local_ui_only: true, external_disclosure: false});
  await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 1);
  assert.match(h.el('documents-status').textContent, /Verbindung unterbrochen/u);
});

testAsync('connection loss closes an open export dialog instead of leaving stale actions above history', async () => {
  const h = harness(); h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  assert.equal(h.el('document-export-dialog').open, true);
  h.api.invalidateConnection();
  assert.equal(h.el('document-export-dialog').open, false);
  assert.equal(h.el('documents-export').disabled, true);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('connection invalidation releases a pending detail load and an old completion cannot unlock its successor', async () => {
  let finish, finishNext, delayed = true;
  const first = new Promise(resolve => { finish = resolve; });
  const second = new Promise(resolve => { finishNext = resolve; });
  const h = harness({invoke(command) {
    if (command === 'get_document_review_chunk') return delayed ? first : second;
  }});
  await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.api.invalidateConnection();
  assert.equal(h.el('documents-reload').disabled, false);
  delayed = false; await h.act('documents-reload');
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.equal(h.el('documents-reload').disabled, true);
  finish({}); await tick(); await tick();
  assert.equal(h.el('documents-reload').disabled, true, 'old load does not release new ownership');
  finishNext({...h.rows[0], chunk_index: 0, original_text: 'source', markdown: 'text', local_ui_only: true, external_disclosure: false});
  await tick(); await tick();
  assert.equal(h.el('documents-reload').disabled, false);
  assert.equal(await h.api.close(), true);
});

for (const mode of ['markdown-only', 'markdown-and-anonymize']) testAsync(`${mode} preview and cancel never approve, while explicit confirmation seals only selected ACK revisions`, async () => {
  const h = harness({ strictBindings: true, invoke(command, args) {
    if (command === 'export_approved_documents') return { ok: true, operation_id: args.operationId,
      exported_count: args.selection.length, folder_name: `Export-${args.operationId}`, processing_mode: mode,
      anonymized: mode === 'markdown-and-anonymize', local_ui_only: true, external_disclosure: false };
  } });
  h.rows.forEach(row => { row.processing_mode = mode; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-approve').hidden, mode === 'markdown-only');
  if (mode === 'markdown-only') assert.doesNotMatch(h.el('documents-selected').textContent, /freigegeben|textgeprüft/u);
  const checkbox = h.el('documents-list').children[0].children[0]; checkbox.checked = true; await h.act(checkbox, 'change');
  await h.act('documents-export'); assert.equal(h.el('document-export-dialog').open, true);
  await h.act('document-export-close');
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
  await h.export(); await tick(); await tick();
  assert.equal(h.rows[0].approved, true); assert.equal(h.rows[1].approved, false);
  const decision = h.calls.filter(isDecision); assert.equal(decision.length, 1);
  assert.equal(decision[0].command, 'decide_document_review_batch');
  assert.equal(decision[0].args.decision.selection.length, 1);
  assert.equal(decision[0].args.decision.selection[0].revision, 0);
  const preview = h.calls.filter(call => call.command === 'preview_document_export').at(-1);
  assert.equal(preview.args.selection[0].revision, 1);
  const copies = h.calls.filter(call => call.command === 'export_approved_documents'); assert.equal(copies.length, 2);
  assert.equal(copies[0].args.selection[0].revision, 1); assert.equal(copies[0].args.operationId, copies[1].args.operationId);
  assert.equal(h.el('document-export-title').textContent, mode === 'markdown-only' ? 'Markdown-Kopie gespeichert' : 'Export abgeschlossen');
});

for (const mode of ['markdown-only', 'markdown-and-anonymize']) testAsync(`${mode} combined confirmation stops before copying on lost, mismatched or partial ACK and changed plan`, async () => {
  for (const failure of ['lost', 'hash', 'revision', 'mode', 'partial', 'operation', 'plan', 'folder']) {
    let decisions = 0, previews = 0;
    const h = harness({ invoke(command, args) {
      if (command === 'decide_document_review_batch') {
        decisions++;
        if (failure === 'plan' || failure === 'folder') return;
        const updated = h.rows.map(row => ({ ...row, approved: true, revision: failure === 'revision' ? 7 : row.revision + 1,
          output_sha256: failure === 'hash' ? 'f'.repeat(64) : row.output_sha256,
          processing_mode: failure === 'mode' ? mode === 'markdown-only' ? 'markdown-and-anonymize' : 'markdown-only' : mode }));
        if (failure === 'lost') { h.rows.forEach(row => { row.approved = true; row.revision++; }); throw Error('STANDALONE_CONNECTION_LOST'); }
        return { ok: true, operation_id: failure === 'operation' ? 'f'.repeat(32) : args.decision.operation_id, affected_count: h.rows.length,
          documents: failure === 'partial' ? updated.slice(0, 1) : updated, local_ui_only: true, external_disclosure: false };
      }
      if (command === 'preview_document_export' && ['plan', 'folder'].includes(failure) && ++previews === 2)
        return { ok: true, processing_mode: mode, local_ui_only: true, external_disclosure: false,
          result_folder: failure === 'folder' ? '/different-result-folder' : null,
          files: args.selection.map((row, index) => ({ name: failure === 'plan' ? 'changed.md' : `Dokument_0${index + 1}.md`, sha256: row.output_sha256 })) };
    } });
    h.rows.forEach(row => { row.processing_mode = mode; });
    await h.api.open('a'.repeat(64)); await h.all(); await h.export(); await tick(); await tick();
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false, failure);
    assert.match(h.el('documents-status').textContent, /kein Export gestartet.*Freigabe kann bereits gespeichert sein/u, failure);
    assert.equal(h.el('document-export-dialog').open, false, failure);
    assert.match(h.el('documents-status').textContent, /erneut auswählen.*neue Exportvorschau/u, failure);
    assert.equal(decisions, 1);
    const before = h.calls.length; await tick(); assert.equal(h.calls.length, before, 'no automatic retry');
  }
});

for (const phase of ['approval', 'second-preview']) testAsync(`connection change during combined ${phase} cannot resume a copy or overwrite another view`, async () => {
  let finish, heldArgs, previews = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'decide_document_review_batch' && phase === 'approval' ||
        command === 'preview_document_export' && ++previews === 2 && phase === 'second-preview') { heldArgs = args; return pending; }
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.export();
  assert.ok(heldArgs); h.api.invalidateConnection();
  await h.api.open('b'.repeat(64)); const currentStatus = h.el('documents-status').textContent;
  finish(phase === 'approval' ? { ok: true, operation_id: heldArgs.decision.operation_id, affected_count: 2,
    documents: h.rows.map(row => ({ ...row, approved: true, revision: row.revision + 1 })), local_ui_only: true, external_disclosure: false } :
    { ok: true, processing_mode: 'markdown-and-anonymize', local_ui_only: true, external_disclosure: false,
      files: heldArgs.selection.map((row, index) => ({ name: `Dokument_0${index + 1}.md`, sha256: row.output_sha256 })) });
  await tick(); await tick();
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  assert.equal(h.el('documents-status').textContent, currentStatus);
  assert.equal(h.api.activeBatchId(), 'b'.repeat(64));
});

testAsync('combined export approves only unapproved current stands and never repeats existing approvals', async () => {
  const h = harness({ strictBindings: true, resultFolder: '/Users/Synthetic/Downloads/SecureDataMsg' });
  h.rows[1].approved = true; h.rows[1].revision = 3;
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-export');
  assert.match(h.el('document-export-target').textContent, /\/Users\/Synthetic\/Downloads\/SecureDataMsg/u);
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'configure_results'), false);
  await h.act('document-export-confirm'); await tick();
  const decisions = h.calls.filter(isDecision); assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].args.decision.selection.map(row => row.document_id), [h.rows[0].document_id]);
  const copy = h.calls.find(call => call.command === 'export_approved_documents');
  assert.deepEqual(copy.args.selection.map(row => row.revision), [1, 3]);
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 0);
});

testAsync('document loading is visible and a late closed load cannot restore its state', async () => {
  let finish; const response = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command) { if (command === 'get_document_reviews') return response; } });
  const loading = h.api.open('a'.repeat(64)); await tick();
  assert.equal(h.el('documents-loading').hidden, false); assert.match(h.el('documents-loading-text').textContent, /geladen/u);
  assert.equal(h.el('documents-export').disabled, true);
  await h.api.close(); assert.equal(h.el('documents-loading').hidden, true);
  finish({ documents: structuredClone(h.rows), local_ui_only: true, external_disclosure: false }); await loading;
  assert.equal(h.el('documents-list').children.filter(row => row.tag === 'div').length, 0);
});

testAsync('bound OCR-off omissions appear once per file in collapsed amber groups, without technical errors', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-only',
      local_ui_only: true, external_disclosure: false, conversion_feedback: { schema: 'datasecure-conversion-feedback/1',
        ocr_enabled: false, selected_count: 3, result_count: 2, not_converted_count: 1, ocr_omitted_count: 1,
        error_count: 0, content_notice_count: 0, pending_count: 0, complete: true },
      not_processed_documents: [{ document_id: '3'.repeat(32), name: 'nested/scan.png', reason_code: 'IMAGE_OCR_REQUIRED', classification: 'ocr_omission' }] };
  } });
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; }); await h.api.open('a'.repeat(64));
  const panel = h.el('documents-unavailable'), group = panel.children[0], item = group.children[1];
  assert.equal(group.tag, 'details'); assert.equal(item.tag, 'details'); assert.notEqual(group.open, true); assert.notEqual(item.open, true);
  assert.equal(group.className, 'file-notice-group warning'); assert.match(textTree(group), /Kein technischer Konvertierungsfehler/u);
  assert.equal(textTree(panel).split('nested/scan.png').length - 1, 1); assert.equal(panel.children.length, 1);
});

testAsync('raw OCR notices explain uncertainty without presenting a second contact check; checkbox and compare remain separate', async () => {
  const h = harness({ invoke(command) {
    if (command !== 'get_document_reviews') return;
    return { local_ui_only: true, external_disclosure: false, processing_mode: 'markdown-only', documents: structuredClone(h.rows),
      processing_complete: true, result_publication: { state: 'initial', generation_id: null, count: 2, current_revision: 0 },
      unavailable: [], conversion_feedback: { schema: 'datasecure-conversion-feedback/1', ocr_enabled: true,
        selected_count: 2, result_count: 2, not_converted_count: 0, ocr_omitted_count: 0, error_count: 0,
        content_notice_count: 1, pending_count: 0, complete: true },
      content_notices: [{ document_id: '1'.repeat(32), name: 'Quelle-1.pdf', reason_codes: ['OCR_NOT_VERIFIED'] }] };
  }});
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64));
  assert.match(h.el('documents-heading').textContent, /freiwillig/u);
  assert.match(h.el('documents-purpose').textContent, /ohne weitere Dateiauswahl oder Exportbestätigung/u);
  assert.match(textTree(h.el('documents-list')), /OCR-Text.*nicht vollständig fachlich geprüft/u);
  assert.doesNotMatch(textTree(h.el('documents-list')), /Inhaltshinweis: OCR_NOT_VERIFIED/u);
  const row = h.el('documents-list').children[0], check = row.children[0], compare = row.children[1].children[0];
  check.checked = true; await h.act(check, 'change');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_chunk'), false);
  await h.act(compare);
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_chunk').length, 1);
  assert.match(h.el('documents-selected').textContent, /^1 angezeigt · 2 Ergebnisdateien verfügbar/u);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
});

testAsync('connection-loss draft remains bound to its original run when another run is requested', async () => {
  const h = harness(); h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  await h.api.open(first);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').value = 'Mein nicht gespeicherter Entwurf';
  await h.act('document-markdown', 'input');
  h.api.invalidateConnection();
  const reads = h.calls.filter(call => call.command === 'get_document_reviews').length;
  assert.equal(h.api.activeBatchId(), first);
  assert.equal(h.api.canOpen(second), false);
  assert.equal(await h.api.open(second), false);
  assert.equal(h.api.activeBatchId(), first);
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, reads);
  assert.match(h.el('documents-status').textContent, /nicht.*in den gewählten Lauf übernommen/u);
  assert.equal(h.el('document-recovery-text').value, 'Mein nicht gespeicherter Entwurf');
  await h.act('document-recovery-discard');
  assert.equal(h.api.canOpen(second), true);
  await h.api.open(second);
  assert.equal(h.api.activeBatchId(), second);
});

function completedHarness(options = {}) {
  const h = harness({ explicitApproval: options.explicitApproval, invoke(command) {
    if (command === 'get_document_reviews') {
      if (options.failRead) throw Error('STANDALONE_IPC_FAILED');
      return { documents: structuredClone(options.empty ? [] : h.rows), processing_mode: 'markdown-and-anonymize',
        processing_complete: options.complete !== false, content_notice_count: 0, content_notice_breakdown_complete: true,
        export_receipts: options.receipt ? [{ operation_id: 'e'.repeat(32), folder_name: 'Export-' + 'e'.repeat(32),
          exported_count: 2, processing_mode: 'markdown-and-anonymize' }] : [],
        unavailable: [], not_processed_documents: options.omission ? [{ document_id: '3'.repeat(32), name: 'scan.png',
          classification: 'ocr_omission', reason_code: 'IMAGE_OCR_REQUIRED' }] : [],
        local_ui_only: true, external_disclosure: false };
    }
  } });
  return h;
}

testAsync('normal completion exposes result files without a second selection, approval or export', async () => {
  const h = completedHarness(); await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-completion').hidden, false);
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
  assert.match(h.el('documents-completion-text').textContent, /2 Ergebnisse sind verfügbar.*Keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.equal(h.el('documents-open-results').disabled, false);
  assert.equal(h.el('documents-export').hidden, true);
  assert.equal(h.el('documents-approval-extras').hidden, true);
  assert.ok(h.el('documents-list').children.every(row => row.children[0].hidden === true));
  assert.equal(h.calls.some(row => isDecision(row) || row.command === 'export_approved_documents'), false);
  assert.equal(h.api.activeBatchId(), 'a'.repeat(64));
});

testAsync('legacy approval flags never gate normal result-file completion', async () => {
  const h = completedHarness(); await h.api.open('a'.repeat(64));
  h.rows[0].approved = true; await h.act('documents-reload');
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
  h.rows[1].approved = true; await h.act('documents-reload');
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
  await h.all(); await h.act('documents-revoke');
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
  assert.equal(h.calls.some(row => row.command === 'export_approved_documents'), false);
});

testAsync('available approvals can finish with expected omissions without releasing omitted sources', async () => {
  const h = completedHarness({ omission: true }); h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen · mit Hinweisen');
  assert.match(h.el('documents-completion-text').textContent, /2 Ergebnisse sind verfügbar.*Nicht verfügbare Quellen sind nicht in den Ergebnisdateien enthalten/u);
});

for (const option of [{ complete: false }, { empty: true }, { failRead: true }])
  testAsync('no completion from incomplete, empty or failed read: ' + JSON.stringify(option), async () => {
    const h = completedHarness(option); h.rows.forEach(row => { row.approved = true; });
    await h.api.open('a'.repeat(64));
    assert.equal(h.el('documents-completion').hidden, true);
    assert.equal(h.calls.some(row => row.command === 'export_approved_documents'), false);
  });

testAsync('an approval still awaiting confirmation is not presented as completed', async () => {
  const h = completedHarness({ explicitApproval: true }); await h.api.open('a'.repeat(64));
  await h.all(); await h.act('documents-approve');
  assert.equal(h.el('documents-approve-confirm').hidden, false);
  assert.equal(h.el('documents-completion').hidden, true);
  assert.equal(h.calls.some(isDecision), false);
  await h.act('documents-approve-cancel');
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
});

testAsync('existing receipts do not turn document completion into an invitation to repeat export', async () => {
  const h = completedHarness({ receipt: true }); h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-completion-title').textContent, 'Anonymisierungslauf abgeschlossen');
  assert.match(h.el('documents-completion-text').textContent, /Keine zusätzliche Freigabe oder Exportbestätigung/u);
  assert.equal(h.el('documents-export-receipts').hidden, false);
  assert.equal(h.el('documents-export-receipt-list').children.length, 1);
  assert.equal(h.calls.some(row => row.command === 'export_approved_documents'), false);
});

testAsync('completion navigation fallback requests the exact history summary without mutation', async () => {
  const h = completedHarness(), navigations = [];
  h.rows.forEach(row => { row.approved = true; });
  await h.api.open('a'.repeat(64));
  h.el('nav-history').addEventListener('click', () => navigations.push(h.el('nav-history').dataset.openSummaryBatchId));
  await h.act('documents-completion-history');
  assert.deepEqual(navigations, ['a'.repeat(64)]);
  assert.equal(h.calls.some(row => isDecision(row) || row.command === 'export_approved_documents'), false);
});

const publishedReply = (batch, extra = {}) => ({ ok: true, batch_id: batch, local_ui_only: true, external_disclosure: false,
  result_publication: { state: 'current', generation_id: 'e'.repeat(32), count: 2, current_revision: 1 }, ...extra });
async function prepareCorrection(h, mode = 'markdown-and-anonymize') {
  h.rows.forEach(row => { row.processing_mode = mode; });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  if (mode === 'markdown-only') {
    h.el('document-markdown').value = '[PERSON_001]: 43 Projekte.'; await h.act('document-markdown', 'input');
  } else {
    await h.mark(14, 16);
  }
}
const saveCorrection = (h, mode) => h.act(mode === 'markdown-only' ? 'document-save-correction' : 'document-redact');

for (const state of ['initial', 'current', 'pending', 'conflict']) testAsync(`actual ${state} publication DTO preserves readiness and null-generation semantics`, async () => {
  const h = harness({ resultPublication: { state, generation_id: state === 'current' ? 'e'.repeat(32) : null, count: 2, current_revision: 0 } });
  await h.api.open('a'.repeat(64));
  const unsettled = state === 'pending' || state === 'conflict';
  assert.equal(h.el('documents-open-results').disabled, unsettled);
  assert.equal(h.el('documents-publish').hidden, !unsettled);
  assert.equal(h.guides.at(-1).phase, unsettled ? 'result_pending' : 'results_ready');
  assert.equal(h.el('documents-export').hidden, true); assert.equal(h.el('documents-approval-extras').hidden, true);
  assert.ok(h.el('documents-list').children.every(row => row.children[0].hidden));
  if (!unsettled) {
    await h.act('documents-publish');
    assert.equal(h.calls.some(call => call.command === 'publish_result_documents'), false,
      'a hidden retry control cannot create an unnecessary initial/current generation');
  }
  await h.act('documents-open-results');
  assert.equal(h.calls.filter(call => call.command === 'open_history_results').length, unsettled ? 0 : 1);
  assert.equal(h.calls.some(call => isDecision(call) || ['publish_result_documents', 'export_approved_documents'].includes(call.command)), false);
});

for (const value of [{ state: 'current', generation_id: null, count: 2, current_revision: 0 },
  { state: 'current', generation_id: 'e'.repeat(64), count: 2 },
  { state: 'current', generation_id: 'e'.repeat(32), count: 1 },
  { state: 'initial', generation_id: null, count: 2, current_revision: -1 }])
  testAsync(`malformed publication DTO fails closed: ${JSON.stringify(value)}`, async () => {
    const h = harness({ resultPublication: value }); await h.api.open('a'.repeat(64));
    assert.match(h.el('documents-status').textContent, /DOCUMENT_REVIEW_INVALID/u);
    assert.equal(h.el('documents-open-results').disabled, true); assert.equal(h.el('documents-completion').hidden, true);
    await h.act('documents-publish'); await h.act('documents-open-results');
    assert.equal(h.calls.some(call => ['publish_result_documents', 'open_history_results'].includes(call.command)), false);
  });

for (const mode of ['markdown-only', 'markdown-and-anonymize']) testAsync(`${mode}: saved revision waits for its separate complete-generation ACK, with no second selection or export`, async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command) { if (command === 'publish_result_documents') return pending; } });
  try {
    await prepareCorrection(h, mode);
    assert.equal(h.calls.some(call => call.command === 'publish_result_documents'), false);
    await saveCorrection(h, mode);
    assert.equal(h.calls.filter(isDecision).length, 1);
    assert.deepEqual(h.calls.find(call => call.command === 'publish_result_documents').args, { batchId: 'a'.repeat(64) });
    assert.equal(h.el('documents-back').disabled, true); assert.equal(h.el('documents-open-results').disabled, true);
    assert.equal(h.el('documents-reload').disabled, true); assert.equal(h.el('documents-completion').hidden, true);
    assert.match(h.el('documents-status').textContent, /wird sicher bereitgestellt/u);
    assert.doesNotMatch(h.el('documents-status').textContent, /Ergebnisstand bereitgestellt/u);
    assert.equal(await h.api.close(), false); assert.equal(h.api.canOpen('b'.repeat(64)), false);
    await h.act('documents-publish'); await saveCorrection(h, mode);
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
    finish(publishedReply('a'.repeat(64))); await tick(); await tick(); await tick();
    assert.equal(h.el('documents-open-results').disabled, false); assert.equal(h.el('documents-completion').hidden, false);
    assert.match(h.el('documents-status').textContent, /Ergebnisstand bereitgestellt/u);
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
    assert.equal(h.calls.filter(isDecision).some(call => ['approve', 'revoke'].includes(call.args.decision.action)), false);
  } finally { finish(publishedReply('a'.repeat(64))); await tick(); }
});

for (const variant of ['batch', 'scope', 'disclosure', 'current-null', 'count', 'pending', 'conflict', 'failure'])
  testAsync(`unconfirmed generation ${variant} never reports a successful correction delivery or replays its decision`, async () => {
    let attempts = 0;
    const h = harness({ invoke(command) {
      if (command !== 'publish_result_documents') return;
      attempts++;
      if (variant === 'failure') throw Error('RESULT_PUBLICATION_CONFLICT');
      const result = publishedReply('a'.repeat(64));
      if (variant === 'batch') result.batch_id = 'b'.repeat(64);
      if (variant === 'scope') result.local_ui_only = false;
      if (variant === 'disclosure') result.external_disclosure = true;
      if (variant === 'current-null') result.result_publication.generation_id = null;
      if (variant === 'count') result.result_publication.count = 1;
      if (variant === 'pending' || variant === 'conflict') Object.assign(result.result_publication, { state: variant, generation_id: null });
      return result;
    } });
    await prepareCorrection(h); await saveCorrection(h); await tick(); await tick();
    assert.equal(attempts, 1); assert.equal(h.calls.filter(isDecision).length, 1);
    assert.equal(h.el('documents-open-results').disabled, true); assert.equal(h.el('documents-publish').hidden, false);
    assert.equal(h.el('document-redact').disabled, true); assert.equal(h.el('document-restore').disabled, true);
    assert.match(h.el('documents-status').textContent, /RESULT_PUBLICATION_|DOCUMENT_REVIEW_INVALID/u);
    assert.doesNotMatch(h.el('documents-status').textContent, /aktueller Ergebnisstand bereitgestellt/u);
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
    await h.act('documents-open-results'); assert.equal(h.calls.some(call => call.command === 'open_history_results'), false);
  });

testAsync('explicit publication recovery only reconciles current results and never creates another decision or legacy export', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ resultPublication: { state: 'pending', generation_id: null, count: 2, current_revision: 1 },
    invoke(command) { if (command === 'publish_result_documents') return pending; } });
  try {
    await h.api.open('a'.repeat(64)); await h.act('documents-publish');
    assert.equal(h.el('documents-back').disabled, true); assert.equal(h.el('documents-publish').disabled, true);
    await h.act('documents-publish'); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
    finish(publishedReply('a'.repeat(64))); await tick(); await tick();
    assert.match(h.el('documents-status').textContent, /Aktueller Ergebnisstand bestätigt/u);
    assert.equal(h.el('documents-open-results').disabled, false); assert.equal(h.el('documents-publish').hidden, true);
    assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
  } finally { finish(publishedReply('a'.repeat(64))); await tick(); }
});

for (const phase of ['decision', 'publication', 'detail']) testAsync(`late ${phase} ACK cannot mutate or announce into a reopened same-run successor`, async () => {
  let finish, chunks = 0; const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command) {
    if (phase === 'detail' && command === 'get_document_review_chunk' && ++chunks === 2) return pending;
    if (phase === 'detail') return;
    if (command === (phase === 'decision' ? 'decide_document_review' : 'publish_result_documents')) return pending;
  } });
  try {
    await prepareCorrection(h); await saveCorrection(h); h.api.invalidateConnection();
    await h.api.open('a'.repeat(64));
    const fresh = h.el('documents-status').textContent, action = h.el('document-action-status').textContent;
    const readCount = h.calls.filter(call => call.command === 'get_document_reviews').length;
    finish(phase === 'detail' ? { ...h.rows[0], chunk_index: 0, original_text: 'Original', markdown: 'alter Vergleich',
      local_ui_only: true, external_disclosure: false } : phase === 'publication' ? publishedReply('a'.repeat(64)) :
      { ok: true, ...h.rows[0], revision: 1, approved: false, local_ui_only: true, external_disclosure: false });
    await tick(); await tick(); await tick();
    assert.equal(h.el('documents-status').textContent, fresh); assert.equal(h.el('document-action-status').textContent, action);
    assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, readCount);
    assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, phase === 'decision' ? 0 : 1);
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.el('documents-back').disabled, false);
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  } finally { finish(publishedReply('a'.repeat(64))); await tick(); }
});

testAsync('unsaved raw edits prevent publication retry, result opening and close without discarding the draft', async () => {
  const h = harness(); await prepareCorrection(h, 'markdown-only');
  const draft = h.el('document-markdown').value;
  await h.act('documents-publish'); await h.act('documents-open-results');
  assert.equal(await h.api.close(), false); assert.equal(h.el('document-markdown').value, draft);
  assert.equal(h.calls.some(call => ['publish_result_documents', 'open_history_results'].includes(call.command)), false);
  assert.equal(h.calls.some(isDecision), false);
});

for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const completion of ['missing', false])
  testAsync(`${mode}: ${String(completion)} completion remains readable but cannot commit a new private revision before publication`, async () => {
    const h = harness({ invoke(command, args) {
      if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: mode,
        ...(completion === 'missing' ? {} : { processing_complete: false }), result_publication: { state: 'initial',
          generation_id: null, count: 2, current_revision: 0 }, unavailable: [], local_ui_only: true, external_disclosure: false };
      if (command === 'get_document_entities') return { ok: true, ...h.rows[0], page: args.page, pages: 1,
        entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]', disabled: false,
          kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 0, output_end: 12 }],
        local_ui_only: true, external_disclosure: false };
    } });
    h.rows.forEach(row => { row.processing_mode = mode; });
    if (mode !== 'markdown-only') Object.assign(h.rows[0], { entity_review_available: true, entity_count: 1, run_entity_review_available: true });
    await h.api.open('a'.repeat(64));
    await h.act(h.el('documents-list').children[0].children[1].children[0]);
    assert.equal(h.el('document-original').value, 'Anna Beispiel: 42 Projekte.');
    assert.equal(h.el('document-markdown').readOnly, true);
    assert.equal(h.el('documents-completion').hidden, true); assert.equal(h.el('documents-open-results').disabled, true);
    if (mode === 'markdown-only') {
      h.el('document-markdown').value = 'Programmatic unsaved edit'; await h.act('document-markdown', 'input');
      assert.equal(h.el('document-save-correction').disabled, true); await h.act('document-save-correction');
    } else {
      h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
      assert.equal(h.el('document-redact').disabled, true); await h.act('document-redact'); await h.act('document-change-save');
      await h.act('document-restore'); await h.act('document-change-save');
      const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
      h.el('entities-decision').value = 'person'; assert.equal(h.el('entities-apply').disabled, true); await h.act('entities-apply');
    }
    await h.act('documents-publish'); await h.act('documents-open-results');
    assert.equal(h.calls.some(call => isDecision(call) || ['publish_result_documents', 'open_history_results', 'export_approved_documents'].includes(call.command)), false);
  });

testAsync('a highlighted optional mask cannot commit if a fresh read withdraws terminal completion', async () => {
  let complete = true;
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: complete, result_publication: { state: 'initial', generation_id: null, count: 2, current_revision: 0 },
      unavailable: [], local_ui_only: true, external_disclosure: false };
  } });
  await prepareCorrection(h);
  assert.equal(h.el('document-redact').disabled, false);
  complete = false; await h.act('documents-reload');
  assert.equal(h.el('document-redact').disabled, true); await h.act('document-redact');
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'publish_result_documents'), false);
  assert.equal(h.el('documents-completion').hidden, true);
  assert.equal(h.el('document-original').value, 'Anna Beispiel: 42 Projekte.');
});

const publicationErrorCases = {
  AI_EXPORT_CONFIGURATION_REQUIRED: /sichere native Bindung an das ursprüngliche Ergebnisziel fehlt/u,
  AI_EXPORT_VOLUME_MISMATCH: /nicht auf einem kompatiblen Laufwerk/u,
  AI_EXPORT_UNCERTAIN: /Zustand der Ergebnisbereitstellung ist nicht eindeutig belegt/u,
  AI_EXPORT_INCOMPLETE: /Ergebnisbereitstellung ist noch nicht vollständig bestätigt/u,
  AI_EXPORT_CONFLICT: /gebundener Ordner oder eine Datei steht im Konflikt/u,
  AI_EXPORT_INVALID: /Bereitstellungsauftrag oder sein Beleg ist nicht gültig/u
};
for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const [code, cause] of Object.entries(publicationErrorCases))
  testAsync(`${mode}: ${code} during result publication offers the current recovery controls, not a hidden legacy export`, async () => {
    const h = harness({ invoke(command) { if (command === 'publish_result_documents') throw Error(code); } });
    await prepareCorrection(h, mode); await saveCorrection(h, mode); await tick(); await tick();
    const message = h.el('documents-status').textContent;
    assert.match(message, cause); assert.match(message, /Änderung kann bereits gespeichert sein/u);
    assert.match(message, /Unter Einstellungen das ursprüngliche Ergebnisziel, seine Identität und Zugriffsrechte prüfen/u);
    assert.match(message, /„Bereitstellung erneut prüfen“/u);
    assert.match(message, /ohne die fachliche Änderung erneut zu speichern/u);
    assert.match(message, /Keine neue Quellverarbeitung blind starten/u);
    assert.doesNotMatch(message, /Export erneut abgleichen|Exportbutton|Ergebnisordner wählen\/ändern|Freigaben bleiben erhalten/u);
    assert.equal(h.el('documents-export').hidden, true); assert.equal(h.el('documents-open-results').disabled, true);
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
    assert.equal(h.calls.some(call => ['export_approved_documents', 'configure_results', 'start_admitted_batch'].includes(call.command)), false);
  });

for (const mode of ['markdown-only', 'markdown-and-anonymize'])
  testAsync(`${mode}: a legacy publication refusal never advertises a successful re-publication or an automatic new run`, async () => {
    const h = harness({ invoke(command) { if (command === 'publish_result_documents') throw Error('RESULT_PUBLICATION_LEGACY'); } });
    await prepareCorrection(h, mode); await saveCorrection(h, mode); await tick(); await tick();
    const message = h.el('documents-status').textContent;
    assert.match(message, /ältere Lauf unterstützt keine automatische Bereitstellung neuer Ergebnisstände/u);
    assert.match(message, /Nachbearbeitung kann privat gespeichert sein/u);
    assert.match(message, /Ergebnisdateien werden dadurch nicht aktualisiert oder erneut veröffentlicht/u);
    assert.match(message, /Nicht blind erneut ändern, einen neuen Lauf starten oder einen anderen Zielordner zuweisen/u);
    assert.doesNotMatch(message, /Bereitstellung erneut prüfen|Ergebnisstand bereitgestellt|Ergebnisordner wählen\/ändern/u);
    assert.equal(h.el('documents-open-results').disabled, true);
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
    assert.equal(h.calls.some(call => ['export_approved_documents', 'configure_results', 'start_admitted_batch'].includes(call.command)), false);
  });

const legacyErrorCases = {
  AI_EXPORT_CONFIGURATION_REQUIRED: /Wähle hier „Ergebnisordner wählen\/ändern“ und bestätige den Export danach erneut/u,
  AI_EXPORT_VOLUME_MISMATCH: /Wähle hier einen Ordner auf demselben Laufwerk und bestätige danach erneut/u,
  AI_EXPORT_UNCERTAIN: /„Export erneut abgleichen“ prüft denselben Auftrag/u,
  AI_EXPORT_INCOMPLETE: /Bitte denselben Export erneut abgleichen/u,
  AI_EXPORT_CONFLICT: /Im Exportordner besteht ein Konflikt/u,
  AI_EXPORT_INVALID: /gespeicherte Exportauftrag oder sein Beleg ist nicht gültig/u
};
for (const [code, legacyCause] of Object.entries(legacyErrorCases))
  testAsync(`legacy ${code} copy-dialog recovery remains unchanged and separate from new result publication`, async () => {
    const h = harness({ invoke(command) { if (command === 'export_approved_documents') throw Error(code); } });
    await h.api.open('a'.repeat(64)); await h.all(); await h.export(); await tick(); await tick();
    assert.match(h.el('documents-status').textContent, legacyCause);
    assert.doesNotMatch(h.el('documents-status').textContent, /Unter Einstellungen das ursprüngliche Ergebnisziel|„Bereitstellung erneut prüfen“/u);
    assert.equal(h.calls.some(call => call.command === 'publish_result_documents'), false);
    assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 1);
    assert.equal(h.el('document-export-dialog').open, true);
  });

testAsync('an entity-change publication failure uses result recovery while preserving its one committed decision', async () => {
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_entities') return { ok: true, ...h.rows[0], page: args.page, pages: 1,
      entities: [{ entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]', disabled: false,
        kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 0, output_end: 12 }],
      local_ui_only: true, external_disclosure: false };
    if (command === 'publish_result_documents') throw Error('AI_EXPORT_CONFIGURATION_REQUIRED');
  } });
  Object.assign(h.rows[0], { entity_review_available: true, entity_count: 1, run_entity_review_available: true });
  await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
  h.el('entities-scope').value = 'document'; h.el('entities-decision').value = 'person';
  await h.act('entities-apply'); await tick(); await tick();
  assert.match(h.el('documents-status').textContent, /Änderung kann bereits gespeichert sein.*„Bereitstellung erneut prüfen“/u);
  assert.doesNotMatch(h.el('documents-status').textContent, /Ergebnisordner wählen\/ändern/u);
  assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
});

testAsync('the explicit result retry reports only fixed recovery copy and does not expose native error details or replay decisions', async () => {
  const h = harness({ resultPublication: { state: 'pending', generation_id: null, count: 2, current_revision: 1 },
    invoke(command) { if (command === 'publish_result_documents') throw JSON.stringify({ code: 'AI_EXPORT_UNCERTAIN', details: { path: '/private/secret-fixture' } }); } });
  await h.api.open('a'.repeat(64)); await h.act('documents-publish');
  assert.match(h.el('documents-status').textContent, /Zustand der Ergebnisbereitstellung ist nicht eindeutig belegt.*„Bereitstellung erneut prüfen“/u);
  assert.doesNotMatch(h.el('documents-status').textContent, /secret-fixture|Export erneut abgleichen/u);
  assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
  assert.equal(h.calls.some(call => isDecision(call) || call.command === 'export_approved_documents'), false);
});

testAsync('a retired publication failure cannot place its new recovery instructions over a successor run', async () => {
  let reject; const pending = new Promise((_, fail) => { reject = fail; });
  const h = harness({ invoke(command) { if (command === 'publish_result_documents') return pending; } });
  try {
    await prepareCorrection(h); await saveCorrection(h); h.api.invalidateConnection(); await h.api.open('b'.repeat(64));
    const fresh = h.el('documents-status').textContent;
    reject(Error('AI_EXPORT_CONFIGURATION_REQUIRED')); await tick(); await tick(); await tick();
    assert.equal(h.el('documents-status').textContent, fresh);
    assert.doesNotMatch(h.el('documents-status').textContent, /Unter Einstellungen das ursprüngliche Ergebnisziel/u);
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
  } finally { reject(Error('AI_EXPORT_CONFIGURATION_REQUIRED')); await tick(); }
});

for (const processing_mode of ['markdown-only', 'markdown-and-anonymize']) testAsync(
  `legacy ${processing_mode}: missing publication capability stays readable and cannot create an unpublishable private edit`, async () => {
    const h = harness({ invoke(command) {
      if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode,
        processing_complete: true, unavailable: [], local_ui_only: true, external_disclosure: false };
    } });
    h.rows.forEach(row => { row.processing_mode = processing_mode; });
    await h.api.open('a'.repeat(64));
    await h.act(h.el('documents-list').children[0].children[1].children[0]);
    assert.equal(h.el('document-original').value, 'Anna Beispiel: 42 Projekte.');
    assert.equal(h.el('document-markdown').readOnly, true);
    assert.match(h.el('documents-purpose').textContent, /Älterer Lauf.*keine weiteren Textänderungen/u);
    assert.match(h.el('document-edit-hint').textContent, /nur lesbar/u);
    h.el('document-markdown').value = 'Not a saved private revision'; await h.act('document-markdown', 'input');
    await h.act('document-save-correction'); await h.act('document-redact'); await h.act('document-change-save');
    await h.act('document-restore'); await h.act('document-change-save'); await h.act('documents-publish');
    assert.equal(h.el('documents-publish').hidden, true);
    assert.equal(h.calls.some(call => isDecision(call) || call.command === 'publish_result_documents'), false);
  });

testAsync('HTML text positions round-trip exact CRLF/CR/LF and UTF-16 boundaries without changing backend bytes', async () => {
  const samples = ['', 'plain', '\r\n', '\r', '\n', 'aa\r\nxyz', 'a\rb\nc\r\nd', '\r\n\r\r\n\n',
    '😀\r\nA\re\u0301\n𐐀z', 'a\r\n😀\r\n𐐀\rb'];
  const validBoundary = (text, index) => !(index > 0 && index < text.length &&
    /[\uD800-\uDBFF]/u.test(text[index - 1]) && /[\uDC00-\uDFFF]/u.test(text[index]));
  for (const raw of samples) {
    const before = crypto.createHash('sha256').update(raw).digest('hex'), mapping = positions.create(raw);
    const expected = raw.replace(/\r\n?/gu, '\n'); assert.equal(mapping.display, expected);
    for (let start = 0; start <= expected.length; start++) for (let end = start; end <= expected.length; end++) {
      if (!validBoundary(expected, start) || !validBoundary(expected, end)) continue;
      const bound = mapping.backendRange(expected, start, end);
      assert.equal(raw.slice(bound.start, bound.end).replace(/\r\n?/gu, '\n'), expected.slice(start, end));
      assert.deepEqual(mapping.displayRange(bound.start, bound.end), { start, end });
    }
    assert.equal(mapping.correction(expected), null);
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), before);
    assert.equal(Object.isFrozen(mapping), true);
  }
});

testAsync('HTML text positions reject stale values, invalid ranges, half CRLF and split surrogate selections', async () => {
  const invalid = error => error.code === 'DOCUMENT_TEXT_POSITION_INVALID';
  for (const raw of [null, {}, '\ud800', '\udc00', 'x'.repeat(8 * 1024 * 1024 + 1)])
    assert.throws(() => positions.create(raw), invalid);
  const raw = 'A\r\n😀B', mapping = positions.create(raw);
  for (const [start, end] of [[-1, 2], [2, 1], [0, 20], [0.5, 2], [NaN, 2], [null, 2], [2, 3], [3, 4]])
    assert.throws(() => mapping.backendRange(mapping.display, start, end), invalid);
  assert.throws(() => mapping.backendRange(mapping.display + 'x', 0, 1), invalid);
  assert.throws(() => mapping.displayRange(2, 3), invalid, 'middle of the CRLF has no exact API coordinate');
  assert.throws(() => mapping.displayRange(4, 5), invalid, 'middle of the astral character is not a safe boundary');
  for (const text of ['A\rB', 'A\r\nB', '\ud800', null]) assert.throws(() => mapping.correction(text), invalid);
});

testAsync('HTML text positions work without the newer String.isWellFormed WebView API', async () => {
  const window = {}, context = vm.createContext({ window });
  vm.runInContext('String.prototype.isWellFormed = undefined;', context);
  vm.runInContext(positionsSource, context);
  const api = window.__DATASECURE_TEXT_POSITIONS__, mapping = api.create('😀\r\nxyz');
  assert.equal(mapping.display, '😀\nxyz');
  assert.equal(mapping.backendRange(mapping.display, 3, 6).start, 4);
  assert.throws(() => api.create('\ud800'), error => error.code === 'DOCUMENT_TEXT_POSITION_INVALID');
});

testAsync('API correction maps one deliberate edit back to original offsets and retains untouched line endings', async () => {
  const cases = [
    ['before\r\nTARGET\r\nafter', 'before\nCHANGED\nafter', 'before\r\nCHANGED\r\nafter'],
    ['before\rTARGET\nafter', 'before\nCHANGED\nafter', 'before\rCHANGED\nafter'],
    ['😀\r\nold\rafter', '😀\nnew\nafter', '😀\r\nnew\rafter'],
    ['a\r\nb', 'ax\nb', 'ax\r\nb'],
    ['a\r\nb', 'a\nxb', 'a\r\nxb'],
    ['a\r\nb', 'ab', 'ab'],
    ['a\r\nb', 'a\n\nb', 'a\r\n\nb'],
    ['a\r\n😀b', 'a\n😃b', 'a\r\n😃b'],
    ['😀\r\nend', '\nend', '\r\nend'],
    ['\r\nend', '😀\nend', '😀\r\nend']
  ];
  for (const [raw, edited, expected] of cases) {
    const correction = positions.create(raw).correction(edited);
    assert.ok(correction); assert.equal(correction.replacement.isWellFormed(), true);
    const actual = raw.slice(0, correction.start) + correction.replacement + raw.slice(correction.end);
    assert.equal(actual, expected); assert.equal(actual.replace(/\r\n?/gu, '\n'), edited);
  }
});

function positionedFixture(markdown, { original = markdown, mode = 'markdown-and-anonymize', entities = null } = {}) {
  let backend = markdown; const control = { loseReply: false };
  const hash = text => crypto.createHash('sha256').update(text).digest('hex');
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_review_chunk') return { ...h.rows[0], chunk_index: args.chunkIndex,
      original_text: original, markdown: backend, local_ui_only: true, external_disclosure: false };
    if (command === 'get_document_entities') return { ok: true, ...h.rows[0], page: args.page, pages: 1,
      entities, local_ui_only: true, external_disclosure: false };
    if (command === 'decide_document_review') {
      assert.equal(args.decision.output_sha256, hash(backend)); assert.equal(args.decision.revision, h.rows[0].revision);
      assert.equal(args.decision.ranges.length, 1);
      const range = args.decision.ranges[0];
      backend = backend.slice(0, range.start) + (args.decision.action === 'correct' ? range.replacement : '[MANUAL_REDACTION]') + backend.slice(range.end);
      Object.assign(h.rows[0], { revision: h.rows[0].revision + 1, output_sha256: hash(backend), text_modified: true, approved: false });
      if (control.loseReply) { control.loseReply = false; throw Error('STANDALONE_BUSY'); }
      return { ok: true, ...h.rows[0], local_ui_only: true, external_disclosure: false };
    }
  } });
  h.rows.forEach(row => { row.processing_mode = mode; });
  Object.assign(h.rows[0], { output_sha256: hash(markdown), entity_review_available: Boolean(entities), entity_count: entities?.length || 0 });
  return { h, control, backend: () => backend, async open() {
    await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  } };
}

for (const raw of ['aa\r\nxyz', 'aa\rxyz', 'aa\nxyz', '😀\r\na\rb\nxyz\r\nend'])
  testAsync(`manual masking targets exact backend characters after textarea normalization: ${JSON.stringify(raw)}`, async () => {
    const f = positionedFixture(raw); await f.open(); const { h } = f;
    const visible = h.el('document-markdown').value, start = visible.indexOf('xyz');
    await h.mark(start, start + 3); assert.equal(h.calls.some(isDecision), false);
    await h.act('document-redact'); await tick(); await tick();
    const call = h.calls.find(isDecision);
    assert.deepEqual(call.args.decision.ranges, [{ start: raw.indexOf('xyz'), end: raw.indexOf('xyz') + 3 }]);
    assert.equal(f.backend(), raw.replace('xyz', '[MANUAL_REDACTION]'));
    assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
  });

testAsync('manual masking refuses half an astral character or a changed readonly display without a decision', async () => {
  for (const changed of [false, true]) {
    const f = positionedFixture('aa\r\n😀end'); await f.open(); const { h } = f, node = h.el('document-markdown');
    if (changed) node.value += 'x';
    const start = node.value.indexOf('😀'); await h.mark(start + (changed ? 0 : 1), start + 2);
    await h.act('document-redact');
    assert.equal(h.calls.some(isDecision), false); assert.equal(h.calls.some(call => call.command === 'publish_result_documents'), false);
    assert.match(h.el('documents-status').textContent, /vollständige Zeichen markieren/u);
    assert.equal(f.backend(), 'aa\r\n😀end');
  }
});

testAsync('complete astral-character mask remains exact after CRLF without splitting UTF-16', async () => {
  const f = positionedFixture('aa\r\n😀end'); await f.open(); const { h } = f, node = h.el('document-markdown');
  const start = node.value.indexOf('😀'); await h.mark(start, start + 2);
  await h.act('document-redact'); await tick(); await tick();
  assert.equal(f.backend(), 'aa\r\n[MANUAL_REDACTION]end');
  assert.deepEqual(h.calls.find(isDecision).args.decision.ranges, [{ start: 4, end: 6 }]);
});

testAsync('entity inspection maps source and Markdown highlights independently across mixed line endings', async () => {
  const original = '😀\r\nsource\rNAME\nend', markdown = '😀\r\noutput\r\n[PERSON_001]\rend';
  const entity = { entity_id: 'entity_000001', original: 'NAME', replacement: '[PERSON_001]', disabled: false,
    kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: markdown.indexOf('[PERSON_001]'),
    output_end: markdown.indexOf('[PERSON_001]') + 12, source_start: original.indexOf('NAME'), source_end: original.indexOf('NAME') + 4 };
  const f = positionedFixture(markdown, { original, entities: [entity] }); await f.open(); const { h } = f;
  const inspect = h.el('entities-list').children[0].children[1].children[0]; await h.act(inspect);
  const right = h.el('document-markdown'), left = h.el('document-original');
  assert.equal(right.value.slice(right.selectionStart, right.selectionEnd), '[PERSON_001]');
  assert.equal(left.value.slice(left.selectionStart, left.selectionEnd), 'NAME');
  assert.equal(h.document.activeElement, right); assert.equal(h.calls.some(isDecision), false);
});

testAsync('an unrepresentable source highlight never partially changes either comparison selection', async () => {
  const original = 'a\r\nNAME', markdown = 'a\r\n[PERSON_001]';
  const f = positionedFixture(markdown, { original, entities: [{ entity_id: 'entity_000001', original: 'NAME', replacement: '[PERSON_001]',
    disabled: false, kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 3, output_end: 15,
    source_start: 2, source_end: 7 }] });
  await f.open(); const { h } = f, right = h.el('document-markdown'), left = h.el('document-original');
  right.setSelectionRange(0, 1); left.setSelectionRange(0, 1); const active = h.document.activeElement;
  await h.act(h.el('entities-list').children[0].children[1].children[0]);
  assert.equal(right.selectionStart, 0); assert.equal(right.selectionEnd, 1);
  assert.equal(left.selectionStart, 0); assert.equal(left.selectionEnd, 1); assert.equal(h.document.activeElement, active);
  assert.match(h.el('documents-status').textContent, /DOCUMENT_TEXT_POSITION_INVALID/u); assert.equal(h.calls.some(isDecision), false);
});

for (const raw of ['before\r\nTARGET\r\nafter', 'before\rTARGET\nafter', '😀\r\nTARGET\rafter'])
  testAsync(`raw correction has no phantom dirty state and preserves original untouched bytes: ${JSON.stringify(raw)}`, async () => {
    const f = positionedFixture(raw, { mode: 'markdown-only' }); await f.open(); const { h } = f;
    assert.equal(h.el('document-save-correction').disabled, true); assert.equal(h.el('document-discard-correction').disabled, true);
    h.el('document-markdown').value = h.el('document-markdown').value.replace('TARGET', 'CHANGED'); await h.act('document-markdown', 'input');
    await h.act('document-save-correction'); await tick(); await tick();
    const correction = h.calls.find(isDecision).args.decision;
    assert.deepEqual(correction.ranges, [{ start: raw.indexOf('TARGET'), end: raw.indexOf('TARGET') + 6, replacement: 'CHANGED' }]);
    assert.equal(f.backend(), raw.replace('TARGET', 'CHANGED')); assert.equal(h.calls.filter(isDecision).length, 1);
  });

testAsync('discard and lost-reply recovery compare API text without normalizing saved CRLF/CR bytes', async () => {
  const raw = 'before\r\nTARGET\rafter', f = positionedFixture(raw, { mode: 'markdown-only' }); await f.open(); const { h } = f;
  h.el('document-markdown').value += ' draft'; await h.act('document-markdown', 'input'); await h.act('document-discard-correction');
  assert.equal(h.el('document-markdown').value, raw.replace(/\r\n?/gu, '\n')); assert.equal(h.el('document-save-correction').disabled, true);
  h.el('document-markdown').value = h.el('document-markdown').value.replace('TARGET', 'CHANGED'); await h.act('document-markdown', 'input');
  f.control.loseReply = true; await h.act('document-save-correction'); await tick(); await tick();
  assert.equal(h.el('document-recovery-draft').hidden, false); assert.equal(f.backend(), raw.replace('TARGET', 'CHANGED'));
  await h.act('documents-reload'); await tick(); await tick();
  assert.equal(h.el('document-recovery-draft').hidden, true); assert.equal(h.el('document-save-correction').disabled, true);
  assert.match(h.el('documents-status').textContent, /gespeicherte Text stimmt mit deinem Korrekturentwurf überein/u);
  assert.equal(h.calls.filter(isDecision).length, 1, 'recovery never issues a second decision');
});

testAsync('a fresh left focus, invalid selection, reload or file change cannot reuse an old right-hand mask range', async () => {
  const f = positionedFixture('aa\r\nxyz\r\n😀end'); await f.open(); const { h } = f;
  await h.mark(3, 6); assert.equal(h.el('document-mask-preview').value, 'xyz'); assert.equal(h.el('document-redact').disabled, false);
  h.el('document-original').focus(); await h.act('document-original', 'focus');
  assert.equal(h.el('document-redact').disabled, true); assert.equal(h.el('document-mask-preview').hidden, true);
  await h.act('document-redact'); assert.equal(h.calls.some(isDecision), false);
  h.el('document-markdown').focus(); await h.act('document-markdown', 'focus');
  assert.equal(h.el('document-redact').disabled, true, 'returning focus alone does not authorize a retained old selection');
  const emoji = h.el('document-markdown').value.indexOf('😀'); await h.mark(emoji + 1, emoji + 2);
  assert.equal(h.el('document-redact').disabled, true); await h.act('document-redact'); assert.equal(h.calls.some(isDecision), false);
  await h.mark(3, 6); await h.act('documents-reload');
  assert.equal(h.el('document-redact').disabled, true, 'even a same-revision explicit reload invalidates the preview');
  await h.mark(3, 6); await h.act('document-next'); await h.act('document-redact');
  assert.equal(h.calls.some(isDecision), false); assert.equal(f.backend(), 'aa\r\nxyz\r\n😀end');
});

function pagedEntitiesHarness(options = {}) {
  const control = { failPage: null, failReload: false };
  const total = options.total || 41, size = options.pageSize || 20;
  const entities = Array.from({ length: total }, (_, index) => ({ entity_id: `entity_${String(index + 1).padStart(6, '0')}`,
    original: `Value ${index + 1}`, replacement: '[PERSON_001]', disabled: false, kind: 'PERSON', count: 1, decision: 'default',
    run_eligible: options.ineligible !== index + 1, output_start: 0, output_end: 12 }));
  const h = harness({ invoke(command, args) {
    if (command === 'get_document_reviews' && control.failReload) throw Error('STANDALONE_BUSY');
    if (command === 'get_document_entities') {
      if (control.failPage === args.page) throw Error('STANDALONE_BUSY');
      return { ok: true, ...h.rows[0], page: args.page, pages: Math.ceil(total / size), entities: entities.slice(args.page * size, (args.page + 1) * size),
        local_ui_only: true, external_disclosure: false };
    }
    if (options.invoke) return options.invoke(command, args, h);
  } });
  Object.assign(h.rows[0], { entity_review_available: true, entity_count: total, run_entity_review_available: true });
  return { h, control, async open() { await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]); },
    async choose(index = 0) { const node = h.el('entities-list').children[index].children[0].children[0]; node.checked = true; await h.act(node, 'change'); return node; } };
}

testAsync('entity pages retain the exact cross-page selection, require a conscious treatment and default to file-only', async () => {
  const f = pagedEntitiesHarness(); await f.open(); const { h } = f;
  assert.equal(h.el('entities-scope').value, 'document'); assert.equal(h.el('entities-decision').value, '');
  await f.choose(); assert.equal(h.el('entities-apply').disabled, true); assert.match(h.el('entities-reason').textContent, /Behandlung bewusst auswählen/u);
  const old = h.el('entities-list').children[0].children[0].children[0];
  await h.act('entities-next'); assert.equal(h.el('entities-page').textContent, 'Seite 2 von 3'); await f.choose(1);
  await h.act('entities-previous'); assert.equal(h.el('entities-list').children[0].children[0].children[0].checked, true);
  assert.match(h.el('entities-count').textContent, /^2 ausgewählt/u); assert.equal(h.calls.some(isDecision), false);
  h.el('entities-decision').value = 'organization'; await h.act('entities-decision', 'change'); assert.equal(h.el('entities-apply').disabled, false);
  await h.act('entities-apply'); await tick(); await tick();
  const decision = h.calls.find(isDecision).args.decision;
  assert.deepEqual(decision.entity_decisions, [{ entity_id: 'entity_000001', decision: 'organization' }, { entity_id: 'entity_000022', decision: 'organization' }]);
  assert.equal(decision.scope, undefined); assert.equal(h.calls.filter(isDecision).length, 1); assert.equal(h.calls.filter(call => call.command === 'publish_result_documents').length, 1);
  old.checked = true; await h.act(old, 'change');
  assert.equal(h.el('document-draft-controls').hidden, true, 'a removed old-revision checkbox cannot prepare a new decision');
});

testAsync('off-page ambiguous identities still block run scope while file-only treatment remains available', async () => {
  const f = pagedEntitiesHarness({ ineligible: 1 }); await f.open(); const { h } = f;
  await f.choose(); await h.act('entities-next'); await f.choose();
  h.el('entities-decision').value = 'person'; h.el('entities-scope').value = 'run'; await h.act('entities-scope', 'change');
  assert.equal(h.el('entities-apply').disabled, true); assert.match(h.el('entities-reason').textContent, /keine gemeinsame laufweite Identität/u);
  await h.act('entities-apply'); assert.equal(h.calls.some(isDecision), false);
  h.el('entities-scope').value = 'document'; await h.act('entities-scope', 'change');
  assert.equal(h.el('entities-apply').disabled, false);
});

testAsync('500-ID selection cap is enforced before writing and the 501st checkbox cannot discard prior pages', async () => {
  const f = pagedEntitiesHarness({ total: 501 }); await f.open(); const { h } = f;
  for (let page = 0; page < 25; page++) {
    h.el('entities-all').checked = true; await h.act('entities-all', 'change'); await h.act('entities-next');
  }
  assert.match(h.el('entities-count').textContent, /^500 ausgewählt/u);
  await f.choose(); assert.match(h.el('documents-status').textContent, /Höchstens 500/u);
  assert.equal(h.el('entities-list').children[0].children[0].children[0].checked, false);
  assert.match(h.el('entities-count').textContent, /^500 ausgewählt/u); assert.equal(h.calls.some(isDecision), false);
  h.el('entities-decision').value = 'default'; await h.act('entities-decision', 'change'); await h.act('entities-apply'); await tick(); await tick();
  assert.equal(h.calls.find(isDecision).args.decision.entity_decisions.length, 500);
});

testAsync('prepared treatment holds file/reload/close navigation until an explicit discard, without blocking its own save', async () => {
  const f = pagedEntitiesHarness(); await f.open(); const { h } = f;
  await f.choose(); h.el('entities-decision').value = 'keep'; await h.act('entities-decision', 'change');
  assert.equal(h.el('entities-apply').disabled, false); assert.equal(h.el('document-next').disabled, true);
  assert.equal(h.el('documents-reload').disabled, true); assert.equal(h.el('documents-back').disabled, true);
  assert.equal(h.el('documents-list').children[1].children[1].children[0].disabled, true);
  const reads = h.calls.filter(call => call.command === 'get_document_reviews').length, chunks = h.calls.filter(call => call.command === 'get_document_review_chunk').length;
  await h.act('documents-reload'); await h.act('document-next'); await h.act(h.el('documents-list').children[1].children[1].children[0]);
  assert.equal(await h.api.close(), false); assert.equal(await h.api.open('b'.repeat(64)), false);
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, reads); assert.equal(h.calls.filter(call => call.command === 'get_document_review_chunk').length, chunks);
  assert.match(h.el('entities-count').textContent, /^1 ausgewählt/u); assert.equal(h.calls.some(isDecision), false);
  await h.act('document-discard-draft'); assert.equal(h.el('documents-reload').disabled, false); assert.equal(h.el('document-next').disabled, false);
  assert.equal(await h.api.close(), true);
});

testAsync('failed page and reload reads preserve visible context but never enable an uncertain write', async () => {
  const f = pagedEntitiesHarness(); await f.open(); const { h, control } = f;
  await f.choose(); h.el('entities-decision').value = 'person'; await h.act('entities-decision', 'change');
  control.failPage = 1; await h.act('entities-next');
  assert.equal(h.el('entities-page').textContent, 'Seite 1 von 3'); assert.match(h.el('entities-count').textContent, /^1 ausgewählt/u);
  assert.equal(h.el('entities-list').children[0].children[0].children[0].checked, true);
  assert.equal(h.el('entities-apply').disabled, true); assert.match(h.el('entities-reason').textContent, /nicht mehr bestätigt/u);
  await h.act('entities-apply'); assert.equal(h.calls.some(isDecision), false);
  await h.act('document-discard-draft'); control.failReload = true; await h.act('documents-reload');
  assert.match(h.el('documents-status').textContent, /konnte nicht abgefragt werden/u); assert.equal(h.el('document-original').value, 'Anna Beispiel: 42 Projekte.');
  assert.equal(h.el('document-redact').disabled, true); assert.equal(h.el('entities-next').disabled, true);
});

testAsync('one entity page hides read-only pagination and a boundary call has a concrete explanation, not a write', async () => {
  const f = pagedEntitiesHarness({ total: 1 }); await f.open(); const { h } = f;
  assert.equal(h.el('entities-pagination').hidden, true); assert.equal(h.el('entities-next').disabled, true);
  const reads = h.calls.filter(call => call.command === 'get_document_entities').length;
  await h.act('entities-next'); assert.match(h.el('documents-status').textContent, /Seitenbuttons speichern keine Behandlung/u);
  assert.equal(h.calls.filter(call => call.command === 'get_document_entities').length, reads); assert.equal(h.calls.some(isDecision), false);
});

testAsync('restoration is a separate explicit draft with navigation hold and no automatic save', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.act('document-restore'); assert.equal(h.el('document-change-confirm').hidden, false);
  assert.match(h.el('document-change-confirm-text').textContent, /verwirft ihre späteren Text- und Entitätenänderungen/u);
  assert.equal(h.el('document-next').disabled, true); assert.equal(h.el('documents-reload').disabled, true);
  await h.act('document-next'); await h.act('documents-reload'); assert.equal(await h.api.close(), false); assert.equal(h.calls.some(isDecision), false);
  await h.act('document-change-cancel'); assert.equal(h.el('document-draft-controls').hidden, true); assert.equal(h.el('document-next').disabled, false);
});

for (const successor of ['same', 'different']) for (const outcome of ['success', 'rejection'])
  testAsync(`retired entity-page ${outcome} cannot invalidate a fresh ${successor}-batch successor`, async () => {
    let resolveOld, rejectOld, holding = true;
    const pending = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const firstBatch = 'a'.repeat(64), nextBatch = (successor === 'same' ? 'a' : 'b').repeat(64);
    const entity = { entity_id: 'entity_000001', original: 'Anna Beispiel', replacement: '[PERSON_001]', disabled: false,
      kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 0, output_end: 12 };
    const h = harness({ invoke(command, args) {
      if (command === 'get_document_entities') {
        if (args.page === 1 && holding) { holding = false; return pending; }
        return { ok: true, ...h.rows[0], page: args.page, pages: 2, entities: [entity], local_ui_only: true, external_disclosure: false };
      }
    } });
    Object.assign(h.rows[0], { entity_review_available: true, entity_count: 2, run_entity_review_available: true });
    try {
      await h.api.open(firstBatch); await h.act(h.el('documents-list').children[0].children[1].children[0]);
      await h.act('entities-next'); assert.equal(h.el('entities-previous').disabled, true);
      const originalResponse = { ok: true, ...h.rows[0], page: 1, pages: 2, entities: [entity], local_ui_only: true, external_disclosure: false };
      h.api.invalidateConnection(); await h.api.open(nextBatch); await h.act(h.el('documents-list').children[0].children[1].children[0]);
      const check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
      h.el('entities-decision').value = 'person'; await h.act('entities-decision', 'change');
      assert.equal(h.el('entities-apply').disabled, false); assert.equal(h.el('entities-next').disabled, false);
      const before = { status: h.el('documents-status').textContent, name: h.el('document-name').textContent,
        revision: h.el('document-revision').textContent, text: h.el('document-markdown').value,
        page: h.el('entities-page').textContent, reason: h.el('entities-reason').textContent };
      if (outcome === 'success') resolveOld(originalResponse); else rejectOld(Error('DOCUMENT_ENTITY_INVALID'));
      await tick(); await tick(); await tick();
      assert.equal(h.api.activeBatchId(), nextBatch);
      assert.deepEqual({ status: h.el('documents-status').textContent, name: h.el('document-name').textContent,
        revision: h.el('document-revision').textContent, text: h.el('document-markdown').value,
        page: h.el('entities-page').textContent, reason: h.el('entities-reason').textContent }, before);
      assert.equal(h.el('entities-apply').disabled, false, 'the old catch cannot mark the successor stale');
      assert.equal(h.el('entities-next').disabled, false, 'the successor retains read navigation');
      assert.equal(h.el('entities-list').children[0].children[0].children[0].checked, true);
      assert.equal(h.calls.some(isDecision), false);
    } finally { resolveOld({}); await tick(); }
  });

done();
