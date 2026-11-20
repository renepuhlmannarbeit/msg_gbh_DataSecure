'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  SOURCE_FOLDER_CANCELLED, sourceFolderPickerCommands, pickSourceFolder, enumerateSourceFolder, enumerateSourceFolderAsync
} = require('../plugins/data-secure/server/companion/source-folder');
const { batchQueueFromSelection, validateSelectedPath, validateSelectedPathAsync,
  sourceArtifactReason, sourceArtifactReasonAsync } = require('../plugins/data-secure/server/companion/file-picker');
const { reviewDocx, paragraph } = require('./lib/docx-review-fixtures');

const { test, testAsync, done, assert } = createSuite('Secure recursive source folder');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-source-folder-'));

function clean(name = 'input') {
  const target = path.join(base, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function dsStoreFixture() {
  const bytes = Buffer.alloc(8196);
  bytes.writeUInt32BE(1, 0); bytes.write('Bud1', 4);
  for (const position of [8, 16]) bytes.writeUInt32BE(2048, position);
  bytes.writeUInt32BE(2048, 12);
  const root = 2052;
  bytes.writeUInt32BE(2, root); bytes.writeUInt32BE(4096 | 5, root + 12);
  bytes.writeUInt32BE(1, root + 1032); bytes[root + 1036] = 4;
  bytes.write('DSDB', root + 1037); bytes.writeUInt32BE(1, root + 1041);
  bytes.writeUInt32BE(4096, 4096 + 20);
  return bytes;
}
function thumbsFixture(extraName = '1') {
  const bytes = Buffer.alloc(2048);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(bytes);
  bytes.writeUInt16LE(3, 26); bytes.writeUInt16LE(0xfffe, 28);
  bytes.writeUInt16LE(9, 30); bytes.writeUInt16LE(6, 32);
  bytes.writeUInt32LE(1, 44); bytes.writeUInt32LE(1, 48);
  bytes.writeUInt32LE(0, 76);
  bytes.fill(0xff, 512, 1024); bytes.writeUInt32LE(0xfffffffd, 512); bytes.writeUInt32LE(0xfffffffe, 516);
  for (const [index, name] of ['Root Entry', 'Catalog', extraName].entries()) {
    const cursor = 1024 + index * 128;
    bytes.write(name + '\0', cursor, 'utf16le'); bytes.writeUInt16LE((name.length + 1) * 2, cursor + 64);
    bytes[cursor + 66] = index === 0 ? 5 : 2;
  }
  return bytes;
}
testAsync('Standalone folder admission recognises bounded OS structures and reports names, never generic hidden files', async () => {
  const root = clean('os-metadata');
  fs.writeFileSync(path.join(root, 'Quelle.md'), 'Name: Anna Linden');
  const artifacts = { '.DS_Store': dsStoreFixture(), 'desktop.ini': Buffer.from('[.ShellClassInfo]\nIconResource=folder.ico,0\n'), 'Thumbs.db': thumbsFixture() };
  for (const [name, bytes] of Object.entries(artifacts)) fs.writeFileSync(path.join(root, name), bytes);
  const skipped = [];
  const opts = { productChannel: 'standalone', onIgnoredArtifact: (reason, name) => skipped.push([reason, name]) };
  assert.equal(enumerateSourceFolder(root, opts).length, 1);
  assert.deepEqual(skipped.map(item => item[1]).sort(), Object.keys(artifacts).sort());
  assert.ok(skipped.every(item => item[0] === 'os_folder_metadata'));
  skipped.length = 0;
  assert.equal((await enumerateSourceFolderAsync(root, opts)).length, 1);
  assert.equal(skipped.length, 3);
  assert.throws(() => enumerateSourceFolder(root), error => error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES', 'Cowork scope unchanged');
  const { metadataReason } = require('../plugins/data-secure/server/companion/folder-metadata');
  assert.equal(metadataReason('Thumbs.db', thumbsFixture('WordDocument')), null);
  for (const name of Object.keys(artifacts)) {
    assert.equal(metadataReason(name, Buffer.from('Name: Anna Linden')), null, 'a reserved filename is insufficient');
    fs.writeFileSync(path.join(root, name), 'Name: Anna Linden');
    await assert.rejects(() => enumerateSourceFolderAsync(root, opts), error =>
      error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES' && error.localUnsupportedFiles.includes(name));
    fs.writeFileSync(path.join(root, name), artifacts[name]);
  }
  fs.writeFileSync(path.join(root, '.private-notes'), 'Private original');
  assert.throws(() => enumerateSourceFolder(root, opts), error => error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES');
});

testAsync('malformed UTF-16 desktop.ini is reported instead of silently omitted', async () => {
  const root = clean('malformed-desktop-ini');
  fs.writeFileSync(path.join(root, 'Quelle.md'), 'Name: Anna Linden');
  const valid = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('[.ShellClassInfo]\nIconResource=folder.ico,0\n', 'utf16le')
  ]);
  const malformed = Buffer.concat([valid, Buffer.from([0x41])]);
  fs.writeFileSync(path.join(root, 'desktop.ini'), malformed);
  const { metadataReason } = require('../plugins/data-secure/server/local-ui/folder-metadata');
  assert.equal(metadataReason('desktop.ini', valid), 'os_folder_metadata');
  assert.equal(metadataReason('desktop.ini', malformed), null);
  const bePayload = Buffer.from(valid.subarray(2));
  bePayload.swap16();
  const validBe = Buffer.concat([Buffer.from([0xfe, 0xff]), bePayload]);
  assert.equal(metadataReason('desktop.ini', validBe), 'os_folder_metadata');
  assert.equal(metadataReason('desktop.ini', Buffer.concat([validBe, Buffer.from([0x41])])), null);
  const scalarText = '[.ShellClassInfo]\nIconResource=folder-😀.ico,0\n';
  const loneSurrogateText = '[.ShellClassInfo]\nIconResource=folder-' + String.fromCharCode(0xd800) + '.ico,0\n';
  for (const [bom, toBytes] of [
    [Buffer.from([0xff, 0xfe]), text => Buffer.from(text, 'utf16le')],
    [Buffer.from([0xfe, 0xff]), text => Buffer.from(text, 'utf16le').swap16()]
  ]) {
    assert.equal(metadataReason('desktop.ini', Buffer.concat([bom, toBytes(scalarText)])), 'os_folder_metadata');
    assert.equal(metadataReason('desktop.ini', Buffer.concat([bom, toBytes(loneSurrogateText)])), null);
  }
  for (const operation of [
    () => enumerateSourceFolder(root, { productChannel: 'standalone' }),
    () => enumerateSourceFolderAsync(root, { productChannel: 'standalone' })
  ]) {
    await assert.rejects(async () => operation(), error =>
      error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES' && error.localUnsupportedFiles.includes('desktop.ini'));
  }
});

test('picker commands are shell-free native folder dialogs on Windows, macOS and Linux', () => {
  const windows = sourceFolderPickerCommands('win32', { SystemRoot: 'C:\\Windows' })[0];
  // Explorer-style COM folder picker (IFileOpenDialog with FOS_PICKFOLDERS) with
  // the legacy tree dialog only as a fallback when the interop cannot compile.
  assert.match(windows.args.at(-1), /IFileOpenDialog[\s\S]*FolderPicker\]::Pick\(/u);
  assert.match(windows.args.at(-1), /if \(\$modern\)[\s\S]*else \{ \$dialog = New-Object System\.Windows\.Forms\.FolderBrowserDialog/u);
  assert.match(windows.args.at(-1), /FolderBrowserDialog/u);
  assert.strictEqual(windows.command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.strictEqual(sourceFolderPickerCommands('darwin')[0].command, '/usr/bin/osascript');
  assert.deepStrictEqual(sourceFolderPickerCommands('linux').map((entry) => entry.command), ['zenity', 'kdialog']);
});

test('folder selection cancellation is terminal and never falls back to another dialog', () => {
  let calls = 0;
  assert.throws(() => pickSourceFolder({
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    runner() { calls++; return { status: 0, stdout: SOURCE_FOLDER_CANCELLED }; }
  }), /abgebrochen/iu);
  assert.strictEqual(calls, 1);
});

test('source-folder picker never accepts partial stdout from a failed native helper', () => {
  const root = clean('partial-picker-output');
  assert.throws(() => pickSourceFolder({
    platform: 'linux',
    runner: () => ({ status: 2, stdout: root })
  }), /nicht sicher gelesen|nicht gestartet/iu);
});

test('nested supported files are deterministic and retain collision-free relative mapping labels', () => {
  const root = clean();
  fs.mkdirSync(path.join(root, 'a'));
  fs.mkdirSync(path.join(root, 'b'));
  fs.writeFileSync(path.join(root, 'b', 'same.txt'), 'B');
  fs.writeFileSync(path.join(root, 'a', 'same.txt'), 'A');
  const selected = enumerateSourceFolder(root, { hasReparseComponent: () => false });
  assert.deepStrictEqual(selected.map((entry) => path.basename(entry.sourcePath)), ['same.txt', 'same.txt']);
  assert.deepStrictEqual(selected.map((entry) => entry.sourceLabel), ['a/same.txt', 'b/same.txt']);
  assert.ok(selected.every((entry) => entry.treeOrder === undefined),
    'the folder walk retains only the root-relative label, not its sorting helper');
  const queue = batchQueueFromSelection(selected);
  assert.deepStrictEqual(queue.map((entry) => entry.name), ['same.txt', 'same.txt']);
  assert.deepStrictEqual(queue.map((entry) => entry.sourceLabel), ['a/same.txt', 'b/same.txt']);
});

test('unique basenames retain their root-relative folder structure', () => {
  const root = clean('unique-basenames');
  fs.mkdirSync(path.join(root, 'Erika Synthetisch (abgelehnt)'));
  fs.mkdirSync(path.join(root, 'Max Beispiel'));
  fs.writeFileSync(path.join(root, 'Erika Synthetisch (abgelehnt)', 'lebenslauf.txt'), 'A');
  fs.writeFileSync(path.join(root, 'Max Beispiel', 'anschreiben.txt'), 'B');
  const queue = batchQueueFromSelection(enumerateSourceFolder(root, { hasReparseComponent: () => false }));
  assert.deepStrictEqual(queue.map((entry) => entry.sourceLabel),
    ['Erika Synthetisch (abgelehnt)/lebenslauf.txt', 'Max Beispiel/anschreiben.txt']);
});

test('a mixed tree is rejected as a whole instead of silently selecting supported files', () => {
  const root = clean('mixed-formats');
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'contract.docx'), 'synthetic');
  fs.writeFileSync(path.join(root, 'nested', 'notes.txt'), 'synthetic');
  fs.writeFileSync(path.join(root, 'presentation.pptx'), 'synthetic');
  fs.writeFileSync(path.join(root, 'unknown.bin'), 'synthetic');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false }), (error) => {
    assert.strictEqual(error.code, 'SOURCE_FOLDER_UNSUPPORTED_FILES');
    assert.match(error.message, /4 reguläre Dateien, davon 2 nicht freigegebene oder unbekannte Formate/iu);
    assert.match(error.message, /kein Stapel gestartet/iu);
    assert.doesNotMatch(error.message, /contract|notes|presentation|unknown|\.pptx|\.bin/iu);
    assert.deepStrictEqual(error.localUnsupportedFiles, ['presentation.pptx', 'unknown.bin']);
    assert.strictEqual(error.localUnsupportedCount, 2);
    return true;
  });
});

test('all rejected supported files retain local relative labels and fixed reasons before admission', () => {
  const root = clean('named-supported-failures');
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'empty.txt'), '');
  fs.writeFileSync(path.join(root, 'valid.txt'), 'ok');
  fs.writeFileSync(path.join(root, 'nested', 'large.md'), 'too large');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, maxBytes: 3 }), error => {
    assert.strictEqual(error.code, 'SOURCE_SELECTION_REJECTED');
    assert.deepStrictEqual(error.localSelectionFiles, [
      { name: 'empty.txt', reason_code: 'SOURCE_FILE_EMPTY' },
      { name: 'nested/large.md', reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' }
    ]);
    assert.strictEqual(error.localSelectionCount, 2);
    assert.doesNotMatch(error.message, /empty|large|nested|\.txt|\.md/u);
    return true;
  });
});

