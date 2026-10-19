'use strict';

// The user-visible result destination is deliberately separate from the
// private DataSecure workspace. Only released Markdown is copied there.
const fs = require('fs');
const crypto = require('node:crypto');
const { readBoundFile } = require('../core/bound-file-io');
const { renameWithTransientRetry } = require('./batch-journal-io');
const { withOwnershipControl } = require('../core/ownership-control');
const path = require('path');
const { dataRoot } = require('../runtime');
const { assertRootSeparation, reserveRootSeparation } = require('./root-boundary');
const { validNativeDirectoryIdentity, validNativeExportBinding } = require('../core/native-directory-identity');

const CONFIG_NAME = 'result-root.json';
const SCHEMA = 'datasecure-result-root/2';
const LEGACY_SCHEMA = 'datasecure-result-root/1';
const NATIVE_SCHEMA = 'datasecure-result-root/3';
const EXPORT_SCHEMA = 'datasecure-result-root/4';
// Newly admitted directories retain exact object IDs and sub-millisecond birth
// times. Old /1 and /2 records do not gain this authority retroactively.
const EXACT_SCHEMA = 'datasecure-result-root/5';
const EXACT_EXPORT_SCHEMA = 'datasecure-result-root/6';
const MAX_CONFIG_BYTES = 128 * 1024;

