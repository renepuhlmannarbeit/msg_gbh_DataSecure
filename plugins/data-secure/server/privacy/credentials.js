'use strict';

const { normalizeSpaces, normalizeText, ORG_SUFFIX, TECH_TERMS, escapeRegExp, NB, NA } = require('./base');
const { matchers: credentialCatalogMatchers } = require('./credential-catalog');
const { markdownTableCells, collectOrganizations } = require('./entities');

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
const MAX_TECH_TERM_LENGTH = Math.max(...Array.from(TECH_TERMS, (term) => term.length));
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
    const issuer = clean.match(CERT_ISSUER_RE);
    const recognisedPortfolio = clean.length <= 180 && issuer && issuer.index === 0 &&
      hasCredentialTitle(clean.slice(issuer[0].length));
    // Unknown compact titles can also introduce an unresolved training-party
    // relationship. A section heading is not required for local review.
    const unknownPortfolio = clean.length <= 240 &&
      /\b(?:Expert|Professional|Tester|Practitioner)\s+bei\s+/u.test(clean) &&
      collectOrganizations(clean).length > 0;
    const explicitCue = hasCredentialCue(clean);
    if((section && clean && !/^:?-{3,}:?$/.test(clean)) || explicitCue || recognisedPortfolio || unknownPortfolio) {
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

// Redaction changes offsets and may consume a line break in a wrapped holder
// name. Align the surviving literal fragments around placeholders, instead of
// assuming that source/output line numbers or repeated-name ordinals match.
function preservedTextRanges(original, anonymized) {
  const ranges=[];
  const placeholders=/\[[A-ZÄÖÜ_]+(?:_\d+)?\]/gu;
  let outputStart=0; let originalCursor=0;
  const add=(end)=> {
    let fragment=anonymized.slice(outputStart,end);
    if(!fragment) return;
    let start=original.indexOf(fragment,originalCursor);
    let leading=0;
    if(start<0) {
      // Key/value table redaction can normalize boundary padding.
      leading=fragment.length-fragment.trimStart().length;
      fragment=fragment.trim();
      if(!fragment) return;
      start=original.indexOf(fragment,originalCursor);
    }
    if(start<0) return;
    ranges.push({ original_start:start, original_end:start+fragment.length, anonymized_start:outputStart+leading });
    originalCursor=start+fragment.length;
  };
  let match;
  while((match=placeholders.exec(anonymized))!==null) {
    add(match.index);
    outputStart=match.index+match[0].length;
  }
  add(anonymized.length);
  return ranges;
}

/**
 * Return unresolved organisation roles, including unknown legal-form names
 * inside explicit sections. Context is evidence for review, not permission to
 * release every company on the same line. Only offsets leave this helper.
 */
function credentialIssuerAmbiguities(originalText, anonymizedText) {
  const original=normalizeText(originalText); const anonymized=String(anonymizedText || '');
  const preserved=preservedTextRanges(original,anonymized);
  const details=credentialContextDetails(original); const candidates=[]; const used=new Set();
  for(const context of details) {
    const contextText=original.slice(context.start,context.end);
    const issuerRe=new RegExp(CERT_ISSUER_RE.source, `${CERT_ISSUER_RE.flags.replace(/g/g,'')}g`);
    const values=[...collectOrganizations(contextText), ...Array.from(contextText.matchAll(issuerRe), (match)=>match[0])];
    const spans=values.flatMap((value)=>literalMatches(contextText,value))
      .sort((a,b)=>a.start-b.start || b.end-a.end);
    const covered=[];
    for(const span of spans) {
      if(covered.some((item)=>item.start<=span.start && item.end>=span.end)) continue;
      covered.push(span);
      const originalStart=context.start+span.start; const originalEnd=context.start+span.end;
      if(credentialOrganizationRole(original,originalStart,originalEnd,details)!=='ambiguous') continue;
      const retained=preserved.find((item)=>originalStart>=item.original_start && originalEnd<=item.original_end);
      const options=retained ? [{
        start:retained.anonymized_start+originalStart-retained.original_start,
        end:retained.anonymized_start+originalEnd-retained.original_start
      }] : literalMatches(anonymized,contextText.slice(span.start,span.end));
      // If exact fragment alignment was unavailable, require review of every
      // surviving candidate rather than silently guessing the first homonym.
      for(const mapped of options) {
        if(used.has(`${mapped.start}:${mapped.end}`)) continue;
        used.add(`${mapped.start}:${mapped.end}`);
        candidates.push({
          ambiguity_id:`credential:v2:${String(candidates.length+1).padStart(6,'0')}`,
          type:'credential_issuer_ambiguous',
          original_start:originalStart,
          original_end:originalEnd,
          anonymized_start:mapped.start,
          anonymized_end:mapped.end
        });
      }
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
const ISSUER_ATTRIBUTION_BEFORE_RE = /(?:(?:ausgestellt|zertifiziert|akkreditiert|verliehen|erteilt)\s+(?:von|durch)|(?:issued|certified|accredited|awarded)\s+by)\s*:?\s*$/iu;

// Resolve the role of this occurrence, never of the global vendor literal.
// Ambiguous spans remain available to the mandatory local-review gate; unlike
// issuers they must not be silently published merely because of a heading.
function credentialOrganizationRole(text,start,end,ranges=credentialContextDetails(text)) {
  if(!inCredentialContext(text,start,end,ranges)) return 'private';
  const src=String(text);
  const range=ranges.find((item)=>start>=item.start && end<=item.end);
  if(!range) return 'private';
  const lineStart=src.lastIndexOf('\n',Math.max(0,start-1))+1;
  const before=src.slice(lineStart,start);
  const previous=src.slice(Math.max(0,src.lastIndexOf('\n',Math.max(0,lineStart-2))+1),start);
  if(ISSUER_ATTRIBUTION_BEFORE_RE.test(before) || (!before.trim() && ISSUER_ATTRIBUTION_BEFORE_RE.test(previous))) return 'issuer';
  const after=src.slice(end,range.end).replace(ORG_SUFFIX_GAP_RE,'');
  // "bei X" may denote a trainer, location or employer. A nearby title
  // cannot decide that role, even if the company is also a catalogued issuer.
  if(/\b(?:bei|at|with)\s*$/iu.test(before)) return 'ambiguous';
  const exactIssuer=new RegExp(`^(?:${CERT_ISSUER_RE.source})$`,CERT_ISSUER_RE.flags);
  const leadingTitle=hasLeadingCredentialTitle(after);
  const startsEntry=!plainLine(src.slice(range.start,start)).replace(/^(?:Zertifikat|Certificate)\s*:\s*/iu,'').trim();
  const compactTitle=startsEntry && after.length<=180 && /^\s+[A-ZÄÖÜ0-9]/u.test(after) &&
    hasCredentialTitle(after) && !/\b(?:bei|für|at|with)\b/iu.test(after);
  if(leadingTitle || compactTitle) {
    // Catalog-only entries intentionally keep the established local decision.
    if(range.reason==='catalog' && exactIssuer.test(src.slice(start,end))) return 'ambiguous';
    return 'issuer';
  }
  return 'ambiguous';
}

// Products must survive a vendor alias registered elsewhere as an employer.
// Only a strictly longer, known professional term can shield that substring;
// an explicit organisation label at this position always wins.
function isTechnologyOrganizationSpan(text,start,end) {
  const src=String(text || '');
  const lineStart=src.lastIndexOf('\n',Math.max(0,start-1))+1;
  if(NON_ISSUER_LABEL_RE.test(src.slice(lineStart,start)) || NON_ISSUER_PREFIX_RE.test(src.slice(start,end))) return false;
  // Search only the occurrence neighbourhood, not the full document once per
  // term and alias. The maximum known term length bounds all possible covers.
  const from=Math.max(lineStart,start-MAX_TECH_TERM_LENGTH);
  const neighbourhood=src.slice(from,end+MAX_TECH_TERM_LENGTH);
  for(const term of TECH_TERMS) {
    if(term.length<=end-start) continue;
    const matcher=new RegExp(`${NB}${escapeRegExp(term)}${NA}`,'giu');
    let match;
    while((match=matcher.exec(neighbourhood))!==null) {
      if(start>=from+match.index && end<=from+match.index+match[0].length) return true;
    }
  }
  return false;
}

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
  credentialOrganizationRole,
  isTechnologyOrganizationSpan,
  CERT_SECTION_RE,
  CERT_CUE_RE,
  CERT_CODE_RE,
  CERT_ISSUER_RE,
  CERT_TITLE_RE
};
