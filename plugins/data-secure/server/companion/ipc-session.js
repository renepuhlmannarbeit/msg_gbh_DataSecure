'use strict';

const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { createJob, transitionJob, jobStatus } = require('./job-store');
const { purgeCompanionJobs } = require('./retention');
const { pickSource, pickSources, validateSelectedPath } = require('./file-picker');
const { processCompanionJob } = require('./processor');
const { LIMITS } = require('../gateway/common');

const IPC_VERSION = 'data-secure-companion-ipc/1';
const COMMANDS = new Set(['capabilities', 'pick_source', 'pick_sources', 'process_source', 'cancel_job', 'purge_jobs']);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...expected].sort().join(',')
  );
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function validSecret(secret) {
  const value = Buffer.isBuffer(secret) ? secret : Buffer.from(secret || '');
  if (value.length !== 32) throw new SafeError('Companion-Session-Key muss genau 256 Bit haben.');
  return Buffer.from(value);
}

function unsignedFrame(frame) {
  return {
    session_id: frame.session_id,
    sequence: frame.sequence,
    command: frame.command,
    params: frame.params
  };
}

function frameMac(secret, frame) {
  return crypto.createHmac('sha256', validSecret(secret)).update(canonical(unsignedFrame(frame))).digest('hex');
}

function signFrame(secret, frame) {
  const unsigned = unsignedFrame(frame);
  return { ...unsigned, mac: frameMac(secret, unsigned) };
}

function safeEqualHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(String(left || '')) || !/^[0-9a-f]{64}$/i.test(String(right || ''))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function response(result) {
  const encoded = JSON.stringify(result);
  if (/sourcePath|source_path|filename|original_path/i.test(encoded)) {
    throw new SafeError('Companion-Antwort verletzt die Rohdatengrenze.');
  }
  return result;
}

