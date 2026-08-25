'use strict';

const path = require('path');
const { SafeError, dataRoot } = require('../runtime');
const { ensurePrivateDirectory, safeRemovePrivateTree } = require('./common');

const TOKEN_RE = /^[a-f0-9]{64}$/;

function batchRoot() {
  // Resolve dynamically: tests and supported configuration can change the
  // private root between processes, so this path must never be module-cached.
  const gatewayRoot = ensurePrivateDirectory(path.dirname(dataRoot()), path.basename(dataRoot()));
  return ensurePrivateDirectory(gatewayRoot, 'batches');
}

function validatedToken(token) {
  const value = String(token || '');
  if (!TOKEN_RE.test(value)) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
  return value;
}

function batchPath(token) {
  return path.join(batchRoot(), `${validatedToken(token)}.json`);
}

function workPath(token) {
  return path.join(batchRoot(), `${validatedToken(token)}.work`);
}

function safeRemoveWorkDirectory(token) {
  const value = validatedToken(token);
  try {
    safeRemovePrivateTree(batchRoot(), `${value}.work`);
  } catch {
    throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
  }
}

module.exports = { TOKEN_RE, batchRoot, batchPath, workPath, safeRemoveWorkDirectory };
