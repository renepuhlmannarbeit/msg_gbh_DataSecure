'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, '.github', 'workflows', 'standalone-macos-sandbox.yml');
const workflow = fs.readFileSync(file, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const macosLaunch = fs.readFileSync(path.join(root, 'tests', 'manual', 'standalone-native-macos-launch.sh'), 'utf8');
const coreJitEntitlements = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
  'tauri-contract', 'macos-core-jit.entitlements.plist'), 'utf8');

for (const regression of ['test-bound-file-io.js', 'test-retention.js', 'test-status-app-server.js',
  'test-status-app-artifacts.mjs', 'test-sea-source-evidence.mjs']) {
  assert.ok(packageJson.scripts['test:standalone'].includes(`node tests/${regression}`),
    `the target-platform release gate must execute the I/O regression: ${regression}`);
}
assert.ok(packageJson.scripts['pretest:standalone'].includes('node tests/test-standalone-pause.js'),
  'the platform entry must run the durable pause regression, not only the general product suite');
assert.ok(packageJson.scripts['pretest:standalone'].includes('npm run test:standalone:documents'));
for (const regression of ['test-standalone-document-review.js', 'test-standalone-document-review-frontend.js']) {
  assert.ok(packageJson.scripts['test:standalone:documents'].includes(`node tests/${regression}`),
    `the platform entry must execute document approval/export regression: ${regression}`);
}

assert.match(workflow, /^name: Manual Standalone macOS sandbox evidence$/mu);
assert.match(workflow, /^on:\n  workflow_dispatch:\n/mu);
assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/mu,
  'the paid private-repository macOS evidence must never run automatically');
