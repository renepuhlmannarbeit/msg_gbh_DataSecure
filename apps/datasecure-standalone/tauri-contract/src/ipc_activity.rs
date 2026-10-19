//! Content-free activity evidence, independent of the serial Core mutex.
//! This describes an owned request; it never proves completion or authorizes
//! retries, releases, exports, or a new connection.
use std::{sync::{Arc, Mutex}, time::Instant};

#[derive(Clone, Default)]
pub struct Tracker(Arc<Mutex<Option<Activity>>>);

struct Activity {
    token: Arc<()>,
    action: &'static str,
    phase: &'static str,
    started: Instant,
    export_id: Option<String>,
    export: Option<ExportProgress>,
}

// Count only successful final write_body confirmations observed during this
// request. A prior prepared marker/completed copy alone confirms no new files.
struct ExportProgress { phase: ExportPhase, total: usize, staged: [bool; 200] }
#[derive(Clone, Copy)]
pub(crate) enum ExportPhase { Preparing, Copying, Verifying, Receipt }
impl ExportPhase {
    fn name(self) -> &'static str { match self {
        Self::Preparing => "preparing", Self::Copying => "copying",
        Self::Verifying => "verifying", Self::Receipt => "receipt",
    } }
}

/// Observation only. Cloning or dropping this capability never extends the
/// request's ownership, clears activity, grants I/O, or proves export success.
#[derive(Clone)]
pub(crate) struct ExportReporter { tracker: Tracker, token: Arc<()>, operation_id: String }

pub struct Guard {
    tracker: Tracker,
    token: Arc<()>,
}

fn safe_action(action: &str) -> &'static str {
    match action {
        "admit_selected_sources" => "admit_selected_sources",
        "remove_admitted_source" => "remove_admitted_source",
        "cancel_admission" => "cancel_admission",
        "start_admitted_batch" => "start_admitted_batch",
        "get_public_state" => "get_public_state",
        "get_ui_context" => "get_ui_context",
        "get_run_history" => "get_run_history",
        "get_run_failures" => "get_run_failures",
        "get_review_session" => "get_review_session",
        "get_review_chunk" => "get_review_chunk",
        "submit_review" => "submit_review",
        "continue_review_session" => "continue_review_session",
        "continue_history_batch" => "continue_history_batch",
        "skip_ocr_contact_review" => "skip_ocr_contact_review",
        "pause_batch" => "pause_batch",
        "abandon_result_export" => "abandon_result_export",
        "get_document_reviews" => "get_document_reviews",
        "get_document_review_history_summary" => "get_document_review_history_summary",
        "get_document_review_chunk" => "get_document_review_chunk",
        "get_document_entities" => "get_document_entities",
        "decide_document_review" => "decide_document_review",
        "decide_document_review_batch" => "decide_document_review_batch",
        "export_approved_documents" => "export_approved_documents",
        "publish_result_documents" => "publish_result_documents",
        "preview_document_export" => "preview_document_export",
        "abandon_document_export" => "abandon_document_export",
        "resolve_document_export" => "resolve_document_export",
        "resolve_document_identity_overview" => "resolve_document_identity_overview",
        "ack_terminal_presented" => "ack_terminal_presented",
        "continue_current_batch" => "continue_current_batch",
        "configure_results" => "configure_results",
        "resolve_current_results" => "resolve_current_results",
        "resolve_local_ledger" => "resolve_local_ledger",
        "resolve_history_results" => "resolve_history_results",
        "resolve_history_ledger" => "resolve_history_ledger",
        "resolve_history_identity_mapping" => "resolve_history_identity_mapping",
        "resolve_identity_mappings_directory" => "resolve_identity_mappings_directory",
        "shutdown" => "shutdown",
        _ => "operation",
    }
}

impl Tracker {
    /// Call only after obtaining ownership of the serial Core request lock.
    /// Replacing activity is safe: an older guard cannot update or clear it.
    pub fn begin(&self, action: &str) -> Guard {
        let token = Arc::new(());
        if let Ok(mut activity) = self.0.lock() {
            *activity = Some(Activity { token: token.clone(), action: safe_action(action),
                phase: "waiting", started: Instant::now(), export_id: None, export: None });
        }
        Guard { tracker: self.clone(), token }
    }

    /// Never acquires the Core request lock or inspects private request data.
    /// Poisoning is explicitly unknown, never an apparently idle Core.
    pub fn snapshot(&self) -> serde_json::Value {
        let Ok(activity) = self.0.lock() else {
            return serde_json::json!({ "state": "unavailable" });
        };
        match activity.as_ref() {
            Some(activity) => {
                let mut value = serde_json::json!({ "state": "active", "active": true,
                    "action": activity.action, "phase": activity.phase,
                    "elapsed_ms": activity.started.elapsed().as_millis().min(u64::MAX as u128) as u64 });
                if let (Some(operation_id), Some(progress)) = (&activity.export_id, &activity.export) {
                    value["export_progress"] = serde_json::json!({ "operation_id": operation_id,
                        "phase": progress.phase.name(), "staged_count": progress.staged[..progress.total].iter().filter(|value| **value).count(),
                        "total_count": progress.total });
                }
                value
            },
            None => serde_json::json!({ "state": "idle", "active": false }),
        }
    }
}

