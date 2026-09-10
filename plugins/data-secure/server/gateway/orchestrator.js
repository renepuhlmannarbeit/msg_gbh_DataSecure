'use strict';

const fs = require('fs');
const { renameWithTransientRetry } = require('./batch-journal-io');
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
  isManagedStagingPath,
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
  retainAudit
} = require('./compliance');
const { migrateLegacyAuditReceipts, createPreparedAuditRun } = require('./audit');
const { recordDiagnostic, classifyDiagnosticError } = require('./diagnostics');
const { issueReadCapability } = require('./package-store');
const { credentialIssuerAmbiguities } = require('../privacy/credentials');
const { personProseCandidateSpans, personProseAmbiguities } = require('../privacy/person-ambiguities');
const { makeRegistry } = require('../privacy/entities');
const { normalizeText } = require('../privacy/base');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { processAlive } = require('./process-liveness');
const { readSourceToPrivateMemory } = require('./read-only-source-snapshot');
const { releasedDocumentResult } = require('./document-result-grade');
const { preserveOpaqueErrorCode } = require('./prepublication-error');
const { createStage, assertStage, publishStage, discardStage, recoverAbandonedStages } = require('./package-staging');

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

function reservePersonReviewCandidates(text, pseudonymRegistry) {
  const original = normalizeText(text);
  const reservations = personProseCandidateSpans(original)
    .filter((span) => !pseudonymRegistry?.lookup?.('PERSON', span.value))
    .map((span, index) => ({
      ...span,
      token: `[PERSON_REVIEW_${String(index + 1).padStart(6, '0')}]`
    }));
  for (const reservation of reservations) {
    if (original.includes(reservation.token)) {
      const error = new SafeError('Ein lokaler Personenhinweis kollidiert mit reservierter interner Syntax. Es wurde nichts freigegeben.');
      error.code = 'AMBIGUITY_REVIEW_REQUIRED';
      throw error;
    }
  }
  let masked = original;
  for (const reservation of [...reservations].sort((a, b) => b.start - a.start)) {
    masked = masked.slice(0, reservation.start) + reservation.token + masked.slice(reservation.end);
  }
  return {
    original,
    masked,
    restore(value) {
      let restored = String(value || '');
      for (const reservation of reservations) {
        const first = restored.indexOf(reservation.token);
        if (first < 0 || restored.indexOf(reservation.token, first + reservation.token.length) >= 0) {
          const error = new SafeError('Ein lokaler Personenhinweis konnte nach der Datenschutzprüfung nicht sicher rekonstruiert werden.');
          error.code = 'AMBIGUITY_REVIEW_REQUIRED';
          throw error;
        }
        restored = restored.slice(0, first) + reservation.value + restored.slice(first + reservation.token.length);
      }
      return restored;
    }
  };
}

function newJobId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
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

function openBatchPackageProtectionForRetention() {
  // Lazily required: batch.js requires this module at load time, so a
  // top-level require here would deadlock on the circular dependency. By call
  // time the module graph is fully loaded and this resolves normally.
  try {
    return require('./batch').openBatchPackageProtection();
  } catch {
    return { ids: new Set(), complete: false };
  }
}

