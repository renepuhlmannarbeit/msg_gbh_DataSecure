'use strict';

const { normalizeSpaces, normalizeText, ORG_SUFFIX } = require('./base');
const { matchers: credentialCatalogMatchers } = require('./credential-catalog');
const { markdownTableCells } = require('./entities');

// The table path must recognise the same narrowly tested certification
// headings as profile detection. Otherwise a CSV row containing a credential
// is treated as one long credential context and can accidentally protect the
// separate employer cell in that row.
const CERT_SECTION_RE = /^(?:zertifizierungen?|zertifikate?|bescheinigungen?|credentials?|certifications?|certificates?|certificering|certificación(?:es)?|licenses?(?:\s+(?:and|&|und)\s+certifications?)?)\s*:?$/iu;
const SECTION_RE = /^(?:qualifikationen?|skillset|kenntnisse|kompetenzen|technologien|methoden|sprachkenntnisse|branchenkenntnisse|projekterfahrung|berufserfahrung|ausbildung|weiterbildung|werdegang|profil|summary|skills?|experience|employment|education|projects?|arbeitgeber|unternehmen|kunde|projekt|zeitraum|funktion|aufgaben(?:\s*&\s*verantwortlichkeiten)?)\s*:?$/iu;
const CERT_CUE_RE = /\b(?:zertifiz(?:iert|ierung|ierungen|ierte)|zertifikat(?:e|en)?|certificate|certification|certificering|certificación(?:es)?|certified|credential|issued\s+by|ausgestellt\s+(?:von|durch)|professional\s+scrum|safe\s+agilist|foundation|practitioner)\b/iu;
// Acronyms must remain case-sensitive. With an /i suffix, codes such as PL or
// SC would also match the beginnings of ordinary words like "Plattform" or
// "Scaled", turning technology lines into false certificate contexts.
const CERT_CODE_RE = credentialCatalogMatchers.code;
// An issuer alone is not enough: "Arbeitgeber: Microsoft" must still be
// anonymised.  These names only establish credential context together with a
// credential-shaped title on the same line.  The list intentionally contains
// programmes/issuers rather than every current exam title, so newly introduced
// credentials inherit protection without requiring a release first.
const CERT_ISSUER_RE = credentialCatalogMatchers.issuer;
const CERT_TITLE_RE = /\b(?:certified|certification|certificate|credential|professional|associate|expert|specialist|foundation|practitioner|agilist|master|product\s+owner|architect|developer|engineer|administrator|analyst|manager|auditor|security|cloud|devops|testing|test\s+automation|requirements\s+engineering|usability|user\s+experience|business\s+analysis|product\s+ownership|system\s+administrator|solutions?\s+architect|kubernetes|FHIR|CDA|healthcare\s+information|digital\s+health)\b/iu;
// Originally label-only ("Kunde: ABC GmbH"). Real CVs also name a customer or
// employer in prose inside a certification section ("Zertifikat ausgestellt
// für Kunde ABC GmbH"), where the colon never appears. Without the inline
// form, credentialContextSpans() protects the whole section paragraph and
// this exact organisation survives unredacted — an under-redaction, the
// direction this product treats as the more severe failure. Making the
// trailing colon optional keeps the label form working and additionally
// un-protects the prose form; a false match here only widens redaction
// (over-redaction of skill/technology words), never narrows it.
// Role nouns need every grammatical German form that can precede a company
// name directly (masculine/feminine, singular/plural all collapse to the
// same "-e(n)"/"-in(nen)" endings here); "Anstellung bei"/"beschäftigt bei"
// name an employer through a verb phrase instead of a role noun, so they are
// listed separately from the noun alternatives rather than folded into \b.
// "tätig(?:keit)?" covers both the adjective ("tätig für") and the nominal
// form ("Tätigkeit für") in one branch. "im Auftrag von"/"on behalf of"/
// "commissioned by" name the same customer/commissioning relationship as
// "Kunde"/"Auftraggeber" through a prepositional phrase instead of a role
// noun (RC41 counter-review: a customer named this way survived unredacted).
const NON_ISSUER_LABEL_RE = /(?:arbeitgeber|aktueller\s+arbeitgeber|unternehmen|firma|kunden?|kundin(?:nen)?|projektkunden?|projektkundin(?:nen)?|auftraggeber|client|customer|technologien?|technologies|tools?|skillset|kenntnisse|(?:anstellung|angestellt|beschäftigt|tätig(?:keit)?)\s+(?:bei|für)|im\s+auftrag\s+von|employed\s+(?:at|by)|working\s+for|on\s+behalf\s+of|commissioned\s+by)\b(?:\s*:)?\s*$/iu;

