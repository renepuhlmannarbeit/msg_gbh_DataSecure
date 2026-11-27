# RC178-Review · Ergebnis und Übergabe an Codex

Gehört zum [Arbeitsauftrag](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Stand 26.11.2026, nach dreizehn Übergaben; der folgende Absatz nennt sie
der Reihe nach. Befunde
und Annahmen stehen in [BEFUNDE.md](BEFUNDE.md), das Einzelregister in
[ABDECKUNG.tsv](ABDECKUNG.tsv).

Der Bericht ist über dreizehn Übergaben gewachsen. Die erste endete mit dem Remote-Stand
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
aufbaut (R-031); dieser Stand wurde als `af0a1d52` übergeben. Auf Auftrag
behoben in `1c3f36af` und `56d7c744`. Zwei
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
und `2ce74b9f`. Dieser Stand wurde als `7de6aba6` übergeben. Danach hat der
Anwender beauftragt, alles zu erledigen, was sich hier erledigen lässt: dreizehn
Commits von `d41a042b` bis `33595449`. Fünf Gegenprüfungen liefen dabei; zwei
meiner Änderungen haben sie nicht bestanden (eine zurückgenommen, eine
nachgebessert). Ein nativer Lauf hat einen neuen, schon in RC178 vorhandenen
Befund ergeben (R-033): Aus Word-Dokumenten blieben Telefonnummern, Namen
hinter Titeln und weitere Angaben im freigegebenen Markdown stehen. Dieser
Stand wurde als `eccf9ad3` übergeben. Am Abend hat der Anwender beauftragt, die
offenen Erkennungslücken aus R-033 anzugehen: der Commit `1c8e971c`.
Drei Gegenprüfungen liefen dabei; zwei Fassungen haben sie nicht bestanden und
sind vor dem Commit umgebaut worden, die dritte hat acht weitere Punkte
ergeben (drei behoben, drei zum Teil, zwei bleiben). Dieser Stand wurde als
`ec0867a9` übergeben. Danach hat der Anwender beauftragt, den dabei häufiger
erreichten Stopp bei einem Namen zwischen Label und Nummer zu beheben: der
Commit `0bd5e26f`. Eine Gegenprüfung konnte ihn nicht widerlegen. Dieser
Stand wurde als `c612b647` übergeben. Danach hat der Anwender entschieden,
die frühere Oberfläche zu entfernen, die das Fenster nicht mehr lud: die
Commits `8cf5dd93` und `1d908311`. Dieser Stand wurde als `80d4823e`
übergeben. Danach hat der Anwender beauftragt, die 52 entfallenen Tests
einzeln abzugleichen; das Ergebnis sind zwei neue Befunde (R-035, R-036) und
die Tabelle in [ABGLEICH-ALTE-OBERFLAECHE.md](ABGLEICH-ALTE-OBERFLAECHE.md).
Dieser Stand wurde als `54c1f176` übergeben. Danach hat der Anwender
beauftragt, beide Befunde zu beheben: der Commit `d474a579`. Dieser Bericht
beschreibt den Endstand `d474a579`.

## Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | [`claude/rc178-standalone-review`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review) |
| Eingefrorener Einstieg | `e88f1b8d100421017fb3909d77e338fd25c1b421` (`origin/codex/rc178-claude-review-handoff`) |
| RC178-Produktbaseline | `v3.2.0-rc178` → `13ed39ff979a5f5d9bb076d35021164de380b9dd`, Fingerprint `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` (nachgerechnet, 400 Quellinputs) |
| Geprüfter Produktstand | `d474a57916229aaebf89e5dd54cd8533e283ef6c` (Oberfläche und ihr Test; kein Core- und kein Rust-Code). Fingerprint `6ba59a6f0e3e37023d41db9c89130fd7ab28fe93e444c89c3c7a2ca7279fa1b2`. Alle späteren Commits ändern nur `tasks/rc178-claude-review/`. Stand der elften und zwölften Übergabe: `1d908311`, Fingerprint `383aa344…`; der zehnten: `0bd5e26f`, Fingerprint `5c873336…`; der neunten: `1c8e971c`, Fingerprint `b8ea7acd…`; der achten: `33595449`, Fingerprint `46dd498f…`; der siebten: `2ce74b9f`, Fingerprint `ebc54e3c…`; der sechsten: `e66bab8f`, Fingerprint `bac4432a…`; der fünften: `0f35696e`, Fingerprint `9fe7076e…`; der vierten: `0b99529c`, Fingerprint `b4466f2a…`; der dritten: `ebe526ec`, Fingerprint `043e3b81…`; der zweiten: `ffab4fa7`, Fingerprint `1803bce7…`; der ersten: `e1afef0f`, Fingerprint `5496fabe…`. |
| Prüfumgebung | Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code; Windows 11 Pro 10.0.26300 x64; Node 22.23.2 für alle Tests (Host-Node 24.18.0), npm 11.16.0, cargo/rustc 1.98.1, MSVC mit SDK 10.0.26100.0, WebView2 158.0.4370.33, Claude CLI 2.1.280 |
| Verfügbare Zielplattformen | Nur Windows x64. Kein Mac, kein Xcode, kein iOS-Simulator. |
| Abdeckung | 5 133 erfasste Einheiten in 346 Dateien: 52 `GEPRÜFT`, 1 962 `TEILGEPRÜFT`, 3 119 `OFFEN`; dazu 14 Dateigruppen (6 `TEILGEPRÜFT`, 2 `OFFEN`, 6 `AUSGENOMMEN`). Zahlen je Prüfdimension unten. |

Die Versionskennung `3.2.0-rc178` wurde nicht geändert. Der Stand ist kein
Release; ein daraus gebautes Paket trägt dieselbe Versionsnummer wie RC178,
aber den Build-Fingerprint `6ba59a6f…`.

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
     Oberfläche (R-019; die alte Oberfläche selbst ist seit `1d908311`
     entfernt, siehe Punkt 9).
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
     festen Regressionssammlung (`tests/test-pii-regression.js`).
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
   - Offen bleiben R-006 (Listen), R-015 (Release-Nachweis für Windows,
     Schutz von Tag und Release) und R-022 (Hypothesen für macOS), dazu die
     Reste von R-003 (Formular-Kontrollkästchen) und R-033 (Punkt 7).
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
     fortsetzen**. Behoben vor dem Push. Der letzte Commit wurde
     danach gegengeprüft; zwei weitere Fehler sind behoben (Punkt 6).
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
   - Nur teilweise behoben sind R-004, R-011, R-012, R-013, R-017, R-020,
     R-023, R-027 und R-033. Die Gründe stehen unten und in BEFUNDE.md.
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
   - Seit der zweiten Runde sind acht Rust-Dateien geändert (Liste im
     Abschnitt „Mac-Status“). Übersetzt und getestet ist
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
     Später endeten weitere Gegenprüfungen so (Testtabelle, Zeilen zu R-027
     und zu R-028 bis R-030).
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
6. **Runde vom 25.11. nachmittags** (Stand am Ende dieser Runde; was davon
   später behoben wurde, steht in den Punkten 7 bis 9. Einzelheiten in
   BEFUNDE.md)
   - **Neu und am wichtigsten, R-033:** Im nativen Lauf stand im
     freigegebenen Ergebnis eines Word-Formulars
     `Antragsteller: Hans Müller, Tel\. 030 1234567`. Die Umwandlung
     schreibt jeden Punkt als `\.`, und fünf Regeln des Kerns lasen das
     nicht: abgekürztes Telefonlabel, Titel, `geb.`, `z. Hd.` und
     abgekürzte Nummernlabels. Dieselbe Zeile aus einer Textdatei wurde
     ersetzt. RC178 verhält sich gleich. Behoben für diese Regeln in
     `3ba2b8fb`; weitere Formen derselben Art sind offen (maskierte Klammer,
     getippte Listen- und Hervorhebungszeichen vor einem Namen).
   - **Dabei gesehen, nicht behoben, in RC178 gleich:** ein Name hinter
     `Antragsteller:` oder `Patient:` (R-033b), eine Namenszeile hinter
     einem Aufzählungszeichen im Profil Allgemein (R-033c), ein voller
     unbekannter Name in Prosa ohne Hinweiswort und eine Telefonnummer ohne
     Label (R-033d). Die geführte Prüfung zeigt diese Stellen nicht an. Im
     Lauf mit fünf erfundenen Dateien enthielten am Ende dieser Runde drei der fünf
     Ergebnisse solchen Klartext.
   - **R-032, Gegenprüfung des letzten Commits:** zwei Fehler behoben (stilles
     Schließen, während eine Antwort der geführten Prüfung unterwegs ist;
     **Pausieren und schließen** ohne Pause nach Verbindungsverlust).
     Berichtigung zur vorigen Übergabe: Die Rückfrage „Aufbewahrung 0 Tage“
     kann im Standalone-Paket nicht auftreten, weil die Hülle die Einstellung
     nicht an den Core weiterreicht.
   - **R-023:** Die Rust-Crates sind erstmals geprüft; zwei gemeldete
     Schwachstellen (`url`, `cookie`) sind angehoben.
   - **R-013, R-020, R-027:** Diagnosepaket mit bis zu 2 048 Einträgen;
     Seitenzoom unter Windows; Zugangsdaten in Anführungszeichen ganz ersetzt.
   - **Zurückgenommen:** die Ausgabe alter Formular-Kontrollkästchen
     (`39f2b3aa`, zurück in `22c34dcb`), weil das Zeichen die Erkennung
     eines Namens dahinter verhinderte.
   - **Nicht umgesetzt:** Aufbewahrung alter Protokolle und Aufräumen alter
     Exportdatensätze (die Hülle enthält bewusst keinen Löschcode),
     Entfernen der alten Oberfläche (inzwischen erfolgt, Punkt 9),
     Bidi-Zeichen, Live-Regionen, Seitenzoom
     unter macOS und Linux.
7. **Runde vom 25.11. abends, Erkennungslücken aus R-033** (Einzelheiten in
   BEFUNDE.md, Abschnitt „R-033 · Erkennungslücken, Umsetzung am 25.11.
   abends“)
   - **Ersetzt wird jetzt** (Standalone, als Personenhinweis; der
     automatische Modus ersetzt, die geführte Prüfung fragt): ein
     namensförmiger Wert hinter einer Rolle (`Antragsteller: Hans Müller`,
     rund 80 Rollen), die Namen einer Liste unter einem Personenlabel, einer
     Rolle oder `Anwesend:`, und derselbe volle Name an bis zu 500 weiteren
     Stellen desselben Dokuments. In beiden Produkten: `Rückruf unter …` als
     Telefonlabel und der Name vor einer maskierten Klammer aus Word.
   - **Im nativen Lauf mit denselben fünf erfundenen Dateien:** vorher
     enthielten drei der fünf Ergebnisse Klartext, den ein Leser als
     personenbezogen ansieht; jetzt eines (`Petra Koch hat den Vertrag am 12.03.2026 unterschrieben`).
   - **Verworfen nach den Gegenprüfungen:** Rollen als Personenfelder
     (ersetzten Bemerkungen wie `Patient: stabil` und das Wort danach im
     ganzen Dokument), eine Regel für einen Namen vor „hat“ (hielt
     `Letzte Woche hat der Chef angerufen` für eine Person), eine Regel für
     den Geburtsnamen (neue Stopps).
   - **Neue Folge, danach behoben (`0bd5e26f`, siehe unten):** Steht ein Name, der an anderer Stelle
     Personenhinweis ist, zwischen einem Label und einer Nummer
     (`Tel. Hans Müller 030 …`), stoppt das Dokument mit `RESIDUAL_PII`.
     Vorher wurden dort Name und Nummer lesbar freigegeben. Der Mechanismus
     ist in RC178 derselbe für jeden bekannten Namen; die neuen Regeln
     erreichen ihn häufiger (im eigenen Suchlauf 1 608 von 19 440 Fällen,
     alle dieser Art).
   - **Weiter offen:** ein voller Name in Prosa ohne Hinweisverb, ein
     einzelner Nachname, eine Telefonnummer ohne Label, ein Geburtsname. Der
     Kern erkennt Namen allein an der Form; ohne Namensverzeichnis oder
     lokales Modell tauscht jede weitere Regel Unterredaktion gegen
     Überredaktion. Das ist eine Produktentscheidung.
8. **Korrektur vom 25.11. spät** (Einzelheiten in BEFUNDE.md, Abschnitt „R-033 ·
   Stopp bei Label, Name, Nummer behoben“)
   - **Ursache:** Die Schlussprüfung liest einen Platzhalter als Leerraum und
     sah in `Tel. [PERSON_001] 030 1234567` ein Label direkt vor seiner
     Nummer; die Redaktion sah den Platzhalter dazwischen und ließ die Nummer
     stehen. Das Dokument stoppte. In RC178 genauso, sobald der Name bekannt
     ist.
   - **Jetzt:** Beide lesen den Text gleich. Ergebnis
     `Tel. [PERSON_001] [PHONE_REDACTED]`, ebenso für Geburtsdatum,
     Steuer-ID, Aktenzeichen und Personalnummer, in beiden Produkten.
   - **Gemessen:** Im Suchlauf mit 19 440 Fällen kein neuer Stopp mehr gegenüber
     dem Kern der achten Übergabe (vorher 1 608); 356 Fälle, die dort schon
     stoppten, laufen jetzt durch; nichts ist sichtbarer.
   - **Nebenbei geschlossen:** Eine Nummer mit maskierter Vorwahl-Klammer aus
     Word hinter einem ersetzten Namen wurde vorher lesbar freigegeben.
   - **Zu wissen:** Ein Dokument, das vorher an einer solchen Nummer stoppte,
     wird jetzt freigegeben, auch wenn es an anderer Stelle einen Namen
     enthält, den der Kern nicht erkennt. Der Stopp hatte dort nur zufällig
     geschützt.
9. **Frühere Oberfläche entfernt** (Einzelheiten in BEFUNDE.md, Abschnitt
   „R-019 und R-034 · Frühere Oberfläche entfernt“)
   - **Entfernt auf Entscheidung des Anwenders:** `index.html`, `app.js` und
     `styles.css` im Ordner der Oberfläche, dazu der Test, der nur sie
     prüfte (52 Tests), und ihre Browser-Fixture. Das Fenster lud die Seite
     nicht mehr, das Paket enthielt sie aber weiter.
   - **Tests an die geladene Oberfläche gebunden:** rund 40 Prüfungen des
     Vertragstests der Hülle. Ein neuer Test hält fest, dass der paketierte
     Ordner nur enthält, was die Fenster laden.
   - **Dabei gefunden, R-034:** Vier Fehlercodes des Core erklärte nur die
     frühere Oberfläche; die geladene zeigte einen allgemeinen Satz. Der
     Vertragstest prüfte die Erklärungen an der falschen Datei und bestand.
     Die Texte sind ergänzt.
   - **Bleibt:** Vier native Befehle haben in der geladenen Oberfläche keinen
     Aufrufer mehr (`remove_admitted_source`, `open_review_window`,
     `open_local_ledger`, `shutdown`). Sie zu entfernen ändert die Hülle
     für drei Betriebssysteme und ist eine eigene Entscheidung.
   - **Berichtigung:** Der Backlog führt die Standardumschaltung als erledigt,
     nicht als offen, wie ich dem Anwender zuvor gesagt hatte. Veraltet war
     ein Satz in `PRODUCT.md`; er ist berichtigt.
10. **Einzelabgleich der 52 entfallenen Tests** (Tabelle in
    ABGLEICH-ALTE-OBERFLAECHE.md, Befunde in BEFUNDE.md)
    - **Zahlen:** 2 gedeckt, 29 teilweise, 9 ungeprüft, 7 entfallen durch das
      andere Bedienkonzept, 5 mit fehlendem Verhalten (2 am Code bestätigt, 3
      nicht belegt oder ohne dokumentierte Anforderung).
    - **R-035, inzwischen behoben (siehe unten):** Der Hinweis auf einen Ergebnisordner im Netzwerk
      (DS-080) fehlt in der geladenen Oberfläche. Der Core liefert ihn, die
      Oberfläche zeigt ihn nicht. In RC178 gleich.
    - **R-036, inzwischen behoben (siehe unten):** Fehlerdetails des Core (Name und Grund der
      betroffenen Datei) und fünf Erklärungen erreichen die Oberfläche nicht.
      In RC178 gleich.
    - **Einordnung:** Das Entfernen der früheren Oberfläche hat diese Lücken
      nicht geschaffen, es hat sie sichtbar gemacht. 38 der 52 Verhalten sind
      an der geladenen Oberfläche nicht oder nur zum Teil geprüft.
11. **R-035 und R-036 behoben** (Einzelheiten in BEFUNDE.md, Abschnitt „R-035
    und R-036 · Umsetzung“)
    - **Netzlaufwerk:** Die Bestätigung nach der Ordnerwahl trägt jetzt den
      Hinweis nach DS-080, ohne Pfad.
    - **Abgelehnte Auswahl:** Die Meldung nennt bis zu zehn Dateien mit ihrem
      Grund und zählt den Rest, auch beim Hineinziehen. Fünf weitere Codes
      haben einen eigenen Satz. Eine angenommene Auswahl sagt, was sie
      ausgelassen hat.
    - **Grenze:** Der Core erkennt ein Netzlaufwerk nur am UNC-Pfad. Bei einem
      zugeordneten Laufwerksbuchstaben und am Mac unter `/Volumes` bleibt
      der Hinweis aus. Das war schon vorher so. Der Anwender hat nach der
      dreizehnten Übergabe entschieden, es vorerst dabei zu belassen.
    - **Nicht nativ beobachtet:** kein Netzlaufwerk im Testprofil, keine
      abgelehnte Auswahl über die Fensterbedienung ausgelöst.
12. **Für Codex zuerst** – siehe Übergabenachricht am Ende.

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
| `cfee417a`, `ac74cf71` | R-017 | `privacy/engine.js`: abgekürzte Anrede („Hr.“, „Fr.“), „Nachname, Vorname“, Kennungen mit `_` und `.`, Genitiv eines bekannten Alias im Folgedokument. Die hier eingeführte Ganzersetzung von Links und die Regel für umgestellte Namen waren fehlerhaft; siehe „Dritte Prüfung“. Grenze in `docs/canonical/STANDALONE_SECURITY_MODEL.md`. | `tests/test-privacy-name-variants.js` (am Endstand 10 Fälle, mit Gegenfällen) | Gemeinsamer Kern, auch Cowork. Policy-Fingerprint ändert sich. |
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
| `907efc14`, `8c452ac4`, `1126dc36`, `e66bab8f` | R-025, A-030, A-031 | `frontend/review.js`, `workspace.js`, `document-review.js`, `workflow-presentation.js`: Jeder Zähltext entscheidet über die Einzahl oder nutzt `counted`; wo die Einzahl einen anderen Satzbau braucht, steht ein eigener Satz. Nur Texte, kein Ablauf. | `tests/test-standalone-workspace.js` (519, darunter der Wächter über die vier Dateien: 71 Stellen am Stand vor R-025), `tests/test-standalone-review-frontend.js` (74), `tests/test-workflow-presentation.js` (55), `tests/test-standalone-document-review-frontend.js` (308, darunter die Zählsätze für 0, 1 und 2); zehn Testfälle hielten falsche Formen fest und sind berichtigt; vier zurückgedrehte Korrekturen werden vom Wächter gemeldet; nativer Lauf | Nur Standalone, alle Ziele; kein WKWebView-Nachweis. Build-Fingerprint ändert sich. Die alte Oberfläche `app.js` blieb dabei unverändert (seit `1d908311` entfernt). |
| `1db8c744`, `98b426dd` | R-031, A-028 | `tests/manual/standalone-native-windows-launch.ps1`: Die Positivkontrolle läuft zusätzlich über den Hintergrundthread der Beobachtung (`…_OBSERVER_WORKER_INVALID`) und verlangt, dass nach dem Stopp nichts mehr abtastet; die IPv6-Tabelle bleibt nur dort ungelesen, wo es kein IPv6 gibt und sie nicht lesbar ist. `tests/manual/measure-standalone-native-windows.ps1`: `review_window_asserted` in der Zusammenfassung. `docs/TESTING.md`. Kein Produktcode. | `tests/test-native-smoke-integrity.js` (83); sieben von neun verfälschten Kopien der Probe abgelehnt; Probe am Paket des Endstands | Nur Windows. Der Zweig für Hosts ohne IPv6 ist nicht ausgeführt. |
| `05efbad8`, `4c98d621` | R-028 | `tests/test-standalone-desktop-contract.js`: gemeinsames Wartebudget, kein Warten nach dem Anlegen, Bindung der zurückgegebenen Generation. Nur Test. | 41 Fälle | — |
| `7eefdcd4` | R-028, R-031 | `docs/canonical/STANDALONE_SECURITY_MODEL.md`: Herkunft der Aussage zum UDP-Socket; ein nach dem Anlegen gescheiterter Start hinterlässt einen leeren Datenroot. Kein Code. | `npm run test:docs` | — |

Am 25.11. auf Entscheidung des Anwenders (BEFUNDE.md, „R-032 · Umsetzung,
Gegenprüfungen und nativer Nachweis“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `5f670a20` | R-032, A-029, A-033, A-034 | `tauri-contract/src/close_prompt.rs` (neu), `main.rs` (`request_native_close`, drei Befehle), `ipc_transport.rs` (`ExitGate::begun`), `capabilities/main.json`, `permissions/commands.toml`, `gen/schemas/*`: Die Hülle reicht das Schließen des Hauptfensters an die Oberfläche weiter und schließt ohne Antwort nach zwei Sekunden wie bisher. `frontend/workspace.js`, `workspace.html`, `workspace.css`: Rückfrage, Pausieren über `pause_batch`, Schließen nach der Pause. `docs/canonical/DECISIONS.md` (Präzisierung DS-110), `PRODUCT.md`, `STANDALONE_ARCHITECTURE.md`, `STANDALONE_SECURITY_MODEL.md`, `BACKLOG.md` (BL-010.14). | fünf Rust-Tests, `tests/test-standalone-workspace.js`, `tests/test-standalone-desktop-contract.js`, `tests/test-standalone-linux-sandbox-workflow.js`; `cargo test`, Clippy | Der Rust-Code hat keine plattformabhängigen Zweige; übersetzt und bedient ist nur Windows. Beenden über das App-Menü unter macOS geht nicht über die Rückfrage. Der gemeinsame Core und Cowork sind unverändert. Build-Fingerprint ändert sich. |
| `2ce74b9f` | R-032, A-032 | `frontend/workspace.js`: Nach jedem Befehl, der Arbeit startet oder fortsetzt, gilt der Stand als unbekannt, bis ein danach begonnener Status gelesen ist; eine gesetzte Pause zählt sofort. Dokumente nachgezogen. | `tests/test-standalone-workspace.js` (534, darunter 15 Abläufe der Rückfrage); 42 Verfälschungen erkannt; nativer Lauf am Paket `721512f0…` | Nur Standalone, alle Ziele; nur unter Windows bedient. |

Runde vom 25.11. nachmittags (BEFUNDE.md, „Runde vom 25.11. nachmittags“ und die Abschnitte zu R-033):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `d41a042b`, `34de4509` | R-032 | `frontend/workspace.js`: Die Rückfrage beim Schließen bleibt bestehen, solange eine Antwort der geführten Prüfung unterwegs ist oder die Verbindung zum Core fehlt; eine Antwort wird unmittelbar vor ihrem Versand gezählt (`workBegins`, `workReturns`). | `tests/test-standalone-workspace.js` | Nur Standalone, alle Ziele; nur unter Windows bedient. |
| `49add216`, `b755e208` | R-013 | `tauri-contract/src/diagnostic_bundle.rs`, `export_directory.rs`: Das Diagnosepaket listet bis zu 2 048 statt 128 Einträge des Protokollordners; ein Test hält die Grenze fest. | Rust-Tests | Rust; nur für Windows übersetzt und getestet. |
| `52dee47c` | R-023 | `tauri-contract/Cargo.lock`: `url` 2.5.9 und `cookie` 0.18.3. | `cargo test`, Paketbau | Alle Ziele; nur für Windows übersetzt. |
| `fc10973e`, `927fb3bd` | R-023 | `scripts/audit-standalone-dependencies.mjs`, `docs/TESTING.md`: `npm run audit:standalone` prüft auch die Rust-Crates der Lock-Datei und lehnt einen Bericht ab, der die Lock-Datei nicht beschreibt. | lokal ausgeführt | Kein Bestandteil der Suite. |
| `39f2b3aa`, zurückgenommen in `22c34dcb` | R-003 | `ooxml.js`, `word-content-context.js`: Ausgabe alter Formular-Kontrollkästchen; zurückgenommen, weil das Zeichen die Erkennung eines Namens dahinter verhinderte. | `tests/test-docx-inline-run-content.js` (wieder wie vor dem Versuch) | Am Endstand keine. |
| `405eb370` | R-020 | `tauri-contract/src/main.rs`: Seitenzoom des Hauptfensters unter Windows über WebView2, ohne neue Berechtigung; `docs/canonical/STANDALONE_SECURITY_MODEL.md`. | `tests/test-standalone-desktop-contract.js`; nativ beobachtet | Nur Windows; macOS und Linux offen (Entscheidung). |
| `3ba2b8fb`, Test `997b55bc` | R-033, R-027 | `privacy/base.js`, `entities.js`, `engine.js`, `gateway/privacy-text-operation.js`: Die Regeln für abgekürzte Labels und Titel lesen den Punkt auch in der Schreibweise `\.`; Zugangsdaten in Anführungszeichen werden ganz ersetzt. Dokumente nachgezogen. | `tests/test-privacy-office-markdown-abbreviations.js`, `tests/test-privacy-inline-credentials.js`, `tests/test-sensitive-field-coverage.js` | Gemeinsamer Kern, beide Produkte. |
| `33595449` | R-032 | `docs/canonical/STANDALONE_SECURITY_MODEL.md`: Eine Aufbewahrung von 0 Tagen tritt im Standalone-Paket nicht auf. Kein Code. | `npm run test:docs` | — |

Runden vom 25.11. abends bis zur dreizehnten Übergabe (BEFUNDE.md, Abschnitte zu R-033, „R-019 und R-034 · Frühere Oberfläche entfernt“ und „R-035 und R-036 · Umsetzung“):

| Commit | Befund | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| `1c8e971c` | R-033 (b bis d) | `privacy/person-ambiguities.js`: Name hinter einer Rolle, Namensliste unter einem Label, derselbe Name an weiteren Stellen (`ROLE_CUE`, `roleLabelNameSpans`, `labelledNameListSpans`); `gateway/privacy-text-operation.js`; `privacy/base.js` (`Rückruf unter`); `privacy/entities.js` (maskierte Klammer). Dokumente nachgezogen. | `tests/test-privacy-role-labels-and-name-lists.js` (am Endstand 9 Fälle); Differenzläufe | Personenhinweise nur Standalone; Telefonlabel und maskierte Klammer in beiden Produkten. |
| `0bd5e26f` | R-033 | `privacy/structured.js`: `findStructuredSpans` liest Platzhalter ein zweites Mal so, wie die Schlussprüfung sie liest; `gateway/privacy-text-operation.js`. Behebt den Stopp bei `Label Name Nummer`. | derselbe Test; Suchlauf mit 19 440 Fällen | Gemeinsamer Kern, beide Produkte. |
| `8cf5dd93` | R-034 | `frontend/workspace.js`: vier Fehlercodes des Core haben einen eigenen Satz. | `tests/test-standalone-workspace.js` | Nur Standalone, alle Ziele. |
| `1d908311` | R-019 | Entfernt: `frontend/index.html`, `app.js`, `styles.css`, `tests/test-standalone-frontend.js`, `tests/manual/standalone-ui-browser.mjs`. Die Vertragstests lesen die geladenen Skripte; `package.json`, `tests/run-product-suite.js` und vier Dokumente nachgezogen. | Suite mit 366 Dateien; `tests/test-standalone-loaded-frontend-contract.js` (5) | Der eingebettete Ordner ändert sich für alle Ziele; Rust-Quellen unverändert; nur für Windows gebaut. |
| `d474a579` | R-035, R-036 | `frontend/workspace.js`, `workspace.css`: Hinweis auf ein Netzlaufwerk nach der Ordnerwahl; Name und Grund abgelehnter Dateien; fünf weitere Fehlertexte. `docs/canonical/TRACEABILITY.md`. | `tests/test-standalone-workspace.js` (540) | Nur Standalone, alle Ziele; nur für Windows gebaut. |

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
- **R-033, Rest** – voller Name in Prosa ohne Hinweisverb, einzelner
  Nachname, Telefonnummer ohne Label, Geburtsname. Der Kern erkennt Namen an
  der Form; jede weitere Regel tauscht Unterredaktion gegen Überredaktion.
  Produktentscheidung.
- **R-035, Netzlaufwerk nur am UNC-Pfad** – vorbestehendes Verhalten des
  Core; nach Entscheidung des Anwenders vorerst belassen.
- **Vier native Befehle ohne Aufrufer** (`remove_admitted_source`,
  `open_review_window`, `open_local_ledger`, `shutdown`) – sie zu entfernen
  ändert die Hülle für drei Betriebssysteme; eigene Entscheidung.
- **Erledigt, früher hier geführt: R-019, Tests der alten Oberfläche** – am
  25.11. nachts auf Entscheidung des Anwenders mit der Oberfläche entfernt
  (`1d908311`).

## Tests und Nachweise

Alle Läufe auf Windows 11 x64 mit Node 22.23.2. Logs liegen lokal. Die
ersten Zeilen gelten dem Endstand `d474a579`, die folgenden halten die
früheren Stände fest. Die elfte und die zwölfte Übergabe haben denselben
Produktstand (`1d908311`); die zwölfte hat nur den Bericht ergänzt.

| Bereich | Exakter Befehl und Teststand | Umgebung und Architektur | Ergebnis und Exitcode | Beobachtung |
| --- | --- | --- | --- | --- |
| Headless, Endstand | `npm run test:product:headless` auf `d474a579` | Windows x64 | `PASS`, 0 | „Product headless suite passed (366 headless files, no native GUI executed).“ 23:55 bis 00:45 Uhr. |
| Rust / Clippy, Endstand | nicht erneut ausgeführt | — | — | Rust-Quellen sind seit `927fb3bd` unverändert; zuletzt am Stand `1d908311` ausgeführt (339 bestanden). Der Release-Build mit `--locked` ist für das Paket neu gelaufen. |
| Datenschutzkern, Differenzläufe und Suchlauf, Endstand | nicht erneut ausgeführt | — | — | Seit `0bd5e26f` ist kein Core-Code geändert (`git diff --stat 0bd5e26f d474a579 -- plugins native` ist leer). |
| Gezielt, Endstand | `tests/test-standalone-workspace.js` (540, davon fünf neu), `tests/test-standalone-desktop-contract.js` (43), `tests/test-standalone-loaded-frontend-contract.js` (5), `tests/test-standalone.js` (91), `tests/test-standalone-document-review-frontend.js` (308), `tests/test-standalone-review-frontend.js` (74) | Windows x64 | je `PASS`, 0 | Die fünf neuen Tests schlagen an der Oberfläche von `1d908311` fehl. Ein erster Lauf endete ohne Ergebniszeile, weil `workspace.js` durch wörtlich geschriebene Steuerzeichen nicht lesbar war; vor dem Commit behoben. |
| Dokumentation, Endstand | `npm run test:docs` auf `d474a579` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden (31, 3, 6, 5 und 3 Tests); nach dem Berichtscommit wiederholt. |
| Konverter, Endstand | nicht erneut ausgeführt | — | — | Kein Konverter- und kein Core-Code geändert; zuletzt am Stand `1d908311` ausgeführt. |
| Windows x64 Paket, Endstand | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `d474a579` | Windows x64 | je `PASS`, 0 | Paket `f641f720058cfee66842430d9bd1058dd33ed87e71ea7e7dc5940f1a4b688dd9`, 113 618 432 Bytes, 1 203 Einträge, Build `6ba59a6f`. Der Smoke-Test lief ungestört. |
| Windows x64 Start mit Außenverbindungsprüfung, Endstand | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `f641f720…` | Windows x64, isoliertes Profil | `PASS`, 0 | Start 1 832 ms; 76 896 ms beobachtet, 4 844 Stichproben, 0 Lesefehler, IPv6-Kontrolle, 0 Verbindungen, 0 Loopback-Versuche, 0 TCP-Listener, 0 UDP-Endpunkte, 10 Prozesse. |
| Windows x64 Oberfläche, Endstand | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `f641f720…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Runde zu R-035 und R-036“ unter dem nativen Lauf. |
| Cowork-Plugin, Endstand | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `67d60834` (Stand `d474a579`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `8c8f2bc4…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Oberfläche gehört nicht zum Plugin. |
| `git diff --check`, Endstand | `git diff --check 54c1f176 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der elften und zwölften Übergabe | `npm run test:product:headless` auf `1d908311` | Windows x64 | `PASS`, 0 | „Product headless suite passed (366 headless files, no native GUI executed).“ 21:48 bis 22:38 Uhr. Eine Datei weniger: `tests/test-standalone-frontend.js` ist mit der früheren Oberfläche entfernt. |
| Rust / Clippy, Stand der elften und zwölften Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract` auf dem Stand von `1d908311` | Windows x64 | je `PASS`, 0 | 339 bestanden, 0 fehlgeschlagen, 3 ignoriert. Rust-Quellen sind unverändert; ausgeführt, weil der eingebettete Ordner der Oberfläche kleiner geworden ist. |
| Datenschutzkern, Differenzläufe und Suchlauf, Stand der elften und zwölften Übergabe | nicht erneut ausgeführt | — | — | Seit `0bd5e26f` ist kein Core-Code geändert (`git diff --stat 0bd5e26f 1d908311 -- plugins native` ist leer); es gelten die Läufe der zehnten Übergabe. |
| Gezielt, Stand der elften und zwölften Übergabe | 53 Testdateien der Suite, die Oberfläche, Paket oder die geänderten Dokumente berühren, darunter `tests/test-standalone-desktop-contract.js` (43), `tests/test-standalone-workspace.js` (535), `tests/test-standalone-loaded-frontend-contract.js` (5), `tests/test-standalone.js` (91), `tests/test-native-smoke-integrity.js` (83) | Windows x64 | 51 `PASS`; 2 nur mit den Parametern des Suite-Runners | Die zwei übrigen (`test-macos-core-artifact-provenance.mjs`, `test-native-macos-static-core.mjs`) brauchen ein Node-Flag beziehungsweise einen Mac; in der Suite laufen sie wie vorgesehen. |
| Dokumentation, Stand der elften und zwölften Übergabe | `npm run test:docs` auf `1d908311` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden (31, 3, 6, 5 und 3 Tests); nach dem Berichtscommit wiederholt. |
| Konverter, Stand der elften und zwölften Übergabe | `npm run test:standalone:conversion` auf `1d908311` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; 21 passive PDF-Gruppen. Kein Konvertercode geändert; ausgeführt, weil es zum Standardumfang gehört. |
| Windows x64 Paket, Stand der elften und zwölften Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `1d908311` | Windows x64 | je `PASS`, 0 | Paket `e309421320dbaa79dcb734a598924c6abe60236e5f501a437b19a0738f0fb91b`, 113 616 680 Bytes, 1 203 Einträge, Build `383aa344`. Der Smoke-Test lief ungestört. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der elften und zwölften Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `e3094213…` | Windows x64, isoliertes Profil | `PASS`, 0 | Start 1 855 ms; 76 820 ms beobachtet, 4 877 Stichproben, 0 Lesefehler, IPv6-Kontrolle, 0 Verbindungen, 0 Loopback-Versuche, 0 TCP-Listener, 0 UDP-Endpunkte, 10 Prozesse. |
| Windows x64 Oberfläche, Stand der elften und zwölften Übergabe | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `e3094213…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Runde vom 25.11. nachts“ unter dem nativen Lauf. |
| Cowork-Plugin, Stand der elften und zwölften Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `440da4d3` (Stand `1d908311`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `d30bb0f7…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Oberfläche gehört nicht zum Plugin; ausgeführt, weil `package.json` und gemeinsame Tests geändert sind. |
| `git diff --check`, Stand der elften und zwölften Übergabe | `git diff --check c612b647 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der zehnten Übergabe | `npm run test:product:headless` auf `0bd5e26f` | Windows x64 | `PASS`, 0 | „Product headless suite passed (367 headless files, no native GUI executed).“ 19:44 bis 20:40 Uhr. |
| Rust / Clippy, Stand der zehnten Übergabe | nicht erneut ausgeführt | — | — | Seit `927fb3bd` ist keine Rust-Quelle geändert (`git diff --stat 927fb3bd 0bd5e26f -- apps/datasecure-standalone/tauri-contract` ist leer); es gilt der Lauf der achten Übergabe. Der Release-Build mit `--locked` ist für das Paket neu gelaufen. |
| Datenschutzkern, Differenzläufe, Stand der zehnten Übergabe | Scratch-Skripte: RC178-Kern gegen `0bd5e26f`, 18 600 Fälle in fünf Profilen, einmal wie geschrieben, einmal mit jedem Punkt als `\.`; Kern von `33595449` gegen `0bd5e26f`, 1 230 Zeilen mit Schützenswertem und 240 personenfreie Zeilen | Windows x64 | 0 neue Stopps in allen drei Läufen; „mehr sichtbar“ nur die zehn gewollten Fälle von R-024 | Dieselben Zahlen wie am Stand der neunten Übergabe. |
| Datenschutzkern, Suchlauf „derselbe Name an zwei Stellen“, Stand der zehnten Übergabe | dasselbe Scratch-Skript wie am Stand der neunten Übergabe; Kern von `33595449` gegen `0bd5e26f`, fünf Profile, dazu Profil Allgemein mit maskierten Zeichen | Windows x64 | 19 440 Fälle: **0 neue Stopps**, 0 mehr sichtbar, 11 096 weniger sichtbar | 356 Fälle, die am Kern von `33595449` stoppten, laufen jetzt durch. Maskiert: 3 888 Fälle, 0 neue Stopps, 40 behobene. Am Stand der neunten Übergabe waren es 1 608 neue Stopps. |
| Gezielt, Stand der zehnten Übergabe | 106 Testdateien der Suite, die den Datenschutzkern laden, dazu `tests/test-pii-regression.js` (164 Fälle) und `tests/test-privacy-role-labels-and-name-lists.js` (9) | Windows x64 | je `PASS`, 0 | Vor der Suite einzeln ausgeführt, drei nebeneinander. Der neue neunte Test schlägt am Kern von `1c8e971c` fehl. |
| Dokumentation, Stand der zehnten Übergabe | `npm run test:docs` auf `0bd5e26f` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden (31, 3, 6, 5 und 3 Tests); nach dem Berichtscommit wiederholt. |
| Konverter, Stand der zehnten Übergabe | `npm run test:standalone:conversion` auf `0bd5e26f` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; 21 passive PDF-Gruppen; hinterlässt `.tmp-standalone-package-*`-Ordner im Repository-Root, danach entfernt. |
| Windows x64 Paket, Stand der zehnten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `0bd5e26f` | Windows x64 | je `PASS`, 0 | Paket `9ea88aab7fdf576535246ed5b7e066974cc9c48a8b843b47a3228ae64fb5ac4c`, 113 638 825 Bytes, 1 203 Einträge, Build `5c873336`. Der Smoke-Test lief ungestört. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der zehnten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `9ea88aab…` | Windows x64, isoliertes Profil | `PASS`, 0 | Start 1 982 ms; 76 913 ms beobachtet, 4 650 Stichproben, 0 Lesefehler, IPv6-Kontrolle, 0 Verbindungen, 0 Loopback-Versuche, 0 TCP-Listener, 0 UDP-Endpunkte, 10 Prozesse. |
| Windows x64 Oberfläche, Stand der zehnten Übergabe | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `9ea88aab…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Runde vom 25.11. spät“ unter dem nativen Lauf. |
| Cowork-Plugin, Stand der zehnten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `3d0697f2` (Stand `0bd5e26f`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `25cd1e36…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Korrektur an `findStructuredSpans` ist im Plugin enthalten und wirkt dort ebenso. |
| `git diff --check`, Stand der zehnten Übergabe | `git diff --check ec0867a9 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der neunten Übergabe | `npm run test:product:headless` auf `1c8e971c` | Windows x64 | `PASS`, 0 | „Product headless suite passed (367 headless files, no native GUI executed).“ 17:58 bis 18:52 Uhr. Die neue Testdatei `tests/test-privacy-role-labels-and-name-lists.js` ist die 367. Datei. |
| Rust / Clippy, Stand der neunten Übergabe | nicht erneut ausgeführt | — | — | Seit `927fb3bd` ist keine Rust-Quelle geändert (`git diff --stat 927fb3bd 1c8e971c -- apps/datasecure-standalone/tauri-contract` ist leer); es gilt der Lauf der achten Übergabe. Der Release-Build mit `--locked` ist für das Paket neu gelaufen. |
| Datenschutzkern, Differenzläufe, Stand der neunten Übergabe | Scratch-Skripte: RC178-Kern gegen `1c8e971c`, 18 600 Fälle in fünf Profilen, einmal wie geschrieben, einmal mit jedem Punkt als `\.`; Kern von `33595449` gegen `1c8e971c`, 1 230 Zeilen mit Schützenswertem und 240 personenfreie Zeilen | Windows x64 | 0 neue Stopps in allen drei Läufen; „mehr sichtbar“ nur die zehn gewollten Fälle von R-024 | Gegen RC178 5 356 Fälle mit weniger Klartext (maskiert 5 396), 420 behobene Stopps. Gegen den Kern der achten Übergabe 774 Fälle mit weniger Klartext, 288 bleiben sichtbar, 6 von 240 personenfreien Zeilen zusätzlich ersetzt. |
| Datenschutzkern, Suchlauf „derselbe Name an zwei Stellen“, Stand der neunten Übergabe | Scratch-Skript: sechs Hinweiszeilen mal 54 Umgebungen mal vier Namen, als ein Dokument in beiden Reihenfolgen und als zwei Dokumente eines Stapels; Kern von `33595449` gegen `1c8e971c`, fünf Profile, dazu Profil Allgemein mit maskierten Zeichen | Windows x64 | 19 440 Fälle: 0 mehr sichtbar, 9 488 weniger sichtbar, **1 608 neue Stopps** | Alle neuen Stopps sind `RESIDUAL_PII` in sieben Umgebungen der Form Label, Name, Nummer (`Tel. Hans Müller 030 …`). Vorher liefen diese Fälle durch und gaben Name und Nummer frei. Maskiert: 3 888 Fälle, 0 mehr sichtbar, 284 neue Stopps derselben Art. Siehe BEFUNDE.md. |
| Gezielt, Stand der neunten Übergabe | 106 Testdateien der Suite, die den Datenschutzkern laden, dazu `tests/test-pii-regression.js` (164 Fälle) und `tests/test-privacy-role-labels-and-name-lists.js` (8) | Windows x64 | je `PASS`, 0 | Vor der Suite einzeln ausgeführt, vier nebeneinander. Die neue Testdatei schlägt am Kern von `33595449` in 5 von 8 Tests fehl; die drei übrigen sind Gegenfälle. Ein früherer Lauf am Zwischenstand hatte einen Ausfall (`test-office-image-ocr.mjs`, `CONVERSION_RUNTIME_UNAVAILABLE`), während eine Gegenprüfung parallel lief; am Endstand bestanden. |
| Dokumentation, Stand der neunten Übergabe | `npm run test:docs` auf `1c8e971c` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden (31, 3, 6, 5 und 3 Tests). |
| Konverter, Stand der neunten Übergabe | `npm run test:standalone:conversion` auf `1c8e971c` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; 21 passive PDF-Gruppen; hinterlässt zwei `.tmp-standalone-package-*`-Ordner im Repository-Root, danach entfernt. |
| Windows x64 Paket, Stand der neunten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `1c8e971c` | Windows x64 | je `PASS`, 0 | Paket `24a510dfc596ba5ae55b88c8d3068b77ec0502b95751d3b3658c0e8e950b3fa5`, 113 638 455 Bytes, 1 203 Einträge, Build `b8ea7acd`. Der Smoke-Test lief ungestört. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der neunten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `24a510df…` | Windows x64, isoliertes Profil | `PASS`, 0 | Start 1 876 ms; 76 787 ms beobachtet, 4 594 Stichproben, 0 Lesefehler, IPv6-Kontrolle, 0 Verbindungen, 0 Loopback-Versuche, 0 TCP-Listener, 0 UDP-Endpunkte, 10 Prozesse. |
| Windows x64 Oberfläche, Stand der neunten Übergabe | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `24a510df…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Runde vom 25.11. abends“ unter dem nativen Lauf. |
| Cowork-Plugin, Stand der neunten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `0a4da43a` (Stand `1c8e971c`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `1bdec13d…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderungen am Datenschutzkern sind im Plugin enthalten; dort wirken das Telefonlabel `Rückruf unter` und die maskierte Klammer, die Personenhinweise hinter Rollen und in Listen nur im Standalone. |
| `git diff --check`, Stand der neunten Übergabe | `git diff --check eccf9ad3 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der achten Übergabe | `node tests/run-product-suite.js headless` auf `997b55bc` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (366 headless files, no native GUI executed)“; 15:12–16:02 am 25.11. Parallel lief nichts außer dem Schreiben dieses Berichts in Scratch-Dateien. Ein erster Lauf auf `3ba2b8fb` stoppte an einer festgeschriebenen Prüfsumme (übernächste Zeile). `33595449` ändert danach nur einen Dokumentabsatz. |
| Rust / Clippy, Stand der achten Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract`, Rust-Quellen von `927fb3bd` | Windows x64 | je `PASS`, 0 | 339 bestanden, 0 fehlgeschlagen, 3 ignoriert. Spätere Commits ändern keine Rust-Datei. Nur das Windows-Ziel. |
| Datenschutzkern, Differenzläufe, Stand der achten Übergabe | Scratch-Skripte: RC178-Kern gegen `3ba2b8fb`, 18 600 Fälle in fünf Profilen, einmal wie geschrieben, einmal mit jedem Punkt als `\.`; Kern von `927fb3bd` gegen `3ba2b8fb`, 9 600 Fälle mit Zugangsdaten in Anführungszeichen | Windows x64 | 0 neue Stopps in allen drei Läufen | „Mehr sichtbar“ nur die zehn gewollten Fälle von R-024; 420 behobene Stopps wie zuvor; mit maskiertem Punkt 5 314 Fälle mit weniger Klartext; bei den Zugangsdaten 2 700. Kein Bestandteil des Repositorys; erfundene Sätze aus wenigen Bausteinen. |
| R-033, Text gegen Word | Scratch-Skript: 24 Zeilen je einmal als Text und aus einem erzeugten DOCX, Extraktor und Kern am RC178-Stand und am Endstand; im Repository `tests/test-privacy-office-markdown-abbreviations.js` | Windows x64 | RC178: 7 von 24 anders; Endstand: 0 | Der neue Test schlägt am Stand vor `3ba2b8fb` fehl. |
| Gezielt, Stand der achten Übergabe | 106 Testdateien der Suite, die den Datenschutzkern laden, dazu `tests/test-standalone-workspace.js` (535), `tests/test-standalone-desktop-contract.js` (43) | Windows x64 | je `PASS`, 0 | Der erste Suite-Lauf auf `3ba2b8fb` stoppte nach zwei Minuten an `tests/test-sensitive-field-coverage.js`: Der Test schreibt die Prüfsumme der Label-Ausdrücke fest, die `3ba2b8fb` bewusst geändert hat. `997b55bc` trägt die neuen Werte ein. Danach liefen diese 106 Dateien vorab, vier gleichzeitig. |
| Verfälschungsprobe R-032, Stand der achten Übergabe | zwei Scratch-Skripte: 42 und 13 gezielte Änderungen der Schließ-Logik in `frontend/workspace.js`, je `tests/test-standalone-workspace.js` | Windows x64 | 53 von 55 erkannt | Nicht erkannt: ein Absicherungszweig nach fehlgeschlagener Pause und die Laufbindung der übernommenen Pause. |
| Gegenprüfungen dieser Runde | fünf unabhängige Read-only-Läufe (Schließ-Logik; Hülle, Diagnosepaket, Zoom und Prüfskript; Kontrollkästchen; Zugangsdaten in Anführungszeichen; maskierter Punkt) | Windows x64 | Einwände in jedem Lauf, zwei davon schwer (Kontrollkästchen verhindert Namenserkennung; offener Personenhinweis im Wert) | Ergebnis je Lauf in BEFUNDE.md. Die letzte Ergänzung des Kerns (`z. Hd.`, Nummernlabels) ist nicht erneut gegengeprüft. |
| Abhängigkeiten, Stand der achten Übergabe | `npm run audit:standalone` mit `cargo-audit 0.23.0` im Pfad | Windows x64, online | `PASS`, 0 | 445 Crates gegen 1 568 Advisories, 0 Befunde, 10 Hinweise; vier paketierte JavaScript-Lockfiles 0 Befunde; Entwicklungsabhängigkeiten 10 Befunde wie zuvor. Am Lock der vorigen Übergabe: `FAIL` mit `url` und `cookie`. |
| Dokumentation, Stand der achten Übergabe | `npm run test:docs` auf dem Stand von `33595449` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden; die beiden Dokumenttests nach dem Dokumentcommit wiederholt. |
| Konverter, Stand der achten Übergabe | `npm run test:standalone:conversion` auf dem Stand von `33595449` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; 21 passive PDF-Gruppen; hinterlässt zwei `.tmp-standalone-package-*`-Ordner, die ich entfernt habe. |
| Windows x64 Paket, Stand der achten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `3ba2b8fb` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `0d6bccd0313acb29935d3708094edf7bc8cac511b9fcaa695d36849b10150549`, 113 635 134 Bytes, 1 203 Einträge, Build `46dd498f`. Der Smoke-Test eines vorläufigen Pakets schlug fehl, weil ich währenddessen seinen Arbeitsordner gelöscht hatte. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der achten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `0d6bccd0…` | Windows x64, online mit IPv6 | `PASS`, 0 | Start 1 800 ms, Beobachtungsfenster 77 s, 4 873 Stichproben, kein Lesefehler, keine Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. |
| Windows x64 Oberfläche, Stand der achten Übergabe | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `0d6bccd0…`; davor ein vorläufiges Paket (`a7b443a2…`) | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Runde vom 25.11. nachmittags“ |
| Cowork-Plugin, Stand der achten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `9dc22477` (Stand `33595449`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `d18f690d…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderung am Datenschutzkern (`3ba2b8fb`) ist im Plugin enthalten. |
| `git diff --check`, Stand der achten Übergabe | `git diff --check 7de6aba6 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der siebten Übergabe | `node tests/run-product-suite.js headless` auf `2ce74b9f` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 09:58–10:51 am 25.11. Parallel liefen nur das Abdeckungswerkzeug und kleine Prüfskripte für diesen Bericht. |
| Rust / Clippy, Stand der siebten Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract`, Rust-Quellen von `5f670a20` | Windows x64 | je `PASS`, 0 | 338 bestanden, 0 fehlgeschlagen, 3 ignoriert (fünf neue Tests der Schließanfrage). `2ce74b9f` ändert keine Rust-Datei. Nur das Windows-Ziel. |
| Gezielt, Stand der siebten Übergabe | `tests/test-standalone-workspace.js` (534), `tests/test-standalone-desktop-contract.js` (42), `tests/test-standalone-linux-sandbox-workflow.js`, dazu die übrigen zehn Testdateien, die die Standalone-Oberfläche lesen | Windows x64 | je `PASS`, 0 | Neu: 15 Abläufe der Rückfrage beim Schließen, ein Quelltextvertrag der Hülle. |
| Verfälschungsprobe R-032 | Scratch-Skript: 42 gezielte Änderungen der Schließ-Logik in `frontend/workspace.js`, je `tests/test-standalone-workspace.js`; die Datei wird danach wiederhergestellt | Windows x64 | alle 42 erkannt | Kein Bestandteil des Repositorys. Vier absichernde Zeilen haben keinen eigenen Test (BEFUNDE.md). Die Frist der Hülle ist nur am Quelltext festgehalten. |
| Fachsichten und Gegenprüfungen R-032 | drei unabhängige Read-only-Läufe vor der Entscheidung (Laufzeit, Datenschutz, Bedienung); zwei auf dem Arbeitsstand vor `5f670a20`; einer auf `5f670a20` | Windows x64 | vor der Entscheidung übereinstimmend „Schließen an das vorhandene Pausieren binden“; danach 13 Einwände, zuletzt kein Zustand ohne Schließmöglichkeit | Einwände und ihr Ergebnis in BEFUNDE.md. Die Änderungen nach der letzten Gegenprüfung (`2ce74b9f`) sind nicht erneut gegengeprüft. |
| Dokumentation, Stand der siebten Übergabe | `npm run test:docs` auf `2ce74b9f` | Windows x64 | `PASS`, 0 | Fünf Testdateien bestanden; nach dem Berichtscommit wiederholt. |
| Konverter, Stand der siebten Übergabe | nicht erneut ausgeführt | — | — | Seit `56d7c744` ist kein Konverter- und kein Core-Code geändert (`git diff --stat 56d7c744 2ce74b9f -- plugins native` ist leer); es gilt der Lauf auf `56d7c744`. |
| Windows x64 Paket, Stand der siebten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `2ce74b9f` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `721512f002c7f51c8080024805492744c5bf4ea3718741a99fbfe40c67e4963d`, 113 633 747 Bytes, 1 203 Einträge, Build `ebc54e3c`. Die Pakete der Vorstände wurden vorher aus `dist/` verschoben. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der siebten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertReviewWindow -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence` gegen das Paket `721512f0…` | Windows x64, online mit IPv6 | `PASS`, 0 | Start 2 127 ms, Beobachtungsfenster 77 s mit Haupt- und Prüffenster, 2 841 Stichproben, kein Lesefehler, keine Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. Der Abbau der Probe schließt das Fenster über die neue Schließanfrage; Wartezeit 154 ms von 20 000 ms. |
| Windows x64 Oberfläche, R-032 | eigenes Startskript, Bedienung per Windows-UI-Automation, Paket `721512f0…`; davor ein vorläufiges Paket der ersten Fassung (`a89c9a5d…`) | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „R-032“ |
| Cowork-Plugin, Stand der siebten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `3ff9fc07` (Produktstand `2ce74b9f`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `5b98d468…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderung berührt das Plugin nicht (Standalone-Hülle und -Oberfläche, Tests, Dokumente). |
| `git diff --check`, Stand der siebten Übergabe | `git diff --check aa102cb5 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
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
| Windows x64 Paket, Stand der fünften Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `56d7c744` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `1c672ef4be13f55858a580d2b73782b0b627bfbcfcac31761ded7ec0f86c4495`, 113 628 275 Bytes, 1 203 Einträge, Build `9fe7076e`. Das Paket des vorherigen Stands (`cec20d6e…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start mit Außenverbindungsprüfung, Stand der fünften Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertWorkspace -AssertNoListeners -AssertNoOutbound -EmitEvidence`; dasselbe mit `-AssertReviewWindow`; dasselbe gegen das Paket `cec20d6e…` | Windows x64, online mit IPv6 | neues Paket `PASS`, 0 (Haupt- und Prüffenster); bisheriges Paket `FAIL` wie verlangt (`STANDALONE_NATIVE_NETWORK_OUTBOUND_DETECTED`) | Neues Paket: Fenster 77 s, 3 165 und 2 477 Stichproben, kein Lesefehler, keine Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. Bisheriges Paket: WebView2, IPv6, Port 443. |
| Windows x64 Messung, Stand der fünften Übergabe | `tests/manual/measure-standalone-native-windows.ps1 -Archive … -ExpectedSha256 1c672ef4… -Iterations 3 -AssertNoListeners -AssertNoOutbound` | Windows x64 | `PASS`, 0 | p50 1 948 ms, 0 TCP-Listener, kein UDP-Endpunkt, keine Verbindung nach außen in drei Starts mit je 77 s Beobachtung. |
| Netzverkehr, Stand der fünften Übergabe | Scratch-Skript wie beim vorherigen Stand: Paket `1c672ef4…`, 600 s Betriebssystemtabellen mit einem Verarbeitungslauf; 100 s mit Netzprotokoll von Chromium | Windows x64, online mit IPv6, WebView2 158.0.4370.33 | beobachtet, keine Abnahme | 20 814 Stichproben, kein TCP- und kein UDP-Endpunkt. Netzprotokoll: keine Anfrage nach außen; aufgelöst nur `tauri.localhost`; ein UDP-Socket ohne gesendetes Paket; ein Versuch zu `localhost:80`. Kein Bestandteil des Repositorys. |
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
| Windows x64 Paket, Stand der vierten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs` auf `b71439b2`; `node tests/test-standalone-package-smoke.mjs` auf `0b99529c` gegen dasselbe Paket | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `cec20d6e528dec4e039f8dac058b036a2e5fa5e1c574ad363e4b94d8d38b2346`, 113 627 095 Bytes, 1 203 Einträge, Build `b4466f2a`. Das Paket des vorherigen Stands (`b30c5511…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start, alte Probe | instrumentierte Kopie von `tests/manual/standalone-native-windows-launch.ps1` am Stand `e92d5b12`, `-Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence`, 11 Läufe gegen das Paket `b30c5511…` | Windows x64 | 8 `FAIL` (`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`), 3 `PASS` | In allen acht Fällen dieselben Merkmale: WebView2-Netzwerkdienst, gültige Microsoft-Signatur, `own_profile: false` wegen `…\webview\main\EBWebView` (R-029). Die Kopie liegt außerhalb des Repositorys. |
| Windows x64 Start, Stand der vierten Übergabe | dieselbe Probe am Stand `0b99529c`, 14 Läufe gegen das Paket `cec20d6e…`; davor 12 Läufe einer Vorfassung gegen `b30c5511…` | Windows x64 | 14 von 14 `PASS`, 0; Vorfassung 12 von 12 | Kein TCP-Listener (er hätte die Probe abgebrochen); in 4 der 14 Läufe ein zugeordneter UDP-Endpunkt (`["msedgewebview2.exe"]`), sonst keiner. Abbau-Wartezeit 138 bis 273 ms von 20 000 ms. |
| Windows x64 Messung, Stand der vierten Übergabe | `tests/manual/measure-standalone-native-windows.ps1 -Archive … -ExpectedSha256 cec20d6e… -Iterations 10 -AssertNoListeners` am Stand `0b99529c` | Windows x64 | `PASS`, 0; am Stand `b11a6131` `FAIL` in Wiederholung 1 | p50 1 993 ms, p95 2 015 ms, 0 TCP-Listener, kein UDP-Endpunkt in dieser Serie. Der Fehlschlag davor ist der zweite Teil von R-030 (Zeile der App auf dem Fehlerkanal). Die Messung mit 30 Starts habe ich nicht ausgeführt. |
| Windows x64 Oberfläche, R-028 | eigenes Startskript nach dem Muster von `tests/manual/standalone-native-workspace-gui.ps1` mit einem Halterprozess (Löschzugriff auf einen Ordner des Testprofils), Bedienung per Windows-UI-Automation, Pakete `b30c5511…` und `cec20d6e…` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“, Abschnitt „Nach R-028 bis R-030“ |
| Cowork-Plugin, Stand der vierten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `14e3d87b` (Produktstand `0b99529c`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `5c669b7c…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. Die Änderungen dieser Runde berühren das Plugin nicht (Rust-Shell, Standalone-Oberfläche, Prüfskripte). |
| Netzverkehr, Stand der vierten Übergabe | Scratch-Skript: Paket `cec20d6e…` im isolierten Profil, Betriebssystemtabellen für TCP und UDP je Prozess rund alle 23 ms, Positivkontrolle je Lauf; 600 s unverändert, 280 s mit Netzprotokoll von Chromium, je ein Versuch mit zwei und mit fünf zusätzlichen Startschaltern (100 s und 150 s) | Windows x64, online mit IPv6, WebView2 158.0.4370.33 | beobachtet, keine Abnahme | Unverändert: HTTPS zu `config.edge.skype.com` (2 Anfragen beim Start) und `edge.microsoft.com` (8 Anfragen des Komponenten-Updaters in 280 s), Auflösung von `wpad`; Shell und Core ohne Verbindung. Mit den Schaltern keine Anfrage nach außen, App arbeitsbereit, mit fünf Schaltern ein Verarbeitungslauf abgeschlossen. Kein Bestandteil des Repositorys. R-031. |
| `git diff --check`, Stand der vierten Übergabe | `git diff --check e92d5b12 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
| Headless, Stand der dritten Übergabe | `node tests/run-product-suite.js headless` auf `283e6ed9` (entspricht `npm run test:product:headless`) | Windows x64 | `PASS`, 0 | „Product headless suite passed (365 headless files, no native GUI executed)“; 23:19–00:13. Parallel liefen zeitweise der Differenzlauf, `cargo test`, Clippy und die Zufallsläufe der fünften Gegenprüfung, dazu durchgehend ein hängengebliebener Python-Prozess aus dieser Sitzung (gestartet 18:49, vermutlich von einer früheren Gegenprüfung; belegt einen von 16 Kernen und läuft noch, weil mir das Beenden nicht erlaubt wurde). `ebe526ec` kam danach und ändert nur ein Dokument; die Dokumenttests liefen darauf erneut. |
| Headless, Stand der zweiten Übergabe | derselbe Befehl auf `ffab4fa7` | Windows x64 | `PASS`, 0 | 364 Dateien; 20:25–21:19, parallel lief der Differenzlauf |
| Headless auf `d5992265` | derselbe Befehl auf `d5992265` | Windows x64 | `PASS`, 0 | 364 Dateien. Die Suite meldete den Fehler der Zuordnung nicht, den `ffab4fa7` behebt. |
| Headless auf `a0d3e340` | derselbe Befehl | Windows x64 | abgebrochen, kein Ergebnis | Von mir nach rund elf Minuten gestoppt, als die Regressionen sichtbar wurden. Für diesen Stand gibt es keinen vollständigen Lauf. |
| Feste Regressionssammlung, Stand der dritten Übergabe | `node tests/make-fixtures.js && node tests/test-pii-regression.js` auf dem Stand von `283e6ed9` | Windows x64 | `PASS`, 0 | 164 Fälle. Am Stand `a0d3e340`: 163 bestanden, 1 fehlgeschlagen. |
| Gezielt, Stand der dritten Übergabe | `tests/test-privacy-inline-credentials.js` (7), `test-privacy-name-variants.js` (10), `test-privacy-time-periods.js` (1), `test-privacy-inflected-names.js` (3), `test-privacy-repeated-phones.js` (2), `test-markdown-retention.js` (15) | Windows x64 | je `PASS`, 0 | Die erste Datei enthält die Gegenfälle der vier widerlegten Fassungen von R-027. Sechs der zehn Fälle der zweiten Datei schlagen am Stand `a0d3e340` fehl, einer am Stand `d5992265`; geprüft an Kopien dieser Stände. |
| Differenzlauf, Stand der dritten Übergabe | Scratch-Skript: Kern von RC178 gegen den Kern von `283e6ed9`, 18 600 synthetische Fälle (93 Satzmuster, darunter 16 mit Zugangsdaten), fünf Profile, einzeln und als Zwei-Dokument-Lauf | Windows x64 | kein neuer Stopp, 10 gewollte Abweichungen (R-024) | 420 Fälle, die RC178 stoppte, laufen durch. Zahlen in BEFUNDE.md. Kein Bestandteil des Repositorys. |
| Fünfte Gegenprüfung zu R-027 | unabhängiger Read-only-Lauf mit eigenen Skripten auf `283e6ed9`: 3 915 handgeschriebene Fälle, 66 000 Zufallsläufe, 1 050 gezielte Fälle | Windows x64 | kein zusätzlich sichtbarer Klartext, kein neuer Stopp, keine Ausnahme | Am Schrittlimit beendet, Bericht auf Nachfrage. Drei Beobachtungen und die nicht mehr geprüften Punkte in BEFUNDE.md; vier davon habe ich selbst nachgeprüft (1 500, 400 und 400 Fälle, Laufzeit). |
| Dokumentation, Stand der dritten Übergabe | `npm run test:docs`, `node tests/test-current-document-links.js`, `node tests/test-current-documentation-contract.js` auf `ebe526ec` | Windows x64 | je `PASS`, 0 | — |
| Konverter, Stand der dritten Übergabe | `npm run test:standalone:conversion` auf `ebe526ec` | Windows x64 | `PASS`, 0 | echte isolierte Konverterkinder; hinterlässt zwei `.tmp-standalone-package-*`-Ordner im Repository-Root, von mir entfernt |
| Rust / Clippy, Stand der dritten Übergabe | `cargo test --locked` und `cargo clippy --all-targets --locked -- -D warnings` in `apps/datasecure-standalone/tauri-contract` auf `283e6ed9` | Windows x64 | je `PASS`, 0 | 326 bestanden, 0 fehlgeschlagen, 3 ignoriert. Nur das Windows-Ziel. R-027 ändert keinen Rust-Code. |
| macOS-Typcheck | `cargo check --locked --all-targets --target aarch64-apple-darwin` auf `a0d3e340` | Windows x64 als Host | `BLOCKED` | 42 Abhängigkeiten geprüft; das Build-Skript des Projekts verlangt den freigegebenen statischen macOS-Core, der hier fehlt. Nicht umgangen. |
| Cowork-Plugin, Stand der dritten Übergabe | `npm run build`, `npm run test:plugin-zip`, `npm run validate:claude-local` | Windows x64 | je `PASS`, 0 | Ausgeführt auf `85fdecf2` (Produktstand `ebe526ec`, dazu nur der Bericht). Plugin-ZIP 319 Einträge, SHA-256 `6d9bc082…`. Der Bau verlangt einen sauberen Arbeitsbaum und lief deshalb nach dem ersten Berichtscommit. |
| Windows x64 Paket, Stand der dritten Übergabe | `node scripts/prepare-standalone-runtime.mjs`, `cargo build --release --locked`, `node scripts/build-standalone-package.mjs`, `node scripts/verify-standalone-package.mjs`, `node tests/test-standalone-package-smoke.mjs` auf `ebe526ec` | Windows x64 | je `PASS`, 0 | ZIP-SHA-256 `b30c5511405bfc05fc09b2f14a04f5ff7155f3d54f281411853cc17cb5e37ffc`, 113 625 220 Bytes, 1 203 Einträge, Build `043e3b81`. Der Paketbau überschreibt nie; das Paket des vorherigen Stands (`bddfe85a…`) wurde vorher aus `dist/` verschoben. |
| Windows x64 Start, Stand der dritten Übergabe | `tests/manual/standalone-native-windows-launch.ps1 -Archive … -AssertWorkspace -AssertNoListeners -EmitEvidence`, sieben Versuche am 24.11. zwischen 00:24 und 00:37 | Windows x64 | Versuche 1 und 2 `FAIL` (`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`), 3 `FAIL` (Entpacken: Pfad nicht gefunden), 4 und 5 `FAIL` (`STANDALONE_NATIVE_WEBVIEW_INITIALIZATION_TIMEOUT`), 6 und 7 `PASS`, 0 | Versuche 1 und 2: R-029, ohne Parallelbetrieb; die Ursache ist seit `dbf98cbf` bekannt und behoben. Versuche 3 bis 5: In dieser Zeit hielt ein fremder Prozess den Temp-Ordner mit Löschzugriff offen; auch das Paket vom Vortag startete dann nicht (R-028). Versuche 6 und 7 nach Ende der Sperre: Start 1,9 s und 1,8 s, 9 Prozesse, 0 TCP-Listener, 0 UDP-Endpunkte. Am Vortag: `d5992265` im ersten Versuch bestanden, `ffab4fa7` im zweiten. |
| Windows x64 Oberfläche, Stand der dritten Übergabe | `tests/manual/standalone-native-workspace-gui.ps1 -Archive …`, Bedienung per Windows-UI-Automation, Builds `0dac7e18`, `1803bce7` und `043e3b81` | Windows x64, isoliertes Profil | beobachtet, keine Abnahme | siehe „Nativer Windows-Lauf“ |
| macOS Apple Silicon | — | — | `BLOCKED` (kein Mac) | Baseline-Beleg RC178: [Lauf 44744144419](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/44744144419), Runner `macos-15`, Commit `13ed39ff` |
| macOS Intel | — | — | `BLOCKED` (kein Mac) | derselbe Lauf, Runner `macos-15-intel` |
| iOS-Simulator | — | — | `BLOCKED` (kein Xcode) | — |
| `git diff --check`, Stand der dritten Übergabe | `git diff --check 3908a921 HEAD` und `git diff --cached --check` für den Bericht | — | `PASS`, keine Ausgabe | — |
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
keine E1/E2/E3-Abnahme. Nur erfundene Dateien. In den Runden bis zum 24.11.
meint „Endstand“ den Stand am Ende der jeweiligen Runde (Paket und Build in
der Überschrift), nicht den Endstand dieses Berichts.

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
`b30c5511…` des vorherigen Stands)

- **Sperre nachgestellt** – Ein eigener Hilfsprozess öffnet einen Ordner des
  Testprofils mit Löschzugriff und voller Freigabe und hält ihn, bis eine
  Freigabedatei erscheint. Der echte Temp-Ordner und echte Profilordner
  wurden nicht gehalten.
- **Vorheriger Stand, Ordner über dem Datenordner gehalten** – Meldung wie am 24.11.
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
  scheiterte zuvor in 8 von 11 Läufen gegen das Paket des vorherigen Stands.
- **Nicht beobachtet** – eine Belegung durch ein echtes Sicherungs- oder
  Schutzprogramm; eine Belegung während eines laufenden Stapels oder einer
  Ergebnisbereitstellung; mehr als ein Fenster; „Selbst entscheiden“ in
  diesem Paket.

**Nach R-031** (Paket `1c672ef4…`, Build `9fe7076e` aus `56d7c744`,
24.11.2026 zwischen 14:00 und 14:30; Vergleich mit dem Paket `cec20d6e…` des
vorherigen Stands)

- **Vorheriger Stand, zehn Minuten** – Nur der Netzwerkdienst von WebView2 hat
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
  mit Prüffenster; der vorherige Stand scheitert mit
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

#### Runde vom 25.11. nachmittags (Paket `0d6bccd0…`, Build `46dd498f`)

Isoliertes Testprofil, Bedienung per Windows-UI-Automation, fünf erfundene
Dateien: ein Scan mit 40 Seiten, ein Word-Formular, eine Notiz mit
Zugangsdaten in Anführungszeichen, zwei kurze Texte. Beobachtung, keine
Abnahme.

- **Seitenzoom** – Strg mit Mausrad, als Fensternachricht an die
  Zeichenfläche gesendet: Die Breite der Schaltfläche **Dateien wählen**
  geht von 284 auf 426 Pixel, nach sechs Schritten zurück auf 214 und wieder
  auf 284. Am Paket der vorigen Übergabe gab es keinen Zoom. Das Layout bei
  starker Vergrößerung habe ich nicht beurteilt.
- **Schließen im Lauf** – Rückfrage erscheint; **Esc** schließt sie, die App
  läuft weiter. Erneut schließen, **Pausieren und schließen**: Fenster zu
  nach 7,9 s, kein Prozess mehr, keine Datei im Ergebnisordner. Neustart:
  Verlauf „5 Dateien · 2 Ergebnisse“, **Fortsetzen** endet nach 49 s mit
  fünf Ergebnissen. Originale unverändert.
- **Aufbewahrung 0 Tage** – mit `EU_PRIVACY_RETENTION_DAYS=0` in der
  Startumgebung wurde die Pause angenommen (zweimal). Die Einstellung
  erreicht den Core im Paket nicht; die Rückfrage „nicht pausierbar“ ist
  dort nicht auslösbar.
- **Ergebnisse gelesen** – am vorläufigen Paket dieser Runde (vor der
  Korrektur) stand im Ergebnis des Formulars
  `Antragsteller: Hans Müller, Tel\. 030 1234567`; das ist R-033. Am
  endgültigen Paket: `Antragsteller: Hans Müller, Tel\. [PHONE_REDACTED]`.
  Die Telefonnummer ist ersetzt, der Name hinter dem unbekannten Label bleibt
  (R-033b). Weiter unverändert im Klartext: `Petra Koch hat den Vertrag am
  12.03.2026 unterschrieben`, `Rückruf unter 030 7654321` (R-033d) und
  `Benutzer hmueller` (kein Doppelpunkt hinter dem Label, dokumentierte
  Grenze von R-027). Beide Passwörter in Anführungszeichen sind ganz ersetzt.
  Der Zustand der beiden Formular-Kästchen fehlt im Ergebnis (Rest von R-003).
- **Startprobe** – `PASS`: Start 1 800 ms, Beobachtungsfenster 77 s mit
  Haupt- und Prüffenster, 4 873 Stichproben, kein Lesefehler, keine
  Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte.
- **Nicht beobachtet** – **Jetzt schließen** in dieser Runde (die Pause war
  nach acht Sekunden erreicht, bevor die zweite Schließanfrage kam; in der
  vorigen Runde beobachtet), die Rückfrage „Stand nicht bekannt“, eine
  stumme Oberfläche, eine wirklich große Datei, geführte Prüfung, „Nur in
  Markdown umwandeln“, macOS.

#### Runde vom 25.11. abends (Paket `24a510df…`, Build `b8ea7acd`)

Dasselbe isolierte Testprofil und dieselben fünf erfundenen Dateien wie in
der Runde davor, Bedienung per Windows-UI-Automation. Beobachtung, keine
Abnahme.

- **Schließen im Lauf** – Rückfrage erscheint; **Esc** schließt sie, die App
  läuft weiter. Erneut schließen, **Pausieren und schließen**: Fenster zu
  nach 11 s, kein Prozess mehr, keine Datei im Ergebnisordner. Neustart:
  Verlauf „5 Dateien · 2 Ergebnisse“, **Fortsetzen** endet nach 52 s mit
  fünf Ergebnissen. Originale unverändert.
- **Ergebnisse gelesen** – alle fünf Dateien Zeile für Zeile:
  - Formular (Word): `Antragsteller: [PERSON_001], Tel\. [PHONE_REDACTED]`.
    Vorher stand dort `Antragsteller: Hans Müller`. Die E-Mail-Adresse ist
    ersetzt.
  - Kurzer Text: `[PERSON_003] leitet die Sitzung. Rückruf unter
    [PHONE_REDACTED].` Vorher stand die Nummer im Klartext.
  - Notiz mit Zugangsdaten: `[PERSON_001] übernimmt den Raum.` Dasselbe
    Pseudonym wie im Formular; der Name aus der Rollenzeile des ersten
    Dokuments gilt im Stapel. Beide Passwörter und die PIN sind ersetzt.
    Unverändert lesbar: `Benutzer hmueller` (kein Doppelpunkt hinter dem
    Label, dokumentierte Grenze von R-027).
  - Scan mit 40 Seiten: Name und Unternehmen auf jeder Seite ersetzt.
  - Vermerk: `Petra Koch hat den Vertrag am 12.03.2026 unterschrieben.`
    bleibt im Klartext. Das ist die verbleibende Lücke (voller Name in Prosa
    ohne Hinweisverb).
  Der Zustand der beiden Formular-Kästchen fehlt weiterhin (Rest von R-003).
- **Startprobe** – `PASS`: Start 1 876 ms, Beobachtungsfenster 77 s mit
  Haupt- und Prüffenster, 4 594 Stichproben, kein Lesefehler, keine
  Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte.
- **Nicht beobachtet** – die geführte Prüfung mit den neuen Personenhinweisen
  (der Lauf nutzt den automatischen Modus), Seitenzoom und **Jetzt
  schließen** in dieser Runde (unverändert seit der Runde davor), „Nur in
  Markdown umwandeln“, macOS.

#### Runde vom 25.11. spät (Paket `9ea88aab…`, Build `5c873336`)

Dasselbe isolierte Testprofil, dieselben fünf erfundenen Dateien und eine
sechste: ein Kontaktblatt mit `Zeuge: Clara Winter` und danach
`Tel. Clara Winter 030 5551234`, `Geburtsdatum Clara Winter: 03.04.1985` und
`Personalnr. Clara Winter 4711`. Bedienung per Windows-UI-Automation.
Beobachtung, keine Abnahme.

- **Schließen im Lauf** – Rückfrage, **Esc**, erneut schließen, **Pausieren
  und schließen**: Fenster zu nach 10,8 s, keine Datei im Ergebnisordner.
  Neustart: Verlauf „6 Dateien · 2 Ergebnisse“, **Fortsetzen** endet nach 61 s
  mit sechs Ergebnissen. Originale unverändert.
- **Ergebnisse gelesen** – alle sechs Dateien Zeile für Zeile:
  - Kontaktblatt: `Zeuge: [PERSON_003]`,
    `Tel. [PERSON_003] [PHONE_REDACTED]`,
    `Geburtsdatum [PERSON_003]: [DATE_REDACTED]`, `Personalnr. [ID_REDACTED]`.
    Kein Stopp. Im Kernlauf nachgestellt, nicht nativ: Am Kern der vorigen
    Übergabe stoppt dieser Text mit `RESIDUAL_PII`; der RC178-Kern gibt ihn
    mit Name, Telefonnummer und Geburtsdatum im Klartext frei und ersetzt nur
    die Personalnummer.
  - Kurzer Text: `[PERSON_003] leitet die Sitzung. Rückruf unter
    [PHONE_REDACTED].` Dasselbe Pseudonym wie im Kontaktblatt.
  - Formular, Notiz mit Zugangsdaten und Scan wie in der Runde davor
    (`Antragsteller: [PERSON_001], Tel\. [PHONE_REDACTED]`; 40 Seiten).
  - Vermerk: `Petra Koch hat den Vertrag am 12.03.2026 unterschrieben.`
    bleibt im Klartext, ebenso `Benutzer hmueller`. Unverändert.
- **Startprobe** – `PASS`: Start 1 982 ms, Beobachtungsfenster 77 s mit
  Haupt- und Prüffenster, 4 650 Stichproben, kein Lesefehler, keine
  Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte.
- **Nicht beobachtet** – die geführte Prüfung, Seitenzoom und **Jetzt
  schließen** in dieser Runde, „Nur in Markdown umwandeln“, macOS.

#### Runde vom 25.11. nachts (Paket `e3094213…`, Build `383aa344`)

Erstes Paket ohne die frühere Oberfläche. Dasselbe isolierte Testprofil und
dieselben sechs erfundenen Dateien wie in der Runde davor, Bedienung per
Windows-UI-Automation. Beobachtung, keine Abnahme.

- **Start und Bedienung** – Das Hauptfenster startet mit der Arbeitsfläche wie
  bisher; Auswahl, Start, Rückfrage beim Schließen, **Esc**, **Pausieren und
  schließen** (Fenster zu nach 7,9 s), Neustart, Verlauf „6 Dateien ·
  2 Ergebnisse“, **Fortsetzen** (55 s), sechs Ergebnisse. Originale
  unverändert.
- **Ergebnisse gelesen** – alle sechs Dateien Zeile für Zeile; inhaltlich
  gleich der Runde davor (Kontaktblatt vollständig ersetzt, `Petra Koch hat
  den Vertrag …` und `Benutzer hmueller` weiter lesbar).
- **Startprobe** – `PASS`: Start 1 855 ms, Beobachtungsfenster 77 s mit
  Haupt- und Prüffenster, 4 877 Stichproben, kein Lesefehler, keine
  Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte. Die Programmdatei der Hülle
  hat 5 479 936 Bytes (vorher 5 505 024).
- **Nicht beobachtet** – die vier neuen Fehlertexte (R-034) im Fenster; ihre
  Codes habe ich nativ nicht ausgelöst. Außerdem wie bisher: geführte Prüfung,
  Seitenzoom, **Jetzt schließen**, „Nur in Markdown umwandeln“, macOS.

#### Runde zu R-035 und R-036 (Paket `f641f720…`, Build `6ba59a6f`)

Dasselbe isolierte Testprofil und dieselben sechs erfundenen Dateien,
Bedienung per Windows-UI-Automation. Beobachtung, keine Abnahme.

- **Start und Bedienung** – Auswahl, Start, Rückfrage beim Schließen, **Esc**,
  **Pausieren und schließen** (Fenster zu nach 7,7 s), Neustart, Verlauf
  „6 Dateien · 2 Ergebnisse“, **Fortsetzen** (55 s), sechs Ergebnisse.
  Originale unverändert.
- **Ergebnisse gelesen** – alle sechs Dateien Zeile für Zeile; inhaltlich
  gleich der Runde davor.
- **Startprobe** – `PASS`: Start 1 832 ms, Beobachtungsfenster 77 s mit
  Haupt- und Prüffenster, 4 844 Stichproben, kein Lesefehler, keine
  Verbindung, 0 TCP-Listener, 0 UDP-Endpunkte.
- **Im Browser gesehen, nicht nativ** – die echten Dateien `workspace.html`,
  `.css` und `.js` in einem fensterlosen Edge mit nachgebildeten Befehlen:
  Eine abgelehnte Auswahl mit drei Dateien erscheint als rote Meldung in fünf
  Zeilen, je Datei eine Zeile mit Name und Grund; die Ordnerwahl mit
  Netzlaufwerk-Antwort zeigt den Hinweis ohne Pfad. Keine Skriptfehler. Das
  belegt die Darstellung, nicht den Weg durch Hülle und Core.
- **Nicht beobachtet** – genau das, was diese Runde geändert hat: der Hinweis
  auf ein Netzlaufwerk (kein Netzlaufwerk im Testprofil), die Namen einer
  abgelehnten Auswahl, die Hinweise auf übersprungene Begleitdateien und die
  Darstellung der Zeilenumbrüche in der Meldung. Der Lauf zeigt nur, dass die
  geänderte Oberfläche startet und der gewohnte Ablauf unverändert läuft.
  Außerdem wie bisher: geführte Prüfung, Seitenzoom, **Jetzt schließen**,
  „Nur in Markdown umwandeln“, macOS.

## Urteil je Prüfdimension

Zahlen aus ABDECKUNG.tsv am Stand `d474a579`, nur Einzeleinheiten. Das
Register zählte in der ersten Runde Produktivcode hinter einem
`#[cfg(test)]` irrtümlich als Rust-Testmodul und damit als offen. Die
Erkennung ist korrigiert; dadurch gelten rund 460 Rust-Einheiten jetzt als
teilgeprüft, weil ihre Datei im Rust-Review vollständig gelesen wurde. Das
ist eine Korrektur der Zählung, keine zusätzliche Prüfung.

| Dimension | Urteil | Befunde | Abdeckung (geprüft / teilgeprüft / offen) und Grenze |
| --- | --- | --- | --- |
| Fachlichkeit und Formatqualität | Text und CSV solide; die belegten stillen Verluste in DOCX, XLSX und CSV sind behoben oder als Hinweis sichtbar, bis auf den Zustand alter Formular-Kontrollkästchen. Listen bleiben Tabellen. Ein Lebenslauf mit Namenslink ist jetzt automatisch verarbeitbar. | R-003 bis R-006, R-018, R-026 | 5 / 277 / 603. PDF, Scan-PDF, Bild-OCR und Office-OCR im Review nicht ausgeführt; Diagramme, SmartArt, Formeln nur über die Suite. |
| Anonymisierung und Zuordnungen | Neu am 25.11. abends: Name hinter einer Rolle, Namensliste unter einem Label und derselbe Name an weiteren Stellen werden ersetzt (R-033b bis d); der dadurch häufiger erreichte Stopp bei `Label Name Nummer` ist behoben (`0bd5e26f`): Redaktion und Schlussprüfung lesen Platzhalter jetzt gleich. Neu am 25.11.: Aus Word blieben Telefonnummern, Namen hinter Titeln, Geburtsdaten und Kennungen stehen, weil der Kern den maskierten Punkt nicht las (R-033, für fünf Regeln behoben). Offen bleiben vier Formen unabhängig vom Format: voller Name in Prosa ohne Hinweisverb, einzelner Nachname, Telefonnummer ohne Label, Geburtsname. Mehrere Leckmuster und eine Überredaktion behoben; zwei eigene Lecks der zweiten Runde vor der Übergabe gefunden und behoben. Gegenüber RC178 zeigt der Differenzlauf am Endstand keine Verschlechterung außer den zehn gewollten Fällen von R-024. Zugangsdaten mitten in der Zeile werden für ein Wort ersetzt (R-027, Teil). Offen: die dokumentierten Grenzen von R-027 und der Namenserkennung. Zuordnungen und CSV-/XLSX-Escaping ohne Befund. | R-001, R-002, R-017, R-024, R-026, R-027, R-033 | 10 / 241 / 453. Geführte Entscheidungen nur in einzelnen nativen Läufen; `privacy/entities.js`, `credentials.js` und `person-ambiguities.js` nur in Teilen gelesen (laut Register 23 von 113 Einheiten teilgeprüft). |
| Oberfläche, UX und Accessibility | Ablauf entspricht DS-086; kein kritischer Befund. Texte und Rollen nachgebessert. Die eingebettete Prüfung ist mehrfach nativ bedient (Ersetzen, Beibehalten, Später entscheiden und Wiederaufnahme); die Zähltexte haben ihre Einzahl. Schließen während eines Laufs führt über eine Rückfrage zur Pause; nativ bedient sind die Rückfrage, Bleiben, Pausieren und Jetzt schließen (R-032). Fehlermeldungen der geladenen Oberfläche nennen seit `8cf5dd93` und `d474a579` die Ursache und die betroffenen Dateien; der Hinweis auf einen Ergebnisordner im Netzwerk (DS-080) erscheint (R-034 bis R-036). | R-008, R-009, R-020, R-025, R-032, R-034 bis R-036 | 11 / 243 / 0. Die 46 offenen Einheiten waren die frühere Oberfläche; sie sind entfernt, nicht geprüft. Quelltext plus Windows-Läufe; kein Screenreader, kein WKWebView; Seitenzoom nur unter Windows beobachtet. |
| Architektur und Plattform | Grenzen Oberfläche → Rust → Core → Worker nachvollzogen; Produkttrennung in der Projektion wirksam. Fünf Befunde der Rust-Shell behoben oder eingegrenzt, zuletzt die Startverweigerung bei belegter Ordnerkette. | R-011 bis R-014, R-022, R-028, R-032 | 25 / 755 / 546. Rust-Tests nur für Windows; macOS-Zweige siehe Mac-Status. |
| Implementierung und Wartbarkeit | `main.rs` (rund 4 500 Zeilen), `ooxml.js` (226 KB) und `privacy/engine.js` sind zu groß für sichere Einzeländerungen; im Datenschutzkern überlagern sich Regeln über Ränge, sodass eine neue Regel an entfernten Stellen wirkt. Dreifache NtCreateFile-Hüllen; toter Code (`adaptive-resource-policy.js`, vier native Befehle ohne Aufrufer in der geladenen Oberfläche). Seit RC178 ist `main.rs` um rund 420 Zeilen gewachsen. | — (Verbesserungen, nicht als Befund geführt) | 1 / 207 / 675. Kein systematischer Durchgang. |
| Datenschutz und Sicherheitsgrenzen | Export überschreibt nie, Pfade handle-relativ, Diagnose mit geschlossenem Vokabular, keine Listener. Das neue Diagnoseereignis trägt nur Fehlerklasse und Systemcode. Shell und Core bauen keine Verbindungen auf. Die WebView2-Komponente meldete sich bis zum vierten Übergabestand regelmäßig bei Microsoft; am Endstand ist in zehn Minuten keine Verbindung mehr zu beobachten. | R-010, R-012, R-031 | 0 / 13 / 175. JS-Diagnose, Ergebnisexport und Prüfspeicher nicht gelesen. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Serielle Veröffentlichung belegt, zweispurige Vorbereitung belegt. Verwaiste Vorbereitungen werden bereinigt; eine laufende Veröffentlichung schützt allein ihr Alter. | R-007, R-010, R-022 (Hypothese), R-032 | 0 / 157 / 450. Wiederaufnahme nach „Später entscheiden“ einmal, nach „Pausieren und schließen“ und nach „Jetzt schließen“ je einmal nativ beobachtet; Absturzpfade, Beenden durch das Betriebssystem und voller Datenträger nicht untersucht. |
| Leistung und Ressourcen | Keine Lastmessung, nur Vorher-nachher-Vergleiche des Datenschutzkerns: nach der zweiten Runde 109 KB Prosa 0,86 s zu 0,89 s und 328 KB 5,9 s zu 5,7 s; seit R-027 für Dokumente mit vielen Zugangsdaten-Labels 26 bis 45 % länger; seit `0bd5e26f` bei vielen Platzhaltern das 1,3- bis 1,6-Fache. Der Kern skaliert schon in RC178 überlinear. | — | Dazu Startzeit und Suite-Laufzeiten. BL-047.5 bleibt ohne Zielhostmessung. |
| Tests und Orakel | Breite Suite mit realen Aufrufpfaden, aber teuer und mit blinden Flecken. Für den Datenschutzkern fehlt ein Vergleichsorakel: die Regressionen der zweiten Runde zeigte erst der Differenzlauf gegen den alten Kern. Die Windows-Startprobe konnte einen WebView2-Endpunkt nicht zuordnen, ihr Abbau wartete auf keinen Prozess, und ihr Messskript lief auf diesem Host nicht durch, ohne dass ein Test es zeigte; behoben. Die Tests der früheren Oberfläche prüften Code, den kein Fenster lud, und verdeckten R-034 bis R-036; sie sind entfernt. Von ihren 52 Verhalten sind an der geladenen Oberfläche 38 nicht oder nur zum Teil geprüft (ABGLEICH-ALTE-OBERFLAECHE.md). | R-019, R-029, R-030, R-034 | Gruppe `TEILGEPRÜFT`; Bewertung im nächsten Abschnitt. |
| Abhängigkeiten, CI und Lieferkette | Locks, Pins und Rechte sauber; paketierte JavaScript-Abhängigkeiten lokal ohne bekannten Befund. Nachweis für Windows und Schutz von Tag und Release fehlen. | R-015, R-016, R-023 | 0 / 73 / 219. Paketinhalte der Release-Assets nicht geprüft; `cargo audit` am 25.11. ausgeführt, zwei Befunde angehoben, zehn Hinweise bleiben. |
| Dokumentation und Nachvollziehbarkeit | Mehrere Drifts korrigiert, darunter Testvoraussetzungen, Formatverhalten und Release-Herkunft. | R-007, R-015, R-016, R-021 | Gruppe `TEILGEPRÜFT`. BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche. |

## Bewertung der Testsuite

Auf Nachfrage des Anwenders. Zahlen per Mustersuche, also Größenordnungen.
Umfang und Laufzeit wurden am Stand der ersten Runde (`e1afef0f`, 361
Dateien) erhoben; die zweite Runde ergänzt drei Dateien auf 364, R-027 eine
weitere auf 365. Am Stand `d474a579` sind es 366: Zwei Testdateien für R-033
kamen hinzu, der Test der früheren Oberfläche entfiel.

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
    `tests/test-standalone-desktop-contract.js` prüften die alte Oberfläche
    `app.js`, die das Hauptfenster nicht lud. Seit `1d908311` ist beides
    bereinigt; dabei kam R-034 heraus, den diese Tests verdeckt hatten.
  - Die Oberfläche wird nie in einer WebView ausgeführt; der einzige Befund
    dieser Art (R-025) kam aus dem nativen Lauf.
  - Die Suite bricht beim ersten Fehler ab und braucht sechs
    Voraussetzungen, die erst seit der zweiten Runde dokumentiert sind.
  - Auch die Befunde der zweiten Runde hat sie nicht gezeigt; zwei davon
    (R-024, R-025) kamen aus dem nativen Lauf, die übrigen aus dem Lesen.
  - Von meinen eigenen Fehlern der zweiten Runde hätte sie einen gemeldet
    (ein Fall von `tests/test-pii-regression.js`). Die beiden Lecks, die neuen Stopps und
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
  Oberfläche auf `workspace.js` umstellen oder entfernen (erledigt: seit
  `1d908311` entfernt; was dabei ungeprüft blieb, steht in
  ABGLEICH-ALTE-OBERFLAECHE.md). Für den letzten
  Punkt bindet `tests/test-standalone-loaded-frontend-contract.js` seit der
  zweiten Runde den Quelltextvertrag an die geladenen Dateien. Dazu kommt
  aus der dritten Prüfung ein fünfter Punkt: ein Vergleichslauf des
  Datenschutzkerns gegen den jeweils letzten freigegebenen Kern über ein
  festes Korpus gehört in die Suite. Mein Skript dafür liegt nicht im
  Repository; als Vorlage beschreibt BEFUNDE.md Aufbau und Zählweise.

## Mac-Status

| Ebene | Apple Silicon | Intel |
| --- | --- | --- |
| Quelltext in diesem Review | gelesen und seit der zweiten Runde geändert, nicht übersetzt | gelesen und geändert, nicht übersetzt |
| CI-Runner (RC178, `13ed39ff`) | `macos-15`: Paket, Start, Konvertierung aus dem ZIP | `macos-15-intel`: ebenso |
| CI-Runner für den geänderten Stand | `NOT_RUN` (keine Actions gestartet) | `NOT_RUN` |
| Reales Gerät | `NOT_RUN` | `NOT_RUN` |

Die erste Runde änderte nur den gemeinsamen JavaScript-Kern und das Frontend.
Die zweite Runde ändert zusätzlich fünf Rust-Dateien (`main.rs`,
`export_directory.rs`, `native_export_broker.rs`, `native_export_channel.rs`,
`diagnostic_bundle.rs`). Spätere Runden ändern drei weitere:
`private_namespace.rs` (R-028, Code unter `cfg(windows)`), `close_prompt.rs`
(neu) und `ipc_transport.rs` (beide R-032); dazu `tauri.conf.json`,
`capabilities/main.json`, `permissions/commands.toml`, die erzeugten Schemas
und `Cargo.lock` (`git diff --stat e1afef0f d474a579 --
apps/datasecure-standalone/tauri-contract`). Der Code der zweiten Runde ist
plattformneutral geschrieben, mit einer Ausnahme: `parse_names_seen` liegt im Windows-Zweig des
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
Mac-Runner, und zwar für die Änderungen aller Runden: Der Typcheck oben lief
auf `a0d3e340`. Ob die zweispurige
Vorbereitung auf macOS aktiv wird, hängt an `os.freemem()` (R-022) und ist
nur auf einem Zielgerät zu klären.

## Entscheidung zu iOS

Kein iOS im Zielvertrag: `apps/datasecure-standalone/desktop-targets.json:9-42`
nennt vier Desktopziele; `tauri-contract/Cargo.toml:19` baut Tauri 2.11.5 ohne
Mobile-Merkmale, es gibt weder `src/lib.rs` noch `gen/apple`; kein Workflow
hat einen iOS-Job.

| Ansatz | Wiederverwendbarer Core | Plattformbindung und Grenzen | Prüfbarer Nachweis | Aufwand und Entscheidung |
| --- | --- | --- | --- | --- |
| Native Aufnahme mit portierbarem Fachkern (SwiftUI-Hülle, JS-Kern in verstecktem WKWebView) | `privacy/*` (21 Dateien, am Endstand rund 400 KB, nur SHA-256 und `net.isIP` als Node-Bindung), reine `core`-Teile (rund 170 KB), OOXML-Leser mit Adaptern für `zlib`, `path`, `Buffer` | Dateiaufnahme über Dokumentpicker und zugriffsgebundene URLs; OCR über Apple Vision oder Tesseract-WASM; ein Prozess statt Sandbox-Kind; Speicher- und Hintergrundgrenzen des Systems | Simulator: gleicher Markdown-Hash wie am Desktop für ein synthetisches Korpus | mittel; bevorzugt für eine Voruntersuchung |
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
Claude-Code-Review für DataSecure RC178, Stand nach dreizehn Übergaben (Befunde R-001 bis R-036), abgeschlossen.
Branch: https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review
Einstiegscommit: e88f1b8d100421017fb3909d77e338fd25c1b421
Geprüfter Produktstand: d474a57916229aaebf89e5dd54cd8533e283ef6c (spätere Commits nur tasks/rc178-claude-review/)
Veröffentlichter Remote-HEAD mit Bericht: siehe Nachricht des Anwenders
Ergebnisbericht: tasks/rc178-claude-review/ERGEBNIS.md am Remote-HEAD
Für Codex zuerst prüfen (die jüngste Änderung zuerst):
1. R-035 und R-036, Commit d474a579: frontend/workspace.js (configure: Hinweis bei
   network_folder_notice; errorDetails, sourceDetailText, admissionHints, showError mit drittem
   Argument; fünf Texte in reasons) und workspace.css (.notice mit white-space:pre-line). Test:
   tests/test-standalone-workspace.js, fünf Tests am Dateiende. Zu prüfen: (a) der Core erkennt ein
   Netzlaufwerk nur am UNC-Pfad (gateway/result-folder-config.js, isNetworkResultFolder); zugeordnete
   Laufwerksbuchstaben und /Volumes lösen den Hinweis nicht aus; der Anwender hat entschieden, das
   vorerst so zu belassen. (b) Nichts davon ist nativ
   beobachtet. (c) Die Meldung nennt höchstens zehn Namen; Namen mit Richtungs- oder
   Zeilentrennzeichen werden gezählt, nicht gezeigt (im Dateibaum weiterhin gezeigt, Rest von R-020).
   (d) Die Korrekturen nach der Gegenprüfung sind nur getestet.
   Die Befunde stammen aus dem Einzelabgleich der 52 entfallenen Tests
   (tasks/rc178-claude-review/ABGLEICH-ALTE-OBERFLAECHE.md) und gelten auch für den Tag v3.2.0-rc178.
   Aus dem Abgleich bleiben drei nicht belegte Punkte (ein Fehler beim Start der Prüfung erreicht den
   Anwender nur als allgemeiner Satz; keine Rückmeldung nach erfolgreichem Öffnen; möglicher Wettlauf
   zwischen Leeren der Auswahl und Drop) und 38 Verhalten ohne oder mit nur teilweisem Test an der
   geladenen Oberfläche.
2. R-019 und R-034, Commits 8cf5dd93 und 1d908311, vom 25.11. nachts, auf Entscheidung des Anwenders:
   frontend/index.html, app.js und styles.css sind entfernt, ebenso tests/test-standalone-frontend.js
   (52 Tests nur für app.js) und tests/manual/standalone-ui-browser.mjs. Das Fenster lud nur
   workspace.html. tests/test-standalone-desktop-contract.js liest jetzt die geladenen Skripte;
   tests/test-standalone-loaded-frontend-contract.js verlangt, dass der paketierte Ordner nichts
   anderes enthält. R-034: workspace.js erklärt jetzt SOURCE_FOLDER_UNSUPPORTED_FILES,
   STANDALONE_NO_ADMISSION, BATCH_PSEUDONYM_CAPACITY_EXCEEDED und
   STANDALONE_RESULT_BINDING_UNAVAILABLE (vorher nur app.js). Zu prüfen: (a) ob von den 52
   entfallenen Tests ein Verhalten für die neue Oberfläche ungeprüft bleibt (nicht Test für Test
   abgeglichen; nachgeholt, siehe Punkt 1); (b) die vier nativen Befehle ohne Aufrufer in der geladenen Oberfläche
   (remove_admitted_source, open_review_window, open_local_ledger, shutdown) samt dem getrennten
   Prüffenster und capabilities/review.json; (c) der Mac- und Linux-Build (der eingebettete Ordner
   ändert sich dort ebenso; Rust-Quellen sind unverändert); (d) docs/canonical/TRACEABILITY.md nennt
   die entfernten Dateien an 18 älteren Stellen, die nicht einzeln nachgezogen sind.
3. R-033, Commit 0bd5e26f, vom 25.11. spät: privacy/structured.js (findStructuredSpans: zweiter Blick
   über maskPlaceholders, wie scanResidual den Text liest; Spannen, die einen Platzhalter oder eine
   Spanne des ersten Blicks berühren, werden verworfen) und gateway/privacy-text-operation.js
   (weitere Stellen eines Kandidatennamens werden wieder reserviert). Behebt den Stopp RESIDUAL_PII
   bei "Label Name Nummer" ("Tel. [PERSON_001] 030 …"), den RC178 für jeden bekannten Namen hat und
   den 1c8e971c häufiger erreichte. Beide Produkte. Zu prüfen: (a) findStructuredSpans hat weitere
   Aufrufer (canonicalizeRenderedText in privacy/base.js, protectedEvidenceRanges in
   privacy/person-ambiguities.js); die Schlussprüfung wird dadurch in seltenen Fällen selbst strenger
   (ein Zufallsfall von 6 000 auf Kernebene, kein neuer Stopp im Ablauf der Operation). (b) Ein
   Dokument, das vorher an einer solchen Nummer stoppte, wird jetzt freigegeben, auch wenn es an
   anderer Stelle einen dem Kern unbekannten Namen enthält. (c) Quelltexte, die selbst Platzhalter
   enthalten, werden an diesen Stellen stärker ersetzt ("Telefon: [FIELD_REDACTED] [PHONE_REDACTED]").
   (d) Laufzeit des Kerndurchlaufs bei vielen Platzhaltern 1,3- bis 1,6-fach. Eine Gegenprüfung mit
   rund 1 800 gezielten und 30 000 Zufallsfällen fand keinen Fall mit mehr Klartext und keinen neuen
   Stopp.
4. R-033b bis d, Commit 1c8e971c, vom 25.11. abends: privacy/person-ambiguities.js (ROLE_CUE,
   roleLabelNameSpans, withoutFollowingWords, labelledNameListSpans, die Ausweitung in
   personProseCandidateSpans mit der Marke "further" und ihr Überspringen in personProseAmbiguities),
   gateway/privacy-text-operation.js (weitere Stellen werden nicht reserviert; reviewOf liest erst die
   Restfunde), privacy/base.js (Rückruf unter/an), privacy/entities.js (contactAfter). Nur Standalone,
   bis auf das Telefonlabel und die maskierte Klammer. Test: tests/test-privacy-role-labels-and-name-lists.js. Drei
   Gegenprüfungen; verworfen wurden Rollen als Personenfelder, eine Regel für "Name hat … Partizip"
   und eine für den Geburtsnamen. Zu prüfen: (a) [behoben in 0bd5e26f, siehe Punkt 3] der Stopp RESIDUAL_PII bei "Label Name Nummer"
   ("Tel. Hans Müller 030 …", auch Steuer-ID, Aktenzeichen, Geburtsdatum, Personalnr., Notfallkontakt,
   Mobil), sobald der Name an anderer Stelle Personenhinweis ist; vorher gab der Kern dort Name und
   Nummer frei, und RC178 stoppt bei "Name: Hans Müller" plus dieser Zeile genauso. Die Ursache liegt
   in den Telefon- und Nummernregeln (Redaktion ersetzt die Nummer hinter "Label Name" nicht, die
   Schlussprüfung findet sie). (b) Überredaktion: namensförmige Organisationen, Orte und Bemerkungen
   hinter einer Rolle oder in einer Liste werden im automatischen Modus als Person ersetzt und in
   Dokument und Stapel weitergetragen. (c) Die Grenze von 500 weiteren Stellen je Dokument lässt den
   Rest lesbar, ohne Stopp. (d) Halbe Ersetzungen ("Hans Peter Im Hof", "Anna Sommer-Meier").
   (e) Die Korrekturen nach der dritten Gegenprüfung sind nicht mehr unabhängig gegengeprüft.
   Offen bleibt die eigentliche Lücke: voller Name in Prosa ohne Hinweisverb, einzelner Nachname,
   Telefonnummer ohne Label, Geburtsname. Der Kern kennt Namen nur an der Form.
5. R-033, Commit 3ba2b8fb, neu am 25.11. und schon in RC178 vorhanden: Markdown aus Office- und
   PDF-Quellen schreibt jeden Punkt als "\."; die Regeln für "Tel."/"Fax.", Titel ("Dr."), "geb.",
   "z. Hd." und abgekürzte Nummernlabels ("Personalnr.", "Az.") lasen das nicht. Aus einem
   Word-Dokument blieben Telefonnummer, Name hinter dem Titel, Geburtsdatum und Kennung im
   freigegebenen Markdown stehen. Jetzt lesen diese Regeln den Punkt mit und ohne Backslash
   (privacy/base.js: PHONE_LABEL_RE, DATE_OF_BIRTH_LABEL_RE, ID_LABELS, DE_TAX_LABEL_RE;
   privacy/entities.js: DOT in den Titelmustern, before/contactAfter; privacy/engine.js: z. Hd.).
   Test: tests/test-privacy-office-markdown-abbreviations.js (Zeile aus Word gegen dieselbe Zeile als
   Text). Die maskierte Klammer hinter einem Namen liest seit 1c8e971c contactAfter. Offen: getippte
   maskierte Listen- und Hervorhebungszeichen, XLSX/PPTX/PDF nicht einzeln ausgeführt. Tragfähig
   wäre eine einheitliche unmaskierte Sicht des Kerns auf solches Markdown statt Regel für Regel.
   R-033b bis d: siehe Punkt 4. Derselbe Commit enthält R-027: Zugangsdaten in
   Anführungszeichen werden ganz ersetzt, mit Rückfall auf das erste Wort.
6. R-027, Commit 283e6ed9: privacy/base.js (CREDENTIAL_INLINE_FIELD_RE), privacy/structured.js
   (findInlineCredentialSpans, getrennt von findStructuredSpans) und gateway/privacy-text-operation.js
   (prepareTextPrivacyReview: Ersetzung nach dem Kern, nur wenn die Prüfung danach dieselben offenen
   Entscheidungen ergibt). Vier frühere Fassungen haben Namen freigegeben oder Dokumente gestoppt;
   die Gegenfälle stehen in tests/test-privacy-inline-credentials.js. Bewusst eng: ein Wort je Label
   (seit 3ba2b8fb ein Wert in Anführungszeichen ganz, Punkt 5).
7. privacy/engine.js, Commits cfee417a bis ffab4fa7 als Ganzes, nicht einzeln: Die Zwischenstände
   bis a0d3e340 enthalten zwei Lecks (Aufzählung voller Namen, E-Mail-Adresse mit Namen in der Domain).
   Endstand: linkIdentityHits, asciiNameSpellings, matchOnly, forwardFullNames und die Link-Schleife
   der drei strengen Profile. Neu bekannt: „Meier, Anna Schmidt“ bei bekannter Anna Meier wird als
   umgestellter Name gelesen. Ein eigener Vergleich RC178-Kern gegen diesen Kern mit fremdem Korpus
   wäre der beste Gegenbeleg.
8. Rust-Shell (5f8bf47b bis 22688d75, d5992265): nur für Windows übersetzt und getestet. Auf einem
   Mac-Runner zuerst cargo test und clippy; 8c0dd30b und b30a6dbc übersetzen für sich nicht.
9. R-028, Commit b71439b2: private_namespace.rs (is_contention, open_waiting) und main.rs
   (namespace_bootstrap_code, release_unspawned_generation). Die Freigabe der Ordnerkette ist
   unverändert; neu sind die Ursache STANDALONE_DATA_ROOT_BUSY, ein Warten von höchstens rund zwei
   Sekunden vor dem Anlegen und dass ein solcher Versuch nicht gegen die 16 Startversuche zählt.
   Zu prüfen: ob ein Rückgeben der Generation an anderer Stelle der Wiederanlauf-Logik stört, und
   der Mac-Build (der Code ist cfg(windows), übersetzt wurde nur Windows).
10. R-029 und R-030, Commits dbf98cbf, b11a6131, 0b99529c: Die Startprobe verglich den WebView2-
   Profilordner ohne den Unterordner EBWebView; ihr Abbau hat deshalb nie auf WebView2 gewartet und
   tut es jetzt. Im Release-Workflow und in scripts/run-pkg-04.ps1 läuft das zum ersten Mal wirklich.
   Der UDP-Endpunkt, an dem die alte Probe scheiterte, gehört zum Verkehr aus Punkt 11.
11. R-031, Commits 1c3f36af und 56d7c744: Bis 0b99529c (also auch in RC178) fragte die WebView2-
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
12. R-032, Commits 5f670a20 und 2ce74b9f, auf Entscheidung des Anwenders (DECISIONS.md, Präzisierung
   DS-110 vom 25.11.2026): Schließen des Hauptfensters fragt bei arbeitendem Lauf und pausiert über
   das vorhandene pause_batch. Hülle: close_prompt.rs, main.rs (request_native_close,
   acknowledge_close_request, decline_close_request, confirm_close), ipc_transport.rs (ExitGate::begun),
   Frist zwei Sekunden. Oberfläche: workspace.js (closeQuestion, presentClose, receiveCloseRequest,
   settleClose, workStarting). Der gemeinsame Core und der losgelöste Start der Arbeitsprozesse sind
   unverändert; kein Prozess wird abgebrochen. Zu prüfen: Mac-Build und Bedienung unter macOS (das
   App-Menü Beenden geht über ExitRequested an der Rückfrage vorbei), die Frist bei einer stummen
   Oberfläche, eine große Datei mit langer Pausenwartezeit, Schließen während einer geführten Prüfung
   mit ungespeicherten Eingaben (unverändert sofort), und ob workStarting jeden Befehl erfasst, der
   Arbeit anstößt. 2ce74b9f ist inzwischen gegengeprüft: zwei Fehler, behoben in d41a042b und 34de4509
   (workBegins/workReturns statt markWorkStarting; Klick auf "Pausieren und schließen" nach
   Verbindungsverlust). Die Rückfrage "Aufbewahrung 0 Tage" ist im Paket nicht erreichbar, weil
   configure_core_environment EU_PRIVACY_RETENTION_DAYS nicht weiterreicht.
13. R-025, Commits 907efc14, 8c452ac4, 1126dc36 und e66bab8f: nur Texte der Oberfläche. 8c452ac4 hatte
   eine Verbform verdorben und rund fünfzehn Texte übersehen (zweite Gegenprüfung), danach fehlten
   noch zwei (dritte Gegenprüfung).
   Zu prüfen: ob weitere Zähltexte fehlen (der Wächter in tests/test-standalone-workspace.js kennt
   nur eine Wortliste und drei Satzformen), die Einzahlsätze in workspace.js und document-review.js auf
   Lesbarkeit;
   app.js (alte Oberfläche) ist seit 1d908311 entfernt.
Weitere Commits der Runde vom 25.11. nachmittags: 49add216 und b755e208 (Diagnosepaket listet bis 2 048 Einträge),
52dee47c (Cargo.lock: url 2.5.9, cookie 0.18.3 nach cargo audit; nur für Windows übersetzt), fc10973e und
927fb3bd (audit:standalone prüft die Rust-Crates), 405eb370 (Seitenzoom unter Windows über WebView2,
ohne neue Berechtigung), 39f2b3aa mit 22c34dcb (Formular-Kontrollkästchen ausgegeben und wieder
zurückgenommen, weil das Zeichen die Erkennung eines Namens dahinter verhinderte).
Offen oder blockiert: macOS arm64/x64 und iOS-Simulator (keine Geräte); R-006 (Listen als Tabellen),
R-015, R-022; R-032 beim Beenden durch das Betriebssystem und bei Absturz; R-028 bei langer Belegung; R-031 hängt an nicht zugesicherten WebView2-Schaltern; Grenzen von R-027 (mehrwortige Geheimnisse, Labels in
Überschriften, Tabellen und Links); vier Commit-Nachrichten mit falschem Backlogposten (siehe Bericht);
Rest von R-003 (Kontrollkästchen) und von R-033 (siehe Punkte 3 und 4); Entscheidungen zu Protokollaufbewahrung, den vier nativen Befehlen ohne Aufrufer
(remove_admitted_source, open_review_window, open_local_ledger, shutdown) und Seitenzoom unter macOS/Linux;
die Erkennung eines Netzlaufwerks nur am UNC-Pfad (nach Entscheidung des Anwenders vorerst belassen);
38 Verhalten der geladenen Oberfläche ohne oder mit nur teilweisem Test; rund 61 % der Einheiten im Register offen.
```
