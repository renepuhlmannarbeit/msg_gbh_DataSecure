'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { LIMITS, hasReparseComponent, hasReparseComponentAsync, isManagedStagingPath } = require('../gateway/common');
const { sourceLimitForExtension } = require('../resource-limits');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { visibleResultTreeOverlaps } = require('../gateway/result-folder-config');
const VISIBLE_OUTPUT_SOURCE_MESSAGE = 'Die ausgewählte Datei liegt im sichtbaren DataSecure-Output. Bitte nur Originaldateien auswählen.';

const MAX_SOURCE_BYTES = LIMITS.MAX_INPUT_BYTES;
const MAX_SELECTED_SOURCES = LIMITS.MAX_BATCH_FILES;
const PICKER_CANCELLED = '__DATASECURE_PICKER_CANCELLED__';
const PICKER_TITLE = 'Dateien mit DataSecure lokal anonymisieren';
const WINDOWS_PICKER_UTF8 = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)';
const MAX_NATIVE_PATH_UTF8_BYTES = 32767 * 3;
const SOURCE_TYPES = Object.freeze({
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.csv': 'csv',
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.bmp': 'bmp'
});

const OFFICE_OWNER_MAX_BYTES = 8192;

function officeOwnerName(fileName) {
  const name = path.basename(String(fileName || ''));
  return /^~\$.+\.(?:docx|xlsx|pptx)$/iu.test(name) ? name : null;
}

function zipPrefix(buffer) {
  return buffer?.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
     (buffer[2] === 0x05 && buffer[3] === 0x06) ||
     (buffer[2] === 0x07 && buffer[3] === 0x08));
}

function readPrefixSync(filePath, fsApi) {
  const descriptor = fsApi.openSync(filePath, 'r');
  try {
    const prefix = Buffer.alloc(4);
    const bytes = fsApi.readSync(descriptor, prefix, 0, prefix.length, 0);
    return prefix.subarray(0, bytes);
  } finally { fsApi.closeSync(descriptor); }
}

async function readPrefix(filePath, io) {
  const handle = await io.open(filePath, 'r');
  try {
    const prefix = Buffer.alloc(4);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    return prefix.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

// A reserved-looking name alone is insufficient: a user can legitimately
// name a real OPC document "~$...". Treat the file as an Office owner record
// only when it is small, is not itself an OPC ZIP, and a larger valid sibling
// exists whose first two characters Office replaced with "~$".
function sourceArtifactReason(filePath, options = {}) {
  const name = officeOwnerName(filePath);
  if (!name) return null;
  const fsApi = options.fs || fs;
  const stat = options.stat || fsApi.lstatSync(filePath);
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > OFFICE_OWNER_MAX_BYTES) return null;
  if (zipPrefix(readPrefixSync(filePath, fsApi))) return null;
  const tail = name.slice(2).toLocaleLowerCase('en-US');
  for (const entry of fsApi.readdirSync(path.dirname(filePath), { withFileTypes: true })) {
    if (entry.name === name || entry.name.startsWith('~$') ||
        entry.name.slice(2).toLocaleLowerCase('en-US') !== tail || !entry.isFile()) continue;
    const sibling = path.join(path.dirname(filePath), entry.name);
    const siblingStat = fsApi.lstatSync(sibling);
    if (!siblingStat.isFile() || siblingStat.isSymbolicLink() || siblingStat.size <= stat.size) continue;
    if (zipPrefix(readPrefixSync(sibling, fsApi))) return 'office_owner_file';
  }
  return null;
}

async function sourceArtifactReasonAsync(filePath, options = {}) {
  const name = officeOwnerName(filePath);
  if (!name) return null;
  const fsApi = options.fs || fs;
  const io = options.fsPromises || fsApi.promises || fs.promises;
  const stat = options.stat || await io.lstat(filePath);
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > OFFICE_OWNER_MAX_BYTES) return null;
  if (zipPrefix(await readPrefix(filePath, io))) return null;
  const tail = name.slice(2).toLocaleLowerCase('en-US');
  for (const entry of await io.readdir(path.dirname(filePath), { withFileTypes: true })) {
    if (entry.name === name || entry.name.startsWith('~$') ||
        entry.name.slice(2).toLocaleLowerCase('en-US') !== tail || !entry.isFile()) continue;
    const sibling = path.join(path.dirname(filePath), entry.name);
    const siblingStat = await io.lstat(sibling);
    if (!siblingStat.isFile() || siblingStat.isSymbolicLink() || siblingStat.size <= stat.size) continue;
    if (zipPrefix(await readPrefix(sibling, io))) return 'office_owner_file';
  }
  return null;
}

