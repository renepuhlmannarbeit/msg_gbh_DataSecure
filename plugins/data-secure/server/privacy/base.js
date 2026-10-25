'use strict';

const crypto = require('crypto');
const { PERSON_LABEL, LEGACY_PERSON_FIELD_POLICY, CONTENT_PERSON_FIELD_POLICY, personFieldPattern, isPersonFieldLabel } = require('../core/person-field-policy');

// JavaScript's \b is defined over [A-Za-z0-9_] only. In German documents that
// silently breaks every pattern anchored around umlauts: /\bÖsterreichische/
// never matches at the start of a line, and /Weiß\b/ never matches before a
// space. All patterns below therefore use explicit Unicode-aware boundaries.
const NB = '(?<![\\p{L}\\p{N}_])';
const NA = '(?![\\p{L}\\p{N}_])';

// Character classes shared by the person/organisation patterns.
const UPPER = '\\p{Lu}\\p{Lt}';
const NAME_BODY = "\\p{L}\\p{M}'’\\-";
const CJK_NAME_TOKEN = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]{2,16}';
const NAME_TOKEN = `(?:[${UPPER}][${NAME_BODY}]{1,30}|${CJK_NAME_TOKEN})`;
const CAPS_TOKEN = `(?:[${UPPER}][${UPPER}\\p{M}'’\\-]{1,30}|${CJK_NAME_TOKEN})`;

const ORG_SUFFIX =
  '(?:gGmbH|gUG(?:\\s*\\(haftungsbeschränkt\\))?|GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG|SE(?:\\s*&\\s*Co\\.?\\s*KGaA)?|KGaA|KG|OHG|GbR|e\\.?V\\.?|B\\.?V\\.?' +
  '|eG|e\\.?K\\.?|PartG(?:\\s+mbB)?|VVaG|AöR|KdöR|Anstalt\\s+des\\s+öffentlichen\\s+Rechts|Stiftung' +
  '|Ltd\\.?|Limited|Inc\\.?|LLC|SAS|SARL|S\\.?A\\.?|S\\.?L\\.?|N\\.?V\\.?|S\\.?r\\.?l\\.?|PLC' +
  '|UG(?:\\s*\\(haftungsbeschränkt\\))?)';

const COMPANY_RE = new RegExp(
  `${NB}([${UPPER}][\\p{L}\\p{M}\\p{N}&.'’+\\-/]*` +
    `(?:[ \\t]+(?:[${UPPER}\\p{N}][\\p{L}\\p{M}\\p{N}&.'’+\\-/]*|[&+])){0,7}` +
    `[ \\t]+${ORG_SUFFIX})${NA}`,
  'gu'
);

// Strips the legal form so that "Nordlicht Digital GmbH" and a later bare
// "Nordlicht Digital" resolve to the same pseudonym.
const ORG_SUFFIX_TAIL_RE = new RegExp(`[ \\t]+${ORG_SUFFIX}\\s*$`, 'iu');

const URL_RE = new RegExp(
  `${NB}(?:https?://|www\\.)[^\\s<>()]+` +
    `|${NB}[a-z0-9][a-z0-9.\\-]{2,}\\.(?:de|com|net|org|eu|io|ai|ch|at|nl|fr|uk)${NA}`,
  'giu'
);

// Office-to-Markdown conversion may escape punctuation that is significant in
// Markdown (for example lina\\.beispiel@example\\.de). Match those optional
// source backslashes as part of the identifier so neither a local-part fragment
// nor an escaped domain survives redaction. This stays a source-coordinate
// detector: the released text is never globally unescaped or re-rendered.
const EMAIL_RE = new RegExp(
  `${NB}(?:(?:[\\p{L}\\p{N}]|\\\\?[.!#$%&'*+/=?^_\x60{|}~\\-])+|"(?:[^"\\\\\r\n]|\\\\+[^\r\n])*")@` +
    `(?:[\\p{L}\\p{N}](?:(?:[\\p{L}\\p{N}]|\\\\?-){0,61}[\\p{L}\\p{N}])?\\\\?\\.)+` +
    `(?:[\\p{L}]{2,63}|xn\\\\?-\\\\?-[a-z0-9-]{2,59})${NA}`,
  'giu'
);

// Only discover the scheme here. structured.js scans its payload by scheme:
// address URIs include complete Unicode/percent-encoded addresses, whereas a
// telephone number cannot absorb adjacent prose just because it follows a dot.
const CONTACT_URI_RE = new RegExp(
  `${NB}(mailto|tel|sms|callto|sip|xmpp):`,
  'giu'
);

// Every detector below is deliberately line-local: `\s` also matches a newline,
// and a pattern that may cross one stops being a detector and becomes a way to
// swallow the following paragraph. A postal address written with `\s+` matched
// "20457 Hamburg\n\nAngebot AN" as one address and left "-2026-0815" glued to
// the placeholder.
// Unicode no-break spaces are ordinary visual separators in documents copied
// from Office/PDF exports. Keep them in the detector grammar instead of
// changing document-wide typography merely to make identifiers detectable.
const SEP_CHARS = ' \\t\\u00A0\\u202F\\u2007'; // for use inside a character class
const SEP = `[${SEP_CHARS}]`; // for standalone use
const DASH_CHARS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2212';
const IBAN_SEPARATOR_CHARS = `${SEP_CHARS}.${DASH_CHARS}/`;
// A visual IBAN group separator is either a whitespace run or one punctuation
// separator with optional surrounding whitespace. Keeping punctuation to one
// character prevents an IBAN detector from accepting arbitrary delimiter runs.
const IBAN_SEPARATOR_TOKEN = `(?:[${SEP_CHARS}]+|[${SEP_CHARS}]*[.${DASH_CHARS}/][${SEP_CHARS}]*)`;
const PHONE_SEPARATOR = `(?:[${SEP_CHARS}]+|[${SEP_CHARS}]*[./${DASH_CHARS}][${SEP_CHARS}]*)`;

// Shape only. Whether a shape is treated as a phone number is decided in
// structured.js so that the residual gate and the redactor cannot disagree.
const PHONE_RE = new RegExp(
  `${NB}(?:(?:\\+|00)\\d{1,3}(?:${PHONE_SEPARATOR})?(?:\\(0\\)(?:${PHONE_SEPARATOR})?)?)?` +
    `(?:\\(?\\d{2,5}\\)?)` +
    `(?:(?:${PHONE_SEPARATOR})?\\d{3,12}(?:${PHONE_SEPARATOR}\\d{1,6}){0,2}` +
    // The subscriber block is also commonly grouped into short 2-digit pairs
    // (e.g. "030 12 34 56 78"). That shape needs its own branch requiring a
    // real separator before the first group: making the plain 3-12 digit
    // block's minimum 2 instead let it match any bare digit run (an area code
    // plus a short unseparated remainder, e.g. "1000" in "kontakt.1000@..."),
    // turning every 4+ digit number after a "kontakt"-labelled line into a
    // false-positive phone match.
    `|${PHONE_SEPARATOR}\\d{2,4}(?:${PHONE_SEPARATOR}\\d{2,4}){2,4})${NA}`,
  'gu'
);
// The keyword may carry a "-nummer"/"number" suffix ("Telefonnummer",
// "Telefoonnummer") and a bracketed qualifier ("Telefon (privat)"); review rc91
// (F3) showed both shapes disabled the gate entirely.
const LABEL_QUALIFIER = '(?:\\s*\\([^)\\n]{1,40}\\))?';
const PHONE_LABEL_WINDOW = 256;
const PHONE_CALL_SPACE = `[${SEP_CHARS}]+`;
const PHONE_CALL_NAME = "[\\p{L}\\p{M}][\\p{L}\\p{M}'’.-]{0,30}";
const PHONE_CALL_COURTESY = '(?:bitte|gern(?:e)?|jederzeit)';
const PHONE_CALL_RECIPIENT =
  `(?:(?:mich|uns|ihn|sie)(?:${PHONE_CALL_SPACE}${PHONE_CALL_COURTESY})?|${PHONE_CALL_COURTESY})`;
const PHONE_CALL_HONORIFIC = '(?:frau|herrn?|mx\\.?)';
const PHONE_CALL_TITLE =
  '(?:prof\\.?|dr\\.?[- ]ing\\.?|dipl\\.?[- ]ing\\.?|dr\\.?|med\\.?|rer\\.?|nat\\.?|jur\\.?|phil\\.?|habil\\.?)';
const PHONE_CALL_PARTICLE = '(?:von|van|de|der|den|und|zu|zur|zum|la|le)';
const PHONE_CALL_SIMPLE_NAME = `${PHONE_CALL_NAME}(?:${PHONE_CALL_SPACE}${PHONE_CALL_NAME}){0,2}`;
const PHONE_CALL_PARTICLE_NAME =
  `(?:${PHONE_CALL_NAME}${PHONE_CALL_SPACE}){0,2}` +
  `(?:${PHONE_CALL_PARTICLE}${PHONE_CALL_SPACE}){1,3}${PHONE_CALL_NAME}`;
const PHONE_CALL_PERSON_NAME = `(?:${PHONE_CALL_PARTICLE_NAME}|${PHONE_CALL_SIMPLE_NAME})`;
const PHONE_CALL_CALLEE =
  `(?:${PHONE_CALL_HONORIFIC}${PHONE_CALL_SPACE}(?:${PHONE_CALL_TITLE}${PHONE_CALL_SPACE}){0,3}` +
  `${PHONE_CALL_PERSON_NAME}|(?:${PHONE_CALL_TITLE}${PHONE_CALL_SPACE}){1,3}${PHONE_CALL_PERSON_NAME})` +
  `(?:${PHONE_CALL_SPACE}${PHONE_CALL_COURTESY})?`;
