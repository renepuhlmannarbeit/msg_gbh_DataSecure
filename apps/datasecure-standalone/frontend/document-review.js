'use strict';

// Private text lives only in the explicitly open document view. No HTML
// rendering, browser storage, query payloads or generic filesystem bridge.
(() => {
  let connectionGeneration = 0, busyGeneration = 0;
  const $ = id => document.getElementById(id), invoke = async (command, args) => {
    const connection = connectionGeneration;
    const result = await window.__TAURI__.core.invoke(command, args);
    if (connection !== connectionGeneration) throw Error('STANDALONE_CONNECTION_CHANGED');
    return result;
  };
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node; };
  const operationId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const validSelection = values => Array.isArray(values) && values.length > 0 && values.length <= 200 &&
    values.every(row => row && Object.keys(row).sort().join(',') === 'document_id,output_sha256,revision' &&
      /^[a-f0-9]{32}$/u.test(row.document_id) && /^[a-f0-9]{64}$/u.test(row.output_sha256) && Number.isSafeInteger(row.revision) && row.revision >= 0) &&
    new Set(values.map(row => row.document_id)).size === values.length;
  const validDocument = row => row && /^[a-f0-9]{32}$/u.test(row.document_id) &&
    /^[a-f0-9]{64}$/u.test(row.output_sha256) && Number.isSafeInteger(row.revision) && row.revision >= 0 && row.revision <= 1000 &&
    typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 1024 &&
    typeof row.approved === 'boolean' && ['markdown-only', 'markdown-and-anonymize'].includes(row.processing_mode) &&
    Number.isSafeInteger(row.chunks) && row.chunks >= 1 && row.chunks <= 245;
  const sameDocumentBinding = (left, right) => left && right && left.document_id === right.document_id &&
    left.revision === right.revision && left.output_sha256 === right.output_sha256 &&
    left.processing_mode === right.processing_mode && left.chunks === right.chunks;
  function decisionAcknowledged(result, previous, action) {
    return result?.ok === true && validDocument(result) && result.document_id === previous.document_id &&
      result.processing_mode === previous.processing_mode && result.revision === previous.revision + 1 &&
      result.approved === (action === 'approve') && result.local_ui_only === true && result.external_disclosure === false;
  }
  let batchId = null, documents = [], selected = new Set(), detail = null, ticket = 0, busy = false, exportRequest = null, knownExport = null;
  let loadedMarkdown = '', stateFresh = false, recoveryDraft = null, runMode = null;
  let pendingMetadata = null, dialogSelection = null, dialogMode = null, dialogFocus = null;
  let entityRows = [], entitySelected = new Set(), entityPage = 0, entityPages = 1, entityControls = [];
  let receiptControls = [];
  const mode = () => (pendingMetadata || detail || documents[0])?.processing_mode || runMode;
  const raw = () => mode() === 'markdown-only';
  const dirty = () => Boolean(recoveryDraft || detail && raw() && $('document-markdown').value !== loadedMarkdown);
  const detailCurrent = () => stateFresh && detail && documents.some(row => sameDocumentBinding(detail, row));
  const namespace = mode => mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
  const reasons = { DOCUMENT_REVIEW_STALE: 'Der Textstand hat sich geändert. Bitte neu laden und erneut prüfen.',
    DOCUMENT_REVIEW_UNAPPROVED: 'Mindestens ein ausgewählter Textstand ist nicht freigegeben.',
    DOCUMENT_REVIEW_INVALID: 'Der gespeicherte Prüfstand oder seine Entscheidungsnachweise sind nicht konsistent. Es wird keine Freigabe daraus übernommen. Bitte neu laden; bei erneutem Fehler die genannten Quelldateien neu verarbeiten.',
    DOCUMENT_REVIEW_LIMIT: 'Dieser Prüfstand überschreitet eine sichere Bearbeitungsgrenze. Bitte kleinere Änderungen oder weniger Dokumente gemeinsam bearbeiten.',
    DOCUMENT_REVIEW_CONFLICT: 'Diese Aktionskennung gehört bereits zu einem anderen gespeicherten Auftrag. Bitte den tatsächlichen Stand neu laden, nicht blind erneut senden.',
    DOCUMENT_REVIEW_MISSING: 'Für diesen Lauf ist kein gespeicherter Dokumentprüfstand verfügbar. Ältere Läufe werden nicht rückwirkend als geprüft behandelt.',
    DOCUMENT_ENTITY_UNAVAILABLE: 'Für diese Datei ist kein vollständig rückverfolgbarer Entitätenplan verfügbar. Textvergleich und zusätzliche Maskierung bleiben möglich.',
    DOCUMENT_ENTITY_INVALID: 'Die Entitätenentscheidung passt nicht zum aktuellen Textstand. Bitte die Datei neu laden.',
    DOCUMENT_ENTITY_RUN_UNAVAILABLE: 'Für diese Auswahl ist keine eindeutige laufweite Identität belegt. Bitte „Nur diese Datei“ wählen.',
    DOCUMENT_ENTITY_RUN_CONFLICT: 'Die laufweite Änderung wurde nicht übernommen. Mindestens ein betroffener Prüfstand ist nicht bearbeitbar. Die genannten Dateien zuerst prüfen.',
    DOCUMENT_REVIEW_RESIDUAL_PII: 'Der geänderte Text enthält weiterhin mögliche personenbezogene Angaben. Die Freigabe wurde nicht gespeichert. Bitte die beibehaltenen Werte erneut prüfen oder ersetzen.',
    DOCUMENT_REVIEW_POLICY_CHANGED: 'Die gespeicherte Prüfung gehört zu einer älteren Datenschutzregel. Bitte diese Quelldatei mit der aktuellen Version neu verarbeiten.',
    AI_EXPORT_CONFLICT: 'Im Exportordner besteht ein Konflikt. Es wurde nichts überschrieben.',
    AI_EXPORT_CONFIGURATION_REQUIRED: 'Bitte den Ergebnisordner einmal neu auswählen. Für diesen Export fehlt die sichere native Ordnerbindung; alte Exporte werden nicht automatisch umgestellt.',
    AI_EXPORT_VOLUME_MISMATCH: 'Der Ergebnisordner liegt auf einem anderen Laufwerk als der private DataSecure-Bereich. Bitte für diesen Export einen Ordner auf demselben Laufwerk wählen. Es wird keine unsichere Kopieralternative verwendet.',
    AI_EXPORT_UNCERTAIN: 'Der Exportzustand ist noch nicht eindeutig bestätigt. Bitte denselben Export erneut abgleichen. Vorhandene Ordner bleiben unverändert; es wird keine zweite Kopie angelegt.',
    AI_EXPORT_INCOMPLETE: 'Der Export ist noch nicht bestätigt. Bitte denselben Export erneut abgleichen; keine Freigabe wurde zurückgenommen.',
    AI_EXPORT_INVALID: 'Der gespeicherte Exportauftrag oder sein Beleg ist nicht gültig. Bitte den Stand neu laden; keine neue Kopie automatisch anlegen.',
    AI_EXPORT_ABANDONED: 'Dieser unvollständige Export wurde ausdrücklich aufgegeben. Vorhandene Dateien bleiben unangetastet; für einen neuen Export die aktuellen Freigaben neu auswählen.',
    AI_EXPORT_ALREADY_COMPLETE: 'Der Export ist bereits abgeschlossen und kann nicht mehr aufgegeben werden. Bitte den Empfang derselben Kopie abgleichen.',
    STANDALONE_IDENTITY_MAPPING_MISSING: 'Die vertrauliche Zuordnung dieses gespeicherten Stands fehlt oder ist nicht lesbar. Es wird keine heutige Zuordnung als damaliger Stand ausgegeben. Bestehende Exportkopien bleiben davon getrennt.',
    STANDALONE_IDENTITY_MAPPING_INVALID: 'Die vertrauliche Zuordnung passt nicht zu den gespeicherten Dokumentständen oder wurde verändert. Sie wird nicht geöffnet. Bestehende Exportkopien werden dadurch nicht verändert.',
    STANDALONE_IDENTITY_PUBLICATION_FAILED: 'Die vertrauliche Zuordnung konnte nicht sicher gespeichert werden. Eine neue Exportkopie wurde deshalb noch nicht begonnen. Bitte den lokalen Speicher prüfen und denselben Auftrag abgleichen.',
    STANDALONE_BUSY: 'Ein anderer lokaler Vorgang ist aktiv. Bitte erneut versuchen.',
    STANDALONE_RESULT_OPEN_FAILED: 'Das Betriebssystem konnte den geprüften Exportordner nicht öffnen. Der Export wurde dadurch nicht verändert.',
    STANDALONE_RESULTS_MISSING: 'Der gespeicherte Exportordner ist nicht mehr vorhanden. Es wird keine neue Kopie automatisch angelegt.' };
  function status(text, error = false) { $('documents-status').textContent = text; $('documents-status').className = `notice${error ? ' error' : ''}`; }
  function showError(error, name = '') {
    let code = error?.code || error?.message || String(error);
    try { code = JSON.parse(code).code || code; } catch {}
    if (!/^[A-Z][A-Z0-9_]{2,80}$/u.test(code)) code = 'DOCUMENT_REVIEW_INVALID';
    status(`${name ? `${name}: ` : ''}${reasons[code] || 'Der lokale Prüfstand konnte nicht sicher bestätigt werden. Erneut laden; nicht blind freigeben.'} (${code})`, true);
  }
  function controls() {
    const blocked = busy || !stateFresh;
    const rows = documents.filter(row => selected.has(row.document_id)), all = documents.length > 0 && rows.length === documents.length;
    $('documents-all').checked = all; $('documents-all').indeterminate = rows.length > 0 && !all;
    $('documents-reload').disabled = busy;
    $('documents-identity-reference').hidden = mode() !== 'markdown-and-anonymize';
    $('documents-identities').disabled = blocked || dirty() || Boolean(recoveryDraft) || !documents.length;
    $('documents-all').disabled = blocked || Boolean(exportRequest) || !documents.length;
    $('documents-selected').textContent = `${rows.length} ausgewählt · ${documents.filter(row => row.approved).length} von ${documents.length} freigegeben`;
    $('documents-approve').disabled = blocked || dirty() || Boolean(exportRequest) || !rows.length; $('documents-revoke').disabled = blocked || dirty() || Boolean(exportRequest) || !rows.length;
    $('documents-export').disabled = blocked || dirty() || !exportRequest && (!rows.length || rows.some(row => !row.approved));
    $('documents-export').textContent = exportRequest ? knownExport || pendingMetadata?.status === 'completed' ? 'Empfang erneut abgleichen' : 'Export erneut abgleichen' : raw() ? 'Auswahl als Markdown-Kopie speichern' : 'Auswahl für KI exportieren';
    $('documents-heading').textContent = raw() ? 'Markdown prüfen und korrigieren · nicht anonymisiert' : 'Prüfen und für KI exportieren';
    $('documents-purpose').textContent = raw() ? 'Originaltext und Markdown vergleichen und Lesefehler korrigieren. Nicht anonymisiert: enthält Originalinhalte. Eine Freigabe bestätigt nur deine Textprüfung, keine anonymisierte KI-Weitergabe.' : 'Technische Verarbeitung ist noch keine Freigabe. Vergleiche Quelle und Markdown. Häkchen wählen nur aus; erst die Sammelaktion speichert deine Freigabe.';
    if (!mode()) {
      $('documents-heading').textContent = 'Dokumentprüfstände dieses Laufs';
      $('documents-purpose').textContent = 'Der Verarbeitungszweck ist nicht mehr belegbar. Daraus wird weder eine Anonymisierung noch eine Freigabe für KI abgeleitet.';
      $('documents-export').textContent = 'Keine belegbare Exportauswahl';
      $('documents-export').disabled = true;
    }
    $('document-edit-hint').textContent = raw() ? 'Korrekturen ausdrücklich speichern. Jede Änderung hebt die bisherige Freigabe auf. Gespeicherte Markdown-Kopien enthalten Originalinhalte und sind nicht als anonymisierte KI-Weitergabe freigegeben.' : detail?.entity_review_available ? 'Erkannte Stellen unten gemeinsam behandeln. Der Originalvergleich zeigt die normalisierte Extraktionsfassung. Zusätzliche Maskierungen sperren überlappende Entitäten gegen versehentliche Wiederherstellung. Jede Änderung hebt die Freigabe auf.' : 'Für diesen älteren oder nicht vollständig rückverfolgbaren Prüfstand ist keine Entitätenbearbeitung verfügbar. Zusätzliche Maskierungen und Rückkehr zum technisch geprüften Basisstand bleiben möglich. Private Prüfstände gehören nicht in KI-Uploads.';
    $('document-save-correction').hidden = !raw(); $('document-discard-correction').hidden = !raw();
    $('document-save-correction').disabled = blocked || !detailCurrent() || Boolean(recoveryDraft) || Boolean(exportRequest) || !dirty();
    $('document-discard-correction').disabled = busy || !dirty();
    $('document-markdown').readOnly = !raw() || blocked || Boolean(recoveryDraft) || Boolean(exportRequest);
    $('document-redact').disabled = blocked || dirty() || Boolean(exportRequest) || !detailCurrent(); $('document-restore').disabled = blocked || dirty() || Boolean(exportRequest) || !detailCurrent();
    $('documents-back').disabled = busy;
    $('document-export-confirm').disabled = blocked;
    $('document-export-abandon').disabled = blocked || !$('document-export-abandon-check').checked;
    $('document-recovery-draft').hidden = !recoveryDraft;
    $('document-recovery-text').value = recoveryDraft?.text || '';
    $('document-recovery-label').textContent = recoveryDraft ? `${recoveryDraft.name}: nicht bestätigter Korrekturentwurf (Ausgangsstand ${recoveryDraft.revision}). Der Text bleibt hier erhalten; bei abweichendem gespeicherten Stand bitte vergleichen und benötigte Änderungen kopieren.` : '';
    $('document-recovery-discard').disabled = busy;
    const position = documents.findIndex(row => row.document_id === detail?.document_id);
    $('document-position').textContent = position < 0 ? '' : `${position + 1} von ${documents.length} Dateien`;
    $('document-previous').disabled = blocked || dirty() || position <= 0;
    $('document-next').disabled = blocked || dirty() || position < 0 || position >= documents.length - 1;
    const scopeBlocked = $('entities-scope').value === 'run' && (!detail?.run_entity_review_available ||
      entityRows.some(row => entitySelected.has(row.entity_id) && row.run_eligible !== true));
    $('entities-apply').disabled = blocked || !detailCurrent() || Boolean(exportRequest) || !entitySelected.size || scopeBlocked;
    const selectable = entityRows.filter(row => !row.disabled), chosen = selectable.filter(row => entitySelected.has(row.entity_id));
    $('entities-all').disabled = blocked || Boolean(exportRequest) || !selectable.length;
    $('entities-all').checked = selectable.length > 0 && chosen.length === selectable.length;
    $('entities-all').indeterminate = chosen.length > 0 && chosen.length < selectable.length;
    $('entities-decision').disabled = blocked || Boolean(exportRequest);
    $('entities-scope').disabled = blocked || Boolean(exportRequest) || !detail?.run_entity_review_available;
    $('entities-count').textContent = `${entitySelected.size} ausgewählt · ${detail?.entity_count || 0} unterschiedliche Werte in dieser Datei${scopeBlocked ? ' · Für diese Auswahl „Nur diese Datei“ wählen.' : ''}`;
    $('entities-previous').disabled = busy || entityPage <= 0; $('entities-next').disabled = busy || entityPage >= entityPages - 1;
    for (const { node, row, checkbox } of entityControls) { node.disabled = blocked || Boolean(exportRequest) || row.disabled; if (checkbox) node.checked = entitySelected.has(row.entity_id); }
    for (const node of receiptControls) node.disabled = blocked;
  }
  function clearText() { detail = null; loadedMarkdown = ''; $('document-original').value = ''; $('document-markdown').value = '';
    entityRows = []; entitySelected.clear(); entityPage = 0; entityPages = 1; entityControls = [];
    $('entities-list').replaceChildren(); $('document-entities').hidden = true;
    $('document-name').textContent = 'Dokument auswählen'; $('document-revision').textContent = ''; controls(); }
  async function openIdentities(operation) {
    if (busy || !stateFresh || !batchId || dirty() || recoveryDraft ||
        !operation && (mode() !== 'markdown-and-anonymize' || !documents.length)) return;
    const expected = batchId; const ownership = ++busyGeneration; busy = true; controls();
    try {
      const result = await invoke('open_document_identity_overview', { batchId: expected, ...(operation ? { operationId: operation } : {}) });
      if (expected !== batchId) return;
      if (result?.ok !== true || result.handoff_confirmed !== true || result.external_disclosure !== false) throw Error('DOCUMENT_REVIEW_INVALID');
      status(operation ? 'Die vertrauliche Zuordnung genau dieses Exports wurde zum Öffnen übergeben. Spätere Änderungen verändern sie nicht. Nicht an KI weitergeben.' :
        'Die vertrauliche Zuordnung der verfügbaren gespeicherten Dokumentstände wurde zum Öffnen übergeben. Das ist keine Freigabe und kein KI-Export. Nicht an KI weitergeben.');
    } catch (error) { if (expected === batchId) showError(error, operation ? `Export-${operation}` : 'Vertrauliche Zuordnung'); }
    finally { if (expected === batchId) { if (ownership !== busyGeneration) return; busy = false; controls(); } }
  }
  function renderReceipts(receipts = []) {
    if (!Array.isArray(receipts) || receipts.length > 20 || receipts.some(row => !row || !/^[a-f0-9]{32}$/u.test(row.operation_id) ||
        !Number.isSafeInteger(row.exported_count) || row.exported_count < 1 || row.exported_count > 200 ||
        row.identity_overview_available !== undefined && typeof row.identity_overview_available !== 'boolean' ||
        row.identity_overview_available === true && row.processing_mode !== 'markdown-and-anonymize' ||
        !new RegExp(`^Export-${row.operation_id}(?:-(?:[2-9]|1[0-6]))?$`, 'u').test(row.folder_name))) throw Error('AI_EXPORT_INVALID');
    receiptControls = [];
    $('documents-export-receipt-list').replaceChildren(...receipts.map(row => {
      const item = make('li'), label = `${row.exported_count} Datei${row.exported_count === 1 ? '' : 'en'} bereitgestellt: ${namespace(row.processing_mode)} → ${row.folder_name}${row.processing_mode === 'markdown-only' ? ' · nicht anonymisiert' : ''}`;
      const open = make('button', 'Exportordner öffnen'); open.setAttribute('aria-label', `${row.folder_name} öffnen`);
      open.addEventListener('click', async () => {
        if (busy || !stateFresh || !batchId) return;
        const expected = batchId; const ownership = ++busyGeneration; busy = true; controls();
        try {
          const result = await invoke('open_document_export', { batchId: expected, operationId: row.operation_id });
          if (expected !== batchId) return;
          if (result?.ok !== true || result.handoff_confirmed !== true || result.external_disclosure !== false) throw Error('AI_EXPORT_INVALID');
          status('Der geprüfte Exportordner wurde an das Betriebssystem zum Öffnen übergeben. Es wurde kein neuer Export gestartet.');
        } catch (error) { if (expected === batchId) showError(error, row.folder_name); }
        finally { if (expected === batchId) { if (ownership !== busyGeneration) return; busy = false; controls(); } }
      });
      receiptControls.push(open); item.append(make('span', label), open);
      if (row.identity_overview_available === true) {
        const identities = make('button', 'Zuordnung dieses Exports (vertraulich)');
        identities.setAttribute('aria-label', `Vertrauliche Zuordnung für ${row.folder_name}`);
        identities.addEventListener('click', () => openIdentities(row.operation_id));
        receiptControls.push(identities); item.append(identities);
      }
      return item;
    }));
    $('documents-export-receipts').hidden = receipts.length === 0;
  }
  const exportSuccess = result => `${result.exported_count} Datei${result.exported_count === 1 ? '' : 'en'} exportiert: Ergebnisordner → ${namespace(result.processing_mode)} → ${result.folder_name}. ${result.processing_mode === 'markdown-only' ? 'Nicht anonymisiert: enthält Originalinhalte, nicht für KI-Weitergabe freigegeben.' : 'Nur neutrale Markdown-Dateien; keine privaten Begleitdaten.'}`;
  function render() {
    const list = $('documents-list'); list.replaceChildren();
    for (const row of documents) {
      const item = make('div', undefined, `document-row${detail?.document_id === row.document_id ? ' active' : ''}`);
      const check = make('input'); check.type = 'checkbox'; check.checked = selected.has(row.document_id); check.disabled = busy || !stateFresh || Boolean(exportRequest);
      check.setAttribute('aria-label', `${row.name} auswählen`); check.addEventListener('change', () => {
        if (busy || !stateFresh || exportRequest) return; check.checked ? selected.add(row.document_id) : selected.delete(row.document_id); controls(); });
      const info = make('div'), show = make('button', row.name); show.disabled = busy || !stateFresh;
      show.addEventListener('click', () => loadDetail(row));
      info.append(show, make('p', `${row.approved ? 'Freigegeben' : 'Prüfung offen'} · Stand ${row.revision}`, 'meta'));
      item.append(check, info); list.append(item);
    }
    if (!documents.length) list.append(make('p', 'Keine verfügbaren Dokumentprüfstände.', 'meta'));
    controls();
  }
  function renderUnavailable(data) {
    const missing = data.unavailable || [], unknown = data.unclassified_documents || [], rejected = data.not_processed_documents || [], knownDocuments = data.documents || [];
    const fileReasons = { SOURCE_FORMAT_UNSUPPORTED: 'Dieses Dateiformat wird nicht unterstützt.',
      SOURCE_TYPE_MISMATCH: 'Dateiendung und Dateiinhalt passen nicht zusammen.', SOURCE_ENCRYPTED_UNSUPPORTED: 'Die Datei ist verschlüsselt oder passwortgeschützt. Eine ungeschützte Kopie separat auswählen.',
      SOURCE_POLYGLOT_UNSUPPORTED: 'Die Datei enthält widersprüchliche Formatstrukturen.', SOURCE_CONTAINER_CORRUPT: 'Der Dateicontainer ist beschädigt oder unvollständig.',
      SOURCE_CONTAINER_LIMIT: 'Der Dateicontainer überschreitet eine sichere Verarbeitungsgrenze.', SOURCE_ACTIVE_CONTENT_UNSUPPORTED: 'Die Datei enthält nicht unterstützte aktive Inhalte.',
      SOURCE_TEXT_INVALID: 'Der Text konnte nicht sicher dekodiert werden.', SOURCE_COMPOUND_BINARY_UNSUPPORTED: 'Dieses ältere Binärformat wird nicht unterstützt.',
      SOURCE_FORMAT_NOT_RELEASED: 'Dieses Format ist für die lokale Verarbeitung nicht freigegeben.',
      PARSE_FAILED: 'Der Dateiinhalt konnte nicht vollständig gelesen werden. Die Quelldatei in der Ursprungsanwendung prüfen und eine neue Kopie auswählen.',
      SOURCE_READ_FAILED: 'Die Datei konnte nicht gelesen werden. Den lokalen Lesezugriff prüfen.',
      SOURCE_IDENTITY_CHANGED: 'Die Datei hat sich seit der Auswahl verändert. Eine unveränderte Kopie neu auswählen.',
      CONVERSION_EXECUTABLE_MISSING: 'Eine Konvertierungskomponente fehlt. Das vollständige App-Paket neu entpacken.',
      CONVERSION_EXECUTABLE_DENIED: 'Das Betriebssystem hat den Start der Konvertierung verweigert. Mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
      CONVERSION_TIMEOUT: 'Die Konvertierung hat die sichere Zeitgrenze überschritten.',
      LOCAL_REVIEW_TOO_LARGE: 'Die lokale Prüfgrenze wurde überschritten. Das Dokument in kleinere Teile aufteilen.',
      RESIDUAL_PII: 'Die abschließende Prüfung hat noch mögliche personenbezogene Inhalte gefunden.',
      AMBIGUITY_REVIEW_REQUIRED: 'Die Datenschutzprüfung konnte den Inhalt nicht sicher freigeben.',
      INTERNAL_FAILURE: 'Die lokale Verarbeitung wurde durch einen technischen Fehler unterbrochen. Die inhaltsfreie Diagnose prüfen.' };
    // Problem rows are display-only, not document or export authority. The
    // backend validates its closed terminal reason set; a missing UI wording
    // must not turn a valid mixed run into an invalid document-review response.
    const reasonText = code => Object.hasOwn(fileReasons, code) ? fileReasons[code] :
      'Die Verarbeitung dieser Datei wurde sicher gestoppt. Den angegebenen Fehlercode und die lokale Diagnose prüfen.';
    if (![missing, unknown, rejected].every(rows => Array.isArray(rows) && rows.length <= 200 && rows.every(row => row &&
        /^[a-f0-9]{32}$/u.test(row.document_id) && (row.name === undefined ||
          typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 1024))) ||
        rejected.some(row => !row.name || typeof row.reason_code !== 'string' || !/^[A-Z][A-Z0-9_]{2,80}$/u.test(row.reason_code)) ||
        !Array.isArray(knownDocuments) || missing.length + unknown.length + rejected.length + knownDocuments.length > 200 ||
        new Set([...missing, ...unknown, ...rejected, ...knownDocuments].map(row => row.document_id)).size !==
          missing.length + unknown.length + rejected.length + knownDocuments.length) throw Error('DOCUMENT_REVIEW_INVALID');
    const panel = $('documents-unavailable'); panel.replaceChildren(); panel.hidden = !missing.length && !unknown.length && !rejected.length;
    const rows = make('ul');
    for (const row of missing) rows.append(make('li', `${row.name || `Dokument ${row.document_id.slice(0, 8)}`}: Dokumentprüfstand fehlt oder ist nicht lesbar. Keine Freigabe oder Export aus diesem Prüfstand möglich.`));
    for (const row of unknown) rows.append(make('li', `${row.name || `Dokument ${row.document_id.slice(0, 8)}`}: Früherer Ergebnisstatus nicht mehr belegbar. Die Quelldatei kann auch technisch gestoppt worden sein; keine erfolgreiche Verarbeitung oder Freigabe ableitbar.`));
    for (const row of rejected) rows.append(make('li', `${row.name}: ${reasonText(row.reason_code)} (${row.reason_code}) Nicht verarbeitet; kein Dokumentprüfstand oder Export für diese Datei. Die Originaldatei bleibt unverändert.`));
    if (!panel.hidden) panel.append(make('strong', 'Nicht verarbeitete oder nicht belegte Dateien'), rows);
  }
  async function reload() {
    const expected = batchId, request = ++ticket;
    try {
    const data = await invoke('get_document_reviews', { batchId: expected });
    if (expected !== batchId || request !== ticket) return false;
    if (data.local_ui_only !== true || data.external_disclosure !== false || !Array.isArray(data.documents) || data.documents.length > 200 ||
        data.documents.some(row => !validDocument(row)) || new Set(data.documents.map(row => row.document_id)).size !== data.documents.length ||
        new Set(data.documents.map(row => row.processing_mode)).size > 1)
      throw Error('DOCUMENT_REVIEW_INVALID');
    if (data.pending_exports !== undefined && (!Array.isArray(data.pending_exports) || data.pending_exports.length > 16 ||
        data.pending_exports.some(row => !row || !/^[a-f0-9]{32}$/u.test(row.operation_id) || !validSelection(row.selection) ||
          !/^[a-f0-9]{64}$/u.test(row.digest) || !['incomplete', 'completed'].includes(row.status) ||
          !['markdown-only', 'markdown-and-anonymize'].includes(row.processing_mode))))
      throw Error('AI_EXPORT_INVALID');
    if (data.processing_mode !== undefined && data.processing_mode !== null &&
        !['markdown-only', 'markdown-and-anonymize'].includes(data.processing_mode) ||
        data.processing_mode && data.documents.some(row => row.processing_mode !== data.processing_mode)) throw Error('DOCUMENT_REVIEW_INVALID');
    const nextMode = data.processing_mode || data.documents[0]?.processing_mode || data.pending_exports?.[0]?.processing_mode || null;
    if (runMode && nextMode && runMode !== nextMode) {
      selected.clear(); clearText(); throw Error('DOCUMENT_REVIEW_INVALID');
    }
    runMode = nextMode;
    if (runMode && data.pending_exports?.some(row => row.processing_mode !== runMode)) throw Error('AI_EXPORT_INVALID');
    renderUnavailable(data);
    // A checkbox and a visible comparison belong to one proven revision, not
    // just a stable document ID. A refreshed list must not grant a new version
    // the previous selection's approval intent or leave an old text visible.
    const previousDocuments = new Map(documents.map(row => [row.document_id, row]));
    const previousName = detail?.name;
    const comparisonInvalidated = detail && !data.documents.some(row => sameDocumentBinding(detail, row));
    documents = data.documents;
    selected = new Set([...selected].filter(id => documents.some(row => row.document_id === id &&
      sameDocumentBinding(previousDocuments.get(id), row))));
    if (comparisonInvalidated) clearText();
    else if (detail) {
      detail = { ...documents.find(row => sameDocumentBinding(detail, row)) };
      $('document-name').textContent = detail.name;
      $('document-revision').textContent = `Stand ${detail.revision} · ${detail.approved ? 'freigegeben' : 'noch nicht freigegeben'}`;
    }
    if (!exportRequest && data.pending_exports?.length) {
      const pending = data.pending_exports[0];
      exportRequest = { batchId: expected, operationId: pending.operation_id, selection: pending.selection };
      pendingMetadata = pending;
      selected = new Set(pending.selection.map(row => row.document_id));
    }
    if (exportRequest) pendingMetadata = data.pending_exports?.find(row => row.operation_id === exportRequest.operationId) || pendingMetadata;
    renderReceipts(data.export_receipts || []);
    stateFresh = true;
    render();
    if (exportRequest) status('Ein früherer Export wurde noch nicht bestätigt. „Export erneut abgleichen“ prüft genau diese gespeicherte Auswahl. Es wird kein neuer Export automatisch gestartet.');
    else if (data.unavailable?.length) status(`Prüfstände nicht verfügbar: ${data.unavailable.map(row => row.name || `Dokument ${row.document_id.slice(0, 8)}`).join(', ')}. Diese Dateien können nicht freigegeben oder für KI exportiert werden.`, true);
    else status(`${comparisonInvalidated ? `${previousName}: Der zuvor angezeigte Dokumentstand hat sich geändert oder ist nicht mehr verfügbar. Vergleich und betroffene Auswahl wurden zurückgesetzt; bitte den aktuellen Stand erneut öffnen. ` : ''}${documents.length} Dokument${documents.length === 1 ? '' : 'e'} verfügbar. Zum Vergleichen den Dateinamen anklicken; Häkchen wählen für Sammelaktionen aus.`);
    return true;
    } catch (error) { if (expected === batchId && request === ticket) { stateFresh = false; render(); } throw error; }
  }
  async function loadDetail(row) {
    if (!row) return;
    if (dirty()) { status('Ungespeicherte Markdown-Korrektur zuerst speichern oder ausdrücklich verwerfen.'); return; }
    if (busy || !stateFresh || !batchId) return; const expected = batchId, request = ++ticket;
    const ownership = ++busyGeneration; busy = true; clearText(); render(); status(`${row.name} wird lokal geladen …`);
    try {
      let original = '', markdown = '';
      for (let index = 0; index < row.chunks; index++) {
        const data = await invoke('get_document_review_chunk', { batchId: expected, documentId: row.document_id,
          revision: row.revision, chunkIndex: index });
        if (expected !== batchId || request !== ticket) return;
        if (data.revision !== row.revision || data.output_sha256 !== row.output_sha256 || data.chunk_index !== index ||
            data.local_ui_only !== true || data.external_disclosure !== false || typeof data.original_text !== 'string' || typeof data.markdown !== 'string')
          throw Error('DOCUMENT_REVIEW_STALE');
        original += data.original_text; markdown += data.markdown;
      }
      detail = { ...row }; loadedMarkdown = markdown; $('document-original').value = original; $('document-markdown').value = markdown;
      $('entities-scope').value = row.run_entity_review_available ? 'run' : 'document';
      if (row.entity_review_available) await loadEntities(0, expected, request);
      $('document-name').textContent = row.name; $('document-revision').textContent = `Stand ${row.revision} · ${row.approved ? 'freigegeben' : 'noch nicht freigegeben'}`;
      status('Textvergleich geladen. Auswahl und Textmarkierung speichern noch keine Entscheidung.');
    } catch (error) { if (expected === batchId && request === ticket) showError(error, row.name); }
    finally { if (expected === batchId && request === ticket) { if (ownership !== busyGeneration) return; busy = false; render(); $('document-name').focus?.(); } }
  }
  async function loadEntities(page, expected = batchId, request = ticket) {
    const row = detail;
    const data = await invoke('get_document_entities', { batchId: expected, documentId: row.document_id, revision: row.revision, page });
    if (expected !== batchId || request !== ticket || detail !== row) return;
    if (data.ok !== true || data.local_ui_only !== true || data.external_disclosure !== false || data.revision !== row.revision ||
        data.output_sha256 !== row.output_sha256 || data.page !== page || !Number.isSafeInteger(data.pages) || data.pages < 1 || data.pages > 10000 ||
        !Array.isArray(data.entities) || data.entities.length > 20 || data.entities.some(value => !value ||
          !/^entity_[0-9]{6}$/u.test(value.entity_id) || typeof value.original !== 'string' || typeof value.replacement !== 'string' ||
          typeof value.disabled !== 'boolean' || !Number.isSafeInteger(value.count) || value.count < 1 ||
          !Number.isSafeInteger(value.output_start) || !Number.isSafeInteger(value.output_end) || value.output_start < 0 ||
          value.output_end < value.output_start || value.output_end > loadedMarkdown.length)) throw Error('DOCUMENT_ENTITY_INVALID');
    entityRows = data.entities; entitySelected.clear(); entityPage = page; entityPages = data.pages; entityControls = [];
    $('document-entities').hidden = false; $('entities-page').textContent = `Seite ${page + 1} von ${entityPages}`;
    $('entities-list').replaceChildren(...entityRows.map(value => {
      const tr = make('tr'), td = make('td'), check = make('input'); check.type = 'checkbox';
      check.setAttribute('aria-label', `${value.original} auswählen`); check.disabled = value.disabled;
      check.addEventListener('change', () => { if (busy || exportRequest || value.disabled) return;
        check.checked ? entitySelected.add(value.entity_id) : entitySelected.delete(value.entity_id); controls(); });
      entityControls.push({ node: check, row: value, checkbox: true }); td.append(check);
      const original = make('td'), inspect = make('button', value.original + (value.original_truncated ? ' …' : ''));
      inspect.addEventListener('click', () => {
        const markdown = $('document-markdown'), source = $('document-original');
        markdown.focus(); markdown.setSelectionRange(value.output_start, value.output_end);
        if (Number.isSafeInteger(value.source_start) && Number.isSafeInteger(value.source_end)) source.setSelectionRange(value.source_start, value.source_end);
        status(`Ausgewählt: ${value.original}. ${value.count} Vorkommen in dieser Datei. Der Vergleich zeigt die erste Fundstelle.`);
      });
      entityControls.push({ node: inspect, row: value }); original.append(inspect, make('p', `${value.count} Vorkommen · ${value.kind}`, 'meta'));
      const planned = make('td', value.disabled ? 'Zusätzlich maskiert' : value.replacement);
      planned.setAttribute('data-label', 'Geplante Ausgabe');
      const state = make('td', value.disabled ? 'Gesperrt durch Textmaskierung' : value.decision === 'keep' ? 'Beibehalten · Prüfung nötig' : 'Ersetzt');
      state.setAttribute('data-label', 'Status'); tr.append(td, original, planned, state);
      return tr;
    })); controls();
  }
  async function changeEntityPage(delta) {
    if (busy || !detailCurrent()) return; const ownership = ++busyGeneration; busy = true; controls();
    try { await loadEntities(entityPage + delta); } catch (error) { showError(error, detail?.name); }
    finally { if (ownership !== busyGeneration) return; busy = false; controls(); }
  }
  async function applyEntities() {
    if (busy || !detailCurrent() || exportRequest || !entitySelected.size) return;
    const connection = connectionGeneration;
    const row = detail, expected = batchId, treatment = $('entities-decision').value;
    const scope = $('entities-scope').value;
    if (!['document', 'run'].includes(scope) || scope === 'run' && (!row.run_entity_review_available ||
        entityRows.some(value => entitySelected.has(value.entity_id) && value.run_eligible !== true))) return;
    if (!['default', 'keep', 'person', 'organization'].includes(treatment)) return;
    const ownership = ++busyGeneration; busy = true; controls(); let updated, failure;
    try {
      updated = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
        decision: { action: 'entities', revision: row.revision, output_sha256: row.output_sha256, ranges: [], operation_id: operationId(),
          entity_decisions: [...entitySelected].map(entity_id => ({ entity_id, decision: treatment })),
          ...(scope === 'run' ? { scope } : {}) } });
      if (updated?.ok === false && updated.reason_code === 'DOCUMENT_ENTITY_RUN_CONFLICT' && updated.local_ui_only === true &&
          updated.external_disclosure === false && Array.isArray(updated.blocked_files) && updated.blocked_files.length <= 200 &&
          updated.blocked_files.every(file => typeof file.name === 'string' && file.name.length <= 1024)) {
        const names = updated.blocked_files.map(file => file.name).join(', ');
        status(`${reasons.DOCUMENT_ENTITY_RUN_CONFLICT} Betroffen: ${names}.`, true); updated = null; return;
      }
      if (!decisionAcknowledged(updated, row, 'entities')) throw Error('DOCUMENT_REVIEW_STALE');
      if (scope === 'run' && (updated.scope !== 'run' || !Number.isSafeInteger(updated.affected_count) ||
          updated.affected_count < 1 || updated.affected_count > 200)) throw Error('DOCUMENT_REVIEW_STALE');
      if (expected === batchId) { clearText(); await reload(); }
    } catch (error) {
      if (connection !== connectionGeneration) return;
      failure = error; updated = null;
      // A lost reply does not prove that the common commit failed. Refresh
      // the projection, never retry a new decision or claim "nothing saved".
      if (expected === batchId) { clearText(); try { await reload(); } catch {} }
    }
    finally { if (ownership !== busyGeneration) return; busy = false; controls(); }
    if (connection !== connectionGeneration) return;
    if (updated && expected === batchId) { await loadDetail(documents.find(value => value.document_id === row.document_id));
      status(scope === 'run' ? `Behandlung für ${updated.affected_count} Dateien dieses Laufs gemeinsam gespeichert; spätere passende Prüfstände übernehmen sie ebenfalls. Betroffene Texte müssen erneut freigegeben werden. Ein Export wurde nicht gestartet.` :
        'Behandlung gespeichert. Die Datei muss mit dem geänderten Text erneut freigegeben werden. Ein Export wurde nicht gestartet.'); }
    else if (failure && expected === batchId) {
      if (stateFresh) await loadDetail(documents.find(value => value.document_id === row.document_id));
      showError(failure, row.name);
      $('documents-status').textContent += stateFresh ? ' Die Bestätigung ist unklar; der gespeicherte Stand wurde erneut abgefragt. Bitte vor weiteren Änderungen vergleichen.' :
        ' Die Bestätigung ist unklar. Auch der aktuelle gespeicherte Stand konnte nicht abgefragt werden. Änderungen bleiben gesperrt; bitte „Gespeicherten Stand neu laden“ wählen.';
    }
  }
  async function decideRows(action, rows, ranges = []) {
    if (busy || !stateFresh || recoveryDraft || exportRequest || !batchId || !rows.length || dirty() && action !== 'correct') return;
    if (rows.some(row => !documents.some(current => sameDocumentBinding(row, current))) ||
        ['correct', 'redact', 'restore_base'].includes(action) && !detailCurrent()) return;
    const draft = action === 'correct' ? { ...detail, text: $('document-markdown').value } : null;
    const connection = connectionGeneration;
    const expected = batchId; let failed, confirmed = 0; const ownership = ++busyGeneration; busy = true; render(); status('Entscheidungen werden lokal gespeichert …');
    try {
      for (const row of rows) {
        try { const result = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
          decision: { action, revision: row.revision, output_sha256: row.output_sha256, ranges, operation_id: operationId() } });
          if (!decisionAcknowledged(result, row, action)) throw Error('DOCUMENT_REVIEW_STALE');
          // Only an exactly bound acknowledgement may advance a selection
          // across our own mutation. An unrelated reload never gets this grant.
          documents = documents.map(value => value.document_id === row.document_id ? { ...result } : value);
          confirmed++; }
        catch (error) { failed = { error, name: row.name }; throw error; }
      }
      if (batchId !== expected) return;
      exportRequest = null; clearText(); await reload(); status(`${rows.length} Entscheidung${rows.length === 1 ? '' : 'en'} gespeichert. ${raw() ? 'Eine Markdown-Kopie bleibt nicht anonymisiert.' : 'Ein KI-Export erfolgt nur über den eigenen Exportbutton.'}`);
    } catch (error) { if (connection === connectionGeneration && batchId === expected) {
      for (const row of rows.slice(0, confirmed)) selected.delete(row.document_id);
      if (draft) recoveryDraft = draft;
      clearText(); await reload().catch(() => {}); showError(failed?.error || error, failed?.name || rows.map(row => row.name).join(', '));
      status(`${confirmed} Entscheidung${confirmed === 1 ? '' : 'en'} bestätigt. ${$('documents-status').textContent} ${Math.max(0, rows.length - confirmed - 1)} weitere Dateien wurden noch nicht bearbeitet.`, true);
      if (draft) $('documents-status').textContent += ' Dein Korrekturentwurf bleibt erhalten; den gespeicherten Stand neu laden, bevor du weiterarbeitest.';
      if (!stateFresh) $('documents-status').textContent += ' Der aktuelle Stand konnte nicht abgefragt werden. Änderungen bleiben bis zum Neuladen gesperrt.';
    } }
    finally { if (batchId === expected) { if (ownership !== busyGeneration) return; busy = false; render(); } }
  }
  function renderExportDialog() {
    if (!dialogSelection) return;
    const isRaw = dialogMode === 'markdown-only', complete = Boolean(knownExport || pendingMetadata?.status === 'completed');
    $('document-export-title').textContent = complete ? 'Empfang der fertigen Kopie bestätigen' : isRaw ? 'Markdown-Kopie speichern' : 'Für KI exportieren';
    $('document-export-purpose').textContent = isRaw ? 'Nicht anonymisiert. Enthält Originalinhalte. Diese Kopie ist nicht als anonymisierte KI-Weitergabe freigegeben.' : 'Nur die ausgewählten, ausdrücklich freigegebenen Markdown-Textstände werden kopiert.';
    $('document-export-target').textContent = `Gebundener Ergebnisordner → ${namespace(dialogMode)} → ${exportRequest ? `Export-${exportRequest.operationId} (${pendingMetadata || knownExport ? 'gespeicherter Auftrag' : 'Bestätigung des Auftrags noch offen'})` : 'neuer Exportordner'}`;
    $('document-export-files').replaceChildren(...dialogSelection.map((row, index) => make('li', `Dokument_${String(index + 1).padStart(2, '0')}.md`)));
    $('document-export-confirm').textContent = complete ? 'Empfang bestätigen' : exportRequest ? 'Export erneut abgleichen' : isRaw ? 'Kopie speichern' : 'Exportieren';
    $('document-export-abandon-option').hidden = !pendingMetadata || complete;
    $('document-export-abandon').hidden = !pendingMetadata || complete;
    controls();
  }
  function openExportDialog() {
    if (busy || !stateFresh || dirty()) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (!exportRequest && (!rows.length || rows.some(row => !row.approved))) return;
    dialogSelection = exportRequest ? exportRequest.selection.map(row => ({ ...row })) : rows.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
    dialogMode = pendingMetadata?.processing_mode || rows[0]?.processing_mode || (raw() ? 'markdown-only' : 'markdown-and-anonymize');
    $('document-export-preview').hidden = false; $('document-export-result').hidden = true;
    $('document-export-confirm').hidden = false;
    $('document-export-close').textContent = 'Abbrechen';
    $('document-export-abandon-check').checked = false;
    renderExportDialog(); dialogFocus = document.activeElement; $('document-export-dialog').showModal(); $('document-export-close').focus();
  }
  async function exportRows() {
    if (!stateFresh || dirty() || !validSelection(dialogSelection)) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (busy || !batchId || !exportRequest && (!rows.length || rows.some(row => !row.approved))) return;
    const connection = connectionGeneration;
    const expected = batchId;
    if (!exportRequest) exportRequest = { batchId: expected, operationId: operationId(),
      selection: dialogSelection };
    const ownership = ++busyGeneration; busy = true; render(); status('⚙ Die ausgewählten Textstände werden lokal kopiert und geprüft. Bitte warten.');
    $('document-export-result').hidden = false; $('document-export-result').textContent = $('documents-status').textContent;
    try {
      const request = exportRequest;
      const complete = Boolean(knownExport || pendingMetadata?.status === 'completed');
      const result = await invoke('export_approved_documents', complete ? { ...request, acknowledge: true } : request);
      if (expected !== batchId) return;
      if (result.ok !== true || result.operation_id !== request.operationId || result.exported_count !== request.selection.length ||
          (result.processing_mode || 'markdown-and-anonymize') !== dialogMode ||
          (dialogMode === 'markdown-only' && result.anonymized !== false) ||
          result.local_ui_only !== true || result.external_disclosure !== false ||
          !new RegExp(`^Export-${result.operation_id}(?:-(?:[2-9]|1[0-6]))?$`, 'u').test(result.folder_name)) throw Error('AI_EXPORT_INCOMPLETE');
      knownExport = result; status(exportSuccess(result));
      // Receipt confirmation is separate from the copy operation. If either
      // response is lost, the durable intent is discoverable on the next open.
      const receipt = complete ? result : await invoke('export_approved_documents', { ...request, acknowledge: true });
      if (expected !== batchId) return;
      if (receipt.ok !== true || receipt.operation_id !== result.operation_id || receipt.exported_count !== result.exported_count ||
          receipt.folder_name !== result.folder_name || receipt.local_ui_only !== true || receipt.external_disclosure !== false)
        throw Error('AI_EXPORT_INCOMPLETE');
      exportRequest = null; knownExport = null; pendingMetadata = null; await reload(); status(exportSuccess(result));
      $('document-export-title').textContent = dialogMode === 'markdown-only' ? 'Markdown-Kopie gespeichert' : 'Export fertig';
      $('document-export-preview').hidden = true; $('document-export-confirm').hidden = true;
      $('document-export-abandon-option').hidden = true; $('document-export-abandon').hidden = true;
      $('document-export-close').textContent = 'Schließen';
    } catch (error) { if (connection === connectionGeneration && expected === batchId) {
      if (knownExport) status(`${exportSuccess(knownExport)} Die Kopie ist bestätigt; nur die Empfangsbestätigung konnte nicht abschließend abgeglichen werden. „Empfang erneut abgleichen“ verwendet denselben Export.`, true);
      else { await reload().catch(() => {}); showError(error, rows.map(row => row.name).join(', ')); }
      renderExportDialog();
    } }
    finally { if (expected === batchId) { if (ownership !== busyGeneration) return; busy = false; render(); $('document-export-result').textContent = $('documents-status').textContent; } }
  }
  window.__DATASECURE_DOCUMENTS__ = Object.freeze({
    invalidateConnection() {
      connectionGeneration++; busyGeneration++; busy = false; ticket++; stateFresh = false; selected.clear();
      if (detail && raw() && dirty()) recoveryDraft = { document_id: detail.document_id, name: detail.name,
        revision: detail.revision, output_sha256: detail.output_sha256, text: $('document-markdown').value };
      // An export intent remains durable on the server. Forget its local
      // acknowledgement, not its operation; reload discovers that same receipt.
      knownExport = null; documents = []; clearText(); renderReceipts(); render();
      status('Verbindung unterbrochen. Aktuelle Stände nach der Wiederverbindung neu laden; keine Entscheidung oder Exportbestätigung wird automatisch gesendet.', true);
    },
    async open(id, options = {}) { if (busy || dirty()) return; batchId = id; documents = []; runMode = null; stateFresh = false; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null; clearText(); renderUnavailable({}); renderReceipts(); render();
      $('documents-run').textContent = `Lauf ${id.slice(0, 8)}`; status('Private Dokumentprüfstände werden geladen …');
      try {
        if (!await reload() || batchId !== id || options.exportPreview !== true) return;
        // An explicit history action may propose the complete selection, never
        // approval or target I/O. A stale history snapshot must not turn into
        // a partial export or an automatic replay of an older pending intent.
        if (stateFresh && runMode === 'markdown-and-anonymize' && !exportRequest && documents.length &&
            documents.every(row => row.approved) && $('documents-unavailable').hidden) {
          selected = new Set(documents.map(row => row.document_id)); render(); openExportDialog();
        } else status('Der gespeicherte Stand wurde neu geladen. Die vollständige Exportvorschau ist noch nicht verfügbar; offene Prüfstände oder Exportaufträge zuerst abgleichen.', true);
      } catch (error) { if (batchId === id) showError(error); }
    },
    async close() { if (busy || dirty()) { if (dirty()) status('Ungespeicherte Markdown-Korrektur zuerst speichern oder ausdrücklich verwerfen.'); return false; } connectionGeneration++; ticket++; batchId = null; documents = []; runMode = null; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null;
      if ($('document-export-dialog').open) $('document-export-dialog').close();
      clearText(); renderReceipts(); render(); await invoke('close_document_reviews').catch(() => {}); return true; }
  });
  $('documents-reload').addEventListener('click', async () => {
    if (busy || !batchId || dirty() && !recoveryDraft) return;
    const draft = recoveryDraft; const ownership = ++busyGeneration; busy = true; controls();
    try { await reload(); }
    catch (error) { showError(error, draft?.name); $('documents-status').textContent += ' Der aktuelle Stand konnte nicht abgefragt werden. Änderungen bleiben gesperrt.'; }
    finally { if (ownership !== busyGeneration) return; busy = false; render(); }
    if (stateFresh && draft) {
      const row = documents.find(value => value.document_id === draft.document_id);
      clearText();
      // Preserve the draft separately while loading the actual committed text.
      recoveryDraft = null; await loadDetail(row); recoveryDraft = draft;
      if (detail && row) {
        if (loadedMarkdown === draft.text) { recoveryDraft = null; status(`${draft.name}: Der gespeicherte Text stimmt mit deinem Korrekturentwurf überein. Bitte erneut prüfen und freigeben.`); }
        else if (row.revision === draft.revision && row.output_sha256 === draft.output_sha256) {
          $('document-markdown').value = draft.text; recoveryDraft = null; status(`${draft.name}: Korrekturentwurf wiederhergestellt, noch nicht gespeichert.`);
        } else status(`${draft.name}: Der gespeicherte Stand weicht ab. Dein Entwurf bleibt zum Vergleichen und Kopieren erhalten; er wird nicht automatisch darübergeschrieben.`, true);
      }
      controls();
    }
    if ($('document-export-dialog').open) renderExportDialog();
  });
  $('document-recovery-discard').addEventListener('click', () => { if (busy) return; recoveryDraft = null; controls(); });
  $('documents-all').addEventListener('change', () => { if (busy || !stateFresh || exportRequest) return; selected = new Set($('documents-all').checked ? documents.map(row => row.document_id) : []); render(); });
  $('entities-all').addEventListener('change', () => { if (busy || exportRequest) return;
    entitySelected = new Set($('entities-all').checked ? entityRows.filter(row => !row.disabled).map(row => row.entity_id) : []); controls(); });
  $('entities-apply').addEventListener('click', applyEntities);
  $('entities-scope').addEventListener('change', controls);
  $('entities-previous').addEventListener('click', () => changeEntityPage(-1)); $('entities-next').addEventListener('click', () => changeEntityPage(1));
  for (const [id, delta] of [['document-previous', -1], ['document-next', 1]]) $(id).addEventListener('click', () => {
    const position = documents.findIndex(row => row.document_id === detail?.document_id), next = documents[position + delta];
    if (position >= 0 && next) loadDetail(next);
  });
  $('documents-approve').addEventListener('click', () => decideRows('approve', documents.filter(row => selected.has(row.document_id))));
  $('documents-revoke').addEventListener('click', () => decideRows('revoke', documents.filter(row => selected.has(row.document_id))));
  $('documents-export').addEventListener('click', openExportDialog);
  $('documents-identities').addEventListener('click', () => openIdentities());
  $('document-export-confirm').addEventListener('click', exportRows);
  $('document-export-close').addEventListener('click', () => $('document-export-dialog').close());
  $('document-export-dialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...$('document-export-dialog').querySelectorAll('button:not([disabled]), input:not([disabled])')]
      .filter(node => !node.hidden && node.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1);
    if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  $('document-export-dialog').addEventListener('close', () => { dialogSelection = null;
    (dialogFocus?.isConnected && !dialogFocus.disabled ? dialogFocus : $('documents-heading')).focus(); });
  $('document-export-abandon-check').addEventListener('change', controls);
  $('document-export-abandon').addEventListener('click', async () => {
    if (busy || !stateFresh || !pendingMetadata || pendingMetadata.status !== 'incomplete' || knownExport || !$('document-export-abandon-check').checked) return;
    const ownership = ++busyGeneration; busy = true; controls();
    try {
      const result = await invoke('abandon_document_export', { batchId, operationId: pendingMetadata.operation_id, digest: pendingMetadata.digest });
      if (result.ok !== true || result.abandoned !== true || result.operation_id !== pendingMetadata.operation_id ||
          result.local_ui_only !== true || result.external_disclosure !== false) throw Error('AI_EXPORT_INCOMPLETE');
      exportRequest = null; pendingMetadata = null; await reload();
      status('Exportauftrag wird nicht weiter verfolgt. Vorhandene Dateien wurden nicht gelöscht.'); $('document-export-dialog').close();
    } catch (error) { showError(error); $('document-export-result').hidden = false; $('document-export-result').textContent = $('documents-status').textContent; }
    finally { if (ownership !== busyGeneration) return; busy = false; render(); }
  });
  $('document-markdown').addEventListener('input', controls);
  $('document-discard-correction').addEventListener('click', () => { $('document-markdown').value = loadedMarkdown; controls(); });
  $('document-save-correction').addEventListener('click', () => {
    if (!detailCurrent() || !raw() || !dirty()) return;
    const text = $('document-markdown').value; let start = 0, oldEnd = loadedMarkdown.length, end = text.length;
    while (start < oldEnd && start < end && loadedMarkdown[start] === text[start]) start++;
    if (/[\uDC00-\uDFFF]/u.test(text[start] || '') || /[\uDC00-\uDFFF]/u.test(loadedMarkdown[start] || '')) start--;
    while (oldEnd > start && end > start && loadedMarkdown[oldEnd - 1] === text[end - 1]) { oldEnd--; end--; }
    if (/[\uDC00-\uDFFF]/u.test(text[end] || '') || /[\uDC00-\uDFFF]/u.test(loadedMarkdown[oldEnd] || '')) { oldEnd++; end++; }
    if (end - start > 32768) { status('Bitte eine kleinere Korrektur speichern (höchstens 32.768 Zeichen pro Änderung).', true); return; }
    decideRows('correct', [detail], [{ start, end: oldEnd, replacement: text.slice(start, end) }]);
  });
  $('document-redact').addEventListener('click', () => { const node = $('document-markdown');
    if (!detailCurrent() || node.selectionStart === node.selectionEnd) { status('Im geplanten Markdown zuerst den zusätzlichen Textbereich markieren.'); return; }
    decideRows('redact', [detail], [{ start: node.selectionStart, end: node.selectionEnd }]); });
  $('document-restore').addEventListener('click', () => { if (detail) decideRows('restore_base', [detail]); });
  controls();
})();
