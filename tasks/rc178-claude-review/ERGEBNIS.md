# RC178-Review · Ergebnis und Übergabe an Codex

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Stand 23.11.2026, nach der zweiten Runde und einer dritten Prüfung. Befunde
und Annahmen stehen in [BEFUNDE.md](BEFUNDE.md), das Einzelregister in
[ABDECKUNG.tsv](ABDECKUNG.tsv).

Der Bericht hat zwei Runden. Die erste endete mit dem Remote-Stand
`d07bfced` (geprüfter Code `e1afef0f`). Danach hat der Anwender beauftragt,
die offenen Befunde zu beheben und erneut zu prüfen. Die zweite Runde umfasst
20 Codecommits bis `a0d3e340`. Eine dritte Prüfung vor der Übergabe hat in
diesem Stand eigene Fehler gefunden; sieben weitere Commits bis `ffab4fa7`
beheben sie. Dieser Bericht beschreibt den Endstand `ffab4fa7`.

## Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | [`claude/rc178-standalone-review`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review) |
| Eingefrorener Einstieg | `e88f1b8d100421017fb3909d77e338fd25c1b421` (`origin/codex/rc178-claude-review-handoff`) |
| RC178-Produktbaseline | `v3.2.0-rc178` → `13ed39ff979a5f5d9bb076d35021164de380b9dd`, Fingerprint `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` (nachgerechnet, 400 Quellinputs) |
| Geprüfter Produktstand | `d59922651508be0285034ce8b56dedc353cd6d14`, Fingerprint `0dac7e1877875c4b09e3b51c0815f44ef08e3d39c55a85c533cb7dca4223362d`. Spätere Commits ändern nur `tasks/rc178-claude-review/`. Stand der ersten Übergabe: `e1afef0f`, Fingerprint `5496fabe…`. |
| Prüfumgebung | Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code; Windows 11 Pro 10.0.26300 x64; Node 22.23.2 für alle Tests (Host-Node 24.18.0), npm 11.16.0, cargo/rustc 1.98.1, MSVC mit SDK 10.0.26100.0, WebView2 158.0.4370.33, Claude CLI 2.1.280 |
| Verfügbare Zielplattformen | Nur Windows x64. Kein Mac, kein Xcode, kein iOS-Simulator. |
| Abdeckung | 5 118 erfasste Einheiten in 346 Dateien: 26 `GEPRÜFT`, 1 941 `TEILGEPRÜFT`, 3 151 `OFFEN`; dazu 14 Dateigruppen (6 `TEILGEPRÜFT`, 2 `OFFEN`, 6 `AUSGENOMMEN`). Zahlen je Prüfdimension unten. |

Die Versionskennung `3.2.0-rc178` wurde nicht geändert. Der Stand ist kein
Release; ein daraus gebautes Paket trägt dieselbe Versionsnummer wie RC178,
aber den Build-Fingerprint `0dac7e18…`.

## Ergebnis auf einen Blick

1. **Belegt und behoben in der ersten Runde**
   - Genitivformen bekannter Personen („Hans Müllers Auto“) blieben im
     freigegebenen Markdown; Redaktion und Restprüfung hatten dieselbe Lücke
     (R-001).
   - Eine im Dokument erkannte Telefonnummer blieb an weiteren Stellen ohne
     Label stehen (R-002).
   - Word verlor geschützte Bindestriche und positionierte Tabulatoren:
     „Müller‑Schmidt“ → „MüllerSchmidt“, „2019‑2024“ → „20192024“ (R-003).
   - Überschriften aus lokalisierten Word-Vorlagen wurden nicht erkannt
     (R-005).
   - Das Excel-Standarddatum erschien in US-Schreibweise (R-004, Teil).
   - Der Hinweis „Entscheidung nicht bestätigt“ war in der eingebetteten
     Prüfung unsichtbar; fünf Meldungen nannten nicht vorhandene
     Bedienelemente (R-008, R-009).
   - CLAUDE.md, Vertrag und Backlog beschrieben den Batchrunner als seriell
     (R-007); die paketierten Drittanbieterhinweise waren unvollständig
     (R-016).
