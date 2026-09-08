'use strict';

const { lineBoundsAt } = require('./spans');
const {
  NAME_TOKEN,
  CAPS_TOKEN,
  NAME_PARTICLE,
  ORG_SUFFIX,
  COMPANY_RE,
  normalizeSpaces,
  key,
  lines,
  titleCase,
  isStopToken,
  looksName,
  looksSurname,
  ROLE_WORDS
} = require('./base');

// Some brands and their registered legal forms are intentionally written in
// lower case (for example "msg systems ag"). The general COMPANY_RE stays
// capitalization-sensitive to avoid interpreting arbitrary prose as a company.
// Lower/mixed-case variants are accepted only as a whole labelled value, a
// party-list segment, or a complete standalone line. In particular, ordinary
// prose connectors such as "und" never establish company context themselves.
const COMPANY_WORD = "[A-Za-z0-9ÄÖÜäöüß&.'’+\\-/]+";
const SEGMENT_COMPANY_RE = new RegExp(
  `^[ \\t]*(?:die[ \\t]+)?(${COMPANY_WORD}(?:[ \\t]+${COMPANY_WORD}){0,7}[ \\t]+${ORG_SUFFIX})` +
    `(?=[ \\t]*(?:$|[.,;:]|\\(|[-–—]|vertreten\\b|nachfolgend\\b))`,
  'iu'
);
const PARTY_COMPANY_RE = new RegExp(
  `(?:^|[,;][ \\t]*(?:und|sowie|als[ \\t]+auch|and)[ \\t]+|\\b(?:und|sowie|als[ \\t]+auch|and)[ \\t]+)(?:die[ \\t]+)?` +
  `(${COMPANY_WORD}(?:[ \\t]+${COMPANY_WORD}){0,7}?[ \\t]+${ORG_SUFFIX})` +
    `(?=[ \\t]*(?:$|[.,;:]|\\(|[-–—]|\\b(?:und|sowie|als[ \\t]+auch|and)\\b|vertreten\\b|represented\\b|nachfolgend\\b))`,
  'giu'
);
const COMPANY_LABEL_RE =
  /^(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Arbeitgeber|Unternehmen|Firma|Organisation|Company|Organization|Employer(?:\s+Name)?|Customer(?:\s+Organization)?|Contract\s+party|Client|Vendor|Supplier|Entreprise|Employeur|Société|Empresa|Empleador|Compañía|Bedrijf|Werkgever)\s*:\s*(.+)$/iu;
const COMPANY_TABLE_RE =
  /^\|?\s*(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Arbeitgeber|Unternehmen|Firma|Organisation|Company|Organization|Employer(?:\s+Name)?|Customer(?:\s+Organization)?|Contract\s+party|Client|Vendor|Supplier|Entreprise|Employeur|Société|Empresa|Empleador|Compañía|Bedrijf|Werkgever)\s*:?\s*\|\s*([^|]+)\|?/iu;
const PARTY_CLAUSE_RE =
  /\b(?:Vertragsparteien?\s+(?:sind|:)|(?:Vertrag|Vereinbarung)\s+zwischen|Parties\s+(?:are|:)|(?:Service\s+)?Agreement\s+between)\s+(.+)$/iu;
// A role before "für/bei" is professional content, not the first words of a
// legal-form organisation. Without this boundary a complete standalone line
// such as "Testmanager für Fiktive Gesundheit GmbH" could be consumed as one
// organisation by the deliberately broad standalone-line matcher.
const PROFESSIONAL_ORG_PREFIX_RE = /^(?:(?:Senior\s+|Lead\s+)?(?:Product\s+Owner|Scrum\s+Master|Software\s+Engineer|Softwareentwickler(?:in)?|Entwickler(?:in)?|Entwicklung|Softwareentwicklung|Architektur|Konzeption|Beratung|Testmanager(?:in)?|Testmanagement|Tester(?:in)?(?:\s+im\s+Projekt)?|Training|Aufgaben|Projekt|Business\s+Analyst(?:in)?|QA\s+Engineer|IT-?Projektleiter(?:in)?|FHIR-(?:Entwickler(?:in)?|Entwicklung))|Worked|Employed|Working)\s+(?:für|bei|at|for|with)\s+/iu;
const STRONG_SUFFIXLESS_ORG_LABEL_RE =
  /^(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Unternehmen|Firma|Organisation|Company|Organization|Employer(?:\s+Name)?|Customer(?:\s+Organization)?|Contract\s+party|Client|Vendor|Supplier)\s*:/iu;

function labelledOrganizationValue(value) {
  const clean = normalizeSpaces(value).replace(/[.,;:]\s*$/u, '');
  if (!clean || clean.length > 160 || clean.startsWith('[') || /[<>]/u.test(clean)) return null;
  return clean;
}

const CLAUSE_ABBREVIATIONS = new Set([
  'dr', 'prof', 'nr', 'hd', 'str', 'bzw', 'ca', 'ggf', 'inkl', 'zzgl', 'u', 'a'
]);

