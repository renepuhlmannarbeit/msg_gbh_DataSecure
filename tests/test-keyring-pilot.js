'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Keyring pilot contract');
const pilot = path.join(__dirname, '..', 'native', 'keyring', 'pilot');
const packageJson = JSON.parse(fs.readFileSync(path.join(pilot, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(pilot, 'package-lock.json'), 'utf8'));

test('pilot pins the native keyring package and every target artifact', () => {
  assert.deepStrictEqual(packageJson.dependencies, { '@napi-rs/keyring': '1.3.0' });
  assert.strictEqual(lock.lockfileVersion, 3);
  const root = lock.packages['node_modules/@napi-rs/keyring'];
  assert.match(root.integrity, /^sha512-/u);
  for (const name of [
    '@napi-rs/keyring-win32-x64-msvc', '@napi-rs/keyring-darwin-x64',
    '@napi-rs/keyring-darwin-arm64', '@napi-rs/keyring-linux-x64-gnu',
    '@napi-rs/keyring-linux-x64-musl'
  ]) {
    const item = lock.packages[`node_modules/${name}`];
    assert.strictEqual(item.version, '1.3.0', `${name} version`);
    assert.match(item.integrity, /^sha512-/u, `${name} integrity`);
    assert.strictEqual(item.license, 'MIT', `${name} license`);
  }
});

test('pilot output is a fixed content-free result shape', () => {
  const source = fs.readFileSync(path.join(pilot, 'run.mjs'), 'utf8');
  assert.match(source, /new Entry\(service, account\)/u);
  assert.match(source, /setPassword\(secret\)/u);
  assert.match(source, /getPassword\(\)/u);
  assert.match(source, /deletePassword\(\)/u);
  assert.doesNotMatch(source, /console\.log|process\.env|writeFile|readFile|child_process/iu);
  assert.match(source, /raw_secret_emitted: false/u);
});

test('an explicitly requested local smoke test emits no secret or account', () => {
  if (process.env.RUN_KEYRING_PILOT !== '1') return;
  const result = childProcess.spawnSync(process.execPath, ['run.mjs'], {
    cwd: pilot, encoding: 'utf8', env: { PATH: process.env.PATH || '' }, shell: false, timeout: 30_000
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.deepStrictEqual(output, {
    schema: 'datasecure-keyring-pilot/v1', ok: true, operations: ['set', 'get', 'delete'],
    secret_bytes: 32, raw_secret_emitted: false
  });
});

done();
