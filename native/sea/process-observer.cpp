#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <limits>

// Engineering-only observer. It never starts, kills or enumerates processes,
// reads product data, or grants product/Cowork release. The caller must arm it
// against its own fixture worker before deliberately terminating the parent.
namespace {

constexpr char kSchema[] = "datasecure-sea-process-observer/v1";
constexpr DWORD kDrainMilliseconds = 5000;
constexpr DWORD kPathCharacters = 32768;
constexpr DWORD kMaximumLineBytes = 96;

bool EmitEvent(const char* event) {
  return std::fprintf(stdout, "{\"schema\":\"%s\",\"event\":\"%s\"}\n", kSchema, event) >= 0 &&
         std::fflush(stdout) == 0;
}

int Fail(const char* code) {
  std::fprintf(stdout, "{\"schema\":\"%s\",\"event\":\"failed\",\"code\":\"%s\"}\n", kSchema, code);
  std::fflush(stdout);
  return 2;
}

class OwnedHandle {
 public:
  explicit OwnedHandle(HANDLE value = nullptr) : value_(value) {}
  ~OwnedHandle() {
    if (valid()) CloseHandle(value_);
  }
  OwnedHandle(const OwnedHandle&) = delete;
  OwnedHandle& operator=(const OwnedHandle&) = delete;
  HANDLE get() const { return value_; }
  bool valid() const { return value_ != nullptr && value_ != INVALID_HANDLE_VALUE; }

 private:
  HANDLE value_;
};

DWORD Remaining(ULONGLONG deadline) {
  const ULONGLONG now = GetTickCount64();
  return now >= deadline ? 0 : static_cast<DWORD>(deadline - now);
}

enum class IoStatus { ok, deadline, failed };

// CancelIoEx requests cancellation; it does not prove that OVERLAPPED or its
// buffer can be freed. Drain completion before returning to any caller. If the
// OS cannot confirm completion within the bounded grace, terminate this helper
// without unwinding live I/O storage. Process teardown then owns cancellation.
class PendingOperation {
 public:
  explicit PendingOperation(HANDLE pipe)
      : pipe_(pipe), event_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {
    operation_.hEvent = event_.get();
  }
  ~PendingOperation() {
    if (!pending_) return;
    CancelIoEx(pipe_, &operation_);
    const DWORD waited = WaitForSingleObject(event_.get(), kDrainMilliseconds);
    DWORD ignored = 0;
    if (waited != WAIT_OBJECT_0 ||
        (!GetOverlappedResult(pipe_, &operation_, &ignored, FALSE) &&
         GetLastError() == ERROR_IO_INCOMPLETE)) {
      Fail("OBSERVER_IO_CANCEL_PENDING");
      ExitProcess(2);
    }
  }
  PendingOperation(const PendingOperation&) = delete;
  PendingOperation& operator=(const PendingOperation&) = delete;
  bool valid() const { return event_.valid(); }
  OVERLAPPED* get() { return &operation_; }
  IoStatus Await(ULONGLONG deadline, DWORD* transferred) {
    pending_ = true;
    const DWORD waited = WaitForSingleObject(event_.get(), Remaining(deadline));
    if (waited == WAIT_TIMEOUT) return IoStatus::deadline;
    if (waited != WAIT_OBJECT_0) return IoStatus::failed;
    if (!GetOverlappedResult(pipe_, &operation_, transferred, FALSE)) {
      if (GetLastError() != ERROR_IO_INCOMPLETE) pending_ = false;
      return IoStatus::failed;
    }
    pending_ = false;
    return IoStatus::ok;
  }