// A party clause may contain abbreviations and address components before the
// next party ("Dr.", "z. Hd.", "Musterstr.", "Nr. 7"). Only a real sentence
// stop between two company matches ends the proven party context. The scan is
// line-local and bounded by the already matched clause.
function hasPartySentenceBoundary(gap, followedByPartyConnector = false) {
  const value = String(gap || '');
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== '.') continue;
    const before = value.slice(0, index);
    const word = before.match(/([\p{L}]+)$/u)?.[1]?.toLocaleLowerCase('de-DE') || '';
    const previous = index > 0 ? value[index - 1] : '';
    if (/\d/u.test(previous)) {
      const after = value.slice(index + 1);
      if (/^\d/u.test(after) || (followedByPartyConnector && /^[ \t]*$/u.test(after))) continue;
    }
    if (word.length === 1 || CLAUSE_ABBREVIATIONS.has(word) || word.endsWith('str')) continue;
    return true;
  }
  return false;
}

function collectContextOrganizations(text) {
  const out = [];
  for (const line of lines(text)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const table = trimmed.match(COMPANY_TABLE_RE);
    const labelText = trimmed.replace(/^[-*+]\s+/u, '');
    const labelled = labelText.match(COMPANY_LABEL_RE);
    const clause = trimmed.match(PARTY_CLAUSE_RE);
    const candidates = [];
    if (table && STRONG_SUFFIXLESS_ORG_LABEL_RE.test(trimmed.replace(/^\|\s*/u, ''))) {
      const value = labelledOrganizationValue(table[1]);
      if (value) out.push(value);
    }
    if (table) candidates.push(table[1]);
    if (labelled && STRONG_SUFFIXLESS_ORG_LABEL_RE.test(labelText)) {
      const value = labelledOrganizationValue(labelled[1]);
      if (value) out.push(value);
    }
    if (labelled) candidates.push(labelled[1]);
    if (clause) {
      PARTY_COMPANY_RE.lastIndex = 0;
      let party;
      let previousEnd = 0;
      while ((party = PARTY_COMPANY_RE.exec(clause[1]))) {
        if (hasPartySentenceBoundary(clause[1].slice(previousEnd, party.index), party.index > 0)) break;
        out.push(normalizeSpaces(party[1]));
        previousEnd = party.index + party[0].length;
      }
    }
    if (!table && !labelled && !clause &&
        !/^(?:Zertifikat|Bescheinigung|Certificate|Credential)\s+(?:für|for)\s+/iu.test(trimmed)) candidates.push(trimmed);
    for (const candidate of candidates) {
      const organizationCandidate = (!table && !labelled && !clause)
        ? candidate.replace(PROFESSIONAL_ORG_PREFIX_RE, '')
          // A compact credential followed by "bei" names a separate party,
          // not one very long legal-form company including the title.
          .replace(/^[^,;\n]{0,100}\b(?:Expert|Professional|Tester|Practitioner|Zertifikat)\s+bei\s+/iu, '')
        : candidate;
      const match = organizationCandidate.match(SEGMENT_COMPANY_RE);
      if (match) out.push(normalizeSpaces(match[1]));
    }
  }
  for (const value of markdownTableColumnValues(text, /^(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Unternehmen|Firma|Organisation|Company|Organization|Employer(?:\s+Name)?|Customer(?:\s+Organization)?|Contract\s+party|Client|Vendor|Supplier):?$/iu)) {
    const labelled = labelledOrganizationValue(value); if (labelled) out.push(labelled);
  }
  for (const value of markdownTableColumnValues(text, /^(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Arbeitgeber|Unternehmen|Firma|Organisation|Company|Organization|Employer(?:\s+Name)?|Customer(?:\s+Organization)?|Contract\s+party|Client|Vendor|Supplier|Entreprise|Employeur|Société|Empresa|Empleador|Compañía|Bedrijf|Werkgever):?$/iu)) {
    const match = value.match(SEGMENT_COMPANY_RE);
    if (match) out.push(normalizeSpaces(match[1]));
  }
  return out;
}

const PERSON_LABEL =
  '(?:Name|Person|Full\\s+Name|Employee\\s+Name|Candidate\\s+Name|Contact\\s+Name|Mitarbeitername|Vorname|Nachname|Kunde|Kundin|Mitarbeiter(?:in)?|Bewerber(?:in)?' +
  '|Ansprechpartner(?:in)?|Vertreter(?:in)?|Kontaktperson|(?:(?:Interner|Technischer|Fachlicher)\\s+)?Kontakt|Sachbearbeiter(?:in)?' +
  '|Zuständige?|Verantwortliche?|Empfänger(?:in)?|Absender(?:in)?|Unterzeichner(?:in)?|Gesprächspartner(?:in)?' +
  '|Betreuer(?:in)?|Berater(?:in)?|Teilnehmer(?:in)?|Autor(?:in)?|Verfasser(?:in)?|Manager(?:in)?' +
  '|Eigentümer(?:in)?|Bearbeiter(?:in)?|(?:Zuletzt\\s+)?(?:geändert|erstellt)\\s+von' +
  '|Author|Creator|Manager|Owner|Approver|Representative|Contact\\s+person|Last\\s+modified\\s+by|Modified\\s+by|Nom|Nombre|Naam|Имя|ФИО|Όνομα|姓名|氏名|이름)';

