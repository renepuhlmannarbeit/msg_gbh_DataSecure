# Entscheidungs-Traceability

Stand: 10.09.2026 · 3.2.0-rc134

Diese Tabelle bindet jede Entscheidung an den aktuellen Arbeitsbereich. Detaillierte
frühere Code-/Testzuordnungen bleiben im
[Traceability-Archiv](../archive/2026-09/canonical-history/TRACEABILITY_HISTORY_THROUGH_RC84.md).

RC133 bindet die nachfolgenden RC132-/DS-097-Verträge an den sauberen Quellcommit
`2cd4150adfdff2e3aa6771c6cd81e2972ea0413a`. Der lokale Windows-PKG-04-Lauf
erzeugte zwei bytegleiche Archive und bestand beide Paket-, Worker-, History-/
Sidecar- und nativen Smokes. INT-13 referenziert SHA-256
`fd3dcb1b0f99940a110857c085793b70930454571ffda3a7e5d8565a997ece66`.

RC132 bindet DS-096/F7 an `person-ambiguities.js`, `text-review.js`,
`batch-review-policy.js` und `batch-review-publication.js`. Der reale
Mehrdokumenttest fordert gemeinsame Redaktion, vollständige Veröffentlichung,
ein identisches Personenpseudonym und keinen Rohwert. `core-policy-fingerprint.js`
ist die einzige Dateiliste für dauerhafte Resume- und Cross-Produkt-Goldenbindung;
der Test mutiert jedes Mitglied und verweigert unbekannte Privacy-Module.
`de-business/3` trennt ältere materielle Regeln. Registry-Negativtests belegen
das Arbeitsbudget auch mit hochrepetitiven Cachetreffern. `normal-path-response`,
`result-folder-config`, Prompt/Skill/MCP-Instruktionen sowie echte
MCP-Protokolltests binden den vollständig servereigenen `user_status` und den
dauerhaften einmaligen Ordnerhinweis. PDF-Goldenobjekte laufen durch den echten
paketierten Parser und binden auch dessen `Map`-Rückgabe. Paket-/INT-13- und
Zielhostevidenz ist ausdrücklich noch nicht RC132-gebunden.

DS-097 bindet die Resume-Capability an `batch.js` und `batch-recovery.js`:
offene Privacy-Arbeit ist nur mit aktuellem Pseudonym-/Policykontext sichtbar
fortsetzbar; reine Konvertierung und nachgelagerte Projektionsschuld bleiben
unabhängig. `batch-executor-runner.js`, `batch-worker.js` und
`batch-executor.js` erhalten feste Ursachencodes und stabilisieren ungefangene
Fehler nach gültigem Claim über die gemeinsame Retry-Policy. `run-history.js`,
Standalone-Frontend und Rust-Admission lassen inaktive Historienläufe nicht die
nächste Auswahl sperren und unterscheiden Workerannahme von Abschluss.
`test-batch-recovery.js`, `test-batch-executor-runner.js`,
`test-batch-executor-startup.js`, `test-standalone-history.js`,
`test-standalone-frontend.js` und die Rust-Unit-Tests bilden die negativen und
positiven Grenzen. Die Zielarchitektur bindet zwei Produktadapter und drei
Plattformadapter an einen gemeinsamen Commit; eine weitere physische
Entkopplung bleibt nur bei konkreter Änderung erforderlich.

RC131 bindet die gemeinsame Wiederaufnahmeregel an
`gateway/prepublication-error.js`, `batch-item-processor.js`,
`batch-review-publication.js` und `batch-reconciliation.js`.
`test-prepublication-error-policy.js`, `test-batch-item-processor.js`,
`test-batch-review-publication.js`, `test-batch-reconciliation.js`,
`test-batch-post-publish-recovery.js` und `test-gateway-e2e.js` belegen: nur
explizite Codes aus dem transienten Katalog bleiben wiederholbar, identische
Fehler sind auf drei Fehlschläge begrenzt, eine fehlende Isolation ist terminal,
unklassifizierte Exceptions stoppen als `INTERNAL_FAILURE`, verifizierte bereits
veröffentlichte Ergebnisse werden ohne Neuverarbeitung adoptiert und unsichere
vorhandene Pakete stoppen als `RECOVERY_FAILED`. `compliance.js` und
`orchestrator.js` geben beide Residual-Gates als `RESIDUAL_PII` weiter.
`test-pii-regression.js` erhält einen breiten Satz professioneller Zweiwortwerte
aus bewerteten neutralen DOCX-Tabellen, fordert aber weiterhin den terminalen
Residual-Stopp für einen echten ungebundenen Namen in derselben Struktur. Die
gemeinsame Modulnutzung bindet
Standalone und Cowork an denselben Vertrag.

Die RC131-Evidence bindet den Binärkandidaten
`d4d269bd777012ce4fff2fc04ea9b961e5b5fcc3` an den lokalen PKG-04-/INT-13-
Receipt, den Windows-ZIP-Hash `f475c305…59f63`, den macOS-Intel-/ARM64-Lauf
`34396545170`, den Cowork-Dreizielbuild `34396542203` und das GitHub-
Vorabrelease `v3.2.0-rc131`. Die nachfolgende CI-Optimierung ist über
`.github/workflows/ci.yml`, `scripts/classify-ci-scope.js`,
`test-workflow-budget.js` und `test-test-path-separation.js` gebunden: genau ein
stets startender automatischer Ubuntu-Job, NUL-sicherer vollständiger Diff, Docs-only-Gate,
Produktgate für Code, beide Gates für gemischte/unklare Änderungen sowie
ausschließlich manuelle native und Releasepfade. Der Cowork-Build hat
`windows-x64` als kostensicheren Standard und behält `all` explizit bei.

RC130 bindet die hostunabhängige Konstruktion der Windows-Helferpfade an
`companion/file-picker.js`, `folder-picker.js`, `source-folder.js` und
`supervisor.js`. `test-companion-ipc.js`, `test-source-folder.js` und
`test-companion-supervisor.js` fordern die exakten Windows-Systempfade auch
auf POSIX-Testhosts. `test-direct-picker-intake-worker.js` bindet die
Single-Presenter-Invariante an beide zulässigen Abläufe eines sauberen
IPC-Schließens; `test-worker-terminal-presentation.js` belegt weiterhin die
Worker-Übernahme bei tatsächlich nicht erreichbarem Elternprozess.
`test-transient-rename-retry.js` und `test-gateway-e2e.js` binden ihre realen
Dateisystemoperationen explizit an einen sitzungseigenen temporären Datenroot.

RC129 bindet die Erkennung der temporären Claude-Windows-Projektion und den
stabilen Profil-Fallback an explizite Windows-Pfadsemantik in
`plugins/data-secure/server/runtime.js`. Der plattformneutrale Vertragstest
`tests/test-stable-data-root.js` prüft dadurch echte Windows-Pfade unabhängig
vom Betriebssystem des Testhosts; Windows-Produktverhalten und Datenroot-
Grenzen bleiben unverändert.

RC128 bindet den plattformneutralen Startup-Guard-Realprozessnachweis an
`tests/test-startup-guard.js` und den bereits produktiven absoluten
`EU_PRIVACY_DATA_ROOT`-Vertrag. Beide Childprozesse starten weiterhin den
echten `server/index.js`-Bootstrap und prüfen reale Journal-/Marker-I/O sowie
die inhaltsfreie Fehlerprojektion. Der automatische Linux-Rerun ist die
abschließende E0-Evidence; RC127-Paketläufe werden nicht übernommen.

RC127 bindet den installierbaren Cowork-Distributionsweg an
`bundled-runtime-release.yml`, `test-workflow-budget.js`, `docs/RELEASE.md` und
BL-010.8. Der All-Targets-Lauf veröffentlicht drei getrennte Ziel-ZIPs unter
der unveränderten 50-MB-Herstellervorgabe und kein zwangsläufig zu großes
Universal-ZIP. Der automatische CI-Zeilenendungswächter prüft über `--cached`
die Quellbytes des Kandidaten und nimmt nur den byteinventorierten
`ocr-runtime/node_modules`-Baum aus; `test-workflow-budget.js` verhindert eine
breitere Ausnahme. Die RC126-Läufe sind Diagnose-/E0-Nachweis, aber keine an
RC127 übertragbare UAT-Evidence. Die dabei auf Intel macOS gefundene
überbreite Nachlaufmessung und die ergänzende Lifecycle-Härtung sind in
`tauri-contract/src/main.rs`,
`test-standalone-desktop-contract.js` und
`tests/manual/standalone-native-macos-launch.sh` gebunden: globale
Tauri-Exit-Ereignisse stoppen den verwalteten Kindprozess, und der native
Nachweis bindet PID, Prozessname sowie Kommandozeile ausschließlich an diesen
Prozess.

DS-095 / BL-051 / BL-052 bindet die formale Zwei-Personen-Abnahme an
`ACCEPTANCE_LEVELS.md` und `docs/acceptance/FORMAL_UAT/*`. N3 entspricht der
noch auszuführenden technischen E1-Zielhostabnahme; N4 der danach folgenden
E2-/E3-Anwender-, Accessibility- und Fachfreigabe. Manifest, zehn N3- und acht
N4-Klartextprüfungen, getrennte Windows-/macOS-CSV, Git-Branchvertrag und
Freigabevorlage werden durch `test-formal-uat-contract.js` geprüft. Das ist
E0-Vorbereitung und schließt keine der noch offenen Zielhostzeilen.

RC126 bindet die portable Node-Lizenzprojektion an
`normalizeRuntimeLicense`, `build-runtime-target.mjs` und
`test-bundled-runtime.mjs`. CRLF und LF desselben validen UTF-8-Texts ergeben
dieselben veröffentlichten Bytes und Evidence-Hashes; andere Inhalte,
ungültiges UTF-8, NUL und Grenzenverletzungen stoppen. `set-version.mjs`,
`test-manifest.js` und `test-formal-uat-contract.js` verhindern zusätzlich
Versionsdrift zwischen Produkt und formaler UAT-Kampagne. Der fehlgeschlagene
RC125-Lauf `34367064924` ist ausdrücklich keine Paket- oder UAT-Evidence.

RC125 bindet die erneute Hersteller- und Produktrevalidierung an
`docs/REVIEW_CLAUDE_COWORK_2026-09-01.md`, `prompt-contract.js` und
`test-sea-batch-resume-contract.js`. Der Prompt veröffentlicht die aktuelle
Sechs-Format-Regel ohne historische Stringersetzung. Der Crashvertrag verlangt
für direkte und Markdown-first-Konvertierung ein abgeschlossenes `await` sowie
den erwarteten isolierten Parser-Close, bevor `onExtracted` den Checkpoint setzt.
Dokumentations-, Manifest-, Prompt-, SEA-, Standalone-, Produkt- und Paketgates
bilden die Gegenprüfung; Zielhost-UAT bleibt davon getrennte menschliche Evidenz.

RC124 / DS-093 / BL-010.34 bindet XLSX und PPTX im Cowork-Plugin an eine
lokale Markdown-first-Pipeline. `core/markdown-first-privacy.js` kapselt den
gemeinsamen Vertrag; `runtime.js` verwendet die isolierten Office-Parser,
`source-format-inspector.js`, Picker, IPC, Status, Prompt und Skill führen die
beiden Formate konsistent. `privacy_scope=extracted-markdown-only`,
`source_extraction_coverage` und `document_result` trennen Quellenextraktion
und Datenschutzprüfung. Reale synthetische XLSX-/PPTX-Bytes, beide
Startreihenfolgen, Paketprojektion und Standalone-Regression werden durch
`test-wide-privacy-orchestrator.js`, Source-/OPC-Preflight-, Protokoll-,
Capability-, Dokumentations-, Skill- und Produktgates geprüft. PDF, Scan-PDF
und Bilder bleiben bis zu gebündelter OCR-Runtime und Zielhostevidenz
fail-closed gesperrt.

RC120 / DS-083 / BL-010.13/BL-040.5 bindet die sichtbare Zuordnung an eine
einfache Existenzinvariante: Zuerst wird jedes Ergebnis atomar veröffentlicht
und geprüft, erst danach entsteht die CSV ausschließlich aus diesen erfolgreichen
Exportitems. Gestoppte Items bleiben private Status-/Diagnosedaten. All-stopped
schließt seinen privaten Exportrecord ohne sichtbaren Ordner ab; History und
aktuelle Aktionen bleiben deaktiviert. `result-export.js`, `run-history.js`,
`application-service.js`, Export-/History-/Status-/Pakettests.

RC119 / BL-021.1/BL-030.2/BL-050.1 bindet die Behebung der im sichtbaren Lauf
`Lauf-20260907-163522-142350c1` nachgewiesenen Personenunterredaktion an
`privacy/entities.js`, den unabhängigen Kontrollpfad in `privacy/engine.js`,
`test-pii-regression.js` und `test-standalone-format-corpus.mjs`. Der
Korpustest extrahiert die vier echten DOCX, liest deren expliziten Personenwert,
fordert seine vollständige Entfernung und ein Personenpseudonym und lässt die
freizugebenden Bytes erneut durch den Restprüfer laufen. Damit kann ein fehlender
Redaktoranker nicht erneut allein durch einen gleich gebauten Gate-Katalog
kaschiert werden.

