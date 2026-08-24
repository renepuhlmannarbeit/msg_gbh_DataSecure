'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, convertDocument } = require('../runtime');
const pii = require('../pii-engine');
const {
  VERSION,
  PROFILES,
  PILOT_SUPPORTED,
  LIMITS,
  roots,
  storageStatus,
  safePackageId,
  uniqueDir,
  safeRemovePrivateTree,
  listInput,
  validateBatchLimits,
  detectProfileFromMarkdown
} = require('./common');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('./storage-capacity');
const { processVisuals, assetsMarkdown } = require('./visuals');
const { cleanupLocalData, retentionDays } = require('./retention');
const {
  anonymizeMarkdown,
  complianceHeader,
  aiActMeta,
  auditRecord,
  writePackageAudit,
  retainAudit,
  moveProcessed,
  restoreProcessed
} = require('./compliance');
const { migrateLegacyAuditReceipts, createPreparedAuditRun } = require('./audit');
const { recordDiagnostic, classifyDiagnosticError } = require('./diagnostics');
const { issueReadCapability } = require('./package-store');
const { credentialIssuerAmbiguities } = require('../privacy/credentials');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');

// A batch worker gets one unforgeable in-process preparation capability after
// its maintenance and audit checks succeeded.  Individual document calls keep
// their existing fail-closed checks; only the expensive, batch-wide scans are
// not repeated for every item.
const preparedRuns = new WeakSet();
const { runtimeInfo } = require('../runtime-info');

const { MAX_INPUT_BYTES, MAX_TEXT_CHARS, MAX_VISUAL_ASSETS } = LIMITS;

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new SafeError('Die lokale Verarbeitung wurde auf Anforderung sicher abgebrochen.');
  error.code = 'REQUEST_CANCELLED';
  throw error;
}

function newJobId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function safeWorkingTree(root) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const before = fs.lstatSync(current);
    if (!before.isDirectory() || before.isSymbolicLink()) return false;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const after = fs.lstatSync(current);
    if (!after.isDirectory() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino) return false;
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) pending.push(full);
      else if (!stat.isFile()) return false;
    }
  }
  return true;
}

function cleanupAbandonedWorkingJobs(options = {}) {
  const root = options.root || roots().jobs;
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now || Date.now());
  const maxUnownedAgeMs = options.maxUnownedAgeMs ?? 24 * 60 * 60 * 1000;
  const maxOwnedAgeMs = options.maxOwnedAgeMs ?? 12 * 60 * 60 * 1000;
  if (!Number.isFinite(now) || !Number.isFinite(maxUnownedAgeMs) || maxUnownedAgeMs < 0) {
    throw new SafeError('Ungültige Zeitgrenze für die Bereinigung privater Arbeitskopien.');
  }
  if (!Number.isFinite(maxOwnedAgeMs) || maxOwnedAgeMs < 0) {
    throw new SafeError('Ungültige Owner-Zeitgrenze für private Arbeitskopien.');
  }
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new SafeError('Der Bereich für private Arbeitskopien ist kein sicherer lokaler Ordner.');
  }
  const resolvedRoot = path.resolve(root);
  const realRoot = fs.realpathSync.native(root);
  const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  const isProcessAlive = options.isProcessAlive || processAlive;
  const removeDir = options.removeDir || ((target) => safeRemovePrivateTree(root, path.basename(target)));
  let removed = 0;
  let active = 0;
  let ignored = 0;
  let failures = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!/^[a-z0-9]+_[0-9a-f]{8}$/i.test(entry.name)) { ignored++; continue; }
    const target = path.resolve(root, entry.name);
    if (comparable(path.dirname(target)) !== comparable(resolvedRoot)) { failures++; continue; }
    try {
      const stat = fs.lstatSync(target);
      if (!entry.isDirectory() || !stat.isDirectory() || stat.isSymbolicLink() || !safeWorkingTree(target)) {
        failures++;
        continue;
      }
      if (comparable(path.dirname(fs.realpathSync.native(target))) !== comparable(realRoot)) {
        failures++;
        continue;
      }
      const ownerPath = path.join(target, '.owner.json');
      let owner = null;
      if (fs.existsSync(ownerPath)) {
        owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
        if (
          !owner || !Number.isSafeInteger(owner.pid) ||
          !/^[0-9a-f]{32}$/i.test(String(owner.nonce || '')) ||
          Number.isNaN(Date.parse(owner.created_at)) ||
          Object.keys(owner).sort().join(',') !== 'created_at,nonce,pid'
        ) throw new Error('invalid owner');
      }
      const ownerAgeMs = owner ? now - Date.parse(owner.created_at) : null;
      if (owner && ownerAgeMs >= 0 && ownerAgeMs <= maxOwnedAgeMs && isProcessAlive(owner.pid)) {
        active++;
        continue;
      }
      if (!owner && now - stat.mtimeMs < maxUnownedAgeMs) { active++; continue; }
      removeDir(target);
      removed++;
    } catch { failures++; }
  }
  return { removed, active, ignored, failures };
}

