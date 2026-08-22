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
       WAIT_ERROR = 124, RESOURCE_LIMIT = 125 };

static volatile sig_atomic_t child_group = -1;

static void terminate_group(int signal_number) {
  (void)signal_number;
  if (child_group > 0) kill(-child_group, SIGKILL);
  _exit(RESOURCE_LIMIT);
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

static void kill_and_reap(pid_t pid) {
  int status;
  kill(-pid, SIGKILL);
  while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
}

int main(int argc, char **argv) {
  uint64_t memory_mib = 0, cpu_ms = 0, wall_ms = 0;
  uint64_t memory_bytes, started;
  pid_t pid;
  struct sigaction action;
  if (argc < 10 || strcmp(argv[1], "--memory-mib") != 0 ||
      strcmp(argv[3], "--cpu-ms") != 0 || strcmp(argv[5], "--wall-ms") != 0 ||
      strcmp(argv[7], "--") != 0 ||
      !parse_unsigned(argv[2], 32, 4096, &memory_mib) ||
      !parse_unsigned(argv[4], 100, 600000, &cpu_ms) ||
      !parse_unsigned(argv[6], 100, 600000, &wall_ms)) return USAGE_ERROR;
  memory_bytes = memory_mib * 1024ULL * 1024ULL;
  memset(&action, 0, sizeof(action));
  action.sa_handler = terminate_group;
  sigemptyset(&action.sa_mask);
  if (sigaction(SIGINT, &action, NULL) != 0 || sigaction(SIGTERM, &action, NULL) != 0 ||
      sigaction(SIGHUP, &action, NULL) != 0) return SETUP_ERROR;

  pid = fork();
  if (pid < 0) return START_ERROR;
  if (pid == 0) {
    struct rlimit cpu_limit;
    struct rlimit core_limit;
    uint64_t seconds = (cpu_ms + 999ULL) / 1000ULL;
    if (setpgid(0, 0) != 0) _exit(SETUP_ERROR);
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || getppid() == 1) _exit(SETUP_ERROR);
#endif
    cpu_limit.rlim_cur = (rlim_t)seconds;
    cpu_limit.rlim_max = (rlim_t)seconds;
    core_limit.rlim_cur = 0;
    core_limit.rlim_max = 0;
    if (setrlimit(RLIMIT_CPU, &cpu_limit) != 0 || setrlimit(RLIMIT_CORE, &core_limit) != 0) {
      _exit(SETUP_ERROR);
    }
    execvp(argv[8], &argv[8]);
    _exit(START_ERROR);
  }

  child_group = pid;
  if (setpgid(pid, pid) != 0 && errno != EACCES) {
    kill_and_reap(pid);
    return SETUP_ERROR;
  }
  started = monotonic_ms();
  if (started == UINT64_MAX) {
    kill_and_reap(pid);
    return SETUP_ERROR;
  }
  for (;;) {
    int status = 0;
    pid_t waited = waitpid(pid, &status, WNOHANG);
    if (waited == pid) {
      child_group = -1;
      if (WIFEXITED(status)) return WEXITSTATUS(status);
      if (WIFSIGNALED(status)) return RESOURCE_LIMIT;
      return WAIT_ERROR;
    }
    if (waited < 0 && errno != EINTR) {
      kill_and_reap(pid);
      return WAIT_ERROR;
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
        child_group = -1;
        return RESOURCE_LIMIT;
      }
    }
    {
      struct timespec pause = { 0, 10 * 1000 * 1000 };
      while (nanosleep(&pause, &pause) != 0 && errno == EINTR) {}
    }
  }
}
