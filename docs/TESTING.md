# Aktueller Testvertrag

Stand: 08.09.2026 · 3.2.0-rc125

Das vollständige chronologische Testjournal bis RC84 liegt unverändert im
[Archiv](archive/2026-09/testing/TESTING_HISTORY_THROUGH_RC84.md). Diese Datei
enthält nur die heute gültigen Testklassen und Releasebefehle.

RC111 trennt außerdem reine Core-Verträge von den Produktadaptern.
`test-core-contracts.mjs` prüft Exportidentität der alten Importpfade, reine
transitive Abhängigkeiten und beide tatsächlichen Paketprojektionen.
`test-core-policy-binding.mjs` gehört zum lokalen Vollprofil: ausgewählte
gemeinsame Code-/Policy-Dateien werden aus beiden Projektionen gehasht und
ein erster Golden-Korpus in getrennten Produktprozessen verarbeitet.
Typisierte, bijektive Pseudonymnormalisierung vergleicht v1/v2 semantisch;
unterschiedliche Personen/Firmen dürfen nicht zusammenfallen und Fachtext
darf nicht verschwinden. Das ist keine vollständige Golden-Abdeckung und
kein persistierter Journal-/Release-Fingerprint.

Die normale Standalone-App schreibt ihre inhaltsfreien Interaktionslogs ohne
zusätzlichen Anwenderdialog. Für eine ausdrücklich aktivierte Supportsession
kann der startende Prozess `EU_PRIVACY_SUPPORT_MODE=1` setzen; nur der genaue
Wert `1` wird vom Desktop zum Sidecar und zum Stapelworker weitergereicht.
Dann enthält der vorhandene Supportspool auch `converter_started`,
`coverage_checked`, `converter_completed` und `converter_stopped`.
`coverage_checked: ok` bestätigt die Vertragsprüfung, nicht fehlerfreie OCR
oder vollständige Extraktion. Qualitätsgrade und Auslassungshinweise stehen
im Ergebnisjournal und der Laufzuordnung. Rohes stderr, Namen, Pfade und
Dokumentinhalte gehören niemals in diese Spur. Es gibt keinen neuen Schalter
im normalen Umwandlungsablauf und keine globale Umgebungsänderung durch Tests.

## Schnelle Dokumenten- und Vertragsprüfung

```text
npm run test:docs
node tests/test-manifest.js
node tests/test-retention.js
node tests/test-cowork-documentation-contract.js
node tests/test-capability-contract.js
npm run test:status-app
```

Sie prüft unter anderem:

- einen aktiven Dokumentenkanon und gültige DS-/BL-Referenzen;
- aktuelle Versionen und verständliche UAT-Namen/Links;
- ZIP/Marketplace als Nutzerkanäle;
- keinen auswählbaren Bildmodus;
- 0–14 Tage nur für temporäre Arbeits-/Reviewdaten;
- niemals automatische Löschung von Quellen/Originalen oder fertigen Exporten;
- Cowork-Formatallowlist TXT/Markdown/CSV/DOCX direkt sowie XLSX/PPTX
  Markdown-first; PDF/Scan-PDF/Bilder bleiben gesperrt. Standalone verarbeitet
  DOCX und breite Quellen Markdown-first mit getrenntem
  Extraktionsstatus. Reine Standalone-Konvertierung bleibt ein eigener Zweck.
- inhaltsfreie Statusprojektion, unveränderten Textfallback und einen
  reproduzierbaren Offline-Build aus Repo- und fremdem Arbeitsordner.
- deaktivierte Supportspur im Normalprodukt, geschlossene Fehler-/Operationswerte
  und den ausschließlich manuellen Debug-Skill.

## Produktregression

```text
npm run test:ci
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
git diff --check
```

