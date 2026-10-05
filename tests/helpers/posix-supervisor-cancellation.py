"""Real Linux supervisor cancellation boundaries; runnable on Windows via WSL.

No macOS PASS is inferred. Native macOS still runs the separate shell suite.
All descendant handles are pinned with Linux pidfds and reaped by our subreaper.
The optional negative controls compile private mutant copies, not product files.
"""

import argparse
import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "native/ocr/pilot/posix-sandbox.c"
SHIM = Path(__file__).with_name("posix-waitid-boundary.c")
CHILD = r"""
import json, os, signal, subprocess, sys
descendant = subprocess.Popen(['/bin/sleep', '30'])
print(json.dumps({'direct': os.getpid(), 'descendant': descendant.pid}), flush=True)
if sys.argv[1] == 'before-observation':
    os.kill(os.getppid(), signal.SIGSTOP)
    os.kill(os.getppid(), signal.SIGTERM)
os._exit(7 if sys.argv[1] == 'normal' else 0)
"""


def process_record(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"state": fields[0], "parent": int(fields[1]), "group": int(fields[2]),
                "started": fields[19]}
    except FileNotFoundError:
        return None


def until(predicate, label, seconds=4):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.005)
    raise AssertionError(f"POSIX boundary timeout: {label}")


def pinned_descendant(pid, direct):
    initial = process_record(pid)
    assert initial and initial["group"] == direct, "descendant must belong to the owned group"
    handle = os.pidfd_open(pid)
    current = process_record(pid)
    if not current or current["started"] != initial["started"]:
        os.close(handle)
        raise AssertionError("PID changed before pinning")
    return handle


def reap_owned(pid):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        try:
            waited, _ = os.waitpid(pid, os.WNOHANG)
            if waited == pid:
                return
        except ChildProcessError:
            if process_record(pid) is None:
                return
        time.sleep(0.005)
    raise AssertionError(f"owned descendant was not reaped: {pid}")


