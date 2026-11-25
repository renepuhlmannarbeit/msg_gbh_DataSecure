'use strict';
const { LEGACY_PERSON_FIELD_POLICY, personFieldContextForConsumer, personFieldPattern } = require('../core/person-field-policy');

const {
  NAME_TOKEN,
  CAPS_TOKEN,
  NAME_PARTICLE,
  normalizeText,
  normalizeSpaces,
  looksName,
  titleCase,
  key,
  orgAlias,
  ORG_SUFFIX_TAIL_RE,
  isAllowedOrg,
  CREDENTIAL_LABEL_HEADER_RE,
  ID_LABEL_HEADER_RE
} = require('./base');
const { PERSON_LABEL, collectPersonAnchors, collectPersonSeeds, collectOrganizations, hasAbstractNounShape,
  capitalisedRuns } = require('./entities');
const { findStructuredSpans } = require('./structured');
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
// Standalone only (RC178 review R-033). Two bounded places where a name-shaped
// value is a candidate for the local review, as the attributions above are.
//
// A role in front of a colon or an equals sign ("Antragsteller: Hans Müller").
// Only a value that is shaped like a name counts: "Patient: stabil" and
// "Mieter: ja" stay as they are. That is the difference to a person field,
// whose whole value is replaced and whose words then count as that person in
// the rest of the document. The name ends at the line end, at punctuation, in
// front of a lower-case word or in front of the next label on the same line
// ("Mieter: Anna Sommer Adresse: …", also behind a tab from a table row).
// Markdown from Office escapes brackets, so "\(m/w/d\)" is read as well.
const ROLE_CUE = '(?:Antragsteller|Antragsgegner|Patient|Versicherte[rn]?|Versicherungsnehmer|Mandant|Klient|Mieter|Untermieter|Hauptmieter' +
  '|Vermieter|Käufer|Verkäufer|Arbeitnehmer|Bewohner|Bevollmächtigte[rn]?|Erziehungsberechtigte[rn]?|Angehörige[rn]?|Zeug(?:e|in)' +
  '|Kläger|Beklagte[rn]?|Beschuldigte[rn]?|Geschädigte[rn]?|Unfallgegner|Schuldner|Gläubiger|Bürg(?:e|in)|Erb(?:e|in)|Erblasser' +
  '|Begünstigte[rn]?|Zahlungsempfänger|Leistungsempfänger|Halter|Fahrer|Inhaber|Kontoinhaber|Geschäftsführer|Vorgesetzte[rn]?' +
  '|Projektleiter|Teamleiter|(?:(?:Behandelnde[rn]?|Überweisende[rn]?)[ \\t]+)?(?:Arzt|Ärztin)|Haus(?:arzt|ärztin)|Fach(?:arzt|ärztin)' +
  '|Therapeut|Gutachter|Rechtsanwalt|Rechtsanwältin|Anwalt|Anwältin|Notar|Betroffene[rn]?|Beschwerdeführer|Anrufer|Ansprechperson' +
  '|Bezugsperson|Betreuungsperson|Pflegekraft|Proband|Notfallkontakt|Ehepartner|Ehemann|Ehefrau|Lebensgefährt(?:e|in)|Sohn|Tochter' +
  '|Mutter|Vater|Applicant|Tenant|Landlord|Policyholder|Insured|Claimant|Employee|Guardian|Witness|Plaintiff|Defendant|Spouse|Physician)';
