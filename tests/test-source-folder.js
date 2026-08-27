'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  SOURCE_FOLDER_CANCELLED, sourceFolderPickerCommands, pickSourceFolder, enumerateSourceFolder
} = require('../plugins/data-secure/server/companion/source-folder');
const { batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');

const { test, done, assert } = createSuite('Secure recursive source folder');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-source-folder-'));

function clean(name = 'input') {
  const target = path.join(base, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  return target;
}

test('picker commands are shell-free native folder dialogs on Windows, macOS and Linux', () => {
  const windows = sourceFolderPickerCommands('win32', { SystemRoot: 'C:\\Windows' })[0];
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

test('nested supported files are deterministic and retain collision-free relative mapping labels', () => {
  const root = clean();
  fs.mkdirSync(path.join(root, 'a'));
  fs.mkdirSync(path.join(root, 'b'));
  fs.writeFileSync(path.join(root, 'b', 'same.txt'), 'B');
  fs.writeFileSync(path.join(root, 'a', 'same.txt'), 'A');
  fs.writeFileSync(path.join(root, 'ignored.exe'), 'not admitted');
  const selected = enumerateSourceFolder(root, { hasReparseComponent: () => false });
  assert.deepStrictEqual(selected.map((entry) => entry.sourceLabel), ['a/same.txt', 'b/same.txt']);
  const queue = batchQueueFromSelection(selected);
  assert.deepStrictEqual(queue.map((entry) => entry.name), ['same.txt', 'same.txt']);
  assert.deepStrictEqual(queue.map((entry) => entry.sourceLabel), ['a/same.txt', 'b/same.txt']);
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
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, maxSources: 1 }), /mehr als 1/iu);
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false, maxTotalBytes: 2 }), /größer als 500 MB/iu);
});

test('an empty or unsupported-only folder stops honestly', () => {
  const root = clean('empty');
  fs.writeFileSync(path.join(root, 'readme.exe'), 'x');
  assert.throws(() => enumerateSourceFolder(root, { hasReparseComponent: () => false }), /keine unterstützten Dateien/iu);
});

test('empty and relative roots never resolve implicitly to the process working directory', () => {
  assert.throws(() => enumerateSourceFolder('', { hasReparseComponent: () => false }), /nicht absolut/iu);
  assert.throws(() => enumerateSourceFolder('relative-folder', { hasReparseComponent: () => false }), /nicht absolut/iu);
});

done();
