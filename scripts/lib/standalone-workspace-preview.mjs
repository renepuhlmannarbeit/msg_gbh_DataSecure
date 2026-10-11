// Synthetic UI adapter only. Never included in the Standalone artifact.
export function workspacePreviewBridge() {
  return `(() => {
    const listeners = new Map(); let files = [], revision = 0, mode = '', phase = 'ready', polls = 0, selectedCount = 0;
    const id = n => String(n).padStart(32, '0'), batch = 'b'.repeat(64);
    const examples = [
      { name: 'Bewerbungen/Projektleitung/Lebenslauf-Erika-Linden.pdf', source_id: id(1), bytes: 84200, selectable: true, source_type: 'pdf', ocr_required: null },
      { name: 'Bewerbungen/Projektleitung/Anschreiben.docx', source_id: id(2), bytes: 29100, selectable: true, source_type: 'docx', ocr_required: null },
      { name: 'Bewerbungen/Entwicklung/Lebenslauf.pdf', source_id: id(3), bytes: 91000, selectable: true, source_type: 'pdf', ocr_required: null },
      { name: 'Bewerbungen/Entwicklung/Scan.png', source_id: id(4), bytes: 67100, selectable: true, source_type: 'png', ocr_required: true },
      { name: 'Tabellen/Kontaktliste.xlsx', source_id: id(5), bytes: 12300, selectable: true, source_type: 'xlsx', ocr_required: null },
      { name: 'Tabellen/Archiv.zip', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED' },
      { name: 'Ergänzungen/Sehr-langer-deutscher-Dateiname-mit-Projektbeschreibung-und-mehreren-Zusätzen-für-die-Darstellungsprüfung.txt', source_id: id(6), bytes: 2300, selectable: true, source_type: 'txt', ocr_required: null },
      { name: 'Ergänzungen/Leer.txt', selectable: false, reason_code: 'SOURCE_FILE_EMPTY' }
    ];
    const largeCatalogueDemo = new URLSearchParams(window.location.search).get('demo') === 'large-catalogue';
    const demo = new URLSearchParams(window.location.search).get('demo');
    const documentsDemo = ['documents', 'documents-raw'].includes(demo);
    if (documentsDemo) { phase = 'results_available'; selectedCount = 3; mode = demo === 'documents-raw' ? 'markdown-only' : 'markdown-and-anonymize'; }
    const documentRows = [
      { document_id: id(1), name: 'Bewerbungen/Projektleitung/Lebenslauf-Erika-Linden.pdf', revision: 0, output_sha256: 'a'.repeat(64), approved: false, chunks: 1 },
      { document_id: id(2), name: 'Tabellen/Kontaktliste.xlsx', revision: 0, output_sha256: 'b'.repeat(64), approved: false, chunks: 1 },
      { document_id: id(3), name: 'Projektunterlagen/Ergänzungen.docx', revision: 0, output_sha256: 'c'.repeat(64), approved: false, chunks: 1 }
    ];
    const original = '# Projektleitung\\nErika Linden\\nE-Mail: erika@example.invalid\\n\\nLeitung von 42 Projekten.\\nSachinhalt und Qualifikationen bleiben erhalten.';
    const initial = '# Projektleitung\\n[PERSON_001]\\nE-Mail: [EMAIL_001]\\n\\nLeitung von 42 Projekten.\\nSachinhalt und Qualifikationen bleiben erhalten.';
    const bodies = new Map(documentRows.map(row => [row.document_id, mode === 'markdown-only' ? original : initial]));
    documentRows.forEach(row => Object.assign(row, { processing_mode: mode || 'markdown-and-anonymize',
      entity_review_available: mode !== 'markdown-only', run_entity_review_available: mode !== 'markdown-only',
      entity_count: mode === 'markdown-only' ? 0 : 2 }));
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const privateResult = row => ({ ok: true, ...row, local_ui_only: true, external_disclosure: false });
    const entityChoices = new Map();
    const exportReceipts = [], pendingExports = [], completedSelections = new Map();
    const context = () => ({ ok: true, local_ui_only: true, external_disclosure: false,
      result_folder: 'Dokumente/DataSecure', source_catalogue: files, catalogue_revision: revision,
      source_folders: files.length ? [largeCatalogueDemo ? 'Dokumente/Synthetischer-Katalog' : 'Dokumente/Bewerbungen-Q3'] : [], selected_files: files.filter(f => f.selectable).map(f => f.name) });
    const entries = () => ({ local_ui_only: true, external_disclosure: false, entries: [
      ...(phase !== 'ready' ? [{ batch_id: batch, created_at: '2026-10-07T09:15:00Z', processing_mode: mode,
        selected_count: selectedCount, result_count: phase === 'results_available' ? selectedCount : Math.max(0, selectedCount - 2), failed_count: 0,
        status: phase, resumable: phase === 'review_required', results_available: phase === 'results_available', ledger_available: false }] : []),
      { batch_id: 'c'.repeat(64), created_at: '2026-10-06T14:22:00Z', processing_mode: 'markdown-only', selected_count: 3,
        result_count: 2, failed_count: 1, status: 'results_available', resumable: false, results_available: true, ledger_available: false }
    ] });
    window.__TAURI__ = { event: { listen: async (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name); } },
      core: { invoke: async (command, args) => {
        // Exercise the product's closed parent facade. The child supplies only
        // this explicit synthetic review adapter, never a native API.
        if (['get_review_session', 'get_review_chunk', 'submit_review', 'continue_review_session', 'close_review_window'].includes(command)) {
          const adapter = document.getElementById('review-frame')?.contentWindow?.__TAURI__?.core?.invoke;
          if (!adapter) throw Error('PREVIEW_REVIEW_NOT_READY');
          return adapter(command, args);
        }
        if (command === 'frontend_ready') return { product_version: '3.2.0-rc158' };
        if (command === 'get_ui_context') return context();
        if (command === 'get_run_history') return entries();
        if (command === 'get_document_review_history_summary') return privateResult({ available: args.batchId === batch,
          processing_mode: mode, reviewable_count: documentRows.length, approved_count: documentRows.filter(row => row.approved).length,
          unavailable_count: 0, unclassified_source_count: 0, recorded_export_count: exportReceipts.length,
          current_exported_count: documentRows.filter(row => [...completedSelections.values()].some(selection => selection.some(item =>
            item.document_id === row.document_id && item.revision === row.revision && item.output_sha256 === row.output_sha256))).length,
          pending_export_count: pendingExports.length,
          pending_incomplete_count: pendingExports.filter(row => row.status === 'incomplete').length,
          pending_confirmation_count: pendingExports.filter(row => row.status === 'completed').length,
          last_recorded_export: exportReceipts.length ? { processing_mode: mode,
            document_count: exportReceipts[0].exported_count, recorded_at: null } : null });
        if (command === 'get_document_reviews') {
          for (const row of documentRows) row.output_sha256 = await digest(bodies.get(row.document_id));
          return { local_ui_only: true, external_disclosure: false, documents: structuredClone(documentRows),
            unavailable: [], pending_exports: structuredClone(pendingExports.slice(0, 1)), export_receipts: structuredClone(exportReceipts) };
        }
        if (command === 'close_document_reviews') return { ok: true };
        if (command === 'open_document_export') {
          if (!exportReceipts.some(row => row.operation_id === args.operationId)) throw Error('AI_EXPORT_INVALID');
          return { ok: true, handoff_confirmed: true, external_disclosure: false };
        }
        if (command === 'open_document_identity_overview') {
          if (mode !== 'markdown-and-anonymize' || args.operationId && !exportReceipts.some(row => row.operation_id === args.operationId))
            throw Error('STANDALONE_IDENTITY_MAPPING_MISSING');
          // Synthetic UI preview only: no real document, filesystem or OS open.
          return { ok: true, handoff_confirmed: true, external_disclosure: false };
        }
        if (command === 'get_document_review_chunk') return { ...privateResult(documentRows.find(row => row.document_id === args.documentId)),
          chunk_index: 0, original_text: original, markdown: bodies.get(args.documentId) };
        if (command === 'get_document_entities') {
          const text = bodies.get(args.documentId), choices = entityChoices.get(args.documentId) || {};
          return { ...privateResult(documentRows.find(row => row.document_id === args.documentId)), page: 0, pages: 1,
            entities: [['Erika Linden', '[PERSON_001]', 'PERSON'], ['erika@example.invalid', '[EMAIL_001]', 'EMAIL']].map(([value, marker, kind], index) => {
              const entity_id = 'entity_' + String(index + 1).padStart(6, '0'), decision = choices[entity_id] || 'default';
              const replacement = decision === 'keep' ? value : decision === 'organization' ? '[UNTERNEHMEN_DEMO]' : decision === 'person' ? '[PERSON_DEMO]' : marker;
              const start = text.indexOf(replacement); return { entity_id, original: value, replacement,
                kind: decision === 'organization' ? 'ORGANIZATION' : decision === 'person' ? 'PERSON' : kind, decision, count: 1, run_eligible: index === 0,
                disabled: start < 0, output_start: Math.max(0, start), output_end: Math.max(0, start) + (start < 0 ? 0 : replacement.length),
                source_start: original.indexOf(value), source_end: original.indexOf(value) + value.length };
            }) };
        }
        if (command === 'decide_document_review') { const origin = documentRows.find(row => row.document_id === args.documentId);
          const affected = args.decision.action === 'entities' && args.decision.scope === 'run' ? documentRows : [origin];
          for (const row of affected) {
          const documentId = row.document_id;
          let text = bodies.get(documentId);
          if (args.decision.action === 'entities') {
            const choices = entityChoices.get(row.document_id) || {};
            for (const choice of args.decision.entity_decisions) choices[choice.entity_id] = choice.decision;
            entityChoices.set(row.document_id, choices); text = initial;
            for (const [index, value, marker] of [[1, 'Erika Linden', '[PERSON_001]'], [2, 'erika@example.invalid', '[EMAIL_001]']]) {
              const choice = choices['entity_' + String(index).padStart(6, '0')];
              text = text.replace(marker, choice === 'keep' ? value : choice === 'organization' ? '[UNTERNEHMEN_DEMO]' : choice === 'person' ? '[PERSON_DEMO]' : marker);
            }
          } else if (args.decision.action === 'correct') { const edit = args.decision.ranges[0]; text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end); }
          else if (args.decision.action === 'redact') { for (const edit of [...args.decision.ranges].reverse()) text = text.slice(0, edit.start) + '[MANUAL_REDACTION]' + text.slice(edit.end); }
          else if (args.decision.action === 'restore_base') { text = mode === 'markdown-only' ? original : initial; entityChoices.delete(row.document_id); }
          bodies.set(row.document_id, text); row.output_sha256 = await digest(text);
          row.revision++; row.approved = args.decision.action === 'approve'; }
          return { ...privateResult(origin), scope: args.decision.scope || 'document', affected_count: affected.length }; }
        if (command === 'export_approved_documents') {
          const result = { ok: true, operation_id: args.operationId, exported_count: args.selection.length,
            folder_name: 'Export-' + args.operationId, processing_mode: mode, anonymized: mode !== 'markdown-only', local_ui_only: true, external_disclosure: false };
          result.identity_overview_available = mode === 'markdown-and-anonymize';
          if (!exportReceipts.some(row => row.operation_id === args.operationId)) exportReceipts.unshift(result);
          completedSelections.set(args.operationId, structuredClone(args.selection));
          if (args.acknowledge) pendingExports.splice(0);
          else if (!pendingExports.length) pendingExports.push({ operation_id: args.operationId, selection: args.selection,
            digest: await digest(JSON.stringify(args)), status: 'completed', processing_mode: mode });
          return result;
        }
        if (command === 'select_files' || command === 'select_folder') {
          files = largeCatalogueDemo
            ? Array.from({ length: 201 }, (_, n) => ({ name: 'Synthetischer-Katalog/Datei-' + String(n + 1).padStart(3, '0') + '.txt',
              source_id: id(n + 1), bytes: 4, selectable: true, source_type: 'txt', ocr_required: null })) : examples;
          revision++; return { ui_context: context() };
        }
        if (command === 'cancel_admission') { files = []; revision++; return { ok: true }; }
        if (command === 'start_admitted_batch') { window.previewLastStart = args; selectedCount = args.sourceIds.length; files = []; mode = args.processingMode; phase = 'processing'; polls = 0; return { ok: true, batch_id: batch }; }
        if (command === 'get_public_state') {
          if (phase === 'processing' && ++polls > 2) phase = 'review_required';
          return { state: phase, ...(phase !== 'ready' ? { batch_id: batch } : {}), processing_mode: mode, selected_count: phase === 'ready' ? 0 : selectedCount,
            results_available: phase === 'results_available',
            completed_count: phase === 'results_available' ? selectedCount : Math.max(0, selectedCount - 2),
            result_count: phase === 'results_available' ? selectedCount : Math.max(0, selectedCount - 2),
            review_count: phase === 'review_required' ? Math.min(2, selectedCount) : 0, failed_count: 0 };
        }
        if (command === 'continue_history_batch' || command === 'continue_current_batch' || command === 'open_embedded_review') return { ok: true };
        if (command === 'configure_results') return { cancelled: true };
        if (command === 'get_run_failures') return { local_ui_only: true, external_disclosure: false,
          files: [{ name: 'Vertrag-passwortgeschützt.pdf', reason_code: 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED' }] };
        if (command.startsWith('open_')) return { ok: true };
        throw Error('UNSUPPORTED_PREVIEW_COMMAND');
      } } };
    window.addEventListener('preview-review-closed', event => {
      phase = event.detail?.reviewed === true ? 'results_available' : 'review_required';
      listeners.get('datasecure-review-closed')?.({ payload: { closed: true } });
    });
  })();`;
}
