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
const iconDirectory = path.join(root, 'tauri-contract/icons');

test('closed desktop errors preserve identity and capacity facts and their renderer recovery hints', () => {
  const { DESKTOP_ERROR_CODES, desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');
  assert.equal(new Set(DESKTOP_ERROR_CODES).size, DESKTOP_ERROR_CODES.length);
  assert.ok(Object.isFrozen(DESKTOP_ERROR_CODES));
  for (const code of ['STANDALONE_IDENTITY_MAPPING_MISSING', 'STANDALONE_IDENTITY_MAPPING_INVALID',
    'STANDALONE_IDENTITY_PUBLICATION_FAILED', 'BATCH_PSEUDONYM_CAPACITY_EXCEEDED']) {
    assert.equal(desktopErrorCode(code), code);
    assert.match(frontend, new RegExp(`${code}: '[^']{20,}'`, 'u'));
  }
  assert.equal(desktopErrorCode('PRIVATE PATH /name.docx'), 'STANDALONE_OPERATION_FAILED');
  assert.match(sidecar, /desktopErrorCode\(error\?\.code\)/u);
});

test('desktop manifests, Rust package and artifact names use the product version', () => {
  assert.strictEqual(config.version, productVersion);
  assert.match(cargo, new RegExp(`^version = "${productVersion.replaceAll('.', '\\.') }"$`, 'mu'));
  for (const target of targets.targets) assert.ok(target.package_filename.includes(productVersion));
});

test('fresh Windows and macOS checkouts contain explicit native icon sources', () => {
  assert.deepStrictEqual(config.bundle.icon, ['icons/icon.png', 'icons/icon.ico']);
  const png = fs.readFileSync(path.join(iconDirectory, 'icon.png'));
  const ico = fs.readFileSync(path.join(iconDirectory, 'icon.ico'));
  assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(ico.length > 6 && ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1);
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
  assert.match(macConfig.version, /^\d+\.\d+\.\d+$/u);
  assert.strictEqual(macConfig.version, config.version.split('-')[0]);
  assert.match(macConfig.bundle.macOS.bundleVersion, /^[1-9]\d*$/u);
  assert.strictEqual(macConfig.bundle.macOS.signingIdentity, '-',
    'certificate-free macOS pilots require an explicit ad-hoc signature');
  assert.deepStrictEqual(macConfig.bundle.targets, ['app']);
});

test('Linux Standalone has an explicit AppImage and glibc baseline contract', () => {
  const linuxTarget = targets.targets.find((target) => target.product_target === 'linux-x64-glibc');
  assert.ok(linuxTarget);
  assert.strictEqual(linuxTarget.rust_target, 'x86_64-unknown-linux-gnu');
  assert.strictEqual(linuxTarget.minimum_glibc_version, '2.35');
  assert.strictEqual(linuxTarget.distribution_format, 'appimage-in-zip');
  assert.strictEqual(linuxTarget.start_guide, 'LINUX-START.md');
  const guide = fs.readFileSync(path.join(root, linuxTarget.start_guide), 'utf8');
  assert.match(guide, /Ubuntu 22\.04/u);
  assert.match(guide, /chmod (?:u\+x|\+x)/u);
  assert.match(guide, /weder Claude noch eine zusätzliche Node\.js-,\s+Python- oder Rust-Installation/u);
  assert.match(guide, /sichtbare menschliche Linux-Abnahme\s+bleibt[^.]+offen/u);
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
  assert.deepStrictEqual(config.app.security.capabilities, ['main-window', 'review-window']);
  assert.match(config.app.security.csp, /default-src 'self'/u);
  assert.doesNotMatch(config.app.security.csp, /https:|wss:|ws:/u);
});

test('local review window is created by an async command on Windows', () => {
  // Tauri/WebView2 can leave a window white when its builder runs in a synchronous command.
  assert.match(rust, /#\[tauri::command\]\s*async fn open_review_window\(app: AppHandle\)/u);
  assert.match(rust, /WebviewWindowBuilder::new\(&app, "review", WebviewUrl::App\("review\.html"\.into\(\)\)\)/u);
  assert.match(rust, /"review_page_loaded"/u);
  const reviewCapability = JSON.parse(fs.readFileSync(path.join(root, 'tauri-contract/capabilities/review.json'), 'utf8'));
  const permissions = fs.readFileSync(path.join(root, 'tauri-contract/permissions/commands.toml'), 'utf8');
  assert.deepStrictEqual(reviewCapability.windows, ['review']);
  assert.ok(reviewCapability.permissions.includes('allow-close-review-window'));
  assert.ok(!capability.permissions.includes('allow-close-review-window'));
  assert.ok(reviewCapability.permissions.includes('allow-continue-review-session'));
  assert.ok(!capability.permissions.includes('allow-continue-review-session'));
  assert.match(permissions, /commands\.allow = \["close_review_window"\]/u);
  assert.match(permissions, /commands\.allow = \["continue_review_session"\]/u);
  assert.match(rust, /fn close_review_window\(window: tauri::WebviewWindow\)[\s\S]*?review_window_only\(&window\)\?/u);
  assert.match(rust, /async fn continue_review_session\([\s\S]*?review_window_only\(&window\)\?/u);
  assert.match(rust, /if let Some\(window\) = app\.get_webview_window\("review"\)/u,
    'the next review group reuses the existing review window');
  assert.match(nativeSmoke, /STANDALONE_NATIVE_REVIEW_WINDOW_TIMEOUT/u);
  for (const name of ['review.html', 'review.js', 'review.css']) {
    assert.ok(fs.statSync(path.join(root, 'frontend', name)).size > 0, `${name} must be packaged`);
  }
});

test('native review close is bound before visibility and never discovers a later current session', () => {
  const opening = rust.slice(rust.indexOf('async fn open_review_window('), rust.indexOf('fn review_window_only('));
  assert.match(opening, /\.visible\(false\)/u);
  assert.ok(opening.indexOf('window.on_window_event(') < opening.indexOf('if window.show()'),
    'native X listener must be registered before users can close the window');
  assert.match(opening, /defer_closed_review\(&owned, generation\)/u);
  const closing = rust.slice(rust.indexOf('fn defer_closed_review('), rust.indexOf('fn review_window_only('));
  assert.match(closing, /close_snapshot\(generation\)/u);
  assert.doesNotMatch(closing, /get_review_session/u,
    'a delayed close may never fetch and defer the next session');
  const binding = fs.readFileSync(path.join(root, 'tauri-contract/src/review_window.rs'), 'utf8');
  assert.match(binding, /if generation != self\.generation \{ return None; \}/u);
  assert.match(binding, /old_native_close_event_cannot_defer_new_window/u,
    'real Rust behavioral tests must cover old native close events');
});

test('recursive admission uses a separate bounded deadline and an honest content-free heartbeat', () => {
  assert.match(rust, /Duration::from_secs\(if action == "admit_selected_sources" \{ 300 \} else \{ 30 \}\)/u);
  assert.match(rust, /let deadline = started \+ rpc_duration\(action\)/u);
  assert.match(rust, /STANDALONE_ADMISSION_TIMEOUT/u);
  const progress = rust.slice(rust.indexOf('fn admission_progress('), rust.indexOf('fn rpc_request('));
  assert.match(progress, /get_webview_window\("main"\)/u);
  assert.match(progress, /"datasecure-admission-progress"/u);
  const payload = progress.match(/json!\(\{([\s\S]*?)\}\)/u)?.[1];
  assert.ok(payload);
  assert.deepStrictEqual([...payload.matchAll(/"([^"]+)":/gu)].map(match => match[1]), ['phase', 'elapsed_ms']);
});

test('every repeated external quit stays prevented until the shutdown completion gate', () => {
  const exit = rust.slice(rust.indexOf('fn begin_native_exit('), rust.indexOf('fn main()'));
  assert.match(exit, /if !state\.exit_gate\.begin\(\)/u);
  assert.ok(exit.indexOf('state.lifecycle.stop()') < exit.indexOf('state.exit_gate.finish(stopped)'),
    'only the completed shutdown worker may allow the internal final exit');
  assert.match(exit, /state\.app\.exit\(state\.exit_gate\.finish\(stopped\)\)/u);
  const handler = rust.slice(rust.indexOf('app.run(|app_handle, event|'));
  assert.match(handler, /ExitRequested \{ api, code, \.\. \}/u);
  assert.match(handler, /if !state\.exit_gate\.allowed\(code\) \{\s*api\.prevent_exit\(\);\s*begin_native_exit/u);
  assert.doesNotMatch(handler, /exit_started/u,
    'starting cleanup does not permit later external Quit requests');
  const transport = fs.readFileSync(path.join(root, 'tauri-contract/src/ipc_transport.rs'), 'utf8');
  for (const name of ['repeated_quit_requests_cannot_bypass_pending_spawn_reconciliation',
    'failed_shutdown_allows_only_its_completed_failure_terminal_exit']) assert.ok(transport.includes(name));
});

test('the Tauri contract is now a buildable shell with private sidecar mediation', () => {
  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"2\.11\.5"/u);
  assert.match(rust, /stdin\(Stdio::piped\(\)\).*stdout\(Stdio::piped\(\)\)/su);
  assert.match(rust, /to_be_bytes\(\)/u);
  assert.match(rust, /read_exact/u);
  assert.match(rust, /env_clear\(\)/u);
  assert.match(rust, /fn child_process_path\(path: &Path\)/u);
  assert.match(rust, /directory\.join\(bundled_name\)/u,
    'Tauri app bundles remove the target triple from externalBin names');
  assert.match(rust, /"datasecure-core"/u);
  assert.match(rust, /Command::new\(child_process_path\(&executable\)\)/u);
  assert.match(rust, /current_dir\(child_process_path\(script_directory\)\)/u);
  assert.match(rust, /\.arg\("--require=\.\.\/network-deny\.cjs"\)/u,
    'Node must not receive a Windows verbatim path in its preload argument');
  assert.match(rust, /DATASECURE_STANDALONE_DIAGNOSTIC_SESSION/u);
  assert.match(rust, /"session_id": diagnostic_session\(\)/u);
  assert.match(rust, /if webview\.label\(\) == "review" \{ "review_page_loaded" \} else \{ "page_loaded" \}/u);
  assert.match(rust, /diagnostic_event\("setup_started"/u);
  assert.match(rust, /diagnostic_event\("webview_profile_ready"/u);
  assert.match(rust, /diagnostic_event\("setup_completed"/u);
  assert.match(rust, /diagnostic_event\(\s*"application_run_failed"/u);
  assert.match(rust, /fn begin_native_exit\(state: DesktopState\)/u);
  assert.match(rust, /api\.prevent_close\(\)/u);
  assert.match(rust, /api\.prevent_exit\(\)/u);
  assert.match(rust, /state\.lifecycle\.stop\(\)/u);
  assert.doesNotMatch(rust, /state\.sidecar\.lock\(\)/u,
    'window close must never wait behind an in-flight private pipe request');
  assert.match(rust, /ipc_transport::lock_until/u);
  assert.match(rust, /ipc_transport::receive_until/u);
  assert.match(rust, /fn frontend_ready\(/u);
  assert.doesNotMatch(rust, /"HTTP_PROXY"|"HTTPS_PROXY"|"OPENAI_API_KEY"|"ANTHROPIC_API_KEY"/u);
  assert.match(rust, /process_guard\.take\(\)/u);
  assert.doesNotMatch(frontend, /source_path|source_paths|raw_content|fetch\s*\(/u);
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
  assert.match(frontend, /byId\(id\)\.textContent = label/u,
    'local paths are rendered as text and never interpreted as markup');
  assert.match(frontend, /byId\('suggested-result-folder'\)\.textContent = location/u,
    'the proposed first-run path must also be rendered as text');
  assert.doesNotMatch(frontend, /\.innerHTML\s*=/u,
    'frontend must not interpret local paths as markup');
  assert.match(frontend, /open_history_ledger/u);
  assert.match(frontend, /handoff_confirmed/u);
  assert.match(frontend, /action-feedback/u);
  assert.match(frontend, /activeView = 'home'/u);
  assert.strictEqual((frontend.match(/switchView\('results'\)/gu) || []).length, 2,
    'only explicit completion and resume actions open history; review is not a global navigation button');
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
  const windowHook = rust.slice(rust.lastIndexOf('.on_window_event('), rust.indexOf('.invoke_handler('));
  assert.doesNotMatch(windowHook, /\.state::<DesktopState>/u,
    'configured windows can emit events before application setup manages state');
  assert.match(windowHook, /DragDropEvent::Drop[\s\S]*if let Some\(state\) = window\.try_state::<DesktopState>\(\)/u);
  assert.match(rust, /admit_native_sources\(&worker, &paths, kind\)/u);
  assert.match(rust, /admit_native_sources\(&owned, &paths, "files"\)/u);
  assert.match(rust, /admit_native_sources\(&owned, &\[path\], "folder"\)/u);
  for (const command of ['select_files', 'select_folder']) {
    const start = rust.indexOf(`async fn ${command}(`);
    const end = rust.indexOf('\n#[tauri::command]', start);
    assert.ok(start >= 0 && end > start);
    assert.match(rust.slice(start, end), /selection_guard\(&state\.selection_busy, &state\.admission_present, true\)/u,
      `${command} must permit adding sources to a prepared batch`);
  }
  assert.match(rust.slice(rust.indexOf('fn native_drop('), rust.indexOf('fn request_id(')),
    /selection_guard\(&state\.selection_busy, &state\.admission_present, true\)/u,
    'native drops must extend a prepared batch through the same guarded admission');
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
  assert.match(html, /200 Dateien und 500 MB/u);
  assert.match(frontend, /SOURCE_FOLDER_FILE_LIMIT:[^\n]*mehr als 200/u);
  assert.match(frontend, /SOURCE_FOLDER_UNSUPPORTED_FILES:[^\n]*nicht unterstützte Datei/u);
  assert.match(frontend, /Extraktionsstatus wird getrennt ausgewiesen/u);
  assert.doesNotMatch(frontend, /nur bei vollständiger Abdeckung freigegeben/u);
  assert.doesNotMatch(html, /nur vollständig extrahierter Inhalt freigegeben/u);
  assert.match(html, /id="select-files"/u);
  assert.match(html, /id="select-folder"/u);
  assert.match(html, /value="" selected/u, 'purpose is an explicit user choice, not a startup default');
  assert.doesNotMatch(frontend, /invoke\(['"](?:convert|convert_only|start_conversion)/u);
});

test('processing purpose crosses only the explicit desktop Start and cannot change on resume', () => {
  assert.match(frontend, /call\('start_admitted_batch', startArguments\)/u);
  assert.match(frontend, /startArguments\.outputNamingMode = outputNamingMode/u);
  assert.match(rust, /#\[tauri::command\(rename_all = "camelCase"\)\]\s*async fn start_admitted_batch/u);
  assert.match(rust, /processing_mode: Option<String>/u);
  assert.match(rust, /output_naming_mode: Option<String>/u);
  assert.match(rust, /request\["processing_mode"\] = json!\(validate_processing_mode\(processing_mode\)\?\)/u);
  assert.match(rust, /request\["output_naming_mode"\] = json!\(value\)/u);
  assert.match(sidecar, /outputNamingMode: message\.output_naming_mode/u);
  assert.equal(require('../plugins/data-secure/server/core/desktop-error-contract').desktopErrorCode(
    'MARKDOWN_CONVERSION_NOT_READY'), 'MARKDOWN_CONVERSION_NOT_READY');
  const continuing = rust.slice(rust.indexOf('async fn continue_current_batch'), rust.indexOf('async fn configure_results'));
  assert.doesNotMatch(continuing, /processing_mode/u);
  assert.match(frontend, /byId\('continue'\)\.addEventListener\('click', \(\) => switchView\('results'\)\)/u);
  assert.match(frontend, /call\('continue_current_batch'\)/u);
  assert.match(sidecar, /service\.continueCurrentBatch\(undefined, \{ requireObserved: true \}\)/u);
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  assert.match(html, /value="" selected/u);
  assert.match(html, /id="processing-mode"[^>]* disabled/u, 'startup cannot choose a mode before status is known');
});

test('the native Windows smoke exercises the visible WebView lifecycle', () => {
  assert.match(nativeSmoke, /\[System\.Diagnostics\.Process\]::Start\(\$startInfo\)/u);
  assert.match(nativeSmoke, /ProcessWindowStyle\]::Normal/u);
  assert.doesNotMatch(nativeSmoke, /WindowStyle\s+(?:Hidden|Minimized)/iu,
    'hidden or minimized startup can defer WebView2 page loading');
  assert.match(nativeSmoke, /page_loaded/u);
  assert.match(nativeSmoke, /frontend_ready/u);
  for (const code of ['WEBVIEW_INITIALIZATION_TIMEOUT', 'SETUP_TIMEOUT', 'PAGE_LOAD_TIMEOUT', 'FRONTEND_READY_TIMEOUT', 'IPC_TIMEOUT']) {
    assert.ok(nativeSmoke.includes(`STANDALONE_NATIVE_${code}`));
  }
  assert.match(nativeSmoke, /Resolve-StandaloneArchiveIdentity/u);
  const host = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-host.ps1'), 'utf8');
  assert.match(host, /DataSecure-Standalone-\$version-windows-x64/u);
});

test('history actions are separately permissioned and carry only exact batch identity to the private host', () => {
  const permissions = fs.readFileSync(path.join(root, 'tauri-contract/permissions/commands.toml'), 'utf8');
  for (const action of ['get_run_history', 'get_run_failures', 'open_history_results', 'open_history_ledger', 'continue_history_batch']) {
    assert.ok(capability.permissions.includes(`allow-${action.replaceAll('_', '-')}`));
    assert.ok(permissions.includes(`commands.allow = ["${action}"]`));
    assert.ok(rust.includes(`async fn ${action}(`));
  }
  assert.match(rust, /fn history_request\(/u);
  assert.match(rust, /batch_id\.len\(\) != 64/u);
  assert.match(sidecar, /resolveHistoryResults\(message\.batch_id\)/u);
  assert.match(sidecar, /resolveHistoryLedger\(message\.batch_id\)/u);
  assert.match(sidecar, /continueHistoryBatch\(message\.batch_id\)/u);
  assert.match(frontend, /batchId: entry\.batch_id/u);
  assert.match(rust, /history_local_target\(resolved, kind, resolve_action == "resolve_history_identity_mapping"\)/u);
});

test('every documented UI command has a narrow native permission and exactly one window capability', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../plugins/data-secure/server/standalone/ui-contract.json'), 'utf8'));
  const permissions = fs.readFileSync(path.join(root, 'tauri-contract/permissions/commands.toml'), 'utf8');
  const reviewCapability = JSON.parse(fs.readFileSync(path.join(root, 'tauri-contract/capabilities/review.json'), 'utf8'));
  for (const command of contract.commands) {
    const permission = `allow-${command.replaceAll('_', '-')}`;
    assert.ok(permissions.includes(`commands.allow = ["${command}"]`), `${command} has no narrow permission`);
    const owners = [capability, reviewCapability].filter(window => window.permissions.includes(permission));
    assert.equal(owners.length, 1, `${command} must be available in precisely its owning local window`);
  }
  assert.ok(!reviewCapability.permissions.includes('allow-get-run-failures'),
    'the review window does not need access to unrelated source file names');
  const mainCommands = new Set([
    ...[...frontend.matchAll(/\b(?:invoke|choose)\('([a-z_]+)'/gu)].map(match => match[1]),
    ...[...frontend.matchAll(/\bcommand: '([a-z_]+)'/gu)].map(match => match[1])
  ]);
  assert.ok(mainCommands.has('get_run_failures'), 'regression must cover the actual renderer call, not only its contract');
  for (const command of mainCommands) {
    const permission = `allow-${command.replaceAll('_', '-')}`;
    assert.ok(capability.permissions.includes(permission), `${command} is called by main but denied by its native ACL`);
    assert.ok(permissions.includes(`commands.allow = ["${command}"]`), `${command} has no native permission declaration`);
  }
});

test('prepared selections remove exactly one item through the private native contract', () => {
  const permissions = fs.readFileSync(path.join(root, 'tauri-contract/permissions/commands.toml'), 'utf8');
  assert.ok(capability.permissions.includes('allow-remove-admitted-source'));
  assert.ok(permissions.includes('commands.allow = ["remove_admitted_source"]'));
  assert.match(rust, /async fn remove_admitted_source\([\s\S]{0,180}selection_index: u64/u);
  assert.match(rust, /removal_request\(&id, selection_index\)/u);
  assert.doesNotMatch(rust.match(/fn removal_request[\s\S]*?\n\}/u)?.[0] || '', /source_paths|raw_content/u);
});

test('native smoke isolates data, Documents, diagnostics and WebView before product startup', () => {
  const isolation = fs.readFileSync(path.join(root, 'tauri-contract/src/native_smoke.rs'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-host.ps1'), 'utf8');
  assert.doesNotMatch(nativeSmoke, /EnvironmentVariables\.Clear\(\)/u);
  assert.match(host, /Remove-StandaloneDesktopEnvironmentOverrides/u);
  assert.match(host, /WEBVIEW2_/u);
  assert.match(nativeSmoke, /\$nativeProfileParent = \[System\.IO\.Path\]::GetFullPath\(\[System\.IO\.Path\]::GetTempPath\(\)\)/u,
    'the NEW private smoke root uses the OS temporary namespace, never the checkout or an existing product profile');
  assert.match(nativeSmoke, /New-NativeCleanupContext \$nativeProfileParent/u);
  const nativeCleanup = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-cleanup.ps1'), 'utf8');
  assert.match(nativeCleanup, /SetAccessRuleProtection\(\$true, \$false\)/u);
  assert.match(nativeCleanup, /CreateDirectory\(\$root, \$security\)/u);
  assert.match(nativeCleanup, /STANDALONE_NATIVE_ROOT_ACL_UNSAFE/u);
  assert.ok(nativeCleanup.indexOf('CreateDirectory($root, $security)') < nativeCleanup.indexOf('Initialize-NativeTestIdentity $root'));
  assert.doesNotMatch(nativeSmoke, /\$env:(?:USERPROFILE|HOME|LOCALAPPDATA|APPDATA|TEMP|TMP|CODEX_HOME)\s*=/iu);
  for (const key of ['USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'DATASECURE_STANDALONE_DOCUMENTS_DIR']) {
    assert.ok((isolation + rust).includes(key));
  }
  assert.match(nativeSmoke, /\$expected = if \(\$LegacyProfileContract\)[\s\S]*else \{\s*@\{ WEBVIEW2_USER_DATA_FOLDER = 'webview\\main' \}/u,
    'the current desktop inherits its real Windows environment; only the historical control uses legacy redirects');
  assert.match(nativeSmoke, /WEBVIEW2_USER_DATA_FOLDER = 'webview\\main'/u);
  assert.match(isolation, /environment\("WEBVIEW2_USER_DATA_FOLDER"\)\.map\(PathBuf::from\)/u);
  assert.match(nativeSmoke, /STANDALONE_NATIVE_ISOLATION_UNSUPPORTED/u, 'old binaries must not be launched');
  assert.match(nativeSmoke, /ValidateIsolationOnly/u);
  const readinessDeadline = nativeSmoke.indexOf('$deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)');
  const pollingStart = nativeSmoke.indexOf('    do {', readinessDeadline);
  const pollingEnd = nativeSmoke.indexOf('    } while (', pollingStart);
  assert.ok(readinessDeadline >= 0 && pollingStart > readinessDeadline && pollingEnd > pollingStart,
    'native readiness polling block must remain structurally discoverable');
  const polling = nativeSmoke.slice(pollingStart, pollingEnd);
  assert.ok(polling.indexOf('Assert-NativeProcessRunning $process') >= 0);
  assert.match(polling, /Get-NativeNetworkObservation/u,
    'listener evidence is sampled during startup instead of only after readiness');
  assert.ok(polling.indexOf('Assert-NativeProcessRunning $process') < polling.indexOf('Read-InteractionEvents'),
    'exit before the first application event must be reported before the no-events continue branch');
  assert.match(isolation, /executable\.ancestors\(\)\.any\(is_reserved_root\)/u);
  assert.match(nativeSmoke, /Get-CheckedTree/u);
  assert.match(nativeSmoke, /network_observed = \[bool\] \$AssertNoListeners/u);
  assert.match(nativeSmoke, /STANDALONE_NATIVE_UDP_OBSERVER_INVALID/u);
  assert.match(nativeSmoke, /ExpectedRootExecutable/u);
  assert.match(nativeSmoke, /--user-data-dir/u);
  assert.doesNotMatch(nativeSmoke, /(?:Get-ChildItem|Remove-Item)[^\n]*-Recurse/u);
  const main = rust.slice(rust.indexOf('fn main()'), rust.indexOf('#[cfg(test)]\nmod tests'));
  assert.ok(main.indexOf('native_smoke::from_environment()') < main.indexOf('diagnostic_event('));
  assert.match(main, /Err\(_\) => std::process::exit\(65\)/u);
  assert.doesNotMatch(main, /window\.create = false/u);
  assert.match(main, /prepare_webview_directory\(value\)/u);
  assert.doesNotMatch(main, /WebviewWindowBuilder/u);
  assert.doesNotMatch(main, /\.data_directory\(/u);
  assert.match(main, /application_run_failed/u);
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

test('native archive identity is parsed explicitly for current and historical candidates', () => {
  const hostPath = path.join(__dirname, 'manual/standalone-native-host.ps1');
  const host = fs.readFileSync(hostPath, 'utf8');
  assert.doesNotMatch(host, /\$Matches/u, 'implicit global PowerShell match state must not bind evidence');
  assert.match(host, /Regex\]::Match/u);
  if (process.platform !== 'win32') return;
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', hostPath,
    '-ValidateContract'],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /HOST CONTRACT PASS/u);
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
  assert.match(cleanup, /Get-NativeEntryStamp \$entry -AllowVanished/u);
  assert.match(cleanup, /STANDALONE_NATIVE_IDENTITY_FAILED:2/u);
  assert.match(cleanup, /try \{ \$null = \[DataSecure\.NativeTestIdentity\]::Read\(\$Item\.FullName\) \}/u);
  assert.doesNotMatch(cleanup, /(?:Get-ChildItem|Remove-Item)[^\n]*-Recurse/u);
  assert.doesNotMatch(cleanup, /Directory\]::Delete\([^\n]*,/u);
  if (process.platform === 'win32') {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'manual/standalone-native-cleanup-test.ps1')],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /CLEANUP CONTRACT PASS \(9 groups\)/u);
  }
});

test('package contract excludes Claude, Cowork, MCP and skill material', () => {
  const forbidden = targets.forbidden_package_entries.map((value) => value.toLowerCase());
  for (const marker of ['.claude-plugin', '.mcp.json', 'skills/', 'mcp-server.js', 'claude', 'cowork']) {
    assert.ok(forbidden.includes(marker));
  }
});

test('active Markdown conversion requires its own offline runtime independently of the optional MarkItDown oracle', () => {
  assert.ok(targets.required_package_entries.includes('architecture-matched converter runtime'));
  assert.ok(targets.required_package_entries.includes('bundled offline German and English OCR models'));
  assert.strictEqual(targets.feature_gated_package_entries, undefined);
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
  assert.match(guide, /Intel- und Apple-Silicon-Runnern/u);
  assert.match(guide, /sichtbare menschliche Abnahme bleibt offen/u);
  assert.match(guide, /upload_package/u);
  assert.match(guide, /einem Tag Aufbewahrung/u);
});

done();
