// Build-only macOS tool. Never ship this helper in an application or plugin.
// All mutations are relative to held directory descriptors. In particular a
// concurrent pathname replacement cannot redirect copy/chmod/unlink elsewhere.
#define _DARWIN_C_SOURCE
#include <CommonCrypto/CommonDigest.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef DATASECURE_RELOCATOR_SOURCE_SHA256
#error DATASECURE_RELOCATOR_SOURCE_SHA256 must be supplied by the source-bound build
#endif
static const char source_marker[] = "DATASECURE_MACOS_RELOCATOR_SOURCE_SHA256_V1:"
    DATASECURE_RELOCATOR_SOURCE_SHA256 ":END_DATASECURE_MACOS_RELOCATOR_SOURCE_SHA256";
#ifdef DATASECURE_RELOCATION_TEST_HOOK
static const char mode_marker[] = "DATASECURE_MACOS_RELOCATOR_MODE_V1:test:END";
#else
static const char mode_marker[] = "DATASECURE_MACOS_RELOCATOR_MODE_V1:production:END";
#endif

#define MAX_BINDINGS 128
#define ROLE_COUNT 3
#define MAX_NATIVE_BYTES (128ULL * 1024ULL * 1024ULL)
struct binding { int parent; char name[256]; struct stat identity; };
struct role {
    int source_parent, source, destination_parent, destination;
    const char *source_leaf, *destination_leaf;
    uint64_t bytes; unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    struct stat source_identity, destination_identity; mode_t mode;
};
static struct binding bindings[MAX_BINDINGS];
static size_t binding_count;

