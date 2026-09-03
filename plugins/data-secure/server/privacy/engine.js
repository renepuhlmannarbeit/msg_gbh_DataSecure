'use strict';

const {
  URL_RE,
  NB,
  NA,
  normalizeText,
  canonicalizeRenderedText,
  normalizeSpaces,
  key,
  hashShort,
  escapeRegExp,
  ORG_SUFFIX_TAIL_RE,
  DATE_OF_BIRTH_LABEL_RE,
  PHONE_LABEL_RE,
  ID_LABEL_HEADER_RE,
  hasLabelBefore,
  isAllowedOrg,
  orgAlias,
  titleCase,
  isStopToken,
  looksSurname
} = require('./base');
const {
  PERSON_LABEL,
  HONORIFIC,
  GENDERED_SALUTATION,
  ACADEMIC_HONORIFIC,
  collectPersonAnchors,
  collectPersonSeeds,
  collectNameSeeds,
  collectOrganizations,
  makeRegistry
} = require('./entities');
const { anonymizePersonnel } = require('./personnel');
const { findStructuredSpans, scanStructured, replaceStructured } = require('./structured');
const { placeholderSpans, applySpans } = require('./spans');
const {
  credentialContextSpans,
  credentialContextDetails,
  inCredentialContext,
  isCredentialIssuerDomain,
  isCatalogTechnologyTerm,
  credentialOrganizationRole,
  isTechnologyOrganizationSpan
} = require('./credentials');

// Entity priorities. Structured identifiers (80-90) always win over entity
// names so that a surname alias can never eat part of an e-mail address, and a
// longer organisation always wins over a shorter location.
const PRIORITY = {
  PERSON: 72,
  PERSON_ALIAS: 71,
  ORGANIZATION: 70,
  PROJECT: 68,
  LOCATION: 60,
  URL: 58
};

function isProtectedProfessionalDomain(text, start, end, credentialRanges) {
  const visibleCredentialLabel = text[start - 1] === '[' && text[end] === ']' &&
    inCredentialContext(text, start, end, credentialRanges);
  return visibleCredentialLabel || isCredentialIssuerDomain(text, start, end, credentialRanges) ||
    isCatalogTechnologyTerm(text, start, end);
}

// "Herr Weiß" must collapse into a single pseudonym instead of leaving
// "Herr [PERSON_001]": the honorific is a gender quasi-identifier and carries
// no information the released text needs.
const HONORIFIC_PREFIX_RE = new RegExp(`(?:^|[\\s(«"'–—-])(${HONORIFIC}[ \\t]+)$`, 'iu');
const GENDERED_PREFIX_RE = new RegExp(
  `(?:^|[\\s(«"'–—-])(${GENDERED_SALUTATION}[ \\t]+)(${ACADEMIC_HONORIFIC}[ \\t]+)?$`,
  'iu'
);

function growOverHonorific(text, span) {
  const before = text.slice(Math.max(0, span.start - 192), span.start);
  const m = before.match(GENDERED_PREFIX_RE);
  if (!m) return span;
  // Anrede/Geschlecht entfernen, die fachliche akademische Qualifikation nach
  // DS-012 jedoch unverändert vor dem Personenpseudonym erhalten.
  return { ...span, start: span.start - m[1].length - (m[2]?.length || 0), replacement: `${m[2] || ''}${span.replacement}` };
}

function growOverMarkdownLabel(text, span) {
  if (span.start > 0 && span.end < text.length && text[span.start - 1] === '[' &&
      text[span.end] === ']' && (text[span.end + 1] === '(' || text[span.end + 1] === '[')) {
    return { ...span, start: span.start - 1, end: span.end + 1 };
  }
  return span;
}

// The residual gate intentionally does not reuse PHONE_RE or
// DATE_OF_BIRTH_RE. These broader shapes stay behind a strong local/table label,
// so a future redactor regression cannot silently become the gate's blind spot.
const RESIDUAL_DATE_CANDIDATE_RE = /(?:\d{4}[ \t]*[./-][ \t]*\d{1,2}[ \t]*[./-][ \t]*\d{1,2}|\d{1,2}[ \t]*[./-][ \t]*\d{1,2}[ \t]*[./-][ \t]*\d{2,4})/gu;
const RESIDUAL_PHONE_CANDIDATE_RE = /(?:\+|00)?\d[\d() \t\u00A0\u202F\u2007./\-\u2010\u2011\u2012\u2013\u2212]{4,28}\d/gu;
const RESIDUAL_TABLE_ID_CANDIDATE_RE = /(?=[A-Z0-9./\- ]{3,40}\d)[A-Z0-9][A-Z0-9./\- ]{1,38}[A-Z0-9]/giu;

