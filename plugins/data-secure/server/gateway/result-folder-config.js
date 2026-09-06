'use strict';

// The user-visible result destination is deliberately separate from the
// private DataSecure workspace. Only released Markdown is copied there.
const fs = require('fs');
const { renameWithTransientRetry } = require('./batch-journal-io');
const path = require('path');
const { dataRoot } = require('../runtime');

const CONFIG_NAME = 'result-root.json';
const SCHEMA = 'datasecure-result-root/1';

function configDirectory() { return path.join(dataRoot(), 'settings'); }
function configPath() { return path.join(configDirectory(), CONFIG_NAME); }
function identity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtime_ms: String(Math.trunc(stat.birthtimeMs)) };
}
function sameIdentity(left, right) {
  return left && right && ['dev', 'ino', 'birthtime_ms'].every((key) =>
    typeof left[key] === 'string' && left[key] === right[key]);
}
function inspectRoot(root) {
  const selected = path.resolve(String(root || ''));
  if (!path.isAbsolute(selected)) throw new Error('RESULT_ROOT_UNSAFE');
  const named = fs.lstatSync(selected);
  const resolved = fs.realpathSync.native(selected);
  const opened = fs.statSync(selected);
  const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino ||
      comparable(path.resolve(resolved)) !== comparable(selected)) throw new Error('RESULT_ROOT_UNSAFE');
  return { root: selected, identity: identity(opened) };
}
function ensureConfigDirectory() {
  const parent = dataRoot();
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = configDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const candidate of [parent, directory]) {
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('RESULT_CONFIG_UNSAFE');
  }
  return directory;
}
function readRecord() {
  try {
    const file = configPath();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4096) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || value.schema !== SCHEMA || typeof value.root !== 'string' ||
        !value.identity || Object.keys(value).sort().join(',') !== 'identity,root,schema') return null;
    const current = inspectRoot(value.root);
    return sameIdentity(current.identity, value.identity) ? value : null;
  } catch { return null; }
}
function readConfiguredResultRoot() {
  const environment = String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim();
  if (environment) {
    try { return inspectRoot(environment).root; } catch { return ''; }
  }
  return readRecord()?.root || '';
}
// The last recorded destination path, even when its identity no longer
// matches (replaced folder). It is never used as an export target – only to
// keep shielding that path from becoming a source again.
function recordedResultRootPath() {
  const environment = String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim();
  if (environment && path.isAbsolute(environment)) return path.resolve(environment);
  try {
    const file = configPath();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4096) return '';
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value?.schema === SCHEMA && typeof value.root === 'string' && path.isAbsolute(value.root) ? path.resolve(value.root) : '';
  } catch { return ''; }
}
// Canonical, case-folded comparison path: the real path of the longest existing
// prefix plus the remaining segments. This resolves Windows 8.3 aliases and
// symbolic prefixes so that two spellings of one location compare equal.
function comparablePath(target) {
  const requested = path.resolve(String(target || ''));
  let probe = requested;
  const suffix = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    suffix.unshift(path.basename(probe));
    probe = parent;
  }
  let resolved;
  try { resolved = fs.realpathSync.native(probe); } catch { resolved = probe; }
  const full = path.join(resolved, ...suffix);
  return process.platform === 'win32' ? full.toLowerCase() : full;
}
function insideOrEqual(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
// True when `target` is the visible DataSecure-Output tree of the configured or
// last recorded result root, lies inside it, or contains it. Released results
// must never re-enter the pipeline as sources (DS-069).
function visibleResultTreeOverlaps(target) {
  const roots = new Set();
  const configured = readConfiguredResultRoot();
  if (configured) roots.add(configured);
  const recorded = recordedResultRootPath();
  if (recorded) roots.add(recorded);
  if (!roots.size) return false;
  const selected = comparablePath(target);
  for (const root of roots) {
    for (const name of ['DataSecure-Output', 'DataSecure-Markdown']) {
      const output = comparablePath(path.join(path.resolve(root), name));
      if (insideOrEqual(selected, output) || insideOrEqual(output, selected)) return true;
    }
  }
  return false;
}
function saveConfiguredResultRoot(root) {
  const selected = inspectRoot(root);
  const directory = ensureConfigDirectory();
  const target = configPath();
  const temporary = path.join(directory, `${CONFIG_NAME}.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify({ schema: SCHEMA, root: selected.root, identity: selected.identity });
  fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { renameWithTransientRetry(temporary, target); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {} }
}
function clearConfiguredResultRoot() {
  try { fs.unlinkSync(configPath()); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
function resultOutputDirectory(options = {}) {
  const root = options.root || readConfiguredResultRoot();
  if (!root) return '';
  const checked = inspectRoot(root);
  const output = path.join(checked.root, 'DataSecure-Output');
  if (!fs.existsSync(output)) fs.mkdirSync(output, { mode: 0o700 });
  const stat = fs.lstatSync(output);
  const real = fs.realpathSync.native(output);
  const relative = path.relative(checked.root, real);
  if (!stat.isDirectory() || stat.isSymbolicLink() || relative !== 'DataSecure-Output') {
    throw new Error('RESULT_ROOT_UNSAFE');
  }
  return output;
}
function isCommonSyncFolder(root) {
  return /(?:^|[\\/])(?:OneDrive(?:\s*-\s*[^\\/]*)?|Dropbox|Google Drive|iCloud Drive)(?:[\\/]|$)/iu.test(String(root || ''));
}

module.exports = {
  CONFIG_NAME, SCHEMA, configPath, inspectRoot, readConfiguredResultRoot, recordedResultRootPath,
  saveConfiguredResultRoot, clearConfiguredResultRoot, resultOutputDirectory,
  isCommonSyncFolder, visibleResultTreeOverlaps
};
