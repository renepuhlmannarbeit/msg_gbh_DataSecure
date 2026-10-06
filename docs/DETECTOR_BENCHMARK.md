# Detector benchmark

This benchmark compares detector candidates without adding them to the released plugin.
Every adapter receives the same version-controlled, synthetic ground truth and must return
only spans plus anonymized output. No real document, network request or model download is
part of the benchmark.

## Current synthetic-corpus baseline (3.2.0-rc158)

Command:

```bash
npm run benchmark:detectors
```

The deterministic contract corpus contains 150 cases, 107,139 characters, 1,950 sensitive
entities and 900 explicit preservation controls. It combines 30 public company-name tokens,
30 invented people, ten invented addresses and six layouts. The current DataSecure baseline
detects all 1,950 entities with no extra span and retains all 900 business and certification
controls: precision 1.0, recall 1.0, F1 1.0 and preservation rate 1.0.

This is a regression baseline for this synthetic corpus, not evidence of universal accuracy.
Runtime is reported for comparison but is machine-dependent. Real pilot documents remain a
separate, local, human-reviewed acceptance step.

RC111 additionally tests a length-preserving compatibility view for structured
identifiers (selected fullwidth characters and dot leaders) and scheme-specific
contact-URI boundaries. Those regressions are separate from these 150 corpus
cases. They do not claim arbitrary Unicode-confusable coverage. The original
text and UTF-16/OCR/review positions remain authoritative; pure Markdown
conversion never applies this privacy-only detection view.

## Metrics and adapter contract

`benchmarks/contract-corpus.js` owns the neutral cases and exact expected spans.
`benchmarks/evaluate-detector.js` reports aggregate and per-entity precision, recall and F1,
severity-weighted false negatives, retained professional content, runtime and throughput.
Invalid spans and duplicate or unrelated predictions cannot improve the score.

An adapter receives `{ source, profile }` and returns:

```js
{ spans: [{ type, start, end }], output: 'anonymized text' }
```

Detector benchmark stdout contains aggregates only. It must never contain source text, names, file
names, paths, mappings or document hashes.

## Local Standalone quality benchmark (BL-050.5)

```bash
npm run test:quality
npm run benchmark:quality -- --output dist/quality-local-new-run
# Generate just the reusable input kit, without running the product:
npm run uat:quality-corpus -- dist/quality-input-kit-new
```

Destinations must be new. Select only **EINGABEN** in the Standalone app; reference
and report files are not inputs. Originals are hash-checked after the run and never
changed. No cloud call, model download or additional product dependency is introduced.

The frozen reference has 60 logical documents, 48 development and 12 reserved cases
with separate templates/person identities. Twelve paired robustness variants produce
72 files across TXT, MD, CSV, DOCX, XLSX, PPTX, text PDF, scan PDF, PNG, JPG/JPEG and
BMP. Paired files are NOT counted as independent logical cases. OCR variants include
small text, rotation, low resolution and lossy JPEG. Native Office cases are simple
text/sheet/slide bodies, not exhaustive object, formula, chart or hidden-content coverage.
Declared development headings additionally exercise actual residual title-Keep and
typed company-review decisions when the productive gate requests them; group prompt
counts and unknown hypotheses are recorded, not assumed.

Four fully declared reference classes are measured here: PERSON, ORGANIZATION, EMAIL
and PHONE. Independent preservation ranges include FHIR, Kubernetes, ISO 27001,
Service Level, Fail Closed and technical titles. The older 150-case detector baseline
covers additional identifier classes separately; neither corpus claims complete privacy
coverage. Expand references only independently of the detector's predictions, review
semantic labels, and do not tune rules on the reserved acceptance cases.

`quality-reference.js` imports no detector. `evaluate-quality.js` binds individual
reference occurrences to extracted text, tracks partial remaining names, inserted OCR
fragments and copied identities outside the aligned body, and distinguishes factual
homonyms. Invalid/broad/duplicate detector spans cannot create a perfect score.
Missing or changed entities and missing/empty/deferred output cannot count as a clean
pass. Exact span precision/recall is a separate detector probe. CER/WER are computed
on the presentation-normalized body word sequence, not raw pixel or visual-layout truth;
uncertain alignment requires manual inspection. Deleting text is penalized independently
of privacy recall. These are known-reference measurements, not a universal anonymity
score or confidence estimate over the real population.
Lost factual source words/anchors remain visible even when they disappeared before
anonymization. Insertions inside factual assertions (including negations) are also
flagged; surviving old words alone cannot prove semantic preservation. Known person
components copied outside the aligned body are flagged unless a mapped factual homonym
explains the occurrence. Contact punctuation changes are checked against the surface
reference separately from token-based CER/WER.

