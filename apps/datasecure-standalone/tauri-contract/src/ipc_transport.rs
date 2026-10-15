//! Deadline-bound private pipes. The UI can stop its owned child without
//! acquiring the request mutex or waiting for a blocked pipe writer.
use std::{
    io::Write,
    process::{Child, ExitStatus},
    sync::{atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering}, mpsc, Arc, Condvar, Mutex, MutexGuard, TryLockError},
    time::{Duration, Instant},
};

pub const FAILED: &str = "STANDALONE_IPC_FAILED";
pub const TIMEOUT: &str = "STANDALONE_IPC_TIMEOUT";
pub const CLOSED: &str = "STANDALONE_CLOSING";

// Initial startup preserves a concurrent first picker. Recovered Ready
// invalidates commands captured while the replacement was booting.
pub fn ready_connection_epoch(epoch: &AtomicU64) -> u64 {
    if epoch.load(Ordering::Acquire) == 0 { 0 }
    else { epoch.fetch_add(1, Ordering::AcqRel) + 1 }
}

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
pub struct ChildControl(Arc<Mutex<Child>>, Arc<AtomicU8>);

impl ChildControl {
    pub fn new(child: Child) -> Self { Self(Arc::new(Mutex::new(child)), Arc::new(AtomicU8::new(0))) }
    pub fn same(&self, other: &Self) -> bool { Arc::ptr_eq(&self.0, &other.0) }
    pub fn exited(&self) -> bool {
        self.0.try_lock().ok().and_then(|mut child| child.try_wait().ok().flatten()).is_some()
    }
    pub fn exit_status(&self) -> Option<ExitStatus> {
        self.0.try_lock().ok().and_then(|mut child| child.try_wait().ok().flatten())
    }
    pub fn terminate(&self) -> bool {
        if self.1.compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire).is_err() {
            let deadline = Instant::now() + Duration::from_millis(1100);
            while self.1.load(Ordering::Acquire) == 1 && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            return self.1.load(Ordering::Acquire) == 2;
        }
        let mut child = match self.0.lock() { Ok(child) => child, Err(_) => { self.1.store(3, Ordering::Release); return false; } };
        if child.try_wait().ok().flatten().is_some() { self.1.store(2, Ordering::Release); return true; }
        if child.kill().is_err() {
            let exited = child.try_wait().ok().flatten().is_some();
            self.1.store(if exited { 2 } else { 3 }, Ordering::Release);
            return exited;
        }
        // Never wait() on a GUI thread. Reaping is independent of pipe/request locks.
        let deadline = Instant::now() + Duration::from_millis(1000);
        while Instant::now() < deadline {
            if child.try_wait().ok().flatten().is_some() { self.1.store(2, Ordering::Release); return true; }
            std::thread::sleep(Duration::from_millis(10));
        }
        drop(child);
        let reap = self.0.clone();
        let completed = self.1.clone();
        if std::thread::Builder::new().name("sidecar-reaper".into()).spawn(move || {
            let ok = reap.lock().is_ok_and(|mut child| child.wait().is_ok());
            completed.store(if ok { 2 } else { 3 }, Ordering::Release);
        }).is_err() { self.1.store(3, Ordering::Release); }
        false
    }
    fn terminate_confirmed(&self) -> bool {
        if self.terminate() { return true; }
        // Only the cleanup worker waits for an already-running reaper. Failed
        // kill/reaping is a distinct terminal state, never a successor grant.
        while self.1.load(Ordering::Acquire) == 1 { std::thread::sleep(Duration::from_millis(5)); }
        self.1.load(Ordering::Acquire) == 2
    }
}

#[derive(Default)]
struct LifecycleState {
    active: Option<ChildControl>,
    pending_spawns: usize,
    active_native: usize,
    reconciliation_failed: bool,
    retiring: bool,
}

#[derive(Clone, Default)]
pub struct Lifecycle {
    pub stopping: Arc<AtomicBool>,
    read_only_active: Arc<AtomicBool>,
    state: Arc<(Mutex<LifecycleState>, Condvar)>,
}

// Registered before entering the OS spawn call, not only after it returns.
// Dropping this guard is permitted only after the child has been adopted or
// terminated. Shutdown can then never report success while a spawn is unknown.
pub struct SpawnGuard(Lifecycle);

