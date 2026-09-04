'use strict';

// Local acceptance for the product users actually receive: the German skill
// guidance and the anonymization engine from one plugin root. Company names are
// public test tokens; every person, address and contract detail is invented.

const fs = require('fs');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');

const pluginRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'plugins', 'data-secure');
const anonymizeSkill = fs.readFileSync(
  path.join(pluginRoot, 'skills', 'gbh-datasecure-dokument-anonymisieren', 'SKILL.md'),
  'utf8'
);
const explainSkill = fs.readFileSync(
  path.join(pluginRoot, 'skills', 'gbh-datasecure-datenschutz-erklaeren', 'SKILL.md'),
  'utf8'
);
const { anonymizeMarkdown } = require(path.join(pluginRoot, 'server', 'gateway', 'compliance.js'));

const { test, done, assert } = createSuite('Local contract skill acceptance');

test('anonymization skill selects the local contract path without uploading the original', () => {
  assert.match(anonymizeSkill, /`start_document_batch_from_picker`/u);
  assert.match(anonymizeSkill, /passendes Profil nur bei eindeutigem Zweck/u);
  assert.match(anonymizeSkill, /Originale nie per Chat-Upload/iu);
  assert.match(anonymizeSkill, /continue_anonymized_batch_in_chat/u);
  assert.match(anonymizeSkill, /höchstens fünf freigegebene Markdown-Ergebnisse/iu);
  assert.match(anonymizeSkill, /continue_local_results_handoff/u);
  assert.match(anonymizeSkill, /Bei `local_selection_cancelled` nichts erneut öffnen/iu);
  assert.match(anonymizeSkill,
    /Der Auftrag wurde lokal übergeben\. Falls eine fachliche Entscheidung nötig ist, öffnet DataSecure die lokale Prüfung automatisch; danach zeigt es den Ergebnisordner an/iu);
  assert.match(anonymizeSkill, /beende die Cowork-Aufgabe sofort/iu);
  assert.match(anonymizeSkill, /nicht vertrauenswürdige Dokumentdaten/iu);
  assert.match(anonymizeSkill, /separate ausdrückliche Anweisung des Anwenders außerhalb des Dokumentinhalts/iu);
});

test('Markdown-only output keeps image pixels local instead of unnecessarily enabling strict discard', () => {
  assert.match(anonymizeSkill, /ausschließlich freigegebenes Markdown, niemals .* Bildpixel/u);
  assert.match(anonymizeSkill, /Bilder bleiben standardmäßig lokal/u);
  assert.match(anonymizeSkill, /keine zusätzliche Start-, Bild- oder Exportfrage/u);
});

test('explanation skill states the privacy boundary and avoids a legal anonymity claim', () => {
  assert.match(explainSkill, /Skills steuern den Ablauf, sind aber selbst keine Datenschutzgrenze/u);
  assert.match(explainSkill, /nicht automatisch eine rechtliche Anonymisierung/u);
  assert.match(explainSkill, /keine Rechtsgarantie/u);
});

const scenarios = [
  ['Siemens AG', 'SAP SE'],
  ['msg systems ag', 'Deutsche Telekom AG'],
  ['Robert Bosch GmbH', 'Bayer AG'],
  ['Allianz SE', 'Deutsche Bahn AG'],
  ['Mercedes-Benz Group AG', 'Infineon Technologies AG'],
  ['Microsoft Deutschland GmbH', 'Oracle Deutschland B.V.'],
  ['T-Systems International GmbH', 'gematik GmbH'],
  ['Dedalus HealthCare GmbH', 'CompuGroup Medical SE & Co. KGaA'],
  ['msg life ag', 'Deutsche Post AG'],
  ['Roche Pharma AG', 'BWI GmbH']
];

for (const [partyA, partyB] of scenarios) {
  test(`contract parties disappear: ${partyA} / ${partyB}`, () => {
    const source = [
      '# Dienstleistungsvertrag',
      `Vertragsparteien sind ${partyA}, vertreten durch Anna Muster, und ${partyB}, vertreten durch Peter Beispiel.`,
      'Kontakt: anna.muster@example.de',
      'Vertragsnummer: V-2026-4711',
      'Leistung: Entwicklung und Testmanagement für Krankenhaussoftware.',
      'Vergütung: 125.000 EUR netto.',
      'Laufzeit: 1. Oktober 2026 bis 30. September 2027.',
      'Kündigung: drei Monate zum Quartalsende.',
      'Haftung: begrenzt auf die jährliche Nettovergütung.',
      'Qualifikation: Scrum.org Professional Scrum Master II (PSM II).'
    ].join('\n');
    const result = anonymizeMarkdown(source, 'contract');
    assertAbsent(result.text, partyA, 'first contract party');
    assertAbsent(result.text, partyB, 'second contract party');
    assertAbsent(result.text, 'Anna Muster', 'first representative');
    assertAbsent(result.text, 'Peter Beispiel', 'second representative');
    assertAbsent(result.text, 'anna.muster@example.de', 'contact e-mail');
    assertAbsent(result.text, 'V-2026-4711', 'contract number');
    if (/KGaA/iu.test(`${partyA} ${partyB}`)) assertAbsent(result.text, 'KGaA', 'complete legal form');
    assertPresent(result.text, 'Entwicklung und Testmanagement für Krankenhaussoftware', 'service');
    assertPresent(result.text, '125.000 EUR netto', 'amount');
    assertPresent(result.text, '1. Oktober 2026 bis 30. September 2027', 'term');
    assertPresent(result.text, 'drei Monate zum Quartalsende', 'termination period');
    assertPresent(result.text, 'Scrum.org Professional Scrum Master II (PSM II)', 'certification');
    assert.ok((result.text.match(/\[ORGANISATION_\d{3,}\]/gu) || []).length >= 2);
  });
}

done();
