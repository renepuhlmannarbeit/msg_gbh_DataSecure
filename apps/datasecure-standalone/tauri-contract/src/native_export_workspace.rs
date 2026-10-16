//! Private-parent composition for the native transaction, not a renderer API.
//! The caller supplies an already-controlled private root and the previously
//! bound public destination. Never derive recovery ownership from a fresh stat.
//! A lost parent-creation receipt is uncertain, not permission to adopt or retry
//! into another directory. No cleanup, permission repair or copy fallback.
#![allow(dead_code)]
use crate::{export_directory::{Directory, ExpectedFile, Identity}, ipc_transport::NativeGuard,
    native_export_transaction::{Parents, Plan, Transaction}};
use serde::{Deserialize, Serialize};
use std::io;

const LIMIT: usize = 128 * 1024;
fn error(code: &'static str) -> io::Error { io::Error::other(code) }
fn conflict() -> io::Error { error("AI_EXPORT_CONFLICT") }
fn hex(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ObjectId { volume: String, object: String, created_ns: String }
impl From<Identity> for ObjectId {
    fn from(id: Identity) -> Self { Self { volume: id.volume.to_string(), object: id.object.to_string(), created_ns: id.created_ns.to_string() } }
}
impl ObjectId {
    fn identity(&self) -> io::Result<Identity> {
        let id = Identity { volume: self.volume.parse().map_err(|_| conflict())?, object: self.object.parse().map_err(|_| conflict())?,
            created_ns: self.created_ns.parse().map_err(|_| conflict())? };
        if Self::from(id) != *self { return Err(conflict()); }
        Ok(id)
    }
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Request {
    batch_id: String, operation_id: String, request_sha256: String, processing_mode: String,
    private_root: ObjectId, target: ObjectId, files: Vec<ExpectedFile>,
}
impl Request {
    pub fn new(batch_id: String, operation_id: String, request_sha256: String, processing_mode: String,
        files: Vec<ExpectedFile>, private_root: &Directory, target: &Directory) -> io::Result<Self> {
        let request = Self { batch_id, operation_id, request_sha256, processing_mode, files,
            private_root: private_root.identity().into(), target: target.identity().into() };
        request.validate()?; Ok(request)
    }
    fn validate(&self) -> io::Result<()> {
        if !hex(&self.batch_id, 64) || !hex(&self.operation_id, 32) || !hex(&self.request_sha256, 64) ||
            !["markdown-only", "markdown-and-anonymize"].contains(&self.processing_mode.as_str()) ||
            self.files.is_empty() || self.files.len() > 200 { return Err(conflict()); }
        let root = self.private_root.identity()?; let target = self.target.identity()?;
        if root == target { return Err(conflict()); }
        if root.volume != target.volume { return Err(error("AI_EXPORT_VOLUME_MISMATCH")); }
        let mut total = 0u64;
        crate::export_directory::validate_export_names(&self.processing_mode, &self.files).map_err(|_| conflict())?;
        for file in &self.files {
            if file.bytes > 32_000_000 { return Err(conflict()); }
            total = total.checked_add(file.bytes).ok_or_else(conflict)?;
            if total > 500 * 1024 * 1024 { return Err(conflict()); }
        }
        Ok(())
    }
    fn journal_name(&self) -> String { format!("journal-{}", self.operation_id) }
    fn staging_name(&self) -> String { format!("staging-{}", self.operation_id) }
    fn published_name(&self) -> String { format!("Export-{}", self.operation_id) }
    fn record_name(&self, kind: &str) -> String { format!("{}-parents-{kind}.json", self.operation_id) }
}
#[derive(Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Intent { schema: String, request: Request }
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Binding { schema: String, request: Request, journal: ObjectId, staging: ObjectId }
#[derive(Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Abandoned { schema: String, request: Request }

fn read<T: for<'de> Deserialize<'de>>(root: &Directory, name: &str) -> io::Result<Option<T>> {
    match root.read_bounded(name, LIMIT) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|_| conflict()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}
fn put<T: Serialize>(root: &Directory, name: &str, value: &T, guard: &NativeGuard) -> io::Result<()> {
    guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
    let bytes = serde_json::to_vec(value).map_err(|_| conflict())?;
    if bytes.len() > LIMIT { return Err(conflict()); }
    match root.read_bounded(name, LIMIT) {
        Ok(existing) => return if existing == bytes { Ok(()) } else { Err(conflict()) },
        Err(e) if e.kind() == io::ErrorKind::NotFound => {},
        Err(e) => return Err(e),
    }
    match root.write_record_atomic(name, &bytes) {
        Ok(()) => {}, Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}, Err(e) => return Err(e),
    }
    if root.read_bounded(name, LIMIT)? != bytes { return Err(conflict()); }
    root.sync()
}

pub(crate) struct Workspace<'a> {
    root: &'a Directory, target: &'a Directory, request: Request, journal: Directory, staging: Directory,
}
impl<'a> Workspace<'a> {
    pub fn open(root: &'a Directory, target: &'a Directory, request: Request, guard: &NativeGuard) -> io::Result<Self> {
        Self::open_checkpoints(root, target, request, guard, |_| Ok(()))
    }
    fn open_checkpoints(root: &'a Directory, target: &'a Directory, request: Request, guard: &NativeGuard,
        mut checkpoint: impl FnMut(&str) -> io::Result<()>) -> io::Result<Self> {
        request.validate()?;
        if request.private_root != root.identity().into() || request.target != target.identity().into() { return Err(conflict()); }
        root.verify_controlled()?;
        guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
        let _ownership = root.lock_control()?;
        let intent = Intent { schema: "datasecure-native-export-parent-intent/1".into(), request: request.clone() };
        let previous = read::<Intent>(root, &request.record_name("intent"))?;
        let binding = read::<Binding>(root, &request.record_name("binding"))?;
        let abandoned = read::<Abandoned>(root, &request.record_name("abandoned"))?;
        if let Some(saved) = abandoned {
            if saved != (Abandoned { schema: "datasecure-native-export-parent-abandoned/1".into(), request: request.clone() }) ||
                previous.as_ref() != Some(&intent) || binding.is_some() { return Err(conflict()); }
            return Err(error("AI_EXPORT_ABANDONED"));
        }
        if previous.as_ref().is_some_and(|saved| saved != &intent) || previous.is_none() && binding.is_some() {
            return Err(conflict());
        }
        if previous.is_some() && binding.is_none() { return Err(error("AI_EXPORT_UNCERTAIN")); }
        put(root, &request.record_name("intent"), &intent, guard)?;
        checkpoint("intent")?;
        let (journal, staging) = if let Some(binding) = binding {
            if binding.schema != "datasecure-native-export-parent-binding/1" || binding.request != request { return Err(conflict()); }
            let j = root.open_controlled_child(&request.journal_name(), binding.journal.identity()?)?;
            let s = root.open_controlled_child(&request.staging_name(), binding.staging.identity()?)?;
            (j, s)
        } else {
            guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
            let j = root.create_controlled_child(&request.journal_name())
                .map_err(|_| error("AI_EXPORT_UNCERTAIN"))?;
            checkpoint("journal")?;
            guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
            let s = root.create_controlled_child(&request.staging_name())
                .map_err(|_| error("AI_EXPORT_UNCERTAIN"))?;
            checkpoint("staging")?;
            j.sync()?; s.sync()?; root.sync()?;
            put(root, &request.record_name("binding"), &Binding { schema: "datasecure-native-export-parent-binding/1".into(),
                request: request.clone(), journal: j.identity().into(), staging: s.identity().into() }, guard)?;
            (j, s)
        };
        checkpoint("bound")?;
        root.inspect_child(&request.journal_name(), journal.identity())?;
        root.inspect_child(&request.staging_name(), staging.identity())?;
        Ok(Self { root, target, request, journal, staging })
    }
    /// A crash before the parent binding cannot have reached a transaction or
    /// publication through this broker. Allow only the exact saved intent to
    /// be abandoned; retain orphan children, and permanently refuse any later
    /// attempt to bind/publish the same operation. All ambiguity stays blocked.
    pub fn abandon_unbound(root: &Directory, target: &Directory, request: &Request,
        guard: &NativeGuard) -> io::Result<bool> {
        request.validate()?;
        if request.private_root != root.identity().into() || request.target != target.identity().into() { return Err(conflict()); }
        root.verify_controlled()?;
        guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
        let _ownership = root.lock_control()?;
        let intent = Intent { schema: "datasecure-native-export-parent-intent/1".into(), request: request.clone() };
        let previous = read::<Intent>(root, &request.record_name("intent"))?;
        let binding = read::<Binding>(root, &request.record_name("binding"))?;
        let abandoned = read::<Abandoned>(root, &request.record_name("abandoned"))?;
        if previous.as_ref().is_some_and(|saved| saved != &intent) || previous.is_none() && binding.is_some() ||
            abandoned.is_some() && (previous.is_none() || binding.is_some()) { return Err(conflict()); }
        if previous.is_none() || binding.is_some() { return Ok(false); }
        // An existing public child could mean a lost publication after a
        // damaged binding. Do not infer its ownership or touch it.
        if !target.child_absent(&request.published_name()).map_err(|_| error("AI_EXPORT_UNCERTAIN"))? {
            return Err(error("AI_EXPORT_UNCERTAIN"));
        }
        let marker = Abandoned { schema: "datasecure-native-export-parent-abandoned/1".into(), request: request.clone() };
        if abandoned.as_ref().is_some_and(|saved| saved != &marker) { return Err(conflict()); }
        put(root, &request.record_name("abandoned"), &marker, guard)?;
        if !target.child_absent(&request.published_name()).map_err(|_| error("AI_EXPORT_UNCERTAIN"))? {
            return Err(error("AI_EXPORT_UNCERTAIN"));
        }
        Ok(true)
    }
    pub fn transaction<'b>(&'b self, guard: &'b NativeGuard) -> io::Result<Transaction<'b>> {
        self.root.verify_controlled()?;
        self.root.inspect_child(&self.request.journal_name(), self.journal.identity())?;
        self.root.inspect_child(&self.request.staging_name(), self.staging.identity())?;
        let plan = Plan::new(self.request.batch_id.clone(), self.request.operation_id.clone(), self.request.request_sha256.clone(),
            self.request.processing_mode.clone(), self.request.files.clone(),
            &Parents { journal: &self.journal, staging: &self.staging, target: self.target })?;
        Transaction::open(&self.journal, &self.staging, self.target, plan, guard)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ipc_transport::Lifecycle, native_export_transaction::Status};
    use sha2::{Digest, Sha256};
    use std::{fs, path::PathBuf};
    struct Fixture { path: PathBuf }
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("datasecure-native-workspace-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            fs::create_dir(&path).unwrap();
            Directory::open_existing(&path, None).unwrap().create_controlled_child("private").unwrap();
            fs::create_dir(path.join("public")).unwrap(); Self { path }
        }
        fn open(&self, name: &str) -> Directory { Directory::open_existing(&self.path.join(name), None).unwrap() }
        fn request(&self, root: &Directory, target: &Directory) -> Request {
            Request::new("a".repeat(64), "b".repeat(32), "c".repeat(64), "markdown-and-anonymize".into(),
                vec![ExpectedFile { name: "Dokument_01.md".into(), bytes: 5, sha256: Sha256::digest(b"hello").into() }], root, target).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self.path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-workspace-"));
            let mut pending = vec![self.path.clone()];
            while let Some(path) = pending.pop() {
                let metadata = fs::symlink_metadata(&path).unwrap(); assert!(!metadata.file_type().is_symlink());
                #[cfg(windows)] {
                    use std::os::windows::fs::MetadataExt;
                    assert_eq!(metadata.file_attributes() & 0x400, 0);
                }
                if metadata.is_dir() { pending.extend(fs::read_dir(path).unwrap().map(|entry| entry.unwrap().path())); }
                else { assert!(metadata.is_file()); }
            }
            fs::remove_dir_all(&self.path).unwrap();
        }
    }
    #[test]
    fn native_parent_binding_reopens_the_same_transaction_after_a_lost_receipt() {
        let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
        let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        {
            let workspace = Workspace::open(&r, &t, request.clone(), &guard).unwrap();
            let tx = workspace.transaction(&guard).unwrap();
            tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); assert_eq!(tx.commit().unwrap(), Status::Completed);
        }
        drop(r); drop(t);
        let (r, t) = (f.open("private"), f.open("public"));
        let workspace = Workspace::open(&r, &t, request, &guard).unwrap();
        let tx = workspace.transaction(&guard).unwrap();
        assert_eq!(tx.reconcile().unwrap(), Status::Completed); assert_eq!(tx.acknowledge().unwrap(), Status::Acknowledged);
        assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 1);
    }
    #[test]
    fn parent_setup_faults_never_adopt_unrecorded_children_or_create_a_second_attempt() {
        for cut in ["intent", "journal", "staging", "bound"] {
            let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
            let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            assert!(Workspace::open_checkpoints(&r, &t, request.clone(), &guard,
                |phase| if phase == cut { Err(error("INJECTED_SETUP_FAILURE")) } else { Ok(()) }).is_err());
            drop(r); drop(t); let (r, t) = (f.open("private"), f.open("public"));
            let resumed = Workspace::open(&r, &t, request, &guard);
            if cut == "bound" { assert!(resumed.is_ok(), "{cut}"); }
            else { assert_eq!(resumed.err().unwrap().to_string(), "AI_EXPORT_UNCERTAIN", "{cut}"); }
            assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
        }
    }
    #[test]
    fn exact_pre_binding_intent_can_be_abandoned_without_adopting_orphan_children() {
        for cut in ["intent", "journal", "staging"] {
            let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
            let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            assert!(Workspace::open_checkpoints(&r, &t, request.clone(), &guard,
                |phase| if phase == cut { Err(error("INJECTED_SETUP_FAILURE")) } else { Ok(()) }).is_err());
            let journal_exists = f.path.join("private").join(request.journal_name()).exists();
            let staging_exists = f.path.join("private").join(request.staging_name()).exists();
            drop(r); drop(t);
            let (r, t) = (f.open("private"), f.open("public"));
            assert!(Workspace::abandon_unbound(&r, &t, &request, &guard).unwrap());
            assert!(Workspace::abandon_unbound(&r, &t, &request, &guard).unwrap(), "idempotent {cut}");
            assert_eq!(Workspace::open(&r, &t, request.clone(), &guard).err().unwrap().to_string(), "AI_EXPORT_ABANDONED");
            assert_eq!(f.path.join("private").join(request.journal_name()).exists(), journal_exists);
            assert_eq!(f.path.join("private").join(request.staging_name()).exists(), staging_exists);
            assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
        }
    }
    #[test]
    fn pre_binding_abandon_refuses_any_public_child_or_changed_request() {
        let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
        let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        assert!(Workspace::open_checkpoints(&r, &t, request.clone(), &guard,
            |phase| if phase == "intent" { Err(error("INJECTED_SETUP_FAILURE")) } else { Ok(()) }).is_err());
        let mut changed = request.clone(); changed.request_sha256 = "d".repeat(64);
        assert_eq!(Workspace::abandon_unbound(&r, &t, &changed, &guard).unwrap_err().to_string(), "AI_EXPORT_CONFLICT");
        fs::create_dir(f.path.join("public").join(request.published_name())).unwrap();
        assert_eq!(Workspace::abandon_unbound(&r, &t, &request, &guard).unwrap_err().to_string(), "AI_EXPORT_UNCERTAIN");
        assert!(!f.path.join("private").join(request.record_name("abandoned")).exists());
    }
    #[test]
    fn lost_binding_after_publication_cannot_be_relabelled_as_abandoned() {
        let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
        let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let workspace = Workspace::open(&r, &t, request.clone(), &guard).unwrap();
        let tx = workspace.transaction(&guard).unwrap();
        tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); assert_eq!(tx.commit().unwrap(), Status::Completed);
        fs::remove_file(f.path.join("private").join(request.record_name("binding"))).unwrap();
        assert_eq!(Workspace::abandon_unbound(&r, &t, &request, &guard).unwrap_err().to_string(), "AI_EXPORT_UNCERTAIN");
        assert!(!f.path.join("private").join(request.record_name("abandoned")).exists());
        assert_eq!(fs::read(f.path.join("public").join(request.published_name()).join("Dokument_01.md")).unwrap(), b"hello");
    }
    #[test]
    fn changed_scope_inventory_or_destination_cannot_reuse_a_parent_binding() {
        let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
        let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        Workspace::open(&r, &t, request.clone(), &guard).unwrap();
        for field in ["batch", "hash", "mode", "files", "root", "target"] {
            let mut changed = request.clone();
            match field {
                "batch" => changed.batch_id = "d".repeat(64), "hash" => changed.request_sha256 = "d".repeat(64),
                "mode" => changed.processing_mode = "markdown-only".into(), "files" => changed.files[0].bytes = 6,
                "root" => changed.private_root.object = "0".into(), "target" => changed.target.object = "0".into(), _ => unreachable!(),
            }
            assert!(Workspace::open(&r, &t, changed, &guard).is_err(), "{field}");
        }
        assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
    }
    #[test]
    fn changed_child_identity_and_broadened_permissions_refuse_recovery_without_repair() {
        for broad in [false, true] {
            let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
            let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            Workspace::open(&r, &t, request.clone(), &guard).unwrap();
            let child = f.path.join("private").join(request.journal_name());
            if broad {
                #[cfg(windows)] {
                    use std::os::windows::fs::OpenOptionsExt;
                    let file = fs::OpenOptions::new().access_mode(0x0004_0000 | 0x0002_0000)
                        .share_mode(7).custom_flags(0x0200_0000 | 0x0020_0000).open(&child).unwrap();
                    crate::export_private_security::broaden_test_directory(&file).unwrap();
                }
                #[cfg(unix)] {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&child, fs::Permissions::from_mode(0o755)).unwrap();
                }
            } else {
                fs::rename(&child, child.with_file_name("saved-journal")).unwrap();
                r.create_controlled_child(&request.journal_name()).unwrap();
            }
            assert!(Workspace::open(&r, &t, request, &guard).is_err());
            assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
        }
    }
    #[test]
    fn volume_mismatch_and_shutdown_refuse_setup_before_any_parent_intent() {
        let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
        let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let mut mismatch = request.clone(); mismatch.target.volume = (t.identity().volume ^ 1).to_string();
        assert_eq!(Workspace::open(&r, &t, mismatch, &guard).err().unwrap().to_string(), "AI_EXPORT_VOLUME_MISMATCH");
        lifecycle.stopping.store(true, std::sync::atomic::Ordering::Release);
        assert_eq!(Workspace::open(&r, &t, request, &guard).err().unwrap().to_string(), "STANDALONE_CLOSING");
        assert_eq!(fs::read_dir(f.path.join("private")).unwrap().count(), 0);
    }
    #[test]
    fn lost_parent_dependency_or_kernel_owner_never_authorizes_a_new_setup() {
        for removed in ["intent", "binding", "none"] {
            let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
            let request = f.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            if removed == "none" {
                let _owner = r.lock_control().unwrap();
                assert!(Workspace::open(&r, &t, request.clone(), &guard).is_err());
                assert!(!f.path.join("private").join(request.record_name("intent")).exists());
            } else {
                Workspace::open(&r, &t, request.clone(), &guard).unwrap();
                // Only the exact, owned synthetic record, never a product file.
                fs::remove_file(f.path.join("private").join(request.record_name(removed))).unwrap();
                let failure = Workspace::open(&r, &t, request, &guard).err().unwrap().to_string();
                assert_eq!(failure, if removed == "binding" { "AI_EXPORT_UNCERTAIN" } else { "AI_EXPORT_CONFLICT" });
            }
            assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
        }
    }
    #[test]
    #[ignore = "subprocess-only parent-binding crash checkpoint"]
    fn process_abort_child() {
        let path = PathBuf::from(std::env::var_os("DATASECURE_WORKSPACE_TEST_ROOT").unwrap());
        assert_eq!(path.parent().unwrap(), std::env::temp_dir());
        assert!(path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-workspace-"));
        let phase = std::env::var("DATASECURE_WORKSPACE_TEST_CUT").unwrap();
        assert!(["intent", "journal", "staging", "bound"].contains(&phase.as_str()));
        let (r, t) = (Directory::open_existing(&path.join("private"), None).unwrap(),
            Directory::open_existing(&path.join("public"), None).unwrap());
        let fixture = Fixture { path };
        let request = fixture.request(&r, &t); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        Workspace::open_checkpoints(&r, &t, request, &guard, |cut| {
            if cut == phase {
                use std::io::Write;
                println!("DATASECURE_WORKSPACE_KILL_READY"); std::io::stdout().flush().unwrap();
                loop { std::thread::park(); }
            }
            Ok(())
        }).unwrap();
        panic!("the parent must kill this child at its checkpoint");
    }
    #[test]
    fn actual_parent_setup_process_termination_keeps_uncertainty_and_releases_kernel_lock() {
        use std::{io::{BufRead, BufReader}, process::{Command, Stdio}, sync::mpsc, time::Duration};
        for cut in ["intent", "journal", "staging", "bound"] {
            let f = Fixture::new(); let (r, t) = (f.open("private"), f.open("public"));
            let request = f.request(&r, &t); drop(r); drop(t);
            let mut child = Command::new(std::env::current_exe().unwrap()).args([
                "--exact", "native_export_workspace::tests::process_abort_child", "--ignored", "--nocapture", "--test-threads=1"])
                .env("DATASECURE_WORKSPACE_TEST_ROOT", &f.path).env("DATASECURE_WORKSPACE_TEST_CUT", cut)
                .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
            let stdout = child.stdout.take().unwrap(); let (send, receive) = mpsc::channel();
            let reader = std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line { Ok(value) if value.ends_with("DATASECURE_WORKSPACE_KILL_READY") => { let _ = send.send(()); break; },
                        Ok(_) => {}, Err(_) => break }
                }
            });
            let ready = receive.recv_timeout(Duration::from_secs(10));
            // Kill only this just-spawned owned child, even on readiness failure.
            let killed = child.kill(); let ended = child.wait(); reader.join().unwrap();
            assert!(ready.is_ok(), "child failed readiness at {cut}"); assert!(killed.is_ok()); assert!(ended.is_ok());
            let (r, t) = (f.open("private"), f.open("public"));
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let reopened = Workspace::open(&r, &t, request, &guard);
            if cut == "bound" {
                let workspace = reopened.unwrap(); let tx = workspace.transaction(&guard).unwrap();
                tx.write_body(0, b"hello").unwrap(); tx.prepare().unwrap(); assert_eq!(tx.commit().unwrap(), Status::Completed);
                assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 1);
            } else {
                assert_eq!(reopened.err().unwrap().to_string(), "AI_EXPORT_UNCERTAIN");
                assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
            }
            let _owner = r.lock_control().unwrap(); // no orphaned kernel lock
        }
    }
}
