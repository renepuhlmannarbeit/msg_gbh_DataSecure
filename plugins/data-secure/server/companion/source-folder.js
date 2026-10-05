'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { LIMITS, hasReparseComponent, hasReparseComponentAsync, isManagedStagingPath } = require('../gateway/common');
const { visibleResultTreeOverlaps } = require('../gateway/result-folder-config');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { windowsFolderDialogScript } = require('./windows-folder-dialog');
const { SOURCE_TYPES, sourceArtifactReason, sourceArtifactReasonAsync, validateSelectedPath, validateSelectedPathAsync, selectionCancelledError, runPickerAsync, throwIfSelectionAborted, WINDOWS_PICKER_UTF8, pickerOutputMaxBuffer, documentedNativeCancellation } = require('./file-picker');

const SOURCE_FOLDER_TITLE = 'Ordner mit DataSecure lokal verarbeiten';
const SOURCE_FOLDER_CANCELLED = '__DATASECURE_SOURCE_FOLDER_CANCELLED__';
const TREE_LIMITS = Object.freeze({ maxDirectories: 1024, maxEntries: 4096, maxDepth: 32 });
const MAX_REPORTED_UNSUPPORTED = 200;
const SELECTION_REASON_CODES = new Set(['SOURCE_FORMAT_SIZE_LIMIT', 'SOURCE_FILE_EMPTY',
  'SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_READ_FAILED', 'SOURCE_ACCESS_DENIED',
  'SOURCE_PATH_UNSAFE', 'SOURCE_IDENTITY_CHANGED']);
function folderFailure(code, message) {
  return Object.assign(new SafeError(message), { code });
}
function folderReadFailure(error, message) {
  return folderFailure(['EACCES', 'EPERM'].includes(error?.code) ? 'SOURCE_ACCESS_DENIED' : 'SOURCE_READ_FAILED', message);
}
function unsupportedFolderFailure(regularFiles, unsupportedFiles, labels) {
  const error = folderFailure('SOURCE_FOLDER_UNSUPPORTED_FILES',
    `Der ausgewählte Ordner enthält ${regularFiles} reguläre Dateien, davon ${unsupportedFiles} nicht freigegebene oder unbekannte Formate. Es wurde kein Stapel gestartet.`);
  // These relative labels are for the local desktop error display only. The
  // message and content-free diagnostics must never contain source names.
  error.localUnsupportedFiles = labels;
  error.localUnsupportedCount = unsupportedFiles;
  return error;
}
function recordUnsupportedLabel(labels, root, full) {
  if (labels.length >= MAX_REPORTED_UNSUPPORTED) return;
  const relative = path.relative(root, full).split(path.sep).join('/');
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative) &&
      relative.length <= 1024 && !relative.split('/').some(part => !part || part === '.' || part === '..')) {
    labels.push(relative);
  }
}
function recordSelectionFailure(failures, error, sourceLabel) {
  if (!SELECTION_REASON_CODES.has(error?.code)) throw error;
  failures.push({ name: sourceLabel, reason_code: error.code });
}
function throwSelectionFailures(failures) {
  if (!failures.length) return;
  const error = folderFailure(failures.length === 1 ? failures[0].reason_code : 'SOURCE_SELECTION_REJECTED',
    'Die ausgewählten Dateien konnten nicht vollständig aufgenommen werden. Es wurde kein Stapel gestartet.');
  error.localSelectionFiles = failures.slice(0, MAX_REPORTED_UNSUPPORTED);
  error.localSelectionCount = failures.length;
  throw error;
}
function sameFsObject(left, right) {
  return Boolean(left && right && left.isDirectory() === right.isDirectory() &&
    left.isFile() === right.isFile() && left.isSymbolicLink() === right.isSymbolicLink() &&
    left.dev === right.dev && left.ino === right.ino &&
    left.birthtimeMs === right.birthtimeMs && left.ctimeMs === right.ctimeMs);
}

