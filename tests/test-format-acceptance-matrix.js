'use strict';

// A real-pipeline matrix complements the large text corpus: every format that
// the pilot advertises must reach the shared released-Markdown boundary.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const { zipStore } = require('./lib/zip');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-format-matrix-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');
const gateway = require('../plugins/data-secure/server/gateway');
const { detectProfileFromMarkdown } = require('../plugins/data-secure/server/gateway/common');
const { test, testAsync, done, assert } = createSuite('Released format acceptance matrix');

const CASES = [
  {
    id: 'de',
    expectedProfile: 'personnel_profile',
    sourceText: [
      'Mitarbeiterprofil', 'Name: Erika Beispiel', 'E-Mail: erika.beispiel@example.invalid',
      'Telefon: +49 221 5551234', 'IBAN: DE89370400440532013000',
      'Unternehmen: Beispiel Health IT GmbH',
      'Zertifizierungen: Scrum.org Professional Scrum Master I (PSM I), PeopleCert GmbH ITIL 4 Foundation, SAFe Agilist',
      'Rolle: Product Owner und Testmanager für klinische Integrationsplattformen'
    ].join('\n'),
    csv: [
      'Name;E-Mail;Telefon;IBAN;Unternehmen;Zertifizierungen;Rolle',
      'Erika Beispiel;erika.beispiel@example.invalid;+49 221 5551234;DE89370400440532013000;Beispiel Health IT GmbH;Scrum.org Professional Scrum Master I (PSM I), PeopleCert GmbH ITIL 4 Foundation;Product Owner und Testmanager'
    ].join('\n'),
    identifiers: ['Erika Beispiel', 'erika.beispiel@example.invalid', '+49 221 5551234', 'DE89370400440532013000', 'Beispiel Health IT GmbH'],
    headers: '| Name | E-Mail | Telefon | IBAN | Unternehmen | Zertifizierungen | Rolle |',
    preserved: ['Scrum.org Professional Scrum Master I (PSM I)', 'PeopleCert GmbH ITIL 4 Foundation', 'Product Owner', 'Testmanager']
  },
  {
    id: 'en',
    expectedProfile: 'personnel_profile',
    sourceText: [
      'Consultant Profile', 'Name: Alice Example', 'Email: alice.example@example.invalid',
      'Phone: +44 20 7946 0958', 'IBAN: DE89370400440532013000',
      'Company: Example Health IT Ltd.',
      'Certifications: Scrum.org Professional Scrum Master I (PSM I), PeopleCert GmbH ITIL 4 Foundation',
      'Role: Product Owner and Test Manager for healthcare integration platforms'
    ].join('\n'),
    csv: [
      'Name;Email;Phone;IBAN;Company;Certifications;Role',
      'Alice Example;alice.example@example.invalid;+44 20 7946 0958;DE89370400440532013000;Example Health IT Ltd.;Scrum.org Professional Scrum Master I (PSM I), PeopleCert GmbH ITIL 4 Foundation;Product Owner and Test Manager'
    ].join('\n'),
    identifiers: ['Alice Example', 'alice.example@example.invalid', '+44 20 7946 0958', 'DE89370400440532013000', 'Example Health IT Ltd.'],
    headers: '| Name | Email | Phone | IBAN | Company | Certifications | Role |',
    preserved: ['Scrum.org Professional Scrum Master I (PSM I)', 'PeopleCert GmbH ITIL 4 Foundation', 'Product Owner', 'Test Manager']
  },
  {
    id: 'fr',
    expectedProfile: 'personnel_profile',
    sourceText: [
      'Profil consultant', 'Nom: Élodie Martin', 'E-mail: elodie.martin@example.invalid',
      'Téléphone: +33 1 42 68 53 00', 'Entreprise: Exemple Santé Numérique SAS',
      'Certification: ITIL 4 Foundation', 'Rôle: Product Owner pour les plateformes de santé numérique'
    ].join('\n'),
    csv: [
      'Nom;E-mail;Téléphone;Entreprise;Certification;Rôle',
      'Élodie Martin;elodie.martin@example.invalid;+33 1 42 68 53 00;Exemple Santé Numérique SAS;ITIL 4 Foundation;Product Owner pour les plateformes de santé numérique'
    ].join('\n'),
    identifiers: ['Élodie Martin', 'elodie.martin@example.invalid', '+33 1 42 68 53 00', 'Exemple Santé Numérique SAS'],
    headers: '| Nom | E-mail | Téléphone | Entreprise | Certification | Rôle |',
    preserved: ['ITIL 4 Foundation', 'Product Owner', 'plateformes de santé numérique']
  },
  {
    id: 'es',
    expectedProfile: 'personnel_profile',
    sourceText: [
      'Perfil profesional', 'Nombre: Lucía García', 'Correo: lucia.garcia@example.invalid',
      'Teléfono: +34 91 123 45 67', 'Empresa: Ejemplo Salud Digital S.L.',
      'Certificación: PSM I', 'Rol: Scrum Master para integración sanitaria'
    ].join('\n'),
    csv: [
      'Nombre;Correo;Teléfono;Empresa;Certificación;Rol',
      'Lucía García;lucia.garcia@example.invalid;+34 91 123 45 67;Ejemplo Salud Digital S.L.;PSM I;Scrum Master para integración sanitaria'
    ].join('\n'),
    identifiers: ['Lucía García', 'lucia.garcia@example.invalid', '+34 91 123 45 67', 'Ejemplo Salud Digital S.L.'],
    headers: '| Nombre | Correo | Teléfono | Empresa | Certificación | Rol |',
    preserved: ['PSM I', 'Scrum Master', 'integración sanitaria']
  },
  {
    id: 'nl',
    expectedProfile: 'personnel_profile',
    sourceText: [
      'Consultantprofiel', 'Naam: Noor van Dijk', 'E-mail: noor.vandijk@example.invalid',
      'Telefoon: +31 20 123 4567', 'Bedrijf: Voorbeeld Zorg IT B.V.',
      'Certificering: ISTQB Foundation', 'Rol: Business Analyst voor zorgintegratie'
    ].join('\n'),
    csv: [
      'Naam;E-mail;Telefoon;Bedrijf;Certificering;Rol',
      'Noor van Dijk;noor.vandijk@example.invalid;+31 20 123 4567;Voorbeeld Zorg IT B.V.;ISTQB Foundation;Business Analyst voor zorgintegratie'
    ].join('\n'),
    identifiers: ['Noor van Dijk', 'noor.vandijk@example.invalid', '+31 20 123 4567', 'Voorbeeld Zorg IT B.V.'],
    headers: '| Naam | E-mail | Telefoon | Bedrijf | Certificering | Rol |',
    preserved: ['ISTQB Foundation', 'Business Analyst', 'zorgintegratie']
  },
  {
    id: 'contract',
    expectedProfile: 'contract',
    sourceText: [
      'Rahmenvertrag', 'Vertragspartei: Beispiel Klinik GmbH', 'Ansprechpartner: Erika Beispiel',
      'E-Mail: erika.beispiel@example.invalid', 'IBAN: DE89370400440532013000',
      'Haftung und Kündigung', 'Leistungsumfang: FHIR-Integrationsplattform und Testautomatisierung'
    ].join('\n'),
    csv: [
      'Vertrag;Vertragspartei;Ansprechpartner;E-Mail;IBAN;Leistungsumfang',
      'Rahmenvertrag;Beispiel Klinik GmbH;Erika Beispiel;erika.beispiel@example.invalid;DE89370400440532013000;FHIR-Integrationsplattform und Testautomatisierung'
    ].join('\n'),
    identifiers: ['Beispiel Klinik GmbH', 'Erika Beispiel', 'erika.beispiel@example.invalid', 'DE89370400440532013000'],
    headers: '| Vertrag | Vertragspartei | Ansprechpartner | E-Mail | IBAN | Leistungsumfang |',
    preserved: ['FHIR-Integrationsplattform', 'Testautomatisierung']
  },
  {
    id: 'applicant',
    expectedProfile: 'applicant',
    sourceText: [
      'Bewerbung', 'Lebenslauf', 'Name: Erika Beispiel', 'E-Mail: erika.beispiel@example.invalid',
      'Telefon: +49 221 5551234', 'Wohnort: Köln',
      'Zertifizierungen: Scrum.org Professional Scrum Master I (PSM I)',
      'Motivation: Product Owner für digitale Gesundheitsanwendungen'
    ].join('\n'),
    csv: [
      'Bewerbung;Lebenslauf;Name;E-Mail;Telefon;Wohnort;Zertifizierungen;Motivation',
      'Bewerbung;Lebenslauf;Erika Beispiel;erika.beispiel@example.invalid;+49 221 5551234;Köln;Scrum.org Professional Scrum Master I (PSM I);Product Owner für digitale Gesundheitsanwendungen'
    ].join('\n'),
    identifiers: ['Erika Beispiel', 'erika.beispiel@example.invalid', '+49 221 5551234', 'Köln'],
    headers: '| Bewerbung | Lebenslauf | Name | E-Mail | Telefon | Wohnort | Zertifizierungen | Motivation |',
    preserved: ['Scrum.org Professional Scrum Master I (PSM I)', 'Product Owner', 'digitale Gesundheitsanwendungen']
  },
  {
    id: 'customer',
    expectedProfile: 'customer',
    sourceText: [
      'Kundenvorgang', 'Kundennummer: 4711', 'Kunde: Beispiel Klinik GmbH',
      'Ansprechpartner: Erika Beispiel', 'E-Mail: erika.beispiel@example.invalid',
      'Telefon: +49 221 5551234', 'Ticket: INC-2026-001',
      'Support: FHIR-Schnittstelle für die Testautomatisierung'
    ].join('\n'),
    csv: [
      'Kundennummer;Kunde;Ansprechpartner;E-Mail;Telefon;Ticket;Support',
      '4711;Beispiel Klinik GmbH;Erika Beispiel;erika.beispiel@example.invalid;+49 221 5551234;INC-2026-001;FHIR-Schnittstelle für die Testautomatisierung'
    ].join('\n'),
    identifiers: ['Beispiel Klinik GmbH', 'Erika Beispiel', 'erika.beispiel@example.invalid', '+49 221 5551234'],
    headers: '| Kundennummer | Kunde | Ansprechpartner | E-Mail | Telefon | Ticket | Support |',
    preserved: ['FHIR-Schnittstelle', 'Testautomatisierung']
  }
];

