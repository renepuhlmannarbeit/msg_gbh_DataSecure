//! Native durable transaction core. No renderer entry point and no activation
//! of the Node exporter. The composition root must supply an ACL-controlled
//! private journal/staging parent and an already-bound destination capability.
//! Records are exclusive, bounded, handle-relative and immutable. No cleanup,
//! copy fallback, adoption of unknown stages, or automatic new attempts.
#![allow(dead_code)]
use crate::{export_directory::{self, Directory, ExpectedFile, ConfidentialFiles, deserialize_confidential, Identity, RecoveredDirectory, CONFIDENTIAL_DIRECTORY}, ipc_transport::NativeGuard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io;
#[cfg(test)]
use crate::native_export_broker::body_diagnostic::{self, Phase as BodyPhase};

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
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_confidential")]
    confidential: Option<ConfidentialFiles>,
}
pub(crate) struct Parents<'a> { pub journal: &'a Directory, pub staging: &'a Directory, pub target: &'a Directory }
impl Plan {
    pub fn new(batch_id: String, operation_id: String, request_sha256: String, processing_mode: String,
        files: Vec<ExpectedFile>, parents: &Parents<'_>) -> io::Result<Self> {
        let plan = Self { schema: "datasecure-native-export-plan/1".into(), batch_id, operation_id, request_sha256,
            processing_mode, journal: parents.journal.identity().into(), staging_parent: parents.staging.identity().into(),
            target_parent: parents.target.identity().into(), publication_role: None, files, confidential: None };
        plan.validate()?; Ok(plan)
    }
    pub fn with_publication_role(mut self, role: Option<PublicationRole>) -> Self {
        self.publication_role = role; self
    }
    pub fn with_confidential(mut self, confidential: Option<ConfidentialFiles>) -> io::Result<Self> {
        self.confidential = confidential; self.validate()?; Ok(self)
    }
    fn validate(&self) -> io::Result<()> {
        if self.schema != "datasecure-native-export-plan/1" || !hex(&self.batch_id, 64) || !hex(&self.operation_id, 32) ||
            !hex(&self.request_sha256, 64) || !["markdown-only", "markdown-and-anonymize"].contains(&self.processing_mode.as_str()) ||
            self.files.is_empty() || self.files.len() > 200 { return Err(conflict()); }
        self.journal.identity()?; self.staging_parent.identity()?; self.target_parent.identity()?;
        crate::export_directory::validate_publication_inventory(&self.processing_mode,
            self.publication_role == Some(PublicationRole::Results), &self.files, self.confidential.as_ref()).map_err(|_| conflict())?;
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
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfidentialRecord { schema: String, plan_sha256: [u8; 32], stage: ObjectId, directory: ObjectId }
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
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionParents);
        plan.validate()?;
        if plan.journal != journal.identity().into() || plan.staging_parent != staging.identity().into() ||
            plan.target_parent != target.identity().into() { return Err(conflict()); }
        // A caller's assertion of privacy is not authority. Recheck native
        // owner/ACL/mode evidence on every reopened transaction.
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionJournal);
        journal.verify_controlled()?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionStaging);
        staging.verify_controlled()?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionControl);
        guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let control = if existing_only { journal.lock_existing_control()? } else { journal.lock_control()? };
        // The owned plan is immutable for this instance. Reusing its digest
        // never reuses journal evidence, directory authority or inventory facts.
        let plan_sha256 = plan.digest()?;
        let tx = Self { journal, staging, target, plan, guard, plan_sha256, _control: control };
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionIntent);
        if existing_only {
            if tx.read::<Plan>("intent")?.as_ref() != Some(&tx.plan) { return Err(conflict()); }
        } else { tx.put("intent", &tx.plan)?; }
        // Closed record dependencies matter even when a later receipt exists.
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionEvidence);
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
        self.put_with_sync(kind, value, || self.journal.sync())
    }
    fn put_with_sync<T: Serialize>(&self, kind: &str, value: &T, sync: impl FnOnce() -> io::Result<()>) -> io::Result<()> {
        let bytes = serde_json::to_vec(value).map_err(|_| conflict())?;
        if bytes.len() > MAX_RECORD { return Err(conflict()); }
        match self.journal.read_bounded(&self.name(kind), MAX_RECORD) {
            Ok(existing) => return if existing == bytes { sync() } else { Err(conflict()) },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {},
            Err(error) => return Err(error),
        }
        match self.journal.write_record_atomic(&self.name(kind), &bytes) {
            Ok(()) => {},
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {},
            Err(error) => return Err(error),
        }
        if self.journal.read_bounded(&self.name(kind), MAX_RECORD)? != bytes { return Err(conflict()); }
        sync()
    }
    fn record(&self, kind: &str, stage: Option<Identity>) -> io::Result<()> {
        self.put(kind, &Record { schema: format!("datasecure-native-export-{kind}/1"), plan_sha256: self.plan_sha256, stage: stage.map(Into::into) })
    }
    fn existing(&self, kind: &str) -> io::Result<Option<Option<Identity>>> {
        let Some(record) = self.read::<Record>(kind)? else { return Ok(None); };
        if record.schema != format!("datasecure-native-export-{kind}/1") || record.plan_sha256 != self.plan_sha256 { return Err(conflict()); }
        Ok(Some(record.stage.map(|id| id.identity()).transpose()?))
    }
    fn confidential_identity(&self, stage: Option<Identity>, required: bool) -> io::Result<Option<Identity>> {
        let attempted = self.existing("confidential-started")?;
        let saved = self.read::<ConfidentialRecord>("confidential")?;
        if self.plan.confidential.is_none() {
            if attempted.is_some() || saved.is_some() { return Err(conflict()); }
            return Ok(None);
        }
        if attempted.is_some() && (stage.is_none() || attempted != Some(stage)) { return Err(conflict()); }
        if let Some(saved) = saved {
            if saved.schema != "datasecure-native-confidential-directory/1" || saved.plan_sha256 != self.plan_sha256 ||
                Some(saved.stage.identity()?) != stage || attempted != Some(stage) { return Err(conflict()); }
            return Ok(Some(saved.directory.identity()?));
        }
        // A crash between native creation and this receipt is never permission
        // to adopt a same-name child, even after somebody removes that child.
        if attempted.is_some() { return Err(failure("AI_EXPORT_UNCERTAIN")); }
        if required { return Err(failure("AI_EXPORT_INCOMPLETE")); }
        Ok(None)
    }
    fn confidential_stage(&self, stage: &Directory) -> io::Result<Directory> {
        if self.plan.confidential.is_none() { return Err(conflict()); }
        stage.verify_controlled()?;
        if let Some(identity) = self.confidential_identity(Some(stage.identity()), false)? {
            return stage.open_controlled_child(CONFIDENTIAL_DIRECTORY, identity);
        }
        if !stage.child_absent(CONFIDENTIAL_DIRECTORY)? { return Err(conflict()); }
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        self.record("confidential-started", Some(stage.identity()))?;
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let directory = stage.create_controlled_child(CONFIDENTIAL_DIRECTORY)
            .map_err(|_| failure("AI_EXPORT_UNCERTAIN"))?;
        directory.sync()?; stage.sync()?;
        self.put("confidential", &ConfidentialRecord { schema: "datasecure-native-confidential-directory/1".into(),
            plan_sha256: self.plan_sha256, stage: stage.identity().into(), directory: directory.identity().into() })?;
        stage.inspect_child(CONFIDENTIAL_DIRECTORY, directory.identity())?;
        directory.verify_controlled()?;
        Ok(directory)
    }
    fn verify_stage_inventory(&self, stage: &Directory) -> io::Result<()> {
        if let Some(confidential) = &self.plan.confidential {
            let identity = self.confidential_identity(Some(stage.identity()), true)?.ok_or_else(conflict)?;
            stage.open_controlled_child(CONFIDENTIAL_DIRECTORY, identity)?.verify_controlled()?;
            stage.verify_confidential_inventory(&self.plan.files, confidential, identity, false)
        } else { stage.verify_inventory(&self.plan.files) }
    }
    fn verify_recovered_stage_inventory(&self, stage: &RecoveredDirectory<'_>, stage_identity: Identity) -> io::Result<()> {
        if let Some(confidential) = &self.plan.confidential {
            let identity = self.confidential_identity(Some(stage_identity), true)?.ok_or_else(conflict)?;
            stage.verify_confidential_stage_inventory(&self.plan.files, confidential, identity)
        } else { stage.verify_inventory(&self.plan.files) }
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
        self.confidential_identity(identity, prepared.is_some() || started.is_some() || complete.is_some() || ack.is_some())?;
        Ok((identity, prepared.is_some(), started.is_some(), complete.is_some(), ack.is_some(), abandoned.is_some()))
    }
    /// Every body must match the already-bound neutral inventory. A partial
    /// write is preserved and conflicts on resume; it is never overwritten.
    pub fn write_body(&self, index: usize, bytes: &[u8]) -> io::Result<()> {
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionEvidence);
        let (identity, prepared, started, _, _, abandoned) = self.evidence()?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionBody);
        if prepared || started || abandoned { return Err(conflict()); }
        let file = export_directory::publication_body(&self.plan.files, self.plan.confidential.as_ref(), index).ok_or_else(conflict)?;
        if bytes.len() as u64 != file.bytes || <[u8; 32]>::from(Sha256::digest(bytes)) != file.sha256 { return Err(conflict()); }
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionGuard);
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let stage = if let Some(identity) = identity {
            #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionStage);
            self.staging.reopen_private_stage(&self.plan.stage_name(), identity)?
        } else {
            // New confidential stages are themselves admitted as controlled
            // parents before creating the protected child. Inherited Windows
            // ACEs alone do not carry SE_DACL_PROTECTED. Supply the descriptor
            // at exclusive creation; do not weaken verification or repair ACLs.
            let stage = if self.plan.confidential.is_some() {
                self.staging.create_controlled_child(&self.plan.stage_name())?
            } else { self.staging.create_private_child(&self.plan.stage_name())? };
            self.record("stage", Some(stage.identity()))?;
            stage
        };
        let confidential = if index >= self.plan.files.len() { Some(self.confidential_stage(&stage)?) } else { None };
        let destination = confidential.as_ref().unwrap_or(&stage);
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionWrite);
        match destination.write_new(&file.name, bytes) {
            Ok(()) => {},
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {},
            Err(error) => return Err(error),
        }
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionReadback);
        if destination.read_bounded(&file.name, 32_000_000)? != bytes { return Err(conflict()); }
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionSync);
        destination.sync()?;
        if let Some(child) = &confidential { stage.inspect_child(CONFIDENTIAL_DIRECTORY, child.identity())?; }
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionStageSync);
        stage.sync()?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::TransactionPost);
        self.staging.inspect_child(&self.plan.stage_name(), stage.identity())?;
        Ok(())
    }
    pub fn prepare(&self) -> io::Result<()> {
        let (identity, _, started, _, _, abandoned) = self.evidence()?;
        if started || abandoned { return Err(conflict()); }
        let identity = identity.ok_or_else(|| failure("AI_EXPORT_INCOMPLETE"))?;
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let stage = self.staging.open_known_child(&self.plan.stage_name(), identity)?;
        self.verify_recovered_stage_inventory(&stage, identity)?;
        self.record("prepared", Some(identity))
    }
    /// Reconcile before retry, ACK and abandonment. A receipt alone is never
    /// evidence that the exact destination still exists with the same contents.
    fn verify_published_inventory(&self, output: &RecoveredDirectory<'_>) -> io::Result<()> {
        // Only this already-published public target gains the exact metadata
        // exception. Its Results role is part of the durable hashed plan.
        if self.plan.publication_role == Some(PublicationRole::Results) {
            if let Some(confidential) = &self.plan.confidential {
                let stage = self.existing("stage")?.flatten();
                let identity = self.confidential_identity(stage, true)?.ok_or_else(conflict)?;
                output.verify_confidential_results_inventory(&self.plan.files, confidential, identity)
            } else { output.verify_public_results_inventory(&self.plan.files) }
        } else {
            output.verify_inventory(&self.plan.files)
        }
    }
    pub fn reconcile(&self) -> io::Result<Status> {
        let (identity, prepared, started, complete, ack, abandoned) = self.evidence()?;
        if abandoned { return Ok(Status::Abandoned); }
        if !started { return Ok(if prepared { Status::Prepared } else { Status::Unprepared }); }
        let identity = identity.ok_or_else(conflict)?;
        match self.target.open_known_child(&self.plan.target_name(), identity) {
            Ok(output) => {
                #[cfg(test)] self.guard.test_event("reconcile_inventory");
                self.verify_published_inventory(&output)?;
                if !complete {
                    self.record("complete", Some(identity))?;
                    // A new durable receipt still requires verification on
                    // both sides of its write. Existing complete evidence was
                    // freshly checked above; no duplicate body pass is needed.
                    #[cfg(test)] self.guard.test_event("reconcile_inventory");
                    self.verify_published_inventory(&output)?;
                }
                Ok(if ack { Status::Acknowledged } else { Status::Completed })
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound && !complete => {
                // Both names missing is not proof of cancellation. Only the
                // exact known complete stage permits another publication try.
                let stage = self.staging.open_known_child(&self.plan.stage_name(), identity)
                    .map_err(|_| failure("AI_EXPORT_UNCERTAIN"))?;
                self.verify_recovered_stage_inventory(&stage, identity)?;
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
        self.verify_published_inventory(&output)?;
        Ok(if ack { Status::Acknowledged } else { Status::Completed })
    }
    /// A confirmed Results directory is a public working copy. Its files may
    /// subsequently be edited, removed or extended outside DataSecure. This
    /// read-only opener proves the original completion and exact directory,
    /// not the continued equality of public bytes. It must never be used by
    /// prepare/publish/reconcile/ACK or by a legacy export role.
    pub fn inspect_completed_directory(&self) -> io::Result<Status> {
        if self.plan.publication_role != Some(PublicationRole::Results) { return Err(conflict()); }
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        let evidence = self.evidence()?;
        let (identity, _, _, complete, ack, abandoned) = evidence;
        if abandoned { return Err(failure("AI_EXPORT_ABANDONED")); }
        if !complete { return Err(failure("AI_EXPORT_INCOMPLETE")); }
        let identity = identity.ok_or_else(conflict)?;
        // Retain the actual recovery handle across the final name/parent and
        // private-evidence rechecks. No public leaf or inventory is opened.
        let _output = self.target.open_known_child(&self.plan.target_name(), identity)?;
        #[cfg(test)] self.guard.test_event("inspect_completed_directory_bound");
        self.target.inspect_child(&self.plan.target_name(), identity)?;
        if self.evidence()? != evidence { return Err(conflict()); }
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
        self.target.inspect_child(&self.plan.target_name(), identity)?;
        self.guard.checkpoint().map_err(|_| failure("STANDALONE_CLOSING"))?;
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
        self.verify_stage_inventory(&stage)?;
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
    use crate::export_directory::{ConfidentialFile, FILENAME_MAPPING, IDENTITIES_FILE};
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
    fn companions() -> ConfidentialFiles {
        ConfidentialFiles { filename_mapping: ConfidentialFile { bytes: 7, sha256: Sha256::digest(b"mapping").into() },
            identities: ConfidentialFile { bytes: 10, sha256: Sha256::digest(b"identities").into() }, workbook: None }
    }
    fn results_with_companions(f: &Fixture, j: &Directory, s: &Directory, t: &Directory) -> Plan {
        f.plan(j, s, t).with_publication_role(Some(PublicationRole::Results)).with_confidential(Some(companions())).unwrap()
    }
    fn stage_all(tx: &Transaction<'_>) {
        tx.write_body(0, b"hello").unwrap(); tx.write_body(1, b"mapping").unwrap(); tx.write_body(2, b"identities").unwrap();
    }
    fn workbook_companions() -> ConfidentialFiles {
        let mut value = companions();
        value.workbook = Some(ConfidentialFile { bytes: 8, sha256: Sha256::digest(b"workbook").into() }); value
    }
    #[test]
    fn confidential_plan_is_closed_optional_digest_bound_and_never_a_legacy_or_markdown_capability() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let legacy = f.plan(&j, &s, &t);
        assert!(!String::from_utf8_lossy(&serde_json::to_vec(&legacy).unwrap()).contains("confidential"));
        assert!(legacy.clone().with_confidential(Some(companions())).is_err());
        let results = legacy.clone().with_publication_role(Some(PublicationRole::Results));
        let current = results.clone().with_confidential(Some(companions())).unwrap();
        assert_ne!(current.digest().unwrap(), results.digest().unwrap());
        let mut changed = companions(); changed.identities.sha256[0] ^= 1;
        assert_ne!(current.digest().unwrap(), results.clone().with_confidential(Some(changed)).unwrap().digest().unwrap());
        let mut markdown = results; markdown.processing_mode = "markdown-only".into(); markdown.files[0].name = "source.md".into();
        assert!(markdown.with_confidential(Some(companions())).is_err());
        for invalid in [serde_json::Value::Null, serde_json::json!({}), serde_json::json!({"path":"anywhere"})] {
            let mut value = serde_json::to_value(&current).unwrap(); value["confidential"] = invalid;
            assert!(serde_json::from_value::<Plan>(value).is_err());
        }
        let mut partial = serde_json::to_value(&current).unwrap(); partial["confidential"].as_object_mut().unwrap().remove("identities");
        assert!(serde_json::from_value::<Plan>(partial).is_err());
    }
    #[test]
    fn confidential_generation_publishes_both_companions_with_lost_receipt_recovery_but_never_repairs_a_deleted_file() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let plan = results_with_companions(&f, &j, &s, &t);
        {
            let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); assert!(tx.prepare().is_err(), "both companions are required");
            tx.write_body(1, b"mapping").unwrap(); assert!(tx.prepare().is_err(), "one companion is not a completed generation");
            tx.write_body(2, b"identities").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
            assert_eq!(tx.inspect_completed().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE");
        }
        drop(j); drop(s); drop(t);
        let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        assert_eq!(tx.commit().unwrap(), Status::Completed);
        assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        let target = f.path.join("target").join(tx.plan.target_name()); let confidential = target.join(CONFIDENTIAL_DIRECTORY);
        assert_eq!(fs::read_dir(&target).unwrap().count(), 2);
        assert_eq!(fs::read_dir(&confidential).unwrap().count(), 2);
        assert_eq!(fs::read(confidential.join(FILENAME_MAPPING)).unwrap(), b"mapping");
        assert_eq!(fs::read(confidential.join(IDENTITIES_FILE)).unwrap(), b"identities");
        assert_eq!(tx.inspect_completed().unwrap(), Status::Acknowledged);
        fs::remove_file(confidential.join(FILENAME_MAPPING)).unwrap();
        assert!(tx.inspect_completed().is_err()); assert!(tx.commit().is_err());
        assert!(!confidential.join(FILENAME_MAPPING).exists(), "a missing published companion is never recreated");
        assert_eq!(fs::read(target.join("Dokument_01.md")).unwrap(), b"hello");
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1, "no replacement generation");
    }
    #[test]
    fn confidential_workbook_plan_is_digest_bound_and_never_reinterprets_a_legacy_two_file_intent() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let legacy = results_with_companions(&f, &j, &s, &t);
        let current = legacy.clone().with_confidential(Some(workbook_companions())).unwrap();
        assert_ne!(current.digest().unwrap(), legacy.digest().unwrap());
        let mut changed = workbook_companions(); changed.workbook.as_mut().unwrap().sha256[0] ^= 1;
        assert_ne!(current.digest().unwrap(), legacy.clone().with_confidential(Some(changed)).unwrap().digest().unwrap());
        let mut invalid = serde_json::to_value(&current).unwrap(); invalid["confidential"]["workbook"] = serde_json::Value::Null;
        assert!(serde_json::from_value::<Plan>(invalid).is_err());
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        { let tx = Transaction::open(&j, &s, &t, legacy.clone(), &guard).unwrap(); stage_all(&tx); }
        assert!(Transaction::open(&j, &s, &t, current, &guard).is_err());
        let tx = Transaction::open(&j, &s, &t, legacy, &guard).unwrap(); tx.prepare().unwrap(); tx.commit().unwrap();
        let confidential = f.path.join("target").join(tx.plan.target_name()).join(CONFIDENTIAL_DIRECTORY);
        assert_eq!(fs::read_dir(&confidential).unwrap().count(), 2);
        assert_eq!(fs::read(confidential.join(IDENTITIES_FILE)).unwrap(), b"identities");
        assert!(!confidential.join("Pseudonym-Zuordnung.xlsx").exists());
    }
    #[test]
    fn confidential_workbook_generation_requires_all_three_bodies_and_recovers_without_renaming_or_repair() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let plan = results_with_companions(&f, &j, &s, &t).with_confidential(Some(workbook_companions())).unwrap();
        {
            let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap(); stage_all(&tx);
            assert!(tx.prepare().is_err(), "the workbook is a required third promised body");
            tx.write_body(3, b"workbook").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
            assert_eq!(tx.inspect_completed().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE");
        }
        drop(j); drop(s); drop(t);
        let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        assert_eq!(tx.commit().unwrap(), Status::Completed); assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        let target = f.path.join("target").join(tx.plan.target_name()); let confidential = target.join(CONFIDENTIAL_DIRECTORY);
        let mut names: Vec<_> = fs::read_dir(&confidential).unwrap().map(|entry| entry.unwrap().file_name()).collect(); names.sort();
        assert_eq!(names, ["Dateizuordnung.csv", "Pseudonym-Zuordnung.txt", "Pseudonym-Zuordnung.xlsx"].map(std::ffi::OsString::from));
        assert_eq!(fs::read(confidential.join("Pseudonym-Zuordnung.txt")).unwrap(), b"identities");
        assert_eq!(fs::read(confidential.join("Pseudonym-Zuordnung.xlsx")).unwrap(), b"workbook");
        assert!(!confidential.join(IDENTITIES_FILE).exists(), "no duplicate old-name identity file");
        fs::remove_file(confidential.join("Pseudonym-Zuordnung.xlsx")).unwrap();
        assert!(tx.inspect_completed().is_err()); assert!(tx.commit().is_err());
        assert!(!confidential.join("Pseudonym-Zuordnung.xlsx").exists());
        assert_eq!(fs::read(target.join("Dokument_01.md")).unwrap(), b"hello");
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
    }
    #[test]
    fn confidential_workbook_inventory_rejects_tampering_old_alias_links_and_directory_replacement() {
        for damage in ["body", "old-alias", "hardlink", "directory-replacement"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let plan = results_with_companions(&f, &j, &s, &t).with_confidential(Some(workbook_companions())).unwrap();
            let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap(); stage_all(&tx); tx.write_body(3, b"workbook").unwrap();
            tx.prepare().unwrap(); tx.commit().unwrap();
            let target = f.path.join("target").join(tx.plan.target_name()); let child = target.join(CONFIDENTIAL_DIRECTORY);
            match damage {
                "body" => fs::write(child.join("Pseudonym-Zuordnung.xlsx"), b"modified").unwrap(),
                "old-alias" => fs::write(child.join(IDENTITIES_FILE), b"identities").unwrap(),
                "hardlink" => fs::hard_link(child.join("Pseudonym-Zuordnung.xlsx"), f.path.join("foreign-link")).unwrap(),
                "directory-replacement" => {
                    let retired = f.path.join("retired-confidential"); fs::rename(&child, &retired).unwrap(); fs::create_dir(&child).unwrap();
                    for name in [FILENAME_MAPPING, "Pseudonym-Zuordnung.txt", "Pseudonym-Zuordnung.xlsx"] {
                        fs::copy(retired.join(name), child.join(name)).unwrap();
                    }
                },
                _ => unreachable!(),
            }
            assert!(tx.inspect_completed().is_err(), "{damage}"); assert!(tx.acknowledge().is_err(), "{damage}");
            assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
        }
    }
    #[test]
    fn confidential_inventory_rejects_changed_bodies_extras_hardlinks_and_equal_byte_directory_replacement() {
        for damage in ["body", "extra", "hardlink", "subdirectory", "root-extra", "directory-replacement"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let tx = Transaction::open(&j, &s, &t, results_with_companions(&f, &j, &s, &t), &guard).unwrap();
            stage_all(&tx); tx.prepare().unwrap(); tx.commit().unwrap();
            let target = f.path.join("target").join(tx.plan.target_name()); let child = target.join(CONFIDENTIAL_DIRECTORY);
            match damage {
                "body" => fs::write(child.join(FILENAME_MAPPING), b"changed").unwrap(),
                "extra" => fs::write(child.join("extra.csv"), b"extra").unwrap(),
                "hardlink" => fs::hard_link(child.join(IDENTITIES_FILE), f.path.join("foreign-link")).unwrap(),
                "subdirectory" => fs::create_dir(child.join("other")).unwrap(),
                "root-extra" => fs::write(target.join("other.txt"), b"extra").unwrap(),
                "directory-replacement" => {
                    fs::rename(&child, f.path.join("original-confidential")).unwrap(); fs::create_dir(&child).unwrap();
                    fs::write(child.join(FILENAME_MAPPING), b"mapping").unwrap(); fs::write(child.join(IDENTITIES_FILE), b"identities").unwrap();
                },
                _ => unreachable!(),
            }
            assert!(tx.inspect_completed().is_err(), "{damage}");
            assert!(tx.acknowledge().is_err(), "{damage}");
            assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1);
        }
    }
    #[cfg(unix)]
    #[test]
    fn confidential_results_never_follow_symlinked_sidecar_directories_or_leaves() {
        for directory in [false, true] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let tx = Transaction::open(&j, &s, &t, results_with_companions(&f, &j, &s, &t), &guard).unwrap();
            stage_all(&tx); tx.prepare().unwrap(); tx.commit().unwrap();
            let child = f.path.join("target").join(tx.plan.target_name()).join(CONFIDENTIAL_DIRECTORY);
            let path = if directory { child } else { child.join(IDENTITIES_FILE) };
            let original = f.path.join("original-object");
            fs::rename(&path, &original).unwrap(); std::os::unix::fs::symlink(&original, &path).unwrap();
            let refused = tx.inspect_completed().is_err();
            fs::remove_file(&path).unwrap(); fs::rename(&original, &path).unwrap();
            assert!(refused, "directory={directory}");
            assert_eq!(tx.inspect_completed().unwrap(), Status::Completed);
        }
    }
    #[test]
    fn confidential_directory_without_a_durable_creation_receipt_is_never_adopted_or_recreated() {
        for attempted in [false, true] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let plan = results_with_companions(&f, &j, &s, &t);
            let tx = Transaction::open(&j, &s, &t, plan.clone(), &guard).unwrap(); tx.write_body(0, b"hello").unwrap();
            let stage_id = tx.evidence().unwrap().0.unwrap(); let child = f.path.join("staging").join(tx.plan.stage_name()).join(CONFIDENTIAL_DIRECTORY);
            if attempted { tx.record("confidential-started", Some(stage_id)).unwrap(); }
            fs::create_dir(&child).unwrap();
            assert!(tx.write_body(1, b"mapping").is_err()); assert_eq!(fs::read_dir(&child).unwrap().count(), 0);
            assert!(tx.read::<ConfidentialRecord>("confidential").unwrap().is_none());
            if attempted {
                fs::remove_dir(&child).unwrap();
                assert_eq!(tx.write_body(1, b"mapping").unwrap_err().to_string(), "AI_EXPORT_UNCERTAIN");
                assert!(!child.exists(), "deleting an unconfirmed attempt grants no new creation");
                drop(tx);
                assert!(Transaction::open(&j, &s, &t, plan, &guard).is_err());
            }
        }
    }
    #[test]
    fn confidential_private_staging_has_no_finder_metadata_exception() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, results_with_companions(&f, &j, &s, &t), &guard).unwrap(); stage_all(&tx);
        let metadata = f.path.join("staging").join(tx.plan.stage_name()).join(CONFIDENTIAL_DIRECTORY).join(".DS_Store");
        fs::write(&metadata, b"opaque").unwrap(); assert!(tx.prepare().is_err()); fs::remove_file(&metadata).unwrap();
        tx.prepare().unwrap(); tx.commit().unwrap();
        let metadata = f.path.join("target").join(tx.plan.target_name()).join(CONFIDENTIAL_DIRECTORY).join(".DS_Store");
        fs::write(&metadata, b"opaque").unwrap();
        #[cfg(target_os = "macos")] assert_eq!(tx.inspect_completed().unwrap(), Status::Completed);
        #[cfg(not(target_os = "macos"))] assert!(tx.inspect_completed().is_err());
        fs::write(&metadata, vec![0u8; 1024 * 1024 + 1]).unwrap(); assert!(tx.inspect_completed().is_err());
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
    #[cfg(target_os = "macos")]
    #[test]
    fn results_public_metadata_does_not_change_receipts_or_turn_read_into_completion() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let plan = f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results));
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); publish_without_receipt(&tx);
        let output = f.path.join("target").join(tx.plan.target_name());
        let metadata = output.join(".DS_Store"); fs::write(&metadata, b"Finder-one").unwrap();
        let completion = f.path.join("journal").join(tx.name("complete"));
        assert_eq!(tx.inspect_completed().unwrap_err().to_string(), "AI_EXPORT_INCOMPLETE");
        assert!(!completion.exists(), "metadata grants no receipt-repair authority to history");
        assert_eq!(tx.reconcile().unwrap(), Status::Completed);
        let complete_bytes = fs::read(&completion).unwrap();
        assert_eq!(tx.plan.files.len(), 1);
        assert!(!String::from_utf8_lossy(&serde_json::to_vec(&tx.plan).unwrap()).contains(".DS_Store"));
        fs::write(&metadata, b"Finder-two-longer-and-opaque").unwrap();
        assert_eq!(tx.inspect_completed().unwrap(), Status::Completed);
        assert_eq!(fs::read(&completion).unwrap(), complete_bytes);
        assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        let ack = f.path.join("journal").join(tx.name("ack")); let ack_bytes = fs::read(&ack).unwrap();
        fs::write(&metadata, b"Finder-three").unwrap();
        assert_eq!(tx.reconcile().unwrap(), Status::Acknowledged);
        assert_eq!(tx.inspect_completed().unwrap(), Status::Acknowledged);
        assert_eq!(fs::read(&completion).unwrap(), complete_bytes); assert_eq!(fs::read(&ack).unwrap(), ack_bytes);
        assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1, "no second result generation");
        fs::write(output.join("Dokument_01.md"), b"WRONG").unwrap();
        assert!(tx.reconcile().is_err()); assert!(tx.inspect_completed().is_err()); assert!(tx.acknowledge().is_err());
        assert_eq!(fs::read(&metadata).unwrap(), b"Finder-three");
    }
    #[cfg(windows)]
    #[test]
    fn windows_results_metadata_refusal_preserves_receipts_read_only_semantics_and_files() {
        for completed in [false, true] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let guard = Lifecycle::default().begin_native().unwrap();
            let plan = f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results));
            let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap();
            if completed { assert_eq!(tx.commit().unwrap(), Status::Completed); }
            else { publish_without_receipt(&tx); }
            let completion = f.path.join("journal").join(tx.name("complete"));
            let before = if completed { Some(fs::read(&completion).unwrap()) } else { None };
            let output = f.path.join("target").join(tx.plan.target_name());
            let metadata = output.join(".DS_Store"); fs::write(&metadata, b"transported Finder metadata").unwrap();
            assert!(tx.reconcile().is_err()); assert!(tx.inspect_completed().is_err()); assert!(tx.acknowledge().is_err());
            match before {
                Some(bytes) => assert_eq!(fs::read(&completion).unwrap(), bytes),
                None => assert!(!completion.exists(), "no receipt repair when public inventory is refused"),
            }
            assert!(j.read_bounded(&tx.name("ack"), MAX_RECORD).is_err());
            assert_eq!(fs::read(&metadata).unwrap(), b"transported Finder metadata");
            assert_eq!(fs::read(output.join("Dokument_01.md")).unwrap(), b"hello");
            assert_eq!(fs::read_dir(output).unwrap().count(), 2);
            assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 1, "no regeneration or second copy");
        }
    }
    #[test]
    fn metadata_never_enters_private_prepare_or_commit_for_either_role() {
        for role in [None, Some(PublicationRole::Results)] {
            for boundary in ["before-prepare", "after-prepare"] {
                let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
                let guard = Lifecycle::default().begin_native().unwrap();
                let plan = f.plan(&j, &s, &t).with_publication_role(role);
                let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
                tx.write_body(0, b"hello").unwrap();
                if boundary == "after-prepare" { tx.prepare().unwrap(); }
                let metadata = f.path.join("staging").join(tx.plan.stage_name()).join(".DS_Store");
                fs::write(&metadata, b"not permitted in private stage").unwrap();
                if boundary == "before-prepare" { assert!(tx.prepare().is_err()); }
                assert!(tx.commit().is_err(), "{role:?}/{boundary}");
                assert_eq!(fs::read_dir(f.path.join("target")).unwrap().count(), 0);
                assert!(j.read_bounded(&tx.name("started"), MAX_RECORD).is_err());
                assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_err());
                assert!(j.read_bounded(&tx.name("ack"), MAX_RECORD).is_err());
                assert_eq!(fs::read(&metadata).unwrap(), b"not permitted in private stage");
            }
        }
    }
    #[test]
    fn legacy_public_export_stays_strict_and_metadata_never_receives_an_ack() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); assert_eq!(tx.commit().unwrap(), Status::Completed);
        let completion = f.path.join("journal").join(tx.name("complete")); let bytes = fs::read(&completion).unwrap();
        let metadata = f.path.join("target").join(tx.plan.target_name()).join(".DS_Store");
        fs::write(&metadata, b"Finder").unwrap();
        assert!(tx.reconcile().is_err()); assert!(tx.inspect_completed().is_err()); assert!(tx.acknowledge().is_err());
        assert_eq!(fs::read(&completion).unwrap(), bytes); assert!(j.read_bounded(&tx.name("ack"), MAX_RECORD).is_err());
        assert_eq!(fs::read(&metadata).unwrap(), b"Finder");
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
    fn completed_results_directory_is_a_working_copy_but_every_mutating_route_stays_strict() {
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let mut files = companions(); files.workbook = Some(ConfidentialFile { bytes: 8, sha256: Sha256::digest(b"workbook").into() });
        let plan = f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results)).with_confidential(Some(files)).unwrap();
        let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
        stage_all(&tx); tx.write_body(3, b"workbook").unwrap(); tx.prepare().unwrap();
        assert_eq!(tx.commit().unwrap(), Status::Completed); assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        let complete = j.read_bounded(&tx.name("complete"), MAX_RECORD).unwrap();
        let ack = j.read_bounded(&tx.name("ack"), MAX_RECORD).unwrap();
        let target = f.path.join("target").join(tx.plan.target_name());
        fs::write(target.join("Dokument_01.md"), b"a deliberate external edit").unwrap();
        fs::remove_file(target.join(CONFIDENTIAL_DIRECTORY).join("Pseudonym-Zuordnung.xlsx")).unwrap();
        fs::write(target.join("~$Pseudonym-Zuordnung.xlsx"), b"public Office lock").unwrap();
        fs::create_dir(target.join("manual-notes")).unwrap();
        assert_eq!(tx.inspect_completed_directory().unwrap(), Status::Acknowledged);
        assert!(tx.inspect_completed().is_err()); assert!(tx.reconcile().is_err());
        assert!(tx.acknowledge().is_err()); assert!(tx.commit().is_err());
        assert_eq!(fs::read(target.join("Dokument_01.md")).unwrap(), b"a deliberate external edit");
        assert!(!target.join(CONFIDENTIAL_DIRECTORY).join("Pseudonym-Zuordnung.xlsx").exists());
        assert_eq!(j.read_bounded(&tx.name("complete"), MAX_RECORD).unwrap(), complete);
        assert_eq!(j.read_bounded(&tx.name("ack"), MAX_RECORD).unwrap(), ack);
        // No promised public child, including the confidential directory, is
        // needed to open the original confirmed top-level working directory.
        fs::remove_file(target.join("Dokument_01.md")).unwrap();
        fs::rename(target.join(CONFIDENTIAL_DIRECTORY), target.join("manually-renamed-private-aids")).unwrap();
        assert_eq!(tx.inspect_completed_directory().unwrap(), Status::Acknowledged);
    }
    #[test]
    fn working_directory_inspection_requires_results_role_and_actual_durable_completion() {
        for phase in ["empty", "body", "prepared", "renamed-without-complete", "abandoned", "legacy-complete"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let guard = Lifecycle::default().begin_native().unwrap();
            let plan = f.plan(&j, &s, &t).with_publication_role(if phase == "legacy-complete" { None } else { Some(PublicationRole::Results) });
            let tx = Transaction::open(&j, &s, &t, plan, &guard).unwrap();
            if phase != "empty" { tx.write_body(0, b"hello").unwrap(); }
            if ["prepared", "renamed-without-complete", "legacy-complete"].contains(&phase) { tx.prepare().unwrap(); }
            if phase == "renamed-without-complete" { publish_without_receipt(&tx); }
            if phase == "abandoned" { assert_eq!(tx.abandon().unwrap(), Status::Abandoned); }
            if phase == "legacy-complete" { assert_eq!(tx.commit().unwrap(), Status::Completed); }
            let names: Vec<_> = fs::read_dir(f.path.join("journal")).unwrap().map(|item| item.unwrap().file_name()).collect();
            assert!(tx.inspect_completed_directory().is_err(), "{phase} cannot mint a working-copy authority");
            assert_eq!(fs::read_dir(f.path.join("journal")).unwrap().count(), names.len(), "inspection never repairs completion");
            if phase == "renamed-without-complete" { assert!(j.read_bounded(&tx.name("complete"), MAX_RECORD).is_err()); }
        }
    }
    #[test]
    fn working_directory_inspection_refuses_private_proof_damage_even_after_real_completion() {
        for damage in ["complete", "started", "prepared", "intent", "ack"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let guard = Lifecycle::default().begin_native().unwrap();
            let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results)), &guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); tx.commit().unwrap(); tx.acknowledge().unwrap();
            fs::write(f.path.join("journal").join(tx.name(damage)), b"{}").unwrap();
            assert!(tx.inspect_completed_directory().is_err(), "damaged {damage} is not public editing");
            assert_eq!(fs::read(f.path.join("journal").join(tx.name(damage))).unwrap(), b"{}");
            assert_eq!(fs::read(f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md")).unwrap(), b"hello");
        }
    }
    #[test]
    fn working_directory_inspection_rechecks_guard_name_and_private_evidence_after_binding() {
        use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
        for change in ["closing", "folder-replaced", "proof-changed"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let lifecycle = Lifecycle::default(); let stopping = lifecycle.stopping.clone();
            let fired = Arc::new(AtomicBool::new(false)); let observed = fired.clone();
            let rename_blocked = Arc::new(AtomicBool::new(false)); let observed_block = rename_blocked.clone();
            let target = f.path.join("target").join(format!("Ergebnisse-{}", "b".repeat(32)));
            let completion = f.path.join("journal").join(format!("{}-complete.json", "b".repeat(32)));
            let guard = lifecycle.begin_native().unwrap().with_test_event(move |phase| {
                if phase == "inspect_completed_directory_bound" && !observed.swap(true, Ordering::Relaxed) {
                    match change {
                        "closing" => stopping.store(true, Ordering::Release),
                        "folder-replaced" => match fs::rename(&target, target.with_file_name("retired")) {
                            Ok(()) => fs::create_dir(&target).unwrap(),
                            Err(error) => {
                                // Windows may keep this recovery handle's
                                // no-delete-sharing pin through the boundary.
                                // A blocked swap is not a changed directory.
                                #[cfg(windows)] {
                                    assert_eq!(error.raw_os_error(), Some(32));
                                    observed_block.store(true, Ordering::Release);
                                }
                                #[cfg(not(windows))] { let _ = &observed_block; panic!("unexpected directory rename failure: {error}"); }
                            },
                        },
                        "proof-changed" => fs::write(&completion, b"{}").unwrap(), _ => unreachable!(),
                    }
                }
            });
            let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results)), &guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); tx.commit().unwrap(); tx.acknowledge().unwrap();
            let result = tx.inspect_completed_directory();
            if rename_blocked.load(Ordering::Acquire) {
                assert_eq!(result.unwrap(), Status::Acknowledged, "kernel refused the swap while the original directory stayed bound");
                assert_eq!(fs::read(f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md")).unwrap(), b"hello");
            } else { assert!(result.is_err(), "{change} cannot outlive the bound read"); }
            assert!(fired.load(Ordering::Relaxed));
        }
    }
    #[cfg(windows)]
    #[test]
    fn working_directory_inspection_never_opens_a_public_leaf_with_exclusive_windows_sharing() {
        use std::os::windows::fs::OpenOptionsExt;
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results)), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); tx.commit().unwrap(); tx.acknowledge().unwrap();
        let target = f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md");
        let held = fs::OpenOptions::new().read(true).share_mode(0).open(&target).unwrap();
        assert_eq!(tx.inspect_completed_directory().unwrap(), Status::Acknowledged);
        assert!(tx.inspect_completed().is_err(), "the original strict inspector still attempts its content read");
        drop(held);
        assert_eq!(fs::read(&target).unwrap(), b"hello");
    }
    #[cfg(unix)]
    #[test]
    fn working_directory_inspection_allows_changed_leaf_ctime_without_changed_bytes() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
        let guard = Lifecycle::default().begin_native().unwrap();
        let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t).with_publication_role(Some(PublicationRole::Results)), &guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); tx.commit().unwrap(); tx.acknowledge().unwrap();
        let target = f.path.join("target").join(tx.plan.target_name()).join("Dokument_01.md");
        let before = fs::metadata(&target).unwrap(); let mode = before.permissions().mode();
        fs::set_permissions(&target, fs::Permissions::from_mode(mode ^ 0o200)).unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(mode)).unwrap();
        let after = fs::metadata(&target).unwrap();
        assert_ne!((before.ctime(), before.ctime_nsec()), (after.ctime(), after.ctime_nsec()));
        assert_eq!(fs::read(&target).unwrap(), b"hello");
        assert_eq!(tx.inspect_completed_directory().unwrap(), Status::Acknowledged);
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
    #[test]
    fn byte_identical_complete_and_ack_retries_confirm_directory_sync() {
        for kind in ["complete", "ack"] {
            let f = Fixture::new(); let (j, s, t) = (f.open("journal"), f.open("staging"), f.open("target"));
            let guard = Lifecycle::default().begin_native().unwrap();
            let tx = Transaction::open(&j, &s, &t, f.plan(&j, &s, &t), &guard).unwrap();
            let record = Record { schema: format!("datasecure-native-export-{kind}/1"),
                plan_sha256: tx.plan.digest().unwrap(), stage: None };
            let bytes = serde_json::to_vec(&record).unwrap();
            assert!(j.write_record_fault(&tx.name(kind), &bytes, "renamed").is_err());
            assert_eq!(j.read_bounded(&tx.name(kind), MAX_RECORD).unwrap(), bytes);
            let calls = std::cell::Cell::new(0);
            let error = tx.put_with_sync(kind, &record, || {
                calls.set(calls.get() + 1); Err(io::Error::other("INJECTED_DIRECTORY_SYNC_FAILURE"))
            }).unwrap_err();
            assert_eq!(error.to_string(), "INJECTED_DIRECTORY_SYNC_FAILURE");
            assert_eq!(calls.get(), 1, "{kind}: a visible final name does not prove durable directory metadata");
            tx.put_with_sync(kind, &record, || { calls.set(calls.get() + 1); j.sync() }).unwrap();
            assert_eq!(calls.get(), 2, "{kind}: retry must confirm the same bound journal");
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
