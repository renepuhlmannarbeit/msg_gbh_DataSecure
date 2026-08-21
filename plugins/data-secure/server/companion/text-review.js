'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { LIMITS } = require('../gateway/common');
const { normalizeText } = require('../privacy/base');

const REVIEW_SCHEMA = 'data-secure-text-review/1';
const MAX_REVIEW_CHARS = LIMITS.MAX_TEXT_CHARS;
const MAX_MANUAL_REDACTIONS = 10_000;

function buildReviewDraft(originalText, anonymizedText, profile) {
  // sensitiveSpans uses the engine's normalised coordinate space. Displaying
  // that same local-only representation keeps highlights correct for NFC,
  // soft-hyphen and zero-width inputs instead of applying shifted offsets.
  const original = normalizeText(originalText);
  const anonymized = String(anonymizedText || '');
  const locators = pii.sensitiveSpans(original, profile).map((span, index) => ({
    locator_id: `text:v1:${String(index + 1).padStart(6, '0')}`,
    medium: 'extracted_text',
    start: span.start,
    end: span.end,
    type: span.type
  }));
  return { schema: REVIEW_SCHEMA, original_text: original, anonymized_text: anonymized, locators };
}

function powershellUtf8Preamble() {
  return [
    '$ErrorActionPreference = "Stop"',
    '$utf8 = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8; $OutputEncoding = $utf8'
  ].join('; ');
}

function powershellReviewScript() {
  return [
    powershellUtf8Preamble(),
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$draft = [Console]::In.ReadToEnd() | ConvertFrom-Json',
    '$form = New-Object System.Windows.Forms.Form',
    '$form.Text = "DataSecure - lokale Textprüfung"',
    '$form.Width = 1200; $form.Height = 760; $form.StartPosition = "CenterScreen"',
    '$form.FormBorderStyle = "Sizable"; $form.MinimizeBox = $true',
    '$info = New-Object System.Windows.Forms.Label',
    '$info.Dock = "Top"; $info.Height = 52; $info.Padding = "10,8,10,4"',
    '$info.Text = "Links: normalisierter Quelltext (Hinweise markiert). Rechts oben: anonymisierte Fassung zum Auswählen weiterer sensibler Stellen. Rechts unten: exakte Vorschau der Freigabe."',
    '$split = New-Object System.Windows.Forms.SplitContainer',
    '$split.Dock = "Fill"; $split.Orientation = "Vertical"; $split.SplitterDistance = 570',
    '$left = New-Object System.Windows.Forms.RichTextBox',
    '$left.Dock = "Fill"; $left.ReadOnly = $true; $left.Text = [string]$draft.original_text',
    '$left.Font = New-Object System.Drawing.Font("Consolas", 10)',
    '$right = New-Object System.Windows.Forms.RichTextBox',
    '$right.Dock = "Fill"; $right.ReadOnly = $true; $right.Text = [string]$draft.anonymized_text',
    '$right.Font = New-Object System.Drawing.Font("Consolas", 10)',
    '$preview = New-Object System.Windows.Forms.RichTextBox',
    '$preview.Dock = "Fill"; $preview.ReadOnly = $true; $preview.Text = [string]$draft.anonymized_text',
    '$preview.Font = New-Object System.Drawing.Font("Consolas", 10)',
    '$rightLayout = New-Object System.Windows.Forms.TableLayoutPanel',
    '$rightLayout.Dock = "Fill"; $rightLayout.RowCount = 2; $rightLayout.ColumnCount = 1',
    '$rightLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle("Percent", 50)))',
    '$rightLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle("Percent", 50)))',
    '$rightLayout.Controls.Add($right, 0, 0); $rightLayout.Controls.Add($preview, 0, 1)',
    'foreach ($locator in $draft.locators) { $left.Select([int]$locator.start, [int]$locator.end - [int]$locator.start); $left.SelectionBackColor = [System.Drawing.Color]::LightSalmon }',
    '$left.Select(0, 0)',
    '$split.Panel1.Controls.Add($left); $split.Panel2.Controls.Add($rightLayout)',
    '$buttons = New-Object System.Windows.Forms.FlowLayoutPanel',
    '$buttons.Dock = "Bottom"; $buttons.Height = 54; $buttons.FlowDirection = "RightToLeft"; $buttons.Padding = "8"',
    '$approve = New-Object System.Windows.Forms.Button; $approve.Text = "Geprüft freigeben"; $approve.Width = 150',
    '$redact = New-Object System.Windows.Forms.Button; $redact.Text = "Auswahl anonymisieren"; $redact.Width = 165',
    '$skip = New-Object System.Windows.Forms.Button; $skip.Text = "Prüfung überspringen"; $skip.Width = 160',
    '$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Abbrechen"; $cancel.Width = 110',
    '$script:answer = $null; $script:redactions = New-Object System.Collections.ArrayList',
    'function Update-Preview { $value = [string]$draft.anonymized_text; foreach ($item in @($script:redactions | Sort-Object start -Descending)) { $value = $value.Substring(0, [int]$item.start) + "[MANUAL_REDACTION]" + $value.Substring([int]$item.end) }; $preview.Text = $value }',
    '$redact.Add_Click({ $start = $right.SelectionStart; $length = $right.SelectionLength; if ($length -le 0) { [void][System.Windows.Forms.MessageBox]::Show("Bitte zuerst rechts eine sensible Stelle auswählen.", "DataSecure", "OK", "Information"); return }; $end = $start + $length; foreach ($item in $script:redactions) { if ($start -lt [int]$item.end -and [int]$item.start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Diese Auswahl überschneidet sich mit einer bestehenden manuellen Anonymisierung.", "DataSecure", "OK", "Warning"); return } }; [void]$script:redactions.Add(@{ start = $start; end = $end }); $right.SelectionBackColor = [System.Drawing.Color]::LightSalmon; $right.Select(0, 0); Update-Preview })',
    '$approve.Add_Click({ $script:answer = @{ action = "reviewed"; redactions = @($script:redactions) }; $form.Close() })',
    '$skip.Add_Click({ $script:answer = @{ action = "skipped" }; $form.Close() })',
    '$cancel.Add_Click({ $script:answer = @{ action = "cancelled" }; $form.Close() })',
    '$form.Add_FormClosing({ if ($null -eq $script:answer) { $script:answer = @{ action = "cancelled" } } })',
    '$buttons.Controls.AddRange(@($approve, $redact, $skip, $cancel))',
    '$form.Controls.Add($split); $form.Controls.Add($buttons); $form.Controls.Add($info)',
    '[void]$form.ShowDialog()',
    '[Console]::Out.Write(($script:answer | ConvertTo-Json -Compress))'
  ].join('; ');
}

