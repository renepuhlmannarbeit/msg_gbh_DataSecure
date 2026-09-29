'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  SOURCE_FOLDER_CANCELLED, sourceFolderPickerCommands, pickSourceFolder, enumerateSourceFolder, enumerateSourceFolderAsync
} = require('../plugins/data-secure/server/companion/source-folder');
const { batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');

const { test, testAsync, done, assert } = createSuite('Secure recursive source folder');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-source-folder-'));

function clean(name = 'input') {
  const target = path.join(base, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  return target;
}

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

async function main() {
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
