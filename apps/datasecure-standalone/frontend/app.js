'use strict';

const invoke = window.__TAURI__.core.invoke;
const byId = (id) => document.getElementById(id);
const controls = ['select-files', 'select-folder', 'start', 'cancel', 'continue',
  'process-results', 'new-batch', 'configure-results', 'diagnostics', 'processing-mode', 'output-naming-mode',
  'task-markdown', 'task-anonymize'];
const messages = {
  STANDALONE_BUSY: 'Ein Stapel wird bereits verarbeitet.',
  STANDALONE_ENGINE_NOT_READY: 'Die lokale Verarbeitung ist noch nicht bereit.',
  STANDALONE_SELECTION_INVALID: 'Die Dateiauswahl überschreitet eine sichere Grenze oder enthält einen nicht unterstützten Pfad.',
  SOURCE_FOLDER_FILE_LIMIT: 'Der Ordner enthält mehr als 200 unterstützte Dateien. Bitte höchstens 200 Dateien pro Stapel auswählen.',
  SOURCE_FOLDER_SIZE_LIMIT: 'Die unterstützten Dateien im Ordner sind zusammen größer als 500 MB. Bitte einen kleineren Stapel auswählen.',
  SOURCE_FOLDER_UNSUPPORTED_FILES: 'Der Ordner enthält mindestens eine nicht unterstützte Datei. Es wurde nichts übernommen; bitte diese Datei entfernen oder einen passenderen Ordner wählen.',
  SOURCE_FOLDER_EMPTY: 'In diesem Ordner und seinen Unterordnern wurden keine unterstützten Dateien gefunden.',
  SOURCE_ARTIFACT_IGNORED: 'Temporäre Office-Sperrdateien sind keine Dokumente. Bitte die eigentliche Word-, Excel- oder PowerPoint-Datei auswählen.',
  STANDALONE_SELECTION_PREPARED: 'Eine Auswahl ist bereits vorbereitet. Bitte starten oder die Auswahl verwerfen, bevor du neue Dateien hinzufügst.',
  STANDALONE_DROP_MIXED: 'Bitte entweder Dateien oder genau einen Ordner hineinziehen. Ordner und einzelne Dateien können nicht gemeinsam ausgewählt werden.',
  STANDALONE_NO_ADMISSION: 'Bitte zuerst Dateien oder einen Ordner auswählen.',
  STANDALONE_START_FAILED: 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.',
  PROCESSING_MODE_INVALID: 'Bitte einen gültigen Verarbeitungsmodus auswählen. Der Stapel wurde nicht gestartet.',
  PROCESSING_MODE_FORBIDDEN: 'Dieser Verarbeitungsmodus ist hier nicht verfügbar. Der Stapel wurde nicht gestartet.',
  RESULT_NAMING_MODE_INVALID: 'Bitte eine gültige Benennung für anonymisierte Ergebnisse auswählen. Der Stapel wurde nicht gestartet.',
  MARKDOWN_CONVERSION_NOT_READY: 'Die installierte Version unterstützt diese Betriebsart nicht. Bitte die aktuelle Standalone-Version verwenden. Der Stapel wurde nicht gestartet; deine Dateiauswahl bleibt erhalten.',
  STANDALONE_NOTHING_TO_CONTINUE: 'Es gibt keinen fortsetzbaren Stapel.',
  BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE: 'Dieser ältere Stapel verwendet nicht mehr den aktuellen Datenschutz-Regelsatz. Bitte die Originaldateien neu auswählen.',
  STANDALONE_RUNTIME_MISSING: 'Der lokale DataSecure-Core fehlt.',
  STANDALONE_RUNTIME_START_FAILED: 'Der lokale DataSecure-Core konnte nicht gestartet werden.',
  STANDALONE_DATA_ROOT_UNSAFE: 'Der private lokale DataSecure-Bereich konnte nicht sicher geöffnet werden.',
  UNSAFE_STORAGE_LOCATION: 'Der private lokale DataSecure-Bereich ist nicht zugreifbar.',
  STARTUP_RECOVERY_FAILED: 'Eine unterbrochene Verarbeitung konnte nicht sicher wiederhergestellt werden.',
  STARTUP_OUTBOX_RECOVERY_FAILED: 'Eine ausstehende Ergebniszuordnung konnte nicht sicher wiederhergestellt werden.',
  STARTUP_MIGRATION_FAILED: 'Vorhandene lokale Daten konnten nicht sicher übernommen werden.',
  STARTUP_CLEANUP_FAILED: 'Private Arbeitskopien konnten nicht sicher geprüft werden.',
  RUNTIME_INTEGRITY_FAILED: 'Die lokale Programmlaufzeit stimmt nicht mit dem installierten Paket überein.',
  DURABLE_RUNTIME_FAILED: 'Die lokale Hintergrundverarbeitung konnte nicht bereitgestellt werden.',
  STARTUP_FAILED: 'Der lokale DataSecure-Core hat den Start sicher verweigert.',
  STANDALONE_IPC_FAILED: 'Die lokale Verbindung zum DataSecure-Core wurde unterbrochen und wird beim nächsten Versuch neu gestartet.',
  STANDALONE_IPC_TIMEOUT: 'Die lokale Verarbeitung antwortete nicht rechtzeitig. Die Verbindung wird beim nächsten Versuch neu gestartet.',
  STANDALONE_RESULT_ROOT_UNSAFE: 'Der Ergebnisordner darf nicht im privaten DataSecure-Bereich liegen.',
  STANDALONE_RESULT_OPEN_FAILED: 'Der Ergebnisordner konnte nicht geöffnet werden.',
  STANDALONE_RESULTS_MISSING: 'Es ist noch kein vollständiger Ergebnislauf verfügbar.',
  STANDALONE_LEDGER_MISSING: 'Es ist noch keine lokale Zuordnung vorhanden.',
  STANDALONE_LEDGER_OPEN_FAILED: 'Die lokale Zuordnungsdatei konnte nicht angezeigt werden.',
  STANDALONE_DIAGNOSTICS_OPEN_FAILED: 'Der lokale Diagnoseordner konnte nicht geöffnet werden.'
};
let admitted = false;
let admissionGeneration = 0;
let refreshInFlight = false;
let refreshTimer;
let acknowledgedPresentationGeneration = null;
let activeView = 'home';
let lastPublicState = null;
let lastTerminalContextKey = null;
let operationInFlight = false;
let foregroundOperationInFlight = false;
let nativeDropInFlight = false;
let unlistenNativeDrop = null;
let pageClosed = false;
let lastProcessingMode = null;
let historyRequestGeneration = 0;
let historyDirty = true;
let historyStateKey = null;
let historyButtons = [];
let lastHistorySnapshot = null;
let historyRenderGeneration = 0;
let currentResultsAvailable = false;
let currentSessionRunStarted = false;
let currentSessionResultBaseline = '';
let latestResultFolderSeen = '';
let selectionRemoveButtons = [];
const views = ['home', 'process', 'results'];
const admissionAvailableStates = new Set(['ready', 'results_available', 'completed_without_results',
  'review_required', 'stopped', 'export_pending']);
