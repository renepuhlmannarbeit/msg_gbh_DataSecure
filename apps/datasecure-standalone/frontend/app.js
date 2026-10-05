'use strict';

const invoke = window.__TAURI__.core.invoke;
const byId = (id) => document.getElementById(id);
const controls = ['select-files', 'select-folder', 'start', 'cancel', 'continue',
  'process-results', 'process-completion-results', 'process-completion-review', 'process-completion-history', 'prepare-new-run',
  'new-batch', 'review-open', 'configure-results', 'setup-results', 'diagnostics', 'identity-mappings-directory', 'processing-mode', 'output-naming-mode',
  'task-markdown', 'task-anonymize'];
const messages = {
  STANDALONE_BUSY: 'Ein Stapel wird bereits verarbeitet.',
  STANDALONE_ENGINE_NOT_READY: 'Die lokale Verarbeitung ist noch nicht bereit.',
  STANDALONE_SELECTION_INVALID: 'Die Dateiauswahl überschreitet eine sichere Grenze oder enthält einen nicht unterstützten Pfad.',
  SOURCE_FOLDER_FILE_LIMIT: 'Der Ordner enthält mehr als 200 unterstützte Dateien. Bitte höchstens 200 Dateien pro Stapel auswählen.',
  SOURCE_FOLDER_SIZE_LIMIT: 'Die unterstützten Dateien im Ordner sind zusammen größer als 500 MB. Bitte einen kleineren Stapel auswählen.',
  SOURCE_FOLDER_UNSUPPORTED_FILES: 'Der Ordner enthält mindestens eine nicht unterstützte Datei. Es wurde nichts übernommen; bitte diese Datei entfernen oder einen passenderen Ordner wählen.',
  SOURCE_FOLDER_EMPTY: 'In diesem Ordner und seinen Unterordnern wurden keine unterstützten Dateien gefunden.',
  SOURCE_FORMAT_SIZE_LIMIT: 'Mindestens eine Datei überschreitet die sichere Einzeldateigrenze ihres Formats (Office: 64 MiB; PDF/Bild: 25 MiB; TXT/Markdown: 8 MB; CSV: 1,5 MB). Der Ordner wurde nicht übernommen. Bitte die zu große Datei aus der Auswahl herausnehmen oder einen kleineren Quellordner wählen; einzeln kann sie derzeit ebenfalls nicht verarbeitet werden.',
  SOURCE_FILE_EMPTY: 'Mindestens eine ausgewählte Datei ist leer. Es wurde nichts übernommen.',
  SOURCE_FORMAT_UNSUPPORTED: 'Mindestens eine ausgewählte Datei hat ein nicht unterstütztes Format. Es wurde nichts übernommen.',
  SOURCE_READ_FAILED: 'Die Datei- oder Ordnerauswahl ist nicht mehr verfügbar oder konnte nicht vollständig gelesen werden. Es wurde nichts übernommen. Bitte den lokalen Speicherort prüfen und erneut auswählen.',
  SOURCE_ACCESS_DENIED: 'Der Zugriff auf die Datei- oder Ordnerauswahl wurde vom Betriebssystem verweigert. Es wurde nichts übernommen. Bitte die Zugriffsrechte mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
  SOURCE_PATH_UNSAFE: 'Mindestens eine Auswahl ist keine reguläre lokale Datei oder liegt hinter einem Link. Es wurde nichts übernommen.',
  SOURCE_IDENTITY_CHANGED: 'Mindestens eine Quelldatei hat sich während der Auswahl verändert. Es wurde nichts übernommen.',
  SOURCE_SELECTION_REJECTED: 'Mehrere ausgewählte Dateien konnten nicht aufgenommen werden. Es wurde nichts übernommen; die übrigen Dateien wurden nicht gestartet.',
  SOURCE_ARTIFACT_IGNORED: 'Temporäre Office-Sperrdateien sind keine Dokumente. Bitte die eigentliche Word-, Excel- oder PowerPoint-Datei auswählen.',
  STANDALONE_SELECTION_PREPARED: 'Die vorbereitete Auswahl konnte nicht ergänzt werden. Bitte den Status prüfen; die bisherigen Dateien bleiben ausgewählt.',
  STANDALONE_DROP_MIXED: 'Bitte entweder Dateien oder genau einen Ordner hineinziehen. Ordner und einzelne Dateien können nicht gemeinsam ausgewählt werden.',
  STANDALONE_NO_ADMISSION: 'Bitte zuerst Dateien oder einen Ordner auswählen.',
  STANDALONE_START_FAILED: 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.',
  PROCESSING_MODE_INVALID: 'Bitte einen gültigen Verarbeitungsmodus auswählen. Der Stapel wurde nicht gestartet.',
  PROCESSING_MODE_FORBIDDEN: 'Dieser Verarbeitungsmodus ist hier nicht verfügbar. Der Stapel wurde nicht gestartet.',
  RESULT_NAMING_MODE_INVALID: 'Bitte eine gültige Benennung für anonymisierte Ergebnisse auswählen. Der Stapel wurde nicht gestartet.',
  MARKDOWN_CONVERSION_NOT_READY: 'Die installierte Version unterstützt diese Betriebsart nicht. Bitte die aktuelle Standalone-Version verwenden. Der Stapel wurde nicht gestartet; deine Dateiauswahl bleibt erhalten.',
  STANDALONE_NOTHING_TO_CONTINUE: 'Es gibt keinen fortsetzbaren Stapel.',
  BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE: 'Dieser ältere Stapel verwendet nicht mehr den aktuellen Datenschutz-Regelsatz. Bitte die Originaldateien neu auswählen.',
  BATCH_PSEUDONYM_CAPACITY_EXCEEDED: 'Die laufweite Grenze für Identitäten oder Schreibweisen wurde erreicht. Bereits geprüfte Ergebnisse bleiben erhalten. Bitte die hier genannten verbleibenden Originaldateien in einem kleineren neuen Lauf verarbeiten.',
  STANDALONE_RUNTIME_MISSING: 'Der lokale DataSecure-Core fehlt.',
  STANDALONE_RUNTIME_START_FAILED: 'Der lokale DataSecure-Core konnte nicht gestartet werden.',
  STANDALONE_RUNTIME_DENIED: 'Das Betriebssystem hat den Start der lokalen Verarbeitungskomponente verweigert. Das ist ein Systemfehler, kein Dokumentfehler. Bitte das vollständige Paket und die Zugriffs-/Freigaberegeln mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
  STANDALONE_RUNTIME_ARCHITECTURE_INVALID: 'Die lokale Verarbeitungskomponente konnte nicht als ausführbares Programm gestartet werden. Bitte das vollständige Paket für Windows bzw. Mac Intel oder Apple Silicon passend zum Gerät neu entpacken.',
  STANDALONE_CLOSING: 'DataSecure wird gerade geschlossen. Es wurde keine neue Aktion gestartet. Offene Läufe können nach einem Neustart im Verlauf fortgesetzt werden.',
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
  STANDALONE_ADMISSION_TIMEOUT: 'Die Aufnahme der Auswahl wurde nach fünf Minuten ohne Bestätigung beendet. Es wurde kein Stapel gestartet. Die vorbereitete Auswahl ist nicht mehr verfügbar; bitte Dateien oder Ordner erneut auswählen. Bei erneutem Fehler die lokalen Zugriffsrechte und „Diagnose öffnen“ prüfen.',
  STANDALONE_RESULT_ROOT_UNSAFE: 'Der Ergebnisordner darf nicht im privaten DataSecure-Bereich liegen.',
  STANDALONE_RESULT_OPEN_FAILED: 'Der Ergebnisordner konnte nicht geöffnet werden.',
  STANDALONE_RESULTS_MISSING: 'Es ist noch kein vollständiger Ergebnislauf verfügbar.',
  STANDALONE_LEDGER_MISSING: 'Es ist noch keine lokale Zuordnung vorhanden.',
  STANDALONE_LEDGER_OPEN_FAILED: 'Die lokale Zuordnungsdatei konnte nicht angezeigt werden.',
  STANDALONE_IDENTITY_MAPPING_MISSING: 'Das lesbare Identitätsdokument ist noch nicht verfügbar. Die geprüften Markdown-Ergebnisse bleiben gültig. Über „Identitäten (vertraulich)“ kann die Erstellung erneut versucht werden, sofern private Zuordnungen erhalten sind.',
  STANDALONE_IDENTITY_MAPPING_INVALID: 'Die vertrauliche Identitätszuordnung ist unvollständig oder konnte nicht sicher erstellt werden. Nicht alle Pseudonyme sind damit rückführbar. Die geprüften Markdown-Ergebnisse bleiben gültig; bitte Diagnose und lokalen Speicherzugriff prüfen.',
  STANDALONE_IDENTITY_PUBLICATION_FAILED: 'Die Identitätskopie im vertraulichen Ergebnis-Unterordner fehlt oder konnte nicht erstellt werden. Stattdessen wird die private lokale Zuordnung angeboten. Geprüfte Markdown-Ergebnisse bleiben gültig. Eine von dir gelöschte oder geänderte Kopie wird nicht automatisch wiederhergestellt.',
  STANDALONE_DIAGNOSTICS_OPEN_FAILED: 'Der lokale Diagnoseordner konnte nicht geöffnet werden.',
  STANDALONE_REVIEW_WINDOW_FAILED: 'Das lokale Prüffenster konnte nicht geöffnet werden. Der Lauf bleibt sicher offen.'
};
const reviewStartMessages = {
  LOCAL_REVIEW_START_MISSING: 'Eine benötigte lokale Laufzeit oder Prüfkomponente fehlt. Bitte das vollständige DataSecure-Paket neu entpacken; die vorgemerkten Dateien bleiben ungeprüft.',
  LOCAL_REVIEW_START_DENIED: 'Das Betriebssystem hat den Start der lokalen Prüfkomponente verweigert. Bitte Ausführungsrechte und Sicherheitsrichtlinien mit der IT prüfen; Schutzfunktionen nicht deaktivieren. Dies ist kein nachgewiesener Dokumentfehler.',
  LOCAL_REVIEW_START_ARCHITECTURE: 'Die lokale Prüfkomponente passt nicht zur Architektur oder zum ausführbaren Format dieses Geräts. Bitte das passende vollständige Paket für Windows bzw. Mac Intel oder Apple Silicon verwenden.',
  LOCAL_REVIEW_START_FAILED: 'Die lokale Prüfkomponente konnte nicht gestartet werden. Die vorgemerkten Dateien bleiben ungeprüft. Bitte den festen Fehlercode und die Diagnose für die Fehleranalyse verwenden.'
};
Object.assign(messages, reviewStartMessages);
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
let unlistenAdmissionProgress = null;
let pageClosed = false;
let lastProcessingMode = null;
let historyRequestGeneration = 0;
let historyDirty = true;
let historyStateKey = null;
let historyButtons = [];
let lastHistorySnapshot = null;
let historyRenderGeneration = 0;
const historyRows = new Map();
let currentResultsAvailable = false;
let currentSessionRunStarted = false;
let currentSessionResultBaseline = '';
let latestResultFolderSeen = '';
let selectionRemoveButtons = [];
let processPhase = 'entry';
let suppressPriorTerminal = false;
let admissionFailureCode = null;
let lastFailureDetailsKey = '';
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
    : 'Empfohlen: Neutrale Namen wie „Dokument-001-anonymisiert.md“ vermeiden personenbezogene Angaben im Dateinamen. Unterordnernamen bleiben unverändert und die Zuordnungsdatei enthält Originalnamen. Beides kann personenbezogene Angaben enthalten und gehört nicht ungeprüft in einen KI-Upload.';
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
  for (const id of ['process-results', 'process-completion-results']) {
    const button = byId(id);
    button.disabled = operationInFlight || !currentResultsAvailable;
    button.title = currentResultsAvailable ? '' : 'Noch kein Ergebnisordner verfügbar.';
  }
}
function updateModeAvailability() {
  // The selector describes the next admission, never an active/recoverable run.
  byId('processing-mode').disabled = operationInFlight || processPhase === 'completion' ||
    (!admitted && !admissionAvailableStates.has(lastPublicState));
  const needsMode = admitted && !validMode(byId('processing-mode').value);
  const needsNamingMode = admitted && byId('processing-mode').value === 'markdown-and-anonymize' &&
    !validOutputNamingMode(byId('output-naming-mode').value);
  byId('output-naming-mode').disabled = operationInFlight || byId('processing-mode').disabled ||
    byId('processing-mode').value !== 'markdown-and-anonymize';
  byId('start').disabled = operationInFlight || !admitted || needsMode || needsNamingMode;
  byId('start-help').hidden = !needsMode;
  const taskUnavailable = operationInFlight || processPhase === 'working' || (processPhase !== 'completion' &&
    !admitted && !admissionAvailableStates.has(lastPublicState));
  byId('task-markdown').disabled = taskUnavailable;
  byId('task-anonymize').disabled = taskUnavailable;
  const reason = taskUnavailable ? 'Während der aktuellen Verarbeitung ist keine neue Aufgabe verfügbar.' : '';
  byId('task-markdown').title = reason;
  byId('task-anonymize').title = reason;
}
function updateDropAvailability() {
  const available = !operationInFlight && processPhase === 'entry' &&
    (admitted || admissionAvailableStates.has(lastPublicState));
  byId('drop-zone').setAttribute('aria-disabled', String(!available));
  if (!available) byId('drop-zone').className = 'drop-zone';
  return available;
}
function visible(id, value) { byId(id).hidden = !value; }
function setProcessPhase(phase) {
  processPhase = phase;
  visible('process-form', phase !== 'completion');
  visible('process-completion', phase === 'completion');
  updateModeAvailability();
  updateDropAvailability();
}
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
function localError(error) {
  const raw = String(error || 'STANDALONE_OPERATION_FAILED');
  try {
    const parsed = JSON.parse(raw);
    if (['SOURCE_FOLDER_UNSUPPORTED_FILES', 'SOURCE_SELECTION_REJECTED', 'SOURCE_FORMAT_SIZE_LIMIT',
        'SOURCE_FILE_EMPTY', 'SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_READ_FAILED', 'SOURCE_ACCESS_DENIED',
        'SOURCE_PATH_UNSAFE', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_ARTIFACT_IGNORED'].includes(parsed?.code)) {
      return { code: parsed.code, details: parsed.details };
    }
  } catch { /* Ordinary errors are fixed codes, not JSON. */ }
  return { code: raw, details: null };
}
function safeLocalFileLabel(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024 &&
    !name.startsWith('/') && !/[:\\\u0000-\u001f\u007f]/u.test(name) &&
    !name.split('/').some(part => !part || part === '.' || part === '..');
}
function unsupportedSelectionMessage(code, details, fallback) {
  const base = messages[code] || fallback;
  if (!details) return base;
  if (Array.isArray(details.selection_files) && details.selection_files.length > 0 && details.selection_files.length <= 200 &&
      Number.isSafeInteger(details.selection_count) && details.selection_count >= details.selection_files.length && details.selection_count <= 4096) {
    const files = details.selection_files.filter(file => safeLocalFileLabel(file?.name));
    const missing = Math.max(0, details.selection_count - files.length);
    return `${base}\nNicht aufgenommen (${details.selection_count}):\n${files.map(file => {
      const explanation = failedFileExplanation(file.reason_code);
      return `• ${file.name}\n${explanation.reason}\nNächster Schritt: ${explanation.next}` +
        (/^[A-Z][A-Z0-9_]{2,63}$/u.test(file.reason_code || '') ? `\nFehlercode: ${file.reason_code}` : '');
    }).join('\n')}` + (missing ? `\n${missing} weitere Datei${missing === 1 ? '' : 'en'} ohne verfügbaren Dateinamen.` : '');
  }
  if (code !== 'SOURCE_FOLDER_UNSUPPORTED_FILES' || !Array.isArray(details.unsupported_files) || details.unsupported_files.length > 200 ||
      !Number.isSafeInteger(details.unsupported_count) || details.unsupported_count < details.unsupported_files.length || details.unsupported_count > 4096) return base;
  const files = details.unsupported_files.filter(safeLocalFileLabel);
  const missing = Math.max(0, details.unsupported_count - files.length);
  return `${base}\nNicht unterstützt (${details.unsupported_count}):${files.length ? `\n${files.map(name => `• ${name.replace(/[\r\n\t]/gu, ' ')}`).join('\n')}` : ''}` +
    (missing ? `\n${missing} weitere Datei${missing === 1 ? '' : 'en'} konnte${missing === 1 ? '' : 'n'} hier nicht einzeln angezeigt werden.` : '');
}
function renderFailedFiles(target, result) {
  target.replaceChildren();
  if (result?.ok !== true || result.local_ui_only !== true || result.external_disclosure !== false ||
      result.available !== true || !Array.isArray(result.files)) {
    target.textContent = 'Dateinamen für diesen Lauf sind lokal nicht mehr verfügbar. Die Anzahl bleibt im Verlauf erhalten.';
    return;
  }
  if (result.files.length === 0 && !result.pending_files?.length) {
    target.textContent = Number.isSafeInteger(result.total) && result.total > 0
      ? `${result.total} betroffene Datei${result.total === 1 ? '' : 'en'}; die Dateinamen sind lokal nicht verfügbar. Der Lauf wird dadurch nicht erneut gestartet.`
      : 'Für diesen Lauf wurden keine gestoppten Dateinamen gefunden.';
    return;
  }
  const list = document.createElement('ol');
  for (const file of result.files) {
    if (!safeLocalFileLabel(file?.name)) continue;
    const item = document.createElement('li');
    const explanation = failedFileExplanation(file.reason_code);
    // Never render source labels or untrusted error text as HTML. Only the
    // fixed local code is mapped to an explanation and an actionable next step.
    const stage = file.stage === 'mapping_pending'
      ? 'Die lokale Fehler-/Zuordnungsübersicht ist zusätzlich noch nicht geschrieben. Der Lauf ist nicht vollständig abgeschlossen.\n'
      : file.stage === 'retryable' ? 'Verarbeitung unterbrochen; dieser Eintrag kann nach Behebung fortgesetzt werden.\n' : '';
    item.textContent = `${file.name}\n${stage}${explanation.reason}\nNächster Schritt: ${explanation.next}` +
      (typeof file.reason_code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(file.reason_code)
        ? `\nFehlercode: ${file.reason_code}` : '');
    list.appendChild(item);
  }
  const missing = Math.max(0, Number(result.total || 0) - result.files.length);
  if (missing) {
    const item = document.createElement('li');
    item.textContent = `${missing} weitere Datei${missing === 1 ? '' : 'en'} ohne verfügbaren Dateinamen.`;
    list.appendChild(item);
  }
  target.appendChild(list);
  if (Array.isArray(result.pending_files) && result.pending_files.length > 0) {
    const title = document.createElement('p');
    title.textContent = `Noch nicht gestartete Dateien (${Number.isSafeInteger(result.pending_total) ? result.pending_total : result.pending_files.length}). Diese Dateien sind nicht als Dokumentfehler gewertet. Den Lauf nach Behebung im Verlauf fortsetzen.`;
    target.appendChild(title);
    const pendingList = document.createElement('ul');
    for (const file of result.pending_files.slice(0, 200)) {
      if (!safeLocalFileLabel(file?.name)) continue;
      const item = document.createElement('li'); item.textContent = file.name; pendingList.appendChild(item);
    }
    target.appendChild(pendingList);
  }
}
function failedFileExplanation(code) {
  if (code === 'CONVERSION_LIMIT_SETUP_FAILED') return {
    reason: 'Die lokale Verarbeitungskomponente konnte ihre Schutz- und Ressourcengrenzen nicht einrichten. Dies ist ein Systemfehler, kein nachgewiesener Größenfehler dieser Datei.',
    next: 'Das vollständige Paket verwenden und diesen Fehlercode mit der IT prüfen. Schutzfunktionen nicht deaktivieren; die Datei nicht nur wegen dieses Codes verkleinern.'
  };
  if (code === 'BATCH_PSEUDONYM_CAPACITY_EXCEEDED') return {
    reason: 'Die gemeinsame Pseudonymzuordnung dieses Laufs hat ihre begrenzte Kapazität erreicht. Es wurde kein ungeprüftes Ergebnis veröffentlicht.',
    next: 'Die verbleibenden Dateien in einem kleineren neuen Lauf verarbeiten. Unterschiedliche neue Läufe haben getrennte Zuordnungen.'
  };
  if (code === 'LOCAL_REVIEW_TOO_LARGE') return {
    reason: 'Diese Datei überschreitet die lokale Prüfgrenze von 5.000 Fundstellen oder die Textgrößengrenze.',
    next: 'Die Originaldatei in kleinere Dokumente aufteilen und erneut anonymisieren. Es wurde kein ungeprüftes Ergebnis veröffentlicht.'
  };
  if (code === 'SOURCE_ARTIFACT_IGNORED') return {
    reason: 'Diese Datei ist eine temporäre Office-Sperrdatei, nicht das eigentliche Word-, Excel- oder PowerPoint-Dokument.',
    next: 'Die eigentliche Originaldatei auswählen und die Sperrdatei aus der Auswahl entfernen. Die bisherige Auswahl bleibt unverändert.'
  };
  if (code === 'SOURCE_FILE_EMPTY') return {
    reason: 'Diese Quelldatei ist leer und wurde nicht aufgenommen.',
    next: 'Eine nicht leere Originaldatei auswählen; die leere Datei aus der Auswahl entfernen.'
  };
  if (['SOURCE_ACCESS_DENIED', 'CONVERSION_EXECUTABLE_DENIED', 'STANDALONE_RUNTIME_DENIED'].includes(code)) return {
    reason: code === 'SOURCE_ACCESS_DENIED' ? 'Das Betriebssystem hat den Zugriff auf diese Quelldatei verweigert.'
      : 'Das Betriebssystem hat den Start einer lokalen Verarbeitungskomponente verweigert. Dies ist ein Systemfehler, kein nachgewiesener Dokumentfehler.',
    next: 'Lokalen Zugriff und die Programm-/Ordnerfreigabe mit der IT prüfen. Der Fehlercode allein beweist keine Antivirus-Blockade; Schutzfunktionen nicht deaktivieren.'
  };
  if (code === 'CONVERSION_ARCHITECTURE_INVALID' || code === 'STANDALONE_RUNTIME_ARCHITECTURE_INVALID') return {
    reason: 'Eine lokale Verarbeitungskomponente ist nicht in einem auf diesem Gerät ausführbaren Format. Der Fehler liegt nicht nachweislich am Dokument.',
    next: 'Das vollständige Paket für die passende Plattform und Architektur neu entpacken; bei erneutem Fehler diesen Code an die IT weitergeben.'
  };
  if (code === 'SOURCE_PATH_UNSAFE') return {
    reason: 'Diese Auswahl ist keine reguläre lokale Datei oder liegt hinter einem Link/Reparse-Punkt.',
    next: 'Eine lokale Kopie der Originaldatei in einem regulären Quellordner auswählen.'
  };
  if (['AMBIGUITY_REVIEW_REQUIRED', 'PERSON_CANDIDATE', 'RESIDUAL_PII'].includes(code)) return {
    reason: 'Die Datenschutzprüfung konnte diese Datei nicht sicher freigeben. Es wurde kein ungeprüftes Ergebnis veröffentlicht.',
    next: 'Die Datei einzeln erneut anonymisieren. Falls sie erneut stoppt, „Diagnose öffnen“ und diesen Fehlercode für die Fehleranalyse angeben.'
  };
  if (['PARSER_COVERAGE_UNVERIFIED', 'DOCX_STRUCTURE_UNSUPPORTED', 'SOURCE_FORMAT_UNSUPPORTED',
    'DOCUMENT_FORMAT_UNSUPPORTED'].includes(code)) return {
    reason: 'Der Dokumentinhalt konnte nicht vollständig oder in einem unterstützten Format übernommen werden.',
    next: 'Die Originaldatei in der ursprünglichen Anwendung öffnen und als unterstütztes Format neu speichern; anschließend einzeln erneut auswählen.'
  };
  if (['SOURCE_ENCRYPTED_UNSUPPORTED', 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED'].includes(code)) return {
    reason: 'Diese Datei ist verschlüsselt oder passwortgeschützt und konnte nicht gelesen werden.',
    next: 'Mit berechtigtem Zugriff eine ungeschützte lokale Kopie aus der ursprünglichen Anwendung speichern und diese erneut auswählen.'
  };
  if (/^(?:SOURCE|PDF|IMAGE|OOXML|DOCX|XLSX|PPTX|CONVERSION|TEXT|INPUT).*(?:SIZE|LIMIT|TOO_LARGE)/u.test(code || '')) return {
    reason: 'Die Datei oder ihre extrahierten Inhalte überschreiten eine unterstützte Verarbeitungsgrenze.',
    next: 'Die Datei verkleinern oder in kleinere Dokumente aufteilen und einzeln erneut auswählen.'
  };
  if (['CONVERSION_RUNTIME_UNAVAILABLE', 'CONVERSION_ISOLATION_UNAVAILABLE', 'CONVERSION_START_FAILED',
    'CONVERSION_EXECUTABLE_MISSING', 'CONVERSION_DEPENDENCY_MISSING',
    'CONVERSION_MODEL_INVALID', 'PARSER_ISOLATION_FAILED'].includes(code)) return {
    reason: 'Die lokale Verarbeitungskomponente konnte nicht bereitgestellt werden. Der Fehler muss nicht am Dokument liegen.',
    next: 'Das vollständige Standalone-Paket neu entpacken und die App daraus starten. Bei erneutem Fehler „Diagnose öffnen“; nicht nur die EXE kopieren.'
  };
  if (['SOURCE_READ_FAILED', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_SNAPSHOT_CHANGED', 'BATCH_SNAPSHOT_CHANGED'].includes(code)) return {
    reason: 'Die Quelldatei war nicht zugreifbar oder hat sich seit ihrer Auswahl verändert.',
    next: 'Die Datei lokal speichern, in anderen Anwendungen schließen und vor einem neuen Lauf erneut auswählen.'
  };
  if (['PROCESSING_INTERRUPTED', 'RECOVERY_FAILED', 'WORKER_EXITED', 'CONVERSION_WORKER_FAILED',
    'STANDALONE_IPC_FAILED', 'STANDALONE_IPC_TIMEOUT'].includes(code)) return {
    reason: 'Die lokale Verarbeitung wurde unterbrochen oder der lokale Verarbeitungsprozess antwortete nicht.',
    next: 'Im Verlauf prüfen, ob „Fortsetzen“ verfügbar ist. Andernfalls „Diagnose öffnen“ und die Datei einzeln erneut verarbeiten.'
  };
  if (/^(?:RESULT|LOCAL_MAPPING|EXPORT|OUTPUT).*(?:FAILED|PENDING|UNSAFE|MISSING)/u.test(code || '')) return {
    reason: 'Das Ergebnis oder seine lokale Zuordnung konnte nicht vollständig bereitgestellt werden.',
    next: 'Den Ergebnisordner und seine Zugriffsrechte prüfen. Den Lauf im Verlauf fortsetzen, falls die Aktion angeboten wird.'
  };
  return {
    reason: 'Die lokale Verarbeitung dieser Datei wurde gestoppt; es wurde kein ungeprüftes Ergebnis veröffentlicht.',
    next: '„Diagnose öffnen“ und den angezeigten Fehlercode für die Fehleranalyse angeben. Die Originaldatei bleibt unverändert.'
  };
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
  ++historyRenderGeneration;
  const body = byId('history-body');
  historyButtons = [];
  const liveRows = new Set();
  const states = { ready: 'Bereit', preparing: 'Vorbereitung', processing: 'Läuft',
    review_required: 'Prüfung nötig', stopped: 'Unterbrochen', export_pending: 'Bereitstellung offen',
    results_available: 'Abgeschlossen', completed_without_results: 'Ohne Ergebnisse', blocked: 'Nicht bereit',
    completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', interrupted: 'Unterbrochen' };
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  for (const entry of entries.slice(0, 20)) {
    if (!entry || typeof entry.batch_id !== 'string' || !entry.batch_id) continue;
    liveRows.add(entry.batch_id);
    const signature = JSON.stringify(entry);
    const { selected_count, result_count, ...stable } = entry;
    const stableSignature = JSON.stringify(stable);
    const previous = historyRows.get(entry.batch_id);
    if (previous?.signature === signature) {
      historyButtons.push(...previous.buttons);
      continue;
    }
    if (previous?.stableSignature === stableSignature) {
      previous.signature = signature;
      previous.row.children[2].textContent = `${count(entry.selected_count)} ausgewählt · ${count(entry.result_count)} Ergebnisse · ${count(entry.failed_count)} fehlgeschlagen`;
      historyButtons.push(...previous.buttons);
      continue;
    }
    if (previous) previous.live = false;
    const record = { signature, stableSignature, live: true, buttons: [] };
    historyRows.set(entry.batch_id, record);
    const row = document.createElement('tr');
    record.row = row;
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
      { command: 'open_history_identity_mapping', label: 'Identitäten (vertraulich)',
        available: entry.identity_mapping_available === true, reason: 'Keine vertrauliche Identitätszuordnung verfügbar.' },
      { command: 'continue_history_batch', label: entry.status === 'review_required' ? 'Prüfung fortsetzen' : 'Fortsetzen',
        available: entry.resumable === true, reason: 'Keine Fortsetzung verfügbar.', resume: true, review: entry.status === 'review_required' }
    ]) {
      const wrapper = document.createElement('div');
      const button = document.createElement('button');
      button.textContent = action.label;
      button.setAttribute('aria-label', `${action.label} · ${runLabel}`);
      button.addEventListener('click', async () => {
        if (button.disabled || pageClosed || !record.live) return;
        feedback.hidden = false;
        feedback.textContent = `${action.label} wird angefordert …`;
        if (action.resume) {
          const result = await call(action.command, { batchId: entry.batch_id });
          if (pageClosed || !record.live) return;
          feedback.textContent = result?.ok === true ? 'Fortsetzung gestartet. Der Laufstatus wird geprüft …' : 'Fortsetzung nicht möglich. Bitte den aktuellen Status prüfen.';
          if (result?.ok === true) {
            actionFeedback('Der Worker hat die Fortsetzung angenommen. Erst der aktualisierte Laufstatus bestätigt das Ergebnis.');
            if (action.review) await call('open_review_window');
            await refresh();
          }
        } else {
          const result = await openLocal(action.command, action.label, { batchId: entry.batch_id }, () => !pageClosed && record.live);
          if (pageClosed || !record.live) return;
          feedback.textContent = result?.handoff_confirmed === true
            ? `${action.label}: Öffnen an das Betriebssystem übergeben.`
            : `${action.label} konnte nicht geöffnet werden. Bitte den Verlauf aktualisieren.`;
        }
      });
      wrapper.appendChild(button);
      if (action.command === 'open_history_identity_mapping' && action.available) {
        const notice = document.createElement('span');
        notice.className = 'action-reason';
        notice.textContent = 'Enthält Originalwerte im markierten vertraulichen Lauf-Unterordner. Nie den ganzen Laufordner an KI weitergeben.';
        wrapper.appendChild(notice);
      }
      if (action.command === 'open_history_identity_mapping' && messages[entry.identity_mapping_warning]) {
        const notice = document.createElement('span');
        notice.className = 'action-reason';
        notice.textContent = messages[entry.identity_mapping_warning];
        wrapper.appendChild(notice);
      }
      if (!action.available) {
        const reason = document.createElement('span');
        reason.className = 'action-reason';
        reason.textContent = action.reason;
        wrapper.appendChild(reason);
      }
      actions.appendChild(wrapper);
      record.buttons.push({ ...action, button });
    }
    if (count(entry.failed_count) > 0 || count(entry.problem_count) > 0) {
      const wrapper = document.createElement('div');
      const button = document.createElement('button');
      const fileDetails = document.createElement('div');
      button.textContent = 'Gestoppte Dateien anzeigen';
      button.setAttribute('aria-label', `Gestoppte Dateien anzeigen · ${runLabel}`);
      fileDetails.className = 'history-failure-details';
      fileDetails.hidden = true;
      button.addEventListener('click', async () => {
        if (button.disabled || pageClosed || !record.live) return;
        button.disabled = true;
        feedback.hidden = false;
        feedback.textContent = 'Dateinamen werden nur lokal gelesen …';
        try {
          const result = await invoke('get_run_failures', { batchId: entry.batch_id });
          if (pageClosed || !record.live) return;
          renderFailedFiles(fileDetails, result);
          fileDetails.hidden = false;
          feedback.textContent = 'Nicht verarbeitete Dateien dieses Laufs:';
        } catch {
          if (pageClosed || !record.live) return;
          feedback.textContent = 'Die Dateidetails konnten nicht geladen werden. „Gestoppte Dateien anzeigen“ erneut wählen; bei wiederholtem Fehler „Diagnose öffnen“. Der Lauf wird dadurch nicht erneut gestartet.';
        } finally { button.disabled = false; }
      });
      wrapper.appendChild(button);
      wrapper.appendChild(fileDetails);
      actions.appendChild(wrapper);
      record.buttons.push({ button, available: true });
    }
    actions.appendChild(feedback);
    historyButtons.push(...record.buttons);
  }
  // Keep unchanged nodes in place: refreshing another run must not discard
  // keyboard focus, opened details or its local action feedback.
  for (const [id, record] of historyRows) {
    if (!liveRows.has(id)) { record.live = false; historyRows.delete(id); }
  }
  const ordered = entries.slice(0, 20).map(entry => historyRows.get(entry?.batch_id)?.row).filter(Boolean);
  for (const child of Array.from(body.children)) if (!ordered.includes(child)) body.removeChild(child);
  ordered.forEach((row, index) => { if (body.children[index] !== row) body.insertBefore(row, body.children[index] || null); });
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
function renderResultFolderConfiguration(folder, isDefault) {
  const location = folder || 'Noch nicht festgelegt';
  const label = isDefault ? `Vorgeschlagen: ${location}` : location;
  for (const id of ['result-folder', 'settings-result-folder']) {
    byId(id).textContent = label;
    byId(id).title = location;
  }
  byId('suggested-result-folder').textContent = location;
  byId('result-folder-setup').hidden = !isDefault;
}
function renderUiContext(context) {
  if (!context || context.local_ui_only !== true || context.external_disclosure !== false) return;
  renderResultFolderConfiguration(context.result_folder, context.result_folder_is_default === true);
  const latestResultFolder = context.latest_result_folder || 'Noch kein abgeschlossener Lauf';
  latestResultFolderSeen = context.latest_result_folder || '';
  const sourceFolders = summarize(context.source_folders, 'Noch nicht ausgewählt');
  const selectedFiles = summarize(context.selected_files, 'Noch nicht ausgewählt');
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
  admissionFailureCode = null;
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
  byId('select-files').textContent = 'Dateien auswählen';
  byId('select-folder').textContent = 'Ordner mit Unterordnern auswählen';
  byId('select-folder').title = 'Alle unterstützten Dateien aus diesem Ordner und seinen Unterordnern auswählen';
  visible('start', false);
  visible('cancel', false);
  updateModeAvailability();
  updateDropAvailability();
}

function renderAdmission(result) {
  admissionFailureCode = null;
  admissionGeneration += 1;
  admitted = true;
  setProcessPhase('entry');
  renderUiContext(result.ui_context);
  byId('home-selection').hidden = false;
  const size = Number.isSafeInteger(result.total_bytes) ? ` · ${Math.ceil(result.total_bytes / 1024)} KB` : '';
  const recursive = result.ui_context?.source_kind === 'folder' ? ' · einschließlich Unterordnern' : '';
  const ignored = Number.isSafeInteger(result.ignored_artifact_count) && result.ignored_artifact_count > 0
    ? ` · ${result.ignored_artifact_count} bekannte Begleitdatei${result.ignored_artifact_count === 1 ? '' : 'en'} übersprungen`
    : '';
  byId('summary').textContent = `${result.selected_count} Datei${result.selected_count === 1 ? '' : 'en'}${size}${recursive}${ignored} · vollständig lokal`;
  byId('summary').hidden = false;
  status('Auswahl bereit', 'Du kannst weitere Dateien oder Ordner hinzufügen. Erst „Starten“ verarbeitet den Stapel.');
  visible('select-files', true); visible('select-folder', true); visible('start', true); visible('cancel', true);
  byId('select-files').textContent = 'Dateien hinzufügen';
  byId('select-folder').textContent = 'Ordner mit Unterordnern hinzufügen';
  byId('select-folder').title = 'Alle unterstützten Dateien aus einem weiteren Ordner und seinen Unterordnern hinzufügen';
  visible('continue', false);
  byId('action-feedback').hidden = true;
  if (result.already_selected_count > 0) actionFeedback(
    `${result.already_selected_count} bereits ausgewählte Datei${result.already_selected_count === 1 ? '' : 'en'} nicht doppelt hinzugefügt.`);
  if (Array.isArray(result.ignored_artifacts) && result.ignored_artifacts.length) actionFeedback(
    `Nicht als Dokument verarbeitet (bekannte Begleitdateien): ${result.ignored_artifacts.slice(0, 200).map(item => item.name).join(', ')}${result.ignored_artifact_count > result.ignored_artifacts.length ? ' · Weitere Begleitdateien wurden übersprungen.' : ''}`);
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
    if (processPhase === 'completion') {
      currentSessionRunStarted = false;
      currentResultsAvailable = false;
      suppressPriorTerminal = true;
      byId('processing-mode').value = '';
      byId('output-naming-mode').value = 'neutral';
      renderModeHelp('');
    }
    renderAdmission(payload.result);
    applyBusyState();
    if (activeView === 'process') byId(validMode(byId('processing-mode').value) ? 'start' : 'processing-mode').focus();
  } else if (payload.phase === 'failed' || payload.phase === 'rejected') {
    if (payload.phase === 'failed' && nativeDropInFlight) {
      nativeDropInFlight = false;
      applyBusyState();
    }
    invalidateTransportAdmission(payload.error_code);
    actionFeedback(unsupportedSelectionMessage(payload.error_code, payload.error_details,
      'Die hineingezogene Auswahl konnte nicht übernommen werden.'), true);
  }
}

function invalidateTransportAdmission(code) {
  if (!['STANDALONE_ADMISSION_TIMEOUT', 'STANDALONE_IPC_TIMEOUT', 'STANDALONE_IPC_FAILED'].includes(code)) return;
  lastPublicState = null;
  resetAdmissionUi();
}

function handleAdmissionProgress(event) {
  const payload = event?.payload;
  if (pageClosed || !operationInFlight || payload?.phase !== 'validating' ||
      !Number.isSafeInteger(payload.elapsed_ms) || payload.elapsed_ms < 0 || payload.elapsed_ms > 300000) return;
  const elapsed = Math.floor(payload.elapsed_ms / 1000);
  actionFeedback(`Die Auswahl wird lokal geprüft …${elapsed ? ` (${elapsed} Sekunden)` : ''} Bitte warten. Die Verarbeitung beginnt erst mit „Starten“.`);
}

async function choose(command) {
  if (operationInFlight || processPhase === 'completion') return;
  busy(true);
  try {
    const result = await invoke(command);
    if (result.cancelled) return;
    renderAdmission(result);
  } catch (error) {
    const { code, details } = localError(error);
    invalidateTransportAdmission(code);
    actionFeedback(unsupportedSelectionMessage(code, details, admitted
      ? 'Weitere Dateien konnten nicht hinzugefügt werden. Die bisherige Auswahl bleibt erhalten.'
      : 'Der gewählte Ordner konnte nicht vollständig und sicher übernommen werden. Es wurde kein Stapel gestartet.'), true);
    if (!admitted) {
      admissionFailureCode = code;
      showError(code);
    }
  }
  finally { busy(false); }
}

async function call(command, args) {
  if (operationInFlight) return null;
  busy(true);
  try { return await invoke(command, args); }
  catch (error) {
    const code = String(error || 'STANDALONE_OPERATION_FAILED');
    if (code === 'STANDALONE_NO_ADMISSION' || code === 'STANDALONE_START_FAILED' || code === 'STANDALONE_IPC_FAILED' || code === 'STANDALONE_IPC_TIMEOUT' || code === 'STANDALONE_ADMISSION_TIMEOUT') {
      lastPublicState = null;
      resetAdmissionUi();
      // A restored admission has no running poll yet. An unconfirmed start can
      // still be processing in the backend, so recover via status, never retry.
      scheduleRefresh(1200);
    }
    showError(code);
    if (Object.hasOwn(reviewStartMessages, code) &&
        ['continue_current_batch', 'continue_history_batch'].includes(command)) {
      // Only these proven review-start failures have bound the broker to the
      // selected run. Its private window can name the affected sources without
      // exposing review data to the content-free main renderer.
      try { await invoke('open_review_window'); }
      catch { actionFeedback('Die Fehlermeldung bleibt bestehen. Das lokale Prüffenster mit den vorgemerkten Dateinamen konnte zusätzlich nicht geöffnet werden.', true); }
    }
    return null;
  }
  finally { busy(false); }
}

async function openLocal(command, label, args, isCurrent = () => !pageClosed) {
  if (operationInFlight) return null;
  actionFeedback(`${label} wird an das Betriebssystem übergeben …`);
  busy(true);
  try {
    const result = await invoke(command, args);
    if (!isCurrent()) return null;
    if (result?.handoff_confirmed !== true) throw 'STANDALONE_OPERATION_FAILED';
    actionFeedback(messages[result.identity_mapping_warning] || `${label} wurde an das Betriebssystem zum Öffnen übergeben.`, Boolean(result.identity_mapping_warning));
    return result;
  } catch (error) {
    if (!isCurrent()) return null;
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
  byId(id).addEventListener('click', async () => {
    if (byId(id).disabled) return;
    if (processPhase === 'completion' && !await prepareNewRun()) return;
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
byId('process-completion-results').addEventListener('click', () => {
  if (!byId('process-completion-results').disabled) openLocal('open_current_results', 'Ergebnisordner');
});
byId('process-completion-review').addEventListener('click', async () => {
  if (operationInFlight || processPhase !== 'completion' || lastPublicState !== 'review_required' ||
      !currentSessionRunStarted || suppressPriorTerminal) return;
  actionFeedback('Die Prüfung für diesen Lauf wird vorbereitet …');
  const continued = await call('continue_current_batch');
  if (continued?.ok !== true) return;
  // Once acknowledged, never start this continuation twice while waiting for
  // the next status poll. The review window can show its preparation state.
  lastPublicState = 'processing';
  visible('process-completion-review', false);
  setProcessPhase('working');
  status('Prüfung wird vorbereitet', 'DataSecure bereitet die offenen Fundstellen dieses Laufs vor. Das Prüffenster wird geöffnet.', '!');
  const opened = await call('open_review_window');
  if (opened?.ok === true) actionFeedback('Die lokale Prüfung für diesen Lauf ist geöffnet.');
  await refresh();
});
byId('process-completion-history').addEventListener('click', () => switchView('results'));
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
  lastFailureDetailsKey = '';
  byId('process-failure-details').hidden = true;
  byId('process-failure-list').replaceChildren();
  currentSessionResultBaseline = latestResultFolderSeen;
  currentSessionRunStarted = true;
  suppressPriorTerminal = false;
  setProcessPhase('working');
  lastProcessingMode = processingMode;
  admitted = false; admissionGeneration += 1; byId('summary').hidden = true;
  byId('selection-list').hidden = true;
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
byId('review-open').addEventListener('click', () => call('open_review_window'));
async function prepareNewRun() {
  if (operationInFlight || processPhase === 'working' || ['preparing', 'processing'].includes(lastPublicState)) {
    newBatchFeedback('Der aktuelle Lauf ist noch aktiv. Falls eine lokale Prüfung geöffnet wurde, schließe sie ab oder vertage sie dort. Danach kannst du eine neue Aufgabe wählen.', true);
    return false;
  }
  if (!await call('cancel_admission')) {
    newBatchFeedback('Die neue Aufgabe konnte nicht vorbereitet werden. Bitte die Diagnose prüfen.', true);
    return false;
  }
  newBatchFeedback('');
  currentSessionRunStarted = false;
  currentResultsAvailable = false;
  suppressPriorTerminal = true;
  lastFailureDetailsKey = '';
  byId('process-failure-details').hidden = true;
  byId('process-failure-list').replaceChildren();
  resetAdmissionUi();
  setProcessPhase('entry');
  byId('processing-mode').value = '';
  byId('output-naming-mode').value = 'neutral';
  renderModeHelp('');
  byId('action-feedback').hidden = true;
  byId('source-folders').textContent = 'Noch nicht ausgewählt';
  byId('selected-files').textContent = 'Noch nicht ausgewählt';
  status('Bereit für einen neuen Lauf', 'Wähle eine Aufgabe und danach Dateien. Der vorherige Lauf bleibt im Verlauf.');
  await refreshUiContext();
  updateModeAvailability();
  updateDropAvailability();
  updateCurrentResultsAvailability();
  return true;
}
function newBatchFeedback(message, error = false) {
  const feedback = byId('new-batch-feedback');
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.className = error ? 'nav-feedback error' : 'nav-feedback';
}
byId('prepare-new-run').addEventListener('click', async () => {
  if (await prepareNewRun()) byId('processing-mode').focus();
});
byId('new-batch').addEventListener('click', async () => {
  if (!await prepareNewRun()) return;
  switchView('home');
  byId('tab-home').focus();
});
byId('diagnostics').addEventListener('click', async () => {
  try {
    await invoke('open_diagnostic_folder');
    actionFeedback('Der Diagnoseordner wurde an das Betriebssystem zum Öffnen übergeben. Die Protokolle enthalten keine Dateinamen, Pfade oder Inhalte.');
  } catch (error) { actionFeedback(messages[String(error)] || 'Der Diagnoseordner konnte nicht geöffnet werden.', true); }
});
byId('identity-mappings-directory').addEventListener('click', async () => {
  try {
    await invoke('open_identity_mappings_directory');
    actionFeedback('Der vertrauliche Zuordnungsordner wurde an das Betriebssystem zum Öffnen übergeben. Nicht an KI-Systeme weitergeben.');
  } catch (error) {
    actionFeedback(messages[String(error)] || 'Der vertrauliche Zuordnungsordner konnte nicht geöffnet werden.', true);
  }
});
async function configureResultFolder() {
  const result = await call('configure_results');
  if (result && !result.cancelled) {
    if (result.local_ui_only === true && result.external_disclosure === false) {
      renderResultFolderConfiguration(result.result_folder, false);
    }
    actionFeedback(result.network_folder_notice === true
      ? 'Der Ordner ist gespeichert. Hinweis: Ergebnisse und Zuordnungsdateien können über dieses Netzlaufwerk an andere Systeme übertragen werden.'
      : result.export_replay_pending === true
        ? 'Der neue Ordner ist gespeichert. Ausstehende Ergebnisse werden beim nächsten sicheren Wiederholungsversuch bereitgestellt.'
        : 'Künftige Ergebnisse werden dort in einem eigenen Laufordner abgelegt.');
  }
}
byId('configure-results').addEventListener('click', configureResultFolder);
byId('setup-results').addEventListener('click', configureResultFolder);

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
    if (currentSessionRunStarted && !suppressPriorTerminal &&
        ['results_available', 'completed_without_results', 'review_required', 'stopped', 'export_pending'].includes(state.state)) {
      setProcessPhase('completion');
      byId('process-completion-title').textContent = state.state === 'review_required'
        ? 'Prüfung für diesen Lauf offen' : state.state === 'stopped'
          ? 'Fortsetzung für diesen Lauf möglich' : state.state === 'export_pending'
            ? 'Bereitstellung dieses Laufs offen' : 'Dieser Lauf ist beendet';
      byId('process-completion-help').textContent = state.state === 'review_required'
        ? 'Dieser Lauf benötigt noch eine lokale Entscheidung. Mit „Jetzt prüfen“ öffnest du die Prüfung direkt. Du kannst sie auch später im Verlauf fortsetzen.'
        : state.state === 'stopped'
          ? 'Dieser Lauf kann im Verlauf fortgesetzt werden; ein neuer Lauf bleibt davon getrennt.'
        : state.state === 'export_pending'
          ? 'Die Bereitstellung dieses Laufs ist noch offen. Prüfe ihn im Verlauf, bevor du seine Ergebnisse verwendest.'
          : 'Der Lauf ist abgeschlossen. Ergebnisse und Fehlerhinweise bleiben im Verlauf; für weitere Dateien beginne einen neuen Lauf.';
      visible('process-completion-review', state.state === 'review_required');
      byId('process-completion-history').textContent = 'Lauf im Verlauf ansehen';
      byId('process-completion-history').className = '';
      byId('prepare-new-run').className = state.state === 'review_required' ? '' : 'primary';
    }
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
      const details = failed ? 'Die betroffenen Dateien stehen im Abschluss unten oder im Verlauf.' : '';
      byId('result-warning').hidden = !converting;
      byId('result-warning').textContent = converting
        ? `Nicht anonymisiert: Die Dateien enthalten Originalinhalte.${warnings ? ` ${warnings} Datei(en) mit Extraktionshinweisen.` : ''}${failed ? ` ${failed} Datei(en) konnten nicht umgewandelt werden.` : ''}${details ? ` ${details}` : ''}`
        : '';
    }
    updateModeAvailability();
    updateDropAvailability();
    byId('result-count').textContent = String(Number.isInteger(state.result_count) ? state.result_count : 0);
    visible('continue', state.state === 'review_required' || state.state === 'stopped');
    visible('review-open', state.state === 'processing' && state.review_count > 0);
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
      const reviews = Number.isInteger(state.review_count) ? state.review_count : 0;
      const failed = Number.isInteger(state.failed_count) ? state.failed_count : 0;
      const awaitingReview = reviews > 0 && total > 0 && done + failed + reviews >= total;
      status(awaitingReview ? 'Lokale Prüfung erforderlich' : converting ? 'Umwandlung läuft' : 'Anonymisierung läuft',
        awaitingReview
          ? `${done} von ${total} Dateien abgeschlossen. ${reviews} Datei${reviews === 1 ? '' : 'en'} benötigt eine lokale Entscheidung. Öffne die lokale Prüfung oder vertage sie; ungeprüfte Ergebnisse bleiben gesperrt.`
          : total > 0 ? `${done} von ${total} Dateien abgeschlossen.` : 'Die Dateien werden lokal verarbeitet.',
        awaitingReview ? '!' : '✓');
      nextDelay = 1200;
    }
    else if (state.state === 'review_required') { status('Prüfung erforderlich', `${state.review_count} Datei${state.review_count === 1 ? '' : 'en'} benötigt eine lokale Entscheidung.`, '!'); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'stopped') { status('Fortsetzung möglich', `${state.resumable_count} unterbrochene${state.resumable_count === 1 ? 'r Stapel kann' : ' Stapel können'} fortgesetzt werden.`, '!'); acknowledgeRenderedTerminalState(state.presentation_generation); }
    else if (state.state === 'export_pending') {
      if (state.completion_pending === true) {
        status('Abschlussübersicht wird bereitgestellt',
          'Die Verarbeitung ist abgeschlossen, aber die lokale Zuordnungsdatei oder der Abschlussnachweis konnte noch nicht vollständig gespeichert werden. Bitte den Ergebnisordner prüfen und erneut auswählen.', '!');
      } else {
        status('Ergebnis wird bereitgestellt', `${state.export_pending_count} Ergebnis${state.export_pending_count === 1 ? ' wird' : 'se werden'} nach einer erneuten Ordnerprüfung bereitgestellt.`, '!');
      }
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'results_available') {
      const failed = Number.isSafeInteger(state.failed_count) ? state.failed_count : 0;
      const completed = converting ? `${state.result_count} Markdown-Datei${state.result_count === 1 ? ' wurde' : 'en wurden'} erstellt. Nicht anonymisiert.`
        : `${state.result_count} anonymisierte${state.result_count === 1 ? 's Ergebnis ist' : ' Ergebnisse sind'} verfügbar.`;
      status(failed > 0 ? 'Abgeschlossen mit Hinweisen' : 'Fertig',
        `${completed}${failed > 0 ? ` ${failed} Datei${failed === 1 ? ' wurde' : 'en wurden'} sicher gestoppt. Betroffene Dateien stehen unten und im Verlauf.` : ''}`,
        failed > 0 ? '!' : '✓');
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'completed_without_results') {
      const details = converting
        ? 'Für reine Konvertierung wird keine Zuordnungsdatei erstellt. Mit „Diagnose öffnen“ findest du Details zum Fehler.'
        : state.ledger_available === true
          ? 'Details stehen in der lokalen Zuordnung.'
          : 'Eine Zuordnungsdatei ist für diesen Lauf nicht verfügbar. Bitte die Diagnose öffnen.';
      status('Keine Ergebnisse erstellt', `${state.failed_count} Datei${state.failed_count === 1 ? ' wurde' : 'en wurden'} sicher gestoppt. Es ist kein${converting ? ' Markdown-' : ' anonymisiertes '}Ergebnis verfügbar. Betroffene Dateien stehen unten und im Verlauf. ${details}`, '!');
      acknowledgeRenderedTerminalState(state.presentation_generation);
    }
    else if (state.state === 'blocked') { acknowledgedPresentationGeneration = null; status('Nicht bereit', 'Der lokale DataSecure-Core konnte nicht gestartet werden.'); }
    else {
      acknowledgedPresentationGeneration = null;
      status('Bereit', 'Wähle Dateien oder einen ganzen Ordner aus.');
    }
    const showFailedFiles = currentSessionRunStarted && !suppressPriorTerminal &&
      ((['results_available', 'completed_without_results'].includes(state.state) &&
        Number.isSafeInteger(state.failed_count) && state.failed_count > 0) || state.state === 'stopped');
    byId('process-failure-details').hidden = !showFailedFiles;
    if (showFailedFiles) {
      byId('process-failure-summary').textContent = state.state === 'stopped'
        ? 'Dateien mit unterbrochenen Verarbeitungsschritten' : `Nicht verarbeitete Dateien (${state.failed_count})`;
      byId('process-failure-details').open = true;
      const detailsKey = `${state.state}:${state.presentation_generation ?? ''}:${state.failed_count}:${generation}`;
      if (detailsKey !== lastFailureDetailsKey) {
        lastFailureDetailsKey = detailsKey;
        byId('process-failure-list').textContent = 'Dateinamen werden nur lokal gelesen …';
        try {
          // Tauri requires the optional camelCase argument to be present;
          // omitting it rejects the command before it reaches the sidecar.
          const result = await invoke('get_run_failures', { batchId: null });
          if (!pageClosed && !operationInFlight && generation === admissionGeneration) {
            renderFailedFiles(byId('process-failure-list'), result);
          }
        } catch {
          if (!pageClosed && generation === admissionGeneration) {
            const target = byId('process-failure-list');
            target.replaceChildren();
            const help = document.createElement('p');
            help.textContent = 'Die Dateidetails konnten nicht geladen werden. Lade nur die Dateiliste erneut; der Lauf wird dadurch nicht erneut gestartet. Bei wiederholtem Fehler „Diagnose öffnen“.';
            const retry = document.createElement('button');
            retry.textContent = 'Dateiliste erneut laden';
            retry.addEventListener('click', async () => {
              if (pageClosed || operationInFlight || generation !== admissionGeneration) return;
              retry.disabled = true;
              lastFailureDetailsKey = '';
              await refresh();
              retry.disabled = false;
            });
            target.appendChild(help);
            target.appendChild(retry);
          }
        }
        if (admitted || operationInFlight || pageClosed || generation !== admissionGeneration) return;
      }
    }
    if (state.termination_unconfirmed === true) {
      status('Verarbeitung unterbrochen', 'Das Ende des Konvertierungsprozesses konnte nicht bestätigt werden. Übrige Dateien wurden nicht gestartet. Bitte die Diagnose prüfen.');
      byId('status-icon').textContent = '!';
    }
    if (suppressPriorTerminal && !currentSessionRunStarted &&
        ['results_available', 'completed_without_results', 'review_required', 'stopped', 'export_pending'].includes(state.state)) {
      status('Bereit für einen neuen Lauf', 'Wähle eine Aufgabe und danach Dateien. Der vorherige Lauf bleibt im Verlauf.');
    }
    if (admissionFailureCode && processPhase === 'entry' && !admitted) showError(admissionFailureCode);
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
    try {
      const unlisten = await window.__TAURI__.event.listen('datasecure-admission-progress', handleAdmissionProgress);
      if (pageClosed) { unlisten(); return; }
      unlistenAdmissionProgress = unlisten;
    } catch {
      // A missing progress listener must not disable the actual picker/admission path.
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
  if (unlistenAdmissionProgress) { unlistenAdmissionProgress(); unlistenAdmissionProgress = null; }
});
