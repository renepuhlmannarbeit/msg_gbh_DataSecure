# RC178-Review · Ergebnis und Übergabe an Codex

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Stand 24.11.2026, nach der zweiten Runde, einer dritten Prüfung, der
Bearbeitung von R-027 und der Behebung von R-028 bis R-030. Befunde
und Annahmen stehen in [BEFUNDE.md](BEFUNDE.md), das Einzelregister in
[ABDECKUNG.tsv](ABDECKUNG.tsv).

Der Bericht hat zwei Runden. Die erste endete mit dem Remote-Stand
`d07bfced` (geprüfter Code `e1afef0f`). Danach hat der Anwender beauftragt,
die offenen Befunde zu beheben und erneut zu prüfen. Die zweite Runde umfasst
20 Codecommits bis `a0d3e340`. Eine dritte Prüfung vor der Übergabe hat in
diesem Stand eigene Fehler gefunden; sieben weitere Commits bis `ffab4fa7`
beheben sie. Dieser Stand wurde als `3908a921` übergeben. Danach hat der
Anwender beauftragt, den dabei offen gebliebenen Befund R-027 zu beheben; das
ist der Codecommit `283e6ed9`; `ebe526ec` ergänzt danach die Beschreibung im
Sicherheitsmodell. Dieser Stand wurde als `e92d5b12` übergeben. Am 24.11.
hat der Anwender beauftragt, die beiden dabei gemeldeten Beobachtungen R-028
und R-029 zu beheben und erneut zu prüfen; das sind die vier Commits
`dbf98cbf` bis `0b99529c`. Dieser Bericht beschreibt den Endstand
`0b99529c`.

## Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | [`claude/rc178-standalone-review`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review) |
| Eingefrorener Einstieg | `e88f1b8d100421017fb3909d77e338fd25c1b421` (`origin/codex/rc178-claude-review-handoff`) |
| RC178-Produktbaseline | `v3.2.0-rc178` → `13ed39ff979a5f5d9bb076d35021164de380b9dd`, Fingerprint `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` (nachgerechnet, 400 Quellinputs) |
| Geprüfter Produktstand | `0b99529cff549a02947898ad54d08620451a268f`. Produktcode zuletzt geändert in `b71439b20a91ba682135a577c2c17fec3f360d50`, Fingerprint `b4466f2a305324a502db87f2d877a3dabd2356d92dd86313bb8515ff1ce19940`; `b11a6131` und `0b99529c` ändern danach nur ein Prüfskript und einen Test und den Fingerprint nicht. Alle späteren Commits ändern nur `tasks/rc178-claude-review/`. Stand der dritten Übergabe: `ebe526ec`, Fingerprint `043e3b81…`; der zweiten: `ffab4fa7`, Fingerprint `1803bce7…`; der ersten: `e1afef0f`, Fingerprint `5496fabe…`. |
| Prüfumgebung | Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code; Windows 11 Pro 10.0.26300 x64; Node 22.23.2 für alle Tests (Host-Node 24.18.0), npm 11.16.0, cargo/rustc 1.98.1, MSVC mit SDK 10.0.26100.0, WebView2 158.0.4370.33, Claude CLI 2.1.280 |
| Verfügbare Zielplattformen | Nur Windows x64. Kein Mac, kein Xcode, kein iOS-Simulator. |
| Abdeckung | 5 135 erfasste Einheiten in 346 Dateien: 32 `GEPRÜFT`, 1 944 `TEILGEPRÜFT`, 3 159 `OFFEN`; dazu 14 Dateigruppen (6 `TEILGEPRÜFT`, 2 `OFFEN`, 6 `AUSGENOMMEN`). Zahlen je Prüfdimension unten. |

Die Versionskennung `3.2.0-rc178` wurde nicht geändert. Der Stand ist kein
Release; ein daraus gebautes Paket trägt dieselbe Versionsnummer wie RC178,
aber den Build-Fingerprint `b4466f2a…`.

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
   - Nach der Übergabe, auf Auftrag: Ein Passwort im Dokument blieb stehen,
     sobald sein Label nicht das erste Wort der Zeile war („WLAN-Passwort:
     …“, „Admin PIN: …“, „…, Passwort: …“). Jetzt wird das Wort hinter dem
     Label ersetzt (R-027, Teil). Die App selbst verlangt weiterhin keine
     Zugangsdaten; es geht um Inhalte der verarbeiteten Dokumente.
   - Am 24.11., auf Auftrag: Hält ein anderes Programm einen Ordner über
     dem Datenordner offen, nennt die App jetzt diese Ursache und den Weg
     zurück („kurz warten, dann Verbindung und Laufstatus prüfen“) statt
     „nicht sicher, Installation mit der IT prüfen“. Eine Belegung bis rund
     zwei Sekunden wartet sie ab. Die Schutzgrenze ist unverändert: Ohne
     gehaltene Ordnerkette startet weiterhin kein Core (R-028).
   - Die Windows-Startprobe scheiterte nicht zufällig, sondern immer dann,
     wenn sie einen UDP-Endpunkt des WebView2-Netzwerkdienstes sah: Sie
     verglich dessen Profilordner ohne den Unterordner `EBWebView`. Aus
     demselben Grund hat ihr Abbau nie auf WebView2 gewartet. Beides ist
     korrigiert; die Ursache eines Abbruchs geht nicht mehr verloren
     (R-029).
   - Das Messskript für Startzeit und Netzwerkbeobachtung brach in der
     ersten Wiederholung ab; in der Gegenprüfung gefunden und behoben
     (R-030).
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
   - Bei R-027 haben vier unabhängige Gegenprüfungen nacheinander vier
     Fassungen der Regel widerlegt, bevor etwas committet wurde: zwei hätten
     Namen freigegeben, zwei hätten Dokumente gestoppt, die RC178 verarbeitet
     (BEFUNDE.md, „R-027 · Umsetzung und Gegenprüfungen“). Eine fünfte
     Gegenprüfung nach dem Commit hat die umgesetzte Fassung in rund 71 000
     Fällen nicht widerlegt.
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
   - Offen bleiben R-006 (Listen), R-015 und R-022 (Hypothesen für macOS).
   - R-028 ist kein Schutz vor einer langen Belegung: Hält ein Programm
     einen Ordner der Kette länger als rund zwei Sekunden, startet der Core
     weiterhin nicht, bis der Anwender nach der Freigabe erneut prüft. Wer
     den Temp-Ordner am 24.11. sieben Minuten lang hielt, ist unbekannt; ob
     das auf Zielhosts für `AppData\Local` vorkommt, ist nicht belegt.
   - R-029 hat eine Beobachtung sichtbar gemacht, die vorher als Fehler der
     Probe unterging: Der WebView2-Netzwerkdienst hält beim Start in manchen
     Läufen kurz einen UDP-Endpunkt (Adresse `::`, flüchtiger Port). Die App
     setzt für WebView2 keine Netzwerkargumente. Ob darüber ein Paket
     gesendet wird, habe ich nicht gemessen.
   - Der Abbau der Startprobe wartet jetzt erstmals wirklich auf WebView2
     (hier 0,1 bis 0,3 s von 20 s). Im Release-Workflow und in
     `scripts/run-pkg-04.ps1` ist das nicht ausgeführt worden.
   - Nur teilweise behoben sind R-004, R-011, R-012, R-013, R-017, R-019,
     R-020, R-023, R-025 und R-027. Die Gründe stehen unten und in
     BEFUNDE.md.
   - R-027 ist eine zusätzliche Ersetzung, kein Schutzversprechen: Von einem
     Passwort aus mehreren Wörtern mitten in der Zeile wird nur das erste
     ersetzt, und in Dokumenten mit wiederholten gleichlautenden Zeilen und
     noch unbekannten Namen kann die Ersetzung ganz unterbleiben. Die
     Restprüfung stoppt in keinem dieser Fälle.
   - Folgen von R-027, die man kennen sollte: Einzelne Dokumente, die RC178
     an der Schlussprüfung stoppte, laufen jetzt durch, weil das beanstandete
     Wort ersetzt ist; vom Kern nicht erkannte Namen an anderer Stelle stehen
     dann im Ergebnis. Der Datenschutzkern braucht für Dokumente mit vielen
     solchen Labels 26 bis 45 % länger.
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

