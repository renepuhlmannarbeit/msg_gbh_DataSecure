//! Windows-only first provisioning of the fixed Standalone data namespace.
//!
//! A missing leaf is created exclusively, relative to a held native parent,
//! with the protected current-user DACL supplied to NtCreateFile itself. There
//! is no recursive mkdir, path-based permission repair, or migration of an
//! existing namespace. Existing roots remain *candidates*: the ownership guard
//! must apply its existing permission/anchor policy before any workspace write.
//!
//! Bootstrap contract: prepare before spawning Core, pass `handoff().root` in
//! CHILD_ROOT_ENV after env_clear, and retain PreparedNamespace in SidecarProcess
//! through confirmed child exit. Recheck the binding before spawn and after
//! Ready. The JS native adapter must use that exact root, not independently
//! resolve LOCALAPPDATA, and must run the C guard before mkdir(workspace).
//! Handoff.identity is a native Rust binding, not a serializable JS capability:
//! FILE_ID_INFO's 128-bit identity must not be truncated to Node's ino field.
#![cfg(windows)]

use crate::export_directory::{Directory, Identity};
use std::{
    ffi::{c_void, OsStr},
    fs::{File, OpenOptions},
    io,
    os::windows::{
        ffi::OsStrExt,
        fs::{MetadataExt, OpenOptionsExt},
        io::{AsRawHandle, FromRawHandle},
    },
    path::{Component, Path, PathBuf, Prefix},
};

pub(crate) const NAMESPACE_LEAF: &str = "SecureDataMsg-Standalone";
pub(crate) const CHILD_ROOT_ENV: &str = "DATASECURE_STANDALONE_NAMESPACE_ROOT";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Origin {
    Created,
    /// No ACL approval is implied. The unchanged C guard is authoritative.
    ExistingCandidate,
}

pub(crate) struct PreparedNamespace {
    path: PathBuf,
    // create_controlled_child/open_bound_child do not retain their parent.
    // Keep its full ancestor chain, not just a child's standalone handle.
    parent: Directory,
    root: Directory,
    origin: Origin,
}

pub(crate) struct Handoff<'a> {
    pub root: &'a Path,
    pub identity: Identity,
    pub origin: Origin,
}

fn unsafe_namespace() -> io::Error {
    io::Error::other("STANDALONE_DATA_ROOT_UNSAFE")
}

type Handle = *mut c_void;
#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum_length: u16,
    buffer: *mut u16,
}
#[repr(C)]
struct ObjectAttributes {
    length: u32,
    root: Handle,
    name: *mut UnicodeString,
    attributes: u32,
    security: Handle,
    quality: Handle,
}
#[repr(C)]
struct IoStatus {
    status: usize,
    information: usize,
}
#[repr(C)]
struct FileId {
    volume: u64,
    id: [u8; 16],
}
#[link(name = "ntdll")]
extern "system" {
    fn NtCreateFile(
        file: *mut Handle,
        access: u32,
        attributes: *mut ObjectAttributes,
        status: *mut IoStatus,
        allocation: *const i64,
        file_attributes: u32,
        sharing: u32,
        disposition: u32,
        options: u32,
        ea: Handle,
        ea_length: u32,
    ) -> i32;
    fn RtlNtStatusToDosError(status: i32) -> u32;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetFileInformationByHandleEx(file: Handle, class: u32, info: Handle, bytes: u32) -> i32;
}

fn file_identity(file: &File) -> io::Result<Identity> {
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
        return Err(unsafe_namespace());
    }
    let mut id = FileId {
        volume: 0,
        id: [0; 16],
    };
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            18, // FileIdInfo, exactly the export_directory identity contract
            (&mut id as *mut FileId).cast(),
            std::mem::size_of::<FileId>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(Identity {
        volume: id.volume,
        object: u128::from_le_bytes(id.id),
        created_ns: metadata
            .created()?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| unsafe_namespace())?
            .as_nanos(),
    })
}

/// A separate bootstrap access policy: unlike an export stage creator, this
/// handle deliberately has NO DELETE desired access. Keep it open until the
/// owning Directory pin has been established, with no drop/reopen gap.
fn create_bootstrap_root(parent: &Directory, parent_path: &Path) -> io::Result<File> {
    let parent_file = OpenOptions::new()
        .access_mode(0x0012_0081) // SYNCHRONIZE | READ_CONTROL | ATTRIBUTES | LIST
        .share_mode(3) // no DELETE sharing
        .custom_flags(0x0200_0000 | 0x0020_0000)
        .open(parent_path)?;
    if file_identity(&parent_file)? != parent.identity() {
        return Err(unsafe_namespace());
    }
    let descriptor = crate::export_private_security::private_descriptor()?;
    let mut wide: Vec<u16> = OsStr::new(NAMESPACE_LEAF).encode_wide().collect();
    let mut name = UnicodeString {
        length: (wide.len() * 2) as u16,
        maximum_length: (wide.len() * 2) as u16,
        buffer: wide.as_mut_ptr(),
    };
    let mut attributes = ObjectAttributes {
        length: std::mem::size_of::<ObjectAttributes>() as u32,
        root: parent_file.as_raw_handle(),
        name: &mut name,
        attributes: 0x40 | 0x1000, // CASE_INSENSITIVE | DONT_REPARSE, not INHERIT
        security: descriptor.as_ptr(),
        quality: std::ptr::null_mut(),
    };
    let mut status = IoStatus {
        status: 0,
        information: 0,
    };
    let mut handle = std::ptr::null_mut();
    let result = unsafe {
        NtCreateFile(
            &mut handle,
            0x0012_0081, // same read-only bootstrap policy, explicitly no DELETE
            &mut attributes,
            &mut status,
            std::ptr::null(),
            0x80,
            3,                      // SHARE_READ | SHARE_WRITE; retain name pin
            2,                      // FILE_CREATE: never OPEN_IF/adopt a collision
            0x20 | 0x0020_0000 | 1, // synchronous, nofollow, directory
            std::ptr::null_mut(),
            0,
        )
    };
    if result < 0 {
        return Err(io::Error::from_raw_os_error(
            unsafe { RtlNtStatusToDosError(result) } as i32,
        ));
    }
    if handle.is_null() {
        return Err(unsafe_namespace());
    }
    let file = unsafe { File::from_raw_handle(handle) };
    if status.information != 2 || file_identity(&parent_file)? != parent.identity() {
        return Err(unsafe_namespace());
    }
    crate::export_private_security::verify_private(&file)?;
    parent.inspect_child(NAMESPACE_LEAF, file_identity(&file)?)?;
    Ok(file)
}

/// Accept only a drive-absolute spelling, with the one fixed product leaf.
/// The parent must already exist; this API is not a generic mkdir capability.
fn namespace_parent(path: &Path) -> io::Result<&Path> {
    if !path.is_absolute() || path.file_name() != Some(OsStr::new(NAMESPACE_LEAF)) {
        return Err(unsafe_namespace());
    }
    let mut components = path.components();
    if !matches!(components.next(), Some(Component::Prefix(p))
        if matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
        || !matches!(components.next(), Some(Component::RootDir))
        || components.any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(unsafe_namespace());
    }
    path.parent().ok_or_else(unsafe_namespace)
}

