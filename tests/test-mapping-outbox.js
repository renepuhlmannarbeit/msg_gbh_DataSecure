'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-mapping-outbox-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');

const { roots, sha256File } = require('../plugins/data-secure/server/gateway/common');
const { mappingPath, mappingOutboxDir, readOutboxEntries, ensureMappingOutbox, removeMappingOutbox } = require('../plugins/data-secure/server/gateway/mapping');
const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { test, done, assert } = createSuite('Durable local mapping outbox');

const COMPLETE = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
const OMITTED = releasedDocumentResult({
  parserWarnings: [], visualResults: [{ status: 'review_required' }], visualAssetsWithheldAtRelease: 1
});

function publishVerifiedPackage(packageId, documentResult = COMPLETE) {
  const folder = path.join(roots().output, packageId);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const document = path.join(folder, `${packageId}.md`);
  fs.writeFileSync(document, '# Anonymisiert\n\n[PERSON_1]\n', { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/3',
    package_id: packageId,
    profile: 'general',
    created_at: new Date().toISOString(),
    document: `${packageId}.md`,
    document_sha256: sha256File(document),
    parser_warnings: [],
    assets: documentResult.grade === 'complete' ? [] : [{ status: 'review_required' }],
    pdf_unextractable_visual_objects: 0,
    images_removed_by_explicit_request: 0,
    visual_assets_withheld_at_release: documentResult.grade === 'complete' ? 0 : 1,
    document_result: documentResult
  }), { encoding: 'utf8', mode: 0o600 });
}

test('outbox stores only durable mapping metadata, deduplicates, and is removed after a successful CSV commit', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  const entry = ensureMappingOutbox('Personalprofil.docx', packageId, OMITTED);
  const duplicate = ensureMappingOutbox('Personalprofil.docx', packageId, OMITTED);
  const raw = fs.readFileSync(entry.file, 'utf8');
  assert.strictEqual(duplicate.file, entry.file);
  assert.match(entry.file, /[\\/]\.mapping-outbox[\\/]mo_[a-f0-9]{32}\.json$/u);
  assert.deepStrictEqual(JSON.parse(raw), {
    schema: 'datasecure-mapping-outbox/2', entry_id: entry.entry_id,
    package_id: packageId, original_basename: 'Personalprofil.docx', document_result: OMITTED, state: 'pending'
  });
  assert.doesNotMatch(raw, /(?:path|hash|capability|content|text)/iu);
  assert.strictEqual(readOutboxEntries().length, 1);
  assert.strictEqual(removeMappingOutbox(entry), true);
  assert.deepStrictEqual(readOutboxEntries(), []);
});

test('startup replay writes an idempotent private mapping only for a verified published package', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  publishVerifiedPackage(packageId, COMPLETE);
  ensureMappingOutbox('Vertrag.docx', packageId, COMPLETE);
  assert.deepStrictEqual(_test.replayMappingOutbox(), { repaired: 1, pending: 0, orphaned_removed: 0, failures: 0 });
  assert.deepStrictEqual(readOutboxEntries(), []);
  const mapping = fs.readFileSync(mappingPath(), 'utf8');
  assert.match(mapping, /"Vertrag\.docx";"ds_[a-f0-9]{32}";"Vollständig verarbeitet";"";""/u);
  assert.strictEqual(_test.replayMappingOutbox().repaired, 0);
  assert.strictEqual(fs.readFileSync(mappingPath(), 'utf8'), mapping);
  assert.strictEqual(fs.existsSync(mappingOutboxDir()), true);
});

test('orphaned intent is removed and cannot create a guessed mapping row', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  ensureMappingOutbox('Nicht-veroeffentlicht.txt', packageId);
  assert.deepStrictEqual(_test.replayMappingOutbox(), { repaired: 0, pending: 0, orphaned_removed: 1, failures: 0 });
  assert.deepStrictEqual(readOutboxEntries(), []);
  assert.doesNotMatch(fs.readFileSync(mappingPath(), 'utf8'), /Nicht-veroeffentlicht/u);
});

