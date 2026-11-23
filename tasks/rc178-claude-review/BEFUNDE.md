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
- **Nativer Lauf** – Nach ausdrücklicher Freigabe des Anwenders am 23.11.2026
  wurde das Windows-Paket aus dem geänderten Stand gebaut, gestartet und über
  die Oberfläche bedient. Beobachtungen stehen in ERGEBNIS.md.
- **Baseline-Tests** – siehe ERGEBNIS.md, Abschnitt Tests. Kurzfassung:
  `npm run test:docs` PASS. `npm run test:product:headless` brauchte sechs
  nicht mit dem Checkout gelieferte Voraussetzungen (gepinntes Node 22.23.2,
  vier Pilot-Laufzeiten, OCR-Modelle, gebauter Ownership-Guard, gebündelte
  und vorbereitete Standalone-Laufzeit; Liste in ERGEBNIS.md).

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
| R-001 | hoch | Anonymisierung, alle | Genitivformen bekannter Personennamen („Müllers Auto“) bleiben im freigegebenen Markdown, weil Redaktion und Restprüfung dieselbe exakte Wortgrenze nutzen. | BL-050.6 | behoben (`8cf00fa7`) |
| R-002 | hoch | Anonymisierung, alle | Eine im Dokument bereits erkannte Telefonnummer bleibt an weiteren Stellen ohne Label im Klartext. | BL-050.6 | behoben (`af203451`) |
| R-003 | hoch | Formatqualität DOCX, alle | `w:noBreakHyphen`, `w:ptab`, `w:sym` und der Zustand alter Formular-Kontrollkästchen werden ohne Hinweis verworfen („Müller‑Schmidt“ → „MüllerSchmidt“, „2019‑2024“ → „20192024“). | BL-049.2, DS-085 | behoben (`14c12ee1`, `0d9e115c`, `a0d3e340`); Zustand alter Formular-Kontrollkästchen offen |
| R-004 | hoch | Formatqualität XLSX, alle | Das Standard-Datumsformat 14 erscheint als `mm-dd-yy`, Zahlen mit US-Trennzeichen; `03-05-23` und `1,234` sind für deutsche Leser mehrdeutig. | BL-049.2, DS-085 | teilweise behoben (`7f7f4d6f`); feste Zahlenschreibweise in der Formatmatrix dokumentiert (`2e34d532`), Umstellung bleibt Produktentscheidung |
| R-005 | hoch | Formatqualität DOCX, alle | Überschriften werden nur über die englische Formatvorlagen-ID erkannt, nicht über den Vorlagennamen; lokalisierte IDs verlieren die Gliederung. | BL-049.2 | behoben (`c79f3aa4`), nur an synthetischen Fixtures gezeigt |
| R-006 | hoch | Formatqualität DOCX, alle | Jede Word-Liste und jede nummerierte Überschrift wird als zwei einzellige Tabellen ausgegeben. | BL-049.2 | offen, bewusst nicht geändert (siehe Einzelbefund) |
| R-007 | hoch | Dokumentation | CLAUDE.md, Vertrag und Kanon nennen den Batchrunner seriell; ausgeliefert ist eine zweispurige Konvertervorbereitung auf Windows x64 und macOS. | BL-047.5, DS-047 | behoben (`8e18e44d`) |
| R-008 | mittel | Oberfläche, alle | Der Hinweis „Entscheidung nicht bestätigt“ wird in der eingebetteten Prüfung in ein ausgeblendetes Element geschrieben. | BL-010.53 | behoben (`c62bb1dd`) |
| R-009 | mittel | Oberfläche, alle | Fünf Meldungen nennen Bedienelemente mit Namen, die es in der Oberfläche nicht gibt. | BL-010.53 | behoben (`c62bb1dd`) |
| R-010 | mittel | Betrieb, alle | Nach hartem Abbruch bleibt ein `.pending-dm_*`-Ordner mit nicht anonymisiertem Markdown dauerhaft im privaten Bereich. | BL-050.6 | behoben (`97a70cd0`, `f8c69fe3`, Tests in `7693e162`) |
| R-011 | mittel bis hoch | Rust-Shell, alle | Die private Exportwurzel füllt sich mit vier Einträgen je Vorgang ohne Bereinigung; nach etwa 512 Exporten scheitert jeder weitere. | BL-050.6 | teilweise behoben (`5f8bf47b`, `3b8fbba9`): Grenze von rund 512 auf rund 16 000 Exporte je Zielordner angehoben; abgeschlossene Datensätze werden weiterhin nie aufgeräumt. Nur Windows-Tests |
| R-012 | mittel | Rust-Shell, alle | Voller Datenträger, entferntes Ziel und verweigerter Zugriff werden alle als „Konflikt“ gemeldet, ohne Diagnoseereignis. | BL-050.6 | teilweise behoben (`8c0dd30b`): Diagnoseursache und Hinweistext; öffentlicher Code bleibt „Konflikt“ |
| R-013 | mittel | Rust-Shell, alle | Der Diagnose-Sink verstummt nach 16 MiB je Sitzung, und das Diagnosepaket bricht ab 129 Einträgen im Ordner ab. | BL-050.6 | teilweise behoben (`b30a6dbc`, `1fb7eaee`); Inventargrenze des Diagnosepakets und Aufbewahrung alter Protokolle offen |
| R-014 | mittel | Rust-Shell, alle | Nativ nicht vorgeprüfte Argumente der Nachbearbeitung beenden den Core statt abgelehnt zu werden. | BL-050.6 | behoben (`aef66f19`, `22688d75`) für alles, was die geladene Oberfläche sendet; nur Windows-Tests |
| R-015 | hoch | Release-Nachweis | `main` enthält den RC178-Quellstand nicht, und das Windows-Paket hat keinen unabhängigen Lauf. | Freigabeentscheidung | offen; Sachstand in `docs/RELEASE.md` festgehalten (`2e34d532`) |
| R-016 | mittel | Lieferkette | Die paketierten Drittanbieterhinweise nennen `emf-converter` nicht und beschreiben die macOS-Laufzeit unzutreffend. | BL-050.6 | behoben (`03c621a4`, `871daa7f`) |
| R-017 | mittel | Anonymisierung, alle | Drei weitere Unterredaktionsmuster: Einzelnachname in Folgedokumenten, Name im Linkziel, „Nachname, Vorname“. | BL-050.6, BL-021.1 | teilweise behoben (`cfee417a`, `ac74cf71`, nachgebessert in `3e4a1be1`, `d4740dd6`, `e07ca2e6`); einzelner Nachname ohne Personenkontext im Folgedokument bleibt dokumentierte Grenze |
| R-018 | mittel | Formatqualität CSV, alle | Eine einzelne Zeile abweichender Breite lässt die Trennzeichenerkennung still auf eine Spalte fallen, mit Abdeckung „vollständig“. | BL-049.2 | behoben (`803acbb9`, Hinweistexte in `2726675a`) |
| R-019 | mittel | Tests und Orakel | Mehrere Standalone-Tests prüfen die nicht mehr geladene Oberfläche `app.js` oder nur Quelltext per Muster. | BL-050.6 | teilweise behoben (`7e9e0530`): Vertrag an die geladene Oberfläche gebunden; Tests der alten Oberfläche bestehen weiter |
| R-020 | mittel bis niedrig | Accessibility, alle | Sammelbefund: Live-Regionen per `hidden`, Rahmenkontrast 1,46:1, fehlender Seitenzoom, Fokusverlust, ARIA-Mängel. | BL-010.53 | teilweise behoben (`c62bb1dd`, `2726675a`); Seitenzoom, versteckte Live-Regionen und Bidi-Steuerzeichen offen |
| R-021 | niedrig | Dokumentation | Sammelbefund Dokumentationsdrift (Startanleitung, Register, Traceability, Testzahlen). | BL-050.6 | behoben (`e1afef0f`, `2e34d532`) |
| R-022 | mittel | Plattform macOS | Vier Annahmen, die nur ein Zielgerät klären kann. | BL-050.6 | Hypothese |
| R-023 | mittel | Lieferkette | Keine Schwachstellenprüfung der ausgelieferten Abhängigkeiten; Repository öffentlich ohne Tag- und Release-Schutz. | Freigabeentscheidung | teilweise behoben (`6a90ed16`): lokale Prüfung der paketierten JavaScript-Abhängigkeiten; Rust-Crates und Repository-Einstellungen offen |
| R-024 | mittel | Anonymisierung, alle | „im Zeitraum 2019-2024“ wird als Ort maskiert; mit geschütztem Bindestrich bleibt „‑2024“ stehen. Gefunden im nativen Windows-Lauf, am unveränderten RC178-Kern bestätigt. | BL-050.6 | behoben (`7b078d75`, Gegenfall im Test seit `7693e162`) |
| R-025 | niedrig | Oberfläche, alle | Zähltexte ohne Einzahl („1 technisch geprüfte anonymisierte Ergebnisse“, „1 Dateien · 1 Ergebnisse“). Im nativen Windows-Lauf beobachtet. | BL-010.53 | teilweise behoben (`2726675a`); die Zähltexte der geführten Prüfung sind offen |
| R-026 | hoch | Fachlichkeit; Anonymisierung; alle Ziele | In den Profilen Personalprofil, Bewerbung und Kunde stoppt ein Dokument mit `RESIDUAL_PII`, sobald ein Link den Namen der Person enthält. Ein Lebenslauf mit LinkedIn-Adresse lässt sich nicht automatisch anonymisieren. Gefunden im Differenzlauf gegen den RC178-Kern. | BL-050.6 | behoben (`d91462b9`) |
| R-027 | hoch | Anonymisierung; alle Ziele | Zugangsdaten werden nur als Feld am Zeilenanfang erkannt. „Zugang: Benutzer sepp, Passwort: Sommer2024! und PIN: 4711“ bleibt vollständig stehen. Gefunden im Differenzlauf; in RC178 und am Stand `ffab4fa7` gleich. | BL-050.6 | teilweise behoben (`283e6ed9`): ein Wort hinter einem Label mitten in der Zeile wird ersetzt; mehrwortige Geheimnisse und weitere Formen bleiben dokumentierte Grenze |
| R-028 | niedrig | Architektur und Betrieb; Windows | Die App startet nicht, solange ein fremder Prozess einen Ordner oberhalb ihres Datenordners mit Löschzugriff geöffnet hält. Die Meldung nennt keinen vorübergehenden Zustand. Im isolierten Testprofil beobachtet, rund sieben Minuten lang. | BL-010.11, BL-010.21 | offen (Beobachtung; Ursache der Sperre nicht zugeordnet) |
| R-029 | niedrig | Tests und Orakel; Windows | Die Startprobe scheitert gelegentlich an einem UDP-Endpunkt eines WebView-Prozesses und verwirft dabei ihre eigene Diagnosezeile. Dreimal beobachtet, je mit Erfolg in einer späteren Wiederholung. | BL-010.21 | offen (Beobachtung) |

