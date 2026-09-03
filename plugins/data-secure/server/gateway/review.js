'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots, sha256Buffer, sha256File, assertPrivateDirectory, ensurePrivateDirectory, safeRemovePrivateTree } = require('./common');
const { safeResolvePackage, safeFile, issueReadCapability } = require('./package-store');
const { createPrivateWorkStore } = require('./private-work-store');
const { decodePng, encodePng } = require('../image-sanitizer');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');

function writeFileAtomically(target, input, io = fs, platform = process.platform) {
  const temporary = `${target}.tmp_${require('crypto').randomBytes(8).toString('hex')}`;
  const payload = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(String(input), 'utf8');
  let fd;
  try {
    fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    writeFully(fd, payload, io);
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    renameWithTransientRetry(temporary, target, io);
    syncParentDirectory(target, io, platform);
  } finally {
    payload.fill(0);
    if (fd !== undefined) try { io.closeSync(fd); } catch { /* preserve caller failure */ }
    try { io.unlinkSync(temporary); } catch { /* absent after rename */ }
  }
}

function writeReviewMetaAtomically(target, value, io = fs, platform = process.platform) {
  writeFileAtomically(target, `${JSON.stringify(value, null, 2)}\n`, io, platform);
}

function migrateLegacyReviewPreviews() {
  // Compatibility entry point only: startup/listing must never rewrite or
  // decrypt earlier private copies, or touch their installation credentials.
  return Object.freeze({ ok: true, migrated: 0 });
}

function legacyEncryptedPreview(review) {
  return review.preview_encrypted === true ||
    path.extname(String(review.preview_file || '')).toLowerCase() === '.dsart';
}

function plainPreviewSupported(review) {
  return review.schema_version === 2 && review.preview_storage === 'local-plain' &&
    review.preview_encrypted === false && !legacyEncryptedPreview(review);
}

