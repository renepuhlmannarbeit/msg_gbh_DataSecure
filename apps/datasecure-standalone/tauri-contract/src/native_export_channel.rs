//! Internal sidecar callbacks, not WebView commands or a generic filesystem API.
//! Picker binding, bounded body transfer and durable native publication.
//! There is no helper process, renderer filesystem API or recursive RPC.
use crate::{export_directory::Directory, ipc_transport::{self, Lifecycle}};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::Path, sync::mpsc, time::Instant};

pub const REQUEST_SCHEMA: &str = "datasecure-native-export-request/1";
pub const RESPONSE_SCHEMA: &str = "datasecure-native-export-response/1";
pub const PUBLICATION_REQUEST: &str = "datasecure-native-export-request/2";
pub const PUBLICATION_RESPONSE: &str = "datasecure-native-export-response/2";
const MAX_PUBLICATION_FRAMES: u64 = 9000; // 500 MiB / 64 KiB + <=200 file boundaries + control frames
#[derive(Default)]
pub(crate) struct PublicationState { sequence: u32, native_id: Option<String>, operation: Option<Value>, body: Option<(usize, Vec<u8>)> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigureRequest { schema: String, request_id: String, native_id: String, sequence: u32, action: String, root: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportRequest { schema: String, request_id: String, native_id: String, sequence: u32, action: String,
    command: String, operation: crate::native_export_broker::Operation, #[serde(default)] body: Option<BodyChunk> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BodyChunk { index: usize, offset: usize, hex: String, final_chunk: bool }
fn receive_body(state: &mut PublicationState, op: &crate::native_export_broker::Operation, chunk: BodyChunk,
    data: &Path, guard: &ipc_transport::NativeGuard) -> std::io::Result<&'static str> {
    let invalid = || std::io::Error::other("AI_EXPORT_CONFLICT");
    let file = op.files.get(chunk.index).ok_or_else(invalid)?;
    if file.bytes > 32_000_000 || chunk.hex.len() > 2 * 65536 || chunk.hex.len() % 2 != 0 ||
        !chunk.hex.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) ||
        chunk.hex.is_empty() && file.bytes != 0 { return Err(invalid()); }
    if state.body.is_none() {
        if chunk.offset != 0 { return Err(invalid()); }
        state.body = Some((chunk.index, Vec::new()));
    }
    let (index, bytes) = state.body.as_mut().ok_or_else(invalid)?;
    if *index != chunk.index || bytes.len() != chunk.offset ||
        bytes.len().checked_add(chunk.hex.len() / 2).ok_or_else(invalid)? > file.bytes as usize { return Err(invalid()); }
    for pair in chunk.hex.as_bytes().chunks_exact(2) {
        let digit = |v: u8| if v.is_ascii_digit() { v - b'0' } else { v - b'a' + 10 };
        bytes.push(digit(pair[0]) * 16 + digit(pair[1]));
    }
    if chunk.final_chunk != (bytes.len() as u64 == file.bytes) { return Err(invalid()); }
    if !chunk.final_chunk { return Ok("receiving"); }
    let (index, bytes) = state.body.take().ok_or_else(invalid)?;
    crate::native_export_broker::write_body(data, op, index, &bytes, guard)
}
pub(crate) fn handle_publication(frame: &Value, outer: &Value, state: &mut PublicationState,
    lifecycle: &Lifecycle, data: &Path, deadline: Instant) -> Result<Option<Value>, String> {
    if frame.get("schema").and_then(Value::as_str) != Some(PUBLICATION_REQUEST) { return Ok(None); }
    // Register ownership BEFORE spawning. A timed-out receiver cannot release
    // a native writer or terminate the sidecar whose control lock it still uses.
    let guard = lifecycle.begin_native_until(deadline)?;
    run_publication(frame, outer, state, lifecycle, data, deadline, guard)
}
pub(crate) fn run_publication(frame: &Value, outer: &Value, state: &mut PublicationState,
    lifecycle: &Lifecycle, data: &Path, deadline: Instant, guard: ipc_transport::NativeGuard) -> Result<Option<Value>, String> {
    let frame = frame.clone(); let outer = outer.clone(); let data = data.to_path_buf();
    let mut owned = std::mem::take(state);
    let (send, receive) = mpsc::channel();
    std::thread::Builder::new().name("native-export-publication".into()).spawn(move || {
        let result = handle_publication_owned(&frame, &outer, &mut owned, &guard, &data);
        drop(guard); // I/O, reconciliation, capabilities and locks have ended.
        let _ = send.send((owned, result)); // No pipe writer or sidecar access.
    }).map_err(|_| ipc_transport::FAILED.to_string())?;
    let (next, result) = ipc_transport::receive_until(&receive, deadline, &lifecycle.stopping)?;
    *state = next;
    result
}
fn handle_publication_owned(frame: &Value, outer: &Value, state: &mut PublicationState,
    guard: &ipc_transport::NativeGuard, data: &Path) -> Result<Option<Value>, String> {
    guard.checkpoint()?;
    let invalid = || ipc_transport::FAILED.to_string();
    let sequence = frame.get("sequence").and_then(Value::as_u64).ok_or_else(invalid)?;
    let native_id = frame.get("native_id").and_then(Value::as_str).ok_or_else(invalid)?;
    if sequence != u64::from(state.sequence) + 1 || sequence > MAX_PUBLICATION_FRAMES || native_id.len() != 32 ||
        !native_id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) ||
        state.native_id.as_deref().is_some_and(|v| v != native_id) || frame["request_id"] != outer["request_id"] {
        return Err(invalid());
    }
    let mut response = json!({ "schema": PUBLICATION_RESPONSE, "request_id": outer["request_id"],
        "native_id": native_id, "sequence": sequence });
    let outcome = if frame["action"] == "configure_export_root" {
        let request: ConfigureRequest = serde_json::from_value(frame.clone()).map_err(|_| invalid())?;
        if request.schema != PUBLICATION_REQUEST || request.action != "configure_export_root" ||
            request.request_id != outer["request_id"] || request.native_id != native_id || u64::from(request.sequence) != sequence ||
            sequence != 1 || outer["action"] != "configure_results" || outer["native_export_binding"] != true ||
            outer["source_paths"].as_array().filter(|v| v.len() == 1).and_then(|v| v[0].as_str()) != Some(&request.root) {
            return Err(invalid());
        }
        crate::native_export_broker::configure(Path::new(&request.root), data, native_id, guard)
            .map(|binding| { response["binding"] = json!(binding); })
    } else {
        let request: ExportRequest = serde_json::from_value(frame.clone()).map_err(|_| invalid())?;
        let op = &request.operation;
        let action = outer["action"].as_str().unwrap_or("");
        if request.schema != PUBLICATION_REQUEST || request.action != "export_documents" ||
            request.request_id != outer["request_id"] || request.native_id != native_id || u64::from(request.sequence) != sequence ||
            outer["batch_id"] != op.batch_id || outer["operation_id"] != op.operation_id ||
            !match action {
                "export_approved_documents" => match request.command.as_str() {
                    "publish" | "write_body" => outer["acknowledge"] != true,
                    "acknowledge" => outer["acknowledge"] == true,
                    "reconcile" => true, _ => false },
                "resolve_document_export" => request.command == "reconcile",
                "abandon_document_export" => request.command == "abandon" && outer["digest"] == op.request_sha256,
                _ => false,
            } { return Err(invalid()); }
        if action == "export_approved_documents" {
            let rows = outer["selection"].as_array().ok_or_else(invalid)?;
            if rows.len() != op.files.len() || rows.iter().zip(&op.files).any(|(row, file)| {
                let digest: String = file.sha256.iter().map(|b| format!("{b:02x}")).collect(); row["output_sha256"] != digest
            }) { return Err(invalid()); }
        }
        let operation = serde_json::to_value(op).map_err(|_| invalid())?;
        if state.operation.as_ref().is_some_and(|saved| saved != &operation) { return Err(invalid()); }
        state.operation = Some(operation);
        let result = if request.command == "write_body" {
            receive_body(state, op, request.body.ok_or_else(invalid)?, data, guard)
        } else {
            if request.body.is_some() || state.body.is_some() { return Err(invalid()); }
            crate::native_export_broker::execute(data, op, &request.command, guard)
        };
        if result.is_err() { state.body = None; }
        result
            .map(|status| { response["status"] = json!(status); })
    };
    state.sequence = sequence as u32; state.native_id = Some(native_id.into());
    match outcome {
        Ok(()) => response["ok"] = json!(true),
        Err(e) => { response["ok"] = json!(false); response["error_code"] = json!(crate::native_export_broker::public_code(&e)); },
    }
    Ok(Some(response))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    schema: String, request_id: String, native_id: String, sequence: u32,
    action: String, root: String,
}

