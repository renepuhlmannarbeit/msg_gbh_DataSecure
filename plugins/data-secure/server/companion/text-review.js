'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { DEFAULT_REVIEW_TIMEOUT_MS } = require('./review-timeouts');
const { REVIEW_SCHEMA, BATCH_REVIEW_SCHEMA, MAX_REVIEW_CHARS, MAX_DARWIN_REVIEW_FINDINGS,
  reviewSizeError, buildReviewDraft, buildBatchReviewDraft, batchReviewProgress,
  batchReviewSummary, groupForCandidate, resolveBatchReviewResult, coordinateBatchReview,
  validateReviewResult, applyManualRedactions } = require('../core/local-review-model');


async function reviewBatchTextLocally(documents, options = {}) {
  return coordinateBatchReview(documents, options, options.reviewTextLocally || reviewTextLocally);
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
    'if ($null -ne $draft.batch_review) { $form.Text = "DataSecure - lokale Stapelprüfung" }',
    'if ([int]$draft.batch_total -gt 1) { $form.Text += " - Datei " + [int]$draft.batch_index + " von " + [int]$draft.batch_total }',
    '$form.Width = 1200; $form.Height = 760; $form.StartPosition = "CenterScreen"; $form.TopMost = $true; $form.ShowInTaskbar = $true',
    '$form.KeyPreview = $true',
    '$form.Add_Shown({ $form.Activate(); $form.BringToFront() })',
    '$form.FormBorderStyle = "Sizable"; $form.MinimizeBox = $true',
    '$info = New-Object System.Windows.Forms.Label',
    '$info.Dock = "Top"; $info.Height = 52; $info.Padding = [System.Windows.Forms.Padding]::new(10, 8, 10, 4)',
    '$info.Text = "Prüfe nur die gelben Stellen. Rot wurde bereits anonymisiert. Rechts unten siehst du die fertige Fassung für Claude."',
    'if ($null -ne $draft.batch_review) { $remaining = [int]$draft.batch_review.review_pending_count - [int]$draft.batch_review.review_document_count; $info.Text = "Automatisch abgeschlossen: " + [int]$draft.batch_review.automatically_completed_count + ". Bereits lokal geprüft: " + [int]$draft.batch_review.previously_reviewed_count + ". Jetzt: " + [int]$draft.batch_review.review_finding_count + " gelbe Stellen in " + [int]$draft.batch_review.review_document_count + " Dateien. Danach offen: " + $remaining + "."; if ([int]$draft.batch_review.safely_stopped_count -gt 0) { $info.Text += " Sicher gestoppt: " + [int]$draft.batch_review.safely_stopped_count + "." }; if ([int]$draft.batch_review.other_pending_count -gt 0) { $info.Text += " Weitere lokale Schritte offen: " + [int]$draft.batch_review.other_pending_count + "." } }',
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
    '$approve = New-Object System.Windows.Forms.Button; $approve.Text = "&Geprüft freigeben"; $approve.Width = 150',
    '$redact = New-Object System.Windows.Forms.Button; $redact.Text = "Auswahl anonymisieren"; $redact.Width = 165',
    '$skip = New-Object System.Windows.Forms.Button; $skip.Text = "Prüfung überspringen"; $skip.Width = 160',
    '$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Abbrechen"; $cancel.Width = 110',
    '$defer = New-Object System.Windows.Forms.Button; $defer.Text = "&Später entscheiden"; $defer.Width = 155',
    '$keep = New-Object System.Windows.Forms.Button; $keep.Text = "&Beibehalten"; $keep.Width = 205',
    '$anonOrg = New-Object System.Windows.Forms.Button; $anonOrg.Text = "&Anonymisieren"; $anonOrg.Width = 205',
    '$keepGroup = New-Object System.Windows.Forms.Button; $keepGroup.Text = "Gleiche behalten"; $keepGroup.Width = 155',
    '$redactGroup = New-Object System.Windows.Forms.Button; $redactGroup.Text = "Gleiche anonymisieren"; $redactGroup.Width = 175',
    '$back = New-Object System.Windows.Forms.Button; $back.Text = "&Rückgängig / ändern"; $back.Width = 155',
    '$ambiguityInfo = New-Object System.Windows.Forms.Label; $ambiguityInfo.Dock = "Bottom"; $ambiguityInfo.Height = 44; $ambiguityInfo.Padding = [System.Windows.Forms.Padding]::new(12, 6, 12, 6); $ambiguityInfo.TextAlign = "MiddleLeft"; $ambiguityInfo.BackColor = [System.Drawing.Color]::LightGoldenrodYellow; $ambiguityInfo.AutoEllipsis = $true',
    '$ambiguityTip = New-Object System.Windows.Forms.ToolTip',
    '$script:answer = $null; $script:redactions = New-Object System.Collections.ArrayList; $script:decisions = @{}; $script:current = 0; $script:activeIndex = -1',
    'function Ambiguity-Redactions { $items = New-Object System.Collections.ArrayList; foreach ($candidate in $draft.ambiguities) { if ($script:decisions[[string]$candidate.ambiguity_id] -eq "redact") { [void]$items.Add(@{ start = [int]$candidate.anonymized_start; end = [int]$candidate.anonymized_end }) } }; return $items }',
    'function Update-Preview { $value = [string]$draft.anonymized_text; $all = @($script:redactions) + @(Ambiguity-Redactions); foreach ($item in @($all | Sort-Object start -Descending)) { $candidate = @($draft.ambiguities | Where-Object { [int]$_.anonymized_start -eq [int]$item.start -and [int]$_.anonymized_end -eq [int]$item.end }) | Select-Object -First 1; $replacement = if ($null -ne $candidate -and [string]$candidate.replacement_kind -eq "PERSON") { "[PERSON]" } else { "[MANUAL_REDACTION]" }; $value = $value.Substring(0, [int]$item.start) + $replacement + $value.Substring([int]$item.end) }; $preview.Text = $value }',
    'function Group-Candidates($candidate) { if ($null -eq $draft.decision_groups) { return @() }; foreach ($group in $draft.decision_groups) { if ($null -ne $group.candidate_ids -and @($group.candidate_ids).Count -gt 1 -and @($group.candidate_ids) -contains [string]$candidate.ambiguity_id) { return @($group.candidate_ids) } }; return @() }',
    'function Advance-ToOpen { while ($script:current -lt $draft.ambiguities.Count -and $null -ne $script:decisions[[string]$draft.ambiguities[$script:current].ambiguity_id]) { $script:current++ } }',
    [
      'function Show-Ambiguity {',
      '  Advance-ToOpen;',
      '  if ($draft.ambiguities.Count -eq 0) { $ambiguityInfo.Text = "Keine offene Zuordnung"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $keepGroup.Visible = $false; $redactGroup.Visible = $false; $back.Enabled = $false; $approve.Enabled = $true; return };',
      '  if ($script:current -ge $draft.ambiguities.Count) { $ambiguityInfo.Text = "Alle " + $draft.ambiguities.Count + " Stellen entschieden"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $keepGroup.Visible = $false; $redactGroup.Visible = $false; $back.Enabled = $true; $approve.Enabled = $true; return };',
      '  if ($script:activeIndex -ge 0 -and $script:activeIndex -lt $draft.ambiguities.Count) { $previous = $draft.ambiguities[$script:activeIndex]; $left.Select([int]$previous.original_start, [int]$previous.original_end - [int]$previous.original_start); $left.SelectionBackColor = [System.Drawing.Color]::Khaki; $right.Select([int]$previous.anonymized_start, [int]$previous.anonymized_end - [int]$previous.anonymized_start); $right.SelectionBackColor = [System.Drawing.Color]::Khaki };',
      '  $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; $groupAvailable = @($group).Count -gt 1; $personGroup = $groupAvailable -and [string]$candidate.type -in @("person_prose_ambiguous", "person_residual_ambiguous");',
      '  $candidateText = [regex]::Replace(([string]$draft.original_text).Substring([int]$candidate.original_start, [int]$candidate.original_end - [int]$candidate.original_start), "\\s+", " ").Trim();',
      '  $prefix = "Aktuell " + ($script:current + 1) + "/" + $draft.ambiguities.Count + ": «" + $candidateText + "» – ";',
      '  if ([string]$candidate.type -in @("person_prose_ambiguous", "person_residual_ambiguous")) { $ambiguityInfo.Text = $prefix + "Personenname? Gold markiert die aktuelle Stelle links und rechts oben."; $keep.Text = "&Kein Personenname - beibehalten"; $anonOrg.Text = "&Als Person anonymisieren" } else { $ambiguityInfo.Text = $prefix + "Zertifikatsanbieter? Gold markiert die aktuelle Stelle links und rechts oben."; $keep.Text = "&Zertifikatsanbieter behalten"; $anonOrg.Text = "&Organisation anonymisieren" };',
      '  if ($personGroup) { $ambiguityInfo.Text += " Die Entscheidung gilt für " + @($group).Count + " gleichnamige Stellen." } elseif ($groupAvailable) { $ambiguityInfo.Text += " Gleiche lokale Stellen können bewusst gemeinsam entschieden werden." };',
      '  $ambiguityTip.SetToolTip($ambiguityInfo, $ambiguityInfo.Text);',
      '  $keep.Enabled = $true; $anonOrg.Enabled = $true; $keepGroup.Visible = $groupAvailable -and -not $personGroup; $redactGroup.Visible = $groupAvailable -and -not $personGroup; $back.Enabled = ($script:current -gt 0); $approve.Enabled = $false;',
      '  $left.Select([int]$candidate.original_start, [int]$candidate.original_end - [int]$candidate.original_start); $left.SelectionBackColor = [System.Drawing.Color]::Gold; $left.ScrollToCaret();',
      '  $right.Select([int]$candidate.anonymized_start, [int]$candidate.anonymized_end - [int]$candidate.anonymized_start); $right.SelectionBackColor = [System.Drawing.Color]::Gold; $right.ScrollToCaret(); $script:activeIndex = $script:current',
      '}'
    ].join(' '),
    'function Decide-Ambiguity([string]$decision) { if ($script:current -ge $draft.ambiguities.Count) { return }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; if ([string]$candidate.type -in @("person_prose_ambiguous", "person_residual_ambiguous") -and @($group).Count -gt 1) { foreach ($id in @($group)) { $script:decisions[[string]$id] = $decision } } else { $script:decisions[[string]$candidate.ambiguity_id] = $decision }; $script:current++; Update-Preview; Show-Ambiguity }',
    'function Decide-Group([string]$decision) { if ($script:current -ge $draft.ambiguities.Count) { return }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; if (@($group).Count -lt 2) { return }; foreach ($id in @($group)) { $script:decisions[[string]$id] = $decision }; $script:current++; Update-Preview; Show-Ambiguity }',
    '$redact.Add_Click({ $start = $right.SelectionStart; $length = $right.SelectionLength; if ($length -le 0) { [void][System.Windows.Forms.MessageBox]::Show("Bitte zuerst rechts eine sensible Stelle auswählen.", "DataSecure", "OK", "Information"); return }; $end = $start + $length; foreach ($candidate in $draft.ambiguities) { if ($start -lt [int]$candidate.anonymized_end -and [int]$candidate.anonymized_start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Für gelb markierte Namen bitte die zugehörigen Schaltflächen verwenden.", "DataSecure", "OK", "Warning"); return } }; foreach ($item in $script:redactions) { if ($start -lt [int]$item.end -and [int]$item.start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Diese Auswahl überschneidet sich mit einer bestehenden manuellen Anonymisierung.", "DataSecure", "OK", "Warning"); return } }; [void]$script:redactions.Add(@{ start = $start; end = $end }); $right.SelectionBackColor = [System.Drawing.Color]::LightSalmon; $right.Select(0, 0); Update-Preview })',
    '$keep.Add_Click({ Decide-Ambiguity "keep" })',
    '$anonOrg.Add_Click({ Decide-Ambiguity "redact" })',
    '$keepGroup.Add_Click({ Decide-Group "keep" })',
    '$redactGroup.Add_Click({ Decide-Group "redact" })',
    '$back.Add_Click({ if ($draft.ambiguities.Count -eq 0) { return }; if ($script:current -ge $draft.ambiguities.Count) { $script:current = $draft.ambiguities.Count - 1 } elseif ($script:current -gt 0) { $script:current-- }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; if (@($group).Count -gt 1) { foreach ($id in @($group)) { [void]$script:decisions.Remove([string]$id) } } else { [void]$script:decisions.Remove([string]$candidate.ambiguity_id) }; Update-Preview; Show-Ambiguity })',
    '$approve.Add_Click({ if ($script:decisions.Count -ne $draft.ambiguities.Count) { [void][System.Windows.Forms.MessageBox]::Show("Bitte jede gelb markierte Stelle beibehalten oder anonymisieren.", "DataSecure", "OK", "Warning"); return }; $decisionList = @(); foreach ($candidate in $draft.ambiguities) { $decisionList += @{ ambiguity_id = [string]$candidate.ambiguity_id; decision = [string]$script:decisions[[string]$candidate.ambiguity_id] } }; $script:answer = @{ action = "reviewed"; redactions = @($script:redactions); decisions = $decisionList }; $form.Close() })',
    '$skip.Add_Click({ if ($draft.ambiguities.Count -gt 0) { [void][System.Windows.Forms.MessageBox]::Show("Bei gelb markierten Stellen darf die Prüfung nicht übersprungen werden.", "DataSecure", "OK", "Warning"); return }; $script:answer = @{ action = "skipped" }; $form.Close() })',
    '$cancel.Add_Click({ $script:answer = @{ action = "cancelled" }; $form.Close() })',
    '$defer.Add_Click({ $script:answer = @{ action = "deferred" }; $form.Close() })',
    '$form.Add_FormClosing({ if ($null -eq $script:answer) { $script:answer = @{ action = "cancelled" } } })',
    '$form.AcceptButton = $approve',
    'if ([bool]$draft.allow_defer) { $form.CancelButton = $defer } else { $form.CancelButton = $cancel }',
    '$form.Add_KeyDown({ if ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::Z -and $keep.Enabled) { $keep.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::O -and $anonOrg.Enabled) { $anonOrg.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::R -and $back.Enabled) { $back.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Control -and $_.KeyCode -eq [System.Windows.Forms.Keys]::Enter -and $approve.Enabled) { $approve.PerformClick(); $_.SuppressKeyPress = $true } })',
    '$skip.Visible = ($draft.ambiguities.Count -eq 0)',
    '$defer.Visible = [bool]$draft.allow_defer',
    '$redact.Visible = ($null -eq $draft.batch_review)',
    '$buttons.Controls.AddRange(@($approve, $redact, $skip, $cancel, $defer, $back, $keep, $anonOrg, $keepGroup, $redactGroup))',
    '$form.Controls.Add($split); $form.Controls.Add($ambiguityInfo); $form.Controls.Add($buttons); $form.Controls.Add($info)',
    'Show-Ambiguity; Update-Preview',
    '[void]$form.ShowDialog()',
    '[Console]::Out.Write(($script:answer | ConvertTo-Json -Compress))'
  ].join('; ');
}

