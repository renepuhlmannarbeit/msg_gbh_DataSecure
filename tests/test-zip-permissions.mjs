import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFiles, readCentralModes, writeZip } from '../scripts/lib/zip.mjs';
import { nativeDiagnosticEvents } from './helpers/native-diagnostic-events.mjs';
import readiness from './helpers/native-review-readiness.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-zip-mode-'));
try {
  const executable = path.join(directory, 'launcher');
  const regular = path.join(directory, 'notice.txt');
  fs.writeFileSync(executable, 'launcher');
  fs.writeFileSync(regular, 'notice');
  fs.chmodSync(executable, 0o755);
  fs.chmodSync(regular, 0o644);
  const archive = path.join(directory, 'test.zip');
  const files = collectFiles(directory).filter((item) => item.archivePath !== 'test.zip').map((item) => ({
    ...item,
    mode: item.archivePath === 'launcher' ? 0o100755 : 0o100644
  }));
  writeZip(archive, files);
  const modes = readCentralModes(fs.readFileSync(archive));
  assert.equal(modes.get('launcher') & 0o777, 0o755);
  assert.equal(modes.get('notice.txt') & 0o777, 0o644);
  assert.throws(() => writeZip(archive, files, { maximumFileBytes: 5 }), /BOUND_FILE_UNSAFE/u);
  writeZip(archive, files, { maximumFileBytes: 512 * 1024 * 1024 });
  assert.equal(readCentralModes(fs.readFileSync(archive)).size, 2);
  assert.throws(() => writeZip(archive, files, { maximumFileBytes: 512 * 1024 * 1024 + 1 }), /ZIP_FILE_LIMIT_INVALID/u);
  const before = fs.readFileSync(archive);
  const fresh = path.join(directory, 'fresh.zip');
  const result = writeZip(fresh, files, { createOnly: true, maximumFileBytes: 512 * 1024 * 1024 });
  assert.equal(result.bytes, before.length);
  assert.equal(result.entries, files.length);
  assert.ok(fs.readFileSync(fresh).equals(before), 'output name/creation flag must not change ZIP bytes');
  assert.throws(() => writeZip(fresh, files, { createOnly: true }), error => error.code === 'EEXIST');
  assert.ok(fs.readFileSync(fresh).equals(before));
  writeZip(fresh, files, { createOnly: false });
  assert.ok(fs.readFileSync(fresh).equals(before), 'explicit false retains the default overwrite contract');
  for (const createOnly of ['false', 1, null]) {
    const invalid = path.join(directory, 'invalid.zip');
    assert.throws(() => writeZip(invalid, files, { createOnly }), /ZIP_CREATE_ONLY_INVALID/u);
    assert.equal(fs.existsSync(invalid), false);
  }
  const occupiedDirectory = path.join(directory, 'occupied.zip'); fs.mkdirSync(occupiedDirectory);
  assert.throws(() => writeZip(occupiedDirectory, files, { createOnly: true }));
  assert.equal(fs.lstatSync(occupiedDirectory).isDirectory(), true);
  // Controlled output IO seams, not native concurrent-writer/durability claims.
  const late = path.join(directory, 'late.zip'), partial = path.join(directory, 'partial.zip');
  const write = fs.writeFileSync, failure = new Error('synthetic failure after exclusive creation');
  fs.writeFileSync = function(file, data, options) {
    if (file === late) {
      write.call(this, file, Buffer.from('late occupant'), { flag: 'wx' });
      return write.call(this, file, data, options);
    }
    if (file === partial) { write.call(this, file, Buffer.from('partial candidate'), options); throw failure; }
    return write.call(this, file, data, options);
  };
  try {
    assert.throws(() => writeZip(late, files, { createOnly: true }), error => error.code === 'EEXIST');
    assert.equal(fs.readFileSync(late, 'utf8'), 'late occupant');
    assert.throws(() => writeZip(partial, files, { createOnly: true }), error => error === failure);
    assert.equal(fs.readFileSync(partial, 'utf8'), 'partial candidate', 'no cleanup authority on failed publication');
  } finally { fs.writeFileSync = write; }
  fs.writeFileSync(path.join(directory, 'desktop-interactions.jsonl'), '{"session_id":"first"}\n');
  fs.writeFileSync(path.join(directory, `desktop-interactions.123.${'ab'.repeat(16)}.jsonl`), '{"session_id":"second"}\n');
  fs.writeFileSync(path.join(directory, 'desktop-interactions.previous.jsonl'), '{"session_id":"archive-not-a-session"}\n');
  assert.deepEqual(nativeDiagnosticEvents(directory).map(event => event.session_id).sort(), ['first', 'second']);

  // NDE-F1: real tiny owned leaves and the actual campaign readiness predicate.
  // No app/process, copied predicate, fake reader or campaign simulation.
  const { mainReady, actionReady } = readiness;
  const failures = [];
  const diagnosticCase = (name, body) => {
    try { body(); process.stdout.write(`NDE-F1 PASS ${name}\n`); }
    catch (cause) {
      failures.push(new Error(`NDE-F1 ${name}`, { cause }));
      process.stderr.write(`NDE-F1 FAIL ${name}: ${cause.code || cause.name}\n`);
    }
  };
  const ownedDiagnostics = name => {
    const own = path.join(directory, `native-${name}`);
    fs.mkdirSync(own);
    return own;
  };
  const writeEvents = (own, name, rows) => fs.writeFileSync(path.join(own, name),
    rows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
  const sessionA = 'a'.repeat(32), sessionB = 'b'.repeat(32);
  const publicRequest = '1'.repeat(32), firstContext = '2'.repeat(32), currentContext = '3'.repeat(32);
  const event = (session_id, name, fields = {}) => ({ schema: 'datasecure-standalone-interaction/1',
    component: 'desktop', time_ms: 100, session_id, event: name, ...fields });
  const initialReady = session_id => [event(session_id, 'application_started', { time_ms: 900 }),
    event(session_id, 'page_loaded', { time_ms: 800 }), event(session_id, 'frontend_ready', { time_ms: 700 }),
    event(session_id, 'ipc_request_started', { action: 'get_public_state', request_id: publicRequest, time_ms: 600 }),
    event(session_id, 'ipc_response_ok', { action: 'get_public_state', request_id: publicRequest, time_ms: 500 }),
    event(session_id, 'ipc_request_started', { action: 'get_ui_context', request_id: firstContext, time_ms: 400 }),
    event(session_id, 'ipc_response_ok', { action: 'get_ui_context', request_id: firstContext, time_ms: 300 })];
  const contextEvent = (session_id, name, request_id) => event(session_id, name,
    { action: 'get_ui_context', request_id });

  diagnosticCase('segment1 ready then segment2 latest started/failed then segment3 current success', () => {
    const own = ownedDiagnostics('current-request'), first = initialReady(sessionA);
    writeEvents(own, 'desktop-interactions.jsonl', first);
    assert.equal(mainReady(nativeDiagnosticEvents(own)), true, 'real segment1 baseline must prove readiness');
    const second = `desktop-interactions.123.${'f'.repeat(32)}.2.jsonl`;
    const started = contextEvent(sessionA, 'ipc_request_started', currentContext);
    writeEvents(own, second, [started]);
    assert.equal(mainReady(nativeDiagnosticEvents(own)), false, 'rotation must invalidate the old successful request');
    const failed = contextEvent(sessionA, 'ipc_request_failed', currentContext);
    fs.appendFileSync(path.join(own, second), JSON.stringify(failed) + '\n');
    assert.equal(mainReady(nativeDiagnosticEvents(own)), false, 'latest failed request remains unready');
    const third = [contextEvent(sessionA, 'ipc_response_ok', firstContext),
      contextEvent(sessionA, 'ipc_response_ok', currentContext),
      contextEvent(sessionA, 'ipc_response_error', firstContext)];
    writeEvents(own, `desktop-interactions.123.${'0'.repeat(32)}.3.jsonl`, third);
    const records = nativeDiagnosticEvents(own);
    assert.deepEqual(records, [...first, started, failed, ...third], 'ordinal and per-file row order, not timestamp/filename chronology');
    assert.equal(actionReady(records, 'get_ui_context'), true, 'only current opaque request success may restore readiness');
    assert.equal(mainReady(records), true, 'segment3 current response must restore readiness');
  });

  diagnosticCase('fallback first leaf and every closed ordinal2..8 preserve row order', () => {
    const own = ownedDiagnostics('ordinal-order'), first = initialReady(sessionA), expected = [...first];
    writeEvents(own, `desktop-interactions.456.${'f'.repeat(32)}.jsonl`, first);
    for (let ordinal = 2; ordinal <= 8; ordinal++) {
      // Reversed clock-derived names; equal-ms row order is equally significant.
      const rows = [event(sessionA, 'ipc_request_started', { action: 'get_ui_context',
        request_id: currentContext, time_ms: 10 - ordinal }), event(sessionA, 'ipc_response_ok',
        { action: 'get_ui_context', request_id: currentContext, time_ms: 10 - ordinal })];
      writeEvents(own, `desktop-interactions.456.${String(9 - ordinal).repeat(32)}.${ordinal}.jsonl`, rows);
      expected.push(...rows);
    }
    const records = nativeDiagnosticEvents(own);
    assert.deepEqual(records, expected, 'all ordinals2..8 and both rows retain append order');
    assert.equal(mainReady(records), true, 'application_started must precede this session rotation rows');
  });

  diagnosticCase('actual per-session campaign filter never borrows another session current response', () => {
    const own = ownedDiagnostics('sessions');
    writeEvents(own, 'desktop-interactions.jsonl', initialReady(sessionA));
    writeEvents(own, `desktop-interactions.789.${'e'.repeat(32)}.jsonl`, initialReady(sessionB));
    writeEvents(own, `desktop-interactions.123.${'d'.repeat(32)}.2.jsonl`,
      [contextEvent(sessionA, 'ipc_request_started', currentContext),
        contextEvent(sessionA, 'ipc_request_failed', currentContext)]);
    writeEvents(own, `desktop-interactions.789.${'c'.repeat(32)}.2.jsonl`,
      [contextEvent(sessionB, 'ipc_request_started', currentContext)]);
    writeEvents(own, `desktop-interactions.789.${'b'.repeat(32)}.3.jsonl`,
      [contextEvent(sessionB, 'ipc_response_ok', currentContext)]);
    const records = nativeDiagnosticEvents(own);
    assert.equal(mainReady(records.filter(row => row.session_id === sessionA)), false);
    assert.equal(mainReady(records.filter(row => row.session_id === sessionB)), true);
  });

  diagnosticCase('previous, ordinal0/1/9, malformed ordinals and foreign leaves stay ignored', () => {
    const own = ownedDiagnostics('closed-family'), expected = initialReady(sessionA);
    writeEvents(own, 'desktop-interactions.jsonl', expected);
    const stem = `desktop-interactions.123.${'a'.repeat(32)}`;
    for (const name of ['desktop-interactions.previous.jsonl', `${stem}.0.jsonl`, `${stem}.1.jsonl`,
      `${stem}.9.jsonl`, `${stem}.02.jsonl`, `${stem}.2.jsonl.extra`,
      'desktop-interactions.123.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.2.jsonl', 'sidecar-interactions.jsonl']) {
      writeEvents(own, name, [contextEvent(sessionA, 'ipc_request_failed', firstContext)]);
    }
    assert.deepEqual(nativeDiagnosticEvents(own), expected);
    assert.equal(mainReady(nativeDiagnosticEvents(own)), true);
  });

  diagnosticCase('existing64-leaf cap includes admitted rotation leaves', () => {
    const own = ownedDiagnostics('leaf-cap');
    for (let ordinal = 0; ordinal < 64; ordinal++) writeEvents(own,
      `desktop-interactions.${ordinal + 1}.${'a'.repeat(32)}.2.jsonl`,
      [event(sessionA, 'synthetic_boundary', { marker: ordinal })]);
    assert.equal(nativeDiagnosticEvents(own).length, 64);
    writeEvents(own, `desktop-interactions.65.${'a'.repeat(32)}.2.jsonl`, [event(sessionA, 'synthetic_boundary')]);
    assert.throws(() => nativeDiagnosticEvents(own), /NATIVE_DIAGNOSTIC_SEGMENT_LIMIT/u);
  });

  diagnosticCase('existing2MiB bound accepts exact size and refuses one extra byte', () => {
    const own = ownedDiagnostics('byte-cap'), name = `desktop-interactions.123.${'a'.repeat(32)}.2.jsonl`;
    const row = event(sessionA, 'synthetic_boundary');
    writeEvents(own, name, [row]);
    // Sparse zero tail: no huge fixture buffer or Buffer diff. Malformed trailing
    // JSONL remains ignored by the existing parser; the first valid line survives.
    fs.truncateSync(path.join(own, name), 2 * 1024 * 1024);
    assert.deepEqual(nativeDiagnosticEvents(own), [row]);
    fs.appendFileSync(path.join(own, name), Buffer.from([0]));
    assert.throws(() => nativeDiagnosticEvents(own), error => error.code === 'BOUND_FILE_UNSAFE');
  });
  if (failures.length) throw new AggregateError(failures, 'NDE_F1_DIAGNOSTIC_READER_CASES_FAILED');
  process.stdout.write('Deterministic ZIP modes, bounded limits and optional create-only boundaries passed (IO models identified).\n');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
