// Engineering-only: compile the exact copied production translation unit.
// API return injection is a classification test, never a real OS failure claim.
#define NOMINMAX
#include <windows.h>
#include <cstdio>
#include <cwchar>
#include <string>
#include <vector>

enum class Scenario { Real, WaitTimeout, WaitFailure, TerminationFailure };
static Scenario scenario = Scenario::Real;
static HANDLE held_process = nullptr;
static DWORD held_pid = 0;
static int waits = 0;
static bool termination_requested = false;
static BOOL actual_termination = FALSE;
static DWORD actual_second_wait = WAIT_FAILED;

static BOOL WINAPI ObservedCreateProcessW(LPCWSTR application, LPWSTR command,
    LPSECURITY_ATTRIBUTES process_attributes, LPSECURITY_ATTRIBUTES thread_attributes,
    BOOL inherit, DWORD flags, LPVOID environment, LPCWSTR directory,
    LPSTARTUPINFOW startup, LPPROCESS_INFORMATION process) {
  const BOOL result = ::CreateProcessW(application, command, process_attributes,
      thread_attributes, inherit, flags, environment, directory, startup, process);
  if (result) {
    held_pid = process->dwProcessId;
    if (!::DuplicateHandle(GetCurrentProcess(), process->hProcess, GetCurrentProcess(),
        &held_process, SYNCHRONIZE, FALSE, 0)) {
      ::TerminateProcess(process->hProcess, 90);
      ::WaitForSingleObject(process->hProcess, 5000);
      ::CloseHandle(process->hThread);
      ::CloseHandle(process->hProcess);
      return FALSE;
    }
  }
  return result;
}

static BOOL WINAPI ObservedTerminateJobObject(HANDLE job, UINT code) {
  termination_requested = true;
  const BOOL result = ::TerminateJobObject(job, code);
  actual_termination = result;
  // Actually terminate the own synthetic child before injecting the return.
  if (scenario == Scenario::TerminationFailure) {
    SetLastError(ERROR_ACCESS_DENIED);
    return FALSE;
  }
  return result;
}

static DWORD WINAPI ObservedWaitForSingleObject(HANDLE process, DWORD milliseconds) {
  const DWORD actual = ::WaitForSingleObject(process, milliseconds);
  ++waits;
  if (waits == 2) actual_second_wait = actual;
  if (waits == 2 && scenario == Scenario::WaitTimeout) return WAIT_TIMEOUT;
  if (waits == 2 && scenario == Scenario::WaitFailure) {
    SetLastError(ERROR_INVALID_HANDLE);
    return WAIT_FAILED;
  }
  return actual;
}

#define CreateProcessW ObservedCreateProcessW
#define TerminateJobObject ObservedTerminateJobObject
#define WaitForSingleObject ObservedWaitForSingleObject
#define wmain production_wmain
#include "candidate-source.cpp"
#undef wmain
#undef WaitForSingleObject
#undef TerminateJobObject
#undef CreateProcessW

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && std::wcscmp(argv[1], L"--test-child") == 0) {
    ::Sleep(INFINITE);
    return 91;
  }
  std::vector<wchar_t> image(32768);
  const DWORD length = GetModuleFileNameW(nullptr, image.data(), static_cast<DWORD>(image.size()));
  if (length == 0 || length >= image.size()) return 92;
  std::wstring executable(image.data(), length);
  std::printf("{\"schema\":\"datasecure-native-wait-classification-proof/1\",\"rows\":[");
  for (int index = 0; index < 4; ++index) {
    scenario = static_cast<Scenario>(index);
    held_process = nullptr; held_pid = 0; waits = 0; termination_requested = false;
    actual_termination = FALSE; actual_second_wait = WAIT_FAILED;
    std::vector<std::wstring> values{executable, L"--memory-mib", L"64", L"--cpu-ms",
      L"10000", L"--wall-ms", L"100", L"--", executable, L"--test-child"};
    std::vector<wchar_t*> args;
    for (auto& value : values) args.push_back(value.data());
    const int outcome = production_wmain(static_cast<int>(args.size()), args.data());
    // The held handle refers to the original process object, never a PID reopen.
    const DWORD actual_end = held_process ? ::WaitForSingleObject(held_process, 5000) : WAIT_FAILED;
    if (held_process) ::CloseHandle(held_process);
    if (index) std::printf(",");
    std::printf("{\"scenario\":%d,\"outcome\":%d,\"expected_after_fix\":%d,"
      "\"termination_requested\":%s,\"wait_calls\":%d,\"pid\":%lu,\"held_process_ended\":%s,"
      "\"actual_termination_succeeded\":%s,\"actual_second_wait\":%lu}",
      index, outcome, index == 1 || index == 2 ? 124 : 125,
      termination_requested ? "true" : "false", waits, held_pid,
      actual_end == WAIT_OBJECT_0 ? "true" : "false", actual_termination ? "true" : "false", actual_second_wait);
    if (actual_end != WAIT_OBJECT_0) return 93;
  }
  std::printf("]}\n");
  return std::fflush(stdout) == 0 ? 0 : 94;
}
