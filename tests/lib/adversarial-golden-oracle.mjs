import assert from 'node:assert/strict';
import { identities, preserveTerms, reviewCandidates } from '../../scripts/generate-adversarial-golden-corpus.mjs';

// Presentation normalization only: retain words and digits, including identifiers
// split by Markdown escaping, HTML entities, spacing or Unicode composition.
export function semanticText(value) {
  return String(value).replace(/&#(x[\da-f]+|\d+);/giu, (_, code) =>
    String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replace(/\\([\\`*_[\]{}()#+.!|])/gu, '$1').normalize('NFKC');
}
export const comparable = value => semanticText(value).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const forbiddenAnchors = Object.freeze(identities.flatMap(identity => [
  identity.shortPerson, identity.shortPerson.split(' ').at(-1), identity.company,
  identity.email, identity.phone, identity.iban, identity.address.split(',')[0]
]).concat(reviewCandidates));

export function assertNoIdentityLeak(markdown, label) {
  const normalized = comparable(markdown);
  for (const anchor of forbiddenAnchors) assert.ok(!normalized.includes(comparable(anchor)),
    `${label}: published original identity anchor ${anchor}`);
}

export function expectedTerms(number) {
  // The fixed fixtures 12-16 have five raster/hybrid anchors. Text PDF 11
  // spans all seven over its twelve pages; every Office/direct source has all.
  return number >= 12 ? preserveTerms.filter(term => !['Separation of Concerns', 'MCP26-01'].includes(term)) : preserveTerms;
}
export function assertTechnicalAnchors(markdown, number, label) {
  const text = semanticText(markdown);
  for (const term of expectedTerms(number)) assert.ok(text.includes(term), `${label}: missing technical anchor ${term}`);
  // Independent content expectation: successful publication is not sufficient
  // if a document title was silently assigned a person pseudonym. CSV 3 has no
  // such title; OCR spelling quality is a separate contract for fixtures 11–16.
  if (number <= 10 && number !== 3) assert.ok(text.includes('SYNTHETISCHER HÄRTETEST'),
    `${label}: technical document title must survive`);
}

// Compare replacements in different actual published documents, not a registry
// lookup with itself. These fixtures deliberately put the same identity into
// Name/Unternehmen fields and into unambiguous prose.
export function assertCrossDocumentPseudonyms(outputs) {
  // BMP 16 has an OCR-distorted name, so it cannot prove exact identity equality.
  // It remains covered by every privacy/content/publication assertion.
  const groups = [[1, 4, 7, 14], [2, 6, 9, 11, 12, 13, 15], [3, 5, 8, 10]];
  const proseOccurrence = { 1: 0, 2: 1, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  const persons = [], companies = [];
  for (const group of groups) {
    const actual = group.filter(number => outputs.has(number));
    assert.ok(actual.length >= 2, `need independent publications for identity fixtures ${group}`);
    const observed = actual.map(number => {
      const text = semanticText(outputs.get(number));
      // These exact source sentences identify semantic occurrences. A title
      // accidentally redacted as a person cannot satisfy this assertion.
      const prose = [...text.matchAll(/(\[PERSON_[A-Z0-9]+\]) arbeitet bei (\[UNTERNEHMEN_[A-Z0-9]+\])/gu)];
      const occurrence = prose[proseOccurrence[number]];
      const person = number <= 10 ? occurrence?.[1] : /Name:\s*(\[PERSON_[A-Z0-9]+\])/u.exec(text)?.[1];
      const company = number <= 10 ? occurrence?.[2] : /Unternehmen:\s*(\[UNTERNEHMEN_[A-Z0-9]+\])/u.exec(text)?.[1];
      assert.ok(person, `fixture ${number}: observable primary person pseudonym required`);
      assert.ok(company, `fixture ${number}: observable primary company pseudonym required`);
      return { person, company };
    });
    assert.equal(new Set(observed.map(item => item.person)).size, 1, `person identity changed across fixtures ${group}`);
    assert.equal(new Set(observed.map(item => item.company)).size, 1, `company identity changed across fixtures ${group}`);
    persons.push(observed[0].person); companies.push(observed[0].company);
  }
  assert.equal(new Set(persons).size, 3, 'distinct people must not collapse to one pseudonym');
  assert.equal(new Set(companies).size, 3, 'distinct companies must not collapse to one pseudonym');
}