function pickerOutputMaxBuffer(maxSources = 1) {
  const count = Math.min(MAX_SELECTED_SOURCES, Math.max(1, Number(maxSources) || 1));
  return Math.max(1024 * 1024, Math.ceil(count) * (MAX_NATIVE_PATH_UTF8_BYTES + 2) + 256);
}

function defaultRunner(command, args, _input, env = process.env, _signal, maxBuffer = 1024 * 1024) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1000,
    maxBuffer,
    shell: false,
    env: uiProcessEnvironment(env)
  });
}

// execFile keeps MCP stdio responsive while the native dialog is open. Node's
// signal support terminates only this owned dialog process, never an already
// detached intake/processing worker or other applications.
function runPickerAsync(command, args, _input, env = process.env, signal, maxBuffer = 1024 * 1024) {
  if (signal?.aborted) return Promise.reject(selectionCancelledError());
  return new Promise((resolve) => {
    childProcess.execFile(command, args, {
      encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
      maxBuffer, shell: false, env: uiProcessEnvironment(env), signal
    }, (error, stdout) => resolve({
      error, stdout,
      status: error ? (typeof error.code === 'number' ? error.code : null) : 0
    }));
  });
}

function throwIfSelectionAborted(signal) {
  if (signal?.aborted) throw selectionCancelledError();
}

function allowedExtensions(allowedTypes) {
  if (!allowedTypes) return Object.keys(SOURCE_TYPES);
  const types = new Set(allowedTypes);
  const extensions = Object.entries(SOURCE_TYPES).filter(([, type]) => types.has(type)).map(([ext]) => ext);
  if (!extensions.length) throw new SafeError('Der lokale Dateidialog hat keine unterstützten Formate.');
  return extensions;
}

