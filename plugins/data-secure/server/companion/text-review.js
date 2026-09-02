'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { LIMITS } = require('../gateway/common');
const { normalizeText } = require('../privacy/base');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { DEFAULT_REVIEW_TIMEOUT_MS } = require('./review-timeouts');

const REVIEW_SCHEMA = 'data-secure-text-review/2';
const BATCH_REVIEW_SCHEMA = 'data-secure-batch-review/2';
const MAX_REVIEW_CHARS = LIMITS.MAX_TEXT_CHARS;
const MAX_MANUAL_REDACTIONS = 10_000;

function reviewSizeError() {
  const error = new SafeError('Die lokale Prüfgruppe ist zu groß. Kleinere Gruppen sind erforderlich; bereits geprüfte Ergebnisse bleiben erhalten.');
  error.code = 'LOCAL_REVIEW_TOO_LARGE';
  return error;
}

function reviewDocumentLabel(index, count) {
  return count === 1 ? '' : `\n\n===== Dokument ${index + 1} von ${count} =====\n\n`;
}

function batchReviewProgress(documentCount, findingCount, progress = {}) {
  const integers = {
    batch_total: progress.batchTotal ?? documentCount,
    automatically_completed_count: progress.automaticallyCompleted ?? 0,
    safely_stopped_count: progress.safelyStopped ?? 0,
    other_pending_count: progress.otherPending ?? 0,
    previously_reviewed_count: progress.previouslyReviewed ?? 0,
    review_pending_count: progress.reviewPendingTotal ?? documentCount
  };
  if (!Number.isSafeInteger(documentCount) || documentCount < 1 ||
      !Number.isSafeInteger(findingCount) || findingCount < 1 ||
      Object.values(integers).some((value) => !Number.isSafeInteger(value) || value < 0) ||
      integers.batch_total < 1 || integers.batch_total > LIMITS.MAX_BATCH_FILES ||
      integers.review_pending_count < documentCount ||
      integers.automatically_completed_count + integers.safely_stopped_count + integers.other_pending_count +
        integers.previously_reviewed_count + integers.review_pending_count !== integers.batch_total) {
    throw new SafeError('Der lokale Stapelreview-Fortschritt ist ungültig.');
  }
  return {
    ...integers,
    review_document_count: documentCount,
    review_finding_count: findingCount
  };
}

function batchReviewSummary(draft) {
  const review = draft?.batch_review;
  if (!review) return '';
  const parts = [
    `Automatisch abgeschlossen: ${review.automatically_completed_count}.`,
    `Bereits lokal geprüft: ${review.previously_reviewed_count}.`,
    `Jetzt zu prüfen: ${review.review_finding_count} Stellen in ${review.review_document_count} Dateien.`,
    `Danach noch offen: ${Math.max(0, review.review_pending_count - review.review_document_count)} Dateien.`
  ];
  if (review.safely_stopped_count > 0) parts.push(`Sicher gestoppt: ${review.safely_stopped_count}.`);
  if (review.other_pending_count > 0) parts.push(`Weitere lokale Schritte offen: ${review.other_pending_count}.`);
  return parts.join(' ');
}

function exactContextLine(text, start, end) {
  const source = String(text || '');
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndAt = source.indexOf('\n', end);
  const lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
  // This is a deliberately narrow equivalence proof: grouping is permitted
  // only when the complete local source line is identical after the same
  // Unicode/whitespace normalization. It is never a fuzzy issuer match.
  return normalizeText(source.slice(lineStart, lineEnd)).replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
}

function decisionGroups(ambiguities, originalText) {
  const candidatesByContext = new Map();
  for (const candidate of ambiguities) {
    const context = exactContextLine(originalText, candidate.original_start, candidate.original_end);
    if (!context) continue;
    const key = `${candidate.type}\u0000${context}`;
    const ids = candidatesByContext.get(key) || [];
    ids.push(candidate.ambiguity_id);
    candidatesByContext.set(key, ids);
  }
  let group = 0;
  return [...candidatesByContext.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({
      group_id: `same_context:v1:${String(++group).padStart(6, '0')}`,
      candidate_ids: ids
    }));
}

