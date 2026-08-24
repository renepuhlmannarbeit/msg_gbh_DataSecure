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
const { test, done, assert } = createSuite('Durable local mapping outbox');

function publishVerifiedPackage(packageId) {
  const folder = path.join(roots().output, packageId);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const document = path.join(folder, `${packageId}.md`);
  fs.writeFileSync(document, '# Anonymisiert\n\n[PERSON_1]\n', { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2',
    package_id: packageId,
    document: `${packageId}.md`,
    document_sha256: sha256File(document)
  }), { encoding: 'utf8', mode: 0o600 });
}

test('outbox stores only durable mapping metadata, deduplicates, and is removed after a successful CSV commit', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  const entry = ensureMappingOutbox('Personalprofil.docx', packageId);
  const duplicate = ensureMappingOutbox('Personalprofil.docx', packageId);
  const raw = fs.readFileSync(entry.file, 'utf8');
  assert.strictEqual(duplicate.file, entry.file);
  assert.match(entry.file, /[\\/]\.mapping-outbox[\\/]mo_[a-f0-9]{32}\.json$/u);
  assert.deepStrictEqual(JSON.parse(raw), {
    schema: 'datasecure-mapping-outbox/1', entry_id: entry.entry_id,
    package_id: packageId, original_basename: 'Personalprofil.docx', state: 'pending'
  });
  assert.doesNotMatch(raw, /(?:path|hash|capability|content|text)/iu);
  assert.strictEqual(readOutboxEntries().length, 1);
  assert.strictEqual(removeMappingOutbox(entry), true);
  assert.deepStrictEqual(readOutboxEntries(), []);
});

test('startup replay writes an idempotent private mapping only for a verified published package', () => {
  const packageId = `ds_${crypto.randomBytes(16).toString('hex')}`;
  publishVerifiedPackage(packageId);
  ensureMappingOutbox('Vertrag.docx', packageId);
  assert.deepStrictEqual(_test.replayMappingOutbox(), { repaired: 1, pending: 0, orphaned_removed: 0, failures: 0 });
  assert.deepStrictEqual(readOutboxEntries(), []);
  const mapping = fs.readFileSync(mappingPath(), 'utf8');
  assert.match(mapping, /"Vertrag\.docx";"ds_[a-f0-9]{32}";"freigegeben"/u);
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

done();
