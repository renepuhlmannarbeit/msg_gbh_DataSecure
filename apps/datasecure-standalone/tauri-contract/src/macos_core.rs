//! Fixed, compiler-pinned custom-Core bytes; no host-node or converter fallback.
use std::{ffi::{CString, OsStr}, fs::File, io::Read, os::unix::{ffi::OsStrExt, fs::MetadataExt, io::{AsRawFd, FromRawFd}},
    path::{Component, Path, PathBuf}, time::Instant};
use sha2::{Digest, Sha256};
const MAXIMUM: u64 = 128 * 1024 * 1024;
const INVALID: &str = "STANDALONE_RUNTIME_BINARY_INVALID";
#[derive(Clone, PartialEq, Eq)]
struct Stamp { dev: u64, ino: u64, size: u64, links: u64, mtime: i64, mtime_ns: i64, ctime: i64, ctime_ns: i64 }
fn stamp(file: &File) -> Result<Stamp, String> {
    let m = file.metadata().map_err(|_| INVALID.to_string())?;
    if !m.is_file() || m.nlink() != 1 || m.len() < 64 || m.len() > MAXIMUM { return Err(INVALID.into()); }
    Ok(Stamp { dev: m.dev(), ino: m.ino(), size: m.len(), links: m.nlink(),
        mtime: m.mtime(), mtime_ns: m.mtime_nsec(), ctime: m.ctime(), ctime_ns: m.ctime_nsec() })
}
fn child(parent: &File, name: &OsStr, directory: bool) -> Result<File, String> {
    let name = CString::new(name.as_bytes()).map_err(|_| INVALID.to_string())?;
    let flags = libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK |
        if directory { libc::O_DIRECTORY } else { 0 };
    let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 { Err(INVALID.into()) } else { Ok(unsafe { File::from_raw_fd(fd) }) }
}
pub(crate) struct Binding { file: File, path: PathBuf, identity: Stamp }
pub(crate) fn bind(path: &Path, deadline: Instant) -> Result<Binding, String> {
    // Match only the Core sibling of this actual application executable.
    let application = std::env::current_exe().map_err(|_| INVALID.to_string())?;
    if application.file_name() != Some(OsStr::new("datasecure-standalone")) ||
        application.parent().and_then(Path::file_name) != Some(OsStr::new("MacOS")) ||
        application.parent().map(|p| p.join("datasecure-core")).as_deref() != Some(path) { return Err(INVALID.into()); }
    let mut chain = vec![File::open("/").map_err(|_| INVALID.to_string())?];
    let components: Vec<_> = path.components().collect();
    if components.len() > 128 { return Err(INVALID.into()); }
    let mut names = Vec::new();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(name) = component else {
            if index == 0 && matches!(component, Component::RootDir) { continue; }
            return Err(INVALID.into());
        };
        let directory = index + 1 != components.len();
        let file = child(chain.last().ok_or(INVALID)?, name, directory)?;
        names.push(name.to_os_string()); chain.push(file);
    }
    let mut file = chain.pop().ok_or(INVALID)?;
    let before = stamp(&file)?; let mut hash = Sha256::new(); let mut read = 0u64; let mut buffer = [0u8; 65536];
    loop {
        if Instant::now() >= deadline { return Err("STANDALONE_IPC_TIMEOUT".into()); }
        let n = file.read(&mut buffer).map_err(|_| INVALID.to_string())?;
        if n == 0 { break; }
        read = read.checked_add(n as u64).filter(|n| *n <= MAXIMUM).ok_or(INVALID)?;
        hash.update(&buffer[..n]);
    }
    if read != before.size || stamp(&file)? != before ||
        format!("{:x}", hash.finalize()) != crate::source_fingerprint::macos_static_core_sha256() { return Err(INVALID.into()); }
    // Revalidate every held ancestor edge, never a canonicalize-and-reopen gap.
    for (index, name) in names.iter().enumerate() {
        let reopened = child(&chain[index], name, index + 1 != names.len())?;
        let actual = reopened.metadata().map_err(|_| INVALID.to_string())?;
        let held = if index + 1 == names.len() { file.metadata() } else { chain[index + 1].metadata() }
            .map_err(|_| INVALID.to_string())?;
        if actual.dev() != held.dev() || actual.ino() != held.ino() { return Err(INVALID.into()); }
    }
    if stamp(&file)? != before { return Err(INVALID.into()); }
    Ok(Binding { file, path: path.to_path_buf(), identity: before })
}
impl Binding {
    pub(crate) fn verify_again(&self, deadline: Instant) -> Result<(), String> {
        let current = bind(&self.path, deadline)?;
        if stamp(&self.file)? != self.identity || current.identity != self.identity { return Err(INVALID.into()); }
        Ok(())
    }
}