static int same_object(const struct stat *a, const struct stat *b) {
    return a->st_dev == b->st_dev && a->st_ino == b->st_ino;
}
static int same_file(const struct stat *a, const struct stat *b) {
    return same_object(a, b) && a->st_size == b->st_size && a->st_nlink == b->st_nlink &&
        a->st_mtimespec.tv_sec == b->st_mtimespec.tv_sec && a->st_mtimespec.tv_nsec == b->st_mtimespec.tv_nsec &&
        a->st_ctimespec.tv_sec == b->st_ctimespec.tv_sec && a->st_ctimespec.tv_nsec == b->st_ctimespec.tv_nsec;
}
static int plain_component(const char *name) {
    return name && *name && strlen(name) < 256 && !strchr(name, '/') && strcmp(name, ".") && strcmp(name, "..");
}
static int open_child_directory(int parent, const char *name) {
    if (!plain_component(name) || binding_count >= MAX_BINDINGS) return -1;
    int child = openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (child < 0) return -1;
    struct stat held, named;
    if (fstat(child, &held) || fstatat(parent, name, &named, AT_SYMLINK_NOFOLLOW) ||
        !S_ISDIR(held.st_mode) || !S_ISDIR(named.st_mode) || !same_object(&held, &named)) {
        close(child); return -1;
    }
    int owned_parent = fcntl(parent, F_DUPFD_CLOEXEC, 0);
    if (owned_parent < 0) { close(child); return -1; }
    struct binding *entry = &bindings[binding_count++];
    entry->parent = owned_parent; entry->identity = held;
    memcpy(entry->name, name, strlen(name) + 1);
    return child;
}
static int open_directory_path(int parent, const char *relative) {
    if (!relative || !*relative || strlen(relative) >= 4096 || *relative == '/') return -1;
    char parts[4096]; memcpy(parts, relative, strlen(relative) + 1);
    int current = fcntl(parent, F_DUPFD_CLOEXEC, 0);
    if (current < 0) return -1;
    char *part = parts;
    for (;;) {
        char *slash = strchr(part, '/');
        if (slash) *slash = '\0';
        int next = open_child_directory(current, part);
        close(current);
        if (next < 0) return -1;
        current = next;
        if (!slash) return current;
        part = slash + 1;
    }
}
static int directories_unchanged(void) {
    for (size_t i = 0; i < binding_count; ++i) {
        struct stat named;
        if (fstatat(bindings[i].parent, bindings[i].name, &named, AT_SYMLINK_NOFOLLOW) ||
            !S_ISDIR(named.st_mode) || !same_object(&named, &bindings[i].identity)) return 0;
    }
    return 1;
}
static int parse_u64(const char *text, char **end, uint64_t *result) {
    if (!text || *text < '0' || *text > '9') return 0;
    errno = 0; char *last = NULL; unsigned long long value = strtoull(text, &last, 10);
    if (errno || last == text) return 0;
    *result = (uint64_t)value; *end = last; return 1;
}
static int parse_expected(const char *text, struct role *role) {
    char *end = NULL;
    if (!parse_u64(text, &end, &role->bytes) || *end != ':' || role->bytes < 1 || role->bytes > MAX_NATIVE_BYTES || strlen(end + 1) != 64) return 0;
    for (size_t i = 0; i < CC_SHA256_DIGEST_LENGTH; ++i) {
        unsigned value = 0;
        for (size_t j = 0; j < 2; ++j) {
            const char c = end[1 + i * 2 + j];
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return 0;
            value = value * 16U + (unsigned)(c <= '9' ? c - '0' : c - 'a' + 10);
        }
        role->digest[i] = (unsigned char)value;
    }
    return 1;
}
static int write_all(int descriptor, const unsigned char *bytes, size_t length) {
    while (length) {
        ssize_t count = write(descriptor, bytes, length);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return 0;
        bytes += (size_t)count; length -= (size_t)count;
    }
    return 1;
}
static int hash_or_copy(struct role *role, int output) {
    if (lseek(role->source, 0, SEEK_SET) != 0) return 0;
    CC_SHA256_CTX context;
    if (!CC_SHA256_Init(&context)) return 0;
    uint64_t total = 0; unsigned char bytes[65536], digest[CC_SHA256_DIGEST_LENGTH];
    for (;;) {
        ssize_t count = read(role->source, bytes, sizeof(bytes));
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) return 0;
        if (count == 0) break;
        total += (uint64_t)count;
        if (total > role->bytes || !CC_SHA256_Update(&context, bytes, (CC_LONG)count) ||
            (output >= 0 && !write_all(output, bytes, (size_t)count))) return 0;
    }
    struct stat held;
    return total == role->bytes && CC_SHA256_Final(digest, &context) &&
        !memcmp(digest, role->digest, sizeof(digest)) && !fstat(role->source, &held) &&
        S_ISREG(held.st_mode) && held.st_nlink == 1 && same_file(&held, &role->source_identity);
}
static int source_unchanged(struct role *role) {
    struct stat named;
    return !fstatat(role->source_parent, role->source_leaf, &named, AT_SYMLINK_NOFOLLOW) &&
        S_ISREG(named.st_mode) && same_file(&named, &role->source_identity);
}
static void cleanup(struct role *roles, int rollback) {
    for (size_t i = 0; i < ROLE_COUNT; ++i) {
        if (rollback && roles[i].destination >= 0) {
            struct stat named;
            // Best-effort own-object rollback in the held destination folder.
            // fstatat/unlinkat is not an atomic compare-and-unlink: the trusted
            // isolated build namespace must exclude concurrent leaf writers.
            // Symlink targets outside this held folder are never followed.
            if (!fstatat(roles[i].destination_parent, roles[i].destination_leaf, &named, AT_SYMLINK_NOFOLLOW) &&
                S_ISREG(named.st_mode) && same_object(&named, &roles[i].destination_identity))
                (void)unlinkat(roles[i].destination_parent, roles[i].destination_leaf, 0);
        }
        if (roles[i].source >= 0) close(roles[i].source);
        if (roles[i].source_parent >= 0) close(roles[i].source_parent);
        if (roles[i].destination >= 0) close(roles[i].destination);
        if (roles[i].destination_parent >= 0) close(roles[i].destination_parent);
    }
    for (size_t i = 0; i < binding_count; ++i) close(bindings[i].parent);
}
int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--contract")) {
        printf("%s\n%s\n", source_marker, mode_marker); return 0;
    }
    struct role roles[ROLE_COUNT]; memset(roles, 0, sizeof(roles));
    for (size_t i = 0; i < ROLE_COUNT; ++i) roles[i].source_parent = roles[i].source = roles[i].destination_parent = roles[i].destination = -1;
    int result = 65, deletion_started = 0, root = -1, app = -1, contents = -1, resources = -1, server = -1, macos = -1, frameworks = -1;
    if (argc != 13 || strcmp(argv[1], "--app") || strcmp(argv[3], "--target") ||
        strcmp(argv[5], "--app-id") || strcmp(argv[7], "--expect-node") ||
        strcmp(argv[9], "--expect-sandbox") || strcmp(argv[11], "--expect-canvas") ||
        argv[2][0] != '/' || strlen(argv[2]) >= 4096) goto finished;
    const char *base = strrchr(argv[2], '/');
    if (!base || strcmp(base + 1, "DataSecure Standalone.app")) goto finished;
    const char *arch = !strcmp(argv[4], "macos-arm64") ? "arm64" : !strcmp(argv[4], "macos-x64") ? "x64" : NULL;
    if (!arch || !parse_expected(argv[8], &roles[0]) || !parse_expected(argv[10], &roles[1]) ||
        !parse_expected(argv[12], &roles[2])) goto finished;
    uint64_t expected_dev = 0, expected_ino = 0; char *id_end = NULL, *inode_end = NULL;
    if (!parse_u64(argv[6], &id_end, &expected_dev) || *id_end != ':' ||
        !parse_u64(id_end + 1, &inode_end, &expected_ino) || *inode_end) goto finished;
    root = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (root < 0 || (app = open_directory_path(root, argv[2] + 1)) < 0) goto finished;
    struct stat app_identity;
    if (fstat(app, &app_identity) || (uint64_t)app_identity.st_dev != expected_dev || (uint64_t)app_identity.st_ino != expected_ino) goto finished;
    contents = open_child_directory(app, "Contents");
    if (contents < 0) goto finished;
    resources = open_child_directory(contents, "Resources"); macos = open_child_directory(contents, "MacOS");
    if (resources < 0 || macos < 0 || (server = open_child_directory(resources, "server")) < 0) goto finished;
    char sandbox_parent[128], canvas_parent[256], canvas_leaf[128];
    int sandbox_length = snprintf(sandbox_parent, sizeof(sandbox_parent), "native/%s", argv[4]);
    int canvas_length = snprintf(canvas_parent, sizeof(canvas_parent), "standalone/conversion-runtime/node_modules/@napi-rs/canvas-darwin-%s", arch);
    int leaf_length = snprintf(canvas_leaf, sizeof(canvas_leaf), "skia.darwin-%s.node", arch);
    if (sandbox_length < 0 || (size_t)sandbox_length >= sizeof(sandbox_parent) ||
        canvas_length < 0 || (size_t)canvas_length >= sizeof(canvas_parent) ||
        leaf_length < 0 || (size_t)leaf_length >= sizeof(canvas_leaf)) goto finished;
    roles[0].source_parent = open_directory_path(server, "standalone/conversion-runtime");
    roles[1].source_parent = open_directory_path(server, sandbox_parent);
    roles[2].source_parent = open_directory_path(server, canvas_parent);
    roles[0].source_leaf = "node"; roles[0].destination_leaf = "datasecure-conversion-node"; roles[0].mode = 0755;
    roles[1].source_leaf = "datasecure-sandbox"; roles[1].destination_leaf = "datasecure-sandbox"; roles[1].mode = 0755;
    roles[2].source_leaf = canvas_leaf; roles[2].destination_leaf = canvas_leaf; roles[2].mode = 0644;
    for (size_t i = 0; i < ROLE_COUNT; ++i) {
        if (roles[i].source_parent < 0 || (roles[i].source = openat(roles[i].source_parent, roles[i].source_leaf, O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC)) < 0 ||
            fstat(roles[i].source, &roles[i].source_identity) || !S_ISREG(roles[i].source_identity.st_mode) ||
            roles[i].source_identity.st_nlink != 1 || roles[i].source_identity.st_size < 0 ||
            (uint64_t)roles[i].source_identity.st_size != roles[i].bytes || !source_unchanged(&roles[i]) || !hash_or_copy(&roles[i], -1)) goto finished;
    }
    if (!directories_unchanged()) goto finished;
    if (mkdirat(contents, "Frameworks", 0755) && errno != EEXIST) goto finished;
    frameworks = open_child_directory(contents, "Frameworks");
    if (frameworks < 0) goto finished;
    roles[0].destination_parent = fcntl(macos, F_DUPFD_CLOEXEC, 0);
    roles[1].destination_parent = fcntl(macos, F_DUPFD_CLOEXEC, 0);
    roles[2].destination_parent = fcntl(frameworks, F_DUPFD_CLOEXEC, 0);
    if (!directories_unchanged()) goto finished;