const validMode = (mode) => ['markdown-only', 'markdown-and-anonymize'].includes(mode);
const validOutputNamingMode = (mode) => ['neutral', 'source-with-suffix'].includes(mode);

function renderModeHelp(mode) {
  const convert = mode === 'markdown-only';
  const help = byId('processing-mode-help');
  if (help) help.textContent = !validMode(mode)
    ? 'Wähle aus, ob Originalinhalte erhalten bleiben oder erkannte Identifikatoren ersetzt werden sollen.'
    : convert
    ? 'Nicht anonymisiert: Namen und andere Originalinhalte bleiben erhalten. Bei OCR oder grafischen Inhalten können Auslassungen entstehen; Hinweise stehen im Ergebnis.'
    : 'Namen und weitere erkannte Identifikatoren werden in der Markdown-Ausgabe ersetzt. XLSX, PPTX, PDF/Scan-PDF und Bilder werden vorher lokal in Markdown extrahiert; der Extraktionsstatus wird getrennt ausgewiesen.';
  byId('output-naming').hidden = mode !== 'markdown-and-anonymize';
  renderOutputNamingHelp();
}

function renderOutputNamingHelp() {
  const mode = byId('output-naming-mode').value;
  const help = byId('output-naming-help');
  if (!help) return;
  help.textContent = mode === 'source-with-suffix'
    ? 'Der Originaldateiname bleibt sichtbar und erhält „-anonymisiert“. Nutze diese Variante nur, wenn Datei- und Ordnernamen keine personenbezogenen Angaben enthalten.'
    : 'Empfohlen: Neutrale Namen wie „Dokument-001-anonymisiert.md“ vermeiden personenbezogene Angaben im Ergebnisnamen. Die Zuordnungsdatei verbindet Quelle und Ergebnis.';
}

function busy(value) {
  // A foreground operation can replace the current selection or run while a
  // previous status/context request is still in flight. Invalidate that reply.
  if (value) { admissionGeneration += 1; invalidateHistory(); }
  foregroundOperationInFlight = value;
  applyBusyState();
}
function applyBusyState() {
  operationInFlight = foregroundOperationInFlight || nativeDropInFlight;
  controls.forEach((id) => { byId(id).disabled = operationInFlight; });
  updateModeAvailability();
  updateDropAvailability();
  updateCurrentResultsAvailability();
  for (const button of selectionRemoveButtons) button.disabled = operationInFlight;
  updateHistoryAvailability();
  if (!operationInFlight && activeView === 'results' && historyDirty) refreshHistory();
}
function updateCurrentResultsAvailability() {
  const button = byId('process-results');
  button.disabled = operationInFlight || !currentResultsAvailable;
  button.title = currentResultsAvailable ? '' : 'Noch kein Ergebnisordner verfügbar.';
}
function updateModeAvailability() {
  // The selector describes the next admission, never an active/recoverable run.
  byId('processing-mode').disabled = operationInFlight || (!admitted && !admissionAvailableStates.has(lastPublicState));
  const needsMode = admitted && !validMode(byId('processing-mode').value);
  const needsNamingMode = admitted && byId('processing-mode').value === 'markdown-and-anonymize' &&
    !validOutputNamingMode(byId('output-naming-mode').value);
  byId('output-naming-mode').disabled = operationInFlight || byId('processing-mode').disabled ||
    byId('processing-mode').value !== 'markdown-and-anonymize';
  byId('start').disabled = operationInFlight || !admitted || needsMode || needsNamingMode;
  byId('start-help').hidden = !needsMode;
  byId('task-markdown').disabled = byId('processing-mode').disabled;
  byId('task-anonymize').disabled = byId('processing-mode').disabled;
  const reason = byId('processing-mode').disabled ? 'Während der aktuellen Verarbeitung ist keine neue Aufgabe verfügbar.' : '';
  byId('task-markdown').title = reason;
  byId('task-anonymize').title = reason;
}
function updateDropAvailability() {
  const available = !operationInFlight && !admitted && admissionAvailableStates.has(lastPublicState);
  byId('drop-zone').setAttribute('aria-disabled', String(!available));
  if (!available) byId('drop-zone').className = 'drop-zone';
  return available;
}
function visible(id, value) { byId(id).hidden = !value; }
function status(title, text, icon = '✓') {
  byId('status-icon').textContent = icon;
  byId('status-title').textContent = title;
  byId('status-text').textContent = text;
}
function actionFeedback(text, error = false) {
  const target = byId('action-feedback');
  target.textContent = text;
  target.hidden = false;
  target.className = `action-feedback${error ? ' error' : ''}`;
}
function switchView(view) {
  activeView = views.includes(view) ? view : 'home';
  for (const name of views) {
    const selected = name === activeView;
    byId(`${name}-view`).hidden = !selected;
    const tab = byId(`tab-${name}`);
    tab.className = `tab${selected ? ' active' : ''}`;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
  }
  if (activeView === 'results') refreshHistory(true);
}