test('file access denial is a fixed OS fact with a local basename, never a claimed antivirus cause', () => {
  const candidate = path.join(base, 'Private Name.pdf');
  assert.throws(() => validateSelectedPath(candidate, { hasReparseComponent: () => false,
    fs: { lstatSync: () => { throw Object.assign(new Error(`denied ${candidate}`), { code: 'EACCES' }); } } }), error => {
    assert.strictEqual(error.code, 'SOURCE_ACCESS_DENIED');
    assert.deepStrictEqual(error.localSelectionFiles, [{ name: 'Private Name.pdf', reason_code: 'SOURCE_ACCESS_DENIED' }]);
    assert.doesNotMatch(error.message, /Private Name|Antivirus|\\|\.pdf/u);
    return true;
  });
});

test('a blocked source folder retains its fixed OS access reason without inventing document failures', () => {
  const root = clean('blocked-read');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, fs: {
    lstatSync: fs.lstatSync.bind(fs),
    readdirSync: () => { throw Object.assign(new Error(`private folder ${root}`), { code: 'EACCES' }); }
  } }), error => {
    assert.strictEqual(error.code, 'SOURCE_ACCESS_DENIED');
    assert.equal(error.localSelectionFiles, undefined, 'a failed directory walk cannot know which document names are present');
    assert.doesNotMatch(error.message, /blocked-read|Antivirus/u);
    return true;
  });
});

