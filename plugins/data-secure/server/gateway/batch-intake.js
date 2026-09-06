'use strict';

const { notProcessedDocumentResult, normalizeDocumentResultReasonCode } = require('./document-result-grade');
const { createBatchIntakeIntent } = require('./batch-intake-intent');
const { DEFAULT_RETENTION_DAYS } = require('./retention');
const { MODES, validateProcessingMode } = require('../core/processing-mode');

function createBatchIntake(options = {}) {
  const SafeError = options.SafeError;
  const io = options.io;
  const path = options.path;
  const crypto = options.crypto;
  const profiles = options.profiles;
  const limits = options.limits;
  const validateBatchLimits = options.validateBatchLimits;
  const storageStatus = options.storageStatus;
  const defaultHasReparseComponent = options.hasReparseComponent;
  const planBatchAdmission = options.planBatchAdmission || ((queue) => {
    if (typeof options.preflightOoxmlContainers !== 'function') throw new Error('SOURCE_ADMISSION_UNAVAILABLE');
    options.preflightOoxmlContainers(queue);
    return queue.map((entry) => ({ entry, admission: 'candidate', error_code: null }));
  });
  const assertStagingCapacity = options.assertStagingCapacity;
  const tokenPattern = options.tokenPattern;
  const batchPath = options.batchPath;
  const workPath = options.workPath;
  const copySnapshotFile = options.copySnapshotFile;
  const privateWorkStore = options.privateWorkStore;
  const batchTtlMs = options.batchTtlMs;
  const createPrivateIoSummary = options.createPrivateIoSummary;
  const writeState = options.writeState;
  const readStateForMaintenance = options.readStateForMaintenance;
  const safeRemoveWorkDirectory = options.safeRemoveWorkDirectory;
  const publicProgress = options.publicProgress;
  const platform = options.platform || process.platform;
  const preflightMappingPendingStatus = options.preflightMappingPendingStatus || 'preflight_mapping_pending';
  const intakeIntent = options.intakeIntent || createBatchIntakeIntent(options);
  const createBatchPseudonymState = options.createBatchPseudonymState ||
    require('../batch-pseudonym-context').createBatchPseudonymState;
  const productChannel = String(options.productChannel || process.env.DATASECURE_PRODUCT_CHANNEL || 'plugin');
  if (!['plugin', 'standalone'].includes(productChannel)) throw new Error('PRODUCT_CHANNEL_INVALID');

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
      const sourceLabel = String(entry?.sourceLabel || name).split('\\').join('/');
      if (!sourceLabel || sourceLabel.startsWith('/') || sourceLabel.split('/').some((part) => !part || part === '.' || part === '..') || sourceLabel.length > 1024) {
        throw new SafeError('Die lokale Dateiauswahl enthält einen ungültigen relativen Pfad.');
      }
      return { entry, full, name, sourceLabel };
    });
    return candidates.map(({ entry, full, name, sourceLabel }) => {
      if (hasReparseComponent(full)) {
        throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
      }
      let stat;
      try { stat = io.lstatSync(full); } catch { throw new SafeError('Eine ausgewählte Datei ist nicht mehr verfügbar.'); }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new SafeError('Eine ausgewählte Datei ist nicht regulär lokal verfügbar.');
      if (Number(entry?.sourceBytes) !== stat.size) throw new SafeError('Eine ausgewählte Datei wurde vor der Übernahme verändert.');
      return { name, sourceLabel, full, stat };
    });
  }

  function beginBatch(beginOptions = {}) {
    // Resolve purpose before opening or copying any source. Explicit null or
    // unknown purposes must not silently become the historical default.
    const processingMode = validateProcessingMode(Object.hasOwn(beginOptions, 'processingMode')
      ? beginOptions.processingMode : MODES.ANONYMIZE, productChannel);
    if (!storageStatus().safe) throw new SafeError('Der konfigurierte Datenschutzordner ist für die lokale Verarbeitung nicht freigegeben.');
    const expected = Number(beginOptions.expectedCount);
    if (!Number.isInteger(expected) || expected < 1 || expected > limits.MAX_BATCH_FILES) {
      throw new SafeError(`Bestätigte Dateianzahl muss zwischen 1 und ${limits.MAX_BATCH_FILES} liegen.`);
    }
    if (!Array.isArray(beginOptions.queue)) {
      throw new SafeError('Der Stapel muss aus einer ausdrücklichen lokalen Dateiauswahl stammen.');
    }
    const queue = validatedPickerQueue(
      beginOptions.queue,
      beginOptions.hasReparseComponent || defaultHasReparseComponent
    );
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
          next_action: 'restart_only_on_explicit_request',
          input_documents_seen: queue.length,
          raw_content_sent_to_claude: false
        };
      }
    }
    const profile = String(beginOptions.profile || 'auto').toLowerCase();
    if (!profiles.has(profile)) throw new SafeError('Unbekanntes Profil.');
    const requestedToken = beginOptions.token;
    if (requestedToken !== undefined && !tokenPattern.test(String(requestedToken))) {
      throw new SafeError('Die lokale Batch-Sitzung ist ungültig.');
    }
    let admissionPlan;
    try {
      admissionPlan = planBatchAdmission(queue, {
        fs: io,
        processingMode,
        productChannel,
        hasReparseComponent: beginOptions.hasReparseComponent || defaultHasReparseComponent
      });
    } catch (error) {
      const stopped = new SafeError('Die ausgewählten Dateien konnten vor der lokalen Übernahme nicht sicher geprüft werden.');
      stopped.code = normalizeDocumentResultReasonCode(error?.code, 'SOURCE_READ_FAILED');
      throw stopped;
    }
    const candidates = admissionPlan.filter((planned) => planned.admission === 'candidate');
    assertStagingCapacity(candidates.map((planned) => planned.entry), beginOptions.statfs || io.statfsSync);
    const token = requestedToken || crypto.randomBytes(32).toString('hex');
    if (io.existsSync(batchPath(token)) || io.existsSync(workPath(token)) || io.existsSync(intakeIntent.intentPath(token))) {
      throw new SafeError('Die lokale Batch-Sitzung ist bereits belegt.');
    }
    const now = Date.now();
    const work = workPath(token);
    let state;
    let createdWork = false;
    let workIdentity;
    let intent;
    const ttl = batchTtlMs();
    try {
      if (!privateWorkStore || typeof privateWorkStore.ensureReady !== 'function') {
        throw new SafeError('Der lokale Speicher privater Stapelkopien ist nicht verfügbar. Es wurden keine Quelldaten übernommen.');
      }
      privateWorkStore.ensureReady();
      io.mkdirSync(work, { recursive: false, mode: 0o700 });
      createdWork = true;
      const created = io.lstatSync(work, { bigint: true });
      if (!created.isDirectory() || created.isSymbolicLink()) throw new Error('BATCH_INTAKE_WORK_UNSAFE');
      workIdentity = { dev: String(created.dev), ino: String(created.ino), birthtimeNs: String(created.birthtimeNs) };
      // The empty directory precedes the intent; no source byte is copied
      // until its ownership record has been durably written.
      intent = intakeIntent.create(token, new Date(now + ttl).toISOString(), workIdentity, {
        processingMode, productChannel
      });
      const items = admissionPlan.map((planned, index) => {
        const entry = planned.entry;
        const id = crypto.randomBytes(16).toString('hex');
        if (planned.admission === 'stopped') {
          return {
            id,
            name: entry.name,
            source_label: entry.sourceLabel || entry.name,
            status: preflightMappingPendingStatus,
            checkpoint: 'source_preflight_rejected',
            error_code: normalizeDocumentResultReasonCode(planned.error_code, 'SOURCE_READ_FAILED'),
            document_result: notProcessedDocumentResult(
              normalizeDocumentResultReasonCode(planned.error_code, 'SOURCE_READ_FAILED')
            ),
            local_mapping_exported: false,
            processing_duration_ms: 0
          };
        }
        const workName = `${String(index + 1).padStart(3, '0')}_${crypto.randomBytes(12).toString('hex')}.workcopy`;
        const copied = copySnapshotFile(entry.full, path.join(work, workName), entry.stat, {
          expectedSha256: planned.source_sha256,
          privateWorkStore
        });
        return {
          id,
          name: entry.name,
          source_label: entry.sourceLabel || entry.name,
          size: copied.size,
          sha256: copied.sha256,
          work_name: workName,
          private_artifact_plain: true,
          status: 'pending',
          checkpoint: 'sealed'
        };
      });
      state = {
        schema: processingMode === MODES.MARKDOWN ? 'datasecure-batch/5' : 'datasecure-batch/4',
        product_channel: productChannel,
        ...(processingMode === MODES.MARKDOWN ? { processing_mode: processingMode } : {}),
        token,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + (ttl === 0 ? DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000 : ttl)).toISOString(),
        ...(ttl === 0 ? { zero_day_work: true, intake_owner_pid: process.pid } : {}),
        profile,
        remove_images: processingMode === MODES.MARKDOWN ? false : beginOptions.removeImages === true,
        ...(processingMode === MODES.MARKDOWN ? {} : createBatchPseudonymState({ randomBytes: crypto.randomBytes, productChannel })),
        io_summary: createPrivateIoSummary({
          snapshot_preflight_runs: 1,
          snapshot_copy_files: candidates.length,
          snapshot_copy_mib: Math.ceil(items.reduce((total, item) => total + Number(item.size || 0), 0) / (1024 * 1024))
        }),
        items
      };
      writeState(state);
      try { intakeIntent.remove(token, intent); } catch { /* a published journal owns this tree now */ }
      return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      // A parent-directory fsync can fail after the complete journal rename.
      // Preserve its matching sealed work tree so recovery never sees a
      // journal without bytes. Before publication, remove only this token's
      // private work tree. Cleanup failure never masks the primary error.
      if (createdWork && workIdentity && (!state || journalPublicationState(state) === 'absent')) {
        try {
          safeRemoveWorkDirectory(token, { expectedIdentity: workIdentity });
          if (intent) intakeIntent.remove(token, intent);
        } catch { /* preserve primary error and ownership evidence */ }
      }
      if (error instanceof SafeError) throw error;
      if (typeof error?.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) {
        const stopped = new SafeError(error.message);
        stopped.code = error.code;
        throw stopped;
      }
      throw new SafeError('Der bestätigte Stapel konnte nicht sicher lokal übernommen werden.');
    }
  }

  return { beginBatch, validatedPickerQueue };
}

module.exports = { createBatchIntake };
