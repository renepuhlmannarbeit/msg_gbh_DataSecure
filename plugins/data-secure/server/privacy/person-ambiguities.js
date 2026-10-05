'use strict';

const {
  NAME_TOKEN,
  CAPS_TOKEN,
  NAME_PARTICLE,
  normalizeText,
  normalizeSpaces,
  looksName
} = require('./base');
const { collectPersonAnchors, hasAbstractNounShape } = require('./entities');
const { preservedTextRanges } = require('./credentials');

// F7 deliberately does not reinterpret every Title-Case phrase as a person.
// It only captures a name-shaped subject in a bounded, line-local attribution
// sentence. Semantic cases that cannot be distinguished safely are handed to
// the existing local review instead of being released or auto-redacted.
const PERSON_ACTION = [
  'antwortet(?:e|en)?', 'berichtet(?:e|en)?', 'bestätigt(?:e|en)?',
  'dokumentiert(?:e|en)?', 'erstellt(?:e|en)?', 'führt(?:e|en)?',
  'genehmigt(?:e|en)?',
  'koordiniert(?:e|en)?', 'leitet(?:e|en)?', 'meldet(?:e|en)?',
  'präsentiert(?:e|en)?', 'prüft(?:e|en)?', 'schreibt|schrieb(?:en)?',
  'sendet|sandte|stellte(?:n)?', 'telefoniert(?:e|en)?',
  'übernimmt|übernahm(?:en)?', 'unterzeichnet(?:e|en)?',
  'verantwortet(?:e|en)?', 'verfasst(?:e|en)?',
  'answers?', 'answered', 'confirms?', 'confirmed', 'coordinates?', 'coordinated',
  'documents?', 'documented', 'leads?', 'led', 'presents?', 'presented',
  'reports?', 'reported', 'sends?', 'sent', 'signs?', 'signed', 'writes?|wrote'
].join('|');
const NAME_SHAPE = `(?:${NAME_TOKEN}|${CAPS_TOKEN})(?:[ \\t]+(?:(?:${NAME_PARTICLE})[ \\t]+){0,3}(?:${NAME_TOKEN}|${CAPS_TOKEN})){1,3}`;
const SUBJECT_RE = new RegExp(
  `(?:^|[.!?][ \\t]+)(?:\\*\\*|__)?(?:\\[)?(${NAME_SHAPE})(?:\\])?(?:\\([^\\n)]{1,500}\\))?(?:\\*\\*|__)?[ \\t]+(?:${PERSON_ACTION})\\b`,
  'gu'
);
const AUXILIARY_SUBJECT_RE = new RegExp(
  `\\b(?:hat|haben|hatte|hatten|has|have|had)[ \\t]+(?:\\*\\*|__)?(?:\\[)?(${NAME_SHAPE})(?:\\])?` +
    `(?:\\([^\\n)]{1,500}\\))?(?:\\*\\*|__)?`,
  'gu'
);
const AUXILIARY_ACTION_RE =
  /^(?:[ \t]+(?:[^.!?\n]{0,160}?[ \t]+)?)(?:geschickt|gesendet|genehmigt|bestätigt|dokumentiert|erstellt|geprüft|übernommen|unterzeichnet|gesprochen|telefoniert|berichtet|sent|approved|confirmed|documented|created|reviewed|signed|spoken|talked)\b/iu;
// Standalone has a local, source-bound decision path. Broader conversational
// attributions are candidates for that path, never automatic person decisions.
const CONVERSATION_ACTION = 'sagt(?:e|en)?|rief|rufen|trifft|traf|besucht(?:e|en)?|kontaktiert(?:e|en)?|said|called|met|visited|contacted';
const STANDALONE_ACTION = `${PERSON_ACTION}|${CONVERSATION_ACTION}`;
const CONVERSATION_SUBJECT_RE = new RegExp(`(?<![\\p{L}\\p{M}])(${NAME_SHAPE})[ \\t]+(?:${STANDALONE_ACTION})\\b`, 'gu');
const CONVERSATION_OBJECT_RE = new RegExp(`\\b(?:${STANDALONE_ACTION})[ \\t]+(?:\\*\\*|__)?(?:\\[)?(${NAME_SHAPE})(?:\\])?(?:\\*\\*|__)?`, 'gu');
const COMMUNICATION_OBJECT_RE = new RegExp(`\\b(?:[Mm]it|[Ww]ith)[ \\t]+(?:(?:der|die|dem|den|the)[ \\t]+)?(?:\\*\\*|__)?(?:\\[)?(${NAME_SHAPE})(?:\\])?(?:\\*\\*|__)?`, 'gu');
const COMMUNICATION_RE = /\b(?:gesprochen|sprechen|sprach|telefoniert|diskutiert|besprochen|talked|spoken|discussed)\b/iu;
const ABSTRACT_TOKEN_RE =
  /(?:ung(?:en)?|tion(?:en)?|sion(?:en)?|tät(?:en)?|keit(?:en)?|heit(?:en)?|schaft(?:en)?|nis(?:se)?|ment(?:e)?|wesen)$/iu;
