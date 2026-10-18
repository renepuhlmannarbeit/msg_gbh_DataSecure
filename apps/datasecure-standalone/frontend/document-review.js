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
  async function decideSelection(expected, action, rows) {
    if (rows.length === 1) {
      const row = rows[0];
      const result = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
        decision: { action, revision: row.revision, output_sha256: row.output_sha256, ranges: [], operation_id: operationId() } });
      if (!decisionAcknowledged(result, row, action)) throw Error('DOCUMENT_REVIEW_STALE');
      return [result];
    }
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
  let loadedMarkdown = '', stateFresh = false, recoveryDraft = null, runMode = null, runPolicy = null;
  let pendingMetadata = null, dialogSelection = null, dialogMode = null, dialogFocus = null, dialogFiles = null;
  let dialogCompleted = false, completedExportReceipt = null;
  let entityRows = [], entitySelected = new Set(), entityPage = 0, entityPages = 1, entityControls = [];
  let receiptControls = [];
  let bulkReviewProgress = null;
  let pendingDocumentChange = null;
  let viewedBindings = new Map(), pendingApproval = null;
  let sourceCount = 0, unavailableSourceCount = 0, omissionSourceCount = 0, privacyStopCount = 0;
  let unavailableReviewCount = 0;
  const mode = () => (pendingMetadata || detail || documents[0])?.processing_mode || runMode;
  const raw = () => mode() === 'markdown-only';
  const automatic = () => runPolicy === 'automatic-conservative';
  const approvalLabel = row => !row.approved ? 'Noch nicht freigegeben' : row.approval_basis === 'automatic'
    ? 'Automatisch freigegeben · nicht manuell geprüft' : 'Freigegeben';
  const visibleDocuments = () => {
    if (!raw() || !contentNotices || exportRequest || filterMode === 'all') return documents;
    if (filterMode === 'edited') return documents.filter(row => row.text_modified === true);
    if (filterMode === 'without') return documents.filter(row => !contentNotices.has(row.document_id));
    return documents.filter(row => contentNotices.has(row.document_id));
  };
  const currentTextState = row => row.text_modified === true ? 'Korrektur gespeichert' : 'Markdown verfügbar';
  const noticeExplanation = codes => {
    const messages = { SOURCE_COVERAGE_UNVERIFIED: 'Inhaltsübernahme nicht vollständig belegbar',
      OCR_NOT_VERIFIED: 'OCR-Text nicht vollständig fachlich geprüft. Die Kontaktprüfung betrifft nur erkannte E-Mail-Adressen und Telefonnummern, nicht die übrigen Wörter, Zahlen oder Lesereihenfolge.',
      OCR_CONTACT_VALUES_UNVERIFIED: 'Erkannte OCR-Kontaktwerte sind noch nicht bestätigt',
      VISUAL_CONTENT_NOT_EXTRACTED: 'Bildinhalt nicht als Text übernommen',
      OCR_TEXT_EMPTY: 'OCR lieferte keinen zusätzlichen Text',
      PDF_OCR_SCOPE_UNVERIFIED: 'PDF-Bildbereich nicht eindeutig zugeordnet',
      SCAN_OCR_DISABLED_BY_POLICY: 'Scan-OCR war ausgeschaltet',
      IMAGE_OCR_DISABLED_BY_POLICY: 'Bild-OCR war ausgeschaltet' };
    return codes.length ? codes.map(code => messages[code] || `Inhaltshinweis: ${code}`).join(' · ') :
      'Inhaltsübernahme möglicherweise unvollständig';
  };
  const dirty = () => Boolean(recoveryDraft || detail && raw() && $('document-markdown').value !== loadedMarkdown);
  const detailCurrent = () => stateFresh && detail && documents.some(row => sameDocumentBinding(detail, row));
  const namespace = mode => mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
  const reasons = { DOCUMENT_REVIEW_STALE: 'Der Textstand hat sich geändert. Bitte neu laden und erneut prüfen.',
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
    DOCUMENT_ENTITY_RUN_CONFLICT: 'Die laufweite Änderung wurde nicht übernommen. Mindestens ein betroffener Prüfstand ist nicht bearbeitbar. Die genannten Dateien zuerst prüfen.',
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
  function showError(error, name = '') {
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
    status(`${name ? `${name}: ` : ''}${reasons[code] || 'Der lokale Prüfstand konnte nicht sicher bestätigt werden. Erneut laden; nicht blind freigeben.'} (${code})`, true);
  }
  function exportFolderError(error) {
    let code = error?.code || error?.message || String(error);
    try { code = JSON.parse(code).code || code; } catch {}
    return !pendingMetadata && !knownExport && ['AI_EXPORT_CONFIGURATION_REQUIRED', 'AI_EXPORT_VOLUME_MISMATCH'].includes(code);
  }
  const canLeaveCompletion = () => Boolean(batchId && !busy && !dirty() &&
    (!loading || confirmedCopy?.batchId === batchId && !exportRequest));
  function controls() {
    const blocked = busy || !stateFresh;
    const shown = visibleDocuments(), rows = documents.filter(row => selected.has(row.document_id));
    const anotherCopy = completedCopyCount > 0 || confirmedCopy?.batchId === batchId;
    const selectedShown = shown.filter(row => selected.has(row.document_id));
    const all = shown.length > 0 && selectedShown.length === shown.length;
    const exportComplete = stateFresh && confirmedCopy?.batchId === batchId && confirmedCopy.selection.length === documents.length &&
      documents.every(row => confirmedCopy.selection.some(copy => row.document_id === copy.document_id &&
        row.revision === copy.revision && row.output_sha256 === copy.output_sha256));
    const completedHere = confirmedCopy?.batchId === batchId && !exportRequest && !busy;
    const currentCompletion = Boolean(batchId && stateFresh && !busy && !loading && processingComplete &&
      documents.length > 0 && !dirty() && !exportRequest && !pendingDocumentChange && !pendingApproval);
    const allApproved = !raw() && documents.length > 0 && documents.every(row => row.approved);
    const hasHints = documentProblemCount > 0 || documentOmissionCount > 0 ||
      sourceNoticeFacts?.content_notice_count > 0 || sourceNoticeFacts?.content_notice_breakdown_complete === false;
    let completionTitle = '', completionText = '';
    if (completedHere) {
      const copied = confirmedCopy.selection.length;
      completionTitle = raw() ? 'Markdown-Kopie abgeschlossen' : 'Export abgeschlossen';
      completionText = `${copied} ausgewählte ${copied === 1 ? 'Datei wurde' : 'Dateien wurden'} lokal kopiert. Dieser Kopiervorgang ist bestätigt und wird nicht automatisch wiederholt. ${!stateFresh ? 'Der heutige Dokumentstatus wird getrennt neu geprüft; Änderungen bleiben bis dahin gesperrt. Das stellt diese bereits bestätigte Kopie nicht infrage.' : exportComplete ? 'Alle derzeit verfügbaren Dokumentstände dieses Laufs sind in dieser Kopie enthalten.' : 'Weitere Dateien oder spätere Textänderungen sind darin nicht automatisch enthalten und brauchen bei Bedarf eine neue Freigabe und Kopie.'} Im Verlauf kannst du Abschluss und Ausnahmen getrennt ansehen. Es erfolgte kein Upload.`;
    } else if (currentCompletion) {
      completionTitle = raw() ? 'Umwandlung abgeschlossen' : allApproved
        ? 'Dokumentprüfung abgeschlossen' : 'Verarbeitung abgeschlossen – Dokumentprüfung offen';
      if (hasHints) completionTitle += ' · mit Hinweisen';
      const automaticCount = documents.filter(row => row.approved && row.approval_basis === 'automatic').length;
      const exportAdvice = completedCopyCount > 0
        ? 'Gespeicherte Exportbelege sind bereits vorhanden. Eine neue Kopie ist nur nötig, wenn du sie ausdrücklich möchtest. Alte Belege bestätigen nicht automatisch den heutigen Textstand. '
        : 'Ein Export wurde dadurch nicht erstellt. Du kannst gewünschte freigegebene Dateien optional exportieren oder jetzt zum Verlauf gehen. ';
      completionText = `Der Lauf verarbeitet keine weiteren Dateien. ${documents.length} ${documents.length === 1 ? 'Ergebnis ist' : 'Ergebnisse sind'} verfügbar. ` +
        (raw() ? 'Die Dateien sind nicht anonymisiert. Nachbearbeitung und eine zusätzliche Markdown-Kopie sind freiwillig. '
          : allApproved ? `Alle ${documents.length} verfügbaren Dokumentstände sind freigegeben. ${automaticCount ? `${automaticCount} davon automatisch im Schnellweg, nicht manuell geprüft. ` : ''}${exportAdvice}`
            : `${documents.filter(row => row.approved).length} von ${documents.length} verfügbaren Dokumentständen sind freigegeben. Für einen Export die gewünschten Ergebnisse vergleichen und ausdrücklich freigeben; du kannst diese Prüfung auch später fortsetzen. `) +
        (hasHints ? 'Hinweise und nicht verfügbare Quellen bleiben gesondert aufgeführt. Nicht verfügbare Quellen sind weder freigegeben noch exportiert. ' : '') +
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
      document_count: documents.length, approved_count: documents.filter(row => row.approved).length,
      problem_count: documentProblemCount, expected_omission_count: documentOmissionCount, processing_complete: processingComplete,
      automatically_approved_count: documents.filter(row => row.approval_basis === 'automatic' && row.approved).length,
      dirty: dirty(), export_pending: Boolean(exportRequest), export_complete: exportComplete });
    $('documents-loading').hidden = Boolean(bulkReviewProgress) || !busy && !loading;
    $('documents-loading-text').textContent = loading ? 'Dokumente und Hinweise werden geladen …' : 'DataSecure verarbeitet den lokalen Vorgang …';
    $('documents-review-controls').hidden = Boolean(bulkReviewProgress);
    $('documents-approve-confirm').hidden = !pendingApproval || Boolean(bulkReviewProgress);
    $('documents-approve-proceed').disabled = blocked || !pendingApproval || Boolean(exportRequest) || dirty();
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
    $('documents-filter').disabled = blocked || dirty() || Boolean(exportRequest) || !contentNotices;
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
    $('documents-reload').disabled = busy || loading;
    // Closing a modal cannot cancel a native copy. Keep its progress and
    // eventual receipt visible until the operation has actually settled.
    $('document-export-close').disabled = busy && !dialogCompleted;
    $('documents-identity-reference').hidden = mode() !== 'markdown-and-anonymize';
    $('documents-identities').disabled = blocked || dirty() || Boolean(recoveryDraft) || !documents.length;
    $('documents-all').disabled = blocked || Boolean(exportRequest) || !shown.length;
    $('documents-selected').textContent = raw() ? `${rows.length} ausgewählt · ${shown.length} angezeigt · ${documents.length} Markdown-Dateien verfügbar`
      : `${rows.length} ausgewählt · ${documents.filter(row => row.approved).length} von ${documents.length} freigegeben`;
    $('documents-approve').hidden = raw(); $('documents-revoke').hidden = raw();
    $('documents-approve').disabled = blocked || dirty() || Boolean(exportRequest) || !rows.length; $('documents-revoke').disabled = blocked || dirty() || Boolean(exportRequest) || !rows.length;
    if (!raw() && rows.length && rows.every(row => row.approved)) $('documents-approve').disabled = true;
    $('documents-approve').textContent = !raw() && rows.length && rows.every(row => row.approved) ? 'Auswahl bereits freigegeben' : 'Auswahl freigeben';
    $('documents-export').disabled = blocked || dirty() || !exportRequest && (!rows.length || !raw() && rows.some(row => !row.approved));
    $('documents-export').textContent = exportRequest ? knownExport || pendingMetadata?.status === 'completed' ? 'Empfang erneut abgleichen' : pendingMetadata ? 'Export erneut abgleichen' : 'Export erneut versuchen' : raw() ? anotherCopy ? 'Weitere Markdown-Kopie speichern' : 'Zusätzliche Markdown-Kopie speichern' : anotherCopy ? 'Weitere Dateien exportieren' : 'Auswahl exportieren';
    $('documents-heading').textContent = raw() ? 'Markdown freiwillig nachbearbeiten · nicht anonymisiert' : 'Prüfen und Dateien exportieren';
    $('documents-purpose').textContent = raw() ? 'Die erstellten Markdown-Dateien sind bereits im Ergebnisordner nutzbar. Zum Vergleichen und Korrigieren den Dateinamen anklicken. Häkchen wählen nur Dateien für eine zusätzliche Kopie. „Korrektur speichern“ hält einen privaten Textstand fest; erst „Zusätzliche Kopie“ schreibt daraus eine verwendbare korrigierte Datei. Das ist keine weitere OCR-Pflichtprüfung; Originalinhalte bleiben erhalten.' : 'Die Anonymisierung der verfügbaren Dateien ist technisch fertig. Vergleiche die Ergebnisse mit dem Original und gib nur gewünschte Textstände frei. Erst danach kannst du die freigegebenen Markdown-Dateien exportieren. Die exportierten Markdown-Dateien kannst du auch ohne KI verwenden. DataSecure lädt nichts hoch. Du kannst diesen Schritt auch später im Verlauf fortsetzen.';
    if (automatic()) {
      const autoCount = documents.filter(row => row.approved && row.approval_basis === 'automatic').length;
      const manualCount = documents.filter(row => row.approved && row.approval_basis === 'manual').length;
      const unapprovedCount = documents.filter(row => !row.approved).length;
      $('documents-purpose').textContent = `Schnellweg: ${autoCount} automatisch freigegeben, nicht manuell geprüft · ${manualCount} später manuell freigegeben · ${unapprovedCount} aktuell ohne Freigabe. Bekannte unklare Stellen und OCR-Kontaktbereiche wurden automatisch maskiert. ` +
        (unapprovedCount ? 'Geänderte oder widerrufene Textstände vor einer neuen Freigabe prüfen. ' : 'Keine erneute Dokumentfreigabe nötig. ') +
        'Wähle gewünschte freigegebene Dateien für einen lokalen Export aus. Die exportierten Markdown-Dateien kannst du auch ohne KI verwenden. DataSecure lädt nichts hoch.';
    }
    if (!raw() && anotherCopy && !exportRequest && !rows.length)
      $('documents-purpose').textContent = 'Ein Export dieses Laufs wurde bereits abgeschlossen. Für denselben unveränderten Stand ist kein erneuter Export nötig. Du kannst einzelne Dokumente weiter prüfen; nach Änderungen müssen betroffene Textstände neu freigegeben werden. Nur falls du bewusst einen weiteren Export brauchst, wähle die gewünschten Dateien erneut aus.';
    if (!mode()) {
      $('documents-heading').textContent = loading ? 'Dokumentprüfstände werden geladen' : 'Dokumentprüfstände dieses Laufs';
      $('documents-purpose').textContent = loading
        ? 'Bitte warten: DataSecure gleicht die gespeicherten Dokumentstände lokal ab. Bis zum Abschluss sind keine Freigabe und kein Export möglich.'
        : 'Der Verarbeitungszweck ist nicht mehr belegbar. Daraus wird weder eine Anonymisierung noch eine Freigabe zur Weitergabe abgeleitet.';
      $('documents-export').textContent = 'Keine belegbare Exportauswahl';
      $('documents-export').disabled = true;
    }
    $('document-markdown-caption').textContent = raw() ? 'Markdown-Text (für Korrekturen bearbeitbar)' :
      mode() === 'markdown-and-anonymize' ? 'Geplanter anonymisierter Markdown-Text (nur markieren)' : 'Markdown-Text (Modus wird geladen)';
    $('documents-main-guide').hidden = mode() !== 'markdown-and-anonymize' || automatic();
    $('documents-approval-extras').hidden = mode() !== 'markdown-and-anonymize';
    $('document-markdown').setAttribute('aria-label', $('document-markdown-caption').textContent);
    $('document-edit-hint').textContent = raw() ? 'Du kannst den rechten Markdown-Text direkt bearbeiten. Korrekturen ausdrücklich speichern; die ursprünglich erzeugten Dateien bleiben unverändert. Für eine verwendbare korrigierte Datei die gewünschte Datei auswählen und zusätzlich eine Kopie speichern. Sie enthält Originalinhalte und ist nicht anonymisiert.' : !detail ? 'Wähle links ein Dokument, vergleiche Original und anonymisierten Entwurf und gib den geprüften Stand dann ausdrücklich frei. Das rechte Feld ist schreibgeschützt.' : 'Hauptweg: Original und anonymisierten Entwurf vergleichen, Datei links anhaken und oben „Auswahl freigeben“ wählen. Der rechte Text ist schreibgeschützt. Nur wenn du weitere Änderungen brauchst, öffne „Weitere Textänderungen (optional)“; sie werden erst nach gesonderter Bestätigung gespeichert und heben die betroffene Freigabe auf.';
    if (automatic() && (!detail || detail.approved)) $('document-edit-hint').textContent = 'Schnellweg: Bereits freigegebene Textstände können direkt für einen lokalen Export ausgewählt werden. Ein Textvergleich ist zusätzlich möglich. Änderungen unter „Weitere Textänderungen“ erzeugen einen neuen Stand ohne Freigabe; dafür ist eine neue Entscheidung nötig.';
    $('document-save-correction').hidden = !raw(); $('document-discard-correction').hidden = !raw();
    $('document-save-correction').disabled = blocked || !detailCurrent() || Boolean(recoveryDraft) || Boolean(exportRequest) || !dirty();
    $('document-discard-correction').disabled = busy || !dirty();
    $('document-markdown').readOnly = !raw() || blocked || Boolean(recoveryDraft) || Boolean(exportRequest);
    $('document-extra-actions').hidden = raw() || !detailCurrent();
    $('document-redact').hidden = raw();
    $('document-redact').disabled = raw() || blocked || dirty() || Boolean(exportRequest) || !detailCurrent(); $('document-restore').disabled = blocked || dirty() || Boolean(exportRequest) || !detailCurrent();
    $('document-change-confirm').hidden = !pendingDocumentChange;
    $('document-change-save').disabled = blocked || !pendingDocumentChange || !detailCurrent() || !sameDocumentBinding(detail, pendingDocumentChange?.row);
    $('document-change-cancel').disabled = busy;
    $('documents-back').disabled = busy;
    $('document-export-confirm').disabled = blocked;
    $('document-export-abandon').disabled = blocked || !$('document-export-abandon-check').checked;
    $('document-recovery-draft').hidden = !recoveryDraft;
    $('document-recovery-text').value = recoveryDraft?.text || '';
    $('document-recovery-label').textContent = recoveryDraft ? `${recoveryDraft.name}: nicht bestätigter Korrekturentwurf (Ausgangsstand ${recoveryDraft.revision}). Der Text bleibt hier erhalten; bei abweichendem gespeicherten Stand bitte vergleichen und benötigte Änderungen kopieren.` : '';
    $('document-recovery-discard').disabled = busy;
    const position = shown.findIndex(row => row.document_id === detail?.document_id);
    $('document-position').textContent = position < 0 ? '' : `${position + 1} von ${shown.length} angezeigten Dateien`;
    $('document-previous').disabled = blocked || dirty() || position <= 0;
    $('document-next').disabled = blocked || dirty() || position < 0 || position >= shown.length - 1;
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
  function clearText() { pendingDocumentChange = null; $('document-change-confirm').hidden = true; $('document-extra-actions').open = false;
    detail = null; loadedMarkdown = ''; $('document-original').value = ''; $('document-markdown').value = ''; actionStatus('');
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
  const exportSuccess = result => `${result.exported_count} Datei${result.exported_count === 1 ? '' : 'en'} ${result.processing_mode === 'markdown-only' ? 'als zusätzliche Markdown-Kopie gespeichert' : 'exportiert'}: Ergebnisordner → ${namespace(result.processing_mode)} → ${result.folder_name}. ${result.processing_mode === 'markdown-only' ? 'Die ursprünglichen Markdown-Dateien sind unverändert; die Kopie enthält Originalinhalte und ist nicht anonymisiert.' : 'Nur neutrale Markdown-Dateien; keine privaten Begleitdaten.'} Dieser Export ist abgeschlossen; bitte nicht erneut ausführen, sofern du nicht ausdrücklich eine weitere Kopie benötigst.`;
  function render() {
    const list = $('documents-list'); list.replaceChildren();
    for (const row of visibleDocuments()) {
      const item = make('div', undefined, `document-row${detail?.document_id === row.document_id ? ' active' : ''}`);
      const check = make('input'); check.type = 'checkbox'; check.checked = selected.has(row.document_id); check.disabled = busy || !stateFresh || Boolean(exportRequest);
      check.setAttribute('aria-label', `${row.name} auswählen`); check.addEventListener('change', () => {
        if (busy || !stateFresh || exportRequest) return; check.checked ? selected.add(row.document_id) : selected.delete(row.document_id); controls(); });
      const info = make('div'), show = make('button', row.name); show.disabled = busy || !stateFresh;
      show.setAttribute('aria-label', `${row.name}: ${raw() ? 'vergleichen und korrigieren' : 'vergleichen'}`);
      show.addEventListener('click', () => loadDetail(row));
      info.append(show, make('p', `${raw() ? currentTextState(row) : approvalLabel(row)} · Stand ${row.revision}`, 'meta'));
      if (raw() && (contentNotices?.has(row.document_id) || row.text_modified === true)) {
        const flags = make('div', undefined, 'document-flags');
        if (contentNotices?.has(row.document_id)) flags.append(make('span', noticeExplanation(contentNotices.get(row.document_id)), 'warning'));
        if (row.text_modified === true) flags.append(make('span', 'Korrektur gespeichert'));
        info.append(flags);
      }
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
      SOURCE_TYPE_MISMATCH: 'Dateiendung und Dateiinhalt passen nicht zusammen.', SOURCE_ENCRYPTED_UNSUPPORTED: 'Die Datei ist verschlüsselt oder passwortgeschützt. Eine ungeschützte Kopie separat auswählen.',
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
        Array.isArray(row.reason_codes) && row.reason_codes.length <= 20 &&
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
    else status(`${comparisonInvalidated ? `${previousName}: Der zuvor angezeigte Dokumentstand hat sich geändert oder ist nicht mehr verfügbar. Vergleich und betroffene Auswahl wurden zurückgesetzt; bitte den aktuellen Stand erneut öffnen. ` : ''}${documents.length} Markdown-Datei${documents.length === 1 ? '' : 'en'} verfügbar. ${raw() ? contentNotices ? `${visibleDocuments().length} in der aktuellen Ansicht. Inhaltshinweise stammen aus dem Verarbeitungslauf; eine gespeicherte Korrektur löst sie nicht automatisch auf.` : 'Dateibezogene Hinweise nicht sicher zuordenbar; alle Dateien werden angezeigt.' : `${documents.filter(row => row.approved).length} von ${documents.length} aktuellen Dokumentständen freigegeben. ${data.export_receipts?.length ? `${data.export_receipts.length} abgeschlossene${data.export_receipts.length === 1 ? 'r Export' : ' Exporte'} mit Beleg vorhanden; die heutigen Textstände vor einem weiteren Export erneut prüfen.` : 'Noch kein abgeschlossener Export mit Beleg vorhanden.'} Zum Vergleichen den Dateinamen anklicken; Häkchen wählen für Sammelaktionen aus.`}`);
    return true;
    } catch (error) { if (expected === batchId && request === ticket) { stateFresh = false; render(); } throw error; }
    finally { if (expected === batchId && request === ticket) { loading = false; controls(); } }
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
    if (action === 'redact' && raw()) return;
    if (rows.some(row => !documents.some(current => sameDocumentBinding(row, current))) ||
        ['correct', 'redact', 'restore_base'].includes(action) && !detailCurrent()) return;
    const draft = action === 'correct' ? { ...detail, text: $('document-markdown').value } : null;
    const connection = connectionGeneration;
    const expected = batchId; let failed, confirmed = 0; const updates = []; const ownership = ++busyGeneration;
    bulkReviewProgress = !raw() && ['approve', 'revoke'].includes(action) && rows.length > 1
      ? { action, total: rows.length, done: 0 } : null;
    busy = true; render(); status('Entscheidungen werden lokal gespeichert …');
    try {
      if (['approve', 'revoke'].includes(action) && rows.length > 1) {
        const results = await decideSelection(expected, action, rows);
        if (batchId !== expected || connection !== connectionGeneration) return;
        documents = documents.map(value => results.find(row => row.document_id === value.document_id) || value);
        confirmed = results.length; updates.push(...results);
        if (bulkReviewProgress) { bulkReviewProgress.done = confirmed; controls(); }
      } else for (const row of rows) {
        try { const result = await invoke('decide_document_review', { batchId: expected, documentId: row.document_id,
          decision: { action, revision: row.revision, output_sha256: row.output_sha256, ranges, operation_id: operationId() } });
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
      status(raw() && action === 'correct' ? `${rows[0].name}: Korrektur als privater Textstand gespeichert. Die bereits erstellte Markdown-Datei bleibt unverändert. Für eine verwendbare korrigierte Datei diesen Stand auswählen und ausdrücklich eine zusätzliche Kopie speichern.` :
        raw() && action === 'restore_base' ? `${rows[0].name}: Der technisch erzeugte Textstand wurde wiederhergestellt. Die ursprünglich erstellte Markdown-Datei bleibt unverändert.` :
          !raw() && action === 'approve' ? `${rows.length} Freigabeentscheidung${rows.length === 1 ? '' : 'en'} gespeichert. Die Dokumente können später weiter geprüft werden; durch diese Freigabe wurde kein neuer Export erstellt. Dafür die freigegebenen Stände auswählen und die Exportvorschau ausdrücklich öffnen.` :
          `${rows.length} Entscheidung${rows.length === 1 ? '' : 'en'} gespeichert. Ein Export erfolgt nur über den eigenen Exportbutton.`);
      return { batchId: expected, updates };
    } catch (error) { if (connection === connectionGeneration && batchId === expected) {
      for (const row of rows.slice(0, confirmed)) selected.delete(row.document_id);
      if (draft) recoveryDraft = draft;
      clearText(); await reload().catch(() => {}); showError(failed?.error || error, failed?.name || rows.map(row => row.name).join(', '));
      status(['approve', 'revoke'].includes(action) && rows.length > 1
        ? `Die gemeinsame Speicherbestätigung ist unklar. ${$('documents-status').textContent} Der gespeicherte Stand wurde erneut angefordert. Bitte vor einer weiteren Entscheidung den aktuellen Freigabestatus prüfen.`
        : `${confirmed} Entscheidung${confirmed === 1 ? '' : 'en'} bestätigt. ${$('documents-status').textContent} ${Math.max(0, rows.length - confirmed - 1)} weitere Dateien wurden noch nicht bearbeitet.`, true);
      if (draft) $('documents-status').textContent += ' Dein Korrekturentwurf bleibt erhalten; den gespeicherten Stand neu laden, bevor du weiterarbeitest.';
      if (!stateFresh) $('documents-status').textContent += ' Der aktuelle Stand konnte nicht abgefragt werden. Änderungen bleiben bis zum Neuladen gesperrt.';
    } }
    finally { if (batchId === expected) { if (ownership !== busyGeneration) return; busy = false; bulkReviewProgress = null; render(); } }
  }
  function requestApproval() {
    if (busy || !stateFresh || raw() || exportRequest || dirty()) return;
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
    if (!pending || busy || !stateFresh || raw() || exportRequest || dirty() || pending.batchId !== batchId ||
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
      `Nur ${dialogSelection.length} ausgewählte, ${automatic() ? 'aktuell freigegebene (Schnellweg: automatische Erstfreigabe, keine menschliche Prüfung)' : 'ausdrücklich freigegebene'} Markdown-Textstände werden in einen separaten Exportordner kopiert. Er enthält nur diese freigegebenen Markdown-Dateien. ${scope} Weitere verfügbare, aber nicht ausgewählte Dateien sind ebenfalls nicht Teil dieses Exports.`;
    $('document-export-target').textContent = `Ergebnisordner (Bindung beim Export geprüft) → ${namespace(dialogMode)} → ${exportRequest ? `Export-${exportRequest.operationId} (${pendingMetadata || knownExport ? 'gespeicherter Auftrag' : 'Bestätigung des Auftrags noch offen'})` : 'neuer Exportordner'}`;
    $('document-export-filenames-heading').textContent = isRaw ? 'Enthaltene Markdown-Dateien · gespeicherter Dateinamenplan' : 'Enthalten · neutrale Dateinamen';
    $('document-export-confirm').textContent = complete ? 'Empfang bestätigen' : exportRequest ? pendingMetadata ? 'Export erneut abgleichen' : 'Export erneut versuchen' : isRaw ? 'Kopie speichern' : 'Exportieren';
    $('document-export-configure').hidden = !!pendingMetadata || !!knownExport || complete || !!exportRequest && !exportFolderNeeded;
    $('document-export-configure').disabled = busy;
    $('document-export-abandon-option').hidden = !pendingMetadata || complete;
    $('document-export-abandon').hidden = !pendingMetadata || complete;
    controls();
  }
  async function openExportDialog() {
    if (busy || !stateFresh || dirty()) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (!exportRequest && (!rows.length || !raw() && rows.some(row => !row.approved))) return;
    dialogSelection = exportRequest ? exportRequest.selection.map(row => ({ ...row })) : rows.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
    dialogMode = pendingMetadata?.processing_mode || rows[0]?.processing_mode || (raw() ? 'markdown-only' : 'markdown-and-anonymize');
    const expected = batchId, connection = connectionGeneration;
    const ownership = ++busyGeneration; busy = true; render();
    if (dialogMode !== 'markdown-only' && !exportRequest) status(`Exportvorschau für ${dialogSelection.length} Datei${dialogSelection.length === 1 ? '' : 'en'} wird lokal geprüft. Es wird noch kein Export erstellt.`);
    try {
      const plan = await invoke('preview_document_export', { batchId: expected, operationId: exportRequest?.operationId || operationId(), selection: dialogSelection });
      if (expected !== batchId || connection !== connectionGeneration) return;
      if (plan?.ok !== true || plan.processing_mode !== dialogMode || plan.local_ui_only !== true || plan.external_disclosure !== false ||
          !Array.isArray(plan.files) || plan.files.length !== dialogSelection.length || plan.files.some((file, index) =>
            typeof file.name !== 'string' || !file.name.endsWith('.md') || /[\p{Cc}/\\]/u.test(file.name) || file.sha256 !== dialogSelection[index].output_sha256))
        throw Error('AI_EXPORT_INVALID');
      $('document-export-files').replaceChildren(...plan.files.map(file => make('li', file.name)));
      dialogFiles = plan.files.map(file => ({ name: file.name, sha256: file.sha256 }));
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
    if (!stateFresh || dirty() || !validSelection(dialogSelection)) return;
    const rows = documents.filter(row => selected.has(row.document_id));
    if (busy || !batchId || !exportRequest && (!rows.length || !raw() && rows.some(row => !row.approved))) return;
    const connection = connectionGeneration;
    const expected = batchId;
    if (raw() && !exportRequest) {
      // This path is entered only by the explicit modal confirmation, never
      // by opening a preview, loading a document or selecting a checkbox.
      if (dialogMode !== 'markdown-only' || rows.some(row => row.processing_mode !== 'markdown-only') || !dialogFiles || rows.length !== dialogSelection.length ||
          dialogSelection.some(value => !rows.some(row => row.document_id === value.document_id &&
            row.revision === value.revision && row.output_sha256 === value.output_sha256))) { showError(Error('DOCUMENT_REVIEW_STALE')); return; }
      const ownership = ++busyGeneration; busy = true; render();
      $('document-export-configure').disabled = true;
      status('Die ausgewählten Markdown-Stände werden für diese zusätzliche Kopie bestätigt …');
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
        if (plan?.ok !== true || plan.processing_mode !== 'markdown-only' || plan.local_ui_only !== true || plan.external_disclosure !== false ||
            JSON.stringify(plan.files) !== JSON.stringify(dialogFiles)) throw Error('DOCUMENT_REVIEW_STALE');
        dialogSelection = prepared;
      } catch (error) {
        if (expected === batchId && connection === connectionGeneration) {
          clearText(); await reload().catch(() => {}); showError(error, rows.map(row => row.name).join(', '));
          $('documents-status').textContent += ' Keine zusätzliche Kopie gestartet. Die Speicherentscheidung kann bereits gespeichert sein. Bitte den aktuellen Stand prüfen, die gewünschten Dateien erneut auswählen und eine neue Kopiervorschau öffnen.';
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
    if (busy || !batchId || !$('document-export-dialog').open || $('document-export-preview').hidden ||
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
        $('document-export-result').textContent = `Ergebnisordner sicher gewählt. Die Einstellung gilt auch für künftige Läufe; vorhandene Exporte bleiben am bisherigen Ort. Der bestehende Lauf und die Freigabe bleiben erhalten. Wähle „${exportRequest ? 'Export erneut versuchen' : dialogMode === 'markdown-only' ? 'Kopie speichern' : 'Exportieren'}“; es startet kein automatischer Export.`;
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
      if (dirty()) {
        status(id === batchId
          ? 'Dein nicht gespeicherter Korrekturentwurf gehört zu diesem Lauf. Gleiche den gespeicherten Stand ab oder speichere beziehungsweise verwirf den Entwurf ausdrücklich.'
          : 'Ein nicht gespeicherter Korrekturentwurf gehört noch zum angezeigten Lauf. Er wurde nicht in den gewählten Lauf übernommen. Bitte zuerst diesen Entwurf abgleichen, speichern oder ausdrücklich verwerfen.', true);
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
      knownExport = null; confirmedCopy = null; completedCopyCount = 0; documents = []; contentNotices = null; clearText(); renderReceipts(); render();
      status('Verbindung unterbrochen. Aktuelle Stände nach der Wiederverbindung neu laden; keine Entscheidung oder Exportbestätigung wird automatisch gesendet.', true);
    },
    async open(id, options = {}) { if (!this.canOpen(id)) return false;
      // Re-entering even the same run creates a new view owner. A detached
      // post-ACK callback from the previous view cannot invalidate fresh state.
      const ownership = ++busyGeneration;
      completedExportReceipt = null;
      batchId = id; bulkReviewProgress = null; pendingApproval = null; viewedBindings.clear(); confirmedCopy = null; completedCopyCount = 0; documents = []; contentNotices = null; sourceNoticeFacts = null; filterMode = 'notices'; runMode = null; runPolicy = null; processingComplete = false; stateFresh = false; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null; exportFolderNeeded = false; clearText(); renderUnavailable({}); renderReceipts(); render();
      $('documents-run').textContent = `Lauf-ID: ${id}`; status('Private Dokumentprüfstände werden geladen …');
      try {
        if (!await reload() || batchId !== id || options.exportPreview !== true) return;
        // An explicit history action may propose the complete selection, never
        // approval or target I/O. A stale history snapshot must not turn into
        // a partial export or an automatic replay of an older pending intent.
        if (stateFresh && runMode === 'markdown-and-anonymize' && !exportRequest && documents.length &&
            documents.every(row => row.approved) && unavailableReviewCount === 0) {
          selected = new Set(documents.map(row => row.document_id)); render(); await openExportDialog();
        } else status('Der gespeicherte Stand wurde neu geladen. Die vollständige Exportvorschau ist noch nicht verfügbar; offene Prüfstände oder Exportaufträge zuerst abgleichen.', true);
      } catch (error) { if (batchId === id && ownership === busyGeneration) showError(error); }
    },
    async close() { if (busy || dirty()) { if (dirty()) status('Ungespeicherte Markdown-Korrektur zuerst speichern oder ausdrücklich verwerfen.'); return false; } connectionGeneration++; ticket++; loading = false; bulkReviewProgress = null; pendingApproval = null; viewedBindings.clear(); batchId = null; confirmedCopy = null; completedExportReceipt = null; completedCopyCount = 0; documents = []; contentNotices = null; sourceNoticeFacts = null; filterMode = 'notices'; runMode = null; runPolicy = null; selected.clear(); exportRequest = null; knownExport = null; pendingMetadata = null; exportFolderNeeded = false;
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
        if (loadedMarkdown === draft.text) { recoveryDraft = null; status(`${draft.name}: Der gespeicherte Text stimmt mit deinem Korrekturentwurf überein. Du kannst bei Bedarf eine zusätzliche Markdown-Kopie speichern.`); }
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
    if (busy || !stateFresh || !raw() || !contentNotices || exportRequest || dirty()) { controls(); return; }
    const next = $('documents-filter').value;
    if (!['notices', 'edited', 'all', 'without'].includes(next) || next === filterMode) return;
    filterMode = next; selected.clear();
    if (detail && !visibleDocuments().some(row => row.document_id === detail.document_id)) clearText();
    render(); status(`${visibleDocuments().length} von ${documents.length} Markdown-Dateien angezeigt. Die vorherige Auswahl wurde aufgehoben. Häkchen und „Vorherige/Nächste Datei“ gelten nur für diese Ansicht.`);
  });
  $('documents-all').addEventListener('change', () => { if (busy || !stateFresh || exportRequest) return;
    const shown = visibleDocuments(); selected = new Set($('documents-all').checked ? shown.map(row => row.document_id) : []); render(); });
  $('entities-all').addEventListener('change', () => { if (busy || exportRequest) return;
    entitySelected = new Set($('entities-all').checked ? entityRows.filter(row => !row.disabled).map(row => row.entity_id) : []); controls(); });
  $('entities-apply').addEventListener('click', applyEntities);
  $('entities-scope').addEventListener('change', controls);
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
    if (!detailCurrent()) { actionStatus('Bitte zuerst links ein aktuelles Dokument öffnen.', true); return; }
    const start = node.selectionStart, end = node.selectionEnd;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end) {
      const message = 'Bitte den zusätzlich zu maskierenden Text im rechten Markdown-Feld markieren. Eine Markierung links im Originaltext genügt nicht.';
      actionStatus(message, true); status(message, true); return;
    }
    pendingDocumentChange = { action: 'redact', row: { ...detail }, ranges: [{ start, end }] };
    $('document-change-confirm-text').textContent = `${end - start} Zeichen in ${detail.name} markiert. Noch nichts geändert. „Maskierung jetzt speichern“ ersetzt nur diese Stelle, erzeugt einen neuen Prüfstand und hebt die Freigabe dieser Datei auf. Bereits erstellte Exporte bleiben unverändert.`;
    $('document-change-save').textContent = 'Maskierung jetzt speichern';
    controls(); $('document-change-save').focus();
    actionStatus('Maskierung vorbereitet, noch nicht gespeichert. Bitte die Auswirkung prüfen und ausdrücklich bestätigen oder abbrechen.');
  });
  $('document-restore').addEventListener('click', () => {
    if (!detailCurrent() || raw()) return;
    pendingDocumentChange = { action: 'restore_base', row: { ...detail }, ranges: [] };
    $('document-change-confirm-text').textContent = `${detail.name}: Noch nichts geändert. Das Speichern stellt den automatisch erzeugten Basisstand dieser Datei wieder her und verwirft ihre späteren Text- und Entitätenänderungen. Die Freigabe wird aufgehoben; frühere Exporte bleiben unverändert.`;
    $('document-change-save').textContent = 'Basisstand jetzt wiederherstellen';
    controls(); $('document-change-save').focus();
    actionStatus('Wiederherstellung vorbereitet, noch nicht gespeichert. Bitte ausdrücklich bestätigen oder abbrechen.');
  });
  $('document-change-cancel').addEventListener('click', () => {
    if (busy) return;
    pendingDocumentChange = null; controls(); $('document-redact').focus();
    actionStatus('Änderung abgebrochen. Der gespeicherte Textstand bleibt unverändert.');
  });
  $('document-change-save').addEventListener('click', async () => {
    const pending = pendingDocumentChange;
    if (!pending || !detailCurrent() || !sameDocumentBinding(detail, pending.row) || busy) {
      pendingDocumentChange = null; controls();
      actionStatus('Der vorbereitete Textstand ist nicht mehr aktuell. Bitte die Datei neu öffnen und die Änderung erneut prüfen.', true);
      return;
    }
    pendingDocumentChange = null; controls();
    actionStatus('Änderung wird lokal gespeichert …');
    const result = await decideRows(pending.action, [detail], pending.ranges);
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
    if (!detail || !sameDocumentBinding(detail, updated)) {
      actionStatus('Änderung gespeichert, der neue Text konnte aber nicht geöffnet werden. Bitte den gespeicherten Stand neu laden.', true);
      return;
    }
    const message = pending.action === 'redact'
      ? `${updated.name}: Zusätzliche Maskierung in Stand ${updated.revision} gespeichert. Prüfe rechts den Platzhalter [MANUAL_REDACTION]. Diese Datei ist noch nicht freigegeben; ein Export wurde nicht gestartet.`
      : `${updated.name}: Technisch geprüfter Basisstand als Stand ${updated.revision} gespeichert. Prüfe den Text erneut und gib diese Datei bei Bedarf ausdrücklich frei. Frühere Exporte bleiben unverändert.`;
    actionStatus(message); status(message);
  });
  controls();
})();
