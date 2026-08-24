'use strict';

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

test('all-success wording contains exactly the three counters and next step', () => {
  const result = completionSummaryText({ selected_count: 3, released_count: 3, failed_count: 0 });
  assert.strictEqual(result.title, 'DataSecure – Verarbeitung abgeschlossen');
  assert.match(result.message, /Ausgewählt: 3\r\nErfolgreich vorbereitet: 3\r\nSicher gestoppt: 0/);
  assert.match(result.message, /Ergebnisse und Zuordnung wurden lokal gespeichert/);
  assert.match(result.message, /Nächster Schritt: Schließe diese Meldung/);
});

test('partial and stopped wording distinguish released from withheld results', () => {
  const partial = completionSummaryText({ selected_count: 3, released_count: 2, failed_count: 1 });
  assert.match(partial.message, /Erfolgreich vorbereitet: 2/);
  assert.match(partial.message, /sicher gestoppte Dateien wurde nichts freigegeben/i);
  const stopped = completionSummaryText({ selected_count: 2, released_count: 0, failed_count: 2 });
  assert.match(stopped.message, /Erfolgreich vorbereitet: 0/);
  assert.match(stopped.message, /nichts für Claude freigegeben/);
});

test('invalid or inconsistent counters fail closed', () => {
  assert.throws(() => validateSummary({ selected_count: 2, released_count: 2, failed_count: 1 }), /Ungültige/);
  assert.throws(() => validateSummary({ selected_count: 101, released_count: 101, failed_count: 0 }), /Ungültige/);
  assert.throws(() => validateSummary({ selected_count: 1, released_count: -1, failed_count: 2 }), /Ungültige/);
});

test('intake failure notices contain only fixed local wording', () => {
  const before = intakeNoticeText('before_checkpoint');
  const after = intakeNoticeText('after_checkpoint');
  assert.match(before.message, /keine Datei an Claude übertragen/i);
  assert.match(after.message, /Stapel fortsetzen/i);
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

test('the real Windows completion form initializes and closes through the test-only path', () => {
  if (process.platform !== 'win32') return;
  assert.strictEqual(showCompletionSummary({ selected_count: 2, released_count: 1, failed_count: 1 }, {
    platform: 'win32', testAutoClose: true
  }), true);
});

done();
