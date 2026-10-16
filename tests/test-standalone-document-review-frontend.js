'use strict';
// Actual document renderer in a minimal DOM: transition evidence, not layout
// or native IPC injection. Browser and packaged tests are separate gates.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Standalone document review renderer');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/document-review.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const textTree = node => [node.textContent, ...(node.children || []).map(textTree)].join(' ');
function harness(options = {}) {
  const nodes = new Map(), calls = [], guides = [], rows = [1, 2].map(n => ({ name: `Quelle-${n}.pdf`, document_id: String(n).repeat(32), revision: 0,
    output_sha256: String(n).repeat(64), chunks: 1, approved: false, processing_mode: 'markdown-and-anonymize' }));
  const intervals = new Set(); let now = 0;
  const document = { activeElement: null };
  const create = tag => ({ tag, children: [], events: new Map(), textContent: '', value: '', disabled: false, checked: false, isConnected: true,
    append(...values) { this.children.push(...values); }, replaceChildren(...values) { this.children = values; },
    setAttribute() {}, focus() { this.focused = true; document.activeElement = this; }, addEventListener(event, fn) { this.events.set(event, fn); },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    showModal() { this.open = true; }, close() { this.open = false; this.events.get('close')?.(); } });
  const el = id => { if (!nodes.has(id)) nodes.set(id, create('div')); return nodes.get(id); };
  const invoke = async (command, args) => {
    calls.push({ command, args: structuredClone(args) });
    if (options.invoke) { const response = await options.invoke(command, args); if (response !== undefined) return response; }
    if (command === 'get_document_reviews') return { documents: structuredClone(rows), unavailable: [], local_ui_only: true, external_disclosure: false };
    if (command === 'preview_document_export') return { ok: true, processing_mode: rows[0].processing_mode, local_ui_only: true, external_disclosure: false,
      files: args.selection.map((row, index) => ({ name: rows[0].processing_mode === 'markdown-only' ? `Quelle-${index + 1}.md` : `Dokument_${String(index + 1).padStart(2, '0')}.md`, sha256: row.output_sha256 })) };
    if (command === 'get_document_review_chunk') return { ...rows.find(row => row.document_id === args.documentId), chunk_index: args.chunkIndex,
      original_text: 'Anna Beispiel: 42 Projekte.', markdown: options.maskAfterRevision && rows.find(row => row.document_id === args.documentId).revision > 0 ?
        '[PERSON_001]: [MANUAL_REDACTION] Projekte.' : options.strictBindings ? `Stand ${rows.find(row => row.document_id === args.documentId).revision}` :
          '[PERSON_001]: 42 Projekte.', local_ui_only: true, external_disclosure: false };
    if (command === 'decide_document_review') { const row = rows.find(row => row.document_id === args.documentId);
      if (options.strictBindings) { assert.equal(args.decision.revision, row.revision); assert.equal(args.decision.output_sha256, row.output_sha256); }
      row.revision++; row.approved = args.decision.action === 'approve';
      return { ok: true, ...structuredClone(row), local_ui_only: true, external_disclosure: false }; }
    if (command === 'export_approved_documents') return { ok: true, operation_id: args.operationId, exported_count: args.selection.length,
      folder_name: `Export-${args.operationId}`, local_ui_only: true, external_disclosure: false };
    if (command === 'close_document_reviews') return { ok: true }; throw Error('unexpected command');
  };
  const window = { __TAURI__: { core: { invoke } } };
  document.getElementById = el; document.createElement = create;
  const clock = class extends Date { static now() { return now; } };
  const context = vm.createContext({ document, window, crypto: crypto.webcrypto, Date: clock,
    setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/workflow-presentation.js'), 'utf8'), context);
  window.__DATASECURE_RUN_GUIDE__ = { documents(value) { guides.push(window.__DATASECURE_PRESENTATION__.projectRun(value)); } };
  vm.runInContext(source, context);
  return { el, calls, rows, guides, api: window.__DATASECURE_DOCUMENTS__,
    advance(milliseconds) { now += milliseconds; for (const fn of [...intervals]) fn(); },
    activeIntervals() { return intervals.size; },
    async act(target, event = 'click') { (typeof target === 'string' ? el(target) : target).events.get(event)?.(); await tick();
      if (target === 'documents-approve' && !options.explicitApproval && !el('documents-approve-confirm').hidden) {
        el('documents-approve-proceed').events.get('click')?.(); await tick();
      } },
    async all() { el('documents-all').checked = true; await this.act('documents-all', 'change'); },
    async export() { await this.act('documents-export'); await this.act('document-export-confirm'); } };
}
testAsync('completed anonymization run no longer claims its processing completion is unconfirmed', async () => {
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: structuredClone(h.rows), processing_mode: 'markdown-and-anonymize',
      processing_complete: true, unavailable: [], not_processed_documents: [], local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64));
  const guide = h.guides.at(-1);
  assert.equal(guide.phase, 'documents');
  assert.doesNotMatch(guide.next, /Laufabschluss ist noch nicht bestätigt/u);
  assert.match(h.el('document-edit-hint').textContent, /Wähle links ein Dokument/u);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
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
  assert.match(h.el('documents-heading').textContent, /Prüfen und für KI exportieren/u);
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
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  assert.equal(h.el('documents-export').disabled, true);
  await h.act('documents-approve'); assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 2);
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
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 2);
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
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ invoke(command, args) {
    if (command === 'decide_document_review' && args.documentId === '1'.repeat(32)) return pending;
  } });
  await h.api.open('a'.repeat(64)); await h.all();
  h.el('documents-approve').events.get('click')();
  const approving = h.el('documents-approve-proceed').events.get('click')();
  await tick();
  assert.equal(h.el('documents-review-controls').hidden, true);
  assert.equal(h.el('documents-bulk-progress').hidden, false);
  assert.match(h.el('documents-bulk-count').textContent, /0 von 2 Entscheidungen bestätigt/u);
  h.rows[0].revision++; h.rows[0].approved = true;
  finish({ ok: true, ...structuredClone(h.rows[0]), local_ui_only: true, external_disclosure: false });
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
      assert.match(h.el('documents-selected').textContent, /^1 ausgewählt/u);
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
    assert.match(h.el('documents-selected').textContent, /^2 ausgewählt/u);
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

