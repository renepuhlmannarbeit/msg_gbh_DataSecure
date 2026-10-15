'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dataRoot } = require('../runtime');
const { ensurePrivateDirectory, assertPrivateDirectory } = require('../gateway/common');
const { readBoundFileRecord, bindDirectory, assertDirectory, sameFile } = require('../core/bound-file-io');
const { writeFully } = require('../gateway/batch-journal-io');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('../gateway/storage-capacity');
const { createStage, assertStage, publishStage, discardStage, recoverAbandonedStages, inspectStaging } = require('../gateway/package-staging');
const { MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { createAnonymizedArtifact, validateExpectation, validateAnonymizedArtifactForExpectation } = require('./anonymized-artifact');
const invalid = () => Object.assign(new Error('STANDALONE_PUBLICATION_INVALID'), { code: 'STANDALONE_PUBLICATION_INVALID' });
const unconfirmed = () => Object.assign(new Error('BATCH_PUBLICATION_UNCONFIRMED'), { code: 'BATCH_PUBLICATION_UNCONFIRMED' });

// Fixed private namespace, never a caller-selected path and never roots().output.
// Legacy public listing/capabilities cannot discover its ds_ identities.
function anonymizedArtifactRoots() {
  const root = ensurePrivateDirectory(dataRoot(), 'standalone-anonymized-artifacts');
  return { root, output: ensurePrivateDirectory(root, 'Output') };
}
function readInFolder(folder, expected) {
  const context = validateExpectation(expected);
  const directory = bindDirectory(folder);
  const document = `${context.package_id}.md`;
  if (fs.readdirSync(folder).sort().join(',') !== [document, 'manifest.json'].sort().join(',')) throw invalid();
  const manifestRecord = readBoundFileRecord(path.join(folder, 'manifest.json'), { directory, minimum: 1, maximum: 16384 });
  const documentRecord = readBoundFileRecord(path.join(folder, document), { directory, minimum: 1, maximum: MAX_MARKDOWN_CHARS * 4 });
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const manifest = JSON.parse(decoder.decode(manifestRecord.bytes)), markdown = decoder.decode(documentRecord.bytes);
  validateAnonymizedArtifactForExpectation(manifest, markdown, context, manifestRecord.bytes);
  for (const record of [manifestRecord, documentRecord])
    if (!sameFile(fs.lstatSync(record.path, { bigint: true }), record.identity)) throw invalid();
  assertDirectory(directory);
  if (fs.readdirSync(folder).sort().join(',') !== [document, 'manifest.json'].sort().join(',')) throw invalid();
  return { manifest, markdown };
}
function readAnonymizedArtifact(packageId, expected) {
  try {
    const context = validateExpectation(expected); // before any storage effects
    if (packageId !== context.package_id) throw invalid();
    const root = anonymizedArtifactRoots().output, folder = path.join(root, packageId);
    assertPrivateDirectory(folder, root);
    const artifact = readInFolder(folder, context);
    assertPrivateDirectory(folder, root);
    return artifact;
  } catch { throw invalid(); }
}
async function publishAnonymizedArtifact(input, hooks = {}) {
  // Exact closed construction happens before creating the private pool/stage.
  const artifact = createAnonymizedArtifact(input), context = artifact.expectation;
  const roots = anonymizedArtifactRoots(), target = path.join(roots.output, context.package_id);
  const stage = createStage(context.package_id, { roots });
  let committed = false;
  const details = Object.freeze({ package_id: context.package_id, document_sha256: context.document_sha256,
    document_result: artifact.manifest.document_result, profile: context.profile, publication_binding: context });
  try {
    if (fs.existsSync(target)) throw invalid();
    const payload = [[artifact.manifest.document, Buffer.from(artifact.markdown, 'utf8')],
      ['manifest.json', Buffer.from(JSON.stringify(artifact.manifest), 'utf8')]];
    assertStage(stage);
    (hooks.assertWritableCapacity || assertWritableCapacity)({ directory: stage.path,
      bytes: payload.reduce((total, [, bytes]) => total + bytes.length, 0) });
    for (const [name, bytes] of payload) {
      assertStage(stage);
      const fd = fs.openSync(path.join(stage.path, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { writeFully(fd, bytes, fs); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    if (hooks.beforePublish) await hooks.beforePublish(details);
    assertStage(stage);
    readInFolder(stage.path, context); // semantic/byte check AFTER the callback
    assertStage(stage);
    const publication = publishStage(stage, target, hooks.publishPackage);
    committed = publication.published === true;
    // Rename is the commit point, even when the publisher reports a lost ACK.
    // Validate before calling the next state checkpoint and never retract it.
    readAnonymizedArtifact(context.package_id, context);
    if (publication.cleanup_pending) throw unconfirmed();
    if (hooks.afterPublish) await hooks.afterPublish(details);
    return details;
  } catch (error) {
    if (committed) throw unconfirmed();
    throw normalizePostPreflightWriteError(error);
  } finally {
    if (!committed) discardStage(stage);
  }
}
function inspectAnonymizedStaging() { return inspectStaging({ roots: anonymizedArtifactRoots() }); }
function recoverAnonymizedStages() { return recoverAbandonedStages({ roots: anonymizedArtifactRoots() }); }

module.exports = Object.freeze({ anonymizedArtifactRoots, readAnonymizedArtifact, publishAnonymizedArtifact,
  inspectAnonymizedStaging, recoverAnonymizedStages });
