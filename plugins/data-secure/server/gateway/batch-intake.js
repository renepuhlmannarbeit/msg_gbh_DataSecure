'use strict';

function createBatchIntake(options = {}) {
  const SafeError = options.SafeError;
  const io = options.io;
  const path = options.path;
  const crypto = options.crypto;
  const profiles = options.profiles;
  const limits = options.limits;
  const listInput = options.listInput;
  const validateBatchLimits = options.validateBatchLimits;
  const storageStatus = options.storageStatus;
  const defaultHasReparseComponent = options.hasReparseComponent;
  const preflightOoxmlContainers = options.preflightOoxmlContainers;
  const assertStagingCapacity = options.assertStagingCapacity;
  const tokenPattern = options.tokenPattern;
  const batchPath = options.batchPath;
  const workPath = options.workPath;
  const copySnapshotFile = options.copySnapshotFile;
  const batchTtlMs = options.batchTtlMs;
  const createPrivateIoSummary = options.createPrivateIoSummary;
  const writeState = options.writeState;
  const readStateForMaintenance = options.readStateForMaintenance;
  const safeRemoveWorkDirectory = options.safeRemoveWorkDirectory;
  const publicProgress = options.publicProgress;
  const platform = options.platform || process.platform;

  function journalPublicationState(expected) {
    try {
      if (!io.existsSync(batchPath(expected.token))) return 'absent';
    } catch {
      return 'uncertain';
    }
    try {
      return JSON.stringify(readStateForMaintenance(expected.token)) === JSON.stringify(expected)
        ? 'matching'
        : 'uncertain';
    } catch {
      return 'uncertain';
    }
  }

  function validatedPickerQueue(entries, hasReparseComponent) {
    const seen = new Set();
    // Complete the envelope-only validation before reading metadata from any
    // source. The declared filename controls format preflight and therefore
    // must be the exact basename of its bound absolute path.
    const candidates = entries.map((entry) => {
      const full = path.resolve(String(entry?.full || ''));
      const name = String(entry?.name || '');
      if (!path.isAbsolute(full) || !name || path.basename(name) !== name || path.basename(full) !== name) {
        throw new SafeError('Die lokale Dateiauswahl ist ungültig.');
      }
      const identity = platform === 'win32' ? full.toLowerCase() : full;
      if (seen.has(identity)) throw new SafeError('Eine Datei wurde in der lokalen Auswahl mehrfach angegeben.');
      seen.add(identity);
      return { entry, full, name };
    });
    return candidates.map(({ entry, full, name }) => {
      if (hasReparseComponent(full)) {
        throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
      }
      let stat;
      try { stat = io.lstatSync(full); } catch { throw new SafeError('Eine ausgewählte Datei ist nicht mehr verfügbar.'); }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new SafeError('Eine ausgewählte Datei ist nicht regulär lokal verfügbar.');
      if (Number(entry?.sourceBytes) !== stat.size) throw new SafeError('Eine ausgewählte Datei wurde vor der Übernahme verändert.');
      return { name, full, stat };
    });
  }

  function beginBatch(beginOptions = {}) {
    if (!storageStatus().safe) throw new SafeError('Der konfigurierte Datenschutzordner ist für die lokale Verarbeitung nicht freigegeben.');
    const expected = Number(beginOptions.expectedCount);
    if (!Number.isInteger(expected) || expected < 1 || expected > limits.MAX_BATCH_FILES) {
      throw new SafeError(`Bestätigte Dateianzahl muss zwischen 1 und ${limits.MAX_BATCH_FILES} liegen.`);
    }
    const queue = Array.isArray(beginOptions.queue)
      ? validatedPickerQueue(beginOptions.queue, beginOptions.hasReparseComponent || defaultHasReparseComponent)
      : listInput();
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
    try { validateBatchLimits(queue); } catch (error) {
      if (error.message === 'BATCH_TOTAL_LIMIT') throw new SafeError('Der bestätigte Stapel ist größer als 500 MB.');
      if (error.message === 'INPUT_FORMAT_LIMIT') {
        throw new SafeError('Eine ausgewählte Datei überschreitet die sichere Einzeldateigrenze für ihr Format. Bitte teilen Sie diese Datei auf.');
      }
      throw new SafeError('Eine ausgewählte Datei liegt außerhalb der zulässigen Größe.');
    }
    if (typeof beginOptions.confirmStart === 'function') {
      const confirmed = beginOptions.confirmStart({
        selected_count: queue.length,
        total_bytes: queue.reduce((total, entry) => total + entry.stat.size, 0)
      });
      if (confirmed !== true) {
        return {
          ok: false,
          error: 'local_batch_start_cancelled',
          message: 'Die lokale Startbestätigung wurde abgebrochen. Es wurde kein Stapel begonnen.',
          user_status: 'Lokaler Start abgebrochen: Es wurde kein Stapel begonnen.',
          next_action: 'restart_only_on_request',
          input_documents_seen: queue.length,
          raw_content_sent_to_claude: false
        };
      }
    }
    preflightOoxmlContainers(queue);
    assertStagingCapacity(queue, beginOptions.statfs || io.statfsSync);
    const profile = String(beginOptions.profile || 'auto').toLowerCase();
    if (!profiles.has(profile)) throw new SafeError('Unbekanntes Profil.');
    const requestedToken = beginOptions.token;
    if (requestedToken !== undefined && !tokenPattern.test(String(requestedToken))) {
      throw new SafeError('Die lokale Batch-Sitzung ist ungültig.');
    }
    const token = requestedToken || crypto.randomBytes(32).toString('hex');
    if (io.existsSync(batchPath(token)) || io.existsSync(workPath(token))) {
      throw new SafeError('Die lokale Batch-Sitzung ist bereits belegt.');
    }
    const now = Date.now();
    const work = workPath(token);
    let state;
    try {
      io.mkdirSync(work, { recursive: false, mode: 0o700 });
      const items = queue.map((entry, index) => {
        const extension = path.extname(entry.name).toLowerCase();
        const workName = `${String(index + 1).padStart(3, '0')}_${crypto.randomBytes(12).toString('hex')}${extension}`;
        const copied = copySnapshotFile(entry.full, path.join(work, workName), entry.stat);
        return {
          id: crypto.randomBytes(16).toString('hex'),
          name: entry.name,
          size: copied.size,
          sha256: copied.sha256,
          work_name: workName,
          status: 'pending',
          checkpoint: 'sealed'
        };
      });
      state = {
        schema: 'datasecure-batch/1',
        token,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + batchTtlMs()).toISOString(),
        profile,
        remove_images: beginOptions.removeImages === true,
        io_summary: createPrivateIoSummary({
          snapshot_preflight_runs: 1,
          snapshot_copy_files: items.length,
          snapshot_copy_mib: Math.ceil(items.reduce((total, item) => total + item.size, 0) / (1024 * 1024))
        }),
        items
      };
      writeState(state);
      return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      // A parent-directory fsync can fail after the complete journal rename.
      // Preserve its matching sealed work tree so recovery never sees a
      // journal without bytes. Before publication, remove only this token's
      // private work tree. Cleanup failure never masks the primary error.
      if (!state || journalPublicationState(state) === 'absent') {
        try { safeRemoveWorkDirectory(token); } catch { /* preserve primary error */ }
      }
      if (error instanceof SafeError) throw error;
      throw new SafeError('Der bestätigte Stapel konnte nicht sicher lokal übernommen werden.');
    }
  }

  return { beginBatch, validatedPickerQueue };
}

module.exports = { createBatchIntake };
