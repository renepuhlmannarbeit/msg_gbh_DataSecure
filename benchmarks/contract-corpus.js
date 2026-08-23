'use strict';

// Deterministic, synthetic ground truth shared by product acceptance and
// detector benchmarks. Company names are public test tokens; every person,
// address and contract detail is invented.

const companies = [
  'Siemens AG', 'SAP SE', 'msg systems ag', 'Deutsche Telekom AG', 'Robert Bosch GmbH',
  'Bayer AG', 'Allianz SE', 'Deutsche Bahn AG', 'Mercedes-Benz Group AG',
  'Infineon Technologies AG', 'Microsoft Deutschland GmbH', 'Oracle Deutschland B.V.',
  'T-Systems International GmbH', 'gematik GmbH', 'Dedalus HealthCare GmbH',
  'CompuGroup Medical SE & Co. KGaA', 'msg life ag', 'Deutsche Post AG',
  'Roche Pharma AG', 'BWI GmbH', 'Airbus SE', 'Bechtle AG', 'adesso SE',
  'NTT DATA Deutschland SE', 'Accenture GmbH', 'Capgemini Deutschland GmbH',
  'IBM Deutschland GmbH', 'Amazon Web Services EMEA SARL', 'Google Germany GmbH',
  'Siemens Healthineers AG'
];

const people = [
  'Anna Muster', 'Peter Beispiel', 'Özlem Yilmaz', 'Jörg Weiß', 'María García',
  'François Dupont', 'Søren Hansen', 'Élodie Martin', 'André Müller', 'Chloë Bernard',
  'Günther Groß', 'Änne Öztürk', 'Renée Laurent', 'Björn Ångström', 'Zoë Klein',
  'Hans-Jürgen Meier', 'Eva-Maria Schmitt', "Liam O'Connor", 'Jean-Luc Picard',
  'Max Mustermann', 'Erika Beispiel', 'Thomas Müller', 'Sabine König', 'Dieter Groß',
  'Fatima Özdemir', 'Rüdiger Heß', 'Inès Moreau', 'Maël Dubois', 'Cécile Noël',
  'Anaïs Fontaine'
];

const streets = [
  'Hafenstraße 12', 'Am Stadtpark 7', 'Robert-Bosch-Straße 18', 'Königsallee 22',
  'Unter den Linden 5', 'An der Alster 9', 'Musterweg 14a', 'Europaplatz 3',
  'Friedrich-Ebert-Allee 40', 'Im Technologiepark 11'
];
const cities = [
  '20457 Hamburg', '10117 Berlin', '80333 München', '50667 Köln', '60311 Frankfurt',
  '70173 Stuttgart', '01067 Dresden', '04109 Leipzig', '28195 Bremen', '90402 Nürnberg'
];

const severity = {
  ORGANIZATION: 3,
  PERSON: 5,
  STREET_ADDRESS: 4,
  POSTAL_ADDRESS: 4,
  EMAIL: 5,
  PHONE: 5,
  REFERENCE_ID: 4,
  IBAN: 5,
  BIC: 4,
  DATE_OF_BIRTH: 5
};

function partyLines(kind, a, b, p1, p2, language) {
  if (language === 'en') {
    if (kind === 0) return [`Agreement between ${a}, represented by ${p1}, and ${b}, represented by ${p2}.`];
    if (kind === 1) return [`Parties are ${a}; and ${b}.`, `Representative: ${p1}`, `Contact person: ${p2}`];
    if (kind === 2) return [`Client: ${a}`, `Supplier: ${b}`, `Representative: ${p1}`, `Contact person: ${p2}`];
    if (kind === 3) return [`| Client | ${a} |`, `| Supplier | ${b} |`, `| Representative | ${p1} |`, `| Contact person | ${p2} |`];
    if (kind === 4) return [`- Company: ${a}`, `- Contract party: ${b}`, `- Representative: ${p1}`, `- Contact person: ${p2}`];
    return [`Service agreement between ${a}, represented by ${p1}, and ${b}, represented by ${p2}.`];
  }
  if (kind === 0) return [`Vertrag zwischen ${a}, vertreten durch ${p1}, und ${b}, vertreten durch ${p2}.`];
  if (kind === 1) return [`Vertragsparteien sind ${a}; und ${b}.`, `Vertreter: ${p1}`, `Kontaktperson: ${p2}`];
  if (kind === 2) return [`Auftraggeber: ${a}`, `Auftragnehmer: ${b}`, `Ansprechpartner: ${p1}`, `Vertreter: ${p2}`];
  if (kind === 3) return [`| Auftraggeber | ${a} |`, `| Auftragnehmer | ${b} |`, `| Ansprechpartner | ${p1} |`, `| Kontaktperson | ${p2} |`];
  if (kind === 4) return [`- Unternehmen: ${a}`, `- Vertragspartner: ${b}`, `- Ansprechpartner: ${p1}`, `- Vertreter: ${p2}`];
  return [`Vereinbarung zwischen ${a}, vertreten durch ${p1}, und ${b}, vertreten durch ${p2}.`];
}

