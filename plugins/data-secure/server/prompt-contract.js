'use strict';

const PROMPT_DEFAULTS = Object.freeze({
  anonymize_customer: Object.freeze({ profile: 'customer', task: 'Fasse den Kundenvorgang und offene Punkte zusammen.' }),
  anonymize_applicant: Object.freeze({ profile: 'applicant', task: 'Fasse Qualifikationen, Berufserfahrung und Skills rein beschreibend zusammen.' }),
  anonymize_personnel_profile: Object.freeze({ profile: 'personnel_profile', task: 'Erstelle ein lokal de-identifiziertes Kompetenz-/Erfahrungsprofil ohne Ranking oder Personalentscheidung.' }),
  anonymize_contract: Object.freeze({ profile: 'contract', task: 'Prüfe Klauseln, Pflichten, Fristen und Risiken.' })
});

const OPEN_BATCH_DECISION_TEXT = 'Bei recoverable_batches>0 biete genau drei sichere Möglichkeiten an: (1) den zuletzt unvollständigen Stapel fortsetzen; rufe nur nach ausdrücklicher Zustimmung continue_most_recent_document_batch(confirmed=true) auf und öffne keinen Ersatzbatch, (2) alle offenen Stapel verwerfen; nenne zuerst deren Anzahl, erkläre, dass nur lokale Arbeitskopien und Checkpoints verworfen werden, hole danach eine zweite ausdrückliche Bestätigung ein und rufe erst dann discard_incomplete_document_batches(confirmed=true) auf, oder (3) jetzt nichts tun; rufe dann kein Stapelwerkzeug auf. Meldet die Fortsetzung awaiting_local_review, führe die lokale Prüfung mit review_deferred_document_batch fort und starte oder resümiere nicht erneut.';

const HOST_GATE_TEXT = 'Rufe zuerst privacy_status auf. Ist der Aufruf in dieser aktuellen Unterhaltung nicht erfolgreich, stoppe vor jedem Datei- oder Ordnerzugriff. Ein sichtbarer Skill, ein Plugin-Eintrag, eine Desktop-App oder ein anderer Connector beweist den lokalen DataSecure-Pfad nicht. Nutze weder Upload, Computer-Use noch ein allgemeines Dateisystem als Ersatz. Empfehle nur eine neue unterstützte lokale Desktop-/Claude-Code-Sitzung oder eine IT-Prüfung; bereits lokal bereinigtes Markdown darf normal verarbeitet werden.';

function workflowText(profile, task) {
  return `${HOST_GATE_TEXT} Ist batch_processing_active=true, erkläre knapp, dass ein lokaler Stapel läuft, und öffne oder starte nichts erneut. ${OPEN_BATCH_DECISION_TEXT} Nur wenn recoverable_batches=0, öffne mit open_input_folder den lokalen Eingang und warte auf die Bestätigung des Anwenders. Binde danach die bestätigte Anzahl mit begin_document_batch (profile=${profile}) und starte den persistenten lokalen Lauf einmal mit start_document_batch_processing. Frage den namen- und inhaltsfreien Fortschritt nur mit document_batch_status ab; starte während local_processing_active=true nichts erneut. Bei awaiting_local_review verwende ausschließlich review_deferred_document_batch. Liste danach freigegebene Ergebnisse seitenweise mit list_document_batch_results (höchstens 10), lies nur für die Aufgabe benötigte Pakete mit package_id und read_capability und markiere jedes tatsächlich ausgewertete Paket mit acknowledge_batch_document. Bei einem ausdrücklichen Gesamtauftrag setze den Cursor fort und nenne verwendet, noch offen und sicher gestoppt; eine Unterbrechung der KI-Auswertung ändert den lokal abgeschlossenen Stapel nicht. PDF und alle Formate außer TXT, Markdown, CSV und DOCX bleiben im Pilot gesperrt. Output und lokale Originalkopien unterliegen der gemeldeten Aufbewahrungsfrist. Aufgabe: ${task}`;
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