function bestEffortRetentionCleanup(deps, scope = 'all') {
  try {
    const cleanup = deps.cleanupLocalData || cleanupLocalData;
    const protection = deps.retentionProtectedIds instanceof Set
      ? { ids: deps.retentionProtectedIds, complete: deps.retentionProtectionComplete !== false }
      : openBatchPackageProtectionForRetention();
    return cleanup({
      scope,
      trigger: 'run',
      now: deps.now,
      retentionDays: deps.retentionDays,
      removeEntry: deps.removeRetentionEntry,
      protectedIds: protection.ids,
      outputProtectionComplete: protection.complete
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
  const stagingCleanup = (deps.recoverAbandonedStages || recoverAbandonedStages)();
  if (stagingCleanup.failures || stagingCleanup.unbound) {
    const error = new SafeError('Private temporäre Ausgaben konnten nicht sicher zugeordnet oder bereinigt werden. Bitte lokale IT-Prüfung durchführen; Originale und fertige Ergebnisse bleiben unverändert.');
    error.code = 'STAGING_RECOVERY_BLOCKED';
    bestEffortDiagnostic(deps, { route: 'startup', stage: 'recovery', result: 'stopped', error_code: error.code });
    throw error;
  }
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

  if (!Array.isArray(deps.inputQueue)) {
    throw new SafeError('Die Verarbeitung erfordert eine ausdrücklich ausgewählte lokale Quelle.');
  }
  const queue = deps.inputQueue;
  if (!queue.length) {
    return {
      ok: false,
      error: 'input_empty',
      message: 'Die lokale Dateiauswahl enthält keine unterstützte Datei.',
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
  if (originalSource && isManagedStagingPath(originalSource)) {
    throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  }
  const originalName = selectedInput.name;
  if (selectedInput.private_artifact_encrypted === true) {
    throw Object.assign(new SafeError('Verschlüsselte Altbestände bleiben unverändert. Bitte die Originaldatei erneut auswählen.'), { code: 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE' });
  }
  const privateInput = selectedInput.private_artifact_plain === true && Buffer.isBuffer(selectedInput.private_bytes);
  if (privateInput && (typeof originalName !== 'string' || originalName.length === 0)) {
    throw new SafeError('Die private Arbeitskopie besitzt keine gültige Formatbindung.');
  }
  const ext = path.extname(originalName || originalSource).toLowerCase();
  // This orchestrator is the Cowork/plugin entry point unless a caller
  // explicitly selects the Standalone channel.  Keeping that legacy default
  // here prevents older batch/recovery callers from being routed through the
  // Standalone conversion worker merely because productChannel is absent.
  const productChannel = deps.productChannel || 'plugin';
  const markdownFirstPrivacy = require('../core/markdown-first-privacy')
    .isMarkdownFirstPrivacyExtension(ext, productChannel);
  const scopedPrivacy = markdownFirstPrivacy || ext === '.docx';
  if (!PILOT_SUPPORTED.has(ext) && !markdownFirstPrivacy) {
    const error = new SafeError(
      'Dieses Format ist im beaufsichtigten Pilotbetrieb nicht freigegeben. ' +
      'Verwenden Sie TXT, Markdown, CSV, DOCX, XLSX oder PPTX; PDF und Bilddateien bleiben sicher gestoppt.'
    );
    error.code = ext === '.pdf' ? 'PDF_COVERAGE_UNVERIFIED' : 'FORMAT_COVERAGE_UNVERIFIED';
    bestEffortDiagnostic(deps, {
      route: 'input', source_type: ext.slice(1), profile: requested,
      stage: 'started', result: 'stopped', error_code: error.code
    });
    throw error;
  }
  const selectedBytes = privateInput ? selectedInput.private_bytes.length : selectedInput.stat?.size;
  if (!Number.isSafeInteger(selectedBytes) || selectedBytes < 0 || selectedBytes > MAX_INPUT_BYTES) {
    throw new SafeError('Eingabedatei überschreitet die absolute lokale Größenbegrenzung.');
  }

  const r = roots();
  const jobId = newJobId();
  const jobOwnerNonce = crypto.randomBytes(16).toString('hex');
  const jobDir = path.join(r.jobs, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(
    path.join(jobDir, '.owner.json'),
    JSON.stringify({ pid: process.pid, created_at: new Date().toISOString(), nonce: jobOwnerNonce }),
    { encoding: 'utf8', mode: 0o600, flag: 'wx' }
  );

  let source = originalSource || originalName;
  let sourceBuffer = privateInput ? selectedInput.private_bytes : null;
  let claimed = false;
  let stagePackage = null;
  let stageHandle = null;
  let reviewPackageId = null;
  let auditReceiptRetained = false;
  let diagnosticStage = 'started';
  const diagnostic = {
    route: Array.isArray(deps.inputQueue) ? 'companion' : 'input',
    source_type: ext.slice(1),
    profile: requested,
    remove_images: deps.removeImages === true
  };
  try {
    throwIfAborted(deps.abortSignal);
    if (!privateInput) {
      const memorySnapshot = readSourceToPrivateMemory({
        source: originalSource,
        expectedStat: selectedInput.stat,
        expectedSha256: selectedInput.expected_sha256
      });
      sourceBuffer = memorySnapshot.privateBytes;
      source = originalName;
    }
    claimed = true;
    diagnosticStage = 'claimed';
    if (deps.onClaimed) await deps.onClaimed();

    throwIfAborted(deps.abortSignal);

    const converted = markdownFirstPrivacy
      ? await (deps.extractSourceForPrivacy || require('../core/markdown-first-privacy').extractSourceForPrivacy)(
        sourceBuffer, ext, { signal: deps.abortSignal, convertBuffer: deps.convertBuffer,
          convertDocument: deps.convertDocument || convertDocument, productChannel,
          timeoutMs: deps.timeoutMs, ErrorType: SafeError })
      : await (deps.convertDocument || convertDocument)(source, {
        signal: deps.abortSignal,
        inputBuffer: sourceBuffer,
        sourceName: originalName,
        ...(ext === '.docx' ? { omitDocxHeaderFooter: true } : {})
      });
    throwIfAborted(deps.abortSignal);
    diagnosticStage = 'converted';
    const sourceExtractionCoverage = markdownFirstPrivacy ? converted.sourceExtractionCoverage
      : ext === '.docx' ? Object.freeze({ status: 'incomplete',
        reason_codes: Object.freeze(['DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY']) }) : null;
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
    stageHandle = createStage(packageId, { jobId, ownerNonce: jobOwnerNonce });
    stagePackage = stageHandle.path;

    const removeImages = deps.removeImages === true &&
      ['.docx', '.xlsx', '.pptx'].includes(ext) &&
      !converted.requiresExplicitProfile;
    const vis = await processVisuals(converted.attachments, effective, packageId, stagePackage, {
      ...deps,
      removeImages
    });
    assertStage(stageHandle);
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
    const pseudonymRegistry = deps.pseudonymRegistry || makeRegistry();
    const personReview = reservePersonReviewCandidates(rawWithOcr, pseudonymRegistry);
    const anon = anonymizeMarkdown(personReview.masked, effective, { registry: pseudonymRegistry });
    anon.text = personReview.restore(anon.text);
    const organizationAmbiguities = ['personnel_profile', 'applicant'].includes(effective)
      ? credentialIssuerAmbiguities(personReview.original, anon.text)
      : [];
    const personAmbiguities = personProseAmbiguities(personReview.original, anon.text);
    const ambiguities = [...organizationAmbiguities, ...personAmbiguities];
    diagnostic.text_entity_count = anon.entityCount;
    diagnostic.ambiguous_organization_count = organizationAmbiguities.length;
    diagnostic.ambiguous_person_count = personAmbiguities.length;
    if (deps.onDetected) {
      await deps.onDetected({
        profile: effective,
        detected_identifiers: anon.entityCount,
        ambiguous_organization_count: organizationAmbiguities.length,
        ambiguous_person_count: personAmbiguities.length,
        technical_review_required:
          review > 0 ||
          (converted.warnings || []).length > 0 ||
          (converted.unreviewedVisualCount || 0) > 0
      });
    }
    let reviewedText = anon.text;
    if (ambiguities.length > 0 && !deps.reviewText) {
      const error = new SafeError('Mehrdeutige Personen- oder Organisationsnamen benötigen eine lokale Entscheidung vor der Freigabe.');
      error.code = 'AMBIGUITY_REVIEW_REQUIRED';
      throw error;
    }
    if (deps.reviewText) {
      const reviewResult = await deps.reviewText({
        original_text: personReview.original,
        anonymized_text: anon.text,
        profile: effective,
        detected_identifiers: anon.entityCount,
        ambiguities,
        replacementForAmbiguity: (candidate) => {
          if (candidate?.type !== 'person_prose_ambiguous' || candidate.replacement_kind !== 'PERSON') {
            throw new SafeError('Die lokale Mehrdeutigkeitsentscheidung ist ungültig.');
          }
          const value = personReview.original.slice(candidate.original_start, candidate.original_end);
          return pseudonymRegistry.assign('PERSON', value);
        },
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
    assertStage(stageHandle);

    const mdName = `${packageId}.md`;
    const mdPath = path.join(stagePackage, mdName);
    const extractedMarkdownScope = scopedPrivacy
      ? '> **DataSecure-Hinweis:** Anonymisiert wurde ausschließlich der lokal in Markdown umgewandelte Inhalt. ' +
        (sourceExtractionCoverage.status === 'complete'
          ? 'Der lokale Konverter bestätigt die Extraktionsabdeckung; die Originaldatei selbst bleibt unverändert.'
          : 'Die Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert; nicht extrahierte Inhalte sind in diesem Ergebnis nicht enthalten.') +
        (ext === '.docx' ? ' Kopf- und Fußzeilen sind gemäß Ausgaberegel nicht enthalten.' : '') +
        '\n\n'
      : '';
    const finalText =
      complianceHeader(effective, {
        ext,
        passes: anon.passes,
        entityCount: anon.entityCount,
        included,
        review,
        removed,
        reidentificationRisk: anon.reidentificationRisk,
        ...(scopedPrivacy ? { sourceExtractionCoverage } : {})
      }) +
      extractedMarkdownScope +
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
      const error = new SafeError(`Finale Markdown-Datei hat den Residual-Gate nicht bestanden (${classes}).`);
      error.code = 'RESIDUAL_PII';
      throw error;
    }
    diagnosticStage = 'verified';

    // DS-045 is derived from the exact, already verified release signals.
    // Free-form warnings and unknown visual coverage can never be downgraded
    // into a harmless omission by a model or a caller.
    const documentResult = releasedDocumentResult({
      parserWarnings: converted.warnings || [],
      visualResults: vis.results,
      unreviewedVisualCount: converted.unreviewedVisualCount || 0,
      imagesRemovedByExplicitRequest: removed
    });

    const auditReceipt = auditRecord(effective, sourceBuffer
      ? { name: originalName, size: selectedBytes }
      : source, {
      entityCount: anon.entityCount,
      passes: anon.passes,
      reidentificationRisk: anon.reidentificationRisk,
      results: vis.results,
      documentResult
    });

    // The exact UTF-8 text has just passed the residual gate and is written
    // unchanged above. Derive the manifest digest from those same bytes rather
    // than immediately reading the staged file again. Publication still has
    // its independent on-disk manifest/hash verification below the package
    // boundary, so this removes only a redundant local I/O pass.
    const documentSha256 = crypto.createHash('sha256').update(finalText, 'utf8').digest('hex');
    const manifest = {
      schema: 'eu-privacy-package/3',
      gateway_version: VERSION,
      privacy_ruleset: PRIVACY_RULESET_VERSION,
      credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
      operation_id: auditReceipt.operation_id,
      package_id: packageId,
      created_at: new Date().toISOString(),
      profile: effective,
      source_type: ext.slice(1),
      ...(scopedPrivacy ? {
        privacy_scope: 'extracted-markdown-only',
        source_extraction_coverage: sourceExtractionCoverage
      } : {}),
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
      ambiguous_organization_count: organizationAmbiguities.length,
      ambiguous_person_count: personAmbiguities.length,
      reidentification_risk: anon.reidentificationRisk,
      assets: vis.results,
      parser_warnings: converted.warnings || [],
      pdf_unextractable_visual_objects: converted.unreviewedVisualCount || 0,
      images_removed_by_explicit_request: removed,
      visual_assets_withheld_at_release: review,
      document_result: documentResult,
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
        technical_review_required: review > 0,
        document_result: documentResult
      });
    }
    throwIfAborted(deps.abortSignal);

    const publishPackage = deps.publishPackage || ((from, to) => renameWithTransientRetry(from, to));

    // Only the private working copy is disposable. The selected source remains
    // byte-identical at its original path on every success and failure path.
    if (!sourceBuffer) fs.unlinkSync(source);
    claimed = false;
    publishStage(stageHandle, finalPackage, publishPackage);
    diagnosticStage = 'published';
    try {
      if (deps.afterPublish) {
        await deps.afterPublish({
          package_id: packageId,
          document_sha256: documentSha256,
          profile: effective,
          document_result: documentResult
        });
      }
    } catch (error) {
      // Batch journals treat the atomic rename as the publication commit point
      // and recover the remaining mapping/delivery projection from the verified
      // package. Companion callers keep their historical all-or-nothing callback
      // contract unless they explicitly opt into that durable batch behaviour.
      if (deps.retainPublishedOnAfterPublishFailure !== true) {
        try {
          safeRemovePrivateTree(r.output, path.basename(finalPackage));
        } catch {
          throw new SafeError(
            'Companion-Release konnte nicht atomar abgeschlossen werden; manuelle Prüfung erforderlich.'
          );
        }
      }
      throw error;
    }
    stagePackage = null;
    stageHandle = null;
    auditReceiptRetained = retainAudit(auditReceipt, {
      preparedAuditRun: deps.preparedRun?.preparedAuditRun,
      assertWritableCapacity: capacity
    });

    // A zero-day policy removes only managed private/review artifacts. User
    // sources and durable Output packages remain outside automatic deletion.
    if ((deps.retentionDays ?? retentionDays()) === 0) {
      bestEffortRetentionCleanup(deps, ['review']);
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
      document_result: documentResult,
      ...(scopedPrivacy ? {
        privacy_scope: 'extracted-markdown-only',
        source_extraction_coverage: sourceExtractionCoverage
      } : {}),
      original_moved_to_processed: false,
      persistent_mapping_retained: false,
      ...runtimeInfo(),
      raw_content_sent_to_claude: false,
      ai_act: aiActMeta(effective)
    };
  } catch (e) {
    let recoveryError = null;
    if (claimed && !sourceBuffer && fs.existsSync(source)) {
      try {
        fs.unlinkSync(source);
        claimed = false;
      } catch {
        recoveryError = new SafeError(
          'Verarbeitung wurde gestoppt; die private Arbeitskopie konnte nicht sicher entfernt werden.'
        );
      }
    }
    if (stageHandle) {
      try {
        discardStage(stageHandle);
      } catch {
        // Retain the durable ownership record for a later recovery attempt.
        bestEffortDiagnostic(deps, { ...diagnostic, stage: 'recovery', result: 'stopped', error_code: 'STAGING_RECOVERY_BLOCKED' });
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
    const failure = preserveOpaqueErrorCode(e, new SafeError(
      'Verarbeitung wurde sicher gestoppt. Es wurde kein vollständiges Output-Paket freigegeben.'
    ));
    if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(e?.code) ||
        (typeof e?.code === 'string' && e.code.startsWith('PACKAGE_STAGING_') && classifyDiagnosticError(e) === e.code)) {
      failure.code = e.code;
    }
    throw failure;
  } finally {
    if (sourceBuffer) {
      sourceBuffer.fill(0);
      sourceBuffer = null;
    }
    try {
      safeRemovePrivateTree(r.jobs, path.basename(jobDir));
    } catch {
      /* the job directory is best-effort cleanup only */
    }
  }
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
  if (!new Set(['.txt', '.md', '.markdown', '.csv', '.docx', '.xlsx', '.pptx']).has(ext)) {
    throw new SafeError('Der private Dateidialog unterstützt derzeit TXT, Markdown, CSV, DOCX, XLSX und PPTX.');
  }
  return anonymizeNext(profile, {
    ...deps,
    inputQueue: [{ name: path.basename(absolute), full: absolute, stat }],
    copyClaim: true
  });
}

module.exports = {
  anonymizeNext,
  anonymizeSelectedSource,
  bestEffortRetentionCleanup,
  cleanupAbandonedWorkingJobs,
  prepareProcessingRun,
  _test: { ensureProcessingRun }
};
