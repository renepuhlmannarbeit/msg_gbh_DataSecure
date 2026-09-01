'use strict';

// This module is deliberately a transport contract, not an Office decrypter.
// It prevents a future decrypter from taking the tempting but unsafe shortcut
// of putting a password in an MCP parameter, environment variable, CLI flag,
// batch journal, or diagnostic.  Until a reviewed local decrypter is wired in,
// password-protected files remain fail-closed.

const childProcess = require('child_process');
const path = require('path');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');

const PASSWORD_CANCELLED = '__DATASECURE_PASSWORD_CANCELLED__';
const PASSWORD_TITLE = 'DataSecure – lokales Dokumentpasswort';
const MAX_PASSWORD_BYTES = 4096;
const PASSWORD_CANCELLED_BYTES = Buffer.from(PASSWORD_CANCELLED, 'utf8');

function passwordPromptCommands(options = {}) {
  const platform = options.platform || process.platform;
  const prompt = 'Passwort nur lokal eingeben. Es wird nicht an Claude übertragen oder gespeichert.';
  if (platform === 'win32') {
    const systemRoot = options.env?.SystemRoot || 'C:\\Windows';
    // The masked native control avoids placing the secret in the command
    // line. The only inter-process copy is the inherited local stdout pipe,
    // immediately zeroed by withLocalPassword().
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$form = New-Object System.Windows.Forms.Form',
      "$form.Text = '" + PASSWORD_TITLE + "'",
      '$form.Width = 520; $form.Height = 180; $form.StartPosition = "CenterScreen"',
      '$label = New-Object System.Windows.Forms.Label; $label.Text = \'' + prompt.replace(/'/g, "''") + '\'; $label.AutoSize = $true; $label.Left = 18; $label.Top = 18',
      '$box = New-Object System.Windows.Forms.TextBox; $box.Left = 18; $box.Top = 55; $box.Width = 465; $box.UseSystemPasswordChar = $true',
      '$ok = New-Object System.Windows.Forms.Button; $ok.Text = "Weiter"; $ok.Left = 305; $ok.Top = 95; $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK',
      '$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Abbrechen"; $cancel.Left = 395; $cancel.Top = 95; $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel',
      '$form.Controls.AddRange(@($label, $box, $ok, $cancel)); $form.AcceptButton = $ok; $form.CancelButton = $cancel',
      '$result = $form.ShowDialog()',
      "if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $box.Text.Length -gt 0) { [Console]::Out.Write($box.Text) } else { [Console]::Out.Write('" + PASSWORD_CANCELLED + "') }",
      '$box.Text = ""; $form.Dispose()'
    ].join('; ');
    return [{
      command: path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script]
    }];
  }
  if (platform === 'darwin') {
    const script = [
      `set value to text returned of (display dialog "${prompt}" with title "${PASSWORD_TITLE}" default answer "" with hidden answer buttons {"Abbrechen", "Weiter"} default button "Weiter" cancel button "Abbrechen")`,
      'return value'
    ].join('\n');
    return [{ command: '/usr/bin/osascript', args: ['-e', script] }];
  }
  if (platform === 'linux') {
    return [
      { command: 'zenity', args: ['--password', `--title=${PASSWORD_TITLE}`, `--text=${prompt}`] },
      { command: 'kdialog', args: ['--password', prompt, '--title', PASSWORD_TITLE] }
    ];
  }
  throw new SafeError('Für dieses Betriebssystem ist kein lokaler Passwortdialog verfügbar.');
}

function defaultRunner(command, args, _input, env = process.env) {
  return childProcess.spawnSync(command, args, {
    encoding: 'buffer', windowsHide: true, timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024, shell: false, env: uiProcessEnvironment(env)
  });
}

function cancelled() {
  const error = new SafeError('Die lokale Passworteingabe wurde abgebrochen. Es wurde nichts verarbeitet.');
  error.code = 'LOCAL_PASSWORD_CANCELLED';
  return error;
}

function secretFromOutput(output) {
  // `encoding: buffer` is not a convenience detail: accepting a JavaScript
  // string would create an immutable copy that cannot subsequently be wiped.
  if (!Buffer.isBuffer(output)) throw new SafeError('Der lokale Passwortdialog lieferte keinen sicheren Binärwert.');
  const source = output;
  try {
    let end = source.length;
    while (end > 0 && (source[end - 1] === 10 || source[end - 1] === 13)) end--;
    if (end > MAX_PASSWORD_BYTES) throw new SafeError('Die lokale Passworteingabe ist zu lang.');
    const secret = Buffer.alloc(end);
    source.copy(secret, 0, 0, end);
    if (!secret.length || (secret.length === PASSWORD_CANCELLED_BYTES.length && secret.equals(PASSWORD_CANCELLED_BYTES))) {
      secret.fill(0);
      throw cancelled();
    }
    return secret;
  } finally {
    // `spawnSync` owns this buffer. Wipe the child-process copy as soon as it
    // has been transferred into the dedicated callback buffer.
    source.fill(0);
  }
}

async function withLocalPassword(consumer, options = {}) {
  if (typeof consumer !== 'function') throw new TypeError('withLocalPassword benötigt einen lokalen Verbraucher.');
  const runner = options.runner || defaultRunner;
  let unavailable = 0;
  for (const spec of passwordPromptCommands(options)) {
    const result = runner(spec.command, spec.args, undefined, options.env || process.env);
    try {
      if (result?.error?.code === 'ENOENT') { unavailable++; continue; }
      if (result?.error?.code === 'ETIMEDOUT') throw new SafeError('Die lokale Passworteingabe wurde wegen Zeitüberschreitung beendet.');
      if (result?.error) throw new SafeError('Der lokale Passwortdialog konnte nicht gestartet werden.');
      if (result?.status !== 0) throw cancelled();
      const password = secretFromOutput(result?.stdout);
      try {
        return await consumer(password);
      } finally {
        password.fill(0);
      }
    } finally {
      // Error, timeout, cancellation and unavailable-helper paths may all
      // carry partial child output. No branch may retain it.
      if (Buffer.isBuffer(result?.stdout)) result.stdout.fill(0);
    }
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist kein unterstützter lokaler Passwortdialog verfügbar.');
  throw cancelled();
}

module.exports = { PASSWORD_CANCELLED, PASSWORD_TITLE, MAX_PASSWORD_BYTES, passwordPromptCommands, secretFromOutput, withLocalPassword };