pub fn handle(frame: &Value, outer: &Value, already_handled: &mut bool,
    lifecycle: &Lifecycle, deadline: Instant) -> Result<Option<Value>, String> {
    if frame.get("schema").and_then(Value::as_str) != Some(REQUEST_SCHEMA) { return Ok(None); }
    let invalid = || crate::ipc_transport::FAILED.to_string();
    let request: Request = serde_json::from_value(frame.clone()).map_err(|_| invalid())?;
    // Neither a forged callback on another action nor a different pathname
    // grants native access. No callback response is forwarded to the renderer.
    if *already_handled || request.schema != REQUEST_SCHEMA || request.sequence != 1 ||
        request.action != "bind_result_root" || request.native_id.len() != 32 ||
        !request.native_id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) ||
        outer.get("action").and_then(Value::as_str) != Some("configure_results") ||
        outer.get("native_export_binding").and_then(Value::as_bool) != Some(true) ||
        outer.get("request_id").and_then(Value::as_str) != Some(request.request_id.as_str()) ||
        outer.get("source_paths").and_then(Value::as_array).filter(|values| values.len() == 1)
            .and_then(|values| values[0].as_str()) != Some(request.root.as_str()) {
        return Err(invalid());
    }
    *already_handled = true;
    let root = request.root;
    let result = read_metadata(lifecycle, deadline, move ||
        Directory::open_existing(Path::new(&root), None).map(|directory| directory.identity()))?;
    let envelope = json!({ "schema": RESPONSE_SCHEMA, "request_id": request.request_id,
        "native_id": request.native_id, "sequence": request.sequence });
    let mut response = envelope;
    match result {
        Ok(identity) => {
            response["ok"] = json!(true);
            // JavaScript cannot represent u64/u128 identities exactly as Numbers.
            response["identity"] = json!({ "volume": identity.volume.to_string(),
                "object": identity.object.to_string(), "created_ns": identity.created_ns.to_string() });
        },
        Err(_) => {
            response["ok"] = json!(false);
            response["error_code"] = json!("STANDALONE_RESULT_ROOT_UNSAFE");
        },
    }
    Ok(Some(response))
}

