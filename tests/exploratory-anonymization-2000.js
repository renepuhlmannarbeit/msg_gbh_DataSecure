'use strict';

// Deterministic broad-input regression sweep.  It intentionally uses no real
// people or organisations; every direct identifier is synthetic and unique.
const assert = require('assert');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');

const profiles = ['general', 'customer', 'contract', 'applicant', 'personnel_profile'];
const people = ['Anja Beispiel', 'Martin Hagedorn', 'Elif Yilmaz', 'Jürgen Weiß', 'Sofia Petrovic', 'Nora van Dijk', 'Thomas Müller', 'Lea Schneider', 'Mehmet Kaya', 'Clara Hoffmann', 'Janine Krüger', 'Daniel Fischer', 'Miriam König', 'Felix Bauer', 'Aylin Demir', 'Stefan Wagner'];
const companies = ['Nordlicht Digital GmbH', 'HanseMed Solutions AG', 'Rheinland Data SE', 'Alpenblick IT GmbH', 'Kliniknetz Zukunft AG', 'Gesundheitswerk Nord GmbH', 'MainCloud Services GmbH', 'ElbHealth Systems AG', 'Südwest Informatik GmbH', 'MediCore Plattform SE', 'Bergtal Software GmbH', 'Weser Digital Health AG', 'Isar Prozesswerk GmbH', 'Küstenlogik GmbH', 'Neckar Analytics AG', 'Spree Gesundheitsdaten GmbH'];
const certificates = ['Scrum.org Professional Scrum Master I (PSM I)', 'Scrum.org Professional Scrum Product Owner I (PSPO I)', 'SAFe Agilist', 'ISTQB Certified Tester Foundation Level', 'IREB Certified Professional for Requirements Engineering', 'IPMA Level D', 'PRINCE2 Foundation', 'ITIL 4 Foundation', 'AWS Certified Cloud Practitioner', 'Microsoft Certified: Azure Fundamentals', 'Certified Kubernetes Application Developer', 'HL7 FHIR Proficiency Exam', 'Certified Professional for Healthcare Information and Management Systems', 'TOGAF Enterprise Architecture Foundation', 'ICAgile Certified Professional', 'Professional Scrum with Kanban I'];
const layouts = [
  ({ email, person, org, role, certificate, phone, iban }) => `# Vorgang\nKontakt: ${person}\nE-Mail: ${email}\nTelefon: ${phone}\nIBAN: ${iban}\nKunde: ${org}\nRolle: ${role}\nZertifizierung: ${certificate}`,
  ({ email, person, org, role, certificate, phone, iban }) => `| Feld | Wert |\n|---|---|\n| Ansprechpartner | ${person} |\n| E-Mail | ${email} |\n| Telefon | ${phone} |\n| IBAN | ${iban} |\n| Kunde | ${org} |\n| Rolle | ${role} |\n| Zertifizierung | ${certificate} |`,
  ({ email, person, org, role, certificate, phone, iban }) => `Vertragspartner: ${org}\nVertreten durch ${person}; Rückfragen an ${email}, Telefon ${phone}.\nBankverbindung: ${iban}\nLeistungsinhalt: ${role}.\nNachweis: ${certificate}.`,
  ({ email, person, org, role, certificate, phone, iban }) => `---\ntitle: Fall\nowner: ${person}\n---\nKontakt: ${email}\nTel.: ${phone}\nIBAN ${iban}\nKunde: ${org}\nRolle: ${role}\n## Zertifizierungen\n${certificate}`,
  ({ email, person, org, role, certificate, phone, iban }) => `| Name | E-Mail | Telefon | IBAN | Kunde | Kompetenz |\n|---|---|---|---|---|---|\n| ${person} | ${email} | ${phone} | ${iban} | ${org} | ${role} |\n\n## Zertifizierungen\n${certificate}`,
  ({ email, person, org, role, certificate, phone, iban }) => `## Zertifizierungen\n${certificate}\n\nKontakt: ${person}\nE-Mail: ${email}\nTelefon: ${phone}\nIBAN: ${iban}\nKunde: ${org}\nRolle: ${role}`,
  ({ email, person, org, role, certificate, phone, iban }) => `> Kontakt: ${person}\n> E-Mail: ${email}\n> Telefon: ${phone}\n\n- IBAN: ${iban}\n- Kunde: ${org}\n- Aufgabe: ${role}\n- Zertifikat: ${certificate}`,
  ({ email, person, org, role, certificate, phone, iban }) => `<div>Kontakt: ${person}; ${email}; ${phone}; ${iban}</div>\n\nKunde: ${org}\nRolle: ${role}\nZertifizierung: ${certificate}`
];
const roles = ['Product Owner', 'Scrum Master', 'Softwareentwickler', 'Testmanager', 'Business Analyst', 'FHIR-Entwickler', 'QA Engineer', 'IT-Projektleitung'];

function mod97(digits) { let remainder = 0; for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97; return remainder; }
function germanIban(index) { const bban = `37040044${String(1000000000 + index).slice(-10)}`; const check = String(98 - mod97(`${bban}131400`)).padStart(2, '0'); return `DE${check}${bban}`; }

let passed = 0;
for (let index = 0; index < 2000; index++) {
  const serial = String(index + 1).padStart(4, '0');
  const input = {
    person: people[index % people.length],
    email: `fall-${serial}@privacy-example.test`,
    org: companies[(index * 3) % companies.length],
    role: roles[index % roles.length],
    certificate: certificates[(index * 5) % certificates.length],
    phone: `+49 171 ${String(1000000 + index).slice(-7)}`,
    iban: germanIban(index)
  };
  const profile = profiles[index % profiles.length];
  const raw = layouts[index % layouts.length](input);
  let result;
  try {
    result = anonymizeMarkdown(raw, profile);
  } catch (error) {
    throw new Error(`case ${serial} (${profile}, layout ${index % layouts.length}) stopped: ${error.message}`);
  }
  const released = result.text.toLocaleLowerCase('de-DE');
  assert.ok(!released.includes(input.email.toLocaleLowerCase('de-DE')), `case ${serial}: email survived`);
  assert.ok(!released.includes(input.person.toLocaleLowerCase('de-DE')), `case ${serial}: person survived`);
  assert.ok(!released.includes(input.org.toLocaleLowerCase('de-DE')), `case ${serial}: company survived`);
  assert.ok(!released.includes(input.phone.toLocaleLowerCase('de-DE')), `case ${serial}: phone survived`);
  assert.ok(!released.includes(input.iban.toLocaleLowerCase('de-DE')), `case ${serial}: IBAN survived`);
  assert.ok(released.includes(input.role.toLocaleLowerCase('de-DE')), `case ${serial}: professional content lost`);
  assert.ok(released.includes(input.certificate.toLocaleLowerCase('de-DE')), `case ${serial}: certificate lost`);
  const second = anonymizeMarkdown(result.text, profile);
  assert.strictEqual(second.text, result.text, `case ${serial}: release is not idempotent`);
  passed += 1;
}

console.log(`Exploratory anonymization sweep: ${passed} passed, 0 failed`);
