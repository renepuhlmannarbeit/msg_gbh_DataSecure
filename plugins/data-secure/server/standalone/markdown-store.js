'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { ensurePrivateDirectory, assertPrivateDirectory, safeRemovePrivateTree } = require('../gateway/common');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('../gateway/batch-journal-io');
const { ARTIFACT_ID_RE, createMarkdownArtifact, validateMarkdownArtifact } = require('./markdown-artifact');
const { MAX_MARKDOWN_CHARS } = require('./markdown-contract');

// This store is not the privacy Output tree. No public capability resolver
// accepts its dm_ identities, paths, manifests or unredacted Markdown.
function artifactRoot() { return ensurePrivateDirectory(dataRoot(), 'markdown-artifacts'); }
function metadata(manifest) {
  return {
    artifact_id: manifest.artifact_id,
    artifact_sha256: manifest.document_sha256,
    artifact_bytes: manifest.document_bytes,
    extraction_grade: manifest.extraction_grade,
    reason_codes: [...manifest.reason_codes]
  };
}
function invalid() { const error = new Error('MARKDOWN_ARTIFACT_INVALID'); error.code = 'MARKDOWN_ARTIFACT_INVALID'; return error; }
function readPlainFile(file, maximum) {
  let fd;
  try {
    const named = fs.lstatSync(file);
    if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || named.size > maximum) throw invalid();
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== named.dev || opened.ino !== named.ino || opened.size !== named.size) throw invalid();
    const buffer = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    const bytes = buffer.subarray(0, length);
    const after = fs.lstatSync(file);
    if (bytes.length > maximum || bytes.length !== opened.size || after.dev !== opened.dev || after.ino !== opened.ino || after.isSymbolicLink()) throw invalid();
    return bytes;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function readMarkdownArtifact(artifactId) {
  if (!ARTIFACT_ID_RE.test(String(artifactId || ''))) throw invalid();
  const root = artifactRoot();
  const folder = path.join(root, artifactId);
  assertPrivateDirectory(folder, root);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readPlainFile(path.join(folder, 'manifest.json'), 16384)));
  const markdown = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readPlainFile(path.join(folder, `${artifactId}.md`), MAX_MARKDOWN_CHARS * 4));
  validateMarkdownArtifact(manifest, markdown);
  if (manifest.artifact_id !== artifactId) throw invalid();
  assertPrivateDirectory(folder, root);
  return { manifest, markdown };
}
function verifyMarkdownItem(item) {
  try {
    if (['package_id', 'package_identity', 'read_capability', 'document_result', 'pseudonym_seed', 'pseudonym_registry_state']
      .some((key) => Object.hasOwn(item || {}, key))) return false;
    if (Object.hasOwn(item || {}, 'id') && item.artifact_id !== `dm_${item.id}`) return false;
    const actual = metadata(readMarkdownArtifact(item?.artifact_id).manifest);
    return Object.keys(actual).every((key) => JSON.stringify(actual[key]) === JSON.stringify(item[key]));
  } catch { return false; }
}
async function publishMarkdownArtifact(extraction, artifactId, hooks = {}) {
  const artifact = createMarkdownArtifact(extraction, artifactId);
  const result = metadata(artifact.manifest);
  const root = artifactRoot();
  const target = path.join(root, artifactId);
  // A deterministic identity is never overwritten, including on recovery.
  if (fs.existsSync(target)) throw invalid();
  const temporaryName = `.pending-${artifactId}-${crypto.randomBytes(12).toString('hex')}`;
  const temporary = ensurePrivateDirectory(root, temporaryName);
  const identity = (full) => {
    const stat = fs.lstatSync(full, { bigint: true });
    return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
  };
  const bound = identity(temporary);
  const parentBound = identity(root);
  let published = false;
  try {
    for (const [name, bytes] of [
      [artifact.manifest.document, Buffer.from(artifact.markdown, 'utf8')],
      ['manifest.json', Buffer.from(JSON.stringify(artifact.manifest), 'utf8')]
    ]) {
      assertPrivateDirectory(temporary, root);
      const fd = fs.openSync(path.join(temporary, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { writeFully(fd, bytes, fs); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    if (hooks.beforePublish) await hooks.beforePublish(result);
    assertPrivateDirectory(temporary, root);
    if (fs.existsSync(target)) throw invalid();
    renameWithTransientRetry(temporary, target);
    published = true;
    syncParentDirectory(target, fs, process.platform);
    if (!verifyMarkdownItem(result)) throw invalid();
    if (hooks.afterPublish) await hooks.afterPublish(result);
    return result;
  } catch (error) {
    if (published) {
      const failed = new Error('BATCH_PUBLICATION_UNCONFIRMED');
      failed.code = 'BATCH_PUBLICATION_UNCONFIRMED';
      throw failed;
    }
    throw error;
  } finally {
    if (!published && fs.existsSync(temporary)) {
      safeRemovePrivateTree(root, temporaryName, { expectedIdentity: bound, expectedParentIdentity: parentBound });
    }
  }
}

module.exports = { artifactRoot, metadata, readMarkdownArtifact, verifyMarkdownItem, publishMarkdownArtifact };