## Einzelbefunde

Alle Fundstellen beziehen sich auf `e88f1b8d`, also auf den Stand vor den
Änderungen. `srv/` steht für `plugins/data-secure/server/`, `app/` für
`apps/datasecure-standalone/`. Die Abschnitte beschreiben den Befund, wie er
in der Analyse festgehalten wurde; was daraus in der zweiten Runde wurde,
steht in der Übersicht oben und im Abschnitt „Zweite Runde“.

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
  Tabulator im selben Zweig. `w:sym` und Kontrollkästchen blieben in der
  ersten Runde offen: für Symbolschrift-Codepunkte gibt es ohne
  Zuordnungstabelle kein belegbares Unicode-Zeichen.
- **Zweite Runde** – `w:sym` umgesetzt (`wordSymbolText`): Zeichen einer
  gewöhnlichen Schrift direkt, Buchstaben der Schrift „Symbol“ über eine
  feste Tabelle der griechischen Buchstaben, alles andere als Marker
  `[Symbol]`. Der Zustand alter Formular-Kontrollkästchen bleibt offen.
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
- **Entscheidung** – Nicht umgesetzt, auch in der zweiten Runde nicht. Die
  Änderung berührt den Feldschutz; Begründung und Vorschlag stehen unter
  „Zweite Runde, Entscheidungen je Befund“.

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

### R-010 bis R-014 · Betrieb und Rust-Shell

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
- **Erste Runde** – offen gelassen: Jede Korrektur ändert die Rust-Shell oder
  Löschlogik im privaten Bereich und braucht Rust-Tests, Clippy und einen
  nativen Paketlauf je Ziel. Auf diesem Host ist nur Windows verfügbar.
- **Zweite Runde** – auf ausdrücklichen Auftrag umgesetzt, mit Rust-Tests,
  Clippy und Paketlauf für Windows. Die Einschränkung für macOS gilt
  unverändert und steht in ERGEBNIS.md unter „Mac-Status“.

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

### R-017 bis R-023 · weitere Punkte

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

### R-024 und R-025 · Beobachtungen aus dem nativen Windows-Lauf

- **R-024 Fundstelle** – in der ersten Runde nicht eingegrenzt; in der zweiten
  als Detektor `STREET_ADDRESS` in `srv/privacy/structured.js` bestimmt, der
  „Zeitraum 2019“ wie „Straßenname Hausnummer“ liest. Auslöser: `Ansprechpartner im Zeitraum 2019-2024 war das Team.`
  ergibt `Ansprechpartner [LOCATION_REDACTED] war das Team.`, auch ohne
  Namensfeld im Dokument. Mit U+2011 statt `-` wird nur „im Zeitraum 2019“
  ersetzt und „‑2024“ bleibt stehen.
- **Einordnung** – Überredaktion von Sachinhalt, kein Leck. Vorbestehend:
  dieselbe Ausgabe am unveränderten Kern (Kopie von `dfed2d4e`). Erst durch
  R-003 erreicht ein geschützter Bindestrich die Erkennung überhaupt.
- **Evidenz** – Paketlauf über die Oberfläche (Dokument-002 der automatischen
  Maskierung) und Scratch-Skript gegen alten und neuen Kern mit vier
  Strichvarianten.
- **R-025** – `app/frontend/workspace.js` (Jobtext und Verlaufszeile) und
  `workflow-presentation.js`; in der laufenden App beobachtet, in der zweiten
  Runde an den Zähltexten behoben.

### R-026 · Link mit Personenname stoppt die strengen Profile

- **Fundstelle** – `srv/privacy/engine.js`, Schleife über `URL_RE` für die
  Profile `personnel_profile`, `applicant` und `customer` (in RC178 ab
  Zeile 760): der Link bekommt den Rang `URL` (58), ein Namenstreffer darin
  `PERSON` (72).
- **Auslöser** – `Lebenslauf`, `Bewerbung`, `Name: Laura Stein` und
  `Profil: https://www.linkedin.com/in/laura-stein-12345`. Die automatische
  Profilerkennung wählt „Bewerbung“.
- **Ist und Soll** – Ist: nur „laura-stein“ wird ersetzt, der Rest des Links
  bleibt, die Restprüfung meldet den Link, der Lauf stoppt mit
  `RESIDUAL_PII`. Soll: der Link wird wie jeder andere in diesen Profilen
  als Ganzes ersetzt.
- **Auswirkung** – Kein Leck. Ein Dokumenttyp, für den das Profil gebaut ist,
  lässt sich im automatischen Weg nicht verarbeiten.
- **Evidenz** – Differenzlauf (`alt`: `RESIDUAL_PII`, `neu`: vollständig
  ersetzt); nativer Lauf siehe ERGEBNIS.md.
- **Änderung** – Namenstreffer, die vollständig in einem solchen Link liegen,
  weichen ihm, sofern nichts anderes den Link berührt.

### R-027 · Zugangsdaten hinter einem Label mitten in der Zeile

- **Fundstelle** – `srv/privacy/base.js:381-384` (`CREDENTIAL_FIELD_RE`): das
  Label muss am Zeilenanfang stehen, der Wert ist der Rest der Zeile. Der
  Kommentar darüber nennt die Beschränkung auf ein ausdrückliches Feld als
  Absicht.
- **Auslöser** – `Login sepp@firma.example, Passwort: geheim99` oder
  `Zugang: Benutzer sepp, Passwort: Sommer2024! und PIN: 4711`.
- **Ist und Soll** – Ist: Passwort und PIN bleiben im freigegebenen Markdown,
  ohne Stopp. `Passwort: geheim99` allein in der Zeile wird ersetzt. Soll:
  offen. Ein Label nach Komma oder Semikolon ließe sich erfassen; wo der Wert
  endet, ist dann aber nicht mehr eindeutig.
