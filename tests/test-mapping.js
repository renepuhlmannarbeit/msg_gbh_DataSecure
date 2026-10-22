'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
// Expected mapping failures now emit content-free workflow observations. Keep
// those real diagnostic writes in this new test-owned root, never a user profile.
const diagnosticParent = fs.realpathSync.native(os.tmpdir());
const diagnosticRoot = fs.mkdtempSync(path.join(diagnosticParent, 'data-secure-mapping-diagnostics-'));
const diagnosticIdentity = fs.lstatSync(diagnosticRoot, { bigint: true });
const previousDataRoot = process.env.EU_PRIVACY_DATA_ROOT;
process.env.EU_PRIVACY_DATA_ROOT = path.join(diagnosticRoot, 'private');
const { csvField, appendMapping, mappingPath, mappingLockPath, normalizeExistingMapping, HEADER, LEGACY_HEADER } = require('../plugins/data-secure/server/gateway/mapping');
const { releasedDocumentResult, notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

const PACKAGE_A = `ds_${'1'.repeat(32)}`;
const PACKAGE_B = `ds_${'2'.repeat(32)}`;
const COMPLETE = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
const OMITTED = releasedDocumentResult({
  parserWarnings: [],
  visualResults: [{ status: 'removed' }, { status: 'review_required' }],
  imagesRemovedByExplicitRequest: 1,
  visualAssetsWithheldAtRelease: 1
});

const { test, done, assert } = createSuite('Local mapping CSV');

test('formula-looking fields are neutralized even after leading spreadsheet whitespace', () => {
  for (const value of ['=1+1', '+1', '-1', '@cmd', ' =1+1', '\t=1+1', ' \t@cmd', '\u00A0=1+1', '\uFEFF@cmd']) {
    assert.ok(csvField(value).startsWith('"\''), `${JSON.stringify(value)} must be quoted as literal text`);
  }
  assert.strictEqual(csvField(' normal.txt'), '" normal.txt"');
  assert.strictEqual(csvField('normal.txt'), '"normal.txt"');
});

test('formula-safe and literal-apostrophe names have distinct idempotent commits', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-encoding-'));
  const roots = () => ({ exports: exportsRoot });
  try {
    const names = ['-report.txt', '=report.txt', '+report.txt', '@report.txt', ' @report.txt',
      '\uFEFF=report.txt', "'-report.txt", "''-report.txt", "'normal.txt", 'report.txt'];
    assert.equal(new Set(names.map(csvField)).size, names.length);
    for (const [index, name] of names.entries()) {
      const id = `ds_${(index + 1).toString(16).padStart(32, '0')}`;
      assert.equal(appendMapping(name, id, undefined, { roots, documentResult: COMPLETE }), true);
      const committed = fs.readFileSync(mappingPath({ roots }), 'utf8');
      assert.equal(appendMapping(name, id, undefined, { roots, documentResult: COMPLETE }), false);
      assert.equal(fs.readFileSync(mappingPath({ roots }), 'utf8'), committed);
      const reference = (index + 100).toString(16).padStart(32, '0');
      const stopped = { roots, mappingReference: reference, documentResult: notProcessedDocumentResult('SOURCE_TEXT_INVALID') };
      assert.equal(appendMapping(name, '', 'sicher gestoppt', stopped), true);
      assert.equal(appendMapping(name, '', 'sicher gestoppt', stopped), false);
      assert.throws(() => appendMapping(name + '.other', id, undefined, { roots, documentResult: COMPLETE }), /widersprüchlichen Ergebnisgrad/u);
    }
    assert.throws(() => appendMapping("'-report.txt", `ds_${'1'.padStart(32, '0')}`, undefined,
      { roots, documentResult: COMPLETE }), /widersprüchlichen Ergebnisgrad/u);
  } finally {
    // This fixture owns exactly one CSV and no nested user data.
    const entries = fs.readdirSync(exportsRoot);
    assert.deepEqual(entries, [path.basename(mappingPath({ roots }))]);
    fs.unlinkSync(mappingPath({ roots })); fs.rmdirSync(exportsRoot);
  }
});

