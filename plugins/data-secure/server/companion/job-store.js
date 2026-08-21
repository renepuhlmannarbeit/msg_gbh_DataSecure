'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');

const API_VERSION = 'data-secure-companion/1';
const JOB_SCHEMA = 'data-secure-job-event/1';
const STATES = Object.freeze([
  'Created',
  'Claimed',
  'Extracted',
  'Detected',
  'Reviewed',
  'Skipped',
  'Verified',
  'Released',
  'Failed',
  'Cancelled'
]);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const SOURCE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'png', 'jpeg', 'bmp']);
const TERMINAL = new Set(['Released', 'Failed', 'Cancelled']);
const NEXT = Object.freeze({
  Created: new Set(['Claimed', 'Failed', 'Cancelled']),
  Claimed: new Set(['Extracted', 'Failed', 'Cancelled']),
  Extracted: new Set(['Detected', 'Failed', 'Cancelled']),
  Detected: new Set(['Reviewed', 'Skipped', 'Failed', 'Cancelled']),
  Reviewed: new Set(['Verified', 'Failed', 'Cancelled']),
  Skipped: new Set(['Verified', 'Failed', 'Cancelled']),
  Verified: new Set(['Released', 'Failed', 'Cancelled']),
  Released: new Set(),
  Failed: new Set(),
  Cancelled: new Set()
});

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

function timestamp(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(date.valueOf())) throw new SafeError('Ungültiger Job-Zeitpunkt.');
  return date.toISOString();
}

function jobsRoot() {
  const root = path.join(dataRoot(), 'companion-jobs');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new SafeError('Companion-Jobbereich ist nicht sicher verfügbar.');
  }
  return root;
}

function safeJobDir(jobId, { mustExist = true } = {}) {
  if (!isUuid(jobId)) throw new SafeError('Ungültige Job-ID.');
  const dir = path.join(jobsRoot(), jobId);
  if (mustExist) {
    let stat;
    try {
      stat = fs.lstatSync(dir);
    } catch {
      throw new SafeError('Companion-Job nicht gefunden.');
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new SafeError('Companion-Jobbereich wurde verändert.');
    }
  }
  return dir;
}

function validateHumanAction(value, contentRequired = false) {
  const keys = contentRequired ? 'action_id,channel,content_sha256' : 'action_id,channel';
  if (
    !value ||
    value.channel !== 'local_companion' ||
    !isUuid(value.action_id) ||
    Object.keys(value).sort().join(',') !== keys ||
    (contentRequired && !/^[0-9a-f]{64}$/i.test(String(value.content_sha256 || '')))
  ) {
    throw new SafeError('Review, Überspringen oder Abbruch benötigt eine lokale Nutzeraktion.');
  }
  return {
    action_id: value.action_id,
    channel: 'local_companion',
    ...(contentRequired ? { content_sha256: value.content_sha256.toLowerCase() } : {})
  };
}

function verification(value) {
  if (
    !value ||
    value.claim !== 'supported_checks_no_further_findings' ||
    !['heterogeneous', 'limited_claim'].includes(value.verifier_mode) ||
    Object.keys(value).sort().join(',') !== 'claim,verifier_mode'
  ) {
    throw new SafeError('Verifikationsnachweis ist unvollständig.');
  }
  return {
    claim: 'supported_checks_no_further_findings',
    verifier_mode: value.verifier_mode
  };
}

function canonicalEvent(input) {
  if (!input || input.schema !== JOB_SCHEMA || !isUuid(input.job_id)) {
    throw new SafeError('Ungültiges Companion-Jobereignis.');
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 1 || !STATES.includes(input.state)) {
    throw new SafeError('Ungültiger Companion-Jobzustand.');
  }
  const event = {
    schema: JOB_SCHEMA,
    job_id: input.job_id,
    sequence: input.sequence,
    state: input.state,
    at: timestamp(input.at)
  };
  if (input.state === 'Created') {
    if (!PROFILES.has(input.profile) || !SOURCE_TYPES.has(input.source_type)) {
      throw new SafeError('Ungültiger Companion-Jobtyp.');
    }
    event.profile = input.profile;
    event.source_type = input.source_type;
  } else if (['Reviewed', 'Skipped', 'Cancelled'].includes(input.state)) {
    event.human_action = validateHumanAction(input.human_action, input.state !== 'Cancelled');
  } else if (input.state === 'Verified') {
    event.verification = verification(input.verification);
  } else if (input.state === 'Released') {
    if (!/^[0-9a-f]{64}$/i.test(String(input.output_sha256 || ''))) {
      throw new SafeError('Release benötigt einen gültigen Output-Integritätshash.');
    }
    event.output_sha256 = input.output_sha256.toLowerCase();
  } else if (input.state === 'Failed') {
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(String(input.error_code || ''))) {
      throw new SafeError('Fehlerereignis benötigt einen datensparsamen Fehlercode.');
    }
    event.error_code = input.error_code;
  }
  if (JSON.stringify(input) !== JSON.stringify(event)) {
    throw new SafeError('Companion-Jobereignis enthält nicht erlaubte Felder.');
  }
  return event;
}

function eventFile(dir, sequence) {
  return path.join(dir, `${String(sequence).padStart(6, '0')}.json`);
}

