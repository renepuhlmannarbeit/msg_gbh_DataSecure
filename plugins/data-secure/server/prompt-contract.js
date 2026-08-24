'use strict';

const PROMPT_DEFAULTS = Object.freeze({
  anonymize_customer: Object.freeze({ profile: 'customer', task: 'Fasse den Kundenvorgang und offene Punkte zusammen.' }),
  anonymize_applicant: Object.freeze({ profile: 'applicant', task: 'Fasse Qualifikationen, Berufserfahrung und Skills rein beschreibend zusammen.' }),
  anonymize_personnel_profile: Object.freeze({ profile: 'personnel_profile', task: 'Erstelle ein lokal de-identifiziertes Kompetenz-/Erfahrungsprofil ohne Ranking oder Personalentscheidung.' }),
  anonymize_contract: Object.freeze({ profile: 'contract', task: 'Prüfe Klauseln, Pflichten, Fristen und Risiken.' })
});

const OPEN_BATCH_DECISION_TEXT = 'Bei recoverable_batches>0 biete genau drei sichere Möglichkeiten an: (1) den zuletzt unvollständigen Stapel fortsetzen; rufe nur nach ausdrücklicher Zustimmung continue_most_recent_document_batch(confirmed=true) auf. Dieser eine Routineaufruf startet die sichere technische Wiederaufnahme selbst und öffnet keinen Ersatzbatch oder weitere Support-Werkzeuge. (2) Alle offenen Stapel verwerfen: nenne zuerst deren Anzahl, erkläre, dass nur lokale Arbeitskopien und Checkpoints verworfen werden, hole danach eine zweite ausdrückliche Bestätigung ein und rufe erst dann discard_incomplete_document_batches(confirmed=true) auf. Oder (3) jetzt nichts tun; rufe dann kein Stapelwerkzeug auf. Meldet die Fortsetzung awaiting_local_review, führe die lokale Prüfung mit review_deferred_document_batch fort und starte oder resümiere nicht erneut.';

const HOST_GATE_TEXT = 'Rufe zuerst privacy_status auf. Ist der Aufruf in dieser aktuellen Unterhaltung nicht erfolgreich, stoppe vor jedem Datei- oder Ordnerzugriff. Ein sichtbarer Skill, ein Plugin-Eintrag, eine Desktop-App oder ein anderer Connector beweist den lokalen DataSecure-Pfad nicht. Nutze weder Upload, Computer-Use noch ein allgemeines Dateisystem als Ersatz. Empfehle nur eine neue unterstützte lokale Desktop-/Claude-Code-Sitzung oder eine IT-Prüfung; bereits lokal bereinigtes Markdown darf normal verarbeitet werden.';

function workflowText(profile, task) {
  return `Bei einer eindeutigen reinen Anonymisierungsabsicht rufe genau einmal start_document_batch_from_picker(profile=${profile}, mode=local_only) auf. Führe vorher weder privacy_status noch open_input_folder, open_privacy_folder, begin_document_batch oder start_document_batch_processing auf. Der lokale Mehrfach-Dateidialog ist der einzige Normalweg: Mit „Öffnen“ bestätigt der Anwender die lokale Verarbeitung; keine zusätzliche Bild- oder Startfrage. Bei local_selection_cancelled nichts erneut öffnen. Bei local_start_failed oder local_engine_unavailable nicht automatisch wiederholen und keinen Upload-Ersatz anbieten. Bei batch_active erkläre knapp, dass ein lokaler Stapel läuft. ${OPEN_BATCH_DECISION_TEXT} Bei local_only endet der Claude-Ablauf nach der Startantwort: keinen Status abfragen, keine Ergebnisse lesen und nichts bestätigen; der lokale Abschlussindikator enthält nur feste Zähler. Nur wenn der Anwender ausdrücklich eine Folgeauswertung verlangt, rufe start_completed_local_results_handoff auf. Der Server wählt vollständig abgeschlossene lokale Ergebnisse aus, fragt nur bei mehreren Stapeln lokal nach und gibt höchstens fünf verifizierte Markdown-Ergebnisse ohne Token, Kennung, Cursor oder Leseberechtigung aus. Für weitere Ergebnisse verwende ausschließlich continue_local_results_handoff. Es gibt im Normalweg keine separate Ergebnisliste oder Bestätigung. PDF und alle Formate außer TXT, Markdown, CSV und DOCX bleiben im Pilot gesperrt. Originale nie per Chat-Anhang oder Fremdwerkzeug an Claude geben. Aufgabe: ${task}`;
}

function promptText(name, args = {}) {
  const definition = PROMPT_DEFAULTS[name];
  if (!definition) return null;
  const task = String(args.task || '').trim() || definition.task;
  return workflowText(definition.profile, task);
}

function manifestPromptText(name) {
  const definition = PROMPT_DEFAULTS[name];
  return definition ? workflowText(definition.profile, '${arguments.task}') : null;
}

module.exports = { PROMPT_DEFAULTS, HOST_GATE_TEXT, OPEN_BATCH_DECISION_TEXT, promptText, manifestPromptText };
