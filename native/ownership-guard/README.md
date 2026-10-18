# Native ownership guard, ABI 1

This primitive serializes the native Standalone ActiveLock, intake-reservation
and export-claim ownership transitions. It is not a lock for an entire run or
an automatic migration/reset of old protocol records. An OS lock becoming available is not proof that an
old delegated native publication has drained, and not permission to delete an
unknown/malformed owner record.

## Bootstrap/API contract

`server/core/native-ownership-guard.js` has no module-level native load. Its sole
factory is synchronous:

```js
const { createOwnershipGuard } = require('./native-ownership-guard');
const factory = createOwnershipGuard({
  root: verifiedExistingControlRoot,
  verifiedArtifact: {
    schema: 'datasecure-native-ownership-guard/1',
    abi: 1,
    napi: 8,
    target: 'windows-x64', // alternatively macos-x64 or macos-arm64
    path: independentlyVerifiedAbsoluteArtifactPath,
    sha256: independentlyBoundArtifactSha256
  }
});
const guard = factory.tryAcquire(); // null = contention, never ownership
if (!guard) throw busyError;
try {
  guard.assertHeld();
  // Synchronous, bounded ownership-record transition. No await/callback escape.
} finally {
  guard.release();
}
factory.close();
```

Bootstrap must supply both path and expected digest from independently verified
package/runtime evidence, e.g. a digest embedded in the native desktop plus its
fixed bundle contract. A sibling checksum/build manifest, arbitrary environment
path, renderer argument or local source checkout is **not** that trust root.
The build manifest is explicit test/build input only. Cargo embeds the verified
target digest; the native launcher clears inherited environment and supplies
that digest to the Core, which forwards it to its controlled workers. Fixed
package paths and source/inventory/embedded-digest checks bind the artifact.
No auto-download/build or fallback
exists in the runtime loader. Missing/unsupported/invalid native input fails
closed. Node-API 8 is the minimum; the product runtime is Node 22.23.2.

The loader bounds and hashes held file bytes, checks target/ABI, binds parents,
and rechecks the artifact before exposing the API. `process.dlopen` itself takes
a path: these checks are **not** a sandbox against a hostile same-user process
that can mutate the trusted runtime during loading. The verified immutable
artifact namespace remains a bootstrap requirement. Other ordinary accounts
must not be able to write the control root/artifact namespace. Administrators,
root, process injection and hostile code with the user's own privileges are
outside this boundary, consistently with the native export foundation.

## Resource/lifetime rules

- Existing local control directory only; no root creation, chmod, ACL repair or
  arbitrary caller-selected lock filename. The sole leaf is
  `ownership-control.lock`, always empty, regular and singly linked.
- Never unlink, rename, replace or truncate that anchor, even when idle. Exclude
  it and its active parent from cleanup/purge. Root factories pin directory
  identities; an anchor replacement observed by a factory poisons it rather
  than silently adopting the replacement.
- Windows holds a real `CreateFileW` handle with share mode zero. Directory
  ancestry is held without delete sharing; reparse points, UNC/device paths and
  writable ordinary-account ACLs are refused. Ordinary-account read-only ACEs
  and privileged SYSTEM/Administrators do not by themselves fail namespace
  mutation safety. No Windows ACL is changed by the primitive.
