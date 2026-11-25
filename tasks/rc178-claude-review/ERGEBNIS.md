# RC178-Review · Ergebnis und Übergabe an Codex

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Stand 25.11.2026, nach der zweiten Runde, einer dritten Prüfung, der
Bearbeitung von R-027, der Behebung von R-028 bis R-031, einer Nacharbeit
und der Umsetzung von R-032. Befunde
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
`dbf98cbf` bis `0b99529c`. Eine anschließende Messung hat gezeigt, dass die
eingebettete WebView2-Komponente regelmäßig Verbindungen zu Microsoft
aufbaut (R-031); auf Auftrag behoben in `1c3f36af` und `56d7c744`. Zwei
weitere Commits tragen die neue Prüfung in den Release-Workflow ein
(`e881cc9c`, `0f35696e`). Dieser Stand wurde als `a1e4bc9b` übergeben. Danach
hat der Anwender beauftragt, mit den offenen Punkten weiterzumachen, die sich
hier erledigen lassen: zehn Commits von `cebc39a0` bis `e66bab8f` (Zähltexte
der Oberfläche, Härtung der Startprobe, Testbindungen, zwei Sätze im
Sicherheitsmodell). Drei Gegenprüfungen liefen dazwischen; die zweite und
die dritte haben in meiner eigenen Korrektur der Zähltexte einen Fehler
und übersehene Stellen gefunden. Ein nativer Lauf hat einen neuen Befund
ergeben (R-032): Schließen des Fensters beendete einen laufenden Stapel
nicht. Dieser Stand wurde als `aa102cb5` übergeben. Am 25.11. hat der
Anwender dazu drei Fachsichten einholen lassen und danach entschieden:
Schließen pausiert den Lauf, mit Rückfrage. Das sind die Commits `5f670a20`
und `2ce74b9f`. Dieser Bericht beschreibt den Endstand `2ce74b9f`.

## Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | [`claude/rc178-standalone-review`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review) |
| Eingefrorener Einstieg | `e88f1b8d100421017fb3909d77e338fd25c1b421` (`origin/codex/rc178-claude-review-handoff`) |
| RC178-Produktbaseline | `v3.2.0-rc178` → `13ed39ff979a5f5d9bb076d35021164de380b9dd`, Fingerprint `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` (nachgerechnet, 400 Quellinputs) |
| Geprüfter Produktstand | `2ce74b9ff0798a3a3b6164b1fe30af142a1d6971`. Produktcode zuletzt geändert in diesem Commit (Rückfrage beim Schließen: Hülle in `5f670a20`, Oberfläche in beiden), Fingerprint `ebc54e3c073326003aab3ab961973d4bbb46db9164e07bf58668f1b53bebe52c`. Alle späteren Commits ändern nur `tasks/rc178-claude-review/`. Stand der sechsten Übergabe: `e66bab8f`, Fingerprint `bac4432a…`; der fünften: `0f35696e`, Fingerprint `9fe7076e…`; der vierten: `0b99529c`, Fingerprint `b4466f2a…`; der dritten: `ebe526ec`, Fingerprint `043e3b81…`; der zweiten: `ffab4fa7`, Fingerprint `1803bce7…`; der ersten: `e1afef0f`, Fingerprint `5496fabe…`. |
| Prüfumgebung | Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code; Windows 11 Pro 10.0.26300 x64; Node 22.23.2 für alle Tests (Host-Node 24.18.0), npm 11.16.0, cargo/rustc 1.98.1, MSVC mit SDK 10.0.26100.0, WebView2 158.0.4370.33, Claude CLI 2.1.280 |
| Verfügbare Zielplattformen | Nur Windows x64. Kein Mac, kein Xcode, kein iOS-Simulator. |
| Abdeckung | 5 165 erfasste Einheiten in 347 Dateien: 50 `GEPRÜFT`, 1 949 `TEILGEPRÜFT`, 3 166 `OFFEN`; dazu 14 Dateigruppen (6 `TEILGEPRÜFT`, 2 `OFFEN`, 6 `AUSGENOMMEN`). Zahlen je Prüfdimension unten. |

