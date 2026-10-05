'use strict';

// A ZIP-installed plugin has no host-managed environment-value editor. Store
// only the chosen root locally; never expose the path in MCP responses/audit.
const fs = require('fs');
const { readBoundFile } = require('../core/bound-file-io');
const { renameWithTransientRetry } = require('./batch-journal-io');
const path = require('path');
const { dataRoot } = require('../runtime');
const { assertRootSeparation, reserveRootSeparation } = require('./root-boundary');

const CONFIG_NAME = 'privacy-root.json';

function configDirectory() { return path.join(dataRoot(), 'settings'); }
function configPath() { return path.join(configDirectory(), CONFIG_NAME); }
function ensureConfigDirectory() {
  const parent = dataRoot();
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('PRIVACY_CONFIG_UNSAFE');
  const directory = configDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('PRIVACY_CONFIG_UNSAFE');
  return directory;
}
function readConfiguredPrivacyRoot() {
  const file = configPath();
  try {
    const value = JSON.parse(readBoundFile(file, { maximum: 4096, minimum: 1 }));
    return typeof value?.root === 'string' && path.isAbsolute(value.root) ? path.resolve(value.root) : '';
  } catch { return ''; }
}
function saveConfiguredPrivacyRoot(root) {
  if (typeof root !== 'string' || !root.trim() || !path.isAbsolute(root)) throw new Error('PRIVACY_CONFIG_UNSAFE');
  const selected = path.resolve(String(root));
  assertRootSeparation({ privacyRoot: selected });
  reserveRootSeparation({ privacyRoot: selected });
  const directory = ensureConfigDirectory();
  const temporary = path.join(directory, `${CONFIG_NAME}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, root: selected }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { renameWithTransientRetry(temporary, configPath()); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {} }
}
function clearConfiguredPrivacyRoot() {
  assertRootSeparation({ resetPrivacy: true });
  reserveRootSeparation({ resetPrivacy: true });
  try { fs.unlinkSync(configPath()); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

module.exports = { configPath, readConfiguredPrivacyRoot, saveConfiguredPrivacyRoot, clearConfiguredPrivacyRoot };
