'use strict';

const fs = require('fs');
const path = require('path');
const { dataRoot } = require('../runtime');
const { assertPrivateDirectory, safeRemovePrivateTree, storageStatus } = require('../gateway/common');
const { ARTIFACT_ID_RE } = require('./markdown-artifact');
const { inspectMarkdownArtifactForMaintenance } = require('./markdown-store');
const { bindDirectory, assertDirectory, fileIdentity } = require('../core/bound-file-io');

function identity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}

function assertDirectorySnapshot(binding, snapshot) {
  assertDirectory(binding);
  const stat = fs.lstatSync(binding.path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      JSON.stringify(fileIdentity(stat, true)) !== JSON.stringify(snapshot)) throw new Error('MARKDOWN_RETENTION_UNSAFE');
}

// A missing store must be distinguished from denied I/O or redirected ancestry.
// Bind its closest existing ancestor and recheck the absent components without
// creating the store or treating an inspection error as an empty directory.
function bindExistingArtifactDirectory(directory) {
  const missing = [];
  let existing = directory;
  for (;;) {
    try { fs.lstatSync(existing, { bigint: true }); break; }
    catch (error) {
      if (error?.code !== 'ENOENT' || path.dirname(existing) === existing) throw error;
      missing.push(existing);
      existing = path.dirname(existing);
    }
  }
  const binding = bindDirectory(existing);
  for (const absent of missing.reverse()) {
    try { fs.lstatSync(absent); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    throw new Error('MARKDOWN_RETENTION_UNSAFE');
  }
  assertDirectory(binding);
  return missing.length ? null : binding;
}

// Only private, generated dm containers are disposable here. Visible Markdown,
// mapping CSVs, source folders and historical Processed data are not targets.
function cleanupMarkdownArtifacts(options = {}) {
  const result = { removed: 0, errors: 0, skipped: false };
  const directory = path.join(dataRoot(), 'markdown-artifacts');
  const plan = [];
  let parentIdentity, directoryBinding;
  try {
    if (!storageStatus(directory).safe) throw new Error('MARKDOWN_RETENTION_UNSAFE');
    directoryBinding = bindExistingArtifactDirectory(directory);
    if (!directoryBinding) return result;
    assertPrivateDirectory(directory, dataRoot());
    const snapshot = fileIdentity(fs.lstatSync(directory, { bigint: true }), true);
    parentIdentity = identity(directory);
    const cutoff = Number(options.cutoff);
    if (!Number.isFinite(cutoff)) throw new Error('MARKDOWN_RETENTION_UNSAFE');
    const candidates = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // Unknown names and abandoned partial publication directories are not
      // proven completed artifacts and are intentionally retained.
      if (!ARTIFACT_ID_RE.test(entry.name) ||
          (options.protectedIds instanceof Set && options.protectedIds.has(entry.name))) continue;
      const target = path.join(directory, entry.name);
      const stat = fs.lstatSync(target, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('MARKDOWN_RETENTION_UNSAFE');
      if (options.force !== true && Number(stat.mtimeMs) > cutoff) continue;
      const candidateBinding = bindDirectory(target);
      const candidateSnapshot = fileIdentity(stat, true);
      assertDirectorySnapshot(candidateBinding, candidateSnapshot);
      candidates.push({ name: entry.name, snapshot: candidateSnapshot, binding: candidateBinding,
        identity: { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) } });
    }
    assertDirectorySnapshot(directoryBinding, snapshot);
    if (!candidates.length) return result;
    // Keep the original complete journal/export-commit proof. Only its timing
    // changes: an absent, empty or entirely fresh store needs no protection set.
    const protection = typeof options.getProtection === 'function' ? options.getProtection() :
      { ids: options.protectedIds, complete: options.protectionComplete };
    assertDirectorySnapshot(directoryBinding, snapshot);
    if (protection?.complete !== true || !(protection.ids instanceof Set)) return { ...result, skipped: true };
    for (const candidate of candidates) {
      if (protection.ids.has(candidate.name)) continue;
      const target = path.join(directory, candidate.name);
      assertDirectorySnapshot(candidate.binding, candidate.snapshot);
      const names = fs.readdirSync(target).sort();
      if (names.join('\0') !== [`${candidate.name}.md`, 'manifest.json'].sort().join('\0')) {
        throw new Error('MARKDOWN_RETENTION_UNSAFE');
      }
      const manifest = inspectMarkdownArtifactForMaintenance(candidate.name).manifest;
      plan.push({ name: candidate.name, identity: candidate.identity, manifest: JSON.stringify(manifest) });
    }
    assertDirectorySnapshot(directoryBinding, snapshot);
  } catch { return { ...result, errors: 1, skipped: true }; }

  for (const item of plan) {
    try {
      assertDirectory(directoryBinding);
      assertPrivateDirectory(directory, dataRoot());
      if (JSON.stringify(inspectMarkdownArtifactForMaintenance(item.name).manifest) !== item.manifest) throw new Error('MARKDOWN_RETENTION_UNSAFE');
      safeRemovePrivateTree(directory, item.name, {
        expectedParentIdentity: parentIdentity, expectedIdentity: item.identity
      });
      result.removed++;
    } catch {
      // A locked/replaced artifact stops this pass. Never retry through a
      // stronger primitive, traverse a link or broaden the selected paths.
      result.errors++;
      result.skipped = true;
      break;
    }
  }
  return result;
}

module.exports = { cleanupMarkdownArtifacts };
