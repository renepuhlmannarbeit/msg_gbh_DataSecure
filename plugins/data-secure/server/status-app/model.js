'use strict';

const SCHEMA = 'datasecure-status-card/v1';
const STATES = Object.freeze(['local_start_confirmed', 'selection_cancelled', 'start_blocked', 'engine_unavailable', 'already_running', 'unavailable']);
const KEYS = ['locale', 'schema', 'snapshot', 'state'];

function snapshot(state = 'unavailable', locale = 'de') {
  return Object.freeze({ schema: SCHEMA, locale: locale === 'en' ? 'en' : 'de', state, snapshot: true });
}

// This is a projection of the public start response, never of a document, journal,
// diagnostic record or worker message. No free text or identifiers cross this boundary.
function projectStartResult(result, locale = 'de') {
  let state = 'unavailable';
  if (result && typeof result === 'object' && !Array.isArray(result) && result.raw_content_sent_to_claude === false) {
    if (result.ok === true && result.mode === 'local_only' && result.local_intake_pending === true && result.local_processing_started === true && result.next_action === 'local_processing_running_without_claude') state = 'local_start_confirmed';
    else if (result.ok === false && result.local_processing_started === false) {
      if (result.error === 'local_selection_cancelled' && result.next_action === 'no_action') state = 'selection_cancelled';
      else if (result.error === 'local_start_failed' && result.next_action === 'restart_only_on_explicit_request') state = 'start_blocked';
      else if (result.error === 'local_engine_unavailable' && result.next_action === 'restart_only_on_explicit_request') state = 'engine_unavailable';
    } else if (result.ok === false && result.error === 'batch_active' && result.local_processing_started === true && result.next_action === 'wait_for_local_release_before_retry') state = 'already_running';
  }
  return snapshot(state, locale);
}

function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).sort().join('|') === KEYS.join('|') && value.schema === SCHEMA && value.snapshot === true && ['de', 'en'].includes(value.locale) && STATES.includes(value.state);
}

module.exports = { SCHEMA, STATES, snapshot, projectStartResult, validateSnapshot };
