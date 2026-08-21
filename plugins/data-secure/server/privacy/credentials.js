'use strict';

const { normalizeSpaces } = require('./base');

const CERT_SECTION_RE = /^(?:zertifizierungen?|zertifikate?|bescheinigungen?|credentials?|certifications?|certificates?|licenses?(?:\s+(?:and|&|und)\s+certifications?)?)\s*:?$/iu;
const SECTION_RE = /^(?:qualifikationen?|skillset|kenntnisse|kompetenzen|technologien|methoden|sprachkenntnisse|branchenkenntnisse|projekterfahrung|berufserfahrung|ausbildung|weiterbildung|werdegang|profil|summary|skills?|experience|employment|education|projects?|arbeitgeber|unternehmen|kunde|projekt|zeitraum|funktion|aufgaben(?:\s*&\s*verantwortlichkeiten)?)\s*:?$/iu;
const CERT_CUE_RE = /\b(?:zertifiz(?:iert|ierung|ierungen|ierte)|zertifikat(?:e|en)?|certificate|certification|certified|credential|issued\s+by|ausgestellt\s+(?:von|durch)|professional\s+scrum|safe\s+agilist|foundation|practitioner)\b|\b(?:PSM|PSPO|PSD|PSK|PSU|PAL|SPS|PMP|CAPM|PMI-ACP|ECBA|CCBA|CBAP|CTFL|CTAL|ITIL|CISM|CISSP|CCNA|IHE-CPP)(?:[- ]?[A-Z0-9]+)*\b/iu;
// An issuer alone is not enough: "Arbeitgeber: Microsoft" must still be
// anonymised.  These names only establish credential context together with a
// credential-shaped title on the same line.  The list intentionally contains
// programmes/issuers rather than every current exam title, so newly introduced
// credentials inherit protection without requiring a release first.
const CERT_ISSUER_RE = /\b(?:ISTQB|International\s+Software\s+Testing\s+Qualifications\s+Board|Scrum\.org|Scaled\s+Agile|SAFe|IIBA|International\s+Institute\s+of\s+Business\s+Analysis|PMI|Project\s+Management\s+Institute|PeopleCert|AXELOS|Microsoft|Amazon\s+Web\s+Services|AWS|Google\s+Cloud|Cisco|CompTIA|ISACA|ISC2|ISC²|Linux\s+Foundation|Red\s+Hat|Oracle|SAP|HL7|Health\s+Level\s+Seven|HIMSS|IHE)\b/iu;
const CERT_TITLE_RE = /\b(?:certified|certification|certificate|credential|professional|associate|expert|specialist|foundation|practitioner|agilist|master|product\s+owner|architect|developer|engineer|administrator|analyst|manager|auditor|security|cloud|devops|testing|test\s+automation|business\s+analysis|product\s+ownership|FHIR|CDA|healthcare\s+information|digital\s+health)\b|\b(?:AZ|AI|DP|PL|SC|MS|MD|MB|GH|CTFL|CTAL|CTEL|PSM|PSPO|PSD|PSK|PSU|PAL|SPS|PMP|CAPM|ECBA|CCBA|CBAP|CPOA|AAC|CBDA|CCA|CISA|CISM|CGEIT|CRISC|CDPSE|CISSP|CCSP|CCNA|CAHIMS|CPHIMS|CPDHTS)(?:[- ]?[A-Z0-9]+)*\b/iu;
const NON_ISSUER_LABEL_RE = /(?:arbeitgeber|aktueller\s+arbeitgeber|unternehmen|firma|kunde|projektkunde|auftraggeber)\s*:\s*$/iu;

function plainLine(line) {
  return normalizeSpaces(String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .replace(/[*_`]/g, ''));
}

function credentialContextSpans(text) {
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
      CERT_ISSUER_RE.test(clean) && CERT_TITLE_RE.test(clean);
    if((section && clean && !/^:?-{3,}:?$/.test(clean)) || CERT_CUE_RE.test(clean) || recognisedPortfolio) {
      spans.push({start:offset,end:offset+line.length});
    }
    offset+=line.length+1;
  }
  return spans;
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
  return CERT_CUE_RE.test(after);
}

module.exports={
  credentialContextSpans,
  inCredentialContext,
  isCredentialIssuerDomain,
  CERT_SECTION_RE,
  CERT_CUE_RE,
  CERT_ISSUER_RE,
  CERT_TITLE_RE
};
