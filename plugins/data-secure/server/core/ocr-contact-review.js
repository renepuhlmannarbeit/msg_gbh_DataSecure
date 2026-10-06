'use strict';

// Standalone-private, pre-privacy OCR confirmation. No lexical repairs, no
// detector exemptions and no transmission through the content-free main UI.
const { exactKeys } = require('./source-extraction-contract');
const MAX_CONTACTS = 400; // 400 bounded UTF-8 replacements fit the 1 MiB answer frame.
const MAX_VALUE_CHARS = 256;
const MAP_KEYS = ['start', 'end', 'page', 'line', 'kind'];
const KINDS = new Set(['email', 'phone', 'contact']);
const { validateContactImage, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_IMAGE_PIXELS } = require('./ocr-contact-image');
const failure = (code = 'OCR_CONTACT_REVIEW_INVALID') => Object.assign(
  new Error('Die lokale OCR-Kontaktprüfung konnte nicht sicher bestätigt werden.'), { code });

function validateContacts(contacts, text, sourceType) {
  if (!Array.isArray(contacts) || contacts.length > 5000 || typeof text !== 'string' ||
      !['pdf', 'png', 'jpeg', 'bmp'].includes(sourceType)) throw failure();
  let end = 0, imageBytes = 0, imagePixels = 0;
  for (const item of contacts) {
    if (!exactKeys(item, Object.hasOwn(item || {}, 'image') ? [...MAP_KEYS, 'image'] : MAP_KEYS) || !KINDS.has(item.kind) ||
        !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || item.start < end ||
        item.end <= item.start || item.end > text.length ||
        !Number.isSafeInteger(item.page) || item.page < 1 ||
        !Number.isSafeInteger(item.line) || item.line < 1 || /[\r\n]/u.test(text.slice(item.start, item.end))) throw failure();
    if (Object.hasOwn(item, 'image')) {
      imageBytes += validateContactImage(item.image);
      imagePixels += item.image.width * item.image.height;
    }
    if (imageBytes > MAX_TOTAL_IMAGE_BYTES || imagePixels > MAX_TOTAL_IMAGE_PIXELS) throw failure();
    end = item.end;
  }
  return contacts;
}

function contactSpans(text, quality, page = 1, offset = 0) {
  const result = [];
  let start = 0;
  // Keep UTF-16 source offsets across LF, CRLF and CR; quality scoring uses
  // all three as line boundaries too. Never normalise the source text here.
  const lines = [...text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/gu)].filter(match => match[0].length);
  for (const [index, matchLine] of lines.entries()) {
    const line = matchLine[1];
    start = matchLine.index;
    if (quality.contact_lines.includes(index + 1)) {
      const matches = [...line.matchAll(/[^\s<>()[\]{},;:]+@[^\s<>()[\]{},;:]+/gu)]
        .map(match => ({ index: match.index, value: match[0], kind: 'email' }));
      for (const match of line.matchAll(/\+\d[\d ()./-]{6,}\d/gu)) {
        if (!matches.some(email => match.index < email.index + email.value.length && match.index + match[0].length > email.index))
          matches.push({ index: match.index, value: match[0], kind: 'phone' });
      }
      // Every labelled section needs its own decision. A correctly shaped
      // telephone must not hide a broken email on the same OCR line (or vice
      // versa); retain exact offsets and stop at the next explicit label.
      const labels = [...line.matchAll(/\b(e[ -]?mail|kontakt|contact|telefon|tel\.?|phone|mobil(?:telefon)?|fax)\s*[:=]\s*/giu)];
      for (const [labelIndex, label] of labels.entries()) {
        const from = label.index + label[0].length, to = labels[labelIndex + 1]?.index ?? line.length;
        const value = line.slice(from, to).trim().replace(/[;,]+$/u, '').trimEnd();
        const index = from + line.slice(from, to).indexOf(value);
        const kind = /mail/iu.test(label[1]) ? 'email' : /kontakt|contact/iu.test(label[1]) ? 'contact' : 'phone';
        if (!value || matches.some(item => item.index >= index && item.index + item.value.length <= index + value.length &&
          (kind === 'contact' || item.kind === kind))) continue;
        // A mismatched shape in this section is represented by the labelled
        // corridor, not overlapping duplicate candidates.
        for (let cursor = matches.length - 1; cursor >= 0; cursor--) {
          const item = matches[cursor];
          if (item.index < index + value.length && item.index + item.value.length > index) matches.splice(cursor, 1);
        }
        matches.push({ index, value, kind });
      }
      // Malformed contact shapes (for example punctuation around a broken
      // address) still need a visible decision, never an empty warning map.
      if (!matches.length && line.trim()) matches.push({ index: line.indexOf(line.trim()), value: line.trim(), kind: 'contact' });
      for (const match of matches.sort((left, right) => left.index - right.index)) {
        if (!match.value) continue;
        result.push({ start: offset + start + match.index, end: offset + start + match.index + match.value.length,
          page, line: index + 1, kind: match.kind });
      }
    }
  }
  return result;
}