const DARWIN_DIALOG_CONTRACTS = Object.freeze({
  decision: Object.freeze({
    defer: Object.freeze({ buttons: Object.freeze(['Später entscheiden', 'Anonymisieren', 'Beibehalten']), defaultButton: 'Beibehalten', cancelButton: 'Später entscheiden', cancelAction: 'deferred' }),
    cancel: Object.freeze({ buttons: Object.freeze(['Abbrechen', 'Anonymisieren', 'Beibehalten']), defaultButton: 'Beibehalten', cancelButton: 'Abbrechen', cancelAction: 'cancelled' })
  }),
  group: Object.freeze({
    defer: Object.freeze({ buttons: Object.freeze(['Später entscheiden', 'Nur diese Stelle', 'Gleiche Stellen']), defaultButton: 'Nur diese Stelle', cancelButton: 'Später entscheiden', cancelAction: 'deferred' }),
    cancel: Object.freeze({ buttons: Object.freeze(['Abbrechen', 'Nur diese Stelle', 'Gleiche Stellen']), defaultButton: 'Nur diese Stelle', cancelButton: 'Abbrechen', cancelAction: 'cancelled' })
  }),
  final: Object.freeze({
    defer: Object.freeze({ buttons: Object.freeze(['Später entscheiden', 'Zurück / ändern', 'Geprüft freigeben']), defaultButton: 'Geprüft freigeben', cancelButton: 'Später entscheiden', cancelAction: 'deferred' }),
    cancel: Object.freeze({ buttons: Object.freeze(['Abbrechen', 'Zurück / ändern', 'Geprüft freigeben']), defaultButton: 'Geprüft freigeben', cancelButton: 'Abbrechen', cancelAction: 'cancelled' })
  })
});