const BUSINESS_NOUN_RE =
  /^(?:administration|architecture|cloud|consulting|customer|delivery|development|engineering|finance|management|marketing|operations|planning|platform|product|program|project|quality|sales|security|service|services|strategy|success|support|team|transformation)$/iu;

function proseBody(line, options = {}) {
  const source = String(line || '');
  const leading = source.match(/^[ \\t]*(?:(?:[-*+]|\\d+[.)]|>)[ \\t]+)?/u)?.[0]?.length || 0;
  const body = source.slice(leading);
  if (!body || /^(?:#{1,6}[ \\t]|```|~~~)/u.test(body) || body.includes('|') ||
      (options.productChannel !== 'standalone' && /^[^:\n]{1,40}:/u.test(body))) return null;
  return { body, leading };
}

function plausiblePerson(value) {
  const clean = normalizeSpaces(value);
  if (!looksName(clean) || hasAbstractNounShape(clean)) return false;
  const tokens = clean.split(/\s+/u).filter((token) => !/^(?:von|van|de|del|der|den|zu|zur|zum)$/iu.test(token));
  if (/^(?:Die|Der|Das|Ein|Eine|Ich|Wir|Du|Sie|Er|Es|Am|Im|Gestern|Heute|Morgen|The|This|Yesterday)$/u.test(tokens[0])) return false;
  return !tokens.some((token) => ABSTRACT_TOKEN_RE.test(token) || BUSINESS_NOUN_RE.test(token));
}

function standaloneNameSpan(value) {
  const tokens = [...value.matchAll(/[^ \t]+/gu)];
  let first = 0, last = tokens.length;
  const role = /^(?:Kollegin|Kollege|Kollegen|Anwältin|Anwalt|Mitarbeiterin|Mitarbeiter|Ärztin|Arzt|Frau|Herr|Herrn|Professor|Professorin)$/u;
  while (first < last && (/^(?:Die|Der|Das|Eine|Ein|The)$/u.test(tokens[first][0]) || role.test(tokens[first][0]))) first++;
  // A trailing German object is not a surname particle. Preserve compounds
  // such as Anna van den Berg / Anna von der Linden, but not "den Termin".
  for (let index = first + 2; index < last; index++) {
    if (/^(?:den|der|die|das)$/u.test(tokens[index][0]) &&
        !/^(?:van|von|de|zu|zur|zum)$/iu.test(tokens[index - 1][0])) { last = index; break; }
  }
  if (last - first < 2) return null;
  // Greedy attribution runs may include a department suffix ("von der
  // Planung"). If that whole run is not name-shaped, try bounded prefixes,
  // excluding trailing particles. A plausible prefix still needs human
  // review; this never authorizes keeping or automatically redacting it.
  if (!plausiblePerson(value.slice(tokens[first].index,
    tokens[last - 1].index + tokens[last - 1][0].length))) {
    while (last - first > 2) {
      last--;
      if (/^(?:von|van|de|del|der|den|zu|zur|zum)$/iu.test(tokens[last - 1][0])) continue;
      const prefix = value.slice(tokens[first].index, tokens[last - 1].index + tokens[last - 1][0].length);
      if (plausiblePerson(prefix)) break;
    }
  }
  const start = tokens[first].index;
  const end = tokens[last - 1].index + tokens[last - 1][0].length;
  return { value: value.slice(start, end), offset: start };
}

function mappedPreservedRange(preserved, start, end) {
  const range = preserved.find((item) => start >= item.original_start && end <= item.original_end);
  if (!range) return null;
  return {
    start: range.anonymized_start + start - range.original_start,
    end: range.anonymized_start + end - range.original_start
  };
}

