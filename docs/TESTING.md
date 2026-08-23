# Testing

```bash
npm test                # the whole suite
npm run test:golden     # regenerate the golden expected output after an intended change
npm run test:windows-visual # real Windows OCR/redaction acceptance (Windows only)
npm run test:skills     # local German skill/contract acceptance
npm run benchmark:detectors # aggregate detector quality on the synthetic ground truth
npm run build:plugin && npm run test:plugin-zip # same acceptance against the built ZIP
```

`npm test` prüft zusätzlich jedes Byte der im kanonischen Pluginbaum eingebetteten,
weiterhin gesperrten universellen OCR-V2-Runtime. Damit verwenden normaler ZIP-Build
und Marketplace dieselbe Quelle. Für die erneute Prüfung eines frisch assemblierten
externen Runtime-Verzeichnisses bleibt der Engineering-Build verfügbar:

```bash
node scripts/build-portable-plugin.mjs --runtime dist/ocr-runtime/universal
node scripts/verify-portable-plugin-zip.mjs
```

CI führt die portable Suite mit Node 22.13 auf macOS und Linux sowie die vollständige
Suite einschließlich nativer Job-Object-/OCR-Prüfung auf Windows aus. Ein grüner
macOS-CI-Lauf belegt Parser- und Vertragsverhalten, ersetzt aber nicht die manuelle
Finder-/Claude-Desktop-Abnahme auf echter Mac-Hardware.

The suite has no npm dependencies. `tests/helpers.js` is a ~50 line runner; each
file prints one line per case and exits non-zero on the first failure.

## What runs