function groupForCandidate(draft, ambiguityId) {
  const groups = draft?.batch_review?.decision_groups;
  if (!Array.isArray(groups)) return null;
  const matches = groups.filter((group) => group && Array.isArray(group.candidate_ids) && group.candidate_ids.includes(ambiguityId));
  if (matches.length !== 1) return null;
  const group = matches[0];
  if (!/^same_context:v1:[0-9]{6}$/u.test(String(group.group_id || '')) ||
    group.candidate_ids.length < 2 || new Set(group.candidate_ids).size !== group.candidate_ids.length) return null;
  return group;
}

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
  const allowDefer = progress.allowDefer === true;
  if (!Number.isSafeInteger(batchIndex) || !Number.isSafeInteger(batchTotal) ||
    batchIndex < 1 || batchTotal < 1 || batchTotal > LIMITS.MAX_BATCH_FILES || batchIndex > batchTotal) {
    throw new SafeError('Der lokale Dateifortschritt ist ungültig.');
  }
  return {
    schema: REVIEW_SCHEMA,
    original_text: original,
    anonymized_text: anonymized,
    locators,
    ambiguities: safeAmbiguities,
    batch_index: batchIndex,
    batch_total: batchTotal,
    allow_defer: allowDefer
  };
}

// A batch review is intentionally an in-memory adapter around the established
// single-text review schema. The journal stores neither this draft nor its
// `entries` map: callers recreate it from sealed source copies for the one
// local UI process. Anonymous "Dokument N" separators keep local file names
// out of the UI payload as well as out of any eventual MCP response.
function buildBatchReviewDraft(documents, progress = {}) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > LIMITS.MAX_BATCH_FILES) {
    throw new SafeError('Der lokale Stapelreview enthält keine zulässige Anzahl von Dokumenten.');
  }
  // Bound before normalization, span detection and joined copies are allocated.
  for (const field of ['original_text', 'anonymized_text']) {
    let length = 0;
    for (let index = 0; index < documents.length; index++) {
      length += String(documents[index]?.[field] || '').length + reviewDocumentLabel(index, documents.length).length;
      if (length > MAX_REVIEW_CHARS) throw reviewSizeError();
    }
  }
  const originals = [];
  const anonymized = [];
  const ambiguities = [];
  const entries = [];
  let originalOffset = 0;
  let anonymizedOffset = 0;
  let globalCandidate = 0;

  for (let index = 0; index < documents.length; index++) {
    const document = documents[index];
    if (!document || typeof document !== 'object') {
      throw new SafeError('Ein lokaler Stapelreview enthält einen ungültigen Dokumententwurf.');
    }
    const individual = buildReviewDraft(
      document.original_text,
      document.anonymized_text,
      document.profile || 'general',
      document.ambiguities || [],
      { batchIndex: index + 1, batchTotal: documents.length }
    );
    const label = reviewDocumentLabel(index, documents.length);
    originals.push(label, individual.original_text);
    anonymized.push(label, individual.anonymized_text);
    originalOffset += label.length;
    anonymizedOffset += label.length;
    const candidateIds = new Map();
    for (const candidate of individual.ambiguities) {
      const globalId = `credential:v2:${String(++globalCandidate).padStart(6, '0')}`;
      candidateIds.set(globalId, candidate.ambiguity_id);
      ambiguities.push({
        ambiguity_id: globalId,
        type: candidate.type,
        original_start: originalOffset + candidate.original_start,
        original_end: originalOffset + candidate.original_end,
        anonymized_start: anonymizedOffset + candidate.anonymized_start,
        anonymized_end: anonymizedOffset + candidate.anonymized_end
      });
    }
    entries.push({ document_index: index + 1, candidate_ids: candidateIds });
    originalOffset += individual.original_text.length;
    anonymizedOffset += individual.anonymized_text.length;
  }
  if (ambiguities.length === 0) {
    throw new SafeError('Der lokale Stapelreview enthält keine offenen Zuordnungen.');
  }
  const originalText = originals.join('');
  const anonymizedText = anonymized.join('');
  if (originalText.length > MAX_REVIEW_CHARS || anonymizedText.length > MAX_REVIEW_CHARS) {
    throw reviewSizeError();
  }
  const draft = buildReviewDraft(originalText, anonymizedText, 'general', ambiguities, {
    batchIndex: 1,
    batchTotal: 1,
    allowDefer: progress.allowDefer === true
  });
  draft.batch_review = {
    schema: BATCH_REVIEW_SCHEMA,
    document_count: documents.length,
    display: 'anonymous_document_sequence',
    ...batchReviewProgress(documents.length, draft.ambiguities.length, progress),
    // Candidate IDs are opaque local handles. The raw context used to prove
    // equality remains only in the already displayed local draft and is never
    // copied into this metadata, a journal, MCP response or diagnostic.
    decision_groups: decisionGroups(draft.ambiguities, draft.original_text)
  };
  return { draft, entries };
}

