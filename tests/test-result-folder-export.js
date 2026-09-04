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
  exportCompletedState, replayPendingResultExports, recordPath, terminalVisibleExport, _test
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

  // DS-023: visible results stay until the user deletes them. DS-069: only a
  // failed export is replayed. A completed record is final; user deletions are
  // respected and a destination change never mirrors earlier runs.
  const firstVisible = path.join(resultOutputDirectory(), runs[0], 'Dokument-001-anonymisiert.md');
  fs.unlinkSync(firstVisible);
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true }, 'a completed record stays final');
  assert.strictEqual(fs.existsSync(firstVisible), false, 'a visible result deleted by the user is not re-created');
  assert.deepStrictEqual(replayPendingResultExports(), { exported: 0, pending: 0, failures: 0 }, 'startup replay skips completed records');
  assert.strictEqual(fs.existsSync(firstVisible), false);
  const secondCowork = path.join(base, 'cowork-second');
  fs.mkdirSync(secondCowork);
  process.env.EU_PRIVACY_RESULT_ROOT = secondCowork;
  assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true });
  assert.deepStrictEqual(fs.readdirSync(resultOutputDirectory()), [], 'a destination change does not mirror completed runs');
  assert.deepStrictEqual(replayPendingResultExports(), { exported: 0, pending: 0, failures: 0 });
  assert.deepStrictEqual(fs.readdirSync(resultOutputDirectory()), []);

  // Per-item finality: when one item of a run keeps failing, the items that
  // were already written stay final. A user deletion of such a file is
  // respected on every later replay although the record as a whole is still
  // incomplete (counter-check finding, DS-023).
  process.env.EU_PRIVACY_RESULT_ROOT = cowork;
  const idGood = `ds_${'6'.repeat(32)}`;
  const idBad = `ds_${'7'.repeat(32)}`;
  packageFixture(idGood, '# Gut');
  const bad = packageFixture(idBad, '# Defekt');
  fs.appendFileSync(path.join(bad, `${idBad}.md`), ' manipuliert');
  const partialState = {
    token: 'f'.repeat(64), created_at: '2026-09-02T16:00:00.000Z',
    items: [{ status: 'released', package_id: idGood }, { status: 'released', package_id: idBad }]
  };
  assert.deepStrictEqual(exportCompletedState(partialState), { exported: 1, pending: 1, available: false }, 'progress is counted per item');
  const partialRecord = JSON.parse(fs.readFileSync(recordPath(partialState.token), 'utf8'));
  assert.strictEqual(partialRecord.complete, false);
  assert.deepStrictEqual(partialRecord.items.map((item) => item.exported === true), [true, false], 'the written item is persisted as final');
  const partialRun = path.join(resultOutputDirectory(), partialRecord.run_directory);
  const writtenGood = path.join(partialRun, 'Dokument-001-anonymisiert.md');
  assert.strictEqual(fs.readFileSync(writtenGood, 'utf8'), '# Gut');
  fs.unlinkSync(writtenGood);
  const partialReplay = replayPendingResultExports();
  assert.strictEqual(partialReplay.failures >= 1, true, 'the defective item keeps failing');
  assert.strictEqual(fs.existsSync(writtenGood), false, 'a user-deleted final item is not re-created by the replay');
  assert.deepStrictEqual(exportCompletedState(partialState), { exported: 1, pending: 1, available: false });
  assert.strictEqual(fs.existsSync(writtenGood), false, 'nor by a later terminal-state export');
  assert.deepStrictEqual(fs.readdirSync(partialRun), [], 'no other visible file appeared');
  // Once the defective source is repaired, only the open item is written.
  fs.writeFileSync(path.join(bad, `${idBad}.md`), '# Defekt');
  assert.deepStrictEqual(exportCompletedState(partialState), { exported: 2, pending: 0, available: true });
  assert.deepStrictEqual(fs.readdirSync(partialRun), ['Dokument-002-anonymisiert.md'], 'only the previously open item is exported');
  assert.strictEqual(JSON.parse(fs.readFileSync(recordPath(partialState.token), 'utf8')).complete, true);

  // A genuinely failed export (no destination at completion time) is replayed
  // exactly once as soon as a destination exists, then becomes final.
  delete process.env.EU_PRIVACY_RESULT_ROOT;
  const idLate = `ds_${'5'.repeat(32)}`;
  packageFixture(idLate, '# Spätes Dokument');
  const lateState = {
    token: 'e'.repeat(64), created_at: '2026-09-02T15:00:00.000Z',
    items: [{ status: 'released', package_id: idLate }]
  };
  assert.deepStrictEqual(exportCompletedState(lateState), { exported: 0, pending: 1, available: false }, 'no destination keeps the export pending');
  assert.strictEqual(JSON.parse(fs.readFileSync(recordPath(lateState.token), 'utf8')).complete, false);
  process.env.EU_PRIVACY_RESULT_ROOT = secondCowork;
  assert.deepStrictEqual(replayPendingResultExports(), { exported: 1, pending: 0, failures: 0 }, 'the failed export is replayed once');
  const lateRuns = fs.readdirSync(resultOutputDirectory());
  assert.strictEqual(lateRuns.length, 1);
  assert.deepStrictEqual(fs.readdirSync(path.join(resultOutputDirectory(), lateRuns[0])), ['Dokument-001-anonymisiert.md']);
  assert.strictEqual(JSON.parse(fs.readFileSync(recordPath(lateState.token), 'utf8')).complete, true);
  assert.deepStrictEqual(replayPendingResultExports(), { exported: 0, pending: 0, failures: 0 }, 'a replayed record is final');
  process.env.EU_PRIVACY_RESULT_ROOT = cowork;

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

  // Released results never re-enter the pipeline: neither through the file
  // picker nor through a spelling or a replaced folder the string comparison
  // would not recognise.
  const { validateSelectedPath } = require('../plugins/data-secure/server/companion/file-picker');
  const { enumerateSourceFolder } = require('../plugins/data-secure/server/companion/source-folder');
  const shieldRoot = path.join(base, 'Cowork Projektordner');
  fs.mkdirSync(shieldRoot);
  saveConfiguredResultRoot(shieldRoot);
  const shieldOutput = resultOutputDirectory();
  const shieldRun = path.join(shieldOutput, 'Lauf-20260902-150000-abcdef01');
  fs.mkdirSync(shieldRun);
  const releasedFile = path.join(shieldRun, 'Dokument-001-anonymisiert.md');
  fs.writeFileSync(releasedFile, '# Bereits anonymisiert');
  assert.throws(() => validateSelectedPath(releasedFile), /sichtbaren DataSecure-Output/u, 'the file picker rejects a released result');
  assert.throws(() => validateSelectedPath(releasedFile.toUpperCase()), /sichtbaren DataSecure-Output/u, 'case variants are the same location');
  assert.throws(() => enumerateSourceFolder(shieldRun, { hasReparseComponent: () => false }), /DataSecure-Output|getrennten Ordner/u);
  const originalsDirectory = path.join(shieldRoot, 'Originale');
  fs.mkdirSync(originalsDirectory);
  fs.writeFileSync(path.join(originalsDirectory, 'quelle.txt'), 'synthetische Quelle');
  assert.strictEqual(validateSelectedPath(path.join(originalsDirectory, 'quelle.txt')).sourceType, 'txt', 'siblings of the output stay selectable');
  if (process.platform === 'win32') {
    const shortName = require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(New-Object -ComObject Scripting.FileSystemObject).GetFile('${releasedFile.replace(/'/g, "''")}').ShortPath`],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 }).stdout.trim();
    if (shortName && shortName.toLowerCase() !== releasedFile.toLowerCase()) {
      assert.throws(() => validateSelectedPath(shortName), /sichtbaren DataSecure-Output/u, 'an 8.3 alias of a released result is rejected');
    }
  }
  const replacedRoot = path.join(base, 'Cowork Projektordner (alt)');
  fs.renameSync(shieldRoot, replacedRoot);
  fs.mkdirSync(shieldRoot);
  fs.mkdirSync(path.join(shieldRoot, 'DataSecure-Output'));
  fs.writeFileSync(path.join(shieldRoot, 'DataSecure-Output', 'Dokument-001-anonymisiert.md'), '# Alt');
  assert.strictEqual(readConfiguredResultRoot(), '', 'a replaced destination is not trusted as export target');
  assert.throws(() => validateSelectedPath(path.join(shieldRoot, 'DataSecure-Output', 'Dokument-001-anonymisiert.md')),
    /sichtbaren DataSecure-Output/u, 'the recorded path keeps shielding the output tree after a replacement');
  assert.throws(() => enumerateSourceFolder(shieldRoot, { hasReparseComponent: () => false }), /DataSecure-Output|getrennten Ordner/u);

  // The detached worker exports with the parent's allowlisted environment. A
  // destination override the parent honours must therefore reach the worker,
  // otherwise the worker-side export stays pending until the next server start.
  const { WORKER_ENV_KEYS, batchWorkerEnvironment } = require('../plugins/data-secure/server/gateway/batch-executor');
  assert.ok(WORKER_ENV_KEYS.includes('EU_PRIVACY_RESULT_ROOT'), 'the result root override is forwarded to the worker');
  assert.ok(WORKER_ENV_KEYS.includes('EU_PRIVACY_DATA_ROOT'), 'a standalone product namespace is forwarded to the worker');
  const overrideRoot = path.join(base, 'override-cowork');
  fs.mkdirSync(overrideRoot);
  const forwarded = batchWorkerEnvironment({ ...process.env, EU_PRIVACY_RESULT_ROOT: overrideRoot, DATASECURE_UNRELATED: 'secret' });
  assert.strictEqual(forwarded.EU_PRIVACY_RESULT_ROOT, overrideRoot);
  assert.strictEqual('DATASECURE_UNRELATED' in forwarded, false, 'the allowlist still drops everything else');
  const childView = require('child_process').spawnSync(process.execPath, ['-e',
    "process.stdout.write(require(process.argv[1]).readConfiguredResultRoot())",
    path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'result-folder-config.js')
  ], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: forwarded });
  assert.strictEqual(childView.status, 0, childView.stderr);
  assert.strictEqual(childView.stdout, path.resolve(overrideRoot), 'a child with the worker environment resolves the same destination');

  // RC92 C-08: the visible output may be replaced after activeDestination has
  // bound it. The later write step must revalidate that identity before mkdir.
  const boundRoot = path.join(base, 'bound-cowork');
  const outside = path.join(base, 'bound-outside');
  fs.mkdirSync(boundRoot);
  fs.mkdirSync(outside);
  process.env.EU_PRIVACY_RESULT_ROOT = boundRoot;
  const destination = _test.activeDestination();
  fs.rmSync(destination.output.path, { recursive: true });
  fs.symlinkSync(outside, destination.output.path, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => _test.ensurePlainDirectory(destination, 'Lauf-20260903-120000-abcdef12'), /RESULT_EXPORT_PATH_UNSAFE/u);
  assert.strictEqual(fs.existsSync(path.join(outside, 'Lauf-20260903-120000-abcdef12')), false, 'no directory is created outside the selected tree');
  fs.rmSync(destination.output.path);

  // A file appearing after the existence check must never be overwritten.
  // POSIX rename would replace it; the product uses atomic create-if-absent.
  fs.mkdirSync(destination.output.path);
  const raceId = `ds_${'8'.repeat(32)}`;
  packageFixture(raceId, '# Freigegeben');
  const raceState = { token: '8'.repeat(64), created_at: '2026-09-03T13:00:00.000Z',
    items: [{ status: 'released', package_id: raceId }] };
  const realLink = fs.linkSync;
  let racedTarget = '';
  fs.linkSync = (source, target) => {
    if (String(target).endsWith('Dokument-001-anonymisiert.md')) {
      racedTarget = target;
      fs.writeFileSync(target, '# Fremde Datei', 'utf8');
    }
    return realLink(source, target);
  };
  try {
    assert.deepStrictEqual(exportCompletedState(raceState), { exported: 0, pending: 1, available: false });
  } finally { fs.linkSync = realLink; }
  assert.strictEqual(fs.readFileSync(racedTarget, 'utf8'), '# Fremde Datei',
    'a concurrent user file is preserved byte-for-byte');

  console.log('RESULT FOLDER EXPORT PASS');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
