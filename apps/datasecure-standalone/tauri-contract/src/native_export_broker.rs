//! Standalone-only composition of picker authorization, controlled workspace
//! and durable publication. All writes finish inside the desktop's NativeGuard.
//! The sidecar streams hashed bodies over the owned pipe, never target paths.
use crate::{export_directory::{Directory, ExpectedFile, ConfidentialFiles, deserialize_confidential, Identity, Node22Identity, Node22BigIntIdentity}, ipc_transport::NativeGuard,
    native_export_transaction::{Status, PublicationRole, deserialize_publication_role}, native_export_workspace::{Request, Workspace}};
use serde::{Deserialize, Serialize};
use std::{io, path::{Path, PathBuf}};

// Test pipe evidence only. It records the original call without creating
// authority, retaining payloads, retrying or changing the returned error.
#[cfg(test)]
pub(crate) mod body_diagnostic {
    use std::{cell::RefCell, io, sync::atomic::{AtomicUsize, Ordering}};
    use serde::Serialize;
    #[derive(Clone, Copy, Serialize)]
    #[serde(rename_all = "snake_case")]
    pub(crate) enum Phase {
        BodyDecode, BodyPayload, BodyBounds, BodyFinal, BrokerPublic, BrokerData,
        BrokerPrivate, BrokerTarget, BrokerRequest, BrokerWorkspace, BrokerTransaction,
        BrokerWrite, BrokerPostPrivate, BrokerPostPublic, WorkspaceRoot, WorkspaceRecords,
        WorkspacePut, WorkspaceBinding, WorkspaceJournal, WorkspaceStaging, WorkspacePost,
        TransactionParents, TransactionJournal, TransactionStaging, TransactionControl,
        TransactionIntent, TransactionEvidence, TransactionBody, TransactionGuard,
        TransactionStage, TransactionWrite, TransactionReadback, TransactionSync,
        TransactionStageSync, TransactionPost, DirectoryReadOpen, DirectoryReadIdentity,
        DirectoryReadBefore, DirectoryReadBody, DirectoryReadAfter, DirectoryReadVerify,
        DirectoryReadDone, StageOpen, StageIdentity, StageParent, LeafCreate,
        LeafWrite, LeafSync, LeafVerify,
    }
    #[derive(Serialize)]
    struct Trace {
        schema: &'static str, ordinal: usize, mode: &'static str,
        body_index: Option<usize>, body_offset_zero: bool, body_final_chunk: bool,
        body_index_in_range: Option<bool>, body_length_matches: Option<bool>,
        phase: Phase, phases: Vec<Phase>, phase_overflow: bool,
        outcome: &'static str, io_error_kind: Option<String>, raw_os_error: Option<i32>,
    }
    std::thread_local! { static CURRENT: RefCell<Option<Trace>> = const { RefCell::new(None) }; }
    static EMITTED: AtomicUsize = AtomicUsize::new(0);
    pub(crate) fn begin(mode: &str, index: usize, offset_zero: bool, final_chunk: bool) {
        CURRENT.with(|slot| *slot.borrow_mut() = Some(Trace {
            schema: "datasecure-native-body-test-diagnostic/1", ordinal: 0,
            mode: match mode { "markdown-only" => "markdown-only", "markdown-and-anonymize" => "markdown-and-anonymize", _ => "unknown" },
            body_index: (index <= 203).then_some(index), body_offset_zero: offset_zero,
            body_final_chunk: final_chunk, body_index_in_range: None, body_length_matches: None,
            phase: Phase::BodyDecode, phases: Vec::new(), phase_overflow: false,
            outcome: "unknown", io_error_kind: None, raw_os_error: None,
        }));
    }
    pub(crate) fn phase(value: Phase) {
        CURRENT.with(|slot| if let Some(trace) = slot.borrow_mut().as_mut() {
            trace.phase = value;
            if trace.phases.len() == 64 { trace.phases.remove(0); trace.phase_overflow = true; }
            trace.phases.push(value);
        });
    }
    pub(crate) fn body_checks(index_in_range: bool, length_matches: bool) {
        CURRENT.with(|slot| if let Some(trace) = slot.borrow_mut().as_mut() {
            trace.body_index_in_range = Some(index_in_range); trace.body_length_matches = Some(length_matches);
        });
    }
    pub(crate) fn finish<T>(result: &io::Result<T>) {
        CURRENT.with(|slot| if let Some(mut trace) = slot.borrow_mut().take() {
            let ordinal = EMITTED.fetch_add(1, Ordering::Relaxed);
            if ordinal >= 64 { return; }
            trace.ordinal = ordinal + 1;
            match result {
                Ok(_) => trace.outcome = "success",
                Err(error) => { trace.outcome = "failure";
                    trace.io_error_kind = Some(format!("{:?}", error.kind())); trace.raw_os_error = error.raw_os_error(); }
            }
            if let Ok(value) = serde_json::to_string(&trace) { eprintln!("NATIVE_BODY_DIAGNOSTIC:{value}"); }
        });
    }
}
#[cfg(test)]
use body_diagnostic::Phase as BodyPhase;

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
    #[serde(rename = "node22_bigint")] Node22BigInt(Node22BigIntIdentity),
    #[serde(rename = "native")] Native(ObjectId),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Binding {
    pub schema: String, pub root: String, pub root_identity: ObjectId,
    pub data_root_identity: ObjectId, pub private_name: String, pub private_identity: ObjectId,
    pub anonymize_identity: ObjectId, pub markdown_identity: ObjectId,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InitialOutputBinding {
    pub schema: String, pub root: String, pub root_identity: Node22BigIntIdentity,
    pub markdown_identity: Node22BigIntIdentity, pub output_identity: Node22BigIntIdentity,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Operation {
    pub batch_id: String, pub operation_id: String, pub request_sha256: String,
    pub processing_mode: String, pub binding: Binding, pub files: Vec<ExpectedFile>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_publication_role")]
    pub publication_role: Option<PublicationRole>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_confidential")]
    pub confidential: Option<ConfidentialFiles>,
}
impl Operation {
    pub(crate) fn payload_file(&self, index: usize) -> io::Result<ExpectedFile> {
        crate::export_directory::validate_publication_inventory(&self.processing_mode,
            self.publication_role == Some(PublicationRole::Results), &self.files, self.confidential.as_ref())
            .map_err(|_| error("AI_EXPORT_INVALID"))?;
        crate::export_directory::publication_body(&self.files, self.confidential.as_ref(), index)
            .ok_or_else(|| error("AI_EXPORT_INVALID"))
    }
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
    AdmissionDigestEncoding, AdmissionGuard, AdmissionDataOpen, AdmissionSettingsOpen,
    AdmissionSettingsRead, AdmissionSettingsDigest, AdmissionSettingsParse, AdmissionRoot,
    AdmissionRecord, AdmissionNativeIdentity, AdmissionPublicOpen, AdmissionNodeIdentity,
    AdmissionIdentityMatch, AdmissionSettingsBinding, AdmissionDataReopen,
    AdmissionRepeatDataOpen, AdmissionRepeatSettingsBinding, AdmissionRepeatSettingsRead,
    AdmissionRepeatSettingsMatch,
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
    prepare_configured_observed(root, data, nonce, admission, setting_sha256, guard, |failure| {
        // The test-only pipe may preserve this closed record beside its own
        // synthetic fixture. Release builds never emit this stderr protocol.
        #[cfg(test)]
        if let Ok(closed) = serde_json::to_string(&failure) {
            let _ = std::io::Write::write_all(&mut std::io::stderr().lock(),
                format!("NATIVE_CONFIGURE_FAILURE:{closed}\n").as_bytes());
        }
        crate::diagnostic_native_configure_failure(failure);
    })
}
fn prepare_configured_observed(root: &Path, data: &Path, nonce: &str, admission: &ConfiguredAdmission,
    setting_sha256: &str, guard: &NativeGuard, mut observe: impl FnMut(ConfigureFailure)) -> io::Result<Binding> {
    use ConfigureStage::*;
    let ConfiguredRoot { public, private_parent, settings, bytes } =
        admit_configured_root(root, data, admission, setting_sha256, guard, AdmissionPurpose::LegacyExport, &mut observe)?;
    let refused = || error("AI_EXPORT_CONFLICT");
    #[cfg(test)] guard.test_event("configured_before_provision");
    configure_step(AdmissionSettingsBinding, private_parent.inspect_child("settings", settings.identity()), &mut observe)?;
    let private_identity = private_parent.identity();
    // Reject a changed pathname, but retain the original capability for all
    // provisioning. The check must not become a fresh adoption of a new root.
    configure_step(AdmissionDataReopen, Directory::open_existing(data, Some(private_identity)), &mut observe)?;
    let binding = configure_admitted(root, data, nonce, guard, Some((public, private_parent)), &mut observe)?;
    #[cfg(test)] guard.test_event("configured_after_provision");
    let parent = configure_step(AdmissionRepeatDataOpen, Directory::open_existing(data, Some(private_identity)), &mut observe)?;
    configure_step(AdmissionRepeatSettingsBinding, parent.inspect_child("settings", settings.identity()), &mut observe)?;
    let repeated = configure_step(AdmissionRepeatSettingsRead, settings.read_bounded("result-root.json", 128 * 1024), &mut observe)?;
    configure_step(AdmissionRepeatSettingsMatch, if repeated == bytes { Ok(()) } else { Err(refused()) }, &mut observe)?;
    Ok(binding)
}
struct ConfiguredRoot { public: Directory, private_parent: Directory, settings: Directory, bytes: Vec<u8> }
#[derive(Clone, Copy)]
enum AdmissionPurpose { LegacyExport, InitialOutput }
#[allow(clippy::too_many_arguments)]
fn admit_configured_root(root: &Path, data: &Path, admission: &ConfiguredAdmission, setting_sha256: &str,
    guard: &NativeGuard, purpose: AdmissionPurpose, observe: &mut impl FnMut(ConfigureFailure)) -> io::Result<ConfiguredRoot> {
    use sha2::{Digest, Sha256};
    use ConfigureStage::*;
    let refused = || error("AI_EXPORT_CONFLICT");
    configure_step(AdmissionDigestEncoding, if hex(setting_sha256, 64) { Ok(()) } else { Err(refused()) }, observe)?;
    configure_step(AdmissionGuard, guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING")), observe)?;
    let private_parent = configure_step(AdmissionDataOpen, Directory::open_existing(data, None), observe)?;
    let settings = configure_step(AdmissionSettingsOpen, private_parent.open_settings(), observe)?;
    let bytes = configure_step(AdmissionSettingsRead, settings.read_bounded("result-root.json", 128 * 1024), observe)?;
    let digest = |bytes: &[u8]| format!("{:x}", Sha256::digest(bytes));
    configure_step(AdmissionSettingsDigest, if digest(&bytes) == setting_sha256 { Ok(()) } else { Err(refused()) }, observe)?;
    let record: serde_json::Value = configure_step(AdmissionSettingsParse,
        serde_json::from_slice(&bytes).map_err(|_| refused()), observe)?;
    configure_step(AdmissionRoot, if record["root"].as_str() == root.to_str() { Ok(()) } else { Err(refused()) }, observe)?;
    let public = match admission {
        ConfiguredAdmission::Native(expected) => {
            let native_matches = if record["schema"] == "datasecure-result-root/3" {
                record["native_identity"] == serde_json::json!(expected)
            } else if matches!(purpose, AdmissionPurpose::InitialOutput) &&
                ["datasecure-result-root/4", "datasecure-result-root/6"].iter().any(|schema| record["schema"] == *schema) {
                serde_json::from_value::<Binding>(record["native_export"].clone()).is_ok_and(|binding|
                    binding.schema == "datasecure-native-export-binding/1" && binding.root == root.to_str().unwrap_or_default() &&
                    binding.root_identity == *expected)
            } else { false };
            configure_step(AdmissionRecord, if native_matches { Ok(()) } else { Err(refused()) }, observe)?;
            let identity = configure_step(AdmissionNativeIdentity, expected.identity(), observe)?;
            configure_step(AdmissionPublicOpen, Directory::open_existing(root, Some(identity)), observe)?
        },
        ConfiguredAdmission::Node22(expected) => {
            configure_step(AdmissionRecord, if matches!(purpose, AdmissionPurpose::LegacyExport) &&
                ["datasecure-result-root/1", "datasecure-result-root/2"].iter().any(|schema| record["schema"] == *schema) &&
                record["identity"] == serde_json::json!(expected) { Ok(()) } else { Err(refused()) }, observe)?;
            let public = configure_step(AdmissionPublicOpen, Directory::open_existing(root, None), observe)?;
            let actual = configure_step(AdmissionNodeIdentity, public.node22_identity(), observe)?;
            configure_step(AdmissionIdentityMatch, if actual == *expected { Ok(()) } else { Err(refused()) }, observe)?;
            public // Same held capability continues into provisioning, no re-adoption.
        },
        ConfiguredAdmission::Node22BigInt(expected) => {
            // Only a freshly persisted exact setting grants this admission.
            // A rounded /1 or /2 record may not be upgraded from today's stat.
            configure_step(AdmissionRecord, if record["schema"] == "datasecure-result-root/5" &&
                record["exact_identity"] == serde_json::json!(expected) { Ok(()) } else { Err(refused()) }, observe)?;
            let public = configure_step(AdmissionPublicOpen, Directory::open_existing(root, None), observe)?;
            let actual = configure_step(AdmissionNodeIdentity, public.node22_bigint_identity(), observe)?;
            configure_step(AdmissionIdentityMatch, if actual == *expected { Ok(()) } else { Err(refused()) }, observe)?;
            public
        },
    };
    Ok(ConfiguredRoot { public, private_parent, settings, bytes })
}
fn assert_initial_admission(root: &Path, data: &Path, held: &ConfiguredRoot, guard: &NativeGuard) -> io::Result<()> {
    guard.checkpoint().map_err(|_| error("STANDALONE_CLOSING"))?;
    Directory::open_existing(root, Some(held.public.identity()))?;
    let parent = Directory::open_existing(data, Some(held.private_parent.identity()))?;
    parent.inspect_child("settings", held.settings.identity())?;
    if held.settings.read_bounded("result-root.json", 128 * 1024)? != held.bytes { return Err(error("AI_EXPORT_CONFLICT")); }
    Ok(())
}
/// Pre-start provisioning only. Fixed children, protected security AT creation,
/// no preferences/parent-ACL edits, no processing or publication authority.
pub(crate) fn prepare_initial_output_root(root: &Path, data: &Path, admission: &ConfiguredAdmission,
    setting_sha256: &str, guard: &NativeGuard) -> io::Result<InitialOutputBinding> {
    let held = admit_configured_root(root, data, admission, setting_sha256, guard, AdmissionPurpose::InitialOutput,
        &mut crate::diagnostic_native_configure_failure)?;
    validate_initial_roots(held.public.identity(), held.private_parent.identity())?;
    #[cfg(test)] guard.test_event("initial_before_provision");
    assert_initial_admission(root, data, &held, guard)?;
    // Inspect BOTH existing candidates before creating either missing child.
    // Existing user containers are checked, never repaired or emptied.
    let markdown = held.public.inspect_initial_output_child("DataSecure-Markdown")?;
    let output = held.public.inspect_initial_output_child("DataSecure-Output")?;
    #[cfg(test)] guard.test_event("initial_before_create");
    assert_initial_admission(root, data, &held, guard)?;
    let markdown = match markdown { Some(child) => child, None => held.public.create_controlled_child("DataSecure-Markdown")? };
    #[cfg(test)] guard.test_event("initial_after_markdown_provision");
    assert_initial_admission(root, data, &held, guard)?;
    let output = match output { Some(child) => child, None => held.public.create_controlled_child("DataSecure-Output")? };
    #[cfg(test)] guard.test_event("initial_after_provision");
    assert_initial_admission(root, data, &held, guard)?;
    for (name, child) in [("DataSecure-Markdown", &markdown), ("DataSecure-Output", &output)] {
        child.verify_initial_output()?; held.public.inspect_child(name, child.identity())?;
        child.sync()?;
    }
    held.public.sync()?;
    let binding = InitialOutputBinding { schema: "datasecure-initial-output-binding/1".into(),
        root: root.to_str().ok_or_else(|| error("STANDALONE_RESULT_ROOT_UNSAFE"))?.into(),
        root_identity: held.public.node22_bigint_identity()?, markdown_identity: markdown.node22_bigint_identity()?,
        output_identity: output.node22_bigint_identity()? };
    assert_initial_admission(root, data, &held, guard)?;
    Ok(binding)
}
fn validate_initial_roots(public: Identity, private_parent: Identity) -> io::Result<()> {
    // Initial results are copied by the existing Node publisher, not renamed
    // out of private native staging. Do NOT inherit the correction publisher's
    // same-volume restriction into this new pre-start admission.
    if public == private_parent { Err(error("STANDALONE_RESULT_ROOT_UNSAFE")) } else { Ok(()) }
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
    execute_inner(data, op, command, None, guard, false)
}
pub(crate) fn inspect_results(data: &Path, op: &Operation, guard: &NativeGuard) -> io::Result<&'static str> {
    if op.publication_role != Some(PublicationRole::Results) { return Err(error("AI_EXPORT_INVALID")); }
    execute_inner(data, op, "reconcile", None, guard, true)
}
pub(crate) fn write_body(data: &Path, op: &Operation, index: usize, bytes: &[u8], guard: &NativeGuard) -> io::Result<&'static str> {
    execute_inner(data, op, "write_body", Some((index, bytes)), guard, false)
}
fn execute_inner(data: &Path, op: &Operation, command: &str, body: Option<(usize, &[u8])>, guard: &NativeGuard,
    inspect_only: bool) -> io::Result<&'static str> {
    if inspect_only && (op.publication_role != Some(PublicationRole::Results) || command != "reconcile" || body.is_some()) {
        return Err(error("AI_EXPORT_INVALID"));
    }
    if !hex(&op.batch_id, 64) || !hex(&op.operation_id, 32) || !hex(&op.request_sha256, 64) ||
        !["publish", "reconcile", "acknowledge", "abandon", "write_body"].contains(&command) ||
        op.binding.schema != "datasecure-native-export-binding/1" ||
        !op.binding.private_name.strip_prefix("native-export-").is_some_and(|s| hex(s, 32)) {
        return Err(error("AI_EXPORT_INVALID"));
    }
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerPublic);
    let public = Directory::open_existing(Path::new(&op.binding.root), Some(op.binding.root_identity.identity()?))?;
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerData);
    let parent = Directory::open_existing(data, Some(op.binding.data_root_identity.identity()?))?;
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerPrivate);
    let private = parent.open_controlled_child(&op.binding.private_name, op.binding.private_identity.identity()?)?;
    let (name, id) = match op.processing_mode.as_str() {
        "markdown-only" => ("DataSecure-Markdown-Korrektur", &op.binding.markdown_identity),
        "markdown-and-anonymize" => ("DataSecure-KI-Export", &op.binding.anonymize_identity),
        _ => return Err(error("AI_EXPORT_INVALID")),
    };
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerTarget);
    let target = public.open_bound_child(name, id.identity()?)?;
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerRequest);
    let request = Request::new(op.batch_id.clone(), op.operation_id.clone(), op.request_sha256.clone(),
        op.processing_mode.clone(), op.files.clone(), &private, &target)?
        .with_publication_role(op.publication_role).with_confidential(op.confidential.clone())?;
    if command == "abandon" && Workspace::abandon_unbound(&private, &target, &request, guard)? {
        parent.inspect_child(&op.binding.private_name, private.identity())?;
        public.inspect_child(name, target.identity())?;
        return Ok("abandoned");
    }
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerWorkspace);
    let workspace = if inspect_only { Workspace::open_existing(&private, &target, request, guard)? }
        else { Workspace::open(&private, &target, request, guard)? };
    #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerTransaction);
    let tx = if inspect_only { workspace.existing_transaction(guard)? } else { workspace.transaction(guard)? };
    if let Some((index, bytes)) = body {
        // No Node pathname write precedes this native identity/ACL check.
        // Each body lives only in this operation's bound transaction stage.
        #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerWrite);
        tx.write_body(index, bytes)?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerPostPrivate);
        parent.inspect_child(&op.binding.private_name, private.identity())?;
        #[cfg(test)] body_diagnostic::phase(BodyPhase::BrokerPostPublic);
        public.inspect_child(name, target.identity())?;
        return Ok("staged");
    }
    let status = if inspect_only { tx.inspect_completed_directory()? } else { match command {
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
    } };
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
            Operation { batch_id: "a".repeat(64), operation_id: "b".repeat(32), request_sha256: "c".repeat(64), publication_role: None,
                confidential: None,
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
    fn confidential_operation_is_optional_closed_and_payload_indices_are_not_arbitrary_paths() {
        use crate::export_directory::{ConfidentialFile, FILENAME_MAPPING, IDENTITIES_FILE};
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let legacy = f.op(&guard);
        assert!(!String::from_utf8_lossy(&serde_json::to_vec(&legacy).unwrap()).contains("confidential"));
        assert!(legacy.payload_file(1).is_err());
        let mut op = legacy.clone(); op.publication_role = Some(PublicationRole::Results);
        op.confidential = Some(ConfidentialFiles { filename_mapping: ConfidentialFile { bytes: 7, sha256: Sha256::digest(b"mapping").into() },
            identities: ConfidentialFile { bytes: 10, sha256: Sha256::digest(b"identities").into() }, workbook: None });
        assert_eq!(op.payload_file(1).unwrap().name, FILENAME_MAPPING);
        assert_eq!(op.payload_file(2).unwrap().name, IDENTITIES_FILE);
        assert!(op.payload_file(3).is_err());
        let mut invalid = op.clone(); invalid.publication_role = None; assert!(invalid.payload_file(1).is_err());
        invalid = op.clone(); invalid.processing_mode = "markdown-only".into(); assert!(invalid.payload_file(1).is_err());
        for value in [serde_json::Value::Null, serde_json::json!({}), serde_json::json!({"root":"anywhere"})] {
            let mut invalid = serde_json::to_value(&op).unwrap(); invalid["confidential"] = value;
            assert!(serde_json::from_value::<Operation>(invalid).is_err());
        }
        let mut invalid = serde_json::to_value(&op).unwrap(); invalid["confidential"].as_object_mut().unwrap().remove("filename_mapping");
        assert!(serde_json::from_value::<Operation>(invalid).is_err());
        assert_eq!(fs::read_dir(f.path.join("private").join(&op.binding.private_name)).unwrap().count(), 0);
    }
    #[test]
    fn confidential_results_broker_reopens_exact_companions_and_never_recreates_deleted_output() {
        use crate::export_directory::{ConfidentialFile, CONFIDENTIAL_DIRECTORY, FILENAME_MAPPING, IDENTITIES_FILE};
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let mut op = f.op(&guard); op.publication_role = Some(PublicationRole::Results);
        op.confidential = Some(ConfidentialFiles { filename_mapping: ConfidentialFile { bytes: 7, sha256: Sha256::digest(b"mapping").into() },
            identities: ConfidentialFile { bytes: 10, sha256: Sha256::digest(b"identities").into() }, workbook: None });
        let data = f.path.join("private");
        for (index, bytes) in [b"hello".as_slice(), b"mapping".as_slice(), b"identities".as_slice()].into_iter().enumerate() {
            assert_eq!(write_body(&data, &op, index, bytes, &guard).unwrap(), "staged");
        }
        assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "completed");
        assert_eq!(execute(&data, &op, "acknowledge", &guard).unwrap(), "acknowledged");
        assert_eq!(inspect_results(&data, &op, &guard).unwrap(), "acknowledged");
        assert!(execute(&data, &op, "inspect_completed_directory", &guard).is_err(), "directory inspection adds no mutating command ingress");
        let mut legacy_role = op.clone(); legacy_role.publication_role = None;
        assert!(inspect_results(&data, &legacy_role, &guard).is_err(), "legacy export callers cannot acquire the working-directory exception");
        let generation = f.path.join("public/DataSecure-KI-Export").join(format!("Ergebnisse-{}", op.operation_id));
        let confidential = generation.join(CONFIDENTIAL_DIRECTORY);
        assert_eq!(fs::read_dir(&confidential).unwrap().count(), 2);
        assert_eq!(fs::read(confidential.join(FILENAME_MAPPING)).unwrap(), b"mapping");
        assert_eq!(fs::read(confidential.join(IDENTITIES_FILE)).unwrap(), b"identities");
        let mut legacy = op.clone(); legacy.confidential = None;
        assert!(inspect_results(&data, &legacy, &guard).is_err(), "a new result cannot be reinterpreted as the old flat plan");
        fs::remove_file(confidential.join(IDENTITIES_FILE)).unwrap();
        assert_eq!(inspect_results(&data, &op, &guard).unwrap(), "acknowledged", "confirmed public copies may lose a companion without repair");
        assert!(execute(&data, &op, "publish", &guard).is_err());
        assert!(!confidential.join(IDENTITIES_FILE).exists());
        assert_eq!(fs::read(generation.join("Dokument_01.md")).unwrap(), b"hello");
    }
    #[test]
    fn confidential_workbook_operation_keeps_fixed_indices_roles_and_readonly_original_plan_binding() {
        use crate::export_directory::{ConfidentialFile, CONFIDENTIAL_DIRECTORY, IDENTITIES_FILE};
        let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let mut op = f.op(&guard); op.publication_role = Some(PublicationRole::Results);
        op.confidential = Some(ConfidentialFiles { filename_mapping: ConfidentialFile { bytes: 7, sha256: Sha256::digest(b"mapping").into() },
            identities: ConfidentialFile { bytes: 10, sha256: Sha256::digest(b"identities").into() },
            workbook: Some(ConfidentialFile { bytes: 8, sha256: Sha256::digest(b"workbook").into() }) });
        assert_eq!(op.payload_file(1).unwrap().name, "Dateizuordnung.csv");
        assert_eq!(op.payload_file(2).unwrap().name, "Pseudonym-Zuordnung.txt");
        assert_eq!(op.payload_file(3).unwrap().name, "Pseudonym-Zuordnung.xlsx"); assert!(op.payload_file(4).is_err());
        let mut invalid = op.clone(); invalid.publication_role = None; assert!(invalid.payload_file(1).is_err());
        invalid = op.clone(); invalid.processing_mode = "markdown-only".into(); assert!(invalid.payload_file(1).is_err());
        let mut invalid = serde_json::to_value(&op).unwrap(); invalid["confidential"]["workbook"] = serde_json::Value::Null;
        assert!(serde_json::from_value::<Operation>(invalid).is_err());
        let data = f.path.join("private");
        for (index, bytes) in [b"hello".as_slice(), b"mapping".as_slice(), b"identities".as_slice(), b"workbook".as_slice()].into_iter().enumerate() {
            assert_eq!(write_body(&data, &op, index, bytes, &guard).unwrap(), "staged");
        }
        assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "completed");
        assert_eq!(execute(&data, &op, "acknowledge", &guard).unwrap(), "acknowledged");
        assert_eq!(inspect_results(&data, &op, &guard).unwrap(), "acknowledged");
        let generation = f.path.join("public/DataSecure-KI-Export").join(format!("Ergebnisse-{}", op.operation_id));
        let folder = generation.join(CONFIDENTIAL_DIRECTORY); assert_eq!(fs::read_dir(&folder).unwrap().count(), 3);
        assert_eq!(fs::read(folder.join("Pseudonym-Zuordnung.xlsx")).unwrap(), b"workbook");
        assert!(!folder.join(IDENTITIES_FILE).exists());
        let mut old = op.clone(); old.confidential.as_mut().unwrap().workbook = None;
        assert!(inspect_results(&data, &old, &guard).is_err());
        fs::remove_file(folder.join("Pseudonym-Zuordnung.xlsx")).unwrap();
        assert_eq!(inspect_results(&data, &op, &guard).unwrap(), "acknowledged"); assert!(execute(&data, &op, "publish", &guard).is_err());
        assert!(!folder.join("Pseudonym-Zuordnung.xlsx").exists());
    }
    #[test]
    fn result_role_history_inspection_never_creates_setup_or_repairs_missing_receipts() {
        fn tree(root: &Path) -> Vec<(PathBuf, Option<Vec<u8>>)> {
            fn visit(base: &Path, directory: &Path, rows: &mut Vec<(PathBuf, Option<Vec<u8>>)>) {
                let mut children: Vec<_> = fs::read_dir(directory).unwrap().map(|entry| entry.unwrap().path()).collect();
                children.sort();
                for child in children {
                    let metadata = fs::symlink_metadata(&child).unwrap(); assert!(!metadata.file_type().is_symlink());
                    rows.push((child.strip_prefix(base).unwrap().to_path_buf(), if metadata.is_file() { Some(fs::read(&child).unwrap()) } else { None }));
                    if metadata.is_dir() { visit(base, &child, rows); }
                }
            }
            let mut rows = Vec::new(); visit(root, root, &mut rows); rows
        }
        for missing in ["setup", "complete", "parent-binding", "transaction-intent", "lock", "fake-complete", "missing-started",
            "pending", "folder-missing", "folder-replaced", "root-replaced", "changed-body", "deleted-body", "extra-file", "none"] {
            let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let mut op = f.op(&guard); op.publication_role = Some(PublicationRole::Results);
            let data = f.path.join("private");
            let private = data.join(&op.binding.private_name);
            let journal = private.join(format!("journal-{}", op.operation_id));
            if missing != "setup" {
                write_body(&data, &op, 0, b"hello", &guard).unwrap();
                if missing != "pending" { assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "completed"); }
                let remove = match missing {
                    "complete" => Some(journal.join(format!("{}-complete.json", op.operation_id))),
                    "parent-binding" => Some(private.join(format!("{}-parents-binding.json", op.operation_id))),
                    "transaction-intent" => Some(journal.join(format!("{}-intent.json", op.operation_id))),
                    "missing-started" => Some(journal.join(format!("{}-started.json", op.operation_id))),
                    "lock" => Some(journal.join("export-control.lock")), _ => None,
                };
                if let Some(path) = remove { fs::remove_file(path).unwrap(); }
                if missing == "fake-complete" { fs::write(journal.join(format!("{}-complete.json", op.operation_id)), b"{}").unwrap(); }
                let generation = f.path.join("public/DataSecure-KI-Export").join(format!("Ergebnisse-{}", op.operation_id));
                if missing == "changed-body" { fs::write(generation.join("Dokument_01.md"), b"other").unwrap(); }
                if missing == "deleted-body" { fs::remove_file(generation.join("Dokument_01.md")).unwrap(); }
                if missing == "extra-file" { fs::write(generation.join("foreign.txt"), b"not ours").unwrap(); }
                if ["folder-missing", "folder-replaced"].contains(&missing) {
                    fs::rename(&generation, generation.with_file_name("retired-working-copy")).unwrap();
                    if missing == "folder-replaced" { fs::create_dir(&generation).unwrap(); fs::write(generation.join("Dokument_01.md"), b"hello").unwrap(); }
                }
                if missing == "root-replaced" {
                    fs::rename(f.path.join("public"), f.path.join("retired-public")).unwrap();
                    fs::create_dir(f.path.join("public")).unwrap();
                }
            }
            let before = tree(&f.path);
            let result = inspect_results(&data, &op, &guard);
            let working_copy = ["none", "changed-body", "deleted-body", "extra-file"].contains(&missing);
            assert_eq!(result.is_ok(), working_copy, "{missing}");
            if working_copy { assert_eq!(result.unwrap(), "completed"); }
            assert_eq!(tree(&f.path), before, "history inspection changed names or bytes: {missing}");
            if ["changed-body", "deleted-body", "extra-file"].contains(&missing) {
                for command in ["publish", "reconcile", "acknowledge"] {
                    assert!(execute(&data, &op, command, &guard).is_err(), "{missing} must remain strict for {command}");
                }
                assert_eq!(tree(&f.path), before, "a failed mutation must not repair the public working copy");
            }
            if missing == "complete" {
                assert_eq!(execute(&data, &op, "reconcile", &guard).unwrap(), "completed", "only publication context can recover lost completion");
                assert_eq!(inspect_results(&data, &op, &guard).unwrap(), "completed");
            }
        }
    }
    #[test]
    fn result_role_operations_publish_immutable_generations_without_changing_legacy_authority() {
        for mode in ["markdown-only", "markdown-and-anonymize"] {
            let f = Fixture::new(); let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let mut op = f.op(&guard); op.processing_mode = mode.into();
            let legacy_json = serde_json::to_value(&op).unwrap();
            assert!(legacy_json.get("publication_role").is_none());
            assert!(serde_json::from_value::<Operation>(legacy_json.clone()).unwrap().publication_role.is_none());
            for bad in [serde_json::Value::Null, serde_json::json!("export"), serde_json::json!(false), serde_json::json!({ "results": null })] {
                let mut value = legacy_json.clone(); value["publication_role"] = bad;
                assert!(serde_json::from_value::<Operation>(value).is_err());
            }
            op.publication_role = Some(PublicationRole::Results);
            let data = f.path.join("private");
            write_body(&data, &op, 0, b"hello", &guard).unwrap();
            assert_eq!(execute(&data, &op, "publish", &guard).unwrap(), "completed");
            assert_eq!(execute(&data, &op, "acknowledge", &guard).unwrap(), "acknowledged");
            let namespace = if mode == "markdown-only" { "DataSecure-Markdown-Korrektur" } else { "DataSecure-KI-Export" };
            let target = f.path.join("public").join(namespace);
            let first = target.join(format!("Ergebnisse-{}", op.operation_id));
            assert_eq!(fs::read(first.join("Dokument_01.md")).unwrap(), b"hello");
            let mut legacy = op.clone(); legacy.publication_role = None;
            assert!(execute(&data, &legacy, "reconcile", &guard).is_err());
            assert!(!target.join(format!("Export-{}", op.operation_id)).exists());
            let mut next = op.clone(); next.operation_id = "e".repeat(32); next.request_sha256 = "f".repeat(64);
            next.files[0].sha256 = Sha256::digest(b"world").into();
            write_body(&data, &next, 0, b"world", &guard).unwrap();
            assert_eq!(execute(&data, &next, "publish", &guard).unwrap(), "completed");
            assert_eq!(fs::read(first.join("Dokument_01.md")).unwrap(), b"hello", "no in-place revision update");
            assert_eq!(fs::read(target.join(format!("Ergebnisse-{}", next.operation_id)).join("Dokument_01.md")).unwrap(), b"world");
            assert_eq!(fs::read_dir(target).unwrap().count(), 2);
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
    fn configured_bigint_admission_matches_actual_node_without_number_rounding() {
        let f = Fixture::new(); let root = f.path.join("public");
        let node = std::env::var_os("DATASECURE_TEST_NODE").unwrap_or_else(|| "node".into());
        let output = std::process::Command::new(node).args(["-e",
            "const s=require('node:fs').statSync(process.argv[1],{bigint:true});process.stdout.write(JSON.stringify({dev:String(s.dev),ino:String(s.ino),birthtime_ns:String(s.birthtimeNs)}));"])
            .arg(&root).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let expected: Node22BigIntIdentity = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(Directory::open_existing(&root, None).unwrap().node22_bigint_identity().unwrap(), expected);
        let value = serde_json::json!({"kind":"node22_bigint", "identity": expected});
        assert!(matches!(serde_json::from_value::<ConfiguredAdmission>(value.clone()).unwrap(), ConfiguredAdmission::Node22BigInt(_)));
        for bad in [serde_json::json!(0), serde_json::json!({"dev":"1","ino":"2","birthtime_ms":"3"}),
            serde_json::json!({"dev":"1","ino":"2","birthtime_ns":"3","extra":true})] {
            let mut invalid = value.clone(); invalid["identity"] = bad;
            assert!(serde_json::from_value::<ConfiguredAdmission>(invalid).is_err());
        }
    }
    #[test]
    fn configured_bigint_requires_fresh_exact_setting_and_never_upgrades_legacy_numbers() {
        for fault in ["root", "digest", "ino", "dev", "birthtime_ns", "noncanonical", "legacy1", "legacy2", "bound6", "none"] {
            let f = Fixture::new(); let root = f.path.join("public"); let data_path = f.path.join("private");
            let expected = Directory::open_existing(&root, None).unwrap().node22_bigint_identity().unwrap();
            let mut admission_id = expected.clone();
            match fault {
                "ino" => admission_id.ino = "0".into(), "dev" => admission_id.dev = "0".into(),
                "birthtime_ns" => admission_id.birthtime_ns = "0".into(),
                "noncanonical" => admission_id.ino.insert(0, '0'), _ => (),
            }
            let schema = match fault { "legacy1" => "datasecure-result-root/1", "legacy2" => "datasecure-result-root/2",
                "bound6" => "datasecure-result-root/6", _ => "datasecure-result-root/5" };
            let bytes = serde_json::to_vec(&serde_json::json!({"schema":schema, "root":root,
                "identity":{"dev":"1","ino":"70931694135686580","birthtime_ms":"3"},
                "exact_identity": admission_id, "notices":{"sync":false,"network":false}})).unwrap();
            let data = Directory::open_existing(&data_path, None).unwrap();
            let settings = data.create_controlled_child("settings").unwrap();
            settings.write_record_atomic("result-root.json", &bytes).unwrap(); drop(settings); drop(data);
            let digest = if fault == "digest" { "0".repeat(64) } else { format!("{:x}", Sha256::digest(&bytes)) };
            if fault == "root" { fs::rename(&root, f.path.join("original-public")).unwrap(); fs::create_dir(&root).unwrap(); }
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let result = prepare_configured(&root, &data_path, &"c".repeat(32), &ConfiguredAdmission::Node22BigInt(admission_id), &digest, &guard);
            assert_eq!(result.is_ok(), fault == "none", "{fault}");
            assert_eq!(fs::read(data_path.join("settings/result-root.json")).unwrap(), bytes, "never repair or upgrade settings");
            if fault != "none" {
                assert_eq!(fs::read_dir(&root).unwrap().count(), 0, "{fault}: no public provisioning");
                assert_eq!(fs::read_dir(&data_path).unwrap().count(), 1, "{fault}: settings only");
            }
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
    fn initial_fixture(f: &Fixture, exact: bool) -> (ConfiguredAdmission, String, Vec<u8>) {
        let initial = configured_fixture(f);
        if !exact { return initial; }
        let id = Directory::open_existing(&f.path.join("public"), None).unwrap().node22_bigint_identity().unwrap();
        let bytes = serde_json::to_vec(&serde_json::json!({ "schema":"datasecure-result-root/5", "root":f.path.join("public"),
            "identity":{"dev":"1","ino":"2","birthtime_ms":"3"}, "exact_identity":id,
            "notices":{"sync":false,"network":false} })).unwrap();
        fs::write(f.path.join("private/settings/result-root.json"), &bytes).unwrap();
        (ConfiguredAdmission::Node22BigInt(id), format!("{:x}", Sha256::digest(&bytes)), bytes)
    }
    #[test]
    fn initial_output_prestart_creates_two_controlled_children_and_lost_reply_reopens_same_objects() {
        for exact in [false, true] {
            let f = Fixture::new(); let (admission, digest, bytes) = initial_fixture(&f, exact);
            let root = f.path.join("public"); let data = f.path.join("private");
            let root_before = Directory::open_existing(&root, None).unwrap().identity();
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let binding = prepare_initial_output_root(&root, &data, &admission, &digest, &guard).unwrap();
            assert_eq!(binding.schema, "datasecure-initial-output-binding/1");
            let public = Directory::open_existing(&root, Some(root_before)).unwrap();
            assert_eq!(binding.root_identity, public.node22_bigint_identity().unwrap());
            for (name, expected) in [("DataSecure-Markdown", &binding.markdown_identity), ("DataSecure-Output", &binding.output_identity)] {
                let child = Directory::open_existing(&root.join(name), None).unwrap(); child.verify_controlled().unwrap();
                assert_eq!(&child.node22_bigint_identity().unwrap(), expected);
                assert_eq!(fs::read_dir(root.join(name)).unwrap().count(), 0);
            }
            // Simulated lost reply is not a fresh run, mapping, staging nonce,
            // intake delegation or permission repair. Both identities survive.
            assert_eq!(prepare_initial_output_root(&root, &data, &admission, &digest, &guard).unwrap(), binding);
            assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
            assert_eq!(fs::read_dir(data).unwrap().count(), 1);
            assert_eq!(fs::read_dir(root).unwrap().count(), 2);
        }
    }
    #[test]
    fn initial_output_extended_native_settings_do_not_extend_legacy_export_admission() {
        for schema in ["datasecure-result-root/4", "datasecure-result-root/6"] {
            let f = Fixture::new(); let (_, _, old) = configured_fixture(&f);
            let root = f.path.join("public"); let data = f.path.join("private");
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let export = configure(&root, &data, &"d".repeat(32), &guard).unwrap();
            let mut record: serde_json::Value = serde_json::from_slice(&old).unwrap();
            record["schema"] = serde_json::json!(schema); record.as_object_mut().unwrap().remove("native_identity");
            record["native_export"] = serde_json::json!(export);
            let bytes = serde_json::to_vec(&record).unwrap(); fs::write(data.join("settings/result-root.json"), &bytes).unwrap();
            let digest = format!("{:x}", Sha256::digest(&bytes)); let admission = ConfiguredAdmission::Native(export.root_identity);
            assert!(prepare_configured(&root, &data, &"c".repeat(32), &admission, &digest, &guard).is_err(), "old export migration is unchanged");
            prepare_initial_output_root(&root, &data, &admission, &digest, &guard).unwrap();
            assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
        }
    }
    #[test]
    fn initial_output_rejects_rounded_settings_and_wrong_root_digest_identity_before_creating_children() {
        for fault in ["rounded", "legacy-upgrade", "root", "digest", "identity"] {
            let f = Fixture::new(); let (mut admission, mut digest, mut bytes) = initial_fixture(&f, true);
            let root = f.path.join("public"); let data = f.path.join("private");
            if fault == "rounded" || fault == "legacy-upgrade" {
                let id = Node22Identity { dev:"1".into(), ino:"2".into(), birthtime_ms:"3".into() };
                let mut record: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
                record["schema"] = serde_json::json!("datasecure-result-root/2");
                bytes = serde_json::to_vec(&record).unwrap(); fs::write(data.join("settings/result-root.json"), &bytes).unwrap();
                digest = format!("{:x}", Sha256::digest(&bytes));
                if fault == "rounded" { admission = ConfiguredAdmission::Node22(id); }
            }
            if fault == "root" { fs::rename(&root, f.path.join("retired-public")).unwrap(); fs::create_dir(&root).unwrap(); }
            if fault == "digest" { digest = "0".repeat(64); }
            if fault == "identity" { if let ConfiguredAdmission::Node22BigInt(ref mut id) = admission { id.ino = "0".into(); } }
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            assert!(prepare_initial_output_root(&root, &data, &admission, &digest, &guard).is_err(), "{fault}");
            assert_eq!(fs::read_dir(root).unwrap().count(), 0);
            assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
        }
    }
    #[test]
    fn initial_output_checks_settings_before_and_after_provisioning_without_repair() {
        for phase in ["initial_before_provision", "initial_after_provision"] {
            let f = Fixture::new(); let (admission, digest, _) = initial_fixture(&f, true);
            let root = f.path.join("public"); let data = f.path.join("private");
            let target = data.join("settings/result-root.json"); let changed = target.clone();
            let lifecycle = Lifecycle::default();
            let guard = lifecycle.begin_native().unwrap().with_test_event(move |point| {
                if point == phase { fs::write(&changed, b"changed settings, not repairable").unwrap(); }
            });
            assert!(prepare_initial_output_root(&root, &data, &admission, &digest, &guard).is_err());
            assert_eq!(fs::read(target).unwrap(), b"changed settings, not repairable");
            assert_eq!(fs::read_dir(root).unwrap().count(), if phase == "initial_before_provision" { 0 } else { 2 });
        }
    }
    #[test]
    fn initial_output_collision_is_refused_without_adopting_or_deleting_the_foreign_object() {
        let f = Fixture::new(); let (admission, digest, bytes) = initial_fixture(&f, true);
        let root = f.path.join("public"); let data = f.path.join("private"); let collision = root.join("DataSecure-Markdown");
        let created = collision.clone(); let lifecycle = Lifecycle::default();
        let guard = lifecycle.begin_native().unwrap().with_test_event(move |point| {
            if point == "initial_before_create" { fs::write(&created, b"collision is not an output folder").unwrap(); }
        });
        assert!(prepare_initial_output_root(&root, &data, &admission, &digest, &guard).is_err());
        assert_eq!(fs::read(collision).unwrap(), b"collision is not an output folder");
        assert!(!root.join("DataSecure-Output").exists());
        assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
    }
    #[test]
    fn initial_output_different_volume_is_not_the_rename_export_contract() {
        let public = Identity { volume: 2, object: 3, created_ns: 4 };
        let private = Identity { volume: 9, object: 3, created_ns: 4 };
        validate_initial_roots(public, private).unwrap();
        assert!(validate_configuration_roots(public, private).is_err(), "existing rename-based export still rejects a volume mismatch");
        assert!(validate_initial_roots(public, public).is_err());
    }
    #[cfg(windows)]
    fn initial_test_acl(target: &Path, policy: &str) {
        use std::os::windows::fs::OpenOptionsExt;
        let file = fs::OpenOptions::new().access_mode(0x0004_0000 | 0x0002_0000).share_mode(7)
            .custom_flags(0x0200_0000 | 0x0020_0000).open(target).unwrap();
        crate::export_private_security::initial_output_test_policy(&file, policy).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn initial_output_broad_parent_modify_is_preserved_while_new_children_receive_protected_owner_only_acls() {
        use std::os::windows::fs::OpenOptionsExt;
        let f = Fixture::new(); let (admission, digest, settings_bytes) = initial_fixture(&f, true);
        let root = f.path.join("public"); let data = f.path.join("private");
        // This ACL change is confined to this exclusively created synthetic
        // fixture. It reproduces inherited Modify's effective broad grant;
        // neither a real user directory nor a production policy is changed.
        initial_test_acl(&root, "foreign-modify");
        let owner_dacl_bytes = || {
            let file = fs::OpenOptions::new().access_mode(0x0002_0000).share_mode(7)
                .custom_flags(0x0200_0000 | 0x0020_0000).open(&root).unwrap();
            crate::export_private_security::initial_output_test_security_bytes(&file).unwrap()
        };
        let before_security = owner_dacl_bytes();
        let before = Directory::open_existing(&root, None).unwrap();
        let root_identity = before.identity(); let node_identity = before.node22_bigint_identity().unwrap();
        assert!(before.verify_initial_output().is_err(), "the parent really grants foreign mutation");
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let binding = prepare_initial_output_root(&root, &data, &admission, &digest, &guard).unwrap();
        assert_eq!(binding.root_identity, node_identity);
        let after = Directory::open_existing(&root, Some(root_identity)).unwrap();
        assert_eq!(after.node22_bigint_identity().unwrap(), node_identity);
        assert_eq!(owner_dacl_bytes(), before_security, "parent Owner and DACL bytes must remain exact");
        assert!(after.verify_initial_output().is_err(), "the broad parent was not repaired");
        assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), settings_bytes);
        for (name, expected) in [("DataSecure-Markdown", &binding.markdown_identity), ("DataSecure-Output", &binding.output_identity)] {
            let child = Directory::open_existing(&root.join(name), None).unwrap();
            child.verify_controlled().unwrap(); // exact protected one-ACE Owner-only descriptor
            child.verify_initial_output().unwrap();
            assert_eq!(&child.node22_bigint_identity().unwrap(), expected);
            after.inspect_child(name, child.identity()).unwrap();
            assert_eq!(fs::read_dir(root.join(name)).unwrap().count(), 0);
        }
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        assert_eq!(fs::read_dir(&data).unwrap().count(), 1, "only unchanged settings, no processing or staging");
    }
    #[cfg(windows)]
    #[test]
    fn initial_output_existing_privileged_acl_is_not_repaired_and_foreign_write_is_not_accepted() {
        for policy in ["owner-system-admin", "foreign-write"] {
            let f = Fixture::new(); let (admission, digest, bytes) = initial_fixture(&f, true);
            let root = f.path.join("public"); let data = f.path.join("private");
            let public = Directory::open_existing(&root, None).unwrap();
            public.create_controlled_child("DataSecure-Output").unwrap();
            let output = root.join("DataSecure-Output"); fs::write(output.join("manual.txt"), b"user working copy").unwrap();
            initial_test_acl(&output, policy);
            let before = Directory::open_existing(&output, None).unwrap().node22_bigint_identity().unwrap();
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
            let result = prepare_initial_output_root(&root, &data, &admission, &digest, &guard);
            assert_eq!(result.is_ok(), policy == "owner-system-admin");
            assert_eq!(fs::read(output.join("manual.txt")).unwrap(), b"user working copy");
            let after = Directory::open_existing(&output, None).unwrap();
            assert_eq!(after.node22_bigint_identity().unwrap(), before);
            assert!(after.verify_controlled().is_err(), "existing ACL was not rewritten to exact Owner-only");
            assert_eq!(after.verify_initial_output().is_ok(), policy == "owner-system-admin");
            assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
            if policy == "foreign-write" { assert!(!root.join("DataSecure-Markdown").exists()); }
        }
    }
    #[cfg(windows)]
    #[test]
    fn initial_output_denied_creation_does_not_change_existing_root_permissions_or_preferences() {
        let f = Fixture::new(); let (admission, digest, bytes) = initial_fixture(&f, true);
        let root = f.path.join("public"); let data = f.path.join("private"); initial_test_acl(&root, "deny-create");
        let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap();
        let failure = prepare_initial_output_root(&root, &data, &admission, &digest, &guard).unwrap_err();
        assert_eq!(failure.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(fs::read_dir(root).unwrap().count(), 0);
        assert_eq!(fs::read(data.join("settings/result-root.json")).unwrap(), bytes);
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
    #[test]
    fn configured_admission_diagnostics_distinguish_preflight_failures_without_provisioning() {
        use ConfigureStage::*;
        for (fault, stage) in [("digest_encoding", AdmissionDigestEncoding), ("data", AdmissionDataOpen),
            ("settings", AdmissionSettingsOpen), ("read", AdmissionSettingsRead), ("digest", AdmissionSettingsDigest),
            ("parse", AdmissionSettingsParse), ("root", AdmissionRoot), ("record", AdmissionRecord),
            ("native_identity", AdmissionNativeIdentity), ("public", AdmissionPublicOpen)] {
            let f = Fixture::new(); let (mut admission, mut digest, mut bytes) = configured_fixture(&f);
            let root = f.path.join("public"); let original_data = f.path.join("private"); let mut data = original_data.clone();
            let setting = original_data.join("settings/result-root.json");
            match fault {
                "digest_encoding" => digest = "invalid".into(),
                "data" => data = f.path.join("missing-private"),
                "settings" => fs::rename(original_data.join("settings"), original_data.join("original-settings")).unwrap(),
                "read" => fs::rename(&setting, setting.with_extension("original")).unwrap(),
                "digest" => digest = "0".repeat(64),
                "parse" => { bytes = b"not-json PRIVATE payload".to_vec(); fs::write(&setting, &bytes).unwrap(); digest = format!("{:x}", Sha256::digest(&bytes)); },
                "root" | "record" | "native_identity" => {
                    let mut record: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
                    if fault == "root" { record["root"] = serde_json::json!(f.path.join("other-public")); }
                    if fault == "record" { record["schema"] = serde_json::json!("datasecure-result-root/2"); }
                    if fault == "native_identity" {
                        if let ConfiguredAdmission::Native(ref mut id) = admission { id.object = "not-decimal".into(); }
                        if let ConfiguredAdmission::Native(ref id) = admission { record["native_identity"] = serde_json::json!(id); }
                    }
                    bytes = serde_json::to_vec(&record).unwrap(); fs::write(&setting, &bytes).unwrap(); digest = format!("{:x}", Sha256::digest(&bytes));
                },
                "public" => fs::rename(&root, f.path.join("original-public")).unwrap(),
                _ => unreachable!(),
            }
            let lifecycle = Lifecycle::default(); let guard = lifecycle.begin_native().unwrap(); let mut observed = Vec::new();
            let failure = prepare_configured_observed(&root, &data, &"c".repeat(32), &admission, &digest, &guard,
                |failure| observed.push(failure)).unwrap_err();
            assert_eq!(observed.len(), 1, "{fault}"); assert_eq!(observed[0].stage, stage, "{fault}");
            assert_eq!(observed[0].io_error_kind, format!("{:?}", failure.kind()), "{fault}");
            assert_eq!(observed[0].raw_os_error, failure.raw_os_error(), "{fault}");
            let closed = serde_json::to_value(&observed[0]).unwrap();
            assert_eq!(closed.as_object().unwrap().len(), 3);
            assert!(!closed.to_string().contains("PRIVATE")); assert!(!closed.to_string().contains(&f.path.to_string_lossy().to_string()));
            assert_eq!(fs::read_dir(&original_data).unwrap().count(), 1, "{fault}: settings only, no provisioning");
            let preserved_public = if fault == "public" { f.path.join("original-public") } else { root };
            assert_eq!(fs::read_dir(preserved_public).unwrap().count(), 0, "{fault}: no public provisioning");
        }
    }
    #[test]
    fn configured_admission_diagnostics_keep_exact_identity_mismatch_and_repeat_failure_distinct() {
        use ConfigureStage::*;
        for repeat in [false, true] {
            let f = Fixture::new(); let root = f.path.join("public"); let data_path = f.path.join("private");
            let data = Directory::open_existing(&data_path, None).unwrap(); let settings = data.create_controlled_child("settings").unwrap();
            let mut exact = Directory::open_existing(&root, None).unwrap().node22_bigint_identity().unwrap();
            if !repeat { exact.birthtime_ns.push('0'); }
            let bytes = serde_json::to_vec(&serde_json::json!({ "schema":"datasecure-result-root/5", "root":root,
                "exact_identity":exact, "identity":{"dev":"1","ino":"2","birthtime_ms":"3"}, "notices":{"sync":false,"network":false}})).unwrap();
            settings.write_record_atomic("result-root.json", &bytes).unwrap(); drop(settings); drop(data);
            let digest = format!("{:x}", Sha256::digest(&bytes)); let setting = data_path.join("settings/result-root.json");
            let changed = setting.clone(); let lifecycle = Lifecycle::default();
            let guard = lifecycle.begin_native().unwrap().with_test_event(move |phase| {
                if repeat && phase == "configured_after_provision" { fs::write(&changed, b"changed PRIVATE setting").unwrap(); }
            });
            let mut observed = Vec::new();
            let failure = prepare_configured_observed(&root, &data_path, &"c".repeat(32), &ConfiguredAdmission::Node22BigInt(exact), &digest, &guard,
                |failure| observed.push(failure)).unwrap_err();
            assert_eq!(failure.to_string(), "AI_EXPORT_CONFLICT"); assert_eq!(failure.raw_os_error(), None);
            assert_eq!(observed.len(), 1); assert_eq!(observed[0].stage, if repeat { AdmissionRepeatSettingsMatch } else { AdmissionIdentityMatch });
            assert_eq!(observed[0].io_error_kind, "Other");
            if !repeat { assert_eq!(fs::read_dir(&root).unwrap().count(), 0); assert_eq!(fs::read(&setting).unwrap(), bytes); }
            else { assert_eq!(fs::read(&setting).unwrap(), b"changed PRIVATE setting", "diagnostics never repair the changed setting"); }
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
            let replacement_bytes = bytes.clone();
            let nonce = "c".repeat(32);
            let lifecycle = Lifecycle::default();
            let guard = lifecycle.begin_native().unwrap().with_test_event(move |point| {
                if point != "configured_before_provision" { return; }
                fs::rename(&changed, changed.with_extension("original")).unwrap();
                fs::create_dir(&changed).unwrap();
                let settings = if replace_data { let path = changed.join("settings"); fs::create_dir(&path).unwrap(); path } else { changed.clone() };
                fs::write(settings.join("result-root.json"), &replacement_bytes).unwrap();
            });
            assert!(prepare_configured(&root, &data, &nonce, &admission, &digest, &guard).is_err());
            assert_eq!(fs::read_dir(root).unwrap().count(), 0);
            let names = |directory: &Path| {
                let mut entries = fs::read_dir(directory).unwrap().map(|entry| entry.unwrap().file_name().into_string().unwrap()).collect::<Vec<_>>();
                entries.sort(); entries
            };
            let original_data = if replace_data { data.with_extension("original") } else { data.clone() };
            let original_settings = if replace_data { original_data.join("settings") } else { data.join("settings.original") };
            let replacement_settings = data.join("settings");
            assert_eq!(names(&data), if replace_data { vec!["settings"] } else { vec!["settings", "settings.original"] });
            if replace_data { assert_eq!(names(&original_data), vec!["settings"]); }
            let private_name = format!("native-export-{nonce}");
            for private in [&original_data, &data] {
                assert_eq!(fs::symlink_metadata(private.join(&private_name)).unwrap_err().kind(), io::ErrorKind::NotFound, "no nonce in original or replacement namespace");
            }
            for settings in [&original_settings, &replacement_settings] {
                assert_eq!(names(settings), vec!["result-root.json"]);
                assert_eq!(fs::read(settings.join("result-root.json")).unwrap(), bytes, "original and replacement settings bytes stay unchanged");
            }
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