test('known Office owner files are reported and skipped without weakening whole-tree validation', () => {
  const root = clean('office-owner-files');
  fs.mkdirSync(path.join(root, 'word'));
  fs.writeFileSync(path.join(root, 'word', '04-report.docx'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64)]));
  fs.writeFileSync(path.join(root, 'word', '~$-report.docx'), 'owner');
  fs.writeFileSync(path.join(root, 'word', '~$legitimate.docx'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(32)]));
  fs.writeFileSync(path.join(root, 'notes.txt'), 'synthetic notes');
  const ignored = [];
  const selected = enumerateSourceFolder(root, {
    hasReparseComponent: () => false,
    onIgnoredArtifact: (reason) => ignored.push(reason)
  });
  assert.deepStrictEqual(selected.map((entry) => entry.sourceLabel),
    ['notes.txt', 'word/~$legitimate.docx', 'word/04-report.docx']);
  assert.deepStrictEqual(ignored, ['office_owner_file']);
  fs.writeFileSync(path.join(root, '.private-backup'), 'must remain fail-closed');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false }),
    (error) => error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES');
});

test('any link or special traversal ambiguity rejects the whole tree before admission', () => {
  const root = clean('links');
  const outside = clean('outside');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  const link = path.join(root, 'linked');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => enumerateSourceFolder(root), /Link|Reparse/iu);
});

test('depth, entry, file-count and aggregate-byte limits fail before returning a partial queue', () => {
  const root = clean('limits');
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'one.txt'), '1');
  fs.writeFileSync(path.join(root, 'nested', 'two.txt'), '22');
  assert.throws(() => enumerateSourceFolder(root, {
    hasReparseComponent: () => false, treeLimits: { maxDirectories: 1, maxEntries: 10, maxDepth: 10 }
  }), /tief oder zu groß/iu);
  assert.throws(() => enumerateSourceFolder(root, {
    hasReparseComponent: () => false, treeLimits: { maxDirectories: 10, maxEntries: 1, maxDepth: 10 }
  }), /zu viele Dateisystemeinträge/iu);
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, maxSources: 1 }),
    (error) => error.code === 'SOURCE_FOLDER_FILE_LIMIT' && /mehr als 1/iu.test(error.message));
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, maxTotalBytes: 2 }),
    (error) => error.code === 'SOURCE_FOLDER_SIZE_LIMIT' && /größer als 500 MB/iu.test(error.message));
});

