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

// Evaluate the actual source-test mode selectors without running a child or
// claiming a native Mac pass. A broad Darwin sourceOnly would also remove the
// independent real projected document/OCR/fast/workflow scenarios unnecessarily.
const sidecarFile = path.join(root, 'tests', 'test-standalone-sidecar.js');
const sidecarSource = fs.readFileSync(sidecarFile, 'utf8');
const selectorEnd = sidecarSource.indexOf('\nfunction protocolClient(');
assert.ok(selectorEnd > 0);
for (const platform of ['win32', 'darwin', 'linux']) {
  for (const args of [[], ['--source-only']]) {
    const selection = require('node:vm').runInNewContext(sidecarSource.slice(0, selectorEnd) +
      '\n({ sourceOnly, nativeSourceOnly });', {
      require: require('node:module').createRequire(sidecarFile),
      process: { platform, argv: ['node', sidecarFile, ...args] }
    }, { filename: sidecarFile, timeout: 1000 });
    assert.equal(selection.sourceOnly, args.length === 1, 'full source scenarios stay enabled on Darwin');
    assert.equal(selection.nativeSourceOnly, args.length === 1 || platform === 'darwin');
  }
}
assert.match(sidecarSource, /if \(nativeSourceOnly && nativeGuardTarget\)/u);
assert.match(sidecarSource, /if \(!nativeSourceOnly \|\| !nativeGuardTarget\)/u);
assert.match(sidecarSource, /if \(!sourceOnly\) \{\s*const \{ writeStandaloneRuntime \}/u);

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
assert.match(workflow, /if: \$\{\{ inputs\.confirm_private_runner_minutes == true && inputs\.produce_static_core != true \}\}/u);
assert.match(workflow, /produce_static_core:[\s\S]*?default: false[\s\S]*?type: boolean/u);
for (const input of ['core_candidate_run_id', 'core_candidate_source_sha'])
  assert.match(workflow, new RegExp(`${input}:[\\s\\S]*?required: false[\\s\\S]*?default: ''[\\s\\S]*?type: string`, 'u'));
assert.match(workflow, /CORE_CANDIDATE_RUN_ID: \$\{\{ inputs\.core_candidate_run_id \}\}/u);
assert.match(workflow, /CORE_CANDIDATE_SOURCE_SHA: \$\{\{ inputs\.core_candidate_source_sha \}\}/u);
assert.ok(workflow.includes('[[ "$CORE_CANDIDATE_RUN_ID" =~ ^[1-9][0-9]{0,19}$ ]]'));
assert.ok(workflow.includes('[[ "$CORE_CANDIDATE_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]'));
assert.ok(workflow.includes('[[ "$CORE_PRODUCER_TARGET" =~ ^(both|macos-arm64|macos-x64)$ ]]'),
  'Core production must reject the package-only ARM macOS 26 selector');
assert.match(workflow, /produce-static-core:[\s\S]*?needs: validate-producer-target[\s\S]*?uses: \.\/\.github\/workflows\/standalone-macos-static-core\.yml/u);
assert.match(workflow, /default: macos-arm64/u, 'the default must allocate only one target');
assert.match(workflow, /macos-15-intel/u);
assert.match(workflow, /macos-14/u);
assert.match(workflow, /macos-arm64-26/u);
assert.match(workflow, /macos-26/u);
assert.match(workflow, /standalone-macos-regular-start\.sh/u);
const historyContractStep = workflow.match(/      - name: Run product, conversion, Rust and workflow contracts\n([\s\S]*?)(?=\n      - name:)/u)?.[1];
assert.ok(historyContractStep, 'the actual native product-contract step must be present');
assert.match(historyContractStep, /^          set -euo pipefail$/mu);
const historyCommands = ['test-standalone-history-read-race.js', 'test-standalone-history-migration-race.js',
  'test-standalone-history-probe.js', 'test-legacy-macos-parser-routing.js'];
const standaloneCommand = historyContractStep.indexOf('\n          npm run test:standalone');
for (const file of historyCommands) {
  const command = `\n          node tests/${file}\n`;
  const index = historyContractStep.indexOf(command);
  assert.ok(index >= 0 && standaloneCommand > index, `native POSIX history gate must actually execute before npm: ${file}`);
}
assert.match(workflow, /find "\$bundle\/Contents\/Resources\/server" -type d ! -perm -005/u);
assert.match(workflow, /find "\$bundle\/Contents\/Resources\/server" -type f ! -perm -004/u);
const regularLaunch = fs.readFileSync(path.join(root, 'tests', 'manual', 'standalone-macos-regular-start.sh'), 'utf8');
const launchServices = fs.readFileSync(path.join(root, 'tests', 'helpers', 'macos-launch-services.swift'), 'utf8');
assert.match(regularLaunch, /macos-launch-services\.swift" --regular/u);
assert.match(regularLaunch, /--sidecar "\$desktop_log" --runtime --workspace/u,
  'regular startup must use the bounded reader and actual main-workspace IPC');
assert.match(launchServices, /CommandLine\.arguments\[1\] == "--regular"/u);
assert.doesNotMatch(launchServices.split('if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--regular"')[1]
  .split('guard CommandLine.arguments.count == 3')[0], /config\.environment\s*=/u);
assert.match(workflow, /^permissions:\n  contents: read$/mu);
const nativeJob = workflow.slice(workflow.indexOf('\n  native-evidence:\n'));
assert.ok(nativeJob.startsWith('\n  native-evidence:\n'), 'the bounded native consumer job must exist');
assert.match(nativeJob, /^    timeout-minutes: 75$/mu,
  'the complete Intel native/ZIP/DMG gates need a bounded 75-minute CI budget');
assert.deepEqual([...workflow.matchAll(/^    timeout-minutes: (\d+)$/gmu)].map(match => Number(match[1])),
  [2, 2, 75], 'only the native consumer CI budget changes, not target-selection jobs');
assert.doesNotMatch(workflow, /^        timeout-minutes:/mu,
  'no per-step timeout overrides may silently replace the existing test deadlines');
assert.match(workflow, /cancel-in-progress: \$\{\{ inputs\.produce_static_core != true \}\}/u,
  'a producer dispatch must not cancel an earlier long-running native Core build');
assert.match(workflow, /^  actions: read$/mu);
assert.doesNotMatch(workflow, /cache:/u, 'the evidence run must not persist a dependency cache');
assert.equal((workflow.match(/uses: actions\/download-artifact@/gu) || []).length, 1);
assert.match(workflow, /uses: actions\/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131/u);
for (const transport of [
  'github-token: ${{ github.token }}', 'repository: ${{ github.repository }}',
  'run-id: ${{ inputs.core_candidate_run_id }}',
  'name: DataSecure-Mac-Core-${{ matrix.target }}-${{ inputs.core_candidate_source_sha }}'
]) assert.ok(workflow.includes(transport), `Core transport must be explicit: ${transport}`);
assert.doesNotMatch(workflow, /pattern:|merge-multiple:/u);
assert.ok(workflow.indexOf('node scripts/import-macos-core-candidate.mjs') <
  workflow.indexOf('node scripts/lib/macos-core-artifact.mjs --verify'));
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
  'node tests/test-import-macos-core-candidate.mjs',
  'node tests/test-native-macos-static-core.mjs',
  'cargo clippy --all-targets --locked -- -D warnings',
  'npx --no-install tauri build --bundles app --no-sign',
  'node scripts/lib/macos-core-artifact.mjs --verify "$PWD" "${{ matrix.target }}"',
  'node scripts/lib/macos-core-artifact.mjs --app "$PWD" "${{ matrix.target }}" "$bundle"',
  'node scripts/finalize-standalone-macos-runtime-evidence.mjs',
  'codesign --force --sign - --options runtime "$bundle"',
  "assert core == {'com.apple.security.cs.allow-jit': True}",
  "assert not app.get('com.apple.security.cs.allow-jit')",
  'STANDALONE_MACOS_SIGNED_RUNTIME_EVIDENCE_INVALID',
  'STANDALONE_MACOS_RUNNING_CORE_INTEGRITY_CHECKED',
  'Print :NSDocumentsFolderUsageDescription',
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

// The custom Core is finally sealed BEFORE Cargo. A later invocation may only
// compare it; re-signing or accepting a newly computed digest would break the
// independently supplied compiler pin. Native signing stays a separate gate.
const finalCoreContract = fs.readFileSync(path.join(root, 'scripts/macos-static-core/final-core-contract.mjs'), 'utf8');
assert.ok(workflow.indexOf('node scripts/lib/macos-core-artifact.mjs --verify') <
  workflow.indexOf('node scripts/prepare-standalone-runtime.mjs'));
assert.ok(workflow.indexOf('scripts/finalize-standalone-macos-runtime-evidence.mjs') <
  workflow.indexOf('codesign --force --sign - --options runtime "$bundle"'));
assert.doesNotMatch(workflow, /codesign(?=[^\n]*(?:--force|--sign))[^\n]*--entitlements[^\n]*"\$core"/u);
assert.match(workflow, /cmp "dist\/macos-static-core\/\$\{\{ matrix\.target \}\}\/datasecure-core" "\$sidecar"/u);
assert.match(finalCoreContract, /'--timestamp=none'/u);
assert.match(finalCoreContract, /'--options', 'runtime', '--entitlements'/u);
assert.match(finalCoreContract, /com\.apple\.security\.cs\.allow-jit/u);
assert.doesNotMatch(finalCoreContract, /disable-library-validation|allow-unsigned-executable-memory|get-task-allow/u);

assert.match(coreJitEntitlements, /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/u);
assert.doesNotMatch(coreJitEntitlements, /allow-unsigned-executable-memory|disable-executable-page-protection|disable-library-validation|get-task-allow/u,
  'the hardened Core needs narrowly scoped JIT, not the broader upstream development entitlements');

assert.match(workflow, /if: \$\{\{ inputs\.upload_package == true \}\}[\s\S]*?uses: actions\/upload-artifact@[a-f0-9]{40}/u);

assert.strictEqual(packageJson.devDependencies['@tauri-apps/cli'], '2.11.4');
assert.strictEqual(packageLock.packages['node_modules/@tauri-apps/cli'].version, '2.11.4');
for (const expected of [
  'DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT',
  'DATASECURE_STANDALONE_NATIVE_SMOKE_REVIEW=1',
  'native-review-readiness.js',
  'DATASECURE_STANDALONE_DOCUMENTS_DIR',
  'profile/Library/Application Support/SecureDataMsg-Standalone/workspace',
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
const sidecarReadiness = fs.readFileSync(path.join(root, 'tests', 'helpers', 'native-sidecar-readiness.js'), 'utf8');
assert.match(macosLaunch, /--sidecar "\$desktop_log" --runtime --review/u,
  'the native launch must call the bounded, session/owner-correlated reader, not a comment or legacy base-file grep');
assert.match(macosLaunch, /STANDALONE_NATIVE_APP_EXITED_/u);
for (const event of ['sidecar_started', 'runtime_integrity_checked', 'service_initialized'])
  assert.ok(sidecarReadiness.includes(`'${event}'`), `sidecar reader lacks ${event}`);
assert.match(sidecarReadiness, /sidecar_bootstrap_ready/u);
assert.match(readiness, /review_page_loaded/u);
assert.match(sidecarReadiness, /readBoundFileRecord/u);
assert.match(sidecarReadiness, /current_owner_main_ipc/u);
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

require('./lib/macos-cleanup-source-cases.cjs')(root);

process.stdout.write('Standalone macOS manual sandbox workflow: PASS\n');
