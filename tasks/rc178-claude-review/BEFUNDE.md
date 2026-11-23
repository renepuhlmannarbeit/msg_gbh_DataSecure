# RC178-Review · Befunde, Annahmen und Plan

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md). Stand
23.11.2026. Abschluss und Übergabe stehen in [ERGEBNIS.md](ERGEBNIS.md), das
Einzelregister in [ABDECKUNG.tsv](ABDECKUNG.tsv).

## Ausgangslage und tatsächlicher Nutzerablauf

- **Einstieg** – `e88f1b8d100421017fb3909d77e338fd25c1b421`
  (`origin/codex/rc178-claude-review-handoff`, lokal und remote identisch,
  Arbeitsbaum sauber). Der Arbeitsbranch `claude/rc178-standalone-review`
  existierte remote nicht und wurde von diesem Commit angelegt.
- **Produktstand** – Tag `v3.2.0-rc178` (Tagobjekt `6766983f`) zeigt auf
  `13ed39ff979a5f5d9bb076d35021164de380b9dd`. `git diff --stat 13ed39ff e88f1b8d`
  enthält nur neun Dokument- und Auftragsdateien. `standaloneBuildFingerprint`
  liefert `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655`
  (400 Quellinputs), identisch zum Auftrag.
- **Zweck und Plattformen** – Reine Markdown-Konvertierung, geführte
  Anonymisierung und automatische Maskierung. Ausgeführt wurde auf
  Windows 11 x64. macOS arm64/x64 ist nur über Quelltext und die lesbaren
  Runner-Belege des Laufs 44744144419 beurteilt. Kein Mac, kein Xcode, kein
  iOS-Simulator verfügbar.
- **Geprüfte Aufrufketten**
  - Oberfläche: `frontend/workspace.html` ist der Einstieg
    (`tauri-contract/tauri.conf.json:13`). `index.html`, `app.js` und
    `styles.css` sind die alte Oberfläche; sie werden paketiert, aber vom
    Hauptfenster nicht geladen.
  - Start: kein Zweck vorbelegt (`workspace.html:43-44`); Picker
    (`workspace.js:863-874`) und Drop (`:2327-2340`) füllen nur den Katalog;
    erst `start()` (`:883-916`) startet. Das Frontend setzt immer
    `markdownOutput:'content-v1'` (`:892`).
  - Shell: Tauri-Command → `main.rs` (`rpc_request`, `document_review_rpc`
    `:2431-2445`) → gerahmte IPC (`ipc_transport.rs`, Frames ≤ 1 MiB) →
    `server/standalone/desktop-sidecar.js` (serielle Kette `:164`, `:330`) →
    `application-service.js`.
  - Verarbeitung: detached Batch-Worker (`gateway/batch-worker.js`) →
    `batch-executor-runner.js:159-197` → `processBatchNext` (nie parallel,
    `batch-processing-orchestrator.js:28-32`) → `batch-item-processor.js`.
  - Konvertierung: `standalone/convert-next.js:46-55` →
    `conversion-worker.js:69-93` (Sandbox-Kind, 512 MiB Heap) →
    `conversion-worker-child.js:944-1016` (PDF `:510`, Bild `:200`,
    Office-OCR `:365`, sonst `extractMarkdownBuffer` `:995`) →
    `standalone/markdown-extractor.js:58-150`. Vorgelagert ist der Preflight
    `gateway/source-format-inspector.js:213-232`.
  - Anonymisierung: `gateway/privacy-text-operation.js`
    (`prepareTextPrivacyReview` → `resolveTextPrivacyReview` →
    `finalizeTextPrivacyReview`) → `privacy/engine.js` (`anonymize`,
    `scanResidual`) mit laufweiter Registry
    (`batch-pseudonym-registry.js`).
  - Ergebnis: Veröffentlichung, Zuordnung und `delivery_pending` seriell
    (`batch-item-processor.js:281-316`), sichtbarer Export am Worker-Ende
    (`batch-worker.js:172`, `result-export.js:688-709`) über den nativen
    Exportbroker (`native_export_broker.rs:384`), der nie überschreibt.
  - Verlauf und Wiederaufnahme: letzte fünf Läufe (`workspace.js:1575`),
    `resumeRun` (`:957-965`); nach Neustart wird nur ein laufender Lauf
    automatisch übernommen (`:2053`).
