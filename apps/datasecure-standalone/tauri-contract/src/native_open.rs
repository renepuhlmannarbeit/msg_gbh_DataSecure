//! A native handoff owns its child until wait completes. This is independent
//! of the GUI event loop and never captures helper output or user paths.
use std::{io, process::{Child, Command, ExitStatus, Stdio}, sync::mpsc, thread};

pub fn handoff<F>(mut command: Command, completed: F) -> io::Result<()>
where F: FnOnce(io::Result<ExitStatus>) + Send + 'static {
    let (sender, receiver) = mpsc::sync_channel::<Child>(1);
    // Arrange ownership BEFORE starting the OS helper. A failed thread start
    // cannot leave a started child without a waiter.
    thread::Builder::new().name("datasecure-native-open".into()).spawn(move || {
        if let Ok(mut child) = receiver.recv() { completed(child.wait()); }
    })?;
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn()?;
    if let Err(error) = sender.send(child) {
        let mut child = error.0;
        let _ = child.kill();
        let _ = child.wait();
        return Err(io::Error::new(io::ErrorKind::BrokenPipe, "native open waiter unavailable"));
    }
    Ok(())
}

pub fn handoff_before_exit(mut command: Command) -> io::Result<ExitStatus> {
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = command.spawn()?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if std::time::Instant::now() < deadline => thread::sleep(std::time::Duration::from_millis(25)),
            other => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(other.err().unwrap_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "native open handoff timed out")));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn actual_helpers_are_waited_and_exit_status_is_observed() {
        for exit in [0, 7, 0, 0] {
            #[cfg(windows)]
            let mut command = {
                use std::os::windows::process::CommandExt;
                let mut c = Command::new("cmd.exe");
                c.args(["/c", &format!("exit {exit}")]).creation_flags(0x08000000);
                c
            };
            #[cfg(not(windows))]
            let mut command = { let mut c = Command::new("/bin/sh"); c.args(["-c", &format!("exit {exit}")]); c };
            command.stdin(Stdio::null());
            let (tx, rx) = mpsc::channel();
            handoff(command, move |status| { let _ = tx.send(status.unwrap().code()); }).unwrap();
            assert_eq!(rx.recv_timeout(Duration::from_secs(10)).unwrap(), Some(exit));
        }
    }
    #[test]
    fn missing_helper_is_a_synchronous_handoff_failure() {
        assert!(handoff(Command::new("datasecure-no-such-helper-012345"), |_| {}).is_err());
    }
}
