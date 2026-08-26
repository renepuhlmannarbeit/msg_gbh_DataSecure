# Release and distribution

## Artefacts

```bash
npm run version:sync -- <version>  # propagate a new version everywhere
npm test
npm run build
node scripts/generate-sbom.mjs
```

| Artefact | Purpose |
|---|---|
| `dist/DataSecure-Privacy-Preflight-v<version>.zip` | primary Claude plugin |
| `dist/DataSecure-Privacy-Gateway-v<version>.mcpb` | standalone Claude Desktop extension, fallback |
| `dist/DataSecure-Privacy-Preflight-v<version>.spdx.json` | SPDX 2.3 software bill of materials with archive hashes |
| `dist/SHA256SUMS` | SHA-256 verification for ZIP, MCPB and SBOM |

Both archives use a `node:zlib` ZIP writer without an external `zip` binary.
Normal tests and archive builds use `npm run native:verify` and never overwrite the
reviewed launcher. A release maintainer updates it explicitly with
`npm run native:update`; `npm run native:repro` then rebuilds into a temporary
directory with MSVC 19.50.35725 / VC Tools 14.50.35717, Windows SDK 10.0.26100.0
and `/Brepro` and compares it byte-for-byte with the tracked x64 binary. The build
fails if this pinned toolchain is unavailable. Both archive builders independently check
SHA-256 and PE AMD64 before packaging. Archive entries carry a fixed timestamp.
The native CodeQL job uses `native:analyze` with the same source and pinned Windows
SDK plus the runner MSVC. CodeQL instrumentation changes compiler discovery/output
bytes, so the independent CI build job owns the exact MSVC pin and byte-for-byte
`native:repro` gate for the same commit SHA.

`plugins/data-secure` is the canonical tree. The build substitutes nothing: what
a marketplace install resolves from the repository is what the ZIP contains.

## Distribution modes

1. **Pilot:** manual upload of the plugin ZIP to a Claude plugin marketplace.
2. **Organisation rollout:** GitHub-synced marketplace. This requires the
   repository to be **private or internal** first.
3. **Fallback:** the standalone MCPB, installed directly as a Claude Desktop
   extension.

All three run the same local privacy runtime and the same fail-closed release
model.

For custom MCPB installation use Claude Desktop **Settings → Extensions →
Advanced settings → Install Extension…**. Claude Desktop provides the Node.js
runtime for desktop extensions. Plugin ZIP distribution uses **Customize →
Plugins** or an organisation marketplace. Re-check both official workflows before
every rollout because the Claude UI and admin controls can change:

- <https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop>
- <https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization>

## Release gate

Do not mark a build production-ready until all of these hold:

- [ ] CI repository guards are green on Linux and the supported runtime suite is green on Windows
- [ ] JavaScript and native C++ CodeQL SARIF gates plus the complete-history Gitleaks
      scan are green
- [ ] `npm run version:sync` reports "all files already in sync"
- [ ] packaged ZIP and MCPB answer `initialize` and report `windows_job_object` for
      both parser and visual boundary (CI verifies this)
- [ ] `claude plugin validate ./plugins/data-secure --strict` and
      `claude plugin validate . --strict` pass with the Claude CLI version recorded
      in the release evidence; until an official stable CI validator is pinned, this
      remains an explicit release-workstation gate
- [ ] the extracted plugin ZIP passes `npm run test:plugin-zip`: German skill
      contracts, the 150-case end-to-end matrix, the 1.000-case detector corpus and preservation controls are green
- [ ] every model offered in the pilot passes all 20 cases from
      `evals/skill-behavior-cases.json` according to `docs/SKILL_EVALUATION.md`;
      corpus validation in `npm test` is not a substitute for these model runs
- [ ] the packaged plugin contains `server/native/windows-x64/datasecure-sandbox.exe`
      and its matching SHA-256 sidecar, and contains no reserved top-level `bin/`
      directory (CI and the build verify this)
- [ ] ZIP, MCPB, SPDX SBOM and `SHA256SUMS` are present in the same CI artefact
- [ ] downloaded release files match `SHA256SUMS`
- [ ] no Office/PDF file is tracked (CI verifies this)
- [ ] the golden output diff has been reviewed for this release
- [ ] repository visibility is still private/internal (required for organisation
      sync; currently satisfied, re-check before each release in case it changed)

## Windows acceptance run

CI exercises the real Windows OCR/redaction path under the native Job Object and
refuses a malformed EMF. Before a pilot, repeat the following on the supported target
Windows versions because the GitHub runner is not a representative end-user install:

The real OCR/redaction path passed on 2026-08-21 with
`npm run test:windows-visual` on the target Windows machine. The remaining
unchecked items still require installed-product or human acceptance; unit tests
alone do not close them.

- [x] the real Windows text-review form initializes, marks a manually selected
      synthetic alias, updates the release preview and returns the exact range
      while preserving the professional text (automated native-form acceptance,
      2026-08-21)
- [ ] the plugin installs and the local MCP starts without any runtime install
- [ ] `privacy_status` reports `visual_bridge: available` and
      `visual_boundary: windows_job_object`
- [ ] the privacy folder opens
- [ ] TXT and DOCX preflight work on synthetic files; XLSX, PPTX and all other
      non-pilot formats stop without publishing output
- [ ] every PDF stops with `PDF_COVERAGE_UNVERIFIED`, restores its source and publishes no package
- [x] a scanned image is OCR'd, and PII inside it is blacked out
- [ ] an EMF/WMF graphic either rasterises safely or is withheld
- [ ] applicant and personnel visuals stay local and unavailable to Claude
- [ ] only released Markdown with the current run's package-bound read capability
      is readable by Claude; a package ID alone and historical package enumeration fail
- [ ] `privacy_status` reports the configured retention window and due counts
- [ ] an expired synthetic Output package and pending review preview are removed,
      while possible originals in `Processed`, hidden staging directories and
      metadata-only audit receipts remain
- [ ] `purge_local_data` requires explicit confirmation and cleans only the
      selected scope
- [ ] with retention set to `0`, the pending review bytes disappear immediately,
      possible originals in `Processed` remain protected and the newly created
      package is still readable

If `privacy_status` reports `visual_bridge: unavailable`, the text path still
works and every graphic is withheld — that is the intended degraded mode, not a
silent failure.

The native-form checkbox proves control initialization and the exact automated
selection/button path with synthetic text. It is not evidence that the interface
is understandable to employees; that belongs to the pilot acceptance run in
`PILOT-ABNAHME.md`.

## What must never ship

- a real employee, applicant, customer or contract document
- a plugin or MCPB containing any source-document identifier
- a build whose bundled PowerShell helpers are placeholders (the build script
  refuses this)