- **Erwartung je Modus und Abweichung**
  - Nur umwandeln: Inhalt soll erhalten bleiben. Verfehlt bei R-003, R-004,
    R-005, R-006 und R-018.
  - Geführte Anonymisierung: Fundstellen prüfen, Entscheidungen speichern.
    Verfehlt bei R-008 (Hinweis unsichtbar) und R-009 (Texte nennen nicht
    vorhandene Bedienelemente).
  - Automatische Maskierung: erkannte Werte dürfen nicht stehen bleiben.
    Verfehlt bei R-001, R-002 und R-017.
- **Widersprüche zwischen Dokumentation, CI und Quellcode** – siehe R-007,
  R-015, R-016 und R-021.
- **Baseline-Tests** – siehe ERGEBNIS.md, Abschnitt Tests. Kurzfassung:
  `npm run test:docs` PASS. `npm run test:product:headless` brauchte drei
  nicht mit dem Checkout gelieferte Voraussetzungen (gesperrte
  Markdown-Testlaufzeit, gepinntes Node 22.23.2, gebauter Ownership-Guard).

## Methode und Grenzen

Sieben unabhängige Read-only-Reviews (je ein Fachagent, Modell Claude
Fable 5.2) haben parallel gelesen und in getrennten Scratch-Ordnern
reproduziert: Datenschutz/Zuordnungen, Laufzeit/Nebenläufigkeit, Rust-Shell,
Oberfläche, Konvertierung, Lieferkette/CI/Doku und iOS. Die Hauptsession hat
die Berichte konsolidiert, die für eine Änderung vorgesehenen Befunde selbst
erneut ausgeführt und alle Änderungen sequenziell vorgenommen.

Die Abdeckung ist nicht vollständig. Kein Review hat jeden Funktionskörper
gelesen; ABDECKUNG.tsv weist je Einheit aus, was gelesen wurde. Zwei Reviews
(Datenschutz, Laufzeit) erreichten ihr Schrittlimit und lieferten einen
ausdrücklich unvollständigen Bericht. Das Inventar ist musterbasiert, kein
AST: Im Repository liegt kein JavaScript- oder Rust-Parser, und es wurde
keiner nachgeladen.

## Übersicht

Priorität nach beobachteter Auswirkung. Status: `behoben`, `teilweise
behoben`, `offen`, `Hypothese` (nicht reproduziert), `verworfen`.

