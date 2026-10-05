#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_smoke;
mod ipc_transport;
mod review_window;
mod native_open;
mod startup_diagnostics;

use serde_json::{json, Value};
use std::{
    fs::OpenOptions,
    io::{BufReader, Read, Write},
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
static DIAGNOSTIC_LOCK: Mutex<()> = Mutex::new(());
static DIAGNOSTIC_SESSION: OnceLock<String> = OnceLock::new();
static NATIVE_SMOKE_PROFILE: OnceLock<Option<native_smoke::Profile>> = OnceLock::new();

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
    diagnostic_correlated_event(event, action, outcome, error_code, elapsed_ms, None);
}

fn diagnostic_request_id(id: &str) -> Option<&str> {
    ((16..=64).contains(&id.len()) && id.bytes().all(|value| value.is_ascii_hexdigit() && !value.is_ascii_uppercase()))
        .then_some(id)
}

fn diagnostic_ipc_event(event: &str, action: &str, id: &str, outcome: &str,
    error_code: Option<&str>, elapsed_ms: Option<u128>) {
    diagnostic_correlated_event(event, Some(action), outcome, error_code, elapsed_ms,
        diagnostic_request_id(id));
}

fn diagnostic_correlated_event(
    event: &str,
    action: Option<&str>,
    outcome: &str,
    error_code: Option<&str>,
    elapsed_ms: Option<u128>,
    request_id: Option<&str>,
) {
    let Ok(_guard) = DIAGNOSTIC_LOCK.lock() else {
        return;
    };
    let directory = diagnostic_directory();
    if std::fs::create_dir_all(&directory).is_err() {
        return;
    }
    let current = directory.join("desktop-interactions.jsonl");
    if std::fs::metadata(&current)
        .map(|value| value.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let previous = directory.join("desktop-interactions.previous.jsonl");
        let _ = std::fs::remove_file(&previous);
        let _ = std::fs::rename(&current, &previous);
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(current) else {
        return;
    };
    let mut record = json!({
        "schema": "datasecure-standalone-interaction/1",
        "time_ms": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        "component": "desktop",
        "session_id": diagnostic_session(),
        "event": event,
        "outcome": outcome,
        "product_version": env!("CARGO_PKG_VERSION")
    });
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
    let _ = writeln!(file, "{record}");
}

struct SidecarProcess {
    child: ipc_transport::ChildControl,
    writes: mpsc::Sender<ipc_transport::WriteRequest>,
    responses: Receiver<Result<Value, String>>,
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        self.child.terminate();
    }
}

