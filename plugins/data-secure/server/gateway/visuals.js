'use strict';

const fs = require('fs');
const path = require('path');
const { rasterizeToPng, ocrPngDetailed } = require('../runtime');
const { VisualBudgetError } = require('../windows-visual');
const {
  decodePng,
  encodePng,
  decodeBmp,
  flattenWords,
  normalizeMime
} = require('../image-sanitizer');
const { LIMITS, roots, sha256Buffer, sha256File } = require('./common');

const { MAX_ASSET_BYTES } = LIMITS;
const VISUAL_TOTAL_TIMEOUT_MS = 3 * 60 * 1000;

function visualDeadline(deps) {
  if (Number.isFinite(deps.deadlineAt)) return deps.deadlineAt;
  const requested = Number(deps.totalTimeoutMs);
  const budget = Number.isFinite(requested) ? Math.max(1, Math.min(VISUAL_TOTAL_TIMEOUT_MS, requested)) : VISUAL_TOTAL_TIMEOUT_MS;
  return Date.now() + budget;
}

async function withinVisualBudget(fn, args, deadlineAt) {
  const remaining = Math.floor(deadlineAt - Date.now());
  if (remaining <= 0) throw new VisualBudgetError('Die visuelle Verarbeitung überschritt das Gesamtzeitlimit.');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(...args, { timeoutMs: remaining })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(
          new VisualBudgetError('Die visuelle Verarbeitung überschritt das Gesamtzeitlimit.')
        ), remaining);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function normalizePng(buf, mime) {
  if (mime === 'image/png') return encodePng(decodePng(buf));
  if (mime === 'image/bmp') return encodePng(decodeBmp(buf));
  return null;
}

function languageTag() {
  const l = String(process.env.EU_PRIVACY_LANGUAGE || 'de').toLowerCase();
  return l.startsWith('de') ? 'de-DE' : 'en-US';
}

// Every visual stays local by default. OCR can contribute text to the same PII
// gate as the document body, but it is not proof that faces, signatures, logos,
// QR codes or other identifying pixels are absent.
async function prepareVisual(att, profile, deps = {}) {
  const raster = deps.rasterizeToPng || rasterizeToPng;
  const ocr = deps.ocrPngDetailed || ocrPngDetailed;
  const deadlineAt = visualDeadline(deps);
  const mime = normalizeMime(att);
  const ext = String(att.extension || path.extname(att.name || '').slice(1) || 'bin').toLowerCase();

  let raw;
  try {
    raw = Buffer.from(String(att.data || ''), 'base64');
  } catch {
    return { status: 'review_required', reason: 'invalid_visual_data', reviewData: null, reviewExt: ext, ocrText: '' };
  }

  if (!raw.length || raw.length > MAX_ASSET_BYTES) {
    return {
      status: 'review_required',
      reason: raw.length ? 'visual_too_large' : 'empty_visual',
      reviewData: raw,
      reviewExt: ext,
      ocrText: ''
    };
  }

  let png = null;
  try {
    png = normalizePng(raw, mime);
  } catch {
    png = null;
  }
  if (!png) {
    try {
      const rasterized = await withinVisualBudget(raster, [raw, ext], deadlineAt);
      png = normalizePng(rasterized, 'image/png');
    } catch (error) {
      if (error instanceof VisualBudgetError) throw error;
      png = null;
    }
  }

  const reviewData = png || raw;
  const reviewExt = png ? 'png' : ext;

  let ocrData = null;
  let ocrText = '';
  if (png) {
    try {
      ocrData = await withinVisualBudget(ocr, [png, languageTag()], deadlineAt);
      ocrText = flattenWords(ocrData).text || String(ocrData?.text || '').trim();
    } catch (error) {
      if (error instanceof VisualBudgetError) throw error;
      ocrData = null;
    }
  }

  // This decision is deliberately profile-independent. OCR only recognises
  // text; it cannot safely classify all identifying visual content.
  return {
    status: 'review_required',
    reason: 'visual_local_review_required',
    reviewData,
    reviewExt,
    ocrText,
    candidatePng: png
  };
}