function invalidateHistory() {
  historyRequestGeneration += 1;
  historyDirty = true;
  updateHistoryAvailability();
}
function updateHistoryAvailability() {
  for (const item of historyButtons) {
    const blocked = item.resume === true && (admitted || ['preparing', 'processing'].includes(lastPublicState));
    item.button.disabled = operationInFlight || historyDirty || !item.available || blocked;
    item.button.title = !item.available ? item.reason : blocked
      ? 'Bitte die vorbereitete Auswahl oder den laufenden Stapel zuerst abschließen.'
      : operationInFlight || historyDirty ? 'Die lokale Übersicht wird aktualisiert.' : '';
  }
}
function historyCell(row, value, tag = 'td') {
  const cell = document.createElement(tag);
  cell.textContent = String(value);
  if (tag === 'th') cell.setAttribute('scope', 'row');
  row.appendChild(cell);
  return cell;
}
function renderHistory(entries) {
  const snapshot = JSON.stringify(entries.slice(0, 20));
  if (snapshot === lastHistorySnapshot) {
    byId('history-feedback').textContent = historyButtons.length > 0 ? 'Bis zu 20 zuletzt angelegte Läufe. Nicht verfügbare Aktionen sind deaktiviert.' : 'Noch keine lokalen Läufe vorhanden.';
    updateHistoryAvailability();
    return;
  }
  lastHistorySnapshot = snapshot;
  const rendered = ++historyRenderGeneration;
  const body = byId('history-body');
  body.replaceChildren();
  historyButtons = [];
  const states = { ready: 'Bereit', preparing: 'Vorbereitung', processing: 'Läuft',
    review_required: 'Prüfung nötig', stopped: 'Unterbrochen', export_pending: 'Bereitstellung offen',
    results_available: 'Abgeschlossen', completed_without_results: 'Ohne Ergebnisse', blocked: 'Nicht bereit',
    completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', interrupted: 'Unterbrochen' };
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  for (const entry of entries.slice(0, 20)) {
    if (!entry || typeof entry.batch_id !== 'string' || !entry.batch_id) continue;
    const row = document.createElement('tr');
    const runLabel = `Lauf ${entry.batch_id.slice(-8)}`;
    const date = new Date(entry.created_at);
    const heading = historyCell(row, Number.isNaN(date.getTime()) ? 'Datum unbekannt'
      : date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }), 'th');
    const identifier = document.createElement('span');
    identifier.className = 'run-id';
    identifier.textContent = runLabel;
    heading.appendChild(identifier);
    historyCell(row, entry.processing_mode === 'markdown-only' ? 'Markdown · Originalinhalte'
      : entry.processing_mode === 'markdown-and-anonymize' ? 'Markdown + anonymisieren' : 'Unbekannt');
    historyCell(row, `${count(entry.selected_count)} ausgewählt · ${count(entry.result_count)} Ergebnisse · ${count(entry.failed_count)} fehlgeschlagen`);
    historyCell(row, states[entry.status] || 'Status unbekannt');
    const actions = historyCell(row, '');
    actions.className = 'history-actions';
    const feedback = document.createElement('p');
    feedback.className = 'history-action-feedback';
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    for (const action of [
      { command: 'open_history_results', label: 'Ergebnisordner', available: entry.results_available === true, reason: 'Kein Ergebnisordner verfügbar.' },
      { command: 'open_history_ledger', label: 'Zuordnung', available: entry.ledger_available === true, reason: 'Keine Zuordnung verfügbar.' },
      { command: 'continue_history_batch', label: 'Fortsetzen', available: entry.resumable === true, reason: 'Keine Fortsetzung verfügbar.', resume: true }
    ]) {
      const wrapper = document.createElement('div');
      const button = document.createElement('button');
      button.textContent = action.label;
      button.setAttribute('aria-label', `${action.label} · ${runLabel}`);
      button.addEventListener('click', async () => {
        if (button.disabled || pageClosed || rendered !== historyRenderGeneration) return;
        feedback.hidden = false;
        feedback.textContent = `${action.label} wird angefordert …`;
        if (action.resume) {
          const result = await call(action.command, { batchId: entry.batch_id });
          feedback.textContent = result?.ok === true ? 'Fortsetzung gestartet. Der Laufstatus wird geprüft …' : 'Fortsetzung nicht möglich. Bitte den aktuellen Status prüfen.';
          if (result?.ok === true) { actionFeedback('Der Worker hat die Fortsetzung angenommen. Erst der aktualisierte Laufstatus bestätigt das Ergebnis.'); await refresh(); }
        } else {
          const result = await openLocal(action.command, action.label, { batchId: entry.batch_id });
          feedback.textContent = result?.handoff_confirmed === true
            ? `${action.label}: Öffnen an das Betriebssystem übergeben.`
            : `${action.label} konnte nicht geöffnet werden. Bitte den Verlauf aktualisieren.`;
        }
      });
      wrapper.appendChild(button);
      if (!action.available) {
        const reason = document.createElement('span');
        reason.className = 'action-reason';
        reason.textContent = action.reason;
        wrapper.appendChild(reason);
      }
      actions.appendChild(wrapper);
      historyButtons.push({ ...action, button });
    }
    actions.appendChild(feedback);
    body.appendChild(row);
  }
  const hasRows = historyButtons.length > 0;
  byId('history-table').hidden = !hasRows;
  byId('history-feedback').textContent = hasRows ? 'Bis zu 20 zuletzt angelegte Läufe. Nicht verfügbare Aktionen sind deaktiviert.' : 'Noch keine lokalen Läufe vorhanden.';
  updateHistoryAvailability();
}
async function refreshHistory(force = false) {
  if (pageClosed || operationInFlight || (!force && !historyDirty)) return;
  const request = ++historyRequestGeneration;
  const generation = admissionGeneration;
  historyDirty = true;
  updateHistoryAvailability();
  byId('history-feedback').textContent = 'Lokaler Verlauf wird geladen …';
  byId('history-table').setAttribute('aria-busy', 'true');
  try {
    const result = await invoke('get_run_history');
    if (request !== historyRequestGeneration || generation !== admissionGeneration || operationInFlight || pageClosed) return;
    if (result?.ok !== true || result.local_ui_only !== true || result.external_disclosure !== false || !Array.isArray(result.entries)) throw 'STANDALONE_HISTORY_UNAVAILABLE';
    historyDirty = false;
    renderHistory(result.entries);
  } catch {
    if (request === historyRequestGeneration && generation === admissionGeneration && !pageClosed) {
      byId('history-feedback').textContent = 'Der lokale Verlauf konnte nicht geladen werden. Öffne den Verlauf erneut, um es nochmals zu versuchen.';
    }
  } finally {
    if (request === historyRequestGeneration) byId('history-table').setAttribute('aria-busy', 'false');
  }
}
function summarize(values, emptyText) {
  if (!Array.isArray(values) || values.length === 0) return emptyText;
  const visibleValues = values.slice(0, 5);
  return `${visibleValues.join(', ')}${values.length > visibleValues.length ? ` · +${values.length - visibleValues.length} weitere` : ''}`;
}
function renderUiContext(context) {
  if (!context || context.local_ui_only !== true || context.external_disclosure !== false) return;
  const resultFolder = context.result_folder || 'Noch nicht festgelegt';
  const latestResultFolder = context.latest_result_folder || 'Noch kein abgeschlossener Lauf';
  latestResultFolderSeen = context.latest_result_folder || '';
  const sourceFolders = summarize(context.source_folders, 'Noch nicht ausgewählt');
  const selectedFiles = summarize(context.selected_files, 'Noch nicht ausgewählt');
  for (const id of ['result-folder', 'settings-result-folder']) {
    byId(id).textContent = resultFolder;
    byId(id).title = resultFolder;
  }
  byId('result-folder-results').textContent = latestResultFolder;
  byId('result-folder-results').title = latestResultFolder;
  byId('source-folders').textContent = sourceFolders;
  byId('source-folders').title = sourceFolders;
  byId('selected-files').textContent = selectedFiles;
  byId('selected-files').title = selectedFiles;
  renderSelectionList(context.selected_files);
  // `latest_result_folder` is durable history and can refer to a run from a
  // previous app session. The process-tab action represents only a run
  // explicitly started in this UI session. Historical results remain
  // available through the history table.
  currentResultsAvailable = currentSessionRunStarted && Boolean(latestResultFolderSeen) &&
    latestResultFolderSeen !== currentSessionResultBaseline;
  updateCurrentResultsAvailability();
}
function renderSelectionList(files) {
  const list = byId('selection-list');
  list.replaceChildren();
  selectionRemoveButtons = [];
  const values = Array.isArray(files) ? files : [];
  const directExtensions = new Set(['txt', 'md', 'markdown', 'csv']);
  const grouped = [
    ['Direkt lesbare Textdateien', values.map((name, index) => ({ name, index })).filter(({ name }) => directExtensions.has(String(name).split('.').pop().toLocaleLowerCase('de-DE')))],
    ['Lokal in Markdown umzuwandelnde Dateien', values.map((name, index) => ({ name, index })).filter(({ name }) => !directExtensions.has(String(name).split('.').pop().toLocaleLowerCase('de-DE')))]
  ];
  grouped.forEach(([heading, entries]) => {
    if (entries.length === 0) return;
    const groupHeading = document.createElement('li');
    groupHeading.className = 'selection-group-heading';
    groupHeading.textContent = `${heading} (${entries.length})`;
    list.appendChild(groupHeading);
    entries.forEach(({ name, index }) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = String(name);
    const button = document.createElement('button');
    button.textContent = 'Entfernen';
    button.setAttribute('aria-label', `${name} aus der Auswahl entfernen`);
    button.addEventListener('click', async () => {
      if (button.disabled || !admitted) return;
      const result = await call('remove_admitted_source', { selectionIndex: index });
      if (!result) return;
      if (result.selected_count === 0) {
        resetAdmissionUi();
        renderUiContext(result.ui_context);
        status('Bereit', 'Die Auswahl wurde geleert. Wähle neue Dateien oder einen ganzen Ordner aus.');
      } else renderAdmission(result);
    });
    item.appendChild(label);
    item.appendChild(button);
    list.appendChild(item);
    selectionRemoveButtons.push(button);
    });
  });
  list.hidden = !admitted || values.length === 0;
}
async function refreshUiContext() {
  const generation = admissionGeneration;
  try {
    const context = await invoke('get_ui_context');
    if (!operationInFlight && admissionGeneration === generation && !pageClosed) {
      renderUiContext(context);
      return true;
    }
  }
  catch (error) {
    if (!operationInFlight && admissionGeneration === generation && !pageClosed) showError(error);
  }
  return false;
}
function showError(error) {
  const code = String(error || 'STANDALONE_OPERATION_FAILED');
  status(`Sicher gestoppt · ${code}`, messages[code] || 'Der lokale Vorgang wurde sicher gestoppt.', '!');
}