function copyRegularFileExclusive(source, destination, expectedStat, expectedSha256) {
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(expectedSha256))) {
    throw new SafeError('Die versiegelte Arbeitskopie ist ungültig.');
  }
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const sourceChanged = () => {
    const error = new SafeError('Die ausgewählte Datei wurde während der Übergabe verändert.');
    if (expectedSha256 !== undefined) error.code = 'BATCH_SNAPSHOT_CHANGED';
    return error;
  };
  let sourceFd;
  let destinationFd;
  try {
    sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
    const opened = fs.fstatSync(sourceFd);
    const current = fs.lstatSync(source);
    if (
      !opened.isFile() || !current.isFile() || current.isSymbolicLink() ||
      opened.dev !== expectedStat.dev || opened.ino !== expectedStat.ino ||
      current.dev !== expectedStat.dev || current.ino !== expectedStat.ino ||
      opened.size !== expectedStat.size || current.size !== expectedStat.size ||
      opened.mtimeMs !== expectedStat.mtimeMs || current.mtimeMs !== expectedStat.mtimeMs
    ) {
      throw sourceChanged();
    }
    destinationFd = fs.openSync(destination, 'wx', 0o600);
    const chunk = Buffer.allocUnsafe(64 * 1024);
    const hash = expectedSha256 === undefined ? null : crypto.createHash('sha256');
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      hash?.update(chunk.subarray(0, read));
      let written = 0;
      while (written < read) written += fs.writeSync(destinationFd, chunk, written, read - written);
      position += read;
    }
    fs.fsyncSync(destinationFd);
    const after = fs.lstatSync(source);
    const rechecked = fs.fstatSync(sourceFd);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== expectedStat.dev || after.ino !== expectedStat.ino ||
      after.size !== expectedStat.size || after.mtimeMs !== expectedStat.mtimeMs ||
      rechecked.size !== expectedStat.size || rechecked.mtimeMs !== expectedStat.mtimeMs) {
      throw sourceChanged();
    }
    if (hash) {
      const actual = hash.digest();
      const expected = Buffer.from(String(expectedSha256), 'hex');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) {
        const error = new SafeError('Die versiegelte Arbeitskopie wurde verändert. Der Lauf wurde sicher gestoppt.');
        error.code = 'BATCH_SNAPSHOT_CHANGED';
        throw error;
      }
    }
  } finally {
    if (destinationFd !== undefined) fs.closeSync(destinationFd);
    if (sourceFd !== undefined) fs.closeSync(sourceFd);
  }
}

function bestEffortRetentionCleanup(deps, scope = 'all') {
  try {
    const cleanup = deps.cleanupLocalData || cleanupLocalData;
    return cleanup({
      scope,
      trigger: 'run',
      now: deps.now,
      retentionDays: deps.retentionDays,
      removeEntry: deps.removeRetentionEntry
    });
  } catch {
    return null;
  }
}

function bestEffortDiagnostic(deps, event) {
  // A batch-review preparation pass deliberately recreates review material
  // from a sealed source and then discards it before publication. It is not a
  // failed user-visible processing attempt, so it must not add a misleading
  // diagnostic event while the raw-derived draft is still in memory.
  if (deps.suppressDiagnostic === true) return false;
  try {
    return (deps.recordDiagnostic || recordDiagnostic)(event);
  } catch {
    return false;
  }
}