- **Auswirkung** – Zugangsdaten im Ergebnis. In RC178 und im Endstand gleich.
- **Status nach der dritten Prüfung** – offen.
- **Bearbeitung auf Auftrag des Anwenders** – umgesetzt in `283e6ed9`, nach
  vier widerlegten Fassungen; siehe „R-027 · Umsetzung und Gegenprüfungen“.
  Dabei zeigte sich, dass der Befund breiter ist als der gemeldete Fall:
  auch `WLAN-Passwort: …` und `Admin PIN: …` am Zeilenanfang blieben stehen,
  weil das Label das erste Wort der Zeile sein musste.

### R-028 und R-029 · Beobachtungen aus dem nativen Lauf nach R-027

- **R-028, Start bei fremder Ordnersperre**
  - **Ort** – `tauri-contract/src/export_directory.rs:1138-1144`
    (`open_directory`, Windows: Freigabe nur Lesen und Schreiben),
    aufgerufen aus `private_namespace.rs:284-286` für den Ordner über dem
    Datenordner.
  - **Beobachtung** – Am 24.11.2026 zwischen etwa 00:28 und 00:35 startete
    weder das neue Paket (Build `043e3b81`) noch das Paket vom Vortag (Build
    `1803bce7`) im isolierten Testprofil. Die Oberfläche zeigte „Der interne
    App-Datenordner konnte nicht sicher geöffnet oder neu angelegt werden …
    (STANDALONE_DATA_ROOT_UNSAFE)“ beziehungsweise „Der lokale Core ist nicht
    bereit“; der Datenordner wurde nicht angelegt.
  - **Reproduktion der Ursache** – Ein eigenes Skript öffnete jeden Ordner
    der Kette mit den Rechten und der Freigabe der App. Für
    `%LOCALAPPDATA%\Temp`, im Testprofil ein Vorfahre des Datenordners, kam
    Fehler 32 (Zugriffsverletzung der Freigabe); mit zusätzlicher
    Löschfreigabe gelang das Öffnen. Ein anderer Prozess hielt den Ordner
    also mit Löschzugriff offen. Welcher, habe ich nicht festgestellt; im
    Systemprotokoll steht für 00:31 ein abgebrochener Schattenkopie-Lauf.
    Um 00:35 war die Sperre weg, danach starteten beide Pakete.
  - **Ist / Soll** – Die App verweigert den Start zu Recht, solange sie die
    Ordnerkette nicht festhalten kann. Die Meldung verweist aber auf IT und
    Installation; dass der Zustand vorübergehend sein kann und ein späterer
    Start genügt, sagt sie nicht.
  - **Auswirkung** – Im Produkt liegt der Datenordner unter
    `%LOCALAPPDATA%`; betroffen wäre ein Start, während ein Sicherungs- oder
    Aufräumprogramm `C:\Users\<Name>\AppData\Local` oder einen Ordner
    darüber so geöffnet hält. Ob das auf Zielhosts vorkommt, ist nicht
    belegt. Für Testläufe mit isoliertem Profil kommt der Temp-Ordner als
    Vorfahre hinzu, und der wird häufiger angefasst.
  - **Status** – Offen, nicht geändert. Eine Änderung der Freigabe wäre eine
    Entscheidung über die Schutzgrenze und nichts für eine Randkorrektur.
- **R-029, Startprobe**
  - **Ort** – `tests/manual/standalone-native-windows-launch.ps1:401-462`
    (`Get-NativeNetworkObservation`), Aufruf in Zeile 546.
  - **Beobachtung** – `STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED` am
    23.11. einmal (parallel zu anderen Läufen) und am 24.11. zweimal
    hintereinander ohne Parallelbetrieb; je bestand eine spätere
    Wiederholung mit 0 TCP-Listenern und 0 UDP-Endpunkten. Im Dauerbetrieb
    hält die App nach eigener Messung über zehn Sekunden keinen Endpunkt.
  - **Ist / Soll** – Die Probe schreibt vor dem Abbruch eine Zeile mit den
    drei Merkmalen der Zuordnung (eigenes Profil, WebView-Prozess,
    Microsoft-Signatur). Die Zeile entsteht in einer Funktion, deren Ausgabe
    der Aufrufer einer Variablen zuweist; beim Abbruch geht sie verloren.
    Welches Merkmal fehlte, ist deshalb in keinem der drei Fälle bekannt.
  - **Auswirkung** – Ein Zielhostnachweis kann ohne Produktfehler rot
    werden, und die Probe liefert dann nicht, was sie zur Klärung verspricht.
  - **Status** – Offen, nicht geändert (Prüfwerkzeug; eigene Entscheidung).
- **R-025, Rest** – In der geführten Prüfung stehen weitere Zähltexte ohne
  Einzahl: „1 Zeilen vorgemerkt“, „Noch 1 Fundstellen offen“, „Alle 1
  Fundstellen sind vorgemerkt“, „Nur diese Seite auswählen (1 Zeilen)“
  (`frontend/review.js:293, 313, 473, 506-507, 551`). Im nativen Lauf mit
  einer Fundstelle beobachtet; nicht geändert.

## Zweite Runde · Behebung der offenen Befunde und Gegenprüfung

Auftrag des Anwenders vom 23.11.2026 nach der ersten Übergabe: die offenen
Befunde beheben und revalidieren. Die Hauptsession hat jeden Befund am Code
erneut gelesen, die Änderungen sequenziell umgesetzt und danach zwei
unabhängige Read-only-Prüfer mit dem ausdrücklichen Auftrag eingesetzt, die
Änderungen zu widerlegen. Deren berechtigte Einwände sind als eigene Commits
eingearbeitet.

### Entscheidungen je Befund

- **R-006 (Listen)** – nicht geändert. `srv/ooxml.js` trennt die erzeugte
  Listennummer bewusst vom Absatzinhalt, damit eine Nummer nie Teil eines
  Feldwerts der Anonymisierung wird; `tests/test-word-context-integration.js`
  schreibt diese Form fest. Dieselbe Extraktion speist beide Zwecke, und der
  Zweck erreicht den Konverter nicht. Eine lesbare Listenform nur für „Nur
  umwandeln“ braucht eine Darstellungsoption im Konvertervertrag und eine
  eigene Datenschutz-Gegenprüfung. Vorschlag für die Folgearbeit: Option
  `listProjection` im Inhaltsoptionsvertrag, im Zweck „Nur umwandeln“
  gesetzt, mit Sollwert `- Apfel` beziehungsweise `1. Eins`.
- **R-017, einzelner Nachname im Folgedokument** – nicht geändert. Der Kern
  entscheidet nach dokumentierter Abwägung an der Fundstelle, weil derselbe
  Laut ein gewöhnliches Wort sein kann. Ergänzt wurden nur belegbare
  Personenkontexte. Die Grenze steht jetzt in
  `docs/canonical/STANDALONE_SECURITY_MODEL.md`.
- **R-012** – der öffentliche Fehlercode bleibt unverändert, weil die
  Exportzustandsmaschine in Core und Oberfläche auf den bekannten Codes
  aufbaut. Unterscheidbar wird die Ursache über ein neues, inhaltsfreies
  Diagnoseereignis.
- **R-013** – das Protokollieren erfolgreicher Anzeigeabfragen ist begrenzt.
  Eine Aufbewahrungsregel für alte Protokolldateien wurde nicht eingeführt:
  das Diagnosemodul kennt bewusst nur Anlegen und Anhängen, und nativer
  Löschcode ist ohne macOS-Lauf nicht verantwortbar.
- **R-020** – Seitenzoom nicht aktiviert: Tauri verlangt dafür auf macOS eine
  zusätzliche Berechtigung und ein eingeschleustes Skript; ohne Mac nicht
  prüfbar.
- **R-015, R-022, R-023 (Rest)** – nicht durch Code lösbar: Release- und
  Repository-Einstellungen sowie Messungen auf Zielgeräten.

### Einwände der Gegenprüfung und ihr Ergebnis

