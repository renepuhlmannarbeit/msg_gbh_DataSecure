'use strict';

// Evaluation reference, not a detector/allowlist. Never import production
// recognition, generated output, or the adapter under test here.
const people = ['Amina Lindenfels', 'Boris Quastenbach', 'Celia Wiesenberg',
  'Dario Falkenwald', 'Elena Tannenbruch', 'Farid Birkenau'];
const companies = ['Wiesenlabor GmbH', 'Falkenquell AG', 'Lindenwerk GmbH'];
const families = [
  ['labelled', 'Name: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}'],
  ['prose', '{person} arbeitet bei {company}.\nKontakt: {email}\nTelefon: {phone}'],
  ['author', 'Autor: {person}\nFirma: {company}\nRückfragen: {email}\nTelefon: {phone}'],
  ['conversation', 'Gesprächspartner: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}'],
  ['repetition', 'Name: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}\nName: {person}'],
  ['honorific', 'Frau {person} arbeitet bei {company}.\nE-Mail: {email}\nTelefon: {phone}'],
  ['surname-context', 'Name: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}\nDer Sommer ist warm.'],
  ['technical-context', 'Name: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}\nService Level und Fail Closed sind technische Begriffe.'],
  // Reserved acceptance templates/identities; never pass expectations to the
  // detector. This is a declared split, NOT a claim of blinded human review.
  ['holdout-negation', 'Name: {person}\nUnternehmen: {company}\nE-Mail: {email}\nTelefon: {phone}\nNicht {person}, sondern das Team dokumentiert die Wartung.'],
  ['holdout-parenthesis', 'Verantwortliche: {person}\nFirma: {company}\nKontakt ({email})\nTelefon: {phone}']
];
const kept = ['FHIR', 'Kubernetes', 'ISO 27001', 'Service Level', 'Fail Closed',
  'Synthetischer Härtetest', 'Die Messung beträgt 42 Prozent.'];

function occurrences(text, value) {
  const ranges = [];
  for (let start = text.indexOf(value); start >= 0; start = text.indexOf(value, start + value.length)) {
    ranges.push({ start, end: start + value.length });
  }
  return ranges;
}

function createQualityReference() {
  return families.flatMap(([family, template], familyIndex) => people.map((base, index) => {
    const split = familyIndex < 8 ? 'development' : 'holdout';
    const person = split === 'holdout' ? `Zora ${['Eibenhang', 'Felsenrain', 'Weidenbruch', 'Kieselwald', 'Erlenbach', 'Farnwinkel'][index]}` : base;
    const company = companies[index % companies.length];
    const email = `qa${familyIndex}${index}@quality.example.invalid`;
    const phone = `+49 30 555 ${String(1000 + familyIndex * 10 + index)}`;
    const values = { person, company, email, phone };
    // Free uppercase headings exercise actual residual Keep/Company review,
    // not just already detected identity fields. Only development templates.
    const heading = family === 'labelled' ? 'SYNTHETISCHER HÄRTETEST\n'
      : family === 'author' ? 'WIESENLABOR CONSULT\n' : '';
    const reference = `${heading}${template.replace(/\{(\w+)\}/gu, (_, key) => values[key])}\n${kept.join('\n')}`;
    const entities = [['PERSON', person], ['ORGANIZATION', company], ['EMAIL', email], ['PHONE', phone]]
      .flatMap(([type, value]) => occurrences(reference, value).map(range => ({ ...range, type, value,
        severity: type === 'PERSON' || type === 'EMAIL' ? 3 : 2 })));
    if (family === 'author') entities.push(...occurrences(reference, 'WIESENLABOR CONSULT')
      .map(range => ({ ...range, type: 'ORGANIZATION', value: 'WIESENLABOR CONSULT', severity: 2 })));
    const preserve = kept.concat(family === 'surname-context' ? ['Der Sommer ist warm.'] : [])
      .flatMap(value => occurrences(reference, value).map(range => ({ ...range, value, category: 'technical_content' })));
    if (family === 'labelled') preserve.push(...occurrences(reference, 'SYNTHETISCHER HÄRTETEST')
      .map(range => ({ ...range, value: 'SYNTHETISCHER HÄRTETEST', category: 'technical_title' })));
    // DS-012 requires removing gendered salutations bound to a person. This
    // independent occurrence annotation is NOT a global exemption for Frau,
    // nor part of the name itself. Extraction must still preserve the source.
    const privacy_redactions = family === 'honorific' ? [{ start: 0, end: 4, value: 'Frau',
      category: 'gendered_salutation', policy: 'DS-012', person_start: 5, person_end: 5 + person.length }] : [];
    return { id: `quality-${String(familyIndex * 6 + index + 1).padStart(3, '0')}`, family, split,
      profile: 'personnel_profile', reference, entities, preserve, privacy_redactions,
      annotation_status: 'synthetic-reference-not-human-adjudicated', location: 'Quelltext / Hauptinhalt' };
  }));
}

module.exports = { createQualityReference };