function buildContactDraft(input) {
  validateContacts(input.contacts, input.original_text, input.source_type);
  if (Object.hasOwn(input, 'processing_mode') && input.processing_mode !== 'markdown-only') throw failure();
  if (!input.contacts.length || input.contacts.length > MAX_CONTACTS) throw failure('LOCAL_REVIEW_TOO_LARGE');
  return { schema: 'data-secure-text-review/3', original_text: input.original_text,
    anonymized_text: input.original_text, locators: [], decision_groups: [],
    ocr_contact_review: true, batch_index: 1, batch_total: 1, allow_defer: true,
    ...(input.processing_mode === 'markdown-only' ? { processing_mode: 'markdown-only' } : {}),
    ambiguities: input.contacts.map((item, index) => ({ ambiguity_id: `ocr-contact:v1:${String(index + 1).padStart(6, '0')}`,
      type: 'ocr_contact_ambiguous', original_start: item.start, original_end: item.end,
      anonymized_start: item.start, anonymized_end: item.end, page: item.page, line: item.line, contact_kind: item.kind,
      ...(item.image ? { image: item.image } : {}) })) };
}

function validReplacement(value, kind) {
  // No newline/Markdown structure, source marker or invisible control may be
  // injected. This checks shape only, NEVER the actual accuracy of an address.
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > MAX_VALUE_CHARS ||
      /[\p{Cc}\p{Cf}\p{Cs}\[\]`<>|]/u.test(value)) return false;
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
  if (kind === 'phone') return /^\+?[\d ()./-]{6,}$/u.test(value) && /\d/u.test(value);
  return kind === 'contact';
}

function validateContactDraft(draft) {
  const keys = ['schema', 'original_text', 'anonymized_text', 'locators', 'decision_groups',
    'ocr_contact_review', 'batch_index', 'batch_total', 'allow_defer', 'ambiguities'];
  if (!exactKeys(draft, Object.hasOwn(draft || {}, 'processing_mode') ? [...keys, 'processing_mode'] : keys) ||
      (Object.hasOwn(draft, 'processing_mode') && draft.processing_mode !== 'markdown-only') ||
      draft.schema !== 'data-secure-text-review/3' || draft.ocr_contact_review !== true || draft.allow_defer !== true ||
      typeof draft.original_text !== 'string' || draft.original_text !== draft.anonymized_text ||
      draft.batch_index !== 1 || draft.batch_total !== 1 || !Array.isArray(draft.locators) || draft.locators.length ||
      !Array.isArray(draft.decision_groups) || draft.decision_groups.length ||
      !Array.isArray(draft.ambiguities) || !draft.ambiguities.length || draft.ambiguities.length > MAX_CONTACTS) throw failure();
  const contacts = draft.ambiguities.map((item, index) => {
    const keys = ['ambiguity_id', 'type', 'original_start', 'original_end', 'anonymized_start', 'anonymized_end', 'page', 'line', 'contact_kind'];
    if (!exactKeys(item, item && Object.hasOwn(item, 'image') ? [...keys, 'image'] : keys) ||
        item.type !== 'ocr_contact_ambiguous' || item.ambiguity_id !== `ocr-contact:v1:${String(index + 1).padStart(6, '0')}` ||
        item.anonymized_start !== item.original_start || item.anonymized_end !== item.original_end) throw failure();
    return { start: item.original_start, end: item.original_end, page: item.page, line: item.line, kind: item.contact_kind,
      ...(item.image ? { image: item.image } : {}) };
  });
  validateContacts(contacts, draft.original_text, 'pdf');
  return draft;
}

function validateContactAnswer(answer, draft) {
  validateContactDraft(draft);
  if (exactKeys(answer, ['action']) && ['deferred', 'cancelled'].includes(answer.action)) return { action: answer.action };
  if (!exactKeys(answer, ['action', 'redactions', 'decisions']) || answer.action !== 'reviewed' ||
      !Array.isArray(answer.redactions) || answer.redactions.length || !Array.isArray(answer.decisions) ||
      answer.decisions.length !== draft.ambiguities.length || Buffer.byteLength(JSON.stringify(answer), 'utf8') > 900 * 1024) throw failure();
  const candidates = new Map(draft.ambiguities.map(item => [item.ambiguity_id, item]));
  const seen = new Set();
  const decisions = answer.decisions.map(choice => {
    const candidate = candidates.get(choice?.ambiguity_id);
    const correcting = choice?.decision === 'correct_contact';
    if (!candidate || seen.has(choice.ambiguity_id) || candidate.type !== 'ocr_contact_ambiguous' ||
        !exactKeys(choice, correcting ? ['ambiguity_id', 'decision', 'replacement'] : ['ambiguity_id', 'decision']) ||
        (!correcting && choice.decision !== 'confirm_contact') ||
        (correcting && !validReplacement(choice.replacement, candidate.contact_kind))) throw failure();
    seen.add(choice.ambiguity_id);
    return { ...choice };
  });
  return { action: 'reviewed', redactions: [], decisions };
}

function applyContactAnswer(input, answer) {
  const draft = buildContactDraft(input), validated = validateContactAnswer(answer, draft);
  if (validated.action !== 'reviewed') throw failure('LOCAL_REVIEW_DEFERRED');
  const choices = new Map(validated.decisions.map(choice => [choice.ambiguity_id, choice]));
  let text = input.original_text;
  for (const candidate of [...draft.ambiguities].reverse()) {
    const choice = choices.get(candidate.ambiguity_id);
    if (choice.decision === 'correct_contact') text = text.slice(0, candidate.original_start) + choice.replacement + text.slice(candidate.original_end);
  }
  return text;
}

module.exports = { MAX_CONTACTS, MAX_VALUE_CHARS, validateContacts, contactSpans,
  buildContactDraft, validReplacement, validateContactDraft, validateContactAnswer, applyContactAnswer };