| Einwand | Einstufung | Ergebnis |
| --- | --- | --- |
| Linkziel mit Name und zugleich Telefonnummer, IBAN oder E-Mail-Adresse: der Teiltreffer verdrängte die Ganzersetzung, die Restprüfung stoppte ein vorher durchlaufendes Dokument. | Regression | behoben in `ac74cf71`; Test ergänzt |
| Verzeichnislisting unter Windows wurde mit der angehobenen Grenze quadratisch (Mikrobenchmark: rund 4 s bei 65 536 Namen). | Fehler | behoben in `3b8fbba9` |
| Native Argumentprüfung strenger als der Core (Korrektur ohne Bereiche) und abweichender Code bei `acknowledge` auf der Vorschau. | Abweichung | behoben in `22688d75` |
| Protokollbudget je Datensatz statt je Anfrage: verwaiste Startzeile möglich; ein später fehlschlagender Abruf stand ohne Startzeile im Protokoll. | Restrisiko | behoben in `1fb7eaee` |
| Symbol, geschützter Bindestrich oder Tabulator außerhalb eines Absatzes stoppte ein vorher konvertierbares (ungültig aufgebautes) Dokument. Für Bindestrich und Tabulator stammt der Stopp schon aus `14c12ee1`, war also im Stand der ersten Übergabe (`e1afef0f`) enthalten; nur das Symbol kam in der zweiten Runde dazu. | Regression, sehr selten | behoben in `a0d3e340`; Test ergänzt |
| Verschwindender Eintrag zwischen Auflisten und Prüfen brach die gesamte Bereinigung ab; bei Aufbewahrung 0 Tage galt ein gerade geschriebener Ordner als veraltet. | Regression, gering | behoben in `f8c69fe3`; Tests für beide Fälle erst in der dritten Prüfung ergänzt. Der Schutz beruht allein auf dem Alter (älter als eine Stunde, jede Datei ebenso), nicht auf einer Sperre. |
| Genitiv gewöhnlicher Wörter, die als Nachname bekannt sind („Kochs Rezept“, im Folgedokument „Mit Sommers Hilfe“), wird jetzt ersetzt. | Überredaktion | hingenommen: entspricht der schon bestehenden Ersetzung der Grundform; seit der dritten Prüfung im Sicherheitsmodell benannt |
| „Fr.“ als Wochentag unmittelbar vor einem bekannten Namen („Mo. bis Fr. Müller“). | Verhaltensänderung, vom Faktencheck ausgeführt und bestätigt: „Fr.“ verschwand | in der dritten Prüfung eingegrenzt: nach einer Wochentagsspanne bleibt „Fr.“ stehen |
| Zwei Zwischencommits (`8c0dd30b`, `b30a6dbc`) übersetzen nicht, weil beim Aufteilen der Änderungen Code an die falsche Stelle geriet; der Endstand ist korrekt. | Mangel der Historie | offengelegt, nicht umgeschrieben (Projektregel: keine History-Rewrites); `git bisect` muss diese beiden Commits überspringen |

Ohne Befund blieben: die Zuordnung der Symbolschrift (alle 52 Buchstaben
gegen die Adobe-Symbol-Kodierung), die Geschlossenheit der
Diagnosebereinigung, die Vollständigkeit der nativen Argumentprüfung gegen
alles, was die Oberfläche tatsächlich sendet, und die Laufzeit des Kerns
(109 KB Prosa: 0,86 s vorher, 0,89 s nachher; 328 KB: 5,9 s und 5,7 s). Der
Kern skaliert schon in RC178 überlinear; das ist eine Beobachtung, kein
Ergebnis dieser Änderungen.

## Dritte Prüfung · Faktencheck, Differenzlauf und Nachbesserung

Der Stand `a0d3e340` war das vorgesehene Ende der zweiten Runde. Vor der
Übergabe habe ich vier weitere Prüfungen angesetzt. Sie haben Fehler in
meinen eigenen Änderungen gefunden, darunter zwei Lecks, die weder die neuen
Tests noch die erste Gegenprüfung gezeigt hatten. `a0d3e340` wurde nie
gepusht; die Korrekturen stehen in sieben weiteren Commits bis `ffab4fa7`.

- **Eigene Probe für den nativen Lauf** – Beim Zusammenstellen der Eingaben
  blieb „hans_mueller“ zu „Hans Müller“ stehen; die Nachverfolgung führte auf
  die Regression in Aufzählungen.
- **Faktencheck des Berichts** – ein unabhängiger Read-only-Prüfer hat die
  Aussagen dieses Berichts gegen Code und Historie geprüft und 13 Punkte
  beanstandet: dieselbe Regression, einen falschen Testdateinamen, einen
  behaupteten, aber nicht vorhandenen Gegenfall und überzogene
  Formulierungen. Alle sind eingearbeitet.
- **Differenzlauf alt gegen neu** – ein Skript führt den Kern von RC178 und
  den geänderten Kern über dasselbe synthetische Korpus und zählt, wo der
  neue Kern stoppt, wo der alte durchlief, und wo mehr Namensteile sichtbar
  bleiben. Zahlen siehe unten.
- **Zweite und dritte Gegenprüfung des Datenschutzkerns** – zwei unabhängige
  Read-only-Prüfer mit dem Auftrag, die Korrekturen zu widerlegen. Die zweite
  hat meine erste Fassung der Korrektur selbst widerlegt (siehe Tabelle).
- **Nativer Lauf über die Oberfläche** – mit Eingaben, die genau die
  geänderten Fälle enthalten. Er hat einen Fehler in der vertraulichen
  Zuordnung gezeigt, den Suite, Differenzlauf und Gegenprüfungen nicht
  gemeldet hatten.

### Was dabei gefunden wurde