`test:ci` umfasst Parser-, Source-Preflight-, Inhaltserhalt-, PII-, Credential-,
Picker-, Handoff-, Batch-, Review-, Recovery-, Mapping-, Retention-, MCP- und
adversariale Verträge. `build:plugin` verweigert einen Quell-ZIP-Build ohne
vorher attestierte, zielsystemspezifische Runtime. Der ZIP-Gate prüft
Runtime-Evidence, Binärhash, Node-Lizenz, Dateimodi, Größenbudget und den
umgeschriebenen Startbefehl. `npm run build` ergänzt SPDX-SBOM und SHA-256.
MCPB, SEA und deaktivierte OCR-Artefakte erfüllen diese Produktgates nicht.

### Gepackte Standalone-App unter Windows

`npm run test:standalone:conversion` prüft den echten isolierten Produktkonverter
mit Office, Text-/Scan-/Hybrid-PDF, Bildern, Abbrüchen und einer 100-TXT-Serie.
Es benötigt die gepinnten lokalen Buildressourcen für Node, PDF.js, Canvas und
Tesseract einschließlich DE/EN-Modellen. Es lädt nichts automatisch herunter.
Dieses native Zielhostgate ist ausdrücklich **nicht** Teil des kostengedeckelten
Ubuntu-Quell-CI. `PKG-04` führt es verpflichtend vor seinen zwei Builds aus;
zusätzlich prüft jeder gepackte Sidecar-Smoke beide Modi mit echten Eingaben.
Die neutralen Modus-, Journal-, Recovery-, Artefakt- und Exporttests bleiben im
normalen Produktgate. Fehlende native Vorbereitung darf kein Paket-PASS ergeben.

Nach `npm run build:standalone:windows:portable` prüft der Paket-Smoke auch das
von Tauri verwendete Windows-Verbatim-Pfadformat (`\\?\C:\…`). Zusätzlich
startet der folgende lokale Zielhost-Test die wirklich gebaute Tauri-EXE
kurz sichtbar, wartet auf bestätigte Antworten des gepackten Sidecars und beendet
ausschließlich seinen eigenen Testprozess:

```text
npm run test:standalone:native-windows
```

Der Test extrahiert den angegebenen Kandidaten in einen frischen Pfad und
bindet vor dem ersten Produktzugriff ein eigenes Testprofil für AppData,
Dokumente, temporäre Dateien, Diagnosen und WebView. Ein fehlendes oder
unvollständiges Profil an einem reservierten Smoke-Pfad stoppt vor dem Start;
ältere Binaries ohne diesen Vertrag werden nicht gestartet. Die reale
Anwenderinstallation, deren Recovery und deren Aufbewahrungsdaten bleiben
außerhalb des Tests. Die Desktop-Hülle erbt dabei ihre normale Windows-
Umgebung; ausschließlich bekannte DataSecure-/Node-/Tauri-/WebView-/Proxy-
Injektionen werden entfernt. Der WebView-UDF liegt in einem zufälligen,
identitätsgebundenen Testroot unter `LocalAppData`. Erst der Sidecar erhält die
vollständig isolierten Profil-, Dokument-, Temp- und Diagnosepfade. Der Test
verlangt über eine pro Prozess eindeutige Diagnose-Session `webview_profile_ready`,
`setup_started`, `setup_completed`, `sidecar_started`, `service_initialized`, `page_loaded`, `frontend_ready` sowie bestätigte
`get_ui_context`- und `get_public_state`-Antworten. Er muss in einer echten
interaktiven Windows-Sitzung laufen; eine Dateisystem-Sandbox, die WebView2
nicht initialisiert, ist keine gültige Zielhost-Evidenz. Er ist ein Windows-E0-Gate,
aber kein Ersatz für den sichtbaren Anwenderlauf mit Dateiauswahl und Export.

`PKG-04` ist das reproduzierbare Windows-Paketgate. Es akzeptiert ausschließlich
einen sauberen `main`-Commit, leert den Cargo-Buildzustand vor jedem Lauf, baut
denselben Commit zweimal und verlangt bytegleiche ZIP-, Desktop-EXE- und
Core-EXE-Hashes. Beide getrennt aufbewahrten Kandidaten durchlaufen Paketprüfung,
echte Worker-Übergabe bis zum dauerhaften Endzustand und nativen Binary-Smoke:

