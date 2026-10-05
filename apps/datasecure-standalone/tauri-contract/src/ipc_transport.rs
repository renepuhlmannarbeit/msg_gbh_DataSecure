//! Deadline-bound private pipes. The UI can stop its owned child without
//! acquiring the request mutex or waiting for a blocked pipe writer.
use std::{
    io::Write,
    process::Child,
    sync::{atomic::{AtomicBool, AtomicU8, Ordering}, mpsc, Arc, Condvar, Mutex, MutexGuard, TryLockError},
    time::{Duration, Instant},
};

pub const FAILED: &str = "STANDALONE_IPC_FAILED";
pub const TIMEOUT: &str = "STANDALONE_IPC_TIMEOUT";
pub const CLOSED: &str = "STANDALONE_CLOSING";

#[derive(Clone, Default)]
pub struct ExitGate {
    exit_started: Arc<AtomicBool>,
    terminal_exit: Arc<AtomicU8>,
}

impl ExitGate {
    pub fn begin(&self) -> bool { !self.exit_started.swap(true, Ordering::AcqRel) }
    pub fn allowed(&self, requested_code: Option<i32>) -> bool {
        match self.terminal_exit.load(Ordering::Acquire) {
            1 => requested_code == Some(0),
            2 => requested_code == Some(70),
            _ => false,
        }
    }
    // Only the shutdown worker calls this AFTER Lifecycle::stop has returned,
    // including its failure terminal path. Repeated external quit requests
    // cannot mistake "started" for "finished" and bypass pending OS spawns.
    // A later external Quit (None) or mismatching exit code must not swallow
    // the completed failure terminal before our own app.exit(70) is delivered.
    pub fn finish(&self, stopped: bool) -> i32 {
        self.terminal_exit.store(if stopped { 1 } else { 2 }, Ordering::Release);
        if stopped { 0 } else { 70 }
    }
}

#[derive(Clone)]
pub struct ChildControl(Arc<Mutex<Child>>, Arc<AtomicBool>, Arc<AtomicBool>);

impl ChildControl {
    pub fn new(child: Child) -> Self { Self(Arc::new(Mutex::new(child)), Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false))) }
    pub fn exited(&self) -> bool {
        self.0.try_lock().ok().and_then(|mut child| child.try_wait().ok().flatten()).is_some()
    }
    pub fn terminate(&self) -> bool {
        if self.1.swap(true, Ordering::AcqRel) {
            let deadline = Instant::now() + Duration::from_millis(1100);
            while !self.2.load(Ordering::Acquire) && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            return self.2.load(Ordering::Acquire);
        }
        let mut child = match self.0.lock() { Ok(child) => child, Err(_) => return false };
        if child.try_wait().ok().flatten().is_some() { self.2.store(true, Ordering::Release); return true; }
        if child.kill().is_err() {
            let exited = child.try_wait().ok().flatten().is_some();
            self.2.store(exited, Ordering::Release);
            return exited;
        }
        // Never wait() on a GUI thread. Reaping is independent of pipe/request locks.
        let deadline = Instant::now() + Duration::from_millis(1000);
        while Instant::now() < deadline {
            if child.try_wait().ok().flatten().is_some() { self.2.store(true, Ordering::Release); return true; }
            std::thread::sleep(Duration::from_millis(10));
        }
        drop(child);
        let reap = self.0.clone();
        let completed = self.2.clone();
        std::thread::spawn(move || { if let Ok(mut child) = reap.lock() {
            completed.store(child.wait().is_ok(), Ordering::Release);
        } });
        false
    }
}

#[derive(Default)]
struct LifecycleState {
    active: Option<ChildControl>,
    pending_spawns: usize,
    reconciliation_failed: bool,
}

#[derive(Clone, Default)]
pub struct Lifecycle {
    pub stopping: Arc<AtomicBool>,
    state: Arc<(Mutex<LifecycleState>, Condvar)>,
}

// Registered before entering the OS spawn call, not only after it returns.
// Dropping this guard is permitted only after the child has been adopted or
// terminated. Shutdown can then never report success while a spawn is unknown.
pub struct SpawnGuard(Lifecycle);

impl SpawnGuard {
    pub fn register(&self, child: ChildControl) -> Result<(), String> { self.0.register(child) }
}

impl Drop for SpawnGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.0.state.0.lock() {
            state.pending_spawns = state.pending_spawns.saturating_sub(1);
            self.0.state.1.notify_all();
        }
    }
}