// Keep the matrix deterministic and fully synthetic.  These variants exercise
// the real reader → detector → residual gate → released-Markdown path with
// different direct identifiers, rather than merely changing a source_format
// field in a benchmark record.  Eight base cases plus seventeen variants make
// exactly one hundred format/container runs below.
const VARIANT_PEOPLE = [
  'Anna Krüger', 'Benedikt Wolf', 'Clara Hansen', 'David Neumann',
  'Emilia Berger', 'Felix König', 'Greta Schmitt', 'Hannes Vogel',
  'Ines Richter', 'Jonas Weber', 'Katrin Brandt', 'Lars Hoffmann',
  'Mara Stein', 'Nico Falk', 'Olivia Kern', 'Paul Winter', 'Rita Sommer'
];

function replaceEverywhere(value, from, to) {
  return value.split(from).join(to);
}

function makeVariant(base, index) {
  const person = VARIANT_PEOPLE[index];
  const email = `matrix.${index + 1}@example.invalid`;
  const phone = `+49 221 55${String(1000 + index).padStart(4, '0')}`;
  const replacements = new Map();

  // Contract/customer cases put the organisation first; every other fixture
  // starts with its labelled person.  Keep the legal-form organisation intact
  // so this remains a test of the person field rather than accidentally
  // replacing a company with a name-shaped, suffix-less value.
  const personIndex = ['contract', 'customer'].includes(base.id) ? 1 : 0;
  if (base.identifiers[personIndex]) replacements.set(base.identifiers[personIndex], person);
  if (base.identifiers[1] && base.identifiers[1].includes('@')) replacements.set(base.identifiers[1], email);
  for (const identifier of base.identifiers) {
    if (identifier.startsWith('+')) replacements.set(identifier, phone);
  }

  let sourceText = base.sourceText;
  let csv = base.csv;
  for (const [from, to] of replacements) {
    sourceText = replaceEverywhere(sourceText, from, to);
    csv = replaceEverywhere(csv, from, to);
  }

  return {
    ...base,
    id: `${base.id}-variant-${index + 1}`,
    sourceText,
    csv,
    identifiers: base.identifiers.map((identifier) => replacements.get(identifier) || identifier)
  };
}

