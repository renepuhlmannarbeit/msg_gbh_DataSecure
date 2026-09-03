'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const {
  SourceFormatError,
  inspectSourceFormatFromFd
} = require('../plugins/data-secure/server/gateway/source-format-inspector');
const {
  preflightSourceEnvelopes
} = require('../plugins/data-secure/server/gateway/batch-snapshot');

const { test, done, assert } = createSuite('Source format preflight');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-source-format-'));

function officeZip(kind = 'docx', extras = []) {
  const main = {
    docx: ['word/document.xml', '<w:document/>'],
    xlsx: ['xl/workbook.xml', '<workbook/>'],
    pptx: ['ppt/presentation.xml', '<p:presentation/>']
  }[kind];
  return zipStore([
    ...opcControlEntries(kind),
    main,
    ...extras
  ]);
}

function inspectBuffer(name, content, options = {}) {
  const full = path.join(base, name);
  fs.writeFileSync(full, content);
  const stat = fs.lstatSync(full);
  const fd = fs.openSync(full, fs.constants.O_RDONLY);
  try {
    return inspectSourceFormatFromFd(fd, stat, path.extname(name), options);
  } finally {
    fs.closeSync(fd);
  }
}

test('valid UTF-8 TXT, Markdown and CSV are candidates, not final verification', () => {
  for (const name of ['plain.txt', 'notes.md', 'notes.markdown', 'table.csv']) {
    const result = inspectBuffer(name, Buffer.from('\ufeffName;Wert\r\nJörg;42\n', 'utf8'));
    assert.strictEqual(result.verdict, 'candidate');
    assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
    assert.strictEqual(result.detected_type, 'text');
  }
});

test('invalid UTF-8, NUL and binary controls are rejected as text', () => {
  for (const [name, content] of [
    ['invalid.txt', Buffer.from([0xc3, 0x28])],
    ['nul.md', Buffer.from('abc\u0000def')],
    ['control.csv', Buffer.from('a\u0001b')]
  ]) {
    const result = inspectBuffer(name, content);
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_TEXT_INVALID');
  }
});