function darwinDialogContract(phase, allowDefer = false) {
  const contract = DARWIN_DIALOG_CONTRACTS[phase]?.[allowDefer ? 'defer' : 'cancel'];
  if (!contract || !contract.buttons.includes(contract.defaultButton) || !contract.buttons.includes(contract.cancelButton)) {
    throw new SafeError('Der lokale macOS-Dialogvertrag ist ungültig.');
  }
  return {
    buttons: [...contract.buttons],
    defaultButton: contract.defaultButton,
    cancelButton: contract.cancelButton,
    cancelAction: contract.cancelAction
  };
}

// The macOS reviewer deliberately receives the review draft over stdin as
// UTF-8. Passing text through an osascript argument would expose it in the
// process list; a temporary file would add an unnecessary raw-data lifecycle.
// One AppKit sheet presents every known typed ambiguity in one scrollable
// collection. It does not pretend to offer the Windows free-range editor.
function darwinReviewScript() {
  return [
    'ObjC.import("AppKit"); ObjC.import("Foundation");',
    'function run(argv) {',
    '  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;',
    '  var source = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));',
    '  var draft = JSON.parse(source);',
    '  var title = draft.batch_review ? "DataSecure – lokale Stapelprüfung" : "DataSecure – lokale Datenschutzprüfung";',
    '  var progress = draft.batch_review ? "Automatisch abgeschlossen: " + draft.batch_review.automatically_completed_count + ". Bereits lokal geprüft: " + draft.batch_review.previously_reviewed_count + ". Jetzt: " + draft.batch_review.review_finding_count + " Stellen in " + draft.batch_review.review_document_count + " Dateien." : "Prüfe die markierten Stellen.";',
    '  try {',
    '    if (!Array.isArray(draft.ambiguities)) throw new Error("invalid review");',
    `    if (draft.ambiguities.length > ${MAX_DARWIN_REVIEW_FINDINGS}) return JSON.stringify({ error_code: "LOCAL_REVIEW_TOO_LARGE" });`,
    '    var app = $.NSApplication.sharedApplication; app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);',
    '    var alert = $.NSAlert.alloc.init; alert.messageText = $(title); alert.informativeText = $(progress + "\\nAlle Entscheidungen bleiben lokal.");',
    '    alert.addButtonWithTitle($("Geprüft freigeben"));',
    '    if (draft.allow_defer) alert.addButtonWithTitle($("Später entscheiden"));',
    '    alert.addButtonWithTitle($("Abbrechen"));',
    '    function personGroupIds(item) { if ((item.type !== "person_prose_ambiguous" && item.type !== "person_residual_ambiguous") || !Array.isArray(draft.decision_groups)) return [item.ambiguity_id]; for (var groupIndex = 0; groupIndex < draft.decision_groups.length; groupIndex++) { var ids = draft.decision_groups[groupIndex].candidate_ids; if (Array.isArray(ids) && ids.length > 1 && ids.indexOf(item.ambiguity_id) >= 0) return ids.slice(); } return [item.ambiguity_id]; }',
    '    var rendered = {}; var reviewItems = []; draft.ambiguities.forEach(function(item) { if (rendered[item.ambiguity_id]) return; var ids = personGroupIds(item); ids.forEach(function(id) { rendered[id] = true; }); reviewItems.push({ item: item, ids: ids }); });',
    '    var width = 760; var rowHeight = 86; var contentHeight = Math.max(80, reviewItems.length * rowHeight);',
    '    var document = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, width, contentHeight));',
    '    var controls = [];',
    '    reviewItems.forEach(function(entry, index) {',
    '      var item = entry.item;',
    '      var value = draft.original_text.substring(item.original_start, item.original_end);',
    '      var before = draft.original_text.substring(Math.max(0, item.original_start - 80), item.original_start);',
    '      var after = draft.original_text.substring(item.original_end, Math.min(draft.original_text.length, item.original_end + 80));',
    '      var y = contentHeight - ((index + 1) * rowHeight) + 42;',
    '      var question = (item.type === "person_prose_ambiguous" || item.type === "person_residual_ambiguous") ? "Ist dies ein Personenname?" + (entry.ids.length > 1 ? " Die Entscheidung gilt für " + entry.ids.length + " gleichnamige Stellen." : "") : "Ist dies der Aussteller einer Zertifizierung?";',
    '      var label = $.NSTextField.wrappingLabelWithString($("Stelle " + (index + 1) + ": " + question + "\\n" + before + "[" + value + "]" + after));',
    '      label.frame = $.NSMakeRect(0, y, 550, 40); document.addSubview(label);',
    '      var choice = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(570, y + 4, 180, 32), false);',
    '      choice.addItemsWithTitles($(["Bitte entscheiden", "Beibehalten", "Anonymisieren"])); document.addSubview(choice);',
    '      controls.push({ ids: entry.ids, choice: choice });',
    '    });',
    '    if (draft.ambiguities.length === 0) { var empty = $.NSTextField.labelWithString($("Keine offene Zuordnung.")); empty.frame = $.NSMakeRect(0, 24, width, 32); document.addSubview(empty); }',
    '    var scroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(0, 0, width, Math.min(500, contentHeight))); scroll.hasVerticalScroller = true; scroll.documentView = document; alert.accessoryView = scroll;',
    '    app.activateIgnoringOtherApps(true); alert.window.makeKeyAndOrderFront(null); alert.window.displayIfNeeded();',
    '    var response = alert.runModal;',
    '    if (response !== $.NSAlertFirstButtonReturn) { if (draft.allow_defer && response === $.NSAlertSecondButtonReturn) return JSON.stringify({ action: "deferred" }); return JSON.stringify({ action: "cancelled" }); }',
    '    var decisions = []; for (var index = 0; index < controls.length; index++) { var selected = ObjC.unwrap(controls[index].choice.titleOfSelectedItem); if (selected !== "Beibehalten" && selected !== "Anonymisieren") return JSON.stringify({ action: draft.allow_defer ? "deferred" : "cancelled" }); var decision = selected === "Beibehalten" ? "keep" : "redact"; controls[index].ids.forEach(function(id) { decisions.push({ ambiguity_id: id, decision: decision }); }); }',
    '    return JSON.stringify({ action: "reviewed", redactions: [], decisions: decisions });',
    '  } catch (error) { return JSON.stringify({ error_code: "LOCAL_REVIEW_FAILED" }); }',
    '}'
  ].join('\n');
}