// Titles may chain ("Prof. Dr.") and carry lower-case degree qualifiers
// ("Dr. med.", "Dr. rer. nat.", "Dr. h. c."). Review rc91 (F2): the qualifier
// broke the honorific anchor, so "Dr. med. Anna Beispiel" stayed in clear and
// the residual gate, sharing the anchor, agreed.
// The title and qualifier vocabularies are disjoint and the chain is a flat
// repetition, so the pattern stays linear (no nested optional groups that
// could backtrack exponentially on long title-like runs).
// English salutations are gendered as well; without them "Mrs. Erika Beispiel"
// carried neither a name anchor nor a salutation removal (counter-review rc93).
const GENDERED_SALUTATION = '(?:Herrn?|Frau|(?<![\\p{L}])M(?:rs|r|s|x)\\.?)';
// "Dr.-Ing." is one title token; "Dr." followed by "-Ing." broke the anchor and
// left the whole name in clear (counter-review rc93).
const ACADEMIC_TITLE = '(?:Dr\\.?(?:-Ing\\.?)?|Prof\\.?|PD|Priv\\.-Doz\\.?|Dipl\\.?-?(?:Ing|Inf|Kfm|Psych|Päd)\\.?|Mag\\.?)';
const HONORIFIC_TITLE = `(?:${GENDERED_SALUTATION}|${ACADEMIC_TITLE})`;
const HONORIFIC_QUALIFIER = '(?:med|dent|vet|jur|phil|theol|oec|habil|h\\.\\s?c|rer\\.\\s?(?:nat|pol|soc|medic))\\.?';
const HONORIFIC = `(?:${HONORIFIC_TITLE}(?:\\s+(?:${HONORIFIC_TITLE}|${HONORIFIC_QUALIFIER})){0,5})`;
const ACADEMIC_HONORIFIC = `(?:${ACADEMIC_TITLE}(?:\\s+(?:${ACADEMIC_TITLE}|${HONORIFIC_QUALIFIER})){0,5})`;

function markdownTableCells(line) {
  const source = String(line || '').trim();
  if (!source.includes('|')) return null;
  const body = source.replace(/^\|/u, '').replace(/\|$/u, '');
  const cells = [];
  let value = '';
  let escaped = false;
  for (const char of body) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  if (escaped) value += '\\';
  cells.push(value.trim());
  return cells.length >= 2 ? cells : null;
}