RC117 / BL-022.1/BL-050.1 bindet zwei exakt bekannte interne, nicht ausführbare
Word-Beziehungen und vier namespacegebundene DrawingML-Layoutknoten an
Positiv-, Lookalike- und Fremdnamespace-Negativtests. Der neue komplexe
DOCX-UAT-Korpus umfasst 15 deterministische zwei-, vier- und achtseitige
Dokumente; `test-complex-docx-uat-corpus.mjs` prüft realen Preflight, Parser,
neutrale Erhaltungsfälle sowie stapelweit gleiche Personen- und
Unternehmenspseudonyme. Die sichtbare Bedienprüfung bleibt BL-052.1/E2.

RC109-Gesamtreview: DS-022/023/079/083/086 binden Fortsetzung und Anzeige an die
gemeinsame Progress-/Reviewbereitschaft; DS-085 bindet XLSX-Struktur und BMP32
an die reine Konvertierung. MCP-Eingabevalidierung bleibt Plugin-Schnittstelle,
kein Standalone-Transport. F-01–F-11 samt zusätzlichen Gegenreviewbefunden und
Tests stehen im [archivierten Korrekturbericht](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md).

BL-051.1/BL-002 bindet den aktuellen RC111-Quellcommit
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` an zwei bytegleiche Windows-x64-
Standalone-Builds, beide Paket-/Worker-/nativen Windows-Smokes, den
`PKG-04-RECEIPT.json` und `INT-13-BINDING.json`. Archiv-SHA-256:
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`.
Die Bindung belegt E0 auf diesem Windows-Zielhost, nicht sichtbaren UAT oder
native Intel-/ARM-macOS-Ausführung.

RC111 / DS-087 bindet den neutralen `source_type` an die tatsächliche Endung und
ergänzt reale TXT/XLSX-Mischstapel in beiden Reihenfolgen mit Prozessabbruch,
Fortsetzung, Exact-once und stabilen Personen-/Unternehmenslabels. Ein nutzbares
breites Item erreicht die Registry; seine Quellenabdeckung bleibt separat. Alle
realen breiten Formate werden zusätzlich am Privacy-Publikationsrand geprüft. BL-022.3 validiert
sämtliche PPTX-XML-/RELS-Teile; BL-023.3 stoppt PDF-Annotationen, Outline und XMP
und erhält standardisierte Dokumentmetadaten im reinen Markdown-Modus. Diese
E0-Nachweise erweitern nicht den Cowork-Formatumfang oder die
Vollständigkeitszusage für Originalcontainer. Der neue native
Startup-Checkpoint trennt WebView-Aufbaufehler von späteren IPC-Ausfällen; eine
INT-13-Bindung folgt ausschließlich nach bestandenem commitgebundenem PKG-04.
Der zweite Lauf nach Windows-Neustart aus `c77ec592aa95f323bd5b1efe6301b111e7f2f225`
stoppt erneut vor `webview_build_completed`. Die anschließende unabhängige
Analyse bindet den Stillstand an den damaligen Testvertrag: UDF im Checkout/
Tempbaum, vollständig ersetzte Desktop-Umgebung und zwei UDF-Autoritäten. Mit
automatischem Tauri-Fensterstart, genau einem UDF unter `LocalAppData` und erst
im Sidecar vollständig isolierten Pfaden bestehen der RC111-Arbeitsbau und das
historische RC109-Archiv den Start bis Frontend/Core/IPC. Der ältere Prozess
belegt außerdem den fail-closed Cleanup-Lockfall des historischen Kandidaten.
Der saubere Korrekturcommit `b543589f3250a6ab57ddd5bc3a144f03a24ee026`
besteht danach die vollständige Regression, zwei bytegleiche Builds und beide
nativen Starts; PKG-04 und INT-13 sind genau daran gebunden.

Der anschließende Restschuldblock bindet BL-020.3 an den echten Support-stdio-
Dispatch und den bestehenden netzgesperrten Review-Worker (`test-mcp-support-review`,
Review-Orchestrator/Executor/Network-Gates). BL-041.1 bindet öffentliche Ursachen,
Workflowjournal und Supportspiegel an einen gemeinsamen festen Katalog und
typisierte ACK-Fehler (`test-diagnostic-causes`, `test-workflow-diagnostics`,
MCP-/Executor-Tests). BL-041.10 ergänzt sechs DS-069-Fälle im jetzt 39-fälligen
Skill-Korpus; 22 Korpustests sind keine Modellabnahme. BL-021.1 bindet die
begrenzte Identifier-Sicht an Originaloffsets, OCR, Review-Publish und echte
Plugin-/Standalone-Stapel; Markdown-only behält den Originaltext. BL-011.8
bereinigt nur nachweislich tote, journalfreie, identitätsgebundene Intakekopien
im vorhandenen Wartungslauf (`test-batch-intake` und Recovery-/Lease-Gates).

BL-010.9 bindet sieben reine gemeinsame Verträge für Start, Zweck, nächste
Stapelaktion, Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und
Fortschritt an `test-core-contracts.mjs` und echte Produktprojektionsgates.
Dateisystem- und Paketevidenz wird in die reinen Projektionen injiziert. BL-010.23 hat mit
`test-core-policy-binding.mjs` einen ersten testseitigen Fingerprint und kleinen
produktübergreifenden Golden-Korpus einschließlich Identitätsbijektion,
Fachtexterhalt und realer Reviewvertagung. Weitere Core-Komposition und volle
Format-/Profil-/Recovery-Bindung bleiben offen. BL-021.1 ergänzt IBAN-
Folgeidentifier und Kontakt-/E-Mail-Überlappungen (`test-iban-boundary`,
`test-pii-regression`, reale Veröffentlichung in `test-gateway-e2e`).

DS-086 / BL-010.29 bindet die Standalone-Startseite und den Verlauf der letzten
20 Läufe an `frontend/app.js`, `standalone/run-history.js`,
`gateway/standalone-history-store.js`, `application-service.js`,
private Desktop-IPC und Rust-Kommandorechte. `test-standalone-history` prüft
Historie und konkrete Aktionen; Frontend-, Sidecar-, Rust- und Pakettests
prüfen die Übergaben. Native Bedien-/Fokusabnahme bleibt menschliche Evidence.

Historischer RC107-Schnitt aus dem RC106-Folgereview: DS-023/DS-069/DS-082/DS-083 binden den Standalone-Abschluss an den
damaligen aktuellen Lauf einschließlich gestoppter Quellen; RC120 ersetzt diese
sichtbare Stopzeile durch Abschluss-/Diagnosedaten. Tests in
`test-result-folder-export`, `test-batch-recovery`, `test-standalone` und
`test-standalone-frontend`. DS-084 bindet Firmenalias-/Personenkonflikte an
`test-batch-pseudonym-registry` und die gemeinsame Engine. PKG-04/INT-13 behalten
ihre Quellcommitbindung; native Testdatenisolation wird im Desktop-Vertrag
und Rust-Testprofil geprüft. DS-085 war in diesem Kandidaten noch nicht als
zweite vollständige Kernfunktion integriert.

DS-085/BL-010.28, anschließende RC108-Integration: `core/processing-mode.js` bindet
die exakten Zwecke und Produktkanäle, Desktop transportiert den Startzweck über
Rust/private IPC. `markdown-contract.js`, `markdown-artifact.js` und
`markdown-extractor.js` trennen unveränderte Extraktion und Konvertate von
Privacy-Paketen. `test-processing-mode`, `test-markdown-artifact` und
`test-markdown-extractor` sind einmalig im Produktregressionslauf registriert.
`batch-queue-envelope`, Intake und `batch-journal-store` binden den Zweck jetzt
über eigene Worker-Typen und `datasecure-batch/5`. `batch-item-processor`,
`batch-reconciliation`, `batch-delivery` und `standalone/markdown-store` wählen
den Konvertierungspfad ohne Pseudonymzustand, Privacy-Grade oder Capability.
Recovery bewahrt den Stapelmodus; der UI-Default darf ihn nicht ändern.
`result-export` veröffentlicht die typgebundenen `dm_`-Artefakte atomar nach
`DataSecure-Markdown/Lauf-…` unter erhaltenem Basisnamen und ohne lokale
Zuordnungsdatei. Warnende Extraktionen mit
`incomplete` und festen Gründen sind zulässig, aber nicht als vollständig
oder anonymisiert auszuweisen. Öffentliche Privacy-Reads/Handoff lehnen sie ab.

BL-022.2/3, BL-023.1–4 und BL-024.2/3: Office-Regressionsfälle binden die
Beseitigung stiller Kürzungen und den unvollständigen Extraktionsgrad.
`native/pdfjs/pilot/markdown.mjs` und `scan-page.mjs` sowie der lokale OCR-
Markdown-Worker werden über `test:conversion:engineering` mit echten PDF-/Bild-
Bytes geprüft. Diese Tests benötigen die vorhandenen gepinnten Pilotabhängigkeiten
und lokalen DE/EN-Modelle; sie installieren oder laden nichts herunter.
PDF-Text, Raster-OCR und Quelle werden niemals gleichzeitig als doppelte Inhalte
zusammengehängt. Ohne belegte Vollständigkeit entsteht kein vollständiges
Markdown-Artefakt mit Grad `complete`; eine erfolgreiche unvollständige
Extraktion darf als solche gespeichert werden. `OCR_TEXT_EMPTY` wird nur dann
gesetzt, wenn die Datei insgesamt keinen verwertbaren Text liefert; eine
textlose Bildfläche neben vorhandenem nativen PDF-Text bleibt ein OCR-/
Coverage-Hinweis und kein harter Gesamtstopp. Diese zusätzliche Engineering-
Evidence gehört nicht zum RC107-Paketreceipt.

RC108 ergänzt `standalone/conversion-worker.js` und `conversion-worker-child.js`
als echten begrenzten Produktprozess für elf Eingabetypen, Scan-PDF als eigenem
PDF-Verarbeitungsfall. Der Modus `markdown-only` bewahrt Quellinhalte; der
Der Cowork-Anonymisierungspfad verarbeitet TXT, Markdown, CSV und DOCX direkt
sowie XLSX/PPTX gemäß DS-093 über lokal extrahiertes Markdown. Standalone
akzeptiert DOCX und die breiten Quellen gemäß DS-087/090 Markdown-first.
`conversion-runtime-resolver.js`, `standalone-conversion-runtime.mjs` und die
Standalone-Paketgates binden normales Node.js, PDF.js, Canvas, Tesseract.js und
lokale Modelle statt Systemruntime oder Download. MarkItDown/Python bleibt
optionales Differentialorakel, kein benötigtes Bundle.

`test-standalone-conversion-worker.mjs`: 25 E0-Testgruppen mit realen Bytes,
Namenerhaltung, Negativfällen, Start-/Ready-Abbruch, Timeout, Inputhashen und
isolierter Umgebung. 100 TXT-Dateien benötigten lokal 15,264 Sekunden ohne
vollständiges Wiederlesen der großen Runtime je Datei. 60 frühe Beendigungen
prüfen die neue atomare Windows-Jobbindung über `JOB_LIST`; 7 Launcher- und
19 Parser-Isolationstests binden die gemeinsame native Korrektur auch für
Cowork. Keine allgemeine Performancezusage und keine macOS-/UAT-Evidence.

Der hybride PDF-Gegencheck bindet native Seitenzahl plus Scan an tatsächliche
Bildoperatoren und zusätzliche OCR ohne doppelte Textlayer-Zeilen. Dieses native
Gate läuft über `test:standalone:conversion` verpflichtend vor PKG-04, nicht im
kostengedeckelten Ubuntu-Quell-CI. `test-test-path-separation` sichert die Trennung.
`test-markdown-lifecycle-review` bindet v4/v5-Abbruch nach Publikation an einen
ehrlich fortsetzbaren UI-Zustand und genau einen Fortsetzen-Klick bis zum Export;
lebende Executor bleiben dagegen aktiv und verhindern einen Doppelstart.

BL-030.2/DS-084: `matchKnownAliases` und getrennte v1-Firmenidentitäts-/Rollen-HMACs
werden durch echte `withBatchPseudonymRegistry`-Dokumentwechsel einschließlich
Journal-Roundtrip, Klammern, Separatoren und Rollenwechsel geprüft. Der optionale
`known_alias_index` ist an alle Bindings attestiert; Negativtests decken fehlenden,
veralteten und manipulierten Index sowie Kapazitäten und terminale Textgrenzen ab.
Der Vertrag benennt die Vorwärtslesbarkeit und die Altreader-Rollbackgrenze.
Persistierte einwortige PERSON-Aliase werden im Redaktionskern nicht mehr als
globale Ersetzungsdictionary-Einträge behandelt. `engine.js` prüft stattdessen
jeden konkreten Fund positionsgebunden und verwendet nur bei aktuellem
Personenkontext den bereits gebundenen Placeholder. Die Registry bleibt reiner
rohwertfreier Identitäts-/Membership-Nachweis. `test-batch-pseudonym-registry.js`
bindet diese Grenze für v1/v2 nach Export/Restore, gewöhnliche Einkauf-/Sommer-
Prosa, gemischte Vorkommen, Honorativ, Label, Tabelle, Markdown-Link und Firma.

