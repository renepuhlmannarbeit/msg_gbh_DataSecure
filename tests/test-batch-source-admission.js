'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { planBatchAdmission } = require('../plugins/data-secure/server/gateway/batch-source-admission');
const { SourceFormatError } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch source admission plan');

function queueEntry(root, name, content) {
  const full = path.join(root, name);
  fs.writeFileSync(full, content);
  const stat = fs.lstatSync(full);
  return { name, full, stat, sourceBytes: stat.size };
}

function office(kind) {
  const main = kind === 'docx' ? 'word/document.xml' :
    (kind === 'xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml');
  return zipStore([
    ...opcControlEntries(kind),
    [main, '<root/>']
  ]);
}

test('a mixed plan preserves positions and marks only released pilot formats as candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-'));
  try {
    const queue = [
      queueEntry(root, 'one.txt', 'Kunde: Max Mustermann'),
      queueEntry(root, 'broken.docx', 'not a zip'),
      queueEntry(root, 'three.csv', 'Name;Telefon\nErika;+49 30 123456'),
      queueEntry(root, 'locked.xlsx', office('xlsx'))
    ];
    const plan = planBatchAdmission(queue);
    assert.deepStrictEqual(plan.map((item) => [item.admission, item.error_code]), [
      ['candidate', null],
      ['stopped', 'SOURCE_TYPE_MISMATCH'],
      ['candidate', null],
      ['stopped', 'SOURCE_FORMAT_NOT_RELEASED']
    ]);
    assert.deepStrictEqual(plan.map((item) => item.entry), queue);
    assert.strictEqual(plan[0].source_sha256, crypto.createHash('sha256').update(fs.readFileSync(queue[0].full)).digest('hex'));
    assert.strictEqual(plan[1].source_sha256, null);
    assert.strictEqual(plan[2].source_sha256, crypto.createHash('sha256').update(fs.readFileSync(queue[2].full)).digest('hex'));
    assert.strictEqual(plan[3].source_sha256, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an encrypted local ZIP header is terminal in the plan and never promoted by its central directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-'));
  try {
    const archive = Buffer.from(office('docx'));
    archive.writeUInt16LE(archive.readUInt16LE(6) | 1, 6);
    const plan = planBatchAdmission([queueEntry(root, 'encrypted.docx', archive)]);
    assert.deepStrictEqual(plan.map(({ admission, error_code }) => ({ admission, error_code })), [{
      admission: 'stopped', error_code: 'SOURCE_ENCRYPTED_UNSUPPORTED'
    }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('descriptor identity and read failures abort the mutation-free plan instead of inventing a file verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-'));
  try {
    const entry = queueEntry(root, 'source.txt', 'safe text');
    assert.throws(() => planBatchAdmission([entry], {
      inspectSourceFormatFromFd() { throw new SourceFormatError('SOURCE_READ_FAILED'); }
    }), (error) => error.code === 'SOURCE_READ_FAILED');
    assert.throws(() => planBatchAdmission([{ ...entry, stat: { ...entry.stat, size: entry.stat.size + 1 } }]),
      (error) => error.code === 'SOURCE_IDENTITY_CHANGED');
    assert.throws(() => planBatchAdmission([{ ...entry, stat: { ...entry.stat, mtimeMs: entry.stat.mtimeMs + 1 } }]),
      (error) => error.code === 'SOURCE_IDENTITY_CHANGED');
    // DS-070: a drifted change time (scanner metadata write) is no identity change.
    const drifted = planBatchAdmission([{ ...entry, stat: { ...entry.stat, ctimeMs: entry.stat.ctimeMs + 5000 } }]);
    assert.strictEqual(drifted[0].admission, 'candidate');
    assert.match(drifted[0].source_sha256, /^[a-f0-9]{64}$/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an invalid classifier verdict cannot inject an unbounded journal error code', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-'));
  try {
    const entry = queueEntry(root, 'plain.txt', 'clear text');
    assert.throws(() => planBatchAdmission([entry], {
      inspectSourceFormatFromFd() {
        return { verdict: 'rejected', code: 'PRIVATE VALUE FROM PARSER' };
      }
    }), (error) => error.code === 'SOURCE_READ_FAILED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('planning performs no writes, copies, mappings or directory creation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-'));
  try {
    const entry = queueEntry(root, 'source.txt', 'safe text');
    const events = [];
    const io = Object.create(fs);
    for (const method of ['writeFileSync', 'copyFileSync', 'mkdirSync', 'renameSync', 'unlinkSync']) {
      io[method] = () => { events.push(method); throw new Error('mutation attempted'); };
    }
    const plan = planBatchAdmission([entry], { fs: io, hasReparseComponent: () => false });
    assert.strictEqual(plan[0].admission, 'candidate');
    assert.deepStrictEqual(events, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

done();