impl Lifecycle {
    pub fn begin_spawn(&self) -> Result<SpawnGuard, String> {
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        state.pending_spawns += 1;
        Ok(SpawnGuard(self.clone()))
    }
    fn register(&self, child: ChildControl) -> Result<(), String> {
        let mut state = match self.state.0.lock() {
            Ok(state) => state,
            Err(_) => { child.terminate(); return Err(FAILED.to_string()); }
        };
        if self.stopping.load(Ordering::Acquire) {
            drop(state);
            if !child.terminate() {
                if let Ok(mut state) = self.state.0.lock() { state.reconciliation_failed = true; }
            }
            return Err(CLOSED.to_string());
        }
        state.active = Some(child);
        Ok(())
    }
    pub fn stop(&self) -> bool {
        self.stopping.store(true, Ordering::Release);
        let mut state = match self.state.0.lock() { Ok(state) => state, Err(_) => return false };
        while state.pending_spawns != 0 {
            // Runs on the shutdown blocking worker, never the GUI. An OS spawn
            // cannot be safely cancelled mid-call; wait for reconciliation
            // instead of exiting and leaving an untracked process behind.
            state = match self.state.1.wait(state) { Ok(state) => state, Err(_) => return false };
        }
        let child = state.active.take();
        let reconciled = !state.reconciliation_failed;
        drop(state);
        child.map_or(reconciled, |child| child.terminate() && reconciled)
    }
}

pub fn lock_until<'a, T>(mutex: &'a Mutex<T>, deadline: Instant, stopping: &AtomicBool) -> Result<MutexGuard<'a, T>, String> {
    loop {
        if stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        if Instant::now() >= deadline { return Err(TIMEOUT.to_string()); }
        match mutex.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(TryLockError::Poisoned(_)) => return Err(FAILED.to_string()),
            Err(TryLockError::WouldBlock) => std::thread::sleep(Duration::from_millis(5)),
        }
    }
}

pub fn receive_until<T>(receiver: &mpsc::Receiver<T>, deadline: Instant, stopping: &AtomicBool) -> Result<T, String> {
    receive_until_with_progress(receiver, deadline, stopping, || {})
}

pub fn receive_until_with_progress<T>(receiver: &mpsc::Receiver<T>, deadline: Instant, stopping: &AtomicBool,
    mut progress: impl FnMut()) -> Result<T, String> {
    let mut next_progress = Instant::now() + Duration::from_secs(1);
    loop {
        if stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err(TIMEOUT.to_string()); }
        match receiver.recv_timeout(remaining.min(Duration::from_millis(25))) {
            Ok(value) => return Ok(value),
            Err(mpsc::RecvTimeoutError::Disconnected) => return Err(FAILED.to_string()),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if Instant::now() >= next_progress {
                    progress();
                    next_progress = Instant::now() + Duration::from_secs(1);
                }
            },
        }
    }
}

pub type WriteRequest = (Vec<u8>, mpsc::Sender<Result<(), String>>);