// Convert a validated aggregate answer back to per-document decisions without
// carrying raw text, locators or document names beyond this call boundary.
// Range redactions deliberately remain unavailable in the first batch UI:
// ranges crossing a synthetic document separator could otherwise be mapped to
// the wrong output. Credential decisions remain fully actionable.
function resolveBatchReviewResult(bundle, value) {
  if (!bundle || !bundle.draft || !Array.isArray(bundle.entries)) {
    throw new SafeError('Der lokale Stapelreview-Zustand ist ungültig.');
  }
  const decision = validateReviewResult(value, bundle.draft);
  if (decision.action !== 'reviewed') return { action: decision.action, documents: [] };
  if (decision.redactions.length !== 0) {
    throw new SafeError('Freie Bereichsanonymisierungen sind im gemeinsamen Stapelreview noch nicht verfügbar.');
  }
  const byGlobalId = new Map();
  for (const entry of bundle.entries) {
    if (!entry || !Number.isSafeInteger(entry.document_index) || !(entry.candidate_ids instanceof Map)) {
      throw new SafeError('Der lokale Stapelreview-Zustand ist ungültig.');
    }
    for (const [globalId, localId] of entry.candidate_ids) {
      if (byGlobalId.has(globalId)) throw new SafeError('Der lokale Stapelreview enthält doppelte Fundstellen.');
      byGlobalId.set(globalId, { document_index: entry.document_index, ambiguity_id: localId });
    }
  }
  const grouped = new Map(bundle.entries.map((entry) => [entry.document_index, []]));
  for (const item of decision.decisions) {
    const target = byGlobalId.get(item.ambiguity_id);
    if (!target) throw new SafeError('Die lokale Stapelentscheidung enthält eine unbekannte Fundstelle.');
    grouped.get(target.document_index).push({ ambiguity_id: target.ambiguity_id, decision: item.decision });
  }
  return {
    action: 'reviewed',
    documents: [...grouped.entries()].map(([document_index, decisions]) => ({ document_index, decisions }))
  };
}

