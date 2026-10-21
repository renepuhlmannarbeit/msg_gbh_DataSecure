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

const partialContentOptions = Object.freeze({ schema: 'datasecure-content-options/1',
  markdownOutput: 'content-v1', scanOcr: true, imageOcr: true });

test('only validated current Standalone admission requests partial extraction and retains the original source hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-partial-'));
  try {
    const entry = queueEntry(root, 'source.docx', office('docx'));
    for (const [productChannel, processingMode, current, expected] of [
      ['standalone', 'markdown-only', true, true], ['standalone', 'markdown-and-anonymize', true, true],
      ['standalone', 'markdown-only', false, false], ['standalone', 'markdown-and-anonymize', false, false],
      ['plugin', 'markdown-and-anonymize', false, false], ['plugin', 'markdown-and-anonymize', true, false],
      ['standalone', undefined, true, false], [undefined, undefined, true, false]
    ]) {
      let observed;
      const findings = Object.freeze([Object.freeze({ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 })]);
      const plan = planBatchAdmission([entry], { productChannel, processingMode,
        ...(current ? { contentOptions: partialContentOptions } : {}),
        inspectSourceFormatFromFd(_fd, _stat, _ext, options) {
          observed = options.partialExtraction;
          return { verdict: 'candidate', code: 'SOURCE_FORMAT_CANDIDATE',
            structure: { partial_findings: findings } };
        }
      });
      assert.strictEqual(observed, expected);
      assert.strictEqual(plan[0].source_sha256, crypto.createHash('sha256').update(fs.readFileSync(entry.full)).digest('hex'));
      assert.deepStrictEqual(plan[0].partial_findings, findings);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('actual partial CRC admission stays disabled for legacy Standalone and plugin sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-admission-partial-crc-'));
  try {
    const archive = zipStore([...opcControlEntries('docx'), ['word/document.xml', '<root/>'],
      ['word/media/image1.png', 'SYNTHETIC_IMAGE']]);
    let offset = 0, damaged = false;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const nameLength = archive.readUInt16LE(offset + 26), extraLength = archive.readUInt16LE(offset + 28);
      const start = offset + 30 + nameLength + extraLength, size = archive.readUInt32LE(offset + 18);
      if (archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8') === 'word/media/image1.png') {
        archive[start] ^= 1; damaged = true; break;
      }
      offset = start + size;
    }
    assert.strictEqual(damaged, true);
    const entry = queueEntry(root, 'source.docx', archive);
    for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
      for (const [productChannel, current, expected] of [
        ['standalone', false, 'stopped'], ['plugin', false, 'stopped'],
        ['plugin', true, 'stopped'], ['standalone', true, 'candidate']
      ]) {
        const [plan] = planBatchAdmission([entry], { productChannel, processingMode,
          ...(current ? { contentOptions: partialContentOptions } : {}) });
        assert.strictEqual(plan.admission, expected, `${productChannel}/${processingMode}/current=${current}`);
        assert.strictEqual(plan.error_code, expected === 'candidate' ? null : 'SOURCE_CONTAINER_CORRUPT');
        if (expected === 'candidate') {
          assert.deepStrictEqual(plan.partial_findings, [{ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 }]);
          assert.strictEqual(plan.source_sha256, crypto.createHash('sha256').update(archive).digest('hex'));
        } else assert.strictEqual(Object.hasOwn(plan, 'partial_findings'), false);
      }
    }
    assert.deepStrictEqual(fs.readFileSync(entry.full), archive);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('truthy or malformed content options cannot enable partial admission or open source descriptors', () => {
  for (const contentOptions of [undefined, null, true, {}, Object.create(partialContentOptions),
    { ...partialContentOptions, imageOcr: 'true' }]) {
    let opened = false;
    assert.throws(() => planBatchAdmission([{ name: 'source.docx' }], {
      productChannel: 'standalone', processingMode: 'markdown-and-anonymize', contentOptions,
      fs: { openSync() { opened = true; throw new Error('SOURCE_OPEN_UNEXPECTED'); } },
      hasReparseComponent: () => false
    }), error => error.code === 'CONTENT_OPTIONS_INVALID');
    assert.strictEqual(opened, false);
  }
});

done();
