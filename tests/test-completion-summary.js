'use strict';

const { createSuite } = require('./helpers');
const {
  validateSummary,
  completionSummaryText,
  completionSummaryCommand,
  showCompletionSummary
} = require('../plugins/data-secure/server/companion/completion-summary');

const { test, done, assert } = createSuite('Local completion summary');

test('all-success wording contains exactly the three counters and next step', () => {
  const result = completionSummaryText({ selected_count: 3, released_count: 3, failed_count: 0 });
  assert.strictEqual(result.title, 'DataSecure – Verarbeitung abgeschlossen');
  assert.match(result.message, /Ausgewählt: 3\r\nErfolgreich vorbereitet: 3\r\nSicher gestoppt: 0/);
  assert.match(result.message, /Ergebnisse können jetzt in Claude verwendet werden/);
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
  assert.throws(() => validateSummary({ selected_count: 26, released_count: 26, failed_count: 0 }), /Ungültige/);
  assert.throws(() => validateSummary({ selected_count: 1, released_count: -1, failed_count: 2 }), /Ungültige/);
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

test('the real Windows completion form initializes and closes through the test-only path', () => {
  if (process.platform !== 'win32') return;
  assert.strictEqual(showCompletionSummary({ selected_count: 2, released_count: 1, failed_count: 1 }, {
    platform: 'win32', testAutoClose: true
  }), true);
});

done();
