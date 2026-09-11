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
  /^(?:[ \t]+[^.!?\n]{0,160}?[ \t]+)(?:geschickt|gesendet|genehmigt|bestätigt|dokumentiert|erstellt|geprüft|übernommen|unterzeichnet|sent|approved|confirmed|documented|created|reviewed|signed)\b/iu;
const ABSTRACT_TOKEN_RE =
  /(?:ung(?:en)?|tion(?:en)?|sion(?:en)?|tät(?:en)?|keit(?:en)?|heit(?:en)?|schaft(?:en)?|nis(?:se)?|ment(?:e)?|wesen)$/iu;
const BUSINESS_NOUN_RE =
  /^(?:administration|architecture|cloud|consulting|customer|delivery|development|engineering|finance|management|marketing|operations|planning|platform|product|program|project|quality|sales|security|service|services|strategy|success|support|team|transformation)$/iu;

function proseBody(line) {
  const source = String(line || '');
  const leading = source.match(/^[ \\t]*(?:(?:[-*+]|\\d+[.)]|>)[ \\t]+)?/u)?.[0]?.length || 0;
  const body = source.slice(leading);
  if (!body || /^(?:#{1,6}[ \\t]|```|~~~)/u.test(body) || body.includes('|') || /^[^:\n]{1,40}:/u.test(body)) return null;
  return { body, leading };
}

function plausiblePerson(value) {
  const clean = normalizeSpaces(value);
  if (!looksName(clean) || hasAbstractNounShape(clean)) return false;
  const tokens = clean.split(/\s+/u).filter((token) => !/^(?:von|van|de|del|der|den|zu|zur|zum)$/iu.test(token));
  return !tokens.some((token) => ABSTRACT_TOKEN_RE.test(token) || BUSINESS_NOUN_RE.test(token));
}

function mappedPreservedRange(preserved, start, end) {
  const range = preserved.find((item) => start >= item.original_start && end <= item.original_end);
  if (!range) return null;
  return {
    start: range.anonymized_start + start - range.original_start,
    end: range.anonymized_start + end - range.original_start
  };
}

function personProseCandidateSpans(text) {
  const original = normalizeText(text);
  const hasStrongPersonAnchor = collectPersonAnchors(original, 'general').length > 0;
  const candidates = [];
  let lineStart = 0;
  for (const line of original.split('\n')) {
    const parsed = proseBody(line);
    if (parsed) {
      const patterns = [SUBJECT_RE, ...(hasStrongPersonAnchor ? [AUXILIARY_SUBJECT_RE] : [])];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(parsed.body))) {
          if (pattern === AUXILIARY_SUBJECT_RE && !AUXILIARY_ACTION_RE.test(parsed.body.slice(pattern.lastIndex))) continue;
          const value = normalizeSpaces(match[1]);
          if (!plausiblePerson(value)) continue;
          const relative = match.index + match[0].indexOf(match[1]);
          const start = lineStart + parsed.leading + relative;
          candidates.push({ start, end: start + match[1].length, value: match[1] });
        }
      }
    }
    lineStart += line.length + 1;
  }
  return candidates.filter((candidate, index) => !candidates.some((other, otherIndex) =>
    otherIndex < index && other.start === candidate.start && other.end === candidate.end));
}

function personProseAmbiguities(originalText, anonymizedText) {
  const original = normalizeText(originalText);
  const anonymized = String(anonymizedText || '');
  const preserved = preservedTextRanges(original, anonymized);
  const candidates = [];
  const used = new Set();
  for (const candidate of personProseCandidateSpans(original)) {
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
      const projected = original.length ? Math.round(originalStart / original.length * anonymized.length) : 0;
      mapped = occurrences.sort((left, right) =>
        Math.abs(left.start - projected) - Math.abs(right.start - projected) || left.start - right.start)[0] || null;
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