Die Versionskennung `3.2.0-rc178` wurde nicht geändert. Der Stand ist kein
Release; ein daraus gebautes Paket trägt dieselbe Versionsnummer wie RC178,
aber den Build-Fingerprint `ebc54e3c…`.

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
   - Die eingebettete WebView2-Komponente baute regelmäßig Verbindungen zu
     Microsoft auf, entgegen der Beschreibung „kein Internet, kein
     Auto-Updater“. Gemessen, dann auf Auftrag abgestellt: Die App startet
     WebView2 jetzt ohne Hintergrundverkehr, und die Startprobe prüft auf
     ausgehende Verbindungen (R-031).
   - Nacharbeit am 24.11.: Die Oberfläche schrieb an vielen Stellen „1
     Dateien“, „1 Ergebnisse“, „1 Werte“. Jeder Zähltext der geladenen
     Oberfläche, den drei Gegenprüfungen und ein Wächtertest gefunden
     haben, hat jetzt seine Einzahl (R-025).
   - Die Kontrolle der Außenverbindungsprüfung hat den Weg nicht geprüft,
     über den die Beobachtung läuft. In der Gegenprüfung gefunden und
     behoben; sieben von neun gezielten Verfälschungen werden abgelehnt,
     die beiden übrigen ändern kein Prüfergebnis.
   - Am 25.11., auf Entscheidung des Anwenders: Wer das Fenster schließt,
     während ein Lauf arbeitet, wird gefragt. **Pausieren und schließen**
     stellt die laufende Datei fertig, pausiert den Lauf und schließt dann
     die App; der Lauf steht im Verlauf zum Fortsetzen bereit. Vorher lief
     die Verarbeitung nach dem Schließen ohne Fenster weiter (R-032).
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
   - In der Nacharbeit hat meine Korrektur der Zähltexte (`8c452ac4`)
     selbst einen Fehler erzeugt („0 von 1 Datei sind …“) und rund fünfzehn
     Texte übersehen, obwohl ihre Nachricht „jeden Zähltext“ nennt. Mein
     Wächtertest hat beides nicht gezeigt; gefunden hat es die zweite
     Gegenprüfung. Nach der Korrektur (`1126dc36`) fand die dritte noch
     zwei Stellen, eine davon bei jedem Lauf mit einer Datei sichtbar
     (`e66bab8f`). Alles vor dem Push.
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
   - **R-032, behoben mit Grenzen:** Die Rückfrage gilt für das Schließen
     des Fensters. Ohne Rückfrage bleibt es beim Beenden durch das
     Betriebssystem (Abmelden, Herunterfahren, **Beenden** im App-Menü
     unter macOS), bei einem Absturz, wenn die Oberfläche binnen zwei
     Sekunden nicht antwortet, und bei Arbeit, die die Oberfläche nicht
     als arbeitenden Lauf kennt. Die Pause wirkt an der Dateigrenze; bei
     einer großen Datei mit OCR kann das Fenster Minuten offen bleiben,
     der Ausweg ist eine zweite Schließanfrage mit **Jetzt schließen**.
     Nach dem Pausieren bleiben die Arbeitskopien der offenen Dateien bis
     zum Fortsetzen oder zum Ende der Aufbewahrung liegen. Nur unter
     Windows nativ bedient; die Rückfragen „nicht pausierbar“ und „Stand
     nicht bekannt“ sind nur im Test ausgelöst.
   - Die erste Fassung der Rückfrage hatte Fehler, die erst zwei
     Gegenprüfungen gezeigt haben, darunter gesperrte Antwortknöpfe bei
     laufendem Befehl und stilles Schließen direkt nach **Verarbeitung
     fortsetzen**. Behoben vor dem Push; der letzte Commit ist nicht
     erneut gegengeprüft.
   - **R-031, behoben für das beobachtete Verhalten:** Bis einschließlich
     des vierten Übergabestands, also auch in RC178, baute die eingebettete
     WebView2-Komponente Verbindungen zu Microsoft auf: beim Start zum
     Konfigurationsdienst von Edge, danach alle 20 bis 40 Sekunden zum
     Komponenten-Updater, dazu eine automatische Proxy-Suche. Shell und Core
     hatten keine Verbindung; Dokumentinhalte habe ich im Verkehr nicht
     gefunden, die Anfragekörper sind nicht geprüft. Jetzt startet die App
     WebView2 mit Schaltern, die das abstellen; in zehn Minuten Beobachtung
     gab es keinen Endpunkt mehr. Die Schalter sind keine zugesicherte
     Schnittstelle von WebView2: Eine neue Laufzeitversion kann ihre Wirkung
     ändern, und eine Umgebungsvariable des Hosts wird angehängt. Die
     Startprobe prüft deshalb jetzt auf ausgehende Verbindungen; der
     Release-Workflow und seit `cebc39a0` auch `scripts/run-pkg-04.ps1`
     rufen sie so auf. Ausgeführt habe ich beide nicht; lokal besteht die
     Probe mit genau den Schaltern des Workflows.
   - R-028 ist kein Schutz vor einer langen Belegung: Hält ein Programm
     einen Ordner der Kette länger als rund zwei Sekunden, startet der Core
     weiterhin nicht, bis der Anwender nach der Freigabe erneut prüft. Wer
     den Temp-Ordner am 24.11. sieben Minuten lang hielt, ist unbekannt; ob
     das auf Zielhosts für `AppData\Local` vorkommt, ist nicht belegt.
   - Der UDP-Endpunkt, den R-029 sichtbar gemacht hat, gehörte zu
     DNS-Anfragen und einer Erreichbarkeitsprüfung des
     WebView2-Netzwerkdienstes (R-031). Am Endstand tritt er in der
     Beobachtung nicht mehr auf.
   - Der Abbau der Startprobe wartet jetzt erstmals wirklich auf WebView2
     (hier 0,1 bis 0,3 s von 20 s). Im Release-Workflow und in
     `scripts/run-pkg-04.ps1` ist das nicht ausgeführt worden.
   - Nur teilweise behoben sind R-004, R-011, R-012, R-013, R-017, R-019,
     R-020, R-023 und R-027. Die Gründe stehen unten und in BEFUNDE.md.
   - Zu den Zähltexten gilt: Drei Durchgänge haben jeweils weitere
     Stellen gefunden. Dass keine mehr fehlt, ist nicht belegt; der
     Wächter kennt nur eine feste Wortliste und drei Satzformen.
   - Vier Commit-Nachrichten nennen einen falschen Backlogposten:
     `907efc14` BL-050.6 statt BL-010.53; `1db8c744`, `05efbad8` und
     `7eefdcd4` BL-047.2 statt BL-010.11 und BL-010.21. Wegen der
     Projektregel gegen History-Rewrites nicht umgeschrieben; maßgeblich
     ist die Zuordnung in BEFUNDE.md. Außerdem nennt `8c452ac4` „jeden
     Zähltext“ und `1126dc36` fünf berichtigte Tests; es waren sieben.
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
   - Die Einzelprüfung jeder Funktion ist nicht erreicht: 61 % der
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

