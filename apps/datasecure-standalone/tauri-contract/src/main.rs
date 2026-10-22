#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_smoke;
mod ipc_transport;
mod ipc_activity;
mod review_window;
mod native_open;
mod startup_diagnostics;
mod diagnostic_log;
mod diagnostic_bundle;
#[cfg(any(target_os = "macos", test))]
mod diagnostic_probe;
mod export_directory;
mod export_private_security;
mod native_export_channel;
mod native_export_broker;
mod native_export_transaction;
mod native_export_workspace;
mod source_fingerprint;
#[cfg(target_os = "macos")]
mod macos_core;
mod content_start;
#[cfg(windows)]
mod private_namespace;

use serde_json::{json, Value};
use std::{
    io::{BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES: usize = 768 * 1024;
const MAX_SINGLE_PATH_BYTES: usize = 32767;
const MAX_BATCH_FILES: usize = 200;
const MAX_PRESENTATION_GENERATION: u64 = 9_007_199_254_740_991;
const IPC_SCHEMA: &str = "datasecure-standalone-private-ipc/1";
const RESPONSE_SCHEMA: &str = "datasecure-standalone-private-response/1";
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static DIAGNOSTIC_SESSION: OnceLock<String> = OnceLock::new();
static NATIVE_SMOKE_PROFILE: OnceLock<Option<native_smoke::Profile>> = OnceLock::new();

fn build_id() -> &'static str {
    source_fingerprint::diagnostic_build_id(option_env!("DATASECURE_BUILD_ID"))
}

fn runtime_target() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

#[cfg(target_os = "macos")]
fn macos_product_version() -> Option<&'static str> {
    static VERSION: OnceLock<Option<String>> = OnceLock::new();
    VERSION.get_or_init(|| {
        // Ask the kernel directly: a managed Mac may disallow a shell or CLI.
        // Accept only a short numeric version, never a path or raw OS output.
        let mut value = [0u8; 32];
        let mut size = value.len();
        let status = unsafe {
            libc::sysctlbyname(c"kern.osproductversion".as_ptr(),
                value.as_mut_ptr().cast(), &mut size, std::ptr::null_mut(), 0)
        };
        if status != 0 || size == 0 || size > value.len() { return None; }
        let version = value[..size].split(|byte| *byte == 0).next()?;
        if version.is_empty() || version.len() > 16 ||
            !version.iter().all(|byte| byte.is_ascii_digit() || *byte == b'.') {
            return None;
        }
        String::from_utf8(version.to_vec()).ok()
    }).as_deref()
}

#[cfg(target_os = "macos")]
fn macos_quarantine_code(path: &Path) -> &'static str {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let Ok(path) = CString::new(path.as_os_str().as_bytes()) else {
        return "STANDALONE_QUARANTINE_UNKNOWN";
    };
    // Inspect presence only; the extended-attribute value can contain a
    // download origin and must never enter a product diagnostic.
    let size = unsafe { libc::getxattr(path.as_ptr(), c"com.apple.quarantine".as_ptr(),
        std::ptr::null_mut(), 0, 0, 0) };
    if size >= 0 { return "STANDALONE_QUARANTINE_PRESENT"; }
    if std::io::Error::last_os_error().raw_os_error() == Some(libc::ENOATTR) {
        "STANDALONE_QUARANTINE_ABSENT"
    } else {
        "STANDALONE_QUARANTINE_UNKNOWN"
    }
}

#[cfg(target_os = "macos")]
fn diagnostic_macos_quarantine(executable: &Path) {
    let core = macos_quarantine_code(executable);
    diagnostic_event("core_quarantine_state", None,
        if core == "STANDALONE_QUARANTINE_UNKNOWN" { "unavailable" } else { "ready" },
        Some(core), None);
    let bundle = executable.ancestors().find(|candidate|
        candidate.extension() == Some(std::ffi::OsStr::new("app")));
    let app = bundle.map(macos_quarantine_code).unwrap_or("STANDALONE_APP_BUNDLE_UNAVAILABLE");
    diagnostic_event("app_quarantine_state", None,
        if app == "STANDALONE_QUARANTINE_UNKNOWN" || app == "STANDALONE_APP_BUNDLE_UNAVAILABLE" {
            "unavailable"
        } else { "ready" }, Some(app), None);
}

#[cfg(target_os = "windows")]
fn windows_attributes_contain_reparse_point(attributes: u32) -> bool {
    attributes & 0x400 != 0
}

#[cfg(target_os = "windows")]
fn metadata_is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    windows_attributes_contain_reparse_point(metadata.file_attributes())
}

#[cfg(not(target_os = "windows"))]
fn metadata_is_reparse_point(_metadata: &std::fs::Metadata) -> bool {
    false
}

fn diagnostic_session() -> &'static str {
    DIAGNOSTIC_SESSION.get_or_init(|| {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        format!("{:08x}{nanos:032x}", std::process::id())
    })
}

fn diagnostic_directory() -> PathBuf {
    if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
        return profile.diagnostics.clone();
    }
    std::env::temp_dir().join("SecureDataMsg-Standalone")
}

fn diagnostic_event(
    event: &str,
    action: Option<&str>,
    outcome: &str,
    error_code: Option<&str>,
    elapsed_ms: Option<u128>,
) {
    diagnostic_correlated_event(event, action, outcome, error_code, elapsed_ms, None, None);
}

fn diagnostic_process_event(event: &str, outcome: &str, error_code: Option<&str>,
    elapsed_ms: Option<u128>, process_id: u32) {
    diagnostic_correlated_event(event, None, outcome, error_code, elapsed_ms, None,
        Some(process_id));
}

fn diagnostic_request_id(id: &str) -> Option<&str> {
    ((16..=64).contains(&id.len()) && id.bytes().all(|value| value.is_ascii_hexdigit() && !value.is_ascii_uppercase()))
        .then_some(id)
}

fn diagnostic_ipc_event(event: &str, action: &str, id: &str, outcome: &str,
    error_code: Option<&str>, elapsed_ms: Option<u128>) {
    diagnostic_correlated_event(event, Some(action), outcome, error_code, elapsed_ms,
        diagnostic_request_id(id), None);
}

fn diagnostic_correlated_event(
    event: &str,
    action: Option<&str>,
    outcome: &str,
    error_code: Option<&str>,
    elapsed_ms: Option<u128>,
    request_id: Option<&str>,
    process_id: Option<u32>,
) {
    let mut record = json!({
        "schema": "datasecure-standalone-interaction/1",
        "time_ms": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        "component": "desktop",
        "session_id": diagnostic_session(),
        "event": event,
        "outcome": outcome,
        "product_version": env!("CARGO_PKG_VERSION"),
        "build_id": build_id(),
        "runtime_target": runtime_target()
    });
    #[cfg(target_os = "macos")]
    if let Some(value) = macos_product_version() {
        record["os_version"] = json!(value);
    }
    if let Some(value) = action {
        record["action"] = json!(value);
    }
    if let Some(value) = error_code {
        record["error_code"] = json!(value);
    }
    if let Some(value) = elapsed_ms {
        record["elapsed_ms"] = json!(value);
    }
    if let Some(value) = request_id {
        record["request_id"] = json!(value);
    }
    if let Some(value) = process_id {
        record["process_id"] = json!(value);
    }
    diagnostic_log::append(&diagnostic_directory(), &record);
}

// Constructed only from a fixed native stage, ErrorKind enum name and i32 OS
// code. Never append io::Error Display/Debug, pathnames, ACLs or Binding values.
fn diagnostic_native_configure_failure(failure: native_export_broker::ConfigureFailure) {
    let record = json!({
        "schema": "datasecure-standalone-interaction/1",
        "time_ms": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        "component": "desktop", "session_id": diagnostic_session(),
        "event": "native_configure_failed", "action": "configure_results", "outcome": "failed",
        "product_version": env!("CARGO_PKG_VERSION"), "build_id": build_id(), "runtime_target": runtime_target(),
        "configure_stage": failure.stage, "io_error_kind": failure.io_error_kind,
        "raw_os_error": failure.raw_os_error
    });
    diagnostic_log::append(&diagnostic_directory(), &record);
}

// Only a failed Windows NtCreateFile with a non-null creation descriptor
// produces this fixed, content-free event. It is not a renderer error or a
// configure-only claim: other controlled directory callers use the same gate.
#[cfg(windows)]
fn diagnostic_native_controlled_directory_create_failure(
    failure: export_directory::ControlledDirectoryCreateFailure,
) {
    let record = json!({
        "schema": "datasecure-standalone-interaction/1",
        "time_ms": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        "component": "desktop", "session_id": diagnostic_session(),
        "event": "native_controlled_create_failed", "outcome": "failed",
        "product_version": env!("CARGO_PKG_VERSION"), "build_id": build_id(), "runtime_target": runtime_target(),
        "controlled_create": failure
    });
    diagnostic_log::append(&diagnostic_directory(), &record);
}

struct SidecarProcess {
    child: ipc_transport::ChildControl,
    writes: mpsc::Sender<ipc_transport::WriteRequest>,
    responses: Receiver<Result<Value, String>>,
    owner_generation: String,
    unusable: bool,
    #[cfg(windows)]
    namespace: Arc<private_namespace::PreparedNamespace>,
    #[cfg(windows)]
    namespace_identity: export_directory::Identity,
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        self.child.terminate();
    }
}

struct DesktopState {
    app: AppHandle,
    sidecar: Arc<Mutex<Option<SidecarProcess>>>,
    activity: ipc_activity::Tracker,
    connection_epoch: Arc<AtomicU64>,
    expected_connection_epoch: u64,
    bootstrap_retry_epoch: Option<u64>,
    retired_owner_generations: Arc<Mutex<Vec<String>>>,
    lifecycle: ipc_transport::Lifecycle,
    exit_gate: ipc_transport::ExitGate,
    selection_busy: Arc<AtomicBool>,
    admission_present: Arc<AtomicBool>,
    frontend_ready: Arc<AtomicBool>,
    review_window_binding: Arc<Mutex<review_window::Binding>>,
    embedded_review_active: Arc<AtomicBool>,
    document_review_batch: Arc<Mutex<Option<String>>>,
    review_ui_busy: Arc<AtomicBool>,
}

impl Clone for DesktopState {
    fn clone(&self) -> Self {
        Self { app: self.app.clone(), sidecar: self.sidecar.clone(), lifecycle: self.lifecycle.clone(),
            activity: self.activity.clone(),
            connection_epoch: self.connection_epoch.clone(),
            expected_connection_epoch: self.expected_connection_epoch,
            bootstrap_retry_epoch: self.bootstrap_retry_epoch,
            retired_owner_generations: self.retired_owner_generations.clone(),
            exit_gate: self.exit_gate.clone(), selection_busy: self.selection_busy.clone(),
            admission_present: self.admission_present.clone(), frontend_ready: self.frontend_ready.clone(),
            review_window_binding: self.review_window_binding.clone(), embedded_review_active: self.embedded_review_active.clone(),
            document_review_batch: self.document_review_batch.clone(), review_ui_busy: self.review_ui_busy.clone() }
    }
}

impl DesktopState {
    // Only a real command/event ingress may capture a new connection. Copies
    // made after delegation preserve that capture, even across an await.
    fn capture_connection(&self) -> Self {
        let mut captured = self.clone();
        captured.expected_connection_epoch = self.connection_epoch.load(Ordering::Acquire);
        captured.bootstrap_retry_epoch = None;
        captured
    }
}

fn invalidate_connection(state: &DesktopState) {
    invalidate_connection_with_bootstrap_failure(state, None);
}

fn invalidate_connection_with_bootstrap_failure(state: &DesktopState, bootstrap_code: Option<&str>) {
    let observed = state.lifecycle.record_connection_change(&state.connection_epoch, bootstrap_code);
    let (epoch, failure) = match observed {
        Ok(snapshot) => (snapshot.connection_epoch, snapshot.failure),
        // A poisoned lifecycle can never produce a resolution receipt. Still
        // invalidate queued ingress and retain the fixed fail-closed cause.
        Err(_) => {
            let epoch = state.connection_epoch.fetch_add(1, Ordering::AcqRel) + 1;
            (epoch, Some(ipc_transport::BootstrapFailure { epoch, code: ipc_transport::FAILED.into() }))
        }
    };
    state.admission_present.store(false, Ordering::Release);
    state.embedded_review_active.store(false, Ordering::Release);
    if let Ok(mut binding) = state.review_window_binding.lock() { binding.opened(); }
    if let Ok(mut binding) = state.document_review_batch.lock() { *binding = None; }
    let event = if bootstrap_code.is_some() {
        let code = failure.as_ref().map(|failure| failure.code.as_str()).unwrap_or(ipc_transport::FAILED);
        json!({ "epoch": epoch, "state": "bootstrap_failed", "error_code": code })
    } else { json!({ "epoch": epoch, "state": "recovering" }) };
    let _ = state.app.emit("datasecure-connection", event);
}

// Requested while holding the sidecar mutex, but drained/reaped without it.
// Keep the exact process object stored until every native capability has ended.
fn schedule_sidecar_retirement(state: &DesktopState, process: &SidecarProcess) -> Result<(), String> {
    let sidecar = state.sidecar.clone();
    let retired = state.retired_owner_generations.clone();
    let child = process.child.clone(); let generation = process.owner_generation.clone();
    state.lifecycle.retire_async(child.clone(), move || {
        let result = (|| {
            let mut process = sidecar.lock().map_err(|_| ipc_transport::FAILED.to_string())?;
            if !process.as_ref().is_some_and(|value| value.child.same(&child) && value.owner_generation == generation) {
                return Err(ipc_transport::FAILED.to_string());
            }
            let mut retired = retired.lock().map_err(|_| ipc_transport::FAILED.to_string())?;
            if !retired.contains(&generation) { retired.push(generation); }
            process.take(); // Drop now sees a confirmed, already-reaped child.
            Ok::<(), String>(())
        })();
        diagnostic_event("sidecar_retirement_finished", None, if result.is_ok() { "ready" } else { "failed" },
            result.as_ref().err().map(String::as_str), None);
        result
    })
}

struct SelectionGuard(Arc<AtomicBool>);

impl Drop for SelectionGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn selection_guard(
    busy: &Arc<AtomicBool>,
    admitted: &AtomicBool,
    allow_admitted: bool,
) -> Result<SelectionGuard, String> {
    busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "STANDALONE_BUSY".to_string())?;
    let guard = SelectionGuard(busy.clone());
    if !allow_admitted && admitted.load(Ordering::Acquire) {
        return Err("STANDALONE_SELECTION_PREPARED".to_string());
    }
    Ok(guard)
}

fn dropped_source_kind(paths: &[PathBuf]) -> Result<&'static str, String> {
    if paths.is_empty() || paths.len() > MAX_BATCH_FILES {
        return Err("STANDALONE_SELECTION_INVALID".to_string());
    }
    strict_path_strings(paths)?;
    let mut folders = 0;
    for path in paths {
        if !path.is_absolute() {
            return Err("STANDALONE_SELECTION_INVALID".to_string());
        }
        let metadata = std::fs::symlink_metadata(path)
            .map_err(|_| "STANDALONE_SELECTION_INVALID".to_string())?;
        if metadata_is_reparse_point(&metadata) {
            return Err("STANDALONE_SELECTION_INVALID".to_string());
        }
        if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
            return Err("STANDALONE_SELECTION_INVALID".to_string());
        }
        folders += usize::from(metadata.is_dir());
    }
    match (folders, paths.len()) {
        (0, _) => Ok("files"),
        (1, 1) => Ok("folder"),
        _ => Err("STANDALONE_DROP_MIXED".to_string()),
    }
}

fn state_allows_new_admission(current: &Value) -> bool {
    let state = current.get("state").and_then(Value::as_str);
    if state == Some("start_failed") {
        // No journal exists for this attempt. Only explicit, confirmed worker
        // inactivity admits a fresh selection; absent/malformed status is not
        // permission to retry. The service rechecks live activity on admission.
        return current.pointer("/intake_failure/error_code").and_then(Value::as_str)
            == Some("STANDALONE_START_FAILED")
            && current.pointer("/intake_failure/worker_active").and_then(Value::as_bool) == Some(false);
    }
    if state == Some("paused") {
        // A selected historical pause can be projected before another active
        // worker. Admit a new selection only with both explicit quiescent
        // flags; the service still rechecks live intake/processing afterwards.
        return current.get("processing").and_then(Value::as_bool) == Some(false)
            && current.get("preparing").and_then(Value::as_bool) == Some(false);
    }
    matches!(
        state,
        Some(
            "ready"
                | "results_available"
                | "completed_without_results"
                | "review_required"
                | "stopped"
                | "export_pending"
        )
    )
}

fn workspace_catalogue_path(path: &str) -> bool {
    path == "/workspace.html" || path == "workspace.html"
}

fn admit_native_sources(
    state: &DesktopState,
    paths: &[PathBuf],
    kind: &str,
) -> Result<Value, String> {
    if state.embedded_review_active.load(Ordering::Acquire) {
        return Err("STANDALONE_BUSY".to_string());
    }
    let current = rpc(state, "get_public_state", None, &[], None, None)?;
    if !state_allows_new_admission(&current) {
        return Err("STANDALONE_BUSY".to_string());
    }
    // Bind tolerant catalogue admission to the actual v2 main asset. The
    // legacy renderer must retain atomic mixed-folder rejection until it can
    // display every blocked file. Never take this switch from a file path or
    // a renderer-supplied argument.
    let catalogue = state.app.get_webview_window("main")
        .and_then(|window| window.url().ok())
        .is_some_and(|url| workspace_catalogue_path(url.path()));
    let id = request_id();
    let mut request = private_request(&id, "admit_selected_sources", Some(kind), paths, None, None)?;
    if catalogue { request["source_catalogue"] = json!(true); }
    let result = rpc_request(state, "admit_selected_sources", &id, request)?;
    state.admission_present.store(true, Ordering::Release);
    Ok(result)
}

// Our application event carries the existing local display context after the
// same admission validator used by the picker. Tauri also emits its built-in
// drag-drop event with selected paths; this UI only subscribes to our event.
fn native_drop(state: &DesktopState, paths: Vec<PathBuf>) {
    let state = &state.capture_connection();
    if !state.frontend_ready.load(Ordering::Acquire) {
        return;
    }
    diagnostic_event(
        "drop_received",
        Some("admit_selected_sources"),
        "progress",
        None,
        None,
    );
    let guard = match selection_guard(&state.selection_busy, &state.admission_present, true) {
        Ok(value) => value,
        Err(code) => {
            diagnostic_event(
                "drop_rejected",
                Some("admit_selected_sources"),
                "failed",
                Some(&code),
                None,
            );
            let _ = state.app.emit_to(
                "main",
                "datasecure-native-drop",
                json!({"phase": "rejected", "error_code": code}),
            );
            return;
        }
    };
    let review_guard = match review_admission_guard(state) {
        Ok(value) => value,
        Err(code) => {
            let _ = state.app.emit_to("main", "datasecure-native-drop",
                json!({"phase": "rejected", "error_code": code}));
            return;
        }
    };
    let owned = state.clone();
    let _ = owned.app.emit_to(
        "main",
        "datasecure-native-drop",
        json!({"phase": "checking", "epoch": owned.expected_connection_epoch}),
    );
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let _review_guard = review_guard;
        let worker = owned.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let kind = dropped_source_kind(&paths)?;
            admit_native_sources(&worker, &paths, kind)
        })
        .await
        .unwrap_or_else(|_| Err("STANDALONE_OPERATION_FAILED".to_string()));
        match result {
            Ok(result) => {
                diagnostic_event(
                    "drop_admitted",
                    Some("admit_selected_sources"),
                    "ready",
                    None,
                    None,
                );
                let _ = owned.app.emit_to(
                    "main",
                    "datasecure-native-drop",
                    json!({"phase": "accepted", "epoch": owned.expected_connection_epoch, "result": result}),
                );
            }
            Err(error) => {
                let (code, details) = local_error_parts(&error);
                diagnostic_event(
                    "drop_rejected",
                    Some("admit_selected_sources"),
                    "failed",
                    Some(&code),
                    None,
                );
                let _ = owned.app.emit_to(
                    "main",
                    "datasecure-native-drop",
                    json!({"phase": "failed", "epoch": owned.expected_connection_epoch, "error_code": code, "error_details": details}),
                );
            }
        }
    });
}

fn request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:016x}{sequence:016x}")
}

fn existing(
    candidates: impl IntoIterator<Item = PathBuf>,
    mut metadata: impl FnMut(&Path) -> std::io::Result<std::fs::Metadata>,
) -> std::io::Result<Option<PathBuf>> {
    for candidate in candidates {
        match metadata(&candidate) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => return Ok(Some(candidate)),
            // A denied packaged candidate is not absence and never authorizes
            // trying another Core or a development-checkout fallback.
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return Err(error),
            _ => {}
        }
    }
    Ok(None)
}

