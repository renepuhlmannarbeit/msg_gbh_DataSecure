//! Standalone-only composition of picker authorization, controlled workspace
//! and durable publication. All writes finish inside the desktop's NativeGuard.
//! The sidecar streams hashed bodies over the owned pipe, never target paths.
use crate::{export_directory::{Directory, ExpectedFile, Identity, Node22Identity}, ipc_transport::NativeGuard,
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
#[serde(tag = "kind", content = "identity", deny_unknown_fields)]
pub(crate) enum ConfiguredAdmission {
    #[serde(rename = "node22")] Node22(Node22Identity),
    #[serde(rename = "native")] Native(ObjectId),
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
/// Only fixed stages and standard-library kind names cross the diagnostic boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ConfigureStage {
    Nonce, Guard, PublicOpen, DataOpen, Roots, AnonymizeBind, AnonymizeVolume,
    MarkdownBind, MarkdownVolume, PrivateCreate, PrivateSync, DataSync, PublicSync, RootEncoding,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct ConfigureFailure {
    pub stage: ConfigureStage,
    pub io_error_kind: String,
    pub raw_os_error: Option<i32>,
}
pub(crate) fn valid_configure_io_kind(value: &str) -> bool {
    // ErrorKind Debug prints an enum name, not the io::Error payload. Keep a
    // closed export vocabulary and use Other for a future/unknown kind.
    const KINDS: &str = "NotFound PermissionDenied ConnectionRefused ConnectionReset HostUnreachable NetworkUnreachable ConnectionAborted NotConnected AddrInUse AddrNotAvailable NetworkDown BrokenPipe AlreadyExists WouldBlock NotADirectory IsADirectory DirectoryNotEmpty ReadOnlyFilesystem FilesystemLoop StaleNetworkFileHandle InvalidInput InvalidData TimedOut WriteZero StorageFull NotSeekable QuotaExceeded FileTooLarge ResourceBusy ExecutableFileBusy Deadlock CrossesDevices TooManyLinks InvalidFilename ArgumentListTooLong Interrupted Unsupported UnexpectedEof OutOfMemory InProgress Other Uncategorized";
    KINDS.split_whitespace().any(|kind| kind == value)
}
impl ConfigureFailure {
    fn capture(stage: ConfigureStage, error: &io::Error) -> Self {
        let kind = format!("{:?}", error.kind());
        Self { stage, io_error_kind: if valid_configure_io_kind(&kind) { kind } else { "Other".into() },
            raw_os_error: error.raw_os_error() }
    }
}
fn configure_step<T>(stage: ConfigureStage, result: io::Result<T>,
    observe: &mut impl FnMut(ConfigureFailure)) -> io::Result<T> {
    // Inspect the original error before public_code erases its OS identity.
    // Return that exact error: diagnostics never substitute transaction results.
    result.inspect_err(|error| observe(ConfigureFailure::capture(stage, error)))
}
pub(crate) fn configure(root: &Path, data: &Path, nonce: &str, guard: &NativeGuard) -> io::Result<Binding> {
    configure_observed(root, data, nonce, guard, crate::diagnostic_native_configure_failure)
}
pub(crate) fn configure_observed(root: &Path, data: &Path, nonce: &str, guard: &NativeGuard,
    mut observe: impl FnMut(ConfigureFailure)) -> io::Result<Binding> {
    configure_admitted(root, data, nonce, guard, None, &mut observe)
}
pub(crate) fn prepare_configured(root: &Path, data: &Path, nonce: &str, admission: &ConfiguredAdmission,
    setting_sha256: &str, guard: &NativeGuard) -> io::Result<Binding> {
    use sha2::{Digest, Sha256};
    let refused = || error("AI_EXPORT_CONFLICT");
    if !hex(setting_sha256, 64) { return Err(refused()); }
    guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
    let private_parent = Directory::open_existing(data, None)?;
    let settings = private_parent.open_settings()?;
    let bytes = settings.read_bounded("result-root.json", 128 * 1024)?;
    let digest = |bytes: &[u8]| format!("{:x}", Sha256::digest(bytes));
    if digest(&bytes) != setting_sha256 { return Err(refused()); }
    let record: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| refused())?;
    if record["root"].as_str() != root.to_str() { return Err(refused()); }
    let public = match admission {
        ConfiguredAdmission::Native(expected) => {
            if record["schema"] != "datasecure-result-root/3" || record["native_identity"] != serde_json::json!(expected) { return Err(refused()); }
            Directory::open_existing(root, Some(expected.identity()?))?
        },
        ConfiguredAdmission::Node22(expected) => {
            if !["datasecure-result-root/1", "datasecure-result-root/2"].iter().any(|schema| record["schema"] == *schema) ||
                record["identity"] != serde_json::json!(expected) { return Err(refused()); }
            let public = Directory::open_existing(root, None)?;
            if public.node22_identity()? != *expected { return Err(refused()); }
            public // Same held capability continues into provisioning, no re-adoption.
        },
    };
    #[cfg(test)] guard.test_event("configured_before_provision");
    private_parent.inspect_child("settings", settings.identity())?;
    let private_identity = private_parent.identity();
    // Reject a changed pathname, but retain the original capability for all
    // provisioning. The check must not become a fresh adoption of a new root.
    Directory::open_existing(data, Some(private_identity))?;
    let binding = configure_admitted(root, data, nonce, guard, Some((public, private_parent)), &mut crate::diagnostic_native_configure_failure)?;
    let parent = Directory::open_existing(data, Some(private_identity))?;
    parent.inspect_child("settings", settings.identity())?;
    if settings.read_bounded("result-root.json", 128 * 1024)? != bytes { return Err(refused()); }
    Ok(binding)
}
fn configure_admitted(root: &Path, data: &Path, nonce: &str, guard: &NativeGuard,
    admitted: Option<(Directory, Directory)>, observe: &mut impl FnMut(ConfigureFailure)) -> io::Result<Binding> {
    use ConfigureStage::*;
    configure_step(Nonce, if hex(nonce, 32) { Ok(()) } else { Err(error("AI_EXPORT_INVALID")) }, observe)?;
    configure_step(Guard, guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING")), observe)?;
    let (public, private_parent) = match admitted {
        Some(held) => held,
        None => (configure_step(PublicOpen, Directory::open_existing(root, None), observe)?,
            configure_step(DataOpen, Directory::open_existing(data, None), observe)?),
    };
    configure_step(Roots, validate_configuration_roots(public.identity(), private_parent.identity()), observe)?;
    let anonymize = configure_step(AnonymizeBind, public.bind_output_child("DataSecure-KI-Export"), observe)?;
    configure_step(AnonymizeVolume, require_same_volume(private_parent.identity(), &[anonymize.identity()]), observe)?;
    let markdown = configure_step(MarkdownBind, public.bind_output_child("DataSecure-Markdown-Korrektur"), observe)?;
    // Existing output children can themselves be mount points even when the
    // selected parent is on the private volume. Reject those before a private
    // operation child is provisioned; Request::validate rechecks at export.
    configure_step(MarkdownVolume, require_same_volume(private_parent.identity(), &[markdown.identity()]), observe)?;
    // Random exclusive child; a lost configuration reply leaves an orphan,
    // not a name that any subsequent configuration may adopt or repair.
    let private_name = format!("native-export-{nonce}");
    let private = configure_step(PrivateCreate, private_parent.create_controlled_child(&private_name), observe)?;
    configure_step(PrivateSync, private.sync(), observe)?;
    configure_step(DataSync, private_parent.sync(), observe)?;
    configure_step(PublicSync, public.sync(), observe)?;
    let root = configure_step(RootEncoding, root.to_str()
        .ok_or_else(|| error("STANDALONE_RESULT_ROOT_UNSAFE")), observe)?;
    Ok(Binding { schema: "datasecure-native-export-binding/1".into(), root: root.into(), root_identity: public.identity().into(),
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
    fn configured_node22_admission_uses_actual_node_identity_on_the_target_os() {
        let f = Fixture::new();
        let root = f.path.join("public");
        let node = std::env::var_os("DATASECURE_TEST_NODE").unwrap_or_else(|| "node".into());
        let output = std::process::Command::new(node).args(["-e",
            "const s=require('node:fs').statSync(process.argv[1]);process.stdout.write(JSON.stringify({dev:String(s.dev),ino:String(s.ino),birthtime_ms:String(Math.trunc(s.birthtimeMs))}));"])
            .arg(&root).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let expected: Node22Identity = serde_json::from_slice(&output.stdout).unwrap();
        let directory = Directory::open_existing(&root, None).unwrap();
        let safe = [&expected.dev, &expected.ino, &expected.birthtime_ms].into_iter()
            .all(|value| value.parse::<u64>().is_ok_and(|value| value < (1u64 << 53)));
        if safe { assert_eq!(directory.node22_identity().unwrap(), expected); }
        else { assert!(directory.node22_identity().is_err(), "ambiguous legacy Numbers require a new native selection"); }
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
    fn configured_fixture(f: &Fixture) -> (ConfiguredAdmission, String, Vec<u8>) {
        let data = Directory::open_existing(&f.path.join("private"), None).unwrap();
        let settings = data.create_controlled_child("settings").unwrap();
        let expected: ObjectId = Directory::open_existing(&f.path.join("public"), None).unwrap().identity().into();
        let bytes = serde_json::to_vec(&serde_json::json!({ "schema": "datasecure-result-root/3",
            "root": f.path.join("public"), "native_identity": expected,
            "identity": {"dev":"1", "ino":"2", "birthtime_ms":"3"}, "notices": {"sync":false,"network":false} })).unwrap();
        settings.write_record_atomic("result-root.json", &bytes).unwrap();
        (ConfiguredAdmission::Native(expected), format!("{:x}", Sha256::digest(&bytes)), bytes)
    }
    #[test]
    fn configured_admission_requires_saved_root_digest_and_identity_before_any_provisioning() {
        for fault in ["root", "digest", "identity", "none"] {
            let f = Fixture::new(); let (mut admission, mut digest, original) = configured_fixture(&f);
            let root = f.path.join("public"); let data = f.path.join("private");
            if fault == "root" { fs::rename(&root, f.path.join("original-public")).unwrap(); fs::create_dir(&root).unwrap(); }
            if fault == "digest" { digest = "0".repeat(64); }
            if fault == "identity" { if let ConfiguredAdmission::Native(ref mut id) = admission { id.object = "0".into(); } }
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let result = prepare_configured(&root, &data, &"c".repeat(32), &admission, &digest, &guard);
            assert_eq!(result.is_ok(), fault == "none", "{fault}");
            assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), original, "Rust never changes preferences");
            if fault != "none" {
                assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
                assert_eq!(fs::read_dir(&data).unwrap().count(), 1, "settings only; no private nonce child");
            }
        }
    }
    #[cfg(unix)]
    #[test]
    fn configured_parent_and_settings_replacements_with_identical_bytes_are_not_adopted() {
        for replace_data in [true, false] {
            let f = Fixture::new(); let (admission, digest, bytes) = configured_fixture(&f);
            let data = f.path.join("private"); let root = f.path.join("public");
            let swapped = if replace_data { data.clone() } else { data.join("settings") };
            let changed = swapped.clone();
            let lifecycle = Lifecycle::default();
            let guard = lifecycle.begin_native().unwrap().with_test_event(move |point| {
                if point != "configured_before_provision" { return; }
                fs::rename(&changed, changed.with_extension("original")).unwrap();
                fs::create_dir(&changed).unwrap();
                let settings = if replace_data { let path = changed.join("settings"); fs::create_dir(&path).unwrap(); path } else { changed.clone() };
                fs::write(settings.join("result-root.json"), &bytes).unwrap();
            });
            assert!(prepare_configured(&root, &data, &"c".repeat(32), &admission, &digest, &guard).is_err());
            assert_eq!(fs::read_dir(root).unwrap().count(), 0);
            assert_eq!(fs::read_dir(data).unwrap().count(), 1, "no nonce provisioned in replacement namespace");
        }
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
    #[test]
    fn configure_failure_diagnostics_preserve_kind_and_os_code_without_error_payload() {
        let original = io::Error::new(io::ErrorKind::PermissionDenied, "/PRIVATE/raw-source.txt: vendor detail");
        let mut observed = Vec::new();
        let result: io::Result<()> = configure_step(ConfigureStage::PrivateCreate, Err(original),
            &mut |failure| observed.push(failure));
        let returned = result.unwrap_err();
        assert_eq!(returned.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(returned.to_string(), "/PRIVATE/raw-source.txt: vendor detail");
        assert_eq!(public_code(&returned), "AI_EXPORT_CONFLICT");
        assert_eq!(observed.len(), 1);
        let bytes = serde_json::to_value(&observed[0]).unwrap();
        assert_eq!(bytes, serde_json::json!({ "stage": "private_create",
            "io_error_kind": "PermissionDenied", "raw_os_error": null }));
        assert!(!bytes.to_string().contains("PRIVATE"));
        let original = io::Error::from_raw_os_error(5);
        let captured = ConfigureFailure::capture(ConfigureStage::MarkdownBind, &original);
        assert_eq!(captured.raw_os_error, Some(5));
        assert_eq!(captured.io_error_kind, format!("{:?}", original.kind()));
        assert_eq!(public_code(&original), "AI_EXPORT_CONFLICT");
        assert!(!valid_configure_io_kind("/PRIVATE/path"));
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
            // The crash campaign supplies this test-only cut over its owned
            // stdin. Release builds do not contain this helper or its cuts.
            let cut = input["test_cut"].as_str().unwrap_or("").to_string();
            assert!(["", "before_rename", "after_rename", "after_ack"].contains(&cut.as_str()));
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
            let response = if ["before_rename", "after_rename"].contains(&cut.as_str()) && input["frame"]["command"] == "publish" {
                let guard = lifecycle.begin_native_until(deadline).unwrap().with_test_event(move |phase| {
                    if phase == cut {
                        println!("NATIVE_KILL_READY:{phase}"); io::stdout().flush().unwrap();
                        loop { std::thread::park(); }
                    }
                });
                crate::native_export_channel::run_publication(&input["frame"], &input["outer"], &mut state,
                    &lifecycle, Path::new(input["data"].as_str().unwrap()), deadline, guard)
            } else {
                handle_publication(&input["frame"], &input["outer"], &mut state, &lifecycle,
                    Path::new(input["data"].as_str().unwrap()), deadline)
            };
            if input["test_cut"] == "after_ack" && input["frame"]["command"] == "acknowledge" &&
                response.as_ref().ok().and_then(|value| value.as_ref()).is_some_and(|value| value["status"] == "acknowledged") {
                println!("NATIVE_KILL_READY:after_ack"); io::stdout().flush().unwrap();
                loop { std::thread::park(); }
            }
            let value = match response { Ok(Some(v)) => v, other => serde_json::json!({ "harness_error": format!("{other:?}") }) };
            println!("NATIVE:{value}"); io::stdout().flush().unwrap();
        }
    }
}