| Befund | Herkunft | Einstufung | Ergebnis |
| --- | --- | --- | --- |
| In einer Aufzählung voller Namen griff die Regel für „Nachname, Vorname“ über das Komma: „Anna Müller, Hans Müller“ → „Anna [PERSON_001] [PERSON_001]“. Der Vorname der ersten Person blieb stehen; bei „Hans Müller, Hans Müller“ ohne Stopp der Restprüfung. | meine Änderung `cfee417a` | Leck, Regression | behoben in `3e4a1be1`: die Umstellung gilt nicht, wo sie einen vollen Namen in üblicher Reihenfolge schneidet. |
| Die Ganzersetzung eines Links mit Personenname hatte Vorrang vor jedem anderen Treffer. Bei einer E-Mail-Adresse, deren Domain den Namen enthält, blieb dadurch der Teil vor dem @ stehen: „l.meier@laura-stein.de“ → „l.meier@[URL_REDACTED]“. | meine Änderungen `cfee417a`, `ac74cf71` | Leck, Regression | behoben in `e07ca2e6`: keine Ganzersetzung mehr. Im Link wird nur der Namensteil ersetzt, an Ort und Stelle, so wie RC178 es für „…/in/laura-stein“ schon tat; zusammengeschrieben, mit Trennzeichen, umgekehrt, prozentkodiert oder ohne Umlaute. |
| Derselbe Vorrang stoppte ein Dokument mit dem Link in spitzen Klammern (`AMBIGUITY_REVIEW_REQUIRED`) und verdrängte einen Zugangsdaten-Treffer neben dem Link. | wie oben | neuer Stopp, Regression | behoben in `e07ca2e6` |
| Die Restprüfung brach ab, wenn sie die bekannten Werte nicht als Liste bekam. `tests/test-pii-regression.js` schlug damit am Stand `a0d3e340` in einem von 164 Fällen fehl. | meine Änderung `cfee417a` | Fehler, von der Suite erkennbar | behoben in `e07ca2e6`. Die Suite war auf `a0d3e340` noch nicht durchgelaufen. |
| In den Profilen Personalprofil, Bewerbung und Kunde stoppte ein Dokument mit `RESIDUAL_PII`, wenn ein Link den Namen als Kennung mit `_` oder `.` enthielt (`…/laura_stein.pdf`). | meine Änderung `cfee417a` | neuer Stopp, Regression | behoben in `d91462b9` zusammen mit R-026 |
| **R-026** – Dasselbe gilt in RC178 schon für Links mit Bindestrich oder dem bloßen Nachnamen: Ein Lebenslauf mit `https://www.linkedin.com/in/laura-stein-12345` stoppt im Profil Bewerbung mit `RESIDUAL_PII`. | vorbestehend (RC178) | fachlicher Fehler: ein üblicher Lebenslauf lässt sich nicht automatisch anonymisieren; kein Leck | behoben in `d91462b9`: Namenstreffer, die vollständig im Link liegen, weichen der Ganzersetzung, die diese Profile ohnehin vornehmen. Das gilt nur, wenn nichts anderes den Link berührt; sonst bleibt es beim Verhalten von RC178. |
| Der volle Name ohne Umlaute („Hans Mueller“, „hans_mueller“, „Hans-Muller“) blieb außerhalb von Links stehen. | Lücke von R-017 | Leck, vorbestehend | behoben in `e07ca2e6`: nur der volle Name, nicht der Nachname allein, und nicht, wenn die Schreibweise im Lauf eine eigene Person ist. |
| Meine erste Fassung dieser beiden Korrekturen (nicht committet) hob den Rang des Links in den drei strengen Profilen an und gab die neuen Schreibweisen an die Restprüfung weiter. Folge: wieder ein sichtbarer E-Mail-Teil („l.meier@stein-beratung.de“), ein freigegebener Namensrest hinter einem Link („…/team/Wei Li.pdf“ → „[URL_REDACTED] Li.pdf“) und Stopps bei „Mit freundlichen Grüßen / Hans Mueller“. | zweite Gegenprüfung | Leck und neue Stopps, vor dem Commit gefunden | Ansatz verworfen. Der Link gewinnt jetzt nur gegen Namenstreffer, die ganz in ihm liegen; die zusätzlichen Schreibweisen erreichen die Restprüfung nicht mehr, sie urteilt über dieselben Werte wie in RC178. |
| In der vertraulichen Pseudonym-Zuordnung fehlte eine Person, sobald eine der neuen Schreibweisen im Dokument vorkam („Müller, Hans“, „hans_mueller“, Name im Link); alle ihre Vorkommen zählten dort als mehrdeutig. Der Text selbst war richtig ersetzt. Die Schreibweisen trugen sich selbst als Identität ein, und die Zuordnung verlangt je Pseudonym genau einen vollen Namen. | meine Änderungen `cfee417a`, `e07ca2e6` | fachlicher Fehler der lokalen Zuordnung, kein Leck; von keinem Test gemeldet | gefunden im nativen Lauf; behoben in `ffab4fa7`: die Schreibweisen tragen den Namen ein, unter dem das Pseudonym eingeführt wurde. Test ergänzt, schlägt am Stand `d5992265` fehl. |
| „Fr.“ als Wochentag vor einem bekannten Namen verschwand („Mo. bis Fr. Müller“). | meine Änderung `cfee417a` | Verlust von Sachinhalt | eingegrenzt in `d4740dd6` |
| Für die Nachbesserung der Bereinigung (`f8c69fe3`) gab es keinen Test; der Gegenfall „Zeitraumstraße 12“ stand im Bericht, aber nicht im Test. | Faktencheck | Testlücke | ergänzt in `7693e162` |
| Zwei Kommentare im Rust-Code versprachen mehr, als der Code hält („nie strenger als der Core“, „keine Grenze für abgeschlossene Exporte“). | Faktencheck | irreführender Kommentar | berichtigt in `d5992265`; R-011 ist deshalb nur „teilweise behoben“ |

### Was bewusst bleibt

- Folgt auf einen umgestellten Namen unmittelbar ein weiterer Name, der im
  Dokument noch einmal vorkommt („Müller, Hans Peter Schmidt“), stoppt der
  Kern mit `AMBIGUITY_REVIEW_REQUIRED`; RC178 lief durch und ließ „Hans
  Peter Schmidt“ stehen. Der Stopp entsteht in der Rückführung offener
  Personenhinweise auf den Ursprungstext, nicht in der geänderten Regel. Ich
  habe ihn nicht aufgelöst.
- Steht die Schreibweise ohne Umlaute allein in einer Zeile, vergibt die
  Personenprüfung wie in RC178 ein eigenes Pseudonym; mitten im Satz erhält
  dieselbe Schreibweise das Pseudonym der bekannten Person. Kein Leck, aber
  in der Zuordnung zwei Einträge für mutmaßlich eine Person.
- „So, Fr. Müller kommt.“ verliert „Fr.“, weil nur eine Wochentagsspanne
  mit Punkt oder „bis“ als solche gilt.
- Die dritte Gegenprüfung hat für den Namensteil im Link keine Regression
  gegenüber RC178 gefunden, aber Lücken der neuen Regel. Sie sind nicht
  behoben: Keine ist schlechter als RC178, und jede weitere Änderung am Kern
  hätte Suite, Differenzlauf und Gegenprüfung erneut verlangt. Ich habe an
  dieser Stelle aufgehört.
  - Steht der Name unmittelbar vor einer prozentkodierten E-Mail-Adresse
    (`?a=Laura%20Stein%40firma-x.de`), gewinnt der E-Mail-Treffer und der
    Vorname bleibt stehen (`Laura%[EMAIL_REDACTED]`). RC178 ließ alles stehen.
  - Zwischen Vor- und Nachname gilt im Link genau ein Trennzeichen aus
    `- _ . + ,` oder `%20`. `/Laura/Stein/`, `Laura~Stein`, `Laura--Stein`,
    `Laura%2BStein` und prozentkodierte Buchstaben werden nicht erkannt; die
    verworfene Ganzersetzung hätte einige davon erfasst.
  - Eine doppelt kodierte Adresse (`%2540`) oder ein kodierter Punkt in der
    Domain (`%2E`) bleibt stehen.
- Ein Link in einer Bewerbung auf eine Lernplattform
  (`[…](https://learn.microsoft.com/users/stein-laura)`) stoppt mit einem
  Fehler ohne Code aus der Nachbearbeitung. RC178 stoppt denselben Text und
  auch einen Link ohne Namen dort; nicht untersucht.

### Zahlen des Differenzlaufs

77 Satzmuster, 8 Namen, 4 Kopfformen und 5 Profile, jeweils einzeln und als
zweites Dokument eines Laufs: 15 400 Fälle je Stand, verglichen mit dem
unveränderten Kern von RC178.

| Ergebnis gegenüber RC178 | Stand `a0d3e340` | Endstand `ffab4fa7` (an `d5992265` dieselben Zahlen) |
| --- | --- | --- |
| gleiche Ausgabe | 9 553 | 10 130 |
| weniger Namensteile sichtbar | 2 612 | 2 816 |
| andere Ausgabe bei gleicher Zählung | 1 556 | 1 130 |
| läuft durch, wo RC178 stoppte | 0 | 336 |
| stoppt in beiden | 1 314 | 978 |
| **mehr Namensteile sichtbar** | **180** | **10** |
| **stoppt neu** | **185** | **0** |

Die zehn verbliebenen Fälle der vorletzten Zeile sind dieselbe gewollte
Wirkung von R-024: „im Winter 2022“ wird nicht mehr als Adresse maskiert, und
„Winter“ ist dort die Jahreszeit, nicht die Person. Die 1 130 Abweichungen
bei gleicher Zählung habe ich je Satzmuster an Stichproben gelesen; sie
entsprechen den beabsichtigten Änderungen (Zeitraum, Anrede, Tabellenzelle,
Telefonwiederholung, Namensteil im Link).

Grenzen: Das Korpus ist von mir geschrieben und deckt, was mir und den
Prüfern einfiel. Es enthält keine echten Dokumente, deutsche Namen mit einem
französischen Beispiel, und es prüft nur den automatischen Weg. Die
Regression in Aufzählungen hat es erst gezeigt, nachdem ich solche Muster
aufgenommen hatte; die E-Mail-Domain mit Namen erst nach dem Hinweis der
Gegenprüfung.

## R-027 · Umsetzung und Gegenprüfungen

Der Anwender hat nach der Übergabe beauftragt, R-027 zu beheben. Die Regel
steht in `283e6ed9`. Bis dahin brauchte es fünf Fassungen; vier unabhängige
Read-only-Gegenprüfungen haben je eine widerlegt. Eine fünfte Gegenprüfung
hat die umgesetzte Fassung nach dem Commit geprüft und nicht widerlegt.

