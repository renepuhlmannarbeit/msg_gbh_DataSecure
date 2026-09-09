'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const workflow = read('.github/workflows/standalone-linux-sandbox.yml');
const launch = read('tests/manual/standalone-native-linux-launch.sh');
const conversionWorker = read('tests/test-standalone-conversion-worker.mjs');
const conversionResolver = read('plugins/data-secure/server/standalone/conversion-runtime-resolver.js');
const target = JSON.parse(read('apps/datasecure-standalone/desktop-targets.json')).targets
  .find((item) => item.product_target === 'linux-x64-glibc');

assert.match(workflow, /^name: Manual Standalone Linux sandbox evidence$/mu);
assert.match(workflow, /^on:\n  workflow_dispatch:\n/mu);
assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/mu);
assert.match(workflow, /confirm_runner_minutes:[\s\S]*?default: false[\s\S]*?type: boolean/u);
assert.match(workflow, /if: \$\{\{ inputs\.confirm_runner_minutes == true \}\}/u);
assert.match(workflow, /runs-on: ubuntu-22\.04/u);
assert.match(workflow, /^permissions:\n  contents: read$/mu);
assert.match(workflow, /timeout-minutes: 45/u);
assert.doesNotMatch(workflow, /secrets\.|cache:/u);
for (const required of [
  'libwebkit2gtk-4.1-dev', 'node-v22.23.2-linux-x64.tar.gz',
  'b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a',
  'node scripts/prepare-standalone-runtime.mjs', 'npm run test:standalone',
  'cargo clippy --all-targets --locked -- -D warnings',
  'npx --no-install tauri build --bundles appimage', '--appimage-extract',
  "-path '*/server/standalone/desktop-sidecar.js'", '${#resource_markers[@]}',
  'standalone-native-linux-launch.sh', 'build-standalone-linux-package.mjs',
  'verify-standalone-linux-package.mjs', 'cmp "${archive}.first" "$archive"',
  'retention-days: 1', 'compression-level: 0'
]) assert.ok(workflow.includes(required), required);
assert.match(workflow, /uses: actions\/upload-artifact@[a-f0-9]{40}/u);
assert.doesNotMatch(workflow, /uses: [^\n]+@(?![a-f0-9]{40}(?:\s|$))/u);
for (const required of [
  'DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
  'AppRun', 'realpath -e', 'GDK_BACKEND=x11', 'WEBKIT_DISABLE_COMPOSITING_MODE=1',
  'Xvfb', 'dbus-launch', 'sidecar_started', 'service_initialized', 'xdotool',
  'STANDALONE_NATIVE_LINUX_ORPHANED_SIDECAR'
]) assert.ok(launch.includes(required), required);
assert.equal(target.minimum_glibc_version, '2.35');
assert.equal(target.distribution_format, 'appimage-in-zip');
assert.equal(target.start_guide, 'LINUX-START.md');
assert.match(conversionWorker,
  /process\.platform === 'linux' && process\.arch === 'x64' \? 'linux-x64-glibc' : null/u);
assert.match(conversionResolver,
  /process\.platform === 'linux' && process\.arch === 'x64' \? 'linux-x64-glibc' : null/u);

process.stdout.write('Standalone Linux manual sandbox workflow: PASS\n');