2. **Behoben in der zweiten Runde und der dritten Prüfung**
   - Weitere Schreibweisen einer schon bekannten Person blieben stehen:
     „Hr. Müller“, „Müller, Hans“, der Name als Kennung („Hans_Müller“,
     „hans_mueller“), ohne Umlaute („Hans Mueller“) und im Ziel eines Links
     (R-017, Teil).
   - Ein Lebenslauf mit einem Link, der den Namen enthält, stoppte in den
     Profilen Personalprofil, Bewerbung und Kunde mit `RESIDUAL_PII` (R-026,
     im Differenzlauf gefunden).
   - „im Zeitraum 2019‑2024“ wurde als Straßenadresse maskiert (R-024).
   - Verwaiste Vorbereitungsordner einer abgebrochenen Veröffentlichung
     blieben dauerhaft im privaten Bereich (R-010).
   - Nach rund 512 Exporten in denselben Zielordner scheiterte jeder weitere;
     die Grenze liegt jetzt bei rund 16 000 (R-011, Teil).
   - Ein fehlgeschlagener Export meldete „Konflikt“ ohne erkennbare Ursache
     (R-012, Teil); erfolgreiche Anzeigeabfragen füllten das
     Sitzungsprotokoll (R-013, Teil).
   - Argumente der Nachbearbeitung wurden nativ nicht geprüft (R-014).
   - Eine CSV mit abweichendem Vorspann fiel ohne Hinweis in eine Spalte,
     mit Abdeckung „vollständig“ (R-018).
   - Eingefügte Word-Symbole verschwanden ohne Hinweis (R-003; der Zustand
     alter Formular-Kontrollkästchen bleibt offen).
   - Zähltexte ohne Einzahl, fehlende Handlungshinweise bei Stoppgründen,
     schwache Feldränder und Rollen in der Oberfläche (R-020 Teil, R-025).
   - Der Quelltextvertrag der Oberfläche prüfte die nicht geladene alte
     Oberfläche (R-019, Teil).
3. **Eigene Fehler, gefunden und behoben vor der Übergabe**
   - Der vorgesehene Endstand der zweiten Runde (`a0d3e340`, nie gepusht)
     enthielt zwei Lecks aus meinen eigenen Änderungen: In „Anna Müller,
     Hans Müller“ blieb „Anna“ stehen, und bei „l.meier@laura-stein.de“ der
     Teil vor dem @. Dazu kamen neue Stopps und ein fehlschlagender Fall der
     Golden-Regression.
   - Gefunden haben das eine eigene Probe, ein unabhängiger Faktencheck
     dieses Berichts, ein Differenzlauf des RC178-Kerns gegen den geänderten
     Kern und zwei weitere Gegenprüfungen. Keiner meiner Tests und nicht die
     erste Gegenprüfung hatten es gezeigt.
   - Der native Lauf hat danach noch einen Fehler gezeigt, den auch diese
     Prüfungen nicht gemeldet hatten: In der vertraulichen Zuordnung fehlte
     die Person, sobald eine der neuen Schreibweisen im Dokument stand.
   - Die Korrektur ist ein Umbau, kein Flicken: Ein Link wird in den
     Profilen, die Links behalten, nicht mehr als Ganzes ersetzt, sondern nur
     der Namensteil darin. Einzelheiten in BEFUNDE.md, „Dritte Prüfung“.
   - In der ersten Gegenprüfung der zweiten Runde hatten sechs weitere
     Änderungen nicht standgehalten (BEFUNDE.md, „Einwände der
     Gegenprüfung“). Eine davon betraf schon den Stand der ersten Übergabe:
     ein geschützter Bindestrich oder Tabulator außerhalb eines Absatzes
     stoppte ein vorher konvertierbares, ungültig aufgebautes Dokument.
