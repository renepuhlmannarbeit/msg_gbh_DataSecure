/* Node-API 8. Synchronous, process-owned cooperative lock; never unlink anchor.
 * No global handles, callbacks, worker threads, timers, subprocesses or PID locks.
 * A privileged/hostile same-account namespace writer is outside this boundary.
 */
#define NAPI_VERSION 8
#ifdef __APPLE__
#define _DARWIN_C_SOURCE 1
#endif
#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stddef.h>
#include <aclapi.h>
#include <sddl.h>
#include <delayimp.h>
/* The shipped host/SEA need not be named node.exe. Resolve delayed Node-API
 * imports exclusively in the already running main module, never search/load a
 * second node.exe. No generic dependency path override is exposed. */
static FARPROC WINAPI node_host_import(unsigned notification, PDelayLoadInfo info) {
  if (notification == dliNotePreLoadLibrary && info && info->szDll && !_stricmp(info->szDll, "node.exe")) {
    union { HMODULE module; FARPROC function; } address;
    _Static_assert(sizeof(HMODULE) == sizeof(FARPROC), "Windows handle ABI");
    address.module = GetModuleHandleW(NULL); return address.function;
  }
  return NULL;
}
const PfnDliHook __pfnDliNotifyHook2 = node_host_import;
#else
#if !defined(__APPLE__)
#error Ownership guard supports Windows and macOS only
#endif
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/acl.h>
#include <sys/mount.h>
#endif

#define MAX_DEPTH 256
#define ANCHOR "ownership-control.lock"
static const napi_type_tag ROOT_TAG = { UINT64_C(0x04a77eba5874131d), UINT64_C(0x930540b870ba83f6) };
static const napi_type_tag GUARD_TAG = { UINT64_C(0x4e6a3ce9dbcb8f47), UINT64_C(0xb26180687b25b125) };
#ifdef _WIN32
typedef HANDLE NativeFile;
#define INVALID_FILE INVALID_HANDLE_VALUE
typedef BY_HANDLE_FILE_INFORMATION Identity;
#else
typedef int NativeFile;
#define INVALID_FILE (-1)
typedef struct stat Identity;
#endif
typedef struct Root {
  napi_env env;
  unsigned refs, guards, depth;
  bool closed, poisoned, anchor_known;
  NativeFile dirs[MAX_DEPTH];
  Identity ids[MAX_DEPTH], anchor_id;
#ifdef _WIN32
  wchar_t *path;
#else
  char *names[MAX_DEPTH];
#endif
} Root;
typedef struct Guard { napi_env env; Root *root; NativeFile file; bool closed; } Guard;