function resetAdmissionUi() {
  admitted = false;
  admissionGeneration += 1;
  historyStateKey = null;
  byId('summary').hidden = true;
  byId('selection-list').hidden = true;
  byId('selection-list').replaceChildren();
  selectionRemoveButtons = [];
  byId('home-selection').hidden = true;
  visible('select-files', true);
  visible('select-folder', true);
  visible('start', false);
  visible('cancel', false);
  updateModeAvailability();
  updateDropAvailability();
}

function renderAdmission(result) {
  admissionGeneration += 1;
  admitted = true;
  renderUiContext(result.ui_context);
  byId('home-selection').hidden = false;
  const size = Number.isSafeInteger(result.total_bytes) ? ` · ${Math.ceil(result.total_bytes / 1024)} KB` : '';
  const recursive = result.ui_context?.source_kind === 'folder' ? ' · einschließlich Unterordnern' : '';
  const ignored = Number.isSafeInteger(result.ignored_artifact_count) && result.ignored_artifact_count > 0
    ? ` · ${result.ignored_artifact_count} temporäre Office-Datei${result.ignored_artifact_count === 1 ? '' : 'en'} übersprungen`
    : '';
  byId('summary').textContent = `${result.selected_count} Datei${result.selected_count === 1 ? '' : 'en'}${size}${recursive}${ignored} · vollständig lokal`;
  byId('summary').hidden = false;
  status('Auswahl bereit', 'Einmal starten – danach läuft der Stapel ohne weitere Bestätigung.');
  visible('select-files', false); visible('select-folder', false); visible('start', true); visible('cancel', true);
  visible('continue', false);
  byId('action-feedback').hidden = true;
  updateModeAvailability();
  updateDropAvailability();
}

