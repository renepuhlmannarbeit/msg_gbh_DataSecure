'use strict';

const path = require('path');
const { SafeError } = require('../runtime');
const { runPickerAsync } = require('./file-picker');

const PICKER_CANCELLED = 'LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED';
const PICKER_TITLE = 'DataSecure – anonymisierte Ergebnisse auswerten';

function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 50) {
    throw new SafeError('Die lokale Auswahl abgeschlossener Stapel ist ungültig.');
  }
  return candidates.map((candidate, index) => {
    const ordinal = Number(candidate?.ordinal);
    const released = Number(candidate?.released);
    const stopped = Number(candidate?.stopped);
    if (!Number.isSafeInteger(ordinal) || ordinal !== index + 1 ||
        !Number.isSafeInteger(released) || released < 1 ||
        !Number.isSafeInteger(stopped) || stopped < 0) {
      throw new SafeError('Die lokale Auswahl abgeschlossener Stapel ist ungültig.');
    }
    return { ordinal, released, stopped };
  });
}

function candidateLabel(candidate) {
  const stopped = candidate.stopped > 0 ? ` · ${candidate.stopped} sicher gestoppt` : '';
  return `Stapel ${candidate.ordinal} – ${candidate.released} freigegebene Ergebnisse${stopped}`;
}

function pickerCommands(candidates, options = {}) {
  const entries = validateCandidates(candidates);
  const labels = entries.map(candidateLabel);
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    const quote = (value) => value.replace(/'/g, "''");
    const items = labels.map((label) => `[void]$list.Items.Add('${quote(label)}')`).join('; ');
    const script = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.Windows.Forms',
      '$form = New-Object System.Windows.Forms.Form',
      `$form.Text = '${quote(PICKER_TITLE)}'`,
      "$form.StartPosition = 'CenterScreen'", '$form.ClientSize = New-Object System.Drawing.Size(560,310)',
      '$form.FormBorderStyle = "FixedDialog"', '$form.MaximizeBox = $false', '$form.MinimizeBox = $false',
      '$info = New-Object System.Windows.Forms.Label',
      "$info.Text = 'Wähle einen lokal abgeschlossenen Stapel. Dateinamen und Inhalte werden nicht angezeigt.'",
      '$info.Location = New-Object System.Drawing.Point(20,18)', '$info.Size = New-Object System.Drawing.Size(520,42)',
      '$list = New-Object System.Windows.Forms.ListBox', '$list.Location = New-Object System.Drawing.Point(20,68)', '$list.Size = New-Object System.Drawing.Size(520,165)',
      items, '$list.SelectedIndex = 0',
      '$start = New-Object System.Windows.Forms.Button', "$start.Text = 'Auswertung starten'", '$start.Location = New-Object System.Drawing.Point(300,252)', '$start.Size = New-Object System.Drawing.Size(150,32)', '$start.DialogResult = [System.Windows.Forms.DialogResult]::OK',
      '$cancel = New-Object System.Windows.Forms.Button', "$cancel.Text = 'Abbrechen'", '$cancel.Location = New-Object System.Drawing.Point(460,252)', '$cancel.Size = New-Object System.Drawing.Size(80,32)', '$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel',
      '$form.AcceptButton = $start', '$form.CancelButton = $cancel', '$form.Controls.AddRange(@($info,$list,$start,$cancel))',
      '$result = $form.ShowDialog()', "if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $list.SelectedIndex -ge 0) { [Console]::Out.Write($list.SelectedIndex + 1) } else { [Console]::Out.Write('" + PICKER_CANCELLED + "') }"
    ].join('; ');
    return [{ command: path.win32.join(options.env?.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script] }];
  }
  if (platform === 'darwin') {
    const escape = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const choices = labels.map((label) => `"${escape(label)}"`).join(', ');
    const script = [
      `set choices to {${choices}}`,
      `set answer to choose from list choices with title "${escape(PICKER_TITLE)}" with prompt "Wähle einen lokal abgeschlossenen Stapel." OK button name "Auswertung starten" cancel button name "Abbrechen" without multiple selections allowed`,
      `if answer is false then return "${PICKER_CANCELLED}"`,
      'set chosen to item 1 of answer',
      'repeat with i from 1 to count of choices', 'if item i of choices is chosen then return i as text', 'end repeat'
    ].join('\n');
    return [{ command: '/usr/bin/osascript', args: ['-e', script] }];
  }
  if (platform === 'linux') {
    const rows = entries.flatMap((candidate) => [String(candidate.ordinal), candidateLabel(candidate)]);
    return [
      { command: 'zenity', args: ['--list', `--title=${PICKER_TITLE}`, '--text=Wähle einen lokal abgeschlossenen Stapel.', '--column=Nr.', '--column=Stapel', '--hide-column=1', '--print-column=1', '--width=620', '--height=360', ...rows] },
      { command: 'kdialog', args: ['--menu', 'Wähle einen lokal abgeschlossenen Stapel.', ...rows] }
    ];
  }
  throw new SafeError('Für dieses Betriebssystem ist keine lokale Stapelauswahl verfügbar.');
}

function cancelledError() {
  const error = new SafeError('Die lokale Auswahl anonymisierter Ergebnisse wurde abgebrochen.');
  error.code = PICKER_CANCELLED;
  return error;
}

function selectionError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function checkAbort(signal) {
  if (signal?.aborted) throw cancelledError();
}

async function pickCompletedBatch(candidates, options = {}) {
  checkAbort(options.signal);
  const entries = validateCandidates(candidates);
  const runner = options.runner || runPickerAsync;
  let unavailable = 0;
  for (const spec of pickerCommands(entries, options)) {
    checkAbort(options.signal);
    const result = await runner(spec.command, spec.args, undefined, options.env || process.env, options.signal);
    checkAbort(options.signal);
    const output = String(result?.stdout || '').trim();
    if (result?.error?.code === 'ENOENT' && !output) { unavailable++; continue; }
    if (result?.error?.code === 'ETIMEDOUT' || result?.error?.killed) {
      throw selectionError('LOCAL_COMPLETED_BATCH_SELECTION_TIMEOUT', 'Die lokale Stapelauswahl wurde wegen Zeitüberschreitung beendet.');
    }
    // Only the documented Linux Cancel exit is a cancellation. A failed or
    // timed-out helper must never authenticate a partially written ordinal.
    const linuxCancel = (options.platform || process.platform) === 'linux' &&
      result?.status === 1 && !output && (!result.error || result.error.code === 1);
    if (linuxCancel) throw cancelledError();
    if (result?.error || result?.status !== 0) {
      throw selectionError('LOCAL_COMPLETED_BATCH_SELECTION_FAILED', 'Die lokale Stapelauswahl konnte nicht abgeschlossen werden. Bitte die Auswertung erneut starten.');
    }
    if (output === PICKER_CANCELLED) throw cancelledError();
    const ordinal = Number(output);
    if (!/^[1-9][0-9]*$/.test(output) || !Number.isSafeInteger(ordinal) || ordinal > entries.length) {
      throw new SafeError('Die lokale Auswahl anonymisierter Ergebnisse konnte nicht sicher gelesen werden.');
    }
    return ordinal;
  }
  if (unavailable) throw new SafeError('Auf diesem Gerät ist keine lokale Stapelauswahl verfügbar.');
  throw new SafeError('Die lokale Auswahl anonymisierter Ergebnisse konnte nicht geöffnet werden.');
}

module.exports = { PICKER_CANCELLED, PICKER_TITLE, validateCandidates, candidateLabel, pickerCommands, cancelledError, pickCompletedBatch };
