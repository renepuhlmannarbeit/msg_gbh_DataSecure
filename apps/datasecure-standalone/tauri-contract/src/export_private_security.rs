//! Native permission proof for a newly created export preparation parent.
//! No permission repair, path-based chmod, impersonation, or admin escalation.
//! This excludes other ordinary accounts, not a hostile process with our UID,
//! the user's own privileges, or an administrator/root.
#![allow(dead_code)]
use std::{fs::File, io};
fn unsafe_permissions() -> io::Error { io::Error::other("EXPORT_PRIVATE_PERMISSIONS_UNSAFE") }

#[cfg(unix)]
pub(crate) fn verify_namespace_parent(file: &File) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.uid() != unsafe { libc::geteuid() } || metadata.mode() & 0o022 != 0 {
        return Err(unsafe_permissions());
    }
    #[cfg(target_os = "macos")]
    { darwin_acl(file, true) }
    #[cfg(not(target_os = "macos"))]
    { no_extended_acl(file) }
}

#[cfg(unix)]
pub(crate) fn verify_private(file: &File) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.uid() != unsafe { libc::geteuid() } || metadata.mode() & 0o7777 != 0o700 {
        return Err(unsafe_permissions());
    }
    no_extended_acl(file)
}

#[cfg(target_os = "linux")]
fn no_extended_acl(file: &File) -> io::Result<()> {
    use std::os::fd::AsRawFd;
    for name in [c"system.posix_acl_access", c"system.posix_acl_default"] {
        let result = unsafe { libc::fgetxattr(file.as_raw_fd(), name.as_ptr(), std::ptr::null_mut(), 0) };
        if result >= 0 { return Err(unsafe_permissions()); }
        let error = io::Error::last_os_error();
        if !matches!(error.raw_os_error(), Some(libc::ENODATA) | Some(libc::ENOTSUP)) { return Err(error); }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn no_extended_acl(file: &File) -> io::Result<()> {
    darwin_acl(file, false)
}

#[cfg(target_os = "macos")]
fn darwin_acl(file: &File, allow_parent_delete_protection: bool) -> io::Result<()> {
    use std::{ffi::c_void, os::fd::AsRawFd};
    extern "C" {
        fn filesec_init() -> *mut c_void;
        fn filesec_free(value: *mut c_void);
        fn filesec_query_property(value: *mut c_void, property: i32, valid: *mut i32) -> i32;
        fn filesec_get_property(value: *mut c_void, property: i32, result: *mut c_void) -> i32;
        // Same Darwin stat ABI as libc::fstat: Intel has an INODE64 alias;
        // Apple Silicon has only the 64-bit inode ABI.
        #[cfg_attr(not(target_arch = "aarch64"), link_name = "fstatx_np$INODE64")]
        fn fstatx_np(fd: i32, metadata: *mut libc::stat, security: *mut c_void) -> i32;
        fn acl_valid(acl: *mut c_void) -> i32;
        fn acl_get_entry(acl: *mut c_void, entry_id: i32, entry: *mut *mut c_void) -> i32;
        fn acl_free(value: *mut c_void) -> i32;
        fn acl_dup(acl: *mut c_void) -> *mut c_void;
        fn acl_get_tag_type(entry: *mut c_void, tag: *mut i32) -> i32;
        fn acl_get_permset_mask_np(entry: *mut c_void, mask: *mut u64) -> i32;
        fn acl_get_flagset_np(object: *mut c_void, flags: *mut *mut c_void) -> i32;
        fn acl_clear_flags_np(flags: *mut c_void) -> i32;
        fn acl_size(acl: *mut c_void) -> isize;
        fn acl_copy_ext(buffer: *mut c_void, acl: *mut c_void, size: isize) -> isize;
    }
    // Public namespace parents may have the usual deny-delete protection.
    // This is NOT an exception for a private child: those still require an
    // empty ACL. Require exactly one DENY DELETE and no ACL/entry flags.
    // Compare public-API serializations with a flag-cleared in-memory duplicate
    // to reject even unknown flag bits without depending on opaque ACL layout.
    // No filesystem ACL, mode, owner or principal is changed by this inspection.
    fn delete_protection_only(acl: *mut c_void, entry: *mut c_void) -> bool {
        let (mut tag, mut permissions) = (0, 0u64);
        if entry.is_null() || unsafe { acl_get_tag_type(entry, &mut tag) } != 0 ||
            unsafe { acl_get_permset_mask_np(entry, &mut permissions) } != 0 ||
            !darwin_delete_protection_entry(tag, permissions) { return false; }
        let mut next = std::ptr::null_mut();
        let lookup = unsafe { acl_get_entry(acl, -1, &mut next) }; // ACL_NEXT_ENTRY
        if !darwin_acl_empty(0, lookup, io::Error::last_os_error().raw_os_error(), next.is_null()) { return false; }
        let copy = unsafe { acl_dup(acl) };
        if copy.is_null() { return false; }
        let matches = (|| {
            let mut copied_entry = std::ptr::null_mut();
            if unsafe { acl_get_entry(copy, 0, &mut copied_entry) } != 0 || copied_entry.is_null() { return false; }
            for object in [copy, copied_entry] {
                let mut flags = std::ptr::null_mut();
                if unsafe { acl_get_flagset_np(object, &mut flags) } != 0 || flags.is_null() ||
                    unsafe { acl_clear_flags_np(flags) } != 0 { return false; }
            }
            let size = unsafe { acl_size(acl) };
            if !(1..=8192).contains(&size) || unsafe { acl_size(copy) } != size { return false; }
            let mut original = vec![0u8; size as usize];
            let mut cleared = vec![0u8; size as usize];
            (unsafe { acl_copy_ext(original.as_mut_ptr().cast(), acl, size) }) == size &&
                (unsafe { acl_copy_ext(cleared.as_mut_ptr().cast(), copy, size) }) == size && original == cleared
        })();
        let freed = unsafe { acl_free(copy) };
        matches && freed == 0
    }
    struct Security(*mut c_void);
    impl Drop for Security { fn drop(&mut self) { unsafe { filesec_free(self.0); } } }
    let allocation = unsafe { filesec_init() };
    if allocation.is_null() { return Err(io::Error::last_os_error()); }
    let security = Security(allocation);
    let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe { fstatx_np(file.as_raw_fd(), metadata.as_mut_ptr(), security.0) } != 0 {
        return Err(io::Error::last_os_error());
    }
    let mut present = -1;
    if unsafe { filesec_query_property(security.0, 5, &mut present) } != 0 { // FILESEC_ACL
        return Err(io::Error::last_os_error());
    }
    // Positive absence from a successful, held-fd snapshot; never interpret
    // NULL/ENOENT/EINVAL from an unsuccessful ACL lookup as permission proof.
    if present == 0 { return Ok(()); }
    if present < 0 { return Err(unsafe_permissions()); }
    let mut acl: *mut c_void = std::ptr::null_mut();
    if unsafe { filesec_get_property(security.0, 5, (&mut acl as *mut *mut c_void).cast()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if acl.is_null() || acl as usize == 1 { return Err(unsafe_permissions()); }
    let valid = unsafe { acl_valid(acl) };
    let mut entry = std::ptr::null_mut();
    let result = if valid == 0 { unsafe { acl_get_entry(acl, 0, &mut entry) } } else { -2 }; // ACL_FIRST_ENTRY
    let error = io::Error::last_os_error().raw_os_error();
    // Darwin differs from Linux: zero means an entry WAS FOUND. A valid
    // fd-derived ACL with FIRST_ENTRY == -1/EINVAL and no entry is empty.
    // The validity proof precedes lookup so an invalid ACL is not accepted as
    // empty just because it also reports EINVAL. Only a namespace parent has
    // the narrow, non-inheriting deny-delete exception; private children do not.
    let accepted = darwin_acl_empty(valid, result, error, entry.is_null()) ||
        allow_parent_delete_protection && valid == 0 && result == 0 &&
        delete_protection_only(acl, entry);
    let freed = unsafe { acl_free(acl) };
    if freed != 0 || !accepted { return Err(unsafe_permissions()); }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn darwin_acl_empty(valid: i32, lookup: i32, error: Option<i32>, entry_null: bool) -> bool {
    valid == 0 && lookup == -1 && error == Some(22) && entry_null // Darwin EINVAL
}

#[cfg(any(target_os = "macos", test))]
fn darwin_delete_protection_entry(tag: i32, permissions: u64) -> bool {
    tag == 2 && permissions == 1 << 4 // ACL_EXTENDED_DENY, ACL_DELETE
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn darwin_acl_return_contract_never_treats_a_found_entry_as_empty() {
        assert!(darwin_acl_empty(0, -1, Some(22), true));
        for (valid, lookup, error, entry_null) in [
            (0, 0, Some(22), false), (0, 0, None, false), (0, 0, None, true),
            (-1, -1, Some(22), true), (0, -1, Some(5), true), (0, -1, None, true),
            (0, -1, Some(22), false), (0, 1, None, true),
        ] { assert!(!darwin_acl_empty(valid, lookup, error, entry_null)); }
    }
    #[test]
    fn parent_delete_protection_never_accepts_grants_or_additional_rights() {
        assert!(darwin_delete_protection_entry(2, 16));
        for (tag, rights) in [(1, 16), (0, 16), (3, 16), (2, 0), (2, 2),
            (2, 16 | 4), (2, 16 | 32), (2, 16 | 64), (2, u64::MAX)] {
            assert!(!darwin_delete_protection_entry(tag, rights));
        }
    }
}

#[cfg(all(target_os = "macos", test))]
mod native_macos_tests {
    use super::*;
    use std::{ffi::c_void, fs, os::{fd::AsRawFd, unix::fs::DirBuilderExt}, path::PathBuf};
    extern "C" {
        fn acl_init(count: i32) -> *mut c_void;
        fn acl_create_entry(acl: *mut *mut c_void, entry: *mut *mut c_void) -> i32;
        fn acl_set_tag_type(entry: *mut c_void, kind: i32) -> i32;
        fn acl_set_qualifier(entry: *mut c_void, qualifier: *const c_void) -> i32;
        fn acl_get_permset(entry: *mut c_void, perms: *mut *mut c_void) -> i32;
        fn acl_add_perm(perms: *mut c_void, permission: i32) -> i32;
        fn acl_get_flagset_np(entry: *mut c_void, flags: *mut *mut c_void) -> i32;
        fn acl_add_flag_np(flags: *mut c_void, flag: i32) -> i32;
        fn acl_set_fd_np(fd: i32, acl: *mut c_void, kind: i32) -> i32;
        fn acl_free(value: *mut c_void) -> i32;
        fn mbr_uid_to_uuid(uid: u32, uuid: *mut u8) -> i32;
    }
    struct Fixture { path: PathBuf, file: File }
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("datasecure-native-acl-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
            Self { file: File::open(&path).unwrap(), path }
        }
        fn acl(&self, entry_kind: Option<(i32, i32)>) {
            self.acl_with_permission(entry_kind, 2); // READ_DATA / LIST_DIRECTORY
        }
        fn acl_with_permission(&self, entry_kind: Option<(i32, i32)>, permission: i32) {
            struct Acl(*mut c_void);
            impl Drop for Acl { fn drop(&mut self) { assert_eq!(unsafe { acl_free(self.0) }, 0); } }
            let mut acl = Acl(unsafe { acl_init(1) }); assert!(!acl.0.is_null());
            if let Some((kind, flags)) = entry_kind {
                let mut entry = std::ptr::null_mut();
                assert_eq!(unsafe { acl_create_entry(&mut acl.0, &mut entry) }, 0);
                let mut uuid = [0u8; 16];
                assert_eq!(unsafe { mbr_uid_to_uuid(libc::geteuid(), uuid.as_mut_ptr()) }, 0);
                assert_eq!(unsafe { acl_set_tag_type(entry, kind) }, 0);
                assert_eq!(unsafe { acl_set_qualifier(entry, uuid.as_ptr().cast()) }, 0);
                let mut perms = std::ptr::null_mut();
                assert_eq!(unsafe { acl_get_permset(entry, &mut perms) }, 0);
                assert_eq!(unsafe { acl_add_perm(perms, permission) }, 0);
                if flags != 0 {
                    let mut flagset = std::ptr::null_mut();
                    assert_eq!(unsafe { acl_get_flagset_np(entry, &mut flagset) }, 0);
                    assert_eq!(unsafe { acl_add_flag_np(flagset, flags) }, 0);
                }
            }
            assert_eq!(unsafe { acl_set_fd_np(self.file.as_raw_fd(), acl.0, 0x100) }, 0);
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert_eq!(self.path.parent().unwrap(), std::env::temp_dir());
            assert!(self.path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-native-acl-"));
            assert!(fs::symlink_metadata(&self.path).unwrap().is_dir());
            assert!(!fs::symlink_metadata(&self.path).unwrap().file_type().is_symlink());
            assert_eq!(fs::read_dir(&self.path).unwrap().count(), 0);
            self.acl(None); // Only this exclusive synthetic fixture, through its held fd.
            fs::remove_dir(&self.path).unwrap();
        }
    }
    #[test]
    fn actual_darwin_fresh_directory_without_any_set_acl_is_accepted() {
        let fixture = Fixture::new();
        verify_private(&fixture.file).unwrap(); verify_namespace_parent(&fixture.file).unwrap();
    }
    #[test]
    fn actual_darwin_empty_acl_is_accepted_and_every_found_entry_is_refused() {
        let fixture = Fixture::new();
        fixture.acl(None);
        verify_private(&fixture.file).unwrap(); verify_namespace_parent(&fixture.file).unwrap();
        for (kind, flags) in [(1, 0), (2, 0), (1, 16), (2, 16), (1, 32 | 64), (2, 32 | 64)] {
            fixture.acl(Some((kind, flags)));
            assert!(verify_private(&fixture.file).is_err(), "kind={kind}, flags={flags}");
            assert!(verify_namespace_parent(&fixture.file).is_err());
        }
        fixture.acl(None);
        verify_private(&fixture.file).unwrap();
    }
    #[test]
    fn actual_darwin_noninheriting_delete_protection_allows_parent_but_not_private_leaf() {
        let fixture = Fixture::new();
        fixture.acl_with_permission(Some((2, 0)), 16); // ACL_EXTENDED_DENY / ACL_DELETE
        verify_namespace_parent(&fixture.file).unwrap();
        assert!(verify_private(&fixture.file).is_err());
        let parent = crate::export_directory::Directory::open_existing(&fixture.path, None).unwrap();
        let child = parent.create_controlled_child("private-child").unwrap();
        child.verify_controlled().unwrap();
        drop(child);
        fs::remove_dir(fixture.path.join("private-child")).unwrap();
    }
    #[test]
    fn actual_darwin_delete_protection_with_inheritance_still_refuses_before_mkdir() {
        let fixture = Fixture::new();
        for flags in [16, 32, 64, 128, 256, 32 | 64] {
            fixture.acl_with_permission(Some((2, flags)), 16);
            assert!(verify_namespace_parent(&fixture.file).is_err());
            let parent = crate::export_directory::Directory::open_existing(&fixture.path, None).unwrap();
            assert!(parent.create_controlled_child("must-not-exist").is_err());
            assert!(!fixture.path.join("must-not-exist").exists());
        }
    }
    #[test]
    fn actual_darwin_inheritable_parent_acl_refuses_provisioning_before_mkdir() {
        let fixture = Fixture::new(); fixture.acl(Some((1, 32 | 64)));
        let parent = crate::export_directory::Directory::open_existing(&fixture.path, None).unwrap();
        assert!(parent.create_controlled_child("must-not-exist").is_err());
        assert!(!fixture.path.join("must-not-exist").exists());
    }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::{ffi::c_void, os::windows::io::AsRawHandle};
    type Handle = *mut c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn CloseHandle(handle: Handle) -> i32;
        fn LocalFree(value: Handle) -> Handle;
    }
    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(process: Handle, access: u32, token: *mut Handle) -> i32;
        fn GetTokenInformation(token: Handle, class: u32, buffer: Handle, length: u32, needed: *mut u32) -> i32;
        fn ConvertSidToStringSidW(sid: Handle, value: *mut *mut u16) -> i32;
        fn ConvertStringSecurityDescriptorToSecurityDescriptorW(value: *const u16, revision: u32, descriptor: *mut Handle, length: *mut u32) -> i32;
        fn GetSecurityInfo(handle: Handle, kind: u32, flags: u32, owner: *mut Handle, group: *mut Handle,
            dacl: *mut Handle, sacl: *mut Handle, descriptor: *mut Handle) -> u32;
        fn GetSecurityDescriptorControl(descriptor: Handle, control: *mut u16, revision: *mut u32) -> i32;
        fn GetAclInformation(acl: Handle, buffer: Handle, bytes: u32, class: u32) -> i32;
        fn GetAce(acl: Handle, index: u32, ace: *mut Handle) -> i32;
        fn EqualSid(first: Handle, second: Handle) -> i32;
        fn IsValidSid(sid: Handle) -> i32;
        fn GetLengthSid(sid: Handle) -> u32;
    }
    #[cfg(test)]
    #[link(name = "advapi32")]
    extern "system" {
        fn GetSecurityDescriptorDacl(descriptor: Handle, present: *mut i32, acl: *mut Handle, defaulted: *mut i32) -> i32;
        fn SetSecurityInfo(handle: Handle, kind: u32, flags: u32, owner: Handle, group: Handle, dacl: Handle, sacl: Handle) -> u32;
    }
    struct Token(Handle);
    impl Drop for Token { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
    pub(crate) struct Descriptor(Handle);
    impl Drop for Descriptor { fn drop(&mut self) { unsafe { LocalFree(self.0); } } }
    impl Descriptor { pub fn as_ptr(&self) -> Handle { self.0 } }
    #[repr(C)] struct TokenUser { sid: Handle, attributes: u32 }
    struct User { _buffer: Vec<u64>, sid: Handle }
    fn current_user() -> io::Result<User> {
        let mut handle = std::ptr::null_mut();
        if unsafe { OpenProcessToken(GetCurrentProcess(), 8, &mut handle) } == 0 { return Err(io::Error::last_os_error()); }
        let token = Token(handle); let mut needed = 0;
        let probe = unsafe { GetTokenInformation(token.0, 1, std::ptr::null_mut(), 0, &mut needed) };
        if probe != 0 || io::Error::last_os_error().raw_os_error() != Some(122) || !(16..=4096).contains(&needed) { return Err(unsafe_permissions()); }
        // TOKEN_USER contains a pointer; keep its backing allocation aligned
        // and alive until all SID consumers have finished.
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
        let capacity = (buffer.len() * 8) as u32;
        if unsafe { GetTokenInformation(token.0, 1, buffer.as_mut_ptr().cast(), capacity, &mut needed) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if needed > capacity { return Err(unsafe_permissions()); }
        let sid = unsafe { (*(buffer.as_ptr().cast::<TokenUser>())).sid };
        if sid.is_null() || unsafe { IsValidSid(sid) } == 0 { return Err(unsafe_permissions()); }
        Ok(User { _buffer: buffer, sid })
    }
    pub fn private_descriptor() -> io::Result<Descriptor> {
        let user = current_user()?; let mut value = std::ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(user.sid, &mut value) } == 0 { return Err(io::Error::last_os_error()); }
        let allocation = Descriptor(value.cast());
        let mut length = 0;
        while length < 184 && unsafe { *value.add(length) } != 0 { length += 1; }
        if length == 184 { return Err(unsafe_permissions()); }
        let sid = String::from_utf16(unsafe { std::slice::from_raw_parts(value, length) }).map_err(|_| unsafe_permissions())?;
        drop(allocation);
        // Protected DACL: no inherited broad access; the sole current account
        // gets full access, inherited by files and directories inside it.
        let sddl: Vec<u16> = format!("O:{sid}D:P(A;OICI;FA;;;{sid})").encode_utf16().chain([0]).collect();
        let mut descriptor = std::ptr::null_mut();
        if unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), 1, &mut descriptor, std::ptr::null_mut()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if descriptor.is_null() { return Err(unsafe_permissions()); }
        Ok(Descriptor(descriptor))
    }
    #[repr(C)] struct AclSize { count: u32, used: u32, free: u32 }
    pub fn verify_private(file: &File) -> io::Result<()> {
        let user = current_user()?;
        let (mut owner, mut dacl, mut descriptor) = (std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
        let result = unsafe { GetSecurityInfo(file.as_raw_handle(), 1, 1 | 4, &mut owner, std::ptr::null_mut(),
            &mut dacl, std::ptr::null_mut(), &mut descriptor) };
        if result != 0 { return Err(io::Error::from_raw_os_error(result as i32)); }
        let descriptor = Descriptor(descriptor);
        if descriptor.0.is_null() || owner.is_null() || dacl.is_null() || unsafe { EqualSid(owner, user.sid) } == 0 {
            return Err(unsafe_permissions());
        }
        let (mut control, mut revision) = (0, 0);
        if unsafe { GetSecurityDescriptorControl(descriptor.0, &mut control, &mut revision) } == 0 || control & 0x1000 == 0 {
            return Err(unsafe_permissions());
        }
        let mut size = AclSize { count: 0, used: 0, free: 0 };
        if unsafe { GetAclInformation(dacl, (&mut size as *mut AclSize).cast(), std::mem::size_of::<AclSize>() as u32, 2) } == 0 || size.count != 1 {
            return Err(unsafe_permissions());
        }
        let mut ace = std::ptr::null_mut();
        if unsafe { GetAce(dacl, 0, &mut ace) } == 0 || ace.is_null() { return Err(unsafe_permissions()); }
        let header = unsafe { std::slice::from_raw_parts(ace.cast::<u8>(), 8) };
        let bytes = u16::from_le_bytes([header[2], header[3]]) as usize;
        if header[0] != 0 || header[1] != 3 || bytes < 16 || bytes as u32 > size.used ||
            u32::from_le_bytes(header[4..8].try_into().map_err(|_| unsafe_permissions())?) != 0x001f_01ff {
            return Err(unsafe_permissions());
        }
        let sid = unsafe { ace.cast::<u8>().add(8) }.cast();
        if unsafe { IsValidSid(sid) } == 0 || unsafe { GetLengthSid(sid) } as usize != bytes - 8 ||
            unsafe { EqualSid(sid, user.sid) } == 0 { return Err(unsafe_permissions()); }
        Ok(())
    }
    #[cfg(test)]
    pub fn broaden_test_directory(file: &File) -> io::Result<()> {
        let text: Vec<u16> = "D:P(A;OICI;FA;;;WD)".encode_utf16().chain([0]).collect();
        let mut descriptor = std::ptr::null_mut();
        if unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(text.as_ptr(), 1, &mut descriptor, std::ptr::null_mut()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let descriptor = Descriptor(descriptor);
        let (mut present, mut defaulted, mut dacl) = (0, 0, std::ptr::null_mut());
        if unsafe { GetSecurityDescriptorDacl(descriptor.0, &mut present, &mut dacl, &mut defaulted) } == 0 || present == 0 || dacl.is_null() {
            return Err(unsafe_permissions());
        }
        let result = unsafe { SetSecurityInfo(file.as_raw_handle(), 1, 4 | 0x8000_0000, std::ptr::null_mut(), std::ptr::null_mut(), dacl, std::ptr::null_mut()) };
        if result != 0 { return Err(io::Error::from_raw_os_error(result as i32)); }
        Ok(())
    }
}
#[cfg(windows)]
pub(crate) use windows::{private_descriptor, verify_private};
#[cfg(all(windows, test))]
pub(crate) use windows::broaden_test_directory;
