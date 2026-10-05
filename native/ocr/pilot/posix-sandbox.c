#ifdef __APPLE__
#define _DARWIN_C_SOURCE 1
#else
#define _POSIX_C_SOURCE 200809L
#endif
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#ifdef __APPLE__
#include <libproc.h>
#endif
#ifdef __linux__
#include <sys/prctl.h>
#endif

enum { USAGE_ERROR = 120, SETUP_ERROR = 121, START_ERROR = 122,
       WAIT_ERROR = 124, RESOURCE_LIMIT = 125,
       EXECUTABLE_MISSING = 127, EXECUTABLE_DENIED = 128, EXECUTABLE_FORMAT = 129,
       DEPENDENCY_MISSING = 132,
       CPU_LIMIT_SETUP_ERROR = 130, CORE_LIMIT_SETUP_ERROR = 131,
       FILE_LIMIT_SETUP_ERROR = 134, OPEN_FILE_LIMIT_SETUP_ERROR = 135 };

#ifdef __APPLE__
#define CONTRACT_JSON "{\"schema\":\"datasecure-posix-sandbox/v1\",\"limits\":[\"cpu\",\"file_size\",\"open_files\",\"rss\",\"wallclock\"],\"process_group_reap\":true}\n"
#else
#define CONTRACT_JSON "{\"schema\":\"datasecure-posix-sandbox/v1\",\"limits\":[\"cpu\",\"file_size\",\"open_files\",\"rss\",\"wallclock\"],\"process_group_reap\":true}\n"
#endif

static volatile sig_atomic_t cancellation_requested = 0;

static void terminate_group(int signal_number) {
  (void)signal_number;
  // The handler may run before a process group exists. Do not exit before the
  // parent can reconcile its own child and reap it; never kill an inherited group.
  cancellation_requested = 1;
}

