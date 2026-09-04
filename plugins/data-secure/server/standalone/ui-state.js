'use strict';

const STATES = Object.freeze(['select', 'confirm', 'processing', 'review', 'result', 'stopped']);
const EVENTS = new Set([
  'selection_summarized', 'batch_started', 'progress_changed',
  'review_required', 'batch_completed', 'batch_stopped'
]);

function requiredInteger(value, minimum = 0, maximum = 100) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw Object.assign(new Error('Ungültiger UI-Zähler.'), { code: 'UI_VALUE_INVALID' });
  }
  return value;
}

function initialUiState() {
  return Object.freeze({
    view: 'select', selected_count: 0, completed_count: 0,
    review_count: 0, failed_count: 0, can_pause: false,
    can_resume: false, results_available: false
  });
}

function transitionUiState(current, event) {
  if (!current || !STATES.includes(current.view)) throw Object.assign(new Error('Ungültiger UI-Zustand.'), { code: 'UI_STATE_INVALID' });
  if (!event || !EVENTS.has(event.type)) throw Object.assign(new Error('Unbekanntes UI-Ereignis.'), { code: 'UI_EVENT_INVALID' });

  switch (event.type) {
    case 'selection_summarized': {
      const selected = requiredInteger(event.selected_count, 1);
      if (current.view !== 'select') break;
      return Object.freeze({ ...initialUiState(), view: 'confirm', selected_count: selected });
    }
    case 'batch_started': {
      const selected = requiredInteger(event.selected_count, 1);
      if (current.view !== 'confirm' || selected !== current.selected_count) break;
      return Object.freeze({ ...current, view: 'processing', can_pause: false });
    }
    case 'progress_changed': {
      const selected = requiredInteger(event.selected_count, 1);
      const completed = requiredInteger(event.completed_count);
      const review = requiredInteger(event.review_count);
      const failed = requiredInteger(event.failed_count);
      if (current.view !== 'processing' || selected !== current.selected_count ||
          completed < current.completed_count || failed < current.failed_count ||
          completed + review + failed > selected) break;
      return Object.freeze({ ...current, completed_count: completed, failed_count: failed });
    }
    case 'review_required': {
      const selected = requiredInteger(event.selected_count, 1);
      const completed = requiredInteger(event.completed_count);
      const review = requiredInteger(event.review_count, 1);
      const failed = requiredInteger(event.failed_count);
      if (current.view !== 'processing' || selected !== current.selected_count ||
          completed < current.completed_count || failed < current.failed_count ||
          completed + review + failed > selected) break;
      return Object.freeze({ ...current, view: 'review', review_count: review, can_pause: false });
    }
    case 'batch_completed': {
      const selected = requiredInteger(event.selected_count, 1);
      const completed = requiredInteger(event.completed_count);
      const failed = requiredInteger(event.failed_count);
      if (!['processing', 'review'].includes(current.view) || selected !== current.selected_count ||
          completed < current.completed_count || failed < current.failed_count || completed + failed !== selected ||
          event.results_available !== (completed > 0)) break;
      return Object.freeze({ ...current, view: 'result', completed_count: completed,
        review_count: 0, failed_count: failed, can_pause: false, can_resume: false,
        results_available: completed > 0 });
    }
    case 'batch_stopped': {
      const selected = requiredInteger(event.selected_count, 1);
      const completed = requiredInteger(event.completed_count);
      const review = requiredInteger(event.review_count);
      const failed = requiredInteger(event.failed_count);
      if (!['processing', 'review'].includes(current.view) || selected !== current.selected_count ||
          completed < current.completed_count || failed < current.failed_count ||
          completed + review + failed > selected || typeof event.can_resume !== 'boolean') break;
      return Object.freeze({ ...current, view: 'stopped', completed_count: completed,
        review_count: review, failed_count: failed, can_pause: false, can_resume: event.can_resume,
        results_available: completed > 0 });
    }
    default:
      break;
  }
  throw Object.assign(new Error('UI-Übergang nicht erlaubt.'), { code: 'UI_TRANSITION_INVALID' });
}

module.exports = { STATES, initialUiState, transitionUiState };
