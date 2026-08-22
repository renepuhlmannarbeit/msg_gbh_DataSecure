# Testing

```bash
npm test                # the whole suite
npm run test:golden     # regenerate the golden expected output after an intended change
npm run test:windows-visual # real Windows OCR/redaction acceptance (Windows only)
npm run test:skills     # local German skill/contract acceptance
npm run build:plugin && npm run test:plugin-zip # same acceptance against the built ZIP
```

The suite has no npm dependencies. `tests/helpers.js` is a ~50 line runner; each
file prints one line per case and exits non-zero on the first failure.

## What runs

| File | Cases | Covers |
|---|---|---|
| `test-manifest.js` | 15 | version consistency across package.json, MCPB manifest, plugin.json, VERSION, BUILD_INFO and all skills; PDF blocked-format contract; tool/prompt parity between manifest and server; marketplace target; plugin entry point and native build/package contracts; and that every test the npm script names exists |
| `test-plugin-structure.js` | – | plugin directory layout, skill frontmatter, MCP config, and mechanical coverage requiring every runtime tool to appear in agent guidance or a justified exception |
| `test-parsers.js` | 30 | DOCX/XLSX/PPTX text including nested DrawingML text boxes, entities, embedded/vector media, strict part-path coverage and external-relationship blocking; Markdown table escaping; standalone PNG routing; legacy PDF parser adversarial coverage plus the mandatory `PDF_COVERAGE_UNVERIFIED` release gate; ZIP hardening including false sizes, aggregate limits and header consistency; CSV fence escaping; every failure path raises `SafeError` instead of returning empty text |
| `test-parser-isolation.js` | 11 | mandatory Windows-launcher invocation, inherited stdin transport, renamed-PDF signature blocking before spawn, absence of a PDF implementation in the packaged worker, missing/corrupt launcher refusal without fallback, native-host architecture probing, fixed resource/setup codes, confirmed deadline termination, response-size/schema enforcement and content-free worker errors |
| `test-pdfium-spike.mjs` | 6 | offline contract for the non-release PDFium lock: immutable distributor/upstream provenance and hashes, V8/XFA-off build, license inventory, strict separation from the product worker and unchanged `PDF_COVERAGE_UNVERIFIED` runtime gate; the networked/native engineering probe remains an explicit `npm run pdfium:spike` command |
| `test-native-launcher.js` | 7 | real Windows Job Object transport, `ACTIVE_PROCESS=1` for Node and the PowerShell visual host, process/job memory, CPU and wallclock enforcement, and `KILL_ON_JOB_CLOSE` worker removal |
| `test-pii-regression.js` | 73 | golden personnel profile byte for byte, exact preservation of business periods, occurrence-scoped credential issuers in sections, prose and OCR spans, explicit-versus-ambiguous credential context, domain-shaped issuers versus verification URLs, IT/testing/product/business-analysis/health-IT vocabulary, lower-case legal brands including terminal punctuation, internal connectors, bounded party clauses, ordinal metadata guards and common contractual abbreviations, occurrence-scoped organisation/person overlap and connector false-positive guards, project-prose disambiguation, common German telephone/address formats, one-pass gateway convergence, plus one case per defect listed below |
| `test-contract-skill-acceptance.js` | 12 | both shipped German skill contracts plus ten invented service contracts with twenty public company-name tokens; identifiers must disappear while service, amount, term, termination and certification content survive; `test:plugin-zip` repeats the same acceptance against the extracted release ZIP |
| `test-contract-skill-matrix.js` | 150 | deterministic combinations of 30 public company-name tokens, 30 invented people, ten invented addresses and six contract layouts; parties, people, contact, bank and reference data must disappear while business and certification content survives; the built-ZIP check repeats the matrix against the shipped runtime |
| `test-credential-catalog.js` | 9 | deterministic offline catalog schema, aliases, context separation, optional verified references and unknown-certification preservation |
| `test-image-sanitizer.js` | 20 | PNG/BMP round trips, bounded PNG decompression and chunk lengths, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-windows-visual.js` | 10 | mandatory verified Job Object launcher without PowerShell fallback, secret-free environment, native status/resource mapping, console limits, race-safe confirmed process-tree termination, fixed errors and bounded OCR schema |
| `test-visual.js` | 21 | every branch of the visual gate with injected OCR and rasteriser bridges, including the document-wide deadline |
| `test-retention.js` | 14 | expiry by injected time/mtime, duplicate and invalid evidence, immediate reconciliation, scope isolation, stable status diagnostics, staging and audit preservation, and non-fatal deletion/inspection failures |
| `test-audit-privacy.js` | 7 | strict metadata receipts, legacy-to-v3 canonical migration, separate privacy-ruleset provenance, persistent write blocking, marker and markerless crash-window reconciliation, leakage and readiness blocking |
| `test-diagnostics.js` | 5 | strict diagnostic metadata whitelist, canonical status output, 14-day/200-event retention, forged-row hardening, non-blocking write failures and coarse error classification |
| `test-companion-job-store.js` | 8 | versioned append-only job contract, monotone transitions, local human evidence, limited verification claims, release hash binding, terminal states, strict raw-data-field refusal, tamper and traversal refusal |
| `test-companion-retention.js` | 6 | expiry and zero-day cleanup, strict direct-entry deletion, unsafe-entry preservation, metadata-only status, and local human evidence for immediate purge |
| `test-companion-ipc.js` | 11 | platform multi-picker commands, strict source validation, local fallback, HMAC/session/replay enforcement, path-free responses and journals, local cancellation, and real fd-3 bootstrap process start |
| `test-companion-processor.js` | 28 | TXT/DOCX release, renamed-PDF blocking in the private picker path, terminal local cancellation and skip, mandatory keep/redact decisions for ambiguous credential issuers, locator-scoped manual redactions with exact preview, post-edit residual blocking, value-free and Unicode-stable highlight hints, real UTF-8 Windows pipe plus stdin-only review transport, real Windows-Forms initialization and automated button-path acceptance, visual/unsupported-part DOCX blocking, abandoned private-copy cleanup, rollback, queue isolation, and path-free result/audit evidence |
| `test-companion-supervisor.js` | 10 | child-environment secret filtering, Windows process-tree termination, real authenticated launch, sequence recovery, multi-picker orchestration, non-authoritative completion UI failure, guaranteed close, and pre-launch profile/platform refusal |
| `test-completion-summary.js` | 6 | all-success, partial and all-stopped wording; strict count validation; content-free Windows invocation; fail-closed acknowledgement; and real auto-closing Windows Forms initialization |
| `test-gateway-e2e.js` | 26 | Office plus standalone PNG routes end to end, mandatory PDF and renamed-PDF null-output/byte-identical restoration, mixed-batch continuation after parsing and ambiguity failures, document-wide visual-timeout rollback, explicit-profile enforcement for image-only input, internal visual-release primitive and preview deletion (not exposed through MCP), zero-day retention, audit migration blocking, tamper detection, path traversal, source claiming and failure-injected cleanup/publish/move rollback |
| `test-mcp-protocol.js` | 25 | the server driven over real stdio: startup orphan cleanup, handshake, schemas, annotations, retention/purge/governance instructions, confirmed purge, privacy-safe diagnostic status, error codes, notification handling, stdout framing |
| `test-adversarial.js` | 20 | hostile document content, Unicode that looks like text but is not, pathological sizes and regex behaviour, mutated containers, determinism, concurrency, the MCP argument surface |
| `exploratory-review-20.js` | 20 | alternative German phone/address/name forms, Unicode e-mail and IDN, IPv6, lower-case IBAN, labelled birth dates and vehicle plates, customer URLs, duplicate ZIP entries and PNG CRC integrity |
| `test-sarif-check.mjs` | 4 | fail-closed local CodeQL report parsing without leaking finding messages into the release-gate output |

Total: 554 assertion-level cases plus the plugin structure check (**555 checks overall**).

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

CI runs the suite on `ubuntu-latest` and `windows-latest`. Windows is the only
supported runtime, so a Linux-only pipeline would not prove much; the visual
bridge itself is stubbed in tests and still needs one manual acceptance run on a
target machine with Windows OCR available.

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