| Fassung | Idee | Womit widerlegt | Folge |
| --- | --- | --- | --- |
| 1 | Label mitten in der Zeile, Wert bis zum Zeilenende, in Fließtext bis zum Satzende. | „Das Passwort: abc Dr. Anna Meier“: der Satzschnitt fiel auf den Titel, der Personentreffer reichte über das Wertende, verlor gegen den Rang der Zugangsdaten und entfiel ganz; der Name wurde freigegeben. Dazu neue Stopps bei Links mit `;Token=` und quadratische Laufzeit auf langen Zeilen. | Leck gegenüber RC178 |
| 2 | Wie 1, aber überlappende Treffer werden in den Wert aufgenommen; Label nur nach Leerraum; Wertende im Code. | Ein Geheimnis mit Satzzeichen wurde zerschnitten („Dr. Strange2024“); ein offener Personenhinweis im Wert wurde verschluckt und stoppte das Dokument; ein verdeckter Titel entzog einem Namen in der Folgezeile die Erkennung. | Leck und neue Stopps gegenüber RC178 |
| 3 | Nur das erste Wort hinter dem Label, ersetzt im Kern zusammen mit allen anderen Treffern. | „Hans Müller“ als Unterschrift und „Zugang Passwort: Hans Müller“: der Name wird erst nach dem Kern über einen offenen Personenhinweis ersetzt; die Regel hatte „Hans“ schon ersetzt, „Müller“ blieb stehen oder das Dokument stoppte. | Leck und neue Stopps gegenüber RC178 |
| 4 | Erstes Wort, ersetzt im gemeinsamen Prüfablauf nach dem Kern; ein Wort, das zu einem offenen Befund gehört, bleibt. | Wiederholte gleichlautende Zeilen mit noch unbekanntem Namen: der zusätzliche Platzhalter machte die Rückführung eines Personenhinweises auf den Ursprungstext mehrdeutig; 50 von 120 Fällen einer Testfamilie stoppten. | neue Stopps, kein Leck |
| 5 (umgesetzt) | Wie 4; die Ersetzung bleibt nur, wenn die anschließende Prüfung dieselben offenen Entscheidungen ergibt wie ohne sie. Sonst bleibt der Text unverändert. | Fünfte Gegenprüfung: kein zusätzlich sichtbarer Klartext, kein neuer Stopp, keine Ausnahme. Drei Beobachtungen, siehe unten. | siehe Grenzen |

### Was die umgesetzte Fassung tut

- **Erkennung** – `srv/privacy/base.js` (`CREDENTIAL_INLINE_FIELD_RE`): das
  Label am Zeilenanfang oder nach Leerraum, auch hinter einer öffnenden
  Klammer oder einem Anführungszeichen und als Ende eines zusammengesetzten
  Worts, gefolgt von `:` oder `=`. Der Wert ist ein Wort.
- **Trennung vom übrigen Kern** – `srv/privacy/structured.js`: der Detektor
  gehört nicht zur gewöhnlichen Suche (`findStructuredSpans`). Redaktion,
  Restprüfung und Personenhinweise lesen eine solche Zeile wie in RC178.
- **Ersetzung** – `srv/gateway/privacy-text-operation.js`
  (`prepareTextPrivacyReview`): nach dem Kern und nach der Wiederherstellung
  der Personenhinweise. Ein Wort, das zu einem offenen oder gemeldeten Befund
  gehört, bleibt. Die Ersetzung wird nur übernommen, wenn die Prüfung des
  neuen Texts dieselben offenen Entscheidungen ergibt.
- **Ausgenommen** – Tabellenzeilen, Überschriften (das verlangt der bestehende
  Test `tests/test-pii-regression.js`), Zeilen, die schon mit einem Label
  beginnen, und Labels in Links.

### Nachweise

- `tests/test-privacy-inline-credentials.js`, 7 Fälle, darunter die Gegenfälle
  aller vier Gegenprüfungen.
- Differenzlauf gegen den RC178-Kern, jetzt mit 16 Zugangsdaten-Mustern:
  18 600 Fälle, kein neuer Stopp; die einzigen „mehr sichtbar“-Fälle sind die
  zehn von R-024.
- Zufallstests der Gegenprüfer auf dem Endstand: 2 000, 1 280 und 120 Fälle,
  je ohne neuen Stopp und ohne zusätzlich Sichtbares. In der vierten
  Fassung hatte die 120er-Familie 50 Stopps.
- Golden-Regression 164 von 164.
- Fünfte Gegenprüfung (read-only, eigene Skripte) auf `283e6ed9`:
  - 3 915 handgeschriebene Fälle in fünf Profilen gegen den RC178-Kern
    (Namen und Aliase hinter elf Labels, Zeilentrenner, Markdown-Formen,
    Vertragsprosa): keine Auffälligkeit.
  - 66 000 Zufallsläufe, davon 42 000 gegen den RC178-Kern und 24 000 gegen
    den Vorgängercommit, jeder dritte mit Verarbeitungsspur: 0 neue Stopps,
    0 Ausnahmen, 0 Fehler beim Abspielen der Spur.
  - 1 050 gezielte Fälle mit Personenmarker am Zeilenanfang: keine
    Auffälligkeit.
- Eigene Nachprüfung der Punkte, die diese Gegenprüfung nicht mehr erreicht
  hat (Scratch-Skripte, RC178-Kern gegen `283e6ed9`):
  - Lage offener Personenhinweise im Entwurf nach der Ersetzung: 1 500 Fälle,
    1 673 Hinweise, keiner verschoben; in 879 Fällen war die Ersetzung aktiv.
  - Zweiter Durchlauf über ein freigegebenes Ergebnis: 400 Fälle, in beiden
    Ständen gleich viele Stopps (351), kein Fall nur im neuen Stand.
  - Zwei Dokumente mit gemeinsamer Registry: 400 Paare, kein neuer Stopp.
  - Laufzeit: ein Dokument mit vielen solchen Labels braucht im
    Datenschutzkern 26 bis 45 % länger, weil die Prüfung zweimal läuft
    (14 KB: 132 → 166 ms; 56 KB: 0,73 → 1,03 s; 226 KB: 7,1 → 10,4 s). Ein
    Dokument ohne solches Label wird nur einmal geprüft.

### Beobachtungen der fünften Gegenprüfung

- **Dokumente, die RC178 stoppte, laufen jetzt durch** – vier von 66 000
  Zufallsfällen. Nachvollzogen an drei davon: Der alte Stand stoppt in der
  Schlussprüfung, weil nach dem Ersetzen eines Namens am Zeilenanfang
  `[PERSON_003] - API Key: Anna` wie ein Zugangsdatenfeld am Zeilenanfang
  aussieht (zwei Fälle) oder weil das Wort hinter dem Label als möglicher
  Name übrig bleibt (ein Fall). Im neuen Stand ist genau dieses Wort ersetzt;
  die unveränderte Schlussprüfung läuft über den neuen Text und findet
  nichts. Es wird keine Prüfung umgangen. Folge: Namen an anderer Stelle,
  die der Kern in keinem Stand erkennt (`(Hans Müller)` ohne Personenkontext
  im Profil Allgemein), stehen in einem solchen Dokument jetzt im Ergebnis;
  vorher verhinderte der Stopp aus anderem Grund die Ausgabe.
- **Das Wort reicht bis zum nächsten Leerraum** – eine schließende Klammer
  oder ein Anführungszeichen direkt dahinter geht mit: `(Passwort=abc)` →
  `(Passwort=[CREDENTIAL_REDACTED]`. Beginnt der Text eines Markdown-Links
  mit dem Label, geht im Profil Allgemein das Linkziel mit:
  `[Passwort: abc](https://example.org/x)` → `[Passwort:
  [CREDENTIAL_REDACTED]`. In den Profilen, die Links ersetzen, bleibt
  `[URL_REDACTED])` stehen. Kein Klartext mehr als vorher; die
  Markdown-Struktur der Zeile ist beschädigt.
- **Ein Titel hinter dem Label geht verloren** – `Token: Dr. Hans Müller` →
  `Token: [CREDENTIAL_REDACTED] [PERSON_001]`. Steht hinter dem Label ein
  Name, den der Kern nicht kennt, wird nur der Vorname ersetzt; der Nachname
  bleibt sichtbar wie in RC178 (`Nutzername: Hans Müller` ohne weiteren
  Personenkontext).
- **Nebenbefund zu R-017, nicht aus `283e6ed9`** – Bei bekannter „Anna
  Meier“ liest der Stand seit `cfee417a` in „Anwesend: Meier, Anna Schmidt
  und Weber.“ die Folge „Meier, Anna“ als umgestellten Namen: Ergebnis
  `[PERSON_001] Schmidt`, in RC178 `[PERSON_001], Anna Schmidt`. Es ist
  weniger Klartext sichtbar als vorher, aber der Vorname einer anderen Person
  läuft unter dem Pseudonym der ersten, auch in der vertraulichen Zuordnung.
  Der Schutz für Aufzählungen aus `3e4a1be1` greift nur, wenn der zweite
  volle Name schon als Person bekannt ist. Nicht geändert.

