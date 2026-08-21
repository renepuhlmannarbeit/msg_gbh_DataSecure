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
- PDF with a damaged or oversized Flate-compressed stream; the parser rejects
  the document instead of treating the compressed bytes as readable text
- extracted text or asset count over the configured limits
- residual gate finds a direct identifier or a literal the redactor claimed to
  have replaced
- image cannot be rasterised to PNG locally
- PNG with an invalid chunk CRC; the built-in decoder rejects it and the visual
  pipeline must obtain a clean PNG through local rasterisation or withhold it
- OCR bridge unavailable
- recognised text too short to trust the "no PII found" result
- PII found but its bounding boxes cannot be mapped
- redaction failed, or a second OCR pass still finds the redacted strings
- package, asset or Markdown hash does not match the manifest

A run first claims its source under a hidden name so concurrent calls cannot
process the same input. The source is moved to `Processed` before the atomic
Output rename, which is the single publish/commit point. If publishing fails,
the source is restored to its original `Input` name and no package is exposed.
Staging directories and review items from the failed run are removed. A failed
automatic restore is reported explicitly for manual recovery rather than being
misreported as an ordinary clean rollback.

A hard process or machine crash in the short window after the source move and
before the Output rename cannot run that rollback. In that case the original can
already be in `Processed` although no result package is visible in `Output`.

## Two complementary checks, with one shared heuristic

The residual gate checks two things:

1. no direct identifier pattern is present, and
2. none of the literals the redactor recorded in its dictionary survives.

Point 2 is non-circular: it turns "I replaced Erika Beispiel" into an assertion
that can actually fail independently of how the replacement was performed.
Direct-person detection is not independent, however. Both redactor and gate use
`collectPersonSeeds(clean, profile)`. A person missed by that shared collector
is therefore also missed by the gate unless another detector or an existing
dictionary literal catches it. The gate verifies removal and direct identifier
patterns; it does not prove that the person-name heuristic is complete.

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

## Retention and deletion

The runtime applies a configurable retention window to direct entries in
`Processed/`, `Output/` and `Needs Visual Review/`; the default is seven days.
Cleanup runs when the MCP server starts and again before every processing run.
Expiry is based on the entry mtime, and an Output package is treated atomically
by its directory mtime. Hidden staging directories are excluded. A locked or
otherwise undeletable entry is recorded in `privacy_status` and does not abort
document processing.

For a review entry, expiry removes preview image bytes but keeps its
`.review.json` evidence. This deliberately includes pending reviews: an
unreviewed applicant photo must not live forever merely because nobody made a
decision. Its package manifest continues to say `review_required`, so the
package remains valid and the unavailable image stays fail-closed. Approval
likewise deletes the redundant preview after copying the reviewed PNG into the
released package.

`retention_days=0` removes the processed original and withheld preview bytes as
soon as a successful run commits. The newly returned Output package remains
readable for that response and becomes eligible at the next cleanup trigger.
The confirmed `purge_local_data` tool can immediately clean one selected scope
or all three.

Audit records are intentionally outside both automatic retention and manual
purge. They contain hashes and processing facts only (`raw_content_logged:
false`), no raw values or original filenames, and remain the evidence needed to
reconstruct what the privacy gate did.

## What this model does not claim

No legal anonymity, no GDPR certification, no EU AI Act conformity assessment.
See [AI_ACT_AND_GDPR.md](AI_ACT_AND_GDPR.md).
