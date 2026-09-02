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
  exportCompletedState, replayPendingResultExports, recordPath
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