function validateReviewResult(value) {
  if (!value || !['reviewed', 'skipped', 'cancelled'].includes(value.action)) {
    throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.');
  }
  if (value.action === 'reviewed') {
    if (!Array.isArray(value.redactions) || value.redactions.length > MAX_MANUAL_REDACTIONS) {
      throw new SafeError('Die lokalen Anonymisierungsaktionen sind ungültig oder zu zahlreich.');
    }
    if (Object.keys(value).sort().join(',') !== 'action,redactions') {
      throw new SafeError('Die lokale Textprüfung enthält nicht erlaubte Felder.');
    }
    return {
      action: 'reviewed',
      redactions: value.redactions.map((range) => {
        if (
          !range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
          Object.keys(range).sort().join(',') !== 'end,start'
        ) throw new SafeError('Eine lokale Anonymisierungsauswahl ist ungültig.');
        return { start: range.start, end: range.end };
      })
    };
  }
  if (Object.keys(value).join(',') !== 'action') throw new SafeError('Die lokale Textprüfung enthält nicht erlaubte Felder.');
  return { action: value.action };
}

function applyManualRedactions(text, ranges) {
  const source = String(text || '');
  const sorted = [...(ranges || [])].sort((a, b) => a.start - b.start || a.end - b.end);
  let previousEnd = 0;
  for (const range of sorted) {
    if (
      !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
      range.start < previousEnd || range.start < 0 || range.end <= range.start || range.end > source.length
    ) throw new SafeError('Eine lokale Anonymisierungsauswahl liegt außerhalb des geprüften Textes.');
    previousEnd = range.end;
  }
  let result = source;
  for (const range of sorted.reverse()) {
    result = result.slice(0, range.start) + '[MANUAL_REDACTION]' + result.slice(range.end);
  }
  if (result.length > MAX_REVIEW_CHARS) throw new SafeError('Die lokal anonymisierte Fassung ist zu groß.');
  return result;
}

function defaultRunner(command, args, input) {
  return childProcess.spawnSync(command, args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    // Keep the UI deadline well inside the supervisor's ten-minute request
    // deadline so spawnSync tears down PowerShell before the Node child can be
    // terminated by its parent.
    timeout: 5 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    shell: false
  });
}

function reviewTextLocally(draft, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') {
    throw new SafeError('Die bearbeitbare lokale Textprüfung ist in diesem Pilot derzeit nur unter Windows verfügbar.');
  }
  if (!draft || draft.schema !== REVIEW_SCHEMA) throw new SafeError('Ungültiger lokaler Review-Entwurf.');
  const env = options.env || process.env;
  const powershell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const runner = options.runner || defaultRunner;
  const result = runner(
    powershell,
    ['-NoProfile', '-NonInteractive', '-Sta', '-Command', powershellReviewScript()],
    JSON.stringify(draft)
  );
  if (result?.error || result?.status !== 0) throw new SafeError('Die lokale Textprüfung konnte nicht sicher abgeschlossen werden.');
  let parsed;
  try { parsed = JSON.parse(String(result.stdout || '')); } catch { throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.'); }
  return validateReviewResult(parsed);
}

module.exports = {
  REVIEW_SCHEMA,
  MAX_REVIEW_CHARS,
  buildReviewDraft,
  powershellUtf8Preamble,
  powershellReviewScript,
  validateReviewResult,
  applyManualRedactions,
  reviewTextLocally
};