#[derive(Clone)]
struct DesktopState {
    app: AppHandle,
    sidecar: Arc<Mutex<Option<SidecarProcess>>>,
    lifecycle: ipc_transport::Lifecycle,
    exit_gate: ipc_transport::ExitGate,
    selection_busy: Arc<AtomicBool>,
    admission_present: Arc<AtomicBool>,
    frontend_ready: Arc<AtomicBool>,
    review_window_binding: Arc<Mutex<review_window::Binding>>,
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

fn state_allows_new_admission(state: Option<&str>) -> bool {
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

fn admit_native_sources(
    state: &DesktopState,
    paths: &[PathBuf],
    kind: &str,
) -> Result<Value, String> {
    let current = rpc(state, "get_public_state", None, &[], None, None)?;
    if !state_allows_new_admission(current.get("state").and_then(Value::as_str)) {
        return Err("STANDALONE_BUSY".to_string());
    }
    let result = rpc(
        state,
        "admit_selected_sources",
        Some(kind),
        paths,
        None,
        None,
    )?;
    state.admission_present.store(true, Ordering::Release);
    Ok(result)
}

// Our application event carries the existing local display context after the
// same admission validator used by the picker. Tauri also emits its built-in
// drag-drop event with selected paths; this UI only subscribes to our event.
fn native_drop(state: &DesktopState, paths: Vec<PathBuf>) {
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
    let owned = state.clone();
    let _ = owned.app.emit_to(
        "main",
        "datasecure-native-drop",
        json!({"phase": "checking"}),
    );
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
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
                    json!({"phase": "accepted", "result": result}),
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
                    json!({"phase": "failed", "error_code": code, "error_details": details}),
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

fn existing(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| {
        std::fs::symlink_metadata(candidate)
            .map(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
            .unwrap_or(false)
    })
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

fn runtime_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let target = if cfg!(target_os = "windows") {
        "datasecure-core-x86_64-pc-windows-msvc.exe"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "datasecure-core-aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "datasecure-core-x86_64-apple-darwin"
    } else {
        "datasecure-core-x86_64-unknown-linux-gnu"
    };
    let executable_directory = std::env::current_exe()
        .ok()
        .and_then(|value| value.parent().map(Path::to_path_buf));
    let bundled_name = if cfg!(target_os = "windows") {
        "datasecure-core.exe"
    } else {
        "datasecure-core"
    };
    let mut executable_candidates = vec![
        resource.join(target),
        resource.join("binaries").join(target),
    ];
    if let Some(directory) = executable_directory {
        // Tauri removes the target-triple suffix from externalBin entries and
        // puts the executable next to the application binary. Keep the exact
        // target-named candidates for the existing portable Windows package.
        executable_candidates.push(directory.join(bundled_name));
        executable_candidates.push(directory.join(target));
    }
    if cfg!(debug_assertions) {
        executable_candidates.push(manifest.join("binaries").join(target));
    }
    let executable =
        existing(executable_candidates).ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
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
    let script =
        existing(script_candidates).ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    Ok((executable, script))
}

fn configure_support_trace(command: &mut Command, setting: Option<&std::ffi::OsStr>) {
    command.env_remove("EU_PRIVACY_SUPPORT_MODE");
    if setting == Some(std::ffi::OsStr::new("1")) {
        command.env("EU_PRIVACY_SUPPORT_MODE", "1");
    }
}

fn runtime_spawn_code(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "STANDALONE_RUNTIME_MISSING",
        std::io::ErrorKind::PermissionDenied => "STANDALONE_RUNTIME_DENIED",
        _ if matches!(error.raw_os_error(), Some(193 | 216)) && cfg!(windows) => "STANDALONE_RUNTIME_ARCHITECTURE_INVALID",
        _ if matches!(error.raw_os_error(), Some(8)) && cfg!(unix) => "STANDALONE_RUNTIME_ARCHITECTURE_INVALID",
        _ => "STANDALONE_RUNTIME_START_FAILED",
    }
}

fn spawn_sidecar(app: &tauri::AppHandle, lifecycle: &ipc_transport::Lifecycle, deadline: Instant) -> Result<SidecarProcess, String> {
    let spawn_guard = lifecycle.begin_spawn()?;
    diagnostic_event("sidecar_starting", None, "progress", None, None);
    let (executable, script) = runtime_paths(app).inspect_err(|code| {
        diagnostic_event(
            "runtime_resolution_failed",
            None,
            "failed",
            Some(code),
            None,
        );
    })?;
    diagnostic_event("runtime_resolved", None, "ready", None, None);
    let script_directory = script
        .parent()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let script_name = script
        .file_name()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let _network_deny = script_directory
        .parent()
        .map(|server| server.join("network-deny.cjs"))
        .filter(|candidate| existing([candidate.clone()]).is_some())
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let mut command = Command::new(child_process_path(&executable));
    command.env_clear();
    for key in [
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
        for (key, value) in [
            ("USERPROFILE", &profile.user_profile),
            ("HOME", &profile.user_profile),
            ("LOCALAPPDATA", &profile.local_app_data),
            ("APPDATA", &profile.roaming_app_data),
            ("XDG_DATA_HOME", &profile.xdg_data),
            ("TEMP", &profile.temp),
            ("TMP", &profile.temp),
            ("TMPDIR", &profile.temp),
        ] {
            command.env(key, value);
        }
    } else {
        for key in [
            "TEMP",
            "TMP",
            "TMPDIR",
            "USERPROFILE",
            "HOME",
            "LOCALAPPDATA",
            "APPDATA",
            "XDG_DATA_HOME",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
    }
    // Windows Known Folders ignore an isolated child's USERPROFILE. The
    // validated smoke profile must override this before product bootstrap.
    if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
        command.env("DATASECURE_STANDALONE_DOCUMENTS_DIR", &profile.documents);
    } else if let Ok(documents) = app.path().document_dir() {
        command.env("DATASECURE_STANDALONE_DOCUMENTS_DIR", documents);
    }
    command.env("DATASECURE_PRODUCT_CHANNEL", "standalone");
    // Optional, explicitly enabled content-free support trace. No arbitrary
    // host environment or vendor stderr is forwarded to the product worker.
    configure_support_trace(
        &mut command,
        std::env::var_os("EU_PRIVACY_SUPPORT_MODE").as_deref(),
    );
    command.env(
        "DATASECURE_STANDALONE_DIAGNOSTIC_SESSION",
        diagnostic_session(),
    );
    command.env(
        "DATASECURE_STANDALONE_DIAGNOSTIC_DIR",
        diagnostic_directory(),
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
    if cfg!(debug_assertions) {
        command.stderr(Stdio::inherit());
    } else {
        command.stderr(Stdio::null());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
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
    diagnostic_event("sidecar_spawned", None, "ready", None, None);
    let input = child.stdin.take();
    let output = child.stdout.take();
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
    Ok(SidecarProcess {
        child,
        writes: ipc_transport::writer(input),
        responses,
    })
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
        "PROCESSING_MODE_INVALID" | "PROCESSING_MODE_FORBIDDEN" | "MARKDOWN_CONVERSION_NOT_READY"))
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
        "SOURCE_ARTIFACT_IGNORED")
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
            | "continue_history_batch" | "get_run_failures"
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
    Duration::from_secs(if action == "admit_selected_sources" { 300 } else { 30 })
}

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
    let deadline = started + rpc_duration(action);
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
    let mut process_guard = ipc_transport::lock_until(&state.sidecar, deadline, &state.lifecycle.stopping)
        .map_err(|code| admission_transport_code(action, code)).inspect_err(early_failure)?;
    if process_guard.is_none() {
        // Spawning may itself be delayed by the OS. A late result is dropped
        // (and its owned child terminated), never adopted after shutdown.
        let app = state.app.clone();
        let lifecycle = state.lifecycle.clone();
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || { let _ = sender.send(spawn_sidecar(&app, &lifecycle, deadline)); });
        *process_guard = Some(ipc_transport::receive_until(&receiver, deadline, &state.lifecycle.stopping)
            .and_then(|result| result).map_err(|code| admission_transport_code(action, code))
            .inspect_err(early_failure)?);
    }
    let result = (|| {
        let process = process_guard
            .as_mut()
            .ok_or_else(|| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
        let (sent, completed) = mpsc::channel();
        process.writes.send((payload, sent)).map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
        ipc_transport::receive_until(&completed, deadline, &state.lifecycle.stopping)??;
        diagnostic_ipc_event("ipc_request_sent", action, id, "progress", None, None);
        ipc_transport::receive_until_with_progress(&process.responses, deadline, &state.lifecycle.stopping,
            || admission_progress(state, action, "validating", started.elapsed().as_millis()))?
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
            process_guard.take();
            state.admission_present.store(false, Ordering::Release);
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
        process_guard.take();
        state.admission_present.store(false, Ordering::Release);
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
        if kind != "file" || (published && (object.len() != 5 || object.contains_key("identity_mapping_warning")))
            || (!published && (object.len() != 6 || warning != Some("STANDALONE_IDENTITY_PUBLICATION_FAILED"))) {
            return Err("STANDALONE_IPC_FAILED".to_string());
        }
        let warning = warning.map(str::to_string);
        object.remove("publication_available"); object.remove("identity_mapping_warning");
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
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    diagnostic_event(
        "picker_opened",
        Some("select_files"),
        "progress",
        None,
        None,
    );
    let selected =
        tauri::async_runtime::spawn_blocking(|| filters(rfd::FileDialog::new()).pick_files())
            .await
            .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(paths) = selected else {
        diagnostic_event(
            "picker_cancelled",
            Some("select_files"),
            "cancelled",
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
    let owned = state.inner().clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || admit_native_sources(&owned, &paths, "files"))
            .await
            .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())??;
    state.admission_present.store(true, Ordering::Release);
    Ok(result)
}

#[tauri::command]
async fn select_folder(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    diagnostic_event(
        "picker_opened",
        Some("select_folder"),
        "progress",
        None,
        None,
    );
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(path) = selected else {
        diagnostic_event(
            "picker_cancelled",
            Some("select_folder"),
            "cancelled",
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
    let owned = state.inner().clone();
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
    let result = blocking_rpc(state.inner().clone(), "cancel_admission").await;
    state.admission_present.store(false, Ordering::Release);
    result
}
#[tauri::command(rename_all = "camelCase")]
async fn remove_admitted_source(
    state: State<'_, DesktopState>,
    selection_index: u64,
) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let owned = state.inner().clone();
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
    processing_mode: Option<String>,
    output_naming_mode: Option<String>,
) -> Result<Value, String> {
    let mode = validate_processing_mode(processing_mode.as_deref())?;
    validate_output_naming_mode(output_naming_mode.as_deref(), mode)?;
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let owned = state.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let id = request_id();
        let request = private_start_request(
            &id,
            processing_mode.as_deref(),
            output_naming_mode.as_deref(),
        )?;
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
#[tauri::command]
async fn get_public_state(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "get_public_state").await
}
#[tauri::command]
async fn get_ui_context(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "get_ui_context").await
}
#[tauri::command]
async fn get_run_history(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "get_run_history").await
}

#[tauri::command]
async fn open_review_window(app: AppHandle) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("review") {
        window.show().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
        window.set_focus().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
    } else {
        let owned = app.state::<DesktopState>().inner().clone();
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

fn review_window_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "review" { Ok(()) }
    else { Err("STANDALONE_REVIEW_WINDOW_INVALID".to_string()) }
}

#[tauri::command]
fn close_review_window(window: tauri::WebviewWindow) -> Result<Value, String> {
    review_window_only(&window)?;
    window.close().map_err(|_| "STANDALONE_REVIEW_WINDOW_FAILED".to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
async fn get_review_session(window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<Value, String> {
    review_window_only(&window)?;
    blocking_rpc(state.inner().clone(), "get_review_session").await
}

#[tauri::command]
async fn get_review_chunk(
    window: tauri::WebviewWindow,
    state: State<'_, DesktopState>,
    review_id: String,
    chunk_index: u64,
) -> Result<Value, String> {
    review_window_only(&window)?;
    if review_id.len() != 32 || !review_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        || chunk_index > 319 {
        return Err("STANDALONE_REVIEW_SESSION_INVALID".to_string());
    }
    let owned = state.inner().clone();
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
    review_window_only(&window)?;
    if review_id.len() != 32 || !review_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("STANDALONE_REVIEW_SESSION_INVALID".to_string());
    }
    let owned = state.inner().clone();
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
    review_window_only(&window)?;
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
    blocking_rpc(state.inner().clone(), "continue_review_session").await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_run_failures(
    state: State<'_, DesktopState>,
    batch_id: Option<String>,
) -> Result<Value, String> {
    let owned = state.inner().clone();
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
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        history_rpc(&owned, "continue_history_batch", &batch_id)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
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
        state.inner().clone(),
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
        state.inner().clone(),
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
        state.inner().clone(), batch_id, "open_history_identity_mapping",
        "resolve_history_identity_mapping", "file",
    ).await
}

#[tauri::command]
async fn ack_terminal_presented(
    state: State<'_, DesktopState>,
    presentation_generation: u64,
) -> Result<Value, String> {
    let owned = state.inner().clone();
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
    blocking_rpc(state.inner().clone(), "continue_current_batch").await
}
#[tauri::command]
async fn configure_results(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    diagnostic_event(
        "picker_opened",
        Some("configure_results"),
        "progress",
        None,
        None,
    );
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(path) = selected else {
        diagnostic_event(
            "picker_cancelled",
            Some("configure_results"),
            "cancelled",
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
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        rpc(&owned, "configure_results", None, &[path], None, None)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}
#[tauri::command]
async fn open_current_results(state: State<'_, DesktopState>) -> Result<Value, String> {
    let owned = state.inner().clone();
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
    let owned = state.inner().clone();
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
    let owned = state.inner().clone();
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
    std::fs::create_dir_all(&directory)
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
    let command = native_open_command(&directory, "directory")?;
    native_open::handoff(command, |status| {
        if !matches!(status, Ok(status) if status.success()) {
            diagnostic_event("os_open_helper_failed", Some("open_diagnostic_folder"), "failed", Some("STANDALONE_OS_OPEN_HELPER_FAILED"), None);
        }
    })
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
    diagnostic_event("diagnostic_folder_opened", None, "ready", None, None);
    Ok(json!({ "ok": true, "opened": true, "external_disclosure": false }))
}
#[tauri::command]
async fn shutdown(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "shutdown").await
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
    json!({ "ok": true, "product_version": env!("CARGO_PKG_VERSION"),
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
        .on_page_load(|webview, _payload| {
            let event = if webview.label() == "review" { "review_page_loaded" } else { "page_loaded" };
            diagnostic_event(event, None, "ready", None, None);
        })
        .setup(|app| {
            diagnostic_event("setup_started", None, "progress", None, None);
            let state = DesktopState {
                app: app.handle().clone(),
                sidecar: Arc::new(Mutex::new(None)),
                lifecycle: ipc_transport::Lifecycle::default(),
                exit_gate: ipc_transport::ExitGate::default(),
                selection_busy: Arc::new(AtomicBool::new(false)),
                admission_present: Arc::new(AtomicBool::new(false)),
                frontend_ready: Arc::new(AtomicBool::new(false)),
                review_window_binding: Arc::new(Mutex::new(review_window::Binding::default())),
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
                        begin_native_exit(state.inner().clone());
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
            open_review_window,
            close_review_window,
            get_review_session,
            get_review_chunk,
            submit_review,
            continue_review_session,
            get_run_failures,
            continue_history_batch,
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
                    begin_native_exit(state.inner().clone());
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
            assert!(state_allows_new_admission(Some(state)), "{state}");
        }
        for state in ["preparing", "processing", "blocked", "unknown"] {
            assert!(!state_allows_new_admission(Some(state)), "{state}");
        }
        assert!(!state_allows_new_admission(None));
    }

    #[test]
    fn history_requests_bind_only_exact_batch_ids_without_paths_or_modes() {
        let id = "a".repeat(16);
        let batch = "b".repeat(64);
        for action in [
            "resolve_history_results",
            "resolve_history_ledger",
            "continue_history_batch",
        ] {
            let value = history_request(&id, action, &batch).expect("valid history action");
            assert_eq!(value.as_object().unwrap().len(), 4);
            assert_eq!(value["batch_id"], batch);
            assert_eq!(value["action"], action);
            assert!(value.get("source_paths").is_none());
            assert!(value.get("processing_mode").is_none());
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
        assert_eq!(runtime_spawn_code(&std::io::Error::new(std::io::ErrorKind::NotFound, "private path")), "STANDALONE_RUNTIME_MISSING");
        assert_eq!(runtime_spawn_code(&std::io::Error::other("private path")), "STANDALONE_RUNTIME_START_FAILED");
        #[cfg(windows)]
        assert_eq!(runtime_spawn_code(&std::io::Error::from_raw_os_error(193)), "STANDALONE_RUNTIME_ARCHITECTURE_INVALID");
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
        assert_eq!(rpc_duration("get_public_state"), Duration::from_secs(30));
        assert_eq!(rpc_duration("submit_review"), Duration::from_secs(30));
        assert_eq!(admission_transport_code("admit_selected_sources", ipc_transport::TIMEOUT.to_string()),
            "STANDALONE_ADMISSION_TIMEOUT");
        assert_eq!(admission_transport_code("get_public_state", ipc_transport::TIMEOUT.to_string()), ipc_transport::TIMEOUT);
        assert_eq!(admission_transport_code("admit_selected_sources", ipc_transport::CLOSED.to_string()), ipc_transport::CLOSED);
    }
