#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <cstdint>
#include <cwchar>
#include <limits>
#include <string>
#include <vector>

namespace {

constexpr int kUsageError = 120;
constexpr int kSetupError = 121;
constexpr int kStartError = 122;
constexpr int kAssignError = 123;
constexpr int kWaitError = 124;
constexpr int kResourceLimit = 125;
constexpr int kUnsupportedHost = 126;

bool IsNativeAmd64Host() {
  using IsWow64Process2Function = BOOL(WINAPI*)(HANDLE, USHORT*, USHORT*);
  const HMODULE kernel = GetModuleHandleW(L"kernel32.dll");
  if (kernel == nullptr) return false;
  const auto check = reinterpret_cast<IsWow64Process2Function>(
      GetProcAddress(kernel, "IsWow64Process2"));
  if (check == nullptr) return false;
  USHORT process_machine = IMAGE_FILE_MACHINE_UNKNOWN;
  USHORT native_machine = IMAGE_FILE_MACHINE_UNKNOWN;
  return check(GetCurrentProcess(), &process_machine, &native_machine) != FALSE &&
         native_machine == IMAGE_FILE_MACHINE_AMD64;
}

bool ParseUnsigned(const wchar_t* value, std::uint64_t minimum,
                   std::uint64_t maximum, std::uint64_t* output) {
  if (value == nullptr || *value == L'\0') return false;
  wchar_t* end = nullptr;
  const unsigned long long parsed = std::wcstoull(value, &end, 10);
  if (end == value || *end != L'\0' || parsed < minimum || parsed > maximum) {
    return false;
  }
  *output = static_cast<std::uint64_t>(parsed);
  return true;
}

std::wstring QuoteArgument(const std::wstring& value) {
  if (!value.empty() && value.find_first_of(L" \t\n\v\"") == std::wstring::npos) {
    return value;
  }
  std::wstring quoted = L"\"";
  std::size_t slashes = 0;
  for (const wchar_t character : value) {
    if (character == L'\\') {
      ++slashes;
      continue;
    }
    if (character == L'\"') {
      quoted.append(slashes * 2 + 1, L'\\');
      quoted.push_back(L'\"');
      slashes = 0;
      continue;
    }
    quoted.append(slashes, L'\\');
    slashes = 0;
    quoted.push_back(character);
  }
  quoted.append(slashes * 2, L'\\');
  quoted.push_back(L'\"');
  return quoted;
}

bool DuplicateInheritable(HANDLE source, HANDLE* duplicate) {
  if (source == nullptr || source == INVALID_HANDLE_VALUE) return false;
  return DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), duplicate,
                         0, TRUE, DUPLICATE_SAME_ACCESS) != FALSE;
}

