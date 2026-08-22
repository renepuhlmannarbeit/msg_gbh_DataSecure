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

function partyLines(kind, a, b, p1, p2) {
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

function createContractCorpus(count = 150) {
  const corpus = [];
  for (let index = 0; index < count; index++) {
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
    const service = `Leistungsbaustein ${index + 1}: Entwicklung, Testmanagement und Qualitätssicherung für Krankenhaussoftware.`;
    const amount = `Vergütung: ${125000 + index * 100} EUR netto.`;
    const term = `Laufzeit: 1. Oktober ${2026 + (index % 3)} bis 30. September ${2027 + (index % 3)}.`;
    const cancellation = `Kündigungsfrist: ${(index % 6) + 1} Monate zum Quartalsende.`;
    const liability = 'Haftung: begrenzt auf die jährliche Nettovergütung.';
    const certification = 'Qualifikation: Scrum.org Professional Scrum Master II (PSM II).';
    const source = [
      `# ${index % 2 ? 'Rahmenvertrag' : 'Dienstleistungsvertrag'} ${index + 1}`,
      ...partyLines(index % 6, partyA, partyB, personA, personB),
      `Anschrift: ${street}, ${city}`,
      `E-Mail: ${emailA}; ${emailB}`,
      `Telefon: ${phone}`,
      `Vertragsnummer: ${contractId}`,
      'IBAN: DE02 1203 0000 0000 2020 51',
      'BIC: BYLADEM1001',
      `Geburtsdatum: ${birthDate}`,
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
      id: `contract-${String(index + 1).padStart(3, '0')}`,
      profile: 'contract',
      layout: index % 6 + 1,
      source,
      entities: locateAll(source, entitySpecs),
      preserved: locateAll(source, preservedSpecs),
      values: { partyA, partyB, personA, personB, street, city, emailA, emailB, phone, contractId, birthDate }
    });
  }
  return corpus;
}

module.exports = { createContractCorpus, companies, people, streets, cities };
