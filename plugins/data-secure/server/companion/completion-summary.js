'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { LIMITS } = require('../gateway/common');
const { RESOURCE_LIMITS } = require('../resource-limits');

function validateSummary(summary) {
  const selected = summary?.selected_count;
  const released = summary?.released_count;
  const failed = summary?.failed_count;
  if (![selected, released, failed].every(Number.isSafeInteger) ||
      selected < 1 || selected > LIMITS.MAX_BATCH_FILES || released < 0 || failed < 0 ||
      released + failed !== selected) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
  const gradeInput = summary?.result_grade_counts;
  const omissionInput = summary?.result_omission_counts;
  if (gradeInput === undefined && omissionInput === undefined) {
    return {
      selected, released, failed,
      gradeCounts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: selected },
      omissionCounts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      gradesVerified: false
    };
  }
  const gradeKeys = gradeInput && typeof gradeInput === 'object' && !Array.isArray(gradeInput)
    ? Object.keys(gradeInput).sort().join(',') : '';
  const omissionKeys = omissionInput && typeof omissionInput === 'object' && !Array.isArray(omissionInput)
    ? Object.keys(omissionInput).sort().join(',') : '';
  const gradeCounts = gradeKeys === 'complete,not_processed,unavailable,usable_with_omissions' ? gradeInput : null;
  const omissionCounts = omissionKeys === 'images_removed_by_request,visual_assets_withheld_locally' ? omissionInput : null;
  const maximumOmissions = selected * RESOURCE_LIMITS.MAX_VISUAL_ASSETS;
  if (!gradeCounts || !omissionCounts || !Object.values(gradeCounts).every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !Object.values(omissionCounts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= maximumOmissions) ||
      gradeCounts.complete + gradeCounts.usable_with_omissions + gradeCounts.not_processed + gradeCounts.unavailable !== selected) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
  const gradesVerified = summary.result_grades_verified === true;
  const validCrossProduct = gradesVerified
    ? gradeCounts.unavailable === 0 && gradeCounts.complete + gradeCounts.usable_with_omissions === released && gradeCounts.not_processed === failed
    : gradeCounts.unavailable === selected && gradeCounts.complete === 0 && gradeCounts.usable_with_omissions === 0 && gradeCounts.not_processed === 0 &&
      omissionCounts.images_removed_by_request === 0 && omissionCounts.visual_assets_withheld_locally === 0;
  if (!validCrossProduct) throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  return { selected, released, failed, gradeCounts: { ...gradeCounts }, omissionCounts: { ...omissionCounts }, gradesVerified };
}

function completionSummaryText(summary) {
  const { selected, released, failed, gradeCounts, omissionCounts, gradesVerified } = validateSummary(summary);
  const counters = [
    `Ausgewählt: ${selected}`,
    `Vollständig verarbeitet: ${gradeCounts.complete}`,
    `Verwendbar mit Auslassungen: ${gradeCounts.usable_with_omissions}`,
    `Sicher nicht verarbeitet: ${gradeCounts.not_processed}`
  ];
  if (!gradesVerified) counters.push(`Ergebnisgrade für diesen älteren Stapel nicht verfügbar: ${gradeCounts.unavailable}`);
  const omissions = [];
  if (omissionCounts.images_removed_by_request > 0) omissions.push(`Bilder auf Wunsch entfernt: ${omissionCounts.images_removed_by_request}`);
  if (omissionCounts.visual_assets_withheld_locally > 0) omissions.push(`Grafiken ausschließlich lokal zurückgehalten: ${omissionCounts.visual_assets_withheld_locally}`);
  const omissionBlock = omissions.length ? `\r\n\r\nAuslassungen (visuelle Bestandteile):\r\n${omissions.join('\r\n')}` : '';
  const resultWord = released === 1 ? 'anonymisiertes Ergebnis' : 'anonymisierte Ergebnisse';
  const fileWord = failed === 1 ? 'Datei' : 'Dateien';
  const outcome = `${released} ${resultWord} und die Zuordnung wurden lokal gespeichert. Für ${failed} ${fileWord} wurde kein Ergebnis freigegeben.`;
  return {
    title: 'DataSecure – Verarbeitung abgeschlossen',
    message: `${counters.join('\r\n')}${omissionBlock}\r\n\r\n${outcome}\r\n\r\nNächster Schritt: Schließen.`
  };
}

const RESTING_BATCH_PHASES = new Set([
  'awaiting_local_review',
  'awaiting_explicit_resume',
  'awaiting_local_mapping_repair',
  'awaiting_delivery_acknowledgement',
  'ready_for_next_document',
  'invalid_local_state'
]);