#ifdef DATASECURE_RELOCATION_TEST_HOOK
    // Compiled only into the separate test helper, never the production tool.
    if (write(STDOUT_FILENO, "READY\n", 6) != 6) goto finished;
    char resume = 0;
    if (read(STDIN_FILENO, &resume, 1) != 1 || resume != 'g') goto finished;
#endif
    for (size_t i = 0; i < ROLE_COUNT; ++i) {
        if (roles[i].destination_parent < 0 || (roles[i].destination = openat(roles[i].destination_parent, roles[i].destination_leaf,
            O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600)) < 0) goto finished;
        if (fstat(roles[i].destination, &roles[i].destination_identity) || !S_ISREG(roles[i].destination_identity.st_mode) ||
            roles[i].destination_identity.st_nlink != 1 || !hash_or_copy(&roles[i], roles[i].destination) ||
            fchmod(roles[i].destination, roles[i].mode) || fsync(roles[i].destination)) goto finished;
    }
    if (!directories_unchanged()) goto finished;
    deletion_started = 1;
    for (size_t i = 0; i < ROLE_COUNT; ++i) {
        if (!directories_unchanged() || !source_unchanged(&roles[i]) ||
            unlinkat(roles[i].source_parent, roles[i].source_leaf, 0)) goto finished;
    }
    result = 0;
finished:
    // Once source removal begins, preserve the verified destination copies on
    // any error. The incomplete build must be rebuilt, never auto-published.
    cleanup(roles, result != 0 && !deletion_started);
    if (frameworks >= 0) close(frameworks);
    if (macos >= 0) close(macos);
    if (server >= 0) close(server);
    if (resources >= 0) close(resources);
    if (contents >= 0) close(contents);
    if (app >= 0) close(app);
    if (root >= 0) close(root);
    if (result) fputs("MACOS_RELOCATOR_FAILED\n", stderr);
    return result;
}