- macOS walks from `/` via `openat`/`O_NOFOLLOW`, keeps ancestry descriptors,
  verifies held and named identities and a local APFS/HFS filesystem. The control
  leaf and anchor still require current UID/no group-other writes and a positively
  absent/empty extended ACL. Every ancestor/child edge is additionally checked on
  its held descriptor, both at root creation and during held-guard revalidation:
  owners must be root/current UID, mounts local with ownership enforcement, and
  nonsticky ancestors must have no group/other writes. Ancestors accept known
  DENY and read-only ALLOW ACL entries (including Home's `everyone deny delete`),
  not mutation ALLOW entries, even grants naming the current user/root. This is
  a deliberately conservative policy without principal lookup. Unknown ACL
  states/rights fail closed. Sticky permits broad mode bits only with trusted
  parent AND child ownership and the same nonmutating ACL policy; it is not a
  blanket `1777` exemption. XNU ACL DELETE/DELETE_CHILD grants take precedence
  over sticky. A private leaf under an attacker-owned or nonsticky writable
  ancestor is therefore refused before lock creation, not merely detected after
  pathname I/O. Ownership-ignoring mounts cannot support this UID proof.
  `flock(LOCK_EX|LOCK_NB)` is cooperative. Symlink/parent/anchor replacement is
  detected, not repaired. `/tmp` aliases must be resolved by the JS boundary.
- Native descriptors/handles are non-inheritable/CLOEXEC. No helper process owns
  the lock. Each guard/root is an opaque Node-API type-tagged object tied to its
  originating environment; there is no process-global mutable handle table.
  Independent worker-thread environments contend through the same kernel file.
- Keep the guard capability strongly reachable through the entire protected
  operation. A GC finalizer is only a cleanup backstop, not a release protocol.
  Native root refcounts keep directory handles alive even if the JS factory is
  collected while a guard remains live; finalizer order is immaterial. GC and
  environment teardown do not invoke JavaScript or any Node-API in finalizers.
- `release()` consumes the guard before the OS close attempt. A repeated release
  returns false; assert after release fails. Explicit unlock/close errors poison
  the root and return `OWNERSHIP_GUARD_CLOSE_UNCONFIRMED`: do not retry a possibly
  recycled descriptor, infer commit/rollback, or continue protected mutation.
  A factory close with a live guard fails BUSY and does not close it. Closing an
  already closed factory returns false. Finalizers never double-close handles.
- On macOS the explicit `LOCK_UN` also avoids retaining an accidental
  fork-before-exec reference. Intentional handle inheritance/transfer is not an
  API. Process death releases its actual ownership; unrelated child processes
  and delegated native actions still require their separate lifecycle fence.

## Build contract

Explicit invocation from the repository, using the bundled Node:

```text
node scripts/build-ownership-guard.mjs --output dist/<new-directory> --fetch-official-inputs
node tests/test-native-ownership-guard.js dist/<new-directory>/build-manifest.json
```

Every build output directory must be new and below `dist`. The script does not
install a binary in product source, modify a workflow, download at runtime, or
change a Mac bundle layout. Official HTTPS build inputs are pinned in source:

- `node-v22.23.2-headers.tar.gz`:
  `daaf13ec5d45a38bbcfcff06d0723f72a6813b89ab27bb5af2ac8e1f6259dde0`
- `win-x64/node.lib`:
  `ac15f1e9d7c8279353723a77f6319967f1a41c06026521094a8234c2e6fbe052`

They come from `https://nodejs.org/dist/v22.23.2/` and match its official
`SHASUMS256.txt`; Node headers retain their upstream licence in build inputs.

Windows uses discovered Visual Studio x64 tools and SDK 10.0.26100.0:
`/TC /std:c11 /LD /O2 /MT /W4 /WX /sdl /guard:cf /Brepro`, Node headers,
`node.lib Advapi32.lib delayimp.lib`, linker `/DELAYLOAD:node.exe /Brepro
/guard:cf /CETCOMPAT /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /INCREMENTAL:NO`.
The immutable delay-load hook accepts **only** `node.exe` and redirects it to
the already loaded main module; it does not search for a second node.exe. This
is required for renamed Node/SEA hosts. Direct dependencies are constrained to
KERNEL32/ADVAPI32; node.exe is a delay import, not an added runtime distribution.
No Visual C++ redistributable DLL is required by the observed dependency list.

macOS uses system clang, C11, `-O2 -fvisibility=hidden -Wall -Wextra -Werror
-Wno-deprecated-declarations -bundle -undefined dynamic_lookup`, with Node-API
8 headers; only libSystem is permitted by the `otool -L` gate. Deployment target,
code signing and package attestation remain separate from source models. The
builder now selects architecture/minimum macOS 13.5 and ad-hoc signs before
hashing. Ad-hoc signing alone does not satisfy a hardened host's Library
Validation; a compatible signing identity/load contract and actual native gate
are required before a Mac package can pass. **No Mac build or execution has been
performed in this task.** Missing Mac artifacts must therefore block usage.

`build-manifest.json` records build schema, Node header version/digests, native
source digest, compiler, observed dependencies and `verified_artifact` with
schema/ABI/NAPI/target/path/SHA256. `build.log` includes MSVC `/Bv` output and
`dependencies.log` includes normal and delayed dependencies. The manifest is
not self-authenticating production evidence.

## Narrow regression evidence and limits

The explicit regression creates only new synthetic OS-temp fixtures and hidden
headless children. On Windows, only its newly created root ACL is restricted to
the current account; unsafe pre-existing user permissions are not repaired.
It checks two-process exclusion, real holder process death, worker-environment
termination, GC finalization with root-before-guard lifetime, close/busy and
double-release, stable empty anchor, malformed/hardlinked/replaced anchors,
junction parents, foreign writable ACLs, forged/proxied native handles, missing
artifact/digest and wrong ABI. Its fixture cleanup is bounded and nonrecursive.

OS close/allocation failure paths are source-reviewed but not fault-injected.
No full product suite, desktop, Mac/M2 run or SEA package rebuild is implied.
Node renamed-host regression is required in addition to ordinary node.exe;
an actual signed SEA load remains a later package-integration obligation.

The additional source-policy gate is explicit:
`node tests/test-ownership-guard-macos-policy.mjs`. It compiles the production C
policy/walk/revalidation functions against deterministic API models. It is not a
Darwin SDK/ABI or native macOS execution claim. The separate real-Mac gate is:

```text
node tests/test-native-ownership-guard-macos.mjs dist/<mac-build>/build-manifest.json --foreign-root /private/tmp/ds-ownership-guard-crossuid-<nonce>/control
```

It requires an ordinary account, current-source Mac artifact and a deliberately
prepared EMPTY two-account fixture: account B creates the `crossuid` parent
temporarily `0777`; account A creates its `control` child `0700`; B then sets
the parent to `0755`. Run the gate as A. It reads/refuses that fixture without
changing it; it never creates accounts, invokes sudo or repairs foreign ACLs.
The gate constructs only its own fresh `/private/tmp` fixtures to exercise the
Home deny ACL, read-only/mutation ACLs, sticky parent, unchanged strict leaf,
same-inode mode/ACL drift before acquisition and while held. The foreign-owned
parent must be rejected even without current group/other write bits, because B
can change permissions or rename its own ancestor later. The gate verifies the
manifest source hash and does not stand in for hardened-Core loading or signed
package acceptance. No actual Mac execution of these new cases is claimed here.

Primary API references:

- [Node-API ABI/lifetimes/type tags](https://nodejs.org/download/release/v22.23.2/docs/api/n-api.html)
- [Microsoft CreateFileW sharing and inheritance](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
- [Microsoft GetSecurityInfo held-handle security](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo)
- [Microsoft delay-load hook structure](https://learn.microsoft.com/en-us/cpp/build/reference/understanding-the-helper-function?view=msvc-170)
- [Apple flock, advisory locking and fork/dup](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html)
- [Apple safe file operations](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html)
- [Apple SDK ACL types/permissions/mask API](https://github.com/apple-oss-distributions/Libc/blob/main/include/sys/acl.h)
- [Apple ACL iterator implementation and end convention](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_entry.c)
- [Apple XNU rename/ACL/sticky authorization](https://github.com/apple-oss-distributions/xnu/blob/xnu-8796.141.3/bsd/vfs/vfs_subr.c)
- [Apple mount ownership flag](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/mount.h)
