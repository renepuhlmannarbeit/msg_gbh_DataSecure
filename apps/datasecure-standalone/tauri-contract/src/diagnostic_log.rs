//! Best-effort content-free diagnostic sink. Every written file is created
//! exclusively by this process and remains open. No reopen, truncate, rename
//! or deletion; namespace traversal is relative to held directory handles.
use std::{fs::File, io::{self, Write}, path::{Path, PathBuf}, sync::{Arc, Mutex, OnceLock,
    atomic::{AtomicU8, AtomicU64, Ordering}, mpsc::{self, SyncSender, TrySendError}}};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SEGMENTS: u8 = 8;
type Identity = (u64, u128);
struct Sink { file: File, name: String, directory: platform::Directory, identity: Identity, bytes: u64, segments: u8 }
enum State { Initial, Ready(Sink), Disabled }
const QUEUE_CAPACITY: usize = 256;
const MAX_RECORD_BYTES: usize = 4096;
#[derive(Default)]
struct Metrics {
    status: AtomicU8, pending: AtomicU64, dropped: AtomicU64, written: AtomicU64,
    // This mutex protects only a tiny in-memory leaf, never any disk operation.
    segment: Mutex<Option<String>>,
}
impl Metrics {
    fn status(&self) -> &'static str {
        match self.status.load(Ordering::Acquire) { 1 => "ready", 2 => "unavailable", _ => "not_started" }
    }
    fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({ "status": self.status(),
            "pending_records": self.pending.load(Ordering::Acquire),
            "dropped_records": self.dropped.load(Ordering::Acquire),
            "written_records": self.written.load(Ordering::Acquire) })
    }
}
struct Entry { directory: PathBuf, line: String }
struct Writer { queue: SyncSender<Entry>, metrics: Arc<Metrics> }
static WRITER: OnceLock<Writer> = OnceLock::new();
static SIDECAR_GENERATIONS: Mutex<Vec<String>> = Mutex::new(Vec::new());
fn unsafe_io() -> io::Error { io::Error::other("DIAGNOSTIC_IO_UNSAFE") }

impl Writer {
    fn start(mut write: impl FnMut(&Path, &str) -> io::Result<String> + Send + 'static)
        -> (Self, io::Result<std::thread::JoinHandle<()>>) {
        let (queue, receiver) = mpsc::sync_channel::<Entry>(QUEUE_CAPACITY);
        let metrics = Arc::new(Metrics::default()); let worker = Arc::clone(&metrics);
        let thread = std::thread::Builder::new().name("datasecure-diagnostic-writer".into()).spawn(move || {
            while let Ok(entry) = receiver.recv() {
                if worker.status.load(Ordering::Acquire) == 2 {
                    worker.dropped.fetch_add(1, Ordering::Relaxed);
                } else {
                    match write(&entry.directory, &entry.line) {
                        Ok(name) => {
                            if let Ok(mut segment) = worker.segment.lock() { *segment = Some(name); }
                            worker.written.fetch_add(1, Ordering::Relaxed);
                            worker.status.store(1, Ordering::Release);
                        }
                        Err(_) => {
                            worker.dropped.fetch_add(1, Ordering::Relaxed);
                            worker.status.store(2, Ordering::Release);
                        }
                    }
                }
                worker.pending.fetch_sub(1, Ordering::Release);
            }
        });
        if thread.is_err() { metrics.status.store(2, Ordering::Release); }
        (Self { queue, metrics }, thread)
    }
    fn append(&self, directory: &Path, record: &serde_json::Value) {
        let line = format!("{record}\n");
        if line.len() > MAX_RECORD_BYTES || self.metrics.status.load(Ordering::Acquire) == 2 {
            self.metrics.dropped.fetch_add(1, Ordering::Relaxed); return;
        }
        self.metrics.pending.fetch_add(1, Ordering::Relaxed);
        // No send(), file open, metadata call or writer-held I/O lock is allowed
        // on a GUI, recovery-status, IPC or frontend-readiness call path.
        if let Err(error) = self.queue.try_send(Entry { directory: directory.to_path_buf(), line }) {
            self.metrics.pending.fetch_sub(1, Ordering::Release);
            self.metrics.dropped.fetch_add(1, Ordering::Relaxed);
            if matches!(error, TrySendError::Disconnected(_)) { self.metrics.status.store(2, Ordering::Release); }
        }
    }
}

fn writer() -> &'static Writer {
    WRITER.get_or_init(|| {
        let mut state = State::Initial;
        // Dropping the JoinHandle detaches this one best-effort thread. Shutdown
        // never waits for an unavailable filesystem or for a diagnostic flush.
        Writer::start(move |directory, line| {
            if matches!(state, State::Initial) {
                state = match create(directory) { Ok(sink) => State::Ready(sink), Err(_) => State::Disabled };
            }
            let State::Ready(sink) = &mut state else { return Err(unsafe_io()); };
            write_line(sink, line)?;
            Ok(sink.name.clone())
        }).0
    })
}