const PHONE_CALL_REQUEST =
  `rufen${PHONE_CALL_SPACE}sie${PHONE_CALL_SPACE}(?:${PHONE_CALL_RECIPIENT}|${PHONE_CALL_CALLEE})` +
  `${PHONE_CALL_SPACE}(?:an${PHONE_CALL_SPACE})?unter`;
const PHONE_LABEL_PATTERN =
  `(?:tel|telefon|téléphone|telephone|phone|teléfono|telefono|telefoon|mobil|mobile|handy|fax|kontakt|durchwahl|rufnummer` +
  `|erreichbar(?:\\s+unter)?|zu\\s+erreichen(?:\\s+unter)?|unter\\s+der\\s+(?:ruf)?nummer|anzurufen\\s+unter` +
  `|${PHONE_CALL_REQUEST}` +
  `|melden${PHONE_CALL_SPACE}sie${PHONE_CALL_SPACE}sich(?:${PHONE_CALL_SPACE}${PHONE_CALL_COURTESY})?${PHONE_CALL_SPACE}unter` +
  `|rückfragen(?:${PHONE_CALL_SPACE}${PHONE_CALL_COURTESY})?${PHONE_CALL_SPACE}unter` +
  `|telefonisch${PHONE_CALL_SPACE}unter)` +
  `(?:[\\s-]?(?:nummer|nr\\.?|number|numéro|número|numero))?${LABEL_QUALIFIER}`;
const PHONE_LABEL_RE = new RegExp(
  `${PHONE_LABEL_PATTERN}\\s*\\.?\\s*:?\\s*$`,
  'iu'
);
// France commonly groups local subscriber numbers into four two-digit pairs
// after a one-digit area code. Keep that shape separate from PHONE_RE so a
// broadened generic matcher cannot mistake short technical number runs for PII.
const FRENCH_PHONE_RE = new RegExp(
  `${NB}(?:(?:\\+33|0)[${SEP_CHARS}./${DASH_CHARS}]?[1-9](?:[${SEP_CHARS}./${DASH_CHARS}]?\\d{2}){4})${NA}`,
  'gu'
);

const IBAN_RE = new RegExp(`${NB}[A-Z]{2}\\d{2}(?:${IBAN_SEPARATOR_TOKEN}?[A-Z0-9]){11,30}${NA}`, 'giu');

// A bare BIC is indistinguishable from an ordinary German word in upper case:
// /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/ matches SOFTWARE, PROJEKTE,
// UNTERNEHMEN and VERTRAULICH. BIC detection is therefore label-gated, with a
// bare shape accepted only on a line that also carries an IBAN.
const BIC_SHAPE = '[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?';
const BIC_RE = new RegExp(`${NB}${BIC_SHAPE}${NA}`, 'gu');
const BIC_LABEL_RE = /(?:bic|swift(?:[\s\-]?code)?|bank\s?identifier\s?code)\s*\.?\s*:?\s*$/i;

const IP_RE = new RegExp(
  // A four-component prefix/suffix of a longer dotted version is not an IP.
  // Keep a sentence-final period outside the address (it has no next digit).
  `(?<![\\p{L}\\p{N}_]|\\d\\.)(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}` +
    `(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?![\\p{L}\\p{N}_]|\\.\\d)`,
  'gu'
);

const IPV6_PART = '[A-F0-9]{1,4}';
const IPV4_TAIL = '(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
// IPv4-embedded IPv6 still identifies the complete host. Do not redact only
// its IPv4 suffix; the longest valid IPv6 candidate owns the whole source span.
const IPV6_WITH_IPV4 = `(?:(?:${IPV6_PART}:){6}|(?:${IPV6_PART}(?::${IPV6_PART}){0,4})?::(?:${IPV6_PART}:){0,4})${IPV4_TAIL}`;
const IPV6_RE = new RegExp(
  `${NB}(?:${IPV6_WITH_IPV4}|(?:${IPV6_PART}:){7}${IPV6_PART}|(?:${IPV6_PART}:){1,7}:|` +
    `(?:${IPV6_PART}:){1,6}:${IPV6_PART}|(?:${IPV6_PART}:){1,5}(?::${IPV6_PART}){1,2}|` +
    `(?:${IPV6_PART}:){1,4}(?::${IPV6_PART}){1,3}|(?:${IPV6_PART}:){1,3}(?::${IPV6_PART}){1,4}|` +
    `(?:${IPV6_PART}:){1,2}(?::${IPV6_PART}){1,5}|${IPV6_PART}:(?:(?::${IPV6_PART}){1,6})|` +
    `:(?:(?::${IPV6_PART}){1,7}|:))${NA}`,
  'giu'
);

const POSTAL_ADDRESS_RE = new RegExp(
  `${NB}\\d{5}${SEP}+[${UPPER}][${NAME_BODY}]+(?:${SEP}+[${UPPER}][${NAME_BODY}]+){0,3}${NA}`,
  'giu'
);

// Street and house number are a direct address component even when postal
// code and city are stored on a separate line.
const STREET_ADDRESS_RE = new RegExp(
  `${NB}(?:(?:[${UPPER}][${NAME_BODY}.\\-]{1,80}(?:straße|strasse|str\\.|weg|allee|gasse|platz|ring|damm|ufer|chaussee|stieg))` +
    `|(?:[${UPPER}][${NAME_BODY}.]{0,50}(?:${SEP}+[${UPPER}][${NAME_BODY}.]{0,50}){0,3}` +
    `${SEP}+(?:straße|strasse|str\\.|weg|allee|gasse|platz|ring|damm|ufer|chaussee|stieg))` +
    `|(?:(?:Am|Im|An${SEP}+der|Auf${SEP}+der|In${SEP}+der|Zum|Zur|Unter${SEP}+den|Unter${SEP}+der)` +
    `${SEP}+[${UPPER}][${NAME_BODY}.]+(?:${SEP}+[${UPPER}][${NAME_BODY}.]+){0,2}))${SEP}+\\d{1,5}[a-zA-Z]?` +
    `(?:${SEP}*[–—-]${SEP}*\\d{1,5}[a-zA-Z]?)?${NA}`,
  'giu'
);

// Number-first French street components occur in free prose as well as address
// fields. Require an explicit street type and a bounded proper-name sequence;
// horizontal whitespace only prevents eating the next table row or paragraph.
// Deliberately not a broad "number + words" rule (quantities/standards remain).
const FRENCH_STREET_TYPE = '(?:[Rr][Uu][Ee]|[Aa]venue|AVENUE|[Bb]oulevard|BOULEVARD|[Cc]hemin|CHEMIN|[Ii]mpasse|IMPASSE|[Aa]llée|ALLÉE|[Rr]oute|ROUTE|[Pp]lace|PLACE|[Qq]uai|QUAI)';
const FRENCH_STREET_WORD = `(?:[dDlL]['’])?[${UPPER}][${NAME_BODY}]{0,60}`;
const FRENCH_STREET_ADDRESS_RE = new RegExp(
  `${NB}\\d{1,5}(?:[a-zA-Z]|[ \\t]+(?:bis|ter))?[ \\t]+${FRENCH_STREET_TYPE}` +
    `(?:[ \\t]+(?:(?:de|du|des|la|le|DE|DU|DES|LA|LE)[ \\t]+){0,2}${FRENCH_STREET_WORD}){1,5}${NA}`,
  'gu'
);

// Numeric and spelled-out dates ("1. Januar 1980", "January 1, 1980"); the
// detector stays label-gated, so month names cannot fire on ordinary prose.
const MONTH_NAME = '(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember' +
  '|January|February|March|May|June|July|October|December|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Oct|Nov|Dez|Dec' +
  '|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre' +
  '|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre' +
  '|januari|februari|maart|mei|augustus|oktober)';
const DATE_OF_BIRTH_RE = new RegExp(
  `${NB}(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}|\\d{1,2}\\.?(?:er)?\\s+(?:de\\s+)?${MONTH_NAME}\\.?\\s+(?:de\\s+)?\\d{4}|${MONTH_NAME}\\.?\\s+\\d{1,2},?\\s+\\d{4})${NA}`,
  'giu'
);
// Review rc91 (F4): only German/English literals were known; French, Spanish,
// Dutch and Italian headers left birth dates in clear.
const DATE_OF_BIRTH_LABEL_RE = new RegExp(
  '(?:geburtsdatum|geburtstag|geboren(?:\\s+am)?|geb\\.|date\\s+of\\s+birth|birth\\s*date|birthday|dob' +
  '|date\\s+de\\s+naissance|née?\\s+le|fecha\\s+de\\s+nacimiento|nacid[oa]\\s+el|geboortedatum|geboren\\s+op|data\\s+di\\s+nascita)' +
  `${LABEL_QUALIFIER}\\s*:?\\s*$`,
  'iu'
);
// Protection roles are separate from the unchanged public literal grammar.
// Opaque atoms can retain value duties, never marker origin or Keep authority.
const FIELD_ROLE_ATOM = require('./spans').PLACEHOLDER_RE.source;
const FIELD_ANNOTATION_BODY = `(?:${FIELD_ROLE_ATOM}|(?!${FIELD_ROLE_ATOM})[^)\\n]){1,40}`;
const FIELD_ANNOTATION = `(?:\\s*\\(${FIELD_ANNOTATION_BODY}\\))?`;
const FIELD_CALL_CALLEE = PHONE_CALL_CALLEE.split(PHONE_CALL_NAME)
  .join(`(?:${PHONE_CALL_NAME}|${FIELD_ROLE_ATOM})`);
