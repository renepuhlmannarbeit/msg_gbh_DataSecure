'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, convertDocument } = require('../runtime');
const pii = require('../pii-engine');
const {
  VERSION,
  PROFILES,
  LIMITS,
  roots,
  sha256File,
  safePackageId,
  uniqueDir,
  listInput,
  detectProfileFromMarkdown
} = require('./common');
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
const { migrateLegacyAuditReceipts } = require('./audit');

const { MAX_INPUT_BYTES, MAX_TEXT_CHARS, MAX_VISUAL_ASSETS } = LIMITS;

function newJobId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function copyRegularFileExclusive(source, destination, expectedStat) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
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
      opened.size !== expectedStat.size || current.size !== expectedStat.size
    ) {
      throw new SafeError('Die ausgewählte Datei wurde während der Übergabe verändert.');
    }
    destinationFd = fs.openSync(destination, 'wx', 0o600);
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      let written = 0;
      while (written < read) written += fs.writeSync(destinationFd, chunk, written, read - written);
      position += read;
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

async function anonymizeNext(profile = 'auto', deps = {}) {
  const requested = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(requested)) throw new SafeError('Unbekanntes Profil.');

  bestEffortRetentionCleanup(deps);

  const auditMigration = (deps.migrateLegacyAuditReceipts || migrateLegacyAuditReceipts)();
  if (auditMigration.legacy_pending || auditMigration.migration_errors || auditMigration.write_errors) {
    throw new SafeError(
      'Verarbeitung wurde gestoppt: Alte Audit-Nachweise konnten nicht datensparsam migriert werden. ' +
        'Bitte privacy_status prüfen und die lokale IT-Bereinigung durchführen.'
    );
  }

  const queue = deps.inputQueue || listInput();
  if (!queue.length) {
    return {
      ok: false,
      error: 'input_empty',
      message: 'Keine unterstützte Datei im lokalen Input-Ordner.',
      raw_content_sent_to_claude: false
    };
  }

  const originalSource = queue[0].full;
  const originalName = queue[0].name;
  const ext = path.extname(originalSource).toLowerCase();
  if (queue[0].stat.size > MAX_INPUT_BYTES) throw new SafeError('Eingabedatei ist größer als 100 MB.');

  const r = roots();
  const jobId = newJobId();
  const jobDir = path.join(r.jobs, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  let source = originalSource;
  let claimed = false;
  let stagePackage = null;
  let processedPath = null;
  let reviewPackageId = null;
  let auditReceiptRetained = false;
  const copiedClaim = deps.copyClaim === true;
  try {
    source = copiedClaim
      ? path.join(jobDir, `source${ext}`)
      : path.join(r.input, `.processing_${jobId}_${originalName}`);
    if (copiedClaim) {
      copyRegularFileExclusive(originalSource, source, queue[0].stat);
    } else {
      fs.renameSync(originalSource, source);
    }
    claimed = true;
    if (deps.onClaimed) await deps.onClaimed();

    const converted = await convertDocument(source);
    if (deps.onExtracted) await deps.onExtracted(converted);
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

    const effective = requested === 'auto' ? detectProfileFromMarkdown(converted.markdown) : requested;
    const finalPackage = uniqueDir(r.output, `${safePackageId(effective)}_${crypto.randomBytes(3).toString('hex')}`);
    const packageId = path.basename(finalPackage);
    reviewPackageId = packageId;
    stagePackage = path.join(r.output, `.${packageId}.tmp_${crypto.randomBytes(3).toString('hex')}`);
    fs.mkdirSync(stagePackage, { recursive: true });

    const vis = await processVisuals(converted.attachments, effective, packageId, stagePackage, deps);

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

    const anon = anonymizeMarkdown(rawWithOcr, effective);
    if (deps.onDetected) {
      await deps.onDetected({
        profile: effective,
        detected_identifiers: anon.entityCount,
        technical_review_required: vis.results.some((item) => item.status !== 'included')
      });
    }
    const included = vis.results.filter((x) => x.status === 'included').length;
    const review = vis.results.length - included;

    const mdName = `${packageId}.md`;
    const mdPath = path.join(stagePackage, mdName);
    const finalText =
      complianceHeader(effective, {
        ext,
        passes: anon.passes,
        entityCount: anon.entityCount,
        included,
        review,
        reidentificationRisk: anon.reidentificationRisk
      }) +
      anon.text +
      assetsMarkdown(vis.results);
    fs.writeFileSync(mdPath, finalText, 'utf8');

    // Second, independent gate over the exact bytes that will be released,
    // including the compliance header and the asset section.
    const finalResidual = pii.scanResidual(finalText, effective, anon.dictionary, {
      strongPersonAnchor: anon.strongPersonAnchor
    });
    if (finalResidual.length) {
      const classes = [...new Set(finalResidual.map((x) => x.type))].sort().join(', ');
      throw new SafeError(`Finale Markdown-Datei hat den Residual-Gate nicht bestanden (${classes}).`);
    }

    const auditReceipt = auditRecord(effective, source, {
      entityCount: anon.entityCount,
      passes: anon.passes,
      reidentificationRisk: anon.reidentificationRisk,
      results: vis.results
    });

    const documentSha256 = sha256File(mdPath);
    const manifest = {
      schema: 'eu-privacy-package/2',
      gateway_version: VERSION,
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
        runtime_dependency_install: false
      },
      reidentification_risk: anon.reidentificationRisk,
      assets: vis.results,
      parser_warnings: converted.warnings || [],
      pdf_unextractable_visual_objects: converted.unreviewedVisualCount || 0,
      ai_act: aiActMeta(effective)
    };
    if (deps.companionJobId) manifest.companion_job_id = deps.companionJobId;
    fs.writeFileSync(path.join(stagePackage, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    writePackageAudit(auditReceipt, stagePackage);

    if (deps.beforePublish) {
      await deps.beforePublish({
        package_id: packageId,
        document_sha256: documentSha256,
        profile: effective,
        detected_identifiers: anon.entityCount,
        technical_review_required: review > 0
      });
    }

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
        fs.rmSync(finalPackage, { recursive: true, force: true });
      } catch {
        throw new SafeError(
          'Companion-Release konnte nicht atomar abgeschlossen werden; manuelle Prüfung erforderlich.'
        );
      }
      throw error;
    }
    stagePackage = null;
    processedPath = null;
    auditReceiptRetained = retainAudit(auditReceipt);

    // A zero-day policy removes the original and any withheld preview bytes as
    // soon as the successful package is committed. The new Output package stays
    // readable until the next cleanup trigger, when its directory is expired.
    if ((deps.retentionDays ?? retentionDays()) === 0) {
      bestEffortRetentionCleanup(deps, ['processed', 'review']);
    }

    return {
      ok: true,
      operation_id: auditReceipt.operation_id,
      audit_receipt_retained: auditReceiptRetained,
      profile: effective,
      profile_detection: requested === 'auto' ? 'local-auto' : 'explicit',
      package_id: packageId,
      document_id: mdName,
      verification: 'passed',
      privacy_passes: anon.passes,
      detected_identifiers: anon.entityCount,
      reidentification_risk: anon.reidentificationRisk,
      visual_assets: {
        total: vis.results.length,
        included,
        review_required: review,
        redactions: vis.results.reduce((n, x) => n + (x.redactions || 0), 0)
      },
      original_moved_to_processed: !copiedClaim,
      persistent_mapping_retained: false,
      runtime_dependency_install: false,
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
        fs.rmSync(stagePackage, { recursive: true, force: true });
      } catch {
        /* the staging directory is best-effort cleanup only */
      }
    }
    if (reviewPackageId) {
      const reviewDir = path.join(r.review, reviewPackageId);
      if (fs.existsSync(reviewDir)) {
        try {
          fs.rmSync(reviewDir, { recursive: true, force: true });
        } catch {
          /* review cleanup is best effort; its bytes are never exposed by a read tool */
        }
      }
    }
    if (recoveryError) throw recoveryError;
    if (e instanceof SafeError) throw e;
    throw new SafeError(
      'Verarbeitung wurde sicher gestoppt. Es wurde kein vollständiges Output-Paket freigegeben.'
    );
  } finally {
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
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
  if (!new Set(['.txt', '.docx']).has(ext)) {
    throw new SafeError('Der erste Companion-Slice unterstützt ausschließlich TXT und DOCX.');
  }
  return anonymizeNext(profile, {
    ...deps,
    inputQueue: [{ name: path.basename(absolute), full: absolute, stat }],
    copyClaim: true
  });
}

module.exports = { anonymizeNext, anonymizeSelectedSource, bestEffortRetentionCleanup };
