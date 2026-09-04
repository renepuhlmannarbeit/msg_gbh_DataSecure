'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

test('standalone package build uses pinned runtime and a closed resource projection', () => {
  const prepare = fs.readFileSync(path.join(root, 'scripts', 'prepare-standalone-runtime.mjs'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-standalone-package.mjs'), 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'tauri.conf.json')));
  assert.doesNotMatch(prepare, /process\.execPath/u);
  assert.match(prepare, /verifyTargetEvidence/u);
  assert.equal(config.bundle.resources['generated-runtime/server'], 'server');
  assert.doesNotMatch(JSON.stringify(config.bundle.resources), /plugins\/data-secure\/server/u);
  assert.match(build, /engineering_pilot/u);
  assert.match(build, /requires_webview2: true/u);
  assert.match(build, /writeStandaloneRuntime/u);
  assert.doesNotMatch(build, /copyTree\([^\n]*generated-runtime/u);
  const toolchain = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
    'tauri-contract', 'rust-toolchain.toml'), 'utf8');
  assert.match(toolchain, /channel\s*=\s*"1\.98\.1"/u);
  assert.match(toolchain, /components\s*=\s*\["clippy", "rustfmt"\]/u);
});

test('release runtime lookup cannot fall back to the developer checkout', () => {
  const source = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'src', 'main.rs'), 'utf8');
  assert.match(source, /if cfg!\(debug_assertions\)/u);
  const releaseCandidates = source.slice(source.indexOf('fn runtime_paths'), source.indexOf('fn spawn_sidecar'));
  assert.match(releaseCandidates, /resource\.join\(target\)/u);
  assert.match(source, /--require=\{\}/u);
});