| ID | Priorität | Dimension und Plattform | Befund in einem Satz | Backlog oder Entscheidung | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | hoch | Anonymisierung, alle | Genitivformen bekannter Personennamen („Müllers Auto“) bleiben im freigegebenen Markdown, weil Redaktion und Restprüfung dieselbe exakte Wortgrenze nutzen. | BL-050.6 | siehe Ergebnis |
| R-002 | hoch | Anonymisierung, alle | Eine im Dokument bereits erkannte Telefonnummer bleibt an weiteren Stellen ohne Label im Klartext. | BL-050.6 | siehe Ergebnis |
| R-003 | hoch | Formatqualität DOCX, alle | `w:noBreakHyphen`, `w:ptab`, `w:sym` und der Zustand alter Formular-Kontrollkästchen werden ohne Hinweis verworfen („Müller‑Schmidt“ → „MüllerSchmidt“, „2019‑2024“ → „20192024“). | BL-049.2, DS-085 | siehe Ergebnis |
| R-004 | hoch | Formatqualität XLSX, alle | Das Standard-Datumsformat 14 erscheint als `mm-dd-yy`, Zahlen mit US-Trennzeichen; `03-05-23` und `1,234` sind für deutsche Leser mehrdeutig. | BL-049.2, DS-085 | siehe Ergebnis |
| R-005 | hoch | Formatqualität DOCX, alle | Überschriften werden nur über die englische Formatvorlagen-ID erkannt, nicht über den Vorlagennamen; lokalisierte IDs verlieren die Gliederung. | BL-049.2 | siehe Ergebnis |
| R-006 | hoch | Formatqualität DOCX, alle | Jede Word-Liste und jede nummerierte Überschrift wird als zwei einzellige Tabellen ausgegeben. | BL-049.2 | offen |
| R-007 | hoch | Dokumentation | CLAUDE.md, Vertrag und Kanon nennen den Batchrunner seriell; ausgeliefert ist eine zweispurige Konvertervorbereitung auf Windows x64 und macOS. | BL-047.5, DS-047 | siehe Ergebnis |
| R-008 | mittel | Oberfläche, alle | Der Hinweis „Entscheidung nicht bestätigt“ wird in der eingebetteten Prüfung in ein ausgeblendetes Element geschrieben. | BL-010.53 | siehe Ergebnis |
| R-009 | mittel | Oberfläche, alle | Fünf Meldungen nennen Bedienelemente mit Namen, die es in der Oberfläche nicht gibt. | BL-010.53 | siehe Ergebnis |
| R-010 | mittel | Betrieb, alle | Nach hartem Abbruch bleibt ein `.pending-dm_*`-Ordner mit nicht anonymisiertem Markdown dauerhaft im privaten Bereich. | BL-050.6 | offen |
| R-011 | mittel bis hoch | Rust-Shell, alle | Die private Exportwurzel füllt sich mit vier Einträgen je Vorgang ohne Bereinigung; nach etwa 512 Exporten scheitert jeder weitere. | BL-050.6 | offen |
| R-012 | mittel | Rust-Shell, alle | Voller Datenträger, entferntes Ziel und verweigerter Zugriff werden alle als „Konflikt“ gemeldet, ohne Diagnoseereignis. | BL-050.6 | offen |
| R-013 | mittel | Rust-Shell, alle | Der Diagnose-Sink verstummt nach 16 MiB je Sitzung, und das Diagnosepaket bricht ab 129 Einträgen im Ordner ab. | BL-050.6 | offen |
| R-014 | mittel | Rust-Shell, alle | Nativ nicht vorgeprüfte Argumente der Nachbearbeitung beenden den Core statt abgelehnt zu werden. | BL-050.6 | offen |
| R-015 | hoch | Release-Nachweis | `main` enthält den RC178-Quellstand nicht, und das Windows-Paket hat keinen unabhängigen Lauf. | Freigabeentscheidung | offen |
| R-016 | mittel | Lieferkette | Die paketierten Drittanbieterhinweise nennen `emf-converter` nicht und beschreiben die macOS-Laufzeit unzutreffend. | BL-050.6 | siehe Ergebnis |
| R-017 | mittel | Anonymisierung, alle | Drei weitere Unterredaktionsmuster: Einzelnachname in Folgedokumenten, Name im Linkziel, „Nachname, Vorname“. | BL-050.6, BL-021.1 | offen |
| R-018 | mittel | Formatqualität CSV, alle | Eine einzelne Zeile abweichender Breite lässt die Trennzeichenerkennung still auf eine Spalte fallen, mit Abdeckung „vollständig“. | BL-049.2 | offen |
| R-019 | mittel | Tests und Orakel | Mehrere Standalone-Tests prüfen die nicht mehr geladene Oberfläche `app.js` oder nur Quelltext per Muster. | BL-050.6 | offen |
| R-020 | mittel bis niedrig | Accessibility, alle | Sammelbefund: Live-Regionen per `hidden`, Rahmenkontrast 1,46:1, fehlender Seitenzoom, Fokusverlust, ARIA-Mängel. | BL-010.53 | teilweise, siehe Ergebnis |
| R-021 | niedrig | Dokumentation | Sammelbefund Dokumentationsdrift (Startanleitung, Register, Traceability, Testzahlen). | BL-050.6 | teilweise, siehe Ergebnis |
| R-022 | mittel | Plattform macOS | Vier Annahmen, die nur ein Zielgerät klären kann. | BL-050.6 | Hypothese |
| R-023 | mittel | Lieferkette | Keine Schwachstellenprüfung der ausgelieferten Abhängigkeiten; Repository öffentlich ohne Tag- und Release-Schutz. | Freigabeentscheidung | offen |