function handleNativeDrop(event) {
  const payload = event?.payload;
  if (!payload || pageClosed) return;
  byId('drop-zone').className = 'drop-zone';
  if (payload.phase === 'enter') {
    if (updateDropAvailability()) byId('drop-zone').className = 'drop-zone active';
  } else if (payload.phase === 'checking') {
    admissionGeneration += 1;
    invalidateHistory();
    nativeDropInFlight = true;
    applyBusyState();
    actionFeedback('Die hineingezogene Auswahl wird lokal geprüft …');
  } else if (payload.phase === 'accepted') {
    nativeDropInFlight = false;
    renderAdmission(payload.result);
    applyBusyState();
    if (activeView === 'process') byId(validMode(byId('processing-mode').value) ? 'start' : 'processing-mode').focus();
  } else if (payload.phase === 'failed' || payload.phase === 'rejected') {
    if (payload.phase === 'failed' && nativeDropInFlight) {
      nativeDropInFlight = false;
      applyBusyState();
    }
    actionFeedback(messages[payload.error_code] || 'Die hineingezogene Auswahl konnte nicht übernommen werden.', true);
  }
}

async function choose(command) {
  if (operationInFlight || admitted) return;
  busy(true);
  try {
    const result = await invoke(command);
    if (result.cancelled) return;
    renderAdmission(result);
  } catch (error) { showError(error); }
  finally { busy(false); }
}

