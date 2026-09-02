'use strict';

const childProcess = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
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
} = require('../plugins/data-secure/server/companion/completion-summary');

const { test, done, assert } = createSuite('Local completion summary');

function graded(selected, complete, omissions, stopped, omissionCounts = {}) {
  return {
    selected_count: selected,
    released_count: complete + omissions,
    failed_count: stopped,
    result_grade_counts: { complete, usable_with_omissions: omissions, not_processed: stopped, unavailable: 0 },
    result_omission_counts: {
      images_removed_by_request: omissionCounts.removed || 0,
      visual_assets_withheld_locally: omissionCounts.withheld || 0
    },
    result_grades_verified: true
  };
}

test('all-success wording contains the three result grades and next step', () => {
  const result = completionSummaryText(graded(3, 3, 0, 0));
  assert.strictEqual(result.title, 'DataSecure – Verarbeitung abgeschlossen');
  assert.match(result.message, /Ausgewählt: 3\r\nVollständig verarbeitet: 3\r\nVerwendbar mit Auslassungen: 0\r\nSicher nicht verarbeitet: 0/);
  assert.match(result.message, /Ergebnis.*Zuordnung wurden lokal gespeichert/);
  assert.match(result.message, /Nächster Schritt: Schließen/);
});

test('partial and stopped wording distinguish released from withheld results', () => {
  const partial = completionSummaryText(graded(3, 1, 1, 1, { removed: 2, withheld: 1 }));
  assert.match(partial.message, /Verwendbar mit Auslassungen: 1/);
  assert.match(partial.message, /Bilder auf Wunsch entfernt: 2/);
  assert.match(partial.message, /Grafiken ausschließlich lokal zurückgehalten: 1/);
  assert.match(partial.message, /Für 1 Datei wurde kein Ergebnis freigegeben/i);
  const stopped = completionSummaryText(graded(2, 0, 0, 2));
  assert.match(stopped.message, /Sicher nicht verarbeitet: 2/);
  assert.match(stopped.message, /0 anonymisierte Ergebnisse/);
});

test('a completed visible export offers one local open-results action', () => {
  const summary = {
    ...graded(2, 2, 0, 0),
    result_exported_count: 2,
    result_export_pending_count: 0,
    result_output_available: true
  };
  const notice = completionSummaryText(summary);
  assert.strictEqual(notice.open_results, true);
  assert.match(notice.message, /DataSecure-Output-Ordner/u);
  assert.match(notice.message, /Ergebnisse öffnen oder schließen/u);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-completion-output-'));
  const prior = process.env.EU_PRIVACY_RESULT_ROOT;
  try {
    process.env.EU_PRIVACY_RESULT_ROOT = root;
    const windows = completionSummaryCommands(summary, {
      platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, openResults: true
    })[0];
    assert.match(windows.args.at(-1), /Ergebnisse öffnen/u);
    assert.match(windows.args.at(-1), /explorer\.exe/u);
    const mac = completionSummaryCommands(summary, { platform: 'darwin', openResults: true })[0];
    assert.match(mac.args.at(-1), /Ergebnisse öffnen/u);
    assert.match(mac.args.at(-1), /Finder/u);
  } finally {
    if (prior === undefined) delete process.env.EU_PRIVACY_RESULT_ROOT;
    else process.env.EU_PRIVACY_RESULT_ROOT = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }

  const pending = completionSummaryText({
    ...graded(2, 2, 0, 0),
    result_exported_count: 0,
    result_export_pending_count: 2,
    result_output_available: false
  });
  assert.strictEqual(pending.open_results, false);
  assert.match(pending.message, /internen Ergebnisse bleiben sicher erhalten/u);
});

test('legacy summaries never invent a result grade', () => {
  const legacy = completionSummaryText({ selected_count: 2, released_count: 1, failed_count: 1 });
  assert.match(legacy.message, /Ergebnisgrade für diesen älteren Stapel nicht verfügbar: 2/);
  assert.doesNotMatch(legacy.message, /Vollständig verarbeitet: 1/);
});