/// canonicalize can return a verbatim spelling which the current C guard and
/// Node CLI do not accept. Preserve every component without lossy UTF-16/UTF-8
/// conversion and allow only the already-supported local drive namespace.
fn core_spelling(path: &Path) -> io::Result<PathBuf> {
    let mut components = path.components();
    let disk = match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(disk) | Prefix::VerbatimDisk(disk) => disk,
            _ => return Err(unsafe_namespace()),
        },
        _ => return Err(unsafe_namespace()),
    };
    if !matches!(components.next(), Some(Component::RootDir)) {
        return Err(unsafe_namespace());
    }
    let mut result = PathBuf::from(format!("{}:\\", disk as char));
    let mut depth = 1; // C open_root also retains the drive root.
    for component in components {
        let Component::Normal(name) = component else {
            return Err(unsafe_namespace());
        };
        let wide: Vec<u16> = name.encode_wide().collect();
        depth += 1;
        if depth > 256
            || wide.is_empty()
            || wide.len() > 255
            || wide.iter().any(|c| *c < 32 || [47, 58, 92].contains(c))
            || matches!(wide.last(), Some(32 | 46))
        {
            return Err(unsafe_namespace());
        }
        result.push(name);
    }
    // Core's path parameter is UTF-8; do not substitute unpaired surrogates.
    if result.to_str().is_none_or(|value| value.len() > 32760)
        || result.as_os_str().encode_wide().count() >= 32760
    {
        return Err(unsafe_namespace());
    }
    Ok(result)
}