4. **Widerlegte oder eingegrenzte Annahmen**
   - „Die Restprüfung fängt Unterredaktion ab“ gilt nicht, wenn sie dieselbe
     Wortgrenze nutzt wie die Redaktion (A-001).
   - „Der Batchrunner ist seriell“ gilt nur für Entscheidung, Prüfung,
     Veröffentlichung und Ausgabe; die Konvertervorbereitung ist zweispurig
     (A-004).
   - Der Checkout bringt die Voraussetzungen von
     `npm run test:product:headless` nicht mit (jetzt in `docs/TESTING.md`).
   - „Ein neuer Test je Änderung reicht als Nachweis“ gilt für den
     Datenschutzkern nicht: Die Regeln überlagern sich, und erst der
     Vergleich mit dem alten Kern über viele Satzformen hat die Fehler
     gezeigt (A-015 bis A-017).
5. **Verbleibende Grenzen**
   - Offen bleiben R-006 (Listen), R-015, R-022 (Hypothesen für macOS) und
     der neu gefundene R-027: Zugangsdaten hinter einem Label mitten in der
     Zeile bleiben stehen, in RC178 wie im Endstand.
   - Nur teilweise behoben sind R-004, R-011, R-012, R-013, R-017, R-019,
     R-020 und R-023. Die Gründe stehen unten und in BEFUNDE.md.
   - Die zweite Runde ändert fünf Rust-Dateien. Übersetzt und getestet ist
     nur das Windows-Ziel; die macOS-Zweige derselben Dateien sind nicht
     übersetzt worden.
   - Kein Mac- und kein iOS-Lauf. Alle macOS-Aussagen sind Quelltext- oder
     Runner-Belege.
   - Die Einzelprüfung jeder Funktion ist nicht erreicht: 62 % der
     Einheiten sind offen.
   - Der Differenzlauf ist kein Beweis. Sein Korpus ist von mir geschrieben
     und hat die Fehler erst gezeigt, nachdem die passenden Satzformen darin
     standen.
   - Zwei Reviews der ersten Runde (Datenschutz, Laufzeit) und eine
     Gegenprüfung der dritten Prüfung endeten am Schrittlimit; die letzte
     hat ihren Bericht auf Nachfrage aus dem bis dahin Geprüften geliefert.
   - Zwei Zwischencommits (`8c0dd30b`, `b30a6dbc`) lassen sich nicht
     übersetzen: `main.rs` ist dort syntaktisch fehlerhaft, weil beim
     Aufteilen der Änderungen Code an die falsche Stelle geriet. Ab
     `aef66f19` ist die Datei wieder korrekt. Die Commits `cfee417a` bis
     `a0d3e340` enthalten außerdem die in Punkt 3 genannten Fehler des
     Datenschutzkerns; erst ab `e07ca2e6` sind sie behoben. Wegen der
     Projektregel gegen History-Rewrites nicht umgeschrieben.
   - Abweichung vom Auftrag in der ersten Runde: Das Rust-Review hat
     vorhandene lokale Diagnoseprotokolle der installierten App gelesen (nur
     Ereignisnamen und Zähler, laut Bericht ohne Inhalte). Der Auftrag
     schließt Diagnoserohdaten aus. Nichts davon steht im Repository; die
     Befundtexte stützen sich auf den Quelltext.
6. **Für Codex zuerst** – siehe Übergabenachricht am Ende.

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

