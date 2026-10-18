//! Capability-only filesystem foundation used by the private v2 export broker.
//! Not a Tauri command or a generic renderer filesystem permission.
//!
//! All destination operations are relative to held directory handles. A new
//! file is created exclusively; publishing a complete directory never replaces
//! another entry. Opening an existing directory never creates missing parents.
//! The caller must bind the configured destination identity before publication
//! and must supply an exclusively controlled private staging parent. These
//! primitives provide bounded inventory hashing, but not approval, journal,
//! private-parent ACLs or a complete crash-recovery/publication broker.
#![allow(dead_code)]
use sha2::{Digest, Sha256};
use std::{fs::File, io::{self, Read, Seek, SeekFrom, Write}, path::Path};

// Closed diagnostic data only: no names, handles, descriptors or error text.
// String labels "0".."5"/"unknown" are classes, never raw ULONG_PTR values.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) enum ControlledCreateContext {
    #[serde(rename = "controlled_directory_first_create")]
    ControlledDirectoryFirstCreate,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) enum CreateInformationClass {
    #[serde(rename = "0")] Zero,
    #[serde(rename = "1")] One,
    #[serde(rename = "2")] Two,
    #[serde(rename = "3")] Three,
    #[serde(rename = "4")] Four,
    #[serde(rename = "5")] Five,
    #[serde(rename = "unknown")] Unknown,
}
impl CreateInformationClass {
    #[cfg(any(windows, test))]
    fn classify(information: usize) -> Self {
        match information {
            0 => Self::Zero, 1 => Self::One, 2 => Self::Two,
            3 => Self::Three, 4 => Self::Four, 5 => Self::Five,
            _ => Self::Unknown,
        }
    }
}
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ControlledDirectoryCreateFailure {
    pub context: ControlledCreateContext,
    pub nt_status: u32,
    pub mapped_os_error: u32,
    pub io_information_class: CreateInformationClass,
}
impl ControlledDirectoryCreateFailure {
    pub(crate) fn is_failure(&self) -> bool { self.nt_status & 0x8000_0000 != 0 }
}
#[cfg(any(windows, test))]
struct RelativeCreateFailure {
    directory: bool, create: bool, has_security: bool,
    nt_status: i32, mapped_os_error: u32, information: usize,
}
#[cfg(any(windows, test))]
fn failed_relative_create(attempt: RelativeCreateFailure,
    observe: impl FnOnce(ControlledDirectoryCreateFailure)) -> io::Error {
    // Preserve the original mapped error before invoking any diagnostic sink.
    // The NtCreateFile return value is authoritative here, not the reserved
    // pointer/status union. Information may still contain its initial zero;
    // its closed class is not proof that the kernel wrote it or created a file.
    let original = io::Error::from_raw_os_error(attempt.mapped_os_error as i32);
    if attempt.nt_status < 0 && attempt.directory && attempt.create && attempt.has_security {
        observe(ControlledDirectoryCreateFailure {
            context: ControlledCreateContext::ControlledDirectoryFirstCreate,
            nt_status: attempt.nt_status as u32, mapped_os_error: attempt.mapped_os_error,
            io_information_class: CreateInformationClass::classify(attempt.information),
        });
    }
    original
}

#[cfg(test)]
mod controlled_create_diagnostic_tests {
    use super::*;

    #[test]
    fn only_failed_controlled_directory_first_create_is_observed() {
        for directory in [false, true] {
            for create in [false, true] {
                for has_security in [false, true] {
                    for nt_status in [0, 0x103, i32::MIN, 0xc000_0022u32 as i32] {
                        let mut observed = Vec::new();
                        let original = io::Error::from_raw_os_error(4395);
                        let returned = failed_relative_create(RelativeCreateFailure {
                            directory, create, has_security, nt_status,
                            mapped_os_error: 4395, information: 0,
                        }, |failure| observed.push(failure));
                        assert_eq!(returned.raw_os_error(), original.raw_os_error());
                        assert_eq!(returned.kind(), original.kind());
                        assert_eq!(observed.len(), usize::from(nt_status < 0 && directory && create && has_security));
                    }
                }
            }
        }
    }

    #[test]
    fn returned_status_bits_and_original_mapped_error_are_preserved() {
        for nt_status in [i32::MIN, 0xc000_0022u32 as i32, -1] {
            for mapped_os_error in [0, 5, 4395, u32::MAX] {
                let original = io::Error::from_raw_os_error(mapped_os_error as i32);
                let mut observed = None;
                let returned = failed_relative_create(RelativeCreateFailure {
                    directory: true, create: true, has_security: true,
                    nt_status, mapped_os_error, information: 4,
                }, |failure| observed = Some(failure));
                assert_eq!(returned.raw_os_error(), original.raw_os_error());
                assert_eq!(returned.kind(), original.kind());
                assert_eq!(returned.to_string(), original.to_string());
                let failure = observed.unwrap();
                assert_eq!(failure.nt_status, nt_status as u32);
                assert_eq!(failure.mapped_os_error, mapped_os_error);
                assert!(failure.is_failure());
                assert_eq!(failure.io_information_class, CreateInformationClass::Four);
            }
        }
    }