def case(supervisor, shim, mode, expected, expect_live=False, inherited_ignore=False):
    environment = dict(os.environ)
    if mode == "between-observation-and-reap":
        environment["LD_PRELOAD"] = str(shim)
    else:
        environment.pop("LD_PRELOAD", None)
    owned = None
    descendant_handle = None
    identities = None
    sentinel = subprocess.Popen(["/bin/sleep", "30"], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
    try:
        owned = subprocess.Popen([str(supervisor), "--memory-mib", "128", "--cpu-ms", "5000",
                                  "--wall-ms", "10000", "--", sys.executable, "-c", CHILD, mode],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 env=environment,
                                 preexec_fn=(lambda: signal.signal(signal.SIGCHLD, signal.SIG_IGN))
                                 if inherited_ignore else None)
        # Reading an FD is bounded with select; no hung test may own a parser indefinitely.
        import select
        assert select.select([owned.stdout], [], [], 4)[0], "child did not report its real PID"
        identities = json.loads(owned.stdout.readline())
        descendant_handle = pinned_descendant(identities["descendant"], identities["direct"])
        if mode == "before-observation":
            until(lambda: (process_record(owned.pid) or {}).get("state") == "T", "supervisor stopped")
            until(lambda: (process_record(identities["direct"]) or {}).get("state") == "Z", "direct child exited")
            owned.send_signal(signal.SIGCONT)
        elif mode == "between-observation-and-reap":
            assert select.select([owned.stderr], [], [], 4)[0], "waitid observation boundary not reached"
            assert owned.stderr.readline().strip() == "POSIX_EXIT_OBSERVED_BEFORE_REAP"
            until(lambda: (process_record(owned.pid) or {}).get("state") == "T", "waitid boundary stopped")
            owned.send_signal(signal.SIGTERM)
            owned.send_signal(signal.SIGCONT)
        assert owned.wait(timeout=4) == expected, "supervisor terminal result changed"
        def dead():
            record = process_record(identities["descendant"])
            return record is None or record["state"] == "Z"
        if expect_live:
            assert not dead(), "negative control must expose a live descendant"
        else:
            until(dead, "descendant terminated before completed supervisor exit")
            assert process_record(identities["direct"]) is None, "direct child must already be reaped"
        assert sentinel.poll() is None, "cleanup must not signal an unrelated process group"
        print(json.dumps({"case": mode, "inherited_sigchld_ignore": inherited_ignore,
                          "exit": expected, "descendant_alive": not dead(),
                          "unrelated_process_preserved": True}), flush=True)
    finally:
        try:
            if owned is not None:
                # The Popen handle is ours; SIGCONT ensures a stopped test can be killed/reaped.
                if owned.poll() is None:
                    owned.send_signal(signal.SIGCONT)
                    owned.kill()
                owned.wait(timeout=4)
        finally:
            try:
                if descendant_handle is not None:
                    try:
                        signal.pidfd_send_signal(descendant_handle, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    finally:
                        os.close(descendant_handle)
                if identities:
                    try:
                        reap_owned(identities["descendant"])
                    finally:
                        reap_owned(identities["direct"])
            finally:
                if sentinel.poll() is None:
                    sentinel.kill()
                sentinel.wait(timeout=4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("supervisor", type=Path)
    parser.add_argument("--negative-controls", action="store_true")
    args = parser.parse_args()
    if sys.platform != "linux":
        raise SystemExit("NOT_RUN: the controlled waitid/subreaper boundary requires a real Linux host")
    assert hasattr(os, "pidfd_open") and hasattr(signal, "pidfd_send_signal"), "Linux pidfd support required"
    assert args.supervisor.resolve().is_file(), "compiled supervisor required"
    libc = ctypes.CDLL(None, use_errno=True)
    assert libc.prctl(36, 1, 0, 0, 0) == 0, "own test descendants require PR_SET_CHILD_SUBREAPER"
    scope = Path(tempfile.mkdtemp(prefix="datasecure-posix-cancellation-"))
    expected_files = {"boundary.so", "mutant-cleanup.c", "mutant-cleanup",
                      "mutant-ownership.c", "mutant-ownership"}
    try:
        shim = scope / "boundary.so"
        subprocess.run(["cc", "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-shared",
                        "-fPIC", str(SHIM), "-ldl", "-o", str(shim)], check=True, timeout=30)
        case(args.supervisor.resolve(), shim, "before-observation", 125)
        case(args.supervisor.resolve(), shim, "between-observation-and-reap", 125)
        case(args.supervisor.resolve(), shim, "normal", 7)
        case(args.supervisor.resolve(), shim, "normal", 7, inherited_ignore=True)
        if args.negative_controls:
            source = SOURCE.read_text()
            cleanup_line = "      if (kill_and_reap(pid) != 0) return WAIT_ERROR;\n      if (cancellation_requested) return RESOURCE_LIMIT;"
            assert source.count(cleanup_line) == 1, "negative control must mutate only terminal cleanup"
            assert source.count("WEXITED | WNOHANG | WNOWAIT") == 1, "negative control must mutate only exit observation"
            mutations = [("cleanup", source.replace(cleanup_line,
                          "      if (cancellation_requested) return RESOURCE_LIMIT;"), 125),
                         ("ownership", source.replace("WEXITED | WNOHANG | WNOWAIT",
                                                      "WEXITED | WNOHANG"), 98)]
            for name, content, expected in mutations:
                fixture = scope / f"mutant-{name}.c"
                executable = scope / f"mutant-{name}"
                fixture.write_text(content)
                subprocess.run(["cc", "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
                                str(fixture), "-o", str(executable)], check=True, timeout=30)
                case(executable, shim, "between-observation-and-reap", expected, expect_live=True)
        print("Real Linux POSIX cancellation boundaries: 4 positive cases PASS; "
              + ("2 leak/ownership negative controls detected" if args.negative_controls else "negative controls not requested"))
    finally:
        # No recursive cleanup and no globs: only enumerated private compiler outputs.
        children = list(scope.iterdir())
        assert all(child.name in expected_files and child.is_file() and not child.is_symlink()
                   for child in children), "unexpected private compiler artifact; preserve for inspection"
        for child in children:
            child.unlink()
        scope.rmdir()


if __name__ == "__main__":
    main()
