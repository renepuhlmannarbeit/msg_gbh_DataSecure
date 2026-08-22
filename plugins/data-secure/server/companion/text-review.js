'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { LIMITS } = require('../gateway/common');
const { normalizeText } = require('../privacy/base');

const REVIEW_SCHEMA = 'data-secure-text-review/2';
const MAX_REVIEW_CHARS = LIMITS.MAX_TEXT_CHARS;
const MAX_MANUAL_REDACTIONS = 10_000;

function buildReviewDraft(originalText, anonymizedText, profile, ambiguities = [], progress = {}) {
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
  const safeAmbiguities = (ambiguities || []).map((item) => {
    const keys = ['ambiguity_id', 'anonymized_end', 'anonymized_start', 'original_end', 'original_start', 'type'];
    if (!item || Object.keys(item).sort().join(',') !== keys.sort().join(',') ||
      !/^credential:v2:[0-9]{6}$/.test(String(item.ambiguity_id || '')) ||
      item.type !== 'credential_issuer_ambiguous' ||
      !Number.isSafeInteger(item.original_start) || !Number.isSafeInteger(item.original_end) ||
      !Number.isSafeInteger(item.anonymized_start) || !Number.isSafeInteger(item.anonymized_end) ||
      item.original_start < 0 || item.original_end <= item.original_start || item.original_end > original.length ||
      item.anonymized_start < 0 || item.anonymized_end <= item.anonymized_start || item.anonymized_end > anonymized.length) {
      throw new SafeError('Ein lokaler Mehrdeutigkeits-Hinweis ist ungültig.');
    }
    return { ...item };
  });
  const batchIndex = progress.batchIndex ?? 1;
  const batchTotal = progress.batchTotal ?? 1;
  if (!Number.isSafeInteger(batchIndex) || !Number.isSafeInteger(batchTotal) ||
    batchIndex < 1 || batchTotal < 1 || batchTotal > 25 || batchIndex > batchTotal) {
    throw new SafeError('Der lokale Dateifortschritt ist ungültig.');
  }
  return {
    schema: REVIEW_SCHEMA,
    original_text: original,
    anonymized_text: anonymized,
    locators,
    ambiguities: safeAmbiguities,
    batch_index: batchIndex,
    batch_total: batchTotal
  };
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
    'if ([int]$draft.batch_total -gt 1) { $form.Text += " - Datei " + [int]$draft.batch_index + " von " + [int]$draft.batch_total }',
    '$form.Width = 1200; $form.Height = 760; $form.StartPosition = "CenterScreen"; $form.TopMost = $true; $form.ShowInTaskbar = $true',
    '$form.Add_Shown({ $form.Activate(); $form.BringToFront() })',
    '$form.FormBorderStyle = "Sizable"; $form.MinimizeBox = $true',
    '$info = New-Object System.Windows.Forms.Label',
    '$info.Dock = "Top"; $info.Height = 52; $info.Padding = [System.Windows.Forms.Padding]::new(10, 8, 10, 4)',
    '$info.Text = "Prüfe nur die gelben Stellen. Rot wurde bereits anonymisiert. Rechts unten siehst du die fertige Fassung für Claude."',
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
    '[void]$rightLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle("Percent", 50)))',
    '[void]$rightLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle("Percent", 50)))',
    '$rightLayout.Controls.Add($right, 0, 0); $rightLayout.Controls.Add($preview, 0, 1)',
    'foreach ($locator in $draft.locators) { $left.Select([int]$locator.start, [int]$locator.end - [int]$locator.start); $left.SelectionBackColor = [System.Drawing.Color]::LightSalmon }',
    'foreach ($item in $draft.ambiguities) { $left.Select([int]$item.original_start, [int]$item.original_end - [int]$item.original_start); $left.SelectionBackColor = [System.Drawing.Color]::Khaki; $right.Select([int]$item.anonymized_start, [int]$item.anonymized_end - [int]$item.anonymized_start); $right.SelectionBackColor = [System.Drawing.Color]::Khaki }',
    '$left.Select(0, 0)',
    '$split.Panel1.Controls.Add($left); $split.Panel2.Controls.Add($rightLayout)',
    '$buttons = New-Object System.Windows.Forms.FlowLayoutPanel',
    '$buttons.Dock = "Bottom"; $buttons.Height = 86; $buttons.FlowDirection = "RightToLeft"; $buttons.Padding = [System.Windows.Forms.Padding]::new(8)',
    '$approve = New-Object System.Windows.Forms.Button; $approve.Text = "Geprüft freigeben"; $approve.Width = 150',
    '$redact = New-Object System.Windows.Forms.Button; $redact.Text = "Auswahl anonymisieren"; $redact.Width = 165',
    '$skip = New-Object System.Windows.Forms.Button; $skip.Text = "Prüfung überspringen"; $skip.Width = 160',
    '$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Abbrechen"; $cancel.Width = 110',
    '$keep = New-Object System.Windows.Forms.Button; $keep.Text = "Ja, beibehalten"; $keep.Width = 145',
    '$anonOrg = New-Object System.Windows.Forms.Button; $anonOrg.Text = "Nein, Namen ersetzen"; $anonOrg.Width = 170',
    '$back = New-Object System.Windows.Forms.Button; $back.Text = "Zurück / ändern"; $back.Width = 140',
    '$ambiguityInfo = New-Object System.Windows.Forms.Label; $ambiguityInfo.Width = 330; $ambiguityInfo.Height = 38',
    '$script:answer = $null; $script:redactions = New-Object System.Collections.ArrayList; $script:decisions = @{}; $script:current = 0',
    'function Ambiguity-Redactions { $items = New-Object System.Collections.ArrayList; foreach ($candidate in $draft.ambiguities) { if ($script:decisions[[string]$candidate.ambiguity_id] -eq "redact") { [void]$items.Add(@{ start = [int]$candidate.anonymized_start; end = [int]$candidate.anonymized_end }) } }; return $items }',
    'function Update-Preview { $value = [string]$draft.anonymized_text; $all = @($script:redactions) + @(Ambiguity-Redactions); foreach ($item in @($all | Sort-Object start -Descending)) { $value = $value.Substring(0, [int]$item.start) + "[MANUAL_REDACTION]" + $value.Substring([int]$item.end) }; $preview.Text = $value }',
    'function Show-Ambiguity { if ($draft.ambiguities.Count -eq 0) { $ambiguityInfo.Text = "Keine offene Zuordnung"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $back.Enabled = $false; $approve.Enabled = $true; return }; if ($script:current -ge $draft.ambiguities.Count) { $ambiguityInfo.Text = "Alle " + $draft.ambiguities.Count + " Stellen entschieden"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $back.Enabled = $true; $approve.Enabled = $true; return }; $candidate = $draft.ambiguities[$script:current]; $ambiguityInfo.Text = "Stelle " + ($script:current + 1) + " von " + $draft.ambiguities.Count + ": Gehört dieser Name zu einer Zertifizierung?"; $keep.Enabled = $true; $anonOrg.Enabled = $true; $back.Enabled = ($script:current -gt 0); $approve.Enabled = $false; $right.Select([int]$candidate.anonymized_start, [int]$candidate.anonymized_end - [int]$candidate.anonymized_start); $right.ScrollToCaret() }',
    'function Decide-Ambiguity([string]$decision) { if ($script:current -ge $draft.ambiguities.Count) { return }; $candidate = $draft.ambiguities[$script:current]; $script:decisions[[string]$candidate.ambiguity_id] = $decision; $script:current++; Update-Preview; Show-Ambiguity }',
    '$redact.Add_Click({ $start = $right.SelectionStart; $length = $right.SelectionLength; if ($length -le 0) { [void][System.Windows.Forms.MessageBox]::Show("Bitte zuerst rechts eine sensible Stelle auswählen.", "DataSecure", "OK", "Information"); return }; $end = $start + $length; foreach ($candidate in $draft.ambiguities) { if ($start -lt [int]$candidate.anonymized_end -and [int]$candidate.anonymized_start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Für gelb markierte Organisationen bitte die Schaltflächen Erhalten oder Anonymisieren verwenden.", "DataSecure", "OK", "Warning"); return } }; foreach ($item in $script:redactions) { if ($start -lt [int]$item.end -and [int]$item.start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Diese Auswahl überschneidet sich mit einer bestehenden manuellen Anonymisierung.", "DataSecure", "OK", "Warning"); return } }; [void]$script:redactions.Add(@{ start = $start; end = $end }); $right.SelectionBackColor = [System.Drawing.Color]::LightSalmon; $right.Select(0, 0); Update-Preview })',
    '$keep.Add_Click({ Decide-Ambiguity "keep" })',
    '$anonOrg.Add_Click({ Decide-Ambiguity "redact" })',
    '$back.Add_Click({ if ($draft.ambiguities.Count -eq 0) { return }; if ($script:current -ge $draft.ambiguities.Count) { $script:current = $draft.ambiguities.Count - 1 } elseif ($script:current -gt 0) { $script:current-- }; $candidate = $draft.ambiguities[$script:current]; [void]$script:decisions.Remove([string]$candidate.ambiguity_id); Update-Preview; Show-Ambiguity })',
    '$approve.Add_Click({ if ($script:decisions.Count -ne $draft.ambiguities.Count) { [void][System.Windows.Forms.MessageBox]::Show("Bitte jede gelb markierte Organisation als Zertifizierung erhalten oder anonymisieren.", "DataSecure", "OK", "Warning"); return }; $decisionList = @(); foreach ($candidate in $draft.ambiguities) { $decisionList += @{ ambiguity_id = [string]$candidate.ambiguity_id; decision = [string]$script:decisions[[string]$candidate.ambiguity_id] } }; $script:answer = @{ action = "reviewed"; redactions = @($script:redactions); decisions = $decisionList }; $form.Close() })',
    '$skip.Add_Click({ if ($draft.ambiguities.Count -gt 0) { [void][System.Windows.Forms.MessageBox]::Show("Bei gelb markierten Organisationen darf die Prüfung nicht übersprungen werden.", "DataSecure", "OK", "Warning"); return }; $script:answer = @{ action = "skipped" }; $form.Close() })',
    '$cancel.Add_Click({ $script:answer = @{ action = "cancelled" }; $form.Close() })',
    '$form.Add_FormClosing({ if ($null -eq $script:answer) { $script:answer = @{ action = "cancelled" } } })',
    '$skip.Visible = ($draft.ambiguities.Count -eq 0)',
    '$buttons.Controls.AddRange(@($approve, $redact, $skip, $cancel, $back, $keep, $anonOrg, $ambiguityInfo))',
    '$form.Controls.Add($split); $form.Controls.Add($buttons); $form.Controls.Add($info)',
    'Show-Ambiguity; Update-Preview',
    '[void]$form.ShowDialog()',
    '[Console]::Out.Write(($script:answer | ConvertTo-Json -Compress))'
  ].join('; ');
}