test('invalid or inconsistent counters fail closed', () => {
  assert.throws(() => validateSummary({ selected_count: 2, released_count: 2, failed_count: 1 }), /Ungültige/);
  assert.throws(() => validateSummary({ selected_count: 101, released_count: 101, failed_count: 0 }), /Ungültige/);
  assert.throws(() => validateSummary({ selected_count: 1, released_count: -1, failed_count: 2 }), /Ungültige/);
  const invalid = graded(2, 1, 0, 1);
  invalid.result_grade_counts.complete = 2;
  assert.throws(() => validateSummary(invalid), /Ungültige/);
});

test('intake failure notices contain only fixed local wording', () => {
  const before = intakeNoticeText('before_checkpoint');
  const after = intakeNoticeText('after_checkpoint');
  assert.match(before.message, /keine Datei an Claude übertragen/i);
  // One continuation phrase everywhere: the local dialogs, the user guide and
  // the skill all name the same chat request instead of a non-existent button.
  assert.match(after.message, /Schreibe in Cowork „Setze den letzten DataSecure-Stapel fort“/u);
  assert.doesNotMatch(after.message, /Wähle in Cowork/u);
  assert.match(after.message, /Dateiauswahl öffnet sich nicht erneut/i);
  assert.match(before.message, /DataSecure-Dienst neu/i);
  assert.doesNotMatch(JSON.stringify({ before, after }), /filename|source|path|hash|token|error/i);
  assert.throws(() => intakeNoticeText('unexpected'), /Ungültiger/);
  assert.strictEqual(showLocalIntakeNotice('before_checkpoint', {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, runner: () => ({ status: 0, stdout: 'SHOWN' })
  }), true);
});

test('every resting batch phase has one content-free notice and one next action', () => {
  const phases = [
    'awaiting_local_review',
    'awaiting_explicit_resume',
    'awaiting_local_mapping_repair',
    'awaiting_delivery_acknowledgement',
    'ready_for_next_document',
    'invalid_local_state'
  ];
  for (const batch_phase of phases) {
    const notice = batchStateNoticeText({ batch_phase, complete: false });
    assert.strictEqual((notice.message.match(/Nächster Schritt:/gu) || []).length, 1, batch_phase);
    assert.doesNotMatch(JSON.stringify(notice), /filename|source|path|hash|token|package|content/i);
    if (batch_phase !== 'invalid_local_state') {
      assert.match(notice.message, /Dateiauswahl öffnet sich nicht erneut|DataSecure-Dienst/u);
    }
  }
  assert.throws(() => batchStateNoticeText({ batch_phase: 'processing_local_document' }), /Ungültiger/);
  let shown = 0;
  assert.strictEqual(showBatchStateNotice({ batch_phase: 'awaiting_explicit_resume', complete: false }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner: () => { shown++; return { status: 0, stdout: 'SHOWN' }; }
  }), true);
  assert.strictEqual(shown, 1);
});

test('invalid state points to IT support without an unavailable normal-mode diagnostic action', () => {
  const notice = batchStateNoticeText({
    batch_phase: 'invalid_local_state', complete: false,
    source_path: '/private/secret.docx', detail: 'Private Person'
  });
  assert.match(notice.message, /IT-Support/u);
  assert.match(notice.message, /Originale bleiben unverändert/u);
  assert.match(notice.message, /Keine Originaldateien oder Dokumentinhalte in den Chat laden/u);
  assert.doesNotMatch(notice.message, /diagnostic_status|Diagnosestatus|secret|Private Person|\/private/u);
});

test('Windows command contains only fixed wording and bounded counters', () => {
  const spec = completionSummaryCommand({ selected_count: 3, released_count: 2, failed_count: 1 }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }
  });
  assert.match(spec.command, /WindowsPowerShell.*powershell\.exe$/i);
  assert.deepStrictEqual(spec.args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-Sta', '-Command']);
  assert.match(spec.args[4], /Schließen/);
  assert.doesNotMatch(JSON.stringify(spec), /filename|source|path|content/i);
});