pub fn writer(mut input: impl Write + Send + 'static) -> mpsc::Sender<WriteRequest> {
    let (sender, requests) = mpsc::channel::<WriteRequest>();
    std::thread::spawn(move || {
        while let Ok((payload, completed)) = requests.recv() {
            let result = input.write_all(&(payload.len() as u32).to_be_bytes())
                .and_then(|_| input.write_all(&payload)).and_then(|_| input.flush())
                .map_err(|_| FAILED.to_string());
            let failed = result.is_err();
            if completed.send(result).is_err() || failed { break; }
        }
    });
    sender
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_quit_requests_cannot_bypass_pending_spawn_reconciliation() {
        let lifecycle = Lifecycle::default();
        let pending = lifecycle.begin_spawn().unwrap();
        let gate = ExitGate::default();
        assert!(!gate.allowed(None));
        assert!(!gate.allowed(Some(0)));
        assert!(gate.begin());
        let shutdown = lifecycle.clone();
        let finish_gate = gate.clone();
        let (finished, result) = mpsc::channel();
        let stopper = std::thread::spawn(move || {
            let stopped = shutdown.stop();
            finished.send(finish_gate.finish(stopped)).unwrap();
        });
        while !lifecycle.stopping.load(Ordering::Acquire) { std::thread::yield_now(); }
        for _ in 0..32 {
            assert!(!gate.allowed(None), "external Quit must remain prevented during shutdown");
            assert!(!gate.allowed(Some(0)));
            assert!(!gate.allowed(Some(70)));
            assert!(!gate.begin(), "repeated Quit must not spawn another shutdown worker");
        }
        assert!(result.recv_timeout(Duration::from_millis(80)).is_err());
        assert!(!gate.allowed(None));
        drop(pending);
        assert_eq!(result.recv_timeout(Duration::from_secs(2)).unwrap(), 0);
        stopper.join().unwrap();
        assert!(!gate.allowed(None));
        assert!(!gate.allowed(Some(70)));
        assert!(gate.allowed(Some(0)));
    }
    #[test]
    fn failed_shutdown_allows_only_its_completed_failure_terminal_exit() {
        let lifecycle = Lifecycle::default();
        lifecycle.state.0.lock().unwrap().reconciliation_failed = true;
        let gate = ExitGate::default();
        assert!(gate.begin());
        assert!(!gate.allowed(None));
        let stopped = lifecycle.stop();
        assert!(!stopped);
        assert!(!gate.allowed(Some(70)), "failure must not allow exit before stop returns");
        assert_eq!(gate.finish(stopped), 70);
        assert!(gate.allowed(Some(70)));
        assert!(!gate.allowed(None), "external Quit remains blocked before our final request is delivered");
        assert!(!gate.allowed(Some(0)), "another request cannot turn shutdown failure into success");
        assert!(!gate.allowed(Some(1)));
        assert!(!gate.begin());
    }
    #[test]
    fn held_request_lock_is_deadline_bound_and_interruptible() {
        let mutex = Mutex::new(());
        let _held = mutex.lock().unwrap();
        let stopping = AtomicBool::new(false);
        let started = Instant::now();
        assert_eq!(lock_until(&mutex, started + Duration::from_millis(40), &stopping).unwrap_err(), TIMEOUT);
        assert!(started.elapsed() < Duration::from_secs(1));
        stopping.store(true, Ordering::Release);
        assert_eq!(lock_until(&mutex, Instant::now() + Duration::from_secs(30), &stopping).unwrap_err(), CLOSED);
    }
    #[test]
    fn real_child_not_reading_stdin_cannot_hold_request_or_shutdown() {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut command = { let mut c = Command::new("powershell.exe"); c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]); c };
        #[cfg(not(windows))]
        let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let input = child.stdin.take().unwrap();
        let control = ChildControl::new(child);
        let lifecycle = Lifecycle::default();
        lifecycle.register(control.clone()).unwrap();
        let writes = writer(input);
        let (sent, completed) = mpsc::channel();
        writes.send((vec![b'x'; 1024 * 1024], sent)).unwrap();
        assert_eq!(receive_until(&completed, Instant::now() + Duration::from_millis(100), &lifecycle.stopping).unwrap_err(), TIMEOUT);
        let started = Instant::now();
        assert!(lifecycle.stop(), "owned child must be terminated and reaped");
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(control.exited());
        assert!(completed.recv_timeout(Duration::from_secs(1)).unwrap().is_err());
    }
    #[test]
    fn late_spawn_after_shutdown_is_terminated_not_registered() {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut command = { let mut c = Command::new("powershell.exe"); c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]); c };
        #[cfg(not(windows))]
        let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
        let control = ChildControl::new(command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
        let lifecycle = Lifecycle::default();
        assert!(lifecycle.stop());
        assert_eq!(lifecycle.register(control.clone()).unwrap_err(), CLOSED);
        assert!(control.exited());
    }
    #[test]
    fn shutdown_does_not_report_success_between_os_spawn_and_registration() {
        use std::process::{Command, Stdio};
        let lifecycle = Lifecycle::default();
        let pending = lifecycle.begin_spawn().unwrap();
        let shutdown = lifecycle.clone();
        let (finished, result) = mpsc::channel();
        let stopper = std::thread::spawn(move || { finished.send(shutdown.stop()).unwrap(); });
        while !lifecycle.stopping.load(Ordering::Acquire) { std::thread::yield_now(); }
        assert!(result.recv_timeout(Duration::from_millis(80)).is_err(),
            "shutdown must still be pending before an OS spawn is reconciled");
        #[cfg(windows)]
        let mut command = { let mut c = Command::new("powershell.exe"); c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]); c };
        #[cfg(not(windows))]
        let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
        let control = ChildControl::new(command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
        assert_eq!(lifecycle.register(control.clone()).unwrap_err(), CLOSED);
        assert!(control.exited(), "late owned child must be reaped before completion");
        drop(pending);
        assert!(result.recv_timeout(Duration::from_secs(2)).unwrap());
        stopper.join().unwrap();
        assert!(lifecycle.begin_spawn().is_err());
    }
    #[test]
    fn cancelled_or_failed_spawn_guard_unblocks_shutdown_without_any_child() {
        let lifecycle = Lifecycle::default();
        let pending = lifecycle.begin_spawn().unwrap();
        let shutdown = lifecycle.clone();
        let stopper = std::thread::spawn(move || shutdown.stop());
        drop(pending);
        assert!(stopper.join().unwrap());
    }
    #[test]
    fn wait_heartbeat_is_content_free_and_never_outlives_response() {
        let (sender, receiver) = mpsc::channel();
        let producer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1150)); sender.send(42).unwrap();
        });
        let stopping = AtomicBool::new(false);
        let mut heartbeats = 0;
        assert_eq!(receive_until_with_progress(&receiver, Instant::now() + Duration::from_secs(3),
            &stopping, || heartbeats += 1).unwrap(), 42);
        assert!(heartbeats >= 1);
        producer.join().unwrap();
    }
}
