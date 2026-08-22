'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');

function validateSummary(summary) {
  const selected = Number(summary?.selected_count);
  const released = Number(summary?.released_count);
  const failed = Number(summary?.failed_count);
  if (![selected, released, failed].every(Number.isSafeInteger) ||
      selected < 1 || selected > 25 || released < 0 || failed < 0 ||
      released + failed !== selected) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
  return { selected, released, failed };
}

function completionSummaryText(summary) {
  const { selected, released, failed } = validateSummary(summary);
  const counters = `Ausgewählt: ${selected}\r\nErfolgreich vorbereitet: ${released}\r\nSicher gestoppt: ${failed}`;
  if (released === selected) {
    return {
      title: 'DataSecure – Verarbeitung abgeschlossen',
      message: `${counters}\r\n\r\nAlle ausgewählten Dateien wurden erfolgreich vorbereitet. Die Ergebnisse können jetzt in Claude verwendet werden.`
    };
  }
  if (released === 0) {
    return {
      title: 'DataSecure – Verarbeitung abgeschlossen',
      message: `${counters}\r\n\r\nEs wurde nichts für Claude freigegeben. Claude zeigt anschließend den nächsten sicheren Schritt.`
    };
  }
  return {
    title: 'DataSecure – Verarbeitung abgeschlossen',
    message: `${counters}\r\n\r\nDie erfolgreichen Ergebnisse können jetzt in Claude verwendet werden. Für sicher gestoppte Dateien wurde nichts freigegeben.`
  };
}

function defaultRunner(command, args) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024, shell: false
  });
}

function completionSummaryCommand(summary, options = {}) {
  if ((options.platform || process.platform) !== 'win32') {
    throw new SafeError('Die lokale Abschlussansicht ist auf diesem Gerät noch nicht verfügbar.');
  }
  const { title, message } = completionSummaryText(summary);
  const escape = (value) => value.replace(/'/g, "''");
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$form = New-Object System.Windows.Forms.Form',
    `$form.Text = '${escape(title)}'`,
    "$form.StartPosition = 'CenterScreen'",
    "$form.FormBorderStyle = 'FixedDialog'",
    '$form.ClientSize = New-Object System.Drawing.Size(560,250)',
    '$form.MaximizeBox = $false',
    '$form.MinimizeBox = $false',
    '$form.TopMost = $true',
    '$label = New-Object System.Windows.Forms.Label',
    '$label.Location = New-Object System.Drawing.Point(24,22)',
    '$label.Size = New-Object System.Drawing.Size(512,160)',
    `$label.Text = '${escape(message)}'`,
    '$button = New-Object System.Windows.Forms.Button',
    "$button.Text = 'Schließen'",
    '$button.Location = New-Object System.Drawing.Point(416,198)',
    '$button.Size = New-Object System.Drawing.Size(120,32)',
    "$button.DialogResult = 'OK'",
    '$form.AcceptButton = $button',
    '$form.CancelButton = $button',
    '$form.Controls.Add($label)',
    '$form.Controls.Add($button)',
    ...(options.testAutoClose === true ? [
      '$timer = New-Object System.Windows.Forms.Timer',
      '$timer.Interval = 100',
      '$timer.Add_Tick({ $timer.Stop(); $form.Close() })',
      '$timer.Start()'
    ] : []),
    '[void]$form.ShowDialog()',
    "[Console]::Out.Write('SHOWN')"
  ].join('; ');
  const env = options.env || process.env;
  return {
    command: path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script]
  };
}

function showCompletionSummary(summary, options = {}) {
  const spec = completionSummaryCommand(summary, options);
  const result = (options.runner || defaultRunner)(spec.command, spec.args);
  if (result?.error || result?.status !== 0 || String(result?.stdout || '').trim() !== 'SHOWN') {
    throw new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.');
  }
  return true;
}

module.exports = {
  validateSummary,
  completionSummaryText,
  completionSummaryCommand,
  showCompletionSummary
};