fn create(directory: &Path) -> io::Result<Sink> {
    let directory = platform::directory(directory)?;
    let (file, name) = match platform::create(&directory, "desktop-interactions.jsonl") {
        Ok(file) => (file, "desktop-interactions.jsonl".to_string()),
        Err(_) => {
            // A collision never grants permission to append to an existing
            // object. This alternative is also atomically create-if-absent.
            let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| unsafe_io())?.as_nanos();
            let name = format!("desktop-interactions.{}.{nanos:032x}.jsonl", std::process::id());
            (platform::create(&directory, &name)?, name)
        }
    };
    let identity = platform::identity(&file)?;
    if file.metadata()?.len() != 0 { return Err(unsafe_io()); }
    Ok(Sink { file, name, directory, identity, bytes: 0, segments: 1 })
}

fn rotate(sink: &mut Sink) -> io::Result<()> {
    if sink.segments >= MAX_SEGMENTS || platform::identity(&sink.file)? != sink.identity ||
        sink.file.metadata()?.len() != sink.bytes { return Err(unsafe_io()); }
    platform::check_directory(&sink.directory)?;
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| unsafe_io())?.as_nanos();
    let name = format!("desktop-interactions.{}.{nanos:032x}.{}.jsonl",
        std::process::id(), sink.segments + 1);
    let file = platform::create(&sink.directory, &name)?;
    let identity = platform::identity(&file)?;
    if file.metadata()?.len() != 0 { return Err(unsafe_io()); }
    sink.file = file;
    sink.name = name;
    sink.identity = identity;
    sink.bytes = 0;
    sink.segments += 1;
    Ok(())
}

fn write_line(sink: &mut Sink, line: &str) -> io::Result<()> {
    if line.len() as u64 > MAX_BYTES { return Err(unsafe_io()); }
    if sink.bytes.checked_add(line.len() as u64).ok_or_else(unsafe_io)? > MAX_BYTES {
        rotate(sink)?;
    }
    let total = sink.bytes.checked_add(line.len() as u64).ok_or_else(unsafe_io)?;
    if platform::identity(&sink.file)? != sink.identity ||
        sink.file.metadata()?.len() != sink.bytes { return Err(unsafe_io()); }
    platform::check_directory(&sink.directory)?;
    sink.file.write_all(line.as_bytes())?;
    if platform::identity(&sink.file)? != sink.identity || sink.file.metadata()?.len() != total {
        return Err(unsafe_io());
    }
    sink.bytes = total;
    Ok(())
}
pub fn append(directory: &Path, record: &serde_json::Value) {
    writer().append(directory, record);
}

pub fn status() -> &'static str {
    WRITER.get().map(|writer| writer.metrics.status()).unwrap_or("not_started")
}