test('the product limit admits 200 recursively discovered files and rejects the 201st', () => {
  const root = clean('product-file-limit');
  for (let group = 0; group < 4; group++) {
    const directory = path.join(root, `gruppe-${group}`);
    fs.mkdirSync(directory);
    for (let index = 0; index < 50; index++) fs.writeFileSync(path.join(directory, `${index}.txt`), 'x');
  }
  assert.strictEqual(enumerateSourceFolder(root, { hasReparseComponent: () => false }).length, 200);
  fs.writeFileSync(path.join(root, 'gruppe-3', 'zusatz.txt'), 'x');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false }), (error) => {
    assert.strictEqual(error.code, 'SOURCE_FOLDER_FILE_LIMIT');
    assert.match(error.message, /mehr als 200/u);
    return true;
  });
});

test('an empty or unsupported-only folder stops honestly', () => {
  const root = clean('empty');
  fs.writeFileSync(path.join(root, 'readme.exe'), 'x');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false }), /1 reguläre Datei.*1 nicht freigegebene/iu);
});

test('empty and relative roots never resolve implicitly to the process working directory', () => {
  assert.throws(() => enumerateSourceFolder('', { hasReparseComponent: () => false }), /nicht absolut/iu);
  assert.throws(() => enumerateSourceFolder('relative-folder', { hasReparseComponent: () => false }), /nicht absolut/iu);
});

test('managed staging is excluded from both direct and recursive source intake without silent skipping', () => {
  const privacy = path.join(base, 'private-root');
  const stage = path.join(privacy, '.datasecure-staging', 'payloads', 'synthetic');
  fs.mkdirSync(stage, { recursive: true });
  const draft = path.join(stage, 'draft.md');
  fs.writeFileSync(draft, 'synthetic private draft');
  const originalEnv = process.env.EU_PRIVACY_ROOT;
  process.env.EU_PRIVACY_ROOT = privacy;
  try {
    const { validateSelectedPath } = require('../plugins/data-secure/server/companion/file-picker');
    assert.throws(() => validateSelectedPath(draft), /temporäre Ausgaben/u);
    assert.throws(() => enumerateSourceFolder(stage), /temporäre Ausgaben/u);
    assert.throws(() => enumerateSourceFolder(privacy), /temporäre Ausgaben/u);
    const sibling = path.join(privacy, '.datasecure-staging-originals');
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'original.txt'), 'synthetic original');
    assert.strictEqual(enumerateSourceFolder(sibling).length, 1);
    assert.strictEqual(fs.readFileSync(draft, 'utf8'), 'synthetic private draft');
  } finally {
    if (originalEnv === undefined) delete process.env.EU_PRIVACY_ROOT;
    else process.env.EU_PRIVACY_ROOT = originalEnv;
  }
});

test('the visible result tree cannot recursively become a source again', () => {
  const cowork = clean('cowork-source-overlap');
  const output = path.join(cowork, 'DataSecure-Output');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'Dokument-001-anonymisiert.md'), 'synthetic released result');
  const original = process.env.EU_PRIVACY_RESULT_ROOT;
  process.env.EU_PRIVACY_RESULT_ROOT = cowork;
  try {
    assert.throws(() => enumerateSourceFolder(cowork, { hasReparseComponent: () => false }), /DataSecure-Output|getrennten Ordner/iu);
    assert.throws(() => enumerateSourceFolder(output, { hasReparseComponent: () => false }), /DataSecure-Output|getrennten Ordner/iu);
  } finally {
    if (original === undefined) delete process.env.EU_PRIVACY_RESULT_ROOT;
    else process.env.EU_PRIVACY_RESULT_ROOT = original;
  }
});

test('a selected root replacement during listing rejects the complete synchronous queue', () => {
  const root = clean('sync-root-swap');
  const replacement = clean('sync-root-replacement');
  const parked = path.join(base, 'sync-root-original');
  fs.rmSync(parked, { recursive: true, force: true });
  fs.writeFileSync(path.join(root, 'expected.txt'), 'expected');
  fs.writeFileSync(path.join(replacement, 'unexpected.txt'), 'unexpected');
  const io = Object.create(fs);
  let swapped = false;
  io.readdirSync = (target, options) => {
    if (!swapped && path.resolve(target) === path.resolve(root)) {
      swapped = true;
      fs.renameSync(root, parked);
      fs.renameSync(replacement, root);
    }
    return fs.readdirSync(target, options);
  };
  assert.throws(() => enumerateSourceFolder(root, { fs: io, hasReparseComponent: () => false }), /verändert/iu);
  assert.strictEqual(swapped, true);
  assert.strictEqual(fs.readFileSync(path.join(parked, 'expected.txt'), 'utf8'), 'expected');
  assert.strictEqual(fs.readFileSync(path.join(root, 'unexpected.txt'), 'utf8'), 'unexpected');
});