static int parse_unsigned(const char *text, uint64_t minimum, uint64_t maximum,
                          uint64_t *result) {
  char *end = NULL;
  unsigned long long value;
  if (text == NULL || *text == '\0' || *text == '-') return 0;
  errno = 0;
  value = strtoull(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0' || value < minimum || value > maximum) return 0;
  *result = (uint64_t)value;
  return 1;
}

static uint64_t monotonic_ms(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return UINT64_MAX;
  return (uint64_t)value.tv_sec * 1000ULL + (uint64_t)value.tv_nsec / 1000000ULL;
}

static uint64_t resident_bytes(pid_t pid) {
#ifdef __APPLE__
  struct rusage_info_v2 info;
  memset(&info, 0, sizeof(info));
  if (proc_pid_rusage(pid, RUSAGE_INFO_V2, (rusage_info_t *)&info) != 0) return UINT64_MAX;
  return info.ri_phys_footprint;
#elif defined(__linux__)
  char name[64];
  FILE *file;
  unsigned long total_pages = 0;
  unsigned long resident_pages = 0;
  long page_size;
  if (snprintf(name, sizeof(name), "/proc/%ld/statm", (long)pid) <= 0) return UINT64_MAX;
  file = fopen(name, "r");
  if (file == NULL) return UINT64_MAX;
  if (fscanf(file, "%lu %lu", &total_pages, &resident_pages) != 2) {
    fclose(file);
    return UINT64_MAX;
  }
  fclose(file);
  page_size = sysconf(_SC_PAGESIZE);
  if (page_size <= 0 || resident_pages > UINT64_MAX / (uint64_t)page_size) return UINT64_MAX;
  return (uint64_t)resident_pages * (uint64_t)page_size;
#else
  (void)pid;
  return UINT64_MAX;
#endif
}

static int kill_and_reap(pid_t pid) {
  int status;
  pid_t waited;
  kill(-pid, SIGKILL);
  // Covers a failed/unfinished setpgid. This PID belongs to us until waitpid;
  // it cannot be recycled while our child remains unreaped.
  kill(pid, SIGKILL);
  do { waited = waitpid(pid, &status, 0); } while (waited < 0 && errno == EINTR);
  return waited == pid ? 0 : -1;
}

/* A hosted process may inherit a hard limit below DataSecure's requested
   ceiling.  POSIX permits an unprivileged process to lower rlim_max, but not
   to raise it.  Keep the stricter inherited ceiling instead of failing the
   parser before exec (notably on hosted macOS runners). */
static int apply_limit_ceiling(int resource, rlim_t requested) {
  struct rlimit inherited;
  struct rlimit bounded;
  if (getrlimit(resource, &inherited) != 0) return -1;
  bounded.rlim_cur = requested;
  bounded.rlim_max = requested;
  if (inherited.rlim_max != RLIM_INFINITY && requested > inherited.rlim_max) {
    bounded.rlim_cur = inherited.rlim_max;
    bounded.rlim_max = inherited.rlim_max;
  }
  return setrlimit(resource, &bounded);
}

int main(int argc, char **argv) {
  uint64_t memory_mib = 0, cpu_ms = 0, wall_ms = 0;
  uint64_t memory_bytes, started;
  pid_t pid;
  struct sigaction action;
  sigset_t cancellation_signals, previous_mask;
  if (argc == 2 && strcmp(argv[1], "--sandbox-contract") == 0) {
    if (fputs(CONTRACT_JSON, stdout) == EOF || fflush(stdout) != 0) return WAIT_ERROR;
    return 0;
  }
  if (argc < 10 || strcmp(argv[1], "--memory-mib") != 0 ||
      strcmp(argv[3], "--cpu-ms") != 0 || strcmp(argv[5], "--wall-ms") != 0 ||
      strcmp(argv[7], "--") != 0 ||
      !parse_unsigned(argv[2], 32, 4096, &memory_mib) ||
      !parse_unsigned(argv[4], 100, 600000, &cpu_ms) ||
      !parse_unsigned(argv[6], 100, 600000, &wall_ms)) return USAGE_ERROR;
  memory_bytes = memory_mib * 1024ULL * 1024ULL;
  sigemptyset(&cancellation_signals);
  sigaddset(&cancellation_signals, SIGINT);
  sigaddset(&cancellation_signals, SIGTERM);
  sigaddset(&cancellation_signals, SIGHUP);
  if (sigprocmask(SIG_BLOCK, &cancellation_signals, &previous_mask) != 0) return SETUP_ERROR;
  memset(&action, 0, sizeof(action));
  action.sa_handler = terminate_group;
  sigemptyset(&action.sa_mask);
  if (sigaction(SIGINT, &action, NULL) != 0 || sigaction(SIGTERM, &action, NULL) != 0 ||
      sigaction(SIGHUP, &action, NULL) != 0) return SETUP_ERROR;
  // An inherited SIG_IGN/SA_NOCLDWAIT must not auto-reap our group leader:
  // the unreaped child is the ownership/PID-reuse guard for group cleanup.
  action.sa_handler = SIG_DFL;
  if (sigaction(SIGCHLD, &action, NULL) != 0) return SETUP_ERROR;

  pid = fork();
  if (pid < 0) return START_ERROR;
  if (pid == 0) {
    uint64_t seconds = (cpu_ms + 999ULL) / 1000ULL;
    if (setpgid(0, 0) != 0) _exit(SETUP_ERROR);
    action.sa_handler = SIG_DFL;
    if (sigaction(SIGINT, &action, NULL) != 0 || sigaction(SIGTERM, &action, NULL) != 0 ||
        sigaction(SIGHUP, &action, NULL) != 0 ||
        sigprocmask(SIG_SETMASK, &previous_mask, NULL) != 0) _exit(SETUP_ERROR);
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || getppid() == 1) _exit(SETUP_ERROR);
#endif
    if (apply_limit_ceiling(RLIMIT_CPU, (rlim_t)seconds) != 0) _exit(CPU_LIMIT_SETUP_ERROR);
    if (apply_limit_ceiling(RLIMIT_CORE, (rlim_t)0) != 0) _exit(CORE_LIMIT_SETUP_ERROR);
    if (apply_limit_ceiling(RLIMIT_FSIZE, (rlim_t)(64ULL * 1024ULL * 1024ULL)) != 0) {
      _exit(FILE_LIMIT_SETUP_ERROR);
    }
    if (apply_limit_ceiling(RLIMIT_NOFILE, (rlim_t)64) != 0) _exit(OPEN_FILE_LIMIT_SETUP_ERROR);
    // argv[8] is an absolute, verified runtime path. No PATH search and no
    // execvp ENOEXEC shell fallback: invalid binaries are not shell programs.
    execv(argv[8], &argv[8]);
    {
      int start_errno = errno;
      struct stat executable;
      if (start_errno == EACCES || start_errno == EPERM) _exit(EXECUTABLE_DENIED);
      if (start_errno == ENOEXEC
#ifdef EBADARCH
          || start_errno == EBADARCH
#endif
         ) _exit(EXECUTABLE_FORMAT);
      if (start_errno == ENOENT || start_errno == ENOTDIR) {
        if (stat(argv[8], &executable) == 0 && S_ISREG(executable.st_mode)) _exit(DEPENDENCY_MISSING);
        _exit(EXECUTABLE_MISSING);
      }
      _exit(START_ERROR);
    }
  }

  if (setpgid(pid, pid) != 0 &&
      !(errno == EACCES && getpgid(pid) == pid) && errno != ESRCH) {
    kill_and_reap(pid);
    return SETUP_ERROR;
  }
  if (sigprocmask(SIG_SETMASK, &previous_mask, NULL) != 0) {
    kill_and_reap(pid);
    return SETUP_ERROR;
  }
  started = monotonic_ms();
  if (started == UINT64_MAX) {
    kill_and_reap(pid);
    return SETUP_ERROR;
  }
  for (;;) {
    siginfo_t observed;
    int waited;
    if (cancellation_requested) {
      if (kill_and_reap(pid) != 0) return WAIT_ERROR;
      return RESOURCE_LIMIT;
    }
    memset(&observed, 0, sizeof(observed));
    // Observe without reaping. Killing a numeric group AFTER waitpid would
    // allow PID/PGID reuse and could signal an unrelated new process group.
    waited = waitid(P_PID, (id_t)pid, &observed, WEXITED | WNOHANG | WNOWAIT);
    if (waited == 0 && observed.si_pid == pid) {
      // Reconcile the owned group even after normal child exit. This also
      // covers cancellation arriving between exit observation and return:
      // the leader reserves its PID until every group signal is complete.
      if (kill_and_reap(pid) != 0) return WAIT_ERROR;
      if (cancellation_requested) return RESOURCE_LIMIT;
      if (observed.si_code == CLD_EXITED) return observed.si_status;
      if (observed.si_code == CLD_KILLED || observed.si_code == CLD_DUMPED) return RESOURCE_LIMIT;
      return WAIT_ERROR;
    }
    if (waited < 0 && errno != EINTR) {
      // ECHILD means ownership is absent: never signal a potentially reused
      // numeric PID/PGID. The explicit SIGCHLD disposition prevents this in
      // the normal single-threaded parent, which is the only reaper here.
      if (errno != ECHILD) kill_and_reap(pid);
      return WAIT_ERROR;
    }
    if (cancellation_requested) {
      if (kill_and_reap(pid) != 0) return WAIT_ERROR;
      return RESOURCE_LIMIT;
    }
    {
      uint64_t now = monotonic_ms();
      uint64_t rss = resident_bytes(pid);
      if (now == UINT64_MAX || rss == UINT64_MAX) {
        kill_and_reap(pid);
        return SETUP_ERROR;
      }
      if (now - started >= wall_ms || rss > memory_bytes) {
        kill_and_reap(pid);
        return RESOURCE_LIMIT;
      }
    }
    {
      struct timespec pause = { 0, 10 * 1000 * 1000 };
      while (nanosleep(&pause, &pause) != 0 && errno == EINTR && !cancellation_requested) {}
    }
  }
}