Zweite Runde:

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `7b078d75`, Test `7693e162` | R-024 | `privacy/structured.js`: ein Zeitwort mit Jahreszahl oder Jahresspanne („im Zeitraum 2019‑2024“) gilt nicht als Straßenadresse (geschlossene Wortliste). | `tests/test-privacy-time-periods.js` (1 Fall mit vier Gegenfällen, darunter „Zeitraumstraße 12“) | Gemeinsamer Kern, auch Cowork. |
| `cfee417a`, `ac74cf71` | R-017 | `privacy/engine.js`: abgekürzte Anrede („Hr.“, „Fr.“), „Nachname, Vorname“, Kennungen mit `_` und `.`, Genitiv eines bekannten Alias im Folgedokument. Die hier eingeführte Ganzersetzung von Links und die Regel für umgestellte Namen waren fehlerhaft; siehe „Dritte Prüfung“. Grenze in `docs/canonical/STANDALONE_SECURITY_MODEL.md`. | `tests/test-privacy-name-variants.js` (am Endstand 9 Fälle, mit Gegenfällen) | Gemeinsamer Kern, auch Cowork. Policy-Fingerprint ändert sich. |
| `97a70cd0`, `f8c69fe3`, Tests `7693e162` | R-010 | `standalone/markdown-retention.js`: verwaiste `.pending-…`-Ordner werden entfernt, wenn sie älter sind als die Aufbewahrungsfrist und in jedem Fall älter als eine Stunde; ein verschwindender Eintrag bricht den Lauf nicht ab. Der Schutz einer laufenden Veröffentlichung beruht auf dem Alter, nicht auf einer Sperre. | `tests/test-markdown-retention.js` (15 Fälle) | Nur Standalone, alle Ziele; nur unter Windows ausgeführt. |
| `5f8bf47b`, `3b8fbba9`, Kommentar `d5992265` | R-011 | `tauri-contract/src/export_directory.rs`: nur verwaiste Vorbereitungen zählen gegen die Grenze von 2 048; die Gesamtzahl der Namen ist auf 65 536 begrenzt, das sind rund 16 000 Exporte je Zielordner. Windows-Listing mit einer Menge je Listing. | Rust-Test `completed_records_do_not_exhaust_the_abandoned_preparation_bound` | `write_record_bounded` ist plattformneutral; das Listing ist ein Windows-Zweig. macOS nicht übersetzt. |
| `8c0dd30b` | R-012 | `native_export_broker.rs`, `native_export_channel.rs`, `main.rs`, `diagnostic_bundle.rs`: Diagnoseereignis `native_export_failed` mit Fehlerklasse und Systemcode, ohne Pfad; `frontend/document-review.js`: Hinweistext mit möglichen Ursachen. | Rust-Tests für die Erfassung der Ursache und für die Bereinigung des Ereignisses. Kein Test zeigt, dass ein fehlschlagender Export das Ereignis tatsächlich schreibt: der Aufruf ist im Testbau abgeschaltet. | Plattformneutraler Code; macOS nicht übersetzt. Commit allein nicht übersetzbar. |
| `b30a6dbc`, `1fb7eaee` | R-013 | `main.rs`: höchstens 64 protokollierte erfolgreiche Anzeigeabfragen je Art; Fehler immer, bei Bedarf mit nachgeholter Startzeile. | Rust-Test `successful_display_polls_stop_filling_the_session_log_after_their_budget` | wie oben. `b30a6dbc` allein nicht übersetzbar. |
| `aef66f19`, `22688d75`, Kommentar `d5992265` | R-014 | `main.rs`: `validate_document_review_request` prüft Form und Grenzen aller Nachbearbeitungs-Argumente vor dem privaten Frame, mit den Grenzen und Codes von `validatePrivateMessage` im Core. Strenger als der Core ist sie nur bei JSON, das die Oberfläche nie erzeugt (Zahl als Bruch, Nicht-Zeichenkette). | Rust-Test `document_review_arguments_are_refused_natively_before_they_become_a_private_frame` | wie oben |
| `803acbb9` | R-018 | `document-parser.js`, `core/csv-table-shape.js`, `standalone/markdown-extractor.js`: Zeile nur aus Leerzeichen gilt als leer; abweichender Vorspann ergibt den Hinweis `SOURCE_COVERAGE_UNVERIFIED`. | `tests/test-markdown-extractor.js`, `tests/test-csv-source.js` | Gemeinsamer Kern. |
| `0d9e115c`, `a0d3e340` | R-003 | `ooxml.js`: `w:sym` wird zum Zeichen (Symbol-Schrift: griechische Buchstaben) oder zum Marker `[Symbol]`; lose Marken außerhalb eines Absatzes bleiben folgenlos. | `tests/test-docx-inline-run-content.js` (5 Fälle) | Gemeinsamer Kern, beide Zwecke. |
| `2726675a` | R-020, R-025, R-018 | `frontend/workspace.js`, `workflow-presentation.js`, `review.html`, `design-tokens.css`, `workspace.css`, `review-workspace.css` | `tests/test-workflow-presentation.js` (54 Fälle) | Nur Standalone, alle Ziele; kein WKWebView-Nachweis. |
| `7e9e0530` | R-019 | `tests/test-standalone-loaded-frontend-contract.js`: Vertrag gegen die tatsächlich geladenen Dateien | 4 Fälle | — |
| `871daa7f` | R-016 | `scripts/lib/standalone-conversion-runtime.mjs`: SPDX-Ausdruck für emf-converter | Paketbau und Paketprüfung | Paketmanifest aller Ziele. |
| `6a90ed16` | R-023 | `scripts/audit-standalone-dependencies.mjs`, `npm run audit:standalone` | lokal ausgeführt: paketierte Locks ohne Befund | Fragt die npm-Registry mit Paketnamen und Versionen ab; kein Bestandteil der Suite. |
| `2e34d532` | R-004, R-015, R-021 | `docs/FORMAT_COVERAGE_MATRIX.md`, `docs/TESTING.md`, `docs/RELEASE.md`, `docs/canonical/DOCUMENT_REGISTER.md`, `docs/canonical/TRACEABILITY.md` | `npm run test:docs` | keine |