function locateAll(source, specs) {
  const spans = [];
  const seen = new Set();
  for (const spec of specs) {
    let from = 0;
    while (from <= source.length) {
      const start = source.indexOf(spec.value, from);
      if (start < 0) break;
      const end = start + spec.value.length;
      const id = `${spec.type}:${start}:${end}`;
      if (!seen.has(id)) {
        seen.add(id);
        spans.push({ ...spec, start, end });
      }
      from = end || start + 1;
    }
  }
  return spans.sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type));
}

// The generator intentionally remains deterministic. It gives the regression
// suite a large, reproducible ground-truth corpus without ever storing real
// business documents in the repository.
function createContractCorpus(count = 1000) {
  const corpus = [];
  for (let index = 0; index < count; index++) {
    const language = index % 4 === 3 ? 'en' : 'de';
    const partyA = companies[index % companies.length];
    let partyB = companies[(index * 7 + 11) % companies.length];
    if (partyB === partyA) partyB = companies[(index + 1) % companies.length];
    const personA = people[index % people.length];
    const personB = people[(index * 11 + 3) % people.length];
    const street = streets[index % streets.length];
    const city = cities[(index * 3 + 2) % cities.length];
    const emailA = `kontakt.${index + 1}@example.de`;
    const emailB = `vertrag.${index + 1}@example.org`;
    const contractId = `RV-${2026 + (index % 3)}-${String(index + 1).padStart(4, '0')}`;
    const phone = `+49 30 ${String(7000000 + index).padStart(7, '0')}`;
    const birthDate = `${String((index % 27) + 1).padStart(2, '0')}.02.${1970 + (index % 25)}`;
    const english = language === 'en';
    const service = english
      ? `Service component ${index + 1}: software engineering, test management and quality assurance for hospital software.`
      : `Leistungsbaustein ${index + 1}: Entwicklung, Testmanagement und Qualitätssicherung für Krankenhaussoftware.`;
    const amount = english ? `Remuneration: ${125000 + index * 100} EUR net.` : `Vergütung: ${125000 + index * 100} EUR netto.`;
    const term = english
      ? `Term: 1 October ${2026 + (index % 3)} to 30 September ${2027 + (index % 3)}.`
      : `Laufzeit: 1. Oktober ${2026 + (index % 3)} bis 30. September ${2027 + (index % 3)}.`;
    const cancellation = english ? `Notice period: ${(index % 6) + 1} months to quarter end.` : `Kündigungsfrist: ${(index % 6) + 1} Monate zum Quartalsende.`;
    const liability = english ? 'Liability: limited to the annual net remuneration.' : 'Haftung: begrenzt auf die jährliche Nettovergütung.';
    const certification = english ? 'Certification: Scrum.org Professional Scrum Master II (PSM II).' : 'Qualifikation: Scrum.org Professional Scrum Master II (PSM II).';
    const source = [
      `# ${english ? (index % 2 ? 'Master service agreement' : 'Service agreement') : (index % 2 ? 'Rahmenvertrag' : 'Dienstleistungsvertrag')} ${index + 1}`,
      ...partyLines(index % 6, partyA, partyB, personA, personB, language),
      `${english ? 'Address' : 'Anschrift'}: ${street}, ${city}`,
      `${english ? 'Email' : 'E-Mail'}: ${emailA}; ${emailB}`,
      `${english ? 'Phone' : 'Telefon'}: ${phone}`,
      `${english ? 'Contract number' : 'Vertragsnummer'}: ${contractId}`,
      'IBAN: DE02 1203 0000 0000 2020 51',
      'BIC: BYLADEM1001',
      `${english ? 'Date of birth' : 'Geburtsdatum'}: ${birthDate}`,
      service,
      amount,
      term,
      cancellation,
      liability,
      certification
    ].join('\n');

    const entitySpecs = [
      ['ORGANIZATION', partyA], ['ORGANIZATION', partyB],
      ['PERSON', personA], ['PERSON', personB],
      ['STREET_ADDRESS', street], ['POSTAL_ADDRESS', city],
      ['EMAIL', emailA], ['EMAIL', emailB], ['PHONE', phone],
      ['REFERENCE_ID', contractId], ['IBAN', 'DE02 1203 0000 0000 2020 51'],
      ['BIC', 'BYLADEM1001'], ['DATE_OF_BIRTH', birthDate]
    ].map(([type, value]) => ({ type, value, severity: severity[type] }));
    const preservedSpecs = [
      ['service', service], ['amount', amount], ['term', term],
      ['cancellation', cancellation], ['liability', liability],
      ['certification', certification]
    ].map(([category, value]) => ({ type: category, category, value }));

    corpus.push({
      id: `contract-${String(index + 1).padStart(4, '0')}`,
      profile: 'contract',
      source_format: 'txt',
      language,
      document_type: 'contract',
      layout: index % 6 + 1,
      source,
      entities: locateAll(source, entitySpecs),
      preserved: locateAll(source, preservedSpecs),
      values: { partyA, partyB, personA, personB, street, city, emailA, emailB, phone, contractId, birthDate }
    });
  }
  return corpus;
}