fn runtime_lookup_code(error: &std::io::Error) -> &'static str {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        "STANDALONE_RUNTIME_DENIED"
    } else { "STANDALONE_RUNTIME_MISSING" }
}

fn runtime_resource_code(error: &tauri::utils::Error) -> &'static str {
    match error {
        tauri::utils::Error::Io(error) => runtime_lookup_code(error),
        _ => "STANDALONE_RUNTIME_MISSING",
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RuntimeComponent {
    Core,
    SidecarScript,
    NetworkDeny,
}

impl RuntimeComponent {
    fn diagnostic_code(self) -> &'static str {
        match self {
            Self::Core => "STANDALONE_BUNDLED_CORE_UNAVAILABLE",
            Self::SidecarScript => "STANDALONE_BUNDLED_SIDECAR_UNAVAILABLE",
            Self::NetworkDeny => "STANDALONE_BUNDLED_NETWORK_DENY_UNAVAILABLE",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RuntimeComponentFailure {
    component: RuntimeComponent,
    code: &'static str,
}

fn required_runtime_component(
    candidates: impl IntoIterator<Item = PathBuf>,
    component: RuntimeComponent,
) -> Result<PathBuf, RuntimeComponentFailure> {
    required_runtime_component_with_metadata(candidates, component, |candidate| std::fs::symlink_metadata(candidate))
}

fn required_runtime_component_with_metadata(
    candidates: impl IntoIterator<Item = PathBuf>,
    component: RuntimeComponent,
    metadata: impl FnMut(&Path) -> std::io::Result<std::fs::Metadata>,
) -> Result<PathBuf, RuntimeComponentFailure> {
    existing(candidates, metadata)
        .map_err(|error| RuntimeComponentFailure { component, code: runtime_lookup_code(&error) })?
        .ok_or(RuntimeComponentFailure { component, code: "STANDALONE_RUNTIME_MISSING" })
}

fn missing_runtime_component(component: RuntimeComponent) -> String {
    runtime_component_failure(RuntimeComponentFailure { component, code: "STANDALONE_RUNTIME_MISSING" })
}

fn runtime_component_failure(failure: RuntimeComponentFailure) -> String {
    // A fixed component code identifies the broken package without persisting
    // a path or OS message. Access refusal remains distinct from absence;
    // directories and symlinks remain ineligible as bundled files.
    diagnostic_event(
        "runtime_component_unavailable",
        None,
        "failed",
        Some(failure.component.diagnostic_code()),
        None,
    );
    failure.code.to_string()
}

// Tauri can return valid Windows resource paths in verbatim form (`\\?\C:\...`).
// Node starts that executable, but rejects the verbatim working directory before
// it can load the sidecar. Convert only the process-launch spelling after the
// exact files have already passed the regular-file checks above.
fn child_process_path(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let value = path.to_string_lossy();
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}

fn runtime_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // Use the same Tauri resolver, before PathResolver erases its IO cause as
    // UnknownPath (including current_exe/Resources canonicalization refusal).
    let resource = tauri::utils::platform::resource_dir(app.package_info(), &app.env())
        .map_err(|error| runtime_resource_code(&error).to_string())?;
    #[cfg(not(target_os = "macos"))]
    let target = if cfg!(target_os = "windows") {
        "datasecure-core-x86_64-pc-windows-msvc.exe"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "datasecure-core-aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "datasecure-core-x86_64-apple-darwin"
    } else {
        "datasecure-core-x86_64-unknown-linux-gnu"
    };
    #[cfg(not(target_os = "macos"))]
    let executable_directory = match std::env::current_exe() {
        Ok(value) => value.parent().map(Path::to_path_buf),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return Err(runtime_lookup_code(&error).into()),
        Err(_) => None,
    };
    #[cfg(not(target_os = "macos"))]
    let bundled_name = if cfg!(target_os = "windows") {
        "datasecure-core.exe"
    } else {
        "datasecure-core"
    };
    #[cfg(not(target_os = "macos"))]
    let mut executable_candidates = vec![
        resource.join(target),
        resource.join("binaries").join(target),
    ];
    #[cfg(not(target_os = "macos"))]
    if let Some(directory) = executable_directory {
        // Tauri removes the target-triple suffix from externalBin entries and
        // puts the executable next to the application binary. Keep the exact
        // target-named candidates for the existing portable Windows package.
        executable_candidates.push(directory.join(bundled_name));
        executable_candidates.push(directory.join(target));
    }
    #[cfg(not(target_os = "macos"))]
    if cfg!(debug_assertions) {
        executable_candidates.push(manifest.join("binaries").join(target));
    }
    #[cfg(target_os = "macos")]
    let executable_candidates = vec![std::env::current_exe().map_err(|error| runtime_lookup_code(&error).to_string())?
        .parent().ok_or("STANDALONE_RUNTIME_MISSING")?.join("datasecure-core")];
    let executable = required_runtime_component(executable_candidates, RuntimeComponent::Core)
        .map_err(runtime_component_failure)?;
    let packaged_script = resource
        .join("server")
        .join("standalone")
        .join("desktop-sidecar.js");
    let mut script_candidates = vec![packaged_script];
    if cfg!(debug_assertions) {
        script_candidates.push(
            manifest
                .join("..")
                .join("..")
                .join("..")
                .join("plugins")
                .join("data-secure")
                .join("server")
                .join("standalone")
                .join("desktop-sidecar.js"),
        );
    }
    let script = required_runtime_component(script_candidates, RuntimeComponent::SidecarScript)
        .map_err(runtime_component_failure)?;
    let network_deny = script
        .parent()
        .and_then(Path::parent)
        .map(|server| server.join("network-deny.cjs"))
        .ok_or_else(|| missing_runtime_component(RuntimeComponent::NetworkDeny))?;
    let network_deny = required_runtime_component([network_deny], RuntimeComponent::NetworkDeny)
        .map_err(runtime_component_failure)?;
    Ok((executable, script, network_deny))
}

fn configure_support_trace(command: &mut Command, setting: Option<&std::ffi::OsStr>) {
    command.env_remove("EU_PRIVACY_SUPPORT_MODE");
    if setting == Some(std::ffi::OsStr::new("1")) {
        command.env("EU_PRIVACY_SUPPORT_MODE", "1");
    }
}

fn runtime_spawn_code(error: &std::io::Error) -> &'static str {
    runtime_spawn_code_for_os(error, std::env::consts::OS)
}

fn runtime_spawn_code_for_os(error: &std::io::Error, os: &str) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "STANDALONE_RUNTIME_MISSING",
        std::io::ErrorKind::PermissionDenied => "STANDALONE_RUNTIME_DENIED",
        _ if os == "windows" && matches!(error.raw_os_error(), Some(193 | 216)) => "STANDALONE_RUNTIME_ARCHITECTURE_INVALID",
        _ if os == "macos" && matches!(error.raw_os_error(), Some(86)) => "STANDALONE_RUNTIME_ARCHITECTURE_INVALID",
        _ if os == "macos" && matches!(error.raw_os_error(), Some(85 | 88)) => "STANDALONE_RUNTIME_BINARY_INVALID",
        _ if os != "windows" && matches!(error.raw_os_error(), Some(8)) => "STANDALONE_RUNTIME_ARCHITECTURE_INVALID",
        _ => "STANDALONE_RUNTIME_START_FAILED",
    }
}

#[cfg(test)]
fn reserve_sidecar_generation(lifecycle: &ipc_transport::Lifecycle, generations: &Mutex<Vec<String>>)
    -> Result<(ipc_transport::SpawnGuard, String, Vec<String>), String> {
    reserve_sidecar_generation_for_retry(lifecycle, generations, None)
}

fn reserve_sidecar_generation_for_retry(lifecycle: &ipc_transport::Lifecycle, generations: &Mutex<Vec<String>>,
    retry_epoch: Option<u64>) -> Result<(ipc_transport::SpawnGuard, String, Vec<String>), String> {
    let guard = lifecycle.begin_bootstrap(retry_epoch)?;
    let mut entropy = [0u8; 16];
    getrandom::fill(&mut entropy).map_err(|_| ipc_transport::FAILED.to_string())?;
    let generation: String = entropy.iter().map(|value| format!("{value:02x}")).collect();
    let mut retired = generations.lock().map_err(|_| ipc_transport::FAILED.to_string())?;
    if retired.len() >= 16 { return Err("STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED".to_string()); }
    let previous = retired.clone(); retired.push(generation.clone());
    Ok((guard, generation, previous))
}

fn configure_core_environment(command: &mut Command, app: &tauri::AppHandle) {
    command.env_clear();
    for key in ["SYSTEMROOT", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "LC_CTYPE"] {
        if let Some(value) = std::env::var_os(key) { command.env(key, value); }
    }
    if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
        for (key, value) in [
            ("USERPROFILE", &profile.user_profile), ("HOME", &profile.user_profile),
            ("LOCALAPPDATA", &profile.local_app_data), ("APPDATA", &profile.roaming_app_data),
            ("XDG_DATA_HOME", &profile.xdg_data), ("TEMP", &profile.temp),
            ("TMP", &profile.temp), ("TMPDIR", &profile.temp),
        ] { command.env(key, value); }
        command.env("DATASECURE_STANDALONE_DOCUMENTS_DIR", &profile.documents);
    } else {
        for key in ["TEMP", "TMP", "TMPDIR", "USERPROFILE", "HOME", "LOCALAPPDATA", "APPDATA", "XDG_DATA_HOME"] {
            if let Some(value) = std::env::var_os(key) { command.env(key, value); }
        }
        if let Ok(documents) = app.path().document_dir() {
            command.env("DATASECURE_STANDALONE_DOCUMENTS_DIR", documents);
        }
    }
    command.env("DATASECURE_PRODUCT_CHANNEL", "standalone");
    #[cfg(not(target_os = "macos"))]
    command.env("DATASECURE_OWNERSHIP_GUARD_SHA256", source_fingerprint::ownership_guard_sha256());
    #[cfg(target_os = "macos")]
    { command.env("DATASECURE_MACOS_STATIC_CORE_SHA256", source_fingerprint::macos_static_core_sha256());
      command.env("DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256", source_fingerprint::macos_static_core_artifact_sha256()); }
    #[cfg(target_os = "macos")]
    command.env("DATASECURE_BUNDLED_RUNTIME_REQUIRED", "1");
    command.env("DATASECURE_STANDALONE_DIAGNOSTIC_SESSION", diagnostic_session());
    command.env("DATASECURE_STANDALONE_DIAGNOSTIC_DIR", diagnostic_directory());
}

#[cfg(target_os = "macos")]
fn macos_core_probe(app: &tauri::AppHandle, executable: &Path, script_directory: &Path) {
    use std::os::unix::process::ExitStatusExt;
    // Compose only the two fixed, read-only commands before scheduling. No
    // Child exists until the diagnostic thread was successfully started.
    let commands: [Command; 2] = std::array::from_fn(|index| {
        let mut command = Command::new(child_process_path(executable));
        configure_core_environment(&mut command, app);
        command.current_dir(child_process_path(script_directory))
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        if index == 0 {
            command.arg("--version");
        } else {
            command.arg("--require=../network-deny.cjs")
                .arg("-e").arg("process.exit(0)");
        }
        command
    });
    let executable = executable.to_path_buf();
    // Capture commands and a fixed Core path only: never AppHandle, Lifecycle,
    // SpawnGuard, a user request, document path or any publication capability.
    let scheduled = diagnostic_probe::schedule(move |slot| {
        let observer_started = Instant::now();
        diagnostic_event("core_probe_observer", None, "started", None, None);
        for (mut command, stage) in commands.into_iter().zip(["core_probe_node", "core_probe_preloader"]) {
            let started = Instant::now();
            if let Err(code) = macos_core::bind(&executable, started + Duration::from_secs(3)) {
                diagnostic_event(stage, None, "failed", Some(&code), None); break;
            }
            let observed = match slot.observe(|| command.spawn(), started) {
                Ok(observed) => observed,
                Err(diagnostic_probe::StartFailure::Spawn(error)) => {
                    diagnostic_event(stage, None, "failed", Some(runtime_spawn_code(&error)),
                        Some(started.elapsed().as_millis())); break;
                }
                Err(diagnostic_probe::StartFailure::Unavailable) => {
                    diagnostic_event(stage, None, "unavailable", Some(diagnostic_probe::OBSERVER_UNAVAILABLE),
                        Some(started.elapsed().as_millis())); break;
                }
            };
            let (outcome, code) = if let Some(reason) = observed.failure {
                ("failed", Some(reason.code()))
            } else if let Some(status) = observed.status {
                if status.success() { ("ready", None) } else {
                    let code = match status.signal() {
                        Some(5) => "STANDALONE_CORE_PROBE_SIGNAL_TRAP",
                        Some(_) => "STANDALONE_CORE_PROBE_SIGNAL_OTHER",
                        None => "STANDALONE_CORE_PROBE_EXIT_NONZERO",
                    };
                    ("failed", Some(code))
                }
            } else { ("failed", Some(diagnostic_probe::StopReason::WaitFailed.code())) };
            diagnostic_process_event(stage, outcome, code, Some(observed.elapsed.as_millis()), observed.process_id);
            let cleanup_codes = [observed.kill.error_code(),
                (observed.cleanup_wait_failed && observed.failure != Some(diagnostic_probe::StopReason::WaitFailed))
                    .then_some(diagnostic_probe::StopReason::WaitFailed.code()),
                (!observed.end_confirmed).then_some(diagnostic_probe::END_UNCONFIRMED)];
            for code in cleanup_codes.into_iter().flatten() {
                diagnostic_process_event("core_probe_cleanup", "failed", Some(code),
                    Some(observed.elapsed.as_millis()), observed.process_id);
            }
            // Failure, even a late zero exit, never starts the second stage.
            if outcome != "ready" { break; }
        }
        // Observer completion is not a healthy-Core/exit/recovery certificate.
        // A support snapshot taken earlier can see the unmatched start record.
        diagnostic_event("core_probe_observer", None, "stopped", None,
            Some(observer_started.elapsed().as_millis()));
    });
    if scheduled == diagnostic_probe::ScheduleOutcome::Unavailable {
        diagnostic_event("core_probe_observer", None, "unavailable", Some(diagnostic_probe::OBSERVER_UNAVAILABLE), None);
    }
}

fn spawn_sidecar(app: &tauri::AppHandle, lifecycle: &ipc_transport::Lifecycle, spawn_guard: ipc_transport::SpawnGuard, deadline: Instant,
    owner_generation: String, retired_generations: Vec<String>) -> Result<SidecarProcess, String> {
    let bootstrap_started = Instant::now();
    diagnostic_event("sidecar_starting", None, "progress", None, None);
    let (executable, script, _network_deny) = runtime_paths(app).inspect_err(|code| {
        diagnostic_event(
            "runtime_resolution_failed",
            None,
            "failed",
            Some(code),
            None,
        );
    })?;
    diagnostic_event("runtime_resolved", None, "ready", None, None);
    #[cfg(target_os = "macos")]
    diagnostic_macos_quarantine(&executable);
    let script_directory = script
        .parent()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let script_name = script
        .file_name()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let mut command = Command::new(child_process_path(&executable));
    configure_core_environment(&mut command, app);
    #[cfg(windows)]
    let namespace = {
        let prepared = private_namespace::prepare(&native_export_data_root()?)
            .map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".to_string())?;
        let prepared = Arc::new(prepared);
        let handoff = prepared.handoff().map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".to_string())?;
        command.env(private_namespace::CHILD_ROOT_ENV, handoff.root);
        diagnostic_event("private_namespace_bound", None, "ready", Some(match handoff.origin {
            private_namespace::Origin::Created => "STANDALONE_NAMESPACE_CREATED",
            private_namespace::Origin::ExistingCandidate => "STANDALONE_NAMESPACE_EXISTING_CANDIDATE",
        }), None);
        prepared
    };
    command.env("DATASECURE_NATIVE_EXPORT_CHANNEL", "1");
    command.env("DATASECURE_DOCUMENT_CONTROL_OWNER_PID", std::process::id().to_string());
    command.env("DATASECURE_DOCUMENT_CONTROL_GENERATION", &owner_generation);
    // Native-only diagnostic namespace: eight fixed leaves remain discoverable
    // when old logs exceed the inventory cap. No renderer path crosses IPC.
    command.env("DATASECURE_STANDALONE_DIAGNOSTIC_SEGMENT", &owner_generation);
    diagnostic_log::remember_sidecar_generation(&owner_generation);
    command.env("DATASECURE_RETIRED_CONTROL_GENERATIONS", serde_json::to_string(&retired_generations)
        .map_err(|_| ipc_transport::FAILED.to_string())?);
    // Optional, explicitly enabled content-free support trace. No arbitrary
    // host environment or vendor stderr is forwarded to the product worker.
    configure_support_trace(
        &mut command,
        std::env::var_os("EU_PRIVACY_SUPPORT_MODE").as_deref(),
    );
    command
        .current_dir(child_process_path(script_directory))
        // The preloader was already bound as a regular packaged file. Keeping
        // the CLI argument relative avoids passing a Windows verbatim path to
        // Node, which exits before executing the sidecar for that spelling.
        .arg("--require=../network-deny.cjs")
        .arg(script_name)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    // Always drain stderr: a failure in Node or its --require preloader occurs
    // before the JavaScript diagnostic sink exists. Never persist raw stderr,
    // which may contain local paths or document content after startup.
    command.stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(windows)]
    namespace.verify_binding().map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".to_string())?;
    #[cfg(windows)]
    let namespace_identity = namespace.handoff()
        .map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".to_string())?.identity;
    #[cfg(target_os = "macos")]
    let core_binding = macos_core::bind(&executable, deadline)?;
    #[cfg(target_os = "macos")]
    { if Instant::now() >= deadline { return Err(ipc_transport::TIMEOUT.into()); }
      if lifecycle.stopping.load(Ordering::Acquire) { return Err(ipc_transport::CLOSED.into()); } }
    let mut child = command.spawn().map_err(|error| {
        let code = runtime_spawn_code(&error);
        diagnostic_event(
            "sidecar_spawn_failed",
            None,
            "failed",
            Some(code),
            None,
        );
        code.to_string()
    })?;
    let process_id = child.id();
    diagnostic_process_event("sidecar_spawned", "ready", None,
        Some(bootstrap_started.elapsed().as_millis()), process_id);
    let input = child.stdin.take();
    let output = child.stdout.take();
    if let Some(mut stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let mut sample = Vec::with_capacity(4096);
            let mut buffer = [0u8; 4096];
            loop {
                match stderr.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        if sample.len() < 16 * 1024 {
                            let keep = count.min(16 * 1024 - sample.len());
                            sample.extend_from_slice(&buffer[..keep]);
                        }
                    }
                }
            }
            if !sample.is_empty() {
                diagnostic_process_event("sidecar_stderr_classified", "failed",
                    Some(classify_sidecar_stderr(&sample)), None, process_id);
            }
        });
    }
    #[cfg(windows)]
    let child = ipc_transport::ChildControl::new_with_lifetime_pin(child, namespace.clone());
    #[cfg(not(windows))]
    let child = ipc_transport::ChildControl::new(child);
    spawn_guard.register(child.clone())?;
    if Instant::now() >= deadline {
        child.terminate();
        return Err("STANDALONE_IPC_TIMEOUT".to_string());
    }
    let (Some(input), Some(output)) = (input, output) else {
        child.terminate();
        return Err("STANDALONE_RUNTIME_START_FAILED".to_string());
    };
    let (sender, responses) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let response = read_frame(&mut reader);
            let finished = response.is_err();
            if sender.send(response).is_err() || finished {
                break;
            }
        }
    });
    let process = SidecarProcess {
        child,
        writes: ipc_transport::writer(input),
        responses,
        owner_generation,
        unusable: false,
        #[cfg(windows)]
        namespace,
        #[cfg(windows)]
        namespace_identity,
    };
    let ready = match ipc_transport::receive_until(&process.responses, deadline, &lifecycle.stopping) {
        Ok(Ok(frame)) => frame,
        Ok(Err(code)) | Err(code) => {
            let cause = sidecar_bootstrap_diagnostic(&process.child, &code);
            diagnostic_process_event("sidecar_bootstrap_failed", "failed",
                Some(&cause), Some(bootstrap_started.elapsed().as_millis()), process_id);
            #[cfg(target_os = "macos")]
            if cause == "STANDALONE_SIDECAR_SIGNAL_TRAP" {
                macos_core_probe(app, &executable, script_directory);
            }
            // A native trap before Ready is not a transient IPC timeout.
            // Preserve the fixed cause for the UI without exposing stderr or
            // silently retrying a crashed executable as a healthy connection.
            // Return only fixed, content-free OS failure classes. A generic
            // transport timeout still retains its transport code; no request
            // is replayed after either kind of startup failure.
            let known_early_exit = matches!(cause.as_str(),
                "STANDALONE_SIDECAR_SIGNAL_TRAP" |
                "STANDALONE_SIDECAR_SIGNAL_ABORT" |
                "STANDALONE_SIDECAR_SIGNAL_KILLED" |
                "STANDALONE_SIDECAR_SIGNAL_ILLEGAL_INSTRUCTION" |
                "STANDALONE_SIDECAR_SIGNAL_BUS" |
                "STANDALONE_SIDECAR_SIGNAL_SEGFAULT" |
                "STANDALONE_SIDECAR_EXIT_DENIED" |
                "STANDALONE_SIDECAR_EXIT_NOT_FOUND" |
                "STANDALONE_SIDECAR_WINDOWS_ACCESS_VIOLATION" |
                "STANDALONE_SIDECAR_WINDOWS_ILLEGAL_INSTRUCTION" |
                "STANDALONE_SIDECAR_WINDOWS_INVALID_IMAGE" |
                "STANDALONE_SIDECAR_WINDOWS_DLL_MISSING" |
                "STANDALONE_SIDECAR_WINDOWS_DLL_INIT_FAILED" |
                "STANDALONE_SIDECAR_WINDOWS_STACK_OVERFLOW" |
                "STANDALONE_SIDECAR_WINDOWS_STACK_BUFFER_OVERRUN");
            return Err(if known_early_exit { cause } else { code });
        }
    };
    if ready["schema"] != "datasecure-standalone-ready/1" || ready["owner_generation"] != process.owner_generation ||
        !matches!(ready["diagnostic_log"].as_str(), Some("ready" | "unavailable")) ||
        ready.as_object().is_none_or(|fields| fields.len() != if ready["ok"] == true { 4 } else { 5 }) {
        diagnostic_process_event("sidecar_bootstrap_failed", "failed", Some("STANDALONE_SIDECAR_READY_INVALID"),
            Some(bootstrap_started.elapsed().as_millis()), process_id);
        return Err(ipc_transport::FAILED.to_string());
    }
    if ready["diagnostic_log"] == "unavailable" {
        diagnostic_process_event("sidecar_diagnostic_unavailable", "failed", Some("STANDALONE_SIDECAR_DIAGNOSTIC_UNAVAILABLE"),
            Some(bootstrap_started.elapsed().as_millis()), process_id);
    }
    if ready["ok"] != true {
        let code = ready["error_code"].as_str().filter(|code| code.len() <= 80 &&
            code.bytes().all(|value| value.is_ascii_uppercase() || value.is_ascii_digit() || value == b'_'))
            .unwrap_or(ipc_transport::FAILED);
        diagnostic_process_event("sidecar_bootstrap_failed", "failed", Some(code),
            Some(bootstrap_started.elapsed().as_millis()), process_id);
        return Err(code.to_string());
    }
    #[cfg(target_os = "macos")]
    core_binding.verify_again(deadline)?;
    #[cfg(windows)]
    publication_data_root(&process)?;
    diagnostic_process_event("sidecar_bootstrap_ready", "ready", None,
        Some(bootstrap_started.elapsed().as_millis()), process_id);
    Ok(process)
}

