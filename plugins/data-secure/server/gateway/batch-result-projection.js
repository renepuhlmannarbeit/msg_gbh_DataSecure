'use strict';

const core = require('../core/batch-result-projection');
const { isMarkdownBatch } = require('../core/processing-mode');
const { contentOptionsForBatch } = require('../core/content-options');

// Product adapter: keep all filesystem and export-store knowledge outside the
// shared policy core. Tests may still inject narrower verifiers explicitly.
function projectBatchResults(state, options = {}) {
  let converting;
  try { converting = isMarkdownBatch(state); } catch { return core.projectBatchResults(state, options); }
  if (!converting) return core.projectBatchResults(state, options);
  const visibleMarkdownCommit = options.visibleMarkdownCommit === true ||
    require('./result-export').completedMarkdownExportMatches(state);
  const verifyMarkdown = options.verifyMarkdown || ((item) => require('../standalone/markdown-store').verifyMarkdownItem(item, contentOptionsForBatch(state)));
  return core.projectBatchResults(state, { ...options, visibleMarkdownCommit, verifyMarkdown });
}

module.exports = Object.freeze({ ...core, projectBatchResults });
