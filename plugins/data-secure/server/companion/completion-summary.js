'use strict';

const path = require('path');
const childProcess = require('child_process');
const { SafeError } = require('../runtime');
const { uiProcessEnvironment } = require('./ui-process-policy');
const { LIMITS } = require('../gateway/common');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { VERSION } = require('../version');

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
  const outcome = released > 0
    ? `${released} ${resultWord} und ihre Zuordnung wurden lokal gespeichert. Für ${failed} ${fileWord} wurde kein Ergebnis freigegeben.`
    : `Für ${failed} ${fileWord} wurde kein Ergebnis freigegeben. Es wurde keine sichtbare Zuordnungsdatei erstellt.`;
  const canOpenResults = hasExportState && exported > 0 && exportPending === 0 && outputAvailable === true;
  const exportNotice = hasExportState
    ? (exportPending > 0
        ? `\r\n\r\n${exportPending} freigegebene Ergebnisse warten noch auf den Export in den gewählten Ergebnisordner. Die internen Ergebnisse bleiben sicher erhalten.`
        : exported > 0 && !outputAvailable
          ? '\r\n\r\nDie Ergebnisse wurden bereits exportiert, sind aber im aktuell gewählten Ergebnisordner nicht verfügbar. Prüfe den bisherigen Ergebnisordner.'
          : exported > 0 ? `\r\n\r\n${exported} freigegebene Ergebnisse liegen im gewählten DataSecure-Output-Ordner.` : '')
    : '';
  return {
    title: 'DataSecure – Verarbeitung abgeschlossen',
    message: `${counters.join('\r\n')}${omissionBlock}\r\n\r\n${outcome}${exportNotice}\r\n\r\nNächster Schritt: ${canOpenResults ? 'Ergebnisse öffnen oder schließen.' : 'Schließen.'}`,
    open_results: canOpenResults
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
      title: 'DataSecure – Lokale Prüfung vertagt',
      message: 'Die lokale Prüfung wurde geschlossen oder konnte nicht abgeschlossen werden. Offene Inhalte bleiben ausschließlich lokal und der Stapel ist sicher fortsetzbar.\r\n\r\nNächster Schritt: Wenn du weiterarbeiten möchtest, schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_explicit_resume: {
      title: 'DataSecure – Fortsetzung erforderlich',
      message: 'Der Stapel wurde nach einer technischen Unterbrechung sicher gespeichert.\r\n\r\nNächster Schritt: Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_local_mapping_repair: {
      title: 'DataSecure – Zuordnung vervollständigen',
      message: 'Die anonymisierten Ergebnisse sind lokal gesichert; ihre lokale Zuordnung ist noch nicht vollständig.\r\n\r\nNächster Schritt: Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    awaiting_delivery_acknowledgement: {
      title: 'DataSecure – Lokaler Abschluss ausstehend',
      message: 'Ein lokal anonymisiertes Ergebnis wartet noch auf den sicheren Abschluss.\r\n\r\nNächster Schritt: Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
    },
    ready_for_next_document: {
      title: 'DataSecure – Verarbeitung sicher angehalten',
      message: 'Der vorhandene Stapel wurde gespeichert, aber noch nicht vollständig verarbeitet.\r\n\r\nNächster Schritt: Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
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
      message: 'Die lokale Verarbeitung wurde sicher angehalten. Es wurde kein weiteres Paket freigegeben.\r\n\r\nNächster Schritt: Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“. Die Dateiauswahl öffnet sich nicht erneut.'
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
  const { title, message, open_results } = completionSummaryText(summary);
  return localMessageCommands(title, message, { ...options, openResults: open_results });
}

// This private binding never becomes part of the MCP progress envelope. Resolve
// the owning batch, not the newest run or the currently configured parent root.
// Parent and orphan-worker presentation both pass the token they already own.
function batchPresentation(progress, options = {}) {
  let resultDirectory = '';
  if ((progress?.complete === true || progress?.batch_phase === 'complete') &&
      /^[a-f0-9]{64}$/.test(String(options.batchToken || ''))) {
    try { resultDirectory = require('../gateway/result-export').visibleExportDirectory(options.batchToken); }
    catch { /* no exact verified run means no open action */ }
  }
  const presented = progress?.result_output_available === true && !resultDirectory
    ? { ...progress, result_output_available: false } : progress;
  return { notice: batchStateNoticeText(presented), options: { ...options, resultDirectory } };
}