fn sidecar_bootstrap_diagnostic(child: &ipc_transport::ChildControl, transport_code: &str) -> String {
    if transport_code == ipc_transport::CLOSED { return "STANDALONE_SIDECAR_START_CANCELLED".into(); }
    // EOF can precede the kernel's exit notification by a few milliseconds.
    // A short, bounded observation improves the diagnosis without holding a
    // child lock, changing the recovery decision or blocking the GUI thread.
    let mut status = child.exit_status();
    for _ in 0..5 {
        if status.is_some() { break; }
        std::thread::sleep(Duration::from_millis(10));
        status = child.exit_status();
    }
    let Some(status) = status else {
        return if transport_code == ipc_transport::TIMEOUT { "STANDALONE_SIDECAR_READY_TIMEOUT".into() }
            else { "STANDALONE_SIDECAR_EOF_RUNNING".into() };
    };
    if status.success() { return "STANDALONE_SIDECAR_EXIT_ZERO".into(); }
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        #[cfg(target_os = "macos")]
        match status.signal() {
            Some(4) => return "STANDALONE_SIDECAR_SIGNAL_ILLEGAL_INSTRUCTION".into(),
            Some(5) => return "STANDALONE_SIDECAR_SIGNAL_TRAP".into(),
            Some(6) => return "STANDALONE_SIDECAR_SIGNAL_ABORT".into(),
            Some(9) => return "STANDALONE_SIDECAR_SIGNAL_KILLED".into(),
            Some(10) => return "STANDALONE_SIDECAR_SIGNAL_BUS".into(),
            Some(11) => return "STANDALONE_SIDECAR_SIGNAL_SEGFAULT".into(),
            _ => {},
        }
        if let Some(signal) = status.signal() {
            return if (1..=128).contains(&signal) { format!("STANDALONE_SIDECAR_SIGNAL_{signal}") }
                else { "STANDALONE_SIDECAR_SIGNAL_OTHER".into() };
        }
    }
    #[cfg(windows)]
    if let Some(code) = status.code() {
        // Windows may report an NTSTATUS as a signed i32. Preserve only
        // documented, allowlisted classes, never arbitrary exit text.
        let diagnostic = match code as u32 {
            0xC0000005 => Some("STANDALONE_SIDECAR_WINDOWS_ACCESS_VIOLATION"),
            0xC000001D => Some("STANDALONE_SIDECAR_WINDOWS_ILLEGAL_INSTRUCTION"),
            0xC000007B => Some("STANDALONE_SIDECAR_WINDOWS_INVALID_IMAGE"),
            0xC0000135 => Some("STANDALONE_SIDECAR_WINDOWS_DLL_MISSING"),
            0xC0000142 => Some("STANDALONE_SIDECAR_WINDOWS_DLL_INIT_FAILED"),
            0xC00000FD => Some("STANDALONE_SIDECAR_WINDOWS_STACK_OVERFLOW"),
            0xC0000409 => Some("STANDALONE_SIDECAR_WINDOWS_STACK_BUFFER_OVERRUN"),
            _ => None,
        };
        if let Some(value) = diagnostic { return value.into(); }
    }
    match status.code() {
        Some(1) => "STANDALONE_SIDECAR_EXIT_ONE".into(),
        Some(70) => "STANDALONE_SIDECAR_EXIT_SEVENTY".into(),
        Some(126) => "STANDALONE_SIDECAR_EXIT_DENIED".into(),
        Some(127) => "STANDALONE_SIDECAR_EXIT_NOT_FOUND".into(),
        Some(code) if (0..=255).contains(&code) => format!("STANDALONE_SIDECAR_EXIT_{code}"),
        Some(_) => "STANDALONE_SIDECAR_EXIT_OTHER".into(),
        None => "STANDALONE_SIDECAR_EXIT_UNKNOWN".into(),
    }
}

fn classify_sidecar_stderr(sample: &[u8]) -> &'static str {
    let value = String::from_utf8_lossy(sample).to_ascii_lowercase();
    if value.contains("err_dlopen_failed") { "STANDALONE_SIDECAR_NATIVE_LOAD_FAILED" }
    else if value.contains("module_not_found") || value.contains("cannot find module") {
        "STANDALONE_SIDECAR_MODULE_MISSING"
    } else if value.contains("eacces") || value.contains("permission denied") {
        "STANDALONE_SIDECAR_FILE_ACCESS_DENIED"
    } else if value.contains("eperm") || value.contains("operation not permitted") {
        "STANDALONE_SIDECAR_OPERATION_DENIED"
    } else if value.contains("runtime_integrity_failed") {
        "STANDALONE_SIDECAR_RUNTIME_INTEGRITY_FAILED"
    } else { "STANDALONE_SIDECAR_STDERR_OTHER" }
}

fn read_frame(reader: &mut impl Read) -> Result<Value, String> {
    let mut header = [0u8; 4];
    reader
        .read_exact(&mut header)
        .map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
    let size = u32::from_be_bytes(header) as usize;
    if !(2..=MAX_FRAME_BYTES).contains(&size) {
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let mut response = vec![0u8; size];
    reader
        .read_exact(&mut response)
        .map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
    serde_json::from_slice(&response).map_err(|_| "STANDALONE_IPC_FAILED".to_string())
}

fn strict_path_strings(paths: &[PathBuf]) -> Result<Vec<&str>, String> {
    let mut total = 0usize;
    let mut values = Vec::with_capacity(paths.len());
    for path in paths {
        let value = path
            .to_str()
            .ok_or_else(|| "STANDALONE_SELECTION_INVALID".to_string())?;
        if value.is_empty() || value.len() > MAX_SINGLE_PATH_BYTES {
            return Err("STANDALONE_SELECTION_INVALID".to_string());
        }
        total = total
            .checked_add(value.len())
            .ok_or_else(|| "STANDALONE_SELECTION_INVALID".to_string())?;
        if total > MAX_ADMISSION_PATH_BYTES {
            return Err("STANDALONE_SELECTION_INVALID".to_string());
        }
        values.push(value);
    }
    Ok(values)
}

fn private_request(
    request_id: &str,
    action: &str,
    source_kind: Option<&str>,
    paths: &[PathBuf],
    presentation_generation: Option<u64>,
    processing_mode: Option<&str>,
) -> Result<Value, String> {
    let mut request = json!({ "schema": IPC_SCHEMA, "request_id": request_id, "action": action });
    if action == "start_admitted_batch" {
        request["processing_mode"] = json!(validate_processing_mode(processing_mode)?);
    } else if processing_mode.is_some() {
        return Err("PROCESSING_MODE_INVALID".to_string());
    }
    if action == "admit_selected_sources" || action == "configure_results" {
        if action == "admit_selected_sources" {
            request["source_kind"] = json!(source_kind.unwrap_or("files"));
        }
        request["source_paths"] = json!(strict_path_strings(paths)?);
    }
    if action == "ack_terminal_presented" {
        let generation = presentation_generation
            .filter(|value| *value > 0 && *value <= MAX_PRESENTATION_GENERATION)
            .ok_or_else(|| "STANDALONE_OPERATION_FAILED".to_string())?;
        request["presentation_generation"] = json!(generation);
    } else if presentation_generation.is_some() {
        return Err("STANDALONE_OPERATION_FAILED".to_string());
    }
    Ok(request)
}

fn validate_processing_mode(value: Option<&str>) -> Result<&str, String> {
    match value {
        Some("markdown-and-anonymize") => Ok("markdown-and-anonymize"),
        Some("markdown-only") => Ok("markdown-only"),
        _ => Err("PROCESSING_MODE_INVALID".to_string()),
    }
}

fn validate_output_naming_mode<'a>(
    value: Option<&'a str>,
    processing_mode: &str,
) -> Result<Option<&'a str>, String> {
    match (processing_mode, value) {
        ("markdown-and-anonymize", Some("neutral" | "source-with-suffix")) => Ok(value),
        ("markdown-only", None) => Ok(None),
        _ => Err("RESULT_NAMING_MODE_INVALID".to_string()),
    }
}

fn private_start_request(
    request_id: &str,
    processing_mode: Option<&str>,
    output_naming_mode: Option<&str>,
) -> Result<Value, String> {
    let mode = validate_processing_mode(processing_mode)?;
    let naming = validate_output_naming_mode(output_naming_mode, mode)?;
    let mut request = private_request(
        request_id,
        "start_admitted_batch",
        None,
        &[],
        None,
        Some(mode),
    )?;
    if let Some(value) = naming {
        request["output_naming_mode"] = json!(value);
    }
    Ok(request)
}

fn mode_rejected_before_start(result: &Result<Value, String>) -> bool {
    matches!(result, Err(code) if matches!(code.as_str(),
        "PROCESSING_MODE_INVALID" | "PROCESSING_MODE_FORBIDDEN" | "MARKDOWN_CONVERSION_NOT_READY" |
        "STANDALONE_SELECTION_INVALID" | "CONTENT_OPTIONS_INVALID" | "CONTENT_OPTIONS_FORBIDDEN" |
        "CONTENT_OPTIONS_NOT_READY" | "STANDALONE_REVIEW_POLICY_INVALID" | "STANDALONE_RESULT_ROOT_UNAVAILABLE" |
        "STANDALONE_IPC_BUSY" | "STANDALONE_BUSY"))
}

#[derive(Debug, PartialEq)]
struct ValidatedStartContent { options: Option<Value>, review_policy: Option<String> }

fn validate_start_content_body(body: &tauri::ipc::InvokeBody, document_review: bool) -> Result<ValidatedStartContent, String> {
    match body {
        tauri::ipc::InvokeBody::Json(value) => {
            let options = content_start::decode_start(value, document_review)?;
            // The closed raw-body validator above checks policy presence,
            // exact spelling, mode and the trusted document surface together.
            // Read that same validated body, not a second command argument.
            let review_policy = value.get("reviewPolicy").and_then(Value::as_str).map(str::to_owned);
            Ok(ValidatedStartContent { options, review_policy })
        },
        tauri::ipc::InvokeBody::Raw(_) => Err("CONTENT_OPTIONS_INVALID".into()),
    }
}

fn private_content_start_request(
    request_id: &str,
    processing_mode: Option<&str>,
    output_naming_mode: Option<&str>,
    content_options: Option<Value>,
    document_review: bool,
) -> Result<Value, String> {
    let mut request = private_start_request(request_id, processing_mode, output_naming_mode)?;
    if let Some(options) = content_options {
        let decoded = content_start::decode_start(&json!({
            "processingMode": processing_mode,
            "contentOptions": options
        }), document_review)?.ok_or("CONTENT_OPTIONS_INVALID")?;
        request["content_options"] = decoded;
    }
    if document_review {
        request["document_review"] = json!(true);
    }
    Ok(request)
}

enum ValidatedPrivateResponse {
    Success(Value),
    Error(String, Option<Value>),
}

fn safe_local_label(label: &str) -> bool {
    !label.is_empty() && label.len() <= 1024 && !label.starts_with('/') &&
        !label.contains(['\\', ':']) && !label.chars().any(char::is_control) &&
        label.split('/').all(|part| !part.is_empty() && part != "." && part != "..")
}

fn selection_reason(code: &str) -> bool {
    matches!(code, "SOURCE_FORMAT_SIZE_LIMIT" | "SOURCE_FILE_EMPTY" | "SOURCE_FORMAT_UNSUPPORTED" |
        "SOURCE_READ_FAILED" | "SOURCE_ACCESS_DENIED" | "SOURCE_PATH_UNSAFE" | "SOURCE_IDENTITY_CHANGED" |
        "SOURCE_ARTIFACT_IGNORED" | "DOCUMENT_EXPORT_NAME_INVALID")
}

fn valid_local_error_details(code: &str, details: &Value) -> bool {
    let Some(object) = details.as_object() else { return false; };
    if object.len() != 2 { return false; }
    if code == "SOURCE_FOLDER_UNSUPPORTED_FILES" {
        let Some(files) = object.get("unsupported_files").and_then(Value::as_array) else { return false; };
        let Some(count) = object.get("unsupported_count").and_then(Value::as_u64) else { return false; };
        return files.len() <= MAX_BATCH_FILES && count >= files.len() as u64 && count <= 4096 &&
            files.iter().all(|file| file.as_str().is_some_and(safe_local_label));
    }
    if !selection_reason(code) && code != "SOURCE_SELECTION_REJECTED" { return false; }
    let Some(files) = object.get("selection_files").and_then(Value::as_array) else { return false; };
    let Some(count) = object.get("selection_count").and_then(Value::as_u64) else { return false; };
    !files.is_empty() && files.len() <= MAX_BATCH_FILES && count >= files.len() as u64 && count <= 4096 &&
        files.iter().all(|file| file.as_object().is_some_and(|entry|
            entry.len() == 2 && entry.get("name").and_then(Value::as_str).is_some_and(safe_local_label) &&
            entry.get("reason_code").and_then(Value::as_str).is_some_and(selection_reason)))
}

fn local_error_parts(error: &str) -> (String, Option<Value>) {
    let Ok(value) = serde_json::from_str::<Value>(error) else { return (error.to_string(), None); };
    let Some(code) = value.get("code").and_then(Value::as_str) else { return (error.to_string(), None); };
    let details = value.get("details").filter(|details|
        valid_local_error_details(code, details)).cloned();
    if details.is_none() { return (error.to_string(), None); }
    (code.to_string(), details)
}

fn validate_private_response(
    response: &Value,
    expected_request_id: &str,
) -> Result<ValidatedPrivateResponse, ()> {
    let object = response.as_object().ok_or(())?;
    if object.get("schema").and_then(Value::as_str) != Some(RESPONSE_SCHEMA)
        || object.get("request_id").and_then(Value::as_str) != Some(expected_request_id)
    {
        return Err(());
    }
    match object.get("ok").and_then(Value::as_bool) {
        Some(true) if object.len() == 4 => object
            .get("result")
            .filter(|value| value.is_object())
            .cloned()
            .map(ValidatedPrivateResponse::Success)
            .ok_or(()),
        Some(false) if object.len() == 4 || object.len() == 5 => {
            let code = object.get("error_code").and_then(Value::as_str)
                .filter(|value| !value.is_empty() && value.len() <= 128 &&
                    value.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == b'_')).ok_or(())?;
            let details = object.get("error_details");
            if details.is_some() && !valid_local_error_details(code, details.ok_or(())?) { return Err(()); }
            if object.len() == 5 && details.is_none() { return Err(()); }
            Ok(ValidatedPrivateResponse::Error(code.to_string(), details.cloned()))
        },
        _ => Err(()),
    }
}

fn rpc(
    state: &DesktopState,
    action: &str,
    source_kind: Option<&str>,
    paths: &[PathBuf],
    presentation_generation: Option<u64>,
    processing_mode: Option<&str>,
) -> Result<Value, String> {
    let id = request_id();
    let request = private_request(
        &id,
        action,
        source_kind,
        paths,
        presentation_generation,
        processing_mode,
    )?;
    rpc_request(state, action, &id, request)
}

fn history_request(request_id: &str, action: &str, batch_id: &str) -> Result<Value, String> {
    if !matches!(
        action,
        "resolve_history_results" | "resolve_history_ledger" | "resolve_history_identity_mapping"
            | "continue_history_batch" | "get_run_failures" | "pause_batch"
            | "skip_ocr_contact_review" | "abandon_result_export"
            | "publish_result_documents"
    ) || batch_id.len() != 64
        || !batch_id
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("STANDALONE_HISTORY_INVALID".to_string());
    }
    Ok(
        json!({ "schema": IPC_SCHEMA, "request_id": request_id, "action": action, "batch_id": batch_id }),
    )
}

fn run_history_request(request_id: &str, recover_exports: Option<bool>, recover_batch_id: Option<String>, include_hidden: Option<bool>, batch_id: Option<String>) -> Result<Value, String> {
    let mut request = private_request(request_id, "get_run_history", None, &[], None, None)?;
    if let Some(batch_id) = batch_id {
        if recover_exports.is_some() || recover_batch_id.is_some() || include_hidden.is_some()
            || batch_id.len() != 64 || !batch_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
            return Err("STANDALONE_HISTORY_INVALID".to_string());
        }
        request["batch_id"] = json!(batch_id);
        return Ok(request);
    }
    match (recover_exports, recover_batch_id) {
        (None, None) => {},
        (Some(true), Some(batch_id)) if batch_id.len() == 64 && batch_id.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) => {
            request["recover_exports"] = json!(true);
            request["recover_batch_id"] = json!(batch_id);
        },
        _ => return Err("STANDALONE_HISTORY_INVALID".to_string()),
    }
    match include_hidden {
        None => {},
        Some(true) => request["include_hidden"] = json!(true),
        Some(false) => return Err("STANDALONE_HISTORY_INVALID".to_string()),
    }
    Ok(request)
}

fn run_history_visibility_request(request_id: &str, batch_id: &str, hidden: bool) -> Result<Value, String> {
    if batch_id.len() != 64 || !batch_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("STANDALONE_HISTORY_INVALID".to_string());
    }
    Ok(json!({ "schema": IPC_SCHEMA, "request_id": request_id, "action": "set_run_history_visibility",
        "batch_id": batch_id, "hidden": hidden }))
}