function linuxReviewContext(draft, item, index) {
  const before = draft.original_text.slice(Math.max(0, item.original_start - 300), item.original_start);
  const value = draft.original_text.slice(item.original_start, item.original_end);
  const after = draft.original_text.slice(item.original_end, Math.min(draft.original_text.length, item.original_end + 300));
  const personGroup = ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(item.type)
    ? groupForCandidate(draft, item.ambiguity_id) : null;
  return [
    `DataSecure – ${draft.batch_review ? 'lokale Stapelprüfung' : 'lokale Datenschutzprüfung'} (${index + 1} von ${draft.ambiguities.length})`,
    ...(draft.batch_review ? ['', batchReviewSummary(draft)] : []),
    '',
    'Die eckig markierte Stelle wird nur lokal angezeigt.',
    ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(item.type) ? 'Ist dies ein Personenname?' : 'Ist dies der Aussteller einer Zertifizierung?',
    ...(personGroup
      ? [`Die Entscheidung gilt automatisch für ${personGroup.candidate_ids.length} gleichnamige Stellen.`] : []),
    '',
    `${before}[${value}]${after}`
  ].join('\n');
}

function linuxViewerCommands(batchReview = false) {
  const title = batchReview ? 'DataSecure – lokale Stapelprüfung' : 'DataSecure – lokale Datenschutzprüfung';
  return [
    { id: 'zenity', command: 'zenity', args: ['--text-info', `--title=${title}`, '--width=900', '--height=620'] },
    // KDialog accepts a local file name for its text box. `/dev/stdin` binds
    // it to the inherited anonymous input pipe without creating a raw-text
    // temporary file or placing the text in an argument.
    { id: 'kdialog', command: 'kdialog', args: ['--textbox', '/dev/stdin', '900', '620', '--title', title] }
  ];
}

