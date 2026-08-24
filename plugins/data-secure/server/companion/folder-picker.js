'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');

const FOLDER_PICKER_CANCELLED = '__DATASECURE_FOLDER_PICKER_CANCELLED__';
const FOLDER_PICKER_TITLE = 'DataSecure-Privacy-Ordner auswählen';

function defaultRunner(command, args, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function pickerCommands(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const powershell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = '${FOLDER_PICKER_TITLE}'`, '$dialog.ShowNewFolderButton = $true',
      'try { $result = $dialog.ShowDialog(); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) } else { [Console]::Out.Write(\'' + FOLDER_PICKER_CANCELLED + '\') } } finally { $dialog.Dispose() }'
    ].join('; ');
    return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') return [{
    command: '/usr/bin/osascript',
    args: ['-e', `POSIX path of (choose folder with prompt "${FOLDER_PICKER_TITLE}")`]
  }];
  if (platform === 'linux') return [
    { command: 'zenity', args: ['--file-selection', '--directory', `--title=${FOLDER_PICKER_TITLE}`] },
    { command: 'kdialog', args: ['--getexistingdirectory', '.', FOLDER_PICKER_TITLE] }
  ];
  throw new SafeError('Für dieses Betriebssystem ist kein lokaler Ordnerdialog verfügbar.');
}

function selectionCancelledError() {
  const error = new SafeError('Die Auswahl des Privacy-Ordners wurde abgebrochen.');
  error.code = 'LOCAL_SELECTION_CANCELLED';
  return error;
}

function pickFolder(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env)) {
    const result = runner(spec.command, spec.args, options.env || process.env);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die Auswahl des Privacy-Ordners wurde wegen Zeitüberschreitung beendet.');
    if (result?.error) throw new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.');
    const selected = String(result?.stdout || '').trim();
    if (selected === FOLDER_PICKER_CANCELLED || (result?.status !== 0 && !selected)) throw selectionCancelledError();
    if (!path.isAbsolute(selected)) throw new SafeError('Der ausgewählte Privacy-Ordner ist nicht absolut.');
    let stat;
    try { stat = fs.lstatSync(selected); } catch { throw new SafeError('Der ausgewählte Privacy-Ordner ist nicht verfügbar.'); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SafeError('Der ausgewählte Privacy-Ordner ist kein regulärer lokaler Ordner.');
    return path.resolve(selected);
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.');
  throw new SafeError('Kein Privacy-Ordner ausgewählt.');
}

module.exports = { FOLDER_PICKER_CANCELLED, FOLDER_PICKER_TITLE, pickerCommands, selectionCancelledError, pickFolder };
