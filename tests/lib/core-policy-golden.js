'use strict';

const { zipStore } = require('./zip');
const { opcControlEntries } = require('./opc');
const profiles = Object.freeze(['general', 'contract', 'customer', 'applicant', 'personnel_profile']);
const formats = Object.freeze(['txt', 'md', 'csv', 'docx']);
const reviewProfiles = Object.freeze(['applicant', 'personnel_profile']);

// Fixed synthetic semantics; expected privacy results never come from the
// implementation under test. This is still not exhaustive policy coverage.
const documents = Object.freeze([
  'Name: Erika Beispiel\nArbeitgeber: Nordlicht Digital GmbH\nRolle: Product Owner\nTechnologien: Java, SQL',
  'Name: Erika Beispiel\nArbeitgeber: Nordlicht Digital GmbH\nRolle: Product Owner',
  'Name: Peter Muster\nArbeitgeber: Hafen Software AG\nRolle: Entwickler',
  'E-Mail: anna＠example․de\nTelefon: +49 30 12345678\nIBAN: DE89 3704 0044 0532 0130 00\nTechnologie: HL7 FHIR',
  'tel:03012345678.anna@example.de'
]);
const expected = Object.freeze([
  'Name: [PERSON_1]\nArbeitgeber: [COMPANY_1]\nRolle: Product Owner\nTechnologien: Java, SQL',
  'Name: [PERSON_1]\nArbeitgeber: [COMPANY_1]\nRolle: Product Owner',
  'Name: [PERSON_2]\nArbeitgeber: [COMPANY_2]\nRolle: Entwickler',
  'E-Mail: [EMAIL_REDACTED]\nTelefon: [PHONE_REDACTED]\nIBAN: [BANK_DATA_REDACTED]\nTechnologie: HL7 FHIR',
  '[CONTACT_REDACTED]'
]);

// A bijection per type, maintained across the entire batch, not per document.
// Never normalize ordinary text or flatten distinct people/companies to one ID.
function canonicalizeBodies(bodies) {
  const mappings = { PERSON: new Map(), COMPANY: new Map() };
  return bodies.map(body => body.replace(
    /\[(PERSON|ORGANISATION|ORGANIZATION|ORG|EMPLOYER|CUSTOMER|KUNDE|UNTERNEHMEN)_([A-Z2-7]{6,}|\d{3,5})\]/gu,
    (marker, originalType) => {
      const type = originalType === 'PERSON' ? 'PERSON' : 'COMPANY';
      const map = mappings[type];
      if (!map.has(marker)) map.set(marker, `[${type}_${map.size + 1}]`);
      return map.get(marker);
    }
  ));
}

function rows(lines) {
  return lines.map(line => {
    const divider = line.indexOf(': ');
    return divider < 0 ? ['Nachricht', line] : [line.slice(0, divider), line.slice(divider + 2)];
  });
}

function formatMarkdown(format, lines) {
  if (format === 'txt') return lines.join('\n');
  if (format === 'md') return '# Fachprofil\n\n' + lines.join('\n');
  if (format === 'docx') return lines.join('\n\n');
  if (format === 'csv') return '# Tabelleninhalt\n\n| Feld | Wert |\n| --- | --- |\n' +
    rows(lines).map(row => `| ${row.join(' | ')} |`).join('\n');
  throw new Error('GOLDEN_FORMAT_INVALID');
}

function sourceBytes(format, lines) {
  if (format === 'csv') {
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    return Buffer.from([['Feld', 'Wert'], ...rows(lines)]
      .map(row => row.map(quote).join(',')).join('\r\n'));
  }
  if (format === 'docx') {
    const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return zipStore([...opcControlEntries('docx'), ['word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines.map(line => `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('') +
      '</w:body></w:document>']]);
  }
  return Buffer.from(formatMarkdown(format, lines));
}

function goldenFixture(format, profile) {
  if (!profiles.includes(profile)) throw new Error('GOLDEN_PROFILE_INVALID');
  // Plugin v1 intentionally has a static employer ROLE marker in applicant /
  // personnel profiles; that marker is not an entity identity (BATCH_PSEUDONYM_V1).
  // Use legal counterparties for the two-identity invariant in those profiles.
  // General/customer keep the original employer corpus unchanged. Never add the
  // role marker to the bijection or collapse two companies to make a test pass.
  const entityLabel = line => reviewProfiles.includes(profile) ? line.replace(/^Arbeitgeber:/u, 'Vertragspartei:') : line;
  const lines = [...documents.flatMap(document => document.split('\n')).map(entityLabel),
    'Wohnort: Beispielstadt', 'Website: https://example.net/profil'];
  const result = [...expected.flatMap(document => document.split('\n')).map(entityLabel),
    `Wohnort: ${reviewProfiles.includes(profile) ? '[LOCATION_REDACTED]' : 'Beispielstadt'}`,
    `Website: ${['general', 'contract'].includes(profile) ? 'https://example.net/profil' : '[URL_REDACTED]'}`];
  return { format, bytes: sourceBytes(format, lines), expected: formatMarkdown(format, result) };
}

function reviewFixture(format, decision = 'keep') {
  // Explicit field context also makes the CSV key/value row a credential
  // candidate; an arbitrary "Nachricht" column does not claim that meaning.
  const lines = ['Name: Erika Beispiel', 'Zertifizierung: Microsoft Azure Administrator Associate', 'Rolle: Cloud Engineer'];
  const result = ['Name: [PERSON_1]',
    `Zertifizierung: ${decision === 'redact' ? '[MANUAL_REDACTION]' : 'Microsoft'} Azure Administrator Associate`,
    'Rolle: Cloud Engineer'];
  return { format, bytes: sourceBytes(format, lines), expected: formatMarkdown(format, result) };
}

module.exports = { documents, expected, canonicalizeBodies, profiles, formats, reviewProfiles,
  goldenFixture, reviewFixture, sourceBytes, formatMarkdown };