function appendEvent(dir, event) {
  const file = eventFile(dir, event.sequence);
  try {
    fs.writeFileSync(file, JSON.stringify(event, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
  } catch {
    throw new SafeError('Companion-Jobzustand konnte nicht atomar fortgeschrieben werden.');
  }
}

function readEvents(jobId) {
  const dir = safeJobDir(jobId);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (!entries.length) throw new SafeError('Companion-Jobjournal ist leer.');
  const events = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^\d{6}\.json$/.test(entry.name)) {
      throw new SafeError('Companion-Jobjournal enthält einen ungültigen Eintrag.');
    }
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    } catch {
      throw new SafeError('Companion-Jobjournal ist beschädigt.');
    }
    const event = canonicalEvent(raw);
    if (event.job_id !== jobId || event.sequence !== events.length + 1) {
      throw new SafeError('Companion-Jobjournal ist nicht lückenlos.');
    }
    if (events.length) {
      const previous = events[events.length - 1].state;
      if (!NEXT[previous].has(event.state)) {
        throw new SafeError('Companion-Jobjournal enthält einen unzulässigen Zustandswechsel.');
      }
    } else if (event.state !== 'Created') {
      throw new SafeError('Companion-Jobjournal beginnt nicht mit Created.');
    }
    events.push(event);
  }
  return events;
}

function createJob(input = {}) {
  const { profile = 'auto', source_type: sourceType, now } = input;
  if (Object.keys(input).some((key) => !['profile', 'source_type', 'now'].includes(key))) {
    throw new SafeError('Companion-Job darf keine Rohdatenfelder enthalten.');
  }
  if (!PROFILES.has(profile) || !SOURCE_TYPES.has(sourceType)) {
    throw new SafeError('Profil oder Dateityp wird vom Companion-Vertrag nicht unterstützt.');
  }
  const jobId = crypto.randomUUID();
  const dir = safeJobDir(jobId, { mustExist: false });
  fs.mkdirSync(dir, { recursive: false, mode: 0o700 });
  const event = canonicalEvent({
    schema: JOB_SCHEMA,
    job_id: jobId,
    sequence: 1,
    state: 'Created',
    at: timestamp(now),
    profile,
    source_type: sourceType
  });
  appendEvent(dir, event);
  return jobStatus(jobId);
}

function transitionJob(jobId, state, evidence = {}, { now } = {}) {
  if (!STATES.includes(state) || state === 'Created') throw new SafeError('Unbekannter Zielzustand.');
  const evidenceKey = {
    Reviewed: 'human_action',
    Skipped: 'human_action',
    Cancelled: 'human_action',
    Verified: 'verification',
    Released: 'output_sha256',
    Failed: 'error_code'
  }[state];
  const allowedEvidence = evidenceKey ? [evidenceKey] : [];
  if (
    !evidence ||
    typeof evidence !== 'object' ||
    Array.isArray(evidence) ||
    Object.keys(evidence).some((key) => !allowedEvidence.includes(key))
  ) {
    throw new SafeError('Zustandswechsel enthält nicht erlaubte Evidenzfelder.');
  }
  const events = readEvents(jobId);
  const previous = events[events.length - 1];
  if (TERMINAL.has(previous.state) || !NEXT[previous.state].has(state)) {
    throw new SafeError(`Unzulässiger Jobwechsel ${previous.state} -> ${state}.`);
  }
  const event = canonicalEvent({
    schema: JOB_SCHEMA,
    job_id: jobId,
    sequence: previous.sequence + 1,
    state,
    at: timestamp(now),
    ...(state === 'Reviewed' || state === 'Skipped' || state === 'Cancelled'
      ? { human_action: evidence.human_action }
      : {}),
    ...(state === 'Verified' ? { verification: evidence.verification } : {}),
    ...(state === 'Released' ? { output_sha256: evidence.output_sha256 } : {}),
    ...(state === 'Failed' ? { error_code: evidence.error_code } : {})
  });
  appendEvent(safeJobDir(jobId), event);
  return jobStatus(jobId);
}

function jobStatus(jobId) {
  const events = readEvents(jobId);
  const created = events[0];
  const current = events[events.length - 1];
  return {
    api_version: API_VERSION,
    job_id: jobId,
    state: current.state,
    sequence: current.sequence,
    created_at: created.at,
    updated_at: current.at,
    profile: created.profile,
    source_type: created.source_type,
    review_channel: 'local_companion_only',
    model_can_review: false,
    model_can_release: false,
    raw_content_available: false
  };
}

function companionCapabilities() {
  return {
    api_version: API_VERSION,
    job_schema: JOB_SCHEMA,
    phase: 'txt_docx_vertical_slice_ready',
    supported_states: [...STATES],
    local_ui: process.platform === 'win32'
      ? 'native_picker_and_redaction_review'
      : 'native_picker_text_review_unavailable',
    supported_vertical_slice_inputs: ['TXT', 'DOCX'],
    private_ipc: 'inherited_stdio_authenticated',
    binary_signing: 'not_implemented',
    job_retention: 'integrated',
    review_channel: 'local_companion_only',
    model_can_review: false,
    model_can_release: false,
    raw_content_available: false
  };
}

module.exports = {
  API_VERSION,
  JOB_SCHEMA,
  STATES,
  companionCapabilities,
  jobsRoot,
  validateHumanAction,
  createJob,
  transitionJob,
  jobStatus,
  readEvents
};