function pickerCommands(platform = process.platform, env = process.env, allowedTypes, multiple = false) {
  const extensions = allowedExtensions(allowedTypes);
  const windowsFilter = extensions.map((ext) => `*${ext}`).join(';');
  const unixFilter = extensions.map((ext) => `*${ext}`).join(' ');
  // AppleScript accepts extension strings in `of type`. They originate only
  // from SOURCE_TYPES, never from a model or caller-controlled string.
  const macTypeFilter = `{${extensions.map((ext) => `"${ext.slice(1)}"`).join(', ')}}`;
  if (platform === 'win32') {
    const systemRoot = env.SystemRoot || 'C:\\Windows';
    const powershell = path.win32.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const script = [
      WINDOWS_PICKER_UTF8,
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      `$dialog.Title = '${PICKER_TITLE}'`,
      `$dialog.Filter = 'Unterstützte Dateien|${windowsFilter}'`,
      `$dialog.Multiselect = $${multiple ? 'true' : 'false'}`,
      'try {',
      '  $result = $dialog.ShowDialog()',
      "  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
      multiple
        ? '    [Console]::Out.Write(($dialog.FileNames -join [Environment]::NewLine))'
        : '    [Console]::Out.Write($dialog.FileName)',
      '  } else {',
      `    [Console]::Out.Write('${PICKER_CANCELLED}')`,
      '  }',
      '} finally {',
      '  $dialog.Dispose()',
      '}'
    ].join('; ');
    return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') {
    const selection = multiple
      ? [
          `set selectedFiles to choose file with prompt "${PICKER_TITLE}" of type ${macTypeFilter} with multiple selections allowed`,
          'set selectedPaths to {}',
          'repeat with selectedFile in selectedFiles',
          'set end of selectedPaths to POSIX path of selectedFile',
          'end repeat',
          "set AppleScript's text item delimiters to linefeed",
          'return selectedPaths as text'
        ].join('\n')
      : `POSIX path of (choose file with prompt "${PICKER_TITLE}" of type ${macTypeFilter})`;
    const script = ['try', selection, 'on error number -128', `return "${PICKER_CANCELLED}"`, 'end try'].join('\n');
    return [
      {
        command: '/usr/bin/osascript',
        args: ['-e', script]
      }
    ];
  }
  if (platform === 'linux') {
    const zenityArgs = ['--file-selection', `--title=${PICKER_TITLE}`];
    const kdialogArgs = ['--getopenfilename', '.', `Unterstützte Dateien (${unixFilter})`, PICKER_TITLE];
    if (multiple) {
      // Both helpers return one selected path per line. Do not rely on a
      // platform default: without these flags a 100-file batch silently turns
      // into a one-file selection on Linux.
      zenityArgs.push('--multiple', '--separator=\n');
      kdialogArgs.push('--multiple', '--separate-output');
    }
    return [
      { command: 'zenity', args: zenityArgs },
      { command: 'kdialog', args: kdialogArgs }
    ];
  }
  throw Object.assign(new SafeError('Für dieses Betriebssystem ist kein lokaler Dateidialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
}

function stripPickerLineEnding(value) { return String(value ?? '').replace(/\r?\n$/u, ''); }

function validateSelectedPath(selected, options = {}) {
  const fsApi = options.fs || fs;
  const pathHasReparseComponent = options.hasReparseComponent || hasReparseComponent;
  const candidate = String(selected || '');
  if (!candidate) throw new SafeError('Keine Datei ausgewählt.');
  if (!path.isAbsolute(candidate)) throw new SafeError('Die Dateiauswahl ist nicht absolut.');
  if (isManagedStagingPath(candidate)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  // Released results must not re-enter the pipeline through the file picker
  // either; the folder picker applies the same gate to the whole tree.
  if (visibleResultTreeOverlaps(candidate)) throw new SafeError(VISIBLE_OUTPUT_SOURCE_MESSAGE);
  if (pathHasReparseComponent(candidate)) {
    throw new SafeError('Die ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt und wurde nicht übernommen.');
  }
  const extension = path.extname(candidate).toLowerCase();
  const sourceType = SOURCE_TYPES[extension];
  if (!sourceType) throw new SafeError('Das ausgewählte Dateiformat wird nicht unterstützt.');
  if (options.allowedTypes && !new Set(options.allowedTypes).has(sourceType)) {
    throw new SafeError('Dieses Dateiformat ist im aktuellen Companion-Ablauf noch nicht freigegeben.');
  }
  let stat;
  try {
    stat = fsApi.lstatSync(candidate);
  } catch {
    throw new SafeError('Die ausgewählte Datei ist nicht mehr verfügbar.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new SafeError('Die Auswahl ist keine reguläre lokale Datei.');
  }
  if (sourceArtifactReason(candidate, { ...options, fs: fsApi, stat })) {
    throw Object.assign(new SafeError('Eine temporäre Office-Sperrdatei kann nicht verarbeitet werden.'),
      { code: 'SOURCE_ARTIFACT_IGNORED' });
  }
  const maxBytes = options.maxBytes ?? sourceLimitForExtension(extension);
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maxBytes) {
    throw Object.assign(new SafeError('Die ausgewählte Datei überschreitet die sichere Einzeldateigrenze für dieses Format.'),
      { code: 'SOURCE_FORMAT_SIZE_LIMIT' });
  }
  return { sourcePath: candidate, sourceType, sourceBytes: stat.size };
}

async function validateSelectedPathAsync(selected, options = {}) {
  const fsApi = options.fs || fs;
  const io = options.fsPromises || fsApi.promises || fs.promises;
  const pathHasReparseComponent = options.hasReparseComponentAsync ||
    ((target) => options.hasReparseComponent ? options.hasReparseComponent(target) : hasReparseComponentAsync(target, fsApi));
  const candidate = String(selected || '');
  if (!candidate) throw new SafeError('Keine Datei ausgewählt.');
  if (!path.isAbsolute(candidate)) throw new SafeError('Die Dateiauswahl ist nicht absolut.');
  if (isManagedStagingPath(candidate)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
  if (visibleResultTreeOverlaps(candidate)) throw new SafeError(VISIBLE_OUTPUT_SOURCE_MESSAGE);
  throwIfSelectionAborted(options.signal);
  if (await pathHasReparseComponent(candidate)) {
    throw new SafeError('Die ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt und wurde nicht übernommen.');
  }
  throwIfSelectionAborted(options.signal);
  const extension = path.extname(candidate).toLowerCase();
  const sourceType = SOURCE_TYPES[extension];
  if (!sourceType) throw new SafeError('Das ausgewählte Dateiformat wird nicht unterstützt.');
  if (options.allowedTypes && !new Set(options.allowedTypes).has(sourceType)) {
    throw new SafeError('Dieses Dateiformat ist im aktuellen Companion-Ablauf noch nicht freigegeben.');
  }
  let stat;
  try { stat = await io.lstat(candidate); }
  catch { throw new SafeError('Die ausgewählte Datei ist nicht mehr verfügbar.'); }
  throwIfSelectionAborted(options.signal);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new SafeError('Die Auswahl ist keine reguläre lokale Datei.');
  if (await sourceArtifactReasonAsync(candidate, { ...options, fs: fsApi, fsPromises: io, stat })) {
    throw Object.assign(new SafeError('Eine temporäre Office-Sperrdatei kann nicht verarbeitet werden.'),
      { code: 'SOURCE_ARTIFACT_IGNORED' });
  }
  const maxBytes = options.maxBytes ?? sourceLimitForExtension(extension);
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maxBytes) {
    throw Object.assign(new SafeError('Die ausgewählte Datei überschreitet die sichere Einzeldateigrenze für dieses Format.'),
      { code: 'SOURCE_FORMAT_SIZE_LIMIT' });
  }
  return { sourcePath: candidate, sourceType, sourceBytes: stat.size };
}

function selectionCancelledError() {
  const error = new SafeError('Die lokale Dateiauswahl wurde abgebrochen.');
  error.code = 'LOCAL_SELECTION_CANCELLED';
  return error;
}

function documentedNativeCancellation(result, output, platform = process.platform) {
  return platform === 'linux' && result?.status === 1 && !output &&
    (!result?.error || result.error.code === 1);
}

function pickSource(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env, undefined, pickerOutputMaxBuffer(1));
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw Object.assign(new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error) throw Object.assign(new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const output = stripPickerLineEnding(result?.stdout || '');
    if (output === PICKER_CANCELLED || documentedNativeCancellation(result, output, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Dateiauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    return validateSelectedPath(output, options);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError('Keine Datei ausgewählt.');
}

function pickSources(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes, true)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env, undefined,
      pickerOutputMaxBuffer(options.maxSources ?? MAX_SELECTED_SOURCES));
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw Object.assign(new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error) throw Object.assign(new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const output = stripPickerLineEnding(result?.stdout || '');
    if (output === PICKER_CANCELLED || documentedNativeCancellation(result, output, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Dateiauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    return validateSelectedPaths(output, options);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError('Keine Datei ausgewählt.');
}

function validateSelectedPaths(output, options) {
  const selectedPaths = output.split(/\r?\n/);
  if(selectedPaths.some((value)=>value.length===0))throw new SafeError('Die lokale Dateiauswahl enthält einen nicht eindeutig abbildbaren Dateinamen.');
  if (!selectedPaths.length) throw new SafeError('Keine Datei ausgewählt.');
  if (selectedPaths.length > (options.maxSources ?? MAX_SELECTED_SOURCES)) {
    throw new SafeError(`Bitte höchstens ${options.maxSources ?? MAX_SELECTED_SOURCES} Dateien gleichzeitig auswählen.`);
  }
  const selectedPathKeys = selectedPaths.map((value) =>
    (options.platform || process.platform) === 'win32' ? value.toLowerCase() : value
  );
  if (new Set(selectedPathKeys).size !== selectedPaths.length) {
    throw new SafeError('Eine Datei wurde mehrfach ausgewählt.');
  }
  const selected = selectedPaths.map((selected) => validateSelectedPath(selected, options));
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw new SafeError('Die ausgewählten Dateien sind zusammen größer als 500 MB.');
  }
  return selected;
}

async function validateSelectedPathsAsync(output, options = {}) {
  const selectedPaths = output.split(/\r?\n/);
  if (selectedPaths.some((value) => value.length === 0)) {
    throw new SafeError('Die lokale Dateiauswahl enthält einen nicht eindeutig abbildbaren Dateinamen.');
  }
  if (!selectedPaths.length) throw new SafeError('Keine Datei ausgewählt.');
  if (selectedPaths.length > (options.maxSources ?? MAX_SELECTED_SOURCES)) {
    throw new SafeError(`Bitte höchstens ${options.maxSources ?? MAX_SELECTED_SOURCES} Dateien gleichzeitig auswählen.`);
  }
  const selectedPathKeys = selectedPaths.map((value) =>
    (options.platform || process.platform) === 'win32' ? value.toLowerCase() : value
  );
  if (new Set(selectedPathKeys).size !== selectedPaths.length) {
    throw new SafeError('Eine Datei wurde mehrfach ausgewählt.');
  }
  const selected = [];
  let total = 0;
  for (const candidate of selectedPaths) {
    throwIfSelectionAborted(options.signal);
    const item = await validateSelectedPathAsync(candidate, options);
    selected.push(item);
    total += item.sourceBytes;
    if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
      throw new SafeError('Die ausgewählten Dateien sind zusammen größer als 500 MB.');
    }
    // Give Cowork cancellation and unrelated MCP requests a scheduling point
    // even when a platform reports cached file metadata immediately.
    await new Promise((resolve) => setImmediate(resolve));
  }
  throwIfSelectionAborted(options.signal);
  return selected;
}

async function pickSourcesAsync(options = {}) {
  const runner = options.runner || runPickerAsync;
  let unavailable = 0;
  throwIfSelectionAborted(options.signal);
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes, true)) {
    throwIfSelectionAborted(options.signal);
    const result = await runner(spec.command, spec.args, undefined, options.env || process.env, options.signal,
      pickerOutputMaxBuffer(options.maxSources ?? MAX_SELECTED_SOURCES));
    throwIfSelectionAborted(options.signal);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) throw Object.assign(new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' });
    // Native macOS/Linux cancellations use a nonzero numeric exit status.
    if (result?.error && typeof result.error.code !== 'number') throw Object.assign(new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const output = stripPickerLineEnding(result?.stdout || '');
    if (output === PICKER_CANCELLED || documentedNativeCancellation(result, output, options.platform)) throw selectionCancelledError();
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Dateiauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    return validateSelectedPathsAsync(output, options);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError('Keine Datei ausgewählt.');
}

// The native picker deliberately returns only private source descriptors.  The
// batch gateway uses a differently named internal queue shape; keep this
// conversion local and testable so a picker result can never be mistaken for
// an Input-folder entry.
function batchQueueFromSelection(selected) {
  if (!Array.isArray(selected) || selected.length < 1) {
    throw new SafeError('Keine Datei für den lokalen Stapel ausgewählt.');
  }
  const prepared = selected.map((item) => {
    const full = String(item?.sourcePath || '');
    const sourceBytes = item?.sourceBytes;
    if (!path.isAbsolute(full) || !Number.isSafeInteger(sourceBytes) || sourceBytes < 1) {
      throw new SafeError('Die lokale Dateiauswahl ist ungültig.');
    }
    return { item, name: path.basename(full), full, sourceBytes };
  });
  const labels = prepared.map(({ item, name }) => typeof item?.sourceLabel === 'string' ? item.sourceLabel : name);
  const duplicateNames = new Set(prepared.map(({ name }) => name).filter((name, index, names) =>
    names.findIndex((candidate) => candidate === name) !== index));
  for (const duplicate of duplicateNames) {
    const indices = prepared.map(({ name }, index) => name === duplicate ? index : -1).filter((index) => index >= 0);
    const parts = indices.map((index) => {
      const full = prepared[index].full;
      const root = path.parse(full).root;
      return { root: root.replace(/[^A-Za-z0-9_-]/gu, '') || 'root',
        segments: path.relative(root, full).split(path.sep) };
    });
    const key = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
    let resolved = null;
    const depthLimit = Math.max(...parts.map(({ segments }) => segments.length));
    for (let depth = 2; depth <= depthLimit; depth++) {
      const candidates = parts.map(({ segments }) => segments.slice(-depth).join('/'));
      if (new Set(candidates.map(key)).size === candidates.length) { resolved = candidates; break; }
    }
    if (!resolved) resolved = parts.map(({ root, segments }) => `${root}/${segments.join('/')}`);
    for (let offset = 0; offset < indices.length; offset++) labels[indices[offset]] = resolved[offset];
  }
  return prepared.map(({ name, full, sourceBytes }, index) => ({
    name, full, sourceBytes, sourceLabel: labels[index]
  }));
}

module.exports = {
  MAX_SOURCE_BYTES,
  MAX_SELECTED_SOURCES,
  PICKER_CANCELLED,
  PICKER_TITLE,
  SOURCE_TYPES, sourceArtifactReason, sourceArtifactReasonAsync,
  pickerCommands,
  validateSelectedPath,
  validateSelectedPathAsync,
  validateSelectedPathsAsync,
  selectionCancelledError,
  pickSource,
  pickSources,
  pickSourcesAsync,
  runPickerAsync,
  pickerOutputMaxBuffer,
  documentedNativeCancellation,
  WINDOWS_PICKER_UTF8,
  throwIfSelectionAborted,
  batchQueueFromSelection
};