## Einzelbefunde

Alle Fundstellen beziehen sich auf `e88f1b8d`. `srv/` steht für
`plugins/data-secure/server/`, `app/` für `apps/datasecure-standalone/`.

### R-001 · Genitivformen bekannter Namen bleiben stehen

- **Fundstelle** – `srv/privacy/base.js:12` (`NA`), `srv/privacy/engine.js:364`
  (`findLiteralSpans`), Aufrufer Wörterbuchschleife `engine.js:726-741` und
  Restprüfung `engine.js:1297-1317` (`scanResidual`).
- **Auslöser und Geltungsbereich** – Beide Anonymisierungsmodi, alle
  Plattformen und auch das Cowork-Plugin (gemeinsamer Kern). Synthetisch:
  `Name: Hans Müller`, danach `Das ist Hans Müllers Auto.`
- **Ist und Soll** – Ist: Satz bleibt unverändert, keine Fundstelle, kein
  Stopp. Soll: Pseudonym oder Stopp.
- **Auswirkung** – Vor- und Nachname im freigegebenen Ergebnis. Die
  Restprüfung ist hier kein unabhängiges Netz, weil sie dieselbe Grenze nutzt.
- **Evidenz** – Scratch-Skript gegen den echten Kernel
  (`prepareTextPrivacyReview` … `finalizeTextPrivacyReview`, Richtlinie
  `automatic-conservative`): „Müllers Kollegen“, „Hans Müllers Auto“,
  „Müllers haben angerufen“ unverändert. Von der Hauptsession erneut
  ausgeführt.
- **Engste geeignete Änderung** – Für Personen-Einträge im Wörterbuch und in
  der Restprüfung ein Genitivsuffix (`s`, `'s`, `’s`; nach s/ß/x/z nur der
  Apostroph) als Teil der Fundstelle zulassen. Verworfen: allgemeine
  Stammformen-Erkennung (Überredaktion, nicht belegbar).
- **Abnahme** – Positiv: die genannten Sätze enthalten den Namen nicht mehr.
  Negativ: `Müllerstraße` und `Müllersche` bleiben unberührt; Organisationen
  erhalten das Suffix nicht.

### R-002 · Wiederholung einer erkannten Telefonnummer bleibt stehen

- **Fundstelle** – `srv/privacy/structured.js:221-231` (PHONE-Detektor,
  `accept` verlangt `+` oder Label), `:408-470` (`findStructuredSpans`).
- **Auslöser** – `Telefon: 030 1234567`, später `Rückruf unter 030 1234567.`
- **Ist und Soll** – Ist: nur die beschriftete Stelle wird ersetzt. Soll:
  dieselbe Ziffernfolge wird überall im Dokument ersetzt.
- **Auswirkung** – Direkter Identifikator im Ergebnis, obwohl das Dokument
  ihn selbst als Telefonnummer ausweist.
- **Evidenz** – Scratch-Skript, von der Hauptsession erneut ausgeführt.
- **Engste geeignete Änderung** – In `findStructuredSpans` Kandidaten, die nur
  an der Label-Regel scheitern, merken und übernehmen, wenn ihre Ziffernfolge
  einer akzeptierten Nummer gleicht (auch `+49`/`0049` gegen `0`). Weil
  Redaktion und Restprüfung dieselbe Funktion nutzen, bleibt beides
  konsistent. Verworfen: Label-Regel aufheben (Überredaktion von Aktenzeichen
  und Beträgen).
