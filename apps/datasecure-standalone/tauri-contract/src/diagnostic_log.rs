//! Best-effort content-free diagnostic sink. Every written file is created
//! exclusively by this process and remains open. No reopen, truncate, rename
//! or deletion; namespace traversal is relative to held directory handles.
use std::{fs::File, io::{self, Write}, path::Path, sync::Mutex};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
type Identity = (u64, u128);
struct Sink { file: File, directory: platform::Directory, identity: Identity, bytes: u64 }
enum State { Initial, Ready(Sink), Disabled }
static STATE: Mutex<State> = Mutex::new(State::Initial);
fn unsafe_io() -> io::Error { io::Error::other("DIAGNOSTIC_IO_UNSAFE") }

fn create(directory: &Path) -> io::Result<Sink> {
    let directory = platform::directory(directory)?;
    let file = match platform::create(&directory, "desktop-interactions.jsonl") {
        Ok(file) => file,
        Err(_) => {
            // A collision never grants permission to append to an existing
            // object. This alternative is also atomically create-if-absent.
            let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| unsafe_io())?.as_nanos();
            platform::create(&directory, &format!("desktop-interactions.{}.{nanos:032x}.jsonl", std::process::id()))?
        }
    };
    let identity = platform::identity(&file)?;
    if file.metadata()?.len() != 0 { return Err(unsafe_io()); }
    Ok(Sink { file, directory, identity, bytes: 0 })
}

pub fn append(directory: &Path, record: &serde_json::Value) {
    let Ok(mut state) = STATE.lock() else { return };
    if matches!(*state, State::Initial) {
        *state = match create(directory) { Ok(sink) => State::Ready(sink), Err(_) => State::Disabled };
    }
    let State::Ready(sink) = &mut *state else { return };
    let line = format!("{record}\n");
    let result = (|| -> io::Result<()> {
        let total = sink.bytes.checked_add(line.len() as u64).ok_or_else(unsafe_io)?;
        if total > MAX_BYTES || platform::identity(&sink.file)? != sink.identity ||
            sink.file.metadata()?.len() != sink.bytes { return Err(unsafe_io()); }
        platform::check_directory(&sink.directory)?;
        sink.file.write_all(line.as_bytes())?;
        if platform::identity(&sink.file)? != sink.identity || sink.file.metadata()?.len() != total {
            return Err(unsafe_io());
        }
        sink.bytes = total;
        Ok(())
    })();
    if result.is_err() { *state = State::Disabled; }
}

