'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-result-export-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
const cowork = path.join(base, 'cowork');
fs.mkdirSync(cowork, { recursive: true });
process.env.EU_PRIVACY_RESULT_ROOT = cowork;

const { roots } = require('../plugins/data-secure/server/gateway/common');
const {
  inspectRoot, readConfiguredResultRoot, saveConfiguredResultRoot,
  resultOutputDirectory, isCommonSyncFolder
} = require('../plugins/data-secure/server/gateway/result-folder-config');
const {
  exportCompletedState, replayPendingResultExports, recordPath, terminalVisibleExport
} = require('../plugins/data-secure/server/gateway/result-export');

function packageFixture(id, text) {
  const directory = path.join(roots().output, id);
  fs.mkdirSync(directory);
  const document = `${id}.md`;
  const bytes = Buffer.from(text, 'utf8');
  fs.writeFileSync(path.join(directory, document), bytes);
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2', package_id: id, profile: 'general',
    created_at: '2026-09-02T12:34:56.000Z', document,
    document_sha256: crypto.createHash('sha256').update(bytes).digest('hex'), assets: []
  }));
  return directory;
}

try {
  assert.strictEqual(inspectRoot(cowork).root, path.resolve(cowork));
  assert.strictEqual(path.basename(resultOutputDirectory()), 'DataSecure-Output');
  assert.strictEqual(isCommonSyncFolder(path.join(base, 'OneDrive - Firma', 'Projekt')), true);

  const id1 = `ds_${'1'.repeat(32)}`;
  const id2 = `ds_${'2'.repeat(32)}`;
  packageFixture(id1, '# Bereinigtes Dokument\n\n[PERSON_1]');
  packageFixture(id2, '# Zweites Dokument\n\n[ORGANISATION_1]');
  const state = {
    token: 'a'.repeat(64), created_at: '2026-09-02T12:34:56.000Z',
    items: [{ status: 'released', package_id: id1 }, { status: 'released', package_id: id2 }]
  };
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true });
  const runs = fs.readdirSync(resultOutputDirectory());
  assert.strictEqual(runs.length, 1);
  const visible = fs.readdirSync(path.join(resultOutputDirectory(), runs[0])).sort();
  assert.deepStrictEqual(visible, ['Dokument-001-anonymisiert.md', 'Dokument-002-anonymisiert.md']);
  assert.doesNotMatch(JSON.stringify(visible), /ds_|manifest|mapping|original/iu);
  assert.strictEqual(fs.readFileSync(path.join(resultOutputDirectory(), runs[0], visible[0]), 'utf8'), '# Bereinigtes Dokument\n\n[PERSON_1]');
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true }, 'retry is idempotent');

  const secondCowork = path.join(base, 'cowork-second');
  fs.mkdirSync(secondCowork);
  process.env.EU_PRIVACY_RESULT_ROOT = secondCowork;
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true }, 'a destination change re-exports');
  const secondRun = fs.readdirSync(resultOutputDirectory())[0];
  const secondVisible = path.join(resultOutputDirectory(), secondRun, 'Dokument-001-anonymisiert.md');
  assert.strictEqual(fs.readFileSync(secondVisible, 'utf8'), '# Bereinigtes Dokument\n\n[PERSON_1]');
  fs.unlinkSync(secondVisible);
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true }, 'a deleted visible result is repaired');
  assert.strictEqual(fs.readFileSync(secondVisible, 'utf8'), '# Bereinigtes Dokument\n\n[PERSON_1]');

  const id3 = `ds_${'3'.repeat(32)}`;
  const third = packageFixture(id3, '# Sicher');
  fs.appendFileSync(path.join(third, `${id3}.md`), ' manipuliert');
  const pendingState = {
    token: 'b'.repeat(64), created_at: '2026-09-02T13:00:00.000Z',
    items: [{ status: 'released', package_id: id3 }]
  };
  assert.deepStrictEqual(exportCompletedState(pendingState), { exported: 0, pending: 1, available: false });
  assert.strictEqual(JSON.parse(fs.readFileSync(recordPath(pendingState.token), 'utf8')).complete, false);
  assert.ok(replayPendingResultExports().failures >= 1, 'tampered source remains pending');

  // A damaged or conflicting private export record is a fail-closed pending
  // result. It must never surface as an exception that a detached worker would
  // present as a processing stop for an already completed batch.
  const id4 = `ds_${'4'.repeat(32)}`;
  packageFixture(id4, '# Viertes Dokument');
  const damagedState = {
    token: 'c'.repeat(64), created_at: '2026-09-02T14:00:00.000Z',
    items: [{ status: 'released', package_id: id4 }]
  };
  assert.deepStrictEqual(exportCompletedState(damagedState), { exported: 1, pending: 0, available: true });
  fs.writeFileSync(recordPath(damagedState.token), '{"schema":"garbage"}');
  assert.deepStrictEqual(exportCompletedState(damagedState), { exported: 0, pending: 1, available: false },
    'a damaged export record stays pending without throwing');
  const conflictState = {
    token: 'd'.repeat(64), created_at: '2026-09-02T14:30:00.000Z',
    items: [{ status: 'released', package_id: id4 }]
  };
  assert.deepStrictEqual(exportCompletedState(conflictState), { exported: 1, pending: 0, available: true });
  const conflicting = { ...conflictState, items: [...conflictState.items, { status: 'released', package_id: id1 }] };
  assert.deepStrictEqual(exportCompletedState(conflicting), { exported: 0, pending: 2, available: false },
    'a record/items conflict stays pending without throwing');
  assert.strictEqual(fs.readFileSync(path.join(roots().output, id4, `${id4}.md`), 'utf8'), '# Viertes Dokument',
    'internal packages are never touched by a failed visible export');

  // An interrupted atomic record write leaves a private temporary file behind.
  // It carries no export state: replay neither counts it as a damaged record
  // nor removes a file that a concurrent worker may still be writing.
  const outbox = path.dirname(recordPath(damagedState.token));
  const staleTemporary = path.join(outbox, `re_${'e'.repeat(32)}.json.4242.0123abcd.tmp`);
  fs.writeFileSync(staleTemporary, 'interrupted');
  const replayed = replayPendingResultExports();
  assert.strictEqual(replayed.failures, 2, 'exactly the tampered and the damaged record fail; the temporary is ignored');
  assert.ok(fs.existsSync(staleTemporary), 'replay never removes a possibly live temporary record');
  fs.writeFileSync(path.join(outbox, 'foreign.txt'), 'x');
  assert.strictEqual(replayPendingResultExports().failures, 3, 'a foreign entry still counts as a failure');

  // Detached workers attach the visible export to their terminal envelope.
  const neverCalled = () => { throw new Error('exporter must not run for a non-terminal batch'); };
  assert.deepStrictEqual(terminalVisibleExport({ complete: false, released: 3 }, neverCalled), { exported: 0, pending: 0, available: false });
  assert.deepStrictEqual(terminalVisibleExport({ complete: true, released: 2 }, () => { throw new Error('RESULT_EXPORT_STATE_CONFLICT'); }),
    { exported: 0, pending: 2, available: false }, 'an exporter failure keeps the released results pending');
  assert.deepStrictEqual(terminalVisibleExport({ complete: true, released: 2 }, () => ({ exported: 2, pending: 0, available: true })),
    { exported: 2, pending: 0, available: true });
  assert.deepStrictEqual(terminalVisibleExport({ complete: true, released: 2 }, () => ({ exported: 1, pending: 0, available: true })),
    { exported: 0, pending: 2, available: false }, 'an inconsistent exporter result is never presented');
  assert.deepStrictEqual(terminalVisibleExport({ complete: true, released: 1 }, () => ({ exported: 0, pending: 1, available: true })),
    { exported: 0, pending: 1, available: false }, 'pending results can never be announced as available');

  // The normal product path persists a one-time local choice; no model-visible
  // path or repeated picker is required on subsequent runs.
  delete process.env.EU_PRIVACY_RESULT_ROOT;
  const configured = path.join(base, 'configured-cowork');
  fs.mkdirSync(configured);
  saveConfiguredResultRoot(configured);
  assert.strictEqual(readConfiguredResultRoot(), path.resolve(configured));
  const moved = path.join(base, 'configured-cowork-moved');
  fs.renameSync(configured, moved);
  fs.mkdirSync(configured);
  assert.strictEqual(readConfiguredResultRoot(), '', 'a replaced destination is not silently trusted');

  const realTarget = path.join(base, 'real-target');
  const linkedTarget = path.join(base, 'linked-target');
  fs.mkdirSync(realTarget);
  fs.symlinkSync(realTarget, linkedTarget, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectRoot(linkedTarget), /RESULT_ROOT_UNSAFE/);

  console.log('RESULT FOLDER EXPORT PASS');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