function prepareProcessingRun(deps = {}) {
  bestEffortRetentionCleanup(deps);
  const workingCleanup = (deps.cleanupAbandonedWorkingJobs || cleanupAbandonedWorkingJobs)({ now: deps.now });
  if (workingCleanup.failures) {
    throw new SafeError('Verwaiste private Arbeitskopien konnten nicht sicher bereinigt werden; Verarbeitung wurde gestoppt.');
  }
  const auditMigration = (deps.migrateLegacyAuditReceipts || migrateLegacyAuditReceipts)();
  if (auditMigration.legacy_pending || auditMigration.migration_errors || auditMigration.write_errors) {
    throw new SafeError(
      'Verarbeitung wurde gestoppt: Alte Audit-Nachweise konnten nicht datensparsam migriert werden. ' +
        'Bitte privacy_status prüfen und die lokale IT-Bereinigung durchführen.'
    );
  }
  const capability = Object.freeze({ preparedAuditRun: createPreparedAuditRun() });
  preparedRuns.add(capability);
  return capability;
}

function ensureProcessingRun(deps = {}) {
  if (deps.preparedRun && preparedRuns.has(deps.preparedRun)) return;
  prepareProcessingRun(deps);
}

async function anonymizeNext(profile = 'auto', deps = {}) {
  const requested = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(requested)) throw new SafeError('Unbekanntes Profil.');
  if (!storageStatus().safe) {
    const error = new SafeError('Der konfigurierte Datenschutzordner ist ein bekannter Cloud-Sync- oder Netzwerkpfad. Verarbeitung wurde sicher gestoppt.');
    error.code = 'UNSAFE_STORAGE_LOCATION';
    throw error;
  }

  throwIfAborted(deps.abortSignal);

  ensureProcessingRun(deps);

  const queue = deps.inputQueue || listInput();
  if (!queue.length) {
    return {
      ok: false,
      error: 'input_empty',
      message: 'Keine unterstützte Datei im lokalen Input-Ordner.',
      raw_content_sent_to_claude: false
    };
  }

  const queueIndex = Number.isInteger(deps.queueIndex) ? deps.queueIndex : 0;
  if (queueIndex < 0 || queueIndex >= queue.length) {
    return {
      ok: false,
      error: 'input_position_empty',
      message: 'Die angeforderte Warteschlangenposition ist nicht mehr vorhanden. Bitte Datenschutzstatus erneut prüfen.',
      input_documents_seen: queue.length,
      raw_content_sent_to_claude: false
    };
  }

  const selectedInput = queue[queueIndex];
  const originalSource = selectedInput.full;
  const originalName = selectedInput.name;
  const ext = path.extname(originalSource).toLowerCase();
  if (!PILOT_SUPPORTED.has(ext)) {
    const error = new SafeError(
      'Dieses Format ist im beaufsichtigten Pilotbetrieb nicht freigegeben. ' +
      'Verwenden Sie ausschließlich TXT, Markdown, CSV oder DOCX; PDF, XLSX, PPTX und Bilddateien bleiben sicher gestoppt.'
    );
    error.code = ext === '.pdf' ? 'PDF_COVERAGE_UNVERIFIED' : 'FORMAT_COVERAGE_UNVERIFIED';
    bestEffortDiagnostic(deps, {
      route: 'input', source_type: ext.slice(1), profile: requested,
      stage: 'started', result: 'stopped', error_code: error.code
    });
    throw error;
  }
  if (selectedInput.stat.size > MAX_INPUT_BYTES) throw new SafeError('Eingabedatei überschreitet die absolute lokale Größenbegrenzung.');

  const r = roots();
  const jobId = newJobId();
  const jobDir = path.join(r.jobs, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(
    path.join(jobDir, '.owner.json'),
    JSON.stringify({ pid: process.pid, created_at: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') }),
    { encoding: 'utf8', mode: 0o600, flag: 'wx' }
  );

  let source = originalSource;
  let claimed = false;
  let stagePackage = null;
  let processedPath = null;
  let reviewPackageId = null;
  let auditReceiptRetained = false;
  const copiedClaim = deps.copyClaim === true;
  let diagnosticStage = 'started';
  const diagnostic = {
    route: copiedClaim ? 'companion' : 'input',
    source_type: ext.slice(1),
    profile: requested,
    remove_images: deps.removeImages === true
  };
  try {
    throwIfAborted(deps.abortSignal);
    source = copiedClaim
      ? path.join(jobDir, `source${ext}`)
      : path.join(r.input, `.processing_${jobId}_${originalName}`);
    if (copiedClaim) {
      copyRegularFileExclusive(originalSource, source, selectedInput.stat, selectedInput.expected_sha256);
    } else {
      fs.renameSync(originalSource, source);
    }
    claimed = true;
    diagnosticStage = 'claimed';
    if (deps.onClaimed) await deps.onClaimed();

    throwIfAborted(deps.abortSignal);

    const converted = await (deps.convertDocument || convertDocument)(source, { signal: deps.abortSignal });
    throwIfAborted(deps.abortSignal);
    diagnosticStage = 'converted';
    diagnostic.parser_warning_count = (converted.warnings || []).length;
    diagnostic.visual_assets_total = (converted.attachments || []).length + (converted.unreviewedVisualCount || 0);
    if (deps.onExtracted) await deps.onExtracted(converted);
    if ((converted.warnings || []).length > 0) {
      const error = new SafeError(
        'Der lokale Parser meldet eine unvollständige Dokumentabdeckung. ' +
          'Die Datei bleibt sicher gestoppt und es wird kein Paket freigegeben.'
      );
      error.code = 'PARSER_COVERAGE_UNVERIFIED';
      throw error;
    }
    if (requested === 'auto' && converted.requiresExplicitProfile) {
      throw new SafeError(
        'Für reine Bild-/Scan-Eingaben muss das Datenschutzprofil ausdrücklich gewählt werden; ' +
          'die automatische Profilerkennung erhält vor der lokalen OCR keinen Dokumenttext.'
      );
    }
    if (converted.markdown.length > MAX_TEXT_CHARS) {
      throw new SafeError('Extrahierter Dokumenttext ist zu groß.');
    }
    if ((converted.attachments || []).length > MAX_VISUAL_ASSETS) {
      throw new SafeError('Zu viele visuelle Assets für den automatischen Workflow.');
    }
    if (
      deps.removeImages === true &&
      ((converted.warnings || []).length > 0 || (converted.unreviewedVisualCount || 0) > 0)
    ) {
      throw new SafeError(
        'Bilder können nicht sicher entfernt werden, weil die Datei unbekannte oder nicht vollständig extrahierbare Inhalte enthält.'
      );
    }

    const effective = requested === 'auto' ? detectProfileFromMarkdown(converted.markdown) : requested;
    diagnostic.profile = effective;
    diagnosticStage = 'profile_selected';
    // Batch sessions own an opaque random item id before any source bytes are
    // processed.  They may supply it as a deterministic package id so crash
    // recovery can recognize an already-published package without inspecting
    // source names or retrying that source.  Interactive one-off processing
    // keeps the existing collision-safe random naming.
    const requestedPackageId = deps.packageId === undefined ? null : String(deps.packageId);
    if (requestedPackageId !== null && !/^[A-Za-z0-9_-]{16,128}$/.test(requestedPackageId)) {
      throw new SafeError('Die lokale Paketkennung ist ungültig.');
    }
    const finalPackage = requestedPackageId === null
      ? uniqueDir(r.output, `${safePackageId(effective)}_${crypto.randomBytes(3).toString('hex')}`)
      : path.join(r.output, requestedPackageId);
    if (requestedPackageId !== null && fs.existsSync(finalPackage)) {
      throw new SafeError('Die lokale Paketkennung ist bereits belegt; Verarbeitung wurde sicher gestoppt.');
    }
    const packageId = path.basename(finalPackage);
    reviewPackageId = packageId;
    stagePackage = path.join(r.output, `.${packageId}.tmp_${crypto.randomBytes(3).toString('hex')}`);
    fs.mkdirSync(stagePackage, { recursive: true });

    const removeImages = deps.removeImages === true &&
      ['.docx', '.xlsx', '.pptx'].includes(ext) &&
      !converted.requiresExplicitProfile;
    const vis = await processVisuals(converted.attachments, effective, packageId, stagePackage, {
      ...deps,
      removeImages
    });
    throwIfAborted(deps.abortSignal);
    const included = vis.results.filter((x) => x.status === 'included').length;
    const review = vis.results.filter((x) => x.status === 'review_required').length;
    const removed = vis.results.filter((x) => x.status === 'removed').length;
    diagnosticStage = 'visuals_processed';
    diagnostic.visual_assets_total = vis.results.length + (converted.unreviewedVisualCount || 0);
    diagnostic.visual_assets_included = included;
    diagnostic.visual_assets_review_required = review + (converted.unreviewedVisualCount || 0);
    diagnostic.visual_assets_removed = removed;

    // OCR text of a withheld visual is released only after it has passed the
    // text privacy gate; the image bytes themselves stay local. See
    // docs/PLUGIN_SECURITY_MODEL.md.
    let rawWithOcr = converted.markdown + vis.ocrExtras;
    if (converted.unreviewedVisualCount) {
      rawWithOcr +=
        `\n\n> Hinweis: ${converted.unreviewedVisualCount} PDF-Visualobjekt(e) konnten nicht ` +
        'sicher als eigenständige Assets extrahiert werden. Das Original bleibt lokal in ' +
        'Processed für manuelle visuelle Prüfung.';
    }

    // `pseudonymRegistry` is an internal, short-lived dependency reserved for
    // the future three-platform native-secret-store release. It cannot come
    // from an MCP tool argument and is never written to an output package,
    // journal, diagnostic, or audit receipt.
    const anon = anonymizeMarkdown(rawWithOcr, effective,
      deps.pseudonymRegistry ? { registry: deps.pseudonymRegistry } : undefined);
    const ambiguities = ['personnel_profile', 'applicant'].includes(effective)
      ? credentialIssuerAmbiguities(rawWithOcr, anon.text)
      : [];
    diagnostic.text_entity_count = anon.entityCount;
    diagnostic.ambiguous_organization_count = ambiguities.length;
    if (deps.onDetected) {
      await deps.onDetected({
        profile: effective,
        detected_identifiers: anon.entityCount,
        ambiguous_organization_count: ambiguities.length,
        technical_review_required:
          review > 0 ||
          (converted.warnings || []).length > 0 ||
          (converted.unreviewedVisualCount || 0) > 0
      });
    }
    let reviewedText = anon.text;
    if (ambiguities.length > 0 && !deps.reviewText) {
      const error = new SafeError('Mehrdeutige Organisationsnamen benötigen eine lokale Entscheidung vor der Freigabe.');
      error.code = 'AMBIGUITY_REVIEW_REQUIRED';
      throw error;
    }
    if (deps.reviewText) {
      const reviewResult = await deps.reviewText({
        original_text: rawWithOcr,
        anonymized_text: anon.text,
        profile: effective,
        detected_identifiers: anon.entityCount,
        ambiguities,
        technical_review_required:
          review > 0 ||
          (converted.warnings || []).length > 0 ||
          (converted.unreviewedVisualCount || 0) > 0
      });
      throwIfAborted(deps.abortSignal);
      if (!reviewResult || typeof reviewResult.text !== 'string') {
        throw new SafeError('Die lokale Textprüfung lieferte keine freigabefähige Fassung.');
      }
      if (reviewResult.text.length > MAX_TEXT_CHARS) {
        throw new SafeError('Die lokal bearbeitete Fassung ist zu groß.');
      }
      reviewedText = reviewResult.text;
    }
    diagnosticStage = 'text_reviewed';

    const mdName = `${packageId}.md`;
    const mdPath = path.join(stagePackage, mdName);
    const finalText =
      complianceHeader(effective, {
        ext,
        passes: anon.passes,
        entityCount: anon.entityCount,
        included,
        review,
        removed,
        reidentificationRisk: anon.reidentificationRisk
      }) +
      reviewedText +
      assetsMarkdown(vis.results);
    const capacity = deps.assertWritableCapacity || assertWritableCapacity;
    capacity({ directory: stagePackage, bytes: Buffer.byteLength(finalText, 'utf8') });
    try { fs.writeFileSync(mdPath, finalText, 'utf8'); }
    catch (error) { throw normalizePostPreflightWriteError(error); }

    // Second, independent gate over the exact bytes that will be released,
    // including the compliance header and the asset section.
    const finalResidual = pii.scanResidual(finalText, effective, anon.dictionary, {
      strongPersonAnchor: anon.strongPersonAnchor
    });
    if (finalResidual.length) {
      const classes = [...new Set(finalResidual.map((x) => x.type))].sort().join(', ');
      throw new SafeError(`Finale Markdown-Datei hat den Residual-Gate nicht bestanden (${classes}).`);
    }
    diagnosticStage = 'verified';

    const auditReceipt = auditRecord(effective, source, {
      entityCount: anon.entityCount,
      passes: anon.passes,
      reidentificationRisk: anon.reidentificationRisk,
      results: vis.results
    });

    // The exact UTF-8 text has just passed the residual gate and is written
    // unchanged above. Derive the manifest digest from those same bytes rather
    // than immediately reading the staged file again. Publication still has
    // its independent on-disk manifest/hash verification below the package
    // boundary, so this removes only a redundant local I/O pass.
    const documentSha256 = crypto.createHash('sha256').update(finalText, 'utf8').digest('hex');
    const manifest = {
      schema: 'eu-privacy-package/2',
      gateway_version: VERSION,
      privacy_ruleset: PRIVACY_RULESET_VERSION,
      credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
      operation_id: auditReceipt.operation_id,
      package_id: packageId,
      created_at: new Date().toISOString(),
      profile: effective,
      source_type: ext.slice(1),
      document: mdName,
      document_sha256: documentSha256,
      verification: {
        text_residual_pii: 'passed',
        residual_gate_checked_dictionary_literals: true,
        visual_fail_closed: true,
        visual_ocr_text_released: true,
        persistent_mapping: false,
        ...runtimeInfo()
      },
      ambiguity_resolution: ambiguities.length > 0 ? 'local_human_complete' : 'not_required',
      ambiguous_organization_count: ambiguities.length,
      reidentification_risk: anon.reidentificationRisk,
      assets: vis.results,
      parser_warnings: converted.warnings || [],
      pdf_unextractable_visual_objects: converted.unreviewedVisualCount || 0,
      images_removed_by_explicit_request: removed,
      ai_act: aiActMeta(effective)
    };
    if (deps.companionJobId) manifest.companion_job_id = deps.companionJobId;
    const manifestJson = JSON.stringify(manifest, null, 2);
    capacity({ directory: stagePackage, bytes: Buffer.byteLength(manifestJson, 'utf8') });
    try { fs.writeFileSync(path.join(stagePackage, 'manifest.json'), manifestJson, 'utf8'); }
    catch (error) { throw normalizePostPreflightWriteError(error); }

    writePackageAudit(auditReceipt, stagePackage, { assertWritableCapacity: capacity });

    // The durable audit mirror is a different local destination from Output
    // on configurable installations.  Check its exact, already-sanitised
    // receipt before the source move and package publish.  A later physical
    // allocation race is handled by retainAudit's existing local marker and
    // reconciliation path; it must not retract an already published package.
    capacity({ directory: r.audit, bytes: Buffer.byteLength(JSON.stringify(auditReceipt, null, 2), 'utf8') });

    if (deps.beforePublish) {
      await deps.beforePublish({
        package_id: packageId,
        document_sha256: documentSha256,
        reviewed_content_sha256: crypto.createHash('sha256').update(reviewedText, 'utf8').digest('hex'),
        profile: effective,
        detected_identifiers: anon.entityCount,
        technical_review_required: review > 0
      });
    }
    throwIfAborted(deps.abortSignal);

    const moveSource = deps.moveProcessed || moveProcessed;
    const publishPackage = deps.publishPackage || ((from, to) => fs.renameSync(from, to));

    // The source is moved before the package becomes visible. If publishing
    // fails, the catch path restores it to Input. This makes the output rename
    // the single commit point instead of exposing a package from a failed job.
    if (copiedClaim) {
      fs.unlinkSync(source);
      claimed = false;
    } else {
      processedPath = moveSource(source, originalName);
      claimed = false;
    }
    publishPackage(stagePackage, finalPackage);
    diagnosticStage = 'published';
    try {
      if (deps.afterPublish) {
        await deps.afterPublish({
          package_id: packageId,
          document_sha256: documentSha256,
          profile: effective
        });
      }
    } catch (error) {
      try {
        safeRemovePrivateTree(r.output, path.basename(finalPackage));
      } catch {
        throw new SafeError(
          'Companion-Release konnte nicht atomar abgeschlossen werden; manuelle Prüfung erforderlich.'
        );
      }
      throw error;
    }
    stagePackage = null;
    processedPath = null;
    auditReceiptRetained = retainAudit(auditReceipt, {
      preparedAuditRun: deps.preparedRun?.preparedAuditRun,
      assertWritableCapacity: capacity
    });

    // A zero-day policy removes the original and any withheld preview bytes as
    // soon as the successful package is committed. The new Output package stays
    // readable until the next cleanup trigger, when its directory is expired.
    if ((deps.retentionDays ?? retentionDays()) === 0) {
      bestEffortRetentionCleanup(deps, ['processed', 'review']);
    }

    bestEffortDiagnostic(deps, {
      ...diagnostic,
      stage: 'published',
      result: 'released',
      error_code: 'NONE'
    });

    const readGrant = issueReadCapability(packageId);
    return {
      ok: true,
      operation_id: auditReceipt.operation_id,
      audit_receipt_retained: auditReceiptRetained,
      profile: effective,
      profile_detection: requested === 'auto' ? 'local-auto' : 'explicit',
      package_id: packageId,
      read_capability: readGrant.read_capability,
      read_capability_expires_at: readGrant.read_capability_expires_at,
      document_id: mdName,
      verification: 'passed',
      privacy_passes: anon.passes,
      detected_identifiers: anon.entityCount,
      reidentification_risk: anon.reidentificationRisk,
      visual_assets: {
        total: vis.results.length,
        included,
        review_required: review,
        removed,
        redactions: vis.results.reduce((n, x) => n + (x.redactions || 0), 0)
      },
      original_moved_to_processed: !copiedClaim,
      persistent_mapping_retained: false,
      ...runtimeInfo(),
      raw_content_sent_to_claude: false,
      ai_act: aiActMeta(effective)
    };
  } catch (e) {
    let recoveryError = null;
    if (processedPath) {
      try {
        (deps.restoreProcessed || restoreProcessed)(processedPath, originalSource);
        processedPath = null;
      } catch {
        recoveryError = new SafeError(
          'Verarbeitung wurde gestoppt; die Quelldatei konnte nicht automatisch nach Input zurückgelegt werden. Manuelle Prüfung erforderlich.'
        );
      }
    }
    if (claimed && copiedClaim && fs.existsSync(source)) {
      try {
        fs.unlinkSync(source);
        claimed = false;
      } catch {
        recoveryError = new SafeError(
          'Verarbeitung wurde gestoppt; die private Arbeitskopie konnte nicht sicher entfernt werden.'
        );
      }
    }
    if (claimed && !copiedClaim && fs.existsSync(source) && !fs.existsSync(originalSource)) {
      try {
        fs.renameSync(source, originalSource);
        claimed = false;
      } catch {
        recoveryError = new SafeError(
          'Verarbeitung wurde gestoppt; die beanspruchte Quelldatei konnte nicht nach Input zurückgelegt werden. Manuelle Prüfung erforderlich.'
        );
      }
    }
    if (stagePackage && fs.existsSync(stagePackage)) {
      try {
        safeRemovePrivateTree(r.output, path.basename(stagePackage));
      } catch {
        /* the staging directory is best-effort cleanup only */
      }
    }
    if (reviewPackageId) {
      const reviewDir = path.join(r.review, reviewPackageId);
      if (fs.existsSync(reviewDir)) {
        try {
          safeRemovePrivateTree(r.review, path.basename(reviewDir));
        } catch {
          /* review cleanup is best effort; its bytes are never exposed by a read tool */
        }
      }
    }
    const diagnosticError = recoveryError || e;
    bestEffortDiagnostic(deps, {
      ...diagnostic,
      stage: recoveryError ? 'recovery' : diagnosticStage,
      result: 'stopped',
      error_code: classifyDiagnosticError(diagnosticError, recoveryError ? 'recovery' : diagnosticStage)
    });
    if (recoveryError) throw recoveryError;
    if (e instanceof SafeError) throw e;
    const failure = new SafeError(
      'Verarbeitung wurde sicher gestoppt. Es wurde kein vollständiges Output-Paket freigegeben.'
    );
    if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(e?.code)) {
      failure.code = e.code;
    }
    throw failure;
  } finally {
    try {
      safeRemovePrivateTree(r.jobs, path.basename(jobDir));
    } catch {
      /* the job directory is best-effort cleanup only */
    }
  }
}

async function anonymizeAll(profile = 'auto', deps = {}) {
  const requested = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(requested)) throw new SafeError('Unbekanntes Profil.');
  const queue = deps.inputQueue || listInput();
  if (!queue.length) {
    return {
      ok: false,
      error: 'input_empty',
      message: 'Keine unterstützte Datei im lokalen Input-Ordner.',
      input_documents_seen: 0,
      batch_total: 0,
      attempted: 0,
      automatic_retries: 0,
      released: 0,
      stopped: 0,
      remaining: 0,
      results: [],
      raw_content_sent_to_claude: false
    };
  }

  try { validateBatchLimits(queue); } catch (error) {
    if (error.message === 'BATCH_TOTAL_LIMIT') throw new SafeError('Der lokale Stapel ist größer als 500 MB.');
    if (error.message === 'INPUT_FORMAT_LIMIT') {
      throw new SafeError('Eine Datei überschreitet die sichere Einzeldateigrenze für ihr Format. Bitte teilen Sie diese Datei auf.');
    }
    throw new SafeError('Der lokale Stapel enthält zu viele oder zu große Dateien.');
  }
  const maximum = LIMITS.MAX_BATCH_FILES;
  const selected = queue.slice(0, maximum);
  const results = [];
  for (let index = 0; index < selected.length; index++) {
    try {
      const result = await anonymizeNext(requested, { ...deps, inputQueue: [selected[index]] });
      results.push({
        index: index + 1,
        status: 'released',
        package_id: result.package_id,
        document_id: result.document_id,
        profile: result.profile,
        visual_assets: result.visual_assets
      });
    } catch (error) {
      results.push({
        index: index + 1,
        status: 'stopped',
        message: error instanceof SafeError
          ? error.message
          : 'Die lokale Verarbeitung wurde sicher abgebrochen.'
      });
    }
  }

  const released = results.filter((item) => item.status === 'released').length;
  const stopped = results.length - released;
  return {
    ok: released > 0,
    input_documents_seen: queue.length,
    batch_total: queue.length,
    attempted: selected.length,
    automatic_retries: 0,
    released,
    stopped,
    remaining: Math.max(0, queue.length - selected.length),
    results,
    raw_content_sent_to_claude: false
  };
}

async function anonymizeSelectedSource(source, profile = 'auto', deps = {}) {
  const absolute = path.resolve(String(source || ''));
  if (!path.isAbsolute(String(source || '')) || absolute !== String(source)) {
    throw new SafeError('Companion-Quelle muss ein absoluter normalisierter Pfad sein.');
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new SafeError('Companion-Quelle ist keine reguläre lokale Datei.');
  }
  const ext = path.extname(absolute).toLowerCase();
  if (!new Set(['.txt', '.md', '.markdown', '.csv', '.docx']).has(ext)) {
    throw new SafeError('Der private Dateidialog unterstützt derzeit ausschließlich TXT, Markdown, CSV und DOCX.');
  }
  return anonymizeNext(profile, {
    ...deps,
    inputQueue: [{ name: path.basename(absolute), full: absolute, stat }],
    copyClaim: true
  });
}

module.exports = {
  anonymizeNext,
  anonymizeAll,
  anonymizeSelectedSource,
  bestEffortRetentionCleanup,
  cleanupAbandonedWorkingJobs,
  prepareProcessingRun,
  _test: { ensureProcessingRun }
};