// These models retain real open/read/stat/close operations. A close failure is
// injected only after a successful real close; it is not an OS leak claim.
function artifactIoModel(targetPath, options = {}) {
  const records = [], descriptors = new Map();
  const recordOpen = (candidate) => {
    const record = { target: path.resolve(candidate) === path.resolve(targetPath),
      reads: [], buffers: new Set(), closeAttempts: 0, closed: false };
    records.push(record);
    return record;
  };
  const beforeRead = (record, buffer, offset, length, position) => {
    record.buffers.add(buffer);
    record.reads.push({ offset, length, position });
    if (!record.target) return { length };
    if (options.failRead && record.reads.length > (options.afterReads ?? 0)) throw options.readError;
    if (Object.prototype.hasOwnProperty.call(options, 'invalidCount')) {
      return { invalid: true, count: options.invalidCount };
    }
    return { length: Math.min(length, options.chunk ?? Infinity) };
  };
  const syncIo = {
    ...fs,
    openSync(candidate, flags) {
      const descriptor = fs.openSync(candidate, flags);
      descriptors.set(descriptor, recordOpen(candidate));
      return descriptor;
    },
    fstatSync(descriptor) {
      if (descriptors.get(descriptor).target && options.failStat) throw options.statError;
      return fs.fstatSync(descriptor);
    },
    readSync(descriptor, buffer, offset, length, position) {
      const request = beforeRead(descriptors.get(descriptor), buffer, offset, length, position);
      return request.invalid ? request.count : fs.readSync(descriptor, buffer, offset, request.length, position);
    },
    closeSync(descriptor) {
      const record = descriptors.get(descriptor);
      record.closeAttempts++;
      fs.closeSync(descriptor);
      record.closed = true;
      descriptors.delete(descriptor);
      if (record.target && options.failClose) throw options.closeError;
    }
  };
  const asyncIo = {
    ...fs.promises,
    async open(candidate, flags) {
      const handle = await fs.promises.open(candidate, flags);
      const record = recordOpen(candidate);
      return {
        async stat() {
          if (record.target && options.failStat) throw options.statError;
          return handle.stat();
        },
        async read(buffer, offset, length, position) {
          const request = beforeRead(record, buffer, offset, length, position);
          return request.invalid ? { bytesRead: request.count, buffer }
            : handle.read(buffer, offset, request.length, position);
        },
        async close() {
          record.closeAttempts++;
          await handle.close();
          record.closed = true;
          if (record.target && options.failClose) throw options.closeError;
        }
      };
    }
  };
  return { fs: syncIo, fsPromises: asyncIo, records,
    assertClosed() {
      assert.ok(records.every(record => record.closed && record.closeAttempts === 1),
        'every successfully opened owned descriptor has exactly one real close attempt');
    },
    assertZeroed() {
      assert.ok(records.filter(record => record.target).every(record =>
        [...record.buffers].every(buffer => buffer.every(byte => byte === 0))),
      'metadata buffers are zeroed before either primary or close-only failure escapes');
    }
  };
}

async function expectExactArtifactFailure(operation, expected) {
  let failed = false, actual;
  try { await operation(); }
  catch (error) { failed = true; actual = error; }
  assert.strictEqual(failed, true, 'an IO failure must not become null or a successful descriptor');
  assert.strictEqual(actual, expected, 'the first thrown value wins, including falsy values');
}

