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
const {
  anonymizeMarkdown,
  complianceHeader,
  aiActMeta,
  auditRecord,
  writeAudit,
  moveProcessed
} = require('./compliance');

const { MAX_INPUT_BYTES, MAX_TEXT_CHARS, MAX_VISUAL_ASSETS } = LIMITS;

function newJobId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function anonymizeNext(profile = 'auto', deps = {}) {
  const requested = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(requested)) throw new SafeError('Unbekanntes Profil.');

  const queue = listInput();
  if (!queue.length) {
    return {
      ok: false,
      error: 'input_empty',
      message: 'Keine unterstützte Datei im lokalen Input-Ordner.',
      raw_content_sent_to_claude: false
    };
  }

  const source = queue[0].full;
  const ext = path.extname(source).toLowerCase();
  if (queue[0].stat.size > MAX_INPUT_BYTES) throw new SafeError('Eingabedatei ist größer als 100 MB.');

  const r = roots();
  const jobDir = path.join(r.jobs, newJobId());
  fs.mkdirSync(jobDir, { recursive: true });

  let stagePackage = null;
  try {
    const converted = await convertDocument(source);
    if (converted.markdown.length > MAX_TEXT_CHARS) {
      throw new SafeError('Extrahierter Dokumenttext ist zu groß.');
    }
    if ((converted.attachments || []).length > MAX_VISUAL_ASSETS) {
      throw new SafeError('Zu viele visuelle Assets für den automatischen Workflow.');
    }

    const effective = requested === 'auto' ? detectProfileFromMarkdown(converted.markdown) : requested;
    const finalPackage = uniqueDir(r.output, safePackageId(effective));
    const packageId = path.basename(finalPackage);
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
    const finalResidual = pii.scanResidual(finalText, effective, anon.dictionary);
    if (finalResidual.length) {
      const classes = [...new Set(finalResidual.map((x) => x.type))].sort().join(', ');
      throw new SafeError(`Finale Markdown-Datei hat den Residual-Gate nicht bestanden (${classes}).`);
    }

    const manifest = {
      schema: 'eu-privacy-package/2',
      gateway_version: VERSION,
      package_id: packageId,
      created_at: new Date().toISOString(),
      profile: effective,
      source_type: ext.slice(1),
      document: mdName,
      document_sha256: sha256File(mdPath),
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
    fs.writeFileSync(path.join(stagePackage, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    writeAudit(
      auditRecord(effective, source, mdPath, {
        entityCount: anon.entityCount,
        passes: anon.passes,
        reidentificationRisk: anon.reidentificationRisk,
        results: vis.results
      }),
      stagePackage
    );

    fs.renameSync(stagePackage, finalPackage);
    stagePackage = null;
    moveProcessed(source);

    return {
      ok: true,
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
      original_moved_to_processed: true,
      persistent_mapping_retained: false,
      runtime_dependency_install: false,
      raw_content_sent_to_claude: false,
      ai_act: aiActMeta(effective)
    };
  } catch (e) {
    if (stagePackage && fs.existsSync(stagePackage)) {
      try {
        fs.rmSync(stagePackage, { recursive: true, force: true });
      } catch {
        /* the staging directory is best-effort cleanup only */
      }
    }
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

module.exports = { anonymizeNext };