function validateReviewResult(value, draft = null) {
  if (!value || !['reviewed', 'skipped', 'cancelled'].includes(value.action)) {
    throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.');
  }
  if (value.action === 'reviewed') {
    if (!Array.isArray(value.redactions) || value.redactions.length > MAX_MANUAL_REDACTIONS) {
      throw new SafeError('Die lokalen Anonymisierungsaktionen sind ungültig oder zu zahlreich.');
    }
    const reviewKeys = Object.keys(value).sort().join(',');
    const noAmbiguities = !draft || (draft.ambiguities || []).length === 0;
    if (reviewKeys !== 'action,decisions,redactions' && !(noAmbiguities && reviewKeys === 'action,redactions')) {
      throw new SafeError('Die lokale Textprüfung enthält nicht erlaubte Felder.');
    }
    const suppliedDecisions = value.decisions === undefined && noAmbiguities ? [] : value.decisions;
    if (!Array.isArray(suppliedDecisions)) throw new SafeError('Die lokalen Zuordnungsentscheidungen fehlen.');
    const decisions = suppliedDecisions.map((item) => {
      if (!item || Object.keys(item).sort().join(',') !== 'ambiguity_id,decision' ||
        !['keep', 'redact'].includes(item.decision)) {
        throw new SafeError('Eine lokale Zuordnungsentscheidung ist ungültig.');
      }
      return { ambiguity_id: String(item.ambiguity_id), decision: item.decision };
    });
    if (draft) {
      const expected = (draft.ambiguities || []).map((item) => item.ambiguity_id).sort();
      const actual = decisions.map((item) => item.ambiguity_id).sort();
      if (new Set(actual).size !== actual.length || actual.join(',') !== expected.join(',')) {
        throw new SafeError('Nicht alle mehrdeutigen Organisationen wurden lokal entschieden.');
      }
    }
    return {
      action: 'reviewed',
      decisions,
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
  const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const runner = options.runner || defaultRunner;
  const result = runner(
    powershell,
    ['-NoProfile', '-NonInteractive', '-Sta', '-Command', powershellReviewScript()],
    JSON.stringify(draft)
  );
  if (result?.error || result?.status !== 0) throw new SafeError('Die lokale Textprüfung konnte nicht sicher abgeschlossen werden.');
  let parsed;
  try { parsed = JSON.parse(String(result.stdout || '')); } catch { throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.'); }
  return validateReviewResult(parsed, draft);
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