fn removal_request(request_id: &str, selection_index: u64) -> Result<Value, String> {
    if selection_index >= MAX_BATCH_FILES as u64 {
        return Err("STANDALONE_SELECTION_INVALID".to_string());
    }
    Ok(json!({
        "schema": IPC_SCHEMA,
        "request_id": request_id,
        "action": "remove_admitted_source",
        "selection_index": selection_index
    }))
}

fn history_rpc(state: &DesktopState, action: &str, batch_id: &str) -> Result<Value, String> {
    let id = request_id();
    let request = history_request(&id, action, batch_id)?;
    rpc_request(state, action, &id, request)
}

fn rpc_duration(action: &str) -> Duration {
    Duration::from_secs(if matches!(action, "admit_selected_sources" | "preview_document_export" | "export_approved_documents" | "publish_result_documents" |
        "abandon_document_export" | "decide_document_review_batch" |
        "resolve_document_export" | "resolve_document_identity_overview" | "get_document_reviews" | "get_document_review_history_summary" |
        "get_run_history" | "set_run_history_visibility" | "get_run_failures" | "resolve_history_results" | "resolve_history_ledger" |
        "resolve_history_identity_mapping" | "get_review_session" | "resolve_current_results" | "resolve_local_ledger") { 300 }
        else if matches!(action, "get_public_state" | "get_ui_context") { 120 }
        else { 30 })
}

fn rpc_lock_duration(action: &str) -> Duration {
    // A long export/history read owns the serial Core. A status lookup must
    // not sit behind it for 120 seconds and then report a false disconnect.
    // The distinct BUSY result leaves the owning request and connection intact.
    if matches!(action, "get_public_state" | "get_ui_context") {
        Duration::from_secs(5)
    } else {
        rpc_duration(action)
    }
}

fn rpc_lock_transport_code(_action: &str, code: String) -> String {
    // No request bytes have been sent while waiting for ownership. Queue
    // exhaustion says nothing about connection health or mutation outcome.
    if code == ipc_transport::TIMEOUT {
        "STANDALONE_IPC_BUSY".into()
    } else { code }
}

fn rpc_bootstrap_duration() -> Duration { Duration::from_secs(120) }

fn admission_transport_code(action: &str, code: String) -> String {
    if action == "admit_selected_sources" && code == ipc_transport::TIMEOUT {
        "STANDALONE_ADMISSION_TIMEOUT".to_string()
    } else { code }
}

fn admission_progress(state: &DesktopState, action: &str, phase: &str, elapsed_ms: u128) {
    if action != "admit_selected_sources" { return; }
    // An operation heartbeat, not an invented percent or claimed file count.
    if let Some(window) = state.app.get_webview_window("main") {
        let _ = window.emit("datasecure-admission-progress", json!({
            "phase": phase, "elapsed_ms": elapsed_ms
        }));
    }
    diagnostic_event("admission_progress", Some(action), phase, None, Some(elapsed_ms));
}

fn rpc_request(
    state: &DesktopState,
    action: &str,
    id: &str,
    request: Value,
) -> Result<Value, String> {
    let started = Instant::now();
    // Recursive admission can validate/hash up to 200 files / 500 MB, including
    // slow local/cloud-backed disks. It is not a 30-second ordinary UI request.
    let lock_deadline = started + rpc_lock_duration(action);
    diagnostic_ipc_event("ipc_request_started", action, id, "progress", None, None);
    admission_progress(state, action, "validating", 0);
    let early_failure = |code: &String| diagnostic_ipc_event("ipc_request_failed", action, id,
        "failed", Some(code), Some(started.elapsed().as_millis()));
    let payload = serde_json::to_vec(&request).map_err(|_| "STANDALONE_IPC_FAILED".to_string())
        .inspect_err(early_failure)?;
    if payload.len() > MAX_FRAME_BYTES {
        early_failure(&"STANDALONE_IPC_FAILED".to_string());
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let mut process_guard = ipc_transport::lock_until(&state.sidecar, lock_deadline, &state.lifecycle.stopping)
        .map_err(|code| {
            let code = rpc_lock_transport_code(action, code);
            if code == "STANDALONE_IPC_BUSY" {
                diagnostic_ipc_event("ipc_request_queue_busy", action, id, "blocked", Some(&code), Some(started.elapsed().as_millis()));
            } else { early_failure(&code); }
            code
        })?;
    let activity = state.activity.begin(action);
    let export_reporter = request.get("operation_id").and_then(Value::as_str)
        .and_then(|operation_id| activity.export_reporter(operation_id));
    // Capture happens explicitly at command ingress, before a
    // blocking task can queue behind another RPC. A stale mutation is never
    // dispatched to a replacement service with a fresh source catalogue.
    if state.expected_connection_epoch != state.connection_epoch.load(Ordering::Acquire) {
        return Err("STANDALONE_CONNECTION_CHANGED".to_string());
    }
    if let Some(process) = process_guard.as_mut() {
        if process.unusable || process.child.exited() {
            if !process.unusable { process.unusable = true; invalidate_connection(state); }
            schedule_sidecar_retirement(state, process)?;
            // Even the action that first notices a dead process must re-enter
            // under the new epoch. In particular it cannot restart a batch.
            return Err("STANDALONE_CONNECTION_CHANGED".to_string());
        }
    }
    if process_guard.is_none() {
        activity.set_phase("bootstrap");
        // After a broken connection only display reads may bootstrap its
        // successor. A mutation must be explicitly invoked after Ready.
        if state.connection_epoch.load(Ordering::Acquire) != 0 &&
            !matches!(action, "get_public_state" | "get_ui_context" | "get_run_history") {
            return Err("STANDALONE_CONNECTION_CHANGED".to_string());
        }
        // Spawning may itself be delayed by the OS. A late result is dropped
        // (and its owned child terminated), never adopted after shutdown.
        // Reserve under the same sidecar mutex, BEFORE consuming a recovery
        // generation. Retirement may have removed the process but still be
        // completing its lifecycle transition. Such reads are not bootstraps.
        let retry_epoch = if action == "get_public_state" { state.bootstrap_retry_epoch } else { None };
        let (spawn_guard, owner_generation, retired_generations) = reserve_sidecar_generation_for_retry(&state.lifecycle, &state.retired_owner_generations, retry_epoch)
            .inspect_err(|code| diagnostic_event("sidecar_start_blocked", None, "blocked", Some(code), None))?;
        let app = state.app.clone();
        let lifecycle = state.lifecycle.clone();
        let (sender, receiver) = mpsc::channel();
        let bootstrap_deadline = Instant::now() + rpc_bootstrap_duration();
        let bootstrap = std::thread::Builder::new().name("sidecar-bootstrap".into()).spawn(move || {
            let _ = sender.send(spawn_sidecar(&app, &lifecycle, spawn_guard, bootstrap_deadline, owner_generation, retired_generations));
        });
        let spawned = bootstrap.map_err(|_| ipc_transport::FAILED.to_string()).and_then(|_| {
            ipc_transport::receive_until(&receiver, bootstrap_deadline, &state.lifecycle.stopping)
                .and_then(|result| result)
        }).map_err(|code| admission_transport_code(action, code));
        match spawned {
            Ok(process) => *process_guard = Some(process),
            Err(code) => {
                // Invalidate queued commands even if no service reached Ready.
                invalidate_connection_with_bootstrap_failure(state, Some(&code));
                early_failure(&code);
                return Err(code);
            }
        }
        // Record the cleared cause and new ingress epoch atomically before
        // notification. The receipt is historical, never a workspace certificate.
        let ready = state.lifecycle.confirm_bootstrap_ready(state.expected_connection_epoch, &state.connection_epoch)?;
        state.retired_owner_generations.lock().map_err(|_| ipc_transport::FAILED.to_string())?.clear();
        let resolution = ready.resolution.map(|value| json!({ "failure_epoch": value.failure_epoch, "ready_epoch": value.ready_epoch }));
        let _ = state.app.emit("datasecure-connection", json!({
            "epoch": ready.connection_epoch, "state": "ready", "bootstrap_resolution": resolution }));
    }
    // A successful Ready (or a queued request obtaining the sidecar mutex)
    // starts a fresh bounded action window. Expired startup time must never
    // kill a healthy sidecar in the middle of its very first display read.
    let deadline = Instant::now() + rpc_duration(action);
    activity.set_phase("waiting");
    let result = (|| {
        let process = process_guard
            .as_mut()
            .ok_or_else(|| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
        let (sent, completed) = mpsc::channel();
        process.writes.send((payload, sent)).map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
        ipc_transport::receive_until(&completed, deadline, &state.lifecycle.stopping)??;
        diagnostic_ipc_event("ipc_request_sent", action, id, "progress", None, None);
        let mut native_handled = false;
        let mut native_bound = false;
        let mut publication = native_export_channel::PublicationState::default();
        loop {
            let frame = ipc_transport::receive_until_with_progress(&process.responses, deadline, &state.lifecycle.stopping,
                || admission_progress(state, action, "validating", started.elapsed().as_millis()))??;
            if matches!(frame.get("schema").and_then(Value::as_str), Some(native_export_channel::PUBLICATION_REQUEST | native_export_channel::REQUEST_SCHEMA)) {
                activity.set_phase("native");
            }
            let publication_reply = if frame.get("schema").and_then(Value::as_str) == Some(native_export_channel::PUBLICATION_REQUEST) {
                native_export_channel::handle_publication_with_activity(&frame, &request, &mut publication, &state.lifecycle,
                    &publication_data_root(process)?, deadline, export_reporter.clone())?
            } else { None };
            if let Some(reply) = publication_reply.or(native_export_channel::handle(&frame, &request, &mut native_handled, &state.lifecycle, deadline)?) {
                native_bound = native_export_channel::callback_confirms_binding(&reply, &request);
                let payload = serde_json::to_vec(&reply).map_err(|_| ipc_transport::FAILED.to_string())?;
                let (sent, completed) = mpsc::channel();
                process.writes.send((payload, sent)).map_err(|_| ipc_transport::FAILED.to_string())?;
                ipc_transport::receive_until(&completed, deadline, &state.lifecycle.stopping)??;
                activity.set_phase("waiting");
            } else {
                native_export_channel::validate_completion(&frame, &request, native_bound)?;
                break Ok(frame);
            }
        }
    })();
    let response = match result {
        Ok(response) => response,
        Err(code) => {
            let code = admission_transport_code(action, code);
            admission_progress(state, action, "failed", started.elapsed().as_millis());
            let child_exited = process_guard
                .as_ref().is_some_and(|process| process.child.exited());
            diagnostic_ipc_event(
                if child_exited {
                    "sidecar_exited_before_response"
                } else {
                    "ipc_request_failed"
                },
                action, id,
                "failed",
                Some(&code),
                Some(started.elapsed().as_millis()),
            );
            if let Some(process) = process_guard.as_mut() {
                process.unusable = true;
                schedule_sidecar_retirement(state, process).inspect_err(|code| {
                    if let Some(diagnostic) = ipc_transport::retirement_failure_diagnostic(code) {
                        diagnostic_event("sidecar_retirement_failed", None, "failed", Some(diagnostic), None);
                    }
                }).ok();
            }
            invalidate_connection(state);
            return Err(code);
        }
    };
    let validated = validate_private_response(&response, id);
    if validated.is_err() {
        diagnostic_ipc_event(
            "ipc_response_invalid",
            action, id,
            "failed",
            Some("STANDALONE_IPC_FAILED"),
            Some(started.elapsed().as_millis()),
        );
        if let Some(process) = process_guard.as_mut() {
            process.unusable = true;
            schedule_sidecar_retirement(state, process).inspect_err(|code| {
                if let Some(diagnostic) = ipc_transport::retirement_failure_diagnostic(code) {
                    diagnostic_event("sidecar_retirement_failed", None, "failed", Some(diagnostic), None);
                }
            }).ok();
        }
        invalidate_connection(state);
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let validated = validated.expect("validated above");
    if let ValidatedPrivateResponse::Error(code, details) = validated {
        admission_progress(state, action, "rejected", started.elapsed().as_millis());
        diagnostic_ipc_event(
            "ipc_response_error",
            action, id,
            "failed",
            Some(&code),
            Some(started.elapsed().as_millis()),
        );
        return Err(details.map_or(code.clone(), |details| json!({ "code": code, "details": details }).to_string()));
    }
    diagnostic_ipc_event(
        "ipc_response_ok",
        action, id,
        "ready",
        None,
        Some(started.elapsed().as_millis()),
    );
    admission_progress(state, action, "accepted", started.elapsed().as_millis());
    match validated {
        ValidatedPrivateResponse::Success(result) => Ok(result),
        ValidatedPrivateResponse::Error(_, _) => unreachable!("handled above"),
    }
}

fn native_export_data_root() -> Result<PathBuf, String> {
    if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
        #[cfg(windows)] let base = profile.local_app_data.clone();
        #[cfg(target_os = "macos")] let base = profile.user_profile.join("Library").join("Application Support");
        #[cfg(all(unix, not(target_os = "macos")))] let base = profile.xdg_data.clone();
        return Ok(base.join("SecureDataMsg-Standalone"));
    }
    native_export_broker::private_data_root().map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".into())
}

// Publication must address the same native object passed to this Core, not
// resolve LOCALAPPDATA independently under another token/virtualized spelling.
fn publication_data_root(process: &SidecarProcess) -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        let handoff = process.namespace.handoff().map_err(|_| "STANDALONE_DATA_ROOT_UNSAFE".to_string())?;
        if handoff.identity != process.namespace_identity {
            return Err("STANDALONE_DATA_ROOT_UNSAFE".into());
        }
        Ok(handoff.root.to_path_buf())
    }
    #[cfg(not(windows))]
    { let _ = process; native_export_data_root() }
}

async fn blocking_rpc(state: DesktopState, action: &'static str) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || rpc(&state, action, None, &[], None, None))
        .await
        .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

fn resolved_local_target(
    state: &DesktopState,
    action: &str,
    expected_kind: &str,
) -> Result<PathBuf, String> {
    let result = rpc(state, action, None, &[], None, None)?;
    validate_local_target(result, expected_kind)
}

fn validate_local_target(result: Value, expected_kind: &str) -> Result<PathBuf, String> {
    let object = result
        .as_object()
        .filter(|value| value.len() == 4)
        .ok_or_else(|| "STANDALONE_IPC_FAILED".to_string())?;
    if object.get("ok").and_then(Value::as_bool) != Some(true)
        || object.get("target_kind").and_then(Value::as_str) != Some(expected_kind)
        || object.get("external_disclosure").and_then(Value::as_bool) != Some(false)
    {
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let value = object
        .get("local_path")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= MAX_SINGLE_PATH_BYTES)
        .ok_or_else(|| "STANDALONE_IPC_FAILED".to_string())?;
    let target = PathBuf::from(value);
    if !target.is_absolute() {
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let metadata = std::fs::symlink_metadata(&target).map_err(|_| {
        if expected_kind == "file" {
            "STANDALONE_LEDGER_MISSING".to_string()
        } else {
            "STANDALONE_RESULTS_MISSING".to_string()
        }
    })?;
    if metadata_is_reparse_point(&metadata)
        || metadata.file_type().is_symlink()
        || (expected_kind == "directory" && !metadata.is_dir())
        || (expected_kind == "file" && !metadata.is_file())
    {
        return Err(if expected_kind == "file" {
            "STANDALONE_LEDGER_OPEN_FAILED".to_string()
        } else {
            "STANDALONE_RESULT_OPEN_FAILED".to_string()
        });
    }
    Ok(target)
}

fn history_local_target(mut result: Value, kind: &str, identity: bool) -> Result<(PathBuf, Option<String>), String> {
    let warning = if identity {
        let object = result.as_object_mut().ok_or_else(|| "STANDALONE_IPC_FAILED".to_string())?;
        let published = object.get("publication_available").and_then(Value::as_bool)
            .ok_or_else(|| "STANDALONE_IPC_FAILED".to_string())?;
        let warning = object.get("identity_mapping_warning").and_then(Value::as_str);
        let private = object.get("identity_mapping_scope").and_then(Value::as_str) == Some("private");
        let valid = if private {
            !published && object.len() == 6 && !object.contains_key("identity_mapping_warning")
        } else if published {
            object.len() == 5 && !object.contains_key("identity_mapping_warning")
        } else {
            object.len() == 6 && warning == Some("STANDALONE_IDENTITY_PUBLICATION_FAILED")
        };
        if kind != "file" || !valid {
            return Err("STANDALONE_IPC_FAILED".to_string());
        }
        let warning = warning.map(str::to_string);
        object.remove("publication_available"); object.remove("identity_mapping_warning"); object.remove("identity_mapping_scope");
        warning
    } else { None };
    Ok((validate_local_target(result, kind)?, warning))
}

fn native_open_command(target: &Path, kind: &str) -> Result<Command, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        let mut command = Command::new("explorer.exe");
        if kind == "file" {
            let mut select = OsString::from("/select,");
            select.push(target.as_os_str());
            command.arg(select);
        } else {
            command.arg(target);
        }
        Ok(command)
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("/usr/bin/open");
        if kind == "file" {
            command.arg("-R");
        }
        command.arg(target);
        Ok(command)
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let mut command = Command::new("/usr/bin/xdg-open");
        command.arg(if kind == "file" {
            target
                .parent()
                .ok_or_else(|| "STANDALONE_LEDGER_OPEN_FAILED".to_string())?
        } else {
            target
        });
        Ok(command)
    }
}

fn open_local_target(target: &Path, kind: &str, action: &str) -> Result<Value, String> {
    diagnostic_event("os_open_requested", Some(action), "progress", None, None);
    let command = native_open_command(target, kind)?;
    // Do not apply CREATE_NO_WINDOW or another hidden-window flag here.  The
    // operating-system file manager is intentionally a visible user action.
    let completed_action = action.to_string();
    native_open::handoff(command, move |status| {
        if !matches!(status, Ok(status) if status.success()) {
            diagnostic_event("os_open_helper_failed", Some(&completed_action), "failed", Some("STANDALONE_OS_OPEN_HELPER_FAILED"), None);
        }
    }).map_err(|_| {
        let code = if kind == "file" {
            "STANDALONE_LEDGER_OPEN_FAILED"
        } else {
            "STANDALONE_RESULT_OPEN_FAILED"
        };
        diagnostic_event(
            "os_open_handoff_failed",
            Some(action),
            "failed",
            Some(code),
            None,
        );
        code.to_string()
    })?;
    diagnostic_event(
        "os_open_handoff_confirmed",
        Some(action),
        "ready",
        None,
        None,
    );
    Ok(json!({ "ok": true, "handoff_confirmed": true, "external_disclosure": false }))
}

fn filters(dialog: rfd::FileDialog) -> rfd::FileDialog {
    dialog.add_filter(
        "Unterstützte Dateien",
        &[
            "txt", "md", "markdown", "csv", "docx", "xlsx", "pptx", "pdf", "png", "jpg", "jpeg",
            "bmp",
        ],
    )
}

#[tauri::command]
async fn select_files(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    diagnostic_event("picker_requested", Some("select_files"), "progress", None, None);
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)
        .inspect_err(|code| diagnostic_event("picker_blocked", Some("select_files"), "blocked", Some(code), None))?;
    let _review_guard = review_admission_guard(&state)
        .inspect_err(|code| diagnostic_event("picker_blocked", Some("select_files"), "blocked", Some(code), None))?;
    diagnostic_event(
        "picker_invocation_started",
        Some("select_files"),
        "progress",
        None,
        None,
    );
    let selected =
        tauri::async_runtime::spawn_blocking(|| filters(rfd::FileDialog::new()).pick_files())
            .await
            .map_err(|_| {
                diagnostic_event("picker_failed", Some("select_files"), "failed", Some("STANDALONE_SELECTION_FAILED"), None);
                "STANDALONE_SELECTION_FAILED".to_string()
            })?;
    let Some(paths) = selected else {
        diagnostic_event(
            "picker_no_selection",
            Some("select_files"),
            "no_selection",
            None,
            None,
        );
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    diagnostic_event(
        "picker_completed",
        Some("select_files"),
        "ready",
        None,
        None,
    );
    let result =
        tauri::async_runtime::spawn_blocking(move || admit_native_sources(&owned, &paths, "files"))
            .await
            .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    state.admission_present.store(true, Ordering::Release);
    Ok(result)
}

