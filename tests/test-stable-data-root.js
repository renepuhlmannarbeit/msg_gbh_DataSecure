'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { dataRoot, isClaudeTemporaryLocalData, stableWindowsLocalData } = require('../plugins/data-secure/server/runtime');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (error) { console.error(`  not ok ${name}`); throw error; }
}

const profile = 'C:\\Users\\synthetic';
const stable = path.win32.join(profile, 'AppData', 'Local');
const io = {
  lstatSync(candidate) {
    assert.strictEqual(candidate.toLowerCase(), stable.toLowerCase());
    return { isDirectory: () => true, isSymbolicLink: () => false };
  },
  realpathSync: Object.assign((candidate) => candidate, { native: (candidate) => candidate })
};

console.log('\nStable local product-data root');

test('ordinary Windows Local AppData remains unchanged', () => {
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: stable, USERPROFILE: profile }, profile, io), stable);
});

test('the disposable Claude TEMP projection resolves to the established user profile', () => {
  const temporary = path.win32.join(profile, 'AppData', 'Local', 'Temp', 'claude', 'local-agent-mode', 'session-1');
  assert.strictEqual(isClaudeTemporaryLocalData(temporary, 'win32'), true);
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: temporary, USERPROFILE: profile }, profile, io), stable);
});

test('the disposable Claude local-agent session projection resolves to the established user profile', () => {
  const temporary = path.win32.join(profile, 'AppData', 'Roaming', 'Claude', 'local-agent-mode-sessions', 'session-1');
  assert.strictEqual(isClaudeTemporaryLocalData(temporary, 'win32'), true);
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: temporary, USERPROFILE: profile }, profile, io), stable);
});

test('unrelated temporary and explicitly relocated paths are not rewritten', () => {
  const testRoot = 'D:\\isolated-tests\\localapp';
  const relocated = 'D:\\CompanyData\\Local';
  assert.strictEqual(isClaudeTemporaryLocalData(testRoot, 'win32'), false);
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: testRoot, USERPROFILE: profile }, profile, io), testRoot);
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: relocated, USERPROFILE: profile }, profile, io), relocated);
});

test('an unsafe user-profile destination never replaces the host path', () => {
  const temporary = path.win32.join(profile, 'AppData', 'Local', 'Temp', 'claude', 'session-2');
  const unsafeIo = {
    lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => true }),
    realpathSync: io.realpathSync
  };
  assert.strictEqual(stableWindowsLocalData({ LOCALAPPDATA: temporary, USERPROFILE: profile }, profile, unsafeIo), temporary);
});

test('an explicit product namespace must be absolute and is returned unchanged', () => {
  const previous = process.env.EU_PRIVACY_DATA_ROOT;
  try {
    process.env.EU_PRIVACY_DATA_ROOT = path.resolve('C:\\isolated-products\\standalone');
    assert.strictEqual(dataRoot(), path.resolve(process.env.EU_PRIVACY_DATA_ROOT));
    process.env.EU_PRIVACY_DATA_ROOT = 'relative-product-root';
    assert.throws(() => dataRoot(), /DATA_ROOT_UNSAFE/u);
  } finally {
    if (previous === undefined) delete process.env.EU_PRIVACY_DATA_ROOT;
    else process.env.EU_PRIVACY_DATA_ROOT = previous;
  }
});

console.log(`Stable local product-data root: ${passed} passed, 0 failed`);
