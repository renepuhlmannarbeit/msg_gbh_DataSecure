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
| Anonymised Markdown | yes | residual gate passed, SHA-256 matches the manifest, and the caller presents the package-bound read capability from this run |
| Image pixels | no in the public pilot | every graphic remains local; a future companion may release a separately human-approved asset |
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

Text- und Office-Parser laufen pro Datei in einem separaten Node-Prozess. Der
öffentliche Pilot akzeptiert ausschließlich TXT, Markdown (`.md`), CSV und DOCX. CSV-Zellen werden nur als Text in Markdown überführt und nie ausgeführt. PDF stoppt vor dem
Parserstart mit `PDF_COVERAGE_UNVERIFIED`; alle anderen Formate stoppen mit einem
festen Nicht-Unterstützt-Code. Jede Parserwarnung verhindert eine Freigabe. Auf
Windows x64 startet ein gebündelter nativer Launcher das Kind suspended, weist es vor
Resume einem Job Object zu und erzwingt einen Prozess, 768 MiB Prozess-/Jobspeicher,
40 Sekunden CPU-Zeit, 45 Sekunden Wallclock sowie `KILL_ON_JOB_CLOSE`. Die Quelle wird ausschließlich als
geerbtes stdin-Handle übergeben; Argumente enthalten keinen Quellpfad. Eine explizite
Handle-Liste vererbt nur stdin/stdout/stderr und nie das Jobhandle. Fehlt der Launcher,
passt sein PE-x64-Format nicht oder schlägt Paketkonsistenz-/Jobprüfung fehl, existiert
unter Windows kein direkter Node-Fallback. Auf macOS und Linux läuft derselbe
vertrauenswürdige Parser in einem kurzlebigen Node-Prozess mit dem seit Node 22.13
stabilen Permission Model: nur die gebündelten Parserdateien sind lesbar; Netzwerk-,
Kindprozess- und Worker-Berechtigungen werden nicht erteilt. Dieser Mechanismus ist
Defense-in-depth und ausdrücklich keine Sandbox gegen bösartigen Code. Der SHA-Sidecar ist kein
Authentizitätsnachweis. Codesignatur ist keine Produktvoraussetzung; eine
Herstelleridentität darf daraus nicht behauptet werden. Geschützte Installation und
nachvollziehbare Artefaktablage bleiben technische Härtungsmaßnahmen.
Der Launcher prüft mit `IsWow64Process2` zusätzlich die native Hostarchitektur und
stoppt daher auch ein emuliertes x64-Node auf Windows ARM64 vor der Verarbeitung.
Der Parent begrenzt zusätzlich Wallclock, V8-Heap und die Parserantwort auf 48 MiB und
akzeptiert nur das versionierte Parser-Schema. Auch unter Windows sind Node-Permissions
Defense-in-depth; erst ein erfolgreich getesteter AppContainer liefert die
noch offene OS-Netz-/Dateisystem-/Credential-Grenze.

Die PowerShell-Brücken für Windows OCR und Rasterisierung laufen über denselben
verifizierten Launcher, jedoch mit getrennt kalibrierten Grenzen: ein Prozess,
768 MiB Prozess-/Jobspeicher, 90 Sekunden CPU und 115 Sekunden Job-Wallclock.
`ACTIVE_PROCESS=1` wurde sowohl gegen Node als auch gegen einen Kindprozessversuch aus
PowerShell real geprüft. Fehlt oder scheitert diese Grenze, startet kein direkter
PowerShell-Fallback; das betreffende Bild bleibt zurückgehalten. Das Job Object ist
keine No-Network-, Profil-, Registry- oder Dateisystem-Sandbox. AppContainer und
restriktivere temporäre Ablage bleiben vor klinischen Echtdaten eigene Gates.

Every one of these stops the pipeline or withholds the asset rather than
guessing:

- every input format except TXT, Markdown (`.md`), CSV and DOCX
- unsupported or unparsable container, or any parser warning
- every PDF, independent of apparent text or image content; the legacy Lite parser is
  retained only for adversarial tests and cannot publish a package
- the future PDFium worker remains blocked until the Page-/Font-/Unicode-/Visual-
  coverage, licensing, AppContainer and release gates in `PDF_ENGINE_DECISION.md` pass
- extracted text or asset count over the configured limits
- residual gate finds a direct identifier or a literal the redactor claimed to
  have replaced
- image cannot be rasterised to PNG locally
- PNG with an invalid chunk CRC; the built-in decoder rejects it and the visual
  pipeline must obtain a clean PNG through local rasterisation or withhold it
- OCR bridge unavailable
- OCR/Raster-Konsol- oder Dateiausgabe überschreitet das feste Limit
- OCR liefert mehr als 100.000 Wörter, mehr als fünf Millionen Textzeichen oder
  ein nicht exakt validierbares Ergebnisobjekt
- die gesamte visuelle Verarbeitung eines Dokuments überschreitet drei Minuten;
  der Windows-Adapter beendet den Job einschließlich PowerShell, bestätigt das
  Launcher-Ende, stellt die Quelle wieder her und publiziert kein Teilpaket
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

A startup recovery pass restores abandoned hidden input claims without overwriting
an existing file, following symlinks or touching a claim that still has a live
owner. A hard process or machine crash after the source has already moved to
`Processed`, but before the Output rename, can still require manual recovery: the
original may then be present in `Processed` while no package is visible in `Output`.

## Batch and read capabilities

After the user confirms the visible file count, `begin_document_batch` creates a
server-owned snapshot for exactly 1–100 TXT-/Markdown-/CSV-/DOCX inputs. Names, sizes, mtimes and
hashes remain local. Replacing, adding or removing a file invalidates the whole
batch, even when the count stays unchanged. The server records each position as
pending, processing, released or stopped; a stopped item is not retried
automatically. A crash converts an interrupted processing position into a stopped
position on restart so the model cannot accidentally process it twice.

Successful processing returns a random, package-bound read capability. It lives
only in server memory, expires after 15 minutes and is required together with the
package ID for every Markdown or asset read. Package IDs alone are insufficient,
and the public MCP exposes no historical package-list tool. Restarting the server
therefore revokes every outstanding read capability.

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
manifest. The read tools verify both integrity and the short-lived package read
capability on every call, so a document modified after release or a guessed old
package ID is refused rather than served. The internal visual-release primitive also
verifies the current Markdown hash, but it is deliberately not exposed through
MCP. A future companion must additionally bind it to non-model-controlled local
human-presence evidence.

## Untrusted content

Document text and OCR output are data, never instructions. The server states
this in its MCP `instructions`, and no tool interprets document content as a
command.

## Retention and deletion

By default the runtime stores its workspace under `SecureDataMsg/workspace` in the
operating system's local app-data area, not in Documents. Known OneDrive, iCloud Drive, Dropbox, Google Drive and
Windows network locations are refused. This is a conservative known-path check,
not proof that an arbitrary custom folder is never synchronised; administrators
remain responsible for the chosen override.

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
The receipt, package manifest and status expose a privacy-ruleset identifier
separately from the gateway version. Credential catalog entries are offline
detection hints only. Explicit certification context is preserved; a catalog-
only organisation occurrence requires a local keep/redact decision, and neither
the occurrence nor that decision is written to the audit receipt or exposed to
the model.
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
