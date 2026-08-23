'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Installation-free runtime start matrix');
const root = path.join(__dirname, '..');
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'canonical', 'RUNTIME_START_MATRIX_V1.json'), 'utf8'));
const pluginMcp = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'data-secure', '.mcp.json'), 'utf8'));
const mcpb = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('matrix distinguishes the documented MCPB runtime from the unproven plugin host path', () => {
  assert.strictEqual(matrix.schema, 'datasecure-runtime-start-matrix/v1');
  const byId = new Map(matrix.paths.map((item) => [item.id, item]));
  assert.strictEqual(byId.get('desktop-extension-mcpb').runtime_evidence, 'official-built-in-node');
  assert.strictEqual(byId.get('plugin-zip-marketplace-desktop-cowork').status, 'no-go-until-observed');
  assert.notStrictEqual(byId.get('plugin-zip-claude-code').runtime_evidence, 'official-built-in-node');
});

test('the current packages use exactly the command whose fresh-host resolution remains under test', () => {
  assert.strictEqual(pluginMcp['data-secure-local'].command, 'node');
  assert.strictEqual(mcpb.server.mcp_config.command, 'node');
  assert.ok(matrix.paths.every((item) => item.command === 'node'));
});

test('no user install, online bootstrap, silent fallback or three-plugin workaround is allowed', () => {
  assert.strictEqual(matrix.user_runtime_install_required, false);
  for (const required of [
    'ask-user-to-install-node', 'runtime-npm-or-npx-download', 'silent-switch-to-mcpb',
    'three-user-visible-os-plugins', 'claim-plugin-runtime-from-mcpb-documentation'
  ]) assert.ok(matrix.forbidden_workarounds.includes(required));
});

test('SEA remains a target-bound spike until one-plugin dispatch and lifecycle are proven', () => {
  assert.strictEqual(matrix.fallback_spike.technology, 'node-sea');
  assert.strictEqual(matrix.fallback_spike.status, 'architecture-spike-only');
  for (const target of ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']) {
    assert.ok(matrix.fallback_spike.required_before_adoption.includes(`${target}-binary-and-hash`));
  }
  assert.ok(matrix.fallback_spike.required_before_adoption.includes('one-plugin-platform-dispatch-proof'));
  assert.ok(matrix.fallback_spike.required_before_adoption.includes('fresh-install-update-rollback'));
});

done();
