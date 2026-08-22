'use strict';

const { lineBoundsAt } = require('./spans');
const {
  NAME_TOKEN,
  CAPS_TOKEN,
  ORG_SUFFIX,
  COMPANY_RE,
  normalizeSpaces,
  key,
  lines,
  titleCase,
  isStopToken,
  looksName,
  looksSurname
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
  `(?:^|[,;][ \\t]*(?:und|sowie|als[ \\t]+auch)[ \\t]+|\\b(?:und|sowie|als[ \\t]+auch)[ \\t]+)(?:die[ \\t]+)?` +
    `(${COMPANY_WORD}(?:[ \\t]+${COMPANY_WORD}){0,7}?[ \\t]+${ORG_SUFFIX})` +
    `(?=[ \\t]*(?:$|[.,;:]|\\(|[-–—]|\\b(?:und|sowie|als[ \\t]+auch)\\b|vertreten\\b|nachfolgend\\b))`,
  'giu'
);
const COMPANY_LABEL_RE =
  /^(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Arbeitgeber|Unternehmen|Firma)\s*:\s*(.+)$/iu;
const COMPANY_TABLE_RE =
  /^\|\s*(?:Vertragspartei|Vertragspartner(?:in)?|Auftraggeber(?:in)?|Auftragnehmer(?:in)?|Kunde|Arbeitgeber|Unternehmen|Firma)\s*:?\s*\|\s*([^|]+)\|/iu;
const PARTY_CLAUSE_RE =
  /\b(?:Vertragsparteien?\s+(?:sind|:)|(?:Vertrag|Vereinbarung)\s+zwischen)\s+(.+)$/iu;

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
    if (table) candidates.push(table[1]);
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
    if (!table && !labelled && !clause) candidates.push(trimmed);
    for (const candidate of candidates) {
      const match = candidate.match(SEGMENT_COMPANY_RE);
      if (match) out.push(normalizeSpaces(match[1]));
    }
  }
  return out;
}

const PERSON_LABEL =
  '(?:Name|Vorname|Nachname|Kunde|Kundin|Mitarbeiter(?:in)?|Bewerber(?:in)?' +
  '|Ansprechpartner(?:in)?|Vertreter(?:in)?|Kontaktperson|Kontakt|Sachbearbeiter(?:in)?' +
  '|Betreuer(?:in)?|Berater(?:in)?|Teilnehmer(?:in)?|Имя|ФИО|Όνομα|姓名|氏名|이름)';

const HONORIFIC = '(?:Herrn?|Frau|Dr\\.?|Prof\\.?|Dipl\\.?-?(?:Ing|Inf|Kfm)\\.?|Mag\\.?)';

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
    .filter((token) => !/^(?:von|van|de|del|der|den|zu|zur|zum)$/iu.test(token))
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

// High-confidence anchors: the document itself says "this is a person".
function collectPersonAnchors(text) {
  const src = String(text || '');
  const out = [];
  let m;

  // "Herr Müller", "Frau Dr. Sanchez-Weiß", "Prof. Özdemir"
  const honor = new RegExp(
    `${HONORIFIC}\\s+((?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){0,2})`,
    'gu'
  );
  while ((m = honor.exec(src))) pushPerson(out, m[1], 'honorific');

  // "Name: Erika Beispiel", also inside markdown tables.
  const label = new RegExp(`^\\s*${PERSON_LABEL}\\s*:\\s*(.+)$`, 'gimu');
  while ((m = label.exec(src))) pushPerson(out, m[1], 'label');

  const inline = new RegExp(`${PERSON_LABEL}\\s*:\\s*(${NAME_TOKEN}[ \\t]+${NAME_TOKEN})`, 'giu');
  while ((m = inline.exec(src))) pushPerson(out, m[1], 'label');

  const table = new RegExp(`^\\|\\s*${PERSON_LABEL}\\s*:?\\s*\\|\\s*([^|\\n]+)\\|`, 'gimu');
  while ((m = table.exec(src))) pushPerson(out, m[1], 'label');

  // Credential prose often names the holder on the same line as the issuer.
  // The issuer remains professional content, but the holder is still PII.
  const credentialHolder = new RegExp(
    `(?:Zertifikat|Bescheinigung|certificate|credential)\\s+(?:für|for)\\s+` +
      `((?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,2})` +
      `(?=\\s*(?:,|;|\\(|$))`,
    'giu'
  );
  while ((m = credentialHolder.exec(src))) pushPerson(out, m[1], 'credential_holder');

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
  for (let index = 0; index < allLines.length; index++) {
    const line = allLines[index];
    const s = line.trim();
    if (!s) continue;
    if (++seen > maxLines) break;
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
    /(?:herrn?|frau|dr\.?|prof\.?|von|durch|gegenüber|kontakt|kunde|kundin|ansprechpartner(?:in)?|bewerber(?:in)?|mitarbeiter(?:in)?|vertreter(?:in)?|vertragspartei|vertreten\s+durch|unterzeichnet\s+von|z\.\s?hd\.?)\s*$/i;
  const after = /^\s*(?:,|\(|-|–|—)?\s*(?:e-?mail|telefon|tel\.|mobil|kontakt|geb\.?|geboren)\b/i;
  // Contracts and customer records name the counterparty through connectors
  // rather than honorifics: "Vertrag zwischen Alpha GmbH und Max Mustermann".
  const contractual =
    /(?:zwischen|und|sowie|auftraggeber(?:in)?|auftragnehmer(?:in)?|lieferant(?:in)?|nachfolgend|handelnd\s+für|im\s+namen\s+von)\s*$/i;
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
  const anchors = precomputedAnchors === null ? collectPersonAnchors(text) : precomputedAnchors;
  const anchorInText = anchors.length > 0 || PERSON_PLACEHOLDER_RE.test(String(text || ''));
  const hasStrongPersonAnchor =
    strongPersonAnchorOverride === null ? anchorInText : Boolean(strongPersonAnchorOverride);
  const seeds = [
    ...anchors,
    ...collectHeaderNameCandidates(text, profile, 40, hasStrongPersonAnchor),
    ...collectContextualNameCandidates(text, profile)
  ];
  const byKey = new Map();
  for (const seed of seeds) {
    const k = key(seed.value);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, seed);
  }
  return [...byKey.values()];
}

// Backwards-compatible view used by the residual gate.
function collectNameSeeds(text) {
  return collectPersonAnchors(text).map((s) => s.value);
}

function collectOrganizations(text) {
  const out = collectContextOrganizations(text);
  COMPANY_RE.lastIndex = 0;
  let m;
  while ((m = COMPANY_RE.exec(text))) {
    const v = normalizeSpaces(m[1]);
    if (v) out.push(v);
  }
  return [...new Set(out)];
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
  isStructuralLine,
  isLabelLine,
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