```text
npm run test:standalone:pkg-04 -- -ExpectedCommit <vollständiger Commit>
```

Erst nach `PKG-04 PASS` schreibt der Runner eine separate
`INT-13-BINDING.json`. `INT-13` bindet damit genau einen Kandidaten an Commit,
ZIP-SHA-256 und den Hash des PKG-04-Receipts; `latest`, Versionsnamen oder der
überschriebene Stage-Ordner sind keine zulässige Bindung. Die Aussage ist auf
denselben Host und die im Receipt ausgewiesene Node-/npm-/Rust-/Cargo-Toolchain
begrenzt.
Receipt-Schema v2 bindet zusätzlich Betriebssystembuild, Prozessarchitektur
sowie Version und Installationsscope der verwendeten WebView2-Runtime; Pfade
und Benutzerdaten werden nicht aufgenommen.

Der native Windows-Smoke startet die Tauri-Hülle bewusst kurz sichtbar. Ein
mit `WindowStyle Hidden` oder `Minimized` erzeugtes Top-Level-Fenster kann die
WebView2-Seiteninitialisierung auf einem realen Windows-Host aufschieben und
wäre deshalb kein gleichwertiger Nachweis des Endnutzerstarts. Nach bestätigtem
`page_loaded`, `frontend_ready`, Core-Start und den ersten beiden IPC-Antworten
beendet der Test ausschließlich seine eigene Prozessinstanz.
Bleibt der Lauf vor `setup_started`, meldet er
`STANDALONE_NATIVE_WEBVIEW_INITIALIZATION_TIMEOUT`. Danach unterscheiden
`STANDALONE_NATIVE_SETUP_TIMEOUT`, `STANDALONE_NATIVE_PAGE_LOAD_TIMEOUT`,
`STANDALONE_NATIVE_FRONTEND_READY_TIMEOUT` und `STANDALONE_NATIVE_IPC_TIMEOUT`
die belegte letzte Phase.

Die Testbereinigung inventarisiert den eigenen frischen Root vor jeder Löschung
und folgt keinen Verzeichnisverweisen. Vor dem Produktstart sind alle solchen
Verweise verboten. Nach bestätigtem Prozessende ist ausschließlich die von
Windows erzeugte `INetCache/Content.IE5`-Junction zum benachbarten `IE` innerhalb
desselben Testprofils zulässig. Der Test entfernt nur den erneut geprüften Link,
nicht rekursiv dessen Ziel. Unbekannte oder ausgetauschte Links, Elternpfade und
Dateiidentitäten sowie gesperrte Dateien stoppen die Bereinigung. Der Helfer
erzeugt stets einen neuen Scope; zurückbehaltene Alt-Testprofile werden nicht
automatisch erneut bereinigt und gehören nicht in Git oder Release-Evidence.
Windows PowerShell kann für echte Cache-Junctions leere `LinkType`-/`Target`-
Metadaten liefern. Deshalb verwendet der Test die Windows-Reparse-Daten am
No-follow-Handle: ausschließlich Mount-Point-Tag, geprüfte Buffergrenzen und
`SubstituteName`; der reine Anzeigename ist keine Zielautorität. Dieser Vertrag
folgt dem [Windows-Reparse-Datenformat](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_reparse_data_buffer).

Der RC102-Vertrag ergänzt echte Worker-ACKs für Intake, Resume und Review,
zweiphasige Abschlusspräsentation, den automatischen Übergang in den lokalen
Sammelreview sowie den zeitbegrenzten Export-Replay außerhalb des MCP-Startpfads.
Die zugehörigen Direktgates sind `test-batch-executor-startup`,
`test-worker-terminal-presentation`, `test-automatic-local-review`,
`test-automatic-review-worker-flow` und `test-result-export-startup-replay`; sie
sind außerdem genau einmal in `test:product` einsortiert.