async function call(command, args) {
  if (operationInFlight) return null;
  busy(true);
  try { return await invoke(command, args); }
  catch (error) {
    const code = String(error || 'STANDALONE_OPERATION_FAILED');
    if (code === 'STANDALONE_NO_ADMISSION' || code === 'STANDALONE_START_FAILED' || code === 'STANDALONE_IPC_FAILED' || code === 'STANDALONE_IPC_TIMEOUT') {
      lastPublicState = null;
      resetAdmissionUi();
      // A restored admission has no running poll yet. An unconfirmed start can
      // still be processing in the backend, so recover via status, never retry.
      scheduleRefresh(1200);
    }
    showError(code);
    return null;
  }
  finally { busy(false); }
}

async function openLocal(command, label, args) {
  if (operationInFlight) return null;
  actionFeedback(`${label} wird an das Betriebssystem übergeben …`);
  busy(true);
  try {
    const result = await invoke(command, args);
    if (result?.handoff_confirmed !== true) throw 'STANDALONE_OPERATION_FAILED';
    actionFeedback(`${label} wurde an das Betriebssystem zum Öffnen übergeben.`);
    return result;
  } catch (error) {
    const code = String(error || 'STANDALONE_OPERATION_FAILED');
    actionFeedback(messages[code] || 'Der lokale Öffnungsvorgang ist fehlgeschlagen.', true);
    return null;
  } finally { busy(false); }
}

for (const [index, name] of views.entries()) {
  const tab = byId(`tab-${name}`);
  tab.addEventListener('click', () => switchView(name));
  tab.addEventListener('keydown', (event) => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % views.length;
    else if (event.key === 'ArrowLeft') target = (index + views.length - 1) % views.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = views.length - 1;
    else return;
    event.preventDefault();
    // Manual activation keeps potentially slow local history reads out of arrow navigation.
    for (const [position, view] of views.entries()) byId(`tab-${view}`).setAttribute('tabindex', position === target ? '0' : '-1');
    byId(`tab-${views[target]}`).focus();
  });
}
for (const [id, mode] of [['task-markdown', 'markdown-only'], ['task-anonymize', 'markdown-and-anonymize']]) {
  byId(id).addEventListener('click', () => {
    if (byId(id).disabled) return;
    byId('processing-mode').value = mode;
    renderModeHelp(mode);
    updateModeAvailability();
    switchView('process');
    byId(admitted ? 'start' : 'select-files').focus();
  });
}
byId('select-files').addEventListener('click', () => choose('select_files'));
byId('select-folder').addEventListener('click', () => choose('select_folder'));
byId('process-results').addEventListener('click', () => {
  if (!byId('process-results').disabled) openLocal('open_current_results', 'Ergebnisordner');
});
byId('processing-mode').addEventListener('change', () => { renderModeHelp(byId('processing-mode').value); updateModeAvailability(); });
byId('output-naming-mode').addEventListener('change', () => { renderOutputNamingHelp(); updateModeAvailability(); });
byId('cancel').addEventListener('click', async () => {
  if (!await call('cancel_admission')) return;
  resetAdmissionUi();
  if (await refreshUiContext() && !admitted && !operationInFlight) {
    status('Bereit', 'Wähle Dateien oder einen ganzen Ordner aus.');
  }
  scheduleRefresh(0);
});
byId('start').addEventListener('click', async () => {
  if (!admitted || operationInFlight) return;
  const processingMode = byId('processing-mode').value;
  if (!validMode(processingMode)) {
    actionFeedback('Bitte zuerst eine Aufgabe auswählen. Die Dateiauswahl bleibt erhalten.', true);
    updateModeAvailability();
    return;
  }
  const startArguments = { processingMode };
  if (processingMode === 'markdown-and-anonymize') {
    const outputNamingMode = byId('output-naming-mode').value;
    if (!validOutputNamingMode(outputNamingMode)) {
      actionFeedback('Bitte eine gültige Benennung für anonymisierte Ergebnisse auswählen. Die Dateiauswahl bleibt erhalten.', true);
      updateModeAvailability();
      return;
    }
    startArguments.outputNamingMode = outputNamingMode;
  }
  if (!await call('start_admitted_batch', startArguments)) return;
  currentSessionResultBaseline = latestResultFolderSeen;
  currentSessionRunStarted = true;
  lastProcessingMode = processingMode;
  admitted = false; admissionGeneration += 1; byId('summary').hidden = true;
  currentResultsAvailable = false;
  updateCurrentResultsAvailability();
  historyStateKey = null;
  byId('home-selection').hidden = true;
  lastPublicState = 'preparing';
  updateModeAvailability();
  status('Stapel wird vorbereitet', 'DataSecure erstellt den wiederaufnehmbaren lokalen Zwischenstand.');
  visible('start', false); visible('cancel', false);
  scheduleRefresh(0);
});
byId('continue').addEventListener('click', () => switchView('results'));
byId('new-batch').addEventListener('click', () => {
  if (!byId('processing-mode').disabled) {
    byId('processing-mode').value = '';
    byId('output-naming-mode').value = 'neutral';
    renderModeHelp('');
    updateModeAvailability();
  }
  switchView('home');
  byId('tab-home').focus();
});
byId('diagnostics').addEventListener('click', async () => {
  try {
    await invoke('open_diagnostic_folder');
    actionFeedback('Der Diagnoseordner wurde an das Betriebssystem zum Öffnen übergeben. Die Protokolle enthalten keine Dateinamen, Pfade oder Inhalte.');
  } catch (error) { actionFeedback(messages[String(error)] || 'Der Diagnoseordner konnte nicht geöffnet werden.', true); }
});
byId('configure-results').addEventListener('click', async () => {
  const result = await call('configure_results');
  if (result && !result.cancelled) {
    if (result.local_ui_only === true && result.external_disclosure === false) {
      const resultFolder = result.result_folder || 'Noch nicht festgelegt';
      for (const id of ['result-folder', 'settings-result-folder']) {
        byId(id).textContent = resultFolder;
        byId(id).title = resultFolder;
      }
    }
    actionFeedback(result.network_folder_notice === true
      ? 'Der Ordner ist gespeichert. Hinweis: Ergebnisse und Zuordnungsdateien können über dieses Netzlaufwerk an andere Systeme übertragen werden.'
      : result.export_replay_pending === true
        ? 'Der neue Ordner ist gespeichert. Ausstehende Ergebnisse werden beim nächsten sicheren Wiederholungsversuch bereitgestellt.'
        : 'Künftige Ergebnisse werden dort in einem eigenen Laufordner abgelegt.');
  }
});

