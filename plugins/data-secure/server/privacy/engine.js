'use strict';

const {
  URL_RE,
  NB,
  NA,
  normalizeText,
  normalizeSpaces,
  key,
  hashShort,
  escapeRegExp,
  isAllowedOrg,
  orgAlias,
  titleCase,
  isStopToken,
  looksSurname
} = require('./base');
const {
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
  inCredentialContext,
  isCredentialIssuerDomain,
  isCatalogTechnologyTerm
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
  return isCredentialIssuerDomain(text, start, end, credentialRanges) ||
    isCatalogTechnologyTerm(text, start, end);
}

// "Herr Weiß" must collapse into a single pseudonym instead of leaving
// "Herr [PERSON_001]": the honorific is a gender quasi-identifier and carries
// no information the released text needs.
const HONORIFIC_PREFIX_RE =
  /(?:^|[\s(«"'–—-])((?:Herrn?|Frau|Dr\.?|Prof\.?|Dipl\.-?(?:Ing|Inf|Kfm)\.?|Mag\.?|Mr\.?|Mrs\.?|Ms\.?)\s+)$/u;

function growOverHonorific(text, span) {
  const before = text.slice(Math.max(0, span.start - 24), span.start);
  const m = before.match(HONORIFIC_PREFIX_RE);
  if (!m) return span;
  return { ...span, start: span.start - m[1].length };
}

function findLiteralSpans(text, needle, replacement, type, priority) {
  if (!needle) return [];
  const re = new RegExp(`${NB}${escapeRegExp(needle)}${NA}`, 'giu');
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
    if (canonical !== seed.value) {
      entries.push({ value: canonical, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    const toks = canonical.split(/\s+/);
    const surname = toks[toks.length - 1];
    if (!seed.noSurnameAlias && looksSurname(surname) && surname.length >= 3 && !surnameToPlaceholder.has(key(surname))) {
      surnameToPlaceholder.set(key(surname), ph);
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
    reg.map.set(`ORG:${key(org)}`, ph);
    findings.push({ type: 'ORGANIZATION', value_hash: hashShort(org) });
  }

  // Includes organisations registered by the personnel line rules.
  for (const [mapKey, ph] of reg.map) {
    if (!mapKey.startsWith('ORG:')) continue;
    const value = mapKey.slice(4);
    entries.push({
      value,
      placeholder: ph,
      type: 'ORGANIZATION',
      priority: PRIORITY.ORGANIZATION
    });
    const alias = orgAlias(value);
    if (alias.length >= 5 && alias !== value && !isAllowedOrg(alias)) {
      entries.push({
        value: alias,
        placeholder: ph,
        type: 'ORGANIZATION',
        priority: PRIORITY.ORGANIZATION
      });
    }
  }

  for (const [mapKey, ph] of reg.map) {
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

function anonymize(text, profile = 'general') {
  const src = normalizeText(text);
  const findings = [];
  const reg = makeRegistry();
  const sourceCredentialRanges = profile === 'personnel_profile' || profile === 'applicant'
    ? credentialContextSpans(src)
    : [];
  const sourceOrgSpans = collectOrganizations(src).flatMap((org) =>
    findLiteralSpans(src,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
  );

  const strongPersonAnchors = collectPersonAnchors(src);
  const seeds = collectPersonSeeds(src, profile, strongPersonAnchors).filter((seed) => {
    const occurrences=findLiteralSpans(src,seed.value,'','PERSON',PRIORITY.PERSON);
    if(!occurrences.length) return true;
    // A capitalised organisation alias such as "Deutsche Telekom" can look
    // exactly like a person's full name. If every occurrence is contained in
    // a longer legal-form organisation, the organisation interpretation is
    // unambiguous and must win before person priorities are applied.
    if (occurrences.every((span) =>
      sourceOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)
    )) return false;
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
  if (profile === 'personnel_profile') out = anonymizePersonnel(out, reg, findings, personKeys);
  const credentialRanges = profile === 'personnel_profile' || profile === 'applicant'
    ? credentialContextSpans(out)
    : [];

  const dictionary = [
    ...buildPersonDictionary(seeds, reg),
    ...buildOrgDictionary(src, reg, profile, findings)
  ];

  for (const seed of seeds) findings.push({ type: 'PERSON', value_hash: hashShort(seed.value) });

  if (profile === 'personnel_profile') {
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
      if ((entry.type === 'PERSON' || entry.type === 'PERSON_ALIAS') &&
          organizationCoverage.some((org) => span.start >= org.start && span.end <= org.end)) continue;
      if ((entry.type === 'ORGANIZATION' || entry.type === 'PROJECT') &&
          inCredentialContext(out, span.start, span.end, credentialRanges)) continue;
      spans.push(
        span.type === 'PERSON' || span.type === 'PERSON_ALIAS' ? growOverHonorific(out, span) : span
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
    dictionary: dictionary.map((d) => d.value),
    strongPersonAnchor: strongPersonAnchors.length > 0,
    reidentification_risk: profile === 'personnel_profile' ? 'high' : 'context_dependent'
  };
}

// The verifier must not share the redactor's allowlists, otherwise it can only
// ever confirm the redactor's own blind spots. It checks two independent
// things: that no direct identifier pattern is left, and that no literal the
// redactor claimed to have replaced survives in the output.
function scanResidual(text, profile = 'general', knownValues = [], options = {}) {
  const clean = normalizeText(text).replace(/\[[A-ZÄÖÜ_]+(?:_\d+)?\]/gu, ' ');
  const credentialRanges = profile === 'personnel_profile' || profile === 'applicant'
    ? credentialContextSpans(clean)
    : [];
  const out = scanStructured(clean)
    .filter((f) => !(f.type === 'URL' && isProtectedProfessionalDomain(clean,f.start,f.end,credentialRanges)))
    .map((f) => ({ type: f.type, text: f.text }));
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
    if(issuerOnly) continue;
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
      if (occurrences.some((s)=>!inCredentialContext(clean,s.start,s.end,credentialRanges))) {
        out.push({ type: 'ORGANIZATION_CANDIDATE', text: org });
      }
    }
  }

  for (const value of knownValues || []) {
    const v = normalizeSpaces(value);
    if (v.length < 3) continue;
    const occurrences=findLiteralSpans(clean,v,'','RESIDUAL_ENTITY',0);
    const credentialOrg=residualOrgKeys.has(key(v));
    if (occurrences.some((s)=>!(credentialOrg && inCredentialContext(clean,s.start,s.end,credentialRanges)))) {
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
      if (sourceOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)) continue;
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
