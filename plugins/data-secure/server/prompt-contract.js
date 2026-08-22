'use strict';

const PROMPT_DEFAULTS = Object.freeze({
  anonymize_customer: Object.freeze({ profile: 'customer', task: 'Fasse den Kundenvorgang und offene Punkte zusammen.' }),
  anonymize_applicant: Object.freeze({ profile: 'applicant', task: 'Fasse Qualifikationen, Berufserfahrung und Skills rein beschreibend zusammen.' }),
  anonymize_personnel_profile: Object.freeze({ profile: 'personnel_profile', task: 'Erstelle ein lokal de-identifiziertes Kompetenz-/Erfahrungsprofil ohne Ranking oder Personalentscheidung.' }),
  anonymize_contract: Object.freeze({ profile: 'contract', task: 'Prüfe Klauseln, Pflichten, Fristen und Risiken.' })
});

function workflowText(profile, task) {
  return `Prüfe privacy_status, öffne mit open_input_folder den lokalen Eingang und warte auf die Bestätigung des Anwenders. Binde danach die bestätigte Anzahl mit begin_document_batch (profile=${profile}) und verarbeite den Stapel mit je einem anonymize_next_document-Aufruf über dasselbe batch_token. Verwende zum Lesen nur package_id und read_capability aus dem jeweiligen erfolgreichen Aufruf. PDF und alle Formate außer TXT/DOCX bleiben im Pilot gesperrt. Output und lokale Originalkopien unterliegen der gemeldeten Aufbewahrungsfrist. Aufgabe: ${task}`;
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

module.exports = { PROMPT_DEFAULTS, promptText, manifestPromptText };