- **Abnahme** – Positiv: Wiederholung und Schreibvarianten verschwinden.
  Negativ: eine unbeschriftete Nummer ohne beschriftetes Gegenstück bleibt
  wie bisher; Kalenderdaten bleiben.

### R-003 · Word-Inline-Elemente werden still verworfen

- **Fundstelle** – `srv/ooxml.js:1168-1170` (`parseWordStructure`): nur
  `w:t`, `w:tab`, `w:br`, `w:cr` erzeugen Text.
- **Auslöser** – DOCX mit geschütztem Bindestrich (Word: Strg+Umschalt+-),
  positioniertem Tabulator, Symbolzeichen oder altem Formular-Kontrollkästchen.
- **Ist und Soll** – `Müller<w:noBreakHyphen/>Schmidt` → `MüllerSchmidt`;
  `2019<w:noBreakHyphen/>2024` → `20192024`; `Muster GmbH<w:ptab/>Seite 3` →
  `Muster GmbHSeite 3`. Soll: Bindestrich U+2011 beziehungsweise Tabulator.
- **Auswirkung** – Namen und Zeiträume werden verfälscht, in beiden Zwecken.
  Der einzige Hinweis ist das bei DOCX praktisch immer gesetzte
  `SOURCE_COVERAGE_UNVERIFIED`.
- **Evidenz** – Scratch-Fixtures über `extractMarkdownBuffer` mit
  `content-v1`; `srv/office-math.js:227-229` bildet `noBreakHyphen` bereits
  auf U+2011 ab, die Datenschutzmuster kennen U+2011 als Strich
  (`privacy/base.js:74`).
- **Engste geeignete Änderung** – `w:noBreakHyphen` → U+2011, `w:ptab` →
  Tabulator im selben Zweig. `w:sym` und Kontrollkästchen bleiben offen: für
  Symbolschrift-Codepunkte gibt es ohne Zuordnungstabelle kein belegbares
  Unicode-Zeichen.
- **Abnahme** – Positiv: beide Zeichen erscheinen. Negativ: `w:softHyphen`
  erzeugt weiterhin nichts.

### R-004 · XLSX-Anzeigeformate US-amerikanisch

- **Fundstelle** – `srv/xlsx-number-format.js:8,10` (Format 14 und 22),
  `:126-127` (englische Monatsnamen), `:173-174` (Trennzeichen).
- **Ist und Soll** – 45000 mit Format 14 → `03-15-23`; Excel zeigt je nach
  Systemsprache `15.03.2023`. ECMA-376 definiert 14 und 22 als
  sprachabhängig.
- **Auswirkung** – `03-05-23` wird als 3. Mai gelesen. Kein Hinweis.
- **Gegenbeleg** – `tests/test-xlsx-content-projection.js:26,41` schreibt die
  US-Ausgabe fest; eine dokumentierte Sprachentscheidung wurde nicht gefunden.
- **Engste geeignete Änderung** – Format 14 und 22 eindeutig als ISO-Datum
  (`yyyy-mm-dd`, `yyyy-mm-dd hh:mm`) ausgeben. Die Zahlentrennzeichen bleiben
  offen: Umstellen auf de-DE wäre für englische Dokumente ebenso falsch und
  braucht eine Produktentscheidung.

### R-005 · Überschriften nur über englische Vorlagen-ID

- **Fundstelle** – `srv/ooxml.js:1174`: `/^heading\s*([1-6])$/i` auf
  `w:pStyle/@w:val`.
- **Ist und Soll** – Vorlagen-ID `berschrift1` mit `<w:name w:val="heading 1"/>`
  ergibt keinen `#`. Soll laut `docs/canonical/PRODUCT.md:66-68`: echte
  Überschriften bleiben erhalten.
