# Eingebettete SEA-Parserrolle V1 – Engineering, kein Release

Stand: 31.08.2026 · RC72 · BL-010.1/BL-010.8.

**Aktuelle Scopekorrektur DS-065 / RC80:** Der Produktpfad verwendet keine
zusätzliche Arbeitsdatenverschlüsselung und keinen Keyring. Historische
Keyring-Smoke-/Session-/Credential-Testaufträge in diesem Dokument sind obsolet,
nicht bestanden und nicht auszuführen. Parser-/Stapel-/Abbruch-/Fortsetzungstests
bleiben relevant, erhalten aber keine neue Schlüsselbund-Infrastruktur als
Vorbedingung. Keine VM, kein Zusatzkonto. Verschlüsselte Altbestände bleiben
unverändert; es werden nur synthetische neue Plain-Stapel getestet.

## Zweck und Architekturgrenze

Der bisherige MCP-SEA-Launcher kann normale Node-Workerargumente nicht ausführen.
Dieser Teilschnitt baut deshalb eine **separate, feste Parserrolle** aus dem
bereits vorhandenen offiziellen Node-22.23.2-Archiv. esbuild bettet Parser und
Netzwerk-Guard ein; nur Node-Builtins bleiben extern. Keine Downloads, allgemeine
Node-CLI, vom Aufrufer gelieferte Skripte oder lesbare Installationsverzeichnisse.
Das normale Plugin startet weiterhin `node`; dieser Parser wird nicht ausgeliefert.

`parser-bootstrap.cjs` erlaubt ausschließlich Extension und stdin-Descriptor `0`:
TXT, MD/Markdown, CSV, DOCX. Andere Formate, Dateipfade, Zusatzargumente, Node-Flags
und Descriptor `3` werden zurückgewiesen. Ein einziger fest codierter Probeaufruf
prüft die Grenzen, ohne beliebige Aktionen anzunehmen. Der normale Node-Worker
behält seinen bisherigen Descriptorvertrag; seine Schutzprüfung erfolgt jetzt
vor Parserimport und Eingabelesen. Der Netzwerkmarker muss unveränderbar sein.

