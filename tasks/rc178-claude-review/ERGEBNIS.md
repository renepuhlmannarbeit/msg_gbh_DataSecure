# RC178-Review · Ergebnis und Übergabe an Codex

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Stand 23.11.2026. Befunde und Annahmen stehen in [BEFUNDE.md](BEFUNDE.md), das
Einzelregister in [ABDECKUNG.tsv](ABDECKUNG.tsv).

## Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | [`claude/rc178-standalone-review`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review) |
| Eingefrorener Einstieg | `e88f1b8d100421017fb3909d77e338fd25c1b421` (`origin/codex/rc178-claude-review-handoff`) |
| RC178-Produktbaseline | `v3.2.0-rc178` → `13ed39ff979a5f5d9bb076d35021164de380b9dd`, Fingerprint `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` (nachgerechnet, 400 Quellinputs) |
| Geprüfter Produktstand | `e1afef0f9637803d600715bf9014185c34bc37ac`, Fingerprint `5496fabe58c2116a570e6d16806879bc9160ca28d35bee7ce852f4d6d89b763e`. Spätere Commits ändern nur `tasks/rc178-claude-review/`. |
| Prüfumgebung | Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code; Windows 11 Pro 10.0.26300 x64; Node 22.23.2 für alle Tests (Host-Node 24.18.0), npm 11.16.0, cargo/rustc 1.98.1, MSVC mit SDK 10.0.26100.0, WebView2 158.0.4370.33, Claude CLI 2.1.280 |
| Verfügbare Zielplattformen | Nur Windows x64. Kein Mac, kein Xcode, kein iOS-Simulator. |
| Abdeckung | 5 091 erfasste Einheiten in 346 Dateien: 9 `GEPRÜFT`, 1 474 `TEILGEPRÜFT`, 3 608 `OFFEN`; dazu 14 Dateigruppen (6 `TEILGEPRÜFT`, 2 `OFFEN`, 6 `AUSGENOMMEN`). Zahlen je Prüfdimension unten. |

Die Versionskennung `3.2.0-rc178` wurde nicht geändert. Der Stand ist kein
Release; ein daraus gebautes Paket trägt dieselbe Versionsnummer wie RC178,
aber den Build-Fingerprint `5496fabe…`.

## Ergebnis auf einen Blick

1. **Belegt und behoben**
   - Genitivformen bekannter Personen („Hans Müllers Auto“) blieben im
     freigegebenen Markdown; Redaktion und Restprüfung hatten dieselbe Lücke
     (R-001).
   - Eine im Dokument erkannte Telefonnummer blieb an weiteren Stellen ohne
     Label stehen (R-002).
   - Word verlor geschützte Bindestriche und positionierte Tabulatoren:
     „Müller‑Schmidt“ → „MüllerSchmidt“, „2019‑2024“ → „20192024“ (R-003,
     Teil).
   - Überschriften aus lokalisierten Word-Vorlagen wurden nicht erkannt
     (R-005).
   - Das Excel-Standarddatum erschien in US-Schreibweise (R-004, Teil).
   - Der Hinweis „Entscheidung nicht bestätigt“ war in der eingebetteten
     Prüfung unsichtbar; fünf Meldungen nannten nicht vorhandene
     Bedienelemente (R-008, R-009).
   - CLAUDE.md, Vertrag und Backlog beschrieben den Batchrunner als seriell
     (R-007); die paketierten Drittanbieterhinweise waren unvollständig
     (R-016).
2. **Widerlegte oder eingegrenzte Annahmen**
   - „Die Restprüfung fängt Unterredaktion ab“ gilt nicht, wenn sie dieselbe
     Wortgrenze nutzt wie die Redaktion (A-001).
   - „Der Batchrunner ist seriell“ gilt nur für Entscheidung, Prüfung,
     Veröffentlichung und Ausgabe; die Konvertervorbereitung ist zweispurig
     (A-004).
   - Der Checkout bringt die Voraussetzungen von
     `npm run test:product:headless` nicht mit (siehe Tests).