// Metadata reads carry no write capability across this boundary. A blocked
// filesystem/filter-driver call cannot hold the response pump or shutdown
// barrier indefinitely. Its eventual result is discarded after timeout/quit.
fn read_metadata<T: Send + 'static>(lifecycle: &Lifecycle, deadline: Instant,
    action: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    let guard = lifecycle.begin_read_only()?;
    let (send, receive) = mpsc::channel();
    std::thread::Builder::new().name("export-root-metadata".to_string()).spawn(move || {
        let result = action();
        drop(guard);
        let _ = send.send(result);
    }).map_err(|_| ipc_transport::FAILED.to_string())?;
    ipc_transport::receive_until(&receive, deadline, &lifecycle.stopping)
}

pub fn validate_completion(response: &Value, outer: &Value, bound: bool) -> Result<(), String> {
    if outer.get("native_export_binding").and_then(Value::as_bool) == Some(true) &&
        response.get("ok").and_then(Value::as_bool) == Some(true) && !bound {
        return Err(ipc_transport::FAILED.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export_directory::Identity;
    use std::time::Duration;
    fn deadline() -> Instant { Instant::now() + Duration::from_secs(2) }
    fn handle(frame: &Value, outer: &Value, used: &mut bool, lifecycle: &Lifecycle) -> Result<Option<Value>, String> {
        super::handle(frame, outer, used, lifecycle, deadline())
    }
    fn outer() -> Value { json!({ "action": "configure_results", "native_export_binding": true, "request_id": "1".repeat(16), "source_paths": ["not-an-absolute-root"] }) }
    fn request() -> Value { json!({ "schema": REQUEST_SCHEMA, "request_id": "1".repeat(16), "native_id": "2".repeat(32),
        "sequence": 1, "action": "bind_result_root", "root": "not-an-absolute-root" }) }
    #[test]
    fn closed_callback_is_bound_to_the_exact_picker_request_and_used_once() {
        let lifecycle = Lifecycle::default(); let mut used = false;
        let response = handle(&request(), &outer(), &mut used, &lifecycle).unwrap().unwrap();
        assert_eq!(response["ok"], false); assert_eq!(response["error_code"], "STANDALONE_RESULT_ROOT_UNSAFE");
        assert!(used); assert!(handle(&request(), &outer(), &mut used, &lifecycle).is_err());
        for (field, value) in [("root", json!("different")), ("sequence", json!(2)), ("request_id", json!("3".repeat(16))),
            ("native_id", json!("A".repeat(32))), ("action", json!("publish")), ("extra", json!(true))] {
            let mut invalid = request(); invalid[field] = value;
            assert!(handle(&invalid, &outer(), &mut false, &lifecycle).is_err(), "{field}");
        }
        let mut other = outer(); other["action"] = json!("get_public_state");
        assert!(handle(&request(), &other, &mut false, &lifecycle).is_err());
    }
    #[test]
    fn closing_owner_refuses_native_work_and_normal_responses_remain_untouched() {
        let lifecycle = Lifecycle::default(); assert!(lifecycle.stop());
        assert_eq!(handle(&request(), &outer(), &mut false, &lifecycle).unwrap_err(), crate::ipc_transport::CLOSED);
        assert!(handle(&json!({"schema": "datasecure-standalone-private-response/1"}), &outer(), &mut false, &lifecycle).unwrap().is_none());
    }
    #[test]
    fn native_identity_roundtrips_as_decimal_strings_without_js_number_loss() {
        let folder = std::env::temp_dir();
        let directory = Directory::open_existing(&folder, None).unwrap();
        let mut outer = outer(); outer["source_paths"] = json!([folder]);
        let mut request = request(); request["root"] = json!(folder);
        let response = handle(&request, &outer, &mut false, &Lifecycle::default()).unwrap().unwrap();
        let identity = directory.identity();
        assert_eq!(response["identity"]["volume"], identity.volume.to_string());
        assert_eq!(response["identity"]["object"], identity.object.to_string());
        assert_eq!(response["identity"]["created_ns"], identity.created_ns.to_string());
    }
    #[test]
    fn successful_native_configuration_cannot_skip_its_required_callback() {
        assert!(validate_completion(&json!({"ok": true}), &outer(), false).is_err());
        assert!(validate_completion(&json!({"ok": true}), &outer(), true).is_ok());
        assert!(validate_completion(&json!({"ok": false}), &outer(), false).is_ok());
        assert!(validate_completion(&json!({"ok": true}), &json!({}), false).is_ok());
        let response = handle(&request(), &outer(), &mut false, &Lifecycle::default()).unwrap().unwrap();
        assert_eq!(response["ok"], false);
        assert!(validate_completion(&json!({"ok": true}), &outer(), response["ok"] == true).is_err(),
            "a performed but refused callback is not a native binding");
    }
    #[test]
    fn blocked_read_times_out_without_blocking_shutdown_or_adopting_a_late_result() {
        let lifecycle = Lifecycle::default();
        let (release, held) = mpsc::channel();
        let (ended, finished) = mpsc::channel();
        let result = read_metadata(&lifecycle, Instant::now() + Duration::from_millis(20), move || {
            held.recv().unwrap(); ended.send(()).unwrap(); Identity { volume: 1, object: 2, created_ns: 3 }
        });
        assert_eq!(result.unwrap_err(), ipc_transport::TIMEOUT);
        assert_eq!(lifecycle.begin_read_only().err().unwrap(), "STANDALONE_BUSY");
        assert!(lifecycle.stop(), "only read-only work can finish after shutdown");
        assert_eq!(lifecycle.begin_read_only().err().unwrap(), ipc_transport::CLOSED);
        release.send(()).unwrap(); finished.recv_timeout(Duration::from_secs(1)).unwrap();
    }
}
