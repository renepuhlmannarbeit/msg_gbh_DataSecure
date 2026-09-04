#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{
    io::{BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES: usize = 768 * 1024;
const MAX_SINGLE_PATH_BYTES: usize = 32767;
const IPC_SCHEMA: &str = "datasecure-standalone-private-ipc/1";
const RESPONSE_SCHEMA: &str = "datasecure-standalone-private-response/1";
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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
    let (executable, script) = runtime_paths(app)?;
    let script_directory = script
        .parent()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let script_name = script
        .file_name()
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let network_deny = script_directory
        .parent()
        .map(|server| server.join("network-deny.cjs"))
        .filter(|candidate| existing([candidate.clone()]).is_some())
        .ok_or_else(|| "STANDALONE_RUNTIME_MISSING".to_string())?;
    let mut command = Command::new(executable);
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
    command
        .current_dir(script_directory)
        .arg(format!("--require={}", network_deny.to_string_lossy()))
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
    let mut child = command
        .spawn()
        .map_err(|_| "STANDALONE_RUNTIME_START_FAILED".to_string())?;
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

fn rpc(
    state: &DesktopState,
    action: &str,
    source_kind: Option<&str>,
    paths: &[PathBuf],
) -> Result<Value, String> {
    let id = request_id();
    let mut request = json!({ "schema": IPC_SCHEMA, "request_id": id, "action": action });
    if action == "admit_selected_sources" || action == "configure_results" {
        if action == "admit_selected_sources" {
            request["source_kind"] = json!(source_kind.unwrap_or("files"));
        }
        request["source_paths"] = json!(strict_path_strings(paths)?);
    }
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
        process
            .responses
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "STANDALONE_IPC_TIMEOUT".to_string())?
    })();
    let response = match result {
        Ok(response) => response,
        Err(code) => {
            process_guard.take();
            return Err(code);
        }
    };
    if response.get("schema").and_then(Value::as_str) != Some(RESPONSE_SCHEMA)
        || response.get("request_id").and_then(Value::as_str) != Some(id.as_str())
    {
        process_guard.take();
        return Err("STANDALONE_IPC_FAILED".to_string());
    }
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(response
            .get("error_code")
            .and_then(Value::as_str)
            .unwrap_or("STANDALONE_OPERATION_FAILED")
            .to_string());
    }
    Ok(response
        .get("result")
        .cloned()
        .unwrap_or_else(|| json!({ "ok": true })))
}

async fn blocking_rpc(state: DesktopState, action: &'static str) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || rpc(&state, action, None, &[]))
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
    let selected =
        tauri::async_runtime::spawn_blocking(|| filters(rfd::FileDialog::new()).pick_files())
            .await
            .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(paths) = selected else {
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        rpc(&owned, "admit_selected_sources", Some("files"), &paths)
    })
    .await
    .map_err(|_| "STANDALONE_OPERATION_FAILED".to_string())?
}

#[tauri::command]
async fn select_folder(state: State<'_, DesktopState>) -> Result<Value, String> {
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(path) = selected else {
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        rpc(&owned, "admit_selected_sources", Some("folder"), &[path])
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
async fn continue_current_batch(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "continue_current_batch").await
}
#[tauri::command]
async fn configure_results(state: State<'_, DesktopState>) -> Result<Value, String> {
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| "STANDALONE_SELECTION_FAILED".to_string())?;
    let Some(path) = selected else {
        return Ok(json!({ "ok": true, "cancelled": true }));
    };
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || rpc(&owned, "configure_results", None, &[path]))
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
async fn shutdown(state: State<'_, DesktopState>) -> Result<Value, String> {
    blocking_rpc(state.inner().clone(), "shutdown").await
}

fn main() {
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
            continue_current_batch,
            configure_results,
            open_current_results,
            open_local_ledger,
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
        assert_eq!(strict_path_strings(&within).expect("within aggregate limit").len(), 25);
        let mut above = vec![PathBuf::from("a".repeat(MAX_SINGLE_PATH_BYTES)); 24];
        above.push(PathBuf::from("b".repeat(25)));
        assert_eq!(strict_path_strings(&above).unwrap_err(), "STANDALONE_SELECTION_INVALID");
        assert_eq!(strict_path_strings(&[PathBuf::from("a".repeat(MAX_SINGLE_PATH_BYTES + 1))]).unwrap_err(),
            "STANDALONE_SELECTION_INVALID");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_non_utf8_source_paths() {
        use std::ffi::OsString;
        use std::os::unix::ffi::OsStringExt;
        let path = PathBuf::from(OsString::from_vec(vec![b'a', 0xff, b'b']));
        assert_eq!(strict_path_strings(&[path]).unwrap_err(), "STANDALONE_SELECTION_INVALID");
    }
}
