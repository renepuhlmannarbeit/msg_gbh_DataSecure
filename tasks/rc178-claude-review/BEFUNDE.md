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
| R-003 | hoch | Formatqualität DOCX, alle | `w:noBreakHyphen`, `w:ptab`, `w:sym` und der Zustand alter Formular-Kontrollkästchen werden ohne Hinweis verworfen („Müller‑Schmidt“ → „MüllerSchmidt“, „2019‑2024“ → „20192024“). | BL-049.2, DS-085 | behoben (`14c12ee1`, `0d9e115c`, `a0d3e340`); Zustand alter Formular-Kontrollkästchen offen: der Versuch `39f2b3aa` verhinderte die Erkennung eines Namens hinter dem Kästchen und ist in `22c34dcb` zurückgenommen |
| R-004 | hoch | Formatqualität XLSX, alle | Das Standard-Datumsformat 14 erscheint als `mm-dd-yy`, Zahlen mit US-Trennzeichen; `03-05-23` und `1,234` sind für deutsche Leser mehrdeutig. | BL-049.2, DS-085 | teilweise behoben (`7f7f4d6f`); feste Zahlenschreibweise in der Formatmatrix dokumentiert (`2e34d532`), Umstellung bleibt Produktentscheidung |
| R-005 | hoch | Formatqualität DOCX, alle | Überschriften werden nur über die englische Formatvorlagen-ID erkannt, nicht über den Vorlagennamen; lokalisierte IDs verlieren die Gliederung. | BL-049.2 | behoben (`c79f3aa4`), nur an synthetischen Fixtures gezeigt |
| R-006 | hoch | Formatqualität DOCX, alle | Jede Word-Liste und jede nummerierte Überschrift wird als zwei einzellige Tabellen ausgegeben. | BL-049.2 | offen, bewusst nicht geändert (siehe Einzelbefund) |
| R-007 | hoch | Dokumentation | CLAUDE.md, Vertrag und Kanon nennen den Batchrunner seriell; ausgeliefert ist eine zweispurige Konvertervorbereitung auf Windows x64 und macOS. | BL-047.5, DS-047 | behoben (`8e18e44d`) |
| R-008 | mittel | Oberfläche, alle | Der Hinweis „Entscheidung nicht bestätigt“ wird in der eingebetteten Prüfung in ein ausgeblendetes Element geschrieben. | BL-010.53 | behoben (`c62bb1dd`) |
| R-009 | mittel | Oberfläche, alle | Fünf Meldungen nennen Bedienelemente mit Namen, die es in der Oberfläche nicht gibt. | BL-010.53 | behoben (`c62bb1dd`) |
| R-010 | mittel | Betrieb, alle | Nach hartem Abbruch bleibt ein `.pending-dm_*`-Ordner mit nicht anonymisiertem Markdown dauerhaft im privaten Bereich. | BL-050.6 | behoben (`97a70cd0`, `f8c69fe3`, Tests in `7693e162`) |
| R-011 | mittel bis hoch | Rust-Shell, alle | Die private Exportwurzel füllt sich mit vier Einträgen je Vorgang ohne Bereinigung; nach etwa 512 Exporten scheitert jeder weitere. | BL-050.6 | teilweise behoben (`5f8bf47b`, `3b8fbba9`): Grenze von rund 512 auf rund 16 000 Exporte je Zielordner angehoben; abgeschlossene Datensätze werden weiterhin nie aufgeräumt (die Hülle enthält bewusst keinen Löschcode; Entscheidung). Nur Windows-Tests |
| R-012 | mittel | Rust-Shell, alle | Voller Datenträger, entferntes Ziel und verweigerter Zugriff werden alle als „Konflikt“ gemeldet, ohne Diagnoseereignis. | BL-050.6 | teilweise behoben (`8c0dd30b`): Diagnoseursache und Hinweistext; öffentlicher Code bleibt „Konflikt“ |
| R-013 | mittel | Rust-Shell, alle | Der Diagnose-Sink verstummt nach 16 MiB je Sitzung, und das Diagnosepaket bricht ab 129 Einträgen im Ordner ab. | BL-050.6 | teilweise behoben (`b30a6dbc`, `1fb7eaee`, `49add216`, `b755e208`): das Diagnosepaket listet bis zu 2 048 statt 128 Einträge; alte Protokolle werden weiterhin nie gelöscht (Grundsatz des Diagnosemoduls; Entscheidung) |
| R-014 | mittel | Rust-Shell, alle | Nativ nicht vorgeprüfte Argumente der Nachbearbeitung beenden den Core statt abgelehnt zu werden. | BL-050.6 | behoben (`aef66f19`, `22688d75`) für alles, was die geladene Oberfläche sendet; nur Windows-Tests |
| R-015 | hoch | Release-Nachweis | `main` enthält den RC178-Quellstand nicht, und das Windows-Paket hat keinen unabhängigen Lauf. | Freigabeentscheidung | offen; Sachstand in `docs/RELEASE.md` festgehalten (`2e34d532`) |
| R-016 | mittel | Lieferkette | Die paketierten Drittanbieterhinweise nennen `emf-converter` nicht und beschreiben die macOS-Laufzeit unzutreffend. | BL-050.6 | behoben (`03c621a4`, `871daa7f`) |
| R-017 | mittel | Anonymisierung, alle | Drei weitere Unterredaktionsmuster: Einzelnachname in Folgedokumenten, Name im Linkziel, „Nachname, Vorname“. | BL-050.6, BL-021.1 | teilweise behoben (`cfee417a`, `ac74cf71`, nachgebessert in `3e4a1be1`, `d4740dd6`, `e07ca2e6`); einzelner Nachname ohne Personenkontext im Folgedokument bleibt dokumentierte Grenze |
| R-018 | mittel | Formatqualität CSV, alle | Eine einzelne Zeile abweichender Breite lässt die Trennzeichenerkennung still auf eine Spalte fallen, mit Abdeckung „vollständig“. | BL-049.2 | behoben (`803acbb9`, Hinweistexte in `2726675a`) |
| R-019 | mittel | Tests und Orakel | Mehrere Standalone-Tests prüfen die nicht mehr geladene Oberfläche `app.js` oder nur Quelltext per Muster. | BL-050.6 | behoben (`7e9e0530`, `1d908311`): Vertrag an die geladene Oberfläche gebunden; die frühere Oberfläche und ihre Tests sind auf Entscheidung des Anwenders entfernt; neun bis dahin ungeprüfte Verhalten der geladenen Oberfläche haben seit `3b85e395` einen Test |
| R-020 | mittel bis niedrig | Accessibility, alle | Sammelbefund: Live-Regionen per `hidden`, Rahmenkontrast 1,46:1, fehlender Seitenzoom, Fokusverlust, ARIA-Mängel. | BL-010.53 | teilweise behoben (`c62bb1dd`, `2726675a`, `405eb370`): Seitenzoom unter Windows; offen sind Seitenzoom unter macOS und Linux (Entscheidung), versteckte Live-Regionen (nur mit Screenreader prüfbar) und Bidi-Steuerzeichen (bewusst nicht geändert) |
| R-021 | niedrig | Dokumentation | Sammelbefund Dokumentationsdrift (Startanleitung, Register, Traceability, Testzahlen). | BL-050.6 | behoben (`e1afef0f`, `2e34d532`) |
| R-022 | mittel | Plattform macOS | Vier Annahmen, die nur ein Zielgerät klären kann. | BL-050.6 | Hypothese |
| R-023 | mittel | Lieferkette | Keine Schwachstellenprüfung der ausgelieferten Abhängigkeiten; Repository öffentlich ohne Tag- und Release-Schutz. | Freigabeentscheidung | teilweise behoben (`6a90ed16`, `52dee47c`, `fc10973e`, `927fb3bd`): lokale Prüfung der paketierten JavaScript-Abhängigkeiten und der Rust-Crates; zwei gemeldete Schwachstellen (`url`, `cookie`) angehoben; zehn Hinweise auf nicht gepflegte oder als unsound gemeldete Crates bleiben; Repository-Einstellungen offen |
| R-024 | mittel | Anonymisierung, alle | „im Zeitraum 2019-2024“ wird als Ort maskiert; mit geschütztem Bindestrich bleibt „‑2024“ stehen. Gefunden im nativen Windows-Lauf, am unveränderten RC178-Kern bestätigt. | BL-050.6 | behoben (`7b078d75`, Gegenfall im Test seit `7693e162`) |
| R-025 | niedrig | Oberfläche, alle | Zähltexte ohne Einzahl („1 technisch geprüfte anonymisierte Ergebnisse“, „1 Dateien · 1 Ergebnisse“). Im nativen Windows-Lauf beobachtet. | BL-010.53 | behoben (`2726675a`, `907efc14`, `8c452ac4`, `1126dc36`, `e66bab8f`) für die geladene Oberfläche, soweit drei Gegenprüfungen und ein Wächtertest Zähltexte gefunden haben. Die nicht mehr geladene alte Oberfläche `app.js` blieb dabei unverändert und ist seit `1d908311` entfernt |
| R-026 | hoch | Fachlichkeit; Anonymisierung; alle Ziele | In den Profilen Personalprofil, Bewerbung und Kunde stoppt ein Dokument mit `RESIDUAL_PII`, sobald ein Link den Namen der Person enthält. Ein Lebenslauf mit LinkedIn-Adresse lässt sich nicht automatisch anonymisieren. Gefunden im Differenzlauf gegen den RC178-Kern. | BL-050.6 | behoben (`d91462b9`) |
| R-027 | hoch | Anonymisierung; alle Ziele | Zugangsdaten werden nur als Feld am Zeilenanfang erkannt. „Zugang: Benutzer sepp, Passwort: Sommer2024! und PIN: 4711“ bleibt vollständig stehen. Gefunden im Differenzlauf; in RC178 und am Stand `ffab4fa7` gleich. | BL-050.6 | teilweise behoben (`283e6ed9`, `3ba2b8fb`): ein Wort hinter einem Label mitten in der Zeile wird ersetzt, ein Wert in Anführungszeichen ganz; mehrwortige Geheimnisse ohne Anführungszeichen und weitere Formen bleiben dokumentierte Grenze |
| R-028 | niedrig | Architektur und Betrieb; Windows | Die App startet nicht, solange ein fremder Prozess einen Ordner oberhalb ihres Datenordners mit Löschzugriff geöffnet hält. Die Meldung nennt keinen vorübergehenden Zustand. Im isolierten Testprofil beobachtet, rund sieben Minuten lang. | BL-010.11, BL-010.21 | behoben (`b71439b2`): eigene Ursache „belegt“, kurzes Warten, Wiederanlauf im selben Fenster; die Schutzgrenze ist unverändert, eine lange Belegung verhindert den Start weiterhin |
| R-029 | niedrig | Tests und Orakel; Windows | Die Startprobe scheitert an jedem beobachteten UDP-Endpunkt des WebView2-Netzwerkdienstes, weil sie dessen Profilordner ohne den Unterordner `EBWebView` vergleicht; aus demselben Grund wartet ihr Abbau nie auf WebView2. Die Diagnosezeile geht beim Abbruch verloren. | BL-010.21 | behoben (`dbf98cbf`) |
| R-030 | niedrig | Tests und Orakel; Windows | Das Messskript für Startzeit und Netzwerkbeobachtung bricht in der ersten Wiederholung ab: Es wertet die falsche Ausgabezeile aus, und eine Zeile der App auf dem Fehlerkanal beendet es. In der Gegenprüfung von R-029 gefunden. | BL-010.21 | behoben (`b11a6131`, `0b99529c`) |
| R-031 | mittel | Datenschutz und Sicherheitsgrenzen; Windows | Der WebView2-Netzwerkdienst der App fragt beim Start den Konfigurationsdienst von Edge ab und meldet sich danach alle 20 bis 40 Sekunden beim Komponenten-Updater von Microsoft; dazu kommt eine automatische Proxy-Suche. Sicherheitsmodell und Oberfläche beschreiben die App als lokal, ohne Internet und ohne Auto-Updater. Dokumentinhalte sind in den protokollierten Teilen nicht enthalten. Seit RC178 unverändert. | BL-010.11, BL-010.21 | behoben für das beobachtete Verhalten (`56d7c744`, Probe `1c3f36af`); die Schalter sind keine zugesicherte Schnittstelle von WebView2 |
| R-032 | mittel bis niedrig | Architektur und Betrieb; Oberfläche; Windows | Wer das Fenster während eines Laufs schließt, beendet die Verarbeitung nicht: Die Hülle endet, Arbeitsprozesse des Core laufen weiter und legen die Ergebnisse im Ergebnisordner ab. Die Oberfläche fragt nicht nach und sagt es nicht. Im nativen Lauf beobachtet (sechs Dateien, rund 75 s nach dem Schließen). | BL-010.14, BL-010.11 | behoben mit Grenzen (`5f670a20`, `2ce74b9f`, `d41a042b`, `34de4509`) nach Entscheidung des Anwenders: Rückfrage beim Schließen, Pausieren über die vorhandene Dateigrenzen-Pause. Beenden durch das Betriebssystem, Absturz und Arbeit, die die Oberfläche nicht als arbeitenden Lauf kennt, bleiben wie zuvor; macOS nicht geprüft. Die Rückfrage „Aufbewahrung 0 Tage“ ist im Standalone-Paket nicht erreichbar |
| R-033 | hoch | Anonymisierung; alle Ziele | Aus Word bleiben eine Telefonnummer hinter „Tel.“, ein Name hinter einem Titel, ein Geburtsdatum hinter „geb.“, ein Name hinter „z. Hd.“ und eine Kennung hinter „Personalnr.“ im freigegebenen Markdown stehen, weil die Umwandlung jeden Punkt als `\.` schreibt und diese Regeln das nicht lasen. Im nativen Lauf gefunden; in RC178 gleich. Dazu drei Erkennungslücken unabhängig vom Format (R-033b bis R-033d). | BL-050.6, BL-021.1 | teilweise behoben (`3ba2b8fb`, `1c8e971c`, `0bd5e26f`): maskierte Punkte und Klammern aus Word; Name hinter einer Rolle, Namensliste unter einem Label, `Rückruf unter`, derselbe Name an weiteren Stellen des Dokuments. Offen: voller Name in Prosa ohne Hinweisverb, einzelner Nachname, Telefonnummer ohne Label, Geburtsname. Der als Folge häufiger erreichte Stopp bei `Label Name Nummer` ist in `0bd5e26f` behoben |
| R-034 | niedrig | Oberfläche, alle | Die geladene Oberfläche erklärt vier Fehlercodes nicht, die der Core weiter liefert (`SOURCE_FOLDER_UNSUPPORTED_FILES`, `STANDALONE_NO_ADMISSION`, `BATCH_PSEUDONYM_CAPACITY_EXCEEDED`, `STANDALONE_RESULT_BINDING_UNAVAILABLE`), und zeigt dafür einen allgemeinen Satz. Erklärt hat sie nur die frühere Oberfläche; der Vertragstest prüfte dort und bestand. Beim Umbinden des Tests gefunden; in RC178 gleich. | BL-050.6 | behoben (`8cf5dd93`) |
| R-035 | mittel | Oberfläche, alle | Wählt der Anwender einen Ergebnisordner auf einem Netzlaufwerk, zeigt die geladene Oberfläche den zugesicherten Hinweis nicht; der Core liefert ihn, kein geladenes Skript liest ihn. Den Hinweis hatte nur die frühere Oberfläche. Beim Einzelabgleich der entfallenen Tests gefunden; in RC178 gleich. | BL-002, BL-040.5 (DS-080) | behoben (`d474a579`) für den Fall, den der Core erkennt; ein zugeordneter Laufwerksbuchstabe und ein Mount unter `/Volumes` gelten dem Core nicht als Netzlaufwerk (vorbestehend; nach Entscheidung des Anwenders vorerst belassen). In Standalone unter Windows ist der Hinweis nicht erreichbar, siehe R-038 |
| R-036 | niedrig bis mittel | Oberfläche, alle | Die geladene Oberfläche verwirft die Details eines Fehlers und hat für fünf Codes keinen eigenen Text (`SOURCE_SELECTION_REJECTED`, `SOURCE_ARTIFACT_IGNORED`, `MARKDOWN_CONVERSION_NOT_READY`, `STANDALONE_DROP_MIXED`, `SOURCE_SNAPSHOT_CHANGED`). Bei einer abgelehnten Auswahl erfährt der Anwender nicht, welche Datei der Grund ist. Beim Einzelabgleich gefunden; in RC178 gleich. | BL-010.46 | behoben (`d474a579`, `6e10ac80`); für eine Office-Sperrdatei nativ beobachtet |
| R-037 | niedrig | Tests und Orakel, alle | Drei Testhelfer fragen den Ergebnisordner direkt nach dem gemeldeten Laufende ab und lassen als Antwort nur „fehlt noch“ und „Veröffentlichung läuft noch“ zu. Der Arbeitsprozess nimmt die Sperre der Dokumentkontrolle kurz nach dem gemeldeten Ende noch einmal für rund 50 ms; trifft die Abfrage diese Zeit, antwortet der Core wie vorgesehen `STANDALONE_BUSY`, und die Suite bricht ab. Am 27.11. abends nachgestellt (drei von drei Durchgängen, wenn die Abfrage direkt beim gemeldeten Ende kommt). Core und Test sind seit RC178 unverändert. | BL-050.6 | behoben in `e89069eb` (nur Testcode): Die drei Helfer lassen `STANDALONE_BUSY` zu und bleiben an ihre Frist gebunden |
| R-038 | mittel | Fachlichkeit und Plattform, Standalone Windows (Core-Teil auch Cowork) | Ein Ergebnisordner im Netzwerk wird abgelehnt, obwohl `PRODUCT.md` ihn ausdrücklich erlaubt: über den UNC-Pfad von der Hülle (sie lässt nur Laufwerksbuchstaben zu), über einen zugeordneten Laufwerksbuchstaben vom Core (Windows löst ihn zum UNC-Namen auf). Die Meldung nennt den Grund nicht; der Hinweis aus R-035 ist in Standalone unter Windows nicht erreichbar. Nativ beobachtet; in RC178 gleich. | BL-002, BL-040.5 (DS-080) | Ablehnung bleibt nach Entscheidung des Anwenders; Meldung nennt die mögliche Ursache und Produktaussage für Standalone unter Windows eingeschränkt (`8a167b09`). Netzordner zu unterstützen bleibt offen |
| R-039 | hoch | Nebenläufigkeit und Betrieb; Standalone, nativ unter Windows beobachtet (Core, dem Code nach alle Ziele) | Öffnet der Anwender im Verlauf den Ergebnisordner eines fertigen Laufs, während ein anderer Lauf arbeitet, kann die Sperre der Dokumentkontrolle hängen bleiben: Die Abfrage nimmt die Sperre, kann sie nach 185 ms vergeblicher Versuche nicht freigeben und lässt sie stehen. Danach antworten jede weitere Abfrage und auch „Fortsetzen“ mit „Ein lokaler Vorgang ist bereits aktiv. Bitte warten.“, und der laufende Stapel bleibt stehen (im ersten Versuch bei 65 von 80 Dateien). Erst ein Neustart der App löst die Sperre. Zweimal in zwei Versuchen beobachtet, beim vierten und beim zehnten Klick. Kein Datenverlust, Originale unverändert. In RC178 ist der Code derselbe. | BL-010.13 (DS-086), BL-050.6 | behoben in `8ff4979a`: Die Freigabe wartet rund zwei Sekunden und fragt danach mit derselben Berechtigung bis zu zehn Minuten weiter; in der echten App nachgeprüft. Offen bleiben die Stapelsperre gleicher Bauart und „Bitte warten“ beim gewöhnlichen Wettbewerb |

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
  Runde an den Zähltexten der Ergebnisübersicht behoben. Die übrigen
  Zähltexte der geladenen Oberfläche folgten in der Nacharbeit (Abschnitt
  „R-025 · Abschluss“).

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
  - **Status** – Behoben in `b71439b2`, ohne die Freigabe zu ändern; siehe
    „R-028 bis R-030 · Umsetzung, Gegenprüfung und nativer Nachweis“.
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
  - **Status** – Behoben in `dbf98cbf`. Die Ursache war kein Zeitverhalten,
    sondern ein fester Vergleichsfehler; siehe „R-028 bis R-030 ·
    Umsetzung, Gegenprüfung und nativer Nachweis“. Die Angabe „dreimal
    beobachtet“ oben ist der Stand vor der Ursachensuche.
- **R-025, Rest** – In der geführten Prüfung stehen weitere Zähltexte ohne
  Einzahl: „1 Zeilen vorgemerkt“, „Noch 1 Fundstellen offen“, „Alle 1
  Fundstellen sind vorgemerkt“, „Nur diese Seite auswählen (1 Zeilen)“
  (`frontend/review.js:293, 313, 473, 506-507, 551`). Im nativen Lauf mit
  einer Fundstelle beobachtet; damals nicht geändert, behoben in der
  Nacharbeit (`907efc14`, `8c452ac4`).

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

## R-028 bis R-030 · Umsetzung, Gegenprüfung und nativer Nachweis

Auftrag des Anwenders vom 24.11.2026: R-028 und R-029 beheben und
revalidieren. R-030 hat die Gegenprüfung von R-029 gefunden; es betrifft das
dokumentierte Werkzeug für genau diese Messung und ist deshalb mit behoben.
Die Hauptsession hat alle Änderungen selbst vorgenommen; zwei unabhängige
Read-only-Prüfer hatten den Auftrag, sie zu widerlegen.

### R-029 · Ursache und Korrektur

- **Ursache** – Eine instrumentierte Kopie der Probe hat bei jedem Abbruch
  dieselben Merkmale festgehalten: Besitzer des UDP-Endpunkts ist der
  Netzwerkdienst von WebView2 (`--type=utility`,
  `network.mojom.NetworkService`), gültig von Microsoft signiert, mit
  `--user-data-dir=<Testprofil>\webview\main\EBWebView`. Die Probe verglich
  dieses Argument auf exakte Gleichheit mit `<Testprofil>\webview\main`, dem
  Wert von `WEBVIEW2_USER_DATA_FOLDER`. WebView2 arbeitet aber immer im
  Unterordner `EBWebView`. Die Zuordnung konnte deshalb nie gelingen; die
  Probe scheiterte genau dann, wenn eine ihrer Stichproben den Endpunkt
  erwischte. Mit der alten Probe waren das 8 von 11 Läufen, alle mit
  demselben Merkmal `own_profile: false`.
- **Zweite Folge derselben Ursache** – `Wait-NativeWebViewProfileExit`
  nutzte denselben Vergleich und fand deshalb nie einen Prozess. Der Abbau
  hat also nie auf WebView2 gewartet; die in
  `docs/canonical/TRACEABILITY.md` genannte „exakte Profilquieszenz vor
  Cleanup“ war nicht wirksam.
- **Verlorene Diagnosezeile** – wie gemeldet: Ausgabe einer Funktion, deren
  Ergebnis der Aufrufer zuweist, geht beim `throw` verloren.
- **Korrektur** (`dbf98cbf`, `tests/manual/standalone-native-windows-launch.ps1`)
  - Eine Regel `Test-NativeWebViewOwnProfile` für Beobachtung und Abbau:
    eigenes Profil ist genau der vorgegebene Ordner oder sein Unterordner
    `EBWebView`. Geschwister, tiefere Pfade und fremde Profile gelten nicht.
  - Die Ursache eines nicht zuordenbaren Endpunkts wird an allen drei
    Abbruchstellen festgehalten (`owner_changed`, `owner_rejected`,
    `classification`) und im äußeren `finally` ausgegeben. Sie enthält nur
    Wahrheitswerte und den Signaturstatus.
  - `udp_processes` im Evidenzsatz ist immer eine Liste. Vorher war es `{}`
    ohne und eine bloße Zeichenkette mit einem Prozess.
  - Der Abbau gibt seine tatsächliche Wartezeit gegen das feste Budget von
    20 Sekunden aus.
  - Tests: zehn weitere Gruppen im Vertragsmodus (jetzt 55), ein
    Quelltextvertrag, die Ausgabe der Ursache im echten `finally`-Block und
    ein Verhaltenstest des Abbaus mit sechs erfundenen Prozesslisten.
    `docs/TESTING.md` nennt Regel und neue Zeilen.
- **Nachweis** – 14 von 14 Läufen der Endfassung gegen das Paket
  `cec20d6e…` bestehen, 4 davon mit einem zugeordneten Endpunkt
  (`udp_endpoints: 1`, `["msedgewebview2.exe"]`). Die Abbau-Wartezeit lag
  zwischen 138 und 273 ms. Die Messung über zehn Starts (R-030) besteht mit
  0 TCP-Listenern.
- **Was die Beobachtung sagt und was nicht** – Gemessen ist: Der
  WebView2-Netzwerkdienst hält während des Starts kurz einen UDP-Endpunkt an
  der Adresse `::` mit einem flüchtigen Port. Er trat je Serie in 0 von 10
  bis 7 von 10 Läufen auf. Ob darüber ein Paket gesendet wird, ist nicht
  gemessen. Das Repository setzt für WebView2 keine Browserargumente und
  keinen Proxy (`tauri-contract/tauri.conf.json`, das Prüffenster in
  `main.rs`); die CSP begrenzt nur Seitenanfragen, `network-deny.cjs` gilt
  nur für den Node-Core. Die Probe wertet den Endpunkt wie vorgesehen als
  Plattformbefund, nicht als DataSecure-Zugriff.
- **Ältere Einträge** – `docs/canonical/CURRENT_STATE.md` und
  `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md` nennen für RC158 einen Lauf mit
  demselben Abbruchcode und „keine UDP-Endpunkte im Messfenster“. Diese
  Sätze beschreiben damalige Läufe und sind nicht geändert. Wahrscheinlich
  hatte der damalige Abbruch dieselbe Ursache; rückwirkend belegen lässt
  sich das nicht.

### R-030 · Das Messskript konnte seine eigene Probe nicht auswerten

- **Ort** – `tests/manual/measure-standalone-native-windows.ps1:29-33`
  (Stand `e92d5b12`).
- **Ist** – Zwei Fehler, jeder für sich bricht die Messung in der ersten
  Wiederholung ab:
  1. Der Filter `'STANDALONE NATIVE EVIDENCE *'` trifft auch die Zeile
     `STANDALONE NATIVE EVIDENCE RETAINED: <Pfad>`, die die Probe seit RC177
     danach ausgibt. `Select-Object -Last 1` wählt also diese Zeile, und sie
     ist kein JSON.
  2. Die gestartete App erbt den Fehlerkanal. Unter `ErrorActionPreference
     Stop` macht Windows PowerShell aus jeder dort erscheinenden Zeile einen
     abbrechenden Fehler. WebView2 schreibt beim Schließen „Failed to
     unregister class Chrome_WidgetWin_0“.
- **Reproduktion** – Fehler 1 mit den drei Ausgabezeilen der Probe als
  Eingabe des Filters (alter Filter liefert die RETAINED-Zeile). Fehler 2 im
  echten Lauf gegen das Paket `cec20d6e…`: Abbruch in Wiederholung 1 mit
  `NativeCommandError`, obwohl die Probe bestanden hatte.
- **Soll** – Die in `docs/TESTING.md` beschriebene Messung läuft durch.
- **Auswirkung** – Die dokumentierten Evidenzläufe (30 Starts, 10 Starts
  mit Netzwerkbeobachtung) ließen sich auf diesem Host nicht erzeugen. Ob
  Fehler 2 auf jedem Host auftritt, ist nicht belegt.
- **Korrektur** – `b11a6131` (nur die JSON-Zeile; `observed_udp_processes`
  immer als Liste) und `0b99529c` (Ausgabe als Text bei für diesen einen
  Aufruf gesenkter Fehlerbehandlung; der Exitcode bleibt das Urteil). Ein
  Node-Test führt Filter und Aufruf des Skripts unter Windows PowerShell mit
  der echten Zeilenfolge und einem Kind aus, das auf den Fehlerkanal
  schreibt.
- **Nachweis** – Zehn von zehn Starts, p50 1 993 ms, p95 2 015 ms,
  0 TCP-Listener, in dieser Serie kein UDP-Endpunkt.

### R-028 · Umsetzung

- **Ursache jetzt gezielt nachgestellt** – Ein Hilfsprozess öffnet einen
  Ordner der Kette mit Löschzugriff und voller Freigabe, so wie es ein
  Sicherungs- oder Aufräumprogramm tut. Das Paket `b30c5511…` (Stand
  `ebe526ec`) zeigt dann genau die am 24.11. beobachtete Meldung
  `STANDALONE_DATA_ROOT_UNSAFE`; der Datenordner wird nicht angelegt. Nach
  Freigabe genügt dort schon **Verbindung und Laufstatus prüfen**. Der
  Wiederanlauf im selben Fenster war also vorhanden; falsch war die genannte
  Ursache und der Rat, die Installation mit der IT zu prüfen.
