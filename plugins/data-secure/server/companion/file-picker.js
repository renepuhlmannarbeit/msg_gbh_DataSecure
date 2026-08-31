'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { LIMITS, hasReparseComponent, isManagedStagingPath } = require('../gateway/common');
const { sourceLimitForExtension } = require('../resource-limits');
const { uiProcessEnvironment } = require('./ui-process-policy');

const MAX_SOURCE_BYTES = LIMITS.MAX_INPUT_BYTES;
const MAX_SELECTED_SOURCES = LIMITS.MAX_BATCH_FILES;
const PICKER_CANCELLED = '__DATASECURE_PICKER_CANCELLED__';
const PICKER_TITLE = 'Dateien mit DataSecure lokal anonymisieren';
const WINDOWS_PICKER_UTF8 = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)';
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

function defaultRunner(command, args, _input, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024,
    shell: false,
    env: uiProcessEnvironment(env)
  });
}

// execFile keeps MCP stdio responsive while the native dialog is open. Node's
// signal support terminates only this owned dialog process, never an already
// detached intake/processing worker or other applications.
function runPickerAsync(command, args, _input, env = process.env, signal) {
  if (signal?.aborted) return Promise.reject(selectionCancelledError());
  return new Promise((resolve) => {
    childProcess.execFile(command, args, {
      encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024, shell: false, env: uiProcessEnvironment(env), signal
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
    const powershell = path.join(
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
    const script = multiple
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
  throw new SafeError('Für dieses Betriebssystem ist kein lokaler Dateidialog verfügbar.');
}

function validateSelectedPath(selected, options = {}) {
  const fsApi = options.fs || fs;
  const pathHasReparseComponent = options.hasReparseComponent || hasReparseComponent;
  const candidate = String(selected || '').trim();
  if (!candidate) throw new SafeError('Keine Datei ausgewählt.');
  if (!path.isAbsolute(candidate)) throw new SafeError('Die Dateiauswahl ist nicht absolut.');
  if (isManagedStagingPath(candidate)) throw new SafeError('Private temporäre Ausgaben dürfen nicht als Quelle ausgewählt werden.');
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
  const maxBytes = options.maxBytes ?? sourceLimitForExtension(extension);
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maxBytes) {
    throw new SafeError('Die ausgewählte Datei überschreitet die sichere Einzeldateigrenze für dieses Format.');
  }
  return { sourcePath: candidate, sourceType, sourceBytes: stat.size };
}

function selectionCancelledError() {
  const error = new SafeError('Die lokale Dateiauswahl wurde abgebrochen.');
  error.code = 'LOCAL_SELECTION_CANCELLED';
  return error;
}

function pickSource(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env);
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.');
    const output = String(result?.stdout || '').trim();
    // Windows prints a fixed marker. macOS (user-cancelled AppleScript) and
    // Linux dialog helpers conventionally return a non-zero exit with no
    // selection. Both are terminal user cancellations, never a reason to
    // reopen a picker or create a replacement batch.
    if (output === PICKER_CANCELLED || (result?.status !== 0 && !output)) throw selectionCancelledError();
    return validateSelectedPath(output, options);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.');
  throw new SafeError('Keine Datei ausgewählt.');
}

function pickSources(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes, true)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env);
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.');
    const output = String(result?.stdout || '').trim();
    if (output === PICKER_CANCELLED || (result?.status !== 0 && !output)) throw selectionCancelledError();
    return validateSelectedPaths(output, options);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.');
  throw new SafeError('Keine Datei ausgewählt.');
}

function validateSelectedPaths(output, options) {
  const selectedPaths = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (!selectedPaths.length) throw new SafeError('Keine Datei ausgewählt.');
  if (selectedPaths.length > (options.maxSources ?? MAX_SELECTED_SOURCES)) {
    throw new SafeError(`Bitte höchstens ${options.maxSources ?? MAX_SELECTED_SOURCES} Dateien gleichzeitig auswählen.`);
  }
  if (new Set(selectedPaths.map((value) => value.toLowerCase())).size !== selectedPaths.length) {
    throw new SafeError('Eine Datei wurde mehrfach ausgewählt.');
  }
  const selected = selectedPaths.map((selected) => validateSelectedPath(selected, options));
  const total = selected.reduce((sum, item) => sum + item.sourceBytes, 0);
  if (total > (options.maxTotalBytes ?? LIMITS.MAX_BATCH_TOTAL_BYTES)) {
    throw new SafeError('Die ausgewählten Dateien sind zusammen größer als 500 MB.');
  }
  return selected;
}

async function pickSourcesAsync(options = {}) {
  const runner = options.runner || runPickerAsync;
  let unavailable = 0;
  throwIfSelectionAborted(options.signal);
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes, true)) {
    throwIfSelectionAborted(options.signal);
    const result = await runner(spec.command, spec.args, undefined, options.env || process.env, options.signal);
    throwIfSelectionAborted(options.signal);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) throw new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.');
    // Native macOS/Linux cancellations use a nonzero numeric exit status.
    if (result?.error && typeof result.error.code !== 'number') throw new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.');
    const output = String(result?.stdout || '').trim();
    if (output === PICKER_CANCELLED || (result?.status !== 0 && !output)) throw selectionCancelledError();
    if (result?.status !== 0) throw new SafeError('Die lokale Dateiauswahl konnte nicht sicher gelesen werden.');
    return validateSelectedPaths(output, options);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.');
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
  return selected.map((item) => {
    const full = String(item?.sourcePath || '');
    const sourceBytes = item?.sourceBytes;
    if (!path.isAbsolute(full) || !Number.isSafeInteger(sourceBytes) || sourceBytes < 1) {
      throw new SafeError('Die lokale Dateiauswahl ist ungültig.');
    }
    const name = path.basename(full);
    // Equal basenames from different local folders are valid. The sealed batch
    // assigns every copied source an independent random item id and work name;
    // neither the source path nor a path-derived hash has to be persisted or
    // shown to Claude. The picker already rejects selecting the exact same
    // absolute path twice.
    const sourceLabel = typeof item?.sourceLabel === 'string' ? item.sourceLabel : name;
    return { name, full, sourceBytes, sourceLabel };
  });
}

module.exports = {
  MAX_SOURCE_BYTES,
  MAX_SELECTED_SOURCES,
  PICKER_CANCELLED,
  PICKER_TITLE,
  SOURCE_TYPES,
  pickerCommands,
  validateSelectedPath,
  selectionCancelledError,
  pickSource,
  pickSources,
  pickSourcesAsync,
  runPickerAsync,
  WINDOWS_PICKER_UTF8,
  throwIfSelectionAborted,
  batchQueueFromSelection
};
