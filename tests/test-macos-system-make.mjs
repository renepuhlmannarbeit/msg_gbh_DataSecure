// Actual build-only reader with explicit I/O models. Not native Mac proof.
import assert from 'node:assert/strict';
import bound from '../plugins/data-secure/server/core/bound-file-io.js';
import { readAppleSystemTool } from '../scripts/macos-static-core/system-tool-reader.mjs';
let checks = 0;
function scenario(change = () => {}) {
  const file = '/usr/bin/make', bytes = Buffer.from('model Apple system shim');
  const facts = new Map([file, '/usr/bin', '/usr', '/'].map(name => [name, {
    isSymbolicLink: () => false, isFile: () => name === file, isDirectory: () => name !== file,
    uid: 0n, mode: 0o755n, nlink: name === file ? 78n : 1n,
    dev: 1n, ino: name === file ? 2n : BigInt(name.length), birthtimeNs: 1n,
    mtimeNs: 2n, ctimeNs: 3n, size: BigInt(bytes.length)
  }]));
  const count = { open: 0, read: 0, close: 0 };
  const model = { platform: 'darwin', io: {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 0x100, O_NONBLOCK: 0x200 },
    lstatSync: name => facts.get(name), fstatSync: fd => { assert.equal(fd, 0); return facts.get(file); },
    openSync: (name, flags) => { assert.equal(name, file); assert.equal(flags, 0x300); count.open++; return 0; },
    readSync: (fd, target, offset, length, position) => {
      assert.equal(fd, 0); count.read++; const size = Math.min(length, 3);
      bytes.copy(target, offset, position, position + size); return size;
    },
    closeSync: fd => { assert.equal(fd, 0); count.close++; }
  }, bound: {
    ...bound, bindDirectory: directory => ({ directory }), assertDirectory: () => true
  } };
  const item = { file, bytes, facts, model, count }; change(item); return item;
}
const valid = scenario();
assert.deepEqual(readAppleSystemTool('make', valid.file, valid.model), valid.bytes); checks++;
assert.equal(valid.count.open, 1); assert.ok(valid.count.read > 1); assert.equal(valid.count.close, 1);
for (const file of ['/tmp/make', '/usr/bin/other', '/usr/bin/../bin/make']) {
  assert.throws(() => readAppleSystemTool('make', file, valid.model), { code: 'APPLE_SYSTEM_TOOL_ROLE_INVALID' }); checks++;
}
assert.throws(() => readAppleSystemTool('codesign', valid.file, valid.model), { code: 'APPLE_SYSTEM_TOOL_ROLE_INVALID' }); checks++;
assert.throws(() => readAppleSystemTool('make', valid.file, { ...valid.model, platform: 'win32' }), { code: 'APPLE_SYSTEM_TOOL_ROLE_INVALID' }); checks++;
for (const name of ['/usr/bin/make', '/usr/bin', '/usr', '/']) for (const mutation of [
  value => { value.uid = 501n; }, value => { value.mode = 0o775n; }, value => { value.mode = 0o757n; },
  value => { value.isSymbolicLink = () => true; },
  value => { if (name === '/usr/bin/make') value.isFile = () => false; else value.isDirectory = () => false; }
]) {
  const item = scenario(({ facts }) => mutation(facts.get(name)));
  assert.throws(() => readAppleSystemTool('make', item.file, item.model), { code: 'APPLE_SYSTEM_TOOL_UNSAFE' });
  assert.equal(item.count.open, 0); checks++;
}
for (const nlink of [0n, 1025n]) {
  const item = scenario(({ facts }) => { facts.get('/usr/bin/make').nlink = nlink; });
  assert.throws(() => readAppleSystemTool('make', item.file, item.model), { code: 'APPLE_SYSTEM_TOOL_UNSAFE' }); checks++;
}
for (const kind of ['link', 'inode', 'ctime', 'size', 'ancestor']) {
  const item = scenario(); const read = item.model.io.readSync;
  item.model.io.readSync = (...args) => {
    const result = read(...args), info = item.facts.get(item.file);
    if (kind === 'link') info.nlink = 79n;
    if (kind === 'inode') info.ino = 99n;
    if (kind === 'ctime') info.ctimeNs = 99n;
    if (kind === 'size') info.size = 99n;
    if (kind === 'ancestor') item.facts.get('/usr/bin').uid = 501n;
    return result;
  };
  assert.throws(() => readAppleSystemTool('make', item.file, item.model));
  assert.equal(item.count.close, 1); checks++;
}
const close = scenario(); close.model.io.closeSync = () => { close.count.close++; throw Error('close'); };
assert.throws(() => readAppleSystemTool('make', close.file, close.model), { code: 'APPLE_SYSTEM_TOOL_CLOSE_FAILED' });
assert.equal(close.count.close, 1); checks++;
const error = Error('primary');
const readFail = scenario(); readFail.model.io.readSync = () => { throw error; };
readFail.model.io.closeSync = () => { readFail.count.close++; throw Error('secondary'); };
assert.throws(() => readAppleSystemTool('make', readFail.file, readFail.model), actual => actual === error);
assert.equal(readFail.count.close, 1); checks++;
for (const primary of [null, undefined, false, 0]) {
  const item = scenario(); item.model.io.readSync = () => { throw primary; };
  item.model.io.closeSync = () => { item.count.close++; throw Error('secondary'); };
  let caught = false;
  try { readAppleSystemTool('make', item.file, item.model); }
  catch (actual) { caught = true; assert.equal(actual, primary); }
  assert.equal(caught, true); assert.equal(item.count.close, 1); checks++;
}
console.log('PASS '+ checks +' Apple system tool read-only role cases; native macOS NOT_RUN');
