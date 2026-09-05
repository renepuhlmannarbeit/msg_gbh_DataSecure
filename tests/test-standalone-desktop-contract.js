'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Standalone desktop contract');
const root = path.join(__dirname, '../apps/datasecure-standalone');
const targets = JSON.parse(fs.readFileSync(path.join(root, 'desktop-targets.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'tauri-contract/tauri.conf.json'), 'utf8'));
const macConfig = JSON.parse(fs.readFileSync(path.join(root, 'tauri-contract/tauri.macos.conf.json'), 'utf8'));
const capability = JSON.parse(fs.readFileSync(path.join(root, 'tauri-contract/capabilities/main.json'), 'utf8'));
const cargo = fs.readFileSync(path.join(root, 'tauri-contract/Cargo.toml'), 'utf8');
const rust = fs.readFileSync(path.join(root, 'tauri-contract/src/main.rs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8');
const productVersion = require('../package.json').version;

test('desktop manifests, Rust package and artifact names use the product version', () => {
  assert.strictEqual(config.version, productVersion);
  assert.match(cargo, new RegExp(`^version = "${productVersion.replaceAll('.', '\\.') }"$`, 'mu'));
  for (const target of targets.targets) assert.ok(target.package_filename.includes(productVersion));
});

test('one target catalog binds product names to exact Rust target triples', () => {
  assert.strictEqual(targets.release_status, 'engineering_only');
  assert.strictEqual(targets.network_listener, false);
  assert.deepStrictEqual(targets.targets.map((target) => target.product_target), [
    'windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64-glibc'
  ]);
  assert.deepStrictEqual(targets.targets.map((target) => target.rust_target), [
    'x86_64-pc-windows-msvc', 'x86_64-apple-darwin',
    'aarch64-apple-darwin', 'x86_64-unknown-linux-gnu'
  ]);
  for (const target of targets.targets) {
    assert.ok(target.sidecar_filename.includes(target.rust_target));
    assert.ok(target.package_filename.includes(target.product_target));
  }
});

test('both macOS packages require 13.5 and native target-host evidence', () => {
  const macTargets = targets.targets.filter((target) => target.product_target.startsWith('macos-'));
  assert.strictEqual(macTargets.length, 2);
  for (const target of macTargets) {
    assert.strictEqual(target.minimum_system_version, '13.5');
    assert.strictEqual(target.native_execution_required, true);
    assert.strictEqual(target.gatekeeper_guide, 'MACOS-START.md');
  }
  assert.strictEqual(macConfig.bundle.macOS.minimumSystemVersion, '13.5');
  assert.strictEqual(macConfig.bundle.macOS.signingIdentity, '-',
    'certificate-free macOS pilots require an explicit ad-hoc signature');
  assert.deepStrictEqual(macConfig.bundle.targets, ['app']);
});

test('Tauri renderer has no direct file, dialog, shell or network permission', () => {
  const serialized = JSON.stringify(capability);
  assert.deepStrictEqual(capability.windows, ['main']);
  assert.strictEqual(capability.local, true);
  assert.doesNotMatch(serialized, /(?:dialog|shell|opener|fs|http):/iu);
  assert.doesNotMatch(serialized, /core:default|core:path:/u);
  assert.ok(capability.permissions.every((permission) => /^allow-[a-z-]+$/u.test(permission)));
  assert.strictEqual(config.build.devUrl, undefined);
  assert.deepStrictEqual(config.bundle.externalBin, ['binaries/datasecure-core']);
  assert.deepStrictEqual(config.app.security.capabilities, ['main-window']);
  assert.match(config.app.security.csp, /default-src 'self'/u);
  assert.doesNotMatch(config.app.security.csp, /https:|wss:|ws:/u);
});

test('the Tauri contract is now a buildable shell with private sidecar mediation', () => {
  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"2\.11\.5"/u);
  assert.match(rust, /stdin\(Stdio::piped\(\)\).*stdout\(Stdio::piped\(\)\)/su);
  assert.match(rust, /to_be_bytes\(\)/u);
  assert.match(rust, /read_exact/u);
  assert.match(rust, /env_clear\(\)/u);
  assert.match(rust, /fn child_process_path\(path: &Path\)/u);
  assert.match(rust, /Command::new\(child_process_path\(&executable\)\)/u);
  assert.match(rust, /current_dir\(child_process_path\(script_directory\)\)/u);
  assert.match(rust, /\.arg\("--require=\.\.\/network-deny\.cjs"\)/u,
    'Node must not receive a Windows verbatim path in its preload argument');
  assert.match(rust, /DATASECURE_STANDALONE_DIAGNOSTIC_SESSION/u);
  assert.match(rust, /"session_id": diagnostic_session\(\)/u);
  assert.match(rust, /diagnostic_event\("page_loaded"/u);
  assert.match(rust, /fn frontend_ready\(\)/u);
  assert.doesNotMatch(rust, /"HTTP_PROXY"|"HTTPS_PROXY"|"OPENAI_API_KEY"|"ANTHROPIC_API_KEY"/u);
  assert.match(rust, /process_guard\.take\(\)/u);
  assert.doesNotMatch(frontend, /source_path|source_paths|raw_content|mapping|fetch\s*\(/u);
  assert.match(frontend, /choose\('select_files'\)/u);
  assert.doesNotMatch(frontend, /setInterval\s*\(/u);
  assert.match(frontend, /refreshInFlight/u);
  assert.match(frontend, /function resetAdmissionUi\(\)/u);
  assert.match(frontend, /code === 'STANDALONE_NO_ADMISSION'/u);
  assert.match(frontend, /code === 'STANDALONE_START_FAILED'/u);
  assert.match(frontend, /STANDALONE_SELECTION_INVALID/u);
  assert.match(frontend, /code === 'STANDALONE_IPC_FAILED'/u);
  assert.match(frontend, /code === 'STANDALONE_IPC_TIMEOUT'/u);
  assert.match(frontend, /configure_results/u);
  assert.match(frontend, /get_ui_context/u);
  assert.match(frontend, /await invoke\('frontend_ready'\)/u);
  assert.match(frontend, /textContent = context\.result_folder/u,
    'local paths are rendered as text and never interpreted as markup');
  assert.match(frontend, /open_local_ledger/u);
  assert.match(frontend, /open_diagnostic_folder/u);
  assert.match(frontend, /requestAnimationFrame\(\(\) => requestAnimationFrame/u,
    'terminal visibility is acknowledged only after a paint opportunity');
  assert.match(frontend, /ack_terminal_presented/u);
  assert.match(frontend, /presentationGeneration: generation/u,
    'terminal acknowledgement is correlated to the rendered public state');
  assert.ok(capability.permissions.includes('allow-open-local-ledger'));
  assert.ok(capability.permissions.includes('allow-open-diagnostic-folder'));
  assert.ok(capability.permissions.includes('allow-ack-terminal-presented'));
  assert.ok(capability.permissions.includes('allow-get-ui-context'));
  assert.ok(capability.permissions.includes('allow-frontend-ready'));
  assert.match(rust, /async fn open_local_ledger/u);
  assert.match(rust, /async fn open_diagnostic_folder/u);
  assert.match(rust, /async fn ack_terminal_presented/u);
  assert.match(rust, /async fn get_ui_context/u);
  assert.match(rust, /presentation_generation: u64/u);
});

test('package contract excludes Claude, Cowork, MCP and skill material', () => {
  const forbidden = targets.forbidden_package_entries.map((value) => value.toLowerCase());
  for (const marker of ['.claude-plugin', '.mcp.json', 'skills/', 'mcp-server.js', 'claude', 'cowork']) {
    assert.ok(forbidden.includes(marker));
  }
});

test('converter runtime is required only when MarkItDown conversion is enabled', () => {
  assert.ok(!targets.required_package_entries.includes('architecture-matched converter runtime'));
  assert.deepStrictEqual(targets.feature_gated_package_entries.markitdown_conversion_enabled,
    ['architecture-matched converter runtime']);
  const runtime = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../plugins/data-secure/server/converters/markitdown/runtime-contract.json'), 'utf8'));
  assert.strictEqual(runtime.product_enabled, false);
});

test('macOS instructions use a narrow Gatekeeper exception without terminal bypasses', () => {
  const guide = fs.readFileSync(path.join(root, 'MACOS-START.md'), 'utf8');
  assert.match(guide, /Datenschutz &\s+Sicherheit/u);
  assert.match(guide, /Dennoch öffnen/u);
  assert.match(guide, /macOS 13\.5/u);
  assert.doesNotMatch(guide, /`(?:xattr|spctl)\s+[-\w]/u);
  assert.match(guide, /kein baubares|noch\s+nicht gebaut/iu);
});

done();