#[tauri::command]
async fn select_folder(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    diagnostic_event("picker_requested", Some("select_folder"), "progress", None, None);
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)
        .inspect_err(|code| diagnostic_event("picker_blocked", Some("select_folder"), "blocked", Some(code), None))?;
    let _review_guard = review_admission_guard(&state)
        .inspect_err(|code| diagnostic_event("picker_blocked", Some("select_folder"), "blocked", Some(code), None))?;
    diagnostic_event(
        "picker_invocation_started",
        Some("select_folder"),
        "progress",
        None,
        None,
    );
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| {
            diagnostic_event("picker_failed", Some("select_folder"), "failed", Some("STANDALONE_SELECTION_FAILED"), None);
            "STANDALONE_SELECTION_FAILED".to_string()
        })?;
    let Some(path) = selected else {
        diagnostic_event(
            "picker_no_selection",
            Some("select_folder"),
            "no_selection",
            None,
            None,
        );
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    diagnostic_event(
        "picker_completed",
        Some("select_folder"),
        "ready",
        None,
        None,
    );
    let result = tauri::async_runtime::spawn_blocking(move || {
        admit_native_sources(&owned, &[path], "folder")
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    state.admission_present.store(true, Ordering::Release);
    Ok(result)
}

#[tauri::command]
async fn cancel_admission(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let result = blocking_rpc(state.inner().capture_connection(), "cancel_admission").await;
    state.admission_present.store(false, Ordering::Release);
    result
}
#[tauri::command(rename_all = "camelCase")]
async fn remove_admitted_source(
    state: State<'_, DesktopState>,
    selection_index: u64,
) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let owned = state.inner().capture_connection();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let request = removal_request(&id, selection_index)?;
        rpc_request(&owned, "remove_admitted_source", &id, request)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    if result.get("selected_count").and_then(Value::as_u64) == Some(0) {
        state.admission_present.store(false, Ordering::Release);
    }
    Ok(result)
}
#[tauri::command(rename_all = "camelCase")]
async fn start_admitted_batch(
    state: State<'_, DesktopState>,
    request: tauri::ipc::Request<'_>,
    processing_mode: Option<String>,
    output_naming_mode: Option<String>,
    ocr_contact_review: Option<bool>,
    source_ids: Option<Vec<String>>,
    catalogue_revision: Option<u64>,
) -> Result<Value, String> {
    let document_review = state.app.get_webview_window("main")
        .and_then(|window| window.url().ok()).map(|url| workspace_catalogue_path(url.path())).unwrap_or(false);
    let ValidatedStartContent { options: content_options, review_policy } = validate_start_content_body(request.body(), document_review)?;
    let mode = validate_processing_mode(processing_mode.as_deref())?;
    validate_output_naming_mode(output_naming_mode.as_deref(), mode)?;
    let contact_review = validate_ocr_contact_review(mode, ocr_contact_review)?;
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let owned = state.inner().capture_connection();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let mut request = private_content_start_request(
            &id,
            processing_mode.as_deref(),
            output_naming_mode.as_deref(),
            content_options,
            document_review,
        )?;
        if contact_review {
            request["ocr_contact_review"] = json!(true);
        }
        if let Some(policy) = review_policy {
            request["review_policy"] = json!(policy);
        }
        if source_ids.is_some() || catalogue_revision.is_some() {
            let ids = source_ids.ok_or("STANDALONE_SELECTION_INVALID")?;
            let revision = catalogue_revision.ok_or("STANDALONE_SELECTION_INVALID")?;
            if ids.is_empty() || ids.len() > MAX_BATCH_FILES || ids.iter().any(|id|
                id.len() != 32 || !id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))) ||
                ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len() {
                return Err("STANDALONE_SELECTION_INVALID".to_string());
            }
            request["source_ids"] = json!(ids);
            request["catalogue_revision"] = json!(revision);
        }
        rpc_request(&owned, "start_admitted_batch", &id, request)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?;
    // These fixed errors are returned before reservation or delegation. Keep
    // the prepared selection so the user can select the supported mode.
    if !mode_rejected_before_start(&result) {
        state.admission_present.store(false, Ordering::Release);
    }
    result
}
fn validate_ocr_contact_review(mode: &str, value: Option<bool>) -> Result<bool, String> {
    match value {
        None => Ok(false),
        Some(true) if mode == "markdown-only" => Ok(true),
        _ => Err("OCR_CONTACT_REVIEW_INVALID".to_string()),
    }
}
#[tauri::command(rename_all = "camelCase")]
async fn get_public_state(state: State<'_, DesktopState>, retry_bootstrap: Option<bool>) -> Result<Value, String> {
    let mut owned = state.inner().capture_connection();
    if retry_bootstrap == Some(true) { owned.bootstrap_retry_epoch = Some(owned.expected_connection_epoch); }
    blocking_rpc(owned, "get_public_state").await
}
#[tauri::command]
async fn get_ui_context(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().capture_connection(), "get_ui_context").await
}
#[tauri::command(rename_all = "camelCase")]
async fn get_run_history(state: State<'_, DesktopState>, recover_exports: Option<bool>, recover_batch_id: Option<String>, include_hidden: Option<bool>, batch_id: Option<String>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let request = run_history_request(&id, recover_exports, recover_batch_id, include_hidden, batch_id)?;
        rpc_request(&owned, "get_run_history", &id, request)
    }).await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn set_run_history_visibility(state: State<'_, DesktopState>, batch_id: String, hidden: bool) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let request = run_history_visibility_request(&id, &batch_id, hidden)?;
        rpc_request(&owned, "set_run_history_visibility", &id, request)
    }).await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command]
async fn open_review_window(app: AppHandle) -> Result<Value, String> {
    let owned = app.state::<DesktopState>().inner().capture_connection();
    let _review_guard = selection_guard(&owned.review_ui_busy, &owned.admission_present, false)?;
    if app.state::<DesktopState>().embedded_review_active.load(Ordering::Acquire) {
        return Err("STANDALONE_BUSY".to_string());
    }
    if let Some(window) = app.get_webview_window("review") {
        window.show().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
        window.set_focus().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
    } else {
        let owned = app.state::<DesktopState>().inner().capture_connection();
        let generation = owned.review_window_binding.lock()
            .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?.opened();
        let window = WebviewWindowBuilder::new(&app, "review", WebviewUrl::App("review.html".into()))
            .title("DataSecure – lokale Prüfung")
            .visible(false)
            .inner_size(1080.0, 760.0)
            .min_inner_size(680.0, 500.0)
            .build()
            .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
        // The closure belongs to this actual window instance, not the reused
        // "review" label. A late close event from an old window cannot touch a
        // newer window, its generation, or its review group.
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                defer_closed_review(&owned, generation);
            }
        });
        if window.show().and_then(|_| window.set_focus()).is_err() {
            let _ = window.close();
            return Err("STANDALONE_REVIEW_WINDOW_FAILED".to_string());
        }
    }
    Ok(json!({ "ok": true, "opened": true }))
}

fn defer_closed_review(state: &DesktopState, generation: u64) {
    let review_id = state.review_window_binding.lock().ok()
        .and_then(|mut binding| binding.close_snapshot(generation));
    if let Some(review_id) = review_id {
        let owned = state.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let id = request_id();
            let _ = rpc_request(&owned, "submit_review", &id, json!({
                "schema": IPC_SCHEMA, "request_id": id, "action": "submit_review",
                "review_id": review_id, "answer": { "action": "deferred" }
            }));
        });
    }
}

fn review_window_only(window: &tauri::WebviewWindow, state: &DesktopState) -> Result<(), String> {
    let embedded = state.embedded_review_active.load(Ordering::Acquire);
    if review_window::owns_review(window.label(), embedded) { Ok(()) }
    else { Err("STANDALONE_REVIEW_WINDOW_INVALID".to_string()) }
}

// Hold across picker/drop admission: an embedded review cannot open midway
// through a pending selection, and a review cannot silently absorb a drop.
fn review_admission_guard(state: &DesktopState) -> Result<SelectionGuard, String> {
    let guard = selection_guard(&state.review_ui_busy, &state.admission_present, true)?;
    if state.embedded_review_active.load(Ordering::Acquire) {
        return Err("STANDALONE_BUSY".to_string());
    }
    Ok(guard)
}

#[tauri::command]
fn open_embedded_review(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<Value, String> {
    let _review_guard = selection_guard(&state.review_ui_busy, &state.admission_present, false)?;
    if window.label() != "main" || state.app.get_webview_window("review").is_some() {
        return Err("STANDALONE_REVIEW_WINDOW_INVALID".to_string());
    }
    let already_open = state.embedded_review_active.swap(true, Ordering::AcqRel);
    let generation = if let Ok(mut binding) = state.review_window_binding.lock() {
        if already_open { binding.generation() } else { binding.opened() }
    } else {
        if !already_open { state.embedded_review_active.store(false, Ordering::Release); }
        return Err("STANDALONE_REVIEW_WINDOW_FAILED".to_string());
    };
    Ok(json!({ "ok": true, "review_generation": generation }))
}

#[tauri::command]
fn close_review_window(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<Value, String> {
    let _review_guard = selection_guard(&state.review_ui_busy, &state.admission_present, false)?;
    review_window_only(&window, &state)?;
    if window.label() == "main" {
        let generation = state.review_window_binding.lock()
            .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?.generation();
        // Capture only this delivered group; never close the application window.
        defer_closed_review(&state, generation);
        state.embedded_review_active.store(false, Ordering::Release);
        window.emit("datasecure-review-closed", json!({ "closed": true, "review_generation": generation }))
            .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
    } else { window.close().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?; }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
async fn get_review_session(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<Value, String> {
    review_window_only(&window, &state)?;
    blocking_rpc(state.inner().capture_connection(), "get_review_session").await
}

#[tauri::command]
async fn get_review_chunk(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    review_id: String,
    chunk_index: u64,
) -> Result<Value, String> {
    review_window_only(&window, &state)?;
    if review_id.len() != 32 || !review_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        || chunk_index > 319 {
        return Err("STANDALONE_REVIEW_SESSION_INVALID".to_string());
    }
    let owned = state.inner().capture_connection();
    let generation = owned.review_window_binding.lock()
        .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?.generation();
    tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let result = rpc_request(&owned, "get_review_chunk", &id, json!({
            "schema": IPC_SCHEMA, "request_id": id, "action": "get_review_chunk",
            "review_id": review_id, "chunk_index": chunk_index
        }));
        if result.is_ok() {
            owned.review_window_binding.lock()
                .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?.delivered(generation, &review_id);
        }
        result
    }).await.map_err(|_| "STANDALONE_REVIEW_SESSION_INVALID".to_string())?
}

#[tauri::command]
async fn submit_review(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    review_id: String,
    answer: Value,
) -> Result<Value, String> {
    review_window_only(&window, &state)?;
    if review_id.len() != 32 || !review_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("STANDALONE_REVIEW_SESSION_INVALID".to_string());
    }
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let result = rpc_request(&owned, "submit_review", &id, json!({
            "schema": IPC_SCHEMA, "request_id": id, "action": "submit_review",
            "review_id": review_id, "answer": answer
        }));
        if result.is_ok() {
            owned.review_window_binding.lock()
                .map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?.accepted(&review_id);
        }
        result
    }).await.map_err(|_| "STANDALONE_REVIEW_DECISION_INVALID".to_string())?
}

#[tauri::command]
async fn continue_review_session(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<Value, String> {
    review_window_only(&window, &state)?;
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
    blocking_rpc(state.inner().capture_connection(), "continue_review_session").await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_run_failures(
    state: State<'_, DesktopState>,
    batch_id: Option<String>,
) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || match batch_id {
        Some(id) => history_rpc(&owned, "get_run_failures", &id),
        None => rpc(&owned, "get_run_failures", None, &[], None, None),
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn continue_history_batch(
    state: State<'_, DesktopState>,
    batch_id: String,
) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        history_rpc(&owned, "continue_history_batch", &batch_id)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn pause_batch(state: State<'_, DesktopState>, batch_id: String) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || history_rpc(&owned, "pause_batch", &batch_id))
        .await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn abandon_result_export(state: State<'_, DesktopState>, batch_id: String) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || history_rpc(&owned, "abandon_result_export", &batch_id))
        .await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn skip_ocr_contact_review(
    state: State<'_, DesktopState>,
    batch_id: String,
) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        history_rpc(&owned, "skip_ocr_contact_review", &batch_id)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

fn document_review_surface(window: &tauri::WebviewWindow, state: &DesktopState, batch_id: Option<&str>) -> Result<(), String> {
    if window.label() != "main" || !workspace_catalogue_path(window.url().map_err(|_| "DOCUMENT_REVIEW_INVALID")?.path()) ||
        state.embedded_review_active.load(Ordering::Acquire) || state.app.get_webview_window("review").is_some() {
        return Err("DOCUMENT_REVIEW_INVALID".to_string());
    }
    if let Some(batch) = batch_id {
        let binding = state.document_review_batch.lock().map_err(|_| "DOCUMENT_REVIEW_INVALID")?;
        if binding.as_deref() != Some(batch) { return Err("DOCUMENT_REVIEW_STALE".to_string()); }
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn publish_result_documents(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String) -> Result<Value, String> {
    // No renderer paths, revision vector, operation ID or approval flag. The
    // private store owns every generation decision for this exact batch.
    document_review_surface(&window, &state, Some(&batch_id))?;
    let owned = state.inner().capture_connection();
    let expected_batch = batch_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move ||
        history_rpc(&owned, "publish_result_documents", &expected_batch))
        .await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    document_review_surface(&window, &state, Some(&batch_id))?;
    Ok(result)
}

async fn document_review_rpc(window: tauri::WebviewWindow, state: DesktopState, batch_id: String,
    action: &'static str, fields: Value) -> Result<Value, String> {
    document_review_surface(&window, &state, Some(&batch_id))?;
    let owned = state.clone();
    let batch = batch_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let mut request = json!({ "schema": IPC_SCHEMA, "request_id": id, "action": action, "batch_id": batch });
        for (key, value) in fields.as_object().ok_or("DOCUMENT_REVIEW_INVALID")? { request[key] = value.clone(); }
        rpc_request(&owned, action, &id, request)
    }).await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    // A closed/switched review invalidates the return channel as well.
    document_review_surface(&window, &state, Some(&batch_id))?;
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
async fn get_document_reviews(window: tauri::WebviewWindow, state: State<'_, DesktopState>, batch_id: String) -> Result<Value, String> {
    document_review_surface(&window, &state, None)?;
    if batch_id.len() != 64 || !batch_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("DOCUMENT_REVIEW_INVALID".to_string());
    }
    *state.document_review_batch.lock().map_err(|_| "DOCUMENT_REVIEW_INVALID")? = Some(batch_id.clone());
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "get_document_reviews", json!({})).await
}

#[tauri::command]
fn close_document_reviews(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<Value, String> {
    document_review_surface(&window, &state, None)?;
    *state.document_review_batch.lock().map_err(|_| "DOCUMENT_REVIEW_INVALID")? = None;
    Ok(json!({ "ok": true }))
}

#[tauri::command(rename_all = "camelCase")]
async fn get_document_review_history_summary(window: tauri::WebviewWindow, state: State<'_, DesktopState>, batch_id: String) -> Result<Value, String> {
    document_review_surface(&window, &state, None)?;
    if batch_id.len() != 64 || !batch_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("DOCUMENT_REVIEW_INVALID".to_string());
    }
    let owned = state.inner().capture_connection();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        rpc_request(&owned, "get_document_review_history_summary", &id,
            json!({ "schema": IPC_SCHEMA, "request_id": id, "action": "get_document_review_history_summary", "batch_id": batch_id }))
    }).await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    // Read-only metadata does not open or replace the active document binding.
    document_review_surface(&window, &state, None)?;
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
async fn get_document_review_chunk(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, document_id: String, revision: u64, chunk_index: u64) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "get_document_review_chunk",
        json!({ "document_id": document_id, "revision": revision, "chunk_index": chunk_index })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_document_entities(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, document_id: String, revision: u64, page: u64) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "get_document_entities",
        json!({ "document_id": document_id, "revision": revision, "page": page })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn decide_document_review(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, document_id: String, decision: Value) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "decide_document_review",
        json!({ "document_id": document_id, "decision": decision })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn decide_document_review_batch(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, decision: Value) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "decide_document_review_batch",
        json!({ "decision": decision })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_document_export(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: String, selection: Value) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "preview_document_export",
        json!({ "operation_id": operation_id, "selection": selection })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn export_approved_documents(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: String, selection: Value, acknowledge: Option<bool>) -> Result<Value, String> {
    let mut payload = json!({ "operation_id": operation_id, "selection": selection });
    if acknowledge == Some(true) { payload["acknowledge"] = json!(true); }
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "export_approved_documents",
        payload).await
}

#[tauri::command(rename_all = "camelCase")]
async fn abandon_document_export(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: String, digest: String) -> Result<Value, String> {
    document_review_rpc(window, state.inner().capture_connection(), batch_id, "abandon_document_export",
        json!({ "operation_id": operation_id, "digest": digest })).await
}

#[tauri::command(rename_all = "camelCase")]
async fn open_document_export(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: String) -> Result<Value, String> {
    let resolved = document_review_rpc(window.clone(), state.inner().capture_connection(), batch_id.clone(), "resolve_document_export",
        json!({ "operation_id": operation_id })).await?;
    let target = validate_local_target(resolved, "directory")?;
    document_review_surface(&window, &state, Some(&batch_id))?;
    // The server validates the stored purpose, exact owned directory and every
    // exported hash. The renderer supplies identifiers only and sees no path.
    open_local_target(&target, "directory", "open_document_export")
}

fn recorded_document_export_request(id: &str, batch_id: &str, operation_id: &str) -> Result<Value, String> {
    if batch_id.len() != 64 || operation_id.len() != 32 ||
        !batch_id.bytes().chain(operation_id.bytes()).all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("AI_EXPORT_INVALID".to_string());
    }
    Ok(json!({ "schema": IPC_SCHEMA, "request_id": id, "action": "resolve_document_export",
        "batch_id": batch_id, "operation_id": operation_id }))
}

fn recorded_document_export_surface(window: &tauri::WebviewWindow, state: &DesktopState) -> Result<(), String> {
    // The receipt belongs to durable history; opening it never restores a
    // document review binding or grants a new decision/export capability.
    document_review_surface(window, state, None)?;
    if state.expected_connection_epoch != state.connection_epoch.load(Ordering::Acquire) {
        return Err("STANDALONE_CONNECTION_CHANGED".to_string());
    }
    if state.lifecycle.stopping.load(Ordering::Acquire) { return Err(ipc_transport::CLOSED.to_string()); }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn open_recorded_document_export(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: String) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    recorded_document_export_surface(&window, &owned)?;
    let id = request_id();
    let request = recorded_document_export_request(&id, &batch_id, &operation_id)?;
    let resolver = owned.clone();
    let resolved = tauri::async_runtime::spawn_blocking(move || {
        // The resolver revalidates the receipt, directory and every file hash.
        // It may reconcile metadata for a previously published copy, but
        // never publishes a new copy or acknowledges receipt on this route.
        // No renderer-supplied path crosses IPC.
        rpc_request(&resolver, "resolve_document_export", &id, request)
    }).await.map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    let target = validate_local_target(resolved, "directory")?;
    // A connection/window change during resolution must prevent OS handoff;
    // use the ingress epoch, never a fresh capture after the await.
    recorded_document_export_surface(&window, &owned)?;
    open_local_target(&target, "directory", "open_recorded_document_export")
}

#[tauri::command(rename_all = "camelCase")]
async fn open_document_identity_overview(window: tauri::WebviewWindow, state: State<'_, DesktopState>,
    batch_id: String, operation_id: Option<String>) -> Result<Value, String> {
    let payload = match operation_id { Some(id) => json!({ "operation_id": id }), None => json!({}) };
    let resolved = document_review_rpc(window.clone(), state.inner().capture_connection(), batch_id.clone(), "resolve_document_identity_overview", payload).await?;
    let target = validate_local_target(resolved, "file")?;
    document_review_surface(&window, &state, Some(&batch_id))?;
    // No renderer-selected paths and no confidential text in the reply.
    open_local_target(&target, "file", "open_document_identity_overview")
}

async fn open_history_target(
    state: DesktopState,
    batch_id: String,
    action: &'static str,
    resolve_action: &'static str,
    kind: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let resolved = history_rpc(&state, resolve_action, &batch_id)?;
        let (target, warning) = history_local_target(resolved, kind, resolve_action == "resolve_history_identity_mapping")
            .inspect_err(|code| {
                diagnostic_event(
                    "local_target_validation_failed",
                    Some(action),
                    "failed",
                    Some(code),
                    None,
                )
            })?;
        let mut result = open_local_target(&target, kind, action)?;
        if let Some(code) = warning { result["identity_mapping_warning"] = json!(code); }
        Ok(result)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command(rename_all = "camelCase")]
