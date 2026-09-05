#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_smoke;

use serde_json::{json, Value};
use std::{
    fs::OpenOptions,
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent};

const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES: usize = 768 * 1024;
const MAX_SINGLE_PATH_BYTES: usize = 32767;
const MAX_PRESENTATION_GENERATION: u64 = 9_007_199_254_740_991;
const IPC_SCHEMA: &str = "datasecure-standalone-private-ipc/1";
const RESPONSE_SCHEMA: &str = "datasecure-standalone-private-response/1";
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static DIAGNOSTIC_LOCK: Mutex<()> = Mutex::new(());
static DIAGNOSTIC_SESSION: OnceLock<String> = OnceLock::new();
static NATIVE_SMOKE_PROFILE: OnceLock<Option<native_smoke::Profile>> = OnceLock::new();

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
    std::env::temp_dir().join("SecureDataMsg-Standalone")
}

fn diagnostic_event(
    event: &str,
    action: Option<&str>,
    outcome: &str,
    error_code: Option<&str>,
    elapsed_ms: Option<u128>,
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
    let _ = writeln!(file, "{record}");
}

struct SidecarProcess {
    child: Child,
    input: ChildStdin,
    responses: Receiver<Result<Value, String>>,
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone)]
struct DesktopState {
    app: AppHandle,
    sidecar: Arc<Mutex<Option<SidecarProcess>>>,
    selection_busy: Arc<AtomicBool>,
    admission_present: Arc<AtomicBool>,
    frontend_ready: Arc<AtomicBool>,
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
    if paths.is_empty() || paths.len() > 100 {
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
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("STANDALONE_SELECTION_INVALID".to_string());
            }
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

fn admit_native_sources(
    state: &DesktopState,
    paths: &[PathBuf],
    kind: &str,
) -> Result<Value, String> {
    let current = rpc(state, "get_public_state", None, &[], None)?;
    if !matches!(
        current.get("state").and_then(Value::as_str),
        Some("ready" | "results_available" | "completed_without_results")
    ) {
        return Err("STANDALONE_BUSY".to_string());
    }
    let result = rpc(state, "admit_selected_sources", Some(kind), paths, None)?;
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
    let guard = match selection_guard(&state.selection_busy, &state.admission_present, false) {
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
            Err(code) => {
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
                    json!({"phase": "failed", "error_code": code}),
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
    let mut executable_candidates = vec![
        resource.join(target),
        resource.join("binaries").join(target),
    ];
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

fn spawn_sidecar(app: &tauri::AppHandle) -> Result<SidecarProcess, String> {
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
        "TEMP",
        "TMP",
        "TMPDIR",
        "USERPROFILE",
        "HOME",
        "LOCALAPPDATA",
        "APPDATA",
        "XDG_DATA_HOME",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
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
    let mut child = command.spawn().map_err(|_| {
        diagnostic_event(
            "sidecar_spawn_failed",
            None,
            "failed",
            Some("STANDALONE_RUNTIME_START_FAILED"),
            None,
        );
        "STANDALONE_RUNTIME_START_FAILED".to_string()
    })?;
    diagnostic_event("sidecar_spawned", None, "ready", None, None);
    let input = child
        .stdin
        .take()
        .ok_or_else(|| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
    let output = child
        .stdout
        .take()
        .ok_or_else(|| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
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
        input,
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
) -> Result<Value, String> {
    let mut request = json!({ "schema": IPC_SCHEMA, "request_id": request_id, "action": action });
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

enum ValidatedPrivateResponse {
    Success(Value),
    Error(String),
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
        Some(false) if object.len() == 4 => object
            .get("error_code")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(|value| ValidatedPrivateResponse::Error(value.to_string()))
            .ok_or(()),
        _ => Err(()),
    }
}

fn rpc(
    state: &DesktopState,
    action: &str,
    source_kind: Option<&str>,
    paths: &[PathBuf],
    presentation_generation: Option<u64>,
) -> Result<Value, String> {
    let started = Instant::now();
    diagnostic_event("ipc_request_started", Some(action), "progress", None, None);
    let id = request_id();
    let request = private_request(&id, action, source_kind, paths, presentation_generation)?;
    let payload = serde_json::to_vec(&request).map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
    if payload.len() > MAX_FRAME_BYTES {
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let mut process_guard = state
        .sidecar
        .lock()
        .map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
    if process_guard.is_none() {
        *process_guard = Some(spawn_sidecar(&state.app)?);
    }
    let result = (|| {
        let process = process_guard
            .as_mut()
            .ok_or_else(|| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
        process
            .input
            .write_all(&(payload.len() as u32).to_be_bytes())
            .map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
        process
            .input
            .write_all(&payload)
            .and_then(|_| process.input.flush())
            .map_err(|_| "STANDALONE_IPC_FAILED".to_string())?;
        diagnostic_event("ipc_request_sent", Some(action), "progress", None, None);
        process
            .responses
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "STANDALONE_IPC_TIMEOUT".to_string())?
    })();
    let response = match result {
        Ok(response) => response,
        Err(code) => {
            let child_exited = process_guard
                .as_mut()
                .and_then(|process| process.child.try_wait().ok().flatten())
                .is_some();
            diagnostic_event(
                if child_exited {
                    "sidecar_exited_before_response"
                } else {
                    "ipc_request_failed"
                },
                Some(action),
                "failed",
                Some(&code),
                Some(started.elapsed().as_millis()),
            );
            process_guard.take();
            state.admission_present.store(false, Ordering::Release);
            return Err(code);
        }
    };
    let validated = validate_private_response(&response, &id);
    if validated.is_err() {
        diagnostic_event(
            "ipc_response_invalid",
            Some(action),
            "failed",
            Some("STANDALONE_IPC_FAILED"),
            Some(started.elapsed().as_millis()),
        );
        process_guard.take();
        state.admission_present.store(false, Ordering::Release);
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    let validated = validated.expect("validated above");
    if let ValidatedPrivateResponse::Error(code) = validated {
        diagnostic_event(
            "ipc_response_error",
            Some(action),
            "failed",
            Some(&code),
            Some(started.elapsed().as_millis()),
        );
        return Err(code);
    }
    diagnostic_event(
        "ipc_response_ok",
        Some(action),
        "ready",
        None,
        Some(started.elapsed().as_millis()),
    );
    match validated {
        ValidatedPrivateResponse::Success(result) => Ok(result),
        ValidatedPrivateResponse::Error(_) => unreachable!("handled above"),
    }
}

async fn blocking_rpc(state: DesktopState, action: &'static str) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || rpc(&state, action, None, &[], None))
        .await
        .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

fn resolved_local_target(
    state: &DesktopState,
    action: &str,
    expected_kind: &str,
) -> Result<PathBuf, String> {
    let result = rpc(state, action, None, &[], None)?;
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
    if metadata.file_type().is_symlink()
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
        return Ok(command);
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("/usr/bin/open");
        if kind == "file" {
            command.arg("-R");
        }
        command.arg(target);
        return Ok(command);
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
    let mut command = native_open_command(target, kind)?;
    // Do not apply CREATE_NO_WINDOW or another hidden-window flag here.  The
    // operating-system file manager is intentionally a visible user action.
    command.spawn().map_err(|_| {
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
        &["txt", "md", "markdown", "csv", "docx"],
    )
}

#[tauri::command]
async fn select_files(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
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
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, false)?;
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
#[tauri::command]
async fn start_admitted_batch(state: State<'_, DesktopState>) -> Result<Value, String> {
    let _guard = selection_guard(&state.selection_busy, &state.admission_present, true)?;
    let result = blocking_rpc(state.inner().clone(), "start_admitted_batch").await;
    state.admission_present.store(false, Ordering::Release);
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
        rpc(&owned, "configure_results", None, &[path], None)
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
async fn open_diagnostic_folder() -> Result<Value, String> {
    let directory = diagnostic_directory();
    std::fs::create_dir_all(&directory)
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
    let mut command = native_open_command(&directory, "directory")?;
    command
        .spawn()
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
    json!({ "ok": true, "product_version": env!("CARGO_PKG_VERSION"),
        "admission_prepared": state.admission_present.load(Ordering::Acquire) })
}

fn main() {
    let profile = match native_smoke::from_environment() {
        Ok(profile) => profile,
        Err(_) => std::process::exit(65),
    };
    let isolated_smoke = profile.is_some();
    let _ = NATIVE_SMOKE_PROFILE.set(profile);
    let mut context = tauri::generate_context!();
    if isolated_smoke {
        // Do not let configured windows create a real-user WebView directory
        // before setup. The builder below receives an absolute private path.
        for window in &mut context.config_mut().app.windows {
            window.create = false;
        }
    }
    diagnostic_event("application_started", None, "ready", None, None);
    tauri::Builder::default()
        .on_page_load(|_webview, _payload| {
            diagnostic_event("page_loaded", None, "ready", None, None);
        })
        .setup(|app| {
            let state = DesktopState {
                app: app.handle().clone(),
                sidecar: Arc::new(Mutex::new(None)),
                selection_busy: Arc::new(AtomicBool::new(false)),
                admission_present: Arc::new(AtomicBool::new(false)),
                frontend_ready: Arc::new(AtomicBool::new(false)),
            };
            app.manage(state);
            if let Some(profile) = NATIVE_SMOKE_PROFILE.get().and_then(Option::as_ref) {
                for config in &app.config().app.windows {
                    tauri::WebviewWindowBuilder::from_config(app, config)?
                        .data_directory(profile.webview.join(&config.label))
                        .build()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { .. }
                    if NATIVE_SMOKE_PROFILE
                        .get()
                        .and_then(Option::as_ref)
                        .is_some() =>
                {
                    if let Some(state) = window.try_state::<DesktopState>() {
                        if let Ok(mut process) = state.sidecar.lock() {
                            process.take();
                        }
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
            cancel_admission,
            start_admitted_batch,
            get_public_state,
            get_ui_context,
            ack_terminal_presented,
            continue_current_batch,
            configure_results,
            open_current_results,
            open_local_ledger,
            open_diagnostic_folder,
            shutdown,
            frontend_ready
        ])
        .run(context)
        .expect("DataSecure Standalone konnte nicht gestartet werden");
}

#[cfg(test)]
mod tests {
    use super::*;
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
        assert_eq!(dropped_source_kind(&[directory.clone()]).unwrap(), "folder");
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
            dropped_source_kind(&vec![source.clone(); 101]).unwrap_err(),
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
                dropped_source_kind(&[link.clone()]).unwrap_err(),
                "STANDALONE_SELECTION_INVALID"
            );
            std::fs::remove_file(link).expect("remove test symlink");
        }
        std::fs::remove_file(source).expect("remove test source");
        std::fs::remove_file(second).expect("remove second test source");
        std::fs::remove_dir(directory).expect("remove empty test directory");
    }

    #[test]
    fn native_selection_guard_excludes_concurrent_and_already_prepared_selections() {
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
        let start = selection_guard(&busy, &admitted, true).expect("explicit Start or cancel");
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
    fn terminal_acknowledgement_is_bound_to_one_safe_generation() {
        let request = private_request(
            "0123456789abcdef",
            "ack_terminal_presented",
            None,
            &[],
            Some(42),
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
        )
        .is_err());
        assert!(private_request(
            "0123456789abcdef",
            "ack_terminal_presented",
            None,
            &[],
            Some(0),
        )
        .is_err());
        assert!(
            private_request("0123456789abcdef", "get_public_state", None, &[], Some(42),).is_err()
        );
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
            ValidatedPrivateResponse::Error(_) => panic!("unexpected domain error"),
        }
        let domain_error = json!({
            "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
            "error_code": "STANDALONE_BUSY"
        });
        match validate_private_response(&domain_error, id).expect("valid error") {
            ValidatedPrivateResponse::Error(code) => assert_eq!(code, "STANDALONE_BUSY"),
            ValidatedPrivateResponse::Success(_) => panic!("unexpected success"),
        }
        for malformed in [
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true, "result": 1 }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": true,
                "result": {}, "extra": true }),
            json!({ "schema": RESPONSE_SCHEMA, "request_id": id, "ok": false,
                "error_code": "" }),
        ] {
            assert!(validate_private_response(&malformed, id).is_err());
        }
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
