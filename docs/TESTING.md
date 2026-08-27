# Testing

```bash
npm test                # the whole suite
npm run test:ci         # short, security-relevant set used by the one automatic CI job
npm run test:golden     # regenerate the golden expected output after an intended change
npm run test:windows-visual # real Windows OCR/redaction acceptance (Windows only)
npm run test:skills     # local German skill/contract acceptance
npm run test:intake-worker-stress # 50 real detached intake-worker starts
npm run test:legacy-input # versionierte, datenbewahrende Upgrade-Migration
npm run benchmark:detectors # aggregate detector quality on the synthetic ground truth
npm run build:plugin && npm run test:plugin-zip # same acceptance against the built ZIP
node scripts/verify-sea-launcher.mjs --target <target> --launcher <binary> # engineering-only MCP proof
```

## Lokaler RC63-Nachweis 27.08.2026

RC63 ergänzt eine gemeinsame fail-closed Projektion für terminalen Progress,
Results, den bestehenden lokalen Abschlussdialog und den normalen tokenfreien
Cowork-Handoff. Direkte Positiv- und Negativtests prüfen gemischte Grade, beide
erlaubten visuellen Auslassungen, Paket-/Journal-Widerspruch, Legacy ohne
Nachklassifizierung, strikt begrenztes Worker-IPC, genau einen Abschlussdialog,
Results vor Capability-Ausgabe sowie Paging ohne Paket-ID, Token, Cursor,
Dateinamen oder Pfade. Die Toolzahl, der Picker und der Bestätigungsablauf bleiben
unverändert. `npm test` bestand vollständig einschließlich 67 servergebundener
Batchtests, 100 Dateien, zehn Ergebnisseiten, Crash/Resume an den Positionen 1,
50 und 100 sowie 2.000 explorativen Anonymisierungsfällen. Ein dabei sichtbar
gewordener quadratischer Abschluss-Pfad wurde entfernt: Ein paketgebundener
Nachweis verifiziert die Pakete genau einmal und bereits exportierte Aggregate
öffnen sie bei jeder Ergebnisbestätigung nicht erneut; ein Zähltest fixiert den
Vertrag. Der frisch gebaute ZIP enthält 385 Einträge und hat SHA-256
`4aca812afa50ffc2421c668eb8248bc17ab3a40c67a77df3dfbeb6950debf886`, das MCPB
enthält 550 Einträge und hat SHA-256
`840c987e49859e9ffa89c279d42a73bc86a0f5bbb1d101e8bb8f25ea6d8c5e8f`.
Paketparität, Skill-Abnahme, 150-Fälle-Vertragsmatrix und MCPB-Prüfung bestanden.
Dieser E0-Nachweis ersetzt weiterhin keine frische installierte Windows-/macOS-
Cowork-, Accessibility- oder Security-Abnahme.

## Lokaler RC62-Nachweis 26.08.2026

RC62 erweitert die dauerhafte DS-045-Bindung um `datasecure-batch-evidence/3`
und `data-secure-audit-receipt/4`. Direkte Tests prüfen alle drei Grade, beide
erlaubten Auslassungsarten, Paket-/Journal-/Receipt-Parität, unveränderte
Pending-Marker bei Crash/Retry, Legacy ohne Nachklassifizierung und den
inhaltsfreien endlichen Reason-Code-Katalog. `npm test` endete vollständig mit
Exit-Code 0. Der Lauf bestand unter anderem 67 Batch-/Crash-/Resume-, 40
Gateway-End-to-End-, 31 MCP-Protokoll-, 20 adversariale und 2.000 explorative
Fälle sowie 96 DOCX-Differentialdokumente und sieben native Windows-Grenztests.
Der echte 100-Dateien-Lauf und Crash-Recovery an Position 1, 50 und 100 waren
ebenfalls grün. Ein Security-Gegenreview wies nach, dass zuvor ein formal
gültiger frei erfundener Code wie `ALICE_MUSTERMANN` persistierbar war; RC62
verwirft solche Werte und persistiert stattdessen ausschließlich den festen Code
`INTERNAL_FAILURE`. Dieser E0-Nachweis erweitert keine Formatfreigabe und ändert
den Cowork-Werkzeug- oder Bestätigungsablauf nicht.

## Lokaler RC61-Nachweis 26.08.2026

Nach der crashsicheren Bindung der DS-045-Ergebnisgrade an Paketmanifest,
`datasecure-batch/2` und Mapping CSV/Outbox V2 endete `npm test` vollständig mit
Exit-Code 0. Der Lauf umfasste insbesondere 14 Journal-, elf Mapping-, acht
Outbox-, sechs Result-Bindungs-, 67 servergebundene Batch-/Crash-/Resume-, 40
Gateway-End-to-End-, 31 MCP-Protokoll- und 20 adversariale Fälle sowie die
2.000-Fälle-Exploration, 96 DOCX-Differentialdokumente und sieben native
Windows-Job-Object-Prüfungen. Ein dabei gefundener Post-Publish-Crashrest wurde
geschlossen: Ein nur im Speicher gesetzter Grad wird bei fehlgeschlagenem
Journalwechsel verworfen und beim Wiederanlauf ausschließlich aus dem erneut
verifizierten V3-Paketmanifest gebunden. Dieser E0-Nachweis erweitert keine
Formatfreigabe und ersetzt keine frische ZIP-/MCPB-/Cowork-Abnahme auf den
Zielplattformen.