BL-010.13/BL-011.3 binden den Desktop-EOF an das Ende des Steuerprozesses,
nicht an das Ende dauerhaft übergebener Worker. `desktop-sidecar.js` und
`test-standalone-sidecar.js` prüfen Queue-Stopp, Shutdown, defekte Frames und
Pipes mit echten Worker-Abschlüssen. Die reine Timing-Fixture
`tests/lib/standalone-sidecar-lifecycle.cjs` gehört nicht zum Produktpaket.

BL-020.1/BL-011.3: `runtime.js` unterscheidet bestätigtes negatives Parserergebnis
(`PARSE_FAILED`, endgültiger Stopp) von Timeout/Unterbrechung. `test-parser-isolation`
bindet die exakte Antwort-/Exitkombination und echte fehlerhafte Dokumentbytes;
der reale Standalone-Paket-Folgestapel verlangt die eigene Fehlerzuordnung.

BL-051.1/BL-002: Der native Windows-Test bindet die Bereinigung an seinen neu
erzeugten Scope und bestätigt das Prozessende. `standalone-native-cleanup.ps1`
behandelt nur den exakten internen Windows-Cache-Link als nicht zu traversierendes
Blatt; Vorabaufnahme, Verzeichnisidentitäten und unbekannte Links bleiben strikt.
Zurückbehaltene Alt-Testprofile sind kein erfolgreicher PKG-04-Nachweis.

