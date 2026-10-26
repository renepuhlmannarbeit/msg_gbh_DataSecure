'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { windowsFolderDialogScript } = require('./windows-folder-dialog');
const { WINDOWS_PICKER_UTF8, runPickerAsync, throwIfSelectionAborted, pickerOutputMaxBuffer, documentedNativeCancellation } = require('./file-picker');

const FOLDER_PICKER_CANCELLED = '__DATASECURE_FOLDER_PICKER_CANCELLED__';
const FOLDER_PICKER_TITLE = 'DataSecure-Privacy-Ordner auswählen';

function defaultRunner(command, args, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function pickerCommands(platform = process.platform, env = process.env, title = FOLDER_PICKER_TITLE) {
  if (platform === 'win32') {
    const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = windowsFolderDialogScript({
      preamble: WINDOWS_PICKER_UTF8, title, okLabel: 'Ordner auswählen',
      cancelledToken: FOLDER_PICKER_CANCELLED, showNewFolderButton: true
    });
    return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') return [{
    command: '/usr/bin/osascript',
    args: ['-e', ['try', `POSIX path of (choose folder with prompt "${String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
      'on error number -128', `return "${FOLDER_PICKER_CANCELLED}"`, 'end try'].join('\n')]
  }];
  if (platform === 'linux') return [
    { command: 'zenity', args: ['--file-selection', '--directory', `--title=${title}`] },
    { command: 'kdialog', args: ['--getexistingdirectory', '.', String(title)] }
  ];
  throw Object.assign(new SafeError('Für dieses Betriebssystem ist kein lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
}

function folderPurpose(options = {}) {
  return options.purpose === 'result' ? 'Ergebnisordner' : 'Privacy-Ordner';
}
function folderPurposeGenitive(options = {}) {
  return `${folderPurpose(options)}s`;
}

function selectionCancelledError(options = {}) {
  const error = new SafeError(`Die Auswahl des ${folderPurposeGenitive(options)} wurde abgebrochen.`);
  error.code = 'LOCAL_SELECTION_CANCELLED';
  return error;
}

function pickFolder(options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of pickerCommands(options.platform, options.env, options.title)) {
    const result = runner(spec.command, spec.args, options.env || process.env);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT') throw Object.assign(new SafeError(`Die Auswahl des ${folderPurposeGenitive(options)} wurde wegen Zeitüberschreitung beendet.`), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error) throw Object.assign(new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === FOLDER_PICKER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError(options);
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    if (!path.isAbsolute(selected)) throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist nicht absolut.`);
    let stat;
    try { stat = fs.lstatSync(selected); } catch { throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist nicht verfügbar.`); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist kein regulärer lokaler Ordner.`);
    return path.resolve(selected);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError(`Kein ${folderPurpose(options)} ausgewählt.`);
}

async function pickFolderAsync(options = {}) {
  const runner = options.runner || runPickerAsync;
  let unavailable = 0;
  throwIfSelectionAborted(options.signal);
  for (const spec of pickerCommands(options.platform, options.env, options.title)) {
    throwIfSelectionAborted(options.signal);
    const result = await runner(spec.command, spec.args, undefined, options.env || process.env, options.signal, pickerOutputMaxBuffer(1));
    throwIfSelectionAborted(options.signal);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) throw Object.assign(new SafeError(`Die Auswahl des ${folderPurposeGenitive(options)} wurde wegen Zeitüberschreitung beendet.`), { code: 'LOCAL_PICKER_TIMEOUT' });
    if (result?.error && typeof result.error.code !== 'number') throw Object.assign(new SafeError('Der lokale Ordnerdialog konnte nicht gestartet werden.'), { code: 'LOCAL_PICKER_FAILED' });
    const selected = String(result?.stdout || '').replace(/\r?\n$/u, '');
    if (selected === FOLDER_PICKER_CANCELLED || documentedNativeCancellation(result, selected, options.platform)) throw selectionCancelledError(options);
    if (result?.status !== 0) throw Object.assign(new SafeError('Die lokale Ordnerauswahl konnte nicht sicher gelesen werden.'), { code: 'LOCAL_PICKER_FAILED' });
    if (!path.isAbsolute(selected)) throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist nicht absolut.`);
    let stat;
    try { stat = fs.lstatSync(selected); } catch { throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist nicht verfügbar.`); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SafeError(`Der ausgewählte ${folderPurpose(options)} ist kein regulärer lokaler Ordner.`);
    return path.resolve(selected);
  }
  if (unavailable) throw Object.assign(new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Ordnerdialog verfügbar.'), { code: 'LOCAL_PICKER_UNAVAILABLE' });
  throw new SafeError(`Kein ${folderPurpose(options)} ausgewählt.`);
}

module.exports = { FOLDER_PICKER_CANCELLED, FOLDER_PICKER_TITLE, pickerCommands, selectionCancelledError, pickFolder, pickFolderAsync };
