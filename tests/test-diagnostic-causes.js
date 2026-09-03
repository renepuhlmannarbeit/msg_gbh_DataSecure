'use strict';

// The diagnostic envelope is the only structured error detail that crosses the
// MCP boundary. It must stay a closed vocabulary: fixed codes, fixed German
// hints, bounded counters, the gateway version and a timestamp. Nothing derived
// from paths, names, hashes, tokens or native error text may appear.

const { createSuite } = require('./helpers');
const { VERSION } = require('../plugins/data-secure/server/version');
const {
  PHASES, CAUSES, CAUSE_CODES, buildDiagnostic, causeFromError, normalizeCause
} = require('../plugins/data-secure/server/gateway/diagnostic-causes');

const { test, assert, done } = createSuite('Diagnostic causes');

test('every cause has a fixed, path-free German hint and the list is closed', () => {
  assert.ok(CAUSE_CODES.length >= 15);
  for (const code of CAUSE_CODES) {
    assert.match(code, /^[A-Z][A-Z_]+$/u, code);
    const hint = CAUSES[code];
    assert.ok(typeof hint === 'string' && hint.length >= 10 && hint.length <= 240, `${code} hint bounded`);
    assert.doesNotMatch(hint, /[A-Za-z]:[\\/]|\\\\|\/Users\/|\.txt|\.docx|%|\$\{/u, `${code} hint is content-free`);
  }
  assert.ok(Object.isFrozen(CAUSES) && Object.isFrozen(PHASES));
  assert.strictEqual(normalizeCause('local_selection_rejected'), 'LOCAL_SELECTION_REJECTED', 'codes are case-folded');
  assert.strictEqual(normalizeCause('C:\\private\\customer.docx'), 'INTERNAL_FAILURE', 'unknown text never becomes a cause');
});

test('buildDiagnostic emits only the fixed envelope fields', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');
  const diagnostic = buildDiagnostic({ phase: 'folder_enumeration', cause: 'LOCAL_SELECTION_REJECTED', recorded: true, counts: { total: 12, rejected: 3 }, now });
  assert.deepStrictEqual(diagnostic, {
    gateway_version: VERSION,
    phase: 'folder_enumeration',
    cause: 'LOCAL_SELECTION_REJECTED',
    hint: CAUSES.LOCAL_SELECTION_REJECTED,
    at: '2026-09-03T12:00:00.000Z',
    recorded: true,
    files_total: 12,
    files_rejected: 3
  });
  const minimal = buildDiagnostic({ phase: 'nowhere', cause: 'made-up', recorded: 'yes', counts: { total: 1e9, rejected: -1 } });
  assert.strictEqual(minimal.phase, 'dispatch', 'unknown phases collapse to dispatch');
  assert.strictEqual(minimal.cause, 'INTERNAL_FAILURE');
  assert.strictEqual(minimal.recorded, false, 'recorded is strictly boolean');
  assert.strictEqual(minimal.files_total, 100, 'counters are capped at the batch limit');
  assert.strictEqual(minimal.files_rejected, undefined, 'negative counters are dropped');
  assert.deepStrictEqual(Object.keys(minimal).sort(), ['at', 'cause', 'files_total', 'gateway_version', 'hint', 'phase', 'recorded']);
});

test('causeFromError passes only known codes and never the error text', () => {
  const timeout = Object.assign(new Error('C:\\Users\\someone\\secret.txt ETIMEDOUT'), { code: 'LOCAL_PICKER_TIMEOUT' });
  assert.strictEqual(causeFromError(timeout), 'LOCAL_PICKER_TIMEOUT');
  const native = Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
  assert.strictEqual(causeFromError(native), 'INTERNAL_FAILURE', 'native codes are not exposed');
  assert.strictEqual(causeFromError(native, 'LOCAL_PICKER_FAILED'), 'LOCAL_PICKER_FAILED', 'a caller-provided fallback must itself be a known cause');
  assert.strictEqual(causeFromError(native, 'C:\\evil'), 'INTERNAL_FAILURE');
  assert.strictEqual(causeFromError(null), 'INTERNAL_FAILURE');
  assert.doesNotMatch(JSON.stringify(buildDiagnostic({ cause: causeFromError(timeout) })), /secret|Users|ETIMEDOUT/u);
});

test('completeDiagnostic closes every ok:false result from envelope-unaware gateway modules', () => {
  const { completeDiagnostic, diagnosticForErrorKey, ERROR_KEY_DIAGNOSTICS, CAUSE_CODES, PHASES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
  for (const [key, [phase, cause]] of Object.entries(ERROR_KEY_DIAGNOSTICS)) {
    assert.ok(PHASES.includes(phase) && CAUSE_CODES.includes(cause), `${key} maps to a known phase and cause`);
    assert.deepStrictEqual(diagnosticForErrorKey(key), { phase, cause });
  }
  assert.deepStrictEqual(diagnosticForErrorKey('C:\\evil\\unknown'), { phase: 'dispatch', cause: 'INTERNAL_FAILURE' });
  const handoff = completeDiagnostic({ ok: false, error: 'no_active_local_handoff', message: 'fixed text', raw_content_sent_to_claude: false });
  assert.strictEqual(handoff.diagnostic.cause, 'NO_ACTIVE_LOCAL_HANDOFF');
  assert.strictEqual(handoff.diagnostic.phase, 'handoff');
  assert.strictEqual(handoff.ok, false, 'the decision itself is untouched');
  assert.strictEqual(handoff.error, 'no_active_local_handoff');
  const folder = completeDiagnostic({ ok: false, message: 'Der lokale Ordner konnte nicht geöffnet werden.' });
  assert.strictEqual(folder.diagnostic.cause, 'FOLDER_OPEN_FAILED');
  assert.strictEqual(folder.diagnostic.phase, 'folder_open');
  const existing = { ok: false, error: 'batch_active', diagnostic: { cause: 'BATCH_ACTIVE', marker: true } };
  assert.strictEqual(completeDiagnostic(existing), existing, 'an envelope set by the producer is kept as is');
  const empty = { ok: false, error: 'input_empty' };
  assert.strictEqual(completeDiagnostic(empty), empty, 'the non-error first-run state stays without envelope');
  const success = { ok: true, opened: true };
  assert.strictEqual(completeDiagnostic(success), success);
  assert.strictEqual(completeDiagnostic(null), null);
});

done();
