//! Once-only, read-only Core diagnostics. No product lifecycle or spawn guard
//! crosses this boundary. Never wait indefinitely or lose an unconfirmed child.
use std::{
    io,
    process::{Child, ExitStatus},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

const OBSERVE_LIMIT: Duration = Duration::from_secs(3);
const CLEANUP_LIMIT: Duration = Duration::from_secs(1);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
pub(crate) const OBSERVER_UNAVAILABLE: &str = "STANDALONE_CORE_PROBE_OBSERVER_UNAVAILABLE";
pub(crate) const END_UNCONFIRMED: &str = "STANDALONE_CORE_PROBE_END_UNCONFIRMED";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ScheduleOutcome { Scheduled, AlreadyAttempted, Unavailable }

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StopReason { Timeout, WaitFailed }
impl StopReason {
    pub(crate) fn code(self) -> &'static str {
        match self {
            Self::Timeout => "STANDALONE_CORE_PROBE_TIMEOUT",
            Self::WaitFailed => "STANDALONE_CORE_PROBE_WAIT_FAILED",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum KillOutcome { NotRequested, Sent, Denied, Failed }
impl KillOutcome {
    pub(crate) fn error_code(self) -> Option<&'static str> {
        match self {
            Self::Denied => Some("STANDALONE_CORE_PROBE_KILL_DENIED"),
            Self::Failed => Some("STANDALONE_CORE_PROBE_KILL_FAILED"),
            Self::NotRequested | Self::Sent => None,
        }
    }
}

pub(crate) struct Observation<S> {
    pub(crate) process_id: u32,
    pub(crate) status: Option<S>,
    pub(crate) failure: Option<StopReason>,
    pub(crate) kill: KillOutcome,
    pub(crate) cleanup_wait_failed: bool,
    pub(crate) end_confirmed: bool,
    pub(crate) elapsed: Duration,
}

pub(crate) enum StartFailure { Spawn(io::Error), Unavailable }

// Private source-test seams only. No CLI/environment can select a process,
// clock, thread starter, deadline or alternative signalling primitive.
pub(crate) trait ProbeProcess {
    type Status;
    fn id(&self) -> u32;
    fn try_wait(&mut self) -> io::Result<Option<Self::Status>>;
    fn kill(&mut self) -> io::Result<()>;
}
impl ProbeProcess for Child {
    type Status = ExitStatus;
    fn id(&self) -> u32 { Child::id(self) }
    fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> { Child::try_wait(self) }
    fn kill(&mut self) -> io::Result<()> { Child::kill(self) }
}

trait Clock {
    fn elapsed(&self) -> Duration;
    fn sleep(&mut self, duration: Duration);
}
struct RealClock { started: Instant }
impl Clock for RealClock {
    fn elapsed(&self) -> Duration { self.started.elapsed() }
    fn sleep(&mut self, duration: Duration) { std::thread::sleep(duration); }
}

fn pause(clock: &mut impl Clock, deadline: Duration) {
    if let Some(remaining) = deadline.checked_sub(clock.elapsed()) {
        if !remaining.is_zero() { clock.sleep(remaining.min(POLL_INTERVAL)); }
    }
}

// Called only immediately after this owned Child returned Ok(None), never
// from a numeric PID, after an observed exit or blindly after a wait error.
fn signal_once(process: &mut impl ProbeProcess, outcome: &mut KillOutcome) {
    if *outcome != KillOutcome::NotRequested { return; }
    *outcome = match process.kill() {
        Ok(()) => KillOutcome::Sent,
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => KillOutcome::Denied,
        Err(_) => KillOutcome::Failed,
    };
}

fn observe<P: ProbeProcess>(process: &mut P, clock: &mut impl Clock) -> Observation<P::Status> {
    let process_id = process.id();
    let (failure, fresh_running) = loop {
        match process.try_wait() {
            Ok(Some(status)) => return Observation { process_id, status: Some(status), failure: None,
                kill: KillOutcome::NotRequested, cleanup_wait_failed: false, end_confirmed: true,
                elapsed: clock.elapsed() },
            Err(_) => break (StopReason::WaitFailed, false),
            Ok(None) if clock.elapsed() >= OBSERVE_LIMIT => break (StopReason::Timeout, true),
            Ok(None) => pause(clock, OBSERVE_LIMIT),
        }
    };
    let cleanup_deadline = clock.elapsed().saturating_add(CLEANUP_LIMIT);
    let mut kill = KillOutcome::NotRequested;
    let mut cleanup_wait_failed = false;
    if fresh_running { signal_once(process, &mut kill); }
    loop {
        match process.try_wait() {
            Ok(Some(status)) => return Observation { process_id, status: Some(status), failure: Some(failure),
                kill, cleanup_wait_failed, end_confirmed: true, elapsed: clock.elapsed() },
            // A later fresh None can permit the single direct signal after an
            // earlier wait error. An already attempted signal is never retried.
            Ok(None) if clock.elapsed() < cleanup_deadline => signal_once(process, &mut kill),
            Ok(None) => {},
            Err(_) => cleanup_wait_failed = true,
        }
        if clock.elapsed() >= cleanup_deadline {
            return Observation { process_id, status: None, failure: Some(failure), kill,
                cleanup_wait_failed, end_confirmed: false, elapsed: clock.elapsed() };
        }
        pause(clock, cleanup_deadline);
    }
}

pub(crate) struct ProbeSlot<P> { child: Mutex<Option<P>> }
impl<P: ProbeProcess> ProbeSlot<P> {
    pub(crate) fn observe(&self, spawn: impl FnOnce() -> io::Result<P>, started: Instant)
        -> Result<Observation<P::Status>, StartFailure> {
        self.observe_with(spawn, &mut RealClock { started })
    }
    fn observe_with(&self, spawn: impl FnOnce() -> io::Result<P>, clock: &mut impl Clock)
        -> Result<Observation<P::Status>, StartFailure> {
        // Only the one diagnostic observer uses this private slot. No GUI,
        // lifecycle, shutdown or product-retirement path may lock or join it.
        let mut held = self.child.try_lock().map_err(|_| StartFailure::Unavailable)?;
        if held.is_some() { return Err(StartFailure::Unavailable); }
        *held = Some(spawn().map_err(StartFailure::Spawn)?);
        let result = observe(held.as_mut().ok_or(StartFailure::Unavailable)?, clock);
        if result.end_confirmed { held.take(); }
        // Child::drop neither kills nor reaps. The scheduler's persistent slot
        // retains this exact unconfirmed handle; no second stage is permitted.
        Ok(result)
    }
}

type Task = Box<dyn FnOnce() + Send + 'static>;
struct Scheduler<P> {
    attempted: AtomicBool,
    retained: OnceLock<Arc<ProbeSlot<P>>>,
}
impl<P: Send + 'static> Scheduler<P> {
    const fn new() -> Self { Self { attempted: AtomicBool::new(false), retained: OnceLock::new() } }
    fn schedule(&self, work: impl FnOnce(&ProbeSlot<P>) + Send + 'static) -> ScheduleOutcome {
        self.schedule_with(work, |task| std::thread::Builder::new()
            .name("core-diagnostic-observer".into()).spawn(task).map(|_| ()))
    }
    fn schedule_with(&self, work: impl FnOnce(&ProbeSlot<P>) + Send + 'static,
        start: impl FnOnce(Task) -> io::Result<()>) -> ScheduleOutcome {
        if self.attempted.swap(true, Ordering::AcqRel) { return ScheduleOutcome::AlreadyAttempted; }
        let slot = Arc::clone(self.retained.get_or_init(|| Arc::new(ProbeSlot { child: Mutex::new(None) })));
        // The closure contains no Child yet. A failed Builder::spawn therefore
        // cannot silently drop a running child. The once flag is never reset.
        match start(Box::new(move || work(&slot))) {
            Ok(()) => ScheduleOutcome::Scheduled,
            Err(_) => ScheduleOutcome::Unavailable,
        }
    }
}

static SCHEDULER: Scheduler<Child> = Scheduler::new();
pub(crate) fn schedule(work: impl FnOnce(&ProbeSlot<Child>) + Send + 'static) -> ScheduleOutcome {
    // At most one read-only observer and one retained child per app process.
    // Statics outlive a detached observer; shutdown never joins this diagnostic.
    SCHEDULER.schedule(work)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::VecDeque, sync::{atomic::AtomicUsize, mpsc}};

    #[derive(Clone, Copy)]
    enum Step { Running, Exit(bool), Error }
    struct FakeChild {
        steps: VecDeque<Step>, fallback: Step, kill_error: Option<io::ErrorKind>,
        kills: Arc<AtomicUsize>, drops: Arc<AtomicUsize>,
    }
    impl ProbeProcess for FakeChild {
        type Status = bool;
        fn id(&self) -> u32 { 42 }
        fn try_wait(&mut self) -> io::Result<Option<bool>> {
            match self.steps.pop_front().unwrap_or(self.fallback) {
                Step::Running => Ok(None), Step::Exit(success) => Ok(Some(success)),
                Step::Error => Err(io::Error::other("PRIVATE vendor wait text")),
            }
        }
        fn kill(&mut self) -> io::Result<()> {
            self.kills.fetch_add(1, Ordering::AcqRel);
            self.kill_error.map_or(Ok(()), |kind| Err(io::Error::new(kind, "PRIVATE kill text")))
        }
    }
    impl Drop for FakeChild { fn drop(&mut self) { self.drops.fetch_add(1, Ordering::AcqRel); } }
    #[derive(Default)]
    struct FakeClock { elapsed: Duration, sleeps: Vec<Duration> }
    impl Clock for FakeClock {
        fn elapsed(&self) -> Duration { self.elapsed }
        fn sleep(&mut self, duration: Duration) { self.sleeps.push(duration); self.elapsed += duration; }
    }
    fn child(steps: &[Step], fallback: Step, kill_error: Option<io::ErrorKind>)
        -> (FakeChild, Arc<AtomicUsize>, Arc<AtomicUsize>) {
        let kills = Arc::new(AtomicUsize::new(0)); let drops = Arc::new(AtomicUsize::new(0));
        (FakeChild { steps: steps.iter().copied().collect(), fallback, kill_error,
            kills: kills.clone(), drops: drops.clone() }, kills, drops)
    }
    fn slot() -> ProbeSlot<FakeChild> { ProbeSlot { child: Mutex::new(None) } }
    fn expired() -> FakeClock { FakeClock { elapsed: OBSERVE_LIMIT, sleeps: Vec::new() } }
    fn observed(slot: &ProbeSlot<FakeChild>, child: FakeChild, clock: &mut FakeClock) -> Observation<bool> {
        match slot.observe_with(|| Ok(child), clock) { Ok(value) => value, Err(_) => panic!("probe did not start") }
    }

    #[test]
    fn diagnostic_probe_normal_exit_reaps_without_a_signal() {
        for success in [true, false] {
            let owner = slot(); let (process, kills, drops) = child(&[Step::Exit(success)], Step::Running, None);
            let result = observed(&owner, process, &mut FakeClock::default());
            assert_eq!(result.status, Some(success)); assert_eq!(result.failure, None);
            assert_eq!(result.process_id, 42); assert!(result.end_confirmed);
            assert_eq!(kills.load(Ordering::Acquire), 0); assert_eq!(drops.load(Ordering::Acquire), 1);
            assert!(owner.child.lock().unwrap().is_none());
        }
    }
    #[test]
    fn diagnostic_probe_timeout_is_three_plus_one_seconds_and_retains_exact_child() {
        let owner = slot(); let (process, kills, drops) = child(&[], Step::Running, None);
        let mut clock = FakeClock::default(); let result = observed(&owner, process, &mut clock);
        assert_eq!(result.failure, Some(StopReason::Timeout)); assert_eq!(result.status, None);
        assert!(!result.end_confirmed); assert_eq!(result.kill, KillOutcome::Sent);
        assert_eq!(result.elapsed, OBSERVE_LIMIT + CLEANUP_LIMIT);
        assert!(clock.sleeps.iter().all(|value| *value <= POLL_INTERVAL));
        assert_eq!(kills.load(Ordering::Acquire), 1); assert_eq!(drops.load(Ordering::Acquire), 0);
        assert!(owner.child.lock().unwrap().is_some());
        let (extra, _, _) = child(&[Step::Exit(true)], Step::Running, None);
        let mut started = false;
        assert!(matches!(owner.observe_with(|| { started = true; Ok(extra) }, &mut clock), Err(StartFailure::Unavailable)));
        assert!(!started, "an unconfirmed predecessor forbids a second stage");
    }
    #[test]
    fn diagnostic_probe_kill_failure_is_fixed_and_never_retried() {
        for (kind, expected, code) in [
            (io::ErrorKind::PermissionDenied, KillOutcome::Denied, "STANDALONE_CORE_PROBE_KILL_DENIED"),
            (io::ErrorKind::Other, KillOutcome::Failed, "STANDALONE_CORE_PROBE_KILL_FAILED"),
        ] {
            let owner = slot(); let (process, kills, drops) = child(&[], Step::Running, Some(kind));
            let result = observed(&owner, process, &mut expired());
            assert_eq!(result.failure.unwrap().code(), "STANDALONE_CORE_PROBE_TIMEOUT");
            assert_eq!(result.kill, expected); assert_eq!(result.kill.error_code(), Some(code));
            assert!(!result.end_confirmed); assert_eq!(kills.load(Ordering::Acquire), 1);
            assert_eq!(drops.load(Ordering::Acquire), 0);
        }
    }
    #[test]
    fn diagnostic_probe_wait_errors_need_a_fresh_running_observation_before_signal() {
        let owner = slot(); let (process, kills, drops) = child(&[Step::Error, Step::Running, Step::Exit(true)], Step::Error, None);
        let result = observed(&owner, process, &mut FakeClock::default());
        assert_eq!(result.failure.unwrap().code(), "STANDALONE_CORE_PROBE_WAIT_FAILED");
        assert_eq!(result.status, Some(true)); assert!(result.end_confirmed);
        assert_eq!(kills.load(Ordering::Acquire), 1); assert_eq!(drops.load(Ordering::Acquire), 1);
        assert!(result.failure.is_some(), "late zero exit is not a successful diagnostic stage");
        let owner = slot(); let (process, kills, drops) = child(&[], Step::Error, None);
        let result = observed(&owner, process, &mut FakeClock::default());
        assert!(result.cleanup_wait_failed); assert!(!result.end_confirmed);
        assert_eq!(result.elapsed, CLEANUP_LIMIT); assert_eq!(kills.load(Ordering::Acquire), 0);
        assert_eq!(drops.load(Ordering::Acquire), 0);
    }
    #[test]
    fn diagnostic_probe_cleanup_wait_errors_preserve_timeout_and_single_kill() {
        let owner = slot(); let (process, kills, drops) = child(&[Step::Running], Step::Error, None);
        let result = observed(&owner, process, &mut expired());
        assert_eq!(result.failure, Some(StopReason::Timeout)); assert!(result.cleanup_wait_failed);
        assert_eq!(result.kill, KillOutcome::Sent); assert!(!result.end_confirmed);
        assert_eq!(kills.load(Ordering::Acquire), 1); assert_eq!(drops.load(Ordering::Acquire), 0);
    }
    #[test]
    fn diagnostic_probe_late_exit_is_reaped_without_turning_timeout_into_ready() {
        let owner = slot(); let (process, kills, drops) = child(&[Step::Running, Step::Exit(true)], Step::Running, None);
        let result = observed(&owner, process, &mut expired());
        assert!(result.end_confirmed); assert_eq!(result.failure, Some(StopReason::Timeout));
        assert_eq!(kills.load(Ordering::Acquire), 1); assert_eq!(drops.load(Ordering::Acquire), 1);
        assert!(owner.child.lock().unwrap().is_none());
    }
    #[test]
    fn diagnostic_probe_failed_thread_start_never_creates_or_drops_a_child_and_is_once_only() {
        let scheduler = Scheduler::<FakeChild>::new(); let starts = Arc::new(AtomicUsize::new(0));
        let observed_starts = starts.clone();
        let result = scheduler.schedule_with(move |_| { observed_starts.fetch_add(1, Ordering::AcqRel); },
            |task| { drop(task); Err(io::Error::other("PRIVATE thread start text")) });
        assert_eq!(result, ScheduleOutcome::Unavailable); assert_eq!(starts.load(Ordering::Acquire), 0);
        assert!(scheduler.retained.get().unwrap().child.lock().unwrap().is_none());
        assert_eq!(scheduler.schedule_with(|_| panic!("must not run"), |_| panic!("must not start")),
            ScheduleOutcome::AlreadyAttempted);
        assert_eq!(OBSERVER_UNAVAILABLE, "STANDALONE_CORE_PROBE_OBSERVER_UNAVAILABLE");
    }
    #[test]
    fn diagnostic_probe_real_observer_returns_but_scheduler_keeps_unconfirmed_child() {
        let scheduler = Scheduler::<FakeChild>::new(); let (done, received) = mpsc::channel();
        let kills = Arc::new(AtomicUsize::new(0)); let drops = Arc::new(AtomicUsize::new(0));
        let observed_kills = kills.clone(); let observed_drops = drops.clone();
        assert_eq!(scheduler.schedule(move |owner| {
            let process = FakeChild { steps: VecDeque::new(), fallback: Step::Running, kill_error: None,
                kills: observed_kills, drops: observed_drops };
            let result = observed(owner, process, &mut FakeClock::default());
            done.send(result.end_confirmed).unwrap();
        }), ScheduleOutcome::Scheduled);
        assert!(!received.recv_timeout(Duration::from_secs(2)).unwrap());
        assert_eq!(kills.load(Ordering::Acquire), 1); assert_eq!(drops.load(Ordering::Acquire), 0);
        assert!(scheduler.retained.get().unwrap().child.lock().unwrap().is_some());
        assert_eq!(scheduler.schedule(|_| panic!("never a second observer")), ScheduleOutcome::AlreadyAttempted);
        assert_eq!(END_UNCONFIRMED, "STANDALONE_CORE_PROBE_END_UNCONFIRMED");
    }
    #[test]
    fn diagnostic_probe_spawn_error_leaves_empty_slot_and_no_success_receipt() {
        let owner = slot();
        let error = owner.observe_with(|| Err(io::Error::new(io::ErrorKind::PermissionDenied, "PRIVATE spawn text")),
            &mut FakeClock::default());
        assert!(matches!(error, Err(StartFailure::Spawn(error)) if error.kind() == io::ErrorKind::PermissionDenied));
        assert!(owner.child.lock().unwrap().is_none());
    }
    #[test]
    fn diagnostic_probe_real_clock_adapter_uses_the_same_observation_path() {
        let owner = slot(); let (process, kills, drops) = child(&[Step::Exit(true)], Step::Running, None);
        let result = owner.observe(|| Ok(process), Instant::now()).ok().unwrap();
        assert!(result.end_confirmed); assert_eq!(kills.load(Ordering::Acquire), 0);
        assert_eq!(drops.load(Ordering::Acquire), 1);
        // Exercise the exact production Child adapter's public types on Windows
        // without starting an OS process or selecting a runtime test mode.
        let _: &Scheduler<Child> = &SCHEDULER;
        let _entry: fn(fn(&ProbeSlot<Child>)) -> ScheduleOutcome = schedule;
    }
}