test('a complete interrupted atomic intent is promoted instead of discarded', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  const entryId = crypto.randomBytes(16).toString('hex');
  const dir = mappingOutboxDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, `.mo_${entryId}.tmp`), JSON.stringify({
    schema: 'datasecure-mapping-outbox/1', entry_id: entryId,
    package_id: packageId, original_basename: 'Abbruch.txt', state: 'pending'
  }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const entries = readOutboxEntries();
  assert.strictEqual(entries.length, 1);
  assert.ok(entries.some((entry) => entry.entry_id === entryId));
  assert.strictEqual(fs.existsSync(path.join(dir, `.mo_${entryId}.tmp`)), false);
  assert.strictEqual(fs.existsSync(path.join(dir, `mo_${entryId}.json`)), true);
});

test('legacy v1 outbox replay preserves an explicitly unavailable grade instead of inventing one', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  publishVerifiedPackage(packageId, COMPLETE);
  const entryId = crypto.randomBytes(16).toString('hex');
  const dir = mappingOutboxDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, `mo_${entryId}.json`), JSON.stringify({
    schema: 'datasecure-mapping-outbox/1', entry_id: entryId,
    package_id: packageId, original_basename: 'Altbestand.docx', state: 'pending'
  }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.strictEqual(_test.replayMappingOutbox().repaired, 0,
    'a v1 intent must not be combined with a v3 package grade');
  assert.strictEqual(readOutboxEntries().length, 1);
});

test('v2 outbox retries are idempotent and contradictory document results fail closed', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  const entry = ensureMappingOutbox('Wiederholung.docx', packageId, COMPLETE);
  assert.strictEqual(ensureMappingOutbox('Wiederholung.docx', packageId, COMPLETE).file, entry.file);
  assert.strictEqual(readOutboxEntries().filter((value) => value.package_id === packageId).length, 1);
  assert.throws(() => ensureMappingOutbox('Wiederholung.docx', packageId, OMITTED),
    /widersprüchlichen Ergebnisgrad/u);
});

test('outbox v1/v2 reject every additional field and never promote a tainted temporary intent', () => {
  const dir = mappingOutboxDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [schema, documentResult] of [
    ['datasecure-mapping-outbox/1', undefined],
    ['datasecure-mapping-outbox/2', COMPLETE]
  ]) {
    const entryId = crypto.randomBytes(16).toString('hex');
    const value = {
      schema, entry_id: entryId, package_id: `ds_${crypto.randomBytes(16).toString('hex')}`,
      original_basename: 'Canary.txt', ...(documentResult ? { document_result: documentResult } : {}),
      state: 'pending', source_path: 'PII-SENTINEL'
    };
    const temporary = path.join(dir, `.mo_${entryId}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    assert.throws(() => readOutboxEntries(), /nicht sicher gelesen/u);
    assert.strictEqual(fs.existsSync(temporary), true);
    assert.strictEqual(fs.existsSync(path.join(dir, `mo_${entryId}.json`)), false);
    fs.unlinkSync(temporary);
  }
});

function outboxDurabilityIo(stage) {
  const io = Object.create(fs);
  const temporary = new Set();
  const directories = new Set();
  let shortWrite = true;
  io.openSync = (candidate, ...args) => {
    const descriptor = fs.openSync(candidate, ...args);
    if (/\.mo_[a-f0-9]{32}\.tmp$/u.test(String(candidate))) temporary.add(descriptor);
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
    if (/\.mo_[a-f0-9]{32}\.tmp$/u.test(String(source)) && stage === 'rename') throw new Error('rename');
    return fs.renameSync(source, target);
  };
  return io;
}

test('outbox creation is durable, short-write safe and fail-closed at every commit boundary', () => {
  for (const stage of ['short-write', 'zero-write', 'file-fsync', 'close', 'rename', 'parent-fsync']) {
    const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
    const io = outboxDurabilityIo(stage);
    const options = { fs: io, platform: 'linux', assertWritableCapacity: () => {} };
    if (stage === 'short-write') {
      assert.strictEqual(ensureMappingOutbox(`${stage}.txt`, packageId, COMPLETE, options).package_id, packageId);
    } else {
      assert.throws(() => ensureMappingOutbox(`${stage}.txt`, packageId, COMPLETE, options),
        /nicht sicher aktualisiert/u, stage);
    }
    const persisted = readOutboxEntries().filter((entry) => entry.package_id === packageId);
    if (stage === 'parent-fsync') {
      assert.strictEqual(persisted.length, 1, 'rename may be visible despite durability uncertainty');
      assert.strictEqual(ensureMappingOutbox(`${stage}.txt`, packageId, COMPLETE).file, persisted[0].file);
    } else if (stage !== 'short-write') {
      assert.strictEqual(persisted.length, 0, stage);
    }
  }
});

done();
