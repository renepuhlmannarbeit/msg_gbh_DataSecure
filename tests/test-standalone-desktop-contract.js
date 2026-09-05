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
const sidecar = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js'), 'utf8');
const nativeSmoke = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-windows-launch.ps1'), 'utf8');
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
  assert.ok(capability.permissions.every((permission) => /^allow-[a-z-]+$/u.test(permission) ||
    ['core:event:allow-listen', 'core:event:allow-unlisten'].includes(permission)));
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
  assert.match(rust, /fn frontend_ready\(/u);
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
  assert.match(frontend, /await invoke\('frontend_ready', \{ nativeDropReady \}\)/u);
  assert.match(frontend, /textContent = resultFolder/u,
    'local paths are rendered as text and never interpreted as markup');
  assert.match(frontend, /open_local_ledger/u);
  assert.match(frontend, /handoff_confirmed/u);
  assert.match(frontend, /action-feedback/u);
  assert.match(frontend, /switchView\('results'\)/u);
  assert.match(sidecar, /local_target_requested/u);
  assert.match(sidecar, /local_target_resolved/u);
  assert.match(sidecar, /local_target_resolution_failed/u);
  assert.doesNotMatch(sidecar, /openFolder\(|revealFile\(/u,
    'the hidden sidecar resolves targets but never owns visible desktop actions');
  assert.match(rust, /resolved_local_target\(&owned, "resolve_current_results", "directory"\)/u);
  assert.match(rust, /resolved_local_target\(&owned, "resolve_local_ledger", "file"\)/u);
  assert.match(rust, /native_open_command/u);
  assert.match(rust, /os_open_handoff_confirmed/u);
  const visibleOpenImplementation = rust.slice(rust.indexOf('fn native_open_command'), rust.indexOf('fn filters'));
  assert.doesNotMatch(visibleOpenImplementation, /creation_flags\(0x08000000\)/u,
    'a visible file-manager action must not inherit the hidden-sidecar launch policy');
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
  assert.match(rust, /"product_version": env!\("CARGO_PKG_VERSION"\)/u);
  assert.match(frontend, /Version \$\{ready\.product_version\}/u);
});

test('native drag-drop shares admission with pickers and keeps an explicit Start', () => {
  assert.strictEqual(config.app.windows[0].dragDropEnabled, true);
  assert.match(rust, /WindowEvent::DragDrop\(DragDropEvent::Drop/u);
  const windowHook = rust.slice(rust.indexOf('.on_window_event('), rust.indexOf('.invoke_handler('));
  assert.doesNotMatch(windowHook, /\.state::<DesktopState>/u,
    'configured windows can emit events before application setup manages state');
  assert.match(windowHook, /DragDropEvent::Drop[\s\S]*if let Some\(state\) = window\.try_state::<DesktopState>\(\)/u);
  assert.match(rust, /admit_native_sources\(&worker, &paths, kind\)/u);
  assert.match(rust, /admit_native_sources\(&owned, &paths, "files"\)/u);
  assert.match(rust, /admit_native_sources\(&owned, &\[path\], "folder"\)/u);
  assert.match(rust, /STANDALONE_DROP_MIXED/u);
  assert.match(rust, /STANDALONE_SELECTION_PREPARED/u);
  assert.match(rust, /drop_received/u);
  const dropImplementation = rust.slice(rust.indexOf('fn native_drop('), rust.indexOf('fn request_id('));
  assert.doesNotMatch(dropImplementation, /start_admitted_batch/u);
  assert.doesNotMatch(dropImplementation, /json!\([^;]*paths/su, 'our app event does not contain a raw drop-path list; Tauri built-in events do');
  assert.doesNotMatch(frontend, /listen\(['"]tauri:\/\/drag-drop/u);
  assert.ok(capability.permissions.includes('core:event:allow-listen'));
  assert.ok(!capability.permissions.includes('core:event:allow-emit'));
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  assert.match(html, /id="drop-zone"[^>]+aria-label="Dateiaufnahme"/u);
  assert.match(html, /100 Dateien und 500 MB/u);
  assert.match(html, /id="select-files"/u);
  assert.match(html, /id="select-folder"/u);
  assert.match(html, /value="markdown-only" disabled/u, 'planned conversion-only mode is visible but has no active execution path');
  assert.doesNotMatch(frontend, /invoke\(['"](?:convert|convert_only|start_conversion)/u);
});

test('processing purpose crosses only the explicit desktop Start and conversion stays gated', () => {
  assert.match(frontend, /call\('start_admitted_batch', \{ processingMode \}\)/u);
  assert.match(rust, /#\[tauri::command\(rename_all = "camelCase"\)\]\s*async fn start_admitted_batch/u);
  assert.match(rust, /processing_mode: Option<String>/u);
  assert.match(rust, /request\["processing_mode"\] = json!\(validate_processing_mode\(processing_mode\)\?\)/u);
  assert.match(sidecar, /startAdmittedBatch\(\{ processingMode: message\.processing_mode \}\)/u);
  assert.match(sidecar, /MARKDOWN_CONVERSION_NOT_READY/u);
  const continuing = rust.slice(rust.indexOf('async fn continue_current_batch'), rust.indexOf('async fn configure_results'));
  assert.doesNotMatch(continuing, /processing_mode/u);
  assert.match(frontend, /call\('continue_current_batch'\)/u);
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  assert.match(html, /value="markdown-only" disabled/u);
  assert.match(html, /id="processing-mode"[^>]* disabled/u, 'startup cannot choose a mode before status is known');
});

test('the native Windows smoke exercises the visible WebView lifecycle', () => {
  assert.match(nativeSmoke, /\[System\.Diagnostics\.Process\]::Start\(\$startInfo\)/u);
  assert.match(nativeSmoke, /ProcessWindowStyle\]::Normal/u);
  assert.doesNotMatch(nativeSmoke, /WindowStyle\s+(?:Hidden|Minimized)/iu,
    'hidden or minimized startup can defer WebView2 page loading');
  assert.match(nativeSmoke, /page_loaded/u);
  assert.match(nativeSmoke, /frontend_ready/u);
});

test('native smoke isolates data, Documents, diagnostics and WebView before product startup', () => {
  const isolation = fs.readFileSync(path.join(root, 'tauri-contract/src/native_smoke.rs'), 'utf8');
  assert.match(nativeSmoke, /EnvironmentVariables\.Clear\(\)/u);
  assert.doesNotMatch(nativeSmoke, /\$env:(?:USERPROFILE|HOME|LOCALAPPDATA|APPDATA|TEMP|TMP|CODEX_HOME)\s*=/iu);
  for (const key of ['USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'DATASECURE_STANDALONE_DOCUMENTS_DIR', 'WEBVIEW2_USER_DATA_FOLDER']) {
    assert.ok(nativeSmoke.includes(key));
    assert.ok(isolation.includes(key));
  }
  assert.match(nativeSmoke, /STANDALONE_NATIVE_ISOLATION_UNSUPPORTED/u, 'old binaries must not be launched');
  assert.match(nativeSmoke, /ValidateIsolationOnly/u);
  const polling = nativeSmoke.slice(nativeSmoke.indexOf('    do {'), nativeSmoke.indexOf('    } while ('));
  assert.ok(polling.indexOf('Assert-NativeProcessRunning $process') >= 0);
  assert.ok(polling.indexOf('Assert-NativeProcessRunning $process') < polling.indexOf('Read-InteractionEvents'),
    'exit before the first application event must be reported before the no-events continue branch');
  assert.match(isolation, /executable\.ancestors\(\)\.any\(is_reserved_root\)/u);
  assert.match(nativeSmoke, /Get-CheckedTree/u);
  assert.doesNotMatch(nativeSmoke, /(?:Get-ChildItem|Remove-Item)[^\n]*-Recurse/u);
  const main = rust.slice(rust.indexOf('fn main()'), rust.indexOf('#[cfg(test)]\nmod tests'));
  assert.ok(main.indexOf('native_smoke::from_environment()') < main.indexOf('diagnostic_event('));
  assert.match(main, /Err\(_\) => std::process::exit\(65\)/u);
  assert.match(main, /window\.create = false/u);
  assert.match(main, /\.data_directory\(profile\.webview\.join/u);
  assert.match(rust, /command\.env\("DATASECURE_STANDALONE_DOCUMENTS_DIR", &profile\.documents\)/u);
  if (process.platform === 'win32') {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'manual/standalone-native-windows-launch.ps1'), '-ValidateIsolationOnly'],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /ISOLATION CONTRACT PASS/u);
  }
});

test('native cleanup allows only the exact post-exit cache junction without following it', () => {
  const cleanup = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-cleanup.ps1'), 'utf8');
  assert.match(nativeSmoke, /AllowCacheJunction:\(\$null -ne \$process -and \$process\.HasExited\)/u);
  assert.match(nativeSmoke, /if \(-not \$process\.WaitForExit\(3000\)\)/u);
  const preflight = nativeSmoke.slice(nativeSmoke.indexOf('function Get-CheckedTree'), nativeSmoke.indexOf('function New-IsolatedStartInfo'));
  assert.doesNotMatch(preflight, /AllowCacheJunction/u);
  assert.match(cleanup, /0x02200000/u, 'metadata identity handles must open the reparse point, not follow it');
  assert.match(cleanup, /Content\.IE5/u);
  assert.match(cleanup, /ReadMountPoint\(\$Item\.FullName\)/u);
  assert.match(cleanup, /BitConverter\.ToUInt32\(buffer, 0\) != 0xa0000003u/u);
  assert.match(cleanup, /\$native\.Target -ne \$expectedTarget/u);
  assert.doesNotMatch(cleanup, /\$Item\.(?:Target|LinkType)/u,
    'PowerShell 5 display properties are not native junction proof');
  assert.match(cleanup, /\[System\.IO\.Directory\]::Delete\(\$Stamp\.Path\)/u);
  assert.doesNotMatch(cleanup, /(?:Get-ChildItem|Remove-Item)[^\n]*-Recurse/u);
  assert.doesNotMatch(cleanup, /Directory\]::Delete\([^\n]*,/u);
  if (process.platform === 'win32') {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'manual/standalone-native-cleanup-test.ps1')],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /CLEANUP CONTRACT PASS \(8 groups\)/u);
  }
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