- **Einschränkung** – Nur an synthetischen Fixtures gezeigt. Dass deutsches
  Word diese ID schreibt, ist nicht an einer Word-Datei geprüft.
- **Engste geeignete Änderung** – Vorlagen-ID über `styles.xml` auf den
  Vorlagennamen `heading N` auflösen.

### R-006 · Listen als einzellige Tabellen

- **Fundstelle** – `srv/ooxml.js:1464-1497` (`renderWordStructure`).
- **Ist und Soll** – Zwei Aufzählungspunkte ergeben `Listennummerierung:` und
  `Absatzinhalt:` mit je einer einzelligen Tabelle. Soll: `- Apfel`.
- **Gegenbeleg** – Der Kommentar ab `:1483` begründet die Trennung mit dem
  Feldschutz der Anonymisierung.
- **Entscheidung** – Nicht umgesetzt. Die Änderung berührt den Feldschutz und
  braucht eine eigene Gegenprüfung beider Zwecke.

### R-007 · „Seriell“ in den Dokumenten, zweispurig im Produkt

- **Fundstelle Code** – `srv/gateway/standalone-conversion-window.js:16-17`
  (`LANES=2`, `FUTURE_ITEMS=3`), Bedingungen `:28-36`, Aktivierung
  `srv/gateway/batch.js:887-899` und `batch-executor-runner.js:156`.
- **Fundstelle Dokumente** – `CLAUDE.md:64-65`,
  `docs/canonical/contracts/BATCH_PARALLELISM_V1.md:7-9,57-58`,
  `docs/canonical/BACKLOG.md:1569` (BL-047.5 „offen“).
- **Ist** – Seriell sind Entscheidung, Datenschutzprüfung, Veröffentlichung,
  Zuordnung und Export. Parallel laufen höchstens zwei Konverterkinder für
  bis zu drei Folgedokumente, auf Windows x64 und macOS, ab 3 logischen
  Prozessoren, 6 GiB RAM und 3 GiB freiem Speicher; sonst seriell.
- **Evidenz** – Probe mit sechs Dateien und Ersatzkonverter gegen das echte
  Modul: höchstens zwei gleichzeitige Konverter, Reihenfolge erhalten.

### R-008 und R-009 · Oberfläche

- **R-008** – `app/frontend/review.js:685` schreibt nur in `#summary`;
  `review.html:14-18` und `review-workspace.css:13` blenden den Kopf
  eingebettet aus. Soll: sichtbare Meldung in `#matrix-message`.
- **R-009** – `review.js:403` gegen `:272`; `review.js:572` gegen
  `workspace.js:9`; `workspace.js:43` gegen `:1276`;
  `workflow-presentation.js:294` gegen `workspace.html:55`;
  `workspace.js:2342`. Soll: die Meldung nennt das Element so, wie es
  beschriftet ist.
- **Evidenz** – Quelltext. Keine WebView-Beobachtung.

### R-010 bis R-014 · Betrieb und Rust-Shell (offen)

- **R-010** – `srv/standalone/markdown-store.js:75-99,120-123`;
  `markdown-retention.js:64-68` überspringt unbekannte Namen bewusst. Nur
  am Code belegt.
- **R-011** – `app/tauri-contract/src/export_directory.rs:638-663`
  (`write_record_bounded`, Grenze 2048), Kette `native_export_broker.rs:384`
  → `native_export_workspace.rs:102-118,144`. Nur am Code belegt; kein Test.
- **R-012** – `native_export_broker.rs:451-458`, `native_export_channel.rs:340-343`.
- **R-013** – `diagnostic_log.rs:97-132`, `export_directory.rs:571-575`,
  `diagnostic_bundle.rs:200-208`; Polls schreiben drei Ereignisse
  (`main.rs:1572,1664,1753`).
