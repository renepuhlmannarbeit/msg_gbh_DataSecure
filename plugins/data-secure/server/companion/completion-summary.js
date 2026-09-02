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
  const exported = summary?.result_exported_count;
  const exportPending = summary?.result_export_pending_count;
  const outputAvailable = summary?.result_output_available;
  const hasExportState = [exported, exportPending].every(Number.isSafeInteger) &&
    exported >= 0 && exportPending >= 0 && exported + exportPending === released &&
    typeof outputAvailable === 'boolean' && !(exportPending > 0 && outputAvailable);
  if ([exported, exportPending, outputAvailable].some((value) => value !== undefined) && !hasExportState) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
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
  const exportNotice = hasExportState
    ? (exportPending > 0
        ? `\r\n\r\n${exportPending} freigegebene Ergebnisse warten noch auf den Export in den gewählten Ergebnisordner. Die internen Ergebnisse bleiben sicher erhalten.`
        : `\r\n\r\n${exported} freigegebene Ergebnisse liegen im gewählten DataSecure-Output-Ordner.`)
    : '';
  return {
    title: 'DataSecure – Verarbeitung abgeschlossen',
    message: `${counters.join('\r\n')}${omissionBlock}\r\n\r\n${outcome}${exportNotice}\r\n\r\nNächster Schritt: ${hasExportState && exported > 0 ? 'Ergebnisse öffnen oder schließen.' : 'Schließen.'}`,
    open_results: hasExportState && exported > 0 && exportPending === 0 && outputAvailable === true
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
      result_grades_verified: progress.result_grades_verified,
      result_exported_count: progress.result_exported_count,
      result_export_pending_count: progress.result_export_pending_count,
      result_output_available: progress.result_output_available
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
      message: 'Der Stapel wurde sicher gestoppt und es wird nichts weiter freigegeben. Originale bleiben unverändert.\r\n\r\nNächster Schritt: Wende dich mit dem Hinweis „Lokaler Zustand nicht verwendbar“ an deinen IT-Support. Keine Originaldateien oder Dokumentinhalte in den Chat laden.'
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
  let resultDirectory = '';
  if (options.openResults === true) {
    try { resultDirectory = require('../gateway/result-folder-config').resultOutputDirectory(); }
    catch { resultDirectory = ''; }
  }
  if (platform === 'darwin') {
    const escape = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
    const buttons = resultDirectory ? 'buttons {"Schließen", "Ergebnisse öffnen"} default button "Ergebnisse öffnen"' : 'buttons {"Schließen"} default button "Schließen"';
    const open = resultDirectory ? `; if button returned of result is "Ergebnisse öffnen" then tell application "Finder" to open POSIX file "${escape(resultDirectory)}"` : '';
    return [{
      command: '/usr/bin/osascript',
      args: ['-e', `display dialog "${escape(message)}" with title "${escape(title)}" ${buttons}${open}; return "SHOWN"`]
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
    "$button.DialogResult = 'Cancel'",
    '$form.AcceptButton = $button',
    '$form.CancelButton = $button',
    '$form.Controls.Add($label)',
    '$form.Controls.Add($button)',
    ...(resultDirectory ? [
      '$openButton = New-Object System.Windows.Forms.Button',
      "$openButton.Text = 'Ergebnisse öffnen'",
      '$openButton.Location = New-Object System.Drawing.Point(316,304)',
      '$openButton.Size = New-Object System.Drawing.Size(150,32)',
      "$openButton.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList @('${escape(resultDirectory)}'); $form.Close() })",
      '$form.AcceptButton = $openButton',
      '$form.Controls.Add($openButton)'
    ] : []),
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
  for (const spec of localMessageCommands(notice.title, notice.message, { ...options, openResults: notice.open_results === true })) {
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
  return showDetachedLocalMessage(intakeNoticeText(stage), options);
}

function showBatchStateNotice(progress, options = {}) {
  return showDetachedLocalMessage(batchStateNoticeText(progress), options);
}

function showDetachedLocalMessage(notice, options = {}) {
  // An explicit runner remains synchronous for tests and support tooling.
  // Product notices must not hold the MCP event loop or a worker while the
  // user reads them. A true result acknowledges dispatch, not dialog closure.
  if (options.runner) return showLocalMessage(notice, options);
  const commands = localMessageCommands(notice.title, notice.message, { ...options, openResults: notice.open_results === true });
  const environment = uiProcessEnvironment(options.env || process.env);
  const launch = (index) => {
    const spec = commands[index];
    let child;
    try {
      child = childProcess.spawn(spec.command, spec.args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
        env: environment
      });
    } catch (error) {
      if (error?.code === 'ENOENT' && index + 1 < commands.length) return launch(index + 1);
      throw new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.');
    }
    child.once('error', (error) => {
      // Preserve the Linux Zenity/KDialog fallback only for a missing command.
      // Detached presentation failures never escape into the processing host.
      if (error?.code === 'ENOENT' && index + 1 < commands.length) {
        try { launch(index + 1); } catch { /* no further local presenter is available */ }
      }
    });
    child.unref();
    return true;
  };
  return launch(0);
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
    result_grades_verified: progress.result_grades_verified,
    result_exported_count: progress.result_exported_count,
    result_export_pending_count: progress.result_export_pending_count,
    result_output_available: progress.result_output_available
  };
  return showDetachedLocalMessage(completionSummaryText(summary), options);
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
