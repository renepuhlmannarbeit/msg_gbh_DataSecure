//! Explicit local support snapshot, independent of Core readiness. JSON is
//! intentional: no archive parser, subprocess, raw-file copy or new dependency.
//! Disk logs are untrusted; only closed, content-free records are reconstructed.
use crate::export_directory::Directory;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, io, path::Path, sync::atomic::{AtomicBool, Ordering}};

const MAX_FILES: usize = 24;
const MAX_FILE_BYTES: usize = 256 * 1024;
const MAX_RECORDS: usize = 4096;
const MAX_LINES: usize = 8192;
const MAX_LINE_BYTES: usize = 4096;
const MAX_OUTPUT_BYTES: usize = 4 * 1024 * 1024;
static SAVING: AtomicBool = AtomicBool::new(false);
pub(crate) struct SaveGuard;
impl SaveGuard {
    pub fn begin() -> Option<Self> {
        SAVING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).ok().map(|_| Self)
    }
}
impl Drop for SaveGuard { fn drop(&mut self) { SAVING.store(false, Ordering::Release); } }
fn unsafe_io() -> io::Error { io::Error::other("DIAGNOSTIC_BUNDLE_UNAVAILABLE") }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    schema: String, time_ms: u64, component: String, event: String, outcome: String,
    session_id: Option<String>, request_id: Option<String>, process_id: Option<u32>,
    product_version: Option<String>, build_id: Option<String>, runtime_target: Option<String>, os_version: Option<String>,
    action: Option<String>, error_code: Option<String>, phase: Option<String>,
    completed_count: Option<u64>, total_count: Option<u64>, journal_count: Option<u64>, export_count: Option<u64>,
    recovery_requested: Option<bool>, elapsed_ms: Option<u64>,
    configure_stage: Option<crate::native_export_broker::ConfigureStage>,
    io_error_kind: Option<String>, raw_os_error: Option<i32>,
    controlled_create: Option<crate::export_directory::ControlledDirectoryCreateFailure>,
}
const EVENTS: &str = "core_quarantine_state app_quarantine_state sidecar_retirement_finished drop_received drop_rejected drop_admitted runtime_component_unavailable sidecar_starting runtime_resolution_failed runtime_resolved sidecar_spawn_failed sidecar_spawned sidecar_stderr_classified sidecar_bootstrap_failed sidecar_diagnostic_unavailable sidecar_bootstrap_ready admission_progress ipc_request_started ipc_request_failed ipc_request_queue_busy sidecar_start_blocked ipc_request_sent sidecar_retirement_failed ipc_response_invalid ipc_response_error ipc_response_ok os_open_requested os_open_helper_failed os_open_handoff_failed os_open_handoff_confirmed picker_requested picker_blocked picker_invocation_started picker_failed picker_no_selection picker_completed local_target_validation_failed diagnostic_folder_opened diagnostic_folder_open_handoff_confirmed ui_picker_blocked frontend_ready review_window_open_failed sidecar_shutdown application_started webview_profile_ready webview_profile_ready workspace_page_loaded setup_started setup_completed application_run_failed page_loaded review_page_loaded core_probe_node core_probe_preloader sidecar_entry sidecar_imports_ready sidecar_import_failed sidecar_started native_export_phase runtime_integrity_checked service_initialized service_initialization_failed local_target_requested local_target_resolved local_target_resolution_failed request_received response_ready private_ipc_invalid private_ipc_output_failed request_chain_failed private_ipc_truncated private_ipc_closed private_ipc_input_failed history_capture_started history_capture_finished product_bootstrap_started product_bootstrap_finished diagnostic_bundle_requested diagnostic_bundle_saved diagnostic_bundle_cancelled diagnostic_bundle_failed";
fn member(value: &str, vocabulary: &str) -> bool { vocabulary.split_whitespace().any(|item| item == value) }
const CONFIGURE_EVENTS: &str = "native_configure_failed";
const CONTROLLED_CREATE_EVENTS: &str = "native_controlled_create_failed";
const BATCH_WORKER_EVENTS: &str = "batch_worker_failed";
const BATCH_WORKER_PHASES: &str = "item_epoch_release registry_finalize local_delivery_verify executor_lease_release processing result_export_prepare result_export_claim result_export_plan result_export_copy result_export_claim_release";
const CAPTURE_EVENTS: &str = "history_capture_full history_capture_reused";
const PROBE_EVENTS: &str = "core_probe_observer core_probe_cleanup";
const RECOVERY_EVENTS: &str = "sidecar_exited_before_response";
const OWNERSHIP_EVENTS: &str = "ownership_control_check_started ownership_control_check_finished ownership_control_check_failed private_namespace_bound";
const OUTCOMES: &str = "ready failed progress blocked unavailable started stopped error cancelled waiting bootstrapping validating rejected accepted no_selection";
fn literal(source: &str, value: &str) -> bool {
    source.contains(&format!("\"{value}\"")) || source.contains(&format!("'{value}'"))
}
fn code(value: &str) -> bool {
    // These are compile-time product sources, not runtime file reads. Only
    // complete fixed code literals qualify; no prefix-based vendor text pass.
    value.len() <= 100 && value.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_') &&
        [include_str!("main.rs"), include_str!("ipc_transport.rs"), include_str!("startup_diagnostics.rs"), include_str!("diagnostic_probe.rs"),
         include_str!("../../../../plugins/data-secure/server/core/desktop-error-contract.js"),
         include_str!("../../../../plugins/data-secure/server/standalone/desktop-sidecar.js")]
            .iter().any(|source| literal(source, value)) &&
        ["STANDALONE_", "SOURCE_", "STARTUP_", "DOCUMENT_", "AI_EXPORT_", "RESULT_", "CONTENT_", "OCR_", "BATCH_", "RUNTIME_", "DURABLE_", "LOCAL_REVIEW_", "DESKTOP_IPC_", "PROCESSING_", "MARKDOWN_", "UNSAFE_STORAGE_"].iter().any(|prefix| value.starts_with(prefix))
}
fn catalogue_literal(source: &str, start: &str, end: &str, value: &str) -> bool {
    source.split_once(start).and_then(|(_, tail)| tail.split_once(end))
        .is_some_and(|(body, _)| literal(body, value))
}
fn batch_worker_code(value: &str) -> bool {
    // Exact compile-time catalogue regions, including spread-in converter and
    // cause catalogues. No broad prefix or arbitrary source literal is enough.
    if value.is_empty() || value.len() > 100 || !value.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_') {
        return false;
    }
    let desktop = include_str!("../../../../plugins/data-secure/server/core/desktop-error-contract.js");
    let reason = include_str!("../../../../plugins/data-secure/server/core/document-result-grade.js");
    let conversion = include_str!("../../../../plugins/data-secure/server/core/conversion-worker-contract.js");
    let workflow = include_str!("../../../../plugins/data-secure/server/gateway/diagnostic-causes.js");
    let cause_key = format!("{value}: ");
    catalogue_literal(desktop, "const DESKTOP_ERROR_CODES = Object.freeze([", "]);", value) ||
        catalogue_literal(reason, "const REASON_CODES = new Set([", "]);", value) ||
        catalogue_literal(conversion, "LIFECYCLE_ERROR_CODES: Object.freeze([", "]),", value) ||
        catalogue_literal(conversion, "  ERROR_CODES: Object.freeze([", "])", value) ||
        catalogue_literal(workflow, "const WORKFLOW_ERROR_CODES = Object.freeze([...new Set([", "])]);", value) ||
        workflow.split_once("const CAUSES = Object.freeze({").and_then(|(_, tail)| tail.split_once("});"))
            .is_some_and(|(body, _)| body.lines().any(|line| line.trim_start().starts_with(&cause_key)))
}
fn action(value: &str) -> bool {
    value.len() <= 64 && value.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') &&
        (literal(include_str!("ipc_activity.rs"), value) || member(value,
            "select_files select_folder open_history_results open_history_ledger open_history_identity_mapping open_identity_mappings_directory open_current_results open_local_ledger open_diagnostic_folder save_diagnostic_bundle"))
}
fn hex(value: &str) -> bool { (16..=64).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn numeric_version(value: &str) -> bool {
    value.len() <= 24 && !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit() || b == b'.' || b == b'-' || b == b'r' || b == b'c')
}
#[derive(Default)]
struct Correlation { sessions: HashMap<String, usize>, requests: HashMap<String, usize> }
fn index(map: &mut HashMap<String, usize>, value: String) -> usize {
    let next = map.len() + 1; *map.entry(value).or_insert(next)
}
fn sanitize(bytes: &[u8], component: &str, correlation: &mut Correlation) -> Option<Value> {
    if bytes.len() > MAX_LINE_BYTES { return None; }
    // Derived Deserialize rejects duplicate fields as well as unknown fields.
    let record: Record = serde_json::from_slice(bytes).ok()?;
    if record.schema != "datasecure-standalone-interaction/1" || record.component != component ||
        record.time_ms > 4_102_444_800_000 || !(member(&record.event, EVENTS) || member(&record.event, CAPTURE_EVENTS) || member(&record.event, PROBE_EVENTS) || member(&record.event, RECOVERY_EVENTS) || member(&record.event, OWNERSHIP_EVENTS) || member(&record.event, CONFIGURE_EVENTS) || member(&record.event, BATCH_WORKER_EVENTS) || member(&record.event, CONTROLLED_CREATE_EVENTS)) ||
        !member(&record.outcome, OUTCOMES) ||
        record.session_id.as_deref().is_some_and(|v| !hex(v)) ||
        record.request_id.as_deref().is_some_and(|v| !hex(v)) ||
        record.action.as_deref().is_some_and(|v| !action(v)) ||
        record.error_code.as_deref().is_some_and(|v| if record.event == "batch_worker_failed" { !batch_worker_code(v) } else { !code(v) }) ||
        record.phase.as_deref().is_some_and(|v| !member(v, if record.event == "batch_worker_failed"
            { BATCH_WORKER_PHASES } else { "reconcile staging publish acknowledge abandon" })) ||
        record.completed_count.is_some_and(|n| n > 200) || record.total_count.is_some_and(|n| n > 200) ||
        record.journal_count.is_some_and(|n| n > 1_000_000) || record.export_count.is_some_and(|n| n > 1_000_000) ||
        record.elapsed_ms.is_some_and(|n| n > 86_400_000) ||
        record.product_version.as_deref().is_some_and(|v| !numeric_version(v)) ||
        record.os_version.as_deref().is_some_and(|v| v.len() > 16 || !v.bytes().all(|b| b.is_ascii_digit() || b == b'.')) ||
        record.build_id.as_deref().is_some_and(|v| v != "unidentified" && (v.len() != 40 || !hex(v))) ||
        record.runtime_target.as_deref().is_some_and(|v| !member(v, "windows-x86_64 windows-aarch64 macos-x86_64 macos-aarch64 linux-x86_64 linux-aarch64")) {
        return None;
    }
    if record.event == "batch_worker_failed" && (component != "sidecar" || record.outcome != "failed" ||
        record.phase.is_none() || record.error_code.is_none() ||
        record.session_id.is_some() || record.request_id.is_some() || record.process_id.is_some() ||
        record.product_version.is_some() || record.build_id.is_some() || record.runtime_target.is_some() || record.os_version.is_some() ||
        record.action.is_some() || record.completed_count.is_some() || record.total_count.is_some() ||
        record.journal_count.is_some() || record.export_count.is_some() || record.recovery_requested.is_some() || record.elapsed_ms.is_some()) {
        return None;
    }
    let configuring = record.event == "native_configure_failed";
    if configuring {
        if component != "desktop" || record.action.as_deref() != Some("configure_results") ||
            record.outcome != "failed" || record.configure_stage.is_none() || record.error_code.is_some() ||
            record.io_error_kind.as_deref().is_none_or(|kind| !crate::native_export_broker::valid_configure_io_kind(kind)) {
            return None;
        }
    } else if record.configure_stage.is_some() || record.io_error_kind.is_some() || record.raw_os_error.is_some() {
        return None;
    }
    let controlled_create = record.event == "native_controlled_create_failed";
    if controlled_create {
        if component != "desktop" || record.outcome != "failed" || record.action.is_some() ||
            record.error_code.is_some() || record.phase.is_some() ||
            record.controlled_create.as_ref().is_none_or(|failure| !failure.is_failure()) {
            return None;
        }
    } else if record.controlled_create.is_some() {
        return None;
    }
    let mut output = json!({ "time_ms": record.time_ms, "event": record.event, "outcome": record.outcome });
    if controlled_create { output["controlled_create"] = json!(record.controlled_create); }
    if configuring {
        output["configure_stage"] = json!(record.configure_stage);
        output["io_error_kind"] = json!(record.io_error_kind);
        output["raw_os_error"] = json!(record.raw_os_error);
    }
    // Correlation is retained, but attacker-controlled opaque identifiers and
    // old build identifiers are never copied into the support file.
    if let Some(value) = record.session_id { output["session_index"] = json!(index(&mut correlation.sessions, value)); }
    if let Some(value) = record.request_id { output["request_index"] = json!(index(&mut correlation.requests, value)); }
    macro_rules! optional { ($($field:ident),*) => { $(if let Some(value) = record.$field { output[stringify!($field)] = json!(value); })* }; }
    // Keep validated version/target facts from earlier sessions: a bundle may
    // be saved after an update, so its current build header cannot identify the
    // version that failed previously. These remain untrusted recorded facts.
    optional!(process_id, product_version, runtime_target, os_version, action, error_code, phase, completed_count, total_count, journal_count, export_count, recovery_requested, elapsed_ms);
    Some(output)
}
fn component(name: &str) -> Option<&'static str> {
    for (prefix, kind) in [("desktop-interactions", "desktop"), ("sidecar-interactions", "sidecar")] {
        if name == format!("{prefix}.jsonl") { return Some(kind); }
        if let Some(suffix) = name.strip_prefix(&format!("{prefix}.")).and_then(|v| v.strip_suffix(".jsonl")) {
            let valid = if kind == "sidecar" {
                let parts: Vec<_> = suffix.split('.').collect();
                (parts.len() == 1 || parts.len() == 2 && matches!(parts[1], "2" | "3" | "4" | "5" | "6" | "7" | "8")) &&
                    parts[0].len() == 32 && hex(parts[0])
            } else {
                let parts: Vec<_> = suffix.split('.').collect();
                (parts.len() == 2 || parts.len() == 3 && matches!(parts[2], "2" | "3" | "4" | "5" | "6" | "7" | "8")) &&
                    !parts[0].is_empty() && parts[0].len() <= 10 && parts[0].bytes().all(|b| b.is_ascii_digit()) &&
                    parts[1].len() == 32 && hex(parts[1])
            };
            if valid { return Some(kind); }
        }
    }
    if name == "DataSecure-Startdiagnose.txt" { return Some("startup"); }
    if let Some(suffix) = name.strip_prefix("DataSecure-Startdiagnose-").and_then(|v| v.strip_suffix(".txt")) {
        let parts: Vec<_> = suffix.split('-').collect();
        if parts.len() == 3 && !parts[0].is_empty() && parts[0].len() <= 10 && parts[0].bytes().all(|b| b.is_ascii_digit()) &&
            parts[1].len() == 32 && hex(parts[1]) && matches!(parts[2], "0" | "1" | "2" | "3") { return Some("startup"); }
    }
    None
}