testAsync('explicit history export preview reloads exact approvals and only opens the confirmation dialog', async () => {
  const h = harness(); h.rows.forEach(row => { row.approved = true; row.revision = 7; });
  await h.api.open('a'.repeat(64), { exportPreview: true });
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, 1);
  assert.equal(h.el('document-export-dialog').open, true);
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
  await h.act('document-export-confirm');
  assert.ok(h.calls.find(call => call.command === 'export_approved_documents').args.selection.every(row => row.revision === 7));
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
    assert.notEqual(h.el('document-export-dialog').open, true, condition);
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
      const decisions = h.calls.filter(call => call.command === 'decide_document_review');
      assert.equal(decisions.length, processingMode === 'markdown-only' ? 0 : 2);
      assert.ok(decisions.every(call => call.args.documentId !== '3'.repeat(32)), 'a problem row never grants approval authority');
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
  assert.match(h.el('documents-status').textContent, /keine Freigabe und kein KI-Export/u);
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
  await h.act('document-export-close'); assert.equal(h.el('document-export-dialog').open, false);
  assert.equal(h.el('documents-export').focused, true);
  await h.export(); assert.equal(h.el('document-export-title').textContent, 'Export fertig');
  assert.match(h.el('document-export-target').textContent, /Export-[a-f0-9]+ \(abgeschlossen\)/u);
  assert.doesNotMatch(h.el('document-export-target').textContent, /noch offen/u);
  assert.equal(h.el('document-export-confirm').hidden, true);
  assert.match(h.el('documents-status').textContent, /nicht erneut ausführen/u);
  assert.match(h.el('documents-selected').textContent, /0 ausgewählt/u);
  assert.equal(h.el('documents-export').textContent, 'Weitere KI-Kopie erstellen');
  assert.equal(h.el('documents-export').disabled, true, 'a second copy needs a new explicit selection');
  assert.match(h.el('documents-purpose').textContent, /musst nichts erneut exportieren/u);
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
  assert.equal(h.el('document-export-title').textContent, 'Export fertig');
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
  assert.equal(h.el('document-export-title').textContent, 'Export fertig');
  assert.match(h.el('documents-status').textContent, /kein zweiter Export nötig/u);
  assert.match(h.el('documents-selected').textContent, /0 ausgewählt/u);
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
  const h = harness({ invoke(command) { if (command === 'decide_document_review') throw Error('DOCUMENT_REVIEW_STALE'); } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*DOCUMENT_REVIEW_STALE/u);
  assert.equal(h.calls.filter(call => call.command === 'get_document_reviews').length, 2);
  assert.equal(h.el('documents-export').disabled, true);
});

