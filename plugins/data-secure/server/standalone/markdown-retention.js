'use strict';

const fs = require('fs');
const path = require('path');
const { dataRoot } = require('../runtime');
const { assertPrivateDirectory, safeRemovePrivateTree } = require('../gateway/common');
const { ARTIFACT_ID_RE } = require('./markdown-artifact');
const { readMarkdownArtifact } = require('./markdown-store');

function identity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}

// Only private, generated dm containers are disposable here. Visible Markdown,
// mapping CSVs, source folders and historical Processed data are not targets.
function cleanupMarkdownArtifacts(options = {}) {
  const result = { removed: 0, errors: 0, skipped: false };
  const directory = path.join(dataRoot(), 'markdown-artifacts');
  if (!fs.existsSync(directory)) return result;
  if (options.protectionComplete !== true || !(options.protectedIds instanceof Set)) {
    return { ...result, skipped: true };
  }
  const cutoff = Number(options.cutoff);
  if (!Number.isFinite(cutoff)) return { ...result, errors: 1, skipped: true };
  const plan = [];
  let parentIdentity;
  try {
    assertPrivateDirectory(directory, dataRoot());
    parentIdentity = identity(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // Unknown names and abandoned partial publication directories are not
      // proven completed artifacts and are intentionally retained.
      if (!ARTIFACT_ID_RE.test(entry.name) || options.protectedIds.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('MARKDOWN_RETENTION_UNSAFE');
      if (options.force !== true && stat.mtimeMs > cutoff) continue;
      const names = fs.readdirSync(target).sort();
      if (names.join('\0') !== [`${entry.name}.md`, 'manifest.json'].sort().join('\0')) {
        throw new Error('MARKDOWN_RETENTION_UNSAFE');
      }
      const bound = identity(target);
      const manifest = readMarkdownArtifact(entry.name).manifest;
      plan.push({ name: entry.name, identity: bound, manifest: JSON.stringify(manifest) });
    }
  } catch { return { ...result, errors: 1, skipped: true }; }

  for (const item of plan) {
    try {
      assertPrivateDirectory(directory, dataRoot());
      if (JSON.stringify(readMarkdownArtifact(item.name).manifest) !== item.manifest) throw new Error('MARKDOWN_RETENTION_UNSAFE');
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