/// Never retries a create collision by adopting or changing the winner.
pub(crate) fn prepare(path: &Path) -> io::Result<PreparedNamespace> {
    #[cfg(test)]
    {
        prepare_impl(path, &mut |_| Ok(()))
    }
    #[cfg(not(test))]
    {
        prepare_impl(path)
    }
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Checkpoint {
    ObservedAbsent,
    CreatedBeforeDirectoryPin,
}

fn prepare_impl(
    path: &Path,
    #[cfg(test)] checkpoint: &mut dyn FnMut(Checkpoint) -> io::Result<()>,
) -> io::Result<PreparedNamespace> {
    let parent_path = namespace_parent(path)?;
    let parent = Directory::open_existing(parent_path, None)?;
    let (root, origin) = if parent.child_absent(NAMESPACE_LEAF)? {
        #[cfg(test)]
        checkpoint(Checkpoint::ObservedAbsent)?;
        let created = create_bootstrap_root(&parent, parent_path)?;
        let expected = file_identity(&created)?;
        #[cfg(test)]
        checkpoint(Checkpoint::CreatedBeforeDirectoryPin)?;
        // created stays held until root owns a matching, C-compatible pin.
        let root = parent.open_bound_child(NAMESPACE_LEAF, expected)?;
        root.verify_controlled()?;
        drop(created);
        (root, Origin::Created)
    } else {
        // open_existing holds all ancestors and refuses reparse points. Do not
        // apply export_private_security's stricter exact-one-ACE policy here:
        // that would change the C guard's existing-root admission contract.
        let root = Directory::open_existing(path, None)?;
        parent.inspect_child(NAMESPACE_LEAF, root.identity())?;
        (root, Origin::ExistingCandidate)
    };

    // Resolve Windows namespace virtualization while the original object/name
    // is pinned. Core receives the actual object spelling, not a second token's
    // independent LOCALAPPDATA resolution. Bind the canonical spelling to the
    // exact same full native identity before exposing it to the caller.
    let path = core_spelling(&std::fs::canonicalize(path)?)?;
    let canonical_root = Directory::open_existing(&path, Some(root.identity()))?;
    parent.inspect_child(NAMESPACE_LEAF, root.identity())?;
    if origin == Origin::Created {
        canonical_root.verify_controlled()?;
    }
    let prepared = PreparedNamespace {
        path,
        parent,
        root: canonical_root,
        origin,
    };
    prepared.verify_binding()?;
    Ok(prepared)
}

impl PreparedNamespace {
    /// Identity/name proof only. In particular, success for ExistingCandidate
    /// is NOT permission to create workspace, history, or a lock anchor.
    pub(crate) fn verify_binding(&self) -> io::Result<()> {
        self.parent
            .inspect_child(NAMESPACE_LEAF, self.root.identity())?;
        let _observed = Directory::open_existing(&self.path, Some(self.root.identity()))?;
        self.parent
            .inspect_child(NAMESPACE_LEAF, self.root.identity())?;
        Ok(())
    }

    /// Borrowing this DTO does not transfer the retained native handles. The
    /// caller must keep this PreparedNamespace alive for the child lifetime.
    pub(crate) fn handoff(&self) -> io::Result<Handoff<'_>> {
        self.verify_binding()?;
        Ok(Handoff {
            root: &self.path,
            identity: self.root.identity(),
            origin: self.origin,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        ffi::c_void,
        fs::{self, OpenOptions},
        os::windows::{
            ffi::OsStrExt,
            fs::{MetadataExt, OpenOptionsExt},
            io::AsRawHandle,
            process::CommandExt,
        },
        process::{Child, Command, Stdio},
        sync::atomic::{AtomicU64, Ordering},
        time::{Duration, Instant},
    };

    type Handle = *mut c_void;
    const BACKUP_NOFOLLOW: u32 = 0x0200_0000 | 0x0020_0000;
    const READ_CONTROL: u32 = 0x0002_0000;
    const WRITE_DAC: u32 = 0x0004_0000;
    const CAPABILITY: &str = "S-1-15-3-1"; // synthetic InternetClient capability
    static NEXT: AtomicU64 = AtomicU64::new(0);

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(value: Handle) -> Handle;
        fn DeviceIoControl(
            file: Handle,
            code: u32,
            input: Handle,
            input_bytes: u32,
            output: Handle,
            output_bytes: u32,
            returned: *mut u32,
            overlapped: Handle,
        ) -> i32;
    }
    #[link(name = "advapi32")]
    extern "system" {
        fn GetSecurityDescriptorOwner(
            descriptor: Handle,
            owner: *mut Handle,
            defaulted: *mut i32,
        ) -> i32;
        fn ConvertSidToStringSidW(sid: Handle, text: *mut *mut u16) -> i32;
        fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
            text: *const u16,
            revision: u32,
            descriptor: *mut Handle,
            bytes: *mut u32,
        ) -> i32;
        fn GetSecurityDescriptorDacl(
            descriptor: Handle,
            present: *mut i32,
            acl: *mut Handle,
            defaulted: *mut i32,
        ) -> i32;
        fn SetSecurityInfo(
            file: Handle,
            kind: u32,
            flags: u32,
            owner: Handle,
            group: Handle,
            dacl: Handle,
            sacl: Handle,
        ) -> u32;
        fn GetSecurityInfo(
            file: Handle,
            kind: u32,
            flags: u32,
            owner: *mut Handle,
            group: *mut Handle,
            dacl: *mut Handle,
            sacl: *mut Handle,
            descriptor: *mut Handle,
        ) -> u32;
        fn GetSecurityDescriptorLength(descriptor: Handle) -> u32;
    }

    struct Allocation(Handle);
    impl Drop for Allocation {
        fn drop(&mut self) {
            unsafe { LocalFree(self.0) };
        }
    }

    struct Fixture {
        path: PathBuf,
        identity: Identity,
        pin: Option<Directory>,
    }
    impl Fixture {
        fn new() -> Self {
            let temporary = std::env::temp_dir();
            let parent = Directory::open_existing(&temporary, None).unwrap();
            let leaf = format!(
                "datasecure-namespace-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            );
            let created = parent.create_controlled_child(&leaf).unwrap();
            let identity = created.identity();
            drop(created);
            let pin = parent.open_bound_child(&leaf, identity).unwrap();
            Self {
                path: temporary.join(leaf),
                identity,
                pin: Some(pin),
            }
        }
        fn root(&self) -> PathBuf {
            self.path.join(NAMESPACE_LEAF)
        }
        fn check_owned_fixture(&self) {
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self
                .path
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with("datasecure-namespace-"));
            Directory::open_existing(&self.path, Some(self.identity)).unwrap();
        }

        /// The only ACL-writing helper is confined to this freshly, exclusively
        /// created fixture itself. No caller-supplied/user/profile path exists.
        fn synthetic_capability_parent(&self) {
            self.synthetic_parent_policy(true);
        }

        fn synthetic_foreign_write_parent(&self) {
            self.synthetic_parent_policy(false);
        }

        fn synthetic_parent_policy(&self, capability: bool) {
            self.check_owned_fixture();
            let descriptor = crate::export_private_security::private_descriptor().unwrap();
            let (mut owner, mut defaulted) = (std::ptr::null_mut(), 0);
            assert_ne!(
                unsafe {
                    GetSecurityDescriptorOwner(descriptor.as_ptr(), &mut owner, &mut defaulted)
                },
                0
            );
            assert!(!owner.is_null());
            let mut text = std::ptr::null_mut();
            assert_ne!(unsafe { ConvertSidToStringSidW(owner, &mut text) }, 0);
            let allocation = Allocation(text.cast());
            let mut length = 0;
            while length < 184 && unsafe { *text.add(length) } != 0 {
                length += 1;
            }
            assert!(length < 184);
            let sid =
                String::from_utf16(unsafe { std::slice::from_raw_parts(text, length) }).unwrap();
            drop(allocation);
            let extra = if capability {
                format!("(A;OICI;FA;;;{CAPABILITY})(A;OICIIO;GA;;;{CAPABILITY})")
            } else {
                // Ordinary Everyone WRITE_DAC is not an AppContainer grant.
                "(A;OICI;0x00040000;;;WD)".to_owned()
            };
            let sddl: Vec<u16> = format!("D:P(A;OICI;FA;;;{sid}){extra}")
            .encode_utf16()
            .chain([0])
            .collect();
            let mut raw = std::ptr::null_mut();
            assert_ne!(
                unsafe {
                    ConvertStringSecurityDescriptorToSecurityDescriptorW(
                        sddl.as_ptr(),
                        1,
                        &mut raw,
                        std::ptr::null_mut(),
                    )
                },
                0
            );
            let allocation = Allocation(raw);
            let (mut present, mut defaulted, mut dacl) = (0, 0, std::ptr::null_mut());
            assert_ne!(
                unsafe { GetSecurityDescriptorDacl(raw, &mut present, &mut dacl, &mut defaulted) },
                0
            );
            assert_ne!(present, 0);
            assert!(!dacl.is_null());
            let file = OpenOptions::new()
                .access_mode(READ_CONTROL | WRITE_DAC)
                .share_mode(3)
                .custom_flags(BACKUP_NOFOLLOW)
                .open(&self.path)
                .unwrap();
            assert_eq!(file.metadata().unwrap().file_attributes() & 0x400, 0);
            assert_eq!(
                unsafe {
                    SetSecurityInfo(
                        file.as_raw_handle(),
                        1,
                        4 | 0x8000_0000,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        dacl,
                        std::ptr::null_mut(),
                    )
                },
                0
            );
            drop(allocation);
            self.check_owned_fixture();
        }

        /// A junction needs no Developer Mode, admin privilege, shell, or Node.
        /// Both ends must be immediate children of this one owned fixture.
        fn junction_to_foreign(&self, leaf: &str) {
            self.check_owned_fixture();
            assert!([NAMESPACE_LEAF, "alias"].contains(&leaf));
            let target = self.path.join("foreign");
            let target = core_spelling(&fs::canonicalize(target).unwrap()).unwrap();
            let print: Vec<u16> = target.as_os_str().encode_wide().collect();
            let substitute: Vec<u16> = OsStr::new(&format!(r"\??\{}", target.display()))
                .encode_wide()
                .collect();
            let link = self.path.join(leaf);
            fs::create_dir(&link).unwrap(); // test-only empty junction object
            let file = OpenOptions::new()
                .access_mode(0x4000_0000)
                .share_mode(0)
                .custom_flags(BACKUP_NOFOLLOW)
                .open(&link)
                .unwrap();
            let path_bytes = (substitute.len() + 1 + print.len() + 1) * 2;
            assert!(path_bytes + 16 < 16_384);
            let mut bytes = Vec::with_capacity(16 + path_bytes);
            bytes.extend_from_slice(&0xa000_0003u32.to_le_bytes()); // MOUNT_POINT
            bytes.extend_from_slice(&((8 + path_bytes) as u16).to_le_bytes());
            bytes.extend_from_slice(&0u16.to_le_bytes());
            for value in [
                0,
                substitute.len() * 2,
                (substitute.len() + 1) * 2,
                print.len() * 2,
            ] {
                bytes.extend_from_slice(&(value as u16).to_le_bytes());
            }
            for value in substitute
                .iter()
                .chain([&0])
                .chain(print.iter())
                .chain([&0])
            {
                bytes.extend_from_slice(&value.to_le_bytes());
            }
            let mut returned = 0;
            assert_ne!(
                unsafe {
                    DeviceIoControl(
                        file.as_raw_handle(),
                        0x0009_00a4, // FSCTL_SET_REPARSE_POINT
                        bytes.as_mut_ptr().cast(),
                        bytes.len() as u32,
                        std::ptr::null_mut(),
                        0,
                        &mut returned,
                        std::ptr::null_mut(),
                    )
                },
                0,
                "{}",
                io::Error::last_os_error()
            );
            drop(file);
            assert_ne!(
                fs::symlink_metadata(link).unwrap().file_attributes() & 0x400,
                0
            );
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            // Do not attempt cleanup after a failed assertion/uncertain fixture
            // identity. Tests never modify a real LOCALAPPDATA or user root.
            if std::thread::panicking() {
                return;
            }
            self.check_owned_fixture();
            drop(self.pin.take());
            remove_fixture_tree(&self.path, 0);
        }
    }

    fn remove_fixture_tree(path: &Path, depth: usize) {
        assert!(depth <= 4);
        let metadata = fs::symlink_metadata(path).unwrap();
        if metadata.file_attributes() & 0x400 != 0 {
            // Remove only the link object, never enumerate its destination.
            if metadata.file_attributes() & 0x10 != 0 {
                fs::remove_dir(path).unwrap();
            } else {
                fs::remove_file(path).unwrap();
            }
        } else if metadata.is_dir() {
            let entries: Vec<_> = fs::read_dir(path)
                .unwrap()
                .map(|entry| entry.unwrap())
                .take(33)
                .collect();
            assert!(entries.len() <= 32);
            for entry in entries {
                assert_eq!(entry.path().parent(), Some(path));
                remove_fixture_tree(&entry.path(), depth + 1);
            }
            fs::remove_dir(path).unwrap();
        } else {
            assert!(metadata.is_file());
            fs::remove_file(path).unwrap();
        }
    }

    fn security_bytes(path: &Path) -> Vec<u8> {
        let file = OpenOptions::new()
            .access_mode(READ_CONTROL)
            .share_mode(3)
            .custom_flags(BACKUP_NOFOLLOW)
            .open(path)
            .unwrap();
        let mut raw = std::ptr::null_mut();
        assert_eq!(
            unsafe {
                GetSecurityInfo(
                    file.as_raw_handle(),
                    1,
                    1 | 4,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    &mut raw,
                )
            },
            0
        );
        let _allocation = Allocation(raw);
        assert!(!raw.is_null());
        let length = unsafe { GetSecurityDescriptorLength(raw) } as usize;
        assert!((20..=65_536).contains(&length));
        unsafe { std::slice::from_raw_parts(raw.cast::<u8>(), length) }.to_vec()
    }

    // Test-input pin for the already prepared, renamed official Node 22.23.2
    // Windows x64 executable. This is not a new production trust configuration.
    const PACKAGE_NODE_22_23_2_SHA256: &str =
        "0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4";

    fn pin_native_probe_input(path: &Path, expected: &str) -> File {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        assert!(expected.len() == 64 && expected.bytes().all(|c|
            c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        // Retain this read handle through confirmed child exit. Refuse reparse
        // files and deny write/delete sharing while hashing and executing them.
        let mut file = OpenOptions::new().read(true).share_mode(1)
            .custom_flags(0x0020_0000).open(path).unwrap();
        let before = file.metadata().unwrap();
        assert!(before.is_file() && before.file_attributes() & 0x400 == 0);
        assert!((1..=128 * 1024 * 1024).contains(&before.len()));
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        let mut total = 0u64;
        loop {
            let count = file.read(&mut buffer).unwrap();
            if count == 0 { break; }
            total += count as u64;
            assert!(total <= before.len());
            hash.update(&buffer[..count]);
        }
        assert_eq!(total, before.len());
        assert_eq!(file.metadata().unwrap().len(), before.len());
        assert_eq!(format!("{:x}", hash.finalize()), expected);
        file
    }

    const NATIVE_GUARD_PROBE: &str = r#"
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
try {
  const [loader, addon, root, sha256, mode, applicationService] = process.argv.slice(1);
  assert.equal(process.version, 'v22.23.2');
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  assert.equal(process.env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  const artifact = Object.freeze({ schema: 'datasecure-native-ownership-guard/1',
    abi: 1, napi: 8, target: 'windows-x64', path: path.resolve(addon), sha256 });
  const { createOwnershipGuard } = require(loader);
  // Establish that the JavaScript directory binding passes. In the unsafe
  // case the expected refusal must therefore come from C createRoot, not a
  // missing/reparsed pathname being mistaken for an ACL-policy proof.
  const { bindDirectory, assertDirectory } = require(path.join(path.dirname(loader), 'bound-file-io.js'));
  assert.equal(assertDirectory(bindDirectory(root)), true);
  let outcome, nativeHandoff = false;
  if (mode === 'accept' || mode === 'accept-lowercase-handoff') {
    if (mode === 'accept-lowercase-handoff') {
      assert.equal(path.basename(root), 'securedatamsg-standalone');
      const { standaloneDataRoot } = require(path.resolve(applicationService));
      const environment = {
        DATASECURE_NATIVE_EXPORT_CHANNEL: '1',
        DATASECURE_STANDALONE_NAMESPACE_ROOT: root,
        get LOCALAPPDATA() { throw Error('native handoff must not consult LOCALAPPDATA'); }
      };
      assert.equal(standaloneDataRoot({ platform: 'win32', environment,
        get home() { throw Error('native handoff must not consult home fallback'); } }), root);
      nativeHandoff = true;
    }
    const factory = createOwnershipGuard({ root, verifiedArtifact: artifact });
    let guard;
    try {
      guard = factory.tryAcquire();
      assert.notEqual(guard, null);
      assert.equal(guard.assertHeld(), true);
      const releasing = guard;
      guard = null;
      assert.equal(releasing.release(), true);
    } finally {
      if (guard) assert.equal(guard.release(), true);
      assert.equal(factory.close(), true);
    }
    // Also exercise the real synchronous product wrapper, not a guard mock.
    const control = require(path.join(path.dirname(loader), 'ownership-control.js'));
    control.configureOwnershipControl(artifact);
    let called = false;
    control.withOwnershipControl(root, held => {
      called = true;
      assert.equal(held.assertHeld(), true);
    });
    assert.equal(called, true);
    outcome = 'accepted';
  } else {
    assert.equal(mode, 'refuse');
    assert.throws(() => createOwnershipGuard({ root, verifiedArtifact: artifact }),
      { code: 'OWNERSHIP_GUARD_UNSAFE' });
    outcome = 'OWNERSHIP_GUARD_UNSAFE';
  }
  process.stdout.write(JSON.stringify({ schema: 'datasecure-namespace-native-probe/1',
    node: process.version, outcome, native_handoff: nativeHandoff }));
} catch (error) {
  process.stdout.write(JSON.stringify({ schema: 'datasecure-namespace-native-probe/1',
    outcome: 'failed', code: /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'TEST_FAILED' }));
  process.exitCode = 1;
}
"#;

    struct NativeProbeChild { child: Child, reaped: bool }
    impl Drop for NativeProbeChild {
        fn drop(&mut self) {
            if !self.reaped {
                if self.child.try_wait().ok().flatten().is_none() {
                    let _ = self.child.kill();
                }
                // kill alone is not reaping. Keep fixture/root pins alive until
                // wait confirms exit, including assertion/unwind paths.
                let result = self.child.wait();
                self.reaped = result.is_ok();
                if !std::thread::panicking() {
                    assert!(self.reaped, "native probe child exit was not confirmed");
                }
            }
        }
    }

    fn run_packaged_native_probe(prepared: &PreparedNamespace, fixture: &Fixture, mode: &str) {
        use std::io::Read;
        assert!(matches!(mode, "accept" | "refuse" | "accept-lowercase-handoff"));
        fixture.check_owned_fixture();
        prepared.verify_binding().unwrap();
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let node = manifest.join("binaries/datasecure-core-x86_64-pc-windows-msvc.exe");
        let server = manifest.join("generated-runtime/server");
        let addon = server.join("native/windows-x64/ownership-guard.node");
        let loader = server.join("core/native-ownership-guard.js");
        // Exercise the actual current source caller without silently relying on
        // an older generated-runtime JavaScript projection. Node and the C addon
        // remain the exact pinned prepared product artifacts above.
        let application_service = manifest.ancestors().nth(3).unwrap()
            .join("plugins/data-secure/server/standalone/application-service.js");
        let pin = crate::source_fingerprint::ownership_guard_sha256();
        // Pin both artifact parent chains, plus the exact held file objects.
        // Never obtain trust from an editable adjacent .sha256 file or envpath.
        let _node_parent = Directory::open_existing(node.parent().unwrap(), None).unwrap();
        let _addon_parent = Directory::open_existing(addon.parent().unwrap(), None).unwrap();
        let _node_pin = pin_native_probe_input(&node, PACKAGE_NODE_22_23_2_SHA256);
        let _addon_pin = pin_native_probe_input(&addon, pin);
        let root = prepared.handoff().unwrap().root;
        let cwd = core_spelling(&fs::canonicalize(&fixture.path).unwrap()).unwrap();
        let mut command = Command::new(&node);
        command.env_clear().env("DATASECURE_NATIVE_EXPORT_CHANNEL", "1")
            .env("DATASECURE_OWNERSHIP_GUARD_SHA256", pin)
            .current_dir(cwd).creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .args(["--input-type=commonjs", "--eval", NATIVE_GUARD_PROBE, "--"])
            .arg(&loader).arg(&addon).arg(root).arg(pin).arg(mode).arg(application_service)
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
        if let Some(system_root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", system_root);
        }
        let mut child = NativeProbeChild { child: command.spawn().unwrap(), reaped: false };
        let deadline = Instant::now() + Duration::from_secs(20);
        let (status, timed_out) = loop {
            if let Some(status) = child.child.try_wait().unwrap() {
                child.reaped = true;
                break (status, false);
            }
            if Instant::now() >= deadline {
                // The deadline never releases a live child's namespace pins.
                let killed = child.child.kill();
                let status = child.child.wait().expect("native probe child must be reaped");
                child.reaped = true;
                killed.expect("native probe deadline must terminate its own child");
                break (status, true);
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        let mut output = Vec::new();
        child.child.stdout.take().unwrap().take(4097).read_to_end(&mut output).unwrap();
        assert!(!timed_out, "native probe exceeded its 20-second child deadline");
        assert!(output.len() <= 4096, "native probe output exceeded its fixed budget");
        assert!(status.success(), "native probe failed: {}", String::from_utf8_lossy(&output));
        let proof: serde_json::Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(proof["schema"], "datasecure-namespace-native-probe/1");
        assert_eq!(proof["node"], "v22.23.2");
        assert_eq!(proof["outcome"], if mode == "refuse" { "OWNERSHIP_GUARD_UNSAFE" } else { "accepted" });
        if mode == "accept-lowercase-handoff" {
            assert_eq!(proof["native_handoff"], true);
        }
        prepared.verify_binding().unwrap();
        fixture.check_owned_fixture();
    }

    // Interactive counterpart: unlike the short acceptance probe above, this
    // real C factory and acquired kernel guard remain alive during Rust configure.
    const CONFIGURE_PIN_PROBE: &str = r#"
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
let factory, guard, finished = false, received = Buffer.alloc(0);
const proof = phase => process.stdout.write(JSON.stringify({
  schema: 'datasecure-configure-pin-probe/1', node: process.version, phase }) + '\n');
function finish(failed) {
  if (finished) return;
  finished = true;
  try {
    if (guard) { assert.equal(guard.assertHeld(), true); assert.equal(guard.release(), true); guard = null; }
    if (factory) { assert.equal(factory.close(), true); factory = null; }
  } catch { failed = true; }
  proof(failed ? 'failed' : 'closed');
  process.exitCode = failed ? 1 : 0;
  process.stdin.destroy();
}
try {
  const [loader, addon, root, sha256] = process.argv.slice(1);
  assert.equal(process.version, 'v22.23.2');
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  assert.equal(process.env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  const artifact = Object.freeze({ schema: 'datasecure-native-ownership-guard/1',
    abi: 1, napi: 8, target: 'windows-x64', path: path.resolve(addon), sha256 });
  const { createOwnershipGuard } = require(loader);
  factory = createOwnershipGuard({ root, verifiedArtifact: artifact });
  guard = factory.tryAcquire();
  assert.notEqual(guard, null);
  assert.equal(guard.assertHeld(), true);
  process.stdin.on('data', chunk => {
    if (finished) return;
    try {
      assert.ok(received.length + chunk.length <= 8);
      received = Buffer.concat([received, chunk]);
      const expected = Buffer.from('release\n');
      assert.equal(received.equals(expected.subarray(0, received.length)), true);
      if (received.length === expected.length) finish(false);
    } catch { finish(true); }
  });
  process.stdin.on('end', () => { if (!finished) finish(true); });
  process.stdin.on('error', () => finish(true));
  proof('held');
} catch { finish(true); }
"#;

    struct ConfigurePinChild {
        process: NativeProbeChild,
        messages: std::sync::mpsc::Receiver<Result<serde_json::Value, &'static str>>,
        reader: Option<std::thread::JoinHandle<()>>,
    }
    impl ConfigurePinChild {
        fn next(&self, deadline: Instant) -> serde_json::Value {
            self.messages.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .expect("configure pin child handshake deadline")
                .expect("configure pin child returned invalid bounded proof")
        }
        fn expect_phase(&self, phase: &str, deadline: Instant) {
            assert_eq!(self.next(deadline), serde_json::json!({
                "schema": "datasecure-configure-pin-probe/1", "node": "v22.23.2", "phase": phase }));
        }
        fn finish(&mut self, deadline: Instant) {
            use std::io::Write;
            self.process.child.stdin.take().unwrap().write_all(b"release\n").unwrap();
            self.expect_phase("closed", deadline);
            let status = loop {
                if let Some(status) = self.process.child.try_wait().unwrap() {
                    self.process.reaped = true;
                    break status;
                }
                assert!(Instant::now() < deadline, "configure pin child exit deadline");
                std::thread::sleep(Duration::from_millis(10));
            };
            self.reader.take().unwrap().join().expect("bounded configure proof reader");
            assert!(status.success(), "configure pin child refused final held/release/close confirmation");
            assert!(matches!(self.messages.try_recv(), Err(std::sync::mpsc::TryRecvError::Disconnected)));
        }
    }
    impl Drop for ConfigurePinChild {
        fn drop(&mut self) {
            // Confirm our own child's exit BEFORE artifact, PreparedNamespace
            // or fixture capabilities can unwind. A kill request alone is not proof.
            if !self.process.reaped {
                if self.process.child.try_wait().ok().flatten().is_none() {
                    let _ = self.process.child.kill();
                }
                self.process.child.wait().expect("configure pin child must be reaped");
                self.process.reaped = true;
            }
            if let Some(reader) = self.reader.take() {
                reader.join().expect("configure proof reader must end after confirmed child exit");
            }
        }
    }

    fn configure_under_packaged_native_pin(prepared: &PreparedNamespace, fixture: &Fixture, target: &Path)
        -> (io::Result<crate::native_export_broker::Binding>, Vec<crate::native_export_broker::ConfigureFailure>) {
        use std::io::Read;
        fixture.check_owned_fixture();
        prepared.verify_binding().unwrap();
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let node = manifest.join("binaries/datasecure-core-x86_64-pc-windows-msvc.exe");
        let server = manifest.join("generated-runtime/server");
        let addon = server.join("native/windows-x64/ownership-guard.node");
        let loader = server.join("core/native-ownership-guard.js");
        let pin = crate::source_fingerprint::ownership_guard_sha256();
        let _node_parent = Directory::open_existing(node.parent().unwrap(), None).unwrap();
        let _addon_parent = Directory::open_existing(addon.parent().unwrap(), None).unwrap();
        let _node_pin = pin_native_probe_input(&node, PACKAGE_NODE_22_23_2_SHA256);
        let _addon_pin = pin_native_probe_input(&addon, pin);
        let handoff = prepared.handoff().unwrap();
        let cwd = core_spelling(&fs::canonicalize(&fixture.path).unwrap()).unwrap();
        let mut command = Command::new(&node);
        command.env_clear().env("DATASECURE_NATIVE_EXPORT_CHANNEL", "1")
            .env("DATASECURE_OWNERSHIP_GUARD_SHA256", pin)
            .current_dir(cwd).creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .args(["--input-type=commonjs", "--eval", CONFIGURE_PIN_PROBE, "--"])
            .arg(loader).arg(addon).arg(handoff.root).arg(pin)
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        if let Some(system_root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", system_root);
        }
        let mut process = NativeProbeChild { child: command.spawn().unwrap(), reaped: false };
        let mut stdout = process.child.stdout.take().unwrap();
        let (send, messages) = std::sync::mpsc::channel();
        let reader = std::thread::Builder::new().name("configure-pin-proof".into()).spawn(move || {
            // At most two <=1024-byte protocol lines and one EOF probe. Never
            // read_until/read_to_end into a growing unbounded pipe buffer.
            for _ in 0..2 {
                let mut bytes = Vec::with_capacity(128);
                loop {
                    let mut byte = [0u8; 1];
                    match stdout.read(&mut byte) {
                        Ok(1) if byte[0] == b'\n' => break,
                        Ok(1) if bytes.len() < 1024 => bytes.push(byte[0]),
                        _ => { let _ = send.send(Err("CONFIGURE_PIN_PROOF_INVALID")); return; }
                    }
                }
                let message = serde_json::from_slice(&bytes).map_err(|_| "CONFIGURE_PIN_PROOF_INVALID");
                let invalid = message.is_err();
                if send.send(message).is_err() || invalid { return; }
            }
            let mut byte = [0u8; 1];
            if !matches!(stdout.read(&mut byte), Ok(0)) {
                let _ = send.send(Err("CONFIGURE_PIN_PROOF_TRAILING"));
            }
        }).expect("configure proof reader must start");
        let mut child = ConfigurePinChild { process, messages, reader: Some(reader) };
        child.expect_phase("held", Instant::now() + Duration::from_secs(20));
        prepared.verify_binding().unwrap();
        let lifecycle = crate::ipc_transport::Lifecycle::default();
        let guard = lifecycle.begin_native_until(Instant::now() + Duration::from_secs(20)).unwrap();
        let mut failures = Vec::new();
        // Same implementation invoked by configure()/configure_export_root.
        // Substitute only the best-effort diagnostic sink, never a guard or IO.
        let configured = crate::native_export_broker::configure_observed(target, handoff.root,
            &"e".repeat(32), &guard, |failure| failures.push(failure));
        child.finish(Instant::now() + Duration::from_secs(20));
        prepared.verify_binding().unwrap();
        fixture.check_owned_fixture();
        (configured, failures)
    }

    #[test]
    fn actual_configure_under_held_rust_and_packaged_node_c_pins_compares_private_and_capability_roots() {
        let mut outcomes = Vec::new();
        for inherited in [false, true] {
            let fixture = Fixture::new();
            fixture.synthetic_capability_parent();
            if inherited { fs::create_dir(fixture.root()).unwrap(); }
            let prepared = prepare(&fixture.root()).unwrap();
            let handoff = prepared.handoff().unwrap();
            assert_eq!(handoff.origin, if inherited { Origin::ExistingCandidate } else { Origin::Created });
            assert_eq!(prepared.root.verify_controlled().is_ok(), !inherited);
            let target = fixture.path.join("results");
            fs::create_dir(&target).unwrap();
            let target = core_spelling(&fs::canonicalize(target).unwrap()).unwrap();
            let target_identity = Directory::open_existing(&target, None).unwrap().identity();
            fs::write(handoff.root.join("existing.txt"), b"preserve synthetic existing content").unwrap();
            let parent_before = security_bytes(&fixture.path);
            let root_before = security_bytes(handoff.root);
            let target_before = security_bytes(&target);
            let (configured, failures) = configure_under_packaged_native_pin(&prepared, &fixture, &target);
            assert_eq!(prepared.handoff().unwrap().identity, handoff.identity);
            assert_eq!(Directory::open_existing(&target, Some(target_identity)).unwrap().identity(), target_identity);
            assert!(security_bytes(&fixture.path) == parent_before, "synthetic parent security changed");
            assert!(security_bytes(handoff.root) == root_before, "synthetic root security changed");
            assert!(security_bytes(&target) == target_before, "synthetic target security changed");
            assert_eq!(fs::read(handoff.root.join("existing.txt")).unwrap(), b"preserve synthetic existing content");
            let policy = if inherited { "inherited_capability" } else { "owner_only_controlled" };
            // Failure output contains NO path, io::Error payload, SID or ACL.
            eprintln!("{}", serde_json::json!({ "schema": "datasecure-configure-pinned-proof/1",
                "policy": policy, "ok": configured.is_ok(), "failures": failures }));
            let ok = if let Ok(binding) = configured {
                assert!(failures.is_empty());
                assert!(binding.root == target.to_str().unwrap(), "configured root binding changed");
                assert_eq!(binding.root_identity, target_identity.into());
                assert_eq!(binding.data_root_identity, handoff.identity.into());
                assert_eq!(binding.private_name, format!("native-export-{}", "e".repeat(32)));
                for (name, expected) in [("DataSecure-KI-Export", binding.anonymize_identity),
                    ("DataSecure-Markdown-Korrektur", binding.markdown_identity)] {
                    let child = Directory::open_existing(&target.join(name), None).unwrap();
                    assert_eq!(crate::native_export_broker::ObjectId::from(child.identity()), expected);
                    child.verify_controlled().unwrap();
                }
                let private = Directory::open_existing(&handoff.root.join(&binding.private_name), None).unwrap();
                assert_eq!(crate::native_export_broker::ObjectId::from(private.identity()), binding.private_identity);
                private.verify_controlled().unwrap();
                true
            } else {
                assert_eq!(failures.len(), 1, "one original native failure must be captured before public mapping");
                false
            };
            outcomes.push((policy, ok));
            drop(prepared); // Before this fresh, identity-bound fixture's cleanup.
        }
        // Run BOTH policies before failing so a platform-specific error remains
        // comparable. A refusal is evidence, never a reason to relax ACL policy.
        assert!(outcomes.iter().all(|(_, ok)| *ok), "synthetic configure comparison failed: {outcomes:?}");
    }

    #[test]
    fn actual_packaged_node_c_guard_accepts_held_rust_root_under_capability_parent() {
        let fixture = Fixture::new();
        fixture.synthetic_capability_parent();
        let parent_before = security_bytes(&fixture.path);
        let prepared = prepare(&fixture.root()).unwrap();
        assert_eq!(prepared.handoff().unwrap().origin, Origin::Created);
        let root_before = security_bytes(&fixture.root());
        run_packaged_native_probe(&prepared, &fixture, "accept");
        assert_eq!(security_bytes(&fixture.path), parent_before);
        assert_eq!(security_bytes(&fixture.root()), root_before);
        prepared.root.verify_controlled().unwrap();
        let names: Vec<_> = fs::read_dir(fixture.root()).unwrap()
            .map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("ownership-control.lock")]);
        assert_eq!(fs::metadata(fixture.root().join("ownership-control.lock")).unwrap().len(), 0);
        assert!(!fixture.root().join("workspace").exists());
    }

    #[test]
    fn actual_packaged_node_c_guard_refuses_unsafe_existing_root_without_repair() {
        let fixture = Fixture::new();
        fixture.synthetic_foreign_write_parent();
        fs::create_dir(fixture.root()).unwrap();
        fs::write(fixture.root().join("existing.txt"), b"must survive native refusal unchanged").unwrap();
        let parent_before = security_bytes(&fixture.path);
        let root_before = security_bytes(&fixture.root());
        let prepared = prepare(&fixture.root()).unwrap();
        assert_eq!(prepared.handoff().unwrap().origin, Origin::ExistingCandidate);
        run_packaged_native_probe(&prepared, &fixture, "refuse");
        assert_eq!(security_bytes(&fixture.path), parent_before);
        assert_eq!(security_bytes(&fixture.root()), root_before);
        assert_eq!(fs::read(fixture.root().join("existing.txt")).unwrap(),
            b"must survive native refusal unchanged");
        let names: Vec<_> = fs::read_dir(fixture.root()).unwrap()
            .map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("existing.txt")]);
        assert!(!fixture.root().join("ownership-control.lock").exists());
        assert!(!fixture.root().join("workspace").exists());
    }

    #[test]
    fn actual_packaged_node_c_guard_accepts_existing_capability_acl_without_repair() {
        let fixture = Fixture::new();
        fixture.synthetic_capability_parent();
        fs::create_dir(fixture.root()).unwrap();
        fs::write(fixture.root().join("existing.txt"), b"must survive capability admission unchanged").unwrap();
        let parent_before = security_bytes(&fixture.path);
        let root_before = security_bytes(&fixture.root());
        let prepared = prepare(&fixture.root()).unwrap();
        assert_eq!(prepared.handoff().unwrap().origin, Origin::ExistingCandidate);
        run_packaged_native_probe(&prepared, &fixture, "accept");
        assert_eq!(security_bytes(&fixture.path), parent_before);
        assert_eq!(security_bytes(&fixture.root()), root_before);
        assert_eq!(fs::read(fixture.root().join("existing.txt")).unwrap(),
            b"must survive capability admission unchanged");
        let mut names: Vec<_> = fs::read_dir(fixture.root()).unwrap()
            .map(|entry| entry.unwrap().file_name()).collect();
        names.sort();
        assert_eq!(names, vec![std::ffi::OsString::from("existing.txt"), std::ffi::OsString::from("ownership-control.lock")]);
        assert!(!fixture.root().join("workspace").exists());
    }

    #[test]
    fn actual_native_lowercase_existing_leaf_preserves_binding_acl_and_js_handoff() {
        let fixture = Fixture::new();
        let lower_leaf = NAMESPACE_LEAF.to_ascii_lowercase();
        let lower_root = fixture.path.join(&lower_leaf);
        // Existing legacy-style root: inherit only this fresh fixture's user
        // ACE, rather than giving it the stricter new-root protected DACL.
        fs::create_dir(&lower_root).unwrap();
        fs::write(lower_root.join("existing.txt"), b"lowercase existing root survives unchanged").unwrap();
        let original = Directory::open_existing(&lower_root, None).unwrap().identity();
        let parent_before = security_bytes(&fixture.path);
        let root_before = security_bytes(&lower_root);
        // Bootstrap is given the normal product spelling, but canonicalization
        // must hand the child the existing object's actual lower-case spelling.
        let prepared = prepare(&fixture.root()).unwrap();
        let handoff = prepared.handoff().unwrap();
        assert_eq!(handoff.origin, Origin::ExistingCandidate);
        assert_eq!(handoff.identity, original);
        assert_eq!(handoff.root.file_name(), Some(OsStr::new(&lower_leaf)));
        assert_eq!(handoff.root, core_spelling(&fs::canonicalize(&lower_root).unwrap()).unwrap());
        run_packaged_native_probe(&prepared, &fixture, "accept-lowercase-handoff");
        assert_eq!(prepared.handoff().unwrap().identity, original);
        assert_eq!(security_bytes(&fixture.path), parent_before);
        assert_eq!(security_bytes(&lower_root), root_before);
        assert_eq!(fs::read(lower_root.join("existing.txt")).unwrap(),
            b"lowercase existing root survives unchanged");
        let mut names: Vec<_> = fs::read_dir(&lower_root).unwrap()
            .map(|entry| entry.unwrap().file_name()).collect();
        names.sort();
        assert_eq!(names, vec![std::ffi::OsString::from("existing.txt"),
            std::ffi::OsString::from("ownership-control.lock")]);
        assert_eq!(fs::metadata(lower_root.join("ownership-control.lock")).unwrap().len(), 0);
        assert!(!lower_root.join("workspace").exists());
    }

    #[test]
    fn synthetic_capability_parent_does_not_contaminate_new_private_root() {
        let fixture = Fixture::new();
        fixture.synthetic_capability_parent();
        let parent_before = security_bytes(&fixture.path);
        let prepared = prepare(&fixture.root()).unwrap();
        assert_eq!(prepared.handoff().unwrap().origin, Origin::Created);
        prepared.root.verify_controlled().unwrap();
        assert_eq!(security_bytes(&fixture.path), parent_before);
        assert_eq!(fs::read_dir(fixture.root()).unwrap().count(), 0);
        assert!(!fixture.root().join("workspace").exists());
        assert!(!fixture.root().join("ownership-control.lock").exists());
    }

    #[test]
    fn held_read_pin_is_compatible_with_the_c_guard_open_flags() {
        let fixture = Fixture::new();
        let prepared = prepare(&fixture.root()).unwrap();
        let handoff = prepared.handoff().unwrap();
        // Model the actual C CreateFileW access/sharing/flags, not an N-API
        // integration test. A retained DELETE creator makes this open fail.
        let c_root = OpenOptions::new()
            .access_mode(READ_CONTROL | 1)
            .share_mode(3)
            .custom_flags(BACKUP_NOFOLLOW)
            .open(handoff.root)
            .unwrap();
        assert!(c_root.metadata().unwrap().is_dir());
        assert_eq!(c_root.metadata().unwrap().file_attributes() & 0x400, 0);
        assert_eq!(handoff.identity, prepared.root.identity());
        assert!(Directory::open_existing(handoff.root, Some(handoff.identity)).is_ok());
        prepared.verify_binding().unwrap();
    }

    #[test]
    fn unsafe_existing_root_is_not_repaired_or_treated_as_new() {
        let fixture = Fixture::new();
        fixture.synthetic_capability_parent();
        fs::create_dir(fixture.root()).unwrap();
        fs::write(
            fixture.root().join("existing.txt"),
            b"must survive unchanged",
        )
        .unwrap();
        let before = security_bytes(&fixture.root());
        let original = Directory::open_existing(&fixture.root(), None)
            .unwrap()
            .identity();
        let prepared = prepare(&fixture.root()).unwrap();
        let handoff = prepared.handoff().unwrap();
        assert_eq!(handoff.origin, Origin::ExistingCandidate);
        assert_eq!(handoff.identity, original);
        // Rust must not silently grant this candidate the new-root ACL proof.
        // The unchanged native C guard must refuse it before workspace mkdir.
        assert!(prepared.root.verify_controlled().is_err());
        assert_eq!(security_bytes(&fixture.root()), before);
        assert_eq!(
            fs::read(fixture.root().join("existing.txt")).unwrap(),
            b"must survive unchanged"
        );
        assert!(!fixture.root().join("workspace").exists());
        assert!(!fixture.root().join("ownership-control.lock").exists());
    }

    #[test]
    fn inherited_current_user_only_existing_acl_is_not_subject_to_new_root_exact_policy() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.root()).unwrap();
        let before = security_bytes(&fixture.root());
        let prepared = prepare(&fixture.root()).unwrap();
        assert_eq!(
            prepared.handoff().unwrap().origin,
            Origin::ExistingCandidate
        );
        // An inherited (not protected) current-user ACE is allowed by C. The
        // exact protected one-ACE export preparation policy is stricter.
        assert!(prepared.root.verify_controlled().is_err());
        assert_eq!(security_bytes(&fixture.root()), before);
    }

    #[test]
    fn create_collision_is_an_error_without_adoption_or_acl_repair() {
        let fixture = Fixture::new();
        fixture.synthetic_capability_parent();
        let mut collision_acl = None;
        let result = prepare_impl(&fixture.root(), &mut |phase| {
            if phase == Checkpoint::ObservedAbsent {
                fs::create_dir(fixture.root())?;
                fs::write(fixture.root().join("winner.txt"), b"not ours")?;
                collision_acl = Some(security_bytes(&fixture.root()));
            }
            Ok(())
        });
        let error = match result {
            Ok(_) => panic!("an exclusive create collision was adopted"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(security_bytes(&fixture.root()), collision_acl.unwrap());
        assert_eq!(
            fs::read(fixture.root().join("winner.txt")).unwrap(),
            b"not ours"
        );
        assert!(!fixture.root().join("workspace").exists());
    }

    #[test]
    fn identity_race_is_blocked_during_creator_to_directory_pin_handoff() {
        let fixture = Fixture::new();
        let mut original = None;
        let prepared = prepare_impl(&fixture.root(), &mut |phase| {
            if phase == Checkpoint::CreatedBeforeDirectoryPin {
                original = Some(Directory::open_existing(&fixture.root(), None)?.identity());
                // Before an owning Directory exists, the native creator is
                // retained, has no DELETE access, and already pins the name.
                let c_root = OpenOptions::new()
                    .access_mode(READ_CONTROL | 1)
                    .share_mode(3)
                    .custom_flags(BACKUP_NOFOLLOW)
                    .open(fixture.root())?;
                assert!(c_root.metadata()?.is_dir());
                assert!(fs::rename(fixture.root(), fixture.path.join("displaced")).is_err());
                assert!(!fixture.path.join("displaced").exists());
            }
            Ok(())
        })
        .unwrap();
        assert_eq!(prepared.handoff().unwrap().identity, original.unwrap());
        prepared.verify_binding().unwrap();
        assert!(!fixture.root().join("workspace").exists());
    }

    #[test]
    fn failed_bootstrap_handoff_preserves_the_fresh_private_root_without_cleanup() {
        let fixture = Fixture::new();
        let result = prepare_impl(&fixture.root(), &mut |phase| {
            if phase == Checkpoint::CreatedBeforeDirectoryPin {
                return Err(io::Error::other("INJECTED_HANDOFF_FAILURE"));
            }
            Ok(())
        });
        assert!(result.is_err());
        Directory::open_existing(&fixture.root(), None)
            .unwrap()
            .verify_controlled()
            .unwrap();
        assert_eq!(fs::read_dir(fixture.root()).unwrap().count(), 0);
        assert_eq!(
            prepare(&fixture.root()).unwrap().handoff().unwrap().origin,
            Origin::ExistingCandidate
        );
    }

    #[test]
    fn retained_root_and_parent_pins_refuse_name_replacement() {
        let mut fixture = Fixture::new();
        let prepared = prepare(&fixture.root()).unwrap();
        drop(fixture.pin.take()); // Only PreparedNamespace now pins the parent.
        assert!(fs::rename(fixture.root(), fixture.path.join("moved-root")).is_err());
        let parent_replacement = fixture.path.with_file_name(format!(
            "{}-moved",
            fixture.path.file_name().unwrap().to_str().unwrap()
        ));
        assert!(fs::rename(&fixture.path, &parent_replacement).is_err());
        assert!(!parent_replacement.exists());
        prepared.verify_binding().unwrap();
    }

    #[test]
    fn root_junction_is_refused_without_touching_its_target() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.path.join("foreign")).unwrap();
        fs::write(fixture.path.join("foreign/sentinel.txt"), b"foreign").unwrap();
        let before = security_bytes(&fixture.path.join("foreign"));
        fixture.junction_to_foreign(NAMESPACE_LEAF);
        assert!(prepare(&fixture.root()).is_err());
        assert_eq!(security_bytes(&fixture.path.join("foreign")), before);
        assert_eq!(
            fs::read(fixture.path.join("foreign/sentinel.txt")).unwrap(),
            b"foreign"
        );
        assert!(!fixture.path.join("foreign/workspace").exists());
    }

    #[test]
    fn junction_parent_cannot_receive_a_missing_namespace() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.path.join("foreign")).unwrap();
        fixture.junction_to_foreign("alias");
        assert!(prepare(&fixture.path.join("alias").join(NAMESPACE_LEAF)).is_err());
        assert_eq!(
            fs::read_dir(fixture.path.join("foreign")).unwrap().count(),
            0
        );
    }

    #[test]
    fn file_leaf_and_missing_parent_are_not_absence_or_recursive_create() {
        let fixture = Fixture::new();
        fs::write(fixture.root(), b"existing file").unwrap();
        assert!(prepare(&fixture.root()).is_err());
        assert_eq!(fs::read(fixture.root()).unwrap(), b"existing file");
        assert!(prepare(&fixture.path.join("missing").join(NAMESPACE_LEAF)).is_err());
        assert!(!fixture.path.join("missing").exists());
        assert!(prepare(&fixture.path.join("another-product")).is_err());
        assert!(prepare(Path::new(NAMESPACE_LEAF)).is_err());
    }

    #[test]
    fn child_path_spelling_obeys_the_existing_c_path_contract_without_lossy_conversion() {
        assert_eq!(
            core_spelling(Path::new(r"\\?\C:\synthetic\SecureDataMsg-Standalone")).unwrap(),
            Path::new(r"C:\synthetic\SecureDataMsg-Standalone")
        );
        for path in [
            r"\\server\share\root",
            r"\\?\UNC\server\share\root",
            r"C:relative",
            r"C:\bad.\root",
            r"C:\bad \root",
            "C:\\bad\u{1f}\\root",
        ] {
            assert!(core_spelling(Path::new(path)).is_err(), "{path:?}");
        }
        use std::os::windows::ffi::OsStringExt;
        let unpaired = std::ffi::OsString::from_wide(&[67, 58, 92, 0xd800]);
        assert!(core_spelling(Path::new(&unpaired)).is_err());
        let too_deep = format!("C:\\{}root", "a\\".repeat(256));
        assert!(core_spelling(Path::new(&too_deep)).is_err());
    }
}