Nach der Übergabe (Einzelheiten in BEFUNDE.md, „R-027 · Umsetzung und
Gegenprüfungen“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `283e6ed9` | R-027, A-018 bis A-020 | `privacy/base.js`: Muster für ein Zugangsdaten-Label mitten in der Zeile. `privacy/structured.js`: eigener Detektor und `findInlineCredentialSpans`, getrennt von der gewöhnlichen Suche. `gateway/privacy-text-operation.js`: das Wort hinter dem Label wird nach dem Kern ersetzt, wenn es zu keinem offenen Befund gehört und die Prüfung danach dieselben offenen Entscheidungen ergibt. `privacy/engine.js` ist unverändert. Dokumentiert in `docs/canonical/STANDALONE_SECURITY_MODEL.md`, `docs/FORMAT_COVERAGE_MATRIX.md`, `docs/TESTING.md`. | `tests/test-privacy-inline-credentials.js` (7 Fälle mit den Gegenfällen der vier Gegenprüfungen); `tests/test-pii-regression.js` (164 Fälle); Differenzlauf | Gemeinsamer Kern, auch Cowork. Policy-Fingerprint ändert sich. |

| `ebe526ec` | R-027 | `docs/canonical/STANDALONE_SECURITY_MODEL.md`: drei Folgen der Regel, die die fünfte Gegenprüfung gezeigt hat (das Wort reicht bis zum nächsten Leerraum; einzelne bisher gestoppte Dokumente laufen durch; die Prüfung läuft für solche Dokumente zweimal). Kein Code. | `npm run test:docs` und die beiden Dokumenttests | — |

Am 24.11. auf Auftrag (Einzelheiten in BEFUNDE.md, „R-028 bis R-030 ·
Umsetzung, Gegenprüfung und nativer Nachweis“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `dbf98cbf` | R-029, A-021, A-022 | `tests/manual/standalone-native-windows-launch.ps1`: eine Profilregel (Ordner oder genau sein Unterordner `EBWebView`) für Netzwerkbeobachtung und Abbau; die Ursache eines nicht zuordenbaren Endpunkts wird festgehalten und im `finally` ausgegeben; `udp_processes` immer als Liste; der Abbau nennt seine Wartezeit. `docs/TESTING.md` beschreibt Regel und Zeilen. Kein Produktcode. | `tests/test-native-smoke-integrity.js` (drei neue oder erweiterte Fälle), Vertragsmodus 55 Gruppen; 14 von 14 Läufen gegen das Paket | Nur Windows. Der Abbau ist dadurch auch im Release-Workflow und in `scripts/run-pkg-04.ps1` erstmals wirksam; dort nicht ausgeführt. |
| `b11a6131`, `0b99529c` | R-030 | `tests/manual/measure-standalone-native-windows.ps1`: wertet nur die JSON-Zeile aus; eine Zeile der App auf dem Fehlerkanal beendet die Messung nicht mehr; `observed_udp_processes` immer als Liste. Kein Produktcode. | ein Fall in `tests/test-native-smoke-integrity.js` mit echter Zeilenfolge und Fehlerkanal; Messung über zehn Starts | Nur Windows. |
| `b71439b2` | R-028, A-023, A-024 | `tauri-contract/src/private_namespace.rs`: Freigabekonflikt gilt als Belegung; begrenztes Warten vor dem Anlegen. `tauri-contract/src/main.rs`: `STANDALONE_DATA_ROOT_BUSY` an den vier Stellen vor dem Start des Core; ein solcher Versuch zählt nicht gegen die 16 Startversuche. `frontend/workspace.js`: Meldung und Statustext. `docs/canonical/STANDALONE_SECURITY_MODEL.md`: neuer Abschnitt. Freigabe und Zugriffsrechte der Ordnerkette sind unverändert. | sieben Rust-Tests, `tests/test-standalone-desktop-contract.js` (ein Fall), `tests/test-standalone-workspace.js` (drei Fälle); Mutationsprobe; nativer Lauf mit Halterprozess | Nur Windows: `private_namespace` gibt es nur dort. Der neue Code steht in der gemeinsamen Oberfläche, entsteht auf macOS aber nicht. macOS nicht übersetzt. |

Nicht umgesetzt und begründet (Einzelheiten in BEFUNDE.md, „Entscheidungen je
Befund“):

- **Rest von R-025** – weitere Zähltexte ohne Einzahl in der geführten
  Prüfung; im nativen Lauf beobachtet und nur festgehalten.
- **R-028, lange Belegung** – nicht behebbar, ohne die Schutzgrenze zu
  ändern; die App nennt jetzt Ursache und Ausweg.
- **R-027, Rest** – mehrwortige Geheimnisse hinter einem Label mitten in der
  Zeile, Labels in Überschriften, Tabellen und Links, `PW`/`Pwd`, Wert in der
  Folgezeile. Jede breitere Fassung hat in der Gegenprüfung Namen freigegeben
  oder Dokumente gestoppt.
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

Alle Läufe auf Windows 11 x64 mit Node 22.23.2. Logs liegen lokal. Die
ersten Zeilen gelten dem Endstand `0b99529c` (Produktcode `b71439b2`), die
folgenden halten die früheren Stände fest.

| Bereich | Exakter Befehl und Teststand | Umgebung und Architektur | Ergebnis und Exitcode | Beobachtung |
| --- | --- | --- | --- | --- |
| Headless, Endstand | `node tests/run-product-suite.js headless` auf `0b99529c` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 09:33–10:30 am 24.11. Parallel liefen der native Lauf zu R-028, ein Verarbeitungslauf in der App und `npm run test:docs`, dazu weiter der hängengebliebene Python-Prozess. |
| Rust / Clippy, Endstand | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract`, Rust-Quellen von `b71439b2` | Windows x64 | je `PASS`, 0 | 333 bestanden, 0 fehlgeschlagen, 3 ignoriert (sieben neue Tests). Nur das Windows-Ziel. |
| Mutationsprobe R-028 | Scratch-Skript: acht gezielte Verfälschungen von `private_namespace.rs` und `main.rs`, je `cargo test --locked <Filter>`, danach Dateien zurückgesetzt und verglichen | Windows x64 | alle acht erkannt | Kein Bestandteil des Repositorys. Nicht erfasst: die Zahl der Wiederholungen um eins, und ob die vier Aufrufstellen in `spawn_sidecar` einzeln zurückgedreht werden (dafür der Quelltextvertrag). |
| Gezielt, Endstand | `tests/test-native-smoke-integrity.js` (81), `tests/test-standalone-desktop-contract.js` (40), `tests/test-standalone-workspace.js` (518), `tests/test-standalone-frontend.js` (52) | Windows x64 | je `PASS`, 0 | Neu oder erweitert: vier Fälle zur Startprobe und zum Messskript, ein Quelltextvertrag der Shell, drei Fälle der Oberfläche. |
| Gegenprüfung R-028 bis R-030 | zwei unabhängige Read-only-Läufe (Datenschutz- und Laufzeit-Prüfer) auf dem Arbeitsstand vor den Commits, mit eigenen Skripten und einzelnen Node-Tests | Windows x64 | keine Aufweichung der Schutzgrenze, nichts durchgelassen; neun Einwände | Beide am Schrittlimit beendet, Berichte auf Nachfrage. Einwände und ihr Ergebnis in BEFUNDE.md. Die danach eingearbeiteten Änderungen sind nicht erneut gegengeprüft. |
| Dokumentation, Endstand | `npm run test:docs`, `node tests/test-current-document-links.js`, `node tests/test-current-documentation-contract.js` auf `0b99529c` | Windows x64 | je `PASS`, 0 | — |
| Konverter, Endstand | `npm run test:standalone:conversion` auf `0b99529c` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; hinterlässt Ordner `.tmp-standalone-package-*` im Repository-Root, von mir entfernt |
| Windows x64 Paket, Endstand | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs` auf `b71439b2`; `node tests/test-standalone-package-smoke.mjs` auf `0b99529c` gegen dasselbe Paket | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `cec20d6e528dec4e039f8dac058b036a2e5fa5e1c574ad363e4b94d8d38b2346`, 113 627 095 Bytes, 1 203 Einträge, Build `b4466f2a`. Das Paket des Vorstands (`b30c5511…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start, alte Probe | instrumentierte Kopie von `tests/manual/standalone-native-windows-launch.ps1` am Stand `e92d5b12`, `-Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence`, 11 Läufe gegen das Paket `b30c5511…` | Windows x64 | 8 `FAIL` (`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`), 3 `PASS` | In allen acht Fällen dieselben Merkmale: WebView2-Netzwerkdienst, gültige Microsoft-Signatur, `own_profile: false` wegen `…\webview\main\EBWebView` (R-029). Die Kopie liegt außerhalb des Repositorys. |
| Windows x64 Start, Endstand | dieselbe Probe am Stand `0b99529c`, 14 Läufe gegen das Paket `cec20d6e…`; davor 12 Läufe einer Vorfassung gegen `b30c5511…` | Windows x64 | 14 von 14 `PASS`, 0; Vorfassung 12 von 12 | Kein TCP-Listener (er hätte die Probe abgebrochen); in 4 der 14 Läufe ein zugeordneter UDP-Endpunkt (`["msedgewebview2.exe"]`), sonst keiner. Abbau-Wartezeit 138 bis 273 ms von 20 000 ms. |
| Windows x64 Messung | `tests/manual/measure-standalone-native-windows.ps1 -Archive … -ExpectedSha256 cec20d6e… -Iterations 10 -AssertNoListeners` am Stand `0b99529c` | Windows x64 | `PASS`, 0; am Stand `b11a6131` `FAIL` in Wiederholung 1 | p50 1 993 ms, p95 2 015 ms, 0 TCP-Listener, kein UDP-Endpunkt in dieser Serie. Der Fehlschlag davor ist der zweite Teil von R-030 (Zeile der App auf dem Fehlerkanal). Die Messung mit 30 Starts habe ich nicht ausgeführt. |
| Windows x64 Oberfläche, R-028 | eigenes Startskript nach dem Muster von `tests/manual/standalone-native-workspace-gui.ps1` mit einem Halterprozess (Löschzugriff auf einen Ordner des Testprofils), Bedienung per Windows-UI-Automation, Pakete `b30c5511…` und `cec20d6e…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Nach R-028 bis R-030“ |
| Cowork-Plugin, Endstand | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `14e3d87b` (Produktstand `0b99529c`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `5c669b7c…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderungen dieser Runde berühren das Plugin nicht (Rust-Shell, Standalone-Oberfläche, Prüfskripte). |
| `git diff --check`, Endstand | `git diff --check e92d5b12 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der dritten Übergabe | `node tests/run-product-suite.js headless` auf `283e6ed9` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 23:19–00:13. Parallel liefen zeitweise der Differenzlauf, `cargo test`, Clippy und die Zufallsläufe der fünften Gegenprüfung, dazu durchgehend ein hängengebliebener Python-Prozess aus dieser Sitzung (gestartet 18:49, vermutlich von einer früheren Gegenprüfung; belegt einen von 16 Kernen und läuft noch, weil mir das Beenden nicht erlaubt wurde). `ebe526ec` kam danach und ändert nur ein Dokument; die Dokumenttests liefen darauf erneut. |
| Headless, Stand der zweiten Übergabe | derselbe Befehl auf `ffab4fa7` | Windows x64 | `PASS`, 0 | 364 Dateien; 20:25–21:19, parallel lief der Differenzlauf |
| Headless auf `d5992265` | derselbe Befehl auf `d5992265` | Windows x64 | `PASS`, 0 | 364 Dateien. Die Suite meldete den Fehler der Zuordnung nicht, den `ffab4fa7` behebt. |
| Headless auf `a0d3e340` | derselbe Befehl | Windows x64 | abgebrochen, kein Ergebnis | Von mir nach rund elf Minuten gestoppt, als die Regressionen sichtbar wurden. Für diesen Stand gibt es keinen vollständigen Lauf. |
| Golden | `node tests/make-fixtures.js && node tests/test-pii-regression.js` auf dem Stand von `283e6ed9` | Windows x64 | `PASS`, 0 | 164 Fälle. Am Stand `a0d3e340`: 163 bestanden, 1 fehlgeschlagen. |
| Gezielt | `tests/test-privacy-inline-credentials.js` (7), `test-privacy-name-variants.js` (10), `test-privacy-time-periods.js` (1), `test-privacy-inflected-names.js` (3), `test-privacy-repeated-phones.js` (2), `test-markdown-retention.js` (15) | Windows x64 | je `PASS`, 0 | Die erste Datei enthält die Gegenfälle der vier widerlegten Fassungen von R-027. Sechs der zehn Fälle der zweiten Datei schlagen am Stand `a0d3e340` fehl, einer am Stand `d5992265`; geprüft an Kopien dieser Stände. |
| Differenzlauf | Scratch-Skript: Kern von RC178 gegen den Kern von `283e6ed9`, 18 600 synthetische Fälle (93 Satzmuster, darunter 16 mit Zugangsdaten), fünf Profile, einzeln und als Zwei-Dokument-Lauf | Windows x64 | kein neuer Stopp, 10 gewollte Abweichungen (R-024) | 420 Fälle, die RC178 stoppte, laufen durch. Zahlen in BEFUNDE.md. Kein Bestandteil des Repositorys. |
| Fünfte Gegenprüfung zu R-027 | unabhängiger Read-only-Lauf mit eigenen Skripten auf `283e6ed9`: 3 915 handgeschriebene Fälle, 66 000 Zufallsläufe, 1 050 gezielte Fälle | Windows x64 | kein zusätzlich sichtbarer Klartext, kein neuer Stopp, keine Ausnahme | Am Schrittlimit beendet, Bericht auf Nachfrage. Drei Beobachtungen und die nicht mehr geprüften Punkte in BEFUNDE.md; vier davon habe ich selbst nachgeprüft (1 500, 400 und 400 Fälle, Laufzeit). |
| Dokumentation | `npm run test:docs`, `node tests/test-current-document-links.js`, `node tests/test-current-documentation-contract.js` auf `ebe526ec` | Windows x64 | je `PASS`, 0 | — |
| Konverter | `npm run test:standalone:conversion` auf `ebe526ec` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; hinterlässt zwei `.tmp-standalone-package-*`-Ordner im Repository-Root, von mir entfernt |
| Rust / Clippy, Stand der dritten Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract` auf `283e6ed9` | Windows x64 | je `PASS`, 0 | 326 bestanden, 0 fehlgeschlagen, 3 ignoriert. Nur das Windows-Ziel. R-027 ändert keinen Rust-Code. |
| macOS-Typcheck | `cargo check --locked --all-targets --target aarch64-apple-darwin` auf `a0d3e340` | Windows x64 als Host | `BLOCKED` | 42 Abhängigkeiten geprüft; das Build-Skript des Projekts verlangt den freigegebenen statischen macOS-Core, der hier fehlt. Nicht umgangen. |
| Cowork-Plugin | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `85fdecf2` (Produktstand `ebe526ec`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `6d9bc082…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. |
| Windows x64 Paket | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `ebe526ec` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `b30c5511405bfc05fc09b2f14a04f5ff7155f3d54f281411853cc17cb5e37ffc`, 113 625 220 Bytes, 1 203 Einträge, Build `043e3b81`. Der Paketbau überschreibt nie; das Paket des Vorstands (`bddfe85a…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start, Stand der dritten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence`, sieben Versuche am 24.11. zwischen 00:24 und 00:37 | Windows x64 | Versuche 1 und 2 `FAIL` (`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`), 3 `FAIL` (Entpacken: Pfad nicht gefunden), 4 und 5 `FAIL` (`STANDALONE_NATIVE_WEBVIEW_INITIALIZATION_TIMEOUT`), 6 und 7 `PASS`, 0 | Versuche 1 und 2: R-029, ohne Parallelbetrieb; die Ursache ist seit `dbf98cbf` bekannt und behoben. Versuche 3 bis 5: In dieser Zeit hielt ein fremder Prozess den Temp-Ordner mit Löschzugriff offen; auch das Paket vom Vortag startete dann nicht (R-028). Versuche 6 und 7 nach Ende der Sperre: Start 1,9 s und 1,8 s, 9 Prozesse, 0 TCP-Listener, 0 UDP-Endpunkte. Am Vortag: `d5992265` im ersten Versuch bestanden, `ffab4fa7` im zweiten. |
| Windows x64 Oberfläche | `tests/manual/standalone-native-workspace-gui.ps1 -Archive …`, Bedienung per Windows-UI-Automation, Builds `0dac7e18`, `1803bce7` und `043e3b81` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“ |
| macOS Apple Silicon | — | — | `BLOCKED` (kein Mac) | Baseline-Beleg RC178: [Lauf 44744144419](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/44744144419), Runner `macos-15`, Commit `13ed39ff` |
| macOS Intel | — | — | `BLOCKED` (kein Mac) | derselbe Lauf, Runner `macos-15-intel` |
| iOS-Simulator | — | — | `BLOCKED` (kein Xcode) | — |
| `git diff --check` | `git diff --check 3908a921 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Baseline Dokumentation | `npm run test:docs` auf `e88f1b8d` | Windows x64 | `PASS`, 0 | — |
| Baseline Headless | `node tests/run-product-suite.js headless` auf `e88f1b8d` | Windows x64 | `PASS` in zwei Abschnitten: Dateien 1–294 von 357 im Runner, 295–357 fortgesetzt; je Exit 0 | Erster Abschnitt brach an `tests/test-standalone-native-export.js` ab, weil die vorbereitete Laufzeit fehlte. Kein Produktfehler. |
| Reproduktion vor Fix | Scratch-Skripte gegen eine Kopie des Kerns von `dfed2d4e` | Windows x64 | Befunde reproduziert | „Müllers Auto“ und die zweite Telefonnummer bleiben stehen. |
| Erste Runde | Headless auf `e1afef0f` (361 Dateien), Konverter, Rust (321 bestanden), Plugin-Gates, Paket (`42965f3d…`), Start, Oberfläche | Windows x64 | je `PASS`, 0 | Stand der ersten Übergabe |

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
keine E1/E2/E3-Abnahme. Nur erfundene Dateien.

**Erste Runde** (Build `5496fabe`, vier Dateien: TXT, DOCX, XLSX)

- **Start** – Kein Zweck vorbelegt, Start gesperrt mit „Bitte Aufgabe und
  Dateien auswählen.“. Der Dateidialog füllt nur den Katalog.
- **Nur umwandeln** – 3 Markdown-Dateien unter `DataSecure-Markdown`.
  Überschriften aus der deutschen Vorlagen-ID erkannt, „2019‑2024“ und
  „Nord‑West“ mit Strich, Datum `2023-03-15`. Keine automatische Navigation.
- **Automatisch maskieren** – 3 Dateien unter `DataSecure-Output`, daneben
  `Vertraulich` mit Dateizuordnung (CSV) und Pseudonym-Zuordnung (TXT, XLSX).
  „Hans Müllers Auto“ → „[PERSON_001] Auto“; drei Telefonvorkommen ersetzt,
  auch `0049`; „Müllerstraße“ bleibt.
- **Selbst entscheiden** – Ohne Rückfrage abgeschlossen. Die eingebettete
  Prüfung wurde deshalb nicht beobachtet.
- **Neu gefunden** – R-024 (Überredaktion eines Zeitraums als Ort) und R-025
  (Zähltexte ohne Einzahl).

**Stand der zweiten Übergabe** (Build `1803bce7` aus `ffab4fa7`, fünf Dateien: ein Lebenslauf
mit zwei Links, die den Namen enthalten; eine Teilnehmerliste mit zwei
Personen gleichen Nachnamens; eine Notiz mit allen neuen Schreibweisen; ein
Word-Dokument mit eingefügten Symbolen; eine CSV mit Vorspann)

- **Start** – wie oben; Fußzeile „Version 3.2.0-rc178 · Build 1803bce7“.
- **Automatisch maskieren, fünf Dateien** – „Anonymisierungslauf
  abgeschlossen mit Hinweisen. 5 technisch geprüfte anonymisierte Ergebnisse
  verfügbar.“
  - Lebenslauf: läuft durch. Beide Links als `[URL_REDACTED]`,
    „Unterschrift: [PERSON_001], [PERSON_001]“, „Im Zeitraum 2019-2024“
    bleibt stehen. Am Kern von RC178 stoppt dieselbe Datei mit
    `RESIDUAL_PII` (R-026; am Kern geprüft, nicht mit dem RC178-Paket).
  - Teilnehmerliste: „Anwesend: [PERSON_003], [PERSON_002]. Entschuldigt:
    [PERSON_002], [PERSON_003].“ Kein Vorname bleibt stehen. „Mo. bis Fr.“
    bleibt; der Nachname allein wird bei zwei gleichnamigen Personen zu
    `[PERSON_UNKLAR_001]`.
  - Notiz: „Hr. Müller“, „Müller, Hans“, `hans_mueller`, `hans.mueller` und
    der Name in zwei Links werden zu `[PERSON_002]`; im Link bleibt der Rest
    der Adresse (`https://example.org/team/[PERSON_002]`). „Müllerstraße“
    bleibt.
  - Word-Dokument: „Winkel α bis β, erledigt [Symbol].“
  - CSV: eine Spalte, mit Inhaltshinweis statt „vollständig“.
- **Vertrauliche Zuordnung** – Im Build des vorletzten Stands (`0dac7e18`)
  fehlte „Hans Müller“ in der Pseudonym-Zuordnung der Notiz; alle sieben
  Vorkommen galten als mehrdeutig. Im Endstand steht dort „[PERSON_002] ·
  PERSON · 7 Vorkommen → Hans Müller / Hr. Müller / Müller, Hans /
  hans-mueller / hans.mueller / hans_mueller“.
- **Nur umwandeln, zwei Dateien** – 2 Markdown-Dateien unter
  `DataSecure-Markdown`, „Lauf abgeschlossen mit Hinweisen“. Die CSV
  erscheint einspaltig; Leerzeichen der ersten Zeile stehen dort als
  `&#32;` (bestehende wörtliche Darstellung, im Rohtext schwer lesbar).
- **Einzahl** – Ein Lauf mit einer Datei: „1 Datei wird lokal verarbeitet.“,
  „1 technisch geprüftes anonymisiertes Ergebnis verfügbar.“, im Verlauf
  „1 Datei · 1 Ergebnis“.
- **Verlauf** – „Die letzten 5 Verarbeitungen · neueste zuerst“, drei Läufe
  mit eigener Kennung und eigenen Laufdetails. Keine automatische Navigation.
- **Originale** – SHA-256 und Änderungszeit der fünf Eingaben nach allen
  Läufen unverändert.
- **Diagnose** – zwei Dateien im Diagnoseordner; Suche nach Namen,
  Dateinamen und Ordnernamen ohne Treffer.
- **Beenden** – Fenster normal geschlossen; fünf Sekunden später kein
  Prozess aus dem Paketordner. Im Leerlauf geprüft, nicht während eines
  Stapels.
- **Nicht beobachtet** – „Selbst entscheiden“ und die eingebettete Prüfung,
  PDF, Scan und Bild, ein Exportfehler (das neue Diagnoseereignis trat nicht
  auf), Abbruch während eines Laufs, mehr als ein Fenster.

**Nach R-027** (Build `043e3b81` aus `ebe526ec`, 24.11.2026 ab 00:37; sechs
Dateien im automatischen Lauf: die fünf von oben und eine Textdatei mit
erfundenen Zugangsdaten; danach eine Textdatei im geführten Lauf)

- **Start** – Fußzeile „Version 3.2.0-rc178 · Build 043e3b81“; Start gesperrt,
  bis Aufgabe und Dateien gewählt sind. Vorher zwei Startversuche mit
  Fehlermeldung statt Arbeitsfläche (R-028).
- **Automatisch maskieren, sechs Dateien** – „Anonymisierungslauf
  abgeschlossen mit Hinweisen. 6 technisch geprüfte anonymisierte Ergebnisse
  verfügbar.“
  - Datei mit Zugangsdaten: `WLAN-Passwort: [CREDENTIAL_REDACTED]`, `Zugang
    Portal: Benutzer sepp, Passwort: [CREDENTIAL_REDACTED] und PIN:
    [CREDENTIAL_REDACTED]`, das Feld am Zeilenanfang wie bisher. Derselbe
    Text durch den RC178-Kern lässt die drei Werte stehen (am Kern geprüft,
    nicht mit dem RC178-Paket).
  - Grenzen im selben Dokument, wie dokumentiert: „Hinweis zum Token: läuft
    morgen ab.“ verliert „läuft“; die Adresse `…/login?token=abc123def`
    bleibt stehen; „Benutzer sepp“ ohne Doppelpunkt bleibt stehen.
  - Eine Textdatei ist kein Markdown: Die Zeilen `| VPN | Token: … |` und
    `# Token: Aufbau und Validierung` kommen maskiert als gewöhnlicher Text
    an. Der Wert in der Tabellenzeile wird dadurch ersetzt (in RC178 blieb er
    stehen), die Überschrift verliert „Aufbau“.
  - Die Überschrift „Übergabe Arbeitsplatz“ wird als Person ersetzt und
    steht so in der vertraulichen Zuordnung; in RC178 gleich.
  - Die fünf übrigen Dateien haben dieselben Ergebnisse wie im Lauf davor;
    die Zuordnung nennt „Hans Müller“ mit sieben Vorkommen.
- **Selbst entscheiden, eine Datei** – erstmals mit Rückfrage: „Prüfung
  erforderlich. 1 Datei benötigt eine lokale Entscheidung.“
  - „Jetzt prüfen“ öffnet die eingebettete Prüfung mit einer Fundstelle (die
    Überschrift „Notiz zur Übergabe“ als mögliche Person), Quellkontext und
    vorgesehener Ausgabe. In der vorgesehenen Ausgabe sind die Zugangsdaten
    schon ersetzt.
  - Zeile angehakt, „Beibehalten“ gewählt, angewendet, „1 Entscheidung
    speichern und fortfahren“: „Fundstellenprüfung abgeschlossen“, danach
    „Anonymisierungslauf abgeschlossen. 1 technisch geprüftes anonymisiertes
    Ergebnis verfügbar.“
  - Ergebnis: Überschrift erhalten, `[PERSON_001] sagte zu.`, `Anna Schmidt,
    Passwort: [CREDENTIAL_REDACTED]`, `Der Admin PIN: [CREDENTIAL_REDACTED]
    gilt.`, `Kontakt: [FIELD_REDACTED]`.
  - „Anna Schmidt“ bleibt stehen, und die App fragt nicht danach: Das Profil
    Allgemein erkennt einen Namen ohne Personenkontext nicht (dokumentierte
    Grenze, in RC178 gleich).
  - Zähltexte der Prüfung ohne Einzahl, zum Beispiel „1 Zeilen vorgemerkt“
    (R-025, Rest).
  - Damit ist eine von Hand getroffene Entscheidung auf einem Text mit
    ersetzten Zugangsdaten einmal durchgelaufen. Nur „Beibehalten“ bei einer
    Fundstelle; „Ersetzen“, „Später entscheiden“ und mehrere Fundstellen
    habe ich nicht bedient.
- **Verlauf** – zwei Läufe, neueste zuerst, je mit eigener Kennung.
- **Originale** – SHA-256 und Änderungszeit der sechs Eingaben des
  automatischen Laufs danach unverändert.
- **Diagnose und Protokolle** – 59 Diagnose- und 7 Audit-Dateien sowie die
  beiden Sitzungsprotokolle ohne Treffer für Namen, Passwörter, Datei- und
  Ordnernamen. Die Passwörter stehen erwartungsgemäß in den privaten
  Arbeitskopien der App, nicht im Ergebnisordner (dort nur die Adresse mit
  `token=`).
- **Beenden** – Fenster normal geschlossen; fünf Sekunden später kein Prozess
  aus dem Paketordner.
- **Nicht beobachtet** – PDF, Scan und Bild, ein Exportfehler, Abbruch
  während eines Laufs, mehr als ein Fenster, der Hinweis aus R-008.

**Nach R-028 bis R-030** (Build `b4466f2a` aus `b71439b2`, Paket
`cec20d6e…`, 24.11.2026 zwischen 09:27 und 09:38; Vergleich mit dem Paket
`b30c5511…` des Vorstands)

- **Sperre nachgestellt** – Ein eigener Hilfsprozess öffnet einen Ordner des
  Testprofils mit Löschzugriff und voller Freigabe und hält ihn, bis eine
  Freigabedatei erscheint. Der echte Temp-Ordner und echte Profilordner
  wurden nicht gehalten.
- **Vorstand, Ordner über dem Datenordner gehalten** – Meldung wie am 24.11.
  beobachtet: „Der interne App-Datenordner konnte nicht sicher geöffnet oder
  neu angelegt werden … Installation mit der IT prüfen
  (STANDALONE_DATA_ROOT_UNSAFE)“. Nach Freigabe und **Verbindung und
  Laufstatus prüfen**: „Lokale Verbindung wiederhergestellt“.
- **Endstand, Ordner über dem Datenordner gehalten** – „Ein anderes Programm
  hält gerade den internen App-Datenordner oder einen Ordner darüber
  geöffnet … Das ist meist vorübergehend: bitte kurz warten und dann
  ‚Verbindung und Laufstatus prüfen‘ wählen … (STANDALONE_DATA_ROOT_BUSY)“;
  darunter der Statustext mit „ein Neustart der App ist dafür nicht nötig“.
  Dateiauswahl gesperrt, Datenordner nicht angelegt.
- **20 erneute Prüfungen bei gehaltenem Ordner** – jedes Mal dieselbe
  Meldung, keine Erschöpfung der Startversuche, nichts angelegt. Die
  Diagnose zählt 21-mal `STANDALONE_DATA_ROOT_BUSY`, ohne Pfad und ohne
  Betriebssystemtext.
- **Freigabe, dann eine Prüfung** – „Lokale Verbindung wiederhergestellt“;
  Datenordner und Arbeitsbereich angelegt.
- **Vorhandener Datenordner selbst gehalten** (zweiter Start im selben
  Profil) – dieselbe Meldung; nach Freigabe und Prüfung wiederhergestellt.
- **Sperre von rund einer Sekunde** – die App startet ohne Meldung.
- **Ohne Sperre, automatische Maskierung einer erfundenen Datei** –
  „Anonymisierungslauf abgeschlossen. 1 technisch geprüftes anonymisiertes
  Ergebnis verfügbar.“ Ergebnis, Dateizuordnung und Pseudonym-Zuordnung
  liegen im Ergebnisordner, das Original ist unverändert, die Diagnose
  enthält weder Dateinamen noch Passwörter noch Pfade.
- **Geklärt, kein Befund** – Im ersten Durchgang der 20 Prüfungen hat sich
  das Fenster nach der elften geordnet beendet (`sidecar_shutdown ready`).
  Der Anwender hat bestätigt, dass er es selbst geschlossen hat. Die
  Wiederholung lief ohne Beenden durch.
- **Startprobe und Messung** – 14 von 14 Läufen der korrigierten Probe
  bestehen, 4 davon mit einem zugeordneten WebView2-Endpunkt; Abbau-Wartezeit
  138 bis 273 ms. Messung über zehn Starts: p50 1 993 ms, p95 2 015 ms,
  0 TCP-Listener, kein UDP-Endpunkt in dieser Serie. Die unkorrigierte Probe
  scheiterte zuvor in 8 von 11 Läufen gegen das Paket des Vorstands.
- **Nicht beobachtet** – eine Belegung durch ein echtes Sicherungs- oder
  Schutzprogramm; eine Belegung während eines laufenden Stapels oder einer
  Ergebnisbereitstellung; mehr als ein Fenster; „Selbst entscheiden“ in
  diesem Paket.

## Urteil je Prüfdimension

Zahlen aus ABDECKUNG.tsv am Stand `0b99529c`, nur Einzeleinheiten. Das
Register zählte in der ersten Runde Produktivcode hinter einem
`#[cfg(test)]` irrtümlich als Rust-Testmodul und damit als offen. Die
Erkennung ist korrigiert; dadurch gelten rund 460 Rust-Einheiten jetzt als
teilgeprüft, weil ihre Datei im Rust-Review vollständig gelesen wurde. Das
ist eine Korrektur der Zählung, keine zusätzliche Prüfung.

| Dimension | Urteil | Befunde | Abdeckung (geprüft / teilgeprüft / offen) und Grenze |
| --- | --- | --- | --- |
| Fachlichkeit und Formatqualität | Text und CSV solide; die belegten stillen Verluste in DOCX, XLSX und CSV sind behoben oder als Hinweis sichtbar, bis auf den Zustand alter Formular-Kontrollkästchen. Listen bleiben Tabellen. Ein Lebenslauf mit Namenslink ist jetzt automatisch verarbeitbar. | R-003 bis R-006, R-018, R-026 | 5 / 277 / 603. PDF, Scan-PDF, Bild-OCR und Office-OCR im Review nicht ausgeführt; Diagramme, SmartArt, Formeln nur über die Suite. |
| Anonymisierung und Zuordnungen | Mehrere Leckmuster und eine Überredaktion behoben; zwei eigene Lecks der zweiten Runde vor der Übergabe gefunden und behoben. Gegenüber RC178 zeigt der Differenzlauf am Endstand keine Verschlechterung außer den zehn gewollten Fällen von R-024. Zugangsdaten mitten in der Zeile werden für ein Wort ersetzt (R-027, Teil). Offen: die dokumentierten Grenzen von R-027 und der Namenserkennung. Zuordnungen und CSV-/XLSX-Escaping ohne Befund. | R-001, R-002, R-017, R-024, R-026, R-027 | 11 / 235 / 455. Eine geführte Entscheidung nativ ausgeführt, sonst keine; `privacy/entities.js`, `credentials.js`, `person-ambiguities.js` nicht gelesen. |
| Oberfläche, UX und Accessibility | Ablauf entspricht DS-086; kein kritischer Befund. Texte und Rollen nachgebessert. Die eingebettete Prüfung ist einmal nativ durchlaufen; ihre Zähltexte haben keine Einzahl. | R-008, R-009, R-020, R-025 | 0 / 235 / 46. Quelltext plus Windows-Läufe; kein Screenreader, kein Zoom, kein WKWebView. |
| Architektur und Plattform | Grenzen Oberfläche → Rust → Core → Worker nachvollzogen; Produkttrennung in der Projektion wirksam. Fünf Befunde der Rust-Shell behoben oder eingegrenzt, zuletzt die Startverweigerung bei belegter Ordnerkette. | R-011 bis R-014, R-022, R-028 | 15 / 753 / 538. Rust-Tests nur für Windows; macOS-Zweige siehe Mac-Status. |
| Implementierung und Wartbarkeit | `main.rs` (rund 4 400 Zeilen), `ooxml.js` (226 KB) und `privacy/engine.js` sind zu groß für sichere Einzeländerungen; im Datenschutzkern überlagern sich Regeln über Ränge, sodass eine neue Regel an entfernten Stellen wirkt. Dreifache NtCreateFile-Hüllen; toter Code (`adaptive-resource-policy.js`, zwei ungenutzte Commands). Die zweite Runde hat `main.rs` um rund 280 Zeilen vergrößert. | — (Verbesserungen, nicht als Befund geführt) | 1 / 205 / 675. Kein systematischer Durchgang. |
| Datenschutz und Sicherheitsgrenzen | Export überschreibt nie, Pfade handle-relativ, Diagnose mit geschlossenem Vokabular, keine Listener. Das neue Diagnoseereignis trägt nur Fehlerklasse und Systemcode. | R-010, R-012 | 0 / 13 / 175. JS-Diagnose, Ergebnisexport und Prüfspeicher nicht gelesen. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Serielle Veröffentlichung belegt, zweispurige Vorbereitung belegt. Verwaiste Vorbereitungen werden bereinigt; eine laufende Veröffentlichung schützt allein ihr Alter. | R-007, R-010, R-022 (Hypothese) | 0 / 157 / 450. Wiederaufnahme, Absturzpfade, voller Datenträger nicht untersucht. |
| Leistung und Ressourcen | Nur ein Vorher-nachher-Vergleich des Datenschutzkerns: 109 KB Prosa 0,86 s zu 0,89 s, 328 KB 5,9 s zu 5,7 s. Der Kern skaliert schon in RC178 überlinear. | — | Dazu Startzeit und Suite-Laufzeiten. BL-047.5 bleibt ohne Zielhostmessung. |
| Tests und Orakel | Breite Suite mit realen Aufrufpfaden, aber teuer und mit blinden Flecken. Für den Datenschutzkern fehlt ein Vergleichsorakel: die Regressionen der zweiten Runde zeigte erst der Differenzlauf gegen den alten Kern. Die Windows-Startprobe konnte einen WebView2-Endpunkt nicht zuordnen, ihr Abbau wartete auf keinen Prozess, und ihr Messskript lief auf diesem Host nicht durch, ohne dass ein Test es zeigte; behoben. | R-019, R-029, R-030 | Gruppe `TEILGEPRÜFT`; Bewertung im nächsten Abschnitt. |
| Abhängigkeiten, CI und Lieferkette | Locks, Pins und Rechte sauber; paketierte JavaScript-Abhängigkeiten lokal ohne bekannten Befund. Nachweis für Windows und Schutz von Tag und Release fehlen. | R-015, R-016, R-023 | 0 / 73 / 219. Paketinhalte der Release-Assets nicht geprüft; kein `cargo audit`. |
| Dokumentation und Nachvollziehbarkeit | Mehrere Drifts korrigiert, darunter Testvoraussetzungen, Formatverhalten und Release-Herkunft. | R-007, R-015, R-016, R-021 | Gruppe `TEILGEPRÜFT`. BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche. |

## Bewertung der Testsuite

Auf Nachfrage des Anwenders. Zahlen per Mustersuche, also Größenordnungen.
Umfang und Laufzeit wurden am Stand der ersten Runde (`e1afef0f`, 361
Dateien) erhoben; die zweite Runde ergänzt drei Dateien auf 364, R-027 eine
weitere auf 365.

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
  - Von meinen eigenen Fehlern der zweiten Runde hätte sie einen gemeldet
    (ein Fall der Golden-Regression). Die beiden Lecks, die neuen Stopps und
    die fehlende Person in der Zuordnung meldet sie nicht: Sie bestand am
    Stand `d5992265` vollständig, obwohl die Zuordnung dort fehlerhaft war.
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
  zweiten Runde den Quelltextvertrag an die geladenen Dateien. Dazu kommt
  aus der dritten Prüfung ein fünfter Punkt: ein Vergleichslauf des
  Datenschutzkerns gegen den jeweils letzten freigegebenen Kern über ein
  festes Korpus gehört in die Suite. Mein Skript dafür liegt nicht im
  Repository; als Vorlage beschreibt BEFUNDE.md Aufbau und Zählweise.

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
Claude-Code-Review für DataSecure RC178, zweite Runde mit dritter Prüfung, R-027 und R-028 bis R-030, abgeschlossen.
Branch: https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review
Einstiegscommit: e88f1b8d100421017fb3909d77e338fd25c1b421
Geprüfter Produktstand: 0b99529cff549a02947898ad54d08620451a268f (Produktcode zuletzt in b71439b2; spätere Commits nur tasks/rc178-claude-review/)
Veröffentlichter Remote-HEAD mit Bericht: siehe Nachricht des Anwenders
Ergebnisbericht: tasks/rc178-claude-review/ERGEBNIS.md am Remote-HEAD
Für Codex zuerst prüfen:
1. R-027, Commit 283e6ed9: privacy/base.js (CREDENTIAL_INLINE_FIELD_RE), privacy/structured.js
   (findInlineCredentialSpans, getrennt von findStructuredSpans) und gateway/privacy-text-operation.js
   (prepareTextPrivacyReview: Ersetzung nach dem Kern, nur wenn die Prüfung danach dieselben offenen
   Entscheidungen ergibt). Vier frühere Fassungen haben Namen freigegeben oder Dokumente gestoppt;
   die Gegenfälle stehen in tests/test-privacy-inline-credentials.js. Bewusst eng: ein Wort je Label.
2. privacy/engine.js, Commits cfee417a bis ffab4fa7 als Ganzes, nicht einzeln: Die Zwischenstände
   bis a0d3e340 enthalten zwei Lecks (Aufzählung voller Namen, E-Mail-Adresse mit Namen in der Domain).
   Endstand: linkIdentityHits, asciiNameSpellings, matchOnly, forwardFullNames und die Link-Schleife
   der drei strengen Profile. Neu bekannt: „Meier, Anna Schmidt“ bei bekannter Anna Meier wird als
   umgestellter Name gelesen. Ein eigener Vergleich RC178-Kern gegen diesen Kern mit fremdem Korpus
   wäre der beste Gegenbeleg.
3. Rust-Shell (5f8bf47b bis 22688d75, d5992265): nur für Windows übersetzt und getestet. Auf einem
   Mac-Runner zuerst cargo test und clippy; 8c0dd30b und b30a6dbc übersetzen für sich nicht.
4. R-028, Commit b71439b2: private_namespace.rs (is_contention, open_waiting) und main.rs
   (namespace_bootstrap_code, release_unspawned_generation). Die Freigabe der Ordnerkette ist
   unverändert; neu sind die Ursache STANDALONE_DATA_ROOT_BUSY, ein Warten von höchstens rund zwei
   Sekunden vor dem Anlegen und dass ein solcher Versuch nicht gegen die 16 Startversuche zählt.
   Zu prüfen: ob ein Rückgeben der Generation an anderer Stelle der Wiederanlauf-Logik stört, und
   der Mac-Build (der Code ist cfg(windows), übersetzt wurde nur Windows).
5. R-029 und R-030, Commits dbf98cbf, b11a6131, 0b99529c: Die Startprobe verglich den WebView2-
   Profilordner ohne den Unterordner EBWebView; ihr Abbau hat deshalb nie auf WebView2 gewartet und
   tut es jetzt. Im Release-Workflow und in scripts/run-pkg-04.ps1 läuft das zum ersten Mal wirklich.
   Der WebView2-Netzwerkdienst hält beim Start gelegentlich kurz einen UDP-Endpunkt; ob ein Paket
   gesendet wird, ist nicht gemessen.
Offen oder blockiert: macOS arm64/x64 und iOS-Simulator (keine Geräte); R-006 (Listen als Tabellen),
R-015, R-022; R-028 bei langer Belegung; Grenzen von R-027 (mehrwortige Geheimnisse, Labels in
Überschriften, Tabellen und Links); geführte Prüfung nur einmal nativ bedient; rund 62 % der
Einheiten im Register offen.
```
