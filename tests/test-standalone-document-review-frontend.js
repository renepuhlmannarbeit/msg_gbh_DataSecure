'use strict';
// Actual document renderer in a minimal DOM: transition evidence, not layout
// or native IPC injection. Browser and packaged tests are separate gates.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Standalone document review renderer');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/document-review.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  const nodes = new Map(), calls = [], rows = [1, 2].map(n => ({ name: `Quelle-${n}.pdf`, document_id: String(n).repeat(32), revision: 0,
    output_sha256: String(n).repeat(64), chunks: 1, approved: false, processing_mode: 'markdown-and-anonymize' }));
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
    if (command === 'get_document_review_chunk') return { ...rows.find(row => row.document_id === args.documentId), chunk_index: args.chunkIndex,
      original_text: 'Anna Beispiel: 42 Projekte.', markdown: options.strictBindings ? `Stand ${rows.find(row => row.document_id === args.documentId).revision}` : '[PERSON_001]: 42 Projekte.', local_ui_only: true, external_disclosure: false };
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
  vm.runInNewContext(source, { document, window, crypto: crypto.webcrypto });
  return { el, calls, rows, api: window.__DATASECURE_DOCUMENTS__,
    async act(target, event = 'click') { (typeof target === 'string' ? el(target) : target).events.get(event)?.(); await tick(); },
    async all() { el('documents-all').checked = true; await this.act('documents-all', 'change'); },
    async export() { await this.act('documents-export'); await this.act('document-export-confirm'); } };
}
testAsync('checkboxes only select; explicit bulk approval covers exactly the selected documents', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all();
  assert.equal(h.calls.some(call => call.command === 'decide_document_review'), false);
  assert.equal(h.el('documents-export').disabled, true);
  await h.act('documents-approve'); assert.equal(h.calls.filter(call => call.command === 'decide_document_review').length, 2);
  assert.equal(h.el('documents-export').disabled, false);
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
        ['2'.repeat(32)], 'changed state cannot inherit a previous checkbox approval intent');
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
  const text = () => panel.children[1].children.map(row => row.textContent).join('\n');
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
      const text = h.el('documents-unavailable').children[1].children[0].textContent;
      assert.ok(text.includes('nested/03-defekt.csv') && text.includes(reason));
      if (reason === 'PARSE_FAILED') assert.match(text, /Dateiinhalt.*gelesen/u);
      await h.all(); await h.act('documents-approve');
      const decisions = h.calls.filter(call => call.command === 'decide_document_review');
      assert.equal(decisions.length, 2);
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
  assert.equal(h.el('document-export-confirm').hidden, true);
});

testAsync('incomplete raw export can be abandoned only explicitly; completed copies offer acknowledgement only', async () => {
  let pending = [{ operation_id: 'e'.repeat(32), digest: 'd'.repeat(64), status: 'incomplete', processing_mode: 'markdown-only',
    selection: [{ document_id: '1'.repeat(32), revision: 1, output_sha256: '1'.repeat(64) }] }];
  const h = harness({ invoke(command) {
    if (command === 'get_document_reviews') return { documents: [], pending_exports: pending, local_ui_only: true, external_disclosure: false };
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
  assert.match(h.el('documents-status').textContent, /Quelle-1\.pdf.*Quelle-2\.pdf.*Ordnerbindung/u);
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
  assert.match(second.el('documents-export-receipt-list').children[0].children[0].textContent, /2 Dateien bereitgestellt: DataSecure-KI-Export → Export-/u);
  assert.doesNotMatch(second.el('documents-status').textContent, /nicht bestätigt/u);
  assert.equal(second.calls.some(call => call.command === 'export_approved_documents'), false);
});

testAsync('masking submits only marked offsets and revokes the selected document approval', async () => {
  const h = harness(); await h.api.open('a'.repeat(64)); await h.all(); await h.act('documents-approve');
  await h.act(h.el('documents-list').children[0].children[1].children[0]);
  h.el('document-markdown').selectionStart = 14; h.el('document-markdown').selectionEnd = 16;
  await h.act('document-redact'); const call = h.calls.filter(call => call.command === 'decide_document_review').at(-1);
  assert.equal(call.args.decision.action, 'redact'); assert.deepEqual(call.args.decision.ranges, [{ start: 14, end: 16 }]);
  assert.equal(h.rows[0].approved, false); assert.equal(h.rows[1].approved, true); assert.equal(h.el('documents-export').disabled, true);
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
  h.el('document-markdown').value = '[PERSON_001]: 43 Projekte.'; await h.act('document-markdown', 'input');
  assert.equal(await h.api.close(), false); assert.equal(h.el('documents-export').disabled, true);
  await h.act('document-save-correction'); const call = h.calls.find(call => call.command === 'decide_document_review');
  assert.equal(call.args.decision.action, 'correct'); assert.deepEqual(call.args.decision.ranges, [{ start: 15, end: 16, replacement: '3' }]);
  assert.equal(h.el('documents-export').textContent, 'Auswahl als Markdown-Kopie speichern');
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

done();
