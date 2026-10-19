//! Native durable transaction core. No renderer entry point and no activation
//! of the Node exporter. The composition root must supply an ACL-controlled
//! private journal/staging parent and an already-bound destination capability.
//! Records are exclusive, bounded, handle-relative and immutable. No cleanup,
//! copy fallback, adoption of unknown stages, or automatic new attempts.
#![allow(dead_code)]
use crate::{export_directory::{self, Directory, ExpectedFile, Identity}, ipc_transport::NativeGuard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io;

const MAX_RECORD: usize = 128 * 1024;
#[cfg(test)]
std::thread_local! { static PLAN_DIGEST_COMPUTATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }
fn failure(code: &'static str) -> io::Error { io::Error::other(code) }
fn conflict() -> io::Error { failure("AI_EXPORT_CONFLICT") }
fn hex(value: &str, size: usize) -> bool {
    value.len() == size && value.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
// Missing is the immutable legacy export role. Explicit null/unknown roles
// are refused, and an omitted role serializes byte-for-byte as before.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub(crate) enum PublicationRole { #[serde(rename = "results")] Results }
pub(crate) fn deserialize_publication_role<'de, D: serde::Deserializer<'de>>(deserializer: D)
    -> Result<Option<PublicationRole>, D::Error> {
    let role = String::deserialize(deserializer)?;
    if role == "results" { Ok(Some(PublicationRole::Results)) }
    else { Err(<D::Error as serde::de::Error>::custom("PUBLICATION_ROLE_INVALID")) }
}
pub(crate) fn publication_directory_name(role: Option<PublicationRole>, operation_id: &str) -> String {
    format!("{}-{operation_id}", if role == Some(PublicationRole::Results) { "Ergebnisse" } else { "Export" })
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ObjectId { volume: String, object: String, created_ns: String }
impl From<Identity> for ObjectId {
    fn from(value: Identity) -> Self { Self { volume: value.volume.to_string(), object: value.object.to_string(), created_ns: value.created_ns.to_string() } }
}
impl ObjectId {
    fn identity(&self) -> io::Result<Identity> {
        let identity = Identity { volume: self.volume.parse().map_err(|_| conflict())?,
            object: self.object.parse().map_err(|_| conflict())?, created_ns: self.created_ns.parse().map_err(|_| conflict())? };
        if Self::from(identity) != *self { return Err(conflict()); }
        Ok(identity)
    }
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Plan {
    schema: String, batch_id: String, operation_id: String, request_sha256: String,
    processing_mode: String, journal: ObjectId, staging_parent: ObjectId, target_parent: ObjectId,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_publication_role")]
    publication_role: Option<PublicationRole>,
    files: Vec<ExpectedFile>,
}
pub(crate) struct Parents<'a> { pub journal: &'a Directory, pub staging: &'a Directory, pub target: &'a Directory }
impl Plan {
    pub fn new(batch_id: String, operation_id: String, request_sha256: String, processing_mode: String,
        files: Vec<ExpectedFile>, parents: &Parents<'_>) -> io::Result<Self> {
        let plan = Self { schema: "datasecure-native-export-plan/1".into(), batch_id, operation_id, request_sha256,
            processing_mode, journal: parents.journal.identity().into(), staging_parent: parents.staging.identity().into(),
            target_parent: parents.target.identity().into(), publication_role: None, files };
        plan.validate()?; Ok(plan)
    }
    pub fn with_publication_role(mut self, role: Option<PublicationRole>) -> Self {
        self.publication_role = role; self
    }
    fn validate(&self) -> io::Result<()> {
        if self.schema != "datasecure-native-export-plan/1" || !hex(&self.batch_id, 64) || !hex(&self.operation_id, 32) ||
            !hex(&self.request_sha256, 64) || !["markdown-only", "markdown-and-anonymize"].contains(&self.processing_mode.as_str()) ||
            self.files.is_empty() || self.files.len() > 200 { return Err(conflict()); }
        self.journal.identity()?; self.staging_parent.identity()?; self.target_parent.identity()?;
        let mut total = 0u64;
        crate::export_directory::validate_export_names(&self.processing_mode, &self.files).map_err(|_| conflict())?;
        for file in &self.files {
            if file.bytes > 32_000_000 { return Err(conflict()); }
            total = total.checked_add(file.bytes).ok_or_else(conflict)?;
            if total > 500 * 1024 * 1024 { return Err(conflict()); }
        }
        Ok(())
    }
    fn digest(&self) -> io::Result<[u8; 32]> {
        #[cfg(test)] PLAN_DIGEST_COMPUTATIONS.with(|count| count.set(count.get() + 1));
        Ok(Sha256::digest(serde_json::to_vec(self).map_err(|_| conflict())?).into())
    }
    fn stage_name(&self) -> String { format!("stage-{}", self.operation_id) }
    pub fn target_name(&self) -> String { publication_directory_name(self.publication_role, &self.operation_id) }
}
#[derive(Debug, Eq, PartialEq)]
pub(crate) enum Status { Unprepared, Prepared, Completed, Acknowledged, Abandoned }
#[derive(Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record { schema: String, plan_sha256: [u8; 32], stage: Option<ObjectId> }
pub(crate) struct Transaction<'a> {
    journal: &'a Directory, staging: &'a Directory, target: &'a Directory, plan: Plan, guard: &'a NativeGuard,
    plan_sha256: [u8; 32],
    _control: export_directory::ControlLock,
}
impl<'a> Transaction<'a> {
    pub fn open(journal: &'a Directory, staging: &'a Directory, target: &'a Directory, plan: Plan, guard: &'a NativeGuard) -> io::Result<Self> {
        Self::open_mode(journal, staging, target, plan, guard, false)
    }
    pub fn open_existing(journal: &'a Directory, staging: &'a Directory, target: &'a Directory, plan: Plan, guard: &'a NativeGuard) -> io::Result<Self> {
        Self::open_mode(journal, staging, target, plan, guard, true)
    }
    fn open_mode(journal: &'a Directory, staging: &'a Directory, target: &'a Directory, plan: Plan, guard: &'a NativeGuard,
        existing_only: bool) -> io::Result<Self> {
        plan.validate()?;
        if plan.journal != journal.identity().into() || plan.staging_parent != staging.identity().into() ||
            plan.target_parent != target.identity().into() { return Err(conflict()); }
        // A caller's assertion of privacy is not authority. Recheck native
        // owner/ACL/mode evidence on every reopened transaction.
        journal.verify_controlled()?;
        staging.verify_controlled()?;
        guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let control = if existing_only { journal.lock_existing_control()? } else { journal.lock_control()? };
        // The owned plan is immutable for this instance. Reusing its digest
        // never reuses journal evidence, directory authority or inventory facts.
        let plan_sha256 = plan.digest()?;
        let tx = Self { journal, staging, target, plan, guard, plan_sha256, _control: control };
        if existing_only {
            if tx.read::<Plan>("intent")?.as_ref() != Some(&tx.plan) { return Err(conflict()); }
        } else { tx.put("intent", &tx.plan)?; }
        // Closed record dependencies matter even when a later receipt exists.
        tx.evidence()?;
        Ok(tx)
    }
    fn name(&self, kind: &str) -> String { format!("{}-{kind}.json", self.plan.operation_id) }
    fn read<T: for<'de> Deserialize<'de>>(&self, kind: &str) -> io::Result<Option<T>> {
        match self.journal.read_bounded(&self.name(kind), MAX_RECORD) {
            Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|_| conflict()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }
    fn put<T: Serialize>(&self, kind: &str, value: &T) -> io::Result<()> {
        let bytes = serde_json::to_vec(value).map_err(|_| conflict())?;
        if bytes.len() > MAX_RECORD { return Err(conflict()); }
        match self.journal.read_bounded(&self.name(kind), MAX_RECORD) {
            Ok(existing) => return if existing == bytes { Ok(()) } else { Err(conflict()) },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {},
            Err(error) => return Err(error),
        }
        match self.journal.write_record_atomic(&self.name(kind), &bytes) {
            Ok(()) => {},
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {},
            Err(error) => return Err(error),
        }
        if self.journal.read_bounded(&self.name(kind), MAX_RECORD)? != bytes { return Err(conflict()); }
        self.journal.sync()
    }
    fn record(&self, kind: &str, stage: Option<Identity>) -> io::Result<()> {
        self.put(kind, &Record { schema: format!("datasecure-native-export-{kind}/1"), plan_sha256: self.plan_sha256, stage: stage.map(Into::into) })
    }
    fn existing(&self, kind: &str) -> io::Result<Option<Option<Identity>>> {
        let Some(record) = self.read::<Record>(kind)? else { return Ok(None); };
        if record.schema != format!("datasecure-native-export-{kind}/1") || record.plan_sha256 != self.plan_sha256 { return Err(conflict()); }
        Ok(Some(record.stage.map(|id| id.identity()).transpose()?))
    }
    fn evidence(&self) -> io::Result<(Option<Identity>, bool, bool, bool, bool, bool)> {
        let saved: Plan = self.read("intent")?.ok_or_else(conflict)?;
        if saved != self.plan { return Err(conflict()); }
        let stage = self.existing("stage")?;
        let identity = stage.flatten();
        if stage.is_some() && identity.is_none() { return Err(conflict()); }
        let prepared = self.existing("prepared")?;
        let started = self.existing("started")?;
        let complete = self.existing("complete")?;
        let ack = self.existing("ack")?;
        let abandoned = self.existing("abandoned")?;
        for record in [prepared, started, complete, ack] {
            if record.is_some() && (identity.is_none() || record.flatten() != identity) { return Err(conflict()); }
        }
        if started.is_some() && prepared.is_none() || complete.is_some() && started.is_none() ||
            ack.is_some() && complete.is_none() || abandoned.is_some() && (abandoned != Some(identity) || complete.is_some() || ack.is_some()) { return Err(conflict()); }
        Ok((identity, prepared.is_some(), started.is_some(), complete.is_some(), ack.is_some(), abandoned.is_some()))
    }
    /// Every body must match the already-bound neutral inventory. A partial
    /// write is preserved and conflicts on resume; it is never overwritten.
    pub fn write_body(&self, index: usize, bytes: &[u8]) -> io::Result<()> {
        let (identity, prepared, started, _, _, abandoned) = self.evidence()?;
        if prepared || started || abandoned { return Err(conflict()); }
        let file = self.plan.files.get(index).ok_or_else(conflict)?;
        if bytes.len() as u64 != file.bytes || <[u8; 32]>::from(Sha256::digest(bytes)) != file.sha256 { return Err(conflict()); }
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let stage = if let Some(identity) = identity {
            self.staging.reopen_private_stage(&self.plan.stage_name(), identity)?
        } else {
            let stage = self.staging.create_private_child(&self.plan.stage_name())?;
            self.record("stage", Some(stage.identity()))?;
            stage
        };
        match stage.write_new(&file.name, bytes) {
            Ok(()) => {},
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {},
            Err(error) => return Err(error),
        }
        if stage.read_bounded(&file.name, 32_000_000)? != bytes { return Err(conflict()); }
        stage.sync()?;
        self.staging.inspect_child(&self.plan.stage_name(), stage.identity())?;
        Ok(())
    }
    pub fn prepare(&self) -> io::Result<()> {
        let (identity, _, started, _, _, abandoned) = self.evidence()?;
        if started || abandoned { return Err(conflict()); }
        let identity = identity.ok_or_else(|| failure("AI_EXPORT_INCOMPLETE"))?;
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let stage = self.staging.open_known_child(&self.plan.stage_name(), identity)?;
        stage.verify_inventory(&self.plan.files)?;
        self.record("prepared", Some(identity))
    }
    /// Reconcile before retry, ACK and abandonment. A receipt alone is never
    /// evidence that the exact destination still exists with the same contents.
    pub fn reconcile(&self) -> io::Result<Status> {
        let (identity, prepared, started, complete, ack, abandoned) = self.evidence()?;
        if abandoned { return Ok(Status::Abandoned); }
        if !started { return Ok(if prepared { Status::Prepared } else { Status::Unprepared }); }
        let identity = identity.ok_or_else(conflict)?;
        match self.target.open_known_child(&self.plan.target_name(), identity) {
            Ok(output) => {
                #[cfg(test)] self.guard.test_event("reconcile_inventory");
                output.verify_inventory(&self.plan.files)?;
                if !complete {
                    self.record("complete", Some(identity))?;
                    // A new durable receipt still requires verification on
                    // both sides of its write. Existing complete evidence was
                    // freshly checked above; no duplicate body pass is needed.
                    #[cfg(test)] self.guard.test_event("reconcile_inventory");
                    output.verify_inventory(&self.plan.files)?;
                }
                Ok(if ack { Status::Acknowledged } else { Status::Completed })
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound && !complete => {
                // Both names missing is not proof of cancellation. Only the
                // exact known complete stage permits another publication try.
                let stage = self.staging.open_known_child(&self.plan.stage_name(), identity)
                    .map_err(|_| failure("AI_EXPORT_UNCERTAIN"))?;
                stage.verify_inventory(&self.plan.files)?;
                Ok(Status::Prepared)
            },
            Err(error) => Err(error),
        }
    }
    /// A history opener is observation only: require an already durable
    /// completion, verify the same owned destination, and never repair a lost
    /// receipt or authorize preparation/publication through this path.
    pub fn inspect_completed(&self) -> io::Result<Status> {
        let (identity, _, _, complete, ack, abandoned) = self.evidence()?;
        if abandoned { return Ok(Status::Abandoned); }
        if !complete { return Err(failure("AI_EXPORT_INCOMPLETE")); }
        let output = self.target.open_known_child(&self.plan.target_name(), identity.ok_or_else(conflict)?)?;
        output.verify_inventory(&self.plan.files)?;
        Ok(if ack { Status::Acknowledged } else { Status::Completed })
    }
    pub fn commit(&self) -> io::Result<Status> {
        match self.reconcile()? {
            status @ (Status::Completed | Status::Acknowledged) => return Ok(status),
            Status::Prepared => {},
            Status::Abandoned => return Err(failure("AI_EXPORT_ABANDONED")),
            Status::Unprepared => return Err(failure("AI_EXPORT_INCOMPLETE")),
        }
        let identity = self.evidence()?.0.ok_or_else(conflict)?;
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let stage = self.staging.reopen_private_stage(&self.plan.stage_name(), identity)?;
        stage.verify_inventory(&self.plan.files)?;
        self.record("started", Some(identity))?; // before the OS rename
        let result = export_directory::publish(self.staging, &self.plan.stage_name(), &stage,
            self.target, &self.plan.target_name(), self.guard);
        drop(stage); // Recovery has independent, read-only name ownership.
        let status = self.reconcile()?;
        match status {
            Status::Completed | Status::Acknowledged => Ok(status),
            _ => Err(match result {
                Err(export_directory::PublicationError::NotPublished(error)) => error,
                _ => failure("AI_EXPORT_UNCERTAIN"),
            }),
        }
    }
    pub fn acknowledge(&self) -> io::Result<Status> {
        match self.reconcile()? {
            Status::Completed | Status::Acknowledged => {
                self.record("ack", self.evidence()?.0)?; Ok(Status::Acknowledged)
            },
            Status::Abandoned => Err(failure("AI_EXPORT_ABANDONED")),
            _ => Err(failure("AI_EXPORT_INCOMPLETE")),
        }
    }
    pub fn abandon(&self) -> io::Result<Status> {
        match self.reconcile()? {
            Status::Completed | Status::Acknowledged => Err(failure("AI_EXPORT_ALREADY_COMPLETE")),
            Status::Abandoned => Ok(Status::Abandoned),
            Status::Prepared | Status::Unprepared => {
                self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
                self.record("abandoned", self.evidence()?.0)?; Ok(Status::Abandoned)
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc_transport::Lifecycle;
    use std::{fs, path::PathBuf};
    struct Fixture { path: PathBuf }
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("datasecure-native-tx-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            fs::create_dir(&path).unwrap();
            let parent = Directory::open_existing(&path, None).unwrap();
            for name in ["journal", "staging"] { parent.create_controlled_child(name).unwrap(); }
            fs::create_dir(path.join("target")).unwrap();
            Self { path }
        }
        fn open(&self, name: &str) -> Directory { Directory::open_existing(&self.path.join(name), None).unwrap() }
        fn plan(&self, journal: &Directory, staging: &Directory, target: &Directory) -> Plan {
            Plan::new("a".repeat(64), "b".repeat(32), "c".repeat(64), "markdown-and-anonymize".into(),
                vec![ExpectedFile { name: "Dokument_01.md".into(), bytes: 5, sha256: Sha256::digest(b"hello").into() }],
                &Parents { journal, staging, target }).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self.path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-tx-"));
            assert!(!fs::symlink_metadata(&self.path).unwrap().file_type().is_symlink());
            let mut pending = vec![self.path.clone()];
            while let Some(directory) = pending.pop() {
                for entry in fs::read_dir(directory).unwrap() {
                    let path = entry.unwrap().path(); let metadata = fs::symlink_metadata(&path).unwrap();
                    assert!(!metadata.file_type().is_symlink());
                    #[cfg(windows)] {
                        use std::os::windows::fs::MetadataExt;
                        assert_eq!(metadata.file_attributes() & 0x400, 0);
                    }
                    if metadata.is_dir() { pending.push(path); } else { assert!(metadata.is_file()); }
                }
            }
            fs::remove_dir_all(&self.path).unwrap();
        }
    }
    fn publish_without_receipt(tx: &Transaction<'_>) {
        let identity = tx.evidence().unwrap().0.unwrap();
        let stage = tx.staging.reopen_private_stage(&tx.plan.stage_name(), identity).unwrap();
        tx.record("started", Some(identity)).unwrap();
        export_directory::publish(tx.staging, &tx.plan.stage_name(), &stage, tx.target, &tx.plan.target_name(), tx.guard).unwrap();
    }
    #[test]
    fn result_role_is_closed_digest_bound_and_absent_for_legacy_serialization() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let legacy = f.plan(&j, &s, &t);
        let bytes = serde_json::to_vec(&legacy).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("publication_role"));
        assert_eq!(serde_json::from_slice::<Plan>(&bytes).unwrap(), legacy);
        let results = legacy.clone().with_publication_role(Some(PublicationRole::Results));
        assert_ne!(legacy.digest().unwrap(), results.digest().unwrap());
        assert_eq!(legacy.target_name(), format!("Export-{}", legacy.operation_id));
        assert_eq!(results.target_name(), format!("Ergebnisse-{}", legacy.operation_id));
        let mut value = serde_json::to_value(&results).unwrap();
        assert_eq!(value["publication_role"], "results");
        for invalid in [serde_json::Value::Null, serde_json::json!("export"), serde_json::json!("Results"),
            serde_json::json!(true), serde_json::json!({ "results": null })] {
            value["publication_role"] = invalid;
            assert!(serde_json::from_value::<Plan>(value.clone()).is_err());
        }
    }
    #[test]
    fn result_role_lost_receipt_recovers_without_legacy_adoption_or_second_generation() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let legacy = f.plan(&j, &s, &t);
        let results = legacy.clone().with_publication_role(Some(PublicationRole::Results));
        {
            let tx = Transaction::open(&j, &s, &t, results.clone(), &guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        }
        assert!(Transaction::open(&j, &s, &t, legacy, &guard).is_err(), "same operation cannot erase its role");
        drop(j); drop(s); drop(t);
        let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let tx = Transaction::open(&j, &s, &t, results, &guard).unwrap();
        assert_eq!(tx.commit().unwrap(), Status::Completed);
        assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        assert_eq!(tx.commit().unwrap(), Status::Acknowledged);
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
        assert_eq!(fs::read(f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md")).unwrap(), b"hello");
    }
    #[test]
    fn result_role_inspection_does_not_turn_a_real_rename_without_receipt_into_completion() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let plan = f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results));
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        let receipt = f.path.join("journal").join(tx.name("complete"));
        assert!(!receipt.exists());
        assert_eq!(tx.inspect_completed().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE");
        assert!(!receipt.exists(), "opening history never persists completion");
        assert_eq!(tx.reconcile().unwrap(), Status::Completed);
        let bytes = fs::read(&receipt).unwrap();
        assert_eq!(tx.inspect_completed().unwrap(), Status::Completed);
        assert_eq!(fs::read(&receipt).unwrap(), bytes);
    }
    #[test]
    fn lost_ack_and_fresh_native_handles_recover_the_same_copy_without_republishing() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap(); let plan = f.plan(&j, &s, &t);
        let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
        publish_without_receipt(&tx);
        drop(tx); drop(j); drop(s); drop(t);
        let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        assert_eq!(tx.commit().unwrap(), Status::Completed);
        assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        assert_eq!(tx.commit().unwrap(), Status::Acknowledged);
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
        assert_eq!(tx.abandon().unwrap_err().to_string(), "AI_EXPORT_ALREADY_COMPLETE");
    }
    #[test]
    fn completed_reconciliation_reads_inventory_once_and_never_caches_changed_bodies_or_evidence() {
        use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let passes = Arc::new(AtomicUsize::new(0)); let observed = passes.clone();
        let guard = lifecycle.begin_native().unwrap().with_test_event(move |phase| {
            if phase == "reconcile_inventory" { observed.fetch_add(1, Ordering::Relaxed); }
        });
        let before = PLAN_DIGEST_COMPUTATIONS.with(|count| count.get());
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        assert_eq!(PLAN_DIGEST_COMPUTATIONS.with(|count| count.get()) - before, 1);
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        assert_eq!(tx.reconcile().unwrap(), Status::Completed);
        assert_eq!(passes.swap(0, Ordering::Relaxed), 2, "first receipt still verifies before AND after its durable write");
        assert_eq!(tx.reconcile().unwrap(), Status::Completed);
        assert_eq!(passes.swap(0, Ordering::Relaxed), 1);
        assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        assert_eq!(passes.swap(0, Ordering::Relaxed), 1);
        assert_eq!(tx.reconcile().unwrap(), Status::Acknowledged);
        assert_eq!(passes.swap(0, Ordering::Relaxed), 1);
        assert_eq!(PLAN_DIGEST_COMPUTATIONS.with(|count| count.get()) - before, 1, "all records reuse only this immutable plan digest");
        let output = f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md");
        fs::write(&output, b"HELLO").unwrap();
        assert!(tx.reconcile().is_err(), "an earlier complete/ACK is never cached content authority");
        assert!(tx.acknowledge().is_err());
        fs::write(&output, b"hello").unwrap();
        fs::write(f.path.join("journal").join(tx.name("started")), b"{}").unwrap();
        assert!(tx.reconcile().is_err(), "existing complete/ACK never hides damaged dependencies");
    }
    #[test]
    fn direct_acknowledgement_preserves_abandoned_and_incomplete_semantics_without_creating_a_copy() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        assert_eq!(tx.acknowledge().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE");
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
        assert_eq!(tx.acknowledge().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE", "prepared is not permission to publish during ACK");
        assert_eq!(tx.abandon().unwrap(), Status::Abandoned);
        assert_eq!(tx.acknowledge().unwrap_err().to_string(), "AI_EXPORT_ABANDONED");
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 0);
        assert!(j.read_bounded(&tx.name("ack"), MAX_RECORD).is_err());
    }
    #[test]
    fn newly_written_complete_receipt_still_checks_changed_content_after_the_durable_write() {
        use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let output = f.path.join("target").join(format!("Export-{}", "b".repeat(32))).join("Dokument_01.md");
        let changed = output.clone(); let passes = Arc::new(AtomicUsize::new(0)); let observed = passes.clone();
        let guard = Lifecycle::default().begin_native().unwrap().with_test_event(move |phase| {
            if phase == "reconcile_inventory" && observed.fetch_add(1, Ordering::Relaxed) == 1 {
                fs::write(&changed, b"WRONG").unwrap();
            }
        });
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        assert!(tx.reconcile().is_err(), "post-receipt verification must refuse changed content");
        assert_eq!(passes.load(Ordering::Relaxed), 2);
        assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_ok(), "test reached the actual durable receipt boundary");
        assert!(tx.acknowledge().is_err());
        assert!(j.read_bounded(&tx.name("ack"), MAX_RECORD).is_err());
        fs::write(output, b"hello").unwrap();
        assert_eq!(tx.reconcile().unwrap(), Status::Completed);
    }
    #[test]
    fn abandonment_reconciles_an_actual_rename_before_reporting_no_export() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        assert_eq!(tx.abandon().unwrap_err().to_string(), "AI_EXPORT_ALREADY_COMPLETE");
        assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_ok());
        assert!(j.read_bounded(&tx.name("abandoned"), MAX_RECORD).is_err());
    }
    #[test]
    fn prepared_stage_resumes_and_collision_is_never_replaced_or_adopted() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap(); let plan = f.plan(&j, &s, &t);
        let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); drop(tx);
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        fs::create_dir(f.path.join("target").join(tx.plan.target_name())).unwrap();
        assert!(tx.commit().is_err()); assert!(tx.abandon().is_err());
        assert_eq!(fs::read_dir(f.path.join("target").join(tx.plan.target_name())).unwrap().count(), 0);
        assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_err());
    }
    #[test]
    fn changed_operation_or_replaced_parent_cannot_rebind_a_saved_intent() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap(); let plan = f.plan(&j, &s, &t);
        Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
        let mut other = plan.clone(); other.request_sha256 = "d".repeat(64);
        assert!(Transaction::open(&j, &s, &t, other, &guard).is_err());
        let other = j.create_private_child("other-target").unwrap();
        assert!(Transaction::open(&j, &s, &other, plan, &guard).is_err());
    }
    #[test]
    fn partial_body_or_unowned_stage_is_retained_without_overwrite() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        let stage = s.create_private_child(&tx.plan.stage_name()).unwrap();
        stage.write_new("Dokument_01.md", b"he").unwrap(); drop(stage);
        assert!(tx.write_body(0, b"hello").is_err()); // no owning record
        assert_eq!(fs::read(f.path.join("staging").join(tx.plan.stage_name()).join("Dokument_01.md")).unwrap(), b"he");
        assert_eq!(tx.abandon().unwrap(), Status::Abandoned);
        assert!(tx.commit().is_err());
    }
    #[test]
    fn cancellation_before_native_rename_keeps_the_known_stage_and_no_receipt() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
        lifecycle.stopping.store(true, std::sync::atomic::Ordering::Release);
        assert!(tx.commit().is_err());
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 0);
        assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_err());
    }
    #[test]
    fn both_known_names_missing_is_uncertain_and_cannot_be_abandoned() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
        tx.record("started", tx.evidence().unwrap().0).unwrap();
        fs::rename(f.path.join("staging").join(tx.plan.stage_name()), f.path.join("staging").join("moved-unknown")).unwrap();
        assert_eq!(tx.reconcile().unwrap_err().to_string(), "AI_EXPORT_UNCERTAIN");
        assert!(tx.abandon().is_err());
        assert!(j.read_bounded(&tx.name("abandoned"), MAX_RECORD).is_err());
    }
    #[test]
    fn damaged_records_and_invalid_neutral_inventory_never_become_success() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap(); let mut plan = f.plan(&j, &s, &t);
        plan.files[0].name = "Originalname.md".into();
        assert!(Transaction::open(&j, &s, &t, plan, &guard).is_err());
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        j.write_new(&tx.name("complete"), b"{}").unwrap();
        assert!(tx.reconcile().is_err()); assert!(tx.abandon().is_err());
    }
    #[test]
    fn kernel_control_ownership_excludes_concurrent_abandonment_and_releases_on_drop() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap(); let plan = f.plan(&j, &s, &t);
        let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
        assert!(Transaction::open(&j, &s, &t, plan.clone(), &guard).is_err());
        drop(tx);
        assert!(Transaction::open(&j, &s, &t, plan, &guard).is_ok());
    }
    #[test]
    fn ordinary_or_broadened_parents_are_refused_before_any_intent_or_body() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(f.path.join("target"), fs::Permissions::from_mode(0o755)).unwrap();
        }
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            let file = fs::OpenOptions::new().access_mode(0x0004_0000 | 0x0002_0000)
                .share_mode(7).custom_flags(0x0200_0000 | 0x0020_0000).open(f.path.join("target")).unwrap();
            crate::export_private_security::broaden_test_directory(&file).unwrap();
        }
        let plan = f.plan(&t, &s, &t);
        assert!(Transaction::open(&t, &s, &t, plan, &guard).is_err());
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 0);
        let plan = f.plan(&j, &t, &t);
        assert!(Transaction::open(&j, &t, &t, plan, &guard).is_err());
        assert_eq!(fs::read_dir(f.path.join("journal")).unwrap().count(), 0);
    }
    #[test]
    fn torn_private_preparations_do_not_poison_started_complete_or_ack_recovery() {
        for kind in ["started", "complete", "ack"] {
            for cut in ["created", "partial", "synced", "renamed"] {
                let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
                let guard = Lifecycle::default().begin_native().unwrap(); let plan = f.plan(&j, &s, &t);
                let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
                tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
                if kind == "complete" { publish_without_receipt(&tx); }
                if kind == "ack" { tx.commit().unwrap(); }
                let bytes = serde_json::to_vec(&Record { schema: format!("datasecure-native-export-{kind}/1"),
                    plan_sha256: tx.plan.digest().unwrap(), stage: tx.evidence().unwrap().0.map(Into::into) }).unwrap();
                assert!(j.write_record_fault(&tx.name(kind), &bytes, cut).is_err(), "{kind}/{cut}");
                drop(tx); drop(j); drop(s); drop(t);
                let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
                let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
                assert!(matches!(tx.commit().unwrap(), Status::Completed | Status::Acknowledged), "{kind}/{cut}");
                assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged, "{kind}/{cut}");
                assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
            }
        }
    }
    // Invoked only by the parent regression below in its own test process.
    // The parent terminates that exact child while it owns the native lock and
    // open handles. No normal Drop/unwind can make this recovery test pass.
    #[test]
    #[ignore = "subprocess-only crash checkpoint"]
    fn process_abort_child() {
        use std::io::Write;
        let root = PathBuf::from(std::env::var_os("DATASECURE_TEST_TX_ROOT").unwrap());
        assert_eq!(root.parent().unwrap(), std::env::temp_dir());
        assert!(root.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-tx-"));
        let kind = std::env::var("DATASECURE_TEST_TX_RECORD").unwrap();
        let cut = std::env::var("DATASECURE_TEST_TX_CUT").unwrap();
        assert!(["started", "complete", "ack"].contains(&kind.as_str()));
        assert!(["created", "partial", "synced", "renamed"].contains(&cut.as_str()));
        // This child borrows the parent's fixture; it never owns cleanup.
        let (j, s, t) = (Directory::open_existing(&root.join("journal"), None).unwrap(),
            Directory::open_existing(&root.join("staging"), None).unwrap(),
            Directory::open_existing(&root.join("target"), None).unwrap());
        let guard = Lifecycle::default().begin_native().unwrap();
        let plan = Plan::new("a".repeat(64), "b".repeat(32), "c".repeat(64), "markdown-and-anonymize".into(),
            vec![ExpectedFile { name: "Dokument_01.md".into(), bytes: 5, sha256: Sha256::digest(b"hello").into() }],
            &Parents { journal: &j, staging: &s, target: &t }).unwrap();
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
        if kind == "complete" { publish_without_receipt(&tx); }
        if kind == "ack" { tx.commit().unwrap(); }
        let bytes = serde_json::to_vec(&Record { schema: format!("datasecure-native-export-{kind}/1"),
            plan_sha256: tx.plan.digest().unwrap(), stage: tx.evidence().unwrap().0.map(Into::into) }).unwrap();
        j.write_record_test_checkpoint(&tx.name(&kind), &bytes, |phase| {
            if phase == cut {
                println!("DATASECURE_TX_KILL_READY");
                std::io::stdout().flush().unwrap();
                loop { std::thread::park(); }
            }
            Ok(())
        }).unwrap();
        panic!("requested checkpoint was not reached");
    }
    #[test]
    fn actual_child_process_termination_recovers_and_releases_kernel_ownership() {
        use std::{io::{BufRead, BufReader}, process::{Child, Command, Stdio}, sync::mpsc, time::Duration};
        struct OwnedChild(Child);
        impl Drop for OwnedChild {
            fn drop(&mut self) {
                if self.0.try_wait().ok().flatten().is_none() { let _ = self.0.kill(); }
                let _ = self.0.wait();
            }
        }
        for kind in ["started", "complete", "ack"] {
            for cut in ["created", "partial", "synced", "renamed"] {
                let f = Fixture::new();
                let mut child = OwnedChild(Command::new(std::env::current_exe().unwrap())
                    // Serial libtest may prefix the marker with its test name.
                    // Exercise that output format on every subprocess run.
                    .args(["--exact", "native_export_transaction::tests::process_abort_child", "--ignored", "--nocapture", "--test-threads=1"])
                    .env("DATASECURE_TEST_TX_ROOT", &f.path).env("DATASECURE_TEST_TX_RECORD", kind)
                    .env("DATASECURE_TEST_TX_CUT", cut).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
                    .spawn().unwrap());
                let stdout = child.0.stdout.take().unwrap();
                let (ready, receive) = mpsc::channel();
                let reader = std::thread::spawn(move || {
                    for line in BufReader::new(stdout).lines() {
                        if line.unwrap_or_default().ends_with("DATASECURE_TX_KILL_READY") { let _ = ready.send(()); return; }
                    }
                });
                let reached = receive.recv_timeout(Duration::from_secs(10));
                // Terminate only the child created above, including on failure.
                if child.0.try_wait().unwrap().is_none() { child.0.kill().unwrap(); }
                let status = child.0.wait().unwrap(); reader.join().unwrap();
                assert!(reached.is_ok(), "child checkpoint {kind}/{cut} not reached");
                assert!(!status.success(), "child must not exit normally");
                let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
                let guard = Lifecycle::default().begin_native().unwrap();
                let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
                assert!(matches!(tx.commit().unwrap(), Status::Completed | Status::Acknowledged), "{kind}/{cut}");
                assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged, "{kind}/{cut}");
                assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
                assert_eq!(fs::read(f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md")).unwrap(), b"hello");
            }
        }
    }
}
