'use strict';

const EVENT_FIELDS = Object.freeze({
  selection_summarized: ['selected_count', 'total_bytes', 'direct_count', 'convertible_count', 'blocked_count', 'encrypted_count'],
  batch_started: ['selected_count'],
  progress_changed: ['selected_count', 'completed_count', 'review_count', 'failed_count'],
  review_required: ['selected_count', 'completed_count', 'review_count', 'failed_count'],
  batch_completed: ['selected_count', 'completed_count', 'failed_count', 'results_available'],
  batch_stopped: ['selected_count', 'completed_count', 'review_count', 'failed_count', 'can_resume']
});

const REQUIRED_FIELDS = Object.freeze({
  selection_summarized: EVENT_FIELDS.selection_summarized,
  batch_started: ['selected_count'],
  progress_changed: ['selected_count', 'completed_count', 'review_count', 'failed_count'],
  review_required: ['selected_count', 'completed_count', 'review_count', 'failed_count'],
  batch_completed: ['selected_count', 'completed_count', 'failed_count', 'results_available'],
  batch_stopped: ['selected_count', 'completed_count', 'review_count', 'failed_count', 'can_resume']
});

function invalidValue() {
  throw Object.assign(new Error('Ungültiger UI-Zähler.'), { code: 'UI_VALUE_INVALID' });
}

function validateInvariants(type, projected) {
  const selected = projected.selected_count;
  if (!Number.isSafeInteger(selected) || selected < 1) invalidValue();
  const completed = projected.completed_count || 0;
  const review = projected.review_count || 0;
  const failed = projected.failed_count || 0;
  if (completed + review + failed > selected) invalidValue();
  if (type === 'review_required' && review < 1) invalidValue();
  if (type === 'batch_completed') {
    if (completed + failed !== selected || projected.results_available !== (completed > 0)) invalidValue();
  }
  if (type === 'batch_stopped' && projected.can_resume === false && review > 0) invalidValue();
}

function projectUiEvent(type, internal = {}) {
  const fields = EVENT_FIELDS[type];
  if (!fields) throw Object.assign(new Error('Unbekanntes UI-Ereignis.'), { code: 'UI_EVENT_INVALID' });
  if (REQUIRED_FIELDS[type].some((field) => !Object.hasOwn(internal, field))) invalidValue();
  const projected = { schema: 'datasecure-standalone-ui-event/1', type };
  for (const field of fields) {
    if (!Object.hasOwn(internal, field)) continue;
    const value = internal[field];
    if (field === 'total_bytes') {
      if (!Number.isSafeInteger(value) || value < 0 || value > 500 * 1024 * 1024)
        throw Object.assign(new Error('Ungültiger UI-Zähler.'), { code: 'UI_VALUE_INVALID' });
    } else if (field.endsWith('_count')) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 100)
        throw Object.assign(new Error('Ungültiger UI-Zähler.'), { code: 'UI_VALUE_INVALID' });
    } else if (typeof value !== 'boolean') {
      throw Object.assign(new Error('Ungültiger UI-Wahrheitswert.'), { code: 'UI_VALUE_INVALID' });
    }
    projected[field] = value;
  }
  validateInvariants(type, projected);
  return Object.freeze(projected);
}

module.exports = { EVENT_FIELDS, REQUIRED_FIELDS, projectUiEvent };
