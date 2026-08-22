'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');
const { PROFILES, listInput, sha256File, storageStatus } = require('./common');
const { anonymizeNext } = require('./orchestrator');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const BATCH_TTL_MS = 30 * 60 * 1000;
const active = new Set();

function batchRoot() {
  const root = path.join(dataRoot(), 'batches');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function batchPath(token) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
  return path.join(batchRoot(), `${token}.json`);
}

function writeState(state) {
  const target = batchPath(state.token);
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
}

function readState(token) {
  const target = batchPath(token);
  let state;
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe');
    state = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    throw new SafeError('Batch-Sitzung wurde nicht gefunden oder ist ungültig. Bitte den Eingang erneut bestätigen.');
  }
  if (state.token !== token || state.schema !== 'datasecure-batch/1') {
    throw new SafeError('Batch-Sitzung ist ungültig. Bitte den Eingang erneut bestätigen.');
  }
  if (Date.now() > Date.parse(state.expires_at)) {
    try { fs.unlinkSync(target); } catch { /* fail closed below */ }
    throw new SafeError('Batch-Sitzung ist abgelaufen. Bitte den Eingang erneut bestätigen.');
  }
  return state;
}

function publicProgress(state) {
  const released = state.items.filter((item) => item.status === 'released').length;
  const stopped = state.items.filter((item) => item.status === 'stopped').length;
  const remaining = state.items.filter((item) => item.status === 'pending').length;
  return {
    batch_token: state.token,
    batch_total: state.items.length,
    attempted: released + stopped,
    released,
    stopped,
    remaining,
    complete: remaining === 0
  };
}

function beginBatch(options = {}) {
  if (!storageStatus().safe) throw new SafeError('Der konfigurierte Datenschutzordner ist für die lokale Verarbeitung nicht freigegeben.');
  const expected = Number(options.expectedCount);
  if (!Number.isInteger(expected) || expected < 1 || expected > 25) {
    throw new SafeError('Bestätigte Dateianzahl muss zwischen 1 und 25 liegen.');
  }
  const queue = listInput();
  if (queue.length === 0) {
    return { ok: false, error: 'input_empty', input_documents_seen: 0, raw_content_sent_to_claude: false };
  }
  if (queue.length !== expected) {
    return {
      ok: false,
      error: 'input_count_changed',
      expected_documents: expected,
      input_documents_seen: queue.length,
      raw_content_sent_to_claude: false
    };
  }
  const profile = String(options.profile || 'auto').toLowerCase();
  if (!PROFILES.has(profile)) throw new SafeError('Unbekanntes Profil.');
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const state = {
    schema: 'datasecure-batch/1',
    token,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + BATCH_TTL_MS).toISOString(),
    profile,
    remove_images: options.removeImages === true,
    items: queue.map((entry) => ({
      name: entry.name,
      size: entry.stat.size,
      mtime_ms: entry.stat.mtimeMs,
      sha256: sha256File(entry.full),
      status: 'pending'
    }))
  };
  writeState(state);
  return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
}

function exactPendingEntry(state, item) {
  const queue = listInput();
  const expected = state.items.filter((candidate) => candidate.status !== 'released');
  if (queue.length !== expected.length) {
    throw new SafeError('Der bestätigte Dateistapel wurde verändert. Der Lauf wurde vor der nächsten Datei gestoppt.');
  }
  const byName = new Map(queue.map((candidate) => [candidate.name, candidate]));
  for (const candidate of expected) {
    const current = byName.get(candidate.name);
    if (!current || current.stat.size !== candidate.size || current.stat.mtimeMs !== candidate.mtime_ms ||
        sha256File(current.full) !== candidate.sha256) {
      throw new SafeError('Der bestätigte Dateistapel wurde verändert. Der Lauf wurde vor der nächsten Datei gestoppt.');
    }
  }
  const entry = byName.get(item.name);
  if (!entry || entry.stat.size !== item.size || entry.stat.mtimeMs !== item.mtime_ms ||
      sha256File(entry.full) !== item.sha256) {
    throw new SafeError('Der bestätigte Dateistapel wurde verändert. Der Lauf wurde vor der nächsten Datei gestoppt.');
  }
  return entry;
}

async function processBatchNext(token, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  active.add(token);
  try {
    const state = readState(token);
    if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
    const item = state.items.find((candidate) => candidate.status === 'pending');
    if (!item) return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    let entry;
    try {
      entry = exactPendingEntry(state, item);
    } catch (error) {
      state.invalidated = true;
      for (const pending of state.items) if (pending.status === 'pending') pending.status = 'stopped';
      writeState(state);
      return {
        ok: false,
        error: 'batch_snapshot_changed',
        message: error instanceof SafeError ? error.message : 'Der bestätigte Dateistapel wurde verändert.',
        ...publicProgress(state),
        raw_content_sent_to_claude: false
      };
    }
    // Persist the attempt before touching the source. After a crash, startup
    // recovery converts this state to stopped rather than silently retrying it.
    item.status = 'processing';
    writeState(state);
    try {
      const result = await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        removeImages: state.remove_images
      });
      item.status = 'released';
      writeState(state);
      return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      item.status = 'stopped';
      writeState(state);
      return {
        ok: false,
        error: error && error.code ? error.code : 'processing_stopped',
        message: error instanceof SafeError
          ? error.message
          : 'Die lokale Verarbeitung wurde sicher gestoppt. Es wurde kein Paket freigegeben.',
        ...publicProgress(state),
        raw_content_sent_to_claude: false
      };
    }
  } finally {
    active.delete(token);
  }
}

function recoverBatches(options = {}) {
  const now = Number(options.now || Date.now());
  let recovered = 0;
  let removed = 0;
  let failures = 0;
  let entries = [];
  try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); } catch { return { recovered, removed, failures: 1 }; }
  for (const entry of entries) {
    if (!entry.isFile() || !TOKEN_RE.test(entry.name.replace(/\.json$/, '')) || !entry.name.endsWith('.json')) continue;
    const target = path.join(batchRoot(), entry.name);
    try {
      const state = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (now > Date.parse(state.expires_at)) {
        fs.unlinkSync(target);
        removed++;
        continue;
      }
      let changed = false;
      for (const item of state.items || []) {
        if (item.status === 'processing') {
          item.status = 'stopped';
          changed = true;
          recovered++;
        }
      }
      if (changed) writeState(state);
    } catch { failures++; }
  }
  return { recovered, removed, failures };
}

module.exports = { beginBatch, processBatchNext, recoverBatches, _test: { batchRoot, readState, publicProgress } };
