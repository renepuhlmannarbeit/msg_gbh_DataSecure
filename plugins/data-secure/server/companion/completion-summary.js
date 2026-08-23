'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { LIMITS } = require('../gateway/common');

function validateSummary(summary) {
  const selected = Number(summary?.selected_count);
  const released = Number(summary?.released_count);
  const failed = Number(summary?.failed_count);
  if (![selected, released, failed].every(Number.isSafeInteger) ||
      selected < 1 || selected > LIMITS.MAX_BATCH_FILES || released < 0 || failed < 0 ||
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

function defaultRunner(command, args, _input, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function completionSummaryCommand(summary, options = {}) {
  return completionSummaryCommands(summary, options)[0];
}

function completionSummaryCommands(summary, options = {}) {
  const platform = options.platform || process.platform;
  const { title, message } = completionSummaryText(summary);
  if (platform === 'darwin') {
    const escape = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
    return [{
      command: '/usr/bin/osascript',
      args: ['-e', `display dialog "${escape(message)}" with title "${escape(title)}" buttons {"Schließen"} default button "Schließen"; return "SHOWN"`]
    }];
  }
  if (platform === 'linux') {
    // Minimal Linux installations commonly ship either GTK (Zenity) or KDE
    // (KDialog), not necessarily both. They receive the same fixed, content-
    // free summary and are tried only when the first executable is absent.
    return [
      { command: 'zenity', args: ['--info', `--title=${title}`, `--text=${message}`] },
      { command: 'kdialog', args: ['--msgbox', message, '--title', title] }
    ];
  }
  if (platform !== 'win32') throw new SafeError('Für dieses Betriebssystem ist keine lokale Abschlussansicht verfügbar.');
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
  return [{
    command: path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script]
  }];
}

function showCompletionSummary(summary, options = {}) {
  const platform = options.platform || process.platform;
  let unavailable = 0;
  for (const spec of completionSummaryCommands(summary, options)) {
    const result = (options.runner || defaultRunner)(
      spec.command,
      spec.args,
      undefined,
      options.env || process.env
    );
    if (result?.error?.code === 'ENOENT') {
      unavailable++;
      continue;
    }
    const shown = platform === 'linux'
      ? result?.status === 0
      : result?.status === 0 && String(result?.stdout || '').trim() === 'SHOWN';
    if (result?.error || !shown) throw new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.');
    return true;
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist keine lokale Abschlussansicht verfügbar.');
  throw new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.');
}

// The MCP batch path publishes only this bounded progress object.  Keeping the
// adapter here prevents the native UI from ever receiving a source identifier,
// package id, path, filename or document content.
function showTerminalBatchSummary(progress, options = {}) {
  if (!progress || progress.complete !== true) return false;
  return showCompletionSummary({
    selected_count: progress.batch_total,
    released_count: progress.released,
    failed_count: progress.stopped
  }, options);
}

module.exports = {
  validateSummary,
  completionSummaryText,
  completionSummaryCommand,
  completionSummaryCommands,
  showCompletionSummary,
  showTerminalBatchSummary
};