function linuxChoiceCommand(id, index, total, allowDefer = false, batchReview = false, sameContextGroup = false,
  mandatoryPersonGroupCount = 0) {
  const prompt = `Fundstelle ${index + 1} von ${total}: Entscheidung lokal treffen.` +
    `${mandatoryPersonGroupCount > 1 ? ` Diese Entscheidung gilt automatisch für ${mandatoryPersonGroupCount} gleichnamige Stellen.` : ''}` +
    `${sameContextGroup ? ' Bewusste Gruppenaktion nur für nachweislich gleiche lokale Stellen verfügbar.' : ''}`;
  const title = batchReview ? 'DataSecure – Stapelentscheidung' : 'DataSecure – Datenschutzentscheidung';
  if (id === 'zenity') {
    return {
      command: 'zenity',
      args: [
        '--list', '--radiolist', `--title=${title}`, `--text=${prompt}`,
        '--column=Schlüssel', '--column=Entscheidung',
        'keep', 'Beibehalten', 'FALSE',
        'redact', 'Anonymisieren', 'FALSE',
        ...(sameContextGroup ? ['keep_group', 'Für gleiche Stellen beibehalten', 'FALSE', 'redact_group', 'Für gleiche Stellen anonymisieren', 'FALSE'] : []),
        ...(allowDefer ? ['defer', 'Später entscheiden', 'FALSE'] : []),
        'cancel', 'Abbrechen', 'TRUE',
        '--hide-header', '--ok-label=Weiter', '--cancel-label=Abbrechen'
      ]
    };
  }
  return {
    command: 'kdialog',
    args: [
      '--radiolist', prompt,
      'keep', 'Beibehalten', 'off',
      'redact', 'Anonymisieren', 'off',
      ...(sameContextGroup ? ['keep_group', 'Für gleiche Stellen beibehalten', 'off', 'redact_group', 'Für gleiche Stellen anonymisieren', 'off'] : []),
      ...(allowDefer ? ['defer', 'Später entscheiden', 'off'] : []),
      'cancel', 'Abbrechen', 'on',
      '--title', title
    ]
  };
}