- **R-014** – `main.rs:2431-2445`, `srv/standalone/desktop-sidecar.js:321-325`.
- **Warum offen** – Jede Korrektur ändert die Rust-Shell oder Löschlogik im
  privaten Bereich und braucht Rust-Tests, Clippy und einen nativen
  Paketlauf je Ziel. Auf diesem Host ist nur Windows verfügbar.

### R-015 · Release-Nachweis

- `gh api …/compare/main...v3.2.0-rc178`: `diverged`, 135 voraus, 5 zurück.
  `origin/main:package.json` nennt `3.2.0-rc165`. Die Einstiegsregel in
  `CLAUDE.md:6` führt damit nicht zum RC178-Quellstand.
- `RELEASE-EVIDENCE.json` enthält für Windows weder Lauf noch Runner;
  `docs/RELEASE.md:17-18` nennt die Prüfung zutreffend „lokal“.

### R-016 · Drittanbieterhinweise

- `app/THIRD_PARTY_NOTICES.md:3` nennt eine „unveränderte offizielle
  Node.js-Laufzeit“; dieselbe Datei geht ins macOS-Paket
  (`scripts/build-standalone-macos-package.mjs:131`), das zusätzlich einen
  selbst gebauten statischen Core enthält (`:138`).
- `emf-converter 4.18.1` (Apache-2.0 laut
  `native/graphics/pilot/package-lock.json:18-22`) wird gepackt
  (`scripts/lib/standalone-conversion-runtime.mjs:97`), fehlt aber in den
  Hinweisen.

### R-017 bis R-023 · weitere offene Punkte

- **R-017** – Einzelnachname im Folgedokument (`engine.js:346,720`; als
  Abwägung dokumentiert in `CURRENT_STATE.md:8118-8126`); Name im Linkziel
  bei Profil `general`/`contract` (`engine.js:743-756`); „Österreicher,
  Marlene“ → „[PERSON_001], Marlene“.
- **R-018** – `srv/document-parser.js:94-101` (`parseCsvDialect`).
- **R-019** – `tests/test-standalone-desktop-contract.js:16,404,406` und
  `tests/test-standalone-frontend.js` prüfen `app.js`.
- **R-020** – `workspace.js:489-492` (Live-Regionen), `design-tokens.css`
  (`--c-border-input` 1,46:1), `tauri.conf.json:10-22` (kein
  `zoomHotkeysEnabled`), `workspace.js:798` (Label „ zuklappen“).
- **R-021** – `app/MACOS-START.md:337-343`, `docs/canonical/TRACEABILITY.md:3`,
  `docs/TESTING.md:3,56`, `docs/canonical/DOCUMENT_REGISTER.md:78`,
  `docs/canonical/STANDALONE_ARCHITECTURE.md:527`.
- **R-022** – `os.freemem()` als Schwelle auf macOS
  (`standalone-conversion-window.js:35,118,178`); `st_dev` als gespeicherte
  Volume-Identität (`export_directory.rs:931-935`); 5-Sekunden-Frist bis zur
  Worker-Bestätigung (`batch-executor.js:188,735-739`); Lebensdauer der
  detached Worker nach Fensterschluss (`main.rs:2922-2931`).
- **R-023** – `security.yml` enthält nur CodeQL und Gitleaks.
  `npm audit --package-lock-only`: vier Pilot-Locks ohne Befund, Root-Lock
  zehn Befunde ausschließlich in Entwicklungsabhängigkeiten.

## Annahmen und Revalidierung