 private:
  HANDLE pipe_;
  OwnedHandle event_;
  OVERLAPPED operation_{};
  bool pending_ = false;
};

IoStatus Connect(HANDLE pipe, ULONGLONG deadline) {
  if (Remaining(deadline) == 0) return IoStatus::deadline;
  PendingOperation operation(pipe);
  if (!operation.valid()) return IoStatus::failed;
  if (ConnectNamedPipe(pipe, operation.get())) return IoStatus::ok;
  const DWORD error = GetLastError();
  if (error == ERROR_PIPE_CONNECTED) return IoStatus::ok;
  if (error != ERROR_IO_PENDING) return IoStatus::failed;
  DWORD ignored = 0;
  return operation.Await(deadline, &ignored);
}

IoStatus Transfer(HANDLE pipe, void* buffer, DWORD length, bool writing,
                  ULONGLONG deadline, DWORD* transferred) {
  if (Remaining(deadline) == 0) return IoStatus::deadline;
  PendingOperation operation(pipe);
  if (!operation.valid()) return IoStatus::failed;
  const BOOL completed = writing
      ? WriteFile(pipe, buffer, length, transferred, operation.get())
      : ReadFile(pipe, buffer, length, transferred, operation.get());
  if (completed) return IoStatus::ok;
  if (GetLastError() != ERROR_IO_PENDING) return IoStatus::failed;
  return operation.Await(deadline, transferred);
}

const char* ReadExpectedLine(HANDLE pipe, const char* expected, ULONGLONG deadline) {
  char buffer[kMaximumLineBytes]{};
  DWORD used = 0;
  while (used < kMaximumLineBytes) {
    DWORD received = 0;
    const IoStatus status = Transfer(pipe, buffer + used, kMaximumLineBytes - used,
                                     false, deadline, &received);
    if (status == IoStatus::deadline) return "OBSERVER_DEADLINE";
    if (status != IoStatus::ok || received == 0 || received > kMaximumLineBytes - used)
      return "OBSERVER_PIPE_IO_FAILED";
    const DWORD previous = used;
    used += received;
    for (DWORD index = previous; index < used; ++index) {
      if (buffer[index] == '\n') {
        // No pipelined/extra commands, CRLF, null bytes, or trailing fields.
        return index + 1 == used && used == std::strlen(expected) &&
                       std::memcmp(buffer, expected, used) == 0
            ? nullptr : "OBSERVER_PROTOCOL_INVALID";
      }
    }
  }
  return "OBSERVER_PROTOCOL_INVALID";
}

const char* WriteLine(HANDLE pipe, char* line, ULONGLONG deadline) {
  const DWORD length = static_cast<DWORD>(std::strlen(line));
  DWORD written = 0;
  while (written < length) {
    DWORD count = 0;
    const IoStatus status = Transfer(pipe, line + written, length - written, true,
                                     deadline, &count);
    if (status == IoStatus::deadline) return "OBSERVER_DEADLINE";
    if (status != IoStatus::ok || count == 0 || count > length - written)
      return "OBSERVER_PIPE_IO_FAILED";
    written += count;
  }
  return nullptr;
}

bool ParseNumber(const wchar_t* value, DWORD minimum, DWORD maximum, DWORD* result) {
  if (value == nullptr || *value == L'\0') return false;
  std::uint64_t number = 0;
  for (const wchar_t* cursor = value; *cursor != L'\0'; ++cursor) {
    if (*cursor < L'0' || *cursor > L'9') return false;
    const DWORD digit = static_cast<DWORD>(*cursor - L'0');
    if (number > (static_cast<std::uint64_t>(maximum) - digit) / 10) return false;
    number = number * 10 + digit;
    if (number > maximum) return false;
  }
  if (number < minimum) return false;
  *result = static_cast<DWORD>(number);
  return true;
}

bool IsHex(const wchar_t* value, std::size_t length) {
  if (value == nullptr || std::wcslen(value) != length) return false;
  for (std::size_t index = 0; index < length; ++index) {
    if (!((value[index] >= L'0' && value[index] <= L'9') ||
          (value[index] >= L'a' && value[index] <= L'f'))) return false;
  }
  return true;
}

bool IsNativeX64() {
  using Check = BOOL(WINAPI*)(HANDLE, USHORT*, USHORT*);
  const HMODULE kernel = GetModuleHandleW(L"kernel32.dll");
  if (kernel == nullptr) return false;
  const auto check = reinterpret_cast<Check>(GetProcAddress(kernel, "IsWow64Process2"));
  if (check == nullptr) return false;
  USHORT processMachine = IMAGE_FILE_MACHINE_UNKNOWN;
  USHORT nativeMachine = IMAGE_FILE_MACHINE_UNKNOWN;
  return check(GetCurrentProcess(), &processMachine, &nativeMachine) != FALSE &&
         nativeMachine == IMAGE_FILE_MACHINE_AMD64 &&
         processMachine == IMAGE_FILE_MACHINE_UNKNOWN && sizeof(void*) == 8;
}

bool NormalizeImage(const wchar_t* image, wchar_t* normalized) {
  const std::size_t length = std::wcslen(image);
  if (length < 7 || length >= kPathCharacters || _wcsicmp(image + length - 4, L".exe") != 0)
    return false;
  const bool driveAbsolute = ((image[0] >= L'A' && image[0] <= L'Z') ||
                              (image[0] >= L'a' && image[0] <= L'z')) &&
                             image[1] == L':' && image[2] == L'\\';
  const bool uncAbsolute = image[0] == L'\\' && image[1] == L'\\' &&
                           image[2] != L'.' && image[2] != L'\0';
  if (!driveAbsolute && !uncAbsolute) return false;
  const DWORD count = GetFullPathNameW(image, kPathCharacters, normalized, nullptr);
  return count != 0 && count < kPathCharacters;
}

bool SameClient(HANDLE pipe, DWORD expected) {
  ULONG actual = 0;
  return GetNamedPipeClientProcessId(pipe, &actual) != FALSE && actual == expected;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  DWORD workerPid = 0;
  DWORD parentPid = 0;
  DWORD timeout = 0;
  wchar_t expectedImage[kPathCharacters]{};
  if ((argc != 6 && argc != 8) ||
      !ParseNumber(argv[1], 1, std::numeric_limits<DWORD>::max(), &workerPid) ||
      !IsHex(argv[2], 32) || !IsHex(argv[3], 64) ||
      !NormalizeImage(argv[4], expectedImage) || !ParseNumber(argv[5], 100, 120000, &timeout))
    return Fail("OBSERVER_ARGUMENTS_INVALID");
  if (argc == 8 &&
      (std::wcscmp(argv[6], L"--parent-pid") != 0 ||
       !ParseNumber(argv[7], 1, std::numeric_limits<DWORD>::max(), &parentPid) ||
       parentPid == workerPid || parentPid == GetCurrentProcessId()))
    return Fail("OBSERVER_ARGUMENTS_INVALID");
  if (!IsNativeX64()) return Fail("OBSERVER_UNSUPPORTED_HOST");

  const ULONGLONG deadline = GetTickCount64() + timeout;
  wchar_t pipeName[128]{};
  if (swprintf_s(pipeName, L"\\\\.\\pipe\\datasecure-sea-observer-%s", argv[2]) < 0)
    return Fail("OBSERVER_ARGUMENTS_INVALID");
  const OwnedHandle pipe(CreateNamedPipeW(pipeName,
      PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
      PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
      1, 1024, 1024, 0, nullptr));
  if (!pipe.valid()) return Fail("OBSERVER_PIPE_CREATE_FAILED");
  if (!EmitEvent("listening")) return 2;
  const IoStatus connected = Connect(pipe.get(), deadline);
  if (connected == IoStatus::deadline) return Fail("OBSERVER_DEADLINE");
  if (connected != IoStatus::ok) return Fail("OBSERVER_PIPE_CONNECT_FAILED");
  if (!SameClient(pipe.get(), workerPid)) return Fail("OBSERVER_CLIENT_MISMATCH");

  // Open once, while the expected client is connected. Never reopen by PID
  // after parent termination: the retained kernel object survives PID reuse.
  const OwnedHandle worker(OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
                                        FALSE, workerPid));
  if (!worker.valid()) return Fail("OBSERVER_PROCESS_OPEN_FAILED");
  FILETIME created{}, ended{}, kernel{}, user{};
  wchar_t actualImage[kPathCharacters]{};
  wchar_t normalizedActual[kPathCharacters]{};
  DWORD imageCharacters = kPathCharacters;
  if (!GetProcessTimes(worker.get(), &created, &ended, &kernel, &user) ||
      (created.dwHighDateTime == 0 && created.dwLowDateTime == 0) ||
      !QueryFullProcessImageNameW(worker.get(), 0, actualImage, &imageCharacters) ||
      !NormalizeImage(actualImage, normalizedActual) || _wcsicmp(normalizedActual, expectedImage) != 0)
    return Fail("OBSERVER_PROCESS_IDENTITY_INVALID");
  if (WaitForSingleObject(worker.get(), 0) != WAIT_TIMEOUT)
    return Fail("OBSERVER_PROCESS_EXITED_EARLY");