impl Guard {
    /// Bind once to the exact outer request, before delegating to a worker.
    /// No progress becomes visible until that worker validates its callback.
    pub(crate) fn export_reporter(&self, operation_id: &str) -> Option<ExportReporter> {
        if operation_id.len() != 32 || !operation_id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return None; }
        let mut activity = self.tracker.0.lock().ok()?;
        let activity = activity.as_mut().filter(|activity| Arc::ptr_eq(&activity.token, &self.token) &&
            activity.action == "export_approved_documents")?;
        if activity.export_id.as_deref().is_some_and(|id| id != operation_id) { return None; }
        activity.export_id = Some(operation_id.into());
        Some(ExportReporter { tracker: self.tracker.clone(), token: self.token.clone(), operation_id: operation_id.into() })
    }
    pub fn set_phase(&self, phase: &str) {
        let phase = match phase {
            "bootstrap" => "bootstrap",
            "waiting" => "waiting",
            "native" => "native",
            _ => return,
        };
        if let Ok(mut activity) = self.tracker.0.lock() {
            if let Some(activity) = activity.as_mut().filter(|activity| Arc::ptr_eq(&activity.token, &self.token)) {
                activity.phase = phase;
            }
        }
    }
}

impl ExportReporter {
    pub(crate) fn matches_operation(&self, operation_id: &str) -> bool { self.operation_id == operation_id }
    fn update(&self, total: usize, update: impl FnOnce(&mut ExportProgress)) {
        if !(1..=200).contains(&total) { return; }
        let Ok(mut activity) = self.tracker.0.lock() else { return };
        let Some(activity) = activity.as_mut().filter(|activity| Arc::ptr_eq(&activity.token, &self.token) &&
            activity.action == "export_approved_documents" && activity.export_id.as_deref() == Some(&self.operation_id)) else { return };
        if activity.export.as_ref().is_some_and(|progress| progress.total != total) { return; }
        let progress = activity.export.get_or_insert(ExportProgress { phase: ExportPhase::Preparing, total, staged: [false; 200] });
        update(progress);
    }
    pub(crate) fn phase(&self, phase: ExportPhase, total: usize) { self.update(total, |progress| progress.phase = phase); }
    /// Only after a successful final native write_body result. A repeated
    /// file/chunk/retry cannot advance the counter twice.
    pub(crate) fn staged_file(&self, index: usize, total: usize) {
        if index >= total { return; }
        self.update(total, |progress| { progress.phase = ExportPhase::Copying; progress.staged[index] = true; });
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Ok(mut activity) = self.tracker.0.lock() {
            if activity.as_ref().is_some_and(|activity| Arc::ptr_eq(&activity.token, &self.token)) {
                *activity = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_is_visible_until_its_guard_is_dropped() {
        let tracker = Tracker::default();
        assert_eq!(tracker.snapshot(), serde_json::json!({ "state": "idle", "active": false }));
        let guard = tracker.begin("export_approved_documents");
        let active = tracker.snapshot();
        assert_eq!(active["state"], "active");
        assert_eq!(active["action"], "export_approved_documents");
        assert_eq!(active["phase"], "waiting");
        assert!(active["elapsed_ms"].is_u64());
        assert_eq!(active.as_object().unwrap().len(), 5);
        guard.set_phase("bootstrap");
        assert_eq!(tracker.snapshot()["phase"], "bootstrap");
        guard.set_phase("native");
        assert_eq!(tracker.snapshot()["phase"], "native");
        drop(guard);
        assert_eq!(tracker.snapshot()["state"], "idle");
    }

    #[test]
    fn stale_guard_can_neither_modify_nor_clear_new_activity() {
        let tracker = Tracker::default();
        let old = tracker.begin("get_run_history");
        let current = tracker.begin("export_approved_documents");
        current.set_phase("native");
        old.set_phase("bootstrap");
        drop(old);
        assert_eq!(tracker.snapshot()["action"], "export_approved_documents");
        assert_eq!(tracker.snapshot()["phase"], "native");
        drop(current);
        assert_eq!(tracker.snapshot()["state"], "idle");
    }

    #[test]
    fn arbitrary_actions_and_phases_cannot_leak_private_text() {
        let tracker = Tracker::default();
        let guard = tracker.begin("/Users/private/Document.txt");
        guard.set_phase("private document contents");
        assert_eq!(tracker.snapshot()["action"], "operation");
        assert_eq!(tracker.snapshot()["phase"], "waiting");
        assert!(!tracker.snapshot().to_string().contains("private"));
    }

    #[test]
    fn another_thread_can_read_activity_while_owner_is_busy() {
        let tracker = Tracker::default();
        let guard = tracker.begin("get_run_history");
        let reader = tracker.clone();
        let snapshot = std::thread::spawn(move || reader.snapshot()).join().unwrap();
        assert_eq!(snapshot["active"], true);
        assert_eq!(snapshot["action"], "get_run_history");
        drop(guard);
    }

    #[test]
    fn unwinding_an_operation_releases_its_activity() {
        let tracker = Tracker::default();
        let owner = tracker.clone();
        assert!(std::panic::catch_unwind(move || {
            let _guard = owner.begin("get_run_history");
            panic!("injected operation failure");
        }).is_err());
        assert_eq!(tracker.snapshot()["state"], "idle");
    }

    #[test]
    fn poisoned_tracker_stays_unavailable_instead_of_claiming_idle() {
        let tracker = Tracker::default();
        let poisoned = tracker.clone();
        assert!(std::thread::spawn(move || {
            let _lock = poisoned.0.lock().unwrap();
            panic!("injected mutex poisoning");
        }).join().is_err());
        assert_eq!(tracker.snapshot(), serde_json::json!({ "state": "unavailable" }));
        let guard = tracker.begin("export_approved_documents");
        assert!(guard.export_reporter(&"a".repeat(32)).is_none());
        guard.set_phase("native");
        drop(guard);
        assert_eq!(tracker.snapshot(), serde_json::json!({ "state": "unavailable" }));
    }
    #[test]
    fn export_reporter_is_closed_bound_once_and_has_no_drop_authority() {
        let tracker = Tracker::default();
        for action in ["get_run_history", "preview_document_export", "resolve_document_export", "abandon_document_export", "/private/path"] {
            let guard = tracker.begin(action); assert!(guard.export_reporter(&"a".repeat(32)).is_none());
        }
        let guard = tracker.begin("export_approved_documents");
        for id in ["private/path", &"a".repeat(31), &"A".repeat(32), &"a".repeat(33)] { assert!(guard.export_reporter(id).is_none()); }
        let reporter = guard.export_reporter(&"a".repeat(32)).unwrap();
        assert!(guard.export_reporter(&"b".repeat(32)).is_none());
        assert!(tracker.snapshot().get("export_progress").is_none(), "binding an outer request alone is not native progress");
        reporter.phase(ExportPhase::Preparing, 2);
        let snapshot = tracker.snapshot();
        assert_eq!(snapshot["export_progress"], serde_json::json!({ "operation_id": "a".repeat(32),
            "phase": "preparing", "staged_count": 0, "total_count": 2 }));
        drop(reporter);
        assert_eq!(tracker.snapshot()["state"], "active");
        drop(guard); assert_eq!(tracker.snapshot()["state"], "idle");
    }
    #[test]
    fn export_file_counts_are_unique_bounded_and_do_not_imply_publication() {
        let tracker = Tracker::default(); let guard = tracker.begin("export_approved_documents");
        let reporter = guard.export_reporter(&"a".repeat(32)).unwrap();
        reporter.phase(ExportPhase::Copying, 0); reporter.phase(ExportPhase::Copying, 201);
        reporter.staged_file(200, 200);
        assert!(tracker.snapshot().get("export_progress").is_none());
        reporter.staged_file(1, 2); reporter.staged_file(1, 2);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 1);
        reporter.staged_file(0, 3); // a changed inventory never replaces the bound total
        assert_eq!(tracker.snapshot()["export_progress"]["total_count"], 2);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 1);
        reporter.staged_file(0, 2); reporter.phase(ExportPhase::Verifying, 2);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 2);
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "verifying");
        assert!(tracker.snapshot().get("completed").is_none());
        reporter.phase(ExportPhase::Receipt, 2);
        assert_eq!(tracker.snapshot()["state"], "active");
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "receipt");
    }
    #[test]
    fn late_worker_cannot_update_or_resurrect_a_successor_even_for_the_same_operation() {
        let tracker = Tracker::default(); let old = tracker.begin("export_approved_documents");
        let reporter = old.export_reporter(&"a".repeat(32)).unwrap(); reporter.staged_file(0, 2);
        drop(old);
        reporter.staged_file(1, 2); assert_eq!(tracker.snapshot()["state"], "idle");
        let current = tracker.begin("export_approved_documents");
        let successor = current.export_reporter(&"a".repeat(32)).unwrap(); successor.phase(ExportPhase::Preparing, 2);
        std::thread::spawn(move || { reporter.staged_file(1, 2); reporter.phase(ExportPhase::Receipt, 2); }).join().unwrap();
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "preparing");
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0);
    }
    #[test]
    fn resuming_or_acknowledging_does_not_invent_successful_file_writes_in_this_request() {
        let tracker = Tracker::default(); let guard = tracker.begin("export_approved_documents");
        let reporter = guard.export_reporter(&"a".repeat(32)).unwrap();
        reporter.phase(ExportPhase::Receipt, 200);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0, "an ACK alone invents no staged files");
        reporter.phase(ExportPhase::Verifying, 200);
        assert_eq!(tracker.snapshot()["export_progress"]["staged_count"], 0, "a stored preparation marker is not a new write or fresh inventory check");
        assert_eq!(tracker.snapshot()["export_progress"]["phase"], "verifying");
    }
}