function plainLine(line) {
  return normalizeSpaces(String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .replace(/[*_`]/g, ''));
}

function markdownTableCellRanges(line, offset) {
  const ranges = [];
  const source = String(line || '');
  if (!source.trimStart().startsWith('|')) return ranges;
  let start = source.indexOf('|') + 1;
  let escaped = false;
  for (let index = start; index <= source.length; index++) {
    const atEnd = index === source.length;
    const char = source[index];
    if (!atEnd && escaped) { escaped = false; continue; }
    if (!atEnd && char === '\\') { escaped = true; continue; }
    if (atEnd || char === '|') {
      const raw = source.slice(start, index);
      const leading = raw.match(/^\s*/u)[0].length;
      const trailing = raw.match(/\s*$/u)[0].length;
      ranges.push({ start: offset + start + leading, end: offset + index - trailing });
      start = index + 1;
    }
  }
  return ranges;
}

function hasCredentialCue(text) {
  return CERT_CUE_RE.test(text) || CERT_CODE_RE.test(text);
}

function hasCredentialTitle(text) {
  return CERT_TITLE_RE.test(text) || CERT_CODE_RE.test(text);
}

function credentialContextDetails(text) {
  const src=String(text || ''); const spans=[]; let offset=0; let section=false;
  let credentialColumns = null;
  const allLines = src.split('\n');
  for(let lineIndex=0; lineIndex<allLines.length; lineIndex++) {
    const line = allLines[lineIndex];
    const cells = markdownTableCells(line);
    const nextCells = markdownTableCells(allLines[lineIndex + 1] || '');
    if (cells && nextCells && cells.length === nextCells.length &&
        nextCells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      credentialColumns = new Set(cells
        .map((cell, column) => ({ cell: cell.replace(/\s+\(\d+\)$/u, ''), column }))
        .filter(({ cell }) => CERT_SECTION_RE.test(cell) || hasCredentialCue(cell))
        .map(({ column }) => column));
      offset+=line.length+1;
      continue;
    }
    if (cells && credentialColumns?.size) {
      const ranges = markdownTableCellRanges(line, offset);
      for (const column of credentialColumns) {
        const range = ranges[column];
        if (range && range.end > range.start) spans.push({ start: range.start, end: range.end, reason: 'table_column' });
      }
      offset+=line.length+1;
      continue;
    }
    if (!cells) credentialColumns = null;
    const clean=plainLine(line);
    const certHeading=CERT_SECTION_RE.test(clean);
    const markdownHeading=/^\s*#{1,6}\s+/.test(line);
    if(certHeading) section=true;
    else if(section && (SECTION_RE.test(clean) || markdownHeading)) section=false;
    // Portfolio matching is for compact CV entries.  Applying it to arbitrary
    // prose would make a project paragraph containing e.g. "SAP" and
    // "Product Owner" credential context and could hide a customer name.
    const recognisedPortfolio = clean.length <= 180 &&
      CERT_ISSUER_RE.test(clean) && hasCredentialTitle(clean);
    const explicitCue = hasCredentialCue(clean);
    if((section && clean && !/^:?-{3,}:?$/.test(clean)) || explicitCue || recognisedPortfolio) {
      spans.push({
        start:offset,
        end:offset+line.length,
        // A catalog-only match is useful evidence, but not enough to decide
        // whether an organisation is an issuer or an employer/customer.
        reason: section ? 'section' : explicitCue ? 'explicit' : 'catalog'
      });
    }
    offset+=line.length+1;
  }
  return spans;
}

function credentialContextSpans(text) {
  return credentialContextDetails(text).map(({ start, end }) => ({ start, end }));
}

function lineRanges(text) {
  const ranges=[]; let offset=0;
  for(const line of String(text || '').split('\n')) {
    ranges.push({ start: offset, end: offset + line.length, text: line });
    offset += line.length + 1;
  }
  return ranges;
}

function literalMatches(text, value) {
  const result=[]; const haystack=String(text).toLocaleLowerCase('de-DE');
  const needle=String(value).toLocaleLowerCase('de-DE');
  if(!needle) return result;
  let offset=0;
  while((offset=haystack.indexOf(needle,offset))>=0) {
    result.push({start:offset,end:offset+value.length}); offset+=Math.max(1,value.length);
  }
  return result;
}

/**
 * Return only genuinely ambiguous issuer-shaped occurrences. Explicit
 * certification wording and certification sections remain automatic. The
 * returned objects contain offsets and stable IDs, never copied raw values.
 */
function credentialIssuerAmbiguities(originalText, anonymizedText) {
  const original=normalizeText(originalText); const anonymized=String(anonymizedText || '');
  const originalLines=lineRanges(original); const anonymizedLines=lineRanges(anonymized);
  const details=credentialContextDetails(original); const candidates=[]; const used=new Set();
  const issuerRe=new RegExp(CERT_ISSUER_RE.source, `${CERT_ISSUER_RE.flags.includes('g') ? CERT_ISSUER_RE.flags : `${CERT_ISSUER_RE.flags}g`}`);
  for(const context of details.filter((item)=>item.reason==='catalog')) {
    const lineIndex=originalLines.findIndex((line)=>line.start===context.start && line.end===context.end);
    if(lineIndex<0 || !anonymizedLines[lineIndex]) continue;
    issuerRe.lastIndex=0; let match;
    while((match=issuerRe.exec(originalLines[lineIndex].text))!==null) {
      const originalStart=context.start+match.index; const originalEnd=originalStart+match[0].length;
      if(!inCredentialContext(original,originalStart,originalEnd,details)) continue;
      const options=literalMatches(anonymizedLines[lineIndex].text,match[0]);
      const mapped=options.find((item)=>!used.has(`${lineIndex}:${item.start}:${item.end}`));
      if(!mapped) continue; // the normal privacy engine already anonymised it
      used.add(`${lineIndex}:${mapped.start}:${mapped.end}`);
      candidates.push({
        ambiguity_id:`credential:v2:${String(candidates.length+1).padStart(6,'0')}`,
        type:'credential_issuer_ambiguous',
        original_start:originalStart,
        original_end:originalEnd,
        anonymized_start:anonymizedLines[lineIndex].start+mapped.start,
        anonymized_end:anonymizedLines[lineIndex].start+mapped.end
      });
    }
  }
  return candidates;
}

// "Kunde"/"Arbeitgeber"/etc. are ordinary German nouns and always
// capitalised, so the organisation regex greedily folds them into the
// match itself ("Kunde ABC GmbH" as one entity) instead of leaving them
// as a preceding label. In that case the text before the span ("...für ")
// no longer carries the cue word, so it alone cannot tell prose customer
// mentions apart from a real issuer. Also checking the span's own leading
// word closes that gap without touching the shared organisation regex.
const NON_ISSUER_PREFIX_RE = /^(?:arbeitgeber|aktueller\s+arbeitgeber|unternehmen|firma|kunden?|kundin(?:nen)?|projektkunden?|projektkundin(?:nen)?|auftraggeber|client|customer)\b\s*:?\s*/iu;

// English proper names can genuinely start with "Customer"/"Client"
// (for example "Customer Institute GmbH").  That is the only prefix class
// for which the role word may be part of an issuer name, and only when the
// following name starts with an institution noun.  German role prefixes and
// ordinary English customer names remain explicit privacy signals even when
// a credential-shaped phrase follows immediately.  This keeps
// "Customer Institute GmbH Certified ..." while redacting both
// "Kunde TechCorp GmbH Certified ..." and
// "Customer TechCorp Ltd Certified ...".
const POSSIBLE_ENGLISH_ISSUER_NAME_RE = /^(?:client|customer)\s+(?:academy|association|board|council|foundation|institute|institution|organization|university)\b/iu;

// A domain or organisation counts as "IssuerName Title" - the shape used
// throughout this file for every catalogued issuer alias ("Scrum.org
// Professional Scrum Master I", "${code} Certified Professional") - only
// when the title starts right after a single run of whitespace. A comma or
// other clause break means the following text describes something else
// (RC41 counter-review: "Kunde TechCorp GmbH, Certified Scrum Master
// Schulung durchgeführt" must still redact the customer), so the trim
// deliberately does not swallow punctuation.
const CERT_TITLE_LEADING_RE = new RegExp(`^${CERT_TITLE_RE.source}`, CERT_TITLE_RE.flags);
const CERT_CODE_LEADING_RE = new RegExp(`^(?:${CERT_CODE_RE.source})`, CERT_CODE_RE.flags);

function hasLeadingCredentialTitle(text) {
  const trimmed = String(text || '').replace(/^[ \t]+/u, '');
  if (!trimmed) return false;
  return CERT_TITLE_LEADING_RE.test(trimmed) || CERT_CODE_LEADING_RE.test(trimmed);
}

// buildOrgDictionary() also redacts a legal-form-stripped alias ("Customer
// Institute" without "GmbH") so a later bare mention is still caught. That
// alias span ends before the legal form, so the immediately-following text
// is the stripped-off suffix ("GmbH"), not yet the credential title. Only
// the gap left by an actual organisation-suffix word is skipped here - this
// stays a narrow adjacency fix, not a general "skip anything" allowance.
const ORG_SUFFIX_GAP_RE = new RegExp(`^[ \\t]+${ORG_SUFFIX}\\b`, 'iu');

function inCredentialContext(text,start,end,ranges=credentialContextSpans(text)) {
  const range=ranges.find((r)=>start < r.end && r.start < end);
  if(!range) return false;
  const src=String(text);
  if(NON_ISSUER_LABEL_RE.test(src.slice(range.start,start))) return false;
  if(NON_ISSUER_PREFIX_RE.test(src.slice(start,end))) {
    // The role word is fused into the organisation's own match ("Kunde ABC
    // GmbH"), but the same word can start a genuine issuer's proper name
    // ("Customer Institute GmbH"). Only an immediately following credential
    // title resolves the ambiguity in the issuer's favour; otherwise the
    // prefix keeps meaning what it always meant (RC41 counter-review).
    const lineEnd=src.indexOf('\n',end);
    const after=src.slice(end,lineEnd<0?undefined:lineEnd).replace(ORG_SUFFIX_GAP_RE,'');
    const matchedOrganization=src.slice(start,end);
    if(!POSSIBLE_ENGLISH_ISSUER_NAME_RE.test(matchedOrganization) || !hasLeadingCredentialTitle(after)) return false;
  }
  return true;
}

// Attribution must bind tightly to this exact domain, not merely share a
// certification-section line with an unrelated credential cue. "Zertifikat:
// AWS Certified Cloud Practitioner - weitere Informationen bei
// alpha-health.de" is not the same as "Zertifikat ausgestellt von
// alpha-health.de": the cue word "Zertifikat" sits far earlier in the line
// and never actually attributes the domain as issuer (RC41 counter-review,
// an under-redaction of the referenced domain). Only two shapes count as
// binding: a credential title starts immediately after the domain, or an
// explicit issuer-attribution phrase ends immediately before it - including
// on the immediately preceding line, so a short two-line block ("Zertifikat
// ausgestellt von\nScrum.org") still protects its issuer without treating
// the whole certification section as a domain allowlist.
const ISSUER_ATTRIBUTION_BEFORE_RE = /(?:ausgestellt\s+(?:von|durch)|zertifiziert\s+(?:von|durch)|akkreditiert\s+(?:von|durch)|issued\s+by|certified\s+by|accredited\s+by)\s*:?\s*$/iu;

function isCredentialIssuerDomain(text,start,end,ranges=credentialContextSpans(text)) {
  if(!inCredentialContext(text,start,end,ranges)) return false;
  const value=String(text).slice(start,end);
  if(/(?:https?:\/\/|www\.|[/?#])/iu.test(value)) return false;
  const src=String(text);
  const lineEnd=src.indexOf('\n',end);
  const after=src.slice(end,lineEnd<0?undefined:lineEnd);
  if(hasLeadingCredentialTitle(after)) return true;
  const lineStart=src.lastIndexOf('\n',Math.max(0,start-1))+1;
  const before=src.slice(lineStart,start);
  if(ISSUER_ATTRIBUTION_BEFORE_RE.test(before)) return true;
  if(before.trim() || lineStart<=0) return false;
  const prevLineEnd=lineStart-1;
  const prevLineStart=src.lastIndexOf('\n',Math.max(0,prevLineEnd-1))+1;
  const prevLine=src.slice(prevLineStart,prevLineEnd);
  return ISSUER_ATTRIBUTION_BEFORE_RE.test(prevLine);
}

function isCatalogTechnologyTerm(text, start, end) {
  const src = String(text || '');
  const value = src.slice(start, end);
  const exactIssuer = new RegExp(`^(?:${CERT_ISSUER_RE.source})$`, CERT_ISSUER_RE.flags);
  if (!exactIssuer.test(value)) return false;
  const lineStart = src.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const prefix = src.slice(lineStart, start);
  return /^\s*(?:technologien?|technologies|tools?)\s*:\s*$/iu.test(prefix);
}

module.exports={
  credentialContextSpans,
  credentialContextDetails,
  credentialIssuerAmbiguities,
  inCredentialContext,
  isCredentialIssuerDomain,
  isCatalogTechnologyTerm,
  CERT_SECTION_RE,
  CERT_CUE_RE,
  CERT_CODE_RE,
  CERT_ISSUER_RE,
  CERT_TITLE_RE
};
