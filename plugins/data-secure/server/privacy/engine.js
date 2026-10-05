'use strict';

const {
  URL_RE,
  NB,
  NA,
  normalizeText,
  identifierDetectionText,
  canonicalizeRenderedText,
  normalizeSpaces,
  key,
  hashShort,
  escapeRegExp,
  ORG_SUFFIX_TAIL_RE,
  DATE_OF_BIRTH_LABEL_RE,
  PHONE_LABEL_RE,
  PHONE_LABEL_WINDOW,
  ID_LABEL_HEADER_RE,
  hasLabelBefore,
  plausibleCalendarDate,
  hasAmbiguousSensitiveTable,
  isResolvedSensitiveTableHeader,
  isAllowedOrg,
  orgAlias,
  titleCase,
  isStopToken,
  looksName,
  looksSurname,
  tableHeaderAt
} = require('./base');
const {
  PERSON_LABEL,
  HONORIFIC,
  GENDERED_SALUTATION,
  ACADEMIC_HONORIFIC,
  markdownTableCells,
  markdownTableColumnValues,
  collectPersonAnchors,
  collectPersonSeeds,
  collectContextualNameCandidates,
  collectNestedMarkdownPersonCandidates,
  collectNameSeeds,
  collectOrganizations,
  makeRegistry
} = require('./entities');
const { anonymizePersonnel } = require('./personnel');
const { reviewedPersonRanges, importedSourceMarkerCandidates } = require('./residual-person-review');
const { findStructuredSpans, scanStructured, replaceStructured } = require('./structured');
const { placeholderSpans, maskPlaceholders, applySpans } = require('./spans');
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

function uppercasePresentationHypothesis(seed) {
  return ['caps_line', 'caps_dash', 'header_block', 'header_comma', 'header_particle', 'header_tab',
    'profile_structure', 'markdown_structure', 'markdown_link_label', 'markdown_metadata'].includes(seed.confidence) &&
    /\p{Lu}/u.test(seed.value) && !/\p{Ll}/u.test(seed.value);
}

function sortedCredentialIntervals(spans) {
  return spans.filter((span) => span.type === 'CREDENTIAL')
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function overlapsCredential(intervals, start, end) {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (intervals[middle].start < end) low = middle + 1;
    else high = middle;
  }
  return low > 0 && intervals[low - 1].end > start;
}

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
// Deliberately independent from PERSON_LABEL: a defect in the redactor's
// catalogue must not also blind the final release gate. This literal shape is
// emitted by the local conversion corpus and is narrow enough to avoid
// guessing names from unlabelled prose.
const RESIDUAL_PERSON_TABLE_CANDIDATE_RE = /^\|?[ \t]*person[ \t]*:?[ \t]*\|[ \t]*([^|\n]{1,160})\|/gimu;
const PROFESSIONAL_TABLE_COLUMN_RE = /^(?:Zertifizierungen?|Zertifikate?|Bescheinigungen?|Credentials?|Certifications?|Certificates?|Certificering|Certificación(?:es)?|Licenses?(?:\s+(?:and|&|und)\s+certifications?)?)\s*:?$/iu;
const PROFESSIONAL_MATRIX_RATING_RE = /^(?:(?:[●○◐◑◒◓◔★☆◆◇■□]\s*){2,10}|(?:[0-5](?:[.,]\d)?\s*\/\s*5)|(?:[0-9]{1,3}\s*%))$/u;
const PROFESSIONAL_PHRASE_RE = /\b(?:Administration|Analysis|Architecture|Assurance|Automation|Collaboration|Communication|Consulting|Delivery|Design|Development|Engineering|Excellence|Governance|Informatics|Integration|Leadership|Learning|Management|Migration|Modeling|Optimierung|Optimization|Planning|Programmierung|Resolution|Research|Security|Skills?|Strategy|Success|Testing|Transformation|Verwaltung)\b/iu;
// Independent from the redactor's credential catalogue. If that catalogue is
// accidentally narrowed, a clearly labelled secret must still stop release.
const RESIDUAL_CREDENTIAL_LABEL_RE = /^(?:Pass[ \t]*wort|Kenn[ \t]*wort|Pass[ \t]*word|Pass[ \t]*phrase|Secret|Token|API(?:[ \t-]+)?Key|Zugangs[ \t]*daten|Zugangs[ \t]*code|PIN|Benutzer[ \t]*name|Nutzer[ \t]*name|User[ \t]*name|Login(?:[ \t]*name)?|Anmelde[ \t]*name|Konto[ \t]*kennung)\s*:?$/iu;
const RESIDUAL_CREDENTIAL_FIELD_RE = /^[ \t]*(?:>[ \t]*)?(?:[-*+][ \t]+)?(?:Pass[ \t]*wort|Kenn[ \t]*wort|Pass[ \t]*word|Pass[ \t]*phrase|Secret|Token|API(?:[ \t-]+)?Key|Zugangs[ \t]*daten|Zugangs[ \t]*code|PIN|Benutzer[ \t]*name|Nutzer[ \t]*name|User[ \t]*name|Login(?:[ \t]*name)?|Anmelde[ \t]*name|Konto[ \t]*kennung)[ \t]*(?::|=|：|＝)[ \t]*\S[^\r\n]*$/gimu;
const RESIDUAL_CREDENTIAL_FRAGMENT_PAIRS = [
  ['pass', 'wort'], ['kenn', 'wort'], ['pass', 'word'], ['pass', 'phrase'],
  ['api', 'key'], ['zugangs', 'daten'], ['zugangs', 'code'],
  ['benutzer', 'name'], ['nutzer', 'name'], ['user', 'name'], ['login', 'name'],
  ['anmelde', 'name'], ['konto', 'kennung']
];