function markdownTableColumnValues(text, label) {
  const all = lines(text);
  const values = [];
  for (let index = 0; index + 2 < all.length; index++) {
    const headers = markdownTableCells(all[index]);
    const separator = markdownTableCells(all[index + 1]);
    if (!headers || !separator || headers.length !== separator.length ||
      !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    const matchedColumns = headers
      .map((header, column) => ({ header: header.replace(/\s+\(\d+\)$/u, ''), column }))
      .filter((item) => label.test(item.header));
    if (!matchedColumns.length) continue;
    index += 2;
    while (index < all.length) {
      const row = markdownTableCells(all[index]);
      if (!row || row.length !== headers.length) {
        index--;
        break;
      }
      for (const { column } of matchedColumns) values.push(row[column]);
      index++;
    }
  }
  return values;
}

// Markdown structure and label lines are where the old "every title-case
// bigram is a person" rule did its damage: it turned "User Stories" into
// [PERSON_004] and the heading "Zweites Projekt" into [PERSON_005].
function isStructuralLine(line) {
  const s = String(line).trim();
  if (!s) return true;
  if (s.startsWith('#')) return true;
  if (s.startsWith('>')) return true;
  if (s.includes('|')) return true;
  if (/^[-*+]\s/.test(s)) return true;
  if (/^\d+[.)]\s/.test(s)) return true;
  if (/^(?:```|~~~)/.test(s)) return true;
  return false;
}

function isLabelLine(line) {
  return /^[^:\n]{1,40}:/.test(String(line).trim());
}

const HEADER_SECTION_RE =
  /^(?:Qualifikationen|Projekterfahrung|Berufserfahrung|Skillset|Zertifizierungen|Sprachkenntnisse|Branchenkenntnisse|Technologien|Methoden|Kenntnisse|Ausbildung|Werdegang)\s*:?$/iu;

function endsProfileHeader(line) {
  const s = String(line).trim();
  return (
    /^#{1,6}\s+/.test(s) ||
    /^[-*+]\s/.test(s) ||
    /^\d+[.)]\s/.test(s) ||
    HEADER_SECTION_RE.test(s)
  );
}

// Abstract German nouns are common in capability lists but extremely unlikely
// as every component of an unlabelled person line. This shape check scales to
// unseen vocabulary without turning the role-word set into a noun dictionary.
const ABSTRACT_NOUN_ENDING_RE =
  /(?:ung(?:en)?|tion(?:en)?|sion(?:en)?|tät(?:en)?|keit(?:en)?|heit(?:en)?|schaft(?:en)?|nis(?:se)?|ment(?:e)?|lauf|läufe|lyse|wesen)$/iu;

function hasAbstractNounShape(value) {
  return normalizeSpaces(value.replace(',', ' '))
    .split(/\s+/)
    .filter((token) => !/^(?:von|van|de|del|des|der|die|das|dem|den|ein(?:e|er|es|em|en)?|zu|zur|zum)$/iu.test(token))
    .every((token) => ABSTRACT_NOUN_ENDING_RE.test(token));
}

function stripHonorifics(value) {
  const toks = normalizeSpaces(value).split(/\s+/);
  while (toks.length && isStopToken(toks[0])) toks.shift();
  return toks.join(' ');
}

function pushPerson(out, value, confidence) {
  const cleaned = stripHonorifics(value);
  if (!cleaned) return;
  if (!looksName(cleaned) && !looksSurname(cleaned)) return;
  out.push({ value: cleaned, confidence });
}

function pushFullPerson(out, value, confidence) {
  const cleaned = stripHonorifics(value);
  if (!cleaned || !looksName(cleaned)) return;
  out.push({ value: cleaned, confidence });
}

function pushExplicitPerson(out, value, confidence) {
  const raw = String(value || '').trim();
  let visible = raw.replace(/<\/?[A-Za-z][^>\n]{0,1000}>/gu, '').trim();
  const link = visible.match(/^!?\[([^\n]{1,500}?)\]\([^\n)]{1,2000}\)$/u);
  if (link) visible = link[1];
  const referenceLink = visible.match(/^!?\[([^\n]{1,500}?)\]\[[^\n]{0,500}\]$/u);
  if (referenceLink) visible = referenceLink[1];
  visible = visible.replace(/^(?:\*\*|__|~~|`{1,3})(.*?)(?:\*\*|__|~~|`{1,3})$/u, '$1');
  // Explicit fields frequently append the professional role on the same line.
  // Keep that role verbatim and restrict the person span to the value before a
  // clear delimiter. A comma is a delimiter only when every following token is
  // known professional vocabulary, so "Mustermann, Dr. Max" remains a name.
  const roleSuffix = (value) => {
    const parts = normalizeSpaces(value).replace(/[.,;:]$/u, '').split(/\s+/u).filter(Boolean);
    return parts.length > 0 && parts.every((part) => ROLE_WORDS.has(part.toLocaleUpperCase('de-DE')));
  };
  let rawMatch = null;
  const visibleBoundary = visible.match(/^(.*?)[ \t]+(?:\||[–—])[ \t]+(.+)$/u);
  if (visibleBoundary && roleSuffix(visibleBoundary[2])) {
    visible = visibleBoundary[1].trim();
    const rawBoundary = raw.match(/^(.*?)[ \t]+(?:\||[–—])[ \t]+(.+)$/u);
    rawMatch = rawBoundary ? rawBoundary[1].trim() : visible;
  } else {
    const commaBoundary = visible.match(/^(.*),[ \t]*([^,]+)$/u);
    if (commaBoundary && roleSuffix(commaBoundary[2])) {
      visible = commaBoundary[1].trim();
      const rawBoundary = raw.match(/^(.*),[ \t]*([^,]+)$/u);
      rawMatch = rawBoundary ? rawBoundary[1].trim() : visible;
    }
  }
  const cleaned = stripHonorifics(visible);
  if (!cleaned || cleaned.length > 80) return;
  const token = new RegExp(`^(?:${NAME_TOKEN}|${CAPS_TOKEN})$`, 'u');
  const labelledToken = /^[\p{L}\p{M}][\p{L}\p{M}'’\-]{1,30}$/u;
  const cjkToken = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
  const compactCjkName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,16}$/u;
  const initialToken = /^[\p{L}\p{M}]\.$/u;
  const particle = /^(?:von|van|de|del|der|den|zu|zur|zum)$/iu;
  const validPart = (item) => token.test(item) || labelledToken.test(item) || cjkToken.test(item) || initialToken.test(item) || particle.test(item);
  let canonical = cleaned;
  const comma = cleaned.match(/^([^,]{1,48}),[ \t]*([^,]{1,48})$/u);
  if (comma) canonical = `${normalizeSpaces(comma[2])} ${normalizeSpaces(comma[1])}`;
  canonical = stripHonorifics(canonical);
  const tokens = canonical.split(/\s+/u);
  const suffixToken = /^(?:Jr|Sr|II|III|IV)\.?$/iu;
  const validIdentityPart = (item) => validPart(item) || suffixToken.test(item);
  if (tokens.length < 1 || tokens.length > 10 || !tokens.every(validIdentityPart)) return;
  const identityTokens = tokens.filter((item) => !particle.test(item) && !initialToken.test(item) && !suffixToken.test(item));
  const compactCjk = tokens.length === 1 && compactCjkName.test(tokens[0]);
  if ((!compactCjk && identityTokens.length < 1) || !identityTokens.some((item) => token.test(item) || labelledToken.test(item) || cjkToken.test(item))) return;
  const seed = { value: canonical, confidence };
  // Keep an exact source spelling when inline markup splits a visible name.
  // The clean value assigns the stable pseudonym; the raw spelling lets the
  // replacement consume the markup-obfuscated identifier in one span. Links
  // are handled separately so their non-PII target/reference can survive.
  if (rawMatch) {
    seed.matchValue = rawMatch;
  } else if ((raw !== canonical || cleaned !== canonical) && !/^!?\[[^\n]+\](?:\([^\n)]*\)|\[[^\n]*\])$/u.test(raw)) {
    seed.matchValue = raw;
  }
  out.push(seed);
}

// High-confidence anchors: the document itself says "this is a person".
function collectPersonAnchors(text, profile = 'general') {
  const src = String(text || '');
  const out = [];
  let m;

  // "Herr Müller", "Frau Dr. Sanchez-Weiß", "Prof. Özdemir"
  // Nobility and origin particles ("von der Heide", "de la Croix", "van den
  // Berg") belong to the anchored name; without them "Dr. med. Anna von der
  // Heide" left the surname in clear behind the pseudonym (review rc91).
  // Tokens are joined by spaces or tabs only: a name never continues on the
  // next line ("Anna Beispiel\nRolle" used to be captured as a three-token name
  // and then rejected as a whole).
  const particle = `(?:(?:von[ \\t]+und[ \\t]+zu|${NAME_PARTICLE})[ \\t]+){0,3}`;
  const honor = new RegExp(
    `${HONORIFIC}[ \\t]+((?:${NAME_TOKEN}|${CAPS_TOKEN})(?:[ \\t]+${particle}(?:${NAME_TOKEN}|${CAPS_TOKEN})){0,3})`,
    'gu'
  );
  while ((m = honor.exec(src))) pushPerson(out, m[1], 'honorific');

  // "Name: Erika Beispiel", also inside markdown tables.
  const linkLabel = new RegExp(`^[ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${PERSON_LABEL}[ \\t]*:[ \\t]*!?\\[([^\\n]{1,500}?)\\]\\([^\\n)]{1,2000}\\)`, 'gimu');
  while ((m = linkLabel.exec(src))) pushExplicitPerson(out, m[1], 'label');

  const referenceLinkLabel = new RegExp(`^[ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${PERSON_LABEL}[ \\t]*:[ \\t]*!?\\[([^\\n]{1,500}?)\\]\\[[^\\n]{0,500}\\]`, 'gimu');
  while ((m = referenceLinkLabel.exec(src))) pushExplicitPerson(out, m[1], 'label');

  const partialLinkLabel = new RegExp(
    `^[ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${PERSON_LABEL}[ \\t]*:[ \\t]*` +
      `!?\\[(${NAME_TOKEN}|${CAPS_TOKEN})\\](?:\\([^\\n)]{0,2000}\\)|\\[[^\\n]{0,500}\\])` +
      `[ \\t]+(${NAME_TOKEN}|${CAPS_TOKEN})[ \\t]*$`,
    'gimu'
  );
  while ((m = partialLinkLabel.exec(src))) {
    const raw = m[0].slice(m[0].indexOf(':') + 1).trim();
    const seed = { value: `${m[1]} ${m[2]}`, confidence: 'label', matchValue: raw };
    out.push(seed);
  }

  // Link labels and quoted titles remain in the Markdown sent to Claude even
  // when they are not rendered as normal body text.
  const profileDocument = profile === 'personnel_profile' || profile === 'applicant';
  if (profileDocument) {
    const markdownLink = /!?\[([^\]\n]{1,120})\](?:\(([^\n)]{0,2000})\)|\[([^\]\n]{0,500})\])/gu;
    while ((m = markdownLink.exec(src))) {
      // Only profile documents make a generic person-shaped label relevant.
      // Explicit person-labelled links above remain strong evidence in every
      // profile, while professional labels are filtered by the term catalog.
      pushFullPerson(out, m[1], 'markdown_link_label');
      const target = m[2] || '';
      const title = target.match(/(?:^|\s)(["'])([^\n]{1,120}?)\1\s*$/u);
      if (title) pushFullPerson(out, title[2], 'markdown_metadata');
    }
  }

  const label = new RegExp(`^[ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${PERSON_LABEL}[ \\t]*:[ \\t]*(.+)$`, 'gimu');
  while ((m = label.exec(src))) pushExplicitPerson(out, m[1], 'label');

  // Additional visible Markdown structures. These are deliberately limited
  // to person-shaped values and profile documents so ordinary prose lists do
  // not become a broad name dictionary.
  if (profileDocument) {
    const structuredValue = /^(?:[ \t]*(?:\d+[.)][ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|\[\^[^\]\n]{1,100}\]:[ \t]+))(.{1,120})$/gmu;
    while ((m = structuredValue.exec(src))) pushFullPerson(out, m[1], 'markdown_structure');
  }

  // Reference definitions are not rendered as body text, but they remain in
  // the Markdown handed to Claude. A quoted title can therefore carry PII.
  if (profileDocument) {
    const referenceTitle = /^[ \t]*\[[^\]\n]{1,100}\]:[ \t]*\S+(?:[ \t]+|[ \t]*\()(["'])([^\n]{1,120}?)\1\)?[ \t]*$/gmu;
    while ((m = referenceTitle.exec(src))) pushFullPerson(out, m[2], 'markdown_metadata');
  }

  const inline = new RegExp(`(?<![\\p{L}\\p{N}_])${PERSON_LABEL}(?![\\p{L}\\p{N}_])[ \\t]*:[ \\t]*(${NAME_TOKEN}[ \\t]+${NAME_TOKEN})`, 'giu');
  while ((m = inline.exec(src))) pushExplicitPerson(out, m[1], 'label');

  const table = new RegExp(`^\\|[ \\t]*${PERSON_LABEL}[ \\t]*:?[ \\t]*\\|[ \\t]*([^|\\n]+)\\|`, 'gimu');
  while ((m = table.exec(src))) {
    // A parser-generated CSV header starts exactly like a two-column
    // key/value table ("| Name | E-Mail |"), but its next line is the
    // Markdown separator.  Never treat a column title as a person's name.
    const lineEnd = src.indexOf('\n', m.index);
    const nextStart = lineEnd < 0 ? src.length : lineEnd + 1;
    const nextEnd = src.indexOf('\n', nextStart);
    const nextLine = src.slice(nextStart, nextEnd < 0 ? src.length : nextEnd);
    if (/^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|\s*$/u.test(nextLine)) continue;
    pushExplicitPerson(out, m[1], 'label');
  }

  const tableLabel = new RegExp(`^${PERSON_LABEL}:?$`, 'iu');
  for (const value of markdownTableColumnValues(src, tableLabel)) pushExplicitPerson(out, value, 'label');

  // Credential prose often names the holder on the same line as the issuer.
  // The issuer remains professional content, but the holder is still PII.
  const credentialHolder = new RegExp(
    `(?:Zertifikat|Bescheinigung|certificate|credential)\\s+(?:für|for)\\s+` +
      `((?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,2}?)` +
      `(?=[ \\t]*(?:[,;.(]|$)|\\s+(?:ausgestellt|zertifiziert|verliehen|erteilt|issued|awarded|certified)\\b)`,
    'gimu'
  );
  while ((m = credentialHolder.exec(src))) pushPerson(out, m[1], 'credential_holder');

  // CSV is deliberately rendered as inert Markdown. A spreadsheet-style
  // Contact-URI formulas can nevertheless carry a separately visible contact name;
  // the address and display name must both remain eligible for redaction.
  const contactFormulaHolder = new RegExp(
    `(?:mailto|tel|sms|callto|sip|xmpp):[^"')\\s]+[^\\n]{0,200}?["']` +
      `((?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,2})["']`,
    'giu'
  );
  while ((m = contactFormulaHolder.exec(src))) pushPerson(out, m[1], 'label');

  // A standalone all-caps line in a profile header is the person's name.
  const capsLine = new RegExp(`^${CAPS_TOKEN}(?:\\s+${CAPS_TOKEN}){1,3}$`, 'u');
  for (const line of lines(src)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    if (capsLine.test(s) && looksName(titleCase(s))) pushPerson(out, s, 'caps_line');
  }

  return out;
}

const CONTACT_CONTEXT_RE =
  /(?:\b\d{5}[ \t]+[A-ZÄÖÜ]|(?:straße|strasse|str\.|weg|allee|gasse|platz|ring|damm|ufer|chaussee|stieg)[ \t]+\d|(?:telefon|tel\.?|mobil|handy|fax|e-?mail)[ \t]*:)/iu;

// Medium confidence: a bare title-case name in the structural profile header,
// or in a compact contact/address block. Once a section starts, profile body
// prose no longer inherits implicit person context merely because it occurs in
// the first 40 lines.
//
// The anchor parameter defaults to false, not to the pre-R3 behaviour: with
// true, a caller that forgets it lets noun morphology suppress the document's
// only name clue, and a missed name is the heavier error. collectPersonSeeds
// always supplies the real state.
function collectHeaderNameCandidates(text, profile, maxLines = 40, hasStrongPersonAnchor = false) {
  const out = [];
  const bigram = new RegExp(
    `^(?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,3}$`,
    'u'
  );
  const commaName = new RegExp(
    `^(?:${NAME_TOKEN}|${CAPS_TOKEN}),\\s*(?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN}))?$`,
    'u'
  );
  const particleName = new RegExp(
    `^(?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:von|van|de|del|der|den|zu|zur|zum)){1,3}` +
      `\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})$`,
    'u'
  );
  const allLines = lines(text);
  let seen = 0;
  let inHeader = true;
  let inSecondaryIdentityArea = false;
  for (let index = 0; index < allLines.length; index++) {
    const line = allLines[index];
    const s = line.trim();
    if (!s) continue;
    if (++seen > maxLines) break;
    // Parser-generated story headings mark text which Word renders outside
    // the main body. They are not profile sections such as "Skillset" and
    // must not disable the narrowly scoped tab-field check below.
    if (/^#{1,6}\s+(?:Kopfzeile|Fußzeile|Kommentare|Fußnoten|Endnoten)$/iu.test(s)) {
      inSecondaryIdentityArea = true;
      continue;
    }
    if (/^#{1,6}\s+/u.test(s)) inSecondaryIdentityArea = false;
    if (endsProfileHeader(s)) inHeader = false;
    if (isStructuralLine(s) || isLabelLine(s)) continue;
    let hasContext = inHeader;
    if (!hasContext) {
      // In profile bodies a wide window can turn a section phrase immediately
      // before a labelled contact into a second person. Direct neighbours are
      // enough for an unlabelled address block; other profiles keep the wider
      // customer/contract window used before rc3.
      const radius = profile === 'applicant' || profile === 'personnel_profile' ? 1 : 3;
      const from = Math.max(0, index - radius);
      const nearby = allLines
        .slice(from, Math.min(allLines.length, index + radius + 1))
        .filter((_value, relative) => from + relative !== index)
        .join('\n');
      hasContext = CONTACT_CONTEXT_RE.test(nearby);
    }
    if (!hasContext) continue;
    if (
      inHeader && (profile === 'personnel_profile' || profile === 'applicant') &&
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,16}$/u.test(s)
    ) {
      pushPerson(out, s, 'cjk_header');
      continue;
    }
    if (commaName.test(s)) {
      if (!looksName(titleCase(s.replace(',', ' ')))) continue;
      if (hasStrongPersonAnchor && hasAbstractNounShape(s)) continue;
      // In "Surname, Given name" the first token would be the useful alias,
      // but registering an unlabelled leading token is unsafe: comma-shaped
      // domain lists are common, and a false alias would redact prose globally.
      out.push({ value: s, confidence: 'header_comma', noSurnameAlias: true });
      continue;
    }
    if (particleName.test(s)) {
      const withoutParticles = s.replace(/\b(?:von|van|de|del|der|den|zu|zur|zum)\b/giu, ' ');
      if (!looksName(titleCase(withoutParticles))) continue;
      if (hasStrongPersonAnchor && hasAbstractNounShape(s)) continue;
      out.push({ value: s, confidence: 'header_particle' });
      continue;
    }
    // DOCX headers and footers commonly render a label and the profile holder
    // in one paragraph separated by a Word tab (for example
    // "Vertraulich<TAB>Max Mustermann"). The whole line is not a name, but
    // the final tab field is a bounded, profile-header-only name candidate.
    // Do not apply this rule to ordinary prose or non-personnel documents.
    if ((inHeader || inSecondaryIdentityArea) && (profile === 'personnel_profile' || profile === 'applicant')) {
      const fields = s.split(/\t+/u).map((value) => value.trim()).filter(Boolean);
      const candidate = fields.length >= 2 ? fields[fields.length - 1] : '';
      if (candidate && bigram.test(candidate) && looksName(titleCase(candidate))) {
        pushPerson(out, candidate, 'header_tab');
        continue;
      }
    }
    if (!bigram.test(s)) continue;
    if (!looksName(titleCase(s))) continue;
    pushPerson(out, s, 'header_block');
  }
  return out;
}

// Groups consecutive capitalised tokens that are separated by spaces only, so
// that a rejected long window cannot hide a valid shorter one inside it. A
// single greedy regex matched "Kunde Max Mustermann", rejected it because of the
// role word, and never tested the "Max Mustermann" it contained.
function capitalisedRuns(text) {
  const tokenRe = new RegExp(`(?:${NAME_TOKEN}|${CAPS_TOKEN})`, 'gu');
  const runs = [];
  let current = [];
  let m;
  while ((m = tokenRe.exec(text))) {
    const token = { text: m[0], start: m.index, end: m.index + m[0].length };
    if (current.length) {
      const gap = text.slice(current[current.length - 1].end, token.start);
      if (!/^[ \t]+$/.test(gap)) {
        runs.push(current);
        current = [];
      }
    }
    current.push(token);
  }
  if (current.length) runs.push(current);
  return runs;
}

// Contextual: a name that is introduced by a person-ish word or immediately
// followed by contact details.
function collectContextualNameCandidates(text, profile) {
  const src = String(text || '');
  const out = [];
  const before =
    /(?<![\p{L}\p{N}_])(?:herrn?|frau|dr\.?|prof\.?|von|durch|gegenüber|kontakt|kunde|kundin|ansprechpartner(?:in)?|bewerber(?:in)?|mitarbeiter(?:in)?|vertreter(?:in)?|vertragspartei|vertreten\s+durch|represented\s+by|signed\s+by|z\.\s?hd\.?)\s*$/iu;
  const after = /^\s*(?:,|\(|-|–|—)?\s*(?:e-?mail|telefon|tel\.|mobil|kontakt|geb\.?|geboren)\b/i;
  // Contracts and customer records name the counterparty through connectors
  // rather than honorifics: "Vertrag zwischen Alpha GmbH und Max Mustermann".
  const contractual =
    /(?:zwischen|und|sowie|auftraggeber(?:in)?|auftragnehmer(?:in)?|lieferant(?:in)?|nachfolgend|handelnd\s+für|im\s+namen\s+von|between|and|client|supplier)\s*$/i;
  const useContractual = profile === 'contract' || profile === 'customer';

  for (const run of capitalisedRuns(src)) {
    // Two tokens is the normal case. Three are only considered for a run that
    // consists of exactly three tokens, so a middle name is still found without
    // swallowing the next ordinary word of a sentence.
    const sizes = run.length === 3 ? [3, 2] : [2];
    let i = 0;
    while (i < run.length - 1) {
      let taken = 0;
      for (const size of sizes) {
        if (i + size > run.length) continue;
        const window = run.slice(i, i + size);
        const cand = normalizeSpaces(window.map((t) => t.text).join(' '));
        if (!looksName(cand)) continue;
        if (hasAbstractNounShape(cand)) continue;

        const start = window[0].start;
        const end = window[window.length - 1].end;
        const { from, to } = lineBoundsAt(src, start);
        if (isStructuralLine(src.slice(from, to))) continue;

        const ctxBefore = src.slice(Math.max(0, start - 45), start);
        const ctxAfter = src.slice(end, end + 30);
        const matched =
          before.test(ctxBefore) ||
          after.test(ctxAfter) ||
          (useContractual && contractual.test(ctxBefore));
        if (!matched) continue;

        out.push({ value: cand, confidence: 'context' });
        taken = size;
        break;
      }
      i += taken || 1;
    }
  }
  return out;
}

// A person pseudonym already in the text is itself proof that a person was
// identified. Reading the anchor off the text keeps anonymize() idempotent:
// the anchor that suppresses a noun-shaped capability line is destroyed by its
// own replacement, so without this a second pass over released text would
// reclassify that line as a person.
const PERSON_PLACEHOLDER_RE = /\[PERSON_\d{3,}\]/u;

function collectPersonSeeds(
  text,
  profile = 'general',
  precomputedAnchors = null,
  strongPersonAnchorOverride = null
) {
  const anchors = precomputedAnchors === null ? collectPersonAnchors(text, profile) : precomputedAnchors;
  const anchorInText = anchors.length > 0 || PERSON_PLACEHOLDER_RE.test(String(text || ''));
  const hasStrongPersonAnchor =
    strongPersonAnchorOverride === null ? anchorInText : Boolean(strongPersonAnchorOverride);
  const seeds = [
    ...anchors,
    ...collectHeaderNameCandidates(text, profile, 40, hasStrongPersonAnchor),
    ...collectContextualNameCandidates(text, profile)
  ];
  if (profile === 'personnel_profile' || profile === 'applicant') {
    let seen = 0;
    for (const line of lines(text)) {
      if (String(line).trim() && ++seen > 12) break;
      const match = String(line).match(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+)(.+?)\s*$/u);
      if (match && looksName(match[1]) && !hasAbstractNounShape(match[1])) pushPerson(seeds, match[1], 'profile_structure');
      if (HEADER_SECTION_RE.test(String(line).replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+)/u, '').trim())) break;
    }
  }
  const byKey = new Map();
  for (const seed of seeds) {
    const k = key(seed.value);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, seed);
  }
  return [...byKey.values()];
}

// Backwards-compatible view used by the residual gate.
function collectNameSeeds(text, profile = 'general') {
  return collectPersonAnchors(text, profile).map((s) => s.value);
}

function collectOrganizations(text) {
  const out = collectContextOrganizations(text);
  COMPANY_RE.lastIndex = 0;
  let m;
  while ((m = COMPANY_RE.exec(text))) {
    const v = normalizeSpaces(m[1].replace(PROFESSIONAL_ORG_PREFIX_RE, ''));
    if (v) out.push(v);
  }
  return [...new Set(out.map((value) => value.replace(/^Bei\s+/u, '')))];
}

function makeRegistry() {
  const map = new Map();
  const counts = { PERSON: 0, ORG: 0, CUSTOMER: 0, PROJECT: 0 };
  const prefix = {
    PERSON: 'PERSON',
    ORG: 'ORGANISATION',
    CUSTOMER: 'KUNDE',
    PROJECT: 'PROJEKT'
  };
  return {
    assign(kind, value) {
      const k = `${kind}:${key(value)}`;
      if (map.has(k)) return map.get(k);
      const n = ++counts[kind];
      const label = `[${prefix[kind]}_${String(n).padStart(3, '0')}]`;
      map.set(k, label);
      return label;
    },
    lookup(kind, value) {
      return map.get(`${kind}:${key(value)}`) || null;
    },
    map,
    counts,
    locations: []
  };
}

module.exports = {
  PERSON_LABEL,
  HONORIFIC,
  GENDERED_SALUTATION,
  ACADEMIC_HONORIFIC,
  isStructuralLine,
  isLabelLine,
  markdownTableCells,
  markdownTableColumnValues,
  stripHonorifics,
  capitalisedRuns,
  collectPersonAnchors,
  collectHeaderNameCandidates,
  collectContextualNameCandidates,
  collectPersonSeeds,
  collectNameSeeds,
  collectOrganizations,
  makeRegistry
};