  // Optional ordered observation of the caller's cooperative fixture parent.
  // This held handle proves termination ordering, not process ancestry or a
  // successful product batch. Never reopen the parent by PID after arming.
  const OwnedHandle parent(parentPid == 0 ? nullptr :
      OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parentPid));
  if (parentPid != 0) {
    if (!parent.valid()) return Fail("OBSERVER_PARENT_OPEN_FAILED");
    imageCharacters = kPathCharacters;
    if (!GetProcessTimes(parent.get(), &created, &ended, &kernel, &user) ||
        (created.dwHighDateTime == 0 && created.dwLowDateTime == 0) ||
        !QueryFullProcessImageNameW(parent.get(), 0, actualImage, &imageCharacters) ||
        !NormalizeImage(actualImage, normalizedActual) ||
        _wcsicmp(normalizedActual, expectedImage) != 0)
      return Fail("OBSERVER_PARENT_IDENTITY_INVALID");
    if (WaitForSingleObject(parent.get(), 0) != WAIT_TIMEOUT)
      return Fail("OBSERVER_PARENT_EXITED_EARLY");
  }

  char nonce[65]{};
  for (std::size_t index = 0; index < 64; ++index) nonce[index] = static_cast<char>(argv[3][index]);
  char hello[kMaximumLineBytes]{};
  char challenge[kMaximumLineBytes]{};
  char ready[kMaximumLineBytes]{};
  if (sprintf_s(hello, "hello %s\n", nonce) < 0 ||
      sprintf_s(challenge, "challenge %s\n", nonce) < 0 ||
      sprintf_s(ready, "ready %s\n", nonce) < 0) return Fail("OBSERVER_PROTOCOL_INVALID");
  const char* error = ReadExpectedLine(pipe.get(), hello, deadline);
  if (error != nullptr) return Fail(error);
  error = WriteLine(pipe.get(), challenge, deadline);
  if (error != nullptr) return Fail(error);
  error = ReadExpectedLine(pipe.get(), ready, deadline);
  if (error != nullptr) return Fail(error);
  if (!SameClient(pipe.get(), workerPid)) return Fail("OBSERVER_CLIENT_MISMATCH");
  if (WaitForSingleObject(worker.get(), 0) != WAIT_TIMEOUT)
    return Fail("OBSERVER_PROCESS_EXITED_EARLY");
  if (parent.valid() && WaitForSingleObject(parent.get(), 0) != WAIT_TIMEOUT)
    return Fail("OBSERVER_PARENT_EXITED_EARLY");
  if (Remaining(deadline) == 0) return Fail("OBSERVER_DEADLINE");
  if (!EmitEvent("armed")) return 2;

  if (parent.valid()) {
    // Worker is deliberately index zero: if both handles are signalled at the
    // wait, their ordering is unknown and must fail closed. After observing the
    // parent, require the worker to remain alive before emitting parent-exited.
    const HANDLE processes[] = {worker.get(), parent.get()};
    const DWORD first = WaitForMultipleObjects(2, processes, FALSE, Remaining(deadline));
    if (first == WAIT_TIMEOUT) return Fail("OBSERVER_DEADLINE");
    if (first == WAIT_OBJECT_0) return Fail("OBSERVER_WORKER_ENDED_BEFORE_PARENT");
    if (first != WAIT_OBJECT_0 + 1) return Fail("OBSERVER_PROCESS_WAIT_FAILED");
    const DWORD workerState = WaitForSingleObject(worker.get(), 0);
    if (workerState == WAIT_OBJECT_0) return Fail("OBSERVER_WORKER_ENDED_BEFORE_PARENT");
    if (workerState != WAIT_TIMEOUT) return Fail("OBSERVER_PROCESS_WAIT_FAILED");
    if (!EmitEvent("parent-exited")) return 2;
  }

  const DWORD waited = WaitForSingleObject(worker.get(), Remaining(deadline));
  if (waited == WAIT_TIMEOUT) return Fail("OBSERVER_DEADLINE");
  if (waited != WAIT_OBJECT_0) return Fail("OBSERVER_PROCESS_WAIT_FAILED");
  DWORD exitCode = 0;
  if (!GetExitCodeProcess(worker.get(), &exitCode)) return Fail("OBSERVER_PROCESS_EXIT_QUERY_FAILED");
  // 259 is legal after the process handle has signalled; it is not a reason to
  // poll a PID or reinterpret a verified exit as STILL_ACTIVE.
  return std::fprintf(stdout, "{\"schema\":\"%s\",\"event\":\"exited\",\"exit_code\":%lu}\n",
                      kSchema, static_cast<unsigned long>(exitCode)) >= 0 && std::fflush(stdout) == 0 ? 0 : 2;
}