#[cfg(unix)]
mod platform {
    use super::*;
    use std::{ffi::CString, os::unix::{ffi::OsStrExt, fs::MetadataExt, io::{AsRawFd, FromRawFd}}, path::{Component, PathBuf}};
    #[cfg(target_os = "macos")]
    type Mode = u16;
    #[cfg(not(target_os = "macos"))]
    type Mode = u32;
    extern "C" { fn openat(fd: i32, name: *const i8, flags: i32, ...) -> i32; fn mkdirat(fd: i32, name: *const i8, mode: Mode) -> i32; }
    #[cfg(target_os = "macos")]
    const DIRECTORY: i32 = 0x0010_0000;
    #[cfg(target_os = "macos")]
    const NOFOLLOW: i32 = 0x100;
    #[cfg(target_os = "macos")]
    const CLOEXEC: i32 = 0x0100_0000;
    #[cfg(target_os = "macos")]
    const NEW_APPEND: i32 = 1 | 8 | 0x200 | 0x800;
    #[cfg(not(target_os = "macos"))]
    const DIRECTORY: i32 = 0x1_0000;
    #[cfg(not(target_os = "macos"))]
    const NOFOLLOW: i32 = 0x2_0000;
    #[cfg(not(target_os = "macos"))]
    const CLOEXEC: i32 = 0x8_0000;
    #[cfg(not(target_os = "macos"))]
    const NEW_APPEND: i32 = 1 | 0x400 | 0x40 | 0x80;
    pub struct Directory { file: File }
    fn opened(fd: i32) -> io::Result<File> {
        if fd < 0 { Err(unsafe_io()) } else { Ok(unsafe { File::from_raw_fd(fd) }) }
    }
    pub fn directory(path: &Path) -> io::Result<Directory> {
        let mut normalized = PathBuf::from(path);
        #[cfg(target_os = "macos")]
        for alias in ["/var", "/tmp", "/etc"] {
            if let Ok(rest) = path.strip_prefix(alias) { normalized = PathBuf::from(format!("/private{alias}")).join(rest); break; }
        }
        if !normalized.is_absolute() { return Err(unsafe_io()); }
        let mut file = File::open("/")?;
        for component in normalized.components() {
            let name = match component { Component::RootDir => continue, Component::Normal(name) => name, _ => return Err(unsafe_io()) };
            let name = CString::new(name.as_bytes()).map_err(|_| unsafe_io())?;
            let flags = DIRECTORY | NOFOLLOW | CLOEXEC;
            let mut fd = unsafe { openat(file.as_raw_fd(), name.as_ptr(), flags) };
            if fd < 0 && io::Error::last_os_error().kind() == io::ErrorKind::NotFound {
                if unsafe { mkdirat(file.as_raw_fd(), name.as_ptr(), 0o700) } != 0 &&
                    io::Error::last_os_error().kind() != io::ErrorKind::AlreadyExists { return Err(unsafe_io()); }
                fd = unsafe { openat(file.as_raw_fd(), name.as_ptr(), flags) };
            }
            file = opened(fd)?;
            if !file.metadata()?.is_dir() { return Err(unsafe_io()); }
        }
        Ok(Directory { file })
    }
    pub fn check_directory(directory: &Directory) -> io::Result<()> {
        if directory.file.metadata()?.is_dir() { Ok(()) } else { Err(unsafe_io()) }
    }
    pub fn create(directory: &Directory, name: &str) -> io::Result<File> {
        let name = CString::new(name).map_err(|_| unsafe_io())?;
        opened(unsafe { openat(directory.file.as_raw_fd(), name.as_ptr(), NEW_APPEND | NOFOLLOW | CLOEXEC, 0o600u32) })
    }
    pub fn identity(file: &File) -> io::Result<Identity> {
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.nlink() != 1 { return Err(unsafe_io()); }
        Ok((metadata.dev(), metadata.ino() as u128))
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
    #[link(name = "ntdll")]
    extern "system" { fn NtCreateFile(file: *mut Handle, access: u32, attributes: *mut ObjectAttributes,
        status: *mut IoStatus, allocation: *const i64, file_attributes: u32, sharing: u32,
        disposition: u32, options: u32, ea: Handle, ea_length: u32) -> i32; }
    #[link(name = "kernel32")]
    extern "system" { fn GetFileInformationByHandle(file: Handle, info: *mut FileInfo) -> i32;
        fn GetFileInformationByHandleEx(file: Handle, class: u32, info: Handle, bytes: u32) -> i32; }
    pub struct Directory { file: File, _parents: Vec<File> }
    fn plain_directory(file: &File) -> io::Result<()> {
        let metadata = file.metadata()?;
        if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 { return Err(unsafe_io()); }
        Ok(())
    }
    fn relative(parent: &File, name: &std::ffi::OsStr, is_directory: bool) -> io::Result<File> {
        let mut wide: Vec<u16> = name.encode_wide().collect();
        if wide.is_empty() || wide.len() > 32767 || wide.iter().any(|c| [0, 47, 58, 92].contains(c)) { return Err(unsafe_io()); }
        let mut text = UnicodeString { length: (wide.len() * 2) as u16, maximum_length: (wide.len() * 2) as u16, buffer: wide.as_mut_ptr() };
        let mut attributes = ObjectAttributes { length: std::mem::size_of::<ObjectAttributes>() as u32,
            root: parent.as_raw_handle(), name: &mut text, attributes: 0x40 | 0x1000,
            security: std::ptr::null_mut(), quality: std::ptr::null_mut() };
        let mut status = IoStatus { status: 0, information: 0 };
        let mut handle: Handle = std::ptr::null_mut();
        // FILE_OPEN_IF for a directory; FILE_CREATE for a new file. Do not
        // traverse a reparse point, even in the still-empty final directory.
        let result = unsafe { NtCreateFile(&mut handle, 0x0010_0080 | if is_directory { 1 } else { 4 },
            &mut attributes, &mut status, std::ptr::null(), 0x80,
            if is_directory { 3 } else { 1 }, if is_directory { 3 } else { 2 },
            0x20 | 0x0020_0000 | if is_directory { 1 } else { 0x40 }, std::ptr::null_mut(), 0) };
        if result < 0 || handle.is_null() { return Err(unsafe_io()); }
        Ok(unsafe { File::from_raw_handle(handle) })
    }
    pub fn directory(path: &Path) -> io::Result<Directory> {
        let mut components = path.components();
        let prefix = match components.next() { Some(Component::Prefix(p)) => match p.kind() {
            Prefix::Disk(disk) => disk, Prefix::VerbatimDisk(disk) => disk, _ => return Err(unsafe_io()) }, _ => return Err(unsafe_io()) };
        if !matches!(components.next(), Some(Component::RootDir)) { return Err(unsafe_io()); }
        let root = PathBuf::from(format!("{}:\\", prefix as char));
        let mut file = OpenOptions::new().read(true).share_mode(3).custom_flags(0x0200_0000 | 0x0020_0000).open(root)?;
        plain_directory(&file)?;
        let mut parents = Vec::new();
        for component in components {
            let Component::Normal(name) = component else { return Err(unsafe_io()) };
            let child = relative(&file, name, true)?;
            plain_directory(&child)?;
            parents.push(file);
            file = child;
        }
        Ok(Directory { file, _parents: parents })
    }
    pub fn check_directory(directory: &Directory) -> io::Result<()> { plain_directory(&directory.file) }
    pub fn create(directory: &Directory, name: &str) -> io::Result<File> { relative(&directory.file, std::ffi::OsStr::new(name), false) }
    pub fn identity(file: &File) -> io::Result<Identity> {
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 { return Err(unsafe_io()); }
        let mut info = FileInfo { attributes: 0, times: [0; 6], volume: 0, size: [0; 2], links: 0, index: [0; 2] };
        let mut id = FileId { volume: 0, id: [0; 16] };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 || info.links != 1 ||
            unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), 18, (&mut id as *mut FileId).cast(), std::mem::size_of::<FileId>() as u32) } == 0 {
            return Err(unsafe_io());
        }
        Ok((id.volume, u128::from_le_bytes(id.id)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_nested_sink_writes_a_readable_first_record() {
        let base = std::env::temp_dir();
        let root = base.join(format!(".tmp-standalone-native-{:032x}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let directory = root.join("temp/SecureDataMsg-Standalone");
        std::fs::create_dir_all(&directory).unwrap();
        platform::directory(&directory).unwrap();
        append(&directory, &serde_json::json!({ "event": "application_started" }));
        assert_eq!(std::fs::read(directory.join("desktop-interactions.jsonl")).unwrap(), b"{\"event\":\"application_started\"}\n");
        *STATE.lock().unwrap() = State::Initial;
        assert!(root.file_name().unwrap().to_string_lossy().starts_with(".tmp-standalone-native-"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn exclusive_sink_preserves_existing_log_and_archive() {
        let directory = std::env::temp_dir().join(format!("datasecure-diagnostic-test-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(directory.join("desktop-interactions.jsonl"), b"sentinel").unwrap();
        std::fs::write(directory.join("desktop-interactions.previous.jsonl"), b"archive").unwrap();
        let mut sink = create(&directory).unwrap();
        assert_eq!(std::fs::read(directory.join("desktop-interactions.jsonl")).unwrap(), b"sentinel");
        sink.file.write_all(b"test\n").unwrap();
        let own_names: Vec<_> = std::fs::read_dir(&directory).unwrap().map(|entry| entry.unwrap().path())
            .filter(|path| path.file_name().unwrap().to_string_lossy().starts_with("desktop-interactions.") &&
                path.file_name().unwrap() != "desktop-interactions.jsonl" &&
                path.file_name().unwrap() != "desktop-interactions.previous.jsonl").collect();
        // Directory enumeration order is unspecified, especially on APFS.
        // Neither the original log nor its archive is the exclusive segment.
        assert_eq!(own_names.len(), 1);
        let own_name = &own_names[0];
        // Real diagnostic readers must be able to inspect the held segment.
        assert_eq!(std::fs::read(own_name).unwrap(), b"test\n");
        assert_eq!(platform::identity(&File::open(own_name).unwrap()).unwrap(), sink.identity);
        assert_eq!(platform::identity(&sink.file).unwrap(), sink.identity);
        assert_eq!(std::fs::read(directory.join("desktop-interactions.previous.jsonl")).unwrap(), b"archive");
        drop(sink);
        // The exact freshly-created test directory is never linked to user data.
        assert!(directory.file_name().unwrap().to_string_lossy().starts_with("datasecure-diagnostic-test-"));
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn prepared_hardlink_is_never_opened_for_append() {
        let root = std::env::temp_dir().join(format!("datasecure-diagnostic-hardlink-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let foreign = root.join("foreign");
        std::fs::write(&foreign, b"foreign sentinel").unwrap();
        std::fs::hard_link(&foreign, root.join("desktop-interactions.jsonl")).unwrap();
        let mut sink = create(&root).unwrap();
        sink.file.write_all(b"own\n").unwrap();
        assert_eq!(std::fs::read(&foreign).unwrap(), b"foreign sentinel");
        drop(sink);
        assert!(root.file_name().unwrap().to_string_lossy().starts_with("datasecure-diagnostic-hardlink-"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn higher_linked_ancestor_cannot_create_missing_descendants() {
        let root = std::env::temp_dir().join(format!("datasecure-diagnostic-link-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let foreign = root.join("foreign");
        let alias = root.join("alias");
        std::fs::create_dir(&foreign).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&foreign, &alias).unwrap();
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // Node junction creation needs no symlink privilege. Only this
            // generated test root is named; the command uses no shell.
            let result = std::process::Command::new("node").args(["-e",
                "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')"])
                .arg(&foreign).arg(&alias).creation_flags(0x0800_0000).status().unwrap();
            assert!(result.success());
        }
        assert!(create(&alias.join("missing").join("nested")).is_err());
        assert_eq!(std::fs::read_dir(&foreign).unwrap().count(), 0);
        assert_eq!(std::fs::read_link(&alias).unwrap(), foreign);
        #[cfg(windows)]
        std::fs::remove_dir(&alias).unwrap();
        #[cfg(unix)]
        std::fs::remove_file(&alias).unwrap();
        assert!(root.file_name().unwrap().to_string_lossy().starts_with("datasecure-diagnostic-link-"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