/// Atomic, content-free counters; a concurrent write can finish between loads.
/// No caller waits for a flush. Pending/lost records make partial snapshots
/// explicit instead of claiming that a support export is complete.
pub(crate) fn snapshot() -> serde_json::Value {
    let Some(writer) = WRITER.get() else {
        return serde_json::json!({ "status": "not_started", "pending_records": 0, "dropped_records": 0, "written_records": 0 });
    };
    writer.metrics.snapshot()
}

/// Only a process-created fixed leaf, never a supplied path. Helps the bounded
/// support snapshot retain this session even when old diagnostics fill its cap.
pub(crate) fn current_segment() -> Option<String> {
    WRITER.get().and_then(|writer| writer.metrics.segment.lock().ok().and_then(|name| name.clone()))
}

/// A native-created owner generation, never a document/renderer path. Remember
/// bounded recent owners so failed startup evidence survives reconnection too.
pub(crate) fn remember_sidecar_generation(generation: &str) {
    if generation.len() != 32 || !generation.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return; }
    if let Ok(mut generations) = SIDECAR_GENERATIONS.lock() {
        generations.retain(|old| old != generation);
        generations.insert(0, generation.to_string()); generations.truncate(16);
    }
}
pub(crate) fn sidecar_segments() -> Vec<String> {
    let generations = SIDECAR_GENERATIONS.lock().map(|generations| generations.clone()).unwrap_or_default();
    generations.iter().flat_map(|generation|
        (1..=8).rev().map(move |segment| if segment == 1 { format!("sidecar-interactions.{generation}.jsonl") }
            else { format!("sidecar-interactions.{generation}.{segment}.jsonl") })).collect()
}

pub fn ensure_directory(directory: &Path) -> io::Result<()> {
    let binding = platform::directory(directory)?;
    platform::check_directory(&binding)
}

