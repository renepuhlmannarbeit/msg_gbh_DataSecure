'use strict';

// Pure, private projection of actual edits. No detector guesses, renderer
// offsets, free replacement strings or writes to a published package.
const crypto = require('node:crypto');
const { entityPlanFromTrace, replayTransformTrace, applyEdits } = require('../privacy/transform-plan');
const fail = () => Object.assign(Error('DOCUMENT_ENTITY_INVALID'), { code: 'DOCUMENT_ENTITY_INVALID' });
const normalize = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
function initialEntities(snapshot) {
  if (!snapshot.transform_trace || snapshot.transform_trace.complete !== true) return null;
  if (replayTransformTrace(snapshot.transform_trace) !== snapshot.markdown) throw fail();
  const plan = entityPlanFromTrace(snapshot.transform_trace);
  return plan.occurrences.map(row => ({ ...row, start: row.output_start, end: row.output_end,
    decision: 'default', current_kind: row.kind, disabled: false }));
}
function replacement(kind, original, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || !['person', 'organization'].includes(kind)) throw fail();
  const bytes = crypto.createHmac('sha256', key).update(`${kind}\0${normalize(original)}`).digest();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, buffer = 0, encoded = '';
  for (const byte of bytes) { buffer = buffer * 256 + byte; bits += 8;
    while (bits >= 5) { bits -= 5; encoded += alphabet[(buffer >>> bits) & 31]; buffer &= (1 << bits) - 1; } }
  if (bits) encoded += alphabet[(buffer << (5 - bits)) & 31];
  return `[${kind === 'person' ? 'PERSON' : 'UNTERNEHMEN'}_${encoded}]`;
}
function relocate(ranges, edits, disableOverlaps = false) {
  return ranges.flatMap(row => {
    const overlap = edits.some(edit => edit.start < row.end && row.start < edit.end);
    if (overlap) return disableOverlaps ? [{ ...row, disabled: true }] : [];
    const delta = edits.filter(edit => edit.end <= row.start).reduce((sum, edit) => sum + edit.replacement.length - (edit.end - edit.start), 0);
    return [{ ...row, start: row.start + delta, end: row.end + delta }];
  });
}
function applyEntityDecisions(text, entities, decisions, key, identities = new Map()) {
  if (!entities || !Array.isArray(decisions) || !decisions.length || decisions.length > 500 ||
      new Set(decisions.map(row => row?.entity_id)).size !== decisions.length) throw fail();
  const edits = [], choices = new Map();
  for (const choice of decisions) {
    if (!choice || Object.keys(choice).sort().join(',') !== 'decision,entity_id' ||
        !/^entity_[0-9]{6}$/u.test(choice.entity_id || '') || !['default', 'keep', 'person', 'organization'].includes(choice.decision)) throw fail();
    const rows = entities.filter(row => row.entity_id === choice.entity_id);
    if (!rows.length || rows.some(row => row.disabled)) throw fail();
    choices.set(choice.entity_id, choice.decision);
    for (const row of rows) {
      const next = choice.decision === 'default' ? row.replacement : choice.decision === 'keep' ? row.original : replacement(choice.decision,
        identities.get(row.entity_id) || row.review_identity_key || row.identity_key || row.identity || row.original, key);
      edits.push({ start: row.start, end: row.end, original: text.slice(row.start, row.end), replacement: next,
        kind: choice.decision === 'person' ? 'PERSON' : choice.decision === 'organization' ? 'ORGANIZATION' : row.kind,
        occurrence_id: row.occurrence_id });
    }
  }
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  const markdown = applyEdits(text, edits), updated = entities.map(row => {
    const edit = edits.find(edit => edit.occurrence_id === row.occurrence_id);
    if (!edit) return relocate([row], edits, true)[0];
    const delta = edits.filter(other => other.end <= edit.start).reduce((sum, other) => sum + other.replacement.length - (other.end - other.start), 0);
    const decision = choices.get(row.entity_id);
    return { ...row, ...(identities.has(row.entity_id) ? { review_identity_key: identities.get(row.entity_id) } : {}),
      start: edit.start + delta, end: edit.start + delta + edit.replacement.length, decision,
      current_kind: decision === 'person' ? 'PERSON' : decision === 'organization' ? 'ORGANIZATION' : row.kind };
  });
  return { markdown, entities: updated, edits };
}
module.exports = { initialEntities, applyEntityDecisions, relocate, normalize };