const FIELD_CALL_MIXED_NAME = PHONE_CALL_PERSON_NAME.split(PHONE_CALL_NAME)
  .join(`(?:${PHONE_CALL_NAME}|${FIELD_ROLE_ATOM})`);
// Complete rest protection can replace several separate raw gaps around
// already opaque atoms, including original title/particle/name punctuation.
// Their opaque-only closure retains the value role without accepting any
// additional literal callee words or treating a source marker as provenance.
// The separator class cannot consume an atom's '['; this repetition is not a
// corridor with competing token boundaries or an increased source budget.
const FIELD_CALL_OPAQUE = `${FIELD_ROLE_ATOM}(?:[${SEP_CHARS}'’.-]*${FIELD_ROLE_ATOM})*`;
const FIELD_CALL_SLOT = `(?:${FIELD_CALL_CALLEE}|${FIELD_CALL_MIXED_NAME}(?:${PHONE_CALL_SPACE}${PHONE_CALL_COURTESY})?|${FIELD_CALL_OPAQUE})`;
const FIELD_CALL_REQUEST = PHONE_CALL_REQUEST.replace(PHONE_CALL_CALLEE, FIELD_CALL_SLOT);
const FIELD_PHONE_PATTERN = PHONE_LABEL_PATTERN.replace(PHONE_CALL_REQUEST, FIELD_CALL_REQUEST)
  .replace(LABEL_QUALIFIER, FIELD_ANNOTATION);
const FIELD_DOB_PATTERN = DATE_OF_BIRTH_LABEL_RE.source.slice(0, -'\\s*:?\\s*$'.length)
  .replace(LABEL_QUALIFIER, FIELD_ANNOTATION);
const FIELD_PHONE_ROLES = FIELD_PHONE_PATTERN.replace(FIELD_CALL_SLOT, `(?<phone_callee>${FIELD_CALL_SLOT})`)
  .replace(FIELD_ANNOTATION, `(?:\\s*\\((?<phone_annotation>${FIELD_ANNOTATION_BODY})\\))?`);
const FIELD_DOB_ROLES = FIELD_DOB_PATTERN.replace(FIELD_ANNOTATION,
  `(?:\\s*\\((?<dob_annotation>${FIELD_ANNOTATION_BODY})\\))?`);
const STRUCTURED_LABEL_VALUE_PATTERN = `(?:${FIELD_PHONE_PATTERN}\\s*\\.?\\s*:?\\s*|${FIELD_DOB_PATTERN}\\s*:?\\s*)`;
const FIELD_ROLE_END_SOURCE = `(?<phone>${FIELD_PHONE_ROLES}\\s*\\.?\\s*:?\\s*)$|(?<dob>${FIELD_DOB_ROLES}\\s*:?\\s*)$`;
const FIELD_ROLE_END_RE = new RegExp(FIELD_ROLE_END_SOURCE, 'diu');
const FIELD_ROLE_RAW_RE = new RegExp(`^(?:${FIELD_ROLE_END_SOURCE})`, 'diu');
const FIELD_ROLE_PREFIX_SOURCE = `(?:${FIELD_PHONE_ROLES}\\s*\\.?\\s*|${FIELD_DOB_ROLES}\\s*)(?=[:=])`;

