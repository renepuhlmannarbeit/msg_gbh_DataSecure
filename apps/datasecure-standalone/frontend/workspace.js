'use strict';

// Rendering owns no file paths or privacy decisions. Sources belong to the
// sidecar; starts carry only its opaque IDs and catalogue revision (DS-110).
(() => {
  const $ = id => document.getElementById(id);
  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  const states = { ready: 'Bereit', preparing: 'Wird vorbereitet', processing: 'Wird verarbeitet',
    review_required: 'Prüfung erforderlich', stopped: 'Fortsetzung möglich', paused: 'Pausiert',
    results_available: 'Verarbeitung abgeschlossen', completed_without_results: 'Keine Ergebnisse erstellt',
    export_pending: 'Bereitstellung offen', failed: 'Verarbeitung unterbrochen', blocked: 'Nicht bereit' };
  const reasons = {
    STANDALONE_PAUSE_RETENTION_UNAVAILABLE: 'Bei sofortiger Löschung der Arbeitskopien ist keine dauerhafte Pause möglich. Diesen Lauf abschließen; für künftige Läufe die Aufbewahrung prüfen.',
    STANDALONE_PAUSE_INVALID: 'Der gespeicherte Pausestand konnte nicht sicher gelesen werden. Bitte den Laufstatus und die lokale Installation prüfen.',
    STANDALONE_PAUSE_UNAVAILABLE: 'Dieser Lauf ist nicht mehr pausierbar. Bitte seinen aktuellen Status im Verlauf prüfen.',
    STANDALONE_PAUSE_CONTROL_BUSY: 'Der Lauf speichert gerade seinen Zustand. Pause noch nicht bestätigt; bitte erneut versuchen.',
    STANDALONE_PAUSE_CONTROL_INVALID: 'Der Pausestand konnte nicht sicher bestätigt werden. Keine weitere Datei wird ungeprüft gestartet; bitte den Laufstatus erneut prüfen.',
    LOCAL_MAPPING_PENDING: 'Die lokale Ergebniszuordnung dieser Datei ist noch nicht gespeichert. Lauf fortsetzen, um sie erneut abzugleichen.',
    SOURCE_FORMAT_UNSUPPORTED: 'Dieses Dateiformat wird nicht unterstützt.', SOURCE_FILE_EMPTY: 'Die Datei ist leer.',
    SOURCE_FORMAT_SIZE_LIMIT: 'Die Datei überschreitet die Einzeldateigrenze ihres Formats.',
    SOURCE_ACCESS_DENIED: 'Das Betriebssystem hat den Lesezugriff verweigert.',
    SOURCE_READ_FAILED: 'Die Datei konnte nicht gelesen werden.', SOURCE_PATH_UNSAFE: 'Der Pfad ist keine sichere reguläre lokale Datei.',
    SOURCE_IDENTITY_CHANGED: 'Die Datei hat sich seit der Auswahl verändert.',
    SOURCE_ENCRYPTED_UNSUPPORTED: 'Die Datei ist verschlüsselt oder passwortgeschützt. Eine ungeschützte Kopie separat auswählen.',
    PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED: 'Die Datei ist passwortgeschützt. Kein Entsperren in DataSecure möglich.',
    LOCAL_REVIEW_TOO_LARGE: 'Die lokale Prüfgrenze wurde überschritten. Das Dokument in kleinere Teile aufteilen.',
    AMBIGUITY_REVIEW_REQUIRED: 'Die Datenschutzprüfung konnte den Inhalt nicht sicher freigeben.',
    RESIDUAL_PII: 'Die abschließende Prüfung hat noch mögliche personenbezogene Inhalte gefunden.',
    PARSE_FAILED: 'Der Dateiinhalt konnte nicht vollständig gelesen werden. Die Quelldatei in der Ursprungsanwendung prüfen und eine neue Kopie auswählen.',
    CONVERSION_EXECUTABLE_DENIED: 'Das Betriebssystem hat den Start der Konvertierung verweigert. Mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
    CONVERSION_EXECUTABLE_MISSING: 'Eine Konvertierungskomponente fehlt. Das vollständige Paket neu entpacken.',
    CONVERSION_LIMIT_SETUP_FAILED: 'Die Schutzgrenzen der Konvertierung konnten nicht eingerichtet werden.',
    PROCESSING_INTERRUPTED: 'Die lokale Verarbeitung wurde unterbrochen.', WORKER_EXITED: 'Der Verarbeitungsprozess wurde unerwartet beendet.',
    STANDALONE_BUSY: 'Ein lokaler Vorgang ist bereits aktiv. Bitte warten.',
    STANDALONE_SELECTION_INVALID: 'Die Auswahl ist nicht mehr aktuell oder überschreitet eine Grenze. Bitte Auswahl erneut prüfen.',
    STANDALONE_START_FAILED: 'Der Start ist nicht bestätigt. Nicht erneut starten; den Verlauf aktualisieren.',
    STANDALONE_IPC_FAILED: 'Die lokale Verbindung wurde unterbrochen. Status erneut laden; nicht blind neu starten.',
    STANDALONE_CONNECTION_CHANGED: 'Die lokale Verbindung wird erneuert. Kein Start und keine Entscheidung werden automatisch wiederholt. Die Dateiauswahl muss danach erneut aufgenommen werden.',
    STANDALONE_CONNECTION_RECOVERY_BLOCKED: 'Der vorherige lokale Prozess oder Export ist noch nicht sicher beendet. DataSecure wartet; es wird kein zweiter Prozess gestartet. Bitte Diagnose prüfen, falls dieser Zustand bestehen bleibt.',
    STANDALONE_ADMISSION_TIMEOUT: 'Die Aufnahme konnte innerhalb von fünf Minuten nicht bestätigt werden. Bitte den lokalen Zugriff prüfen.',
    SOURCE_FOLDER_FILE_LIMIT: 'Der sichere Quellenkatalog ist zu groß (höchstens 1.000 Dateien oder zu lange Dateilisten). Bitte einen kleineren Unterordner auswählen. Die bisherige Auswahl bleibt erhalten.',
    SOURCE_FOLDER_SIZE_LIMIT: 'Die aufgenommenen Dateien überschreiten zusammen 500 MB. Bitte einen kleineren Ordner auswählen.',
    STANDALONE_DOCUMENT_VIEW_UNAVAILABLE: 'Die Ergebnisprüfung konnte nicht geöffnet werden. Bitte das vollständige App-Paket verwenden. Die gespeicherten Entscheidungen bleiben erhalten; kein Lauf wurde neu gestartet.'
  };
  let catalogue = [], selected = new Set(), knownIds = new Set(), revision = 0, mode = '', expanded = new Map();
  let busy = false, closed = false, view = 'new', generation = 0, current = null, job = null;
  let timer, refreshing = false, historyGeneration = 0, lastJobSignature = '', problemSignature = '', acknowledged;
  let lastJobAnnouncement = '';
  const unlisteners = [];
  const disabledBeforeBusy = new Map();
  const problemRequests = new WeakMap();
  const expandedHistoryProblems = new Set();
  const expandedHistorySummaries = new Set();
  const expandedHistoryExtras = new Set();
  const historySummaryRequests = new WeakMap();
  let historySummaryEpoch = 0;
  let historySignature = '';
  let lastError = null;
  let reviewOrigin = null, documentsOrigin = 'history', admitting = false;
  let connectionEpoch = 0, reconnecting = false, contextRequired = false;
  let busyGeneration = 0, dropOwnership = null;
  // Webview runtimes do not uniformly inject their API into child frames.
  // The same-origin review uses this closed facade instead of depending on
  // iframe injection or exposing a generic parent command bridge.
  const reviewCommands = new Set(['get_review_session', 'get_review_chunk',
    'submit_review', 'continue_review_session', 'close_review_window']);
  Object.defineProperty(window, '__DATASECURE_REVIEW__', { value: Object.freeze({
    async invoke(command, args) {
      const owner = reviewOrigin;
      if (closed || view !== 'review' || !owner || owner.closing || !reviewCommands.has(command)) throw Error('STANDALONE_REVIEW_SURFACE_INVALID');
      // Completion is learned only from this owned native session, never a
      // child-frame claim or the number of rendered/staged decisions.
      if (command === 'close_review_window') owner.closing = true;
      if (command === 'submit_review' || command === 'continue_review_session') owner.complete = false;
      try {
        const result = await invoke(command, args);
        if (command !== 'close_review_window' && (owner !== reviewOrigin || owner.closing)) throw Error('STANDALONE_REVIEW_SURFACE_INVALID');
        if (command === 'get_review_session') owner.complete = result?.ready === false && result.run_complete === true;
        return result;
      } catch (error) {
        if (owner === reviewOrigin && command === 'close_review_window') owner.closing = false;
        throw error;
      }
    }
  }) });
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const safeLabel = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    !/^[/\\]|^[A-Za-z]:/u.test(value) && !/[:\\\u0000-\u001f\u007f]/u.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node; };
  const button = (label, action, primary = false) => { const node = element('button', label, primary ? 'primary' : '');
    node.addEventListener('click', () => { if (!node.disabled) action(); }); return node; };
  function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').hidden = !message;
    $('feedback').className = `notice${error ? ' error' : ''}`; }
  function errorCode(error) { const raw = error?.code || error?.message || String(error);
    try { const value = JSON.parse(raw); return /^[A-Z][A-Z0-9_]{1,80}$/u.test(value?.code) ? value.code : 'STANDALONE_OPERATION_FAILED'; }
    catch { return /^[A-Z][A-Z0-9_]{1,80}$/u.test(raw) ? raw : 'STANDALONE_OPERATION_FAILED'; } }
  function showError(error) { const code = errorCode(error); feedback(`${reasons[code] || 'Der lokale Vorgang konnte nicht abgeschlossen werden. Bitte Diagnose und aktuellen Laufstatus prüfen.'} (${code})`, true); }
  function setControlDisabled(node, value) {
    // A background read may finish while a native command holds the global
    // interaction lock. Update its eventual logical state, not just the DOM:
    // restoring a snapshot captured earlier must not resurrect a stale lock.
    if (busy) { disabledBeforeBusy.set(node, Boolean(value)); node.disabled = true; }
    else node.disabled = Boolean(value);
  }
  function setBusy(value) {
    if (value === busy) return;
    busy = value;
    if (value) for (const node of document.querySelectorAll('button:not(.nav-tab), input')) {
      disabledBeforeBusy.set(node, node.disabled); node.disabled = true;
    }
    else { for (const [node, disabled] of disabledBeforeBusy) node.disabled = disabled; disabledBeforeBusy.clear(); }
    $('start').disabled = false; updateStart();
  }
  function beginBusy() { const ownership = ++busyGeneration; setBusy(true); return ownership; }
  function endBusy(ownership) { if (ownership === busyGeneration && !closed) setBusy(false); }
  async function perform(command, args) {
    if (busy || closed || reconnecting) return null;
    const connection = connectionEpoch;
    generation++; lastError = null; const ownership = beginBusy();
    try { const result = await invoke(command, args); return connection === connectionEpoch ? result : null; }
    catch (error) { if (connection !== connectionEpoch) return null; lastError = errorCode(error); showError(error); return null; }
    finally { endBusy(ownership); }
  }
  function showView(next) {
    if (closed) return;
    if (view === 'documents' && next !== 'documents') {
      window.__DATASECURE_DOCUMENTS__?.close().then(ok => { if (ok) { view = ''; showView(next); } }); return;
    }
    // Never discard an unsubmitted review on ordinary navigation.
    if (view === 'review' && next !== 'review') { feedback('Bitte die Prüfung mit „Später entscheiden“ oder „Zur Verarbeitung“ verlassen. Nicht übergebene Eingaben bleiben sonst nur in dieser Ansicht.'); return; }
    if (next !== view) {
      historySummaryEpoch++;
      // Re-entering history must not present a previous approval snapshot as
      // current after document edits. Polling unchanged rows still keeps focus.
      if (next === 'history') historySignature = '';
    }
    view = next;
    for (const name of ['new', 'history', 'settings', 'review', 'documents']) $(name + '-view').hidden = name !== next;
    for (const name of ['new', 'history', 'settings']) { const node = $('nav-' + name); const active = name === (['review', 'documents'].includes(next) ? 'history' : next);
      node.className = `nav-tab${name === 'settings' ? ' settings-tab' : ''}${active ? ' active' : ''}`;
      node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1;
      node.setAttribute('aria-controls', name === 'history' && next === 'review' ? 'review-view' : name + '-view'); }
    if (next === 'history') refreshHistory();
  }
  function updateStart() {
    const chosen = catalogue.filter(item => item.selectable && selected.has(item.source_id));
    const bytes = chosen.reduce((total, item) => total + count(item.bytes), 0);
    const tooLarge = chosen.length > 200 || bytes > 500 * 1024 * 1024;
    const hint = reconnecting ? 'Die lokale Verbindung wird wiederhergestellt. Bitte warten.' : busy ? 'Ein lokaler Vorgang ist aktiv. Bitte warten.' : !mode && !chosen.length ? 'Bitte Aufgabe und Dateien auswählen.'
      : !mode ? 'Bitte zuerst eine Aufgabe auswählen.' : !chosen.length ? 'Bitte mindestens eine geeignete Datei anhaken.'
      : tooLarge ? 'Auswahl zu groß.' : '';
    $('start').setAttribute('aria-disabled', String(Boolean(hint)));
    $('start').setAttribute('aria-describedby', tooLarge ? 'start-hint selection-limit' : 'start-hint');
    $('start-hint').textContent = hint || `${chosen.length} Datei${chosen.length === 1 ? '' : 'en'} ${chosen.length === 1 ? 'wird' : 'werden'} lokal verarbeitet.`;
    $('selection-limit').hidden = !tooLarge;
    $('selection-limit').textContent = tooLarge ? 'Zu viele Dateien oder zu große Auswahl: max. 200 Dateien / 500 MB pro Lauf – bitte die Häkchenauswahl verkleinern.' : '';
    $('file-section').className = `card-section files-section${!mode ? ' no-mode' : ''}`;
    $('ocr-option').hidden = mode !== 'markdown-only';
    return !hint;
  }
  function checkState(input, items) { const eligible = items.filter(item => item.selectable), n = eligible.filter(item => selected.has(item.source_id)).length;
    input.checked = eligible.length > 0 && n === eligible.length; input.indeterminate = n > 0 && n < eligible.length;
    input.disabled = busy || !eligible.length; input.setAttribute('aria-checked', input.indeterminate ? 'mixed' : String(input.checked)); }
  function chooseItems(items, checked) { for (const item of items) if (item.selectable) checked ? selected.add(item.source_id) : selected.delete(item.source_id); renderTree(); }
  function treeGroups() {
    const root = { key: '', name: 'Dateien', files: [], children: new Map(), items: catalogue };
    for (const item of catalogue) {
      const parts = item.name.split('/'); parts.pop(); let node = root;
      for (const part of parts) {
        const key = node.key ? `${node.key}/${part}` : part;
        if (!node.children.has(part)) node.children.set(part, { key, name: part, files: [], children: new Map(), items: [] });
        node = node.children.get(part); node.items.push(item);
      }
      node.files.push(item);
    }
    const groups = []; const collect = (node, depth) => {
      if (node.key || node.files.length) groups.push({ ...node, items: node.key ? node.items : node.files, depth });
      for (const child of node.children.values()) collect(child, node.key ? depth + 1 : depth);
    };
    collect(root, 0); return groups;
  }
  function renderTree() {
    const focused = document.activeElement?.id;
    $('source-tree').replaceChildren(); $('catalogue').hidden = !catalogue.length;
    $('drop-zone').hidden = catalogue.length > 0 || admitting;
    $('admission-status').hidden = !admitting;
    $('catalogue-count').textContent = `${catalogue.length} Dateien`;
    const chosen = catalogue.filter(item => item.selectable && selected.has(item.source_id));
    $('selection-count').textContent = `${chosen.length} von ${catalogue.filter(item => item.selectable).length} ausgewählt`;
    checkState($('select-all'), catalogue);
    const groups = treeGroups();
    // Decide the whole initial path before rendering descendants. Preserve
    // later user collapses rather than reopening a folder on each checkbox.
    groups.forEach(({ key, items }, index) => {
      if (!expanded.has(key)) expanded.set(key, catalogue.length <= 12 || index === 0 || items.some(item => !item.selectable));
    });
    const ancestorsOpen = folder => !folder.includes('/') || folder.split('/').slice(0, -1).every((_, i, parts) => expanded.get(parts.slice(0, i + 1).join('/')));
    groups.forEach(({ key: folder, name, files, items, depth }, index) => {
      const group = element('div', undefined, 'source-group'), heading = element('div', undefined, 'group-heading');
      group.hidden = !ancestorsOpen(folder); group.dataset.depth = String(depth);
      // Depth is bounded by the native folder admission; avoid inline styles.
      for (let n = 0; n < Math.min(depth, 8); n++) heading.append(element('span', undefined, 'tree-indent'));
      const collapse = button(expanded.get(folder) ? '⌄' : '›', () => { expanded.set(folder, !expanded.get(folder)); renderTree(); });
      collapse.id = `group-toggle-${index}`; collapse.className = 'collapse'; collapse.setAttribute('aria-expanded', String(expanded.get(folder)));
      collapse.setAttribute('aria-controls', `group-files-${index}`); collapse.setAttribute('aria-label', `${folder} ${expanded.get(folder) ? 'zuklappen' : 'aufklappen'}`);
      const label = element('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = `group-select-${index}`; checkState(input, items);
      input.addEventListener('change', () => chooseItems(items, input.checked)); label.append(input, element('span', name)); label.title = folder || 'Dateien';
      heading.append(collapse, label, element('span', `${items.filter(item => item.selectable && selected.has(item.source_id)).length}/${items.filter(item => item.selectable).length}`, 'meta'));
      const unavailable = items.filter(item => !item.selectable).length;
      if (unavailable) heading.append(element('span', `${unavailable} nicht verfügbar`, 'pill warning'));
      const content = element('div', undefined, 'group-files'); content.id = `group-files-${index}`; content.hidden = !expanded.get(folder);
      for (const item of files) {
        const row = element('div', undefined, `file-row${!item.selectable ? ' blocked' : selected.has(item.source_id) ? ' selected' : ''}`);
        for (let n = 0; n < Math.min(depth, 8); n++) row.append(element('span', undefined, 'tree-indent'));
        if (item.selectable) {
          const label = element('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = `source-${item.source_id}`;
          input.checked = selected.has(item.source_id); input.disabled = busy;
          input.addEventListener('change', () => { chooseItems([item], input.checked); });
          label.append(input, element('span', item.name.split('/').at(-1), 'file-name')); label.title = item.name;
          row.append(label); if (item.ocr_required === true) row.append(element('span', 'OCR', 'pill neutral'));
        } else { const filename = element('span', item.name.split('/').at(-1), 'file-name'); filename.title = item.name; filename.tabIndex = 0;
          row.append(element('span', '⊘', 'muted'), filename, element('span', reasons[item.reason_code] || 'Nicht verfügbar', 'reason')); }
        content.append(row);
      }
      group.append(heading, content); $('source-tree').append(group);
    });
    const ocrImages = chosen.filter(item => item.ocr_required === true).length;
    const withinLimit = chosen.length <= 200 && chosen.reduce((total, item) => total + count(item.bytes), 0) <= 500 * 1024 * 1024;
    const summary = [element('span', withinLimit && chosen.length ? `✓ ${chosen.length} zur Verarbeitung` : `${chosen.length} Dateien ausgewählt`)];
    const unavailable = catalogue.filter(item => !item.selectable).length;
    if (unavailable) summary.push(element('span', `${unavailable} nicht verfügbar`));
    if (ocrImages) summary.push(element('span', `${ocrImages} ${ocrImages === 1 ? 'Bild' : 'Bilder'} mit OCR`));
    if (chosen.some(item => /\.pdf$/iu.test(item.name))) summary.push(element('span', 'PDF-Bedarf wird bei der Verarbeitung geprüft'));
    $('selection-summary').replaceChildren(...summary);
    $('expand-all').textContent = groups.every(({ key }) => expanded.get(key)) ? 'Alle zuklappen' : 'Alle aufklappen';
    updateStart(); if (focused && $(focused)) $(focused).focus();
  }
  function applyContext(context) {
    if (context?.local_ui_only !== true || context.external_disclosure !== false) throw Error('STANDALONE_CONTEXT_INVALID');
    $('destination').textContent = context.result_folder || 'Standardordner'; $('settings-destination').textContent = context.result_folder || 'Standardordner';
    if (!Array.isArray(context.source_catalogue)) return;
    catalogue = context.source_catalogue.filter(item => safeLabel(item.name) &&
      (item.selectable === false || item.selectable === true && /^[a-f0-9]{32}$/u.test(item.source_id)));
    revision = context.catalogue_revision;
    const ids = new Set(catalogue.filter(item => item.selectable).map(item => item.source_id));
    selected = new Set([...selected].filter(id => ids.has(id)));
    for (const id of ids) if (!knownIds.has(id)) selected.add(id);
    knownIds = ids;
    const folders = context.source_folders || [];
    $('set-name').textContent = folders.length === 1 ? folders[0].split(/[\\/]/u).filter(Boolean).at(-1) : 'Dateiauswahl';
    renderTree();
  }
  async function pick(command) {
    if (busy) return;
    const connection = connectionEpoch;
    admitting = true; renderTree();
    const result = await perform(command);
    if (connection !== connectionEpoch) return;
    admitting = false; renderTree();
    if (!result || result.cancelled) return;
    try { applyContext(result.ui_context); $('add-options').hidden = true; $('add-more').setAttribute('aria-expanded', 'false');
      feedback('Dateien aufgenommen. Häkchen prüfen und dann starten.'); $('select-all').focus(); } catch (error) { showError(error); }
  }
  async function clearFiles() { if (!await perform('cancel_admission')) return; catalogue = []; selected.clear(); knownIds.clear(); expanded.clear(); renderTree(); feedback(''); }
  async function start() {
    if (!updateStart() || job) return;
    const files = catalogue.filter(item => item.selectable && selected.has(item.source_id));
    const snapshot = { task: mode, name: $('set-name').textContent, files: files.map(item => item.name) };
    const args = { processingMode: mode, sourceIds: files.map(item => item.source_id), catalogueRevision: revision };
    if (mode === 'markdown-and-anonymize') args.outputNamingMode = 'neutral';
    else if ($('ocr-review').checked) args.ocrContactReview = true;
    const result = await perform('start_admitted_batch', args);
    if (!result) {
      if (['STANDALONE_START_FAILED', 'STANDALONE_IPC_FAILED', 'STANDALONE_IPC_TIMEOUT'].includes(lastError)) {
        await invoke('cancel_admission').catch(() => {});
        catalogue = []; selected.clear(); knownIds.clear(); renderTree();
        feedback('Der Start ist nicht bestätigt. Die Auswahl wird nicht nochmals gestartet. Bitte im Verlauf den tatsächlichen Laufstatus prüfen.', true);
        showView('history');
      }
      schedule(500); return;
    }
    adoptRun({ ...snapshot, batchId: result.batch_id, selectedCount: files.length }); catalogue = []; selected.clear(); knownIds.clear();
    feedback('Verarbeitung gestartet. Der aktuelle Lauf ist im Verlauf hervorgehoben.');
    showView('history'); $('nav-history').focus(); await refresh();
  }
  function adoptRun(run) {
    job = run; mode = run.task;
    lastJobAnnouncement = ''; $('job-announcement').textContent = '';
    $('setup').hidden = true; $('job').hidden = false;
    $('job-task').textContent = run.task === 'markdown-only' ? 'Nur umwandeln' : 'Umwandeln und anonymisieren';
    $('job-name').textContent = run.name; $('job-count').textContent = `${run.selectedCount} Dateien`;
    $('job-files').replaceChildren(...run.files.map(name => element('li', name)));
    $('job-files').hidden = true; $('job-files-toggle').hidden = !run.files.length;
    $('job-files-toggle').setAttribute('aria-expanded', 'false'); $('job-files-toggle').textContent = 'Dateien anzeigen ⌄';
    $('file-problems').hidden = true; lastJobSignature = ''; problemSignature = ''; acknowledged = null;
  }
  async function openDocuments(batchId, exportPreview = false, origin = view) {
    if (closed || reconnecting || contextRequired) return;
    if (!/^[a-f0-9]{64}$/u.test(batchId || '')) { showError(Error('STANDALONE_SELECTION_INVALID')); return; }
    if (typeof window.__DATASECURE_DOCUMENTS__?.open !== 'function') {
      showView(origin === 'new' ? 'new' : 'history');
      showError(Error('STANDALONE_DOCUMENT_VIEW_UNAVAILABLE')); return;
    }
    documentsOrigin = origin === 'new' ? 'new' : 'history';
    $('documents-back').textContent = documentsOrigin === 'history' ? 'Zum Verlauf' : 'Zur Verarbeitung';
    showView('documents'); $('documents-heading').focus();
    if (view !== 'documents') return;
    try { await window.__DATASECURE_DOCUMENTS__.open(batchId, { exportPreview }); }
    catch (error) { showError(error); }
  }
  async function resumeRun(entry, review = false) {
    if (catalogue.length) { feedback('Bitte die vorbereitete Dateiauswahl zuerst leeren, bevor du einen vorhandenen Lauf fortsetzt.', true); return; }
    if (!await perform('continue_history_batch', { batchId: entry.batch_id })) return;
    const previous = job?.batchId === entry.batch_id ? job : null;
    adoptRun({ batchId: entry.batch_id, task: entry.processing_mode, name: previous?.name || `Lauf ${entry.batch_id.slice(0, 8)}`,
      files: previous?.files || [], selectedCount: count(entry.selected_count) });
    if (review) await beginReview(entry.batch_id, false);
    else { showView('new'); await refresh(); $('job-title').focus(); }
  }
  async function newJob() {
    if (busy || ['preparing', 'processing'].includes(current?.state)) return;
    if (!await perform('cancel_admission')) return;
    job = null; catalogue = []; knownIds.clear(); selected.clear(); mode = ''; current = null; generation++;
    lastJobAnnouncement = ''; $('job-announcement').textContent = '';
    $('mode-markdown').checked = false; $('mode-anonymize').checked = false; $('setup').hidden = false; $('job').hidden = true;
    $('file-problems').hidden = true; $('job-files').hidden = true; $('job-files-toggle').setAttribute('aria-expanded', 'false');
    renderTree(); showView('new'); feedback(''); $('mode-markdown').focus();
  }
  async function beginReview(batchId, needsContinue = true) {
    if (busy || catalogue.length) { feedback('Bitte die vorbereitete Dateiauswahl zuerst leeren, bevor du einen vorhandenen Lauf fortsetzt.', true); return; }
    if (!/^[a-f0-9]{64}$/u.test(batchId || '')) { showError(Error('STANDALONE_SELECTION_INVALID')); return; }
    if (needsContinue) {
      const result = await perform(batchId ? 'continue_history_batch' : 'continue_current_batch', batchId ? { batchId } : undefined);
      if (!result) return;
    }
    // Same-origin local frame; its broker still checks the exact owned draft.
    // No source text crosses postMessage, query parameters or browser storage.
    const opened = await perform('open_embedded_review');
    if (!opened) return;
    if (opened.ok !== true || !Number.isSafeInteger(opened.review_generation) || opened.review_generation < 1) {
      showError(Error('STANDALONE_REVIEW_SURFACE_INVALID')); return;
    }
    reviewOrigin = { view, batchId, nativeGeneration: opened.review_generation, complete: false, closing: false };
    $('review-heading').textContent = `Prüfen: ${job?.batchId === batchId ? job.name : `Lauf ${batchId.slice(0, 8)}`}`;
    $('review-scope').textContent = job?.batchId === batchId
      ? `${job.selectedCount} Dateien · Entscheidungen gelten für diesen Lauf`
      : 'Entscheidungen gelten für diesen Lauf';
    $('review-frame').src = 'review.html?embedded=1'; showView('review');
    feedback(''); $('review-heading').focus();
  }
  async function problems(target, batchId) {
    const ticket = { generation, batchId };
    problemRequests.set(target, ticket);
    const isCurrent = () => !closed && target.isConnected && generation === ticket.generation && problemRequests.get(target) === ticket;
    try {
      const result = await invoke('get_run_failures', { batchId: batchId || null });
      if (!isCurrent()) return;
      if (result?.local_ui_only !== true || result.external_disclosure !== false) throw Error('STANDALONE_FAILURE_DETAILS_INVALID');
      target.replaceChildren();
      for (const file of (result.files || []).slice(0, 200)) {
        if (!safeLabel(file.name)) continue;
        const card = element('div', undefined, 'problem-card'); card.append(element('strong', file.name),
          element('p', reasons[file.reason_code] || 'Die Verarbeitung wurde sicher gestoppt. Die Originaldatei bleibt unverändert.'),
          element('code', /^[A-Z][A-Z0-9_]{1,80}$/u.test(file.reason_code) ? file.reason_code : 'PROCESSING_STOPPED'));
        target.append(card);
      }
      for (const file of (result.pending_files || []).slice(0, 200)) if (safeLabel(file.name)) target.append(element('p', `${file.name} – noch nicht gestartet, kein nachgewiesener Dokumentfehler.`, 'meta'));
      if (result.available === false && target.children.length && Number.isSafeInteger(result.total) && result.total > result.files.length)
        target.append(element('p', `Für ${result.total - result.files.length} weitere Dateien sind die lokalen Dateidetails nicht mehr verfügbar. Keine vollständige Fehlerliste ableitbar.`, 'meta'));
      if (!target.children.length) target.append(element('p', 'Keine Dateidetails mehr verfügbar. Die technischen Protokolle enthalten bewusst keine Originalnamen.', 'meta'));
    } catch { if (!isCurrent()) return; target.replaceChildren(element('p', 'Die Dateiliste konnte nicht geladen werden. Der Lauf wird nicht erneut gestartet.', 'meta'),
      button('Dateiliste erneut laden', () => problems(target, batchId))); }
  }
  function renderJob(state) {
    if (!job) return;
    // Only replace focus that this render actually removes. Background updates
    // must never move the user out of navigation, a dialog or another panel.
    const focusedAction = view === 'new' && document.activeElement?.id?.startsWith('job-action-')
      ? document.activeElement.id : null;
    const restoreActionFocus = () => { if (focusedAction) ($(focusedAction) || $('job-title')).focus(); };
    const action = (id, label, handler, primary = false) => {
      const node = button(label, handler, primary); node.id = `job-action-${id}`; return node;
    };
    if (state.batch_id !== job.batchId) {
      $('job-title').textContent = 'Laufstatus wird abgeglichen';
      $('job-description').textContent = 'Der angezeigte Status gehört nicht bestätigt zu diesem Lauf. Bitte den Verlauf aktualisieren.';
      $('job-actions').replaceChildren(action('history', 'Verlauf öffnen', () => showView('history')));
      restoreActionFocus();
      $('file-problems').hidden = true; return;
    }
    const signature = JSON.stringify(state); if (signature === lastJobSignature) return; lastJobSignature = signature;
    const working = ['preparing', 'processing'].includes(state.state);
    $('job-icon').textContent = working ? '⚙' : state.failed_count || state.review_count ? '!' : '✓';
    $('job-icon').className = `status-icon${working ? ' working' : ''}`;
    $('job-title').textContent = states[state.state] || 'Status wird geprüft';
    const total = count(state.selected_count) || job.selectedCount, done = count(state.completed_count), failed = count(state.failed_count), reviews = count(state.review_count);
    $('job-description').textContent = state.state === 'review_required' ? `${reviews} Datei${reviews === 1 ? ' benötigt' : 'en benötigen'} eine lokale Entscheidung. Jetzt prüfen oder später fortsetzen.`
      : working ? state.pause_requested ? 'Pause angefordert. Die aktuelle Datei einschließlich Bereitstellung und Zuordnung wird fertiggestellt; danach beginnt keine weitere Datei.' : `${done} von ${total} Dateien abgeschlossen. Bitte warten; die Verarbeitung bleibt lokal.`
      : state.state === 'results_available' ? `${count(state.result_count)} ${state.processing_mode === 'markdown-only' ? 'Markdown-Ergebnisse (nicht anonymisiert)' : 'technisch geprüfte anonymisierte Ergebnisse'} verfügbar.${failed ? ` ${failed} Datei${failed === 1 ? '' : 'en'} mit Problemen.` : ''}`
      : state.state === 'stopped' ? 'Der lokale Zwischenstand ist gespeichert. Fortsetzen verarbeitet nur noch offene Schritte.'
      : state.state === 'paused' ? 'Der Lauf ist pausiert. Fortsetzen verarbeitet nur offene Dateien. Die privaten Arbeitskopien unterliegen weiterhin der eingestellten Aufbewahrung.'
      : state.state === 'export_pending' ? 'Die lokale Bereitstellung ist noch offen. Ergebnisordner und Zugriffsrechte prüfen.' : 'Der aktuelle Status bleibt diesem Lauf zugeordnet.';
    $('job-progress').max = Math.max(1, total); if (state.state === 'preparing') $('job-progress').removeAttribute('value');
    else $('job-progress').value = Math.min(total, done + failed);
    $('job-current').textContent = safeLabel(state.current_file) ? state.current_file : '';
    // Stable live region: announce meaningful phase changes and the first
    // failure, not every filename/count update. No synthetic percentage.
    const announcement = `${job.batchId}:${state.state}:${Boolean(state.pause_requested)}:${Boolean(failed)}${working ? '' : `:${done}:${failed}:${reviews}:${count(state.result_count)}`}`;
    if (announcement !== lastJobAnnouncement) {
      lastJobAnnouncement = announcement;
      $('job-announcement').textContent = `${$('job-title').textContent}. ${working && !state.pause_requested
        ? `Die Verarbeitung bleibt lokal.${failed ? ' Dateien mit Hinweisen sind im Lauf aufgeführt.' : ''}`
        : $('job-description').textContent}`;
    }
    const actions = $('job-actions'); actions.replaceChildren();
    if (state.state === 'processing' && !state.pause_requested) actions.append(action('pause', 'Pausieren', async () => {
      if (await perform('pause_batch', { batchId: job.batchId })) { lastJobSignature = ''; await refresh(); }
    }));
    if (state.state === 'review_required') actions.append(action('review', 'Jetzt prüfen', () => beginReview(job.batchId), true));
    if (state.state === 'processing' && reviews) actions.append(action('review', 'Prüfung öffnen', () => beginReview(job.batchId, false), true));
    if (['stopped', 'paused'].includes(state.state)) actions.append(action('resume', 'Verarbeitung fortsetzen', async () => { if (await perform('continue_current_batch')) { lastJobSignature = ''; await refresh(); } }, true));
    if (state.results_available && !working && ['results_available', 'export_pending'].includes(state.state)) actions.append(action('results', 'Ergebnisordner öffnen', () => perform('open_history_results', { batchId: job.batchId }), !failed));
    if (state.results_available && !working) actions.append(action('documents', state.processing_mode === 'markdown-only' ? 'Markdown nachkorrigieren' : 'Dokumente prüfen / KI-Export', () => openDocuments(job.batchId), true));
    if (!working) actions.append(action('new', 'Neue Verarbeitung', newJob));
    actions.append(action('history', 'Im Verlauf ansehen', () => showView('history')));
    restoreActionFocus();
    $('file-problems').hidden = !failed && state.state !== 'stopped';
    const key = `${job.batchId}:${failed}:${state.state}`;
    if (!$('file-problems').hidden && problemSignature !== key) { problemSignature = key; problems($('problem-list'), job.batchId); }
    if (state.presentation_generation && acknowledged !== state.presentation_generation) {
      acknowledged = state.presentation_generation;
      requestAnimationFrame(() => requestAnimationFrame(() => invoke('ack_terminal_presented', { presentationGeneration: state.presentation_generation })
        .catch(() => { acknowledged = null; })));
    }
  }
  function historySummary(container, entry, updateAction, hasMainLoader = false) {
    const status = element('p', 'Freigaben und Exportbelege werden bei Bedarf neu abgeglichen.', 'history-meta');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const contents = element('div');
    const load = async () => {
      if (busy || closed || view !== 'history') return;
      const epoch = historySummaryEpoch, token = {};
      historySummaryRequests.set(container, token); setControlDisabled(reload, true); contents.replaceChildren();
      reload.hidden = updateAction({ loading: true }) === true;
      status.textContent = 'Gespeicherte Freigaben und Exportbelege werden abgeglichen …';
      container.setAttribute('aria-busy', 'true');
      const active = () => !closed && view === 'history' && epoch === historySummaryEpoch &&
        container.isConnected && !container.hidden && historySummaryRequests.get(container) === token;
      try {
        const data = await invoke('get_document_review_history_summary', { batchId: entry.batch_id });
        if (!active()) return;
        if (busy) throw Error('STANDALONE_BUSY');
        if (data.ok !== true || data.local_ui_only !== true || data.external_disclosure !== false || typeof data.available !== 'boolean')
          throw Error('DOCUMENT_REVIEW_INVALID');
        if (!data.available) {
          status.textContent = 'Für diesen älteren Lauf wurde kein nachträglicher Dokumentprüfstand erfasst. Keine menschliche Freigabe ableitbar.';
          reload.hidden = updateAction(data) === true;
          return;
        }
        const keys = ['reviewable_count', 'approved_count', 'unavailable_count', 'unclassified_source_count', 'recorded_export_count', 'current_exported_count',
          'pending_export_count', 'pending_incomplete_count', 'pending_confirmation_count'];
        const rejectedCount = data.not_processed_count === undefined ? 0 : data.not_processed_count;
        if (data.processing_mode !== entry.processing_mode || keys.some(key => !Number.isSafeInteger(data[key]) || data[key] < 0) ||
            !Number.isSafeInteger(rejectedCount) || rejectedCount < 0 ||
            data.approved_count > data.reviewable_count || data.current_exported_count > data.reviewable_count ||
            data.reviewable_count + data.unavailable_count + data.unclassified_source_count + rejectedCount > 200 ||
            data.pending_export_count !== data.pending_incomplete_count + data.pending_confirmation_count)
          throw Error('DOCUMENT_REVIEW_INVALID');
        const raw = data.processing_mode === 'markdown-only';
        contents.append(element('p', `${data.approved_count} von ${data.reviewable_count} verfügbaren Dokumentprüfständen ${raw ? 'textgeprüft · nicht anonymisiert' : 'menschlich freigegeben'}.`, 'history-meta'));
        if (data.unavailable_count) contents.append(element('p', `${data.unavailable_count} Dokumentprüfstände nicht verfügbar. Betroffene Dateien in „${raw ? 'Markdown nachkorrigieren' : 'Dokumente prüfen / KI-Export'}“ ansehen.`, 'history-meta'));
        if (data.unclassified_source_count) contents.append(element('p', `${data.unclassified_source_count} Quelldateien mit unklarem früheren Ergebnisstatus. Die vollständige Freigabe dieses Laufs ist nicht belegbar. Dateinamen in der Dokumentansicht ansehen.`, 'history-meta'));
        if (rejectedCount) contents.append(element('p', `${rejectedCount} Quelldateien wurden nicht verarbeitet. Dateinamen und Gründe in der Dokumentansicht ansehen; sie sind nicht freigegeben oder exportiert.`, 'history-meta'));
        contents.append(element('p', `${data.recorded_export_count} ${raw ? 'abgeschlossene Markdown-Exporte · nicht anonymisiert' : 'abgeschlossene KI-Exporte'}. Frühere Kopien sind keine Freigabe des heutigen Stands.`, 'history-meta'));
        contents.append(element('p', `${data.current_exported_count} von ${data.reviewable_count} aktuellen Dokumentständen in gespeicherten Abschlussbelegen erfasst. Die heutigen Kopien werden erst beim Öffnen erneut geprüft.`, 'history-meta'));
        const last = data.last_recorded_export;
        if (last) {
          if (!['markdown-only', 'markdown-and-anonymize'].includes(last.processing_mode) ||
              !Number.isSafeInteger(last.document_count) || last.document_count < 1 || last.document_count > 200 ||
              last.recorded_at !== null && (typeof last.recorded_at !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(last.recorded_at) || Number.isNaN(Date.parse(last.recorded_at))))
            throw Error('DOCUMENT_REVIEW_INVALID');
          const when = last.recorded_at ? new Date(last.recorded_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Zeitpunkt nicht erfasst';
          contents.append(element('p', `${last.recorded_at ? 'Neuester datierter Exportbeleg' : 'Exportbeleg ohne erfassten Zeitpunkt'}: ${last.document_count} Dateien · ${when}${last.processing_mode === 'markdown-only' ? ' · nicht anonymisiert' : ''}.`, 'history-meta'));
        }
        if (data.pending_incomplete_count || data.pending_confirmation_count) contents.append(element('p',
          `${data.pending_incomplete_count} unvollständige Exportaufträge · ${data.pending_confirmation_count} fertige Kopien mit offener Empfangsbestätigung. In der Dokumentansicht abgleichen, nicht neu exportieren.`, 'history-meta'));
        status.textContent = 'Abgeglichene Momentaufnahme. Nach Änderungen erneut laden; die Exportfreigabe wird immer gesondert geprüft.';
        reload.hidden = updateAction(data) === true;
      } catch (error) {
        if (active()) {
          const code = errorCode(error), reason = { DOCUMENT_REVIEW_POLICY_CHANGED: 'Dieser Prüfstand gehört zu einem älteren, nicht übernehmbaren Prüfvertrag.',
            DOCUMENT_REVIEW_INVALID: 'Die gespeicherten Prüfbelege sind nicht konsistent lesbar.',
            STANDALONE_BUSY: 'Ein anderer lokaler Vorgang ist aktiv.' }[code] || reasons[code] || 'Der lokale Abgleich ist fehlgeschlagen.';
          contents.replaceChildren(); status.textContent = `Prüfstatus nicht verfügbar. ${reason} (${code}) Erneut laden; die Verarbeitung und frühere Kopien bleiben unverändert.`;
          reload.hidden = updateAction(null) === true;
        }
      } finally {
        if (container.isConnected && historySummaryRequests.get(container) === token) {
          setControlDisabled(reload, false); reload.textContent = 'Prüfstatus erneut laden'; container.removeAttribute('aria-busy');
        }
      }
    };
    const reload = button('Prüfstatus laden', load);
    reload.id = `history-${entry.batch_id}-summary-reload`;
    reload.hidden = hasMainLoader;
    container.append(status, contents, reload);
    const cancel = () => {
      historySummaryRequests.delete(container); setControlDisabled(reload, false); container.removeAttribute('aria-busy');
      contents.replaceChildren(); status.textContent = 'Abgleich geschlossen. Bei Bedarf den Prüfstatus neu laden.';
      reload.hidden = updateAction(null) === true;
    };
    return { load, cancel };
  }
  async function refreshHistory(quiet = false) {
    const request = ++historyGeneration;
    if (!quiet) $('history-status').textContent = 'Lokaler Verlauf wird geladen …';
    try {
      const data = await invoke('get_run_history'); if (closed || request !== historyGeneration) return;
      if (data.local_ui_only !== true || data.external_disclosure !== false || !Array.isArray(data.entries)) throw Error('STANDALONE_HISTORY_INVALID');
      $('history-status').textContent = data.entries.length ? 'Bis zu 20 zuletzt angelegte Verarbeitungen · neueste zuerst' : 'Noch keine lokalen Verarbeitungen vorhanden.';
      const signature = JSON.stringify([data.entries, job?.batchId || null, reconnecting, contextRequired]);
      // Polling must not replace focused controls or expanded file details
      // when the history did not change. Changes retain their explicit state.
      if (signature === historySignature) return;
      const focused = document.activeElement?.id;
      const list = $('history-list'); list.replaceChildren();
      const open = data.entries.filter(entry => entry.resumable || ['processing', 'export_pending'].includes(entry.status)).length;
      $('open-count').textContent = `${open} offen`; $('open-count').hidden = !open;
      for (const entry of data.entries.slice(0, 20)) {
        if (!/^[a-f0-9]{64}$/u.test(entry.batch_id)) continue;
        const row = element('article', undefined, 'history-row'), detail = element('div');
        const date = new Date(entry.created_at), dateLabel = Number.isNaN(date.getTime()) ? 'Datum unbekannt' : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
        detail.append(element('h3', `${entry.processing_mode === 'markdown-only' ? 'Markdown-Konvertierung' : 'Anonymisierung'} · ${dateLabel}`, 'history-title'),
          element('p', `${count(entry.selected_count)} Dateien · ${count(entry.result_count)} Ergebnisse · ${count(entry.failed_count)} ${count(entry.failed_count) === 1 ? 'Problem' : 'Probleme'}`, 'history-meta'),
          element('p', states[entry.status] || 'Nicht verfügbar', 'history-meta'));
        const stateLabel = detail.children[2];
        const actions = element('div', undefined, 'history-actions');
        const action = (key, label, callback, primary = false) => {
          const node = button(label, callback, primary); node.id = `history-${entry.batch_id}-${key}`; return node;
        };
        const raw = entry.processing_mode === 'markdown-only';
        const working = ['preparing', 'processing'].includes(entry.status);
        const connected = !reconnecting && !contextRequired;
        const active = connected && working && entry.batch_id === job?.batchId;
        row.dataset.current = String(active);
        row.setAttribute('aria-busy', String(connected && working));
        if (working) {
          const activity = element('p', undefined, 'history-activity');
          const icon = element('span', connected ? '⚙' : '!', 'history-work-icon'); icon.setAttribute('aria-hidden', 'true');
          activity.append(icon, element('strong', connected
            ? `${active ? 'Aktueller Lauf · ' : ''}${entry.status === 'preparing' ? 'Wird vorbereitet' : 'Wird verarbeitet'} · ${count(entry.completed_count)} von ${count(entry.selected_count)} Dateien abgeschlossen`
            : 'Verbindung wird wiederhergestellt · Verarbeitungsstatus noch unbestätigt'));
          detail.append(activity);
        }
        const missingLocation = !working && !entry.resumable && entry.result_location === 'missing';
        if (missingLocation) stateLabel.textContent = 'Ergebnisordner fehlt';
        else if (!working && !entry.resumable && ['unsafe', 'unknown'].includes(entry.result_location))
          stateLabel.textContent = 'Ergebnisordner nicht sicher verfügbar';
        const baseStateLabel = stateLabel.textContent;
        const hasProblems = Boolean(count(entry.failed_count) || count(entry.problem_count));
        let showProblems = () => {};
        const baseAction = active ? { key: 'activity', label: 'Verarbeitung anzeigen', primary: true,
          run: () => { showView('new'); $('job-title').focus(); } }
          : missingLocation ? null : entry.resumable ? { key: 'continue', label: entry.status === 'review_required' ? 'Jetzt prüfen' : 'Fortsetzen',
          primary: true, run: () => resumeRun(entry, entry.status === 'review_required') }
          : entry.status === 'export_pending' ? { key: 'delivery', label: 'Bereitstellung prüfen', primary: true,
            run: () => feedback('Die technische Bereitstellung dieses Laufs ist noch offen. Den Ergebnisordner und Zugriffsrechte prüfen; eine neue Dokumentkopie löst diesen Schritt nicht. Es wurde keine Verarbeitung erneut gestartet.', true) }
          : !working && hasProblems ? { key: 'problems-main', label: 'Probleme ansehen', primary: true, run: () => showProblems() }
          : !working && entry.result_count > 0 && !raw ? { key: 'documents', label: 'Ergebnisse prüfen und freigeben', primary: true, run: () => openDocuments(entry.batch_id) }
          : !working && entry.results_available ? { key: 'results', label: 'Ergebnisse öffnen', primary: false,
            run: () => perform('open_history_results', { batchId: entry.batch_id }) } : null;
        let mainAction = baseAction;
        const main = baseAction ? action(baseAction.key, baseAction.label, () => mainAction.run(), baseAction.primary) : null;
        if (main) { main.setAttribute('data-history-main', 'true'); actions.append(main); }
        const extra = element('div', undefined, 'history-extra'); extra.hidden = !expandedHistoryExtras.has(entry.batch_id);
        extra.id = `history-${entry.batch_id}-extra`;
        const more = action('more', 'Weitere Aktionen', () => {
          extra.hidden = !extra.hidden; more.setAttribute('aria-expanded', String(!extra.hidden));
          extra.hidden ? expandedHistoryExtras.delete(entry.batch_id) : expandedHistoryExtras.add(entry.batch_id);
        });
        more.setAttribute('aria-expanded', String(!extra.hidden)); more.setAttribute('aria-controls', extra.id);
        const addExtra = (key, text, callback) => extra.append(action(key, text, callback));
        if (entry.results_available && baseAction?.key !== 'results') addExtra('results', 'Ergebnisordner', () => perform('open_history_results', { batchId: entry.batch_id }));
        if (entry.result_count > 0 && baseAction?.key !== 'documents') addExtra('documents', raw ? 'Markdown nachkorrigieren' : 'Prüfung öffnen', () => openDocuments(entry.batch_id));
        if (entry.ledger_available) addExtra('ledger', 'Dateizuordnung', () => perform('open_history_ledger', { batchId: entry.batch_id }));
        if (entry.identity_mapping_available) addExtra('identities', 'Basiszuordnung (vertraulich)', () => perform('open_history_identity_mapping', { batchId: entry.batch_id }));
        // Summary data may improve the next action, but never supersedes an
        // active worker, unprocessed work or concrete file errors. Re-opening
        // the document view always reloads authoritative revisions first.
        const updateAction = data => {
          if (!main || baseAction.key !== 'documents') return;
          mainAction = baseAction; main.hidden = false; stateLabel.textContent = baseStateLabel;
          // Metadata loading is secondary; the direct document action reloads
          // authoritative revisions itself and must not depend on two clicks.
          setControlDisabled(main, false);
          if (data?.available === false) {
            mainAction = { ...baseAction, label: 'Ergebnisse öffnen', primary: false,
              run: () => perform('open_history_results', { batchId: entry.batch_id }) };
            main.hidden = !entry.results_available;
          } else if (data && !data.loading) {
            mainAction = { ...baseAction, run: () => openDocuments(entry.batch_id) };
            if (data.pending_export_count) mainAction.label = 'Export abgleichen';
            else if (['unsafe', 'unknown'].includes(entry.result_location)) mainAction.label = 'Prüfstände ansehen';
            else if (data.unavailable_count || data.unclassified_source_count || data.not_processed_count) {
              mainAction.label = 'Prüfstände ansehen';
              stateLabel.textContent = 'Prüfstände unvollständig · Momentaufnahme';
            } else if (data.reviewable_count > 0 && data.approved_count === data.reviewable_count) {
              if (data.current_exported_count === data.reviewable_count) {
                mainAction = { ...mainAction, label: 'Prüfung öffnen', primary: false };
                stateLabel.textContent = 'Aktuelle Stände exportiert · gespeicherter Beleg';
              } else {
                mainAction = { ...mainAction, label: 'Exportvorschau', run: () => openDocuments(entry.batch_id, true) };
                stateLabel.textContent = 'Bereit zum Export · Momentaufnahme';
              }
            } else {
              stateLabel.textContent = 'Prüfung offen · Momentaufnahme';
            }
          }
          main.textContent = mainAction.label; main.className = mainAction.primary ? 'primary' : '';
          return false;
        };
        row.append(detail, actions);
        if (entry.result_count > 0) {
          const summary = element('div', undefined, 'history-review-summary');
          summary.hidden = !expandedHistorySummaries.has(entry.batch_id);
          summary.id = `history-${entry.batch_id}-summary`;
          const { load, cancel } = historySummary(summary, entry, updateAction);
          const toggle = action('summary-toggle', 'Freigaben und Exporte', () => {
            summary.hidden = !summary.hidden; toggle.setAttribute('aria-expanded', String(!summary.hidden));
            if (summary.hidden) { expandedHistorySummaries.delete(entry.batch_id); cancel(); }
            else { expandedHistorySummaries.add(entry.batch_id); load(); }
          });
          toggle.setAttribute('aria-expanded', String(!summary.hidden)); toggle.setAttribute('aria-controls', summary.id);
          extra.append(toggle); row.append(summary);
        }
        if (count(entry.failed_count) || count(entry.problem_count)) {
          const files = element('div', undefined, 'problem-list'); files.hidden = !expandedHistoryProblems.has(entry.batch_id);
          files.id = `history-${entry.batch_id}-files`;
          const toggle = action('problems', 'Betroffene Dateien', () => {
            files.hidden = !files.hidden;
            toggle.setAttribute('aria-expanded', String(!files.hidden));
            if (files.hidden) expandedHistoryProblems.delete(entry.batch_id);
            else { expandedHistoryProblems.add(entry.batch_id); problems(files, entry.batch_id); }
          });
          toggle.setAttribute('aria-expanded', String(!files.hidden)); toggle.setAttribute('aria-controls', files.id);
          showProblems = () => {
            files.hidden = false; toggle.setAttribute('aria-expanded', 'true'); expandedHistoryProblems.add(entry.batch_id);
            problems(files, entry.batch_id); files.focus();
          };
          files.tabIndex = -1; files.setAttribute('role', 'region'); files.setAttribute('aria-label', 'Dateiprobleme dieses Laufs');
          extra.append(toggle); row.append(files);
          if (!files.hidden) problems(files, entry.batch_id);
        }
        if (extra.children.length) actions.append(more, extra);
        list.append(row);
      }
      historySignature = signature;
      if (view === 'history' && focused?.startsWith('history-')) ($(focused) || $('nav-history')).focus();
    } catch { if (request === historyGeneration) $('history-status').textContent = 'Verlauf nicht verfügbar. „Aktualisieren“ erneut wählen; kein Lauf wird dadurch gestartet.'; }
  }
  function schedule(delay = 1600) { clearTimeout(timer); if (!closed) timer = setTimeout(refresh, delay); }
  async function refresh() {
    if (closed || refreshing) return; if (busy) { schedule(); return; }
    refreshing = true; const request = generation;
    try {
      const state = await invoke('get_public_state'); if (closed || request !== generation || busy) return;
      if (contextRequired) {
        const context = await invoke('get_ui_context');
        if (closed || request !== generation || busy) return;
        applyContext(context); contextRequired = false; reconnecting = false;
        feedback('Lokale Verbindung wiederhergestellt. Gespeicherte Läufe bleiben erhalten; kein Start und keine Entscheidung wurden automatisch wiederholt. Eine frühere Dateiauswahl bitte neu aufnehmen.');
      }
      current = state;
      if (!job && !catalogue.length && /^[a-f0-9]{64}$/u.test(state.batch_id || '') && ['preparing', 'processing'].includes(state.state)) {
        adoptRun({ batchId: state.batch_id, task: state.processing_mode, name: `Lauf ${state.batch_id.slice(0, 8)}`,
          files: [], selectedCount: count(state.selected_count) });
      }
      renderJob(state);
      if (view === 'history') await refreshHistory(true);
      if (state.state === 'blocked') feedback('Die lokale Verarbeitung ist nicht bereit. Bitte das vollständige Paket und die Diagnose prüfen.', true);
    } catch (error) { if (!closed && request === generation) showError(error); }
    finally { refreshing = false; schedule(['processing', 'preparing'].includes(current?.state) ? 1200 : 5000); }
  }
  async function configure() { const result = await perform('configure_results'); if (!result || result.cancelled) return;
    if (result.local_ui_only && result.external_disclosure === false) { $('destination').textContent = result.result_folder; $('settings-destination').textContent = result.result_folder; }
    feedback('Ergebnisordner gespeichert. Vorhandene Läufe bleiben an ihrem bisherigen Speicherort.'); }
  for (const [index, name] of ['new', 'history', 'settings'].entries()) {
    $('nav-' + name).addEventListener('click', () => showView(name));
    $('nav-' + name).addEventListener('keydown', event => { const names = ['new', 'history', 'settings'];
      const target = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
      if (target < 0) return; event.preventDefault(); names.forEach((item, i) => { $('nav-' + item).tabIndex = i === target ? 0 : -1; }); $('nav-' + names[target]).focus(); });
  }
  for (const id of ['mode-markdown', 'mode-anonymize']) $(id).addEventListener('change', () => { mode = $(id).value; updateStart(); });
  $('select-files').addEventListener('click', () => pick('select_files')); $('select-folder').addEventListener('click', () => pick('select_folder'));
  $('add-files').addEventListener('click', () => pick('select_files')); $('add-folder').addEventListener('click', () => pick('select_folder'));
  $('add-more').addEventListener('click', () => { const show = $('add-options').hidden; $('add-options').hidden = !show;
    $('add-more').setAttribute('aria-expanded', String(show)); if (show) $('add-files').focus(); });
  $('start').addEventListener('click', start); $('clear-files').addEventListener('click', clearFiles);
  $('select-all').addEventListener('change', () => chooseItems(catalogue, $('select-all').checked));
  $('choose-all').addEventListener('click', () => chooseItems(catalogue, true)); $('choose-none').addEventListener('click', () => chooseItems(catalogue, false));
  $('expand-all').addEventListener('click', () => { const groups = treeGroups(), open = !groups.every(({ key }) => expanded.get(key)); for (const { key } of groups) expanded.set(key, open); renderTree(); });
  $('job-files-toggle').addEventListener('click', () => { const open = $('job-files').hidden; $('job-files').hidden = !open; $('job-files-toggle').setAttribute('aria-expanded', String(open)); $('job-files-toggle').textContent = open ? 'Dateien ausblenden ⌃' : 'Dateien anzeigen ⌄'; });
  $('refresh-history').addEventListener('click', () => { historySignature = ''; refreshHistory(); }); $('configure-results').addEventListener('click', configure); $('change-destination').addEventListener('click', configure);
  $('documents-back').addEventListener('click', () => showView(documentsOrigin));
  $('diagnostics').addEventListener('click', () => perform('open_diagnostic_folder')); $('identities').addEventListener('click', () => perform('open_identity_mappings_directory'));
  window.addEventListener('beforeunload', () => { closed = true; clearTimeout(timer); for (const unlisten of unlisteners) unlisten(); $('review-frame').src = 'about:blank'; });
  (async () => {
    updateStart();
    try {
      unlisteners.push(await window.__TAURI__.event.listen('datasecure-connection', event => {
        const data = event.payload;
        if (closed || !Number.isSafeInteger(data?.epoch) || data.epoch < 0 || data.epoch < connectionEpoch ||
            !['recovering', 'ready'].includes(data.state)) return;
        connectionEpoch = data.epoch;
        if (data.state === 'recovering') {
          busyGeneration++; dropOwnership = null; setBusy(false);
          generation++; historyGeneration++; historySummaryEpoch++; historySignature = ''; lastJobSignature = '';
          catalogue = []; knownIds.clear(); selected.clear(); expanded.clear(); revision = 0;
          admitting = false; acknowledged = null; reconnecting = true; contextRequired = true;
          $('review-frame').src = 'about:blank'; reviewOrigin = null;
          window.__DATASECURE_DOCUMENTS__?.invalidateConnection();
          if (view === 'review') { view = ''; showView('history'); }
          renderTree(); updateStart();
          feedback('Lokale Verbindung unterbrochen. DataSecure wartet auf das sichere Ende der alten Sitzung und verbindet sich erneut. Nicht gespeicherte Prüfentscheidungen wurden nicht übertragen.', true);
          schedule(1200);
        } else if (contextRequired) {
          // Only status/context are reloaded. Never replay the failed command.
          schedule(50);
        }
      }));
      let nativeDropReady = false;
      try { unlisteners.push(await window.__TAURI__.event.listen('datasecure-native-drop', event => {
        const data = event.payload; if (closed || data.epoch !== undefined && data.epoch !== connectionEpoch) return;
        if (data.phase === 'enter') $('drop-zone').className = 'drop-zone active';
        else $('drop-zone').className = 'drop-zone';
        if (data.phase === 'checking') { generation++; admitting = true; dropOwnership = beginBusy(); renderTree(); feedback('Dateiauswahl wird lokal geprüft …'); }
        if (data.phase === 'accepted') { if (dropOwnership === null) return;
          const ownership = dropOwnership; dropOwnership = null; admitting = false; endBusy(ownership); if (view === 'review') return;
          job = null; $('setup').hidden = false; $('job').hidden = true;
          try { applyContext(data.result.ui_context); showView('new'); feedback('Auswahl aufgenommen.'); } catch (error) { showError(error); } }
        if (['failed', 'rejected'].includes(data.phase)) {
          if (dropOwnership !== null) { const ownership = dropOwnership; dropOwnership = null; admitting = false; endBusy(ownership); renderTree(); }
          showError(data.error_code);
        }
      })); nativeDropReady = true; } catch { feedback('Drag-and-drop ist nicht verfügbar. Bitte die Auswahlbuttons verwenden.'); }
      try { unlisteners.push(await window.__TAURI__.event.listen('datasecure-admission-progress', event => {
        if (busy && event.payload?.phase === 'validating') feedback('Dateien und Unterordner werden lokal geprüft. Die Verarbeitung beginnt erst mit „Starten“.');
      })); } catch { /* Status remains available through the closed command API. */ }
      unlisteners.push(await window.__TAURI__.event.listen('datasecure-review-closed', async event => {
        const origin = reviewOrigin;
        // Late/duplicate notifications must not leave an already opened
        // document view or a successor review that has not requested closure.
        if (closed || view !== 'review' || !origin?.closing || event.payload?.closed !== true ||
            event.payload.review_generation !== origin.nativeGeneration) return;
        $('review-frame').src = 'about:blank'; reviewOrigin = null;
        view = ''; lastJobSignature = '';
        if (origin.complete) {
          feedback('Fundstellenprüfung abgeschlossen. Prüfe jetzt die Ergebnisse dieses Laufs und gib die gewünschten Dokumente ausdrücklich frei. Deine bisherigen Entscheidungen sind übernommen; noch kein KI-Export.');
          await openDocuments(origin.batchId, false, origin.view);
          refresh(); return;
        }
        showView(origin.view === 'history' ? 'history' : 'new'); refresh();
        // The action row is recreated by the next status response. Returning
        // focus to its old launch button would immediately drop it to <body>.
        // A stable destination keeps keyboard users at the same run/context.
        (view === 'history' ? $('nav-history') : $('job-title')).focus();
      }));
      const ready = await invoke('frontend_ready', { nativeDropReady });
      if (/^\d+\.\d+\.\d+-rc\d+$/u.test(ready.product_version)) $('product-version').textContent = `Version ${ready.product_version}`;
      const initialGeneration = generation, initialConnection = connectionEpoch;
      const initialContext = await invoke('get_ui_context');
      if (initialGeneration === generation && initialConnection === connectionEpoch) applyContext(initialContext);
      await refresh(); await refreshHistory();
    } catch (error) { showError(error); schedule(); }
  })();
})();