### Grenzen der umgesetzten Fassung

- Von einem Geheimnis aus mehreren Wörtern hinter einem Label mitten in der
  Zeile wird nur das erste Wort ersetzt (`…, Passwort: Sommer 2024`).
- Für ein Dokument mit wiederholten gleichlautenden Zeilen und noch
  unbekannten Namen kann die Ersetzung ganz unterbleiben; die Zugangsdaten
  bleiben dort so sichtbar wie in RC178.
- Folgt dem Label Fließtext, geht dessen erstes Wort verloren.
- Die Restprüfung kennt die Regel nicht. Sie ist eine zusätzliche Ersetzung,
  kein neues Tor.
- Eine Textdatei ist kein Markdown: Zeilen, die wie eine Tabelle oder eine
  Überschrift aussehen, kommen aus einer TXT-Quelle als gewöhnlicher Text
  an. Im nativen Lauf wurde deshalb der Wert in `| VPN | Token: abc123def |`
  ersetzt (in RC178 blieb er stehen), und `# Token: Aufbau und Validierung`
  verlor „Aufbau“. Die Ausnahmen für Tabellen und Überschriften gelten nur
  für Markdown-Quellen und für Formate, deren Tabellen als Markdown-Tabellen
  ankommen.
- Unverändert nicht erkannt: Wert ohne `:` oder `=`, Wert in der Folgezeile,
  `PW`/`Pwd`, Label direkt nach Komma ohne Leerraum, JSON-Schreibweise,
  Label in Überschriften und in Links.
- Nicht geprüft, weder von der fünften Gegenprüfung noch von mir: die
  geführte Prüfung mit von Hand getroffenen Entscheidungen auf einem Text mit
  ersetzten Zugangsdaten, und der Zwischenspeicher der Zeileneinordnung nach
  einer Ausnahme (nur gelesen: er wird in jedem Fall geleert).
- Alle Vergleichsläufe arbeiten mit erfundenen Sätzen aus wenigen Bausteinen.
  Sie zeigen, was bei diesen Formen passiert, nicht was in echten Dokumenten
  vorkommt.
- Beobachtung am Rand, in RC178 gleich: eine Überschrift aus zwei
  großgeschriebenen Wörtern („Übergabe Arbeitsplatz“) wird als Person
  ersetzt; ein Passwort hinter „Login x, Passwort: …“ in einer Zeile, die mit
  einem Namensfeld beginnt, geht in `[FIELD_REDACTED]` auf.

## Annahmen und Revalidierung

| ID | Annahme und Entscheidung | Evidenz dafür | Stärkster Gegenfall oder alternative Erklärung | Perspektiven und Prüfer | Ergebnis und Auswirkung |
| --- | --- | --- | --- | --- | --- |
| A-001 | Die Restprüfung fängt Unterredaktion ab. | Sie stoppt mit `RESIDUAL_PII`. | Sie nutzt dieselbe Wortgrenze wie die Redaktion (R-001). | Datenschutz-Review; zweiter Lauf Hauptsession | Widerlegt für flektierte Formen. R-001 ändert beide Stellen. |
| A-002 | Das Genitivsuffix führt nicht zu Überredaktion. | Suffix nur direkt am Namen, danach Wortgrenze. | Namen, die mit `s` verlängert ein anderes Wort ergeben. | Fachliche Datentreue; Negativfälle im Test | Bestätigt für „Müllerstraße“, „Müllersche“, Organisationen und untypisierte Werte. Rest: ein Nachname, dessen s-Form ein eigenes Wort ist, wird wie bisher schon in der Grundform ersetzt; das Suffix erweitert diesen Fall nur um die s-Form. |
| A-003 | U+2011 ist für die Anonymisierung unschädlich. | `privacy/base.js:74` führt U+2011 als Strich. | Namensmuster `NAME_BODY` kennt nur `-`. | Datenschutz; Regressionslauf | Nicht widerlegt: 181 datenschutz- und 181 officebezogene Suite-Dateien bestehen. Nicht gezeigt: dass ein Doppelname mit U+2011 als ein Name erkannt wird. Vorher ging der Strich ganz verloren, der Name war also ebenfalls nicht als Doppelname erkennbar. Offen als Folgepunkt zu R-003. |
| A-004 | „Seriell“ in CLAUDE.md beschreibt die Laufzeit. | Vertrag und Backlog sagen dasselbe. | `standalone-conversion-window.js` ist verdrahtet und getestet. | Laufzeit-Review und Lieferketten-Review unabhängig | Widerlegt. R-007. |
| A-005 | Ein ISO-Datum für Format 14 ist verlustfrei. | Tag, Monat und Jahr sind vollständig. | Das Original zeigt zweistellige Jahre; Tests schreiben US fest. | Fachliche Datentreue | Bestätigt: der Zellwert ist die Seriennummer, das vierstellige Jahr ist daraus eindeutig. Der festgeschriebene Testwert `01-01-04` wurde auf `1904-01-01` geändert. Die Ausgabe weicht bewusst von der Excel-Anzeige ab. |
| A-006 | Die Standalone-Projektion übersieht keine dynamisch geladenen Module. | Regex erfasst nur literale `require`. | Dynamisches `require` wäre unsichtbar. | Lieferketten-Review, Suche über 276 Dateien | Bestätigt für RC178; kein Wächter für die Zukunft. |
| A-007 | Die Diagnose enthält keine Pfade oder Dateinamen. | Geschlossenes Vokabular, Sanitisierung im Paket. | Fehlertexte aus Kindprozessen. | Rust-Review | Bestätigt am Quelltext; JS-Diagnose nicht gelesen. |
| A-008 | Die Oberfläche ist gegen HTML-Injektion über Dateinamen geschützt. | Kein `innerHTML` im Frontend, CSP `script-src 'self'`. | Bidi-Steuerzeichen im Namen. | Oberflächen-Review | Bestätigt; Bidi bleibt offen (R-020). |
| A-009 | Die Ganzersetzung eines Links mit Personenname stört keine andere Erkennung. | Der Link trägt den Namen; ihn ganz zu ersetzen ist die sichere Seite. | Telefonnummer, IBAN oder E-Mail-Adresse im selben Linkziel erzeugen einen überlappenden Treffer mit höherem Rang. | Datenschutz-Gegenprüfung (read-only) | Widerlegt in der ersten Fassung: ein vorher durchlaufendes Dokument stoppte in der Restprüfung. Behoben in `ac74cf71` mit eigenem Rang der Ganzersetzung. |
| A-010 | Ein verwaister Vorbereitungsordner ist am Namen und am Alter sicher erkennbar. | Namensmuster `.pending-<dm_…>-<24 hex>` wird nur vom Speicher selbst erzeugt. | Eine gerade laufende Veröffentlichung; Aufbewahrung 0 Tage; Eintrag verschwindet während der Prüfung. | Laufzeit-Gegenprüfung (read-only) | Teilweise widerlegt: bei 0 Tagen galt ein frischer Ordner als veraltet. Behoben in `f8c69fe3` mit fester Schonfrist. |
| A-011 | Die native Argumentprüfung lehnt nichts ab, was der Core annimmt. | Regeln aus `validatePrivateMessage` übernommen. | Sonderfälle des Core (Korrektur ohne Bereiche, `acknowledge` auf der Vorschau). | Rust-Gegenprüfung (read-only) gegen Core und alle Aufrufe der Oberfläche | Widerlegt in zwei Fällen; angeglichen in `22688d75`. Danach ohne Abweichung für alles, was die geladene Oberfläche sendet. |
| A-012 | Die höhere Grenze für kontrollierte Namen kostet keine Laufzeit. | Die Prüfung ist eine einfache Zählung. | Das Windows-Listing prüfte Duplikate je Seite gegen alle bisherigen Namen. | Rust-Gegenprüfung mit Mikrobenchmark | Widerlegt: quadratisch, rund 4 s bei 65 536 Namen. Behoben in `3b8fbba9`. |
| A-013 | Ein neuer Zweig für `w:sym` (und in der ersten Runde für `w:noBreakHyphen` und `w:ptab`) ändert nur Dokumente mit diesen Marken in Absätzen. | Der Zweig erzeugt nur Text. | Dieselbe Marke außerhalb eines Absatzes traf die Prüfung „Text außerhalb eines Absatzes“. | Konvertierungs-Gegenprüfung (read-only) | Widerlegt für ungültig aufgebaute Dokumente, für zwei der drei Marken schon im Stand der ersten Übergabe; behoben in `a0d3e340`. |
| A-015 | „Nachname, Vorname“ einer bekannten Person ist immer dieselbe Person. | Nur bekannte volle Namen werden umgestellt gesucht. | Eine Aufzählung „Anna Müller, Hans Müller“ enthält dieselbe Zeichenfolge über die Kommagrenze. | eigene Probe, Faktencheck, Differenzlauf | Widerlegt; `3e4a1be1`. Meine Tests hatten nur den Namen allein und in einer Tabellenzelle geprüft. |
| A-016 | Ein Link mit Personenname lässt sich gefahrlos als Ganzes ersetzen, wenn die Ersetzung jeden anderen Treffer schlägt. | Der Name verschwindet sicher. | Der Linkausdruck trifft auch die Domain hinter dem @ einer E-Mail-Adresse; Treffer, die über den Link hinausreichen, werden ganz verworfen. | zweite Gegenprüfung (read-only) mit Beispielen | Widerlegt; Ansatz in `e07ca2e6` aufgegeben. Ersetzt wird nur der Namensteil, mit dem Rang jedes anderen Namenstreffers. |
| A-017 | Zusätzliche Schreibweisen dürfen wie alle Wörterbuchwerte an die Restprüfung gehen. | Mehr Werte, mehr Sicherheit. | Eine Schreibweise, die die Personenprüfung gerade als offenen Hinweis hält, wird dann zum harten Rest und stoppt das Dokument. | zweite Gegenprüfung (read-only) | Widerlegt; die zusätzlichen Schreibweisen bleiben seit `e07ca2e6` Sache der Ersetzung. |
| A-018 | Hinter einem Zugangsdaten-Label darf der Wert bis zum Zeilen- oder Satzende reichen. | So arbeitet die Regel am Zeilenanfang. | Mitten in der Zeile folgt oft gewöhnlicher Text mit Namen und Titeln; ein Wert darüber verdrängt andere Treffer und verdeckt Hinweise für die Personenerkennung. | erste und zweite Gegenprüfung (read-only) | Widerlegt; der Wert ist ein Wort. |
| A-019 | Am Ende des Kerndurchlaufs sind alle Personen ersetzt. | Der Kern ersetzt bekannte und erkannte Namen. | Noch unbekannte Namen werden erst im gemeinsamen Prüfablauf über offene Personenhinweise ersetzt. | dritte Gegenprüfung (read-only) | Widerlegt; die Regel sitzt jetzt hinter dem Kern und lässt offene Befunde unberührt. |
| A-020 | Ein zusätzlicher Platzhalter an einer Stelle ohne Befund stört nichts. | Er ersetzt nur Klartext. | Die Rückführung offener Personenhinweise auf den Ursprungstext vergleicht Textstücke zwischen Platzhaltern; ein Platzhalter mehr kann ein Stück mehrdeutig machen. | vierte Gegenprüfung (read-only) | Widerlegt; die Ersetzung bleibt nur bei unveränderter Prüfung. |
| A-014 | Die Änderungen der zweiten Runde verlangsamen den Datenschutzkern nicht messbar. | Zusätzliche Muster sind linear. | Die Linkprüfung läuft je Link und je Person. | Vorher-nachher-Messung an drei Texten | Bestätigt für 109 KB und 328 KB Prosa sowie einen bewusst ungünstigen Text; der Kern skaliert unabhängig davon überlinear. |