function whitespacePointReader(text) {
  let raw = 0, comparison = 0;
  return point => {
    while (comparison < point && raw < text.length) {
      if (/\s/u.test(text[raw])) { do { raw++; } while (raw < text.length && /\s/u.test(text[raw])); }
      else raw++;
      comparison++;
    }
    return comparison === point ? raw : null;
  };
}
function annotationRoleFits(text) {
  const atom = new RegExp(FIELD_ROLE_ATOM, 'uy'); let units = 0;
  for (let at = 0; at < text.length;) {
    if (++units > 40 || text[at] === '\n' || text[at] === ')') return false;
    atom.lastIndex = at;
    const match = text[at] === '[' ? atom.exec(text) : null;
    at += match ? match[0].length : text.codePointAt(at) > 0xffff ? 2 : 1;
  }
  return units > 0;
}
function structuredLabelRole(value) {
  const source = String(value), trimmedEnd = source.trimEnd().length;
  let ordinalEnd = trimmedEnd;
  while (source[ordinalEnd - 1] === ')') {
    let at = ordinalEnd - 2;
    while (at >= 0 && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at--;
    if (at === ordinalEnd - 2 || source[at] !== '(' || at < 1 || !/\s/u.test(source[at - 1])) break;
    ordinalEnd = at;
    while (ordinalEnd > 0 && /\s/u.test(source[ordinalEnd - 1])) ordinalEnd--;
  }
  for (const end of ordinalEnd === trimmedEnd ? [trimmedEnd] : [trimmedEnd, ordinalEnd]) {
    const raw = source.slice(0, end), comparable = raw.replace(/\s+/gu, ' ');
    const probe = FIELD_ROLE_END_RE.exec(comparable);
    if (!probe) continue;
    const points = [...new Set([probe.index, ...Object.entries(probe.indices.groups)
      .filter(([name, span]) => span && name.endsWith('_annotation')).flatMap(([, span]) => span)])].sort((a,b) => a-b);
    const reader = whitespacePointReader(raw), mapped = new Map(points.map(point => [point, reader(point)]));
    if ([...mapped.values()].some(point => point === null)) continue;
    if (Object.entries(probe.indices.groups).some(([name, span]) => span && name.endsWith('_annotation') &&
      !annotationRoleFits(raw.slice(mapped.get(span[0]), mapped.get(span[1]))))) continue;
    const start = mapped.get(probe.index), exact = FIELD_ROLE_RAW_RE.exec(raw.slice(start));
    if (!exact) continue;
    const slots = Object.entries(exact.indices.groups).filter(([name, span]) => span && (name.endsWith('_callee') || name.endsWith('_annotation')))
      .map(([name, span]) => ({kind: name.endsWith('_callee') ? 'callee' : 'annotation', start: start + span[0], end: start + span[1]}))
      .sort((a,b) => a.start-b.start);
    // Dropping an honorific during an actual partial replacement may leave
    // mixed literal/opaque name parts. That alternative is protection-only:
    // it must contain a closed opaque atom unless the old grammar admitted it.
    const literal = exact.groups.phone === undefined ? DATE_OF_BIRTH_LABEL_RE : PHONE_LABEL_RE;
    if (!literal.test(raw.slice(start)) && !slots.some(slot => require('./spans').placeholderSpans(source.slice(slot.start,slot.end)).length)) continue;
    const staticSpans = []; let cursor = start;
    for (const slot of slots) { if (cursor < slot.start) staticSpans.push({start: cursor, end: slot.start}); cursor = slot.end; }
    if (cursor < source.length) staticSpans.push({start: cursor, end: source.length});
    return {family: exact.groups.phone === undefined ? 'dob' : 'phone', protectsValue: true,
      start, end: source.length, slots, staticSpans, wholeMetadata: slots.length === 0 && source.slice(0,start).trim() === ''};
  }
  return null;
}

// Lexical slots only; callers retain actual owners and reconstruct values
// independently. Streaming remapping avoids a whole-document offset array.
function* structuredLabelParts(value) {
  const text = String(value);
  if (!text.includes('(')) return;
  const comparable = text.replace(/\s+/gu, ' '), pattern = new RegExp(FIELD_ROLE_PREFIX_SOURCE, 'dgiu');
  const reader = whitespacePointReader(text);
  for (let match; (match = pattern.exec(comparable));) {
    const start = reader(match.index), end = reader(pattern.lastIndex);
    if (start === null || end === null) return;
    const role = structuredLabelRole(text.slice(start, end));
    if (role) yield {start, end, role};
  }
}
function structuredLabelSeparators(value) {
  const result = new Set();
  for (const part of structuredLabelParts(value)) for (const slot of part.role.slots) if (slot.kind === 'annotation')
    for (let at = part.start + slot.start; at < part.start + slot.end; at++)
      if (value[at] === ':' || value[at] === '=') result.add(at);
  return result;
}
const VEHICLE_PLATE_RE = new RegExp(`${NB}[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}[ ]?\\d{1,4}[EH]?${NA}`, 'giu');
const VEHICLE_PLATE_LABEL_RE = /(?:kennzeichen|kfz-?kennzeichen|nummernschild)\s*:?\s*$/i;

const DE_SV_RE = new RegExp(
  `${NB}\\d{2}${SEP}?\\d{6}${SEP}?[A-Z]${SEP}?\\d{2}${SEP}?\\d${NA}`,
  'gu'
);

// A bare 11-digit run is any invoice, order or article number, so the German
// tax id is label-gated as well. Bare runs are covered by LABELED_ID_RE.
// Official letters commonly print the id grouped as "26 954 371 827"
// (2-3-3-3); an unseparated \d{11} alone missed that grouped shape.
const DE_TAX_SHAPE = `\\d{2}${SEP}?\\d{3}${SEP}?\\d{3}${SEP}?\\d{3}`;
const DE_TAX_RE = new RegExp(`${NB}${DE_TAX_SHAPE}${NA}`, 'gu');
const DE_TAX_LABEL_RE =
  /(?:steuer(?:-?\s?id|nummer|liche\s+identifikationsnummer)|id-?nr|idnr|ust-?id(?:nr)?)\s*\.?\s*:?\s*$/i;

const CREDIT_RE = new RegExp(`${NB}(?:\\d[ \\-]?){12,18}\\d${NA}`, 'gu');

// Reference numbers only ever appear behind a label, which makes them safe to
// match with high precision and impossible to confuse with quantities.
const ID_LABELS =
  '(?:Mitarbeiter|Personal|Kunden|Auftrags|Vertrags|Rechnungs|Bestell|Versicherungs|Sozialversicherungs|Ausweis|Personalausweis|Reisepass|Führerschein|Matrikel|Patienten|Fall|Akten|Beleg|Lieferanten|Debitoren|Kreditoren)' +
  '(?:nummer|nr\\.?|-nr\\.?|-nummer|zeichen)' +
  '|Aktenzeichen|Az\\.|Personalnr\\.|SV-?Nr\\.|Steuernummer|Steuer-?ID' +
  '|(?:contract|reference|order|invoice|employee|customer|case|patient)[ \\t]*(?:number|no\\.?|id)';
const LABELED_ID_RE = new RegExp(
  `(${ID_LABELS})([ \\t]*[:=][ \\t]*|[ \\t]+)((?:[A-Z0-9][A-Z0-9./\\-]*)(?:[ ][A-Z0-9][A-Z0-9./\\-]*){0,3})`,
  'giu'
);
// The same labels as table headers: "| Personalnummer |" above a column of
// bare identifiers carries the label for every cell below it.
const ID_LABEL_HEADER_RE = new RegExp(`^(?:${ID_LABELS})\\s*:?\\s*$`, 'iu');
// A bare identifier cell: at least one digit, no spaces, id-like characters.
const TABLE_ID_CELL_RE = new RegExp(`${NB}(?=[A-Z0-9./\\-]*\\d)[A-Z0-9][A-Z0-9./\\-]{2,}${NA}`, 'giu');

// Secrets are recognized only behind an explicit field/column label. Guessing
// from entropy or token shape would redact ordinary technical prose and still
// miss human-readable passphrases. Keep the value line-local and retain the
// label so the released document remains understandable.
const CREDENTIAL_LABELS =
  '(?:Pass[ \\t]*wort|Kenn[ \\t]*wort|Pass[ \\t]*word|Pass[ \\t]*phrase|Secret|Token|API(?:[ \\t-]+)?Key' +
  '|Zugangs[ \\t]*daten|Zugangs[ \\t]*code|PIN|Benutzer[ \\t]*name|Nutzer[ \\t]*name|User[ \\t]*name' +
  '|Login(?:[ \\t]*name)?|Anmelde[ \\t]*name|Konto[ \\t]*kennung)';
const CREDENTIAL_FIELD_RE = new RegExp(
  `^([ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${CREDENTIAL_LABELS}[ \\t]*(?::|=|：|＝)[ \\t]*)([^\\r\\n]*?\\S)(?=[ \\t]*\\r?$)`,
  'gimu'
);
const CREDENTIAL_LABEL_HEADER_RE = new RegExp(`^${CREDENTIAL_LABELS}[ \\t]*[:：]?$`, 'iu');

// Honorifics and job/section vocabulary must never end up inside a person
// pseudonym. "Herr Müller" used to be registered as the full name, so the same
// human received PERSON_001 as "Herr Müller", PERSON_002 as "Frau Müller" and
// PERSON_003 as a bare "Müller".
const HONORIFICS = new Set([
  'HERR', 'HERRN', 'FRAU', 'DR', 'DR.', 'PROF', 'PROF.', 'DIPL', 'DIPL.',
  'ING', 'ING.', 'MAG', 'MAG.', 'DR.-ING', 'DR.-ING.', 'MR', 'MR.', 'MRS', 'MRS.', 'MS', 'MS.', 'MX', 'MX.', 'SEHR', 'GEEHRTE',
  'GEEHRTER', 'LIEBE', 'LIEBER', 'HALLO',
  // Degree qualifiers behind a title ("Dr. med.", "Dr. h. c.", "Dr. rer. nat.")
  // are part of the honorific, never of the name (review rc91).
  'MED', 'MED.', 'DENT', 'DENT.', 'VET', 'VET.', 'JUR', 'JUR.', 'PHIL', 'PHIL.',
  'THEOL', 'THEOL.', 'OEC', 'OEC.', 'HABIL', 'HABIL.', 'H.', 'C.', 'RER', 'RER.',
  'NAT', 'NAT.', 'POL', 'POL.', 'SOC', 'SOC.', 'PD', 'PRIV.-DOZ', 'PRIV.-DOZ.'
]);

// Words that disqualify a title-case bigram from being read as a person name.
const ROLE_WORDS = new Set([
  // legal forms
  'GMBH', 'AG', 'SE', 'KG', 'OHG', 'GBR', 'UG', 'LTD', 'LIMITED', 'INC', 'LLC',
  'SAS', 'SARL', 'PLC', 'CO', 'KGAA', 'EG', 'EV',
  // roles and functions
  'PRODUCT', 'OWNER', 'SCRUM', 'MASTER', 'BUSINESS', 'ANALYST', 'COACH',
  'AGILE', 'SOFTWARE', 'ENTWICKLER', 'ENTWICKLERIN', 'ENGINEER', 'CONSULTANT',
  'BERATER', 'BERATERIN', 'MANAGER', 'MANAGERIN', 'OFFICER', 'ARCHITECT',
  'ARCHITEKT', 'ARCHITEKTIN', 'LEAD', 'HEAD', 'DIRECTOR', 'TEAMLEITER',
  'PROJEKTLEITER', 'PROJEKTLEITERIN', 'TESTER', 'DESIGNER', 'ADMINISTRATOR',
  'SPECIALIST', 'EXPERTE', 'EXPERTIN', 'TRAINER', 'AUDITOR', 'SCIENTIST',
  'DEVELOPER', 'SENIOR', 'JUNIOR', 'PRINCIPAL', 'STAFF', 'INTERIM',
  'TEST', 'TESTMANAGER', 'TESTANALYST', 'TESTING', 'QUALITY', 'ASSURANCE',
  'QA', 'DEVOPS', 'FULLSTACK', 'BACKEND', 'FRONTEND', 'REQUIREMENTS',
  'AUTOMATION', 'ARCHITECTURE', 'INTEGRATION', 'INTEROPERABILITY',
  // document sections
  'QUALIFIKATIONEN', 'PROJEKTERFAHRUNG', 'BERUFSERFAHRUNG', 'SKILLSET',
  'ZERTIFIZIERUNGEN', 'SPRACHKENNTNISSE', 'BRANCHENKENNTNISSE', 'TECHNOLOGIEN',
  'METHODEN', 'AUFGABEN', 'VERANTWORTLICHKEITEN', 'AUSBILDUNG', 'WERDEGANG',
  'PROJEKT', 'PROJEKTE', 'ROLLE', 'ROLLEN', 'FUNKTION', 'ZEITRAUM', 'BRANCHE',
  'STANDORT', 'UNTERNEHMEN', 'KUNDE', 'KUNDEN', 'KONTAKT', 'ANLAGE', 'INHALT',
  'ZUSAMMENFASSUNG', 'BESCHREIBUNG', 'ERGEBNIS', 'ERGEBNISSE', 'ZIELE',
  'SEITE', 'STAND', 'VERSION', 'DATUM', 'TESTFALL', 'VERTRAULICH',
  // industries and languages frequently appear as comma-separated profile data
  'LOGISTIK', 'GESUNDHEITSWESEN', 'VERSICHERUNG', 'KRANKENKASSEN',
  'DEUTSCH', 'ENGLISCH',
  // agile / requirements vocabulary that reads like a name
  'USER', 'STORIES', 'STORY', 'BACKLOG', 'REFINEMENT', 'REVIEW', 'RETRO',
  'SPRINT', 'EPIC', 'EPICS', 'RELEASE', 'ROADMAP', 'WORKSHOP', 'WORKSHOPS',
  'STAKEHOLDER', 'STAKEHOLDERMANAGEMENT', 'DEFINITION', 'DONE', 'READY',
  'ACCEPTANCE', 'AKZEPTANZKRITERIEN', 'ANFORDERUNGSMANAGEMENT'
]);

// Technology and product names that look exactly like "Firstname Lastname".
// Without this list applicant and personnel profiles lose the very content the
// profiles are supposed to preserve.
const TECH_TERMS = new Set([
  'SPRING BOOT', 'VISUAL STUDIO', 'VISUAL BASIC', 'AZURE DEVOPS',
  'SAP COMMERCE',
  'MICROSOFT AZURE', 'AMAZON WEB SERVICES', 'GOOGLE CLOUD', 'RED HAT',
  'SQL SERVER', 'ORACLE DATABASE', 'POWER BI', 'POWER APPS', 'POWER AUTOMATE',
  'MICROSOFT TEAMS', 'MICROSOFT OFFICE', 'OPEN SOURCE', 'MACHINE LEARNING',
  'DEEP LEARNING', 'DATA SCIENCE', 'DATA WAREHOUSE', 'BUSINESS INTELLIGENCE',
  'CONTINUOUS INTEGRATION', 'CONTINUOUS DELIVERY', 'DESIGN THINKING',
  'CLEAN CODE', 'DOMAIN DRIVEN DESIGN', 'TEST DRIVEN DEVELOPMENT',
  'PAIR PROGRAMMING', 'CODE REVIEW', 'DEUTSCHE BAHN', 'ARTIFICIAL INTELLIGENCE',
  'NODE JS', 'REACT NATIVE', 'ENTITY FRAMEWORK', 'CRYSTAL REPORTS',
  'SOFTWARE ARCHITECTURE', 'REQUIREMENTS ENGINEERING', 'BUSINESS ANALYSIS',
  'SOFT SKILLS', 'SERVANT LEADERSHIP', 'CHANGE MANAGEMENT', 'ÖFFENTLICHE VERWALTUNG',
  'DIGITAL TRANSFORMATION', 'DIGITALE TRANSFORMATION', 'CLOUD MIGRATION',
  'STRATEGIC PLANNING', 'PUBLIC ADMINISTRATION', 'TEAM COLLABORATION',
  'ZERO TRUST', 'LEAN MANAGEMENT',
  'AZURE FUNCTIONS', 'MEDICAL INFORMATICS', 'HEALTH INFORMATICS',
  'CLINICAL INFORMATICS', 'DIGITAL HEALTH', 'DATA GOVERNANCE',
  'GRAPH API', 'MICROSOFT GRAPH API', 'PROJECT SERVER', 'ROBOT FRAMEWORK',
  'IMAGING PROTOCOL', 'IMAGE RECONSTRUCTION', 'TREATMENT PROTOCOL',
  'SCANNER CALIBRATION', 'SPECTROSCOPY REPORT',
  'CLINICAL RESEARCH', 'PRIVACY POLICY', 'COMPANY LOGO',
  'TEST MANAGEMENT', 'TEST AUTOMATION', 'EXPLORATORY TESTING',
  'REGRESSION TESTING', 'ACCEPTANCE TESTING', 'PERFORMANCE TESTING',
  'SECURITY TESTING', 'RISK BASED TESTING', 'QUALITY ASSURANCE',
  'PRODUCT DISCOVERY', 'PRODUCT VISION', 'PRODUCT GOAL', 'PRODUCT BACKLOG',
  'SPRINT PLANNING', 'SPRINT REVIEW', 'SPRINT RETROSPECTIVE',
  'VALUE PROPOSITION', 'STAKEHOLDER MANAGEMENT', 'REQUIREMENTS ELICITATION',
  'PROCESS MODELING', 'USER JOURNEY', 'USE CASE', 'DATA MODELING',
  'HEALTH LEVEL SEVEN', 'HL7 FHIR', 'FHIR RESOURCES', 'IHE PROFILES',
  'ELECTRONIC HEALTH RECORD', 'ELEKTRONISCHE PATIENTENAKTE',
  'DIGITALE GESUNDHEITSANWENDUNGEN', 'MEDIZINISCHE INFORMATIONSOBJEKTE',
  'SNOMED CT', 'LOINC CODES', 'ICD 10', 'DICOM WEB',
  'TELEMATIK INFRASTRUKTUR', 'PATIENT IDENTITY MANAGEMENT'
]);

// Brand names that are informative rather than identifying. Compared against
// both the full match and the legal-form-stripped alias, because COMPANY_RE
// only ever captures strings that end in a legal form.
const ORG_ALLOW = new Set([
  'SCRUM.ORG', 'MICROSOFT', 'SAP', 'ATLASSIAN', 'JIRA', 'CONFLUENCE', 'MIRO',
  'SAFE', 'IHK', 'TÜV', 'ISO', 'PMI', 'AWS', 'AMAZON WEB SERVICES', 'GOOGLE',
  'ORACLE', 'IBM', 'SALESFORCE', 'SERVICENOW', 'GITHUB', 'GITLAB', 'DOCKER',
  'KUBERNETES', 'LINUX', 'WINDOWS'
]);

// Invisible characters that break tokenisation without being visible to a
// reader. The soft hyphen is the practically relevant one: Word inserts it for
// justified text, so "Mül<U+00AD>ler" is an ordinary German document, and every
// name pattern would silently miss it.
const INVISIBLE_JOINER_RE = /[­​‌‍⁠﻿]/gu;
const BIDI_BOUNDARY_RE = /[\u202A-\u202E\u2066-\u2069]/gu;
// Backwards-compatible complete detector for modules/tests that inspect the
// privacy character class without applying its context-sensitive rewrite.
const INVISIBLE_RE = /[­​‌‍⁠﻿\u202A-\u202E\u2066-\u2069]/gu;

// Text entering the engine is normalised once. Without NFC a decomposed umlaut
// ("Mu" + U+0308) does not match the name character classes at all, which is
// how documents exported from macOS would have passed a surname through
// untouched. Normalisation is idempotent, so applying it defensively at several
// boundaries is free.
function normalizeText(s) {
  return String(s || '')
    .normalize('NFC')
    // Formatting joiners embedded by Office/browser exports belong to the
    // surrounding token (for example Mu<soft-hyphen>eller). Bidi controls are
    // different: treating them as an empty string could join two attacker-
    // controlled name tokens into one synthetic word. Preserve that boundary.
    .replace(INVISIBLE_JOINER_RE, '')
    .replace(BIDI_BOUNDARY_RE, ' ')
    // Office, PDF and browser exports use the complete Unicode Space
    // Separator family. Privacy matching must see the same token boundary for
    // all of them; retaining the visual width is less important than avoiding
    // an invisible split that the residual gate cannot classify.
    .replace(/\p{Zs}/gu, ' ');
}

// Detection-only compatibility view, never document/output normalization.
// Every replacement is one BMP code unit, so existing UTF-16 source, OCR and
// review offsets stay exact. Deliberately exclude structural Markdown signs,
// ligatures, units, superscripts and cross-script lookalikes: generic NFKC
// would change professional content and can expand a single source character.
const IDENTIFIER_COMPAT_RE = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF20\uFF0E\uFF0B\uFF0D\uFF0F\uFF1A\uFF05\uFF1F\uFF06\uFF1D\uFF08\uFF09\uFF3F\uFF5E\u2024]/gu;
function identifierDetectionText(s) {
  return String(s || '').replace(IDENTIFIER_COMPAT_RE, (character) =>
    character === '\u2024' ? '.' : String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
}

function assertPrivacyTextCharacters(value) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/u.test(value)) {
    throw Object.assign(new Error('Die Zeichendarstellung erlaubt keine sichere Datenschutzprüfung.'), { code: 'RESIDUAL_PII' });
  }
}