pub(crate) fn collect(path: &Path) -> Value {
    collect_with_segments(path, crate::diagnostic_log::current_segment(), crate::diagnostic_log::sidecar_segments())
}
fn collect_with_segments(path: &Path, current: Option<String>, sidecars: Vec<String>) -> Value {
    let mut sources = Vec::new();
    let mut records = 0usize; let mut lines = 0usize;
    let mut correlation = Correlation::default();
    let directory = Directory::open_existing(path, None);
    let mut inventory = "available"; let mut ignored = 0; let mut source_limit = false;
    let mut names = match &directory {
        Ok(directory) => match directory.diagnostic_names() {
            Ok(names) => names,
            Err(_) => { inventory = "unreadable_or_limit"; vec!["desktop-interactions.jsonl".into(), "sidecar-interactions.jsonl".into()] }
        },
        Err(_) => { inventory = "missing_or_unreadable"; Vec::new() }
    };
    names.retain(|name| { let known = component(name).is_some(); if !known { ignored += 1; } known });
    if let Some(name) = &current {
        if component(name).is_some() && !names.contains(name) { names.push(name.clone()); }
    }
    // Native-supplied bounded owner leaves survive inventory overflow. Probe
    // only the closed grammar, never a caller-supplied pathname or arbitrary
    // directory traversal. Missing unused rotation leaves are not log failures.
    for name in sidecars.iter().take(128) {
        if component(name) == Some("sidecar") && !names.contains(name) &&
            directory.as_ref().is_ok_and(|dir| dir.diagnostic_modified(name).is_ok()) {
            names.push(name.clone());
        }
    }
    // Native mtime is only a best-effort recency hint, not authenticity proof.
    // The actual current desktop segment takes priority even if it is still
    // open and Windows has not yet committed its last-write timestamp.
    let mut ranked: Vec<_> = names.into_iter().map(|name| {
        let stamp = directory.as_ref().ok().and_then(|dir| dir.diagnostic_modified(&name).ok()).unwrap_or(0);
        let rank = if current.as_ref() == Some(&name) { 0 } else {
            sidecars.iter().take(128).position(|known| known == &name).map(|index| index + 1).unwrap_or(129)
        };
        (rank, std::cmp::Reverse(stamp), name)
    }).collect();
    ranked.sort();
    let mut names: Vec<_> = ranked.into_iter().map(|(_, _, name)| name).collect();
    // Keep the newest Sidecar beside the active desktop segment. A history
    // full of desktop retries must not crowd out the only Core-side evidence.
    if let Some(position) = names.iter().position(|name| component(name) == Some("sidecar")) {
        let name = names.remove(position); names.insert(names.len().min(1), name);
    }
    let discovered: Vec<_> = names.iter().filter_map(|name| component(name)).collect();
    if names.len() > MAX_FILES { source_limit = true; names.truncate(MAX_FILES); }
    for kind in ["desktop", "sidecar", "startup"] {
        if !names.iter().any(|name| component(name) == Some(kind)) {
            sources.push(json!({ "component": kind, "status": if discovered.contains(&kind) { "omitted_by_limit" }
                else if inventory == "available" && kind == "startup" { "missing_optional" }
                else if inventory == "available" { "missing" } else { "unavailable" } }));
        }
    }
    if let Ok(directory) = directory {
        for name in names {
            let kind = component(&name).expect("filtered fixed diagnostic name");
            let mut source = json!({ "component": kind, "index": sources.len() + 1, "status": "unreadable_or_unsafe" });
            if let Ok((bytes, truncated, grew)) = directory.diagnostic_snapshot(&name, MAX_FILE_BYTES) {
                source["status"] = json!("snapshot");
                source["bytes_read"] = json!(bytes.len()); source["byte_limit_reached"] = json!(truncated);
                source["grew_during_read"] = json!(grew);
                let mut accepted = Vec::new(); let mut rejected = 0; let mut partial_line = false;
                if kind == "startup" {
                    // Startup reports can contain arbitrary edited prose. Only
                    // one of the exact startup codes is extracted, never prose.
                    if let Ok(text) = std::str::from_utf8(&bytes) {
                        for line in text.lines().take(32) {
                            if let Some(value) = line.strip_prefix("Fehlercode: ") {
                                if literal(include_str!("startup_diagnostics.rs"), value) && code(value) {
                                    accepted.push(json!({ "event": "startup_report", "error_code": value })); break;
                                }
                            }
                        }
                    }
                    if accepted.is_empty() { rejected += 1; }
                } else {
                    let mut fragments: Vec<_> = bytes.split_inclusive(|b| *b == b'\n').collect();
                    if truncated && !fragments.is_empty() { fragments.remove(0); }
                    if !bytes.is_empty() && !bytes.ends_with(b"\n") { partial_line = true; }
                    for line in fragments.into_iter().rev() {
                        if records >= MAX_RECORDS || lines >= MAX_LINES { break; }
                        lines += 1;
                        if !line.ends_with(b"\n") { partial_line = true; continue; }
                        if let Some(value) = sanitize(line, kind, &mut correlation) { accepted.push(value); records += 1; }
                        else { rejected += 1; }
                    }
                    accepted.reverse();
                }
                source["initial_fragment_discarded"] = json!(truncated);
                source["rejected_lines"] = json!(rejected); source["incomplete_last_line"] = json!(partial_line);
                source["record_limit_reached"] = json!(records >= MAX_RECORDS || lines >= MAX_LINES);
                source["records"] = json!(accepted);
            }
            sources.push(source);
        }
    }
    let mut build = json!({ "product_version": env!("CARGO_PKG_VERSION"), "build_id": crate::build_id(),
        "os": std::env::consts::OS, "architecture": std::env::consts::ARCH });
    #[cfg(target_os = "macos")]
    if let Some(version) = crate::macos_product_version() { build["os_version"] = json!(version); }
    let _ = &mut build;
    json!({ "schema": "datasecure-diagnostic-bundle/1", "build": build,
        "created_at_ms": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(),
        "snapshot": "bounded_non_atomic_tail", "selection": "native_owner_segments_then_best_effort_native_mtime",
        "trust": "untrusted_logs_resanitized_not_authenticity_proof",
        "inventory": inventory, "source_limit_reached": source_limit, "ignored_entries": ignored,
        "desktop_sink_status": crate::diagnostic_log::status(), "desktop_writer": crate::diagnostic_log::snapshot(), "sources": sources,
        "limits": { "files": MAX_FILES, "bytes_per_file": MAX_FILE_BYTES, "records": MAX_RECORDS, "lines": MAX_LINES, "line_bytes": MAX_LINE_BYTES },
        "external_disclosure": false, "contains_document_contents": false })
}
pub(crate) fn save(source: &Path, destination: &Path) -> io::Result<bool> {
    let bundle = collect(source);
    let partial = bundle["inventory"] != "available" || bundle["source_limit_reached"] == true ||
        bundle["desktop_sink_status"] == "unavailable" || bundle["desktop_writer"]["pending_records"].as_u64().unwrap_or(0) > 0 ||
        bundle["desktop_writer"]["dropped_records"].as_u64().unwrap_or(0) > 0 || bundle["sources"].as_array().ok_or_else(unsafe_io)?.iter().any(|part|
            part["status"] != "snapshot" && part["status"] != "missing_optional" || part["byte_limit_reached"] == true || part["grew_during_read"] == true ||
            part["incomplete_last_line"] == true || part["record_limit_reached"] == true || part["rejected_lines"].as_u64().unwrap_or(0) > 0);
    let bytes = serde_json::to_vec(&bundle).map_err(|_| unsafe_io())?;
    if bytes.len() > MAX_OUTPUT_BYTES { return Err(unsafe_io()); }
    let parent = destination.parent().ok_or_else(unsafe_io)?;
    let name = destination.file_name().and_then(|name| name.to_str()).ok_or_else(unsafe_io)?;
    if !name.ends_with(".json") { return Err(unsafe_io()); }
    // Native-picked parent, then exclusively create relative to its held
    // nofollow directory. Existing files/links are never overwritten.
    let directory = Directory::open_existing(parent, None)?;
    directory.write_new(name, &bytes)?;
    directory.sync()?;
    Ok(partial)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;
    static ROOT_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    fn root() -> std::path::PathBuf {
        root_at(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())
    }
    fn root_at(timestamp: u128) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("datasecure-bundle-test-{}-{}-{}", std::process::id(),
            timestamp, ROOT_SEQUENCE.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir(&path).unwrap(); path
    }
    fn cleanup(path: std::path::PathBuf) {
        assert_eq!(path.parent().unwrap(), std::env::temp_dir());
        assert!(path.file_name().unwrap().to_string_lossy().starts_with("datasecure-bundle-test-"));
        assert!(!std::fs::symlink_metadata(&path).unwrap().file_type().is_symlink());
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn parallel_roots_with_identical_timestamps_remain_distinct_until_joined() {
        struct CreatedRoots(Vec<std::path::PathBuf>);
        impl Drop for CreatedRoots {
            fn drop(&mut self) { for path in self.0.drain(..) { cleanup(path); } }
        }
        let timestamp = 1_700_000_000_123_456_000;
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let handles = [0, 1].map(|_| {
            let barrier = barrier.clone();
            std::thread::spawn(move || { barrier.wait(); root_at(timestamp) })
        });
        // Keep both exclusively created directories until both workers have joined.
        let results = handles.map(|handle| handle.join());
        let mut roots = CreatedRoots(Vec::new());
        roots.0.extend(results.into_iter().flatten());
        assert_eq!(roots.0.len(), 2, "both concurrent allocations must succeed");
        assert_ne!(roots.0[0], roots.0[1]);
        let prefix = format!("datasecure-bundle-test-{}-{timestamp}-", std::process::id());
        for path in &roots.0 {
            assert_eq!(path.parent().unwrap(), std::env::temp_dir());
            assert!(path.file_name().unwrap().to_string_lossy().strip_prefix(&prefix)
                .and_then(|sequence| sequence.parse::<u64>().ok()).is_some());
            let metadata = std::fs::symlink_metadata(path).unwrap();
            assert!(metadata.is_dir());
            assert!(!metadata.file_type().is_symlink());
        }
    }
    fn record() -> Value { json!({ "schema": "datasecure-standalone-interaction/1", "time_ms": 10,
        "component": "desktop", "event": "sidecar_bootstrap_failed", "outcome": "failed",
        "session_id": "abcdef0123456789", "error_code": "STANDALONE_SIDECAR_SIGNAL_TRAP" }) }
    #[test]
    fn closed_schema_reconstructs_only_fixed_values_and_remaps_identifiers() {
        let mut raw = record(); let mut correlation = Correlation::default();
        raw["product_version"] = json!("3.2.0-rc161");
        raw["runtime_target"] = json!("macos-aarch64");
        raw["os_version"] = json!("26.2");
        let output = sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut correlation).unwrap();
        assert_eq!(output["error_code"], "STANDALONE_SIDECAR_SIGNAL_TRAP");
        assert_eq!(output["product_version"], "3.2.0-rc161");
        assert_eq!(output["runtime_target"], "macos-aarch64");
        assert_eq!(output["os_version"], "26.2");
        for event in CAPTURE_EVENTS.split_whitespace().chain(OWNERSHIP_EVENTS.split_whitespace()) {
            let mut capture = raw.clone(); capture["event"] = json!(event);
            capture["component"] = json!("sidecar");
            assert!(sanitize(&serde_json::to_vec(&capture).unwrap(), "sidecar", &mut correlation).is_some());
        }
        assert_eq!(output["session_index"], 1);
        assert!(!output.to_string().contains("abcdef0123456789"));
        for (key, value) in [("path", json!("PRIVATE/source.pdf")), ("event", json!("PRIVATE/source.pdf")),
            ("error_code", json!("STANDALONE_PRIVATE_PERSON")), ("action", json!("private_person")),
            ("elapsed_ms", json!(86_400_001)), ("total_count", json!(201)), ("phase", json!("PRIVATE")),
            ("product_version", json!("PRIVATE/source.pdf")), ("runtime_target", json!("PRIVATE")),
            ("os_version", json!("PRIVATE"))] {
            let mut tampered = raw.clone(); tampered[key] = value;
            assert!(sanitize(&serde_json::to_vec(&tampered).unwrap(), "desktop", &mut correlation).is_none(), "{key}");
        }
        let duplicate = serde_json::to_string(&raw).unwrap().replacen("{", "{\"outcome\":\"PRIVATE\",", 1);
        assert!(sanitize(duplicate.as_bytes(), "desktop", &mut correlation).is_none());
        assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "sidecar", &mut correlation).is_none());
    }
    #[test]
    fn fixed_production_events_and_recovery_picker_outcomes_survive_closed_sanitizer() {
        let mut count = 0;
        for (source, calls, component) in [
            (include_str!("main.rs"), &["diagnostic_event(", "diagnostic_process_event(", "diagnostic_ipc_event("][..], "desktop"),
            (include_str!("../../../../plugins/data-secure/server/standalone/desktop-sidecar.js"), &["diagnosticEvent("][..], "sidecar"),
            (include_str!("../../../../plugins/data-secure/server/standalone/application-service.js"), &["startupEvent("][..], "sidecar")
        ] {
            for call in calls {
                for (_, rest) in source.match_indices(call).map(|(index, _)| (index, source[index + call.len()..].trim_start())) {
                    let Some(quote) = rest.chars().next().filter(|ch| matches!(ch, '\'' | '"')) else { continue; };
                    let Some(end) = rest[1..].find(quote) else { continue; };
                    let event = &rest[1..end + 1];
                    let mut raw = record(); raw["component"] = json!(component); raw["event"] = json!(event);
                    if event == "batch_worker_failed" {
                        raw["outcome"] = json!("failed"); raw["phase"] = json!("processing");
                        raw["error_code"] = json!("STANDALONE_OPERATION_FAILED");
                        raw.as_object_mut().unwrap().remove("session_id");
                    }
                    assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), component, &mut Correlation::default()).is_some(), "{event}");
                    count += 1;
                }
            }
        }
        assert!(count > 60, "producer inventory must actually exercise product call sites");
        // These values are conditional/dynamic arguments in the real producer.
        for (event, outcome) in [("sidecar_exited_before_response", "failed"), ("picker_no_selection", "no_selection"),
            ("core_probe_node", "ready"), ("core_probe_preloader", "failed"), ("history_capture_full", "ready"),
            ("history_capture_reused", "ready"), ("private_ipc_closed", "stopped")] {
            assert!(literal(include_str!("main.rs"), event) ||
                literal(include_str!("../../../../plugins/data-secure/server/standalone/desktop-sidecar.js"), event) ||
                literal(include_str!("../../../../plugins/data-secure/server/standalone/application-service.js"), event));
            let mut raw = record(); raw["event"] = json!(event); raw["outcome"] = json!(outcome);
            assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).is_some(), "{event}/{outcome}");
        }
        let mut raw = record(); raw["outcome"] = json!("vendor private path");
        assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).is_none());
    }
    #[test]
    fn diagnostic_probe_cleanup_codes_survive_without_accepting_vendor_codes() {
        for error in ["STANDALONE_CORE_PROBE_OBSERVER_UNAVAILABLE", "STANDALONE_CORE_PROBE_END_UNCONFIRMED",
            "STANDALONE_CORE_PROBE_KILL_DENIED", "STANDALONE_CORE_PROBE_KILL_FAILED",
            "STANDALONE_CORE_PROBE_TIMEOUT", "STANDALONE_CORE_PROBE_WAIT_FAILED"] {
            for event in ["core_probe_observer", "core_probe_cleanup"] {
                let mut raw = record(); raw["event"] = json!(event); raw["outcome"] = json!("failed");
                raw["error_code"] = json!(error);
                let output = sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).unwrap();
                assert_eq!(output["error_code"], error);
            }
        }
        let mut raw = record(); raw["event"] = json!("core_probe_cleanup"); raw["outcome"] = json!("failed");
        raw["error_code"] = json!("STANDALONE_CORE_PROBE_VENDOR_TEXT");
        assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).is_none());
    }
    #[test]
    fn configure_diagnostics_keep_only_the_closed_native_stage_kind_and_integer_os_code() {
        let raw = json!({ "schema": "datasecure-standalone-interaction/1", "time_ms": 10,
            "component": "desktop", "event": "native_configure_failed", "outcome": "failed",
            "action": "configure_results", "configure_stage": "private_create",
            "io_error_kind": "PermissionDenied", "raw_os_error": 5 });
        let output = sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).unwrap();
        assert_eq!(output["configure_stage"], "private_create");
        assert_eq!(output["io_error_kind"], "PermissionDenied");
        assert_eq!(output["raw_os_error"], 5);
        let mut no_os = raw.clone(); no_os["raw_os_error"] = Value::Null;
        assert_eq!(sanitize(&serde_json::to_vec(&no_os).unwrap(), "desktop", &mut Correlation::default()).unwrap()["raw_os_error"], Value::Null);
        for (key, value) in [("configure_stage", json!("/PRIVATE/path")),
            ("io_error_kind", json!("/PRIVATE/vendor-error")), ("raw_os_error", json!("5")),
            ("raw_os_error", json!(2147483648u64)), ("component", json!("sidecar")),
            ("event", json!("ipc_request_failed")), ("action", json!("get_public_state")),
            ("outcome", json!("ready")), ("error_code", json!("AI_EXPORT_CONFLICT")),
            ("path", json!("/PRIVATE/path")), ("acl", json!("D:P")), ("message", json!("vendor text"))] {
            let mut bad = raw.clone(); bad[key] = value;
            assert!(sanitize(&serde_json::to_vec(&bad).unwrap(), "desktop", &mut Correlation::default()).is_none(), "{key}");
        }
        for key in ["configure_stage", "io_error_kind"] {
            let mut bad = raw.clone(); bad.as_object_mut().unwrap().remove(key);
            assert!(sanitize(&serde_json::to_vec(&bad).unwrap(), "desktop", &mut Correlation::default()).is_none());
        }
        let duplicate = serde_json::to_string(&raw).unwrap().replacen("{", "{\"raw_os_error\":5,", 1);
        assert!(sanitize(duplicate.as_bytes(), "desktop", &mut Correlation::default()).is_none());
    }
    #[test]
    fn batch_worker_failure_is_only_a_closed_sidecar_stage_and_catalogue_code() {
        let raw = json!({ "schema": "datasecure-standalone-interaction/1", "time_ms": 10,
            "component": "sidecar", "event": "batch_worker_failed", "outcome": "failed",
            "phase": "item_epoch_release", "error_code": "STANDALONE_OWNERSHIP_CONTROL_BUSY" });
        for phase in BATCH_WORKER_PHASES.split_whitespace() {
            let mut row = raw.clone(); row["phase"] = json!(phase);
            let output = sanitize(&serde_json::to_vec(&row).unwrap(), "sidecar", &mut Correlation::default()).unwrap();
            assert_eq!(output, json!({ "time_ms": 10, "event": "batch_worker_failed", "outcome": "failed",
                "phase": phase, "error_code": "STANDALONE_OWNERSHIP_CONTROL_BUSY" }));
        }
        for (key, value) in [("component", json!("desktop")), ("outcome", json!("stopped")),
            ("phase", json!("reconcile")), ("phase", json!("/PRIVATE/vendor")),
            ("error_code", json!("OWNERSHIP_GUARD_BUSY")), ("error_code", json!("STANDALONE_PRIVATE_PERSON")),
            ("error_code", json!("STANDALONE_SIDECAR_SIGNAL_TRAP")), ("error_code", json!("/PRIVATE/vendor")),
            ("session_id", json!("abcdef0123456789")), ("request_id", json!("abcdef0123456789")),
            ("process_id", json!(42)), ("build_id", json!("unidentified")),
            ("product_version", json!("3.2.0-rc163")), ("runtime_target", json!("macos-aarch64")),
            ("os_version", json!("26.2")), ("action", json!("get_public_state")),
            ("completed_count", json!(1)), ("total_count", json!(1)), ("journal_count", json!(1)),
            ("export_count", json!(1)), ("recovery_requested", json!(true)), ("elapsed_ms", json!(1)),
            ("message", json!("PRIVATE source text")), ("stack", json!("/PRIVATE/vendor")),
            ("path", json!("/PRIVATE/vendor")), ("batch_id", json!("a".repeat(64))),
            ("document_id", json!("a".repeat(32))), ("classification", json!("PRIVATE"))] {
            let mut bad = raw.clone(); bad[key] = value;
            assert!(sanitize(&serde_json::to_vec(&bad).unwrap(), "sidecar", &mut Correlation::default()).is_none(), "{key}");
        }
        for code in ["RESIDUAL_PII", "IMAGE_OCR_REQUIRED", "CSV_QUOTE_INVALID", "CONVERSION_TIMEOUT",
            "LOCAL_WORKER_EXITED", "MCP_ARGUMENT_INVALID", "INTERNAL_FAILURE", "DOCUMENT_REVIEW_CONFLICT",
            "RESULT_EXPORT_SOURCE_INVALID", "RESULT_EXPORT_RELEASE_UNCONFIRMED", "RESULT_EXPORT_IO_FAILED",
            "RESULT_EXPORT_PLAN_FAILED", "RESULT_EXPORT_COPY_FAILED", "RESULT_EXPORT_CLAIM_UNAVAILABLE"] {
            let mut row = raw.clone(); row["error_code"] = json!(code);
            assert_eq!(sanitize(&serde_json::to_vec(&row).unwrap(), "sidecar", &mut Correlation::default()).unwrap()["error_code"], code);
        }
        for not_a_code in ["IMAGES_REMOVED_BY_REQUEST", "VISUAL_ASSETS_WITHHELD_LOCALLY", "COMPLETE", "STANDALONE_PRIVATE_PERSON", "BATCH_PRIVATE_VENDOR"] {
            assert!(!batch_worker_code(not_a_code), "{not_a_code}");
        }
        assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "desktop", &mut Correlation::default()).is_none());
        for key in ["phase", "error_code"] {
            let mut missing = raw.clone(); missing.as_object_mut().unwrap().remove(key);
            assert!(sanitize(&serde_json::to_vec(&missing).unwrap(), "sidecar", &mut Correlation::default()).is_none());
        }
        let duplicate = serde_json::to_string(&raw).unwrap().replacen("{", "{\"phase\":\"processing\",", 1);
        assert!(sanitize(duplicate.as_bytes(), "sidecar", &mut Correlation::default()).is_none());
        let mut other = raw.clone(); other["event"] = json!("native_export_phase");
        assert!(sanitize(&serde_json::to_vec(&other).unwrap(), "sidecar", &mut Correlation::default()).is_none(),
            "worker stages must not widen unrelated export events");
    }
    #[test]
    fn controlled_create_diagnostics_keep_only_the_closed_status_payload() {
        let raw = json!({ "schema": "datasecure-standalone-interaction/1", "time_ms": 10,
            "component": "desktop", "event": "native_controlled_create_failed", "outcome": "failed",
            "controlled_create": { "context": "controlled_directory_first_create",
                "nt_status": 0xc000_0022u32, "mapped_os_error": 5, "io_information_class": "0" } });
        for information in ["0", "1", "2", "3", "4", "5", "unknown"] {
            for (status, mapped) in [(0x8000_0000u32, 0u32), (0xc000_0022, 5), (u32::MAX, u32::MAX)] {
                let mut valid = raw.clone();
                valid["controlled_create"]["io_information_class"] = json!(information);
                valid["controlled_create"]["nt_status"] = json!(status);
                valid["controlled_create"]["mapped_os_error"] = json!(mapped);
                let output = sanitize(&serde_json::to_vec(&valid).unwrap(), "desktop", &mut Correlation::default()).unwrap();
                assert_eq!(output["controlled_create"], valid["controlled_create"]);
                assert!(output.get("raw_os_error").is_none());
                assert!(output.get("action").is_none());
            }
        }
        for (key, value) in [("context", json!("PRIVATE/path")), ("context", json!("private_create")),
            ("nt_status", json!(0)), ("nt_status", json!(0x7fff_ffffu32)), ("nt_status", json!(-1)),
            ("nt_status", json!(4294967296u64)), ("nt_status", json!("3221225506")),
            ("mapped_os_error", json!(-1)), ("mapped_os_error", json!(4294967296u64)),
            ("mapped_os_error", json!("5")), ("io_information_class", json!(0)),
            ("io_information_class", json!("6")), ("io_information_class", json!(u64::MAX)),
            ("io_information_class", json!("PRIVATE/path")), ("status", json!(0xc000_0022u32)),
            ("information", json!(u64::MAX)), ("path", json!("PRIVATE/path")),
            ("handle", json!(123456)), ("acl", json!("D:P")), ("sid", json!("S-1-5-21-PRIVATE")),
            ("message", json!("vendor error"))] {
            let mut bad = raw.clone(); bad["controlled_create"][key] = value;
            assert!(sanitize(&serde_json::to_vec(&bad).unwrap(), "desktop", &mut Correlation::default()).is_none(), "{key}");
        }
        for (key, value) in [("component", json!("sidecar")), ("event", json!("ipc_request_failed")),
            ("outcome", json!("ready")), ("action", json!("configure_results")),
            ("error_code", json!("AI_EXPORT_CONFLICT")), ("phase", json!("staging")),
            ("configure_stage", json!("private_create")), ("io_error_kind", json!("Uncategorized")),
            ("raw_os_error", json!(4395)), ("path", json!("PRIVATE/path")),
            ("controlled_create", Value::Null)] {
            let mut bad = raw.clone(); bad[key] = value;
            assert!(sanitize(&serde_json::to_vec(&bad).unwrap(), "desktop", &mut Correlation::default()).is_none(), "{key}");
        }
        let mut mixed = raw.clone();
        mixed["event"] = json!("native_configure_failed"); mixed["action"] = json!("configure_results");
        mixed["configure_stage"] = json!("private_create"); mixed["io_error_kind"] = json!("Uncategorized");
        mixed["raw_os_error"] = json!(4395);
        assert!(sanitize(&serde_json::to_vec(&mixed).unwrap(), "desktop", &mut Correlation::default()).is_none());
        assert!(sanitize(&serde_json::to_vec(&raw).unwrap(), "sidecar", &mut Correlation::default()).is_none());
        for key in ["context", "nt_status", "mapped_os_error", "io_information_class"] {
            let mut missing = raw.clone(); missing["controlled_create"].as_object_mut().unwrap().remove(key);
            assert!(sanitize(&serde_json::to_vec(&missing).unwrap(), "desktop", &mut Correlation::default()).is_none());
            let mut null = raw.clone(); null["controlled_create"][key] = Value::Null;
            assert!(sanitize(&serde_json::to_vec(&null).unwrap(), "desktop", &mut Correlation::default()).is_none());
        }
        let mut missing = raw.clone(); missing.as_object_mut().unwrap().remove("controlled_create");
        assert!(sanitize(&serde_json::to_vec(&missing).unwrap(), "desktop", &mut Correlation::default()).is_none());
        let encoded = serde_json::to_string(&raw).unwrap();
        let duplicate_top = encoded.replacen("{",
            &format!("{{\"controlled_create\":{},", raw["controlled_create"]), 1);
        assert!(sanitize(duplicate_top.as_bytes(), "desktop", &mut Correlation::default()).is_none());
        for key in ["context", "nt_status", "mapped_os_error", "io_information_class"] {
            let duplicate = encoded.replacen("\"controlled_create\":{",
                &format!("\"controlled_create\":{{\"{key}\":{},", raw["controlled_create"][key]), 1);
            assert_ne!(duplicate, encoded);
            assert!(sanitize(duplicate.as_bytes(), "desktop", &mut Correlation::default()).is_none());
        }
    }

    #[test]
    fn inventory_overflow_retains_current_native_desktop_and_rotated_core_without_unbounded_scan() {
        let root = root();
        for n in 0..140 { std::fs::write(root.join(format!("sidecar-interactions.{n:032x}.jsonl")), format!("{}\n", record())).unwrap(); }
        let desktop = "desktop-interactions.50101.000000000000000018df08c63413f240.2.jsonl";
        let core = "sidecar-interactions.abcdef0123456789abcdef0123456789.8.jsonl";
        let mut raw = record(); raw["time_ms"] = json!(123);
        std::fs::write(root.join(desktop), format!("{raw}\n")).unwrap();
        raw["time_ms"] = json!(456); raw["component"] = json!("sidecar"); raw["event"] = json!("response_ready");
        std::fs::write(root.join(core), format!("{raw}\n")).unwrap();
        let hints = vec![core.to_string(), "sidecar-interactions.abcdef0123456789abcdef0123456789.7.jsonl".into(), "../PRIVATE.jsonl".into()];
        let bundle = collect_with_segments(&root, Some(desktop.into()), hints);
        assert_eq!(bundle["inventory"], "unreadable_or_limit");
        let parts = bundle["sources"].as_array().unwrap();
        assert!(parts.iter().any(|p| p["component"] == "desktop" && p["records"][0]["time_ms"] == 123));
        assert!(parts.iter().any(|p| p["component"] == "sidecar" && p["records"][0]["time_ms"] == 456));
        assert!(!bundle.to_string().contains("PRIVATE"));
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 142, "collection never cleans old evidence");
        cleanup(root);
    }
    #[test]
    fn missing_sources_and_tampered_logs_are_explicit_and_never_copied() {
        let root = root();
        let mut log = serde_json::to_vec(&record()).unwrap(); log.extend_from_slice(b"\n{\"private\":\"PRIVATE/source.pdf\"}\nunfinished PRIVATE");
        std::fs::write(root.join("desktop-interactions.jsonl"), log).unwrap();
        std::fs::write(root.join("PRIVATE-document.txt"), "PRIVATE content").unwrap();
        let bundle = collect(&root); let text = bundle.to_string();
        assert!(!text.contains("PRIVATE")); assert!(!text.contains(&root.to_string_lossy().to_string()));
        assert_eq!(bundle["ignored_entries"], 1);
        assert!(bundle["sources"].as_array().unwrap().iter().any(|p| p["component"] == "sidecar" && p["status"] == "missing"));
        assert!(bundle["sources"].as_array().unwrap().iter().any(|p| p["rejected_lines"] == 1 && p["incomplete_last_line"] == true));
        assert!(save(&root, &root.join("bundle.json")).unwrap());
        cleanup(root);
    }
    #[test]
    fn existing_targets_hardlinks_and_inventories_are_not_trusted() {
        let root = root(); let target = root.join("bundle.json");
        std::fs::write(&target, b"sentinel").unwrap();
        assert!(save(&root, &target).is_err()); assert_eq!(std::fs::read(&target).unwrap(), b"sentinel");
        std::fs::hard_link(&target, root.join("desktop-interactions.jsonl")).unwrap();
        let bundle = collect(&root);
        assert!(bundle["sources"].as_array().unwrap().iter().any(|p| p["component"] == "desktop" && p["status"] == "unreadable_or_unsafe"));
        for i in 0..130 { std::fs::write(root.join(format!("unexpected-{i}")), b"PRIVATE").unwrap(); }
        assert_eq!(collect(&root)["inventory"], "unreadable_or_limit");
        cleanup(root);
    }
    #[test]
    fn byte_and_record_limits_are_hard_and_partial_final_lines_are_not_parsed() {
        let root = root();
        std::fs::write(root.join("desktop-interactions.jsonl"), vec![b'x'; MAX_FILE_BYTES + 10]).unwrap();
        let bundle = collect(&root);
        let source = bundle["sources"].as_array().unwrap().iter().find(|p| p["component"] == "desktop").unwrap();
        assert_eq!(source["bytes_read"], MAX_FILE_BYTES); assert_eq!(source["byte_limit_reached"], true);
        assert_eq!(source["incomplete_last_line"], true); assert_eq!(source["records"], json!([]));
        cleanup(root);
    }
    #[test]
    fn capped_files_keep_the_latest_events_and_recognize_writer_rotation() {
        let root = root();
        let mut raw = vec![b'x'; MAX_FILE_BYTES + 1]; raw.push(b'\n');
        let mut latest = record(); latest["time_ms"] = json!(12345);
        raw.extend_from_slice(format!("{latest}\n").as_bytes());
        let name = "desktop-interactions.50101.000000000000000018df08c63413f240.2.jsonl";
        std::fs::write(root.join(name), raw).unwrap();
        let bundle = collect(&root);
        let source = bundle["sources"].as_array().unwrap().iter().find(|p| p["component"] == "desktop").unwrap();
        assert_eq!(source["byte_limit_reached"], true);
        assert_eq!(source["initial_fragment_discarded"], true);
        assert_eq!(source["records"][0]["time_ms"], 12345);
        assert!(!bundle.to_string().contains(name));
        cleanup(root);
    }
    #[test]
    fn snapshot_can_read_a_live_append_handle_without_blocking_its_writer() {
        use std::io::Write;
        let root = root(); let path = root.join("desktop-interactions.jsonl");
        let mut file = std::fs::OpenOptions::new().create_new(true).append(true).open(path).unwrap();
        writeln!(file, "{}", record()).unwrap();
        let bundle = collect(&root);
        assert!(bundle["sources"].as_array().unwrap().iter().any(|p| p["component"] == "desktop" && p["records"].as_array().is_some_and(|v| v.len() == 1)));
        writeln!(file, "{}", record()).unwrap(); drop(file);
        cleanup(root);
    }
    #[test]
    fn record_budget_is_bounded_across_files_and_a_missing_directory_is_exportable_as_a_manifest() {
        let root = root();
        let log = format!("{}\n", json!({ "schema": "datasecure-standalone-interaction/1", "time_ms": 10,
            "component": "desktop", "event": "application_started", "outcome": "ready" })).repeat(1500);
        assert!(log.len() < MAX_FILE_BYTES);
        for segment in 2..=5 { std::fs::write(root.join(format!("desktop-interactions.1.{:032x}.{segment}.jsonl", segment)), &log).unwrap(); }
        let bundle = collect(&root);
        let count: usize = bundle["sources"].as_array().unwrap().iter().filter_map(|part| part["records"].as_array()).map(Vec::len).sum();
        assert_eq!(count, MAX_RECORDS);
        assert!(bundle["sources"].as_array().unwrap().iter().any(|part| part["record_limit_reached"] == true));
        let missing = root.join("missing");
        assert!(save(&missing, &root.join("missing-source.json")).unwrap());
        assert_eq!(collect(&missing)["inventory"], "missing_or_unreadable");
        cleanup(root);
    }
    #[cfg(windows)]
    #[test]
    fn native_windows_reparse_input_and_output_parent_are_refused() {
        use std::os::windows::process::CommandExt;
        let root = root(); let real = root.join("real"); let alias = root.join("alias");
        std::fs::create_dir(&real).unwrap();
        // Node is only the test fixture's junction creator, not an app/save
        // dependency. No shell, GUI, admin rights or product Core is invoked.
        let status = std::process::Command::new("node")
            .args(["-e", "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')"])
            .arg(&real).arg(&alias).creation_flags(0x0800_0000).status().unwrap();
        assert!(status.success());
        assert!(save(&root, &alias.join("bundle.json")).is_err());
        assert_eq!(collect(&alias)["inventory"], "missing_or_unreadable");
        assert_eq!(std::fs::read_dir(&real).unwrap().count(), 0);
        std::fs::remove_dir(&alias).unwrap();
        cleanup(root);
    }
    #[test]
    fn save_dialog_guard_releases_after_cancel_or_error() {
        let guard = SaveGuard::begin().unwrap(); assert!(SaveGuard::begin().is_none());
        drop(guard); assert!(SaveGuard::begin().is_some());
    }
    #[test]
    fn source_name_grammar_does_not_adopt_arbitrary_jsonl_or_copied_files() {
        assert_eq!(component("desktop-interactions.50101.000000000000000018df08c63413f240.jsonl"), Some("desktop"));
        assert_eq!(component("desktop-interactions.50101.000000000000000018df08c63413f240.8.jsonl"), Some("desktop"));
        assert_eq!(component("sidecar-interactions.abcdef0123456789abcdef0123456789.jsonl"), Some("sidecar"));
        assert_eq!(component("sidecar-interactions.abcdef0123456789abcdef0123456789.8.jsonl"), Some("sidecar"));
        for name in ["desktop-interactions 1.jsonl", "../desktop-interactions.jsonl", "sidecar-interactions.PRIVATE.jsonl", "source.jsonl",
            "sidecar-interactions.abcdef0123456789abcdef0123456789.9.jsonl", "sidecar-interactions.abcdef0123456789abcdef0123456789.1.jsonl"] { assert_eq!(component(name), None); }
    }
    #[cfg(unix)]
    #[test]
    fn symlinked_input_and_output_parent_are_refused() {
        let root = root(); let real = root.join("real"); std::fs::create_dir(&real).unwrap();
        std::fs::write(real.join("log"), b"PRIVATE").unwrap();
        std::os::unix::fs::symlink(real.join("log"), root.join("desktop-interactions.jsonl")).unwrap();
        std::os::unix::fs::symlink(&real, root.join("alias")).unwrap();
        assert!(save(&root, &root.join("alias/bundle.json")).is_err());
        assert_eq!(collect(&root.join("alias"))["inventory"], "missing_or_unreadable");
        assert!(!collect(&root).to_string().contains("PRIVATE"));
        std::fs::remove_file(root.join("desktop-interactions.jsonl")).unwrap();
        std::fs::remove_file(root.join("alias")).unwrap();
        cleanup(root);
    }
}