function batchStateNoticeText(progress) {
  if (!progress || typeof progress !== 'object') throw new SafeError('Ungültiger lokaler Stapelstatus.');
  if (progress.complete === true || progress.batch_phase === 'complete') {
    return completionSummaryText({
      selected_count: progress.batch_total,
      released_count: progress.released,
      failed_count: progress.stopped,
      result_grade_counts: progress.result_grade_counts,
      result_omission_counts: progress.result_omission_counts,
      result_grades_verified: progress.result_grades_verified
    });
  }
  const phase = String(progress.batch_phase || '');
  if (!RESTING_BATCH_PHASES.has(phase)) throw new SafeError('Ungültiger lokaler Stapelstatus.');
  const messages = {
    awaiting_local_review: {
      title: 'DataSecure – Lokale Prüfung erforderlich',
      message: 'Der Stapel ist sicher angehalten. Offene Inhalte bleiben ausschließlich lokal.\r\n\r\nNächster Schritt: Wähle in Cowork „Lokale Prüfung fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_explicit_resume: {
      title: 'DataSecure – Fortsetzung erforderlich',
      message: 'Der Stapel wurde nach einer technischen Unterbrechung sicher gespeichert.\r\n\r\nNächster Schritt: Wähle in Cowork „Stapel fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_local_mapping_repair: {
      title: 'DataSecure – Zuordnung vervollständigen',
      message: 'Die anonymisierten Ergebnisse sind lokal gesichert; ihre lokale Zuordnung ist noch nicht vollständig.\r\n\r\nNächster Schritt: Wähle in Cowork „Stapel fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_delivery_acknowledgement: {
      title: 'DataSecure – Lokaler Abschluss ausstehend',
      message: 'Ein lokal anonymisiertes Ergebnis wartet noch auf den sicheren Abschluss.\r\n\r\nNächster Schritt: Wähle in Cowork „Stapel fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    ready_for_next_document: {
      title: 'DataSecure – Verarbeitung sicher angehalten',
      message: 'Der vorhandene Stapel wurde gespeichert, aber noch nicht vollständig verarbeitet.\r\n\r\nNächster Schritt: Wähle in Cowork „Stapel fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    invalid_local_state: {
      title: 'DataSecure – Lokaler Zustand nicht verwendbar',
      message: 'Der Stapel wurde sicher gestoppt und es wird nichts weiter freigegeben.\r\n\r\nNächster Schritt: Öffne in Cowork den DataSecure-Diagnosestatus.'
    }
  };
  return messages[phase];
}

function intakeNoticeText(stage) {
  if (stage === 'after_checkpoint') {
    return {
      title: 'DataSecure – Lokale Verarbeitung angehalten',
      message: 'Die lokale Verarbeitung wurde sicher angehalten. Es wurde kein weiteres Paket freigegeben.\r\n\r\nNächster Schritt: Wähle in Cowork „Stapel fortsetzen“. Die Dateiauswahl öffnet sich nicht erneut.'
    };
  }
  if (stage !== 'before_checkpoint') throw new SafeError('Ungültiger lokaler Intake-Hinweis.');
  return {
    title: 'DataSecure – Lokale Verarbeitung nicht gestartet',
    message: 'Die lokale Verarbeitung konnte nicht gestartet werden. Es wurde kein Paket freigegeben und keine Datei an Claude übertragen.\r\n\r\nNächster Schritt: Starte den lokalen DataSecure-Dienst neu.'
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
  return localMessageCommands(title, message, options);
}

function localMessageCommands(title, message, options = {}) {
  const platform = options.platform || process.platform;
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
    '$form.ClientSize = New-Object System.Drawing.Size(620,360)',
    '$form.MaximizeBox = $false',
    '$form.MinimizeBox = $false',
    '$form.TopMost = $true',
    '$label = New-Object System.Windows.Forms.Label',
    '$label.Location = New-Object System.Drawing.Point(24,22)',
    '$label.Size = New-Object System.Drawing.Size(572,265)',
    `$label.Text = '${escape(message)}'`,
    '$button = New-Object System.Windows.Forms.Button',
    "$button.Text = 'Schließen'",
    '$button.Location = New-Object System.Drawing.Point(476,304)',
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
  return showLocalMessage(completionSummaryText(summary), options);
}

function showLocalMessage(notice, options = {}) {
  const platform = options.platform || process.platform;
  let unavailable = 0;
  for (const spec of localMessageCommands(notice.title, notice.message, options)) {
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

function showLocalIntakeNotice(stage, options = {}) {
  return showLocalMessage(intakeNoticeText(stage), options);
}

function showBatchStateNotice(progress, options = {}) {
  return showLocalMessage(batchStateNoticeText(progress), options);
}

// The MCP batch path publishes only this bounded progress object.  Keeping the
// adapter here prevents the native UI from ever receiving a source identifier,
// package id, path, filename or document content.
function showTerminalBatchSummary(progress, options = {}) {
  if (!progress || progress.complete !== true) return false;
  const summary = {
    selected_count: progress.batch_total,
    released_count: progress.released,
    failed_count: progress.stopped,
    result_grade_counts: progress.result_grade_counts,
    result_omission_counts: progress.result_omission_counts,
    result_grades_verified: progress.result_grades_verified
  };
  // Injected runners remain synchronous so tests and explicit support tooling
  // can verify exact UI results. The product completion path detaches the fixed,
  // content-free notice so closing it can never hold a worker or Cowork call.
  if (options.runner) return showCompletionSummary(summary, options);
  const spec = completionSummaryCommand(summary, options);
  const child = childProcess.spawn(spec.command, spec.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
    env: uiProcessEnvironment(options.env || process.env)
  });
  child.once?.('error', () => {});
  child.unref();
  return true;
}

module.exports = {
  validateSummary,
  completionSummaryText,
  intakeNoticeText,
  batchStateNoticeText,
  completionSummaryCommand,
  completionSummaryCommands,
  showCompletionSummary,
  showLocalIntakeNotice,
  showBatchStateNotice,
  showTerminalBatchSummary
};