- **Korrektur** (`b71439b2`)
  - `private_namespace.rs`: Ein Freigabekonflikt (Betriebssystemfehler 32)
    gilt als Belegung. Das erste Öffnen der Kette bis zum Ordner über dem
    Datenordner und das Öffnen eines schon vorhandenen Datenordners werden
    zusammen höchstens 19-mal im Abstand von 100 ms wiederholt. Nach dem
    Anlegen eines neuen Datenordners wird nichts wiederholt. Freigabe und
    Zugriffsrechte sind unverändert.
  - `main.rs`: Die vier Stellen vor dem Start des Core melden eine Belegung
    als `STANDALONE_DATA_ROOT_BUSY`, alles andere weiter als
    `STANDALONE_DATA_ROOT_UNSAFE`. Ein solcher Versuch gibt seine
    Startgeneration zurück und zählt nicht gegen die Grenze von 16.
  - `frontend/workspace.js`: eigener Meldungstext und eigener Statustext;
    der Code wird wie jede Startverweigerung gehalten, es gibt keine
    automatischen Wiederholungen.
  - `docs/canonical/STANDALONE_SECURITY_MODEL.md`: neuer Abschnitt.
- **Tests** – sieben Rust-Tests (anhaltende Belegung von Elternordner und
  Vorfahr, kurze Belegung vor dem Anlegen, anhaltende und kurze Belegung
  eines vorhandenen Datenordners, Abgrenzung zu Verknüpfung und fehlendem
  Ordner, Zuordnung der Codes, Rückgabe der Generation), ein
  Quelltextvertrag für die vier Stellen, drei Oberflächentests.
  Mutationsprobe am Endstand: acht gezielte Verfälschungen der Rust-Änderung, jede
  wird von mindestens einem der neuen Tests erkannt.
- **Nativer Nachweis** mit Paket `cec20d6e…`, Build `b4466f2a`
  - Ordner `profile` (Vorfahr des Datenordners) gehalten: Meldung
    `STANDALONE_DATA_ROOT_BUSY` mit dem neuen Text; Datenordner nicht
    angelegt.
  - 20 erneute Prüfungen bei weiter gehaltenem Ordner: jedes Mal dieselbe
    Meldung, kein `STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED`, weiterhin nichts
    angelegt. Die Diagnose zählt 21-mal `DATA_ROOT_BUSY` und enthält keinen
    Pfad und keinen Betriebssystemtext.
  - Nach Freigabe und einer weiteren Prüfung: „Lokale Verbindung
    wiederhergestellt“, Datenordner neu angelegt
    (`STANDALONE_NAMESPACE_CREATED`).
  - Vorhandener Datenordner selbst gehalten: `STANDALONE_DATA_ROOT_BUSY`;
    nach Freigabe und Prüfung wiederhergestellt
    (`STANDALONE_NAMESPACE_EXISTING_CANDIDATE`).
  - Sperre von rund einer Sekunde auf `profile\Local`: Die App startet ohne
    Meldung; zwischen Startbeginn des Core und gehaltenem Datenordner
    liegen 0,5 s.
  - Ohne Sperre: automatische Maskierung einer erfundenen Datei, ein
    Ergebnis mit Zuordnung, Original unverändert.
- **Geklärte Beobachtung, kein Befund** – In einem ersten Durchgang der 20
  Prüfungen hat sich das Fenster nach der elften geordnet beendet
  (`sidecar_shutdown ready`, kein Absturzeintrag). Die Shell beendet sich
  nur auf eine Schließanforderung an das Fenster; das Prüfskript sendet
  keine. Der Anwender hat auf Nachfrage bestätigt, dass er das Fenster
  selbst geschlossen hat. Die Wiederholung mit 20 Prüfungen lief ohne
  Beenden durch.

### Einwände der Gegenprüfung zu R-028 bis R-030

| Einwand | Ergebnis |
| --- | --- |
| Jeder Versuch bei belegtem Ordner verbraucht eine der 16 Startgenerationen. Nach 16 Prüfungen meldet die Shell „Versuche erschöpft“, die Oberfläche zeigt aber weiter den neuen Text, der einen Neustart für unnötig erklärt. | Berechtigt. Ein solcher Versuch gibt seine Generation zurück; nativ mit 20 Prüfungen belegt. |
| Gewartet wird nur beim Öffnen der Elternkette, nicht beim Öffnen eines vorhandenen Datenordners; das Dokument liest sich anders. | Berechtigt. Beide Öffnungen teilen sich jetzt ein Wartebudget; Dokument angepasst. |
| „Es wurde nichts verändert“ gilt streng nur für eine Belegung beim ersten Öffnen. | Text geändert in „keine Daten verändert oder gelöscht“. Solange die Shell die Kette hält, kann ein fremder Prozess sie nicht mehr mit Löschzugriff öffnen; ein Konflikt nach dem Anlegen ist deshalb nicht zu erwarten, aber nicht ausgeschlossen. |
| Die Meldungszeile in der alten Oberfläche (`app.js`) ist nicht erreichbar. | Zurückgenommen. |
| Drei der vier geänderten Stellen in `main.rs` könnten unbemerkt zurückgedreht werden. | Quelltextvertrag ergänzt. |
| Der Abbau der Probe wartet jetzt erstmals wirklich und kann die Probe an seinem 20-Sekunden-Budget scheitern lassen; die Reserve ist unbekannt. | Wartezeit wird ausgegeben; hier 0,1 bis 0,3 s. Auf langsameren Hosts und im Runner nicht gemessen. |
| Die Stufe `owner_unreadable` gilt auch für einen Besitzer, der gar kein WebView2-Prozess ist. | Umbenannt in `owner_rejected`. |
| Das Messskript wählt die falsche Zeile; seine Zusammenfassung hat dieselbe uneinheitliche Listenform. | R-030, behoben. |
| Die Zahl der Vertragsgruppen ist nicht festgeschrieben; der Abbau hat keinen Verhaltenstest. | Untergrenze 55 und Verhaltenstest ergänzt. |

Nicht widerlegt haben die Prüfer: dass der Wiederholungsversuch nichts
anlegt, übernimmt oder einen selbst angelegten Ordner erneut betrachtet;
dass der Fehlercode 32 auf jedem Weg bis zur Zuordnung erhalten bleibt; dass
kein Prüfer und keine geschlossene Codeliste den neuen Code verwirft; dass
keine Pfade oder Betriebssystemtexte in Diagnose oder IPC gelangen; dass die
erweiterte Profilregel nichts durchlässt, was scheitern muss (geprüft mit
Präfix-, Geschwister- und tieferen Pfaden, `..`, 8.3-Namen, Schreibweisen,
mehrfachem Argument).

### Grenzen der Korrekturen

- R-028 wartet höchstens rund zwei Sekunden. Eine längere Belegung, wie die
  am 24.11. beobachtete von rund sieben Minuten, führt weiter zur
  Startverweigerung, jetzt mit zutreffender Ursache und dem Weg zurück.
- Welcher Prozess den Temp-Ordner am 24.11. hielt, ist weiter unbekannt. Ob
  Sicherungs- oder Schutzprogramme auf Zielhosts
  `C:\Users\<Name>\AppData\Local` so öffnen, ist nicht belegt.
- Die Ergebnisbereitstellung meldet eine Belegung weiterhin als
  `STANDALONE_DATA_ROOT_UNSAFE`. Solange die Shell die Kette hält, kann dort
  kein neuer Halter mit Löschzugriff hinzukommen; nachgestellt wurde das
  nicht.
- Neben dem Freigabekonflikt bildet Windows zwei seltene weitere Zustände
  auf denselben Fehlercode ab (laut Gegenprüfung `0xC0000467` und
  `0xC0010020`). Sie würden ebenfalls als Belegung gemeldet; die App startet
  in keinem dieser Fälle.
- Der macOS-Zweig ist nicht betroffen (`private_namespace` gibt es nur für
  Windows) und nicht übersetzt worden.
- R-029: Die Probe prüft weiter nur Stichproben im Abstand von rund 100 ms.
  Ein Lauf ohne beobachteten Endpunkt belegt nicht, dass es keinen gab.
- R-029: Der Abbau ist jetzt wirksam. In `release-evidence.yml` und
  `scripts/run-pkg-04.ps1` läuft er damit ebenfalls zum ersten Mal wirklich;
  dort ist er nicht ausgeführt worden.

## R-031 · WebView2 baut im laufenden Betrieb Verbindungen zu Microsoft auf

Gemessen am 24.11.2026 auf Bitte des Anwenders, nachdem R-029 einen
UDP-Endpunkt des WebView2-Netzwerkdienstes sichtbar gemacht hatte. Dieser
Abschnitt beschreibt die Messung am unveränderten Paket; die Umsetzung
folgt darunter.