function windowsOpenResultsHandler(resultDirectory, explorer) {
  const escape = (value) => value.replace(/'/g, "''");
  return [
    'try {',
    `if (!(Test-Path -LiteralPath '${escape(resultDirectory)}' -PathType Container)) { throw 'RESULT_DIRECTORY_UNAVAILABLE' }`,
    // Start-Process joins ArgumentList entries; embedded quotes are required
    // for a directory containing spaces. This process is the requested UI.
    `Start-Process -FilePath '${escape(explorer)}' -ArgumentList '\"${escape(resultDirectory)}\"' -WindowStyle Normal -ErrorAction Stop`,
    '$form.Close()',
    '} catch {',
    "$label.Text = 'Der Ergebnisordner konnte nicht geöffnet werden. Prüfe, ob der Ordner noch vorhanden ist, und versuche es erneut.'",
    '}'
  ].join('; ');
}

function darwinNoticeScript(title, message, resultDirectory = '') {
  const titleLiteral = JSON.stringify(title);
  const messageLiteral = JSON.stringify(message);
  const directoryLiteral = JSON.stringify(resultDirectory);
  return [
    'ObjC.import("AppKit"); ObjC.import("Foundation");',
    'function writeMarker(value) { var data = $(value).dataUsingEncoding($.NSUTF8StringEncoding); $.NSFileHandle.fileHandleWithStandardOutput.writeData(data); }',
    'function run(argv) {',
    `  var title = ${titleLiteral}; var message = ${messageLiteral}; var directory = ${directoryLiteral};`,
    '  var app = $.NSApplication.sharedApplication; app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);',
    '  var alert = $.NSAlert.alloc.init; alert.messageText = $(title); alert.informativeText = $(message);',
    '  if (directory) alert.addButtonWithTitle($("Ergebnisse öffnen"));',
    '  alert.addButtonWithTitle($("Schließen"));',
    '  app.activateIgnoringOtherApps(true); alert.window.makeKeyAndOrderFront(null); alert.window.displayIfNeeded();',
    '  if (!ObjC.unwrap(alert.window.isVisible)) throw new Error("NOT_VISIBLE");',
    '  writeMarker("SHOWN\\n");',
    '  var response = alert.runModal;',
    '  if (directory && response === $.NSAlertFirstButtonReturn) {',
    '    var opened = $.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath($(directory)));',
    '    if (!opened) { var failure = $.NSAlert.alloc.init; failure.messageText = $("DataSecure"); failure.informativeText = $("Der Ergebnisordner konnte nicht geöffnet werden. Prüfe, ob der Ordner noch vorhanden ist."); failure.addButtonWithTitle($("Schließen")); failure.runModal; }',
    '  }',
    '}'
  ].join('\n');
}

function localMessageCommands(title, rawMessage, options = {}) {
  const platform = options.platform || process.platform;
  // Every native DataSecure window names the running version. It is the only
  // place a user sees which plugin copy actually processed the batch; hosts
  // may keep an older cached copy alive next to a newer installation.
  const message = `${rawMessage}\r\n\r\nDataSecure ${VERSION}`;
  const resultDirectory = options.openResults === true && typeof options.resultDirectory === 'string' &&
    path.isAbsolute(options.resultDirectory) && !/[\0\r\n]/u.test(options.resultDirectory)
    ? options.resultDirectory : '';
  if (platform === 'darwin') {
    return [{
      command: '/usr/bin/osascript',
      args: ['-l', 'JavaScript', '-e', darwinNoticeScript(title, message, resultDirectory)]
    }];
  }
  if (platform === 'linux') {
    // Minimal Linux installations commonly ship either GTK (Zenity) or KDE
    // (KDialog), not necessarily both. They receive the same fixed, content-
    // free summary and are tried only when the first executable is absent.
    // These info-only fallbacks have no open-results button. Keep the export
    // availability truthful and adapt only the action the user can perform.
    const infoMessage = message.replace('Nächster Schritt: Ergebnisse öffnen oder schließen.',
      'Nächster Schritt: Hinweis schließen und den gewählten Ergebnisordner im Dateimanager öffnen.');
    return [
      { command: 'zenity', args: ['--info', `--title=${title}`, `--text=${infoMessage}`] },
      { command: 'kdialog', args: ['--msgbox', infoMessage, '--title', title] }
    ];
  }
  if (platform !== 'win32') throw new SafeError('Für dieses Betriebssystem ist keine lokale Abschlussansicht verfügbar.');
  const env = options.env || process.env;
  const explorer = path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'explorer.exe');
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
      `$openButton.Add_Click({ ${windowsOpenResultsHandler(resultDirectory, explorer)} })`,
      '$form.AcceptButton = $openButton',
      '$form.Controls.Add($openButton)'
    ] : []),
    ...(options.testAutoClose === true ? [
      '$timer = New-Object System.Windows.Forms.Timer',
      '$timer.Interval = 100',
      '$timer.Add_Tick({ $timer.Stop(); $form.Close() })',
      '$timer.Start()'
    ] : []),
    "$form.Add_Shown({ [Console]::Out.WriteLine('SHOWN'); [Console]::Out.Flush() })",
    '[void]$form.ShowDialog()',
  ].join('; ');
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
  const presentation = batchPresentation(progress, options);
  return showDetachedLocalMessage(presentation.notice, presentation.options);
}