const ROLE_NAME_RE = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])(?:${ROLE_CUE})(?:in)?(?:[/*:_]in)?(?:[ \\t]*\\\\?\\(m/w/d\\\\?\\))?(?:[ \\t]+(?:zu[ \\t]+)?\\d{1,2})?(?:\\*\\*|__)?[ \\t]*[:=](?:\\*\\*|__)?[ \\t]*` +
    `(?:(?:Herrn?|Frau)[ \\t]+)?(${NAME_SHAPE})(?=[ \\t]*(?:$|[,;.(|–—\\\\]|-[ \\t])|[ \\t]+\\p{Ll}|[ \\t]+\\p{Lu}[\\p{L}\\p{M}./-]{1,40}[ \\t]*[:=])`,
  'gmu'
);
// A person label, a role or a list cue alone on its line, followed by list
// items that are names ("Teilnehmer:" / "- Anna Sommer"). The label names what
// the items are; without it a list of two capitalised words is not a list of
// people ("Themen:" / "- Neue Projekte").
const NAME_LIST_CUE = '(?:Anwesende?|Abwesende?|Entschuldigte?|Teilnehmende|Teilnehmerliste|Unterzeichnende|Attendees|Participants|Present|Absent)';
const LIST_MARK = '^[ \\t]*(?:\\\\?[-*+•]|\\d{1,3}\\\\?[.)])[ \\t]+';
const LIST_ITEM_RE = new RegExp(`${LIST_MARK}\\S`, 'u');
// The name of an item ends at the line end or at punctuation; the backslash
// is the escape in front of a bracket or a dash in Markdown from Office.
const NAME_LIST_ITEM_RE = new RegExp(`${LIST_MARK}(${NAME_SHAPE})(?=[ \\t]*(?:$|[,;:(–—\\\\]|-[ \\t]))`, 'u');
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
const ISOLATED_NAME_LINE_RE = new RegExp(`^(${NAME_SHAPE})[ \\t]*$`, 'u');
const OFFICE_OCR_AUTOSAVE_RE = /^(?:Automatisches[ \t]+Speichern|AutoSave)[ \t]+.{1,180}?[ \t]+[-–—][ \t]+(?:Gespeichert|Saved)[ \t]+[vV∨▾▼⌄˅][ \t]+/iu;
const OFFICE_OCR_PROFILE_NAME_RE = new RegExp(`^(${NAME_SHAPE})(?=$|[ \\t,;:])`, 'u');
const OFFICE_OCR_CONTROL_SUFFIX_RE = /[ \t]+(?:Sortierung|Sortieren|Filtern|Freigeben|Kommentare?)(?=$|[ \t,;:])/iu;

function proseBody(line, options = {}) {
  const source = String(line || '');
  const leading = source.match(/^[ \t]*(?:(?:[-*+]|\d+[.)]|>)[ \t]+)?/u)?.[0]?.length || 0;
  const body = source.slice(leading);
  if (!body || /^(?:#{1,6}[ \t]|```|~~~)/u.test(body) || body.includes('|') ||
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

function sourceLiteralSpans(source, value) {
  if (!value) return [];
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '[ \\t]+');
  return [...source.matchAll(new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, 'giu'))]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}

function protectedEvidenceRanges(source, profile, personFieldPolicy = LEGACY_PERSON_FIELD_POLICY) {
  return [...findStructuredSpans(source),
    ...collectOrganizations(source).flatMap(value => {
      const alias = orgAlias(value);
      // Match the engine's bounded legal-company evidence. Reserving its
      // already proven short form as optional prose would hide it from the
      // engine while the independent dictionary gate correctly still rejects it.
      const distinctive = /\s/u.test(alias) || /^(?=.*[A-ZÄÖÜ])[A-ZÄÖÜ0-9&.+\-]{3,}$/u.test(alias);
      const values = ORG_SUFFIX_TAIL_RE.test(value) && alias.length >= 5 && alias !== value && distinctive && !isAllowedOrg(alias)
        ? [value, alias] : [value];
      return values.flatMap(literal => sourceLiteralSpans(source, literal));
    }),
    ...collectPersonAnchors(source, profile, personFieldPolicy).filter(seed => ['label', 'honorific', 'credential_holder'].includes(seed.confidence))
      .flatMap(seed => sourceLiteralSpans(source, seed.matchValue || seed.value))];
}

function disjointCandidates(source, candidates) {
  const disjoint = [];
  for (const candidate of [...candidates].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = disjoint.at(-1);
    // Crossing hypotheses must not corrupt a reservation or be arbitrarily
    // discarded. Their connected source interval needs one exact human choice.
    if (previous && candidate.start < previous.end) {
      previous.end = Math.max(previous.end, candidate.end);
      previous.value = source.slice(previous.start, previous.end);
      if (!candidate.further) delete previous.further;
    } else disjoint.push({ ...candidate });
  }
  return disjoint;
}

// Standalone can ask a local human before an uncertain presentation becomes a
// persistent PERSON alias. Neither two capitalised words nor a table header is
// identity evidence. Keep exact source coordinates; no blanket term allowlist.
function standalonePresentationCandidateSpans(text, profile = 'personnel_profile', options = {}) {
  const { policy: personFieldPolicy } = personFieldContextForConsumer(options);
  const source = String(text);
  const anchors = collectPersonAnchors(source, profile, personFieldPolicy);
  const explicit = new Set(anchors.filter(seed => ['label', 'honorific', 'credential_holder'].includes(seed.confidence))
    .map(seed => key(seed.value)));
  const evidenceRanges = protectedEvidenceRanges(source, profile, personFieldPolicy);
  const candidates = [];
  const seen = new Set();
  let uppercaseRuns = null;
  const contactPresentationRange = (range) => {
    // Keep the complete, bounded, source-contiguous typographic run together.
    // Masking just its trailing two-word contact window can expose a new weak
    // prefix ("NATIVE TEXT ON DAMAGED [PERSON_...]") after the user's decision.
    // No generated text, punctuation, adjacent line or inferred surname is
    // added. The range remains one uncertain occurrence, not a new identity.
    uppercaseRuns ||= capitalisedRuns(source).filter(run => run.every(token =>
      /\p{Lu}/u.test(token.text) && !/\p{Ll}/u.test(token.text)))
      .map(run => ({ start: run[0].start, end: run.at(-1).end }))
      .filter(run => run.end - run.start <= 120);
    let low = 0, high = uppercaseRuns.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (uppercaseRuns[middle].start <= range.start) low = middle + 1; else high = middle;
    }
    const run = uppercaseRuns[low - 1];
    return run && range.start >= run.start && range.end <= run.end ? run : range;
  };
  const add = (start, end) => {
    const value = source.slice(start, end);
    if (!value || explicit.has(key(value)) || evidenceRanges.some(range => start < range.end && range.start < end)) return;
    const coordinates = `${start}:${end}`;
    if (!seen.has(coordinates)) { seen.add(coordinates); candidates.push({ start, end, value }); }
  };
  const uncertain = new Set(['caps_line', 'caps_dash', 'header_block', 'header_comma', 'header_particle',
    'header_tab', 'cjk_header', 'profile_structure', 'markdown_structure', 'markdown_link_label', 'markdown_metadata']);
  for (const seed of collectPersonSeeds(source, profile, null, null, personFieldPolicy)) {
    // A nearby contact label can select a two-word window from a longer
    // all-caps caption ("... DAMAGED IMAGE PAGE - Kontakt ..."). This is still
    // a presentation hypothesis, not proof of a person or of its last word as
    // a batch-wide surname. Reserve the exact source occurrence before the
    // engine builds aliases. Explicit person fields/honorifics/holders remain
    // excluded by the independent evidence ranges above; mixed-case contact
    // names and the default/Cowork engine keep their existing behaviour.
    const uppercaseContactHypothesis = seed.confidence === 'context' &&
      /\p{Lu}/u.test(seed.value) && !/\p{Ll}/u.test(seed.value);
    if (!uncertain.has(seed.confidence) && !uppercaseContactHypothesis) continue;
    const value = seed.matchValue || seed.value;
    for (const sourceRange of sourceLiteralSpans(source, value)) {
      const range = uppercaseContactHypothesis ? contactPresentationRange(sourceRange) : sourceRange;
      add(range.start, range.end);
    }
  }
  // Native CSV/XLSX converters also produce single-column Markdown tables.
  // Inspect headers AND rows, without guessing column labels or decoding an
  // escaped cell into coordinates that no longer match the source.
  let lineStart = 0;
  const lines = source.split('\n');
  const personHeader = new RegExp(`^(?:${personFieldPattern(personFieldPolicy)}):?$`, 'iu');
  for (const [index, line] of lines.entries()) {
    const isHeader = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/u.test(lines[index + 1] || '');
    if (/^[ \t]*\|.*\|[ \t]*$/u.test(line) && !line.includes('\\')) {
      for (const match of line.matchAll(/(?<=\|)[^|]+(?=\|)/gu)) {
        const value = match[0].trim();
        if (isHeader && (CREDENTIAL_LABEL_HEADER_RE.test(value) || ID_LABEL_HEADER_RE.test(value) || personHeader.test(value))) continue;
        const words = normalizeSpaces(value).split(/\s+/u);
        const nameShaped = looksName(value) || (value === value.toLocaleUpperCase('de-DE') && looksName(titleCase(value)));
        if (words.length >= 2 && words.length <= 4 && value.length <= 160 && !/[\[\]]/u.test(value) && nameShaped) {
          const start = lineStart + match.index + match[0].indexOf(value);
          add(start, start + value.length);
        }
      }
    }
    lineStart += line.length + 1;
  }
  // A larger exact hypothesis owns nested alternatives; disjoint source
  // occurrences remain independent review decisions.
  return disjointCandidates(source, candidates);
}

// Up to four capitalised words are a name shape, and the next sentence or a
// field label begins with one ("Vermieter: Wohnbau Kassel Das Wetter …",
// "Zeuge: Hans Müller Telefon privat …"). From the third word on, such a word
// ends the name; taking it in would swallow text or hide the label of the
// number behind it.
const FOLLOWING_WORD_RE = /^(?:Der|Die|Das|Den|Dem|Ein|Eine|Er|Sie|Es|Wir|Ich|Am|Im|In|Bei|Mit|Nach|Seit|Heute|Gestern|Morgen|Telefon|Tel|Mobil|Handy|Fax|E-Mail|Email|Mail|Adresse|Anschrift|Geburtsdatum|IBAN|Nummer|Nr)$/u;
function withoutFollowingWords(value) {
  const tokens = [...value.matchAll(/[^ \t]+/gu)];
  for (let index = 2; index < tokens.length; index++)
    if (FOLLOWING_WORD_RE.test(tokens[index][0])) return value.slice(0, tokens[index].index).trimEnd();
  return value;
}

// A name-shaped value behind a role and a colon, anywhere in a line. The
// comma form "Müller, Hans" is left to the engine, which folds it onto a
// person it already knows; as a candidate it received a pseudonym of its own.
function roleLabelNameSpans(source) {
  const candidates = [];
  ROLE_NAME_RE.lastIndex = 0;
  let match;
  while ((match = ROLE_NAME_RE.exec(source))) {
    const start = match.index + match[0].length - match[1].length;
    const value = withoutFollowingWords(match[1]);
    if (!plausiblePerson(value)) continue;
    candidates.push({ start, end: start + value.length, value });
  }
  return candidates;
}

// List items under a line that is only a person label, a role or a list cue.
// At most one blank line may separate the label from the list and one item
// from the next; the first line that is no list item ends the list. An item
// that is no name ("- Müller (Protokoll)", "- Einkauf") stays as it is and
// does not end the list: the names below it are still names. Each item is its
// own candidate, and only its name; a field label in front of a colon is cut
// off ("- Anna Sommer Telefon: …"). A text file from Windows ends its lines
// with a carriage return, which is not part of the line here.
function labelledNameListSpans(source, personFieldPolicy) {
  const label = new RegExp(`^[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*|__)?(?:${personFieldPattern(personFieldPolicy)}|${NAME_LIST_CUE}|(?:${ROLE_CUE})(?:in|innen|n|en)?)(?:\\*\\*|__)?[ \\t]*:?(?:\\*\\*|__)?[ \\t]*$`, 'iu');
  const candidates = [];
  let lineStart = 0, open = false, blank = false;
  for (const raw of source.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (label.test(line)) { open = true; blank = false; }
    else if (open && !line.trim()) { if (blank) open = false; blank = true; }
    else if (open && !LIST_ITEM_RE.test(line)) open = false;
    else if (open) {
      blank = false;
      const item = NAME_LIST_ITEM_RE.exec(line);
      if (item) {
        const start = lineStart + item[0].length - item[1].length;
        const value = /^[ \t]*:/u.test(line.slice(start + item[1].length - lineStart)) ? withoutFollowingWords(item[1]) : item[1];
        if (plausiblePerson(value)) candidates.push({ start, end: start + value.length, value });
      }
    }
    lineStart += raw.length + 1;
  }
  return candidates;
}

function personProseCandidateSpans(text, options = {}) {
  const { policy: personFieldPolicy, consumerOptions } = personFieldContextForConsumer(options);
  const original = normalizeText(text);
  const hasStrongPersonAnchor = collectPersonAnchors(original, 'general', personFieldPolicy).length > 0;
  const candidates = [];
  let lineStart = 0;
  for (const line of original.split('\n')) {
    const parsed = proseBody(line, options);
    if (parsed) {
      // OCR can contain an isolated name or an account name from a captured
      // Office title bar. Reserve only the source span for the existing review.
      if (options.productChannel === 'standalone' && options.ocrLineReview === true) {
        const isolated = ISOLATED_NAME_LINE_RE.exec(parsed.body);
        if (isolated && normalizeSpaces(isolated[1]).split(/\s+/u).length === 2 && plausiblePerson(isolated[1])) {
          const start = lineStart + parsed.leading + isolated.index;
          candidates.push({ start, end: start + isolated[1].length, value: isolated[1] });
        }
        // Require the autosave control, save status and dropdown glyph. A
        // general mention of saving a file has no account-name semantics.
        const titleBar = OFFICE_OCR_AUTOSAVE_RE.exec(parsed.body);
        if (titleBar) {
          const account = parsed.body.slice(titleBar[0].length);
          const nextControl = OFFICE_OCR_CONTROL_SUFFIX_RE.exec(account);
          const beforeControl = nextControl && OFFICE_OCR_PROFILE_NAME_RE.exec(account.slice(0, nextControl.index))?.[1];
          const name = beforeControl || OFFICE_OCR_PROFILE_NAME_RE.exec(account)?.[1];
          if (name && plausiblePerson(name)) {
            const start = lineStart + parsed.leading + titleBar[0].length;
            candidates.push({ start, end: start + name.length, value: name });
          }
        }
      }
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
  if (options.productChannel === 'standalone') {
    candidates.push(...roleLabelNameSpans(original), ...labelledNameListSpans(original, personFieldPolicy));
    // A name that is a candidate at one place is the same name at its other
    // places in this document (RC178 review R-033). Without this the decision
    // replaced it at the cue, and in the next document of the batch, but left
    // it readable two lines further down. Exact spelling and case, full names
    // only; presentation hypotheses below keep their single occurrence.
    // At most 500 further places per document, counted over all names: the
    // local review takes a bounded number of findings, and a name on every
    // line of a long export must not turn the document into one that cannot
    // be reviewed at all. Beyond that the name stays where it stood before.
    // A further place is marked: where the engine has already replaced the
    // name on other evidence, there is nothing left to decide.
    const known = new Set(candidates.map(candidate => candidate.start));
    let further = 0;
    for (const value of new Set(candidates.map(candidate => candidate.value))) {
      if (further >= 500) break;
      if (!/[ \t]/u.test(value)) continue;
      for (const span of sourceLiteralSpans(original, value)) {
        if (further >= 500) break;
        if (known.has(span.start) || original.slice(span.start, span.end) !== value) continue;
        candidates.push({ start: span.start, end: span.end, value, further: true });
        further++;
      }
    }
    candidates.push(...standalonePresentationCandidateSpans(original, options.profile, consumerOptions));
    const ranges = protectedEvidenceRanges(original, options.profile, personFieldPolicy);
    const fields = require('./field-value-coverage');
    const fieldContexts = [...fields.protectedHeaderRanges(original,personFieldPolicy),
      ...fields.uncoveredFieldSpans(original,personFieldPolicy)].sort((left,right)=>left.start-right.start||left.end-right.end);
    // Actual closed field headers/values are not prose hypotheses. Reserving
    // them would hide field semantics during redaction and restore raw data
    // afterwards. This grants no Keep choice or exception: the ordinary
    // entity path, complete-field fallback and independent residual gate run.
    return disjointCandidates(original, candidates.filter(candidate =>
      !ranges.some(range => candidate.start < range.end && range.start < candidate.end) &&
      !fields.isWithinProtectedHeader(fieldContexts,candidate)));
  }
  return candidates.filter((candidate, index) => !candidates.some((other, otherIndex) =>
    (otherIndex < index && other.start === candidate.start && other.end === candidate.end) ||
    (other.start <= candidate.start && other.end >= candidate.end && other.end - other.start > candidate.end - candidate.start)));
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
        // A further place of a name the engine has replaced there on its own
        // evidence ("Hans Müller IBAN …") is decided. Only the place with
        // the cue has to be found again; without this the document stopped.
        if (candidate.further && sourceCopies.length !== outputCopies.length) continue;
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
    if (candidate.further && (options.residualPersonSpans || []).some(finding => finding.start < mapped.end && mapped.start < finding.end &&
        (finding.start < mapped.start || finding.end > mapped.end))) continue;
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

module.exports = { personProseCandidateSpans, personProseAmbiguities, standalonePresentationCandidateSpans };
