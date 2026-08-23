'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { LIMITS } = require('../gateway/common');
const { uiProcessEnvironment } = require('./ui-process-policy');

function validateStart(summary) {
  const selected = Number(summary?.selected_count);
  const bytes = Number(summary?.total_bytes);
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > LIMITS.MAX_BATCH_FILES ||
      !Number.isSafeInteger(bytes) || bytes < 1 || bytes > LIMITS.MAX_BATCH_TOTAL_BYTES) {
    throw new SafeError('Ungültige lokale Stapelbestätigung.');
  }
  return { selected, bytes };
}

function startConfirmationText(summary) {
  const { selected, bytes } = validateStart(summary);
  const size = (bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return {
    title: 'DataSecure – lokalen Stapel starten',
    message: [
      `${selected} Datei(en), zusammen ${size} MB`,
      'Unterstützt: TXT, Markdown, CSV und DOCX.',
      'Die Dateien werden lokal geprüft, bevor Claude Inhalte erhält.',
      'Bilder bleiben standardmäßig lokal und werden nicht an Claude übertragen.',
      '',
      'Lokale Verarbeitung starten?'
    ].join('\r\n')
  };
}

function defaultRunner(command, args, _input, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function startConfirmationCommands(summary, options = {}) {
  const platform = options.platform || process.platform;
  const { title, message } = startConfirmationText(summary);
  if (platform === 'win32') {
    const escape = (value) => value.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      `$answer = [System.Windows.Forms.MessageBox]::Show('${escape(message)}', '${escape(title)}', 'YesNo', 'Information')`,
      "if ($answer -eq 'Yes') { [Console]::Out.Write('START_CONFIRMED') }"
    ].join('; ');
    return [{
      command: path.win32.join(options.env?.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script]
    }];
  }
  if (platform === 'darwin') {
    const escape = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
    return [{
      command: '/usr/bin/osascript',
      args: ['-e', `button returned of (display dialog "${escape(message)}" with title "${escape(title)}" buttons {"Abbrechen", "Starten"} default button "Starten" cancel button "Abbrechen")`]
    }];
  }
  if (platform === 'linux') {
    return [
      { command: 'zenity', args: ['--question', `--title=${title}`, `--text=${message}`, '--ok-label=Starten', '--cancel-label=Abbrechen'] },
      { command: 'kdialog', args: ['--warningyesno', message, '--title', title, '--yes-label', 'Starten', '--no-label', 'Abbrechen'] }
    ];
  }
  throw new SafeError('Für dieses Betriebssystem ist keine lokale Stapelbestätigung verfügbar.');
}

function confirmBatchStart(summary, options = {}) {
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of startConfirmationCommands(summary, options)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env);
    if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
    if (result?.error) throw new SafeError('Die lokale Stapelbestätigung konnte nicht geöffnet werden.');
    const platform = options.platform || process.platform;
    if (platform === 'win32') return result.status === 0 && String(result.stdout || '').trim() === 'START_CONFIRMED';
    if (platform === 'darwin') return result.status === 0 && String(result.stdout || '').trim() === 'Starten';
    return result.status === 0;
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist keine lokale Stapelbestätigung verfügbar.');
  return false;
}

module.exports = { validateStart, startConfirmationText, startConfirmationCommands, confirmBatchStart };
