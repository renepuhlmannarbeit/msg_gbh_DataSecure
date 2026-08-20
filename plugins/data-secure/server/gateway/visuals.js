'use strict';

const fs = require('fs');
const path = require('path');
const { rasterizeToPng, ocrPngDetailed } = require('../runtime');
const pii = require('../pii-engine');
const {
  decodePng,
  encodePng,
  decodeBmp,
  flattenWords,
  entityRects,
  redactEditable,
  normalizeMime
} = require('../image-sanitizer');
const { minOcrCharsFor } = require('../images/ocr-map');
const { LIMITS, roots, sha256Buffer, sha256File } = require('./common');

const { MAX_ASSET_BYTES } = LIMITS;

function normalizePng(buf, mime) {
  if (mime === 'image/png') return encodePng(decodePng(buf));
  if (mime === 'image/bmp') return encodePng(decodeBmp(buf));
  return null;
}

function languageTag() {
  const l = String(process.env.EU_PRIVACY_LANGUAGE || 'de').toLowerCase();
  return l.startsWith('de') ? 'de-DE' : 'en-US';
}

function visualMode() {
  return String(process.env.EU_PRIVACY_VISUAL_MODE || 'strict').toLowerCase();
}

// Every early return here is a fail-closed decision: the asset stays local and
// only a human can release it. `included` is reached exclusively via an OCR pass
// that found nothing, or via a redaction that a second OCR pass confirmed.
async function prepareVisual(att, profile, deps = {}) {
  const raster = deps.rasterizeToPng || rasterizeToPng;
  const ocr = deps.ocrPngDetailed || ocrPngDetailed;
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
      png = await raster(raw, ext);
    } catch {
      png = null;
    }
  }

  const reviewData = png || raw;
  const reviewExt = png ? 'png' : ext;

  let ocrData = null;
  let ocrText = '';
  if (png) {
    try {
      ocrData = await ocr(png, languageTag());
      ocrText = flattenWords(ocrData).text || String(ocrData?.text || '').trim();
    } catch {
      ocrData = null;
    }
  }

  // Applicant and personnel visuals are never auto-released: a photo, a
  // signature or a company logo re-identifies the person directly.
  if (profile === 'applicant' || profile === 'personnel_profile') {
    return {
      status: 'review_required',
      reason: profile === 'applicant' ? 'applicant_visual_human_review' : 'personnel_visual_human_review',
      reviewData,
      reviewExt,
      ocrText,
      candidatePng: png
    };
  }

  if (!png) {
    return { status: 'review_required', reason: 'visual_not_rasterized_safely', reviewData, reviewExt, ocrText };
  }
  if (!ocrData) {
    return { status: 'review_required', reason: 'ocr_unavailable_fail_closed', reviewData: png, reviewExt: 'png', ocrText: '' };
  }

  const flat = flattenWords(ocrData);
  const spans = pii.sensitiveSpans(ocrText, profile);

  if (!spans.length) {
    // Too little recognised text means OCR probably failed rather than that the
    // image is clean, so the profile-specific minimum applies.
    const minChars = minOcrCharsFor(profile, visualMode());
    if (ocrText.trim().length < minChars) {
      return {
        status: 'review_required',
        reason: 'insufficient_ocr_for_automatic_release',
        reviewData: png,
        reviewExt: 'png',
        ocrText
      };
    }
    return { status: 'included', reason: 'ocr_clean_metadata_free', data: png, mime: 'image/png', ocrText, redactions: 0 };
  }

  const rects = entityRects(spans, flat.words);
  if (!rects.length) {
    return { status: 'review_required', reason: 'pii_bbox_mapping_failed', reviewData: png, reviewExt: 'png', ocrText };
  }

  let redacted;
  try {
    redacted = redactEditable(png, 'image/png', rects);
  } catch {
    return { status: 'review_required', reason: 'visual_redaction_failed', reviewData: png, reviewExt: 'png', ocrText };
  }

  // Verify the redaction by reading the image back: a black box that failed to
  // cover the glyphs must not be released. The check asks whether the redacted
  // strings are gone and no direct identifier remains, not whether new
  // low-confidence candidates appeared - after a name is blacked out the next
  // capitalised words move into its position, and a candidate scan would flag
  // those forever.
  const redactedValues = spans.map((s) => s.text);
  try {
    const after = await ocr(redacted, languageTag());
    const afterText = flattenWords(after).text || String(after?.text || '');
    if (pii.verifyRedactedText(afterText, redactedValues).length) {
      return {
        status: 'review_required',
        reason: 'residual_visual_pii',
        reviewData: redacted,
        reviewExt: 'png',
        ocrText,
        redactions: rects.length
      };
    }
  } catch {
    return {
      status: 'review_required',
      reason: 'post_redaction_ocr_failed',
      reviewData: redacted,
      reviewExt: 'png',
      ocrText,
      redactions: rects.length
    };
  }

  return {
    status: 'included',
    reason: 'pii_redacted_and_verified',
    data: redacted,
    mime: 'image/png',
    ocrText,
    redactions: rects.length
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
  const assetsDir = path.join(stagePackage, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const results = [];
  const ocrExtras = [];
  let seq = 0;

  for (const att of attachments || []) {
    seq++;
    const assetId = `asset-${String(seq).padStart(3, '0')}`;
    const res = await prepareVisual(att, profile, deps);

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
    } else {
      out.push(
        `> Grafik ${n} wurde nicht an Claude freigegeben. Lokale visuelle Prüfung erforderlich (${x.reason}).`
      );
    }
    out.push('');
  }
  return out.join('\n');
}

module.exports = { prepareVisual, processVisuals, assetsMarkdown, safeReviewFilename };