// Native filesystem work runs inside the owning desktop, never in an orphanable
// Node child. A guard spans preparation, publication and its reconciliation.
// Cancellation alone is NOT proof that no output was published.
#[cfg(test)]
type NativeTestEvent = Arc<dyn Fn(&str) + Send + Sync>;
pub struct NativeGuard(Lifecycle, Option<Instant>, #[cfg(test)] Option<NativeTestEvent>);
// Only read-only native metadata work may outlive an RPC deadline. There is
// at most one such worker; shutdown need not wait for a blocked filter driver
// because this worker cannot publish, create or mutate anything. Process exit
// ends its thread. A late result has no authority and is dropped by its receiver.
pub struct ReadOnlyGuard(Lifecycle);
impl Drop for ReadOnlyGuard {
    fn drop(&mut self) { self.0.read_only_active.store(false, Ordering::Release); }
}

impl NativeGuard {
    #[cfg(test)]
    pub(crate) fn with_test_event(mut self, event: impl Fn(&str) + Send + Sync + 'static) -> Self {
        self.2 = Some(Arc::new(event)); self
    }
    #[cfg(test)]
    pub(crate) fn test_event(&self, phase: &str) { if let Some(event) = &self.2 { event(phase); } }
    pub fn checkpoint(&self) -> Result<(), String> {
        if self.0.stopping.load(Ordering::Acquire) { Err(CLOSED.to_string()) }
        else if self.1.is_some_and(|deadline| Instant::now() >= deadline) { Err(TIMEOUT.to_string()) }
        else { Ok(()) }
    }
}

impl Drop for NativeGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.0.state.0.lock() {
            state.active_native = state.active_native.saturating_sub(1);
            self.0.state.1.notify_all();
        }
    }
}

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
    // Data-free native observation only: never grants a successor or certifies an export.
    pub fn recovery_phase(&self) -> &'static str {
        if self.stopping.load(Ordering::Acquire) { return "closing"; }
        let state = match self.state.0.try_lock() {
            Ok(state) => state,
            Err(TryLockError::WouldBlock) => return "checking",
            Err(TryLockError::Poisoned(_)) => return "blocked",
        };
        if state.reconciliation_failed { "blocked" }
        else if state.retiring || state.pending_spawns != 0 || state.active_native != 0 { "settling" }
        else if state.active.is_some() { "owned" }
        else { "idle" }
    }
    pub fn begin_read_only(&self) -> Result<ReadOnlyGuard, String> {
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        if self.read_only_active.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
            return Err("STANDALONE_BUSY".to_string());
        }
        let guard = ReadOnlyGuard(self.clone());
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        Ok(guard)
    }
    // Used by the native publication foundation tests; publication is not
    // activated until its full durable reconciliation contract is connected.
    #[allow(dead_code)]
    pub fn begin_native(&self) -> Result<NativeGuard, String> {
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        if state.retiring || state.reconciliation_failed { return Err("STANDALONE_CONNECTION_RECOVERY_BLOCKED".into()); }
        state.active_native = state.active_native.checked_add(1).ok_or_else(|| FAILED.to_string())?;
        Ok(NativeGuard(self.clone(), None, #[cfg(test)] None))
    }
    pub fn begin_native_until(&self, deadline: Instant) -> Result<NativeGuard, String> {
        let mut guard = self.begin_native()?;
        guard.1 = Some(deadline); guard.checkpoint()?; Ok(guard)
    }
    pub fn begin_spawn(&self) -> Result<SpawnGuard, String> {
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        // A late spawn or not-yet-reaped predecessor cannot be replaced by a
        // second process. Never overwrite the sole shutdown ownership handle.
        if state.retiring || state.reconciliation_failed || state.pending_spawns != 0 || state.active_native != 0 ||
            state.active.as_ref().is_some_and(|child| !child.exited()) {
            return Err("STANDALONE_CONNECTION_RECOVERY_BLOCKED".to_string());
        }
        state.active = None;
        state.pending_spawns += 1;
        Ok(SpawnGuard(self.clone()))
    }
    pub fn begin_retirement(&self, child: &ChildControl) -> Result<bool, String> {
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if self.stopping.load(Ordering::Acquire) { return Err(CLOSED.to_string()); }
        if state.reconciliation_failed || !state.active.as_ref().is_some_and(|active| active.same(child)) {
            return Err("STANDALONE_CONNECTION_RECOVERY_BLOCKED".to_string());
        }
        if state.retiring { return Ok(false); }
        state.retiring = true; Ok(true)
    }
    pub fn drain_retirement(&self, child: &ChildControl) -> Result<(), String> {
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if !state.retiring || !state.active.as_ref().is_some_and(|active| active.same(child)) { return Err(FAILED.into()); }
        while state.pending_spawns != 0 || state.active_native != 0 {
            state = self.state.1.wait(state).map_err(|_| FAILED.to_string())?;
        }
        drop(state); // Never kill or wait under the lifecycle / sidecar mutex.
        if !child.terminate_confirmed() { return Err("STANDALONE_CONNECTION_RECOVERY_BLOCKED".into()); }
        let mut state = self.state.0.lock().map_err(|_| FAILED.to_string())?;
        if !state.active.as_ref().is_some_and(|active| active.same(child)) { return Err(FAILED.into()); }
        state.active = None;
        Ok(())
    }
    pub fn finish_retirement(&self, success: bool) {
        if let Ok(mut state) = self.state.0.lock() {
            state.reconciliation_failed |= !success; state.retiring = false; self.state.1.notify_all();
        }
    }
    pub fn retire_async(&self, child: ChildControl,
        complete: impl FnOnce() -> Result<(), String> + Send + 'static) -> Result<(), String> {
        if !self.begin_retirement(&child)? { return Ok(()); }
        let lifecycle = self.clone();
        if std::thread::Builder::new().name("sidecar-retirement".into()).spawn(move || {
            let result = lifecycle.drain_retirement(&child).and_then(|()| complete());
            lifecycle.finish_retirement(result.is_ok());
        }).is_err() {
            self.finish_retirement(false); return Err("STANDALONE_CONNECTION_RECOVERY_BLOCKED".into());
        }
        Ok(())
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
        while state.retiring || state.pending_spawns != 0 || state.active_native != 0 {
            // Runs on the shutdown blocking worker, never the GUI. An OS spawn
            // cannot be safely cancelled mid-call; wait for reconciliation
            // instead of exiting and leaving an untracked process behind.
            // Native I/O must also finish or reconcile before killing the
            // sidecar and releasing its approval/revocation control lock.
            state = match self.state.1.wait(state) { Ok(state) => state, Err(_) => return false };
        }
        let child = state.active.take();
        let reconciled = !state.reconciliation_failed;
        drop(state);
        child.map_or(reconciled, |child| child.terminate_confirmed() && reconciled)
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
            Ok(value) => {
                if stopping.load(Ordering::Acquire) { return Err(CLOSED.into()); }
                if Instant::now() >= deadline { return Err(TIMEOUT.into()); }
                return Ok(value);
            },
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
    fn native_recovery_phase_is_read_only_and_never_clears_a_block() {
        let lifecycle = Lifecycle::default();
        assert_eq!(lifecycle.recovery_phase(), "idle");
        let pending = lifecycle.begin_spawn().unwrap();
        assert_eq!(lifecycle.recovery_phase(), "settling");
        drop(pending);
        let native = lifecycle.begin_native().unwrap();
        assert_eq!(lifecycle.recovery_phase(), "settling");
        drop(native);
        lifecycle.state.0.lock().unwrap().reconciliation_failed = true;
        assert_eq!(lifecycle.recovery_phase(), "blocked");
        assert!(lifecycle.begin_spawn().is_err(), "reading the phase cannot grant a successor");
        lifecycle.stopping.store(true, Ordering::Release);
        assert_eq!(lifecycle.recovery_phase(), "closing");
    }
    #[test]
    fn poisoned_lifecycle_diagnostic_never_reports_waiting_as_safe() {
        let lifecycle = Lifecycle::default(); let poison = lifecycle.clone();
        assert!(std::thread::spawn(move || {
            let _held = poison.state.0.lock().unwrap();
            panic!("injected poisoned lifecycle mutex");
        }).join().is_err());
        assert_eq!(lifecycle.recovery_phase(), "blocked");
        assert!(lifecycle.begin_spawn().is_err());
    }

    #[test]
    fn ready_invalidates_commands_queued_during_recovery_but_not_first_start() {
        let epoch = AtomicU64::new(0);
        assert_eq!(ready_connection_epoch(&epoch), 0);
        epoch.store(1, Ordering::Release);
        let captured_while_booting = epoch.load(Ordering::Acquire);
        assert_eq!(ready_connection_epoch(&epoch), 2);
        assert_ne!(captured_while_booting, epoch.load(Ordering::Acquire));
        let captured_after_ready = epoch.load(Ordering::Acquire);
        assert_eq!(captured_after_ready, 2);
    }
    #[test]
    fn shutdown_cancels_native_checkpoints_but_waits_for_every_owned_operation() {
        let lifecycle = Lifecycle::default();
        let first = lifecycle.begin_native().unwrap(); let second = lifecycle.begin_native().unwrap();
        assert!(first.checkpoint().is_ok());
        let shutdown = lifecycle.clone(); let (done, finished) = mpsc::channel();
        let stopper = std::thread::spawn(move || { done.send(shutdown.stop()).unwrap(); });
        while !lifecycle.stopping.load(Ordering::Acquire) { std::thread::yield_now(); }
        assert_eq!(first.checkpoint().unwrap_err(), CLOSED);
        assert!(lifecycle.begin_native().is_err());
        assert!(finished.recv_timeout(Duration::from_millis(50)).is_err());
        drop(first);
        assert!(finished.recv_timeout(Duration::from_millis(50)).is_err());
        drop(second);
        assert!(finished.recv_timeout(Duration::from_secs(2)).unwrap()); stopper.join().unwrap();
    }
    #[test]
    fn native_guard_unwind_releases_shutdown_barrier_without_faking_no_publication() {
        let lifecycle = Lifecycle::default(); let work = lifecycle.clone();
        assert!(std::thread::spawn(move || {
            let _native = work.begin_native().unwrap(); panic!("injected native panic");
        }).join().is_err());
        assert!(lifecycle.stop(), "guard lifetime is reconciled, not the filesystem publication");
        assert!(lifecycle.begin_native().is_err());
    }
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
    fn replacement_spawn_cannot_overlap_an_unregistered_predecessor_or_native_work() {
        let lifecycle = Lifecycle::default();
        let pending = lifecycle.begin_spawn().unwrap();
        assert!(lifecycle.begin_spawn().is_err());
        drop(pending);
        let native = lifecycle.begin_native().unwrap();
        assert!(lifecycle.begin_spawn().is_err());
        drop(native);
        assert!(lifecycle.begin_spawn().is_ok());
    }
    #[test]
    fn retirement_requires_native_drain_and_reaps_the_exact_child_before_replacement() {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut command = { let mut c = Command::new("powershell.exe"); c.args(["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"]); c };
        #[cfg(not(windows))]
        let mut command = { let mut c = Command::new("sleep"); c.arg("30"); c };
        let control = ChildControl::new(command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap());
        let lifecycle = Lifecycle::default(); lifecycle.register(control.clone()).unwrap();
        let native = lifecycle.begin_native().unwrap();
        assert!(lifecycle.begin_retirement(&control).unwrap());
        let retirement = lifecycle.clone(); let owned = control.clone();
        let (done, finished) = mpsc::channel();
        let retire = std::thread::spawn(move || {
            let result = retirement.drain_retirement(&owned);
            retirement.finish_retirement(result.is_ok()); done.send(result).unwrap();
        });
        assert!(!control.exited(), "native capability must not lose its approval owner");
        assert!(finished.recv_timeout(Duration::from_millis(50)).is_err());
        assert!(lifecycle.begin_native().is_err(), "retirement blocks new native writers too");
        assert!(lifecycle.begin_spawn().is_err());
        drop(native);
        finished.recv_timeout(Duration::from_secs(5)).unwrap().unwrap(); retire.join().unwrap(); assert!(control.exited());
        assert!(lifecycle.begin_spawn().is_ok());
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