    #[test]
    fn pointer_sized_information_never_becomes_diagnostic_data() {
        for (information, expected) in [(0, "0"), (1, "1"), (2, "2"), (3, "3"),
            (4, "4"), (5, "5"), (6, "unknown"), (usize::MAX, "unknown")] {
            let mut observed = None;
            let _ = failed_relative_create(RelativeCreateFailure {
                directory: true, create: true, has_security: true,
                nt_status: 0xc000_0022u32 as i32, mapped_os_error: 5, information,
            }, |failure| observed = Some(failure));
            let value = serde_json::to_value(observed.unwrap()).unwrap();
            assert_eq!(value, serde_json::json!({
                "context": "controlled_directory_first_create",
                "nt_status": 0xc000_0022u32, "mapped_os_error": 5,
                "io_information_class": expected,
            }));
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Identity { pub volume: u64, pub object: u128, pub created_ns: u128 }

fn identity(metadata: &std::fs::Metadata, volume: u64, object: u128) -> io::Result<Identity> {
    // Persisting only a device/inode pair would mistake a recycled inode for
    // the former object after restart. Unsupported birth-time filesystems are
    // deliberately not granted a weaker identity by this foundation.
    let created_ns = metadata.created()?.duration_since(std::time::UNIX_EPOCH).map_err(|_| unsafe_io())?.as_nanos();
    Ok(Identity { volume, object, created_ns })
}

fn unsafe_io() -> io::Error { io::Error::other("EXPORT_DIRECTORY_UNSAFE") }
fn leaf(name: &str) -> io::Result<()> {
    if name.is_empty() || name.len() > 255 || matches!(name, "." | "..") ||
        name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | ':')) ||
        name.ends_with(['.', ' ']) { return Err(unsafe_io()); }
    Ok(())
}

pub(crate) struct Directory { inner: platform::Directory, identity: Identity }
/// Sole cooperative lock authority; never clone or expose its file. On Unix,
/// closing only our fd can leave a flock alive in a fork-before-exec child.
/// Explicitly unlock the shared open description when authority is dropped.
pub(crate) struct ControlLock { file: File }
impl Drop for ControlLock {
    fn drop(&mut self) {
        #[cfg(unix)] {
            use std::os::fd::AsRawFd;
            unsafe { libc::flock(self.file.as_raw_fd(), libc::LOCK_UN); }
        }
    }
}
/// Read-only recovery capability retains the exact parent/name relationship.
/// It cannot create files or be republished as if it were a private stage.
pub(crate) struct RecoveredDirectory<'a> { parent: &'a Directory, name: String, directory: Directory }
impl RecoveredDirectory<'_> {
    pub fn verify_inventory(&self, expected: &[ExpectedFile]) -> io::Result<()> {
        self.parent.inspect_child(&self.name, self.directory.identity)?;
        self.directory.verify_inventory(expected)?;
        self.parent.inspect_child(&self.name, self.directory.identity)?;
        Ok(())
    }
}
/// Flat, neutral export inventory. Sizes are exact, not an allocation hint.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExpectedFile { pub name: String, pub bytes: u64, pub sha256: [u8; 32] }
pub(crate) fn validate_export_names(mode: &str, files: &[ExpectedFile]) -> io::Result<()> {
    let mut used = std::collections::HashSet::new();
    for (index, file) in files.iter().enumerate() {
        leaf(&file.name)?;
        if mode == "markdown-and-anonymize" {
            if file.name != format!("Dokument_{:02}.md", index + 1) { return Err(unsafe_io()); }
        } else if mode == "markdown-only" {
            let name = &file.name;
            let stem = name.split('.').next().unwrap_or("").to_uppercase();
            let device = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str()) ||
                ["COM", "LPT"].iter().any(|prefix| stem.strip_prefix(prefix).is_some_and(|suffix|
                    suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9') || ["¹", "²", "³"].contains(&suffix)));
            if name.len() <= 3 || !name.ends_with(".md") || device || name.chars().any(|c|
                matches!(c, '<' | '>' | '"' | '|' | '?' | '*' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{206f}' | '\u{feff}')) {
                return Err(unsafe_io());
            }
        } else { return Err(unsafe_io()); }
        let key = icu_normalizer::ComposingNormalizer::new_nfc().normalize(&file.name).to_lowercase();
        if !used.insert(key) { return Err(unsafe_io()); }
    }
    Ok(())
}

#[cfg(test)]
mod filename_tests {
    use super::*;
    fn files(names: &[&str]) -> Vec<ExpectedFile> { names.iter().map(|name| ExpectedFile { name: (*name).into(), bytes: 1, sha256: [0;32] }).collect() }
    #[test]
    fn names_are_mode_bound_and_platform_safe() {
        for names in [vec!["Quelle.md"], vec!["ä.md", "🧪 Bericht.md"], vec!["A.md", "A (2).md"]] {
            assert!(validate_export_names("markdown-only", &files(&names)).is_ok());
        }
        for names in [vec!["CON.md"], vec!["LPT1.md"], vec!["COM¹.md"], vec!["../a.md"], vec!["a:b.md"], vec!["a?.md"],
            vec!["a.md", "A.md"], vec!["é.md", "e\u{301}.md"], vec!["x.pdf"], vec!["a\u{200b}.md"]] {
            assert!(validate_export_names("markdown-only", &files(&names)).is_err(), "{names:?}");
        }
        assert!(validate_export_names("markdown-only", &files(&[&format!("{}.md", "🧪".repeat(64))])).is_err());
        assert!(validate_export_names("markdown-and-anonymize", &files(&["Quelle.md"])).is_err());
        assert!(validate_export_names("markdown-and-anonymize", &files(&["Dokument_01.md"])).is_ok());
    }
}
impl Directory {
    /// The expected identity must come from the prior authoritative native
    /// binding, not a fresh pathname stat after an untrusted mkdir.
    pub fn open_existing(path: &Path, expected: Option<Identity>) -> io::Result<Self> {
        let inner = platform::open_directory(path)?;
        let identity = platform::directory_identity(&inner)?;
        if expected.is_some_and(|value| value != identity) { return Err(unsafe_io()); }
        Ok(Self { inner, identity })
    }
    pub fn identity(&self) -> Identity { self.identity }
    /// Initial authorization only (the native result picker). Recovery must
    /// instead use the previously persisted identity with open_bound_child.
    pub fn bind_output_child(&self, name: &str) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let child = match platform::open_recovery_child(&self.inner, name) {
            Ok(inner) => Self { identity: platform::directory_identity(&inner)?, inner },
            Err(e) if e.kind() == io::ErrorKind::NotFound => self.create_controlled_child(name)?,
            Err(e) => return Err(e),
        };
        self.inspect_child(name, child.identity)?; Ok(child)
    }
    pub fn open_bound_child(&self, name: &str, expected: Identity) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let inner = platform::open_recovery_child(&self.inner, name)?;
        if platform::directory_identity(&inner)? != expected { return Err(unsafe_io()); }
        self.inspect_child(name, expected)?;
        Ok(Self { inner, identity: expected })
    }
    pub fn verify_controlled(&self) -> io::Result<()> {
        self.check()?;
        platform::verify_private(&self.inner)?;
        self.check()
    }
    /// Provision a private parent with native security at creation, not by
    /// changing permissions on a pathname after mkdir. A collision is an error.
    /// This protects against other ordinary accounts, not same-account code.
    pub fn create_controlled_child(&self, name: &str) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let inner = platform::create_controlled_directory(&self.inner, name)?;
        let identity = platform::directory_identity(&inner)?;
        platform::verify_private(&inner)?;
        self.inspect_child(name, identity)?;
        Ok(Self { inner, identity })
    }
    /// Recovery needs BOTH the durable native identity and the private ACL /
    /// owner/mode proof. Never adopt an existing directory by name alone.
    pub fn open_controlled_child(&self, name: &str, expected: Identity) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let inner = platform::open_recovery_child(&self.inner, name)?;
        if platform::directory_identity(&inner)? != expected { return Err(unsafe_io()); }
        platform::verify_private(&inner)?;
        self.inspect_child(name, expected)?;
        Ok(Self { inner, identity: expected })
    }
    /// Bounded journal/body read through the held directory. Missing is distinct
    /// from inaccessible, replaced, linked, oversized or malformed evidence.
    pub fn read_bounded(&self, name: &str, limit: usize) -> io::Result<Vec<u8>> {
        if limit > 32_000_000 { return Err(unsafe_io()); }
        leaf(name)?; self.check()?;
        let mut file = platform::read_file(&self.inner, name)?;
        let identity = platform::regular_identity(&file)?;
        let before = file.metadata()?;
        if before.len() > limit as u64 { return Err(unsafe_io()); }
        let mut bytes = Vec::with_capacity(before.len() as usize);
        std::io::Read::by_ref(&mut file).take(limit as u64 + 1).read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        if bytes.len() as u64 != before.len() || after.len() != before.len() || after.modified()? != before.modified()? ||
            platform::regular_identity(&file)? != identity ||
            platform::regular_identity(&platform::read_file(&self.inner, name)?)? != identity { return Err(unsafe_io()); }
        self.check()?; Ok(bytes)
    }
    /// Diagnostic-only inventory. Unlike export evidence, an append-only log
    /// may grow during collection. The caller receives a bounded tail and
    /// must label truncation/growth; this never validates an export or journal.
    pub(crate) fn diagnostic_names(&self) -> io::Result<Vec<String>> {
        self.check()?;
        let names = platform::list_names(&self.inner, 128)?;
        self.check()?; Ok(names)
    }
    pub(crate) fn diagnostic_modified(&self, name: &str) -> io::Result<u128> {
        leaf(name)?; self.check()?;
        let file = platform::read_diagnostic_file(&self.inner, name)?;
        platform::regular_identity(&file)?;
        let stamp = file.metadata()?.modified()?.duration_since(std::time::UNIX_EPOCH).map_err(|_| unsafe_io())?.as_millis();
        self.check()?; Ok(stamp)
    }
    pub(crate) fn diagnostic_snapshot(&self, name: &str, limit: usize) -> io::Result<(Vec<u8>, bool, bool)> {
        if limit > 256 * 1024 { return Err(unsafe_io()); }
        leaf(name)?; self.check()?;
        let mut file = platform::read_diagnostic_file(&self.inner, name)?;
        let identity = platform::regular_identity(&file)?;
        let before = file.metadata()?.len();
        let length = before.min(limit as u64);
        file.seek(SeekFrom::Start(before - length))?;
        let mut bytes = vec![0; length as usize];
        file.read_exact(&mut bytes)?;
        let after = file.metadata()?.len();
        if after < before || platform::regular_identity(&file)? != identity ||
            platform::regular_identity(&platform::read_diagnostic_file(&self.inner, name)?)? != identity {
            return Err(unsafe_io());
        }
        self.check()?; Ok((bytes, before > length, after > before))
    }
    pub fn sync(&self) -> io::Result<()> { self.check()?; platform::sync_directory(&self.inner)?; self.check() }
    /// Cross-process cooperative serialization for the controlled native
    /// journal. The OS releases ownership on process exit; never unlink it.
    pub fn lock_control(&self) -> io::Result<ControlLock> {
        self.check()?;
        let lock = platform::lock_control(&self.inner)?;
        platform::regular_identity(&lock.file)?; self.check()?; Ok(lock)
    }
    /// Fully prepare a bounded private journal record before exposing its
    /// final name. A crash leaves only an unowned temporary file, never a torn
    /// final record. Existing final names are not replaced. No temp cleanup.
    pub fn write_record_atomic(&self, name: &str, bytes: &[u8]) -> io::Result<()> {
        self.write_record_checkpoints(name, bytes, |_| Ok(()))
    }
    #[cfg(test)]
    pub fn write_record_fault(&self, name: &str, bytes: &[u8], cut: &str) -> io::Result<()> {
        self.write_record_checkpoints(name, bytes, |phase| if phase == cut { Err(io::Error::other("INJECTED_RECORD_FAILURE")) } else { Ok(()) })
    }
    #[cfg(test)]
    pub fn write_record_test_checkpoint(&self, name: &str, bytes: &[u8], checkpoint: impl FnMut(&str) -> io::Result<()>) -> io::Result<()> {
        self.write_record_checkpoints(name, bytes, checkpoint)
    }
    fn write_record_checkpoints(&self, name: &str, bytes: &[u8], mut checkpoint: impl FnMut(&str) -> io::Result<()>) -> io::Result<()> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        leaf(name)?; self.check()?;
        if bytes.len() > 128 * 1024 { return Err(unsafe_io()); }
        // Bound abandoned private preparations; never traverse/delete them.
        platform::list_names(&self.inner, 2048)?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| unsafe_io())?.as_nanos();
        let temp = format!("pending-{}-{stamp}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed));
        let mut file = platform::create_record(&self.inner, &temp)?;
        let identity = platform::regular_identity(&file)?;
        if file.metadata()?.len() != 0 { return Err(unsafe_io()); }
        checkpoint("created")?;
        let middle = bytes.len() / 2;
        file.write_all(&bytes[..middle])?; checkpoint("partial")?;
        file.write_all(&bytes[middle..])?; file.sync_all()?;
        let mut verified = Vec::with_capacity(bytes.len());
        file.seek(SeekFrom::Start(0))?;
        std::io::Read::by_ref(&mut file).take(bytes.len() as u64 + 1).read_to_end(&mut verified)?;
        if verified != bytes || platform::regular_identity(&file)? != identity { return Err(unsafe_io()); }
        checkpoint("synced")?; self.check()?;
        platform::rename_record(&self.inner, &temp, &file, name)?;
        checkpoint("renamed")?;
        self.sync()
    }
    /// Only the controlled private staging parent may use this owning reopen.
    /// Unlike a public recovery capability it can be renamed for publication.
    pub fn reopen_private_stage(&self, name: &str, expected: Identity) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let inner = platform::open_stage_child(&self.inner, name)?;
        if platform::directory_identity(&inner)? != expected { return Err(unsafe_io()); }
        self.inspect_child(name, expected)?;
        Ok(Self { inner, identity: expected })
    }
    fn check(&self) -> io::Result<()> {
        if platform::directory_identity(&self.inner)? != self.identity { return Err(unsafe_io()); }
        Ok(())
    }
    /// Only use beneath an already controlled private parent. In particular,
    /// this is not a mkdir/open ownership claim in a user-writable target.
    pub fn create_private_child(&self, name: &str) -> io::Result<Self> {
        leaf(name)?; self.check()?;
        let inner = platform::create_directory(&self.inner, name)?;
        let identity = platform::directory_identity(&inner)?;
        self.check()?;
        Ok(Self { inner, identity })
    }
    /// Short-lived identity inspection, not a new owning/writable capability.
    /// On Windows it must share DELETE with the still-held stage owner; it
    /// cannot independently pin the child's pathname after that owner drops.
    pub fn inspect_child(&self, name: &str, expected: Identity) -> io::Result<Identity> {
        leaf(name)?; self.check()?;
        let inner = platform::open_child(&self.inner, name)?;
        let identity = platform::directory_identity(&inner)?;
        if identity != expected { return Err(unsafe_io()); }
        self.check()?;
        Ok(identity)
    }
    /// Negative evidence only, through the held parent capability. A present
    /// non-directory, link, or inaccessible child is never treated as absent.
    pub(crate) fn child_absent(&self, name: &str) -> io::Result<bool> {
        leaf(name)?; self.check()?;
        let result = match platform::open_child(&self.inner, name) {
            Ok(_) => false,
            Err(e) if e.kind() == io::ErrorKind::NotFound => true,
            Err(e) => return Err(e),
        };
        self.check()?; Ok(result)
    }
    /// Recovery opens only the already-known child object. It does not adopt a
    /// same-looking pathname or grant permission to overwrite its contents.
    pub fn open_known_child(&self, name: &str, expected: Identity) -> io::Result<RecoveredDirectory<'_>> {
        leaf(name)?; self.check()?;
        let inner = platform::open_recovery_child(&self.inner, name)?;
        if platform::directory_identity(&inner)? != expected { return Err(unsafe_io()); }
        self.check()?;
        Ok(RecoveredDirectory { parent: self, name: name.to_string(), directory: Self { inner, identity: expected } })
    }
    /// Inventory names and bodies are both resolved through this held parent,
    /// never a reconstructed absolute path. Reject every extra/missing entry,
    /// link, changed identity/length and digest mismatch. This is not an ACL or
    /// snapshot guarantee against a writer already authorized to this object.
    pub fn verify_inventory(&self, expected: &[ExpectedFile]) -> io::Result<()> {
        if expected.is_empty() || expected.len() > 200 { return Err(unsafe_io()); }
        let mut names = Vec::with_capacity(expected.len());
        let mut total = 0u64;
        for item in expected {
            leaf(&item.name)?;
            if item.bytes > 32_000_000 { return Err(unsafe_io()); }
            total = total.checked_add(item.bytes).ok_or_else(unsafe_io)?;
            if total > 500 * 1024 * 1024 { return Err(unsafe_io()); }
            names.push(item.name.clone());
        }
        names.sort();
        if names.windows(2).any(|pair| pair[0] == pair[1]) { return Err(unsafe_io()); }
        self.check()?;
        if platform::list_names(&self.inner, expected.len())? != names { return Err(unsafe_io()); }
        for item in expected {
            let mut file = platform::read_file(&self.inner, &item.name)?;
            let identity = platform::regular_identity(&file)?;
            let before = file.metadata()?;
            if before.len() != item.bytes { return Err(unsafe_io()); }
            let mut digest = Sha256::new();
            let mut remaining = item.bytes;
            let mut buffer = [0u8; 65536];
            while remaining > 0 {
                let bound = remaining.min(buffer.len() as u64) as usize;
                let length = file.read(&mut buffer[..bound])?;
                if length == 0 { return Err(unsafe_io()); }
                digest.update(&buffer[..length]); remaining -= length as u64;
            }
            if file.read(&mut buffer[..1])? != 0 || platform::regular_identity(&file)? != identity {
                return Err(unsafe_io());
            }
            let after = file.metadata()?;
            if after.len() != before.len() || after.modified()? != before.modified()? ||
                <[u8; 32]>::from(digest.finalize()) != item.sha256 { return Err(unsafe_io()); }
            // A rename/replacement while reading cannot validate the object
            // subsequently named in the export directory.
            let named = platform::read_file(&self.inner, &item.name)?;
            if platform::regular_identity(&named)? != identity { return Err(unsafe_io()); }
        }
        if platform::list_names(&self.inner, expected.len())? != names { return Err(unsafe_io()); }
        self.check()
    }
    pub fn write_new(&self, name: &str, bytes: &[u8]) -> io::Result<()> {
        leaf(name)?; self.check()?;
        let mut file = platform::create_file(&self.inner, name)?;
        let identity = platform::regular_identity(&file)?;
        if file.metadata()?.len() != 0 { return Err(unsafe_io()); }
        file.write_all(bytes)?; file.sync_all()?;
        if platform::regular_identity(&file)? != identity || file.metadata()?.len() != bytes.len() as u64 {
            return Err(unsafe_io());
        }
        self.check()
    }
}

