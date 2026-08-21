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
| Withheld image pixels | never | current MCP cannot release them; future local companion requires human presence |
| OCR text of a withheld image | yes | after it passed the same text gate as the document body |
| Review preview | never | not readable through any tool; no model-callable approval tool is exposed |
| Audit record | metadata only | random operation ID, categories, counters, versions and status only |
| Diagnostic event | metadata only | processing stage, format class, profile, counters and allowlisted error code only |

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
- PDF without an extractable text layer and without safely extractable JPEG page images
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
release is refused rather than served. The internal visual-release primitive also
verifies the current Markdown hash, but it is deliberately not exposed through
MCP. A future companion must additionally bind it to non-model-controlled local
human-presence evidence.

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

Deletion and evidence are completed per review entry, not per directory: the
bytes go and every record associated with that preview is updated in the same
step. Records whose claimed preview no longer exists are reconciled on every
cleanup trigger, even when the directory mtime is still fresh, so an interrupted
pass cannot leave a `.review.json` promising a file that is gone for another
retention window. Invalid non-basename claims fail closed without inspecting or
deleting outside data. An inspection error is reported and is never mistaken
for proof that bytes are absent. Approval of an expired item is refused with a
message that names the retention window rather than reporting a missing package
file.

`retention_days=0` removes the processed original and withheld preview bytes as
soon as a successful run commits. The newly returned Output package remains
readable for that response and becomes eligible at the next cleanup trigger.

**Visual approval is currently disabled through Claude regardless of retention.**
`retention_days=0` additionally removes the preview before any future local
companion review could occur. Applicant and personnel profiles withhold every
image by default, so no graphic from those profiles is released in this mode.

The confirmed `purge_local_data` tool can immediately clean one selected scope
or all three. It ignores the expiry window, and `privacy_status` records the
trigger (`startup`, `run` or `purge`) plus a `forced` flag so a purge is not
mistaken for an ordinary retention run. Failures are counted per scope using
only validated error-code tokens; arbitrary exception messages, paths and
document names never enter status. `removed` remains a count of direct entries
for all three scopes, while `removed_review_previews` separately reports the
number of preview files removed.

Two deliberate limits. A review directory that holds nothing but evidence is
kept, so `Needs Visual Review` accumulates one small directory per processed
package with images; the `.review.json` records are the proof of what was
withheld and when its bytes expired. And there is no explicit reject tool:
withholding plus expiry is the rejection path, so the only way to refuse a
graphic is to leave it alone.

Audit receipts are intentionally outside both automatic retention and manual
purge. They contain a random operation ID, categories, counters, versions and
status only (`raw_content_logged: false`). They contain no document or value
hashes, exact file sizes, paths, filenames or raw values. Integrity hashes for
released output remain in the package manifest and expire with that package.
At startup, parseable legacy audit records are rewritten through the same strict
metadata whitelist; unreadable or locked records remain visible as a
non-sensitive migration error in `privacy_status` and block further document
processing. Such an unresolved legacy file may still contain an old fingerprint;
it must be remediated locally by IT before the gateway becomes ready again.

The diagnostic journal is separate from the audit record and is not evidence of
a release. It is capped at 200 events and 14 days. Its strict canonical schema
cannot contain filenames, paths, document content, detected values, raw error
messages or hashes; malformed and forged rows are ignored. A diagnostic write
failure is best effort and cannot weaken or block the document privacy gates.
If retaining a new global receipt fails after package publication, a metadata-only
persistent block marker stops further processing. On restart the gateway restores
the receipt from the canonical package-local copy before cleanup; if reconciliation
is impossible, IT remediation remains mandatory and readiness stays false.

## What this model does not claim

No legal anonymity, no GDPR certification, no EU AI Act conformity assessment.
See [AI_ACT_AND_GDPR.md](AI_ACT_AND_GDPR.md).