Lokaler RC55-Schlusslauf 26.08.2026: `npm test` endete nach dem atomaren R3b-Schnitt
mit Exit-Code 0. Der Lauf bestand 15 direkte Legacy-Migrationsfälle,
20 Architekturverträge, 40 Gateway-End-to-End-, 66 Batch-/Crash-/Resume- und
31 MCP-Protokollfälle sowie 20 adversariale Fälle und den 2.000-Fälle-Sweep. Fresh
Install erzeugt keinen technischen `Input`; sichtbare Altdateien und historische
Claims bleiben erhalten. Der Fast Path und der reale TXT-/CSV-/DOCX-Benchmark sind
ebenfalls grün. Der vorherige RC54-Schlusslauf: `npm test` endete nach dem fail-closed
Schutz historischer Originale in `Processed` mit Exit-Code 0. Zusätzlich zu den
bestehenden Korpora bestanden 21 Retention-/Purge-Grenzfälle, zwölf direkte
Read-only-Snapshot-Grenztests, 19 Architekturverträge, 40 Gateway-End-to-End-
Szenarien, 66 reale Batch-/Crash-/Resume-Szenarien, 31 MCP-Protokollfälle,
20 adversariale Fälle, der 2.000-Fälle-Sweep, 96 DOCX-Differentialfälle und
sieben native Windows-Job-Object-Prüfungen. Die zuvor für RC53 ausgeführten
Copy-only-Snapshot-Prüfungen bleiben Teil der grünen Gesamtsuite. Der Fast Path
endete ebenfalls mit Exit-Code 0. Ein zuvor reproduzierbarer transienter Windows-
`EPERM` beim atomaren Batch-Journal-Rename blieb nach identitätsgebundenem,
begrenztem Retry in 50 aufeinanderfolgenden echten Intake-Worker-Läufen aus;
Journal-, Active-Lock-, Lease- und Picker-Grenztests belegen zusätzlich dauerhafte
Fehler, Replacement-Rennen und verlorenes Abschluss-IPC fail-closed. Dies ist ein
lokaler E0-Nachweis und keine installierte Windows-/macOS-/Claude-Abnahme.

Lokaler Schlusslauf 23.08.2026: `npm run test:ci` endete nach den SEA-Launcher-,
Dispatcher-, Runtime-Status- und Assemblyänderungen mit Exit-Code 0. Darin enthalten
waren unter anderem 58 Batch-/Crash-Recovery-, 37 Gateway-, 29 MCP-Protokoll- und
20 adversariale Fälle. Zusätzlich bestanden zwei byteidentische Windows-x64-
SEA-Builds und der echte eigenständige MCP-Handshake bei leerem `PATH`. Dies ist
keine macOS-/Linux- oder installierte Claude-Abnahme.

`npm test` prüft zusätzlich jedes Byte der im kanonischen Pluginbaum eingebetteten,
weiterhin gesperrten universellen OCR-V2-Runtime. Damit verwenden normaler ZIP-Build
und Marketplace dieselbe Quelle. Für die erneute Prüfung eines frisch assemblierten
externen Runtime-Verzeichnisses bleibt der Engineering-Build verfügbar:

```bash
node scripts/build-portable-plugin.mjs --runtime dist/ocr-runtime/universal
node scripts/verify-portable-plugin-zip.mjs
```

Ein normaler Push oder Pull Request startet aus Kostengründen genau **einen** auf zehn
Minuten begrenzten Ubuntu-Job mit `test:ci`. Doppelte Läufe desselben Branches werden
abgebrochen; reine Änderungen außerhalb des Produkt-, Test- und kanonischen
Vertragsbaums starten gar keinen Lauf. Die vollständige Windows-/macOS-/Linux-Matrix,
der Windows-Nativtest, Release-Builds, OCR-/PDF-Piloten und Security-Scans sind nur
über bewusstes `workflow_dispatch` verfügbar. Ein manueller grüner macOS-Lauf belegt
Parser- und Vertragsverhalten, ersetzt aber nicht die Finder-/Claude-Desktop-Abnahme
auf echter Mac-Hardware.