function listReviewItems() {
  const r = roots();
  const items = [];
  for (const pkg of fs.readdirSync(r.review, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const dir = path.join(r.review, pkg.name);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.review.json'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        // New approvals are recorded only by the atomically published package
        // manifest. Review metadata is immutable: rewriting the sole JSON file
        // either reintroduces a parent-directory TOCTOU (rename) or loses crash
        // atomicity (in-place descriptor write).
        try {
          const { m } = safeResolvePackage(j.package_id);
          const approved = (m.assets || []).some((asset) => asset.asset_id === j.asset_id &&
            asset.status === 'included' && asset.human_reviewed === true);
          if (approved) continue;
        } catch { /* an unavailable package cannot prove approval */ }
        items.push({
          review_id: j.review_id,
          package_id: j.package_id,
          asset_id: j.asset_id,
          reason: legacyEncryptedPreview(j) ? 'legacy_encrypted_review_unavailable' : j.reason,
          preview_available: !!j.preview_file && plainPreviewSupported(j),
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
  if (!/^[A-Za-z0-9_-]{1,128}__asset-\d{3,}$/.test(s)) throw new SafeError('Ungültige Review-ID.');
  const cut = s.lastIndexOf('__');
  return { pkg: s.slice(0, cut), asset: s.slice(cut + 2) };
}

function safeReviewMeta(reviewId) {
  const r = roots();
  const { pkg, asset } = splitReviewId(reviewId);
  const dir = path.join(r.review, path.basename(pkg));
  try { assertPrivateDirectory(dir, r.review); }
  catch { throw new SafeError('Review-Pfad ist nicht freigegeben.'); }
  const meta = safeFile(dir, `${asset}.review.json`);
  const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
  if (j.review_id !== String(reviewId) || j.package_id !== pkg || j.asset_id !== asset) {
    throw new SafeError('Review-Metadaten stimmen nicht überein.');
  }
  return { dir, meta, j };
}

function removePreviewAfterDecision(dir, review) {
  if (legacyEncryptedPreview(review)) return false;
  const name = String(review.preview_file || '');
  if (!name) return true;
  if (path.basename(name) !== name) return false;
  const preview = path.join(dir, name);
  try {
    if (fs.existsSync(preview)) {
      const stat = fs.lstatSync(preview, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isFile()) return false;
      const parent = fs.lstatSync(dir, { bigint: true });
      const identity = (value) => ({
        dev: String(value.dev), ino: String(value.ino), birthtimeNs: String(value.birthtimeNs)
      });
      safeRemovePrivateTree(dir, name, {
        expectedParentIdentity: identity(parent),
        expectedIdentity: identity(stat)
      });
    }
    review.preview_file = null;
    review.preview_sha256 = null;
    review.preview_removed_at = new Date().toISOString();
    return true;
  } catch {
    return false;
  }
}

function approveReviewAsset(reviewId, confirmed, deps = {}) {
  if (confirmed !== true) {
    throw new SafeError(
      'Visuelles Asset wird nur nach ausdrücklicher menschlicher Datenschutzprüfung freigegeben.'
    );
  }

  const { dir, j } = safeReviewMeta(reviewId);
  const { p, m } = safeResolvePackage(j.package_id);
  const asset = (m.assets || []).find((x) => x.asset_id === j.asset_id);
  if (!asset) throw new SafeError('Asset fehlt im Paketmanifest.');
  const target = `${j.asset_id}_reviewed.png`;
  const targetRel = `assets/${target}`;
  const alreadyCommitted = asset.status === 'included' && asset.human_reviewed === true &&
    asset.file === targetRel && Number.isSafeInteger(asset.bytes) &&
    /^[a-f0-9]{64}$/u.test(String(asset.sha256 || ''));
  if (alreadyCommitted) {
    const released = safeFile(p, targetRel.split('/').join(path.sep));
    if (fs.lstatSync(released).size !== asset.bytes || sha256File(released) !== asset.sha256) {
      throw new SafeError('Freigegebene Review-Grafik wurde verändert.');
    }
    const previewRemoved = removePreviewAfterDecision(dir, j);
    return {
      ok: true, already_approved: true, review_id: reviewId, package_id: j.package_id,
      asset_id: j.asset_id, approved: true, preview_removed: previewRemoved,
      ...issueReadCapability(j.package_id)
    };
  }

  if (legacyEncryptedPreview(j)) {
    throw new SafeError('Diese ältere Review-Kopie ist verschlüsselt und bleibt unverändert. Das Original bei Bedarf erneut auswählen; andere Dateien können weiterverarbeitet werden.');
  }
  // An expired preview and a preview that never existed need different answers:
  // the first is the retention window doing its job, the second means the image
  // could not be rasterised safely in the first place.
  if (j.preview_expired) {
    throw new SafeError(
      'Die lokale Preview dieses Review-Items ist durch die Aufbewahrungsfrist gelöscht ' +
        'worden und kann nicht mehr freigegeben werden. Das Dokument bei Bedarf erneut ' +
        'verarbeiten; die Grafik bleibt bis dahin zurückgehalten.'
    );
  }
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
  if (path.extname(preview).toLowerCase() !== '.png' || !plainPreviewSupported(j)) {
    throw new SafeError('Nur aktuelle lokale metadatafreie PNG-Previews können direkt freigegeben werden. Das Original bei Bedarf erneut auswählen.');
  }

  const md = safeFile(p, m.document);

  // Approval rewrites document_sha256. Without checking the current hash first,
  // an approval would re-bless a Markdown file that was modified after release
  // and launder the tampering.
  if (m.document_sha256 && sha256File(md) !== m.document_sha256) {
    throw new SafeError('Anonymisierte Markdown-Datei wurde verändert; Freigabe abgebrochen.');
  }

  const privateWorkStore = deps.privateWorkStore || createPrivateWorkStore({ privateRoot: roots().review });
  const data = privateWorkStore.readFile(preview);
  try {
    if (!/^[a-f0-9]{64}$/u.test(String(j.preview_sha256 || '')) ||
        sha256Buffer(data) !== j.preview_sha256) {
      throw new SafeError('Die lokale Review-Preview wurde verändert; bitte Dokument neu verarbeiten.');
    }
    // Filename/metadata alone cannot prove this is a metadata-free PNG. Decode
    // and compare the canonical encoding before any public package write.
    let normalized;
    try { normalized = encodePng(decodePng(data)); }
    catch { throw new SafeError('Die Review-Preview ist kein sicher lesbares PNG.'); }
    try {
      if (!normalized.equals(data)) throw new SafeError('Die Review-Preview ist kein metadatafreies PNG.');
    } finally { normalized.fill(0); }
    const assetsDir = ensurePrivateDirectory(p, 'assets');
    const targetPath = path.join(assetsDir, target);
    const dataHash = sha256Buffer(data);
    let assetCreated = false;
    if (fs.existsSync(targetPath)) {
      const existing = safeFile(p, targetRel.split('/').join(path.sep));
      if (sha256File(existing) !== dataHash || fs.lstatSync(existing).size !== data.length) {
        throw new SafeError('Review-Ziel existiert bereits mit abweichendem Inhalt.');
      }
    } else {
      let descriptor;
      try {
        descriptor = fs.openSync(targetPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        writeFully(descriptor, data, fs);
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor); descriptor = undefined;
        syncParentDirectory(targetPath, fs, process.platform);
      } finally {
        if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* preserve write failure */ }
      }
      assetCreated = true;
    }

    const nextManifest = JSON.parse(JSON.stringify(m));
    const nextAsset = nextManifest.assets.find((x) => x.asset_id === j.asset_id);
    Object.assign(nextAsset, {
      status: 'included',
      reason: 'human_privacy_review_approved',
      file: targetRel,
      output_mime: 'image/png',
      bytes: data.length,
      sha256: dataHash,
      human_reviewed: true
    });
    // The Markdown and its hash are immutable after release. The reviewed
    // image is exposed through the package asset API, so approval needs only
    // one atomic commit point: the manifest rename. A crash before that rename
    // leaves at most an unreferenced verified PNG; a retry can safely reuse it.
    nextManifest.human_visual_reviews = (nextManifest.human_visual_reviews || 0) + 1;
    const atomicWrite = deps.writeFileAtomically || writeFileAtomically;
    let manifestCommitted = false;
    try {
      atomicWrite(path.join(p, 'manifest.json'), `${JSON.stringify(nextManifest, null, 2)}\n`);
      manifestCommitted = true;
    } catch (error) {
      // The writer can report a parent-directory fsync failure after its rename
      // already committed. Rebind the package before deciding whether the new
      // immutable asset is still unreferenced and therefore removable.
      try {
        const rebound = safeResolvePackage(j.package_id);
        const reboundAsset = rebound.m.assets.find((item) => item.asset_id === j.asset_id);
        manifestCommitted = reboundAsset?.status === 'included' && reboundAsset?.human_reviewed === true &&
          reboundAsset?.file === targetRel && reboundAsset?.bytes === data.length && reboundAsset?.sha256 === dataHash;
      } catch { manifestCommitted = false; }
      if (!manifestCommitted && assetCreated) {
        try {
          const stat = fs.lstatSync(targetPath, { bigint: true });
          const parent = fs.lstatSync(assetsDir, { bigint: true });
          const identity = (value) => ({ dev: String(value.dev), ino: String(value.ino), birthtimeNs: String(value.birthtimeNs) });
          safeRemovePrivateTree(assetsDir, target, {
            expectedParentIdentity: identity(parent), expectedIdentity: identity(stat)
          });
        } catch { /* an unreferenced verified file is safer than deleting a replacement */ }
      }
      if (!manifestCommitted) throw error;
    }

    const previewRemoved = removePreviewAfterDecision(dir, j);

    const readGrant = issueReadCapability(j.package_id);
    return {
      ok: true,
      review_id: reviewId,
      package_id: j.package_id,
      asset_id: j.asset_id,
      approved: true,
      preview_removed: previewRemoved,
      ...readGrant
    };
  } finally {
    data.fill(0);
  }
}

module.exports = {
  listReviewItems,
  approveReviewAsset,
  splitReviewId,
  removePreviewAfterDecision,
  migrateLegacyReviewPreviews,
  writeReviewMetaAtomically,
  writeFileAtomically
};