test('legacy header migration quotes protected bytes without applying apostrophe protection again', () => {
  const names = ["'-report.txt", "''-report.txt", "'normal.txt", "' @report.txt", 'normal.txt'];
  // These are already parsed legacy CSV values, not unescaped source names.
  const quote = text => `"${text.replace(/"/g, '""')}"`;
  const legacy = LEGACY_HEADER + names.map((name, index) =>
    [name, `ds_${(index + 1).toString(16).padStart(32, '0')}`, 'freigegeben', 'Lokale Zuordnung.']
      .map(quote).join(';')).join('\r\n') + '\r\n';
  const upgraded = normalizeExistingMapping(legacy);
  assert.deepEqual(upgraded.rows.map(row => row[0]), names);
  const reread = normalizeExistingMapping(upgraded.text);
  assert.deepEqual(reread.rows.map(row => row[0]), names);
  assert.equal(normalizeExistingMapping(reread.text).text, upgraded.text);
});

test('six-column legacy apostrophe rows retry without conflating newly encoded names', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-v1-retry-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  const quote = text => `"${text.replace(/"/g, '""')}"`;
  const row = (name, id, note = 'Lokale Zuordnung; nicht an Claude übertragen.') =>
    [name, id, 'Vollständig verarbeitet', '', '', note].map(quote).join(';') + '\r\n';
  try {
    const legacy = HEADER + row("'report.txt", PACKAGE_A) + row("''report.txt", PACKAGE_B);
    fs.writeFileSync(target, legacy, { flag: 'wx' });
    assert.equal(appendMapping("'report.txt", PACKAGE_A, undefined, { roots, documentResult: COMPLETE }), false);
    assert.equal(appendMapping("''report.txt", PACKAGE_B, undefined, { roots, documentResult: COMPLETE }), false);
    assert.throws(() => appendMapping("'report.txt", PACKAGE_B, undefined, { roots, documentResult: COMPLETE }), /widersprüchlichen/u);
    assert.equal(fs.readFileSync(target, 'utf8'), legacy);
    fs.writeFileSync(target, HEADER + row("'-report.txt", PACKAGE_A));
    for (const ambiguous of ['-report.txt', "'-report.txt"]) {
      assert.throws(() => appendMapping(ambiguous, PACKAGE_A, undefined, { roots, documentResult: COMPLETE }), /widersprüchlichen/u);
    }
    const reference = '7'.repeat(32), stopped = notProcessedDocumentResult('SOURCE_TEXT_INVALID');
    const oldStopped = HEADER + ["'stopped.txt", '', 'Sicher nicht verarbeitet', '', 'SOURCE_TEXT_INVALID',
      `Lokale Zuordnung ${reference}; nicht an Claude übertragen.`].map(quote).join(';') + '\r\n';
    fs.writeFileSync(target, oldStopped);
    assert.equal(appendMapping("'stopped.txt", '', 'sicher gestoppt', { roots, mappingReference: reference, documentResult: stopped }), false);
    assert.equal(fs.readFileSync(target, 'utf8'), oldStopped);
  } finally {
    fs.unlinkSync(target); fs.rmdirSync(exportsRoot);
  }
});