async function main() {
  await testAsync('short owned prefix reads preserve a real small OPC document in direct and recursive admission', async () => {
    const root = clean('short-owner-prefix');
    const source = path.join(root, '~$-report.docx');
    const sibling = path.join(root, '04-report.docx');
    const original = reviewDocx(paragraph('PRIVATE_OWNER_NAME_SOURCE'));
    const control = reviewDocx(paragraph('PRIVATE_SIBLING_CONTROL '.repeat(100)));
    assert.ok(original.length < 8192 && control.length > original.length);
    fs.writeFileSync(source, original); fs.writeFileSync(sibling, control);
    for (const chunk of [1, 2, 3]) {
      for (const operation of ['reasonSync', 'reasonAsync', 'fileSync', 'fileAsync', 'folderSync', 'folderAsync']) {
        const model = artifactIoModel(source, { chunk });
        const options = { fs: model.fs, fsPromises: model.fsPromises, productChannel: 'standalone', allowedTypes: ['docx'] };
        if (operation === 'reasonSync') assert.strictEqual(sourceArtifactReason(source, options), null);
        else if (operation === 'reasonAsync') assert.strictEqual(await sourceArtifactReasonAsync(source, options), null);
        else if (operation === 'fileSync') assert.strictEqual(validateSelectedPath(source, options).sourcePath, source);
        else if (operation === 'fileAsync') assert.strictEqual((await validateSelectedPathAsync(source, options)).sourcePath, source);
        else {
          const ignored = [];
          const selection = operation === 'folderSync'
            ? enumerateSourceFolder(root, { ...options, onIgnoredArtifact: reason => ignored.push(reason) })
            : await enumerateSourceFolderAsync(root, { ...options, onIgnoredArtifact: reason => ignored.push(reason) });
          assert.deepStrictEqual(selection.map(item => item.sourcePath).sort(), [source, sibling].sort());
          assert.deepStrictEqual(ignored, [], 'a genuine OPC source is not an Office owner artifact');
        }
        const targetRecords = model.records.filter(record => record.target);
        assert.ok(targetRecords.length > 0, 'the actual existing prefix reader was reached');
        for (const record of targetRecords) {
          assert.strictEqual(record.reads.length, Math.ceil(4 / chunk));
          assert.deepStrictEqual(record.reads.map(request => request.position), chunk === 1 ? [0, 1, 2, 3] : [0, chunk]);
          assert.deepStrictEqual(record.reads.map(request => request.offset), record.reads.map(request => request.position));
        }
        model.assertClosed();
        assert.deepStrictEqual(fs.readFileSync(source), original);
        assert.deepStrictEqual(fs.readFileSync(sibling), control);
      }
    }
  });
  await testAsync('true short non-OPC owner records reach EOF once and retain their existing classification', async () => {
    const root = clean('short-owner-eof');
    const source = path.join(root, '~$-report.docx'), sibling = path.join(root, '04-report.docx');
    const original = Buffer.from('PK');
    fs.writeFileSync(source, original); fs.writeFileSync(sibling, reviewDocx(paragraph('SIBLING_CONTROL')));
    for (const asynchronous of [false, true]) {
      const model = artifactIoModel(source, { chunk: 1 });
      const options = { fs: model.fs, fsPromises: model.fsPromises };
      assert.strictEqual(asynchronous ? await sourceArtifactReasonAsync(source, options)
        : sourceArtifactReason(source, options), 'office_owner_file');
      assert.deepStrictEqual(model.records.find(record => record.target).reads.map(request => request.position), [0, 1, 2]);
      model.assertClosed(); assert.deepStrictEqual(fs.readFileSync(source), original);
    }
  });
  await testAsync('invalid prefix read counts remain fail-closed and cannot spin or classify the file as harmless', async () => {
    const root = clean('invalid-owner-read-count');
    const source = path.join(root, '~$-report.docx');
    const original = reviewDocx(paragraph('SOURCE_CONTROL')); fs.writeFileSync(source, original);
    for (const invalidCount of [-1, 0.5, NaN, 5]) for (const asynchronous of [false, true]) {
      const model = artifactIoModel(source, { invalidCount });
      const options = { fs: model.fs, fsPromises: model.fsPromises };
      await assert.rejects(async () => asynchronous ? sourceArtifactReasonAsync(source, options)
        : sourceArtifactReason(source, options), /lokale Datei konnte nicht sicher gelesen werden/u);
      assert.strictEqual(model.records.length, 1); assert.strictEqual(model.records[0].reads.length, 1);
      model.assertClosed(); assert.deepStrictEqual(fs.readFileSync(source), original);
    }
  });
  await testAsync('prefix and metadata readers preserve the first error and close each owned handle once', async () => {
    const root = clean('artifact-primary-close');
    const sources = {
      prefix: path.join(root, '~$-report.docx'), metadata: path.join(root, 'desktop.ini')
    };
    const originals = {
      prefix: reviewDocx(paragraph('SOURCE_CONTROL')),
      metadata: Buffer.from('[.ShellClassInfo]\nIconResource=folder.ico,0\n')
    };
    for (const kind of Object.keys(sources)) fs.writeFileSync(sources[kind], originals[kind]);
    const primaries = [Object.assign(new Error('synthetic primary IO failure'), { code: 'EIO' }), undefined, null, false, 0, ''];
    for (const kind of ['metadata', 'prefix']) for (const asynchronous of [false, true]) {
      for (const phase of kind === 'metadata' ? ['read', 'stat'] : ['read']) for (const primary of primaries) {
        const closeError = Object.assign(new Error('synthetic post-close failure'), { code: 'EPERM' });
        const model = artifactIoModel(sources[kind], { chunk: 1, failRead: phase === 'read',
          afterReads: 1, readError: primary, failStat: phase === 'stat', statError: primary,
          failClose: true, closeError });
        const options = { fs: model.fs, fsPromises: model.fsPromises, productChannel: 'standalone' };
        await expectExactArtifactFailure(() => asynchronous ? sourceArtifactReasonAsync(sources[kind], options)
          : sourceArtifactReason(sources[kind], options), primary);
        assert.strictEqual(model.records.length, 1); model.assertClosed();
        if (phase === 'read') assert.strictEqual(model.records[0].reads.length, 2, 'one real nonempty read preceded the injected primary');
        if (kind === 'metadata') model.assertZeroed();
        assert.deepStrictEqual(fs.readFileSync(sources[kind]), originals[kind]);
      }
    }
  });
  await testAsync('close-only failures remain refusals after successful prefix or metadata reads including null classification', async () => {
    const root = clean('artifact-close-only');
    for (const [kind, name, original] of [
      ['prefix', '~$-report.docx', reviewDocx(paragraph('SOURCE_CONTROL'))],
      ['metadata', 'desktop.ini', Buffer.from('[.ShellClassInfo]\nIconResource=folder.ico,0\n')],
      ['metadata', 'desktop.ini', Buffer.from('ordinary user text, not OS metadata')]
    ]) {
      const source = path.join(root, name); fs.writeFileSync(source, original);
      for (const asynchronous of [false, true]) for (const closeError of [new Error('post-close only'), undefined, null, false, 0, '']) {
        const model = artifactIoModel(source, { failClose: true, closeError });
        const options = { fs: model.fs, fsPromises: model.fsPromises, productChannel: 'standalone' };
        await expectExactArtifactFailure(() => asynchronous ? sourceArtifactReasonAsync(source, options)
          : sourceArtifactReason(source, options), closeError);
        assert.strictEqual(model.records.length, 1); model.assertClosed();
        if (kind === 'metadata') model.assertZeroed();
        assert.deepStrictEqual(fs.readFileSync(source), original);
      }
    }
  });
  await testAsync('metadata recognition and unknown-file refusal retain their scope after close handling changes', async () => {
    const root = clean('artifact-recognition-control');
    const source = path.join(root, 'desktop.ini');
    for (const [original, expected] of [
      [Buffer.from('[.ShellClassInfo]\nIconResource=folder.ico,0\n'), 'os_folder_metadata'],
      [Buffer.from('ordinary user text, not OS metadata'), null]
    ]) {
      fs.writeFileSync(source, original);
      for (const asynchronous of [false, true]) {
        const model = artifactIoModel(source, { chunk: 3 });
        const options = { fs: model.fs, fsPromises: model.fsPromises, productChannel: 'standalone' };
        assert.strictEqual(asynchronous ? await sourceArtifactReasonAsync(source, options)
          : sourceArtifactReason(source, options), expected);
        assert.strictEqual(model.records.length, 1); model.assertClosed(); model.assertZeroed();
        assert.deepStrictEqual(fs.readFileSync(source), original);
        if (expected === null) await assert.rejects(() => enumerateSourceFolderAsync(root,
          { productChannel: 'standalone', allowedTypes: ['docx'] }), error => error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES');
        const outsideScope = artifactIoModel(source);
        assert.strictEqual(asynchronous ? await sourceArtifactReasonAsync(source,
          { fs: outsideScope.fs, fsPromises: outsideScope.fsPromises })
          : sourceArtifactReason(source, { fs: outsideScope.fs }), null);
        assert.strictEqual(outsideScope.records.length, 0, 'non-Standalone scope does not read or newly ignore metadata');
      }
    }
  });
  await testAsync('async folder admission enumerates every rejected supported file without returning a partial queue', async () => {
    const root = clean('async-named-supported-failures');
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'empty.md'), '');
    fs.writeFileSync(path.join(root, 'nested', 'large.txt'), 'too large');
    await assert.rejects(() => enumerateSourceFolderAsync(root, {
      hasReparseComponentAsync: async () => false, maxBytes: 3
    }), error => {
      assert.strictEqual(error.code, 'SOURCE_SELECTION_REJECTED');
      assert.deepStrictEqual(error.localSelectionFiles, [
        { name: 'empty.md', reason_code: 'SOURCE_FILE_EMPTY' },
        { name: 'nested/large.txt', reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' }
      ]);
      assert.strictEqual(error.localSelectionCount, 2);
      return true;
    });
    await assert.rejects(() => validateSelectedPathAsync(path.join(root, 'missing.txt'), {
      hasReparseComponentAsync: async () => false
    }), error => error.code === 'SOURCE_READ_FAILED' && error.localSelectionFiles[0].name === 'missing.txt');
  });
  await testAsync('async admission reads files below a root containing only subfolders', async () => {
    const root = clean('async-subfolders-only');
    fs.mkdirSync(path.join(root, 'one'));
    fs.mkdirSync(path.join(root, 'two'));
    fs.writeFileSync(path.join(root, 'one', 'first.txt'), 'synthetic first');
    fs.writeFileSync(path.join(root, 'two', 'second.txt'), 'synthetic second');
    const selected = await enumerateSourceFolderAsync(root, {
      hasReparseComponentAsync: async () => false
    });
    assert.deepStrictEqual(selected.map((entry) => entry.sourceLabel),
      ['one/first.txt', 'two/second.txt']);
  });
  await testAsync('an oversized nested source rejects the whole folder with a public error code', async () => {
    const root = clean('async-nested-format-limit');
    fs.mkdirSync(path.join(root, 'one'));
    fs.mkdirSync(path.join(root, 'two'));
    fs.writeFileSync(path.join(root, 'one', 'small.txt'), 'a');
    fs.writeFileSync(path.join(root, 'two', 'large.txt'), 'ab');
    await assert.rejects(() => enumerateSourceFolderAsync(root, {
      maxBytes: 1, hasReparseComponentAsync: async () => false
    }), (error) => error.code === 'SOURCE_FORMAT_SIZE_LIMIT');
  });
  await testAsync('async recursion also rejects the configured visible result tree', async () => {
    const cowork = clean('cowork-source-overlap-async');
    const output = path.join(cowork, 'DataSecure-Output');
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, 'Dokument-001-anonymisiert.md'), 'synthetic released result');
    const original = process.env.EU_PRIVACY_RESULT_ROOT;
    process.env.EU_PRIVACY_RESULT_ROOT = cowork;
    try {
      await assert.rejects(() => enumerateSourceFolderAsync(cowork, {
        hasReparseComponentAsync: async () => false
      }), /DataSecure-Output|getrennten Ordner/iu);
    } finally {
      if (original === undefined) delete process.env.EU_PRIVACY_RESULT_ROOT;
      else process.env.EU_PRIVACY_RESULT_ROOT = original;
    }
  });
  await testAsync('normal Cowork folder enumeration yields and honours cancellation without returning a partial queue', async () => {
    const root = clean('async-cancel');
    for (let index = 0; index < 40; index++) fs.writeFileSync(path.join(root, `${index}.txt`), 'synthetic');
    const controller = new AbortController();
    let yields = 0;
    await assert.rejects(() => enumerateSourceFolderAsync(root, {
      signal: controller.signal,
      hasReparseComponent: () => false,
      yieldEvery: 4,
      yieldControl: async () => { yields++; controller.abort(); }
    }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
    assert.strictEqual(yields, 1);
  });
  await testAsync('async enumeration also rejects a mixed tree without returning a supported subset', async () => {
    const root = clean('async-mixed-formats');
    fs.writeFileSync(path.join(root, 'supported.md'), 'synthetic');
    fs.writeFileSync(path.join(root, 'blocked.pdf'), 'synthetic');
    await assert.rejects(() => enumerateSourceFolderAsync(root, {
      hasReparseComponentAsync: async () => false
    }), (error) => {
      assert.strictEqual(error.code, 'SOURCE_FOLDER_UNSUPPORTED_FILES');
      assert.match(error.message, /2 reguläre Dateien, davon 1 nicht freigegebene oder unbekannte Formate/iu);
      assert.doesNotMatch(error.message, /supported|blocked|\.md|\.pdf/iu);
      assert.deepStrictEqual(error.localUnsupportedFiles, ['blocked.pdf']);
      assert.strictEqual(error.localUnsupportedCount, 1);
      return true;
    });
  });
  await testAsync('async recursive intake excludes Office owner files and exposes only a bounded reason', async () => {
    const root = clean('async-office-owner-file');
    fs.writeFileSync(path.join(root, '04-workbook.xlsx'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64)]));
    fs.writeFileSync(path.join(root, '~$-workbook.xlsx'), 'owner');
    const ignored = [];
    const selected = await enumerateSourceFolderAsync(root, {
      allowedTypes: ['xlsx'], hasReparseComponentAsync: async () => false,
      onIgnoredArtifact: (reason) => ignored.push(reason)
    });
    assert.deepStrictEqual(selected.map((entry) => entry.sourceLabel), ['04-workbook.xlsx']);
    assert.deepStrictEqual(ignored, ['office_owner_file']);
  });
  await testAsync('only the explicit Standalone catalogue admits a mixed tree and names each regular rejection', async () => {
    const root = clean('async-standalone-catalogue');
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'nested', 'supported.md'), 'synthetic');
    fs.writeFileSync(path.join(root, 'nested', 'empty.txt'), '');
    fs.writeFileSync(path.join(root, 'archive.zip'), 'synthetic');
    const rejected = [], options = { catalogue: true, onRejectedSource: item => rejected.push(item), hasReparseComponentAsync: async () => false };
    await assert.rejects(enumerateSourceFolderAsync(root, options), error => error.code === 'SOURCE_FOLDER_UNSUPPORTED_FILES');
    assert.strictEqual(rejected.length, 0, 'Cowork does not opt into a partial admission');
    const selected = await enumerateSourceFolderAsync(root, { ...options, productChannel: 'standalone' });
    assert.deepStrictEqual(selected.map(item => item.sourceLabel), ['nested/supported.md']);
    assert.deepStrictEqual(rejected.map(({ full, ...item }) => item), [
      { name: 'archive.zip', reason_code: 'SOURCE_FORMAT_UNSUPPORTED' },
      { name: 'nested/empty.txt', reason_code: 'SOURCE_FILE_EMPTY' }
    ]);
    assert.ok(rejected.every(item => path.isAbsolute(item.full)));
  });
  await testAsync('Standalone catalogue can display an unsupported-only folder without a runnable queue', async () => {
    const root = clean('async-catalogue-no-eligible'); fs.writeFileSync(path.join(root, 'archive.zip'), 'synthetic');
    const rejected = [];
    assert.deepStrictEqual(await enumerateSourceFolderAsync(root, { productChannel: 'standalone', catalogue: true,
      onRejectedSource: item => rejected.push(item), hasReparseComponentAsync: async () => false }), []);
    assert.strictEqual(rejected[0].name, 'archive.zip');
  });
  await testAsync('metadata discovery can exceed the batch count without changing strict admission', async () => {
    const root = clean('async-catalogue-201');
    for (let index = 0; index < 201; index++) fs.writeFileSync(path.join(root, `${index}.txt`), 'synthetic');
    await assert.rejects(enumerateSourceFolderAsync(root, { productChannel: 'standalone',
      hasReparseComponentAsync: async () => false }), error => error.code === 'SOURCE_FOLDER_FILE_LIMIT');
    const selected = await enumerateSourceFolderAsync(root, { productChannel: 'standalone', catalogue: true,
      maxSources: 1000, maxTotalBytes: Number.MAX_SAFE_INTEGER,
      onRejectedSource() {}, hasReparseComponentAsync: async () => false });
    assert.strictEqual(selected.length, 201);
    assert.strictEqual(fs.readFileSync(path.join(root, '200.txt'), 'utf8'), 'synthetic');
  });
  await testAsync('larger bounded Standalone catalogues name all unsupported files, never a silent truncated subset', async () => {
    const root = clean('async-catalogue-201-unsupported');
    for (let index = 0; index < 201; index++) fs.writeFileSync(path.join(root, `${index}.zip`), 'synthetic');
    const rejected = [];
    assert.deepStrictEqual(await enumerateSourceFolderAsync(root, { productChannel: 'standalone', catalogue: true,
      maxSources: 1000, onRejectedSource: item => rejected.push(item), hasReparseComponentAsync: async () => false }), []);
    assert.strictEqual(rejected.length, 201); assert.strictEqual(new Set(rejected.map(item => item.name)).size, 201);
  });
  await testAsync('a selected root replacement during async listing rejects the complete queue', async () => {
    const root = clean('async-root-swap');
    const replacement = clean('async-root-replacement');
    const parked = path.join(base, 'async-root-original');
    fs.rmSync(parked, { recursive: true, force: true });
    fs.writeFileSync(path.join(root, 'expected.txt'), 'expected');
    fs.writeFileSync(path.join(replacement, 'unexpected.txt'), 'unexpected');
    let swapped = false;
    const fsPromises = {
      lstat: (...args) => fs.promises.lstat(...args),
      readdir: async (target, options) => {
        if (!swapped && path.resolve(target) === path.resolve(root)) {
          swapped = true;
          await fs.promises.rename(root, parked);
          await fs.promises.rename(replacement, root);
        }
        return fs.promises.readdir(target, options);
      }
    };
    await assert.rejects(() => enumerateSourceFolderAsync(root, {
      fsPromises, hasReparseComponentAsync: async () => false
    }), /verändert/iu);
    assert.strictEqual(swapped, true);
    assert.strictEqual(fs.readFileSync(path.join(parked, 'expected.txt'), 'utf8'), 'expected');
    assert.strictEqual(fs.readFileSync(path.join(root, 'unexpected.txt'), 'utf8'), 'unexpected');
  });
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