## Plan vor der Umsetzung

Festgehalten vor der ersten Produktänderung. Reihenfolge nach Auftrag:
Datenschutz und Datenverlust zuerst.

| Reihenfolge | Befund-IDs | Ziel und relevante Invarianten | Geänderte Pfade | Verifikation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | R-001 | Genitivformen bekannter Personen werden ersetzt und von der Restprüfung erkannt; Organisationen und andere Wörter unverändert. | `srv/privacy/engine.js`, Test | neuer Test am Kernel, Golden-Tests, Policy-Fingerprint | umgesetzt |
| 2 | R-002 | Wiederholte Telefonnummern werden ersetzt; Label-Regel für Einzelvorkommen bleibt. | `srv/privacy/structured.js`, Test | neuer Test, Golden-Tests | umgesetzt |
| 3 | R-003 | Geschützter Bindestrich und positionierter Tabulator bleiben erhalten. | `srv/ooxml.js`, Test | neuer Test über `extractMarkdownBuffer`, DOCX-Tests | umgesetzt |
| 4 | R-005 | Überschriften über den Vorlagennamen erkennen. | `srv/ooxml.js`, Test | neuer Test, DOCX-Tests | umgesetzt |
| 5 | R-004 | Format 14 und 22 eindeutig ausgeben. | `srv/xlsx-number-format.js`, Tests | XLSX-Tests | umgesetzt |
| 6 | R-008, R-009, R-020 (Label) | Meldungen sichtbar und zutreffend. | `app/frontend/*` | Frontend-Tests | umgesetzt |
| 7 | R-007, R-016, R-021 | Dokumente an den Iststand angleichen. | CLAUDE.md, Vertrag, Backlog, Hinweise | `npm run test:docs` | umgesetzt |
| 8 | alle | Gesamtverifikation und Bericht. | `tasks/rc178-claude-review/*` | Headless, Docs, `git diff --check`, Plugin-Gates | umgesetzt |

### Plan der zweiten Runde

Festgehalten vor den Änderungen der zweiten Runde. Reihenfolge wieder:
Datenschutz und Datenverlust zuerst, dann Betrieb, dann Darstellung.

| Reihenfolge | Befund-IDs | Ziel und relevante Invarianten | Geänderte Pfade | Verifikation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | R-024, R-017 | Zeiträume bleiben stehen; weitere Schreibweisen bekannter Personen werden ersetzt und von der Restprüfung gleich erkannt; keine neue Erkennung unbekannter Personen. | `srv/privacy/structured.js`, `srv/privacy/engine.js`, Sicherheitsmodell | neue Tests, Golden-Tests, Laufzeitvergleich | umgesetzt, Rest dokumentiert |
| 2 | R-010 | Verwaiste Vorbereitungen verschwinden; eine laufende Veröffentlichung wird nie berührt. | `srv/standalone/markdown-retention.js` | Retention-Tests | umgesetzt |
| 3 | R-011 bis R-014 | Export scheitert nicht an abgeschlossenen Datensätzen; Ursache eines Exportfehlers ist diagnostizierbar; Protokoll läuft nicht voll; die native Grenze prüft, was der Core prüft. Kein Pfad und kein Inhalt in der Diagnose. | fünf Dateien unter `app/tauri-contract/src/`, `app/frontend/document-review.js` | `cargo test`, Clippy, Paketlauf (Windows) | umgesetzt; macOS offen |
| 4 | R-018, R-003 | Kein stiller Verlust: Abweichung wird als Hinweis sichtbar, Symbole bleiben als Zeichen oder Marker. | `srv/document-parser.js`, `srv/core/csv-table-shape.js`, `srv/standalone/markdown-extractor.js`, `srv/ooxml.js` | Extraktor-, CSV- und DOCX-Tests | umgesetzt |
| 5 | R-020, R-025, R-019 | Texte in Einzahl, Hinweise handlungsleitend, Felder erkennbar; der Vertrag prüft die geladene Oberfläche. | `app/frontend/*`, Tests | Frontend-Tests, nativer Lauf | umgesetzt, Rest offen |
| 6 | R-016, R-023, R-004, R-015, R-021 | Lizenzangabe, lokale Abhängigkeitsprüfung und Dokumente entsprechen dem Iststand. | `scripts/*`, `docs/*` | Paketprüfung, `npm run test:docs` | umgesetzt |
| 7 | alle | Unabhängige Gegenprüfung, Nachbesserung, Gesamtverifikation, Bericht. | `tasks/rc178-claude-review/*` | Headless, Konverter, Rust, Paket, nativer Lauf | umgesetzt |
