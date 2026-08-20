# Release and distribution

## Artefacts

```bash
npm run version:sync -- 3.2.0-rc3   # propagate a new version everywhere
npm test
npm run build
```

| Artefact | Purpose |
|---|---|
| `dist/DataSecure-Privacy-Preflight-v<version>.zip` | primary Claude plugin |
| `dist/EU-Privacy-Document-Gateway-Windows-v<version>.mcpb` | standalone Claude Desktop extension, fallback |

Both are built with a `node:zlib` ZIP writer, so `npm run build` works on Windows
and on Linux CI without an external `zip` binary. Archive entries carry a fixed
timestamp, so the same source produces the same SHA-256.

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

## Release gate

Do not mark a build production-ready until all of these hold:

- [ ] CI is green on `main`, on both `ubuntu-latest` and `windows-latest`
- [ ] `npm run version:sync` reports "all files already in sync"
- [ ] the packaged plugin answers `initialize` (CI verifies this)
- [ ] no Office/PDF file is tracked (CI verifies this)
- [ ] the golden output diff has been reviewed for this release
- [ ] repository visibility is still private/internal (required for organisation
      sync; currently satisfied, re-check before each release in case it changed)

## Windows acceptance run

The bridges to Windows OCR and rasterisation cannot be exercised in CI. Before a
pilot, verify on a target machine:

- [ ] the plugin installs and the local MCP starts without any runtime install
- [ ] `privacy_status` reports `visual_bridge: available`
- [ ] the privacy folder opens
- [ ] DOCX, XLSX, PPTX and PDF preflight work on synthetic files
- [ ] a scanned image is OCR'd, and PII inside it is blacked out
- [ ] an EMF/WMF graphic either rasterises safely or is withheld
- [ ] applicant and personnel visuals stay local until reviewed
- [ ] only released Markdown and released assets are readable by Claude

If `privacy_status` reports `visual_bridge: unavailable`, the text path still
works and every graphic is withheld — that is the intended degraded mode, not a
silent failure.

## What must never ship

- a real employee, applicant, customer or contract document
- a plugin or MCPB containing any source-document identifier
- a build whose bundled PowerShell helpers are placeholders (the build script
  refuses this)