assert.match(workflow, /confirm_private_runner_minutes:[\s\S]*?default: false[\s\S]*?type: boolean/u);
assert.match(workflow, /upload_package:[\s\S]*?default: false[\s\S]*?type: boolean/u);
assert.match(workflow, /if: \$\{\{ inputs\.confirm_private_runner_minutes == true \}\}/u);
assert.match(workflow, /default: macos-arm64/u, 'the default must allocate only one target');
assert.match(workflow, /macos-15-intel/u);
assert.match(workflow, /macos-14/u);
assert.match(workflow, /macos-arm64-26/u);
assert.match(workflow, /macos-26/u);
assert.match(workflow, /standalone-macos-regular-start\.sh/u);
assert.match(workflow, /find "\$bundle\/Contents\/Resources\/server" -type d ! -perm -005/u);
assert.match(workflow, /find "\$bundle\/Contents\/Resources\/server" -type f ! -perm -004/u);
const regularLaunch = fs.readFileSync(path.join(root, 'tests', 'manual', 'standalone-macos-regular-start.sh'), 'utf8');
const launchServices = fs.readFileSync(path.join(root, 'tests', 'helpers', 'macos-launch-services.swift'), 'utf8');
assert.match(regularLaunch, /macos-launch-services\.swift" --regular/u);
assert.match(regularLaunch, /sidecar_bootstrap_ready/u);
assert.match(launchServices, /CommandLine\.arguments\[1\] == "--regular"/u);
assert.doesNotMatch(launchServices.split('if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--regular"')[1]
  .split('guard CommandLine.arguments.count == 3')[0], /config\.environment\s*=/u);
assert.match(workflow, /^permissions:\n  contents: read$/mu);
assert.match(workflow, /timeout-minutes: 45/u);
assert.match(workflow, /cancel-in-progress: true/u);
assert.doesNotMatch(workflow, /download-artifact|cache:/u,
  'the evidence run must not download artifacts or persist a dependency cache');
assert.doesNotMatch(workflow, /secrets\./u);
for (const expected of [
  'npm ci --ignore-scripts --no-audit --no-fund',
  'node native/ocr/pilot/fetch-models.mjs',
  'native/ocr/pilot/posix-sandbox.c',
  'tests/test-posix-supervisor-native.sh',
  'node scripts/build-runtime-target.mjs',
  'node scripts/prepare-standalone-runtime.mjs',
  'npm run test:standalone',
  'node tests/test-uat-fixture-generation.js',
  'node tests/test-legacy-input-migration.js',
  'npm run test:standalone:conversion',
  'cargo clippy --all-targets --locked -- -D warnings',
  'npx --no-install tauri build --bundles app',
  'node scripts/finalize-standalone-macos-runtime-evidence.mjs',
  'codesign --force --sign - --options runtime --entitlements "$entitlements" "$core"',
  'codesign --force --sign - --options runtime "$bundle"',
  "assert core == {'com.apple.security.cs.allow-jit': True}",
  "assert not app.get('com.apple.security.cs.allow-jit')",
  'STANDALONE_MACOS_SIGNED_RUNTIME_EVIDENCE_INVALID',
  'STANDALONE_MACOS_RUNNING_CORE_INTEGRITY_CHECKED',
  'DATASECURE_BUNDLED_RUNTIME_REQUIRED=1',
  'DataSecure Standalone.app',
  'codesign --verify --deep --strict',
  "MACOSX_DEPLOYMENT_TARGET: '13.5'",
  'Sign the target-native converter addon before inventory and bundling',
  '--launch-services',
  'node tests/test-standalone-package-smoke.mjs "$archive"',
  'hdiutil verify "$dmg"',
  'hdiutil create -quiet -volname "DataSecure Standalone"',
  'diff -qr "$bundle" "$mount/DataSecure Standalone.app"',
  'codesign --verify --deep --strict --verbose=2 "$mount/DataSecure Standalone.app"',
  'dist/DataSecure-Standalone-*-${{ matrix.target }}.dmg.sha256',
  'Signature=adhoc',
  'lipo -archs',
  'standalone-native-macos-launch.sh',
  'scripts/build-standalone-macos-package.mjs',
  'scripts/verify-standalone-macos-package.mjs',
  'cmp "${archive}.first" "$archive"',
  'ditto -x -k "$archive" "$extraction"',
  'packaged_app="$extraction/DataSecure-Standalone-${version}-${{ matrix.target }}/DataSecure Standalone.app"',
  'retention-days: 1',
  'compression-level: 0',
  'Human Gatekeeper, Finder picker, VoiceOver and workflow UAT remain open.'
]) assert.ok(workflow.includes(expected), `workflow is missing required evidence step: ${expected}`);

assert.match(coreJitEntitlements, /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/u);
assert.doesNotMatch(coreJitEntitlements, /allow-unsigned-executable-memory|disable-executable-page-protection|disable-library-validation|get-task-allow/u,
  'the hardened Core needs narrowly scoped JIT, not the broader upstream development entitlements');

assert.match(workflow, /if: \$\{\{ inputs\.upload_package == true \}\}[\s\S]*?uses: actions\/upload-artifact@[a-f0-9]{40}/u);

assert.strictEqual(packageJson.devDependencies['@tauri-apps/cli'], '2.11.4');
assert.strictEqual(packageLock.packages['node_modules/@tauri-apps/cli'].version, '2.11.4');
for (const expected of [
  'DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT',
  'DATASECURE_STANDALONE_NATIVE_SMOKE_REVIEW=1',
  'review_page_loaded',
  'native-review-readiness.js',
  'DATASECURE_STANDALONE_DOCUMENTS_DIR',
  'profile/Library/Application Support/SecureDataMsg-Standalone/workspace',
  'sidecar_started',
  'service_initialized',
  'pgrep -P "$app_pid" -x datasecure-core',
  'sidecar_command="$(ps -p "$sidecar_pid" -o command=',
  'macos-launch-services.swift" --terminate "$candidate" "$app_pid"',
  'STANDALONE_LAUNCH_SERVICES_EXIT_CODE_UNAVAILABLE',
  'STANDALONE_NATIVE_MACOS_ORPHANED_SIDECAR'
]) assert.ok(macosLaunch.includes(expected), `macOS launch smoke is missing: ${expected}`);
assert.doesNotMatch(macosLaunch, /child_pids="\$\(pgrep -P/u,
  'the sidecar check must not classify every WebView child as a sidecar');
assert.doesNotMatch(macosLaunch, /curl|wget|https?:\/\//u);
const readiness = fs.readFileSync(path.join(root, 'tests', 'helpers', 'native-review-readiness.js'), 'utf8');
assert.match(readiness, /get_review_session/u);
assert.match(readiness, /ipc_response_ok/u);
const { actionReady } = require('./helpers/native-review-readiness');
const overlappingReadiness = [
  { event: 'ipc_request_started', action: 'get_review_session', request_id: 'a'.repeat(35) },
  { event: 'ipc_request_started', action: 'get_review_session', request_id: 'b'.repeat(35) },
  { event: 'ipc_response_ok', action: 'get_review_session', request_id: 'a'.repeat(35) }
];
assert.equal(actionReady(overlappingReadiness, 'get_review_session'), false,
  'an old request response must not prove readiness of the newer request');
assert.equal(actionReady([...overlappingReadiness,
  { event: 'ipc_response_ok', action: 'get_review_session', request_id: 'b'.repeat(35) }], 'get_review_session'), true);

assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/u);
assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/u);
assert.doesNotMatch(workflow, /uses: [^\n]+@(?![a-f0-9]{40}(?:\s|$))/u,
  'every third-party action must be pinned to an immutable commit');

process.stdout.write('Standalone macOS manual sandbox workflow: PASS\n');