function safeReviewFilename(id, ext) {
  const clean = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${id}.${clean}`;
}

function writeReviewItem(packageId, assetId, res, packageDir) {
  const r = roots();
  const dir = path.join(r.review, packageId);
  fs.mkdirSync(dir, { recursive: true });

  const reviewId = `${packageId}__${assetId}`;
  let file = null;
  if (res.reviewData) {
    file = safeReviewFilename(assetId, res.reviewExt);
    fs.writeFileSync(path.join(dir, file), res.reviewData);
  }

  const meta = {
    review_id: reviewId,
    package_id: packageId,
    asset_id: assetId,
    reason: res.reason,
    preview_file: file,
    preview_sha256: file ? sha256File(path.join(dir, file)) : null,
    created_at: new Date().toISOString(),
    approved: false,
    package_dir: path.basename(packageDir)
  };
  fs.writeFileSync(path.join(dir, `${assetId}.review.json`), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

async function processVisuals(attachments, profile, packageId, stagePackage, deps = {}) {
  if (deps.removeImages === true) {
    return {
      results: (attachments || []).map((att, index) => ({
        asset_id: `asset-${String(index + 1).padStart(3, '0')}`,
        status: 'removed',
        reason: 'removed_by_explicit_text_only_request',
        original_mime: normalizeMime(att),
        redactions: 0
      })),
      ocrExtras: ''
    };
  }

  const assetsDir = path.join(stagePackage, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const results = [];
  const ocrExtras = [];
  let seq = 0;
  const deadlineAt = visualDeadline(deps);

  for (const att of attachments || []) {
    seq++;
    const assetId = `asset-${String(seq).padStart(3, '0')}`;
    const res = await prepareVisual(att, profile, { ...deps, deadlineAt });

    // The recognised text is released even for a withheld image, but only after
    // it has passed the text privacy gate together with the document body.
    if (res.ocrText) ocrExtras.push(`\n\n### Extrahierter Bildtext ${seq}\n\n${res.ocrText}`);

    const item = {
      asset_id: assetId,
      status: res.status,
      reason: res.reason,
      original_mime: normalizeMime(att),
      redactions: res.redactions || 0
    };

    if (res.status === 'included' && res.data) {
      const file = `${assetId}.png`;
      fs.writeFileSync(path.join(assetsDir, file), res.data);
      Object.assign(item, {
        file: `assets/${file}`,
        output_mime: 'image/png',
        bytes: res.data.length,
        sha256: sha256Buffer(res.data)
      });
    } else {
      const meta = writeReviewItem(packageId, assetId, res, stagePackage);
      item.review_id = meta.review_id;
      item.preview_available = !!meta.preview_file;
    }

    results.push(item);
  }

  return { results, ocrExtras: ocrExtras.join('') };
}

function assetsMarkdown(results) {
  if (!results.length) return '';
  const out = ['', '## Visuelle Anlagen', ''];
  for (const x of results) {
    const n = x.asset_id.replace('asset-', '');
    if (x.status === 'included') {
      out.push(`![Sichere Grafik ${n}](./${x.file})`);
    } else if (x.status === 'removed') {
      out.push(`> Grafik ${n} wurde auf ausdrücklichen Wunsch entfernt und nicht in das Markdown übernommen.`);
    } else {
      out.push(
        `> Grafik ${n} wurde nicht an Claude freigegeben. Lokale visuelle Prüfung erforderlich (${x.reason}).`
      );
    }
    out.push('');
  }
  return out.join('\n');
}

module.exports = {
  VISUAL_TOTAL_TIMEOUT_MS, visualDeadline, withinVisualBudget,
  prepareVisual, processVisuals, assetsMarkdown, safeReviewFilename
};