function defaultRunner(command, args, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function sourceFolderPickerCommands(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = windowsFolderDialogScript({
      preamble: WINDOWS_PICKER_UTF8, title: SOURCE_FOLDER_TITLE, okLabel: 'Ordner auswählen',
      cancelledToken: SOURCE_FOLDER_CANCELLED, showNewFolderButton: false
    });
    return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') return [{
    command: '/usr/bin/osascript', args: ['-e', ['try', `POSIX path of (choose folder with prompt "${SOURCE_FOLDER_TITLE}")`,
      'on error number -128', `return "${SOURCE_FOLDER_CANCELLED}"`, 'end try'].join('\n')]
  }];
  if (platform === 'linux') return [
    { command: 'zenity', args: ['--file-selection', '--directory', `--title=${SOURCE_FOLDER_TITLE}`] },
    { command: 'kdialog', args: ['--getexistingdirectory', '.', SOURCE_FOLDER_TITLE] }
  ];
  throw Object.assign(new SafeError('Für dieses Betriebssystem ist kein lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
}

function pickSourceFolder(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of sourceFolderPickerCommands(options.platform, options.env)) {
    const result = runner(spec.command, spec.args, options.env || process.env);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT') throw Object.assign(new SafeError('Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error) throw Object.assign(new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === SOURCE_FOLDER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    if (!path.isAbsolute(selected)) throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
    return path.resolve(selected);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError('Kein Quellordner ausgewählt.');
}

async function pickSourceFolderAsync(options = {}) {
  const runner = options.runner || runPickerAsync;
  let unavailable = 0;
  throwIfSelectionAborted(options.signal);
  for (const spec of sourceFolderPickerCommands(options.platform, options.env)) {
    throwIfSelectionAborted(options.signal);
    const result = await runner(spec.command, spec.args, undefined, options.env || process.env, options.signal, pickerOutputMaxBuffer(1));
    throwIfSelectionAborted(options.signal);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) throw Object.assign(new SafeError('Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error && typeof result.error.code !== 'number') throw Object.assign(new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === SOURCE_FOLDER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    if (!path.isAbsolute(selected)) throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
    return path.resolve(selected);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError('Kein Quellordner ausgewählt.');
}

function normalizedSourceLabel(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative) || relative.length > 1024) {
    throw new SafeError('Der ausgewählte Ordner enthält einen ungültigen relativen Dateipfad.');
  }
  return relative;
}

// Real-path and case-folded comparison against the configured and the last
// recorded result root, so 8.3 aliases and a replaced folder cannot re-admit
// the visible output tree as a source.
function overlapsVisibleResultTree(root) {
  return visibleResultTreeOverlaps(root);
}

// The complete tree is validated before a single source byte is admitted.
// Links/reparse points and special files stop the whole selection rather than
// producing a silently incomplete batch.
function enumerateSourceFolder(root, options = {}) {
  const io = options.fs || fs;
  const reparse = options.hasReparseComponent || hasReparseComponent;
  const limits = { ...TREE_LIMITS, ...(options.treeLimits || {}) };
  const allowedTypes = options.allowedTypes || ['txt', 'md', 'csv', 'docx'];
  const allowed = new Set(allowedTypes);
  const rawRoot = String(root || '');
  if (!rawRoot || !path.isAbsolute(rawRoot)) {
    throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
  }
  const resolvedRoot = path.resolve(rawRoot);
  if (overlapsVisibleResultTree(resolvedRoot)) throw new SafeError('Der ausgewählte Quellordner enthält den DataSecure-Output oder liegt darin. Bitte einen getrennten Ordner mit Originaldateien auswählen.');
  if (isManagedStagingPath(resolvedRoot)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  if (reparse(resolvedRoot)) {
    throw new SafeError('Der ausgewählte Quellordner liegt hinter einem Link oder Reparse-Punkt.');
  }
  let rootStat;
  try { rootStat = io.lstatSync(resolvedRoot); }
  catch (error) { throw folderReadFailure(error, 'Der ausgewählte Quellordner ist nicht verfügbar.'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new SafeError('Die Auswahl ist kein regulärer lokaler Ordner.');

  const pending = [{ directory: resolvedRoot, depth: 0, identity: rootStat }];
  const directoryIdentities = new Map([[resolvedRoot, rootStat]]);
  const candidates = [];
  let regularFiles = 0;
  let unsupportedFiles = 0;
  const unsupportedLabels = [];
  let directories = 0;
  let entriesSeen = 0;
  while (pending.length) {
    const current = pending.shift();
    directories++;
    if (directories > limits.maxDirectories || current.depth > limits.maxDepth) {
      throw new SafeError('Der ausgewählte Ordner ist für eine sichere rekursive Verarbeitung zu tief oder zu groß.');
    }
    let entries;
    let before;
    try { before = io.lstatSync(current.directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(before, current.identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    try { entries = io.readdirSync(current.directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (error) { throw folderReadFailure(error, 'Der ausgewählte Ordner konnte nicht vollständig gelesen werden.'); }
    let after;
    try { after = io.lstatSync(current.directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(after, current.identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    for (const entry of entries) {
      entriesSeen++;
      if (entriesSeen > limits.maxEntries) throw new SafeError('Der ausgewählte Ordner enthält zu viele Dateisystemeinträge.');
      const full = path.join(current.directory, entry.name);
      if (isManagedStagingPath(full)) throw new SafeError('Der Quellordner enthält private temporäre Ausgaben; bitte nur Originalordner auswählen.');
      if (reparse(full)) throw new SafeError('Der ausgewählte Ordner enthält einen Link oder Reparse-Punkt.');
      let stat;
      try { stat = io.lstatSync(full); } catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
      if (stat.isSymbolicLink()) throw new SafeError('Der ausgewählte Ordner enthält einen symbolischen Link.');
      if (stat.isDirectory()) {
        directoryIdentities.set(full, stat);
        pending.push({ directory: full, depth: current.depth + 1, identity: stat });
        continue;
      }
      if (!stat.isFile()) throw new SafeError('Der ausgewählte Ordner enthält ein nicht unterstütztes Dateisystemobjekt.');
      const artifactReason = sourceArtifactReason(full, { fs: io, stat, productChannel: options.productChannel });
      if (artifactReason) {
        options.onIgnoredArtifact?.(artifactReason, normalizedSourceLabel(resolvedRoot, full));
        continue;
      }
      regularFiles++;
      const sourceType = SOURCE_TYPES[path.extname(entry.name).toLowerCase()];
      if (!sourceType || !allowed.has(sourceType)) {
        unsupportedFiles++;
        recordUnsupportedLabel(unsupportedLabels, resolvedRoot, full);
        continue;
      }
      candidates.push({ full, sourceLabel: normalizedSourceLabel(resolvedRoot, full) });
      if (candidates.length > (options.maxSources ?? LIMITS.MAX_BATCH_FILES)) {
        throw folderFailure('SOURCE_FOLDER_FILE_LIMIT',
          `Der ausgewählte Ordner enthält mehr als ${options.maxSources ?? LIMITS.MAX_BATCH_FILES} unterstützte Dateien.`);
      }
    }
  }
  // A folder selection means the whole regular-file tree.  Never turn it into
  // an implicit supported-format subset: a mixed tree must stop before any
  // private source is copied. The exception's message stays content-free;
  // bounded relative labels are only projected to the local desktop UI.
  if (unsupportedFiles > 0) {
    throw unsupportedFolderFailure(regularFiles, unsupportedFiles, unsupportedLabels);
  }
  if (!candidates.length) throw folderFailure('SOURCE_FOLDER_EMPTY', 'Der ausgewählte Ordner enthält keine unterstützten Dateien.');

  // Re-bind every selected file only after tree traversal succeeded. Keep the
  // root-relative label as part of the private queue: Standalone uses it to
  // reproduce the selected directory tree in the visible result. It remains
  // local and is never diagnostic or public MCP data.
  const selected = [];
  const selectionFailures = [];
  for (const { full, sourceLabel } of candidates) {
    try { selected.push({ ...validateSelectedPath(full, { ...options, fs: io, allowedTypes }), sourceLabel, treeOrder: sourceLabel }); }
    catch (error) { recordSelectionFailure(selectionFailures, error, sourceLabel); }
  }
  throwSelectionFailures(selectionFailures);
  for (const [directory, identity] of directoryIdentities) {
    let current;
    try { current = io.lstatSync(directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(current, identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
  }
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw folderFailure('SOURCE_FOLDER_SIZE_LIMIT', 'Die unterstützten Dateien im ausgewählten Ordner sind zusammen größer als 500 MB.');
  }
  return selected.sort((a, b) => a.treeOrder.localeCompare(b.treeOrder))
    .map(({ treeOrder, ...entry }) => entry);
}

// The normal Cowork path uses the same fail-closed traversal contract but
// yields regularly so ping/cancellation can be processed while a large local
// tree is inspected. No partial queue escapes on cancellation or error.
async function enumerateSourceFolderAsync(root, options = {}) {
  const io = options.fs || fs;
  const asyncIo = options.fsPromises || io.promises || fs.promises;
  const reparse = options.hasReparseComponentAsync ||
    ((target) => options.hasReparseComponent ? options.hasReparseComponent(target) : hasReparseComponentAsync(target, io));
  const limits = { ...TREE_LIMITS, ...(options.treeLimits || {}) };
  const allowedTypes = options.allowedTypes || ['txt', 'md', 'csv', 'docx'];
  const allowed = new Set(allowedTypes);
  const yieldControl = options.yieldControl || (() => new Promise((resolve) => setImmediate(resolve)));
  const yieldEvery = Math.min(64, Math.max(1, Number(options.yieldEvery) || 8));
  let operations = 0;
  const checkpoint = async () => {
    throwIfSelectionAborted(options.signal);
    if (++operations % yieldEvery === 0) {
      await yieldControl();
      throwIfSelectionAborted(options.signal);
    }
  };
  const rawRoot = String(root || '');
  if (!rawRoot || !path.isAbsolute(rawRoot)) throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
  const resolvedRoot = path.resolve(rawRoot);
  if (overlapsVisibleResultTree(resolvedRoot)) throw new SafeError('Der ausgewählte Quellordner enthält den DataSecure-Output oder liegt darin. Bitte einen getrennten Ordner mit Originaldateien auswählen.');
  if (isManagedStagingPath(resolvedRoot)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  throwIfSelectionAborted(options.signal);
  if (await reparse(resolvedRoot)) throw new SafeError('Der ausgewählte Quellordner liegt hinter einem Link oder Reparse-Punkt.');
  let rootStat;
  try { rootStat = await asyncIo.lstat(resolvedRoot); }
  catch (error) { throw folderReadFailure(error, 'Der ausgewählte Quellordner ist nicht verfügbar.'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new SafeError('Die Auswahl ist kein regulärer lokaler Ordner.');

  const pending = [{ directory: resolvedRoot, depth: 0, identity: rootStat }];
  const directoryIdentities = new Map([[resolvedRoot, rootStat]]);
  const candidates = [];
  let regularFiles = 0;
  let unsupportedFiles = 0;
  const unsupportedLabels = [];
  let directories = 0;
  let entriesSeen = 0;
  while (pending.length) {
    throwIfSelectionAborted(options.signal);
    const current = pending.shift();
    directories++;
    if (directories > limits.maxDirectories || current.depth > limits.maxDepth) {
      throw new SafeError('Der ausgewählte Ordner ist für eine sichere rekursive Verarbeitung zu tief oder zu groß.');
    }
    let entries;
    let before;
    try { before = await asyncIo.lstat(current.directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(before, current.identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    try { entries = (await asyncIo.readdir(current.directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (error) { throw folderReadFailure(error, 'Der ausgewählte Ordner konnte nicht vollständig gelesen werden.'); }
    let after;
    try { after = await asyncIo.lstat(current.directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(after, current.identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    await checkpoint();
    for (const entry of entries) {
      entriesSeen++;
      if (entriesSeen > limits.maxEntries) throw new SafeError('Der ausgewählte Ordner enthält zu viele Dateisystemeinträge.');
      const full = path.join(current.directory, entry.name);
      if (isManagedStagingPath(full)) throw new SafeError('Der Quellordner enthält private temporäre Ausgaben; bitte nur Originalordner auswählen.');
      if (await reparse(full)) throw new SafeError('Der ausgewählte Ordner enthält einen Link oder Reparse-Punkt.');
      let stat;
      try { stat = await asyncIo.lstat(full); } catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
      if (stat.isSymbolicLink()) throw new SafeError('Der ausgewählte Ordner enthält einen symbolischen Link.');
      if (stat.isDirectory()) {
        directoryIdentities.set(full, stat);
        pending.push({ directory: full, depth: current.depth + 1, identity: stat });
      }
      else {
        if (!stat.isFile()) throw new SafeError('Der ausgewählte Ordner enthält ein nicht unterstütztes Dateisystemobjekt.');
        const artifactReason = await sourceArtifactReasonAsync(full, { fs: io, fsPromises: asyncIo, stat, productChannel: options.productChannel });
        if (artifactReason) {
          options.onIgnoredArtifact?.(artifactReason, normalizedSourceLabel(resolvedRoot, full));
          await checkpoint();
          continue;
        }
        regularFiles++;
        const sourceType = SOURCE_TYPES[path.extname(entry.name).toLowerCase()];
        if (sourceType && allowed.has(sourceType)) {
          candidates.push({ full, sourceLabel: normalizedSourceLabel(resolvedRoot, full) });
          if (candidates.length > (options.maxSources ?? LIMITS.MAX_BATCH_FILES)) {
            throw folderFailure('SOURCE_FOLDER_FILE_LIMIT',
              `Der ausgewählte Ordner enthält mehr als ${options.maxSources ?? LIMITS.MAX_BATCH_FILES} unterstützte Dateien.`);
          }
        } else {
          unsupportedFiles++;
          recordUnsupportedLabel(unsupportedLabels, resolvedRoot, full);
        }
      }
      await checkpoint();
    }
  }
  if (unsupportedFiles > 0) {
    throw unsupportedFolderFailure(regularFiles, unsupportedFiles, unsupportedLabels);
  }
  if (!candidates.length) throw folderFailure('SOURCE_FOLDER_EMPTY', 'Der ausgewählte Ordner enthält keine unterstützten Dateien.');
  const selected = [];
  const selectionFailures = [];
  for (const { full, sourceLabel } of candidates) {
    try {
      selected.push({ ...await validateSelectedPathAsync(full, {
        ...options, fs: io, fsPromises: asyncIo, hasReparseComponentAsync: reparse, allowedTypes
      }), sourceLabel, treeOrder: sourceLabel });
    } catch (error) { recordSelectionFailure(selectionFailures, error, sourceLabel); }
    await checkpoint();
  }
  throwSelectionFailures(selectionFailures);
  for (const [directory, identity] of directoryIdentities) {
    let current;
    try { current = await asyncIo.lstat(directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(current, identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    await checkpoint();
  }
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw folderFailure('SOURCE_FOLDER_SIZE_LIMIT', 'Die unterstützten Dateien im ausgewählten Ordner sind zusammen größer als 500 MB.');
  }
  throwIfSelectionAborted(options.signal);
  return selected.sort((a, b) => a.treeOrder.localeCompare(b.treeOrder))
    .map(({ treeOrder, ...entry }) => entry);
}

module.exports = {
  SOURCE_FOLDER_TITLE, SOURCE_FOLDER_CANCELLED, TREE_LIMITS,
  sourceFolderPickerCommands, pickSourceFolder, pickSourceFolderAsync, enumerateSourceFolder, enumerateSourceFolderAsync
};