function residualCredentialCandidates(text) {
  const source = String(text || '');
  const findings = [];
  for (const match of source.matchAll(RESIDUAL_CREDENTIAL_FIELD_RE)) {
    const lineEnd = source.indexOf('\n', match.index);
    const nextEnd = lineEnd < 0 ? -1 : source.indexOf('\n', lineEnd + 1);
    const nextLine = lineEnd < 0 ? '' : source.slice(lineEnd + 1, nextEnd < 0 ? source.length : nextEnd).replace(/\r$/u, '');
    if (/^[ \t]*(?:={3,}|-{3,})[ \t]*$/u.test(nextLine)) continue;
    findings.push({ type: 'CREDENTIAL', text: '' });
  }
  const rows = source.split(/\r?\n/u);
  for (let index = 0; index + 2 < rows.length; index++) {
    const immediateHeaders = markdownTableCells(rows[index]);
    const separator = markdownTableCells(rows[index + 1]);
    if (!immediateHeaders || !separator || immediateHeaders.length !== separator.length ||
        !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    const headerBlock = [];
    for (let cursor = index; cursor >= 0; cursor--) {
      const candidate = markdownTableCells(rows[cursor]);
      if (!candidate || candidate.length !== separator.length ||
          candidate.every((cell) => /^:?-{3,}:?$/u.test(cell))) break;
      headerBlock.unshift(candidate);
    }
    const headers = immediateHeaders.map((header, column) => {
      if (RESIDUAL_CREDENTIAL_LABEL_RE.test(header)) return header;
      for (let count = 2; count <= Math.min(3, headerBlock.length); count++) {
        const combined = normalizeSpaces(headerBlock.slice(-count).map((row) => row[column]).join(' '));
        if (RESIDUAL_CREDENTIAL_LABEL_RE.test(combined)) return combined;
      }
      return header;
    });
    // A fragmented compound that cannot be bound as one supported (maximum
    // three-row) label must stop fail-closed. Requiring both lexical parts in
    // one column keeps ordinary technical columns named "API" or "User"
    // harmless.
    const unboundCredentialPair = separator.some((_, column) => {
      const parts = headerBlock.map((row) => normalizeSpaces(row[column]).toLowerCase());
      return RESIDUAL_CREDENTIAL_FRAGMENT_PAIRS.some(([first, last]) =>
        parts.includes(first) && parts.includes(last)) &&
        !RESIDUAL_CREDENTIAL_LABEL_RE.test(headers[column]);
    });
    if (unboundCredentialPair) findings.push({ type: 'CREDENTIAL', text: '' });
    index += 2;
    while (index < rows.length) {
      const values = markdownTableCells(rows[index]);
      if (!values || values.length !== headers.length) {
        index--;
        break;
      }
      for (let column = 0; column < values.length; column++) {
        if (RESIDUAL_CREDENTIAL_LABEL_RE.test(headers[column]) && normalizeSpaces(values[column])) {
          findings.push({ type: 'CREDENTIAL', text: '' });
        }
      }
      index++;
    }
  }
  return findings;
}

function visibleTableCellValue(value) {
  let visible = normalizeSpaces(value).replace(/<\/?[A-Za-z][^>\n]{0,1000}>/gu, '').trim();
  const inlineLink = visible.match(/^!?\[([^\n]{1,500}?)\]\([^\n)]{1,2000}\)$/u);
  if (inlineLink) visible = inlineLink[1];
  const referenceLink = visible.match(/^!?\[([^\n]{1,500}?)\]\[[^\n]{0,500}\]$/u);
  if (referenceLink) visible = referenceLink[1];
  return normalizeSpaces(visible.replace(/^(?:\*\*|__|~~|`{1,3})(.*?)(?:\*\*|__|~~|`{1,3})$/u, '$1'));
}