test('known binary signatures cannot be renamed to text', () => {
  const signatures = [
    ['pdf.txt', Buffer.from('%PDF-1.7\n')],
    ['png.md', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['jpeg.csv', Buffer.from([0xff, 0xd8, 0xff, 0xdb])],
    ['zip.txt', zipStore([['a', 'b']])]
  ];
  for (const [name, content] of signatures) {
    const result = inspectBuffer(name, content);
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_TYPE_MISMATCH');
  }
});

test('CFB is rejected honestly as legacy-or-encrypted compound binary', () => {
  const content = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(content);
  for (const name of ['legacy.docx', 'legacy.txt', 'legacy.xlsx']) {
    const result = inspectBuffer(name, content);
    assert.strictEqual(result.code, 'SOURCE_COMPOUND_BINARY_UNSUPPORTED');
    assert.strictEqual(result.verdict, 'rejected');
  }
});

test('DOCX is only a container candidate after signature and minimal part-name checks', () => {
  const result = inspectBuffer('valid.docx', officeZip('docx'));
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
  assert.strictEqual(result.detected_type, 'docx');
  assert.deepStrictEqual(result.structure, {
    ooxml_type: 'docx', controls_verified: true, relationships_verified: true, crc_verified: true
  });
});

test('missing OPC markers and a mismatched Office main part are rejected', () => {
  const missing = inspectBuffer('missing.docx', zipStore([['word/document.xml', '<w:document/>']]));
  assert.strictEqual(missing.code, 'SOURCE_TYPE_MISMATCH');
  const wrong = inspectBuffer('wrong.docx', officeZip('xlsx'));
  assert.strictEqual(wrong.code, 'SOURCE_TYPE_MISMATCH');
});

test('obvious active OOXML payload families are rejected before snapshot', () => {
  for (const name of [
    'word/vbaProject.bin', 'word/oleObject1.bin', 'activeX/activeX1.bin',
    'customUI/customUI.xml', 'word/embeddings/package1.bin'
  ]) {
    const result = inspectBuffer(`active-${name.replaceAll('/', '-')}.docx`, officeZip('docx', [[name, 'x']]));
    assert.strictEqual(result.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', name);
    assert.strictEqual(result.verdict, 'rejected', name);
  }
});

test('encrypted central-directory entries receive the fixed encrypted-source code', () => {
  const archive = Buffer.from(officeZip('docx'));
  const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  archive.writeUInt16LE(archive.readUInt16LE(central + 8) | 1, central + 8);
  const result = inspectBuffer('encrypted.docx', archive);
  assert.strictEqual(result.code, 'SOURCE_ENCRYPTED_UNSUPPORTED');
});

test('local ZIP-header encryption and central/local mismatches cannot bypass preflight', () => {
  const encryptedLocal = Buffer.from(officeZip('docx'));
  encryptedLocal.writeUInt16LE(encryptedLocal.readUInt16LE(6) | 1, 6);
  assert.strictEqual(inspectBuffer('local-encrypted.docx', encryptedLocal).code, 'SOURCE_ENCRYPTED_UNSUPPORTED');

  const wrongName = Buffer.from(officeZip('docx'));
  wrongName[30] = wrongName[30] === 0x5b ? 0x58 : 0x5b;
  assert.strictEqual(inspectBuffer('local-name.docx', wrongName).code, 'SOURCE_CONTAINER_CORRUPT');

  const wrongMethod = Buffer.from(officeZip('docx'));
  wrongMethod.writeUInt16LE(8, 8);
  assert.strictEqual(inspectBuffer('local-method.docx', wrongMethod).code, 'SOURCE_CONTAINER_CORRUPT');
});

test('a read failure while binding a local ZIP header stays a fixed read error', () => {
  const full = path.join(base, 'local-read.docx');
  fs.writeFileSync(full, officeZip('docx'));
  const stat = fs.lstatSync(full);
  const fd = fs.openSync(full, fs.constants.O_RDONLY);
  try {
    assert.throws(() => inspectSourceFormatFromFd(fd, stat, '.docx', {
      readSync(descriptor, buffer, offset, length, position) {
        if (length === 30 && position === 0) throw new Error('private local-header failure');
        return fs.readSync(descriptor, buffer, offset, length, position);
      }
    }), (error) => error instanceof SourceFormatError && error.code === 'SOURCE_READ_FAILED' &&
      !/private local-header failure/u.test(error.message));
  } finally {
    fs.closeSync(fd);
  }
});

test('valid ZIP comments are accepted while trailing bytes and pre-EOCD gaps are polyglots', () => {
  const normal = Buffer.from(officeZip('docx'));
  const comment = Buffer.from('ok');
  normal.writeUInt16LE(comment.length, normal.length - 2);
  const commented = Buffer.concat([normal, comment]);
  assert.strictEqual(inspectBuffer('comment.docx', commented).verdict, 'candidate');

  const trailing = Buffer.concat([officeZip('docx'), Buffer.from('junk')]);
  assert.strictEqual(inspectBuffer('trailing.docx', trailing).code, 'SOURCE_POLYGLOT_UNSUPPORTED');

  const source = Buffer.from(officeZip('docx'));
  const eocd = source.length - 22;
  const gap = Buffer.from('gap');
  const withGap = Buffer.concat([source.subarray(0, eocd), gap, source.subarray(eocd)]);
  assert.strictEqual(inspectBuffer('gap.docx', withGap).code, 'SOURCE_POLYGLOT_UNSUPPORTED');
});

test('corrupt and truncated OOXML containers are classified without leaking parser details', () => {
  for (const content of [Buffer.from('PK\u0003\u0004broken'), officeZip('docx').subarray(0, 40)]) {
    const result = inspectBuffer(`broken-${content.length}.docx`, content);
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_CONTAINER_CORRUPT');
    assert.doesNotMatch(JSON.stringify(result), /broken-|datasecure-source-format|PK/u);
  }
});

test('valid locked formats are recognized but never released', () => {
  const fixtures = [
    ['sheet.xlsx', officeZip('xlsx')],
    ['slides.pptx', officeZip('pptx')],
    ['file.pdf', Buffer.from('%PDF-1.7\n%%EOF')],
    ['image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['photo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb])],
    ['bitmap.bmp', Buffer.from([0x42, 0x4d, 0x00, 0x00])]
  ];
  for (const [name, content] of fixtures) {
    const result = inspectBuffer(name, content);
    assert.strictEqual(result.verdict, 'not_released', name);
    assert.strictEqual(result.code, 'SOURCE_FORMAT_NOT_RELEASED', name);
  }
});

