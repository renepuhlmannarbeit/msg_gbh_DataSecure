'use strict';

const { lineBoundsAt } = require('./spans');
const {
  NAME_TOKEN,
  CAPS_TOKEN,
  COMPANY_RE,
  normalizeSpaces,
  key,
  lines,
  isAllowedOrg,
  titleCase,
  isStopToken,
  looksName,
  looksSurname
} = require('./base');

const PERSON_LABEL =
  '(?:Name|Vorname|Nachname|Kunde|Kundin|Mitarbeiter(?:in)?|Bewerber(?:in)?' +
  '|Ansprechpartner(?:in)?|Vertreter(?:in)?|Kontaktperson|Kontakt|Sachbearbeiter(?:in)?' +
  '|Betreuer(?:in)?|Berater(?:in)?|Teilnehmer(?:in)?)';

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

  // A standalone all-caps line in a profile header is the person's name.
  const capsLine = new RegExp(`^${CAPS_TOKEN}(?:\\s+${CAPS_TOKEN}){1,3}$`, 'u');
  for (const line of lines(src)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    if (capsLine.test(s) && looksName(titleCase(s))) pushPerson(out, s, 'caps_line');
  }

  return out;
}

// Medium confidence: a bare title-case name, but only in the contact/header
// block of an applicant or personnel document and never on a structural or
// label line.
function collectHeaderNameCandidates(text, profile, maxLines = 40) {
  if (profile !== 'applicant' && profile !== 'personnel_profile') return [];
  const out = [];
  const bigram = new RegExp(
    `^(?:${NAME_TOKEN}|${CAPS_TOKEN})(?:\\s+(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,2}$`,
    'u'
  );
  let seen = 0;
  for (const line of lines(text)) {
    const s = line.trim();
    if (!s) continue;
    if (++seen > maxLines) break;
    if (isStructuralLine(s) || isLabelLine(s)) continue;
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

function collectPersonSeeds(text, profile = 'general') {
  const seeds = [
    ...collectPersonAnchors(text),
    ...collectHeaderNameCandidates(text, profile),
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
  const out = [];
  COMPANY_RE.lastIndex = 0;
  let m;
  while ((m = COMPANY_RE.exec(text))) {
    const v = normalizeSpaces(m[1]);
    if (v && !isAllowedOrg(v)) out.push(v);
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