function residualTablePersonCandidates(text) {
  const source = String(text || '');
  const all = source.split(/\r?\n/u);
  const lineOffsets = [0];
  // Review coordinates belong to the unchanged canonical text. CRLF consumes
  // two code units; treating it as LF can bind a cell to an earlier namesake.
  for (const separator of source.matchAll(/\r?\n/gu)) {
    lineOffsets.push(separator.index + separator[0].length);
  }
  const findings = [];
  const seen = new Set();
  for (let index = 0; index + 2 < all.length; index++) {
    const headers = markdownTableCells(all[index]);
    const separator = markdownTableCells(all[index + 1]);
    if (!headers || !separator || headers.length !== separator.length ||
        !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    // A plain cell in a table without any sensitive identity header can be
    // bound to an exact local-review span. Identity-labelled tables and
    // transformed/escaped cells retain the strict gate.
    const generatedColumns = headers.every((header, column) => header === `Spalte ${column + 1}`);
    const reviewableColumns = generatedColumns || !headers.some(isResolvedSensitiveTableHeader);
    index += 2;
    while (index < all.length) {
      const row = markdownTableCells(all[index]);
      if (!row || row.length !== headers.length) {
        index--;
        break;
      }
      for (let column = 0; column < row.length; column++) {
        if (PROFESSIONAL_TABLE_COLUMN_RE.test(headers[column]) ||
            RESIDUAL_CREDENTIAL_LABEL_RE.test(headers[column])) continue;
        const value = row[column];
        const candidate = visibleTableCellValue(value);
        const candidateKey = key(candidate);
        const words = candidate.split(/\s+/u).filter(Boolean);
        const ratedProfessionalPhrase = row.some((cell, index) => index !== column &&
          PROFESSIONAL_MATRIX_RATING_RE.test(visibleTableCellValue(cell))) &&
          PROFESSIONAL_PHRASE_RE.test(candidate);
        if (words.length === 2 && candidate.length <= 160 && looksName(candidate) && !ratedProfessionalPhrase) {
          const raw = all[index];
          const cells = raw.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|');
          if (reviewableColumns && !raw.includes('\\|') && value === candidate && cells.length === row.length &&
              !cells[column].includes('\\') && raw.trim().startsWith('|')) {
            const start = lineOffsets[index] + raw.indexOf('|') + 1 +
              cells.slice(0, column).reduce((sum, cell) => sum + cell.length + 1, 0) + cells[column].indexOf(candidate);
            if (String(text).slice(start, start + candidate.length) === candidate) {
              findings.push({ type: 'PERSON_CANDIDATE', text: candidate, start, end: start + candidate.length });
              continue;
            }
          }
          if (!seen.has(candidateKey)) {
            seen.add(candidateKey);
            findings.push({ type: 'PERSON_CANDIDATE', text: candidate });
          }
        }
      }
      index++;
    }
  }
  return findings;
}

function residualSensitiveListPersons(text) {
  // Independent release check: if the redactor's explicit-column rule ever
  // regresses, a semicolon-delimited name must not quietly ship in Markdown.
  const label = /^(?:Muss ersetzt werden|Personenbezogene Daten|Personennamen|Sensitive data|PII):?$/iu;
  const findings = [];
  for (const value of markdownTableColumnValues(text, label)) {
    for (const part of value.split(';')) {
      const candidate = normalizeSpaces(part);
      if (looksName(candidate)) findings.push({ type: 'PERSON_CANDIDATE', text: candidate });
    }
  }
  return findings;
}

function conservativeLabelledResiduals(text) {
  const findings = [];
  for (const match of text.matchAll(RESIDUAL_PERSON_TABLE_CANDIDATE_RE)) {
    const candidate = normalizeSpaces(match[1]);
    if (looksName(candidate)) findings.push({ type: 'PERSON_CANDIDATE', text: candidate });
  }
  for (const match of text.matchAll(RESIDUAL_DATE_CANDIDATE_RE)) {
    if (plausibleCalendarDate(match[0]) && hasLabelBefore(text, match.index, DATE_OF_BIRTH_LABEL_RE, 80)) {
      findings.push({ type: 'DATE_OF_BIRTH', text: match[0] });
    }
  }
  const phoneView = identifierDetectionText(text);
  for (const match of phoneView.matchAll(RESIDUAL_PHONE_CANDIDATE_RE)) {
    const digits = match[0].replace(/\D/gu, '');
    if (digits.length >= 6 && digits.length <= 15 && !plausibleCalendarDate(match[0]) &&
        hasLabelBefore(phoneView, match.index, PHONE_LABEL_RE, PHONE_LABEL_WINDOW)) {
      findings.push({ type: 'PHONE', text: text.slice(match.index, match.index + match[0].length) });
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
  // Use the same bounded quote/list prefixes as collectPersonAnchors. Their
  // label applies only at this occurrence, not to every matching company alias.
  const labelledPrefix = linePrefix.replace(/^[ \t]*(?:>[ \t]*)?(?:[-*+][ \t]+)?/u, '');
  if (new RegExp(`(?:^|\\|)\\s*${PERSON_LABEL}\\s*(?::|\\|)\\s*$`, 'iu').test(labelledPrefix)) {
    // "Kunde" is intentionally accepted as a person label for documents such
    // as "Kunde: Max Mustermann", but it is also a strong organisation label.
    // A legal-form organisation at this exact position wins; otherwise the
    // same words would be emitted twice as ORGANIZATION and PERSON spans and
    // OCR would over-redact company names. Suffixless values keep the person
    // interpretation, while an explicit person occurrence elsewhere remains
    // independent from this position-bound decision.
    const ambiguousCustomerLabel = /(?:^|\|)[ \t]*(?:Kunde|Kundin)[ \t]*(?::|\|)[ \t]*$/iu.test(labelledPrefix);
    if (ambiguousCustomerLabel && coveringOrganizations.some((org) => org.provenCompany === true || ORG_SUFFIX_TAIL_RE.test(org.text))) return false;
    return true;
  }
  if (HONORIFIC_PREFIX_RE.test(before)) return true;
  return /(?:Zertifikat|Bescheinigung|certificate|credential)\s+(?:für|for)\s*$/iu.test(linePrefix);
}

function isPersistedPersonAliasOccurrence(text, span, coveringOrganizations = []) {
  // A persisted surname proves which pseudonym to reuse, but not that an
  // equal word in a later document denotes the person. Decide at the exact
  // source position. For a Markdown link label, move the context boundary
  // over the opening bracket while leaving the replacement span unchanged;
  // growOverMarkdownLabel consumes the brackets after this decision.
  const contextSpan = span.start > 0 && text[span.start - 1] === '['
    ? { ...span, start: span.start - 1 }
    : span;
  if (isExplicitPersonOccurrence(text, contextSpan, coveringOrganizations)) return true;

  const header = tableHeaderAt(text, span.start);
  if (header && new RegExp(`^(?:${PERSON_LABEL}):?$`, 'iu').test(normalizeSpaces(header))) return true;

  const before = text.slice(Math.max(0, span.start - 80), span.start);
  return /(?:z\.\s*hd\.?|zu\s+händen)\s*:?\s*$/iu.test(before);
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

function distinctiveOrganizationAlias(value) {
  const alias = orgAlias(value);
  const distinctive = /\s/u.test(alias) || /^(?=.*[A-ZÄÖÜ])[A-ZÄÖÜ0-9&.+\-]{3,}$/u.test(alias);
  return alias.length >= 5 && alias !== value && distinctive && !isAllowedOrg(alias) ? alias : null;
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
    // A spreadsheet or filename can spell the already anchored full identity
    // as a slug. Match the whole two-token name before the surname alias does,
    // otherwise "Laura-Stein" becomes the leaking "Laura-[PERSON]".
    if (/^[\p{L}][\p{L}'’]+[ \t]+[\p{L}][\p{L}'’]+$/u.test(canonical)) {
      entries.push({ value: canonical.replace(/[ \t]+/u, '-'), placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    if (seed.matchValue && seed.matchValue !== seed.value) {
      entries.push({ value: seed.matchValue, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    if (canonical !== seed.value) {
      entries.push({ value: canonical, placeholder: ph, type: 'PERSON', priority: PRIORITY.PERSON });
    }
    const toks = canonical.split(/\s+/);
    const surname = toks[toks.length - 1];
    if (!seed.noSurnameAlias && looksSurname(surname) && surname.length >= 3 &&
        (reg.readable === true || !surnameToPlaceholder.has(key(surname)))) {
      surnameToPlaceholder.set(key(surname), ph);
      if (typeof reg.remember === 'function') reg.remember('PERSON', surname, ph);
      if (reg.readable === true) surnameToPlaceholder.set(key(surname), reg.lookup('PERSON', surname));
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

function buildOrgDictionary(text, reg, profile, findings, personKeys = new Set()) {
  const entries = [];
  const orgs = collectOrganizations(text).filter((org) =>
    ORG_SUFFIX_TAIL_RE.test(org) || !personKeys.has(key(org))
  );

  for (const org of orgs) {
    const existing = reg.lookup('ORG', org);
    const ph = existing || reg.assign(profile === 'personnel_profile' ? 'CUSTOMER' : 'ORG', org);
    if (!existing) {
      if (typeof reg.rememberOrganizationAlias === 'function') reg.rememberOrganizationAlias(org, org, ph);
      else if (typeof reg.remember === 'function') reg.remember('ORG', org, ph);
      else reg.map.set(`ORG:${key(org)}`, ph);
    }
    findings.push({ type: 'ORGANIZATION', value_hash: hashShort(org) });
  }

  // Includes organisations registered by the personnel line rules.
  const orgPairs = typeof reg.entriesForKind === 'function' ? reg.entriesForKind('ORG').map(({ value, placeholder }) => [`ORG:${value}`, placeholder]) : reg.map;
  const aliases = new Map();
  for (const [mapKey, ph] of orgPairs) {
    if (!mapKey.startsWith('ORG:')) continue;
    const value = mapKey.slice(4);
    if (!ORG_SUFFIX_TAIL_RE.test(value) && personKeys.has(key(value))) continue;
    entries.push({
      value,
      placeholder: ph,
      type: 'ORGANIZATION',
      priority: PRIORITY.ORGANIZATION
    });
    const alias = distinctiveOrganizationAlias(value);
    if (alias) {
      const aliasKey = key(alias);
      if (!aliases.has(aliasKey)) aliases.set(aliasKey, { value: alias, identities: new Map() });
      aliases.get(aliasKey).identities.set(key(value), ph);
    }
  }

  // A short name shared by two legal entities is not proof that they are the
  // same company. Resolve aliases once, after all full names are registered,
  // instead of letting equal-priority span order silently choose the first.
  const resolvedAliases = [];
  for (const { value, identities } of aliases.values()) {
    let placeholder = identities.values().next().value;
    if (typeof reg.rememberOrganizationAlias === 'function') {
      for (const [identity, ph] of identities) reg.rememberOrganizationAlias(value, identity, ph);
      placeholder = reg.lookup('ORG', value);
    } else if (reg.readable === true) {
      for (const ph of identities.values()) reg.remember('ORG', value, ph);
      placeholder = reg.lookup('ORG', value);
    } else if (identities.size > 1) {
      // Legacy personnel employers use a role placeholder that is deliberately
      // not a persistent entity reservation. Do not pretend its alias names a
      // specific employer/customer, or write it into the HMAC registry.
      placeholder = '[ORGANISATION_UNKLAR]';
    }
    resolvedAliases.push({ value, placeholder, type: 'ORGANIZATION', priority: PRIORITY.ORGANIZATION });
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

  return entries.filter((entry) => entry.type !== 'ORGANIZATION' || !aliases.has(key(entry.value)))
    .concat(resolvedAliases);
}

function anonymize(text, profile = 'general', options = {}) {
  const src = canonicalizeRenderedText(text);
  // Entity discovery must never reinterpret a credential value as a person,
  // organisation or project and then retain its raw value/hash in the batch
  // registry. Mask only the already label-bound value spans, preserving every
  // coordinate for the later replacement pass over the real source.
  const sourceCredentialSpans = findStructuredSpans(src).filter((span) => span.type === 'CREDENTIAL');
  const analysisSrc = applySpans(src, sourceCredentialSpans.map((span) => ({
    ...span,
    replacement: ' '.repeat(span.end - span.start)
  })));
  const findings = [];
  const reg = options.registry || makeRegistry();
  const knownAliases = typeof reg.matchKnownAliases === 'function' ? reg.matchKnownAliases(analysisSrc) : [];
  const sourceCredentialRanges = credentialContextSpans(analysisSrc);
  const sourceOrganizations = collectOrganizations(analysisSrc);
  const sourceOrgSpans = sourceOrganizations.flatMap((org) =>
    findLiteralSpans(analysisSrc,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
  );
  const legalOrganizationNames = [...new Set([...sourceOrganizations
    .filter((org) => ORG_SUFFIX_TAIL_RE.test(org)).flatMap((org) =>
      [org, distinctiveOrganizationAlias(org)].filter(Boolean)
    ), ...knownAliases.filter((entry) => entry.kind === 'ORG').map((entry) => entry.value)])];
  // V2 aliases are privately retained across resume. A typed company already
  // known in this batch must not turn into a new person merely because the
  // following document uses its customer label without the legal suffix.
  if (reg.readable === true) {
    for (const org of sourceOrganizations) {
      if (reg.lookup('ORG', org) && !legalOrganizationNames.includes(org)) legalOrganizationNames.push(org);
    }
  }
  const legalOrganizationSpans = legalOrganizationNames.flatMap((org) =>
    findLiteralSpans(analysisSrc, org, '', 'ORGANIZATION', PRIORITY.ORGANIZATION)
      .map((span) => ({ ...span, provenCompany: true }))
  );
  const organizationOnlySeed = (seed) => {
    const occurrences = findLiteralSpans(analysisSrc, seed.value, '', 'PERSON', PRIORITY.PERSON);
    return occurrences.length > 0 && occurrences.every((span) => {
      const covering = legalOrganizationSpans.filter((org) => span.start >= org.start && span.end <= org.end);
      return covering.length > 0 && !isExplicitPersonOccurrence(analysisSrc, span, covering);
    });
  };

  // "Kunde" can introduce a person, but a proven legal company (including
  // its repeated short name) must not create a global PERSON/surname alias.
  // Explicit Name/Herr/holder occurrences remain independent evidence.
  const strongPersonAnchors = collectPersonAnchors(analysisSrc, profile).filter((seed) => !organizationOnlySeed(seed));
  const persistedSinglePersonAliases = knownAliases.filter((alias) =>
    alias.kind === 'PERSON' && normalizeSpaces(alias.value).split(/\s+/u).length === 1
  );
  // A one-word alias retained from an earlier document is not a global seed:
  // "Sommer" and "Einkauf" are ordinary German words as well as surnames.
  // Their concrete occurrences are handled position-by-position below. Exact
  // multi-token identities keep the established batch-wide behaviour.
  const persistedSinglePersonKeys = new Set(persistedSinglePersonAliases.map((alias) => key(alias.value)));
  const explicitPersonKeys = new Set(strongPersonAnchors
    .filter((seed) => ['label', 'honorific', 'credential_holder'].includes(seed.confidence))
    .map((seed) => key(seed.value)));
  // Preserve that context on subsequent privacy passes after the explicit
  // name itself became a placeholder (readable and legacy batch labels).
  // An unlabelled full identity actually matched in this document is still
  // anchored by the batch. A lone surname is not: it can be ordinary prose.
  const knownPersonAnchor = knownAliases.some((alias) =>
    alias.kind === 'PERSON' && normalizeSpaces(alias.value).split(/\s+/u).length > 1);
  const otherPersonEvidence = explicitPersonKeys.size > 0 || /\[PERSON(?:_UNKLAR)?_[A-Z0-9]+\]/u.test(analysisSrc) ||
    knownPersonAnchor;
  const deferredTypographyKeys = new Set();
  const candidates = collectPersonSeeds(analysisSrc, profile, strongPersonAnchors, otherPersonEvidence ? true : null)
    .filter((seed) => {
      if (persistedSinglePersonKeys.has(key(seed.value))) return false;
      // A separately anchored person does not prove an unrelated all-caps
      // title is another name. Keep that competing typographic hypothesis for
      // the existing occurrence-bound local review,
      // before assigning either a person identity or a global surname alias.
      // Explicit labels, honorifics, holders and established batch
      // identities are independent evidence and retain normal redaction.
      if (otherPersonEvidence && !explicitPersonKeys.has(key(seed.value)) && uppercasePresentationHypothesis(seed)) {
        deferredTypographyKeys.add(key(seed.value));
        return false;
      }
      return true;
    });
  const candidateKeys = new Set(candidates.map((seed) => key(seed.value)));
  for (const alias of knownAliases) {
    if (alias.kind !== 'PERSON' || persistedSinglePersonKeys.has(key(alias.value)) ||
        candidateKeys.has(key(alias.value))) continue;
    // Existing aliases are already identity decisions. Do not infer another
    // surname from them, and do not renumber them when this document has no label.
    candidates.push({ value: alias.value, confidence: 'batch_alias', noSurnameAlias: true });
    candidateKeys.add(key(alias.value));
  }
  const seeds = candidates.filter((seed) => {
    if (organizationOnlySeed(seed)) return false;
    const occurrences=findLiteralSpans(analysisSrc,seed.value,'','PERSON',PRIORITY.PERSON);
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
    if (occurrences.every((span) => inCredentialContext(analysisSrc, span.start, span.end, sourceCredentialRanges)) &&
        !['label', 'honorific', 'credential_holder'].includes(seed.confidence)) return false;
    return !occurrences.every((span) =>
      inCredentialContext(analysisSrc,span.start,span.end,sourceCredentialRanges) &&
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
  if (profile === 'personnel_profile' || profile === 'applicant') {
    const knownDashCompanyRanges = knownAliases.filter((alias) => alias.kind === 'ORG' && /\s-\s/u.test(alias.value))
      .flatMap((alias) => findLiteralSpans(analysisSrc, alias.value, '', 'ORGANIZATION', PRIORITY.ORGANIZATION));
    out = anonymizePersonnel(out, reg, findings, personKeys, knownDashCompanyRanges, deferredTypographyKeys);
  }
  const credentialRanges = credentialContextDetails(out);

  const dictionary = [
    ...buildPersonDictionary(seeds, reg),
    ...buildOrgDictionary(analysisSrc, reg, profile, findings, personKeys)
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
  const detectedStructuredSpans = findStructuredSpans(out);
  const spans = [...detectedStructuredSpans].filter((span) =>
    !(span.type === 'URL' && isProtectedProfessionalDomain(out,span.start,span.end,credentialRanges))
  );
  const outputCredentialSpans = detectedStructuredSpans.filter((span) => span.type === 'CREDENTIAL');
  const outputAnalysis = applySpans(out, outputCredentialSpans.map((span) => ({
    ...span,
    replacement: ' '.repeat(span.end - span.start)
  })));
  const organizationCoverage = collectOrganizations(outputAnalysis).filter((org) =>
    ORG_SUFFIX_TAIL_RE.test(org) || !personKeys.has(key(org))
  ).flatMap((org) =>
    findLiteralSpans(outputAnalysis, org, '', 'ORGANIZATION', PRIORITY.ORGANIZATION)
  );
  organizationCoverage.push(...legalOrganizationNames.flatMap((org) =>
    findLiteralSpans(out, org, '', 'ORGANIZATION', PRIORITY.ORGANIZATION)
      .map((span) => ({ ...span, provenCompany: true }))
  ));
  for (const alias of persistedSinglePersonAliases) {
    let matched = false;
    const found = findLiteralSpans(out, alias.value, alias.placeholder, 'PERSON_ALIAS', PRIORITY.PERSON_ALIAS);
    for (const span of found) {
      const coveringOrganizations = organizationCoverage.filter((org) =>
        span.start >= org.start && span.end <= org.end
      );
      if (!isPersistedPersonAliasOccurrence(out, span, coveringOrganizations)) continue;
      spans.push(growOverMarkdownLabel(out, growOverHonorific(out, span)));
      matched = true;
    }
    if (matched) findings.push({ type: 'PERSON', value_hash: hashShort(alias.value) });
  }
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
  const usable = spans.filter((s) => !reserved.some((r) => s.start < r.end && r.start < s.end &&
    // A label-bound credential span owns the entire sensitive value, including
    // forged/misplaced marker inside it. A marker must not shield neighbouring
    // password text. Pure credential/manual-redaction values were excluded by
    // the structural detector and therefore remain idempotent.
    !(s.type === 'CREDENTIAL' && s.start <= r.start && s.end >= r.end)));
  const usableCredentials = sortedCredentialIntervals(usable);

  // Person and organisation findings are recorded when the dictionary is built;
  // everything else is recorded from the spans that actually matched.
  for (const span of usable) {
    if (span.type === 'PERSON' || span.type === 'PERSON_ALIAS') continue;
    if (span.type === 'ORGANIZATION' || span.type === 'PROJECT') continue;
    const credentialCoverage = overlapsCredential(usableCredentials, span.start, span.end);
    if (span.type !== 'CREDENTIAL' && credentialCoverage) continue;
    findings.push(span.type === 'CREDENTIAL'
      ? { type: span.type }
      : { type: span.type, value_hash: hashShort(span.text) });
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
    strongPersonAnchor: strongPersonAnchors.length > 0 || knownPersonAnchor,
    reidentification_risk: profile === 'personnel_profile' ? 'high' : 'context_dependent'
  };
}

// The verifier must not share the redactor's allowlists, otherwise it can only
// ever confirm the redactor's own blind spots. It checks two independent
// things: that no direct identifier pattern is left, and that no literal the
// redactor claimed to have replaced survives in the output.
function scanResidual(text, profile = 'general', knownValues = [], options = {}) {
  const rendered = canonicalizeRenderedText(text);
  // Keep UTF-16 coordinates in the canonical view. A local human decision is
  // occurrence-bound; shrinking placeholders would move its reviewed span.
  const clean = maskPlaceholders(rendered);
  // Discovery needs blank placeholder-only lines to retain late name context.
  // Literal occurrence matching, however, must not bridge those blanks: they
  // stand for already replaced text, not whitespace in an intact source name.
  // Keep the exact UTF-16 coordinates and an opaque, non-whitespace barrier.
  const personOccurrenceText = maskPlaceholders(rendered, '\uFFFC');
  const reviewedRanges = reviewedPersonRanges(options.reviewedPersonCandidates, rendered);
  const credentialRanges = credentialContextDetails(clean);
  const structured = scanStructured(clean);
  const credentialSpans = sortedCredentialIntervals(structured);
  const insideCredentialValue = (start, end) => overlapsCredential(credentialSpans, start, end);
  const out = structured
    .filter((f) => !(f.type === 'URL' && isProtectedProfessionalDomain(clean,f.start,f.end,credentialRanges)))
    .filter((f) => f.type === 'CREDENTIAL' || !insideCredentialValue(f.start, f.end))
    .map((f) => ({ type: f.type, text: f.type === 'CREDENTIAL' ? '' : f.text }));
  // This dependency is internal and is always the actual canonical parser
  // source in the publication workflow, never a user/MCP provenance claim.
  // Inspect imported variable-payload labels (numeric IDs as well as HMACs)
  // before opaque marker masking.
  // Exact reviewed bytes/ranges may waive only their explicit Keep choice.
  for (const finding of importedSourceMarkerCandidates(options.originalSourceText || '', rendered)) {
    if (reviewedRanges.some(range => range.start === finding.start && range.end === finding.end)) continue;
    out.push(options.includePersonCandidateSpans === true ? finding : { type: finding.type, text: finding.text });
  }
  if (residualCredentialCandidates(clean).length && !out.some((finding) => finding.type === 'CREDENTIAL')) {
    out.push({ type: 'CREDENTIAL', text: '' });
  }
  for (const finding of conservativeLabelledResiduals(clean)) {
    if (!out.some((current) => current.type === finding.type && current.text === finding.text)) out.push(finding);
  }
  for (const finding of residualSensitiveListPersons(clean)) {
    if (!out.some((current) => current.type === finding.type && current.text === finding.text)) out.push(finding);
  }
  // This structural final gate is intentionally independent from PERSON_LABEL.
  // A missing operational column label may prevent redaction, but it must not
  // make a remaining name-shaped table value releasable.
  const residualKeys = new Set(out.map((finding) => `${finding.type}:${key(finding.text)}`));
  for (const finding of residualTablePersonCandidates(clean)) {
    const located = Number.isSafeInteger(finding.start) && Number.isSafeInteger(finding.end);
    if (located && reviewedRanges.some((range) => range.start === finding.start && range.end === finding.end)) continue;
    const findingKey = `${finding.type}:${key(finding.text)}` +
      (located && options.includePersonCandidateSpans === true ? `:${finding.start}:${finding.end}` : '');
    if (!residualKeys.has(findingKey)) {
      residualKeys.add(findingKey);
      out.push(located && options.includePersonCandidateSpans !== true ? { type: finding.type, text: finding.text } : finding);
    }
  }
  // Structure is an independent release condition. A shifted/merged table row
  // cannot be assigned to a sensitive header by position without guessing.
  if (hasAmbiguousSensitiveTable(clean) || hasAmbiguousSensitiveTable(identifierDetectionText(clean))) {
    out.push({ type: 'TABLE_STRUCTURE_AMBIGUOUS', text: '' });
  }
  const residualOrgKeys=new Set();
  const residualOrgSpans=[];
  for(const org of collectOrganizations(clean)) {
    const orgOccurrences = findLiteralSpans(clean,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
      .filter((span) => !insideCredentialValue(span.start, span.end));
    if (!orgOccurrences.length) continue;
    residualOrgKeys.add(key(org));
    residualOrgKeys.add(key(orgAlias(org)));
    residualOrgSpans.push(...orgOccurrences);
  }

  const strongPersonAnchor = options.strongPersonAnchor === true;
  // Explicit person context also makes an unrelated uppercase Markdown title
  // or link label ambiguous in the general profile. Use the existing bounded
  // presentation detector, but only its uppercase hypotheses: no automatic
  // profile change, redaction, or broad Title-Case rule is introduced here.
  const presentationCandidates = (source) => strongPersonAnchor && !['personnel_profile', 'applicant'].includes(profile)
    ? collectPersonSeeds(source, 'personnel_profile', null, true).filter(uppercasePresentationHypothesis) : [];
  // Both views are necessary: intact placeholders preserve actual Markdown
  // boundaries, but masking them exposes adjacent names and prevents already
  // redacted lines from exhausting the bounded profile-header window.
  const intactPersonSeeds = [
    ...collectPersonSeeds(rendered, profile, null, strongPersonAnchor),
    ...presentationCandidates(rendered),
    ...collectContextualNameCandidates(rendered, profile, { includeNegation: true }),
    ...collectNestedMarkdownPersonCandidates(rendered, profile)
  ];
  const intactPersonKeys = new Set(intactPersonSeeds.map((seed) => key(seed.value)));
  const residualPersonSeeds = [...intactPersonSeeds];
  const personDiscoveryText = clean.replace(/^([ \t]*)[–—](?=[ \t])/gmu, '$1-');
  for (const seed of [...collectPersonSeeds(personDiscoveryText, profile, null, strongPersonAnchor),
    ...presentationCandidates(personDiscoveryText),
    ...collectContextualNameCandidates(personDiscoveryText, profile, { includeNegation: true }),
    ...collectNestedMarkdownPersonCandidates(personDiscoveryText, profile)]) {
    if (intactPersonKeys.has(key(seed.value))) continue;
    // Do not waive a candidate based on a negation or an apparent disclaimer:
    // those clauses can themselves contain names. Ambiguity must stop release.
    residualPersonSeeds.push(seed);
  }
  for (const seed of residualPersonSeeds) {
    const occurrences=findLiteralSpans(personOccurrenceText,seed.value,'','PERSON',PRIORITY.PERSON)
      .filter((span) => !insideCredentialValue(span.start, span.end));
    if (!occurrences.length) continue;
    const issuerOnly=occurrences.length>0 && occurrences.every((span) =>
      inCredentialContext(clean,span.start,span.end,credentialRanges) &&
      residualOrgSpans.some((org) => span.start >= org.start && span.end <= org.end)
    );
    const certificationOnly = occurrences.length > 0 && occurrences.every((span) =>
      inCredentialContext(clean, span.start, span.end, credentialRanges)
    ) && !['label', 'honorific', 'credential_holder'].includes(seed.confidence);
    if(issuerOnly || certificationOnly) continue;
    // An explicit person field/holder/honorific is not an ambiguous structural
    // guess. Neither it, a sensitive table value, nor known literal evidence
    // below can be waived by the residual-person reviewer.
    const reviewable = !['label', 'honorific', 'credential_holder'].includes(seed.confidence);
    const remaining = reviewable ? occurrences.filter((span) => !reviewedRanges.some((range) =>
      range.start === span.start && range.end === span.end)) : occurrences;
    if (options.includePersonCandidateSpans === true && reviewable) {
      for (const span of remaining) {
        if (!out.some((finding) => finding.type === 'PERSON_CANDIDATE' && finding.start === span.start && finding.end === span.end)) {
          out.push({ type: 'PERSON_CANDIDATE', text: span.text, start: span.start, end: span.end });
        }
      }
    } else if (remaining.length && !out.some((finding) => finding.type === 'PERSON_CANDIDATE' && key(finding.text) === key(seed.value))) {
      out.push({ type: 'PERSON_CANDIDATE', text: seed.value });
    }
  }

  if (profile === 'personnel_profile' || profile === 'applicant' || profile === 'customer') {
    URL_RE.lastIndex = 0;
    let match;
    while ((match = URL_RE.exec(clean))) {
      if(!insideCredentialValue(match.index, match.index + match[0].length) &&
          !isProtectedProfessionalDomain(clean,match.index,match.index+match[0].length,credentialRanges)) {
        out.push({ type: 'URL', text: match[0] });
      }
    }
  }

  if (profile === 'personnel_profile') {
    for (const org of collectOrganizations(clean)) {
      const occurrences=findLiteralSpans(clean,org,'','ORGANIZATION',PRIORITY.ORGANIZATION)
        .filter((span) => !insideCredentialValue(span.start, span.end));
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
    if (occurrences.some((s)=>!insideCredentialValue(s.start, s.end) && !(credentialOrg &&
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
  const findings = scanStructured(text).map((finding) => ({ type: finding.type, text: finding.text }));
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
  const structured = scanStructured(src);
  const credentialValueSpans = sortedCredentialIntervals(structured);
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
    if (type !== 'CREDENTIAL' && overlapsCredential(credentialValueSpans, start, end)) return;
    const k = `${start}:${end}:${type}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ type, start, end, text: value });
  }

  for (const f of structured) {
    if(f.type === 'URL' && isProtectedProfessionalDomain(src,f.start,f.end,credentialRanges)) continue;
    add(f.type, f.start, f.end, f.type === 'CREDENTIAL' ? '' : f.text);
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