Dritte Prüfung (Einzelheiten in BEFUNDE.md, „Dritte Prüfung“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `3e4a1be1` | R-017, Regression aus `cfee417a` | `privacy/engine.js`: „Nachname, Vorname“ gilt nicht, wo es einen vollen Namen in üblicher Reihenfolge schneidet („Anna Müller, Hans Müller“). | `tests/test-privacy-name-variants.js`, Fall „an enumeration of full names …“; schlägt am Stand `a0d3e340` fehl | Gemeinsamer Kern, auch Cowork. |
| `d91462b9` | R-026 | `privacy/engine.js`: in den Profilen, die jeden Link ersetzen, weichen Namenstreffer, die ganz im Link liegen, der Ganzersetzung, sofern nichts anderes den Link berührt. | derselbe Test, Fall „profiles that replace every link …“, mit E-Mail-Domain und überstehendem Namen als Gegenfällen | wie oben |
| `d4740dd6` | R-017 | `privacy/engine.js`: „Fr.“ nach einer Wochentagsspanne bleibt stehen. | derselbe Test, Fall „abbreviated salutations …“ | wie oben |
| `e07ca2e6` | R-017, Regressionen aus `cfee417a` und `ac74cf71` | `privacy/engine.js`: keine Ganzersetzung von Links mehr; der Namensteil und eine prozentkodierte E-Mail-Adresse im Link werden an Ort und Stelle ersetzt (`linkIdentityHits`), die Restprüfung nutzt dieselbe Funktion. Voller Name ohne Umlaute als weitere Schreibweise (`asciiNameSpellings`). Zusätzliche Schreibweisen gehen nicht mehr an die Restprüfung. `docs/canonical/STANDALONE_SECURITY_MODEL.md`. | derselbe Test (9 Fälle); `tests/test-pii-regression.js` (164 Fälle, am Stand `a0d3e340` 1 Fehler); Differenzlauf | wie oben. Policy-Fingerprint ändert sich. |
| `7693e162` | R-010, R-024 | nur Tests | `tests/test-markdown-retention.js`, `tests/test-privacy-time-periods.js` | — |
| `d5992265` | R-011, R-014 | zwei Kommentare in `export_directory.rs` und `main.rs` berichtigt, kein Code | `cargo test`, Clippy | — |
| `ffab4fa7` | R-017, Regression aus `cfee417a` und `e07ca2e6` | `privacy/engine.js`: zusätzliche Schreibweisen tragen den eingeführten Namen der Person als Identität. Vorher fehlte die Person in der vertraulichen Zuordnung, sobald eine dieser Schreibweisen im Dokument stand. | `tests/test-privacy-name-variants.js` (10 Fälle), Fall „every spelling of one person …“; schlägt am Stand `d5992265` fehl. Im nativen Lauf gefunden und danach dort bestätigt. | Gemeinsamer Kern, auch Cowork. |

Nicht umgesetzt und begründet (Einzelheiten in BEFUNDE.md, „Entscheidungen je
Befund“):

- **R-027, Zugangsdaten hinter einem Label mitten in der Zeile** – erst am
  Ende der dritten Prüfung gefunden; der Detektor erkennt absichtlich nur ein
  Feld am Zeilenanfang. Eine Änderung braucht eine eigene Analyse und
  Gegenprüfung.
- **R-003, Zustand alter Formular-Kontrollkästchen** – liegt im Feldmodell
  des Word-Lesers, nicht im Lauftext; nicht bearbeitet.

- **R-006 (Listen als Tabellen)** – die Tabellenform schützt die erzeugte
  Listennummer vor der Anonymisierung und ist durch einen Test
  festgeschrieben. Eine lesbare Form nur für „Nur umwandeln“ braucht eine
  Darstellungsoption im Konvertervertrag.
- **R-004, Zahlentrennzeichen** – de-DE wäre für englische Dokumente ebenso
  falsch; als feste Schreibweise dokumentiert, Umstellung ist
  Produktentscheidung.
- **R-017, einzelner Nachname ohne Personenkontext im Folgedokument** –
  bewusste Abwägung des Kerns; als Grenze dokumentiert.
- **R-012, öffentlicher Fehlercode** – unverändert, weil Core und Oberfläche
  auf den bekannten Codes aufbauen.
- **R-013, alte Protokolldateien; R-020, Seitenzoom** – nativer Löschcode
  und eine zusätzliche macOS-Berechtigung sind ohne Mac nicht verantwortbar.
- **R-015, R-023 (Rest)** – Freigabe- und Repository-Einstellungen.
- **R-022** – Hypothesen für macOS; nur auf einem Zielgerät zu klären.
- **R-019, Tests der alten Oberfläche** – bestehen weiter; entfernen hieße,
  `app.js` aus dem Paket zu nehmen, und das ist eine eigene Entscheidung.

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

In RC178 nannte `docs/TESTING.md` nur die Markdown-Laufzeit. Seit `2e34d532`
stehen dort alle sechs Voraussetzungen.

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

Zahlen aus ABDECKUNG.tsv am Stand `d5992265`, nur Einzeleinheiten. Das
Register zählte in der ersten Runde Produktivcode hinter einem
`#[cfg(test)]` irrtümlich als Rust-Testmodul und damit als offen. Die
Erkennung ist korrigiert; dadurch gelten rund 460 Rust-Einheiten jetzt als
teilgeprüft, weil ihre Datei im Rust-Review vollständig gelesen wurde. Das
ist eine Korrektur der Zählung, keine zusätzliche Prüfung.

| Dimension | Urteil | Befunde | Abdeckung (geprüft / teilgeprüft / offen) und Grenze |
| --- | --- | --- | --- |
| Fachlichkeit und Formatqualität | Text und CSV solide; die belegten stillen Verluste in DOCX, XLSX und CSV sind behoben oder als Hinweis sichtbar, bis auf den Zustand alter Formular-Kontrollkästchen. Listen bleiben Tabellen. Ein Lebenslauf mit Namenslink ist jetzt automatisch verarbeitbar. | R-003 bis R-006, R-018, R-026 | 5 / 277 / 603. PDF, Scan-PDF, Bild-OCR und Office-OCR im Review nicht ausgeführt; Diagramme, SmartArt, Formeln nur über die Suite. |
| Anonymisierung und Zuordnungen | Mehrere Leckmuster und eine Überredaktion behoben; zwei eigene Lecks der zweiten Runde vor der Übergabe gefunden und behoben. Gegenüber RC178 zeigt der Differenzlauf am Endstand keine Verschlechterung. Offen: Zugangsdaten mitten in der Zeile (R-027), dokumentierte Grenzen der Namenserkennung. Zuordnungen und CSV-/XLSX-Escaping ohne Befund. | R-001, R-002, R-017, R-024, R-026, R-027 | 9 / 234 / 455. Geführte Entscheidungen nicht ausgeführt; `privacy/entities.js`, `credentials.js`, `person-ambiguities.js` nicht gelesen. |
| Oberfläche, UX und Accessibility | Ablauf entspricht DS-086; kein kritischer Befund. Texte und Rollen nachgebessert. | R-008, R-009, R-020, R-025 | 0 / 234 / 46. Quelltext plus Windows-Läufe; kein Screenreader, kein Zoom, kein WKWebView. |
| Architektur und Plattform | Grenzen Oberfläche → Rust → Core → Worker nachvollzogen; Produkttrennung in der Projektion wirksam. Vier Befunde der Rust-Shell behoben oder eingegrenzt. | R-011 bis R-014, R-022 | 11 / 752 / 530. Rust-Tests nur für Windows; macOS-Zweige siehe Mac-Status. |
| Implementierung und Wartbarkeit | `main.rs` (rund 4 400 Zeilen), `ooxml.js` (226 KB) und `privacy/engine.js` sind zu groß für sichere Einzeländerungen; im Datenschutzkern überlagern sich Regeln über Ränge, sodass eine neue Regel an entfernten Stellen wirkt. Dreifache NtCreateFile-Hüllen; toter Code (`adaptive-resource-policy.js`, zwei ungenutzte Commands). Die zweite Runde hat `main.rs` um rund 280 Zeilen vergrößert. | — (Verbesserungen, nicht als Befund geführt) | 1 / 203 / 675. Kein systematischer Durchgang. |
| Datenschutz und Sicherheitsgrenzen | Export überschreibt nie, Pfade handle-relativ, Diagnose mit geschlossenem Vokabular, keine Listener. Das neue Diagnoseereignis trägt nur Fehlerklasse und Systemcode. | R-010, R-012 | 0 / 13 / 175. JS-Diagnose, Ergebnisexport und Prüfspeicher nicht gelesen. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Serielle Veröffentlichung belegt, zweispurige Vorbereitung belegt. Verwaiste Vorbereitungen werden bereinigt; eine laufende Veröffentlichung schützt allein ihr Alter. | R-007, R-010, R-022 (Hypothese) | 0 / 157 / 450. Wiederaufnahme, Absturzpfade, voller Datenträger nicht untersucht. |
| Leistung und Ressourcen | Nur ein Vorher-nachher-Vergleich des Datenschutzkerns: 109 KB Prosa 0,86 s zu 0,89 s, 328 KB 5,9 s zu 5,7 s. Der Kern skaliert schon in RC178 überlinear. | — | Dazu Startzeit und Suite-Laufzeiten. BL-047.5 bleibt ohne Zielhostmessung. |
| Tests und Orakel | Breite Suite mit realen Aufrufpfaden, aber teuer und mit blinden Flecken. Für den Datenschutzkern fehlt ein Vergleichsorakel: die Regressionen der zweiten Runde zeigte erst der Differenzlauf gegen den alten Kern. | R-019 | Gruppe `TEILGEPRÜFT`; Bewertung im nächsten Abschnitt. |
| Abhängigkeiten, CI und Lieferkette | Locks, Pins und Rechte sauber; paketierte JavaScript-Abhängigkeiten lokal ohne bekannten Befund. Nachweis für Windows und Schutz von Tag und Release fehlen. | R-015, R-016, R-023 | 0 / 71 / 217. Paketinhalte der Release-Assets nicht geprüft; kein `cargo audit`. |
| Dokumentation und Nachvollziehbarkeit | Mehrere Drifts korrigiert, darunter Testvoraussetzungen, Formatverhalten und Release-Herkunft. | R-007, R-015, R-016, R-021 | Gruppe `TEILGEPRÜFT`. BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche. |

## Bewertung der Testsuite

Auf Nachfrage des Anwenders. Zahlen per Mustersuche, also Größenordnungen.
Umfang und Laufzeit wurden am Stand der ersten Runde (`e1afef0f`, 361
Dateien) erhoben; die zweite Runde ergänzt drei Dateien auf 364.

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
  - Die Suite bricht beim ersten Fehler ab und braucht sechs
    Voraussetzungen, die erst seit der zweiten Runde dokumentiert sind.
  - Auch die Befunde der zweiten Runde hat sie nicht gezeigt; zwei davon
    (R-024, R-025) kamen aus dem nativen Lauf, die übrigen aus dem Lesen.
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
  Oberfläche auf `workspace.js` umstellen oder entfernen. Für den letzten
  Punkt bindet `tests/test-standalone-loaded-frontend-contract.js` seit der
  zweiten Runde den Quelltextvertrag an die geladenen Dateien.

## Mac-Status

| Ebene | Apple Silicon | Intel |
| --- | --- | --- |
| Quelltext in diesem Review | gelesen und in der zweiten Runde geändert, nicht übersetzt | gelesen und geändert, nicht übersetzt |
| CI-Runner (RC178, `13ed39ff`) | `macos-15`: Paket, Start, Konvertierung aus dem ZIP | `macos-15-intel`: ebenso |
| CI-Runner für den geänderten Stand | `NOT_RUN` (keine Actions gestartet) | `NOT_RUN` |
| Reales Gerät | `NOT_RUN` | `NOT_RUN` |

Die erste Runde änderte nur den gemeinsamen JavaScript-Kern und das Frontend.
Die zweite Runde ändert zusätzlich fünf Rust-Dateien (`main.rs`,
`export_directory.rs`, `native_export_broker.rs`, `native_export_channel.rs`,
`diagnostic_bundle.rs`). Der neue Code ist plattformneutral geschrieben, mit
einer Ausnahme: `parse_names_seen` liegt im Windows-Zweig des
Verzeichnislistings. Den macOS-Zweig desselben Listings habe ich nicht
angefasst; er hat dieselbe Signatur und prüft Duplikate schon bisher linear
(`export_directory.rs:1005-1038`).

Ein Typcheck für `aarch64-apple-darwin` von Windows aus (`cargo check
--locked --all-targets --target aarch64-apple-darwin`) kam bis zum eigenen
Crate: 42 Abhängigkeiten wurden geprüft, dann stoppte das Build-Skript des
Projekts, weil der freigegebene statische macOS-Core
(`dist/macos-static-core/macos-arm64`) auf diesem Host fehlt. Diese Prüfung
ist gewollt; ich habe sie nicht umgangen. Der Rust-Code der Shell ist damit
für macOS weder übersetzt noch typgeprüft. Ob der Stand auf macOS übersetzt
und die Rust-Tests dort bestehen, ist der erste Prüfpunkt für einen
Mac-Runner. Ob die zweispurige
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
