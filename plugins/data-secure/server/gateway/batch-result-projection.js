'use strict';

const core = require('../core/batch-result-projection');

// Product adapter: keep all filesystem and export-store knowledge outside the
// shared policy core. Tests may still inject narrower verifiers explicitly.
function projectBatchResults(state, options = {}) {
  if (state?.schema !== 'datasecure-batch/5') return core.projectBatchResults(state, options);
  const visibleMarkdownCommit = options.visibleMarkdownCommit === true ||
    require('./result-export').completedMarkdownExportMatches(state);
  const verifyMarkdown = options.verifyMarkdown || ((item) => require('../standalone/markdown-store').verifyMarkdownItem(item));
  return core.projectBatchResults(state, { ...options, visibleMarkdownCommit, verifyMarkdown });
}

module.exports = Object.freeze({ ...core, projectBatchResults });