test('macOS and Linux completion commands are local and content-free except fixed counters', () => {
  const summary = { selected_count: 3, released_count: 2, failed_count: 1 };
  const mac = completionSummaryCommand(summary, { platform: 'darwin' });
  assert.strictEqual(mac.command, '/usr/bin/osascript');
  assert.match(mac.args.join(' '), /SHOWN/);
  const linux = completionSummaryCommand(summary, { platform: 'linux' });
  assert.strictEqual(linux.command, 'zenity');
  assert.ok(linux.args.includes('--info'));
  const linuxCommands = completionSummaryCommands(summary, { platform: 'linux' });
  assert.deepStrictEqual(linuxCommands.map((spec) => spec.command), ['zenity', 'kdialog']);
  assert.match(linuxCommands[1].args.join(' '), /--msgbox/);
  let calls = 0;
  assert.strictEqual(showCompletionSummary(summary, {
    platform: 'linux',
    runner: () => (++calls === 1 ? { error: { code: 'ENOENT' } } : { status: 0 })
  }), true);
  assert.strictEqual(calls, 2);
});

test('shown evidence requires the exact local process result', () => {
  const summary = { selected_count: 1, released_count: 1, failed_count: 0 };
  assert.strictEqual(showCompletionSummary(summary, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner: () => ({ status: 0, stdout: 'SHOWN' })
  }), true);
  assert.throws(() => showCompletionSummary(summary, {
    platform: 'win32', runner: () => ({ status: 0, stdout: '' })
  }), /konnte nicht geöffnet/);
});

test('terminal batch summaries accept only completed bounded public progress', () => {
  let shown = 0;
  const options = {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner: () => { shown++; return { status: 0, stdout: 'SHOWN' }; }
  };
  assert.strictEqual(showTerminalBatchSummary({
    complete: false, batch_total: 2, released: 2, stopped: 0
  }, options), false);
  assert.strictEqual(shown, 0);
  assert.strictEqual(showTerminalBatchSummary({
    complete: true, batch_total: 2, released: 1, stopped: 1
  }, options), true);
  assert.strictEqual(shown, 1);
  assert.throws(() => showTerminalBatchSummary({
    complete: true, batch_total: 2, released: 2, stopped: 1
  }, options), /Ungültige/);
});

test('the product terminal notice is detached and cannot block batch completion', () => {
  const original = childProcess.spawn;
  const child = new EventEmitter();
  child.unrefCalled = false;
  child.unref = () => { child.unrefCalled = true; };
  let call;
  childProcess.spawn = (command, args, options) => {
    call = { command, args, options };
    return child;
  };
  try {
    assert.strictEqual(showTerminalBatchSummary({
      complete: true, batch_total: 2, released: 2, stopped: 0
    }, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } }), true);
  } finally {
    childProcess.spawn = original;
  }
  assert.strictEqual(call.options.detached, true);
  assert.strictEqual(call.options.shell, false);
  assert.strictEqual(call.options.stdio, 'ignore');
  assert.strictEqual(child.unrefCalled, true);
});

test('all product batch-state and intake notices return before dialog closure without a synchronous process', () => {
  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  const env = { SystemRoot: 'C:\\Windows', NODE_OPTIONS: '--inspect', PRIVATE_SENTINEL: 'private-value' };
  const cases = [
    ...['awaiting_local_review', 'awaiting_explicit_resume', 'awaiting_local_mapping_repair',
      'awaiting_delivery_acknowledgement', 'ready_for_next_document', 'invalid_local_state']
      .map((batch_phase) => (options) => showBatchStateNotice({ batch_phase, complete: false }, options)),
    (options) => showBatchStateNotice({ complete: true, batch_total: 2, released: 1, stopped: 1 }, options),
    ...['before_checkpoint', 'after_checkpoint'].map((stage) => (options) => showLocalIntakeNotice(stage, options))
  ];
  childProcess.spawnSync = () => { throw new Error('Product notice must never wait synchronously'); };
  try {
    for (const show of cases) {
      let expected;
      assert.strictEqual(show({ platform: 'win32', env, runner(command, args) {
        expected = { command, args };
        return { status: 0, stdout: 'SHOWN' };
      } }), true);
      const child = new EventEmitter();
      let unrefCalled = false;
      child.unref = () => { unrefCalled = true; };
      let actual;
      childProcess.spawn = (command, args, options) => { actual = { command, args, options }; return child; };
      assert.strictEqual(show({ platform: 'win32', env }), true);
      assert.deepStrictEqual({ command: actual.command, args: actual.args }, expected, 'native command and wording remain identical');
      assert.strictEqual(actual.options.detached, true);
      assert.strictEqual(actual.options.windowsHide, true);
      assert.strictEqual(actual.options.stdio, 'ignore');
      assert.strictEqual(actual.options.shell, false);
      assert.strictEqual(actual.options.env.SystemRoot, env.SystemRoot);
      assert.strictEqual(actual.options.env.NODE_OPTIONS, undefined);
      assert.strictEqual(actual.options.env.PRIVATE_SENTINEL, undefined);
      assert.strictEqual(unrefCalled, true, 'return must not require exit, close or SHOWN evidence');
      assert.strictEqual(child.listenerCount('exit'), 0);
      assert.strictEqual(child.listenerCount('close'), 0);
      assert.doesNotThrow(() => child.emit('error', Object.assign(new Error('private-path'), { code: 'EACCES' })));
    }
  } finally {
    childProcess.spawn = originalSpawn;
    childProcess.spawnSync = originalSpawnSync;
  }
});