/// Publish the already-complete private child without replacing any existing
/// destination. Never fall back to copy, ordinary rename, removal or overwrite.
/// Failure after the OS rename is an UNCERTAIN publication, not proof of no I/O:
/// the future broker must reconcile its durable intent and known stage identity.
#[derive(Debug)]
pub(crate) enum PublicationError { NotPublished(io::Error), Uncertain(io::Error) }
pub(crate) fn publish(source_parent: &Directory, source_name: &str, source: &Directory,
    target_parent: &Directory, target_name: &str, operation: &crate::ipc_transport::NativeGuard) -> Result<(), PublicationError> {
    publish_with_postcheck(source_parent, source_name, source, target_parent, target_name, operation, || Ok(()))
}
fn publish_with_postcheck(source_parent: &Directory, source_name: &str, source: &Directory,
    target_parent: &Directory, target_name: &str, operation: &crate::ipc_transport::NativeGuard,
    after_rename: impl FnOnce() -> io::Result<()>) -> Result<(), PublicationError> {
    use PublicationError::{NotPublished, Uncertain};
    leaf(source_name).map_err(NotPublished)?; leaf(target_name).map_err(NotPublished)?;
    source_parent.check().map_err(NotPublished)?; source.check().map_err(NotPublished)?; target_parent.check().map_err(NotPublished)?;
    source_parent.inspect_child(source_name, source.identity).map_err(NotPublished)?;
    platform::sync_directory(&source.inner).map_err(NotPublished)?;
    #[cfg(test)] operation.test_event("before_rename");
    operation.checkpoint().map_err(|code| NotPublished(io::Error::new(io::ErrorKind::Interrupted, code)))?;
    // An OS/filesystem error after attempting publication is conservative:
    // no caller may turn a missing acknowledgement into an automatic retry.
    // Do not check cancellation after Rename and pretend it did not happen:
    // keep the native guard until identity checks/reconciliation have finished.
    platform::rename_exclusive(&source_parent.inner, source_name, &source.inner, &target_parent.inner, target_name).map_err(Uncertain)?;
    #[cfg(test)] operation.test_event("after_rename");
    after_rename().map_err(Uncertain)?;
    source_parent.check().map_err(Uncertain)?; source.check().map_err(Uncertain)?; target_parent.check().map_err(Uncertain)?;
    // Reopening by the destination parent can only verify the known source
    // object. A different, same-looking folder is never adopted as our output.
    target_parent.inspect_child(target_name, source.identity).map_err(Uncertain)?;
    platform::sync_directory(&source_parent.inner).map_err(Uncertain)?;
    platform::sync_directory(&target_parent.inner).map_err(Uncertain)
}