function showLocalIntakeNoticeConfirmed(stage, options = {}) {
  return showDetachedLocalMessageConfirmed(intakeNoticeText(stage), options);
}

function showBatchStateNoticeConfirmed(progress, options = {}) {
  const presentation = batchPresentation(progress, options);
  return showDetachedLocalMessageConfirmed(presentation.notice, presentation.options);
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

// Windows emits SHOWN from the native Shown event. macOS emits it only after
// AppKit reports the window visible. Linux helpers still acknowledge dispatch.
// No path, token or document content crosses this confirmation channel.
function showDetachedLocalMessageConfirmed(notice, options = {}) {
  if (options.runner) return Promise.resolve(showLocalMessage(notice, options));
  const commands = localMessageCommands(notice.title, notice.message, { ...options, openResults: notice.open_results === true });
  const environment = uiProcessEnvironment(options.env || process.env);
  return new Promise((resolve, reject) => {
    const launch = (index) => {
      const spec = commands[index];
      let child;
      const requireShown = ['win32', 'darwin'].includes(options.platform || process.platform);
      try {
        child = childProcess.spawn(spec.command, spec.args, {
          detached: true,
          stdio: requireShown ? ['ignore', 'pipe', 'ignore'] : 'ignore',
          windowsHide: true,
          shell: false,
          env: environment
        });
      } catch (error) {
        if (error?.code === 'ENOENT' && index + 1 < commands.length) return launch(index + 1);
        reject(new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.'));
        return;
      }
      let settled = false;
      let timer;
      let output = '';
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (requireShown) child.stdout?.destroy?.();
        if (error) reject(new SafeError('Die lokale Abschlussansicht konnte nicht geöffnet werden.'));
        else resolve(true);
      };
      child.once('spawn', () => {
        if (settled) return;
        if (!requireShown) return finish();
        timer = setTimeout(() => {
          try { child.kill(); } catch { /* worker fallback owns visibility */ }
          finish(true);
        }, (options.platform || process.platform) === 'darwin' ? 5000 : 2000);
        timer.unref?.();
      });
      if (requireShown) child.stdout?.on?.('data', (chunk) => {
        if (settled) return;
        output += String(chunk);
        if (Buffer.byteLength(output) > 16) return finish(true);
        if (output.includes('\n')) finish(output.trim() !== 'SHOWN');
      });
      child.once('exit', () => { if (!settled) finish(true); });
      child.once('error', (error) => {
        if (settled) return;
        clearTimeout(timer);
        if (error?.code === 'ENOENT' && index + 1 < commands.length) {
          settled = true;
          launch(index + 1);
        } else finish(true);
      });
      child.unref();
    };
    launch(0);
  });
}

// Progress remains content-free. The optional private batch token is resolved
// to the verified export directory only in the native presenter.
function showTerminalBatchSummary(progress, options = {}) {
  if (!progress || progress.complete !== true) return false;
  return showBatchStateNotice(progress, options);
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
  showLocalIntakeNoticeConfirmed,
  showBatchStateNotice,
  showBatchStateNoticeConfirmed,
  showTerminalBatchSummary,
  _test: { windowsOpenResultsHandler, darwinNoticeScript }
};