function linuxFinalChoiceCommand(id, allowDefer = false, batchReview = false) {
  const prompt = 'Alle Fundstellen sind entschieden. Freigeben oder Entscheidungen vollständig neu treffen?';
  const title = batchReview ? 'DataSecure – Stapelentscheidung' : 'DataSecure – Datenschutzentscheidung';
  if (id === 'zenity') {
    return {
      command: 'zenity',
      args: [
        '--list', '--radiolist', `--title=${title}`, `--text=${prompt}`,
        '--column=Schlüssel', '--column=Entscheidung',
        'release', 'Geprüft freigeben', 'TRUE',
        'change', 'Zurück / ändern', 'FALSE',
        ...(allowDefer ? ['defer', 'Später entscheiden', 'FALSE'] : []),
        'cancel', 'Abbrechen', 'FALSE',
        '--hide-header', '--ok-label=Weiter', '--cancel-label=Abbrechen'
      ]
    };
  }
  return {
    command: 'kdialog',
    args: [
      '--radiolist', prompt,
      'release', 'Geprüft freigeben', 'on',
      'change', 'Zurück / ändern', 'off',
      ...(allowDefer ? ['defer', 'Später entscheiden', 'off'] : []),
      'cancel', 'Abbrechen', 'off',
      '--title', title
    ]
  };
}