`npm run test:status-app` baut und prüft die default-off Cowork-Startkarte und
startet anschließend mit exakt gepinntem `playwright-core` den bereits
installierten Microsoft Edge. Alle sieben begrenzten Zustände werden in DE und
EN mit axe, Rohtext-Canary und ausschließlich dem SDK-Handshake geprüft; ein
zusätzlicher 320-px-/400%-Lauf belegt den Reflow. Es wird kein Browser geladen
oder in ein Produktpaket übernommen. Die Karte bleibt absichtlich eine
Start-Momentaufnahme und behauptet keinen späteren Abschluss.

Die identitätsgebundene private Root-Session besitzt einen eigenen Swap-
Negativtest. Der lokale Vorher-/Nachherlauf mit 100 TXT/CSV/DOCX-Dateien sank
von 149,328/191,247 Sekunden auf 22,085/23,532 Sekunden (kalt/warm). Die Zahl
der Durability-Fsyncs blieb unverändert; dies ist E0 auf dem Entwicklungsrechner,
keine plattformübergreifende Latenzzusage.

Der aktuelle Vertrag umfasst die spawn-bestätigten, unter Windows ausdrücklich sichtbaren
Öffnen-Aktionen, die exakte Markierung der laufbezogenen Zuordnungsdatei und den Standalone-Ablauf
**Start / Verarbeiten / Verlauf** nach DS-086: keine vorausgewählte Betriebsart,
kein automatischer Ansichtswechsel, die letzten 20 eigenen Verarbeitungen.
DS-088 ergänzt die vor Start einzeln oder vollständig korrigierbare Auswahl,
erhaltene Basisnamen und den zuordnungslosen reinen Konvertierungsmodus. Die
Zuordnungsaktion ist nur bei Anonymisierung aktiv.
DS-089 bindet neue Standalone-Ordnerläufe zusätzlich an die vollständige
Wurzel-relative Struktur. `test-source-folder` prüft die Weitergabe eindeutiger
und gleicher Basisnamen, `test-result-folder-export` den verschachtelten
Ergebnisbaum und die exakten CSV-Beziehungen. Der reale Standalone-Paket-Smoke
nimmt seine vier Eingabeformate als Ordnerbaum auf und liest sämtliche Ergebnisse
rekursiv; damit kann kein flacher Testadapter den Produktionsfehler verdecken.
Die direkten Regressionen liegen in
`test-ui-process-policy`, `test-standalone`, `test-standalone-frontend` und
`test-standalone-desktop-contract`. `test-result-folder-export` prüft zusätzlich
atomare Zuordnungspublikation, RC103-Migration, Manipulationsstopp und die
harte Produktgrenze: Originalnamen erscheinen nie im Cowork-Ergebnisordner.

Die RC108-Gegenprüfung ergänzt timer- und generationsgebundene Frontendtests
im regulären Produktgate, zwei schnelle Folgestapel, unsichere Startbestätigung,
Firmenkurzformen mit kollidierenden Rechtsformen und eine eigene Standalone-
Verlaufszeile auch bei ausschließlich gestoppten Dateien, jedoch ohne falschen
Ergebnisordner oder Zuordnungsaktion. Ausstehende
Abschlussmetadaten werden getrennt von Dokumentzählern geprüft; ein Replay darf
weder veröffentlichte Dateien überschreiben noch historische Pläne verändern.
`test-standalone-sidecar` prüft außerdem sieben echte Prozess-/Workerfälle für
EOF, wartende Aktionen, unvollständige/ungültige Frames, Shutdown und geschlossene
Ausgabepipes: der Steuerprozess endet, akzeptierte Arbeit wird autonom fertig.
Die Fixture verändert nur das Timing. Der reale Paket-Smoke verarbeitet nach
dem erfolgreichen Vierformatlauf einen vollständig fehlerhaften CSV-Stapel und
verlangt dafür weder sichtbaren Ergebnisordner noch Zuordnung statt eines
Rückfalls auf den Vorgängerlauf.