testAsync('an unbound success acknowledgement is not counted as a confirmed document decision', async () => {
  const h = harness({ invoke(command) { if (command === 'decide_document_review') return { ok: true }; } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
  assert.match(h.el('documents-status').textContent, /0 Entscheidungen bestätigt.*Quelle-1\.pdf.*1 weitere Datei/u);
  assert.equal(h.el('documents-export').disabled, true);
});

testAsync('approval cannot adopt an acknowledgement for different Markdown bytes', async () => {
  const h = harness({ invoke(command) {
    if (command === 'decide_document_review') return { ok: true, ...structuredClone(h.rows[0]), revision: 1,
      output_sha256: 'f'.repeat(64), approved: true, local_ui_only: true, external_disclosure: false };
  } });
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.match(h.el('documents-status').textContent, /0 Entscheidungen bestätigt.*DOCUMENT_REVIEW_STALE/u);
  assert.equal(h.el('documents-export').disabled, true);
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
  assert.match(h.el('documents-status').textContent, /Behandlung gespeichert.*erneut freigegeben/u);
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
  h.el('entities-decision').value = 'organization'; assert.equal(h.el('entities-apply').disabled, true);
  await h.act('entities-apply'); assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  eligible = true; await h.act(h.el('documents-list').children[0].children[1].children[0]);
  check = h.el('entities-list').children[0].children[0].children[0]; check.checked = true; await h.act(check, 'change');
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
  await h.act('documents-export');
  assert.equal(h.el('document-export-configure').hidden, false);
  assert.match(h.el('document-export-target').textContent, /Bindung beim Export geprüft/u);
  await h.act('document-export-configure');
  assert.equal(h.calls.filter(call => call.command === 'configure_results').length, 1);
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 0);
  assert.equal(h.el('document-export-result').hidden, false);
  assert.match(h.el('document-export-result').textContent, /„Exportieren“.*kein automatischer Export/u);
  await h.act('document-export-confirm');
  assert.equal(h.calls.filter(call => call.command === 'export_approved_documents').length, 2,
    'only the explicit confirmation may start a copy and its acknowledgement');
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
  assert.match(h.el('document-export-result').textContent, /Seit 1 Minuten 11 Sekunden.*Ein Dateifortschritt liegt nicht vor/u);
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
  assert.doesNotMatch(h.el('documents-status').textContent, /Dateien exportiert|Export fertig/u);
  assert.equal(h.activeIntervals(), 0);
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

testAsync('masking requires a separate confirmation, then submits only marked offsets and revokes approval', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  assert.equal(h.el('documents-main-guide').hidden, false);
  assert.equal(h.el('documents-approval-extras').hidden, false);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  assert.equal(h.el('document-markdown').readOnly, true);
  assert.match(h.el('document-markdown-caption').textContent, /nur markieren/u);
  assert.match(h.el('document-edit-hint').textContent, /schreibgeschützt.*gesonderter Bestätigung/u);
  assert.equal(h.el('document-save-correction').hidden, true);
  h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
  const writesBefore = h.calls.filter(call => call.command === 'decide_document_review').length;
  await h.act('document-redact');
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, writesBefore);
  assert.equal(h.el('document-change-confirm').hidden, false);
  assert.match(h.el('document-change-confirm-text').textContent, /Noch nichts geändert/u);
  await h.act('document-change-save'); await tick(); await tick();
  const call = h.calls.filter(call => call.command === 'decide_document_review').at(-1);
  assert.equal(call.args.decision.action, 'redact'); assert.deepEqual(call.args.decision.ranges, [{ start: 14, end: 16 }]);
  assert.equal(h.rows[0].approved, false); assert.equal(h.rows[1].approved, true); assert.equal(h.el('documents-export').disabled, true);
});
testAsync('mask action explains a missing right-side selection next to the button without writing', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 0; h.el('document-markdown').selectionEnd = 0;
  await h.act('document-redact');
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  assert.equal(h.el('document-action-status').hidden, false);
  assert.match(h.el('document-action-status').textContent, /rechten Markdown-Feld markieren/u);
  assert.match(h.el('documents-status').textContent, /rechten Markdown-Feld markieren/u);
});
testAsync('confirmed mask immediately reopens its new revision and shows a local success receipt', async () => {
  const h = harness({ maskAfterRevision: true }); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
  await h.act('document-redact'); await h.act('document-change-save'); await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
  assert.equal(h.el('document-name').textContent, 'Quelle-1.pdf');
  assert.match(h.el('document-markdown').value, /\[MANUAL_REDACTION\]/u);
  assert.equal(h.el('document-action-status').hidden, false);
  assert.match(h.el('document-action-status').textContent, /Stand 1 gespeichert/u);
  assert.equal(h.rows[0].approved, false);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});
