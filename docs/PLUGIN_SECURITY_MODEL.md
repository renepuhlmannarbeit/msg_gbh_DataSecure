# Security model

## Where the boundary is

The Skill layer is **not** the privacy boundary. A Skill is a procedure Claude
follows; it cannot guarantee that raw bytes were cleaned before the model saw
them. The local MCP server owns file access, de-identification, visual gating,
integrity checks and release. Claude reads only released privacy-package output.

Uploading a raw sensitive document directly into the chat bypasses the whole
guarantee. That is why the server instructions tell Claude to route the user to
the local `Input` folder instead of asking for an upload.

The plugin is the primary artefact; the standalone MCPB is a fallback for direct
Claude Desktop extension installation. Both ship the same runtime from
`plugins/data-secure/server`.

## What reaches Claude

| Artefact | Reaches Claude | Condition |
|---|---|---|
| Original document | never | there is no tool that reads it |
| Anonymised Markdown | yes | residual gate passed, SHA-256 matches the manifest |
| Released PNG asset | yes | OCR found nothing, or a redaction was verified |
| Withheld image pixels | never | only a human can release them |
| OCR text of a withheld image | yes | after it passed the same text gate as the document body |
| Review preview | never | not readable through any tool |
| Audit record | metadata only | values are stored as truncated hashes |

The "OCR text of a withheld image" row is deliberate and worth understanding:
the *image* stays local because a photo, signature or logo re-identifies a person
directly, but the *words* it contains are useful and are cleaned by the same
engine as the rest of the document. The released Markdown marks them under
`### Extrahierter Bildtext`, and the package manifest records
`verification.visual_ocr_text_released: true`.

## Fail-closed points

Every one of these stops the pipeline or withholds the asset rather than
guessing:

- unsupported or unparsable container
- PDF without an extractable text layer
- extracted text or asset count over the configured limits
- residual gate finds a direct identifier or a literal the redactor claimed to
  have replaced
- image cannot be rasterised to PNG locally
- OCR bridge unavailable
- recognised text too short to trust the "no PII found" result
- PII found but its bounding boxes cannot be mapped
- redaction failed, or a second OCR pass still finds the redacted strings
- package, asset or Markdown hash does not match the manifest

A stopped run leaves the source file in `Input` and releases nothing. Staging
directories are removed on failure so no partial package can be picked up.

## Two independent checks, not one

The redactor uses allow lists to avoid destroying useful content. The verifier
must not share them, or it can only ever confirm the redactor's own blind spots.
The residual gate therefore checks two things that do not depend on the
redactor's heuristics:

1. no direct identifier pattern is present, and
2. none of the literals the redactor recorded in its dictionary survives.

Point 2 is the stronger one: it turns "I replaced Erika Beispiel" into an
assertion that can actually fail.

## Integrity

`document_sha256` and each asset's `sha256` are written into the package
manifest. The read tools verify them on every call, so a document modified after
release is refused rather than served. Approving a withheld visual also verifies
the current Markdown hash first, so an approval cannot silently re-bless a file
that was tampered with in between.

## Untrusted content

Document text and OCR output are data, never instructions. The server states
this in its MCP `instructions`, and no tool interprets document content as a
command.

## What this model does not claim

No legal anonymity, no GDPR certification, no EU AI Act conformity assessment.
See [AI_ACT_AND_GDPR.md](AI_ACT_AND_GDPR.md).