Danach, ebenfalls am 24.11. auf Auftrag (BEFUNDE.md, „R-031 · Umsetzung und
Gegenprüfung“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `1c3f36af` | R-031, A-027 | `tests/manual/standalone-native-windows-launch.ps1`: `-AssertNoOutbound` beobachtet ab dem Prozessstart die TCP-Tabellen des Betriebssystems für den Prozessbaum, mit Positivkontrolle über IPv4, IPv6 und einen Kindprozess. `tests/manual/measure-standalone-native-windows.ps1` reicht den Schalter und `-AssertReviewWindow` durch. `docs/TESTING.md`. Kein Produktcode. | `tests/test-native-smoke-integrity.js` (zwei neue Fälle, einer erweitert); Vertragsmodi mit 66 Gruppen und `-ValidateOutboundOnly`; Probe gegen neues und bisheriges Paket | Nur Windows. |
| `e881cc9c`, `0f35696e` | R-031 | `.github/workflows/release-evidence.yml`: Der Windows-Standalone-Job ruft die Startprobe zusätzlich mit `-AssertNoOutbound` auf. `tests/manual/standalone-native-windows-launch.ps1`: Die IPv6-Positivkontrolle entfällt nur auf einem Host ohne IPv6; der Evidenzsatz nennt das. Kein Produktcode. | `tests/test-runtime-release-path.mjs` hält den Schalter im Workflow fest; `tests/test-native-smoke-integrity.js`; Probe lokal mit den Schaltern des Workflows | Nur Windows. Der Workflow ist nicht ausgeführt worden. `scripts/run-pkg-04.ps1` ruft die Probe seit `cebc39a0` ebenfalls mit dem Schalter auf. |
| `56d7c744` | R-031, A-025, A-026 | `tauri-contract/tauri.conf.json` (`additionalBrowserArgs` des Hauptfensters) und `tauri-contract/src/main.rs` (`WEBVIEW2_BROWSER_ARGS` für das Prüffenster): WebView2 startet ohne Hintergrundverkehr, Komponenten-Update, Proxy, QUIC und fremde Namensauflösung. `docs/canonical/STANDALONE_SECURITY_MODEL.md` beschreibt Schalter, Rest und Grenzen. | `tests/test-standalone-desktop-contract.js` (ein Fall, hält die genaue Zeichenkette für beide Fenster fest); Rust-Tests und Clippy; zehn Minuten Messung, Probe, Bedienung | Der Wert steht in der gemeinsamen Konfiguration, wirkt aber nur unter Windows; macOS nutzt WKWebView und ist nicht gemessen. Build-Fingerprint ändert sich. |

Nacharbeit am 24.11. auf Auftrag (BEFUNDE.md, „Nacharbeit nach R-031“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `cebc39a0` | R-031 | `scripts/run-pkg-04.ps1`: Das lokale Freigabeskript ruft die Startprobe zusätzlich mit `-AssertNoOutbound` auf. Kein Produktcode. | `tests/test-standalone-package.js` hält den Schalter fest. Das Skript selbst ist nicht ausgeführt worden. | Nur Windows. |
| `907efc14`, `8c452ac4`, `1126dc36`, `e66bab8f` | R-025, A-030, A-031 | `frontend/review.js`, `workspace.js`, `document-review.js`, `workflow-presentation.js`: Jeder Zähltext entscheidet über die Einzahl oder nutzt `counted`; wo die Einzahl einen anderen Satzbau braucht, steht ein eigener Satz. Nur Texte, kein Ablauf. | `tests/test-standalone-workspace.js` (519, darunter der Wächter über die vier Dateien: 71 Stellen am Stand vor R-025), `tests/test-standalone-review-frontend.js` (74), `tests/test-workflow-presentation.js` (55), `tests/test-standalone-document-review-frontend.js` (308, darunter die Zählsätze für 0, 1 und 2); zehn Testfälle hielten falsche Formen fest und sind berichtigt; vier zurückgedrehte Korrekturen werden vom Wächter gemeldet; nativer Lauf | Nur Standalone, alle Ziele; kein WKWebView-Nachweis. Build-Fingerprint ändert sich. Die alte Oberfläche `app.js` ist unverändert. |
| `1db8c744`, `98b426dd` | R-031, A-028 | `tests/manual/standalone-native-windows-launch.ps1`: Die Positivkontrolle läuft zusätzlich über den Hintergrundthread der Beobachtung (`…_OBSERVER_WORKER_INVALID`) und verlangt, dass nach dem Stopp nichts mehr abtastet; die IPv6-Tabelle bleibt nur dort ungelesen, wo es kein IPv6 gibt und sie nicht lesbar ist. `tests/manual/measure-standalone-native-windows.ps1`: `review_window_asserted` in der Zusammenfassung. `docs/TESTING.md`. Kein Produktcode. | `tests/test-native-smoke-integrity.js` (83); sieben von neun verfälschten Kopien der Probe abgelehnt; Probe am Paket des Endstands | Nur Windows. Der Zweig für Hosts ohne IPv6 ist nicht ausgeführt. |
| `05efbad8`, `4c98d621` | R-028 | `tests/test-standalone-desktop-contract.js`: gemeinsames Wartebudget, kein Warten nach dem Anlegen, Bindung der zurückgegebenen Generation. Nur Test. | 41 Fälle | — |
| `7eefdcd4` | R-028, R-031 | `docs/canonical/STANDALONE_SECURITY_MODEL.md`: Herkunft der Aussage zum UDP-Socket; ein nach dem Anlegen gescheiterter Start hinterlässt einen leeren Datenroot. Kein Code. | `npm run test:docs` | — |

Am 25.11. auf Entscheidung des Anwenders (BEFUNDE.md, „R-032 · Umsetzung,
Gegenprüfungen und nativer Nachweis“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `5f670a20` | R-032, A-029, A-033, A-034 | `tauri-contract/src/close_prompt.rs` (neu), `main.rs` (`request_native_close`, drei Befehle), `ipc_transport.rs` (`ExitGate::begun`), `capabilities/main.json`, `permissions/commands.toml`, `gen/schemas/*`: Die Hülle reicht das Schließen des Hauptfensters an die Oberfläche weiter und schließt ohne Antwort nach zwei Sekunden wie bisher. `frontend/workspace.js`, `workspace.html`, `workspace.css`: Rückfrage, Pausieren über `pause_batch`, Schließen nach der Pause. `docs/canonical/DECISIONS.md` (Präzisierung DS-110), `PRODUCT.md`, `STANDALONE_ARCHITECTURE.md`, `STANDALONE_SECURITY_MODEL.md`, `BACKLOG.md` (BL-010.14). | fünf Rust-Tests, `tests/test-standalone-workspace.js`, `tests/test-standalone-desktop-contract.js`, `tests/test-standalone-linux-sandbox-workflow.js`; `cargo test`, Clippy | Der Rust-Code hat keine plattformabhängigen Zweige; übersetzt und bedient ist nur Windows. Beenden über das App-Menü unter macOS geht nicht über die Rückfrage. Der gemeinsame Core und Cowork sind unverändert. Build-Fingerprint ändert sich. |
| `2ce74b9f` | R-032, A-032 | `frontend/workspace.js`: Nach jedem Befehl, der Arbeit startet oder fortsetzt, gilt der Stand als unbekannt, bis ein danach begonnener Status gelesen ist; eine gesetzte Pause zählt sofort. Dokumente nachgezogen. | `tests/test-standalone-workspace.js` (534, darunter 15 Abläufe der Rückfrage); 42 Verfälschungen erkannt; nativer Lauf am Paket `721512f0…` | Nur Standalone, alle Ziele; nur unter Windows bedient. |

Nicht umgesetzt und begründet (Einzelheiten in BEFUNDE.md, „Entscheidungen je
Befund“):

- **R-032, Rest** – kein harter Abbruch der Arbeitsprozesse und kein
  Eingriff in ihren losgelösten Start: Das gehört zum gemeinsamen Core, und
  ein Abbruch führte in den Absturzpfad. Beenden durch das Betriebssystem
  bleibt deshalb ohne Rückfrage.
- **R-031, Vorgaben des Hosts** – das Produkt entfernt
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` nicht aus seiner Umgebung. Das
  wäre eine eigene Härtung und betrifft auch andere Schalter.
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
ersten Zeilen gelten dem Endstand `2ce74b9f`, die folgenden halten die
früheren Stände fest.

| Bereich | Exakter Befehl und Teststand | Umgebung und Architektur | Ergebnis und Exitcode | Beobachtung |
| --- | --- | --- | --- | --- |
| Headless, Endstand | `node tests/run-product-suite.js headless` auf `2ce74b9f` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 09:58–10:51 am 25.11. Parallel lief nichts außer dem Schreiben dieses Berichts. |
| Rust / Clippy, Endstand | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract`, Rust-Quellen von `5f670a20` | Windows x64 | je `PASS`, 0 | 338 bestanden, 0 fehlgeschlagen, 3 ignoriert (fünf neue Tests der Schließanfrage). `2ce74b9f` ändert keine Rust-Datei. Nur das Windows-Ziel. |
| Gezielt, Endstand | `tests/test-standalone-workspace.js` (534), `tests/test-standalone-desktop-contract.js` (42), `tests/test-standalone-linux-sandbox-workflow.js`, dazu die übrigen zehn Testdateien, die die Standalone-Oberfläche lesen | Windows x64 | je `PASS`, 0 | Neu: 15 Abläufe der Rückfrage beim Schließen, ein Quelltextvertrag der Hülle. |
| Verfälschungsprobe R-032 | Scratch-Skript: 42 gezielte Änderungen der Schließ-Logik in `frontend/workspace.js`, je `tests/test-standalone-workspace.js`; die Datei wird danach wiederhergestellt | Windows x64 | alle 42 erkannt | Kein Bestandteil des Repositorys. Vier absichernde Zeilen haben keinen eigenen Test (BEFUNDE.md). Die Frist der Hülle ist nur am Quelltext festgehalten. |
| Fachsichten und Gegenprüfungen R-032 | drei unabhängige Read-only-Läufe vor der Entscheidung (Laufzeit, Datenschutz, Bedienung); zwei auf dem Arbeitsstand vor `5f670a20`; einer auf `5f670a20` | Windows x64 | vor der Entscheidung übereinstimmend „Schließen an das vorhandene Pausieren binden“; danach 13 Einwände, zuletzt kein Zustand ohne Schließmöglichkeit | Einwände und ihr Ergebnis in BEFUNDE.md. Die Änderungen nach der letzten Gegenprüfung (`2ce74b9f`) sind nicht erneut gegengeprüft. |
| Dokumentation, Endstand | `npm run test:docs` auf `2ce74b9f` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden; nach dem Berichtscommit wiederholt. |
| Konverter, Endstand | nicht erneut ausgeführt | — | — | Seit `56d7c744` ist kein Konverter- und kein Core-Code geändert (`git diff --stat 56d7c744 2ce74b9f -- plugins native` ist leer); es gilt der Lauf auf `56d7c744`. |
| Windows x64 Paket, Endstand | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `2ce74b9f` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `721512f002c7f51c8080024805492744c5bf4ea3718741a99fbfe40c67e4963d`, 113 633 747 Bytes, 1 203 Einträge, Build `ebc54e3c`. Die Pakete der Vorstände wurden vorher aus `dist/` verschoben. |
| Windows x64 Start mit Außenverbindungsprüfung, Endstand | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `721512f0…` | Windows x64, online mit IPv6 | `PASS`, 0 | Start 2 127 ms, Beobachtungsfenster 77 s mit Haupt- und Prüffenster, 2 841 Stichproben, kein Lesefehler, keine Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. Der Abbau der Probe schließt das Fenster über die neue Schließanfrage; Wartezeit 154 ms von 20 000 ms. |
| Windows x64 Oberfläche, R-032 | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `721512f0…`; davor ein vorläufiges Paket der ersten Fassung (`a89c9a5d…`) | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „R-032“ |
| Cowork-Plugin, Endstand | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | ausstehend | Der Bau verlangt einen sauberen Arbeitsbaum und läuft deshalb nach diesem Berichtscommit; das Ergebnis trägt der folgende Commit ein. |
| `git diff --check`, Endstand | `git diff --check aa102cb5 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der sechsten Übergabe | `node tests/run-product-suite.js headless` auf `e66bab8f` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 19:33–20:24 am 24.11. Parallel lief kurz `npm run test:docs`. Zwei frühere Läufe dieser Nacharbeit, auf `7eefdcd4` und `4c98d621`, habe ich abgebrochen, als die zweite und die dritte Gegenprüfung weitere Änderungen nötig machten; für diese Zwischenstände gibt es kein Suite-Ergebnis. |
| Rust / Clippy, Stand der sechsten Übergabe | nicht erneut ausgeführt | — | — | Seit `56d7c744` ist keine Rust-Datei geändert (`git diff --stat 56d7c744 e66bab8f -- apps/datasecure-standalone/tauri-contract` ist leer); es gilt der Lauf auf `56d7c744`. Der Release-Bau für das Paket lief durch. |
| Gezielt, Stand der sechsten Übergabe | `tests/test-standalone-workspace.js` (519), `tests/test-standalone-review-frontend.js` (74), `tests/test-workflow-presentation.js` (55), `tests/test-standalone-document-review-frontend.js` (308), `tests/test-standalone-frontend.js` (52), `tests/test-standalone-loaded-frontend-contract.js` (4), `tests/test-native-smoke-integrity.js` (83), `tests/test-standalone-desktop-contract.js` (41); `tests/manual/standalone-native-windows-launch.ps1 -ValidateOutboundOnly` | Windows x64 | je `PASS`, 0 | Neu: der Wächter über die Zähltexte, je ein Fall für Einzahl und Mehrzahl der Statusdarstellung und der Dokumentnachbearbeitung, die Bindungen für den Beobachtungsweg, das Messskript und das Wartebudget. |
| Mutationsprobe der Startprobe | Scratch-Skript: neun verfälschte Kopien von `tests/manual/standalone-native-windows-launch.ps1`, je `-ValidateOutboundOnly` | Windows x64 | sieben abgelehnt, zwei bestehen (`Stop` ohne Warten, `Start` ohne Zurücksetzen); die unveränderte Kopie besteht | Kein Bestandteil des Repositorys. Die beiden bestehenden ändern in diesem Skript kein Prüfergebnis. Nicht erfasst: dass ein einzelner Fehler der Abtastung gezählt wird; der Zweig für Hosts ohne IPv6. |
| Wächterregel gegen alte Stände | Scratch-Skript mit der ersten Regel des Wächtertests gegen `cebc39a0`, `907efc14`, `7eefdcd4` und den Endstand; dazu vier einzeln zurückgedrehte Korrekturen im Arbeitsbaum (danach wiederhergestellt), je `tests/test-standalone-workspace.js` | Windows x64 | 71, 56, 15 und 0 Stellen; alle vier Rückfälle gemeldet | Belegt, dass der Test die bekannte Textklasse erkennt, nicht, dass sie vollständig ist. |
| Gegenprüfungen der Nacharbeit | drei unabhängige Read-only-Läufe, auf `907efc14`, `7eefdcd4` und `4c98d621`, mit eigenen Skripten und Mutationen | Windows x64 | erste: neun Einwände, zum Produkt nur die Zähltexte; zweite: ein von mir erzeugter Textfehler, rund fünfzehn übersehene Zähltexte, drei bestehende Verfälschungen der Probe; dritte: zwei weitere Zähltexte, die in `1126dc36` geänderten Sätze ohne Fund | Einwände und ihr Ergebnis in BEFUNDE.md. Die Änderung nach der dritten Gegenprüfung (`e66bab8f`) ist nicht erneut gegengeprüft. |
| Dokumentation, Stand der sechsten Übergabe | `npm run test:docs` auf `e66bab8f` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden; nach dem Berichtscommit wiederholt. |
| Konverter, Stand der sechsten Übergabe | nicht erneut ausgeführt | — | — | Seit `56d7c744` ist kein Konverter- und kein Core-Code geändert; es gilt der Lauf auf `56d7c744`. |
| Windows x64 Paket, Stand der sechsten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `e66bab8f` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `1c6c505d345237c1afd82257e0d9d48dbec27c4505ef9802e58d54c70118141c`, 113 629 295 Bytes, 1 203 Einträge, Build `bac4432a`. Die Pakete der Vorstände (`1c672ef4…`, `30bdd541…`, `ba19bb7d…`, `0aa6b130…`) wurden vorher aus `dist/` verschoben. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der sechsten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `1c6c505d…` | Windows x64, online mit IPv6 | `PASS`, 0 | Start 1 891 ms, Beobachtungsfenster 77 s mit Haupt- und Prüffenster, 2 872 Stichproben, kein Lesefehler, IPv6-Kontrolle und Kontrolle über den Hintergrundthread ausgeführt, keine Verbindung, kein Versuch zum lokalen Hostnamen, 0 TCP-Listener, 0 UDP-Endpunkte; Abbau-Wartezeit 313 ms von 20 000 ms. Dieselbe Probe bestand zuvor an den Paketen der Zwischenstände `7eefdcd4` und `4c98d621` (3 729 und 3 953 Stichproben). |
| Windows x64 Oberfläche, Stand der sechsten Übergabe | eigenes Startskript, Bedienung per Windows-UI-Automation, Pakete `30bdd541…` (Stand `907efc14`), `ba19bb7d…` (Stand `7eefdcd4`), `0aa6b130…` (Stand `4c98d621`) und `1c6c505d…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Nacharbeit“ |
| Cowork-Plugin, Stand der sechsten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `aeb9d0c0` (Produktstand `e66bab8f`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `af4e50ae…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Nacharbeit berührt das Plugin nicht (Texte der Standalone-Oberfläche, Prüfskripte, Tests, ein Dokument). |
| `git diff --check`, Stand der sechsten Übergabe | `git diff --check a1e4bc9b HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der fünften Übergabe | `node tests/run-product-suite.js headless` auf `56d7c744` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 14:05–14:57 am 24.11. Parallel liefen die Startproben, die Messungen und der Verarbeitungslauf am neuen Paket. |
| Rust / Clippy, Stand der fünften Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract` auf `56d7c744` | Windows x64 | je `PASS`, 0 | 333 bestanden, 0 fehlgeschlagen, 3 ignoriert. Nur das Windows-Ziel. |
| Gezielt, Stand der fünften Übergabe | `tests/test-native-smoke-integrity.js` (83), `tests/test-standalone-desktop-contract.js` (41), Vertragsmodi der Startprobe: `-ValidateReadinessOnly` (66 Gruppen), `-ValidateOutboundOnly` | Windows x64 | je `PASS`, 0 | Neu: drei Fälle zur Außenverbindungsprüfung, ein Fall zur genauen Schalterzeichenkette beider Fenster. |
| Gegenprüfung R-031 | ein unabhängiger Read-only-Lauf (Datenschutz-Prüfer) auf dem Arbeitsstand vor den Commits, mit eigenen Skripten und Mutationen des Beobachters | Windows x64 | Schalter und Verdrahtung nicht widerlegt; sechs Einwände | Einwände und ihr Ergebnis in BEFUNDE.md. Die danach eingearbeiteten Änderungen sind nicht erneut gegengeprüft. |
| Dokumentation, Stand der fünften Übergabe | `npm run test:docs`, `node tests/test-current-document-links.js`, `node tests/test-current-documentation-contract.js` auf `56d7c744` | Windows x64 | je `PASS`, 0 | — |
| Konverter, Stand der fünften Übergabe | `npm run test:standalone:conversion` auf `56d7c744` | Windows x64 | `PASS`, 0 | hinterlässt Ordner `.tmp-standalone-package-*` im Repository-Root, von mir entfernt |
| Windows x64 Paket, Stand der fünften Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `56d7c744` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `1c672ef4be13f55858a580d2b73782b0b627bfbcfcac31761ded7ec0f86c4495`, 113 628 275 Bytes, 1 203 Einträge, Build `9fe7076e`. Das Paket des Vorstands (`cec20d6e…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start mit Außenverbindungsprüfung | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence`; dasselbe mit `-AssertReviewWindow`; dasselbe gegen das Paket `cec20d6e…` | Windows x64, online mit IPv6 | neues Paket `PASS`, 0 (Haupt- und Prüffenster); bisheriges Paket `FAIL` wie verlangt (`STANDALONE_NATIVE_NETWORK_OUTBOUND_DETECTED`) | Neues Paket: Fenster 77 s, 3 165 und 2 477 Stichproben, kein Lesefehler, keine Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. Bisheriges Paket: WebView2, IPv6, Port 443. |
| Windows x64 Messung, Stand der fünften Übergabe | `tests/manual/measure-standalone-native-windows.ps1 -Archive … -ExpectedSha256 1c672ef4… -Iterations 3 -AssertNoListeners -AssertNoOutbound` | Windows x64 | `PASS`, 0 | p50 1 948 ms, 0 TCP-Listener, kein UDP-Endpunkt, keine Verbindung nach außen in drei Starts mit je 77 s Beobachtung. |
| Netzverkehr, Stand der fünften Übergabe | Scratch-Skript wie beim Vorstand: Paket `1c672ef4…`, 600 s Betriebssystemtabellen mit einem Verarbeitungslauf; 100 s mit Netzprotokoll von Chromium | Windows x64, online mit IPv6, WebView2 158.0.4370.33 | beobachtet, keine Abnahme | 20 814 Stichproben, kein TCP- und kein UDP-Endpunkt. Netzprotokoll: keine Anfrage nach außen; aufgelöst nur `tauri.localhost`; ein UDP-Socket ohne gesendetes Paket; ein Versuch zu `localhost:80`. Kein Bestandteil des Repositorys. |
| Windows x64 Oberfläche, R-031 | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `1c672ef4…` und ein Paket gleichen Schalterstands davor | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Nach R-031“ |
| Cowork-Plugin, Stand der fünften Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `d2da4689` (Produktstand `56d7c744`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `832397b1…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderung berührt das Plugin nicht (Fensterkonfiguration der Standalone-App, Prüfskripte). |
| Headless nach dem Workflow-Eintrag | `node tests/run-product-suite.js headless` auf `0f35696e` | Windows x64 | `PASS`, 0 | 365 Dateien; 15:44–16:34 am 24.11. Geändert sind gegenüber `56d7c744` nur Startprobe, Workflow, zwei Tests und ein Dokument. |
| Release-Workflow, Probenaufruf | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -EmitEvidence -AssertNoOutbound` lokal gegen das Paket `1c672ef4…`; dazu `tests/test-runtime-release-path.mjs`, `tests/test-test-path-separation.js`, `tests/test-windows-native-contract.mjs`, `tests/test-native-smoke-integrity.js` (83) | Windows x64 | je `PASS`, 0 | Fenster 77 s, 4 246 Stichproben, IPv6-Kontrolle ausgeführt, keine Verbindung. Der Workflow `release-evidence.yml` selbst ist nicht gestartet worden (Projektregel); auf dem gehosteten Runner ist der Schritt damit unbelegt. |
| `git diff --check`, Stand der fünften Übergabe | `git diff --check af0a1d52 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der vierten Übergabe | `node tests/run-product-suite.js headless` auf `0b99529c` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 09:33–10:30 am 24.11. Parallel liefen der native Lauf zu R-028, ein Verarbeitungslauf in der App und `npm run test:docs`, dazu weiter der hängengebliebene Python-Prozess. |
| Rust / Clippy, Stand der vierten Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract`, Rust-Quellen von `b71439b2` | Windows x64 | je `PASS`, 0 | 333 bestanden, 0 fehlgeschlagen, 3 ignoriert (sieben neue Tests). Nur das Windows-Ziel. |
| Mutationsprobe R-028 | Scratch-Skript: acht gezielte Verfälschungen von `private_namespace.rs` und `main.rs`, je `cargo test --locked <Filter>`, danach Dateien zurückgesetzt und verglichen | Windows x64 | alle acht erkannt | Kein Bestandteil des Repositorys. Nicht erfasst: die Zahl der Wiederholungen um eins, und ob die vier Aufrufstellen in `spawn_sidecar` einzeln zurückgedreht werden (dafür der Quelltextvertrag). |
| Gezielt, Stand der vierten Übergabe | `tests/test-native-smoke-integrity.js` (81), `tests/test-standalone-desktop-contract.js` (40), `tests/test-standalone-workspace.js` (518), `tests/test-standalone-frontend.js` (52) | Windows x64 | je `PASS`, 0 | Neu oder erweitert: vier Fälle zur Startprobe und zum Messskript, ein Quelltextvertrag der Shell, drei Fälle der Oberfläche. |
| Gegenprüfung R-028 bis R-030 | zwei unabhängige Read-only-Läufe (Datenschutz- und Laufzeit-Prüfer) auf dem Arbeitsstand vor den Commits, mit eigenen Skripten und einzelnen Node-Tests | Windows x64 | keine Aufweichung der Schutzgrenze, nichts durchgelassen; neun Einwände | Beide am Schrittlimit beendet, Berichte auf Nachfrage. Einwände und ihr Ergebnis in BEFUNDE.md. Die danach eingearbeiteten Änderungen sind nicht erneut gegengeprüft. |
| Dokumentation, Stand der vierten Übergabe | `npm run test:docs`, `node tests/test-current-document-links.js`, `node tests/test-current-documentation-contract.js` auf `0b99529c` | Windows x64 | je `PASS`, 0 | — |
| Konverter, Stand der vierten Übergabe | `npm run test:standalone:conversion` auf `0b99529c` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; hinterlässt Ordner `.tmp-standalone-package-*` im Repository-Root, von mir entfernt |
| Windows x64 Paket, Stand der vierten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs` auf `b71439b2`; `node tests/test-standalone-package-smoke.mjs` auf `0b99529c` gegen dasselbe Paket | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `cec20d6e528dec4e039f8dac058b036a2e5fa5e1c574ad363e4b94d8d38b2346`, 113 627 095 Bytes, 1 203 Einträge, Build `b4466f2a`. Das Paket des Vorstands (`b30c5511…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start, alte Probe | instrumentierte Kopie von `tests/manual/standalone-native-windows-launch.ps1` am Stand `e92d5b12`, `-Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence`, 11 Läufe gegen das Paket `b30c5511…` | Windows x64 | 8 `FAIL` (`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`), 3 `PASS` | In allen acht Fällen dieselben Merkmale: WebView2-Netzwerkdienst, gültige Microsoft-Signatur, `own_profile: false` wegen `…\webview\main\EBWebView` (R-029). Die Kopie liegt außerhalb des Repositorys. |
| Windows x64 Start, Stand der vierten Übergabe | dieselbe Probe am Stand `0b99529c`, 14 Läufe gegen das Paket `cec20d6e…`; davor 12 Läufe einer Vorfassung gegen `b30c5511…` | Windows x64 | 14 von 14 `PASS`, 0; Vorfassung 12 von 12 | Kein TCP-Listener (er hätte die Probe abgebrochen); in 4 der 14 Läufe ein zugeordneter UDP-Endpunkt (`["msedgewebview2.exe"]`), sonst keiner. Abbau-Wartezeit 138 bis 273 ms von 20 000 ms. |
| Windows x64 Messung | `tests/manual/measure-standalone-native-windows.ps1 -Archive … -ExpectedSha256 cec20d6e… -Iterations 10 -AssertNoListeners` am Stand `0b99529c` | Windows x64 | `PASS`, 0; am Stand `b11a6131` `FAIL` in Wiederholung 1 | p50 1 993 ms, p95 2 015 ms, 0 TCP-Listener, kein UDP-Endpunkt in dieser Serie. Der Fehlschlag davor ist der zweite Teil von R-030 (Zeile der App auf dem Fehlerkanal). Die Messung mit 30 Starts habe ich nicht ausgeführt. |
| Windows x64 Oberfläche, R-028 | eigenes Startskript nach dem Muster von `tests/manual/standalone-native-workspace-gui.ps1` mit einem Halterprozess (Löschzugriff auf einen Ordner des Testprofils), Bedienung per Windows-UI-Automation, Pakete `b30c5511…` und `cec20d6e…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Nach R-028 bis R-030“ |
| Cowork-Plugin, Stand der vierten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `14e3d87b` (Produktstand `0b99529c`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `5c669b7c…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderungen dieser Runde berühren das Plugin nicht (Rust-Shell, Standalone-Oberfläche, Prüfskripte). |
| Netzverkehr, Stand der vierten Übergabe | Scratch-Skript: Paket `cec20d6e…` im isolierten Profil, Betriebssystemtabellen für TCP und UDP je Prozess rund alle 23 ms, Positivkontrolle je Lauf; 600 s unverändert, 280 s mit Netzprotokoll von Chromium, je ein Versuch mit zwei und mit fünf zusätzlichen Startschaltern (100 s und 150 s) | Windows x64, online mit IPv6, WebView2 158.0.4370.33 | beobachtet, keine Abnahme | Unverändert: HTTPS zu `config.edge.skype.com` (2 Anfragen beim Start) und `edge.microsoft.com` (8 Anfragen des Komponenten-Updaters in 280 s), Auflösung von `wpad`; Shell und Core ohne Verbindung. Mit den Schaltern keine Anfrage nach außen, App arbeitsbereit, mit fünf Schaltern ein Verarbeitungslauf abgeschlossen. Kein Bestandteil des Repositorys. R-031. |
| `git diff --check`, Stand der vierten Übergabe | `git diff --check e92d5b12 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
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
    (R-025, Rest; behoben in der Nacharbeit, `907efc14`).
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

**Nach R-031** (Paket `1c672ef4…`, Build `9fe7076e` aus `56d7c744`,
24.11.2026 zwischen 14:00 und 14:30; Vergleich mit dem Paket `cec20d6e…` des
Vorstands)

- **Vorstand, zehn Minuten** – Nur der Netzwerkdienst von WebView2 hat
  Verbindungen: HTTPS zu Microsoft-Adressen bei 0,3 s, 1,3 s, 60 s, 150 s
  und 220 s. Das Netzprotokoll von Chromium nennt `config.edge.skype.com`
  (zwei Anfragen beim Start) und `edge.microsoft.com/componentupdater`
  (acht Anfragen in 280 s), dazu die Auflösung von `wpad`.
- **Endstand, zehn Minuten** – 20 814 Stichproben der
  Betriebssystemtabellen, kein TCP- und kein UDP-Endpunkt im Prozessbaum.
  Fußzeile „Version 3.2.0-rc178 · Build 9fe7076e“.
- **Endstand, Schalter** – Der Browserprozess von WebView2 trägt alle
  fünf Schalter und die Standardliste von wry.
- **Endstand, Bedienung** – automatische Maskierung einer erfundenen
  Datei: ein Ergebnis mit Zuordnung, Original unverändert. Geführter Lauf
  (am Paket gleichen Schalterstands vor der Gegenprüfung): „Prüfung
  erforderlich“, eingebettete Prüfung geladen, Entscheidung „Als Person /
  sensible Angabe ersetzen“ angewendet und gespeichert, „Anonymisierungslauf
  abgeschlossen“. Damit ist nach „Beibehalten“ auch „Ersetzen“ einmal nativ
  bedient.
- **Startprobe mit `-AssertNoOutbound`** – Endstand besteht mit Haupt- und
  mit Prüffenster; der Vorstand scheitert mit
  `STANDALONE_NATIVE_NETWORK_OUTBOUND_DETECTED` (WebView2, IPv6, Port 443).
- **Umgebungsvariable** – Mit gesetztem
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` trägt der Browserprozess die
  Schalter des Produkts und die der Variablen.
- **Nicht beobachtet** – ein Lauf über Stunden, ein tatsächliches
  Komponenten-Update, eine andere WebView2-Version, ein Host ohne IPv6,
  PDF, Scan und Bild in diesem Paket.

**Nacharbeit** (Paket `30bdd541…`, Build `eedc7eec` aus `907efc14`, und
Paket `1c6c505d…`, Build `bac4432a` aus `e66bab8f`; 24.11.2026 abends)

- **Geführte Prüfung mit vier Fundstellen** (Build `eedc7eec`) – eine
  Entscheidung vorgemerkt: „1 Zeile vorgemerkt. 3 Prüfzeilen noch offen.“
  **Später entscheiden** führt zu „Fundstellenprüfung vertagt“ und zurück zu
  „Prüfung erforderlich“. Beim Wiederaufnehmen sind 0 von 4 vorgemerkt; die
  vorgemerkte Entscheidung ist verworfen, wie der Dialog es ankündigt.
  Danach alle vier belassen, Lauf abgeschlossen.
- **Geführte Prüfung mit einer Fundstelle** (Build `eedc7eec`) – alle
  Zähltexte in der Einzahl.
- **Sechs Formate mit OCR** (Build `eedc7eec`; DOCX, XLSX, PPTX, Text-PDF,
  Scan-PDF, PNG aus den Generatoren der Paket-Tests) – „6 technisch geprüfte
  anonymisierte Ergebnisse“ nach 76 s. Name, Firma und IBAN der Vorlagen
  stehen in keinem Ergebnis; die Originale sind unverändert. Damit sind PDF,
  Scan und Bild einmal nativ durchlaufen.
- **Fenster rund 14 s nach dem Start schließen** (Build `eedc7eec`) – die
  Hülle endet, Arbeitsprozesse laufen rund 75 s weiter und legen alle sechs
  Ergebnisse ab; nach dem Neustart steht der Lauf als abgeschlossen im
  Verlauf (R-032).
- **Endstand, eine Datei, automatische Maskierung** (Build `bac4432a`) –
  Fußzeile „Version 3.2.0-rc178 · Build bac4432a“. Gesehen: „1 Datei“, „0 von 1 Datei abgeschlossen. Bitte warten; die Verarbeitung bleibt lokal.“, „1 technisch geprüftes anonymisiertes Ergebnis verfügbar“, im Verlauf „1 Datei · 1 Ergebnis · 0 ohne OCR nicht umgewandelt · 0 technische Fehler“ und „1 Ergebnisdatei · Nachbearbeitung freiwillig“, in der geöffneten Nachbearbeitung „1 Markdown-Datei verfügbar“ und „1 angezeigt · 1 Ergebnisdatei verfügbar“. Kein Text mit der Zahl 1 und einer Mehrzahl. Ergebnisordner mit Markdown und Zuordnungen; Name und Telefonnummer der Vorlage stehen nicht im Markdown; Original unverändert. Derselbe Lauf ohne die Nachbearbeitung verlief an den Paketen der beiden Zwischenstände gleich.
- **Startprobe am Endstand** – Start 1 891 ms, Beobachtungsfenster 77 s mit Haupt- und Prüffenster, 2 872 Stichproben, kein Lesefehler, IPv6-Kontrolle und Kontrolle über den Hintergrundthread ausgeführt, keine Verbindung, kein Versuch zum lokalen Hostnamen, 0 TCP-Listener, 0 UDP-Endpunkte; Abbau-Wartezeit 313 ms von 20 000 ms. Dieselbe Probe bestand zuvor an den Paketen der Zwischenstände `7eefdcd4` und `4c98d621` (3 729 und 3 953 Stichproben).
- **Nicht beobachtet** – die Einzahltexte der Dokumentnachbearbeitung, des
  abgebrochenen Exports und der Statusdarstellung mit genau einer nicht
  verfügbaren Datei (nur über Tests); Schließen während einer geführten
  Prüfung; ein zweiter Start, während ein Stapel ohne Fenster weiterläuft.

**R-032** (Paket `721512f0…`, Build `ebc54e3c` aus `2ce74b9f`, 25.11.2026
vormittags; sechs erfundene Dateien, „Automatisch maskieren“ mit OCR)

- **Schließen ohne Lauf** – Fenster zu nach 0,2 s, wie vorher.
- **Schließen im Lauf** – die Rückfrage erscheint: „Die Verarbeitung ist noch
  nicht fertig. 0 von 6 Dateien sind fertig. Wenn du jetzt schließt, wird
  nach der laufenden Datei pausiert. …“ Die App lebt über die Zwei-Sekunden-
  Frist der Hülle hinaus.
- **Weiter verarbeiten** – Rückfrage weg, der Lauf arbeitet weiter.
- **Pausieren und schließen** – Laufbeschreibung „Pause angefordert. …
  DataSecure schließt danach von selbst.“ Fenster zu nach 6,5 s; danach kein
  Arbeitsprozess mehr, im Ergebnisordner keine Datei, auch 12 s später.
- **Neustart** – Verlauf „6 Dateien · 2 Ergebnisse“ mit **Fortsetzen**;
  danach „6 technisch geprüfte anonymisierte Ergebnisse“, kein Klartext von
  Name, Firma oder IBAN der Vorlagen, Originale unverändert.
- **Jetzt schließen** in der Wartezeit – zweite Rückfrage „Die laufende
  Datei wird noch fertiggestellt. …“; Fenster zu nach 0,2 s; fünf
  Arbeitsprozesse laufen 3,3 s weiter und enden; danach entsteht nichts
  mehr. Fortsetzen nach dem Neustart ergibt sechs Ergebnisse.
- **Am vorläufigen Paket der ersten Fassung** (`a89c9a5d…`) – derselbe
  Ablauf mit Pausieren (Fenster zu nach 6,3 s). Dort fiel auf, dass die
  fertigen Dateien nach dem Pausieren noch nicht im Ergebnisordner liegen;
  die Rückfrage sagt das seitdem.
- **Nicht beobachtet** – die Rückfragen „nicht pausierbar“ und „Stand nicht
  bekannt“, Esc, eine stumme Oberfläche (Frist der Hülle), ein Klick während
  des Beendens, eine große Datei mit langer Wartezeit, „Nur in Markdown
  umwandeln“, geführte Prüfung, macOS.

## Urteil je Prüfdimension

Zahlen aus ABDECKUNG.tsv am Stand `2ce74b9f`, nur Einzeleinheiten. Das
Register zählte in der ersten Runde Produktivcode hinter einem
`#[cfg(test)]` irrtümlich als Rust-Testmodul und damit als offen. Die
Erkennung ist korrigiert; dadurch gelten rund 460 Rust-Einheiten jetzt als
teilgeprüft, weil ihre Datei im Rust-Review vollständig gelesen wurde. Das
ist eine Korrektur der Zählung, keine zusätzliche Prüfung.

| Dimension | Urteil | Befunde | Abdeckung (geprüft / teilgeprüft / offen) und Grenze |
| --- | --- | --- | --- |
| Fachlichkeit und Formatqualität | Text und CSV solide; die belegten stillen Verluste in DOCX, XLSX und CSV sind behoben oder als Hinweis sichtbar, bis auf den Zustand alter Formular-Kontrollkästchen. Listen bleiben Tabellen. Ein Lebenslauf mit Namenslink ist jetzt automatisch verarbeitbar. | R-003 bis R-006, R-018, R-026 | 5 / 277 / 603. PDF, Scan-PDF, Bild-OCR und Office-OCR im Review nicht ausgeführt; Diagramme, SmartArt, Formeln nur über die Suite. |
| Anonymisierung und Zuordnungen | Mehrere Leckmuster und eine Überredaktion behoben; zwei eigene Lecks der zweiten Runde vor der Übergabe gefunden und behoben. Gegenüber RC178 zeigt der Differenzlauf am Endstand keine Verschlechterung außer den zehn gewollten Fällen von R-024. Zugangsdaten mitten in der Zeile werden für ein Wort ersetzt (R-027, Teil). Offen: die dokumentierten Grenzen von R-027 und der Namenserkennung. Zuordnungen und CSV-/XLSX-Escaping ohne Befund. | R-001, R-002, R-017, R-024, R-026, R-027 | 11 / 235 / 455. Eine geführte Entscheidung nativ ausgeführt, sonst keine; `privacy/entities.js`, `credentials.js`, `person-ambiguities.js` nicht gelesen. |
| Oberfläche, UX und Accessibility | Ablauf entspricht DS-086; kein kritischer Befund. Texte und Rollen nachgebessert. Die eingebettete Prüfung ist mehrfach nativ bedient (Ersetzen, Beibehalten, Später entscheiden und Wiederaufnahme); die Zähltexte haben ihre Einzahl. Schließen während eines Laufs führt über eine Rückfrage zur Pause; nativ bedient sind die Rückfrage, Bleiben, Pausieren und Jetzt schließen (R-032). | R-008, R-009, R-020, R-025, R-032 | 9 / 238 / 46. Quelltext plus Windows-Läufe; kein Screenreader, kein Zoom, kein WKWebView. |
| Architektur und Plattform | Grenzen Oberfläche → Rust → Core → Worker nachvollzogen; Produkttrennung in der Projektion wirksam. Fünf Befunde der Rust-Shell behoben oder eingegrenzt, zuletzt die Startverweigerung bei belegter Ordnerkette. | R-011 bis R-014, R-022, R-028, R-032 | 24 / 755 / 545. Rust-Tests nur für Windows; macOS-Zweige siehe Mac-Status. |
| Implementierung und Wartbarkeit | `main.rs` (rund 4 400 Zeilen), `ooxml.js` (226 KB) und `privacy/engine.js` sind zu groß für sichere Einzeländerungen; im Datenschutzkern überlagern sich Regeln über Ränge, sodass eine neue Regel an entfernten Stellen wirkt. Dreifache NtCreateFile-Hüllen; toter Code (`adaptive-resource-policy.js`, zwei ungenutzte Commands). Die zweite Runde hat `main.rs` um rund 280 Zeilen vergrößert. | — (Verbesserungen, nicht als Befund geführt) | 1 / 205 / 675. Kein systematischer Durchgang. |
| Datenschutz und Sicherheitsgrenzen | Export überschreibt nie, Pfade handle-relativ, Diagnose mit geschlossenem Vokabular, keine Listener. Das neue Diagnoseereignis trägt nur Fehlerklasse und Systemcode. Shell und Core bauen keine Verbindungen auf. Die WebView2-Komponente meldete sich bis zum vierten Übergabestand regelmäßig bei Microsoft; am Endstand ist in zehn Minuten keine Verbindung mehr zu beobachten. | R-010, R-012, R-031 | 0 / 13 / 175. JS-Diagnose, Ergebnisexport und Prüfspeicher nicht gelesen. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Serielle Veröffentlichung belegt, zweispurige Vorbereitung belegt. Verwaiste Vorbereitungen werden bereinigt; eine laufende Veröffentlichung schützt allein ihr Alter. | R-007, R-010, R-022 (Hypothese), R-032 | 0 / 157 / 450. Wiederaufnahme nach „Später entscheiden“ einmal, nach „Pausieren und schließen“ und nach „Jetzt schließen“ je einmal nativ beobachtet; Absturzpfade, Beenden durch das Betriebssystem und voller Datenträger nicht untersucht. |
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
Claude-Code-Review für DataSecure RC178, zweite Runde mit dritter Prüfung, R-027, R-028 bis R-032 und Nacharbeit, abgeschlossen.
Branch: https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review
Einstiegscommit: e88f1b8d100421017fb3909d77e338fd25c1b421
Geprüfter Produktstand: 2ce74b9ff0798a3a3b6164b1fe30af142a1d6971 (Produktcode zuletzt in diesem Commit; spätere Commits nur tasks/rc178-claude-review/)
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
   Der UDP-Endpunkt, an dem die alte Probe scheiterte, gehört zum Verkehr aus Punkt 6.
6. R-031, Commits 1c3f36af und 56d7c744: Bis 0b99529c (also auch in RC178) fragte die WebView2-
   Komponente beim Start config.edge.skype.com ab und meldete sich danach alle 20 bis 40 Sekunden bei
   edge.microsoft.com/componentupdater, dazu eine Proxy-Suche (wpad). Jetzt starten beide Fenster
   WebView2 mit --disable-background-networking --disable-component-update --no-proxy-server
   --disable-quic und einer --host-resolver-rules-Regel (tauri.conf.json und WEBVIEW2_BROWSER_ARGS in
   main.rs, gleichlautend). Die Startprobe prüft mit -AssertNoOutbound; der Release-Workflow ruft sie
   seit 0f35696e so auf, ist aber nicht ausgeführt worden. Zu prüfen: der Mac-Build (der Wert steht in
   der gemeinsamen Konfiguration), ein Lauf des Windows-Jobs von release-evidence.yml, derselbe
   Schalter in scripts/run-pkg-04.ps1 (seit cebc39a0 eingetragen, nicht ausgeführt) und ob das Produkt
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS aus seiner Umgebung entfernen soll. Die Kontrolle des
   Beobachters läuft seit 1db8c744 und 98b426dd auch über seinen Hintergrundthread; der Zweig für
   Hosts ohne IPv6 ist nicht ausgeführt.
7. R-032, Commits 5f670a20 und 2ce74b9f, auf Entscheidung des Anwenders (DECISIONS.md, Präzisierung
   DS-110 vom 25.11.2026): Schließen des Hauptfensters fragt bei arbeitendem Lauf und pausiert über
   das vorhandene pause_batch. Hülle: close_prompt.rs, main.rs (request_native_close,
   acknowledge_close_request, decline_close_request, confirm_close), ipc_transport.rs (ExitGate::begun),
   Frist zwei Sekunden. Oberfläche: workspace.js (closeQuestion, presentClose, receiveCloseRequest,
   settleClose, workStarting). Der gemeinsame Core und der losgelöste Start der Arbeitsprozesse sind
   unverändert; kein Prozess wird abgebrochen. Zu prüfen: Mac-Build und Bedienung unter macOS (das
   App-Menü Beenden geht über ExitRequested an der Rückfrage vorbei), die Frist bei einer stummen
   Oberfläche, eine große Datei mit langer Pausenwartezeit, Schließen während einer geführten Prüfung
   mit ungespeicherten Eingaben (unverändert sofort), und ob workStarting jeden Befehl erfasst, der
   Arbeit anstößt. Der Commit 2ce74b9f ist nicht mehr gegengeprüft.
8. R-025, Commits 907efc14, 8c452ac4, 1126dc36 und e66bab8f: nur Texte der Oberfläche. 8c452ac4 hatte
   eine Verbform verdorben und rund fünfzehn Texte übersehen (zweite Gegenprüfung), danach fehlten
   noch zwei (dritte Gegenprüfung).
   Zu prüfen: ob weitere Zähltexte fehlen (der Wächter in tests/test-standalone-workspace.js kennt
   nur eine Wortliste und drei Satzformen), die Einzahlsätze in workspace.js und document-review.js auf
   Lesbarkeit;
   app.js (alte Oberfläche) ist unverändert.
Offen oder blockiert: macOS arm64/x64 und iOS-Simulator (keine Geräte); R-006 (Listen als Tabellen),
R-015, R-022; R-032 beim Beenden durch das Betriebssystem und bei Absturz; R-028 bei langer Belegung; R-031 hängt an nicht zugesicherten WebView2-Schaltern; Grenzen von R-027 (mehrwortige Geheimnisse, Labels in
Überschriften, Tabellen und Links); vier Commit-Nachrichten mit falschem Backlogposten (siehe Bericht);
rund 61 % der Einheiten im Register offen.
```