test('injected batch-state and intake runners retain synchronous shown-evidence checks', () => {
  for (const show of [
    (options) => showBatchStateNotice({ complete: false, batch_phase: 'awaiting_explicit_resume' }, options),
    (options) => showLocalIntakeNotice('after_checkpoint', options)
  ]) {
    assert.throws(() => show({ platform: 'win32', runner: () => ({ status: 0, stdout: '' }) }), /konnte nicht geöffnet/);
    assert.throws(() => show({ platform: 'win32', runner: () => ({ status: 1, stdout: 'SHOWN' }) }), /konnte nicht geöffnet/);
  }
});

test('detached Linux notices try KDialog only after an asynchronous missing-Zenity error', () => {
  const originalSpawn = childProcess.spawn;
  const calls = [];
  childProcess.spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.unref = () => { child.unrefCalled = true; };
    calls.push({ command, args, options, child });
    return child;
  };
  try {
    assert.strictEqual(showLocalIntakeNotice('before_checkpoint', { platform: 'linux' }), true);
    assert.deepStrictEqual(calls.map((call) => call.command), ['zenity']);
    calls[0].child.emit('error', { code: 'ENOENT' });
    assert.deepStrictEqual(calls.map((call) => call.command), ['zenity', 'kdialog']);
    assert.ok(calls.every((call) => call.child.unrefCalled && call.options.detached && call.options.shell === false));
    assert.doesNotThrow(() => calls[1].child.emit('error', { code: 'ENOENT' }));
    showLocalIntakeNotice('after_checkpoint', { platform: 'linux' });
    calls[2].child.emit('error', { code: 'EACCES' });
    assert.strictEqual(calls.length, 3, 'permission failures must not launch an alternative presenter');
  } finally {
    childProcess.spawn = originalSpawn;
  }
});

test('detached native launch exceptions are sanitized and fallback failures never escape an error callback', () => {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = () => { throw new Error('private-executable-path'); };
  try {
    assert.throws(() => showLocalIntakeNotice('before_checkpoint', { platform: 'win32' }), (error) =>
      error.message === 'Die lokale Abschlussansicht konnte nicht geöffnet werden.' && error.cause === undefined);
    const child = new EventEmitter();
    child.unref = () => {};
    let calls = 0;
    childProcess.spawn = () => {
      if (++calls === 1) return child;
      throw new Error('private-fallback-path');
    };
    assert.strictEqual(showBatchStateNotice({ batch_phase: 'awaiting_explicit_resume' }, { platform: 'linux' }), true);
    assert.doesNotThrow(() => child.emit('error', { code: 'ENOENT' }));
    assert.strictEqual(calls, 2);
  } finally {
    childProcess.spawn = originalSpawn;
  }
});

test('the real Windows completion form initializes and closes through the test-only path', () => {
  if (process.platform !== 'win32') return;
  assert.strictEqual(showCompletionSummary({ selected_count: 2, released_count: 1, failed_count: 1 }, {
    platform: 'win32', testAutoClose: true
  }), true);
});

done();
