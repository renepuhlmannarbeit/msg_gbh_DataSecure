'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, '.github', 'workflows', 'standalone-macos-sandbox.yml');
const workflow = fs.readFileSync(file, 'utf8');

assert.match(workflow, /^name: Manual Standalone macOS sandbox evidence$/mu);
assert.match(workflow, /^on:\n  workflow_dispatch:\n/mu);
assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/mu,
  'the paid private-repository macOS evidence must never run automatically');
assert.match(workflow, /confirm_private_runner_minutes:[\s\S]*?default: false[\s\S]*?type: boolean/u);
assert.match(workflow, /if: \$\{\{ inputs\.confirm_private_runner_minutes == true \}\}/u);
assert.match(workflow, /default: macos-arm64/u, 'the default must allocate only one target');
assert.match(workflow, /macos-15-intel/u);
assert.match(workflow, /macos-14/u);
assert.match(workflow, /^permissions:\n  contents: read$/mu);
assert.match(workflow, /timeout-minutes: 45/u);
assert.match(workflow, /cancel-in-progress: true/u);
assert.doesNotMatch(workflow, /upload-artifact|download-artifact|cache:/u,
  'the evidence run must not consume persistent Actions storage');
assert.doesNotMatch(workflow, /secrets\./u);
for (const expected of [
  'npm ci --ignore-scripts --no-audit --no-fund',
  'node native/ocr/pilot/fetch-models.mjs',
  'native/ocr/pilot/posix-sandbox.c',
  'tests/test-posix-supervisor-native.sh',
  'node scripts/build-runtime-target.mjs',
  'node scripts/prepare-standalone-runtime.mjs',
  'npm run test:standalone',
  'npm run test:standalone:conversion',
  'cargo clippy --all-targets --locked -- -D warnings',
  'cargo build --release --locked',
  'lipo -archs',
  'Human Gatekeeper, window, picker, VoiceOver and workflow UAT remain open.'
]) assert.ok(workflow.includes(expected), `workflow is missing required evidence step: ${expected}`);

assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/u);
assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/u);
assert.doesNotMatch(workflow, /uses: [^\n]+@(?![a-f0-9]{40}(?:\s|$))/u,
  'every third-party action must be pinned to an immutable commit');

process.stdout.write('Standalone macOS manual sandbox workflow: PASS\n');
