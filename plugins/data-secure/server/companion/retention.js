'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError, dataRoot } = require('../runtime');
const { retentionDays } = require('../gateway/retention');
const { validateHumanAction } = require('./job-store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT = /^\d{6}\.json$/;
let lastCleanup = {
  ran_at: null,
  trigger: null,
  retention_days: null,
  forced: false,
  removed: 0,
  errors: 0,
  error_codes: {}
};

function nowMs(value) {
  const at = value instanceof Date ? value.valueOf() : value === undefined ? Date.now() : Number(value);
  if (!Number.isFinite(at)) throw new SafeError('Ungültiger Retention-Zeitpunkt.');
  return at;
}

function rootPath(options = {}) {
  return options.root || path.join(dataRoot(), 'companion-jobs');
}

function safeRoot(options = {}) {
  const root = rootPath(options);
  let stat;
  try {
    stat = (options.fs || fs).lstatSync(root);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new SafeError('Companion-Jobbereich ist nicht sicher verfügbar.');
  }
  return root;
}

function codeFor(error) {
  const candidate = String(error?.code || '').toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,31}$/.test(candidate) ? candidate : 'UNSAFE_JOB_ENTRY';
}

function directJobs(options = {}) {
  const fsApi = options.fs || fs;
  const failures = [];
  let root;
  try {
    root = safeRoot(options);
  } catch (error) {
    failures.push(error);
    return { root: rootPath(options), jobs: [], failures };
  }
  if (!root) return { root: rootPath(options), jobs: [], failures: [] };
  const jobs = [];
  let entries;
  try {
    entries = fsApi.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    failures.push(error);
    return { root, jobs, failures };
  }
  for (const entry of entries) {
    if (!UUID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
      const error = new Error('Unsafe companion job entry');
      error.code = 'UNSAFE_JOB_ENTRY';
      failures.push(error);
      continue;
    }
    jobs.push(path.join(root, entry.name));
  }
  return { root, jobs, failures };
}

function expired(dir, cutoff, fsApi = fs) {
  const stat = fsApi.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    const error = new Error('Unsafe companion job directory');
    error.code = 'UNSAFE_JOB_TYPE';
    throw error;
  }
  return stat.mtimeMs <= cutoff;
}

function removeJob(dir, root, fsApi = fs) {
  if (path.dirname(dir) !== root || !UUID.test(path.basename(dir))) {
    const error = new Error('Unsafe companion job target');
    error.code = 'UNSAFE_JOB_TARGET';
    throw error;
  }
  const stat = fsApi.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    const error = new Error('Unsafe companion job directory');
    error.code = 'UNSAFE_JOB_TYPE';
    throw error;
  }
  const files = fsApi.readdirSync(dir, { withFileTypes: true });
  for (const entry of files) {
    if (!EVENT.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      const error = new Error('Unsafe companion journal entry');
      error.code = 'UNSAFE_JOURNAL_ENTRY';
      throw error;
    }
  }
  for (const entry of files) fsApi.unlinkSync(path.join(dir, entry.name));
  fsApi.rmdirSync(dir);
}

function cleanupCompanionJobs(options = {}) {
  const fsApi = options.fs || fs;
  const at = nowMs(options.now);
  const days = options.retentionDays ?? retentionDays();
  const cutoff = at - days * 24 * 60 * 60 * 1000;
  const forced = options.force === true;
  const result = {
    ran_at: new Date(at).toISOString(),
    trigger: options.trigger || (forced ? 'local_purge' : 'retention'),
    retention_days: days,
    forced,
    removed: 0,
    errors: 0,
    error_codes: {}
  };
  const listing = directJobs(options);
  const failure = (error) => {
    result.errors++;
    const code = codeFor(error);
    result.error_codes[code] = (result.error_codes[code] || 0) + 1;
  };
  for (const error of listing.failures) failure(error);
  for (const dir of listing.jobs) {
    try {
      if (!forced && !expired(dir, cutoff, fsApi)) continue;
      removeJob(dir, listing.root, fsApi);
      result.removed++;
    } catch (error) {
      failure(error);
    }
  }
  lastCleanup = result;
  return result;
}

function companionRetentionStatus(options = {}) {
  const fsApi = options.fs || fs;
  const at = nowMs(options.now);
  const days = options.retentionDays ?? retentionDays();
  const cutoff = at - days * 24 * 60 * 60 * 1000;
  const listing = directJobs(options);
  let due = 0;
  let errors = listing.failures.length;
  for (const dir of listing.jobs) {
    try {
      if (expired(dir, cutoff, fsApi)) due++;
    } catch {
      errors++;
    }
  }
  return { retention_days: days, due_jobs: due, inspection_errors: errors, last_cleanup: lastCleanup };
}

function purgeCompanionJobs(humanAction, options = {}) {
  validateHumanAction(humanAction);
  const result = cleanupCompanionJobs({ ...options, force: true, trigger: 'local_purge' });
  return { ok: result.errors === 0, removed: result.removed, errors: result.errors };
}

module.exports = {
  cleanupCompanionJobs,
  companionRetentionStatus,
  purgeCompanionJobs
};
