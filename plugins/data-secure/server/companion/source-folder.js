'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { LIMITS, hasReparseComponent, hasReparseComponentAsync, isManagedStagingPath } = require('../gateway/common');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { SOURCE_TYPES, validateSelectedPath, validateSelectedPathAsync, selectionCancelledError, runPickerAsync, throwIfSelectionAborted, WINDOWS_PICKER_UTF8, pickerOutputMaxBuffer, documentedNativeCancellation } = require('./file-picker');

const SOURCE_FOLDER_TITLE = 'Ordner mit DataSecure lokal anonymisieren';
const SOURCE_FOLDER_CANCELLED = '__DATASECURE_SOURCE_FOLDER_CANCELLED__';
const TREE_LIMITS = Object.freeze({ maxDirectories: 1024, maxEntries: 4096, maxDepth: 32 });
function sameFsObject(left, right) {
  return Boolean(left && right && left.isDirectory() === right.isDirectory() &&
    left.isFile() === right.isFile() && left.isSymbolicLink() === right.isSymbolicLink() &&
    left.dev === right.dev && left.ino === right.ino);
}

function defaultRunner(command, args, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function sourceFolderPickerCommands(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const powershell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = [
      WINDOWS_PICKER_UTF8,
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = '${SOURCE_FOLDER_TITLE}'`, '$dialog.ShowNewFolderButton = $false',
      `try { $result = $dialog.ShowDialog(); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) } else { [Console]::Out.Write('${SOURCE_FOLDER_CANCELLED}') } } finally { $dialog.Dispose() }`
    ].join('; ');
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
  throw new SafeError('Für dieses Betriebssystem ist kein lokaler Ordnerdialog verfügbar.');
}

function pickSourceFolder(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of sourceFolderPickerCommands(options.platform, options.env)) {
    const result = runner(spec.command, spec.args, options.env || process.env);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.');
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === SOURCE_FOLDER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.');
    if (!path.isAbsolute(selected)) throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
    return path.resolve(selected);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.');
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
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) throw new SafeError('Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error && typeof result.error.code !== 'number') throw new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.');
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === SOURCE_FOLDER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.');
    if (!path.isAbsolute(selected)) throw new SafeError('Der ausgewählte Quellordner ist nicht absolut.');
    return path.resolve(selected);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.');
  throw new SafeError('Kein Quellordner ausgewählt.');
}

function normalizedSourceLabel(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative) || relative.length > 1024) {
    throw new SafeError('Der ausgewählte Ordner enthält einen ungültigen relativen Dateipfad.');
  }
  return relative;
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
  if (isManagedStagingPath(resolvedRoot)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  if (reparse(resolvedRoot)) {
    throw new SafeError('Der ausgewählte Quellordner liegt hinter einem Link oder Reparse-Punkt.');
  }
  let rootStat;
  try { rootStat = io.lstatSync(resolvedRoot); } catch { throw new SafeError('Der ausgewählte Quellordner ist nicht verfügbar.'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new SafeError('Die Auswahl ist kein regulärer lokaler Ordner.');

  const pending = [{ directory: resolvedRoot, depth: 0, identity: rootStat }];
  const directoryIdentities = new Map([[resolvedRoot, rootStat]]);
  const candidates = [];
  let regularFiles = 0;
  let unsupportedFiles = 0;
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
    catch { throw new SafeError('Der ausgewählte Ordner konnte nicht vollständig gelesen werden.'); }
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
      regularFiles++;
      const sourceType = SOURCE_TYPES[path.extname(entry.name).toLowerCase()];
      if (!sourceType || !allowed.has(sourceType)) {
        unsupportedFiles++;
        continue;
      }
      candidates.push({ full, sourceLabel: normalizedSourceLabel(resolvedRoot, full) });
      if (candidates.length > (options.maxSources ?? LIMITS.MAX_BATCH_FILES)) {
        throw new SafeError(`Der ausgewählte Ordner enthält mehr als ${options.maxSources ?? LIMITS.MAX_BATCH_FILES} unterstützte Dateien.`);
      }
    }
  }
  // A folder selection means the whole regular-file tree.  Never turn it into
  // an implicit supported-format subset: a mixed tree must stop before any
  // private source is copied.  Counts are safe local metadata; names and paths
  // deliberately remain absent from this error.
  if (unsupportedFiles > 0) {
    throw new SafeError(`Der ausgewählte Ordner enthält ${regularFiles} reguläre Dateien, davon ${unsupportedFiles} nicht freigegebene oder unbekannte Formate. Es wurde kein Stapel gestartet.`);
  }
  if (!candidates.length) throw new SafeError('Der ausgewählte Ordner enthält keine unterstützten Dateien.');

  // Re-bind every selected file only after tree traversal succeeded.
  const selected = candidates.map(({ full, sourceLabel }) => ({
    ...validateSelectedPath(full, { ...options, fs: io, allowedTypes }), sourceLabel
  }));
  for (const [directory, identity] of directoryIdentities) {
    let current;
    try { current = io.lstatSync(directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(current, identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
  }
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw new SafeError('Die unterstützten Dateien im ausgewählten Ordner sind zusammen größer als 500 MB.');
  }
  return selected.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel));
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
  if (isManagedStagingPath(resolvedRoot)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  throwIfSelectionAborted(options.signal);
  if (await reparse(resolvedRoot)) throw new SafeError('Der ausgewählte Quellordner liegt hinter einem Link oder Reparse-Punkt.');
  let rootStat;
  try { rootStat = await asyncIo.lstat(resolvedRoot); } catch { throw new SafeError('Der ausgewählte Quellordner ist nicht verfügbar.'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new SafeError('Die Auswahl ist kein regulärer lokaler Ordner.');

  const pending = [{ directory: resolvedRoot, depth: 0, identity: rootStat }];
  const directoryIdentities = new Map([[resolvedRoot, rootStat]]);
  const candidates = [];
  let regularFiles = 0;
  let unsupportedFiles = 0;
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
    catch { throw new SafeError('Der ausgewählte Ordner konnte nicht vollständig gelesen werden.'); }
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
        regularFiles++;
        const sourceType = SOURCE_TYPES[path.extname(entry.name).toLowerCase()];
        if (sourceType && allowed.has(sourceType)) {
          candidates.push({ full, sourceLabel: normalizedSourceLabel(resolvedRoot, full) });
          if (candidates.length > (options.maxSources ?? LIMITS.MAX_BATCH_FILES)) {
            throw new SafeError(`Der ausgewählte Ordner enthält mehr als ${options.maxSources ?? LIMITS.MAX_BATCH_FILES} unterstützte Dateien.`);
          }
        } else {
          unsupportedFiles++;
        }
      }
      await checkpoint();
    }
  }
  if (unsupportedFiles > 0) {
    throw new SafeError(`Der ausgewählte Ordner enthält ${regularFiles} reguläre Dateien, davon ${unsupportedFiles} nicht freigegebene oder unbekannte Formate. Es wurde kein Stapel gestartet.`);
  }
  if (!candidates.length) throw new SafeError('Der ausgewählte Ordner enthält keine unterstützten Dateien.');
  const selected = [];
  for (const { full, sourceLabel } of candidates) {
    selected.push({ ...await validateSelectedPathAsync(full, {
      ...options, fs: io, fsPromises: asyncIo, hasReparseComponentAsync: reparse, allowedTypes
    }), sourceLabel });
    await checkpoint();
  }
  for (const [directory, identity] of directoryIdentities) {
    let current;
    try { current = await asyncIo.lstat(directory); }
    catch { throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.'); }
    if (!sameFsObject(current, identity)) throw new SafeError('Der ausgewählte Ordner hat sich während der Prüfung verändert.');
    await checkpoint();
  }
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw new SafeError('Die unterstützten Dateien im ausgewählten Ordner sind zusammen größer als 500 MB.');
  }
  throwIfSelectionAborted(options.signal);
  return selected.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel));
}

module.exports = {
  SOURCE_FOLDER_TITLE, SOURCE_FOLDER_CANCELLED, TREE_LIMITS,
  sourceFolderPickerCommands, pickSourceFolder, pickSourceFolderAsync, enumerateSourceFolder, enumerateSourceFolderAsync
};