## RC111: Endgültige Testurteile und Schnittstellengegenproben

`tests/helpers.js` registriert jeden Fall vor seinem Callback. `done()` wartet
auch bei nicht vom Aufrufer abgewartetem `testAsync` auf alle Fälle und danach
auf genau eine Bereinigung. Späte Fehler, falsche Async-API, unaufgelöste Fälle
und fehlgeschlagene Bereinigung liefern Nonzero-Exit; reale Childprocess-
Sentinels stehen in `test-test-harness.js`. Keine Timer-Verzögerung ersetzt
diesen Abschlussvertrag.

`test-mcp-protocol.js` prüft echte stdio-Frames einschließlich ungültiger
Argumente vor einer zustandsändernden Übergabe. `test-mcp-input-validation.mjs`
prüft die aus dem Toolkatalog generierten Ajv-Validatoren. Native Auswahl und
Prozessstart werden bei den MCP-Fortsetzungsgegenproben bewusst substituiert;
das beweist Dispatch, nicht den nativen Zielhostdialog.
`test-mcp-support-review.js` prüft zusätzlich den echten Support-stdio-Weg,
einschließlich reserviertem Intake vor Journalerstellung, Reparaturdelegation,
ACK/Abbruch und inhaltsfreier Projektion. Eine direkte Rohtextrekonstruktion
im MCP-Elternprozess lässt die Gegenprobe fehlschlagen. Der native Worker wird
hier adaptiert; Orchestrator-, Launcher- und Netzwerkgrenztests prüfen die
zugehörigen produktiven Grenzen getrennt.
`test-standalone-continuation.js` verbindet echte Fortschritts-, Fortsetzungs-,
Review-, Delivery- und Exportlogik; Journal/Locks/UI/Prozessstart sind adaptiert.
Der eigenständige reale Konvertertest fährt XLSX-Fehler und BMP32 dagegen durch
die tatsächliche Aufnahme-/Worker-/Artefakt-/Exportkette.

`test-gateway-e2e.js` heißt aus Kompatibilität noch so, ist aber ein **interner
Gateway-Integritätstest einschließlich historischer Fassaden**. Seine Input-
Queue, Bildfreigabe und Mock-OCR sind kein Beleg für aktive MCP-Werkzeuge oder
aktuelle Bildfreigabe. Aktuelle MCP-/Cowork-Evidenz kommt aus den Protokoll-,
Toolflächen- und Skilltests sowie gesonderter Hostabnahme. Die historischen
Prüfungen bleiben zur Absicherung der noch referenzierten internen Fassaden.
Die RC111-Unicode-Erweiterung dieses Tests startet zusätzlich echte, isolierte
Plugin- und Standalone-Stapel sowie einen reinen Markdown-Stapel. Diese Fälle
sind ausdrücklich von der historischen Fassaden-/Mock-OCR-Evidenz getrennt.

Standalone-only Änderungen erreichen jetzt beide automatischen CI-Pfadfilter.
Es bleibt bei einem kostenbegrenzten Job; native Builds und Konverterressourcen
werden nicht ungefragt als neue automatische GitHub-Jobs ausgeführt.

### RC111: breite Format- und Recovery-Grenzen

`test-wide-privacy-extraction` bindet die gemeldete Quellenart an die tatsächliche
Dateiendung; insbesondere darf ein XLSX-Ergebnis nicht als PPTX oder umgekehrt in
den Privacy-Core gelangen. `test-wide-mixed-batch-recovery` fährt einen echten
Standalone-Stapel aus direkter TXT- und konvertierter XLSX-Quelle in beiden
Reihenfolgen, beendet ihn zwischen den Items und setzt ihn in einem frischen
Prozess fort. Personen- und Unternehmenslabels bleiben stabil, jedes Ergebnis
wird genau einmal publiziert, Originale bleiben unverändert. Auch eine
unvollständige, aber nutzbare breite Extraktion durchläuft die Pseudonymvergabe;
ihr Quellenstatus bleibt getrennt im Manifest gebunden.

