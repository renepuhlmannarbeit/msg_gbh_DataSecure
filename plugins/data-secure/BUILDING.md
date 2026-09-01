# Building the artefacts

`plugins/data-secure` is the canonical source tree. A user product is **never**
a ZIP of that tree alone: the release assembler adds the pinned, hash-checked
Node.js runtime for Windows x64 or macOS Intel/ARM and rewrites only `.mcp.json`
to start that bundled runtime. No system Node/Python installation is required.

```bash
npm test              # canonical product regression
npm run runtime:target -- --target <target> --archive <official-archive> --output dist/<target>
npm run build:plugin  # target of the current Windows/macOS build host
npm run build         # build + ZIP verification + SPDX/SHA-256
npm run build:engineering # optional internal comparison artefact and gates
npm run version:sync  # propagate package.json version to every manifest
```

`runtime:target` must run on the matching target host and validates the pinned
archive hash, binary architecture, upstream license and an actual runtime probe.
The manual `bundled-runtime-release.yml` workflow is the canonical economical
way to build the three target-specific direct-upload ZIPs. Anthropic limits a
manually uploaded plugin ZIP to 50 MB; DataSecure keeps target ZIPs below 45 MiB.

A GitHub-synced organization Marketplace does **not** fetch an arbitrary HTTPS
archive source. It needs a self-contained plugin directory inside the connected
private/internal repository and a relative `source`. Therefore the repository's
current relative Marketplace entry is a development catalogue until a release
projection containing all required runtimes has passed the size, structure and
Fresh-Install gates. If a self-contained cross-platform projection cannot stay
within the applicable Anthropic limits, Marketplace release remains blocked;
the three platform ZIPs stay the valid manual installation route.

Product and engineering archive writers use `node:zlib`, without an external
`zip` binary. Archive entries carry a fixed
timestamp, which makes the resulting SHA-256 reproducible for the same source.

MCPB, SEA and the disabled OCR bundle stay Engineering-only and cannot satisfy
the product build, ZIP verifier or SBOM gate.

End users install the plugin ZIP or the identical private-marketplace plugin.
They never run npm, Python or an engineering build step.
