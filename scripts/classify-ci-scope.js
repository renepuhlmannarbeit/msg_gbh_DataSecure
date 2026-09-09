'use strict';

const fs = require('fs');

function isDocumentationPath(relative) {
  const value = String(relative || '').replaceAll('\\', '/');
  return value === 'README.md' || value === 'CLAUDE.md' ||
    value.startsWith('docs/') || value.startsWith('tasks/') || value.startsWith('.claude/');
}

function classifyChangePaths(paths, options = {}) {
  const normalized = [...new Set(paths.map((entry) => String(entry || '').replaceAll('\\', '/')).filter(Boolean))];
  if (options.fallback || normalized.length === 0) {
    return { profile: 'mixed', run_docs: true, run_product: true };
  }
  const runDocs = normalized.some(isDocumentationPath);
  const runProduct = normalized.some((entry) => !isDocumentationPath(entry));
  return {
    profile: runDocs && runProduct ? 'mixed' : runDocs ? 'docs' : 'product',
    run_docs: runDocs,
    run_product: runProduct
  };
}

function parseNulSeparated(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function printGithubOutputs(result) {
  process.stdout.write(`profile=${result.profile}\n`);
  process.stdout.write(`run_docs=${result.run_docs}\n`);
  process.stdout.write(`run_product=${result.run_product}\n`);
}

module.exports = { classifyChangePaths, isDocumentationPath, parseNulSeparated };

if (require.main === module) {
  printGithubOutputs(classifyChangePaths(parseNulSeparated(fs.readFileSync(0)), {
    fallback: process.argv.includes('--fallback')
  }));
}
