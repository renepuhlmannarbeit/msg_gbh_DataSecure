#define _GNU_SOURCE 1
#include <dlfcn.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/* Linux-only OS scheduling instrumentation, not a mocked wait implementation.
   Both wait calls and all signals still go to libc/the real kernel. */
static pid_t observed_child;
static int boundary_stopped;

int waitid(idtype_t type, id_t id, siginfo_t *info, int options) {
  int (*real_waitid)(idtype_t, id_t, siginfo_t *, int) = dlsym(RTLD_NEXT, "waitid");
  int result = real_waitid(type, id, info, options);
  if (!boundary_stopped && result == 0 && type == P_PID &&
      (options & WEXITED) && info->si_pid != 0) {
    observed_child = info->si_pid;
    boundary_stopped = 1;
    fputs("POSIX_EXIT_OBSERVED_BEFORE_REAP\n", stderr);
    fflush(stderr);
    kill(getpid(), SIGSTOP);
  }
  return result;
}

int kill(pid_t pid, int signal_number) {
  int (*real_kill)(pid_t, int) = dlsym(RTLD_NEXT, "kill");
  if (observed_child != 0 && pid == -observed_child && signal_number == SIGKILL) {
    int (*real_waitid)(idtype_t, id_t, siginfo_t *, int) = dlsym(RTLD_NEXT, "waitid");
    siginfo_t retained;
    memset(&retained, 0, sizeof(retained));
    if (real_waitid(P_PID, (id_t)observed_child, &retained, WEXITED | WNOHANG | WNOWAIT) != 0 ||
        retained.si_pid != observed_child) {
      /* A negative control which reaps first must not pass an ownership test. */
      _exit(98);
    }
  }
  return real_kill(pid, signal_number);
}
