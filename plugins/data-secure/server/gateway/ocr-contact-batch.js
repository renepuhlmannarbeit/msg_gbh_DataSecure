'use strict';

// Standalone-only gateway adapter. Never normalise UTF-16 text/offsets, group contacts
// by spelling, or pass these private source labels to the main renderer.
const { buildContactDraft, validateContactDraft, validateContactAnswer } = require('../core/ocr-contact-review');
const { MAX_REVIEW_CHARS } = require('../core/local-review-model');
const invalid = () => Object.assign(new Error('Die OCR-Prüfgruppe konnte nicht sicher zugeordnet werden.'), { code: 'OCR_CONTACT_REVIEW_INVALID' });

function buildContactBatch(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 200) throw invalid();
  let text = '';
  const contacts = [], documents = [], bindings = [];
  const mode = entries[0].input.processing_mode;
  for (const [index, entry] of entries.entries()) {
    const individual = buildContactDraft(entry.input);
    if (entry.input.processing_mode !== mode) throw invalid();
    text += `\n\n===== Dokument ${index + 1} =====\n\n`;
    const offset = text.length;
    text += individual.original_text;
    if (text.length > MAX_REVIEW_CHARS) throw Object.assign(invalid(), { code: 'LOCAL_REVIEW_TOO_LARGE' });
    const ids = [];
    for (const candidate of individual.ambiguities) {
      const id = `ocr-contact:v1:${String(contacts.length + 1).padStart(6, '0')}`;
      ids.push(id);
      bindings.push({ globalId: id, localId: candidate.ambiguity_id, document: index });
      contacts.push({ start: offset + candidate.original_start, end: offset + candidate.original_end,
        page: candidate.page, line: candidate.line, kind: candidate.contact_kind,
        ...(candidate.image ? { image: candidate.image } : {}) });
    }
    documents.push({ document_index: index + 1, source_label: entry.source_label, candidate_ids: ids });
  }
  const draft = buildContactDraft({ original_text: text, contacts, source_type: 'pdf',
    ...(mode ? { processing_mode: mode } : {}) });
  draft.contact_batch = { schema: 'datasecure-ocr-contact-batch/1', documents };
  validateContactDraft(draft);
  if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > 40 * 1024 * 1024)
    throw Object.assign(invalid(), { code: 'LOCAL_REVIEW_TOO_LARGE' });
  return { draft, entries, bindings };
}

function resolveContactBatch(bundle, answer) {
  const validated = validateContactAnswer(answer, bundle.draft);
  if (validated.action !== 'reviewed') return { action: validated.action, answers: [] };
  const choices = new Map(validated.decisions.map(choice => [choice.ambiguity_id, choice]));
  const answers = bundle.entries.map(() => ({ action: 'reviewed', redactions: [], decisions: [] }));
  for (const binding of bundle.bindings) {
    const choice = choices.get(binding.globalId);
    if (!choice || !answers[binding.document]) throw invalid();
    answers[binding.document].decisions.push({ ...choice, ambiguity_id: binding.localId });
  }
  // Validate ALL complete per-source answers before the first durable write.
  answers.forEach((value, index) => validateContactAnswer(value, buildContactDraft(bundle.entries[index].input)));
  return { action: 'reviewed', answers };
}

module.exports = { buildContactBatch, resolveContactBatch };