The independent reference also annotates exact, person-bound gendered salutations
(`privacy_redactions`, DS-012). Their deliberate removal is counted separately from
factual loss; retained or unassessed salutations still fail. A free-standing "Frau",
academic/professional qualifications and changed or unbound text are not exempted.
Extraction must retain these source words: the exception applies only at privacy
output, not during OCR. Both Markdown-only extraction and the actual privacy input
are checked for entity, factual-anchor, qualification and context loss. Where an
automatic publication has no captured privacy input, `privacy_extraction.input_source`
explicitly records `markdown_extraction_fallback`, not an observed second extraction.

The runner projects the actual local Standalone runtime and bundled conversion runtime,
executes both real batch modes, reads final outputs through verified publication handles
and observes journals. It is **not** Tauri/GUI or an exact released ZIP test. The automatic
draft column is explicitly an **unreleased single-pass core probe**, not the complete
automatic residual pipeline. Actual automatic publication status is also recorded per
file. Final output is measured separately after synthetic, document-and-range-bound
review decisions; unknown/conflicting hypotheses are deferred, never blanket approved.
Counts describe source-bound occurrence decisions, not the number of human UI
clicks: one grouped click can supply several such decisions across documents.

Local outputs:

- `REFERENZ.json`, SHA-256 and `REFERENZ-PRUEFUNG.csv`: frozen labels and an unfilled
  first/second-review checklist; **human reference review is NOT_RUN**.
- `BERICHTE/QUALITAET.json`: stage metrics, format/OCR/entity/split strata and filenames.
- `BERICHTE/BEFUNDE.csv` and `.md`: exact filename with extension, location, error class
  and remaining/lost value. CSV formula starters are escaped. These are source-bearing
  local engineering files, NOT support/diagnostic logs or public CI artifacts.
- `GEGENPRUEFUNG`: extracted text, unreleased core probe and actually published final
  text when available, bound to each result in JSON for direct counterverification.

CLI stdout remains aggregate-only. Exit 1 means findings, incomplete source/output,
incomplete smoke selection or fatal execution, not necessarily a broken evaluator.
`--max-files` is only a labelled incomplete smoke run. Deterministic pure evaluator/report
tests are in the normal product gate and `pretest:standalone`; the 72-file run is opt-in.
`--native-only` is a 40-file non-OCR subset, not full-corpus acceptance.
Runtime/evaluation hashes are captured before execution. Source changes during the run
invalidate its quality verdict. Synthetic choices bind to the actual privacy extraction;
native CSV scaffolding need not equal the separately produced Markdown-only transcript.
`npm run gate:quality -- <local QUALITAET.json>` rejects stale source hashes, partial
execution, unconfirmed cleanup, inconsistent aggregates, unassessed outputs and open
quality findings. This engineering gate is separate from human and exact-package evidence.
No release authority is granted by either test. Windows host execution does not establish
macOS Intel/Apple Silicon results or human E1/E2/E3 evidence.