function createProfileCorpus(count = 500) {
  const corpus = [];
  const roles = ['Product Owner', 'Scrum Master', 'Business Analyst', 'Testmanager', 'Softwareentwickler'];
  const certificates = [
    'Scrum.org Professional Scrum Master II (PSM II)',
    'Scrum.org Professional Scrum Product Owner I (PSPO I)',
    'Microsoft Azure Administrator Associate',
    'ISTQB Certified Tester Foundation Level',
    'HL7 FHIR Proficiency Exam'
  ];
  for (let index = 0; index < count; index++) {
    const profile = ['personnel_profile', 'applicant', 'customer'][index % 3];
    const person = people[(index * 3 + 5) % people.length];
    const company = companies[(index * 13 + 2) % companies.length];
    const role = roles[index % roles.length];
    const certificate = certificates[index % certificates.length];
    const email = `${profile.replace(/_/gu, '.')}.${index + 1}@example.de`;
    const phone = `+49 40 ${String(7100000 + index).padStart(7, '0')}`;
    const url = 'example.de';
    let source;
    let documentType;
    let preserved;
    if (profile === 'personnel_profile') {
      documentType = 'personnel_profile';
      source = [
        '# Mitarbeiterprofil', `Name: ${person}`, `E-Mail: ${email}`, `Telefon: ${phone}`,
        `Kunde: ${company}`, `Rolle: ${role}`, 'Zertifizierungen', certificate,
        'Technologien: Java, SQL, HL7 FHIR', 'Branche: Gesundheitswesen'
      ].join('\n');
      preserved = [
        ['role', `Rolle: ${role}`], ['certificate', certificate],
        ['technology', 'Technologien: Java, SQL, HL7 FHIR'], ['industry', 'Branche: Gesundheitswesen']
      ];
    } else if (profile === 'applicant') {
      documentType = 'application';
      source = [
        '# Bewerbung', `Name: ${person}`, `E-Mail: ${email}`, `Telefon: ${phone}`,
        `Arbeitgeber: ${company}`, `Zertifikat: ${certificate}`, `Zielrolle: ${role}`,
        'Kenntnisse: Java, SQL, Testautomatisierung'
      ].join('\n');
      preserved = [
        ['certificate', certificate], ['role', `Zielrolle: ${role}`],
        ['technology', 'Kenntnisse: Java, SQL, Testautomatisierung']
      ];
    } else {
      documentType = 'customer_record';
      source = [
        '# Kundenvorgang', `Kunde: ${company}`, `Ansprechpartner: ${person}`,
        `E-Mail: ${email}`, `Telefon: ${phone}`,
        `Anliegen: Qualitätssicherung für Krankenhaussoftware in der Rolle ${role}.`,
        'Priorität: Hoch'
      ].join('\n');
      preserved = [
        ['request', `Anliegen: Qualitätssicherung für Krankenhaussoftware in der Rolle ${role}.`],
        ['priority', 'Priorität: Hoch']
      ];
    }
    const entitySpecs = [
      ['PERSON', person], ['ORGANIZATION', company], ['EMAIL', email], ['URL', url], ['PHONE', phone]
    ].map(([type, value]) => ({ type, value, severity: severity[type] || 4 }));
    corpus.push({
      id: `profile-${String(index + 1).padStart(4, '0')}`,
      profile,
      source_format: 'txt',
      language: 'de',
      document_type: documentType,
      layout: index % 3 + 1,
      source,
      entities: locateAll(source, entitySpecs),
      preserved: locateAll(source, preserved.map(([category, value]) => ({ type: category, category, value }))),
      values: { person, company, email, phone, certificate }
    });
  }
  return corpus;
}

function createAcceptanceCorpus(count = 1000) {
  const requested = Number.isSafeInteger(count) && count > 0 ? count : 1000;
  const contracts = Math.ceil(requested / 2);
  return [...createContractCorpus(contracts), ...createProfileCorpus(requested - contracts)];
}

module.exports = {
  createContractCorpus, createProfileCorpus, createAcceptanceCorpus,
  companies, people, streets, cities
};