| ID | Annahme und Entscheidung | Evidenz dafür | Stärkster Gegenfall oder alternative Erklärung | Perspektiven und Prüfer | Ergebnis und Auswirkung |
| --- | --- | --- | --- | --- | --- |
| A-001 | Die Restprüfung fängt Unterredaktion ab. | Sie stoppt mit `RESIDUAL_PII`. | Sie nutzt dieselbe Wortgrenze wie die Redaktion (R-001). | Datenschutz-Review; zweiter Lauf Hauptsession | Widerlegt für flektierte Formen. R-001 ändert beide Stellen. |
| A-002 | Das Genitivsuffix führt nicht zu Überredaktion. | Suffix nur direkt am Namen, danach Wortgrenze. | Namen, die mit `s` verlängert ein anderes Wort ergeben. | Fachliche Datentreue; Negativfälle im Test | siehe Ergebnis |
| A-003 | U+2011 ist für die Anonymisierung unschädlich. | `privacy/base.js:74` führt U+2011 als Strich. | Namensmuster `NAME_BODY` kennt nur `-`. | Datenschutz; Test mit Doppelnamen | siehe Ergebnis |
| A-004 | „Seriell“ in CLAUDE.md beschreibt die Laufzeit. | Vertrag und Backlog sagen dasselbe. | `standalone-conversion-window.js` ist verdrahtet und getestet. | Laufzeit-Review und Lieferketten-Review unabhängig | Widerlegt. R-007. |
| A-005 | Ein ISO-Datum für Format 14 ist verlustfrei. | Tag, Monat und Jahr sind vollständig. | Das Original zeigt zweistellige Jahre; Tests schreiben US fest. | Fachliche Datentreue | siehe Ergebnis |
| A-006 | Die Standalone-Projektion übersieht keine dynamisch geladenen Module. | Regex erfasst nur literale `require`. | Dynamisches `require` wäre unsichtbar. | Lieferketten-Review, Suche über 276 Dateien | Bestätigt für RC178; kein Wächter für die Zukunft. |
| A-007 | Die Diagnose enthält keine Pfade oder Dateinamen. | Geschlossenes Vokabular, Sanitisierung im Paket. | Fehlertexte aus Kindprozessen. | Rust-Review | Bestätigt am Quelltext; JS-Diagnose nicht gelesen. |
| A-008 | Die Oberfläche ist gegen HTML-Injektion über Dateinamen geschützt. | Kein `innerHTML` im Frontend, CSP `script-src 'self'`. | Bidi-Steuerzeichen im Namen. | Oberflächen-Review | Bestätigt; Bidi bleibt offen (R-020). |

## Plan vor der Umsetzung

Festgehalten vor der ersten Produktänderung. Reihenfolge nach Auftrag:
Datenschutz und Datenverlust zuerst.

| Reihenfolge | Befund-IDs | Ziel und relevante Invarianten | Geänderte Pfade | Verifikation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | R-001 | Genitivformen bekannter Personen werden ersetzt und von der Restprüfung erkannt; Organisationen und andere Wörter unverändert. | `srv/privacy/engine.js`, Test | neuer Test am Kernel, Golden-Tests, Policy-Fingerprint | geplant |
| 2 | R-002 | Wiederholte Telefonnummern werden ersetzt; Label-Regel für Einzelvorkommen bleibt. | `srv/privacy/structured.js`, Test | neuer Test, Golden-Tests | geplant |
| 3 | R-003 | Geschützter Bindestrich und positionierter Tabulator bleiben erhalten. | `srv/ooxml.js`, Test | neuer Test über `extractMarkdownBuffer`, DOCX-Tests | geplant |
| 4 | R-005 | Überschriften über den Vorlagennamen erkennen. | `srv/ooxml.js`, Test | neuer Test, DOCX-Tests | geplant, abhängig vom Aufwand |
| 5 | R-004 | Format 14 und 22 eindeutig ausgeben. | `srv/xlsx-number-format.js`, Tests | XLSX-Tests | geplant |
| 6 | R-008, R-009, R-020 (Label) | Meldungen sichtbar und zutreffend. | `app/frontend/*` | Frontend-Tests | geplant |
| 7 | R-007, R-016, R-021 | Dokumente an den Iststand angleichen. | CLAUDE.md, Vertrag, Backlog, Hinweise | `npm run test:docs` | geplant |
| 8 | alle | Gesamtverifikation und Bericht. | `tasks/rc178-claude-review/*` | Headless, Docs, `git diff --check`, Plugin-Gates | geplant |