#[cfg(unix)]
mod platform {
    use super::*;
    use std::{ffi::{CStr, CString}, os::unix::{ffi::OsStrExt, fs::MetadataExt, io::{AsRawFd, FromRawFd, IntoRawFd}}, path::{Component, PathBuf}};
    #[cfg(target_os = "macos")] type Mode = u16;
    #[cfg(not(target_os = "macos"))] type Mode = u32;
    extern "C" {
        fn openat(fd: i32, name: *const i8, flags: i32, ...) -> i32;
        fn mkdirat(fd: i32, name: *const i8, mode: Mode) -> i32;
    }
    #[cfg(target_os = "macos")]
    extern "C" { fn renameatx_np(old_fd: i32, old: *const i8, new_fd: i32, new: *const i8, flags: u32) -> i32; }
    #[cfg(target_os = "linux")]
    extern "C" { fn renameat2(old_fd: i32, old: *const i8, new_fd: i32, new: *const i8, flags: u32) -> i32; }
    #[cfg(target_os = "macos")] const DIR_FLAGS: i32 = 0x0010_0000 | 0x100 | 0x0100_0000;
    #[cfg(not(target_os = "macos"))] const DIR_FLAGS: i32 = 0x1_0000 | 0x2_0000 | 0x8_0000;
    #[cfg(target_os = "macos")] const NEW_FILE: i32 = 1 | 0x200 | 0x800 | 0x100 | 0x0100_0000;
    #[cfg(not(target_os = "macos"))] const NEW_FILE: i32 = 1 | 0x40 | 0x80 | 0x2_0000 | 0x8_0000;
    pub struct Directory { file: File }
    fn cstr(name: &std::ffi::OsStr) -> io::Result<CString> { CString::new(name.as_bytes()).map_err(|_| unsafe_io()) }
    fn opened(fd: i32) -> io::Result<File> {
        if fd < 0 { Err(io::Error::last_os_error()) } else { Ok(unsafe { File::from_raw_fd(fd) }) }
    }
    fn from_file(file: File) -> io::Result<Directory> {
        if !file.metadata()?.is_dir() { return Err(unsafe_io()); }
        Ok(Directory { file })
    }
    pub fn open_directory(path: &Path) -> io::Result<Directory> {
        #[cfg(target_os = "macos")]
        let normalized = ["/var", "/tmp", "/etc"].into_iter().find_map(|alias|
            path.strip_prefix(alias).ok().map(|rest| PathBuf::from(format!("/private{alias}")).join(rest)))
            .unwrap_or_else(|| PathBuf::from(path));
        #[cfg(not(target_os = "macos"))]
        let normalized = PathBuf::from(path);
        if !normalized.is_absolute() { return Err(unsafe_io()); }
        let mut file = File::open("/")?;
        for component in normalized.components() {
            let Component::Normal(name) = component else {
                if matches!(component, Component::RootDir) { continue; }
                return Err(unsafe_io());
            };
            let name = cstr(name)?;
            file = opened(unsafe { openat(file.as_raw_fd(), name.as_ptr(), DIR_FLAGS) })?;
            if !file.metadata()?.is_dir() { return Err(unsafe_io()); }
        }
        from_file(file)
    }
    pub fn directory_identity(directory: &Directory) -> io::Result<Identity> {
        let metadata = directory.file.metadata()?;
        if !metadata.is_dir() { return Err(unsafe_io()); }
        identity(&metadata, metadata.dev(), metadata.ino() as u128)
    }
    pub fn open_child(parent: &Directory, name: &str) -> io::Result<Directory> {
        let name = cstr(std::ffi::OsStr::new(name))?;
        from_file(opened(unsafe { openat(parent.file.as_raw_fd(), name.as_ptr(), DIR_FLAGS) })?)
    }
    pub fn open_recovery_child(parent: &Directory, name: &str) -> io::Result<Directory> { open_child(parent, name) }
    pub fn open_stage_child(parent: &Directory, name: &str) -> io::Result<Directory> { open_child(parent, name) }
    pub fn create_directory(parent: &Directory, name: &str) -> io::Result<Directory> {
        let text = cstr(std::ffi::OsStr::new(name))?;
        // Caller owns the private parent. mkdirat/openat is deliberately not
        // offered for obtaining ownership of a public destination directory.
        if unsafe { mkdirat(parent.file.as_raw_fd(), text.as_ptr(), 0o700) } != 0 { return Err(io::Error::last_os_error()); }
        open_child(parent, name)
    }
    pub fn verify_private(directory: &Directory) -> io::Result<()> {
        crate::export_private_security::verify_private(&directory.file)
    }
    pub fn create_controlled_directory(parent: &Directory, name: &str) -> io::Result<Directory> {
        // Other accounts must not be able to exchange mkdirat's name before
        // openat. No inherited ACL is silently cleared, on parent or child.
        crate::export_private_security::verify_namespace_parent(&parent.file)?;
        let child = create_directory(parent, name)?;
        verify_private(&child)?;
        Ok(child)
    }
    pub fn create_file(parent: &Directory, name: &str) -> io::Result<File> {
        let name = cstr(std::ffi::OsStr::new(name))?;
        opened(unsafe { openat(parent.file.as_raw_fd(), name.as_ptr(), NEW_FILE, 0o600u32) })
    }
    pub fn create_record(parent: &Directory, name: &str) -> io::Result<File> {
        let name = cstr(std::ffi::OsStr::new(name))?;
        opened(unsafe { libc::openat(parent.file.as_raw_fd(), name.as_ptr(),
            libc::O_RDWR | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK, 0o600u32) })
    }
    pub fn read_file(parent: &Directory, name: &str) -> io::Result<File> {
        let name = cstr(std::ffi::OsStr::new(name))?;
        opened(unsafe { libc::openat(parent.file.as_raw_fd(), name.as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK) })
    }
    pub fn read_diagnostic_file(parent: &Directory, name: &str) -> io::Result<File> { read_file(parent, name) }
    pub fn lock_control(parent: &Directory) -> io::Result<ControlLock> {
        let name = c"export-control.lock";
        let file = opened(unsafe { libc::openat(parent.file.as_raw_fd(), name.as_ptr(),
            libc::O_RDWR | libc::O_CREAT | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK, 0o600u32) })?;
        let identity = regular_identity(&file)?;
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 { return Err(io::Error::last_os_error()); }
        let lock = ControlLock { file }; // Own unlock before any further fallible check.
        if regular_identity(&read_file(parent, "export-control.lock")?)? != identity { return Err(unsafe_io()); }
        Ok(lock)
    }
    pub fn list_names(parent: &Directory, limit: usize) -> io::Result<Vec<String>> {
        // A new open description prevents directory-cursor interference.
        let fd = opened(unsafe { openat(parent.file.as_raw_fd(), c".".as_ptr(), DIR_FLAGS) })?.into_raw_fd();
        let stream = unsafe { libc::fdopendir(fd) };
        if stream.is_null() {
            let error = io::Error::last_os_error();
            unsafe { libc::close(fd); }
            return Err(error);
        }
        struct Stream(*mut libc::DIR);
        impl Drop for Stream { fn drop(&mut self) { unsafe { libc::closedir(self.0); } } }
        let stream = Stream(stream);
        let mut names = Vec::new();
        loop {
            #[cfg(target_os = "macos")]
            unsafe { *libc::__error() = 0; }
            #[cfg(target_os = "linux")]
            unsafe { *libc::__errno_location() = 0; }
            let entry = unsafe { libc::readdir(stream.0) };
            if entry.is_null() {
                let error = io::Error::last_os_error();
                if error.raw_os_error().unwrap_or(0) != 0 { return Err(error); }
                break;
            }
            let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_str().map_err(|_| unsafe_io())?;
            if matches!(name, "." | "..") { continue; }
            leaf(name)?;
            if names.len() == limit { return Err(unsafe_io()); }
            names.push(name.to_string());
        }
        names.sort();
        if names.windows(2).any(|pair| pair[0] == pair[1]) { return Err(unsafe_io()); }
        Ok(names)
    }
    pub fn regular_identity(file: &File) -> io::Result<Identity> {
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.nlink() != 1 { return Err(unsafe_io()); }
        identity(&metadata, metadata.dev(), metadata.ino() as u128)
    }
    pub fn rename_exclusive(old: &Directory, old_name: &str, _source: &Directory, new: &Directory, new_name: &str) -> io::Result<()> {
        let old_name = cstr(std::ffi::OsStr::new(old_name))?;
        let new_name = cstr(std::ffi::OsStr::new(new_name))?;
        #[cfg(target_os = "macos")]
        let result = unsafe { renameatx_np(old.file.as_raw_fd(), old_name.as_ptr(), new.file.as_raw_fd(), new_name.as_ptr(), 4) }; // RENAME_EXCL
        #[cfg(target_os = "linux")]
        let result = unsafe { renameat2(old.file.as_raw_fd(), old_name.as_ptr(), new.file.as_raw_fd(), new_name.as_ptr(), 1) }; // RENAME_NOREPLACE
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        return Err(io::Error::new(io::ErrorKind::Unsupported, "EXPORT_PUBLICATION_UNSUPPORTED"));
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        if result != 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
    }
    pub fn sync_directory(directory: &Directory) -> io::Result<()> { directory.file.sync_all() }
    pub fn rename_record(parent: &Directory, old: &str, file: &File, new: &str) -> io::Result<()> {
        if regular_identity(file)? != regular_identity(&read_file(parent, old)?)? { return Err(unsafe_io()); }
        rename_exclusive(parent, old, parent, parent, new)?;
        if regular_identity(file)? != regular_identity(&read_file(parent, new)?)? { return Err(unsafe_io()); }
        Ok(())
    }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{ffi::c_void, fs::OpenOptions, os::windows::{ffi::OsStrExt, fs::{MetadataExt, OpenOptionsExt}, io::{AsRawHandle, FromRawHandle}}, path::{Component, PathBuf, Prefix}};
    type Handle = *mut c_void;
    #[repr(C)] struct UnicodeString { length: u16, maximum_length: u16, buffer: *mut u16 }
    #[repr(C)] struct ObjectAttributes { length: u32, root: Handle, name: *mut UnicodeString, attributes: u32, security: Handle, quality: Handle }
    #[repr(C)] struct IoStatus { status: usize, information: usize }
    #[repr(C)] struct FileId { volume: u64, id: [u8; 16] }
    #[repr(C)] struct FileInfo { attributes: u32, times: [u32; 6], volume: u32, size: [u32; 2], links: u32, index: [u32; 2] }
    #[repr(C)] struct RenameInfo { replace: u32, root: Handle, name_bytes: u32, name: [u16; 1] }
    #[link(name = "ntdll")]
    extern "system" {
        fn NtCreateFile(file: *mut Handle, access: u32, attributes: *mut ObjectAttributes,
            status: *mut IoStatus, allocation: *const i64, file_attributes: u32, sharing: u32,
            disposition: u32, options: u32, ea: Handle, ea_length: u32) -> i32;
        fn RtlNtStatusToDosError(status: i32) -> u32;
        fn NtSetInformationFile(file: Handle, status: *mut IoStatus, info: Handle, bytes: u32, class: u32) -> i32;
        fn NtQueryDirectoryFile(file: Handle, event: Handle, apc: Handle, context: Handle,
            status: *mut IoStatus, info: Handle, bytes: u32, class: u32,
            single: u8, name: *mut UnicodeString, restart: u8) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(file: Handle, info: *mut FileInfo) -> i32;
        fn GetFileInformationByHandleEx(file: Handle, class: u32, info: Handle, bytes: u32) -> i32;
    }
    pub struct Directory { file: File, _parents: Vec<File> }
    fn plain_directory(file: &File) -> io::Result<()> {
        let metadata = file.metadata()?;
        if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 { return Err(unsafe_io()); }
        Ok(())
    }
    fn relative(parent: &File, name: &std::ffi::OsStr, directory: bool, create: bool, inspect_held: bool) -> io::Result<File> {
        relative_owned(parent, name, directory, create, inspect_held, false)
    }
    fn relative_owned(parent: &File, name: &std::ffi::OsStr, directory: bool, create: bool, inspect_held: bool, stage_owner: bool) -> io::Result<File> {
        relative_policy(parent, name, directory, create, inspect_held, stage_owner, false)
    }
    fn relative_policy(parent: &File, name: &std::ffi::OsStr, directory: bool, create: bool, inspect_held: bool, stage_owner: bool, control: bool) -> io::Result<File> {
        relative_security(parent, name, directory, create, inspect_held, stage_owner, control, std::ptr::null_mut())
    }
    #[allow(clippy::too_many_arguments)]
    fn relative_security(parent: &File, name: &std::ffi::OsStr, directory: bool, create: bool, inspect_held: bool, stage_owner: bool, control: bool, security: Handle) -> io::Result<File> {
        let mut wide: Vec<u16> = name.encode_wide().collect();
        if wide.is_empty() || wide.len() > 255 || wide.iter().any(|c| [0, 47, 58, 92].contains(c)) { return Err(unsafe_io()); }
        let mut text = UnicodeString { length: (wide.len() * 2) as u16, maximum_length: (wide.len() * 2) as u16, buffer: wide.as_mut_ptr() };
        let mut attributes = ObjectAttributes { length: std::mem::size_of::<ObjectAttributes>() as u32,
            root: parent.as_raw_handle(), name: &mut text, attributes: 0x40 | 0x1000,
            security, quality: std::ptr::null_mut() };
        let mut status = IoStatus { status: 0, information: 0 };
        let mut handle: Handle = std::ptr::null_mut();
        // FILE_OPEN (1) never creates; FILE_CREATE (2) never adopts an existing
        // directory/file. Owning/traversal directory handles deny deletion.
        // A read-only inspection handle shares deletion so it can inspect our
        // already-held DELETE-capable stage without invalidating that owner.
        let access = 0x0010_0080 | if directory { 0x20000 | 1 | if create || stage_owner { 0x10000 } else { 0 } }
            else if stage_owner { 3 | 0x10000 } else if control { 3 } else if create { 2 } else { 1 };
        let result = unsafe { NtCreateFile(&mut handle, access, &mut attributes, &mut status,
            std::ptr::null(), 0x80, if control { 0 } else if inspect_held { 7 } else if directory { 3 } else { 1 }, if control { 3 } else if create { 2 } else { 1 },
            0x20 | 0x0020_0000 | if directory { 1 } else { 0x40 }, std::ptr::null_mut(), 0) };
        if result < 0 {
            let mapped_os_error = unsafe { RtlNtStatusToDosError(result) };
            return Err(failed_relative_create(RelativeCreateFailure {
                directory, create, has_security: !security.is_null(),
                nt_status: result, mapped_os_error, information: status.information,
            }, crate::diagnostic_native_controlled_directory_create_failure));
        }
        if handle.is_null() { return Err(unsafe_io()); }
        Ok(unsafe { File::from_raw_handle(handle) })
    }
    pub fn open_directory(path: &Path) -> io::Result<Directory> {
        let mut components = path.components();
        let prefix = match components.next() { Some(Component::Prefix(p)) => match p.kind() {
            Prefix::Disk(disk) | Prefix::VerbatimDisk(disk) => disk, _ => return Err(unsafe_io()) }, _ => return Err(unsafe_io()) };
        if !matches!(components.next(), Some(Component::RootDir)) { return Err(unsafe_io()); }
        let root = PathBuf::from(format!("{}:\\", prefix as char));
        let mut file = OpenOptions::new().read(true).share_mode(3).custom_flags(0x0200_0000 | 0x0020_0000).open(root)?;
        plain_directory(&file)?;
        let mut parents = Vec::new();
        for component in components {
            let Component::Normal(name) = component else { return Err(unsafe_io()) };
            let child = relative(&file, name, true, false, false)?;
            plain_directory(&child)?; parents.push(file); file = child;
        }
        Ok(Directory { file, _parents: parents })
    }
    fn identity(file: &File) -> io::Result<Identity> {
        let mut id = FileId { volume: 0, id: [0; 16] };
        if unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), 18, (&mut id as *mut FileId).cast(), std::mem::size_of::<FileId>() as u32) } == 0 {
            return Err(io::Error::last_os_error());
        }
        super::identity(&file.metadata()?, id.volume, u128::from_le_bytes(id.id))
    }
    pub fn directory_identity(directory: &Directory) -> io::Result<Identity> { plain_directory(&directory.file)?; identity(&directory.file) }
    pub fn open_child(parent: &Directory, name: &str) -> io::Result<Directory> {
        let file = relative(&parent.file, std::ffi::OsStr::new(name), true, false, true)?;
        plain_directory(&file)?;
        // Inspection shares DELETE with the held stage owner. This handle does
        // NOT independently prevent rename; the wrapper returns identity only.
        Ok(Directory { file, _parents: Vec::new() })
    }
    pub fn open_recovery_child(parent: &Directory, name: &str) -> io::Result<Directory> {
        // Recovery follows the owner's exit, never a still-held DELETE stage.
        // Deny DELETE sharing so a successful reopen pins this exact name.
        let file = relative(&parent.file, std::ffi::OsStr::new(name), true, false, false)?;
        plain_directory(&file)?;
        Ok(Directory { file, _parents: Vec::new() })
    }
    pub fn open_stage_child(parent: &Directory, name: &str) -> io::Result<Directory> {
        let file = relative_owned(&parent.file, std::ffi::OsStr::new(name), true, false, false, true)?;
        plain_directory(&file)?;
        Ok(Directory { file, _parents: Vec::new() })
    }
    pub fn create_directory(parent: &Directory, name: &str) -> io::Result<Directory> {
        let file = relative(&parent.file, std::ffi::OsStr::new(name), true, true, false)?;
        plain_directory(&file)?;
        Ok(Directory { file, _parents: Vec::new() })
    }
    pub fn verify_private(directory: &Directory) -> io::Result<()> {
        plain_directory(&directory.file)?;
        crate::export_private_security::verify_private(&directory.file)
    }
    pub fn create_controlled_directory(parent: &Directory, name: &str) -> io::Result<Directory> {
        // The descriptor is supplied to the exclusive NtCreateFile itself.
        // There is no mkdir/stat/set-ACL window and no inherited broad ACE.
        let descriptor = crate::export_private_security::private_descriptor()?;
        let file = relative_security(&parent.file, std::ffi::OsStr::new(name), true, true, false, false, false, descriptor.as_ptr())?;
        let directory = Directory { file, _parents: Vec::new() };
        verify_private(&directory)?;
        Ok(directory)
    }
    pub fn create_file(parent: &Directory, name: &str) -> io::Result<File> { relative(&parent.file, std::ffi::OsStr::new(name), false, true, false) }
    pub fn create_record(parent: &Directory, name: &str) -> io::Result<File> { relative_owned(&parent.file, std::ffi::OsStr::new(name), false, true, false, true) }
    pub fn read_file(parent: &Directory, name: &str) -> io::Result<File> { relative(&parent.file, std::ffi::OsStr::new(name), false, false, false) }
    pub fn read_diagnostic_file(parent: &Directory, name: &str) -> io::Result<File> {
        // Only diagnostics share WRITE with the live append sink. Do not
        // weaken the immutable export/journal readers above.
        let mut wide: Vec<u16> = std::ffi::OsStr::new(name).encode_wide().collect();
        if wide.is_empty() || wide.len() > 255 || wide.iter().any(|c| [0, 47, 58, 92].contains(c)) { return Err(unsafe_io()); }
        let mut text = UnicodeString { length: (wide.len() * 2) as u16, maximum_length: (wide.len() * 2) as u16, buffer: wide.as_mut_ptr() };
        let mut attributes = ObjectAttributes { length: std::mem::size_of::<ObjectAttributes>() as u32,
            root: parent.file.as_raw_handle(), name: &mut text, attributes: 0x40 | 0x1000,
            security: std::ptr::null_mut(), quality: std::ptr::null_mut() };
        let mut status = IoStatus { status: 0, information: 0 };
        let mut handle: Handle = std::ptr::null_mut();
        let result = unsafe { NtCreateFile(&mut handle, 0x0010_0081, &mut attributes, &mut status,
            std::ptr::null(), 0x80, 3, 1, 0x20 | 0x0020_0000 | 0x40, std::ptr::null_mut(), 0) };
        if result < 0 { return Err(io::Error::from_raw_os_error(unsafe { RtlNtStatusToDosError(result) } as i32)); }
        if handle.is_null() { return Err(unsafe_io()); }
        Ok(unsafe { File::from_raw_handle(handle) })
    }
    pub fn lock_control(parent: &Directory) -> io::Result<ControlLock> {
        Ok(ControlLock { file: relative_policy(&parent.file, std::ffi::OsStr::new("export-control.lock"), false, false, false, false, true)? })
    }
    fn parse_names(buffer: &[u8], names: &mut Vec<String>, limit: usize) -> io::Result<()> {
        let mut offset = 0;
        loop {
            let header = buffer.get(offset..offset + 12).ok_or_else(unsafe_io)?;
            let next = u32::from_le_bytes(header[..4].try_into().map_err(|_| unsafe_io())?) as usize;
            let length = u32::from_le_bytes(header[8..12].try_into().map_err(|_| unsafe_io())?) as usize;
            if length == 0 || length > 510 || !length.is_multiple_of(2) { return Err(unsafe_io()); }
            let text = buffer.get(offset + 12..offset + 12 + length).ok_or_else(unsafe_io)?;
            let wide: Vec<u16> = text.as_chunks::<2>().0.iter().map(|pair| u16::from_le_bytes([pair[0], pair[1]])).collect();
            let name = String::from_utf16(&wide).map_err(|_| unsafe_io())?;
            if !matches!(name.as_str(), "." | "..") {
                leaf(&name)?;
                if names.len() == limit || names.contains(&name) { return Err(unsafe_io()); }
                names.push(name);
            }
            if next == 0 { return Ok(()); }
            if next < 12 + length || !next.is_multiple_of(4) || offset + next >= buffer.len() { return Err(unsafe_io()); }
            offset += next;
        }
    }
    pub fn list_names(parent: &Directory, limit: usize) -> io::Result<Vec<String>> {
        // FileNamesInformation needs LONG alignment, not a pathname FindFirst.
        let mut buffer = vec![0u32; 4096];
        let mut names = Vec::new();
        let mut restart = true;
        loop {
            let mut status = IoStatus { status: 0, information: 0 };
            let result = unsafe { NtQueryDirectoryFile(parent.file.as_raw_handle(), std::ptr::null_mut(),
                std::ptr::null_mut(), std::ptr::null_mut(), &mut status, buffer.as_mut_ptr().cast(),
                (buffer.len() * 4) as u32, 12, 0, std::ptr::null_mut(), u8::from(restart)) };
            restart = false;
            if result as u32 == 0x8000_0006 { break; } // STATUS_NO_MORE_FILES
            if result != 0 { return Err(io::Error::from_raw_os_error(unsafe { RtlNtStatusToDosError(result) } as i32)); }
            if status.information < 12 || status.information > buffer.len() * 4 { return Err(unsafe_io()); }
            let bytes = unsafe { std::slice::from_raw_parts(buffer.as_ptr().cast::<u8>(), status.information) };
            parse_names(bytes, &mut names, limit)?;
        }
        names.sort(); Ok(names)
    }
    pub fn regular_identity(file: &File) -> io::Result<Identity> {
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 { return Err(unsafe_io()); }
        let mut info = FileInfo { attributes: 0, times: [0; 6], volume: 0, size: [0; 2], links: 0, index: [0; 2] };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 || info.links != 1 { return Err(unsafe_io()); }
        identity(file)
    }
    pub fn rename_exclusive(_old: &Directory, _old_name: &str, source: &Directory, new: &Directory, new_name: &str) -> io::Result<()> {
        rename_opened(&source.file, new, new_name)
    }
    pub fn rename_record(parent: &Directory, _old: &str, file: &File, new: &str) -> io::Result<()> { rename_opened(file, parent, new) }
    fn rename_opened(source: &File, new: &Directory, new_name: &str) -> io::Result<()> {
        let wide: Vec<u16> = std::ffi::OsStr::new(new_name).encode_wide().collect();
        let byte_count = std::mem::size_of::<RenameInfo>() + wide.len() * 2;
        // u64 storage keeps HANDLE aligned on both Windows target widths.
        let mut buffer = vec![0u64; byte_count.div_ceil(8)];
        let info = buffer.as_mut_ptr().cast::<RenameInfo>();
        unsafe {
            (*info).replace = 0; // ReplaceIfExists = FALSE / no replace flags.
            (*info).root = new.file.as_raw_handle();
            (*info).name_bytes = (wide.len() * 2) as u32;
            std::ptr::copy_nonoverlapping(wide.as_ptr(), std::ptr::addr_of_mut!((*info).name).cast::<u16>(), wide.len());
            let mut status = IoStatus { status: 0, information: 0 };
            let result = NtSetInformationFile(source.as_raw_handle(), &mut status, info.cast(), byte_count as u32, 10); // FileRenameInformation
            if result < 0 { return Err(io::Error::from_raw_os_error(RtlNtStatusToDosError(result) as i32)); }
        }
        Ok(())
    }
    // File bodies are flushed before publication. Windows does not support
    // FlushFileBuffers on these directory handles; claim no power-loss proof.
    pub fn sync_directory(_directory: &Directory) -> io::Result<()> { Ok(()) }

    #[cfg(test)]
    mod tests {
        use super::*;
        fn record(name: &str) -> Vec<u8> {
            let text: Vec<u8> = name.encode_utf16().flat_map(u16::to_le_bytes).collect();
            let mut bytes = vec![0u8; 12]; bytes[8..12].copy_from_slice(&(text.len() as u32).to_le_bytes());
            bytes.extend(text); bytes
        }
        #[test]
        fn directory_record_parser_rejects_truncation_bad_offsets_duplicates_and_limit() {
            let good = record("Dokument_01.md");
            let mut names = Vec::new(); parse_names(&good, &mut names, 1).unwrap();
            assert_eq!(names, ["Dokument_01.md"]);
            assert!(parse_names(&good, &mut names, 2).is_err());
            assert!(parse_names(&good, &mut Vec::new(), 0).is_err());
            for length in 0..good.len() { assert!(parse_names(&good[..length], &mut Vec::new(), 1).is_err()); }
            for next in [1u32, 12, 16, u32::MAX] {
                let mut invalid = good.clone(); invalid[..4].copy_from_slice(&next.to_le_bytes());
                assert!(parse_names(&invalid, &mut Vec::new(), 1).is_err());
            }
            assert!(parse_names(&record("../other"), &mut Vec::new(), 1).is_err());
            let mut odd = good; odd[8..12].copy_from_slice(&3u32.to_le_bytes());
            assert!(parse_names(&odd, &mut Vec::new(), 1).is_err());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc_transport::Lifecycle;
    fn publish(source_parent: &Directory, source_name: &str, source: &Directory,
        target_parent: &Directory, target_name: &str) -> Result<(), PublicationError> {
        let operation = Lifecycle::default().begin_native().unwrap();
        super::publish(source_parent, source_name, source, target_parent, target_name, &operation)
    }
    use std::{fs, path::PathBuf, sync::atomic::{AtomicU64, Ordering}};
    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    struct Fixture { path: PathBuf }
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("datasecure-export-capability-{}-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
                FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&path).unwrap();
            Self { path }
        }
        fn directory(&self) -> Directory { Directory::open_existing(&self.path, None).unwrap() }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            // Fresh exclusively created fixture; tests remove their junction
            // separately. Never clean a computed source/result/user directory.
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self.path.file_name().unwrap().to_string_lossy().starts_with("datasecure-export-capability-"));
            fs::remove_dir_all(&self.path).unwrap();
        }
    }
    fn expected(name: &str, bytes: &[u8]) -> ExpectedFile {
        ExpectedFile { name: name.to_string(), bytes: bytes.len() as u64, sha256: Sha256::digest(bytes).into() }
    }
    #[cfg(unix)]
    #[test]
    fn dropped_lock_releases_authority_even_while_a_duplicate_description_survives() {
        let f = Fixture::new(); let parent = f.directory();
        let first = parent.lock_control().unwrap();
        // Deterministic model of the inherited fd between fork and exec.
        let inherited = first.file.try_clone().unwrap();
        assert!(parent.lock_control().is_err());
        drop(first);
        let second = parent.lock_control().unwrap();
        assert!(parent.lock_control().is_err());
        drop(inherited); // Must not release the new, independent description.
        assert!(parent.lock_control().is_err());
        drop(second);
        parent.lock_control().unwrap();
    }
    #[test]
    fn native_private_parent_creation_and_identity_bound_reopen_are_verified() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_controlled_child("private-native").unwrap();
        let identity = private.identity();
        private.write_record_atomic("test.json", b"{\"synthetic\":true}").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"synthetic approved text").unwrap();
        drop(stage); drop(private);
        let recovered = parent.open_controlled_child("private-native", identity).unwrap();
        assert_eq!(recovered.read_bounded("test.json", 64).unwrap(), b"{\"synthetic\":true}");
        assert!(parent.create_controlled_child("private-native").is_err());
        let mut wrong = identity; wrong.object ^= 1;
        assert!(parent.open_controlled_child("private-native", wrong).is_err());
    }
    #[test]
    fn existing_private_parent_with_broadened_permissions_is_refused_not_repaired() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_controlled_child("private-native").unwrap();
        let identity = private.identity(); drop(private);
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(f.path.join("private-native"), fs::Permissions::from_mode(0o755)).unwrap();
        }
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            let file = fs::OpenOptions::new().access_mode(0x0004_0000 | 0x0002_0000)
                .share_mode(7).custom_flags(0x0200_0000 | 0x0020_0000).open(f.path.join("private-native")).unwrap();
            crate::export_private_security::broaden_test_directory(&file).unwrap();
        }
        assert!(parent.open_controlled_child("private-native", identity).is_err());
        assert_eq!(fs::read_dir(f.path.join("private-native")).unwrap().count(), 0);
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(f.path.join("private-native")).unwrap().permissions().mode() & 0o7777, 0o755);
        }
        #[cfg(windows)] {
            let other = platform::open_recovery_child(&parent.inner, "private-native").unwrap();
            assert!(platform::verify_private(&other).is_err(), "do not silently repair a changed ACL");
        }
    }
    #[cfg(unix)]
    #[test]
    fn private_parent_creation_refuses_other_account_writable_namespace() {
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new(); let parent = f.directory();
        fs::set_permissions(&f.path, fs::Permissions::from_mode(0o777)).unwrap();
        assert!(parent.create_controlled_child("private-native").is_err());
        assert!(!f.path.join("private-native").exists());
    }
    #[test]
    fn relative_inventory_checks_every_name_body_size_and_digest_after_reopening() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", "# Geprüft\n[PERSON_001]\n".as_bytes()).unwrap();
        stage.write_new("Dokument_02.md", b"second").unwrap();
        let files = [expected("Dokument_02.md", b"second"), expected("Dokument_01.md", "# Geprüft\n[PERSON_001]\n".as_bytes())];
        stage.verify_inventory(&files).unwrap();
        stage.verify_inventory(&files).unwrap(); // enumeration restarts, no shared cursor assumption
        let identity = stage.identity();
        publish(&private, "stage", &stage, &target, "Export-test").unwrap();
        drop(stage);
        let reopened = target.open_known_child("Export-test", identity).unwrap();
        reopened.verify_inventory(&files).unwrap();
        assert!(reopened.verify_inventory(&files[..1]).is_err());
        assert!(reopened.verify_inventory(&[expected("Dokument_01.md", b"different"), expected("Dokument_02.md", b"second")]).is_err());
        assert!(reopened.verify_inventory(&[expected("Dokument_01.md", "# Geprüft\n[PERSON_001]\n".as_bytes()), expected("Dokument_02.md", b"SECOND")]).is_err());
        assert!(reopened.verify_inventory(&[]).is_err());
        assert!(reopened.verify_inventory(&[expected("Dokument_01.md", b"x"), expected("Dokument_01.md", b"x")]).is_err());
        assert!(reopened.verify_inventory(&[ExpectedFile { name: "Dokument_01.md".into(), bytes: 32_000_001, sha256: [0; 32] }]).is_err());
    }
    #[test]
    fn recovery_never_adopts_a_foreign_same_looking_directory() {
        let f = Fixture::new(); let parent = f.directory();
        let stage = parent.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"same bytes").unwrap();
        let identity = stage.identity(); drop(stage);
        fs::rename(f.path.join("stage"), f.path.join("old-stage")).unwrap();
        fs::create_dir(f.path.join("stage")).unwrap();
        fs::write(f.path.join("stage/Dokument_01.md"), b"same bytes").unwrap();
        assert!(parent.open_known_child("stage", identity).is_err());
        assert!(parent.open_known_child("missing", identity).is_err());
        assert!(parent.open_known_child("../old-stage", identity).is_err());
        parent.open_known_child("old-stage", identity).unwrap().verify_inventory(&[expected("Dokument_01.md", b"same bytes")]).unwrap();
    }
    #[test]
    fn recovery_cannot_confirm_the_original_name_after_it_is_replaced() {
        let f = Fixture::new(); let parent = f.directory();
        let stage = parent.create_private_child("Export-test").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        let identity = stage.identity(); drop(stage);
        let recovered = parent.open_known_child("Export-test", identity).unwrap();
        let moved = fs::rename(f.path.join("Export-test"), f.path.join("Moved"));
        #[cfg(windows)] {
            assert!(moved.is_err(), "recovery handle must deny namespace replacement");
            assert!(!f.path.join("Moved").exists());
            recovered.verify_inventory(&[expected("Dokument_01.md", b"approved")]).unwrap();
        }
        #[cfg(unix)] {
            moved.unwrap();
            fs::create_dir(f.path.join("Export-test")).unwrap();
            fs::write(f.path.join("Export-test/Dokument_01.md"), b"approved").unwrap();
            assert!(recovered.verify_inventory(&[expected("Dokument_01.md", b"approved")]).is_err(),
                "correct old object must not confirm a foreign replacement at the bound name");
        }
    }
    #[test]
    fn inventory_rejects_links_directories_and_hidden_extras_without_traversal() {
        let f = Fixture::new(); let parent = f.directory();
        let stage = parent.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        let files = [expected("Dokument_01.md", b"approved")];
        fs::hard_link(f.path.join("stage/Dokument_01.md"), f.path.join("hardlink")).unwrap();
        assert!(stage.verify_inventory(&files).is_err());
        fs::remove_file(f.path.join("hardlink")).unwrap();
        stage.verify_inventory(&files).unwrap();
        stage.write_new(".unexpected", b"not approved").unwrap();
        assert!(stage.verify_inventory(&files).is_err());
        let nested = parent.create_private_child("nested").unwrap();
        nested.create_private_child("Dokument_01.md").unwrap();
        assert!(nested.verify_inventory(&files).is_err());
        let linked = parent.create_private_child("linked").unwrap();
        #[cfg(unix)] std::os::unix::fs::symlink(f.path.join("stage"), f.path.join("linked/Dokument_01.md")).unwrap();
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            assert!(std::process::Command::new("node").args(["-e", "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')"])
                .arg(f.path.join("stage")).arg(f.path.join("linked/Dokument_01.md")).creation_flags(0x0800_0000).status().unwrap().success());
        }
        assert!(linked.verify_inventory(&files).is_err());
        #[cfg(windows)] fs::remove_dir(f.path.join("linked/Dokument_01.md")).unwrap();
        #[cfg(unix)] fs::remove_file(f.path.join("linked/Dokument_01.md")).unwrap();
    }
    #[test]
    fn missing_target_never_creates_parents() {
        let f = Fixture::new();
        assert!(Directory::open_existing(&f.path.join("missing/nested"), None).is_err());
        assert!(!f.path.join("missing").exists());
    }
    #[test]
    fn wrong_bound_identity_never_creates_a_file() {
        let f = Fixture::new();
        let parent = f.directory();
        let mut wrong = parent.identity(); wrong.object ^= 1;
        assert!(Directory::open_existing(&f.path, Some(wrong)).is_err());
        assert_eq!(fs::read_dir(&f.path).unwrap().count(), 0);
    }
    #[test]
    fn complete_directory_publishes_with_the_same_native_identity() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"[PERSON_001] hat 42 Projekte.").unwrap();
        let identity = stage.identity();
        publish(&private, "stage", &stage, &target, "Export-test").unwrap();
        assert_eq!(target.inspect_child("Export-test", identity).unwrap(), identity);
        assert_eq!(fs::read(f.path.join("results/Export-test/Dokument_01.md")).unwrap(), b"[PERSON_001] hat 42 Projekte.");
        assert!(!f.path.join("private/stage").exists());
    }
    #[test]
    fn existing_empty_destination_is_never_adopted_or_replaced() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"only own data").unwrap();
        fs::create_dir(f.path.join("results/Export-test")).unwrap();
        let foreign = platform::directory_identity(&platform::open_child(&target.inner, "Export-test").unwrap()).unwrap();
        assert!(publish(&private, "stage", &stage, &target, "Export-test").is_err());
        assert_eq!(target.inspect_child("Export-test", foreign).unwrap(), foreign);
        assert_eq!(fs::read_dir(f.path.join("results/Export-test")).unwrap().count(), 0);
        assert_eq!(fs::read(f.path.join("private/stage/Dokument_01.md")).unwrap(), b"only own data");
    }
    #[test]
    fn existing_file_and_occupied_destination_are_never_overwritten() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"first").unwrap();
        assert!(stage.write_new("Dokument_01.md", b"changed").is_err());
        fs::write(f.path.join("results/Export-file"), b"foreign file").unwrap();
        assert!(publish(&private, "stage", &stage, &target, "Export-file").is_err());
        fs::create_dir(f.path.join("results/Export-folder")).unwrap();
        fs::write(f.path.join("results/Export-folder/sentinel"), b"foreign body").unwrap();
        assert!(publish(&private, "stage", &stage, &target, "Export-folder").is_err());
        assert_eq!(fs::read(f.path.join("results/Export-file")).unwrap(), b"foreign file");
        assert_eq!(fs::read(f.path.join("results/Export-folder/sentinel")).unwrap(), b"foreign body");
        assert_eq!(fs::read(f.path.join("private/stage/Dokument_01.md")).unwrap(), b"first");
    }
    #[test]
    fn unsafe_leaf_names_never_escape_held_parent() {
        let f = Fixture::new(); let parent = f.directory();
        for name in ["", ".", "..", "../foreign", "nested/file", "nested\\file", "C:stream", "trailing.", "trailing ", "bad\n"] {
            assert!(parent.create_private_child(name).is_err(), "{name:?}");
            assert!(parent.write_new(name, b"no").is_err(), "{name:?}");
        }
        assert_eq!(fs::read_dir(&f.path).unwrap().count(), 0);
    }
    #[test]
    fn wrong_source_binding_is_not_published_and_existing_source_is_untouched() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let first = private.create_private_child("first").unwrap();
        let other = private.create_private_child("other").unwrap();
        other.write_new("sentinel", b"other source").unwrap();
        assert!(matches!(publish(&private, "other", &first, &target, "Export-test"), Err(PublicationError::NotPublished(_))));
        assert!(!f.path.join("results/Export-test").exists());
        assert_eq!(fs::read(f.path.join("private/other/sentinel")).unwrap(), b"other source");
    }
    #[test]
    fn already_published_stage_cannot_silently_create_a_second_copy() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        publish(&private, "stage", &stage, &target, "Export-test").unwrap();
        assert!(matches!(publish(&private, "stage", &stage, &target, "Export-second"), Err(PublicationError::NotPublished(_))));
        assert!(!f.path.join("results/Export-second").exists());
        assert_eq!(fs::read(f.path.join("results/Export-test/Dokument_01.md")).unwrap(), b"approved");
    }
    #[test]
    fn failure_after_rename_is_uncertain_even_though_the_output_exists() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        let operation = Lifecycle::default().begin_native().unwrap();
        let error = publish_with_postcheck(&private, "stage", &stage, &target, "Export-test", &operation,
            || Err(io::Error::other("injected post-rename failure")));
        assert!(matches!(error, Err(PublicationError::Uncertain(_))));
        assert_eq!(target.inspect_child("Export-test", stage.identity()).unwrap(), stage.identity());
        assert_eq!(fs::read(f.path.join("results/Export-test/Dokument_01.md")).unwrap(), b"approved");
        assert!(!f.path.join("private/stage").exists());
    }
    #[test]
    fn concurrent_foreign_empty_folder_is_never_adopted_or_replaced() {
        use std::sync::{Arc, Barrier};
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        for index in 0..32 {
            let stage_name = format!("stage-{index}"); let target_name = format!("Export-{index}");
            let stage = private.create_private_child(&stage_name).unwrap();
            stage.write_new("Dokument_01.md", b"own output").unwrap();
            let barrier = Arc::new(Barrier::new(2)); let race_barrier = barrier.clone();
            let path = f.path.join("results").join(&target_name);
            let racer = std::thread::spawn(move || { race_barrier.wait(); fs::create_dir(path) });
            barrier.wait();
            let published = publish(&private, &stage_name, &stage, &target, &target_name);
            let foreign = racer.join().unwrap();
            if published.is_ok() {
                assert!(foreign.is_err(), "only the exclusive publisher may win");
                assert_eq!(target.inspect_child(&target_name, stage.identity()).unwrap(), stage.identity());
                assert_eq!(fs::read(f.path.join("results").join(&target_name).join("Dokument_01.md")).unwrap(), b"own output");
            } else {
                assert!(foreign.is_ok(), "test must observe a real destination collision, not an unrelated rename failure");
                assert_eq!(fs::read_dir(f.path.join("results").join(&target_name)).unwrap().count(), 0);
                assert_eq!(fs::read(f.path.join("private").join(&stage_name).join("Dokument_01.md")).unwrap(), b"own output");
            }
        }
    }
    #[cfg(windows)]
    #[test]
    fn held_target_root_cannot_be_replaced_during_publication() {
        let f = Fixture::new();
        fs::create_dir(f.path.join("private")).unwrap(); fs::create_dir(f.path.join("results")).unwrap();
        let private = Directory::open_existing(&f.path.join("private"), None).unwrap();
        let target = Directory::open_existing(&f.path.join("results"), None).unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        assert!(fs::rename(f.path.join("results"), f.path.join("replaced-results")).is_err());
        assert!(!f.path.join("replaced-results").exists());
        publish(&private, "stage", &stage, &target, "Export-test").unwrap();
        assert_eq!(fs::read(f.path.join("results/Export-test/Dokument_01.md")).unwrap(), b"approved");
    }
    #[test]
    fn linked_ancestor_cannot_receive_missing_descendants() {
        let f = Fixture::new(); let foreign = f.path.join("foreign"); let alias = f.path.join("alias");
        fs::create_dir(&foreign).unwrap();
        #[cfg(unix)] std::os::unix::fs::symlink(&foreign, &alias).unwrap();
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            let status = std::process::Command::new("node").args(["-e", "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')"])
                .arg(&foreign).arg(&alias).creation_flags(0x0800_0000).status().unwrap();
            assert!(status.success());
        }
        assert!(Directory::open_existing(&alias, None).is_err());
        assert!(Directory::open_existing(&alias.join("missing"), None).is_err());
        assert_eq!(fs::read_dir(&foreign).unwrap().count(), 0);
        #[cfg(windows)] fs::remove_dir(&alias).unwrap();
        #[cfg(unix)] fs::remove_file(&alias).unwrap();
    }
    #[test]
    fn shutdown_before_publish_keeps_private_stage_and_creates_no_output() {
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        let lifecycle = Lifecycle::default(); let operation = lifecycle.begin_native().unwrap();
        let shutdown = lifecycle.clone();
        let stopper = std::thread::spawn(move || shutdown.stop());
        while !lifecycle.stopping.load(std::sync::atomic::Ordering::Acquire) { std::thread::yield_now(); }
        assert!(matches!(super::publish(&private, "stage", &stage, &target, "Export-test", &operation),
            Err(PublicationError::NotPublished(error)) if error.kind() == io::ErrorKind::Interrupted));
        assert!(!f.path.join("results/Export-test").exists());
        assert_eq!(fs::read(f.path.join("private/stage/Dokument_01.md")).unwrap(), b"approved");
        drop(operation); assert!(stopper.join().unwrap());
    }
    #[test]
    fn shutdown_after_real_rename_waits_for_post_publication_checks() {
        use std::sync::atomic::Ordering;
        let f = Fixture::new(); let parent = f.directory();
        let private = parent.create_private_child("private").unwrap();
        let target = parent.create_private_child("results").unwrap();
        let stage = private.create_private_child("stage").unwrap();
        stage.write_new("Dokument_01.md", b"approved").unwrap();
        let lifecycle = Lifecycle::default(); let operation = lifecycle.begin_native().unwrap();
        let shutdown = lifecycle.clone(); let (done, finished) = std::sync::mpsc::channel();
        let (start, started) = std::sync::mpsc::channel();
        let stopper = std::thread::spawn(move || { started.recv().unwrap(); done.send(shutdown.stop()).unwrap(); });
        publish_with_postcheck(&private, "stage", &stage, &target, "Export-test", &operation, || {
            start.send(()).unwrap();
            while !lifecycle.stopping.load(Ordering::Acquire) { std::thread::yield_now(); }
            assert!(finished.recv_timeout(std::time::Duration::from_millis(50)).is_err());
            Ok(())
        }).unwrap();
        assert_eq!(fs::read(f.path.join("results/Export-test/Dokument_01.md")).unwrap(), b"approved");
        drop(operation);
        assert!(finished.recv_timeout(std::time::Duration::from_secs(2)).unwrap()); stopper.join().unwrap();
    }
}