Die reale Konvertersuite umfasst 31 Gruppen. DOCX, XLSX, PPTX, Text-/Scan-PDF,
PNG, JPEG und BMP müssen nichtleeres Markdown an die Standalone-Anonymisierung übergeben
und ihre Quellenabdeckung separat erhalten; leere OCR stoppt. PPTX-Negativfälle prüfen alle
XML-/RELS-Teile auf DTD/Entities und Strukturgrenzen. PDF-Annotationen, Outline
und XMP werden gestoppt; standardisierte Info-Metadaten bleiben im reinen
Markdown-Ergebnis sichtbar erhalten.

Der native Windows-Smoke unterscheidet nun die inhaltsfreien Checkpoints
`webview_profile_ready`, `setup_started`, `setup_completed`, `page_loaded`,
`frontend_ready` und die ersten IPC-/Sidecarantworten. Die Tauri-Hülle verwendet
dabei denselben automatisch erzeugten Fensterpfad wie das Produkt; ein früherer
manueller WebView-Sonderpfad wurde entfernt. Fehler dürfen weder durch längere
Timeouts noch durch Lockerung der Sidecar-Isolation in Erfolg umgedeutet werden.

Der commitgebundene RC111-Lauf aus `d45252f` reproduzierte auf dem aktuellen
Windows-Host den ersten Fall: Kandidat A und alle nichtvisuellen Smokes bestanden,
der Lauf endete nach `webview_build_started`. Nach Windows-Neustart wiederholte
der saubere Commit `c77ec592aa95f323bd5b1efe6301b111e7f2f225` dasselbe Urteil.
Die Gegenanalyse belegte anschließend den Testfehler: Der WebView-UDF lag im
Checkout beziehungsweise im temporären Dateibaum und die Desktop-Umgebung war
unnötig vollständig ersetzt. Mit normaler Desktop-Umgebung, einem einzigen UDF
unter `LocalAppData` und isoliertem Sidecar bestehen der neu gebaute RC111-
Arbeitsstand sowie das historische RC109-Archiv den nativen Start bis Frontend,
Core und IPC. Der ältere RC109-Prozess hinterließ nach seinem erfolgreichen
Kontrollstart eine gesperrte Cachedatei; das ist ein getrennt fail-closed
behandelter Cleanup-Testbefund. Der saubere Korrekturcommit
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` besteht anschließend PKG-04 mit
zwei bytegleichen Builds und beiden sichtbaren nativen Starts; INT-13 ist an
dieses Receipt und ZIP-SHA-256
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f` gebunden.

Zusätzlich reproduziert `test-durable-runtime-cache` die im Windows-UAT
beobachtete Cowork-Lebenszyklusgrenze: Nach der lokalen Laufzeitprojektion wird
der ursprüngliche Pluginbaum vollständig entfernt; erst danach muss ein echter
Hintergrundprozess aus dem Cache starten und per IPC antworten.
`test-stable-data-root` belegt, dass ausschließlich eine erkennbare
Claude-Temporärumleitung von Windows-`LOCALAPPDATA` auf das bestehende reguläre
Benutzerprofil zurückgebunden wird. Das reale ZIP-Gate startet dieselbe
Konstellation mit der gebündelten Runtime.

Für einen ausdrücklich angeforderten Supportbuild:

```text
npm run build:debug
npm run test:debug-zip
node tests/test-debug-skill-contract.js
node tests/test-support-trace.js
node tests/test-mcp-protocol.js
```

Das Debug-ZIP ist kein Rolloutartefakt. Nach einem echten Cowork-Fehlerlauf wird
es wieder durch das Normalpaket ersetzt. Die Tests verlangen dieselbe Engine,
manuelle Skillaktivierung, keine Spur im Normalmodus und ein geschlossenes
inhaltsfreies JSON-Schema.

## Engineering-only