Der historische RC107-Nachweis ist vollständig: `7b88a81ff577aaa270f1354d75365b2df4a4666e`
→ zwei bytegleiche ZIP/Desktop/Core-Builds → beide Paket-/Worker-/nativen Smokes
→ `dist/pkg-04/7b88a81ff577aaa270f1354d75365b2df4a4666e/PKG-04-RECEIPT.json`
→ hashgebundene `INT-13-BINDING.json`. Spätere Entwicklungsänderungen sind nicht
automatisch Teil dieses Kandidaten; menschliche Zielhost-Evidence bleibt getrennt.
RC108 hat diesen Nachweis eigenständig erbracht: sauberer Quellcommit
`a742333e8ef80b445729d4bede6a91a2b8f13207` → zwei bytegleiche Builds → beide
Paket-/Worker-/nativen Windows-Smokes → PKG-04-Receipt und INT-13-Bindung unter
`dist/pkg-04/a742333e8ef80b445729d4bede6a91a2b8f13207/`.
ZIP-SHA-256: `d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
48 Basis-/111 direkte Produkttestdateien, Rust 15/15, Frontend 18/18 und beide
Betriebsarten im echten Paket sind grün. E1/E2/E3 bleiben separat offen.

| Entscheidung | Aktueller Status | Backlog / Nachweis |
|---|---|---|
| DS-001 | aktiv – De-Identifizierung, keine Rechtsgarantie | BL-052; README, Anleitung, Datenschutz-Skill |
| DS-002 | aktiv, durch DS-067 präzisiert – ZIP/Marketplace für Nutzer | BL-010, BL-051; Plugin-/Marketplace-Gates |
| DS-003 | durch DS-066 und anschließend DS-078 ersetzt | historische Oberflächenannahme; aktuelles Gate in Hostmatrix und DS-078 |
| DS-004 | aktiv, teilweise durch DS-052 präzisiert | BL-010, BL-051; Fresh-Install-Evidence offen |
| DS-005 | aktiv | BL-041; Manifest- und Plugin-Strukturtests |
| DS-006 | aktiv | BL-041; Skill-/Jobvertrag, E1 offen |
| DS-007 | aktiv | BL-021–024; Formatmatrix |
| DS-008 | aktiv | BL-040, BL-041; Markdown-/Paketvertrag |
| DS-009 | aktiv, durch DS-067 präzisiert – kein auswählbarer Modus | BL-024, BL-041; Manifest-/Bildgates |
| DS-010 | aktiv | BL-011, BL-051; 200 Dateien/500 MiB. Das aktuelle UAT-Kit verlangt den 200-Dateien-Grenzlauf zusätzlich zum 100-Dateien-Funktionsfall; E1/E2 bleibt offen |
| DS-011 | aktiv | BL-011, BL-049; Source-Preflight |
| DS-012 | aktiv | BL-021, BL-022, BL-031; Korpus-/Regressionstests |
| DS-013 | durch DS-043 ersetzt | historischer Abschlussdialog; heutiger Hintergrundabschluss über DS-043 |
| DS-014 | aktiv | BL-012; Review-/Resume-Vertrag |
| DS-015 | durch DS-045 ersetzt | historischer Umgang mit unlesbaren Inhalten; heutige Ergebnisgrade über DS-045 |
| DS-016 | durch DS-046 ersetzt | BL-023, BL-049; verschlüsselte Eingaben stoppen, niemals entschlüsseln |
| DS-017 | aktiv | BL-020, BL-022, BL-023; Embedded-Content-Vertrag |
| DS-018 | aktiv | BL-020, BL-024; Network-Boundary-Test |
| DS-019 | durch DS-059 ersetzt | BL-030; neustartfester Pseudonymkontext |
| DS-020 | aktiv, durch DS-065/067 präzisiert | BL-011, BL-040; Read-only/Retention |
| DS-021 | aktiv | BL-011, BL-012; Resume-/Recoverytests |
| DS-022 | aktiv | BL-011; Active-Lock-/Lease-Vertrag |
| DS-023 | aktiv, durch DS-067 präzisiert – Exporte nie automatisch löschen | BL-040; Mapping-/Retentiontests |
| DS-024 | aktiv | BL-040; neutrales Mapping |
| DS-025 | aktiv | BL-040, BL-050; inhaltsfreie Evidence/Audit-Tests |
| DS-026 | aktiv | BL-042; getrennte Supportdiagnose |
| DS-027 | aktiv mit lokalem Review, keine Bildfreigabe über Claude | BL-012, BL-031, BL-032 |
| DS-028 | aktiv | BL-012, BL-042, BL-052; A11y-Evidence offen |
| DS-029 | aktiv | BL-031; zentrale Profil-/Zertifikatsregeln |
| DS-030 | aktiv | BL-051; keine zusätzliche Produktpflicht |
| DS-031 | aktiv | BL-010, BL-051; Rollback-Evidence offen |
| DS-032 | aktiv | BL-012, BL-052; Nutzertexte/UAT |
| DS-033 | aktiv | BL-050, BL-052; Qualitäts-/Freigabegates |
| DS-034 | aktiv, teilweise durch DS-052 präzisiert | BL-010, BL-051; gestufte Hostmatrix |
| DS-035 | aktiv | BL-001–003; archivierter Entwicklungsverlauf |
| DS-036 | aktiv | BL-011, BL-012; Abbruch-/Fortsetzungstests |
| DS-037 | aktiv | BL-024; OCR-Sprachvertrag |
| DS-038 | aktiv | BL-001–024; Open-Source-Register |
| DS-039 | aktiv | BL-041, BL-043; lokaler Start, späteres Ergebnislesen |
| DS-040 | aktiv | BL-043; Normalweg ohne Polling |
| DS-041 | aktiv, durch DS-066 präzisiert | BL-010, BL-041, BL-051 |
| DS-042 | aktiv | BL-042.3; Status-App noch nicht freigegeben |
| DS-043 | aktiv | BL-011, BL-041.9; Hintergrundworker |
| DS-044 | aktiv | BL-044; sichere rekursive Auswahl |
| DS-045 | aktiv | BL-049; drei Ergebnisgrade |
| DS-046 | aktiv | BL-023, BL-049; keine Entschlüsselung |
| DS-047 | aktiv | BL-047, BL-050; adaptive Policy/E1 offen |
| DS-048 | aktiv | BL-042; Readiness/Supportvertrag |
| DS-049 | aktiv | BL-020–024, BL-049; vollständige Inhaltsgrenze |
| DS-050 | ersetzt durch DS-065; nur historische Evidence | BL-011.13; kein Keyring-/Crypto-Produktpfad |
| DS-051 | aktiv | BL-041; begrenzte einmalige Ergebnisübergabe |
| DS-052 | aktiv, Standalone-Plattformfolge durch DS-094 präzisiert | BL-010, BL-051; Cowork Windows/macOS, Standalone zusätzlich Linux x64 |
| DS-053 | aktiv, durch DS-067 präzisiert; MCPB nur Engineering | BL-010, BL-051; ZIP/Marketplace |
| DS-054 | aktiv | BL-011, BL-040; Quellen-/Altbestandsschutz |
| DS-055 | aktiv | BL-012, BL-042, BL-052; Sprache/A11y/Admin |
| DS-056 | aktiv | BL-051, BL-052; E0/E1/E2/E3-Trennung |
| DS-057 | aktiv | BL-001–003; Dokumentenregister/Archive |
| DS-058 | für neue Standalone-Läufe durch DS-089 ersetzt; für Cowork/Altläufe weiter gültig | BL-040; neutrale Cowork-Namen und unveränderte historische Läufe |
| DS-059 | aktiv, Speicherweg durch DS-065 präzisiert – kein Keyring | BL-030.2 |
| DS-060 | aktiv | BL-010, BL-024; Offline-Bundle/SBOM |
| DS-061 | aktiv, Refactoringpfad durch DS-065/067 neu geschnitten | BL-001–003; aktueller Refactoring-Plan |
| DS-062 | aktiv | BL-010, BL-052; keine zusätzliche VM anfordern |
| DS-063 | aktiv | BL-010, BL-052; kein zusätzliches Windows-Konto anfordern |
| DS-064 | aktiv | BL-012, BL-041; keine zusätzliche Testbürokratie im Nutzerweg |
| DS-065 | aktiv | BL-011.13, BL-030.2; Plain-Arbeitskopien |
| DS-066 | durch DS-078 ersetzt | frühere, nach Herstellerkorrektur verworfene Desktop-Brücken-Annahme |
| DS-067 | aktiv und aktuell | BL-010, BL-011, BL-012, BL-024, BL-040, BL-051; fester Bildschutz, 0–14 nur temporär, Quellen/Exporte nie Auto-Löschziel, ZIP/Marketplace |
| DS-068 | aktiv und aktuell | BL-012.9/10, BL-032.1, BL-043.1; lokaler Sammelreview, PII-Shield-inspirierte Interaktion und automatischer Klar-Datei-Pfad |
| DS-069 | aktiv und aktuell | BL-040.5, BL-041.7, BL-041.10, BL-043.1; einmalige Ergebnisordnerwahl, neutraler verifizierter Markdown-Export und lokales Öffnen |
| DS-070 | aktiv und aktuell | BL-011.8, BL-049.1, BL-050.3; Dateiidentität über Gerät, Inode, Größe und mtime plus verpflichtenden Preflight-SHA-256, Änderungszeit ausgenommen |
| DS-071 | aktiv und aktuell | BL-042, BL-041.10; zufällige Laufkennung `run_id` in jedem Ablaufereignis (Eltern- und Worker-Prozess), sichtbar nur im ausdrücklich aufgerufenen Supportstatus und bestätigten lokalen Diagnoseexport, nicht in Skills/Normalablauf/Ergebnissen; verweigerter Start mit `startup_refused`, Markerdatei und pfadfreier Fehlerzeile, Laufzeit-Selbstprüfung gegen `RUNTIME-EVIDENCE.json`; `index.js`, `mcp-server.js`, `startup-guard.js`, `workflow-diagnostics.js`; `test-startup-guard`, `test-workflow-diagnostics`, `test-diagnostics` |
| DS-072 | aktiv und aktuell | BL-010.8, BL-011.10, BL-041.7, BL-051.5; dauerhafte versionsgebundene Runtimeprojektion für Cowork-Worker; Standalone ist nach DS-075 ein getrenntes Produkt mit eigener Runtimeprojektion; `durable-runtime-cache.js`, `background-role-launcher.js`; `test-durable-runtime-cache`, `test-background-role-launcher`; echter RC96-UAT offen |
| DS-073 | aktiv und aktuell | BL-010.8, BL-041.7, BL-041.10, BL-051.5; Claude-Temporärumleitung von `LOCALAPPDATA` nicht als Produktzustand verwenden, normale/umgezogene Pfade unverändert; `runtime.js`, `durable-runtime-cache.js`; `test-stable-data-root`, `verify-plugin-zip`; echter RC97-UAT offen |
| DS-074 | aktiv und aktuell | BL-042.4; manueller Debug-Skill nur im gekennzeichneten Support-ZIP, gleiche Engine, geschlossene inhaltsfreie JSON-Ereignisse als unveränderliche Einzeldateien; `support-trace.js`, `workflow-diagnostics.js`, `mcp-server.js`, `build-runtime-plugin.mjs`; `test-support-trace`, `test-debug-skill-contract`, `test-mcp-protocol`, `test-workflow-diagnostics` |
| DS-075 | aktiv und aktuell | BL-010.9–28; eigenständiges Standalone mit getrenntem Datenroot ohne MCP/Claude/Agenten; beide Modi im gemeinsamen Core, lokale Konverterruntime und Supervisor integriert. MarkItDown 0.1.7/Python nur optionales Differentialorakel, kein benötigtes Bundle. `server/standalone/*`, `core/processing-mode.js`, Runtime-/Paketgates; RC108-Windows-Paketbindung abgeschlossen, E1/E2 offen |
| DS-076 | aktiv und aktuell, durch DS-077/094 präzisiert | BL-010.11–26; reale Tauri-2-Hülle, nativer Picker, privater längengerahmter Sidecar-Dispatcher mit Ready-Handshake und 30-Sekunden-Antwortgrenze, geschlossener UI-Snapshot-/IPC-Vertrag und strikte Zählerinvarianten; Windows-x64-Engineering-Build und selbsttragendes Pilotpaket verifiziert; vier aktuelle Standalone-Paketziele Windows x64/macOS x64/macOS ARM64/Linux x64 glibc, kein HTTP-Port und kein Renderer-Rohzugriff; `standalone/product-manifest.json`, `standalone/ui-contract.json`, `standalone/desktop-ipc.js`, `standalone/desktop-sidecar.js`, `apps/datasecure-standalone/desktop-targets.json`, `apps/datasecure-standalone/tauri-contract/`, `.github/workflows/standalone-macos-sandbox.yml`, `.github/workflows/standalone-linux-sandbox.yml`, `STANDALONE_ARCHITECTURE.md`; JS-/Rust-/Paket-/isolierter Sidecar-Smoke grün; native macOS- und Linux-Lifecycle-/Distributionsnachweise liegen vor; Endnutzerfreigabe und sichtbare Zielhostbedienung bleiben offen |
| DS-077 | aktiv und aktuell, Linux-Projektion durch DS-094 ergänzt | BL-010.20/21/25/27; Windows-x64-Engineering-Pilot mit frischer geschlossener Runtimeprojektion, gepinnter Node-Runtime, Paketmanifest, SBOM, SHA-256 und isoliertem Sidecar-Smoke; systemweites WebView2 als dokumentierte Windows-Voraussetzung; Rust-Toolchain 1.98.1 für Builder gepinnt. Die manuellen macOS- und Linux-Gates verlangen eine Kostenbestätigung, verwenden keine Secrets/Caches und prüfen Runtime, Supervisor, Konverter, Rust, native Hülle, Architektur, private IPC, Core-Start, plattformrichtigen Datenroot und geordnetes Beenden. Der optionale eintägige Upload enthält nur das zuvor zweimal bytegleich gebaute und nach dem Entpacken erneut gestartete ZIP samt SHA-256. Apple Silicon ist durch `34334520861`, Intel durch `34335259239` auf Commit `06c2669d` als Distributionspaket E0-grün; Linux x64 durch `34356576842` auf Commit `84fd616c` mit ZIP-SHA-256 `177b9763…eaee`. Windows-UAT und sichtbare native macOS-/Linux-UAT sind offen |
| DS-078 | aktiv und aktuell | BL-010.7, BL-041, BL-051.6; Originale nur in lokaler Cowork-Sitzung mit laufendem Plugin-MCP oder lokalem Claude Code; Cloud-Cowork/Web/Mobil/Scheduled dürfen nur bereits freigegebenes Markdown verwenden; Hostmatrix-, Skill-, Nutzer- und Dokumentationsgates |
| DS-079 | aktiv und aktuell | BL-012.9/10, BL-040.6, BL-043.1; klare Positionen intern dauerhaft, sichtbarer Laufordner und Öffnen-Aktion erst nach terminalem Gesamtstapel; `terminalVisibleExport`, Export-/Standalone-/Recoverytests |
| DS-080 | aktiv und aktuell | BL-040.5; expliziter geräte- und produktlokaler Ergebnisstamm, keine Workspace-Erkennung und kein automatischer Zielwechsel; `result-folder-config.js`, Picker-/Export-/Dokumentationsverträge |
| DS-081 | aktiv und aktuell | BL-041.8; hostgesteuerte Aushandlung von `2026-07-28` und getesteten Legacy-Versionen, kein `MCP26-01`-Cutover und keine vollständige Konformitätsaussage ohne offizielle Conformance-Evidence; `mcp-server.js`, `test-mcp-protocol.js`, Dokumentationsvertrag |
| DS-082 | aktiv und aktuell | BL-010.11/12/28; lokale Auswahl-/Zielanzeige ohne Diagnoseweitergabe, expliziter Start, zwei strikt getrennte aktive Modi; aktiver oder fortsetzbarer Stapel behält Backendmodus. `frontend/index.html`, `frontend/app.js`, Rust-Commands, `application-service.js`, `desktop-ipc.js`; Standalone-Vertragstests und E1/E2 offen |
| DS-083 | aktiv, durch DS-088/RC120 präzisiert | BL-010.13/26/28, BL-040.5; je terminal sichtbarem Standalone-**Anonymisierungslauf mit mindestens einem Ergebnis** eine formelneutralisierte `DataSecure-Zuordnung.csv`: Quelle → tatsächlich vorhandenes anonymisiertes Ergebnis. Fehlergründe bleiben in Abschluss/Diagnose; All-stopped erzeugt keine sichtbaren Artefakte oder Aktionen. Die CSV trägt ein UTF-8-BOM. Derselbe Quellpfad darf innerhalb eines Records genau einen finalen Ausgang besitzen. Der echte Paketlauf prüft Erfolgszeilen, vorhandene Ziele und das Fehlen vorläufiger Stopps/Mojibake. Reine Konvertierung erzeugt keine Zuordnung, Cowork erhält keine Originalnamen-Projektion. Export-, Replay-, History-, Standalone-, Paket- und OS-Öffnertests |
| DS-084 | aktiv und aktuell | BL-010.12/13, BL-030.2; neue Standalone-Stapel mit lesbaren v2-Kennungen, Firmenrollen einheitlich, Restore behält Version; native Dragdrop-Aufnahme ohne Autostart, Pickeralternative; Registry-, State-, Intake-, Rust-, Frontend- und reale Pakettests |
| DS-085 | Windows-E0 und Paketbindung abgeschlossen; Zielhost-UAT offen | BL-010.28 mit BL-010.15–19, BL-022.2/3, BL-023.1–4 und BL-024.2/3; zweite Standalone-Kernfunktion ohne PII-Entfernung, elf Eingabetypen einschließlich Scan-PDF, v5-Journal/`dm_`/eigene Worker-Envelope-Typen, Recovery und atomarer `DataSecure-Markdown`-Export. UI-/Rust-/IPC-/Modus-/Journal-/Artefakt-/Extraktions-/Konverter-/Cross-Read-Gates; E0 ist keine fachliche Vollständigkeits- oder UAT-Freigabe |
| DS-086 | aktiv; Zielhost-UAT offen | BL-010.29; Startseite, leere Betriebsart, bewusst gewählter Tab und Verlauf der letzten 20 Verarbeitungen. `standalone/run-history.js`, `application-service.js`, private IPC, Rust-Commands, Frontend; History-/Frontend-/Sidecar-/Rust-Verträge und echte Paketläufe. Jede Aktion bindet exakt den ausgewählten Lauf, keine automatische Ergebnisnavigation. |
| DS-087 | Implementierung E0; Originalcontainer-Coverage und Zielhost-UAT offen | BL-010.30; neutraler `datasecure-source-extraction/1`-Vertrag, Standalone-only-Admission und einmalige Konverterübergabe vor dem unveränderten Privacy-Core. Gültiges, nichtleeres Markdown publiziert nach Privacy-Gates; Quellenextraktionsabdeckung und Anonymisierungsstatus bleiben getrennt. `CONVERSION_TERMINATION_UNCONFIRMED` wird aus den Standalone-Schemata `/5` und `/6` bis in die lokale Statusprojektion getragen. Vertrags-, Orchestrator-, Recovery-, Cross-Produkt- und Produktregressionstests; Cowork-Allowlist unverändert. |
| DS-090 | RC121-E0; realer Worker-/Paketgegenlauf grün, Zielhost-UAT noch zu binden | BL-010.30; Standalone führt auch DOCX über die neutrale isolierte Markdown-Extraktion. Eine synthetische Custom-XML-DOCX prüft im ausgelieferten Sidecar unvollständige Quellenabdeckung, vollständige Markdown-Anonymisierung, Markdown-escapte E-Mail-Adressen, Residual-Gate, Mapping und Scope-Hinweis. Der Cross-Produkt-Goldenlauf bindet den Standalone-Kanal auch über Vertagung, Sammelreview und spätere Publikation, damit Scope und Coverage nicht auf den direkten Cowork-Pfad zurückfallen. Der echte RC120-Problemfall wird über den gebündelten Konvertierungsworker ohne Aufnahme personenbezogener Quelldaten erfolgreich gegengeprüft. Cowork behält den strengen direkten DOCX-Stoppvertrag. |
| DS-096 | E0 umgesetzt; E2/E3 offen | BL-021.1; enge unbeschriftete Prosanamen werden vor Aliasersetzung reserviert und im bestehenden Sammelreview als Person anonymisiert oder als Nicht-Person beibehalten. Exakt bekannte vollständige Identitäten werden in Folgedokumenten automatisch mit demselben v1/v2-Pseudonym ersetzt; widersprüchliche Entscheidungen für denselben offenen normalisierten Namen werden abgewiesen. Fachphrasen-Gegenfälle und rohwertfreie Metadaten sind in `privacy/person-ambiguities.js`, `test-pii-regression.js`, `test-gateway-e2e.js`, `test-batch-review-policy.js`, `test-batch-review-model.js` und `test-batch-session.js` gebunden. |
| DS-097 | E0 umgesetzt; Paket-/Zielhost-UAT offen | BL-010.9/23, BL-010.13, BL-011.8; Resume wird gegen den aktuellen Privacy-/Pseudonymkontext berechnet, Workerfehler werden mit festem Code und gemeinsamem Retrybudget stabilisiert, inaktive Altjournale sperren keine neue Aufnahme. Cowork und Standalone bleiben getrennte Adapter/Distributionen auf einem gemeinsamen Core; Windows, macOS und Linux bleiben Zieladapter aus demselben Commit statt dauerhafter OS-Branches. Recovery-, Runner-, History-, Frontend-, Rust- und Dokumentationsgates. |
| DS-098 | E0 implementiert; Paket-/Zielhost-UAT offen | BL-010.30/BL-022.1; DOCX-Kopf/-Fußzeilen bleiben in Struktur-, Relationship-, Content-Type- und Ressourcenprüfung gebunden. Reine Konvertierung erhält sie; Cowork- und Standalone-Anonymisierung projizieren sie sowie ausschließlich dort referenzierte Bilder nicht. Kommentare, Fuß-/Endnoten und Hauptteil bleiben enthalten. Fester Scope-/Coverage-Grund, Parser-/Workergrenz-, Orchestrator-, Produkt- und Real-DOCX-Regression. |
| DS-088 | Implementierung und ungebundener Paket-Smoke E0; commitgebundener Kandidat/Zielhost-UAT offen | BL-010.12/28/29/31, BL-040.5/6; Auswahl vor Start einzeln oder vollständig korrigierbar über geschlossenen IPC/Rust/Service-Vertrag. Reine Konvertate behalten den Basisnamen, lösen Kollisionen deterministisch und erzeugen keine Zuordnungsdatei; Legacy-v3-Exporte bleiben final. Frontend-, IPC-, Export-, History-, Rust- und reale ZIP-Regressionsprüfungen. |
| DS-089 | aktiv, Namensvorgabe durch DS-091 präzisiert | BL-010.33, BL-044, BL-040.5/6; vollständige Wurzel-relative Standalone-Struktur durch Ordneraufnahme, Queue, Journal und sichtbaren Export. Reine Konvertate behalten den Quellbasisnamen; neue Anonymisierungsläufe folgen der Wahl aus DS-091. Mapping enthält exakt beide relativen Pfade. Segment-/Link-/Swap-Gates, Unit-/Export-/Service-/Legacytests und echter verschachtelter Paketlauf; Cowork und vorhandene Läufe unverändert. |
| DS-091 | Implementierung E0; Zielhost-UAT offen | BL-010.33; Standalone-Anonymisierung bietet vor Start neutralen Standard oder Quellbasis mit `-anonymisiert`. UI-Hilfe, Rust/IPC/Service/Worker, `datasecure-batch/6`, unveränderliche Recoverybindung und strukturtreuer Export sind geschlossen getestet. Alte v4-Läufe bleiben quellbenannt, Cowork bleibt neutral und reine Konvertierung unverändert. |
| DS-092 | Implementierung E0; Cowork-Zielhost-UAT offen | BL-010.8/23, BL-040.5, BL-041.10, BL-044; `open_result_folder` löst mit `latestBatchOnly` ausschließlich den vollständig sichtbaren aktuellen Cowork-Lauf auf und kennt keinen Alt-/Stammordner-Fallback. Gemeinsame rekursive Ordnerfehler tragen `SOURCE_FOLDER_*` und werden im MCP-Normalweg als Auswahlablehnung projiziert. Standalone-Verträge bleiben unverändert und laufen als Regression mit. `mcp-server.js`, `gateway/batch-recovery.js`, `companion/source-folder.js`; MCP-, Recovery-, Picker-, Source-Folder-, Standalone- und Core-Policy-Tests. |
| DS-093 | Implementierung E0; Cowork-Zielhost-UAT offen | BL-010.34; Cowork verarbeitet XLSX/PPTX lokal über denselben neutralen Markdown-Zwischenvertrag wie Standalone und anonymisiert ausschließlich den extrahierten Markdown-Inhalt. Extraktionsabdeckung und Anonymisierungsstatus bleiben getrennt; PDF/Scan-PDF/Bilder bleiben bis zum paketierten OCR-Nachweis gesperrt. `core/markdown-first-privacy.js`, `gateway/orchestrator.js`, `source-format-inspector.js`, Runtimeprojektion; Realformat-, Kanal-, Protokoll-, Dokumentations- und Paketgates. |
| DS-094 | Implementierung E0 durch Lauf `34356576842` auf Commit `84fd616c`; sichtbare Linux-Zielhost-UAT offen | BL-010.4/11/16/17/20/21; Linux x64 glibc ist viertes Standalone-Ziel als AppImage-in-ZIP mit gebündelter Runtime und nativem POSIX-Supervisor. Das kostenbestätigte Gate prüft echten Konverter, Rust/Clippy, ELF-Architektur, dynamisch ermittelten Tauri-Ressourcenroot, App→private IPC→Core, Paketvertrag, zweiten Start aus dem entpackten Paket und bytegleichen Doppelbau. AppImage-SHA-256 `bd25febd…8853`, ZIP-SHA-256 `177b9763…eaee`. Cowork, Linux ARM64 und Windows ARM64 sind nicht erweitert. |
| DS-095 | N3/N4-Vorbereitung E0; Durchführung offen | BL-051/BL-052; N3 bindet technische E1-Zielhostevidence, N4 die nachfolgende formale E2-/E3-Abnahme. `ACCEPTANCE_LEVELS.md`, `docs/acceptance/FORMAL_UAT/*`, getrennte Windows-/macOS-Protokolle, gemeinsamer Commit und plattformspezifische Pakethashes; `test-formal-uat-contract.js`. Ein Mac belegt nur seine native Architektur. |

## DS-067 – konkrete Umsetzung

| Vertrag | Umsetzung | Automatisierter Nachweis |
|---|---|---|
| nur ZIP/Marketplace als Nutzerkanal | Anwenderdoku und Standardbuild; MCPB Engineering-only | Produktkanal-/Artefakttests |
| kein auswählbarer Bildmodus | kein Manifestfeld; Runtime fest `strict` | Manifest-/Visual-Negativtests |
| temporäre Retention 0–14 Tage | Manifestlimit und Runtime-Clamp | Manifest19, Retention25 |
| Originale/Quellen nie automatisch löschen | Source-Read-only- und Retentiongrenzen | Source-/Retention-/Recoverytests |
| fertige Exporte nie automatisch löschen | Output/Export vom Auto-Purge ausgenommen | Retention-/Dokumentationsvertrag |

Historische RC- und Keyring-Nachweise sind weiterhin auditierbar, aber keine
aktuelle Produktzusage.

## E0-Bugrunde 03.09.2026 – Codex-Gegenreview RC92

| Story | Korrektur / Entscheidung | Code- und Testnachweis |
|---|---|---|
| BL-021.1, DS-049 | Fragmentierte Tabellenköpfe werden bis höchstens drei gleich breite Zeilen nur zu bekannten sensiblen Labels spaltengebunden normalisiert; jede Spalte besitzt eine eigene Auflösungsentscheidung, sodass ein aufgelöster Kopf keinen ungelösten sensiblen Nachbarkopf maskiert. Verschobene, anders breite oder überlange sensible Strukturen liefern `TABLE_STRUCTURE_AMBIGUOUS` und stoppen den Publish-Pfad. Eine einzeilige, separatorbreitengleiche Kopfzeile gilt unabhängig von einzelnen Fragmentwörtern nicht als strukturell mehrdeutig. Eindeutige Personenfelder werden redigiert; namensförmige Werte unter unbekannten Köpfen stoppen weiterhin am unabhängigen `PERSON_CANDIDATE`-Gate. `Geboren`, ISO-Geburtsdaten, `0049` und Leerraum um Telefonseparatoren werden erkannt. | `privacy/base.js`, `privacy/engine.js`, `gateway/compliance.js`; `test-pii-regression.js` |
| BL-010.30/BL-021.1/BL-030.2, DS-087/090 | Standalone übernimmt eindeutige sensible Quellköpfe nur in die Privacy-Repräsentation; operative Personenfelder werden redigiert. Ein katalogunabhängiges, linear dedupliziertes Tabellen-Restgate erkennt namensförmige Klarwerte und sichtbare Linklabels unter unbekannten Köpfen und stoppt fail-closed. Cowork und reine Konvertierung bleiben unverändert. | `standalone/wide-privacy-extraction.js`, `privacy/entities.js`, `privacy/engine.js`; `test-wide-privacy-orchestrator.js`, `test-pii-regression.js`, `test-adversarial.js` |
| BL-021.1, DS-012/049 | Exakte technische Titelkontexte (`Graph API`, `Project Server`, `Robot Framework`) und ausgewählte Health-IT-Phrasen bleiben erhalten; echte englische Anreden einschließlich `Mx` ankern weiterhin Namen. | `privacy/base.js`, `privacy/entities.js`; `test-pii-regression.js` |
| BL-021.1, DS-049 | Explizit bezeichnete Zugangsdaten und Loginwerte werden in Zeilen und in Tabellenspalten mit bis zu drei rekonstruierten Kopfzeilen als `CREDENTIAL` ersetzt; überlange Kompositköpfe stoppen. Der unabhängige Restprüfer stoppt verbleibende beschriftete Werte. Das credential-gebundene Vorkommen gelangt weder als Klarwert noch als Hash in Findings, Dictionaries und Diagnoseobjekte; ein unabhängiges gleichlautendes Personen-/Organisationsvorkommen bleibt regulär gebunden. Unbeschriftete technische Tokens und Fachprosa einschließlich Markdown-Überschriften bleiben unverändert. | `privacy/base.js`, `privacy/structured.js`, `privacy/engine.js`; `test-pii-regression.js` |
| BL-021.1, DS-049 | IBANs mit einfachem/mehrfachem Leerraum, Punkt-, Schrägstrich-, ASCII- oder Unicode-Bindestrichgruppierung sowie Leerraum um ein Satzzeichen werden vollständig erkannt. Belegte feste DE-/AT-/BE-/GB-/NL-Längen enden vor eigenständiger Prosa, Folgeidentifiern und durch unabhängige Detektoren abgesicherten Formularlabels; numerische Fortsetzungen, unbekannte Formularfelder und Länderlayouts bleiben konservativ geschützt. | `privacy/base.js`, `privacy/iban-boundary.js`, `privacy/structured.js`; `test-iban-boundary.js`, `test-pii-regression.js` |
| BL-021.1, DS-049 | Häufige deutsche Telefonphrasen (`rufen Sie … [an] unter`, `melden Sie sich unter`, `Rückfragen unter`, `telefonisch unter`) sind zeilenlokal und lexikalisch begrenzt gebunden. `unter` allein, technische Abrufprosa, Uhrzeiten und plausible Kalenderdaten bleiben erhalten; der unabhängige Restprüfer bestätigt dieselbe fachliche Grenze ohne den Telefonform-Regex wiederzuverwenden. | `privacy/base.js`, `privacy/structured.js`, `privacy/engine.js`; `test-pii-regression.js`, `test-adversarial.js` |
| BL-021.1, DS-049 | Personenlabels werden schreibweisenunabhängig, ihr Wert dagegen durch eine separate fallgebundene Grammatik erkannt. Ein kleingeschriebenes Prosawort nach einem Namen wird weder redigiert noch als Alias gespeichert; Zeilen-/Inline-Label, Punkt/kein Punkt, vollständige Namen, explizite Kleinschreibung und stabile v1-/v2-Wiederverwendung sind gegengeprüft. | `privacy/entities.js`; `test-batch-pseudonym-registry.js` |
| BL-022.1, DS-017/049 | Horizontale und vertikale DOCX-Zellverbindungen (`w:gridSpan`, `w:vMerge`) stoppen mit `DOCX_STRUCTURE_UNSAFE`, solange der Renderer keine koordinatentreue Spaltenabbildung trägt. Normale Tabellen bleiben unterstützt. | `ooxml.js`; `test-docx-structure.js`, `test:parser-contract` |
| BL-022.1, DS-017/049 | `mc:AlternateContent` wird namespacegebunden ausgewählt: die erste vollständig bekannte Word-2010-Textfeld-Choice, sonst genau ein Fallback; unbekannte Choice ohne Fallback, doppelte/fehlgeordnete Zweige oder Choice außerhalb des Containers stoppen mit `DOCX_STRUCTURE_UNSAFE`. | `ooxml.js`; `test-docx-structure.js`, `test-parsers.js` |
| BL-023.2/3, DS-085/087/090 | Der Standalone-PDF-Pfad trennt Quellabdeckung und Markdown-Anonymisierung. Erkannte aktive oder nicht abgedeckte Inhalte stoppen vor Freigabe. Standardskonforme In-Memory-Golden-PDFs prüfen über den echten paketierten PDF.js-Parser AcroForm, Signaturfeld, EmbeddedFile/Name-Tree, JavaScript sowie leeres und nichtleeres Benutzerpasswort. Der reale `Map`-Rückgabetyp für Anhänge ist regressionsbelegt; `Set`, Arrays und Objektprojektionen werden zusätzlich defensiv normalisiert, ohne sie als beobachtete PDF.js-Vertragsformen auszugeben. Vollständige Originalcontainer-/Zielhostabdeckung bleibt offen. | `standalone/conversion-worker-child.js`, `tests/helpers/conversion-fixtures.mjs`; `test-standalone-conversion-worker.mjs` |
| BL-022.1, DS-017/049 | Historische Absatz-/Run-Eigenschaften können aktuelle Überschriften nicht überschreiben und blockieren die Datenschutzfreigabe. Kommentare werden nur mit eindeutigen vorhandenen Referenz-IDs und konsistenten Bereichen als vollständig behandelt; gefälschte `ChoiceSupported`-Literale ersetzen keine echte Namespaceauflösung. | `ooxml.js`, `tests/lib/docx-review-fixtures.js`; DOCX-Struktur-, Differential-, Parser- und Gatewaytests |
| BL-010.9/23 | Sieben transportneutrale Core-Verträge werden ohne Prozess, Dateisystem, Timer, Gateway oder Standalone geladen und über statischen esbuild-Importabschluss in beiden tatsächlichen Produktprojektionen gebunden. | `server/core/*`; `test-core-contracts.mjs`, `test-core-policy-binding.mjs` |
| BL-012.2/9/10, BL-041.10 | macOS verwendet einen einzelnen scrollbaren AppKit-Sammeldialog; Abschlussmeldungen bestätigen erst nach sichtbarem Fenster `SHOWN`, nicht bereits nach Prozessstart. | `companion/text-review.js`, `companion/completion-summary.js`; `test-companion-processor.js`, `test-completion-summary*.js`; native Intel-/ARM-E1/E2 offen |
| BL-010.8/27 | Der Windows-Paketbau erzeugt aus `cargo metadata --offline --locked --filter-platform` ein komponentengenaues Inventar der 259 erreichbaren Nicht-Dev-Crates; fehlende Lizenzangaben stoppen, SBOM und Inventar werden gegengeprüft. | `scripts/lib/cargo-license-inventory.mjs`, `build-standalone-package.mjs`, `verify-standalone-package.mjs`; `test-cargo-license-inventory.mjs`, echter Paket-Smoke |
| BL-021.1, DS-012/049 | Geschlechtliche Anreden werden am erkannten Namen entfernt, akademische und berufliche Qualifikationen bleiben erhalten. Die Straßenkorrektur nimmt ausschließlich die belegte Form „Im <Monat> <Jahr>“ aus; echte präpositionale Anschriften bleiben geschützt. | `privacy/entities.js`, `privacy/engine.js`, `privacy/structured.js`; `test-pii-regression.js` |
| BL-042, DS-048/071 | `server/index.js` ist ein kleiner fail-closed Bootstrap. Auch ein Fehler beim Laden der Produktimplementierung oder des regulären Startschutzes erzeugt keinen Node-Stacktrace mit lokalem Pfad; die Implementierung liegt in `mcp-server.js`. | `server/index.js`, `server/mcp-server.js`; `test-startup-guard.js`, Manifest-/Cowork-Vertragstests |
| BL-044.1, DS-049/071 | Startmarker folgen keinem verlinkten Diagnoseordner. Ergebniswurzel, `DataSecure-Output` und Laufordner werden identitätsgebunden und vor jedem Schreib-/Umbenennungsschritt erneut geprüft; ein nach der Auswahl ausgetauschtes Ziel stoppt fail-closed. | `startup-guard.js`, `result-export.js`; `test-startup-guard.js`, `test-result-folder-export.js` |
| BL-042, DS-026/071 | `run_id` bleibt bewusst eine zufällige, inhaltsfreie Supportkennung: sichtbar nur über expliziten Supportstatus und bestätigten lokalen Diagnoseexport, nie im normalen Ablauf oder Ergebnis. | `DECISIONS.md`, `IT-BETRIEBSHANDBUCH.md`; `test-diagnostics.js`, Dokumentengates |
| BL-002 | Der zuvor vertippte direkte Executor-Lifecycle-Befehl (`nodetests/...`) startet den Workflow-Diagnosetest wieder tatsächlich. | `package.json`, `test-manifest.js`; `npm run test:executor-lifecycle` |

## E0-Expertenrunde 04.09.2026 – RC95

| Story | Korrektur / Entscheidung | Code- und Testnachweis |
|---|---|---|
| BL-043, BL-040.5 | Intake, Fortsetzung und lokaler Review liefern erst nach der ausdrücklichen inhaltsfreien Bestätigung des jeweiligen Workers eine erfolgreiche Startantwort. Timeout, früher Exit und Abbruch stoppen fail-closed. | `gateway/batch-executor.js`, `gateway/batch-worker.js`, `gateway/review-worker.js`, `mcp-server.js`; `test-batch-executor-startup.js`, `test-local-review-executor.js`, `test-mcp-protocol.js` |
| BL-041.10, DS-013/069 | Der Abschlussdialog wird zunächst kurzlebig reserviert. Standalone markiert ihn erst nach Renderer-Paint, Windows-Cowork erst nach nativem `Shown` als präsentiert; bei Fehler oder Timeout bleibt genau ein Worker-Fallback. Der AppKit-Adapter bestätigt ebenfalls erst nach sichtbarem `SHOWN`; nur die native Intel-/ARM-Zielhostbeobachtung bleibt E1/E2. | `gateway/batch.js`, `gateway/batch-executor.js`, `gateway/worker-terminal-presentation.js`, `gateway/batch-worker.js`, `gateway/review-worker.js`, `companion/completion-summary.js`, Standalone-Renderer/IPC; `test-worker-terminal-presentation.js`, `test-batch-executor-startup.js`, `test-completion-summary-confirmed.js`, Standalone-/Desktop-Vertragstests |
| BL-041.9, BL-043, DS-013/068 | Ein automatischer Hintergrundstapel wechselt bei Mehrdeutigkeiten ohne zweiten Cowork-Aufruf in den bestehenden lokalen Sammelreview. „Später“, Schließen und Abbrechen bleiben ohne Freigabe fortsetzbar und unterdrücken einen irreführenden zweiten Zustandsdialog. | `gateway/automatic-local-review.js`, `gateway/batch-worker.js`, `gateway/workflow-diagnostics.js`; `test-automatic-local-review.js`, `test-automatic-review-worker-flow.js` |
| BL-040.5, BL-047.1, DS-069 | Der Replay offener sichtbarer Exporte läuft nach dem Listenerstart in einem zeitbegrenzten Worker und blockiert den MCP-Bootstrap nicht. Ergebnislisten binden die bereits dauerhafte Paketidentität statt synchron erneut voll zu hashen; vor einer Inhaltsübergabe bleibt der vollständige asynchrone SHA-256-Nachweis bestehen. | `gateway/result-export-replay.js`, `gateway/result-export-replay-worker.js`, `gateway/batch-results.js`, `gateway/batch.js`, `mcp-server.js`; `test-result-export-startup-replay.js`, `test-batch-results.js`, `test-package-snapshot-async.js`, `test-mcp-protocol.js` |
| BL-010.8, BL-010.7, DS-078 | Plugin-MCP und Releaseprojektionen folgen dem offiziellen `mcpServers`-Vertrag. Der Originalweg ist auf eine lokale Cowork-Sitzung mit laufendem Plugin-MCP beziehungsweise lokales Claude Code begrenzt; Cloud-Sitzungen dürfen nur freigegebene Ergebnisse verwenden. Die Marketplace-Projektion verwendet eine offiziell unterstützte relative Quelle; private/interne Git-Veröffentlichung und Zielhost-Evidenz bleiben Freigabebedingung. | `plugins/data-secure/.mcp.json`, Build-/SBOM-/ZIP-/Marketplace-Skripte, Host- und Nutzerkanon; Manifest-, Struktur-, Runtime-, Dokumenten- und `claude plugin validate --strict`-Gates |

## E0-Expertenrunde 04.09.2026 – zweiter unabhängiger Konsolidierungsreview

| Story | Korrektur / Entscheidung | Code- und Testnachweis |
|---|---|---|
| BL-010.13/14, BL-040.5/6, DS-079/086 | Standalone leitet Abschluss-, Review-, Fehler- und Ergebniszähler aus dem aktiven oder ausdrücklich fortgesetzten eigenen Lauf ab. Verlaufsaktionen binden genau die gewählte Laufkennung, nicht den jüngsten Lauf. Ein intern abgeschlossener Teil ohne terminalen sichtbaren Gesamtexport ist `export_pending`; offene Exporte werden beim App-Start und nach Ergebnisordnerwahl nachgeholt. Zielstamm und Exportzweig werden identitätsgebunden, pro Lauf serialisiert und nur der konkret angeforderte vollständig sichtbare Lauf kann lokal geöffnet werden. | `standalone/application-service.js`, `standalone/run-history.js`, `gateway/batch-recovery.js`, `gateway/result-export.js`; `test-standalone.js`, `test-standalone-history.js`, `test-batch-recovery.js`, `test-result-folder-export.js` |
| BL-010.13/26 | Standalone trennt **Verarbeiten** und **Ergebnisse**; der exakte letzte Lauf ist lokal sichtbar. Der Sidecar löst Zielordner oder Mapping nur intern auf; der Rust-Host prüft absoluten Pfad, Existenz, Typ und Linkfreiheit und startet den nativen Dateimanager ohne versteckte Fensteroption. Der Renderer erhält nur die inhaltsfreie Übergabebestätigung. Getrennte Sidecar-Resolver- und Rust-OS-Ereignisse sowie ein separater `aria-live`-Hinweis verhindern falschen oder unsichtbaren Erfolg. | `standalone/application-service.js`, `standalone/desktop-sidecar.js`, `tauri-contract/src/main.rs`, `frontend/*`; `test-standalone.js`, `test-standalone-frontend.js`, `test-standalone-desktop-contract.js`, `test-standalone-package-smoke.mjs` |
| BL-010.13/26/31, BL-040.5, DS-083/088 | Der UI-Kontext erzwingt vor der Ergebnisanzeige die vollständige Exportprojektion. Standalone-Anonymisierung veröffentlicht nach allen Ergebnisdateien eine formelneutralisierte, laufbezogene `DataSecure-Zuordnung.csv`. Reine Konvertierung verwendet erhaltene Basisnamen, verzichtet auf die Zuordnung und sperrt die entsprechende Aktion. Legacy-v3-Records bleiben lesbar/final; Cowork erhält keine Originalnamen-Projektion. | `gateway/result-export.js`, `standalone/application-service.js`, `standalone/run-history.js`, `desktop-sidecar.js`, Tauri-Host und Frontend; `test-result-folder-export.js`, `test-standalone*.js`, `test-standalone-package-smoke.mjs` |
| BL-010.13/14, BL-041.10 | Standalone-Worker öffnen keine Cowork-Abschluss- oder Reviewdialoge. Nach Sidecar-Neustart, IPC-Fehler oder verlorener Admission verwirft die UI die veraltete Freigabe und verlangt eine neue lokale Auswahl. | `gateway/batch-executor.js`, `gateway/batch-worker.js`, `gateway/review-worker.js`, `apps/datasecure-standalone/frontend/app.js`; `test-batch-executor-startup.js`, `test-worker-terminal-presentation.js`, `test-local-review-executor.js`, `test-standalone-desktop-contract.js` |
| BL-010.7, BL-051.6, DS-078 | Die aktuelle Herstellerarchitektur ersetzt die frühere Desktop-Brücken-Annahme: lokale Plugin-MCPs laufen nur in lokalen Sitzungen bestehender Desktop-Deployments. Cloud-Cowork, Web, Mobil und geplante Cloud-Sitzungen dürfen ausschließlich bereits freigegebenes Markdown verwenden. | Hostmatrix, Zielarchitektur, Produkt-/Nutzer-/Skilldokumentation; `test-host-matrix.js`, `test-cowork-documentation-contract.js`, `test:skills`, `test:docs` |
| BL-003 | Der maschinelle Kanongate verlangt jetzt auch Hostmatrix und Standalone-Sicherheitsmodell; Register, Evidence-Matrix, UML, Benchmarks und aktive Dokumentstände wurden gegen den aktuellen Code revalidiert. | `verify-canonical-docs.mjs`, `DOCUMENT_REGISTER.md`, `BACKLOG_EVIDENCE_MATRIX.md`, `UML_ARCHITECTURE.md`; `test:docs` |
| BL-002, BL-010.25 | Der Versionsschnitt aktualisiert neben Plugin/Node auch Tauri-Konfiguration, Cargo-Paket und -Lock, Zielartefaktnamen sowie aktuelle Standalone-/Evidence-Dokumente. Ein Desktop-Vertragstest stoppt jeden gemischten Versionsstand. | `scripts/set-version.mjs`, `desktop-targets.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`; `test-standalone-desktop-contract.js`, Paketbuild RC99 |

## E0-Expertenrunde 04.09.2026 – wiederholter RC99-Defektcheck

| Story | Korrektur / Entscheidung | Code- und Testnachweis |
|---|---|---|
| BL-011.8, BL-040.6 | Gemeinsamer Lock-Freigabevertrag verhindert Erfolg nach `false`/`EPERM`, ohne Primärfehler zu verdecken; Export-Replay zählt alle offenen Items. | `gateway/batch-lock-release.js`, Processing/Continuation/Delivery/Discard/Review/Recovery, `result-export.js`; Lock-, Recovery-, Delivery- und Export-Negativtests |
| BL-047.1 | Der verzögerte reale Processing-Lock-Test verwendet den aktuellen Byte-Snapshot-Vertrag und stoppt bei unerreichter Publikationsbarriere hart statt ohne Testfall mit Exit 0. | `test-batch-processing-lock.js` |
| BL-047.1, BL-011.8 | Private Stamm-/Batchverzeichnisse werden nach vollständiger lokaler Sicherheitsprüfung pro Prozess und absoluter Produktkonfiguration identitätsgebunden wiederverwendet. Jeder Zugriff prüft die gespeicherten Inodes; Same-Path-Ersatz stoppt fail-closed. Ein bestätigter Purge löscht nur verwaltete Kinder und lässt die gebundenen Root-Identitäten für die weitere Nutzung intakt. Ein echter lokaler 100-Dateien-TXT/CSV/DOCX-Vorher-/Nachherlauf sank von 149,328/191,247 s auf 22,085/23,532 s (kalt/warm), ohne Fsync-Reduktion oder geänderte Freigabeentscheidung. | `gateway/common.js`, `gateway/batch-private-store.js`, `test-private-root-session.js`, `test-retention.js`, `benchmark-batch-phases.mjs` |
| BL-010.13/14 | Standalone-Fortsetzung verlangt korrekten Startmarker und Worker-ACK. UI/CLI unterscheiden `stopped`, `export_pending` und `completed_without_results`; All-stopped bietet eine neue Auswahl, aber weder Ergebnisordner noch Zuordnung. | `standalone/application-service.js`, `standalone/cli.js`, `frontend/app.js`; `test-standalone.js` |
| BL-040.5, BL-041.7 | Alle vier MCP-Prompts verpflichten bei `sync_folder_notice=true` denselben einmaligen Cloud-Sync-Hinweis wie der Hauptskill. Aktive Nutzertexte unterscheiden dedizierten lokalen Ergebnisordner, optionalen Cowork-Zugriff und außerhalb liegende Originale. | `prompt-contract.js`, synchronisiertes `manifest.json`, README, Skillbeispiele und UAT-Doku; `test-manifest.js`, Cowork-/Dokumentationsgates |
| BL-010.20/21 | Zertifikatsfreie macOS-Piloten verwenden explizite Tauri-Ad-hoc-Signatur; Developer-ID/Notarisierung bleiben optional, native Zielhostabnahme verpflichtend. | `tauri.macos.conf.json`, `desktop-targets.json`, `MACOS-START.md`; `test-standalone-desktop-contract.js` |
| BL-010.13/14, BL-043.1 | Die Standalone-Zuordnung erscheint nur für terminal sichtbare, tatsächlich vorhandene Ergebnisse. Ein vollständig gestoppter Stapel bleibt in Abschluss/Diagnose sichtbar, besitzt aber weder Ergebnisordner noch Zuordnung. Der Reviewvertrag beschreibt klare Positionen bis zum Gesamtabschluss ausschließlich als intern fertig. | `result-export.js`, `run-history.js`, `frontend/app.js`, `contracts/BATCH_REVIEW_V2.md`; Export-, History-, Standalone- und Dokumentationsgates |
| BL-040.6 | Export und Replay melden keinen Erfolg, solange ihr identitätsgebundener Claim nach begrenzten Windows-Retries nicht sicher freigegeben wurde. | `result-export.js`; persistente `EPERM`-Negativfälle in `test-result-folder-export.js` |
| BL-047.1, BL-010.13 | Ein kombinierter Standalone-Statussnapshot ermittelt Recovery-Zähler und jüngsten Produktlauf in einer Enumeration mit höchstens einem Read je Journal. | `batch-recovery.js`, `standalone/application-service.js`; 1.000-Journal-Test in `test-batch-recovery.js` |
| BL-011.8, BL-041.10 | Der reale Intake-Worker-Abschlussnachweis wartet auf Dispatcher-Ereignis und Worker-Exit innerhalb des Presenter-Budgets; Fehler räumen Testkinder geordnet auf. | `test-direct-picker-intake-worker.js`; wiederholter Intake-Stresslauf |
| BL-011.8, BL-041.10 | Ein bereits präsentierter historischer Abschlussmarker bleibt endgültig präsentiert, selbst wenn ältere Journale noch Präsentator und Reservierungs-ID enthalten; er kann nicht erneut zur aktiven Reservierung werden. | `gateway/batch.js`; Regression in `test-batch-session.js` |

## E0-Bugrunde 04.09.2026 – UML-, Architektur-, UX- und Fehlergegencheck

| Story | Korrektur / Befund | Code- und Testnachweis |
|---|---|---|
| BL-041.10, BL-040.5 | Eine erstmalige Ergebnisordnerwahl erfolgte vor Readiness- und Aktivitätsprüfung. Dadurch konnte ein nicht startfähiger Lauf unnötig einen Dialog öffnen und die globale Zielkonfiguration verändern. Die Guards laufen jetzt vor dem Setupdialog; Abbruch und Fehler benennen Ergebnis- und Quellpicker getrennt. | `mcp-server.js`, `companion/folder-picker.js`; `tests/test-native-picker-lifecycle.js` |
| BL-042.4, DS-071/074 | Die allgemeine Diagnose schrieb weiterhin per Lesen-Ändern-Ersetzen in eine gemeinsame JSONL-Datei und konnte bei parallelen Prozessen Ereignisse verlieren; niedrige Aktivität ließ alte Ereignisdateien außerdem physisch liegen. Fach-, Workflow- und Supportdiagnose nutzen jetzt dieselbe unveränderliche Einzelereignis-Komponente mit physischer Alters-/Mengengrenze, sicherer Pfadprüfung und begrenztem Windows-Retry. Historische JSONL-Dateien sind nur lesbarer Upgradebestand. | `gateway/diagnostic-event-spool.js`, `gateway/diagnostics.js`, `gateway/workflow-diagnostics.js`, `gateway/support-trace.js`; `test-diagnostics.js`, `test-workflow-diagnostics.js`, `test-support-trace.js`, `test-workflow-diagnostics-concurrency.js` |
| BL-040.5 | Zwischen Existenzprüfung und Rename konnte auf POSIX ein fremdes Ziel entstehen und überschrieben werden. Die sichtbare Projektion verwendet jetzt eine exklusive atomare Hardlink-Veröffentlichung, verifiziert Quell-/Zielidentität und entfernt erst danach die temporäre Datei. Ein konkurrierend entstandenes Ziel bleibt unverändert; der Export bleibt offen. | `gateway/batch-journal-io.js`, `gateway/result-export.js`; `tests/test-result-folder-export.js`, `tests/test-transient-rename-retry.js` |
| BL-020.3, BL-041.1 | Die zeilenbasierte stdio-Aufnahme konnte vor einem Zeilenende unbegrenzt wachsen. Sie verwirft jetzt Frames oberhalb 1 MiB begrenzt und fail-closed, hält keine übergroßen Bytes weiter im Speicher und verarbeitet nach dem nächsten Zeilenende wieder gültige JSON-RPC-Anfragen. | `mcp-server.js`, `gateway/support-trace.js`; `tests/test-mcp-protocol.js` |
| BL-020.3, DS-018 | Parser, OCR und Review laden vor privatem Produktcode den Netzwerk-Deny-Guard. Der MCP-Hauptprozess bleibt Metadaten-/Exportkoordinator und schreibt ausschließlich verifizierte anonymisierte Paketbytes; beide `.mcp.json`-Projektionen starten den geprüften kleinen Einstiegspunkt. | `contracts/NETWORK_BOUNDARY_V1.md`, `server/index.js`, `tests/test-network-boundary.js` |
| BL-011/012/040/041/043 | Die frühere UML vermischte persistierte Item-Status, abgeleitete `batch_phase` und kurzlebige Reservationen und setzte interne Paketfreigabe mit sichtbarem Export gleich. Die korrigierte Sicht trennt Zustand, Ownership, Checkpoint, Review, Mapping/Delivery, sichtbare Projektion, Host-Dateizugriff und Diagnosegrenzen. Offene UX-/Architekturentscheidungen stehen ausdrücklich im Backlog. | `docs/canonical/UML_ARCHITECTURE.md`; Kanonprüfung über `test:docs` |

## E0-Bugrunde 02.09.2026 – Gesamtgegenreview RC86

| Story | Korrektur / Befund | Code- und Testnachweis |
|---|---|---|
| BL-040.5 | Gegencheck: Der Export-Record kannte Finalität nur je Lauf. Blieb ein einzelnes Item dauerhaft fehlschlagend, war der Lauf `complete:false`, und bereits geschriebene, vom Anwender gelöschte Geschwisterdateien wurden bei jedem Replay wiederhergestellt (DS-023). Jetzt wird jedes geschriebene Item sofort als `exported` persistiert und nie erneut geprüft oder erzeugt; nur offene Items werden nachgeholt. | `gateway/result-export.js`; `tests/test-result-folder-export.js` (Teilfehlschlag: Fortschritt je Item, Nutzerlöschung bleibt bei Replay und Terminalexport bestehen, nach Reparatur wird nur das offene Item geschrieben) |
| BL-010.33, BL-044, DS-089/091 | Neue Standalone-Ordnerläufe behalten den relativen Verzeichnisbaum. Der Anwender wählt für anonymisierte Dateiblätter neutral oder quellbasiert; neutral ist Standard. Absolute Wurzelpfade bleiben privat, Diagnosen enthalten keine Namen. Cowork verwendet weiterhin neutrale flache Namen, reine Konvertate behalten den Quellbasisnamen und alte Läufe werden nicht umgeschrieben. Der letzte in derselben UI-Sitzung abgeschlossene Lauf bleibt während einer Folgeauswahl erreichbar; native Öffnungsziele lehnen unter Windows Symlinks und Reparse Points einheitlich ab. | `core/result-naming-mode.js`; `companion/source-folder.js`; `gateway/result-export.js`; Frontend/Rust/IPC/Worker; `tests/test-batch-processing-purpose.js`; `tests/test-result-folder-export.js`; `tests/test-standalone*.js` |
| BL-044.1, BL-040.5 | Das Output-als-Quelle-Gate galt nur für den Ordnerpicker und verglich Pfadstrings: der Dateipicker nahm `DataSecure-Output/Lauf-*/`-Dateien als Quelle an, ein Windows-8.3-Alias des Output-Baums passierte, und ein ersetzter Ergebnisordner (gleicher Pfad, neue Identität) schaltete den Schutz ab. Jetzt prüfen Datei- und Ordnerpicker dieselbe Realpath-/Case-gefaltete Überlappung gegen den konfigurierten und den zuletzt aufgezeichneten Ergebnisordner. | `gateway/result-folder-config.js`, `companion/file-picker.js`, `companion/source-folder.js`; `tests/test-result-folder-export.js` (Dateipicker, Case-Variante, 8.3-Alias, ersetzter Ordner, Geschwisterordner bleibt wählbar) |
| BL-010.8, BL-051.2, BL-010.7, BL-012.6 | Dokumentendrift zum Herstellerstand 02.09.2026: Marketplace galt als belegter Nutzerkanal, obwohl der Marketplace-Quellordner `command: node`, den 57-MiB-OCR-Engineering-Baum und keine Runtime enthält; Anleitungen setzten eine lokale Cowork-Sitzung stillschweigend voraus, obwohl Cowork laut Hersteller standardmäßig in der Cloud läuft und `isLocalDevMcpEnabled` lokale Plugin-MCPs sperren kann; Bedienelemente/Skillnamen und Fortsetzungsphrasen waren uneinheitlich; der Cloud-Sync-Hinweis erreichte den Anwender nicht; UAT-04 verlangte ein auf Windows nicht belastbares Kriterium. | `CURRENT_STATE.md`, `PRODUCT.md`, `BACKLOG.md`, `BACKLOG_EVIDENCE_MATRIX.md`, `README.md`, `docs/ANLEITUNG.md`, `docs/IT-BETRIEBSHANDBUCH.md`, `THIRD_PARTY_NOTICES.md`, `docs/REVIEW_CLAUDE_COWORK_2026-09-01.md`, UAT-Kit, `SKILL.md`, `companion/completion-summary.js`, `BUILD_INFO.json`; `test-current-documentation-contract.js`, `test-completion-summary.js` |
| BL-041.10, BL-012.6 | `result_folder_required` meldete „Es wurde kein Ergebnisordner gewählt“, obwohl der Anwender gewählt hatte (Ordner im privaten DataSecure-Bereich oder nicht anlegbarer `DataSecure-Output`), und der Skill kannte den Code nicht; die Sperre des Ordnerwechsels bei offenem Stapel nannte keinen Ausweg. Jetzt nennt die Antwort den pfadfreien Grund und die erneute Wahl beim nächsten Start; der Skill erklärt den Code; die Wechselsperre nennt Fortsetzen/Abschließen/Verwerfen. | `server/index.js`, `skills/gbh-datasecure-dokument-anonymisieren/SKILL.md`; `tests/test-native-picker-lifecycle.js` (Überlappung mit privatem Root, nativer Fehler ohne Pfadleck, keine Persistenz, kein Quellpicker) |
| BL-002, DS-040 | Toter Vertragstext `HOST_GATE_TEXT` („Rufe zuerst privacy_status auf“) widersprach dem Normalweg ohne Vorabwerkzeug und war exportiert, aber unbenutzt; Tests bezeichneten die 200-Zeichen-/2-KB-Grenzen als „dokumentierte Claude-Limits“, die offiziell nicht existieren. Text entfernt, Grenzen als DataSecure-Konvention beschriftet (offiziell belegt: Kürzung der Skill-Liste bei 1.536 Zeichen). | `server/prompt-contract.js`, `tests/test-manifest.js` |
| BL-002, BL-051.1 | `test:product` ließ 27 produktrelevante Stapel-/Recovery-/Review-/Export-Tests aus (nur über `pretest:fast-path` erreichbar) und fünf Produkttests hingen in keinem npm-Skript; `tests/test-architecture-contracts.js` war veraltet und schlug fehl. Jetzt laufen die DS-022/DS-069-Kerngates in `ci` und alle übrigen Batch-Gates in `full`; ein Guard verhindert verwaiste Tests, der Git-Tracking-Guard für pfadreferenzierte Testhelfer ist in den aktuellen Test übernommen, der veraltete Vertragstest liegt unter `tests/legacy`. | `tests/run-product-suite.js`, `tests/test-test-path-separation.js`, `tests/legacy/test-architecture-contracts.js` |
| BL-002, DS-098 | `test:golden` war fälschlich zugleich ein Updatebefehl und konnte eine unbeabsichtigte Erwartungsänderung vor dem Vergleich selbst bestätigen. Die Prüfung ist jetzt read-only; `update:golden` ist der ausdrückliche, diffpflichtige Pflegeweg. Der deterministische 15-DOCX-Korpus läuft zusätzlich im Produktgate über echte OOXML-Extraktion und die zweckabhängige Kopf-/Fußzeilenprojektion. | `package.json`, `tests/test-test-path-separation.js`, `tests/test-complex-docx-uat-corpus.mjs`, `docs/TESTING.md` |
| BL-040.5 | Abgeschlossene Export-Records wurden bei jedem MCP-Start und jedem Ordnerwechsel erneut ausgeführt: vom Anwender gelöschte sichtbare Ergebnisse wurden wiederhergestellt (gegen DS-023), die gesamte Historie wurde in jeden später gewählten Cowork-Ordner gespiegelt (über DS-069 hinaus, auch in Cloud-Sync-Ziele), und der Start re-hashte alle je exportierten Dateien synchron. Jetzt ist ein abgeschlossener Record endgültig; nur ein fehlgeschlagener Export wird genau einmal nachgeholt. | `gateway/result-export.js`; `tests/test-result-folder-export.js` (Nutzerlöschung bleibt bestehen, Startup-Replay überspringt abgeschlossene Records, Zielwechsel spiegelt nichts, fehlgeschlagener Export wird genau einmal nachgeholt und ist danach endgültig); `CURRENT_STATE.md`, `BACKLOG.md`, `BACKLOG_EVIDENCE_MATRIX.md` angepasst |
| BL-011, BL-011.3 | „Genau ein aktiver Stapel“ (DS-022) war nur je Journal durchgesetzt: `continue_most_recent_document_batch` prüfte weder laufende Aufnahme noch laufende Verarbeitung, und `claimLocalBatchExecutor` sah nur die eigene Lease; zwei Worker auf zwei Stapeln konnten gleichzeitig leben, bis einer am Item-Lock mit irreführender „angehalten“-Notiz scheiterte. Jetzt lehnt die Fortsetzung bei aktiver Aufnahme/Verarbeitung mit `batch_active` ab, und jeder Claim scheitert fail-closed, solange irgendein anderes Journal einen lebenden Executor hält. | `server/index.js`, `gateway/batch-executor-lease.js`, `gateway/batch.js`; `tests/test-batch-executor-lease.js` (fremder lebender Executor blockiert den Claim ohne Journalschreibzugriff, freier Fall bleibt möglich) |
| BL-022.1 | OPC-Partnamen in nicht kanonischer Groß-/Kleinschreibung (`word/Comments.xml`, `word/FOOTNOTES.xml`) passierten die Inventarprüfung per `/i`, wurden aber weder gerendert noch gemeldet – eine stille Story-Auslassung mit Grad „vollständig“; `Word/Document.xml` neben `word/document.xml` galt als zweiter unabhängiger Eintrag. Jetzt gelten nur kanonische Schreibweisen als unterstützte Parts (sonst Coverage-Warnung), und ZIP-Einträge, die sich nur in der Schreibweise unterscheiden, stoppen als mehrdeutiger Container. | `server/ooxml.js`, `server/zip-reader.js`; `tests/test-docx-structure.js` (Case-Varianten für Kommentare/Fußnoten, Case-Duplikat des Hauptteils, kanonischer Positivfall) |
| BL-021.1 | Unterredaktion: `CONTACT_URI_RE` enthielt kein `@` und keine Unicode-Zeichen; der höher priorisierte Kontakt-URI-Span endete bei `mailto:erika@…` vor dem `@`, der überlappende E-Mail-Span wurde verworfen und die persönliche Domain blieb in `general`/`contract`/`customer` im freigegebenen Markdown, ohne Residual-Befund. Jetzt deckt der URI-Span die vollständige Adresse einschließlich Unicode-Domains ab. | `privacy/base.js`; `tests/test-pii-regression.js` (Markdown-Link, Autolink, nackter `mailto:`, `?subject=`, Unicode-Domain, `sip:` über alle fünf Profile; Residual leer) |
| BL-040.5, BL-043.1 | Das „Worker-IPC-ACK“ der Startantwort war nur der `send`-Callback des Elternprozesses (Nachricht hat den Prozess verlassen), keine Bestätigung des Workers; ein vor dem Lesen sterbender oder hängender Worker lieferte trotzdem `local_intake_handoff_confirmed`. Jetzt sendet der Intake-Worker unmittelbar nach Validierung der Nachricht die inhaltsfreie Hülle `local-intake-accepted`; nur sie bestätigt den Handoff, weiterhin auf 5 s begrenzt, ein Worker-Exit vor der Bestätigung lehnt sofort ab, verspätete oder doppelte Hüllen sind inert. | `gateway/batch-worker.js`, `gateway/batch-executor.js`, `tests/lib/detached-batch-worker.js`; `tests/test-batch-executor-startup.js` (Send-Callback allein → Timeout/Stopp; Bestätigung → kein Kill, Timer inert; Exit vor Bestätigung → sofortige Ablehnung), `test-direct-picker-intake-worker.js` (realer Worker) |
| BL-040.5 | Ein beschädigter oder mit dem Journal konfligierender privater Export-Record sowie ein unterbrochener Record-Schreibvorgang (`.tmp`) ließen `exportCompletedState` werfen bzw. zählten als Replay-Fehler; der Batch-/Review-Worker hätte einen vollständig abgeschlossenen Stapel dadurch als „Lokale Verarbeitung angehalten“ präsentiert. Jetzt bleibt der sichtbare Export fail-closed `pending`/`available:false`, interne Pakete bleiben unberührt, Worker binden den Export über `terminalVisibleExport` konsistent an die terminale Zählerhülle. | `gateway/result-export.js`, `gateway/batch-worker.js`, `gateway/review-worker.js`; `tests/test-result-folder-export.js` (beschädigter Record, Record-/Journalkonflikt, liegengebliebene Temporärdatei, fremder Eintrag, inkonsistente Exporterantwort) |

## E0-Bugrunde 01.09.2026

| Story | Korrektur / Befund | Code- und Testnachweis |
|---|---|---|
| BL-022.1 | XML-Entities, Relationship-Namespaces, direkte Fremdnamespace-Texte sowie referenzierte Kopf-/Fußzeilen fail-closed bzw. kanonisch gebunden | `server/ooxml.js`, `gateway/opc-source-validator.js`; Parser-, OPC-Preflight- und DOCX-Strukturtests |
| BL-010.30, BL-022.1, DS-098 | Vollständig validierte DOCX-Kopf/-Fußzeilen werden nur im Anonymisierungszweck samt ausschließlich dort referenzierten Bildern aus der Ergebnisprojektion entfernt; reine Konvertierung erhält sie. | `server/ooxml.js`, Parser-/Conversion-Worker, `core/markdown-first-privacy.js`, `gateway/orchestrator.js`; DOCX-Struktur-, Workergrenz-, Wide-Privacy- und Real-DOCX-Tests |
| BL-024.2 | Portable-/SEA-Engineering-OCR-Bundle, geschlossene Manifest-/Inventar-/Modusgates, Leerzeichenpfade und reservierter Staging-Ausgabepfad | Portable-/SEA-Buildskripte; OCR-Adapter-, Bundle-, Assembler- und Paketverifikationstests |
| BL-042.3 | Beide zulässigen `batch_active`-Statusformen werden als bereits laufender Stapel dargestellt | Statusmodell-/UI-/Server-/Artefakttests |
| BL-042.3 | Der default-off Pilot bleibt eine unveränderliche Start-Momentaufnahme. Ein mit `playwright-core` an den installierten Edge gebundener lokaler Browserlauf prüft sieben Zustände in DE/EN, axe, ausschließlich den SDK-Handshake und 320-px-/400%-Reflow; eine fachlich falsche Abschlussprojektion wird nicht eingeführt. | `tests/test-status-app-browser.mjs`, `test:status-app` |
| BL-010.22/24 | Beide echten Produktprojektionen laufen parallel in getrennten Prozessen/Wurzeln. Fremde kopierte Journale und bidirektionale Cross-Reads stoppen vor Quellen-/Artefaktzugriff; elf native Netzwerk-/Proxy-Canaries je Produkt bleiben offline. | `tests/test-product-isolation-offline.mjs`, `tests/lib/product-isolation-worker.cjs`, `tests/lib/loopback-network-canaries.mjs` |
| BL-010.23 | TXT/Markdown/CSV/DOCX, fünf Profile, Reviewentscheidungen sowie Abbruch und Fortsetzung in frischen Produktprozessen besitzen semantisch gleiche Personen-/Unternehmensbijektion in Cowork und Standalone. | `tests/test-core-policy-binding.mjs`, `tests/lib/core-policy-product-scenarios.js` |
| BL-011.10 | Kollisionsfreie rekursive Mappinglabels sowie atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Worker-Checkpoint einschließlich Delegation und Recovery | `gateway/mapping.js`, `gateway/batch-intake-reservation.js`, `gateway/batch-executor.js`; Mapping-, Picker-, Startup- und echter Zwei-Prozess-Reservierungstest |
| BL-047.1 | Bounded Handoff mit asynchronem, größenbegrenztem Snapshot-Read, SHA-256 und UTF-8-Index außerhalb langer synchroner MCP-Arbeit | `gateway/local-only-handoff.js`, `gateway/package-store.js`; Handoff-/Capability- und 6-MiB-Event-Loop-Yield-Test |
| BL-040.5 | Erst nach Output-Prüfung dauerhaft gewählter dedizierter lokaler Ergebnisordner, zielidentitätsgebundener neutraler Markdown-Export, Rootwechsel-/Manipulations-Replay, Output-als-Quelle-Gate, begrenztes Worker-ACK und inhaltsfreier Abschluss mit Öffnen-Aktion | `gateway/result-folder-config.js`, `gateway/result-export.js`, `gateway/batch-executor.js`, `companion/source-folder.js`, `companion/completion-summary.js`; Ergebnisordner-, Export-, Worker-, MCP-, Source-Folder- und Picker-Lifecycle-Tests |
| BL-002, BL-040.5, DS-080 | Explizite Netzwerk-Ergebnisordner bleiben zulässig, erzeugen aber einmalig einen pfadfreien Hinweis in Cowork und Standalone. Standalone benennt zusätzlich, dass seine laufbezogene Zuordnungsdatei über das Netzlaufwerk übertragen werden kann; es entsteht keine weitere Bestätigung. | `gateway/result-folder-config.js`, `mcp-server.js`, `normal-path-response.js`, `prompt-contract.js`, `standalone/application-service.js`, `frontend/app.js`; Ergebnisordner-, Normalantwort-, Standalone-Service-, Renderer- und Manifesttests |
| BL-010.28, DS-085 | Aktuelle reine Markdown-Konvertierung exportiert ohne Zuordnung. Nur ein bereits angelegter Legacy-Exportplan `/3` beendet beim Replay die damals zugesagte `DataSecure-Zuordnung.csv`; die Ausnahme kann keine neuen Legacy-Pläne erzeugen. | `gateway/result-export.js`; `tests/test-result-folder-export.js` mit unvollständigem `/3`-Plan, vorhandener Markdown-Datei, Replay, Zuordnung und finalem Record |

## Aktueller E0-Abschluss BL-011.8 / BL-020.1 / BL-020.2 / BL-030.2

| Story | Code | Automatisierte Evidenz |
|---|---|---|
| BL-011.8 | `batch-journal-store.js`, `batch-intake-intent.js`, `batch-private-store.js`, `private-work-store.js`, `bound-private-file.js` | Journal-, Intake-, Recovery-, Discard-, Workcopy- und Negativtests |
| BL-020.1 | `content-graph.js` plus Parserbindung | Content-Graph-, Text-, CSV-, DOCX- und Parsertests |
| BL-020.2 | `source-format-inspector.js`, `zip-reader.js`, `ooxml.js` | Source-Preflight-, Parser- und DOCX-Strukturtests |
| BL-030.2 | `batch-pseudonym-context.js`, `batch-pseudonym-registry.js`, Batch-Orchestrator/Review/Publication; attestierter Startindex für aktuelle Journale und feste 50.000-Fenster-Grenze für nicht rekonstruierbare Präindex-Journale | Pseudonym-State-/Registry-, Journal-, Processing- und Review-Publication-Tests; nicht releasegebundene lokale F17-Beobachtung plus reproduzierbare Arbeitsbudgettests mit exakter Kurzfallauflösung, hochrepetitivem Text und begrenztem fail-closed Langfall |

## E0-Abschluss Prozessidentität, Receipt-Semantik und passive Anzeige 05.09.2026

| Story | Umsetzung | Automatisierter Nachweis / Evidencegrenze |
|---|---|---|
| BL-011.8, BL-043 | Worker-Receipt und dauerhafter erster Journalcheckpoint sind getrennte Zustände; die unmittelbare Antwort lautet `local_intake_accepted_checkpoint_pending` und behauptet noch keine laufende Verarbeitung. | `normal-path-response.js`, `prompt-contract.js`, Skillvertrag; Normal-Path-, MCP-, Status- und Picker-Lifecycle-Tests |
| BL-011.11 | Executor-Lease bindet PID plus gehashte OS-Prozessstartidentität. Nur Tod oder nachweislich andere Startidentität erlaubt Recovery; unbekannte Identität blockiert fail-closed. | `gateway/process-identity.js`, `gateway/batch-executor-lease.js`, `gateway/batch-active-lock.js`; `test-process-identity.js`, `test-batch-executor-lease.js`, Active-Lock- und 100-Dateien-Recoverytests; echte macOS-Intel-/ARM-Beobachtung bleibt E1 |
| BL-012.6, BL-042.3 | Standalone zeigt `preparing` sowie passive inhaltsfreie `completed/selected`-Zähler im bestehenden Fenster, ohne zusätzlichen Dialog oder Claude-Polling. | `standalone/application-service.js`, kombinierter öffentlicher Statussnapshot, Standalone-Frontend; Standalone- und Desktop-Vertragstests; UX/A11y bleibt E2 |
| BL-041.10, BL-012.2 | Standalone bestätigt einen terminalen Hinweis erst nach zwei Renderer-Frames und mit der exakt zugehörigen inhaltsfreien Generationsnummer; verspätete oder doppelte ACKs sind inert, ohne passendes ACK greift genau der Worker-Fallback. Windows-Cowork bindet Bestätigung an WinForms-`Shown`, macOS an AppKit-`SHOWN`, jeweils statt an den bloßen Prozessstart. | `batch-executor.js`, `standalone/application-service.js`, `desktop-sidecar.js`, `desktop-ipc.js`, Tauri-Command/Capability, `completion-summary.js`; Startup-, Worker-Presentation-, Standalone-, Desktop- und Confirmed-Presentation-Tests. Nur reale Zielhostanzeige bleibt E1/E2. |