async fn open_history_results(
    state: State<'_, DesktopState>,
    batch_id: String,
) -> Result<Value, String> {
    open_history_target(
        state.inner().capture_connection(),
        batch_id,
        "open_history_results",
        "resolve_history_results",
        "directory",
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
async fn open_history_ledger(
    state: State<'_, DesktopState>,
    batch_id: String,
) -> Result<Value, String> {
    open_history_target(
        state.inner().capture_connection(),
        batch_id,
        "open_history_ledger",
        "resolve_history_ledger",
        "file",
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
async fn open_history_identity_mapping(
    state: State<'_, DesktopState>,
    batch_id: String,
) -> Result<Value, String> {
    open_history_target(
        state.inner().capture_connection(), batch_id, "open_history_identity_mapping",
        "resolve_history_identity_mapping", "file",
    ).await
}

#[tauri::command]
async fn ack_terminal_presented(
    state: State<'_, DesktopState>,
    presentation_generation: u64,
) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        rpc(
            &owned,
            "ack_terminal_presented",
            None,
            &[],
            Some(presentation_generation),
            None,
        )
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn continue_current_batch(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().capture_connection(), "continue_current_batch").await
}
#[tauri::command]
async fn configure_results(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    diagnostic_event("picker_requested", Some("configure_results"), "progress", None, None);
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)
        .inspect_err(|code| diagnostic_event("picker_blocked", Some("configure_results"), "blocked", Some(code), None))?;
    // Derived from the owned window, never a renderer-supplied filesystem flag.
    // Keep the existing surface (including its network-folder behaviour) intact.
    let native_binding = state.app.get_webview_window("main")
        .and_then(|window| window.url().ok()).map(|url| workspace_catalogue_path(url.path())).unwrap_or(false);
    diagnostic_event(
        "picker_invocation_started",
        Some("configure_results"),
        "progress",
        None,
        None,
    );
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| {
            diagnostic_event("picker_failed", Some("configure_results"), "failed", Some("STANDALONE_SELECTION_FAILED"), None);
            "STANDALONE_SELECTION_FAILED".to_string()
        })?;
    let Some(path) = selected else {
        diagnostic_event(
            "picker_no_selection",
            Some("configure_results"),
            "no_selection",
            None,
            None,
        );
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    diagnostic_event(
        "picker_completed",
        Some("configure_results"),
        "ready",
        None,
        None,
    );
    tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let mut request = private_request(&id, "configure_results", None, &[path], None, None)?;
        if native_binding { request["native_export_binding"] = json!(true); }
        rpc_request(&owned, "configure_results", &id, request)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn open_current_results(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let target = resolved_local_target(&owned, "resolve_current_results", "directory")
            .inspect_err(|code| {
                diagnostic_event(
                    "local_target_validation_failed",
                    Some("open_current_results"),
                    "failed",
                    Some(code),
                    None,
                );
            })?;
        open_local_target(&target, "directory", "open_current_results")
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn open_local_ledger(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let target =
            resolved_local_target(&owned, "resolve_local_ledger", "file").inspect_err(|code| {
                diagnostic_event(
                    "local_target_validation_failed",
                    Some("open_local_ledger"),
                    "failed",
                    Some(code),
                    None,
                );
            })?;
        open_local_target(&target, "file", "open_local_ledger")
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn open_identity_mappings_directory(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().capture_connection();
    tauri::async_runtime::spawn_blocking(move || {
        let target = resolved_local_target(&owned, "resolve_identity_mappings_directory", "directory")
            .inspect_err(|code| {
                diagnostic_event(
                    "local_target_validation_failed",
                    Some("open_identity_mappings_directory"),
                    "failed",
                    Some(code),
                    None,
                );
            })?;
        open_local_target(&target, "directory", "open_identity_mappings_directory")
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn open_diagnostic_folder() -> Result<Value, String> {
    let directory = diagnostic_directory();
    let ensure = directory.clone();
    tauri::async_runtime::spawn_blocking(move || diagnostic_log::ensure_directory(&ensure)).await
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
    let command = native_open_command(&directory, "directory")?;
    diagnostic_event("os_open_requested", Some("open_diagnostic_folder"), "progress", None, None);
    #[cfg(target_os = "macos")]
    {
        let status = tauri::async_runtime::spawn_blocking(move || native_open::handoff_before_exit(command))
            .await.map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?
            .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
        if !status.success() {
            diagnostic_event("os_open_helper_failed", Some("open_diagnostic_folder"), "failed", Some("STANDALONE_OS_OPEN_HELPER_FAILED"), None);
            return Err("STANDALONE_DIAGNOSTICS_OPEN_FAILED".into());
        }
        diagnostic_event("diagnostic_folder_opened", None, "ready", None, None);
        Ok(json!({ "ok": true, "opened": true, "external_disclosure": false }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        native_open::handoff(command, |status| {
            if !matches!(status, Ok(status) if status.success()) {
                diagnostic_event("os_open_helper_failed", Some("open_diagnostic_folder"), "failed", Some("STANDALONE_OS_OPEN_HELPER_FAILED"), None);
            }
        }).map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
        diagnostic_event("diagnostic_folder_open_handoff_confirmed", None, "ready", None, None);
        Ok(json!({ "ok": true, "handoff_confirmed": true, "external_disclosure": false }))
    }
}
#[tauri::command]
async fn save_diagnostic_bundle() -> Result<Value, String> {
    // No DesktopState, Core RPC, run ownership or result-folder configuration:
    // diagnostics remain available during bootstrap failure or disconnected IPC.
    let _guard = diagnostic_bundle::SaveGuard::begin()
        .ok_or_else(|| "STANDALONE_DIAGNOSTIC_SAVE_BUSY".to_string())?;
    diagnostic_event("diagnostic_bundle_requested", None, "progress", None, None);
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let selected = tauri::async_runtime::spawn_blocking(move || rfd::FileDialog::new()
        .set_title("Diagnosepaket als neue Datei speichern")
        .set_file_name(format!("DataSecure-Diagnose-{stamp}.json"))
        .add_filter("DataSecure-Diagnose (JSON)", &["json"]).save_file())
        .await.map_err(|_| {
            diagnostic_event("diagnostic_bundle_failed", None, "failed", Some("STANDALONE_DIAGNOSTIC_SAVE_FAILED"), None);
            "STANDALONE_DIAGNOSTIC_SAVE_FAILED".to_string()
        })?;
    let Some(destination) = selected else {
        diagnostic_event("diagnostic_bundle_cancelled", None, "cancelled", None, None);
        return Ok(json!({ "ok": true, "cancelled": true, "saved": false, "local_ui_only": true, "external_disclosure": false }));
    };
    let result = tauri::async_runtime::spawn_blocking(move || diagnostic_bundle::save(&diagnostic_directory(), &destination))
        .await.map_err(|_| {
            diagnostic_event("diagnostic_bundle_failed", None, "failed", Some("STANDALONE_DIAGNOSTIC_SAVE_FAILED"), None);
            "STANDALONE_DIAGNOSTIC_SAVE_FAILED".to_string()
        })?;
    match result {
        Ok(partial) => {
            diagnostic_event("diagnostic_bundle_saved", None, "ready", None, None);
            Ok(json!({ "ok": true, "saved": true, "cancelled": false, "partial": partial,
                "local_ui_only": true, "external_disclosure": false }))
        }
        Err(_) => {
            diagnostic_event("diagnostic_bundle_failed", None, "failed", Some("STANDALONE_DIAGNOSTIC_SAVE_FAILED"), None);
            Err("STANDALONE_DIAGNOSTIC_SAVE_FAILED".into())
        }
    }
}
#[tauri::command]
fn get_native_recovery_status(state: State<'_, DesktopState>) -> Value {
    // Independent of the sidecar, including while IPC is blocked. This
    // snapshot never authorizes a new run, a release, or an export.
    // The failure, historical receipt and current epoch come from one lock;
    // neither a null failure nor a phase string proves that a Core is healthy.
    let (connection_epoch, failure, resolution) = match state.lifecycle.bootstrap_snapshot(&state.connection_epoch) {
        Ok(snapshot) => (Some(snapshot.connection_epoch), snapshot.failure, snapshot.resolution),
        Err(_) => (None, Some(ipc_transport::BootstrapFailure {
            epoch: state.connection_epoch.load(Ordering::Acquire), code: ipc_transport::FAILED.into() }), None),
    };
    let failure = failure.map(|failure| json!({ "epoch": failure.epoch, "error_code": failure.code }));
    let resolution = resolution.map(|value| json!({ "failure_epoch": value.failure_epoch, "ready_epoch": value.ready_epoch }));
    json!({ "phase": state.lifecycle.recovery_phase(), "connection_epoch": connection_epoch,
        "bootstrap_failure": failure, "bootstrap_resolution": resolution, "activity": state.activity.snapshot(), "diagnostic_log": diagnostic_log::status(), "diagnostic_writer": diagnostic_log::snapshot(), "local_ui_only": true,
        "external_disclosure": false })
}
#[tauri::command]
fn report_blocked_picker(action: String, reason: String) -> Value {
    let allowed_action = matches!(action.as_str(), "select_files" | "select_folder" | "configure_results");
    let code = match reason.as_str() {
        "reconnecting" => Some("STANDALONE_UI_RECONNECTING"),
        "busy" => Some("STANDALONE_UI_BUSY"),
        _ => None,
    };
    if allowed_action {
        if let Some(code) = code {
            diagnostic_event("ui_picker_blocked", Some(&action), "blocked", Some(code), None);
            return json!({ "ok": true });
        }
    }
    json!({ "ok": false })
}
#[tauri::command]
async fn shutdown(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().capture_connection(), "shutdown").await
}

#[tauri::command]
fn frontend_ready(state: State<'_, DesktopState>, native_drop_ready: Option<bool>) -> Value {
    state
        .frontend_ready
        .store(native_drop_ready == Some(true), Ordering::Release);
    diagnostic_event("frontend_ready", None, "ready", None, None);
    if NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref).is_some()
        && std::env::var("DATASECURE_STANDALONE_NATIVE_SMOKE_REVIEW").as_deref() == Ok("1")
    {
        let app = state.app.clone();
        tauri::async_runtime::spawn(async move {
            if open_review_window(app).await.is_err() {
                diagnostic_event("review_window_open_failed", None, "error", None, None);
            }
        });
    }
    json!({ "ok": true, "product_version": env!("CARGO_PKG_VERSION"), "build_id": build_id(),
        "runtime_target": runtime_target(),
        "admission_prepared": state.admission_present.load(Ordering::Acquire) })
}

fn begin_native_exit(state: DesktopState) {
    if !state.exit_gate.begin() { return; }
    state.lifecycle.stopping.store(true, Ordering::Release);
    tauri::async_runtime::spawn_blocking(move || {
        let stopped = state.lifecycle.stop();
        diagnostic_event("sidecar_shutdown", None, if stopped { "ready" } else { "failed" },
            if stopped { None } else { Some("STANDALONE_SHUTDOWN_FAILED") }, None);
        state.app.exit(state.exit_gate.finish(stopped));
    });
}

fn main() {
    source_fingerprint::retain();
    if std::env::args_os().nth(1).is_some_and(|value| value == "--startup-diagnostics") {
        let directory = diagnostic_directory();
        if std::fs::create_dir_all(&directory).is_err() { std::process::exit(70); }
        // The CLI has no GUI loop keeping the waiter alive. This helper exits
        // after handing the directory to the OS; wait before leaving the CLI.
        if let Ok(command) = native_open_command(&directory, "directory") {
            if !matches!(native_open::handoff_before_exit(command), Ok(status) if status.success()) { std::process::exit(70); }
        } else { std::process::exit(70); }
        return;
    }
    let profile = match native_smoke::from_environment() {
        Ok(profile) => profile,
        Err(_) => std::process::exit(65),
    };
    let isolated_smoke = profile.is_some();
    if profile
        .as_ref()
        .is_some_and(|value| native_smoke::prepare_webview_directory(value).is_err())
    {
        std::process::exit(65);
    }
    let _ = NATIVE_SMOKE_PROFILE.set(profile);
    let context = tauri::generate_context!();
    diagnostic_event("application_started", None, "ready", None, None);
    if isolated_smoke {
        diagnostic_event("webview_profile_ready", None, "ready", None, None);
    }
    let result = tauri::Builder::default()
        .on_page_load(|webview, payload| {
            let event = if webview.label() == "review" { "review_page_loaded" } else { "page_loaded" };
            diagnostic_event(event, None, "ready", None, None);
            if webview.label() == "main" && workspace_catalogue_path(payload.url().path()) {
                diagnostic_event("workspace_page_loaded", None, "ready", None, None);
            }
        })
        .setup(|app| {
            diagnostic_event("setup_started", None, "progress", None, None);
            let state = DesktopState {
                app: app.handle().clone(),
                sidecar: Arc::new(Mutex::new(None)),
                activity: ipc_activity::Tracker::default(),
                connection_epoch: Arc::new(AtomicU64::new(0)),
                expected_connection_epoch: 0,
                bootstrap_retry_epoch: None,
                retired_owner_generations: Arc::new(Mutex::new(Vec::new())),
                lifecycle: ipc_transport::Lifecycle::default(),
                exit_gate: ipc_transport::ExitGate::default(),
                selection_busy: Arc::new(AtomicBool::new(false)),
                admission_present: Arc::new(AtomicBool::new(false)),
                frontend_ready: Arc::new(AtomicBool::new(false)),
                review_window_binding: Arc::new(Mutex::new(review_window::Binding::default())),
                embedded_review_active: Arc::new(AtomicBool::new(false)),
                document_review_batch: Arc::new(Mutex::new(None)),
                review_ui_busy: Arc::new(AtomicBool::new(false)),
            };
            app.manage(state);
            diagnostic_event("setup_completed", None, "ready", None, None);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "review" {
                // Its instance-bound listener owns review close; this global
                // label callback must not query or defer a future session.
                return;
            }
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if let Some(state) = window.try_state::<DesktopState>() {
                        begin_native_exit(state.inner().capture_connection());
                    } else {
                        window.app_handle().exit(0);
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    // Configured windows can emit events before setup manages
                    // DesktopState. Early events must not panic during startup.
                    if let Some(state) = window.try_state::<DesktopState>() {
                        native_drop(&state, paths.clone());
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Enter { .. }) => {
                    let _ = window.emit("datasecure-native-drop", json!({"phase": "enter"}));
                }
                WindowEvent::DragDrop(DragDropEvent::Leave) => {
                    let _ = window.emit("datasecure-native-drop", json!({"phase": "leave"}));
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            select_files,
            select_folder,
            remove_admitted_source,
            cancel_admission,
            start_admitted_batch,
            get_public_state,
            get_ui_context,
            get_run_history,
            set_run_history_visibility,
            open_review_window,
            open_embedded_review,
            close_review_window,
            get_review_session,
            get_review_chunk,
            submit_review,
            continue_review_session,
            get_run_failures,
            continue_history_batch,
            pause_batch,
            abandon_result_export,
            skip_ocr_contact_review,
            get_document_reviews,
            get_document_review_history_summary,
            close_document_reviews,
            get_document_review_chunk,
            get_document_entities,
            decide_document_review,
            decide_document_review_batch,
            export_approved_documents,
            publish_result_documents,
            preview_document_export,
            abandon_document_export,
            open_document_export,
            open_recorded_document_export,
            open_document_identity_overview,
            open_history_results,
            open_history_ledger,
            open_history_identity_mapping,
            open_identity_mappings_directory,
            ack_terminal_presented,
            continue_current_batch,
            configure_results,
            open_current_results,
            open_local_ledger,
            open_diagnostic_folder,
            save_diagnostic_bundle,
            get_native_recovery_status,
            report_blocked_picker,
            shutdown,
            frontend_ready
        ])
        .build(context);
    let app = match result {
        Ok(app) => app,
        Err(error) => {
            let code = startup_diagnostics::classify(&error);
            diagnostic_event(
                "application_run_failed",
                None,
                "error",
                Some(code),
                None,
            );
            if let Ok(file) = startup_diagnostics::report(&diagnostic_directory(), code) {
                if let Ok(command) = native_open_command(&file, "file") {
                    let _ = native_open::handoff_before_exit(command);
                }
            } else { eprintln!("DataSecure Startfehler: {code}. Diagnose konnte nicht geschrieben werden."); }
            std::process::exit(70);
        }
    };
    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if let Some(state) = app_handle.try_state::<DesktopState>() {
                if !state.exit_gate.allowed(code) {
                    api.prevent_exit();
                    begin_native_exit(state.inner().capture_connection());
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidecar_stderr_is_reduced_to_fixed_codes_without_private_text() {
        assert_eq!(classify_sidecar_stderr(b"Error: Cannot find module '/Users/test/private.js'"),
            "STANDALONE_SIDECAR_MODULE_MISSING");
        assert_eq!(classify_sidecar_stderr(b"EACCES: permission denied, open '/Users/test/private.js'"),
            "STANDALONE_SIDECAR_FILE_ACCESS_DENIED");
        assert_eq!(classify_sidecar_stderr(b"private document body"), "STANDALONE_SIDECAR_STDERR_OTHER");
    }

    #[test]
    fn bundled_runtime_components_have_distinct_content_free_missing_codes() {
        let absent = std::env::temp_dir().join(format!("datasecure-absent-runtime-{}", request_id()));
        assert!(!absent.exists());
        for (component, expected) in [
            (RuntimeComponent::Core, "STANDALONE_BUNDLED_CORE_UNAVAILABLE"),
            (RuntimeComponent::SidecarScript, "STANDALONE_BUNDLED_SIDECAR_UNAVAILABLE"),
            (RuntimeComponent::NetworkDeny, "STANDALONE_BUNDLED_NETWORK_DENY_UNAVAILABLE"),
        ] {
            assert_eq!(required_runtime_component([absent.clone()], component),
                Err(RuntimeComponentFailure { component, code: "STANDALONE_RUNTIME_MISSING" }));
            assert_eq!(component.diagnostic_code(), expected);
        }
    }

    #[test]
    fn bundled_runtime_lookup_refusal_stops_before_any_candidate_fallback() {
        let missing = PathBuf::from("synthetic-missing");
        let denied = PathBuf::from("synthetic-denied");
        let fallback = PathBuf::from("synthetic-fallback");
        for component in [RuntimeComponent::Core, RuntimeComponent::SidecarScript, RuntimeComponent::NetworkDeny] {
            for candidates in [vec![denied.clone(), fallback.clone()], vec![missing.clone(), denied.clone(), fallback.clone()]] {
                let mut visited = Vec::new();
                let result = required_runtime_component_with_metadata(candidates.clone(), component, |candidate| {
                    visited.push(candidate.to_path_buf());
                    if candidate == missing.as_path() {
                        Err(std::io::Error::new(std::io::ErrorKind::NotFound, "PRIVATE vendor path"))
                    } else if candidate == denied.as_path() {
                        Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "PRIVATE vendor path"))
                    } else { panic!("a denied candidate must not inspect its fallback") }
                });
                let expected = RuntimeComponentFailure { component, code: "STANDALONE_RUNTIME_DENIED" };
                assert_eq!(result, Err(expected));
                assert!(!format!("{expected:?}").contains("PRIVATE"));
                assert_eq!(visited, candidates[..candidates.len() - 1]);
            }
        }
    }

    #[test]
    fn bundled_runtime_missing_and_directory_candidates_remain_ineligible() {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let file = directory.join("Cargo.toml");
        let missing = directory.join(format!("absent-runtime-{}", request_id()));
        assert!(!missing.exists());
        assert_eq!(required_runtime_component([missing.clone(), directory.clone()], RuntimeComponent::Core),
            Err(RuntimeComponentFailure { component: RuntimeComponent::Core, code: "STANDALONE_RUNTIME_MISSING" }));
        assert_eq!(required_runtime_component([missing, directory, file.clone()], RuntimeComponent::Core), Ok(file));
    }

    #[cfg(unix)]
    #[test]
    fn bundled_runtime_symlinks_remain_ineligible() {
        let directory = std::env::temp_dir().join(format!("datasecure-runtime-link-{}", request_id()));
        std::fs::create_dir(&directory).expect("exclusive test directory");
        let file = directory.join("synthetic-core");
        let link = directory.join("synthetic-link");
        std::fs::write(&file, b"synthetic").expect("test file");
        std::os::unix::fs::symlink(&file, &link).expect("test symlink");
        assert_eq!(required_runtime_component([link.clone()], RuntimeComponent::Core),
            Err(RuntimeComponentFailure { component: RuntimeComponent::Core, code: "STANDALONE_RUNTIME_MISSING" }));
        assert_eq!(required_runtime_component([link.clone(), file.clone()], RuntimeComponent::Core), Ok(file.clone()));
        std::fs::remove_file(link).expect("remove test symlink");
        std::fs::remove_file(file).expect("remove test file");
        std::fs::remove_dir(directory).expect("remove empty test directory");
    }

    #[test]
    fn bundled_runtime_lookup_errors_have_only_fixed_content_free_codes() {
        for (kind, expected) in [
            (std::io::ErrorKind::PermissionDenied, "STANDALONE_RUNTIME_DENIED"),
            (std::io::ErrorKind::NotFound, "STANDALONE_RUNTIME_MISSING"),
            (std::io::ErrorKind::Other, "STANDALONE_RUNTIME_MISSING"),
        ] {
            assert_eq!(runtime_lookup_code(&std::io::Error::new(kind, "PRIVATE vendor path")), expected);
        }
    }

    #[test]
    fn bundled_runtime_resource_lookup_preserves_refusal_without_vendor_text() {
        for (kind, expected) in [
            (std::io::ErrorKind::PermissionDenied, "STANDALONE_RUNTIME_DENIED"),
            (std::io::ErrorKind::NotFound, "STANDALONE_RUNTIME_MISSING"),
            (std::io::ErrorKind::Other, "STANDALONE_RUNTIME_MISSING"),
        ] {
            let error = tauri::utils::Error::Io(std::io::Error::new(kind, "PRIVATE vendor path"));
            assert_eq!(runtime_resource_code(&error), expected);
        }
        assert_eq!(runtime_resource_code(&tauri::utils::Error::UnsupportedPlatform), "STANDALONE_RUNTIME_MISSING");
    }

    #[test]
    fn retirement_completion_gap_does_not_consume_recovery_generations() {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut command = { use std::os::windows::process::CommandExt; let mut c = Command::new("powershell.exe");
            c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]).creation_flags(0x08000000); c };
        #[cfg(not(windows))]
        let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
        let lifecycle = ipc_transport::Lifecycle::default(); let generations = Mutex::new(vec!["a".repeat(32)]);
        let child = ipc_transport::ChildControl::new(command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
        let spawn = lifecycle.begin_spawn().unwrap(); spawn.register(child.clone()).unwrap(); drop(spawn);
        let (arrive, arrived) = mpsc::channel(); let (release, released) = mpsc::channel();
        lifecycle.retire_async(child, move || { arrive.send(()).unwrap(); released.recv().unwrap(); Ok(()) }).unwrap();
        arrived.recv_timeout(Duration::from_secs(5)).unwrap();
        for _ in 0..32 { assert!(reserve_sidecar_generation(&lifecycle, &generations).is_err()); }
        assert_eq!(generations.lock().unwrap().len(), 1);
        release.send(()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match reserve_sidecar_generation(&lifecycle, &generations) {
                Ok((guard, generation, prior)) => { assert_eq!(prior, vec!["a".repeat(32)]); assert_eq!(generation.len(), 32); drop(guard); break; },
                Err(_) => { assert!(Instant::now() < deadline); std::thread::yield_now(); }
            }
        }
        assert_eq!(generations.lock().unwrap().len(), 2); assert!(lifecycle.stop());
    }

    #[test]
    fn exhausted_recovery_budget_has_its_own_cause_and_does_not_spawn() {
        let lifecycle = ipc_transport::Lifecycle::default();
        let generations = Mutex::new((0..16).map(|index| format!("{index:032x}")).collect());
        assert_eq!(reserve_sidecar_generation(&lifecycle, &generations).err().as_deref(),
            Some("STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED"));
        assert_eq!(generations.lock().unwrap().len(), 16);
        assert_eq!(lifecycle.recovery_phase(), "idle");
        assert!(lifecycle.stop());
    }

    #[test]
    fn held_bootstrap_failure_blocks_display_reads_without_consuming_generation_budget() {
        let lifecycle = ipc_transport::Lifecycle::default();
        let generations = Mutex::new(vec!["a".repeat(32)]);
        lifecycle.hold_bootstrap_failure(1, "STANDALONE_OWNERSHIP_STORAGE_UNSAFE").unwrap();
        for _ in 0..20 {
            assert_eq!(reserve_sidecar_generation_for_retry(&lifecycle, &generations, None).err().as_deref(),
                Some("STANDALONE_OWNERSHIP_STORAGE_UNSAFE"));
        }
        assert_eq!(generations.lock().unwrap().len(), 1);
        assert!(reserve_sidecar_generation_for_retry(&lifecycle, &generations, Some(0)).is_err());
        let (pending, _, previous) = reserve_sidecar_generation_for_retry(&lifecycle, &generations, Some(1)).unwrap();
        assert_eq!(previous.len(), 1);
        assert!(reserve_sidecar_generation_for_retry(&lifecycle, &generations, Some(1)).is_err());
        assert_eq!(generations.lock().unwrap().len(), 2); drop(pending);
        assert!(lifecycle.bootstrap_failure().unwrap().is_some());
        assert!(lifecycle.stop());
    }

    #[test]
    fn tolerant_catalogue_is_bound_to_the_v2_asset_not_the_legacy_or_review_page() {
        assert!(workspace_catalogue_path("/workspace.html"));
        assert!(workspace_catalogue_path("workspace.html"));
        for path in ["/", "/index.html", "/review.html", "/nested/workspace.html", "/workspace.html/", ""] {
            assert!(!workspace_catalogue_path(path), "{path}");
        }
    }

    #[test]
    fn markdown_contact_review_is_explicit_opt_in_not_anonymization_or_coercion() {
        for mode in ["markdown-only", "markdown-and-anonymize"] {
            assert!(!validate_ocr_contact_review(mode, None).unwrap());
            assert_eq!(validate_ocr_contact_review(mode, Some(false)).unwrap_err(), "OCR_CONTACT_REVIEW_INVALID");
        }
        assert!(validate_ocr_contact_review("markdown-only", Some(true)).unwrap());
        for mode in ["markdown-and-anonymize", "unknown", ""] {
            assert_eq!(validate_ocr_contact_review(mode, Some(true)).unwrap_err(), "OCR_CONTACT_REVIEW_INVALID");
        }
    }

    #[test]
    fn diagnostic_ipc_correlation_accepts_only_bounded_content_free_ids() {
        let id = request_id();
        assert_eq!(diagnostic_request_id(&id), Some(id.as_str()));
        assert_eq!(diagnostic_request_id("0123456789abcdef"), Some("0123456789abcdef"));
        for invalid in ["private/file.pdf", "Anna Beispiel", "ABCDEF0123456789", "", "1"] {
            assert_eq!(diagnostic_request_id(invalid), None);
        }
        assert_eq!(diagnostic_request_id(&"a".repeat(65)), None);
    }

    #[test]
    fn inactive_previous_runs_never_block_a_new_selection() {
        for state in [
            "ready",
            "results_available",
            "completed_without_results",
            "review_required",
            "stopped",
            "export_pending",
        ] {
            assert!(state_allows_new_admission(&json!({ "state": state })), "{state}");
        }
        for state in ["preparing", "processing", "blocked", "unknown"] {
            assert!(!state_allows_new_admission(&json!({ "state": state })), "{state}");
        }
        assert!(!state_allows_new_admission(&json!({})));
    }

    #[test]
    fn paused_admission_requires_both_explicit_quiescent_flags() {
        let paused = json!({ "state": "paused", "processing": false, "preparing": false });
        assert!(state_allows_new_admission(&paused));
        for field in ["processing", "preparing"] {
            let mut missing = paused.clone();
            missing.as_object_mut().unwrap().remove(field);
            assert!(!state_allows_new_admission(&missing), "missing {field}: {missing}");
            for value in [json!(true), Value::Null, json!("false"), json!(0), json!([]), json!({})] {
                let mut status = paused.clone();
                status[field] = value;
                assert!(!state_allows_new_admission(&status), "unknown or active {field}: {status}");
            }
        }
        assert!(!state_allows_new_admission(&json!({ "state": "paused" })));
    }

    #[test]
    fn paused_selected_run_cannot_hide_another_active_worker() {
        // application-service.status() prioritizes latest.paused over the
        // global processing branch, but retains its actual boolean flags.
        let projected = json!({ "state": "paused", "batch_id": "a".repeat(64),
            "processing": true, "preparing": false, "pause_requested": true,
            "batch_complete": false, "resumable": true });
        assert!(!state_allows_new_admission(&projected));
        for state in ["preparing", "processing", "blocked", "unknown"] {
            assert!(!state_allows_new_admission(&json!({ "state": state,
                "processing": false, "preparing": false })), "{state}");
        }
    }

    #[test]
    fn failed_intake_admission_requires_explicit_confirmed_worker_end() {
        let ended = json!({ "state": "start_failed", "intake_failure": {
            "error_code": "STANDALONE_START_FAILED", "worker_active": false } });
        assert!(state_allows_new_admission(&ended));
        for active in [json!(true), Value::Null, json!("false"), json!(0), json!({})] {
            let mut status = ended.clone();
            status["intake_failure"]["worker_active"] = active;
            assert!(!state_allows_new_admission(&status), "unknown or active worker: {status}");
        }
        for failure in [Value::Null, json!({}), json!({ "worker_active": false }),
            json!({ "error_code": "OTHER", "worker_active": false }),
            json!({ "error_code": "STANDALONE_START_FAILED" })] {
            let status = json!({ "state": "start_failed", "intake_failure": failure });
            assert!(!state_allows_new_admission(&status), "incomplete failure receipt: {status}");
        }
        assert!(!state_allows_new_admission(&json!({ "state": "processing", "intake_failure": ended["intake_failure"] })));
    }

    #[test]
    fn history_requests_bind_only_exact_batch_ids_without_paths_or_modes() {
        let id = "a".repeat(16);
        let batch = "b".repeat(64);
        for action in [
            "resolve_history_results",
            "resolve_history_ledger",
            "continue_history_batch",
            "publish_result_documents",
        ] {
            let value = history_request(&id, action, &batch).expect("valid history action");
            assert_eq!(value.as_object().unwrap().len(), 4);
            assert_eq!(value["batch_id"], batch);
            assert_eq!(value["action"], action);
            assert!(value.get("source_paths").is_none());
            assert!(value.get("processing_mode").is_none());
            assert!(value.get("selection").is_none());
            assert!(value.get("operation_id").is_none());
            assert!(value.get("acknowledge").is_none());
            for invalid in [
                "".to_string(),
                "b".repeat(63),
                "B".repeat(64),
                "g".repeat(64),
                "../latest".to_string(),
            ] {
                assert_eq!(
                    history_request(&id, action, &invalid).unwrap_err(),
                    "STANDALONE_HISTORY_INVALID"
                );
            }
        }
        assert!(history_request(&id, "get_run_history", &batch).is_err());
        assert!(history_request(&id, "start_admitted_batch", &batch).is_err());
    }

    #[test]
    fn run_history_display_is_read_only_unless_exact_batch_recovery_is_requested() {
        let id = "1".repeat(32);
        let batch = "a".repeat(64);
        let display = run_history_request(&id, None, None, None, None).unwrap();
        assert_eq!(display["action"], "get_run_history");
        assert_eq!(display.as_object().unwrap().len(), 3);
        let hidden = run_history_request(&id, None, None, Some(true), None).unwrap();
        assert_eq!(hidden["include_hidden"], true);
        assert_eq!(hidden.as_object().unwrap().len(), 4);
        let detail = run_history_request(&id, None, None, None, Some(batch.clone())).unwrap();
        assert_eq!(detail["batch_id"], batch);
        assert_eq!(detail.as_object().unwrap().len(), 4);
        assert!(run_history_request(&id, None, None, None, Some("../bad".to_string())).is_err());
        assert!(run_history_request(&id, None, None, Some(true), Some(batch.clone())).is_err());
        assert!(run_history_request(&id, Some(true), Some(batch.clone()), None, Some(batch.clone())).is_err());
        assert_eq!(run_history_request(&id, None, None, Some(false), None).unwrap_err(), "STANDALONE_HISTORY_INVALID");
        for hidden in [false, true] {
            let change = run_history_visibility_request(&id, &batch, hidden).unwrap();
            assert_eq!(change["action"], "set_run_history_visibility");
            assert_eq!(change["batch_id"], batch);
            assert_eq!(change["hidden"], hidden);
            assert_eq!(change.as_object().unwrap().len(), 5);
        }
        assert!(run_history_visibility_request(&id, "../outside", true).is_err());
        let recovery = run_history_request(&id, Some(true), Some(batch.clone()), None, None).unwrap();
        assert_eq!(recovery["recover_exports"], true);
        assert_eq!(recovery["recover_batch_id"], batch);
        assert_eq!(recovery.as_object().unwrap().len(), 5);
        for (flag, target) in [
            (Some(true), None), (Some(false), Some(batch.clone())),
            (None, Some(batch.clone())), (Some(true), Some("A".repeat(64))),
            (Some(true), Some("a".repeat(63))),
        ] {
            assert_eq!(run_history_request(&id, flag, target, None, None).unwrap_err(), "STANDALONE_HISTORY_INVALID");
        }
    }

    #[test]
    fn support_trace_requires_the_exact_explicit_opt_in() {
        use std::ffi::OsStr;
        for setting in [
            None,
            Some(""),
            Some("0"),
            Some("true"),
            Some("1 "),
            Some("1"),
        ] {
            let mut command = Command::new("synthetic-sidecar");
            command
                .env_clear()
                .env("EU_PRIVACY_SUPPORT_MODE", "old-value");
            configure_support_trace(&mut command, setting.map(OsStr::new));
            let actual = command.get_envs().find_map(|(key, value)| {
                if key == OsStr::new("EU_PRIVACY_SUPPORT_MODE") {
                    value
                } else {
                    None
                }
            });
            assert_eq!(
                actual,
                if setting == Some("1") {
                    Some(OsStr::new("1"))
                } else {
                    None
                }
            );
        }
    }
    use std::io::Cursor;

    fn frame(payload: &[u8]) -> Vec<u8> {
        let mut bytes = (payload.len() as u32).to_be_bytes().to_vec();
        bytes.extend_from_slice(payload);
        bytes
    }

    #[test]
    fn reads_one_bounded_json_frame() {
        let payload = br#"{"ok":true}"#;
        let value = read_frame(&mut Cursor::new(frame(payload))).expect("valid frame");
        assert_eq!(value.get("ok").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn native_drop_classifies_real_unicode_paths_and_refuses_ambiguous_shapes() {
        let directory = std::env::temp_dir().join(format!("datasecure-drop-{}", request_id()));
        std::fs::create_dir(&directory).expect("exclusive test directory");
        let source = directory.join("Kunde Müller Profil.txt");
        let second = directory.join("Daten äöü.csv");
        std::fs::write(&source, b"synthetic").expect("test source");
        std::fs::write(&second, b"synthetic").expect("second source");
        assert_eq!(
            dropped_source_kind(&[source.clone(), second.clone()]).unwrap(),
            "files"
        );
        assert_eq!(
            dropped_source_kind(std::slice::from_ref(&directory)).unwrap(),
            "folder"
        );
        assert_eq!(
            dropped_source_kind(&[directory.clone(), source.clone()]).unwrap_err(),
            "STANDALONE_DROP_MIXED"
        );
        assert_eq!(
            dropped_source_kind(&[directory.clone(), directory.clone()]).unwrap_err(),
            "STANDALONE_DROP_MIXED"
        );
        assert_eq!(
            dropped_source_kind(&[]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
        assert_eq!(
            dropped_source_kind(&vec![source.clone(); 201]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
        assert_eq!(
            dropped_source_kind(&[PathBuf::from("relative.txt")]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
        assert_eq!(
            dropped_source_kind(&[directory.join("missing.txt")]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
        #[cfg(unix)]
        {
            let link = directory.join("link.txt");
            std::os::unix::fs::symlink(&source, &link).expect("test symlink");
            assert_eq!(
                dropped_source_kind(std::slice::from_ref(&link)).unwrap_err(),
                "STANDALONE_SELECTION_INVALID"
            );
            std::fs::remove_file(link).expect("remove test symlink");
        }
        std::fs::remove_file(source).expect("remove test source");
        std::fs::remove_file(second).expect("remove second test source");
        std::fs::remove_dir(directory).expect("remove empty test directory");
    }

    #[test]
    fn native_selection_guard_excludes_concurrent_selections_and_controls_prepared_access() {
        let busy = Arc::new(AtomicBool::new(false));
        let admitted = AtomicBool::new(false);
        let owner = selection_guard(&busy, &admitted, false).expect("first selection");
        assert_eq!(
            selection_guard(&busy, &admitted, false).err().unwrap(),
            "STANDALONE_BUSY"
        );
        assert!(
            busy.load(Ordering::Acquire),
            "a refused contender cannot release the owner"
        );
        drop(owner);
        admitted.store(true, Ordering::Release);
        assert_eq!(
            selection_guard(&busy, &admitted, false).err().unwrap(),
            "STANDALONE_SELECTION_PREPARED"
        );
        assert!(
            !busy.load(Ordering::Acquire),
            "prepared rejection releases its own reservation"
        );
        let start = selection_guard(&busy, &admitted, true).expect("append, Start or cancel");
        assert_eq!(
            selection_guard(&busy, &admitted, true).err().unwrap(),
            "STANDALONE_BUSY"
        );
        drop(start);
        admitted.store(false, Ordering::Release);
        assert!(
            selection_guard(&busy, &admitted, false).is_ok(),
            "new selection after cancellation"
        );
    }

    #[test]
    fn refuses_oversized_frames_before_allocation() {
        let bytes = ((MAX_FRAME_BYTES + 1) as u32).to_be_bytes().to_vec();
        assert_eq!(
            read_frame(&mut Cursor::new(bytes)).unwrap_err(),
            "STANDALONE_IPC_FAILED"
        );
    }

    #[test]
    fn refuses_invalid_json_without_exposing_content() {
        assert_eq!(
            read_frame(&mut Cursor::new(frame(b"not-json"))).unwrap_err(),
            "STANDALONE_IPC_FAILED"
        );
    }

    #[test]
    fn accepts_only_the_sidecar_path_budget() {
        let mut within = vec![PathBuf::from("a".repeat(MAX_SINGLE_PATH_BYTES)); 24];
        within.push(PathBuf::from("b".repeat(24)));
        assert_eq!(
            strict_path_strings(&within)
                .expect("within aggregate limit")
                .len(),
            25
        );
        let mut above = vec![PathBuf::from("a".repeat(MAX_SINGLE_PATH_BYTES)); 24];
        above.push(PathBuf::from("b".repeat(25)));
        assert_eq!(
            strict_path_strings(&above).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
        assert_eq!(
            strict_path_strings(&[PathBuf::from("a".repeat(MAX_SINGLE_PATH_BYTES + 1))])
                .unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
    }

    #[test]
    fn desktop_start_requires_a_mode_and_an_explicit_anonymized_filename_policy() {
        let id = "0123456789abcdef";
        for naming in ["neutral", "source-with-suffix"] {
            let request = private_start_request(id, Some("markdown-and-anonymize"), Some(naming))
                .expect("supported naming reaches the private service");
            assert_eq!(request["processing_mode"], json!("markdown-and-anonymize"));
            assert_eq!(request["output_naming_mode"], json!(naming));
            assert!(request.get("processingMode").is_none());
            assert!(request.get("outputNamingMode").is_none());
            assert_eq!(request.as_object().unwrap().len(), 5);
        }
        let conversion = private_start_request(id, Some("markdown-only"), None)
            .expect("pure conversion has no anonymized filename policy");
        assert_eq!(conversion["processing_mode"], json!("markdown-only"));
        assert!(conversion.get("output_naming_mode").is_none());
        for mode in [
            None,
            Some(""),
            Some("auto"),
            Some("local_only"),
            Some("Markdown-only"),
        ] {
            assert_eq!(
                private_start_request(id, mode, None).unwrap_err(),
                "PROCESSING_MODE_INVALID"
            );
        }
        for (mode, naming) in [
            ("markdown-and-anonymize", None),
            ("markdown-and-anonymize", Some("unknown")),
            ("markdown-only", Some("neutral")),
            ("markdown-only", Some("source-with-suffix")),
        ] {
            assert_eq!(
                private_start_request(id, Some(mode), naming).unwrap_err(),
                "RESULT_NAMING_MODE_INVALID"
            );
        }
        for action in [
            "continue_current_batch",
            "cancel_admission",
            "get_public_state",
            "shutdown",
        ] {
            assert_eq!(
                private_request(id, action, None, &[], None, Some("markdown-only")).unwrap_err(),
                "PROCESSING_MODE_INVALID"
            );
            let request = private_request(id, action, None, &[], None, None).unwrap();
            assert!(request.get("processing_mode").is_none());
        }
    }

    #[test]
    fn prepared_selection_removal_is_index_bounded_and_content_free() {
        let id = "0123456789abcdef";
        let request = removal_request(id, 199).expect("the last allowed selection position");
        assert_eq!(request["action"], json!("remove_admitted_source"));
        assert_eq!(request["selection_index"], json!(199));
        assert_eq!(request.as_object().unwrap().len(), 4);
        assert!(request.get("source_paths").is_none());
        assert_eq!(
            removal_request(id, 200).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
    }

    #[test]
    fn mode_rejection_preserves_admission_but_an_uncertain_start_does_not() {
        for code in [
            "PROCESSING_MODE_INVALID",
            "PROCESSING_MODE_FORBIDDEN",
            "MARKDOWN_CONVERSION_NOT_READY",
            "CONTENT_OPTIONS_INVALID",
            "STANDALONE_RESULT_ROOT_UNAVAILABLE",
            "STANDALONE_REVIEW_POLICY_INVALID",
            "STANDALONE_IPC_BUSY",
            "STANDALONE_BUSY",
            "CONTENT_OPTIONS_FORBIDDEN",
            "CONTENT_OPTIONS_NOT_READY",
        ] {
            assert!(mode_rejected_before_start(&Err(code.to_string())));
        }
        for code in [
            "STANDALONE_START_FAILED",
            "STANDALONE_IPC_FAILED",
            "STANDALONE_IPC_TIMEOUT",
        ] {
            assert!(!mode_rejected_before_start(&Err(code.to_string())));
        }
        assert!(!mode_rejected_before_start(&Ok(json!({ "ok": true }))));
    }

    #[test]
    fn actual_invoke_body_decodes_raw_contract_and_keeps_legacy_json() {
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(
            json!({ "processingMode": "markdown-only" })), false).unwrap(), ValidatedStartContent { options: None, review_policy: None });
        let content = json!({ "schema": "datasecure-content-options/1", "markdownOutput": "content-v1",
            "scanOcr": true, "imageOcr": false });
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(
            json!({ "processingMode": "markdown-only", "contentOptions": content })), true).unwrap(),
            ValidatedStartContent { options: Some(content), review_policy: None });
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(
            json!({ "processingMode": "markdown-only", "contentOptions": null })), true).unwrap_err(), "CONTENT_OPTIONS_INVALID");
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Raw(vec![]), true).unwrap_err(), "CONTENT_OPTIONS_INVALID");
    }
    #[test]
    fn start_policy_comes_only_from_the_same_closed_raw_content_contract() {
        let content = json!({ "schema": "datasecure-content-options/1", "markdownOutput": "content-v1",
            "scanOcr": true, "imageOcr": false });
        let body = json!({ "processingMode": "markdown-and-anonymize", "contentOptions": content,
            "reviewPolicy": "automatic-conservative" });
        let decoded = validate_start_content_body(&tauri::ipc::InvokeBody::Json(body.clone()), true).unwrap();
        assert_eq!(decoded.options, Some(content));
        assert_eq!(decoded.review_policy.as_deref(), Some("automatic-conservative"));
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(body.clone()), false).unwrap_err(), "STANDALONE_REVIEW_POLICY_INVALID");
        for value in [Value::Null, json!(true), json!("automatic"), json!({})] {
            let mut invalid = body.clone(); invalid["reviewPolicy"] = value;
            assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(invalid), true).unwrap_err(), "STANDALONE_REVIEW_POLICY_INVALID");
        }
        let mut missing = body.clone(); missing.as_object_mut().unwrap().remove("contentOptions");
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(missing), true).unwrap_err(), "STANDALONE_REVIEW_POLICY_INVALID");
        let mut alias = body; alias["review_policy"] = alias.as_object_mut().unwrap().remove("reviewPolicy").unwrap();
        assert_eq!(validate_start_content_body(&tauri::ipc::InvokeBody::Json(alias), true).unwrap_err(), "CONTENT_OPTIONS_INVALID");
    }

    #[test]
    fn raw_start_rpc_transports_every_content_option_without_privacy_fields() {
        for output in ["content-v1", "notes-v1"] {
            for scan in [false, true] {
                for image in [false, true] {
                    let content = json!({ "schema": "datasecure-content-options/1", "markdownOutput": output,
                        "scanOcr": scan, "imageOcr": image });
                    let request = private_content_start_request("0123456789abcdef", Some("markdown-only"),
                        None, Some(content.clone()), true).unwrap();
                    assert_eq!(request["content_options"], content);
                    assert_eq!(request["processing_mode"], json!("markdown-only"));
                    assert_eq!(request["document_review"], json!(true));
                    assert_eq!(request.as_object().unwrap().len(), 6);
                    for key in ["contentOptions", "output_naming_mode", "pseudonym_seed", "read_capability", "source_paths"] {
                        assert!(request.get(key).is_none(), "{key}");
                    }
                }
            }
        }
    }

    #[test]
    fn new_content_rpc_preserves_both_purposes_but_requires_document_review_surface() {
        let content = json!({ "schema": "datasecure-content-options/1", "markdownOutput": "content-v1",
            "scanOcr": true, "imageOcr": false });
        let anonymized = private_content_start_request("0123456789abcdef", Some("markdown-and-anonymize"),
            Some("neutral"), Some(content.clone()), true).unwrap();
        assert_eq!(anonymized["processing_mode"], json!("markdown-and-anonymize"));
        assert_eq!(anonymized["output_naming_mode"], json!("neutral"));
        assert_eq!(anonymized["content_options"], content);
        assert_eq!(anonymized["document_review"], json!(true));
        for (mode, naming, reviewed) in [("markdown-only", None, false),
            ("markdown-and-anonymize", Some("neutral"), false)] {
            let failure = private_content_start_request("0123456789abcdef", Some(mode), naming,
                Some(content.clone()), reviewed).unwrap_err();
            assert_eq!(failure, "CONTENT_OPTIONS_NOT_READY");
            assert!(mode_rejected_before_start(&Err(failure)));
        }
        let legacy = private_content_start_request("0123456789abcdef", Some("markdown-and-anonymize"),
            Some("neutral"), None, false).unwrap();
        assert!(legacy.get("content_options").is_none());
        assert!(legacy.get("document_review").is_none());
    }

    #[test]
    fn recorded_export_request_has_only_exact_receipt_identifiers() {
        let batch = "a".repeat(64);
        let operation = "b".repeat(32);
        let request = recorded_document_export_request("0123456789abcdef", &batch, &operation).unwrap();
        assert_eq!(request, json!({ "schema": IPC_SCHEMA, "request_id": "0123456789abcdef",
            "action": "resolve_document_export", "batch_id": batch, "operation_id": operation }));
        for (batch, operation) in [("a".repeat(63), "b".repeat(32)), ("a".repeat(65), "b".repeat(32)),
            ("a".repeat(64), "b".repeat(31)), ("a".repeat(64), "b".repeat(33)),
            ("A".repeat(64), "b".repeat(32)), ("a".repeat(64), "B".repeat(32)),
            ("g".repeat(64), "b".repeat(32)), ("a".repeat(64), "../export".to_string())] {
            assert_eq!(recorded_document_export_request("0123456789abcdef", &batch, &operation).unwrap_err(), "AI_EXPORT_INVALID");
        }
    }

    #[test]
    fn terminal_acknowledgement_is_bound_to_one_safe_generation() {
        let request = private_request(
            "0123456789abcdef",
            "ack_terminal_presented",
            None,
            &[],
            Some(42),
            None,
        )
        .expect("valid generation");
        assert_eq!(request["presentation_generation"], json!(42));
        assert_eq!(request.as_object().expect("request object").len(), 4);
        assert!(private_request(
            "0123456789abcdef",
            "ack_terminal_presented",
            None,
            &[],
            None,
            None,
        )
        .is_err());
        assert!(private_request(
            "0123456789abcdef",
            "ack_terminal_presented",
            None,
            &[],
            Some(0),
            None,
        )
        .is_err());
        assert!(private_request(
            "0123456789abcdef",
            "get_public_state",
            None,
            &[],
            Some(42),
            None
        )
        .is_err());
    }

    #[test]
    fn accepts_only_exact_private_response_envelopes() {
        let id = "0123456789abcdef";
        let success = json!({
            "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true,
            "result": { "ok": true }
        });
        match validate_private_response(&success, id).expect("valid success") {
            ValidatedPrivateResponse::Success(result) => assert_eq!(result["ok"], json!(true)),
            ValidatedPrivateResponse::Error(_, _) => panic!("unexpected domain error"),
        }
        let domain_error = json!({
            "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
            "error_code": "STANDALONE_BUSY"
        });
        match validate_private_response(&domain_error, id).expect("valid error") {
            ValidatedPrivateResponse::Error(code, None) => assert_eq!(code, "STANDALONE_BUSY"),
            ValidatedPrivateResponse::Error(_, Some(_)) => panic!("unexpected private details"),
            ValidatedPrivateResponse::Success(_) => panic!("unexpected success"),
        }
        let named_error = json!({
            "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
            "error_code": "SOURCE_FOLDER_UNSUPPORTED_FILES",
            "error_details": { "unsupported_files": ["nested/manifest.json"], "unsupported_count": 1 }
        });
        let validated = validate_private_response(&named_error, id).expect("valid local details");
        if let ValidatedPrivateResponse::Error(code, Some(details)) = validated {
            let encoded = json!({ "code": code, "details": details }).to_string();
            let (decoded_code, decoded_details) = local_error_parts(&encoded);
            assert_eq!(decoded_code, "SOURCE_FOLDER_UNSUPPORTED_FILES");
            assert_eq!(decoded_details.expect("local details")["unsupported_files"][0], "nested/manifest.json");
        } else { panic!("expected named local error"); }
        for malformed in [
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true, "result": 1 }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true,
                "result": {}, "extra": true }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
                "error_code": "" }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
                "error_code": "STANDALONE_BUSY", "error_details": { "unsupported_files": ["name"], "unsupported_count": 1 } }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
                "error_code": "SOURCE_FOLDER_UNSUPPORTED_FILES", "error_details": { "unsupported_files": ["../secret"], "unsupported_count": 1 } }),
        ] {
            assert!(validate_private_response(&malformed, id).is_err());
        }
    }

    #[test]
    fn named_selection_errors_cross_only_the_bounded_local_contract() {
        let id = "0123456789abcdef";
        let details = json!({"selection_files": [
            {"name": "Unterordner/leere.csv", "reason_code": "SOURCE_FILE_EMPTY"},
            {"name": "gesperrt.pdf", "reason_code": "SOURCE_ACCESS_DENIED"}
        ], "selection_count": 2});
        let response = json!({"schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
            "error_code": "SOURCE_SELECTION_REJECTED", "error_details": details});
        assert!(validate_private_response(&response, id).is_ok());
        let encoded = json!({"code": "SOURCE_SELECTION_REJECTED", "details": details}).to_string();
        assert_eq!(local_error_parts(&encoded).0, "SOURCE_SELECTION_REJECTED");
        for label in ["C:/private.pdf", "../private.pdf", "/private.pdf", "a\\private.pdf", "a\nprivate.pdf"] {
            let mut invalid = response.clone();
            invalid["error_details"]["selection_files"][0]["name"] = json!(label);
            assert!(validate_private_response(&invalid, id).is_err(), "{label}");
        }
        let mut invalid = response;
        invalid["error_details"]["selection_files"][0]["reason_code"] = json!("raw error with content");
        assert!(validate_private_response(&invalid, id).is_err());
    }

    #[test]
    fn office_owner_error_retains_its_name_for_single_and_mixed_admission() {
        let id = "0123456789abcdef";
        let details = json!({"selection_files": [
            {"name": "~$port.docx", "reason_code": "SOURCE_ARTIFACT_IGNORED"}
        ], "selection_count": 1});
        for code in ["SOURCE_ARTIFACT_IGNORED", "SOURCE_SELECTION_REJECTED"] {
            let response = json!({"schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
                "error_code": code, "error_details": details});
            assert!(validate_private_response(&response, id).is_ok(), "{code}");
            let encoded = json!({"code": code, "details": details}).to_string();
            let (decoded_code, decoded_details) = local_error_parts(&encoded);
            assert_eq!(decoded_code, code);
            assert_eq!(decoded_details.expect("local details")["selection_files"][0]["name"], "~$port.docx");
        }
    }

    #[test]
    fn runtime_spawn_errors_are_safe_categories_not_raw_os_messages() {
        assert_eq!(runtime_spawn_code(&std::io::Error::new(std::io::ErrorKind::PermissionDenied, "private path")), "STANDALONE_RUNTIME_DENIED");
        assert_eq!(runtime_spawn_code_for_os(&std::io::Error::new(std::io::ErrorKind::PermissionDenied, "private path"), "macos"),
            "STANDALONE_RUNTIME_DENIED");
        assert_eq!(runtime_spawn_code(&std::io::Error::new(std::io::ErrorKind::NotFound, "private path")), "STANDALONE_RUNTIME_MISSING");
        assert_eq!(runtime_spawn_code(&std::io::Error::other("private path")), "STANDALONE_RUNTIME_START_FAILED");
        #[cfg(windows)]
        assert_eq!(runtime_spawn_code(&std::io::Error::from_raw_os_error(193)), "STANDALONE_RUNTIME_ARCHITECTURE_INVALID");
        assert_eq!(runtime_spawn_code_for_os(&std::io::Error::from_raw_os_error(86), "macos"), "STANDALONE_RUNTIME_ARCHITECTURE_INVALID");
        assert_eq!(runtime_spawn_code_for_os(&std::io::Error::from_raw_os_error(85), "macos"), "STANDALONE_RUNTIME_BINARY_INVALID");
        assert_eq!(runtime_spawn_code_for_os(&std::io::Error::from_raw_os_error(88), "macos"), "STANDALONE_RUNTIME_BINARY_INVALID");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn child_launch_removes_only_windows_verbatim_path_spelling() {
        assert_eq!(
            child_process_path(Path::new(r"\\?\C:\DataSecure\server\standalone")),
            PathBuf::from(r"C:\DataSecure\server\standalone")
        );
        assert_eq!(
            child_process_path(Path::new(r"\\?\UNC\server\share\DataSecure")),
            PathBuf::from(r"\\server\share\DataSecure")
        );
        assert_eq!(
            child_process_path(Path::new(r"C:\DataSecure")),
            PathBuf::from(r"C:\DataSecure")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_file_manager_commands_keep_exact_targets_visible() {
        let directory = Path::new(r"C:\Results\DataSecure-Output\Lauf-1");
        let command = native_open_command(directory, "directory").expect("directory command");
        assert_eq!(command.get_program(), "explorer.exe");
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![directory.as_os_str()]
        );

        let mapping = directory.join("DataSecure-Zuordnung.csv");
        let command = native_open_command(&mapping, "file").expect("mapping command");
        assert_eq!(command.get_program(), "explorer.exe");
        let arguments = command.get_args().collect::<Vec<_>>();
        assert_eq!(arguments.len(), 1);
        assert_eq!(
            arguments[0].to_string_lossy(),
            format!("/select,{}", mapping.display())
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn local_open_target_rejects_the_windows_reparse_attribute() {
        assert!(windows_attributes_contain_reparse_point(0x400));
        assert!(windows_attributes_contain_reparse_point(0x410));
        assert!(!windows_attributes_contain_reparse_point(0x10));
    }

    #[test]
    fn history_identity_open_accepts_only_closed_publication_status() {
        let path = std::env::current_exe().unwrap();
        let base = json!({"ok": true, "target_kind": "file", "local_path": path, "external_disclosure": false});
        let mut published = base.clone(); published["publication_available"] = json!(true);
        let (target, warning) = history_local_target(published.clone(), "file", true).unwrap();
        assert_eq!(target, path); assert_eq!(warning, None);
        let mut fallback = base.clone(); fallback["publication_available"] = json!(false);
        fallback["identity_mapping_warning"] = json!("STANDALONE_IDENTITY_PUBLICATION_FAILED");
        assert_eq!(history_local_target(fallback.clone(), "file", true).unwrap().1.as_deref(), Some("STANDALONE_IDENTITY_PUBLICATION_FAILED"));
        let mut private = base.clone(); private["publication_available"] = json!(false);
        private["identity_mapping_scope"] = json!("private");
        let (private_target, private_warning) = history_local_target(private.clone(), "file", true).unwrap();
        assert_eq!(private_target, path); assert_eq!(private_warning, None);
        for (key, value) in [("publication_available", json!(true)), ("identity_mapping_scope", json!("public")),
            ("identity_mapping_warning", json!("STANDALONE_IDENTITY_PUBLICATION_FAILED")), ("unexpected", json!(true))] {
            let mut invalid = private.clone(); invalid[key] = value;
            assert_eq!(history_local_target(invalid, "file", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        }
        assert_eq!(history_local_target(private, "directory", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        for mut invalid in [published.clone(), fallback.clone()] {
            invalid["unexpected"] = json!("private detail");
            assert_eq!(history_local_target(invalid, "file", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        }
        fallback["identity_mapping_warning"] = json!("private detail");
        assert_eq!(history_local_target(fallback, "file", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        published["identity_mapping_warning"] = json!("STANDALONE_IDENTITY_PUBLICATION_FAILED");
        assert_eq!(history_local_target(published, "file", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        assert_eq!(history_local_target(base.clone(), "file", true).unwrap_err(), "STANDALONE_IPC_FAILED");
        assert_eq!(history_local_target(base, "file", false).unwrap().1, None);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_non_utf8_source_paths() {
        use std::ffi::OsString;
        use std::os::unix::ffi::OsStringExt;
        let path = PathBuf::from(OsString::from_vec(vec![b'a', 0xff, b'b']));
        assert_eq!(
            strict_path_strings(&[path]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID"
        );
    }
}
    #[test]
    fn admission_has_its_own_bounded_deadline_and_honest_transport_failure() {
        assert_eq!(rpc_duration("admit_selected_sources"), Duration::from_secs(300));
        assert_eq!(rpc_duration("preview_document_export"), Duration::from_secs(300));
        assert_eq!(rpc_duration("decide_document_review_batch"), Duration::from_secs(300));
        assert_eq!(rpc_duration("abandon_document_export"), Duration::from_secs(300));
        assert_eq!(rpc_duration("get_document_review_history_summary"), Duration::from_secs(300));
        assert_eq!(rpc_duration("get_document_reviews"), Duration::from_secs(300));
        assert_eq!(rpc_duration("get_run_history"), Duration::from_secs(300));
        for action in ["get_run_failures", "resolve_history_results", "resolve_history_ledger", "resolve_history_identity_mapping"] {
            assert_eq!(rpc_duration(action), Duration::from_secs(300), "{action}");
            assert_eq!(rpc_lock_duration(action), Duration::from_secs(300), "{action}");
        }
        assert_eq!(rpc_duration("export_approved_documents"), Duration::from_secs(300), "progress never extends the mutation deadline");
        assert_eq!(rpc_duration("publish_result_documents"), Duration::from_secs(300), "new result generations retain the same bounded publication deadline");
        assert_eq!(rpc_duration("get_review_session"), Duration::from_secs(300));
        assert_eq!(rpc_duration("get_public_state"), Duration::from_secs(120));
        assert_eq!(rpc_duration("get_ui_context"), Duration::from_secs(120));
        assert_eq!(rpc_duration("submit_review"), Duration::from_secs(30));
        assert_eq!(rpc_lock_duration("get_ui_context"), Duration::from_secs(5));
        assert_eq!(rpc_lock_duration("get_public_state"), Duration::from_secs(5));
        assert_eq!(rpc_lock_duration("get_run_history"), Duration::from_secs(300));
        assert_eq!(rpc_lock_duration("submit_review"), Duration::from_secs(30));
        assert_eq!(rpc_lock_transport_code("get_public_state", ipc_transport::TIMEOUT.into()), "STANDALONE_IPC_BUSY");
        assert_eq!(rpc_lock_transport_code("get_ui_context", ipc_transport::TIMEOUT.into()), "STANDALONE_IPC_BUSY");
        assert_eq!(rpc_lock_transport_code("submit_review", ipc_transport::TIMEOUT.into()), "STANDALONE_IPC_BUSY");
        assert_eq!(rpc_lock_transport_code("admit_selected_sources", ipc_transport::TIMEOUT.into()), "STANDALONE_IPC_BUSY");
        assert_eq!(rpc_bootstrap_duration(), Duration::from_secs(120));
        assert_eq!(admission_transport_code("admit_selected_sources", ipc_transport::TIMEOUT.to_string()),
            "STANDALONE_ADMISSION_TIMEOUT");
        assert_eq!(admission_transport_code("get_public_state", ipc_transport::TIMEOUT.to_string()), ipc_transport::TIMEOUT);
        assert_eq!(admission_transport_code("admit_selected_sources", ipc_transport::CLOSED.to_string()), ipc_transport::CLOSED);
    }