test('descriptor identity is checked before and after reads', () => {
  const full = path.join(base, 'identity.txt');
  fs.writeFileSync(full, 'plain text');
  const stat = fs.lstatSync(full);
  const fd = fs.openSync(full, fs.constants.O_RDONLY);
  try {
    const changedIno = Number(stat.ino) === 0 ? 1 : 0;
    assert.notStrictEqual(changedIno, Number(stat.ino));
    // DS-070: the change time is no identity feature; size, mtime, inode and device are.
    assert.doesNotThrow(() => inspectSourceFormatFromFd(fd, { ...stat, ctimeMs: stat.ctimeMs + 5000 }, '.txt'));
    assert.throws(() => inspectSourceFormatFromFd(fd, { ...stat, mtimeMs: stat.mtimeMs + 1 }, '.txt'),
      (error) => error.code === 'SOURCE_IDENTITY_CHANGED');
    assert.throws(() => inspectSourceFormatFromFd(fd, { ...stat, ino: changedIno }, '.txt'),
      (error) => error instanceof SourceFormatError && error.code === 'SOURCE_IDENTITY_CHANGED');
    let calls = 0;
    assert.throws(() => inspectSourceFormatFromFd(fd, stat, '.txt', {
      fstatSync(value) {
        const current = fs.fstatSync(value);
        if (++calls > 1) {
          const changedMtimeMs = Number(current.mtimeMs) === 0 ? 1 : 0;
          assert.notStrictEqual(changedMtimeMs, Number(current.mtimeMs));
          return { ...current, mtimeMs: changedMtimeMs, isFile: () => true };
        }
        return current;
      }
    }), (error) => error.code === 'SOURCE_IDENTITY_CHANGED');
  } finally {
    fs.closeSync(fd);
  }
});

test('short, invalid and throwing reads fail with a content-free fixed code', () => {
  const full = path.join(base, 'read.txt');
  fs.writeFileSync(full, 'plain text');
  const stat = fs.lstatSync(full);
  const fd = fs.openSync(full, fs.constants.O_RDONLY);
  try {
    for (const readSync of [() => 0, () => -1, () => 1.5, () => { throw new Error('private path'); }]) {
      assert.throws(() => inspectSourceFormatFromFd(fd, stat, '.txt', { readSync }), (error) =>
        error instanceof SourceFormatError && error.code === 'SOURCE_READ_FAILED' && !/private path/u.test(error.message));
    }
  } finally {
    fs.closeSync(fd);
  }
});

test('batch preflight rejects unsafe sources while preserving the existing locked-format item path', () => {
  const unsafe = path.join(base, 'renamed.docx');
  fs.writeFileSync(unsafe, 'not an office file');
  const unsafeEntry = { name: path.basename(unsafe), full: unsafe, stat: fs.lstatSync(unsafe) };
  assert.throws(() => preflightSourceEnvelopes([unsafeEntry]), (error) => error.code === 'SOURCE_TYPE_MISMATCH');

  const locked = path.join(base, 'locked.pdf');
  fs.writeFileSync(locked, '%PDF-1.7\n%%EOF');
  const lockedEntry = { name: path.basename(locked), full: locked, stat: fs.lstatSync(locked) };
  assert.doesNotThrow(() => preflightSourceEnvelopes([lockedEntry]));
  assert.strictEqual(fs.readFileSync(unsafe, 'utf8'), 'not an office file');
  assert.strictEqual(fs.readFileSync(locked, 'utf8'), '%PDF-1.7\n%%EOF');
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
