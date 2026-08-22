'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');

function defaultRunner(command, args) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024, shell: false
  });
}

function confirmationCommands(count, platform = process.platform, env = process.env) {
  if (!Number.isSafeInteger(count) || count < 0) throw new SafeError('Ungültige Trefferzahl.');
  const message = `${count} erkannte Stelle(n) wurden automatisch ersetzt. Ohne zusätzliche Textprüfung mit der bereinigten Fassung fortfahren?`;
  if (platform === 'win32') {
    const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const escaped = message.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      `$answer = [System.Windows.Forms.MessageBox]::Show('${escaped}', 'DataSecure', 'YesNo', 'Warning')`,
      "if ($answer -eq 'Yes') { [Console]::Out.Write('CONFIRMED') }"
    ].join('; ');
    return [{ command: powershell, args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') {
    const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return [{ command: '/usr/bin/osascript', args: ['-e', `button returned of (display dialog "${escaped}" with title "DataSecure" buttons {"Abbrechen", "Fortfahren"} default button "Abbrechen" cancel button "Abbrechen")`] }];
  }
  if (platform === 'linux') {
    return [
      { command: 'zenity', args: ['--question', '--title=DataSecure', `--text=${message}`] },
      { command: 'kdialog', args: ['--warningyesno', message, '--title', 'DataSecure'] }
    ];
  }
  throw new SafeError('Für dieses Betriebssystem ist keine lokale Bestätigung verfügbar.');
}

function confirmAutomaticRelease(count, options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of confirmationCommands(count, options.platform, options.env)) {
    const result = runner(spec.command, spec.args);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error) throw new SafeError('Die lokale Bestätigung konnte nicht geöffnet werden.');
    const platform = options.platform || process.platform;
    if (platform === 'win32') return result.status === 0 && String(result.stdout || '').trim() === 'CONFIRMED';
    if (platform === 'darwin') return result.status === 0 && String(result.stdout || '').trim() === 'Fortfahren';
    return result.status === 0;
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist keine lokale Bestätigung verfügbar.');
  return false;
}

module.exports = { confirmationCommands, confirmAutomaticRelease };
