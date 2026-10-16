//! Standalone-only composition of picker authorization, controlled workspace
//! and durable publication. All writes finish inside the desktop's NativeGuard.
//! The sidecar streams hashed bodies over the owned pipe, never target paths.
use crate::{export_directory::{Directory, ExpectedFile, Identity}, ipc_transport::NativeGuard,
    native_export_transaction::Status, native_export_workspace::{Request, Workspace}};
use serde::{Deserialize, Serialize};
use std::{io, path::{Path, PathBuf}};

fn error(code: &'static str) -> io::Error { io::Error::other(code) }
fn hex(s: &str, n: usize) -> bool { s.len() == n && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn require_same_volume(private_parent: Identity, destinations: &[Identity]) -> io::Result<()> {
    if destinations.iter().any(|destination| destination.volume != private_parent.volume) {
        return Err(error("AI_EXPORT_VOLUME_MISMATCH"));
    }
    Ok(())
}
fn validate_configuration_roots(public: Identity, private_parent: Identity) -> io::Result<()> {
    if public == private_parent { return Err(error("STANDALONE_RESULT_ROOT_UNSAFE")); }
    // Publication renames a staged directory atomically. A selected result
    // root on another volume cannot use this transaction; reject the choice
    // before provisioning the private operation namespace.
    require_same_volume(private_parent, &[public])
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ObjectId { pub volume: String, pub object: String, pub created_ns: String }
impl From<Identity> for ObjectId {
    fn from(v: Identity) -> Self { Self { volume: v.volume.to_string(), object: v.object.to_string(), created_ns: v.created_ns.to_string() } }
}
impl ObjectId {
    fn identity(&self) -> io::Result<Identity> {
        let v = Identity { volume: self.volume.parse().map_err(|_| error("AI_EXPORT_INVALID"))?,
            object: self.object.parse().map_err(|_| error("AI_EXPORT_INVALID"))?,
            created_ns: self.created_ns.parse().map_err(|_| error("AI_EXPORT_INVALID"))? };
        if Self::from(v) != *self { return Err(error("AI_EXPORT_INVALID")); } Ok(v)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Binding {
    pub schema: String, pub root: String, pub root_identity: ObjectId,
    pub data_root_identity: ObjectId, pub private_name: String, pub private_identity: ObjectId,
    pub anonymize_identity: ObjectId, pub markdown_identity: ObjectId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Operation {
    pub batch_id: String, pub operation_id: String, pub request_sha256: String,
    pub processing_mode: String, pub binding: Binding, pub files: Vec<ExpectedFile>,
}
// Match Standalone's fixed product namespace, not a renderer-controlled path.
pub(crate) fn private_data_root() -> io::Result<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).or_else(||
        std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("AppData").join("Local")));
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME").map(|p| PathBuf::from(p).join("Library").join("Application Support"));
    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(||
        std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local").join("share")));
    base.filter(|p| p.is_absolute()).map(|p| p.join("SecureDataMsg-Standalone"))
        .ok_or_else(|| error("STANDALONE_DATA_ROOT_UNSAFE"))
}
pub(crate) fn configure(root: &Path, data: &Path, nonce: &str, guard: &NativeGuard) -> io::Result<Binding> {
    if !hex(nonce, 32) { return Err(error("AI_EXPORT_INVALID")); }
    guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
    let public = Directory::open_existing(root, None)?;
    let private_parent = Directory::open_existing(data, None)?;
    validate_configuration_roots(public.identity(), private_parent.identity())?;
    let anonymize = public.bind_output_child("DataSecure-KI-Export")?;
    require_same_volume(private_parent.identity(), &[anonymize.identity()])?;
    let markdown = public.bind_output_child("DataSecure-Markdown-Korrektur")?;
    // Existing output children can themselves be mount points even when the
    // selected parent is on the private volume. Reject those before a private
    // operation child is provisioned; Request::validate rechecks at export.
    require_same_volume(private_parent.identity(), &[markdown.identity()])?;
    // Random exclusive child; a lost configuration reply leaves an orphan,
    // not a name that any subsequent configuration may adopt or repair.
    let private_name = format!("native-export-{nonce}");
    let private = private_parent.create_controlled_child(&private_name)?;
    private.sync()?; private_parent.sync()?; public.sync()?;
    Ok(Binding { schema: "datasecure-native-export-binding/1".into(), root: root.to_str()
        .ok_or_else(|| error("STANDALONE_RESULT_ROOT_UNSAFE"))?.into(), root_identity: public.identity().into(),
        data_root_identity: private_parent.identity().into(), private_name, private_identity: private.identity().into(),
        anonymize_identity: anonymize.identity().into(), markdown_identity: markdown.identity().into() })
}
pub(crate) fn execute(data: &Path, op: &Operation, command: &str, guard: &NativeGuard) -> io::Result<&'static str> {
    execute_inner(data, op, command, None, guard)
}
pub(crate) fn write_body(data: &Path, op: &Operation, index: usize, bytes: &[u8], guard: &NativeGuard) -> io::Result<&'static str> {
    execute_inner(data, op, "write_body", Some((index, bytes)), guard)
}
fn execute_inner(data: &Path, op: &Operation, command: &str, body: Option<(usize, &[u8])>, guard: &NativeGuard) -> io::Result<&'static str> {
    if !hex(&op.batch_id, 64) || !hex(&op.operation_id, 32) || !hex(&op.request_sha256, 64) ||
        !["publish", "reconcile", "acknowledge", "abandon", "write_body"].contains(&command) ||
        op.binding.schema != "datasecure-native-export-binding/1" ||
        !op.binding.private_name.strip_prefix("native-export-").is_some_and(|s| hex(s, 32)) {
        return Err(error("AI_EXPORT_INVALID"));
    }
    let public = Directory::open_existing(Path::new(&op.binding.root), Some(op.binding.root_identity.identity()?))?;
    let parent = Directory::open_existing(data, Some(op.binding.data_root_identity.identity()?))?;
    let private = parent.open_controlled_child(&op.binding.private_name, op.binding.private_identity.identity()?)?;
    let (name, id) = match op.processing_mode.as_str() {
        "markdown-only" => ("DataSecure-Markdown-Korrektur", &op.binding.markdown_identity),
        "markdown-and-anonymize" => ("DataSecure-KI-Export", &op.binding.anonymize_identity),
        _ => return Err(error("AI_EXPORT_INVALID")),
    };
    let target = public.open_bound_child(name, id.identity()?)?;
    let request = Request::new(op.batch_id.clone(), op.operation_id.clone(), op.request_sha256.clone(),
        op.processing_mode.clone(), op.files.clone(), &private, &target)?;
    if command == "abandon" && Workspace::abandon_unbound(&private, &target, &request, guard)? {
        parent.inspect_child(&op.binding.private_name, private.identity())?;
        public.inspect_child(name, target.identity())?;
        return Ok("abandoned");
    }
    let workspace = Workspace::open(&private, &target, request, guard)?;
    let tx = workspace.transaction(guard)?;
    if let Some((index, bytes)) = body {
        // No Node pathname write precedes this native identity/ACL check.
        // Each body lives only in this operation's bound transaction stage.
        tx.write_body(index, bytes)?;
        parent.inspect_child(&op.binding.private_name, private.identity())?;
        public.inspect_child(name, target.identity())?;
        return Ok("staged");
    }
    let status = match command {
        "reconcile" => tx.reconcile()?, "acknowledge" => tx.acknowledge()?, "abandon" => tx.abandon()?,
        "publish" => match tx.reconcile()? {
            s @ (Status::Completed | Status::Acknowledged) => s,
            Status::Abandoned => return Err(error("AI_EXPORT_ABANDONED")),
            Status::Prepared => tx.commit()?,
            Status::Unprepared => {
                tx.prepare()?; tx.commit()?
            },
        },
        _ => unreachable!(),
    };
    // Retain parent capabilities through reconciliation and this final check.
    parent.inspect_child(&op.binding.private_name, private.identity())?;
    public.inspect_child(name, target.identity())?;
    Ok(match status { Status::Unprepared => "unprepared", Status::Prepared => "prepared",
        Status::Completed => "completed", Status::Acknowledged => "acknowledged", Status::Abandoned => "abandoned" })
}
pub(crate) fn public_code(e: &io::Error) -> &'static str {
    match e.to_string().as_str() {
        "AI_EXPORT_VOLUME_MISMATCH" => "AI_EXPORT_VOLUME_MISMATCH", "AI_EXPORT_UNCERTAIN" => "AI_EXPORT_UNCERTAIN",
        "AI_EXPORT_ALREADY_COMPLETE" => "AI_EXPORT_ALREADY_COMPLETE", "AI_EXPORT_INCOMPLETE" => "AI_EXPORT_INCOMPLETE",
        "AI_EXPORT_ABANDONED" => "AI_EXPORT_ABANDONED", "STANDALONE_CLOSING" => "STANDALONE_CLOSING",
        _ => "AI_EXPORT_CONFLICT",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ipc_transport::Lifecycle, native_export_channel::{handle_publication, PublicationState}};
    use sha2::{Digest, Sha256};
    use std::{fs, io::{BufRead, Write}};
    struct Fixture { path: PathBuf }
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("datasecure-native-broker-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            fs::create_dir(&path).unwrap();
            let parent = Directory::open_existing(&path, None).unwrap();
            parent.create_controlled_child("private").unwrap(); parent.create_controlled_child("public").unwrap(); Self { path }
        }
        fn op(&self, guard: &NativeGuard) -> Operation {
            let binding = configure(&self.path.join("public"), &self.path.join("private"), &"d".repeat(32), guard).unwrap();
            Operation { batch_id: "a".repeat(64), operation_id: "b".repeat(32), request_sha256: "c".repeat(64),
                processing_mode: "markdown-and-anonymize".into(), binding,
                files: vec![ExpectedFile { name: "Dokument_01.md".into(), bytes: 5, sha256: Sha256::digest(b"hello").into() }] }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self.path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-broker-"));
            let mut pending = vec![self.path.clone()];
            while let Some(p) = pending.pop() {
                let m = fs::symlink_metadata(&p).unwrap(); assert!(!m.file_type().is_symlink());
                #[cfg(windows)] { use std::os::windows::fs::MetadataExt; assert_eq!(m.file_attributes() & 0x400, 0); }
                if m.is_dir() { pending.extend(fs::read_dir(p).unwrap().map(|e| e.unwrap().path())); } else { assert!(m.is_file()); }
            }
            fs::remove_dir_all(&self.path).unwrap();
        }
    }
    #[test]
    fn result_root_volume_mismatch_is_rejected_before_provisioning() {
        let f = Fixture::new();
        let public = Directory::open_existing(&f.path.join("public"), None).unwrap();
        let private = Directory::open_existing(&f.path.join("private"), None).unwrap();
        let mut other_volume = public.identity();
        other_volume.volume ^= 1;
        assert_eq!(validate_configuration_roots(other_volume, private.identity())
            .unwrap_err().to_string(), "AI_EXPORT_VOLUME_MISMATCH");
        assert_eq!(public_code(&validate_configuration_roots(other_volume, private.identity())
            .unwrap_err()), "AI_EXPORT_VOLUME_MISMATCH");
        assert_eq!(validate_configuration_roots(private.identity(), private.identity())
            .unwrap_err().to_string(), "STANDALONE_RESULT_ROOT_UNSAFE");
        assert!(validate_configuration_roots(public.identity(), private.identity()).is_ok());
        assert_eq!(require_same_volume(private.identity(), &[public.identity(), other_volume])
            .unwrap_err().to_string(), "AI_EXPORT_VOLUME_MISMATCH");
        assert_eq!(fs::read_dir(f.path.join("private")).unwrap().count(), 0);
        assert_eq!(fs::read_dir(f.path.join("public")).unwrap().count(), 0);
    }
    #[test]
    fn publication_worker_timeout_retains_ownership_and_reconciles_both_sides_of_real_rename() {
        use std::{sync::{mpsc, Mutex, Arc}, time::{Instant, Duration}, process::{Command, Stdio}};
        for phase in ["before_rename", "after_rename"] {
            let f = Fixture::new(); let lifecycle = Lifecycle::default();
            let initial = lifecycle.begin_native().unwrap(); let op = f.op(&initial); let data = f.path.join("private");
            assert_eq!(write_body(&data, &op, 0, b"hello", &initial).unwrap(), "staged"); drop(initial);
            #[cfg(windows)]
            let mut command = { use std::os::windows::process::CommandExt; let mut c = Command::new("powershell.exe");
                c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]).creation_flags(0x08000000); c };
            #[cfg(not(windows))]
            let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
            let child = crate::ipc_transport::ChildControl::new(command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
            let spawning = lifecycle.begin_spawn().unwrap(); spawning.register(child.clone()).unwrap(); drop(spawning);
            let (arrive, arrived) = mpsc::channel(); let (release, released) = mpsc::channel();
            let released = Arc::new(Mutex::new(released));
            let deadline = Instant::now() + Duration::from_secs(2);
            let guard = lifecycle.begin_native_until(deadline).unwrap().with_test_event(move |point| {
                if point == phase { arrive.send(()).unwrap(); released.lock().unwrap().recv().unwrap(); }
            });
            let outer = serde_json::json!({ "request_id": "0000000000000001", "action": "export_approved_documents",
                "batch_id": op.batch_id, "operation_id": op.operation_id,
                "selection": [{ "output_sha256": op.files[0].sha256.iter().map(|v| format!("{v:02x}")).collect::<String>() }] });
            let frame = serde_json::json!({ "schema": "datasecure-native-export-request/2", "request_id": outer["request_id"],
                "native_id": "e".repeat(32), "sequence": 1, "action": "export_documents", "command": "publish", "operation": op });
            let worker_lifecycle = lifecycle.clone(); let worker_data = data.clone();
            let receiver = std::thread::spawn(move || crate::native_export_channel::run_publication(&frame, &outer,
                &mut PublicationState::default(), &worker_lifecycle, &worker_data, deadline, guard));
            arrived.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(receiver.join().unwrap().unwrap_err(), crate::ipc_transport::TIMEOUT);
            assert!(!child.exited(), "timeout must not detach the publication from its control-lock owner");
            lifecycle.retire_async(child.clone(), || Ok(())).unwrap();
            assert!(lifecycle.begin_spawn().is_err()); assert!(lifecycle.begin_native().is_err());
            let shutdown = lifecycle.clone(); let (finish, finished) = mpsc::channel();
            let stopping = std::thread::spawn(move || { finish.send(shutdown.stop()).unwrap(); });
            assert!(finished.recv_timeout(Duration::from_millis(50)).is_err(), "no premature successful shutdown");
            release.send(()).unwrap(); assert!(finished.recv_timeout(Duration::from_secs(5)).unwrap()); stopping.join().unwrap();
            assert!(child.exited());
            let fresh = Lifecycle::default(); let guard = fresh.begin_native().unwrap();
            let target = f.path.join("public/DataSecure-KI-Export").join(format!("Export-{}", op.operation_id));
            if phase == "before_rename" {
                assert!(!target.exists()); assert_eq!(execute(&data, &op, "reconcile", &guard).unwrap(), "prepared");
            } else {
                assert_eq!(fs::read(target.join("Dokument_01.md")).unwrap(), b"hello");
                assert_eq!(execute(&data, &op, "reconcile", &guard).unwrap(), "completed", "lost ACK is not no publication");
            }
        }
    }
    #[test]
    fn picker_binding_spool_publication_restart_ack_and_inventory_use_real_native_handles() {
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let op = f.op(&guard); let data = f.path.join("private");
        assert_eq!(write_body(&data, &op, 0, b"hello", &guard).unwrap(), "staged");
        assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "completed");
        assert_eq!(execute(&data, &op, "reconcile", &guard).unwrap(), "completed");
        assert_eq!(execute(&data, &op, "acknowledge", &guard).unwrap(), "acknowledged");
        assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "acknowledged");
        assert_eq!(public_code(&execute(&data, &op, "abandon", &guard).unwrap_err()), "AI_EXPORT_ALREADY_COMPLETE");
        let target = f.path.join("public").join("DataSecure-KI-Export").join(format!("Export-{}", op.operation_id));
        assert_eq!(fs::read(target.join("Dokument_01.md")).unwrap(), b"hello");
        fs::write(target.join("extra.txt"), b"not authorized").unwrap();
        assert!(execute(&data, &op, "reconcile", &guard).is_err());
    }
    #[test]
    fn abandoned_parent_intent_unblocks_the_exact_native_operation_only() {
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let op = f.op(&guard); let data = f.path.join("private");
        let parent = Directory::open_existing(&data, Some(op.binding.data_root_identity.identity().unwrap())).unwrap();
        let private = parent.open_controlled_child(&op.binding.private_name,
            op.binding.private_identity.identity().unwrap()).unwrap();
        let public = Directory::open_existing(Path::new(&op.binding.root),
            Some(op.binding.root_identity.identity().unwrap())).unwrap();
        let target = public.open_bound_child("DataSecure-KI-Export",
            op.binding.anonymize_identity.identity().unwrap()).unwrap();
        let request = Request::new(op.batch_id.clone(), op.operation_id.clone(), op.request_sha256.clone(),
            op.processing_mode.clone(), op.files.clone(), &private, &target).unwrap();
        // Synthetic crash checkpoint: intent persisted, but no parent binding
        // or publication was ever recorded.
        private.write_record_atomic(&format!("{}-parents-intent.json", op.operation_id),
            &serde_json::to_vec(&serde_json::json!({
                "schema": "datasecure-native-export-parent-intent/1", "request": request
            })).unwrap()).unwrap();
        assert_eq!(public_code(&execute(&data, &op, "reconcile", &guard).unwrap_err()), "AI_EXPORT_UNCERTAIN");
        assert_eq!(execute(&data, &op, "abandon", &guard).unwrap(), "abandoned");
        assert_eq!(execute(&data, &op, "abandon", &guard).unwrap(), "abandoned");
        assert_eq!(public_code(&execute(&data, &op, "publish", &guard).unwrap_err()), "AI_EXPORT_ABANDONED");
        assert!(!f.path.join("public/DataSecure-KI-Export").join(format!("Export-{}", op.operation_id)).exists());
    }
    #[test]
    fn changed_body_namespace_and_existing_destination_cannot_be_adopted() {
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let op = f.op(&guard); let data = f.path.join("private");
        assert!(write_body(&data, &op, 0, b"wrong", &guard).is_err());
        assert_eq!(write_body(&data, &op, 0, b"hello", &guard).unwrap(), "staged");
        let target = f.path.join("public").join("DataSecure-KI-Export").join(format!("Export-{}", op.operation_id));
        fs::create_dir(&target).unwrap(); fs::write(target.join("untouched"), b"original").unwrap();
        assert!(execute(&data, &op, "publish", &guard).is_err());
        assert_eq!(fs::read(target.join("untouched")).unwrap(), b"original");
        let mut changed = op.clone(); changed.binding.markdown_identity.object = "1".into();
        changed.processing_mode = "markdown-only".into(); assert!(execute(&data, &changed, "reconcile", &guard).is_err());
    }
    #[test]
    fn private_root_replacement_and_duplicate_configuration_fail_closed() {
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let op = f.op(&guard); let data = f.path.join("private");
        assert!(configure(&f.path.join("public"), &data, &"d".repeat(32), &guard).is_err());
        let path = data.join(&op.binding.private_name);
        fs::rename(&path, data.join("displaced")).unwrap();
        Directory::open_existing(&data, None).unwrap().create_controlled_child(&op.binding.private_name).unwrap();
        assert!(execute(&data, &op, "publish", &guard).is_err());
    }
    /// Test-only pipe harness for the real Node store + native callback test.
    /// No test path override, loop or protocol is compiled into release builds.
    #[test]
    #[ignore]
    fn pipe_helper() {
        let lifecycle = Lifecycle::default(); let mut state = PublicationState::default(); let mut last = serde_json::Value::Null;
        for line in io::stdin().lock().lines() {
            let input: serde_json::Value = serde_json::from_str(&line.unwrap()).unwrap();
            if input["outer"]["request_id"] != last { state = PublicationState::default(); last = input["outer"]["request_id"].clone(); }
            let response = handle_publication(&input["frame"], &input["outer"], &mut state, &lifecycle, Path::new(input["data"].as_str().unwrap()),
                std::time::Instant::now() + std::time::Duration::from_secs(30));
            let value = match response { Ok(Some(v)) => v, other => serde_json::json!({ "harness_error": format!("{other:?}") }) };
            println!("NATIVE:{value}"); io::stdout().flush().unwrap();
        }
    }
}