`test-workflow-budget.js` schützt diese Grenze: höchstens ein automatischer Workflow,
ein Ubuntu-Job, keine Matrix oder Artefakte und zehn Minuten Timeout. Der manuelle
Workflow `release-evidence.yml` erlaubt gezielt nur `platform`, `release` oder `all`;
`security.yml` ebenso nur JavaScript-, Native-, Secret- oder Gesamtevidenz. Die
teure Gesamtwahl ist für einen konkreten Releasekandidaten vorgesehen, nicht für
jeden Commit.

The product runtime has no npm dependencies. `tests/helpers.js` is a ~50 line
runner; explicitly pinned dev-only differential oracles may compare selected
parsers but are never included in the plugin or MCPB runtime.

## What runs

| File | Cases | Covers |
|---|---|---|
| `test-manifest.js` | 19 | version consistency across package.json, MCPB manifest, plugin.json, VERSION, BUILD_INFO and all skills; exact pilot format contract; tool/prompt parity between manifest and server; marketplace target; plugin entry point and native build/package contracts; and that every test the npm script names exists |
| `test-architecture-contracts.js` | 14 | canonical batch snapshot, pseudonym, keyring, batch-review, embedded-content recursion/resource/active-content, raw-content network boundary, text/CSV/DOCX, PDF/OCR risk, locked PDF.js/Tesseract engineering contracts and the POSIX supervisor's CPU/address/data/file-size/open-file/RSS/wallclock/process-group source contract; these tests pin safety invariants but do not by themselves release a format or platform |
| `test-plugin-structure.js` | – | plugin directory layout, skill frontmatter, MCP config, and mechanical coverage requiring every runtime tool to appear in agent guidance or a justified exception |
| `test-host-matrix.js` | 5 | versioned positive/negative host classes, live `privacy_status` gate, forbidden upload/Computer-Use/filesystem/connector fallbacks and normal use of already-clean Markdown |
| `test-runtime-start-matrix.js` | 4 | trennt die offizielle MCPB-Built-in-Node-Garantie vom unbelegten Plugin-ZIP-/Marketplace-Start, pinnt den tatsächlichen `node`-Befehl, verbietet Nutzerinstallationen/Online-Bootstrap/stillen Fallback/drei OS-Plugins und hält SEA bis zu Zielbinär-, Dispatch- und Lifecycle-Nachweisen geschlossen |
| `test-sea-launcher-contract.js` | 6 | pins Node 22.23.2/postject and four official archive hashes, checks the fixed one-plugin Windows/POSIX dispatch layout, deterministic SEA configuration, absence of download fallbacks, real-MCP verifier inputs and the still-disabled release switch |
| `test-sea-plugin-assembly.js` | 4 | requires all four target binaries plus hash-bound build and real-MCP evidence, confines command rewriting to an engineering staging tree, forbids network/shell bootstrap and proves that an incomplete target set produces no archive |
| `test-skill-eval-corpus.js` | 14 | versioned set of 33 synthetic model-behavior scenarios covering triggering, non-triggering, four negative host classes, queue confirmation, cancelled local selection and host processing, explicitly confirmed continuation in a new chat, resumable local execution, safe image defaults, PDF refusal, partial results, current-run package binding and cleanup; this validates the evaluation contract, not a simulated Claude run |
| `test-parsers.js` | 69 | DOCX/XLSX/PPTX text including nested DrawingML text boxes, entities, embedded/vector media, recursively embedded OOXML with shared depth/count/archive/expanded-byte budgets enforced before decompression, including a real 21-package boundary where the first over-budget package is neither rendered nor disclosed; mandatory unique internal `officeDocument` package roots and complete renderable DOCX main roots, DOCX image and package relationships, including orphan, traversal, external, duplicate, type-mismatch, active, wrong-story-root, truncated-story and missing-target refusal with content-free warnings; every allowed DOCX secondary-story type (`header`, `footer`, `comments`, `footnotes`, `endnotes`) must match its declared relationship and Word root; embedded OOXML requires exactly one internal `package` edge from a parser-reachable content part and blocks duplicate, orphan, unrelated or active edges; XLSX renders worksheets, reachable comments, drawings, charts and media only through declared internal `worksheet`/`comments`/`drawing`/`chart`/`image` relations, suppresses orphan/external/wrong-type parts, unrendered content structures and truncated worksheet roots, accepts empty self-closing parts, and blocks every formula cell even with cached values; PPTX renders slides, reachable notes, DrawingML tables, charts, media and reachable layout/master text only through internal relationships, permits normal shared layouts/masters, and suppresses orphan/external slide text, malformed table tails, note data, chart data, images, template content, truncated slides or ambiguous notes; personal/core/application/custom OOXML metadata, fail-closed complex custom metadata, strict part-path coverage and external-relationship blocking; Markdown table escaping; standalone PNG routing; legacy PDF parser adversarial coverage plus the mandatory `PDF_COVERAGE_UNVERIFIED` release gate; ZIP hardening including false sizes, aggregate limits and header consistency; CSV conversion and literal fence handling; every failure path raises `SafeError` instead of returning empty text |
| `test-docx-differential.js` | 2 | Mammoth 1.12.1 as an exactly locked BSD-2-Clause development oracle, plus 96 valid generated DOCX files with multiple ordinary main-body paragraphs and table rows whose tokens must agree with the local parser. It is neither a runtime dependency nor evidence that every Word story or external Word generator is covered. |
| `test-text-source.js` | 8 | fatal UTF-8 with optional BOM; NFC/LF normalization; forbidden invisible controls; literal CommonMark/GFM-shaped structure; inert HTML, frontmatter, links and image syntax; PII inside Markdown markup; complete content-graph positions; large deterministic source. Markdown remains outside the released allowlist until its remaining gates pass |
| `test-csv-source.js` | 10 | RFC-4180 quotes, doubled quotes and multiline fields; comma, semicolon and tab detection; ambiguous/malformed/inconsistent input refusal; stable headers; literal formula-looking fields including embedded PII; PII in horizontal table rows; shared UTF-8 and graph boundary; deterministic large tables. CSV is restricted to the local active text path; practical three-OS acceptance remains open. |
| `test-csv-differential.js` | 2 | Papa Parse 5.5.3 as an exact locked MIT test-only oracle, plus 180 unambiguous comma/semicolon/tab RFC-4180 rows across LF/CRLF, Unicode, escaped quotes and multiline cells. It verifies agreement with the local parser while intentional delimiter ambiguity remains fail-closed. |
| `test-parser-isolation.js` | 14 | mandatory Windows-launcher invocation, inherited stdin transport, renamed-PDF signature blocking before spawn, absence of a PDF implementation in the packaged worker, missing/corrupt launcher refusal without fallback, native-host architecture probing, truthful status distinction between Windows Job Object hard limits and the POSIX Node/parent-timeout fallback, fixed resource/setup codes, cooperative cancellation, confirmed deadline termination, response-size/schema enforcement and content-free worker errors |
| `test-content-graph.js` | 11 | versioned text/table/metadata/image graph, W3C-style half-open positions, structural image fragments, complete asset binding, exact sequential ids, ordered/non-overlapping/full non-whitespace text coverage, no text after assets, no duplicated raw text, traversal/extra-field refusal, mandatory isolated-boundary validation, complete nested OOXML container chains and exact OOXML-part locators for DOCX body/header/comments/core metadata, XLSX worksheet/chart/drawing text and PPTX slide/notes/chart/layout/master data |
| `test-network-boundary.js` | 4 | real preloaded refusal of DNS lookup, promises, resolver and record-resolution methods; HTTP(S), TCP/TLS, UDP, HTTP/2, fetch, WebSocket and listeners; coexistence with the parser permission process; mandatory parser/companion launch wiring. The manual platform matrix executes the same probe on Windows, macOS and Linux; a local or automatic run proves only its current OS cell |
| `test-workflow-budget.js` | 7 | exactly one automatic, single-job, timeout-bounded Ubuntu workflow; path filtering, cancellation, read-only permissions, manually selected heavy platform/release/security evidence and a locked development-only dependency boundary |
| `test-ui-process-policy.js` | 9 | explicit data classification for every native dialog; cross-platform folder opening with allowlisted environment and `shell: false`; raw document text only over stdin to Windows/macOS reviews and contextual Linux Zenity/KDialog review without argument leakage; fixed PowerShell/JXA UI scripts without network primitives. The test deliberately keeps raw-review OS sandboxes marked unverified |
| `test-pdfium-spike.mjs` | 6 | offline contract for the non-release PDFium lock: immutable distributor/upstream provenance and hashes, V8/XFA-off build, license inventory, strict separation from the product worker and unchanged `PDF_COVERAGE_UNVERIFIED` runtime gate; the networked/native engineering probe remains an explicit `npm run pdfium:spike` command |
| `test-portable-ocr-adapter.js` | 7 | exact OS/architecture selection, explicit release gate, complete hash inventory and extra-file rejection, bounded OCR-V1 execution, fixed content-free errors and canonical error vocabulary; the shipped runtime remains closed while its release flag is disabled |
| `test-ocr-universal-assembler.mjs` | 8 | four exact target bundles, byte-identical shared runtime closure, single model/runtime copy, four launcher entries, non-release v2 contract, adapter compatibility and rejection of a validly rehashed but divergent platform core |
| `test-ocr-universal-bundle.mjs` | 1 | complete byte, size, target, model and component inventory of the vendored universal OCR runtime while its release gate remains disabled |
| `test-zip-permissions.mjs` | 2 | deterministic ZIP central-directory Unix metadata preserves executable launcher mode while ordinary files remain non-executable |
| `test-native-launcher.js` | 7 | real Windows Job Object transport, `ACTIVE_PROCESS=1` for Node and the PowerShell visual host, process/job memory, CPU and wallclock enforcement, and `KILL_ON_JOB_CLOSE` worker removal |
| `test-pii-regression.js` | 79 | golden personnel profile byte for byte, exact preservation of business periods, occurrence-scoped credential issuers in sections, prose and OCR spans, explicit-versus-ambiguous credential context, domain-shaped issuers versus verification URLs, IT/testing/product/business-analysis/health-IT vocabulary, lower-case legal brands including terminal punctuation, internal connectors, bounded party clauses, ordinal metadata guards and common contractual abbreviations, occurrence-scoped organisation/person overlap and connector false-positive guards, project-prose disambiguation, German and Unicode person names, common and French grouped telephone formats, grouped German tax IDs, phrase-introduced telephone numbers, explicit French/Spanish/Dutch personnel labels, one-pass gateway convergence, plus one case per defect listed below |
| `test-contract-skill-acceptance.js` | 13 | both shipped German skill contracts plus ten invented service contracts with twenty public company-name tokens; identifiers must disappear while service, amount, term, termination and certification content survive; `test:plugin-zip` repeats the same acceptance against the extracted release ZIP |
| `test-contract-skill-matrix.js` | 150 | deterministic combinations of 30 public company-name tokens, 30 invented people, ten invented addresses and six contract layouts; parties, people, contact, bank and reference data must disappear while business and certification content survives; the built-ZIP check repeats the matrix against the shipped runtime |
| `test-contract-corpus.js` | 2 | deterministic positional ground truth for 1.000 German/English contract cases (750/250) plus a separate 1.000-case acceptance corpus across contract, personnel, applicant and customer profiles |
| `test-detector-benchmark.js` | 3 | neutral ground-truth evaluation for the 1.000 German/English contracts and the 1.000-case active-profile corpus: aggregate and per-type precision/recall/F1, severity-weighted misses and explicit content-preservation controls; a negative control proves that extra redaction is penalized |
| `test-format-acceptance-matrix.js` | 101 | real gateway path for each active format (TXT, Markdown, CSV, DOCX) across German/English/French/Spanish/Dutch personnel profiles as well as contract, applicant and customer documents; 17 deterministic variants use different names, e-mails and phone numbers. The matrix checks auto-profile selection, direct-identifier removal, cell-scoped CSV credential context and preservation of IT roles/certifications. |
| `test-credential-catalog.js` | 11 | deterministic offline catalog schema, issuer aliases and credential-code context separation, optional verified references, no runtime lookup and unknown-certification preservation |
| `test-image-sanitizer.js` | 20 | PNG/BMP round trips, bounded PNG decompression and chunk lengths, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-windows-visual.js` | 10 | mandatory verified Job Object launcher without PowerShell fallback, secret-free environment, native status/resource mapping, console limits, race-safe confirmed process-tree termination, fixed errors and bounded OCR schema |
| `test-visual.js` | 21 | every branch of the visual gate with injected OCR and rasteriser bridges, including the document-wide deadline |
| `test-retention.js` | 21 | expiry by injected time/mtime, duplicate and invalid evidence, immediate reconciliation, scope isolation, stable status diagnostics, staging and audit preservation, non-fatal deletion/inspection failures, fail-closed Output cleanup after incomplete batch-journal inspection, permanent protection of historical `Processed` sources, hidden/directory/link entries and outside targets, unreadable protection state, total-purge preflight and explicit disposable-scope precedence |
| `test-batch-retention-protection.js` | 6 | short-write retry and zero-progress refusal, POSIX parent-directory fsync, complete delivery/mapping package protection, malformed/unreadable journal fail-closed behavior and unreadable journal-root handling |
| `test-audit-privacy.js` | 7 | strict metadata receipts, legacy-to-v3 canonical migration, separate privacy-ruleset provenance, persistent write blocking, marker and markerless crash-window reconciliation, leakage and readiness blocking |
| `test-diagnostics.js` | 8 | strict diagnostic metadata whitelist, canonical status output, 14-day/200-event retention, forged-row hardening, non-blocking write failures, coarse error classification and explicit content-free local diagnostic export, including refusal of a redirected export directory before writing and capacity-safe replacement |
| `test-companion-job-store.js` | 8 | versioned append-only job contract, monotone transitions, local human evidence, limited verification claims, release hash binding, terminal states, strict raw-data-field refusal, tamper and traversal refusal |
| `test-companion-retention.js` | 6 | expiry and zero-day cleanup, strict direct-entry deletion, unsafe-entry preservation, metadata-only status, and local human evidence for immediate purge |
| `test-companion-ipc.js` | 18 | platform multi-picker commands, strict source validation, local fallback, HMAC/session/replay enforcement, path-free responses and journals, explicit local-selection cancellation on Windows/macOS/Linux, real fd-3 bootstrap process start, and Linux Zenity/KDialog fallback behavior |
| `test-companion-processor.js` | 39 | TXT/Markdown/CSV/DOCX release, clear batch files without duplicate per-file confirmation, renamed-PDF blocking in the private picker path, terminal local cancellation and skip, validated macOS button/default/cancel contracts, mandatory keep/redact decisions for ambiguous credential issuers, locator-scoped manual redactions with exact preview, post-edit residual blocking, value-free and Unicode-stable highlight hints, stdin-only Windows/macOS and Linux Zenity/KDialog review transport, real Windows-Forms initialization and automated button-path acceptance, visual/unsupported-part DOCX blocking, abandoned private-copy cleanup, rollback, queue isolation, and path-free result/audit evidence |
| `test-batch-review-model.js` | 6 | one anonymous shared review call; per-document re-mapping; mandatory decision completeness; no name/path leakage; strictly exact normalized-context grouping that only expands after an explicit local group action; deferred review remains bounded |
| `test-companion-supervisor.js` | 11 | child-environment secret filtering, Windows process-tree termination, real authenticated launch, sequence recovery, multi-picker orchestration, one terminal no-selection result without a retry dialog, non-authoritative completion UI failure, guaranteed close, and pre-launch profile/platform refusal |
| `test-completion-summary.js` | 8 | all-success, partial and all-stopped wording; strict count validation; content-free Windows invocation; fail-closed acknowledgement; real auto-closing Windows Forms initialization; and macOS/Linux notification fallbacks |
| `test-local-review-executor.js` | 3 | detached token-free worker start, content-free public response fields and the explicit five-minute synchronous versus thirty-minute detached local-UI timeout contract |
| `test-gateway-e2e.js` | 40 | TXT/Markdown (`.md`/`.markdown`)/CSV/DOCX routes end to end, including inert CSV contact-URI formulas with verified PII removal, refusal jedes erkannten, aber noch nicht freigegebenen Formats vor Claim/Output/Reviewkopie, parser-warning fail-closed behavior, all-pixels-local policy, mandatory PDF and renamed-PDF null-output/byte-identical restoration, cooperative cancellation, startup claim recovery, zero-day retention, audit migration blocking, tamper detection, path traversal, copy-only source preservation and failure-injected cleanup/publication rollback |
| `test-package-read-capabilities.js` | 9 | random in-memory package-bound capabilities, expiry/restart revocation, package-ID-only refusal, strict canonical document-/asset-name, checksum and public-metadata binding against manipulated manifests, descriptor-bound content reads without a second pathname lookup, absence of historical enumeration and lückenlose 7.000-Zeichen-Seiten mit fester 1.000-/30.000-Zeichen-Grenze |
| `test-corpus-contract.js` | 4 | versioniertes Ground-Truth-Schema, 2.000-Sample-Validierung, exakte Format-/Sprach-/Dokumenttyp-/Profilverteilung und direkte Prüfung der Null-Miss-/Null-Zusatzredaktions-/99-%-Erhaltungsgates |
| `test-batch-secret-store.js` | 6 | isolated OS-secret-store pilot: opaque batch accounts, fixed service namespace, 256-bit Set/Get/Delete round trip, unavailable/malformed/native-error refusal, and no filesystem, environment, CLI or self-encryption fallback path; no productive pseudonym release claim |
| `test-batch-pseudonym-registry.js` | 6 | in-memory `HMAC-SHA-256`/Base32 derivation for a shared batch context: Unicode canonicalization, same entity across documents, unlinkability across secrets, deterministic collision extension, disposal, no persistence claim and the internal hand-off through the normal residual-PII gate; not wired into the released batch path |
| `test-batch-pseudonym-context.js` | 7 | deaktivierter Store/Registry-Lifecycle: opake Vertragsreferenz, Zeroing, gleicher Alias über neue Registry-Instanzen, Verluststopp ohne Ersatzschlüssel, partieller Provisionierungs-Rollback, terminales Löschen, Erhalt fester Verarbeitungsfehler und kein Datei-/Environment-/CLI-/Eigenverschlüsselungsfallback |
| `test-keyring-pilot.js` | 3 | verifies the separate `@napi-rs/keyring` lock, all required native target artifacts and the content-free Set/Get/Delete runner; the actual native smoke test runs only with `RUN_KEYRING_PILOT=1` or in the dedicated three-platform workflow |
| `test-batch-session.js` | 66 | abgekoppelter lokaler Worker, paginierte namenfreie Ergebnisse, echter MCP-Prozesswechsel, gemischter Vier-Profil-`auto`-Stapel, 100-Datei-/500-MB-Grenzen vor Hashbildung, reale Worker-Crashes an globalen Positionen 1/50/100 mit ausdrücklichem Resume ohne Doppelpaket, Inode-/Snapshot-/Cleanup-Austauschproben mit unveränderten externen Daten, valide freie-Speicher-Metadaten und DOCX-ZIP-Verzeichnis-Vorprüfung, versiegelte Arbeitskopien, systemweite Ein-Stapel-Sperre, Dead-Owner-Recovery, Mapping-/Nachweis-Rollback, lokale Sammelprüfung, Ablaufbereinigung und fail-closed Manipulationsschutz |
| `test-mapping.js` | 3 | lokale Zuordnungs-CSV: reguläre Werte bleiben lesbar; führende Leerzeichen oder Tabs vor Formelzeichen werden ebenso wie direkte Formelpräfixe als Literaltext neutralisiert; verlinkte Exportdateien oder Exportordner werden vor Lesen, Ersetzen oder Schreiben abgewiesen |
| `test:batch-500mb-local` | manuell | schreibt und hasht 100 synthetische TXT-/Markdown-/CSV-Dateien mit exakt 500 MiB als privaten Snapshot, prüft bounded-memory SHA-256, Originalerhalt und sichere Checkpointentfernung; absichtlich nicht Teil jeder kostenpflichtigen Cloudmatrix |
| `test-batch-user-status.js` | 6 | kurze deutsche Status- und Folgeaktionsverträge für alle Batchphasen, Leckagefreiheit sowie eine erst nach drei lokalen Messwerten zulässige Median-Restzeit ohne Schätzung bei offener manueller Entscheidung oder Wiederaufnahme |
| `test-batch-maintenance.js` | 4 | festes, begrenztes Sechs-Stunden-Intervall für die lokale Ablaufbereinigung, fehlertolerante Folgeausführung, `unref` ohne künstliches Prozesswachhalten und exakt einmaliges Stoppen beim Server-Shutdown |
| `test-mcp-protocol.js` | 31 | the server driven over real stdio: startup recovery, handshake, normal/support tool separation, batch/read-capability schemas, explicit continuation confirmation, annotations, retention/purge/governance instructions, confirmed purge, privacy-safe diagnostic status and local diagnostic export, cancellation/error codes, notification handling and stdout framing |
| `test-adversarial.js` | 20 | hostile document content, Unicode that looks like text but is not, pathological sizes and regex behaviour, mutated containers, determinism, concurrency, the MCP argument surface |
| `exploratory-review-20.js` | 20 | alternative German phone/address/name forms, Unicode e-mail and IDN, IPv6, lower-case IBAN, labelled birth dates and vehicle plates, customer URLs, duplicate ZIP entries and PNG CRC integrity |
| `test-sarif-check.mjs` | 4 | fail-closed local CodeQL report parsing without leaking finding messages into the release-gate output |

The case counts above are maintained per suite. The complete local suite treats every
listed suite plus the plugin structure check as mandatory. The automatic cost-capped
CI deliberately runs the smaller `test:ci` release-safety subset; the complete suite
runs locally before a push and in the manually requested platform matrix. The
generated 1.000-case detector corpus is the largest deterministic ground-truth block.
The separate 150-case skill matrix remains an end-to-end smoke and preservation suite.

The manual Windows platform cell additionally runs `test:windows-visual`: a synthetic scan passes through
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

The deliberately manual `release-evidence.yml` matrix runs the suite on
`windows-latest`, `macos-latest` and `ubuntu-latest`. Windows x64 has the most complete
engineering boundary; the TXT/Markdown/CSV/DOCX text path is also intended for macOS
and Linux. The workflow explicitly installs Node and therefore does not prove the
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

## Lokaler CI-Nachweis 24.08.2026 (RC34-Arbeitsstand)

`npm run test:ci` wurde nach dem Claude-Cowork-/UX-/Performance-Review vollständig
mit Exit-Code 0 ausgeführt. Der Lauf umfasste unter anderem kanonische Dokumente,
Kostenbudget, Manifest/Capabilities, damals 9 normale und 28 Supporttools, alle vier MCP-
Risikohinweise, zentrale Ressourcenlimits, den inaktiven Zwei-Worker-Harness, 70
Parsertests, Netzwerk- und UI-Prozessgrenzen, 77 PII-Regressionen, 101 freigegebene
Formatkombinationen, Mapping/Outbox, direkten Picker/Intake, lokalen Handoff,
TXT-/CSV-/DOCX-Unterbrechung und Fortsetzung, den inaktiven OCR-Harness, echte
synthetische Performancepfade, 38 Gateway-, 31 MCP- und 20 Angriffstests.

Der erste Lauf fand dabei einen nicht normalisierten `ZipError` für ein mutiertes
OOXML-Zentralverzeichnis. Die Runtime wandelt diesen Fall jetzt vor dem Worker in
einen inhaltsfreien `SafeError` um; Parser- und Angriffssuite sowie der anschließend
vollständig wiederholte `test:ci`-Lauf bestanden. Dieser lokale Nachweis ersetzt
keine Fresh-Install-, Cowork-UI-, Accessibility- oder Drei-OS-Evidenz.

Die bewusst nicht im kostenoptimierten Cloud-Gate enthaltene monolithische
`test-batch-session.js`-Suite wurde anschließend ebenfalls vollständig ausgeführt:
66 Tests bestanden, einschließlich zweier echter 100-Dateien-Serienläufe sowie
Crash/Resume an den Positionen 1, 50 und 100. Dabei wurden alte Erwartungen an die
Review-Phase korrigiert und zwei reale Restfehler behoben: erfolgreicher früher
Work-Copy-Cleanup meldet nicht länger fälschlich einen offenen Cleanup, und eine
Crash-Recovery kann dieselbe Paket-ID nicht erneut in die Mapping-CSV schreiben.

## Lokaler RC36-Nachweis 24.08.2026

Nach der Entkopplung der lokalen Stapelprüfung bestand `npm run test:ci` vollständig
mit Exit-Code 0. Der vorgeschaltete RC36-Vertragstest bestätigt den sofortigen,
tokenfreien Cowork-Rückgabewert und die nur über privates IPC gestartete lokale
Prüfung. Zusätzlich bestanden die 66 servergebundenen Stapeltests, einschließlich
Review-Rekonstruktion, Abbruch, Vertagung, Wiederaufnahme und zweier echter
100-Dateien-Läufe. Der gebaute ZIP enthielt 349 Einträge, bestand die Paketparität,
13 Skill-Vertragstests sowie die synthetische 150-Fälle-Vertragsmatrix. Sowohl der
Quellplugin-Ordner als auch der entpackte ZIP bestanden `claude plugin validate`.
Diese Evidenz ersetzt nicht den erneuten Cowork-UI-Test mit installiertem RC36 und
nicht die noch offenen Zielplattformabnahmen.

## Lokaler RC37-Sicherheitsnachweis 25.08.2026

RC37 schließt die beim Review des RC36-Nachtrags gefundenen Restlücken. Automatische
Output-Retention läuft nur noch, wenn jedes offene Batch-Journal vollständig gelesen
und validiert werden konnte; bei einem einzigen unlesbaren oder ungültigen Journal
blieb der gesamte Output-Bereich unangetastet, während nach dem damaligen RC37-Vertrag
Processed- und Review-Retention weiterliefen. RC54 ersetzt diesen historischen
Processed-Vertrag: mögliche Alt-Originale werden weder automatisch noch durch Purge
gelöscht. Batch-Journale behandeln partielle Writes vollständig, flushen die Datei
vor dem atomaren Rename und synchronisieren auf POSIX zusätzlich das Elternverzeichnis.
Der damalige RC37-Nachweis verwendete für den abgekoppelten Review-Worker 30 Minuten;
der aktuelle Zielvertrag entfernt diesen menschlichen Entscheidungs-Timeout. Der
synchrone Supportpfad bleibt auf fünf Minuten begrenzt.

Direkte Regressionsevidenz liefern 6 Journal-/Schutztests, 16 Retentiontests, 3
Review-Executor-Vertragstests und 39 Companion-Verarbeitungstests. `test:ci` und die
66 servergebundenen Batchtests bestanden vollständig. Der frisch gebaute RC37-ZIP
enthält 350 Einträge und bestand Quellparität, 13 Skill-Vertragstests sowie die
synthetische 150-Fälle-Vertragsmatrix; sein SHA-256 lautet
`93a13f5a6bc2a2d86d995cb7206a3a6532dff1da402538fb9220502d0bb529b1`.
Diese lokale E0-Evidenz ersetzt weiterhin keine Cowork-UI- oder Zielplattformabnahme.

## Lokaler RC44-Refactoring-Nachweis 25.08.2026

Nach der Entfernung der drei alten Input-Werkzeuge aus sämtlichen aufrufbaren MCP-
Oberflächen bestand `npm run test:ci` vollständig mit Exit-Code 0. Der Supportmodus
umfasst jetzt 25 Werkzeuge, davon sind acht im normalen Cowork-Ablauf sichtbar;
`open_input_folder`, `begin_document_batch` und
`start_document_batch_processing` sind auch im Supportmodus nicht mehr aufrufbar.
Die datenbewahrende Startmigration für bereits verwaiste Alt-Claims ist seit RC55
als versioniertes, gesperrtes Modul isoliert. Sie nimmt keine neuen Quellen an;
der Normalpfad besitzt weder `listInput` noch einen technischen Ordnerfallback.

Der Lauf enthielt unter anderem 70 Parser-, 79 PII-Regressions-, 101 freigegebene
Formatkombinations-, 38 Gateway-End-to-End-, 31 MCP-Protokoll- und 20 adversariale
Tests sowie Mapping/Outbox, direkten Picker/Intake, lokalen Handoff, gemischte
TXT-/CSV-/DOCX-Wiederaufnahme und die inaktiven Performance-/OCR-Harnesses. Dies ist
lokale E0-Evidenz und ersetzt keine Fresh-Install-, Cowork-UI- oder macOS-Abnahme.
