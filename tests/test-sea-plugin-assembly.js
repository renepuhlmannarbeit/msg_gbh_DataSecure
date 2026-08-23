'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Self-contained plugin assembly gate');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'build-sea-plugin.mjs'), 'utf8');

test('assembly requires every target binary plus build and real MCP evidence', () => {
  assert.match(source, /for \(const target of contract\.targets\)/);
  assert.match(source, /\.evidence\.json/);
  assert.match(source, /\.mcp-evidence\.json/);
  assert.match(source, /SEA_TARGET_MISSING/);
  assert.match(source, /SEA_TARGET_ARCH_MISMATCH/);
  assert.match(source, /readUInt16LE\(pe \+ 4\) === 0x8664/);
  assert.match(source, /readUInt16LE\(18\) === 0x3e/);
  assert.match(source, /0x0100000c : 0x01000007/);
  assert.match(source, /mcp\.launcher_sha256 !== digest/);
  assert.match(source, /build\.sha256 !== digest/);
});

test('assembly changes only a temporary stage and keeps its release switch false', () => {
  assert.match(source, /\.sea-plugin-stage/);
  assert.match(source, /fs\.cpSync\(source, stage/);
  assert.match(source, /mcp\['data-secure-local'\]\.command = contract\.plugin_command/);
  assert.match(source, /release_enabled: false/);
  assert.match(source, /fs\.rmSync\(stage/);
});

test('assembly contains no network bootstrap or shell execution path', () => {
  assert.doesNotMatch(source, /https?:|fetch\(|curl|wget|npm|npx|execSync|spawnSync/i);
});

test('an incomplete launcher directory fails before creating an archive', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-sea-empty-'));
  try {
    const result = childProcess.spawnSync(process.execPath,
      [path.join(root, 'scripts', 'build-sea-plugin.mjs'), '--launchers', empty],
      { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /SEA_TARGET_MISSING:windows-x64/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

done();
