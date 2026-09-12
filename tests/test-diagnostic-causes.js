'use strict';

// The diagnostic envelope is the only structured error detail that crosses the
// MCP boundary. It must stay a closed vocabulary: fixed codes, fixed German
// hints, bounded counters, the gateway version and a timestamp. Nothing derived
// from paths, names, hashes, tokens or native error text may appear.

const { createSuite } = require('./helpers');
const { VERSION } = require('../plugins/data-secure/server/version');
const {
  PHASES, CAUSES, CAUSE_CODES, WORKFLOW_ERROR_CODES, SUPPORT_ERROR_CODES,
  buildDiagnostic, causeFromError, ipcAcknowledgementCause, normalizeCause
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

test('the shared fixed catalog contains all public causes without making internal codes public', () => {
  assert.strictEqual(CAUSE_CODES.length, 26, 'only the explicit native handoff-cancellation cause extends the public contract');
  assert.strictEqual(normalizeCause('LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED'), 'LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED');
  for (const codes of [CAUSE_CODES, WORKFLOW_ERROR_CODES, SUPPORT_ERROR_CODES]) {
    assert.ok(Object.isFrozen(codes));
    assert.strictEqual(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, /^[A-Z][A-Z_]+$/u);
  }
  assert.ok(CAUSE_CODES.every(code => WORKFLOW_ERROR_CODES.includes(code)));
  assert.ok(WORKFLOW_ERROR_CODES.every(code => SUPPORT_ERROR_CODES.includes(code)));
  const contract = require('../plugins/data-secure/server/standalone/conversion-worker-contract');
  for (const code of [...contract.ERROR_CODES, ...contract.LIFECYCLE_ERROR_CODES]) {
    assert.ok(WORKFLOW_ERROR_CODES.includes(code));
  }
  for (const code of WORKFLOW_ERROR_CODES.filter(code => !CAUSE_CODES.includes(code))) {
    assert.strictEqual(normalizeCause(code), 'INTERNAL_FAILURE');
  }
});

test('ACK causes use fixed codes, never private or conflicting error messages', () => {
  for (const code of ['LOCAL_IPC_ACK_TIMEOUT', 'LOCAL_IPC_ACK_CANCELLED']) {
    const error = Object.assign(new Error('PRIVATE timeout cancel C:\\private\\customer.docx'), { code });
    assert.strictEqual(ipcAcknowledgementCause(error), code);
    const diagnostic = buildDiagnostic({ cause: ipcAcknowledgementCause(error) });
    assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE|customer|kein Stapel|erneut versuchen/u);
    assert.match(diagnostic.hint, /unbestätigt.*Status prüfen/u);
  }
  for (const code of ['LOCAL_IPC_FAILED', 'LOCAL_WORKER_EXITED', 'LOCAL_REVIEW_WORKER_EXITED',
    'LOCAL_WORKER_SPAWN_FAILED', 'LOCAL_QUEUE_SCHEMA_INVALID', 'EPERM', 'PRIVATE_CODE', null, '']) {
    assert.strictEqual(ipcAcknowledgementCause({ code, message: 'bounded IPC acknowledgement timeout' },
      { allowLegacyMessages: true }), 'LOCAL_WORKER_SPAWN_FAILED', 'a present code always blocks text fallback');
  }
  assert.strictEqual(ipcAcknowledgementCause({ code: 'LOCAL_QUEUE_SCHEMA_INVALID', message: 'PRIVATE' },
    { allowQueueSchemaInvalid: true }), 'LOCAL_QUEUE_SCHEMA_INVALID');
  assert.strictEqual(ipcAcknowledgementCause(null), 'LOCAL_WORKER_SPAWN_FAILED');
});

test('code-free ACK legacy messages require an explicit opt-in and an exact match', () => {
  for (const [message, code] of [
    ['bounded IPC acknowledgement timeout', 'LOCAL_IPC_ACK_TIMEOUT'],
    ['IPC acknowledgement cancelled', 'LOCAL_IPC_ACK_CANCELLED']
  ]) {
    assert.strictEqual(ipcAcknowledgementCause(new Error(message)), 'LOCAL_WORKER_SPAWN_FAILED');
    assert.strictEqual(ipcAcknowledgementCause(new Error(message), { allowLegacyMessages: true }), code);
    for (const changed of [`${message} PRIVATE`, ` ${message}`, message.toUpperCase()]) {
      assert.strictEqual(ipcAcknowledgementCause(new Error(changed), { allowLegacyMessages: true }), 'LOCAL_WORKER_SPAWN_FAILED');
    }
  }
  assert.strictEqual(ipcAcknowledgementCause(new Error('worker ended before IPC acknowledgement'),
    { allowLegacyMessages: true }), 'LOCAL_WORKER_SPAWN_FAILED');
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
  assert.strictEqual(minimal.files_total, 200, 'counters are capped at the batch limit');
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
