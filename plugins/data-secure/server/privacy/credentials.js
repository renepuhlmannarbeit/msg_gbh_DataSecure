'use strict';

const { normalizeSpaces, normalizeText } = require('./base');
const { matchers: credentialCatalogMatchers } = require('./credential-catalog');

const CERT_SECTION_RE = /^(?:zertifizierungen?|zertifikate?|bescheinigungen?|credentials?|certifications?|certificates?|licenses?(?:\s+(?:and|&|und)\s+certifications?)?)\s*:?$/iu;
const SECTION_RE = /^(?:qualifikationen?|skillset|kenntnisse|kompetenzen|technologien|methoden|sprachkenntnisse|branchenkenntnisse|projekterfahrung|berufserfahrung|ausbildung|weiterbildung|werdegang|profil|summary|skills?|experience|employment|education|projects?|arbeitgeber|unternehmen|kunde|projekt|zeitraum|funktion|aufgaben(?:\s*&\s*verantwortlichkeiten)?)\s*:?$/iu;
const CERT_CUE_RE = /\b(?:zertifiz(?:iert|ierung|ierungen|ierte)|zertifikat(?:e|en)?|certificate|certification|certified|credential|issued\s+by|ausgestellt\s+(?:von|durch)|professional\s+scrum|safe\s+agilist|foundation|practitioner)\b/iu;
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
const NON_ISSUER_LABEL_RE = /(?:arbeitgeber|aktueller\s+arbeitgeber|unternehmen|firma|kunde|projektkunde|auftraggeber|technologien?|technologies|tools?|skillset|kenntnisse)\s*:\s*$/iu;

function plainLine(line) {
  return normalizeSpaces(String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .replace(/[*_`]/g, ''));
}

function hasCredentialCue(text) {
  return CERT_CUE_RE.test(text) || CERT_CODE_RE.test(text);
}

function hasCredentialTitle(text) {
  return CERT_TITLE_RE.test(text) || CERT_CODE_RE.test(text);
}

function credentialContextDetails(text) {
  const src=String(text || ''); const spans=[]; let offset=0; let section=false;
  for(const line of src.split('\n')) {
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

function inCredentialContext(text,start,end,ranges=credentialContextSpans(text)) {
  const range=ranges.find((r)=>start < r.end && r.start < end);
  if(!range) return false;
  return !NON_ISSUER_LABEL_RE.test(String(text).slice(range.start,start));
}

function isCredentialIssuerDomain(text,start,end,ranges=credentialContextSpans(text)) {
  if(!inCredentialContext(text,start,end,ranges)) return false;
  const value=String(text).slice(start,end);
  if(/(?:https?:\/\/|www\.|[/?#])/iu.test(value)) return false;
  const lineEnd=String(text).indexOf('\n',end);
  const after=String(text).slice(end,lineEnd<0?undefined:lineEnd);
  return hasCredentialCue(after);
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
