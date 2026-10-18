// Explicit source-policy MODEL, NOT Darwin SDK compilation or real macOS.
// Compiles the actual Mac policy/open/revalidation C functions with independent,
// deterministic API outcomes. No NAPI load, GUI, network, suite or package work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'native/ownership-guard/ownership-guard.c'), 'utf8').replace(/\r\n/gu, '\n');
const start = source.indexOf('#else\nstatic bool file_id('), end = source.indexOf('static NativeFile lock_file(', start);
assert.ok(start > 0 && end > start);
const policy = source.slice(start + '#else\n'.length, end);
assert.match(policy, /namespace_permissions\(current, &root->ids\[i\]\)/u);
assert.match(policy, /namespace_permissions\(root->dirs\[i - 1\], &id\)/u);
assert.match(policy, /private_permissions\(root->dirs\[root->depth - 1\]\)/u);
assert.doesNotMatch(policy, /\b(?:chmod|fchmod|chown|fchown|acl_set_file|acl_set_fd|fchmodx_np)\s*\(/u);

const harness = String.raw`
#define _CRT_SECURE_NO_WARNINGS 1
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#define MAX_DEPTH 256
#define ACL_MAX_ENTRIES 128
#define O_RDONLY 1
#define O_DIRECTORY 2
#define O_CLOEXEC 4
#define O_NOFOLLOW 8
#define AT_SYMLINK_NOFOLLOW 1
#define S_ISVTX 01000
#define S_ISDIR(m) (((m) & 0170000) == 0040000)
#define S_ISREG(m) (((m) & 0170000) == 0100000)
#define MNT_LOCAL 0x1000
#define MNT_IGNORE_OWNERSHIP 0x200000
#define FILESEC_ACL 1
#define ACL_FIRST_ENTRY 0
#define ACL_NEXT_ENTRY (-1)
#define ACL_EXTENDED_ALLOW 1
#define ACL_EXTENDED_DENY 2
/* Apple public sys/acl.h values, deliberately not parsed from product masks. */
#define ACL_READ_DATA (1<<1)
#define ACL_WRITE_DATA (1<<2)
#define ACL_EXECUTE (1<<3)
#define ACL_DELETE (1<<4)
#define ACL_APPEND_DATA (1<<5)
#define ACL_DELETE_CHILD (1<<6)
#define ACL_READ_ATTRIBUTES (1<<7)
#define ACL_WRITE_ATTRIBUTES (1<<8)
#define ACL_READ_EXTATTRIBUTES (1<<9)
#define ACL_WRITE_EXTATTRIBUTES (1<<10)
#define ACL_READ_SECURITY (1<<11)
#define ACL_WRITE_SECURITY (1<<12)
#define ACL_CHANGE_OWNER (1<<13)
#define ACL_SYNCHRONIZE (1<<20)
typedef unsigned uid_t;
typedef int NativeFile;
typedef int acl_tag_t;
typedef uint64_t acl_permset_mask_t;
struct stat { uid_t st_uid; unsigned st_mode; uint64_t st_dev, st_ino, st_nlink, st_size;
  struct { long tv_sec, tv_nsec; } st_birthtimespec; };
struct statfs { unsigned f_flags; char f_fstypename[16]; };
typedef struct stat Identity;
typedef struct { unsigned depth; NativeFile dirs[MAX_DEPTH]; Identity ids[MAX_DEPTH]; char *names[MAX_DEPTH]; } Root;
typedef struct ModelEntry { int tag; uint64_t permissions; } *acl_entry_t;
typedef struct ModelAcl { int count, cursor; struct ModelEntry entries[130]; } *acl_t;
typedef struct ModelSecurity { int fd; } *filesec_t;
typedef struct { Identity stat; struct statfs volume; struct ModelAcl acl; int present; } Node;
static Node nodes[3];
static int live_security, live_acl, checks;
static int init_fail, stat_fail, fs_fail, query_fail, get_fail, null_acl, sentinel_acl,
  valid_fail, tag_fail, mask_fail, free_fail, entry_error, null_entry, replace_name;
static void expect(int actual, int expected, const char *name) {
  ++checks; if (!!actual != !!expected) { fprintf(stderr, "model failure: %s\n", name); exit(1); }
}
static uid_t geteuid(void) { return 501; }
static bool same_id(const Identity *a, const Identity *b) {
  return a->st_dev == b->st_dev && a->st_ino == b->st_ino &&
    a->st_birthtimespec.tv_sec == b->st_birthtimespec.tv_sec && a->st_birthtimespec.tv_nsec == b->st_birthtimespec.tv_nsec;
}
static filesec_t filesec_init(void) {
  if (init_fail) return NULL;
  filesec_t value = (filesec_t)calloc(1, sizeof(*value)); if (!value) exit(2); ++live_security; return value;
}
static void filesec_free(filesec_t value) { --live_security; free(value); }
static int fstat(int fd, struct stat *st) { if (stat_fail) return -1; *st = nodes[fd].stat; return 0; }
static int fstatx_np(int fd, struct stat *st, filesec_t value) { value->fd = fd; return fstat(fd, st); }
static int fstatfs(int fd, struct statfs *volume) { if (fs_fail) return -1; *volume = nodes[fd].volume; return 0; }
static int filesec_query_property(filesec_t value, int property, int *present) {
  (void)property; if (query_fail) return -1; *present = nodes[value->fd].present; return 0;
}
static int filesec_get_property(filesec_t value, int property, acl_t *acl) {
  (void)property; if (get_fail) return -1;
  if (null_acl) { *acl = NULL; return 0; } if (sentinel_acl) { *acl = (acl_t)1; return 0; }
  *acl = &nodes[value->fd].acl; (*acl)->cursor = -1; ++live_acl; return 0;
}
static int acl_valid(acl_t acl) { (void)acl; return valid_fail ? -1 : 0; }
static int acl_free(void *acl) { (void)acl; --live_acl; return free_fail ? -1 : 0; }
static int acl_get_entry(acl_t acl, int which, acl_entry_t *entry) {
  if (entry_error) { errno = entry_error; return -1; }
  int index = which == ACL_FIRST_ENTRY ? 0 : acl->cursor + 1;
  if (null_entry) return 0;
  if (index >= acl->count) { errno = EINVAL; return -1; } /* Darwin leaves *entry unchanged. */
  *entry = &acl->entries[index]; acl->cursor = index; return 0;
}
static int acl_get_tag_type(acl_entry_t entry, acl_tag_t *tag) { if (tag_fail) return -1; *tag = entry->tag; return 0; }
static int acl_get_permset_mask_np(acl_entry_t entry, acl_permset_mask_t *mask) { if (mask_fail) return -1; *mask = entry->permissions; return 0; }
static int open(const char *name, int flags) {
  expect(flags == (O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW), true, "held root flags");
  return strcmp(name, "/") == 0 ? 0 : -1;
}
static int openat(int parent, const char *name, int flags) {
  expect(flags == (O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW), true, "held component flags");
  return parent == 0 && !strcmp(name, "shared") ? 1 : parent == 1 && !strcmp(name, "leaf") ? 2 : -1;
}
static int fstatat(int parent, const char *name, struct stat *st, int flags) {
  (void)name; expect(flags == AT_SYMLINK_NOFOLLOW, true, "named identity nofollow");
  *st = nodes[parent + 1].stat; if (replace_name) ++st->st_ino; return 0;
}
static int close(int fd) { (void)fd; return 0; }
static char *model_strdup(const char *s) { size_t n = strlen(s) + 1; char *p = (char *)malloc(n); if (!p) exit(2); memcpy(p, s, n); return p; }
#define strdup model_strdup
` + policy + String.raw`
static void reset(void) {
  expect(live_security == 0 && live_acl == 0, true, "no security/ACL leak");
  memset(nodes, 0, sizeof(nodes));
  init_fail = stat_fail = fs_fail = query_fail = get_fail = null_acl = sentinel_acl = valid_fail =
    tag_fail = mask_fail = free_fail = entry_error = null_entry = replace_name = 0;
  for (int i = 0; i < 3; ++i) {
    nodes[i].stat.st_uid = i == 0 ? 0 : 501; nodes[i].stat.st_mode = 0040000 | (i == 2 ? 0700 : 0755);
    nodes[i].stat.st_dev = 1; nodes[i].stat.st_ino = (uint64_t)(10 + i); nodes[i].stat.st_nlink = 1;
    nodes[i].volume.f_flags = MNT_LOCAL; strcpy(nodes[i].volume.f_fstypename, "apfs");
  }
}
static void dispose(Root *root) { for (unsigned i = 0; i < root->depth; ++i) free(root->names[i]); }
static void tree(const char *name, bool wanted) {
  Root root = {0}; bool actual = open_root(&root, "/shared/leaf"); expect(actual, wanted, name);
  if (actual) expect(root_intact(&root), true, "accepted tree remains valid"); dispose(&root);
  expect(live_security == 0 && live_acl == 0, true, "balanced security/ACL cleanup");
}
static void ace(int tag, uint64_t permissions) {
  nodes[1].present = 1; nodes[1].acl.count = 1; nodes[1].acl.entries[0].tag = tag;
  nodes[1].acl.entries[0].permissions = permissions;
}
int main(void) {
  reset(); tree("trusted current/root namespace", true);
  reset(); nodes[1].stat.st_uid = 0; tree("root-owned ancestor", true);
  reset(); nodes[1].stat.st_uid = 502; tree("foreign-owned readonly ancestor", false);
  reset(); nodes[1].stat.st_mode = 0040775; tree("group writable ancestor", false);
  reset(); nodes[1].stat.st_mode = 0040777; tree("world writable ancestor", false);
  reset(); nodes[1].stat.st_mode = 0041777; tree("trusted sticky/owned child", true);
  reset(); nodes[1].stat.st_mode = 0041777; nodes[1].stat.st_uid = 502; tree("foreign sticky parent", false);
  reset(); nodes[1].stat.st_mode = 0041777; nodes[2].stat.st_uid = 502; tree("foreign sticky child", false);
  reset(); nodes[0].stat.st_mode = 0040777; tree("all ancestors, not just immediate parent", false);
  reset(); nodes[1].volume.f_flags |= MNT_IGNORE_OWNERSHIP; tree("ignored ancestor ownership", false);
  reset(); nodes[2].volume.f_flags |= MNT_IGNORE_OWNERSHIP; tree("ignored leaf ownership", false);
  reset(); nodes[1].volume.f_flags = 0; tree("nonlocal ancestor", false);
  reset(); nodes[2].stat.st_uid = 0; tree("leaf still current UID only", false);
  reset(); nodes[2].stat.st_mode |= 0020; tree("leaf still no broad writes", false);
  reset(); nodes[1].present = 1; tree("empty ACL Darwin -1/EINVAL", true);
  reset(); ace(ACL_EXTENDED_DENY, ACL_DELETE); tree("Home deny delete ancestor", true);
  reset(); nodes[2].present = 1; nodes[2].acl.count = 1;
  nodes[2].acl.entries[0].tag = ACL_EXTENDED_DENY; nodes[2].acl.entries[0].permissions = ACL_DELETE;
  tree("leaf still refuses nonempty deny ACL", false);
  const unsigned readbits[] = {2, 8, 128, 512, 2048, 1048576};
  const unsigned mutationbits[] = {4, 16, 32, 64, 256, 1024, 4096, 8192};
  for (unsigned i = 0; i < sizeof(readbits)/sizeof(readbits[0]); ++i) { reset(); ace(ACL_EXTENDED_ALLOW, readbits[i]); tree("individual readonly allow", true); }
  for (unsigned i = 0; i < sizeof(mutationbits)/sizeof(mutationbits[0]); ++i) {
    reset(); ace(ACL_EXTENDED_ALLOW, mutationbits[i]); tree("individual mutation allow", false);
    reset(); ace(ACL_EXTENDED_DENY, mutationbits[i]); tree("individual known deny", true);
    reset(); nodes[1].stat.st_mode = 0041777; ace(ACL_EXTENDED_ALLOW, mutationbits[i]); tree("sticky does not override ACL", false);
  }
  reset(); ace(ACL_EXTENDED_DENY, ACL_DELETE); nodes[1].acl.count = 2;
  nodes[1].acl.entries[1].tag = ACL_EXTENDED_ALLOW; nodes[1].acl.entries[1].permissions = ACL_DELETE_CHILD;
  tree("deny does not hide later unsafe allow", false);
  reset(); ace(7, ACL_READ_DATA); tree("unknown tag", false);
  reset(); ace(ACL_EXTENDED_ALLOW, UINT64_C(1)<<40); tree("unknown allow bit", false);
  reset(); ace(ACL_EXTENDED_DENY, UINT64_C(1)<<40); tree("unknown deny bit", false);
  reset(); ace(ACL_EXTENDED_ALLOW, ACL_READ_DATA); tag_fail = 1; tree("tag API failure", false);
  reset(); ace(ACL_EXTENDED_ALLOW, ACL_READ_DATA); mask_fail = 1; tree("mask API failure", false);
  reset(); nodes[1].present = 2; tree("unknown ACL presence", false);
  reset(); nodes[1].present = 1; null_acl = 1; tree("NULL ACL", false);
  reset(); nodes[1].present = 1; sentinel_acl = 1; tree("removal sentinel ACL", false);
  reset(); nodes[1].present = 1; valid_fail = 1; tree("invalid ACL", false);
  reset(); nodes[1].present = 1; get_fail = 1; tree("ACL copy failure", false);
  reset(); query_fail = 1; tree("ACL presence failure", false);
  reset(); fs_fail = 1; tree("volume query failure", false);
  reset(); stat_fail = 1; tree("stat failure", false);
  reset(); init_fail = 1; tree("security allocation failure", false);
  reset(); nodes[1].present = 1; free_fail = 1; tree("ACL cleanup failure", false);
  reset(); nodes[1].present = 1; entry_error = EIO; tree("iterator error not end", false);
  reset(); nodes[1].present = 1; null_entry = 1; tree("success without entry", false);
  reset(); nodes[1].present = 1; nodes[1].acl.count = 128;
  for (int i = 0; i < 128; ++i) nodes[1].acl.entries[i] = (struct ModelEntry){ACL_EXTENDED_DENY, ACL_DELETE};
  tree("exact public entry bound", true);
  nodes[1].acl.count = 129; nodes[1].acl.entries[128] = (struct ModelEntry){ACL_EXTENDED_DENY, ACL_DELETE};
  tree("iterator cannot exceed public bound", false);
  for (int change = 0; change < 6; ++change) {
    reset(); Root root = {0}; expect(open_root(&root, "/shared/leaf"), true, "bind before drift");
    if (change == 0) nodes[1].stat.st_mode = 0040777;
    if (change == 1) ace(ACL_EXTENDED_ALLOW, ACL_DELETE_CHILD);
    if (change == 2) nodes[1].stat.st_uid = 502;
    if (change == 3) nodes[0].stat.st_mode = 0040777;
    if (change == 4) nodes[1].volume.f_flags |= MNT_IGNORE_OWNERSHIP;
    if (change == 5) replace_name = 1;
    expect(root_intact(&root), false, "held policy catches same-identity drift/replacement"); dispose(&root);
  }
  reset(); expect(close_file(0), true, "consume modeled descriptor");
  printf("{\"model_assertions\":%d,\"native_macos_execution\":false,\"darwin_sdk_verified\":false}\n", checks);
  return 0;
}
`;

if (!['win32', 'darwin'].includes(process.platform)) throw Error('Explicit policy compiler gate supports Windows/macOS hosts only');
const dist = path.join(root, 'dist'), stat = fs.lstatSync(dist);
assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
const output = fs.mkdtempSync(path.join(dist, 'ownership-guard-macos-policy-model-'));
const model = path.join(output, 'policy-model.c'), executable = path.join(output, process.platform === 'win32' ? 'policy-model.exe' : 'policy-model');
fs.writeFileSync(model, harness, { flag: 'wx', mode: 0o600 });
function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { cwd: output, encoding: 'utf8', shell: false, windowsHide: true,
    timeout: 30_000, maxBuffer: 1024 * 1024, ...options });
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}`); return result.stdout;
}
if (process.platform === 'win32') {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
  const installation = run(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']).trim();
  assert.ok(installation && !installation.includes('\n'));
  const quote = value => { assert.doesNotMatch(value, /["\r\n%!?&|<>^]/u); return `"${value}"`; };
  const vcvars = path.join(installation, 'VC/Auxiliary/Build/vcvarsall.bat');
  run('C:\\Windows\\System32\\cmd.exe', ['/d', '/c', `call ${quote(vcvars)} x64 10.0.26100.0 >nul && cl.exe /nologo /TC /std:c11 /W4 /WX /MT /O2 /Fe:${quote(executable)} ${quote(model)}`], { windowsVerbatimArguments: true });
} else run('/usr/bin/clang', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', model, '-o', executable]);
const result = JSON.parse(run(executable, []));
assert.ok(result.model_assertions > 300); assert.equal(result.native_macos_execution, false);
console.log(JSON.stringify({ schema: 'datasecure-ownership-guard-macos-policy-model/1', ...result,
  host: process.platform, node: process.version, output, source_contracts: 4, product_artifact_loaded: false }));
