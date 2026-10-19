'use strict';

// Rendering owns no file paths or privacy decisions. Sources belong to the
// sidecar; starts carry only its opaque IDs and catalogue revision (DS-110).
(() => {
  const $ = id => document.getElementById(id);
  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  const states = { ready: 'Bereit', preparing: 'Wird vorbereitet', processing: 'Wird verarbeitet',
    review_required: 'Prüfung erforderlich', stopped: 'Fortsetzung möglich', paused: 'Pausiert',
    results_available: 'Verarbeitung abgeschlossen', completed_without_results: 'Keine Ergebnisse erstellt',
    export_pending: 'Bereitstellung offen', export_abandoned: 'Bereitstellung aufgegeben',
    failed: 'Verarbeitung unterbrochen', blocked: 'Nicht bereit' };
  const reasons = {
    PROCESS_IDENTITY_UNAVAILABLE: 'Der lokale Verarbeitungsprozess konnte nicht eindeutig zugeordnet werden. Der nächste Verarbeitungsschritt wurde vorsichtshalber nicht gestartet. Bitte die Diagnose sichern und den Laufstatus prüfen.',
    PROCESS_IDENTITY_ACCESS_DENIED: 'Das Betriebssystem verweigert die Abfrage zur sicheren Prozesszuordnung. Bitte die Diagnose sichern und mit der IT prüfen; keine Schutzfunktion abschalten.',
    PROCESS_IDENTITY_TOOL_MISSING: 'Das Hilfsprogramm zur sicheren Prozesszuordnung fehlt oder ist nicht erreichbar. Bitte die Diagnose sichern und das vollständige Paket sowie die Systemkonfiguration prüfen.',
    PROCESS_IDENTITY_TIMEOUT: 'Die Abfrage zur sicheren Prozesszuordnung hat nicht rechtzeitig geantwortet. Bitte den Laufstatus und die Diagnose prüfen; keinen zweiten Lauf blind starten.',
    PROCESS_IDENTITY_OUTPUT_INVALID: 'Die Antwort zur sicheren Prozesszuordnung war nicht verwertbar. Der Lauf wurde vorsichtshalber angehalten. Bitte die Diagnose sichern.',
    PROCESS_IDENTITY_PROBE_FAILED: 'Die sichere Prozesszuordnung ist fehlgeschlagen. Die Ursache ist noch nicht bestätigt. Bitte die Diagnose sichern und den Laufstatus prüfen.',
    STANDALONE_HISTORY_ACTIVE: 'Dieser Lauf hat noch offene oder nicht bestätigte Vorgänge. Er bleibt sichtbar. Ausblenden beendet keinen Lauf und bricht keinen Export ab.',
    STANDALONE_HISTORY_VISIBILITY_INVALID: 'Die Anzeigepräferenz konnte nicht sicher gelesen oder gespeichert werden. Es wurden keine Laufdateien gelöscht.',
    STANDALONE_DATA_ROOT_UNSAFE: 'Der interne App-Datenordner konnte nicht sicher geöffnet oder neu angelegt werden. Das ist nicht der Ergebnisordner. Bitte die Diagnose sichern und Zugriff sowie Installation mit der IT prüfen. Vorhandene Daten nicht löschen und Schutzfunktionen nicht abschalten.',
    UNSAFE_STORAGE_LOCATION: 'Die Trennung zwischen internen App-Daten und Ergebnisordnern konnte nicht sicher geprüft werden. Ein gespeicherter Speicherort kann unzugänglich oder ungeeignet sein. Bitte die Diagnose sichern; vorhandene Daten nicht löschen und Schutzfunktionen nicht abschalten.',
    STANDALONE_OWNERSHIP_RUNTIME_DENIED: 'Das Betriebssystem verweigert den Zugriff auf die Komponente zur Prozessabsicherung. Bitte das vollständige Paket und die Berechtigungen mit der IT prüfen; Schutzfunktionen nicht abschalten.',
    STANDALONE_OWNERSHIP_SIGNATURE_REFUSED: 'macOS hat beim Laden der Prozessabsicherung einen Signatur- oder Bibliotheksprüfungsfehler gemeldet. Bitte die Diagnose sichern und ein korrekt signiertes Paket verwenden. Gatekeeper und Bibliotheksprüfung nicht abschalten.',
    STANDALONE_OWNERSHIP_RUNTIME_LOAD_FAILED: 'Die native Komponente zur Prozessabsicherung konnte trotz passendem Dateinachweis nicht geladen werden. Bitte die Diagnose sichern und die Installation mit der IT prüfen.',
    STANDALONE_OWNERSHIP_CONTROL_BUSY: 'Ein anderer lokaler Vorgang sichert gerade seinen Zustand. Es wurde kein neuer Lauf oder Export gestartet. Bitte kurz warten und den Status erneut prüfen.',
    STANDALONE_OWNERSHIP_RUNTIME_INVALID: 'Eine Komponente zur sicheren Prozessabstimmung fehlt, ist beschädigt oder kann nicht geladen werden. Bitte das vollständige App-Paket neu entpacken und die Diagnose mit der IT prüfen. Schutzfunktionen nicht abschalten.',
    STANDALONE_OWNERSHIP_STORAGE_UNSAFE: 'Die Zugriffsrechte oder die Identität des privaten DataSecure-Ordners konnten nicht sicher bestätigt werden. Bitte die Diagnose sichern und die Rechte mit der IT prüfen; keine Ordner oder Sperrdateien manuell löschen.',
    STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED: 'Das sichere Ende einer lokalen Prozessabsicherung ist nicht bestätigt. Bitte die Diagnose sichern und DataSecure kontrolliert schließen. Keinen Lauf oder Export blind wiederholen.',
    CONTENT_OPTIONS_INVALID: 'Die Inhalts- und OCR-Auswahl ist ungültig. Bitte die Auswahl neu prüfen.',
    STANDALONE_REVIEW_POLICY_INVALID: 'Der Schnellweg ist für diese Aufgabe nicht verfügbar. Bitte die Aufgabe und Optionen neu wählen.',
    CONTENT_OPTIONS_NOT_READY: 'Die neuen Inhalts- und OCR-Optionen sind in diesem Entwicklungsstand noch nicht vollständig verfügbar. Die Auswahl bleibt erhalten; es wurde keine Verarbeitung gestartet.',
    CONTENT_OPTIONS_FORBIDDEN: 'Diese Inhaltsoptionen gehören ausschließlich zur eigenständigen DataSecure-Anwendung.',
    CONTENT_OPTIONS_BINDING_INVALID: 'Die gespeicherten Inhalts- oder OCR-Einstellungen passen nicht mehr zu diesem Lauf. Bitte die Originaldateien für einen neuen Lauf auswählen. Frühere Ergebnisse bleiben unverändert.',
    CONTENT_OPTIONS_BINDING_MISSING: 'Der unveränderliche Nachweis der Inhalts- und OCR-Auswahl fehlt. Dieser Lauf wird nicht fortgesetzt. Bitte die Originaldateien für einen neuen Lauf auswählen.',
    STANDALONE_PAUSE_RETENTION_UNAVAILABLE: 'Bei sofortiger Löschung der Arbeitskopien ist keine dauerhafte Pause möglich. Diesen Lauf abschließen; für künftige Läufe die Aufbewahrung prüfen.',
    STANDALONE_PAUSE_INVALID: 'Der gespeicherte Pausestand konnte nicht sicher gelesen werden. Bitte den Laufstatus und die lokale Installation prüfen.',
    STANDALONE_PAUSE_UNAVAILABLE: 'Dieser Lauf ist nicht mehr pausierbar. Bitte seinen aktuellen Status im Verlauf prüfen.',
    STANDALONE_PAUSE_CONTROL_BUSY: 'Der Lauf speichert gerade seinen Zustand. Pause noch nicht bestätigt; bitte erneut versuchen.',
    STANDALONE_PAUSE_CONTROL_INVALID: 'Der Pausestand konnte nicht sicher bestätigt werden. Keine weitere Datei wird ungeprüft gestartet; bitte den Laufstatus erneut prüfen.',
    OCR_CONTACT_SKIP_UNAVAILABLE: 'Nur eine offene OCR-Kontaktprüfung eines reinen Markdown-Laufs kann übersprungen werden. Bitte den aktuellen Laufstatus laden.',
    OCR_CONTACT_SKIP_NOT_READY: 'Die OCR-Prüfgruppe wird noch vorbereitet. Bitte kurz warten und danach erneut „Prüfung überspringen“ wählen.',
    RESULT_EXPORT_ABANDON_UNAVAILABLE: 'Dieser Lauf ist noch aktiv, bereits vollständig bereitgestellt oder nicht mehr sicher belegbar. Bitte den aktuellen Status prüfen.',
    RESULT_EXPORT_BUSY: 'Der Ergebnisexport arbeitet noch. Bitte warten und den Status erneut laden.',
    RESULT_EXPORT_STATE_UNSAFE: 'Der gespeicherte Exportstand ist nicht sicher lesbar. Nichts wurde als abgeschlossen bestätigt; bitte die lokale Diagnose prüfen.',
    AI_EXPORT_VOLUME_MISMATCH: 'Dieser Ergebnisordner liegt auf einem anderen Laufwerk als der private DataSecure-Bereich. Für die sichere, atomare Bereitstellung einen lokalen Ordner auf demselben Laufwerk wählen. Die bisherige Ordnerwahl und vorhandene Ergebnisse bleiben unverändert.',
    STANDALONE_RESULT_ROOT_UNAVAILABLE: 'Der Ergebnisordner ist nicht verfügbar oder konnte nicht angelegt werden. Stelle den bisherigen Speicherort wieder bereit oder wähle unter „Einstellungen“ einen anderen lokalen Ordner. Es wurde kein Lauf gestartet.',
    STANDALONE_RESULT_ROOT_ACCESS_DENIED: 'Auf den eingestellten Ergebnisordner wurde der Zugriff verweigert. DataSecure hält den Start an, statt einen unbestätigten Speicherort zu verwenden. Stelle den bisherigen Ordnerzugriff wieder her oder lasse die Zugriffsrechte durch eure IT prüfen. Vorhandene Laufdaten nicht löschen.',
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
    RESIDUAL_PII: 'Die abschließende Prüfung hat mögliche personenbezogene Inhalte oder unlesbare Zeichen gefunden. Eine lesbare Kopie der Quelldatei prüfen und neu verarbeiten.',
    PARSE_FAILED: 'Der Dateiinhalt konnte nicht vollständig gelesen werden. Die Quelldatei in der Ursprungsanwendung prüfen und eine neue Kopie auswählen.',
    CONVERSION_EXECUTABLE_DENIED: 'Das Betriebssystem hat den Start der Konvertierung verweigert. Mit der IT prüfen; Schutzfunktionen nicht deaktivieren.',
    CONVERSION_EXECUTABLE_MISSING: 'Eine Konvertierungskomponente fehlt. Das vollständige Paket neu entpacken.',
    CONVERSION_LIMIT_SETUP_FAILED: 'Die Schutzgrenzen der Konvertierung konnten nicht eingerichtet werden.',
    MARKDOWN_CONTENT_TRANSFORM_FAILED: 'Die Bildsyntax dieses Markdown-Dokuments konnte nicht ohne möglichen Inhaltsverlust umgewandelt werden. Die Datei wurde nicht ausgegeben.',
    IMAGE_OCR_REQUIRED: 'Diese Bilddatei benötigt Texterkennung. OCR war für diesen Lauf ausgeschaltet; es wurde keine leere Markdown-Datei erstellt.',
    PDF_TEXT_UNAVAILABLE_BY_POLICY: 'Diese PDF enthält keinen nutzbaren vorhandenen Text. Für die Scan-Texterkennung muss OCR eingeschaltet sein.',
    PDF_OCR_SCOPE_REQUIRED: 'Für diese PDF ist die gespeicherte getrennte OCR-Auswahl nicht eindeutig. Die Datei wurde vor der Texterkennung gestoppt.',
    OFFICE_IMAGE_OCR_UNAVAILABLE: 'Ein eingebettetes Bild kann mit den vorhandenen lokalen OCR-Komponenten nicht sicher gelesen werden. Die Datei wurde nicht als vollständig umgewandelt ausgegeben.',
    MARKDOWN_IMAGE_OCR_UNAVAILABLE: 'Markdown verweist auf ein Bild, das nicht als sicherer lokaler Bestandteil übernommen wurde. Die App lädt keine Bildpfade oder Internetadressen automatisch.',
    CONVERSION_OCR_TEXT_EMPTY: 'Die Texterkennung hat keinen lesbaren Text gefunden. Die Datei wurde nicht als leeres erfolgreiches Ergebnis ausgegeben.',
    PROCESSING_INTERRUPTED: 'Die lokale Verarbeitung wurde unterbrochen.', WORKER_EXITED: 'Der Verarbeitungsprozess wurde unerwartet beendet.',
    STANDALONE_BUSY: 'Ein lokaler Vorgang ist bereits aktiv. Bitte warten.',
    STANDALONE_IPC_BUSY: 'Der lokale Core bearbeitet noch einen anderen Vorgang. Die Verbindung ist dadurch nicht als unterbrochen bestätigt. Bitte später den Status erneut prüfen; kein Start oder Export wird automatisch wiederholt.',
    STANDALONE_SELECTION_INVALID: 'Die Auswahl ist nicht mehr aktuell oder überschreitet eine Grenze. Bitte Auswahl erneut prüfen.',
    STANDALONE_START_FAILED: 'Der Start ist nicht bestätigt. Nicht erneut starten; den Verlauf aktualisieren.',
    STANDALONE_IPC_FAILED: 'Die lokale Verbindung wurde unterbrochen. Status erneut laden; nicht blind neu starten.',
    STANDALONE_RUNTIME_MISSING: 'Der lokale Core fehlt im App-Paket. Bitte das vollständige Paket neu installieren und die Diagnose prüfen.',
    STANDALONE_RUNTIME_DENIED: 'Das Betriebssystem verweigert den Start des lokalen Core. Bitte mit der IT Rechte und Sicherheitsrichtlinien prüfen; Schutzfunktionen nicht deaktivieren.',
    STANDALONE_RUNTIME_ARCHITECTURE_INVALID: 'Der lokale Core passt nicht zur Rechnerarchitektur. Bitte das richtige Mac- bzw. Windows-Paket installieren.',
    STANDALONE_RUNTIME_BINARY_INVALID: 'Der lokale Core ist kein gültiges macOS-Programm. Bitte das vollständige Paket neu installieren und die Diagnose prüfen.',
    STANDALONE_RUNTIME_START_FAILED: 'Der lokale Core konnte nicht gestartet werden. Bitte die Diagnose öffnen und mit der IT die Installation prüfen.',
    STANDALONE_SIDECAR_SIGNAL_TRAP: 'Der lokale Core ist vor dem Verbindungsaufbau abgestürzt (Signal 5). Keine Dateien auswählen oder Verarbeitung starten. Bitte die Diagnose sichern und die Installation mit der IT prüfen; Schutzrichtlinien nicht deaktivieren.',
    STANDALONE_SIDECAR_SIGNAL_ABORT: 'Der lokale Core hat sich vor dem Verbindungsaufbau beendet. Bitte die Diagnose sichern und die Installation prüfen.',
    STANDALONE_SIDECAR_SIGNAL_KILLED: 'Der lokale Core wurde vor dem Verbindungsaufbau beendet. Bitte die Diagnose sichern und mit der IT mögliche Systemrichtlinien prüfen.',
    STANDALONE_SIDECAR_SIGNAL_ILLEGAL_INSTRUCTION: 'Der lokale Core konnte eine Prozessoranweisung nicht ausführen. Bitte Paket und Rechnerarchitektur prüfen.',
    STANDALONE_SIDECAR_SIGNAL_BUS: 'Der lokale Core ist vor dem Verbindungsaufbau an einem Speicherzugriff gescheitert. Bitte die Diagnose sichern.',
    STANDALONE_SIDECAR_SIGNAL_SEGFAULT: 'Der lokale Core ist vor dem Verbindungsaufbau abgestürzt. Bitte die Diagnose sichern.',
    STANDALONE_SIDECAR_EXIT_DENIED: 'Der Start des lokalen Core wurde verweigert. Bitte die Diagnose sichern und mit der IT Rechte und Sicherheitsrichtlinien prüfen.',
    STANDALONE_SIDECAR_EXIT_NOT_FOUND: 'Eine benötigte Startkomponente fehlt. Bitte das vollständige Paket neu installieren und die Diagnose prüfen.',
    STANDALONE_SIDECAR_WINDOWS_ACCESS_VIOLATION: 'Der lokale Core ist beim Start mit einem Speicherzugriffsfehler abgestürzt. Bitte die Diagnose sichern.',
    STANDALONE_SIDECAR_WINDOWS_ILLEGAL_INSTRUCTION: 'Der lokale Core konnte eine Prozessoranweisung nicht ausführen. Bitte Paket und Rechnerarchitektur prüfen.',
    STANDALONE_SIDECAR_WINDOWS_INVALID_IMAGE: 'Windows konnte eine gebündelte Programmkomponente nicht laden. Bitte das vollständige Paket neu installieren.',
    STANDALONE_SIDECAR_WINDOWS_DLL_MISSING: 'Eine gebündelte oder systemseitige Programmkomponente fehlt. Bitte die Diagnose sichern und die Installation prüfen.',
    STANDALONE_SIDECAR_WINDOWS_DLL_INIT_FAILED: 'Eine Programmkomponente konnte beim Start nicht initialisiert werden. Bitte die Diagnose sichern und die Installation prüfen.',
    STANDALONE_SIDECAR_WINDOWS_STACK_OVERFLOW: 'Der lokale Core ist beim Start durch einen Speicherfehler abgestürzt. Bitte die Diagnose sichern.',
    STANDALONE_SIDECAR_WINDOWS_STACK_BUFFER_OVERRUN: 'Windows hat den lokalen Core wegen eines Speicher-Sicherheitsfehlers beendet. Bitte die Diagnose sichern.',
    STANDALONE_CONNECTION_CHANGED: 'Die lokale Verbindung wird erneuert. Kein Start und keine Entscheidung werden automatisch wiederholt. Die Dateiauswahl muss danach erneut aufgenommen werden.',
    STANDALONE_CONNECTION_RECOVERY_BLOCKED: 'Der vorherige lokale Prozess oder Export ist noch nicht sicher beendet. DataSecure wartet; es wird kein zweiter Prozess gestartet. Bitte Diagnose prüfen, falls dieser Zustand bestehen bleibt.',
    STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED: 'Zu viele lokale Startversuche sind fehlgeschlagen. Weitere Versuche sind in diesem Fenster gesperrt. Bitte die Diagnose sichern und die App kontrolliert neu starten; keinen Lauf oder Export blind wiederholen.',
    STANDALONE_ADMISSION_TIMEOUT: 'Die Aufnahme konnte innerhalb von fünf Minuten nicht bestätigt werden. Bitte den lokalen Zugriff prüfen.',
    SOURCE_FOLDER_FILE_LIMIT: 'Der sichere Quellenkatalog ist zu groß (höchstens 1.000 Dateien oder zu lange Dateilisten). Bitte einen kleineren Unterordner auswählen. Die bisherige Auswahl bleibt erhalten.',
    SOURCE_FOLDER_SIZE_LIMIT: 'Die aufgenommenen Dateien überschreiten zusammen 500 MB. Bitte einen kleineren Ordner auswählen.',
    STANDALONE_DOCUMENT_VIEW_UNAVAILABLE: 'Die Ergebnisprüfung konnte nicht geöffnet werden. Bitte das vollständige App-Paket verwenden. Die gespeicherten Entscheidungen bleiben erhalten; kein Lauf wurde neu gestartet.'
  };
  const terminalCoreStartupCodes = new Set([
    'STANDALONE_DATA_ROOT_UNSAFE',
    'STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'STANDALONE_OWNERSHIP_RUNTIME_INVALID',
    'STANDALONE_OWNERSHIP_RUNTIME_DENIED', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED',
    'STANDALONE_OWNERSHIP_RUNTIME_LOAD_FAILED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED',
    'STANDALONE_RUNTIME_START_FAILED', 'STANDALONE_RUNTIME_MISSING', 'STANDALONE_RUNTIME_DENIED',
    'STANDALONE_RUNTIME_ARCHITECTURE_INVALID', 'STANDALONE_RUNTIME_BINARY_INVALID',
    'STANDALONE_SIDECAR_SIGNAL_TRAP', 'STANDALONE_SIDECAR_SIGNAL_ABORT',
    'STANDALONE_SIDECAR_SIGNAL_KILLED', 'STANDALONE_SIDECAR_SIGNAL_ILLEGAL_INSTRUCTION',
    'STANDALONE_SIDECAR_SIGNAL_BUS', 'STANDALONE_SIDECAR_SIGNAL_SEGFAULT',
    'STANDALONE_SIDECAR_EXIT_DENIED', 'STANDALONE_SIDECAR_EXIT_NOT_FOUND',
    'STANDALONE_SIDECAR_WINDOWS_ACCESS_VIOLATION',
    'STANDALONE_SIDECAR_WINDOWS_ILLEGAL_INSTRUCTION',
    'STANDALONE_SIDECAR_WINDOWS_INVALID_IMAGE', 'STANDALONE_SIDECAR_WINDOWS_DLL_MISSING',
    'STANDALONE_SIDECAR_WINDOWS_DLL_INIT_FAILED', 'STANDALONE_SIDECAR_WINDOWS_STACK_OVERFLOW',
    'STANDALONE_SIDECAR_WINDOWS_STACK_BUFFER_OVERRUN'
  ]);
  // Only rejected status/context reads may be polled again on these exact
  // contention codes. They grant no Ready state or command acknowledgement.
  const transientReadBusyCodes = new Set(['STANDALONE_IPC_BUSY',
    'STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_BUSY']);
  function readBusyMessage(code) {
    return code === 'STANDALONE_IPC_BUSY' ? reasons.STANDALONE_IPC_BUSY
      : 'Ein anderer lokaler Vorgang sichert gerade seinen Zustand. Verbindung und Laufstatus sind noch nicht bestätigt. Bitte kurz warten und den Status erneut prüfen.';
  }
  let catalogue = [], selected = new Set(), knownIds = new Set(), revision = 0, mode = '', expanded = new Map();
  let consumedAdmission = null;
  let busy = false, closed = false, view = 'new', generation = 0, current = null, job = null;
  let timer, refreshing = false, bootstrapping = true, consecutiveConnectionFailures = 0, automaticRetryPaused = false;
  let historyGeneration = 0, historyRecoveryBusy = false, historySummaryReads = 0,
    historySummaryReadGeneration = 0, historySummaryOwnershipEpoch = 0,
    lastJobSignature = '', problemSignature = '', acknowledged;
  let lastJobAnnouncement = '', lastJobAnnouncementTerminal = false;
  let workingActionSignature = null;
  const terminalAnnouncementStates = new Set(['results_available', 'completed_without_results', 'export_abandoned', 'failed']);
  const announcedTerminalPhases = new Set();
  let guideSignature = '', documentGuide = null, runReviewSnapshot = null;
  // Navigation owns only a run reference and confirmed display metadata. It
  // never grants decision, continuation or export authority.
  let runDetails = null, detailsGeneration = 0, navigationGeneration = 0, documentClose = null;
  const validBatchId = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  const isDetailsView = () => ['details', 'documents', 'review'].includes(view);
  function selectRunDetails(batchId) {
    if (!validBatchId(batchId)) return false;
    if (runDetails?.batchId !== batchId || runDetails.connection !== connectionEpoch)
      runDetails = { batchId, connection: connectionEpoch, generation: ++detailsGeneration, receipt: null };
    $('nav-details').hidden = false;
    $('details-run-id').textContent = `Lauf-ID: ${batchId}`;
    return true;
  }
  function ownJobCardVisible(announcementView = view) {
    return announcementView === 'details' && Boolean(job) && runDetails?.batchId === job.batchId && !runDetails.receipt;
  }
  function clearHiddenTerminalAnnouncement(announcementView = view, terminal = lastJobAnnouncementTerminal) {
    if (!terminal || ownJobCardVisible(announcementView)) return;
    if (lastJobAnnouncement || $('job-announcement').textContent) {
      lastJobSignature = ''; lastJobAnnouncement = '';
      if ($('job-announcement').textContent) $('job-announcement').textContent = '';
    }
    lastJobAnnouncementTerminal = false;
  }
  function renderRunReceipt() {
    const receipt = runDetails?.connection === connectionEpoch ? runDetails.receipt : null;
    $('details-receipt').hidden = !receipt;
    setControlDisabled($('details-open-copy'), !receipt || reconnecting || contextRequired);
    setControlDisabled($('details-open-documents'), !receipt || reconnecting || contextRequired);
    if (!receipt) return;
    $('details-receipt-title').textContent = receipt.processing_mode === 'markdown-only' ? 'Zusätzliche Markdown-Kopie abgeschlossen' : 'Export mit Abschlussbeleg';
    $('details-receipt-text').textContent = `${receipt.exported_count} ausgewählte Dokumentstände wurden lokal kopiert und ihr Empfang bestätigt. Für diese Kopie ist kein weiterer Export nötig. Ordner: ${receipt.folder_name}.`;
  }
  function boundRunReview(state) {
    const saved = runReviewSnapshot;
    if (!saved) return null;
    if (saved.connection !== connectionEpoch || saved.generation !== generation || saved.job !== job ||
        state?.batch_id !== saved.batchId || state.processing_mode !== 'markdown-and-anonymize' ||
        state.state !== 'results_available' || state.batch_complete !== true || state.results_available !== true ||
        state.preparing === true || state.processing === true || state.resumable === true || state.completion_pending === true ||
        state.termination_unconfirmed === true || state.selected_count !== saved.total || state.completed_count !== saved.total ||
        state.result_count !== saved.results || state.failed_count !== saved.failed ||
        (state.review_policy ?? null) !== saved.policy) { runReviewSnapshot = null; return null; }
    return saved.projection;
  }
  function updateRunReview(entry, data) {
    const projection = window.__DATASECURE_PRESENTATION__?.historyReviewProjection(entry, data);
    const matches = job?.batchId === entry.batch_id && current?.batch_id === entry.batch_id;
    if (projection && matches && (view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id) && !busy && !reconnecting && !contextRequired) {
      runReviewSnapshot = { batchId: entry.batch_id, connection: connectionEpoch, generation, job,
        total: entry.selected_count, results: entry.result_count, failed: entry.failed_count, policy: entry.review_policy ?? null, projection };
      boundRunReview(current); // Reject a history/current-status disagreement.
    } else if (runReviewSnapshot?.batchId === entry.batch_id) runReviewSnapshot = null;
    else return;
    lastJobSignature = '';
    if (job && current) renderJob(current); else refreshRunGuide();
  }
  function clearRunReview(announcementView = view) {
    if (!runReviewSnapshot) return;
    runReviewSnapshot = null; lastJobSignature = '';
    if (job && current) renderJob(current, announcementView); else refreshRunGuide();
  }
  function rememberDocumentApproval(metadata) {
    // The already validated, explicitly open document renderer can supply a
    // display-only approval snapshot for the same completed job. It grants no
    // new decision/export authority and cannot certify omitted/unknown sources.
    const results = metadata.document_count;
    const projection = !closed && !busy && !reconnecting && !contextRequired &&
      job?.batchId === metadata.batch_id && job.task === 'markdown-and-anonymize' &&
      current?.batch_id === metadata.batch_id && metadata.processing_mode === 'markdown-and-anonymize' &&
      metadata.fresh === true && metadata.busy === false && metadata.dirty === false &&
      metadata.processing_complete === true && Number.isSafeInteger(results) && results > 0 && results <= 200 &&
      metadata.result_count === results && metadata.approved_count === results &&
      metadata.problem_count === 0 && metadata.expected_omission_count === 0 &&
      metadata.export_pending === false && metadata.export_complete === false
      ? window.__DATASECURE_PRESENTATION__?.projectRun(metadata) : null;
    if (projection?.phase === 'approved') {
      runReviewSnapshot = { batchId: metadata.batch_id, connection: connectionEpoch, generation, job,
        total: results, results, failed: 0, policy: metadata.review_policy ?? null, projection };
      boundRunReview(current); // Still require exact terminal public counts/policy.
    } else if (runReviewSnapshot?.batchId === metadata.batch_id) runReviewSnapshot = null;
    else return;
    lastJobSignature = '';
  }
  let feedbackOwner = null;
  function renderStageList(target, stages) {
    target.replaceChildren(...stages.map(stage => {
      const item = document.createElement('li'); item.textContent = stage.label; item.dataset.status = stage.status;
      if (stage.status === 'current') item.setAttribute('aria-current', 'step');
      item.setAttribute('aria-label', `${stage.label}: ${{ current: 'aktueller Schritt', done: 'belegt abgeschlossen', pending: 'noch nicht bestätigt', optional: 'optional', warning: 'abgeschlossen mit Dateiproblemen' }[stage.status]}`);
      return item;
    }));
  }
  function refreshRunGuide() {
    renderRunReceipt();
    const panel = $('run-guide');
    if (closed || !isDetailsView() || view === 'details' ||
        view === 'documents' && documentGuide?.processing_mode === 'markdown-only' || reconnecting || contextRequired) { panel.hidden = true; return; }
    // The document service proves completion for the exact opened batch. The
    // public status can describe another (newer) run and cannot replace it.
    const metadata = view === 'documents' && documentGuide ? { ...documentGuide }
      : view === 'review' && reviewOrigin ? { ...(current?.batch_id === reviewOrigin.batchId ? current : {}), batch_id: reviewOrigin.batchId,
          processing_mode: reviewOrigin.processingMode,
          review_phase: reviewOrigin.stage || 'waiting', source: 'review' }
        : job && current?.batch_id === job.batchId ? { ...current, source: 'processor' } : null;
    const projection = (metadata?.source === 'processor' && boundRunReview(current)) ||
      window.__DATASECURE_PRESENTATION__?.projectRun(metadata);
    panel.hidden = !projection;
    if (!projection) { guideSignature = ''; return; }
    const signature = JSON.stringify(projection); if (signature === guideSignature) return; guideSignature = signature;
    $('run-guide-scope').textContent = `Lauf ${projection.batchId.slice(0, 8)} · ${projection.raw ? 'Nur umwandeln · nicht anonymisiert' : 'Umwandeln und anonymisieren'}`;
    $('run-guide-title').textContent = projection.heading;
    $('run-guide-counts').textContent = projection.counts || '';
    $('run-guide-next').textContent = projection.next;
    renderStageList($('run-guide-stages'), projection.stages);
  }
  Object.defineProperty(window, '__DATASECURE_RUN_GUIDE__', { value: Object.freeze({
    documents(metadata) {
      if (view !== 'documents' || !metadata || metadata.source !== 'documents' || metadata.batch_id !== documentGuide?.batch_id) return;
      documentGuide = metadata; rememberDocumentApproval(metadata); refreshRunGuide();
    },
    overview(batchId) {
      if (view === 'documents' && batchId === documentGuide?.batch_id) showView('details', batchId);
    },
    history(batchId) {
      if (!closed && view === 'documents' && batchId === documentGuide?.batch_id && batchId === runDetails?.batchId)
        showView('history', batchId, null, batchId);
    },
    exportCompleted(receipt) {
      if (closed || view !== 'documents' || reconnecting || contextRequired ||
          receipt?.batch_id !== documentGuide?.batch_id || receipt.batch_id !== runDetails?.batchId ||
          receipt.source !== 'documents' || receipt.local_ui_only !== true || receipt.external_disclosure !== false ||
          !/^[a-f0-9]{32}$/u.test(receipt.operation_id || '') ||
          !['markdown-only', 'markdown-and-anonymize'].includes(receipt.processing_mode) ||
          !Number.isSafeInteger(receipt.exported_count) || receipt.exported_count < 1 || receipt.exported_count > 200 ||
          !new RegExp(`^Export-${receipt.operation_id}(?:-(?:[2-9]|1[0-6]))?$`, 'u').test(receipt.folder_name || '')) return;
      // Copy only the closed, content-free ACK receipt. A failed optional read
      // afterwards cannot downgrade it or authorize another copy.
      // Keep the acknowledged last step visible. Navigation is a separate
      // user action, through Zum Verlauf or Laufdetails on the same surface.
      runDetails.receipt = { ...receipt };
      renderRunReceipt();
    }
  }) });
  const unlisteners = [];
  const disabledBeforeBusy = new Map();
  const problemRequests = new WeakMap();
  const expandedHistoryProblems = new Set();
  const expandedHistorySummaries = new Set();
  const collapsedMarkdownDetails = new Set();
  const expandedHistoryExtras = new Set();
  const historySummaryRequests = new WeakMap();
  const historySummaryRetirements = new Set();
  let historySummaryEpoch = 0;
  let historySignature = '';
  let includeHiddenHistory = false;
  let requestedHistorySummaryBatchId = null;
  let lastError = null;
  let reviewOrigin = null, documentsOrigin = 'history', admitting = false;
  let pendingResultAbandon = null;
  let connectionEpoch = 0, reconnecting = false, contextRequired = false;
  // Native bootstrap failures outlive ordinary request/render generations.
  // Native Ready may resolve the old refusal, not certify workspace recovery.
  // Explicit recovery keeps automatic reads paused until status + valid context.
  let bootstrapFailure = null;
  let bootstrapRecoveryPending = false;
  let resolvedBootstrapEpoch = -1;
  let receiveConnectionState = null;
  let connectionRetryChecking = false;
  let resultFolderUnavailable = false;
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
      if (command === 'submit_review' || command === 'continue_review_session') {
        owner.phaseGeneration++; owner.complete = false; owner.stage = 'waiting'; refreshRunGuide();
      }
      const phaseGeneration = owner.phaseGeneration;
      try {
        const result = await invoke(command, args);
        if (command !== 'close_review_window' && (owner !== reviewOrigin || owner.closing)) throw Error('STANDALONE_REVIEW_SURFACE_INVALID');
        if (command === 'submit_review' && phaseGeneration === owner.phaseGeneration &&
            result?.accepted === true && result.action === 'deferred') {
          // Only this owned native acknowledgement confirms deferral. The child
          // intentionally does not poll after it; a click alone is not evidence.
          owner.complete = false; owner.stage = 'deferred'; refreshRunGuide();
        }
        if (command === 'get_review_session' && phaseGeneration === owner.phaseGeneration) {
          owner.complete = result?.ready === false && result.run_complete === true;
          owner.stage = owner.complete ? 'complete' : result?.ready === true ? 'ready'
            : ['failed', 'unbound', 'export_pending', 'deferred'].includes(result?.phase) ? result.phase
              : result?.continuation_available === true ? 'continue' : 'waiting';
          refreshRunGuide();
        }
        return result;
      } catch (error) {
        if (owner === reviewOrigin && command === 'close_review_window') owner.closing = false;
        if (owner === reviewOrigin && phaseGeneration === owner.phaseGeneration &&
            (['submit_review', 'continue_review_session'].includes(command) ||
              command === 'get_review_session' && !transientReadBusyCodes.has(errorCode(error)))) {
          // A rejected read grants no new state, but cannot undo a prior ACK.
          // Mutations remain uncertain even when their error is a busy code.
          owner.stage = 'uncertain'; refreshRunGuide();
        }
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
  function renderBootstrapFailure() {
    if (!bootstrapFailure) return;
    feedbackOwner = { kind: 'bootstrap-failed' };
    $('feedback').textContent = `${reasons[bootstrapFailure.code] || 'Der lokale Core konnte nicht sicher gestartet werden. Bitte die Diagnose sichern und die Installation prüfen.'} (${bootstrapFailure.code})`;
    $('feedback').hidden = false; $('feedback').className = 'notice error';
    $('connection-help').hidden = false;
    $('connection-status').textContent = bootstrapFailure.code === 'STANDALONE_RESULT_ROOT_ACCESS_DENIED'
      ? 'Der lokale Dienst hat eine Zugriffsverweigerung am eingestellten Ergebnisziel gemeldet. In diesem Startzustand kann der Ordner nicht in der App gewechselt werden. Nach Wiederherstellung des Zugriffs „Verbindung und Laufstatus prüfen“ wählen. Kein Lauf oder Export wurde erneut gestartet.'
      : 'Der lokale Core konnte keine Verbindung herstellen. Dateiauswahl und Ergebnisordner bleiben absichtlich gesperrt. Automatische Verbindungsversuche sind angehalten. Bitte zuerst die Diagnose sichern und die Ursache prüfen; danach die Verbindung ausdrücklich erneut prüfen. Ein Lauf oder Export wurde nicht erneut gestartet.';
  }
  function holdBootstrapFailure(epoch, code, nativeBound = false) {
    if (!Number.isSafeInteger(epoch) || epoch < 0 || !/^[A-Z][A-Z0-9_]{1,80}$/u.test(code) ||
        bootstrapFailure && epoch < bootstrapFailure.epoch) return;
    if (bootstrapFailure?.epoch === epoch) {
      if (nativeBound && bootstrapFailure.code === code) bootstrapFailure.nativeBound = true;
      renderBootstrapFailure(); return;
    }
    bootstrapFailure = { epoch, code, nativeBound };
    automaticRetryPaused = true; clearTimeout(timer);
    reconnecting = true; contextRequired = true; updateStart(); renderBootstrapFailure();
  }
  function retireResolvedBootstrap(resolution, observedEpoch) {
    if (!bootstrapFailure?.nativeBound || !resolution || typeof resolution !== 'object' ||
        Array.isArray(resolution) || Object.keys(resolution).length !== 2 ||
        !Number.isSafeInteger(resolution.failure_epoch) || !Number.isSafeInteger(resolution.ready_epoch) ||
        !Number.isSafeInteger(observedEpoch) || resolution.failure_epoch !== bootstrapFailure.epoch ||
        resolution.ready_epoch <= resolution.failure_epoch || resolution.ready_epoch > observedEpoch ||
        resolution.failure_epoch <= resolvedBootstrapEpoch) return false;
    resolvedBootstrapEpoch = Math.max(resolvedBootstrapEpoch, resolution.failure_epoch);
    bootstrapFailure = null;
    // Historical Ready does not rewind a newer recovery epoch or unlock work.
    reconnecting = true; contextRequired = true; updateStart();
    if (bootstrapRecoveryPending) automaticRetryPaused = true;
    feedback('Der frühere Startfehler ist nativ erledigt. Verbindung und gespeicherter Laufstatus sind noch nicht bestätigt.', false, { kind: 'connection-unconfirmed' });
    $('connection-help').hidden = false;
    $('connection-status').textContent = 'Der frühere Startfehler ist nativ erledigt. Verbindung und gespeicherter Laufstatus sind noch nicht bestätigt. Bitte ausdrücklich erneut prüfen; kein Lauf oder Export wird wiederholt.';
    return true;
  }
  function feedback(message, error = false, owner = null) {
    if (bootstrapFailure) { renderBootstrapFailure(); return; }
    feedbackOwner = owner; $('feedback').textContent = message; $('feedback').hidden = !message;
    $('feedback').className = `notice${error ? ' error' : ''}`; $('connection-help').hidden = true; }
  function deliveryFeedback(batchId) {
    feedback('Der Ergebnisordner dieses Laufs ist noch nicht als bereit bestätigt. DataSecure gleicht den Stand erneut ab. Wenn der Hinweis bestehen bleibt, die Hinweise dieses Laufs prüfen; keine neue Kopie starten.', false,
      { batchId, kind: 'delivery-pending' });
  }
  function recoveryFeedback(result, batchId) {
    if (!result || result.batch_id !== batchId || !['available', 'pending', 'not_attempted', 'failed'].includes(result.outcome))
      throw Error('STANDALONE_HISTORY_INVALID');
    const messages = {
      available: 'Die Bereitstellung dieses Laufs und der gebundene Ergebnisordner sind bestätigt. Es wurde kein neuer Lauf gestartet.',
      pending: 'Die Bereitstellung wurde erneut geprüft, ist aber noch nicht als vollständig bestätigt. Bitte den Laufstatus später erneut prüfen; keinen zweiten Lauf oder Export starten.',
      not_attempted: 'Bei dieser Prüfung wurde keine neue Bereitstellung begonnen. Der Ergebnisordner ist noch nicht bestätigt. Bitte Laufstatus und Diagnose prüfen; keinen zweiten Lauf oder Export starten.',
      failed: 'Die erneute Bereitstellung konnte nicht abgeschlossen werden. Der Ergebnisordner ist nicht bestätigt. Bitte Diagnose prüfen; keinen zweiten Lauf oder Export starten.'
    };
    feedback(messages[result.outcome], result.outcome === 'failed',
      result.outcome === 'available' ? { batchId, kind: 'delivery-available' } : { batchId, kind: 'delivery-pending' });
  }
  function reconcileFeedback(state) {
    if (!feedbackOwner || feedbackOwner.kind !== 'delivery-pending' ||
        feedbackOwner.batchId !== (state.batch_id || state.batchId)) return;
    const completed = state.status === 'results_available' || state.state === 'results_available'
      ? state.results_available === true && state.result_location !== 'missing'
      : (state.status === 'completed_without_results' || state.state === 'completed_without_results') && count(state.result_count) === 0;
    if (completed &&
        !state.resumable && !state.completion_pending && !state.export_pending_count) feedback('');
  }
  function errorCode(error) { const raw = error?.code || error?.message || String(error);
    try { const value = JSON.parse(raw); return /^[A-Z][A-Z0-9_]{1,80}$/u.test(value?.code) ? value.code : 'STANDALONE_OPERATION_FAILED'; }
    catch { return /^[A-Z][A-Z0-9_]{1,80}$/u.test(raw) ? raw : 'STANDALONE_OPERATION_FAILED'; } }
  function showError(error, command = null) { const code = errorCode(error);
    if (bootstrapFailure) { renderBootstrapFailure(); return; }
    const connectionError = ['STANDALONE_IPC_FAILED', 'STANDALONE_IPC_TIMEOUT', 'STANDALONE_CONNECTION_CHANGED',
      'STANDALONE_CONNECTION_RECOVERY_BLOCKED', 'STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED',
      'STANDALONE_RUNTIME_START_FAILED', 'STANDALONE_RUNTIME_MISSING',
      'STANDALONE_RUNTIME_DENIED', 'STANDALONE_RUNTIME_ARCHITECTURE_INVALID',
      'STANDALONE_RUNTIME_BINARY_INVALID'].includes(code) || terminalCoreStartupCodes.has(code);
    // This refusal precedes the configuration commit, not a document export.
    // Keep the same code in other commands under its existing error contract.
    const reason = command === 'configure_results' && code === 'AI_EXPORT_CONFLICT'
      ? 'Der gewählte Ergebnisordner konnte nicht sicher vorbereitet werden. Die bisherige Einstellung bleibt unverändert. Durch diese Ordnerwahl wurde kein Dokumentlauf und kein Export gestartet. Bitte Diagnose und aktuellen Laufstatus prüfen; keinen Lauf oder Export blind wiederholen.'
      : reasons[code] || 'Der lokale Vorgang konnte nicht abgeschlossen werden. Bitte Diagnose und aktuellen Laufstatus prüfen.';
    feedback(`${reason} (${code})`, true,
      connectionError ? { kind: 'connection-unconfirmed' } : null);
    $('connection-help').hidden = !(reconnecting || contextRequired || connectionError); }
  function activeCoreDescription(activity) {
    if (activity?.state !== 'active' || activity.active !== true || !Number.isSafeInteger(activity.elapsed_ms) || activity.elapsed_ms < 0) return '';
    const operation = { export_approved_documents: 'die ausgewählte Kopie', preview_document_export: 'die Exportvorschau',
      decide_document_review_batch: 'die gemeinsame Freigabeentscheidung', decide_document_review: 'eine Dokumententscheidung',
      get_run_history: 'den gespeicherten Verlauf', get_document_review_history_summary: 'den Freigabe- und Exportstatus',
      get_document_reviews: 'die Dokumentprüfstände', admit_selected_sources: 'die Dateiauswahl' }[activity.action] || 'einen lokalen Vorgang';
    const seconds = Math.floor(Math.min(activity.elapsed_ms, 86400000) / 1000);
    return `DataSecure bearbeitet noch ${operation} (seit ${seconds} Sekunden). Der Abschluss steht noch aus.`;
  }
  function nativeCoreDescription(snapshot) {
    if (snapshot?.phase === 'closing') return 'DataSecure schließt erst, wenn der lokale Dienst sicher beendet ist. Bitte warten.';
    if (snapshot?.phase === 'blocked') return 'Das sichere Ende des lokalen Dienstes oder Exports konnte nicht bestätigt werden. Bitte die Diagnose öffnen und den gespeicherten Laufstatus prüfen.';
    return activeCoreDescription(snapshot?.activity);
  }
  function explainUnboundBootstrapRetry() {
    renderBootstrapFailure();
    $('connection-status').textContent += ' Der aktuelle Startfehler konnte vom Programm noch nicht zuverlässig bestätigt werden. Es wurde kein neuer Core-Start angefordert. Bitte die Diagnose sichern und die Verbindung später ausdrücklich erneut prüfen.';
  }
  async function updateConnectionHelp() {
    const epoch = connectionEpoch, request = generation, heldFailure = bootstrapFailure;
    const generic = 'Der letzte Laufstatus ist nicht bestätigt. Kein zweiter Lauf wird gestartet. Bitte Verbindung und Laufstatus erneut prüfen oder die inhaltsfreie lokale Diagnose öffnen.';
    try {
      const snapshot = await invoke('get_native_recovery_status');
      if (closed || !reconnecting || epoch !== connectionEpoch || request !== generation || heldFailure !== bootstrapFailure) return null;
      const failure = snapshot?.bootstrap_failure;
      const trustedFailure = snapshot?.local_ui_only === true && snapshot.external_disclosure === false &&
        ['idle', 'owned', 'settling', 'checking', 'blocked'].includes(snapshot.phase) &&
        failure && typeof failure === 'object' && !Array.isArray(failure) && Object.keys(failure).length === 2 &&
        Number.isSafeInteger(failure.epoch) && failure.epoch > 0 && failure.epoch >= connectionEpoch &&
        failure.epoch > resolvedBootstrapEpoch && typeof failure.error_code === 'string' &&
        /^[A-Z][A-Z0-9_]{1,79}$/u.test(failure.error_code);
      if (trustedFailure) receiveConnectionState?.({ payload: { ...failure, state: 'bootstrap_failed' } });
      const trustedResolution = snapshot?.local_ui_only === true && snapshot.external_disclosure === false &&
        ['idle', 'owned', 'settling', 'checking', 'blocked', 'closing'].includes(snapshot.phase) &&
        failure === null && Number.isSafeInteger(snapshot.connection_epoch) && snapshot.connection_epoch >= connectionEpoch;
      if (trustedResolution && retireResolvedBootstrap(snapshot.bootstrap_resolution, snapshot.connection_epoch)) {
        connectionEpoch = Math.max(connectionEpoch, snapshot.connection_epoch);
      }
      if (bootstrapFailure) {
        renderBootstrapFailure();
        // One private, single-use proof for this exact fresh snapshot. The
        // provisional epoch from an invoke error is not native authority.
        return trustedFailure && failure.epoch === connectionEpoch && failure.epoch === bootstrapFailure.epoch &&
          failure.error_code === bootstrapFailure.code
          ? { failure: bootstrapFailure, connectionEpoch, generation, used: false } : null;
      }
      const message = {
        closing: 'DataSecure schließt erst, wenn der lokale Dienst sicher beendet ist. Nicht als abgeschlossenen Lauf ansehen.',
        checking: 'DataSecure ermittelt den sicheren Prozesszustand. Bitte kurz warten und den Laufstatus erneut prüfen.',
        settling: 'Der vorherige lokale Dienst oder Export wird noch sicher abgeglichen. Kein zweiter Lauf wird gestartet; bitte den Status erneut prüfen.',
        owned: 'Der vorherige lokale Dienst ist noch diesem Fenster zugeordnet. Bitte den Laufstatus erneut prüfen; keine Verarbeitung erneut starten.',
        blocked: 'Das sichere Ende des vorherigen Dienstes oder Exports konnte nicht bestätigt werden. Kein zweiter Lauf wird gestartet. Bitte die lokale Diagnose öffnen; nichts als fertig oder exportiert ansehen.',
        idle: 'Es ist kein vorheriger lokaler Dienst mehr zugeordnet. Bitte Verbindung und gespeicherten Laufstatus erneut prüfen; DataSecure startet keinen Lauf automatisch.'
      }[snapshot?.phase];
      $('connection-status').textContent = nativeCoreDescription(snapshot) || message || generic;
      if (snapshot?.diagnostic_log === 'unavailable') {
        $('connection-status').textContent += ' Das lokale Diagnoseprotokoll konnte nicht geschrieben werden. Bitte die IT über diesen Hinweis informieren.';
      }
    } catch {
      if (!closed && reconnecting && epoch === connectionEpoch) {
        if (bootstrapFailure) renderBootstrapFailure(); else $('connection-status').textContent = generic;
      }
    }
    return null;
  }
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
      if (['diagnostics', 'connection-diagnostics', 'diagnostic-save', 'connection-diagnostic-save', 'document-export-diagnostic-save'].includes(node.id)) continue;
      disabledBeforeBusy.set(node, node.disabled); node.disabled = true;
    }
    else { for (const [node, disabled] of disabledBeforeBusy) node.disabled = disabled; disabledBeforeBusy.clear(); }
    $('start').disabled = false; updateStart();
  }
  function beginBusy() { const ownership = ++busyGeneration; setBusy(true); return ownership; }
  function endBusy(ownership) { if (ownership === busyGeneration && !closed) setBusy(false); }
  async function explainBlockedPicker(command, reason) {
    if (!['select_files', 'select_folder', 'configure_results'].includes(command)) return;
    await invoke('report_blocked_picker', { action: command, reason }).catch(() => {});
    if (bootstrapFailure) { renderBootstrapFailure(); return; }
    if (reason === 'reconnecting') {
      $('connection-help').hidden = false;
      $('connection-status').textContent = 'Dateiauswahl und Ergebnisordner sind erst nach der wiederhergestellten lokalen Verbindung verfügbar. Bitte „Verbindung und Laufstatus prüfen“ wählen.';
    } else {
      feedback('Ein lokaler Vorgang läuft bereits. Bitte dessen Abschluss abwarten und die Auswahl danach erneut öffnen.', true);
    }
  }
  async function perform(command, args) {
    if (closed) return null;
    if (busy || reconnecting) { await explainBlockedPicker(command, reconnecting ? 'reconnecting' : 'busy'); return null; }
    const connection = connectionEpoch;
    generation++; clearRunReview(); lastError = null; const ownership = beginBusy();
    try { const result = await invoke(command, args); return connection === connectionEpoch ? result : null; }
    catch (error) { if (connection !== connectionEpoch) return null; lastError = errorCode(error); showError(error, command); return null; }
    finally { endBusy(ownership); }
  }
  function showView(next, batchId = runDetails?.batchId, receipt = null, summaryBatchId = null) {
    if (closed || !['new', 'history', 'settings', 'details', 'documents', 'review'].includes(next)) return;
    const navigation = ++navigationGeneration, connection = connectionEpoch;
    if (view === 'documents' && next !== 'documents') {
      // close() clears its batch synchronously, then awaits native revocation.
      // Share that exact close transaction across rapid tab clicks: a second
      // click must not capture a null owner or revoke a successor's binding.
      const owner = documentGuide?.batch_id, renderer = window.__DATASECURE_DOCUMENTS__;
      let closing = documentClose;
      if (!closing || closing.connection !== connection || closing.owner !== owner) {
        if (!validBatchId(owner) || renderer?.activeBatchId?.() !== owner || typeof renderer.close !== 'function') return;
        closing = { owner, connection, promise: null }; documentClose = closing;
        closing.promise = Promise.resolve().then(() => renderer.close());
      }
      const currentClose = () => documentClose === closing && navigation === navigationGeneration &&
        connection === connectionEpoch && view === 'documents' && owner === documentGuide?.batch_id;
      closing.promise.then(ok => {
        if (!currentClose()) return;
        documentClose = null;
        if (ok) { view = ''; showView(next, batchId, receipt, summaryBatchId); }
      }).catch(() => {
        if (!currentClose()) return;
        documentClose = null;
        feedback('Die Dokumentansicht konnte noch nicht geschlossen werden. Den aktuellen Stand prüfen; ungespeicherte Änderungen nicht verwerfen.', true);
      }); return;
    }
    // Never discard an unsubmitted review on ordinary navigation.
    if (view === 'review' && next !== 'review') { feedback('Bitte die Prüfung mit „Später entscheiden“ oder „Zur Verarbeitung“ verlassen. Nicht übergebene Eingaben bleiben sonst nur in dieser Ansicht.'); return; }
    if (['details', 'documents', 'review'].includes(next) && !selectRunDetails(batchId)) return;
    if (next !== view) {
      historySummaryEpoch++;
      // Re-entering history must not present a previous approval snapshot as
      // current after document edits. Polling unchanged rows still keeps focus.
      if (next === 'history') { historySignature = ''; clearRunReview(next); }
      else if (!['new', 'history', 'details'].includes(next)) clearRunReview(next);
    }
    view = next;
    // Commit the exact completion-link request only after its native document
    // close and navigation ownership checks. A superseding tab must not leave
    // an unrelated summary request behind for a later visit to history.
    if (next === 'history' && validBatchId(summaryBatchId)) {
      requestedHistorySummaryBatchId = summaryBatchId; historySignature = '';
    }
    if (receipt && runDetails?.batchId === receipt.batch_id) runDetails.receipt = receipt;
    clearHiddenTerminalAnnouncement();
    const ownJob = runDetails?.batchId === job?.batchId;
    $('setup').hidden = false;
    $('job').hidden = next !== 'details' || !ownJob || Boolean(runDetails?.receipt);
    $('run-history-detail').hidden = next !== 'details' || ownJob && !runDetails?.receipt;
    $('details-overview-panel').hidden = next !== 'details';
    $('details-overview').hidden = next === 'details' || next === 'review';
    renderRunReceipt();
    if (next === 'details' && ownJob && current && !runDetails.receipt) renderJob(current);
    refreshRunGuide();
    for (const name of ['new', 'history', 'settings', 'details']) $(name + '-view').hidden = name !== (isDetailsView() ? 'details' : next);
    for (const name of ['review', 'documents']) $(name + '-view').hidden = name !== next;
    for (const name of ['new', 'history', 'details', 'settings']) { const node = $('nav-' + name); const active = name === (isDetailsView() ? 'details' : next);
      node.className = `nav-tab${name === 'settings' ? ' settings-tab' : ''}${active ? ' active' : ''}`;
      node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1;
      node.setAttribute('aria-controls', name + '-view'); }
    if (next === 'history') refreshHistory();
    else if (next === 'details' && (!ownJob || runDetails.receipt)) {
      historySignature = ''; requestedHistorySummaryBatchId = runDetails.batchId;
      refreshHistory(false, null, runDetails.batchId);
    }
  }
  function updateStart() {
    const chosen = catalogue.filter(item => item.selectable && selected.has(item.source_id));
    const bytes = chosen.reduce((total, item) => total + count(item.bytes), 0);
    const tooLarge = chosen.length > 200 || bytes > 500 * 1024 * 1024;
    const hint = bootstrapFailure ? 'Der lokale Core ist nicht bereit. Bitte Diagnose und Startursache prüfen.'
      : reconnecting ? 'Die lokale Verbindung wird wiederhergestellt. Bitte warten.' : busy ? 'Ein lokaler Vorgang ist aktiv. Bitte warten.'
      : ['preparing', 'processing'].includes(current?.state) || current?.intake_failure?.worker_active === true ? 'Ein Lauf ist noch nicht abgeschlossen. Öffne seine Laufdetails und warte auf den Abschluss oder pausiere ihn ausdrücklich.'
      : !mode && !chosen.length ? 'Bitte Aufgabe und Dateien auswählen.'
      : !mode ? 'Bitte zuerst eine Aufgabe auswählen.' : !chosen.length ? 'Bitte mindestens eine geeignete Datei anhaken.'
      : tooLarge ? 'Auswahl zu groß.' : resultFolderUnavailable ? 'Der bisherige Ergebnisordner ist nicht verfügbar. Stelle ihn wieder bereit oder wähle unten „Ordner ändern“.' : '';
    $('start').setAttribute('aria-disabled', String(Boolean(hint)));
    $('start').setAttribute('aria-describedby', tooLarge ? 'start-hint selection-limit' : 'start-hint');
    $('start-hint').textContent = hint || `${chosen.length} Datei${chosen.length === 1 ? '' : 'en'} ${chosen.length === 1 ? 'wird' : 'werden'} lokal verarbeitet.`;
    $('selection-limit').hidden = !tooLarge;
    $('selection-limit').textContent = tooLarge ? 'Zu viele Dateien oder zu große Auswahl: max. 200 Dateien / 500 MB pro Lauf – bitte die Häkchenauswahl verkleinern.' : '';
    $('file-section').className = `card-section files-section${!mode ? ' no-mode' : ''}`;
    $('ocr-option').hidden = mode !== 'markdown-only';
    $('ocr-option-help').hidden = mode !== 'markdown-only';
    $('text-ocr-options').hidden = !['markdown-only', 'markdown-and-anonymize'].includes(mode);
    $('output-naming').hidden = mode !== 'markdown-and-anonymize';
    $('fast-anonymize-option').hidden = mode !== 'markdown-and-anonymize';
    $('manual-anonymize').disabled = busy || mode !== 'markdown-and-anonymize';
    $('fast-anonymize').disabled = busy || mode !== 'markdown-and-anonymize';
    $('naming-neutral').disabled = busy || mode !== 'markdown-and-anonymize';
    $('naming-source').disabled = busy || mode !== 'markdown-and-anonymize';
    $('output-naming-help').textContent = $('naming-source').checked
      ? 'Der Originaldateiname bleibt sichtbar und erhält „-anonymisiert“. Nur wählen, wenn Datei- und Ordnernamen keine personenbezogenen Angaben enthalten. Diese Wahl gilt nur für die Ergebnisdateien dieses neuen Laufs; spätere Exporte erhalten immer neutrale Namen.'
      : 'Empfohlen: Neutrale Ergebnisdateinamen vermeiden Angaben im Dateinamen. Unterordner und die vertrauliche Zuordnungsdatei können Originalnamen enthalten; diese nicht ungeprüft weitergeben. Spätere Exporte erhalten immer neutrale Namen.';
    $('ocr-review').disabled = busy || mode !== 'markdown-only' || !$('text-ocr').checked;
    return !hint;
  }
  function checkState(input, items) { const eligible = items.filter(item => item.selectable), n = eligible.filter(item => selected.has(item.source_id)).length;
    input.checked = eligible.length > 0 && n === eligible.length; input.indeterminate = n > 0 && n < eligible.length;
    input.disabled = busy || !eligible.length; input.setAttribute('aria-checked', input.indeterminate ? 'mixed' : String(input.checked)); }
  function chooseItems(items, checked) { for (const item of items) if (item.selectable) checked ? selected.add(item.source_id) : selected.delete(item.source_id); renderTree(); }
  function folderOcrLabel(items) {
    // Match the existing file badge, not the selected subset or the OCR switch.
    // PDF/embedded-image OCR need is unknown until processing; do not infer it.
    const total = items.filter(item => item.selectable && item.ocr_required === true).length;
    return total ? `${total} ${total === 1 ? 'Datei benötigt' : 'Dateien benötigen'} OCR` : '';
  }
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
    $('catalogue-count').textContent = `${catalogue.length} ${catalogue.length === 1 ? 'Datei' : 'Dateien'}`;
    const catalogueOcr = folderOcrLabel(catalogue);
    $('catalogue-ocr-count').textContent = catalogueOcr;
    $('catalogue-ocr-count').hidden = !catalogueOcr;
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
      const metadata = element('div', undefined, 'group-metadata');
      metadata.append(element('span', `${items.filter(item => item.selectable && selected.has(item.source_id)).length}/${items.filter(item => item.selectable).length}`, 'meta'));
      // treeGroups already includes all descendants once in each parent's items.
      // Keep this in the heading so collapsing the content cannot hide the badge.
      const ocrLabel = folderOcrLabel(items);
      if (ocrLabel) metadata.append(element('span', ocrLabel, 'pill neutral folder-ocr'));
      const unavailable = items.filter(item => !item.selectable).length;
      if (unavailable) metadata.append(element('span', `${unavailable} nicht verfügbar`, 'pill warning'));
      heading.append(collapse, label, metadata);
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
    if (ocrImages) summary.push(element('span', mode && !$('text-ocr').checked
      ? `${ocrImages} ${ocrImages === 1 ? 'Bild benötigt' : 'Bilder benötigen'} OCR · Häkchen oben setzen`
      : `${ocrImages} ${ocrImages === 1 ? 'Bild' : 'Bilder'} mit OCR`));
    if (chosen.some(item => /\.pdf$/iu.test(item.name))) summary.push(element('span', 'PDF-Bedarf wird bei der Verarbeitung geprüft'));
    $('selection-summary').replaceChildren(...summary);
    $('expand-all').textContent = groups.every(({ key }) => expanded.get(key)) ? 'Alle zuklappen' : 'Alle aufklappen';
    updateStart(); if (focused && $(focused)) $(focused).focus();
  }
  function applyContext(context) {
    if (context?.local_ui_only !== true || context.external_disclosure !== false) throw Error('STANDALONE_CONTEXT_INVALID');
    if (context.result_folder_status !== undefined && !['unconfigured', 'available', 'unavailable'].includes(context.result_folder_status))
      throw Error('STANDALONE_CONTEXT_INVALID');
    resultFolderUnavailable = context.result_folder_status === 'unavailable';
    const destination = resultFolderUnavailable ? 'Bisheriger Ergebnisordner nicht verfügbar. Bitte wieder bereitstellen oder einen anderen Ordner wählen.' : context.result_folder || 'Standardordner';
    $('destination').textContent = destination; $('settings-destination').textContent = destination;
    $('retry-destination').hidden = !resultFolderUnavailable; $('retry-results').hidden = !resultFolderUnavailable;
    if (!Array.isArray(context.source_catalogue)) return;
    // A delayed context from before Start may still contain the consumed
    // sources. It must not turn a finished job into another prepared job.
    if (consumedAdmission?.connection === connectionEpoch && Number.isSafeInteger(context.catalogue_revision) &&
        context.catalogue_revision <= consumedAdmission.revision) return;
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
    if (busy) { await explainBlockedPicker(command, 'busy'); return; }
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
  function consumeAdmission() {
    if (Number.isSafeInteger(revision)) consumedAdmission = { connection: connectionEpoch, revision };
    catalogue = []; selected.clear(); knownIds.clear(); expanded.clear(); admitting = false;
    $('add-options').hidden = true; $('add-more').setAttribute('aria-expanded', 'false');
    $('set-name').textContent = 'Dateiauswahl';
    renderTree();
  }
  async function start() {
    // A completed predecessor remains selectable in Laufdetails. Its display
    // reference is not a lock on an explicitly admitted successor; native/Core
    // admission still owns the actual processing/concurrency permission.
    if (!updateStart()) return;
    const files = catalogue.filter(item => item.selectable && selected.has(item.source_id));
    const snapshot = { task: mode, name: $('set-name').textContent, files: files.map(item => item.name) };
    const args = { processingMode: mode, sourceIds: files.map(item => item.source_id), catalogueRevision: revision };
    const ocr = $('text-ocr').checked;
    args.contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: ocr, imageOcr: ocr };
    if (mode === 'markdown-and-anonymize') args.outputNamingMode = $('naming-source').checked ? 'source-with-suffix' : 'neutral';
    else if (ocr && $('ocr-review').checked) args.ocrContactReview = true;
    if (mode === 'markdown-and-anonymize' && $('fast-anonymize').checked) args.reviewPolicy = 'automatic-conservative';
    const startConnection = connectionEpoch;
    const result = await perform('start_admitted_batch', args);
    if (startConnection !== connectionEpoch) return;
    if (!result) {
      if (lastError === 'STANDALONE_RESULT_ROOT_UNAVAILABLE') {
        const context = await perform('get_ui_context');
        if (context) { try { applyContext(context); } catch (error) { showError(error); } }
      }
      if (['STANDALONE_START_FAILED', 'STANDALONE_IPC_FAILED', 'STANDALONE_IPC_TIMEOUT'].includes(lastError)) {
        // The command may already have consumed this admission. Do not send
        // an unbound follow-up cancellation that could hit a newer selection.
        consumeAdmission();
        feedback('Der Start ist nicht bestätigt. Die Auswahl wird nicht nochmals gestartet. Bitte im Verlauf den tatsächlichen Laufstatus prüfen.', true);
        showView('history');
      }
      schedule(500); return;
    }
    adoptRun({ ...snapshot, batchId: result.batch_id, selectedCount: files.length }); consumeAdmission();
    feedback('');
    showView('details', job.batchId); $('job-title').focus(); await refresh();
  }
  function adoptRun(run) {
    job = run; mode = run.task;
    announcedTerminalPhases.clear();
    lastJobAnnouncement = ''; lastJobAnnouncementTerminal = false; $('job-announcement').textContent = '';
    $('setup').hidden = true; $('job').hidden = false;
    $('job-task').textContent = run.task === 'markdown-only' ? 'Nur umwandeln'
      : run.task === 'markdown-and-anonymize' ? 'Umwandeln und anonymisieren' : 'Verarbeitungszweck nicht bestätigt';
    $('job-name').textContent = run.name; $('job-count').textContent = `${run.selectedCount} ${run.selectedCount === 1 ? 'Datei' : 'Dateien'}`;
    $('job-files').replaceChildren(...run.files.map(name => element('li', name)));
    $('job-files').hidden = true; $('job-files-toggle').hidden = !run.files.length;
    $('job-files-toggle').setAttribute('aria-expanded', 'false'); $('job-files-toggle').textContent = 'Dateien anzeigen ⌄';
    $('file-problems').hidden = true; lastJobSignature = ''; problemSignature = ''; acknowledged = null;
    $('file-problems').open = false; $('job-more').open = false;
  }
  async function openDocuments(batchId, exportPreview = false, origin = view) {
    if (closed || reconnecting || contextRequired) return;
    if (!/^[a-f0-9]{64}$/u.test(batchId || '')) { showError(Error('STANDALONE_SELECTION_INVALID')); return; }
    const documentView = window.__DATASECURE_DOCUMENTS__;
    if (typeof documentView?.open !== 'function' || typeof documentView?.canOpen !== 'function') {
      showView('details', batchId);
      showError(Error('STANDALONE_DOCUMENT_VIEW_UNAVAILABLE')); return;
    }
    // A draft or running decision belongs to the previously opened batch.
    // Do not change the outer run guide before the document view accepts the
    // transition; otherwise the heading and actual private text disagree.
    if (!documentView.canOpen(batchId)) {
      if (documentView.activeBatchId?.()) { showView('documents', documentView.activeBatchId()); $('documents-heading').focus(); }
      return;
    }
    documentsOrigin = 'details';
    documentGuide = { batch_id: batchId, processing_mode: job?.batchId === batchId ? job.task : null, source: 'documents', fresh: false };
    $('documents-back').textContent = 'Zur Laufübersicht';
    showView('documents', batchId); $('documents-heading').focus();
    if (view !== 'documents') return;
    try { await documentView.open(batchId, { exportPreview }); }
    catch (error) { showError(error); }
  }
  async function resumeRun(entry, review = false) {
    if (catalogue.length) { feedback('Bitte die vorbereitete Dateiauswahl zuerst leeren, bevor du einen vorhandenen Lauf fortsetzt.', true); return; }
    if (!await perform('continue_history_batch', { batchId: entry.batch_id })) return;
    const previous = job?.batchId === entry.batch_id ? job : null;
    adoptRun({ batchId: entry.batch_id, task: entry.processing_mode, name: previous?.name || `Lauf ${entry.batch_id.slice(0, 8)}`,
      files: previous?.files || [], selectedCount: count(entry.selected_count) });
    if (review) await beginReview(entry.batch_id, false);
    else { showView('details', entry.batch_id); await refresh(); $('job-title').focus(); }
  }
  async function newJob() {
    if (busy || ['preparing', 'processing'].includes(current?.state) || current?.intake_failure?.worker_active === true) return;
    if (!await perform('cancel_admission')) return;
    job = null; catalogue = []; knownIds.clear(); selected.clear(); mode = ''; current = null; generation++;
    announcedTerminalPhases.clear();
    lastJobAnnouncement = ''; lastJobAnnouncementTerminal = false; $('job-announcement').textContent = '';
    $('mode-markdown').checked = false; $('mode-anonymize').checked = false;
    $('text-ocr').checked = false; $('ocr-review').checked = false;
    $('manual-anonymize').checked = true;
    $('fast-anonymize').checked = false;
    $('naming-neutral').checked = true; $('naming-source').checked = false;
    $('setup').hidden = false; $('job').hidden = true;
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
    const purpose = job?.batchId === batchId ? job.task : current?.batch_id === batchId ? current.processing_mode : null;
    reviewOrigin = { view, batchId, processingMode: ['markdown-only', 'markdown-and-anonymize'].includes(purpose) ? purpose : null,
      nativeGeneration: opened.review_generation, phaseGeneration: 0, complete: false, closing: false, stage: 'waiting' };
    $('review-heading').textContent = `Prüfen: ${job?.batchId === batchId ? job.name : `Lauf ${batchId.slice(0, 8)}`}`;
    $('review-scope').textContent = job?.batchId === batchId
      ? `${job.selectedCount} ${job.selectedCount === 1 ? 'Datei' : 'Dateien'} · Entscheidungen gelten für diesen Lauf`
      : 'Entscheidungen gelten für diesen Lauf';
    $('review-frame').src = 'review.html?embedded=1'; showView('review', batchId);
    feedback(''); $('review-heading').focus();
  }
  function offerSkipOcrContactReview(batchId, selectedCount = 0) {
    if (busy || !/^[a-f0-9]{64}$/u.test(batchId || '')) return;
    if (catalogue.length) { feedback('Bitte die vorbereitete Dateiauswahl zuerst leeren, bevor du einen vorhandenen Lauf fortsetzt.', true); return; }
    if (job?.batchId !== batchId) {
      adoptRun({ batchId, task: 'markdown-only', name: `Lauf ${batchId.slice(0, 8)}`,
        files: [], selectedCount });
    }
    showView('details', batchId);
    $('job-skip-confirm').hidden = false;
    $('job-skip-accept').focus();
  }
  function offerAbandonResultExport(entry) {
    if (busy || reconnecting || contextRequired || entry?.status !== 'export_pending' ||
        entry.processing_mode !== 'markdown-and-anonymize' || !/^[a-f0-9]{64}$/u.test(entry.batch_id || '')) return;
    pendingResultAbandon = entry.batch_id;
    $('result-abandon-check').checked = false;
    $('result-abandon-accept').disabled = true;
    const total = count(entry.result_count) || count(entry.exported_count) + count(entry.export_pending_count);
    $('result-abandon-counts').textContent = `Lauf ${entry.batch_id.slice(0, 8)} · ${total} technisch erstellte Ergebnisse, ${count(entry.failed_count)} nicht verarbeitete Dateien. ${count(entry.exported_count)} Ergebnisse wurden sichtbar kopiert, ${count(entry.export_pending_count)} fehlen noch. Dies ist keine Freigabe.`;
    $('result-abandon-dialog').showModal();
    $('result-abandon-check').focus();
  }
  async function problems(target, batchId) {
    const ticket = { generation, batchId };
    problemRequests.set(target, ticket);
    const isCurrent = () => !closed && target.isConnected && generation === ticket.generation && problemRequests.get(target) === ticket;
    target.replaceChildren(element('p', 'Dateiliste wird geladen …', 'meta'));
    try {
      const result = await invoke('get_run_failures', { batchId: batchId || null });
      if (!isCurrent()) return;
      if (result?.local_ui_only !== true || result.external_disclosure !== false) throw Error('STANDALONE_FAILURE_DETAILS_INVALID');
      target.replaceChildren();
      const feedback = window.__DATASECURE_PRESENTATION__?.validateConversionFeedback(result.conversion_feedback);
      const omissionCount = feedback?.ocr_omitted_count || (result.files || []).filter(file =>
        file.classification === 'ocr_omission' && ['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(file.reason_code)).length;
      if (omissionCount) target.append(element('p',
        `${omissionCount} ${omissionCount === 1 ? 'Datei' : 'Dateien'} ohne OCR nicht umgewandelt. Das ist eine Folge der gewählten Einstellung, kein technischer Konvertierungsfehler. Nur wenn du diesen Bild- oder Scantext benötigst, die betroffenen Originaldateien für einen neuen Lauf mit OCR auswählen.`, 'run-notice'));
      for (const file of (result.files || []).slice(0, 200)) {
        if (!safeLabel(file.name)) continue;
        const omitted = file.classification === 'ocr_omission' &&
          ['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(file.reason_code);
        const privacyStop = file.classification === 'privacy_stop' &&
          ['AMBIGUITY_REVIEW_REQUIRED', 'RESIDUAL_PII'].includes(file.reason_code);
        const card = element('div', undefined, omitted ? 'notice-card' : 'problem-card'); card.append(element('strong', file.name),
          element('p', omitted ? file.reason_code === 'IMAGE_OCR_REQUIRED' ? 'Ohne OCR nicht umgewandelt · Bilddatei' : 'Ohne OCR nicht umgewandelt · PDF ohne nutzbaren Text'
            : privacyStop ? `Datenschutz-Prüfstopp · ${reasons[file.reason_code]}` :
              reasons[file.reason_code] || 'Die Verarbeitung wurde sicher gestoppt. Die Originaldatei bleibt unverändert.'),
          ...(omitted ? [] : [element('code', /^[A-Z][A-Z0-9_]{1,80}$/u.test(file.reason_code) ? file.reason_code : 'PROCESSING_STOPPED')]));
        const advice = window.__DATASECURE_PRESENTATION__?.failureAdvice(file.reason_code);
        if (advice && !omitted) card.append(element('p', `Nächster Schritt: ${advice}`, 'meta'));
        target.append(card);
      }
      const noticeCount = Number.isSafeInteger(result.content_notice_count) && result.content_notice_count >= 0 && result.content_notice_count <= 200
        ? result.content_notice_count : feedback?.content_notice_count || 0;
      if (result.content_notice_breakdown_complete === false) target.append(element('p',
        'Die Inhaltshinweise sind für diesen gespeicherten Stand nicht vollständig verfügbar. Das ist keine Bestätigung fehlerfreier Texterkennung. Der abgeschlossene Lauf wird dadurch nicht erneut geöffnet.', 'run-notice'));
      if (noticeCount) {
        const details = element('details', undefined, 'content-notices');
        details.append(element('summary', `${noticeCount} erstellte Dateien mit Inhaltshinweisen`),
          element('p', 'Diese Markdown-Dateien wurden erstellt. Hinweise auf ausgelassene Bildinhalte oder nicht bestätigte Vollständigkeit sind keine weiteren fehlgeschlagenen Dateien. Bei Bedarf mit dem Original vergleichen.', 'meta'));
        const descriptions = { SOURCE_COVERAGE_UNVERIFIED: 'Vollständigkeit der Textübernahme nicht unabhängig bestätigt',
          VISUAL_CONTENT_NOT_EXTRACTED: 'Visuelle Inhalte wurden nicht übernommen',
          IMAGE_OCR_DISABLED_BY_POLICY: 'Text in Bildern wurde wegen ausgeschalteter OCR nicht gelesen',
          SCAN_OCR_DISABLED_BY_POLICY: 'Scantext wurde wegen ausgeschalteter OCR nicht gelesen',
          OCR_NOT_VERIFIED: 'Automatisch erkannter Text kann Lesefehler enthalten; nicht jedes Zeichen wurde mit dem Original verglichen',
          OCR_CONTACT_VALUES_UNVERIFIED: 'Erkannte E-Mail-Adressen und Telefonnummern wurden nicht mit dem Original verglichen' };
        for (const file of (result.content_notices || []).slice(0, 200)) if (safeLabel(file.name)) {
          const card = element('div', undefined, 'notice-card');
          card.append(element('strong', file.name), element('p', (file.reason_codes || []).map(code => descriptions[code] || 'Inhaltsvollständigkeit eingeschränkt; Original vergleichen').join('; ') || 'Inhaltsvollständigkeit eingeschränkt; Original vergleichen', 'meta'));
          details.append(card);
        }
        target.append(details);
      }
      for (const file of (result.pending_files || []).slice(0, 200)) if (safeLabel(file.name)) target.append(element('p', `${file.name} – noch nicht gestartet, kein nachgewiesener Dokumentfehler.`, 'meta'));
      if (result.available === false && target.children.length && Number.isSafeInteger(result.total) && result.total > result.files.length)
        target.append(element('p', `Für ${result.total - result.files.length} weitere Dateien sind die lokalen Dateidetails nicht mehr verfügbar. Keine vollständige Fehlerliste ableitbar.`, 'meta'));
      if (!target.children.length) target.append(element('p', 'Keine Dateidetails mehr verfügbar. Die technischen Protokolle enthalten bewusst keine Originalnamen.', 'meta'));
    } catch { if (!isCurrent()) return; target.replaceChildren(element('p', 'Die Dateiliste konnte nicht geladen werden. Der Lauf wird nicht erneut gestartet.', 'meta'),
      button('Dateiliste erneut laden', () => problems(target, batchId))); }
  }
  function acknowledgeRenderedNotice(state, intakeFailure = false) {
    const presentationGeneration = state.presentation_generation, owner = job, connection = connectionEpoch;
    if (!Number.isSafeInteger(presentationGeneration) || presentationGeneration < 1 || acknowledged === presentationGeneration) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // A render scheduled in another view, superseded attempt, connection or
      // journal state proves no visible receipt. ACK carries no action rights.
      if (closed || connection !== connectionEpoch || job !== owner || view !== 'details' ||
          runDetails?.batchId !== owner?.batchId || $('job').hidden || $('details-view').hidden ||
          current?.presentation_generation !== presentationGeneration || acknowledged === presentationGeneration ||
          (intakeFailure ? current?.state !== 'start_failed' || current?.intake_failure?.intake_id !== owner.batchId ||
            current?.intake_failure?.error_code !== 'STANDALONE_START_FAILED' : current?.batch_id !== owner.batchId)) return;
      acknowledged = presentationGeneration;
      invoke('ack_terminal_presented', { presentationGeneration }).then(result => {
        if (result?.acknowledged !== true && acknowledged === presentationGeneration) acknowledged = null;
      }).catch(() => { if (acknowledged === presentationGeneration) acknowledged = null; });
    }));
  }

  function renderJob(state, announcementView = view) {
    if (!job) return;
    if (state.batch_id !== job.batchId || !['preparing', 'processing'].includes(state.state)) workingActionSignature = null;
    reconcileFeedback(state);
    refreshRunGuide();
    // Only replace focus that this render actually removes. Background updates
    // must never move the user out of navigation, a dialog or another panel.
    const focusedAction = view === 'details' && runDetails?.batchId === job?.batchId && document.activeElement?.id?.startsWith('job-action-')
      ? document.activeElement.id : null;
    const restoreActionFocus = () => { if (focusedAction) ($(focusedAction) || $('job-title')).focus(); };
    const action = (id, label, handler, primary = false) => {
      const node = button(label, handler, primary); node.id = `job-action-${id}`; return node;
    };
    const reviewProjection = boundRunReview(state);
    if (state.state === 'start_failed' && state.intake_failure?.intake_id === job.batchId &&
        state.intake_failure?.error_code === 'STANDALONE_START_FAILED') {
      // This card belongs to the started intake, not to a fabricated journal,
      // document failure list, completion receipt or resumable history entry.
      const signature = JSON.stringify(['intake_failure', job.batchId, state.intake_failure]);
      if (signature === lastJobSignature) { acknowledgeRenderedNotice(state, true); return; }
      lastJobSignature = signature;
      $('job-icon').textContent = '!'; $('job-icon').className = 'status-icon';
      $('job-status').className = 'job-status';
      $('job-title').textContent = 'Lokaler Start nicht bestätigt';
      $('job-description').className = 'run-notice';
      $('job-description').textContent = 'Die lokale Vorbereitung konnte nicht sicher abgeschlossen werden. Für diesen Start liegt kein bestätigter gespeicherter Lauf vor. Die Dateien werden nicht automatisch erneut gestartet.' +
        (state.intake_failure.worker_active === true ? ' Das Ende des lokalen Prozesses ist noch nicht bestätigt. Bitte warten.'
          : ' Für einen neuen Versuch die Dateien ausdrücklich neu auswählen.');
      $('job-progress').hidden = true; $('job-current').textContent = '';
      $('job-actions').replaceChildren(...(state.intake_failure.worker_active === true ? [] : [action('new', 'Neue Verarbeitung', newJob)]));
      $('job-secondary-actions').replaceChildren(); $('job-more').hidden = true; $('file-problems').hidden = true;
      const announcement = `intake-failure:${job.batchId}:${state.intake_failure.worker_active === true}`;
      if (announcement !== lastJobAnnouncement) {
        lastJobAnnouncement = announcement; lastJobAnnouncementTerminal = false;
        $('job-announcement').textContent = $('job-title').textContent + '. ' + $('job-description').textContent;
      }
      restoreActionFocus(); acknowledgeRenderedNotice(state, true); return;
    }
    if (state.state === 'ready') {
      // Service readiness is not a completion receipt for a retained old job.
      // Do not silently call newJob(): it would cancel an admitted selection.
      lastJobSignature = ''; lastJobAnnouncement = ''; lastJobAnnouncementTerminal = false;
      $('job-icon').textContent = '·'; $('job-icon').className = 'status-icon';
      $('job-status').className = 'job-status';
      $('job-title').textContent = 'Kein aktiver Lauf';
      $('job-description').className = 'muted';
      $('job-description').textContent = 'DataSecure ist bereit. Den gespeicherten Abschluss oder offene Schritte eines früheren Laufs im Verlauf ansehen.';
      $('job-progress').hidden = true; $('job-current').textContent = '';
      $('job-actions').replaceChildren(action('history', 'Verlauf öffnen', () => showView('history'), true),
        action('new', 'Neue Verarbeitung', newJob));
      $('job-secondary-actions').replaceChildren(); $('job-more').hidden = true;
      $('file-problems').hidden = true;
      $('job-announcement').textContent = 'Kein aktiver Lauf. Den früheren Laufstatus im Verlauf ansehen.';
      restoreActionFocus(); return;
    }
    if (state.batch_id !== job.batchId) {
      lastJobSignature = ''; lastJobAnnouncement = ''; lastJobAnnouncementTerminal = false;
      $('job-icon').textContent = '…'; $('job-icon').className = 'status-icon';
      $('job-status').className = 'job-status';
      $('job-progress').hidden = true; $('job-current').textContent = '';
      $('job-description').className = 'muted';
      $('job-title').textContent = 'Laufstatus wird abgeglichen';
      $('job-description').textContent = 'Der angezeigte Status gehört nicht bestätigt zu diesem Lauf. Bitte den Verlauf aktualisieren.';
      $('job-announcement').textContent = 'Laufstatus wird abgeglichen. ' + $('job-description').textContent;
      $('job-actions').replaceChildren(action('history', 'Verlauf öffnen', () => showView('history')));
      $('job-secondary-actions').replaceChildren(); $('job-more').hidden = true;
      restoreActionFocus();
      $('file-problems').hidden = true; return;
    }
    const terminalAnnouncement = terminalAnnouncementStates.has(state.state);
    // Preserve the first genuine completion/failure of a background job. Only
    // later replays or display-snapshot changes need the visible owned card.
    const announceJob = !terminalAnnouncement || ownJobCardVisible(announcementView) || !announcedTerminalPhases.has(state.state);
    if (!announceJob) clearHiddenTerminalAnnouncement(announcementView, terminalAnnouncement);
    // A retained terminal card can be rendered while hidden. Returning to that
    // exact card still needs one announcement, even when its DTO is unchanged.
    const signature = JSON.stringify([state, reviewProjection, terminalAnnouncement ? announceJob : null]);
    if (signature === lastJobSignature) { acknowledgeRenderedNotice(state); return; }
    lastJobSignature = signature;
    $('job-progress').hidden = false;
    const working = ['preparing', 'processing'].includes(state.state);
    const rawResults = state.processing_mode === 'markdown-only', anonymousResults = state.processing_mode === 'markdown-and-anonymize';
    const summary = window.__DATASECURE_PRESENTATION__?.conversionSummary(state);
    const completedAnonymous = anonymousResults && state.state === 'results_available';
    const contentNotices = window.__DATASECURE_PRESENTATION__?.contentNoticeSummary(state);
    const anonymousAttention = state.failed_count || state.warning_count || contentNotices?.attention;
    const fastRun = completedAnonymous && state.review_policy === 'automatic-conservative';
    // Success is positive evidence for a terminal outcome, never the fallback
    // for an unknown state, a deferred decision or an incomplete delivery.
    $('job-icon').textContent = working ? '⚙' : completedAnonymous ? anonymousAttention ? '✓ !' : '✓'
      : summary ? summary.error_count ? '!' : summary.ocr_omitted_count || summary.content_notice_count ? '✓ !' : '✓'
      : state.state === 'paused' ? 'Ⅱ' : '!';
    $('job-icon').className = `status-icon${working ? ' working' : ''}`;
    $('job-status').className = `job-status${completedAnonymous || summary && !summary.error_count ? ' success' : ''}`;
    $('job-title').textContent = summary?.heading || (state.state === 'results_available'
      ? rawResults ? 'Textübernahme abgeschlossen' : anonymousResults ? anonymousAttention
        ? 'Anonymisierungslauf abgeschlossen mit Hinweisen' : 'Anonymisierungslauf abgeschlossen' : 'Verarbeitungszweck nicht bestätigt'
      : states[state.state] || 'Status wird geprüft');
    const total = count(state.selected_count) || job.selectedCount, done = count(state.completed_count), failed = count(state.failed_count), reviews = count(state.review_count);
    $('job-description').className = reviewProjection?.not_processed_count ? 'run-notice' : 'muted';
    $('job-description').textContent = summary?.description || (state.state === 'review_required' ? state.processing_mode === 'markdown-only'
      ? `${reviews} Datei${reviews === 1 ? ' wartet' : 'en warten'} auf deine Entscheidung. Du kannst erkannte E-Mail-Adressen und Telefonnummern mit dem Originalbild vergleichen oder ohne diese zusätzliche Prüfung fortfahren. Die Werte sind beim Fortfahren nicht als richtig bestätigt; OCR-Lesefehler bleiben möglich. Danach läuft die Markdown-Umwandlung weiter.`
      : `${reviews} Datei${reviews === 1 ? ' benötigt' : 'en benötigen'} eine lokale Entscheidung. Jetzt prüfen oder später fortsetzen.`
      : working ? state.pause_requested ? 'Pause angefordert. Die aktuelle Datei einschließlich Bereitstellung und Zuordnung wird fertiggestellt; danach beginnt keine weitere Datei.' : `${done} von ${total} Dateien abgeschlossen. Bitte warten; die Verarbeitung bleibt lokal.`
      : state.state === 'results_available' ? `${count(state.result_count)} ${rawResults ? 'Markdown-Ergebnisse (nicht anonymisiert)' : anonymousResults ? 'technisch geprüfte anonymisierte Ergebnisse' : 'Ergebnisse mit unbestätigtem Verarbeitungszweck'} verfügbar.${failed && reviewProjection?.not_processed_count !== failed ? ` ${failed} Datei${failed === 1 ? '' : 'en'} mit Problemen.` : ''}`
      : state.state === 'stopped' ? 'Der lokale Zwischenstand ist gespeichert. Fortsetzen verarbeitet nur noch offene Schritte.'
      : state.state === 'paused' ? 'Der Lauf ist pausiert. Fortsetzen verarbeitet nur offene Dateien. Die privaten Arbeitskopien unterliegen weiterhin der eingestellten Aufbewahrung.'
      : state.state === 'export_pending' ? 'Die sichtbare Bereitstellung der Ergebnisse ist noch nicht bestätigt. Im Verlauf kannst du den gespeicherten Stand prüfen und fehlende Ergebnisdateien ausdrücklich bereitstellen lassen. Dabei wird kein Export erstellt; bereits vorhandene Dateien bleiben erhalten.'
      : state.state === 'export_abandoned' ? 'Die automatische Bereitstellung wurde für diesen Lauf aufgegeben. Teilkopien bleiben unverändert; es gibt keine vollständige Ergebnisfreigabe.'
      : 'Der aktuelle Status bleibt diesem Lauf zugeordnet.');
    if (completedAnonymous && reviewProjection) $('job-description').textContent += ' ' + reviewProjection.next;
    else if (completedAnonymous) $('job-description').textContent += fastRun
      ? ' Schnellweg: Die Erstfreigabe erfolgt automatisch, nicht manuell. Den aktuellen Freigabestand bei den Ergebnissen öffnen; Änderungen oder ein Widerruf können Freigaben aufgehoben haben. Ein Export wird nur auf deinen Auftrag erstellt.'
      : ' Der Lauf verarbeitet keine weiteren Dateien. Den aktuellen Freigabe- und Exportstand bei den Ergebnissen prüfen.';
    if (completedAnonymous && !reviewProjection && contentNotices?.description) $('job-description').textContent += ` ${contentNotices.description}`;
    $('job-progress').max = Math.max(1, total); if (state.state === 'preparing') $('job-progress').removeAttribute('value');
    else $('job-progress').value = Math.min(total, done);
    $('job-current').textContent = safeLabel(state.current_file) ? state.current_file : '';
    // Stable live region: announce meaningful phase changes and the first
    // failure, not every filename/count update. No synthetic percentage.
    const announcement = `${job.batchId}:${state.state}:${Boolean(state.pause_requested)}:${Boolean(failed)}${working ? '' : `:${done}:${failed}:${reviews}:${count(state.result_count)}:${contentNotices?.count}:${contentNotices?.complete}:${JSON.stringify(reviewProjection)}`}`;
    if (announceJob && announcement !== lastJobAnnouncement) {
      lastJobAnnouncement = announcement; lastJobAnnouncementTerminal = terminalAnnouncement;
      if (terminalAnnouncement) announcedTerminalPhases.add(state.state);
      $('job-announcement').textContent = `${$('job-title').textContent}. ${working && !state.pause_requested
        ? `Die Verarbeitung bleibt lokal.${failed ? ' Dateien mit Hinweisen sind im Lauf aufgeführt.' : ''}`
        : $('job-description').textContent}`;
    }
    // Progress/count/filename updates do not change the available commands.
    // Preserve those actual buttons (and focus) while this owned working phase
    // remains the same; real phase/pause/connection changes still rebuild them.
    const nextWorkingActions = working ? JSON.stringify([job.batchId, connectionEpoch, state.state,
      state.processing_mode, Boolean(state.pause_requested)]) : null;
    if (!working || workingActionSignature !== nextWorkingActions) {
    workingActionSignature = nextWorkingActions;
    const actions = $('job-actions'); actions.replaceChildren();
    const secondary = $('job-secondary-actions'); secondary.replaceChildren();
    if (state.state === 'processing' && !state.pause_requested) actions.append(action('pause', 'Pausieren', async () => {
      if (await perform('pause_batch', { batchId: job.batchId })) { lastJobSignature = ''; await refresh(); }
    }));
    if (state.state === 'review_required') actions.append(action('review', state.processing_mode === 'markdown-only' ? 'Erkannte E-Mails und Telefonnummern vergleichen' : 'Jetzt prüfen', () => beginReview(job.batchId), true));
    // A detected candidate is not yet a ready review session. During active
    // processing the worker can still be preparing more files, so neither
    // confirming nor declining that review is an actionable choice yet.
    if (state.processing_mode === 'markdown-only' && state.state === 'review_required')
      actions.append(action('skip-ocr', 'Ohne diesen Vergleich fortfahren', () => offerSkipOcrContactReview(job.batchId)));
    if (['stopped', 'paused'].includes(state.state)) actions.append(action('resume', 'Verarbeitung fortsetzen', async () => { if (await perform('continue_current_batch')) { lastJobSignature = ''; await refresh(); } }, true));
    if (state.state === 'export_pending') actions.append(action('history', 'Bereitstellung im Verlauf prüfen', () => showView('history'), true));
    if (state.state === 'results_available' && state.results_available && !working) actions.append(action('results', 'Ergebnisordner öffnen', () => perform('open_history_results', { batchId: job.batchId }), rawResults && !(summary ? summary.error_count : failed)));
    if (state.state === 'results_available' && state.results_available && !working) (anonymousResults ? actions : secondary).append(action('documents', rawResults ? 'Markdown nachkorrigieren (optional)' : anonymousResults ? reviewProjection?.phase === 'exported' ? 'Prüfung öffnen (optional)' : reviewProjection?.phase === 'approved' ? 'Freigaben / Exportvorschau' : reviewProjection?.phase === 'export_pending' ? 'Export abgleichen' : 'Dokumente prüfen / Export' : 'Prüfstände ansehen', () => openDocuments(job.batchId), anonymousResults && reviewProjection?.phase !== 'exported'));
    if (state.state === 'export_pending' && anonymousResults) secondary.append(action('abandon-export', 'Bereitstellung aufgeben …', () =>
      offerAbandonResultExport({ batch_id: job.batchId, status: state.state, processing_mode: state.processing_mode,
        result_count: state.result_count, failed_count: state.failed_count,
        exported_count: state.exported_count, export_pending_count: state.export_pending_count })));
    if (!working) actions.append(action('new', 'Neue Verarbeitung', newJob));
    if (state.state !== 'export_pending') secondary.append(action('history', 'Im Verlauf ansehen', () => showView('history')));
    $('job-more').hidden = !secondary.children.length;
    restoreActionFocus();
    }
    $('file-problems').hidden = !failed && !summary?.content_notice_count && !(completedAnonymous && contentNotices?.attention) && state.state !== 'stopped';
    $('file-problems-summary').textContent = summary
      ? `Hinweise zu diesem Lauf · ${summary.ocr_omitted_count} ohne OCR nicht umgewandelt · ${summary.content_notice_count} Inhaltshinweise${summary.error_count ? ` · ${summary.error_count} technische Fehler` : ''}`
      : completedAnonymous && contentNotices?.attention
        ? `Hinweise zu diesem Lauf · ${contentNotices.count} erstellte Dateien mit Inhaltshinweisen${contentNotices.complete ? '' : ' · Hinweisstatus unvollständig'}`
        : `Dateien mit Hinweisen${failed ? ` (${failed})` : ''}`;
    const key = `${job.batchId}:${failed}:${state.state}:${summary?.content_notice_count || 0}:${contentNotices?.count}:${contentNotices?.complete}`;
    if (!$('file-problems').hidden && problemSignature !== key) { problemSignature = key; problems($('problem-list'), job.batchId); }
    acknowledgeRenderedNotice(state);
  }
  function historySummary(container, entry, updateAction, hasMainLoader = false) {
    const raw = entry.processing_mode === 'markdown-only';
    const reloadLabel = raw ? 'Kopierstatus aktualisieren' : 'Prüfstatus erneut laden';
    const statusName = raw ? 'Kopierstatus' : 'Prüfstatus';
    const status = element('p', raw
      ? 'Optionale Nachkorrekturen und Kopien werden bei Bedarf abgeglichen.' : 'Freigaben und Exportbelege werden bei Bedarf neu abgeglichen.', 'history-meta');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const contents = element('div');
    let pendingRead = null, loadedRead = null, reloadAfterPending = null;
    const currentRead = owner => owner && owner.epoch === historySummaryEpoch && owner.connection === connectionEpoch &&
      owner.generation === generation && historySummaryRequests.get(container) === owner.token;
    const load = async () => {
      if (busy || closed || !(view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id)) return;
      if (currentRead(pendingRead)) return;
      // Closing retires the visible owner, not the physical serialized read.
      // A quick Markdown-details reopen waits for that read to settle before
      // acquiring fresh proof instead of queueing a duplicate IPC operation.
      if (raw && pendingRead) {
        reloadAfterPending = pendingRead;
        setControlDisabled(reload, true); container.setAttribute('aria-busy', 'true');
        status.textContent = 'Der vorherige Kopierstatusabgleich wird noch beendet. Danach wird der aktuelle Kopierstatus geladen …';
        return;
      }
      const epoch = historySummaryEpoch, connection = connectionEpoch, requestGeneration = generation, token = {};
      const owner = { epoch, connection, generation: requestGeneration, token };
      pendingRead = owner; loadedRead = null;
      historySummaryRequests.set(container, token); setControlDisabled(reload, true); contents.replaceChildren();
      reload.hidden = updateAction({ loading: true }) === true;
      status.textContent = raw ? 'Gespeicherter Kopierstatus wird aktualisiert …'
        : 'Gespeicherte Freigaben und Exportbelege werden abgeglichen …';
      container.setAttribute('aria-busy', 'true');
      // Summary reads share the serialized Core channel with status polls on
      // both Windows and macOS. A healthy long read must not produce a false
      // connection timeout in a background poll.
      const ownershipEpoch = historySummaryOwnershipEpoch;
      historySummaryReads++; historySummaryReadGeneration++;
      const active = () => !closed && (view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id) && epoch === historySummaryEpoch &&
        connection === connectionEpoch && !reconnecting && !contextRequired &&
        container.isConnected && !container.hidden && historySummaryRequests.get(container) === token;
      try {
        const data = await invoke('get_document_review_history_summary', { batchId: entry.batch_id });
        if (!active()) return;
        if (busy || requestGeneration !== generation) throw Error('STANDALONE_BUSY');
        if (data.ok !== true || data.local_ui_only !== true || data.external_disclosure !== false || typeof data.available !== 'boolean')
          throw Error('DOCUMENT_REVIEW_INVALID');
        if (!data.available) {
          status.textContent = entry.processing_mode === 'markdown-only'
            ? 'Für diesen älteren Lauf ist keine nachträgliche Textkorrektur verfügbar. Vorhandene Ergebnisdateien bleiben davon unberührt.'
            : 'Für diesen älteren Lauf wurde kein nachträglicher Dokumentprüfstand erfasst. Keine menschliche Freigabe ableitbar.';
          reload.hidden = updateAction(data) === true;
          loadedRead = owner;
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
        if (data.review_policy !== undefined && (data.review_policy !== 'automatic-conservative' ||
            data.processing_mode !== 'markdown-and-anonymize' || !Number.isSafeInteger(data.automatically_approved_count) ||
            data.automatically_approved_count < 0 || data.automatically_approved_count > data.approved_count))
          throw Error('DOCUMENT_REVIEW_INVALID');
        const raw = data.processing_mode === 'markdown-only';
        contents.append(element('p', raw
          ? `Optionale Kopien: ${data.approved_count} von ${data.reviewable_count} verfügbaren Dokumentständen zum Kopieren bestätigt. Die ursprünglichen Markdown-Ergebnisse sind bereits erstellt; dafür ist keine Freigabe erforderlich.`
          : `Dokumentprüfung: ${data.approved_count} von ${data.reviewable_count} verfügbaren Dokumentständen freigegeben. Du kannst sie später erneut prüfen; eine Änderung hebt die betroffene Freigabe auf.`, 'history-meta'));
        if (data.review_policy) contents.append(element('p',
          `Schnellweg: ${data.automatically_approved_count} aktuelle Dokumentstände automatisch freigegeben, nicht manuell geprüft. Nachträgliche Änderungen benötigen eine neue Freigabe; der Export erfolgt nur auf deinen Auftrag.`, 'history-meta'));
        if (data.unavailable_count) contents.append(element('p', `${data.unavailable_count} Dokumentprüfstände nicht verfügbar. Betroffene Dateien in „${raw ? 'Markdown nachkorrigieren' : 'Dokumente prüfen / Export'}“ ansehen.`, 'history-meta'));
        if (data.unclassified_source_count) contents.append(element('p', `${data.unclassified_source_count} Quelldateien mit unklarem früheren Ergebnisstatus. Die vollständige Freigabe dieses Laufs ist nicht belegbar. Dateinamen in der Dokumentansicht ansehen.`, 'history-meta'));
        if (rejectedCount) contents.append(element('p', raw
          ? `${rejectedCount} Quelldateien nicht umgewandelt. Gründe und Namen unter den Hinweisen dieses Laufs ansehen.`
          : `${rejectedCount} Quelldateien wurden nicht verarbeitet. Dateinamen und Gründe in der Dokumentansicht ansehen; sie sind nicht freigegeben oder exportiert.`, 'history-meta'));
        contents.append(element('p', raw
          ? `${data.recorded_export_count} zusätzliche Markdown-Kopien gespeichert · nicht anonymisiert. Das zählt nicht die bereits erstellten Dateien im Ergebnisordner.`
          : `Export: ${data.recorded_export_count ? data.recorded_export_count === 1 ? '1 abgeschlossener Export mit Beleg' : `${data.recorded_export_count} abgeschlossene Exporte mit Beleg` : 'noch kein abgeschlossener Export belegt'}. Frühere Exporte sind keine Freigabe des heutigen Stands.`, 'history-meta'));
        if (!raw) contents.append(element('p', `${data.current_exported_count} von ${data.reviewable_count} aktuellen Dokumentständen in gespeicherten Abschlussbelegen erfasst. Die exportierten Dateien werden erst beim Öffnen erneut geprüft.`, 'history-meta'));
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
        status.textContent = raw ? data.pending_export_count
          ? 'Eine zusätzliche Markdown-Kopie hat noch eine offene Bestätigung. In der Nachkorrektur abgleichen, nicht erneut kopieren. Die ursprünglichen Ergebnisdateien bleiben erhalten.'
          : 'Optionale Nachkorrekturen und zusätzliche Kopien. Für den normalen Markdown-Abschluss ist hier kein weiterer Schritt erforderlich.'
          : 'Verarbeitung beendet. Freigabe und Export werden im normalen Weg gemeinsam bestätigt. Abgeglichene Momentaufnahme: Nach Änderungen erneut laden.';
        reload.hidden = updateAction(data) === true;
        loadedRead = owner;
      } catch (error) {
        if (active()) {
          const code = errorCode(error), reason = { DOCUMENT_REVIEW_POLICY_CHANGED: 'Dieser Prüfstand gehört zu einem älteren, nicht übernehmbaren Prüfvertrag.',
            DOCUMENT_REVIEW_INVALID: 'Die gespeicherten Prüfbelege sind nicht konsistent lesbar.',
            STANDALONE_BUSY: 'Ein anderer lokaler Vorgang ist aktiv.' }[code] || reasons[code] || 'Der lokale Abgleich ist fehlgeschlagen.';
          contents.replaceChildren(); status.textContent = `${statusName} nicht verfügbar. ${reason} (${code}) ${raw ? 'Erneut aktualisieren' : 'Erneut laden'}; die Verarbeitung und frühere Kopien bleiben unverändert.`;
          reload.hidden = updateAction(null) === true;
        }
      } finally {
        if (pendingRead === owner) pendingRead = null;
        if (ownershipEpoch === historySummaryOwnershipEpoch) {
          historySummaryReads--;
          if (!historySummaryReads && !closed) schedule(300);
        }
        if (container.isConnected && historySummaryRequests.get(container) === token) {
          setControlDisabled(reload, false); reload.textContent = reloadLabel; container.removeAttribute('aria-busy');
          if (epoch !== historySummaryEpoch || !(view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id)) {
            contents.replaceChildren();
            status.textContent = `${statusName} nach Ansichtswechsel nicht bestätigt. Bitte ${raw ? 'erneut aktualisieren' : 'erneut laden'}.`;
            reload.hidden = false;
          }
        }
        if (reloadAfterPending === owner) {
          reloadAfterPending = null;
          setControlDisabled(reload, false); container.removeAttribute('aria-busy');
          if (container.isConnected && !container.hidden && !reconnecting && !contextRequired) {
            if (busy) reset('Kopierstatus nach einem anderen lokalen Vorgang nicht bestätigt. Bitte erneut aktualisieren.');
            else loadIfNeeded();
          }
        }
      }
    };
    const reload = button(raw ? reloadLabel : 'Prüfstatus laden', load);
    reload.id = `history-${entry.batch_id}-summary-reload`;
    reload.hidden = hasMainLoader;
    container.append(status, contents, reload);
    const reset = (message, waitForPending = false) => {
      if (!waitForPending) pendingRead = null;
      loadedRead = null; reloadAfterPending = null;
      historySummaryRequests.delete(container); setControlDisabled(reload, false); container.removeAttribute('aria-busy');
      if (raw) reload.textContent = reloadLabel;
      contents.replaceChildren(); status.textContent = message;
      reload.hidden = updateAction(null) === true;
    };
    const cancel = () => reset(raw ? 'Kopierstatus geschlossen. Bei Bedarf erneut aktualisieren.'
      : 'Abgleich geschlossen. Bei Bedarf den Prüfstatus neu laden.', raw);
    historySummaryRetirements.add(() => {
      if (container.isConnected) reset(`${statusName} nach Verbindungswechsel nicht bestätigt. Bitte ${raw ? 'erneut aktualisieren' : 'erneut laden'}.`);
    });
    const loadIfNeeded = () => currentRead(loadedRead) ? undefined : load();
    return { load, loadIfNeeded, cancel };
  }
  function historyUnavailable(message) {
    // Old rows still contain clickable actions bound to an unconfirmed
    // connection. Never leave them looking usable while the sidecar is gone.
    historySignature = ''; historySummaryEpoch++; clearRunReview();
    historySummaryRetirements.clear();
    $('history-list').replaceChildren();
    $('run-history-detail').replaceChildren(element('p', message, 'notice'));
    $('open-count').hidden = true;
    $('history-status').textContent = message;
  }
  async function refreshHistory(quiet = false, recoverBatchId = null, detailsBatchId = null) {
    if (bootstrapFailure) { historyUnavailable('Der lokale Core ist nicht bereit. Bitte die angezeigte Startursache und die Diagnose prüfen.'); renderBootstrapFailure(); return; }
    if (historyRecoveryBusy) return;
    if (historySummaryReads) {
      if (detailsBatchId && view === 'details' && runDetails?.batchId === detailsBatchId) {
        $('run-history-detail').replaceChildren(element('p', 'Laufdetails werden geladen, sobald der laufende Statusabgleich beendet ist …', 'notice'));
      }
      if (!quiet) $('history-status').textContent = 'Ein gespeicherter Prüfstatus wird gerade abgeglichen. Danach den Verlauf erneut laden; es wird kein Lauf gestartet.';
      return;
    }
    const recovering = recoverBatchId !== null;
    if (recovering && (busy || reconnecting || contextRequired)) return;
    if (recovering) historyRecoveryBusy = true;
    const ownership = recovering ? beginBusy() : null;
    const request = ++historyGeneration;
    const route = detailsBatchId ? runDetails : null, connection = connectionEpoch;
    const reopenedSummaries = [];
    if (!quiet) $('history-status').textContent = recovering ? 'Die Bereitstellung dieses Laufs wird geprüft. Bitte warten …' : 'Lokaler Verlauf wird geladen …';
    try {
      const historyArgs = { ...(recoverBatchId ? { recoverExports: true, recoverBatchId } : {}),
        ...(detailsBatchId && !recoverBatchId ? { batchId: detailsBatchId } : {}),
        ...(includeHiddenHistory && !detailsBatchId ? { includeHidden: true } : {}) };
      const data = await invoke('get_run_history', Object.keys(historyArgs).length ? historyArgs : undefined);
      if (closed || request !== historyGeneration || connection !== connectionEpoch ||
          detailsBatchId && (view !== 'details' || runDetails !== route)) return;
      if (data.local_ui_only !== true || data.external_disclosure !== false || !Array.isArray(data.entries)) throw Error('STANDALONE_HISTORY_INVALID');
      if (recovering) recoveryFeedback(data.export_recovery, recoverBatchId);
      $('history-status').textContent = data.entries.length ? 'Die letzten 5 Verarbeitungen · neueste zuerst' : 'Keine Verarbeitungen in den letzten 5 Verlaufseinträgen sichtbar.';
      if (data.history_degraded === true) $('history-status').textContent += ' Einige alte Dateistände sind momentan nicht bestätigbar. Die übrigen Laufdaten bleiben sichtbar; es werden keine fehlenden Dateien automatisch neu angelegt.';
      const signature = JSON.stringify([data.entries, job?.batchId || null, reconnecting, contextRequired, detailsBatchId, includeHiddenHistory]);
      // Polling must not replace focused controls or expanded file details
      // when the history did not change. Changes retain their explicit state.
      if (signature === historySignature) return;
      clearRunReview();
      const focused = document.activeElement?.id;
      const list = $(detailsBatchId ? 'run-history-detail' : 'history-list');
      // One rendered ownership tree: no duplicate per-run IDs or detached
      // summary buttons that can act on another selected run.
      historySummaryRetirements.clear();
      $('history-list').replaceChildren(); $('run-history-detail').replaceChildren();
      const open = Number.isSafeInteger(data.open_count) && data.open_count >= 0 ? data.open_count
        : data.entries.filter(entry => entry.resumable || ['processing', 'export_pending'].includes(entry.status)).length;
      $('open-count').textContent = `${open} offen`; $('open-count').hidden = !open;
      $('history-visibility-status').textContent = (Number.isSafeInteger(data.hidden_count) && data.hidden_count > 0
        ? `${data.hidden_count} abgeschlossene Läufe ausgeblendet. ` : '') +
        'Der Verlauf berücksichtigt nur die letzten 5 Läufe. Ältere Läufe rücken beim Ausblenden nicht nach. Dateien und gespeicherte Entscheidungen bleiben erhalten.';
      const targetedSummary = requestedHistorySummaryBatchId;
      for (const entry of data.entries.slice(0, 5)) {
        if (!/^[a-f0-9]{64}$/u.test(entry.batch_id)) continue;
        if (detailsBatchId && entry.batch_id !== detailsBatchId) continue;
        if (!detailsBatchId && entry.hidden === true && !includeHiddenHistory) continue;
        reconcileFeedback(entry);
        const row = element('article', undefined, 'history-row'), detail = element('div');
        const conversion = window.__DATASECURE_PRESENTATION__?.conversionSummary(entry);
        const date = new Date(entry.created_at), dateLabel = Number.isNaN(date.getTime()) ? 'Datum unbekannt' : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
        const raw = entry.processing_mode === 'markdown-only', anonymous = entry.processing_mode === 'markdown-and-anonymize';
        const contentNotices = window.__DATASECURE_PRESENTATION__?.contentNoticeSummary(entry);
        const failedFiles = count(entry.failed_count);
        // The durable history summary outlives the journal that supplies the
        // optional reason breakdown. Missing reasons must not become invented
        // technical errors after journal retention.
        const hasReasonBreakdown = entry.failure_reason_breakdown_complete === true ||
          entry.expected_ocr_omission_count > 0 || entry.privacy_stop_count > 0;
        const reasonBreakdownValid = hasReasonBreakdown &&
          [entry.expected_ocr_omission_count, entry.privacy_stop_count].every(value =>
            value === undefined || Number.isSafeInteger(value) && value >= 0 && value <= failedFiles) &&
          count(entry.expected_ocr_omission_count) + count(entry.privacy_stop_count) <= failedFiles;
        const expectedOcr = anonymous && reasonBreakdownValid ? count(entry.expected_ocr_omission_count) : 0;
        const privacyStops = anonymous && reasonBreakdownValid ? count(entry.privacy_stop_count) : 0;
        const technicalProblems = anonymous && reasonBreakdownValid ? failedFiles - expectedOcr - privacyStops : 0;
        const unknownStops = anonymous && !reasonBreakdownValid ? failedFiles : 0;
        const stateLabel = element('p', conversion?.heading || (entry.status === 'results_available' ? entry.processing_mode === 'markdown-only'
          ? 'Textübernahme abgeschlossen · nicht anonymisiert' : anonymous ? 'Verarbeitung beendet · Freigabe- und Exportstand nicht abgeglichen' : 'Technisch verarbeitet · Verarbeitungszweck nicht bestätigt'
          : states[entry.status] || 'Nicht verfügbar'), 'history-meta');
        stateLabel.id = `history-${entry.batch_id}-state`;
        detail.append(element('p', `${raw ? 'Markdown-Konvertierung' : anonymous ? 'Anonymisierung' : 'Verarbeitungszweck nicht bestätigt'} · ${dateLabel}`, 'history-title'),
          element('p', conversion?.counts || (anonymous && reasonBreakdownValid
            ? `${count(entry.selected_count)} Dateien · ${count(entry.result_count)} Ergebnisse · ${expectedOcr} ohne OCR nicht umgewandelt${privacyStops ? ` · ${privacyStops} aus Datenschutzgründen angehalten` : ''} · ${technicalProblems} technische Fehler`
            : anonymous && unknownStops
              ? `${count(entry.selected_count)} Dateien · ${count(entry.result_count)} Ergebnisse · ${unknownStops} nicht verarbeitet (Gründe im Verlauf nicht mehr klassifiziert)`
            : `${count(entry.selected_count)} Dateien · ${count(entry.result_count)} Ergebnisse · ${count(entry.failed_count)} ${anonymous ? count(entry.failed_count) === 1 ? 'Datei nicht verarbeitet' : 'Dateien nicht verarbeitet' : count(entry.failed_count) === 1 ? 'Problem' : 'Probleme'}`), 'history-meta'),
          stateLabel);
        const titleId = `history-${entry.batch_id}-title`, identityId = `history-${entry.batch_id}-identity`;
        detail.children[0].id = titleId;
        row.setAttribute('aria-labelledby', `${titleId} ${identityId}`);
        if (conversion) {
          detail.append(element('p', conversion.description, 'history-next'));
          if (conversion.content_notice_count) detail.append(element('p',
            `${conversion.content_notice_count} erstellte Dateien mit Inhaltshinweisen. Bei Bedarf Original und Markdown vergleichen.`, 'history-meta'));
          row.dataset.outcome = conversion.error_count && !conversion.result_count ? 'error'
            : conversion.error_count || conversion.ocr_omitted_count || conversion.content_notice_count ? 'partial' : 'complete';
        }
        if (entry.status === 'export_abandoned') detail.append(element('p',
          `${count(entry.exported_count)} Dateien wurden zuvor sichtbar kopiert; ${count(entry.export_pending_count)} fehlende Dateien werden nicht mehr automatisch ergänzt. Teilkopien bleiben unverändert. Keine vollständige Freigabe zur Weitergabe.`, 'history-next'));
        if (entry.status === 'export_pending') detail.append(element('p',
          '„Bereitstellung erneut prüfen“ kann fehlende Ergebnisdateien dieses Laufs lokal ergänzen. Es startet keinen neuen Verarbeitungslauf und erstellt keinen Export.', 'history-next'));
        const runIdentity = element('p', `Lauf ${entry.batch_id.slice(0, 8)}`, 'history-run-id path');
        runIdentity.id = identityId; detail.append(runIdentity);
        const disclosure = element('details', undefined, 'history-disclosure');
        disclosure.id = `history-${entry.batch_id}-disclosure`;
        disclosure.open = Boolean(detailsBatchId);
        const disclosureToggle = element('summary', 'Ausführliche Laufdetails');
        disclosureToggle.id = `history-${entry.batch_id}-disclosure-toggle`;
        disclosure.append(disclosureToggle);
        if (conversion) stateLabel.className = 'history-outcome';
        if (anonymous && entry.status === 'failed' && !entry.resumable) {
          row.dataset.outcome = 'error';
          stateLabel.className = 'history-outcome';
          detail.append(element('p', 'Der Lauf wurde nicht abgeschlossen. Bitte den gespeicherten Status und die Diagnose prüfen; nicht blind erneut starten.', 'history-next'));
        } else if (anonymous && entry.status === 'completed_without_results' && count(entry.result_count) === 0) {
          row.dataset.outcome = technicalProblems ? 'error' : 'partial';
          stateLabel.className = 'history-outcome';
          detail.append(element('p', technicalProblems
            ? 'Keine anonymisierten Ergebnisse verfügbar. Mindestens eine Datei hatte einen technischen Fehler; betroffene Dateien ansehen.'
            : 'Die Verarbeitung ist beendet, aber keine Datei wurde umgewandelt. Hinweise zu den angehaltenen Dateien ansehen.', 'history-next'));
          const completionVerified = !entry.resumable && Number.isSafeInteger(entry.selected_count) &&
            entry.selected_count > 0 && entry.result_count === 0 &&
            Number.isSafeInteger(entry.failed_count) && entry.failed_count === entry.selected_count;
          if (completionVerified) {
            const completion = element('section', undefined, 'history-completion');
            const title = element('div', undefined, 'history-completion-title');
            const mark = element('span', technicalProblems ? '×' : '!',
              technicalProblems ? 'history-completion-error' : 'history-completion-attention');
            mark.setAttribute('aria-hidden', 'true');
            title.append(mark, element('h4', technicalProblems
              ? 'Verarbeitung beendet – keine Ergebnisse, mit Dateifehlern'
              : 'Verarbeitung beendet – keine Ergebnisse erstellt'));
            completion.append(title, element('p',
              `0 von ${count(entry.selected_count)} Dateien wurden als anonymisierte Markdown-Entwürfe erstellt. ` +
              (unknownStops ? 'Die Gründe der nicht verarbeiteten Dateien sind im kompakten Verlauf nicht mehr klassifiziert. '
                : technicalProblems ? 'Mindestens eine Datei hatte einen technischen Fehler. '
                  : 'Die Dateien wurden angehalten oder ohne OCR nicht umgewandelt. ') +
              'Der Lauf verarbeitet keine weiteren Dateien.', 'history-completion-detail'),
              element('p', 'Es gibt keine freizugebenden oder exportierbaren Ergebnisse. Betroffene Dateien prüfen; bei Bedarf einen neuen Lauf mit passenden Einstellungen starten.', 'history-completion-next'));
            detail.append(completion);
          }
        }
        const verifiedTotals = Number.isSafeInteger(entry.selected_count) && entry.selected_count > 0 &&
          Number.isSafeInteger(entry.result_count) && entry.result_count > 0 &&
          Number.isSafeInteger(entry.failed_count) && entry.failed_count >= 0 &&
          entry.result_count + entry.failed_count === entry.selected_count;
        const finished = entry.status === 'results_available' && !entry.resumable &&
          entry.results_available === true && entry.result_location === 'available' && verifiedTotals;
        let finishDetail = null, finishNext = null, historyGuide = null;
        let finishedProcessingText = '';
        const unconfirmedReviewText = 'Die technische Verarbeitung ist fertig. Freigabe- und Exportstand sind noch nicht abgeglichen. „Ausführliche Laufdetails“ öffnen, um die gespeicherten Belege dieses Laufs zu prüfen.';
        if (finished && anonymous) {
          const completion = element('section', undefined, 'history-completion');
          const marks = element('span', undefined, 'history-completion-marks');
          const check = element('span', '✓', 'history-completion-check'); check.setAttribute('aria-hidden', 'true');
          marks.append(check);
          if (count(entry.failed_count) || contentNotices?.attention) {
            const attention = element('span', '!', 'history-completion-attention'); attention.setAttribute('aria-hidden', 'true');
            marks.append(attention);
          }
          const headline = element('h4', technicalProblems
            ? 'Anonymisierungslauf abgeschlossen – mit Dateifehlern'
            : unknownStops ? 'Anonymisierungslauf abgeschlossen – mit ungeklärten Ausnahmen'
              : failedFiles || contentNotices?.attention ? 'Anonymisierungslauf abgeschlossen – mit Hinweisen' : 'Anonymisierungslauf abgeschlossen');
          finishedProcessingText = `${count(entry.result_count)} von ${count(entry.selected_count)} Dateien wurden als anonymisierte Markdown-Entwürfe erstellt. ${expectedOcr ? `${expectedOcr} wurden ohne OCR nicht umgewandelt. ` : ''}${privacyStops ? `${privacyStops} wurden aus Datenschutzgründen angehalten. ` : ''}${technicalProblems ? `${technicalProblems} ${technicalProblems === 1 ? 'Datei hat einen technischen Fehler' : 'Dateien haben technische Fehler'}. ` : ''}${unknownStops ? `${unknownStops} ${unknownStops === 1 ? 'Datei wurde' : 'Dateien wurden'} nicht verarbeitet; die Gründe sind im kompakten Verlauf nicht mehr klassifiziert. ` : ''}Der Lauf verarbeitet keine weiteren Dateien.`;
          if (contentNotices?.description) finishedProcessingText += ` ${contentNotices.description}`;
          finishDetail = element('p', finishedProcessingText, 'history-completion-detail');
          const next = finishNext = element('p', unconfirmedReviewText, 'history-completion-next');
          const title = element('div', undefined, 'history-completion-title'); title.append(marks, headline);
          // The processing outcome is always visible. Only the long
          // explanation and revision-bound approval/copy stages are folded.
          detail.append(title);
          completion.append(finishDetail, next);
          const guideTitle = element('h4'), guideCounts = element('p', '', 'history-meta');
          const guideStages = element('ol', undefined, 'run-stages');
          for (const [suffix, node] of [['title', guideTitle], ['counts', guideCounts], ['next', next], ['stages', guideStages]])
            node.id = `history-${entry.batch_id}-guide-${suffix}`;
          guideStages.setAttribute('aria-label', 'Gespeicherter Ablauf dieses Laufs');
          historyGuide = projection => {
            const baseline = window.__DATASECURE_PRESENTATION__?.projectRun({ ...entry, source: 'processor',
              state: entry.status, completed_count: entry.selected_count });
            if (baseline && !projection) {
              // Technical completion proves neither a missing approval nor a
              // missing export. Only the fresh revision-bound summary may
              // choose the current/done state of these two later stages.
              baseline.heading = 'Freigabe- und Exportstand nicht abgeglichen';
              baseline.stages[2].status = 'pending'; baseline.stages[3].status = 'pending';
            }
            const selected = projection || baseline;
            if (!selected) { guideTitle.textContent = 'Freigabe- und Kopiestand noch unbestätigt'; guideCounts.textContent = ''; guideStages.replaceChildren(); return; }
            guideTitle.textContent = selected.heading; guideCounts.textContent = selected.counts || '';
            renderStageList(guideStages, selected.stages);
          };
          historyGuide(null);
          completion.append(guideTitle, guideCounts, guideStages);
          if (entry.review_policy === 'automatic-conservative') completion.append(element('p',
            'Schnellweg: Die unveränderten erstellten Basisstände werden automatisch freigegeben, nicht manuell geprüft. Den aktuellen Freigabe- und Exportstatus unten bei Bedarf abgleichen. Kein automatischer Export.', 'history-completion-detail'));
          detail.append(completion);
          row.dataset.outcome = count(entry.failed_count) || contentNotices?.attention ? 'partial' : 'complete';
        }
        const actions = element('div', undefined, 'history-actions');
        const action = (key, label, callback, primary = false) => {
          const node = button(label, callback, primary); node.id = `history-${entry.batch_id}-${key}`;
          // Self-reference preserves the current visible label even when a
          // later summary changes the next action. Local run context makes
          // repeated controls unambiguous in UIA/VoiceOver; no paths or content.
          node.setAttribute('aria-labelledby', `${node.id} ${titleId} ${identityId}`);
          return node;
        };
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
        if (missingLocation) {
          stateLabel.textContent = verifiedTotals && entry.status === 'results_available'
            ? 'Verarbeitung abgeschlossen · Ergebnisordner fehlt' : 'Ergebnisordner fehlt';
          detail.append(element('p', 'Der bisherige Ergebnisordner ist nicht mehr vorhanden. Gespeicherte Dokumentprüfstände können unabhängig davon geöffnet werden. Es wird kein Ersatzordner und kein neuer Export automatisch angelegt.', 'history-meta'));
        }
        else if (!working && !entry.resumable && ['unsafe', 'unknown'].includes(entry.result_location))
          stateLabel.textContent = 'Ergebnisordner nicht sicher verfügbar';
        const baseStateLabel = stateLabel.textContent;
        const hasProblems = conversion ? Boolean(conversion.error_count) : Boolean(privacyStops || technicalProblems || unknownStops || count(entry.problem_count) > failedFiles);
        let showProblems = () => {};
        const baseAction = active ? { key: 'activity', label: 'Verarbeitung anzeigen', primary: true,
          run: () => { showView('details', entry.batch_id); $('job-title').focus(); } }
          : entry.resumable ? { key: 'continue', label: entry.status === 'review_required' ? 'Jetzt prüfen' : 'Fortsetzen',
          primary: true, run: () => resumeRun(entry, entry.status === 'review_required') }
          : entry.status === 'export_pending' ? { key: 'delivery', label: 'Bereitstellung erneut prüfen', primary: true,
            run: async () => { deliveryFeedback(entry.batch_id); await refreshHistory(false, entry.batch_id); await refresh(); } }
          : entry.status === 'export_abandoned' ? null
          : !working && hasProblems && !entry.result_count ?
            { key: 'problems-main', label: 'Probleme ansehen', primary: true, run: () => showProblems() }
          : !working && entry.results_available && !['missing', 'unsafe', 'unknown'].includes(entry.result_location)
            ? { key: 'results', label: 'Ergebnisordner öffnen', primary: true,
              run: () => perform('open_history_results', { batchId: entry.batch_id }) }
          : !working && entry.result_count > 0 && anonymous ? { key: 'documents', label: 'Dokumente und Freigaben öffnen', primary: true, run: () => openDocuments(entry.batch_id) }
          : null;
        let mainAction = baseAction;
        const main = baseAction ? action(baseAction.key, baseAction.label, () => mainAction.run(), baseAction.primary) : null;
        if (main) { main.setAttribute('data-history-main', 'true'); actions.append(main); }
        // File opening and private document review are different stable actions.
        // A late summary may improve status, never move or relabel this opener.
        if (baseAction?.key === 'results' && entry.result_count > 0)
          actions.append(action('documents', raw ? 'Nachkorrektur öffnen (optional)' : anonymous ? 'Prüfung öffnen' : 'Prüfstände ansehen', () => openDocuments(entry.batch_id)));
        if (!detailsBatchId) actions.append(action('details', 'Laufdetails', () => {
          showView('details', entry.batch_id); $('details-heading').focus();
        }));
        const extra = element('div', undefined, 'history-extra'); extra.hidden = !expandedHistoryExtras.has(entry.batch_id);
        extra.id = `history-${entry.batch_id}-extra`;
        const more = action('more', 'Weitere Aktionen', () => {
          extra.hidden = !extra.hidden; more.setAttribute('aria-expanded', String(!extra.hidden));
          extra.hidden ? expandedHistoryExtras.delete(entry.batch_id) : expandedHistoryExtras.add(entry.batch_id);
        });
        more.setAttribute('aria-expanded', String(!extra.hidden)); more.setAttribute('aria-controls', extra.id);
        const addExtra = (key, text, callback) => extra.append(action(key, text, callback));
        const visibility = action('visibility', entry.hidden === true ? 'Wieder im Verlauf anzeigen' : 'Aus Verlauf ausblenden', async () => {
          const hidden = entry.hidden !== true;
          const result = await perform('set_run_history_visibility', { batchId: entry.batch_id, hidden });
          if (!result) return;
          if (result.ok !== true || result.batch_id !== entry.batch_id || result.hidden !== hidden ||
              result.local_ui_only !== true || result.external_disclosure !== false) {
            feedback('Die Anzeigeänderung ist nicht bestätigt. Verlauf erneut laden; es wurden keine Laufdateien gelöscht.', true); return;
          }
          historySignature = '';
          await refreshHistory();
          feedback(hidden ? 'Lauf aus dem normalen Verlauf ausgeblendet. Es wurden keine Dateien oder Entscheidungen gelöscht.'
            : 'Lauf wieder im Verlauf sichtbar. Es wurde keine Verarbeitung und kein Export gestartet.');
        });
        visibility.disabled = entry.hidden !== true && (entry.visibility_supported === false || entry.resumable === true || entry.processing === true || entry.completion_pending === true ||
          !['results_available','completed_without_results','export_abandoned'].includes(entry.status) ||
          count(entry.export_pending_count) > 0 || count(entry.pending_export_count) > 0);
        if (visibility.disabled) visibility.title = entry.visibility_supported === false
          ? 'Dieser ältere Eintrag hat keine eigene gespeicherte Laufkennung für eine dauerhafte Anzeigepräferenz. Seine Dateien bleiben unverändert.'
          : 'Offene oder noch nicht bestätigte Vorgänge können nicht ausgeblendet werden.';
        extra.append(visibility);
        if (entry.results_available && baseAction?.key !== 'results') actions.append(action('results', 'Ergebnisordner', () => perform('open_history_results', { batchId: entry.batch_id })));
        if (entry.status !== 'export_abandoned' && entry.result_count > 0 && !['documents', 'results'].includes(baseAction?.key)) addExtra('documents', raw ? 'Markdown nachkorrigieren (optional)' : anonymous ? 'Prüfung öffnen' : 'Prüfstände ansehen', () => openDocuments(entry.batch_id));
        if (entry.ledger_available || entry.identity_mapping_available) {
          const privateGroup = element('details', undefined, 'history-private');
          privateGroup.append(element('summary', 'Vertrauliche Zuordnungen (optional)'),
            element('p', 'Enthalten echte Identitäten oder Dateinamen. Nicht weitergeben. Öffnen verändert keine Freigabe oder Kopie.', 'history-meta'));
          if (entry.ledger_available) privateGroup.append(action('ledger', 'Dateizuordnung öffnen', () => perform('open_history_ledger', { batchId: entry.batch_id })));
          if (entry.identity_mapping_available) privateGroup.append(action('identities', 'Basiszuordnung öffnen', () => perform('open_history_identity_mapping', { batchId: entry.batch_id })));
          disclosure.append(privateGroup);
        }
        if (raw && entry.status === 'review_required' && entry.resumable)
          addExtra('skip-ocr', 'Ohne E-Mail-/Telefonvergleich fortfahren', () => offerSkipOcrContactReview(entry.batch_id, count(entry.selected_count)));
        if (anonymous && entry.status === 'export_pending' && !working)
          addExtra('abandon-export', 'Unvollständige Bereitstellung aufgeben …', () => offerAbandonResultExport(entry));
        // Summary data may improve the next action, but never supersedes an
        // active worker or unprocessed work. File exceptions remain directly
        // visible beside usable results; document opening reloads revisions.
        const updateAction = data => {
          updateRunReview(entry, data);
          const candidate = window.__DATASECURE_PRESENTATION__?.historyReviewProjection(entry, data);
          const ownCurrent = job?.batchId === entry.batch_id && current?.batch_id === entry.batch_id;
          const displayProof = candidate && (!ownCurrent || boundRunReview(current)) ? candidate : null;
          if (historyGuide) historyGuide(displayProof);
          if (finishNext) {
            finishNext.textContent = displayProof ? displayProof.next :
              unconfirmedReviewText;
          }
          // A privacy stop does not erase independently confirmed approvals,
          // and a missing export receipt is not a processing failure.
          if (finishDetail && (data?.available !== true || data.loading))
            finishDetail.textContent = `${finishedProcessingText} ${data?.loading
              ? 'Freigaben und Exporte werden anhand der gespeicherten Belege neu geprüft.'
              : 'Freigaben und Exporte sind derzeit nicht bestätigt. Bitte den Prüfstatus erneut laden.'}`;
          if (data?.available !== true || data.loading) stateLabel.textContent = baseStateLabel;
          if (anonymous && entry.status === 'results_available' && !missingLocation &&
              data?.available === true && !data.loading) {
            const copy = data.pending_export_count ? 'Export im Abgleich' :
              data.current_exported_count === data.reviewable_count && data.reviewable_count > 0 ? 'Export mit Abschlussbeleg' :
                'aktueller Stand noch nicht als Export belegt';
            stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · ${copy}`;
            if (finishDetail) {
              const coverage = data.pending_export_count
                ? 'Ein Export wird noch abgeglichen. Bitte keinen zweiten Export starten.'
                : data.reviewable_count > 0 && data.approved_count === data.reviewable_count &&
                    data.current_exported_count === data.reviewable_count && data.recorded_export_count > 0
                  ? `Die ${data.reviewable_count} verfügbaren Dokumentstände sind freigegeben und in abgeschlossenen Exporten belegt. Für diesen Stand ist kein weiterer Export nötig.`
                  : data.approved_count === data.reviewable_count && data.reviewable_count > 0
                    ? 'Alle verfügbaren Dokumentstände sind freigegeben. Ein Export dieses aktuellen Stands ist noch nicht vollständig belegt.'
                    : `${data.approved_count} von ${data.reviewable_count} verfügbaren Dokumentständen sind freigegeben. Noch nicht freigegebene Dokumente ausdrücklich prüfen.`;
              finishDetail.textContent = `${finishedProcessingText} ${coverage}`;
            }
          }
          const decorateState = () => {
            if (anonymous && data?.available === true && !data.loading && data.pending_export_count)
              stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · Export im Abgleich`;
            if (anonymous && data?.available === true && !data.loading && expectedOcr)
              stateLabel.textContent += ` · ${expectedOcr} ohne OCR nicht umgewandelt`;
            if (missingLocation && !stateLabel.textContent.includes('Ergebnisordner fehlt'))
              stateLabel.textContent += ' · Ergebnisordner fehlt';
          };
          if (!main || baseAction.key !== 'documents') { decorateState(); return false; }
          mainAction = baseAction; main.hidden = false;
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
            else if (data.unavailable_count || data.unclassified_source_count || count(data.not_processed_count) > expectedOcr + privacyStops) {
              mainAction.label = 'Prüfstände ansehen';
              stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · Prüfstände unvollständig`;
            } else if (data.reviewable_count > 0 && data.approved_count === data.reviewable_count) {
              if (data.current_exported_count === data.reviewable_count) {
                mainAction = { ...mainAction, label: 'Prüfung öffnen', primary: false };
                stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · Export mit Abschlussbeleg`;
              } else {
                mainAction = { ...mainAction, label: 'Exportvorschau', run: () => openDocuments(entry.batch_id, true) };
                stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · ${data.pending_export_count ? 'Export im Abgleich' : 'aktueller Stand noch nicht als Export belegt'}`;
              }
            } else {
              stateLabel.textContent = `Verarbeitung beendet · ${data.approved_count}/${data.reviewable_count} freigegeben · Export gesondert prüfen`;
            }
          }
          // A pending durable copy takes precedence over an OCR omission or
          // the generic next-action label. Otherwise an in-flight/recoverable
          // export can appear completed simply because the row has results.
          decorateState();
          main.textContent = mainAction.label; main.className = mainAction.primary ? 'primary' : '';
          return false;
        };
        row.append(detail, actions);
        let focusRequestedSummary = false;
        if (entry.result_count > 0) {
          const summary = element('div', undefined, 'history-review-summary');
          const requestedSummary = targetedSummary === entry.batch_id;
          focusRequestedSummary = requestedSummary;
          if (requestedSummary) expandedHistorySummaries.add(entry.batch_id);
          if (raw) {
            if (requestedSummary) collapsedMarkdownDetails.delete(entry.batch_id);
            disclosure.open = expandedHistorySummaries.has(entry.batch_id) ||
              Boolean(detailsBatchId) && !collapsedMarkdownDetails.has(entry.batch_id);
            if (disclosure.open) expandedHistorySummaries.add(entry.batch_id);
          }
          summary.hidden = raw ? !disclosure.open : !expandedHistorySummaries.has(entry.batch_id);
          summary.id = `history-${entry.batch_id}-summary`;
          const { load, loadIfNeeded, cancel } = historySummary(summary, entry, updateAction);
          if (!summary.hidden && (!targetedSummary || requestedSummary)) reopenedSummaries.push({ summary, load: loadIfNeeded });
          if (raw) {
            // Markdown conversion is complete without another confirmation.
            // Its optional, read-only copy status belongs to this one native
            // details disclosure, not a second independently visible panel.
            disclosure.append(summary);
            disclosure.addEventListener('toggle', () => {
              if (!disclosure.isConnected ||
                  !(view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id)) return;
              summary.hidden = !disclosure.open;
              if (disclosure.open) {
                collapsedMarkdownDetails.delete(entry.batch_id); expandedHistorySummaries.add(entry.batch_id);
                loadIfNeeded();
              } else {
                collapsedMarkdownDetails.add(entry.batch_id); expandedHistorySummaries.delete(entry.batch_id); cancel();
              }
            });
          } else {
            const toggle = action('summary-toggle', 'Freigaben und Exporte', () => {
              summary.hidden = !summary.hidden; toggle.setAttribute('aria-expanded', String(!summary.hidden));
              if (summary.hidden) { expandedHistorySummaries.delete(entry.batch_id); cancel(); }
              else { expandedHistorySummaries.add(entry.batch_id); load(); }
            });
            toggle.setAttribute('aria-expanded', String(!summary.hidden)); toggle.setAttribute('aria-controls', summary.id);
            disclosure.addEventListener('toggle', () => {
              if (!disclosure.open || !disclosure.isConnected ||
                  !(view === 'history' || view === 'details' && runDetails?.batchId === entry.batch_id)) return;
              summary.hidden = false; expandedHistorySummaries.add(entry.batch_id);
              toggle.setAttribute('aria-expanded', 'true');
              loadIfNeeded();
            });
            // Approval/export status remains an explicit anonymous-run action.
            extra.append(toggle);
            row.append(summary);
          }
          if (requestedSummary) requestedHistorySummaryBatchId = null;
        }
        if (count(entry.failed_count) || count(entry.problem_count) || conversion?.content_notice_count ||
            finished && contentNotices?.attention) {
          const files = element('div', undefined, 'problem-list'); files.hidden = !expandedHistoryProblems.has(entry.batch_id);
          files.id = `history-${entry.batch_id}-files`;
          const toggle = action('problems', conversion && !conversion.error_count || anonymous && !failedFiles && contentNotices?.attention ? 'Hinweise ansehen'
            : anonymous && privacyStops && !technicalProblems ? `${count(entry.failed_count)} ${count(entry.failed_count) === 1 ? 'Ausnahme' : 'Ausnahmen'} ansehen` : 'Betroffene Dateien', () => {
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
          files.tabIndex = -1; files.setAttribute('role', 'region'); files.setAttribute('aria-label', conversion || contentNotices?.attention ? 'Hinweise und Dateifehler dieses Laufs' : 'Dateiprobleme dieses Laufs');
          actions.append(toggle);
          row.append(files);
          if (!files.hidden) problems(files, entry.batch_id);
        }
        // Counts/outcome, run ID, results and warnings stay directly visible.
        // Long explanatory prose and optional private mappings start collapsed.
        for (const child of [...detail.children]) {
          if (child.className === 'history-next' || child.className === 'history-completion') disclosure.append(child);
        }
        if (extra.children.length) actions.append(more, extra);
        detail.append(disclosure);
        // Status comes first in reading, keyboard and visual order. Keep the
        // explicit status reference: later approval reads must not rewrite
        // the date or counters merely because the layout was reorganized.
        const statusHeading = [...detail.children].find(child => child.className === 'history-completion-title') || stateLabel;
        statusHeading.className += ' history-status-heading';
        detail.replaceChildren(statusHeading, ...[...detail.children].filter(child => child !== statusHeading));
        list.append(row);
        if (focusRequestedSummary) { row.tabIndex = -1; row.focus(); }
      }
      requestedHistorySummaryBatchId = null;
      if (detailsBatchId && !list.children.length) list.append(element('p', 'Dieser Lauf ist im geladenen Verlauf nicht verfügbar. Die Lauf-ID bleibt ausgewählt; es wurde kein anderer Lauf übernommen.', 'notice'));
      else if (!detailsBatchId && !list.children.length && data.hidden_count > 0)
        $('history-status').textContent = 'Keine sichtbaren abgeschlossenen Läufe. Über „Ausgeblendete Läufe anzeigen“ kannst du sie wieder aufrufen.';
      historySignature = signature;
      if (view === 'history' && focused?.startsWith('history-')) ($(focused) || $('nav-history')).focus();
      else if (view === 'details' && focused?.startsWith('history-') && data.entries.some(entry =>
        entry.batch_id === detailsBatchId && entry.processing_mode === 'markdown-only'))
        ($(focused) || $('details-heading')).focus();
    } catch { if (request === historyGeneration && connection === connectionEpoch &&
        (!detailsBatchId || view === 'details' && runDetails === route)) {
      if (recovering) feedback('Die Bereitstellung konnte nicht bestätigt werden. Den aktuellen Laufstatus und die Diagnose prüfen; keinen zweiten Lauf oder Export blind starten.', true,
        { batchId: recoverBatchId, kind: 'delivery-pending' });
      historyUnavailable(recovering
        ? 'Die Bereitstellung konnte nicht bestätigt werden. Den aktuellen Laufstatus und die Diagnose prüfen; keinen zweiten Lauf oder Export blind starten.'
        : 'Verlauf derzeit nicht erreichbar. „Aktualisieren“ prüft nur erneut die lokale Verbindung; es startet keinen Lauf. Wenn das bestehen bleibt, „Diagnose öffnen“ wählen.');
    } }
    finally {
      if (recovering) { historyRecoveryBusy = false; endBusy(ownership); }
      // A changed history snapshot rebuilds its rows. Expanded summaries
      // must not reappear as empty panels; load them only after an exclusive
      // recovery has released the local IPC channel. No unopened row is read.
      if (reopenedSummaries.length && !closed && request === historyGeneration && (view === 'history' || view === 'details' && runDetails === route))
        Promise.resolve().then(async () => {
          for (const { summary, load } of reopenedSummaries) {
            if (closed || request !== historyGeneration || !(view === 'history' || view === 'details' && runDetails === route)) break;
            if (summary.isConnected && !summary.hidden) await load();
          }
        });
    }
  }
  function schedule(delay = 1600) { clearTimeout(timer); if (!closed && !automaticRetryPaused) timer = setTimeout(refresh, delay); }
  async function refresh(explicitRetry = false, bootstrapRetryProof = null) {
    if (bootstrapFailure && !explicitRetry) { renderBootstrapFailure(); return; }
    if (closed || refreshing) return; if (busy || bootstrapping) { schedule(); return; }
    // A document decision or native copy owns the single local IPC channel.
    // Background status reads can otherwise time out while a healthy export
    // holds it for minutes and leave a false red connection banner behind.
    if (historyRecoveryBusy || historySummaryReads || !explicitRetry && view === 'documents' && documentGuide?.busy) { schedule(); return; }
    const bootstrapRetryAuthorized = Boolean(explicitRetry && bootstrapRetryProof && !bootstrapRetryProof.used &&
      bootstrapFailure && bootstrapRetryProof.failure === bootstrapFailure &&
      bootstrapRetryProof.connectionEpoch === connectionEpoch && bootstrapRetryProof.generation === generation);
    if (bootstrapFailure && explicitRetry && !bootstrapRetryAuthorized) { explainUnboundBootstrapRetry(); return; }
    if (bootstrapRetryAuthorized) { bootstrapRetryProof.used = true; bootstrapRecoveryPending = true; }
    if (explicitRetry) { automaticRetryPaused = Boolean(bootstrapFailure || bootstrapRecoveryPending); clearTimeout(timer); }
    refreshing = true; const request = generation, summaryReadAtStart = historySummaryReadGeneration;
    let pendingRead = 'get_public_state';
    try {
      const state = await invoke('get_public_state', bootstrapRetryAuthorized ? { retryBootstrap: true } : undefined);
      pendingRead = null;
      if (closed || request !== generation || busy || historyRecoveryBusy ||
        historySummaryReads || summaryReadAtStart !== historySummaryReadGeneration ||
        view === 'documents' && documentGuide?.busy) return;
      if (contextRequired || explicitRetry && resultFolderUnavailable) {
        const recoveredConnection = contextRequired;
        pendingRead = 'get_ui_context';
        const context = await invoke('get_ui_context');
        pendingRead = null;
        if (closed || request !== generation || busy || historySummaryReads || summaryReadAtStart !== historySummaryReadGeneration) return;
        applyContext(context); contextRequired = false; reconnecting = false;
        if (bootstrapFailure) resolvedBootstrapEpoch = Math.max(resolvedBootstrapEpoch, bootstrapFailure.epoch);
        bootstrapFailure = null; bootstrapRecoveryPending = false; updateStart();
        if (recoveredConnection) feedback('Lokale Verbindung wiederhergestellt. Gespeicherte Läufe bleiben erhalten; kein Start und keine Entscheidung wurden automatisch wiederholt. Eine frühere Dateiauswahl bitte neu aufnehmen.');
      }
      current = state; updateStart();
      if (!job && !catalogue.length && /^[a-f0-9]{64}$/u.test(state.batch_id || '') && ['preparing', 'processing'].includes(state.state)) {
        adoptRun({ batchId: state.batch_id, task: state.processing_mode, name: `Lauf ${state.batch_id.slice(0, 8)}`,
          files: [], selectedCount: count(state.selected_count) });
      }
      renderJob(state);
      if (!historySummaryReads) {
        if (view === 'history') await refreshHistory(true);
        else if (view === 'details' && runDetails?.connection === connectionEpoch && !$('run-history-detail').hidden)
          await refreshHistory(true, null, runDetails.batchId);
      }
      if (state.state === 'blocked') feedback('Die lokale Verarbeitung ist nicht bereit. Bitte das vollständige Paket und die Diagnose prüfen.', true);
      else if (feedbackOwner?.kind === 'connection-unconfirmed') feedback(
        'Lokale Verbindung und Laufstatus sind wieder erreichbar. Ein zuvor unterbrochener Befehl wurde nicht erneut ausgeführt; seinen Abschluss bitte im Verlauf und anhand gespeicherter Belege prüfen.');
      else if (feedbackOwner?.kind === 'read-busy') feedback('');
      consecutiveConnectionFailures = 0; automaticRetryPaused = false;
    } catch (error) {
      if (bootstrapFailure) { if (!closed) renderBootstrapFailure(); return; }
      const readCode = errorCode(error), transientBusyRead = pendingRead !== null && transientReadBusyCodes.has(readCode);
      if (bootstrapRecoveryPending) {
        // Native Ready ended the old refusal, not this explicit recovery attempt.
        // Keep every mutation blocked and require another deliberate status check.
        if (!closed && request === generation) {
          if (transientBusyRead) feedback(readBusyMessage(readCode), false, { kind: 'read-busy' }); else showError(error);
          if (terminalCoreStartupCodes.has(errorCode(error))) holdBootstrapFailure(connectionEpoch, errorCode(error));
          automaticRetryPaused = true; $('connection-help').hidden = false;
        }
        return;
      }
      if (!closed && request === generation && !historyRecoveryBusy && !historySummaryReads &&
      summaryReadAtStart === historySummaryReadGeneration && !(view === 'documents' && documentGuide?.busy)) {
      if (transientBusyRead) {
        if (explicitRetry) {
          let description = '';
          try { const snapshot = await invoke('get_native_recovery_status');
            if (snapshot?.local_ui_only === true && snapshot.external_disclosure === false) description = nativeCoreDescription(snapshot);
          } catch { /* Busy is still distinct from a failed connection. */ }
          if (!closed && request === generation) feedback(readCode === 'STANDALONE_IPC_BUSY'
            ? description || readBusyMessage(readCode)
            : [readBusyMessage(readCode), description].filter(Boolean).join(' '), false, { kind: 'read-busy' });
        }
        return;
      }
      showError(error);
      if (terminalCoreStartupCodes.has(errorCode(error))) { holdBootstrapFailure(connectionEpoch, errorCode(error)); return; }
      if (reconnecting) await updateConnectionHelp();
      if (++consecutiveConnectionFailures >= 2 || terminalCoreStartupCodes.has(errorCode(error))) {
        automaticRetryPaused = true;
        $('connection-help').hidden = false;
        $('connection-status').textContent += ' Automatische Verbindungsversuche sind angehalten. Öffne die Diagnose und prüfe danach die Verbindung ausdrücklich erneut; ein Lauf oder Export wird nicht automatisch wiederholt.';
      }
    } }
    finally { refreshing = false; schedule(['processing', 'preparing'].includes(current?.state) ? 1200 : 5000); }
  }
  async function configure() { const result = await perform('configure_results'); if (!result || result.cancelled) return;
    if (result.local_ui_only && result.external_disclosure === false) { resultFolderUnavailable = false; $('retry-destination').hidden = true; $('retry-results').hidden = true; $('destination').textContent = result.result_folder; $('settings-destination').textContent = result.result_folder; updateStart(); }
    feedback('Ergebnisordner gespeichert. Vorhandene Läufe bleiben an ihrem bisherigen Speicherort.'); }
  async function recheckDestination() {
    const context = await perform('get_ui_context'); if (!context) return;
    try { applyContext(context); updateStart(); feedback(resultFolderUnavailable
      ? 'Der bisherige Ergebnisordner ist weiterhin nicht verfügbar. Stelle ihn wieder bereit oder wähle einen anderen Ordner.'
      : 'Der Ergebnisordner ist wieder verfügbar. Du kannst die ausgewählten Dateien jetzt starten.'); }
    catch (error) { showError(error); }
  }
  const navigationTabs = ['new', 'history', 'details', 'settings'];
  for (const name of navigationTabs) {
    $('nav-' + name).addEventListener('click', () => {
      if (name === 'history') {
        const requested = $('nav-history').dataset.openSummaryBatchId;
        delete $('nav-history').dataset.openSummaryBatchId;
        requestedHistorySummaryBatchId = /^[a-f0-9]{64}$/u.test(requested || '') ? requested : null;
        if (requestedHistorySummaryBatchId) historySignature = '';
      }
      showView(name);
    });
    $('nav-' + name).addEventListener('keydown', event => {
      const names = navigationTabs.filter(item => !$('nav-' + item).hidden), index = names.indexOf(name);
      const target = event.key === 'ArrowRight' ? (index + 1) % names.length : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : -1;
      if (target < 0) return; event.preventDefault(); names.forEach((item, i) => { $('nav-' + item).tabIndex = i === target ? 0 : -1; }); $('nav-' + names[target]).focus(); });
  }
  $('details-overview').addEventListener('click', () => showView('details'));
  $('details-open-copy').addEventListener('click', () => {
    const owner = runDetails, receipt = owner?.receipt;
    if (view !== 'details' || owner?.connection !== connectionEpoch || !receipt) return;
    perform('open_recorded_document_export', { batchId: owner.batchId, operationId: receipt.operation_id });
  });
  $('details-open-documents').addEventListener('click', () => {
    if (view === 'details' && runDetails?.connection === connectionEpoch) openDocuments(runDetails.batchId);
  });
  for (const id of ['mode-markdown', 'mode-anonymize']) $(id).addEventListener('change', () => {
    mode = $(id).value;
    if (mode !== 'markdown-and-anonymize') { $('naming-neutral').checked = true; $('naming-source').checked = false;
      $('manual-anonymize').checked = true; $('fast-anonymize').checked = false; }
    updateStart();
  });
  for (const id of ['naming-neutral', 'naming-source']) $(id).addEventListener('change', updateStart);
  $('text-ocr').addEventListener('change', renderTree);
  for (const id of ['manual-anonymize', 'fast-anonymize']) $(id).addEventListener('change', updateStart);
  $('select-files').addEventListener('click', () => pick('select_files')); $('select-folder').addEventListener('click', () => pick('select_folder'));
  $('add-files').addEventListener('click', () => pick('select_files')); $('add-folder').addEventListener('click', () => pick('select_folder'));
  $('add-more').addEventListener('click', () => { const show = $('add-options').hidden; $('add-options').hidden = !show;
    $('add-more').setAttribute('aria-expanded', String(show)); if (show) $('add-files').focus(); });
  $('start').addEventListener('click', start); $('clear-files').addEventListener('click', clearFiles);
  $('select-all').addEventListener('change', () => chooseItems(catalogue, $('select-all').checked));
  $('choose-all').addEventListener('click', () => chooseItems(catalogue, true)); $('choose-none').addEventListener('click', () => chooseItems(catalogue, false));
  $('expand-all').addEventListener('click', () => { const groups = treeGroups(), open = !groups.every(({ key }) => expanded.get(key)); for (const { key } of groups) expanded.set(key, open); renderTree(); });
  $('job-files-toggle').addEventListener('click', () => { const open = $('job-files').hidden; $('job-files').hidden = !open; $('job-files-toggle').setAttribute('aria-expanded', String(open)); $('job-files-toggle').textContent = open ? 'Dateien ausblenden ⌃' : 'Dateien anzeigen ⌄'; });
  $('job-skip-cancel').addEventListener('click', () => { $('job-skip-confirm').hidden = true; $('job-actions').querySelector('[id$="skip-ocr"]')?.focus(); });
  $('job-skip-accept').addEventListener('click', async () => {
    const batchId = job?.batchId;
    if (!batchId) return;
    const outcome = await perform('skip_ocr_contact_review', { batchId });
    if (!outcome) return;
    $('job-skip-confirm').hidden = true;
    feedback(outcome.continuation_pending === true
      ? 'Überspringen gespeichert. Der automatische Weiterlauf wurde nicht bestätigt; bitte den Laufstatus prüfen und bei Bedarf „Fortsetzen“ wählen.'
      : 'OCR-Kontaktprüfung wird übersprungen. Die Werte bleiben ungeprüft; der Markdown-Lauf wird fortgesetzt.');
    await refresh();
  });
  $('result-abandon-check').addEventListener('change', () => {
    $('result-abandon-accept').disabled = !$('result-abandon-check').checked;
  });
  $('result-abandon-cancel').addEventListener('click', () => $('result-abandon-dialog').close());
  $('result-abandon-dialog').addEventListener('close', () => { pendingResultAbandon = null; $('result-abandon-check').checked = false; });
  $('result-abandon-accept').addEventListener('click', async () => {
    const batchId = pendingResultAbandon;
    if (!batchId || !$('result-abandon-check').checked) return;
    const outcome = await perform('abandon_result_export', { batchId });
    if (!outcome?.abandoned) return;
    $('result-abandon-dialog').close();
    feedback('Die automatische Bereitstellung dieses Laufs ist dauerhaft aufgegeben. Bereits geschriebene Teilkopien bleiben erhalten; sie sind keine vollständigen oder freigegebenen Ergebnisse.');
    lastJobSignature = ''; historySignature = '';
    await refresh();
  });
  $('refresh-history').addEventListener('click', () => { historySignature = ''; refreshHistory(); }); $('configure-results').addEventListener('click', configure); $('change-destination').addEventListener('click', configure);
  $('history-include-hidden').addEventListener('change', () => {
    includeHiddenHistory = $('history-include-hidden').checked;
    historySignature = ''; refreshHistory();
  });
  $('retry-destination').addEventListener('click', recheckDestination); $('retry-results').addEventListener('click', recheckDestination);
  $('documents-back').addEventListener('click', () => showView(documentsOrigin));
  async function openDiagnostics() {
    // This native command does not use the sidecar. It must remain available
    // precisely when reconnecting prevents ordinary run commands.
    try { await invoke('open_diagnostic_folder'); }
    catch (error) { showError(error); }
  }
  $('diagnostics').addEventListener('click', openDiagnostics);
  $('connection-diagnostics').addEventListener('click', openDiagnostics);
  let diagnosticSaveBusy = false;
  async function saveDiagnosticBundle() {
    if (closed || diagnosticSaveBusy) return;
    diagnosticSaveBusy = true;
    const buttons = [$('diagnostic-save'), $('connection-diagnostic-save'), $('document-export-diagnostic-save')];
    const status = text => {
      for (const id of ['diagnostic-save-status', 'connection-diagnostic-save-status', 'document-export-diagnostic-status']) {
        $(id).textContent = text;
        $(id).hidden = !text;
      }
    };
    for (const button of buttons) button.disabled = true;
    status('Speicherort für eine neue JSON-Diagnosedatei wählen. Die lokale Verbindung ist dafür nicht erforderlich.');
    try {
      // Deliberately outside perform()/global busy ownership. Never change the
      // connection banner, replay a run, or claim an export completed here.
      const result = await invoke('save_diagnostic_bundle');
      if (result?.ok === true && result?.cancelled === true && result?.saved === false && result?.external_disclosure === false) {
        status('Abgebrochen. Es wurde kein Diagnosepaket gespeichert.');
      } else if (result?.ok === true && result?.saved === true && result?.cancelled === false &&
          typeof result?.partial === 'boolean' && result?.external_disclosure === false) {
        status(result.partial
          ? 'Diagnosepaket lokal gespeichert. Fehlende, gekürzte oder verworfene Protokollteile sind darin gekennzeichnet. Es wurde nichts hochgeladen.'
          : 'Diagnosepaket lokal gespeichert. Es wurde nichts hochgeladen. Du kannst diese JSON-Datei jetzt für die Fehlersuche weitergeben.');
      } else {
        status('Das Speichern wurde nicht bestätigt. Bitte den gewählten Ordner prüfen; einen neuen Dateinamen verwenden.');
      }
    } catch {
      // No raw exception/vendor paths, and no generic connection failure for
      // an independent support-file operation. Never overwrite existing files.
      status('Diagnosepaket konnte nicht bestätigt werden. Bitte einen beschreibbaren lokalen Ordner und einen neuen Dateinamen wählen. Eine eventuell unvollständige Datei bleibt erhalten. Die Verarbeitung wurde dadurch nicht neu gestartet.');
    } finally {
      diagnosticSaveBusy = false;
      for (const button of buttons) button.disabled = false;
    }
  }
  $('diagnostic-save').addEventListener('click', saveDiagnosticBundle);
  $('connection-diagnostic-save').addEventListener('click', saveDiagnosticBundle);
  $('document-export-diagnostic-save').addEventListener('click', saveDiagnosticBundle);
  $('connection-retry').addEventListener('click', async () => {
    if (closed || connectionRetryChecking) return;
    if (historySummaryReads) {
      if (bootstrapFailure) { renderBootstrapFailure(); return; }
      $('connection-status').textContent = 'Der gespeicherte Prüfstatus wird gerade lokal abgeglichen. Bitte den Abschluss abwarten und dann die Verbindung erneut prüfen; es wird kein neuer Lauf gestartet.';
      return;
    }
    if (refreshing) {
      if (bootstrapFailure) { renderBootstrapFailure(); return; }
      $('connection-status').textContent = 'Die lokale Verbindung und der Laufstatus werden bereits geprüft. Bitte das Ergebnis abwarten; es wird kein neuer Lauf gestartet.';
      return;
    }
    const retry = $('connection-retry'); retry.disabled = true; connectionRetryChecking = true;
    retry.textContent = 'Verbindung wird geprüft …';
    try {
      const bootstrapRetryProof = await updateConnectionHelp();
      if (bootstrapFailure && !bootstrapRetryProof) { explainUnboundBootstrapRetry(); return; }
      await refresh(true, bootstrapRetryProof);
    } finally { connectionRetryChecking = false; retry.disabled = false; retry.textContent = 'Verbindung und Laufstatus prüfen'; }
  });
  $('identities').addEventListener('click', () => perform('open_identity_mappings_directory'));
  window.addEventListener('beforeunload', () => { closed = true; clearTimeout(timer); for (const unlisten of unlisteners) unlisten(); $('review-frame').src = 'about:blank'; });
  (async () => {
    updateStart();
    let initialContextReadPending = false;
    try {
      receiveConnectionState = event => {
        const data = event.payload;
        if (closed || !Number.isSafeInteger(data?.epoch) || data.epoch < 0) return;
        // A historical Ready receipt can resolve failure 1 even after recovery
        // advanced to epoch 3. It must not make epoch 2 the current connection.
        if (data.state === 'ready') retireResolvedBootstrap(data.bootstrap_resolution, data.epoch);
        if (data.epoch < connectionEpoch ||
            data.epoch <= resolvedBootstrapEpoch ||
            !['recovering', 'ready', 'bootstrap_failed'].includes(data.state) ||
            data.state === 'bootstrap_failed' && !/^[A-Z][A-Z0-9_]{1,80}$/u.test(data.error_code || '')) return;
        if (bootstrapFailure && data.epoch <= bootstrapFailure.epoch && data.epoch <= connectionEpoch) { renderBootstrapFailure(); return; }
        const changedConnection = connectionEpoch !== data.epoch;
        connectionEpoch = data.epoch;
        if (changedConnection) {
          // A newer Ready may arrive without an intermediate Recovering
          // event. Retire both the global proof and every rendered row's
          // approval/copy projection; an old read/finally cannot own the new
          // channel or restore a completion claim afterwards.
          historySummaryOwnershipEpoch++;
          if (historySummaryReads) historySummaryReadGeneration++;
          historySummaryReads = 0;
          historySummaryEpoch++; historyGeneration++; historySignature = '';
          for (const retire of historySummaryRetirements) retire();
          clearRunReview(); renderRunReceipt();
        }
        if (data.state === 'recovering' || data.state === 'bootstrap_failed') {
          if (data.state === 'bootstrap_failed') holdBootstrapFailure(data.epoch, data.error_code, true);
          busyGeneration++; historyRecoveryBusy = false; dropOwnership = null; setBusy(false);
          // Pending reads belong to the retired Core connection. Their late
          // finally blocks must not keep the replacement connection locked.
          historySummaryOwnershipEpoch++; historySummaryReadGeneration++; historySummaryReads = 0;
          generation++; historyGeneration++; historySummaryEpoch++; historySignature = ''; lastJobSignature = '';
          catalogue = []; knownIds.clear(); selected.clear(); expanded.clear(); revision = 0;
          admitting = false; acknowledged = null; reconnecting = true; contextRequired = true;
          $('review-frame').src = 'about:blank'; reviewOrigin = null;
          window.__DATASECURE_DOCUMENTS__?.invalidateConnection();
          if (view === 'review' || view === 'documents') { view = ''; showView('history'); }
          historyUnavailable(bootstrapFailure
            ? 'Der lokale Core konnte nicht sicher gestartet werden. Der Verlauf ist derzeit nicht erreichbar; bitte die angezeigte Startursache und die Diagnose prüfen.'
            : 'Verbindung unterbrochen. Der zuletzt angezeigte Verlauf ist nicht bestätigt. DataSecure versucht die sichere Wiederverbindung; kein Lauf wird erneut gestartet.');
          $('run-guide').hidden = true;
          if (!$('job').hidden) {
            $('job-title').textContent = 'Laufstatus wird nach Verbindungsausfall geprüft';
            $('job-description').textContent = 'Der zuletzt angezeigte Fortschritt ist nicht bestätigt. Bitte keine Ergebnisse als vollständig ansehen.';
            $('job-progress').removeAttribute('value');
            $('job-current').textContent = '';
            $('job-actions').replaceChildren();
            $('job-secondary-actions').replaceChildren();
            $('job-more').hidden = true;
            $('job-skip-confirm').hidden = true;
            $('file-problems').hidden = true;
          }
          renderTree(); updateStart();
          if (bootstrapFailure) { renderBootstrapFailure(); return; }
          feedback('Lokale Verbindung unterbrochen. DataSecure wartet auf das sichere Ende der alten Sitzung und verbindet sich erneut. Nicht gespeicherte Prüfentscheidungen wurden nicht übertragen.', true);
          $('connection-help').hidden = false;
          $('connection-status').textContent = 'Der letzte Laufstatus ist nicht bestätigt. DataSecure prüft den sicheren Zustand des alten lokalen Dienstes. Bitte keinen zweiten Lauf starten.';
          void updateConnectionHelp();
          schedule(1200);
        } else if (contextRequired) {
          if (bootstrapFailure) return; // The owning explicit status check must also validate context.
          // Only status/context are reloaded. Never replay the failed command.
          if (!bootstrapRecoveryPending) {
            consecutiveConnectionFailures = 0; automaticRetryPaused = false;
            schedule(50);
          }
        }
      };
      unlisteners.push(await window.__TAURI__.event.listen('datasecure-connection', receiveConnectionState));
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
        if (origin.complete && origin.processingMode === 'markdown-and-anonymize') {
          feedback('Fundstellenprüfung abgeschlossen. Prüfe jetzt die Ergebnisse dieses Laufs und gib die gewünschten Dokumente ausdrücklich frei. Deine bisherigen Entscheidungen sind übernommen; noch kein Export.');
          await openDocuments(origin.batchId, false, origin.view);
          refresh(); return;
        }
        if (origin.complete && origin.processingMode === 'markdown-only')
          feedback('OCR-Kontaktprüfung abgeschlossen. Keine weitere Pflichtprüfung für diesen Markdown-Lauf. Nachbearbeitung ist freiwillig; die Dateien sind nicht anonymisiert.');
        else if (origin.complete)
          feedback('Prüfung abgeschlossen. Der Verarbeitungszweck ist nicht bestätigt; den Status dieses Laufs abgleichen. Keine Freigabe oder Kopie wurde ausgelöst.');
        showView('details', origin.batchId); refresh();
        // The action row is recreated by the next status response. Returning
        // focus to its old launch button would immediately drop it to <body>.
        // A stable destination keeps keyboard users at the same run/context.
        $('details-heading').focus();
      }));
      const ready = await invoke('frontend_ready', { nativeDropReady });
      if (typeof ready?.product_version === 'string' && /^\d+\.\d+\.\d+-rc\d+$/u.test(ready.product_version)) {
        const build = typeof ready.build_id === 'string' && /^[a-f0-9]{40}$/u.test(ready.build_id) ?
          ` · Build ${ready.build_id.slice(0, 8)}` : '';
        const target = ready.runtime_target === 'macos-aarch64' ? 'macOS ARM64' :
          ready.runtime_target === 'macos-x86_64' ? 'macOS Intel' : '';
        $('product-version').textContent = `Version ${ready.product_version}${build}${target ? ` · ${target}` : ''}`;
      }
      const initialGeneration = generation, initialConnection = connectionEpoch;
      reconnecting = true; contextRequired = true; updateStart();
      feedback('Der lokale Core wird gestartet und der gespeicherte Zustand geprüft. Dateiauswahl und Ergebnisordner sind bis zur bestätigten Verbindung gesperrt.', false,
        { kind: 'bootstrap' });
      initialContextReadPending = true;
      const initialContext = await invoke('get_ui_context');
      initialContextReadPending = false;
      if (initialGeneration === generation && initialConnection === connectionEpoch) {
        applyContext(initialContext); reconnecting = false; contextRequired = false; updateStart();
        if (feedbackOwner?.kind === 'bootstrap') feedback('');
      }
      // Bootstrap retains the durable run bindings in the core, but the
      // detailed list is needed only when History is opened. Rendering that
      // list never authorizes a deferred result publication.
      bootstrapping = false;
      await refresh();
    } catch (error) {
      bootstrapping = false; reconnecting = true; contextRequired = true; updateStart();
      if (bootstrapFailure) { renderBootstrapFailure(); return; }
      if (initialContextReadPending && transientReadBusyCodes.has(errorCode(error))) {
        feedback(errorCode(error) === 'STANDALONE_IPC_BUSY'
          ? 'Der lokale Core beendet noch einen Vorgang. Der Verbindungsstatus wird erneut geprüft; es wird nichts automatisch gestartet oder exportiert.'
          : readBusyMessage(errorCode(error)), false, { kind: 'read-busy' });
        schedule();
        return;
      }
      showError(error);
      if (terminalCoreStartupCodes.has(errorCode(error))) {
        holdBootstrapFailure(connectionEpoch, errorCode(error));
      } else schedule();
    }
  })();
})();