```text
npm run build:engineering
npm run test:engineering-artifacts
```

Diese expliziten Befehle dürfen zusätzliche interne Vergleichsartefakte und
Legacy-Preservation-Gates prüfen. Ihr Erfolg ist keine Nutzer-, ZIP-, Marketplace-
oder Cowork-Freigabe. Historische Keyring-/Crypto-Fixtures liegen unter
`tests/legacy` und werden nicht als aktueller Produktpfad importiert.

### Standalone-Vertrag

```text
npm run test:standalone
```

Der Test prüft den getrennten Produktnamespace, die direkte Core-Nutzung ohne
MCP/JSON-RPC, strenge öffentliche Zustände, den begrenzten gerahmten IPC-Kanal,
Tauri-CSP und Capabilities sowie Windows-/macOS-/Linux-Zielbezeichnungen. Der
Desktop-Vertrag läuft zusätzlich im zentralen Produkttest.
`npm run build:standalone:windows:portable` baut und prüft darüber hinaus die
kompilierte Windows-x64-Hülle, eine frisch erzeugte geschlossene
Runtimeprojektion, das selbsttragende Paket und einen isolierten Sidecar-Start
ohne System-Node. Der Paket-Smoke führt mit dem exakt extrahierten Core eine
reale Dateideskriptor-Normalisierung, Aufnahme, Ergebnisordnerwahl, bestätigte
Worker-Übergabe und Verarbeitung bis zu einem dauerhaften Endzustand aus. Er
prüft anschließend den exakten `Lauf-*`-Ordner. Bei Anonymisierung prüft er die
dort atomar veröffentlichte `DataSecure-Zuordnung.csv`; bei reiner Konvertierung
prüft er erhaltene Basisnamen, deterministische Kollisionen und das Fehlen der
Zuordnungsdatei. Die privaten Zielresolver verwenden dieselben nativen
Öffnen-Schaltflächen.
Queue-Schema und Worker-Acknowledge werden vor dem positiven
Handoff doppelt geprüft; Identitäts-Mocks dürfen diese Grenze nicht ersetzen.
Das ersetzt keine menschliche Windows-UAT und keinen nativen
Intel-/ARM-macOS-Nachweis.

## UAT

```text
npm run uat:fixtures
npm run uat:format-corpus
npm run uat:complex-docx
```

Danach folgt die menschliche Durchführung im
[UAT-Testpaket](acceptance/UAT_TEST_KIT/README.md), im
[Standalone-UAT-Testpaket](acceptance/STANDALONE_UAT_TEST_KIT/README.md), im
[100-Dateien-Formatkorpus](acceptance/STANDALONE_100_FORMAT_TEST_KIT/README.md)
und im [komplexen DOCX-Testkorpus](acceptance/STANDALONE_COMPLEX_DOCX_TEST_KIT/README.md).
Der DOCX-Korpus wird als Satz von 15 deterministischen, umfangreichen Dateien
generiert. Die Dateien enthalten
Fließtext, Listen, Tabellen, Kopf-/Fußzeilen, Grafiken und Seitenumbrüche:
neun vollständig fiktive PII-Szenarien sowie sechs neutrale Kontrollen. Der
automatisierte Vertrag nimmt alle Dateien über den realen Produktpreflight auf,
parst sie und prüft Ersetzung, Erhaltungsanker sowie stapelweit gleiche Personen-
und Unternehmenspseudonyme. Automatisierte Tests können
Fresh Install, echte Berechtigungsanzeigen, Fokus/Screenreader, OS-Dateisystem,
100-Dateien-/500-MiB-Lauf und Fach-/Datenschutzfreigabe nicht ersetzen.

## Umgang mit Fehlern

Ein unvollständiger Lauf ist kein PASS und kein Performancewert. Sandbox-, Host-
oder Toolzugriffsfehler werden getrennt von Produktfehlern dokumentiert. Testlogs
enthalten keine Originalinhalte, Dateinamen, Pfade, Tokens oder Dokumenthashes.