function personProseCandidateSpans(text, options = {}) {
  const original = normalizeText(text);
  const hasStrongPersonAnchor = collectPersonAnchors(original, 'general').length > 0;
  const candidates = [];
  let lineStart = 0;
  for (const line of original.split('\n')) {
    const parsed = proseBody(line, options);
    if (parsed) {
      const patterns = [SUBJECT_RE, ...(hasStrongPersonAnchor || options.productChannel === 'standalone' ? [AUXILIARY_SUBJECT_RE] : []),
        ...(options.productChannel === 'standalone' ? [CONVERSATION_SUBJECT_RE, CONVERSATION_OBJECT_RE, COMMUNICATION_OBJECT_RE] : [])];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(parsed.body))) {
          if (pattern === AUXILIARY_SUBJECT_RE && !AUXILIARY_ACTION_RE.test(parsed.body.slice(pattern.lastIndex))) continue;
          if (pattern === COMMUNICATION_OBJECT_RE && !COMMUNICATION_RE.test(parsed.body.slice(Math.max(0, match.index - 160), pattern.lastIndex + 160))) continue;
          const bounded = options.productChannel === 'standalone' ? standaloneNameSpan(match[1]) : { value: match[1], offset: 0 };
          if (!bounded) continue;
          const value = normalizeSpaces(bounded.value);
          if (!plausiblePerson(value)) continue;
          const relative = match.index + match[0].indexOf(match[1]) + bounded.offset;
          const start = lineStart + parsed.leading + relative;
          candidates.push({ start, end: start + bounded.value.length, value: bounded.value });
        }
      }
    }
    lineStart += line.length + 1;
  }
  return candidates.filter((candidate, index) => !candidates.some((other, otherIndex) =>
    otherIndex < index && other.start === candidate.start && other.end === candidate.end));
}

function personProseAmbiguities(originalText, anonymizedText, options = {}) {
  const original = normalizeText(originalText);
  const anonymized = String(anonymizedText || '');
  const preserved = preservedTextRanges(original, anonymized);
  const candidates = [];
  const used = new Set();
  for (const candidate of personProseCandidateSpans(original, options)) {
    const originalStart = candidate.start;
    const originalEnd = candidate.end;
    let mapped = mappedPreservedRange(preserved, originalStart, originalEnd);
    if (!mapped || anonymized.slice(mapped.start, mapped.end) !== candidate.value) {
      // Many earlier placeholders plus Markdown canonicalisation can make a
      // large surviving fragment impossible to align byte-for-byte. Never let
      // that presentation difference suppress a real, still-visible review
      // candidate. Select the nearest exact surviving occurrence; the result
      // remains fail-closed and the UI still receives precise output offsets.
      const occurrences = literalOccurrences(anonymized, candidate.value)
        .filter((item) => !used.has(`${item.start}:${item.end}`));
      if (options.productChannel === 'standalone') {
        const sourceCopies = literalOccurrences(original, candidate.value);
        const outputCopies = literalOccurrences(anonymized, candidate.value);
        const ordinal = sourceCopies.findIndex(item => item.start === originalStart);
        if (outputCopies.length && (sourceCopies.length !== outputCopies.length || ordinal < 0)) {
          const error = new Error('Die Fundstelle kann nicht eindeutig ihrem Quelltext zugeordnet werden. Eine erneute lokale Prüfung ist erforderlich.');
          error.code = 'AMBIGUITY_REVIEW_REQUIRED';
          throw error;
        }
        mapped = outputCopies[ordinal] || null;
      } else {
      const projected = original.length ? Math.round(originalStart / original.length * anonymized.length) : 0;
      mapped = occurrences.sort((left, right) =>
        Math.abs(left.start - projected) - Math.abs(right.start - projected) || left.start - right.start)[0] || null;
      }
    }
    if (!mapped || anonymized.slice(mapped.start, mapped.end) !== candidate.value) continue;
    const key = `${mapped.start}:${mapped.end}`;
    if (used.has(key)) continue;
    used.add(key);
    candidates.push({
      ambiguity_id: `person:v1:${String(candidates.length + 1).padStart(6, '0')}`,
      type: 'person_prose_ambiguous',
      replacement_kind: 'PERSON',
      original_start: originalStart,
      original_end: originalEnd,
      anonymized_start: mapped.start,
      anonymized_end: mapped.end
    });
  }
  return candidates;
}

function literalOccurrences(text, value) {
  const out = [];
  let offset = 0;
  while ((offset = String(text).indexOf(value, offset)) >= 0) {
    out.push({ start: offset, end: offset + value.length });
    offset += Math.max(1, value.length);
  }
  return out;
}

module.exports = { personProseCandidateSpans, personProseAmbiguities };