const PIPELINE_CASES = CASES.concat(
  Array.from({ length: 17 }, (_, index) => makeVariant(CASES[index % CASES.length], index))
);

function docx(text) {
  const body = text.split('\n').map((line) =>
    `<w:p><w:r><w:t>${line.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`
  ).join('');
  return zipStore([
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`]
  ]);
}

function writeFormat(extension, sample) {
  const source = path.join(root, `format-matrix-${sample.id}${extension}`);
  if (extension === '.csv') {
    fs.writeFileSync(source, sample.csv, 'utf8');
  } else if (extension === '.docx') {
    fs.writeFileSync(source, docx(sample.sourceText));
  } else {
    fs.writeFileSync(source, extension === '.md' ? `# Profile\n\n${sample.sourceText}` : sample.sourceText, 'utf8');
  }
  return source;
}

test('two isolated profile labels do not over-classify a general document as a personnel profile', () => {
  assert.strictEqual(detectProfileFromMarkdown('Product outline\nCompany: Example Ltd.\nRole: Product Owner'), 'general');
  assert.strictEqual(detectProfileFromMarkdown('Note\nEntreprise: Exemple SAS\nRôle: Product Owner'), 'general');
  assert.strictEqual(detectProfileFromMarkdown('Nota\nEmpresa: Ejemplo S.L.\nRol: Product Owner'), 'general');
  assert.strictEqual(detectProfileFromMarkdown('Notitie\nBedrijf: Voorbeeld B.V.\nRol: Product Owner'), 'general');
});

async function main() {
  assert.strictEqual(PIPELINE_CASES.length, 25, 'the deterministic matrix has 25 documents');
  for (const sample of PIPELINE_CASES) for (const extension of ['.txt', '.md', '.csv', '.docx']) {
    await testAsync(`${sample.id} ${extension} reaches released Markdown with the shared privacy contract`, async () => {
      const result = await gateway._internal.anonymizeSelectedSource(writeFormat(extension, sample), 'auto');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.profile, sample.expectedProfile, `${extension} automatic profile`);
      const output = gateway.readOutput(result.package_id, result.read_capability, 0, 30_000).text;
      for (const identifier of sample.identifiers) {
        assertAbsent(output, identifier, `${extension} direct identifier`);
      }
      for (const preserved of sample.preserved) assertPresent(output, preserved, `${extension} professional content`);
      if (extension === '.csv') {
        assertPresent(output, sample.headers, 'CSV headers');
      }
      assert.strictEqual(result.raw_content_sent_to_claude, false);
    });
  }
  done();
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