function plausibleCalendarDate(value) {
  const numbers = String(value).split(/[./-]/u).map((part) => Number(part.trim()));
  if (numbers.length !== 3 || numbers.some((number) => !Number.isInteger(number))) return false;
  const [year, month, day] = numbers[0] >= 1000
    ? numbers
    : [numbers[2] < 100 ? 1900 + numbers[2] : numbers[2], numbers[1], numbers[0]];
  if (year < 1850 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function conservativeLabelledResiduals(text) {
  const findings = [];
  for (const match of text.matchAll(RESIDUAL_DATE_CANDIDATE_RE)) {
    if (plausibleCalendarDate(match[0]) && hasLabelBefore(text, match.index, DATE_OF_BIRTH_LABEL_RE, 80)) {
      findings.push({ type: 'DATE_OF_BIRTH', text: match[0] });
    }
  }
  for (const match of text.matchAll(RESIDUAL_PHONE_CANDIDATE_RE)) {
    const digits = match[0].replace(/\D/gu, '');
    if (digits.length >= 6 && digits.length <= 15 && hasLabelBefore(text, match.index, PHONE_LABEL_RE, 80)) {
      findings.push({ type: 'PHONE', text: match[0] });
    }
  }
  for (const match of text.matchAll(RESIDUAL_TABLE_ID_CANDIDATE_RE)) {
    if (hasLabelBefore(text, match.index, ID_LABEL_HEADER_RE, 80)) {
      findings.push({ type: 'LABELED_ID', text: match[0].trim() });
    }
  }
  return findings;
}

function isExplicitPersonOccurrence(text, span, coveringOrganizations = []) {
  const before = text.slice(Math.max(0, span.start - 180), span.start);
  const linePrefix = before.slice(before.lastIndexOf('\n') + 1);
  if (new RegExp(`(?:^|\\|)\\s*${PERSON_LABEL}\\s*(?::|\\|)\\s*$`, 'iu').test(linePrefix)) {
    // "Kunde" is intentionally accepted as a person label for documents such
    // as "Kunde: Max Mustermann", but it is also a strong organisation label.
    // A legal-form organisation at this exact position wins; otherwise the
    // same words would be emitted twice as ORGANIZATION and PERSON spans and
    // OCR would over-redact company names. Suffixless values keep the person
    // interpretation, while an explicit person occurrence elsewhere remains
    // independent from this position-bound decision.
    const ambiguousCustomerLabel = /(?:^|\|)[ \t]*(?:Kunde|Kundin)[ \t]*(?::|\|)[ \t]*$/iu.test(linePrefix);
    if (ambiguousCustomerLabel && coveringOrganizations.some((org) => ORG_SUFFIX_TAIL_RE.test(org.text))) return false;
    return true;
  }
  if (HONORIFIC_PREFIX_RE.test(before)) return true;
  return /(?:Zertifikat|Bescheinigung|certificate|credential)\s+(?:für|for)\s*$/iu.test(linePrefix);
}

function findLiteralSpans(text, needle, replacement, type, priority) {
  if (!needle) return [];
  const literal = String(needle).split(/\s+/u).map(escapeRegExp).join('[ \\t\\r\\n]+');
  const re = new RegExp(`${NB}${literal}${NA}`, 'giu');
  const spans = [];
  let m;
  while ((m = re.exec(text))) {
    spans.push({
      type,
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      replacement,
      priority
    });
    if (m[0].length === 0) re.lastIndex++;
  }
  return spans;
}

// The dictionary is the single source of truth for "which literal maps to which
// pseudonym". It also feeds the verifier, which asserts that none of these
// literals survive in the released text.
function buildPersonDictionary(seeds, reg) {
  const entries = [];
  const surnameToPlaceholder = new Map();

  const multi = seeds.filter((s) => normalizeSpaces(s.value).split(/\s+/).length >= 2);
  const single = seeds.filter((s) => normalizeSpaces(s.value).split(/\s+/).length === 1);

  for (const seed of multi) {
    const canonical = titleCase(seed.value);
    const ph = reg.assign('PERSON', canonical);
    entries.push({ value: seed.value, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    if (seed.matchValue && seed.matchValue !== seed.value) {
      entries.push({ value: seed.matchValue, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    if (canonical !== seed.value) {
      entries.push({ value: canonical, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    const toks = canonical.split(/\s+/);
    const surname = toks[toks.length - 1];
    if (!seed.noSurnameAlias && looksSurname(surname) && surname.length >= 3 && !surnameToPlaceholder.has(key(surname))) {
      surnameToPlaceholder.set(key(surname), ph);
      if (typeof reg.remember === 'function') reg.remember('PERSON', surname, ph);
    }
  }

  // A bare "Müller" must resolve to the same pseudonym as "Herr Müller" and
  // "Thomas Müller" instead of creating a third identity.
  for (const seed of single) {
    const canonical = titleCase(seed.value);
    const existing = surnameToPlaceholder.get(key(canonical));
    const ph = existing || reg.assign('PERSON', canonical);
    if (!existing) surnameToPlaceholder.set(key(canonical), ph);
    entries.push({ value: seed.value, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    if (seed.matchValue && seed.matchValue !== seed.value) {
      entries.push({ value: seed.matchValue, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    if (canonical !== seed.value) {
      entries.push({ value: canonical, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
  }

  for (const [surnameKey, ph] of surnameToPlaceholder) {
    if (isStopToken(surnameKey)) continue;
    entries.push({
      value: surnameKey,
      placeholder: ph,
      type: 'PERSON_ALIAS',
      priority: PRIORITY.PERSON_ALIAS
    });
  }

  return entries;
}

function buildOrgDictionary(text, reg, profile, findings) {
  const entries = [];
  const orgs = collectOrganizations(text);

  for (const org of orgs) {
    const existing = reg.lookup('ORG', org);
    const ph = existing || reg.assign(profile === 'personnel_profile' ? 'CUSTOMER' : 'ORG', org);
    if (!existing) {
      if (typeof reg.remember === 'function') reg.remember('ORG', org, ph);
      else reg.map.set(`ORG:${key(org)}`, ph);
    }
    findings.push({ type: 'ORGANIZATION', value_hash: hashShort(org) });
  }

  // Includes organisations registered by the personnel line rules.
  const orgPairs = typeof reg.entriesForKind === 'function' ? reg.entriesForKind('ORG').map(({ value, placeholder }) => [`ORG:${value}`, placeholder]) : reg.map;
  for (const [mapKey, ph] of orgPairs) {
    if (!mapKey.startsWith('ORG:')) continue;
    const value = mapKey.slice(4);
    entries.push({
      value,
      placeholder: ph,
      type: 'ORGANIZATION',
      priority: PRIORITY.ORGANIZATION
    });
    const alias = orgAlias(value);
    const distinctiveAlias = /\s/u.test(alias) || /^(?=.*[A-ZÄÖÜ])[A-ZÄÖÜ0-9&.+\-]{3,}$/u.test(alias);
    if (alias.length >= 5 && alias !== value && distinctiveAlias && !isAllowedOrg(alias)) {
      entries.push({
        value: alias,
        placeholder: ph,
        type: 'ORGANIZATION',
        priority: PRIORITY.ORGANIZATION
      });
    }
  }

  const projectPairs = typeof reg.entriesForKind === 'function' ? reg.entriesForKind('PROJECT').map(({ value, placeholder }) => [`PROJECT:${value}`, placeholder]) : reg.map;
  for (const [mapKey, ph] of projectPairs) {
    if (!mapKey.startsWith('PROJECT:')) continue;
    entries.push({
      value: mapKey.slice(8),
      placeholder: ph,
      type: 'PROJECT',
      priority: PRIORITY.PROJECT
    });
  }

  return entries;
}

function anonymize(text, profile = 'general', options = {}) {
  const src = canonicalizeRenderedText(text);
  const findings = [];
  const reg = options.registry || makeRegistry();
  const sourceCredentialRanges = credentialContextSpans(src);
  const sourceOrgSpans = collectOrganizations(src).flatMap((org) =>
    findLiteralSpans(src,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
  );

  const strongPersonAnchors = collectPersonAnchors(src, profile);
  const seeds = collectPersonSeeds(src, profile, strongPersonAnchors).filter((seed) => {
    const occurrences=findLiteralSpans(src,seed.value,'','PERSON',PRIORITY.PERSON);
    if(!occurrences.length) return true;
    // A capitalised organisation alias such as "Deutsche Telekom" can look
    // exactly like a person's full name. If every occurrence is contained in
    // a longer legal-form organisation, the organisation interpretation is
    // unambiguous and must win before person priorities are applied.
    if (!['label', 'honorific', 'credential_holder'].includes(seed.confidence) && occurrences.every((span) =>
      sourceOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)
    )) return false;
    // A certification section is professional content in every document type.
    // Keep explicit holders ("Certificate for Anna Beispiel") detectable, but
    // never reinterpret a title such as "Azure Fundamentals" as a person.
    if (occurrences.every((span) => inCredentialContext(src, span.start, span.end, sourceCredentialRanges)) &&
        !['label', 'honorific', 'credential_holder'].includes(seed.confidence)) return false;
    return !occurrences.every((span) =>
      inCredentialContext(src,span.start,span.end,sourceCredentialRanges) &&
      sourceOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)
    );
  });
  const personKeys = new Set();
  for (const seed of seeds) {
    personKeys.add(key(seed.value));
    personKeys.add(key(titleCase(seed.value)));
  }

  let out = src;
  // Applicant profiles contain the same direct employment and residence
  // fields as personnel profiles.  Applying the bounded label/table path to
  // both prevents a labelled applicant location from surviving the release.
  if (profile === 'personnel_profile' || profile === 'applicant') out = anonymizePersonnel(out, reg, findings, personKeys);
  const credentialRanges = credentialContextDetails(out);

  const dictionary = [
    ...buildPersonDictionary(seeds, reg),
    ...buildOrgDictionary(src, reg, profile, findings)
  ];

  for (const seed of seeds) findings.push({ type: 'PERSON', value_hash: hashShort(seed.value) });

  if (profile === 'personnel_profile' || profile === 'applicant') {
    for (const loc of [...new Set(reg.locations.filter(Boolean))]) {
      dictionary.push({
        value: loc,
        placeholder: '[LOCATION_REDACTED]',
        type: 'LOCATION',
        priority: PRIORITY.LOCATION
      });
    }
  }

  // Single resolved pass: structured identifiers and entity literals are
  // collected first and conflicts are settled by priority, so no rule can
  // corrupt the input of another rule.
  const spans = [...findStructuredSpans(out)].filter((span) =>
    !(span.type === 'URL' && isProtectedProfessionalDomain(out,span.start,span.end,credentialRanges))
  );
  const organizationCoverage = collectOrganizations(out).flatMap((org) =>
    findLiteralSpans(out, org, '', 'ORGANIZATION', PRIORITY.ORGANIZATION)
  );
  for (const entry of dictionary) {
    const found = findLiteralSpans(out, entry.value, entry.placeholder, entry.type, entry.priority);
    for (const span of found) {
      const coveringOrganizations = organizationCoverage.filter((org) =>
        span.start >= org.start && span.end <= org.end
      );
      if ((entry.type === 'PERSON' || entry.type === 'PERSON_ALIAS') &&
          coveringOrganizations.length > 0 &&
          !isExplicitPersonOccurrence(out, span, coveringOrganizations)) continue;
      if ((entry.type === 'ORGANIZATION' || entry.type === 'PROJECT') &&
          (credentialOrganizationRole(out, span.start, span.end, credentialRanges) !== 'private' ||
           isTechnologyOrganizationSpan(out, span.start, span.end))) continue;
      spans.push(
        span.type === 'PERSON' || span.type === 'PERSON_ALIAS'
          ? growOverMarkdownLabel(out, growOverHonorific(out, span))
          : span
      );
    }
  }
  if (profile === 'personnel_profile' || profile === 'applicant' || profile === 'customer') {
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(out))) {
      if(isProtectedProfessionalDomain(out,m.index,m.index+m[0].length,credentialRanges)) continue;
      spans.push({
        type: 'URL',
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        replacement: '[URL_REDACTED]',
        priority: PRIORITY.URL
      });
    }
  }

  const reserved = placeholderSpans(out);
  const usable = spans.filter((s) => !reserved.some((r) => s.start < r.end && r.start < s.end));

  // Person and organisation findings are recorded when the dictionary is built;
  // everything else is recorded from the spans that actually matched.
  for (const span of usable) {
    if (span.type === 'PERSON' || span.type === 'PERSON_ALIAS') continue;
    if (span.type === 'ORGANIZATION' || span.type === 'PROJECT') continue;
    findings.push({ type: span.type, value_hash: hashShort(span.text) });
  }

  out = applySpans(out, usable);

  return {
    text: out,
    findings,
    counts: reg.counts,
    // Typed entries travel through the existing gateway gate unchanged. They
    // let the verifier distinguish a private person alias from a vendor with
    // a separate, position-bound professional role. No registry is persisted.
    dictionary: dictionary.map(({value,type}) => ({value,type})),
    strongPersonAnchor: strongPersonAnchors.length > 0,
    reidentification_risk: profile === 'personnel_profile' ? 'high' : 'context_dependent'
  };
}

// The verifier must not share the redactor's allowlists, otherwise it can only
// ever confirm the redactor's own blind spots. It checks two independent
// things: that no direct identifier pattern is left, and that no literal the
// redactor claimed to have replaced survives in the output.
function scanResidual(text, profile = 'general', knownValues = [], options = {}) {
  const clean = canonicalizeRenderedText(text).replace(/\[[A-ZÄÖÜ_]+(?:_\d+)?\]/gu, ' ');
  const credentialRanges = credentialContextDetails(clean);
  const out = scanStructured(clean)
    .filter((f) => !(f.type === 'URL' && isProtectedProfessionalDomain(clean,f.start,f.end,credentialRanges)))
    .map((f) => ({ type: f.type, text: f.text }));
  for (const finding of conservativeLabelledResiduals(clean)) {
    if (!out.some((current) => current.type === finding.type && current.text === finding.text)) out.push(finding);
  }
  const residualOrgKeys=new Set();
  const residualOrgSpans=[];
  for(const org of collectOrganizations(clean)) {
    residualOrgKeys.add(key(org));
    residualOrgKeys.add(key(orgAlias(org)));
    residualOrgSpans.push(...findLiteralSpans(clean,org,'','ORGANIZATION',PRIORITY.ORGANIZATION));
  }

  const strongPersonAnchor = options.strongPersonAnchor === true;
  for (const seed of collectPersonSeeds(clean, profile, null, strongPersonAnchor)) {
    const occurrences=findLiteralSpans(clean,seed.value,'','PERSON',PRIORITY.PERSON);
    const issuerOnly=occurrences.length>0 && occurrences.every((span) =>
      inCredentialContext(clean,span.start,span.end,credentialRanges) &&
      residualOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)
    );
    const certificationOnly = occurrences.length > 0 && occurrences.every((span) =>
      inCredentialContext(clean, span.start, span.end, credentialRanges)
    ) && !['label', 'honorific', 'credential_holder'].includes(seed.confidence);
    if(issuerOnly || certificationOnly) continue;
    out.push({ type: 'PERSON_CANDIDATE', text: seed.value });
  }

  if (profile === 'personnel_profile' || profile === 'applicant' || profile === 'customer') {
    URL_RE.lastIndex = 0;
    let match;
    while ((match = URL_RE.exec(clean))) {
      if(!isProtectedProfessionalDomain(clean,match.index,match.index+match[0].length,credentialRanges)) {
        out.push({ type: 'URL', text: match[0] });
      }
    }
  }

  if (profile === 'personnel_profile') {
    for (const org of collectOrganizations(clean)) {
      const occurrences=findLiteralSpans(clean,org,'','ORGANIZATION',PRIORITY.ORGANIZATION);
      if (occurrences.some((s)=>credentialOrganizationRole(clean,s.start,s.end,credentialRanges)==='private' &&
          !isTechnologyOrganizationSpan(clean,s.start,s.end))) {
        out.push({ type: 'ORGANIZATION_CANDIDATE', text: org });
      }
    }
  }

  for (const value of knownValues || []) {
    const typed = value && typeof value === 'object';
    const v = normalizeSpaces(typed ? value.value : value);
    if (v.length < 3) continue;
    const occurrences=findLiteralSpans(clean,v,'','RESIDUAL_ENTITY',0);
    const credentialOrg=typed ? ['ORGANIZATION','PROJECT'].includes(value.type) : residualOrgKeys.has(key(v));
    if (occurrences.some((s)=>!(credentialOrg &&
        (credentialOrganizationRole(clean,s.start,s.end,credentialRanges)!=='private' ||
         isTechnologyOrganizationSpan(clean,s.start,s.end))))) {
      out.push({ type: 'RESIDUAL_ENTITY', text: v });
    }
  }

  return out;
}

// Verification of a pixel redaction asks a narrow question: did the strings we
// blacked out disappear, and is no direct identifier left? Re-running the full
// candidate heuristics on the redacted OCR text would be circular - after the
// name is gone the next capitalised words shift into its position and the
// heuristic flags them, so a correct redaction could never be confirmed.
function verifyRedactedText(afterText, redactedValues = []) {
  const text = normalizeText(afterText);
  const findings = findStructuredSpans(text).map((s) => ({ type: s.type, text: s.text }));
  for (const value of redactedValues) {
    const v = normalizeSpaces(value);
    if (v.length < 3) continue;
    const re = new RegExp(`${NB}${escapeRegExp(v)}${NA}`, 'iu');
    if (re.test(text)) findings.push({ type: 'RESIDUAL_REDACTION', text: v });
  }
  return findings;
}

// Character spans used to map OCR text back to pixel rectangles.
function sensitiveSpans(text, profile = 'general') {
  const src = normalizeText(text);
  const credentialRanges = profile === 'personnel_profile' || profile === 'applicant'
    ? credentialContextSpans(src)
    : [];
  const sourceOrgSpans = collectOrganizations(src).flatMap((org) =>
    findLiteralSpans(src,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
  );
  const out = [];
  const seen = new Set();

  function add(type, start, end, value) {
    if (start < 0 || end <= start) return;
    const k = `${start}:${end}:${type}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ type, start, end, text: value });
  }

  for (const f of findStructuredSpans(src)) {
    if(f.type === 'URL' && isProtectedProfessionalDomain(src,f.start,f.end,credentialRanges)) continue;
    add(f.type, f.start, f.end, f.text);
  }

  for (const seed of collectPersonSeeds(src, profile)) {
    for (const span of findLiteralSpans(src, seed.value, '', 'PERSON', PRIORITY.PERSON)) {
      // Keep OCR/image span classification aligned with the text engine: a
      // name-shaped substring inside a longer legal-form organisation is not
      // a second person finding. A separate occurrence outside that company
      // span remains detectable as a person.
      const coveringOrganizations = sourceOrgSpans.filter((org) =>
        span.start >= org.start && span.end <= org.end
      );
      if (coveringOrganizations.length > 0 &&
          !isExplicitPersonOccurrence(src, span, coveringOrganizations)) continue;
      add('PERSON', span.start, span.end, span.text);
    }
  }

  for (const org of collectOrganizations(src)) {
    for (const span of findLiteralSpans(src, org, '', 'ORGANIZATION', PRIORITY.ORGANIZATION)) {
      if (inCredentialContext(src,span.start,span.end,credentialRanges)) continue;
      add('ORGANIZATION', span.start, span.end, span.text);
    }
  }

  if (profile === 'personnel_profile' || profile === 'applicant' || profile === 'customer') {
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(src))) {
      if(isProtectedProfessionalDomain(src,m.index,m.index+m[0].length,credentialRanges)) continue;
      add('URL', m.index, m.index + m[0].length, m[0]);
    }
  }

  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

module.exports = {
  anonymize,
  scanResidual,
  verifyRedactedText,
  scanStructured,
  replaceStructured,
  collectNameSeeds,
  collectOrganizations,
  sensitiveSpans,
  PRIORITY
};