- **Ort**
  - `apps/datasecure-standalone/tauri-contract/tauri.conf.json`: Die Fenster
    setzen keine zusätzlichen Browserargumente. WebView2 startet mit den
    Standardschaltern von Tauri
    (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`). Die
    Datei ist seit RC178 unverändert.
  - `docs/canonical/STANDALONE_SECURITY_MODEL.md`: Standalone benötige kein
    Internet; es gebe keinen Auto-Updater.
  - `frontend/workspace.html`: Anzeige „Lokal · ohne Upload“ und „Nur lokal“.
  - `tests/manual/standalone-native-windows-launch.ps1`: prüft lauschende
    TCP-Sockets und UDP-Endpunkte, aber keine ausgehenden Verbindungen.
- **Reproduktion**
  - Scratch-Skript: Paket `cec20d6e…` im isolierten Testprofil starten und
    die Betriebssystemtabellen für TCP und UDP je Prozess rund alle 23 ms
    lesen, mit einer Positivkontrolle vor jedem Lauf. Zehn Minuten, darin ein
    Verarbeitungslauf.
  - Zweiter Lauf über 280 s mit dem Netzprotokoll von Chromium
    (`--log-net-log`, gesetzt über `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`;
    das Paket bleibt unverändert). Daraus stammen Hostnamen, Pfade und
    Mengen.
  - Host online mit IPv6, WebView2 158.0.4370.33, keine Adminrechte.
- **Ist**
  - Verbindungen hat nur der Netzwerkdienst von WebView2. Shell, Node-Core
    und die übrigen WebView2-Prozesse haben in zehn Minuten keine.
  - Beim Start zwei `GET https://config.edge.skype.com/config/v1/Edge/<Version>`.
    Die Adresse trägt eine Client-Kennung, Betriebssystem mit Version und
    Architektur, das Installationsdatum und weitere Merkmale. Antwort
    zusammen 23,9 KB.
  - Ab Sekunde 60 `POST https://edge.microsoft.com/componentupdater/api/v1/update`,
    danach alle 20 bis 40 Sekunden: 8 Anfragen in 280 s, zusammen 14,1 KB
    gesendet und 22,8 KB empfangen. In der Tabelle des Betriebssystems
    entspricht das HTTPS-Verbindungen zu Microsoft-Adressen bei 0,3 s,
    1,3 s, 60 s, 150 s und 220 s.
  - Beim Start die Namensauflösung `wpad`, also die automatische Suche nach
    einem Proxy im lokalen Netz. Dazu 15 DNS-Anfragen an den Resolver des
    Netzes.
  - UDP-Sockets, die auf eine Microsoft-Adresse mit Port 443 gerichtet
    werden, ohne ein gesendetes Paket (Prüfung der Erreichbarkeit). Zusammen
    mit den DNS-Sockets ist das der Endpunkt aus R-029.
  - Ein TCP-Versuch zu `localhost:80` beim Laden der App-Seite
    (`tauri.localhost`).
  - In den protokollierten Adressen und Kopfzeilen steht kein App-, Datei-
    oder Ordnername. Die Anfragekörper zeichnet das Protokoll in dieser
    Stufe nicht auf; ihr Inhalt ist nicht geprüft.
- **Soll** – Der Prozessbaum einer App, die „Lokal · ohne Upload“ anzeigt
  und laut Sicherheitsmodell kein Internet braucht und keinen Auto-Updater
  hat, baut keine Verbindungen nach außen auf. Andernfalls nennen Dokumente
  und Oberfläche den Plattformverkehr von WebView2.
- **Auswirkung**
  - Ein Abfluss von Dokumentinhalten ist nicht beobachtet.
  - Jeder Start und jede Betriebsminute zeigt Microsoft die IP-Adresse des
    Geräts, eine Client-Kennung von WebView2 und Systemmerkmale.
  - In Netzen, die Außenverkehr untersagen oder protokollieren, fällt die
    App auf, obwohl ihre Beschreibung das Gegenteil sagt.
  - Der Komponenten-Updater kann Bestandteile in das WebView2-Profil der App
    nachladen. In der Messung gab es nur Abfragen, keinen Download.
  - Die Proxy-Suche kann in einem fremden Netz beantwortet werden; betroffen
    wäre der oben genannte Verkehr.
- **Vorversuch zur Abhilfe** – nur über die Umgebungsvariable:
  - `--disable-background-networking --disable-component-update`: 100 s
    ohne eine Anfrage nach außen, App arbeitsbereit. Die Auflösung von
    `wpad` bleibt.
  - Zusätzlich `--no-proxy-server --disable-quic
    --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE tauri.localhost, EXCLUDE
    ipc.localhost"`: 150 s ohne Anfrage und ohne Namensauflösung; App
    arbeitsbereit, ein Verarbeitungslauf abgeschlossen. Es bleiben der
    UDP-Socket ohne gesendetes Paket und der Versuch zu `localhost:80`.
  - Im Produkt wären das die `additionalBrowserArgs` der Fenster. Tauri
    ersetzt damit seine eigenen Standardschalter; die drei oben genannten
    müssen deshalb mit hinein.
  - Die Schalter sind keine zugesicherte Schnittstelle von WebView2. Eine
    Aktualisierung der Laufzeit kann ihre Wirkung ändern. Dauerhaft trägt
    das nur mit einer Prüfung auf ausgehende Verbindungen in der Startprobe.
- **Grenzen der Messung**
  - Ein Host, eine WebView2-Version, zehn Minuten. Was nach Stunden oder
    nach einem tatsächlichen Komponenten-Update geschieht, ist nicht
    beobachtet.
  - UDP ist nur über das Netzprotokoll von Chromium belegt, nicht über einen
    Mitschnitt.
  - Welcher der drei zusätzlichen Schalter die Proxy-Suche abstellt, ist
    nicht einzeln getrennt.
  - Dass das veröffentlichte RC178-Paket sich gleich verhält, folgt aus der
    unveränderten Fensterkonfiguration und ist nicht gemessen.
  - macOS nutzt WKWebView und ist nicht untersucht.
- **Zuordnung** – BL-010.11 (Hülle und ihre Grenzen), BL-010.21
  (Zielhostnachweis der Startprobe).
- **Status** – umgesetzt, siehe folgender Abschnitt.

### R-031 · Umsetzung und Gegenprüfung

Auf Auftrag des Anwenders vom 24.11.2026 umgesetzt.

- **Produkt** (`56d7c744`)
  - Beide Fenster starten WebView2 mit denselben Schaltern:
    `--disable-background-networking --disable-component-update
    --no-proxy-server --disable-quic --host-resolver-rules="MAP * ~NOTFOUND,
    EXCLUDE tauri.localhost, EXCLUDE ipc.localhost"`, davor die
    Standardliste von wry (`--disable-features=…`), die ein eigener Wert
    sonst ersetzt.
  - Das Hauptfenster trägt die Zeichenkette in `tauri.conf.json`
    (`additionalBrowserArgs`), das Prüffenster die gleichlautende Konstante
    `WEBVIEW2_BROWSER_ARGS` in `main.rs`. Ein Test hält beide auf einem
    genauen Wert fest.
  - Der Autoplay-Schalter von wry entfällt dabei; die App spielt keine
    Medien ab.
  - `docs/canonical/STANDALONE_SECURITY_MODEL.md` beschreibt Schalter, Rest
    und Grenzen.
- **Startprobe** (`1c3f36af`)
  - `-AssertNoOutbound`: Ein Hintergrundthread liest ab dem Prozessstart die
    TCP-Tabellen des Betriebssystems für den Prozessbaum, bis 75 s nach der
    Bereitschaft. Der Komponenten-Updater einer uneingeschränkten WebView2
    meldet sich erstmals nach rund einer Minute.
  - Positivkontrolle vor jedem Lauf: eine eigene Verbindung über IPv4, eine
    über IPv6 und eine eines Kindprozesses. Nicht lesbare Tabellen werden
    gezählt und lassen den Lauf scheitern.
  - Jede beobachtete Verbindung außer dem Versuch von WebView2 zum eigenen
    lokalen Hostnamen endet mit
    `STANDALONE_NATIVE_NETWORK_OUTBOUND_DETECTED`, ohne Adresse in der
    Meldung.
  - Das Messskript reicht den Schalter und `-AssertReviewWindow` durch.
  - Nachtrag `e881cc9c`: Die IPv6-Kontrolle entfällt nur auf einem Host
    ohne IPv6; der Evidenzsatz nennt, ob sie lief.
- **Nachweis am Paket `1c672ef4…`, Build `9fe7076e`**
  - Messung mit drei Starts und `-AssertNoOutbound`: besteht, keine
    Verbindung.
  - Probe mit `-AssertNoOutbound`: Hauptfenster besteht (77 s, 3 165
    Stichproben, keine Verbindung), Prüffenster besteht (77 s, 2 477
    Stichproben, keine Verbindung).
  - Dieselbe Probe gegen das Paket des Vorstands (`cec20d6e…`) scheitert
    wie verlangt: WebView2, IPv6, Port 443.
  - Zehn Minuten Beobachtung der Betriebssystemtabellen mit einem
    Verarbeitungslauf: 20 814 Stichproben in 600 s, kein TCP- und kein UDP-Endpunkt im Prozessbaum.
  - Netzprotokoll von Chromium über 100 s: keine Anfrage nach außen; aufgelöst wird nur
    `tauri.localhost`; ein UDP-Socket ohne gesendetes Paket; ein Versuch zu
    `localhost:80`.
  - Bedienung: automatische Maskierung und eine geführte Prüfung mit der
    Entscheidung „Als Person ersetzen“ laufen durch; das Prüffenster
    öffnet sich.
- **Einwände der Gegenprüfung** (ein unabhängiger Read-only-Lauf vor dem
  Commit)

| Einwand | Ergebnis |
| --- | --- |
| Die Positivkontrolle prüft nur IPv4 am eigenen Prozess; ein Fehler im IPv6-Pfad oder im Prozessbaum bliebe ein stilles Bestehen. Fehler beim Lesen der Tabellen werden verschluckt. | Berechtigt. Kontrolle um IPv6 und einen Kindprozess erweitert; Lesefehler werden gezählt und lassen den Lauf scheitern. |
| Eine Umgebungsvariable des Hosts kann die Schalter verändern; die Probe entfernt sie und sieht das nicht. | Geprüft: WebView2 hängt `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` an die Schalter an. Im Sicherheitsmodell als Grenze genannt; das Produkt entfernt die Variable nicht. Bestand schon vor der Änderung. |
| Das dokumentierte Messkommando deckt das Prüffenster nicht ab. | Messskript reicht `-AssertReviewWindow` durch; Dokument nennt die Kombination; nativ ausgeführt. |
| Kurze Verbindungen zwischen zwei Stichproben entgehen der Probe; der Dokumenttext versprach „jede Verbindung“. | Text geändert in „jede beobachtete“, Grenze genannt. Die Verbindungen des Vorstands dauerten 30 bis 60 ms und länger und wurden erfasst. |
| Die Probe kann die Schalter nicht einzeln schützen, weil die Regel zur Namensauflösung allein den Dienst verstummen lässt. | Der Test hält die genaue Zeichenkette fest; im Dokument als Grenze genannt. |
| Der Kommentar nannte die Standardschalter von wry unvollständig (Autoplay). | Kommentar berichtigt. |

  Nicht widerlegt hat der Prüfer: Schreibweise und Wirkung der Schalter, dass
  ein eigener Wert die Standardschalter von wry ersetzt, Schema und Hosts
  (`tauri.localhost`, `ipc.localhost`), dass es kein weiteres Fenster gibt,
  die Tabellenlayouts und Offsets des Beobachters, und dass die Meldung
  keine Adresse trägt.
- **Grenzen**
  - Die Schalter sind keine zugesicherte Schnittstelle von WebView2. Eine
    neue Laufzeitversion kann ihre Wirkung ändern; dann schlägt die Probe
    an, sofern sie mit `-AssertNoOutbound` läuft. Der Release-Workflow ruft
    sie seit `0f35696e` so auf; ausgeführt wurde er nicht, auf dem gehosteten
    Runner ist der Schritt also unbelegt. `scripts/run-pkg-04.ps1` ruft die
    Probe seit `cebc39a0` ebenfalls mit dem Schalter auf; auch dieses Skript
    habe ich nicht ausgeführt.
  - Gemessen mit einer WebView2-Version auf einem Host. Was die Laufzeit
    außerhalb des Prozessbaums der App tut (eigener Aktualisierungsdienst),
    ist nicht untersucht.
  - UDP und fehlgeschlagene Namensauflösungen sieht die Probe nicht; dafür
    steht nur das einmalige Netzprotokoll.
  - Der Verbindungsversuch zu `localhost:80` bleibt. Lauscht dort ein
    fremdes Programm, kommt eine Verbindung zustande; ob darüber etwas
    gesendet wird, ist nicht geprüft.
  - Rechtschreibwörterbücher und andere nachladbare Bestandteile von
    WebView2 werden nicht mehr geholt. Eine Auswirkung auf die Oberfläche
    habe ich nicht gesehen, aber nicht gezielt gesucht.
  - Die Änderungen nach den Einwänden sind in der Gegenprüfung des
    Endstands erneut gelesen worden (nächster Abschnitt).

## Nacharbeit nach R-031 · Zähltexte, Startprobe, Schließen im Lauf

Am 24.11. hat der Anwender nach der Übergabe von `a1e4bc9b` beauftragt, mit
den offenen Punkten weiterzumachen, die sich hier erledigen lassen. Das sind
zehn Commits von `cebc39a0` bis `e66bab8f`. Drei unabhängige Gegenprüfungen
liefen dazwischen, auf `907efc14`, `7eefdcd4` und `4c98d621`; ihre Einwände
stehen am Ende des Abschnitts.

### R-025 · Abschluss

- **Vorher** – `2726675a` hatte die Ergebnisübersicht korrigiert. Die
  geführte Prüfung schrieb weiter „1 Zeilen vorgemerkt“, „Alle 1 Fundstellen
  sind vorgemerkt“ und „1 Prüfzeilen noch offen“.
- **Erster Teil, `907efc14`** – elf Texte in
  `apps/datasecure-standalone/frontend/review.js` über eine Hilfsfunktion
  `counted(wert, einzahl, mehrzahl)`.
- **Einwand der Gegenprüfung** – Außerhalb der geführten Prüfung gibt es
  weitere Texte derselben Art, und zwei Tests schreiben die falsche Form
  fest.
- **Zweiter Teil, `8c452ac4`** – alle Zähltexte in `workspace.js`,
  `document-review.js`, `workflow-presentation.js` und die übrigen in
  `review.js`. Beispiele vorher: „1 Dateien ausgewählt“, „0 von 1 Dateien
  abgeschlossen“, „1 Ergebnisse wurden sichtbar kopiert“, „one.png (1
  Werte)“, „1 technische Fehler“, „1 private Dokumentstände“, „1 Ergebnisdateien
  · Nachbearbeitung freiwillig“. Wo die Einzahl einen anderen Satzbau
  braucht, steht ein eigener Satz („Die Datei wurde als anonymisierter
  Markdown-Entwurf erstellt.“).
- **Einwand der zweiten Gegenprüfung** – Der zweite Teil hat selbst einen
  Fehler erzeugt und rund fünfzehn Texte übersehen:
  - Aus „0 von 1 Dateien sind im geschützten Zwischenbereich gespeichert“
    wurde „0 von 1 Datei sind …“ (`document-review.js`, Fortschritt des
    Exports). Erreichbar beim Export einer einzelnen Datei.
  - Übersehen: „1 Quelldateien“, „1 Dokumentprüfstände nicht verfügbar“,
    „1 gespeicherte Ergebnisstände“, „1 frühere zusätzliche Kopien mit
    Beleg“, „1 unvollständige Exportaufträge“, „seit 1 Sekunden“, „1 von 1
    ausgewählten Dokumentständen wurden …“, „Nur 1 ausgewählte
    Markdown-Textstände werden …“, „1 erkannte E-Mail-/Telefonwerte …,
    keine 1 Konvertierungsfehler“.
  - Mein Wächter kannte diese Hauptwörter nicht und ließ jede Stelle
    durch, in deren Nähe irgendeine Entscheidung über die Zahl 1 stand.
- **Dritter Teil, `1126dc36`** – die Verbform folgt der einzelnen Datei; die
  genannten Texte haben ihre Einzahl, wo nötig als eigener Satz („Der
  ausgewählte Dokumentstand wurde in dieser Sitzung nicht zum Vergleich
  geöffnet. … Öffne ihn zuerst“).
- **Einwand der dritten Gegenprüfung** – zwei weitere Stellen:
  - Über der Dokumentliste steht bei jedem Lauf mit einer Datei „1
    angezeigt · 1 Ergebnisdateien verfügbar“ (`document-review.js`). Das
    Hauptwort wählt dort eine zweite Einsetzung nach einer anderen
    Bedingung; weder meine Suchen noch der Wächter sahen diese Form an.
  - Die Verlaufszeile „… von 1 Quellen als Ergebnis verfügbar“
    (`workflow-presentation.js`), mit `+` zusammengesetzt. Nach meiner
    Nachprüfung heute nicht erreichbar: Eine einzelne Quelle ohne Ergebnis
    erzeugt diese Zeile nicht.
- **Vierter Teil, `e66bab8f`** – beide Stellen korrigiert; der einzelne
  Kontaktwert übernimmt die übergebene Dokumentzahl statt fest „1
  Dokument“. Danach habe ich die vier Dateien gezielt nach den drei Formen
  durchsucht, die den früheren Suchen entgangen waren (zweite Einsetzung,
  Verkettung mit `+`, Wortketten mit Großschreibung), ohne weiteren Fund.
- **Nachweis**
  - Der Wächtertest in `tests/test-standalone-workspace.js` geht die vier
    Dateien durch. Er verlangt jetzt, dass die Mehrzahl hinter einer
    eingesetzten Zahl der Zweig einer Entscheidung über genau diesen
    Ausdruck ist (`x === 1`, `x > 1`) oder über `counted` läuft. Dieselbe
    Regel meldet am Stand vor R-025 (`cebc39a0`) 71 Stellen, nach dem
    ersten Teil 56, am Stand `7eefdcd4` noch 15, jetzt keine. Seit
    `e66bab8f` prüft er außerdem ein Hauptwort, das eine zweite Einsetzung
    wählt, und Zähltexte, die mit `+` zusammengesetzt sind. Vier einzeln
    zurückgedrehte Korrekturen, je eine pro Form, meldet er alle.
  - `tests/test-standalone-document-review-frontend.js` wertet die
    Zählsätze der Dokumentnachbearbeitung aus dem Quelltext der Oberfläche
    mit 0, 1 und 2 aus (Fortschritt, Freigabedialog, Umfang des Laufs,
    Sekunden).
  - Die im dritten Teil geänderten Sätze des Verlaufs habe ich mit einem
    Scratch-Skript für 0, 1 und 2 ausgewertet und gelesen.
  - Zehn Testfälle hielten falsche Formen fest und sind berichtigt: einer
    im vierten Teil („1 angezeigt · 1 Ergebnisdateien verfügbar“), zwei
    im zweiten Teil („(1 Werte)“, „1 Ergebnisse wurden sichtbar kopiert“),
    sieben im dritten („1 Quelldateien“, „1 Dokumentprüfstände“, „1 fertige
    Kopien“, „1 frühere zusätzliche Kopien“), darunter verneinte Prüfungen,
    die sonst leer gelaufen wären. Die Nachricht von `1126dc36` nennt
    fünf.
  - `tests/test-workflow-presentation.js` prüft Einzahl und Mehrzahl für
    Fortschritt, Ergebnisdateien und nicht verfügbare Dateien am Ergebnis
    der Funktion.
  - Nativ gesehen am Paket `30bdd541…` (Stand `907efc14`): ein Lauf mit
    einer einzigen Fundstelle zeigt in der geführten Prüfung durchgehend
    die Einzahl. Die Texte des zweiten Teils sind am Paket des Endstands
    nativ nachgesehen, soweit der Lauf sie anzeigt (siehe ERGEBNIS.md); die
    übrigen nur über die Tests.
- **Grenzen**
  - Der Wächter kennt eine feste Liste von Hauptwörtern. Ein neuer Zähltext
    mit einem anderen Hauptwort fällt nicht auf. Steht dieselbe Zahl in
    einem Nachbarzweig schon in einer Entscheidung, lässt er eine bloße
    Mehrzahl durch (so „gespeicherte Ergebnisstände“ am Stand `7eefdcd4`).
    Verbformen, Kasus und zusammengesetzte Zeichenketten prüft er nicht.
  - Drei Durchgänge haben jeweils weitere Stellen gefunden. Dass jetzt
    keine mehr fehlt, ist damit nicht belegt.
  - Rückgängig, Seitenwechsel und „alle gefilterten Zeilen auswählen“ sind
    am Quelltext festgehalten, nicht durch Bedienung im Test ausgelöst.
  - Die alte Oberfläche `app.js` enthält dieselbe Art von Texten und ist
    nicht angefasst; sie wird nicht mehr geladen (R-019).
  - Die Nachricht von `907efc14` nennt BL-050.6. Richtig ist BL-010.53.

### Startprobe · Kontrolle des Beobachtungswegs

- **Wo** – `tests/manual/standalone-native-windows-launch.ps1`, Funktion
  `Initialize-NativeOutboundObserver`.
- **Ist vor `1db8c744`** – Die Positivkontrolle las die Tabellen über einen
  einzelnen Aufruf (`Once`). Die Beobachtung selbst läuft über `Start`, einen
  Hintergrundthread und `Stop`. Dieser Weg war nicht kontrolliert: Ein
  Thread, der nie abtastet, ein `Stop`, das nichts zurückgibt, oder ein
  Thread mit falscher Wurzel im Prozessbaum hätten die Kontrolle bestanden.
  Im echten Lauf hätte nur der erste Fall über die Stichprobenzahl zum
  Abbruch geführt.
- **Jetzt** – Die beiden IPv4-Kontrollverbindungen (eigener Prozess,
  Kindprozess) müssen danach auch über `Start`, mindestens drei Stichproben
  und `Stop` erscheinen, ohne Lesefehler. Sonst endet die Probe mit
  `STANDALONE_NATIVE_OUTBOUND_OBSERVER_WORKER_INVALID`. Seit `98b426dd` muss
  nach `Stop` außerdem die Zahl der Stichproben stehen bleiben.
- **Nachweis** – Neun verfälschte Kopien der Probe, je mit
  `-ValidateOutboundOnly` (Scratch-Skript, kein Bestandteil des
  Repositorys). Die letzten drei stammen aus der zweiten Gegenprüfung:

| Verfälschung | Ergebnis |
| --- | --- |
| `Stop` gibt nichts zurück | abgelehnt, `…_WORKER_INVALID` |
| Thread tastet nie ab | abgelehnt, `…_WORKER_INVALID` |
| Thread beobachtet eine fremde Wurzel | abgelehnt, `…_WORKER_INVALID` |
| `Start` lässt das Stoppsignal gesetzt | abgelehnt, `…_WORKER_INVALID` |
| IPv6-Tabelle abgeschaltet | abgelehnt, `…_IPV6_INVALID` |
| Abtastung wirft immer, Fehler nicht gezählt | abgelehnt, `…_WORKER_INVALID` |
| `Stop` setzt das Stoppsignal nicht | abgelehnt seit `98b426dd`, `…_WORKER_INVALID`; vorher bestanden |
| `Stop` wartet nicht auf den Thread | besteht |
| `Start` setzt den Zustand nicht zurück | besteht |

  Die beiden bestehenden Verfälschungen ändern in diesem Skript kein
  Prüfergebnis: Der Thread endet nach höchstens einer weiteren Stichprobe,
  und der Abbau der Kontrolle setzt den Zustand zurück, bevor die echte
  Beobachtung beginnt.

- **Host ohne IPv6** – Bisher las der Beobachter die IPv6-Tabelle auch
  dort; nach Lektüre hätte jeder Durchgang als Lesefehler gezählt und die
  Probe mit `…_OBSERVER_DEGRADED` beendet. Jetzt bleibt die Tabelle
  ungelesen, wo der Host kein IPv6 hat und die Tabelle nicht lesbar ist;
  überall sonst wird sie gelesen. Diesen Zweig konnte ich nicht ausführen:
  Der Prüfhost hat IPv6.
- **Messskript** – Die Zusammenfassung nennt jetzt, ob das Prüffenster Teil
  der Messung war (`review_window_asserted`); das Durchreichen von
  `-AssertReviewWindow` ist im Test festgehalten.
- **Grenzen**
  - Dass ein einzelner Fehler der Abtastung gezählt wird, ist nicht
    kontrolliert; die letzte Verfälschung fällt über die fehlenden
    Stichproben auf, nicht über den Zähler.
  - Der Prozessbaum des Beobachters wächst nur. Eine Prozessnummer, die nach
    dem Ende eines Kindes neu vergeben wird, würde dem Baum zugerechnet. Das
    führt zu einem falschen Alarm, nicht zu übersehenem Verkehr; nicht
    geändert.
  - Die Kontrolle bricht bei einem einzigen Lesefehler ab, die
    Beobachtung erst ab fünf Prozent. Auf einem Host mit sehr vielen
    Verbindungen kann die Kontrolle deshalb scheitern, obwohl die
    Beobachtung liefe. Das wirkt in die sichere Richtung; nicht geändert.
  - Der Evidenzsatz nennt, ob die IPv6-Kontrolle lief, nicht, ob die
    IPv6-Tabelle gelesen wurde. Beides fällt nur auseinander, wenn die
    Laufzeit IPv6 verneint und die Tabelle trotzdem lesbar ist.
  - Die Nachricht von `1db8c744` nennt BL-047.2. Richtig ist BL-010.21.

### R-028 und R-031 · Nachträge

- `05efbad8` hält im Quelltextvertrag fest, dass Ordnerkette und vorhandener
  Datenroot ein gemeinsames Wartebudget teilen, dass nach dem Anlegen nichts
  wiederholt wird und dass die zurückgegebene Generation die dieses
  Startversuchs ist. Vorher hätte eine Änderung an diesen drei Stellen
  keinen Node-Test berührt; die Rust-Tests decken das Zeitverhalten.
- `7eefdcd4` berichtigt zwei Sätze im Sicherheitsmodell:
  - Dass über den verbleibenden UDP-Socket von WebView2 kein Paket gesendet
    wird, stammt aus einer einzelnen Messung mit dem Netzprotokoll der
    Laufzeit; die Startprobe prüft UDP nicht.
  - „Es wird nichts angelegt“ gilt, solange die Ordnerkette nicht gehalten
    ist. Scheitert der Start danach, bleibt ein frisch angelegter, leerer
    Datenroot zurück. Das hält der vorhandene Rust-Test
    `failed_bootstrap_handoff_preserves_the_fresh_private_root_without_cleanup`
    schon fest.
- Die Nachrichten beider Commits nennen BL-047.2. Richtig ist BL-010.11 und
  BL-010.21.
- `4c98d621` begrenzt den Ausschnitt dieses Vertragstests auf den Rumpf von
  `prepare_impl`; vorher reichte er bis zum Dateiende.
- `cebc39a0` trägt `-AssertNoOutbound` in `scripts/run-pkg-04.ps1` ein. Das
  Skript ist nicht ausgeführt worden.

### R-032 · Schließen des Fensters beendet einen laufenden Stapel nicht

- **Wo**
  - `apps/datasecure-standalone/tauri-contract/src/main.rs:3222` – Schließen
    des Hauptfensters ruft `begin_native_exit`.
  - `main.rs:3141` – `begin_native_exit` stoppt den Sidecar und beendet die
    App.
  - `plugins/data-secure/server/core/background-process-launcher.js:86`,
    `:117`, `:147` – Arbeitsprozesse werden mit `detached: true` gestartet.
  - Den Zusammenhang dieser Stellen habe ich gelesen, nicht durch eine
    Änderung belegt.
- **Reproduktion** – Paket `30bdd541…` (Stand `907efc14`), isoliertes
  Profil. Zweck „Automatisch maskieren“, sechs erfundene Dateien (DOCX, XLSX,
  PPTX, Text-PDF, Scan-PDF, PNG), **Starten**. Rund 14 s später das Fenster
  schließen. Prozessliste und Ergebnisordner beobachten, danach die App neu
  starten.
- **Ist**
  - Das Fenster schließt ohne Rückfrage; die Hülle endet ordentlich
    (Diagnose `sidecar_shutdown`, Ergebnis `ready`).
  - Ein Core-Prozess mit Sandbox- und Node-Kind arbeitet rund 75 s weiter
    und legt alle sechs Ergebnisse im Ergebnisordner ab.
  - Nach dem Neustart steht der Lauf im Verlauf als abgeschlossen.
  - Die Originale sind unverändert (Hashvergleich).
- **Soll**
  - BL-010.14 beschreibt für den Abbruch fortsetzbare Stapel („vorhandene
    fortsetzbare Stapel als `stopped`/`resumable`“).
  - Die alte Oberfläche sagt zum Schließen: „Offene Läufe können nach einem
    Neustart im Verlauf fortgesetzt werden“
    (`apps/datasecure-standalone/frontend/app.js:46`).
  - Zum Weiterlaufen nach dem Schließen habe ich im Kanon keine Aussage
    gefunden. Entweder endet die Verarbeitung mit dem Fenster, oder die App
    sagt vor dem Schließen, dass sie zu Ende läuft.
- **Auswirkung** – Wer schließt, um abzubrechen, bricht nicht ab. Prozesse
  der App laufen ohne Fenster weiter, und im Ergebnisordner erscheinen
  Dateien, nachdem die App geschlossen ist. Klartext gelangt dadurch nicht
  nach außen: Es sind dieselben geprüften Ergebnisse wie bei offenem
  Fenster; in den sechs Dateien stand weder Name noch Firma noch IBAN der
  Vorlage.
- **Zuordnung** – BL-010.14 (Abbruch und Fortsetzung), BL-010.11
  (Lebenszyklus des Sidecars).
- **Status** – bei der Meldung offen. Am 25.11.2026 hat der Anwender
  entschieden; umgesetzt in `5f670a20` und `2ce74b9f` (Abschnitt „R-032 ·
  Umsetzung, Gegenprüfungen und nativer Nachweis“). Der losgelöste Start im
  gemeinsamen Core, den auch Cowork nutzt, ist unverändert.
- **Nicht geprüft**
  - macOS.
  - Schließen während einer geführten Prüfung und während „Nur in Markdown
    umwandeln“.
  - Ob dabei auch die lokale Zuordnung geschrieben wird.
  - Ein zweiter Start, während der Stapel noch läuft.
  - Absturz statt Schließen (BL-010.14, UAT offen).

### Native Läufe am Paket `30bdd541…` (Stand `907efc14`)

Isoliertes Testprofil, Bedienung per Windows-UI-Automation, nur erfundene
Dateien. Beobachtung, keine Abnahme.

| Lauf | Beobachtung |
| --- | --- |
| Geführte Prüfung, vier Fundstellen | Eine Entscheidung vorgemerkt: „1 Zeile vorgemerkt. 3 Prüfzeilen noch offen.“ **Später entscheiden** führt zu „Fundstellenprüfung vertagt“ und zurück zu „Prüfung erforderlich“. Beim Wiederaufnehmen stehen 0 von 4 vorgemerkt; die vorgemerkte Entscheidung ist verworfen, wie der Dialog es ankündigt. Danach alle vier belassen, Lauf abgeschlossen. |
| Geführte Prüfung, eine Fundstelle | Alle Zähltexte in der Einzahl. |
| Sechs Formate mit OCR (DOCX, XLSX, PPTX, Text-PDF, Scan-PDF, PNG) | „6 technisch geprüfte anonymisierte Ergebnisse“ nach 76 s. Name, Firma und IBAN der Vorlagen stehen in keinem Ergebnis; Originale unverändert. „Max Mustermann Nordstern GmbH“ wird als Ganzes zu einem Platzhalter `[UNTERNEHMEN_001]`. |
| Fenster rund 14 s nach dem Start schließen | R-032. |

Zwei Beobachtungen ohne eigene Nummer:

- Die Dateien unter `tests/fixtures/synthetic_*` sind Minimaldateien für
  Einzeltests. Die App lehnt mehrere davon als beschädigt ab. Für native
  Läufe taugen die Generatoren in `tests/helpers/conversion-fixtures.mjs`.
- `tests/manual/standalone-ui-browser.mjs` prüft die alte Oberfläche
  (`index.html`, `app.js`) in einem Browser und gehört nicht zur Suite. Ein
  Aufruf am Endstand endete nach 30 s an Zeile 54: Das Skript wartet auf 20
  Zeilen im Verlauf, die Oberfläche zeigt seit DS-086 höchstens fünf
  (`app.js:434`). Meine Änderungen berühren beide Dateien nicht.
  `tests/test-native-smoke-integrity.js` prüft nur den Quelltext dieses
  Skripts, nicht seinen Lauf. Nicht geändert; das Skript gehört zur alten
  Oberfläche (R-019).

### Gegenprüfungen der Nacharbeit

Erste: ein unabhängiger Read-only-Lauf auf `907efc14`, mit eigenen Skripten
und Mutationen. Kein Einwand betrifft das Verhalten des Produkts außer den
Zähltexten.

| Einwand | Ergebnis |
| --- | --- |
| Der Weg der Beobachtung über den Hintergrundthread ist nicht positiv kontrolliert; drei Verfälschungen bestehen. | Berechtigt. `1db8c744`, siehe oben. |
| Auf einem Host ohne IPv6 liest der Beobachter weiter die IPv6-Tabelle und wertet jeden Durchgang als Lesefehler. | Nach Lektüre berechtigt, hier nicht ausführbar. `1db8c744`; der Zweig bleibt unausgeführt. |
| Eine wiederverwendete Prozessnummer kann dem Prozessbaum zugerechnet werden. | Zutreffend, nicht geändert; wirkt als falscher Alarm. |
| Weitere Zähltexte ohne Einzahl außerhalb der geführten Prüfung; zwei Tests halten die falsche Form fest. | Berechtigt. `8c452ac4`. |
| Der Einzahl-Test löst Rückgängig, Seitenwechsel und „alle gefilterten auswählen“ nicht aus. | Am Quelltext festgehalten und vom Wächter erfasst; nicht durch Bedienung im Test. |
| Gemeinsames Wartebudget und Bindung der zurückgegebenen Generation sind in keinem Node-Test festgehalten. | `05efbad8`. |
| Das Messskript hält das Durchreichen von `-AssertReviewWindow` nicht fest und nennt es nicht in der Zusammenfassung. | `1db8c744`. |
| Das Sicherheitsmodell stützt „kein Paket über den UDP-Socket“ auf eine einzelne Messung und sagt „nichts angelegt“ zu allgemein. | `7eefdcd4`. |
| Mein Test der Abbauwartezeit verlangt PowerShell 7 unter einem festen Pfad. | `1db8c744`: läuft unter Windows PowerShell. Der ältere Test daneben (`8b7a0aab`) nutzt den festen Pfad weiter. |

Zweite: ein unabhängiger Read-only-Lauf auf `7eefdcd4` über die Commits
`907efc14`, `8c452ac4`, `1db8c744`, `05efbad8` und `7eefdcd4`. Er hat die
Zählsätze nachgebaut und mit 0, 1 und 2 ausgewertet und drei verfälschte
Kopien der Probe ausgeführt; die Testdateien selbst hat er nicht
ausgeführt.

| Einwand | Ergebnis |
| --- | --- |
| „0 von 1 Datei sind …“: falsche Verbform, von `8c452ac4` erzeugt. | Berechtigt. `1126dc36`, mit Test für 0, 1 und 2. |
| Rund fünfzehn übersehene Zähltexte in `document-review.js` und `workspace.js`. | Berechtigt. `1126dc36`; dazu ein weiterer in `review.js`, den meine eigene Suche danach fand. |
| Der Wächtertest hat eine zu kurze Wortliste, lässt fremde Entscheidungen in der Nähe gelten und prüft weder Verben noch den Wert 0. | Wortliste ergänzt, Bindung an denselben Ausdruck; Verben und 0 über einen eigenen Test der Dokumentnachbearbeitung. Die übrigen Schwächen stehen oben als Grenze. |
| Drei Verfälschungen der Probe bestehen: `Stop` ohne Warten, `Start` ohne Zurücksetzen, `Stop` ohne Stoppsignal. | Die dritte wird seit `98b426dd` abgelehnt. Die ersten beiden bestehen weiter und ändern kein Prüfergebnis. |
| Die Kontrolle ist strenger als die Beobachtung (ein Lesefehler gegen fünf Prozent). | Zutreffend, nicht geändert; als Grenze genannt. |
| Der Evidenzsatz unterscheidet nicht, ob die IPv6-Tabelle gelesen wurde. | Zutreffend, nicht geändert; als Grenze genannt. |
| Der Ausschnitt `prepare` im Vertragstest reicht bis zum Dateiende. | Berechtigt. `4c98d621`. |
| Der im Commit genannte Rust-Test zum leeren Datenroot sei nicht zu finden; offen sei, ob der nächste Start den leeren Ordner annimmt. | Der Test steht in `private_namespace.rs:1381` und prüft genau das: Der Ordner bleibt leer zurück, und der nächste Aufruf nimmt ihn als vorhandenen Datenroot an. |

Ohne Fund geprüft hat er die Texte in `review.js`, die Nahtstellen und
Verbformen der übrigen geänderten Sätze, den Zustand des Beobachters nach
der Kontrolle und die Übereinstimmung der neuen Testbindungen und
Dokumentsätze mit dem Code.

Dritte: ein unabhängiger Read-only-Lauf auf `4c98d621`, nur zu den
Zähltexten der vier Oberflächendateien. Er hat alle in `1126dc36`
geänderten Ausdrücke aus dem Quelltext geschnitten und mit 0, 1 und 2
ausgewertet und beide Testdateien ausgeführt.

| Einwand | Ergebnis |
| --- | --- |
| „1 angezeigt · 1 Ergebnisdateien verfügbar“ und „1 private Dokumentstände lesbar“ über der Dokumentliste. | Berechtigt. `e66bab8f`. |
| „0 von 1 Quellen als Ergebnis verfügbar“ in der Verlaufszeile. | Text korrigiert in `e66bab8f`. Der Fall ist nach meiner Nachprüfung nicht erreichbar; der Test hält das fest. |
| Der Einzahlsatz des Kontaktwerts nennt fest „1 Dokument“. | `e66bab8f`: übernimmt die übergebene Zahl. Ob sie bei einem Wert größer als 1 sein kann, ist nicht geklärt. |
| Der Wächter sieht eine zweite Einsetzung, `+`-Verkettungen, Wortketten mit Großschreibung und Verbformen nicht. | Die ersten beiden prüft er seit `e66bab8f`. Wortketten mit Großschreibung und Verbformen bleiben unbewacht; dort stehen heute Entscheidungen im Code. |

Ohne Fund geprüft hat er alle in `1126dc36` geänderten Sätze (Leerzeichen,
Satzzeichen, Grammatik, Sinn) und in einer Rastersuche die übrigen
Zähltexte der vier Dateien.

Die Änderung nach der dritten Gegenprüfung (`e66bab8f`) ist nicht erneut
gegengeprüft.

## R-032 · Umsetzung, Gegenprüfungen und nativer Nachweis

Am 25.11.2026 hat der Anwender nach drei unabhängigen Fachsichten entschieden:
Schließen pausiert den Lauf, mit Rückfrage. Das sind die Commits `5f670a20`
und `2ce74b9f`. Die Entscheidung steht als Präzisierung von DS-110 in
`docs/canonical/DECISIONS.md`.

### Fachsichten vor der Entscheidung

Drei Read-only-Läufe mit je eigener Frage (Laufzeit und Lebenszyklus,
Datenschutz und Schutzgrenzen, Bedienung und Plattformkonventionen). Alle
drei kamen unabhängig zum selben Kern; die tragenden Aussagen habe ich am
Code nachgeprüft.

- **Das Weiterlaufen ist geerbt, nicht entschieden.** Ein gestarteter
  Arbeitsprozess beendet sich beim Verlust seines Elternprozesses bewusst
  nicht (`plugins/data-secure/server/gateway/batch-worker.js:251`), und die
  Hülle beendet nur den Sidecar (`ipc_transport.rs`, `Lifecycle::stop`). Das
  ist für Cowork begründet; für Standalone gab es keine Entscheidung.
- **Ein sicherer Stopp existierte schon.** `pause_batch` stellt die aktive
  Datei samt Bereitstellung und Zuordnung fertig; danach beginnt keine
  weitere (`gateway/standalone-pause.js`, `tests/test-standalone-pause.js`,
  8 Fälle). Nur das Schließen rief ihn nicht auf.
- **Verworfen:** bloßer Hinweis (wer abbrechen will, kann es nicht), eine
  dritte Antwort „weiterlaufen lassen“ (erhält den Zustand, der verwirrt),
  App im Infobereich (große neue Oberfläche, auf Windows und Mac
  verschieden), harter Abbruch der Arbeitsprozesse (führt in den
  Absturzpfad: die laufende Datei wird neu verarbeitet).

### Was sich geändert hat

- **Hülle** (`tauri-contract/src/close_prompt.rs`, `main.rs`,
  `ipc_transport.rs`)
  - Jede Schließanfrage des Hauptfensters wird nummeriert und als
    `datasecure-close-requested` an das Hauptfenster gesendet.
  - Die Oberfläche antwortet mit `confirm_close`,
    `acknowledge_close_request` oder `decline_close_request`.
  - Bestätigen gilt nur für die letzte Anfrage und nicht für eine
    zurückgezogene.
  - Ohne Antwort binnen zwei Sekunden schließt die Hülle wie bisher.
  - Läuft das Beenden schon, löst ein weiterer Klick nichts mehr aus.
- **Oberfläche** (`frontend/workspace.js`, Dialog in `workspace.html`)
  - Arbeitet nichts, schließt die App sofort.
  - Arbeitet ein Lauf: **Weiter verarbeiten** oder **Pausieren und
    schließen**. Das Fenster bleibt offen, bis der Lauf nicht mehr arbeitet,
    und schließt dann von selbst.
  - Zweite Schließanfrage in dieser Zeit: **Weiter warten** oder **Jetzt
    schließen**.
  - Nicht pausierbar (Aufbewahrung 0 Tage, Vorbereitung, abgelehnte Pause)
    oder Stand unbekannt (eben gestartet oder fortgesetzt, Verbindung wird
    wiederhergestellt): **Fenster offen lassen** oder **Trotzdem
    schließen**, mit dem Hinweis, was das Schließen zurücklässt.
- **Nicht geändert:** der gemeinsame Core, Cowork, der losgelöste Start der
  Arbeitsprozesse, das Beenden durch das Betriebssystem.

### Nachweis

| Art | Ergebnis |
| --- | --- |
| Rust | 5 Tests der Schließanfrage; `cargo test --locked` 338 bestanden, 3 ignoriert; Clippy ohne Befund |
| Oberfläche | 15 Abläufe in `tests/test-standalone-workspace.js` (534 Fälle in der Datei) |
| Verfälschungen | 42 gezielte Änderungen der Schließ-Logik, jede von mindestens einem Test erkannt (Scratch-Skript, kein Bestandteil des Repositorys) |
| Verdrahtung | ein Quelltextvertrag in `tests/test-standalone-desktop-contract.js` (42 Fälle), Regex in `tests/test-standalone-linux-sandbox-workflow.js` |

Nativ am Paket `721512f0…` (Build `ebc54e3c`, Stand `2ce74b9f`), isoliertes
Profil, sechs erfundene Dateien (DOCX, XLSX, PPTX, Text-PDF, Scan-PDF, PNG),
Zweck „Automatisch maskieren“ mit OCR:

| Ablauf | Beobachtung |
| --- | --- |
| Schließen ohne Lauf | Fenster zu nach 0,2 s |
| Schließen im Lauf | Rückfrage steht nach 3 s noch, die App lebt über die Frist der Hülle hinaus; Text wie im Test |
| **Weiter verarbeiten** | Rückfrage weg, der Lauf arbeitet weiter |
| **Pausieren und schließen** | Laufbeschreibung „Pause angefordert … DataSecure schließt danach von selbst.“; Fenster zu nach 6,5 s; kein Arbeitsprozess mehr; im Ergebnisordner 0 Dateien, auch 12 s später |
| Neustart | Verlauf „6 Dateien · 2 Ergebnisse“, Schaltfläche **Fortsetzen**; danach „6 technisch geprüfte anonymisierte Ergebnisse“, kein Klartext von Name, Firma oder IBAN, Originale unverändert |
| **Jetzt schließen** in der Wartezeit | zweite Rückfrage wie im Test; Fenster zu nach 0,2 s; fünf Arbeitsprozesse laufen 3,3 s weiter und enden; danach keine weitere Ergebnisdatei; Fortsetzen ergibt sechs Ergebnisse |
| Startprobe mit `-AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound` | besteht; ihr Abbau schließt das Fenster über denselben Weg (154 ms) |

Im nativen Lauf zuerst gesehen und danach in den Text übernommen: Nach
**Pausieren und schließen** liegen die fertigen Dateien noch nicht im
Ergebnisordner. Sie erscheinen erst, wenn der ganze Lauf abgeschlossen ist
(`STANDALONE_SECURITY_MODEL.md`: „Beide Zwecke veröffentlichen erst nach
terminalem Gesamtstapel“). Die erste Fassung der Rückfrage sagte nur „Fertige
Ergebnisse bleiben erhalten“.

### Gegenprüfungen

Erste, auf dem Arbeitsstand vor `5f670a20`: zwei unabhängige Read-only-Läufe
(Laufzeit, Datenschutz).

| Einwand | Ergebnis |
| --- | --- |
| Die Rückfrage öffnet mit gesperrten Knöpfen, wenn gerade ein anderer Befehl läuft; die Hülle hat dann keine Frist mehr. | Berechtigt. Die Antwortknöpfe sind von der Sperre ausgenommen; mit Test. |
| Schließen ohne Rückfrage, solange der Status unbekannt ist (Start läuft, Verbindung wird wiederhergestellt). | Berechtigt. Eigene Rückfrage „Stand nicht bekannt“. |
| Eine quittierte Anfrage hebt die Frist dauerhaft auf; der Modulkommentar behauptete, die Oberfläche könne die App nicht offen halten. | Zutreffend. Die Oberfläche quittiert erst, wenn die Rückfrage angezeigt ist; jede neue Anfrage braucht wieder eine eigene Antwort. Kommentar und Dokumente sagen jetzt, was gilt. |
| `confirm_close` blieb nach „Weiter verarbeiten“ gültig. | Berechtigt. `decline_close_request`; eine zurückgezogene Anfrage schließt nicht mehr. |
| Der Text nennt die Aufbewahrung nicht und verspricht bei 0 Tagen zu viel. | Berechtigt. Beide Texte geändert. |
| Das Ereignis geht an alle Fenster. | Jetzt nur an das Hauptfenster (`emit_to`). |
| Ein Klick während des Beendens fragt erneut. | Berechtigt. `ExitGate::begun`. |
| Acht Verfälschungen bestanden die Tests. | Tests erweitert; die Probe umfasst jetzt 42. |

Zweite, auf `5f670a20`: ein unabhängiger Read-only-Lauf.

| Einwand | Ergebnis |
| --- | --- |
| Nur der Start gilt als „Stand unbekannt“; Fortsetzen, Überspringen des OCR-Vergleichs und Antworten der geführten Prüfung stoßen den Arbeitsprozess genauso an. | Berechtigt. `2ce74b9f`: Jeder solche Befehl gilt, bis ein danach begonnener Status gelesen ist. |
| Ein nicht bestätigter Start beendet den unbekannten Zustand, bevor ein Status gelesen ist. | Berechtigt. Derselbe Mechanismus. |
| Kommt während des Pausenaufrufs eine neue Schließanfrage, bietet die neue Rückfrage „Weiter verarbeiten“, obwohl die Pause gesetzt ist. | Berechtigt. Die gesetzte Pause zählt sofort; die neue Rückfrage sagt „wird noch fertiggestellt“. |
| „Wer das Fenster offen lässt, zieht die Anfrage zurück“ gilt nicht für **Weiter warten**. | Dokument präzisiert; das Verhalten ist gewollt. |
| Sieben Verfälschungen bestanden die Tests. | Drei jetzt erkannt (kein Status dieser Sitzung, Startfehler des Dienstes, unbrauchbare Laufkennung); vier betreffen Zeilen, die nur absichern, und sind unten genannt. |

Ohne Fund geprüft hat der zweite Lauf: dass die App in jedem Zustand
schließbar bleibt, die Zählung und das Zurückziehen der Anfragen in Hülle
und Oberfläche, dass sich das Verhalten bei laufendem Beenden gegenüber
vorher nicht verschlechtert, und die Übereinstimmung der Dokumente mit dem
Code.

Die Änderungen nach der zweiten Gegenprüfung (`2ce74b9f`) sind nicht erneut
gegengeprüft.

### Grenzen

- **Weiter ohne Rückfrage:**
  - Beenden durch das Betriebssystem (Abmelden, Herunterfahren, App-Menü
    **Beenden** unter macOS).
  - Absturz der Hülle; Prozessende über den Task-Manager.
  - Die Oberfläche antwortet nicht binnen zwei Sekunden.
  - Der lokale Dienst konnte nicht gestartet werden.
  - Ein Arbeitsprozess aus einer früheren Sitzung, bevor die neue Sitzung
    ihren ersten Laufstatus gelesen hat.
  - Bereitstellung und Prüfvorbereitung außerhalb der Zustände
    „Vorbereitung“ und „Wird verarbeitet“.
- **Wartezeit:** Die Pause wirkt an der Dateigrenze. Bei einer großen Datei
  mit OCR kann das Fenster Minuten offen bleiben; der Ausweg ist die zweite
  Schließanfrage mit **Jetzt schließen**. Gemessen habe ich nur sechs kleine
  Dateien.
- **Arbeitskopien:** Nach **Pausieren und schließen** liegen die privaten
  Arbeitskopien der offenen Dateien, bis der Lauf fortgesetzt wird oder die
  Aufbewahrung endet. Vorher lief der Lauf zu Ende.
- **Nur im Test, nicht nativ:** die Rückfragen „nicht pausierbar“
  (Aufbewahrung 0 Tage, Vorbereitung, abgelehnte Pause) und „Stand nicht
  bekannt“, Esc, die Frist der Hülle bei stummer Oberfläche, ein Klick
  während des Beendens.
- **Nicht geprüft:** macOS und Linux (der neue Rust-Code hat keine
  plattformabhängigen Zweige, übersetzt wurde nur Windows); Screenreader;
  Schließen während „Nur in Markdown umwandeln“ und während einer geführten
  Prüfung mit ungespeicherten Eingaben. Dort arbeitet kein Lauf, die App
  schließt wie bisher sofort, und nicht übergebene Eingaben der Prüfung
  gehen wie bisher verloren.
- **Vier Zeilen ohne eigenen Test:** das Zurücksetzen der Anfragenummer in
  `confirmClose` und in `withdrawClose` (die Hülle lehnt eine veraltete oder
  zurückgezogene Nummer ohnehin ab), die Prüfung auf ein schon entladenes
  Fenster in `receiveCloseRequest`, und `closeAfterPause` in der Wahl der
  Rückfrage „wird noch fertiggestellt“ (deckt sich mit dem gelesenen
  Pausenwunsch).
- **Der Frist-Thread der Hülle** ist am Quelltext festgehalten und im
  nativen Lauf nur mit antwortender Oberfläche gesehen.

## Runde vom 25.11. nachmittags · Reste, Gegenprüfungen und R-033

Auftrag des Anwenders: alles erledigen, was sich hier erledigen lässt. Die
Runde hat fünf Reste bearbeitet, den letzten R-032-Commit gegenprüfen lassen
und im nativen Lauf einen neuen Befund ergeben (R-033). Zwei meiner
Änderungen dieser Runde haben die Gegenprüfung nicht bestanden: eine ist
zurückgenommen, die andere nachgebessert. Endstand des Produktcodes ist
`3ba2b8fb`; `997b55bc` passt danach einen Test an, der die geänderten
Label-Ausdrücke festschreibt und an dem die Suite zunächst stoppte.

### Was umgesetzt ist

| Befund | Änderung | Commits |
| --- | --- | --- |
| R-032 | Gegenprüfung von `2ce74b9f`: Eine Antwort der geführten Prüfung sperrt das Statuslesen nicht; ein Status, der während der Antwort gelesen wurde, galt als „danach gelesen“, und das Fenster schloss still. Ein laufender Befehl zählt jetzt selbst, und die Marke wird bei seiner Rückkehr erneuert. Beim Nachstellen gefunden: Ging die Verbindung verloren, während die Rückfrage offen war, schloss **Pausieren und schließen** das Fenster, ohne pausiert zu haben. Jetzt nennt die Rückfrage den unbekannten Stand. Eine Pause, deren Antwort verloren ging, die der nächste Status aber zeigt, gilt nicht mehr als abgelehnt. | `d41a042b`, `34de4509` |
| R-013 | Das Diagnosepaket listet bis zu 2 048 statt 128 Einträge des Protokollordners. Damit enthält es wieder die Sitzung vor einem Absturz, auch wenn der Ordner viele alte Protokolle hält. Gelöscht wird weiterhin nichts. | `49add216`, `b755e208` |
| R-023 | `cargo-audit 0.23.0` gegen die RustSec-Datenbank (1 568 Advisories) meldete zwei Schwachstellen in den gesperrten Crates der Hülle: `url 2.5.8` (RUSTSEC-2026-0592, Stapelüberlauf in `Url::origin()` bei verschachtelten `blob:`-Adressen) und `cookie 0.18.2` (RUSTSEC-2026-0594; das betroffene Merkmal ist hier nicht eingeschaltet). Beide sind auf die bereinigte Fehlerkorrektur-Version angehoben (`url 2.5.9` mit `form_urlencoded 1.2.3`, `cookie 0.18.3`). `npm run audit:standalone` prüft die Crates jetzt mit. Zehn Hinweise bleiben: nicht gepflegt `chrono`, `proc-macro-error` und fünf `unic`-Crates; als unsound gemeldet `glib`, `rustix`, `tokio`, jeweils in Schnittstellen anderer Plattformen. | `52dee47c`, `fc10973e`, `927fb3bd` |
| R-020 | Seitenzoom im Hauptfenster unter Windows (Strg mit Plus, Minus, Null oder Mausrad) als Einstellung von WebView2. Die Oberfläche erhält keinen Befehl und keine Berechtigung. | `405eb370` |
| R-027 | Ein Wert in Anführungszeichen, die in derselben Zeile schließen, wird ganz ersetzt (`Passwort: "Tulpe Garten Regen"`). Überlappt er einen offenen Personenhinweis, wird wie bisher sein erstes Wort ersetzt. | `3ba2b8fb` |
| R-033 | Siehe unten. | `3ba2b8fb`, Test-Festschreibung in `997b55bc` |

`3ba2b8fb` enthält R-027 und R-033 in einem Commit, weil beide als ein Stand
geprüft wurden; ein Zwischenstand wäre ungeprüft gewesen.

### Was zurückgenommen ist

- **R-003, Zustand alter Formular-Kontrollkästchen.** `39f2b3aa` gab für ein
  Feld FORMCHECKBOX ein ☒ oder ☐ aus. Die Gegenprüfung hat gezeigt, und ich
  habe es nachvollzogen (`scratchpad/privacy/g21.js`): Das Zeichen steht am
  Zeilenanfang, und eine Zeile, die nur aus einem Namen besteht, wird nur
  ohne vorangestelltes Zeichen als Person erkannt. Aus ` Anna Sommer`
  (ersetzt) wurde `☒ Anna Sommer` (nicht ersetzt). `22c34dcb` nimmt die
  Änderung zurück; die Nachricht dieses Commits nennt den Grund nicht, er
  steht hier. Neue Stopps hat die Gegenprüfung über rund 40
  Dokumentvarianten nicht gefunden. Der Rest von R-003 bleibt offen. Er
  braucht dasselbe wie R-006: eine Darstellung, die vom Zweck abhängt, oder
  einen Kern, der ein solches Zeichen am Zeilenanfang wie Leerraum liest,
  mit Differenzlauf.

### Was nicht umgesetzt ist, und warum

- **R-013, Aufbewahrung alter Protokolle.** Das Diagnosemodul legt nur an und
  hängt an; so steht es in seinem Modulkopf („No reopen, truncate, rename or
  deletion“), und ein Test hält fest, dass das Sammeln nichts aufräumt. Eine
  Aufbewahrungsfrist ist eine Produktentscheidung und braucht nativen
  Löschcode für drei Betriebssysteme, von denen hier eines übersetzbar ist.
- **R-011, Aufräumen abgeschlossener Exportdatensätze.** Derselbe Grund: Die
  Hülle enthält bewusst keinen Löschcode. Die Grenze von rund 16 000 Exporten
  je Zielordner bleibt. In meiner Liste vor dieser Runde stand der Punkt
  unter „könnte ich beheben“; das war zu viel versprochen.
- **R-019, Tests der alten Oberfläche.** Die alte Oberfläche `app.js` wird
  nicht geladen, aber paketiert. Sie zu entfernen ist eine Produktentscheidung
  (`docs/canonical/PRODUCT.md`: die native Paketabnahme ist Voraussetzung der
  Standardumschaltung). Nachtrag: Der Anwender hat am 25.11. entschieden;
  entfernt in `1d908311`. Der zitierte Satz war veraltet, siehe die
  Berichtigung im Abschnitt „R-019 und R-034 · Frühere Oberfläche entfernt“.
- **R-020, Bidi-Steuerzeichen in Namen.** Eine Anzeigefunktion wäre an rund
  60 Stellen in zwei Dateien nötig; die Alternative, solche Namen abzulehnen,
  träfe auch Dateien mit rechtsläufigen Namen. Der Nutzen ist gering:
  DataSecure führt Dateien nicht aus und prüft Formate am Inhalt.
- **R-020, versteckte Live-Regionen.** Zwölf Regionen; ob ein Screenreader sie
  ansagt, lässt sich hier nicht beobachten. Bleibt bei der Abnahme BL-012.5.
- **R-020, Seitenzoom unter macOS und Linux.** Tauri schleust dort ein Skript
  ein, das eine Webview-Berechtigung braucht; der Vertragstest der Oberfläche
  schließt sie aus. Entscheidung nötig.

### R-033 · Aus Word bleiben Telefonnummer, Name hinter einem Titel und weitere Angaben stehen

- **Priorität:** hoch.
- **Dimension und Plattform:** Anonymisierung; alle Ziele; Quellen, die als
  `content-v1`-Markdown beim Kern ankommen (DOCX belegt; XLSX, PPTX und PDF
  nutzen dieselbe Schreibweise, dort nicht einzeln ausgeführt).
- **Backlog:** BL-050.6, BL-021.1.
- **Gefunden:** im nativen Lauf am 25.11., beim Lesen des Ergebnisses eines
  erfundenen Word-Formulars. Im freigegebenen Markdown stand
  `Antragsteller: Hans Müller, Tel\. 030 1234567`.
- **Reproduktion:** `scratchpad/conversion/t61-escape-privacy.js` (dieselbe
  Zeile als Text und aus einem DOCX, Extraktor und Kern am RC178-Stand):
  7 von 24 Zeilen kommen aus Word mit mehr Klartext heraus. Im Repository:
  `tests/test-privacy-office-markdown-abbreviations.js`, schlägt am Stand vor
  `3ba2b8fb` fehl.

  | Zeile im Dokument | aus einer Textdatei | aus Word, RC178 |
  | --- | --- | --- |
  | `Tel. 030 1234567` | `Tel. [PHONE_REDACTED]` | `Tel\. 030 1234567` |
  | `Fax. 030 1234568` | `Fax. [PHONE_REDACTED]` | `Fax\. 030 1234568` |
  | `Dr. Anna Meier kommt morgen.` | `Dr. [PERSON_001] kommt morgen.` | `Dr\. Anna Meier kommt morgen\.` |
  | `Herr Dr. Meier hat unterschrieben.` | `Dr. [PERSON_001] hat unterschrieben.` | `Herr Dr\. Meier hat unterschrieben\.` |
  | `geb. 12.03.1980` | `geb. [DATE_REDACTED]` | `geb\. 12\.03\.1980` |
  | `z. Hd. Hans Müller` | `z. Hd. [PERSON_001]` | `z\. Hd\. Hans Müller` |
  | `Personalnr. 4711` | `Personalnr. [ID_REDACTED]` | `Personalnr\. 4711` |

- **Ursache:** Die Umwandlung schreibt jeden wörtlichen Punkt als `\.`
  (`core/markdown-literal-content.js`). Andere Regeln lesen das (Datum nach
  „Geboren am“, Straße, E-Mail-Adresse, IBAN). Nicht gelesen haben es: das
  abgekürzte Telefonlabel (`privacy/base.js`, `PHONE_LABEL_RE`), Titel
  (`privacy/entities.js`, `ACADEMIC_TITLE` und Verwandte), `geb.`
  (`DATE_OF_BIRTH_LABEL_RE`), `z. Hd.` (`privacy/engine.js`) und die
  abgekürzten Nummernlabels (`ID_LABELS`). RC178 verhält sich gleich.
- **Ist/Soll:** Dieselbe Zeile muss aus Word so ersetzt werden wie aus Text.
- **Auswirkung:** Die genannten Angaben standen im freigegebenen Markdown von
  Word-Dokumenten, ohne Stopp und ohne Hinweis. Das betrifft Standalone und,
  über denselben Kern, lokal extrahiertes Markdown im Cowork-Plugin.
- **Status:** behoben in `3ba2b8fb` für diese Regeln. Sie lesen den Punkt mit
  und ohne Backslash; für Text ohne `\.` ändert sich nichts. Die ersten drei
  Regeln habe ich gefunden, `z. Hd.` und die Nummernlabels die Gegenprüfung.

Beim selben Lesen aufgefallen, in RC178 gleich, in dieser Runde **nicht
behoben** (Nachtrag: am 25.11. abends bearbeitet, siehe den Abschnitt
„R-033 · Erkennungslücken, Umsetzung am 25.11. abends“):

- **R-033b:** Ein Name hinter `Antragsteller:` oder `Patient:` wird in keinem
  Profil ersetzt. `Kunde:`, `Ansprechpartner:`, `Mitarbeiter:` und
  `Bearbeiter:` werden erkannt.
- **R-033c:** Im Profil Allgemein bleibt eine Namenszeile hinter einem
  Aufzählungszeichen stehen (`- Anna Sommer`, auch eine ganze Liste), während
  `Anna Sommer` allein ersetzt wird. Das Profil Personalprofil ersetzt sie
  hinter `-`, `*` und einer Nummer, nicht hinter `•`.
- **R-033d:** Ein voller unbekannter Name in Prosa ohne Hinweiswort bleibt
  stehen (`Petra Lang hat den Vertrag am 12.03.2026 unterschrieben`), ebenso
  eine Telefonnummer ohne Label (`Rückruf unter 030 7654321`). Die geführte
  Prüfung zeigt beides nicht an: der Kern meldet dort keinen offenen Hinweis
  (`scratchpad/privacy/g23.js`).

Im Lauf mit fünf erfundenen Dateien enthielten am Stand vor `3ba2b8fb` drei
der fünf freigegebenen Ergebnisse Klartext, den ein Leser als
personenbezogen ansieht. Am Endstand: die Telefonnummer des Formulars ist
ersetzt; drei der fünf Ergebnisse enthalten weiterhin solchen Klartext (Name
hinter `Antragsteller:`, Name in Prosa, Telefonnummer ohne Label).

### Gegenprüfungen dieser Runde

Fünf unabhängige Read-only-Läufe, jeder mit dem Auftrag zu widerlegen.

| Gegenstand | Ergebnis |
| --- | --- |
| `2ce74b9f` (R-032) | Ein Einwand durch Ausführung bestätigt (Antwort der geführten Prüfung), einer am Text; kein Zustand ohne Schließmöglichkeit. Behoben in `d41a042b`. |
| `d41a042b`, `49add216`, `405eb370`, `fc10973e` | `d41a042b`: kein Defekt, eine Härtung (`34de4509`). `49add216`: kein Defekt; die Annahme „zwei bis vier Segmente je Sitzung“ trug nicht, Grenztest fehlte (`b755e208`). `405eb370`: am Quelltext von Tauri und wry wirksam. `fc10973e`: ein künstliches `cargo` mit leerem Bericht bestand die Prüfung (`927fb3bd`). |
| `39f2b3aa` (Kontrollkästchen) | Keine neuen Stopps; ein hoher Einwand: das Zeichen verhindert die Erkennung eines Namens dahinter. Zurückgenommen. |
| Zugangsdaten in Anführungszeichen, vor dem Commit | 38 900 Vergleiche, 0 neue Stopps; ein Einwand: bei offenem Personenhinweis im Wert wurde nichts mehr ersetzt (1 034 von 16 000 gerichteten Fällen). Rückfall auf das erste Wort; danach 0. |
| Maskierter Punkt, vor dem Commit | Rund 22 000 Kernläufe, keine Regression, Text ohne `\.` unverändert. Zwei weitere Regeln derselben Art gefunden (`z. Hd.`, Nummernlabels; behoben) und drei Formen, die offen bleiben (siehe Grenzen). |

Die letzte Fassung des Kerns (mit `z. Hd.` und den Nummernlabels) ist nicht
mehr unabhängig gegengeprüft, nur mit den Vergleichsläufen und Tests.

### Nachweise am Kern

| Lauf | Ergebnis |
| --- | --- |
| RC178-Kern gegen Endstand, 18 600 Fälle, fünf Profile | 0 neue Stopps; 10 Unterschiede „mehr sichtbar“, alle der gewollte Fall aus R-024; 420 behobene Stopps. Dieselben Zahlen wie vor dieser Runde. |
| Derselbe Lauf, jeder Punkt als `\.` | 0 neue Stopps; dieselben 10 Unterschiede; 5 314 Fälle mit weniger Klartext. |
| Kern des vorigen Commits gegen Endstand, 9 600 Fälle mit Zugangsdaten in Anführungszeichen | 0 neue Stopps, 0 mehr sichtbar, 2 700 weniger sichtbar. |
| Dieselbe Zeile als Text und aus Word, 24 Zeilen | RC178: 7 anders; Endstand: 0. |
| 19 datenschutzbezogene Testdateien der Suite, `test-pii-regression.js` (164 Fälle) | bestanden. |

Alle Vergleichsläufe arbeiten mit erfundenen Sätzen aus wenigen Bausteinen.

### Grenzen dieser Runde

- **R-033 ist nicht vollständig.** Offen bleiben: eine maskierte Klammer vor
  einem unbekannten Namen (`Anna Meier \(geb\. Schulz\)`), wörtlich
  getippte, maskierte Listen- oder Hervorhebungszeichen vor oder um einen
  Namen (`1\. Anna Meier`, `\*Anna Meier\*`). Geprüft sind rund 180
  Zeilenformen aus Word; XLSX, PPTX und PDF sind nicht einzeln ausgeführt.
  Der Kern liest Markdown aus Office-Quellen Regel für Regel; eine
  einheitliche Sicht ohne Maskierung wäre die tragfähige Lösung und ist eine
  größere Änderung.
- **Folge der Korrektur:** Eine Word-Tabelle mit der Spalte `Tel.` und einer
  Nummer darunter stoppt jetzt mit `RESIDUAL_PII`, wo vorher die Nummer still
  stehen blieb. Derselbe Inhalt als Text stoppt in allen Ständen. Ein Titel
  vor einem Wort, das kein Name ist (`Dipl.-Ing. Maschinenbau`), wird aus
  Word jetzt wie aus Text als Person ersetzt.
- **R-032:** Die Rückfrage „nicht pausierbar wegen Aufbewahrung 0 Tage“ kann
  im Standalone-Paket nicht auftreten: Die Hülle reicht
  `EU_PRIVACY_RETENTION_DAYS` nicht an den Core weiter
  (`main.rs`, `configure_core_environment`); die Frist beträgt dort immer
  sieben Tage. Im nativen Lauf mit gesetzter Variable wurde die Pause
  angenommen. Der Zweig ist nur im Test erreichbar. „Stand unbekannt“ ist
  weiterhin nur im Test ausgelöst. Ein Befehl, der nie zurückkehrt, hält den
  Stand auf „unbekannt“; das Fenster bleibt über **Trotzdem schließen**
  schließbar. Zwei von 55 Verfälschungen der Schließ-Logik erkennen die Tests
  nicht (ein Absicherungszweig nach fehlgeschlagener Pause, die Laufbindung
  der übernommenen Pause).
- **R-013:** Das Paket öffnet jede bekannte Protokolldatei einmal, um sie zu
  ordnen; bei 2 048 Dateien rund eine Sekunde in einer Näherung mit Node auf
  diesem Rechner, nicht an der Hülle gemessen. Jenseits der Grenze fällt es
  wie bisher auf die laufende Sitzung zurück.
- **R-020:** Das Layout bei starker Vergrößerung ist nicht beurteilt. Das
  getrennte Prüffenster der alten Oberfläche hat keinen Zoom.
- **R-023:** Die Prüfung braucht Netzzugang und ein installiertes
  `cargo-audit`; sie gehört nicht zur Suite. Für macOS und Linux ist die
  angehobene Lock-Datei nicht übersetzt.
- **Nicht geprüft:** macOS und Linux für alle Änderungen der Hülle; die
  Wartezeit bei einer wirklich großen Datei (gemessen: 40 Seiten Scan).
- **Eigene Fehler dieser Runde:** Ich habe während des Smoke-Tests des
  vorläufigen Pakets dessen Arbeitsordner gelöscht; der Test schlug fehl.
  Am endgültigen Paket lief er ungestört und bestand. Eine Abfrage mit
  `cargo tree --target all` hat Crate-Quellen aller Plattformen in den
  Cargo-Cache des Rechners geladen.

## R-033 · Erkennungslücken, Umsetzung am 25.11. abends

Auftrag des Anwenders nach der vorigen Übergabe: die offenen
Erkennungslücken aus R-033 angehen. Ergebnis ist der Commit `1c8e971c`. Drei
unabhängige Gegenprüfungen haben daran mitgewirkt; zwei meiner Fassungen
haben sie nicht bestanden und sind vor dem Commit umgebaut worden, die
dritte hat acht weitere Punkte ergeben: drei sind behoben, drei zum Teil,
zwei bleiben.

### Was jetzt gilt (nur Standalone, bis auf das Rückruf-Label)

| Lücke | Regel | Ort |
| --- | --- | --- |
| R-033b, Name hinter einer Rolle | Rolle vor Doppelpunkt oder Gleichheitszeichen mit namensförmigem Wert dahinter ist ein Personenhinweis (`Antragsteller: Hans Müller`, `Mieter 1: …`, `Patient/in: …`, aus Word auch `Antragsteller \(m/w/d\): …`). Rund 80 Rollen. Ein Wert, der kein Name ist, bleibt (`Patient: stabil`). Der Name endet vor einem neuen Satz oder dem nächsten Label derselben Zeile (`Mieter: Anna Sommer Geburtsdatum: …`); mehrere Rollen in einer Zeile erhalten je ihren Namen. | `privacy/person-ambiguities.js`, `ROLE_CUE`, `roleLabelNameSpans`, `withoutFollowingWords` |
| R-033c, Namensliste | Personenlabel, Rolle oder Stichwort (`Anwesend`, `Abwesend`, `Entschuldigt`, `Teilnehmende`, `Teilnehmerliste`, `Unterzeichnende`) allein in einer Zeile: die Namen der Listeneinträge darunter sind Personenhinweise, auch bei Windows-Zeilenenden und mit maskierter Klammer aus Word. Ein Eintrag, der kein Name ist, bleibt und beendet die Liste nicht. Ohne Label ändert sich nichts. | `labelledNameListSpans` |
| R-033d, Telefonnummer | `Rückruf unter …` und `Rückruf an …` sind Telefonlabel (auch im Cowork-Plugin). | `privacy/base.js`, `PHONE_LABEL_PATTERN` |
| Rest R-033a | Die maskierte Klammer aus Word hinter einem Namen (`Anna Meier \(geb\. …`) wird gelesen. | `privacy/entities.js`, `contactAfter` |
| neu gefunden | Ein Personenhinweis gilt an bis zu 500 weiteren Stellen desselben Dokuments mit demselben vollen Namen. Vorher ersetzte die Entscheidung den Namen an der Fundstelle (`Anna Sommer bestätigt den Termin`) und im nächsten Dokument des Stapels, ließ ihn aber zwei Zeilen weiter stehen. In RC178 gleich. Eine weitere Stelle liest der Kern zuerst wie bisher; nur ein danach noch lesbarer Name wird zum Hinweis. | `personProseCandidateSpans`, `personProseAmbiguities`, `gateway/privacy-text-operation.js` |

Personenhinweise entscheidet die geführte Prüfung; der automatische Modus
ersetzt sie.

### Was verworfen wurde, und warum

- **Rollen als Personenfelder** (erste Fassung). Ein Personenfeld ersetzt den
  ganzen Wert, auch eine Bemerkung, und danach dieses Wort im ganzen
  Dokument: `Patient: stabil` machte aus `Der Verlauf ist stabil` ein
  `Der Verlauf ist [PERSON_001]`, und eine Tabellenspalte `Mieter` mit `ja`
  und `nein` ersetzte danach jedes `ja` und `nein` im Text. Die Gegenprüfung
  hat das gezeigt. Der Mechanismus ist nicht neu: Er gilt in RC178 für
  `Kunde`, `Mitarbeiter`, `Teilnehmer` und alle übrigen Personenlabels (von
  mir am RC178-Kern nachgestellt: `Kunde: zufrieden` ersetzt jedes weitere
  `zufrieden`). Ich habe ihn nicht auf 30 weitere Labels ausgedehnt.
- **Name vor „hat“ und einem Partizip** (`Petra Lang hat den Vertrag
  unterschrieben`). Der Kern erkennt einen Namen allein an der Form; dieselbe
  Form hat `Letzte Woche hat der Chef angerufen`. Die Regel machte `Letzte
  Woche` zur Person, und die Entscheidung wurde in jedem folgenden Dokument
  des Stapels wiederholt. Entfernt; die Lücke bleibt.
- **Geburtsname hinter „geb.“.** Die Regel registrierte den einzelnen
  Nachnamen als Person; stand derselbe Nachname noch einmal allein im
  Dokument, stoppte es mit `RESIDUAL_PII` (40 neue Stopps im Vergleich gegen
  RC178). Entfernt; die Lücke bleibt.
- **Die umgestellte Form hinter einer Rolle** (`Mandant: Müller, Hans`). Als
  Hinweis erhielt sie ein eigenes Pseudonym neben dem der schon bekannten
  Person. Herausgenommen; für eine bekannte Person erkennt der Kern die Form
  wie bisher.
- **Weitere Stellen wie die Fundstelle behandeln.** Die Ausweitung
  reservierte zuerst jede weitere Stelle vor dem Kern und meldete sie immer
  als Hinweis. Ein Dokument, das vorher vollständig anonymisiert durchlief,
  stoppte damit: `Hans Müller bestätigt den Termin.` und später
  `Hans Müller IBAN DE89…` endete mit `AMBIGUITY_REVIEW_REQUIRED`, weil die
  Restprüfung an der zweiten Stelle einen breiteren Hinweis sieht
  (`Hans Müller IBAN`) und der neue ihn kreuzte. Umgebaut: Der Kern liest
  weitere Stellen wie bisher, und ein weiterer Hinweis entfällt, wenn ein
  Restfund ihn kreuzt. Der Kommentar in `gateway/privacy-text-operation.js`
  nennt als Beispiel `Tel. Hans Müller 030 …`; dieses Dokument stoppt weiter,
  jetzt in der Schlussprüfung statt im Kerndurchlauf (siehe „Was bleibt“).
  Nachtrag: Mit `0bd5e26f` stoppt es nicht mehr, weitere Stellen werden
  wieder reserviert, und der Kommentar ist ersetzt.

### Nachweise

| Lauf | Ergebnis |
| --- | --- |
| RC178-Kern gegen Endstand, 18 600 Fälle, fünf Profile | 0 neue Stopps; „mehr sichtbar“ nur die zehn gewollten Fälle von R-024; 420 behobene Stopps; 5 356 Fälle mit weniger Klartext (vorher 5 274). |
| Derselbe Lauf, jeder Punkt als `\.` | 0 neue Stopps; dieselben zehn Fälle; 5 396 mit weniger Klartext. |
| Kern der vorigen Übergabe gegen Endstand, 1 230 Zeilen mit Schützenswertem und 240 personenfreie Zeilen | 0 neue Stopps, 0 mehr sichtbar, 774 weniger sichtbar. 288 bleiben sichtbar: die Sätze mit „hat“, die Geburtsnamen und die Liste unter `Verteiler`. Von den 240 personenfreien Zeilen werden 6 zusätzlich ersetzt (`Offene Punkte` unter `Teilnehmer:`, `Vertrieb Nord` und `Technischer Dienst` unter `Anwesend:`). Die erste Fassung ersetzte 68. |
| Derselbe Name an zwei Stellen: sechs Hinweiszeilen mal 54 Umgebungen mal vier Namen, als ein Dokument in beiden Reihenfolgen und als zwei Dokumente eines Stapels; Kern der vorigen Übergabe gegen Endstand | 19 440 Vergleiche in fünf Profilen: 0 mehr sichtbar, 9 488 weniger sichtbar, 1 608 neue Stopps. Alle neuen Stopps sind `RESIDUAL_PII` in sieben Umgebungen der Form Label, Name, Nummer (siehe „Was bleibt“). Mit maskierten Zeichen im Profil Allgemein, 3 888 Vergleiche: 0 mehr sichtbar, 284 neue Stopps derselben Art. Vor dem Umbau der Ausweitung stoppte außerdem `Hans Müller IBAN DE89…` mit `AMBIGUITY_REVIEW_REQUIRED`; am Endstand nicht mehr. |
| `tests/test-privacy-role-labels-and-name-lists.js` | 8 Tests bestanden; am Kern der vorigen Übergabe schlagen 5 fehl, die drei übrigen sind Gegenfälle, die unverändert bleiben müssen. |
| Kernabhängige Testdateien der Suite | 106 Dateien, die den Datenschutzkern laden, einzeln ausgeführt: alle bestanden. `tests/test-pii-regression.js`: 164 Fälle bestanden. Danach die Gesamtsuite: 367 Dateien bestanden. |

Alle Vergleichsläufe arbeiten mit erfundenen Sätzen aus wenigen Bausteinen.

### Gegenprüfungen

Drei unabhängige Read-only-Läufe, jeder mit dem Auftrag zu widerlegen.

| Gegenstand | Ergebnis |
| --- | --- |
| Erste Fassung (Rollen als Personenfelder, Regel für „hat“, Geburtsname) | Zwei hohe Einwände, beide durch Ausführung belegt: Überredaktion ganzer Dokumente durch die neuen Personenfelder und Verschleppung von `Letzte Woche` in den Stapel. Fassung verworfen. |
| Zweite Fassung (Rolle und Liste als Personenhinweis) | Nichts sichtbarer als vorher. Drei Einwände: neuer Stopp bei `- Anna Sommer Telefon: …`, zweites Pseudonym für `Müller, Hans`, verschluckter Folgetext hinter einem Rollenwert. Alle drei behoben. |
| Dritte Fassung | Rund 250 gezielte Vergleiche, kein Fall mit mehr Klartext. Acht Punkte. Behoben: Listen bei Windows-Zeilenenden nie erkannt; eine maskierte Klammer aus Word beendete die ganze Liste, `\(m/w/d\)` wurde nicht gelesen; Name vor einem Label derselben Zeile blieb stehen. Zum Teil behoben: neue Stopps (`Hans Müller IBAN …` stoppt nicht mehr, `Label Name Nummer` stoppt weiter); die 500er-Grenze (Zählung berichtigt, die Grenze bleibt); weitere Lücken der Liste (ein Eintrag ohne Namensform beendet sie nicht mehr, ein einzelner Nachname bleibt lesbar). Bleiben: halbe Ersetzungen und `Rückruf an 12345 Kunden`. Laufzeit: 205 KB Prosa 2,0 s vorher und 2,1 s nachher; eine Liste mit 3 000 verschiedenen Namen 0,9 s vorher und 2,3 s nachher. |

Die Korrekturen nach der dritten Gegenprüfung sind nicht mehr unabhängig
gegengeprüft, nur mit den Vergleichsläufen, dem Suchlauf und den Tests.

### Was bleibt

- **Neuer Stopp statt stiller Freigabe:** Steht ein Name, der an anderer
  Stelle Personenhinweis ist, zwischen einem Label und einer Nummer
  (`Tel. Hans Müller 030 1234567`, `Steuer-ID Hans Müller 12345678903`,
  `Geburtsdatum Hans Müller: 01.02.1980`, `Aktenzeichen Hans Müller 12/2026`,
  `Personalnr. Hans Müller 4711`, `Notfallkontakt Hans Müller 0171 …`,
  `Mobil Hans Müller: 0171 …`), stoppt das Dokument mit `RESIDUAL_PII`.
  Vorher liefen diese Dokumente durch und gaben Name und Nummer lesbar frei.
  Die Ursache ist vorbestehend und in RC178 gleich: Der Kern ersetzt eine
  Nummer hinter `Label Name` nicht, seine Schlussprüfung erkennt sie aber,
  sobald der Name ersetzt ist. `Name: Hans Müller` und später
  `Tel. Hans Müller 030 1234567` stoppt deshalb schon in RC178. Die neuen
  Regeln machen Namen an mehr Stellen bekannt und erreichen diesen Stopp
  häufiger, auch im zweiten Dokument eines Stapels. Nachtrag: behoben in
  `0bd5e26f`, siehe den folgenden Abschnitt.
- **Unterredaktion:** ein voller Name in Prosa ohne Hinweisverb (`Petra Lang
  hat den Vertrag unterschrieben`), ein einzelner Nachname oder ein
  abgekürzter Vorname hinter einer Rolle oder in einer Liste (`Patient:
  Müller`, `Patient: H. Müller`, `- Müller (Protokoll)`), die umgestellte Form
  einer unbekannten Person (`Mandant: Müller, Hans`), mehrere Namen hinter
  einer Rolle in der Mehrzahl (`Zeugen: Anna Sommer, Erika Beispiel`), eine
  Namensliste ohne Label oder unter `Verteiler` und `Mitglieder`, eine
  Telefonnummer ohne Label, ein Geburtsname hinter `geb.`. Die geführte
  Prüfung zeigt diese Stellen nicht an.
- **Grenze der Ausweitung:** Nach 500 weiteren Stellen je Dokument, über alle
  Namen gezählt, bleibt der Name wie vorher lesbar, ohne Stopp und ohne
  Hinweis (1 000 Zeilen mit demselben Namen: 500 ersetzt, 500 lesbar; vorher
  1 000 lesbar).
- **Halbe Ersetzungen:** `Zeuge: Hans Peter Im Hof` wird zu
  `[PERSON_001] Im Hof`, weil `Im` auch ein Satzanfang sein kann;
  `Anna Sommer-Meier` wird zu `[PERSON_001]-Meier` und `Maria Anna Sommer`
  zu `Maria [PERSON_001]`, wenn `Anna Sommer` an anderer Stelle Hinweis ist.
  Vorher blieben diese Namen ganz lesbar.
- **Überredaktion:** Der automatische Modus ersetzt an den neuen Stellen auch
  namensförmige Organisationen, Orte und Bemerkungen als Person
  (`Vermieter: Wohnbau Kassel`, `Patient: Stabile Lage`, `- Vertrieb Nord`
  unter `Anwesend:`), wie bisher schon vor einem Hinweisverb (`Stadt Kassel
  bestätigt den Termin`); eine so entschiedene Bezeichnung wird im restlichen
  Dokument und in den folgenden Dokumenten des Stapels ebenfalls ersetzt.
  `Rückruf an 12345 Kunden` verliert die Zahl.
- **Uneinheitliche Pseudonyme:** `Patient: Hans Müller` und später
  `Herr Müller` im nächsten Dokument erhalten zwei Pseudonyme; ebenso
  `Hans Müller bestätigt …` und `Hans Müller IBAN …` im selben Dokument
  (in RC178 gleich).
- **Randfall:** Eine Zeile `RÜCKRUF UNTER 030 …` in Versalien wird zu
  `[PERSON_001] [PHONE_REDACTED]`; das Label gilt dort als Namenszeile.
- **Eigentliche Ursache:** Der Kern hat keine Liste von Vornamen und kein
  Wissen über Organisationen ohne Rechtsform. Jede Regel über die Form
  tauscht Unterredaktion gegen Überredaktion. Wer Namen in Prosa zuverlässig
  finden will, braucht ein Namensverzeichnis oder ein lokales Modell; das
  ist eine Produktentscheidung.
- **Vorbestehend und unverändert, neu beschrieben:** die Überredaktion der
  Personenfelder (siehe oben, `Kunde: zufrieden`).
- **Nicht geprüft:** XLSX, PPTX und PDF als Quelle der neuen Regeln (geprüft
  sind Text und Word); Listen mit echter Word-Nummerierung; Laufzeit bei
  Zeilen aus sehr vielen großgeschriebenen Wörtern.

## R-033 · Stopp bei Label, Name, Nummer behoben (25.11. spät)

Auftrag des Anwenders nach der vorigen Übergabe: den Stopp beheben, den die
Ausweitung der Personenhinweise häufiger erreichte. Ergebnis ist der Commit
`0bd5e26f`.

### Ursache

Die Schlussprüfung (`scanResidual` in `privacy/engine.js`) liest den Text mit
jedem Platzhalter als Leerraum. `Tel. [PERSON_001] 030 1234567` ist für sie
ein Telefonlabel direkt vor seiner Nummer. Die Redaktion las denselben Text
mit dem Platzhalter zwischen Label und Nummer und ließ die Nummer stehen. Das
Dokument stoppte mit `RESIDUAL_PII`, sobald ein Name zwischen einem Label und
einer Nummer ersetzt war. In RC178 ist das genauso; dort genügt
`Name: Hans Müller` und später `Tel. Hans Müller 030 1234567`. Betroffen
waren alle Erkennungen, die ein Label vor dem Wert verlangen: Telefon,
Geburtsdatum, Steuer-ID, Aktenzeichen, Personalnummer.

### Korrektur

| Stelle | Änderung |
| --- | --- |
| `privacy/structured.js`, `findStructuredSpans` | Enthält der Text Platzhalter, läuft die Erkennung ein zweites Mal über die Sicht der Schlussprüfung (Platzhalter als Leerraum, gleiche Koordinaten). Eine Spanne aus dem zweiten Blick, die einen Platzhalter oder eine Spanne des ersten Blicks berührt, wird verworfen. Gilt für beide Produkte. |
| `gateway/privacy-text-operation.js`, `reservePersonReviewCandidates` | Weitere Stellen eines Namens, der anderswo Personenhinweis ist, werden wieder reserviert. Der Kern sieht dort einen Platzhalter und ersetzt die Nummer schon im ersten Durchlauf. Ohne Reservierung ersetzte erst die Entscheidung der Prüfung den Namen, nach der letzten Redaktion. Der ungenaue Kommentar aus `1c8e971c` ist dabei ersetzt. |

Ergebnis: `Tel. [PERSON_001] [PHONE_REDACTED]`, entsprechend
`[DATE_REDACTED]` und `[ID_REDACTED]`.

### Nachweise

| Lauf | Ergebnis |
| --- | --- |
| Suchlauf „derselbe Name an zwei Stellen“, Kern der achten Übergabe gegen Endstand, 19 440 Fälle in fünf Profilen | 0 neue Stopps (am Stand `1c8e971c` 1 608), 0 mehr sichtbar, 11 096 weniger sichtbar; 356 Fälle, die schon am Kern der achten Übergabe stoppten, laufen jetzt durch. Mit maskierten Zeichen, 3 888 Fälle: 0 neue Stopps, 40 behobene. |
| RC178-Kern gegen Endstand, 18 600 Fälle, wie geschrieben und mit maskiertem Punkt | unverändert: 0 neue Stopps; „mehr sichtbar“ nur die zehn gewollten Fälle von R-024. |
| Kern der achten Übergabe gegen Endstand, 1 230 und 240 Zeilen | unverändert: 0 neue Stopps, 0 mehr sichtbar, 774 weniger sichtbar, 6 von 240 personenfreien Zeilen zusätzlich ersetzt. |
| Stichprobe: vier Hinweiszeilen mal 16 Zeilen mit Label, Name und Wert, als ein Dokument und als Stapelpaar | Kern der achten Übergabe: 51 Stopps von 128; Endstand: 0. |
| `tests/test-privacy-role-labels-and-name-lists.js` | 9 Tests bestanden; der neue Test schlägt am Kern von `1c8e971c` fehl. |
| Kernabhängige Testdateien der Suite | 106 Dateien, die den Datenschutzkern laden, einzeln ausgeführt: alle bestanden. `tests/test-pii-regression.js`: 164 Fälle bestanden. Danach die Gesamtsuite: 367 Dateien bestanden. |

### Gegenprüfung

Ein unabhängiger Read-only-Lauf, Kern von `1c8e971c` gegen den Endstand,
mit dem Auftrag zu widerlegen: rund 1 800 gezielte Fälle (elf
Platzhalter-Schreibweisen im Quelltext mal 83 Schablonen, 16 weitere
Umgebungen für denselben Namen an zwei Stellen, maskierte Zeichen), dazu rund
30 000 Zufallsfälle. Kein Fall mit mehr Klartext, kein neuer Stopp, kein
beschädigter Platzhalter. Laufzeit des Kerndurchlaufs bei 5 000 Platzhaltern
1,3- bis 1,6-fach, linear wachsend.

Die Gegenprüfung hat eine Behauptung von mir berichtigt. Ich hatte angenommen,
der zweite Blick ändere nur Dokumente, die bisher stoppten. Er ändert auch
solche, die durchliefen:

- `Telefon: [PERSON_001] 0171 2345678` in einem Quelltext, der selbst
  Platzhalter enthält: vorher `Telefon: [FIELD_REDACTED]`, jetzt
  `Telefon: [FIELD_REDACTED] [PHONE_REDACTED]`. Mehr ersetzt, nie weniger.
- Die Schlussprüfung wird in seltenen Fällen selbst strenger, weil die
  Darstellungsbereinigung (`canonicalizeRenderedText`, `privacy/base.js`)
  dieselbe Erkennung nutzt. Ein Zufallsfall von 6 000 auf Kernebene; im
  Ablauf der ganzen Operation kein neuer Stopp.
- **Eine geschlossene Lücke:** `Name: Hans Müller` und später
  `Tel. Hans Müller \(030\) 1234567` (maskierte Klammern der Vorwahl, wie aus
  Word) wurde vorher mit lesbarer Nummer freigegeben, ohne Stopp. Jetzt ist
  die Nummer ersetzt. Als Test aufgenommen.

### Was bleibt

- **Ein Stopp hatte nebenbei geschützt.** Ein Dokument, das vorher wegen
  einer solchen Nummer stoppte, wird jetzt freigegeben, auch wenn es an
  anderer Stelle einen Namen enthält, den der Kern nicht erkennt
  (`Tel. [EMAIL_REDACTED] 030 1234567 Hans Müller und Hans Müller`;
  `Von: Hans Müller`, `An: Erika Beispiel`, `Tel. Herr Hans Müller 030 …`
  lässt `Erika Beispiel` lesbar). Fünf von 324 solchen Fällen der
  Gegenprüfung. Die Ursache ist die bekannte Lücke für Namen ohne Hinweis,
  nicht diese Änderung.
- **Unverändert:** `Tel. Hans Müller 030 1234567` ohne jeden weiteren Hinweis
  auf die Person bleibt mit Name und Nummer lesbar; für beide Leser steht das
  Label dort nicht vor der Nummer.
- **Zwei Stopps bleiben Stopps** mit anderem Code
  (`AMBIGUITY_REVIEW_REQUIRED` statt `RESIDUAL_PII`): dieselbe Zeile zweimal
  (`Tel. [PERSON_001] 030 1234567 und Tel. [PERSON_001] 030 1234567` im
  Quelltext) und `Geburtsdatum Hans Müller 01.02.1980` mit einem zweiten
  Namen.
- **Label mit ersetzt:** `Zeuge: Hans Müller` und später
  `Steuer-ID Hans Müller 12345678903` wird zu `[PERSON_002] [ID_REDACTED]`;
  die Restprüfung liest `Steuer-ID Hans Müller` als einen Hinweis.
- **Nicht geprüft:** echte Office-Dateien mit Platzhaltern in Tabellenzellen;
  5 000 Platzhalter in einer einzigen Zeile; die Korrektur ist nach der
  Gegenprüfung nur noch um einen Test ergänzt worden.

## R-019 und R-034 · Frühere Oberfläche entfernt (25.11. nachts)

Entscheidung des Anwenders vom 25.11.: die frühere Oberfläche entfernen.
Ergebnis ist der Commit `1d908311`, davor `8cf5dd93` für R-034.

### Was entfernt ist

| Datei | Umfang | Rolle |
| --- | --- | --- |
| `apps/datasecure-standalone/frontend/index.html` | 155 Zeilen | frühere Hauptseite; vom Hauptfenster nicht geladen, aber paketiert |
| `apps/datasecure-standalone/frontend/app.js` | 1 312 Zeilen, 81 KB | ihr Skript |
| `apps/datasecure-standalone/frontend/styles.css` | 91 Zeilen | ihr Stylesheet |
| `tests/test-standalone-frontend.js` | 1 777 Zeilen, 52 Tests | prüfte ausschließlich `app.js` und `index.html` |
| `tests/manual/standalone-ui-browser.mjs` | 112 Zeilen | Browser-Fixture für `index.html` |

Die Suite hat damit 366 statt 367 Dateien. Die Oberfläche ist in die Hülle
eingebettet; deren Programmdatei ist um rund 25 KB kleiner (5 505 024 auf
5 479 936 Bytes), die Zahl der Paketeinträge bleibt 1 203. Rust-Quellen sind
nicht geändert.

### Was umgebunden ist

- **`tests/test-standalone-desktop-contract.js`** las an rund 40 Stellen
  `app.js` oder `index.html`. Diese Prüfungen lesen jetzt die Skripte, die das
  ausgelieferte Fenster lädt. Wo die neue Oberfläche dieselbe Eigenschaft
  anders umsetzt, ist das Muster angepasst (Auswahl über `pick`, Start über
  `perform('start_admitted_batch', args)`, Quittung des Abschlusses mit
  `presentationGeneration`, Ergebnisordner als Text, Zweck als zwei nicht
  vorbelegte Optionsfelder, ein Statusleser mit einem nachgestellten Timer).
  Entfallen sind sechs Prüfungen, die nur Namen der früheren Oberfläche
  festhielten (`refreshInFlight`, `resetAdmissionUi`, `action-feedback`,
  `activeView = 'home'`, die Zahl der Aufrufe von `switchView('results')`, der
  Knopf `continue`).
- **`tests/test-standalone.js`**: die Prüfung, dass die Dateizuordnung nur bei
  vorhandenem Ledger angeboten wird, liest `workspace.js`.
- **`tests/test-native-smoke-integrity.js`**: die Prüfung der Browser-Fixture
  liest das Vorschaumodul der neuen Oberfläche.
- **`tests/test-standalone-loaded-frontend-contract.js`**: neuer Test. Der
  paketierte Ordner `frontend` enthält genau die Dokumente, Skripte und
  Stylesheets, die die Fenster laden, dazu die Schrift mit ihrer Lizenz. Eine
  nicht geladene Seite fällt damit künftig auf.

### R-034 · Vier Fehlercodes ohne Erklärung in der geladenen Oberfläche

- **Ort:** `apps/datasecure-standalone/frontend/workspace.js`, Tabelle
  `reasons`.
- **Ist (bis zu diesem Commit, in RC178 gleich):** Der Core liefert
  `SOURCE_FOLDER_UNSUPPORTED_FILES`, `STANDALONE_NO_ADMISSION`,
  `BATCH_PSEUDONYM_CAPACITY_EXCEEDED` und
  `STANDALONE_RESULT_BINDING_UNAVAILABLE`. Die geladene Oberfläche kannte sie
  nicht und zeigte ihren allgemeinen Satz „Der lokale Vorgang konnte nicht
  abgeschlossen werden …“ mit dem Code in Klammern. Erklärt hat sie nur die
  frühere Oberfläche; der Vertragstest prüfte die Erklärungen dort und
  bestand.
- **Reproduktion:** Suche nach den vier Codes in den geladenen Skripten vor
  dem Commit: kein Treffer.
- **Soll:** eine verständliche Erklärung je Code, wie der Vertragstest sie
  verlangt.
- **Auswirkung:** niedrig. Die Meldung war unspezifisch, aber nicht falsch.
- **Status:** behoben. Vier Texte ergänzt, im Wortlaut an den festen
  Meldungen des Core ausgerichtet. Gefunden beim Umbinden des Vertragstests;
  das ist genau der Fall, den R-019 beschrieb. BL-050.6.

### Beobachtungen, nicht behoben

- **Native Befehle ohne Aufrufer.** In der Berechtigung des Hauptfensters
  stehen vier Befehle, die kein geladenes Skript mehr ruft:
  `remove_admitted_source` und `open_review_window` (rief nur die frühere
  Oberfläche), `open_local_ledger` und `shutdown` (rief schon vorher kein
  Skript). Das getrennte Prüffenster (`open_review_window`, eigene
  Berechtigungsdatei `capabilities/review.json`) öffnet damit nur noch die
  Startprobe. Entfernen hieße, die Hülle für drei Betriebssysteme zu ändern;
  das ist hier nur für Windows übersetzbar und eine eigene Entscheidung.
- **Einzelnes Entfernen aus der Auswahl** bot nur die frühere Oberfläche. Die
  neue löst dasselbe über die Häkchen des Quellenkatalogs (so `PRODUCT.md`);
  das ist kein Verlust, erklärt aber den verwaisten Befehl.
- **52 Tests entfallen ersatzlos.** Sie prüften Verhalten der früheren
  Oberfläche. Für die neue gibt es `tests/test-standalone-workspace.js` mit
  535 Tests; ich habe nicht Test für Test abgeglichen, ob jedes dort geprüfte
  Verhalten auch für die neue Oberfläche geprüft ist. Nachtrag: Der
  Einzelabgleich ist nachgeholt, siehe den Abschnitt „R-035 und R-036 ·
  Abgleich der 52 entfallenen Tests“. Zwei der 52 Verhalten sind dort gedeckt.
- **`docs/canonical/TRACEABILITY.md`** nennt die entfernten Dateien an 18
  älteren Stellen. Ein neuer Eintrag am Anfang sagt, dass diese Stellen den
  damaligen Stand beschreiben; einzeln nachgezogen sind sie nicht.

### Berichtigung

In meiner Antwort an den Anwender vor dieser Änderung stand, der Backlog
führe die Standardumschaltung als offen. Das war falsch gelesen: Die Zeile
steht in einer als historisch gekennzeichneten Tabelle vom 08.10.2026. Der
Backlog nennt `workspace.html` als regulären Einstieg und die
Standardumschaltung als erledigt. Veraltet war nur ein Satz in
`docs/canonical/PRODUCT.md`; er ist berichtigt. Entsprechend war auch die
Begründung im Abschnitt „Was nicht umgesetzt ist“ der Nachmittagsrunde zu
R-019 nicht tragfähig.

### Nachweise

| Lauf | Ergebnis |
| --- | --- |
| 53 Testdateien der Suite, die Oberfläche, Paket oder die geänderten Dokumente berühren | 51 bestanden; die zwei übrigen brauchen Aufrufparameter des Suite-Runners und bestehen in der Suite. |
| `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings` | 339 bestanden, 0 fehlgeschlagen, 3 ignoriert; Clippy ohne Warnung. Rust-Quellen sind unverändert. |
| Gesamtsuite, Paket, Startprobe, nativer Lauf | siehe ERGEBNIS.md |

### Grenzen

- Nur Windows gebaut und bedient. Für macOS und Linux ändert sich der
  eingebettete Ordner ebenso; übersetzt ist das hier nicht.
- Die frühere Oberfläche lässt sich aus der Versionsgeschichte zurückholen;
  sie enthielte dann keine der Korrekturen dieses Reviews.

## R-035 und R-036 · Abgleich der 52 entfallenen Tests

Auftrag des Anwenders nach dem Entfernen der früheren Oberfläche: die 52
entfallenen Tests einzeln abgleichen. Die vollständige Tabelle steht in
[ABGLEICH-ALTE-OBERFLAECHE.md](ABGLEICH-ALTE-OBERFLAECHE.md). Am Produkt ist
in dieser Runde nichts geändert.

### Ergebnis

| Urteil | Anzahl | Bedeutung |
| --- | --- | --- |
| gedeckt | 2 | Verhalten vorhanden und an der geladenen Oberfläche geprüft |
| teilweise | 29 | ein Teil geprüft; die Tabelle nennt den Rest |
| ungeprüft | 9 | Verhalten vorhanden, kein Test gefunden |
| entfällt | 7 | durch ein anderes Bedienkonzept ersetzt |
| Lücke, am Code bestätigt | 2 | Verhalten fehlt der geladenen Oberfläche (R-035, R-036) |
| Lücke, nicht belegt | 1 | Prüfstart-Fehler erreicht den Anwender nur als allgemeiner Satz; Ablauf nicht nachgestellt |
| ohne Rückmeldung | 1 | erfolgreiches Öffnen eines Ordners wird nicht bestätigt; keine dokumentierte Anforderung gefunden |
| möglicher Wettlauf | 1 | Leeren der Auswahl gegen einen gleichzeitigen Drop; aus dem Code abgeleitet |

Die frühere Oberfläche war also mehr als Ballast: Ihre Tests hielten Verhalten
fest, das der geladenen Oberfläche zum Teil fehlt und zum größeren Teil dort
nicht geprüft ist. Das Entfernen hat daran nichts geändert, es hat es sichtbar
gemacht. Alle hier genannten Lücken bestehen in RC178 genauso, weil RC178
bereits `workspace.html` lädt; ich habe das am Tag `v3.2.0-rc178`
nachgesehen.

### R-035 · Hinweis auf einen Ergebnisordner im Netzwerk fehlt

- **Ort:** `apps/datasecure-standalone/frontend/workspace.js`, `configure`
  (Zeile 2175); Core: `plugins/data-secure/server/standalone/application-service.js:1557`.
- **Ist:** Wählt der Anwender einen Ergebnisordner auf einem Netzlaufwerk,
  liefert der Core `network_folder_notice: true`. Kein geladenes Skript liest
  dieses Feld; die Oberfläche übernimmt den Ordner ohne Hinweis.
- **Reproduktion:** Suche nach `network_folder_notice` und `Netzlaufwerk` in
  den fünf geladenen Skripten und in `workspace.html`: kein Treffer. In
  `app.js` des Tags `v3.2.0-rc178` zwei Treffer; der entfallene Test
  „a configured network result folder produces a visible local warning“
  prüfte den Hinweis dort.
- **Soll:** `docs/canonical/TRACEABILITY.md` (BL-002, BL-040.5, DS-080):
  Ein ausdrücklich gewählter Netzwerk-Ergebnisordner bleibt zulässig, erzeugt
  aber einmalig einen pfadfreien Hinweis in Cowork und Standalone; Standalone
  sagt zusätzlich, dass seine Zuordnungsdatei über das Netzlaufwerk übertragen
  werden kann.
- **Auswirkung:** mittel. Die vertrauliche Zuordnung mit Originalnamen landet
  ohne Hinweis auf einem Netzlaufwerk. Kein Abfluss an Dritte durch das
  Produkt; der Anwender verliert die Information, die die Entscheidung DS-080
  ihm zusichert.
- **Status:** behoben in `d474a579`, siehe „R-035 und R-036 · Umsetzung“. Nicht
  nativ beobachtet (kein Netzlaufwerk im Testprofil).

### R-036 · Fehlerdetails und Erklärungen des Core erreichen die Oberfläche nicht

- **Ort:** `workspace.js`, `errorCode` (Zeile 550) und Tabelle `reasons`.
- **Ist:** Die geladene Oberfläche wertet von einem Fehler nur den Code aus
  und verwirft die Details. Für diese Codes hat sie außerdem keinen eigenen
  Text und zeigt den allgemeinen Satz mit dem Code in Klammern:
  `SOURCE_SELECTION_REJECTED`, `SOURCE_ARTIFACT_IGNORED`,
  `MARKDOWN_CONVERSION_NOT_READY`, `STANDALONE_DROP_MIXED`,
  `SOURCE_SNAPSHOT_CHANGED`. Nicht angezeigt werden auch die Hinweise des Core
  auf übersprungene Begleitdateien (`ignored_artifact_count`) und auf bereits
  enthaltene Dateien (`already_selected_count`).
- **Reproduktion:** Suche nach den fünf Codes und den beiden Feldern in den
  geladenen Skripten: kein Treffer. Im Core und in der Hülle werden alle
  weiter erzeugt. Beispiel aus dem Core: Bei mehreren gewählten Dateien, von
  denen eine nicht sicher aufgenommen werden kann, lautet seine Meldung „Die
  betroffenen Dateien stehen in den Details“
  (`application-service.js:1059`); die Oberfläche zeigt diese Details nicht.
- **Soll:** BL-010.46 (konkrete Fehlerdateien lokal anzeigen): Name und Grund
  der betroffenen Datei, eine Erklärung je Code.
- **Auswirkung:** niedrig bis mittel. Der Anwender erfährt bei einer
  abgelehnten Auswahl nicht, welche Datei der Grund ist, etwa eine
  Office-Sperrdatei `~$…`. Kein Datenschutzrisiko.
- **Status:** behoben in `d474a579` und `6e10ac80`, siehe „R-035 und R-036 ·
  Umsetzung“ und „Nachprüfung · Geführte Prüfung, native Meldung, offene Punkte des Abgleichs“.
  Vier Codes derselben Art sind als R-034 schon ergänzt;
  diese fünf und die Details hat erst der Einzelabgleich gezeigt. Welche der
  Codes im Ablauf mit dem Quellenkatalog praktisch noch auftreten, habe ich
  nur für `SOURCE_SELECTION_REJECTED` am Code nachvollzogen.

### Weitere Beobachtungen aus dem Abgleich

- **Prüfstart-Fehler** (Nr. 6): Scheitert das Fortsetzen vor der Prüfung,
  öffnet `beginReview` die Prüfung nicht, und es erscheint der allgemeine
  Satz. Die Erklärungen stehen in `review.js` und sind nur erreichbar, wenn
  die Prüfung schon offen ist. Nicht nachgestellt.
- **Zweiter Start bei offener Prüfung** (Nr. 3): Der Zustand
  `review_required` zählt in der Oberfläche nicht als aktiver Lauf; ob dann
  ein zweiter Start möglich ist und ob der Core ihn ablehnt, ist nicht
  geprüft.
- **Unbestätigte Beendigung** (Nr. 51): `termination_unconfirmed` ist in der
  Oberfläche nur Schutzbedingung, keine Anzeige.
- **Erststart-Anleitung zum Ergebnisordner** (Nr. 13) gibt es nicht mehr; ob
  sie gewünscht ist, ist eine Produktentscheidung.
- **Tests:** 38 der 52 Verhalten sind an der geladenen Oberfläche gar nicht
  oder nur zum Teil geprüft, darunter die Tastaturbedienung der Navigation,
  die Begrenzung des Verlaufs auf fünf Zeilen im Fenster, das Verwerfen
  später Antworten nach dem Schließen und die Wiederherstellung einer Auswahl
  nach dem Neuladen.

### Grenzen

- Der Abgleich stammt aus vier unabhängigen Read-only-Durchgängen. Selbst
  nachgeprüft habe ich die fünf gemeldeten Lücken, die fehlenden Codes und
  Felder und elf zufällig gewählte Fundstellen (alle zutreffend). Die übrigen
  Zeilen der Tabelle habe ich nicht ein zweites Mal gelesen.
- „Gedeckt“ heißt: Ein Test führt das Verhalten in einer nachgebildeten
  Umgebung aus. Im Fenster beobachtet ist damit nichts.
- Ein Durchgang hat sein Kontingent überschritten und alle 13 Tests
  bearbeitet; keiner hat einen Test als „nicht geprüft“ zurückgegeben.

## R-035 und R-036 · Umsetzung

Auftrag des Anwenders nach dem Einzelabgleich: beide Befunde beheben.
Ergebnis ist der Commit `d474a579`. Geändert sind nur die geladene Oberfläche
(`workspace.js`, eine Eigenschaft in `workspace.css`) und ihr Test; Core und
Hülle lieferten die Angaben schon.

### Was sich geändert hat

| Befund | Änderung | Ort |
| --- | --- | --- |
| R-035 | Nach der Wahl eines Ergebnisordners auf einem Netzlaufwerk trägt die Bestätigung den Hinweis nach DS-080, ohne Pfad: Ergebnisse und die vertraulichen Zuordnungsdateien können darüber an andere Systeme übertragen werden. | `workspace.js`, `configure` |
| R-036 | Eine abgelehnte Auswahl nennt bis zu zehn Dateien mit ihrem Grund und zählt den Rest; das gilt für die Auswahl über den Dialog und für das Hineinziehen. | `errorDetails`, `sourceDetailText`, `showError` |
| R-036 | Fünf Codes haben einen eigenen Satz: `SOURCE_SELECTION_REJECTED`, `SOURCE_ARTIFACT_IGNORED`, `STANDALONE_DROP_MIXED`, `MARKDOWN_CONVERSION_NOT_READY`, `SOURCE_SNAPSHOT_CHANGED`. | Tabelle `reasons` |
| R-036 | Eine angenommene Auswahl sagt, wie viele Dateien schon enthalten waren und welche bekannten Begleitdateien übersprungen wurden (bis zu fünf Namen). | `admissionHints`, `pick`, Drop-Zweig |
| beide | Die Meldungszeile stellt Zeilenumbrüche dar. | `workspace.css`, `.notice` |

Namen erscheinen nur als Text in der Meldung. Kein Befehl und kein anderes
Element der Oberfläche erhält sie; das hält ein Test fest.

### Gegenprüfung

Ein unabhängiger Read-only-Lauf mit dem Auftrag zu widerlegen, vor dem Commit.
Kein Weg gefunden, auf dem ein Dateiname die Oberfläche verlässt; kein
Typ- oder Prototypfehler; keine Nebenwirkung auf andere Aufrufer von
`showError`. Vier Punkte:

| Punkt | Folge |
| --- | --- |
| Die Meldung hatte keine Obergrenze: 200 Namen zu je 1 024 Zeichen ergaben einen angesagten Text von rund 210 000 Zeichen. | Behoben: höchstens zehn Namen, bei Begleitdateien fünf, der Rest als Zahl. |
| Richtungs- und Zeilentrennzeichen in einem Namen (U+202E, U+2028 und verwandte) wurden im Satz ausgegeben. | Behoben für die neuen Sätze: ein solcher Name wird gezählt, nicht gezeigt. Im Dateibaum bleibt es wie bisher (Rest von R-020). |
| Der Core erkennt ein Netzlaufwerk nur am UNC-Pfad (`\\server\…`). Ein zugeordneter Laufwerksbuchstabe und ein Mount unter `/Volumes` lösen den Hinweis nicht aus. | Nicht behoben; liegt im Core (`gateway/result-folder-config.js`, `isNetworkResultFolder`), war schon vorher so und ist eine Frage an DS-080. Siehe Grenzen. |
| Es gebe keinen Test, dass der Standalone-Core das Feld liefert. | Trifft nicht zu: `tests/test-standalone.js`, `networkResultFolderNoticeCase`, prüft genau das. |

Die beiden Korrekturen nach der Gegenprüfung sind nicht mehr unabhängig
gegengeprüft, nur getestet.

### Eigener Fehler dieser Runde

Beim Einbau des Filters für Richtungszeichen hat mein Editierwerkzeug die
Escape-Schreibweisen als echte, unsichtbare Zeichen in `workspace.js` und in
die Testdatei geschrieben. Ein wörtliches U+2028 in einem regulären Ausdruck
ist ein Zeilenende; `workspace.js` war damit nicht mehr lesbar. Aufgefallen ist
es, weil der Testlauf ohne Ergebniszeile endete. Vor dem Commit behoben; beide
Dateien sind auf solche Zeichen durchsucht und enthalten keine.

### Nachweise

| Lauf | Ergebnis |
| --- | --- |
| `tests/test-standalone-workspace.js` | 540 Tests bestanden, davon fünf neu. An der Oberfläche von `1d908311` schlagen diese fünf fehl. |
| Nachbartests: Vertragstest der Hülle (43), Vertrag der geladenen Oberfläche (5), `test-standalone.js` (91), Dokumentansicht (308), Prüfansicht (74) | bestanden |
| Gesamtsuite, Paket, Startprobe, nativer Lauf | siehe ERGEBNIS.md |

### Grenzen

- **Netzlaufwerk nur am UNC-Pfad erkannt.** Wer eine Freigabe als
  Laufwerksbuchstaben eingebunden hat oder am Mac unter `/Volumes` wählt,
  bekommt den Hinweis weiterhin nicht. Auf macOS erscheint er damit praktisch
  nie. R-035 ist für den Fall behoben, den der Core erkennt.
- **Nicht nativ beobachtet.** Im Testprofil gibt es kein Netzlaufwerk, und eine
  abgelehnte Auswahl habe ich über die Fensterbedienung nicht ausgelöst. Belegt
  ist das Verhalten durch Tests in einer nachgebildeten Umgebung; ob der
  Zeilenumbruch im Fenster so aussieht wie gedacht, ist nicht gesehen.
- **Höchstens zehn Namen.** Bei einer großen abgelehnten Auswahl sieht der
  Anwender die ersten zehn und eine Zahl; eine vollständige Liste gibt es an
  dieser Stelle nicht.
- **Die drei nicht belegten Punkte des Abgleichs** (Prüfstart-Fehler,
  Rückmeldung nach erfolgreichem Öffnen, möglicher Wettlauf beim Leeren der
  Auswahl) und die 38 nicht oder nur zum Teil getesteten Verhalten sind
  unverändert.

## Nachprüfung · Geführte Prüfung, native Meldung, offene Punkte des Abgleichs

Nach der Übergabe von R-035 und R-036 hat der Anwender gefragt, ob etwas
Wichtiges fehlt. Es fehlte etwas, und zwar von mir: Die geführte Prüfung war
seit den Erkennungsregeln aus R-033 nie angesehen worden; alle nativen Läufe
und Vergleichsläufe liefen im automatischen Modus. Der Anwender hat diese
Prüfung und vier weitere Arbeiten beauftragt. Ergebnis sind die Commits
`6e10ac80` und `3b85e395`.

### Geführte Prüfung mit den Personenhinweisen aus R-033

- **Frage:** Seit `1c8e971c` gilt ein Personenhinweis an bis zu 500 weiteren
  Stellen desselben Namens. Ein Name, der 200-mal vorkommt, ergibt 201
  Hinweise statt einem. Muss der Anwender in der geführten Prüfung 201-mal
  entscheiden?
- **Antwort: nein.** Der Prüfentwurf fasst Personenhinweise mit derselben
  Schreibweise zu einer Entscheidung zusammen
  (`core/local-review-model.js`, `decisionGroups`); das Prüffenster zeigt je
  Gruppe eine Zeile. Gemessen am Kern: 403 Hinweise ergeben 3 sichtbare
  Entscheidungen.
- **Nativ bedient:** am Paket `f641f720…` der dreizehnten Übergabe (der
  Endstand ändert danach nur Fehlertexte der Arbeitsfläche) ein erfundenes
  Protokoll mit einer Rollenzeile, einer Namensliste und 30 Sätzen, in denen zwei der Namen stehen. Das Fenster zeigt
  „0 von 63 Fundstellen vorgemerkt“ und drei Zeilen: `Hans Müller 31
  Fundstellen`, `Anna Sommer 31 Fundstellen`, `Erika Beispiel 1 Fundstelle`,
  dazu „Diese Entscheidung gilt für 31 nachweislich gleiche Fundstellen in
  diesem Stapel“. Alle drei Zeilen angehakt, **Als Person / sensible Angabe
  ersetzen** gewählt, **63 Entscheidungen speichern und fortfahren**: Der Lauf
  endet mit einem Ergebnis, in dem kein Name mehr steht und jede Person an
  allen Stellen dasselbe Pseudonym trägt.
- **Grenze, jetzt genauer:** Die 500 weiteren Stellen werden in der
  Reihenfolge der Namen vergeben. Kommen zwei Namen je 500-mal vor, erhält der
  erste alle 500, der zweite keine: Er hat eine Zeile mit einer Fundstelle,
  und seine übrigen Vorkommen bleiben nach der Entscheidung lesbar. Vor R-033
  blieben alle lesbar; es ist die schon genannte Grenze, aber ungleich
  verteilt.

### R-036 im echten Fenster

- **Beobachtet:** Eine Office-Sperrdatei (`~$Bericht.docx`) neben einem
  gültigen Word-Dokument, zusammen mit einer Textdatei über den Dateidialog
  gewählt. Das Fenster zeigt in eigenen Zeilen: „Diese Dateiauswahl konnte
  nicht übernommen werden. Die bisherige Auswahl bleibt unverändert.
  (SOURCE_SELECTION_REJECTED)“, „Nicht aufgenommen (1):“ und
  „• ~$Bericht.docx: Temporäre Office-Sperrdateien sind keine Dokumente. …“.
  Damit ist der Weg Core, Hülle, Oberfläche einmal nativ gesehen, samt
  Zeilenumbruch.
- **Dabei gefunden und behoben:** Wird nur die Sperrdatei gewählt, trägt die
  Datei denselben Code wie die Meldung, und der Satz stand zweimal da. Die
  Liste nennt jetzt nur den Namen (`6e10ac80`). Am Paket des Endstands
  erneut beobachtet: „Temporäre Office-Sperrdateien sind keine Dokumente. …
  (SOURCE_ARTIFACT_IGNORED)“, „Nicht aufgenommen (1):“, „• ~$Bericht.docx“.
- **Auch gelernt:** Der Core hält eine Datei `~$…` nur dann für eine
  Sperrdatei, wenn sie klein ist, selbst kein Office-Dokument ist und daneben
  ein größeres gültiges Dokument liegt. Ohne dieses Dokument führt der
  Quellenkatalog sie als gewöhnliche, auswählbare Zeile.

### Die drei nicht belegten Punkte des Abgleichs

| Punkt | Ergebnis |
| --- | --- |
| Nr. 43, Wettlauf zwischen Leeren der Auswahl und Hineinziehen | **Für das Produkt widerlegt.** Die Hülle nimmt für `cancel_admission` und für das Hineinziehen dieselbe Sperre (`selection_guard` in `main.rs`); ein Drop während des Leerens wird abgelehnt. In der Oberfläche allein wäre der Ablauf möglich; die Hülle lässt ihn nicht zu. Keine Änderung. |
| Nr. 6, Fehler beim Start der Prüfung | **Bestätigt und behoben.** Der Core lehnt das Fortsetzen mit einer von vier Ursachen ab (`LOCAL_REVIEW_START_MISSING`, `_DENIED`, `_ARCHITECTURE`, `_FAILED`; `tests/test-standalone-continuation.js`). Die Prüfung öffnet dann nicht, und die Arbeitsfläche zeigte den allgemeinen Satz. Die vier Sätze stehen jetzt auch dort (`6e10ac80`), mit Test. Gehört zu R-036. |
| Nr. 27, keine Rückmeldung nach erfolgreichem Öffnen | **Als Tatsache bestätigt, nicht geändert.** `perform` meldet nur Fehler; die Antwort `handoff_confirmed` des Core wertet die Arbeitsfläche nicht aus. Eine dokumentierte Anforderung an eine solche Rückmeldung habe ich nicht gefunden; ob sie gewünscht ist, ist eine Entscheidung. |

### Tests für bisher ungeprüftes Verhalten

Neun Verhalten der geladenen Oberfläche hatten laut Abgleich keinen Test. Dazu
gibt es jetzt sieben Tests in `tests/test-standalone-workspace.js`
(`3b85e395`); ein achter gilt dem Prüfstart-Fehler (Nr. 6). Die Datei hat
damit 548 Tests:

| Nr. im Abgleich | Verhalten | Test |
| --- | --- | --- |
| 14 | Pfeiltasten, Pos1 und Ende versetzen nur den Fokus der Navigation; erst ein Klick aktiviert | „navigation tabs: arrow keys …“ |
| 15, 20, 22 | fünf Verlaufszeilen im Fenster, die Texte „letzte 5“, Zuordnungen öffnen mit der Lauf-ID der Zeile, keine Löschaktion | „the history shows five rows …“ |
| 11, 21 | Teil-Dateiliste als unvollständig gezeigt, unsicherer Name verworfen, ungültiger Umschlag nicht gezeigt, genau ein ausdrückliches erneutes Laden | „partial file details …“ |
| 19 | nach dem Schließen wird eine späte Antwort nicht gezeigt und kein Befehl mehr gesendet | „after the window is closing …“ |
| 29 | eine Auswahl, die der Core noch hält, erscheint beim Laden wieder, ohne Zweck und ohne Start; fehlt der Drop-Empfänger, bleibt der Dialog | „a selection the Core still holds …“ |
| 32 | eine abgelehnte Ordnerwahl behält ihren Grund über Statusabfragen, bis eine gültige Auswahl sie ersetzt | „a refused folder keeps its reason …“ |
| 40 | eine vor Auswahl und Start angeforderte Statusantwort übermalt den neuen Lauf nicht | „a status answer requested before …“ |

Das Testgerüst hält dafür die Fensterereignisse fest, kann mit einer vom Core
gehaltenen Auswahl beginnen und einen Empfänger scheitern lassen.

**Verfälschungsprobe:** 16 gezielte Änderungen an einer Kopie von
`workspace.js` (Fokus wird nicht versetzt, 50 statt 5 Zeilen, Zuordnung ohne
Lauf-ID, späte Antwort wird gezeigt, Hinweis auf Netzlaufwerk immer, keine
Obergrenze der Namen und weitere). Die Tests erkennen alle 16.

Von den 52 Verhalten des Abgleichs sind damit 11 gedeckt statt 2. Die 29 nur
zum Teil geprüften sind unverändert.

### Entscheidung zum Netzlaufwerk (R-035, Grenze)

Der Core erkennt einen Ergebnisordner nur am UNC-Pfad als Netzlaufwerk; bei
einem zugeordneten Laufwerksbuchstaben und unter `/Volumes` bleibt der Hinweis
nach DS-080 aus. Der Anwender hat nach der dreizehnten Übergabe gefragt, wofür
das wichtig ist, und entschieden, es vorerst so zu belassen. Der Hinweis
informiert; die Verarbeitung läuft mit und ohne ihn gleich. Die Übersicht führt
den Punkt deshalb nicht mehr als offen, sondern als belassen.

### Gegenlesen von ERGEBNIS.md

Auf Auftrag hat ein unabhängiger Read-only-Lauf ERGEBNIS.md vollständig gegen
das Repository und diese Datei gelesen und 32 Stellen gemeldet. Die
wichtigsten:

- Die Tabellen „Änderungen je Thema“ endeten bei `2ce74b9f`; 18 spätere
  Codecommits fehlten dort.
- Vier Urteile je Prüfdimension beschrieben einen früheren Stand (R-033b bis d
  als offen, „kein Zoom“, eine einzige Laufzeitmessung, kein Wort zu R-034 bis
  R-036).
- Die Übergabenachricht hatte zwei Punkte zu R-035 und R-036, einen vor und
  einen nach der Behebung, und Nummern von `000000` bis `8`.
- R-019 stand als teilweise behoben, R-033 fehlte in dieser Liste; vier Zeilen
  nannten den Paket-Smoke-Test mit der Endung `.js` statt `.mjs`.
- Der Abschnitt „Mac-Status“ nannte fünf geänderte Rust-Dateien; es sind acht.

Ich habe jede Meldung am Repository nachgeprüft und berichtigt, was zutraf
(`84474ffe`). Nicht übernommen: eine Neugliederung des Dokuments. Der Lauf
endete am Schrittlimit und hat seinen Bericht auf Nachfrage geliefert; nicht
geprüft hat er die Testzahlen der Tabelle, die Paket-Hashes und die
Fingerprints.

### R-037 · Ergebnisabfrage direkt nach Laufende einmal mit „belegt“ beantwortet

- **Ort:** `tests/helpers/standalone-packaged-markdown.mjs:126-130` (Prüfung
  „initial readiness never retries a conflict“), aufgerufen aus
  `tests/test-standalone-sidecar.js:828`. Im Core:
  `standalone/application-service.js:942-949` (`resolveHistoryResults`),
  `gateway/standalone-document-review-store.js:156-159` und `2352`
  (`resolveResultsGeneration` unter `lockedAsync`),
  `gateway/standalone-document-control.js:41-42` (eine belegte Sperre wird zu
  `STANDALONE_BUSY`).
- **Beobachtet:** Der erste Lauf der Headless-Suite am Endstand (27.11., 12:15
  bis 12:27 Uhr) brach in `tests/test-standalone-sidecar.js` ab. Nach dem
  gemeldeten Abschluss eines Laufs „Nur umwandeln“ beantwortete der Core
  `resolve_history_results` mit `STANDALONE_BUSY`. Der Test lässt an dieser
  Stelle nur `STANDALONE_RESULTS_MISSING` und `RESULT_PUBLICATION_PENDING` zu.
- **Reproduktion:** nicht gelungen. Dieselbe Testdatei allein dreimal
  hintereinander: bestanden (je rund 205 s). Dieselbe Testdatei viermal gleichzeitig: alle vier bestanden (257 s). Der
  zweite Lauf der Suite (12:39 bis 13:29 Uhr) bestand vollständig. In keinem
  früheren vollständigen Suite-Lauf dieses Reviews trat der Abbruch auf.
- **Ist, aus dem Code gelesen:** Die Abfrage nimmt die Sperre des Laufs. Hält
  der Arbeitsprozess sie noch, lautet die Antwort „belegt“ statt
  „Veröffentlichung läuft noch“. Der Test nennt das Zeitfenster selbst
  („Technical completion may precede the worker's result-directory copy“).
- **Soll:** Laut Test wird die erste Bereitschaft nie als Konflikt
  beantwortet.
- **Auswirkung:** für den Anwender niedrig: Wer die Ergebnisse im Augenblick
  des Abschlusses öffnet, kann „belegt“ sehen; an der Oberfläche habe ich das
  nicht beobachtet. Für die Freigabe mittel: Die Suite bricht beim ersten
  Fehler ab, ein solcher Abbruch kostet einen Lauf von 50 Minuten.
- **Abgrenzung:** Core, Test und Helfer sind seit `v3.2.0-rc178` unverändert
  (`git diff --stat v3.2.0-rc178 HEAD` für die genannten Dateien ist leer).
  Die Commits dieser Runde ändern nur `frontend/workspace.js` und seinen Test;
  der Sidecar-Test lädt keine Oberfläche. Während des Laufs liefen auf dem
  Rechner kleine eigene Skripte (Lesezugriffe, zwei kurze Testdateien). Dass
  sie das Zeitverhalten verschoben haben, kann ich nicht ausschließen.
- **Status am Mittag:** Hypothese, nicht reproduziert, nichts geändert.
  BL-050.6.
- **Nachtrag vom Abend:** geklärt und nachgestellt, siehe „Nachtrag vom
  27.11. abends · R-037 geklärt, neuer Befund R-039“. Dort steht auch die
  Berichtigung: Die Sperre gilt für alle Läufe, nicht für einen, und die
  Auswirkung für den Anwender beschreibt R-039.

### Grenzen

- Die geführte Prüfung ist mit einem Dokument und drei Namen bedient. Eine
  Prüfung über mehrere Dokumente, „Beibehalten“ und „Als Unternehmen
  anonymisieren“ habe ich in diesem Lauf nicht gewählt.
- Die native Meldung ist für eine Sperrdatei gesehen, nicht für einen Ordner
  mit nicht unterstützten Dateien und nicht für gemischtes Hineinziehen
  (Ziehen lässt sich hier nicht automatisieren).
- Die Texte zum Prüfstart-Fehler sind getestet, nicht nativ ausgelöst.

## Nachtrag vom 27.11. · Netzlaufwerk (R-038) und drei native Beobachtungen

Nach der vierzehnten Übergabe hat der Anwender Entscheidungsvorlagen zu den
offenen Punkten verlangt und danach beauftragt, das Netzlaufwerk und die noch
nicht nativ gesehenen Stellen zu prüfen. Am Produkt ist dabei nichts geändert;
der Produktstand bleibt `3b85e395`, Paket `a4f7a0e6…`, Build `4b88b0db`.

### R-038 · Standalone unter Windows nimmt keinen Ergebnisordner im Netzwerk an

- **Ort:** `apps/datasecure-standalone/tauri-contract/src/export_directory.rs:1146-1149`
  (`open_directory` lässt als Pfadanfang nur einen Laufwerksbuchstaben zu);
  `plugins/data-secure/server/gateway/result-folder-config.js:53-63`
  (`inspectRoot` vergleicht den gewählten Pfad mit `fs.realpathSync.native`)
  und `396-400` (`isNetworkResultFolder`).
- **Soll:** `docs/canonical/PRODUCT.md:270-274`: „Ein sichtbarer Ergebnisordner
  darf ausdrücklich auf einem Netzlaufwerk liegen“, mit einmaligem Hinweis,
  ohne Sperre (DS-080).
- **Reproduktion, nativ am Paket des Endstands:** In den Einstellungen **Ordner
  ändern**, im Ordnerdialog einen leeren Ordner wählen,
  - einmal über den UNC-Pfad `\\localhost\C$\…\netz-unc` (die lokale
    Verwaltungsfreigabe, ohne Systemänderung erreichbar),
  - einmal über einen dafür vorübergehend zugeordneten Laufwerksbuchstaben
    `Z:\…\netz-buchstabe` (`net use Z: \\localhost\C$`, danach wieder entfernt).
- **Ist:**
  - UNC-Pfad: „Der gewählte Ergebnisordner konnte nicht sicher vorbereitet
    werden. Die bisherige Einstellung bleibt unverändert. … (AI_EXPORT_CONFLICT)“.
    Die lokale Diagnose nennt `native_configure_failed`, Stufe `public_open`,
    Fehlerart `Other` ohne Systemcode; das ist `EXPORT_DIRECTORY_UNSAFE` aus
    `open_directory`.
  - Laufwerksbuchstabe: „Der lokale Vorgang konnte nicht abgeschlossen werden.
    Bitte Diagnose und aktuellen Laufstatus prüfen. (STANDALONE_OPERATION_FAILED)“.
    Die Ablehnung kommt aus dem Core: `fs.realpathSync.native` liefert für
    `Z:\…` den UNC-Namen, `inspectRoot` wirft `RESULT_ROOT_UNSAFE`.
  - In beiden Fällen bleibt der bisherige Ordner eingestellt.
- **Gegenprobe am Core ohne App:** `inspectRoot` nimmt denselben Ordner als
  `C:\…` an, ebenso als `\\localhost\C$\…` (und erkennt ihn dann als
  Netzlaufwerk); als `Z:\…` lehnt er ab.
- **Folgen:**
  - In Standalone unter Windows gibt es keinen Weg, einen Ergebnisordner im
    Netzwerk zu wählen. Der Hinweis nach DS-080, den R-035 in die geladene
    Oberfläche gebracht hat, ist dort nicht erreichbar: Der einzige Pfad, den
    der Core als Netzlaufwerk erkennt, wird von der Hülle abgelehnt.
  - Der Core gilt auch für das Cowork-Plugin: Dort ist ein UNC-Pfad möglich,
    ein zugeordneter Laufwerksbuchstabe nach dieser Gegenprobe nicht. Im
    Plugin selbst habe ich das nicht ausgeführt.
  - Keine der beiden Meldungen sagt dem Anwender, dass es am Netzlaufwerk
    liegt; die zweite empfiehlt, Diagnose und Laufstatus zu prüfen.
- **Auswirkung:** mittel. Kein Datenabfluss und kein Datenverlust; die App
  bleibt beim bisherigen Ordner. Wer seine Ergebnisse auf einem Netzlaufwerk
  ablegen will, wie es die Produktbeschreibung zusagt, kann es nicht und
  erfährt den Grund nicht.
- **Abgrenzung:** `open_directory` und `result-folder-config.js` sind seit
  `v3.2.0-rc178` unverändert. Geprüft mit der lokalen Freigabe
  `\\localhost\C$`, nicht mit einem Dateiserver; beide Ablehnungen hängen an
  der Schreibweise des Pfads, nicht am Server. macOS (`/Volumes/…`) nicht
  geprüft: Dort nimmt `inspectRoot` den Pfad nach dem Code an, und der Hinweis
  bleibt aus, weil `isNetworkResultFolder` nur `//…` erkennt.
- **Status:** Der Anwender hat am 27.11. entschieden, die Ablehnung zu
  belassen und verständlich zu erklären; umgesetzt in `8a167b09`, siehe den
  folgenden Abschnitt. Ob Standalone Netzordner unterstützen soll, bleibt
  offen. BL-002, BL-040.5 (DS-080).
- **Berichtigung zu R-035:** Meine Behebung ist dort nur mit einer
  nachgebildeten Antwort des Core getestet. Dass diese Antwort in Standalone
  unter Windows nie entsteht, hatte ich nicht geprüft.

### R-038 · Entscheidung und Umsetzung

- **Entscheidung des Anwenders (27.11.):** von zwei Vorlagen „Meldung
  verbessern“ statt „Netzordner unterstützen“. Die Ablehnung bleibt, die
  Oberfläche erklärt sie, und die Produktaussage wird für Standalone unter
  Windows eingeschränkt.
- **Oberfläche (`8a167b09`):** `frontend/workspace.js`, `showError`. Lehnt
  der Befehl `configure_results` mit `AI_EXPORT_CONFLICT` oder
  `STANDALONE_OPERATION_FAILED` ab, hängt die Meldung vor dem Code an:
  „Mögliche Ursache: Der Ordner liegt auf einem Netzlaufwerk oder wird über
  einen Netzwerkpfad erreicht. Unter Windows nimmt DataSecure Standalone als
  Ergebnisordner nur einen Ordner auf einem lokalen Laufwerk an; ein
  Netzlaufwerk mit Laufwerksbuchstaben gehört nicht dazu. Bitte einen Ordner
  auf einem lokalen Laufwerk wählen.“
  Andere Befehle mit denselben Codes und andere Fehler der Ordnerwahl
  behalten ihren Text.
- **Dokumente:** `docs/canonical/PRODUCT.md` (Einschränkung am Satz zum
  Netzlaufwerk), `docs/canonical/DECISIONS.md` (Präzisierung DS-080 vom
  27.11.2026), `docs/ANLEITUNG.md`, `docs/canonical/CURRENT_STATE.md`,
  `docs/canonical/TRACEABILITY.md`. Hülle und Core sind unverändert.
- **Test:** `tests/test-standalone-workspace.js`, „a refused result folder
  names the network drive as a possible cause, and only the folder choice
  does“ (beide Codes; Code bleibt am Ende; Hinweis genau einmal; der gezeigte
  Ordner bleibt; kein Hinweis bei `STANDALONE_IPC_FAILED` und keiner bei
  denselben Codes aus `select_folder`). Ein vorhandener Test, der den
  allgemeinen Satz wörtlich festhielt, ist an den neuen Wortlaut angepasst.
  549 Tests bestehen; an der Oberfläche von `3b85e395` schlagen beide fehl.
- **Nativ am Paket `28c6f7ce…`, Build `d9999cb0`:** beide Wege erneut
  gewählt. UNC-Pfad: der bisherige Text, danach der Hinweis, am Ende
  `(AI_EXPORT_CONFLICT)`. Laufwerksbuchstabe: der allgemeine Satz, danach der
  Hinweis, am Ende `(STANDALONE_OPERATION_FAILED)`. In beiden Fällen bleibt
  der bisherige Ordner eingestellt.
- **Grenzen:**
  - Der Hinweis ist eine mögliche Ursache, keine Feststellung. Die beiden
    Codes haben weitere Ursachen (etwa ein Ordner, der eine Verknüpfung ist);
    auch dann erscheint er. Einen eigenen Code für das Netzlaufwerk gibt es
    nicht, weil Hülle und Core unverändert bleiben sollten.
  - Der Hinweis erscheint auch unter macOS, wenn die Ordnerwahl dort mit
    einem der beiden Codes scheitert; sein Text nennt Windows. macOS ist
    nicht geprüft.
  - Für das Cowork-Plugin ist nichts geändert. Dort lehnt der Core nach der
    Gegenprobe ein Netzlaufwerk mit Laufwerksbuchstaben ebenfalls ab; die
    Meldung des Plugins dazu habe ich nicht angesehen.
  - Geprüft mit `\\localhost\C$`, nicht mit einem Dateiserver.

### Ordner mit nicht unterstützten Dateien

- **Beobachtet:** Über **Ordner auswählen** einen Ordner mit einer Textdatei,
  einer Datei `.xyz` und einer Datei `.zip` gewählt. Der Dateibaum zeigt alle
  drei: die Textdatei angehakt („1 von 1 ausgewählt“), die beiden anderen als
  nicht auswählbare Zeilen mit „Dieses Dateiformat wird nicht unterstützt.“
  Keine Fehlermeldung, die Auswahl wird nicht abgelehnt.
- **Einordnung:** Mit dem Quellenkatalog tritt `SOURCE_FOLDER_UNSUPPORTED_FILES`
  in diesem Ablauf nicht auf; der Text aus R-034 dazu bleibt für andere Wege.

### Manuelle Maskierung in der Nachbearbeitung

- **Beobachtet:** Automatischer Lauf über einen erfundenen Vermerk mit „Petra
  Koch hat den Vertrag am 12.03.2026 unterschrieben.“ (der Name bleibt lesbar,
  wie in R-033 beschrieben). Danach **Weitere Aktionen**, **Nachbearbeitung
  öffnen (optional)**, **Vermerk.txt: vergleichen**. Im rechten Text „Petra
  Koch“ markiert: „10 Zeichen in dieser Datei ausgewählt. Nur diese Stelle wird
  beim Speichern durch [MANUAL_REDACTION] ersetzt.“ Mit Tab zur Schaltfläche
  **Maskierung speichern**, Leertaste: „Vermerk.txt: Zusätzliche Maskierung in
  Stand 1 gespeichert und aktueller Ergebnisstand bereitgestellt.“
- **Ergebnis auf dem Datenträger:** ein neuer Ordner
  `DataSecure-KI-Export\Ergebnisse-…` mit „[MANUAL_REDACTION] hat den Vertrag
  …“ und eigenen Zuordnungsdateien. Die Datei des ersten Stands unter
  `DataSecure-Output\Lauf-…` bleibt unverändert liegen und enthält den Namen
  weiter. Die Oberfläche sagt das („frühere Ergebnisstände bleiben
  unverändert“); wer den Ordner des Laufs schon weitergegeben hat oder dort
  nachsieht, findet den Namen noch.
- **Nicht gelungen über die Fernbedienung:** Dasselbe Speichern über die
  Automationsschnittstelle der Schaltfläche (UI-Automation „Invoke“, zweimal
  versucht) und über einen nachgestellten Mausklick hat nichts gespeichert
  und keine Meldung gezeigt; danach war die Markierung verworfen. Ob das an
  meiner Fernbedienung liegt oder Hilfstechnik betrifft, die Schaltflächen so
  auslöst, habe ich nicht geklärt. Eine Markierung mit der Tastatur
  (Umschalt und Pfeiltasten) kam über die Fernbedienung nicht an. Das gehört
  zur offenen Prüfung mit einem Screenreader (R-020).

### Nicht nachgeholt

- Gemischtes Hineinziehen (Datei und Ordner zusammen): lässt sich hier nicht
  fernbedienen; von Hand in einer Minute prüfbar.
- Die vier Sätze zum abgelehnten Prüfstart: nur mit einer beschädigten
  Installation auslösbar.

### Nebenwirkung auf dem Prüfrechner

`net use … /persistent:no` hat die Voreinstellung des Benutzers für neue
Netzverbindungen von „gespeichert“ auf „nicht gespeichert“ gestellt. Ich habe
sie mit `net use /persistent:yes` zurückgestellt und die Zuordnung `Z:`
entfernt; `net use` zeigt danach wieder „Neue Verbindungen werden
gespeichert“ und keine Einträge.

## Nachtrag vom 27.11. abends · R-037 geklärt, neuer Befund R-039

Auftrag des Anwenders: R-037 gezielt nachstellen und klären, ohne das Produkt
zu ändern. Geprüft am Produktstand `8a167b09` (Paket `28c6f7ce…`, Build
`d9999cb0`). Am Produkt und an den Tests ist nichts geändert.

### Vorgehen

- **Proben am Core:** vorübergehende, nicht eingecheckte Kopien von
  `tests/test-standalone-sidecar.js` (nur der Ablauf
  „content-format-workflow“) und von
  `tests/helpers/standalone-packaged-markdown.mjs`. Sie starten denselben
  projizierten Core mit Sidecar und Arbeitsprozess wie der Test und ändern
  nur, wann und wie oft `resolve_history_results` gefragt wird. Nach den
  Läufen gelöscht; `git status` war danach leer.
- **Messung der Sperre:** Ein dritter Prozess listet den Ordner
  `document-reviews` rund 30 000-mal je Sekunde und hält fest, wann
  `control.lock` erscheint und verschwindet. Er öffnet die Datei nicht. Eine
  Belegung, die ganz in einer eigenen Anfrage der Probe liegt, gehört dem
  Sidecar; jede andere dem Arbeitsprozess.
- **Echte App:** das Paket im isolierten Testprofil, Bedienung über
  Windows-UI-Automation, 81 erfundene Textdateien.

### R-037 · geklärt: Drei Testhelfer lassen eine vorgesehene Antwort nicht zu

- **Ort:** `tests/helpers/standalone-packaged-markdown.mjs:125-136`,
  `tests/helpers/standalone-packaged-anonymized-ocr.mjs:100-109` und
  `tests/helpers/standalone-packaged-ocr-review.mjs:118-129` (jeweils die
  Prüfung „initial readiness never retries a conflict“). Im Core:
  `gateway/standalone-document-review-store.js:115-131` (eine Sperrdatei
  `control.lock` für alle Läufe), `:156-159` und `:2352-2373`
  (`resolveResultsGeneration` nimmt sie),
  `gateway/standalone-document-control.js:41-42` (belegt wird zu
  `STANDALONE_BUSY`, ohne Wiederholung),
  `gateway/prepublication-error.js:23-34` (der Arbeitsprozess wiederholt bei
  `STANDALONE_BUSY` bis zu 50-mal im Abstand von 100 ms).
- **Reproduktion:**
  1. Ein zweiter Prozess hält die Sperre mit dem Code des Produkts
     (`createBatchActiveLock(...).acquireActiveLock`); dann fragen. Fünf von
     fünf Antworten `STANDALONE_BUSY`. Nach der Freigabe wieder
     `RESULT_PUBLICATION_PENDING`, dann der Ordner.
  2. Ohne fremden Halter, nur früher fragen: `get_run_history` alle 5 ms
     statt alle 150 ms, und die Abfrage sofort stellen, wenn der Lauf als
     fertig gemeldet ist, ohne `get_run_failures` davor. Drei von drei
     Durchgängen `STANDALONE_BUSY`. Die Messung zeigt jedes Mal eine
     Belegung durch den Arbeitsprozess: Sie beginnt zwischen 15 ms vor und
     7 ms nach dem Zeitpunkt, zu dem der Lauf als fertig gemeldet ist, und
     endet 38 bis 64 ms danach.
  3. Im Rhythmus des Tests (ein Durchgang): Die letzte Belegung durch den
     Arbeitsprozess endete 193 ms vor der ersten Abfrage; kein Abbruch.
- **Ist:** Der Arbeitsprozess nimmt die Sperre während des Laufs oft (in
  einem Durchgang 32-mal, zusammen 3,8 s, längste Belegung 222 ms) und noch
  einmal kurz nach dem Zeitpunkt, zu dem der Verlauf den Lauf als fertig
  meldet. Zwischen dieser Meldung und der ersten Abfrage des Tests liegen
  nur der Abstand der Verlaufsabfrage und eine Anfrage von rund 60 ms. Fällt
  die Abfrage in die Belegung, antwortet der Core `STANDALONE_BUSY`.
- **Soll:** `STANDALONE_BUSY` ist an dieser Stelle die vorgesehene Antwort
  des Core; der Arbeitsprozess rechnet umgekehrt damit und wiederholt. Der
  Test müsste sie wie „Veröffentlichung läuft noch“ behandeln und erneut
  fragen. Seine Meldung „never retries a conflict“ meint
  `RESULT_PUBLICATION_CONFLICT` (Commit `852a2462`), nicht „belegt“.
- **Auswirkung:** niedrig. Die Suite bricht selten ab, ohne dass das Produkt
  einen Fehler hat; ein Abbruch kostet einen Lauf von 50 Minuten. In diesem
  Review einmal beobachtet. Unter Last wird es wahrscheinlicher, weil die
  Belegung dann länger dauert.
- **Abgrenzung:** In diesem Fenster bietet die Oberfläche den Ergebnisordner
  des eben fertigen Laufs nicht an (Zustand `export_pending`,
  `results_available` falsch). Der Anwender erreicht diesen Fall nicht. Was
  er erreicht, beschreibt R-039.
- **Status:** geklärt, nichts geändert. Vorschlag: Die drei Helfer fragen
  bei `STANDALONE_BUSY` innerhalb ihrer vorhandenen Frist erneut. BL-050.6.

### R-039 · Sperre der Dokumentkontrolle bleibt hängen, ein laufender Stapel bleibt stehen

- **Ort:** `gateway/standalone-document-control.js:9` (vier Wartezeiten von
  10, 25, 50 und 100 ms) und `:62-81` (`releaseAsync` gibt danach auf und
  lässt den eigenen Eintrag stehen); `gateway/batch-active-lock.js:369-372`
  (ein vorhandener Eintrag eines lebenden Prozesses gilt als belegt) und
  `:410-423` (erst ein neuer Start räumt den Eintrag der früheren Sitzung);
  `gateway/standalone-document-review-store.js:129` (als Besitzer steht der
  Prozess der Hülle im Eintrag; er lebt, solange die App läuft).
  Auslöser in der Oberfläche: `frontend/workspace.js:1883-1885` und `:1926`
  („Ergebnisordner öffnen“ ist für einen fertigen Lauf auch dann bedienbar,
  wenn ein anderer Lauf arbeitet). Die Hülle reicht die Antwort ohne
  Wiederholung durch (`tauri-contract/src/main.rs:2819-2859`). Der Test
  `tests/test-standalone-document-control.js:241-258` schreibt das
  Stehenlassen fest („leaves only its exact owned record“).
- **Reproduktion in der echten App (zwei Versuche, je ein neues
  Testprofil):**
  1. „Nur umwandeln“, eine Textdatei, Lauf abwarten.
  2. „Nur umwandeln“, Ordner mit 80 Textdateien, starten.
  3. In den Verlauf wechseln und für den ersten Lauf „Ergebnisordner öffnen“
     wählen, mehrmals im Abstand von 1 bis 3 Sekunden.
- **Ist, erster Versuch (Protokoll des Core):**
  - Klick 1: `STANDALONE_BUSY` nach 21 ms. Klick 2: beantwortet nach 281 ms,
    der Ordner öffnet sich. Klick 3: `STANDALONE_BUSY`.
  - Klick 4: nach 518 ms `OWNERSHIP_GUARD_BUSY`, in der Oberfläche „Ein
    anderer lokaler Vorgang sichert gerade seinen Zustand. …
    (STANDALONE_OWNERSHIP_CONTROL_BUSY)“. Die Sperrdatei trägt den
    Zeitstempel dieses Klicks, die Kennung des ersten Laufs und die
    Prozessnummer der Hülle. Sie bleibt liegen.
  - Danach 94 Klicks in zwei Minuten: jedes Mal „Ein lokaler Vorgang ist
    bereits aktiv. Bitte warten. (STANDALONE_BUSY)“.
  - Der zweite Lauf bleibt bei 65 von 80 Dateien stehen und endet 109
    Sekunden nach dem vierten Klick mit „Fortsetzung möglich“. Im Journal
    tragen die 15 offenen Dateien den Fehler `STANDALONE_BUSY`.
  - „Fortsetzen“ ohne Neustart: dieselbe Meldung; nach drei Minuten weiter
    65 Ergebnisse.
  - Nach dem Schließen liegt die Sperrdatei noch da, nach dem nächsten Start
    ist sie weg. „Fortsetzen“ verarbeitet die 15 Dateien in 22 Sekunden (80
    von 80), beide Ergebnisordner öffnen sich.
- **Ist, zweiter Versuch:** zwei Klicks beantwortet, sechs
  `STANDALONE_BUSY`, einer beantwortet, der zehnte nach 510 ms
  `OWNERSHIP_GUARD_BUSY`. Die Sperrdatei mit dem Zeitstempel des zehnten
  Klicks bleibt liegen; 30 Sekunden später tragen vier Dateien des laufenden
  Stapels `STANDALONE_BUSY`.
- **Ursache, aus Code und Protokoll:** Die Abfrage nimmt die Sperre und muss
  sie nach ihrer Arbeit wieder freigeben. Dafür braucht sie kurz die
  gemeinsame Betriebssystemsperre des Datenordners. Hält der Arbeitsprozess
  diese gerade, versucht die Abfrage es über zusammen 185 ms erneut und gibt
  dann auf. Der Eintrag bleibt stehen, und nichts versucht die Freigabe
  später noch einmal.
- **Soll:** Nach DS-086 ist ein Klick im Verlauf an seinen Lauf gebunden,
  und nicht zulässige Aktionen sind mit Grund deaktiviert. Eine angebotene
  Leseaktion darf einen anderen Lauf nicht anhalten, und „Bitte warten“ muss
  enden, ohne dass der Anwender die App neu startet. Eine ausdrückliche
  Regel für „während ein anderer Lauf arbeitet“ habe ich in `PRODUCT.md` und
  `DECISIONS.md` nicht gefunden.
- **Auswirkung:** hoch für den Betrieb. Ein Klick auf einen bedienbaren
  Knopf hält einen laufenden Stapel an; die Meldung nennt weder Ursache noch
  Ausweg; „Fortsetzen“ hilft nicht. Kein Datenverlust: Fertige Ergebnisse
  und der Zwischenstand bleiben, die Originale sind unverändert, nach einem
  Neustart läuft der Rest durch. Bei einem großen Stapel fällt der
  Stillstand erst auf, wenn jemand nachsieht.
- **Reichweite, nur gelesen:** Dieselbe Freigabe nutzen vier weitere
  Abläufe in `standalone-document-review-store.js` (`:2241`
  `publishResults`, `:2375` `exportNativeApproved`, `:2437`, `:2454`). Ohne
  einen zweiten arbeitenden Prozess gibt es keinen Wettbewerb um die
  Betriebssystemsperre. In RC178 ist der Code derselbe. macOS und das
  Cowork-Plugin sind nicht geprüft.
- **Status am Abend:** offen, nichts geändert.
- **Nachtrag vom späten Abend:** behoben in `8ff4979a`, siehe „Nachtrag vom
  27.11. spätabends · R-039 und R-037 behoben“. Dort steht auch die
  Berichtigung zur Ursache: Wer die Betriebssystemsperre hielt, ist nicht
  festgestellt. BL-010.13 (DS-086), BL-050.6.

### Was die Probe am Core dazu zeigt

Der Test startet den Core ohne den nativen Kanal und damit ohne die
Betriebssystemsperre. Dort bleibt keine Sperre hängen; sichtbar ist nur der
gewöhnliche Wettbewerb: Während ein zweiter Lauf arbeitete, wurden 25 von 74
Abfragen für den fertigen ersten Lauf mit `STANDALONE_BUSY` beantwortet (14
von 36 und 11 von 38). Der zweite Lauf lief dabei durch. Auch ohne R-039
scheitert „Ergebnisordner öffnen“ während eines anderen Laufs also öfter mit
„Bitte warten“.

Eine dichte Abfrage ohne Pause taugt für die Frage nicht: In sechs
Durchgängen kam unter 175 Antworten kein `STANDALONE_BUSY`, weil die Abfrage
die Sperre dann selbst fast durchgehend hält.

### Weitere Beobachtung

Startet die Probe einen zweiten Lauf ohne Pause, sobald der Ergebnisordner
des ersten bereit ist, nimmt der Core den Start an. Der neue Lauf endet nach
weniger als einer Sekunde als fehlgeschlagen und nicht fortsetzbar
(`INTERNAL_FAILURE`, 0 von 12 Dateien), in drei von drei Durchgängen. Mit
0,5 und 2 Sekunden Abstand läuft er durch. Über die Oberfläche ist ein so
kurzer Abstand nicht zu erreichen; nicht weiter untersucht.

### Eigene Fehler dieser Runde

- Die erste Fassung von R-037 nannte die Sperre „die Sperre des Laufs“ und
  die Auswirkung für den Anwender niedrig. Es ist eine Sperre für alle
  Läufe, und der Fall, den der Anwender erreicht, ist R-039.
- Als in der Probe ein zweiter Lauf abbrach, hielt ich zuerst meine Abfrage
  für die Ursache. Der Kontrollversuch ohne Abfrage brach genauso ab; die
  Ursache war der fehlende Abstand zwischen den Läufen.
- Mein erstes Skript für die echte App fand die Schaltfläche nicht und
  versuchte danach, das Fenster zu schließen. Die App fragte nach; ich habe
  „Weiter verarbeiten“ gewählt. Der Lauf arbeitete danach weiter, bis zum
  vierten Klick.

### Grenzen

- R-039 ist zweimal beobachtet, beide Male mit 80 kleinen Textdateien in
  „Nur umwandeln“. Wie oft es bei anderen Stapeln eintritt, ist nicht
  gemessen; in beiden Versuchen innerhalb der ersten zehn Klicks.
- Die Klicks kamen über die Automationsschnittstelle, öfter als von Hand.
- Die vier weiteren Abläufe mit derselben Freigabe sind nur gelesen.
- Eine Behebung ist nicht entworfen und nicht getestet.
- Die Prüfsummen der 81 Originale sind verglichen, während der zweite Lauf
  arbeitete (unverändert), nicht noch einmal nach dem Neustart.

## Nachtrag vom 27.11. spätabends · R-039 und R-037 behoben

Auftrag des Anwenders: R-039 im Core beheben und neu prüfen („Ja, beheben“);
die drei Testhelfer aus R-037 dabei mit korrigieren.

### R-039 · Behebung

- **Ort:** `plugins/data-secure/server/gateway/standalone-document-control.js`,
  Funktion `withDocumentControl`. Commit `8ff4979a`.
- **Vorher:** Nach der Aktion versuchte die Funktion die Freigabe fünfmal
  innerhalb von 185 ms. War die Betriebssystemsperre jedes Mal belegt, gab
  sie auf und ließ den Eintrag stehen.
- **Jetzt, drei Änderungen:**
  - Der Aufrufer wartet rund zwei Sekunden (23 Versuche; Pausen von 10, 25,
    50 und 100 ms, danach 18-mal 100 ms).
  - Ist die Sperre danach immer noch belegt, erhält der Aufrufer wie bisher
    seine Ablehnung. Dieselbe, vor der Aktion erfasste Berechtigung fragt
    danach alle 250 ms weiter, höchstens zehn Minuten lang.
  - Der synchrone Weg derselben Funktion (ein Aufrufer:
    `gateway/standalone-history-store.js`, eigene Sperrdatei
    `notice-summary.lock`) gab bisher nach einem einzigen Versuch auf. Er
    meldet die Ablehnung weiter sofort und bekommt dieselbe Fortsetzung.
- **Unverändert:**
  - Der Eintrag wird nie ohne bestätigte eigene Freigabe entfernt.
  - Die Antwort „falsch“, eine harte Ablehnung, eine verlorene Berechtigung
    und ein gescheiterter Zeitgeber beenden die Versuche.
  - Die Aktion läuft nie ein zweites Mal.
  - Während des Wartens hält der Prozess die Betriebssystemsperre nicht.
  - Die Zeitgeber der Fortsetzung halten den Prozess nicht am Leben.
- **Tests:** `tests/test-standalone-document-control.js`, 27 Tests. Der
  Test, der das Stehenlassen nach vier Pausen festschrieb, ist ersetzt. Neu
  oder geändert sind vier:
  - „persistent Busy refuses the caller after its bounded wait; the same
    capability then releases the exact record“
  - „recovery ends on false, a hard refusal, a lost epoch or a failed timer
    and never removes the record itself“
  - „recovery is bounded and cannot release a later epoch of the same token“
  - „synchronous compatibility never becomes a Promise or sleeps, and still
    uses only its captured epoch“

  Gegen den Code von `8a167b09` schlagen diese vier fehl (vier weitere nur
  als Folge der dann liegen gebliebenen Sperrdatei).
- **Probe mit der echten Betriebssystemsperre** (eigenes Skript, lokal
  gebaute Sperre aus `dist/native-ownership-guard/…`, erfundene Arbeit). Ein
  Prozess nimmt die Dokumentkontrolle wie die Ergebnisabfrage, ein zweiter
  arbeitet wie der Arbeitsprozess, ein dritter belegt die
  Betriebssystemsperre.

  | Lage | Code von `8a167b09` | Code von `8ff4979a` |
  | --- | --- | --- |
  | Sperre zu 75 % der Zeit belegt (150 ms belegt, 50 ms frei), Freigabe nach asynchroner Aktion | 4 von 26 Einträgen blieben liegen; keiner war nach 20 s frei | 0 von 43 blieben liegen; längste Freigabe 1 872 ms (20 Versuche) |
  | Sperre 7 s am Stück belegt | nicht gemessen | 1 von 1 Aufrufer nach 2,2 s abgewiesen; der Eintrag war 5,0 s später von selbst frei |
  | wie Zeile 1, Freigabe nach synchroner Aktion | 2 von 6 blieben liegen; keiner war nach 20 s frei | 2 von 19 zunächst abgewiesen; beide von selbst frei |

  Ohne den dritten Prozess blieb auch mit dem alten Code kein Eintrag
  liegen (11 Freigaben, höchstens drei Versuche).
- **In der echten App** (Paket `5f347413…`, Build
  `c92aba02`; derselbe Ablauf wie bei der Beobachtung von R-039,
  zwei Versuche mit je neuem Testprofil):
  - Im sauberen Versuch 59 Klicks auf „Ergebnisordner öffnen“ des ersten
    Laufs, während der zweite arbeitete. Nach dem Protokoll des Core öffneten
    20 den Ordner (279 bis 951 ms), 39 antworteten „Bitte warten“
    (`STANDALONE_BUSY`, je rund 20 ms). Kein `OWNERSHIP_GUARD_BUSY`.
  - Nach keinem Klick lag die Sperre des ersten Laufs noch. Der zweite Lauf
    endete nach 108 Sekunden mit „80 Dateien · 80 Ergebnisse · 0 Probleme“;
    am Ende gab es keine Sperrdatei, und beide Ergebnisordner ließen sich
    öffnen.
  - Im ersten Versuch (von meinem Skript gestört, siehe „Eigene Fehler“) 24
    Abfragen: 9 geöffnet, 15 „Bitte warten“, der zweite Lauf 80 von 80. Eine
    Abfrage dauerte 1 515 ms.
  - Eine geöffnete Abfrage dauert sonst rund 300 ms. Vier des sauberen
    Versuchs dauerten länger (495, 650, 745 und 951 ms), dazu die eine des
    ersten. Bei den längsten hat die Freigabe demnach mehr als 185 ms
    gebraucht; dort wäre mit dem alten Code der Eintrag liegen geblieben.
    Das ist aus der Dauer geschlossen, nicht einzeln gemessen.
  - Originale unverändert (Prüfsummen verglichen, als der zweite Lauf
    anlief).
- **Status:** behoben in `8ff4979a`. BL-010.13 (DS-086), BL-050.6.

### Unabhängige Gegenprüfung

Ein Read-only-Prüfer hat die Änderung vor dem Commit gelesen. Seine Punkte
und was daraus wurde:

- **Wartezeit des Aufrufers:** Mein erster Entwurf ließ den Aufrufer rund
  fünf Sekunden warten. Der Core der Desktop-App beantwortet Anfragen
  nacheinander (`standalone/desktop-sidecar.js:330-335`), und eine
  Statusabfrage der Hülle wartet höchstens fünf Sekunden
  (`tauri-contract/src/main.rs:1614-1623`). Eine so lange Freigabe hätte die
  App stocken lassen. Auf rund zwei Sekunden gekürzt; die Fortsetzung macht
  die längere Wartezeit entbehrlich.
- **Test für einen späteren Eintrag:** Der Test verbrauchte die alte
  Berechtigung selbst und prüfte damit nicht den Vergleich der Einträge.
  Ergänzt um den Fall, dass die alte Berechtigung unverbraucht auf einen
  neuen Eintrag desselben Laufs trifft.
- **Gescheiterter Zeitgeber während der Wartezeit:** startet keine
  Fortsetzung. Unverändert; der eingebaute Zeitgeber kann nicht scheitern,
  und ein vorhandener Test hält dieses Verhalten fest.
- **Testhelfer (R-037):** Sie lassen jetzt auch ein „belegt“ von einigen
  Sekunden durchgehen. Hingenommen; jede Schleife endet weiter an ihrer
  Frist (20, 180 und 120 Sekunden).
- **`gateway/batch-lock-release.js`:** dieselben vier Pausen für die
  Stapelsperre, ohne Fortsetzung. Nicht geändert, siehe „Grenzen“.
- **Ohne Einwand:** Eine späte Freigabe kann keinen fremden und keinen
  späteren Eintrag entfernen; die Aktion läuft nicht erneut; kein Fehler der
  Aktion wird überdeckt; der Ablauf zum Pausieren nutzt eine eigene Sperre;
  für macOS hat der Prüfer am Code nichts gefunden, was die Änderung dort
  falsch macht.

### R-037 · Behebung

- **Ort:** `tests/helpers/standalone-packaged-markdown.mjs`,
  `standalone-packaged-anonymized-ocr.mjs`,
  `standalone-packaged-ocr-review.mjs`. Commit `e89069eb`. Nur Testcode.
- **Änderung:** Die Warteschleife auf den Ergebnisordner lässt neben „fehlt
  noch“ und „Veröffentlichung läuft noch“ auch `STANDALONE_BUSY` zu und
  fragt erneut. Jede Schleife endet weiter an ihrer vorhandenen Frist.
- **Nachweis:** Die Headless-Suite am Stand `e89069eb` ist im ersten Lauf
  durchgelaufen (366 Dateien). Das belegt die Korrektur nicht für sich, weil
  der Abbruch selten war; die Ursache ist am Abend in drei von drei
  Durchgängen nachgestellt worden, und die Helfer lassen genau diese Antwort
  jetzt zu.
- **Status:** behoben in `e89069eb`. BL-050.6.

### Zwei Beobachtungen am Laufende, an altem und neuem Paket gleich

Im sauberen Versuch schloss sich das Fenster kurz nach dem Laufende 30
Sekunden lang nicht, und eine Statusabfrage dauerte rund zwei Sekunden, so
lang wie die neue Wartezeit. Um auszuschließen, dass das von der Änderung
kommt, habe ich denselben Ablauf ohne Klicks mit dem alten Paket
(`28c6f7ce…`) und dem neuen wiederholt.

- **Schließen kurz nach „Lauf abgeschlossen“:** Rund acht Sekunden nach dem
  angezeigten Ende zeigt der Verlauf „80 Dateien · 80 Ergebnisse · 0
  Probleme“, aber noch keine Schaltfläche für den Ergebnisordner. Ein
  Schließen führt zur Rückfrage „Dieser Lauf lässt sich gerade nicht
  pausieren.“ Knapp eine Minute später schließt das Fenster sofort. Bei
  beiden Paketen gleich.
- **Lange Statusabfrage:** Am Laufende dauert `get_public_state` einmal 1,5
  bis 2,9 Sekunden (alt: 1 494, 2 847 und 2 862 ms in drei Läufen; neu:
  1 904, 2 074 und 2 225 ms in drei Läufen), sonst rund 90 ms. Diese Abfrage
  läuft im Core ohne Warten ab (`application-service.js:633`, `status`); die
  neue Wartezeit kann darin nicht vorkommen.
- **Einordnung:** Beides bestand schon vor der Änderung. Nicht untersucht
  und nicht als Befund geführt; wie lange der Ergebnisordner eines Laufs mit
  80 Dateien nach „Lauf abgeschlossen“ auf sich warten lässt, habe ich nicht
  gemessen.

### Eigene Fehler dieser Runde

- Der Bericht vom Abend nannte als Ursache, der Arbeitsprozess halte die
  Betriebssystemsperre. Das habe ich nicht festgestellt. Die Sperre gilt als
  belegt, sobald irgendein Prozess ihre Datei geöffnet hat. In der Probe
  blieb mit dem Arbeitsprozess allein kein Eintrag liegen.
- Mein erster Entwurf ließ den Aufrufer fünf Sekunden warten; die
  Gegenprüfung hat gezeigt, dass das die App stocken ließe.
- Der erste Versuch in der echten App: Mein Skript konnte die Oberfläche
  einmal nicht lesen, brach ab und versuchte das Fenster zu schließen. Die
  App fragte nach; ich habe „Weiter verarbeiten“ gewählt. Der Lauf lief
  währenddessen weiter und durch.
- Der zweite Versuch startete den zweiten Lauf nicht, weil ich die Ausgabe
  des Startskripts gekürzt und es damit abgebrochen hatte. Nicht gezählt.
- Mein Skript für den Vergleichslauf nahm das Laufende zu früh an und
  versuchte, das Fenster während des Laufs zu schließen; die Rückfrage
  erschien wie vorgesehen, ich habe „Weiter verarbeiten“ gewählt. Ein
  weiterer Durchgang brach ab, weil das Skript das falsche Fenster griff.
  Beide nicht gezählt.
- Die Anzeige unter dem Klick zeigte bei manchen geöffneten Ordnern noch
  die Meldung des vorigen Klicks. Die Zahlen oben stammen deshalb aus dem
  Protokoll des Core.

### Grenzen

- **Nicht geändert, gleiche Bauart:** `gateway/batch-lock-release.js` gibt
  die Stapelsperre nach denselben vier Pausen auf, ohne Fortsetzung. Nicht
  beobachtet und nicht untersucht, wessen Prozessnummer dieser Eintrag
  trägt und wie lange er danach blockiert.
- **„Bitte warten“ bleibt:** Während ein anderer Lauf arbeitet, ist die
  Dokumentkontrolle oft belegt; im sauberen Versuch antworteten 39 von 59
  Klicks so. Das ist der gewöhnliche Wettbewerb, kein hängender Eintrag;
  nicht geändert.
- **Länger als zwei Sekunden belegt:** Der Aufrufer bekommt eine
  Fehlermeldung, obwohl seine Aktion gelungen ist, und der Eintrag
  blockiert, bis die Fortsetzung ihn freigibt. Der Arbeitsprozess wartet
  höchstens fünf Sekunden und meldet danach „Fortsetzung möglich“. In der
  echten App nicht aufgetreten.
- **Nach zehn Minuten** ohne freie Sperre endet die Fortsetzung; dann gilt
  der alte Zustand bis zum Neustart.
- **Wer die Betriebssystemsperre hielt,** als die Freigabe in der echten App
  scheiterte, ist nicht festgestellt.
- **Geprüft** ist ein Fall: 80 kleine Textdateien in „Nur umwandeln“,
  Klicks über die Automationsschnittstelle, zwei Versuche. Die vier weiteren
  Abläufe mit derselben Freigabe und der synchrone Weg sind nur über Tests
  und die Probe geprüft, nicht in der echten App.
- **macOS** nicht ausgeführt.

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
| A-021 | Die Startprobe scheitert an einem flüchtigen Endpunkt, also am Zeitverhalten (so in R-029 zuerst gemeldet). | Der Fehler trat nur in manchen Läufen auf, eine Wiederholung bestand. | Die Probe besteht nur, wenn keine Stichprobe den Endpunkt erwischt; wird er gesehen, scheitert die Zuordnung immer. | instrumentierte Kopie der Probe, 11 Läufe; Gegenprüfung (read-only) | Widerlegt. Fester Vergleichsfehler beim Profilordner; `dbf98cbf`. |
| A-022 | Der Abbau der Probe wartet auf die WebView2-Prozesse des Testprofils (`docs/canonical/TRACEABILITY.md`: „exakte Profilquieszenz vor Cleanup“). | Die Funktion ist vorhanden und wird aufgerufen. | Sie vergleicht denselben falschen Ordner und findet nie einen Prozess. | eigene Lektüre nach dem Befund der Ursache; Gegenprüfung | Widerlegt für alle bisherigen Läufe. Jetzt wirksam; gemessene Wartezeit 0,1 bis 0,3 s. |
| A-023 | R-028 lässt sich nur beheben, indem die Freigabe der Ordnerkette gelockert wird (so in der ersten Meldung von R-028). | Der Start scheitert an der Freigabe. | Der Wiederanlauf im selben Fenster ging schon vorher; falsch war nur die genannte Ursache. | Nachstellung mit einem Halterprozess am alten Paket | Widerlegt. Die Korrektur benennt die Ursache und wartet kurz; Freigabe und Rechte sind unverändert. |
| A-024 | Ein Startversuch bei belegtem Ordner darf wie jeder andere gegen die Grenze von 16 Versuchen zählen. | So zählt die Shell jeden Startversuch. | Die neue Meldung verspricht den Wiederanlauf ohne Neustart; nach 16 Prüfungen wäre das falsch gewesen, und die Oberfläche hätte es nicht gezeigt. | Gegenprüfung (read-only) | Widerlegt; ein solcher Versuch gibt seine Generation zurück. Nativ mit 20 Prüfungen belegt. |
| A-025 | Der UDP-Endpunkt des WebView2-Netzwerkdienstes ist ein Plattformbefund ohne weitere Bedeutung (so wertet ihn die Startprobe, so stand es in R-029). | Besitzer ist ein signierter WebView2-Prozess des eigenen Profils; der Endpunkt ist kurzlebig. | Er gehört zu DNS-Anfragen und einer Erreichbarkeitsprüfung für regelmäßigen HTTPS-Verkehr zu Microsoft, den die Probe nicht ansieht. | Messung der Betriebssystemtabellen je Prozess und Netzprotokoll von Chromium | Eingegrenzt: kein DataSecure-Zugriff, aber Außenverkehr des Prozessbaums. R-031. |
| A-026 | Die Schalter des Produkts gelten unabhängig von der Umgebung des Hosts. | Sie stehen fest in Konfiguration und Code. | WebView2 hängt den Inhalt von `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` an; die Startprobe entfernt die Variable und sieht das nicht. | Gegenprüfung (read-only); eigener Versuch am Paket | Eingegrenzt: Die Variable wird angehängt (gemessen). Ob ein späterer gleichnamiger Schalter gewinnt, ist nicht geprüft. Im Sicherheitsmodell als Grenze genannt. |
| A-027 | Eine Probe, die ihre Tabellen liest und nichts findet, hat nichts übersehen. | Die Positivkontrolle sah die eigene Verbindung. | Die Kontrolle prüfte nur IPv4 und den eigenen Prozess; Lesefehler wurden verschluckt. | Gegenprüfung (read-only) mit Mutationen | Widerlegt für die erste Fassung; Kontrolle um IPv6 und einen Kindprozess erweitert, Lesefehler lassen den Lauf scheitern. Kurze Verbindungen zwischen zwei Stichproben bleiben unsichtbar. |
| A-028 | Die Positivkontrolle der Außenverbindungsprüfung deckt den Weg ab, den die Beobachtung nimmt. | Die Kontrolle sah die eigenen Verbindungen über IPv4, IPv6 und einen Kindprozess. | Sie las die Tabellen über einen einzelnen Aufruf; die Beobachtung läuft über einen Hintergrundthread mit Start und Stopp. Ein Thread, der nie abtastet, oder ein Stopp ohne Ergebnis hätte bestanden. | Gegenprüfung des Endstands (read-only) mit Mutationen; eigene Mutationen danach | Widerlegt; seit `1db8c744` müssen die Kontrollen auch über diesen Weg erscheinen. Dass ein einzelner Fehler der Abtastung gezählt wird, ist weiter nur gelesen. |
| A-029 | Schließen des Fensters beendet die Verarbeitung; ein offener Lauf lässt sich danach fortsetzen (so lesen sich BL-010.14 und der Text der alten Oberfläche). | Die Hülle stoppt beim Schließen den Sidecar und endet ordentlich. | Die Arbeitsprozesse des Core sind losgelöst gestartet und hängen nicht am Sidecar. | nativer Lauf mit sechs Dateien; Lektüre des Schließpfads | Widerlegt für die automatische Maskierung auf Windows: Der Stapel lief zu Ende. R-032; seit `5f670a20` fragt die App und pausiert. |
| A-030 | Ein Test, der einen Text der Oberfläche festhält, hält den richtigen Text fest. | Die Tests bestanden. | Zwei Tests schrieben die falsche Form fest („(1 Werte)“, „1 Ergebnisse wurden sichtbar kopiert“). | Gegenprüfung des Endstands; eigene Suche über die vier Oberflächendateien | Widerlegt; `8c452ac4`, `1126dc36` und `e66bab8f` berichtigen zusammen zehn Testfälle und prüfen die Textklasse statt einzelner Sätze. |
| A-031 | Nach dem zweiten Teil von R-025 hat jeder Zähltext der geladenen Oberfläche seine Einzahl (so die Nachricht von `8c452ac4`). | Der Wächtertest meldete keine Stelle mehr. | Der Wächter kannte nur die Hauptwörter, nach denen ich gesucht hatte; und die Änderung selbst hatte eine Verbform verdorben. | zweite Gegenprüfung (read-only) mit nachgebauten Sätzen für 0, 1 und 2 | Widerlegt; `1126dc36`. Die dritte Gegenprüfung fand danach noch zwei Stellen (`e66bab8f`). Belegt ist nur, dass die bekannten Wörter und Formen keine Stelle mehr treffen. |
| A-032 | Die Oberfläche weiß aus ihrem zuletzt gelesenen Status, ob ein Lauf arbeitet. | Sie liest den Status alle 1,6 bis 5 Sekunden und nach jedem Befehl. | Zwischen einem Befehl, der Arbeit anstößt (Start, Fortsetzen, Überspringen, Antwort der Prüfung), und dem ersten Status danach sagt der alte Status „arbeitet nicht“. | zwei Gegenprüfungen (read-only) mit nachgestellten Abläufen im Testgerüst | Widerlegt; in dieser Zeit gilt der Stand seit `2ce74b9f` als unbekannt, und die App fragt. |
| A-033 | Eine Oberfläche kann die App mit der neuen Rückfrage nicht offen halten (so der erste Modulkommentar). | Ohne Antwort schließt die Hülle nach zwei Sekunden. | Eine quittierte Anfrage hat keine Frist mehr; mit gesperrten Knöpfen wäre die Rückfrage nicht bedienbar gewesen. | Gegenprüfung (read-only), im Testgerüst nachgestellt | Widerlegt für die quittierte Anfrage. Die Oberfläche quittiert erst nach dem Anzeigen, die Knöpfe bleiben bedienbar, und jede neue Schließanfrage braucht wieder eine Antwort; der Kommentar und die Dokumente sagen das jetzt. |
| A-034 | „Fertige Ergebnisse bleiben erhalten“ beschreibt, was der Anwender nach dem Pausieren vorfindet. | Die fertigen Dateien sind gespeichert. | Sichtbar im Ergebnisordner werden sie erst nach dem Abschluss des ganzen Laufs. | nativer Lauf: 0 Dateien im Ergebnisordner bei 2 fertigen | Eingegrenzt; die Rückfrage sagt es jetzt ausdrücklich. |
| A-035 | Ein Status, der nach dem Befehl begann, weiß, was der Befehl gestartet hat (so der Kommentar in `2ce74b9f`). | Für die Befehle der Arbeitsfläche stimmt es: sie sperren das Statuslesen. | Die Antworten der geführten Prüfung sperren es nicht; ein Status kann beginnen und enden, während die Antwort noch unterwegs ist. | Gegenprüfung (read-only) mit ausführbarem Gegenbeispiel | Widerlegt; `d41a042b`. Beim Nachstellen ein zweiter Fehler: nach Verbindungsverlust schloss „Pausieren und schließen“ ohne Pause. |
| A-036 | Ein sichtbares Zeichen für ein angekreuztes Kästchen ändert nur die Darstellung. | Es ist ein einzelnes Zeichen vor dem Text. | Eine Zeile, die nur aus einem Namen besteht, wird nur ohne vorangestelltes Zeichen als Person erkannt; der Zweck erreicht den Konverter nicht. | Gegenprüfung (read-only), von mir am Kern nachvollzogen | Widerlegt; `39f2b3aa` in `22c34dcb` zurückgenommen. Meine Tests prüften nur den umgewandelten Text, nicht die Anonymisierung danach. |
| A-037 | „Aufbewahrung 0 Tage“ kann im Standalone-Paket auftreten (so die Entscheidung zu R-032 und der Text der Rückfrage). | Der Core kennt den Zustand und lehnt dort die Pause ab. | Die Hülle leert die Umgebung des Core und reicht `EU_PRIVACY_RETENTION_DAYS` nicht durch. | eigene Lektüre von `configure_core_environment`; nativer Lauf mit gesetzter Variable: die Pause wurde angenommen | Widerlegt für das Paket. Der Zweig bleibt im Code und im Test; die Frist beträgt im Standalone immer sieben Tage. |
| A-038 | Ein Prüfwerkzeug, das einen Bericht liefert, hat geprüft. | Der Bericht war gültiges JSON ohne Befund. | Ein Werkzeug, das einen leeren Bericht ausgibt, bestand die Prüfung („0 Crates, 0 Befunde“). | Gegenprüfung (read-only) mit einem künstlichen `cargo` | Widerlegt; `927fb3bd` verlangt die Zahl der Crates der Lock-Datei, Übereinstimmung mit dem Exit-Code und eine Datenbank mit Einträgen. |
| A-039 | Der Kern liest Markdown aus Office-Quellen wie Text (so die Tests, die mit Textzeilen arbeiten). | Viele Regeln lesen den maskierten Punkt. | Fünf Regeln lasen ihn nicht; weitere Maskierungen (Klammer, Listenzeichen) stören ebenfalls. | nativer Lauf, eigener Vergleich Text gegen Word, Gegenprüfung über rund 180 Zeilenformen | Widerlegt; R-033. Die Tests des Kerns arbeiten fast nur mit Text; ein Vergleich „dieselbe Zeile aus Word“ fehlte. |
| A-040 | Ein Wert in Anführungszeichen lässt sich immer ganz ersetzen, weil sein Ende geschrieben steht. | Das Ende ist eindeutig. | Enthält der Wert einen offenen Personenhinweis, wird der ganze Treffer verworfen, und das erste Wort bleibt stehen, das vorher ersetzt wurde. | Gegenprüfung (read-only) mit gerichtetem Zufallslauf (1 034 von 16 000 Fällen) | Widerlegt; Rückfall auf das erste Wort in `3ba2b8fb`, danach 0 Fälle. |
| A-041 | Ein Vergleichslauf ohne neuen Stopp zeigt, dass eine Regel keinen neuen Stopp bringt. | 18 600 Fälle in fünf Profilen, zweimal. | Kein Baustein des Korpus stellt denselben Namen an zwei Stellen in verschiedene Umgebungen. | Dritte Gegenprüfung (read-only); danach eigener Suchlauf mit 19 440 Fällen | Widerlegt: 1 608 neue Stopps einer Art (`Label Name Nummer`), dazu ein Stopp, wo der Kern den Namen selbst ersetzt (behoben). Der Suchlauf gehört jetzt zu den Nachweisen. |
| A-042 | Eine Zeile endet am Zeilenumbruch. | Der Kern teilt an `\n`. | Eine Textdatei von Windows endet ihre Zeilen mit `\r\n`; das `\r` blieb am Zeilenende und verhinderte jede Listenzeile. | Dritte Gegenprüfung mit einer extrahierten Textdatei | Widerlegt; behoben vor dem Commit, Test mit Windows-Zeilenenden. |
| A-043 | Ein Name ist dort zu Ende, wo die Namensform endet. | Bis zu vier großgeschriebene Wörter. | Das nächste Wort ist oft ein Satzanfang oder ein Feldlabel und ebenfalls großgeschrieben. | Zweite und dritte Gegenprüfung | Widerlegt in beide Richtungen: ohne Kürzung verschluckt die Regel Folgetext, mit Kürzung bleibt ein Namensteil wie `Im Hof` stehen. Kürzung beibehalten, Grenze dokumentiert. |
| A-044 | Was die Fundstelle eines Personenhinweises schützt, schützt auch jede weitere Stelle des Namens. | Die Fundstelle wird vor dem Kern verborgen und danach entschieden. | Verbergen ändert, was die Regeln um die Stelle sehen. | Dritte Gegenprüfung; Nachstellung am alten und neuen Kern | Widerlegt; weitere Stellen liest der Kern jetzt wie bisher, nur ein danach noch lesbarer Name wird Hinweis. |
| A-045 | Redaktion und Schlussprüfung lesen denselben Text (so der Kommentar in `privacy/base.js`: beide können sich nicht widersprechen). | Beide nutzen dieselben Muster. | Die Schlussprüfung liest Platzhalter als Leerraum, die Redaktion nicht; ein ersetzter Name zwischen Label und Nummer trennte für die eine, was für die andere zusammenstand. | Nachstellung am RC178-Kern und am Endstand; Lesen von `scanResidual` | Widerlegt; behoben in `0bd5e26f`. In RC178 gleich. |
| A-046 | Der zweite Blick der Redaktion ändert nur Dokumente, die bisher stoppten. | Er liefert, was die Schlussprüfung ohnehin meldete. | Die Erkennung hat weitere Aufrufer, und nicht jeder Fund der Schlussprüfung führte im Ablauf zum Stopp. | Gegenprüfung (read-only) mit rund 1 800 gezielten und 30 000 Zufallsfällen | Zum Teil widerlegt: mehr Ersetzung auch in Dokumenten, die durchliefen, und eine dadurch geschlossene Lücke; kein Fall mit mehr Klartext, kein neuer Stopp. |
| A-047 | Der Backlog führt die Standardumschaltung auf die neue Oberfläche als offen (so meine Antwort an den Anwender und der Abschnitt „Was nicht umgesetzt ist“). | Eine Tabellenzeile im Backlog und ein Satz in `PRODUCT.md` sagen es. | Die Tabelle ist als historischer Schnitt vom 08.10.2026 gekennzeichnet; der aktuelle Abschnitt darüber nennt die Umschaltung erledigt. | Lesen des Backlogs im Zusammenhang, beim Berichtigen der Dokumente | Widerlegt; dem Anwender und im Bericht berichtigt. Die Empfehlung, die Oberfläche zu entfernen, hing nicht daran. |
| A-048 | Die frühere Oberfläche zu entfernen kostet nichts, weil niemand sie lädt. | Das Fenster lädt nur `workspace.html`. | Tests lasen an ihr Eigenschaften ab, die die geladene Oberfläche nicht hatte. | Umbinden des Vertragstests | Zum Teil widerlegt: vier Erklärungen fehlten der geladenen Oberfläche (R-034, behoben); vier native Befehle verlieren ihren Aufrufer (offen). |
| A-049 | Was die 52 Tests der früheren Oberfläche prüften, prüfen die 535 Tests der neuen ebenfalls (so meine Einschätzung beim Entfernen). | Die neue Oberfläche hat die größere Testdatei. | Die Tests der neuen Oberfläche sind um ihre eigenen Abläufe gebaut; niemand hat die alten Fälle übertragen. | Einzelabgleich in vier unabhängigen Durchgängen, Lücken selbst nachgeprüft | Widerlegt: 2 von 52 gedeckt, 29 teilweise, 9 ungeprüft; zwei Verhalten fehlen der geladenen Oberfläche (R-035, R-036). |
| A-050 | Eine Meldung mit den Namen der abgelehnten Dateien ist so groß, wie Core und Hülle sie begrenzen. | Beide begrenzen auf 200 Namen. | 200 Namen zu je 1 024 Zeichen sind eine einzige angesagte Meldung von rund 210 000 Zeichen. | Gegenprüfung (read-only) mit ausgeführtem Fall | Widerlegt; die Oberfläche zeigt höchstens zehn Namen und zählt den Rest. |
| A-051 | Was ich in eine Quelldatei schreibe, steht dort so, wie ich es geschrieben habe. | Die Werkzeuge melden Erfolg. | Escape-Schreibweisen für unsichtbare Zeichen kamen als die Zeichen selbst an; ein regulärer Ausdruck in `workspace.js` war damit kein gültiges JavaScript mehr. | Testlauf ohne Ergebniszeile; Suche nach den Codepunkten in beiden Dateien | Widerlegt; vor dem Commit behoben. Seitdem Syntaxprüfung und Zeichensuche nach solchen Änderungen. |
| A-052 | Die nativen Läufe im automatischen Modus zeigen auch, wie sich die Personenhinweise aus R-033 in der geführten Prüfung verhalten. | Beide Modi nutzen dieselben Hinweise. | Die geführte Prüfung legt Hinweise zur Entscheidung vor; ob 201 Hinweise 201 Entscheidungen sind, hatte ich nach `1c8e971c` nicht geprüft. | Messung am Kern (403 Hinweise, 3 Entscheidungen) und nativer Lauf mit 63 Fundstellen | Nachgeholt am 27.11.: Die Prüfung fragt je Name. Neu bekannt: Die 500 weiteren Stellen werden in der Reihenfolge der Namen vergeben. |
| A-053 | Leeren der Auswahl und Hineinziehen können sich überholen (Abgleich Nr. 43). | In der Oberfläche allein ist der Ablauf möglich. | Die Hülle nimmt für `cancel_admission`, die Dateidialoge und das Hineinziehen dieselbe Sperre. | `main.rs`, `selection_guard` | Für das Produkt widerlegt. |
| A-054 | ERGEBNIS.md beschreibt nach dreizehn Übergaben überall den Endstand. | Jede Runde hat Kopf, Übersicht und Nachricht ergänzt. | Ältere Abschnitte wurden nicht mitgezogen: fehlende Commit-Tabellen, veraltete Urteile, zwei widersprüchliche Punkte der Nachricht. | unabhängiger Read-only-Lauf, 32 Meldungen | Widerlegt; berichtigt in `84474ffe`. |
| A-055 | Der Hinweis aus R-035 erscheint, sobald der Anwender in Standalone einen Ergebnisordner im Netzwerk wählt. | Der Core liefert `network_folder_notice` für einen UNC-Pfad, die Oberfläche zeigt ihn; mit nachgebildeter Antwort getestet. | Die Hülle nimmt unter Windows keinen UNC-Pfad an, und der Core lehnt einen zugeordneten Laufwerksbuchstaben ab. Die Antwort entsteht dort nie. | nativer Lauf mit `\\localhost\C$` und vorübergehendem Laufwerk `Z:`; Gegenprobe an `inspectRoot` | Widerlegt für Standalone unter Windows; neuer Befund R-038. |
| A-056 | Die Sperre, die die Ergebnisabfrage nimmt, gehört dem einen Lauf (so die erste Fassung von R-037). | Der Aufruf übergibt die Kennung des Laufs. | Die Sperrdatei ist eine für den ganzen Prüfspeicher; die Kennung steht nur im Eintrag. | Lesen von `controlGate`; Messung der Sperrdatei über einen ganzen Lauf | Widerlegt. Daraus folgt, dass eine Abfrage für einen fertigen Lauf mit einem arbeitenden Lauf um dieselbe Sperre konkurriert (R-039). |
| A-057 | Ein Fehler, der direkt nach meiner Abfrage auftritt, kommt von der Abfrage. | Der zweite Lauf der Probe brach 8 ms nach der Antwort ab. | Die Probe startete den zweiten Lauf ohne Abstand nach dem ersten. | Kontrollversuch ohne Abfrage; Versuche mit 0,5 und 2 s Abstand | Widerlegt für die Probe am Core. In der echten App hält dagegen eine Abfrage den Lauf an; dort belegen es Sperrdatei, Protokoll und Journal (R-039). |
| A-058 | Ein Test, der ein Verhalten festschreibt, schreibt ein gewolltes Verhalten fest. | `tests/test-standalone-document-control.js:241-258` verlangt, dass der Eintrag nach vier Versuchen stehen bleibt. | Der Test prüft die Funktion allein. Was der stehen gebliebene Eintrag in der laufenden App bewirkt, prüft kein Test. | nativer Lauf, zwei Versuche | Eingegrenzt: Das Stehenlassen ist als sichere Seite gewollt; die Folge, ein Stillstand bis zum Neustart, ist nicht abgefangen. |
| A-059 | Scheitert die Freigabe, hält der Arbeitsprozess die Betriebssystemsperre (so der Bericht vom Abend). | Der Arbeitsprozess arbeitete zur selben Zeit. | Die Sperre gilt als belegt, sobald irgendein Prozess ihre Datei geöffnet hat (`native/ownership-guard/ownership-guard.c:210-219`). | Probe mit echter Sperre: mit dem Arbeitsprozess allein blieb kein Eintrag liegen, mit einem dritten Prozess schon | Nicht belegt. Wer die Sperre in der echten App hielt, ist offen; die Behebung hängt nicht davon ab. |
| A-060 | Eine längere Wartezeit des Aufrufers bei der Freigabe schadet nicht. | Zulassung und Arbeitsprozess warten ebenfalls bis zu fünf Sekunden. | Der Core der Desktop-App beantwortet Anfragen nacheinander; eine Statusabfrage der Hülle wartet höchstens fünf Sekunden. | unabhängige Gegenprüfung; `desktop-sidecar.js:330-335`, `main.rs:1614-1623` gelesen | Widerlegt. Wartezeit auf rund zwei Sekunden gekürzt; den Rest übernimmt die Fortsetzung. |
| A-061 | Die Meldung unter einem Klick im Verlauf gehört zu diesem Klick. | Mein Skript las sie 1,5 Sekunden nach dem Klick. | Nach einem geöffneten Ordner stand dort teils noch die Meldung des vorigen Klicks. | Vergleich mit dem Protokoll des Core | Widerlegt. Die Zahlen des nativen Laufs stammen aus dem Protokoll des Core. |
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
