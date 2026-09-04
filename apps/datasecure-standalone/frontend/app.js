'use strict';

const invoke = window.__TAURI__.core.invoke;
const byId = (id) => document.getElementById(id);
const controls = ['select-files', 'select-folder', 'start', 'cancel', 'continue', 'results', 'ledger', 'configure-results'];
const messages = {
  STANDALONE_BUSY: 'Ein Stapel wird bereits verarbeitet.',
  STANDALONE_ENGINE_NOT_READY: 'Die lokale Verarbeitung ist noch nicht bereit.',
  STANDALONE_SELECTION_INVALID: 'Die Dateiauswahl überschreitet eine sichere Grenze oder enthält einen nicht unterstützten Pfad.',
  STANDALONE_NO_ADMISSION: 'Bitte zuerst Dateien oder einen Ordner auswählen.',
  STANDALONE_START_FAILED: 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.',
  STANDALONE_NOTHING_TO_CONTINUE: 'Es gibt keinen fortsetzbaren Stapel.',
  STANDALONE_RUNTIME_MISSING: 'Der lokale DataSecure-Core fehlt.',
  STANDALONE_RUNTIME_START_FAILED: 'Der lokale DataSecure-Core konnte nicht gestartet werden.',
  STANDALONE_IPC_FAILED: 'Die lokale Verbindung zum DataSecure-Core wurde unterbrochen und wird beim nächsten Versuch neu gestartet.',
  STANDALONE_IPC_TIMEOUT: 'Die lokale Verarbeitung antwortete nicht rechtzeitig. Die Verbindung wird beim nächsten Versuch neu gestartet.',
  STANDALONE_RESULT_ROOT_UNSAFE: 'Der Ergebnisordner darf nicht im privaten DataSecure-Bereich liegen.',
  STANDALONE_RESULT_OPEN_FAILED: 'Der Ergebnisordner konnte nicht geöffnet werden.',
  STANDALONE_RESULTS_MISSING: 'Es ist noch kein vollständiger Ergebnislauf verfügbar.',
  STANDALONE_LEDGER_MISSING: 'Es ist noch keine lokale Zuordnung vorhanden.',
  STANDALONE_LEDGER_OPEN_FAILED: 'Der Ordner mit der lokalen Zuordnung konnte nicht geöffnet werden.'
};
let admitted = false;
let refreshInFlight = false;
let refreshTimer;

function busy(value) { controls.forEach((id) => { byId(id).disabled = value; }); }
function visible(id, value) { byId(id).hidden = !value; }
function status(title, text) { byId('status-title').textContent = title; byId('status-text').textContent = text; }
function showError(error) {
  const code = String(error || 'STANDALONE_OPERATION_FAILED');
  status('Sicher gestoppt', messages[code] || 'Der lokale Vorgang wurde sicher gestoppt.');
}

function resetAdmissionUi() {
  admitted = false;
  byId('summary').hidden = true;
  visible('select-files', true);
  visible('select-folder', true);
  visible('start', false);
  visible('cancel', false);
}

async function choose(command) {
  busy(true);
  try {
    const result = await invoke(command);
    if (result.cancelled) return;
    admitted = true;
    byId('summary').textContent = `${result.selected_count} Datei${result.selected_count === 1 ? '' : 'en'} · ${Math.ceil(result.total_bytes / 1024)} KB · vollständig lokal`;
    byId('summary').hidden = false;
    status('Auswahl bereit', 'Einmal starten – danach läuft der Stapel ohne weitere Bestätigung.');
    visible('select-files', false); visible('select-folder', false); visible('start', true); visible('cancel', true);
  } catch (error) { showError(error); }
  finally { busy(false); }
}

async function call(command) {
  busy(true);
  try { return await invoke(command); }
  catch (error) {
    const code = String(error || 'STANDALONE_OPERATION_FAILED');
    if (code === 'STANDALONE_NO_ADMISSION' || code === 'STANDALONE_START_FAILED' || code === 'STANDALONE_IPC_FAILED' || code === 'STANDALONE_IPC_TIMEOUT') {
      resetAdmissionUi();
    }
    showError(code);
    return null;
  }
  finally { busy(false); }
}

byId('select-files').addEventListener('click', () => choose('select_files'));
byId('select-folder').addEventListener('click', () => choose('select_folder'));
byId('cancel').addEventListener('click', async () => {
  if (!await call('cancel_admission')) return;
  resetAdmissionUi();
  status('Bereit', 'Wähle Dateien oder einen ganzen Ordner aus.');
  scheduleRefresh(0);
});
byId('start').addEventListener('click', async () => {
  if (!await call('start_admitted_batch')) return;
  admitted = false; byId('summary').hidden = true;
  status('Anonymisierung läuft', 'Du kannst DataSecure geöffnet lassen. Der Fortschritt wird automatisch aktualisiert.');
  visible('start', false); visible('cancel', false);
  scheduleRefresh(0);
});
byId('continue').addEventListener('click', async () => { if (await call('continue_current_batch')) refresh(); });
byId('results').addEventListener('click', () => call('open_current_results'));
byId('ledger').addEventListener('click', () => call('open_local_ledger'));
byId('configure-results').addEventListener('click', async () => {
  const result = await call('configure_results');
  if (result && !result.cancelled) status('Ergebnisordner geändert', 'Künftige freigegebene Ergebnisse werden dort abgelegt.');
});

function scheduleRefresh(delay) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, delay);
}

async function refresh() {
  if (admitted || refreshInFlight) return;
  refreshInFlight = true;
  let nextDelay = 5000;
  try {
    const state = await invoke('get_public_state');
    visible('continue', state.state === 'review_required' || state.state === 'stopped');
    visible('results', state.results_available === true);
    visible('ledger', state.results_available === true);
    visible('select-files', state.state === 'ready' || state.state === 'results_available');
    visible('select-folder', state.state === 'ready' || state.state === 'results_available');
    if (state.state === 'processing') {
      status('Anonymisierung läuft', 'Die Dateien werden lokal verarbeitet.');
      nextDelay = 1200;
    }
    else if (state.state === 'review_required') status('Prüfung erforderlich', `${state.review_count} Datei${state.review_count === 1 ? '' : 'en'} benötigt eine lokale Entscheidung.`);
    else if (state.state === 'stopped') status('Fortsetzung möglich', `${state.resumable_count} unterbrochene${state.resumable_count === 1 ? 'r Stapel kann' : ' Stapel können'} fortgesetzt werden.`);
    else if (state.state === 'export_pending') status('Ergebnis wird bereitgestellt', `${state.export_pending_count} anonymisierte${state.export_pending_count === 1 ? 's Ergebnis wird' : ' Ergebnisse werden'} nach einer erneuten Ordnerprüfung bereitgestellt.`);
    else if (state.state === 'results_available') status('Fertig', `${state.result_count} anonymisierte${state.result_count === 1 ? 's Ergebnis ist' : ' Ergebnisse sind'} verfügbar.`);
    else if (state.state === 'blocked') status('Nicht bereit', 'Der lokale DataSecure-Core konnte nicht gestartet werden.');
  } catch (error) { showError(error); }
  finally {
    refreshInFlight = false;
    scheduleRefresh(nextDelay);
  }
}

refresh();