| File | Cases | Covers |
|---|---|---|
| `test-manifest.js` | 18 | version consistency across package.json, MCPB manifest, plugin.json, VERSION, BUILD_INFO and all skills; exact pilot format contract; tool/prompt parity between manifest and server; marketplace target; plugin entry point and native build/package contracts; and that every test the npm script names exists |
| `test-architecture-contracts.js` | 9 | canonical batch snapshot, pseudonym, embedded-content recursion/resource/active-content, raw-content network boundary, PDF/OCR risk and locked PDF.js/Tesseract engineering contracts; these tests pin safety invariants but do not by themselves release a format |
| `test-plugin-structure.js` | – | plugin directory layout, skill frontmatter, MCP config, and mechanical coverage requiring every runtime tool to appear in agent guidance or a justified exception |
| `test-skill-eval-corpus.js` | 13 | versioned set of 29 synthetic model-behavior scenarios covering triggering, non-triggering, queue confirmation, cancelled local selection and host processing, explicitly confirmed continuation in a new chat, resumable single-file calls, safe image defaults, PDF refusal, partial results, current-run package binding and cleanup; this validates the evaluation contract, not a simulated Claude run |
| `test-parsers.js` | 56 | DOCX/XLSX/PPTX text including nested DrawingML text boxes, entities, embedded/vector media, recursively embedded OOXML with shared depth/count/archive/expanded-byte budgets enforced before decompression, mandatory unique internal `officeDocument` package roots and renderable DOCX main roots, DOCX image and package relationships, including orphan, traversal, external, duplicate, type-mismatch, active, wrong-story-root and missing-target refusal with content-free warnings; embedded OOXML requires exactly one internal `package` edge from a parser-reachable content part and blocks duplicate, orphan, unrelated or active edges; XLSX renders worksheets, drawings, charts and media only through declared internal `worksheet`/`drawing`/`chart`/`image` relations, suppresses orphan/external/wrong-type parts and blocks every formula cell even with cached values; PPTX renders slides, notes, charts and media only through internal relationships and suppresses orphan/external slide text, chart data, images or ambiguous notes; personal/core/application/custom OOXML metadata, fail-closed complex custom metadata, strict part-path coverage and external-relationship blocking; Markdown table escaping; standalone PNG routing; legacy PDF parser adversarial coverage plus the mandatory `PDF_COVERAGE_UNVERIFIED` release gate; ZIP hardening including false sizes, aggregate limits and header consistency; CSV conversion and literal fence handling; every failure path raises `SafeError` instead of returning empty text |
| `test-text-source.js` | 8 | fatal UTF-8 with optional BOM; NFC/LF normalization; forbidden invisible controls; literal CommonMark/GFM-shaped structure; inert HTML, frontmatter, links and image syntax; PII inside Markdown markup; complete content-graph positions; large deterministic source. Markdown remains outside the released allowlist until its remaining gates pass |
| `test-csv-source.js` | 9 | RFC-4180 quotes, doubled quotes and multiline fields; comma, semicolon and tab detection; ambiguous/malformed/inconsistent input refusal; stable headers; literal formula-looking fields; PII in horizontal table rows; shared UTF-8 and graph boundary; deterministic large tables. CSV remains outside the released allowlist until its remaining gates pass |
| `test-parser-isolation.js` | 13 | mandatory Windows-launcher invocation, inherited stdin transport, renamed-PDF signature blocking before spawn, absence of a PDF implementation in the packaged worker, missing/corrupt launcher refusal without fallback, native-host architecture probing, fixed resource/setup codes, cooperative cancellation, confirmed deadline termination, response-size/schema enforcement and content-free worker errors |
| `test-content-graph.js` | 11 | versioned text/table/metadata/image graph, W3C-style half-open positions, structural image fragments, complete asset binding, exact sequential ids, ordered/non-overlapping/full non-whitespace text coverage, no text after assets, no duplicated raw text, traversal/extra-field refusal, mandatory isolated-boundary validation, complete nested OOXML container chains and exact OOXML-part locators for DOCX body/header/comments/core metadata, XLSX worksheet/chart/drawing text and PPTX slide/notes/chart data |
| `test-network-boundary.js` | 3 | real preloaded refusal of DNS, HTTP(S), TCP/TLS, UDP, HTTP/2, fetch, WebSocket and listeners; coexistence with the parser permission process; mandatory parser/companion launch wiring. CI executes the same probe on Windows, macOS and Linux; a local run proves only its current OS cell |
| `test-ui-process-policy.js` | 8 | explicit data classification for every native dialog; cross-platform folder opening with allowlisted environment and `shell: false`; raw document text only over stdin to Windows/macOS reviews and contextual Linux Zenity/KDialog review without argument leakage; fixed PowerShell/JXA UI scripts without network primitives. The test deliberately keeps raw-review OS sandboxes marked unverified |
| `test-pdfium-spike.mjs` | 6 | offline contract for the non-release PDFium lock: immutable distributor/upstream provenance and hashes, V8/XFA-off build, license inventory, strict separation from the product worker and unchanged `PDF_COVERAGE_UNVERIFIED` runtime gate; the networked/native engineering probe remains an explicit `npm run pdfium:spike` command |
| `test-portable-ocr-adapter.js` | 7 | exact OS/architecture selection, explicit release gate, complete hash inventory and extra-file rejection, bounded OCR-V1 execution, fixed content-free errors and canonical error vocabulary; the shipped runtime remains closed while its release flag is disabled |
| `test-ocr-universal-assembler.mjs` | 8 | four exact target bundles, byte-identical shared runtime closure, single model/runtime copy, four launcher entries, non-release v2 contract, adapter compatibility and rejection of a validly rehashed but divergent platform core |
| `test-ocr-universal-bundle.mjs` | 1 | complete byte, size, target, model and component inventory of the vendored universal OCR runtime while its release gate remains disabled |
| `test-zip-permissions.mjs` | 2 | deterministic ZIP central-directory Unix metadata preserves executable launcher mode while ordinary files remain non-executable |
| `test-native-launcher.js` | 7 | real Windows Job Object transport, `ACTIVE_PROCESS=1` for Node and the PowerShell visual host, process/job memory, CPU and wallclock enforcement, and `KILL_ON_JOB_CLOSE` worker removal |
| `test-pii-regression.js` | 76 | golden personnel profile byte for byte, exact preservation of business periods, occurrence-scoped credential issuers in sections, prose and OCR spans, explicit-versus-ambiguous credential context, domain-shaped issuers versus verification URLs, IT/testing/product/business-analysis/health-IT vocabulary, lower-case legal brands including terminal punctuation, internal connectors, bounded party clauses, ordinal metadata guards and common contractual abbreviations, occurrence-scoped organisation/person overlap and connector false-positive guards, project-prose disambiguation, German and Unicode person names, common telephone/address formats, one-pass gateway convergence, plus one case per defect listed below |
| `test-contract-skill-acceptance.js` | 12 | both shipped German skill contracts plus ten invented service contracts with twenty public company-name tokens; identifiers must disappear while service, amount, term, termination and certification content survive; `test:plugin-zip` repeats the same acceptance against the extracted release ZIP |
| `test-contract-skill-matrix.js` | 150 | deterministic combinations of 30 public company-name tokens, 30 invented people, ten invented addresses and six contract layouts; parties, people, contact, bank and reference data must disappear while business and certification content survives; the built-ZIP check repeats the matrix against the shipped runtime |
| `test-contract-corpus.js` | 2 | deterministic positional ground truth for 1.000 German/English contract cases (750/250) plus a separate 1.000-case acceptance corpus across contract, personnel, applicant and customer profiles |
| `test-detector-benchmark.js` | 3 | neutral ground-truth evaluation for the 1.000 German/English contracts and the 1.000-case active-profile corpus: aggregate and per-type precision/recall/F1, severity-weighted misses and explicit content-preservation controls; a negative control proves that extra redaction is penalized |
| `test-credential-catalog.js` | 10 | deterministic offline catalog schema, aliases, context separation, optional verified references, no runtime lookup and unknown-certification preservation |
| `test-image-sanitizer.js` | 20 | PNG/BMP round trips, bounded PNG decompression and chunk lengths, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-windows-visual.js` | 10 | mandatory verified Job Object launcher without PowerShell fallback, secret-free environment, native status/resource mapping, console limits, race-safe confirmed process-tree termination, fixed errors and bounded OCR schema |
| `test-visual.js` | 21 | every branch of the visual gate with injected OCR and rasteriser bridges, including the document-wide deadline |
| `test-retention.js` | 14 | expiry by injected time/mtime, duplicate and invalid evidence, immediate reconciliation, scope isolation, stable status diagnostics, staging and audit preservation, and non-fatal deletion/inspection failures |
| `test-audit-privacy.js` | 7 | strict metadata receipts, legacy-to-v3 canonical migration, separate privacy-ruleset provenance, persistent write blocking, marker and markerless crash-window reconciliation, leakage and readiness blocking |
| `test-diagnostics.js` | 6 | strict diagnostic metadata whitelist, canonical status output, 14-day/200-event retention, forged-row hardening, non-blocking write failures, coarse error classification and explicit content-free local diagnostic export |
| `test-companion-job-store.js` | 8 | versioned append-only job contract, monotone transitions, local human evidence, limited verification claims, release hash binding, terminal states, strict raw-data-field refusal, tamper and traversal refusal |
| `test-companion-retention.js` | 6 | expiry and zero-day cleanup, strict direct-entry deletion, unsafe-entry preservation, metadata-only status, and local human evidence for immediate purge |
| `test-companion-ipc.js` | 16 | platform multi-picker commands, strict source validation, local fallback, HMAC/session/replay enforcement, path-free responses and journals, explicit local-selection cancellation on Windows/macOS/Linux, real fd-3 bootstrap process start, and Linux Zenity/KDialog fallback behavior |
| `test-companion-processor.js` | 37 | TXT/Markdown/CSV/DOCX release, clear batch files without duplicate per-file confirmation, renamed-PDF blocking in the private picker path, terminal local cancellation and skip, mandatory keep/redact decisions for ambiguous credential issuers, locator-scoped manual redactions with exact preview, post-edit residual blocking, value-free and Unicode-stable highlight hints, stdin-only Windows/macOS and Linux Zenity/KDialog review transport, real Windows-Forms initialization and automated button-path acceptance, visual/unsupported-part DOCX blocking, abandoned private-copy cleanup, rollback, queue isolation, and path-free result/audit evidence |
| `test-companion-supervisor.js` | 11 | child-environment secret filtering, Windows process-tree termination, real authenticated launch, sequence recovery, multi-picker orchestration, one terminal no-selection result without a retry dialog, non-authoritative completion UI failure, guaranteed close, and pre-launch profile/platform refusal |
| `test-completion-summary.js` | 7 | all-success, partial and all-stopped wording; strict count validation; content-free Windows invocation; fail-closed acknowledgement; real auto-closing Windows Forms initialization; and macOS/Linux notification fallbacks |
| `test-gateway-e2e.js` | 37 | TXT/Markdown (`.md`/`.markdown`)/CSV/DOCX routes end to end, refusal jedes erkannten, aber noch nicht freigegebenen Formats vor Claim/Output/Reviewkopie, parser-warning fail-closed behavior, all-pixels-local policy, mandatory PDF and renamed-PDF null-output/byte-identical restoration, cooperative cancellation, startup claim recovery, zero-day retention, audit migration blocking, tamper detection, path traversal, source claiming and failure-injected cleanup/publish/move rollback |
| `test-package-read-capabilities.js` | 4 | random in-memory package-bound capabilities, expiry/restart revocation, package-ID-only refusal and absence of historical enumeration |
| `test-batch-secret-store.js` | 6 | isolated OS-secret-store pilot: opaque batch accounts, fixed service namespace, 256-bit Set/Get/Delete round trip, unavailable/malformed/native-error refusal, and no filesystem, environment, CLI or self-encryption fallback path; no productive pseudonym release claim |
| `test-batch-pseudonym-registry.js` | 6 | in-memory `HMAC-SHA-256`/Base32 derivation for a shared batch context: Unicode canonicalization, same entity across documents, unlinkability across secrets, deterministic collision extension, disposal, no persistence claim and the internal hand-off through the normal residual-PII gate; not wired into the released batch path |
| `test-keyring-pilot.js` | 3 | verifies the separate `@napi-rs/keyring` lock, all required native target artifacts and the content-free Set/Get/Delete runner; the actual native smoke test runs only with `RUN_KEYRING_PILOT=1` or in the dedicated three-platform workflow |
| `test-batch-session.js` | 39 | 100-Datei-/500-MB-Grenzen vor Hashbildung, valide freie-Speicher-Metadaten und DOCX-ZIP-Verzeichnis-Vorprüfung ohne Arbeitskopie, versiegelte Arbeitskopien bei unveränderten Originalen, systemweite Ein-Stapel-Sperre samt validierter Dead-Owner-Recovery und fail-closed Manipulationsschutz, Recovery-/Wartungs-Respekt vor einem lebenden Owner und bestätigte Fortsetzung eines danach verwaisten Schritts, Journalbindung vor Recovery-Bereinigung, Mapping-Formelschutz, Rollback und gestoppte Dateien ohne erfundenes Ergebnis, Count- und Storage-Refusal, persistenter Fortschritt einschließlich In-Flight-Phasen ohne falschen Abschluss, Ablaufbereinigung, fehlertolerante Bereinigung bereits veröffentlichter Arbeitskopien inklusive datensparsamem Statuszähler, crashsichere Paketübergabe mit idempotentem Mapping und erneuter Zustellung, ausdrücklich bestätigte Wiederaufnahme in einem neuen Chat, lokale inhaltsfreie Phasen-Checkpoints, lokaler aggregierter Batch-Nachweis sowie explizite Wiederaufnahme ausschließlich retryfähiger Dateien |
| `test-mcp-protocol.js` | 29 | the server driven over real stdio: startup recovery, handshake, batch/read-capability schemas, explicit continuation confirmation, annotations, retention/purge/governance instructions, confirmed purge, privacy-safe diagnostic status and local diagnostic export, cancellation/error codes, notification handling and stdout framing |
| `test-adversarial.js` | 20 | hostile document content, Unicode that looks like text but is not, pathological sizes and regex behaviour, mutated containers, determinism, concurrency, the MCP argument surface |
| `exploratory-review-20.js` | 20 | alternative German phone/address/name forms, Unicode e-mail and IDN, IPv6, lower-case IBAN, labelled birth dates and vehicle plates, customer URLs, duplicate ZIP entries and PNG CRC integrity |
| `test-sarif-check.mjs` | 4 | fail-closed local CodeQL report parsing without leaking finding messages into the release-gate output |

The case counts above are maintained per suite. CI treats every listed suite plus the
plugin structure check as mandatory; the generated 1.000-case detector corpus is
the largest deterministic ground-truth block. The separate 150-case skill matrix
remains an end-to-end smoke and preservation suite.

The Windows CI additionally runs `test:windows-visual`: a synthetic scan passes through
the real Job Object, Windows OCR, pixel redaction and verification OCR; malformed EMF
input must be refused. This acceptance is intentionally separate from the assertion
count above.

## The adversarial suite

The other files check that documented behaviour holds. This one attacks from
angles the design did not explicitly plan for, and each angle has found
something:

| Angle | What it asks |
|---|---|
| Hostile content | Does a document that instructs Claude, forges a placeholder or forges a compliance header change any behaviour? |
| Unicode | Do decomposed umlauts, soft hyphens, zero-width characters or non-Latin scripts get past the name patterns? |
| Sizes and regexes | Does any pattern backtrack catastrophically? Does a 90 kB document stay in budget? |
| Malformed containers | Do 40 byte-level mutations of a DOCX ever raise something other than `SafeError`? Can a ZIP entry escape? Can an IHDR claim 3.6 gigapixels? |
| Determinism | Is the same input byte-identical twice? Do pseudonyms leak between documents? |
| Concurrency and arguments | Can two parallel runs produce two packages from one source? Can a read argument reach another file, or a negative offset misbehave? |

Findings it produced, all fixed:

- decomposed umlauts (NFC vs NFD) were not matched at all, so a surname in a
  document exported from macOS passed through untouched
- a Word soft hyphen (`U+00AD`) inside a surname hid it from every name pattern;
  Word inserts these for justified text, so this is an ordinary document
- `POSTAL_ADDRESS_RE` used `\s+`, which matches a newline: "20457 Hamburg" ate
  the blank line and the first token of the next paragraph and produced
  `[LOCATION_REDACTED]-2026-0815`. `PHONE_RE` and `DE_SV_RE` had the same
  latitude. All structured detectors are line-local now, which is asserted
  generically rather than per pattern.

## Fixtures

`npm run fixtures` generates the Office and PDF fixtures from
`tests/make-fixtures.js`. They are not committed: CI fails if any `.pdf`,
`.doc*`, `.xls*` or `.ppt*` file is tracked.

`tests/fixtures/synthetic-personnel-profile.md` is committed because it is plain
text. Every value in it is invented.

## The golden file

`tests/expected/synthetic-personnel-profile.expected.md` is generated, not
hand-written. When a change to the engine intentionally changes the output, run
`npm run test:golden` and review the diff before committing it. The command is
portable across Windows and POSIX shells. A hand-written
expectation is how the previous version ended up asserting behaviour the code
never had.

## Regression cases

Each of these corresponds to a defect found in 3.2.0-rc2:

- an upper-case German word (`SOFTWARE`, `UNTERNEHMEN`, `HOFFMANN`) was matched
  as a BIC and replaced before the person rule ran, leaking the given name
- an 11-digit order number or a German-formatted amount blocked the residual
  gate forever, because the gate reported identifier classes the redactor had no
  rule to remove
- `\b` is ASCII-only, so names and organisations with umlauts or `ß` were never
  matched
- a bare surname without an honorific was never replaced
- the same person received several pseudonyms via `Herr X` / `Frau X` / `X`
- the organisation allow list was unreachable, because it was compared against
  strings that always end in a legal form
- every title-case bigram in a personnel profile became a person, so `User
  Stories` and `Azure DevOps` were pseudonymised
- comma-shaped industry, language and role lines bypassed the person-name
  plausibility filter, while real comma and particle names still need detection
- applicant and personnel profiles treated their first 40 non-empty lines as
  implicit person context, so unlisted comma-shaped capability pairs in both
  headers and section bodies were pseudonymised; structural header boundaries
  and immediate body contact evidence now separate those cases
- applying abstract-noun morphology without context let real names such as
  `Jung, Dennis` and `Hartung, Denis` through; it now suppresses a candidate
  only when the document already has a strong person anchor, and that Boolean
  context is retained through residual verification without retaining identity
  data
- five-digit quantities followed by units such as `Euro`, `Stück` or `Punkte`
  were mistaken for postal addresses
- representative golden, contact, comma-name and contract documents did not
  explicitly assert one-pass gateway convergence
- markdown heading prefixes were eaten by the customer/project line rule
- a labelled employee number was documented as removed but matched no detector

## Platform coverage

CI runs the suite on `windows-latest`, `macos-latest` and `ubuntu-latest`. Windows x64
has the most complete engineering boundary; the TXT/Markdown/CSV/DOCX text path is also intended
for macOS and Linux. CI explicitly installs Node and therefore does not prove the
installation-free Plugin-ZIP runtime. Automated tests also do not replace a fresh
plugin/MCPB installation. Platform-neutral tests stub the visual bridge, which still
requires manual acceptance on each target platform.

## Native Windows acceptance status

- Passed: Windows OCR/redaction/verification against a synthetically rendered scan.
- Passed: the real Windows text-review form initializes, selects a synthetic alias,
  invokes the redaction and approval buttons, returns the exact range and preserves
  the professional text. This proves the native control path, not human usability.
- Still open: EMF/WMF rasterisation through the PowerShell bridge.
- Still open: installation, upgrade and rollback in a fresh Claude engineering
  environment.
- Still open: a small human usability acceptance and the signed local companion;
  no real-data pilot before both are approved.
