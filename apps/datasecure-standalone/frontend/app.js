'use strict';

const invoke = window.__TAURI__.core.invoke;
const byId = (id) => document.getElementById(id);
const controls = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger',
  'new-batch', 'configure-results', 'diagnostics', 'processing-mode'];
const messages = {
  STANDALONE_BUSY: 'Ein Stapel wird bereits verarbeitet.',
  STANDALONE_ENGINE_NOT_READY: 'Die lokale Verarbeitung ist noch nicht bereit.',
  STANDALONE_SELECTION_INVALID: 'Die Dateiauswahl überschreitet eine sichere Grenze oder enthält einen nicht unterstützten Pfad.',
  STANDALONE_SELECTION_PREPARED: 'Eine Auswahl ist bereits vorbereitet. Bitte starten oder die Auswahl verwerfen, bevor du neue Dateien hinzufügst.',
  STANDALONE_DROP_MIXED: 'Bitte entweder Dateien oder genau einen Ordner hineinziehen. Ordner und einzelne Dateien können nicht gemeinsam ausgewählt werden.',
  STANDALONE_NO_ADMISSION: 'Bitte zuerst Dateien oder einen Ordner auswählen.',
  STANDALONE_START_FAILED: 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.',
  PROCESSING_MODE_INVALID: 'Bitte einen gültigen Verarbeitungsmodus auswählen. Der Stapel wurde nicht gestartet.',
  PROCESSING_MODE_FORBIDDEN: 'Dieser Verarbeitungsmodus ist hier nicht verfügbar. Der Stapel wurde nicht gestartet.',
  MARKDOWN_CONVERSION_NOT_READY: 'Reine Markdown-Konvertierung ist noch in Entwicklung. Der Stapel wurde nicht gestartet; deine Dateiauswahl bleibt erhalten.',
  STANDALONE_NOTHING_TO_CONTINUE: 'Es gibt keinen fortsetzbaren Stapel.',
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
let activeView = 'process';
let viewChosenByUser = false;
let lastPublicState = null;
let lastTerminalContextKey = null;
let operationInFlight = false;
let foregroundOperationInFlight = false;
let nativeDropInFlight = false;
let unlistenNativeDrop = null;
let pageClosed = false;

function busy(value) {
  // A foreground operation can replace the current selection or run while a
  // previous status/context request is still in flight. Invalidate that reply.
  if (value) admissionGeneration += 1;
  foregroundOperationInFlight = value;
  applyBusyState();
}
function applyBusyState() {
  operationInFlight = foregroundOperationInFlight || nativeDropInFlight;
  controls.forEach((id) => { byId(id).disabled = operationInFlight; });
  updateModeAvailability();
  updateDropAvailability();
}
function updateModeAvailability() {
  // The selector describes the next admission, never an active/recoverable run.
  byId('processing-mode').disabled = operationInFlight || (!admitted &&
    !['ready', 'results_available', 'completed_without_results'].includes(lastPublicState));
}
function updateDropAvailability() {
  const available = !operationInFlight && !admitted &&
    ['ready', 'results_available', 'completed_without_results'].includes(lastPublicState);
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
function switchView(view, chosenByUser = false) {
  if (chosenByUser) viewChosenByUser = true;
  activeView = view === 'results' ? 'results' : 'process';
  byId('process-view').hidden = activeView !== 'process';
  byId('results-view').hidden = activeView !== 'results';
  for (const name of ['process', 'results']) {
    const selected = name === activeView;
    const tab = byId(`tab-${name}`);
    tab.className = `tab${selected ? ' active' : ''}`;
    tab.setAttribute('aria-selected', String(selected));
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
  const sourceFolders = summarize(context.source_folders, 'Noch nicht ausgewählt');
  const selectedFiles = summarize(context.selected_files, 'Noch nicht ausgewählt');
  byId('result-folder').textContent = resultFolder;
  byId('result-folder').title = resultFolder;
  byId('result-folder-results').textContent = latestResultFolder;
  byId('result-folder-results').title = latestResultFolder;
  byId('source-folders').textContent = sourceFolders;
  byId('source-folders').title = sourceFolders;
  byId('selected-files').textContent = selectedFiles;
  byId('selected-files').title = selectedFiles;
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
  byId('summary').hidden = true;
  visible('select-files', true);
  visible('select-folder', true);
  visible('start', false);
  visible('cancel', false);
  updateModeAvailability();
  updateDropAvailability();
}

function renderAdmission(result) {
  admissionGeneration += 1;
  renderUiContext(result.ui_context);
  admitted = true;
  switchView('process', true);
  const size = Number.isSafeInteger(result.total_bytes) ? ` · ${Math.ceil(result.total_bytes / 1024)} KB` : '';
  byId('summary').textContent = `${result.selected_count} Datei${result.selected_count === 1 ? '' : 'en'}${size} · vollständig lokal`;
  byId('summary').hidden = false;
  status('Auswahl bereit', 'Einmal starten – danach läuft der Stapel ohne weitere Bestätigung.');
  visible('select-files', false); visible('select-folder', false); visible('start', true); visible('cancel', true);
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
    nativeDropInFlight = true;
    applyBusyState();
    switchView('process', true);
    actionFeedback('Die hineingezogene Auswahl wird lokal geprüft …');
  } else if (payload.phase === 'accepted') {
    nativeDropInFlight = false;
    renderAdmission(payload.result);
    applyBusyState();
    byId('start').focus();
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

async function openLocal(command, label) {
  if (operationInFlight) return null;
  actionFeedback(`${label} wird an das Betriebssystem übergeben …`);
  busy(true);
  try {
    const result = await invoke(command);
    if (result?.handoff_confirmed !== true) throw 'STANDALONE_OPERATION_FAILED';
    actionFeedback(`${label} wurde an das Betriebssystem zum Öffnen übergeben.`);
    return result;
  } catch (error) {
    const code = String(error || 'STANDALONE_OPERATION_FAILED');
    actionFeedback(messages[code] || 'Der lokale Öffnungsvorgang ist fehlgeschlagen.', true);
    return null;
  } finally { busy(false); }
}

byId('tab-process').addEventListener('click', () => switchView('process', true));
byId('tab-results').addEventListener('click', () => switchView('results', true));
byId('select-files').addEventListener('click', () => choose('select_files'));
byId('select-folder').addEventListener('click', () => choose('select_folder'));
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
  if (!await call('start_admitted_batch', { processingMode })) return;
  viewChosenByUser = false;
  admitted = false; admissionGeneration += 1; byId('summary').hidden = true;
  lastPublicState = 'preparing';
  updateModeAvailability();
  status('Stapel wird vorbereitet', 'DataSecure erstellt den wiederaufnehmbaren lokalen Zwischenstand.');
  visible('start', false); visible('cancel', false);
  scheduleRefresh(0);
});
byId('continue').addEventListener('click', async () => { if (await call('continue_current_batch')) refresh(); });
byId('results').addEventListener('click', () => openLocal('open_current_results', 'Der Ergebnisordner'));
byId('ledger').addEventListener('click', () => openLocal('open_local_ledger', 'Die Zuordnungsdatei'));
byId('new-batch').addEventListener('click', () => {
  switchView('process', true);
  actionFeedback('Wähle Dateien oder einen Ordner für den nächsten Stapel aus.');
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
      byId('result-folder').textContent = result.result_folder || 'Noch nicht festgelegt';
    }
    actionFeedback(result.export_replay_pending === true
      ? 'Der neue Ordner ist gespeichert. Ausstehende Ergebnisse werden beim nächsten sicheren Wiederholungsversuch bereitgestellt.'
      : 'Künftige freigegebene Ergebnisse werden dort abgelegt.');
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
    updateModeAvailability();
    updateDropAvailability();
    byId('result-count').textContent = String(Number.isInteger(state.result_count) ? state.result_count : 0);
    visible('continue', state.state === 'review_required' || state.state === 'stopped');
    visible('results', state.results_available === true);
    visible('ledger', state.results_available === true ||
      (state.state === 'completed_without_results' && state.ledger_available === true));
    visible('select-files', state.state === 'ready' || state.state === 'results_available' || state.state === 'completed_without_results');
    visible('select-folder', state.state === 'ready' || state.state === 'results_available' || state.state === 'completed_without_results');
    if (state.state === 'preparing') {
      acknowledgedPresentationGeneration = null;
      status('Stapel wird vorbereitet', 'DataSecure erstellt den wiederaufnehmbaren lokalen Zwischenstand.');
      nextDelay = 1200;
    }
    else if (state.state === 'processing') {
      acknowledgedPresentationGeneration = null;
      const total = Number.isInteger(state.selected_count) ? state.selected_count : 0;
      const done = Number.isInteger(state.completed_count) ? state.completed_count : 0;
      status('Anonymisierung läuft', total > 0 ? `${done} von ${total} Dateien abgeschlossen.` : 'Die Dateien werden lokal verarbeitet.');
      nextDelay = 1200;
    }
    else if (state.state === 'review_required') { status('Prüfung erforderlich', `${state.review_count} Datei${state.review_count === 1 ? '' : 'en'} benötigt eine lokale Entscheidung.`); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'stopped') { status('Fortsetzung möglich', `${state.resumable_count} unterbrochene${state.resumable_count === 1 ? 'r Stapel kann' : ' Stapel können'} fortgesetzt werden.`); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'export_pending') {
      if (state.completion_pending === true) {
        status('Abschlussübersicht wird bereitgestellt',
          'Die Verarbeitung ist abgeschlossen, aber die lokale Zuordnungsdatei oder der Abschlussnachweis konnte noch nicht vollständig gespeichert werden. Bitte den Ergebnisordner prüfen und erneut auswählen.');
      } else {
        status('Ergebnis wird bereitgestellt', `${state.export_pending_count} anonymisierte${state.export_pending_count === 1 ? 's Ergebnis wird' : ' Ergebnisse werden'} nach einer erneuten Ordnerprüfung bereitgestellt.`);
      }
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'results_available') {
      status('Fertig', `${state.result_count} anonymisierte${state.result_count === 1 ? 's Ergebnis ist' : ' Ergebnisse sind'} verfügbar.`);
      if (!viewChosenByUser && !admitted) switchView('results');
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'completed_without_results') {
      const details = state.ledger_available === true
        ? 'Details stehen in der lokalen Zuordnung.'
        : 'Eine Zuordnungsdatei ist für diesen Lauf nicht verfügbar. Bitte die Diagnose öffnen.';
      status('Sicher abgeschlossen', `${state.failed_count} Datei${state.failed_count === 1 ? ' wurde' : 'en wurden'} gestoppt. Es ist kein anonymisiertes Ergebnis verfügbar. ${details}`);
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'blocked') { acknowledgedPresentationGeneration = null; status('Nicht bereit', 'Der lokale DataSecure-Core konnte nicht gestartet werden.'); }
    else {
      acknowledgedPresentationGeneration = null;
      status('Bereit', 'Wähle Dateien oder einen ganzen Ordner aus.');
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