test('a linked mapping target is refused before external content can be read or replaced', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  const linkedFs = Object.create(fs);
  linkedFs.lstatSync = (candidate) => candidate === target
    ? { isFile: () => true, isSymbolicLink: () => true }
    : fs.lstatSync(candidate);
  try {
    fs.writeFileSync(target, 'external content');
    assert.throws(() => appendMapping('normal.txt', PACKAGE_A, 'freigegeben', { roots, fs: linkedFs, documentResult: COMPLETE }),
      /Zuordnungsexport konnte nicht sicher gelesen werden/u);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'external content');
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('a redirected mapping export directory is refused before a local CSV is written', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-root-'));
  const roots = () => ({ exports: exportsRoot });
  const redirectedFs = Object.create(fs);
  redirectedFs.lstatSync = (candidate) => candidate === exportsRoot
    ? { isDirectory: () => true, isSymbolicLink: () => true }
    : fs.lstatSync(candidate);
  try {
    assert.throws(() => appendMapping('normal.txt', PACKAGE_A, 'freigegeben', { roots, fs: redirectedFs, documentResult: COMPLETE }),
      /Zuordnungsexport konnte nicht sicher gelesen werden/u);
    assert.strictEqual(fs.existsSync(mappingPath({ roots })), false);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('a pre-existing mapping lock fails closed without replacing the local CSV', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-lock-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  const lock = mappingLockPath({ roots });
  try {
    fs.writeFileSync(target, 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n', 'utf8');
    fs.writeFileSync(lock, 'datasecure-mapping-lock/1 99999\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    assert.throws(() => appendMapping('normal.txt', PACKAGE_A, 'freigegeben', { roots, documentResult: COMPLETE }),
      /Zuordnungsexport.*geschützt verarbeitet/u);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n');
    assert.strictEqual(fs.existsSync(lock), true);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('a local capacity gate stops before creating a mapping CSV', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-capacity-'));
  const roots = () => ({ exports: exportsRoot });
  const error = new Error('LOCAL_CAPACITY_INSUFFICIENT');
  error.code = 'LOCAL_CAPACITY_INSUFFICIENT';
  try {
    assert.throws(
      () => appendMapping('normal.txt', PACKAGE_A, 'freigegeben', {
        roots,
        documentResult: COMPLETE,
        assertWritableCapacity: () => { throw error; }
      }),
      (received) => received?.code === 'LOCAL_CAPACITY_INSUFFICIENT'
    );
    assert.strictEqual(fs.existsSync(mappingPath({ roots })), false);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('a real ENOSPC after a positive capacity check preserves the mapping and releases the lock', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-enospc-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  const io = Object.create(fs);
  const temporaryDescriptors = new Set();
  io.openSync = (candidate, ...args) => {
    const descriptor = fs.openSync(candidate, ...args);
    if (String(candidate).includes('.tmp_')) temporaryDescriptors.add(descriptor);
    return descriptor;
  };
  io.writeSync = (descriptor, ...args) => {
    if (temporaryDescriptors.has(descriptor)) {
      const error = new Error('disk full');
      error.code = 'ENOSPC';
      throw error;
    }
    return fs.writeSync(descriptor, ...args);
  };
  try {
    fs.writeFileSync(target, 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n', 'utf8');
    assert.throws(
      () => appendMapping('normal.txt', PACKAGE_A, 'freigegeben', { roots, fs: io, assertWritableCapacity: () => {}, documentResult: COMPLETE }),
      (received) => received?.code === 'LOCAL_CAPACITY_RACE'
    );
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n');
    assert.strictEqual(fs.existsSync(mappingLockPath({ roots })), false);
    assert.deepStrictEqual(fs.readdirSync(exportsRoot).filter((name) => name.includes('.tmp_')), []);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('stable local references keep duplicate stopped basenames distinct and retries idempotent', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-stopped-'));
  const roots = () => ({ exports: exportsRoot });
  const first = 'a'.repeat(32);
  const second = 'b'.repeat(32);
  try {
    const stopped = notProcessedDocumentResult('SOURCE_FORMAT_UNSUPPORTED');
    assert.strictEqual(appendMapping('same.docx', '', 'sicher gestoppt', { roots, mappingReference: first, documentResult: stopped }), true);
    assert.strictEqual(appendMapping('same.docx', '', 'sicher gestoppt', { roots, mappingReference: first, documentResult: stopped }), false);
    assert.strictEqual(appendMapping('same.docx', '', 'sicher gestoppt', { roots, mappingReference: second, documentResult: stopped }), true);
    const csv = fs.readFileSync(mappingPath({ roots }), 'utf8');
    assert.strictEqual(csv.split('"same.docx"').length - 1, 2);
    assert.match(csv, new RegExp(first));
    assert.match(csv, new RegExp(second));
    assert.match(csv, /"Sicher nicht verarbeitet";"";"SOURCE_FORMAT_UNSUPPORTED"/u);
    assert.throws(() => appendMapping('same.docx', '', 'sicher gestoppt', { roots, mappingReference: '../unsafe', documentResult: stopped }),
      /nicht sicher aktualisiert/u);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('CSV v2 writes German grades and omissions with semicolon, quotes, and strict CRLF safely', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-v2-'));
  const roots = () => ({ exports: exportsRoot });
  try {
    assert.strictEqual(appendMapping('Profil; "Nord".docx', PACKAGE_A, 'freigegeben', {
      roots, documentResult: OMITTED
    }), true);
    assert.strictEqual(appendMapping('vollstaendig.txt', PACKAGE_B, 'freigegeben', {
      roots, documentResult: COMPLETE
    }), true);
    const csv = fs.readFileSync(mappingPath({ roots }), 'utf8');
    assert.ok(csv.startsWith(HEADER));
    assert.match(csv, /"Profil; ""Nord""\.docx"/u);
    assert.match(csv, /"Verwendbar mit ausdrücklich benannten Auslassungen"/u);
    assert.match(csv, /"Bilder auf Wunsch entfernt: 1 \| Bilder lokal zurückgehalten: 1"/u);
    assert.match(csv, /"Vollständig verarbeitet"/u);
    assert.strictEqual(csv.replace(/\r\n/g, '').includes('\n'), false);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('legacy CSV is migrated without inventing one of the three result grades', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-legacy-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  try {
    fs.writeFileSync(target, LEGACY_HEADER + '"alt.docx";"ds_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";"freigegeben";"Alt"\r\n', 'utf8');
    appendMapping('neu.txt', PACKAGE_A, 'freigegeben', { roots, documentResult: COMPLETE });
    const csv = fs.readFileSync(target, 'utf8');
    assert.ok(csv.startsWith(HEADER));
    assert.match(csv, /"alt\.docx";"ds_a{32}";"Ergebnisgrad für älteres Paket nicht verfügbar"/u);
    assert.doesNotMatch(csv.split('"neu.txt"')[0], /"(?:Vollständig verarbeitet|Verwendbar mit ausdrücklich benannten Auslassungen|Sicher nicht verarbeitet)"/u);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('retries are idempotent and contradictory status/result pairs fail closed', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-idempotent-'));
  const roots = () => ({ exports: exportsRoot });
  try {
    assert.strictEqual(appendMapping('one.txt', PACKAGE_A, 'freigegeben', { roots, documentResult: COMPLETE }), true);
    assert.strictEqual(appendMapping('one.txt', PACKAGE_A, 'freigegeben', { roots, documentResult: COMPLETE }), false);
    assert.strictEqual(fs.readFileSync(mappingPath({ roots }), 'utf8').split(PACKAGE_A).length - 1, 1);
    assert.throws(() => appendMapping('bad.txt', PACKAGE_B, 'freigegeben', {
      roots, documentResult: notProcessedDocumentResult('SOURCE_FORMAT_UNSUPPORTED')
    }), /widersprüchlichen Ergebnisgrad/u);
    assert.throws(() => appendMapping('bad.txt', '', 'sicher gestoppt', { roots, documentResult: COMPLETE }),
      /widersprüchlichen Ergebnisgrad/u);
    const original = fs.readFileSync(mappingPath({ roots }), 'utf8');
    assert.throws(() => appendMapping('other.txt', PACKAGE_A, 'freigegeben', { roots, documentResult: OMITTED }),
      /widersprüchlichen Ergebnisgrad/u);
    assert.strictEqual(fs.readFileSync(mappingPath({ roots }), 'utf8'), original);
    const stopped = notProcessedDocumentResult('SOURCE_FORMAT_UNSUPPORTED');
    const reference = 'c'.repeat(32);
    assert.strictEqual(appendMapping('stopped.txt', '', 'sicher gestoppt', {
      roots, mappingReference: reference, documentResult: stopped
    }), true);
    assert.throws(() => appendMapping('different.txt', '', 'sicher gestoppt', {
      roots, mappingReference: reference,
      documentResult: notProcessedDocumentResult('SOURCE_TEXT_INVALID')
    }), /widersprüchlichen Ergebnisgrad/u);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

function durabilityIo(stage, targetFragment) {
  const io = Object.create(fs);
  const temporary = new Set();
  const directories = new Set();
  let shortWrite = true;
  io.openSync = (candidate, ...args) => {
    const descriptor = fs.openSync(candidate, ...args);
    if (String(candidate).includes(targetFragment)) temporary.add(descriptor);
    try { if (fs.statSync(candidate).isDirectory()) directories.add(descriptor); } catch { /* not a directory */ }
    return descriptor;
  };
  io.writeSync = (descriptor, buffer, offset, length, position) => {
    if (temporary.has(descriptor) && stage === 'zero-write') return 0;
    if (temporary.has(descriptor) && stage === 'short-write' && shortWrite && length > 1) {
      shortWrite = false;
      return fs.writeSync(descriptor, buffer, offset, length - 1, position);
    }
    return fs.writeSync(descriptor, buffer, offset, length, position);
  };
  io.fsyncSync = (descriptor) => {
    if (temporary.has(descriptor) && stage === 'file-fsync') throw new Error('file fsync');
    if (directories.has(descriptor)) {
      if (stage === 'parent-fsync') throw new Error('parent fsync');
      return undefined;
    }
    return fs.fsyncSync(descriptor);
  };
  io.closeSync = (descriptor) => {
    if (temporary.has(descriptor) && stage === 'close') {
      temporary.delete(descriptor);
      fs.closeSync(descriptor);
      throw new Error('close');
    }
    return fs.closeSync(descriptor);
  };
  io.renameSync = (source, target) => {
    if (String(source).includes(targetFragment) && stage === 'rename') throw new Error('rename');
    return fs.renameSync(source, target);
  };
  return io;
}

test('CSV durable replacement handles short writes and fails closed at every uncertain boundary', () => {
  for (const stage of ['short-write', 'zero-write', 'file-fsync', 'close', 'rename', 'parent-fsync']) {
    const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), `data-secure-mapping-${stage}-`));
    const roots = () => ({ exports: exportsRoot });
    try {
      const invoke = () => appendMapping('durable.txt', PACKAGE_A, 'freigegeben', {
        roots, fs: durabilityIo(stage, '.tmp_'), platform: 'linux', documentResult: COMPLETE
      });
      if (stage === 'short-write') assert.strictEqual(invoke(), true);
      else assert.throws(invoke, /nicht sicher aktualisiert/u, stage);
      assert.strictEqual(fs.existsSync(mappingLockPath({ roots })), false, stage);
      assert.deepStrictEqual(fs.readdirSync(exportsRoot).filter((name) => name.includes('.tmp_')), [], stage);
      if (stage === 'parent-fsync') {
        assert.match(fs.readFileSync(mappingPath({ roots }), 'utf8'), /durable\.txt/u);
      }
    } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
  }
});

done(() => {
  assert.equal(path.dirname(diagnosticRoot), diagnosticParent);
  assert.match(path.basename(diagnosticRoot), /^data-secure-mapping-diagnostics-/u);
  const current = fs.lstatSync(diagnosticRoot, { bigint: true });
  assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === diagnosticIdentity.dev && current.ino === diagnosticIdentity.ino);
  const entries = [];
  const inspect = named => {
    assert.ok(entries.length < 4096); const stat = fs.lstatSync(named, { bigint: true });
    assert.ok(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()));
    assert.ok(stat.isDirectory() || stat.nlink === 1n); entries.push({ named, stat });
    if (stat.isDirectory()) for (const child of fs.readdirSync(named)) inspect(path.join(named, child));
  };
  inspect(diagnosticRoot);
  for (const { named, stat } of entries.reverse()) {
    const now = fs.lstatSync(named, { bigint: true });
    assert.ok(!now.isSymbolicLink() && now.dev === stat.dev && now.ino === stat.ino && now.isDirectory() === stat.isDirectory());
    if (stat.isDirectory()) { assert.deepEqual(fs.readdirSync(named), []); fs.rmdirSync(named); }
    else fs.unlinkSync(named);
  }
  if (previousDataRoot === undefined) delete process.env.EU_PRIVACY_DATA_ROOT;
  else process.env.EU_PRIVACY_DATA_ROOT = previousDataRoot;
});