void CloseIfValid(HANDLE handle) {
  if (handle != nullptr && handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  if (!IsNativeAmd64Host()) return kUnsupportedHost;
  if (argc == 2 && std::wcscmp(argv[1], L"--probe-host") == 0) return 0;
  if (argc < 10 || std::wcscmp(argv[1], L"--memory-mib") != 0 ||
      std::wcscmp(argv[3], L"--cpu-ms") != 0 ||
      std::wcscmp(argv[5], L"--wall-ms") != 0 || std::wcscmp(argv[7], L"--") != 0) {
    return kUsageError;
  }

  std::uint64_t memory_mib = 0;
  std::uint64_t cpu_ms = 0;
  std::uint64_t wall_ms = 0;
  if (!ParseUnsigned(argv[2], 32, 4096, &memory_mib) ||
      !ParseUnsigned(argv[4], 100, 600000, &cpu_ms) ||
      !ParseUnsigned(argv[6], 100, 600000, &wall_ms)) {
    return kUsageError;
  }

  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (job == nullptr) return kSetupError;
  HANDLE completion = CreateIoCompletionPort(INVALID_HANDLE_VALUE, nullptr, 0, 1);
  if (completion == nullptr) {
    CloseHandle(job);
    return kSetupError;
  }
  JOBOBJECT_ASSOCIATE_COMPLETION_PORT association{};
  association.CompletionKey = job;
  association.CompletionPort = completion;
  if (!SetInformationJobObject(job, JobObjectAssociateCompletionPortInformation,
                               &association, sizeof(association))) {
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags =
      JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
      JOB_OBJECT_LIMIT_PROCESS_MEMORY | JOB_OBJECT_LIMIT_JOB_MEMORY |
      JOB_OBJECT_LIMIT_PROCESS_TIME;
  limits.BasicLimitInformation.ActiveProcessLimit = 1;
  const std::uint64_t memory_bytes = memory_mib * 1024ULL * 1024ULL;
  if (memory_bytes > static_cast<std::uint64_t>(std::numeric_limits<SIZE_T>::max())) {
    CloseHandle(completion);
    CloseHandle(job);
    return kUsageError;
  }
  limits.ProcessMemoryLimit = static_cast<SIZE_T>(memory_bytes);
  limits.JobMemoryLimit = static_cast<SIZE_T>(memory_bytes);
  limits.BasicLimitInformation.PerProcessUserTimeLimit.QuadPart =
      static_cast<LONGLONG>(cpu_ms * 10000ULL);
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits,
                               sizeof(limits))) {
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }

  HANDLE child_stdin = nullptr;
  HANDLE child_stdout = nullptr;
  HANDLE child_stderr = nullptr;
  if (!DuplicateInheritable(GetStdHandle(STD_INPUT_HANDLE), &child_stdin) ||
      !DuplicateInheritable(GetStdHandle(STD_OUTPUT_HANDLE), &child_stdout) ||
      !DuplicateInheritable(GetStdHandle(STD_ERROR_HANDLE), &child_stderr)) {
    CloseIfValid(child_stdin);
    CloseIfValid(child_stdout);
    CloseIfValid(child_stderr);
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }

  std::wstring command_line;
  for (int index = 8; index < argc; ++index) {
    if (!command_line.empty()) command_line.push_back(L' ');
    command_line.append(QuoteArgument(argv[index]));
  }
  std::vector<wchar_t> mutable_command(command_line.begin(), command_line.end());
  mutable_command.push_back(L'\0');

  SIZE_T attribute_bytes = 0;
  InitializeProcThreadAttributeList(nullptr, 2, 0, &attribute_bytes);
  std::vector<unsigned char> attribute_storage(attribute_bytes);
  auto* attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attribute_storage.data());
  if (!InitializeProcThreadAttributeList(attributes, 2, 0, &attribute_bytes)) {
    CloseIfValid(child_stdin);
    CloseIfValid(child_stdout);
    CloseIfValid(child_stderr);
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }
  HANDLE inherited_handles[] = {child_stdin, child_stdout, child_stderr};
  HANDLE child_jobs[] = {job};
  if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                 inherited_handles, sizeof(inherited_handles), nullptr, nullptr) ||
      !UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
                                 child_jobs, sizeof(child_jobs), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(attributes);
    CloseIfValid(child_stdin);
    CloseIfValid(child_stdout);
    CloseIfValid(child_stderr);
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }

  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = child_stdin;
  startup.StartupInfo.hStdOutput = child_stdout;
  startup.StartupInfo.hStdError = child_stderr;
  startup.lpAttributeList = attributes;
  PROCESS_INFORMATION process{};
  const DWORD flags = CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT;
  // Windows 10+ assigns the Job Object atomically during process creation.
  // A launcher killed between CreateProcess and a later AssignProcess call
  // otherwise leaves a suspended child outside KILL_ON_JOB_CLOSE forever.
  const BOOL created = CreateProcessW(argv[8], mutable_command.data(), nullptr, nullptr, TRUE,
                                      flags, nullptr, nullptr, &startup.StartupInfo, &process);
  DeleteProcThreadAttributeList(attributes);
  CloseIfValid(child_stdin);
  CloseIfValid(child_stdout);
  CloseIfValid(child_stderr);
  if (!created) {
    CloseHandle(completion);
    CloseHandle(job);
    return kStartError;
  }

  BOOL in_job = FALSE;
  if (!IsProcessInJob(process.hProcess, job, &in_job) || in_job == FALSE) {
    TerminateProcess(process.hProcess, kAssignError);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(completion);
    CloseHandle(job);
    return kAssignError;
  }
  if (ResumeThread(process.hThread) == static_cast<DWORD>(-1)) {
    TerminateProcess(process.hProcess, kSetupError);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(completion);
    CloseHandle(job);
    return kSetupError;
  }
  CloseHandle(process.hThread);

  const DWORD wait_result = WaitForSingleObject(process.hProcess, static_cast<DWORD>(wall_ms));
  if (wait_result == WAIT_TIMEOUT) {
    TerminateJobObject(job, kResourceLimit);
    WaitForSingleObject(process.hProcess, 5000);
    CloseHandle(process.hProcess);
    CloseHandle(completion);
    CloseHandle(job);
    return kResourceLimit;
  }
  if (wait_result != WAIT_OBJECT_0) {
    TerminateJobObject(job, kWaitError);
    CloseHandle(process.hProcess);
    CloseHandle(completion);
    CloseHandle(job);
    return kWaitError;
  }
  DWORD exit_code = kWaitError;
  if (!GetExitCodeProcess(process.hProcess, &exit_code)) exit_code = kWaitError;
  bool resource_limited = false;
  for (;;) {
    DWORD message = 0;
    ULONG_PTR key = 0;
    LPOVERLAPPED detail = nullptr;
    if (!GetQueuedCompletionStatus(completion, &message, &key, &detail, 0)) break;
    if (message == JOB_OBJECT_MSG_PROCESS_MEMORY_LIMIT ||
        message == JOB_OBJECT_MSG_JOB_MEMORY_LIMIT ||
        message == JOB_OBJECT_MSG_END_OF_PROCESS_TIME ||
        message == JOB_OBJECT_MSG_END_OF_JOB_TIME) {
      resource_limited = true;
    }
  }
  CloseHandle(process.hProcess);
  CloseHandle(completion);
  CloseHandle(job);
  if (resource_limited) return kResourceLimit;
  return static_cast<int>(exit_code);
}