function runLinuxReviewDialog(candidates, input, runner, env) {
  for (const candidate of candidates) {
    const result = runner(candidate.command, candidate.args, input, env);
    if (result?.error?.code === 'ENOENT') continue;
    return { id: candidate.id, result };
  }
  throw new SafeError('Auf diesem Gerät ist keine lokale Datenschutzprüfung verfügbar.');
}

function linuxReviewTextLocally(draft, options) {
  const runner = options.runner || defaultRunner;
  const env = options.env || process.env;
  while (true) {
    const decisions = [];
    let reviewerId;
    for (let index = 0; index < draft.ambiguities.length; index++) {
      const item = draft.ambiguities[index];
      if (decisions.some((entry) => entry.ambiguity_id === item.ambiguity_id)) continue;
      const group = groupForCandidate(draft, item.ambiguity_id);
      const displayed = runLinuxReviewDialog(linuxViewerCommands(draft.batch_review !== undefined), linuxReviewContext(draft, draft.ambiguities[index], index), runner, env);
      if (displayed.result?.error || displayed.result?.status !== 0) return { action: 'cancelled' };
      reviewerId = displayed.id;
      const mandatoryPersonGroup = ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(item.type) && !!group;
      const choice = linuxChoiceCommand(displayed.id, index, draft.ambiguities.length, draft.allow_defer === true,
        draft.batch_review !== undefined, !!group && !mandatoryPersonGroup,
        mandatoryPersonGroup ? group.candidate_ids.length : 0);
      const selected = runner(choice.command, choice.args, undefined, env);
      if (selected?.error || selected?.status !== 0) return { action: 'cancelled' };
      const answer = String(selected.stdout || '').trim().toLocaleLowerCase('de-DE');
      let decision;
      if (answer === 'keep' || answer === 'beibehalten') decision = 'keep';
      if (answer === 'redact' || answer === 'anonymisieren') decision = 'redact';
      if (answer === 'defer' || answer === 'später entscheiden') return { action: 'deferred' };
      if (!decision && answer === 'keep_group') decision = 'keep';
      if (!decision && answer === 'redact_group') decision = 'redact';
      if (!decision) return { action: 'cancelled' };
      const targets = mandatoryPersonGroup || (/_group$/u.test(answer) && group)
        ? group.candidate_ids : [item.ambiguity_id];
      for (const ambiguityId of targets) {
        if (!decisions.some((entry) => entry.ambiguity_id === ambiguityId)) decisions.push({ ambiguity_id: ambiguityId, decision });
      }
    }
    const finish = linuxFinalChoiceCommand(reviewerId, draft.allow_defer === true, draft.batch_review !== undefined);
    const finalResult = runner(finish.command, finish.args, undefined, env);
    if (finalResult?.error || finalResult?.status !== 0) return { action: 'cancelled' };
    const finalAnswer = String(finalResult.stdout || '').trim().toLocaleLowerCase('de-DE');
    if (finalAnswer === 'release' || finalAnswer === 'geprüft freigeben') return { action: 'reviewed', redactions: [], decisions };
    if (finalAnswer === 'change' || finalAnswer === 'zurück / ändern') continue;
    if (finalAnswer === 'defer' || finalAnswer === 'später entscheiden') return { action: 'deferred' };
    return { action: 'cancelled' };
  }
}