function configDirectory() { return path.join(dataRoot(), 'settings'); }
function configPath() { return path.join(configDirectory(), CONFIG_NAME); }
function identity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtime_ms: String(Math.trunc(stat.birthtimeMs)) };
}
function sameIdentity(left, right) {
  return left && right && ['dev', 'ino', 'birthtime_ms'].every((key) =>
    typeof left[key] === 'string' && left[key] === right[key]);
}
function exactIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) };
}
function validExactIdentity(value) {
  return value && Object.keys(value).sort().join(',') === 'birthtime_ns,dev,ino' &&
    Object.values(value).every(part => typeof part === 'string' && /^(?:0|[1-9][0-9]{0,39})$/u.test(part)) &&
    BigInt(value.dev) <= (1n << 64n) - 1n && BigInt(value.ino) <= (1n << 64n) - 1n &&
    BigInt(value.birthtime_ns) <= (1n << 128n) - 1n;
}
function inspectExactRoot(root) {
  const selected = inspectRoot(root), named = fs.lstatSync(selected.root, { bigint: true });
  const opened = fs.statSync(selected.root, { bigint: true });
  const expected = exactIdentity(named), actual = exactIdentity(opened);
  if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() || !validExactIdentity(expected) ||
      JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('RESULT_ROOT_UNSAFE');
  return { ...selected, exact_identity: actual };
}
function inspectRoot(root) {
  if (typeof root !== 'string' || !root.trim() || !path.isAbsolute(root)) throw new Error('RESULT_ROOT_UNSAFE');
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
function withConfigWriter(action) {
  ensureConfigDirectory();
  // Same cooperative cross-process guard for EVERY settings writer. Held only
  // for the short synchronous compare/write/rename, never across native await.
  return withOwnershipControl(dataRoot(), action);
}
function displayRoot(root) {
  return typeof root === 'string' && root.length <= 32768 && path.isAbsolute(root) && !/\p{Cc}/u.test(root)
    ? path.resolve(root) : '';
}
function readRecordStatus() {
  let recordedRoot = '', configurationRead = false;
  try {
    const file = configPath();
    const bytes = readBoundFile(file, { maximum: MAX_CONFIG_BYTES, minimum: 1 });
    configurationRead = true;
    const value = JSON.parse(bytes);
    recordedRoot = displayRoot(value?.root);
    const keys = Object.keys(value || {}).sort().join(',');
    const legacy = value?.schema === LEGACY_SCHEMA && keys === 'identity,root,schema';
    const exact = value?.schema === EXACT_SCHEMA && keys === 'exact_identity,identity,notices,root,schema' && validExactIdentity(value.exact_identity) ||
      value?.schema === EXACT_EXPORT_SCHEMA && keys === 'exact_identity,identity,native_export,notices,root,schema' &&
      validExactIdentity(value.exact_identity) && validNativeExportBinding(value.native_export) && value.native_export.root === value.root;
    const native = value?.schema === NATIVE_SCHEMA && keys === 'identity,native_identity,notices,root,schema' && validNativeDirectoryIdentity(value.native_identity) ||
      value?.schema === EXPORT_SCHEMA && keys === 'identity,native_export,notices,root,schema' &&
      validNativeExportBinding(value.native_export) && value.native_export.root === value.root;
    const isCurrent = (native || exact || value?.schema === SCHEMA && keys === 'identity,notices,root,schema') &&
      value.notices && Object.keys(value.notices).sort().join(',') === 'network,sync' &&
      typeof value.notices.network === 'boolean' && typeof value.notices.sync === 'boolean';
    if ((!legacy && !isCurrent) || typeof value.root !== 'string' || !value.identity)
      return { status: 'unavailable', recorded_root: recordedRoot };
    const inspected = exact ? inspectExactRoot(value.root) : inspectRoot(value.root);
    return sameIdentity(inspected.identity, value.identity) && (!exact ||
      JSON.stringify(inspected.exact_identity) === JSON.stringify(value.exact_identity)) ? {
      status: 'available', recorded_root: inspected.root,
      record: { ...value, notices: isCurrent ? value.notices : { sync: false, network: false } },
      digest: crypto.createHash('sha256').update(bytes).digest('hex')
    } : { status: 'unavailable', recorded_root: recordedRoot };
  } catch (error) {
    // A missing selected destination is not a new installation. Once the
    // configuration was read, every target/read/identity failure is unavailable.
    return { status: error?.code === 'ENOENT' && !configurationRead ? 'unconfigured' : 'unavailable',
      recorded_root: recordedRoot };
  }
}
function readRecord() { return readRecordStatus().record || null; }
function readConfiguredResultRootStatus() {
  assertRootSeparation();
  const environment = String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim();
  if (environment) {
    try {
      const root = inspectRoot(environment).root;
      return { status: 'available', root, recorded_root: root };
    } catch { return { status: 'unavailable', root: '', recorded_root: displayRoot(environment) }; }
  }
  const value = readRecordStatus();
  return { status: value.status, root: value.record?.root || '', recorded_root: value.recorded_root };
}
function readConfiguredResultRoot() { return readConfiguredResultRootStatus().root; }
// The last recorded destination path, even when its identity no longer
// matches (replaced folder). It is never used as an export target – only to
// keep shielding that path from becoming a source again.
function recordedResultRootPath() {
  const environment = String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim();
  if (environment && path.isAbsolute(environment)) return path.resolve(environment);
  try {
    const file = configPath();
    const value = JSON.parse(readBoundFile(file, { maximum: MAX_CONFIG_BYTES, minimum: 1 }));
    return [SCHEMA, NATIVE_SCHEMA, EXPORT_SCHEMA, EXACT_SCHEMA, EXACT_EXPORT_SCHEMA].includes(value?.schema) && typeof value.root === 'string' && path.isAbsolute(value.root) ? path.resolve(value.root) : '';
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
    for (const name of ['DataSecure-Output', 'DataSecure-Markdown', 'DataSecure-KI-Export', 'DataSecure-Markdown-Korrektur']) {
      const output = comparablePath(path.join(path.resolve(root), name));
      if (insideOrEqual(selected, output) || insideOrEqual(output, selected)) return true;
    }
  }
  return false;
}
// Native identity and Node identity use different representations. Never
// derive a native binding from stat(), or silently upgrade an old setting.
function readConfiguredNativeRootBinding() {
  assertRootSeparation();
  if (String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim()) return null;
  const record = readRecord();
  return record?.schema === NATIVE_SCHEMA ? { root: record.root, identity: { ...record.native_identity } } : null;
}
function readConfiguredNativeExportBinding() {
  assertRootSeparation();
  if (String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim()) return null;
  const record = readRecord();
  return [EXPORT_SCHEMA, EXACT_EXPORT_SCHEMA].includes(record?.schema) ? structuredClone(record.native_export) : null;
}
// Explicit-export migration only. A stored Node identity is an admission
// expectation, NEVER a native identity. Rust compares it on the held directory
// handle before provisioning and derives its stronger identity from that handle.
async function prepareConfiguredNativeExportBinding(prepare) {
  assertRootSeparation();
  const refused = () => Object.assign(new Error('AI_EXPORT_CONFIGURATION_REQUIRED'), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
  if (String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim() || typeof prepare !== 'function') throw refused();
  // The normal private-namespace policy admits settings; export-stage ACLs
  // intentionally do not apply to an inherited preferences directory. Read
  // the FULL snapshot while both synchronous guards are actually held.
  const snapshot = withConfigWriter(() => withOwnershipControl(configDirectory(), () => readRecordStatus()));
  const record = snapshot.record;
  if (snapshot.status !== 'available' || !record) throw refused();
  if ([EXPORT_SCHEMA, EXACT_EXPORT_SCHEMA].includes(record.schema)) return structuredClone(record.native_export);
  const legacy = record.identity;
  const safeDecimal = value => typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value) &&
    Number.isSafeInteger(Number(value)) && String(Number(value)) === value;
  if (record.schema !== NATIVE_SCHEMA && record.schema !== EXACT_SCHEMA && (!legacy || Object.keys(legacy).sort().join(',') !== 'birthtime_ms,dev,ino' ||
      !Object.values(legacy).every(safeDecimal))) throw refused();
  const admission = record.schema === NATIVE_SCHEMA
    ? { kind: 'native', identity: structuredClone(record.native_identity) }
    : record.schema === EXACT_SCHEMA ? { kind: 'node22_bigint', identity: structuredClone(record.exact_identity) }
    : { kind: 'node22', identity: structuredClone(legacy) };
  const unchanged = () => {
    const current = readRecordStatus();
    if (current.status !== 'available' || current.digest !== snapshot.digest ||
        String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim()) throw refused();
  };
  unchanged();
  let binding;
  try { binding = await prepare({ root: record.root, admission, setting_sha256: snapshot.digest }); }
  catch (error) {
    // Failed legacy admission needs a real native folder selection. Do not
    // translate a conflict from an already configured /4 or existing export.
    if (error?.code === 'AI_EXPORT_CONFLICT') throw refused();
    throw error;
  }
  unchanged();
  if (!validNativeExportBinding(binding) || binding.root !== record.root ||
      record.schema === NATIVE_SCHEMA && !['volume', 'object', 'created_ns'].every(key =>
        binding.root_identity[key] === record.native_identity[key])) throw refused();
  // Retain the ORIGINAL identity and notice state. Fresh stat never re-adopts
  // a replacement folder. No new defaults, source paths or renderer input.
  const payload = JSON.stringify({ schema: record.schema === EXACT_SCHEMA ? EXACT_EXPORT_SCHEMA : EXPORT_SCHEMA,
    root: record.root, identity: record.identity,
    ...(record.schema === EXACT_SCHEMA ? { exact_identity: record.exact_identity } : {}),
    native_export: structuredClone(binding), notices: record.notices });
  if (Buffer.byteLength(payload) > MAX_CONFIG_BYTES) throw refused();
  withConfigWriter(() => {
    unchanged();
    reserveRootSeparation({ resultRoot: record.root });
    const target = configPath(), temporary = path.join(configDirectory(), `${CONFIG_NAME}.${crypto.randomBytes(16).toString('hex')}.tmp`);
    fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { unchanged(); renameWithTransientRetry(temporary, target); }
    finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {} }
  });
  return structuredClone(binding);
}
function saveConfiguredResultRoot(root, options = {}) {
  const native = options.nativeIdentity !== undefined;
  const exporting = options.nativeExport !== undefined;
  if (native && exporting) throw new Error('RESULT_ROOT_UNSAFE');
  if (exporting && (!validNativeExportBinding(options.nativeExport) || options.nativeExport.root !== root)) throw new Error('RESULT_ROOT_UNSAFE');
  if (native && !validNativeDirectoryIdentity(options.nativeIdentity)) throw new Error('RESULT_ROOT_UNSAFE');
  const selected = inspectRoot(root);
  const exact = !native ? inspectExactRoot(root).exact_identity : null;
  assertRootSeparation({ resultRoot: selected.root });
  // Rejected arguments or overlapping roots must not create settings first.
  // Repeat admission under the common writer guard without adopting a target
  // replaced while that guard was being acquired.
  return withConfigWriter(() => {
  const current = inspectRoot(root);
  if (current.root !== selected.root || !sameIdentity(current.identity, selected.identity)) throw new Error('RESULT_ROOT_UNSAFE');
  if (exact && JSON.stringify(inspectExactRoot(root).exact_identity) !== JSON.stringify(exact)) throw new Error('RESULT_ROOT_UNSAFE');
  assertRootSeparation({ resultRoot: selected.root });
  reserveRootSeparation({ resultRoot: selected.root });
  const directory = ensureConfigDirectory();
  const target = configPath();
  const temporary = path.join(directory, `${CONFIG_NAME}.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify({ schema: exporting ? EXACT_EXPORT_SCHEMA : native ? NATIVE_SCHEMA : exact ? EXACT_SCHEMA : SCHEMA,
    root: selected.root, identity: selected.identity,
    ...(exact ? { exact_identity: exact } : {}),
    ...(exporting ? { native_export: structuredClone(options.nativeExport) } : {}),
    ...(native ? { native_identity: { ...options.nativeIdentity } } : {}), notices: {
    sync: isCommonSyncFolder(selected.root), network: isNetworkResultFolder(selected.root)
  } });
  if (Buffer.byteLength(payload, 'utf8') > MAX_CONFIG_BYTES) throw new Error('RESULT_ROOT_UNSAFE');
  fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { renameWithTransientRetry(temporary, target); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {} }
  });
}
function consumeConfiguredResultNotices() {
  assertRootSeparation();
  if (String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim()) {
    const root = readConfiguredResultRoot();
    return { sync: isCommonSyncFolder(root), network: isNetworkResultFolder(root) };
  }
  const initial = readRecord();
  if (!initial || !initial.notices.sync && !initial.notices.network) return { sync: false, network: false };
  return withConfigWriter(() => {
  assertRootSeparation();
  const record = readRecord();
  if (!record) return { sync: false, network: false };
  const notices = { sync: record.notices.sync === true, network: record.notices.network === true };
  if (!notices.sync && !notices.network) return notices;
  const directory = ensureConfigDirectory();
  const target = configPath();
  const temporary = path.join(directory, `${CONFIG_NAME}.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify({ ...record, schema: [NATIVE_SCHEMA, EXPORT_SCHEMA, EXACT_SCHEMA, EXACT_EXPORT_SCHEMA].includes(record.schema) ? record.schema : SCHEMA, notices: { sync: false, network: false } });
  fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { renameWithTransientRetry(temporary, target); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {} }
  return notices;
  });
}
function clearConfiguredResultRoot() {
  assertRootSeparation({ resetResult: true });
  return withConfigWriter(() => {
  assertRootSeparation({ resetResult: true });
  reserveRootSeparation({ resetResult: true });
  try { fs.unlinkSync(configPath()); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  });
}
function resultOutputDirectory(options = {}) {
  const root = options.root || readConfiguredResultRoot();
  if (!root) return '';
  const checked = inspectRoot(root);
  assertRootSeparation({ resultRoot: checked.root });
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
function isNetworkResultFolder(root, platform = process.platform) {
  const selected = String(root || '');
  if (platform === 'win32') return /^(?:\\\\|\/\/)[^\\/]/u.test(selected);
  return /^\/\/[^/]/u.test(selected);
}

module.exports = {
  CONFIG_NAME, SCHEMA, LEGACY_SCHEMA, NATIVE_SCHEMA, EXPORT_SCHEMA, EXACT_SCHEMA, EXACT_EXPORT_SCHEMA, configPath, inspectRoot, readConfiguredResultRoot, readConfiguredResultRootStatus, recordedResultRootPath, readConfiguredNativeRootBinding, readConfiguredNativeExportBinding,
  saveConfiguredResultRoot, prepareConfiguredNativeExportBinding, clearConfiguredResultRoot, resultOutputDirectory,
  consumeConfiguredResultNotices, isCommonSyncFolder, isNetworkResultFolder, visibleResultTreeOverlaps
};
