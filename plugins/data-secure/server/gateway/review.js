'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots, sha256Buffer, sha256File } = require('./common');
const { safeResolvePackage, safeFile } = require('./package-store');

function listReviewItems() {
  const r = roots();
  const items = [];
  for (const pkg of fs.readdirSync(r.review, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const dir = path.join(r.review, pkg.name);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.review.json'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (j.approved) continue;
        items.push({
          review_id: j.review_id,
          package_id: j.package_id,
          asset_id: j.asset_id,
          reason: j.reason,
          preview_available: !!j.preview_file,
          created_at: j.created_at
        });
      } catch {
        /* an unreadable review file is skipped, never guessed at */
      }
    }
  }
  return { ok: true, items };
}

// A review id is "<package id>__<asset id>". Splitting on the first separator
// would mis-parse any package id that contains one, so the asset part is taken
// from the end.
function splitReviewId(reviewId) {
  const s = String(reviewId || '');
  if (!/^.+__asset-\d{3,}$/.test(s)) throw new SafeError('Ungültige Review-ID.');
  const cut = s.lastIndexOf('__');
  return { pkg: s.slice(0, cut), asset: s.slice(cut + 2) };
}

function safeReviewMeta(reviewId) {
  const r = roots();
  const { pkg, asset } = splitReviewId(reviewId);
  const dir = path.join(r.review, path.basename(pkg));
  const meta = path.join(dir, `${asset}.review.json`);
  if (!fs.existsSync(meta)) throw new SafeError('Review-Item nicht gefunden.');
  const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
  if (j.review_id !== String(reviewId)) throw new SafeError('Review-Metadaten stimmen nicht überein.');
  return { dir, meta, j };
}

function approveReviewAsset(reviewId, confirmed) {
  if (confirmed !== true) {
    throw new SafeError(
      'Visuelles Asset wird nur nach ausdrücklicher menschlicher Datenschutzprüfung freigegeben.'
    );
  }

  const { dir, meta, j } = safeReviewMeta(reviewId);
  if (j.approved) return { ok: true, already_approved: true, review_id: reviewId };
  if (!j.preview_file) {
    throw new SafeError(
      'Für dieses Review-Item existiert kein sicher rasterisierter Preview-Kandidat. ' +
        'Manuelle Konvertierung erforderlich.'
    );
  }

  const preview = safeFile(dir, j.preview_file);
  if (j.preview_sha256 && sha256File(preview) !== j.preview_sha256) {
    throw new SafeError('Review-Preview wurde verändert; bitte Dokument neu verarbeiten.');
  }
  if (path.extname(preview).toLowerCase() !== '.png') {
    throw new SafeError('Nur metadatafreie PNG-Previews können direkt freigegeben werden.');
  }

  const { p, m } = safeResolvePackage(j.package_id);
  const md = safeFile(p, m.document);

  // Approval rewrites document_sha256. Without checking the current hash first,
  // an approval would re-bless a Markdown file that was modified after release
  // and launder the tampering.
  if (m.document_sha256 && sha256File(md) !== m.document_sha256) {
    throw new SafeError('Anonymisierte Markdown-Datei wurde verändert; Freigabe abgebrochen.');
  }

  const asset = (m.assets || []).find((x) => x.asset_id === j.asset_id);
  if (!asset) throw new SafeError('Asset fehlt im Paketmanifest.');

  const data = fs.readFileSync(preview);
  const assetsDir = path.join(p, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const target = `${j.asset_id}_reviewed.png`;
  fs.copyFileSync(preview, path.join(assetsDir, target));

  Object.assign(asset, {
    status: 'included',
    reason: 'human_privacy_review_approved',
    file: `assets/${target}`,
    output_mime: 'image/png',
    bytes: data.length,
    sha256: sha256Buffer(data),
    human_reviewed: true
  });

  fs.writeFileSync(
    md,
    `${fs.readFileSync(md, 'utf8')}\n\n### Menschlich freigegebene Grafik ${j.asset_id}\n\n` +
      `![Geprüfte Grafik](./assets/${target})\n`,
    'utf8'
  );

  m.document_sha256 = sha256File(md);
  m.human_visual_reviews = (m.human_visual_reviews || 0) + 1;
  fs.writeFileSync(path.join(p, 'manifest.json'), JSON.stringify(m, null, 2), 'utf8');

  j.approved = true;
  j.approved_at = new Date().toISOString();
  fs.writeFileSync(meta, JSON.stringify(j, null, 2), 'utf8');

  return { ok: true, review_id: reviewId, package_id: j.package_id, asset_id: j.asset_id, approved: true };
}

module.exports = { listReviewItems, approveReviewAsset, splitReviewId };
