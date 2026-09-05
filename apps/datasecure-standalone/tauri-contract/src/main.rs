#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{
    fs::OpenOptions,
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES: usize = 768 * 1024;
const MAX_SINGLE_PATH_BYTES: usize = 32767;
const MAX_PRESENTATION_GENERATION: u64 = 9_007_199_254_740_991;
const IPC_SCHEMA: &str = "datasecure-standalone-private-ipc/1";
const RESPONSE_SCHEMA: &str = "datasecure-standalone-private-response/1";
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static DIAGNOSTIC_LOCK: Mutex<()> = Mutex::new(());
static DIAGNOSTIC_SESSION: OnceLock<String> = OnceLock::new();

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
    if let Ok(documents) = app.path().document_dir() {
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

fn filters(dialog: rfd::FileDialog) -> rfd::FileDialog {
    dialog.add_filter(
        "Unterstützte Dateien",
        &["txt", "md", "markdown", "csv", "docx"],
    )
}

#[tauri::command]
async fn select_files(state: State<'_, DesktopState>) -> Result<Value, String> {
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
    tauri::async_runtime::spawn_blocking(move || {
        rpc(
            &owned,
            "admit_selected_sources",
            Some("files"),
            &paths,
            None,
        )
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command]
async fn select_folder(state: State<'_, DesktopState>) -> Result<Value, String> {
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
    tauri::async_runtime::spawn_blocking(move || {
        rpc(
            &owned,
            "admit_selected_sources",
            Some("folder"),
            &[path],
            None,
        )
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command]
async fn cancel_admission(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "cancel_admission").await
}
#[tauri::command]
async fn start_admitted_batch(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "start_admitted_batch").await
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
    blocking_rpc(state.inner().clone(), "open_current_results").await
}
#[tauri::command]
async fn open_local_ledger(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "open_local_ledger").await
}
#[tauri::command]
async fn open_diagnostic_folder() -> Result<Value, String> {
    let directory = diagnostic_directory();
    std::fs::create_dir_all(&directory)
        .map_err(|_| "STANDALONE_DIAGNOSTICS_OPEN_FAILED".to_string())?;
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    command.arg(&directory);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
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

fn main() {
    diagnostic_event("application_started", None, "ready", None, None);
    tauri::Builder::default()
        .setup(|app| {
            let state = DesktopState {
                app: app.handle().clone(),
                sidecar: Arc::new(Mutex::new(None)),
            };
            app.manage(state);
            Ok(())
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
            shutdown
        ])
        .run(tauri::generate_context!())
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
