//! Internal sidecar callbacks, not WebView commands or a generic filesystem API.
//! Picker binding, bounded body transfer and durable native publication.
//! There is no helper process, renderer filesystem API or recursive RPC.
use crate::{export_directory::Directory, ipc_transport::{self, Lifecycle}, ipc_activity::{ExportPhase, ExportReporter},
    native_export_transaction::PublicationRole};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::Path, sync::mpsc, time::Instant};

pub const REQUEST_SCHEMA: &str = "datasecure-native-export-request/1";
pub const RESPONSE_SCHEMA: &str = "datasecure-native-export-response/1";
pub const PUBLICATION_REQUEST: &str = "datasecure-native-export-request/2";
pub const PUBLICATION_RESPONSE: &str = "datasecure-native-export-response/2";
const MAX_PUBLICATION_FRAMES: u64 = 9000; // 500 MiB / 64 KiB + <=200 file boundaries + control frames
#[derive(Default)]
pub(crate) struct PublicationState {
    sequence: u32, native_id: Option<String>, operation: Option<Value>, body: Option<(usize, Vec<u8>)>,
    #[cfg(test)] native_worker_dispatches: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigureRequest { schema: String, request_id: String, native_id: String, sequence: u32, action: String, root: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfiguredRequest { schema: String, request_id: String, native_id: String, sequence: u32, action: String,
    batch_id: String, operation_id: String, root: String, setting_sha256: String,
    admission: crate::native_export_broker::ConfiguredAdmission }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportRequest { schema: String, request_id: String, native_id: String, sequence: u32, action: String,
    command: String, operation: crate::native_export_broker::Operation, #[serde(default)] body: Option<BodyChunk> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BodyChunk { index: usize, offset: usize, hex: String, final_chunk: bool }
// Results publication is a separate closed caller role, not a caller-selected
// export inventory. Only the private store chooses its operation and bodies.
// The history opener may freshly reconcile an existing result, never mutate it.
fn results_outer(outer: &Value, batch_id: &str, action: &str) -> bool {
    let Some(object) = outer.as_object() else { return false; };
    object.len() == 4 && ["schema", "request_id", "action", "batch_id"].iter().all(|key| object.contains_key(*key)) &&
        outer["schema"] == "datasecure-standalone-private-ipc/1" && outer["action"] == action &&
        outer["batch_id"] == batch_id && batch_id.len() == 64 &&
        batch_id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) &&
        outer["request_id"].as_str().is_some_and(|id| (16..=64).contains(&id.len()) &&
            id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}
fn current_results_outer(outer: &Value) -> bool {
    let Some(object) = outer.as_object() else { return false; };
    object.len() == 3 && ["schema", "request_id", "action"].iter().all(|key| object.contains_key(*key)) &&
        outer["schema"] == "datasecure-standalone-private-ipc/1" && outer["action"] == "resolve_current_results" &&
        outer["request_id"].as_str().is_some_and(|id| (16..=64).contains(&id.len()) &&
            id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}
fn receive_body(state: &mut PublicationState, op: &crate::native_export_broker::Operation, chunk: BodyChunk,
    data: &Path, guard: Option<&ipc_transport::NativeGuard>, reporter: Option<&ExportReporter>) -> std::io::Result<&'static str> {
    let invalid = || std::io::Error::other("AI_EXPORT_CONFLICT");
    let file = op.files.get(chunk.index).ok_or_else(invalid)?;
    if file.bytes > 32_000_000 || chunk.hex.len() > 2 * 65536 || !chunk.hex.len().is_multiple_of(2) ||
        !chunk.hex.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) ||
        chunk.hex.is_empty() && file.bytes != 0 { return Err(invalid()); }
    if state.body.is_none() {
        if chunk.offset != 0 { return Err(invalid()); }
        state.body = Some((chunk.index, Vec::new()));
    }
    let (index, bytes) = state.body.as_mut().ok_or_else(invalid)?;
    if *index != chunk.index || bytes.len() != chunk.offset ||
        bytes.len().checked_add(chunk.hex.len() / 2).ok_or_else(invalid)? > file.bytes as usize { return Err(invalid()); }
    for pair in chunk.hex.as_bytes().as_chunks::<2>().0 {
        let digit = |v: u8| if v.is_ascii_digit() { v - b'0' } else { v - b'a' + 10 };
        bytes.push(digit(pair[0]) * 16 + digit(pair[1]));
    }
    if chunk.final_chunk != (bytes.len() as u64 == file.bytes) { return Err(invalid()); }
    if let Some(reporter) = reporter { reporter.phase(ExportPhase::Copying, op.files.len()); }
    if !chunk.final_chunk { return Ok("receiving"); }
    // The inline decoder has no native I/O capability. A final chunk can only
    // stage bytes in the separately registered native worker below.
    let guard = guard.ok_or_else(invalid)?;
    let (index, bytes) = state.body.take().ok_or_else(invalid)?;
    let result = crate::native_export_broker::write_body(data, op, index, &bytes, guard);
    if matches!(result, Ok("staged")) {
        if let Some(reporter) = reporter { reporter.staged_file(index, op.files.len()); }
    }
    result
}
#[cfg(test)]
pub(crate) fn handle_publication(frame: &Value, outer: &Value, state: &mut PublicationState,
    lifecycle: &Lifecycle, data: &Path, deadline: Instant) -> Result<Option<Value>, String> {
    handle_publication_with_activity(frame, outer, state, lifecycle, data, deadline, None)
}
pub(crate) fn handle_publication_with_activity(frame: &Value, outer: &Value, state: &mut PublicationState,
    lifecycle: &Lifecycle, data: &Path, deadline: Instant, reporter: Option<ExportReporter>) -> Result<Option<Value>, String> {
    if frame.get("schema").and_then(Value::as_str) != Some(PUBLICATION_REQUEST) { return Ok(None); }
    if frame["action"] == "export_documents" && frame["command"] == "write_body" &&
        frame.get("body").and_then(|body| body.get("final_chunk")) == Some(&Value::Bool(false)) {
        // Classification is not authorization: the same closed deserializer,
        // sequence, exact outer selection and stable operation checks run below.
        // Only bounded memory work runs on the already-blocking RPC thread.
        let guard = lifecycle.begin_native_until(deadline)?;
        return run_inline_publication(frame, outer, state, data, guard, reporter.as_ref());
    }
    // Register ownership BEFORE spawning. A timed-out receiver cannot release
    // a native writer or terminate the sidecar whose control lock it still uses.
    PublicationWorker::new(lifecycle, data, deadline, reporter)?.run(frame, outer, state)
}
fn run_inline_publication(frame: &Value, outer: &Value, state: &mut PublicationState,
    data: &Path, guard: ipc_transport::NativeGuard, reporter: Option<&ExportReporter>) -> Result<Option<Value>, String> {
    guard.checkpoint()?;
    let result = handle_publication_owned(frame, outer, state, None, data, reporter);
    #[cfg(test)] guard.test_event("after_inline_chunk");
    if let Err(code) = guard.checkpoint() { state.body = None; return Err(code); }
    result
}
#[cfg(test)]
pub(crate) fn run_publication(frame: &Value, outer: &Value, state: &mut PublicationState,
    lifecycle: &Lifecycle, data: &Path, deadline: Instant, guard: ipc_transport::NativeGuard) -> Result<Option<Value>, String> {
    PublicationWorker { lifecycle, data, deadline, guard, reporter: None }.run(frame, outer, state)
}
// One handoff owns the write guard and its original absolute deadline. The
// receiver borrows lifecycle state; only the worker owns native I/O authority.
struct PublicationWorker<'a> {
    lifecycle: &'a Lifecycle, data: &'a Path, deadline: Instant,
    guard: ipc_transport::NativeGuard, reporter: Option<ExportReporter>,
}
impl<'a> PublicationWorker<'a> {
    fn new(lifecycle: &'a Lifecycle, data: &'a Path, deadline: Instant, reporter: Option<ExportReporter>) -> Result<Self, String> {
        let guard = lifecycle.begin_native_until(deadline)?;
        Ok(Self { lifecycle, data, deadline, guard, reporter })
    }
    fn run(self, frame: &Value, outer: &Value, state: &mut PublicationState) -> Result<Option<Value>, String> {
        let Self { lifecycle, data, deadline, guard, reporter } = self;
        let frame = frame.clone(); let outer = outer.clone(); let data = data.to_path_buf();
        let mut owned = std::mem::take(state);
        let (send, receive) = mpsc::channel();
        std::thread::Builder::new().name("native-export-publication".into()).spawn(move || {
            #[cfg(test)] { owned.native_worker_dispatches += 1; }
            let result = guard.checkpoint().and_then(|()|
                handle_publication_owned(&frame, &outer, &mut owned, Some(&guard), &data, reporter.as_ref()));
            drop(guard); // I/O, reconciliation, capabilities and locks have ended.
            let _ = send.send((owned, result)); // No pipe writer or sidecar access.
        }).map_err(|_| ipc_transport::FAILED.to_string())?;
        let (next, result) = ipc_transport::receive_until(&receive, deadline, &lifecycle.stopping)?;
        *state = next;
        result
    }
}
fn handle_publication_owned(frame: &Value, outer: &Value, state: &mut PublicationState,
    guard: Option<&ipc_transport::NativeGuard>, data: &Path, reporter: Option<&ExportReporter>) -> Result<Option<Value>, String> {
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
        crate::native_export_broker::configure(Path::new(&request.root), data, native_id, guard.ok_or_else(invalid)?)
            .map(|binding| { response["binding"] = json!(binding); })
    } else if frame["action"] == "prepare_configured_export_root" {
        let request: ConfiguredRequest = serde_json::from_value(frame.clone()).map_err(|_| invalid())?;
        if request.schema != PUBLICATION_REQUEST || request.action != "prepare_configured_export_root" ||
            request.request_id != outer["request_id"] || request.native_id != native_id || u64::from(request.sequence) != sequence ||
            sequence != 1 || state.operation.is_some() ||
            !(results_outer(outer, &request.batch_id, "publish_result_documents") ||
                outer["action"] == "export_approved_documents" && outer["acknowledge"] != true &&
                outer["batch_id"] == request.batch_id && outer["operation_id"] == request.operation_id) ||
            request.batch_id.len() != 64 || request.operation_id.len() != 32 ||
            !request.batch_id.bytes().chain(request.operation_id.bytes()).all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err(invalid());
        }
        crate::native_export_broker::prepare_configured(Path::new(&request.root), data, native_id,
            &request.admission, &request.setting_sha256, guard.ok_or_else(invalid)?)
            .map(|binding| { response["binding"] = json!(binding); })
    } else {
        let request: ExportRequest = serde_json::from_value(frame.clone()).map_err(|_| invalid())?;
        let op = &request.operation;
        let action = outer["action"].as_str().unwrap_or("");
        let authorized = if op.publication_role == Some(PublicationRole::Results) {
            results_outer(outer, &op.batch_id, "publish_result_documents") &&
                ["publish", "write_body", "acknowledge", "reconcile"].contains(&request.command.as_str()) ||
            (results_outer(outer, &op.batch_id, "resolve_history_results") || current_results_outer(outer)) && request.command == "reconcile"
        } else {
            outer["batch_id"] == op.batch_id && outer["operation_id"] == op.operation_id && match action {
                "export_approved_documents" => match request.command.as_str() {
                    "publish" | "write_body" => outer["acknowledge"] != true,
                    "acknowledge" => outer["acknowledge"] == true,
                    "reconcile" => true, _ => false },
                "resolve_document_export" => request.command == "reconcile",
                "abandon_document_export" => request.command == "abandon" && outer["digest"] == op.request_sha256,
                _ => false,
            }
        };
        if request.schema != PUBLICATION_REQUEST || request.action != "export_documents" ||
            request.request_id != outer["request_id"] || request.native_id != native_id || u64::from(request.sequence) != sequence ||
            !authorized { return Err(invalid()); }
        if action == "export_approved_documents" {
            let rows = outer["selection"].as_array().ok_or_else(invalid)?;
            if rows.len() != op.files.len() || rows.iter().zip(&op.files).any(|(row, file)| {
                let digest: String = file.sha256.iter().map(|b| format!("{b:02x}")).collect(); row["output_sha256"] != digest
            }) { return Err(invalid()); }
        }
        let operation = serde_json::to_value(op).map_err(|_| invalid())?;
        if state.operation.as_ref().is_some_and(|saved| saved != &operation) { return Err(invalid()); }
        state.operation = Some(operation);
        let reporter = reporter.filter(|reporter| action == "export_approved_documents" && reporter.matches_operation(&op.operation_id));
        // The existing closed frame, exact outer request/selection and stable
        // operation binding above remain the observation ingress boundary.
        // Reporters have no filesystem authority and never skip broker checks.
        let result = if request.command == "write_body" {
            receive_body(state, op, request.body.ok_or_else(invalid)?, data, guard, reporter)
        } else {
            if request.body.is_some() || state.body.is_some() { return Err(invalid()); }
            if let Some(reporter) = reporter {
                reporter.phase(match request.command.as_str() {
                    "publish" => ExportPhase::Verifying,
                    "acknowledge" => ExportPhase::Receipt,
                    _ => ExportPhase::Preparing,
                }, op.files.len());
            }
            if ["resolve_history_results", "resolve_current_results"].contains(&action) {
                crate::native_export_broker::inspect_results(data, op, guard.ok_or_else(invalid)?)
            } else { crate::native_export_broker::execute(data, op, &request.command, guard.ok_or_else(invalid)?) }
        };
        if result.is_err() { state.body = None; }
        if let (Some(reporter), Ok(status)) = (reporter, &result) {
            match *status {
                "prepared" => reporter.phase(ExportPhase::Verifying, op.files.len()),
                // A verified earlier copy/ACK is not a new staging pass. Keep
                // the actual count and only describe receipt reconciliation.
                "completed" | "acknowledged" => reporter.phase(ExportPhase::Receipt, op.files.len()),
                _ => {},
            }
        }
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
    use crate::{ipc_activity::Tracker, export_directory::ExpectedFile, native_export_broker::Operation};
    use sha2::{Digest, Sha256};
    struct ExportFixture { root: std::path::PathBuf }
    impl ExportFixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("datasecure-native-progress-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            std::fs::create_dir(&root).unwrap();
            let parent = Directory::open_existing(&root, None).unwrap();
            parent.create_controlled_child("private").unwrap(); parent.create_controlled_child("public").unwrap();
            Self { root }
        }
        fn data(&self) -> std::path::PathBuf { self.root.join("private") }
        fn operation(&self, lifecycle: &Lifecycle) -> Operation {
            let guard = lifecycle.begin_native().unwrap();
            let binding = crate::native_export_broker::configure(&self.root.join("public"), &self.data(), &"d".repeat(32), &guard).unwrap();
            Operation { batch_id: "a".repeat(64), operation_id: "b".repeat(32), request_sha256: "c".repeat(64), publication_role: None,
                processing_mode: "markdown-and-anonymize".into(), binding,
                files: [b"hello", b"world"].into_iter().enumerate().map(|(index, bytes)| ExpectedFile {
                    name: format!("Dokument_{:02}.md", index + 1), bytes: 5, sha256: Sha256::digest(bytes).into() }).collect() }
        }
    }
    impl Drop for ExportFixture {
        fn drop(&mut self) {
            assert_eq!(self.root.parent().unwrap(), std::env::temp_dir());
            assert!(self.root.file_name().unwrap().to_string_lossy().starts_with("datasecure-native-progress-"));
            let mut pending = vec![self.root.clone()];
            while let Some(path) = pending.pop() {
                let metadata = std::fs::symlink_metadata(&path).unwrap(); assert!(!metadata.file_type().is_symlink());
                #[cfg(windows)] { use std::os::windows::fs::MetadataExt; assert_eq!(metadata.file_attributes() & 0x400, 0); }
                if metadata.is_dir() { pending.extend(std::fs::read_dir(path).unwrap().map(|entry| entry.unwrap().path())); }
                else { assert!(metadata.is_file()); }
            }
            std::fs::remove_dir_all(&self.root).unwrap();
        }
    }
    fn export_outer(op: &Operation, acknowledge: bool) -> Value {
        json!({ "request_id": "0000000000000001", "action": "export_approved_documents", "batch_id": op.batch_id,
            "operation_id": op.operation_id, "acknowledge": acknowledge,
            "selection": op.files.iter().enumerate().map(|(index, file)| json!({
                "document_id": format!("{index:032x}"), "revision": 1,
                "output_sha256": file.sha256.iter().map(|byte| format!("{byte:02x}")).collect::<String>() })).collect::<Vec<_>>() })
    }
    fn results_request_outer(op: &Operation, action: &str) -> Value {
        json!({ "schema": "datasecure-standalone-private-ipc/1", "request_id": "0000000000000001",
            "action": action, "batch_id": op.batch_id })
    }
    fn export_frame(op: &Operation, outer: &Value, sequence: u32, command: &str, body: Option<Value>) -> Value {
        let mut value = json!({ "schema": PUBLICATION_REQUEST, "request_id": outer["request_id"], "native_id": "e".repeat(32),
            "sequence": sequence, "action": "export_documents", "command": command, "operation": op });
        if let Some(body) = body { value["body"] = body; }
        // Actual wire-shaped JSON crosses the production closed Deserialize
        // boundary and native worker/handle path, not an injected stage status.
        serde_json::from_slice(&serde_json::to_vec(&value).unwrap()).unwrap()
    }
    fn publish_frame(frame: &Value, outer: &Value, state: &mut PublicationState, lifecycle: &Lifecycle,
        fixture: &ExportFixture, reporter: &ExportReporter) -> Value {
        handle_publication_with_activity(frame, outer, state, lifecycle, &fixture.data(), deadline(), Some(reporter.clone())).unwrap().unwrap()
    }
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
    fn result_role_frames_publish_and_reconcile_only_through_the_closed_batch_contract() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default();
        let mut op = fixture.operation(&lifecycle); op.publication_role = Some(PublicationRole::Results);
        let outer = results_request_outer(&op, "publish_result_documents");
        let mut state = PublicationState::default();
        for (index, body) in ["68656c6c6f", "776f726c64"].into_iter().enumerate() {
            let frame = export_frame(&op, &outer, (index + 1) as u32, "write_body",
                Some(json!({ "index": index, "offset": 0, "hex": body, "final_chunk": true })));
            let result = handle_publication(&frame, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap();
            assert_eq!(result["ok"], true); assert_eq!(result["status"], "staged");
        }
        for (sequence, command, expected) in [(3, "publish", "completed"), (4, "acknowledge", "acknowledged")] {
            let result = handle_publication(&export_frame(&op, &outer, sequence, command, None), &outer,
                &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap();
            assert_eq!(result["ok"], true); assert_eq!(result["status"], expected);
        }
        let mut second = op.clone(); second.operation_id = "f".repeat(32);
        assert!(handle_publication(&export_frame(&second, &outer, 5, "reconcile", None), &outer,
            &mut state, &lifecycle, &fixture.data(), deadline()).is_err(), "one outer request cannot switch operation even after ACK");
        let read_outer = results_request_outer(&op, "resolve_history_results");
        let result = handle_publication(&export_frame(&op, &read_outer, 1, "reconcile", None), &read_outer,
            &mut PublicationState::default(), &lifecycle, &fixture.data(), deadline()).unwrap().unwrap();
        assert_eq!(result["ok"], true); assert_eq!(result["status"], "acknowledged");
        let current_outer = json!({"schema":"datasecure-standalone-private-ipc/1", "request_id":"1".repeat(16), "action":"resolve_current_results"});
        let current = handle_publication(&export_frame(&op, &current_outer, 1, "reconcile", None), &current_outer,
            &mut PublicationState::default(), &lifecycle, &fixture.data(), deadline()).unwrap().unwrap();
        assert_eq!(current["ok"], true); assert_eq!(current["status"], "acknowledged");
        let target = fixture.root.join("public/DataSecure-KI-Export");
        assert_eq!(std::fs::read_dir(&target).unwrap().count(), 1);
        let generation = target.join(format!("Ergebnisse-{}", op.operation_id));
        assert_eq!(std::fs::read(generation.join("Dokument_01.md")).unwrap(), b"hello");
        assert_eq!(std::fs::read(generation.join("Dokument_02.md")).unwrap(), b"world");
    }
    #[test]
    fn result_role_rejects_foreign_outer_fields_legacy_actions_and_history_mutation_before_io() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default();
        let mut op = fixture.operation(&lifecycle); op.publication_role = Some(PublicationRole::Results);
        let outer = results_request_outer(&op, "publish_result_documents");
        let guard = lifecycle.begin_native().unwrap();
        let frame = export_frame(&op, &outer, 1, "reconcile", None);
        for (field, value) in [("selection", json!([])), ("operation_id", json!(op.operation_id)),
            ("acknowledge", json!(true)), ("source_paths", json!([])), ("extra", json!(false)),
            ("batch_id", json!("f".repeat(64))), ("schema", json!("foreign"))] {
            let mut invalid = outer.clone(); invalid[field] = value;
            assert!(handle_publication_owned(&frame, &invalid, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "{field}");
        }
        for action in ["export_approved_documents", "resolve_document_export", "abandon_document_export", "get_public_state"] {
            let mut invalid = export_outer(&op, false); invalid["action"] = json!(action);
            assert!(handle_publication_owned(&frame, &invalid, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "{action}");
        }
        let mut legacy = op.clone(); legacy.publication_role = None;
        assert!(handle_publication_owned(&export_frame(&legacy, &outer, 1, "reconcile", None), &outer,
            &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err());
        let read_outer = results_request_outer(&op, "resolve_history_results");
        let current_outer = json!({"schema":"datasecure-standalone-private-ipc/1", "request_id":"1".repeat(16), "action":"resolve_current_results"});
        for read in [&read_outer, &current_outer] {
            for command in ["publish", "write_body", "acknowledge", "abandon"] {
                assert!(handle_publication_owned(&export_frame(&op, read, 1, command, None), read,
                    &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "{command}");
            }
        }
        for (field, value) in [("batch_id", json!(op.batch_id)), ("source_paths", json!([])),
            ("operation_id", json!(op.operation_id)), ("acknowledge", json!(true)), ("selection", json!([])), ("extra", json!(true))] {
            let mut invalid = current_outer.clone(); invalid[field] = value;
            assert!(handle_publication_owned(&export_frame(&op, &invalid, 1, "reconcile", None), &invalid,
                &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "current {field}");
        }
        for invalid_role in [Value::Null, json!("legacy"), json!(true), json!({ "results": null })] {
            let mut invalid = frame.clone(); invalid["operation"]["publication_role"] = invalid_role;
            assert!(handle_publication_owned(&invalid, &outer, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err());
        }
        // Native configuration created the empty fixed namespaces, not any
        // generation, journal or staged body for these refused callbacks.
        assert_eq!(std::fs::read_dir(fixture.root.join("public/DataSecure-KI-Export")).unwrap().count(), 0);
        assert_eq!(std::fs::read_dir(fixture.data().join(&op.binding.private_name)).unwrap().count(), 0);
    }
    #[test]
    fn result_role_configured_prepare_accepts_only_the_closed_publishing_batch_not_history() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let outer = json!({ "schema": "datasecure-standalone-private-ipc/1", "request_id": "1".repeat(16),
            "action": "publish_result_documents", "batch_id": "a".repeat(64) });
        let frame = json!({ "schema": PUBLICATION_REQUEST, "request_id": outer["request_id"],
            "native_id": "c".repeat(32), "sequence": 1, "action": "prepare_configured_export_root",
            "batch_id": outer["batch_id"], "operation_id": "b".repeat(32),
            "root": fixture.root.join("public"), "setting_sha256": "d".repeat(64),
            "admission": { "kind": "native", "identity": { "volume": "1", "object": "2", "created_ns": "3" } } });
        let result = handle_publication_owned(&frame, &outer, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).unwrap().unwrap();
        assert_eq!(result["ok"], false, "closed valid authorization reaches refusal for absent saved settings");
        for (field, value) in [("action", json!("resolve_history_results")), ("batch_id", json!("e".repeat(64))),
            ("operation_id", json!("b".repeat(32))), ("selection", json!([])), ("acknowledge", json!(true))] {
            let mut invalid = outer.clone(); invalid[field] = value;
            assert!(handle_publication_owned(&frame, &invalid, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "{field}");
        }
        assert_eq!(std::fs::read_dir(fixture.data()).unwrap().count(), 0);
        assert_eq!(std::fs::read_dir(fixture.root.join("public")).unwrap().count(), 0);
    }
    #[test]
    fn configured_root_callback_is_closed_and_bound_to_one_new_export_request() {
        let fixture = ExportFixture::new();
        let lifecycle = Lifecycle::default();
        let guard = lifecycle.begin_native().unwrap();
        let outer = json!({ "request_id": "1".repeat(16), "action": "export_approved_documents",
            "batch_id": "a".repeat(64), "operation_id": "b".repeat(32), "acknowledge": false });
        let frame = json!({ "schema": PUBLICATION_REQUEST, "request_id": outer["request_id"],
            "native_id": "c".repeat(32), "sequence": 1, "action": "prepare_configured_export_root",
            "batch_id": outer["batch_id"], "operation_id": outer["operation_id"],
            "root": fixture.root.join("public"), "setting_sha256": "d".repeat(64),
            "admission": { "kind": "native", "identity": { "volume": "1", "object": "2", "created_ns": "3" } } });
        // A well-shaped frame reaches the broker, which refuses the missing
        // saved setting without provisioning any destination. Malformed or
        // foreign frames must instead fail the closed authorization boundary.
        let mut state = PublicationState::default();
        let response = handle_publication_owned(&frame, &outer, &mut state, Some(&guard), &fixture.data(), None).unwrap().unwrap();
        assert_eq!(response["ok"], false);
        assert_eq!(state.sequence, 1);
        assert!(handle_publication_owned(&frame, &outer, &mut state, Some(&guard), &fixture.data(), None).is_err());
        for (field, value) in [("extra", json!(true)), ("request_id", json!("0".repeat(16))),
            ("sequence", json!(2)), ("native_id", json!("C".repeat(32))),
            ("batch_id", json!("e".repeat(64))), ("operation_id", json!("e".repeat(32)))] {
            let mut invalid = frame.clone(); invalid[field] = value;
            let mut state = PublicationState::default();
            assert!(handle_publication_owned(&invalid, &outer, &mut state, Some(&guard), &fixture.data(), None).is_err(), "{field}");
            assert_eq!(state.sequence, 0);
        }
        for (field, value) in [("action", json!("preview_document_export")),
            ("action", json!("configure_results")), ("acknowledge", json!(true)),
            ("batch_id", json!("e".repeat(64))), ("operation_id", json!("e".repeat(32)))] {
            let mut invalid = outer.clone(); invalid[field] = value;
            assert!(handle_publication_owned(&frame, &invalid, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err(), "outer {field}");
        }
        let mut state = PublicationState { operation: Some(json!({ "already_bound": true })), ..Default::default() };
        assert!(handle_publication_owned(&frame, &outer, &mut state, Some(&guard), &fixture.data(), None).is_err());
        let mut invalid = frame.clone(); invalid["admission"]["extra"] = json!(true);
        assert!(handle_publication_owned(&invalid, &outer, &mut PublicationState::default(), Some(&guard), &fixture.data(), None).is_err());
        assert_eq!(std::fs::read_dir(fixture.data()).unwrap().count(), 0);
        assert_eq!(std::fs::read_dir(fixture.root.join("public")).unwrap().count(), 0);
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
    #[test]
    fn real_native_frames_count_only_successful_final_files_and_never_report_export_success() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let outer = export_outer(&op, false); let mut state = PublicationState::default();
        let tracker = Tracker::default(); let activity = tracker.begin("export_approved_documents");
        let reporter = activity.export_reporter(&op.operation_id).unwrap();
        let partial = export_frame(&op, &outer, 1, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "6865", "final_chunk": false })));
        assert_eq!(publish_frame(&partial, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "receiving");
        assert_eq!(state.native_worker_dispatches, 0, "a pure memory chunk creates no worker");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
        let final_part = export_frame(&op, &outer, 2, "write_body", Some(json!({ "index": 0, "offset": 2, "hex": "6c6c6f", "final_chunk": true })));
        assert_eq!(publish_frame(&final_part, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "staged");
        assert_eq!(state.native_worker_dispatches, 1, "final-body I/O still uses the native worker");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 1);
        let duplicate = export_frame(&op, &outer, 3, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "68656c6c6f", "final_chunk": true })));
        assert_eq!(publish_frame(&duplicate, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "staged");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 1);
        let wrong = export_frame(&op, &outer, 4, "write_body", Some(json!({ "index": 1, "offset": 0, "hex": "77726f6e67", "final_chunk": true })));
        assert_eq!(publish_frame(&wrong, &outer, &mut state, &lifecycle, &fixture, &reporter)["ok"], false);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 1);
        let second = export_frame(&op, &outer, 5, "write_body", Some(json!({ "index": 1, "offset": 0, "hex": "776f726c64", "final_chunk": true })));
        assert_eq!(publish_frame(&second, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "staged");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 2);
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "copying");
        let publish = export_frame(&op, &outer, 6, "publish", None);
        assert_eq!(publish_frame(&publish, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "completed");
        let snapshot = tracker.snapshot();
        assert_eq!(snapshot["state"], "active"); assert_eq!(snapshot["export_progress"]["phase"], "receipt");
        assert!(snapshot["export_progress"].get("completed").is_none());
        let text = snapshot.to_string(); assert!(!text.contains("hello")); assert!(!text.contains("Dokument_"));
        assert!(!text.contains(&fixture.root.to_string_lossy().to_string()));
        assert_eq!(std::fs::read(fixture.root.join(format!("public/DataSecure-KI-Export/Export-{}/Dokument_01.md", op.operation_id))).unwrap(), b"hello");
        drop(activity); assert_eq!(tracker.snapshot()["state"], "idle");

        // A fresh request for an existing copy/ACK does no new staging and
        // cannot manufacture total/total merely from a completed receipt.
        let activity = tracker.begin("export_approved_documents"); let reporter = activity.export_reporter(&op.operation_id).unwrap();
        let outer = export_outer(&op, true); let mut state = PublicationState::default();
        for (sequence, command) in [(1, "reconcile"), (2, "acknowledge")] {
            let frame = export_frame(&op, &outer, sequence, command, None);
            assert_eq!(publish_frame(&frame, &outer, &mut state, &lifecycle, &fixture, &reporter)["ok"], true);
            assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
            assert_eq!(tracker.snapshot()["export_progress"]["phase"], "receipt");
        }
    }
    #[test]
    fn full_size_intermediate_chunks_use_no_worker_or_filesystem_authority() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let mut op = fixture.operation(&lifecycle);
        let bytes = vec![b'x'; 2 * 65536 + 17];
        op.files = vec![ExpectedFile { name: "Dokument_01.md".into(), bytes: bytes.len() as u64,
            sha256: Sha256::digest(&bytes).into() }];
        let outer = export_outer(&op, false); let mut state = PublicationState::default();
        let private = fixture.data().join(&op.binding.private_name);
        for (part, chunk) in bytes.chunks(65536).enumerate() {
            let final_chunk = (part + 1) * 65536 >= bytes.len();
            let frame = export_frame(&op, &outer, part as u32 + 1, "write_body", Some(json!({
                "index": 0, "offset": part * 65536,
                "hex": chunk.iter().map(|byte| format!("{byte:02x}")).collect::<String>(), "final_chunk": final_chunk })));
            let response = handle_publication(&frame, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap();
            assert_eq!(response["status"], if final_chunk { "staged" } else { "receiving" });
            assert_eq!(state.native_worker_dispatches, usize::from(final_chunk));
            if !final_chunk { assert_eq!(std::fs::read_dir(&private).unwrap().count(), 0, "no intent, stage or lock before final I/O"); }
        }
        let frame = export_frame(&op, &outer, 4, "publish", None);
        assert_eq!(handle_publication(&frame, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap()["status"], "completed");
        assert_eq!(state.native_worker_dispatches, 2);
        assert_eq!(std::fs::read(fixture.root.join(format!("public/DataSecure-KI-Export/Export-{}/Dokument_01.md", op.operation_id))).unwrap(), bytes);
    }
    #[test]
    fn inline_chunks_keep_closed_authorization_bounds_and_never_stage_an_early_final_body() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let outer = export_outer(&op, false);
        let first = export_frame(&op, &outer, 1, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "6865", "final_chunk": false })));
        for (field, value) in [("extra", json!(true)), ("request_id", json!("wrong")),
            ("native_id", json!("F".repeat(32))), ("sequence", json!(2))] {
            let mut frame = first.clone(); frame[field] = value;
            let mut state = PublicationState::default();
            assert!(handle_publication(&frame, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).is_err());
            assert_eq!(state.native_worker_dispatches, 0);
        }
        let mut bad_outer = outer.clone(); bad_outer["selection"][0]["output_sha256"] = json!("0".repeat(64));
        assert!(handle_publication(&first, &bad_outer, &mut PublicationState::default(), &lifecycle, &fixture.data(), deadline()).is_err());
        let mut unknown_body = first.clone(); unknown_body["body"]["extra"] = json!(true);
        assert!(handle_publication(&unknown_body, &outer, &mut PublicationState::default(), &lifecycle, &fixture.data(), deadline()).is_err());
        for (field, value) in [("index", json!(200)), ("offset", json!(1)), ("hex", json!("6")),
            ("hex", json!("GG")), ("hex", json!("00".repeat(65537)))] {
            let mut bad_body = first.clone(); bad_body["body"][field] = value;
            let mut rejected = PublicationState::default();
            assert_eq!(handle_publication(&bad_body, &outer, &mut rejected, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap()["ok"], false, "{field}");
            assert_eq!(rejected.native_worker_dispatches, 0);
        }
        let mut state = PublicationState::default();
        assert_eq!(handle_publication(&first, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap()["status"], "receiving");
        let mut changed = export_frame(&op, &outer, 2, "write_body", Some(json!({ "index": 0, "offset": 2, "hex": "6c", "final_chunk": false })));
        changed["operation"]["request_sha256"] = json!("f".repeat(64));
        assert!(handle_publication(&changed, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).is_err());
        let false_final = export_frame(&op, &outer, 2, "write_body", Some(json!({ "index": 0, "offset": 2, "hex": "6c6c6f", "final_chunk": false })));
        assert_eq!(handle_publication(&false_final, &outer, &mut state, &lifecycle, &fixture.data(), deadline()).unwrap().unwrap()["ok"], false);
        assert!(state.body.is_none()); assert_eq!(state.native_worker_dispatches, 0);
        assert_eq!(std::fs::read_dir(fixture.data().join(&op.binding.private_name)).unwrap().count(), 0);
    }
    #[test]
    fn inline_chunks_honor_absolute_deadlines_and_shutdown_after_decoding() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let outer = export_outer(&op, false); let mut state = PublicationState::default();
        let frame = export_frame(&op, &outer, 1, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "6865", "final_chunk": false })));
        assert_eq!(handle_publication(&frame, &outer, &mut state, &lifecycle, &fixture.data(), Instant::now()).unwrap_err(), ipc_transport::TIMEOUT);
        assert!(state.body.is_none()); assert_eq!(state.sequence, 0);
        let shutdown = lifecycle.clone();
        let guard = lifecycle.begin_native_until(deadline()).unwrap().with_test_event(move |phase| {
            if phase == "after_inline_chunk" { shutdown.stopping.store(true, std::sync::atomic::Ordering::Release); }
        });
        assert_eq!(run_inline_publication(&frame, &outer, &mut state, &fixture.data(), guard, None).unwrap_err(), ipc_transport::CLOSED);
        assert!(state.body.is_none()); assert_eq!(state.native_worker_dispatches, 0);
        assert_eq!(std::fs::read_dir(fixture.data().join(&op.binding.private_name)).unwrap().count(), 0);
        assert!(lifecycle.stop(), "inline memory work leaves no outstanding native worker");
    }
    #[test]
    fn inline_result_after_the_original_deadline_is_discarded_without_extending_it() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let outer = export_outer(&op, false); let mut state = PublicationState::default();
        let frame = export_frame(&op, &outer, 1, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "6865", "final_chunk": false })));
        let until = Instant::now() + Duration::from_secs(2);
        let decoded = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)); let observed = decoded.clone();
        let guard = lifecycle.begin_native_until(until).unwrap().with_test_event(move |phase| {
            if phase == "after_inline_chunk" {
                observed.store(true, std::sync::atomic::Ordering::Release);
                std::thread::sleep(until.saturating_duration_since(Instant::now()));
            }
        });
        assert_eq!(run_inline_publication(&frame, &outer, &mut state, &fixture.data(), guard, None).unwrap_err(), ipc_transport::TIMEOUT);
        assert!(decoded.load(std::sync::atomic::Ordering::Acquire), "exercise the post-decode deadline, not just expired ingress");
        assert!(state.body.is_none()); assert_eq!(state.native_worker_dispatches, 0);
        assert_eq!(std::fs::read_dir(fixture.data().join(&op.binding.private_name)).unwrap().count(), 0);
        assert!(lifecycle.stop());
    }
    #[test]
    fn invalid_native_frames_and_foreign_reporters_cannot_create_export_progress() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let outer = export_outer(&op, false); let tracker = Tracker::default(); let activity = tracker.begin("export_approved_documents");
        let reporter = activity.export_reporter(&op.operation_id).unwrap();
        let frame = export_frame(&op, &outer, 1, "reconcile", None);
        for (field, value) in [("request_id", json!("wrong")), ("native_id", json!("A".repeat(32))),
            ("sequence", json!(2)), ("extra", json!("PRIVATE")), ("command", json!("abandon"))] {
            let mut invalid = frame.clone(); invalid[field] = value;
            assert!(handle_publication_with_activity(&invalid, &outer, &mut PublicationState::default(), &lifecycle,
                &fixture.data(), deadline(), Some(reporter.clone())).is_err(), "{field}");
            assert!(tracker.snapshot().get("export_progress").is_none());
        }
        for (field, value) in [("action", json!("preview_document_export")), ("batch_id", json!("f".repeat(64))),
            ("operation_id", json!("f".repeat(32))), ("selection", json!([{ "output_sha256": "0".repeat(64) }]))] {
            let mut invalid = outer.clone(); invalid[field] = value;
            assert!(handle_publication_with_activity(&frame, &invalid, &mut PublicationState::default(), &lifecycle,
                &fixture.data(), deadline(), Some(reporter.clone())).is_err(), "outer {field}");
            assert!(tracker.snapshot().get("export_progress").is_none());
        }
        let wrong_body = export_frame(&op, &outer, 1, "write_body", Some(json!({ "index": 0, "offset": 0, "hex": "PRIVATE", "final_chunk": true })));
        assert_eq!(publish_frame(&wrong_body, &outer, &mut PublicationState::default(), &lifecycle, &fixture, &reporter)["ok"], false);
        assert!(tracker.snapshot().get("export_progress").is_none());
        drop(activity);
        let foreign = tracker.begin("export_approved_documents"); let reporter = foreign.export_reporter(&"f".repeat(32)).unwrap();
        assert_eq!(publish_frame(&frame, &outer, &mut PublicationState::default(), &lifecycle, &fixture, &reporter)["ok"], true);
        assert!(tracker.snapshot().get("export_progress").is_none(), "matching tracker token cannot substitute another operation ID");
    }
    #[test]
    fn native_prepared_resume_verifies_without_inventing_files_written_by_the_new_request() {
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        {
            let guard = lifecycle.begin_native().unwrap();
            for (index, bytes) in [b"hello", b"world"].into_iter().enumerate() {
                crate::native_export_broker::write_body(&fixture.data(), &op, index, bytes, &guard).unwrap();
            }
            let private = Directory::open_existing(&fixture.data().join(&op.binding.private_name), None).unwrap();
            let target = Directory::open_existing(&fixture.root.join("public/DataSecure-KI-Export"), None).unwrap();
            let request = crate::native_export_workspace::Request::new(op.batch_id.clone(), op.operation_id.clone(),
                op.request_sha256.clone(), op.processing_mode.clone(), op.files.clone(), &private, &target).unwrap();
            let workspace = crate::native_export_workspace::Workspace::open(&private, &target, request, &guard).unwrap();
            workspace.transaction(&guard).unwrap().prepare().unwrap();
        }
        let tracker = Tracker::default(); let activity = tracker.begin("export_approved_documents");
        let reporter = activity.export_reporter(&op.operation_id).unwrap();
        let outer = export_outer(&op, false); let mut state = PublicationState::default();
        let reconcile = export_frame(&op, &outer, 1, "reconcile", None);
        assert_eq!(publish_frame(&reconcile, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "prepared");
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "verifying");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
        let publish = export_frame(&op, &outer, 2, "publish", None);
        assert_eq!(publish_frame(&publish, &outer, &mut state, &lifecycle, &fixture, &reporter)["status"], "completed");
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "receipt");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
    }
    #[test]
    fn timed_out_native_worker_cannot_change_a_successor_activity_after_actual_rename() {
        use std::sync::{Arc, Mutex};
        let fixture = ExportFixture::new(); let lifecycle = Lifecycle::default(); let op = fixture.operation(&lifecycle);
        let guard = lifecycle.begin_native().unwrap();
        for (index, bytes) in [b"hello", b"world"].into_iter().enumerate() {
            crate::native_export_broker::write_body(&fixture.data(), &op, index, bytes, &guard).unwrap();
        }
        drop(guard);
        let tracker = Tracker::default(); let activity = tracker.begin("export_approved_documents");
        let reporter = activity.export_reporter(&op.operation_id).unwrap();
        let (arrive, arrived) = mpsc::channel(); let (release, released) = mpsc::channel();
        let released = Arc::new(Mutex::new(released));
        let deadline = Instant::now() + Duration::from_secs(2);
        let guard = lifecycle.begin_native_until(deadline).unwrap().with_test_event(move |phase| {
            if phase == "after_rename" { arrive.send(()).unwrap(); released.lock().unwrap().recv().unwrap(); }
        });
        let outer = export_outer(&op, false); let frame = export_frame(&op, &outer, 1, "publish", None);
        let worker_lifecycle = lifecycle.clone(); let data = fixture.data();
        let waiting = std::thread::spawn(move || PublicationWorker { lifecycle: &worker_lifecycle, data: &data,
            deadline, guard, reporter: Some(reporter) }.run(&frame, &outer, &mut PublicationState::default()));
        arrived.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "verifying");
        assert_eq!(waiting.join().unwrap().unwrap_err(), ipc_transport::TIMEOUT);
        drop(activity);
        let next = tracker.begin("export_approved_documents"); let next_reporter = next.export_reporter(&op.operation_id).unwrap();
        next_reporter.phase(ExportPhase::Preparing, 2);
        release.send(()).unwrap();
        assert!(lifecycle.stop(), "the real native worker must end before its fixture is removed");
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "preparing");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
        assert_eq!(std::fs::read(fixture.root.join(format!("public/DataSecure-KI-Export/Export-{}/Dokument_02.md", op.operation_id))).unwrap(), b"world");
    }
}