SEA-Konfiguration: `--permission`, `--disable-proto=throw`, 384-MiB-V8-Heap,
keine `--allow-*`-Flags und `execArgvExtension: none`. Die Argumente gelten schon
beim Prozessstart. Es gibt kein nachträgliches Aktivieren dieser Rechte über
`process.permission`. Grundlage: offizielle [SEA-Dokumentation Node 22.23.2](https://nodejs.org/download/release/v22.23.2/docs/api/single-executable-applications.html)
und [Permission-Dokumentation](https://nodejs.org/download/release/v22.23.2/docs/api/permissions.html).

## Sicherheitsnachweis und Grenzen

Die echte Windows-Probe startet den kopierten Parser unter dem verifizierten
nativen Job-Supervisor aus einem fremden Arbeitsverzeichnis mit leerem `PATH`
und absichtlich ungültigem `NODE_OPTIONS`. Synthetische Formatdaten müssen exakt
mit dem direkten Parserergebnis übereinstimmen. Rechteproben verlangen feste
Fehler für fremdes Lesen, Schreiben, Child-Prozess, Worker, Inspector, native
Addons und WASI. Der Netzwerk-Guard umfasst auch beide DNS-Resolver-Prototypes
(Callback und Promise), ergänzt durch HTTP(S), TCP, TLS, UDP, HTTP2, Fetch,
WebSocket und Listener. Tests verwenden ausschließlich synthetische/lokale Ziele;
die Promise-Resolver-Regression nutzt ein ungültiges Argument ohne DNS-Anfrage.

Node erlaubt implizit das Lesen seines eigenen Einstiegprogramms; dies ist keine
allgemeine Dateileseberechtigung. Darum prüft der Test eine separate Canarydatei.
Die Node-Permission-Prüfung und der API-Guard sind **keine vollständige
Betriebssystem-Sandbox gegen beliebigen bösartigen Code**. Native Ressourcen-
begrenzung und die unveränderten Produkt-/Hostgates bleiben erforderlich.
Ein nur auf einen Teilpfad begrenztes Grant ist mit `has(scope)` allein nicht
auszuschließen; maßgeblich sind die fest eingebettete Konfiguration und ihre Tests.

## Build- und Quellbindung

`build-sea-parser.mjs` akzeptiert nur das gepinnte Herstellerarchiv und zunächst
Windows x64. Ausgabe exklusiv in einem neuen direkten Unterordner von `dist`;
vorhandene Artefakte werden nicht ersetzt. Eigene temporäre Bäume werden vor
Cleanup auf reguläre Typen/Links geprüft. Keine Rohdokumente als Build-Eingabe.

`sea-parser-bundle.mjs` hasht genau die beim Bündeln gelesenen Dateien.
`verify-sea-parser.mjs` rekonstruiert unabhängig das gesamte aktuelle Bundle:
vollständiges sortiertes Inventar, Bundlehash, Konfiguration und Build-/Lock-
Nachweise müssen exakt übereinstimmen. Leere, gekürzte, duplizierte, geänderte
Inventare und eingeschobene Grants werden abgelehnt. Binärlänge/-hash und
Launcher-Vertrag werden zusätzlich geprüft. Dies ist lokale Provenance, **keine
Signatur, keine Binärattestation und kein Ersatz für vertrauenswürdige Buildtools**.

## RC71: gebundener Parent-Dispatch

`build-sea-launcher.mjs --parser-directory ... --node-archive ...` bindet die
unabhängig rekonstruierte Parser-Provenance in den Windows-SEA-Parent ein. Das
gehashte offizielle Node-Archiv muss genau das zum Bauen verwendete Nodeprogramm
enthalten. Die neue Ausgabe wird exklusiv angelegt; keine alten Builds ersetzt.
Die Quellen bleiben offline. Der allgemeine Parent-Builder ohne Parserrolle ist
weiterhin kein positiver Parser-/Release-Nachweis.

Der Parent definiert `__DATASECURE_PARSER_ROLE__` als unveränderbare tief gefrorene
Datenstruktur mit Schema `datasecure-sea-parser-role/v1`, Ziel, Nodeversion,
Parserlänge/-hash und vollständigen gebundenen `server_files`. Diese Liste ist
die **Parserclosure**, nicht die ganze Parent-, Resolver- oder Probeimplementierung.
`loadParserRole` prüft Provenance, führt aber nicht selbst die echte Rechteprobe
aus. Der separate `verify-sea-parser.mjs`-Lauf bleibt erforderlich.

`sea-parser-role.js` aktiviert den Vertrag ausschließlich bei echtem
`node:sea.isSea()`. Ein Umgebungswert kann das nicht einschalten. Fester Pfad:
`server/runtime/<target>/datasecure-parser[.exe]`; kein Skript-/Pfadparameter und
kein System-Node-Fallback. Rolle, Array und Einträge dürfen keine Proxies,
Getter oder Extrafelder enthalten. Linkfreie Eltern, reguläre Einzellink-Dateien,
Zielheader und SHA-256 werden geprüft. Lesen erfolgt begrenzt am offenen
Descriptor mit Identitätsprüfung davor/danach und erneuter Pfadprüfung.

Unveränderte Binär- und **alle** gebundenen Quelldateiidentitäten werden gecacht
(einschließlich `mtime`/`ctime` und Elternidentitäten), sodass
weitere Konvertierungen nicht erneut rund 87 MB hashen. Änderungen invalidieren
die Bindung. Dies ist keine native Exec-by-Handle-Garantie: Der verbleibende
Pfadwechsel zwischen letzter Prüfung und Betriebssystemstart ist ausdrücklich
keine vollständig geschlossene Grenze gegen bösartige gleichzeitige Manipulation.

`runtime.js` startet die SEA-Rolle ausschließlich mit Extension und `0` unter dem
verifizierten nativen Windows-/POSIX-Supervisor. Fehlender POSIX-Supervisor stoppt;
der normale Node-Pfad behält seinen bisherigen Vertrag. SEA-Execution-Testoptionen
sind verboten und werden nach der Prüfung nicht erneut gelesen. Dies schließt
auch wechselnde Getterwerte. Cancellation, Zeit-/Speicher-/Ausgabebudgets und
Graphvalidierung bleiben wirksam. Vor dem Spawn wird die Bindung erneut geprüft.

Ein fester Engineering-Probeparameter im Parent prüft zweimal TXT/MD/Markdown/
CSV/DOCX ohne Start-Seams. Er ist kein MCP-Tool und nimmt keine Rohdateipfade an.
`verify-sea-parent-parser.mjs` prüft den echten Parent zusätzlich beim normalen
MCP-Start sowie mit fehlendem/manipuliertem Parser und geänderten gebundenen
Quellen, bei leerem PATH und fremdem CWD. Keine freigegebenen PII-Inhalte oder
positive V2-MCP-Evidenz: `privacy_release_verified` bleibt `false`.

## RC72: feste interne Hintergrundrollen (Windows x64)

`background-role-launcher.js` startet im echten SEA ausschließlich dasselbe
Elternprogramm mit einem von drei vollständigen Flags:

| Flag | Fester Einstieg | Privater Transport |
|---|---|---|
| `--datasecure-batch-worker` | `gateway/batch-worker.js` | JSON-IPC, detached; Batch und Intake |
| `--datasecure-review-worker` | `gateway/review-worker.js` | JSON-IPC, detached |
| `--datasecure-companion` | `companion/stdio-server.js` | stdin/stdout, 32-Byte-Startgeheimnis über FD3 |

Keine zusätzlichen Node-Binärkopien, Skriptpfade, Argumente oder Spawn-Overrides.
Geerbte Node-/IPC-Startvariablen werden entfernt; `spawn` erzeugt den neuen
Kanal. Grundlage ist der [offizielle Node-22-Child-Process-Vertrag](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html).
Vor dem Rollenimport: SEA-/Windows-Gate, lebender IPC-Kanal für Batch/Review,
Parserbindung, linkfreie feste Einstiegspfade und unveränderbarer Netzwerk-Guard.
Die Parserbindung attestiert **nicht** die gesamte Nebenrollen-Quellclosure.
SEA-POSIX bleibt gesperrt, normale Node-Aufrufe bleiben unverändert.

Der Companion-Ready-Handshake ist technisch auf zehn Sekunden begrenzt. Das ist
kein Timeout für menschliche Entscheidungen. Abbruch verwirft das Geheimnis und
offene Anfragen unabhängig vom OS-Exit. Bereits beobachtetes Ende bzw. angeforderte
Beendigung verhindert erneutes Beenden einer möglicherweise neu vergebenen PID.
Der bestehende Windows-Prozessbaum-Kill hat ein separates Zehn-Sekunden-Budget;
die Probe behauptet daher keine harte Gesamtlaufzeit von acht/zehn Sekunden.
FD3 liest höchstens 33 Bytes, akzeptiert ausschließlich exakt 32 und verwirft den
temporären Puffer. Negative Proben enthalten keine echten Dateien oder Tokens.

Die echte Parentprobe prüft neun Nebenrollenfälle: ungültige Starts, Trennung
vor Start, fehlendes synthetisches Journal, ungültige Intake-Queue, authentifizierte
Companion-Capabilities und ungültiges Startgeheimnis. Bei sofortigem Disconnect
kann Node/Windows `close` auslassen: IPC-Worker verlangen tatsächliches `exit`
plus `disconnect`; Companion-Pipes weiterhin `close`. Disconnect allein ist nie
ein Abschlussnachweis. Fehlerausgaben enthalten nur feste Codes und Stufennummern.
Dies belegt keinen vollständig erfolgreichen Stapel, Resume oder Datenschutzrelease.

## RC73: Lifecycle und Plan für den positiven Stapelnachweis

Der gemeinsame Executor installiert Fehlerbehandlung vor jeder PID-Prüfung.
Fehlgeschlagener Spawn ohne PID benötigt keinen `exit`-Nachweis; bei gültiger PID
beweisen weder IPC-Fehler noch eine erfolgreiche Killanforderung das Prozessende.
Pending-Zustand und erworbene Lease bleiben bis zum tatsächlichen Exit erhalten.
Veraltete Rückrufe dürfen keinen späteren Start bereinigen. Diagnose-Ereignisse
`*_worker_exited` entstehen nur für beobachtete OS-Exits, höchstens einmal.
Startfehler verwenden feste `*_ipc_failed`-/`LOCAL_WORKER_SPAWN_FAILED`-Werte.
Restzustands-/Fehleranzeigen starten wie Terminalanzeigen detached. Das neue
`completion_notice_dispatched` bestätigt nur die Startanforderung, weder Sichtbarkeit
noch Schließen eines Fensters. Dies ist kein UI-Abnahmenachweis.

**Voraussetzung für die folgende noch offene Probe:** geprüftes Testdesign im
vorhandenen Windows-Konto. Keine zusätzliche System-VM (DS-062), kein zusätzliches
Windows-Konto (DS-063). Der bisherige kontoabhängige Harness bleibt gesperrt.
`EU_PRIVACY_ROOT` und temporäres `LOCALAPPDATA`
isolieren Dateien, aber nicht den durch `installation-secret-store.js` festgelegten
Service-/Accountnamen. Kein Umbenennen vorhandener Credentials, kein Lesen des
Produktschlüssels für einen Test, keine neue Produkt-Umgebungsvariable zur
Schlüsselumleitung. Sichere Testtrennung und Harness sind E0-Entwicklungsarbeit,
keine externe Infrastrukturaufgabe. Die Engineering-Komponentenbasis ist unten
beschrieben; native Backendprobe und Prozessbindung sind weiterhin offen.
Sie belegt keine unveränderte Produkt-/OS-Abnahme. Host-/UX-Abnahme bleibt E1/E2.

Verbindlicher nächster Nachweisschnitt:

1. Frische, quellgebundene Parent-/Parser-/Supervisor-Assembly. Fester Probeaufruf,
   fremdes CWD, leerer PATH, keine Execution-Overrides und keine beliebigen
   Rohdateipfade als Argument. Die Probe erzeugt ausschließlich synthetische
   TXT-/CSV-/DOCX-Quelldateien und merkt sich Bytes, Hash und Dateidentität lokal.
2. Echter `launchBackgroundRole('batch')`-Start und privates `start-local-intake`-
   IPC. Tatsächliches Prozessende plus konsistentes Journal: drei freigegebene
   Dateien, keine offenen/retrybaren Einträge, drei eindeutige Pakete. Ergebnis-
   und Auslassungsgrade prüfen, synthetische PII darf nicht im Markdown stehen;
   Qualifikation `Scrum.org PSM I` bleibt erhalten, Originale bleiben unverändert.
   Nach außen nur feste Codes und Zähler, keine Testinhalte/Schlüssel/Quellpfade.
3. Separater IPC-Disconnect nach `local-intake-processing-started`: Worker beendet
   den Stapel trotz Trennung. Das ist ausdrücklich **kein** Parent-Crash-Test.
4. Tatsächlicher Parent-Abbruch: äußerer Prüfer beendet einen verschachtelten
   Probe-Parent; detached Worker und dauerhaftes Journal werden unabhängig geprüft.
   Der RC75-Worker-Abbruch beobachtet den non-durable `extracted`-Zwischenmarker
   des letzten bildfreien Dokuments, erst nach Parser-`close`. Nach bestätigtem
   Ende über `continueMostRecentBatch()`, festen Workerlauncher und Lease
   fortsetzen; der GUI-Starter `startLocalBatchExecutor()` bleibt ein separater
   Nachweis. Kein Power-Loss-/Fsync-Test. Keine doppelten Pakete oder übersprungenen
   Einträge, bereits veröffentlichte Ergebnisse bleiben identisch.
5. Zu schnelle Fixtures zählen nicht als bestandener Crash-Test: Wird der
   erforderliche Abbruchpunkt nicht erreicht, feste Meldung und **kein PASS**.
   Keine manipulierten Journale, ersetzten Parser oder ausgeschalteten Gates als
   vermeintlich echter Nachweis. Ausreichend große deterministische Testdaten sind
   zulässig. Prozess-/Temporärdaten-Cleanup bleibt auf eigene Testartefakte begrenzt.

Die direkte Nebenrollenprobe deckt weder den realen Dateidialog noch die
Cowork-Interaktion/Abschlussanzeige ab. Positive V2-Evidenz entsteht erst durch
den vollständigen vereinbarten Prüfpfad, nicht durch diesen Plan.

## RC74/RC75: implementierter Opt-in-Stapelharness

`scripts/verify-sea-batch.mjs` setzt den Positivlauf und den separaten Disconnect-
Fall aus dem obigen Plan um; RC75 ergänzt Worker-Crash/Fortsetzung.
**Noch kein ausgeführter nativer Positivnachweis.**
Die Prüfung ist nicht Teil von CI/Build. Der bisherige Startvertrag verlangt ein
eigens bereitgestelltes Testkonto und ist seit DS-063 nicht mehr zur Ausführung
vorgesehen. Bis zum sicheren Neuentwurf nicht im vorhandenen Konto starten.
`--isolated-test-account` ist eine verpflichtende Operator-Erklärung, keine
technische Isolationserkennung. Ein zusätzliches Verzeichnis allein reicht nicht.

Feste synthetische Quellen werden exklusiv in einem frischen markierten Scope
erstellt; `LOCALAPPDATA` und `EU_PRIVACY_ROOT` sind exakt an zwei Unterpfade
gebunden. Alle Scope-Eltern müssen linkfrei und unverändert sein. Die Fälle
laufen seriell, weil getrennte Dateiordner keine parallelen Keyring-Initialisierungen
isolieren. Die Probe verwendet den Produktworker ohne Parser-/Krypto-Overrides.
Sie verlangt Worker-Exit plus IPC-Ende, terminales Journal, drei eindeutig gebundene
Pakete/Manifestgrade, erhaltene Qualifikation, keine verbleibenden synthetischen
Namensbestandteile/Kontakte und genau eine Mappingzeile pro unverändertem Original.
Der äußere Prüfer wartet zusätzlich auf `close` der Ausgabepipes.

Startframe: 30 Sekunden; gesamte Probe: 120 Sekunden einschließlich Wartephase
und fünf Sekunden Exitreserve; äußerer Verifier: 150 Sekunden. Ein Zeitablauf
beweist keine Beendigung. Nur eigene gehaltene ChildProcess-Instanzen werden
begrenzt gestoppt; der synthetische Baum wird immer behalten. Keine Rohinhalte,
Pfade, Tokens oder Schlüssel im Ergebnis. `privacy_release_verified` bleibt
`false`; `os_isolation_attested` und `parent_crash_verified` im Verifier ebenfalls.
`worker_resume_verified` darf nur nach bestandenem Worker-Resume-Fall wahr sein.

Worker-Abbruch/Fortsetzung ist seit RC75 implementiert. Die Probe pollt nur das
readonly Journal (20 ms, begrenzte Lesefehler und Gesamtlaufzeit). Zwei fertige
Pakete und genau das letzte `processing/extracted`-Item ohne Paket-ID müssen vor
und nach dem Kill dieselben IDs behalten. Der letzte DOCX enthält keine Bilder:
sein Parser ist bereits geschlossen, ein weiterer Dokumentparser folgt nicht.
Bereits freigegebene Dateien müssen byte-/hash-/identitätsgleich bleiben.
Ein zu schneller Lauf scheitert mit `SEA_BATCH_CRASH_POINT_NOT_REACHED`.
Der echte Produktpfad nutzt Fortsetzung, Workerlauncher, Lease und privates IPC,
keine Parser-, Krypto- oder Journal-Schreibhooks. Neue Ergebnisflags
`worker_crash_observed` und `released_packages_preserved` sind nur bei diesem
Szenario wahr. Die normale positive/Disconnect-Probe muss dort `false` liefern.

`cleanup_safe` beobachtet den direkten Workerabschluss; insbesondere bei
Fehler-/Timeoutpfaden ist das keine generelle Prozessbaum-Attestierung.
Ein Quellreview fand mögliche Output-Staging-Reste nach Hard-Crash. RC76 ergänzt
identitäts-/herkunftsgebundene Recovery (BL-011.11) in einem getrennten privaten
Stagingbereich. Der Harness verlangt sowohl exakte Outputpakete als auch eine
leere, fehlerfreie Staginginventur; bei Resten `SEA_BATCH_RESULT_INVALID`.
Keine Lösch-/Filterausnahme im Harness. Node-Prozesscrashtests ersetzen keine
native Reproduktion, Cowork- oder Power-Loss-Evidenz.

Für echten Parent-Crash fehlt zusätzlich die Integration eines sicher
gehaltenen nativen Windows-Prozesshandles des verwaisten Workers. RC78 liefert
den getrennten synthetisch geprüften Beobachter (unten); PID-Polling
oder erfolgreiche Killanforderung allein genügen nicht. RC77 bindet Bootstrap und
ganzen Pluginbaum im Build-/Assembly-Vertrag; unveränderbare Laufzeitbindung
externer Nebenrollenmodule und finale V2-Assembly bleiben offen.

Historischer Startbefehl des kontoabhängigen Harness, seit DS-063 **nicht
ausführen**. Die Verifier-CLI blockiert jetzt auch mit gültiger Bestätigung vor
Assembly-I/O (`SEA_BATCH_TEST_ISOLATION_PENDING`). Der Schalter erstellt keine
Isolation und darf nicht als Umgehung
im vorhandenen Konto gesetzt werden. Frische Engineering-Artefakte allein
genügen ebenfalls nicht:

```powershell
node scripts/verify-sea-batch.mjs --parent dist/sea-parent-engineering-NEU/datasecure-mcp.exe --parser-directory dist/sea-parser-engineering-NEU --isolated-test-account
```

Optional `--scenario positive`, `--scenario disconnect` oder `--scenario worker-resume`;
standardmäßig alle drei nacheinander. Ergebniscode 0 bedeutet nur, dass die ausgewählten begrenzten
Engineering-Fälle bestanden haben, keine Produkt-/Cowork-/Plattformfreigabe.

## RC78: Engineering-Prozessbeobachter, Windows x64

`native/sea/process-observer.cpp` ist kein produktiver Supervisor und wird weder
im Plugin ausgeliefert noch automatisch in CI gebaut/ausgeführt. Vorhandene
MSVC-Toolchain 19.50.35725, Windows SDK 10.0.26100.0; keine neue Runtimebibliothek.
Der Builder akzeptiert ausschließlich ein neues `dist/sea-observer-*`-Verzeichnis
und behält den Baum auch bei Fehlern. Quell-/Builder-/Binärhashes sind
Konsistenznachweise, keine Signatur oder unabhängige Buildattestierung.

```powershell
npm run build:sea-observer -- --output-directory dist/sea-observer-NEU
npm run test:sea-observer-native -- dist/sea-observer-NEU
```

Diese Probe startet ausschließlich eigene synthetische Node-Prozesse ohne
Produktimporte, Dokumente oder Keyring. Nur dafür ist kein separates Produkt-
Testkonto nötig. Direkte native Aufrufe erhalten fünf feste Argumente:
Worker-PID, 32-stellige Hex-Pipe-ID, 64-stellige Hex-Nonce, absoluten Imagepfad
und Timeout 100–120000 ms. Keine Shell, frei wählbaren Kommandos oder Killrechte
im Beobachter. First-Instance-Pipe lehnt Remoteclients ab. Ein einziges
`OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION)` hält den Worker
bis zum Ende gebunden. Vor `armed`: Pipe-Client-PID, Imagepfad, nichtleere
Erstellungszeit sowie `hello/challenge/ready` mit derselben Versuch-Nonce und
erneute Lebend-/Clientprüfung. Die Erstellungszeit ist kein unabhängig vom
Starter gelieferter Sollwert. Der kooperative Handshake ist keine kryptographische
Authentisierung bösartiger Clients und keine OS-Isolationsattestierung.

Geschlossene JSON-Zeilen (`datasecure-sea-process-observer/v1`):
`listening` → `armed` → `exited` mit uint32-`exit_code`; nur signalisiertes
gehaltenes Handle plus erfolgreicher `GetExitCodeProcess` zählen. Code 259 ist
nach Signalisierung ein gültiger Exitcode. `failed` enthält nur einen festen
Fehlercode. PID, Pfade, Nonce, Inhalte und Schlüssel werden nie ausgegeben.
Ausstehende I/O wird abgebrochen und die Completion maximal fünf Sekunden
bestätigt; andernfalls Helperprozessende ohne Unwinding noch lebender I/O-Puffer.
Deadline/erfolgreiche Killanforderung allein sind kein Worker-Endnachweis.
Host-Sleep/OS-Scheduling sind keine garantierte harte Echtzeitfrist.

Der JS-Vertrag verlangt zusätzlich Helfer-Exit 0, kein Signal/kein stderr und
exakte Ereignisfolge. Ausgabe ist gemeinsam auf 4096 Bytes begrenzt; Überlauf
bleibt gelatcht, beendet nur den eigenen Helfer und puffert nichts weiter.
Negativtests verlangen ihren spezifischen Fehlercode und erwartetes `armed`;
zusätzliche fehlerhafte Ausgabe darf auch dort nicht PASS ergeben.

Die detached-Testworker besitzen eine kurze eigene Exitfrist und beenden sich
nach IPC-Ende selbst. Zehn native Fälle trennen kontrolliertes Parentende,
gezielten Parentkill und Worker-Ende. **Das belegt weder einen echten SEA-
Produktstapel noch dessen Fortsetzung, Durability, vollständiges Prozessbaum-
Cleanup oder Cowork-Freigabe.** `verify-sea-batch.mjs` bleibt ohne aktivierten
Parent-Crash-Fall. Nächster E0-Schritt: Observer-/Worker-Handschlag in den echten
Produkt-Harness integrieren, Parent-Ende separat beobachten und vollständige
Journal-/Paket-/Staging-/Mappingoracles beibehalten; Ausführung erst nach geprüftem
Testdesign im vorhandenen Konto (DS-063).

API-Grundlagen: [Windows-Prozesshandles](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers),
[OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess)
und [Pipe-Client-PID](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid).

## RC79: zusätzlicher Parent-Sequenzvertrag und Integrationsplan

Optional erhält der Observer nach seinen fünf Argumenten `--parent-pid <PID>`.
Parent und Worker müssen verschieden sein; der Observer selbst ist kein Parent.
Auch das Parenthandle bleibt bis Ende gehalten, nur Synchronisations-/Abfrage-
rechte. Imagepfad muss dem erwarteten selben SEA-/Test-Nodeprogramm entsprechen;
Erstellungszeit ist nichtleer, beide Prozesse sind vor `armed` lebend geprüft.
`WaitForMultipleObjects` priorisiert das Workerhandle: endet es zuerst oder sind
beide bereits beendet, gilt `OBSERVER_WORKER_ENDED_BEFORE_PARENT`. Nach signalisiertem
Parent muss eine unmittelbare Workerprüfung noch lebend ergeben. Nur dann folgt
`parent-exited`, danach wie bisher signalisiertes Workerhandle und Exitcode.

Der JS-Vertrag aktiviert dies nur mit einem echten Boolean `true` und verlangt
`listening → armed → parent-exited → exited → Helferabschluss`. Er liefert dann
zusätzlich `parent_exit_observed` und `worker_alive_at_parent_exit`; niemals
`parent_crash_verified`. Die Folge ist keine Abstammungsattestierung. Der
Controller muss den erwarteten eigenen Parent und dessen Worker unverwechselbar
binden. Ein natürlicher Parentexit beweist keinen gezielt ausgelösten Crash.

Architektonisch festgelegte nächste Integration (noch nicht implementiert):

1. Feste, nicht öffentliche Engineering-Worker-Rolle im SEA-Bootstrap, private
   Startframe-/Scope-/Provenienzprüfung vor Produktimport. Normale Rollen unverändert.
2. Nur dort feste lokale Observer-Pipe und Nonce-Handshake **vor** unverändertem
   Netzwerkguard; erst nach vom Controller bestätigtem `armed` die Pipe geordnet
   schließen, Guard prüfen, anschließend Batchworker importieren. So kann die
   letzte native Clientprüfung nicht mit vorzeitigem Pipe-Schließen konkurrieren.
   Keine allgemeine Pipe-Allowlist oder exportierte ungepatchte `connect`-Funktion.
   Zusätzlicher privater Bereitschaftsframe verhindert verlorene Startnachrichten.
3. Äußerer Controller hält eigenen Parent, Observer und Oracle-Ausgangsdaten.
   Erst native Beobachtung aktivieren, dann normalen Stapel starten. Crashpunkt:
   zwei freigegebene Pakete, drittes bildfreies DOCX `processing/extracted`, kein
   folgender Parser. Nur eigenen Parent beenden, nicht den beobachteten Worker.
4. Parent-/Workerfolge unabhängig belegen. Ein verpasster Crashpunkt, Timeout oder
   zu früher Workerexit ist NO-GO; synthetische Dateien behalten, keine PID-Suche.
5. Frischer fester SEA-Prüfmodus vergleicht zuvor gesicherte Quell-/Paketidentitäten
   und vollständige Journal-/Mapping-/Staging-/Ergebnisoracles. Kein automatisches
   Resume in diesem Szenario: geprüft wird Weiterarbeit nach Parentende.

Die ersten 47 Vertrags-/Budgettests und 17 nativen Prozessfälle benötigen keine
VM, Produktimporte oder Credentials. Die echte Produktprobe bleibt bis zu einem
geprüften Testdesign im vorhandenen Konto gesperrt. DS-062/DS-063 verwerfen die
frühere VM-/Zusatzkonto-Option. Echte Windows-/macOS-Abnahme bleibt nötig.
Das Gegenreview empfiehlt für den Anschluss zusätzlich gezielte native Fälle
für bereits vor `armed` beendeten Parent und falsches Parent-Image. Diese
Ablehnungen sind implementiert, aber nicht gesondert in der 17er-Matrix ausgeführt.

## Ausführung und offene Integration

```powershell
node scripts/build-sea-parser.mjs --target windows-x64 --node-archive dist/sea-input/node-v22.23.2-win-x64.zip --output-dir dist/sea-parser-engineering-NEU
node scripts/verify-sea-parser.mjs --directory dist/sea-parser-engineering-NEU
node scripts/build-sea-launcher.mjs --target windows-x64 --node dist/sea-input/node-v22.23.2-win-x64/node.exe --node-archive dist/sea-input/node-v22.23.2-win-x64.zip --parser-directory dist/sea-parser-engineering-NEU --output dist/sea-parent-engineering-NEU/datasecure-mcp.exe
node scripts/verify-sea-parent-parser.mjs --parent dist/sea-parent-engineering-NEU/datasecure-mcp.exe --parser-directory dist/sea-parser-engineering-NEU
npm run test:sea-gates
```

Die Quelle bleibt offline; `NEU` bezeichnet ein noch nicht vorhandenes Ziel.
Ein normaler Testlauf prüft Verträge/Quellbindung, erzeugt aber keinen nativen
Build. Die lokale echte Probe ist ein zusätzlich auszuführender Nachweis.

E0 für den Windows-Parent-/Parser-Dispatch ist nachgewiesen; POSIX-Zwang ist
technisch verankert, Zielheader/Dispatch sind simuliert geprüft. Noch E0-offen:
Nach RC72 fehlen vollständige positive SEA-Stapel-/Resume-Läufe, Parent-Abbruch
nach Start, unveränderbare externe Modulbindung und reale POSIX-Build-/Integration.
Der Parent verlangt seit RC77 geschlossene V2-Buildprovenienz einschließlich
Bootstrap, Konfiguration und aktueller Toolchain. Alte Builds müssen nach
Quelländerungen neu erstellt werden; nur die MCP-Evidenz zu erneuern genügt nicht.
Finale Assembly muss alle Rollen samt Nachweisen binden. Danach echte kombinierte
Parser-/Privacy-Grenzen und V2-MCP-Evidence für alle Ziele. Der Legacy-MCP-Prüfer
bleibt NO-GO; weder die separate Parserprobe noch der feste Parent-Probeaufruf
darf allein als vollständige `parser_boundary`-/Privacy-Release-Evidenz dienen.

Separate Rollen verdoppeln zunächst den Node-Binäranteil; das ist ein bewusster
Engineering-Vergleich, keine behauptete Größen- oder Geschwindigkeitsoptimierung.
Vor Distributionsentscheidung sind Paketgröße, Start-/Batchlatenz und ein lokal
gebündelter Standard-Node als Alternative zu vergleichen. Anschließend E1:
Windows/macOS/Linux-Zielsysteme, Cowork-Fresh-Install und Update/Rollback.

## DS-063: Engineering-Testtrennung im vorhandenen Konto

Der erste Komponentenschnitt liegt ausschließlich unter
`scripts/lib/engineering-keyring-session.mjs`, außerhalb des Produkts. Er
verwendet die vorhandene `Entry`-Injektion, ohne Produkt-Service/-Account oder
Runtime-Konfiguration zu ändern. Der Service ist fest
`de.msg.datasecure.engineering.private-artifacts.v1`; der Account entsteht intern
einmal pro Session aus 32 kryptografisch zufälligen Bytes. Service/Account/Session-ID
sind keine frei übergebbaren Parameter. Der bisherige Produktnamen-Aufruf wird
vor Backendzugriff exakt geprüft und nur auf dieses eigene Paar abgebildet.

Backend-Entry muss explizit injiziert werden. Kein nativer Defaultimport,
Credential-Listing, Löschpfad, Dateifallback oder ENV-Umschalter. Ein belegter
Testeintrag wird weder übernommen noch ersetzt. Erster Schreibwert wird per Digest
gebunden; `setPassword` muss synchron `undefined` liefern und ein anschließender
Readback denselben Schlüssel bestätigen. Backend-/Readback-/Digestfehler bleiben
terminal. `close()` sperrt alle Entry-Instanzen ohne Dateisystem- oder
Credential-Bereinigung. Es gibt keine Rekonstruktion aus fremden Session-IDs.

Ausgeführt wurden ausschließlich Memory-Spy-Backends mit einem unangetasteten
Produkt-Sentinel und frisch erzeugten synthetischen Dateiwurzeln. 24 Komponenten-
und Negativfälle prüfen unter anderem echte AES-/Commit-/Wiederöffnungspfade für
Snapshots/Review, falsche Bindung/Session, Ciphertext-Manipulation, Schlüsselverlust,
Kollisionen, ungewisse Speicherung und Wiederholungsversuche. 18 statische
Boundary-Gates (plus zwei Archivprüfungen mit `--archives`) halten den Adapter aus
Produktquellen/Launch-Konfiguration/ausführbaren ZIP-/MCPB-Inhalten heraus.
Dies ist eine bekannte Marker-Regressionsprüfung, kein allgemeiner Codebeweis.

Der Produktstore bezeichnet auch einen injizierten Memory-Entry in `ensureReady()`
als `native_os_keyring`. Deshalb benennt der Testbericht unabhängig den wirklichen
Backendtyp: **Memory, kein Nachweis nativer OS-Persistenz**. Getrennte Namen sind
außerdem keine Sicherheitsgrenze gegen beliebigen anderen Code im selben OS-Konto
und beweisen keine plattformweite Kollisions-/Atomizitätsgarantie. Der Backend-
Adapter ist eine explizit vertrauenswürdige Engineering-Abhängigkeit, keine
Sandbox für bösartige JavaScript-Implementierungen.

Die alte Verifier-CLI blockiert nach den bestehenden Argumentprüfungen zwingend
vor Assembly-I/O mit `SEA_BATCH_TEST_ISOLATION_PENDING` (10 Vertragsfälle).
Dies schaltet weder alte Binärartefakte um noch gibt es native Proben frei.

Früher geplanter E0-Ausbau, **seit DS-064 zurückgestellt** (nicht erledigt):

1. Fester privater Session-/Scope-/Buildvertrag zwischen Engineering-Controller,
   Worker, Fortsetzung und frischem Ergebnisprüfer. Alle müssen vor dem ersten
   Artefaktzugriff denselben isolierten Testkontext erhalten; keine globale
   Require-Manipulation, Produkt-ENV oder Schlüsseltransport über Logs/Argumente.
2. Separat gegengeprüfte native Backendprobe nur im eigenen Engineering-Namensraum,
   ohne Produktcredential-Zugriff. Aufbewahrung und spätere Bereinigung eigener
   Testcredentials vor Ausführung festlegen; keine automatisierte globale Löschung.
3. Erst danach neue quellgebundene SEA-Artefakte, echte Stapel-/Abbruch-/Resume-
   und Ergebnisprüfungen. Bis dahin keinerlei SEA-/OS-/Cowork-Freigabe aus dem
   Memory-Komponentenschnitt ableiten.

**Aktuelle Reihenfolge DS-064:** vorhandene Memory-Komponenten-/Recoverytests,
kleiner nativer Windows-Schlüsselbund-Smoke-Test mit eindeutig eigenem temporären
Eintrag (Schreiben, Lesen/Vergleich, nur diesen Eintrag entfernen), danach normaler
Cowork-Ablauf. Kein Namespace-Manager, kein zusätzlicher Testdienst und keine
prozessübergreifende Testsession als Vorbedingung. Der kleine Smoke-Test ist noch
zu implementieren und auszuführen; die vorhandene alte SEA-Verifier-Sperre bleibt.
Das Fehlen der vollen Kombinationsmatrix bleibt als Testgrenze dokumentiert.