// The caller owns the lifetime of this promise. In particular it must not put
// `bundle`, `draft` or this result into a journal: all three are local review
// material. Keeping the coordinator here makes the one-UI-call invariant easy
// to test independently from later batch publication mechanics.
async function reviewBatchTextLocally(documents, options = {}) {
  const bundle = buildBatchReviewDraft(documents, {
    allowDefer: options.allowDefer === true,
    ...(options.batchSummary || {})
  });
  const reviewer = options.reviewTextLocally || reviewTextLocally;
  const answer = await reviewer(bundle.draft, options);
  return resolveBatchReviewResult(bundle, answer);
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
    '$keep = New-Object System.Windows.Forms.Button; $keep.Text = "&Zertifikatsanbieter behalten"; $keep.Width = 205',
    '$anonOrg = New-Object System.Windows.Forms.Button; $anonOrg.Text = "&Organisation anonymisieren"; $anonOrg.Width = 205',
    '$keepGroup = New-Object System.Windows.Forms.Button; $keepGroup.Text = "Gleiche behalten"; $keepGroup.Width = 155',
    '$redactGroup = New-Object System.Windows.Forms.Button; $redactGroup.Text = "Gleiche anonymisieren"; $redactGroup.Width = 175',
    '$back = New-Object System.Windows.Forms.Button; $back.Text = "&Rückgängig / ändern"; $back.Width = 155',
    '$ambiguityInfo = New-Object System.Windows.Forms.Label; $ambiguityInfo.Width = 330; $ambiguityInfo.Height = 38',
    '$script:answer = $null; $script:redactions = New-Object System.Collections.ArrayList; $script:decisions = @{}; $script:current = 0',
    'function Ambiguity-Redactions { $items = New-Object System.Collections.ArrayList; foreach ($candidate in $draft.ambiguities) { if ($script:decisions[[string]$candidate.ambiguity_id] -eq "redact") { [void]$items.Add(@{ start = [int]$candidate.anonymized_start; end = [int]$candidate.anonymized_end }) } }; return $items }',
    'function Update-Preview { $value = [string]$draft.anonymized_text; $all = @($script:redactions) + @(Ambiguity-Redactions); foreach ($item in @($all | Sort-Object start -Descending)) { $value = $value.Substring(0, [int]$item.start) + "[MANUAL_REDACTION]" + $value.Substring([int]$item.end) }; $preview.Text = $value }',
    'function Group-Candidates($candidate) { if ($null -eq $draft.batch_review -or $null -eq $draft.batch_review.decision_groups) { return @() }; foreach ($group in $draft.batch_review.decision_groups) { if ($null -ne $group.candidate_ids -and @($group.candidate_ids).Count -gt 1 -and @($group.candidate_ids) -contains [string]$candidate.ambiguity_id) { return @($group.candidate_ids) } }; return @() }',
    'function Advance-ToOpen { while ($script:current -lt $draft.ambiguities.Count -and $null -ne $script:decisions[[string]$draft.ambiguities[$script:current].ambiguity_id]) { $script:current++ } }',
    'function Show-Ambiguity { Advance-ToOpen; if ($draft.ambiguities.Count -eq 0) { $ambiguityInfo.Text = "Keine offene Zuordnung"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $keepGroup.Visible = $false; $redactGroup.Visible = $false; $back.Enabled = $false; $approve.Enabled = $true; return }; if ($script:current -ge $draft.ambiguities.Count) { $ambiguityInfo.Text = "Alle " + $draft.ambiguities.Count + " Stellen entschieden"; $keep.Enabled = $false; $anonOrg.Enabled = $false; $keepGroup.Visible = $false; $redactGroup.Visible = $false; $back.Enabled = $true; $approve.Enabled = $true; return }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; $groupAvailable = @($group).Count -gt 1; $ambiguityInfo.Text = "Stelle " + ($script:current + 1) + " von " + $draft.ambiguities.Count + ": Gehört dieser Name zu einer Zertifizierung?"; if ($groupAvailable) { $ambiguityInfo.Text += " Für " + @($group).Count + " nachweislich gleiche lokale Stellen kannst du bewusst dieselbe Entscheidung übernehmen." }; $keep.Enabled = $true; $anonOrg.Enabled = $true; $keepGroup.Visible = $groupAvailable; $redactGroup.Visible = $groupAvailable; $back.Enabled = ($script:current -gt 0); $approve.Enabled = $false; $right.Select([int]$candidate.anonymized_start, [int]$candidate.anonymized_end - [int]$candidate.anonymized_start); $right.ScrollToCaret() }',
    'function Decide-Ambiguity([string]$decision) { if ($script:current -ge $draft.ambiguities.Count) { return }; $candidate = $draft.ambiguities[$script:current]; $script:decisions[[string]$candidate.ambiguity_id] = $decision; $script:current++; Update-Preview; Show-Ambiguity }',
    'function Decide-Group([string]$decision) { if ($script:current -ge $draft.ambiguities.Count) { return }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; if (@($group).Count -lt 2) { return }; foreach ($id in @($group)) { $script:decisions[[string]$id] = $decision }; $script:current++; Update-Preview; Show-Ambiguity }',
    '$redact.Add_Click({ $start = $right.SelectionStart; $length = $right.SelectionLength; if ($length -le 0) { [void][System.Windows.Forms.MessageBox]::Show("Bitte zuerst rechts eine sensible Stelle auswählen.", "DataSecure", "OK", "Information"); return }; $end = $start + $length; foreach ($candidate in $draft.ambiguities) { if ($start -lt [int]$candidate.anonymized_end -and [int]$candidate.anonymized_start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Für gelb markierte Organisationen bitte die Schaltflächen Erhalten oder Anonymisieren verwenden.", "DataSecure", "OK", "Warning"); return } }; foreach ($item in $script:redactions) { if ($start -lt [int]$item.end -and [int]$item.start -lt $end) { [void][System.Windows.Forms.MessageBox]::Show("Diese Auswahl überschneidet sich mit einer bestehenden manuellen Anonymisierung.", "DataSecure", "OK", "Warning"); return } }; [void]$script:redactions.Add(@{ start = $start; end = $end }); $right.SelectionBackColor = [System.Drawing.Color]::LightSalmon; $right.Select(0, 0); Update-Preview })',
    '$keep.Add_Click({ Decide-Ambiguity "keep" })',
    '$anonOrg.Add_Click({ Decide-Ambiguity "redact" })',
    '$keepGroup.Add_Click({ Decide-Group "keep" })',
    '$redactGroup.Add_Click({ Decide-Group "redact" })',
    '$back.Add_Click({ if ($draft.ambiguities.Count -eq 0) { return }; if ($script:current -ge $draft.ambiguities.Count) { $script:current = $draft.ambiguities.Count - 1 } elseif ($script:current -gt 0) { $script:current-- }; $candidate = $draft.ambiguities[$script:current]; $group = Group-Candidates $candidate; if (@($group).Count -gt 1) { foreach ($id in @($group)) { [void]$script:decisions.Remove([string]$id) } } else { [void]$script:decisions.Remove([string]$candidate.ambiguity_id) }; Update-Preview; Show-Ambiguity })',
    '$approve.Add_Click({ if ($script:decisions.Count -ne $draft.ambiguities.Count) { [void][System.Windows.Forms.MessageBox]::Show("Bitte jede gelb markierte Organisation als Zertifizierung erhalten oder anonymisieren.", "DataSecure", "OK", "Warning"); return }; $decisionList = @(); foreach ($candidate in $draft.ambiguities) { $decisionList += @{ ambiguity_id = [string]$candidate.ambiguity_id; decision = [string]$script:decisions[[string]$candidate.ambiguity_id] } }; $script:answer = @{ action = "reviewed"; redactions = @($script:redactions); decisions = $decisionList }; $form.Close() })',
    '$skip.Add_Click({ if ($draft.ambiguities.Count -gt 0) { [void][System.Windows.Forms.MessageBox]::Show("Bei gelb markierten Organisationen darf die Prüfung nicht übersprungen werden.", "DataSecure", "OK", "Warning"); return }; $script:answer = @{ action = "skipped" }; $form.Close() })',
    '$cancel.Add_Click({ $script:answer = @{ action = "cancelled" }; $form.Close() })',
    '$defer.Add_Click({ $script:answer = @{ action = "deferred" }; $form.Close() })',
    '$form.Add_FormClosing({ if ($null -eq $script:answer) { $script:answer = @{ action = "cancelled" } } })',
    '$form.AcceptButton = $approve',
    'if ([bool]$draft.allow_defer) { $form.CancelButton = $defer } else { $form.CancelButton = $cancel }',
    '$form.Add_KeyDown({ if ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::Z -and $keep.Enabled) { $keep.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::O -and $anonOrg.Enabled) { $anonOrg.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Alt -and $_.KeyCode -eq [System.Windows.Forms.Keys]::R -and $back.Enabled) { $back.PerformClick(); $_.SuppressKeyPress = $true } elseif ($_.Control -and $_.KeyCode -eq [System.Windows.Forms.Keys]::Enter -and $approve.Enabled) { $approve.PerformClick(); $_.SuppressKeyPress = $true } })',
    '$skip.Visible = ($draft.ambiguities.Count -eq 0)',
    '$defer.Visible = [bool]$draft.allow_defer',
    '$redact.Visible = ($null -eq $draft.batch_review)',
    '$buttons.Controls.AddRange(@($approve, $redact, $skip, $cancel, $defer, $back, $keep, $anonOrg, $keepGroup, $redactGroup, $ambiguityInfo))',
    '$form.Controls.Add($split); $form.Controls.Add($buttons); $form.Controls.Add($info)',
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
// UTF-8.  Passing text through an osascript argument would expose it in the
// process list; a temporary file would add an unnecessary raw-data lifecycle.
// This focused UI decides only the known credential-issuer ambiguities.  It
// does not pretend to offer the Windows free-range redaction editor.
function darwinReviewScript() {
  const contracts = JSON.stringify(DARWIN_DIALOG_CONTRACTS);
  return [
    'ObjC.import("Foundation");',
    'function run(argv) {',
    '  var app = Application.currentApplication(); app.includeStandardAdditions = true;',
    '  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;',
    '  var source = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));',
    '  var draft = JSON.parse(source);',
    `  var contracts = ${contracts};`,
    '  var title = draft.batch_review ? "DataSecure – lokale Stapelprüfung" : "DataSecure – lokale Zertifikatsprüfung";',
    '  var progress = draft.batch_review ? "Automatisch abgeschlossen: " + draft.batch_review.automatically_completed_count + ". Bereits lokal geprüft: " + draft.batch_review.previously_reviewed_count + ". Jetzt zu prüfen: " + draft.batch_review.review_finding_count + " Stellen in " + draft.batch_review.review_document_count + " Dateien.\\n\\n" : "";',
    '  if (draft.batch_review && draft.batch_review.safely_stopped_count > 0) progress += "Sicher gestoppt: " + draft.batch_review.safely_stopped_count + ".\\n\\n";',
    '  try {',
    '    function dialogContract(phase) { var contract = contracts[phase][draft.allow_defer ? "defer" : "cancel"]; if (contract.buttons.indexOf(contract.defaultButton) < 0 || contract.buttons.indexOf(contract.cancelButton) < 0) throw new Error("invalid dialog contract"); return contract; }',
    '    function showDialog(message, phase) { var contract = dialogContract(phase); var answer = app.displayDialog(message, { withTitle: title, buttons: contract.buttons, defaultButton: contract.defaultButton, cancelButton: contract.cancelButton }); return { button: answer.buttonReturned, cancelAction: contract.cancelAction }; }',
    '    function groupFor(item) { var groups = draft.batch_review && draft.batch_review.decision_groups; if (!Array.isArray(groups)) return null; var matches = groups.filter(function(group) { return group && Array.isArray(group.candidate_ids) && group.candidate_ids.length > 1 && group.candidate_ids.indexOf(item.ambiguity_id) >= 0; }); return matches.length === 1 ? matches[0] : null; }',
    '    function decided(decisions, id) { return decisions.some(function(entry) { return entry.ambiguity_id === id; }); }',
    '    function decideGroup(decisions, group, decision) { group.candidate_ids.forEach(function(id) { if (!decided(decisions, id)) decisions.push({ ambiguity_id: id, decision: decision }); }); }',
    '    while (true) {',
    '      var decisions = [];',
    '      for (var index = 0; index < draft.ambiguities.length; index++) {',
    '      var item = draft.ambiguities[index];',
    '      if (decided(decisions, item.ambiguity_id)) continue;',
    '      var group = groupFor(item);',
    '      var value = draft.original_text.substring(item.original_start, item.original_end);',
    '      var before = draft.original_text.substring(Math.max(0, item.original_start - 100), item.original_start);',
    '      var after = draft.original_text.substring(item.original_end, Math.min(draft.original_text.length, item.original_end + 100));',
    '      var message = progress + "Stelle " + (index + 1) + " von " + draft.ambiguities.length + ":\\n\\n" + before + "[" + value + "]" + after + "\\n\\nIst die markierte Organisation der Aussteller einer Zertifizierung?";',
    // Standard Additions maps to NSAlert and supports at most three buttons.
    // Defer/cancel is therefore the first real button and also the Esc action.
    '      var answer = showDialog(message, "decision");',
    '      if (answer.button === "Später entscheiden") return JSON.stringify({ action: "deferred" });',
    '      if (answer.button === "Abbrechen") return JSON.stringify({ action: "cancelled" });',
    '      var choice = answer.button === "Beibehalten" ? "keep" : "redact";',
    '      if (group) { var groupAnswer = showDialog("Die markierte Stelle gehört zu mehreren nachweislich gleichen lokalen Kontextzeilen. Soll die Entscheidung nur für diese Stelle oder für alle gleichen Stellen gelten?", "group"); if (groupAnswer.button === "Später entscheiden") return JSON.stringify({ action: "deferred" }); if (groupAnswer.button === "Abbrechen") return JSON.stringify({ action: "cancelled" }); if (groupAnswer.button === "Gleiche Stellen") { decideGroup(decisions, group, choice); continue; } }',
    '      decisions.push({ ambiguity_id: item.ambiguity_id, decision: choice });',
    '      }',
    '      var finalAnswer = showDialog("Alle Fundstellen sind entschieden. Du kannst die Entscheidungen jetzt freigeben oder vollständig neu treffen.", "final");',
    '      if (finalAnswer.button === "Später entscheiden") return JSON.stringify({ action: "deferred" });',
    '      if (finalAnswer.button === "Abbrechen") return JSON.stringify({ action: "cancelled" });',
    '      if (finalAnswer.button === "Zurück / ändern") continue;',
    '      return JSON.stringify({ action: "reviewed", redactions: [], decisions: decisions });',
    '    }',
    '  } catch (error) { var number = Number(error && (error.errorNumber !== undefined ? error.errorNumber : error.number)); if (number === -128 && draft.allow_defer) return JSON.stringify({ action: "deferred" }); return JSON.stringify({ action: "cancelled" }); }',
    '}'
  ].join('\n');
}

function linuxReviewContext(draft, item, index) {
  const before = draft.original_text.slice(Math.max(0, item.original_start - 300), item.original_start);
  const value = draft.original_text.slice(item.original_start, item.original_end);
  const after = draft.original_text.slice(item.original_end, Math.min(draft.original_text.length, item.original_end + 300));
  return [
    `DataSecure – ${draft.batch_review ? 'lokale Stapelprüfung' : 'lokale Zertifikatsprüfung'} (${index + 1} von ${draft.ambiguities.length})`,
    ...(draft.batch_review ? ['', batchReviewSummary(draft)] : []),
    '',
    'Die eckig markierte Stelle wird nur lokal angezeigt.',
    'Ist sie der Aussteller einer Zertifizierung?',
    '',
    `${before}[${value}]${after}`
  ].join('\n');
}

function linuxViewerCommands(batchReview = false) {
  const title = batchReview ? 'DataSecure – lokale Stapelprüfung' : 'DataSecure – lokale Zertifikatsprüfung';
  return [
    { id: 'zenity', command: 'zenity', args: ['--text-info', `--title=${title}`, '--width=900', '--height=620'] },
    // KDialog accepts a local file name for its text box. `/dev/stdin` binds
    // it to the inherited anonymous input pipe without creating a raw-text
    // temporary file or placing the text in an argument.
    { id: 'kdialog', command: 'kdialog', args: ['--textbox', '/dev/stdin', '900', '620', '--title', title] }
  ];
}

function linuxChoiceCommand(id, index, total, allowDefer = false, batchReview = false, sameContextGroup = false) {
  const prompt = `Fundstelle ${index + 1} von ${total}: Entscheidung lokal treffen.${sameContextGroup ? ' Bewusste Gruppenaktion nur für nachweislich gleiche lokale Stellen verfügbar.' : ''}`;
  const title = batchReview ? 'DataSecure – Stapelentscheidung' : 'DataSecure – Zertifikatsentscheidung';
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
  const title = batchReview ? 'DataSecure – Stapelentscheidung' : 'DataSecure – Zertifikatsentscheidung';
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
  throw new SafeError('Auf diesem Gerät ist keine lokale Zertifikatsprüfung verfügbar.');
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
      const choice = linuxChoiceCommand(displayed.id, index, draft.ambiguities.length, draft.allow_defer === true, draft.batch_review !== undefined, !!group);
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
      const targets = /_group$/u.test(answer) && group ? group.candidate_ids : [item.ambiguity_id];
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

function validateReviewResult(value, draft = null) {
  if (!value || !['reviewed', 'skipped', 'cancelled', 'deferred'].includes(value.action)) {
    throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.');
  }
  if (value.action === 'deferred') {
    if (Object.keys(value).sort().join(',') !== 'action') throw new SafeError('Die lokale Vertagung enthält nicht erlaubte Felder.');
    return { action: 'deferred' };
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

// The synchronous review_deferred_document_batch MCP tool call must keep this
// well inside the supervisor's ten-minute request deadline so spawnSync tears
// down PowerShell before the Node child can be terminated by its parent. The
// detached, non-blocking review worker (gateway/review-worker.js) is not bound
// by that per-request deadline and passes a much longer options.timeoutMs.
function defaultRunner(command, args, input, env = process.env, timeoutMs = DEFAULT_REVIEW_TIMEOUT_MS) {
  const options = {
    input,
    encoding: 'utf8',
    windowsHide: true,
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
  return validateReviewResult(parsed, draft);
}

module.exports = {
  REVIEW_SCHEMA,
  BATCH_REVIEW_SCHEMA,
  MAX_REVIEW_CHARS,
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
