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
    (row.review_policy === undefined || row.review_policy === 'automatic-conservative' && row.processing_mode === 'markdown-and-anonymize') &&
    (row.approval_basis === undefined || row.review_policy === 'automatic-conservative' &&
      (row.approved ? row.approval_basis === 'manual' && row.revision > 0 || row.approval_basis === 'automatic' && row.revision === 0 : row.approval_basis === null)) &&
    (row.review_policy === undefined || row.approval_basis !== undefined) &&
    (row.text_modified === undefined || typeof row.text_modified === 'boolean') &&
    Number.isSafeInteger(row.chunks) && row.chunks >= 1 && row.chunks <= 245;
  const sameDocumentBinding = (left, right) => left && right && left.document_id === right.document_id &&
    left.revision === right.revision && left.output_sha256 === right.output_sha256 &&
    left.processing_mode === right.processing_mode && left.chunks === right.chunks;
  function decisionAcknowledged(result, previous, action) {
    return result?.ok === true && validDocument(result) && result.document_id === previous.document_id &&
      result.processing_mode === previous.processing_mode && result.revision === previous.revision + 1 &&
      (!['approve', 'revoke'].includes(action) || result.output_sha256 === previous.output_sha256) &&
      result.approved === (action === 'approve') && result.local_ui_only === true && result.external_disclosure === false;
  }
  function rejectedEntityDecision(result) {
    const closed = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === fields;
    const reasons = ['DOCUMENT_ENTITY_RUN_UNAVAILABLE', 'DOCUMENT_ENTITY_RUN_CONFLICT', 'DOCUMENT_REVIEW_INVALID',
      'DOCUMENT_REVIEW_RESIDUAL_PII', 'DOCUMENT_REVIEW_POLICY_CHANGED'];
    // Only the complete, explicit pre-commit refusal proves that this request
    // saved nothing. An unknown/malformed reply still takes uncertain recovery.
    if (!closed(result, 'blocked_files,external_disclosure,local_ui_only,ok,reason_code') || result.ok !== false ||
        result.reason_code !== 'DOCUMENT_ENTITY_RUN_CONFLICT' || result.local_ui_only !== true || result.external_disclosure !== false ||
        !Array.isArray(result.blocked_files) || !result.blocked_files.length || result.blocked_files.length > 200 ||
        !result.blocked_files.every(file => closed(file, 'name,reason_code') && typeof file.name === 'string' &&
          file.name.length > 0 && file.name.length <= 1024 && !/[:\\\p{Cc}]/u.test(file.name) && !file.name.startsWith('/') &&
          file.name.split('/').every(part => part && part !== '.' && part !== '..') && reasons.includes(file.reason_code))) return null;
    return { names: result.blocked_files.map(file => file.name).join(', '),
      residual: result.blocked_files.some(file => file.reason_code === 'DOCUMENT_REVIEW_RESIDUAL_PII'),
      policy: result.blocked_files.some(file => file.reason_code === 'DOCUMENT_REVIEW_POLICY_CHANGED'),
      unavailable: result.blocked_files.some(file => !['DOCUMENT_REVIEW_RESIDUAL_PII', 'DOCUMENT_REVIEW_POLICY_CHANGED'].includes(file.reason_code)) };
  }
  async function decideSelection(expected, action, rows) {
    // One atomic, operation-bound acknowledgement even for a single file.
    // This is also used by the combined approval/export confirmation.
    const id = operationId();
    const result = await invoke('decide_document_review_batch', { batchId: expected,
      decision: { action, operation_id: id, selection: rows.map(row => ({ document_id: row.document_id,
        revision: row.revision, output_sha256: row.output_sha256 })) } });
    if (result?.ok !== true || result.operation_id !== id || result.affected_count !== rows.length ||
        result.local_ui_only !== true || result.external_disclosure !== false || !Array.isArray(result.documents) ||
        result.documents.length !== rows.length || new Set(result.documents.map(row => row?.document_id)).size !== rows.length)
      throw Error('DOCUMENT_REVIEW_STALE');
    // Accept the entire acknowledgement only after every exact input binding
    // has advanced once. A malformed partial reply cannot approve the rest.
    return rows.map(row => {
      const updated = result.documents.find(value => value?.document_id === row.document_id);
      const acknowledged = { ...updated, ok: true, local_ui_only: true, external_disclosure: false };
      if (!decisionAcknowledged(acknowledged, row, action)) throw Error('DOCUMENT_REVIEW_STALE');
      return acknowledged;
    });
  }
  let batchId = null, documents = [], selected = new Set(), detail = null, ticket = 0, busy = false, exportRequest = null, knownExport = null;
  let exportHeartbeat = null;
  const stopExportHeartbeat = () => { if (exportHeartbeat !== null) clearInterval(exportHeartbeat); exportHeartbeat = null; };
  const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
  function exportObservation(snapshot, request) {
    const activity = snapshot?.activity, progress = activity?.export_progress;
    if (snapshot?.local_ui_only !== true || snapshot.external_disclosure !== false ||
        ['closing', 'blocked'].includes(snapshot.phase) || activity?.state !== 'active' || activity.active !== true ||
        activity.action !== 'export_approved_documents' || !progress ||
        Object.keys(progress).sort().join(',') !== 'operation_id,phase,staged_count,total_count' ||
        progress.operation_id !== request.operationId || !/^[a-f0-9]{32}$/u.test(progress.operation_id) ||
        !['preparing', 'copying', 'verifying', 'receipt'].includes(progress.phase) ||
        !Number.isSafeInteger(progress.total_count) || progress.total_count !== request.selection.length ||
        progress.total_count < 1 || progress.total_count > 200 || !Number.isSafeInteger(progress.staged_count) ||
        progress.staged_count < 0 || progress.staged_count > progress.total_count) return null;
    return { phase: progress.phase, staged_count: progress.staged_count, total_count: progress.total_count };
  }
  function exportProgressText(progress) {
    if (!progress) return 'Ein verlässlicher Dateifortschritt ist momentan nicht verfügbar.';
    if (progress.phase === 'copying') return `${progress.staged_count} von ${progress.total_count} Dateien sind im geschützten Zwischenbereich gespeichert. Danach wird die vollständige Kopie geprüft.`;
    if (progress.phase === 'preparing') return 'Die ausgewählten Textstände werden für die Kopie geprüft und vorbereitet.';
    if (progress.phase === 'verifying') return 'DataSecure prüft die kopierten Dateien und stellt den Exportordner fertig.';
    return 'DataSecure gleicht die Kopie mit dem gespeicherten Abschlussbeleg ab.';
  }
  let exportFolderNeeded = false;
  let documentProblemCount = 0, documentOmissionCount = 0, processingComplete = false, confirmedCopy = null, completedCopyCount = 0, loading = false;
  let contentNotices = null, filterMode = 'notices';
  let sourceNoticeFacts = null;
  let loadedMarkdown = '', markdownPositions = null, originalPositions = null;
  let stateFresh = false, recoveryDraft = null, runMode = null, runPolicy = null;
  let pendingMetadata = null, dialogSelection = null, dialogMode = null, dialogFocus = null, dialogFiles = null, dialogResultFolder = null;
  let dialogCompleted = false, completedExportReceipt = null;
  let entityRows = [], entitySelected = new Set(), entitySelectionFacts = new Map(), entityPage = 0, entityPages = 1, entityControls = [];
  let textSelection = null, selectionOwner = null;
  let receiptControls = [];
  let documentControls = [];
  let bulkReviewProgress = null;
  let pendingDocumentChange = null;
  let viewedBindings = new Map(), pendingApproval = null;
  let sourceCount = 0, unavailableSourceCount = 0, omissionSourceCount = 0, privacyStopCount = 0;
  let unavailableReviewCount = 0;
  let resultPublication = null;
  let directResultsSupported = false;
  function publication(value) {
    if (!value || !['initial', 'current', 'pending', 'conflict', 'unavailable', 'repair_required'].includes(value.state) ||
        Object.keys(value).some(key => !['state', 'generation_id', 'count', 'current_revision', 'repair_binding'].includes(key)) ||
        (value.state === 'repair_required' ? Object.keys(value).sort().join(',') !== 'count,current_revision,generation_id,repair_binding,state' ||
          value.generation_id === undefined || value.count === undefined || value.current_revision === undefined ||
          typeof value.repair_binding !== 'string' || !/^[a-f0-9]{64}$/u.test(value.repair_binding) : Object.prototype.hasOwnProperty.call(value, 'repair_binding')) ||
        value.generation_id !== undefined && value.generation_id !== null && !/^[a-f0-9]{32}$/u.test(value.generation_id) ||
        value.state === 'current' && !/^[a-f0-9]{32}$/u.test(value.generation_id || '') ||
        value.count !== undefined && (!Number.isSafeInteger(value.count) || value.count < 0 || value.count > 200) ||
        value.current_revision !== undefined && (!Number.isSafeInteger(value.current_revision) || value.current_revision < 0 || value.current_revision > 1000))
      throw Error('DOCUMENT_REVIEW_INVALID');
    return { ...value };
  }
  const mode = () => (pendingMetadata || detail || documents[0])?.processing_mode || runMode;
  const raw = () => mode() === 'markdown-only';
  const automatic = () => runPolicy === 'automatic-conservative';
  const approvalLabel = row => row.text_modified === true ? 'Nachbearbeitung gespeichert' : 'Ergebnis verfügbar';
  const visibleDocuments = () => {
    if (!raw() || !contentNotices || exportRequest || filterMode === 'all') return documents;
    if (filterMode === 'edited') return documents.filter(row => row.text_modified === true);
    if (filterMode === 'without') return documents.filter(row => !contentNotices.has(row.document_id));
    return documents.filter(row => contentNotices.has(row.document_id));
  };
  const currentTextState = row => row.text_modified === true ? 'Korrektur gespeichert' : 'Markdown verfügbar';
  const noticeExplanation = codes => {
    const messages = { SOURCE_COVERAGE_UNVERIFIED: 'Inhaltsübernahme nicht vollständig belegbar',
      OFFICE_TABLE_CONTEXT_UNVERIFIED: 'Office-Tabellenkontext nur teilweise übernommen: sichere Feldzuordnung nicht vollständig modelliert',
      OCR_NOT_VERIFIED: 'OCR-Text nicht vollständig fachlich geprüft. Die Kontaktprüfung betrifft nur erkannte E-Mail-Adressen und Telefonnummern, nicht die übrigen Wörter, Zahlen oder Lesereihenfolge.',
      OCR_CONTACT_VALUES_UNVERIFIED: 'Erkannte OCR-Kontaktwerte sind noch nicht bestätigt',
      VISUAL_CONTENT_NOT_EXTRACTED: 'Bildinhalt nicht als Text übernommen',
      OCR_TEXT_EMPTY: 'OCR lieferte keinen zusätzlichen Text',
      PDF_OCR_SCOPE_UNVERIFIED: 'PDF-Bildbereich nicht eindeutig zugeordnet',
      SCAN_OCR_DISABLED_BY_POLICY: 'Scan-OCR war ausgeschaltet',
      IMAGE_OCR_DISABLED_BY_POLICY: 'Bild-OCR war ausgeschaltet',
      OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED: 'EMF-Grafiken konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_WMF_UNSUPPORTED: 'WMF-Grafiken konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED: 'SVG-Grafiken konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_GIF_UNSUPPORTED: 'GIF-Bilder konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_TIFF_UNSUPPORTED: 'TIFF-Bilder konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_WEBP_UNSUPPORTED: 'WebP-Bilder konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      OFFICE_IMAGE_FORMAT_OTHER_UNSUPPORTED: 'Ein nicht unterstütztes Bildformat wurde nicht gelesen; der Dokumentinhalt wurde nur teilweise übernommen',
      IMAGE_CONTENT_DAMAGED: 'Mindestens ein Bild ist beschädigt und wurde nicht gelesen; der Dokumentinhalt wurde nur teilweise übernommen',
      IMAGE_PROCESSING_LIMIT: 'Die Bildverarbeitung erreichte eine technische Grenze; der Dokumentinhalt wurde nur teilweise übernommen',
      IMAGE_OCR_FAILED: 'Die Texterkennung eines Bildes ist fehlgeschlagen; der Dokumentinhalt wurde nur teilweise übernommen',
      DOCUMENT_PARTS_DAMAGED: 'Beschädigte Dokumentteile konnten nicht gelesen werden; der Dokumentinhalt wurde nur teilweise übernommen',
      EXTERNAL_CONTENT_NOT_READ: 'Extern verknüpfte Inhalte wurden nicht nachgeladen; der Dokumentinhalt wurde nur teilweise übernommen',
      CONVERSION_RESOURCE_LIMIT_PARTIAL: 'Eine technische Ressourcenbegrenzung beendete die weitere Verarbeitung; nur ein Teil des Dokuments wurde übernommen',
      CONVERSION_TIMEOUT_PARTIAL: 'Die verfügbare Verarbeitungszeit war ausgeschöpft; nur ein Teil des Dokuments wurde übernommen',
      TEXT_LIMIT_PARTIAL: 'Die Textmengengrenze wurde erreicht; nur ein Teil des Dokuments wurde übernommen',
      PDF_PAGE_NOT_READ: 'Mindestens eine PDF-Seite konnte nicht gelesen werden; der PDF-Inhalt wurde nur teilweise übernommen',
      PDF_IMAGE_NOT_READ: 'Mindestens ein Bildbereich der PDF konnte nicht gelesen werden; der PDF-Inhalt wurde nur teilweise übernommen' };
    return codes.length ? codes.map(code => messages[code] || 'Inhaltsübernahme möglicherweise unvollständig; Original vergleichen').join(' · ') :
      'Inhaltsübernahme möglicherweise unvollständig';
  };
  const dirty = () => Boolean(recoveryDraft || detail && raw() && $('document-markdown').value !== markdownPositions?.display);
  // A plain text highlight is not a prepared write. Explicit entity choices
  // and a prepared basis restoration are; keep them on navigation attempts.
  const prepared = () => Boolean(pendingDocumentChange || entitySelected.size);
  const navigationDraft = () => dirty() || prepared();
  function guardReason(action) {
    if (busy || loading) return 'Ein lokaler Vorgang läuft. Bitte seinen Abschluss abwarten.';
    if (!batchId || !detail) return 'Bitte zuerst links eine Datei öffnen.';
    if (!detailCurrent()) return 'Der angezeigte Stand ist nicht mehr bestätigt. Den gespeicherten Stand neu laden.';
    if (exportRequest) return 'Ein früherer Kopiervorgang ist noch offen. Zuerst seinen gespeicherten Stand abgleichen.';
    if (['inspect', 'page'].includes(action)) {
      if (action === 'page' && (dirty() || pendingDocumentChange)) return 'Den vorbereiteten Entwurf zuerst speichern oder bewusst verwerfen.';
      return '';
    }
    if (!processingComplete) return 'Der Lauf ist noch nicht abgeschlossen. Lesen ist möglich; Änderungen erst nach seinem Abschluss speichern.';
    if (!directResultsSupported) return 'Dieser ältere Lauf ist hier nur lesbar; eine neue Ergebnisbereitstellung ist nicht belegt.';
    if (publicDirectoryUnavailable()) return 'Der ursprüngliche Ergebnisordner ist nicht verfügbar. Private Dokumentstände bleiben lesbar; Änderungen und neue Bereitstellungen bleiben gesperrt.';
    if (publicationUnsettled()) return 'Der aktuelle Ergebnisstand ist noch nicht bestätigt. Zuerst „Bereitstellung erneut prüfen“ verwenden.';
    if (repairRequired() && !['select', 'mask', 'entities', 'restore', 'restore-save'].includes(action)) return repairInstructions;
    if (recoveryDraft) return 'Der erhaltene Korrekturentwurf muss zuerst mit dem gespeicherten Stand abgeglichen oder verworfen werden.';
    if (action === 'correct') return raw() && dirty() ? '' : 'Bitte den rechten Markdown-Text zuerst bearbeiten.';
    if (raw()) return 'Zusätzliche Maskierung und Behandlung gehören nur zum Anonymisierungsweg.';
    if (dirty()) return 'Den Korrekturentwurf zuerst speichern oder bewusst verwerfen.';
    if (action !== 'restore-save' && pendingDocumentChange) return 'Die vorbereitete Basis-Wiederherstellung zuerst bestätigen oder abbrechen.';
    if (action === 'mask') {
      if (entitySelected.size) return 'Die gewählte Behandlung zuerst speichern oder die Auswahl bewusst verwerfen.';
      if (!currentTextSelection()) return 'Im rechten aktuellen Ergebnistext vollständige Zeichen markieren. Eine Markierung links im Original genügt nicht.';
    }
    if (action === 'entities') {
      if (!entitySelected.size) return 'Mindestens eine erkannte Stelle auswählen; Häkchen allein speichern nichts.';
      if (entitySelected.size > 500) return 'Höchstens 500 unterschiedliche Werte gemeinsam behandeln.';
      if (!['default', 'keep', 'person', 'organization'].includes($('entities-decision').value)) return 'Die gewünschte Behandlung bewusst auswählen.';
      const scope = $('entities-scope').value;
      if (!['document', 'run'].includes(scope)) return 'Die Geltung der Behandlung auswählen.';
      if (scope === 'run' && (!detail.run_entity_review_available || [...entitySelected].some(id => entitySelectionFacts.get(id)?.run_eligible !== true)))
        return 'Für diese Auswahl ist keine gemeinsame laufweite Identität belegt. „Nur diese Datei“ wählen.';
    }
    if (action === 'restore' && entitySelected.size) return 'Die gewählte Behandlung zuerst speichern oder die Auswahl bewusst verwerfen.';
    if (action === 'restore-save' && (!pendingDocumentChange || !sameDocumentBinding(detail, pendingDocumentChange.row)))
      return 'Die vorbereitete Wiederherstellung passt nicht mehr zum angezeigten Stand.';
    return '';
  }
  function allowAction(action) {
    const reason = guardReason(action);
    if (!reason) return true;
    actionStatus(reason, true); status(reason, true); controls(); return false;
  }
  function currentTextSelection() {
    if (!textSelection || selectionOwner !== 'markdown' || !detailCurrent() || !sameDocumentBinding(detail, textSelection.row)) return null;
    const node = $('document-markdown');
    if (node.value !== markdownPositions?.display || node.selectionStart !== textSelection.start || node.selectionEnd !== textSelection.end) return null;
    try {
      const range = markdownPositions.backendRange(node.value, textSelection.start, textSelection.end);
      return range.start < range.end ? { ...textSelection, range } : null;
    } catch { return null; }
  }
  function captureTextSelection() {
    const node = $('document-markdown'); textSelection = null;
    if (selectionOwner === 'markdown' && detailCurrent() && node.selectionStart < node.selectionEnd) {
      try {
        markdownPositions.backendRange(node.value, node.selectionStart, node.selectionEnd);
        textSelection = { row: { ...detail }, start: node.selectionStart, end: node.selectionEnd,
          text: node.value.slice(node.selectionStart, node.selectionEnd) };
      } catch {}
    }
    controls();
  }
  function forgetTextSelection() { textSelection = null; selectionOwner = null; }
  const publicationUnsettled = () => ['pending', 'conflict'].includes(resultPublication?.state);
  const publicDirectoryUnavailable = () => resultPublication?.state === 'unavailable';
  const repairRequired = () => resultPublication?.state === 'repair_required';
  const repairInstructions = 'Mindestens ein gespeicherter Textstand benötigt eine sichere Nachbearbeitung. Links eine Datei öffnen und sensible Stellen bewusst maskieren, eine sichere Behandlung wählen oder den Basisstand ausdrücklich wiederherstellen. Es wird nichts automatisch geändert. Ergebnisöffnen und Bereitstellung bleiben bis zur vollständigen Reparatur gesperrt; frühere Ergebnisstände bleiben unverändert.';
  const repairRemaining = 'Änderung gespeichert. Weitere private Reparaturen sind nötig. Die übrigen Dateien vergleichen und sicher nachbearbeiten; noch kein neuer Ergebnisstand bereitgestellt. Frühere Ergebnisstände bleiben unverändert.';
  const repairDecision = action => repairRequired() && ['entities', 'redact', 'restore_base'].includes(action)
    ? { repair_binding: resultPublication.repair_binding } : {};
  async function publishCurrent(expected, ownership, connection) {
    if (expected !== batchId || ownership !== busyGeneration || connection !== connectionGeneration ||
        !busy || !stateFresh || !processingComplete || !directResultsSupported || publicDirectoryUnavailable() || repairRequired() || dirty() || exportRequest) throw Error('DOCUMENT_REVIEW_STALE');
    resultPublication = { state: 'pending' }; controls();
    status('Änderung gespeichert. Der vollständige aktuelle Ergebnisstand wird sicher bereitgestellt …');
    const result = await invoke('publish_result_documents', { batchId: expected });
    if (expected !== batchId || ownership !== busyGeneration || connection !== connectionGeneration) throw Error('STANDALONE_CONNECTION_CHANGED');
    if (result?.ok !== true || result.batch_id !== expected || result.local_ui_only !== true || result.external_disclosure !== false)
      throw Error('RESULT_PUBLICATION_INVALID');
    const current = publication(result.result_publication);
    if (current.state !== 'current' || !current.generation_id || current.count !== documents.length) throw Error('RESULT_PUBLICATION_INVALID');
    resultPublication = current;
    return current;
  }
  const detailCurrent = () => stateFresh && detail && documents.some(row => sameDocumentBinding(detail, row));
  const namespace = mode => mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
  const reasons = { DOCUMENT_REVIEW_STALE: 'Der Textstand hat sich geändert. Bitte neu laden und erneut prüfen.',
    DOCUMENT_TEXT_POSITION_INVALID: 'Die Textmarkierung oder Korrektur passt nicht eindeutig zum gespeicherten Textstand. Bitte die Datei neu öffnen und die vollständigen Zeichen erneut markieren; es wird keine andere Textstelle verwendet.',
    RESULT_PUBLICATION_INVALID: 'Die Änderung kann bereits gespeichert sein, aber der neue Ergebnisstand ist noch nicht bestätigt. Bereitstellung erneut prüfen; nichts blind nochmals ändern.',
    RESULT_PUBLICATION_CONFLICT: 'Der neue Ergebnisstand oder seine privaten Abschlussbelege konnten nicht sicher bestätigt werden. Die App entfernt oder überschreibt nichts. Bereits bereitgestellte Dateien dürfen extern bearbeitet werden; solche Änderungen werden nicht in den privaten Prüfstand übernommen. Den gespeicherten Stand prüfen, nichts blind nochmals ändern.',
    RESULT_DIRECTORY_UNAVAILABLE: 'Der frühere Ergebnisordner ist nicht mehr sicher erreichbar. Private Änderungen bleiben gespeichert. Es wird kein Ersatzordner übernommen oder früherer Ordner neu angelegt; nichts blind nochmals ändern.',
    STANDALONE_IPC_BUSY: 'DataSecure bearbeitet noch einen anderen lokalen Vorgang. Diese Anfrage wurde noch nicht gesendet. Bitte den Abschluss abwarten und den gespeicherten Stand anschließend neu laden.',
    CONTENT_OPTIONS_BINDING_INVALID: 'Die Inhalts- oder OCR-Einstellungen passen nicht zum gespeicherten Prüfstand. Keine Freigabe oder neue Kopie wird daraus erzeugt. Bitte die Originaldateien für einen neuen Lauf auswählen.',
    CONTENT_OPTIONS_BINDING_MISSING: 'Der unveränderliche Nachweis der Inhalts- und OCR-Auswahl fehlt. Dieser Prüfstand wird nicht freigegeben. Bitte die Originaldateien für einen neuen Lauf auswählen.',
    DOCUMENT_REVIEW_UNAPPROVED: 'Mindestens ein ausgewählter Textstand ist nicht freigegeben.',
    DOCUMENT_REVIEW_INVALID: 'Der gespeicherte Prüfstand oder seine Entscheidungsnachweise sind nicht konsistent. Es wird keine Freigabe daraus übernommen. Bitte neu laden; bei erneutem Fehler die genannten Quelldateien neu verarbeiten.',
    DOCUMENT_REVIEW_LIMIT: 'Dieser Prüfstand überschreitet eine sichere Bearbeitungsgrenze. Bitte kleinere Änderungen oder weniger Dokumente gemeinsam bearbeiten.',
    DOCUMENT_REVIEW_CONFLICT: 'Diese Aktionskennung gehört bereits zu einem anderen gespeicherten Auftrag. Bitte den tatsächlichen Stand neu laden, nicht blind erneut senden.',
    DOCUMENT_REVIEW_MISSING: 'Für diesen Lauf ist kein gespeicherter Dokumentprüfstand verfügbar. Ältere Läufe werden nicht rückwirkend als geprüft behandelt.',
    DOCUMENT_ENTITY_UNAVAILABLE: 'Für diese Datei ist kein vollständig rückverfolgbarer Entitätenplan verfügbar. Textvergleich und zusätzliche Maskierung bleiben möglich.',
    DOCUMENT_ENTITY_INVALID: 'Die Entitätenentscheidung passt nicht zum aktuellen Textstand. Bitte die Datei neu laden.',
    DOCUMENT_ENTITY_RUN_UNAVAILABLE: 'Für diese Auswahl ist keine eindeutige laufweite Identität belegt. Bitte „Nur diese Datei“ wählen.',
    DOCUMENT_ENTITY_RUN_CONFLICT: 'Die Entitätenentscheidung konnte nicht sicher bestätigt werden. Die genannten Prüfstände und den gespeicherten Stand prüfen; nicht blind erneut speichern.',
    DOCUMENT_REVIEW_RESIDUAL_PII: 'Diese Fassung enthält mögliche personenbezogene Angaben oder unlesbare Zeichen. Die Freigabe ist nicht bestätigt. Bitte die Werte prüfen; bei unlesbarem Text eine lesbare Kopie der Quelldatei neu verarbeiten. Nicht weitergeben.',
    DOCUMENT_REVIEW_POLICY_CHANGED: 'Die gespeicherte Prüfung gehört zu einer älteren Datenschutzregel. Bitte diese Quelldatei mit der aktuellen Version neu verarbeiten.',
    AI_EXPORT_CONFLICT: 'Im Exportordner besteht ein Konflikt. Es wurde nichts überschrieben.',
    AI_EXPORT_CONFIGURATION_REQUIRED: 'Der Export wurde nicht gestartet: Für diesen Ordner fehlt die sichere native Ordnerbindung. Wähle hier „Ergebnisordner wählen/ändern“ und bestätige den Export danach erneut. Freigaben bleiben erhalten; alte Exporte werden nicht automatisch umgestellt.',
    AI_EXPORT_VOLUME_MISMATCH: 'Der Export wurde nicht gestartet: Der Ergebnisordner liegt auf einem anderen Laufwerk als der private DataSecure-Bereich. Wähle hier einen Ordner auf demselben Laufwerk und bestätige danach erneut. Es wird keine unsichere Kopieralternative verwendet.',
    AI_EXPORT_UNCERTAIN: 'Der Exportzustand ist nicht eindeutig bestätigt. „Export erneut abgleichen“ prüft denselben Auftrag. Bleibt der Zustand bestehen, kann „Auftrag nicht weiter verfolgen“ nur dann helfen, wenn DataSecure sicher belegt, dass noch keine Kopie veröffentlicht wurde. Andernfalls bleibt der Auftrag gesperrt: Diagnose öffnen, keine neue Kopie erzwingen. Vorhandene Ordner bleiben unverändert.',
    AI_EXPORT_INCOMPLETE: 'Der Export ist noch nicht bestätigt. Bitte denselben Export erneut abgleichen; keine Freigabe wurde zurückgenommen.',
    AI_EXPORT_INVALID: 'Der gespeicherte Exportauftrag oder sein Beleg ist nicht gültig. Bitte den Stand neu laden; keine neue Kopie automatisch anlegen.',
    DOCUMENT_EXPORT_NAME_INVALID: 'Mindestens ein ursprünglicher Dateiname ist plattformübergreifend nicht sicher verwendbar oder zu lang. Die ausgewählten Quelldateien prüfen und mit einem gültigen Basisnamen neu aufnehmen; es wird nichts stillschweigend umbenannt oder überschrieben.',
    AI_EXPORT_ABANDONED: 'Dieser unvollständige Export wurde ausdrücklich aufgegeben. Vorhandene Dateien bleiben unangetastet; für einen neuen Export die aktuellen Freigaben neu auswählen.',
    AI_EXPORT_ALREADY_COMPLETE: 'Der Export ist bereits abgeschlossen und kann nicht mehr aufgegeben werden. Bitte den Empfang derselben Kopie abgleichen.',
    STANDALONE_IDENTITY_MAPPING_MISSING: 'Die vertrauliche Zuordnung dieses gespeicherten Stands fehlt oder ist nicht lesbar. Es wird keine heutige Zuordnung als damaliger Stand ausgegeben. Bestehende Exportkopien bleiben davon getrennt.',
    STANDALONE_IDENTITY_MAPPING_INVALID: 'Die vertrauliche Zuordnung passt nicht zu den gespeicherten Dokumentständen oder wurde verändert. Sie wird nicht geöffnet. Bestehende Exportkopien werden dadurch nicht verändert.',
    STANDALONE_IDENTITY_PUBLICATION_FAILED: 'Die vertrauliche Zuordnung konnte nicht sicher gespeichert werden. Eine neue Exportkopie wurde deshalb noch nicht begonnen. Bitte den lokalen Speicher prüfen und denselben Auftrag abgleichen.',
    STANDALONE_BUSY: 'Ein anderer lokaler Vorgang ist aktiv. Bitte erneut versuchen.',
    STANDALONE_RESULT_OPEN_FAILED: 'Das Betriebssystem konnte den geprüften Exportordner nicht öffnen. Der Export wurde dadurch nicht verändert.',
    STANDALONE_RESULTS_MISSING: 'Der gespeicherte Exportordner ist nicht mehr vorhanden. Es wird keine neue Kopie automatisch angelegt.' };
  function status(text, error = false) { $('documents-status').textContent = text; $('documents-status').className = `notice${error ? ' error' : ''}`; }
  function actionStatus(text, error = false) { const node = $('document-action-status'); node.hidden = !text;
    node.textContent = text; node.className = `document-action-status${error ? ' error' : ''}`; }
  const quietText = (id, text) => { const node = $(id); if (node.textContent !== text) node.textContent = text; };
  const publicationRecovery = 'Die Änderung kann bereits gespeichert sein; der neue Ergebnisstand ist noch nicht bestätigt. ' +
    'Den gespeicherten Stand neu laden, ohne die fachliche Änderung erneut zu speichern. Unter Einstellungen das ursprüngliche Ergebnisziel, seine Identität und Zugriffsrechte prüfen. ' +
    'Danach „Bereitstellung erneut prüfen“ verwenden; dieser Lauf wird nicht auf einen anderen Ordner umgebunden. Keine neue Quellverarbeitung blind starten. Frühere Ergebnisdateien bleiben unverändert.';
  const publicationReasons = {
    AI_EXPORT_CONFIGURATION_REQUIRED: 'Die sichere native Bindung an das ursprüngliche Ergebnisziel fehlt. ' + publicationRecovery,
    AI_EXPORT_VOLUME_MISMATCH: 'Das gebundene Ergebnisziel und der private Arbeitsbereich liegen nicht auf einem kompatiblen Laufwerk. Es wird keine unsichere Kopieralternative verwendet. ' + publicationRecovery,
    AI_EXPORT_UNCERTAIN: 'Der Zustand der Ergebnisbereitstellung ist nicht eindeutig belegt. ' + publicationRecovery,
    AI_EXPORT_INCOMPLETE: 'Die Ergebnisbereitstellung ist noch nicht vollständig bestätigt. ' + publicationRecovery,
    AI_EXPORT_CONFLICT: 'Ein gebundener Ordner oder eine Datei steht im Konflikt. Nichts wird überschrieben oder als Ersatz übernommen. ' + publicationRecovery,
    AI_EXPORT_INVALID: 'Der gespeicherte Bereitstellungsauftrag oder sein Beleg ist nicht gültig. ' + publicationRecovery,
    RESULT_PUBLICATION_LEGACY: 'Dieser ältere Lauf unterstützt keine automatische Bereitstellung neuer Ergebnisstände. Eine Nachbearbeitung kann privat gespeichert sein; vorhandene Ergebnisdateien werden dadurch nicht aktualisiert oder erneut veröffentlicht. ' +
      'Den gespeicherten Stand und die vorhandenen Ergebnisdateien prüfen. Nicht blind erneut ändern, einen neuen Lauf starten oder einen anderen Zielordner zuweisen. Frühere Dateien bleiben unverändert.'
  };
  function showError(error, name = '', resultPublicationFailure = false, command = null) {
    let code = error?.code || error?.message || String(error);
    try {
      const value = JSON.parse(code); code = value.code || code;
      const details = value.details;
      if (code === 'DOCUMENT_EXPORT_NAME_INVALID' && details && Object.keys(details).sort().join(',') === 'selection_count,selection_files' &&
          Array.isArray(details.selection_files) && details.selection_files.length > 0 && details.selection_files.length <= 200 &&
          details.selection_count === details.selection_files.length && details.selection_files.every(row => row &&
            Object.keys(row).sort().join(',') === 'name,reason_code' && row.reason_code === code && typeof row.name === 'string' &&
            row.name.length > 0 && row.name.length <= 1024 && !/[:\\\p{Cc}]/u.test(row.name) && !row.name.startsWith('/') &&
            row.name.split('/').every(part => part && part !== '.' && part !== '..'))) name = details.selection_files.map(row => row.name).join(', ');
    } catch {}
    if (!/^[A-Z][A-Z0-9_]{2,80}$/u.test(code)) code = 'DOCUMENT_REVIEW_INVALID';
    // Only this explicit folder-opening failure is a neutral availability
    // observation. The same code from decisions, reads or publication remains
    // an error; no missing directory becomes new publication authority.
    if (code === 'RESULT_DIRECTORY_UNAVAILABLE' && command === 'open_history_results' && !resultPublicationFailure) {
      resultPublication = { ...(resultPublication || {}), state: 'unavailable' };
      status('Die Verarbeitung ist abgeschlossen. Der ursprüngliche Ergebnisordner ist nicht mehr sicher erreichbar. Private Dokumentstände bleiben lesbar; es wird kein Ersatzordner übernommen oder neu angelegt.');
      controls(); return;
    }
    const publicationReason = resultPublicationFailure && !exportRequest && !pendingMetadata && !knownExport ? publicationReasons[code] : null;
    status(`${name ? `${name}: ` : ''}${publicationReason || reasons[code] || 'Der lokale Prüfstand konnte nicht sicher bestätigt werden. Erneut laden; nicht blind freigeben.'} (${code})`, true);
  }
  function exportFolderError(error) {
    let code = error?.code || error?.message || String(error);
    try { code = JSON.parse(code).code || code; } catch {}
    return !pendingMetadata && !knownExport && ['AI_EXPORT_CONFIGURATION_REQUIRED', 'AI_EXPORT_VOLUME_MISMATCH'].includes(code);
  }
  const canLeaveCompletion = () => Boolean(batchId && !busy && !navigationDraft() &&
    (!loading || confirmedCopy?.batchId === batchId && !exportRequest));
  function controls() {
    const directoryUnavailable = publicDirectoryUnavailable(), needsRepair = repairRequired();
    const blocked = busy || !stateFresh, mutationBlocked = blocked || !processingComplete || !directResultsSupported || directoryUnavailable || publicationUnsettled();
    const shown = visibleDocuments(), rows = documents.filter(row => selected.has(row.document_id));
    const anotherCopy = completedCopyCount > 0 || confirmedCopy?.batchId === batchId;
    const selectedShown = shown.filter(row => selected.has(row.document_id));
    const all = shown.length > 0 && selectedShown.length === shown.length;
    const exportComplete = stateFresh && confirmedCopy?.batchId === batchId && confirmedCopy.selection.length === documents.length &&
      documents.every(row => confirmedCopy.selection.some(copy => row.document_id === copy.document_id &&
        row.revision === copy.revision && row.output_sha256 === copy.output_sha256));
    const completedHere = confirmedCopy?.batchId === batchId && !exportRequest && !busy;
    const currentCompletion = Boolean(batchId && stateFresh && !busy && !loading && processingComplete &&
      documents.length > 0 && !navigationDraft() && !pendingApproval);
    const hasHints = documentProblemCount > 0 || documentOmissionCount > 0 ||
      sourceNoticeFacts?.content_notice_count > 0 || sourceNoticeFacts?.content_notice_breakdown_complete === false;
    let completionTitle = '', completionText = '';
    if (completedHere) {
      const copied = confirmedCopy.selection.length;
      completionTitle = raw() ? 'Markdown-Kopie abgeschlossen' : 'Export abgeschlossen';
      completionText = `${copied} ausgewählte ${copied === 1 ? 'Datei wurde' : 'Dateien wurden'} lokal kopiert. Dieser Kopiervorgang ist bestätigt und wird nicht automatisch wiederholt. ${!stateFresh ? 'Der heutige Dokumentstatus wird getrennt neu geprüft; Änderungen bleiben bis dahin gesperrt. Das stellt diese bereits bestätigte Kopie nicht infrage.' : exportComplete ? 'Alle derzeit verfügbaren Dokumentstände dieses Laufs sind in dieser Kopie enthalten.' : 'Weitere Dateien oder spätere Textänderungen sind darin nicht automatisch enthalten und brauchen bei Bedarf eine neue Freigabe und Kopie.'} Im Verlauf kannst du Abschluss und Ausnahmen getrennt ansehen. Es erfolgte kein Upload.`;
    } else if (currentCompletion) {
      const unsettled = ['pending', 'conflict'].includes(resultPublication?.state);
      completionTitle = needsRepair ? 'Gespeicherte Anonymisierung sicher nachbearbeiten'
        : directoryUnavailable ? 'Verarbeitung abgeschlossen · Ergebnisordner nicht verfügbar'
        : unsettled ? resultPublication.state === 'conflict' ? 'Ergebnisbereitstellung nicht bestätigt' : 'Ergebnisstand wird abgeglichen'
        : raw() ? 'Umwandlung abgeschlossen' : 'Anonymisierungslauf abgeschlossen';
      if (hasHints) completionTitle += ' · mit Hinweisen';
      completionText = needsRepair ? `${documents.length} private Dokumentstände bleiben zum Vergleichen lesbar. ${repairInstructions}` : directoryUnavailable
        ? `Der Lauf verarbeitet keine weiteren Dateien. ${documents.length} private Dokumentstände bleiben lesbar. Der ursprüngliche Ergebnisordner ist nicht verfügbar; öffentliche Ergebnisdateien werden hier nicht als erreichbar bestätigt. Änderungen und neue Bereitstellungen bleiben gesperrt. Es wird kein Ersatzordner übernommen oder neu angelegt. Es erfolgte kein Upload.`
        : `Der Lauf verarbeitet keine weiteren Dateien. ${documents.length} ${documents.length === 1 ? 'Ergebnis ist' : 'Ergebnisse sind'} verfügbar. ` +
        (unsettled ? 'Der aktuelle Nachbearbeitungsstand ist noch nicht als Ergebnisdateien bestätigt. Bereitstellung erneut prüfen; frühere Ergebnisordner bleiben unverändert. '
          : 'Den Ergebnisordner öffnen und Markdown-Dateien dort auswählen oder weiterverwenden. Keine zusätzliche Freigabe oder Exportbestätigung nötig. Zusätzliche Betriebssystem-Metadaten sind nicht geprüft oder anonymisiert; nicht mit weitergeben. ') +
        (raw() ? 'Die Dateien sind nicht anonymisiert. ' : automatic() ? 'Bekannte unklare Fundstellen wurden automatisch maskiert, nicht manuell geprüft. ' : '') +
        (hasHints ? 'Hinweise und nicht verfügbare Quellen bleiben gesondert aufgeführt. Nicht verfügbare Quellen sind nicht in den Ergebnisdateien enthalten. ' : '') +
        'Es erfolgte kein Upload.';
    }
    $('documents-completion').hidden = !completionTitle;
    // Do not re-announce an unchanged result on selection/filter updates.
    if ($('documents-completion-title').textContent !== completionTitle) $('documents-completion-title').textContent = completionTitle;
    if ($('documents-completion-text').textContent !== completionText) $('documents-completion-text').textContent = completionText;
    $('documents-completion-history').disabled = !canLeaveCompletion();
    $('documents-completion-details').disabled = !canLeaveCompletion();
    window.__DATASECURE_RUN_GUIDE__?.documents({ batch_id: batchId, processing_mode: mode(), source: 'documents',
      ...(runPolicy ? { review_policy: runPolicy } : {}),
      ...(sourceNoticeFacts || {}),
      fresh: stateFresh, busy: busy || loading, ...(completedHere ? { confirmed_copy_count: confirmedCopy.selection.length } : {}),
      ...(resultPublication ? { result_publication: { ...resultPublication } } : {}),
      document_count: documents.length, approved_count: documents.filter(row => row.approved).length,
      has_modified_results: documents.some(row => row.text_modified === true || row.revision > 0 && row.text_modified !== false),
      problem_count: documentProblemCount, expected_omission_count: documentOmissionCount, processing_complete: processingComplete,
      automatically_approved_count: documents.filter(row => row.approval_basis === 'automatic' && row.approved).length,
      dirty: navigationDraft(), export_pending: Boolean(exportRequest), export_complete: exportComplete });
    $('documents-loading').hidden = Boolean(bulkReviewProgress) || !busy && !loading;
    $('documents-loading-text').textContent = loading ? 'Dokumente und Hinweise werden geladen …' : 'DataSecure verarbeitet den lokalen Vorgang …';
    $('documents-review-controls').hidden = Boolean(bulkReviewProgress);
    $('documents-approve-confirm').hidden = !pendingApproval || Boolean(bulkReviewProgress);
    $('documents-approve-proceed').disabled = blocked || directoryUnavailable || needsRepair || !pendingApproval || Boolean(exportRequest) || dirty();
    $('documents-approve-cancel').disabled = busy;
    $('documents-bulk-progress').hidden = !bulkReviewProgress;
    if (bulkReviewProgress) {
      $('documents-bulk-title').textContent = bulkReviewProgress.action === 'approve' ? 'Freigaben werden gespeichert' : 'Freigaben werden widerrufen';
      $('documents-bulk-count').textContent = `${bulkReviewProgress.done} von ${bulkReviewProgress.total} Entscheidungen bestätigt. Noch kein Export erstellt.`;
      $('documents-bulk-meter').max = bulkReviewProgress.total;
      $('documents-bulk-meter').value = bulkReviewProgress.done;
    }
    $('documents-view').setAttribute('aria-busy', String(busy || loading));
    $('documents-all').checked = all; $('documents-all').indeterminate = rows.length > 0 && !all;
    $('documents-filter-bar').hidden = !raw();
    $('documents-filter').value = raw() && contentNotices ? filterMode : 'all';
    $('documents-filter').disabled = blocked || navigationDraft() || Boolean(exportRequest) || !contentNotices;
    $('documents-all-label').textContent = raw() ? 'Alle angezeigten auswählen' : 'Alle auswählen';
    if (raw()) {
      const warned = contentNotices ? documents.filter(row => contentNotices.has(row.document_id)).length : 0;
      const edited = documents.filter(row => row.text_modified === true).length;
      const options = $('documents-filter').children;
      for (const [index, count] of [warned, edited, documents.length, documents.length - warned].entries())
        if (options[index]) options[index].textContent = `${['Mit Hinweisen', 'Nachbearbeitet', 'Alle Dateien', 'Ohne Hinweise'][index]} (${count})`;
      $('documents-filter-summary').textContent = contentNotices ?
        `${shown.length} von ${documents.length} verfügbar · ${edited} mit gespeicherter Korrektur. Ein fehlender Hinweis ist keine Garantie für fehlerfreien OCR-Text.` :
        'Dateibezogene Hinweise sind für diesen Lauf nicht sicher zuordenbar. Alle verfügbaren Dateien werden angezeigt.';
    }
    $('documents-reload').disabled = busy || loading || prepared() || dirty() && !recoveryDraft;
    // Closing a modal cannot cancel a native copy. Keep its progress and
    // eventual receipt visible until the operation has actually settled.
    $('document-export-close').disabled = busy && !dialogCompleted;
    $('documents-identity-reference').hidden = mode() !== 'markdown-and-anonymize';
    $('documents-identities').disabled = blocked || needsRepair || dirty() || Boolean(recoveryDraft) || !documents.length;
    $('documents-all').disabled = true;
    $('documents-selected').textContent = `${shown.length} angezeigt · ${documents.length} ${directoryUnavailable || needsRepair ? 'private Dokumentstände lesbar' : 'Ergebnisdateien verfügbar'}`;
    $('documents-approve').hidden = raw(); $('documents-revoke').hidden = raw();
    $('documents-approve').disabled = blocked || directoryUnavailable || needsRepair || dirty() || Boolean(exportRequest) || !rows.length; $('documents-revoke').disabled = blocked || directoryUnavailable || needsRepair || dirty() || Boolean(exportRequest) || !rows.length;
    if (!raw() && rows.length && rows.every(row => row.approved)) $('documents-approve').disabled = true;
    $('documents-approve').textContent = !raw() && rows.length && rows.every(row => row.approved) ? 'Auswahl bereits freigegeben' : 'Auswahl nur freigeben';
    $('documents-export').hidden = !exportRequest;
    // Hidden compatibility controls keep the old explicitly selected copy
    // transaction contract. The normal UI exposes no new copy selection.
    $('documents-export').disabled = blocked || directoryUnavailable || needsRepair || dirty() || !exportRequest && !rows.length;
    $('documents-export').textContent = exportRequest ? knownExport || pendingMetadata?.status === 'completed' ? 'Empfang erneut abgleichen' : pendingMetadata ? 'Export erneut abgleichen' : 'Export erneut versuchen' : raw() ? anotherCopy ? 'Weitere Markdown-Kopie speichern' : 'Zusätzliche Markdown-Kopie speichern' : anotherCopy ? 'Weitere Dateien exportieren' : 'Auswahl exportieren';
    $('documents-heading').textContent = needsRepair ? 'Gespeicherte Anonymisierung sicher nachbearbeiten' : raw() ? 'Markdown freiwillig nachbearbeiten · nicht anonymisiert' : 'Ergebnisse nachbearbeiten (optional)';
    if (!mode()) {
      $('documents-heading').textContent = loading ? 'Dokumentprüfstände werden geladen' : 'Dokumentprüfstände dieses Laufs';
      $('documents-purpose').textContent = loading
        ? 'Bitte warten: DataSecure gleicht die gespeicherten Dokumentstände lokal ab. Bis zum Abschluss sind keine Freigabe und kein Export möglich.'
        : 'Der Verarbeitungszweck ist nicht mehr belegbar. Daraus wird weder eine Anonymisierung noch eine Freigabe zur Weitergabe abgeleitet.';
      $('documents-export').textContent = 'Keine belegbare Exportauswahl';
      $('documents-export').disabled = true;
    }
    $('document-markdown-caption').textContent = needsRepair ? 'Privater gespeicherter Text (nur markieren)' : directoryUnavailable ? 'Privater gespeicherter Text (nur lesen)' : raw() ? 'Aktueller Markdown-Text (für Korrekturen bearbeitbar)' :
      mode() === 'markdown-and-anonymize' ? 'Aktueller Ergebnistext (nur markieren)' : 'Markdown-Text (Modus wird geladen)';
    $('documents-main-guide').hidden = true;
    $('documents-approval-extras').hidden = true;
    $('documents-purpose').textContent = !mode() ? loading ? 'Gespeicherte Dokumentstände werden geladen. Bitte warten.' : 'Der Verarbeitungszweck ist nicht bestätigt. Den gespeicherten Stand abgleichen.'
      : needsRepair ? repairInstructions
      : directoryUnavailable ? 'Die Verarbeitung ist abgeschlossen. Der ursprüngliche Ergebnisordner ist nicht verfügbar. Private Dokumentstände können gelesen und verglichen werden; Änderungen und neue Bereitstellungen bleiben gesperrt. Es wird nichts neu angelegt oder als Ersatz übernommen.'
      : stateFresh && !directResultsSupported ? 'Älterer Lauf: Dokumente und damalige Kopierbelege bleiben lesbar. Automatische Bereitstellung neuer Nachbearbeitungsstände ist für diesen Lauf nicht verfügbar. Deshalb hier keine weiteren Textänderungen speichern; vorhandene Ergebnisdateien bleiben unverändert. ' +
        (raw() ? 'Markdown enthält Originalinhalte und ist nicht anonymisiert.' : automatic() ? 'Bekannte unklare Fundstellen wurden automatisch maskiert, nicht manuell geprüft.' : '')
      : 'Die erzeugten Dateien liegen im Ergebnisordner. Zum freiwilligen Vergleichen den Dateinamen anklicken. Gespeicherte Änderungen werden ohne weitere Dateiauswahl oder Exportbestätigung als neuer Ergebnisstand bereitgestellt. ' +
        (raw() ? 'Markdown enthält Originalinhalte und ist nicht anonymisiert. ' : automatic() ? 'Bekannte unklare Fundstellen wurden automatisch maskiert, nicht manuell geprüft. ' : '') +
        'Originaldateien und frühere Ergebnisstände bleiben unverändert. DataSecure lädt nichts hoch.';
    const publicationBlocked = publicationUnsettled();
    $('documents-open-results').disabled = blocked || navigationDraft() || !processingComplete || !documents.length || publicationBlocked || directoryUnavailable || needsRepair;
    $('documents-publish').hidden = !publicationBlocked || !directResultsSupported;
    $('documents-publish').disabled = blocked || directoryUnavailable || needsRepair || navigationDraft() || !processingComplete || !directResultsSupported || Boolean(exportRequest);
    $('document-markdown').setAttribute('aria-label', $('document-markdown-caption').textContent);
    $('document-edit-hint').textContent = needsRepair ? repairInstructions : directoryUnavailable ? 'Der ursprüngliche Ergebnisordner ist nicht verfügbar. Du kannst die privaten Texte vergleichen, zwischen Dateien wechseln und den gespeicherten Stand neu laden. Änderungen und neue Bereitstellungen bleiben gesperrt.'
      : stateFresh && !directResultsSupported ? 'Dieser ältere Lauf ist hier nur lesbar. Eine neue automatische Ergebnisbereitstellung ist nicht belegt; vorhandene Dateien und alte Kopierbelege bleiben unverändert.'
      : raw() ? 'Du kannst den rechten Markdown-Text direkt bearbeiten. Die Datei ist nicht anonymisiert. „Markdown-Korrektur speichern“ speichert die Änderung und stellt danach den gesamten aktuellen Ergebnisstand bereit. Erst die Bestätigung beendet diesen Vorgang. Originaldateien und frühere Ergebnisstände bleiben unverändert.'
      : !detail ? 'Wähle links ein Dokument, um Original und anonymisierten Text freiwillig zu vergleichen. Die Ergebnisdateien benötigen keine weitere Freigabe oder Exportbestätigung.'
        : 'Der rechte Text ist schreibgeschützt. Eine sensible Stelle dort markieren und direkt darunter „Maskierung speichern“ wählen. Die Behandlung erkannter Stellen ist eine separate optionale Änderung. Danach wird der gesamte aktuelle Ergebnisstand bereitgestellt; keine zweite Dateiauswahl nötig.';
    $('document-save-correction').hidden = !raw(); $('document-discard-correction').hidden = !raw();
    $('document-save-correction').disabled = Boolean(guardReason('correct'));
    $('document-discard-correction').disabled = busy || !dirty();
    $('document-markdown').readOnly = !raw() || mutationBlocked || Boolean(recoveryDraft) || Boolean(exportRequest);
    $('document-extra-actions').hidden = raw() || !detailCurrent();
    $('document-restore-actions').hidden = raw() || !detail;
    $('document-mask-actions').hidden = raw() || !detail;
    $('document-redact').hidden = raw();
    const maskSelection = currentTextSelection(), maskReason = guardReason('mask');
    $('document-redact').disabled = Boolean(maskReason);
    quietText('document-mask-reason', maskReason || `${maskSelection.text.length} Zeichen in dieser Datei ausgewählt. Nur diese Stelle wird beim Speichern durch [MANUAL_REDACTION] ersetzt.`);
    $('document-mask-preview').hidden = !maskSelection;
    if ($('document-mask-preview').value !== (maskSelection?.text || '')) $('document-mask-preview').value = maskSelection?.text || '';
    $('document-restore').disabled = Boolean(guardReason('restore'));
    $('document-change-confirm').hidden = !pendingDocumentChange;
    $('document-change-save').disabled = Boolean(guardReason('restore-save'));
    $('document-change-cancel').disabled = busy;
    $('documents-back').disabled = busy || navigationDraft();
    const hasDraft = navigationDraft();
    $('document-draft-controls').hidden = !prepared();
    $('document-discard-draft').disabled = busy;
    quietText('document-draft-reason', pendingDocumentChange ? 'Basis-Wiederherstellung vorbereitet, noch nicht gespeichert. Bestätigen oder abbrechen; Dateiwechsel und Neuladen halten diesen Entwurf fest.'
      : `${entitySelected.size} erkannte Werte ausgewählt, noch nicht gespeichert. Behandlung wählen und speichern oder die Auswahl bewusst verwerfen. Die Auswahl bleibt beim Fundstellenseitenwechsel erhalten.`);
    $('document-navigation-reason').hidden = !hasDraft;
    quietText('document-navigation-reason', hasDraft ? 'Ungespeicherter Entwurf: zuerst speichern oder ausdrücklich verwerfen, bevor du die Datei wechselst, neu lädst oder die Ansicht verlässt.' : '');
    $('document-export-confirm').disabled = blocked || directoryUnavailable || needsRepair;
    $('document-export-abandon').disabled = blocked || directoryUnavailable || needsRepair || !$('document-export-abandon-check').checked;
    $('document-recovery-draft').hidden = !recoveryDraft;
    $('document-recovery-text').value = recoveryDraft?.text || '';
    $('document-recovery-label').textContent = recoveryDraft ? `${recoveryDraft.name}: nicht bestätigter Korrekturentwurf (Ausgangsstand ${recoveryDraft.revision}). Der Text bleibt hier erhalten; bei abweichendem gespeicherten Stand bitte vergleichen und benötigte Änderungen kopieren.` : '';
    $('document-recovery-discard').disabled = busy;
    const position = shown.findIndex(row => row.document_id === detail?.document_id);
    $('document-position').textContent = position < 0 ? '' : `${position + 1} von ${shown.length} angezeigten Dateien`;
    $('document-previous').disabled = blocked || hasDraft || position <= 0;
    $('document-next').disabled = blocked || hasDraft || position < 0 || position >= shown.length - 1;
    for (const node of documentControls) node.disabled = blocked || hasDraft;
    const treatmentReason = guardReason('entities'), readingReason = guardReason('inspect'), selectionReason = guardReason('select'), pageReason = guardReason('page');
    $('entities-apply').disabled = Boolean(treatmentReason);
    const selectable = entityRows.filter(row => !row.disabled), chosen = selectable.filter(row => entitySelected.has(row.entity_id));
    $('entities-all').disabled = Boolean(selectionReason) || !selectable.length;
    $('entities-all').checked = selectable.length > 0 && chosen.length === selectable.length;
    $('entities-all').indeterminate = chosen.length > 0 && chosen.length < selectable.length;
    $('entities-decision').disabled = mutationBlocked || Boolean(exportRequest) || Boolean(pendingDocumentChange);
    $('entities-scope').disabled = mutationBlocked || Boolean(exportRequest) || Boolean(pendingDocumentChange);
    const runOption = $('entities-scope').children[1];
    if (runOption) runOption.disabled = !detail?.run_entity_review_available || [...entitySelected].some(id => entitySelectionFacts.get(id)?.run_eligible !== true);
    $('entities-count').textContent = `${entitySelected.size} ausgewählt (über alle Fundstellenseiten, höchstens 500) · ${detail?.entity_count || 0} unterschiedliche Werte in dieser Datei`;
    quietText('entities-reason', treatmentReason || ($('entities-scope').value === 'run'
      ? 'Die gewählte Behandlung gilt für belegte gleiche Identitäten auch in anderen Dateien dieses Laufs. „Originalwert beibehalten“ kann echte personenbezogene Angaben sichtbar machen.'
      : 'Die gewählte Behandlung gilt nur für diese Datei. „Originalwert beibehalten“ kann echte personenbezogene Angaben sichtbar machen.') +
      ' Auch dabei gelten die Schutzprüfungen für ausdrücklich beschriftete Namensfelder.');
    $('entities-pagination').hidden = entityPages <= 1;
    $('entities-previous').disabled = Boolean(pageReason) || entityPage <= 0; $('entities-next').disabled = Boolean(pageReason) || entityPage >= entityPages - 1;
    quietText('entities-pagination-reason', pageReason || (entityPages > 1 ? 'Nur Fundstellenseiten wechseln; noch nichts speichern. Deine Auswahl bleibt erhalten.' : 'Alle erkannten Stellen stehen auf dieser Seite.'));
    for (const { node, row, checkbox } of entityControls) { node.disabled = Boolean(checkbox ? selectionReason : readingReason) || row.disabled; if (checkbox) node.checked = entitySelected.has(row.entity_id); }
    for (const node of receiptControls) node.disabled = blocked || needsRepair;
  }
  function clearText() { pendingDocumentChange = null; $('document-change-confirm').hidden = true; $('document-extra-actions').open = false; $('document-restore-actions').open = false;
    detail = null; loadedMarkdown = ''; markdownPositions = null; originalPositions = null; forgetTextSelection();
    $('document-original').value = ''; $('document-markdown').value = ''; actionStatus('');
    entityRows = []; entitySelected.clear(); entitySelectionFacts.clear(); entityPage = 0; entityPages = 1; entityControls = [];
    $('entities-decision').value = ''; $('entities-scope').value = 'document';
    $('entities-list').replaceChildren(); $('document-entities').hidden = true;
    $('document-name').textContent = 'Dokument auswählen'; $('document-revision').textContent = ''; controls(); }
  async function openIdentities(operation) {
    if (busy || !stateFresh || repairRequired() || !batchId || dirty() || recoveryDraft ||
        !operation && (mode() !== 'markdown-and-anonymize' || !documents.length)) return;
    const expected = batchId; const ownership = ++busyGeneration; busy = true; controls();
    try {
      const result = await invoke('open_document_identity_overview', { batchId: expected, ...(operation ? { operationId: operation } : {}) });
      if (expected !== batchId) return;
      if (result?.ok !== true || result.handoff_confirmed !== true || result.external_disclosure !== false) throw Error('DOCUMENT_REVIEW_INVALID');
      status(operation ? 'Die vertrauliche Zuordnung genau dieses Exports wurde zum Öffnen übergeben. Spätere Änderungen verändern sie nicht. Nicht weitergeben.' :
        'Die vertrauliche Zuordnung der verfügbaren gespeicherten Dokumentstände wurde zum Öffnen übergeben. Das ist keine Freigabe und kein Export. Nicht weitergeben.');
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
      const item = make('li'), label = `Beleg für abgeschlossene Kopie (${row.exported_count} Datei${row.exported_count === 1 ? '' : 'en'}): ${namespace(row.processing_mode)} → ${row.folder_name}${row.processing_mode === 'markdown-only' ? ' · nicht anonymisiert' : ''}. Aktuelle Verfügbarkeit erst beim Öffnen geprüft.`;
      const open = make('button', 'Exportordner öffnen'); open.setAttribute('aria-label', `${row.folder_name} öffnen`);
      open.addEventListener('click', async () => {
        if (busy || !stateFresh || repairRequired() || !batchId) return;
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
  const exportSuccess = result => `${result.exported_count} Datei${result.exported_count === 1 ? '' : 'en'} ${result.processing_mode === 'markdown-only' ? 'als zusätzliche Markdown-Kopie gespeichert' : 'exportiert'}: Ergebnisordner → ${namespace(result.processing_mode)} → ${result.folder_name}. ${result.processing_mode === 'markdown-only' ? 'Die ursprünglichen Markdown-Dateien sind unverändert; die Kopie enthält Originalinhalte und ist nicht anonymisiert.' : 'Nur neutrale Markdown-Dateien; keine privaten Begleitdaten.'} Dieser Export ist abgeschlossen; bitte nicht erneut ausführen, sofern du nicht ausdrücklich eine weitere Kopie benötigst.`;
  function render() {
    const list = $('documents-list'); list.replaceChildren(); documentControls = [];
    for (const row of visibleDocuments()) {
      const item = make('div', undefined, `document-row${detail?.document_id === row.document_id ? ' active' : ''}`);
      const check = make('input'); check.type = 'checkbox'; check.checked = selected.has(row.document_id); check.disabled = busy || !stateFresh || Boolean(exportRequest);
      check.setAttribute('aria-label', `${row.name} auswählen`); check.addEventListener('change', () => {
        if (busy || !stateFresh || exportRequest) return; check.checked ? selected.add(row.document_id) : selected.delete(row.document_id); controls(); });
      const info = make('div'), show = make('button', row.name); show.disabled = busy || !stateFresh;
      show.setAttribute('aria-label', `${row.name}: ${raw() && !publicDirectoryUnavailable() ? 'vergleichen und korrigieren' : 'vergleichen'}`);
      show.addEventListener('click', () => loadDetail(row));
      documentControls.push(show);
      info.append(show, make('p', `${currentTextState(row)} · Stand ${row.revision}`, 'meta'));
      if (raw() && (contentNotices?.has(row.document_id) || row.text_modified === true)) {
        const flags = make('div', undefined, 'document-flags');
        if (contentNotices?.has(row.document_id)) flags.append(make('span', noticeExplanation(contentNotices.get(row.document_id)), 'warning'));
        if (row.text_modified === true) flags.append(make('span', 'Korrektur gespeichert'));
        info.append(flags);
      }
      // File selection for an extra copy is no longer part of the app's
      // normal workflow. Entity-treatment selections remain independent.
      check.hidden = true;
      item.append(check, info); list.append(item);
    }
    if (!visibleDocuments().length) list.append(make('p', documents.length && raw() && contentNotices ?
      filterMode === 'notices' ? 'Keine verfügbaren Dateien mit Inhaltshinweisen. Für einen freiwilligen Vergleich „Alle Dateien“ wählen.' :
      filterMode === 'edited' ? 'Noch keine gespeicherte Markdown-Korrektur. Andere Dateien über „Mit Hinweisen“ oder „Alle Dateien“ öffnen.' :
      'Keine Dateien in dieser Ansicht.' : 'Keine verfügbaren Dokumentprüfstände.', 'meta'));
    controls();
  }
  function renderUnavailable(data) {
    const missing = data.unavailable || [], unknown = data.unclassified_documents || [], rejected = data.not_processed_documents || [], knownDocuments = data.documents || [];
    const fileReasons = { SOURCE_FORMAT_UNSUPPORTED: 'Dieses Dateiformat wird nicht unterstützt.',
      SOURCE_TYPE_MISMATCH: 'Dateiendung und Dateiinhalt passen nicht zusammen.', SOURCE_ENCRYPTED_UNSUPPORTED: 'Die Datei ist verschlüsselt, passwort- oder rechtegeschützt. Eine berechtigt entschlüsselte Kopie separat auswählen; Schutzrechte werden nicht umgangen.',
      SOURCE_POLYGLOT_UNSUPPORTED: 'Die Datei enthält widersprüchliche Formatstrukturen.', SOURCE_CONTAINER_CORRUPT: 'Der Dateicontainer ist beschädigt oder unvollständig.',
      SOURCE_CONTAINER_LIMIT: 'Der Dateicontainer überschreitet eine sichere Verarbeitungsgrenze.', SOURCE_ACTIVE_CONTENT_UNSUPPORTED: 'Die Datei enthält nicht unterstützte aktive Inhalte.',
      SOURCE_TEXT_INVALID: 'Der Text konnte nicht sicher dekodiert werden.', SOURCE_COMPOUND_BINARY_UNSUPPORTED: 'Dieses ältere Binärformat wird nicht unterstützt.',
      SOURCE_FORMAT_NOT_RELEASED: 'Dieses Format ist für die lokale Verarbeitung nicht freigegeben.',
      PARSE_FAILED: 'Der Dateiinhalt konnte nicht vollständig gelesen werden. Die Quelldatei in der Ursprungsanwendung prüfen und eine neue Kopie auswählen.',
      SOURCE_READ_FAILED: 'Die Datei konnte nicht gelesen werden. Den lokalen Lesezugriff prüfen.',
      MARKDOWN_CONTENT_TRANSFORM_FAILED: 'Die Markdown-Bildsyntax konnte nicht sicher in reinen Text umgewandelt werden. Die Originaldatei bleibt unverändert.',
      SOURCE_IDENTITY_CHANGED: 'Die Datei hat sich seit der Auswahl verändert. Eine unveränderte Kopie neu auswählen.',
      CONVERSION_EXECUTABLE_MISSING: 'Eine Konvertierungskomponente fehlt. Das vollständige App-Paket neu entpacken.',
      CONVERSION_EXECUTABLE_DENIED: 'Das Betriebssystem hat den Start der Konvertierung verweigert. Mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
      CONVERSION_TIMEOUT: 'Die Konvertierung hat die sichere Zeitgrenze überschritten.',
      LOCAL_REVIEW_TOO_LARGE: 'Die lokale Prüfgrenze wurde überschritten. Das Dokument in kleinere Teile aufteilen.',
      RESIDUAL_PII: 'Die abschließende Prüfung hat mögliche personenbezogene Inhalte oder unlesbare Zeichen gefunden. Eine lesbare Kopie der Quelldatei prüfen und neu verarbeiten.',
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
    let feedback = data.processing_mode === 'markdown-only' && window.__DATASECURE_PRESENTATION__?.validateConversionFeedback(data.conversion_feedback);
    if (feedback && (unknown.length || feedback.result_count !== knownDocuments.length + missing.length ||
        feedback.not_converted_count !== rejected.length || feedback.selected_count !== knownDocuments.length + missing.length + rejected.length)) feedback = null;
    const omitted = rejected.filter(row => row.classification === 'ocr_omission' &&
      ['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(row.reason_code));
    const verifiedOmissions = data.processing_mode === 'markdown-and-anonymize' ? omitted :
      feedback && !feedback.ocr_enabled && omitted.length === feedback.ocr_omitted_count ? omitted : [];
    const privacyStops = rejected.filter(row => row.classification === 'privacy_stop' &&
      ['AMBIGUITY_REVIEW_REQUIRED', 'RESIDUAL_PII'].includes(row.reason_code));
    const errors = rejected.filter(row => !verifiedOmissions.includes(row) && !privacyStops.includes(row));
    const group = (title, values, tone, explain) => {
      if (!values.length) return;
      const container = make('details', undefined, `file-notice-group ${tone}`);
      container.append(make('summary', `${title} (${values.length})`));
      for (const row of values) {
        const item = make('details', undefined, 'file-notice');
        item.append(make('summary', row.name || `Dokument ${row.document_id.slice(0, 8)}`), make('p', explain(row)));
        const advice = window.__DATASECURE_PRESENTATION__?.failureAdvice(row.reason_code);
        if (advice) item.append(make('p', `Was kann ich tun? ${advice}`, 'meta'));
        if (row.reason_code) item.append(make('code', row.reason_code));
        container.append(item);
      }
      panel.append(container);
    };
    group('Ohne OCR nicht umgewandelt', verifiedOmissions, 'warning', () => 'OCR war für diesen Lauf ausgeschaltet. Kein technischer Konvertierungsfehler. Für diese Bild- oder Scan-Datei wurde kein Markdown erstellt; das Original bleibt unverändert.');
    group('Aus Datenschutzgründen angehalten', privacyStops, 'warning', row => `${reasonText(row.reason_code)} Für diese Datei gibt es keinen freigabefähigen Prüfstand und keinen Export; das Original bleibt unverändert.`);
    group('Dateien mit technischen Fehlern', errors, 'error', row => `${reasonText(row.reason_code)} Nicht verarbeitet; das Original bleibt unverändert.`);
    group('Nicht verfügbare Prüfstände', missing, 'error', row =>
      ['DOCUMENT_REVIEW_POLICY_CHANGED', 'DOCUMENT_REVIEW_RESIDUAL_PII', 'CONTENT_OPTIONS_BINDING_INVALID', 'CONTENT_OPTIONS_BINDING_MISSING'].includes(row.reason_code)
        ? `Freigabe nicht bestätigbar: ${reasons[row.reason_code]} Kein Export dieses Prüfstands.`
        : 'Dokumentprüfstand fehlt oder ist nicht lesbar. Keine Freigabe oder Export aus diesem Prüfstand möglich.');
    group('Früherer Status unklar', unknown, 'warning', () => 'Früherer Ergebnisstatus nicht mehr belegbar. Die Quelldatei kann auch technisch gestoppt worden sein; keine erfolgreiche Verarbeitung oder Freigabe ableitbar.');
    documentOmissionCount = verifiedOmissions.length;
    documentProblemCount = missing.length + unknown.length + privacyStops.length + errors.length;
    sourceCount = knownDocuments.length + missing.length + unknown.length + rejected.length;
    unavailableSourceCount = missing.length + unknown.length + rejected.length;
    unavailableReviewCount = missing.length + unknown.length;
    omissionSourceCount = verifiedOmissions.length;
    privacyStopCount = privacyStops.length;
  }
  async function reload() {
    const expected = batchId, request = ++ticket;
    forgetTextSelection();
    pendingDocumentChange = null; $('document-change-confirm').hidden = true;
    loading = true; stateFresh = false; controls();
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
    if (data.processing_complete !== undefined && typeof data.processing_complete !== 'boolean' ||
        data.processing_mode !== undefined && data.processing_mode !== null &&
        !['markdown-only', 'markdown-and-anonymize'].includes(data.processing_mode) ||
        data.processing_mode && data.documents.some(row => row.processing_mode !== data.processing_mode)) throw Error('DOCUMENT_REVIEW_INVALID');
    const nextMode = data.processing_mode || data.documents[0]?.processing_mode || data.pending_exports?.[0]?.processing_mode || null;
    if (runMode && nextMode && runMode !== nextMode) {
      selected.clear(); clearText(); throw Error('DOCUMENT_REVIEW_INVALID');
    }
    runMode = nextMode;
    if (data.review_policy !== undefined && (data.review_policy !== 'automatic-conservative' || nextMode !== 'markdown-and-anonymize') ||
        data.documents.some(row => (row.review_policy || null) !== (data.review_policy || null)) ||
        runPolicy && data.review_policy !== runPolicy) throw Error('DOCUMENT_REVIEW_INVALID');
    runPolicy = data.review_policy || null;
    directResultsSupported = data.result_publication !== undefined;
    resultPublication = data.result_publication === undefined
      ? data.documents.some(row => row.text_modified === true || row.revision > 0 && row.text_modified !== false) ? { state: 'pending' } : null
      : publication(data.result_publication);
    if (resultPublication?.count !== undefined && resultPublication.count !== data.documents.length)
      throw Error('DOCUMENT_REVIEW_INVALID');
    if (repairRequired() && nextMode !== 'markdown-and-anonymize') throw Error('DOCUMENT_REVIEW_INVALID');
    processingComplete = data.processing_complete === true;
    if (runMode && data.pending_exports?.some(row => row.processing_mode !== runMode)) throw Error('AI_EXPORT_INVALID');
    renderUnavailable(data);
    // A checkbox and a visible comparison belong to one proven revision, not
    // just a stable document ID. A refreshed list must not grant a new version
    // the previous selection's approval intent or leave an old text visible.
    const previousDocuments = new Map(documents.map(row => [row.document_id, row]));
    const previousName = detail?.name;
    const comparisonInvalidated = detail && !data.documents.some(row => sameDocumentBinding(detail, row));
    documents = data.documents;
    viewedBindings = new Map([...viewedBindings].filter(([id, binding]) =>
      documents.some(row => row.document_id === id && sameDocumentBinding(binding, row))));
    pendingApproval = null;
    const feedback = nextMode === 'markdown-only' && window.__DATASECURE_PRESENTATION__?.validateConversionFeedback(data.conversion_feedback);
    const noticed = data.content_notices;
    const released = [...documents, ...(data.unavailable || [])];
    sourceNoticeFacts = nextMode === 'markdown-and-anonymize' ? {
      result_count: released.length, content_notice_count: data.content_notice_count,
      content_notice_breakdown_complete: data.content_notice_breakdown_complete } : null;
    const validNotices = feedback && Array.isArray(noticed) && noticed.length === feedback.content_notice_count &&
      feedback.result_count === released.length && feedback.not_converted_count === (data.not_processed_documents || []).length &&
      feedback.selected_count === released.length + (data.not_processed_documents || []).length &&
      new Set(noticed.map(row => row?.document_id)).size === noticed.length && noticed.every(row => row &&
        /^[a-f0-9]{32}$/u.test(row.document_id) && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 1024 &&
        Array.isArray(row.reason_codes) && row.reason_codes.length <= 32 &&
        row.reason_codes.every(code => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(code)) &&
        released.some(value => value.document_id === row.document_id && (!value.name || value.name === row.name)));
    contentNotices = validNotices ? new Map(noticed.map(row => [row.document_id, row.reason_codes])) : null;
    if (!contentNotices) filterMode = 'all';
    selected = new Set([...selected].filter(id => documents.some(row => row.document_id === id &&
      sameDocumentBinding(previousDocuments.get(id), row))));
    if (comparisonInvalidated) clearText();
    else if (detail) {
      detail = { ...documents.find(row => sameDocumentBinding(detail, row)) };
      $('document-name').textContent = detail.name;
      $('document-revision').textContent = `Stand ${detail.revision} · ${raw() ? currentTextState(detail) : approvalLabel(detail)}`;
    }
    if (!exportRequest && data.pending_exports?.length) {
      const pending = data.pending_exports[0];
      exportRequest = { batchId: expected, operationId: pending.operation_id, selection: pending.selection };
      pendingMetadata = pending;
      selected = new Set(pending.selection.map(row => row.document_id));
    }
    if (exportRequest) pendingMetadata = data.pending_exports?.find(row => row.operation_id === exportRequest.operationId) || pendingMetadata;
    if (detail && !visibleDocuments().some(row => row.document_id === detail.document_id)) clearText();
    renderReceipts(data.export_receipts || []);
    completedCopyCount = data.export_receipts?.length || 0;
    stateFresh = true;
    render();
    if (exportRequest) status(pendingMetadata || knownExport
      ? 'Ein früherer Export wurde noch nicht bestätigt. „Export erneut abgleichen“ prüft genau diese gespeicherte Auswahl. Es wird kein neuer Export automatisch gestartet.'
      : 'Für diesen Export liegt noch kein bestätigter Beleg vor. Prüfe den Ergebnisordner und versuche denselben Auftrag nur ausdrücklich erneut; es wird nichts automatisch kopiert.');
    else if (data.unavailable?.length) status(`Prüfstände nicht verfügbar: ${data.unavailable.map(row => row.name || `Dokument ${row.document_id.slice(0, 8)}`).join(', ')}. Diese Dateien können nicht freigegeben oder exportiert werden.`, true);
    else if (publicDirectoryUnavailable()) status('Die Verarbeitung ist abgeschlossen. Der ursprüngliche Ergebnisordner ist nicht verfügbar. Private Dokumentstände bleiben lesbar; Änderungen und neue Bereitstellungen bleiben gesperrt. Es wird nichts neu angelegt.');
    else if (repairRequired()) status(repairInstructions, true);
    else status(`${comparisonInvalidated ? `${previousName}: Der zuvor angezeigte Dokumentstand hat sich geändert oder ist nicht mehr verfügbar. Vergleich und betroffene Auswahl wurden zurückgesetzt; bitte den aktuellen Stand erneut öffnen. ` : ''}${documents.length} Markdown-Datei${documents.length === 1 ? '' : 'en'} verfügbar. ${publicationUnsettled() ? 'Die Bereitstellung des aktuellen Nachbearbeitungsstands ist noch nicht bestätigt. Frühere Ergebnisdateien bleiben unverändert. Bereitstellung erneut prüfen.' : raw() ? contentNotices ? `${visibleDocuments().length} in der aktuellen Ansicht. Inhaltshinweise stammen aus dem Verarbeitungslauf; eine gespeicherte Korrektur löst sie nicht automatisch auf.` : 'Dateibezogene Hinweise nicht sicher zuordenbar; alle Dateien werden angezeigt.' : 'Zum freiwilligen Vergleichen den Dateinamen anklicken. Die Ergebnisdateien benötigen keine weitere Auswahl, Freigabe oder Exportbestätigung.'}`);
    return true;
    } catch (error) { if (expected === batchId && request === ticket) { stateFresh = false; render(); } throw error; }
    finally { if (expected === batchId && request === ticket) { loading = false; controls(); } }
  }
  async function loadDetail(row) {
    if (!row) return;
    if (navigationDraft()) { status('Ungespeicherten Entwurf zuerst speichern oder ausdrücklich verwerfen. Die aktuelle Datei und Auswahl bleiben erhalten.', true); controls(); return; }
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
      const nextMarkdownPositions = window.__DATASECURE_TEXT_POSITIONS__.create(markdown);
      const nextOriginalPositions = window.__DATASECURE_TEXT_POSITIONS__.create(original);
      detail = { ...row }; loadedMarkdown = markdown;
      markdownPositions = nextMarkdownPositions; originalPositions = nextOriginalPositions;
      // Only the API/display value is LF-normalized. The stored text/hash and
      // every IPC range continue to address the exact original backend bytes.
      $('document-original').value = originalPositions.display; $('document-markdown').value = markdownPositions.display;
      $('entities-scope').value = 'document'; $('entities-decision').value = '';
      if (row.entity_review_available) await loadEntities(0, expected, request);
      viewedBindings.set(row.document_id, { ...row });
      $('document-name').textContent = row.name; $('document-revision').textContent = `Stand ${row.revision} · ${raw() ? currentTextState(row) : approvalLabel(row)}`;
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
    entityRows = data.entities; entityPage = page; entityPages = data.pages; entityControls = [];
    for (const value of entityRows) if (entitySelected.has(value.entity_id)) entitySelectionFacts.set(value.entity_id, { run_eligible: value.run_eligible === true });
    $('document-entities').hidden = false; $('entities-page').textContent = `Seite ${page + 1} von ${entityPages}`;
    $('entities-list').replaceChildren(...entityRows.map(value => {
      const tr = make('tr'), td = make('td'), check = make('input'); check.type = 'checkbox';
      check.setAttribute('aria-label', `${value.original} auswählen`); check.disabled = value.disabled;
      check.addEventListener('change', () => {
        if (value.disabled || !sameDocumentBinding(detail, row) || !allowAction('select')) { controls(); return; }
        selectEntities([value], check.checked);
      });
      entityControls.push({ node: check, row: value, checkbox: true }); td.append(check);
      const original = make('td'), inspect = make('button', value.original + (value.original_truncated ? ' …' : ''));
      inspect.addEventListener('click', () => {
        if (!allowAction('inspect') || !sameDocumentBinding(detail, row)) return;
        const markdown = $('document-markdown'), source = $('document-original');
        let outputRange, sourceRange;
        try {
          if (markdown.value !== markdownPositions?.display || source.value !== originalPositions?.display)
            throw Error('DOCUMENT_TEXT_POSITION_INVALID');
          outputRange = markdownPositions.displayRange(value.output_start, value.output_end);
          if (value.source_start !== undefined || value.source_end !== undefined)
            sourceRange = originalPositions.displayRange(value.source_start, value.source_end);
        } catch (error) { showError(error, row.name); return; }
        // Validate both complete ranges before changing either field's focus
        // or selection; a half-CRLF/surrogate coordinate never widens silently.
        markdown.focus(); markdown.setSelectionRange(outputRange.start, outputRange.end);
        if (sourceRange) source.setSelectionRange(sourceRange.start, sourceRange.end);
        selectionOwner = 'markdown'; captureTextSelection();
        status(`Ausgewählt: ${value.original}. ${value.count} Vorkommen in dieser Datei. Der Vergleich zeigt die erste Fundstelle.`);
      });
      entityControls.push({ node: inspect, row: value }); original.append(inspect, make('p', `${value.count} Vorkommen · ${value.kind}`, 'meta'));
      const planned = make('td', value.disabled ? 'Zusätzlich maskiert' : value.replacement);
      planned.setAttribute('data-label', 'Aktueller Ergebnistext');
      const state = make('td', value.disabled ? 'Gesperrt durch Textmaskierung' : value.decision === 'keep' ? 'Beibehalten · Prüfung nötig' : 'Ersetzt');
      state.setAttribute('data-label', 'Status'); tr.append(td, original, planned, state);
      return tr;
    })); controls();
  }
  async function changeEntityPage(delta) {
    if (!allowAction('page')) return;
    const next = entityPage + delta;
    if (![-1, 1].includes(delta) || next < 0 || next >= entityPages) { status('Alle erkannten Stellen dieser Fundstellenseite sind bereits sichtbar. Die Seitenbuttons speichern keine Behandlung.'); return; }
    const expected = batchId, connection = connectionGeneration, ownership = ++busyGeneration; busy = true; controls();
    try { await loadEntities(next, expected); } catch (error) {
      if (expected !== batchId || connection !== connectionGeneration || ownership !== busyGeneration) return;
      stateFresh = false; showError(error, detail?.name);
      $('documents-status').textContent += ' Die vorhandene Auswahl bleibt erhalten. Vor neuen Änderungen bewusst verwerfen und den gespeicherten Stand neu laden.'; }
    finally { if (expected !== batchId || connection !== connectionGeneration || ownership !== busyGeneration) return; busy = false; controls(); }
  }
  function selectEntities(values, checked) {
    const added = values.filter(row => !row.disabled && !entitySelected.has(row.entity_id));
    if (checked && entitySelected.size + added.length > 500) {
      status('Höchstens 500 unterschiedliche Werte gemeinsam behandeln. Die bisherige Auswahl bleibt erhalten.', true); controls(); return;
    }
    for (const row of values.filter(value => !value.disabled)) {
      if (checked) { entitySelected.add(row.entity_id); entitySelectionFacts.set(row.entity_id, { run_eligible: row.run_eligible === true }); }
      else { entitySelected.delete(row.entity_id); entitySelectionFacts.delete(row.entity_id); }
    }
    controls();
  }
  async function applyEntities() {
    if (!allowAction('entities')) return;
    const connection = connectionGeneration;
    const row = detail, expected = batchId, treatment = $('entities-decision').value;
    const scope = $('entities-scope').value;
    const repair = repairDecision('entities');
    const ownership = ++busyGeneration; busy = true; controls(); let updated, failure, publicationAttempted = false, furtherRepair = false;
    try {
      updated = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
        decision: { action: 'entities', revision: row.revision, output_sha256: row.output_sha256, ranges: [], operation_id: operationId(),
          entity_decisions: [...entitySelected].map(entity_id => ({ entity_id, decision: treatment })),
          ...(scope === 'run' ? { scope } : {}), ...repair } });
      if (expected !== batchId || connection !== connectionGeneration || ownership !== busyGeneration) return;
      const rejected = rejectedEntityDecision(updated);
      if (rejected) {
        const explanations = [];
        if (rejected.residual) explanations.push('Mögliche personenbezogene Angaben bleiben sichtbar. „Originalwert beibehalten“ nimmt ausdrücklich beschriftete Namensfelder nicht von der Schutzprüfung aus. Bitte eine sichere Ersetzung wählen.');
        if (rejected.policy) explanations.push('Die Datenschutzregel hat sich geändert. Bitte die genannten Quelldateien mit der aktuellen Version neu verarbeiten.');
        if (rejected.unavailable) explanations.push('Mindestens ein betroffener Prüfstand ist nicht bearbeitbar. Die genannten Dateien zuerst prüfen.');
        const message = `Behandlung nicht gespeichert; die Änderung wurde nicht übernommen. Der bisherige Stand bleibt erhalten. ${explanations.join(' ')} Betroffen: ${rejected.names}.`;
        actionStatus(message, true); status(message, true); updated = null; return;
      }
      if (!decisionAcknowledged(updated, row, 'entities')) throw Error('DOCUMENT_REVIEW_STALE');
      if (scope === 'run' && (updated.scope !== 'run' || !Number.isSafeInteger(updated.affected_count) ||
          updated.affected_count < 1 || updated.affected_count > 200)) throw Error('DOCUMENT_REVIEW_STALE');
      if (expected === batchId) {
        clearText(); await reload();
        if (expected !== batchId || connection !== connectionGeneration || ownership !== busyGeneration) return;
        furtherRepair = repairRequired();
        if (!furtherRepair) {
          if (repair.repair_binding && resultPublication?.state !== 'pending') throw Error('DOCUMENT_REVIEW_STALE');
          publicationAttempted = true; await publishCurrent(expected, ownership, connection);
        }
      }
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
      if (expected !== batchId || connection !== connectionGeneration) return;
      status(furtherRepair ? repairRemaining : scope === 'run' ? `Behandlung für ${updated.affected_count} Dateien gespeichert und aktueller Ergebnisstand bereitgestellt. Frühere Ergebnisstände bleiben unverändert.` :
        'Behandlung gespeichert und aktueller Ergebnisstand bereitgestellt. Ergebnisordner öffnen; keine weitere Freigabe oder Exportbestätigung nötig.'); }
    else if (failure && expected === batchId) {
      if (stateFresh) await loadDetail(documents.find(value => value.document_id === row.document_id));
      if (expected !== batchId || connection !== connectionGeneration) return;
      showError(failure, row.name, publicationAttempted);
      $('documents-status').textContent += stateFresh ? ' Die Bestätigung ist unklar; der gespeicherte Stand wurde erneut abgefragt. Bitte vor weiteren Änderungen vergleichen.' :
        ' Die Bestätigung ist unklar. Auch der aktuelle gespeicherte Stand konnte nicht abgefragt werden. Änderungen bleiben gesperrt; bitte „Gespeicherten Stand neu laden“ wählen.';
    }
  }
  async function decideRows(action, rows, ranges = []) {
    if (busy || publicationUnsettled() || publicDirectoryUnavailable() || !stateFresh || recoveryDraft || exportRequest || !batchId || !rows.length || dirty() && action !== 'correct') return;
    if (repairRequired() && !['redact', 'restore_base'].includes(action)) return;
    if ((!processingComplete || !directResultsSupported) && !['approve', 'revoke'].includes(action)) return;
    if (action === 'redact' && raw()) return;
    if (rows.some(row => !documents.some(current => sameDocumentBinding(row, current))) ||
        ['correct', 'redact', 'restore_base'].includes(action) && !detailCurrent()) return;
    const draft = action === 'correct' ? { ...detail, text: $('document-markdown').value } : null;
    const connection = connectionGeneration, repair = repairDecision(action);
    const expected = batchId; let failed, confirmed = 0, publicationAttempted = false; const updates = []; const ownership = ++busyGeneration;
    bulkReviewProgress = !raw() && ['approve', 'revoke'].includes(action) && rows.length > 1
      ? { action, total: rows.length, done: 0 } : null;
    busy = true; render(); status('Entscheidungen werden lokal gespeichert …');
    try {
      if (['approve', 'revoke'].includes(action) && rows.length > 1) {
        const results = await decideSelection(expected, action, rows);
        if (batchId !== expected || connection !== connectionGeneration || ownership !== busyGeneration) return;
        documents = documents.map(value => results.find(row => row.document_id === value.document_id) || value);
        confirmed = results.length; updates.push(...results);
        if (bulkReviewProgress) { bulkReviewProgress.done = confirmed; controls(); }
      } else for (const row of rows) {
        try { const result = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
          decision: { action, revision: row.revision, output_sha256: row.output_sha256, ranges, operation_id: operationId(), ...repair } });
          if (batchId !== expected || connection !== connectionGeneration || ownership !== busyGeneration) return;
          if (!decisionAcknowledged(result, row, action)) throw Error('DOCUMENT_REVIEW_STALE');
          // Only an exactly bound acknowledgement may advance a selection
          // across our own mutation. An unrelated reload never gets this grant.
          documents = documents.map(value => value.document_id === row.document_id ? { ...result } : value);
          confirmed++; updates.push(result);
          if (bulkReviewProgress) { bulkReviewProgress.done = confirmed; controls(); } }
        catch (error) { failed = { error, name: row.name }; throw error; }
      }
      if (batchId !== expected) return;
      exportRequest = null; clearText(); await reload();
      if (batchId !== expected || connection !== connectionGeneration || ownership !== busyGeneration) return;
      const furtherRepair = repairRequired();
      if (!['approve', 'revoke'].includes(action) && !furtherRepair) {
        if (repair.repair_binding && resultPublication?.state !== 'pending') throw Error('DOCUMENT_REVIEW_STALE');
        publicationAttempted = true; await publishCurrent(expected, ownership, connection);
      }
      status(furtherRepair ? repairRemaining : !['approve', 'revoke'].includes(action) ? `${rows[0].name}: Änderung gespeichert und aktueller Ergebnisstand bereitgestellt. Ergebnisordner öffnen; frühere Ergebnisstände bleiben unverändert.` :
        raw() && action === 'restore_base' ? `${rows[0].name}: Der technisch erzeugte Textstand wurde wiederhergestellt. Die ursprünglich erstellte Markdown-Datei bleibt unverändert.` :
          !raw() && action === 'approve' ? `${rows.length} Freigabeentscheidung${rows.length === 1 ? '' : 'en'} gespeichert. Die Dokumente können später weiter geprüft werden; durch diese Freigabe wurde kein neuer Export erstellt. Dafür die freigegebenen Stände auswählen und die Exportvorschau ausdrücklich öffnen.` :
          `${rows.length} Entscheidung${rows.length === 1 ? '' : 'en'} gespeichert. Ein Export erfolgt nur über den eigenen Exportbutton.`);
      return { batchId: expected, updates, repair_required: furtherRepair };
    } catch (error) { if (connection === connectionGeneration && batchId === expected) {
      for (const row of rows.slice(0, confirmed)) selected.delete(row.document_id);
      if (draft) recoveryDraft = draft;
      clearText(); await reload().catch(() => {}); showError(failed?.error || error, failed?.name || rows.map(row => row.name).join(', '), publicationAttempted);
      status(['approve', 'revoke'].includes(action) && rows.length > 1
        ? `Die gemeinsame Speicherbestätigung ist unklar. ${$('documents-status').textContent} Der gespeicherte Stand wurde erneut angefordert. Bitte vor einer weiteren Entscheidung den aktuellen Freigabestatus prüfen.`
        : `${confirmed} Entscheidung${confirmed === 1 ? '' : 'en'} bestätigt. ${$('documents-status').textContent} ${Math.max(0, rows.length - confirmed - 1)} weitere Dateien wurden noch nicht bearbeitet.`, true);
      if (draft) $('documents-status').textContent += ' Dein Korrekturentwurf bleibt erhalten; den gespeicherten Stand neu laden, bevor du weiterarbeitest.';
      if (!stateFresh) $('documents-status').textContent += ' Der aktuelle Stand konnte nicht abgefragt werden. Änderungen bleiben bis zum Neuladen gesperrt.';
    } }
    finally { if (batchId === expected) { if (ownership !== busyGeneration) return; busy = false; bulkReviewProgress = null; render(); } }
  }
  function requestApproval() {
    if (busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || raw() || exportRequest || dirty()) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (!rows.length) return;
    const notOpened = rows.filter(row => !sameDocumentBinding(viewedBindings.get(row.document_id), row)).length;
    if (!notOpened) { pendingApproval = null; void decideRows('approve', rows); return; }
    pendingApproval = { batchId, selection: rows.map(({ document_id, revision, output_sha256 }) =>
      ({ document_id, revision, output_sha256 })) };
    $('documents-approve-confirm-text').textContent = `${notOpened} von ${rows.length} ausgewählten Dokumentständen wurden in dieser Sitzung nicht zum Vergleich geöffnet. Die technische Anonymisierung ersetzt keine Sichtprüfung. Öffne sie zuerst, oder bestätige nur nach einer eigenen Prüfung außerhalb dieser Ansicht. Diese Freigabe erstellt noch keinen Export.`;
    controls();
    $('documents-approve-proceed').focus?.();
  }
  function confirmApproval() {
    const pending = pendingApproval;
    if (!pending || busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || raw() || exportRequest || dirty() || pending.batchId !== batchId ||
        !validSelection(pending.selection)) return;
    const rows = pending.selection.map(binding => documents.find(row => row.document_id === binding.document_id &&
      row.revision === binding.revision && row.output_sha256 === binding.output_sha256));
    if (rows.some(row => !row) || rows.length !== selected.size ||
        rows.some(row => !selected.has(row.document_id))) {
      pendingApproval = null; controls();
      status('Die Auswahl oder ein Dokumentstand hat sich geändert. Bitte neu vergleichen und die Freigabe erneut auswählen.', true);
      return;
    }
    pendingApproval = null; controls();
    void decideRows('approve', rows);
  }
  function renderExportDialog() {
    // A display reload may discover another durable intent. Keep this modal
    // bound to the copy it just confirmed until the user closes it.
    if (!dialogSelection || dialogCompleted) return;
    const isRaw = dialogMode === 'markdown-only', complete = Boolean(knownExport || pendingMetadata?.status === 'completed');
    const otherStops = unavailableSourceCount - omissionSourceCount - privacyStopCount;
    const unavailableReasons = [omissionSourceCount ? `${omissionSourceCount} ohne OCR` : '',
      privacyStopCount ? `${privacyStopCount} aus Datenschutzgründen angehalten` : '',
      otherStops ? `${otherStops} sonstige nicht verfügbare Prüfstände` : ''].filter(Boolean).join(' · ');
    const scope = unavailableSourceCount ? `Dieser Lauf umfasst ${sourceCount} Quelldateien; ${unavailableSourceCount} davon haben keinen verfügbaren Markdown-Prüfstand (${unavailableReasons}).` :
      `Dieser Lauf umfasst ${sourceCount} Quelldateien mit verfügbaren Markdown-Prüfständen.`;
    $('document-export-title').textContent = complete ? 'Empfang der fertigen Kopie bestätigen' : isRaw ? 'Markdown-Kopie speichern' : 'Dateien exportieren';
    $('document-export-purpose').textContent = isRaw ? `Nur ${dialogSelection.length === 1 ? 'diese eine ausgewählte Datei' : `diese ${dialogSelection.length} ausgewählten Dateien`} als zusätzliche Markdown-Kopie speichern. Bereits erzeugte Dateien bleiben unverändert. Nicht anonymisiert: Die Kopie enthält Originalinhalte.` :
      `Nur ${dialogSelection.length} ausgewählte Markdown-Textstände werden in einen separaten Exportordner kopiert. ${exportRequest ? 'Der gespeicherte Auftrag bleibt an seine bereits bestätigten Textstände gebunden.' : 'Mit der Exportbestätigung gibst du genau diese Textstände zur Verwendung frei; eine gesonderte Freigabe ist nicht nötig.'} ${automatic() ? 'Schnellweg: Die automatische Erstfreigabe ist keine menschliche Prüfung. ' : ''}Technische Schutzprüfungen bleiben aktiv, ersetzen aber keine fachliche Sichtprüfung. ${scope} Weitere verfügbare, aber nicht ausgewählte Dateien sind ebenfalls nicht Teil dieses Exports.`;
    $('document-export-target').textContent = `${dialogResultFolder || 'Ergebnisordner'} (Bindung beim Export geprüft) → ${namespace(dialogMode)} → ${exportRequest ? `Export-${exportRequest.operationId} (${pendingMetadata || knownExport ? 'gespeicherter Auftrag' : 'Bestätigung des Auftrags noch offen'})` : 'neuer Exportordner'}`;
    $('document-export-filenames-heading').textContent = isRaw ? 'Enthaltene Markdown-Dateien · gespeicherter Dateinamenplan' : 'Enthalten · neutrale Dateinamen';
    $('document-export-confirm').textContent = complete ? 'Empfang bestätigen' : exportRequest ? pendingMetadata ? 'Export erneut abgleichen' : 'Export erneut versuchen' : isRaw ? 'Kopie speichern' : 'Freigeben und exportieren';
    $('document-export-configure').hidden = !!pendingMetadata || !!knownExport || complete || !!exportRequest && !exportFolderNeeded;
    $('document-export-configure').disabled = busy || publicDirectoryUnavailable() || repairRequired();
    $('document-export-abandon-option').hidden = !pendingMetadata || complete;
    $('document-export-abandon').hidden = !pendingMetadata || complete;
    controls();
  }
  async function openExportDialog() {
    if (busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || dirty()) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (!exportRequest && !rows.length) return;
    dialogSelection = exportRequest ? exportRequest.selection.map(row => ({ ...row })) : rows.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
    dialogMode = pendingMetadata?.processing_mode || rows[0]?.processing_mode || (raw() ? 'markdown-only' : 'markdown-and-anonymize');
    const expected = batchId, connection = connectionGeneration;
    const ownership = ++busyGeneration; busy = true; render();
    if (dialogMode !== 'markdown-only' && !exportRequest) status(`Exportvorschau für ${dialogSelection.length} Datei${dialogSelection.length === 1 ? '' : 'en'} wird lokal geprüft. Es wird noch kein Export erstellt.`);
    try {
      const plan = await invoke('preview_document_export', { batchId: expected, operationId: exportRequest?.operationId || operationId(), selection: dialogSelection });
      if (expected !== batchId || connection !== connectionGeneration) return;
      if (plan?.ok !== true || plan.processing_mode !== dialogMode || plan.local_ui_only !== true || plan.external_disclosure !== false ||
          plan.result_folder != null && (typeof plan.result_folder !== 'string' || plan.result_folder.length > 32768 || /\p{Cc}/u.test(plan.result_folder)) ||
          !Array.isArray(plan.files) || plan.files.length !== dialogSelection.length || plan.files.some((file, index) =>
            typeof file.name !== 'string' || !file.name.endsWith('.md') || /[\p{Cc}/\\]/u.test(file.name) || file.sha256 !== dialogSelection[index].output_sha256))
        throw Error('AI_EXPORT_INVALID');
      $('document-export-files').replaceChildren(...plan.files.map(file => make('li', file.name)));
      dialogFiles = plan.files.map(file => ({ name: file.name, sha256: file.sha256 }));
      dialogResultFolder = plan.result_folder || null;
    } catch (error) { if (expected === batchId && connection === connectionGeneration) showError(error, rows.map(row => row.name).join(', ')); return; }
    finally { if (ownership === busyGeneration && expected === batchId) { busy = false; render(); } }
    if (!exportRequest) exportFolderNeeded = false;
    $('document-export-preview').hidden = false; $('document-export-result').hidden = true;
    $('document-export-confirm').hidden = false;
    $('document-export-close').textContent = 'Abbrechen';
    $('document-export-abandon-check').checked = false;
    dialogCompleted = false;
    renderExportDialog();
    if (!exportRequest && !knownExport && pendingMetadata?.status !== 'completed')
      status(`Exportvorschau geprüft. Noch keine neue Kopie erstellt. Erst „${$('document-export-confirm').textContent}“ erstellt die ausgewählte Kopie.`);
    dialogFocus = document.activeElement; $('document-export-dialog').showModal(); $('document-export-close').focus();
  }
  async function exportRows() {
    if (!stateFresh || publicDirectoryUnavailable() || repairRequired() || dirty() || !validSelection(dialogSelection)) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (busy || !batchId || !exportRequest && !rows.length) return;
    const connection = connectionGeneration;
    const expected = batchId;
    if (!exportRequest) {
      // This path is entered only by the explicit modal confirmation, never
      // by opening a preview, loading a document or selecting a checkbox.
      if (pendingMetadata || knownExport || !['markdown-only', 'markdown-and-anonymize'].includes(dialogMode) ||
          rows.some(row => row.processing_mode !== dialogMode) || !dialogFiles || rows.length !== dialogSelection.length ||
          dialogSelection.some(value => !rows.some(row => row.document_id === value.document_id &&
            row.revision === value.revision && row.output_sha256 === value.output_sha256))) { showError(Error('DOCUMENT_REVIEW_STALE')); return; }
      const ownership = ++busyGeneration; busy = true; render();
      $('document-export-configure').disabled = true;
      status('Die ausgewählten Textstände werden für den Export bestätigt und technisch geprüft …');
      try {
        const unapproved = dialogSelection.map(binding => documents.find(row => row.document_id === binding.document_id)).filter(row => !row.approved);
        const confirmed = unapproved.length ? await decideSelection(expected, 'approve', unapproved) : [];
        if (expected !== batchId || connection !== connectionGeneration) return;
        documents = documents.map(value => confirmed.find(row => row.document_id === value.document_id) || value);
        const prepared = [];
        for (const binding of dialogSelection) {
          const row = documents.find(row => row.document_id === binding.document_id);
          if (expected !== batchId || connection !== connectionGeneration) return;
          prepared.push({ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 });
        }
        const plan = await invoke('preview_document_export', { batchId: expected, operationId: operationId(), selection: prepared });
        if (expected !== batchId || connection !== connectionGeneration) return;
        if (plan?.ok !== true || plan.processing_mode !== dialogMode || plan.local_ui_only !== true || plan.external_disclosure !== false ||
            JSON.stringify(plan.files) !== JSON.stringify(dialogFiles) || (plan.result_folder || null) !== dialogResultFolder) throw Error('DOCUMENT_REVIEW_STALE');
        dialogSelection = prepared;
      } catch (error) {
        if (expected === batchId && connection === connectionGeneration) {
          clearText(); await reload().catch(() => {}); showError(error, rows.map(row => row.name).join(', '));
          $('documents-status').textContent += ' Durch diesen Vorgang wurde kein Export gestartet. Die Freigabe kann bereits gespeichert sein. Bitte den aktuellen Stand prüfen, die gewünschten Dateien erneut auswählen und eine neue Exportvorschau öffnen.';
          // Reload can discover a committed approval with newer revisions.
          // The old modal is no longer bound to the visible selection.
          if ($('document-export-dialog').open) $('document-export-dialog').close();
        }
        return;
      } finally { if (expected === batchId && ownership === busyGeneration) { busy = false; render(); if ($('document-export-dialog').open) renderExportDialog(); } }
    }
    if (!exportRequest) exportRequest = { batchId: expected, operationId: operationId(),
      selection: dialogSelection };
    const ownership = ++busyGeneration; busy = true; render();
    $('document-export-configure').disabled = true;
    status(`⚙ ${exportRequest.selection.length} ${exportRequest.selection.length === 1 ? 'Textstand wird' : 'Textstände werden'} lokal kopiert und geprüft. Das kann mehrere Minuten dauern; erst die Abschlussmeldung bestätigt die Kopie. Bitte nicht erneut starten.`);
    $('document-export-result').hidden = false; $('document-export-result').textContent = $('documents-status').textContent;
    // The user just confirmed this action. Keep its status reachable above the
    // long filename list, even when every mutation/close button is disabled.
    if ($('document-export-dialog').open) $('document-export-result').focus();
    stopExportHeartbeat();
    const request = exportRequest;
    const startedAt = monotonicNow();
    let observing = false, observed = null, receiptPhase = false;
    let lastHeartbeat = '';
    const active = () => exportHeartbeat === heartbeat && ownership === busyGeneration && expected === batchId &&
      connection === connectionGeneration && exportRequest === request && $('document-export-dialog').open;
    const announce = () => {
      if (!active()) return;
      const elapsed = Math.max(0, Math.floor((monotonicNow() - startedAt) / 1000));
      const duration = elapsed < 60 ? `${elapsed} Sekunden` : `${Math.floor(elapsed / 60)} ${elapsed < 120 ? 'Minute' : 'Minuten'} ${elapsed % 60} Sekunden`;
      // Polling is independent of the serial Core. Announce changed phases or
      // counts, but not the same waiting message every two seconds.
      const signature = JSON.stringify([receiptPhase, observed, Math.floor(elapsed / 10)]);
      if (signature === lastHeartbeat) return;
      lastHeartbeat = signature;
      const progress = receiptPhase ? 'Die Kopie ist bestätigt. DataSecure gleicht jetzt die Empfangsbestätigung ab.' : exportProgressText(observed);
      $('document-export-result').textContent = `Seit ${duration}: ${progress} Bitte keinen zweiten Export starten; erst die Abschlussmeldung beendet diesen Schritt.`;
    };
    const heartbeat = setInterval(() => {
      if (!active()) {
        if (exportHeartbeat === heartbeat) stopExportHeartbeat(); return;
      }
      announce();
      if (observing) return;
      observing = true;
      // This native snapshot never acquires the Core request lock. One
      // outstanding read at most; failure cannot restart or fail the export.
      invoke('get_native_recovery_status').then(snapshot => {
        if (!active()) return;
        observed = exportObservation(snapshot, request);
        announce();
      }).catch(() => { if (active()) { observed = null; announce(); } })
        .finally(() => { observing = false; });
    }, 2000);
    exportHeartbeat = heartbeat;
    try {
      const complete = Boolean(knownExport || pendingMetadata?.status === 'completed');
      const result = await invoke('export_approved_documents', complete ? { ...request, acknowledge: true } : request);
      if (expected !== batchId) return;
      if (result.ok !== true || result.operation_id !== request.operationId || result.exported_count !== request.selection.length ||
          (result.processing_mode || 'markdown-and-anonymize') !== dialogMode ||
          (dialogMode === 'markdown-only' && result.anonymized !== false) ||
          result.local_ui_only !== true || result.external_disclosure !== false ||
          !new RegExp(`^Export-${result.operation_id}(?:-(?:[2-9]|1[0-6]))?$`, 'u').test(result.folder_name)) throw Error('AI_EXPORT_INCOMPLETE');
      knownExport = result; status(exportSuccess(result));
      receiptPhase = true; observed = null; announce();
      // Receipt confirmation is separate from the copy operation. If either
      // response is lost, the durable intent is discoverable on the next open.
      const receipt = complete ? result : await invoke('export_approved_documents', { ...request, acknowledge: true });
      if (expected !== batchId) return;
      if (receipt.ok !== true || receipt.operation_id !== result.operation_id || receipt.exported_count !== result.exported_count ||
          receipt.folder_name !== result.folder_name || receipt.local_ui_only !== true || receipt.external_disclosure !== false)
        throw Error('AI_EXPORT_INCOMPLETE');
      // A slow display reload must not announce an unconfirmed copy after the
      // durable receipt has already been accepted.
      if (exportHeartbeat === heartbeat) stopExportHeartbeat();
      confirmedCopy = { batchId: expected, selection: request.selection.map(row => ({ ...row })) };
      completedExportReceipt = { connection, batch_id: expected, operation_id: result.operation_id,
        processing_mode: dialogMode, exported_count: result.exported_count, folder_name: result.folder_name,
        source: 'documents', local_ui_only: true, external_disclosure: false };
      // The durable ACK is the terminal export result. A failed read of the
      // subsequent document list must not turn it back into an uncertain copy
      // or keep the old selection ready for an accidental second export.
      exportRequest = null; knownExport = null; pendingMetadata = null; selected.clear(); dialogCompleted = true;
      // The ACK ends this mutation. A subsequent read may be slow or fail,
      // but cannot keep read-only navigation or the confirmed receipt hostage.
      // No new mutation is enabled until that read establishes fresh bindings.
      busy = false; stateFresh = false; render();
      status(exportSuccess(result));
      $('document-export-result').textContent = $('documents-status').textContent;
      $('document-export-title').textContent = dialogMode === 'markdown-only' ? 'Markdown-Kopie gespeichert' : 'Export abgeschlossen';
      $('document-export-target').textContent = `Gebundener Ergebnisordner → ${namespace(dialogMode)} → ${result.folder_name} (abgeschlossen)`;
      $('document-export-preview').hidden = true; $('document-export-confirm').hidden = true;
      $('document-export-configure').hidden = true;
      exportFolderNeeded = false;
      $('document-export-abandon-option').hidden = true; $('document-export-abandon').hidden = true;
      $('document-export-close').textContent = 'Schließen';
      $('document-export-support').hidden = true;
      if ($('document-export-dialog').open) $('document-export-close').focus();
      const currentReceipt = () => connection === connectionGeneration && expected === batchId && ownership === busyGeneration;
      void reload().then(refreshed => {
        if (!currentReceipt()) return;
        const notice = !refreshed
          ? ' Die aktuelle Dokumentanzeige konnte danach nicht neu geladen werden. Vor weiteren Änderungen „Gespeicherten Stand neu laden“ wählen; es ist kein zweiter Export nötig.'
          : exportRequest ? ' Ein anderer früherer Export ist noch offen. „Export erneut abgleichen“ betrifft nur diesen anderen Auftrag, nicht die gerade abgeschlossene Kopie.'
            : documentProblemCount ? ' Nicht verfügbare Prüfstände und weitere Hinweise sind unten getrennt aufgeführt; sie sind dadurch nicht mitkopiert oder freigegeben.' : '';
        status(`${exportSuccess(result)}${notice}`, !refreshed || Boolean(exportRequest));
      }).catch(() => {
        if (!currentReceipt()) return;
        stateFresh = false; render();
        status(`${exportSuccess(result)} Die aktuelle Dokumentanzeige konnte danach nicht neu geladen werden. Vor weiteren Änderungen „Gespeicherten Stand neu laden“ wählen; es ist kein zweiter Export nötig.`, true);
      });
    } catch (error) { if (connection === connectionGeneration && expected === batchId) {
      if (knownExport) status(`${exportSuccess(knownExport)} Die Kopie ist bestätigt; nur die Empfangsbestätigung konnte nicht abschließend abgeglichen werden. „Empfang erneut abgleichen“ verwendet denselben Export.`, true);
      else { await reload().catch(() => {}); showError(error, rows.map(row => row.name).join(', ')); exportFolderNeeded = exportFolderError(error); }
      renderExportDialog();
    } }
    finally { if (exportHeartbeat === heartbeat) stopExportHeartbeat(); if (expected === batchId) { if (ownership !== busyGeneration) return; busy = false; render(); if (exportRequest) renderExportDialog(); $('document-export-result').textContent = $('documents-status').textContent; } }
  }
  async function configureExportFolder() {
    if (busy || publicDirectoryUnavailable() || repairRequired() || !batchId || !$('document-export-dialog').open || $('document-export-preview').hidden ||
        pendingMetadata || knownExport || exportRequest && !exportFolderNeeded) return;
    const expected = batchId, connection = connectionGeneration, ownership = ++busyGeneration;
    busy = true; renderExportDialog();
    $('document-export-result').hidden = false;
    $('document-export-result').textContent = 'Wähle den Ergebnisordner im lokalen Systemdialog. Es wird noch keine Datei exportiert.';
    try {
      const result = await invoke('configure_results');
      if (expected !== batchId || connection !== connectionGeneration) return;
      if (result?.cancelled === true) {
        $('document-export-result').textContent = 'Ordnerwahl abgebrochen. Der Export wurde nicht gestartet; die Freigabe bleibt erhalten.';
      } else if (result?.ok === true && result.configuration_changed === true && result.local_ui_only === true && result.external_disclosure === false &&
          typeof result.result_folder === 'string' && result.result_folder.length > 0) {
        exportFolderNeeded = false;
        dialogResultFolder = result.result_folder;
        $('document-export-result').textContent = `Ergebnisordner sicher gewählt. Die Einstellung gilt auch für künftige Läufe; vorhandene Exporte bleiben am bisherigen Ort. Der bestehende Lauf und die Freigabe bleiben erhalten. Wähle „${exportRequest ? 'Export erneut versuchen' : dialogMode === 'markdown-only' ? 'Kopie speichern' : 'Freigeben und exportieren'}“; es startet kein automatischer Export.`;
      } else throw Error('AI_EXPORT_CONFIGURATION_REQUIRED');
    } catch (error) {
      if (expected === batchId && connection === connectionGeneration) {
        showError(error);
        $('document-export-result').textContent = $('documents-status').textContent;
      }
    } finally {
      if (expected === batchId && ownership === busyGeneration) { busy = false; renderExportDialog(); }
    }
  }
  window.__DATASECURE_DOCUMENTS__ = Object.freeze({
    activeBatchId() { return batchId; },
    canOpen(id) {
      if (busy) {
        status('Der lokale Prüfvorgang läuft noch. Warte auf den gespeicherten Stand, bevor du einen anderen Lauf öffnest.');
        return false;
      }
      if (navigationDraft()) {
        status(id === batchId
          ? 'Dein nicht gespeicherter Entwurf gehört zu diesem Lauf. Gleiche den gespeicherten Stand ab oder speichere beziehungsweise verwirf den Entwurf ausdrücklich.'
          : 'Ein nicht gespeicherter Entwurf gehört noch zum angezeigten Lauf. Er wurde nicht in den gewählten Lauf übernommen. Bitte zuerst diesen Entwurf abgleichen, speichern oder ausdrücklich verwerfen.', true);
        return false;
      }
      return true;
    },
    invalidateConnection() {
      stopExportHeartbeat();
      connectionGeneration++; busyGeneration++; busy = false; dialogCompleted = false; completedExportReceipt = null; bulkReviewProgress = null; pendingApproval = null; viewedBindings.clear(); loading = false; ticket++; stateFresh = false; selected.clear();
      if ($('document-export-dialog').open) $('document-export-dialog').close();
      if (detail && raw() && dirty()) recoveryDraft = { document_id: detail.document_id, name: detail.name,
        revision: detail.revision, output_sha256: detail.output_sha256, text: $('document-markdown').value };
      // An export intent remains durable on the server. Forget its local
      // acknowledgement, not its operation; reload discovers that same receipt.
      knownExport = null; confirmedCopy = null; completedCopyCount = 0; resultPublication = null; documents = []; contentNotices = null; clearText(); renderReceipts(); render();
      status('Verbindung unterbrochen. Aktuelle Stände nach der Wiederverbindung neu laden; keine Entscheidung oder Exportbestätigung wird automatisch gesendet.', true);
    },
    async open(id, options = {}) { if (!this.canOpen(id)) return false;
      // Re-entering even the same run creates a new view owner. A detached
      // post-ACK callback from the previous view cannot invalidate fresh state.
      const ownership = ++busyGeneration;
      completedExportReceipt = null; directResultsSupported = false;
      batchId = id; bulkReviewProgress = null; pendingApproval = null; viewedBindings.clear(); confirmedCopy = null; completedCopyCount = 0; resultPublication = null; documents = []; contentNotices = null; sourceNoticeFacts = null; filterMode = 'notices'; runMode = null; runPolicy = null; processingComplete = false; stateFresh = false; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null; exportFolderNeeded = false; clearText(); renderUnavailable({}); renderReceipts(); render();
      $('documents-run').textContent = `Lauf-ID: ${id}`; status('Private Dokumentprüfstände werden geladen …');
      try {
        if (!await reload() || batchId !== id || options.exportPreview !== true) return;
        // Old navigation may open an existing bound transaction for inspection,
        // never manufacture a new selection or replay its write/acknowledgement.
        if (stateFresh && exportRequest) await openExportDialog();
      } catch (error) { if (batchId === id && ownership === busyGeneration) showError(error); }
    },
    async close() { if (busy || navigationDraft()) { if (navigationDraft()) status('Ungespeicherten Entwurf zuerst speichern oder ausdrücklich verwerfen.'); return false; } connectionGeneration++; ticket++; loading = false; bulkReviewProgress = null; pendingApproval = null; viewedBindings.clear(); batchId = null; confirmedCopy = null; completedExportReceipt = null; completedCopyCount = 0; resultPublication = null; documents = []; contentNotices = null; sourceNoticeFacts = null; filterMode = 'notices'; runMode = null; runPolicy = null; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null; exportFolderNeeded = false;
      directResultsSupported = false;
      if ($('document-export-dialog').open) $('document-export-dialog').close();
      clearText(); renderReceipts(); render(); await invoke('close_document_reviews').catch(() => {}); return true; }
  });
  $('documents-open-results').addEventListener('click', async () => {
    if (busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || navigationDraft() || !processingComplete || !documents.length || !batchId || publicationUnsettled()) return;
    const expected = batchId, connection = connectionGeneration, ownership = ++busyGeneration;
    busy = true; controls();
    try {
      await invoke('open_history_results', { batchId: expected });
      if (expected === batchId && connection === connectionGeneration) status('Der geprüfte Ergebnisordner wurde zum Öffnen übergeben. Dateien dort auswählen oder weiterverwenden.');
    } catch (error) { if (expected === batchId && connection === connectionGeneration) showError(error, '', false, 'open_history_results'); }
    finally { if (expected === batchId && ownership === busyGeneration) { busy = false; controls(); } }
  });
  $('documents-publish').addEventListener('click', async () => {
    if (busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || navigationDraft() || !batchId || !processingComplete || !directResultsSupported || !publicationUnsettled() || exportRequest) return;
    const expected = batchId, connection = connectionGeneration, ownership = ++busyGeneration;
    busy = true; controls();
    try {
      await publishCurrent(expected, ownership, connection);
      if (expected === batchId && connection === connectionGeneration) status('Aktueller Ergebnisstand bestätigt. Ergebnisordner öffnen; frühere Ergebnisstände bleiben unverändert.');
    } catch (error) { if (expected === batchId && connection === connectionGeneration) showError(error, '', true); }
    finally { if (expected === batchId && ownership === busyGeneration) { busy = false; controls(); } }
  });
  $('documents-reload').addEventListener('click', async () => {
    if (busy || !batchId) return;
    if (prepared() || dirty() && !recoveryDraft) { status('Ungespeicherten Entwurf zuerst speichern oder ausdrücklich verwerfen. Der angezeigte Text und die Auswahl bleiben erhalten.', true); controls(); return; }
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
        if (markdownPositions?.display === draft.text) { recoveryDraft = null; status(`${draft.name}: Der gespeicherte Text stimmt mit deinem Korrekturentwurf überein. ${publicDirectoryUnavailable() ? 'Der ursprüngliche Ergebnisordner ist nicht verfügbar. Der private Text bleibt lesbar; Änderungen und neue Bereitstellungen bleiben gesperrt.' : publicationUnsettled() ? 'Die Bereitstellung des aktuellen Ergebnisstands erneut prüfen.' : 'Den bestätigten Ergebnisordner öffnen; keine weitere Dateiauswahl nötig.'}`); }
        else if (row.revision === draft.revision && row.output_sha256 === draft.output_sha256) {
          $('document-markdown').value = draft.text; recoveryDraft = null; status(`${draft.name}: Korrekturentwurf wiederhergestellt, noch nicht gespeichert.`);
        } else status(`${draft.name}: Der gespeicherte Stand weicht ab. Dein Entwurf bleibt zum Vergleichen und Kopieren erhalten; er wird nicht automatisch darübergeschrieben.`, true);
      }
      controls();
    }
    if ($('document-export-dialog').open) renderExportDialog();
  });
  $('document-recovery-discard').addEventListener('click', () => { if (busy) return; recoveryDraft = null; controls(); });
  $('documents-filter').addEventListener('change', () => {
    if (busy || !stateFresh || !raw() || !contentNotices || exportRequest || navigationDraft()) { controls(); return; }
    const next = $('documents-filter').value;
    if (!['notices', 'edited', 'all', 'without'].includes(next) || next === filterMode) return;
    filterMode = next; selected.clear();
    if (detail && !visibleDocuments().some(row => row.document_id === detail.document_id)) clearText();
    render(); status(`${visibleDocuments().length} von ${documents.length} Markdown-Dateien angezeigt. „Vorherige/Nächste Datei“ gilt nur für diese Ansicht. Die Ergebnisdateien werden dadurch nicht geändert.`);
  });
  $('documents-all').addEventListener('change', () => { if (busy || !stateFresh || exportRequest) return;
    const shown = visibleDocuments(); selected = new Set($('documents-all').checked ? shown.map(row => row.document_id) : []); render(); });
  $('entities-all').addEventListener('change', () => { if (!allowAction('select')) return;
    selectEntities(entityRows, $('entities-all').checked); });
  $('entities-apply').addEventListener('click', applyEntities);
  $('entities-scope').addEventListener('change', controls);
  $('entities-decision').addEventListener('change', controls);
  $('entities-previous').addEventListener('click', () => changeEntityPage(-1)); $('entities-next').addEventListener('click', () => changeEntityPage(1));
  for (const [id, delta] of [['document-previous', -1], ['document-next', 1]]) $(id).addEventListener('click', () => {
    const shown = visibleDocuments(), position = shown.findIndex(row => row.document_id === detail?.document_id), next = shown[position + delta];
    if (position >= 0 && next) loadDetail(next);
  });
  $('documents-approve').addEventListener('click', requestApproval);
  $('documents-approve-cancel').addEventListener('click', () => { pendingApproval = null; controls(); });
  $('documents-approve-proceed').addEventListener('click', confirmApproval);
  $('documents-revoke').addEventListener('click', () => decideRows('revoke', documents.filter(row => selected.has(row.document_id))));
  $('documents-export').addEventListener('click', openExportDialog);
  $('documents-identities').addEventListener('click', () => openIdentities());
  $('document-export-confirm').addEventListener('click', exportRows);
  $('documents-completion-history').addEventListener('click', () => {
    if (!canLeaveCompletion()) return;
    if (typeof window.__DATASECURE_RUN_GUIDE__?.history === 'function') {
      window.__DATASECURE_RUN_GUIDE__.history(batchId); return;
    }
    const navigation = $('nav-history');
    navigation.dataset.openSummaryBatchId = batchId;
    navigation.click();
  });
  $('documents-completion-details').addEventListener('click', () => {
    if (canLeaveCompletion()) window.__DATASECURE_RUN_GUIDE__?.overview?.(batchId);
  });
  $('document-export-configure').addEventListener('click', configureExportFolder);
  $('document-export-close').addEventListener('click', () => { if (!busy || dialogCompleted) $('document-export-dialog').close(); });
  $('document-export-dialog').addEventListener('cancel', event => { if (busy && !dialogCompleted) event.preventDefault(); });
  $('document-export-dialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...$('document-export-dialog').querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      .filter(node => !node.hidden && node.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1);
    if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  });
  $('document-export-dialog').addEventListener('close', () => {
    const receipt = dialogCompleted && completedExportReceipt?.connection === connectionGeneration && completedExportReceipt.batch_id === batchId
      ? completedExportReceipt : null;
    dialogSelection = null; dialogCompleted = false; completedExportReceipt = null;
    if (receipt && typeof window.__DATASECURE_RUN_GUIDE__?.exportCompleted === 'function') {
      const { connection: _connection, ...metadata } = receipt;
      window.__DATASECURE_RUN_GUIDE__.exportCompleted(metadata);
    }
    (receipt && !$('documents-completion').hidden && !$('documents-completion-history').disabled ? $('documents-completion-history') :
      dialogFocus?.isConnected && !dialogFocus.disabled ? dialogFocus : $('documents-heading')).focus();
  });
  $('document-export-abandon-check').addEventListener('change', controls);
  $('document-export-abandon').addEventListener('click', async () => {
    if (busy || !stateFresh || publicDirectoryUnavailable() || repairRequired() || !pendingMetadata || pendingMetadata.status !== 'incomplete' || knownExport || !$('document-export-abandon-check').checked) return;
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
  $('document-markdown').addEventListener('input', () => { forgetTextSelection(); controls(); });
  $('document-markdown').addEventListener('focus', () => { forgetTextSelection(); selectionOwner = 'markdown'; controls(); });
  $('document-markdown').addEventListener('mousedown', () => { forgetTextSelection(); selectionOwner = 'markdown'; controls(); });
  for (const event of ['select', 'mouseup', 'keyup']) $('document-markdown').addEventListener(event, () => {
    if (document.activeElement !== $('document-markdown')) return;
    selectionOwner = 'markdown'; captureTextSelection();
  });
  for (const event of ['focus', 'mousedown', 'select']) $('document-original').addEventListener(event, () => {
    if (event === 'select' && document.activeElement !== $('document-original')) return;
    forgetTextSelection(); selectionOwner = 'original'; controls();
  });
  $('document-discard-correction').addEventListener('click', () => { $('document-markdown').value = markdownPositions?.display || ''; controls(); });
  $('document-discard-draft').addEventListener('click', () => {
    if (busy) return;
    pendingDocumentChange = null; entitySelected.clear(); entitySelectionFacts.clear(); $('entities-decision').value = ''; $('entities-scope').value = 'document';
    controls(); actionStatus('Vorbereitete Auswahl verworfen. Der gespeicherte Text und alle Ergebnisdateien bleiben unverändert.');
  });
  $('document-save-correction').addEventListener('click', () => {
    if (!allowAction('correct')) return;
    let correction;
    try { correction = markdownPositions.correction($('document-markdown').value); }
    catch (error) { showError(error, detail.name); return; }
    if (!correction) { controls(); return; }
    if (correction.replacement.length > 32768) { status('Bitte eine kleinere Korrektur speichern (höchstens 32.768 Zeichen pro Änderung).', true); return; }
    decideRows('correct', [detail], [correction]);
  });
  $('document-redact').addEventListener('click', async () => {
    if (!allowAction('mask')) return;
    const selectedText = currentTextSelection();
    if (!selectedText) return;
    await saveTextChange({ action: 'redact', row: { ...detail }, ranges: [selectedText.range] });
  });
  $('document-restore').addEventListener('click', () => {
    if (!allowAction('restore')) return;
    forgetTextSelection();
    pendingDocumentChange = { action: 'restore_base', row: { ...detail }, ranges: [] };
    $('document-change-confirm-text').textContent = `${detail.name}: Noch nichts geändert. Das Speichern stellt den automatisch erzeugten Basisstand dieser Datei wieder her und verwirft ihre späteren Text- und Entitätenänderungen. ${repairRequired() ? 'Weitere private Reparaturen können nötig bleiben. Erst nach sicherer Prüfung aller Dokumente kann ein neuer Ergebnisstand bereitgestellt werden.' : 'Danach wird der vollständige aktuelle Ergebnisstand in einem neuen Ordner bereitgestellt; frühere Ergebnisstände bleiben unverändert.'}`;
    $('document-change-save').textContent = 'Basisstand jetzt wiederherstellen';
    controls(); $('document-change-save').focus();
    actionStatus('Wiederherstellung vorbereitet, noch nicht gespeichert. Bitte ausdrücklich bestätigen oder abbrechen.');
  });
  $('document-change-cancel').addEventListener('click', () => {
    if (busy) return;
    pendingDocumentChange = null; controls(); $('document-redact').focus();
    actionStatus('Änderung abgebrochen. Der gespeicherte Textstand bleibt unverändert.');
  });
  async function saveTextChange(pending) {
    const expected = batchId, connection = connectionGeneration;
    if (!pending || !processingComplete || !directResultsSupported || publicationUnsettled() || publicDirectoryUnavailable() || !detailCurrent() || !sameDocumentBinding(detail, pending.row) || busy) {
      pendingDocumentChange = null; controls();
      actionStatus('Der vorbereitete Textstand ist nicht mehr aktuell. Bitte die Datei neu öffnen und die Änderung erneut prüfen.', true);
      return;
    }
    pendingDocumentChange = null; forgetTextSelection(); controls();
    actionStatus('Änderung wird lokal gespeichert …');
    const result = await decideRows(pending.action, [detail], pending.ranges);
    if (expected !== batchId || connection !== connectionGeneration) return;
    if (!result || batchId !== result.batchId) {
      actionStatus('Änderung nicht sicher bestätigt. Bitte den Status oben und den gespeicherten Stand prüfen; nicht blind erneut klicken.', true);
      return;
    }
    const updated = documents.find(row => sameDocumentBinding(row, result.updates[0]));
    if (!stateFresh || !updated) {
      actionStatus('Speicherbestätigung erhalten, aber der aktuelle Textstand konnte nicht eindeutig angezeigt werden. Bitte den gespeicherten Stand neu laden.', true);
      return;
    }
    await loadDetail(updated);
    if (expected !== batchId || connection !== connectionGeneration) return;
    if (!detail || !sameDocumentBinding(detail, updated)) {
      actionStatus('Änderung gespeichert, der neue Text konnte aber nicht geöffnet werden. Bitte den gespeicherten Stand neu laden.', true);
      return;
    }
    const message = result.repair_required ? `${updated.name}: ${repairRemaining}` : pending.action === 'redact'
      ? `${updated.name}: Zusätzliche Maskierung in Stand ${updated.revision} gespeichert und aktueller Ergebnisstand bereitgestellt. Prüfe rechts den Platzhalter [MANUAL_REDACTION].`
      : `${updated.name}: Technisch geprüfter Basisstand als Stand ${updated.revision} gespeichert und aktueller Ergebnisstand bereitgestellt. Frühere Ergebnisstände bleiben unverändert.`;
    actionStatus(message); status(message);
  }
  $('document-change-save').addEventListener('click', async () => {
    if (!allowAction('restore-save')) return;
    await saveTextChange(pendingDocumentChange);
  });
  controls();
})();