// The privacy engine receives Markdown, including parser-generated Markdown.
// Detecting only source syntax is unsafe because a renderer can reveal a
// different string (HTML entities, emphasis, links or inline HTML). This
// bounded canonicalisation preserves visible wording while removing syntax
// that can split identifiers. It never executes HTML and never fetches links.
function canonicalizeRenderedText(s, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  const personLabel = personFieldPattern(personFieldPolicy);
  let value = normalizeText(s);
  const named = {
    nbsp:' ',tab:' ',newline:'\n',ensp:' ',emsp:' ',thinsp:' ',hairsp:' ',mediumspace:' ',verythinspace:' ',
    amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",period:'.',commat:'@',colon:':',semi:';',comma:',',sol:'/',bsol:'\\',
    auml:'ä',ouml:'ö',uuml:'ü',auml_upper:'Ä',ouml_upper:'Ö',uuml_upper:'Ü',szlig:'ß',
    eacute:'é',egrave:'è',ecirc:'ê',ccedil:'ç',ntilde:'ñ',aacute:'á',iacute:'í',oacute:'ó',uacute:'ú'
  };
  const decodeLayer = input => input
    .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/giu, (match, hex, dec) => {
      const code = Number.parseInt(hex || dec, hex ? 16 : 10);
      if(!Number.isSafeInteger(code)||code<0||code>0x10ffff||(code>=0xd800&&code<=0xdfff))return '\uFFFD';
      if((code<0x20&&!['9','10','13'].includes(String(code)))||(code>=0x7f&&code<=0x9f))return '\uFFFD';
      return String.fromCodePoint(code);
    })
    .replace(/&([A-Za-z][A-Za-z0-9]{1,31});/gu, (match, rawName) => {
      const exact = rawName === 'Auml' ? 'auml_upper' : rawName === 'Ouml' ? 'ouml_upper' : rawName === 'Uuml' ? 'uuml_upper' : rawName.toLocaleLowerCase('en-US');
      return Object.hasOwn(named, exact) ? named[exact] : match;
    });
  value = require('./encoded-identifiers').normalizeEncodedIdentifiers(value, fragment => normalizeText(decodeLayer(fragment)), text => {
    const ranges = [...text.matchAll(EMAIL_RE)].map(match => ({ start: match.index, end: match.index + match[0].length }));
    // A code/escape is not a privacy exemption for an encoded card. Unknown
    // characters may separate whole digit groups in this PROBE. Retain the
    // original coordinates and route only a positive complete Luhn corridor
    // to the actual character gate; never repair output or join LF/CR. Runs
    // (not one optional separator) cover repeated controls without a limit-
    // driven prefix match in a longer numeric corridor. Bare entity examples
    // have no positive card and remain literal.
    if (text.includes('\uFFFD')) {
      const view = identifierDetectionText(text);
      for (const match of view.matchAll(/\d+(?:[ \t\-\uFFFD]+\d+)+/gu)) {
        const end = match.index + match[0].length;
        // Consume the whole corridor FIRST. Regex word-boundary assertions
        // here could backtrack to a valid-looking prefix or restart inside a
        // rejected 20-digit token. Two units suffice for one Unicode scalar.
        if (/[\p{L}\p{N}_]$/u.test(view.slice(Math.max(0, match.index - 2), match.index)) ||
            /^[\p{L}\p{N}_]/u.test(view.slice(end, end + 2))) continue;
        if (match[0].includes('\uFFFD') && luhnValid(match[0])) ranges.push({ start: match.index, end });
      }
    }
    // Use the actual structured grammar for ALL identifier classes. A code
    // literal is no exemption for an encoded IP, card, credential or address.
    ranges.push(...require('./structured').findStructuredSpans(text).map(({ start, end }) => ({ start, end })));
    for (const match of text.matchAll(URL_RE)) ranges.push({ start: match.index, end: match.index + match[0].length });
    const names = /(?<![\p{L}\p{M}])[\p{Lu}][\p{L}\p{M}'’\-]{1,63}(?:\s+[\p{Lu}][\p{L}\p{M}'’\-]{1,63}){1,3}/gu;
    for (const match of text.matchAll(names)) if (looksName(match[0])) ranges.push({ start: match.index, end: match.index + match[0].length });
    const fields = new RegExp(`(?:^|[\\r\\n|])(?:${personLabel}|Firma|Unternehmen|Arbeitgeber|Company(?: Name)?|Employer|Telefon|Phone|IBAN)\\s*[:=]\\s*([^\\r\\n;,|]+)`, 'giu');
    for (const match of text.matchAll(fields)) if (/[\p{L}\p{N}]/u.test(match[1])) {
      const start = match.index + match[0].length - match[1].length;
      ranges.push({ start, end: start + match[1].length });
    }
    // Reuse actual context/table/name discovery rather than treating a code
    // wrapper as a detector exemption (including non-Latin single names).
    const projection = text.replace(/`+/gu, run => ' '.repeat(run.length));
    const entities = require('./entities');
    const values = [...entities.collectPersonSeeds(projection, 'general', null, null, personFieldPolicy).map(seed => seed.matchValue || seed.value),
      ...entities.collectOrganizations(projection)];
    for (const candidate of new Set(values)) {
      const pattern = new RegExp(escapeRegExp(candidate).replace(/\s+/gu, '[ \\t]+'), 'giu');
      for (const match of text.matchAll(pattern)) ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    return ranges;
  });
  // Literal punctuation is content, not emphasis or HTML. Temporarily shield
  // it from syntax removal, then restore it BEFORE privacy detection. Tokens
  // cannot collide with source text and never escape this function. Keeping
  // the literal Markdown escapes makes repeated review passes idempotent.
  let probe = value;
  for (let depth = 0; depth < 16; depth++) {
    const next = probe.replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/giu, (match, hex, dec) => {
      const point = Number.parseInt(hex || dec, hex ? 16 : 10);
      return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    }).replace(/&amp;/giu, '&');
    if (next === probe) break; probe = next;
  }
  // Fixed-size, checked prefixes avoid both decoded collisions and a source-
  // sized regex. Unowned token indices can never manufacture replacement text.
  let tokenPrefix;
  const sourceDigest = crypto.createHash('sha256').update(value).digest();
  for (let attempt = 0; attempt < 32; attempt++) {
    const digest = crypto.createHash('sha256').update(sourceDigest).update(String(attempt)).digest();
    // Two private-use characters keep intermediate growth bounded even for
    // punctuation-heavy documents; never expand each escape by a 40-char ID.
    const candidate = String.fromCharCode(0xe000 + digest.readUInt16BE(0) % 4096, 0xe000 + digest.readUInt16BE(2) % 4096);
    if (!value.includes(candidate) && !probe.includes(candidate)) { tokenPrefix = candidate; break; }
  }
  if (!tokenPrefix) throw new Error('MARKDOWN_LITERAL_COLLISION');
  const literals = [];
  const shield = literal => { const token = tokenPrefix + literals.length + '\uE001'; literals.push(literal); return token; };
  const literalMarkdown = text => text.replace(/[\\`*_[\]~&<>]/gu, '\\$&');
  // Real fenced Markdown is not generated PDF prose. Return its contents
  // before detection: retaining a fence grants no privacy exemption.
  value = require('./markdown-literals').shieldMarkdownLiterals(value, shield, literalMarkdown);
  value = value.replace(/(?:\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])+/gu, shield);
  // Remove only actual, common HTML tags from the source representation.
  // Entity-escaped comparisons and programming generics are visible text and
  // must not turn into markup after entity decoding.
  const htmlBoundaryNames = 'address|article|aside|blockquote|br|caption|col|colgroup|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul';
  const htmlInlineNames = 'a|abbr|b|cite|code|del|dfn|em|i|img|ins|kbd|mark|picture|q|s|samp|small|source|span|strong|sub|sup|time|u|var';
  const htmlBoundaryTag = new RegExp(`<\\/?(?:${htmlBoundaryNames})(?:\\s[^<>\\n]{0,2000})?\\s*\\/?>`, 'giu');
  const htmlInlineTag = new RegExp(`<\\/?(?:${htmlInlineNames})(?:\\s[^<>\\n]{0,2000})?\\s*\\/?>`, 'giu');
  const htmlComment = /<!--[\s\S]*?-->/gu;
  value=value.replace(htmlComment,'').replace(htmlBoundaryTag,' ').replace(htmlInlineTag,'');
  for(let depth=0;depth<16;depth++){
    const decoded=decodeLayer(value);
    if(decoded===value)break;
    value=decoded;
  }
  // More than sixteen nested layers are not meaningful document content. Do
  // not leave a value that changes classification on a later anonymisation.
  value=value.replace(/&(?=(?:#(?:x[0-9a-f]{1,6}|[0-9]{1,7})|[A-Za-z][A-Za-z0-9]{1,31});)/giu,'\uFFFD');
  // Preserve rendered wording, but remove metadata and inactive markup before
  // privacy detection. No target is fetched or executed.
  // Keep Markdown link syntax inert and intact. Labels, titles and targets are
  // scanned by the entity/structured rules; flattening the link here would
  // silently change document content and break the promised Markdown result.
  value=value.replace(/\*\*\*([^*\n]+)\*\*\*/gu,'$1');
  value=value.replace(/\*\*([^*\n]+)\*\*/gu,'$1');
  value=value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu,'$1');
  value=value.replace(/___([^_\n]+)___/gu,'$1');
  value=value.replace(/__([^_\n]+)__/gu,'$1');
  value=value.replace(/(?<![\p{L}\p{N}\]])_([^_\n]+)_(?![\p{L}\p{N}\[])/gu,'$1');
  value=value.replace(/~~([^~\n]+)~~/gu,'$1');
  // Tags introduced only by decoding visible text are not source markup.
  // Keep their angle brackets escaped so a later engine/review pass cannot
  // reinterpret (and delete) them. Ordinary entities still decode for PII
  // detection; actual source tags/comments were already removed above.
  const escapeVisibleMarkup = (fragment) => fragment.replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
  value=value.replace(htmlComment,escapeVisibleMarkup)
    .replace(htmlBoundaryTag,escapeVisibleMarkup).replace(htmlInlineTag,escapeVisibleMarkup);
  // A quoted angle bracket inside a literal tag can prevent the whole-tag
  // matcher from recognising it. Its opening still must remain inert.
  value=value.replace(new RegExp(`<(?=/?(?:${htmlBoundaryNames}|${htmlInlineNames})[\\s/>]|!--)`, 'giu'),'&lt;');
  // Unknown tag-like words and comparisons are visible literals too. Never
  // emit a newly decoded <value> that a Markdown renderer can hide as HTML.
  value=value.replace(/<(?=[A-Za-z/!?])/gu,'&lt;');
  value = value.replace(new RegExp(tokenPrefix + '([0-9]+)\uE001', 'gu'), (match, index) =>
    Object.hasOwn(literals, index) ? literals[Number(index)] : match);
  const canonical = normalizeText(value);
  // Never turn an unknown source character into a harmless-looking separator:
  // 4111<C1>1111... became 4111<U+FFFD>1111... and escaped both privacy scans.
  // Check the ACTUAL rendered text only, after restoring inert code/escapes.
  // Temporary entity-decoding probes stay non-throwing so an ASCII example
  // such as `&#133;` is not mistaken for an active control.
  // U+FFFD is valid Unicode, but deliberately not a releasable privacy input:
  // neither its missing original character nor an old replacement is known.
  // Keep TAB/CR/LF and ordinary Unicode prose; do not join lines or repair data.
  assertPrivacyTextCharacters(canonical);
  return canonical;
}

function normalizeSpaces(s) {
  return normalizeText(s).replace(/\s+/g, ' ').trim();
}

function key(s) {
  return normalizeSpaces(s).toLocaleLowerCase('de-DE');
}

function hashShort(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replacement strings are inserted verbatim: a literal "$&" in a pseudonym must
// not be reinterpreted as a substitution pattern.
function escapeReplacement(s) {
  return String(s).replace(/\$/g, '$$$$');
}

function replaceAllInsensitive(text, needle, repl) {
  if (!needle) return text;
  const re = new RegExp(`${NB}${escapeRegExp(needle)}${NA}`, 'giu');
  return String(text).replace(re, escapeReplacement(repl));
}

function lines(text) {
  return String(text || '').split(/\r?\n/);
}

function orgAlias(value) {
  return normalizeSpaces(String(value || '').replace(ORG_SUFFIX_TAIL_RE, ''));
}

function isAllowedOrg(value) {
  const full = normalizeSpaces(value).toLocaleUpperCase('de-DE');
  const alias = orgAlias(value).toLocaleUpperCase('de-DE');
  return ORG_ALLOW.has(full) || (alias.length > 0 && ORG_ALLOW.has(alias));
}

function titleCase(s) {
  return normalizeSpaces(s).replace(
    new RegExp(`([${UPPER}])([${UPPER}'’\\-]+)`, 'gu'),
    (_m, a, b) => a + b.toLocaleLowerCase('de-DE')
  );
}

function isStopToken(token) {
  const up = String(token).toLocaleUpperCase('de-DE');
  return ROLE_WORDS.has(up) || HONORIFICS.has(up);
}

// Nobility and origin particles sit between name tokens ("Anna von der
// Heide", "Jean-Luc de la Croix"); they are neither the first nor the last
// token and never count as name tokens themselves.
const NAME_PARTICLE = '(?:von|vom|van|de|der|den|del|della|di|da|du|la|le|zu|zur|zum|y|e|of)';
const NAME_PARTICLES = new Set(['von', 'vom', 'van', 'de', 'der', 'den', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'zu', 'zur', 'zum', 'y', 'e', 'of']);

function looksName(s) {
  const v = normalizeSpaces(s);
  if (!v || v.length > 80) return false;
  if (TECH_TERMS.has(v.toLocaleUpperCase('de-DE'))) return false;
  const all = v.split(/\s+/);
  if (all.length > 7) return false;
  const lower = all.map((token) => token.toLocaleLowerCase('de-DE'));
  const toks = all.filter((t, i) => !(i > 0 && i < all.length - 1 &&
    (NAME_PARTICLES.has(lower[i]) ||
      (lower[i] === 'und' && lower[i - 1] === 'von' && lower[i + 1] === 'zu'))));
  if (toks.length < 2 || toks.length > 4) return false;
  if (toks.some(isStopToken)) return false;
  const token = new RegExp(`^(?:${NAME_TOKEN}|${CAPS_TOKEN})$`, 'u');
  return toks.every((t) => token.test(t));
}

// A single token can be a surname, but only where the context says so
// (honorific, "Name:" label, or a surname already known from a full name).
function looksSurname(s) {
  const v = normalizeSpaces(s);
  if (!v || /\s/.test(v)) return false;
  if (isStopToken(v)) return false;
  return new RegExp(`^(?:${NAME_TOKEN}|${CAPS_TOKEN})$`, 'u').test(v) && v.length >= 2;
}

function luhnValid(digits) {
  const d = String(digits).replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// Shared by every label-gated detector: does `label` appear immediately before
// the match, on the same line, or in the header cell of the Markdown table
// column the match sits in? CSV and DOCX tables put the label in the header
// row and the value two or more lines below; same-line adjacency alone let
// tax ids, dates of birth, phone numbers and plates through in that shape.
function hasLabelBefore(text, index, labelRe, window = 40) {
  const start = Math.max(0, index - window);
  let before = String(text).slice(start, index);
  const nl = before.lastIndexOf('\n');
  if (nl >= 0) before = before.slice(nl + 1);
  if (labelRe.test(normalizeSensitiveLabel(before.replace(/[|\s]+$/, (m) => m.replace(/\|/g, ' '))))) return true;
  const header = tableHeaderAt(text, index);
  if (header !== null && labelRe.test(header)) return true;
  // Form layouts put the label alone on the line above the value
  // ("Geburtsdatum\n01.01.1980", definition lists ": 26954371827"). When the
  // value starts its own line, the nearest short non-empty line above counts.
  if (/^[\s|:>*+\-–•]*$/u.test(before)) {
    const label = previousLabelLine(text, index);
    if (label !== null && labelRe.test(normalizeSensitiveLabel(label))) return true;
  }
  return false;
}

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

// Office line breaks inside narrow header cells often split a closed PII label
// into two visible words. Normalize only this bounded vocabulary; document-wide
// whitespace folding would alter prose and create unrelated false positives.
function normalizeSensitiveLabel(value) {
  return String(value || '')
    .replace(/\bsteuer(?:[ \t]+|[ \t]*-[ \t]*)id\b/giu, 'Steuer-ID')
    .replace(/\bgeburts(?:[ \t]+|[ \t]*-[ \t]*)datum\b/giu, 'Geburtsdatum')
    .replace(/\b(tel|telefon|téléphone|telephone|phone|teléfono|telefono|telefoon|mobil|mobile|handy|fax)(?:[ \t]+|[ \t]*-[ \t]*)(privat|dienstlich|geschäftlich|geschaeftlich|business|private)\b/giu, '$1 ($2)')
    .replace(/\b(personal|mitarbeiter|kunden|auftrags|vertrags|rechnungs|bestell|versicherungs|sozialversicherungs|patienten|fall|akten|lieferanten|debitoren|kreditoren)(?:[ \t]+|[ \t]*-[ \t]*)(nummer|nr\.?|zeichen)\b/giu, '$1$2');
}

function previousLabelLine(text, index) {
  const src = String(text);
  let lineStart = src.lastIndexOf('\n', Math.max(0, index - 1));
  for (let hops = 0; hops < 3 && lineStart > 0; hops++) {
    const previousStart = src.lastIndexOf('\n', lineStart - 1) + 1;
    const line = src.slice(previousStart, lineStart).replace(/[|\s:>*+\-–•]+$/u, '').replace(/^[\s|>*+\-–•]+/u, '').trim();
    if (line) return line.length <= 80 ? line : null;
    lineStart = previousStart - 1;
  }
  return null;
}

function splitTableRow(line) {
  const source = String(line || '').trim();
  if (!source.includes('|')) return null;
  const leading = source.startsWith('|') ? 1 : 0;
  const body = source.slice(leading).replace(/\|$/u, '');
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
  // One-column GFM tables have an explicit outer pipe pair. Requiring both
  // boundaries keeps arbitrary prose ending in a pipe from becoming context.
  return cells.length >= 2 || (leading === 1 && source.length > 1 && source.endsWith('|')) ? cells : null;
}

// One pass per text: for every data row of a Markdown table, remember the
// header cells so a detector can ask which label owns the column of a match.
// The cache holds the last text only; the engine scans one document at a time.
let tableIndexText = null;
let tableIndex = null;
let tableIndexPolicy = null;

function isSensitiveTableHeader(value) {
  const header = normalizeSensitiveLabel(value);
  return DATE_OF_BIRTH_LABEL_RE.test(header) || PHONE_LABEL_RE.test(header) ||
    DE_TAX_LABEL_RE.test(header) || ID_LABEL_HEADER_RE.test(header) ||
    CREDENTIAL_LABEL_HEADER_RE.test(header);
}

function isResolvedSensitiveTableHeader(value, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  return isSensitiveTableHeader(value) || isPersonFieldLabel(normalizeSensitiveLabel(value), personFieldPolicy);
}

function effectiveTableFieldLabel(value, personFieldPolicy = CONTENT_PERSON_FIELD_POLICY) {
  const label = normalizeSensitiveLabel(String(value)).trim();
  if(personFieldPolicy !== CONTENT_PERSON_FIELD_POLICY)return normalizeSensitiveLabel(label.replace(/\s+\(\d+\)$/u,'')).trim();
  // Idempotent content semantics, one backwards scan. Repeated regex suffix
  // stripping in different consumers used to give Name (1) (2) different
  // meanings. Avoid a nested repeated-suffix regex on attacker-sized text.
  let end = label.length;
  while(label[end-1] === ')') {
    let cursor = end-2;
    while(cursor >= 0 && label.charCodeAt(cursor) >= 48 && label.charCodeAt(cursor) <= 57)cursor--;
    if(cursor === end-2 || label[cursor] !== '(' || cursor < 1 || !/\s/u.test(label[cursor-1]))break;
    end = cursor;
    while(end > 0 && /\s/u.test(label[end-1]))end--;
  }
  return normalizeSensitiveLabel(label.slice(0,end)).trim();
}

function combineHeaderRows(rows) {
  return rows[0].map((_, column) =>
    normalizeSensitiveLabel(rows.map((row) => row[column]).join(' '))
  );
}

// A known PII label may be split by Word across at most three visible header
// rows. Longer or structurally inconsistent shapes are not guessed: the final
// residual gate receives an explicit structural finding and stops the file.
const SENSITIVE_HEADER_FRAGMENT_RE = /\b(?:steuer|geburts|telefon|telephone|phone|téléphone|teléfono|telefono|telefoon|mobil|mobile|handy|fax|personal|mitarbeiter|sozialversicherungs|patienten|kunden|auftrags|vertrags|rechnungs|bestell|versicherungs|fall|akten|lieferanten|debitoren|kreditoren|passwort|kennwort|password|passphrase|secret|token|zugangsdaten|zugangscode|pin|benutzername|nutzername|username|loginname|anmeldename|kontokennung)\b/iu;

const CREDENTIAL_FRAGMENT_PAIRS = [
  ['pass', 'wort'], ['kenn', 'wort'], ['pass', 'word'], ['pass', 'phrase'],
  ['api', 'key'], ['zugangs', 'daten'], ['zugangs', 'code'],
  ['benutzer', 'name'], ['nutzer', 'name'], ['user', 'name'], ['login', 'name'],
  ['anmelde', 'name'], ['konto', 'kennung']
];

function hasCredentialHeaderFragmentSequence(rows) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  for (let column = 0; column < width; column++) {
    const parts = rows.map((row) => normalizeSensitiveLabel(row[column] || '').toLowerCase())
      .filter(Boolean);
    if (CREDENTIAL_FRAGMENT_PAIRS.some(([first, last]) =>
      parts.includes(first) && parts.includes(last))) return true;
  }
  return false;
}

function hasCredentialHeaderFragmentSequenceAtColumn(rows, column) {
  const parts = rows.map((row) => normalizeSensitiveLabel(row[column] || '').toLowerCase())
    .filter(Boolean);
  return CREDENTIAL_FRAGMENT_PAIRS.some(([first, last]) =>
    parts.includes(first) && parts.includes(last));
}

function buildTableIndex(text, personFieldPolicy) {
  const personHeader = header => personFieldPolicy === CONTENT_PERSON_FIELD_POLICY &&
    isPersonFieldLabel(normalizeSensitiveLabel(header), personFieldPolicy);
  const sensitiveFragment = header => SENSITIVE_HEADER_FRAGMENT_RE.test(normalizeSensitiveLabel(header)) || personHeader(header);
  const resolvedHeader = header => isSensitiveTableHeader(header) || personHeader(header);
  const src = String(text || '');
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  const rows = src.split('\n');
  const headersByLine = new Map();
  const ambiguousSensitiveLines = new Set();
  for (let index = 1; index + 1 < rows.length; index++) {
    const separator = splitTableRow(rows[index]);
    if (!separator || !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    const immediate = splitTableRow(rows[index - 1]);
    if (!immediate) continue;
    if (immediate.length !== separator.length) {
      const precedingRows = [];
      for (let distance = 1; index >= distance; distance++) {
        const preceding = splitTableRow(rows[index - distance]);
        if (!preceding) break;
        if (preceding.every((cell) => /^:?-{3,}:?$/u.test(cell))) break;
        precedingRows.unshift(preceding);
      }
      if (precedingRows.flat().some((header) =>
        isSensitiveTableHeader(header) || sensitiveFragment(header))) {
        let unsafeRow = index + 1;
        while (unsafeRow < rows.length && splitTableRow(rows[unsafeRow])) {
          ambiguousSensitiveLines.add(unsafeRow++);
        }
        index = unsafeRow - 1;
      }
      continue;
    }
    let headers = immediate.map(normalizeSensitiveLabel);
    const headerBlock = [];
    let headerCursor = index - 1;
    while (headerCursor >= 0) {
      const preceding = splitTableRow(rows[headerCursor]);
      if (!preceding) break;
      if (preceding.every((cell) => /^:?-{3,}:?$/u.test(cell))) break;
      headerBlock.unshift(preceding);
      headerCursor--;
    }
    const mismatchedHeaderWidth = headerBlock.some((row) => row.length !== immediate.length);
    const candidates = [];
    for (let candidate = headerBlock.length - 1; candidate >= 0 && candidates.length < 3; candidate--) {
      if (headerBlock[candidate].length !== immediate.length) break;
      candidates.unshift(headerBlock[candidate]);
    }
    // Resolve every column independently. Different Word table columns may
    // need different reconstruction depths (for example API/Key beside
    // Benutzer/name); selecting one global depth would silently miss one.
    headers = headers.map((header, column) => {
      if (resolvedHeader(header)) return header;
      for (let count = 2; count <= candidates.length; count++) {
        const combined = normalizeSensitiveLabel(
          candidates.slice(-count).map((row) => row[column]).join(' ')
        );
        if (resolvedHeader(combined)) return combined;
      }
      return header;
    });
    const cleaned = headers.map(header=>effectiveTableFieldLabel(header,personFieldPolicy));
    const resolvedSensitiveColumns = cleaned.map(header => isResolvedSensitiveTableHeader(header, personFieldPolicy));
    const hasSensitiveHeader = resolvedSensitiveColumns.some(Boolean);
    const headerHasSensitiveFragment = hasCredentialHeaderFragmentSequence(headerBlock) || headerBlock
      .flat()
      .some(sensitiveFragment);
    // Resolve ambiguity per column. A lone, separator-width header cannot be
    // a fragmented compound. In a real multi-row header, however, one valid
    // sensitive column must never mask an unresolved neighbour.
    const unresolvedSensitiveHeader = headerBlock.length > 1 && resolvedSensitiveColumns
      .some((resolved, column) => !resolved && (
        hasCredentialHeaderFragmentSequenceAtColumn(headerBlock, column) ||
        headerBlock.some((header) =>
          sensitiveFragment(header[column] || ''))
      ));
    const overlongSensitiveHeader = (headerBlock.length > 3 && headerHasSensitiveFragment) ||
      (mismatchedHeaderWidth && headerHasSensitiveFragment);
    let row = index + 1;
    while (row < rows.length) {
      const cells = splitTableRow(rows[row]);
      if (!cells) break;
      if (unresolvedSensitiveHeader || overlongSensitiveHeader ||
          (hasSensitiveHeader && cells.length !== immediate.length)) {
        ambiguousSensitiveLines.add(row);
      } else if (cells.length === immediate.length) {
        headersByLine.set(row, cleaned);
      }
      row++;
    }
    index = row - 1;
  }
  return { starts, rows, headersByLine, ambiguousSensitiveLines };
}

function tableAnalysis(text, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  personFieldPattern(personFieldPolicy);
  const src = String(text || '');
  if (tableIndexText !== src || tableIndexPolicy !== personFieldPolicy) {
    tableIndex = buildTableIndex(src, personFieldPolicy);
    tableIndexText = src;
    tableIndexPolicy = personFieldPolicy;
  }
  return tableIndex;
}

function hasAmbiguousSensitiveTable(text, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  return tableAnalysis(text, personFieldPolicy).ambiguousSensitiveLines.size > 0;
}

function assertPersonFieldStructure(text, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  personFieldPattern(personFieldPolicy);
  if (personFieldPolicy === CONTENT_PERSON_FIELD_POLICY &&
      (hasAmbiguousSensitiveTable(text, personFieldPolicy) || hasAmbiguousSensitiveTable(identifierDetectionText(text), personFieldPolicy))) {
    throw Object.assign(new Error('Die Tabellenstruktur erlaubt keine sichere Zuordnung personenbezogener Felder.'), { code: 'RESIDUAL_PII' });
  }
}

function tableHeaderAt(text, index, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  const src = String(text || '');
  const resolved = tableHeadersAt(src, index, personFieldPolicy);
  if (!resolved) return null;
  const { line, lineStart, headers } = resolved;
  const offsetInLine = index - lineStart;
  const trimmedStart = line.length - line.trimStart().length;
  let column = 0;
  let escaped = false;
  let seenLeading = false;
  for (let i = trimmedStart; i < offsetInLine && i < line.length; i++) {
    const char = line[i];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      if (!seenLeading && i === trimmedStart) seenLeading = true;
      else column++;
    }
  }
  return column < headers.length ? headers[column] : null;
}

function tableHeadersAt(text, index, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  const src = String(text || '');
  tableAnalysis(src, personFieldPolicy);
  const { starts, rows, headersByLine } = tableIndex;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  const headers = headersByLine.get(lo);
  if (!headers) return null;
  return { headers, line: rows[lo], lineStart: starts[lo] };
}

function sameLineHasIban(text, index) {
  const s = String(text);
  const from = s.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  let to = s.indexOf('\n', index);
  if (to < 0) to = s.length;
  const line = s.slice(from, to);
  IBAN_RE.lastIndex = 0;
  return IBAN_RE.test(line);
}

module.exports = {
  NB,
  NA,
  UPPER,
  NAME_BODY,
  NAME_TOKEN,
  PERSON_LABEL,
  CAPS_TOKEN,
  ORG_SUFFIX,
  ORG_SUFFIX_TAIL_RE,
  COMPANY_RE,
  URL_RE,
  EMAIL_RE,
  CONTACT_URI_RE,
  PHONE_RE,
  PHONE_LABEL_RE,
  PHONE_LABEL_PATTERN,
  STRUCTURED_LABEL_VALUE_PATTERN,
  structuredLabelRole,
  structuredLabelSeparators,
  PHONE_LABEL_WINDOW,
  FRENCH_PHONE_RE,
  IBAN_RE,
  IBAN_SEPARATOR_CHARS,
  IBAN_SEPARATOR_TOKEN,
  BIC_RE,
  BIC_LABEL_RE,
  IP_RE,
  IPV6_RE,
  POSTAL_ADDRESS_RE,
  STREET_ADDRESS_RE,
  FRENCH_STREET_ADDRESS_RE,
  DATE_OF_BIRTH_RE,
  DATE_OF_BIRTH_LABEL_RE,
  VEHICLE_PLATE_RE,
  VEHICLE_PLATE_LABEL_RE,
  DE_TAX_RE,
  DE_TAX_LABEL_RE,
  DE_SV_RE,
  CREDIT_RE,
  LABELED_ID_RE,
  HONORIFICS,
  ROLE_WORDS,
  TECH_TERMS,
  ORG_ALLOW,
  normalizeText,
  identifierDetectionText,
  canonicalizeRenderedText,
  assertPrivacyTextCharacters,
  INVISIBLE_RE,
  normalizeSpaces,
  key,
  hashShort,
  escapeRegExp,
  escapeReplacement,
  replaceAllInsensitive,
  lines,
  orgAlias,
  isAllowedOrg,
  titleCase,
  isStopToken,
  looksName,
  looksSurname,
  luhnValid,
  hasLabelBefore,
  plausibleCalendarDate,
  tableHeaderAt,
  hasAmbiguousSensitiveTable,
  isResolvedSensitiveTableHeader,
  assertPersonFieldStructure,
  normalizeSensitiveLabel,
  effectiveTableFieldLabel,
  NAME_PARTICLE,
  NAME_PARTICLES,
  ID_LABEL_HEADER_RE,
  TABLE_ID_CELL_RE,
  CREDENTIAL_FIELD_RE,
  CREDENTIAL_LABEL_HEADER_RE,
  tableHeadersAt,
  sameLineHasIban
};