/// Create a one-off startup report without ever opening an existing object.
/// Use the same directory binding and no-follow creation as the JSONL sink:
/// startup failure must not turn a pre-planted link into an arbitrary write.
pub fn write_fresh(directory: &Path, stem: &str, body: &[u8]) -> io::Result<PathBuf> {
    if stem.is_empty() || !stem.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-') ||
        body.is_empty() || body.len() > 16 * 1024 { return Err(unsafe_io()); }
    let binding = platform::directory(directory)?;
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| unsafe_io())?.as_nanos();
    for attempt in 0..3 {
        let name = format!("{stem}-{}-{nanos:032x}-{attempt}.txt", std::process::id());
        let Ok(mut file) = platform::create(&binding, &name) else { continue };
        let identity = platform::identity(&file)?;
        platform::check_directory(&binding)?;
        file.write_all(body)?;
        file.sync_all()?;
        if platform::identity(&file)? != identity || file.metadata()?.len() != body.len() as u64 {
            return Err(unsafe_io());
        }
        return Ok(directory.join(name));
    }
    Err(unsafe_io())
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
        let normalized = PathBuf::from(path);
        #[cfg(target_os = "macos")]
        let normalized = {
            let mut normalized = normalized;
            for alias in ["/var", "/tmp", "/etc"] {
                if let Ok(rest) = path.strip_prefix(alias) { normalized = PathBuf::from(format!("/private{alias}")).join(rest); break; }
            }
            normalized
        };
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
    fn rotation_keeps_the_previous_segment_and_creates_a_distinct_file() {
        let root = std::env::temp_dir().join(format!("datasecure-diagnostic-rotation-{}-{}",
            std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let mut sink = create(&root).unwrap();
        sink.file.write_all(b"old\n").unwrap();
        sink.bytes = 4;
        rotate(&mut sink).unwrap();
        assert_eq!(sink.segments, 2);
        sink.file.write_all(b"new\n").unwrap();
        assert_eq!(std::fs::read(root.join("desktop-interactions.jsonl")).unwrap(), b"old\n");
        let entries: Vec<_> = std::fs::read_dir(&root).unwrap().map(|entry| entry.unwrap().path()).collect();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().any(|path| path != &root.join("desktop-interactions.jsonl") &&
            std::fs::read(path).unwrap() == b"new\n"));
        drop(sink);
        for path in entries { std::fs::remove_file(path).unwrap(); }
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn fresh_nested_sink_writes_a_readable_first_record() {
        let base = std::env::temp_dir();
        let root = base.join(format!(".tmp-standalone-native-{:032x}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let directory = root.join("temp/SecureDataMsg-Standalone");
        std::fs::create_dir_all(&directory).unwrap();
        platform::directory(&directory).unwrap();
        let mut sink = create(&directory).unwrap();
        write_line(&mut sink, "{\"event\":\"application_started\"}\n").unwrap();
        assert_eq!(std::fs::read(directory.join("desktop-interactions.jsonl")).unwrap(), b"{\"event\":\"application_started\"}\n");
        drop(sink);
        assert!(root.file_name().unwrap().to_string_lossy().starts_with(".tmp-standalone-native-"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn blocked_sink_never_blocks_enqueue_or_log_free_recovery_snapshot() {
        use std::sync::Barrier;
        let entered = Arc::new(Barrier::new(2)); let release = Arc::new(Barrier::new(2));
        let worker_entered = Arc::clone(&entered); let worker_release = Arc::clone(&release);
        let mut first = true;
        let (writer, thread) = Writer::start(move |_, _| {
            if first { first = false; worker_entered.wait(); worker_release.wait(); }
            Ok("desktop-interactions.jsonl".into())
        });
        let record = serde_json::json!({ "event": "frontend_ready" });
        writer.append(Path::new("unused-test-path"), &record);
        entered.wait(); // The disk sink is deterministically blocked here.
        let started = std::time::Instant::now();
        for _ in 0..QUEUE_CAPACITY + 7 { writer.append(Path::new("unused-test-path"), &record); }
        assert_eq!(writer.metrics.pending.load(Ordering::Acquire), QUEUE_CAPACITY as u64 + 1);
        assert_eq!(writer.metrics.dropped.load(Ordering::Acquire), 7);
        assert_eq!(writer.metrics.status.load(Ordering::Acquire), 0);
        assert_eq!(writer.metrics.snapshot()["pending_records"], QUEUE_CAPACITY + 1);
        assert_eq!(writer.metrics.snapshot()["dropped_records"], 7);
        assert_eq!(writer.metrics.status(), "not_started");
        let _ = status(); let _ = snapshot(); let _ = current_segment();
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        release.wait();
        let metrics = Arc::clone(&writer.metrics); drop(writer); thread.unwrap().join().unwrap();
        assert_eq!(metrics.pending.load(Ordering::Acquire), 0);
        assert_eq!(metrics.written.load(Ordering::Acquire), QUEUE_CAPACITY as u64 + 1);
        assert_eq!(metrics.dropped.load(Ordering::Acquire), 7);
    }
    #[test]
    fn failed_writer_counts_loss_and_never_retries_an_uncertain_sink() {
        let attempts = Arc::new(AtomicU64::new(0)); let worker_attempts = Arc::clone(&attempts);
        let (writer, thread) = Writer::start(move |_, _| {
            worker_attempts.fetch_add(1, Ordering::Relaxed); Err(unsafe_io())
        });
        let record = serde_json::json!({ "event": "application_started" });
        for _ in 0..10 { writer.append(Path::new("unused-test-path"), &record); }
        let metrics = Arc::clone(&writer.metrics); drop(writer); thread.unwrap().join().unwrap();
        assert_eq!(attempts.load(Ordering::Acquire), 1);
        assert_eq!(metrics.status.load(Ordering::Acquire), 2);
        assert_eq!(metrics.dropped.load(Ordering::Acquire), 10);
        assert_eq!(metrics.pending.load(Ordering::Acquire), 0);
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