// Direct internal callers use the bounded default. Normal and support MCP
// routes delegate reconstruction/UI to gateway/review-worker.js instead; that
// worker explicitly passes null so human decisions have no process timeout.
function defaultRunner(command, args, input, env = process.env, timeoutMs = DEFAULT_REVIEW_TIMEOUT_MS) {
  const options = {
    input,
    encoding: 'utf8',
    // This subprocess owns the interactive WinForms review. STARTF_USESHOWWINDOW
    // with SW_HIDE can hide its first top-level window while ShowDialog still
    // blocks the batch indefinitely. Background workers remain hidden; the
    // review process must be allowed to show its own window.
    windowsHide: false,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    env: uiProcessEnvironment(env)
  };
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) options.timeout = timeoutMs;
  return childProcess.spawnSync(command, args, options);
}

function reviewTextLocally(draft, options = {}) {
  const platform = options.platform || process.platform;
  if (!draft || draft.schema !== REVIEW_SCHEMA) throw new SafeError('Ungültiger lokaler Review-Entwurf.');
  if (platform === 'darwin' && Array.isArray(draft.ambiguities) &&
      draft.ambiguities.length > MAX_DARWIN_REVIEW_FINDINGS) throw reviewSizeError();
  const env = options.env || process.env;
  // Sanitize before invoking the supplied runner as well. This keeps test,
  // integration and production runners on the same no-proxy/no-cloud-secret
  // boundary instead of relying on the default runner alone.
  const reviewEnv = uiProcessEnvironment(env);
  const timeoutMs = options.timeoutMs === null
    ? null
    : (Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs : DEFAULT_REVIEW_TIMEOUT_MS);
  const runner = options.runner || ((cmd, cmdArgs, cmdInput, cmdEnv) => defaultRunner(cmd, cmdArgs, cmdInput, cmdEnv, timeoutMs));
  let command;
  let args;
  if (platform === 'win32') {
    command = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    args = ['-NoProfile', '-NonInteractive', '-Sta', '-Command', powershellReviewScript()];
  } else if (platform === 'darwin') {
    command = '/usr/bin/osascript';
    args = ['-l', 'JavaScript', '-e', darwinReviewScript()];
  } else if (platform === 'linux') {
    return validateReviewResult(linuxReviewTextLocally(draft, { runner, env: reviewEnv }), draft);
  } else {
    throw new SafeError('Die bearbeitbare lokale Textprüfung ist auf diesem Gerät noch nicht verfügbar; es wurde nichts freigegeben.');
  }
  const result = runner(command, args, JSON.stringify(draft), reviewEnv);
  if (result?.error?.code === 'ETIMEDOUT') {
    const error = new SafeError('Die lokale Textprüfung wurde wegen Zeitüberschreitung beendet.');
    error.code = 'LOCAL_REVIEW_TIMEOUT';
    throw error;
  }
  if (result?.error || result?.status !== 0) {
    const error = new SafeError('Die lokale Textprüfung konnte nicht sicher abgeschlossen werden.');
    error.code = 'LOCAL_REVIEW_FAILED';
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(String(result.stdout || '')); } catch { throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.'); }
  if (platform === 'darwin' && parsed && Object.keys(parsed).join(',') === 'error_code') {
    if (parsed.error_code === 'LOCAL_REVIEW_TOO_LARGE') throw reviewSizeError();
    if (parsed.error_code === 'LOCAL_REVIEW_FAILED') {
      const error = new SafeError('Die lokale Textprüfung konnte nicht sicher abgeschlossen werden.');
      error.code = 'LOCAL_REVIEW_FAILED';
      throw error;
    }
  }
  return validateReviewResult(parsed, draft);
}

module.exports = {
  REVIEW_SCHEMA,
  BATCH_REVIEW_SCHEMA,
  MAX_REVIEW_CHARS,
  MAX_DARWIN_REVIEW_FINDINGS,
  reviewSizeError,
  buildReviewDraft,
  buildBatchReviewDraft,
  batchReviewProgress,
  batchReviewSummary,
  groupForCandidate,
  resolveBatchReviewResult,
  reviewBatchTextLocally,
  powershellUtf8Preamble,
  powershellReviewScript,
  darwinDialogContract,
  darwinReviewScript,
  linuxReviewContext,
  linuxViewerCommands,
  linuxChoiceCommand,
  linuxFinalChoiceCommand,
  linuxReviewTextLocally,
  validateReviewResult,
  applyManualRedactions,
  reviewTextLocally
};