function scheduleRefresh(delay) {
  clearTimeout(refreshTimer);
  if (pageClosed) return;
  refreshTimer = setTimeout(refresh, delay);
}

function acknowledgeRenderedTerminalState(generation) {
  if (!Number.isSafeInteger(generation) || generation < 1 || acknowledgedPresentationGeneration === generation) return;
  acknowledgedPresentationGeneration = generation;
  // Two animation frames give the updated terminal text a paint opportunity
  // before this content-free acknowledgement crosses the private IPC channel.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    invoke('ack_terminal_presented', { presentationGeneration: generation })
      .catch(() => { if (acknowledgedPresentationGeneration === generation) acknowledgedPresentationGeneration = null; });
  }));
}

async function refresh() {
  if (pageClosed || refreshInFlight) return;
  if (admitted || operationInFlight) {
    // A timer consumed while a native dialog or uncertain start is pending
    // must not permanently stop polling. No IPC is sent while it is busy.
    scheduleRefresh(admitted && !operationInFlight ? 5000 : 1200);
    return;
  }
  const generation = admissionGeneration;
  refreshInFlight = true;
  let nextDelay = 5000;
  try {
    const state = await invoke('get_public_state');
    if (admitted || operationInFlight || pageClosed || generation !== admissionGeneration) return;
    if (state.state === 'results_available' || state.state === 'completed_without_results') {
      // Two fast consecutive runs may both be first observed as terminal. A
      // state-name comparison alone would retain the preceding run's folder.
      // The presentation generation covers new backend notices; the local
      // operation generation also covers runs finishing before their first poll.
      const contextKey = `${state.state}:${state.presentation_generation ?? ''}:${generation}`;
      if (contextKey !== lastTerminalContextKey) {
        if (!await refreshUiContext()) return;
        lastTerminalContextKey = contextKey;
      }
    } else lastTerminalContextKey = null;
    if (admitted || operationInFlight || pageClosed || generation !== admissionGeneration) return;
    lastPublicState = state.state;
    const terminalHistory = !['preparing', 'processing'].includes(state.state);
    const nextHistoryKey = JSON.stringify([state.state, state.presentation_generation,
      terminalHistory ? state.result_count : null, terminalHistory ? state.failed_count : null,
      state.results_available, state.ledger_available, state.resumable_count]);
    if (historyStateKey !== nextHistoryKey) {
      historyStateKey = nextHistoryKey;
      invalidateHistory();
      if (activeView === 'results') refreshHistory();
    }
    lastProcessingMode = state.processing_mode || 'markdown-and-anonymize';
    const converting = lastProcessingMode === 'markdown-only';
    if (byId('result-label')) byId('result-label').textContent = converting
      ? 'Markdown-Dateien im letzten abgeschlossenen Lauf – nicht anonymisiert'
      : 'Anonymisierte Ergebnisse im letzten abgeschlossenen Lauf';
    if (byId('result-warning')) {
      const warnings = Number.isSafeInteger(state.warning_count) ? state.warning_count : 0;
      const failed = Number.isSafeInteger(state.failed_count) ? state.failed_count : 0;
      const details = failed ? 'Details zum Fehler findest du über „Diagnose öffnen“.' : '';
      byId('result-warning').hidden = !converting;
      byId('result-warning').textContent = converting
        ? `Nicht anonymisiert: Die Dateien enthalten Originalinhalte.${warnings ? ` ${warnings} Datei(en) mit Extraktionshinweisen.` : ''}${failed ? ` ${failed} Datei(en) konnten nicht umgewandelt werden.` : ''}${details ? ` ${details}` : ''}`
        : '';
    }
    updateModeAvailability();
    updateDropAvailability();
    byId('result-count').textContent = String(Number.isInteger(state.result_count) ? state.result_count : 0);
    visible('continue', state.state === 'review_required' || state.state === 'stopped');
    visible('select-files', admissionAvailableStates.has(state.state));
    visible('select-folder', admissionAvailableStates.has(state.state));
    if (state.state === 'preparing') {
      acknowledgedPresentationGeneration = null;
      status('Stapel wird vorbereitet', 'DataSecure erstellt den wiederaufnehmbaren lokalen Zwischenstand.');
      nextDelay = 1200;
    }
    else if (state.state === 'processing') {
      acknowledgedPresentationGeneration = null;
      const total = Number.isInteger(state.selected_count) ? state.selected_count : 0;
      const done = Number.isInteger(state.completed_count) ? state.completed_count : 0;
      status(converting ? 'Umwandlung läuft' : 'Anonymisierung läuft', total > 0 ? `${done} von ${total} Dateien abgeschlossen.` : 'Die Dateien werden lokal verarbeitet.');
      nextDelay = 1200;
    }
    else if (state.state === 'review_required') { status('Prüfung erforderlich', `${state.review_count} Datei${state.review_count === 1 ? '' : 'en'} benötigt eine lokale Entscheidung.`); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'stopped') { status('Fortsetzung möglich', `${state.resumable_count} unterbrochene${state.resumable_count === 1 ? 'r Stapel kann' : ' Stapel können'} fortgesetzt werden.`); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'export_pending') {
      if (state.completion_pending === true) {
        status('Abschlussübersicht wird bereitgestellt',
          'Die Verarbeitung ist abgeschlossen, aber die lokale Zuordnungsdatei oder der Abschlussnachweis konnte noch nicht vollständig gespeichert werden. Bitte den Ergebnisordner prüfen und erneut auswählen.');
      } else {
        status('Ergebnis wird bereitgestellt', `${state.export_pending_count} Ergebnis${state.export_pending_count === 1 ? ' wird' : 'se werden'} nach einer erneuten Ordnerprüfung bereitgestellt.`);
      }
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'results_available') {
      status('Fertig', converting ? `${state.result_count} Markdown-Datei${state.result_count === 1 ? ' wurde' : 'en wurden'} erstellt. Nicht anonymisiert.` : `${state.result_count} anonymisierte${state.result_count === 1 ? 's Ergebnis ist' : ' Ergebnisse sind'} verfügbar.`);
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'completed_without_results') {
      const details = converting
        ? 'Für reine Konvertierung wird keine Zuordnungsdatei erstellt. Mit „Diagnose öffnen“ findest du Details zum Fehler.'
        : state.ledger_available === true
          ? 'Details stehen in der lokalen Zuordnung.'
          : 'Eine Zuordnungsdatei ist für diesen Lauf nicht verfügbar. Bitte die Diagnose öffnen.';
      status('Abgeschlossen mit Hinweisen', `${state.failed_count} Datei${state.failed_count === 1 ? ' wurde' : 'en wurden'} nicht verarbeitet. Es ist kein${converting ? ' Markdown-' : ' anonymisiertes '}Ergebnis verfügbar. ${details}`);
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'blocked') { acknowledgedPresentationGeneration = null; status('Nicht bereit', 'Der lokale DataSecure-Core konnte nicht gestartet werden.'); }
    else {
      acknowledgedPresentationGeneration = null;
      status('Bereit', 'Wähle Dateien oder einen ganzen Ordner aus.');
    }
    if (state.termination_unconfirmed === true) {
      status('Verarbeitung unterbrochen', 'Das Ende des Konvertierungsprozesses konnte nicht bestätigt werden. Übrige Dateien wurden nicht gestartet. Bitte die Diagnose prüfen.');
      byId('status-icon').textContent = '!';
    }
  } catch (error) {
    if (!admitted && !operationInFlight && !pageClosed && generation === admissionGeneration) showError(error);
  }
  finally {
    refreshInFlight = false;
    scheduleRefresh(nextDelay);
  }
}