Methodological references: [TAB, Text Anonymization Benchmark](https://aclanthology.org/2022.cl-4.19/)
motivates evaluating disclosure and information preservation separately; [OCR-D evaluation
specification](https://ocr-d.de/en/spec/ocrd_eval.html) explains reference-based CER/WER and
alignment. This implementation adapts those principles; it is not their official scorer.

### Local Windows observation, 2026-10-06

The uncommitted RC158-source engineering run converted and published all 72 files.
Nine automatic paths deferred review; five actual synthetic group decisions completed
them. Final reference comparison found **two remaining company occurrences**, in
`development/quality-014-native.csv` and `development/quality-016-native.xlsx`, where
the declared company heading became neutral table content and was published without
that review. These are confirmed against the saved final text, not merely detector
span predictions. No reference-labelled PERSON/EMAIL/PHONE remainder was found in
this run; that does not establish general recall. There were also **226 lost factual
preservation anchors**, including falsely person-masked technical phrases, and nine
OCR-changed sensitive occurrences. Quality therefore did **not** pass.

Local report: `dist/quality-acceptance-20261006/BERICHTE/QUALITAET.json` with
reference SHA-256 `827de027174f5447dc0a3358510f812e3adbec922d0244233e0ed34676b00bda`.
Product corrections are tracked as BL-050.6 and BL-050.7, not silently included in
this measurement change. Human annotation review and native Mac runs remain NOT_RUN.

### Standalone corrections and bounded remeasurement, 2026-10-06

Uncertain name-shaped headings and neutral table cells now enter the local typed
review before becoming persistent PERSON aliases. CSV headers and one-column XLSX
cells are included. Explicit person fields, structured credentials and proven legal
company names/short forms remain under their existing strict gates. Crossing
candidate hypotheses are joined into disjoint, exact source intervals. Run-bound
choices are reused across formats and restart; after an earlier identity is resolved,
replay binds the remaining choices by immutable source coordinates, not a renumbered ID.
No AI training or model was added: recognition and run-local alias registration are
rule-based. No global technical-term keep list was introduced.

The stable Windows 40-file non-OCR rerun at
`dist/quality-final-native-20261006/BERICHTE/QUALITAET.json` published all 40 outputs.
It found no known residual entity occurrences and no lost technical preservation
anchors in the final outputs. Its original reference classified three removed
"Frau" salutations as factual-word loss. Revalidation confirmed that these exact
person-bound removals are required by the existing DS-012 policy, not a product
defect. The old report remains unchanged; the later reference explicitly models
that policy without exempting ordinary words or qualifications. The single-pass
core probe still has over-redactions; it is not the actual Standalone publication
path. The historical subset returns exit 1 and does not prove OCR, full-corpus,
native Mac or human acceptance.

The final full-format rerun at `dist/quality-final-all-formats-20261006` converted
all 72 inputs; nine outputs were published and 63 deferred in the shared review
block. Five OCR-induced candidates had no unambiguous reference-bound decision.
The synthetic reviewer therefore deferred instead of guessing approval. Nine
changed sensitive OCR occurrences and twelve factual extraction-word losses
remain findings. The 63 unpublished outputs are unevaluated, not clean. Its 197
recorded decisions count bound occurrences, not human prompts or clicks. Neither
rerun had a fatal runtime error; both correctly return exit 1 for their open
quality/scope findings.

The full product regression passed all 198 test files (79 base plus 119 direct).
The focused quality-report test additionally checks exact reference-file coverage,
not merely the number of unique result filenames. Docs/version/link checks and
the local CLI structure check pass. None of these green functional gates converts
the open OCR/content measurements into a quality acceptance or a native Mac test.

For retained OCR contact lines the local Markdown/extraction contract now reports
`OCR_CONTACT_VALUES_UNVERIFIED`, page/image and OCR-line locations, and missing/low
word-confidence evidence where available. High confidence never proves an exact
contact value. Recognized text is not silently repaired or discarded. Unrecognized
labels/characters can still evade that heuristic, and OCR-corrupted factual content
remains a quality limitation.

### OCR and salutation revalidation, 2026-10-06

The shared converter now re-segments bounded low-confidence lines from their
original pixels instead of guessing spelling or resizing a whole document. It
allows at most 32 extra passes and two million crop pixels per page, with a
200,000-pixel crop ceiling, within the existing owned-worker deadline. Native PDF
mask geometry is not altered. The five previously unknown umlaut-heading cases
are now correctly extracted, with source bytes unchanged.

Email word crops are diagnostic only: even two matching alternate readings cannot
replace the primary page reading. Differences add a content-free quality reason to
the existing local page/line warning. A candidate which selected agreeing crops
raised changed email occurrences from nine to sixteen in the full corpus and was
rejected; its report at `dist/quality-revalidated-all-formats-20261006` is retained
as failed evidence. Repeatability and high OCR confidence are not correctness.
The technique uses the documented segmentation and border methods in
[Tesseract ImproveQuality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
and the pinned [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md),
not a new model, contact dictionary or reference-derived production allowlist.

The final stable report at `dist/quality-contact-invariant-final-20261006/BERICHTE/QUALITAET.json`
binds reference SHA-256 `f841d0c73e1d1fca4ed999196373208c316f8d695fefda326f8deff9bb891b0f`.
All 72 variants were converted and published after 202 source-bound occurrence
decisions, with no unknown review hypotheses or fatal execution error and confirmed
worker cleanup. Final outputs contain no known reference entity remainders or lost
factual anchors/words; seven DS-012 salutation removals are separately counted.
Factual extraction losses fell from twelve to zero; nine OCR-changed email occurrences
remain in both measured paths. Actual privacy inputs were captured for 63 variants;
nine automatically published variants explicitly use the Markdown fallback above.
The quality gate correctly fails only with `QUALITY_FINDINGS_OPEN`. These limited
results are not general anonymity, perfect OCR, human reference approval, native
macOS execution or an exact release-archive test.

Two independent read-only technical reviews rechecked the contact-value invariant
and person-bound salutation evaluation. An inconsistent OCR word/line metadata
counterexample led to rejecting absent word offsets and preserving contact lines
without any reconstruction; its revalidation confirms zero crops and unchanged
contact text. Their evaluator counterexamples led to
separate privacy-input loss metrics and regressions against a falsely exempted
factual word or a missing academic qualification. The focused quality command now
passes 52 cases; the real Windows converter suite passes 46 groups, including the
umlaut and contact-disagreement cases. The rerun full product suite passes 199
test files (80 base plus 119 direct); the final metadata counterexample also passes
in the focused run. Docs/link/version, strict CLI structure and diff checks pass.
New release packaging remains unavailable
while source provenance is uncommitted; that guard is not bypassed.

### Pre-privacy contact confirmation, 2026-10-06 (unreleased)

Independent real-pixel probes reproduced all nine wrong primary email readings.
Thirteen additional crop strategies did not reliably fix them; word/line
agreement also reproduced a confidently wrong `ga` instead of `qa`. The product
therefore never chooses a contact spelling from those probes. All retained,
recognised OCR contact occurrences require explicit confirmation or correction
in the existing Standalone private review window **before** person reservation
and privacy analysis. This is not a detector exemption: confirmed/corrected text
still passes ordinary redaction and independent residual verification.

The closed review contract binds UTF-16 offsets, page/line, full extraction and
admitted snapshot. Complete answers are stored privately and authenticated
against run/seed, policy and pseudonym contract. Defer/reopen does not require
the first document to be decided again, but changed extraction or tampering
cannot silently replay an answer. Contact decisions are occurrence-specific,
not guessed from identical OCR spellings in another document. Cowork has no new
contact hook, UI dependency or format release. See the
[review contract](canonical/contracts/BATCH_REVIEW_V2.md).

The stable Windows report at
`dist/quality-contact-review-final-source-20261006/BERICHTE/QUALITAET.json`
contains all 72 variants/60 logical cases, 55 literal contact confirmations,
nine explicit reference corrections and 202 entity-occurrence choices, with
zero unknown choices. Reference SHA-256 remains
`f841d0c73e1d1fca4ed999196373208c316f8d695fefda326f8deff9bb891b0f`.
Raw extraction and the 32 actually captured raw OCR privacy inputs still show
nine changed email occurrences. Corrected privacy-input metrics show zero
changed/missing entities, lost factual words or anchors. Final publication is
72/72 with no known remainder among 310 reference-sensitive occurrences and no
lost factual words/anchors; seven DS-012 salutation removals remain separate.
Actual final privacy-input capture covers 65 variants; seven automatic outputs
explicitly use Markdown fallback. Worker cleanup is confirmed, no fatal failure
or source drift. The unchanged quality gate **still rejects** the nine raw
OCR findings with `QUALITY_FINDINGS_OPEN`; corrections never rewrite raw metrics.

The evaluator alone derives synthetic corrections from exact independent
reference occurrences; production code has no access to this reference or its
contacts. These are not human corrections or GUI acceptance. The new 13 contact
contract cases cover independent spellings, mixed lines/CR endings, real private
IPC, strict frame limits, tampering and restart. A separate two-document test
uses a controlled converter transcript with the actual admission/journal,
privacy engine, contact store, broker/frame decoder, defer/reopen and verified
publication. Real converter/OCR is measured separately in 46 Windows converter
groups and the full benchmark. The full product suite passes all 201 test files
(82 base and 119 direct). Credential-shaped telephone counterexamples
remain opaque `CREDENTIAL` findings while independent phone leftovers still
block. New native Mac and exact release-archive evidence remains NOT_RUN.

### Additional native/package revalidation, 2026-10-06 (engineering only)

The official pinned `tessdata_best` 4.1.0 candidate was evaluated on all 28
independent raster cases, including the 19 correct counterexamples. It fixed two
old email errors but introduced 17 new ones (24 wrong emails versus nine).
The default Tesseract.js worker also encountered a real float-model WASM
function failure; an explicitly engineering-only standard-SIMD control allowed
the complete comparison. With that same core, fast remained at nine errors.
Best took 25.190 s versus 10.004 s, model bytes 24,029,062 versus 5,638,524,
and observed peak RSS 263,172,096 versus 237,953,024 bytes. These are individual
sequential engineering probes, not a package performance acceptance. Product
models, references and runtime remain unchanged. Reproduction/provenance:
`dist/ocr-best-probe-20261006`. Other real-pixel dictionary/PSM/threshold/language
probes either preserved the nine errors or degraded previously correct cases.

The fresh full report is
`dist/quality-contact-native-final-20261006/BERICHTE/QUALITAET.json`:
72 published outputs, zero known final reference leaks/semantic losses,
55 contact confirmations, nine explicit synthetic corrections and 202 entity
choices. Raw errors still number nine; the strict gate returns only
`QUALITY_FINDINGS_OPEN`. No fatal failure; cleanup confirmed. The report now
also hashes the actual pinned conversion Node, OCR models/addon and PDF.js
runtime, not merely JS source. Missing or different converter identity is stale.

Package integration adds real PNGs, explicit contact correction, defer and real
process restart before and after correction, ordinary entity review and
automatic next-document continuation. Both contact documents are reviewed
first; only then does ordinary entity review start. Deliberately different synthetic
replacement values must appear in the actual subsequent privacy review before
and after restart; accepting an ignored correction cannot pass. Complete
nonblank output bodies are checked after only the defined product notices;
extra text/contacts and missing/reordered fields fail. These are actual private
IPC decisions, not native UI clicks. Native operator acceptance adds
`--prepare-ocr` to `tests/manual/standalone-native-review-campaign.mjs`, with
three real application sessions and explicit correction/context attestation.
Preparing this campaign leaves `NOT_RUN`; it does not execute human acceptance.

The user explicitly authorised the existing macOS engineering workflows and a
separate test-branch push despite the still-red raw-OCR gate. Main, released
RC158 archives and release authority remain unchanged. Native workflow results
must name the exact branch commit and architecture; human Gatekeeper/Finder/
VoiceOver and correction-field UAT remain separate.

The authorised native run
[37460941660](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37460941660)
passed on Intel and Apple Silicon at commit
`86b9f757caf1b7df8731d787d007c9b77dde88da`. Both architectures passed 47
Rust tests, warning-free Clippy, actual supervisor/cancellation probes and
44 converter groups; two Windows-only cases were explicitly skipped, never
counted as passed. The real built app, extracted ZIP (direct and LaunchServices)
and mounted DMG successfully loaded both pages and completed correlated private
IPC, with normal quit and observed sidecar termination. For each architecture,
the two repeated builds of its ZIP were byte-identical. The exact archives
passed mixed-format/privacy/error/review/
follow-up/restart/history scenarios and the real-pixel contact-correction
scenario above. ZIP inventory/Mach-O and DMG hashes also passed after local
download. Exact archive hashes and failed earlier attempts are recorded in
[CURRENT_STATE](canonical/CURRENT_STATE.md).

These package-bound decisions are private IPC, not human Tauri/WebView edits.
The full 72-variant quality corpus has not been measured against these exact
Mac archives; the Windows quality report and the narrower Mac package scenario
must not be merged into such a claim. Ad-hoc signing is not notarisation.
Nine raw OCR email errors, human reference/correction-field acceptance and
release authority remain open. Main and released RC158 bytes are unchanged.

## External evaluation order

1. Evaluate DocCloak.Core's regex-only path in an isolated, pinned test environment. This is
   the lowest-complexity candidate and requires no model in the product.
2. Evaluate Microsoft Presidio as an external Python benchmark, not as a plugin dependency.
3. Evaluate GLiNER/ONNX only with pinned offline artifacts, recorded license and hashes, and
   a security and package-size review.
4. Consider product integration only when a candidate reduces severity-weighted false
   negatives without lowering preservation, weakening fail-closed gates or changing the two
   user-facing skills.

The MCP Apps review UI is a separate experiment. A better interface cannot compensate for a
worse detector, and it receives no release authority.