testAsync('cancelling an optional mask or basis reset writes nothing', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
  await h.act('document-redact'); await h.act('document-change-cancel');
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
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 2);
  await h.act('document-change-save'); await tick(); await tick();
  const call = h.calls.filter(row => row.command === 'decide_document_review').at(-1);
  assert.equal(call.args.decision.action, 'restore_base');
  assert.equal(h.rows[0].approved, false); assert.equal(h.rows[1].approved, true);
  assert.match(h.el('document-action-status').textContent, /Basisstand als Stand 2 gespeichert/u);
});
testAsync('a prepared mask cannot be saved after the document revision changes', async () => {
  const h = harness(); await h.api.open('a'.repeat(64));
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
  await h.act('document-redact'); h.rows[0].revision++;
  await h.act('documents-reload'); await h.act('document-change-save');
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
  assert.match(h.el('documents-status').textContent, /privater Textstand gespeichert.*bereits erstellte Markdown-Datei bleibt unverändert/u);
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
  await h.all(); assert.match(h.el('documents-selected').textContent, /^2 ausgewählt · 2 angezeigt/u);
  await h.act('documents-export');
  assert.deepEqual(h.calls.find(call => call.command === 'preview_document_export').args.selection.map(row => row.document_id),
    ['1'.repeat(32), '2'.repeat(32)]);
  assert.match(h.el('document-export-purpose').textContent, /2 ausgewählten Dateien/u);
  await h.act('document-export-close');
  h.el('documents-filter').value = 'all'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 3);
  assert.match(h.el('documents-selected').textContent, /^0 ausgewählt/u);
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  await h.act('document-next');
  assert.equal(h.el('document-name').textContent, 'Quelle-2.pdf');
  h.el('documents-filter').value = 'without'; await h.act('documents-filter', 'change');
  assert.equal(h.el('documents-list').children.length, 1);
  assert.equal(h.el('document-name').textContent, 'Dokument auswählen');
  await h.all(); assert.match(h.el('documents-selected').textContent, /^1 ausgewählt · 1 angezeigt/u);
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
for (const mixed of [false, true]) testAsync(`${mixed ? 'mixed' : 'rejected-only'} sources show fixed reasons without automatic export preview`, async () => {
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
  assert.equal(h.el('documents-export').disabled, true, 'no automatic selection');
  assert.equal(h.el('document-export-dialog').open, undefined);
  assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('connection loss stops a bulk approval before the next document', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({invoke(command) { if (command === 'decide_document_review') return pending; }});
  await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  h.api.invalidateConnection();
  finish({ok: true, ...h.rows[0], revision: 1, approved: true, local_ui_only: true, external_disclosure: false});
  await tick(); await tick();
  assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 1);
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

testAsync('raw preview and cancel never approve, while explicit save seals only selected ACK revisions', async () => {
  const h = harness({ strictBindings: true, invoke(command, args) {
    if (command === 'export_approved_documents') return { ok: true, operation_id: args.operationId,
      exported_count: args.selection.length, folder_name: `Export-${args.operationId}`, processing_mode: 'markdown-only',
      anonymized: false, local_ui_only: true, external_disclosure: false };
  } });
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64));
  assert.equal(h.el('documents-approve').hidden, true); assert.equal(h.el('documents-revoke').hidden, true);
  assert.doesNotMatch(h.el('documents-selected').textContent, /freigegeben|textgeprüft/u);
  const checkbox = h.el('documents-list').children[0].children[0]; checkbox.checked = true; await h.act(checkbox, 'change');
  await h.act('documents-export'); assert.equal(h.el('document-export-dialog').open, true);
  await h.act('document-export-close');
  assert.equal(h.calls.some(call => ['decide_document_review', 'export_approved_documents'].includes(call.command)), false);
  await h.export(); await tick(); await tick();
  assert.equal(h.rows[0].approved, true); assert.equal(h.rows[1].approved, false);
  const decision = h.calls.filter(call => call.command === 'decide_document_review'); assert.equal(decision.length, 1);
  assert.equal(decision[0].args.decision.revision, 0);
  const preview = h.calls.filter(call => call.command === 'preview_document_export').at(-1);
  assert.equal(preview.args.selection[0].revision, 1);
  const copies = h.calls.filter(call => call.command === 'export_approved_documents'); assert.equal(copies.length, 2);
  assert.equal(copies[0].args.selection[0].revision, 1); assert.equal(copies[0].args.operationId, copies[1].args.operationId);
  assert.equal(h.el('document-export-title').textContent, 'Markdown-Kopie gespeichert');
});

testAsync('raw copy preparation stops on lost, mismatched or partial ACK and changed filename plan, without replay', async () => {
  for (const failure of ['lost', 'hash', 'revision', 'mode', 'partial', 'plan']) {
    let decisions = 0, previews = 0;
    const h = harness({ invoke(command, args) {
      if (command === 'decide_document_review') {
        decisions++; const row = h.rows.find(row => row.document_id === args.documentId);
        if (failure === 'lost' || failure === 'partial' && decisions === 2) { row.approved = true; row.revision++; throw Error('STANDALONE_CONNECTION_LOST'); }
        if (['hash', 'revision', 'mode'].includes(failure)) return { ok: true, ...row, approved: true, revision: failure === 'revision' ? 7 : row.revision + 1,
          output_sha256: failure === 'hash' ? 'f'.repeat(64) : row.output_sha256,
          processing_mode: failure === 'mode' ? 'markdown-and-anonymize' : 'markdown-only', local_ui_only: true, external_disclosure: false };
      }
      if (command === 'preview_document_export' && failure === 'plan' && ++previews === 2)
        return { ok: true, processing_mode: 'markdown-only', local_ui_only: true, external_disclosure: false,
          files: args.selection.map(row => ({ name: 'changed.md', sha256: row.output_sha256 })) };
    } });
    h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
    await h.api.open('a'.repeat(64)); await h.all(); await h.export(); await tick(); await tick();
    assert.equal(h.calls.some(call => call.command === 'export_approved_documents'), false, failure);
    assert.match(h.el('documents-status').textContent, /Keine zusätzliche Kopie gestartet/u, failure);
    assert.ok(decisions <= (failure === 'partial' || failure === 'plan' ? 2 : 1));
    const before = h.calls.length; await tick(); assert.equal(h.calls.length, before, 'no automatic retry');
  }
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
      unavailable: [], conversion_feedback: { schema: 'datasecure-conversion-feedback/1', ocr_enabled: true,
        selected_count: 2, result_count: 2, not_converted_count: 0, ocr_omitted_count: 0, error_count: 0,
        content_notice_count: 1, pending_count: 0, complete: true },
      content_notices: [{ document_id: '1'.repeat(32), name: 'Quelle-1.pdf', reason_codes: ['OCR_NOT_VERIFIED'] }] };
  }});
  h.rows.forEach(row => { row.processing_mode = 'markdown-only'; });
  await h.api.open('a'.repeat(64));
  assert.match(h.el('documents-heading').textContent, /freiwillig/u);
  assert.match(h.el('documents-purpose').textContent, /Häkchen.*Kopie/u);
  assert.match(textTree(h.el('documents-list')), /OCR-Text.*nicht vollständig fachlich geprüft/u);
  assert.doesNotMatch(textTree(h.el('documents-list')), /Inhaltshinweis: OCR_NOT_VERIFIED/u);
  const row = h.el('documents-list').children[0], check = row.children[0], compare = row.children[1].children[0];
  check.checked = true; await h.act(check, 'change');
  assert.equal(h.calls.some(call => call.command === 'get_document_review_chunk'), false);
  await h.act(compare);
  assert.equal(h.calls.filter(call => call.command === 'get_document_review_chunk').length, 1);
  assert.match(h.el('documents-selected').textContent, /^1 ausgewählt/u);
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

done();