function createCompanionSession(options = {}) {
  const secret = validSecret(options.secret || crypto.randomBytes(32));
  const sessionId = options.sessionId || crypto.randomUUID();
  const selectSource = options.pickSource || pickSource;
  const selectSources = options.pickSources || (options.pickSource
    ? (pickerOptions) => [options.pickSource(pickerOptions)]
    : pickSources);
  const processSource = options.processCompanionJob || processCompanionJob;
  const sources = new Map();
  let nextSequence = 1;

  function descriptor() {
    return {
      ipc_version: IPC_VERSION,
      session_id: sessionId,
      transport: 'inherited_stdio',
      network_listener: false,
      authenticated_frames: true,
      model_authority: false
    };
  }

  function verify(frame) {
    if (!exactKeys(frame, ['session_id', 'sequence', 'command', 'params', 'mac'])) {
      throw new SafeError('Ungültiger Companion-IPC-Frame.');
    }
    if (frame.session_id !== sessionId || frame.sequence !== nextSequence || !COMMANDS.has(frame.command)) {
      throw new SafeError('Companion-IPC-Frame ist nicht für diese Session gültig.');
    }
    if (!exactKeys(frame.params, Object.keys(frame.params || {}))) {
      throw new SafeError('Ungültige Companion-IPC-Parameter.');
    }
    if (!safeEqualHex(frame.mac, frameMac(secret, frame))) {
      throw new SafeError('Companion-IPC-Authentifizierung fehlgeschlagen.');
    }
    nextSequence++;
  }

  function localAction() {
    return { action_id: crypto.randomUUID(), channel: 'local_companion' };
  }

  function dispatch(frame) {
    verify(frame);
    if (frame.command === 'capabilities') {
      if (!exactKeys(frame.params, [])) throw new SafeError('Capabilities akzeptiert keine Parameter.');
      return response(descriptor());
    }
    if (frame.command === 'pick_source' || frame.command === 'pick_sources') {
      const validShape = exactKeys(frame.params, ['profile']) || exactKeys(frame.params, ['profile', 'remove_images']);
      if (
        !validShape || !PROFILES.has(frame.params.profile) ||
        (Object.hasOwn(frame.params, 'remove_images') && frame.params.remove_images !== true)
      ) {
        throw new SafeError('Ungültiges Profil für die lokale Dateiauswahl.');
      }
      const adapterResult = frame.command === 'pick_sources'
        ? selectSources({ allowedTypes: ['txt', 'md', 'csv', 'docx'] })
        : [selectSource({ allowedTypes: ['txt', 'md', 'csv', 'docx'] })];
      if (!Array.isArray(adapterResult) || !adapterResult.length || adapterResult.length > LIMITS.MAX_BATCH_FILES) {
        throw new SafeError('Der lokale Dateidialog lieferte keine gültige Dateiauswahl.');
      }
      const selectedItems = adapterResult.map((selectedByAdapter) => {
        if (!exactKeys(selectedByAdapter, ['sourcePath', 'sourceType', 'sourceBytes'])) {
          throw new SafeError('Der lokale Dateidialog lieferte ein ungültiges Ergebnis.');
        }
        const selected = validateSelectedPath(selectedByAdapter.sourcePath, { allowedTypes: ['txt', 'md', 'csv', 'docx'] });
        if (
          selected.sourceType !== selectedByAdapter.sourceType ||
          selected.sourceBytes !== selectedByAdapter.sourceBytes
        ) {
          throw new SafeError('Eine ausgewählte Datei wurde während der Übergabe verändert.');
        }
        return selected;
      });
      if (selectedItems.reduce((sum, item) => sum + item.sourceBytes, 0) > LIMITS.MAX_BATCH_TOTAL_BYTES) {
        throw new SafeError('Die ausgewählten Dateien sind zusammen größer als 500 MB.');
      }
      const jobs = selectedItems.map((selected, index) => {
        const job = createJob({ profile: frame.params.profile, source_type: selected.sourceType });
        sources.set(job.job_id, {
          path: selected.sourcePath,
          removeImages: frame.params.remove_images === true,
          automaticBatchApproval: true,
          batchIndex: index + 1,
          batchTotal: selectedItems.length
        });
        return job;
      });
      return response(frame.command === 'pick_source'
        ? { ok: true, job: jobs[0] }
        : { ok: true, jobs, selected_count: jobs.length });
    }
    if (frame.command === 'process_source') {
      if (!exactKeys(frame.params, ['job_id'])) {
        throw new SafeError('Verarbeitung benötigt genau eine Job-ID.');
      }
      const selected = sources.get(frame.params.job_id);
      if (!selected) throw new SafeError('Für diesen Job ist keine private Quelle gebunden.');
      const profile = jobStatus(frame.params.job_id).profile;
      return Promise.resolve(processSource(frame.params.job_id, selected.path, profile, {
        removeImages: selected.removeImages,
        automaticBatchApproval: selected.automaticBatchApproval === true,
        batchIndex: selected.batchIndex,
        batchTotal: selected.batchTotal
      })).then((result) => {
        if (result?.ok) sources.delete(frame.params.job_id);
        return response(result);
      });
    }
    if (frame.command === 'cancel_job') {
      if (!exactKeys(frame.params, ['job_id'])) throw new SafeError('Abbruch benötigt genau eine Job-ID.');
      const job = transitionJob(frame.params.job_id, 'Cancelled', { human_action: localAction() });
      sources.delete(frame.params.job_id);
      return response({ ok: true, job });
    }
    if (frame.command === 'purge_jobs') {
      if (!exactKeys(frame.params, [])) throw new SafeError('Löschen akzeptiert keine Parameter.');
      sources.clear();
      return response(purgeCompanionJobs(localAction()));
    }
    throw new SafeError('Unbekannter Companion-Befehl.');
  }

  return { descriptor, dispatch, hasPrivateSource: (jobId) => sources.has(jobId) };
}

module.exports = {
  IPC_VERSION,
  canonical,
  frameMac,
  signFrame,
  createCompanionSession
};