3. **Verbleibende Grenzen**
   - 14 Befunde sind offen und 5 nur teilweise behoben. Offen sind unter
     anderem vier in der Rust-Shell (R-011 bis R-014) und drei weitere
     Unterredaktionsmuster (R-017).
   - Kein Mac- und kein iOS-Lauf. Alle macOS-Aussagen sind Quelltext- oder
     Runner-Belege.
   - Die Einzelprüfung jeder Funktion ist nicht erreicht: 71 % der Einheiten
     sind offen.
   - Zwei Reviews (Datenschutz, Laufzeit) endeten am Schrittlimit mit
     ausdrücklich unvollständigem Bericht.
   - Abweichung vom Auftrag: Das Rust-Review hat vorhandene lokale
     Diagnoseprotokolle der installierten App gelesen (nur Ereignisnamen und
     Zähler, laut Bericht ohne Inhalte). Der Auftrag schließt
     Diagnoserohdaten aus. Nichts davon steht im Repository; die
     Befundtexte stützen sich auf den Quelltext.
4. **Für Codex zuerst** – siehe Übergabenachricht am Ende.

## Änderungen je Thema

| Commit | Befund und Annahme | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `8cf00fa7` | R-001, A-001, A-002 | `plugins/data-secure/server/privacy/engine.js`: `findLiteralSpans` akzeptiert für Personen ein Genitivsuffix; Wörterbuchschleife, persistierte Aliase und typisierte Personen in `scanResidual` nutzen es. | `tests/test-privacy-inflected-names.js` (3 Fälle, mit Gegenfällen); am alten Kern bleibt „Müllers Auto“ stehen. | Gemeinsamer Kern: gilt auch für das Cowork-Plugin und alle Ziele. Policy-Fingerprint ändert sich; halbfertige RC178-Läufe sind damit nicht fortsetzbar. |
| `af203451` | R-002 | `privacy/structured.js`: `findStructuredSpans` übernimmt unbeschriftete Telefonkandidaten, deren Ziffern einer akzeptierten Nummer gleichen (`phoneIdentity`, `samePhone`, `acceptRepeatedPhones`). | `tests/test-privacy-repeated-phones.js` (2 Fälle); Gegenfälle: fremde Nummer, Teilnummer ohne Vorwahlnull, Kalenderdatum. | wie oben |
| `14c12ee1` | R-003, A-003 | `plugins/data-secure/server/ooxml.js`: `w:noBreakHyphen` → U+2011, `w:ptab` → Tabulator. | `tests/test-docx-inline-run-content.js` (3 Fälle) | Gemeinsamer Kern, beide Zwecke. `w:sym` und Kontrollkästchen offen. |
| `c79f3aa4` | R-005 | `ooxml.js`, `word-content-context.js`: Überschriftenebene auch über den Vorlagennamen und die `basedOn`-Kette (`wordHeadingLevel`). | `tests/test-docx-heading-style-names.js` (3 Fälle) | Gemeinsamer Kern. Nur an synthetischen Fixtures gezeigt. |
| `7f7f4d6f` | R-004, A-005 | `xlsx-number-format.js`: Format 14 → `yyyy-mm-dd`, Format 22 → `yyyy-mm-dd hh:mm`. | `tests/test-xlsx-content-projection.js` (Erwartung angepasst und erweitert) | Gemeinsamer Kern. Ausgabe weicht bewusst von der Excel-Anzeige ab. |
| `c62bb1dd` | R-008, R-009, R-020 (Label) | `apps/datasecure-standalone/frontend/review.js`, `workspace.js`, `workflow-presentation.js` | `tests/test-standalone-review-frontend.js`: Fall für eingebettet und Fenster; am alten `review.js` schlagen beide fehl. | Nur Standalone, alle Ziele. Kein WebView-Nachweis für R-008. |
| `8e18e44d` | R-007, A-004 | `CLAUDE.md`, `docs/canonical/contracts/BATCH_PARALLELISM_V1.md`, `docs/canonical/BACKLOG.md` (BL-047.5) | `npm run test:docs` | keine |
| `03c621a4` | R-016 | `apps/datasecure-standalone/THIRD_PARTY_NOTICES.md` | `npm run test:docs`; Paketbau | Datei liegt in jedem Standalone-Paket. |
| `e1afef0f` | R-021 | `apps/datasecure-standalone/MACOS-START.md`, `docs/TESTING.md`, `docs/canonical/STANDALONE_ARCHITECTURE.md` | `npm run test:docs` | `MACOS-START.md` ist Fingerprint-Eingabe. |

Nicht umgesetzt und begründet:

- **R-006 (Listen als Tabellen)** – berührt den Feldschutz der Anonymisierung;
  braucht eine eigene Gegenprüfung beider Zwecke.
- **R-010 bis R-014** – Löschlogik im privaten Bereich und Rust-Shell. Ohne
  Rust-Tests je Ziel und ohne Mac nicht verantwortbar zu ändern.
- **R-004, Zahlentrennzeichen** – de-DE wäre für englische Dokumente ebenso
  falsch; Produktentscheidung.
- **R-015, R-023** – Freigabe- und Repository-Einstellungen, außerhalb des
  Auftrags.
- **R-017, R-018, R-019, R-020 (Rest), R-024, R-025** – belegt, aber nicht
  mehr in dieser Sitzung bearbeitet.

## Tests und Nachweise

Alle Läufe auf Windows 11 x64 mit Node 22.23.2. Logs liegen lokal.

| Bereich | Exakter Befehl und Teststand | Umgebung und Architektur | Ergebnis und Exitcode | Beobachtung |
| --- | --- | --- | --- | --- |
| Baseline Dokumentation | `npm run test:docs` auf `e88f1b8d` | Windows x64 | `PASS`, 0 | — |
| Baseline Headless | `node tests/run-product-suite.js headless` auf `e88f1b8d` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS` in zwei Abschnitten: Dateien 1–294 von 357 im Runner, 295–357 fortgesetzt; je Exit 0 | Erster Abschnitt brach an `tests/test-standalone-native-export.js` ab, weil die vorbereitete Laufzeit fehlte. Kein Produktfehler. |
| Reproduktion vor Fix | Scratch-Skripte gegen eine Kopie des Kerns von `dfed2d4e` | Windows x64 | Befunde reproduziert | „Müllers Auto“ und die zweite Telefonnummer bleiben stehen. |
| Gezielt nach Fix | sechs neue oder erweiterte Testdateien (siehe Tabelle oben) | Windows x64 | `PASS`, 0 | — |
| Golden | `node tests/make-fixtures.js && node tests/test-pii-regression.js` auf `af203451` | Windows x64 | `PASS`, 0 | 164 Fälle |
| Headless nach Änderung | `node tests/run-product-suite.js headless` auf `e1afef0f` | Windows x64 | `PASS`, 0 | „Product headless suite passed (361 headless files, no native GUI executed)“ |
| Dokumentation nach Änderung | `npm run test:docs` | Windows x64 | `PASS`, 0 | — |
| Konverter | `npm run test:standalone:conversion` auf `e1afef0f` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder, 21 PDF-Gruppen |
| Rust / Clippy | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract` auf `e1afef0f` | Windows x64 | je `PASS`, 0 | 321 bestanden, 0 fehlgeschlagen, 3 ignoriert; keine Rust-Datei geändert. Nur das Windows-Ziel; macOS-Zweige werden hier nicht übersetzt. |
| Cowork-Plugin | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Plugin-ZIP 319 Einträge; Marketplace-Validierung „Validation passed“ |
| Windows x64 Paket | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `42965f3dfb490e36fbc7432f6eb96682a4ecef7e77e332dc2a616715d84f792b`, 1 203 Einträge |
| Windows x64 Start | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence` | Windows x64 | `PASS`, 0 | Start 1,8 s, 0 TCP-Listener, 0 UDP-Endpunkte |
| Windows x64 Oberfläche | `tests/manual/standalone-native-workspace-gui.ps1 -Archive …`, Bedienung per Windows-UI-Automation | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe nächster Abschnitt |
| macOS Apple Silicon | — | — | `BLOCKED` (kein Mac) | Baseline-Beleg RC178: [Lauf 44744144419](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/44744144419), Runner `macos-15`, Commit `13ed39ff` |
| macOS Intel | — | — | `BLOCKED` (kein Mac) | derselbe Lauf, Runner `macos-15-intel` |
| iOS-Simulator | — | — | `BLOCKED` (kein Xcode) | — |
| `git diff --check` | `git diff --check e88f1b8d HEAD` vor dem Berichtcommit und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | Der Zwischencommit `dfed2d4e` enthielt Leerzeichen am Zeilenende im Register; der Endstand ist sauber. |

### Voraussetzungen der Headless-Suite

Der Checkout allein reicht für `npm run test:product:headless` nicht. Hergestellt
wurden, jeweils mit Projektskripten und hash-geprüften Eingaben:

| Voraussetzung | Weg | Bindung |
| --- | --- | --- |
| Node 22.23.2 | offizielles Archiv, lokal vorhanden | Archiv-SHA-256 `1177b413…` aus `native/runtime/runtime-contract.json`; `node.exe` `0d0f5e39…` |
| vier Pilot-Laufzeiten | `npm ci --prefix native/{markdown,ocr,pdfjs,graphics}/pilot --ignore-scripts --no-audit --no-fund` | Lockfiles |
| OCR-Modelle | lokale Kopie | SHA-256 aus `native/ocr/pilot/models.lock.json` |
| Ownership-Guard | `node scripts/build-ownership-guard.mjs --output … --fetch-official-inputs` | Artefakt `6d851daf…`, identisch zum RC178-Bau |
| gebündelte Laufzeit | `node scripts/build-runtime-target.mjs --target windows-x64 …` | wie Node |
| vorbereitete Standalone-Laufzeit | `node scripts/prepare-standalone-runtime.mjs` | — |

`docs/TESTING.md` nennt nur die Markdown-Laufzeit als Voraussetzung. Die
übrigen fünf fehlen dort.

### Nativer Windows-Lauf über die Oberfläche

Vom Anwender am 23.11.2026 ausdrücklich freigegeben. Technische Beobachtung,
keine E1/E2/E3-Abnahme. Vier erfundene Dateien (TXT, DOCX, XLSX).

- **Start** – Kein Zweck vorbelegt, Start gesperrt mit „Bitte Aufgabe und
  Dateien auswählen.“. Der Dateidialog füllt nur den Katalog.
- **Nur umwandeln** – 3 Markdown-Dateien unter `DataSecure-Markdown`.
  Überschriften aus der deutschen Vorlagen-ID erkannt, „2019‑2024“ und
  „Nord‑West“ mit Strich, Datum `2023-03-15`. Keine automatische Navigation.
- **Automatisch maskieren** – 3 Dateien unter `DataSecure-Output`, daneben
  `Vertraulich` mit Dateizuordnung (CSV) und Pseudonym-Zuordnung (TXT, XLSX).
  „Hans Müllers Auto“ → „[PERSON_001] Auto“; drei Telefonvorkommen ersetzt,
  auch `0049`; „Müllerstraße“ bleibt. Die Zuordnung nennt „Hans Müller“,
  „Hans Müllers“ und „Müllers“ mit 3 Vorkommen.
- **Selbst entscheiden** – Ohne Rückfrage abgeschlossen. Die eingebettete
  Prüfung wurde deshalb nicht beobachtet.
- **Originale** – SHA-256 und Änderungszeit der Eingaben nach den Läufen
  unverändert.
- **Verlauf** – „Die letzten 5 Verarbeitungen“, drei Läufe mit Aktionen je Lauf.
- **Diagnose** – Suche nach Namen, Dateinamen und Ordnernamen im
  Diagnoseordner ohne Treffer.
- **Beenden** – Fenster normal geschlossen; fünf Sekunden später kein Prozess
  aus dem Paketordner. Im Leerlauf geprüft, nicht während eines Stapels.
- **Neu gefunden** – R-024 (Überredaktion eines Zeitraums als Ort) und R-025
  (Zähltexte ohne Einzahl).

## Urteil je Prüfdimension

Zahlen aus ABDECKUNG.tsv, nur Einzeleinheiten.

| Dimension | Urteil | Befunde | Abdeckung (geprüft / teilgeprüft / offen) und Grenze |
| --- | --- | --- | --- |
| Fachlichkeit und Formatqualität | Text und CSV solide; DOCX und XLSX mit stillen Verlusten, davon drei behoben. | R-003 bis R-006, R-018 | 2 / 278 / 603. PDF, Scan-PDF, Bild-OCR und Office-OCR im Review nicht ausgeführt; Diagramme, SmartArt, Formeln nur über die Suite. |
| Anonymisierung und Zuordnungen | Zwei Leckmuster behoben; weitere bekannt und offen. Zuordnungen und CSV-/XLSX-Escaping ohne Befund. | R-001, R-002, R-017, R-024 | 6 / 231 / 455. Geführte Entscheidungen und `privacy/entities.js`, `credentials.js`, `person-ambiguities.js` nicht gelesen. |
| Oberfläche, UX und Accessibility | Ablauf entspricht DS-086; kein kritischer Befund. | R-008, R-009, R-020, R-025 | 0 / 233 / 46. Quelltext plus ein Windows-Lauf; kein Screenreader, kein Zoom, kein WKWebView. |
| Architektur und Plattform | Grenzen Oberfläche → Rust → Core → Worker nachvollzogen; Produkttrennung in der Projektion wirksam. | R-011 bis R-014, R-022 | 0 / 288 / 987. Rust nur gelesen, Testmodule nicht; macOS-Zweige ohne Lauf. |
| Implementierung und Wartbarkeit | `main.rs` (4 110 Zeilen) und `ooxml.js` (223 KB) sind zu groß für sichere Einzeländerungen; dreifache NtCreateFile-Hüllen; toter Code (`adaptive-resource-policy.js`, zwei ungenutzte Commands). | — (Verbesserungen, nicht als Befund geführt) | 1 / 203 / 675. Kein systematischer Durchgang. |
| Datenschutz und Sicherheitsgrenzen | Export überschreibt nie, Pfade handle-relativ, Diagnose mit geschlossenem Vokabular, keine Listener. | R-010, R-012 | 0 / 13 / 175. Retention, JS-Diagnose, Ergebnisexport und Prüfspeicher nicht gelesen. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Serielle Veröffentlichung belegt, zweispurige Vorbereitung belegt. | R-007, R-010, R-022 | 0 / 157 / 450. Wiederaufnahme, Absturzpfade, voller Datenträger nicht untersucht. |
| Leistung und Ressourcen | Keine Messung durchgeführt. | — | Nur Startzeit (1,8 s) und Suite-Laufzeiten beobachtet. BL-047.5 bleibt ohne Zielhostmessung. |
| Tests und Orakel | Breite Suite mit realen Aufrufpfaden, aber teuer und mit blinden Flecken. | R-019 | Gruppe `TEILGEPRÜFT`; Bewertung im nächsten Abschnitt. |
| Abhängigkeiten, CI und Lieferkette | Locks, Pins und Rechte sauber; Nachweis für Windows und Schutz von Tag und Release fehlen. | R-015, R-016, R-023 | 0 / 71 / 217. Paketinhalte der Release-Assets nicht geprüft; kein `cargo audit`. |
| Dokumentation und Nachvollziehbarkeit | Mehrere Drifts, vier korrigiert. | R-007, R-016, R-021 | Gruppe `TEILGEPRÜFT`. BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche. |

## Bewertung der Testsuite

Auf Nachfrage des Anwenders. Zahlen per Mustersuche, also Größenordnungen.

- **Umfang** – 361 Dateien im Headless-Profil, rund 124 000 Testzeilen,
  5 400 Testfälle, 31 000 Prüfaussagen. Der Produktcode (Server und
  Standalone-App mit Rust) hat rund 95 000 Zeilen.
- **Zuordnung** – etwa 142 Dateien Standalone, 143 gemeinsamer Kern, 18 nur
  Cowork, 23 Build und Dokumente, 35 Infrastruktur oder unklar.
- **Laufzeit** – Ein zusätzlicher Durchlauf mit Zeitmessung je Datei auf
  `e1afef0f` (gleicher Plan, eigene Messhilfe, 361 von 361 Dateien mit
  Exit 0) dauerte 2 990 Sekunden, also knapp 50 Minuten. Während der ersten
  Minuten lief parallel ein Rust-Testlauf; die Einzelzeiten sind
  Größenordnungen.
  - Eine Datei, `tests/test-result-generations.js`, braucht 707 Sekunden und
    damit 24 % der Gesamtzeit.
  - Die zehn langsamsten Dateien brauchen 63 %, die zwanzig langsamsten 81 %.
  - 241 der 361 Dateien laufen unter einer Sekunde; der Median liegt bei
    0,46 Sekunden.
  - Nach Zuordnung: Standalone 74 % der Zeit, gemeinsamer Kern 17 %, nur
    Cowork 5 %, Build und Dokumente 3 %.
- **Was trägt** – Die meisten Dateien rufen echte Module, Worker oder
  Kindprozesse auf. Die Suite hat in diesem Review keine falsche
  Fehlermeldung produziert und meine Fehlersuche bei der XLSX-Änderung
  sofort auf die richtige Stelle geführt.
- **Was nicht trägt**
  - Sie hat keinen der neun behobenen Befunde gezeigt. Für Genitiv,
    Telefonwiederholung, Word-Striche und lokalisierte Überschriften gab es
    keinen einzigen Fall.
  - `tests/test-standalone-frontend.js` (461 Prüfaussagen) und Teile von
    `tests/test-standalone-desktop-contract.js` prüfen die alte Oberfläche
    `app.js`, die das Hauptfenster nicht lädt.
  - Die Oberfläche wird nie in einer WebView ausgeführt; der einzige Befund
    dieser Art (R-025) kam aus dem nativen Lauf.
  - Die Suite bricht beim ersten Fehler ab und braucht sechs nicht
    dokumentierte Voraussetzungen.
- **Urteil** – Die Zahl der Dateien ist nicht das Problem: zwei Drittel
  kosten zusammen unter vier Minuten. Teuer sind rund zwanzig
  Prozess- und Lebenszyklustests, und die prüfen vor allem Abläufe (Export,
  Sidecar, Paket, Protokoll), weniger den fachlichen Inhalt. Die
  fachliche Seite – was im Markdown steht und was maskiert wird – ist
  dagegen dünn mit unabhängigen Sollwerten belegt.
- **Empfehlung** – Nicht die Zahl der Tests erhöhen, sondern vier Dinge:
  die zwanzig langsamsten Dateien in ein eigenes Profil legen und
  `tests/test-result-generations.js` untersuchen; ein schnelles Profil für
  den gemeinsamen Kern anbieten; einen kleinen fachlichen Korpus mit
  unabhängigen Sollwerten je Format aufbauen (BL-049.2); die Tests der alten
  Oberfläche auf `workspace.js` umstellen oder entfernen.

## Mac-Status

| Ebene | Apple Silicon | Intel |
| --- | --- | --- |
| Quelltext in diesem Review | gelesen, nicht ausgeführt | gelesen, nicht ausgeführt |
| CI-Runner (RC178, `13ed39ff`) | `macos-15`: Paket, Start, Konvertierung aus dem ZIP | `macos-15-intel`: ebenso |
| CI-Runner für den geänderten Stand | `NOT_RUN` (keine Actions gestartet) | `NOT_RUN` |
| Reales Gerät | `NOT_RUN` | `NOT_RUN` |

Die Änderungen dieses Reviews liegen im gemeinsamen JavaScript-Kern und im
Frontend. Plattformzweige wurden nicht berührt. Ob die zweispurige
Vorbereitung auf macOS aktiv wird, hängt an `os.freemem()` (R-022) und ist
nur auf einem Zielgerät zu klären.

## Entscheidung zu iOS

Kein iOS im Zielvertrag: `apps/datasecure-standalone/desktop-targets.json:9-42`
nennt vier Desktopziele; `tauri-contract/Cargo.toml:19` baut Tauri 2.11.5 ohne
Mobile-Merkmale, es gibt weder `src/lib.rs` noch `gen/apple`; kein Workflow
hat einen iOS-Job.

| Ansatz | Wiederverwendbarer Core | Plattformbindung und Grenzen | Prüfbarer Nachweis | Aufwand und Entscheidung |
| --- | --- | --- | --- | --- |
| Native Aufnahme mit portierbarem Fachkern (SwiftUI-Hülle, JS-Kern in verstecktem WKWebView) | `privacy/*` (20 Dateien, 353 KB, nur SHA-256 und `net.isIP` als Node-Bindung), reine `core`-Teile (rund 170 KB), OOXML-Leser mit Adaptern für `zlib`, `path`, `Buffer` | Dateiaufnahme über Dokumentpicker und zugriffsgebundene URLs; OCR über Apple Vision oder Tesseract-WASM; ein Prozess statt Sandbox-Kind; Speicher- und Hintergrundgrenzen des Systems | Simulator: gleicher Markdown-Hash wie am Desktop für ein synthetisches Korpus | mittel; bevorzugt für eine Voruntersuchung |
| Wiederverwendung der UI über Tauri v2 iOS | Frontend und derselbe JS-Kern | Kein Sidecar (Shell-Plugin erlaubt auf iOS nur das Öffnen von URLs), kein Ordnerpicker im Dialog-Plugin, Signierung verlangt laut Tauri das Developer Program; von der Rust-Shell bleibt praktisch nichts übersetzbar | `tauri ios dev` im Simulator | hoch, ohne Vorteil gegenüber dem ersten Ansatz; nicht verfolgen |

Verworfen: nodejs-mobile (Node-18-Basis) und eine Portierung nach Rust oder
Swift (zweite Core-Kopie, widerspricht CLAUDE.md).

- **Empfehlung** – iOS nicht in den Zielvertrag aufnehmen. Wenn überhaupt,
  eine eng begrenzte Voruntersuchung.
- **Kleinster Schritt ohne Apple** – Den JS-Kern (Datenschutz, reine
  Core-Teile, OOXML) ohne Node-Bausteine bündeln und in einer Browser-Engine
  gegen ein synthetisches Korpus laufen lassen. Messgröße: Byte-Gleichheit
  des anonymisierten Markdowns zum Node-Lauf und die Liste der nötigen
  Adapter.
- **Nächster Schritt** – Mac mit Xcode, nur Simulator: Dokumentpicker,
  WKWebView mit dem Bündel, Vision-OCR auf einem synthetischen deutschen Scan.
- **Abbruchkriterien** – mehr Adapter nötig als SHA-256, `isIP`, `path`,
  `zlib`, `Buffer`; abweichende Ausgabe; Vision ohne Deutsch oder unter den
  OCR-Qualitätsgrenzen; zweite Core-Kopie nötig.
- **Simulator, Gerät, Distribution** – Simulator: hier `BLOCKED`, auf einem
  Mac ohne Mitgliedschaft denkbar (nicht verifiziert). Gerät: verlangt eine
  Apple-Anmeldung, vom Team ausgeschlossen. Distribution: nur mit Developer
  Program, nicht geplant.
- **Folgen für macOS** – keine. Die macOS-Arbeit (statischer Core,
  Ad-hoc-Signatur, Finder/TCC) ist nicht übertragbar.
- **Quellen (abgerufen 23.11.2026)** –
  [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/),
  [Tauri-Shell-Plugin](https://v2.tauri.app/plugin/shell/),
  [Tauri-Dialog-Plugin](https://v2.tauri.app/plugin/dialog/),
  [Tauri-iOS-Signierung](https://v2.tauri.app/distribute/sign/ios/),
  [Apple-Mitgliedschaften](https://developer.apple.com/support/compare-memberships/),
  [Apple: Zugriff auf Verzeichnisse](https://developer.apple.com/documentation/uikit/providing-access-to-directories),
  [Apple Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest).
  Nicht verifiziert: Simulator ohne Konto, Deutsch in der Vision-API,
  JavaScriptCore ohne JIT, konkrete Speichergrenzen.

## Übergabenachricht zum Weiterreichen

```text
Claude-Code-Review für DataSecure RC178 abgeschlossen.
Branch: https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review
Einstiegscommit: e88f1b8d100421017fb3909d77e338fd25c1b421
Geprüfter Codecommit: e1afef0f9637803d600715bf9014185c34bc37ac
Veröffentlichter Remote-HEAD mit Bericht: siehe Nachricht des Anwenders
Ergebnisbericht: tasks/rc178-claude-review/ERGEBNIS.md am Remote-HEAD
Für Codex zuerst prüfen:
1. privacy/engine.js findLiteralSpans (8cf00fa7): Genitivsuffix für Personen in Redaktion und
   Restprüfung. Risiko: Überredaktion bei Namen, deren s-Form ein eigenes Wort ist.
2. privacy/structured.js acceptRepeatedPhones (af203451): unbeschriftete Nummern werden bei
   gleicher Ziffernfolge übernommen. Risiko: zufällig gleiche Zahl ohne Telefonbezug.
3. ooxml.js w:noBreakHyphen → U+2011 (14c12ee1) zusammen mit R-024: Der Strich erreicht jetzt die
   Erkennung; „im Zeitraum 2019‑2024“ wird teilweise als Ort maskiert (vorbestehende Überredaktion).
Offen oder blockiert: macOS arm64/x64 und iOS-Simulator (keine Geräte); Rust-Befunde R-011 bis R-014
nur am Quelltext; eingebettete Prüfung nicht nativ beobachtet; 71 % der Einheiten im Register offen.
```