(async function bootstrap() {
  byId('processing-mode').value = '';
  byId('output-naming-mode').value = 'neutral';
  renderModeHelp('');
  switchView('home');
  updateModeAvailability();
  try {
    let nativeDropReady = false;
    try {
      const unlisten = await window.__TAURI__.event.listen('datasecure-native-drop', handleNativeDrop);
      if (pageClosed) { unlisten(); return; }
      unlistenNativeDrop = unlisten;
      nativeDropReady = true;
    } catch {
      byId('drop-zone').hidden = true;
      actionFeedback('Drag-and-drop ist gerade nicht verfügbar. Bitte „Dateien auswählen“ oder „Ordner auswählen“ verwenden.', true);
    }
    const ready = await invoke('frontend_ready', { nativeDropReady });
    if (ready && typeof ready.product_version === 'string' && /^\d+\.\d+\.\d+-rc\d+$/u.test(ready.product_version)) {
      byId('product-version').textContent = `Version ${ready.product_version}`;
    }
    if (ready?.admission_prepared === true) {
      const context = await invoke('get_ui_context');
      renderAdmission({ selected_count: Array.isArray(context.selected_files) ? context.selected_files.length : 0,
        ui_context: context });
      return;
    }
    await refreshUiContext();
    await refresh();
  } catch (error) {
    showError(error);
    scheduleRefresh(1500);
  }
})();

window.addEventListener('pagehide', () => {
  pageClosed = true;
  clearTimeout(refreshTimer);
  if (unlistenNativeDrop) { unlistenNativeDrop(); unlistenNativeDrop = null; }
});
