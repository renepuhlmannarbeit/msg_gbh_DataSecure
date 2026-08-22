'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_SELECTED_SOURCES = 25;
const PICKER_CANCELLED = '__DATASECURE_PICKER_CANCELLED__';
const SOURCE_TYPES = Object.freeze({
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
  '.txt': 'txt',
  '.md': 'md',
  '.csv': 'csv',
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.bmp': 'bmp'
});

function defaultRunner(command, args) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024,
    shell: false
  });
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
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      "$dialog.Title = 'Datei für Claude vorbereiten'",
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
    return [
      {
        command: '/usr/bin/osascript',
        args: ['-e', 'POSIX path of (choose file with prompt "Datei für Claude vorbereiten")']
      }
    ];
  }
  if (platform === 'linux') {
    return [
      { command: 'zenity', args: ['--file-selection', '--title=Datei für Claude vorbereiten'] },
      { command: 'kdialog', args: ['--getopenfilename', '.', `Unterstützte Dateien (${unixFilter})`] }
    ];
  }
  throw new SafeError('Für dieses Betriebssystem ist kein lokaler Dateidialog verfügbar.');
}

function validateSelectedPath(selected, options = {}) {
  const fsApi = options.fs || fs;
  const maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  const candidate = String(selected || '').trim();
  if (!candidate) throw new SafeError('Keine Datei ausgewählt.');
  if (!path.isAbsolute(candidate)) throw new SafeError('Die Dateiauswahl ist nicht absolut.');
  const sourceType = SOURCE_TYPES[path.extname(candidate).toLowerCase()];
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
  if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maxBytes) {
    throw new SafeError('Die ausgewählte Datei liegt außerhalb der zulässigen Größe.');
  }
  return { sourcePath: candidate, sourceType, sourceBytes: stat.size };
}

function pickSource(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes)) {
    const result = runner(spec.command, spec.args);
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.');
    const output = String(result?.stdout || '').trim();
    if (output === PICKER_CANCELLED) throw new SafeError('Die lokale Dateiauswahl wurde abgebrochen.');
    if (result?.status !== 0 && !output) {
      throw new SafeError('Keine Datei ausgewählt.');
    }
    return validateSelectedPath(output, options);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.');
  throw new SafeError('Keine Datei ausgewählt.');
}

function pickSources(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.allowedTypes, true)) {
    const result = runner(spec.command, spec.args);
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Dateiauswahl wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Dateidialog konnte nicht gestartet werden.');
    const output = String(result?.stdout || '').trim();
    if (output === PICKER_CANCELLED) throw new SafeError('Die lokale Dateiauswahl wurde abgebrochen.');
    if (result?.status !== 0 && !output) throw new SafeError('Keine Datei ausgewählt.');
    const selectedPaths = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!selectedPaths.length) throw new SafeError('Keine Datei ausgewählt.');
    if (selectedPaths.length > (options.maxSources ?? MAX_SELECTED_SOURCES)) {
      throw new SafeError(`Bitte höchstens ${options.maxSources ?? MAX_SELECTED_SOURCES} Dateien gleichzeitig auswählen.`);
    }
    if (new Set(selectedPaths.map((value) => value.toLowerCase())).size !== selectedPaths.length) {
      throw new SafeError('Eine Datei wurde mehrfach ausgewählt.');
    }
    return selectedPaths.map((selected) => validateSelectedPath(selected, options));
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter Dateidialog verfügbar.');
  throw new SafeError('Keine Datei ausgewählt.');
}

module.exports = {
  MAX_SOURCE_BYTES,
  MAX_SELECTED_SOURCES,
  PICKER_CANCELLED,
  SOURCE_TYPES,
  pickerCommands,
  validateSelectedPath,
  pickSource,
  pickSources
};