static napi_value fail(napi_env env, const char *code) { napi_throw_error(env, code, code); return NULL; }
static napi_value js_bool(napi_env env, bool value) {
  napi_value result; if (napi_get_boolean(env, value, &result) != napi_ok) return fail(env, "OWNERSHIP_GUARD_INTERNAL"); return result;
}
static bool args(napi_env env, napi_callback_info info, size_t wanted, napi_value *values) {
  size_t count = 0;
  if (napi_get_cb_info(env, info, &count, NULL, NULL, NULL) != napi_ok || count != wanted) return false;
  return napi_get_cb_info(env, info, &count, values, NULL, NULL) == napi_ok;
}
static void *unwrap(napi_env env, napi_value value, const napi_type_tag *tag) {
  bool matches = false; void *data = NULL;
  if (napi_check_object_type_tag(env, value, tag, &matches) != napi_ok || !matches ||
      napi_unwrap(env, value, &data) != napi_ok) return NULL;
  return data;
}
static bool same_id(const Identity *a, const Identity *b) {
#ifdef _WIN32
  return a->dwVolumeSerialNumber == b->dwVolumeSerialNumber && a->nFileIndexHigh == b->nFileIndexHigh &&
    a->nFileIndexLow == b->nFileIndexLow && a->ftCreationTime.dwHighDateTime == b->ftCreationTime.dwHighDateTime &&
    a->ftCreationTime.dwLowDateTime == b->ftCreationTime.dwLowDateTime;
#else
  return a->st_dev == b->st_dev && a->st_ino == b->st_ino && a->st_birthtimespec.tv_sec == b->st_birthtimespec.tv_sec &&
    a->st_birthtimespec.tv_nsec == b->st_birthtimespec.tv_nsec;
#endif
}
#ifdef _WIN32
static bool file_id(NativeFile file, Identity *id, bool directory) {
  return GetFileInformationByHandle(file, id) && !(id->dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) &&
    !!(id->dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == directory &&
    (directory || (id->nNumberOfLinks == 1 && id->nFileSizeHigh == 0 && id->nFileSizeLow == 0));
}
/* GetAce is an OS API, but IsValidSid has no buffer-length parameter. Bound
 * the ACE in its returned ACL, then the variable SID in that ACE, before any
 * SID API may inspect the count-selected subauthorities. */
static ACE_HEADER *bounded_ace_header(PACL acl, void *raw) {
  if (!raw || acl->AclSize < sizeof(ACL)) return NULL;
  uintptr_t start = (uintptr_t)acl, address = (uintptr_t)raw;
  if (address < start) return NULL;
  size_t offset = (size_t)(address - start);
  if (offset < sizeof(ACL) || offset > (size_t)acl->AclSize ||
      (size_t)acl->AclSize - offset < sizeof(ACE_HEADER) || offset % sizeof(DWORD)) return NULL;
  ACE_HEADER *header = (ACE_HEADER *)raw;
  if (header->AceSize < sizeof(ACE_HEADER) || header->AceSize % sizeof(DWORD) ||
      header->AceSize > (size_t)acl->AclSize - offset) return NULL;
  return header;
}
static PSID bounded_ace_sid(ACE_HEADER *header) {
  const size_t sid_offset = offsetof(ACCESS_ALLOWED_ACE, SidStart);
  const size_t fixed_sid = offsetof(SID, SubAuthority);
  if (header->AceSize < sid_offset + fixed_sid) return NULL;
  const BYTE *bytes = (const BYTE *)header + sid_offset;
  BYTE count = bytes[offsetof(SID, SubAuthorityCount)];
  size_t available = (size_t)header->AceSize - sid_offset;
  if (count > SID_MAX_SUB_AUTHORITIES || (size_t)count > (available - fixed_sid) / sizeof(DWORD)) return NULL;
  PSID sid = (PSID)bytes;
  if (!IsValidSid(sid) || GetLengthSid(sid) != fixed_sid + (size_t)count * sizeof(DWORD)) return NULL;
  return sid;
}
/* Only call with the bounded, validated SID above. AppContainer access is the
 * intersection of normal user/group and separate capability/package grants.
 * A capability therefore cannot supply another user's missing ordinary grant.
 * This does not protect against hostile code with the owner's own privileges.
 * https://learn.microsoft.com/windows/win32/secauthz/implementing-an-appcontainer */
static bool capability_sid(PSID sid) {
  const SID_IDENTIFIER_AUTHORITY authority = SECURITY_APP_PACKAGE_AUTHORITY;
  return *GetSidSubAuthorityCount(sid) >= 2 &&
    memcmp(GetSidIdentifierAuthority(sid), &authority, sizeof(authority)) == 0 &&
    *GetSidSubAuthority(sid, 0) == SECURITY_CAPABILITY_BASE_RID;
}
/* Reject writable access by other ordinary accounts. Administrator/SYSTEM are
 * privileged and excluded from the threat model, as in the native export broker.
 * No ACL/owner repair is performed, even for an unsafe pre-existing anchor. */
static bool private_permissions(NativeFile file) {
  HANDLE token = NULL; DWORD needed = 0; BYTE *user = NULL; PSECURITY_DESCRIPTOR sd = NULL;
  PSID owner = NULL; PACL dacl = NULL; bool ok = false;
  BYTE system[SECURITY_MAX_SID_SIZE], admin[SECURITY_MAX_SID_SIZE]; DWORD sn = sizeof(system), an = sizeof(admin);
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) goto done;
  if (GetTokenInformation(token, TokenUser, NULL, 0, &needed) || GetLastError() != ERROR_INSUFFICIENT_BUFFER ||
      needed < sizeof(TOKEN_USER) || needed > 4096) goto done;
  user = (BYTE *)calloc(1, needed); if (!user) goto done;
  if (!GetTokenInformation(token, TokenUser, user, needed, &needed) ||
      !CreateWellKnownSid(WinLocalSystemSid, NULL, system, &sn) ||
      !CreateWellKnownSid(WinBuiltinAdministratorsSid, NULL, admin, &an)) goto done;
  if (GetSecurityInfo(file, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
      &owner, NULL, &dacl, NULL, &sd) != ERROR_SUCCESS || !owner || !dacl ||
      !EqualSid(owner, ((TOKEN_USER *)user)->User.Sid)) goto done;
  for (DWORD i = 0; i < dacl->AceCount; ++i) {
    void *raw = NULL; if (!GetAce(dacl, i, &raw) || !raw) goto done;
    ACE_HEADER *header = bounded_ace_header(dacl, raw);
    if (!header) goto done;
    if (header->AceType == ACCESS_DENIED_ACE_TYPE) continue;
    if (header->AceType != ACCESS_ALLOWED_ACE_TYPE) goto done;
    PSID sid = bounded_ace_sid(header); if (!sid) goto done;
    ACCESS_ALLOWED_ACE *ace = (ACCESS_ALLOWED_ACE *)raw;
    DWORD mutations = FILE_WRITE_DATA | FILE_APPEND_DATA | FILE_WRITE_EA | FILE_WRITE_ATTRIBUTES |
      DELETE | FILE_DELETE_CHILD | WRITE_DAC | WRITE_OWNER | GENERIC_WRITE | GENERIC_ALL;
    if ((ace->Mask & mutations) && !EqualSid(sid, ((TOKEN_USER *)user)->User.Sid) &&
        !EqualSid(sid, system) && !EqualSid(sid, admin) && !capability_sid(sid)) goto done;
  }
  ok = true;
done:
  if (sd) LocalFree(sd); free(user); if (token) CloseHandle(token); return ok;
}
static bool close_file(NativeFile file) { return CloseHandle(file) != 0; }
static bool open_root(Root *root, const char *utf8) {
  int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, -1, NULL, 0);
  if (length < 4 || length > 32760) return false;
  root->path = (wchar_t *)calloc((size_t)length + 32, sizeof(wchar_t)); if (!root->path) return false;
  if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, -1, root->path, length)) return false;
  wchar_t *p = root->path;
  if (!((p[0] >= L'A' && p[0] <= L'Z') || (p[0] >= L'a' && p[0] <= L'z')) || p[1] != L':' || p[2] != L'\\') return false;
  for (int i = 3; i < length - 1; ++i) if (p[i] == L'/' || p[i] == L':' || p[i] < 32) return false;
  wchar_t drive[4] = { p[0], L':', L'\\', 0 }; UINT kind = GetDriveTypeW(drive);
  if (kind != DRIVE_FIXED && kind != DRIVE_RAMDISK && kind != DRIVE_REMOVABLE) return false;
  for (int i = 3; i <= length - 1; ++i) {
    if (i != 3 && p[i] != L'\\' && p[i] != 0) continue;
    if (root->depth >= MAX_DEPTH) return false;
    if (i > 3) {
      int start = i - 1; while (start >= 3 && p[start] != L'\\') --start; ++start;
      int n = i - start; if (n < 1 || n > 255 || p[i - 1] == L'.' || p[i - 1] == L' ') return false;
    }
    wchar_t saved = p[i]; p[i] = 0;
    NativeFile fd = CreateFileW(p, FILE_LIST_DIRECTORY | READ_CONTROL, FILE_SHARE_READ | FILE_SHARE_WRITE,
      NULL, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
    p[i] = saved;
    if (fd == INVALID_FILE) return false;
    unsigned index = root->depth++; root->dirs[index] = fd;
    if (!file_id(fd, &root->ids[index], true)) return false;
  }
  return root->depth > 1 && private_permissions(root->dirs[root->depth - 1]);
}
static bool root_intact(Root *root) {
  for (unsigned i = 0; i < root->depth; ++i) {
    Identity id; if (!file_id(root->dirs[i], &id, true) || !same_id(&id, &root->ids[i])) return false;
  }
  return private_permissions(root->dirs[root->depth - 1]);
}
static NativeFile lock_file(Root *root, bool *busy) {
  size_t n = wcslen(root->path); wchar_t *target = (wchar_t *)calloc(n + 32, sizeof(wchar_t));
  if (!target) return INVALID_FILE;
  memcpy(target, root->path, n * sizeof(wchar_t)); memcpy(target + n, L"\\ownership-control.lock", 24 * sizeof(wchar_t));
  NativeFile fd = CreateFileW(target, GENERIC_READ | GENERIC_WRITE | READ_CONTROL, 0, NULL,
    OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
  DWORD error = GetLastError(); free(target);
  *busy = fd == INVALID_FILE && error == ERROR_SHARING_VIOLATION;
  return fd;
}
static bool anchor_intact(Root *root, NativeFile file) {
  Identity id; return file_id(file, &id, false) && same_id(&id, &root->anchor_id) && private_permissions(file);
}
#else
static bool file_id(NativeFile file, Identity *id, bool directory) {
  return fstat(file, id) == 0 && (directory ? S_ISDIR(id->st_mode) : S_ISREG(id->st_mode) && id->st_nlink == 1 && id->st_size == 0);
}
static bool private_permissions(NativeFile file) {
  struct stat st; filesec_t security = filesec_init(); if (!security) return false;
  bool ok = false; int present = -1; acl_t acl = NULL; acl_entry_t entry = NULL;
  if (fstatx_np(file, &st, security) != 0 || st.st_uid != geteuid() || (st.st_mode & 0022) != 0 ||
      filesec_query_property(security, FILESEC_ACL, &present) != 0) goto done;
  if (present == 0) { ok = true; goto done; }
  /* filesec_query_property returns a validity bitmask (ACL is 1<<5), not 1. */
  if (present < 0 || filesec_get_property(security, FILESEC_ACL, &acl) != 0 || !acl || acl == (acl_t)1 || acl_valid(acl) != 0) goto done;
  errno = 0;
  if (acl_get_entry(acl, ACL_FIRST_ENTRY, &entry) == -1 && errno == EINVAL && entry == NULL) ok = true;
done:
  if (acl && acl != (acl_t)1) { if (acl_free(acl) != 0) ok = false; }
  filesec_free(security); return ok;
}
/* A private leaf does not protect its pathname if another account can rename
 * an ancestor. Validate each held parent/child edge, not just its identity.
 * Do not resolve ACL principals through account/directory services: ancestors
 * conservatively permit only known read-only ALLOW rights and known DENYs.
 * In particular the usual Home "everyone deny delete" remains acceptable.
 * XNU evaluates node DELETE / parent DELETE_CHILD ACLs before the sticky bit;
 * neither an ACL mutation grant nor a foreign-owned sticky child is safe. */
static bool namespace_permissions(NativeFile parent, const Identity *child) {
  struct stat st; struct statfs volume;
  filesec_t security = filesec_init(); if (!security) return false;
  bool ok = false; int present = -1; acl_t acl = NULL;
  uid_t uid = geteuid();
  if (!child || !S_ISDIR(child->st_mode) || (child->st_uid != 0 && child->st_uid != uid) ||
      fstatx_np(parent, &st, security) != 0 || !S_ISDIR(st.st_mode) || (st.st_uid != 0 && st.st_uid != uid) ||
      fstatfs(parent, &volume) != 0 || !(volume.f_flags & MNT_LOCAL) || (volume.f_flags & MNT_IGNORE_OWNERSHIP) ||
      ((st.st_mode & 0022) != 0 && !(st.st_mode & S_ISVTX)) ||
      filesec_query_property(security, FILESEC_ACL, &present) != 0) goto done;
  if (present == 0) { ok = true; goto done; }
  /* Positive presence does not approve any ACE; the full policy follows. */
  if (present < 0 || filesec_get_property(security, FILESEC_ACL, &acl) != 0 || !acl || acl == (acl_t)1 || acl_valid(acl) != 0) goto done;
  const acl_permset_mask_t readonly = (acl_permset_mask_t)(ACL_READ_DATA | ACL_EXECUTE | ACL_READ_ATTRIBUTES |
    ACL_READ_EXTATTRIBUTES | ACL_READ_SECURITY | ACL_SYNCHRONIZE);
  const acl_permset_mask_t known = readonly | (acl_permset_mask_t)(ACL_WRITE_DATA | ACL_APPEND_DATA | ACL_DELETE |
    ACL_DELETE_CHILD | ACL_WRITE_ATTRIBUTES | ACL_WRITE_EXTATTRIBUTES | ACL_WRITE_SECURITY | ACL_CHANGE_OWNER);
  for (unsigned i = 0; i <= ACL_MAX_ENTRIES; ++i) {
    acl_entry_t entry = NULL; errno = 0;
    int status = acl_get_entry(acl, i == 0 ? ACL_FIRST_ENTRY : ACL_NEXT_ENTRY, &entry);
    /* Darwin returns 0 for an entry, -1/EINVAL at end, leaving entry alone.
     * The ACL is a validated private snapshot; NULL is reset on every call. */
    if (status == -1 && errno == EINVAL && entry == NULL) { ok = true; break; }
    if (status != 0 || !entry || i == ACL_MAX_ENTRIES) goto done;
    acl_tag_t tag; acl_permset_mask_t permissions;
    if (acl_get_tag_type(entry, &tag) != 0 || acl_get_permset_mask_np(entry, &permissions) != 0 ||
        (permissions & ~known) != 0 || (tag != ACL_EXTENDED_ALLOW && tag != ACL_EXTENDED_DENY) ||
        (tag == ACL_EXTENDED_ALLOW && (permissions & ~readonly) != 0)) goto done;
  }
done:
  if (acl && acl != (acl_t)1) { if (acl_free(acl) != 0) ok = false; }
  filesec_free(security); return ok;
}
static bool close_file(NativeFile file) { return close(file) == 0; }
static bool open_root(Root *root, const char *input) {
  if (input[0] != '/' || strlen(input) < 2 || strlen(input) > 4095) return false;
  NativeFile current = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  if (current < 0) return false;
  root->dirs[root->depth++] = current; if (!file_id(current, &root->ids[0], true)) return false;
  char *copy = strdup(input + 1); if (!copy) return false;
  bool ok = true; char *cursor = copy;
  while (*cursor) {
    char *end = strchr(cursor, '/'); if (end) *end = 0;
    size_t n = strlen(cursor);
    if (root->depth >= MAX_DEPTH || n == 0 || n > 255 || !strcmp(cursor, ".") || !strcmp(cursor, "..")) { ok = false; break; }
    NativeFile next = openat(current, cursor, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (next < 0) { ok = false; break; }
    unsigned i = root->depth++; root->dirs[i] = next; root->names[i] = strdup(cursor);
    if (!root->names[i] || !file_id(next, &root->ids[i], true) ||
        !namespace_permissions(current, &root->ids[i])) { ok = false; break; }
    current = next; if (!end) break; cursor = end + 1; if (!*cursor) { ok = false; break; }
  }
  free(copy);
  struct statfs volume;
  return ok && root->depth > 1 && fstatfs(current, &volume) == 0 && (volume.f_flags & MNT_LOCAL) &&
    !(volume.f_flags & MNT_IGNORE_OWNERSHIP) &&
    (!strcmp(volume.f_fstypename, "apfs") || !strcmp(volume.f_fstypename, "hfs")) && private_permissions(current);
}
static bool root_intact(Root *root) {
  for (unsigned i = 0; i < root->depth; ++i) {
    Identity id; if (!file_id(root->dirs[i], &id, true) || !same_id(&id, &root->ids[i])) return false;
    if (i && (fstatat(root->dirs[i - 1], root->names[i], &id, AT_SYMLINK_NOFOLLOW) != 0 ||
        !S_ISDIR(id.st_mode) || !same_id(&id, &root->ids[i]) ||
        !namespace_permissions(root->dirs[i - 1], &id))) return false;
  }
  return private_permissions(root->dirs[root->depth - 1]);
}
static NativeFile lock_file(Root *root, bool *busy) {
  NativeFile fd = openat(root->dirs[root->depth - 1], ANCHOR, O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, 0600);
  if (fd < 0) return INVALID_FILE;
  if (flock(fd, LOCK_EX | LOCK_NB) == 0) return fd;
  *busy = errno == EWOULDBLOCK; if (close(fd) != 0) { root->poisoned = true; *busy = false; } return INVALID_FILE;
}
static bool anchor_intact(Root *root, NativeFile file) {
  Identity id, named;
  return file_id(file, &id, false) && same_id(&id, &root->anchor_id) && private_permissions(file) &&
    fstatat(root->dirs[root->depth - 1], ANCHOR, &named, AT_SYMLINK_NOFOLLOW) == 0 &&
    S_ISREG(named.st_mode) && named.st_nlink == 1 && same_id(&named, &id);
}
#endif

static void drop_root(Root *root) {
  if (--root->refs) return;
  for (unsigned i = root->depth; i > 0; --i) {
    close_file(root->dirs[i - 1]);
#ifndef _WIN32
    free(root->names[i - 1]);
#endif
  }
#ifdef _WIN32
  free(root->path);
#endif
  free(root);
}
static bool unlock_close(NativeFile file) {
  bool ok = true;
#ifndef _WIN32
  if (flock(file, LOCK_UN) != 0) ok = false;
#endif
  if (!close_file(file)) ok = false; /* Consume even uncertain close; NEVER retry a possibly recycled fd. */
  return ok;
}
static bool close_guard(Guard *guard) {
  if (guard->closed) return true;
  guard->closed = true; NativeFile file = guard->file; guard->file = INVALID_FILE;
  bool ok = unlock_close(file);
  Root *root = guard->root; if (!ok) root->poisoned = true;
  --root->guards; guard->root = NULL; drop_root(root); return ok;
}
static void root_finalizer(napi_env env, void *data, void *hint) { (void)env; (void)hint; drop_root((Root *)data); }
static void guard_finalizer(napi_env env, void *data, void *hint) {
  (void)env; (void)hint; Guard *guard = (Guard *)data; close_guard(guard); free(guard);
}
static napi_value create_root(napi_env env, napi_callback_info info) {
  napi_value input[1], object; size_t n = 0; napi_valuetype type;
  if (!args(env, info, 1, input) || napi_typeof(env, input[0], &type) != napi_ok || type != napi_string ||
      napi_get_value_string_utf8(env, input[0], NULL, 0, &n) != napi_ok || n < 2 || n > 32760) return fail(env, "OWNERSHIP_GUARD_INVALID");
  char *path = (char *)calloc(n + 1, 1); Root *root = (Root *)calloc(1, sizeof(Root));
  if (!path || !root) { free(path); free(root); return fail(env, "OWNERSHIP_GUARD_INTERNAL"); }
  root->env = env; root->refs = 1;
  size_t copied = 0;
  bool ok = napi_get_value_string_utf8(env, input[0], path, n + 1, &copied) == napi_ok && copied == n && strlen(path) == n && open_root(root, path);
  free(path);
  if (!ok) { drop_root(root); return fail(env, "OWNERSHIP_GUARD_UNSAFE"); }
  if (napi_create_object(env, &object) != napi_ok || napi_type_tag_object(env, object, &ROOT_TAG) != napi_ok ||
      napi_wrap(env, object, root, root_finalizer, NULL, NULL) != napi_ok) { drop_root(root); return fail(env, "OWNERSHIP_GUARD_INTERNAL"); }
  return object;
}
static napi_value acquire(napi_env env, napi_callback_info info) {
  napi_value input[1], object; if (!args(env, info, 1, input)) return fail(env, "OWNERSHIP_GUARD_INVALID");
  Root *root = (Root *)unwrap(env, input[0], &ROOT_TAG);
  if (!root || root->env != env) return fail(env, "OWNERSHIP_GUARD_INVALID");
  if (root->closed || root->poisoned) return fail(env, "OWNERSHIP_GUARD_CLOSED");
  if (!root_intact(root)) { root->poisoned = true; return fail(env, "OWNERSHIP_GUARD_UNSAFE"); }
  bool busy = false; NativeFile file = lock_file(root, &busy);
  if (file == INVALID_FILE) { if (busy) { napi_get_null(env, &object); return object; } return fail(env, "OWNERSHIP_GUARD_UNAVAILABLE"); }
  Guard *guard = (Guard *)calloc(1, sizeof(Guard));
  if (!guard) { if (!unlock_close(file)) root->poisoned = true; return fail(env, "OWNERSHIP_GUARD_INTERNAL"); }
  guard->env = env; guard->root = root; guard->file = file; ++root->refs; ++root->guards;
  Identity id;
  if (!file_id(file, &id, false) || (root->anchor_known && !same_id(&id, &root->anchor_id))) {
    root->poisoned = true; close_guard(guard); free(guard); return fail(env, "OWNERSHIP_GUARD_UNSAFE");
  }
  root->anchor_id = id; root->anchor_known = true;
  if (!root_intact(root) || !anchor_intact(root, file)) {
    root->poisoned = true; close_guard(guard); free(guard); return fail(env, "OWNERSHIP_GUARD_UNSAFE");
  }
  if (napi_create_object(env, &object) != napi_ok || napi_type_tag_object(env, object, &GUARD_TAG) != napi_ok ||
      napi_wrap(env, object, guard, guard_finalizer, NULL, NULL) != napi_ok) {
    close_guard(guard); free(guard); return fail(env, "OWNERSHIP_GUARD_INTERNAL");
  }
  return object;
}
static napi_value assert_held(napi_env env, napi_callback_info info) {
  napi_value input[1]; if (!args(env, info, 1, input)) return fail(env, "OWNERSHIP_GUARD_INVALID");
  Guard *guard = (Guard *)unwrap(env, input[0], &GUARD_TAG);
  if (!guard || guard->env != env) return fail(env, "OWNERSHIP_GUARD_INVALID");
  if (guard->closed) return fail(env, "OWNERSHIP_GUARD_CLOSED");
  Root *root = guard->root;
  if (root->poisoned || !root_intact(root) || !anchor_intact(root, guard->file)) {
    root->poisoned = true; return fail(env, "OWNERSHIP_GUARD_UNSAFE");
  }
  return js_bool(env, true);
}
static napi_value release(napi_env env, napi_callback_info info) {
  napi_value input[1]; if (!args(env, info, 1, input)) return fail(env, "OWNERSHIP_GUARD_INVALID");
  Guard *guard = (Guard *)unwrap(env, input[0], &GUARD_TAG);
  if (!guard || guard->env != env) return fail(env, "OWNERSHIP_GUARD_INVALID");
  if (guard->closed) return js_bool(env, false);
  if (!close_guard(guard)) return fail(env, "OWNERSHIP_GUARD_CLOSE_UNCONFIRMED");
  return js_bool(env, true);
}
static napi_value close_root(napi_env env, napi_callback_info info) {
  napi_value input[1]; if (!args(env, info, 1, input)) return fail(env, "OWNERSHIP_GUARD_INVALID");
  Root *root = (Root *)unwrap(env, input[0], &ROOT_TAG);
  if (!root || root->env != env) return fail(env, "OWNERSHIP_GUARD_INVALID");
  if (root->closed) return js_bool(env, false);
  if (root->guards) return fail(env, "OWNERSHIP_GUARD_BUSY");
  root->closed = true; bool ok = true;
  for (unsigned i = root->depth; i > 0; --i) {
    if (!close_file(root->dirs[i - 1])) ok = false;
#ifndef _WIN32
    free(root->names[i - 1]); root->names[i - 1] = NULL;
#endif
  }
  root->depth = 0; if (!ok) { root->poisoned = true; return fail(env, "OWNERSHIP_GUARD_CLOSE_UNCONFIRMED"); }
  return js_bool(env, true);
}
static napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
    { "createRoot", NULL, create_root, NULL, NULL, NULL, napi_default, NULL },
    { "tryAcquire", NULL, acquire, NULL, NULL, NULL, napi_default, NULL },
    { "assertHeld", NULL, assert_held, NULL, NULL, NULL, napi_default, NULL },
    { "release", NULL, release, NULL, NULL, NULL, napi_default, NULL },
    { "closeRoot", NULL, close_root, NULL, NULL, NULL, napi_default, NULL }
  };
  napi_value abi;
  if (napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods) != napi_ok ||
      napi_create_uint32(env, 1, &abi) != napi_ok || napi_set_named_property(env, exports, "abi", abi) != napi_ok) return fail(env, "OWNERSHIP_GUARD_INTERNAL");
  return exports;
}
NAPI_MODULE(ownership_guard, initialize)
