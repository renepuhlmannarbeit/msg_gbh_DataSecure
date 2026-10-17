# Aktueller Iststand

Stand: 17.10.2026 · 3.2.0-rc163 lokaler Windows-Testkandidat in Vorbereitung; veröffentlicht bleibt Standalone RC162 für Windows und beide Mac-Architekturen; M2-Zielhostabnahme offen; Linux RC159 / Cowork RC151

### RC163: lokales Windows-Testpaket und gemeinsamer Quellstand-Freeze

Auf ausdrücklichen Auftrag werden die verbliebenen Clippy-Befunde ohne
Lint-Unterdrückung bereinigt und der integrierte Stand erneut geprüft.
Getrennte Quellenreviews decken Rust/IPC/OS-Besitz, fachliche Benutzerführung
und die Paket-/Runtime-Projektion ab. Erst nach den Prüfungen werden der
vorgesehene Quellstand und seine gesperrten Abhängigkeiten lokal festgehalten
und daraus ein neues Windows-ZIP in einem eigenen Engineering-Verzeichnis
gebaut. Alte Releasearchive und fremde temporäre Dateien bleiben unberührt.

Die spätere ARM-Mac-Version soll exakt denselben eingefrorenen Quellstand
mit demselben Feature-Stack verwenden. Ein Windows-Paket oder Quellenreview
ersetzt weder einen Mac-Build noch die ausdrücklich spätere M2-Probe.
Kein GitHub-Release, Push, macOS-Runner oder Produktions-GO ist beauftragt.
[RC163-Prüf- und Freeze-Nachweis](../acceptance/RC163_LOCAL_WINDOWS_CANDIDATE_20261017.md).

### Lokal umgesetzte Durchsatzrunde: Arbeit sparen, Schutzgrenzen erhalten

Nichtfinale native Speicherchunks benötigen keinen neuen OS-Thread;
endgültige Schreib- und Steuerbefehle behalten ihren Worker und NativeGuard.
Ein direkter nativer ACK prüft die fertige Kopie einmal frisch statt vierfach;
ein erstmals gespeicherter Abschlussbeleg behält beide Inventardurchgänge.
Der unveränderliche Plan-Digest wird nur pro Transaktionsinstanz wiederverwendet.

Die globale History inventarisiert Owner-Namen pro Aufruf und prüft den
Bestand am Ende erneut: im 320er-Dateisystemprofil zwei statt 320 Auflistungen.
Recovery und Hinweisdateien werden erst für die höchstens 20 sichtbaren
Kandidaten gelesen; ältere Ergebnisse bleiben erhalten. Ein zusätzlicher
echter Sidecar-Lauf fand ein Rennen mit gerade neu angelegten Review-Ordnern.
Die veraltete reine Leseprojektion wird dafür einmal vollständig verworfen
und unter denselben Namespace-Bindungen frisch aufgebaut. Austausch, Links,
entfernte Namen und erneuter Bestandswechsel bleiben geschlossen.

Unabhängige Quellenreviews und gezielte Gegenproben prüfen diese Änderungen.
Windows-Rust 162 bestanden / 3 regulär ignoriert, Store 62/62, Service 64/64,
echte Node→Rust-Kopie und Produktisolation grün. Keine parallelen Schreiber,
persistenten Freigabecaches oder gelockerten OS-/Hashprüfungen. Früher
Retention-Capture und absolute 300-Sekunden-Exportfrist bleiben bestehen.
M2, native Paketabnahme und eine neue Version bleiben späteren Schritten
vorbehalten. Einzelheiten stehen im bestehenden Post-RC162-Prüfbericht.

### Lokal fortgeführt: Exportbeobachtung und laufgenaue History

Alle bisherigen lokalen Änderungen sind erhalten. Die lokale Fortsetzung
ergänzt eine nur beobachtende, an den genauen Exportauftrag gebundene native
Fortschrittsanzeige. Gestagte Dateien sind noch kein fertiger Export; Erfolg
bleibt an Abschlussbeleg und ACK gebunden. Native Statusabfragen umgehen nur
den seriellen Core-Lock, nicht dessen Prüfungen oder Schreibautorität.

Ein erneuter Quellenreview fand außerdem zwei Folgeprobleme: Die fertige
Kopie blieb während des optionalen Dokument-Neuladens scheinbar offen, und
einzelne History-Detailaktionen hatten trotz globaler Leser nur 30 Sekunden
Budget. Der Erfolgsdialog wird jetzt vor diesem Reload abgeschlossen und
schließbar. Ein weiterer offener Auftrag kann diesen Dialog nicht mehr auf
seine eigene Kennung umstellen. Die Fortschrittsmeldung steht vor der langen
Dateiliste und erhält nach ausdrücklichem Start den Fokus; nach ACK führt er
auf „Schließen“.

Produktive History-Detail- und Öffnungsaktionen lesen ihren genauen Lauf,
statt den gesamten Bestand zu projizieren. Vier solche Aktionen verwenden
jetzt die bestehende 300-Sekunden-Leserklasse. Der echte Dateisystemtest mit
128 fremden Läufen zeigt keine fremden Dateiöffnungen oder globalen
Verlaufsauflistungen; Retention, Beschädigung und Originalordnerbindung bleiben
geprüft. Windows-Rust 155 bestanden / 3 ignoriert, Renderer 84/84,
Workspace 135/135, echte Node→Rust-Kopie, Sidecar-/OCR-/Fastweg-Kette,
Produktisolation und erneute Headless-Fokus-/Reflow-/axe-Probe sind grün.
Das Exportbudget wird durch Fortschrittsmeldungen nicht verlängert. M2-Test,
neues Paket und Veröffentlichung bleiben späteren Gates vorbehalten.

### Performance und Diagnose lokal umgesetzt, M2-Test später

Der M2-Zielhosttest ist auf Wunsch des Anwenders bis zu einer später neu
erzeugten, zur Entwicklung passenden Testversion zurückgestellt. Aktuell
wurden Exportleistung, früher Verlaufs-Capture und ein auch ohne Core
nutzbares Diagnosepaket weiterentwickelt und getrennt quellenbasiert geprüft.
Keine neue Version oder Release wird in dieser lokalen Runde erstellt.

Neue Exporte führen Planung, Restdatenprüfung und Zuordnung gemeinsam aus;
der frische Quelldurchgang vor der Kopie bleibt erhalten (zwei statt vier
vollständige Lesedurchgänge). Unveränderte frühe Export-Sicherung verwendet
einen an tatsächliche Bytes gebundenen Capture-Index. Der 320er-Metadaten-
Profillauf reduzierte wiederholte Review-Listen von 320 auf eins; keine
Freigabe oder aktuelle Zielprüfung wird aus dem Index abgeleitet. Geänderte
Grundlagen erzwingen weiterhin den vollständigen Abgleich.

Ein einzelnes lokales JSON-Diagnosepaket lässt sich auch bei Core-Ausfall
speichern. Es enthält nur erneut validierte technische Felder und nennt
fehlende, verworfene und gekürzte Teile. Windows-spezifisches Append-Sharing
gilt nur für den Diagnoseleser; Export-/Journaldateien bleiben streng geprüft.
Die Integritäts-/Integrationstest-Matrix trennt gemeinsame Fachregeln von
Windows- und macOS-Datei-, Prozess-, Dialog- und Paketnachweisen.
Erneut grün: Store 62/62, Windows-Rust 147 bestanden / 3 ignoriert,
echte Node→Rust-Exportintegration, Produktisolation und Headless-Reflow/axe.
Native Speicherdialoge und neue Windows-/Mac-Pakete sind noch nicht abgenommen.

### Erstinstallation und fehlender Ergebnisordner

Im unveröffentlichten Stand wird zusätzlich ein ausdrücklich wählbarer
**Schnellweg für Standalone-Anonymisierung** integriert. Die gespeicherte,
unveränderliche Policy behandelt bekannte Mehrdeutigkeiten und OCR-Kontaktbereiche
durch automatische Maskierung; sie erfindet keine menschlichen Bestätigungen.
Nur ein tatsächlich veröffentlichter, erneut technisch geprüfter Basisstand
erhält die gekennzeichnete automatische Erstfreigabe. Änderungen und Widerruf
bleiben nach Neustart unfreigegeben, bis eine neue ausdrückliche Freigabe erfolgt.
Der KI-Export startet weiterhin nur ausdrücklich. Alte Läufe und das Plugin
erhalten die Automatik nicht nachträglich.

Die direkte Quellcode-Gegenprüfung fand und korrigierte zusätzlich falsche
Abschlussüberschriften bei teilweise verfügbaren Dokumenten und nach fertiger
Automatik. Die aktuelle Laufkarte nennt den technischen Abschluss prominent;
der aktuelle Dokument-/Kopiestatus bleibt davon getrennt. Native Startablehnungen
vor Workerübergabe (fehlender Ergebnisordner oder noch nicht gesendete,
wartende Anfrage) erhalten die vorbereitete Auswahl.
Der tatsächliche projizierte Runtime-Durchlauf mit getrennten Core-/Worker-
Prozessen und echter OCR ist bestanden: drei automatisch freigegebene Ergebnisse,
ein korrekt ausgeschlossenes defektes CSV, Neustart, dauerhafter Widerruf und
eine nur ausdrücklich ausgelöste KI-Kopie. Dabei gefundene Kanonisierungs- und
`/4`-Ergebnisexportlücken wurden korrigiert. Der neue Stand ist damit noch kein
neu gebautes oder nativ abgenommenes Windows-/Mac-Paket. Die abschließende
Gesamtregression wird getrennt dokumentiert; einzelne grüne Kerneltests sind
kein Releasebeleg.

Die Standalone-Gesamtregression ist inzwischen einschließlich Rust (137
bestanden, drei ignoriert) und tatsächlicher Sidecar-/Worker-/Exportabläufe
bestanden. Spätere Korrekturen der OCR-Hinweisanzeige werden durch gezielte
Publikations-, History-, Service-, Renderer- und echte Fastweg-Tests ergänzt.
Erfolgreich erzeugte Dateien mit OCR-/Quellenhinweisen bleiben abgeschlossen,
erscheinen aber nicht mehr als hinweisfrei. Der separate kleine Hinweis-Cache
verhindert Rückschreiben alter Laufzähler und erhält bekannte Mindestzahlen;
die Verlaufsliste liest statt alte Zustände über neue Workerabschlüsse zu
schreiben. Regelmäßige Statusabfragen lesen dafür keine Dokumentkörper.
Native Windows-Bedienabnahme und M2-Zielhosttest bleiben offen.

Die lokale Nach-RC162-Runde unterscheidet inzwischen auch verlorene oder
ersetzte bereits konfigurierte Ordner von einer Erstinstallation. Solche
Ziele werden nicht automatisch durch den Standard ersetzt. „Ordner erneut
prüfen“ erkennt den zurückgebrachten Originalordner und erhält die Dateiauswahl.

Sammelfreigabe und Widerruf mehrerer Dokumente verwenden lokal einen gemeinsamen
revisionsgebundenen Auftrag und Commit. Wartende, noch nicht gesendete
Core-Anfragen liefern `STANDALONE_IPC_BUSY`. Ein separater Rust-Aktivitätsspeicher
bleibt über den nativen Status auch bei belegtem Core-Kanal lesbar. Er meldet
Aktivität, keine Freigabe oder fertige Kopie. Bekannte nicht verarbeitete Quellen
verhindern keine ausdrücklich angeforderte Vorschau der verfügbaren freigegebenen
Dokumente; deren Ausnahmen bleiben im Dialog sichtbar.
[Review und Prüfgrenzen](../acceptance/POST_RC162_BATCH_IPC_FOLDER_REVIEW_20261017.md).

Ein noch nicht existierender Ergebnisordner ist beim ersten Start ein
erwarteter Zustand. Die Root-Trennungsprüfung akzeptiert fehlende
Konfiguration; die Oberfläche zeigt zunächst nur den vorgeschlagenen
Ordner. Erst bei einem ausdrücklich gestarteten Lauf wird der Ordner
angelegt und gebunden. Scheitert das (etwa an einem verwalteten
`Documents`-Ordner), verweigert der lokale Stand den Lauf jetzt mit dem
festen, pfadfreien Code `STANDALONE_RESULT_ROOT_UNAVAILABLE` und empfiehlt
eine explizite andere Ordnerwahl. Das ist **nicht** die Erklärung für den
RC161-M2-Absturz: Die Diagnose belegte den Prozessabbruch vor der ersten
Sidecar-JavaScript-Initialisierung und vor jedem Aufruf dieser Funktion.
Das lokale Mac-Bundle enthält nun außerdem eine verständliche
`NSDocumentsFolderUsageDescription` für eine mögliche macOS-Nachfrage beim
Zugriff auf „Dokumente“. Dieser Text erteilt weder selbst eine Berechtigung
noch umgeht er Organisationsrichtlinien; der gebaute Bundle-Inhalt muss auf
einem Mac noch geprüft werden.

Die lokale Nach-RC162-Runde macht außerdem den abgeschlossenen Null-Ergebnis-
Lauf im Verlauf nur mit konsistenten gespeicherten Zählern prominent, trennt
vollständig belegte Null-Ausnahmegründe von nach Aufbewahrungsende unbekannten
Gründen und zeigt zusätzliche feste Windows-/Mac-Startursachen an. Diese
Änderungen sind **nicht** Bestandteil des veröffentlichten RC162 und noch
keine Zielhost-Abnahme. [Priorisierter Arbeitsplan](BACKLOG.md#integrierter-arbeitsplan-nach-rc162-einfachheit-ohne-falsche-sicherheit).

### RC162: konkrete Mac-Signaturlücke und verbesserte Startdiagnose – Paketgates bestanden

Der RC161-Core wurde auf dem M2/macOS 26.2 tatsächlich gestartet und brach
16-mal vor Ready mit `SIGTRAP` ab. Ein Quell- und Buildreview fand eine
konkrete Signaturlücke: Tauri signierte den gebündelten Node-Core mit Hardened
Runtime, entfernte dabei aber dessen JIT-Entitlement. Der veröffentlichte RC162-Stand
signiert nur diesen Core mit `com.apple.security.cs.allow-jit`, bindet die
signierten Bytes neu an die Runtime-Evidence und versiegelt anschließend die
App. Der Mac-Workflow prüft die endgültigen Entitlements, Runtime-Flags,
Signaturen und gebündelten Starts. Dies ist eine plausible, aber am Zielhost
noch **nicht bewiesene** Ursache für den RC161-Abbruch.

Bei erneutem frühen `SIGTRAP` prüft der Desktop den gebündelten Core höchstens
einmal pro App-Prozess in zwei sicheren Stufen: nur Node-Version und dann
Minimalstart mit dem Netzwerk-Preloader, jeweils ohne Shell oder Dokumente.
Feste Fehlercodes, Signal-Klasse, PID und Dauer werden protokolliert; keine
rohen Ausgaben, Pfade oder Inhalte. Desktop-Diagnosen rotieren nun in bis zu
acht exklusive 2-MB-Segmente statt nach dem ersten vollen Segment still zu
enden. Während der anfänglichen Core-Bereitschaft zeigt die Oberfläche einen
klaren Startstatus und sperrt die Dateidialoge; nach Trap gibt es keine
endlose automatische Neustartfolge. Die manuelle Statusprüfung bleibt
möglich und startet keine Datenverarbeitung.

CI, Security, Windows-Paket und beide Mac-Runner bestanden auf Quellcommit
`310925f59d76fddc955288eef3c3b0ef4297c232`. Alle zwölf Release-Assets
wurden gegen lokale Größe und SHA-256 geprüft. Der reale M2-Finder-Test bleibt
ein getrenntes Gate. RC162 darf nicht als auf dem betroffenen Rechner behoben
beworben werden, bevor dort Core-Ready und Datei-/Ordnerauswahl bestätigt
sind. [Prüfvertrag und Grenzen](../acceptance/RC162_MAC_CORE_SIGNING_AND_DIAGNOSTICS_20261016.md).

### Negativer M2-Zielhosttest von RC161 – Core vor Ready abgestürzt

Die nachgereichten Desktop-Diagnosen des M2 mit macOS 26.2 zeigen einen
echten Prozessstart des gebündelten ARM-Core, aber 16 sehr frühe Abbrüche
mit Signal 5 (`SIGTRAP`) vor Sidecar-Ready. ZIP und DMG scheiterten auf
diesem Zielhost; Datei- und Ordnerauswahl bleiben mangels lokaler Verbindung
gesperrt. Die Kopien der Diagnoseanhänge sind keine unabhängigen Läufe.
Weder die seit RC161 unveränderte Mac-Paketierung noch die lokalen
Existenzprüfungen für Laufzeitdateien beheben diesen nachgewiesenen Fehler.
CI-Grün für eine unverquarantinierte App ersetzt den heruntergeladenen
Finder-Kopierweg auf einem verwalteten M2 nicht. Die konkrete SIGTRAP-Ursache
ist noch offen; RC161 und der unveröffentlichte Stand sind **nicht** als
M2-funktionsfähig abgenommen. [Evidenz und nächste Diagnose](../acceptance/RC161_M2_CORE_START_SIGTRAP_20261016.md).
Der lokale Desktop schreibt für einen künftigen Versuch nun auch
macOS-Version, Prozess-ID, Bootstrap-Dauer und nur den Vorhandenseinsstatus
des Quarantäne-Merkmals inhaltsfrei. Die vollständige
Standalone-Quellsuite ist grün (native Rust-Tests: 129 bestanden,
3 ignoriert); sechs bediente Windows-GUI-Fälle und die M2-Zielhostprobe
sind dadurch nicht ersetzt.
Ein nativer `SIGTRAP` wird jetzt als fester UI-Fehler erklärt und beendet
automatische Verbindungsversuche nach dem ersten Fehlschlag; manuelle
Statusprüfung bleibt ohne automatischen Lauf oder Export möglich.

### Mehrperspektiven-Quellreview nach RC161 – unveröffentlicht

Die aktuelle lokale Runde prüfte Bedienung, Fachlogik, Rust-/Node-Export,
Startup-/Recovery-Architektur und Mac-Verteilung auf Code-Basis. Korrigiert
sind: der Wechsel auf einen anderen Lauf trotz ungespeichertem Entwurf nach
Verbindungsabbruch; die irreführende Phase `completed_without_results`;
zu wenige Textabschnitte im älteren kanonischen Originalvergleich; mehrfache
Journal-Auflistung bei einer Exportvorbereitung; sowie die erst beim Export
erkannte Volume-Grenze des Ergebnisordners. Der native Fehler wird bereits
bei der Ordnerbindung mit verständlichem Hinweis abgelehnt, ohne unsicheren
Kopier-Fallback. Inhaltsfreie Startup-Phasen und Laufzeiten machen die
synchrone Sicherung vor Retention und die ausdrücklich angeforderte
Ergebnis-Nachholung künftig unterscheidbar.

Die Schutzgrenzen bleiben bestehen: OCR-/Freigabeentscheidungen werden nicht
automatisch bestätigt, Revision und Hash bleiben exportgebunden, der
Startup-Capture bleibt vor Retention synchron, die KI-Kopie wird nicht
stillschweigend wiederholt. [Befunde und Abnahmegrenzen](../acceptance/RC161_LOCAL_MULTIDIMENSION_REVIEW_20261016.md).
Quelltests für diesen lokalen Stand sind bestanden; das lokale Paketgate
bleibt gesondert zu protokollieren. Ein neuer Release oder erfolgreicher Mac-Zielhostbeleg liegt
nicht vor; das veröffentlichte RC161 ist unverändert.

### Weitere lokale Korrekturrunde nach RC161 – noch kein neues Paket

Die explizite Ergebnis-Nachholung meldet nun getrennt, ob der gebundene
Ergebnisordner wirklich verfügbar ist, der Versuch noch offen blieb, gar kein
neuer Versuch erfolgte oder der Versuch fehlschlug. Passive Verlaufsabfragen
liefern kein solches Nachholergebnis und starten weiterhin keine Kopie. Der
Renderer prüft Batchbindung und die feste Ergebnismenge vor der Anzeige;
Dateipfade oder rohe Fehlermeldungen werden dabei nicht ausgegeben. Geöffnete
Verlaufsdetails werden nach einer veränderten Listenprojektion neu geladen,
statt als leere Fläche zu erscheinen.

Ein laufender Dokumentexport zeigt im Dialog seine verstrichene Wartezeit.
Das ist **kein** Dateifortschritt und keine Bestätigung, dass ein blockierter
Core noch arbeitet. Erst der Abschlussbeleg bestätigt die Kopie. Der Timer
wird nach Antwort oder Verbindungswechsel beendet; ein alter Antwortpfad
darf einen jüngeren Timer nicht beenden. Exakt gleiche OCR-Kontaktlesarten
bleiben je Fundstelle entscheidbar, erhalten aber eindeutige zugängliche
Beschriftungen mit Dokument- und Positionskontext. Die macOS-Startdiagnose
schreibt feste, inhaltsfreie Komponenten-Codes für fehlenden Core, Sidecar-
Skript und Netzwerk-Sperrmodul; der bisherige UI-Fehlercode bleibt stabil.
Diese Diagnose identifiziert noch nicht die Ursache auf dem verwalteten M2.

Gezielte History-, Workspace-, Dokument- und OCR-Renderer-Tests sowie die
vollständige lokale Standalone-Quellsuite sind grün (Rust: 128 bestanden,
3 bewusst ignoriert; sechs native Windows-Bedienfälle ausdrücklich `NOT_RUN`).
Ein frisches, unveröffentlichtes Windows-Engineering-ZIP `r6` aus genau
diesem Stand liegt unter
`dist/engineering-rc161-local-20261016-r6/DataSecure-Standalone-3.2.0-rc161-windows-x64.zip`
(112.011.988 Byte, SHA-256
`7f2cde39b132a772737b029fc621ab81db4317483094b6aff19c67aae9916f57`).
Die 1129 Paketeinträge, der isolierte synthetische Sidecar-Paket-Smoke und
ein nativer Windows-Start mit Workspace, Reviewfenster und erfolgreichen
Core-/IPC-Antworten bestanden. Der native Start traf keine
Dokumententscheidung; 1543 eigene isolierte Testeinträge wurden nach
Prozessende bereinigt. Ein bedienter langer Export und die M2-Zielhostprobe
bleiben offen. `r5` und der veröffentlichte RC161 enthalten diese Runde nicht.

### Weiteres Quellcode- und Architekturreview nach RC161 (nur lokal)

Drei unabhängige, schreibgeschützte Reviews der Rust-/IPC-Grenze, der
Anonymisierungs-/Freigabelogik und der Bedien-/Verlaufsarchitektur wurden
gegen den aktuellen Quellstand abgeglichen. Ein neuer Bypass von OCR-Korrektur,
Revisions-/Hashbindung oder neutralem KI-Kopienamen wurde nicht belegt.
Die bewusst wählbaren **Ergebnisdateinamen** sind nicht mit einer vollständig
neutralen Ergebnisstruktur gleichzusetzen: Quell-Unterordnernamen bleiben im
normalen Ergebnisordner erhalten; die UI warnt bereits davor. Die separate
KI-Kopie bleibt flach und neutral. Eine Änderung dieser Struktur wäre eine
eigene Migration und wurde nicht stillschweigend vorgenommen.

Vier konkrete Fehlergrenzen sind im unveröffentlichten Quellstand korrigiert:
Der ausdrücklich gewählte Abbruch eines unvollständigen KI-Exports erhält
wie dessen vollständiger Bestandsabgleich bis zu 300 statt 30 Sekunden;
die nativen, inhaltsfreien Phasenlogs erfassen nun auch eine Aufgabe und
einen fehlgeschlagenen Zwischen-Chunk ohne Dateinamen oder Inhalt. Nach
bestätigtem Export-ACK kann ein bloß fehlgeschlagenes Neuladen der
Dokumentliste nicht mehr die alte Komplettauswahl stehenlassen oder den
abgeschlossenen Export als unklar darstellen. Ein laufender KI-Kopienabgleich
wird im Verlauf nicht mehr von einer allgemeinen/OCR-Statuszeile verdeckt.

Ein zusätzlicher Build-Fehler wurde erst beim erneuten lokalen Verpacken
sichtbar: Eine reine Änderung der Tauri-Oberfläche außerhalb des Cargo-
Paketordners führte bisher nicht zuverlässig zu einem neuen nativen Binary.
`build.rs` überwacht nun das eingebettete Frontend-Verzeichnis ausdrücklich;
ein Paket darf erst nach erneutem Native-Build als neuer Teststand gelten.
Der Gegenversuch änderte ausschließlich Frontend-Inhalt und erzeugte danach
wirklich neue Native-Bytes (SHA-256 vorher
`de3811c14fd741ed305f61ba592d44e10d08e3af0258de588f3c4c4f860a35b5`,
nachher `9ec7b6abcf9129ea241b417d0e14adc0947a90265417b7baaca35e227fd453a9`).
Die älteren Engineering-Pakete `r3`/`r4` sind deshalb keine aktuellen
UI-Teststände. Der unveröffentlichte lokale Windows-Kandidat `r5` wurde
frisch verpackt und mit SHA-256
`ab4a341fe56545a4eb70e631e4b1d8448a0431161c940b65aab557c0f91f66db`
inventar-, nativ-start- und isoliertem Paket-Smoke-geprüft; weder ein neuer Release noch eine
macOS-Zielhost-Abnahme folgt daraus.

Die normale Verlaufsabfrage erstellt keine Ergebnisdateien mehr. Sie wird beim
Start nicht abgewartet, sondern erst beim Öffnen von „Verlauf“ geladen;
sichtbar geöffnet bleibt sie bei Statusänderungen aktualisiert. Sie versucht
keine Ergebnisbereitstellung bei jedem 5-Sekunden-Poll.
Nur „Bereitstellung erneut prüfen“ fordert einen Recovery-Versuch für
**genau diesen** Lauf an. Der unverzichtbare Bootstrap-Schritt, der vor
Retention die bisherigen Zusammenfassungen und Ordnerbindungen sichert,
bleibt synchron und unverändert. Fünf statt 20 Listenzeilen allein würden
ihn nicht beschleunigen. Diese Trennung verkürzt keine nachgewiesene
Core-Initialisierung und ist kein Beweis für einen schnelleren Zielhoststart;
Windows- und M2-Laufzeit müssen mit dem neuen Stand gemessen werden.
Während einer solchen ausdrücklich gestarteten Nachprüfung wird keine
regelmäßige Status-/Verlaufsabfrage in denselben exklusiven IPC-Kanal
eingereiht; ein Doppelklick startet keinen zweiten Nachholversuch.
Gezielte Frontend-, History-, IPC-, Sidecar- und Rust-Tests prüfen die
Grenzen; native Bedienung eines langen Exports sowie Mac-Zielhost bleiben
offen. Keine dieser Änderungen gehört zum veröffentlichten RC161.

### Aktueller Windows-Bericht: 115-Dateien-KI-Export und doppelt wirkender Schritt

Der Anwender hat im RC161-Anonymisierungslauf die lokale KI-Kopie für 115
freigegebene Textstände bestätigt; „Export fertig“ und der Zielordner
`Export-77066d137f1099c105e189cf5db29de5` wurden angezeigt. Die Rückkehr
zur Dokumentprüfung ist keine zweite Exportpflicht. Im zeitlich passenden
inhaltsfreien lokalen Sidecarprotokoll lag zwischen Anfrage und Antwort des
ersten Exports 158,1 s (Vorschau zuvor 8,9 s). Ein zweiter, gesonderter
Exportauftrag dauerte 148,9 s und erscheint im Anwenderbild als weiterer
Ordner `Export-da61e8d71f827f93536f8030d3642b7f`. Die zweite Kopie war
nicht zur Fertigstellung der ersten nötig. Das rote `STANDALONE_IPC_TIMEOUT`
beweist deshalb keinen gescheiterten Export. Quellcode und Logfolge zeigen
als plausible Ursache die weiterhin laufende 120-s-Statusabfrage, während
die exklusive Kopie den lokalen IPC-Kanal länger belegt; die genaue
Desktop-Timeout-Zuordnung ist wegen ausgeschöpftem Desktoplog nicht direkt
belegt. Der lokale Quellstand unterdrückt Hintergrund-Statusabfragen während
einer aktiven Dokumentaktion und ignoriert eine zuvor gestartete, nun
überholte Statusantwort. Warum die Kopie so lange dauert, ist ohne
Phasenmessung nicht geklärt. Nach dem bestätigten Export hebt der lokale
Quellstand die Häkchenauswahl auf, nennt ausdrücklich, dass eine weitere
Kopie nur bei Bedarf nötig ist, und bezeichnet die neue Aktion als „Weitere
KI-Kopie erstellen“. Keine vorhandene Exportdatei wurde verändert.
Der jüngere Screenshot zeigt im Verlauf „Verarbeitung beendet“ mit 115
Ergebnissen, 17 erwarteten OCR-Auslassungen und einem Datenschutzstopp;
der vom Anwender genannte Ergebnisordner enthält lesend geprüft 115
Markdown-Dateien. Nachfolgende `get_public_state`- und `get_run_history`-
Antworten im lokalen Sidecarprotokoll sind wiederholt erfolgreich. RC161
belässt dennoch den alten roten IPC-Hinweis sichtbar, weil ein erfolgreicher
Statusabruf ihn bisher nicht zurücknimmt. Dies ist im lokalen Quellstand
scopiert korrigiert: Nur ein Verbindungs-/IPC-Hinweis wird nach erfolgreichem
Statusabruf durch eine vorsichtige Abgleichmeldung ersetzt; weder die
vorherige Aktion noch der Export werden dadurch erneut oder als erfolgreich
behauptet. Die manuelle Prüfung hat kein Untätigkeits-Timeout; die
beobachtete Pause ist keine nachgewiesene Fehlerursache.

Ein ergänzender lokaler Quellstand hält den Exportdialog während der nativen
Kopie offen und protokolliert im Sidecar nur feste Phasen, Dokumentzahlen und
Zeitspannen (keine Namen, Pfade oder Textinhalte). Die Exportvorschau zeigt
auch den Umfang des gesamten Laufs und die nicht verfügbaren Quellen. Eine
Sammelfreigabe noch nicht in dieser Sitzung geöffneter Stände verlangt eine
gesonderte Bestätigung der eigenen Prüfung und gleicht die gebundene Auswahl
vor dem Speichern erneut ab. Das ersetzt keine menschliche Sichtprüfung.
Historische Belege heißen nun ausdrücklich Belege; die aktuelle
Ordnerverfügbarkeit wird erst beim Öffnen geprüft. Frontendtests sind grün;
ein bedienter Langexport und eine Zielhost-Abnahme dieser Änderungen fehlen.
Der vollständige lokale `npm run test:standalone`-Lauf bestand; die Suite
meldete ausdrücklich, dass sie keinen nativen GUI-Bedientest enthält.
Ein neues, unveröffentlichtes Windows-x64-Engineering-ZIP wurde deshalb
separat unter `dist/engineering-rc161-local-20261016-r2/` gebaut
(SHA-256 `d5cb0382b278e98de7a71def64802fc5dcea4ac0fed1748713d0f9242a302fba`).
Archiv-/Lizenz-/Runtime-Verifikation, isolierte Paket-Smokes für Markdown,
OCR, Anonymisierung, Review, Neustart und Export sowie nativer Windows-Start
mit Workspace-/Reviewfenster- und Core-/IPC-Nachweis bestanden. Dieser
native Starttest traf **keine** Freigabeentscheidung und misst keinen
115-Dateien-Export. Das ZIP ist weder RC161 selbst noch ein neues Pre-Release;
der M2/macOS-26.2-Zielhost ist mit diesem lokalen Stand nicht geprüft.
Ein zusätzlicher Headless-Browsertest der echten HTML-/CSS-/JS-Seiten bestand
für die neue Freigabebestätigung einschließlich Tastatur, Accessibility und
390–1280-px-Reflow; synthetisches IPC ersetzt dabei keine native Bedienung.

Der Einrichtungsbildschirm bietet im lokalen Quellstand für **neue**
Anonymisierungsläufe wieder die vormals vorhandene Wahl zwischen neutralen
Ergebnisdateinamen und Originalname plus „-anonymisiert“. Sie betrifft nicht
den schon gestarteten Lauf und nicht die separate, aus Datenschutzgründen
immer neutral benannte KI-Kopie. Frontend-Vertragstests sind grün; der Stand
ist weder als neue RC-Version veröffentlicht noch nativ bedient abgenommen.

### Lokaler Quellstand nach RC161: OCR-Korrekturvorschläge, Startprojektion und Export-Recovery

Eine **nur lokal paketierte, nicht veröffentlichte** Frontend-Änderung erlaubt
im OCR-Kontaktprüffenster, einen bereits getippten Korrekturvorschlag
ausdrücklich in weitere *exakt gleich gelesene* Werte desselben Kontakttyps
zu kopieren. Vorhandene Eingaben und vorgemerkte Entscheidungen werden nicht
überschrieben; jede andere Bildfundstelle bleibt offen und muss einzeln mit
dem Original verglichen und bestätigt werden. Die Aktion ist gemeinsam
rückgängig zu machen, speichert und exportiert selbst nichts. Der
anonymisierte Weg nutzt dasselbe Prüffenster und dieselbe Sicherheitsgrenze.

Der Standalone-Bootstrap sichert vor der Datenpflege weiterhin alle aktuellen
Laufzusammenfassungen und ursprünglichen Exportordner-Bindungen. Er baut in
dieser Phase aber nicht mehr zusätzlich die komplette sortierte, mit
Identitäts-/Ergebnisprüfungen angereicherte Verlaufsanzeige auf. Die
Verlaufsanzeige wird erst beim Öffnen des Tabs geladen, bleibt bei 20
Einträgen und kopiert im lokalen Folgestand keine Ergebnisdateien. Die kontrollierte Nachholung eines
sichtbaren Exports erfordert die ausdrückliche Aktion „Bereitstellung erneut
prüfen“ für genau diesen Lauf. Eine bloße Kürzung auf fünf Einträge hätte
den sicherheitsrelevanten Bootstrap nicht beschleunigt. Der gemeinsame Plugin-Bootstrap und die native
Windows-/macOS-Verpackungsregeln wurden nicht verändert. Der lokale
Windows-App-/Core-Start ist geprüft; ein bedienter Funktionslauf und der
M2-Zielhosttest dieses unveröffentlichten Standes fehlen.

Die [read-only-Nachprüfung der drei Windows-Markdown-Läufe](../acceptance/RC161_WINDOWS_THREE_RUN_AUDIT_20261016.md)
bestätigt 133/133, 133/133 und ohne OCR 116/133 sichtbare Ergebnisse mit
382/382 Exportdateien in Beleggröße und SHA-256. Die 17 Auslassungen ohne
OCR sind erwartete Richtlinienfolgen; Inhaltswarnungen sind kein Nachweis
inhaltlich fehlerfreier OCR. Relevante Frontend-, Kontakt-, History-,
Standalone-, Bootstrap- und Paketvertragstests bestanden lokal. Die gesamte
`npm run test:standalone`-Suite ist grün; sie ersetzt keine native Bedienung.

Ein zusätzlicher, **nur lokal paketierter** Recovery-Fix betrifft ausschließlich
den seltenen Abbruch eines KI-Exports vor der dauerhaften Bindung seiner
privaten Elternordner. Bisher konnte gerade dieser Zustand zwar als unsicher
erkannt, aber selbst mit der ausdrücklichen Aktion „Export aufgeben“ nicht
verlassen werden. Jetzt darf genau die gespeicherte Operation nur dann
dauerhaft als aufgegeben markiert werden, wenn keine Bindung und kein
öffentlicher Exportordner für sie vorhanden sind. Ein vorhandener Ordner,
abweichende Anfrage oder bereits gespeicherter Abschluss bleibt gesperrt;
keine Teilkopie und kein privater Prüfstand wird gelöscht oder als fertig
deklariert. Native Rust- und echte Node/Rust-Integrationstests für diese
Grenze sind grün. Die [lokale Recovery-Abnahme](../acceptance/RC161_LOCAL_EXPORT_RECOVERY_20261016.md)
trennt diese Quellbelege ausdrücklich von einem noch fehlenden bedienten
Windows-Funktionsbedientest und M2-Zielhosttest. Das isolierte lokale
Windows-ZIP wurde gebaut und verifiziert (SHA-256
`b3a06ec475b137884c2947d50e87cbabd2a9a2670e9b277d5325a0a106fe1786`):
Oberfläche/Core/IPC starteten nativ; synthetische Paketabläufe für Markdown,
OCR, Anonymisierung, Review, Neustart und Export bestanden. Das ZIP ist ein
Engineering-Kandidat unter `dist/engineering-rc161-local-20261016-r1`, **kein**
neues RC161-Release oder Mac-Paket.

### RC161 als macOS- und Windows-Test-Pre-Release veröffentlicht – Zielhost-Abnahmen weiter offen

Das [RC161-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc161)
bindet den annotierten Tag an `f96c9e246997e52bf37f21930e2d0a3f978d68b2`.
Apple-Silicon- und Intel-ZIP sowie beide DMGs und vier `.sha256`-Dateien
liegen dort dauerhaft statt nur als eintägige Engineering-Artefakte.
Alle acht GitHub-Assetgrößen und SHA-256-Digests wurden gegen die lokal
heruntergeladenen, paketgeprüften Dateien verglichen. Die vollständige
lokale Standalone-Quellsuite, [CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013420),
[Security](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013905),
[macOS 26 ARM](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013790)
und [macOS Intel](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013523)
bestanden auf genau diesem Commit. Der ARM-Lauf prüfte den App-/Core-Start,
isolierte Konvertierung, signiertes Bundle, ZIP- und DMG-Vergleich und
Paketkonvertierung; Intel prüfte dieselben Paketgrenzen. Diese Evidenz
ersetzt **nicht** den Finder-/Quarantäne-/MDM-Test auf dem betroffenen
M2/macOS 26.2. Die Ursache des RC160-Startfehlers bleibt unbekannt. Die Mac-Pakete
sind ad-hoc-signiert, nicht Developer-ID-signiert oder notarisiert; ausschließlich
synthetische Daten für die Neuprobe verwenden. Das bereits auf RC160
veröffentlichte synthetische 100-Dateien-Testpaket wurde unverändert auch beim
RC161-Pre-Release bereitgestellt (SHA-256
`e73d316f896e6cd1523a0357e4f1c37397b0c9097e9eaf11ce47fb8c153bf010`).
Sein RC160-Dateiname ist beabsichtigt; genau der Ordner
`DataSecure-RC160-Testdaten-100` ist als Eingabe zu wählen.
Der [Windows-x64-Gate-Lauf 38864871810](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38864871810)
aus demselben Tagcommit bestand Quell-, reale isolierte Konverter-, Rust-,
deterministische Paket- und App-/Core-/v2-IPC-Prüfungen aus dem fertigen ZIP.
Das aus dem Workflow heruntergeladene ZIP umfasst 111.998.154 Byte, SHA-256
`11b21608e7811b2c188c64a36499e8813a9886acd2fc061c117667c8eae15f74`;
Manifest und Prüfsummendatei bestanden, und der GitHub-Asset-Digest stimmt.
Windows-Bedienung mit den synthetischen Testdaten ist **noch nicht** abgenommen;
RC160 bleibt als früherer Vergleichsstand erhalten.

### Vorausgehende Nachprüfung des Mac-26-Supervisors (Engineering-Stand vor RC161)

Der erste erneute ARM/macOS-26-Lauf
[38786961975](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38786961975)
baute und signierte den POSIX-Supervisor, stoppte aber mit Exit 121 in der
Serie sehr kurzlebiger `/usr/bin/true`-Kindprozesse. Er erreichte weder
Produktgates noch einen Paketbau. Der alte Exitcode vereinte mehrere
Setup-Pfade; aus diesem Befund allein lässt sich die genaue Ursache nicht
beweisen. Der Supervisor protokolliert nun für jeden 121-Setup-Pfad eine
feste Phase und ggf. numerisches Errno, ohne Argumente, Pfade oder Inhalte.
Der Test nennt bei Fehlschlag Iteration und Exitstatus und prüft 300 statt
100 Kurzprozesse. Die Eltern-`setpgid`-Prüfung liest `errno` nicht mehr nach
einem zweiten Systemaufruf und behandelt `EACCES` gemäß POSIX als bereits
ausgeführtes Kind, dessen eigener `setpgid` vor `exec` verpflichtend war.
Linux-C-Syntax mit `-Werror` und `git diff --check` sind grün. Der
[zweite macOS-26-Gate-Lauf 38787926269](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38787926269)
auf Commit `efe6412` bestand den 300-Kurzprozess-Test und die vollständige
Produktsuite, scheiterte aber später nach 64 erfolgreichen Konvertierungsgruppen
in der echten isolierten Office/Markdown-OCR-Grenze erneut mit
`CONVERSION_ISOLATION_FAILED` (Supervisor-Exit 121). Er erreichte keinen
Paketbau. Die bisherige Testausgabe verschluckte gerade die inhaltsfreie
121-Phasenmeldung des Supervisors; der synthetische Test gibt bei einem
Fehlschlag nun ausschließlich die feste Phase und ggf. numerisches Errno aus.
Welche Phase betroffen war, ist aus diesem Lauf nicht rekonstruierbar. Ein
echter M2-/Finder-/Quarantäne-Nachweis steht weiterhin aus.
Der nächste Lauf
[38789969916](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38789969916)
lieferte beim 19. Kurzprozess den zuvor fehlenden Beleg:
`parent-process-group errno=1` (`EPERM`). Der Elternprozess rief `setpgid`
nochmals auf, während das Kind seine eigene Prozessgruppe bereits setzen
und sehr schnell enden konnte. Die Quellkorrektur entfernt den zweiten
Eltern-`setpgid` und verlangt vor `exec` ein einzelnes Kind-Signal über
eine begrenzt wartende Pipe. Erst danach darf der Elternprozess die
Prozessgruppe überwachen oder beenden. Bleibt das Signal aus, wird der
eigene Kindprozess beendet und als Setupfehler protokolliert; weder
RSS-Grenze noch Gruppenbereinigung werden abgeschaltet. Linux-Kompilation
mit `-Werror` und 300 echte kurze Kinder sind lokal grün. Der erneute
[macOS-26-ARM-Gate-Lauf 38790860955](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38790860955)
auf `1ea56ab` ist vollständig grün: 300 Kurzprozesse, echte isolierte
Konvertierung/OCR, Clippy, signiertes Bundle samt Core-Integritätsbeleg,
privater IPC-Start, reguläres Benutzerprofil, reproduzierbares ZIP,
LaunchServices-Start, Paketkonvertierung und DMG-Vergleich. ZIP und DMG
wurden als **Engineering-Artefakt** für einen Tag hochgeladen (Ablauf
16.10.2026, 19:26 UTC). Dieses damalige Artefakt war kein RC und ist kein
M2-/Finder-/MDM-Nachweis; der spätere RC161-Stand steht oben.
Der Test auf dem verwalteten M2 mit macOS 26.2 bleibt erforderlich.

### Mac-Quellreview nach dem M2-Fehlerbericht (noch kein neues Zielhost-Ergebnis)

Zwei unabhängige Architekturrunden über Rust/Tauri, Node-Startkette,
Bundlebau und macOS-Verteilung bestätigten: Die RC160-Logs belegen
`sidecar_spawned`, **nicht** die Ausführung des JavaScript-Einstiegs oder
ein erfolgreiches Core-Ready. Ohne damalige frühe Sidecar-/stderr-Spur ist
die konkrete M2-Ursache weiterhin unbekannt. Die drei Nutzerlogs enthalten
je genau 16 `STANDALONE_IPC_FAILED`-Antworten. Der Quellcode erklärte die
anschließende Sackgasse: die Oberfläche wiederholte den fehlgeschlagenen
Core-Start alle fünf Sekunden, während Rust nur 16 Wiederanlaufgenerationen
für die sichere Besitzerablösung zulässt. Der aktuelle Quellstand hält die
automatischen Verbindungsversuche nach zwei Fehlern an, bietet die explizite
Statusprüfung weiter an und unterscheidet ein ausgeschöpftes Versuchskontingent
von einem noch laufenden Vorgängerprozess. Kein Lauf/Export wird wiederholt.

Weitere inhaltsfreie Diagnosekorrekturen im Quellstand: Mac-Errno `EBADARCH`
und beschädigte Mach-O-Formate erhalten spezifische Codes; unbekannte
begrenzte Core-Exitcodes/Signale werden numerisch klassifiziert. Das Ready-
Protokoll meldet getrennt, ob der Sidecar-Diagnose-Sink schreiben konnte.
Der CI-Build-Commit und die Zielarchitektur werden im Desktoplog und in der
Oberfläche sichtbar; ein nicht identifizierbarer lokaler Build wird nicht erfunden.
Die Startdiagnose legt ihre Datei jetzt exklusiv unter gebundenem, linkfreiem
Verzeichnis an und überschreibt keine vorhandene Datei. Auf macOS meldet
„Diagnose öffnen“ erst nach erfolgreichem `/usr/bin/open`-Exit Erfolg,
nicht schon nach dessen Spawn. JavaScript-Syntax, Workspace-/Sidecar-
Regressionspfade, die vollständige Standalone-Quellsuite, die getrennte
Konvertierungs-/OCR-Suite, Clippy und 122 Rust-Unit-Tests einschließlich
neuer Fehlerpfade bestanden lokal. Zum Zeitpunkt dieses Reviews standen
native M2-Bedienung und ein neues Paket noch aus; RC161 ist inzwischen oben
separat belegt. Die Quellsuite meldet native GUI-Abnahme ausdrücklich NOT_RUN.

Der erneute Bundle-Quellvergleich fand ein **separates Mac-Verteilungsrisiko**:
Conversion-Node, POSIX-Supervisor und ein natives Add-on liegen derzeit unter
`Contents/Resources` statt an Apples vorgesehenen Code-Orten. Das ist für
Signierung/Notarisierung vor einer regulären Verteilung zu migrieren und
anschließend nativ zu prüfen. Diese Komponenten starten erst bei der
Konvertierung und sind keine belegte Ursache des vorherigen ersten
Core-Ready-Ausfalls. Das macOS-26-CI-Gate nutzt einen unquarantänisierten
M1-Runner und ersetzt weder Browser-/Finder-/Gatekeeper noch den verwalteten
M2 auf 26.2. RC160 bleibt als berichteter Fehlerstand unverändert; allein aus
diesen Quellbefunden keine Mac-Funktionsfreigabe ableiten. Der spätere
RC161-Test-Pre-Release beruht auf den oben getrennt aufgeführten Paketgates.

### macOS-26.2/M2-Rückmeldung: früher Core-Startabbruch (Paketgate grün, Zielhost offen)

Auf dem verwalteten M2-Mac laden sowohl ARM-DMG als auch ZIP die Oberfläche,
aber der lokale Dienst meldet keine Bereitschaft; Datei-/Ordnerwahl und
Ergebnisordneränderung wirken dadurch blockiert. Die drei übermittelten
Desktop-Diagnosen belegen `runtime_resolved` und `sidecar_spawned`, danach
`STANDALONE_IPC_FAILED`; ein Sidecar-Protokoll fehlt. Das belegt **weder**
einen defekten Ergebnisordner **noch** Gatekeeper, MDM oder fehlende
Adminrechte als Ursache. Die fehlende frühe Core-Phase wird nun mit
inhaltsfreien Markern, festem Import-/Initialisierungsfehlercode und nativ
beobachtetem Exitcode/Signal erfasst. Frühe Node-Fehlerausgabe wird nur im
Arbeitsspeicher begrenzt gelesen und auf feste Kategorien reduziert; rohe
Ausgabe gelangt nicht in die Diagnose. Native Picker protokollieren Anforderung,
Guard-Ablehnung, Dialogabschluss/Abbruch und Dialog-Taskfehler getrennt.
Während der Wiederverbindung abgewiesene Picker-Klicks erhalten einen
sichtbaren Grund und einen nativen Diagnoseschritt. Der native Abgleichstatus
zeigt zusätzlich an, wenn sein eigener Diagnose-Sink nicht verfügbar ist.
Ein nativer Dialog ohne Auswahl wird nur als `picker_no_selection` erfasst:
Die Dialog-API kann dabei Nutzerabbruch und manche OS-Ablehnungen nicht
beweissicher unterscheiden.
Keine Dokumenttexte, Dateinamen, Pfade, Umgebungswerte oder rohen
Systemfehlermeldungen werden dafür protokolliert.

Der Architekturabgleich fand zusätzlich einen realen DMG-Paketfehler:
Mac-Ressourcen und Hilfsprogramme wurden teilweise als `0600`/`0700`
projiziert; der ZIP-Builder setzt hingegen `0644`/`0755`. Der Quellstand
normalisiert die unveränderlichen Mac-Bundle-Dateien und prüft die Rechte im
nativen Paketgate auch für einen anderen Eigentümer. Der betroffene Nutzer
hat die App per Finder in einen eigenen Nutzerordner kopiert; deshalb ist
dieser Fehler **keine belegte Erklärung** für seinen konkreten Ausfall.
Ein zweiter bestätigter Architekturfehler betraf `runtime-info.js`: der
gebündelte Mac-Core wurde nicht am tatsächlichen Tauri-Pfad
`Contents/MacOS/datasecure-core` gesucht. Dadurch konnte die Runtime als
Host-Node gelten und die Hash-Startprüfung ausfallen. Der dafür nötige
Beleg lag nur außerhalb der `.app`. Lauf `38768282220` bestätigte, dass
Tauri/Signierung die Core-Bytes verändert. Beide Pfade und der nach
Signierung gemessene In-App-Beleg sind nun gemeinsam im Quellstand
korrigiert. Der macOS-26-ARM-Lauf `38773313665` bestätigt den signierten
Start mit verpflichtender Hashprüfung sowie ZIP und DMG. Der verwaltete
M2-Mac wurde mit diesem Paket noch nicht bedient. Auch dieser Fehler
beweist nicht die Ursache des früheren IPC-Abbruchs.

Die normale App verwendet gebündelte Hilfsprogramme direkt und benötigt weder
eine freigeschaltete Terminal-App noch Adminrechte. Eine Organisation kann die
Ausführung des eingebetteten Dienstes oder Dateizugriffe dennoch blockieren;
das bleibt eine zu prüfende Hypothese. Der neue manuelle macOS-26-ARM-Runner
prüft zusätzlich den **regulären** Paketstart ohne synthetisches Testprofil.
Er ist ein M1-CI-Host und ersetzt weder den M2-/MDM-Zielhosttest noch Finder,
Gatekeeper, echte Dialoge oder einen normalen Nicht-Admin-Bedienlauf.
Bis zur positiven Zielhostprüfung kein korrigiertes Paket als funktionsfähig
behaupten und RC160 nicht stillschweigend ersetzen.

Erster macOS-26-ARM-Lauf [38765209776](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38765209776):
Quell-/Rust-Suite grün; das separate reale Konverter-Gate stoppte nach 64
bestandenen Fällen in der schnellen 100-Dateien-Wiederverwendung mit
`CONVERSION_ISOLATION_FAILED`. Bundlebau und App-Start wurden nicht erreicht.
Im POSIX-Supervisor wurde eine Exit-/RSS-Abfrage-Rennbedingung gefunden:
ein zwischen `waitid` und RSS-Messung beendeter Kindprozess konnte als
Setupfehler erscheinen. Der Quellstand gleicht den gehaltenen Kindprozess
erneut ab und lässt höchstens drei kurze fehlende RSS-Proben zu; anhaltend
fehlende Messung bleibt ein Fail-Closed-Fehler. Der Test protokolliert bei
erneutem Fehler nur Iteration und numerischen Supervisor-Exit/Signal.
Diese Erklärung ist erst nach dem nächsten nativen Lauf bestätigt; aus dem
generischen Fehler allein folgt sie noch nicht.
Die zweite Wiederholung [38767569572](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38767569572)
erreichte den Konverterfall nicht: der neue 100-fache Kurzprozess-Test deckte
einen unabhängigen `argc`-Fehler auf (Supervisor-Exit 120 für ein Programm
ohne Zusatzargument). Die Mindestanzahl ist korrigiert; 100 echte Linux-
Kurzprozesse und strenge C-Kompilation bestehen lokal. Das ist kein
Mac-App-Startnachweis und bestätigt die RSS-Hypothese nicht.
Im dritten Lauf [38768282220](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38768282220)
bestanden der zuvor scheiternde Konverterfall, signierter ARM-Bundle-Start,
regulärer macOS-26-LaunchServices-Start, ZIP-Doppelbau und DMG-Abgleich.
Der signierte Core weicht byteweise vom Quell-Node ab. Die bisherige
außerhalb der `.app` liegende Roh-Node-Evidence konnte daher nicht einfach
als Laufzeitbeleg verwendet werden. Der neue Quellstand bindet den **nach
der Core-Signierung** gemessenen Hash innerhalb von `Contents/Resources`,
signiert danach die äußere App erneut und baut das DMG aus genau dieser
App. Der [vierte native Lauf 38773313665](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38773313665)
prüfte diese neue Kette erfolgreich: `STANDALONE_MACOS_RUNNING_CORE_INTEGRITY_CHECKED`,
regulärer Produktionsprofil-/LaunchServices-Start, reale synthetische
Konvertierungs-/Anonymisierungsfälle, signiertes ZIP und identisches DMG.
Das hochgeladene Engineering-Artefakt trägt den Commit `26bc50c` und ist
nur einen Tag verfügbar. Es ist **kein** neu veröffentlichtes RC und keine
Finder-/Gatekeeper-/MDM-/M2-Bedienabnahme. Diese Probe bleibt offen.

### Aktuell veröffentlicht: Standalone RC160 als Test-Pre-Release

[RC160](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc160)
bindet den Quellcommit `b5d52c550ead3fb4cea5acc9e9774de9863db32c`
und fünf geprüfte Archive mit fünf SHA-256-Belegen. Kostenbegrenzte CI,
vollständige Security und native Windows-/Intel-/Apple-Silicon-Paketgates
bestanden auf demselben Commit. [Runner, Hashes und Grenzen](../RELEASE.md#rc160--standalone-test-pre-release-windows-und-macos).
Die 232 Headless-Produktdateien bestanden lokal; die sechs nativen
Windows-GUI-Formfälle dieser Suite blieben `NOT_RUN`. Menschliche
Windows-/Mac-Bedienabnahme, Accessibility, echte Nutzerdatenqualität und
Produktionsfreigabe bleiben offen. Die ältere Aussage „neues Paket fehlt“ im
nachfolgenden Entwicklungsprotokoll beschreibt den Stand vor dieser
Veröffentlichung. Cowork und Linux wurden mit RC160 nicht neu veröffentlicht.

### Prüfoberflächen: Hauptweg und optionale Eingriffe getrennt (Quellstand)

Die OCR-Kontaktprüfung führt sichtbar über Vergleichen, Auswählen, Entscheidung
vormerken und abschließend Speichern. Die Rücknahme einer Vormerkung liegt unter
„Weitere Prüffunktionen (optional)“. In der anonymisierten Dokumentprüfung
bleiben Vergleich und ausdrückliche Freigabe der Hauptweg. Vertrauliche
Zuordnung, Freigabewiderruf, zusätzliche Maskierung,
Basisstand-Wiederherstellung und gemeinsame
Entitätenbehandlung sind aufklappbare Zusatzfunktionen. Maskierung und
Wiederherstellung schreiben erst nach einer zweiten, ausdrücklichen Bestätigung;
Abbrechen verändert keinen gespeicherten Textstand. Ein bestätigter Eingriff
hebt die betroffene Freigabe auf und erfordert erneuten Textvergleich und
Freigabe. Der Markdown-only-Bearbeitungsweg bleibt funktional unverändert.
Gezielte Frontend- und synthetische Browserregressionen bestanden; die native
Windows-Bedienabnahme dieser Änderung bleibt offen. Das RC160-Testpaket ist
inzwischen veröffentlicht (siehe oben).

Der Nutzer zeigte später eine „Export fertig“-Meldung für 132 Dateien. Die
folgende Diagnose „kein Exportbeleg“ bezieht sich auf den Zustand **vor**
diesem späteren Export. Der dauerhaft gespeicherte Beleg nach dem Export wurde
hier nicht erneut unabhängig geprüft; deshalb daraus keine zusätzliche
Bestands- oder Inhaltsgarantie ableiten.

### Früherer Nutzerlauf-Zwischenstand: Freigabe gespeichert, KI-Kopie noch nicht belegt

Der untersuchte Anonymisierungslauf mit 133 Quellen hat 132 veröffentlichte
private Dokumentprüfstände und einen Datenschutz-Prüfstopp. Die lokale
Entscheidungskette enthält 132 Freigaben für die verfügbaren Stände; im
Laufverzeichnis liegt dagegen weder ein begonnener Exportauftrag noch ein
Abschlussbeleg. Zwei protokollierte `preview_document_export`-Aufrufe hatten
vor dem Verbindungsabbruch keine Antwort. Das spricht für eine zu langsame
read-only Exportvorschau unter dem bisherigen 30-Sekunden-IPC-Limit, **nicht**
für eine belegte KI-Kopie. Ein ausgeführter Export darf aus den 132 Freigaben
nicht abgeleitet werden. Die Diagnose selbst hat weder private Inhalte
noch Originale verändert.

Im lokalen Quellstand liest die Vorschau die Freigabe-Commit-Kette einmal
statt je Dokument erneut; beide Exportdurchläufe verwenden dieselbe unter
Sperre geprüfte Kette. Das Rust-Vorschau-Limit beträgt nun wie beim
eigentlichen Export 300 Sekunden. Der Verlauf unterscheidet Verarbeitung,
Freigaben und Kopiebeleg auch bei einem separaten Datenschutzstopp. Bei
Verbindungsverlust verschwindet die unbedienbare Dokumentansicht zugunsten
des unbestätigten Verlaufs; eine geöffnete Exportvorschau wird geschlossen,
ohne den Auftrag automatisch zu wiederholen. Der Sammelspeichervorgang zeigt
nur bestätigten Fortschritt statt gesperrter Bearbeitungsfelder. Diese
Quelländerungen sind **noch nicht** im installierten r160.

Der synthetische 132-Dokumente-Lasttest der Exportvorschau blieb unter dem
früheren 30-Sekunden-Limit (47/0 in der zusätzlichen Dokumenttestsuite). Die
vollständige Standalone-Quellsuite endete Exit 0; Rust meldete 120 bestanden,
drei ignoriert. Der neue, unveröffentlichte Engineering-Kandidat
`dist/engineering-anonymization-status-rc160-r37/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
hat SHA-256
`f60b78e71683e3d80664911bcd90c3d98ded9c66df9219a97f9bc4a1f8dd953e`.
Paketverifier und isolierter Sidecar-Smoke einschließlich OCR- und
Anonymisierungswegen bestanden. Der native Windows-Start aus diesem Paket
bestand Fensterladung und IPC im isolierten Testprofil (Exit 0); er enthält
**keinen** interaktiven 132-Dateien-Windows-Bedienbeleg und keinen echten
KI-Export des Nutzerlaufs. Die sechs nativen GUI-Formfälle der Quellsuite
bleiben `NOT_RUN`. Die installierte r160 wurde nicht ersetzt.

### r36: inhaltsfreier nativer Abgleichstatus bei unterbrochener Verbindung

Das Hauptfenster kann nun auch ohne erreichbaren Sidecar eine ausschließlich
native, inhaltsfreie Abgleichphase lesen (`closing`, `checking`, `settling`,
`owned`, `blocked` oder `idle`). „Verbindung und Laufstatus prüfen“ fragt diese
Phase und danach den gespeicherten Laufstatus erneut ab, startet aber weder
einen zweiten Lauf noch eine Freigabe oder Kopie. Der Diagnoseknopf bleibt
auch bei fehlendem oder verweigertem Ersatzdienst sichtbar. Ein Klick während
einer laufenden Statusabfrage erklärt, dass bereits geprüft wird. Die Phase
`idle` allein ist ausdrücklich **kein** Abschluss- oder Exportbeleg.

Die gezielte Workspace-Regression bestand mit 86/0; die vollständige
Standalone-Quellsuite endete Exit 0 mit 120/0 Rusttests (drei ignorierte
Helper). Die sechs nativen Windows-Formfälle der Suite melden ausdrücklich
`NOT_RUN`. Das unveröffentlichte r36-Windows-ZIP unter
`dist/engineering-content-anonymization-rc160-windows-20261015-r36/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
hat SHA-256 `b9b06a2a83fe6ee43bdb42b000587927672a1b608e07922d2549fb62358eab4c`
und bestand den Paketverifier. Der isolierte Paket-Sidecar-Smoke bestand beide
Hauptwege einschließlich OCR-Formaten, neutralen Anonymisierungsnamen und
laufgebundenem Export (Exit 0). Der native Windows-Start aus genau diesem
Paket bestand Laden und IPC im isolierten Testprofil (Exit 0); eine
interaktive r36-Bedienprobe ist damit **nicht** belegt. Der ursprüngliche festhängende Lauf, eine
Teilkopie und eine ausdrückliche Aufgabe eines Exports nach Verbindungsabbruch
sind durch die neue Statusanzeige nicht automatisch gelöst.

### r35: Verbindungsabbruch ohne scheinbar bedienbare Altaktionen

Bei einem gemeldeten lokalen Verbindungsabbruch entfernt die Standalone-UI
nun alte Lauf- und Verlaufsaktionen, markiert den zuvor gezeigten Fortschritt
als **nicht bestätigt** und lässt die inhaltsfreie Diagnose erreichbar. Ein
fehlgeschlagener Verlaufsabruf entfernt ebenfalls alte anklickbare Einträge;
erst ein frischer erfolgreicher Abruf stellt sie wieder her. Kein Lauf wird
dadurch beendet, erneut gestartet, freigegeben oder als exportiert markiert.
Die gezielten UI-Regressionsfälle bestanden (83/0), die vollständige
Standalone-Quellsuite endete Exit 0 (118 Rusttests; sechs automatisierte
native Windows-Formfälle `NOT_RUN`), und das Dokumentationsgate bestand.

Das unveröffentlichte r35-Windows-ZIP
`dist/engineering-content-anonymization-rc160-windows-20261015-r35/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `c349afaaf231c5bed8495ca077a71bb0840634c2346df68849649275fc8b57a8`)
bestand Paketverifier und isolierten Paket-Sidecar-Smoke beider Hauptwege.
Die verpackte EXE lief zusätzlich nativ in einem validierten, isolierten
Windows-Smoke-Profil. Ein ausschließlich synthetisches MD-Dokument wurde
anonymisiert (1/1 Ergebnis, 0 technische Probleme); die private MD-Datei
enthielt Platzhalter für Person, Unternehmen, E-Mail und Telefon und erhielt
Sachtext und Tabelle. Erst **nach** Abschluss der Verarbeitung und ohne
laufenden Export wurde der eindeutig zu diesem Testprofil gehörende lokale
Sidecar-Prozess gezielt beendet. Die native UI zeigte den Verbindungsabbruch,
entfernte sofort alte Lauf- und Verlaufsaktionen, markierte den alten Status
als unbestätigt und ließ „Diagnose öffnen“ erreichbar. Nach automatischer
Wiederverbindung zeigte ein frischer Verlauf genau denselben gespeicherten
Lauf (1 Ergebnis, 0 Probleme); kein zweiter Lauf wurde gestartet. Die
Testinstanz wurde anschließend regulär geschlossen. Dies belegt den
einfachen nativen Verbindungsausfall **nach** einem technisch fertigen Lauf,
nicht den vom Nutzer beobachteten festhängenden Prozess, eine Teilkopie,
Wiederaufnahme oder Exportverzicht. Es gibt weiterhin keinen unsicheren
„Lauf fertig“-Knopf bei ungeklärtem Prozess-/Exportzustand.

### r34: native Windows-Gegenprobe ohne OCR, Freigabeentzug und erneuter Export

Das unveröffentlichte Windows-Testarchiv
`dist/engineering-content-anonymization-rc160-windows-20261015-r34/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `950a2cffa5956955f4fcf0d4f6dc3c7d5eab83a6977a3b609412c1f1a50b501d`)
bestand Paketverifier und isolierten Paket-Sidecar-Smoke beider Hauptwege.
Die Standalone-Quellsuite bestand mit 118 Rusttests; sechs automatisierte
native Windows-Formfälle meldeten `NOT_RUN`. Der r34-Kandidat wurde in einem
isolierten Windows-Profil mit elf ausschließlich synthetischen Quellen über
alle zehn angebotenen Endungen (einschließlich Text- und Scan-PDF) bedient.
Bei **Anonymisierung ohne OCR** entstanden sieben private Prüfstände; vier
Raster-/Scan-Quellen wurden erwartungsgemäß und ausdrücklich als „ohne OCR
nicht umgewandelt“, nicht als technische Fehler, ausgewiesen.

Ein synthetisches MD-Dokument wurde im nativen Vergleich auf lesbaren Sachtext,
Platzhalter für die gezielt geprüften Namen, Firma, E-Mail, Telefon, Anschrift
und IBAN geprüft, ausdrücklich freigegeben und als neutral benanntes
`Dokument_01.md` exportiert. Der Ergebnisordner ließ sich **in der ersten
Exportvorschau** wählen; die Wahl allein kopierte nichts. Anschließend wurde
ein Fachwort gezielt zusätzlich maskiert. Dies erzeugte einen neuen Stand,
entzog die vorherige Freigabe und deaktivierte den Export bis zur erneuten
Prüfung. Nach neuer ausdrücklicher Freigabe entstand eine zweite neutrale
Kopie in einem neuen Exportordner; die erste Kopie blieb bytegleich und
enthielt die spätere Maskierung nicht, die zweite enthielt sie. Nach Neustart
zeigte die direkt erreichbare Verlaufsansicht zunächst neutral „Technisch
verarbeitet“ und lud danach 1/7 aktuelle Freigaben, zwei abgeschlossene
KI-Exporte und 1/7 aktuelle Stände in Abschlussbelegen. Die vier
ausgelassenen Quellen blieben unfreigegeben und unexportiert.

Das ist eine **native Teilabnahme** der Ohne-OCR- und Korrekturfolge, keine
universelle Anonymitäts- oder OCR-Qualitätsgarantie. Offen bleiben native
technische Teilkopie/Wiederaufnahme/Exportverzicht-Fehlerfälle, Mac-Zielhost,
die sechs automatischen nativen Formfälle und breitere Inhaltsqualität.

### r33: nativer Windows-Gesamtformatlauf der Anonymisierung (synthetisch)

Das unveröffentlichte r33-Testarchiv
`dist/engineering-content-anonymization-rc160-windows-20261015-r33/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `76ff58eed2581137d4ba0361028b0e321b6d55ef6aacf4243c7421423f36caa1`)
bestand Paketverifier und isolierten Paket-Sidecar-Smoke einschließlich
Markdown-only ohne/mit OCR, Review und anonymisiertem Raster-/Scan-PDF-Pfad.
Die vollständige Standalone-Quellsuite endete Exit 0, darin 118/0 Rusttests;
die sechs automatischen nativen Windows-Formfälle bleiben `NOT_RUN`.

Eine **echte native Windows-Bedienprobe** lief aus genau diesem Archiv in
einem isolierten Testprofil mit elf kopierten, ausschließlich synthetischen
Dateien: je TXT, MD, CSV, DOCX, XLSX, PPTX, BMP, JPEG, PNG sowie Text-PDF
und Scan-PDF. Anonymisierung mit OCR: 11/11 technisch verarbeitet, 0
Dateifehler. Vier Scan-/Bilddokumente erzeugten acht E-Mail-/Telefon-
Prüfkandidaten. Die Werte wurden gegen synthetische Bildvorlagen und die
angezeigten OCR-Werte verglichen, gesammelt unverändert bestätigt und
gespeichert; der Lauf setzte ohne Verbindungsabbruch fort. Die elf privaten
anonymisierten Markdown-Stände enthielten Tabellen und Sachtext sowie
Platzhalter statt der gezielt geprüften synthetischen Namen, Firmen,
Kontakte, IBAN und Anschrift. Die native Gegenüberstellung eines BMP zeigte
Original und anonymisierten Text. Danach wurden elf Stände **ausdrücklich**
freigegeben. Der erste KI-Export stoppte sicher mit
`AI_EXPORT_CONFIGURATION_REQUIRED`; Auswahl desselben isolierten
Ergebnisordners und ausdrückliches Wiederholen exportierten genau elf
neutral benannte `Dokument_01.md` bis `Dokument_11.md`, ohne private
Begleitdateien. Die native Abschlussanzeige meldete „Export fertig“ und
„(abgeschlossen)“. Nach App-Neustart wies der gesondert geladene
Verlaufs-Prüfstatus 11/11 gespeicherte Freigaben, einen abgeschlossenen
KI-Export und 11/11 aktuelle Stände im Abschlussbeleg aus.

**UX-Nacharbeit im unveröffentlichten Quellstand:** Der Verlauf sagt vor dem
Laden des echten Freigabe-/Exportbelegs jetzt nur „Technisch verarbeitet“ und
bietet „Dokumente und Freigaben öffnen“ sowie „Freigaben und Exporte“ direkt
an. Der erste Ergebnisordner kann bereits in der Exportvorschau gewählt
werden; die Wahl startet selbst keinen Export. Ein unabhängiges Fachreview
fand zwei Dialogzustandsfehler (versteckte Rückmeldung und nach erfolgreichem
Export verbleibender Ordnerbutton); beide sind korrigiert und mit gezielten
Anonymisierungs- und Markdown-only-Tests geprüft. Die native r34-Gegenprobe
für diese UI sowie Anonymisierung **ohne OCR** und gezielte Textkorrektur
mit Freigabeentzug steht oben. Technische Teilkopie/Wiederaufnahme und
bewusster Exportverzicht bleiben nativ offen. Die Stichprobe ist keine
universelle OCR- oder Anonymitätsgarantie und kein Mac-Zielhostbeleg.

### OCR-Namenszeile im Anonymisierungsweg: Paket- und begrenzte Windows-Gegenprobe

Eine neue isolierte Gegenprobe des r28-Pakets mit ausschließlich synthetischen
PNG-, JPEG-, BMP- und Scan-PDF-Quellen fand eine konkrete Schutzlücke: Die
alleinstehende OCR-Zeile „Max Mustermann“ blieb in einem anonymisierten
Markdown-Ergebnis stehen, während die Firma ersetzt wurde. Das ist kein
Freigabe- oder allgemeiner OCR-Qualitätsbeleg. Der lokale Folgeschnitt
reserviert kurze, unbeschriftete Zweiwort-Namenszeilen **nur bei tatsächlich
OCR-abgeleiteter Standalone-Extraktion** für eine quellgenaue menschliche
Entscheidung. Er rät weder automatisch eine Personenidentität noch erweitert
er Markdown-only oder Cowork. Die Personenprüfsuite bestand mit 42/0,
die Inhalts-/Vertragskette mit Exit 0. Das unveröffentlichte Windows-r29-ZIP
`dist/engineering-content-anonymization-rc160-windows-20261015-r29/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `0291a1d75f010bd779dbdccec4c2f6209366a1877db393d5c3053ee569e14470`)
bestand den Paketverifier und die isolierte vollständige Paket-Sidecar-Kette.
Die neue Vierformat-Gegenprobe belegt nach echter Fundstellenentscheidung
vier neutrale Markdown-Ergebnisse ohne diese synthetischen Rohidentitäten,
mit erhaltenem Sachtext und ohne automatische Dokumentfreigabe. Die
Paketkette bestätigte Markdown-only ohne/mit OCR erneut (8 Ergebnisse und
4 erwartete OCR-aus-Auslassungen bzw. 12 Ergebnisse). Die vollständige
Standalone-Quellsuite endete Exit 0, darunter 118/0 Rusttests; die sechs
automatischen nativen Windows-Formfälle meldeten weiterhin `NOT_RUN`.

Eine **begrenzte echte Windows-Bedienprobe** des unveröffentlichten r29-ZIPs
lief in einem neuen isolierten Profil mit genau einer synthetischen TXT-Datei:
Auswahl → Anonymisierung → getrennte Dokumentprüfung → gespeicherte Freigabe →
ausdrücklicher KI-Export. In der nativen Gegenüberstellung wurden Name,
E-Mail und Telefon ersetzt, der synthetische Sachtext blieb; nach Wiederöffnung
war die Freigabe noch vorhanden. Der erste Exportversuch stoppte sichtbar mit
`AI_EXPORT_CONFIGURATION_REQUIRED`, weil der Standard-Ergebnisordner noch
keine native Exportbindung hatte. Nach erneuter Auswahl **desselben**
isolierten Ordners gelang der Export ohne erneuten Lauf. Die sichtbare
Bestätigung und die tatsächliche einzelne Datei `Dokument_01.md` in einem
`DataSecure-KI-Export/Export-…`-Ordner wurden kontrolliert; sie enthält nur
die drei Platzhalter und den Sachtext, keine Quellnamen oder privaten
Begleitdateien. Das belegt weder native OCR-Bedienung aller Rasterformate
noch universelle Anonymitätsqualität. Die anfängliche Ordnerbindung ist ein
konkreter UX-Fall für einen klareren ersten KI-Export; Gesamtformat- und
Fehlerwiederaufnahme-Bedienabnahme bleiben offen.

### Sichere Aufgabe einer defekten sichtbaren Anonymisierungsbereitstellung: Quellstand

Ein neuer lokaler Quellpfad erlaubt bei einem **beendeten** Anonymisierungslauf
mit unvollständigem sichtbaren Ergebnisexport, dessen automatische Fortsetzung
ausdrücklich aufzugeben. Der dauerhafte, inhaltsfreie Beleg entsteht unter
dem bestehenden Export-Claim und bindet Lauf, unveränderlichen Exportplan,
bereits kopierte sowie offene Anzahlen. Die normale Exportfunktion und der
Start-Wiederanlauf prüfen ihn vor jeder weiteren Kopie. Der Verlauf unterscheidet
„Bereitstellung aufgegeben“ von „Ergebnisse verfügbar“; die Oberfläche nennt
den Verbleib vorhandener Teilkopien und fordert eine bewusste Bestätigung.
Originale, Teilkopien und private Prüfstände werden dabei nicht gelöscht; es
entsteht keine Dokument- oder KI-Freigabe. Gezielte synthetische Quell- und
Renderer-Tests sind grün. Das unveröffentlichte Windows-r28-ZIP unter
`dist/engineering-content-anonymization-rc160-windows-20261015-r28/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `1aebc8c459b3e1e05c9c84795f4fdcee986d5af5e8219ac1d039c6be043d5d6a`)
bestand den Paketverifier und den isolierten Paket-Sidecar-Smoke beider Wege
einschließlich OCR, Review und Export. Der gezielte Verzichtstest bestand mit
35/0 Fällen; die letzte vollständige Standalone-Quellsuite endete Exit 0 mit
118/0 Rusttests und nativen Windows-Formfällen `NOT_RUN`. Der isolierte
native r28-Windows-Start lud Haupt- und Prüfseite mit erfolgreicher IPC und
beendete sein eigenes Testprofil sicher (1544 geprüfte Einträge). Er traf
keine Prüfentscheidung. Eine native **Bedienprobe** des neuen Auswegs fehlt:
Schon beim r27-Versuch konnte das Bedienwerkzeug das geöffnete Windows-Fenster
wegen fehlender Prozess-ID nicht binden. Der Start-Smoketest ist deshalb keine
UI-Abnahme. Der neue Ausweg löst außerdem keine
dauerhaft unterbrochene Sidecar-Verbindung, solange kein sicherer aktueller
Zustand abrufbar ist; Teilkopie und geänderter Zielordner brauchen noch
eigene native Gegenproben.

Eine zusätzliche Quellgegenprobe mit zwei anonymisierten Ergebnissen kopierte
genau eines sichtbar und stoppte am zweiten, synthetisch belegten Zielkonflikt.
Der anschließende Verzicht bewahrte beide vorhandenen Zieldateien und verhinderte
weitere Kopien beim Wiederanlauf (35/0 gezielte Fälle). Ein Versuch, das r28-ZIP
mit dem nativen Windows-Launcher zu prüfen, scheiterte zunächst in dessen
isolierter Baum-/Identitätsprüfung mit `STANDALONE_NATIVE_IDENTITY_FAILED:3`.
Das Paket enthält einen 264 Zeichen langen Pfad. Die native No-Follow-
Identitätsfunktion des Testprogramms wurde
für geprüfte absolute Laufwerkspfade auf Windows-Langpfade umgestellt; der
konkrete 264-Zeichen-Lesefall und alle neun Bereinigungs-Vertragsgruppen unter
PowerShell 5.1 und 7 bestanden. Der erneute r28-Lauf bestand Hauptseiten-,
Prüfseiten- und IPC-Start mit Exit 0; er beweist keine menschliche Bedienung,
Anonymisierungsentscheidung oder Verbindungsausfallbehandlung. Die
bei den fehlgeschlagenen Harness-Versuchen angelegten isolierten
Testverzeichnisse wurden wegen der gescheiterten Prüfung nicht nachträglich
entfernt.

### r25/r26-Windows-Gegenprobe: Prüfstand stabil, Fehlergruppen-Nachweis folgt

Die r25-EXE lud den gespeicherten ausschließlich synthetischen
133-Dateien-Anonymisierungslauf mit 115 Ergebnissen, 17 OCR-aus-Auslassungen,
einem Datenschutz-Prüfstopp und null technischen Verarbeitungsfehlern. Die
private Dokumentprüfung öffnete alle 115 Stände ohne Verbindungsabbruch;
ein synthetisches Dokument zeigte Original und anonymisierten Markdown-Text
nebeneinander. Es wurde nichts freigegeben oder für KI exportiert. Der
frühere Statusabruf benötigte vor dem Quellschnitt etwa 23 Sekunden; eine
direkte Gegenmessung nach Entfernung der unnötigen Ergebnis-Neuverifikation
im reinen Statuspfad ergab etwa 0,5 Sekunden. Die 120-Sekunden-Frist für die
beiden Status-/Kontextaufrufe bleibt begrenzt; der explizite Dokumentabruf
hat eine eigene 300-Sekunden-Frist.

Ein echter UI-Befund in r25: Die Prüfseite nannte alle 18 nicht verarbeiteten
Quellen „technische Fehler“, obwohl der Verlauf sie richtig trennte. Ursache:
Die Produktionsverdrahtung des gebundenen Laufzustands für die
Dokument-Klassifizierung fehlte, während die isolierten Unit-Tests diesen
Zustand direkt injizierten. r26 verbindet ihn, ergänzt eine Verdrahtungs-
Regression (45/0) und liegt als **unveröffentlichtes** geprüftes Windows-ZIP
unter `dist/engineering-content-anonymization-rc160-windows-20261015-r26/`
(SHA-256 `0c9bb7b2148a1f3c90ecd23c5174a025f06e97688bd9cd9a93a9a1d9c0e0b689`).
Ein direkter Aufruf der echten Service-Verdrahtung gegen genau den
gespeicherten synthetischen Lauf bestätigte 115 prüfbare Dokumente, 17
`ocr_omission`, einen `privacy_stop` und `processing_complete=true`.
Die erneute native r26-Bedienprobe blieb wegen eines nicht bindbaren
Computer-Use-Fensters aus; aus dem Paketbuild folgt keine native UI-Abnahme.
Der isolierte Paket-Smoke bestand beide Wege einschließlich OCR,
Prüf-/Korrekturschritten und exaktem Export; er ist kein nativer GUI-Test.
Die vollständige Standalone-Quellsuite nach dem Verdrahtungsfix endete mit
Exit 0 einschließlich 118/0 Rusttests; ihr nativer Windows-Formstatus lautet
weiter `NOT_RUN (6 cases)`. Das Dokumentationsgate und `git diff --check`
bestanden ebenfalls.
Der sichere, dauerhaft belegte Verzicht
auf einen defekten sichtbaren Export bleibt offen; siehe BL-010.53.9.

### r22-Windows-Gegenprobe: Ergebnisstand korrekt getrennt, Dokumentprüfung noch zu langsam

Das unveröffentlichte r22-ZIP
`dist/engineering-content-anonymization-rc160-windows-20261015-r22/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `746ec18141b1e5ba21abb398a99eae3e34bcf3fef5dc4ff17c1f0062a1a72ee0`)
bestand ZIP-Verifier und isolierten paketierten Sidecar-Smoke einschließlich
beider Verarbeitungswege. Die native Windows-EXE lud den gespeicherten,
ausschließlich synthetischen 133-Dateien-Lauf und zeigte erstmals die genaue
Trennung: 115 Ergebnisse, **17 erwartete OCR-aus-Auslassungen und ein
Datenschutz-Prüfstopp** (`AMBIGUITY_REVIEW_REQUIRED` bei
`02-adversarial/01-direkt/01-langer-prosatext.txt`). Die frühere Annahme von
18 OCR-aus-Auslassungen war falsch. Keine automatische Freigabe und kein
KI-Export. Das Öffnen aller 115 privaten Dokumentprüfstände überschritt
dagegen die native 30-Sekunden-Frist; die App trennte die Verbindung
(`STANDALONE_IPC_TIMEOUT`). Ein direkter lokaler Abruf der Prüfstandsliste
benötigte circa 24 Sekunden **vor** dem zusätzlichen History-Abgleich.
Der anschließende Quellschnitt gibt nur `get_document_reviews` eine weiterhin
begrenzte 300-Sekunden-Frist und kennzeichnet gebundene Datenschutz-Prüfstopps
getrennt von OCR-Hinweisen und technischen Fehlern. Gezielte Tests bestehen;
neue native Gegenprobe und weitere Bedienabnahme bleiben offen. Der
Datenschutz-Prüfstopp besitzt keinen freigabefähigen Prüfstand und kann nicht
im alten Lauf pauschal freigegeben werden.

### r21-Windows-Wiederanlauf und nachfolgende Anzeige-Korrektur

Die unveröffentlichte r21-EXE wurde auf Windows aus dem geprüften lokalen ZIP
gestartet. Der erste Verlaufsabruf gelang nach dem langsamen Sidecar-Start ohne
erneuten Verbindungsabbruch. Der gespeicherte, ausschließlich synthetische
133-Dateien-Anonymisierungslauf wurde wiederhergestellt: 115 Markdown-Ergebnisse
und ein vollständiger privater Ergebnisexportbeleg sind vorhanden; die später
genau klassifizierten 17 OCR-aus-Auslassungen und ein Datenschutz-Prüfstopp
blieben benannt. Die
Dokumentprüfung öffnete 115 verfügbare Stände, ohne sie automatisch zu
genehmigen. Exaktes r21-ZIP:
`dist/engineering-content-anonymization-rc160-windows-20261015-r21/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`,
SHA-256 `a7fdce0a431ddb99f7afbbd3965d82e3a0fc07cefdec9431efc86a57a0061fc3`.
ZIP-Verifier, isolierter Paket-Smoke und Quelltests waren grün; dies ist ein
gezielter Windows-Wiederanlauf, keine vollständige native Anonymisierungs-
oder Inhaltsabnahme. Keine Freigabe oder KI-Kopie wurde ausgelöst.

Der anschließende lokale Quellschnitt korrigierte drei beim Nativtest sichtbare
Anzeigeprobleme, mit r22 **teilweise** nativ gegengeprüft: Die Dokumentprüfung
bindet „Lauf abgeschlossen“ an den gespeicherten Ergebnisbeleg; vor Auswahl
eines Dokuments behauptet sie keinen verlorenen Prüfstand; und genau
laufgebundene OCR-aus-Auslassungen werden in Verlauf und Dokumentprüfung als
Hinweise statt als technische Fehler angezeigt. Der Verlauf ist nativ belegt;
die Dokumentprüfung scheiterte noch an ihrer kurzen Abruffrist. Eine separate,
dauerhaft belegte Aufgabe „Lauf ohne Export aufgeben“ fehlt weiterhin;
Wiederaufnahme ist nicht gleich bewusster Abbruch.

### r20-Nativtest: erste Verbindung weiterhin unterbrochen

Der Anwender startete nachweislich die r20-Windows-EXE. Der Sidecar meldete
`service_initialized` erst rund 27 Sekunden nach Start; die erste
`get_ui_context`-Antwort kam vor dem bisherigen gemeinsamen 30-Sekunden-Limit
für **Start und Anfrage** nicht mehr zurück. Danach wurde der Sidecar
zurückgezogen und ein Folgestart durch die verbliebene alte Prüfsperre sicher
blockiert (`STANDALONE_CONNECTION_RECOVERY_BLOCKED`). Das gespeicherte
133-Dateien-Journal blieb unverändert; der sichtbare Exportbeleg fehlt weiter.
Diese Beobachtung widerlegt eine native Wiederaufnahme durch r20. Weitere
„Aktualisieren“-Klicks oder ein neuer Lauf sind kein Reparaturweg.

Im lokalen Folgeschnitt haben Sidecar-Bootstrap und anschließende Anfrage
getrennte, weiterhin begrenzte Zeitfenster. Nach Quell-/Paketprüfung ist die
echte Windows-Wiederaufnahme mit synthetischen Daten erneut zu prüfen; bis
dahin gibt es keine Behauptung einer reparierten Auslieferung. Eine eigene
Nutzeraktion zur sicheren Aufgabe **ohne** Export ist noch nicht vorhanden;
BL-010.53.9 trennt sie von „Export fortsetzen“ und verlangt dauerhafte,
ehrliche Belege ohne Dateilöschung oder fingierten Abschluss.

### Windows-Anwendertest r19: unterbrochene Ergebnisbereitstellung

Der reale, ausschließlich synthetische 133-Dateien-Test des Anwenders hat alle
Quelldateien technisch bearbeitet (115 Ergebnisse, 17 bei ausgeschaltetem OCR
ausgelassen und ein Datenschutz-Prüfstopp, wie erst r22 exakt klassifizierte).
Das private Laufjournal besitzt einen Abschlussbeleg, **der
sichtbare Ergebnisexport aber noch keinen vollständigen Beleg**. Die r19-App
zeigte daher einen veralteten Stand „133 von 133 · Wird verarbeitet“ und verlor
die lokale Verbindung; Verlaufsschaltflächen konnten keine Daten nachladen.
Diagnose: Ein langer Export wurde beim Sidecar-Start synchron wiederholt,
während die native Verbindung nur ein kurzes Zeitfenster hatte. Nach dem
Verbindungsabbruch blieb eine Prüfsperre zurück. Weder Ergebnisse als
vollständig behandeln noch denselben Lauf erneut starten.

Der unveröffentlichte Windows-Kandidat r20 trennt Startprojektion und
Exportwiederaufnahme; der explizite Verlaufsabruf erhält ein begrenztes längeres
Zeitfenster. Exaktes ZIP:
`dist/engineering-content-anonymization-rc160-windows-20261015-r20/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`,
SHA-256 `2d2bc2ff09edbda3d4b0a8a7bd5f65fb5777358e972794ae284142aa37063ca6`.
Quell-Gesamtsuite einschließlich 118 Windows-Rusttests, Dokumentationsgate,
ZIP-Verifier und isolierter Paket-Sidecar-/Worker-Smoke sind grün. Die native
Bedienung und der Wiederanlauf **dieses gespeicherten 133er-Laufs** stehen
noch aus; die geöffnete r19-App und ihre privaten Daten wurden nicht verändert.

### Neuer Anonymisierungsweg `content-v1` – lokaler Windows-Testkandidat r19

Der zuvor gesperrte Start ist nun für **„Umwandeln und anonymisieren“** mit
dem gemeinsamen, ausdrücklich wählbaren Scan-/Bild-/Grafik-OCR-Schalter durch
Workspace, private IPC, Rust und den Worker bis zu Ergebnisordner, privater
Zuordnung, Fundstellenprüfung, Dokumentkorrektur/-freigabe und **getrenntem,
revisionsgebundenem KI-Export** verbunden. Der reine Markdown-Weg und der
bisherige Anonymisierungsweg behalten ihre getrennten Verträge. OCR-aus lässt
reine Bilder/Scans benannt aus; fehlende oder unsichere Extraktion wird nicht
als Anonymisierung des Originalcontainers ausgegeben. Eine technische
Konvertierung ist keine menschliche Freigabe.

Der unveröffentlichte Kandidat
`dist/engineering-content-anonymization-rc160-windows-20261014-r19/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
hat SHA-256 `84f0c86b97163cd3c1257b0b5f5fd8b68b10b0bd9d4e4414ca48429805af325f`.
Vollständiger ZIP-Verifier und isolierter **Paket**-Sidecar-/Worker-Smoke bestehen:
`content-v1`-Anonymisierung mit 4 Ergebnissen, benanntem fehlerhaftem CSV,
4.500 Fundstellen in der ersten Gruppe, Vertagen/Neustart, laufweiten
Entscheidungen und genau einer freigegebenen neutral benannten KI-Kopie;
Markdown-only mit OCR aus/an über zwölf angebotene Testformate, vier
erwarteten OCR-aus-Stopps beziehungsweise zwölf Ergebnissen sowie exakten
Korrektur-/Kopierbytes. Die Verlaufsprojektion liest Pausen nun aus demselben
Journalstand, statt jedes alte Ergebnis während der Veröffentlichung erneut
voll zu prüfen. Die neue Regression und der erneute Paketdurchlauf sind grün.
Der vollständige Quell-/Rust-Gesamteingang dieses **letzten** Schnitts ist
mit Exit 0 bestanden; 118 Windows-Rusttests bestanden, drei Hilfstests sind
bewusst ignoriert. `npm run test:docs:fast` und `git diff --check` sind grün.
Die tatsächlichen HTML/CSS/JS-Headless-Browsertests für Workspace und
Sammelprüfung bestehen einschließlich beider Zwecke, Axe und 390–1920 px;
sie verwenden synthetische IPC und sind keine native Bedienabnahme.
Die sechs nativen Windows-Formularfälle meldet die Quellsuite ausdrücklich
`NOT_RUN`.

Das ist eine lokale technische Testfreigabe, **keine Veröffentlichung** und
keine native Windows-GUI-, Mac- oder fachliche OCR-/Anonymitätsgarantie.
Die sichtbare Windows-Bedienung samt Inhaltssichtung durch den Anwender bleibt
als eigener Abnahmeschritt offen. Die folgenden Abschnitte sind frühere
Zwischenstände und überholen diesen r19-Status nicht.

### Neuer Anonymisierungsanschluss – lokaler Quellstand, nicht im r7-Paket

Der private `content-v1`-Publikationspfad `/4` ist im lokalen Quellstand nun
bis zu einer eigenen, wiederholbaren privaten Zuordnung und einem gebundenen
gewöhnlichen Ergebnisexport `/6` angeschlossen. Ein synthetischer echter
Publikationslauf prüft auch fehlenden Ergebnisordner, Wiederanlauf, genau eine
Kopie, widersprüchlichen Zuordnungsauftrag und Status nach Entfernung der
privaten Zwischenkopie. Legacy-Plugin-Pakete werden dabei nicht als Ersatzquelle
verwendet. Das ist **kein** Freigabebeleg für die neue Anonymisierung: Start über
Rust/IPC/UI, vollständiger Format-/Recovery-/Sicherheitsgesamttest und nativer
Pakettest fehlen. Die `content-v1`-Anonymisierungsoptionen bleiben gesperrt;
das vom Anwender getestete r7-Paket ist von diesen Quelländerungen unberührt.

Die Markdown-only-Konvertierung und ihre OCR-/Speicherlogik bleiben nach den
Anwendertests stabil. Eine kleine lokale UI-Korrektur zeigt die Wahl zwischen
Kontaktvergleich und ausdrücklichem ungeprüftem Fortfahren erst am wirklichen
Prüfhalt nach der Verarbeitung, nicht schon bei „47 von 133“.

Für die aktuelle OCR-/Markdown-Bedienkorrektur ist **Windows-r9** der hier
abschließend geprüfte lokale Kandidat; frühere Zwischenbauten belegen nicht
diese späteren Korrekturen. Details und Paketbindung stehen im folgenden Abschnitt.

### Lokaler Windows-Kandidat r7: direkter Raw-OCR-Verzicht und Anonymisierungstest

Der reine Markdown-Lauf kann eine zuvor freiwillig gewählte, noch offene
OCR-Kontaktprüfung ausdrücklich am Lauf überspringen, ohne das Prüffenster zu
öffnen. Das ist eine Entscheidung, die Kontaktwerte **nicht zu bestätigen**;
der private Lauf merkt sie dauerhaft und setzt die Verarbeitung fort. Es ist
keine Massenbestätigung. Vorhandene bestätigte Korrekturen werden nicht
gelöscht; übrige OCR-Zeilen bleiben weiterhin ungeprüft. Der Weg ist nur für
`markdown-only` zulässig, nicht für eine erforderliche Anonymisierungsprüfung.
Aktive Prüfung und Wiederaufnahme nach Neustart sind getrennt gegen Laufwechsel,
falschen Zweck und Zustandsverlust geprüft.

Der bisherige Anonymisierungsweg bleibt im selben Paket ausführbar: getrennte
Fundstellenentscheidung, Dokumentkorrektur/-freigabe und gesonderter KI-Export.
Die paketgebundenen synthetischen Sidecar-Gegenproben prüfen gemischte Quellen,
XLSX/DOCX, passive PDF/PPTX, OCR-Kontaktkorrektur, Review mit Vertagen/Neustart,
Quellunverändertheit, neutrale Namen und exakt ausgewählte Exportkopien. Das
ist ein Testkandidat für den **bestehenden** Anonymisierungsweg, nicht die
Freischaltung des neuen `content-v1`-Inhaltsprofils: dessen Start verweigert
weiterhin einen unvollständigen Gesamtanschluss. Deshalb werden die neuen Raw-OCR-/Ausgabeoptionen
nicht als wirksam im Anonymisierungsmodus behauptet.

`npm run test:standalone` bestand vollständig einschließlich 118 Rusttests;
`npm run test:docs:fast` und der vollständige ZIP-Verifier sind grün. Die
sechs nativen Windows-Formularfälle sind in der Quellsuite ausdrücklich
`NOT_RUN`; native Bedienung durch den Anwender und Mac-Abnahme bleiben offen.
Lokales unveröffentlichtes ZIP:
`dist/engineering-standalone-rc160-windows-20261014-r7/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`
(SHA-256 `7fe3a0062124b65adadf7da27ac3476898631d3b88709a5139253c4881954c6e`).

### OCR-Kontaktabschluss und freiwilliger Markdown-Editor – geprüfter lokaler Windows-r9

Die fachliche Gegenprüfung bestätigt eine irreführende automatische Übergabe:
Nach der gewählten Kontaktprüfung öffnete auch ein reiner Markdown-Lauf den
Dokumenteditor. Jetzt kehrt nur dieser Weg zum selben Lauf auf seiner
Ursprungsseite (Neue Verarbeitung oder Verlauf) zurück. Bei Anonymisierung
bleibt die Dokumentprüfung erforderlich. Zweck, Lauf und native Prüfergeneration
sind gebunden; unbekannter Zweck wird nicht als Anonymisierung ausgelegt.
Der freiwillige Editor erklärt Dateiname = Vergleich und Häkchen = zusätzliche
Kopie. `OCR_NOT_VERIFIED` bleibt fachlich korrekt erhalten und wird als fehlende
Vollprüfung des übrigen OCR-Texts erläutert, getrennt von unbestätigten
Kontaktwerten. Keine OCR-Erkennung, gespeicherte Entscheidung oder Exportgrenze
wurde geändert.

193 gezielte Frontend-/Projektionsgruppen und der synthetische Kontaktflow
bestanden. Echte HTML/CSS/JS-Headless-Prüfung mit synthetischem IPC besteht
für beide Zwecke, Vergleich/Kopie, Tastatur/Dialog, Axe und 390–1280 px.
Das ist keine native Windows-/OCR-Inhaltsabnahme. Der laufende und paketierte
r6-Stand enthält diese spätere Quellkorrektur nicht rückwirkend und bleibt
unverändert. Der neue Windows-Releasebuild, vollständige r7-ZIP-Verifier und
isolierte Sidecar-/Worker-Smoke dieses exakten ZIP bestehen: beide Markdown-
OCR-Stellungen, Kontaktkorrektur, Vertagen/Neustart, freiwilliges Raw-Skip ohne
erfundene Bestätigung, Korrektur und exakte zusätzliche Kopie. r7 enthält neben
der UI-Korrektur den bereits zuvor vorhandenen Quellanschluss für Raw-Skip;
Anonymisierung darf diesen nicht nutzen. Das unveröffentlichte lokale ZIP liegt
unter `dist/engineering-markdown-rc160-windows-20261014-r7/`, SHA-256
`45aae1d83c463bfdcfe0edae58125ff08a579155aa2c7f5b0599a679fe1a6b12`.
Keine native Tauri-/Windows-Bedienung oder Mac-Abnahme ausgeführt.

**r7 nicht übergeben:** Die zusätzliche unabhängige Paketgegenprüfung fand
einen noch nicht abgedeckten P2-Fall: Nach einem laufweiten Raw-Skip während
einer Gruppenaufteilung wurde der bereits erfasste Folgeeintrag erneut in eine
Kontaktgruppe eingereiht. Ein minimaler Abbruch vor dem Einreihen korrigiert
dies ausschließlich bei bestätigtem Raw-Skip. 18 frische Kontaktreviewgruppen
und unabhängige 250+250-Kontakt-/Anonymisierungsgegenproben bestehen; frühere
echte Bestätigungen bleiben erhalten, spätere werden nicht erfunden.
r7 bleibt als nicht zu übergebender Zwischenbau dokumentiert. Im nachfolgenden
r8-Gegenlauf wurde außerdem nachgewiesen, dass eine bereits gespeicherte, aber
noch nicht veröffentlichte Kontaktkorrektur bei späterem Skip nicht ins erzeugte
Markdown gelangte. Auch r8 wird deshalb nicht übergeben. Der Prozessor liest
jetzt zuerst vorhandene exakt gebundene Antworten. Nur fehlende Antworten
dürfen nach gespeichertem Skip ungeprüft bleiben; der Konverter erhält dann
Originaltext, Kontaktmap und beide Warnungen ohne Bestätigungsbehauptung.
21 Prozessor-/14 Consumergruppen und unabhängige erzeugte Inhaltsgegenproben
für beide Ausgabeprofile bestehen. Die Anonymisierungsgrenzen bleiben erhalten.

Der 232-Dateien-Headlesseingang bestand; er begann vor den letzten Skip-
Inhaltskorrekturen. Die betroffenen Pfade wurden danach gezielt frisch geprüft:
193 UI-/Projektions-, 18 Kontakt-, 21 Prozessor-, 14 Consumer-, 11 Persistenz-,
10 Startgrenzen- und 32 Inhaltsoperationsgruppen sowie Kontakt-End-to-End-Flow.
Frischer Windows-Releasebuild, vollständiger **r9**-ZIP-Verifier und isolierter
Sidecar-/Worker-Smoke genau dieses ZIP bestehen. Drei geänderte Backenddateien
und die beiliegende Anleitung sind bytegleich mit dem geprüften Source.
Aktueller gemeinsamer Quellstand einschließlich intern ausführbarer, aus den
angebotenen Starts weiterhin gesperrter neuer Anonymisierungspfade; kein reiner
UI-Diff oder Freischalten der neuen Anonymisierungsoptionen.
ZIP: `dist/engineering-markdown-rc160-windows-20261014-r9/`, SHA-256
`670d483d84c8f6f3d7e93f73cfaaf75b5802e34030b86cc8131f2d47a6981b3c`.
`PRUEFUNG.json` neben dem ZIP hält Nachweise und Grenzen fest. r6 bleibt
bytegleich; r7/r8 sind als zurückgehalten markiert. Keine Veröffentlichung,
native Windows-/Mac-Bedienung oder allgemeine OCR-Inhaltsabnahme.

### Anschluss an den OCR-Kontakt-Anwendertest – lokales Windows-Testpaket r6

Der Anwender hat den Markdown-Weg ohne OCR, mit OCR und mit freiwilliger
OCR-Kontaktprüfung im lokalen r4-Stand erprobt; die Sammelaktion funktionierte,
war bei gescrolltem eingebettetem Prüffenster aber nicht auffindbar. Die
Oberfläche trennt jetzt sichtbar **1. Werte auswählen**, **2. Behandlung wählen
und anwenden** und **3. Entscheidungen speichern**. Die Sammelaktion bleibt in
kurzen eingebetteten Desktopfenstern beim Scrollen sichtbar. „Alle gefilterten“
bezeichnet ausdrücklich alle Listenseiten; der Tabellenkopf wählt nur die
aktuelle Seite. Status und Hilfetext unterscheiden angehakte, vorgemerkte und
endgültig übergebene Entscheidungen. Längere Erläuterungen sind aufklappbar.
Keine OCR-, Markdown-, Anonymisierungs-, Antwort- oder Speichersequenz wurde
geändert; es gibt weiterhin keine Vorabauswahl oder automatische Bestätigung.

Fokussierte Frontend-, Workspace-, Dokumentreview-, Optionsbindungs-,
Review-Choice- und IPC-Tests sowie das Headless-Gesamtgate mit 232 Testdateien
bestanden. Native Windows-Formularfälle (6) bleiben davon getrennt und wurden
in dieser Runde nicht ausgeführt. Der echte HTML/CSS/JS-Headless-Test mit
synthetischem IPC prüft 390–1920 px, ein 580-px-hohes eingebettetes Fenster,
Tastaturfokus nach Anwenden und Axe; er ist keine native Bedienabnahme.
Windows-Releasebuild, vollständiger ZIP-Verifier und isolierter Sidecar-Smoke
des exakten r6-Pakets bestanden, einschließlich beider Markdown-OCR-Stellungen,
Kontaktprüfung, Korrektur, Vertagen/Neustart und Ergebnisdateien. r6 enthält
die korrigierte beiliegende Bedienanleitung. Das unveröffentlichte lokale
Test-ZIP liegt unter
`dist/engineering-markdown-rc160-windows-20261014-r6/` (SHA-256
`335830b85cc257094c24a6ba426659386a4138f4cf88db8670af9ce9dce5f982`).
Die native Windows-Bedienprobe durch den Anwender und Mac-Paket-/Bedienproben
für diesen r6-Stand bleiben offen.

### Anschluss aus dem OCR-an-Anwendertest – lokales Windows-Testpaket r4

Der Anwender meldete für denselben synthetischen 133-Dateien-Korpus einen
OCR-an-Lauf mit 133 Markdown-Dateien und 52 Inhaltshinweisen. Das ist eine
begrenzte Bedienbeobachtung, keine inhaltliche OCR-Abnahme. Der bisherige
freiwillige Raw-Editor zeigte trotzdem sämtliche 133 Ergebnisse. Die laufgebundene
Journalprojektion liefert nun Datei-ID, Originalnamen und Grund je Hinweis an
den Editor. Nur wenn Zähler und Bindungen vollständig übereinstimmen, startet
der Filter bei **Mit Hinweisen**; sonst zeigt er konservativ **Alle Dateien**.
Weitere Ansichten sind **Nachbearbeitet**, **Alle Dateien** und **Ohne Hinweise**.
Auswahl, Seitenwechsel und Kopiervorschau beziehen sich nur auf sichtbare
Dateien; Filterwechsel löscht die Auswahl. Nicht erstellte Dateien bleiben
separat, nicht als korrigierbare Markdown-Dateien. Ohne Hinweis heißt nicht
nachweislich fehlerfrei.

**Korrektur gespeichert** beruht auf dem aktuellen Hashunterschied zum
unveränderlichen erzeugten Basistext, nicht auf einer Revisionsnummer oder
Kopierzustimmung. Der Marker überlebt einen Sidecar-Neustart und verschwindet
nach Wiederherstellung des Basistextes. Korrektur speichern legt nur den
privaten Stand ab; erst die ausdrücklich bestätigte zusätzliche Markdown-Kopie
schreibt korrigierte Nutzdateien in `DataSecure-Markdown-Korrektur`. Der
ursprüngliche Ergebnisordner bleibt unverändert, auch bei Kopiervorschau und
Abbruch. Hinweise werden durch eine Textkorrektur nicht automatisch erledigt.

Ein dritter Anwenderlauf hatte die zweite, anfangs ausgeschaltete Checkbox
**Zusätzlich jeden erkannten OCR-Kontaktwert vor Abschluss prüfen** aktiviert.
Die Anzeige von 16 betroffenen Dateien und 97 Stellen bedeutet erkannte
E-Mail-/Telefon-Kandidaten, nicht 97 Konvertierungsfehler. Vor Start und im
Prüffenster wird nun erläutert: Das Opt-in hält den Lauf auch bei plausibel
aussehenden Werten an; Sammelentscheidungen werden erst ausdrücklich übergeben.
Die Kontaktprüfung bestätigt keine übrigen OCR-Zeilen. Der alte laufende
Windows-Teststand erhält diese neuen UI-Texte nicht rückwirkend. Im
Prüffenster können OCR-Kontaktwerte nun nach betroffener Datei eingegrenzt
und je Datei gesammelt vorgemerkt werden. Der Filter reduziert nicht die
Sicherheitspflicht des freiwillig gestarteten Prüfschritts: Vor Fortsetzung
müssen alle erkannten Werte dieser Gruppe ausdrücklich entschieden werden.

Fokussierte Tests: History-Komposition, 51 Dokumentfrontend-, 41 Store-, 69
Workspace-, 41 Matrixfrontend- und 25 Projektionsgruppen; echter Headless-
Browser mit synthetischem IPC prüft beide Filter, Korrektur,
Kopiervorschau, Axe und Reflow. Der Windows-Releasebuild, 118 Rusttests
(3 unveränderte ignorierte), Clippy, vollständiger ZIP-Verifier und
isolierter Sidecar-/Worker-Smoke des exakten r4-ZIP bestanden. OCR aus/an,
Kontaktkorrektur, Neustart und Raw-Kopie wurden paketgebunden geprüft.
`dist/engineering-markdown-rc160-windows-20261014-r4/` enthält das
unveröffentlichte ZIP, SHA-256
`73dd93e4a0b6a439bee42d21268e5a6646caa8246e6a903820575163a5f301d3`.
Das vollständige Headless-Produktgate bestand mit 232 Testdateien. Die
native Windows-Anwenderprobe bleibt getrennt; keine Mac-Abnahme daraus
ableiten.

## Markdown Abschlussanzeige nach dem ersten Anwenderlauf

### Anschlusskorrektur für den lokalen Windows Test r3

Die RC160-r2-Anwenderprüfung zeigte drei irreführende Übergänge: unmittelbarer
Wechsel in den Verlauf nach Start, eine stehengebliebene Bereitstellungsmeldung
nach bestätigtem Abschluss und eine scheinbare Pflichtfreigabe aller Raw-Dateien.
Der bestätigte Start bleibt jetzt auf der aktiven Laufseite. Die erfolgreiche
Raw-Abschlusskarte ist grün, Ergebnisordner primär, weitere Aktionen und Hinweise
standardmäßig geschlossen. Ein Bereitstellungshinweis ist laufgebunden und wird
nur nach passender bestätigter Fertigstellung ohne offene Bereitstellung entfernt.
Unabhängige Fehlermeldungen bleiben bestehen.

Die optionale Markdown-Nachkorrektur zeigt den Ladevorgang sichtbar. Erwartete
OCR-aus-Auslassungen stehen in gelben Gruppen mit einzeln aufklappbaren Dateien;
Grund und nächste Aktion erscheinen einmal, nicht in zwei roten Listen.
Die Klassifizierung vergleicht nachgewiesene Journaloptionen mit Dokument-ID,
Dateiname, Ursache und Zählern. Fehlende oder widersprüchliche Belege geben
keine Entwarnung.

Bereits erstellte Markdown-Dateien benötigen keine weitere Freigabe. Im Raw-
Editor sind Freigabe-/Widerrufsbuttons ausgeblendet; Nachkorrektur ist freiwillig.
Eine zusätzliche Kopie benötigt genau eine ausdrückliche Modalbestätigung.
Die read-only Vorschau bestätigt keinen Dokumentstand und startet keinen Export.
Erst die Speicherbestätigung bindet die ausgewählten Raw-Stände intern zur Kopie:
ACK muss ID, Modus, Revision+1, unveränderten Hash und lokale Flags belegen.
Der Dateinamenplan wird anschließend neu abgeglichen. Verlorene, partielle oder
abweichende Antworten starten keine Teilkopie und werden nicht automatisch
wiederholt. Einzelne vorherige Bestätigungen können gespeichert bleiben.
Das ist Kopierzustimmung, keine allgemeine menschliche Inhaltsprüfung.
Anonymisierte Vorschauen und tatsächliche Exporte verlangen weiterhin die
getrennte gültige Freigabe; auch tatsächliche Raw-Kopien prüfen diese intern.

49 Dokument-Frontend-, 69 Workspace- und 41 echte Dokumentstore-Gruppen,
History-Kompositionsgegenproben sowie echte Headless-HTML/CSS/JS-/Axe-/
390–1280px-Prüfung bestehen. Ein unabhängiger read-only Review prüfte zusätzlich
verlorene ACKs und alte Modalbestätigungen nach geänderten Textständen.
Logs unter `dist/workflow-rc160-usability-`, Darstellungsbelege unter
`dist/workflow-usability-design-20261014-r3`. Frischer Windows-Releasebuild,
vollständiger Archivverifier und isolierter Sidecar aus dem exakten neuen ZIP
bestanden. Neue Dokumentklassifikation sowie unbestätigte read-only Raw-
Vorschau und verweigerter tatsächlicher Export vor Kopierzustimmung geprüft.
OCR-aus acht Ergebnisse/vier erwartete Auslassungen/null technische Fehler;
OCR-an zwölf Ergebnisse/null Fehler. Manuelle Korrektur, exakt bestätigte Kopie,
Originalnamen und Neustart bestehen. Kein nativer UI-/Mac-Nachweis daraus.

RC160-r3: `dist/engineering-markdown-rc160-windows-20261014-r3/`
`DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`, 1128 Einträge,
111970176 Bytes, SHA-256
`7ab70ac9f12baa26a5c4114f693601f871fa90d721e9b3a614c401997afe6e4d`.
Bereit für lokalen Windows-Anwendertest. Vollständiger Headless-Gesamteingang
mit 232 Dateien erfolgreich beendet, Exit 0; abschließende Workspace-,
Dokumentfrontend-, Projektions- und Browsergegenproben zusätzlich wiederholt.
Kein eingefrorener Quellstand während des gesamten Eingangs behauptet.
Der erste RC160-r3-Anwenderbericht mit Screenshot bestätigt die verständliche
grüne OCR-aus-Abschlussanzeige für 133/116/17 und 35 getrennte Inhaltshinweise.
Das ist eine begrenzte Windows-Bedienprobe, keine vollständige Inhalts-/UI-Abnahme.
OCR-an-Anwenderprüfung folgt; keine Onlineveröffentlichung und kein Main-Push.

Der Anwenderbericht vom 14.10.2026 und die anschließende lokale Metadaten-/
Dateiprüfung bestätigen für den RC160-r1-Lauf 133 ausgewählte Quellen,
116 nichtleere Markdown-Ergebnisse mit passenden Publikationsprüfsummen und
17 wegen ausgeschalteter OCR nicht umgewandelte Quellen: 13 Rasterbilder,
vier PDFs ohne nutzbaren nativen Text. Das ist ein begrenzter Windows-Anwendertest,
keine allgemeine Inhalts-, Plattform- oder N3/N4-Abnahme. 35 erstellte Dokumente
tragen eigenständige Coverage-/Auslassungshinweise, nicht 35 zusätzliche Fehler.

Die Anschlusskorrektur klassifiziert erwartete Auslassungen ausschließlich
aus unabhängig gebundenen Standalone-`batch/7`-Raw-`content-v1`-Journals mit
beiden OCR-Flags aus. Historische Stoppszähler bleiben unverändert. Laufkarte,
Leitfaden und Verlauf erklären „Lauf abgeschlossen mit Hinweisen“ und priorisieren
den vorhandenen Ergebnisordner. Nachkorrektur bleibt optional; technische Fehler,
Inhaltshinweise und noch unbestätigte Kopien bleiben getrennt sichtbar.
Die optionale Belegansicht heißt „Nachkorrekturen und Kopien“. Anonymisierung
behält die Pflichtfreigabe-/KI-Exportsemantik. Der Gesamtfortschritt zählt terminale
Stopps nicht doppelt. Bei fehlenden historischen Details keine nachträgliche
OCR-Entwarnung. Kein automatisches OCR, kein neuer Start durch Hinweise.

68 Workspace-Regressionen, 23 Projektionsgruppen und die History-Gegenproben
bestehen. Echte HTML/CSS/JS-Headless-Prüfung mit synthetischem IPC prüft die
133/116/17-Anzeige, gemischte Fehler, getrennte Inhaltslisten, Fokus, Axe und
390–1280px-Reflow. Neue Oberfläche noch nicht durch den Anwender bedient;
kein Mac-Nachweis daraus ableiten. Nachweise unter
`dist/workflow-rc160-completion-workspace-final.log` und
`dist/workflow-rc160-completion-design-final.log`.

Lokales r2-Testpaket: `dist/engineering-markdown-rc160-windows-20261014-r2/`
`DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`, 1128 Einträge,
111967999 Bytes, SHA-256
`504659495c3cde0d0dfb1ed7840abdd6a66c491f409bf57b6127210977b74696`.
Windows-Releasebuild, vollständiger Archivverifier und Sidecar aus genau
diesem ZIP bestehen. Raw-OCR-aus bestätigt acht Ergebnisse/vier erwartete
Auslassungen/null technische Fehler; OCR-an zwölf Ergebnisse/null Fehler.
Kontaktkorrektur, Vertagen/Neustart, manuelle Dokumentkorrektur, ausdrücklich
freigegebene zusätzliche Kopie, Originalnamen und exakte Exportbytes bestehen.
Die reine Dateierstellung benötigt weiterhin keine Pflichtfreigabe.
Logs `completion-package-build/stage/verify/smoke.log` unter
`dist/workflow-rc160-`. r1 bleibt unverändert; keine Onlineveröffentlichung.
Vollständiger Headless-Eingang mit 232 Dateien, Exit 0, abgeschlossen
(`dist/workflow-rc160-completion-product.log`). Die abschließenden Workspace-,
Browser- und Dokumentationsgegenproben wurden zusätzlich wiederholt. Für diesen
Gesamtlauf wird kein während der Änderungen eingefrorener Quellstand behauptet.
R2 ist für den lokalen Windows-Anwendertest bereit; Einzelbelege und Grenzen
stehen in `PRUEFUNG.json` neben dem ZIP.

## Markdown Appanschluss und lokaler Windows Testkandidat

Der dauerhafte Zielauftrag ist auf Anwenderwunsch beendet, die Fortsetzungsautomation
pausiert. Aktuell beauftragt ist ausschließlich der vollständige Markdown-Weg
mit lokalem Windows-Testpaket. Keine Veröffentlichung, kein Main-Push und keine
kostenpflichtigen Workflows gehören zu diesem Auftrag.

Neue reine Konvertierung verwendet `content-v1`: Originalnamen mit `.md`,
Text und Tabellen ohne aktive Bilder, Bildverweise oder technische OCR-Absätze.
Die gemeinsame Checkbox „Text aus Scans, Bildern und Grafiken per OCR lesen“
ist standardmäßig aus; sie setzt beide gespeicherten OCR-Flags gemeinsam.
Die Kontaktprüfung bleibt eine getrennte zusätzliche Wahl. Rust, private IPC,
Dienst, eigener Intake-Nachrichtentyp, Journal, Konverter, Korrektur und Export
sind angeschlossen. Alte Läufe behalten ihre Semantik. Neue Inhaltsoptionen
im Anonymisierungsstart bleiben gesperrt; die bisherige Anonymisierung bleibt
davon getrennt.

Der tatsächliche Sidecar-/Worker-Test mit zwölf synthetischen Quellen ergibt
acht Ergebnisse und vier benannte Bild-/Scanstopps ohne OCR sowie zwölf
Ergebnisse ohne Dateifehler mit OCR. Geprüft sind Originalnamen einschließlich
Kollisionen, keine Pseudonyme/Zuordnungen, manuelle Korrektur, ausdrückliche
Freigabe, exakte Exportbytes und Wiederöffnen nach frischem Prozessstart
(`dist/workflow-rc160-markdown-format-sidecar-corrected.log`). Rust und Clippy
bestehen (`markdown-app-rust.log`, `markdown-app-clippy.log` unter `dist/workflow-rc160-`).
Headless-Browserprüfung mit echtem HTML/CSS/JS prüft Checkboxzustände, Reflow,
Fokus, Schriften, Dokumentkorrektur und Exportnamen; der IPC-Adapter darin ist
synthetisch und keine native Bedienabnahme.

Eingebettete Office-Rasterbilder verwenden nur tatsächlich referenzierte
Medien und lokale OCR. Unterstützt sind PNG/JPEG/BMP; andere Bildtypen stoppen
bei gewählter OCR mit benannter Capabilityursache. Markdown liest keine
externen oder relativen Bildziele automatisch. OCR-Lesefehler bleiben möglich;
das geprüfte Markdown kann anschließend vollständig nachkorrigiert werden.
Frischer vollständiger Headless-Eingang: 232 Dateien, Exit 0
(`dist/workflow-rc160-markdown-app-product-frozen-final.log`), Quellen und Tests
während des Laufs unverändert. 65 Konvertergruppen ohne Skip und 26 zusätzliche
Office-/MD-Gruppen (sieben Source-/Policy-, 19 tatsächliche Windows-native Gruppen)
bestehen. Optionaler neuer Raw-Kontaktreview mit echten Originalpixeln,
unterschiedlichen Korrekturen, Vertagen und Neustart besteht.

Lokales Windows-Engineeringpaket gebaut und exakt geprüft:
`dist/engineering-markdown-rc160-windows-20261014-r1/DataSecure-Standalone-3.2.0-rc160-windows-x64.zip`,
1127 Einträge, 111963984 Bytes, SHA-256
`57cb06245d390dc96466faf07a0e9a29df3f620516fe22c3bca5d58d6de42a22`.
Vollständiger Archivverifier und echter Sidecar aus diesem ZIP bestehen,
einschließlich Legacy-Anonymisierung, neuem Raw-Weg, Kontakt-/Dokumentkorrektur,
Originalnamen, exakten Exportbytes und Neustart. Nachweise unter
`dist/workflow-rc160-markdown-app-package-{build,verify,smoke}.log`; Einzelstatus,
Quellinventar und Grenzen in `PRUEFUNG.json` neben dem ZIP. Nach dem Build nur
zwei Testfixtures korrigiert, keine ausgelieferten Produktbytes. Der abschließende
frische Gesamtlauf enthält diese Korrekturen. Anleitung und Backlog abgeglichen.
Native Windows-Bedienung und beide Mac-Architekturen bleiben für diesen Stand
`NOT_RUN`; kein Main-Push oder Online-Release.

Die folgenden Abschnitte dokumentieren chronologische frühere Teilstände;
ihre damaligen Startsperren ersetzen nicht den oben beschriebenen aktuellen Raw-Anschluss.

## Lokale Weiterentwicklung, 13.10.2026 (DS-110 / BL-010.53)

Neuer dauerhaft beauftragter [Workflow-/Inhaltsauftrag](../../tasks/AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md)
mit sechs verknüpften Aufgaben und Abnahmekriterien angelegt. Inhaltstreue
Text-/Tabellenkopie und zusätzliche Bild-OCR nur nach ausdrücklicher Wahl sind
neue Zielpräzisierungen, noch keine durchgängig angeschlossenen Nutzeroptionen.
Desktopfreigabe später am 13.10.2026 wieder erteilt; die folgenden bisherigen
Nichtbediennachweise bleiben unverändert. Keine API-Keys oder kostenpflichtige API.

**Inhaltsbausteine, 14.10.2026, unveröffentlicht:** Echte MD-Bild-/HTML-/SVG-
Syntax wird im expliziten Konverterprofil `content-v1` mit gepinnten Syntaxlesern
in Text überführt; Alt-/Tooltip-/SVG-/Captiontexte und Codecontainer bleiben
erhalten. TXT und CSV bleiben literal, einschließlich GFM-Tilden und bedeutungstragendem
Leerraum. Office-Prosa, Zellen und Chart-/Layout-/Mastertexte erhalten ihre
sichtbaren Quellzeichen, ohne aktive Bildknoten zu erzeugen. Konverter-Legacy
und `notes-v1` behalten in den Gegenproben die bisherigen Bytes. Regressions-
und unabhängige Rendererprüfungen bestehen; 54 tatsächlich ausgeführte isolierte
Windows-Konvertergruppen, null übersprungen, stehen in
`dist/workflow-rc160-content-converter-literals.log`.

CSV-Privacy behält echte Header. Einspaltige sensible Tabellen werden nun
korrekt anonymisiert; der Struktur-Resttest erhält nach Maskierung die
Zellbelegung statt leere Werte als falsche Abschluss-Pipes zu lesen. 13 CSV-
und 159 PII-Fälle bestehen; unabhängige Gegenproben bestätigen elf gültige
maskierte Formen und sechs weiterhin gestoppte Strukturfehler. Der frische
vollständige Headless-Eingang nach den letzten Literal-/Einspalten-/
Strukturkorrekturen besteht mit 221 Dateien
(`dist/workflow-rc160-product-headless-literals.log`, Exit 0). Keine Produktquelle
wurde während dieses Laufs geändert. Sechs native Windows-Formfälle und native
Tauri-/Paketbedienung bleiben durch diesen Eingang ausdrücklich `NOT_RUN`.
109 aktuelle Windows-Rusttests und warning-free Clippy bestehen separat;
die drei ignorierten Rust-Hilfseingänge sind ausschließlich für Kindprozess-
Harnesses vorgesehen. Docs sowie strenge Plugin-/Marketplace-Struktur sind grün.

Der geschlossene Optionsvertrag ist im Persistenzbaustein implementiert:
Journal `/7`, unabhängiges Runmanifest `/3`, Dokumentbasis `/2`, Intake-Intent
`/3` und OCR-Korrektur `/3`. Zehn reale Dateisystemgruppen prüfen beide Zwecke,
acht Optionskombinationen, Neustart, gültige Optionsänderungen bei gleichen
Textbytes, Schema-/Channel-Downgrade, fehlenden Anker, all-rejected und vollständige
HMAC-Bindung. Historische Läufe behalten ihre bisherigen Regeln. Die reine
Vertragslogik bleibt ohne native Imports; SHA-256 gehört zum Persistenzadapter.
Gemeinsame validierte Zweckhelfer versorgen Executor, Recovery, Snapshot,
Review, Delivery, Ergebnisprojektion und Retention. Unvollständige alte
Unitfixtures wurden um Laufidentitäten ergänzt, nicht Produktprüfungen gelockert.

Der vollständige Headless-Eingang nach der direkten Zweckkorrektur besteht
mit 222 Dateien (`dist/workflow-rc160-content-persistence-product-headless-final.log`,
Exit 0). Produkt- und Testquellen blieben während dieses Laufs unverändert.
Das unabhängige Review reproduzierte zuvor einen direkten Privacy-Beleg für
einen all-stopped-Rawlauf. Der normale Hauptpfad war bereits gesperrt; ein
Datenabfluss wurde nicht nachgewiesen. Belegerzeuger, Privacy-Capture und
Review-Veröffentlichung erzwingen nun selbst denselben validierten
Anonymisierungszweck. Belegmatrix mit Erfolg, pending, all-stopped und Mischfällen
sowie Raw `/5`-/`/7`-Gegenproben an den drei direkten Einstiegen bestehen.
Gezielte Nachprüfung von Beleg, beiden Revieweinstiegen, Orchestrierung,
Terminalnachweis, reinem Core und drei Renderern steht in
`dist/workflow-rc160-content-purpose-enforcement.log` (Exit 0).
Die nachfolgende Vorstartabsicherung ist ebenfalls implementiert: Der echte
Tauri-Requestbody unterscheidet fehlendes Feld, `null`, Alias und unbekannte
Felder. Geschlossene Rust-Varianten validieren den inneren Vertrag; noch nicht
angeschlossene Optionen stoppen mit `CONTENT_OPTIONS_NOT_READY`, bevor die
Aufnahme verbraucht wird. Private IPC, Dienst, Intake, alle drei Executor-
Einstiege und beide Worker stoppen vor ihrer jeweiligen Aufnahme-/ACK-Grenze.
Vier unabhängig reproduzierte interne Altweg-Umgehungen sind korrigiert;
kein Umgehen des geschützten Desktopstarts oder Datenabfluss wurde nachgewiesen.
Neun Bereitschaftsgruppen, zwölf echte Worker-Ablehnungsfälle und 71 Startup-
Fälle sowie ein 14-Dateien-Nachtest bestehen
(`dist/workflow-rc160-content-start-boundary.log`). 36 zusätzliche unabhängige
Gegenproben bestätigen keine Nebenwirkungen oder Getter-Auswertungen.
115 Windows-Rusttests und warning-free Clippy bestehen separat
(`dist/workflow-rc160-content-start-rust.log`, `dist/workflow-rc160-content-start-clippy.log`).
Die drei ignorierten Rust-Hilfseingänge sind keine ausgelassenen Abnahmefälle.
Der vollständige 223-Dateien-Headlesseingang dieses Vorstartschnitts besteht
(`dist/workflow-rc160-content-start-product-headless.log`, Exit 0). Quellen und
Tests blieben während des Laufs unverändert; native GUI bleibt separat `NOT_RUN`.

**Direkter Konverteranschluss, 14.10.2026:** Neuer vollständiger Optionsaufruf
mit strikt gelesenem CLI-Argument, Response/Extraction `/2` und exakt geprüftem
Options-Echo; alte Workerantworten werden abgewiesen. Eigenständige Bilder ohne
Bild-OCR stoppen vor Decoder/Runtime. Beide PDF-Optionen aus lesen keine
Rasterpixel und geben keinen textlosen Scheinerfolg aus; beide an lesen passiv
und begrenzt auch Vektor-Grafiktext. Einzelwahl mit unklaren PDF-Rollen stoppt
vor OCR mit `PDF_OCR_SCOPE_REQUIRED`. Ein laufweiter Bereichsreview ist geplant,
noch nicht angeschlossen; auch Office-Bild-OCR bleibt ein benannter Capabilityrest.
Im neuen Inhaltsprofil liegen PDF-Container-Metadaten getrennt im geschlossenen
privaten Vertrag, nicht im Markdown. Die damalige Legacy-Artefaktgrenze
verweigerte `/2`, statt eine Optionsbindung zu strippen; der neue Raw-Anschluss
ist im nachfolgenden Abschnitt beschrieben.
Elf Vertrags-/Parentfehlertests, 36 PDF-/Textfälle, 13 reine Coregruppen und
17 Artefaktfälle bestehen. Unabhängige Gegenreviews führten zu Regressionen für
Signalgetter/-fälschung, Multiwort-Runboxen, unklare Marked-Content-Layer und
Vektorpaints. 14 Signalgegenproben bestätigen null Getter-/Proxy-Ausführung;
strengere Marked-Content-Geometrie ist ausdrücklich auf neue Verträge begrenzt.
Der tatsächliche 62-Gruppen-Konverterlauf nach dieser Kompatibilitätskorrektur
besteht ohne Skip (`dist/workflow-rc160-content-converter-options-compat.log`,
Exit 0), einschließlich echter `CLOUD`-Vektorzeichen, Kontaktcrops und
60 früher Abbrüche. Die 224-Dateien-Gesamtregression stoppte anschließend an
einem zufallsabhängigen Testorakel: `end` in einem Base64url-HMAC wurde als
Rohtext missverstanden. Der Test prüft nun den geschlossenen Payload und
kanonische 32-Byte-Digests; getrennte HMAC-/Tamperingprüfungen bleiben erhalten.
Zehn Reviewchoices-Gruppen bestehen; der fehlgeschlagene Gesamtlauf wird nicht
nachträglich als PASS gewertet.
Der neue gemeinsame Standalone-Vortesteingang prüft Persistenz, Bereitschaft,
Konvertervertrag, reinen Core und Coverage in 47 Gruppen und ist auch im
Mac-Paketworkflow erreichbar. Windows-Rust erneut 115 grün, Clippy warning-free,
Docs und installierte strenge Plugin-/Marketplace-Validierung bestehen.
Logs: `dist/workflow-rc160-converter-content-boundaries-final.log`,
`dist/workflow-rc160-converter-content-rust.log`,
`dist/workflow-rc160-converter-content-clippy.log`,
`dist/workflow-rc160-converter-content-docs.log`.
Das Mac-Workflow-Vertragsgate ist kein ausgeführter nativer Mac-Test.

**Gespeicherter Raw-Verbraucheranschluss, 14.10.2026:** Laufoptionen werden nach
Caller-Abhängigkeiten in beide Capture- und Publikationsrouten eingesetzt.
`convert-next` verlangt das genaue Extraction-`/2`-Echo und den Quelltyp vor
Kontakt-/Dokumentcapture. Kontaktkorrektur erhält `/2` und private Metadaten;
im Inhaltsprofil wird kein eigener OCR-Korrekturhinweis eingefügt. Artefakt `/2`
bindet Optionen, aber enthält keine private Containerinformation. Persistente
Basis `/2` validiert das Konverter-Echo und geschlossene Metadaten beim Schreiben
und frischen Lesen. Delivery, Recovery und Ergebnisprojektion prüfen den
gespeicherten Vertrag auch bei identischen Markdownbytes.

Geprüfte Exportoperation `/7` und gewöhnlicher Raw-Export `/5` binden dieselben
Optionen; Originalbasisnamen und exakt freigegebene Bytes bleiben erhalten.
Generischer Replay entdeckt den unabhängigen Runanker auch nach Entfernung der
Bindungsfelder und einem Legacy-Schema-Downgrade. Ein eigener unveränderlicher
Exportowner bewahrt die neue Laufzuordnung auch bei fehlendem Dokumentlaufordner.
Der noch offene gewöhnliche neue anonyme Export stoppt ausdrücklich vor
Planänderung; ein Legacy-Paket bestätigt keine neue Optionswirkung. Wartungsinspektion ist getrennt
von optionsgebundenen Verarbeitungslesern. Drei unabhängig reproduzierte
In-Memory-/Replayfehler wurden zuerst regressionsgebunden bestätigt und dann
korrigiert: Schema-Getter, Options-Getter vor Rekonstruktion und Export-Downgrade.
Kein daraus abgeleiteter Betriebssystem-/GUI- oder Metadatenabflussnachweis.
Zwölf neue reale Consumergruppen, 17 Legacy-Markdown-Batch-/Exportgruppen,
sieben Retentionsgruppen, 30 Revieworchestrator- und 20 Itemgruppen bestehen.
63 tatsächliche Windows-Konvertergruppen ohne Skip bestehen mit einer neuen
Zehn-Quelltyp-Gruppe über isolierte Konvertierung, private Basis, frisches Lesen,
synthetische Freigabe und Originalnamenexport
(`dist/workflow-rc160-content-consumer-native-final.log`). CSV-Literaltext wird
mit unabhängigem Markdown-Renderer verglichen, nicht mit einer falschen
Rohsubstringannahme. Die nachfolgende finale Ownerhärtung ist separat durch
gezielte Dateisystem-/Replaytests belegt; der neue komplette Headlesseingang
bleibt ein eigener Nachweis. Standalone-Startoptionen bleiben bis zum vollständigen
Anonymisierungs-, Bereichsreview- und Transportanschluss gesperrt. Windows-Rust
erneut 115 grün, Clippy warning-free; Build bleibt am sauberen Quellcommit-Gate,
das RC160-Cowork-ZIP fehlt. Keine neue Paketfreigabe.

Vollständiger Starttransport über Rust/private IPC bis zum tatsächlichen
OCR-Worker, neue Scan-/Bild-Bereichsentscheidungen, tatsächlicher neuer Privacy-Verbraucher und neue native
Bedien-/Mac-Nachweise bleiben offen. Die Optionen sind nicht im Nutzerstart
aktiviert. Standalone bleibt lokal und eigenständig, ohne Modellanbindung,
API-Key oder automatische Uploads; Menschen wählen eine externe Nutzung selbst.
Der lokale Neubau bleibt am sauberen Quellcommit-Gate gesperrt;
`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`, aktuelles RC160-Cowork-ZIP fehlt.
Neue Quell-/Test-/Dependencydateien sind selektiv staged, nichts committed,
gepusht oder veröffentlicht. Der frühere r4-Kandidat ist kein Paket dieses Schnitts.

**Weiterer Privacy-Inhaltseingang, 14.10.2026:** `markdown-first-privacy`
verlangt bei neuen vollständigen Optionen den genauen Konvertervertrag `/2`
und erzeugt einen neutralen Source-Extraction-Nachweis `/2`. TXT/MD/CSV kommen
nur im neuen Standalone-Pfad hinzu; Cowork und historische Allowlisten bleiben
unverändert. CSV behält tatsächliche, auch leere/mehrfache/paddinghaltige Header
und Leerrecords; DOCX behält im neuen Pfad sichtbare Kopf-/Fußzeilen. Acht neue
Adaptergruppen, sechs reine Sourcegruppen und 13 Raw-Consumergruppen bestehen.
Office-Header-Whitespace kann keinen generischen Spaltenkopf als Privacy-
Eingang stehenlassen: ein unabhängiger echter ZIP-/XML-Gegenfall mit übersehenem
Einzelwert wurde rot bestätigt und durch reine Labelprojektion korrigiert.
Quellheader bleiben unverändert. Produktadapter blockieren Getter/Proxies;
reine Coredecoder geben fremde Reflexionsfehler nur als festen Code aus.
Die kontakt-only Coverage-Regression ist korrigiert; sämtliche übrigen
Coveragegründe bleiben erhalten. Direkter Anonymisierungsaufruf stoppt neue
Verträge vor Nebenwirkungen, auch bei Proxy-Prototypen. Acht unabhängige
Zero-Trap-/Zero-Effect-Proben und vier kompatible Legacy-Objektformen bestätigen
die Härtung. Der vorherige vollständige 225-Dateien-Headlesslauf ist grün
(`dist/workflow-rc160-content-consumer-product-headless.log`, Exit 0);
er belegt nicht automatisch diesen nachfolgenden Schnitt. Neue Privacy-
Publikation/Recovery/Mapping/Export, Bereichsreview und Starttransport bleiben
offen; `NOT_READY` wird nicht mit einem Adaptertest aufgehoben.
Frisch: 71 gemeinsame Inhaltsgruppen, Docs und Diffprüfung bestanden;
64 tatsächliche Windows-Konvertergruppen ohne Skip bestanden mit echtem
Office-Header-Gegenfall durch isolierten Worker und Privacy-Engine
(`dist/workflow-rc160-privacy-input-native-final.log`). 50 unabhängige
Fremdausnahmeproben plus drei eigene Längengrenzen bestätigen feste reine
Vertragsfehler; die native Importgrenze bleibt geschlossen. Windows-Rust
115 grün, drei Helper-Einstiege ignoriert, Clippy warning-free. Kein neuer
Tauri-/Mac-Bediennachweis. Der vollständige 226-Dateien-Eingang ist jetzt grün
(`dist/workflow-rc160-privacy-input-product-headless.log`, Exit 0), ohne native GUI.

**Personenfeld-Schnitt, 14.10.2026:** Neue Inhaltsverträge wählen den reinen
Matcher `content-person-fields/1`; Legacy verwendet seine unveränderte Grammatik.
„First Name“ und „Vollständiger Name“ sowie die bestehenden Personen-/Rollenlabels
werden zwischen Office-Promotion, Redaktion, Restprüfung und privater späterer
Dokumentfreigabe konsistent getragen. Snapshotoptionen bestimmen die Semantik,
nicht ein vom Aufrufer gewählter Marker; der Tabellen-Cache bindet Text und Policy.
13 Adapter- und 14 reine Coregruppen bestehen. Unabhängige NFD-/Zero-Width- und
inkonsistente-Header-Gegenfälle wurden rot bestätigt und korrigiert: Headerausgabe
bleibt unverändert, unklare Tabellen stoppen vor Aliasbildung. Sachliche
Negativköpfe und Legacy-/Neu-/Legacy-Wechsel sind getrennt geprüft. Ein neuer
Locator verweigert nicht positionsgetreue Normalisierung, statt leere oder
verschobene Fundstellen auszugeben; eine entsprechende Positionsmap bleibt offen.
Der grüne 226-Dateien-Lauf oben gilt vor diesen nachfolgenden Änderungen.
Neue Gesamt-, Native- und Dokumentnachweise bleiben separat; `/4`-Publikation,
Replay/Mapping/Export, Bereichsreview und Starttransport sind noch nicht fertig.
Frisch für den Personenfeld-Schnitt: 77 gemeinsame Inhaltsgruppen, 64 tatsächliche
Windows-Konvertergruppen ohne Skip und 41 private Dokumentprüf-/Exportgruppen
grün (`dist/workflow-rc160-person-fields-boundaries-latest.log`,
`person-fields-native-final.log`, `person-fields-documents-final.log`). Vier
unabhängige ZIP/XML-, 60 Struktur-/Registry- und acht Locatorproben bestätigen
die Nachkorrekturen; sechs private FS- und 20 Reservierungsfälle bestätigen
die gespeicherte Weitergabe. Synthetische `/3`-Paketstubs isolieren dort nur
die private Policyprüfung, nicht den offenen `/4`-Gesamtworkflow. Rust 115 grün,
drei Helper-Einstiege ignoriert, Clippy warning-free; Docs und strenge lokale
Plugin-/Marketplacevalidierung grün. Die vollständige Personenfeld-Regression
ist inzwischen bestanden: 226 Headlessdateien, Exit 0
(`dist/workflow-rc160-person-fields-product-headless.log`), keine GUI-Abnahme.

**Privater Anonymisierungs-Publikationskern, 14.10.2026:** Ein eigener fester
Pool `standalone-anonymized-artifacts/Output` speichert geschlossene `/4`-Belege.
Prozesslokale Residualnachweise binden Textbytes, Profil, Quelltyp, Coverage und
vollständige Optionen; selbst erzeugte Objekte ersetzen sie nicht. Der private
Reader verlangt zusätzlich den unabhängig gespeicherten Manifesthash. Staging
prüft nach dem Vorcallback und nach Rename; verlorene Bestätigungen retractieren
keinen Commit. Öffentlicher Reader und Legacy-Pool erhalten keine `/4`-Freigabe;
reservierte Bindungsfelder stoppen auch nach `/4→/3`-Herabstufung.
Neue Dokumentbasis `/2` speichert diesen Kontext gegen Runanker `/3`; eigener
Publikationsbeleg `/2` überspringt beim Wiederöffnen keine Paketprüfung.
Der tatsächliche Schnitt Publikation → private Basis → menschliche Freigabe →
exakter Dokumentexport `/7` ist geprüft. 16 neue Publikationsgruppen, 27 öffentliche
Readergruppen, 41 Dokumentgruppen, 13 Raw-Consumer-, 10 Persistenz-, 14 Core- und
10 Bereitschaftsgruppen bestehen (`dist/workflow-rc160-private-publication-*`).
Echte Node-Prozessabbrüche vor/nach Rename und frische Readerprozesse enthalten
keine native GUI-Abnahme. Zwei unabhängige Typ-/Proxy-Gegenfälle wurden rot
reproduziert und korrigiert. Die Formatbelege dieser neuen Tests sind synthetische
Extraktionsreceipts, keine erneute native Formatkonvertierung.
Die unabhängige Nachprüfung bestätigt 22 Negativfälle ohne Getter-, Coercion-
oder Proxyzugriff sowie erneute Paketprüfung trotz gespeichertem Publikations-
receipt. Windows-Rust 115 bestanden, drei Helper ignoriert, Clippy warning-free;
Docs und strenge installierte Pluginprüfung grün für diesen Schnitt.
Der neue Leser ist inzwischen an Batch-Reconciliation, initiale und spätere
Publikationscallbacks, lokale Delivery, Ergebnisprojektion und Terminalnachweis
angeschlossen. Runmitgliedschaft bindet Namen und Quellhash; fehlende Ziele
benötigen eine unveränderte Elternkette und dürfen keinen vorhandenen
Publikationsbeleg widersprechen. Öffentliches `/3` gleicher ID und alte
Stat-Identity-Caches ersetzen keine private `/4`-Prüfung. Rename-Lost-ACK vor
dem Reviewcallback bleibt `processing` und wird vor dem Mapping anhand der
privaten Bytes rekonstruiert. Alte Abschlussbelege dürfen keinen neuen `/7`-
Lauf bestätigen; lokale Delivery erzeugt keine Public-Capability oder Plugin-ACK.
Der Publisher prüft Kapazität am tatsächlichen privaten Stage vor Nutzdateien.
30 Publikations-/Recoverygruppen bestehen
(`dist/workflow-rc160-private-recovery-artifact-final.log`). Drei weitere rote
Consumergegenfälle sind in `private-recovery-consumers-red.log` dokumentiert
und korrigiert. Auch der Raw-Reader bindet die Elternkette vor einer
Fehlendentscheidung und berücksichtigt auch dort bekannte Publikation und
private Commitmarker. Raw-Fehler und Raw-Preflight-Abschluss erzeugen keine
Anonymisierungs-Mappingzeile; der echte Legacy-Raw-Lifecycle bestätigt dies
ohne ursprüngliche Quelldateien zu verändern. Zwei weitere rohe Gegenfälle
sind zuerst rot in `private-recovery-raw-stops-red.log` belegt.
115 frische Windows-Rusttests und warning-free Clippy bestehen
(`private-recovery-rust.log`, `private-recovery-clippy.log`); drei ignorierte
Helper sind keine ausgelassenen Abnahmefälle. Diese Tests verwenden synthetische Quelleingänge und
echte private Publikation; sie ersetzen keinen durchgängigen Konverter-/GUI-Lauf.
Die vorangegangene Gesamtregression stoppte an einer veralteten exakten
Paket-Dateiliste (`private-publication-product-headless.log`); das aktualisierte
strikte Modulabschlussgate besteht. Die nachfolgende vollständige Regression
bestand mit 227 Headlessdateien, Exit 0
(`dist/workflow-rc160-private-recovery-product-headless.log`), ohne native GUI.
143 zusätzliche Consumer-/Legacygruppen bestehen
(`dist/workflow-rc160-private-recovery-consumers-final.log`), darunter der echte
Legacy-Raw-Lifecycle; die 41 Dokumentgruppen und der reine Core bestehen separat.
Unabhängige Nachreviews bestätigen null Coercions/Proxyzugriffe/Public-Capabilities
in neun Delivery-Gegenproben, sechs Markergegenfälle und die Raw-Zwecktrennung.
Docs, strenge installierte CLI-Struktur und Diffprüfung sind grün. Frischer
Build stoppt weiterhin vor Paketerzeugung am sauberen Quellcommit-Gate
`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`; das aktuelle RC160-Cowork-ZIP fehlt
(`private-recovery-build.log`, `private-recovery-plugin-zip.log`).
Tatsächlicher Anonymisierungs-Orchestrator, Mapping-Outbox/Replay, gewöhnlicher Ergebnisexport,
Bereichsreview, Office-/MD-Bild-OCR und Starttransport bleiben offen; neue Optionen
bleiben am App-Start `NOT_READY`. Der vorstehende 226-Dateien-Lauf belegt den Stand
vor diesen Publikations-/Recoveryänderungen; der 227-Dateien-Lauf belegt den
anschließenden Reader-/Recoverystand, noch nicht den folgenden Operationsanschluss.

Der neue gespeicherte Lauf `/7` wird im Plaintext-Migrationsadapter jetzt als
aktueller, zweckgebundener Zustand unverändert akzeptiert. Die zuvor falsche
Altverschlüsselungsmeldung ist über den echten Batch-Einstieg zuerst rot
belegt und korrigiert (`dist/workflow-rc160-content-operation-red.log`). Fünf
geschlossene Inhaltsvertragscodes bleiben als konkrete terminale Gründe
erhalten; unbekannte Codes werden weiterhin normalisiert.
Ein produktiver Operationsadapter liest Journal, unabhängigen Runanker und
versiegelte Bytes selbst. Einmalige prozesslokale Tickets binden Item, Zweck,
Profil, Optionen, eigene Sperrepoche und unabhängigen Quellbuffer. Initiale
Verarbeitung, Reviewcapture und Reviewpublikation verwenden getrennte interne
Anschlüsse; fremde Tickets werden vor Hookzugriff verworfen. Neun Gruppen
bestehen, einschließlich tatsächlicher gespeicherter Batch-/Review-Einstiege
(`dist/workflow-rc160-content-operation-authority.log`). Neue Veröffentlichung
verweigert weiterhin `CONTENT_OPTIONS_NOT_READY`, bis `/4`-Verarbeitung und der
vorbereitete Wiederveröffentlichungsstand vollständig angeschlossen sind.
Eigene Sperrepochen stammen vom exklusiv erzeugten FD. Austausch, Hardlink,
Release/Neuerwerb und ein verspätetes altes `finally` dürfen keine fremde oder
neuere Sperre freigeben. 14 Gruppen bestehen (`content-lock.log`); zwei
unabhängige Gegenfälle wurden rot belegt (`content-lock-review-red.log`) und
korrigiert. Dieser Operationsschnitt bestand mit 228 Headlessdateien, Exit 0
(`dist/workflow-rc160-content-operation-product-headless.log`), ohne native GUI.

Der nachfolgende gemeinsame Textkern `privacy-text-operation.js` versorgt
Legacy und den neuen gespeicherten Captureadapter mit derselben Engine,
Personen-/Firmenentscheidung, Transformspur und finalen Restprüfung. Capture
endet ausdrücklich mit OCR-Kontakteingang oder Privacyentwurf; es erreicht
keine Auflösung, Basis, Stage, Publikation oder Audit. Die eigene Quellkopie
wird auch bei Fehler/Abbruch genullt. Kontaktkorrektur bindet dieselben Optionen;
nur die Kontaktwarnung entfällt, andere Coveragegründe bleiben erhalten.
Drei direkte Kerngruppen und 173 gezielte Privacy-/Review-/Legacygruppen
bestehen. Der echte Windows-Konverter hat alle zehn Quelltypen in beiden
Ausgabeprofilen bis zum Capture geführt: 20 Kombinationen, Originale unverändert,
keine Basis oder Publikation (`shared-privacy-native.log`). Vollständiger neuer
Gesamteingang bleibt ein gesonderter Nachweis. Nutzeroptionen und neue
Paketfreigaben bleiben aus.

Der unabhängige Textkernreview bestätigt 90 Differentialfälle mit identischen
Legacy-Texten, Mehrdeutigkeiten, Transform-Replays und Keep-Koordinaten.
Zwei nachfolgende Signalgegenfälle wurden rot reproduziert: eigener
`aborted`-Getter vor Capture sowie aus Node-Deskriptoren kopierte Signalinstanz.
Neue Reviewdienste werden vor Spread/Kontaktphase geprüft. Nur die intern
erzeugten ursprünglichen Signalidentitäten gehören zur prozesslokalen
Herkunftsbindung; keine Register-/Adoptfunktion für Aufruferobjekte.
Gemeinsame intrinsische Abfragen verhindern eine eigene `aborted:false`-
Property als Abbruchumgehung. Legacy behält bisherige Truthiness. 15 echte
Saved-run-/Operationsgruppen bestehen (`capture-signal-final.log`), einschließlich
Null/Proxy/Fake, Getterfreiheit, Optionsaliasignorierung und freigegebener Sperre.
Sechs unabhängige Nachproben bestätigen den korrigierten Signal-Schnitt.
Kein externer Betriebssystemblock oder Datenaustritt ist damit nachgewiesen.

Der vollständige gemeinsame Textkern-/Signalstand bestand anschließend mit
229 Headlessdateien, Exit 0 (`shared-privacy-product-headless.log`). Die native
Windows-Konvertersuite bestand mit 65 Gruppen ohne Skip
(`shared-privacy-native-owned-final.log`), einschließlich der 20 neuen
Capturekombinationen; sechs native Formularfälle bleiben `NOT_RUN`.

Der nächste private Wiederveröffentlichungsbaustein ist implementiert:
`prepared-registry-commit.js` bindet einen rohwertfreien Registry-Snapshot per
HMAC an tatsächlichen Seed, Run, Dokument, Quelle, Policy und Manifesthash.
Er entsteht erst nach dauerhafter Journalschreibung und echtem Readback unter
derselben Sperrepoche. Neue unabhängige Identitäten sind kompatibel; alte
Alias-/Label-/Startbindungen dürfen weder fehlen noch umbelegt werden.
Der neue Scope-Abschluss prüft das frische Journal und darf keinen verweigerten
oder neueren Registrystand durch ein altes `finally` überschreiben.
`prepared-publication.js` und der Dokumentstore speichern einen unabhängigen
create-only Owner auf Runebene, dann exaktes Manifest/Audit außerhalb des
Zwei-Dateien-Artefakts und anschließend die unveränderliche Basis. Verlust des
Owners oder belegter Bestandteile ist ein Konflikt, keine Erstverarbeitung.
Vorhandene falsy/defekte Owner werden bereits beim Lesen abgewiesen.
Replay rekonstruiert denselben Text und dieselben Manifestbytes über die
bestehende Trace-/Keep-/Frameprüfung mit frischem Residual-Proof; keine neue
Extraktion, OCR, Profilerkennung oder Entscheidung. 31 Operationsgruppen
bestehen (`prepared-operation-final-reviewed.log`), darunter echte Journal-/
Run-/Quell-/Epochproben, frische Node-Prozesse, partialer Speicherverlust und
tatsächlicher `/4`-Rename mit Lost-ACK und derselben Auditoperation. Zwei
unabhängige Reviews führten zu Hash-/Snapshot-/Finally-/Ownerkorrekturen.
Diese Persistenzprimitiven sind noch nicht an den neuen produktiven
Publikationsadapter angeschlossen. Neue Optionen, Mapping/Export und App-Start
bleiben `NOT_READY`; Gesamtregression und native Paket-/Bedienabnahme dieses
nachfolgenden Schnitts stehen noch aus.

Neuer unveröffentlichter Workflow-Schnitt: gemeinsame reine Ablaufprojektion,
gezählte ausdrückliche Gruppenübergabe, eindeutige Primäraktion und feste
Fehler-Handlungshinweise. Unabhängige rote Gegenproben für Teilergebnisaktionen,
Parent-Review-Warten und falschen Gesamtabschluss aus Dokumentteilmengen sind
behoben. Workspace 61, Review 40, Dokumentrenderer 45 und Projektion 22 bestehen;
die echte Parent-/Dokumentrenderer-Integration wurde zusätzlich für beide Zwecke
mit pausiertem Teillauf geprüft. DOM-/IPC-Harness, kein neuer nativer Paketbeleg.

Lesbare PDF-/OCR-Absätze, kurze Extraktionshinweise, remappte Kontakte und
weiterhin explizite Nachkorrektur implementiert. Reiner Markdown-Weg ohne
Maskierungsaktion; neue Korrekturkopien behalten Originalbasisnamen, während
KI-Exporte neutral bleiben. Autoritative Vorschau und unveränderlicher
Dateinamenplan über Node und Rust; alte Exportpläne bleiben kompatibel.
Private Dateifehler behalten feste Ursache und gezielte Namen. Drei unabhängige
technische Gegenprüfungen fanden und begleiteten weitere Literal-, Speicher-,
Zustands- und IPC-Randfälle. Tabellenfilter-Testorakel erneuert; keine Rückkehr
zur unerwünschten Einzelbearbeitung. Tatsächliche v2-Seiten headless mit
gemeinsamen Fonts, Fokus, Dialogen, axe und 390–1280px-Reflow geprüft.

Lokaler Windows-RC160-Kandidat r4 ist kompiliert und als ZIP mit vollständigem
Inventar, Lizenzen und Prüfsumme verifiziert. Die exakten Paket-Sidecartests
bestehen für Konvertierung, Anonymisierung, OCR-Korrektur beider Zwecke,
laufweite Sammelentscheidungen, Vertagen/Neustart und konkreten Dateifehler.
34 Literal-/Markdown-Fälle, 159 PII- und 31 IBAN-Grenzfälle bestehen; 109 Rusttests
und Clippy sowie die echte Node/Rust-Exportkette sind grün. Die frische Messung
aller 72 Qualitätsvarianten ist quellgebunden `pass_with_warnings`: nach
synthetischen referenzgebundenen Prüfentscheidungen keine bekannten Restdaten
oder Sachwortverluste, neun rohe OCR-Kontaktabweichungen bleiben. Keine
universelle Qualitätsaussage. Alle 219 kanonischen Headless-Testdateien wurden
in zwei Etappen abgedeckt: 161 Dateien im Deliverylauf, dann nach Aktualisierung
eines veralteten raw Dateinamenorakels der Pausentest plus die 57 übrigen Dateien.
Der Fortsetzungslauf bestätigt unveränderte Produktquellen. Das ist keine
erfundene grüne monolithische Ausführung; deren ursprünglicher Fehlstatus bleibt
erhalten. Sechs native Windows-Formfälle und die bediente Tauri-GUI sind NOT_RUN.
Keine neue Veröffentlichung oder Main-Änderung. Die zunächst
genehmigte Engineering-Mac-Kampagne ist nach neuer Anwenderpriorität zurückgestellt;
zuerst lokaler Windows-Test in beiden Zwecken. Menschliche Bedien-/Native-
Mac-Abnahme und neun rohe OCR-Abweichungen bleiben getrennte offene Arbeit.
Der Cowork-Paketneubau ist nicht Bestandteil dieser lokalen Übergabe: sein
sauberer Quellcommit-Gate verweigert den bewusst uncommitteten Engineeringstand;
keine Provenance-Umgehung und kein Test alter ZIPs als vermeintlich neues Paket.

## Aktuell veröffentlicht: Standalone RC159 (DS-110 / BL-010.53)

[RC159](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)
bindet Quellcommit `7af2a9d0268864a01b954e0175cae9f5a3616fe8`. Windows x64,
Mac Intel/Apple Silicon und Linux x64 glibc sind gebaut und nativ geprüft;
CI sowie vollständige JavaScript-/Native-CodeQL-/Gitleaks-Kampagne bestehen
am selben Commit. Vier ZIPs, zwei Mac-DMGs und sechs Prüfsummendateien sind
veröffentlicht und nach Upload nochmals exakt abgeglichen.
[Umfang, Runner, Hashes und offene Abnahmen](../RELEASE.md#rc159--standalone-auf-allen-zielplattformen).

Workspace-v2 ist der reguläre Einstieg aller vier Pakete. Nach bestätigtem
Fundstellenabschluss folgt die Dokumentprüfung desselben Laufs, nicht bloß
eine Status-Momentaufnahme. Dokumentfreigabe und normaler separater KI-Export
bleiben ausdrücklich getrennt. Die tatsächlich beigelegten Anleitungen sind
aktualisiert und bytegebunden. Cowork bleibt separat veröffentlicht RC151.

Die Prerelease-Bereitstellung ist erledigt, keine allgemeine Produktfreigabe:
native Starts belegen Laden/erfolgreiche IPC, paketierte Windows-/Mac-Sidecars
zusätzlich tatsächliche Review-/OCR-/Recoveryabläufe, aber keine vollständige
bediente GUI-Kette. Menschliche Zielhost-/A11y-Abnahme und die neun bekannten
rohen OCR-E-Mail-Abweichungen bleiben offen. Beim RC159-Release war lokale
Desktopbedienung nicht autorisiert und wurde nicht durchgeführt; die spätere
Freigabe vom 13.10.2026 ist oben getrennt vermerkt. Die unten datierten Nachweise
behalten ihren damaligen Scope; frühere Veröffentlichungssperren sind Historie.

## Prototyp v2: Entwicklungs- und Evidenzchronologie

**Beigelegte Anleitungen, 11.10.2026:** Der unabhängige letzte Paketreview
bestätigte alte Bedien-/Freigabeangaben in den drei tatsächlich mitgelieferten
Startanleitungen. Sie beschreiben jetzt Workspace-v2, vorgemerkte Sammelaktionen,
Fundstellenabschluss, ausdrückliche Dokumentfreigabe und getrennten KI-Export.
Eine Dokumentregression prüft alle drei Anleitungen. Die technischen Gates
von `6e64e53` sowie Security von `2ed119e` bleiben auf ihre Schnitte begrenzt;
neue Paketbindung vor Veröffentlichung erforderlich.

**Prerelease-Vorbereitung, 11.10.2026:** Auf ausdrücklichen Anwenderauftrag wird
RC159 für vier Zielplattformen zum Testen vorbereitet. Der gemeinsame native
Einstieg ist jetzt `workspace.html` (1280 × 900, weiterhin verkleinerbar), ohne
Engineering-Override. Neue Paket-/Workflow-Nachweise werden erst nach tatsächlich
bestandenen Läufen eingetragen. Vorhandene Nachweise unten bleiben an ihren
damaligen Quellstand gebunden; keine allgemeine Bedien-/Qualitätsfreigabe.
Vorhandene GitHub-Buildworkflows sind für diesen Lauf ausdrücklich autorisiert,
lokale Desktopbedienung weiterhin nicht.

**Native Nachbesserung, 11.10.2026:** Der Stand `e88048e` ist auf `main`,
Sicherheitsworkflow bestanden, aber kein veröffentlichtes Prerelease.
Mac-ACL-Abwesenheit wird nun durch erfolgreichen held-FD-`filesec`-Snapshot
bewiesen; tatsächliche ACL-Einträge/Abfragefehler bleiben gesperrt. Unix-Locks
besitzen einen nicht klonbaren Guard mit ausdrücklichem Unlock, einschließlich
Duplikat-/Neuerwerb-Gegenprobe. Source-only OCR-Assertionen laden kein natives
Canvas, während echte Bilder dessen tatsächliche Installation verlangen.
Unabhängige begrenzte Reviews, 22 Smoke-Integritätsfälle, 47 reale Windows-
Konvertergruppen und tatsächliche Windows-Node/Rust-Exporte bestehen.
Neue native Paketgates bleiben vor Veröffentlichung erforderlich.
Die Windows-Runner-v2-Start-/IPC-Gegenprobe ist bestanden; nachfolgender Cleanup
wartet jetzt vor Inventarisierung auf exakt profilgebundene WebView-Ruhe.
Intel-Mac-Kaltkompilierung ist vom unveränderten nativen IPC-Budget getrennt.
23 Integritätsfälle und 45 reine Readiness-/Profilparsergruppen bestanden;
keine lokale App gestartet und keine Löschfehler unterdrückt.

Vierte Runnergegenprobe `d02f31a`: Security bestanden (`38166846003`),
Linux stoppte an einer echten Vorschau-Löschfreigabelücke: Nach FD-Close
konnten wiederverwendete Objektkennungen einen Ersatz als neuen Löschplan
adoptieren. Der ursprüngliche vollständige BigInt-Snapshot einschließlich
Größe, Linkzahl, mtime/ctime wird jetzt nach Close, vor Planannahme und vor
Unlink geprüft. 26 Retention- und neun Löschgrenzfälle bestehen unter Windows
und WSL-Ubuntu mit verifiziertem Node 22.23.2; keine vollständige portable
Pathname-Race-Freiheit behauptet. Mac-Rust benötigte eine ausdrückliche
`*mut c_void`-Typangabe am ACL-Ausgabezeiger. Neue native Paketgates bleiben
erforderlich; kein Prerelease aus dem fehlgeschlagenen Schnitt.

**Aktueller lokaler Teststand RC159, 08.10.2026 – Übergang nach Fundstellen:**
Der gemeldete r10-Lauf hatte seine OCR-/Entitätsentscheidungen gespeichert,
aber noch keine nachträglichen Dokumentfreigaben. Der Hauptbutton lud nur eine
Status-Momentaufnahme. RC159 öffnet nach nativ bestätigtem Fundstellenabschluss
direkt die Ergebnisprüfung desselben Laufs; der Verlaufs-Hauptbutton öffnet
ebenfalls direkt die tatsächliche Dokumentliste. Metadaten bleiben sekundär.
Die Oberfläche unterscheidet Fundstellenabschluss, Dokumentfreigabe und Export;
keine automatische Auswahl, Freigabe oder Kopie. Native Sitzungsgeneration,
Antwortbesitz und eingefrorener Schließzustand schützen gegen verspätete
Status-/Schließantworten. Die unabhängige Read-only-Gegenprüfung fand eine
späte Statusantwort nach manuellem Verlassen; Korrektur und Regression ergänzt.
50 Workspacefälle bestehen, darunter die echte Dokumentrenderer-Integration
mit 72 noch nicht freigegebenen Dokumenten, Folgegeneration, Reconnect,
manuelles Vertagen und fehlgeschlagener Abschluss. 108 Windows-Rustfälle und
Clippy ohne Warnungen bestehen; drei Subprozess-Helfer sind nicht selbständige
Standardtests. Neue Offline-/Locked-Windows-Kompilierung und Paketverifier grün.
Lokales Paket: `dist/engineering-workspace-v2-windows-rc159-20261008/`.
Archiv-SHA-256: `78cb99f0f97323bc44b1858d9c10ca94106881cd20a359a6a1090eb9a6ca66e0`.
611 Einträge, 111.026.437 Bytes; 190 Serverprojektionen sowie EXE in Archiv,
Stage und frischer Kompilierung bytegleich. Echter isolierter Paket-Sidecar-Smoke
besteht für beide Zwecke, Folgegruppen, Person/Firma, Vertagen/Neustart,
OCR-Originalpixel/Korrektur und Fehlerdateinamen. Das ist kein Tauri-/WebView-
Interaktionsnachweis. Sichtbare Windows-Abnahme beim Anwender; Desktopfreigabe
weiterhin entzogen, Mac-Abnahme offen. Kein Commit/Push/Actions/Release.

**RC159-Gesamtgegenprobe ohne Desktop abgeschlossen:**
`tmp/rc159-headless-20261008.log`: alle 218 Nicht-GUI-Testdateien bestehen
(97 Basis plus 121 direkte), einschließlich tatsächlicher Node-/Rust-
10.001-Kontakt-Exporte, Pause, Wiederherstellung und Prozessgrenzen.
996-Dateien-Scope zu Testbeginn:
`be12a924fe0d5bb251c53f001b7b0be9da32148311721191ead8f7179ea009f5`.
Währenddessen nur die Standalone-README auf RC159-Testhinweise aktualisiert;
die übrigen 995 Dateien dieses Scopes sind unverändert:
`52d3541af48dde634ca885874f3b1425d2a8a7dcd0d9ebba6e9dc146c23a9109`.
Dokumentations-/installierte strenge Pluginstruktur-/Diffgates bestehen separat.
Windows-Vollprofil verweigert mangels Desktopfreigabe mit Exit 77 vor Teststart;
sechs Formularfälle und native Tauri-/Mac-Bedienabnahme bleiben `NOT_RUN`.
Allgemeiner Release-/Cowork-Bau bleibt `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`,
aktuelles Cowork-ZIP fehlt. Dies ist lokale Engineering-Testbereitschaft, kein
Gesamtprodukt-/Release-PASS. Paketnachweis neben dem ZIP: `PRUEFNACHWEIS.json`.

**RC159-Qualitätsmessung erneuert, nicht rückwirkend freigegeben:**
`dist/quality-rc159-transition-20261008/BERICHTE/QUALITAET.json` bindet Version,
Laufzeit, Konverter, Auswerter und Referenz neu. 72 Varianten in beiden Wegen
technisch umgewandelt; 55 Referenz-Kontaktbestätigungen, neun Korrekturen und
202 Entitäts-Vorkommensentscheidungen, keine ungebundene Entscheidung.
Finale und rohe Lesart gegen dieselben Enddateien: jeweils 310 bewertete
sensible Vorkommen, null bekannte Reste/unbewertete Stellen oder Sachwortverlust.
Neun rohe OCR-E-Mail-Leseabweichungen unverändert: Standardprofil
`pass_with_warnings`, strenges Profil `QUALITY_EXTRACTION_WARNINGS_OPEN`.
Workerbereinigung bestätigt. Kein unabhängiger menschlicher Referenz-/nativer
GUI-/exakter Releasepaketnachweis; frühere RC158-Berichte sind historische Evidence.

**Qualitätspriorisierung vom 08.10.2026:** Auf Anwenderwunsch werden rohe
OCR-Lesegenauigkeit, finale Privacy und Sachinhaltserhalt getrennt bewertet.
Nur vollständig bewertete rohe E-Mail-Leseabweichungen mit tatsächlich
erfasstem und korrigiertem Privacy-Eingang können im Engineering-Gate Warnungen
sein; sie werden nicht als behobene OCR-Fehler ausgegeben. Enddateien werden
gegen die korrigierte und die ursprüngliche OCR-Lesart geprüft (`final` /
`raw_final`), auch bei kopierten stark abweichenden Rohadressen. Telefonfehler
sind nicht Teil der Warnungsausnahme. Strenges Extraktions-
profil bleibt separat. Restdaten, fehlende Inhalte, unbewertete/gestoppte
Ausgaben, partielle/veraltete Nachweise und unbestätigte Bereinigung bleiben
Sperrgründe. Laufzeitprüfpflicht unverändert, keine Release-/Mac-Freigabe.
Neun Roh-OCR-E-Mail-Abweichungen bleiben BL-050.6; stabile native Workflow- und
Paketabnahme hat Vorrang. Methodik: [Qualitätsmessung](../DETECTOR_BENCHMARK.md).

**Früherer RC158-Nachweis dieser Trennung:**
`dist/quality-headless-boundary-20261008/BERICHTE/QUALITAET.json` bindet den
damaligen Laufzeit-/Konverter-/Auswerterstand und die Referenz. 72/72 Varianten
konvertiert und publiziert; 55 gebundene synthetische Kontaktbestätigungen,
neun explizite Referenzkorrekturen und 202 Entitäts-Vorkommensentscheidungen.
Finale Gegenprüfung beider Lesarten: jeweils 310 bewertete sensible Vorkommen,
null bekannte Reste/unbewertete Stellen und kein gemessener Sachwortverlust.
Neun rohe OCR-E-Mail-Leseabweichungen bleiben sichtbar: geprüftes Engineering-
profil `pass_with_warnings`, strenges Extraktionsprofil
`QUALITY_EXTRACTION_WARNINGS_OPEN`. Vorheriger Messentwurf ist überholt und
wird vom Herkunftsgate abgewiesen; nicht rückwirkend grün. Die unabhängige
Gegenprobe fand eine durch Referenzkorrektur verdeckte Rohadress-Lesart;
zusätzlicher `raw_final`-Check schließt diese Messlücke. 39 Bewerter-/Bericht-
fälle und `test:quality` bestehen. Keine Produkt-Laufzeitregel abgeschwächt;
kein Commit/Push/Release, kein Desktop-/Mac-/exakter Paketnachweis.

**Historische Grenze des Gesamtprüflaufs zur Messpolicy:** `test:product` wurde wegen der
entzogenen Desktopfreigabe bewusst abgebrochen, nicht als PASS gewertet.
`tests/test-residual-person-review.js` enthielt eine automatisch bediente echte
Windows-Formularprobe mit `ShowDialog()`; `windowsHide` ist keine Garantie für
unsichtbare Formularfenster. Weitere solche Proben standen in
`tests/test-companion-processor.js` und wurden in diesem Lauf nicht erreicht.
Gezielte Qualitätsprüfung und 72-Varianten-Messung sind davon getrennt.
Protokoll: `tmp/quality-classified-product-final-20261008-1620.log`.
993 ausführungs-/testbestimmende Quelldateien waren vor/nach dem Lauf identisch
(`d559c1f1a5d5c26e6aad1fb48a202a1a2a9d70e5744232db93221dcc541fef15`).
Die nachfolgenden früheren 217-Dateien-PASS-Nachweise gelten nicht automatisch
für die spätere Messpolicy.

**Testabgrenzung anschließend implementiert, BL-010.53.8:** Read-only-
Gegenprüfung identifizierte insgesamt sechs tatsächliche Windows-GUI-Fälle,
einschließlich der zuvor übersehenen Abschlussansicht. Alle sechs sind mit
ihren bisherigen Assertions nach `tests/test-native-windows-forms.js` verlegt,
mit einheitlich 20 Sekunden Prozessfrist. `test:product:headless` führt alle
Nicht-GUI-Dateien des Vollprofils aus; CI/Standalone bleiben ohne diese Dialoge.
`test:product` auf Windows und beide Native-UI-Eingänge verweigern ohne
`--allow-native-ui` vor jedem Test-/Prozessstart den Lauf (Exit 77). Getrennte
Statusmeldung `NOT_RUN` statt stiller Skip oder Gesamtgrün; auf Nicht-Windows
sind diese Windows-Fälle `NOT_APPLICABLE`. 11 neue Guard-/Plan-/CLI-Gegenfälle
und 12 bestehende Testpfadverträge bestehen. Anschließend besteht der vollständig
neu gestartete Headless-Integrationslauf mit 218 Testdateien (97 Basis plus 121
direkte), einschließlich echter Node-/Rust-Exporte mit 10.001 Kontakten und
Windows-Prozessgrenzen. Protokoll: `tmp/native-ui-separated-headless-20261008.log`.
996 vorhandene getrackte/nicht ignorierte ungetrackte Dateien unter
`plugins/`, `apps/`, `scripts/`, `tests/`, `benchmarks/` sowie `package*.json`
waren vor/nach dem Lauf identisch
(`b1a154019941ddcd71597f603a3c97200c46b55afbdd57f6cfe84f574f11ed45`).
Dies ist der damalige vollständige Nicht-GUI-Nachweis, kein Voll-/Release-PASS.
Sechs Formularfälle bleiben `NOT_RUN`; native Tauri-/Mac-/Paketabnahme bleibt
offen. Desktopfreigabe weiterhin entzogen, keine Oberfläche bedient.

Der reguläre Windows-Vollaufruf und beide Native-UI-Aliase verweigern tatsächlich
mit Exit 77 vor Teststart. Dokumentationsgates, strenge installierte Claude-
Pluginprüfung und `git diff --check` bestehen. Normaler Gesamt-/Cowork-Paketbau
bleibt an `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` gesperrt; aktuelles Cowork-ZIP
fehlt weiterhin. Kein Commit, Push, Actions-Start oder Release.

Die Änderung der Testbefehle in `package.json` macht den vorherigen Bericht
`quality-classified-final-20261008` korrekt `QUALITY_REPORT_STALE`. Deshalb wurde
die vollständige 72-Varianten-Messung erneut ausgeführt, nicht das Herkunftsgate
gelockert. Neuer Bericht siehe oben; Workerbereinigung bestätigt, identische
55 Kontaktbestätigungen/neun Korrekturen/202 Entitätsentscheidungen, finales
Ergebnis beider Lesarten ohne bekannte Referenzreste oder Sachverlust.
Standardgate grün mit neun Warnungen; strenges und altes Herkunftsgate rot.
Keine menschliche, native GUI-/Mac- oder exakte Paketabnahme.

**Lokale Windows-Testversion r10 bereitgestellt, 08.10.2026:** Auf Anwenderwunsch
liegt der korrigierte Stand unter
`dist/engineering-workspace-v2-windows-20261008-r10/`. Neue Offline-/Locked-
Releasekompilierung aktiviert nur in diesem Engineeringbau `workspace.html`
mit Fenstertitel „lokaler Test r10“; Produktversion bleibt 3.2.0-rc158.
Archiv-SHA-256: `1bf1ca259f1edb0a1bb45b27500bc8c8b88ffabcb79908c10d1683b3cba659c7`.
Verifier und echter isolierter Paket-Sidecar-Smoke bestehen: beide Zwecke,
passive PDF/PPTX/eingebettete XLSX, Firmen-/Personenentscheidungen, Folgegruppen,
Vertagen/Neustart, OCR-Originalpixel/Korrekturen und genaue Fehlerdateinamen.
Alle 190 projizierten Serverdateien sind bytegleich zum damaligen Quellstand;
Paket-EXE und Stage sind bytegleich zur frischen Kompilierung. Der oben genannte
996-Dateien-Digest ist auch vor/nach diesem Bau unverändert und bindet den
218-Dateien-Headless-PASS. Zusätzlich frisch: Workspace 42, Dokumentrenderer 42,
Stapelrenderer 39 und Native-UI-Guard 11 Fälle grün. `TESTHINWEISE.txt`,
`BUILD-CONFIG.json` und `PRUEFNACHWEIS.json` liegen neben dem ZIP.
Kein r10-App-/WebView-Start, kein nativer GUI-/Mac-/vollständiger Release-
Paketworkflow-Nachweis. Die sichtbare Windows-Bedienabnahme übernimmt der
Anwender. Neun rohe OCR-Warnungen und die übrigen Backlogpunkte bleiben offen;
die Qualitätsmessung bindet Quellen/Konverter, nicht dieses exakte Archiv.
Ältere Pakete erhalten; kein Commit, Push, Actions oder Release.

**Spätere umfassende Gegenprüfung r9, 08.10.2026:**
[Review R9-20261008](../REVIEW_STANDALONE_R9_2026-10-08.md) dokumentiert drei
vom Hauptreview reproduzierte P2-Fehler: alter sichtbarer Dokumentvergleich bei
Freigabe einer frisch geladenen Revision, ignorierte akzeptierte Pause im
Review-Publikationspfad und ein erst beim Export auftretendes 10.001-Kontaktlimit
der vertraulichen Übersicht. Zwei native Kontrollgrenzen sind statisch belegt:
v2-Publikations-I/O kann die Antwortfrist umgehen; Sidecar-Retirement hängt nach
Kanalfehlern von einem weiteren RPC ab. Keine reale OS-I/O-Blockade und kein
neuer P1-Freigabebypass nachgewiesen. Dieser erste Reviewstand ist inzwischen
überholt durch den Korrektur-/Gegenprüfungsnachtrag desselben Berichts:
Dokumentbindung, Pauseclaims/Entscheidungserhalt, große Kontaktübersicht,
asynchrone native Publikation und unmittelbare besitzgebundene Bereinigung
sind lokal implementiert und gezielt geprüft. 108 Windows-Rusttests, Clippy,
42 Dokumentrendererfälle, 42 Workspacefälle und der echte 10.001-Kontakt-
Freigabe-/Node-/Rustexport samt Übersichtswiederlesen bestehen. Ein bei der
Gegenprüfung entdecktes Wiederverbindungsbudget-Rennen und mutable Ausgabe-
Bindung von Ausstellerentscheidungen wurden ebenfalls korrigiert. Die danach
vollständig neu gestartete Produktsuite besteht mit 217 Testdateien (96 Basis
plus 121 direkte); der korrigierte Quellscopedigest ist vor/nach dem Lauf
identisch. Windows-Releasekompilierung, Dokumentationsgates und strenge
installierte Claude-Pluginstrukturprüfung bestehen ebenfalls. Normaler
Gesamt-/Cowork-Paketbau bleibt separat an der Herkunftsprüfung des schmutzigen
Arbeitsstands gesperrt; das aktuelle Cowork-Archiv fehlt.
Keine Desktopbedienung oder native Mac-/exakte Paketabnahme daraus ableiten;
die alte r9-Paketbytebindung belegt nicht die neuen Korrekturen.
BL-010.53 bleibt in Arbeit, keine allgemeine v2-Freigabe.

Frische Windows-Qualitätsmessung unter `dist/quality-r9-review-20261008/`:
72 Varianten technisch ohne Konvertierungsabbruch, neun rohe OCR-E-Mail-
Abweichungen. Nach gebundenen synthetischen Prüfentscheidungen null bekannte
Lecks und kein gemessener Sachwortverlust; keine menschliche Referenzabnahme
oder Messung am exakten Releasearchiv. Das damals frische All-findings-Gate
meldete ausschließlich `QUALITY_FINDINGS_OPEN`; dieser Bericht ist nach den
nachfolgenden Quellkorrekturen und der neuen Messpolicy nicht mehr aktuell.
Der r9-Verifier,
Bytevergleich aller 190 projizierten Serverdateien und nativen EXE, 106 Windows-
Rusttests und warning-free Clippy bestehen. Auch die neu gestartete vollständige
Produktsuite besteht am vor/nach dem Lauf unveränderten r9-Quellscopedigest:
217 Testdateien (96 Basis plus 121 direkte), einschließlich letztem Undo-Delta.
Dokumentationsgates und installierte Claude-CLI-Strukturvalidierung bestehen.
Normaler Produktbuild bleibt wegen
ungebundenem schmutzigem Arbeitsstand rot (`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`);
das aktuelle Cowork-Produktarchiv fehlt, getrennt vom vorhandenen r9-Standalone-
Testarchiv. Kein neuer Desktopzugriff, GUI-Start, Commit, Push, Release oder
Actions-Start; neue native Mac-/sichtbare Bediennachweise bleiben offen.

**Archivierter Windows-Teststand, 08.10.2026 (r9):**
`dist/engineering-workspace-v2-windows-20261008-r9/` belegt den früheren
Reviewstand. Das Archiv enthält die oben beschriebenen neuen Korrekturen
nicht und ist kein Abnahmenachweis dafür. Für neue Tests gilt der oben
gebundene korrigierte r10-Stand.
Archiv-SHA-256: `f7de84085dd12e6862efcd599dfa0088141ec2747046c08dedfcf367747955c1`.
Der abschließende unabhängige Konsistenzreview fand noch einen Undo-Fehler:
Beim Rückgängigmachen einer Zurücksetzung wurden wiederhergestellte Entscheidungen
durch „Noch offen“ unsichtbar. Undo wählt jetzt abhängig von den betroffenen
restaurierten Zeilen „Vorgemerkt“, „Noch offen“ oder bei Mischung „Alle“;
Vergleich/Seite und Statushinweis passen dazu, keine versteckte Auswahl oder
automatische Übergabe. Zwei neue Regressionen waren davor rot, danach bestehen
39 Prüfer- und 41 Workspace-Fälle. Der unabhängige Nachreview bestätigt genau
diesen begrenzten Schnitt. Windows-r9 ist neu kompiliert und verifiziert;
auch die echten Paket-Sidecar-Abläufe bestehen einschließlich OCR-Korrektur
beider Zwecke, Firmen-/Personenentscheidungen, Folgeprüfung und Neustart.
Der vorausgehende Gesamtprodukteingang bestand mit 217 Testdateien
(96 Basis plus 121 direkte), hatte den früheren 37-Fall-Prüfer jedoch vor dem
letzten Undo-Delta ausgeführt. Dieses Delta wurde zunächst separat mit allen
39 Prüfer- und 41 Workspace-Fällen nachgeprüft. Die spätere umfassende
Gegenprüfung oben ergänzt nun den vollständig neu gestarteten eingefrorenen
r9-Gesamtlauf mit allen 217 Testdateien; kein allgemeiner Release-Nachweis.
Keine r9-GUI gestartet oder bedient; Desktop-Freigabe bleibt entzogen.
Die sichtbare Windows-Bedienabnahme übernimmt der Anwender.

**Vorausgehender Korrekturschnitt, 08.10.2026 (r8):** Für neue Tests ersetzt
`dist/engineering-workspace-v2-windows-20261008-r8/` das r7-Paket.
Archiv-SHA-256: `b562c0ddb067bf02ae14f341ad4d6d7ec6079830577c959d6bf60e3cf9102c90`.
Die zwei gemeldeten Nur-Markdown-Starts scheiterten im echten Worker vor der
dauerhaften Laufanlage an `PROCESSING_MODE_INVALID`: Der neue Dokumentprüf-
Schalter wurde irrtümlich nur für Anonymisierung akzeptiert. Er ist jetzt auch
für neue Standalone-Markdown-Läufe erlaubt; Zweck-, Kanal- und Bool-Prüfung
bleiben erhalten. Drei echte projizierte Sidecar-/Worker-Gegenproben bestätigen
dauerhaften Verlauf und Dokumentinhalt für Markdown mit/ohne OCR-Prüfung sowie
Anonymisierung. Auswahl allein startet oder navigiert weiterhin nicht.

Die Sammelprüfung beginnt mit „Noch offen“. Vormerken entfernt behandelte
Zeilen nur aus dieser Ansicht und füllt mit den verbleibenden offenen Zeilen
auf. „Alle gefilterten Zeilen auswählen“ erfasst ausdrücklich auch Folgeseiten,
trifft aber noch keine Entscheidung. Bei vollständig vorgemerkter Gruppe sind
Abschlussaufforderung und ausdrückliche Übergabe sichtbar; unter „Vorgemerkt“
bleiben Kontrolle/Änderung und Rückgängig möglich. Vergleich und Originalpixel
folgen der sichtbaren Zeile, leere Filter zeigen keinen alten Vergleich.
37 Prüfer- und 41 Workspace-Rendererfälle bestehen, einschließlich 50+14,
64-Zeilen-Sammelauswahl, off-page Eingabekonflikt, Filter und Rückgängig.
Erst nach bestätigtem Start wechselt die App zum Verlauf und hebt den verbundenen
aktiven Lauf mit Arbeitsindikator/Dateifortschritt hervor. Native Windows-
Kompilierung, Archiv-Verifier und echte r8-Paket-Sidecar-Abläufe bestehen.

Die r8-GUI-Instanz wurde mit neuem isoliertem Profil geöffnet; nach Entzug der
Desktop-Freigabe wird sie nicht weiter bedient. Kein vollständiger nativer
r8-Bediennachweis und keine Mac-Abnahme daraus ableiten. Der Anwender testet
den neuen Schnitt selbst. Keine Veröffentlichung, Commits, Pushes oder Actions.

**Vorausgehender lokaler Nachweis, 08.10.2026:** Engineering-Paket r7 unter
`dist/engineering-workspace-v2-windows-20261008-r7/` ersetzt r3–r6 für neue
Tests. SHA-256: `bb603fdf95e6487f39131e8a4582976a18cdaa095c8f4b05ab9a168cda91e8ad`.
Die automatische Wiederverbindung ist nun implementiert: zufällige native
Besitzergeneration, sequenzierte Invalidierung alter UI-Antworten, tatsächliches
Ende des alten Sidecars und aller nativen Aufträge vor Besitzerwechsel. Start,
Entscheidungen und Exportbestätigungen werden niemals automatisch wiederholt.
Private Textansichten/Auswahlen werden verworfen und ausdrücklich neu geladen.
106 Windows-Rusttests bestehen; drei weitere Einträge sind Kindhelfer,
keine separat ausgeführten Abnahmen. Clippy ist warnungsfrei.

Die tatsächliche r7-Windows-GUI-Kette wurde mit einem isolierten Profil und
drei synthetischen Quellen beobachtet: native Ordnerwahl, Start, direkte
integrierte Prüfung, drei gruppierte Entscheidungen für sieben Fundstellen
über zwei Dokumente (Unternehmen/Person/Beibehalten), ausdrückliche Übergabe,
sichtbare Warteanzeige, automatischer Rückweg, Original-/Markdown-Vergleich,
Auswahl ohne Freigabe, Sammelfreigabe und getrennter bestätigter KI-Export.
Die absichtlich beschädigte `03-defekt.csv` bleibt mit `PARSE_FAILED` benannt
und blockiert die gesunden Dokumente nicht. Der Export enthält exakt zwei
neutrale Markdown-Dateien, keine Zuordnung oder privaten Begleitdateien;
erwartete Ersatzmarker und unveränderte Quellhashes sind nachgeprüft.
Kontrollierter Ausfall nur des eigenen r7-Sidecars nach Exportabschluss:
automatische Wiederverbindung, ausdrückliche Neuladung mit erhaltenen Freigaben,
genau ein unveränderter Export. Reguläres Schließen beendet App und Sidecar.
Dies ist agentisch beobachtete begrenzte native Engineering-Evidenz,
keine menschliche N3/N4-, vollständige Accessibility- oder Mac-Abnahme.

Dabei wurden zwei echte Fehler geschlossen: Der Dokumentrenderer wies gültige
Verarbeitungsfehler wie `PARSE_FAILED` zurück; nun zeigt er den begrenzten Code
als Text mit Dateiname und sperrt gesunde Dokumente nicht. Der native Export
verglich die Schlüsselreihenfolge einer Identitätsauswahl statt ihrer Werte;
semantisch gleiche über Tauri umgeordnete Felder werden jetzt akzeptiert,
Revision/Hash/Zugehörigkeit bleiben streng geprüft. Der Regressionstest war
vor der Korrektur rot; 39 Dokument-/Export- und sieben echte Node/Pipe/Rust-
Fälle bestehen danach. Ein unabhängiger begrenzter Review bestätigt die
Korrektur. Der erneute Gesamtprodukteingang besteht mit 217 Testdateien
(96 Basis plus 121 direkte). Paket-Verifier und tatsächlicher r7-Paket-Sidecar
bestehen. Einzeldatei-Retry/Auslassen, vollständige Grafik-/Accessibility-
Abnahme, native neue Mac-Pakettests und sauber gebundener Releasebuild bleiben
offen. Keine Standardumschaltung, Veröffentlichung, Commits, Pushes oder Actions.

Dokumentationsprüfung und `git diff --check` sind auch nach dieser Aktualisierung
grün. Ein zusätzlicher isolierter Nur-Markdown-GUI-Versuch wurde vor dem Start
abgebrochen: Das Desktop-Testwerkzeug meldete für den sichtbaren Quellenpicker
ungültige Fenstergeometrie. Daraus wird weder ein bestandener Ablauf noch ein
App-Fehler abgeleitet. Die eigenen identitätsgeprüften Testprozesse sind beendet;
Testprofile und Nachweise bleiben erhalten. Der unabhängige Retry-Review hat
zusätzlich Quellenbereinigung, unveränderliche Fehler-/Basisstände und
abschlussgebundene Evidenz als notwendige Versuchsversionierungsgrenzen
bestätigt; Umsetzung und Negativfälle bleiben in BL-010.53.7 offen.

**Vorausgehende lokale Windows-Testbarkeit, 08.10.2026 (r3):** Engineering-Paket r3 unter
`dist/engineering-workspace-v2-windows-20261008-r3/` aktiviert ausschließlich
für diesen Bau `workspace.html`. Archiv-SHA-256:
`f95c3ff09aa6f18da552e48d12852a5e4e53386340a483df9e15d5e2b14e6cba`.
Verifier und tatsächliche Paket-Sidecar-Abläufe beider Zwecke einschließlich
Folgeprüfungen/OCR/Vertagen/Neustart bestehen. Nativer Windows-Start belegt
geladene Haupt-/Prüfseite und erfolgreiche private IPC, **nicht** den kompletten
v2-GUI-/Exportablauf. Synthetische Browserprüfung bei 720 × 560 bestätigt
erreichbare Sammelaktionen ohne Seitenüberlauf; initialer Fokus wurde korrigiert,
damit der Vergleich nicht die Prüfliste verdeckt. Die Vorschau-Bereitschaft
entspricht nun ihrem simulierten Ergebnisstatus. Keine neue Releaseversion,
keine Standardumschaltung, kein Commit/Push/Actions-Start. Einzeldatei-Retry,
Wiederverbindung, vollständige Grafik-/native GUI-Abnahme und beide neuen
Mac-Paketprüfungen bleiben offen. r2 ist durch r3 ersetzt: Der Gesamtprüflauf
fand anschließend eine fehlende Bindung von `privacy/transform-plan.js` an die
dauerhafte Regelversion. Diese ist ergänzt; 25 Pseudonym-/Versionsfälle und
neun echte Produktprojektions-/Neustartfälle bestehen. Eine unabhängige lesende
Gegenprüfung bestätigt die Korrektur. Frühere unvollständige Engineering-Läufe
mit anderer Regelversion werden absichtlich nicht automatisch migriert.
Der vollständige lokale Produkteingang besteht nach dieser Korrektur mit
217 Testdateien (96 Basis plus 121 direkte Tests). Dokumentationsgates und
`git diff --check` bestehen ebenfalls. Releasebuild stoppt weiter am
uncommitteten gebundenen Quellstand, das neue Pluginarchiv fehlt; keine
allgemeine Freigabe aus dem lokalen Engineering-Bau ableiten.
Weitere Teilschnittnachweise folgen unten.

Der klickbare Anwenderprototyp ist die verbindliche grafische Referenz, nicht
nur eine Farbvorlage. Drei unabhängige lesende Gegenprüfungen zu Verträgen,
Export und Interaktion sind in den [Migrationsabgleich](../frontend-migration.md)
eingeflossen. Neue Hauptoberfläche, lokale Inter-Schrift, Radio-Karten,
hierarchische Häkchenauswahl, laufgebundene Ansicht, Verlauf/Einstellungen und
integrierte Sammelprüfung sind im unveröffentlichten Arbeitsstand implementiert.
Auswahl und Korrektureingabe treffen keine Entscheidung; eine zentrale Aktion
merkt vor, erst die vollständige Gruppenübergabe sendet an den Worker.

Der servergebundene Quellenkatalog kann reguläre ungeeignete Dateien einzeln
mit Endung und festem Grund anzeigen. IDs und Katalogrevision werden beim
Start erneut geprüft; Hinzufügen erhält Ausschlüsse. Dieser tolerante Weg
wird nativ nur für die neue Hauptseite aktiviert. Legacy und Cowork behalten
ihre strikte Aufnahme. Der öffentliche CLI-Status erhält keine Lauf-ID; die
Laufbindung ist ausschließlich Teil des privaten lokalen UI-Kanals.

Der neue Einstieg ist **noch nicht Standard und nicht vollständig nativ
abgenommen**. Ein gesondertes lokales Windows-Engineering-Paket aktiviert ihn
bereits; seine begrenzten Nachweise stehen unten. Persistierte Pause/Fortsetzung sowie nachträgliche Freigaben
hashgebundener Text-Prüfstände und ein getrennter ausgewählter KI-Export sind
jetzt als weiterer unveröffentlichter v2-Schnitt implementiert. Die Pause
serialisiert ihren dauerhaften Intent mit dem Dateiclaim; die aktive Datei
wird einschließlich Zuordnung beendet. Kontrollfehler stoppen keine Quellen.
Eine echte TXT-Gateway-Gegenprobe prüft beide Modi, Neustart/Fortsetzung und
unveränderte erste Ausgabe; nachgelagert auch tatsächliche Freigabe/Exportbytes.
Der Dokumentprüfstand enthält extrahierten Originaltext, final geprüftes
Markdown und einen reversiblen Plan aus tatsächlichen Core-Ersetzungen;
sichtbare importierte Marker werden nicht rückwärts als Entitäten interpretiert.
Person/Firma/Beibehalten/Basisstand sind revisionsgebunden, zusätzliche
Maskierung sperrt überlappende Wiederherstellung. Laufweite Entscheidungen
verwenden exakte vollständige Identitäten; nachweislich gebundene Aliasse folgen,
mehrdeutige Nachnamen und Kontakte nicht. Ein gemeinsamer Commit projiziert alle
betroffenen Dokumente konsistent. Jede Änderung widerruft deren Freigabe.
Reine Markdown-Nachkorrektur ist als begrenzte Bereichsersetzung implementiert;
ihre Kopien bleiben ausdrücklich nicht anonymisiert und außerhalb des KI-Exports.
Sequenzierte Zustandsereignisse, komplette native Windows-/Mac-v2-Paketabnahme
und deren Abschlussreview bleiben offen. Der separate Metadatenkatalog ist auf 1.000 Dateien
und 512 KiB für die gesamte Aufnahmeantwort einschließlich Artefaktdetails und
privatem Antwortumschlag begrenzt. Die 200-Dateien-/500-MiB-Grenze greift
erst nach der Häkchenauswahl, erneut serverseitig vor jedem Start.
Browserprüfungen verwenden klar markierte synthetische
Daten; sie belegen nicht die Verarbeitung genau dieser Beispieldateien.
Neun bekannte rohe OCR-E-Mail-Abweichungen bleiben getrennt im Qualitätsgate.
Die vorherige lokale Produktvollsuite des ersten v2-Teilschnitts bestand mit
206 Testdateien (87 Basis plus 119 direkte Tests). Der vorausgehende Versuch fand einen veralteten History-
Testaufbau ohne reguläre Dateiaufnahme; dieser verwendet nun den echten
Aufnahmeweg. Die anschließende vollständige Wiederholung dieses Teilschnitts bestand.
Der jetzt erweiterte Eingang enthält 217 Testdateien. Der vorherige Versuch
stoppte am unveränderten Git-Tracking-Check. Die neuen v2-Dateien sind inzwischen
explizit zur Versionierung vorgemerkt (Intent-to-add, kein Commit). Der nächste
Gesamtlauf fand die zuvor fehlende Transformationsspur in der Regelversionsbindung;
nach der Korrektur besteht die vollständige Wiederholung mit 96 Basis- und
121 direkten Testdateien. Dieser Quellnachweis ersetzt weder Releasebuild noch
vollständige native v2-Bedienabnahme.
Aktuell bestehen zusätzlich sieben Pausefälle (echte
Gateway-Verarbeitung beider Modi/Neustart), 38 Dokument-/Exportfälle mit realen
lokalen Dateien, 31 Dokumentrendererfälle, 12 vertrauliche Zuordnungsfälle, 12 tatsächliche Transformationsspurfälle,
8 reversible Entitätenfälle, 11 laufweite Entscheidungsfälle, 14 Runner- und
15 Zweckbindungsfälle. Die Browserprobe der
Dokumentansicht bestätigt Auswahl ohne Entscheidung, explizite Sammelfreigabe,
separaten Export und Reflow bei 390/900 Pixeln mit rein synthetischen Daten.
Das UTF-8-Prüfstandbudget entspricht der bestehenden Zeichenobergrenze;
beim Export werden private Textkörper nicht für alle Dokumente gleichzeitig
gesammelt. Der genaue Dateiname und Fehlergrund bleiben auch nach einem
fehlgeschlagenen Freigabeaufruf und anschließender Statusabfrage sichtbar.
Unicode-Paare bleiben auch an Übertragungsblockgrenzen vollständig. Unbestätigte
Exportaufträge werden nach Ansichts-/Prozessneustart mit derselben Auswahl
wiederentdeckt; eine ausdrückliche Empfangsbestätigung wird getrennt gespeichert.
Die Wiederentdeckung kopiert oder bestätigt nichts automatisch. Bereits bestätigte
Abschlussbelege bleiben auch dann sichtbar, wenn die Antwort auf die Bestätigung
verloren ging; sie sind ausdrücklich historische Belege, keine erneute Prüfung
der heutigen Exportdateien. Nur der nächste offene Auftrag plus Gesamtzahl wird
an die Oberfläche übertragen. Reale Neuprozess- und Renderer-Gegenproben decken
verlorene Antworten und späteren Widerruf ab. Ein ausdrücklicher Verzicht auf
einen unvollständigen Teil-Exportauftrag ist implementiert, ohne ursprünglichen
Auftrag oder vorhandene Dateien zu ändern/löschen. Fertige Exporte bieten nur
Empfangsbestätigung. Der modale Vorschau-/Bestätigungsdialog startet vor seiner
Bestätigung kein I/O. Die native Erstbindung ist inzwischen angeschlossen;
ihre vollständige Zielhost-/Paketabnahme bleibt vor der v2-Freigabe offen.
Fertige neue Exporte lassen sich über ihre gespeicherten Lauf-/Operations-IDs
öffnen; ursprünglicher Zweck, Verzeichnisidentität, Dateimenge und Hashes werden
erneut geprüft. Es wird weder erneut kopiert noch automatisch bestätigt.
Gegenproben weisen veränderte, zusätzliche, fehlende und ausgetauschte Dateien
ab; native Explorer-/Finder-End-to-End-Abnahme bleibt offen. Der echte Sidecar
erhält jetzt feste Dokument-/Exportfehlergründe bis zur Oberfläche.
Im Verlauf ist ein ausdrücklich ausgelöster laufgebundener Abgleich aktueller
Freigaben und historischer Exportbelege implementiert. Unvollständige Aufträge
und offene Empfangsbestätigungen bleiben getrennt; Legacy ohne v2-Manifest ist
unbekannt, fehlende/defekte Prüfstände sind kein Null-Erfolg. Reguläre Abfragen
laden nicht automatisch alle Dokumentjournale. Verspätete Antworten werden
verworfen. Die synthetische Tastatur-/DOM-Probe bestätigt Aufklappen, Legacy-
Anzeige, Fokus und 390-Pixel-Reflow, keine native Paketabnahme.
Priorisierte Hauptaktionen je Lauf und aufklappbare Nebenaktionen sind jetzt
implementiert. Exakte aktuelle Exportabdeckung dedupliziert fertige Teil-Exporte
und prüft Revision/Hash/Zweck, nicht nur die Anzahl historischer Kopien.
Exportvorschau lädt den vollständigen aktuellen Stand nochmals; sie startet
keinen Export. Fehlender Ergebnisordner, ersetztes Verzeichnis und unlesbare
Bindung bleiben unterscheidbar. Der unabhängige Review fand einen P2 bei
überholten Ladesperren nach Zuklappen oder parallelem Ordneröffnen; zwei zunächst
rote Regressionen sind korrigiert. 32 Workspacefälle bestehen. Die synthetische
Browserkette Freigabe → Verlauf → Exportvorschau → Escape sowie 390-Pixel-Reflow
ist geprüft, kein nativer Plattformnachweis. Kein doppelter initialer Ladebutton.
Die P1-Gegenprüfung präzisierte den nötigen nativen Exportbroker: Alle Ziel-I/O
müssen handle-relativ erfolgen; eine gehaltene Lease mit anschließenden Node-
Absolutpfadzugriffen reicht nicht. Sichere macOS-Erstbindung bleibt gesondert
nachzuweisen. Dieser vorausgehende Review war Architekturvorbereitung;
der spätere tatsächliche Anschluss ist unten gesondert belegt.
Der normale Ergebnisordner bleibt auf ausdrücklichen Anwenderwunsch erhalten,
keine ZIP-Umstellung. Der unabhängige Fachreview beschreibt private vollständige
Vorbereitung und native No-replace-Veröffentlichung als begrenzten Lösungsweg.
Ein erster interner nativer Dateisystembaustein war zunächst implementiert,
aber noch nicht an Node, CLI oder Tauri-Befehle angeschlossen. Zwölf echte Windows-
Gegenproben bestehen: handle-relative Anlage, No-replace-Veröffentlichung,
32 konkurrierende Zielanlagen, gesperrter Rootaustausch, falsche/verschobene
Stagebindung und ein Fehler nach tatsächlichem Rename. Der letzte Fall meldet
ausdrücklich einen unklaren Publikationsstatus, keinen behaupteten Nicht-Export.
Der folgende Schnitt ergänzt einen geschlossenen privaten Rückkanal für die
Metadatenbindung exakt ausgewählter Ergebnisordner, native Lifecycle-Barriere
und Korrektur der Sidecar-Start-/Registrierungslücke; kein neuer Exporthelper.
Der interne Transaktionskern bindet Intent/Stage/Parents/Zweck/Dateimenge/Hashes
dauerhaft und gleicht auch vor Verzicht eine mögliche Veröffentlichung ab.
Zwei unabhängig belegte Befunde sind korrigiert: native lesende Recovery mit
Parent-/Namensbindung und atomare vollständige Journalbelege statt halber
Finaldateien. Zwölf Transaktionsregressionen einschließlich zwölf tatsächlicher
Testprozess-Beendigungen bestehen. Kontrollierte private Parent-Rechte und ein
dauerhafter Workspace-Bindungsbaustein sind zusätzlich implementiert: Sieben
Workspacefälle einschließlich vier eigener Prozessbeendigungen prüfen Abbruch
zwischen Intent, Parent-Anlage und Binding; unvollständige Belege erlauben keine
Adoption. Ein Darwin-ACL-Vertragsfehler ist nach unabhängigem Review korrigiert;
die neuen nativen Mac-ACL-Proben bleiben NOT_RUN. Die asynchrone Dokumentsperre
hält jetzt bis zur tatsächlichen Promise-Erledigung (sechs gezielte Gegenproben).
Insgesamt 100 Windows-Rusttests und warning-free Clippy bestehen. Zwei ignorierte
Kindhelfer werden für 16 eigene Prozessbeendigungen von Eltern-Tests aufgerufen,
nicht separat als PASS gezählt. Begrenzter unabhängiger Workspace-Abschlussreview
ohne weiteren belegten P1/P2; keine vollständige App-Recoveryfreigabe.
macOS-/Linux-Code ist noch nicht nativ ausgeführt. Der weitere v2-Schnitt
verwendet jetzt statt des Node-Publishers einen nativen Exportbroker. Picker-
Bootstrap und ursprüngliche Parent-Identitäten bleiben in Einstellungsschema 4
und Operationsschema 5 gebunden. Freigegebene Körper gehen in begrenzten
64-KiB-Blöcken über die private Pipe; nur Native schreibt sie handle-relativ in
Operationsstages und veröffentlicht ohne Ersetzen. Zwei unabhängige P2 des
ersten Anschlusses (Originaltext-Schreiben in einen ausgetauschten Spoolroot,
gemeinsames Inventarlimit durch Körperreste) sind korrigiert und tatsächlich
gegengeprüft. Ein Root-Trennungsfehler nach neuer Konfiguration ist ebenfalls
korrigiert. Beide Zwecke bestehen im echten Node→Pipe→Rust-Dateisystemweg,
einschließlich Lost-Completion/Widerruf/ACK/Abandon, Unicode-Multichunks und
Rootaustausch. 103 Windows-Rusttests, warning-free Clippy, acht Kanal- und
sieben Dokumentbesitzfälle bestehen. Drei ignorierte Rust-Helfer sind keine
separaten Abnahmen. Desktop-Elternbesitz verhindert Freigaberennen nach
Sidecar-Tod, bleibt dann aber bis zum vollständigen App-Neustart konservativ
gesperrt. Sequenzierte Wiederverbindung und vollständige native v2-Pakettests bleiben
offen. Kein Stromausfall-/vollständiger paketierter Abbruchnachweis und kein
unsicherer Kopier-Fallback über Volumegrenzen; Legacy/Cowork bleiben unverändert.
Terminale Dateifehler bleiben durch gebundene private Belege mit Namen und
Grund nach Journalablauf lesbar. Fehlgeschlagene unveröffentlichte Entwürfe
blockieren keine gesunden Prüfstände; sieben echte Gegenproben und unabhängiger
Review bestehen. Einzelne Datei-Wiederholung/Auslassung ist noch nicht umgesetzt.
Zusätzliche synthetische Browserprobe bestätigt zentrale Behandlung,
Auswahl ohne Entscheidung, Original-/Markdown-Vergleich und 1280-/600-Pixel-
Reflow; Auswahlspaltenumbruch korrigiert, keine neue native Grafikabnahme.
Aktuelle vertrauliche Zuordnungen folgen jetzt tatsächlichen Entitätenrevisionen;
zusätzlich bleibt jede neue exportgebundene Zuordnung bei den damaligen ausgewählten
Revisionen/Hashes. Keine Rekonstruktion aus sichtbaren Markern oder mehrdeutigen
Nachnamen. Echte Alias-, Firmenfeld-, Unicode- und Maskierungsgegenproben bestehen.
Die unabhängige Zwei-Dateien-Manipulation (TXT plus angepasstes Digest) wird durch
deterministisches Rendering aus dem gebundenen Objekt abgewiesen. Fehlende private
Zuordnungen löschen keine fertigen Exportbelege oder ACKs. Die neue geschlossene
native Öffnungsaktion überträgt nur IDs; echte gerahmte Sidecar-Gegenproben und
synthetische Browser-Tastaturprobe bestehen, keine native Dateimanagerabnahme.
Veröffentlichungseinträge außerhalb abgelaufener Verarbeitungsjournale erhalten
die Namen fehlender Dokumentkörper; Lesen legt keine falschen Körperbelege an.
Alte unbewiesene Quellen bleiben unbekannt, Roh-Markdown behält seinen Zweck.
Offen bleiben die sichere Kopie der neuen Referenz in den menschlichen Ergebnis-
bereich, Retry/Auslassen einzelner Fehlerdateien und vollständige Verlaufsabnahme.
Neu revalidiert und korrigiert: Gemischte Aufnahme stoppt gültige Dateien nicht
wegen hashloser abgewiesener Geschwister. Ausschließlich abgewiesene Eingaben
behalten Namen mit Endung, Gründe und Zweck getrennt von Dokumentautorität.
Metadaten werden bereits nach dem Aufnahmejournal gespeichert. Die unabhängigen
Crash-/Ablaufgegenbefunde sind mit zuerst roten Tests korrigiert: Recovery,
periodische Bereinigung und direkter Ablaufreader reparieren fehlende Manifeste
vor Journalverlust; widersprüchliche Belege werden nicht überschrieben.
Ein alter Null-Fehlerzähler verdrängt keine belegte Ablehnung. 27 Aufnahme-,
24 Recovery-, 19 Journalfälle sowie echte Gateway-Neustarts beider Zwecke über
alle drei Ablaufwege bestehen. Lokale Fehleransichten überleben Journalablauf,
unvollständige Listen werden nicht als vollständig ausgegeben. Kein Einfluss
auf Coworks Aufnahmevertrag und keine erfundene Freigabe oder Exportautorität.
Stabile Laufaktions-IDs erhalten Tastaturfokus bei Fortschritt; entfallende
Aktionen führen zur Laufüberschrift, nicht aus anderen Ansichten heraus.
Die höfliche Statusregion meldet bedeutsame Phasen/Fehler statt jeden Zähler.
Unabhängige begrenzte Browser-Tastaturgegenprobe besteht; native Accessibility-
und v2-Paketabnahme bleiben offen.
Unabhängige Gegenprüfungen bestätigten korrigierte Alias- und Journalendfehler:
ein fehlender Entscheidungsspiegel wird nur aus einem exakten separat gespeicherten
Commitnachweis rekonstruiert, widersprüchliche Belege sperren die Freigabe.
Eine native Stromausfallgarantie oder Schutz vor gemeinsamem Verlust beider
Kopien ist damit nicht belegt. Nach fehlgeschlagenem Zustandsabgleich sperrt die
Oberfläche weitere Mutationen; Roh-Markdown-Entwürfe bleiben für Vergleich/Kopie
erhalten. Der offene Exportdialog aktualisiert seine Wiederaufnahmeaktionen.
Die Revalidierung anhand offizieller Tauri-, OWASP- und W3C-Kriterien ist im
Migrationsabgleich dokumentiert, ohne pauschale Konformitätszusage.
Aktuelle gezielte Gegenproben: 29 Workspace- und 33 Prüferfälle sowie
57 Service- und 31 Ordnerfälle bestehen. Zwei weitere technische Gegenbefunde
sind korrigiert und unabhängig revalidiert: Das Transportbudget zählt jetzt
Unicode-Artefaktdetails vor dem Aufnahme-Commit; delegierte Starts verbrauchen
sämtliche Katalog-IDs und Ablehnungen, auch bei unklarer Empfangsbestätigung.
Neue Aufnahmen übernehmen keine alten Ablehnungen. Anzeigeinformationen des
gestarteten Laufs bleiben getrennt erhalten.
Die echte Sidecar-Gegenprobe nimmt 201 kleine Testdateien auf und verweigert
deren ungefilterten Start ohne Verlust des Katalogs. Eine separate Browserprobe
bestätigt Grenzhinweis/Startsperre und deren Aufhebung nach Abwahl einer Datei.
52 Windows-Rusttests, Dokumentationsprüfung,
Vorschaugrenzen und gepinnte Schrift-/Lizenzprüfung bestehen ebenfalls.
Pause- und Dokument-/Exportregressionen sind auch im Standalone-Testeingang
eingetragen, den die macOS-Paketworkflows verwenden. Der statische Workflowtest
besteht; neue native macOS-Läufe wurden dadurch nicht ausgeführt.
Eine vorausgehende Browserprobe korrigierte außerdem die zuvor aktiv wirkende
Farbe des deaktivierten Exportbuttons und bestätigt den Fokus auf der
Dokumentüberschrift sowie den wiedergeöffneten Exportbeleg. Bildschirmbeleg:
`tmp/frontend-v2-ui/dokumentfreigabe-v2-export.png` (synthetische Vorschau).
Die aktuelle Browserprobe bestätigt die laufweite Sammelaktion und unveränderte
Texte vor deren Bestätigung, keine automatische Freigabe/Export und Reflow bei
390/1280 Pixeln: `tmp/frontend-v2-ui/dokumententscheidung-laufweit-v2.png`.
Die echte Browserprobe bestätigt zentrale Sammelaktionen, offene Restzeilen,
Original-/Markdown-Vergleich, Reflow und stabile Fokusrückkehr anhand klar
markierter synthetischer Daten. Der kompaktere Kopf und die gemeinsame
Dokument-/Statuszeile lassen mehr Fundstellen sichtbar; vollständige Namen
bleiben im lokalen DOM, Tooltip und ausgewählten Vergleich erhalten.
Die anschließenden 33 Prüferregressionen und die unabhängige begrenzte
Interaktionsgegenprüfung bestehen; Browserreflow bei 1280 und 900 Pixeln
ist ohne horizontalen Seitenüberlauf geprüft.
Der sichtbare Verlauf aktualisiert Laufzeilen
ohne Verlust aufgeklappter Dateiprobleme; sequenzierte Backend-Ereignisse
bleiben ein eigener offener Schritt.

Die Veröffentlichungsgates sind **nicht grün**: Der releasegebundene Build
stoppt an `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` für den uncommittierten
Arbeitsstand; die ZIP-Prüfung findet kein neu gebautes RC158-Pluginarchiv.
Diese Herkunfts-/Paketprüfungen werden nicht umgangen. Nichts aus der
v2-Migration wurde committed, gepusht oder veröffentlicht.
Die folgenden Releaseangaben betreffen unverändert die veröffentlichten Pakete,
nicht die v2-Migration.

## Veröffentlichter Stand

Der beauftragte Standalone-Vorabrelease für Windows x64 sowie macOS Intel/Apple
Silicon ist aus Quellcommit `f4caf948bde39dbebe8fe359235c3be84f189e5d` auf main
und als [RC158-Prerelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc158)
verfügbar. DS-106–109 und die revalidierten Diagnose-/Lesekorrekturen sind
enthalten. Fünf Pakete plus fünf Prüfsummendateien sind gegen ihre GitHub-
Digests geprüft. Linux bleibt RC157, Cowork bleibt RC151.

Die bestätigten Diagnose-/Leselücken sind mit gehaltenen,
begrenzten I/O-Grenzen und Gegenproben korrigiert. Der unabhängige Gegenreview
führte zu weiteren Cache-, Kollisions-, FIFO- und Identitätskorrekturen.
Die frische SARIF-Gegenprüfung am Commit `b88c31b` bestätigte fünf weitere
Restlücken bei Status-Buildwrites, drei Readern und Preview-Löschbindung.
Sie sind korrigiert; neue exakte 64-Bit-, kohärente Austausch- und echte
Dateisystem-ABA-Regressionen bestehen. Zwei unabhängige Abschlussreviews
fanden in diesem begrenzten Umfang keine verbleibenden reproduzierbaren P1/P2.
Am finalen Commit bestehen 195 Produkttestdateien, 49 Windows-Rusttests,
warning-free Clippy, Dokumentation, sauberer Build und strenge Claude-CLI-
Validierung. Windows PKG-04 bestätigt zwei bytegleiche saubere Bauten samt
paketiertem Review-/Neustartworkflow; beide Mac-Architekturen bestätigen ZIP,
DMG, native Haupt-/Prüfseitenladung und erfolgreiche IPC. Frische Gitleaks-,
JavaScript-/native Windows-CodeQL- und Pflicht-CI-Gates bestehen ebenfalls.
Ursachen, Archivhashes und eng begrenzter Nachweisumfang stehen im
[Releasevertrag](../RELEASE.md#rc158--standalone-windows-sowie-macos-zip-und-zusätzlich-dmg).
Native Fenster-Smokes sind keine bediente GUI-Abnahme; Mac Developer-ID,
Notarisierung und neue menschliche Spezialabnahmen bleiben getrennt offen.

Der frühere Standalone RC157 bleibt im
[Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157)
aus Quellcommit `111737d28021b6989ffe8d563b58daa9cbae610f` verfügbar:
Windows x64, Linux x64 glibc sowie macOS Intel und Apple Silicon mit ZIP und
zusätzlichem DMG. Alle vier nativen Zielplattformprüfungen bestehen, einschließlich
der geladenen integrierten Prüfseite. Die zwölf Release-Assets stimmen mit den
lokalen Paketen und Prüfsummendateien überein; Nachweise und Hashes stehen im
[Releasevertrag](../RELEASE.md#rc157--standalone-auf-allen-zielplattformen).
Der RC157-Windows-Anwenderlauf `3d6b69b7` einschließlich lokaler Prüfung und
Stapelverarbeitung ist ausdrücklich bestanden: 140 Ergebnisse, 140 Dateizuordnungen
und eine vertrauliche Identitäts-TXT mit 140/140 erfassten Ergebnissen.
Der abschließende Einzeldokument-Reviewfix ist im finalen Neubau separat geprüft;
dieser ist nicht bytegleich mit dem vorherigen Anwender-Test-ZIP.
Coworks veröffentlichte Pakete und eigener Reviewadapter bleiben unverändert.
Die benannten Mac-/Linux-Bedien-, Accessibility- und formalen Spezialabnahmen
werden dadurch nicht pauschal als bestanden behauptet.

## Nachbesserung vom 05.10.2026 (in RC158 veröffentlicht)

Die folgenden lokalen Engineering-Zwischenstände dokumentieren ihre damaligen
Prüfschnitte; die abschließende Releasebindung und neuen Gates stehen oben.

DS-109 / BL-010.52 setzt die erneut fachlich revalidierte Architekturverbesserung
ohne MVC-Neubau um: gebundene Gesprächsnamen statt unbemerkter Freigabe,
konservative OCR-/Malreihenfolgenprüfung, gestreamte laufweite Identitätsdatei
mit ehrlichen Warnungen und Ausgabeheader, eng erkannte OS-Begleitdateien,
geschlossene Fehler-/DTO-Verträge, stabile History-Zeilen und native Start-/
Öffnungsdiagnose. Konkrete Rollen-/Abteilungssuffixe und der neue native
Identitätsöffnungsvertrag wurden im abschließenden Gegenreview zusätzlich
korrigiert. Gezielte Publikations-, Paketkonverter- und Rust-Regressionen sind
geprüft. Der vollständige lokale Produktschnitt mit 194 Testdateien, 45 Rusttests
und Clippy, 41 echten Windows-Konvertierungsgruppen sowie dem endgültigen
Windows-Engineering-Paketworkflow und nativen Start ist bestanden. Die
Wiederaufnahme konkreter Startfehler erfolgt nur ausdrücklich nach lokaler
Ursachenbehebung und höchstens bis zum dritten gleichen Fehlschlag;
Sicherheitsgrenzen bleiben davon ausgeschlossen. Hash, tatsächlicher
Nachweisumfang und der mangels sauberem Quellcommit verweigerte
veröffentlichungsgebundene Cowork-Build stehen in der Evidence-Matrix.
Neue native Mac-Gerätebedienung und unabhängige Inhaltsqualitätsmetriken
bleiben ausdrücklich getrennt offen. Der damalige lokale Auftrag erzeugte
noch kein Release; die anschließende Veröffentlichung ist oben separat gebunden.

DS-106 / BL-010.46 ergänzt für Standalone die ausdrückliche Prüfwahl
**Als Unternehmen anonymisieren**. Die tatsächliche Ersetzung und die
vertrauliche Zuordnung verwenden Unternehmens- statt Personenpseudonyme.
Eine Entscheidung über dieselbe vollständige Schreibweise wird für offene und
folgende Prüfungen desselben Laufs wiederverwendet, auch nach Neustart. Neue
Läufe und bereits fertig veröffentlichte Ergebnisse bleiben davon getrennt.
Die private Entscheidungstabelle enthält authentifizierte, lauf-/Seed-/Policy-
gebundene HMAC-Schlüssel statt Rohschreibweisen. Coworks Reviewadapter erhält
keine neue Unternehmensaktion oder laufweite Entscheidungstabelle.

Der reale RC157-PDF-Lauf `5e50a0b0` erreichte 9/10 Ergebnisse. Die fehlende
Dateiliste war ein eigener Fehler der Hauptfenster-Capability für
`get_run_failures`; sie ist lokal korrigiert. Nicht verarbeitete Dateien werden
mit vollständigem Namen einschließlich Endung, Fehlercode, Erklärung und
nächstem Schritt angezeigt. Der separate Verarbeitungsstopp
`AMBIGUITY_REVIEW_REQUIRED` ist reproduziert: Die Restprüfung überbrückte einen
bereits ersetzten Platzhalter mit Leerzeichen und erzeugte eine nicht bindbare
Namenshypothese. Literal-Fundstellen erhalten jetzt koordinatentreue Grenzen;
die unabhängige Restprüfung und die exakte lokale Freigabebindung bleiben aktiv.
Mit unverändertem installierten Konverter und neuem Privacy-Code erreicht die
konkrete PDF vier exakt gebundene Prüfkandidaten statt des vorherigen Stopps.
Der gemeldete Windows-Komplettausfall bei einer Kollegin ist ohne ihre Diagnose
noch nicht ursächlich zugeordnet.

Der reale Markdown-Lauf `8676f0ca` dient als Gegenprobe für PDF-Grafikreste.
Die lokale Extraktion lässt reine nicht decodierbare Symbolruns mit einem
ehrlichen Grafikhinweis aus; lesbare Texte, Zahlen, Tabellen und Formeln bleiben
erhalten. Zusätzlicher Raster-OCR wird nur bei geometrisch vollständig durch
beibehaltenen nativen Text belegten, exakt gleichen Wörtern und sicherer
PDF-Malreihenfolge unterdrückt. Bild-only-Text und
unbekannte Geometrie bleiben erhalten; Grafiknamen und Bildbeschreibungen
werden nicht erfunden. Geometrisch belegte Textgrenzen trennen zuvor angeklebte
Seitenzahlen. Diese Änderungen sind lokale Entwicklung, keine nachträgliche
Abnahme oder Veröffentlichung des RC157-Pakets.
E0 bestanden: kanonische CI-Suite mit 72 Basis- und 61 weiteren Testdateien,
38 reale paketierte Konvertierungsgruppen, 11 PDF-Layoutfälle sowie zusätzliche
Review-/Journal-/Captureprüfungen und gezieltes Gegenreview. BL-010.46 ist
technisch erledigt; der ungeklärte Kolleginnen-Befund bleibt gesondert unter
BL-010.47 offen. Für diesen früheren Prüfschnitt wurde noch kein neuer
Paketbau oder neuer Zielhostnachweis behauptet; der nachfolgende DS-107-Schnitt
erweitert und korrigiert diese begrenzte Evidenz.

## Technischer Gegenreview und Umsetzung DS-107 vom 05.10.2026

BL-010.48 schließt die dabei gefundenen echten Integrationslücken: Die
Unternehmenswahl wird jetzt vom privaten Desktop-IPC akzeptiert und bis zur
typisierten Veröffentlichung geprüft. Standalone begrenzt den Prüfdialog auf
Windows/macOS/Linux einheitlich auf 5.000 Fundstellen. Broker und Oberfläche
kennen laufgebundene Vorbereitung, Publikation, First-Draft-Fehler,
Wiederholung und Exportreparatur; ein noch lebender Worker wird nicht doppelt
gestartet. Startfehler erklären fehlende Komponenten, verweigerte Ausführung
oder falsche Architektur und nennen die dafür vorgemerkten Dateien.

Rust begrenzt die gesamte Anfrage einschließlich Sperre, Prozessstart und
Schreiben. Normales natives Schließen und Testschließen verwenden denselben
unabhängigen, begrenzten Sidecar-Shutdown. Dateifehler bleiben auch ohne
erfolgreiche Zuordnungsausgabe sichtbar. Aufnahmefehler nennen die betroffenen
relativen Dateinamen und nächsten Schritte; nicht gestartete Dateien werden
von tatsächlich gestoppten Dateien unterschieden.

Tests prüfen zusätzlich den echten Sidecar-/Reviewworker-/Broker-Weg mit
serialisierter Unternehmensentscheidung, First-Draft-Fault und Wiederholung,
ungültiger Antwort sowie Vertagen/Fortsetzen. Native Review-Smokes verlangen
eine erfolgreiche `get_review_session`-Antwort; Requestbeginn und bloße
Seitenladung reichen nicht. Nicht ausführbare Plattformfälle zählen als Skip,
Browserfixtures ausdrücklich nur als UI-/Accessibility-Nachweis.

Der lokale Windows-Engineering-Bau entsteht separat mit
`--engineering-directory`; bestehende RC157-Releasearchive bleiben erhalten.
Neue native macOS-Gerätebedienung und Publisher-Signierung/Notarisierung sind
damit nicht belegt. Der Windows-Komplettausfall der Kollegin bleibt ohne
gerätebezogene Diagnose oder reproduzierbare Gegenprobe ursächlich offen
(BL-010.47). Das bedeutet nicht, dass bereits bestandene Anwenderläufe erneut
ungetestet sind. Test- und Paketbindung dieses Schnitts stehen in der
Evidence-Matrix; kein Push oder Release wird daraus abgeleitet.

## Mehrdimensionale Revalidierung und Umsetzung DS-108 vom 05.10.2026

Die bestätigten Befunde des erneuten technischen Audits sind lokal korrigiert
und nochmals unabhängig aus Privacy-, Native-/Lifecycle- und Testgate-Sicht
gegengeprüft. BL-010.49 ist technisch E0 erledigt; das ist keine Freigabe eines
neuen Releases oder eine Behauptung vollständiger Zielgerätebedienung.

Quelltext darf sich weder mit beliebigen Klammerlabels noch mit typisierten
HMAC-/numerischen Markern still als bereits anonymisiert ausgeben. Übernommene
variable Quellmarker benötigen eine exakt gebundene lokale Entscheidung;
tatsächlich neu erzeugte Pseudonyme werden davon unterschieden. Ganze
Zugangsdatenzellen bleiben auch mit Markern und in einspaltigen Tabellen geschützt.
Standalone verwendet durchgehend das angekündigte 5.000er-Prüfbudget, während
Coworks Reviewvertrag und 1.000er-Budget getrennt bleiben.

Der Reviewrenderer verwirft veraltete Antworten und führt genau einen Polltimer.
Verlorene Bestätigungen werden als unklar behandelt und durch Statusabgleich
aufgelöst, nicht durch automatische erneute Entscheidungen. Fortsetzungsfehler
behalten Ursache und gebundene Dateinamen. Native Fensterschließung bindet die
tatsächlich ausgelieferte Review-ID. Prozessstarts werden vor dem OS-Aufruf
registriert; auch wiederholtes Quit kann die Shutdown-Reconciliation nicht
überspringen oder deren Fehlercode durch Erfolg ersetzen. POSIX hält die
Prozessgruppen-Eigentümerschaft bis nach der terminalen Gruppenbereinigung.
Die Aufnahme erhält eine eigene endliche Fünf-Minuten-Frist mit ehrlichem
Zeit-Heartbeat; innere Windows-Konverterstartursachen bleiben unterscheidbar.

Die Produktsuite besteht mit 136 Testdateien (75 Basis + 61 direkte), die
gezielten Rust-Prüfungen mit 39 Tests und strengem Clippy. Reale Windows-
Konvertierung, vier positive POSIX-Cancellation-Gegenproben und zwei wirksame
Mutanten auf WSL/Linux, Renderer-Fault-Injection und vollständige Paketinventare
sind separat nachgewiesen. Die Testdetails und ihre Grenzen stehen in der
[Evidence-Matrix](BACKLOG_EVIDENCE_MATRIX.md#ds-108--abschließender-lokaler-revalidierungsnachweis).

Der finale isolierte Windows-Engineering-Kandidat ist
`dist/engineering-ds108-final-20261005/DataSecure-Standalone-3.2.0-rc157-windows-x64.zip`,
589 Einträge, 110386747 Bytes, SHA-256
`d4dcd06ae001564301d9e7a205aaf1656f5e423c8d9ad17f7583828247625aba`.
Paketverifier und echter paketierter Sidecar-/Worker-Gesamtweg bestehen:
6.001 Fundstellen über mehrere Gruppen, Personen-/Unternehmensentscheidungen,
Verschieben, Neustart, laufweite Übernahme, automatische Folgegruppe, vollständige
Ausgabeprüfung und exakter Fehlerdateiname. Der native Windows-Start prüft
Haupt-/Prüfseitenladung und korrelierte erfolgreiche IPC, nicht menschliche
Reviewentscheidungen. Start: 2540,399 ms; Windows 10.0.26200.0 x64,
WebView2 154.0.4258.53 (machine), zehn zugeordnete Prozesse, keine TCP-Listener
oder UDP-Endpunkte im Messfenster; Exit 0 und 911 test-eigene Einträge bereinigt.

BL-010.50 bleibt offen für die bediente Gesamtprüfung genau des neuen Pakets
auf Windows sowie beiden Mac-Architekturen. WSL-Supervisorlaufzeit ist kein
macOS-Abbruchnachweis; native Seitenladung ist keine Bedienabnahme. Die
ausführbare Kampagne bindet den extrahierten Dateibaum vor beiden Starts und
vor PASS an sämtliche Archivbytes und verlangt echte Bedienattestation.
BL-010.51 sammelt gezielte Weiterentwicklung aus offiziellen Methodenquellen:
unabhängig annotierte Erkennungs-/Fehlanonymisierungsmetriken, reproduzierbare
modellbasierte Zustandsfolgen und spätere Buildherkunft. Die aktuelle Architektur
wird stabilisiert, nicht durch Cloudverarbeitung oder eine neue NLP-Pflicht
ersetzt. Keine Originale oder vorhandenen Anwenderläufe wurden verändert;
kein Commit, Push, Tag oder Release wurde aus diesem lokalen Auftrag abgeleitet.

### Lokale Qualitätsmessung vom 06.10.2026 (BL-050.5/6)

Die E0-Messinfrastruktur ist umgesetzt: unabhängige synthetische Referenzen,
60 logische Fälle/72 Format-/OCR-Varianten und 23 Gegenregressionen für den
Auswerter und das fundstellengebundene synthetische Review. Echte lokale
Windows-Standalone-Runtimeprojektionen führen beide Zwecke mit produktiven
Konvertern/OCR und verifizierten Publikationen aus. Berichte trennen Extraktion,
unveröffentlichten Einpass-Core-Entwurf und tatsächliche finale Ausgabe; konkrete
Dateinamen mit Endung, Positionen und lokale Quell-/Ausgabe-Gegenproben sind enthalten.
Das Verfahren steht in [DETECTOR_BENCHMARK](../DETECTOR_BENCHMARK.md).

Die Qualität ist nicht pauschal bestanden: Service Level, Fail Closed und
Synthetischer Härtetest wurden in synthetischen Entwicklungsdateien tatsächlich
als Personen ersetzt. Hinzu kommen separat ausgewiesene OCR-Veränderungen.
Im abschließenden lokalen 72-Dateien-Lauf wurden alle 72 Ergebnisse veröffentlicht,
darunter neun zunächst vertagte Dokumente nach insgesamt fünf synthetischen
Prüfentscheidungen. Der unabhängige Endvergleich fand zwei unverändert gebliebene
Firmenvorkommen in CSV/XLSX (BL-050.7), 226 verlorene Fachanker und neun durch OCR
veränderte Identitätsvorkommen. Bekannte Personen-/E-Mail-/Telefonreste wurden in
diesem begrenzten Referenzvergleich nicht gefunden; das ist keine allgemeine Zusage.
Referenz-SHA-256: `827de027174f5447dc0a3358510f812e3adbec922d0244233e0ed34676b00bda`.
Der Quelllauf und Gegenprüfungsdateien liegen lokal unter
`dist/quality-acceptance-20261006`; der Benchmark endet wegen dieser Befunde korrekt
mit Exitcode 1. Die 197-Dateien-Produktsuite, gezielte 23 Qualitätsregressionen,
Docs-/Link-/Versionsprüfungen, strenge lokale Claude-CLI-Strukturprüfung und
`git diff --check` bestehen. ZIP-Verifikation dieses Auftrags ist ohne erzeugtes
neues Paket nicht durchführbar; ein alter Pakettest wird nicht als neuer Nachweis benutzt.
BL-050.6 enthält die noch offene Produktkorrektur, BL-010.51 bleibt für unabhängige
menschliche Referenzprüfungen, Ausbau der Klassen und weitere Methoden offen.
Keine reale personenbezogene Quelle wurde verwendet. Native Mac-Ausführung und
exaktes Releasepaket dieses Benchmarks sind NOT_RUN; technische Reviewantworten
sind keine menschliche Abnahme. Normaler Paketbau verweigert hier den uncommitteten
Arbeitsbaum (`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`); die Herkunftssperre bleibt
unverändert. Kein neues Paket, Push oder Prerelease aus diesem Messauftrag.

### Lokale Standalone-Qualitätskorrektur vom 06.10.2026 (unveröffentlicht)

BL-050.6/7 korrigiert die unsichere Personenbindung von Überschriften und
neutralen Tabellenzellen: vor der Aliasregistrierung steht eine exakte lokale
Personen-/Firmen-/Beibehalten-Entscheidung. Die Erkennung arbeitet regelbasiert;
der Lauf registriert erkannte Schreibweisen und ihre Pseudonyme in einer lokalen
Identitätszuordnung. Das ist kein KI-Modelltraining. Explizite Namen, echte Credentials und rechtlich erkannte
Unternehmen mit abweichendem horizontalem Whitespace bleiben streng geschützt.
Überlappende Hypothesen werden als disjunkte Quellbereiche geprüft. Folgeprüfungen
binden Entscheidungen an unveränderte Quellkoordinaten, auch wenn zuvor entschiedene
Firmen die Fundstellennummern verschieben. Dokumentwechsel und ein gespeicherter
Neustart sind durch tatsächliche Publikationsgegenfälle geprüft; der Cowork-Weg
erhält weder die erweiterten Standalone-Hypothesen noch neue Berechtigungen.

Die stabile Windows-Nicht-OCR-Messung veröffentlicht alle 40 Ausgaben. Der finale
Referenzvergleich findet keine bekannten Restangaben und keine verlorenen
Fachanker. Die damalige Referenz wertet drei entfernte Anreden „Frau“ als
Wortverluste; die unten dokumentierte Gegenprüfung bestätigt stattdessen die
bestehende, personengebundene DS-012-Entfernung. Der alte Bericht bleibt unverändert.
Bericht/Gegenprüfungen:
`dist/quality-final-native-20261006`. Dies ist ausdrücklich kein 72-Dateien-/OCR-
oder native Mac-Nachweis; der weiterhin überredigierende Einpass-Core-Entwurf
ist nicht die Standalone-Publikation. BL-050.7 ist für diese E0-Gegenfälle erledigt,
BL-050.6 bleibt für verbleibende Inhalts-/OCR-Qualität in Arbeit.

Die abschließende Messung aller 72 Varianten liegt unter
`dist/quality-final-all-formats-20261006`: alle Eingaben konvertiert, neun Ausgaben
veröffentlicht und 63 im gemeinsamen Prüfblock vertagt. Fünf OCR-bedingte
Fundstellen waren aus der unabhängigen synthetischen Referenz nicht eindeutig
entscheidbar; der Harness gibt deshalb nicht pauschal frei. Neun veränderte
sensible OCR-Vorkommen und zwölf sachliche Wortverluste bei der Extraktion
bleiben offen. Die 63 nicht veröffentlichten Ausgaben sind unbewertet, nicht
fehlerfrei. Die erfassten 197 Entscheidungen zählen gebundene Vorkommen,
nicht menschliche Klicks. Beide Messungen enden ohne fatalen Laufzeitfehler,
aber mit Exit 1 wegen Teilumfang beziehungsweise offener Qualitätsbefunde.

Übernommener OCR-Kontakttext erhält im lokalen Markdown und Extraktionsvertrag
`OCR_CONTACT_VALUES_UNVERIFIED` mit Seite/Bild und OCR-Zeilenhinweisen sowie
fehlender/niedriger Wortkonfidenz. Hohe Konfidenz beweist keine exakte Erkennung;
Text wird nicht geraten, repariert oder still verworfen. Unbekannte OCR-Fehler
bleiben möglich. Runtime-/Auswerterhashes werden vor der Messung gebunden und
nachher verglichen. Das synthetische Engineering-Gate `gate:quality` verweigert
unvollständige/veraltete Berichte und offene Befunde, ersetzt aber keine menschliche
oder rechtliche Abnahme. Die ausführbaren Qualitätsprüfungen umfassen nun 35
Auswerter-/Review-/Publikationsgegenfälle. Das breite `test:product` besteht mit
79 Basis- und 119 direkten Testdateien (198 insgesamt); die abschließende
Funddatei-Vollständigkeitsprüfung des Qualitätsgates besteht zusätzlich im
fokussierten Berichtstest. Docs-/Link-/Versionsprüfungen, lokale CLI-Strukturprüfung
und `git diff --check` sind grün. Grüne Funktionstests ersetzen nicht das weiterhin
rote inhaltliche Qualitätsgate. Native Windows-Konverter/OCR-Gegenfälle wurden
separat ausgeführt, keine neue native Mac- oder menschliche Referenzabnahme.
Build und neues ZIP sind weiterhin durch den uncommitteten Quellbaum begrenzt;
die Herkunftssperre wird nicht umgangen. Kein Push/Prerelease in diesem Auftrag.

### OCR-/Anreden-Gegenprüfung vom 06.10.2026 (unveröffentlicht)

Die drei Folgepunkte sind umgesetzt und gemessen. Die fünf unbekannten OCR-
Überschriften mit verlorenen Umlauten werden durch begrenzte Zeilenneusegmentierung
aus unveränderten Originalpixeln korrekt gelesen. Keine Referenzwörter oder
Kontaktwerte wurden in die Produktion übernommen. Pro Seite gelten höchstens
32 Zusatzdurchläufe, 200.000 Pixel je Crop und zwei Millionen Crop-Pixel insgesamt;
die bestehenden Supervisor-Zeit-/Abbruchgrenzen bleiben wirksam. Native PDF-
Maskengeometrie wird nicht verändert.

Die Vollmessung verwarf eine Zwischenlösung: zwei übereinstimmende E-Mail-Crops
sind kein Genauigkeitsbeweis; ihre automatische Auswahl erhöhte die Fehlerzahl
von neun auf sechzehn. Kontaktwerte behalten deshalb immer die ursprüngliche
Seitenlesart. Abweichende Zusatzlesarten ergeben ausschließlich einen lokalen
Qualitätshinweis mit Seite/Zeile und ohne Rohwerte in Diagnosemeldungen. Ein
weiterer Gegenreview fand inkonsistente Wort-/Zeilenmetadaten als Randfall;
fehlende Wortpositionen werden nun abgelehnt und Kontaktzeilen grundsätzlich
ohne Rekonstruktion übernommen. Der originale Gegenfall ist bytegleich und
startet keine Crops oder Zusatz-OCR; neun gezielte OCR-Unit-Verträge bestehen.

Die Entfernung der Anrede „Frau“ vor einer Person ist kein Produktfehler,
sondern die bestehende DS-012-Regel gegen erhaltene Geschlechtsmerkmale.
Die unabhängige Referenz kennzeichnet nun nur exakte personengebundene
Anredenspannen. Akademische Titel, freie Anredenwörter und Sachinhalte bleiben
erhaltungspflichtig; bei der Extraktion selbst ist auch eine verlorene Anrede ein
Befund. Ein unabhängiger Gegenreview fand eine weitere Auswerterlücke: Verlust
nur im Privacy-Eingang wurde nicht getrennt bewertet. Beide Extraktionswege und
die genaue Bindung der Ausnahme werden nun regressionsgeprüft; die ursprünglichen
Gegenbeispiele sperren korrekt, erlaubte DS-012-Entfernung bleibt zulässig.

Die stabile 72-Varianten-Messung `dist/quality-contact-invariant-final-20261006` bestätigt
72 konvertierte und nach synthetischer lokaler Prüfung veröffentlichte Ausgaben,
202 gebundene Vorkommensentscheidungen, keine unbekannten Reviewhypothesen,
keinen fatalen Laufzeitfehler und bestätigtes Workerende. Referenz-SHA-256:
`f841d0c73e1d1fca4ed999196373208c316f8d695fefda326f8deff9bb891b0f`.
Keine bekannten finalen Identitätsreste, keine verlorenen Fachanker oder
Sachwörter; sieben gezielte Anredenentfernungen sind separat gezählt. Sachliche
Extraktionswortverluste sinken von zwölf auf null. Neun OCR-veränderte E-Mails
bleiben offen: `gate:quality` verweigert die Freigabe mit `QUALITY_FINDINGS_OPEN`.
63 Privacy-Extraktionen wurden tatsächlich erfasst; neun automatisch
veröffentlichte Varianten sind ausdrücklich als Markdown-Fallback ausgewiesen,
nicht als beobachteter zweiter Extraktionsweg. Der fehlgeschlagene 16-E-Mail-
Zwischenbericht bleibt als Gegenbeleg erhalten, alte Messungen werden nicht umgeschrieben.

52 fokussierte Qualitätsgegenfälle und 46 echte Windows-Konvertergruppen bestehen.
Das erneut ausgeführte Produktgate besteht mit 80 Basis- und 119 direkten
Testdateien (199 insgesamt); der letzte Metadatenrandfall ist zusätzlich im
abschließenden fokussierten Lauf abgesichert. Docs-/Link-/Versionsprüfungen,
strenge lokale CLI-Strukturprüfung und `git diff --check` bestehen.
Zwei unabhängige technische Gegenreviews haben die
Korrekturen geprüft, ersetzen aber keine menschliche Referenz-Doppelprüfung.
Native Mac-Ausführung und exakte Releasepaketbindung dieses Stands bleiben
NOT_RUN; Quelländerungen sind plattformgemeinsam, kein neuer Plattformnachweis.
Kein Commit/Push/Tag/Prerelease; der normale Paketbau bleibt bei uncommitteter
Herkunft korrekt gesperrt. BL-050.6 bleibt für OCR-Genauigkeit und unabhängige
inhaltliche Abnahme in Arbeit, nicht wegen der erforderlichen Anredenentfernung.

### Vorangestellte OCR-Kontaktprüfung vom 06.10.2026 (unveröffentlicht)

Nach zusätzlicher geometrischer Gegenprüfung bleibt automatisches Raten von
E-Mail-Zeichen verworfen: 13 zusätzliche Crop-Strategien korrigieren nicht
zuverlässig die neun Rohfehler und verschlechtern teilweise korrekte Kontakte.
Die bestehende Standalone-Prüfseite fragt deshalb exakte übernommene OCR-
Kontaktstellen vor Personenreservierung und Privacy-Analyse ab. Bestätigen und
ausdrückliches Korrigieren sind eigene geschlossene Aktionen; Quelle, Seite,
OCR-Zeile und UTF-16-Spannen bleiben gebunden. Danach folgen normale
Anonymisierung, Entitätsentscheidung und unabhängige Restprüfung im selben
Fenster. Ohne das zusätzliche ausdrückliche OCR-Kontakt-Opt-in bleiben reine
Konvertierung und Originale unverändert; das Opt-in ist nachfolgend beschrieben.

Vollständige Kontaktentscheidungen werden atomar, fsync-/readback-geprüft und
HMAC-authentifiziert in privaten `.ocrreview`-Arbeitsartefakten gespeichert.
Lauf/Seed, Snapshot, komplette Extraktion, Policy/Pseudonymvertrag und genaue
Spannen gehören zur Bindung. Fremde/manipulierte oder geänderte Daten stoppen
mit festem Fehlercode und Dateihinweis; kein stiller Korrekturtransfer zwischen
gleichen OCR-Schreibweisen, neuen Läufen oder geänderten Quellen. Journal,
Diagnose, Hauptansicht und Ergebnisordner erhalten keine Korrektur-Rohwerte.
400 Kontaktstellen je Dokument und 256 Zeichen je Korrektur halten die Antwort
unter 900 KiB; das allgemeine IPC- und separate Entitätsbudget werden nicht erhöht.
Coworks Formate und Werkzeuge bleiben unverändert.

#### Weiterer lokaler Lösungsreview: Bildprüfung und Markdown-Opt-in

Der Engineeringstand vom 06.10.2026 zeigt eindeutig gebundene
Original-Rasterausschnitte unmittelbar in der privaten Kontaktprüfung. PDF-
Ausschnitte stammen aus der tatsächlich lokal gerenderten Seite. Unmodifizierte
gesamte OCR-Fassung, eindeutige Zeile und gültige Geometrie sind Voraussetzung;
Hybrid-Filterung oder wiederholte Zeilen führen zum sichtbaren Originaldatei-
Fallback. Keine Pixel in Markdown, Journal, Diagnose, Hauptansicht oder Cowork.
Neue private Records binden Zweck und Bilddigest statt Bildbytes.

Reine Konvertierung kann nun ausdrücklich **OCR-Kontaktwerte vor dem Markdown-
Export lokal prüfen** aktivieren (standardmäßig aus). Verschieben/Neustart und
lokale Veröffentlichung sind technisch gegengeprüft; Namen bleiben erhalten,
keine Privacy-Analyse/Pseudonyme. Der Review korrigierte echte localFinalize-
Journal- und Hybrid-Crop-Gegenbeispiele. Die 203 Produkttestdateien, 47 echten
Windows-Konvertergruppen und 50 Windows-Rusttests bestehen; frontend- und
private-IPC-Gegenfälle sind zusätzlich gezielt geprüft. Die neue Engineering-
Paketbindung ist nachstehend getrennt dokumentiert; keine Veröffentlichung
oder behauptete menschliche Bedienabnahme dieses Stands.

Ein getrenntes 104-Varianten-Engineeringexperiment misst Tesseract-Zeichen-
alternativen, 1×/1,5×/2× Kontakt-Crops und gepinntes PaddleOCR/ONNX. Paddle behebt
im alten Protokoll neun E-Mail-Zeilen, verschlechtert jedoch zuvor richtige neue
Kontaktzeilen. Kein automatischer Wechsel, keine neue Produktabhängigkeit oder
ungefragte Korrektur. V4-Messung, Lizenzen, Referenz-/Runtimebindung und Grenzen
stehen in [DETECTOR_BENCHMARK](../DETECTOR_BENCHMARK.md).
Ein weiterer begrenzter Versuch rendert Kontaktregionen erneut aus originalen
PDF-Bytes: fünf ausgewählte native Kontaktzeilen verbessern sich bei Skalierung
2/3/4 nicht; acht Scan-Kontaktzeilen verschlechtern sich bei 3/4 von acht auf fünf
exakte Zeilen. Das ist keine Vollabdeckungsmessung und keine Änderung der
nativen PDF-Textextraktion. Keine automatische Auflösungsaktivierung.
Die frische produktive 72-Varianten-Messung enthält weiterhin neun rohe OCR-
Abweichungen; nach expliziter synthetischer Referenzkorrektur sind die finalen
Ergebnisse korrekt im bekannten Referenzumfang. Qualitätsgate bleibt rot,
BL-050.6 und die neue menschliche native Bedienabnahme bleiben offen.
Main/Releases sind unverändert.

Der Nutzer hat anschließend den separaten Engineering-Checkpoint und einen
weiteren Windows-/macOS-Intel-/Apple-Silicon-Paketlauf ausdrücklich beauftragt.
Die Paketprüfung ist um exakte Originalpixel, Kontaktkorrektur, Verschieben/
Neustart und Veröffentlichung auch im Markdown-Opt-in ergänzt. Das frühere
Herkunftsgate `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` wird nicht umgangen: Erst
committen, dann aus einem sauberen Checkout bauen. Main und Releases bleiben
unverändert. Produktcheckpoint: `6faee97d527a6a7bb6d5f010647ea5bcb6bed2ca`;
verschärfte vollständige Ausgabeprüfung: `3ee1e1cceddac90144a7d8be224b69aa63b00d4f`,
jeweils nur auf `codex/ocr-contact-native-revalidation-20261006`.

Der saubere Windows-Checkout von `3ee1e1c` besteht Produktbuild, Plugin-ZIP und
strukturelle CLI-Prüfung. Die frische 203-Dateien-Produktsuite, alle 47 echten
Windows-Konvertergruppen und 50 Rusttests/Clippy bestehen. Exaktes Engineering-
Standalone-ZIP: SHA-256
`bbfe97a9ab47add34a0955b0a33daa971a4e0e38d3dfa10b106d6baf1c6a63f7`.
Tatsächlicher paketierter Privat-IPC-Pfad prüft Originalpixel, verschiedene
E-Mail-/Telefonkorrekturen, zwei Dokumente, Verschieben/Neustart, nachfolgende
Entitätsprüfung und vollständige separate Ausgaben für Anonymisierung und
Markdown-Opt-in. Zusammengeführte, doppelte und ergänzte Dokumente werden als
Testgegenbeispiele abgewiesen. Wiederholte ZIP-Assemblierung aus demselben
kompilierten Executable ist bytegleich, kein unabhängiger Compiler-Doppelbau.

Das exakte Windows-ZIP startet Haupt- und Prüffenster mit erfolgreichen IPC-
Antworten im eigenen nativen Profil: 1627,15 ms, 3.731.456 Byte Shell, null
beobachtete TCP-Listener/UDP-Endpunkte. Kein nativer Reviewklick oder Nachweis
der sichtbaren Pixelanzeige. Eine operatorgeführte OCR-Kampagne ist vorbereitet,
ausdrücklich `NOT_RUN`, keine Bedienattestation durch Testskript.

Der ausdrücklich genehmigte weitere Mac-Engineeringlauf
[`37491424692`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37491424692)
bindet `3ee1e1c` und ist auf Intel und Apple Silicon erfolgreich abgeschlossen.
Je Ziel: 48 Rusttests, Clippy ohne Warnungen, 45 echte Konvertergruppen; zwei
Windows-spezifische Konvertergruppen sind ausdrücklich übersprungen, nicht
bestanden. Beide exakten ZIPs bestehen die paketierte OCR-Korrektur für
Anonymisierung und Markdown-Opt-in mit Originalpixeln, Verschieben/Neustart und
vollständigen separaten Ausgaben. Natives App-Bundle, entpacktes ZIP und die
identische App in der gemounteten DMG starten Haupt-/Prüfseiten mit erfolgreichen
IPC-Antworten; das ZIP zusätzlich über LaunchServices. Kein Nachweis nativer
Reviewklicks oder sichtbarer Pixelanzeige, kein unabhängiger Compiler-Doppelbau.

Alle vier Mac-Dateien sind lokal gesichert und gegen ihre SHA-256-Seiten geprüft;
beide ZIPs bestehen zusätzlich Inventar-/ABI-Verifikation:

- Apple-Silicon-ZIP: `87e612bdb07e423d95454ff9b6dd1aaaafffcee4cc21f8d224a8bb949fcb7929`.
- Apple-Silicon-DMG: `acac1fd521343337e04eea623ed3590ede3d70c01e55328b7309288af6999943`.
- Intel-ZIP: `b0175cfb6ccfa68de2f910c112aa68a46d709d0cf0a47734bfbac5421c8c6f14`.
- Intel-DMG: `329cec03925c5080f232e04541324e377f77720c9b0550f0363ec27206bd9895`.

Pakete und abgeschlossene Joblogs liegen unter
`dist/engineering-ocr-crops-3ee1e1c/`. Nur Engineeringpakete, kein neues
veröffentlichtes RC158. Der vorher ersetzte Dispatch ist abgebrochen, kein PASS.
Neue menschliche Bild-/Bedienprüfung und volle 72-Varianten-Qualitätsmessung am
Mac-Archiv bleiben offen. Mac ad-hoc signiert, keine Developer-ID/Notarisierung.

Eine unabhängige technische Pixelprüfung der neun Rohabweichungen zeigt fünf
zusätzliche `d` hinter `@` und vier `q`/`g`-Verwechslungen. Acht Originalraster
klären den Fehler gut; ein weichgezeichneter niedrig aufgelöster Fall bleibt
unsicherer. Das ist keine menschliche oder native Bedienabnahme und begründet
keine automatische Korrekturregel. Das rohe Qualitätsgate bleibt rot.

Zwei unabhängige Read-only-Prüfrollen revalidierten OCR-Genauigkeit und
Verarbeitung/Sicherheit. Die Gegenbeispiele korrigierten tatsächliche IPC-
Antwortvalidierung, CR-/CRLF-Offsets, mehrere Kontakte in derselben OCR-Zeile,
eigene atomare Tempdateien und die Inventargrenze bei 200 Quellen. Ein realer
Prozessabbruch mit 401 Dateien wird sicher bereinigt, nicht ungeprüft fortgesetzt.
Lange nationale/internationale Teilnehmernummern werden nun vollständig ersetzt;
unsichere überlange/abweichende Reste bleiben unabhängig gesperrt. Telefonförmige
PINs verbleiben ausschließlich im rohwertfreien Credential-Befund, nicht als
zweite Telefonnummer in Scannerresultaten. 159 PII-Regressionen bestehen.

Die stabile Vollmessung
`dist/quality-contact-review-final-source-20261006/BERICHTE/QUALITAET.json`
verwendet unverändert Referenz-SHA-256
`f841d0c73e1d1fca4ed999196373208c316f8d695fefda326f8deff9bb891b0f`.
72 Varianten/60 logische Fälle sind konvertiert und publiziert: 55 unveränderte
Kontaktbestätigungen, neun explizite Referenzkorrekturen und 202 gebundene
Entitätsentscheidungen, null unbekannte Erwartungen. Die rohe OCR enthält
weiterhin neun geänderte E-Mails; nach Kontaktentscheidung sind die gemessenen
Privacy-Eingänge unverändert gegenüber der Referenz. Finale 310 sensible
Vorkommen enthalten keine bekannten Reste; keine verlorenen Fachanker/Sachwörter.
Sieben personengebundene DS-012-Anreden sind gezielt entfernt. 32 rohe OCR-
Privacy-Eingänge und 65 korrigierte/sonstige tatsächliche Privacy-Eingänge wurden
beobachtet; sieben automatische Publikationen benutzen den expliziten Markdown-
Fallback. Kein fataler Fehler, Workerende bestätigt, Quellenbindung unverändert.
Der unveränderte Qualitätscheck endet mit `QUALITY_FINDINGS_OPEN`, nicht grün.

66 fokussierte Qualitätsfälle plus echte Zweidokument-IPC-/Publikationsintegration,
23 Frontendfälle, 17 Markdown-Artefaktfälle und 46 Windows-Konvertergruppen
bestehen. Die vollständige Produktsuite besteht mit 201 Testdateien
(82 Basis- und 119 direkten Testdateien). Die Zweidokumentintegration verwendet kontrollierte Konvertertexte;
echte OCR erfolgt in Konvertersuite und Vollbenchmark. Synthetische Antworten
sind keine menschlichen Klicks oder Referenz-Doppelprüfung. Neue native Mac-
Ausführung und exakte Releasepaketbindung bleiben NOT_RUN. Build verweigert
uncommittierte Herkunft (`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`); ein neues
RC158-Plugin-ZIP liegt nicht vor. Kein Commit/Push/Tag/Prerelease, kein Umgehen
des Herkunfts- oder Qualitätsgates. BL-050.6 bleibt für Roh-OCR und unabhängige
inhaltliche/native Bedien-/Paketabnahme in Arbeit.

### Schnellere Standalone-Prüfliste vom 07.10.2026 (unveröffentlicht)

DS-104/BL-050.6 ergänzt die bestehende private Prüfung um eine durchsuchbare,
gefilterte Liste mit Checkboxen, ausdrücklichen Sammelaktionen und höchstens
50 gerenderten Zeilen je Seite. Nachgewiesen gleiche Personen-/Firmenschreibweisen
bleiben gruppiert; jedes Vorkommen hat seinen eigenen Original-/Markdown-Vergleich
und privaten Dateinamen. Keine automatische Vorauswahl oder pauschale Freigabe.

OCR-Kontakte mehrerer Dateien werden vor der eigentlichen Anonymisierung in
begrenzten Gruppen gesammelt. Korrekturen bleiben trotz identischer OCR-Lesart
datei-/fundstellengebunden. Die geschlossene Zuordnung wird vollständig geprüft,
bevor komplette authentifizierte Dokumententscheidungen gespeichert werden.
Bei Überlauf folgen weitere Gruppen im selben Fenster; nach einem Schreibfehler
werden nur schon vollständig gespeicherte Dokumente übersprungen. Sammlung
verlangt zusätzliche Quellenrekonstruktion, keine behauptete OCR-Beschleunigung.
Cowork, Haupt-Renderer und Quellen bleiben unverändert. Noch nicht übergebene
Entscheidungen der aktuellen Gruppe gehen bei Vertagen/Schließen verloren;
bestätigte vorherige Gruppen bleiben fortsetzbar erhalten.

Zwei unabhängige technische Prüfrollen revalidierten Backendbindung und Bedienung.
Zwei echte UI-Gegenbeispiele wurden korrigiert: Rückgängig setzt nun Editor,
Vorschau und gesendeten Wert gemeinsam zurück; verborgene/individuell entschiedene
Zeilen bleiben nicht unbemerkt in einer Sammelauswahl. 29 Frontendfälle, 15
Kontaktfälle, echte Zweidokument-IPC-/Publikation in beiden Zwecken, zehn
referenzgebundene Qualitätsauswerterfälle und 20 Native-Smoke-Integritätsfälle
bestehen. Der Browser-Gegenlauf mit echtem HTML/JS/CSS prüft zusätzlich beide
UI-Fehler, OCR-Livekorrektur, private DOM-Bereinigung, automatisches A11y und
390-Pixel-Reflow; IPC ist dabei synthetisch, keine native Bedienabnahme.

Die anschließende UX-Revalidierung des Anwender-HTML-Entwurfs übernimmt die
Listen-/Detailaufteilung, nicht dessen gebündelte Laufzeit, simulierte Bilder oder
Speicherzusagen. Nur eine zentrale Behandlungsauswahl mit explizitem **Auf N
Zeilen anwenden** trifft eine Vormerkung; rechts bleiben Original und Markdown
ohne zweiten Editor oder Entscheidungsleiste. Alle Zeilen bleiben standardmäßig
sichtbar. Ein fehlerhafter ausgewählter Korrekturwert stoppt die ganze Sammelaktion
mit Dateiname; unveränderte Bestätigung verwirft keine abweichende Eingabe.
Undo stellt auch ausstehende Eingaben wieder her. Eine Bearbeitung im Filter
**Vorgemerkt** öffnet die Zeile wieder, wechselt sichtbar auf **Alle** und leert
die Checkboxauswahl, ohne den Korrektureditor während der Eingabe zu verlieren.
33 aktuelle Frontendfälle und der erneute reale Browsergegenlauf bestehen
(kontrollierte IPC, A11y, 390–1920 Pixel, Datenschutzbereinigung). Die unabhängige
Read-only-Gegenprüfung fand keinen weiteren konkreten Fehler im Sammelablauf.

`preview:standalone:review` stellt ausschließlich eine feste Assetliste und
synthetische Daten auf `127.0.0.1` bereit; eine ausdrücklich gewählte HTML-Datei
kann separat gezeigt werden. Host-/Originprüfung und geschlossene Pfade bestehen
in `test:standalone:preview`. Die echte Darstellung wurde im eingebauten Browser
geöffnet und geprüft. Dies ist nur ein Entwicklungswerkzeug, kein Listener im
Produkt und kein Beleg für native Bedienung oder OCR-Qualität.

Der erste Gesamt-Goldenlauf fand zusätzlich einen inkonsistenten frühen
Abbruchumschlag: die neue Kontaktphase ließ `packages: []` weg. Es gab keine
Publikation, aber zwei echte Profil-/Produktgegenproben schlugen fehl. Der
Umschlag ist korrigiert und mit 29 Orchestratorfällen einschließlich beider
Lieferwege gegengeprüft; eine unabhängige Backendrolle bestätigt die Korrektur.
Der erneute echte Goldenlauf besteht in allen neun Fällen, einschließlich der
zuvor fehlgeschlagenen Bewerber-/Personalprofile. Die fehlgeschlagene erste
Messung wird nicht als PASS gewertet.
Der abschließende vollständige Produkttest besteht mit 84 Basis- und 119
direkten Testdateien (203 insgesamt). Dokumentations-/Linkverträge, strenge
installierte Claude-CLI-Validierung und `git diff --check` bestehen ebenfalls.

Die nach der Abbruchkorrektur erneut ausgeführte Vollmessung
`dist/quality-review-matrix-final-20261007/BERICHTE/QUALITAET.json`
bindet unveränderte Referenz `f841d0c73e1d1fca4ed999196373208c316f8d695fefda326f8deff9bb891b0f`.
72/72 Varianten konvertiert und final ausgewertet, 55 Kontaktbestätigungen/neun
ausdrückliche Referenzkorrekturen plus 202 Entitätsentscheidungen, keine unbekannte
Erwartung, kein fataler Fehler und Workerende bestätigt. Finale 310 sensible
Vorkommen enthalten keine bekannten Reste; kein gemessener Sachwort-/Fachanker-
verlust. Sieben personengebundene Anreden werden weiterhin gezielt entfernt.
Rohe OCR unverändert neun E-Mail-Abweichungen; `gate:quality` stoppt ausschließlich
mit `QUALITY_FINDINGS_OPEN`. Reale Konverter/OCR und Publikation, synthetische
Entscheidungen, kein menschlicher oder exakter Release-/Mac-Qualitätsnachweis.
Der frühere Matrixbericht bleibt als vorheriger Prüfschnitt erhalten und ist
nicht die Bindung des abschließenden Quellstands.

Die Paketprüfung ist auf die kombinierte Kontaktgruppe angepasst. Der zunächst
ausgeführte veröffentlichungsgebundene Cowork-`build` stoppte korrekt mit
`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`; `test:plugin-zip` fand kein neues
RC158-Plugin-ZIP. Dies ist kein Commitzwang für lokale Standalone-Testpakete:
`build:standalone:windows` und `build-standalone-package.mjs
--engineering-directory ...` können den aktuellen Arbeitsstand separat bauen.
Der Anwender wünscht zunächst ausschließlich diesen lokalen Windows-Test;
Main, veröffentlichte Downloads und macOS bleiben unverändert. Die zuvor
bereitgestellten Engineeringarchive enthalten die neue Liste nicht. Kein
Commit, Push, Actions-Start oder Release in diesem Umsetzungsschritt;
menschliche/native Mac-Abnahme und die neun bekannten Roh-OCR-Abweichungen
bleiben offen. Die nachfolgenden bisherigen Paketbelege gelten ausschließlich
für ihre jeweils genannten älteren Quellstände.

Der anschließende lokale Windows-Testbau ist abgeschlossen:
`dist/engineering-review-matrix-windows-20261007/DataSecure-Standalone-3.2.0-rc158-windows-x64.zip`,
SHA-256 `0d95c5e415dec59ac0a0dffe20f216ebb58ceecda818e16b5759284b5dee8c16`,
601 Einträge, 110.445.486 Bytes. Inventarprüfung und echter isolierter
Paketworkflow bestehen: beide Verarbeitungszwecke, reale Formatkonverter,
Person/Firma, Folgegruppen, laufweite Entscheidungen, exakter Fehlerdateiname,
OCR-Korrektur mit Originalpixelvergleich sowie Vertagen/Neustart. Der native
Windows-Starttest bindet dasselbe Archiv und bestätigt geladene Haupt-/Prüfseite
und erfolgreiche IPC (1.310,815 ms, 3.735.552-Byte-Hülle). Keine nativen
Prüfentscheidungen und keine Netzwerkbeobachtung in diesem Starttest behauptet.
Beide eigenen Testprofile wurden nach bestätigtem Prozessende entfernt;
ältere Testverzeichnisse bleiben unverändert. Das neue Paket wurde separat
unter `Downloads/DataSecure-Windows-Test-Pruefliste-20261007/` bereitgestellt,
mit unveränderter Versionsanzeige RC158 und ausdrücklich als lokaler Testbau.
`WINDOWS-TEST-EVIDENCE.json` neben dem Engineering-ZIP nennt Grenzen und Hashes.
Der Stand ist nicht committed; der Basiscommit ist keine vollständige
Quellstandattestierung. Kein Push/Release/Actions-Start, keine neue Mac-Abnahme.

Der folgende Windows-Testbau bindet nun auch die zentrale Sammelaktions-
Überarbeitung einschließlich des letzten Filter-/Eingabefokus-Fixes:
`dist/engineering-review-bulk-windows-20261007/DataSecure-Standalone-3.2.0-rc158-windows-x64.zip`,
SHA-256 `b032020e8d45996318b2f2aef2a059744ba69d64d6b6b3f5a3db59d1ce47b5ac`,
601 Einträge, 110.446.310 Bytes. Vollständiges Inventar und isolierter echter
Paketworkflow bestehen erneut, einschließlich beider Zwecke, kombinierter
OCR-Kontaktgruppen, Originalpixel, Folgegruppen, Vertagen/Neustart, Personen/
Firmen und konkreter Fehlerdateinamen. Nativer Haupt-/Prüfseitenstart und
erfolgreiche IPC desselben Archivs bestehen (1.271,148 ms,
3.736.064-Byte-Hülle, WebView2 154.0.4258.62, Windows 10.0.26200.0 x64).
Eigene isolierte Testprofile sind nach Prozessende entfernt. Browserabläufe der
endgültigen UI sind separat mit synthetischer IPC geprüft; keine nativen
menschlichen Sammelentscheidungen und keine Netzwerkbeobachtung behauptet.
Bereitgestellt in `Downloads/DataSecure-Windows-Test-Sammelaktionen-20261007/`,
mit `TESTSTART.txt` und `WINDOWS-TEST-EVIDENCE.json`; das vorherige Paket bleibt
unverändert. Weiterhin RC158-Anzeige, unveröffentlichter Arbeitsstand, kein
Commit/Push/Release/Actions und keine neue Mac-Abnahme. Die neun rohen
OCR-E-Mail-Abweichungen und damit das rote Qualitätsgate bleiben offen.

Die technische Abschlussprüfung dieses Arbeitsgangs besteht: `test:product`
(84 Basis- plus 119 direkte Testdateien), `test:docs`, strikte lokale
Claude-CLI-Strukturprüfung sowie `git diff --check`. Die Produktsuite begann
vor dem letzten reinen UI-Filter-/Fokus-Fix; dieser endgültige Frontendstand
wurde anschließend separat mit allen 33 Frontendfällen und der vollständigen
Browserkampagne geprüft und vor Archivierung nochmals nativ kompiliert.
Die rote inhaltliche Qualitätsmessung ist damit ausdrücklich nicht aufgehoben.

### Native-/Paketgegenprüfung vom 06.10.2026 (Engineering-Testbranch)

Der Anwender hat ausdrücklich den separaten Branch
`codex/ocr-contact-native-revalidation-20261006` und genau die vorhandenen
macOS-Engineering-Workflows für Intel/Apple Silicon freigegeben, auch bei rotem
Roh-OCR-Gate. Main, veröffentlichte Archive und Releases bleiben unverändert.
Die früheren lokalen Aussagen „kein Commit/Push“ beschreiben ihre damaligen
Prüfschnitte, nicht diese neue Engineering-Freigabe.

Die erneute Vollmessung
`dist/quality-contact-native-final-20261006/BERICHTE/QUALITAET.json` bindet
zusätzlich die tatsächlichen Konverter-/Modell-/Addonbytes. 72/72 Ausgaben nach
synthetischer Prüfung, 310 sensible Vorkommen ohne bekannte finale Reste,
keine verlorenen Sachwörter/Fachanker, 55 Kontaktbestätigungen/neun explizite
Referenzkorrekturen und 202 Entitätsentscheidungen; Roh-OCR weiterhin neun
geänderte E-Mails. Workerende und unveränderte Quellen sind bestätigt;
`gate:quality` meldet ausschließlich `QUALITY_FINDINGS_OPEN`. Das ist keine
menschliche Referenz- oder allgemeine Genauigkeitsabnahme.

Der größere offizielle `tessdata_best`-Kandidat ist nach echten Pixelgegenproben
verworfen: zwei alte Fehler korrigiert, 17 neue eingeführt, insgesamt 24 statt
neun falsche E-Mails sowie höherer Zeit-/Speicherbedarf. Modell-/Referenzbytes
bleiben unverändert. Provenienz und Vergleich stehen in
`dist/ocr-best-probe-20261006`; Details im Detektorbenchmark.

Windows-Engineering-ZIP:
`dist/engineering-ocr-contact-final-20261006/DataSecure-Standalone-3.2.0-rc158-windows-x64.zip`,
597 Einträge/110430390 Bytes, SHA-256
`c1e84fa3f9831fd1d9940f2f7090350227b8e37d7b70d664f2c3cb371e524562`.
Verifier und echter paketierter Gesamtworkflow bestehen einschließlich
gemischter Formate, passiver PDF/PPTX-Inhalte, konkreter CSV-Fehlerdatei,
Person/Firma, Folgegruppe, Vertagen/Neustart und laufweiter Entscheidungen.
Neu werden zwei tatsächliche PNG-OCR-Dateien mit ausdrücklich unterschiedlichen
Kontaktkorrekturen geprüft. Erst beide Kontaktprüfungen, danach Entitätsprüfung:
beide geänderten Werte müssen vor und nach Neustart im tatsächlichen
Privacy-Eingang stehen. Vollständige Ausgabeprüfung lehnt zusätzliche Inhalte
und Kontakte ab; Testcleanup ist bestätigt. 20 Orakel-/Native-Smoke-Gegenfälle
bestehen; die native Bedienkampagne `--prepare-ocr` bleibt ohne echte Bedienung
NOT_RUN und beschreibt diese Reihenfolge in drei Anwendungssitzungen.

Nativer Windows-Start desselben ZIPs bestätigt Haupt-/Prüfseitenladung und
erfolgreiche korrelierte IPC (1219,926 ms; WebView2 154.0.4258.53,
Windows 10.0.26200.0 x64), keine menschlichen Entscheidungen. Ein vorheriger
Start desselben Archivhashes beobachtete keine TCP-/UDP-Endpunkte im Messfenster;
der jüngste strenge Netzlauf endete dagegen mit
`STANDALONE_NATIVE_NETWORK_ENDPOINT_UNATTRIBUTED`. Er ist kein PASS und kein
nachgewiesener DataSecure-Netzwerkzugriff. Der getrennte erfolgreiche IPC-Lauf
weist `network_observed:false` aus; seine Netzwerte sind unbewertet.
Der anschließende vollständige Wiederholungslauf mit unverändertem Archiv
und unveränderten Netzguards besteht (1792,382 ms, zehn zugeordnete Prozesse,
keine TCP-Listener oder UDP-Endpunkte im Messfenster, 918 eigene Einträge
bereinigt). Die vorherige unklare Beobachtung wird dadurch nicht zum PASS
umgeschrieben; dies ist ein begrenzter Beobachtungsnachweis, keine allgemeine
Netzwerk- oder Bediengarantie.
Der erste Mac-Workflow `37458613608` auf Quellcommit `458bd106…` stoppt auf
beiden Architekturen im neuen Kontakt-Store-Test: die Testfixture verwendet den
nicht kanonischen macOS-TEMP-Alias. Der Produktguard lehnt dessen umgeleiteten
Vorfahr korrekt als `PRIVATE_ARTIFACT_ROOT_INVALID` ab. Die Fixture löst TEMP
nun vor dem Anlegen auf; der Produktguard bleibt unverändert. Die 16
Migrationstests bestehen bereits nativ auf beiden Architekturen. Bundlebau,
nativer Appstart und Mac-Paketworkflow wurden in diesem fehlgeschlagenen
Versuch nicht erreicht; native Mac-Resultate stehen bis dem korrigierten
Workflowabschluss aus.
Im zweiten Versuch `37459238369` (`a1be843a…`) bestehen die 13 Kontaktverträge
und der tatsächliche kontrollierte Kontakt-/Resume-/Publikationspfad auf
beiden Mac-Architekturen. Danach scheitert ein alter Paket-Strukturtest, der den
Neustartcode noch inline statt in der inzwischen gemeinsam von Entitäts- und
OCR-Szenario verwendeten Closure erwartet. Derselbe Fehler ist lokal auf
Windows reproduzierbar. Der Test prüft nun beide gebundenen Aufrufe sowie
Shutdown, bestätigtes Ende, echten Prozessstart und Transport-Neubindung.
Er wird zusätzlich in jedes allgemeine Produktgate aufgenommen; zuvor war
er nur über `test:standalone` erreichbar. Die frühere grüne 201-Dateien-Suite
hat ihn deshalb nicht abgedeckt. Der unabhängige Gegenreview findet zusätzlich
eine fehlende Fixture-Elternanlage im frischen Source-Checkout ohne `dist/`;
dieser bekannte Elternordner wird nun ohne Löschen bestehender Inhalte
angelegt und auf Link-/Pfadumleitung geprüft. Die erweiterte Gesamtsuite
`dist/product-contact-native-macos-fixture-20261006.log` besteht mit 202 Dateien
(83 Basis + 119 direkte); die elf aktualisierten Paketverträge einschließlich
der zusätzlichen echten Leerer-Checkout-Fixture bestehen separat. Beide fehlgeschlagenen
Mac-Versuche ersetzen keinen Bundle-/Paket-/nativen Appnachweis.

Der dritte Engineering-Lauf
[37460941660](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37460941660)
bindet Quellcommit `86b9f757caf1b7df8731d787d007c9b77dde88da`. Apple Silicon
(`macos-14`) und Intel (`macos-15-intel`) bestehen den vollständigen Workflow:
jeweils 47 native Rust-Tests,
Clippy ohne Warnungen, echte Supervisor-/Abbruchgegenfälle, 44 reale
Konvertergruppen und zwei ausdrücklich nicht als PASS gezählte Windows-
Spezialfälle, Appbau und Ad-hoc-Signatur-/ABI-Prüfung. Haupt- und Prüfseite
antworten erfolgreich über die korrelierte private IPC; das gebaute Bundle,
entpackte ZIP (direkter Start und LaunchServices) und gemountete DMG werden
nativ gestartet und ordentlich beendet. Das ZIP entsteht zweimal bytegleich.
Der tatsächliche Paket-Sidecarpfad besteht gemischte Konvertierung, konkrete
CSV-Fehlerdatei, passive PDF/PPTX-Inhalte, Person/Firma, Folgegruppen,
laufweite Entscheidungen sowie den oben beschriebenen echten PNG-Kontakt-
Korrektur-/Neustartpfad mit vollständiger Ausgabeprüfung. Dies sind reale
Prozess-/IPC-Tests, keine menschlichen Reviewklicks.

Apple-Silicon-ZIP: 599 Einträge/115321882 Bytes, SHA-256
`bdb85166368c4106e38b40a7931fc67dba8bb8a79f955ff132b7a86210e278ca`;
DMG: 112246366 Bytes, SHA-256
`a64427bf195ba7b5b0301201d3d6c40b139b01a9881adf31958317df8030e677`.
Beide Dateien und Prüfsummen sind lokal unter
`dist/engineering-macos-ocr-contact-20261006-37460941660/macos-arm64/`
gesichert. Intel-ZIP: 599 Einträge/118613725 Bytes, SHA-256
`57671b4ea67c382a6f051634f2ac7b8c363d200277d54195507cf70e1fd61b38`;
DMG: 116139306 Bytes, SHA-256
`62785e15f20b6185193af87e1f2f1b15f1cec5b63edaa569157bd2d3ccb60902`.
Intel-Dateien sind im parallelen `macos-x64/`-Unterordner gesichert.
ZIP-Inventar-/Mach-O-Verifier und DMG-Hashvergleich bestehen für beide
Architekturen auch nach dem Download. Die vollständigen Läufe stehen lokal
in `dist/macos-ocr-contact-37460941660-{arm64,x64,complete}.log`.
Ad-hoc-Signierung ist keine Apple-Notarisierung. Menschliche Gatekeeper-/
Finder-/VoiceOver-/Kontaktfeldabnahme, die 72-Varianten-Qualitätsmessung am
exakten Mac-Archiv und allgemeine OCR-Genauigkeit sind damit nicht belegt.
Die lokalen Kontakt-, Paket- und Testpfadverträge bestehen zusätzlich unter
dem tatsächlichen gepinnten Node 22.23.2, nicht nur dem Engineering-Host-Node.

Cowork-Build/Plugin-ZIP bleiben im unreinen Quellbaum wegen Herkunftssperre
beziehungsweise fehlendem neuen Archiv nicht bestanden; keine Umgehung.

#### Zusätzlicher Datei-ID-Gatebefund (BL-010.52)

Die erneute Gesamtsuite traf einen echten Windows-Gegenfall der historischen
Input-Migration: zwei verschiedene Datei-IDs `9570149209941131` und
`9570149209941132` kollabierten als JavaScript-Number. Dadurch wurde eine fremde
sichtbare Datei irrtümlich als bereits vorhandener Recovery-Hardlink bewertet.
Alle Identitäts-Stats dieses Moduls verwenden nun exakte BigInts; Number-
Identitäten werden ausdrücklich abgelehnt, begrenzte Leselängen bleiben durch
den bestehenden Held-Reader validiert. Ein unabhängiger Read-only-Gegenreview
bestätigt die echte erhaltene Dateisystem-Gegenprobe und alle Lock-/Owner-/
Recovery-Stat-Aufrufe. 16 Migrationstests einschließlich exakter 64-Bit- und
echter FS-Identität bestehen; dieser Test gehört jetzt zusätzlich zum
freigegebenen Mac-Workflow. Keine historischen Anwenderdaten wurden verändert.

Das abschließende integrierte Produktgate besteht mit 201 Testdateien
(82 Basis + 119 direkte), Docs-/Link-/Versionsprüfung, strenger lokaler
Claude-Strukturprüfung und `git diff --check`. Der isolierte Windows-Build,
Paketverifier, echte Paketworkflow und native Seiten-/IPC-Starts sind separat
oben gebunden. Das ist der begrenzte Engineering-Nachweis, keine Aufhebung des
weiterhin roten Roh-OCR-Gates und keine neue Releasefreigabe.

## Entstehungs- und Nachweischronologie

Die folgenden lokalen Zwischenstände und damaligen offenen Punkte sind historisch;
maßgeblich ist der aktuelle Veröffentlichungsstand oben.

Alle RC151-Pakete binden den sauberen Quellcommit
`fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3`. Die Pflicht-CI und zwei
bytegleiche, nativ gestartete PKG-04-/INT-13-Archive bestanden; der ZIP-Hash ist
`5108d3957c4987088519cf26ce2c5aba4df5611f9f993aa17c027ab1a82230c7`.
Standalone-macOS wurde auf Intel und Apple Silicon als ZIP und zusätzlich DMG
nativ geprüft ([Lauf 36618883915](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618883915));
das Linux-AppImage-ZIP bestand seinen nativen Start
([Lauf 36618884302](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618884302)).
Die drei Cowork-Normal-ZIPs bestanden ihre nativen Zielplattform-Smokes
([Lauf 36618886944](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618886944));
Windows-Normal und -Debug sind an die leere UAT-Vorlage gebunden
([Lauf 36618887161](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618887161)).
Der Anwender hat RC151-Standalone auf Windows mit dem entpackten 140-Dateien-
Root in beiden Modi ausgeführt. Die Ausgaben enthalten 140 Markdown-Konvertate,
140 anonymisierte Markdown-Ergebnisse und eine Zuordnung mit 140 Einträgen;
schreibgeschützt geprüfte Quellhashes, Sollstellen und Fachtexte stützen den
positiven Funktionsbefund. Damit ist der vollständige Windows-Gesamtlauf nicht
mehr offen. Für die formale N3/N4-Freigabe fehlen noch andere, genau benannte
Teilfälle und Rollenprotokolle; `NOT_RUN` in den leeren UAT-CSV darf nicht als
„RC151 läuft unter Windows nicht“ gelesen werden. Mac-Finder-/Gatekeeper-,
Linux-Desktop- und Cowork-Modellabnahmen werden durch den Windows-Lauf nicht
ersetzt. Die nachfolgenden älteren lokalen Befunde beschreiben die Entstehung
des Kandidaten und sind durch die aktuelle Evidence einzuordnen.

Neue, noch **nicht** in RC151 enthaltene Produktentscheidung DS-104/
BL-010.44: Standalone soll die bislang separat gestartete lokale
Stapelprüfung als App-eigenes, berechtigungsarmes Reviewfenster führen. Ein
erster lokaler Implementierungsstand enthält die getrennte Fenster-Capability,
flüchtig begrenzten Review-Broker, genaue Fundstellenanzeige und explizites
Fortsetzen; Quell-, Renderer-, IPC- und Rust-Tests bestehen. Im ersten
RC152-Windows-Anwenderlauf blieb das nach Neustart geöffnete Prüffenster weiß,
während der Lauf im Verlauf weiter „Prüfung nötig“ zeigte. Der Fensterbau lief
entgegen der Tauri-/WebView2-Vorgabe in einem synchronen Befehl. Im lokalen
RC153-Kandidaten ist er asynchron. Der sichtbare Windows-Anwenderlauf
`9daa6c66` erreichte nach mehreren Prüfgruppen 140/140 anonymisierte
Ergebnisse und eine Zuordnung. Das Prüffenster blieb danach fälschlich mit
einem Wartetext offen. RC154 erkennt nun den tatsächlichen terminalen
Laufstatus und schließt erst dann automatisch; zusätzlich gibt es einen
sicheren Schließen-Button. Der erneute sichtbare Test dieses geänderten
Kandidaten sowie weitere Zielhost-/Accessibility-Abnahmen stehen noch aus.
Die RC154-Rückmeldung zeigte zusätzlich: Nach einer bestätigten Gruppe
braucht derselbe Lauf manchmal eine weitere Core-Prüfphase. Bislang musste
sie über den Verlauf gestartet werden. Lokal ist nun im weiterhin offenen
Prüffenster ein Wartezustand mit **Weitere Prüfung fortsetzen** ergänzt;
der private Befehl ist an den zuletzt dort beantworteten Lauf gebunden.
RC155 wurde lokal als Windows-ZIP gebaut; Standalone-, Dokumentations-, Rust-
und Paketprüfungen sowie der native Start mit geladener Prüfseite bestanden.
RC156 ist ebenfalls nur lokal als Windows-ZIP gebaut: Der mehrdeutige globale
Prüfbutton wurde dem aktiven Lauf zugeordnet, ein wartendes Prüffenster zeigt
einen Arbeitsindikator, und der Verlauf hat keinen Identitäts-Löschbutton mehr.
Die lesbare Identitäts-TXT wird im markierten vertraulichen Lauf-Unterordner
publiziert; private Snapshots bleiben getrennt. Paket-/Sidecar-Smoke und
nativer Windows-Start bestanden. Der Anwender bestätigte am 30.09.2026 den
erfolgreichen RC156-Lauf einschließlich lokaler Prüfung und Stapelverarbeitung.
Der letzte Ergebnislauf `Lauf-20260930-192338-ca4349c5` enthält nach nur lesender
Kontrolle 140 Markdown-Dateien, 140 eindeutige Dateizuordnungen und die
vertrauliche Identitäts-TXT im Lauf-Unterordner. Deren Vollständigkeitshinweis
nennt 140/140 erfasste Ergebnisdateien und 0 nicht eindeutig zuordenbare
Pseudonymstellen. Dies bestätigt den Windows-Funktionslauf; ein neuer
vollständiger Inhaltsvergleich war nicht Teil dieser Kontrolle.
RC157 ergänzt für den aktuellen Lauf **Jetzt prüfen** direkt in der
Verarbeiten-Karte. Der Button setzt den verbundenen Lauf fort und öffnet
das Prüffenster ohne Umweg über den Verlauf. Nach einem Verbindungsneustart
darf diese Aktion keinen anderen historischen Lauf auswählen. Der lokale
RC157-Windows-ZIP bestand die Paketprüfung, reale isolierte Sidecar-Läufe
und den nativen Start mit geladener Prüfseite. Die direkte Prüfaktion samt
Fehler- und Doppelstartpfad ist gezielt getestet. Der Anwender bestätigte
anschließend RC157 einschließlich lokaler Prüfung als vollständig bestanden.
Der Ergebnislauf `Lauf-20260930-195144-3d6b69b7` enthält nach nur lesender
Kontrolle 140 Markdown-Ergebnisse, 140 Dateizuordnungen und die vertrauliche
Identitäts-TXT mit Vollständigkeitshinweis 140/140. Dies ist ein bestätigter
Windows-Funktionslauf, keine neue vollständige semantische Inhaltsprüfung.
„Später entscheiden“ bleibt erhalten; die betroffene Verlaufszeile erlaubt
„Prüfung fortsetzen“ nach automatischem Lauf, App-Neustart und anderen
Aufgaben. Haupt-Renderer und Cowork-Adapter bleiben getrennt; dieser
damalige Zwischenstand allein war kein Zielhost- oder Release-Nachweis.

BL-010.45 ist lokal als Standalone-only-Prototyp implementiert: Erkannt eindeutige
Personen-, Unternehmens- und Projektpseudonyme erhalten eine private
menschliche Originalwert-Zuordnung. Eine einzelne Personenkennung war nur ein
Beispiel. Die bisherige `DataSecure-Zuordnung.csv` verknüpft weiterhin Dateien;
private Einzelsnapshots liegen im App-Datenbereich; die lesbare vertrauliche
TXT-Datei wird zusätzlich in `VERTRAULICH-NICHT-HOCHLADEN` innerhalb des
Lauf-Ergebnisordners abgelegt. **Der gesamte Laufordner ist deshalb nicht für
einen KI-Upload geeignet.** Die letzten 20 Läufe sind über den expliziten Verlaufsklick
zu öffnen; für ältere Zuordnungen öffnet eine Einstellungsaktion den privaten
Ordner lokal im Betriebssystem.
Generische Masken haben keine 1:1-Rückabbildung; fehlende Snapshots und
Pseudonyme ohne eindeutige Herkunft erscheinen als unvollständig. Keine
automatische Löschung und kein App-Löschbutton; eine manuelle Löschung ist
über das Betriebssystem möglich. Eine zusätzliche Verschlüsselung der lokalen Datei besteht
noch nicht. Lokale JS-/Rust-Verträge und RC152-Windows-Paket-Smoke liegen vor,
aber noch kein sichtbarer Zielhost- oder Realformat-Abnahmenachweis.

Lokaler RC149-UAT-Nachtrag BL-010.42: Ein 140-Dateien-Korpus ergab 138
anonymisierte Ergebnisse und zwei sicher gestoppte DOCX. Die technischen
Tabellenwerte „Service Level“ und „Fail Closed“ waren zuvor nur als
unlokalisierbare mögliche Personennamen erfasst. Einfache Zellen in Tabellen
ohne sensibles Identitätslabel erhalten jetzt positionsgebundene lokale
Prüffundstellen; eine menschliche Entscheidung kann den Lauf fortsetzen,
ohne unbekannte Wörter global freizugeben. Wiederholt identische
Rest-Personenkandidaten desselben Typs werden innerhalb einer aktuellen
Prüfgruppe nur einmal abgefragt, aber an jeder Fundstelle separat verifiziert.
Die Dateidetailansicht übergibt nun den optionalen `batchId`-Parameter
ausdrücklich; die privaten Journalnamen sollen damit auch beim aktuellen
abgeschlossenen Lauf erscheinen. Der erneute Vollkorpusnachweis ist mit RC151
auf Windows erfolgt; die sichtbare Einzelentscheidung im Review bleibt ein
eigener Bediennachweis. RC149-ZIP enthält diese Änderungen nicht.

Lokaler Nachtrag BL-010.41 zum RC147-Zielhostlauf: Die fünf gestoppten
PowerPoints hatten teils passive OLE-/PowerPoint-Metadaten, teils intern
verknüpfte XLSX-Tabellen. Standalones Markdown-first-Admission lässt nun
gezielt bekannte interne Beziehungen zu; eingebettete XLSX werden vor der
Zellübernahme selbst als OOXML geprüft. Die fünf echten lokalen Quellen
bestehen die neue Strukturprüfung und liefern Markdown im gepackten isolierten
Parser. Ein synthetischer PDF-/PPTX-Paketbatch einschließlich XLSX-Einbettung
lieferte drei anonymisierte Markdown-Ergebnisse samt Zuordnung. Die fünf
Benutzerdateien wurden noch nicht durch die Anonymisierung geführt; eine
Freigabe des vollständigen PPTX-Inhalts ist daraus nicht abzuleiten. XLSX
bleibt direkt Markdown-first; ein CSV-
Zwischenschritt wäre für mehrblättrige Mappen verlustbehaftet. Diese
Standalone-Änderung erweitert Coworks getrennte Formatgrenze nicht.

Vor RC151 lokal vorbereiteter Standalone-Nachtrag BL-010.37: Eine vor
`Starten` vorbereitete Auswahl kann über Datei-/Ordnerpicker oder Drop ergänzt
werden. Doppelte Quellen werden übersprungen; ungültige oder zu große Nachträge
lassen die bestehende Queue unverändert. Nach `Starten` gehört Neues in einen
eigenen Lauf. Automatisierte Prüfungen und ein lokaler Windows-Kandidat wurden
vor der sichtbaren Benutzerabnahme durchgeführt. Die Änderung ist
in den getrennten RC151-Standalone-Paketen gebunden; das Cowork-Paket folgt
seinem eigenen, engeren Produktvertrag.
BL-010.38 trennt zusätzlich einen abgeschlossenen Lauf von der Vorbereitung
des nächsten. Der RC143-Zielhostbefund mit sieben sicher gestoppten PDFs ist
auf das bisherige `PDF_OBJECT_COVERAGE_UNVERIFIED`-Gate zurückgeführt.
DS-103/BL-010.39 führt jetzt auch Standalone-PDF/PPTX über die bereits
gebündelte passive Markdown-Extraktion in die nachgelagerte Anonymisierung.
Die Quellabdeckung bleibt ausdrücklich unvollständig; unsichere Quellen
stoppen weiter. Abschlussansicht, bewusste Rücksetzung, Warnanzeige und
dieser Privacy-Übergang sind mit den RC151-Standalone-Paketen gebunden. Der
erneute 140-Dateien-Windows-Lauf belegt den positiven Gesamtpfad; einzelne
Negativ- und Bedienfälle bleiben für die formale Abnahme gesondert offen.
BL-010.40 ergänzt den RC144-Zielhostbefund 11/12: Die lokale Reviewphase
startete, doch ein sichtbares Prüffenster war nicht nachweisbar, während der
interaktive Prozess weiterlief. RC145 startet nur diesen Dialog ohne versteckten
Top-Level-Start und erklärt im Standalone-Status den Reviewbedarf. „Neue Aufgabe
wählen“ ist in der gemeinsamen Navigation aller Ansichten verfügbar und nennt
bei einem aktiven Lauf den Sperrgrund, statt einen Klick stumm zu ignorieren.
Der lokale Windows-Paket-Smoke und die automatisierten UI-/Reviewtests bestehen.
Im sichtbaren Windows-Test erschien das Prüffenster und der Stapel endete mit
11 anonymisierten Ergebnissen sowie einer sicher gestoppten Datei; das belegt
den interaktiven Abschlussweg, nicht die Freigabe aller 12 Quellen. Der Test
zeigte zugleich eine Verwechslungsgefahr bei zwei gelben Stellen: Die aktive
Entscheidung war nur als „Stelle 2 von 2“ benannt, obwohl ein anderer Name
bereits automatisch anonymisiert war. Die lokale Quelländerung zeigt deshalb
den exakten aktuell zu entscheidenden Text und hebt ihn in beiden Ansichten
gold hervor. Der lokale RC146-Windows-Testbau aus diesem Quellstand besteht
Paket-, isolierte Sidecar-, Konvertierungs-, Privacy- und Verlauf-Smokes. Der
reale Sichttest der neuen Entscheidungsleiste steht noch aus. Weder RC145 noch
RC146 ist veröffentlicht oder an einen sauberen Quellcommit gebunden.

## RC141 – veröffentlichter, nativ geprüfter Standalone-Mac-Kandidat

Intel und ARM binden Quellcommit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`.
Pflicht-CI `35875614129` und beide Architekturjobs `35875613438` bestehen.
Die ZIPs sind je Architektur zweimal bytegleich aus demselben kompilierten
Bundle erzeugt und nach dem Entpacken direkt sowie über LaunchServices
gestartet. Echte gebündelte Konvertierung/Anonymisierung, Zuordnung, Fehlerfälle
und Verlauf nach Neustart bestehen; kein Converter-/Worker-Mock. Lokaler
Download und erneute Paket-/Prüfsummenprüfung sind abgeschlossen.
App und Supervisor deklarieren jetzt korrekt minOS 13.5; alle übrigen nativen
Komponenten liegen darunter. Reale Ausführung auf 13.5, sichtbarer
Browser-/Finder-/Gatekeeper-Fresh-Install und N3/N4 bleiben offen.
[Exakte Pakete und Hashes](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Kein neuer gemeinsamer Release: Standalone Windows/Linux und Cowork bleiben bei
ihren veröffentlichten RC140-Paketen. Der
[dauerhafte RC141-Mac-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
bindet exakt den genannten Buildcommit; beide ZIPs und ihre Prüfsummendateien
stimmen mit den lokal geprüften Bytes überein. Der Mac-Sammelreview-Fix ist im Standalone-Paket enthalten;
Cowork-Auslieferung und sichtbare AppKit-Abnahme bleiben getrennte Restarbeit.

## RC140 – veröffentlichter technischer Produktkandidat

**Mac-Nachreview MAC-20260923:** Veröffentlichte Standalone-RC140-ZIPs enthalten
einen Supervisor mit minOS Intel 15.0 / ARM 14.0 trotz deklarierter 13.5. Sie
sind daher kein 13.5-Kandidat. Deployment-Target, vollständige native
Signatur-/Bibliotheksprüfung, numerische Plist-Versionen sowie LaunchServices-
und echte Beide-Modi-Paketsmokes sind im Quellstand nachgezogen und für RC141
oben nativ belegt und dauerhaft veröffentlicht. Der gemeinsame Mac-Reviewadapter
beider Produkte partitioniert zusätzlich bei 1000 Fundstellen und meldet
technische Fehler nicht mehr als „Später“. BL-010.20 ist technisch neu belegt;
BL-012.9 wartet noch auf Cowork-Lieferung und sichtbare AppKit-Abnahme.
Bestehende Release-Bytes und menschliche Abnahmestände bleiben
unverändert; Details im [Reviewbericht](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#mac-20260923--vollständiger-macos-paket-und-installationsnachreview).

**Quell- und Paketstand 23.09.2026:** [PH-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md)
führt die gemeinsame Roottrennung einschließlich zukünftiger historischer
Reservierungen (BL-041.19), den vorbereiteten 14-Fälle-Claude-Code-Pilot
(BL-041.20) und ausdrücklich bestätigte Wiederverwendung fertiger Cowork-Stapel
ohne neue Anonymisierung (DS-101/BL-041.21). BL-050.4 prüft alle 16
Härtetestdateien bis zum Export in beiden Zwecken; die dabei gefundenen
Erkennungs-/Fachwortdefekte werden über End-to-End-Gegenfälle abgesichert.
Der Härtetest prüft nach BL-021.3/4 16 Konvertate und 16 anonymisierte
Ausgaben nach explizitem lokalem Titel-/Personenreview. Unklare Restkandidaten
werden nicht automatisch freigegeben:
Textfassung und konkrete Fundstelle binden die lokale Entscheidung; alle
unabhängigen direkten Identifierprüfungen bleiben erhalten. BL-021.4 verhindert
die vorgelagerte feste Bindung konkurrierender technischer Versalientitel als
Person/Kunde/Projekt; Fachanker prüfen ihren Erhalt unabhängig vom Dateierfolg.
Reviewpositionen sind für CRLF-/gemischte Tabellen, vollständig erhaltene
wiederholte Fragmente und kanonische Konverterdarstellungen nachgehärtet.
Sichtbare escaped HTML-Beispiele bleiben auch bei wiederholter Verarbeitung
erhalten; echte HTML-Tags und entitycodierte Identifier werden weiterhin geprüft.
Absatzgrenzen verhindern künstliche Beschäftigungsbeziehungen zu vorherigen
Hinweisen, während echte Namens-Softwraps geschützt bleiben.
Die Standalone-Oberfläche ergänzt ausschließlich Hinweise zu Ordnernamen/
Zuordnung; Navigation, Zwecke und Produktgrenzen bleiben erhalten. Die gemeinsamen
Root- und Privacy-Korrekturen wirken auch in ihrem Verarbeitungskern und sind
deshalb durch Standalone-Gegenregressionen abgesichert. Kanonwidersprüche zu Aufnahme,
Office-Freigabe und produktweiser Commitbindung sind korrigiert.

Der vollständige lokale Produkttest nach der Review-Erweiterung besteht mit
186 Testdateien (67 Basis + 119 direkte Tests), einschließlich beider
Produktprojektionen und nativer Windows-Prozessgrenzen. Die aktualisierten
Docs-/Versions-/UAT-Verträge bestehen mit 101 Entscheidungen, 24 Epics und
109 Stories. Der reale 16+16-Härtetest wurde erneut erfolgreich ausgeführt.
Ein identischer atomarer Reservierungsaustausch zwischen Prüfung und Öffnen ist
inzwischen mit echtem Kindprozess reproduziert und korrigiert (43 Rootfälle).
Die frühere sporadische Beobachtung ist damit nicht rückwirkend eindeutig
zugeordnet. Die menschlichen Zielhost-/Modell-/N3-/N4-Abnahmen bleiben offen.

Der vollständig gelesene externe Referenzstand `vectranetworks/anonym`
(`bc464647…`, 44 Dateien) ist als VECTRA-20260923 im Reviewbericht verankert.
Übernommen wurde ausschließlich ein kleiner realer CSV-Integrationsgegenfall
mit eingebetteten JSON-Skalaren (12 CSV-Fälle; 40 vorhandene Registryfälle).
Keine fremde Engine, neue Produktionsabhängigkeit, zusätzliche Formatfreigabe,
Importoberfläche oder kostenpflichtige Modellprüfung. Beide Produkte nutzen
weiterhin denselben typisierten Kern; reine Markdown-Konvertierung bleibt
inhaltserhaltend und getrennt von der Anonymisierung.

RC140 bindet beide Produkte an Commit `814bc50e3d754224cd95b6fa91f122dd45f48487`
und den [Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140).
Standalone-Windows bestand PKG-04/INT-13 mit zwei bytegleichen Bauten und
beiden nativen Smokes. Mac-Intel/-ARM (`35864636481`) und Linux (`35864697349`)
bestanden native Paket-, ZIP- und Konvertierungsprüfungen; Cowork auf Windows,
Intel-Mac und ARM-Mac bestand `35864685584`, der getrennte Windows-Normal-/Debug-/UAT-Lauf
`35864624729`. Alle 15 Release-Assets wurden gegen lokale Bytes geprüft;
Pflicht-CI `35864600808` ist grün. Das belegt keine Finder-/Gatekeeper-
Installation, keine macOS-13.5-Ausführung und keine menschliche Modell-/N3-/N4-
oder Produktionsabnahme. Die folgenden RC139-/RC137-Abschnitte sind Historie.

Claude Code wurde lokal mit dem
offiziellen Updater von 2.1.267 auf 2.1.280 aktualisiert; der Pilotvorcheck besteht
(Minimum 2.1.273). Die CLI ist nicht angemeldet. Der lokale Code-Reiter in Claude
Desktop ist als gesondert zu belegende Oberfläche vorgesehen. Modelltests dürfen
ausschließlich enthaltene Claude-Abonutzung verbrauchen, keine API-/Zusatzkosten.
Desktop-Abrechnungsweg und Werkzeuge sind noch nicht geprüft;
Sichtbare Host-/Modell-/N3-/N4-Abnahme bleiben offen.

## RC139 – veröffentlichter Cowork-Kandidat

RC139 liefert BL-041.15–.18 und `ASTRA2-20260912-01`–`04` aus Quellcommit
`46c6fec4722c879989f5c8e3059367241c117c3a`. Normal/Debug/UAT, beide Mac-Zielpakete,
SPDX und Prüfsummen sind im [RC139-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc139)
veröffentlicht. Pflichtlauf `34701892871` und Dreiziel-Paketlauf `34701897963`
sind grün; exakt die normalen Release-ZIPs bestanden die nativen Smokes auf
Windows x64, macOS Intel und ARM64. Die vollständige lokale Produktsuite bestand
mit 182 Testdateien. Windows-Normal und -Debug wurden jeweils zweimal bytegleich
gebaut und beide Bauten nativ geprüft. Das normale ZIP stimmt auch bytegenau
mit dem Workflow-Archiv überein; die UAT-Vorlage bindet exakt diese Releasebytes.
Alle sieben Upload-Digests stimmen mit den lokalen Artefakten überein. Die
Versionsmetadaten im gemeinsamen Repository werden synchron fortgeschrieben;
Standalone-Funktionen und seine veröffentlichten RC137-Binaries bleiben unverändert.
Die finale Mehrplattforminventur bindet alle Produkt-ZIPs an denselben Commit,
ohne die Windows-UAT-Vorlage als Mac-Ausführungsnachweis zu behandeln.

## RC138 – Cowork-Revalidierung nach RC137

Der Herstellerabgleich mit drei unabhängigen Reviews korrigiert die
Statusprojektion, ACK-Ungewissheit, native Auswahlabbrüche, paginierte
Übergabesprache, terminale Ordnerwechsel und ungültige MCP-Hüllen. Die lokale
Stapelwahl zeigt zusätzlich den Abschlusszeitpunkt. Befunde und Tests sind
unter `CWR-20260912-01` bis `CWR-20260912-11` im
[Herstellerreview](../REVIEW_CLAUDE_COWORK_2026-09-01.md) festgehalten.
Die Standalone-Verarbeitung und Erkennungsregeln werden nicht geändert.

### Nachträglicher unabhängiger Astra-Gegenreview

Der am 12.09.2026 nach Veröffentlichung durchgeführte read-only Gegenreview
bestätigte vier E0-Defektgruppen: Eine asynchrone Ergebnisübergabe kann
nach Cancel mit einer nachfolgenden Auswahl vermischt werden; strukturierte
Angaben zur Extraktionsabdeckung gehen auf dem Handoff-Weg verloren; die
ZIP-/Marketplace-Integritätsgates schließen zusätzliche MCP-Server und eine
fehlende Runtime-Lizenz nicht zuverlässig aus; die veröffentlichte UAT-Vorlage
bindet ein vom tatsächlichen Windows-Release abweichendes lokales ZIP und die
12×3-Matrix prüft ihre Fixtures nicht gegen den UAT-Korpus. Zusätzlich sind
Prototyp-Promptnamen als gültige Prompts akzeptiert. Die Terra-Ausführung hat
die vier ursprünglichen Befunde bearbeitet: generationstreue Handoff-Sitzungen samt
Coverage-Projektion, gemeinsamer ZIP-/Marketplace-Validator einschließlich
Runtime-Lizenz und Quellcommit, explizite Kandidaten-/Archivbindung mit
fixture-validierter 12×3-Matrix sowie reine Own-Key-Promptauflösung. Die genaue
nachvollziehbare Lieferung steht in `BL-041.15`–`.18`.

Der zweite Astra-Gegenreview fand vier Restdefekte im Release-/UAT-Weg.
`ASTRA2-20260912-01`–`04` sind im Backlog einzeln festgehalten und lokal
korrigiert: Download außerhalb des Quellbaums, vollständiger finaler
Normal-/Debug-/UAT-/SPDX-Artefaktsatz, Bindung an den tatsächlich nativ geprüften
ZIP-Snapshot sowie ausführbare UAT-Vorbedingungen statt simulierter
Parser-Startantworten. Ein isolierter Offline-Integrationstest baut beide
Cowork-Pakete, startet sie nativ und prüft UAT und finale Prüfsummen gemeinsam.
Dieser Offline-Test ist Entwicklungs-E0; die gesonderte RC139-Veröffentlichung
ist oben belegt. Beide Nachweise ersetzen keine menschliche Abnahme.

RC138 bleibt ein veröffentlichter technischer Zwischenstand; seine positiven
Paket-, Start- und MCP-Roundtripnachweise bleiben historisch gültig. Es ist
jedoch kein aktueller N3/N4- oder Modell-UAT-Kandidat. Die vier Stories sind
geschlossen; RC139 hat ihre Regeln aus sauberem Commit mit zwei expliziten,
verifizierten Windows-Archiven erneut nachgewiesen.
Die Marketplace-Projektion wählt das aktuelle Host-ZIP, verweigert veraltete
Quellbytes vor Ausgabeänderungen und prüft die fertigen Dateien gegen das
tatsächliche Archiv. Hash, Ziel und Execute-Bits sind explizit nachvollziehbar;
die Projektion selbst behauptet keinen nativen Ausführungsnachweis.

RC138 ist an Quellcommit `d70cb266df90bdc07b0efadbf81f0d81195b3920`
gebunden und unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc138>
veröffentlicht. Der kostenbegrenzte Pflichtlauf `34691166336` ist grün. Der
manuelle Lauf `34691170241` baute die drei Cowork-Zielarchive und startete exakt
diese Pakete auf Windows x64, macOS Intel und macOS ARM64. Manifest, Architektur,
MCP-Roundtrip und dauerhafter lokaler Zustand bestanden. Windows x64 bindet
SHA-256 `bc005e23…97d251`, macOS Intel `a34443f8…8c5efb` und macOS ARM64
`829ba3f2…7463f2`. Ein lokaler Windows-Doppelbau war zusätzlich bytegleich.

Diese E0-Evidence schließt den früheren Nachweisfehler, ist aber keine sichtbare
Claude-/Cowork-, Modell-, Accessibility-, N3/N4- oder Produktionsabnahme.
Standalone wurde nicht verändert oder als RC138 neu gebaut; sein technischer
Kandidat bleibt RC137 mit unveränderten Hashes und INT-13-Bindung.

## RC137 – Standalone-Härtetest und sitzungsgebundener Start

Der reale RC136-Härtetest mit dem 16-Dateien-Korpus nahm zusätzlich eine von
Microsoft Office erzeugte `~$`-Besitzerdatei als siebzehntes Dokument auf. Sie
war kein verarbeitbarer DOCX-Container und führte deshalb zu einem unnötigen
Stopp. DS-100 / BL-010.35 beheben die Ursache generalisiert: Nur eine nach
Dateisystemsprüfung, kleiner Größe, fehlender eigener OPC-Signatur und passender
größerer OPC-Quelldatei belegte `~$*.docx/xlsx/pptx` wird übersprungen; ein
echtes OPC-Dokument mit solchem Namen bleibt Quelle. Die UI nennt ausschließlich
die Anzahl. Alle 16 echten Korpusdateien werden
weiter rekursiv aufgenommen. Der absichtlich mehrdeutige Markdown-Fall bleibt
weiterhin eine erwartete lokale Reviewentscheidung und ist kein stiller Fehler.

Der App-Neustart projiziert außerdem keinen inaktiven historischen Lauf mehr als
aktuellen Prozess. Start und neue Auswahl sind frei; alte fortsetzbare Läufe
bleiben in der laufgebundenen Verlaufstabelle. Die technische Recoveryprüfung
bleibt erhalten und darf verwaiste Sperren sowie unvollständige atomare Exporte
reparieren. Ein tatsächlich lebender Worker bleibt exklusiv. Die vom echten
Intake-Worker bestätigte Laufkennung wird unmittelbar an die aktuelle Sitzung
gebunden, damit auch ein vor dem ersten Status-Poll beendeter Kurzlauf sichtbar
bleibt. Admission-, Standalone-Service-, History-, Frontend-, Recovery- und
adversarielle Golden-Tests sind grün. Der saubere Quellcommit
`8979d4b2127741c2921cb6f0654fb83d82944845` ist auf `main` veröffentlicht.
Windows-PKG-04/INT-13 bindet zwei bytegleiche Standalone-ZIPs mit SHA-256
`3dfdb381…47c6f0`. Die Läufe `34609450730` und `34609464020` belegen die
jeweils zweimal deterministischen nativen Standalone-Pakete und App→IPC→Core-
Starts auf macOS Intel/ARM beziehungsweise Linux x64 glibc. Lauf
`34609438970` bindet die validierten Cowork-ZIPs für Windows und beide
Mac-Architekturen; die getrennte Windows-Debug-Variante ist ebenfalls zweimal
bytegleich und vollständig geprüft. Alle Artefakte liegen im technischen
Vorabrelease
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc137>.
Sichtbare Zielhost-, N3/N4- und Cowork-Modellabnahmen bleiben offen.

## RC136 – geschlossene Cowork-Interaktionen und progressive Modellkontexte

DS-099 bindet die 27 Cowork-Werkzeuge an eine einzige maschinenlesbare
Interaktionsregistry. Normalmodus, Supportmodus und MCP-Annotationen werden
daraus abgeleitet; Registry, Werkzeugtabelle und Handler müssen bijektiv sein.
Ein unbekannter Werkzeugname wird nicht mehr fälschlich als Supportweg
klassifiziert. Jede bekannte Antwort erhält additiv einen inhaltsfreien
`datasecure-cowork-status/1`-Umschlag, der Interaktionsende, lokalen
Arbeitszustand, Retryklasse, Human-Gate-Assurance und die tatsächlich gelieferte
Inhaltsgrenze trennt. Leere Übergaben werden nicht als Inhalt ausgewiesen;
Abbruch, Reviewstart und alle Cursor-/Seitenfortsetzungen besitzen eindeutige
Zustände. Ein rekursiver Guard verweigert im Normalmodus private Token,
Capabilities, Paketkennungen und Cursor. Verifiziertes anonymisiertes Markdown
bleibt ausdrücklich untrusted; Originalinhalt wird nie übergeben.

Der Cowork-Hauptskill enthält nur noch den unverhandelbaren Normal-, Privacy-
und Trustkern sowie eine Intenttabelle; der einfache Start benötigt keine
Referenzrunde, Sonderabläufe laden genau eine isolierte Referenz. Der
strukturierte Modellkorpus umfasst 41 Fälle und eine kuratierte 12×3-Matrix mit
reproduzierbarem Fixture-, Setup-, Bewertungs- und Cleanup-Vertrag. Beide sind
nun formale Cowork-GO-Gates. Diese E0-Prüfungen simulieren kein Claude-Modell.
Dreifache echte Cowork-Ausführung und N3/N4 sind noch offen. Der
Windows-x64-Kandidat wurde aus Commit
`71ecafddde891d9d1b4e4bd9cd67833b46d03b08` jeweils zweimal bytegleich als
Normal- und Debug-Paket gebaut. Beide Varianten bestanden ihre Paket-, Runtime-,
Worker- und Skill-Smokes. Normal: 35.048.298 Byte, SHA-256
`212646f6a27d610ed502bad724441f6c8d30872d55d387d6f59c9fe006ec1cbf`;
Debug: 35.049.821 Byte, SHA-256
`2b8e660e44ea95566bdebbda22ff67e6dfe3bc6da23b00dd78cf6b60de587c70`.
Der technische Vorabrelease liegt unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc136>.
Seine 36 Evidence-Zeilen stehen absichtlich auf `NOT_RUN`. Die Standalone-App
und der gemeinsame Privacy-Core wurden in RC136 funktional nicht geändert; zu
diesem historischen Zeitpunkt blieb RC135 ihre letzte vollständige
plattformübergreifende Paketmatrix.

## RC135 – commitgebundene Paketmatrix und gehärtete Release-Evidence

RC135 bindet den konsolidierten RC134-Funktionsstand und die nachfolgende
Härtung der nativen Evidence-Harnesses an den sauberen, auf `main`
veröffentlichten Quellcommit
`9c2e4f9061dbdc3cd1bf0280d95939528029c978`. PKG-04 erzeugte daraus zwei
bytegleiche Windows-Standalone-ZIPs zu jeweils 110.250.920 Byte; beide Paket-,
Worker-, History-/Sidecar- und nativen Smokes bestanden. INT-13 bindet das
Archiv mit SHA-256
`8a27494c19c1713ccd5104d1ec3dda8abd2e773ceedb47d250befccbe174c3d1`.

Der kostenbestätigte GitHub-Lauf `34499428661` baute aus demselben Commit die
Standalone-App nativ für macOS Apple Silicon und Intel, startete jeweils App,
private IPC und Core, prüfte Signatur sowie Binärarchitektur und erzeugte jedes
Distributionsarchiv zweimal bytegleich. Das ARM64-ZIP hat 115.159.211 Byte und
SHA-256 `e9f54b5bf1178050be36b774b7aebcfb145678d678a0dc9337e0fe802b99f8c6`;
das Intel-ZIP hat 118.191.466 Byte und SHA-256
`9061aae7d75078d6a230df4b6c1843f20e242213308c33579edb6b15f16880e9`.

Der Cowork-Lauf `34501324817` erzeugte und validierte ebenfalls aus demselben
Commit die drei selbsttragenden Plugin-ZIPs: Windows x64 mit 35.041.604 Byte
und SHA-256 `62796e6f8f0d7cf295800776e805a5e53d5c7d785e3cf8d1002f14d852ad1cdb`,
macOS ARM64 mit 38.797.037 Byte und SHA-256
`38301698449c74dd017399d3fa243d3cce7fa2007a1943d6ee88d5f85b0233fd`
sowie macOS Intel mit 39.781.289 Byte und SHA-256
`1efd4cc4e590abbded540ad8be513891b69f3be8f39ee1bb327e2912668e1395`.
Diese E0-Paketnachweise ersetzen keine sichtbare Fresh-Install-, Finder-/
Explorer-, Cowork- oder Accessibility-Abnahme. RC135 ist unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc135>
als technischer Vorabkandidat veröffentlicht; N3 und N4 bleiben offen.

## RC134 – gebundene zweckabhängige DOCX-Kopf-/Fußprojektion

Nach DS-098 bleibt die vollständige DOCX-Strukturprüfung unverändert streng,
aber die sichtbare Projektion unterscheidet den Zweck. Reine
Markdown-Konvertierung erhält Kopf- und Fußzeilen. Cowork- und
Standalone-Anonymisierung geben diese Bereiche und ausschließlich dort
referenzierte Bilder nicht mehr aus; Hauptteil, Kommentare, Fußnoten und
Endnoten bleiben im geprüften Markdown. Ein fester, inhaltsfreier
Quellenabdeckungsgrund beschreibt den bewusst eingeschränkten Ergebnisumfang,
ohne ihn fälschlich als unvollständige Extraktion zu bezeichnen.
PDF-/Scan-PDF-Seitenränder und PPTX-Master werden nicht heuristisch entfernt.
Parser-, Worker-, Orchestrator- und reale DOCX-Gegenläufe sind grün. Der saubere
Quellcommit `583d71929a279fb57370a19c11776fc54aebc2d0` bestand PKG-04 mit zwei
bytegleichen Windows-ZIPs zu 110.250.875 Byte; beide Paket-, Worker- und nativen
Smokes sowie die Desktop-/Core-Hashvergleiche sind grün. INT-13 bindet SHA-256
`cdc2ec38c7346217a1de21ec9a5137895ded9fe4322dd5cb16f06a599dd6de0c`.
Die nachträgliche, read-only Kandidatenevidenz vermisst 30 vollständig frische
Windows-Starts vom Prozessstart bis zu bestätigter UI-, IPC-, Sidecar- und
Servicebereitschaft mit p50 1,012 s, p95 1,124 s und maximal 1,256 s. Die
Tauri-Hülle hat 3.549.184 Byte und bleibt klar unter der 20-MiB-Grenze. Zehn
weitere Starts mit positiver TCP-/UDP-Observerkontrolle und circa 100-ms-
Beobachtung vom Start bis zur Bereitschaft zeigen null TCP-Listener und null
UDP-Endpunkte in DataSecure-/Core-/Workerprozessen. Prozessidentitäten werden an
Erstellzeit und Root-EXE gebunden; ein WebView2-UDP-Endpunkt dürfte nur bei
Microsoft-Signatur und exakt geparstem isoliertem Profil als Plattformbefund
erscheinen. Unklare Attribution stoppt das Gate. Der
wirklich entpackte RC134-Sidecar konvertierte außerdem den reproduzierbaren
100-Dateien-Korpus in 50,892 s Verarbeitungszeit beziehungsweise 51,092 s
gesamter Harnessdauer: 100 Ergebnisse, keine Fehler, keine Zuordnung,
vollständige relative Ordnerstruktur und unveränderte Quellhashes.
N3/N4, aktuelle Cowork-Zielpakete und weitere Zielhosts bleiben offen; RC133
bleibt unverändert.

## RC133 – commitgebundener Testschnitt

RC133 übernimmt den vollständig geprüften RC132-Funktionsstand einschließlich
der policygebundenen Fortsetzung, stabiler Workerfehler und wieder verfügbarer
Quellaufnahme als eigenen versionierten Kandidaten. Der saubere Quellcommit
`2cd4150adfdff2e3aa6771c6cd81e2972ea0413a` wurde auf `main` veröffentlicht.
PKG-04 erzeugte daraus zwei unabhängig bereinigte, bytegleiche Windows-ZIPs;
beide Paket-, Worker-, History-/Sidecar- und nativen Smokes bestanden. INT-13
ist an das 110.249.642 Byte große Archiv mit SHA-256
`fd3dcb1b0f99940a110857c085793b70930454571ffda3a7e5d8565a997ece66`
gebunden. Diese technische Windows-Bindung ersetzt keine menschliche N3/N4-
Abnahme und keine Cowork-/macOS-Zielhostevidenz.

## RC132 – Reviewkonsistenz, Policybindung und serverseitige Statuswahrheit

RC132 schließt drei in unabhängigen Gegenreviews reproduzierte Produktdefekte.
Erstens bleibt eine gemeinsam bestätigte F7-Personenentscheidung auch dann
gültig, wenn das erste veröffentlichte Dokument das stapelweite Pseudonym bindet
und derselbe Name im nächsten Dokument deshalb schon vor dem Replay automatisch
ersetzt wird. Die alte Entscheidung wird nur akzeptiert, wenn Originalentwurf,
exakte Schreibweise und das frisch gebundene Personenpseudonym nachweislich
zusammenpassen; fremde oder verschwundene Review-IDs bleiben fail-closed.
Windows, macOS und Linux zeigen für mehrere nachweislich gleichnamige F7-
Fundstellen nur eine Personenentscheidung und wenden sie automatisch auf die
gesamte Gruppe an. Widersprüchliche Einzelentscheidungen werden damit bereits
in der Oberfläche vermieden; die gemeinsame Validierung bleibt als zweite
Schutzlinie bestehen.

Zweitens besitzt der dauerhafte Pseudonymkontext genau eine kanonische,
bytegebundene Policy-Dateiliste. Sie umfasst Privacy-Module und Kataloge,
Pseudonymkontext, Reviewmodell/-publikation, Profilwahl, relevante Core-Verträge
und Ressourcenlimits. Jede einzelne Mitgliedsänderung verändert den Fingerprint;
ein neu hinzukommendes Privacy-Modul lässt das Golden-Gate rot werden. Wegen der
materiellen F7-Regeländerung ist der Privacy-Ruleset auf `de-business/3` erhöht;
ältere Journale ohne passenden Ruleset werden nicht geraten oder fortgesetzt.

Drittens zählt die begrenzte Präindex-Aliasauflösung tatsächlich besuchte Fenster
und damit auch wiederholte Cachetreffer. Hochrepetitiver Text kann das
50.000-Fenster-Arbeitsbudget nicht mehr umgehen. Der normale attestierte Index
bleibt davon unberührt.

Cowork liefert die vollständige nutzersichtbare Startmeldung jetzt als
serverseitigen `user_status` durch die echte MCP-Grenze. Skill, Prompt und
MCP-Instruktionen geben ihn nur wörtlich wieder. Dasselbe gilt für einen
ausdrücklichen nachträglichen Ergebnisordnerwechsel einschließlich Netzwerk-/
Cloud-Sync-Hinweis; die einzelnen Booleschen Felder sind nur Transportmetadaten.
Ein noch nicht gezeigter
Netzwerk-/Cloud-Sync-Hinweis bleibt nach einer abgebrochenen Quelldateiauswahl
lokal gespeichert und wird erst beim nächsten bestätigten Handoff verbraucht.
Standalone gruppiert die bereits zugelassenen Quellen sichtbar in direkt lesbar
und lokal zu konvertieren; gesperrte oder verschlüsselte Quellen bleiben korrekt
dem vorgeschalteten Admissiongate zugeordnet. Reale PDF-Goldenfälle decken
Formulare, Signatur, Anhang, JavaScript und Verschlüsselung im paketierten Parser
ab; dabei wurde eine echte PDF.js-`Map`-Integrationslücke behoben.

Die Standalone-Fortsetzung ist zusätzlich an den gespeicherten
Privacy-/Pseudonymkontext gebunden. Ein alter Anonymisierungslauf mit einem nicht
mehr aktuellen Ruleset wird weder im Verlauf noch im globalen Zustand als
fortsetzbar angeboten; er erscheint terminal fehlgeschlagen und fordert eine
neue Auswahl der Originaldateien. Bereits veröffentlichte Export- oder
Zuordnungsschulden bleiben unabhängig davon reparierbar, weil sie keine
Privacy-Verarbeitung wiederholen. Tritt nach einem gültigen Executor-Claim eine
ungefangene Ausnahme auf, stabilisiert der Worker jede noch offene Position mit
dem ursprünglichen festen Fehlercode nach derselben begrenzten Retry-Policy wie
die reguläre Einzelverarbeitung. Reine Markdown-Konvertierung erzeugt dabei
weiterhin keine Zuordnung. Eine Worker-Annahme ist in der Oberfläche nur ein
Startnachweis, niemals eine Abschlussbestätigung.

Ein historischer gestoppter, zu prüfender oder noch zu exportierender Lauf sperrt
die nächste lokale Quellenwahl nicht. Datei- und Ordnerpicker, Drag-and-drop und
die Funktionswahl bleiben verfügbar; nur tatsächliche Vorbereitung,
Verarbeitung oder ein blockierter Core sperren eine neue Aufnahme. Der globale
Fortsetzen-Hinweis navigiert ausschließlich in den Verlauf. Der dortige
Fortsetzen-Knopf bindet weiter exakt die konkrete Laufkennung. Unter
**Einstellungen und Hilfe** wird nun derselbe aktuelle Ergebnisstamm angezeigt
wie unter **Verarbeiten**.

Alle Aussagen dieses Abschnitts sind E0-Code-/Testevidenz. RC132 ist noch nicht
an PKG-04, INT-13, ein Releasearchiv oder menschliche N3/N4-Abnahme gebunden.

## RC131 – generalisierte Fortsetzungs- und DOCX-Residualkorrektur

Ein realer RC130-Standalone-Lauf erreichte Konvertierung und visuelle Prüfung,
stoppte danach aber bei vier fachlichen Zweiwortwerten in generisch beschrifteten
DOCX-Tabellen. Die Werte waren weder Quell-Namensanker noch Teil des privaten
Personenwörterbuchs; der unabhängige Residual-Prüfer hatte sie konservativ als
`PERSON_CANDIDATE` eingeordnet. RC131 erkennt diese Begriffe und weitere
professionelle Zweiwortphrasen in bewerteten Skill-/Kompetenzmatrizen
kontextgebunden als Inhalt, ohne die neutrale Tabellensperre für einen echten
Namen zu öffnen.
Der reale, von RC130 erfolgreich konvertierte Markdown-Inhalt durchläuft den
aktuellen Privacy-Kern byte-idempotent sowie den vollständigen
Verifikations-/Publikationspfad erfolgreich.

Die zweite Korrektur ist absichtlich nicht dokumentspezifisch: Der gemeinsame
Classifier für Erstverarbeitung und Sammelreview erlaubt Wiederaufnahme nur
für explizite transiente Codes. Ein zurückgekehrter unbekannter Fehler ist
`INTERNAL_FAILURE`; `RESIDUAL_PII` bleibt als eigener terminaler Grund erhalten.
Nur die Recovery eines verwaisten `processing`-Checkpoints oder ein Fehler nach
atomarer Veröffentlichung darf `PROCESSING_INTERRUPTED` setzen. Identische
transiente Fehler dürfen höchstens zwei Fortsetzungen erreichen und werden beim
dritten Fehlschlag terminal als `RETRY_LIMIT_EXCEEDED` gebunden; eine fehlende
Konvertierungsisolation ist kein transienter Zustand. Nach dem atomaren Rename
bleibt ein verifiziertes Paket für die Adoption erhalten, während ein vorhandenes
beschädigtes oder strukturell unsicheres Paket als `RECOVERY_FAILED` stoppt.
Damit können weder Standalone noch Cowork eine deterministische oder dauerhaft
technische Pipelineabweichung endlos als fortsetzbar anbieten.

Der Releasekandidat aus Commit `d4d269bd777012ce4fff2fc04ea9b961e5b5fcc3`
ist inzwischen paketgebunden: Der lokale Windows-PKG-04-Lauf erzeugte zwei
bytegleiche Standalone-ZIPs (SHA-256
`f475c305976215bb72ff4c8d183df4a153d6561dc8f3e3785c41adf98f559f63`),
bestand beide Paket-/Worker-/nativen Smokes und schrieb die INT-13-Bindung.
GitHub-Lauf `34396545170` bestand denselben nativen Bundle-, IPC-, Signatur-,
Architektur- und Zweifachbauvertrag auf macOS Intel und ARM64. Lauf
`34396542203` baute und verifizierte die drei getrennten Cowork-Zielpakete.
Diese elf Archive, Prüfsummen und die SBOM stehen als Vorabrelease
`v3.2.0-rc131` bereit. Sichtbare menschliche N3/N4-UAT bleibt davon getrennt
offen.

Die automatische CI ist nun risikobasiert und bleibt trotzdem genau ein stets
startender Ubuntu-Job: reine aktuelle Dokumentation läuft nur durch `test:docs`, Code durch
`test:product:ci`, gemischte Änderungen durch beide. Unbekannte oder nicht
auswertbare Diffs fallen auf beide Gates zurück. Alle nativen, Security-, OCR-
und Paketworkflows bleiben manuell; der Cowork-Paketworkflow startet
standardmäßig nur das günstigere Windows-x64-Ziel statt aller drei Plattformen.
Damit werden UAT-/Release-Nachweise nicht abgeschwächt, aber nicht mehr mit
gewöhnlichen Dokument- oder Entwicklungspushes vermischt.

## RC130 – portable Windows-Helferpfade und reale Testisolation

Die Windows-spezifischen Aufrufe für Datei-/Ordnerauswahl und das kontrollierte
Beenden eines Kindprozessbaums werden nun unabhängig vom ausführenden Testhost
mit `path.win32` zusammengesetzt. Damit entstehen auch unter Linux und macOS
die echten Windows-Pfade zu PowerShell und `taskkill.exe`; die Runtime auf
Windows bleibt funktional unverändert. Exakte Vertragstests sichern alle drei
Helferpfade.

Der CI-nahe Linux-Lauf deckte außerdem zwei Testannahmen auf, die nur unter
Windows isoliert waren. Audit-/Exportdaten besitzen jetzt auch in den
Realprozess- und Publikationstests einen expliziten temporären Datenroot. Das
IPC-Integrationstestbild prüft plattformgleich genau eine Abschlussanzeige:
ein noch lebender Elternprozess darf ein gepuffertes Ereignis präsentieren,
bei echtem Elternausfall übernimmt weiterhin der separat getestete Worker.
Produktcode wurde dafür nicht durch Mocks ersetzt. E0-Paket- und
Zielhostnachweise müssen aus dem finalen RC130-Commit entstehen. Die komplette
CI-Produktsuite ist auf Windows und zusätzlich mit dem gepinnten Node 22.23.2
auf einem nativen Linux-Dateisystem grün.

## RC129 – Windows-Pfadvertrag hostunabhängig geprüft

Der automatische RC128-Linux-Lauf `34375438144` erreichte den korrigierten
Startup-Guard, deckte danach aber eine zweite Windows-spezifische
Testannahme auf: Der Helfer für Claudes temporäre Windows-Projektion nutzte
beim plattformneutralen Vertragstest den Pfadparser des Linux-Hosts. RC129
wertet diesen ausdrücklich Windows-eigenen Vertrag immer mit `path.win32`
aus. Das ändert das Verhalten auf Windows nicht, macht Erkennung,
Profil-Fallback und Identitätsvergleich jedoch auf jedem Testhost
reproduzierbar. Die begonnenen RC128-Paketläufe wurden abgebrochen; sämtliche
E0-Paket- und Zielhostnachweise müssen aus dem finalen RC129-Commit entstehen.

## RC128 – plattformneutraler realer Startup-Guard-Nachweis

Der automatische RC127-Linux-Lauf `34373724221` bestätigte zunächst den neuen
Repository- und LF-Guard. Zwei nachgelagerte Realprozess-Tests präparierten
ihren privaten Datenroot jedoch nur über die Windows-Variable `LOCALAPPDATA`.
Linux wählte vertragsgemäß `XDG_DATA_HOME` beziehungsweise den Home-Fallback;
dadurch testeten Präparation und Erwartung unterschiedliche Verzeichnisse.

RC128 bindet beide echten Node-Childprozesse über den absoluten,
plattformneutralen Produktvertrag `EU_PRIVACY_DATA_ROOT` an genau den zuvor
präparierten Testroot. Bootstrap, Startup-Transaktion, Journal-/Marker-I/O und
Fehlerprojektion bleiben real; es wurde kein Mock eingeführt. Die begonnenen
RC127-Plattformläufe wurden nach diesem Befund abgebrochen. PKG-04/INT-13 und
sämtliche Zielpakete müssen deshalb aus dem finalen RC128-Commit neu entstehen.

## RC127 – installierbare Zielpakete und belastbarer CI-Guard

Der reale RC126-Lauf `34369709771` hat alle drei zielsystemspezifischen
Cowork-Runtimes und ZIPs erfolgreich gebaut. Erst der zusätzliche Universalbau
stoppte mit `BUNDLED_PLUGIN_ARCHIVE_LIMIT`: Drei gebündelte Laufzeiten können
nicht gemeinsam unter Anthropics 50-MB-Grenze für manuell hochgeladene
Plugin-ZIPs bleiben. RC127 erzeugt deshalb im All-Targets-Lauf ausschließlich
die drei vorgesehenen Windows-x64-, macOS-x64- und macOS-arm64-ZIPs. Die
Größenbegrenzung bleibt unverändert; sie wird nicht zur Umgehung der
Herstellervorgabe angehoben.

Der automatische CI-LF-Guard prüft jetzt die Git-Indexbytes und nimmt nur den
byteinventorierten Upstream-`node_modules`-Teil der deaktivierten OCR-Runtime
aus. Eigene Runtime-, Produkt- und Dokumentationsquellen bleiben geprüft; ein
Treffer nennt künftig den Pfad. RC126 bestand PKG-04/INT-13 lokal und der
macOS-ARM64-Zieljob lief vollständig grün. Der Intel-Zieljob belegte Build,
Signatur, Architektur und privaten IPC-Start, meldete beim anschließenden
Programmende aber einen vermeintlichen Sidecar-Nachläufer. Die Messung hatte
bis dahin alle direkten WebView-Kindprozesse gleich behandelt. RC127 beendet
den verwalteten Sidecar vorsorglich sowohl beim Tauri-`ExitRequested` als auch
beim finalen `Exit`; der native macOS-Test bindet PID, Prozessname und
Kommandozeile an den tatsächlichen Sidecar. Diese RC126-Nachweise dienen der
Diagnose, werden aber wegen des neuen Quellcommits nicht als RC127-UAT-Evidence
übernommen.

PKG-04/INT-13, die drei Cowork-Zielpakete und beide macOS-Standalone-Pakete
müssen für den finalen RC127-Commit erneut erzeugt werden.

## RC126 – plattformneutrale Cowork-Runtime-Lizenz

Der RC125-Sammelbuild `34367064924` hat nach drei erfolgreich geprüften
Zielruntimes den Universal-Paketbau mit `BUNDLED_PLUGIN_LICENSE_MISMATCH`
gestoppt. Die Originalarchive enthalten denselben Node-Lizenztext: Windows mit
CRLF, macOS mit LF. Die normalisierten UTF-8-Inhalte und Hashes sind identisch.
RC126 kanonisiert deshalb ausschließlich CRLF zu LF, bevor Lizenzdatei und
Runtime-Evidence geschrieben werden. Ungültiges UTF-8, NUL, unplausible Größe,
abweichender Text oder manipulierte Evidence bleiben fail-closed. Ein
Regressionstest bindet beide realen Zeilenendungsvarianten; der formale UAT-
Versionshelfer hält nun auch Kampagnenvorlage und Branchbeispiele synchron.

Der fehlgeschlagene RC125-Build ist keine Release-Evidence. PKG-04/INT-13 und
alle Zielpakete müssen nach dem RC126-Commit erneut erzeugt werden.

## Formale N3/N4-Abnahme ist vorbereitet, noch nicht durchgeführt

DS-095 führt für beide Produkte einen gemeinsamen, aber nicht vermischten
Abnahmeweg ein. N3 bindet technische E1-Zielhostevidence an Commit, Version,
Paket, SHA-256, OS und Architektur. N4 führt erst danach die bestehenden
Cowork-UAT-01–06 und Standalone-S01–23 als beobachtete E2-/E3-Abnahme mit
Accessibility-, Fach-, Datenschutz-, Security- und Architektururteil aus.

Für die zwei benannten Personen existieren getrennte Windows- und macOS-
Evidencevorlagen, eine Kandidatenmanifestvorlage, ein konfliktfreier Git-Ablauf
und eine gemeinsame GO-/NO-GO-Vorlage unter
`docs/acceptance/FORMAL_UAT`. Beide verwenden denselben festgeschriebenen
`main`-Commit; die Zielpakete und Hashes bleiben plattformspezifisch. Der Rahmen
ist E0-geprüfte Vorbereitung, aber noch keine N3-/N4-Evidence. Der Windows-
Kandidat RC134 ist aus Commit `583d71929a279fb57370a19c11776fc54aebc2d0`
mit ZIP-Hash und PKG-04/INT-13 gebunden. Vor dem gemeinsamen N3/N4 fehlen noch
die Cowork- und macOS-Pakete/Hashes aus demselben festgeschriebenen Commit sowie
die tatsächliche Architektur des Test-Macs.

## Intel-/ARM64-Zielhost- und App-Bundle-E0 vom 09.09.2026

Der manuell und kostenbestätigt gestartete GitHub-Actions-Lauf
[`34285518668`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34285518668)
ist für Commit `487bfe1f4ede640880dac317a06ae2c2f1f5efe9` auf einem echten
`macos-14`-Apple-Silicon-Runner vollständig grün. Er kompiliert und prüft den
nativen POSIX-Supervisor, die gepinnte selbsttragende Node-/Konverterruntime,
sämtliche Standalone-, Konverter- und Rust-Verträge, den real isolierten
Office-/PDF-/OCR-Worker, Clippy mit `-D warnings`, den Tauri-Release-Build sowie
die Architektur von App, Core-Sidecar und Supervisor. `file` und `lipo` weisen
alle drei als Mach-O `arm64` aus. Es wurden keine Secrets, Caches, Pakete,
Diagnosen oder Artefakte hochgeladen.

Der separat gestartete Intel-Lauf
[`34318293471`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34318293471)
ist für Commit `1cf2d5349d848bc60ff35f7c12341754b8d91bc3` auf dem echten
`macos-15-intel`-Runner ebenfalls vollständig grün. Derselbe Prüfpfad bestätigt
den real isolierten Office-/PDF-/OCR-Worker, Clippy, den Tauri-Release-Build und
App, Core-Sidecar sowie POSIX-Supervisor jeweils als Mach-O `x86_64`. Auch dieser
Lauf verwendete keine Secrets, Caches oder Artefakt-Uploads.

Die erweiterten Läufe
[`34321954381`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34321954381)
auf Apple Silicon und
[`34322534571`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34322534571)
auf Intel sind für Commit `52437999ad04a1aa37c05485228aba2980d11cbe`
ebenfalls vollständig grün. Sie bauen mit der exakt gepinnten Tauri-CLI jeweils
das echte `DataSecure Standalone.app`, prüfen Info.plist, Mindestversion,
Ad-hoc-Signatur (`codesign --deep --strict`) und alle drei nativen Architekturen.
Eine isoliert kopierte App startet anschließend den gebündelten Core über die
private IPC-Grenze, initialisiert den plattformrichtigen Datenroot und beendet
App sowie Sidecar ohne verwaisten Prozess. Damit ist das flüchtige, ad-hoc
signierte App-Bundle auf beiden Architekturen automatisiert E0-belegt.

Die nachfolgenden Läufe
[`34334520861`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34334520861)
auf Apple Silicon und
[`34335259239`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34335259239)
auf Intel sind für Commit `06c2669daffdd414153cb3392df2df930c1b1dbf`
vollständig grün. Je Ziel wird das Distributions-ZIP zweimal bytegleich gebaut,
gegen Manifest, SHA-256, SBOM, Rust-/Node-Lizenzen und ausführbare Dateimodi
geprüft, entpackt, nochmals mit `codesign`/`lipo` geprüft und aus genau diesem
entpackten Paket durch App → private IPC → Core gestartet. ARM64 umfasst 579
Einträge und 115.143.802 Byte mit SHA-256
`86b79e8c7633bb964e19f0867432936be6fbd0546de166fa147da55227e721a8`;
Intel umfasst 579 Einträge und 118.176.134 Byte mit SHA-256
`61aad77a7b6eaeaada20972a2de329319cc4c1a53d988325b18437e9f6ea4e70`.
Beide Engineeringpakete wurden für genau einen Tag als Actions-Artefakt
bereitgestellt.

Nicht daraus abgeleitet werden Finder-/Gatekeeper-Bedienung, tatsächlich
beobachteter Fensterstart, Picker, Drag-and-drop, VoiceOver, reale Performance
oder menschliche UAT. Diese E1/E2-Nachweise bleiben auf beiden Architekturen
offen. Linux x64 glibc besitzt inzwischen einen getrennten nativen AppImage-
und Distributionsnachweis; dessen sichtbare Desktop-, Dateidialog-,
Dateimanager-, Accessibility- und Performance-UAT bleibt ebenfalls offen.

## Linux-x64-AppImage- und Distributions-E0 vom 09.09.2026

Der manuell und kostenbestätigt gestartete GitHub-Actions-Lauf
[`34356576842`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34356576842)
ist für Commit `84fd616c65665f3c7a31426bd722206c7145b6a6` auf
`ubuntu-22.04` mit glibc 2.35 vollständig grün. Ohne Secrets oder Buildcache
prüft er Produkt- und Konvertierungsverträge, den echten isolierten
Office-/PDF-/OCR-Worker, den nativen POSIX-Supervisor, Rust/Clippy, sämtliche
ELF-x64-Architekturen und den dynamisch aus dem AppImage ermittelten
Tauri-Ressourcenroot.

Das entpackte AppImage und anschließend dasselbe AppImage aus dem verifizierten
Distributions-ZIP starten jeweils über den echten `AppRun`-Einstieg. Beide
Läufe erreichen ein sichtbares X11-Fenster, Frontend, Sidecar, Service und die
ersten beiden privaten IPC-Antworten; ein über den Window Manager ausgelöstes
normales Schließen beendet App und Sidecar ohne verwaisten Kindprozess. Das
Distributions-ZIP wurde zweimal bytegleich gebaut und gegen Manifest, SBOM,
Lizenzen, SHA-256 und ausführbare Dateimodi geprüft. Sein SHA-256 ist
`177b976399785b010937ba17fde738b14f3eed94b4d78f94ea4491736f93eaee`;
das enthaltene AppImage hat SHA-256
`bd25febd291328202b62e48edea9e46c4e696c6b329c4efe6255041c6f498853`.
Das Engineeringpaket `DataSecure-Standalone-linux-x64-glibc-84fd616c65665f3c7a31426bd722206c7145b6a6`
wurde als Actions-Artefakt bis zum 10.09.2026 bereitgestellt. Eine menschliche
Linux-UAT für reale Desktopumgebung, Picker, Drag-and-drop, Dateimanager,
Accessibility, Performance, Installation und Update/Rollback bleibt offen.

## Aktueller Entwicklungsstand RC125 – unabhängige Revalidierung

Der vollständige RC124-Stand wurde erneut gegen die am 08.09.2026 abrufbare
offizielle Anthropic-Dokumentation, beide Produktprojektionen, Runtime-, Prompt-,
IPC-, Paket-, Recovery- und Dokumentationsverträge geprüft. Die zentrale
Produktgrenze bleibt korrekt: Originale dürfen nur über den DataSecure-
Betriebssystempicker in einer nachweislich lokalen Claude-Desktop-/Cowork-Sitzung
mit laufendem Plugin-MCP eingehen. Cloud-Cowork läuft inzwischen standardmäßig
auf Anthropic-Infrastruktur; eine geöffnete Desktop-App macht daraus keine lokale
Sitzung. Standalone bleibt davon vollständig unabhängig.

Zwei technische Reviewbefunde sind geschlossen. Der Cowork-Prompt erzeugt die
aktuelle Sechs-Format-Regel nun direkt aus einem benannten Vertragsbaustein und
enthält keinen still ersetzten historischen Vier-Format-Satz mehr. Außerdem
prüft der SEA-Crashvertrag nach der Markdown-first-Erweiterung beide `await`-
Konvertierungszweige sowie das Await innerhalb der gemeinsamen Extraktionsschicht,
bevor ein `extracted`-Checkpoint veröffentlicht werden darf. Dadurch ist der
Test wieder an die wirkliche Laufzeitstruktur gebunden, ohne die Invariante
abzuschwächen.

## Aktueller Entwicklungsstand RC124 / DS-093

Das Cowork-Plugin akzeptiert über seine lokalen Datei- und rekursiven
Ordnerpicker jetzt zusätzlich XLSX und PPTX. Beide Quellen werden im
netzgesperrten lokalen Pluginprozess genau einmal über den bereits
ausgelieferten isolierten Office-Parser in neutrales Markdown extrahiert. Nur
dieses Markdown erreicht anschließend denselben Privacy-Core wie TXT,
Markdown, CSV und DOCX. Originalbytes, Pfade, Dateinamen, private
Zwischenstände und Mappings werden dabei nicht an Claude zurückgegeben.

Quellenabdeckung und Datenschutzprüfung bleiben zwei getrennte Aussagen:
`source_extraction_coverage` beschreibt, dass bei XLSX/PPTX nur der extrahierte
Markdown-Inhalt betrachtet wurde; `privacy_scope=extracted-markdown-only` und
`document_result` bestätigen ausschließlich dessen Anonymisierung. Damit wird
nie behauptet, der vollständige Office-Container einschließlich aller
Grafiken, Kommentare oder eingebetteten Objekte sei anonymisiert worden.

PDF, Scan-PDF und Bilder bleiben im Cowork-Plugin fail-closed gesperrt. Der
Standalone-Konverter kann diese Formate zwar lokal verarbeiten, seine rund
57-MiB-OCR-/PDF-Runtime ist aber weder Bestandteil des aktuellen Cowork-ZIP
noch auf den Cowork-Zielhosts abgenommen. Eine spätere Freigabe verlangt eine
kompakte gebündelte Runtime, Offline-/Netzwerkdeny-, Paket- und
Windows-/macOS-Zielhostnachweise. Der neue Office-Pfad erzeugt keinen weiteren
Bestätigungsdialog und verändert Standalone nicht.

Der Standalone-Desktop behält den letzten innerhalb derselben UI-Sitzung
fertiggestellten Ergebnislauf auch dann als exakt gebundene Öffnen-Aktion, wenn
bereits der nächste Stapel vorbereitet wird. Ein App-Neustart übernimmt diesen
Komfortzustand weiterhin nicht; ältere Läufe werden über den Verlauf geöffnet.
Die native Zielprüfung behandelt unter Windows das Reparse-Attribut nun bei
Eingabe **und** Ergebnisöffnung gleich und übergibt Junction-Ziele nicht an den
Explorer. Frontend-, Desktop-Vertrags- und Rust-Tests belegen beide Grenzen.

Der Netzwerkvertrag benennt den MCP-Hauptprozess präzise als Metadaten-,
Zustands- und Exportkoordinator: Er exportiert nur verifizierte anonymisierte
Paketbytes und verarbeitet keinen Original- oder Review-Rohtext. Parser, OCR und
Review behalten die eigene Netzwerk-Deny-Grenze; beide Plugin-Konfigurationen
werden auf den kleinen MCP-Einstiegspunkt geprüft.

## Vorheriger Entwicklungsstand RC123 / DS-092

Der Cowork-Normalweg übernimmt die gemeinsam nutzbaren Korrekturen der
Standalone-UATs, ohne dessen eigenständige Oberfläche, Konvertierungsmodus,
Verlauf, Ordnerstruktur oder wählbare Ergebnisnamen zu verändern. Personen-,
Unternehmens-, Parser-, Recovery-, Export- und Restprüfungslogik stammen
weiterhin aus demselben Core und werden in beiden Produktprojektionen geprüft.

RC124 schließt die Tabellen-Unterredaktion aus F1/F2: Standalone stellt für die
Anonymisierung eindeutige sensible Quellköpfe aus neutralen `Spalte N`-
Extraktionen wieder her; reine Konvertierung und Cowork werden dadurch nicht
verändert. Der gemeinsame Core kennt die belegten operativen Personenfelder.
Bleibt unter einer beliebigen anderen Kopfzeile ein namensförmiger Tabellenwert
zurück, verhindert ein davon unabhängiges Restgate die Veröffentlichung. Diese
bewusst konservative Grenze kann neutrale namensförmige Zweiwortwerte stoppen
und benötigt für eine Lockerung eine bestätigte Produktentscheidung.

RC124 schützt außerdem ausdrücklich bezeichnete Zugangsdaten im gemeinsamen
Privacy-Core. Benutzer-/Loginwerte, Passwörter, Passphrasen, Secrets, Token,
API-Keys, Zugangscodes und PINs werden in Zeilen und eindeutigen Tabellenspalten
durch `[CREDENTIAL_REDACTED]` ersetzt. Die Restprüfung besitzt einen separaten
Labelkatalog und stoppt verbleibende Werte fail-closed. Credential-gebundene
Vorkommen werden weder als Klarwert noch als Hash in Findings oder Diagnoseobjekte übernommen;
kommt derselbe Text zusätzlich in einer eigenständigen Personen- oder Unternehmensrolle
vor, wird nur diese fachlich eigenständige Rolle regulär pseudonymisiert und protokolliert;
unbeschriftete technische Tokens werden weiterhin nicht geraten.

RC124 erweitert die IBAN-Erkennung auf einfachen und mehrfachen Leerraum, Punkt,
Schrägstrich sowie ASCII- und Unicode-Bindestriche; Leerraum um genau ein solches
Satzzeichen bleibt zulässig. Für die belegten festen Gesamtlängen von DE, AT, BE,
GB und NL endet der Bankspan vor nachfolgenden Labels, weiteren Identifiern oder
Prosa. Auch nach einer konservativ geschützten numerischen Fortsetzung bleiben
durch unabhängige Detektoren abgesicherte Folgefelder sichtbar; unbekannte
Formularfelder bleiben dagegen Teil der konservativen Schutzgrenze. Unbekannte
Länderlayouts werden nicht anhand einer fremden Länderlänge gekürzt.

Der gemeinsame Telefonkontext deckt nun auch häufige deutsche Briefphrasen wie
„Rufen Sie mich an unter“, „Melden Sie sich unter“, „Rückfragen unter“ und
„telefonisch unter“ ab. Die Grammatik erlaubt nur eng begrenzte Empfänger- und
Anredeformen, bleibt auf einer Zeile und macht das Wort `unter` allein nicht zum
Telefonlabel. Technische Abruftexte, Uhrzeiten und plausible Kalenderdaten
werden dadurch nicht redigiert. Redaktor und unabhängiges Restgate sind mit
Positiv-, Negativ-, Unicode- und adversarischen Fällen belegt.

Einfache, gleich breite Tabellen werden nicht mehr allein wegen eines Wortes wie
`Mitarbeiter`, `Kunden`, `Personal`, `Fall` oder `Abteilung` als strukturell
mehrdeutig eingestuft. Eindeutige Personenfelder werden weiterhin redigiert;
unter einer nicht katalogisierten Überschrift stoppt ein namensförmiger Wert am
unabhängigen `PERSON_CANDIDATE`-Gate. Das ist absichtlich enger als die erste
F8-Auftragsfassung: `Rechnungs`, `Fall`, `Akten` oder `Abteilung` pauschal als
Personenspalten zu behandeln hätte die F2-Sicherheitsgrenze aufgehoben und
fachliche Zweiwortwerte über-redigiert. Nur tatsächlich mehrzeilige,
breitenabweichende oder überlange sensible Tabellenstrukturen erzeugen den
strukturellen Ambiguitätsstopp. Die Rekonstruktion entscheidet dabei je Spalte:
Eine korrekt zusammengesetzte Geburtsdatumsspalte kann eine ungelöste Steuer-
oder Zugangsdaten-Nachbarspalte nicht mehr maskieren.

Stapelweit gespeicherte einwortige Personenaliase werden in Folgedokumenten
nicht mehr kontextfrei ersetzt. Die private Registry entscheidet weiterhin,
welches vorhandene v1-/v2-Pseudonym zu einem Alias gehört; ob eine konkrete
Fundstelle eine Person bezeichnet, entscheidet ausschließlich der aktuelle
Dokumentkontext. `Herr Einkauf`, `Ansprechpartner: Sommer` und entsprechend
beschriftete Tabellen verwenden das frühere Pseudonym, während `Der Einkauf`
und `Im Sommer` unverändert bleiben. Auch in einem Mischdokument erteilt ein
beschrifteter Fund keine dokumentweite Ersetzungslizenz. E0 einschließlich
serialisierter Fortsetzung ist grün; echter OS-Neustart und fachliche UAT
bleiben E1/E2.

Auch die Aufnahme eines ausdrücklich bezeichneten Personennamens ist jetzt
syntaktisch begrenzt: Das Label bleibt schreibweisenunabhängig, der unmittelbar
folgende Namenspräfix wird dagegen ohne globales Case-Insensitive-Flag erkannt.
Damit wird aus `Autor: Schmidt schrieb dies.` ausschließlich `Schmidt` zur
Identität; `schrieb dies` bleibt Inhalt und derselbe Name erhält in späteren
Dokumenten dasselbe Pseudonym. Zeilen- und Inline-Labels verwenden dieselbe
Logik, vollständig kleingeschriebene explizite Feldwerte bleiben unterstützt.

F7 ist mit DS-096 geschlossen. Eine enge, zeilenlokale Satzsubjekt-/
Tätigkeitsgrammatik reserviert plausible unbeschriftete Prosanamen, die der
normale Kontext nicht eindeutig auflöst, vor der automatischen Redaktion. Der
bestehende Sammelreview lässt die konkrete Stelle als Person anonymisieren oder
als Nicht-Person beibehalten. Die erste Wahl bindet das stapelweite
Personenpseudonym; derselbe bereits gebundene vollständige Name wird in späteren
Dokumenten automatisch gleich anonymisiert. Ein noch nicht gebundener möglicher
Name muss innerhalb eines Sammelreviews einheitlich entschieden werden;
„beibehalten“ gilt nur für die dabei geprüften Fundstellen. Fachphrasen werden
über Positiv-/Negativfälle gegengedeckt, und Reviewmetadaten bleiben rohwertfrei.

F17 ist begrenzt. Eine lokale, nicht als Release-Benchmark gebundene Beobachtung
zeigte bereits bei einem kleinen synthetischen Präindex-Zustand eine mehrsekündige
Aliasfenstersuche. Weil der fehlende Klartext-Startindex aus HMAC-Bindungen nicht
rekonstruiert werden kann, prüft DataSecure kleine Altstapel weiterhin exakt,
stoppt aber nach 50.000 besuchten Aliasfenstern – einschließlich wiederholter
Cachetreffer – mit einer festen Aufforderung zur erneuten Originalauswahl. Aktuelle Journale verwenden unverändert den attestierten
Startindex und sind von dieser Upgradegrenze nicht betroffen.

`open_result_folder` löst nun ausschließlich den sichtbaren Laufordner des
aktuellsten Cowork-Stapels auf. Ist genau dieser Lauf noch aktiv, fehlgeschlagen
oder noch nicht vollständig exportiert, öffnet DataSecure weder den allgemeinen
`DataSecure-Output`-Stamm noch ein älteres Ergebnis. Rekursive Ordnergrenzen
verwenden außerdem produktneutrale `SOURCE_FOLDER_*`-Fehlercodes; Cowork meldet
damit eine korrigierbare Auswahlsperre statt eines irreführenden Pickerfehlers.
Pfade und Dateinamen bleiben in beiden Fällen vollständig lokal.

Die Produktgrenze bleibt bewusst: Cowork anonymisiert TXT, Markdown, CSV und
streng geprüfte DOCX mit neutralen Ergebnisnamen. Die reine Markdown-
Konvertierung, breite Konverter-/OCR-Runtime, Verlaufstabelle, sichtbare
Zuordnung und wählbare Benennung bleiben Standalone-Funktionen. Dadurch bleibt
das normale Cowork-Paket klein und sein Ablauf besteht nach der einmaligen
Ergebnisordnerwahl weiterhin nur aus Quelle wählen, lokal abwarten und Ergebnis
öffnen beziehungsweise auf ausdrücklichen Wunsch in Claude auswerten.

Alle folgenden RC-Abschnitte sind chronologische Entwicklungsevidenz. Für den
aktuellen Produktumfang und bei Widersprüchen gelten ausschließlich der
RC123-Abschnitt oben, das Entscheidungsregister und die dort verlinkten
Verträge; ältere Abschnitte dürfen keine aktuelle Produktzusage erweitern oder
einschränken.

## Vorheriger Entwicklungsstand RC121

Der reale RC120-UAT mit der neutral referenzierten Evidence-Datei
`UAT-DOCX-COMPLEX-001` deckte eine
Produktinkonsistenz auf: Die reine Konvertierung konnte rund 13.000 Zeichen
Markdown extrahieren, der Standalone-Anonymisierungspfad stoppte dieselbe Datei
jedoch wegen Word-Custom-XML, Klassifizierungsmetadaten und Grafiken pauschal mit
`PARSER_COVERAGE_UNVERIFIED`. DS-090 führt DOCX in Standalone deshalb durch den
bereits isolierten Markdown-first-Pfad. Gültiger, nichtleerer Markdown-Inhalt
wird vollständig anonymisiert; die unvollständige Abdeckung des ursprünglichen
Word-Containers bleibt davon getrennt sichtbar.

Der echte Dokumentgegenlauf über den gebündelten Konvertierungsworker erkennt
18 Identifikatoren, wählt lokal das Personalprofil, besteht das Residual-Gate
und veröffentlicht ein Ergebnis mit `privacy_scope=extracted-markdown-only`.
Der reale Paket-Smoke deckte zusätzlich Markdown-escapte E-Mail-Adressen wie
`lina\.testfeld@example\.test` auf; die strukturierte Erkennung umfasst nun den
vollständigen Quellspan statt nur des Nachnamens. Die persönliche Quelldatei
wird nicht ins Repository übernommen; synthetische DOCX- und E-Mail-Fixtures
binden beide Fehler als Regression. Cowork bleibt unverändert streng und stoppt
dieselben nicht abgedeckten DOCX-Strukturen. Beschädigte, verschlüsselte, aktive
oder leere Quellen bleiben in beiden Produkten gesperrt.

## Vorheriger Entwicklungsstand RC120

Die sichtbare `DataSecure-Zuordnung.csv` ist jetzt wieder ein striktes Mapping:
Jede Zeile benennt eine Quelle und genau ein bereits atomar veröffentlichtes,
vorhandenes Ergebnis. Gestoppte Dateien werden nicht mehr als künstliches
„Kein Ergebnis“-Ziel eingetragen; ihre festen Fehlercodes bleiben im privaten
Laufzustand sowie in Abschluss und Diagnose erhalten. Ein vollständig gestoppter
Lauf erzeugt keinen leeren Ergebnisordner und keine sichtbare Zuordnung. Auch
historische All-stopped-Zeilen bieten keine Öffnen-Aktion mehr, können aber als
bereits veröffentlichte Benutzerdateien unverändert bestehen bleiben.

## Vorheriger Entwicklungsstand RC119

Der UAT-Lauf `Lauf-20260907-163522-142350c1` ist nicht freigabefähig: In den
vier DOCX-Ergebnissen blieben `Anna Berger`, `Murat Kaya`, `Sofia Lindner` und
`Jonas Richter` sichtbar. Der DOCX-Konverter lieferte die eindeutige
Tabellenzeile `| person | <Name> |`; der gemeinsame Personenankerkatalog kannte
aber nur andere Feldbezeichnungen. Weil die bisherige Restprüfung denselben
Katalog verwendete, blieb auch das Release-Gate blind.

RC119 ergänzt den fehlenden expliziten Anker und einen absichtlich unabhängigen,
engen Restprüfer für genau diese Tabellenform. Alle Vorkommen des jeweiligen
Namens werden dadurch im gesamten konvertierten Markdown demselben
Personenpseudonym zugeordnet. Der direkte Gegenlauf mit den vier ursprünglichen
DOCX-Dateien entfernt alle vier Klarwerte und liefert keine Restbefunde. Der
reproduzierbare 100-Dateien-Korpustest führt diese Anonymisierungsprüfung künftig
automatisch aus; die allgemeine PII-Regression und der komplexe 15-DOCX-Korpus
sind ebenfalls grün. Ein neuer Paketkandidat ersetzt RC118 erst nach den
vollständigen Standalone-/Paketprüfungen.

## Vorheriger Entwicklungsstand RC117

RC117 erweitert die reale Word-Interoperabilität und den ausführbaren UAT-
Korpus. Der DOCX-Preflight akzeptiert jetzt ausschließlich die bekannten,
internen und nicht ausführbaren Microsoft-Beziehungen `classificationlabels`
und `stylesWithEffects`; externe Ziele, Lookalikes und alle unbekannten
Beziehungen bleiben fail-closed. Der WordprocessingML-Parser ignoriert nur die
namespacegebundenen DrawingML-Layoutknoten `align`, `posOffset`, `pctHeight` und
`pctWidth`, die keinen Dokumenttext darstellen. Fremde Namespace-Bindungen
bleiben gesperrt.

Ein neuer deterministischer UAT-Korpus liefert 15 vollständig fiktive, visuell
geprüfte DOCX mit zwei, vier oder acht Seiten. Neun enthalten Personen,
Unternehmen, Kontakt-, Adress- und Bankdaten; sechs kontrollieren neutrale
Fachinhalte. Fünf Dokumente wiederholen dieselbe Person und dasselbe Unternehmen
und belegen damit die stapelweit konsistente Pseudonymisierung. Der reale
Admission-, Parser- und Anonymisierungstest ist für alle 15 Dateien grün; eine
Neuerzeugung ergab 15/15 bytegleiche DOCX. Die beiden Standalone-Funktionen
lassen sich anhand von `EXPECTED_RESULTS.csv` getrennt menschlich prüfen.

## Vorheriger Entwicklungsstand RC116

Der sichtbare RC115-UAT-Lauf mit 102 Ergebnissen wurde vollständig gegen seine
`DataSecure-Zuordnung.csv` geprüft: Alle 102 CSV-Zeilen hatten ein vorhandenes,
eindeutiges Ziel; es fehlte kein Ergebnis. Der Lauf legte jedoch sämtliche
Ergebnisse flach als `Dokument-NNN-anonymisiert.md` ab und reduzierte die Quellen
auf ihre Basisnamen. Damit war die Zuordnung technisch vollständig, aber für
einen ausgewählten Verzeichnisbaum fachlich nicht ausreichend.

DS-089/091 / BL-010.33 korrigieren die Ursache am Beginn der Datenkette. Die sichere
Ordneraufnahme übergibt jetzt den Wurzel-relativen Quellpfad an Queue, Journal
und Export. Neue Standalone-Läufe spiegeln die komplette Unterordnerstruktur;
bei Anonymisierung wählt der Anwender vor Start zwischen
`bereich/Dokument-001-anonymisiert.md` und
`bereich/quelle-anonymisiert.md`. Genau die tatsächlich erzeugte Beziehung
steht in der Zuordnungsdatei. Reine Konvertierung erzeugt entsprechend
`bereich/quelle.md` ohne Zuordnungsdatei. Pfadsegmente werden vor dem Anlegen
jedes Zielverzeichnisses validiert und die bestehenden Link-/Identitätsgates
bleiben aktiv. Vorhandene RC115-Läufe werden bewusst nicht umbenannt oder
umgeschrieben; Cowork behält seine neutralen flachen Ergebnisnamen.

Fokussierte Aufnahme-, Export-, Markdown- und Standalone-Vertragstests sowie
die vollständige Produktsuite (61 Basisgruppen und 114 direkte Testdateien)
sind grün. Der echte Paket-Smoke nimmt vier Formate über einen verschachtelten
Ordner auf und prüft Folder-Admission, Worker, Ergebnisbaum und jede
Mappingbeziehung. Das ungebundene RC116-Windows-Archiv hat 110.219.069 Byte
und SHA-256
`e074266284f36b5cf6057c077b6927dfa87b191eb354f0734d5e298baa414c88`.
Paketprüfung, realer Worker-/History-/Sidecar-Smoke und beide Produktmodi sind
grün. Der Kandidat ist Entwicklungsnachweis; commitgebundene PKG-04-/INT-13-
Evidence und sichtbarer Zielhost-UAT bleiben getrennt offen.

## Vorheriger Entwicklungsstand RC115

Standalone verarbeitet XLSX, PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP im
Anonymisierungsmodus jetzt über denselben bereits bewährten Konverter wie bei
der reinen Markdown-Erzeugung: Die Quelle wird genau einmal in Markdown
extrahiert und anschließend wird ausschließlich dieser erzeugte Markdown-Inhalt
anonymisiert. Ein gültiger, nichtleerer Inhalt darf auch bei unvollständiger
Quellenabdeckung verarbeitet werden; leere OCR, beschädigte oder unsichere
Quellen stoppen weiterhin fail-closed.

Das Ergebnis führt zwei voneinander unabhängige Aussagen: Der
**Extraktionsstatus** beschreibt, ob die ursprüngliche Quelle vollständig in
Markdown abgebildet werden konnte. Der **Anonymisierungsstatus** bestätigt nur
die Prüfung des extrahierten Markdown-Inhalts. Eine XLSX-, PPTX-, PDF- oder
Bildquelle wird daher niemals allein aufgrund einer erfolgreichen
Markdown-Anonymisierung als vollständig abgedeckt bezeichnet. Hinweis,
Ergebnismanifest und Compliance-Kopf tragen dieselbe Trennung.

Die Produktgrenze liegt nun zentral bei 200 Dateien und weiterhin 500 MiB.
Rekursive Ordneraufnahme, Renderer, privater IPC-Vertrag, Rust-Hülle und Worker
verwenden dieselbe Grenze. Der bislang irreführend scheiternde 102-Dateien-
Korpus wird dadurch vollständig aufgenommen; konkrete Größen- und
Formatfehler bleiben als eigene lokale Fehlercodes sichtbar. Sichtbare
Zuordnungsdateien erhalten ein UTF-8-BOM, damit Excel Umlaute und Gedankenstriche
ohne Mojibake öffnet.

Die vollständige Produktsuite und die gezielten 200-/201-Dateien-Grenztests
bestehen. Zusätzlich hat der echte portable Windows-Kandidat den Paket-,
Worker-, History- und isolierten Sidecar-Smoke einschließlich einer realen
XLSX-zu-Markdown-zu-Anonymisierung bestanden. Das ungebundene RC115-Archiv hat
110.218.340 Byte und SHA-256
`90b8587ed984c4b704789dc6ecaa9e9df9b19230faa3eccf2dd50e741598530f`.
Es ist Entwicklungsnachweis; native UAT und eine ausdrückliche INT-13-Bindung
bleiben davon getrennt.

## Vorheriger Entwicklungsstand RC112

DS-088 schließt zwei Bedienlücken vor dem Start: Eine vorbereitete Auswahl kann
dateiweise korrigiert oder vollständig geleert werden, ohne Quellen zu ändern
oder einen Stapel zu starten. Derselbe indexgebundene, begrenzte Vertrag gilt
für beide Standalone-Funktionen und durchläuft Renderer, Tauri, private IPC und
Application Service. Unter **Verarbeiten** ist der exakte Ergebnisordner zudem
direkt erreichbar, sobald ein vollständiger sichtbarer Lauf existiert.

Reine Konvertierung exportiert jetzt unter dem Quellbasisnamen mit `.md` und
deterministischen Kollisionsnummern. Da diese Namen selbsterklärend sind,
entfällt `DataSecure-Zuordnung.csv`; die zugehörige Verlaufsaktion ist gesperrt.
Legacy-v3-Exporte bleiben unverändert final. Die vollständigen Standalone-,
Rust-, Export-, Executor-, Dokument- und realen ZIP-Smokes sind aus dem
Arbeitsbaum grün. Das ungebundene RC112-Windows-Archiv hat 110.216.378 Byte und
SHA-256 `0c4679dfa2d602b9484083385d2925bd3e53022e343e1a7eea84c3a089980492`.
Es ist Entwicklungsnachweis, aber bis zu einem sauberen commitgebundenen Build
und menschlichem E2-Test kein neuer INT-13-Kandidat.

## Vorheriger Entwicklungsstand RC111

RC111 führte den neutralen breiten Standalone-Pfad ein; die aktuelle
Weiterentwicklung trennt Extraktions- und Anonymisierungsstatus. Der neutrale
Extraktionsvertrag bindet den gemeldeten
`source_type` jetzt an die tatsächliche Dateiendung; vertauschte oder unbekannte
Typen stoppen mit `FORMAT_COVERAGE_UNVERIFIED`. Ein echter Mischstapel aus
direkter TXT- und konvertierter XLSX-Quelle wurde in beiden Reihenfolgen sowie
über Prozessabbruch und Fortsetzung geprüft. Personen- und Unternehmenslabels
bleiben dabei stapelweit stabil und genau einmal veröffentlicht. Eine nutzbare
breite Extraktion teilt diese Labels mit den direkten Dokumenten.

PPTX validiert vor der Extraktion sämtliche XML- und Relationship-Teile gegen
DTD/Entity-Angriffe und Strukturgrenzen. PDF stoppt bei Annotationen, Outline
oder XMP-Metadaten; standardisierte Dokumentmetadaten werden im reinen
Markdown-Modus sichtbar und begrenzt erhalten. Die reale Konvertersuite umfasst
31 Gruppen und prüft bei XLSX, PPTX, Text-/Scan-PDF, PNG, JPEG und BMP die
Markdown-first-Übergabe sowie den fortbestehenden Stopp bei leerer OCR. Die
Originalcontainer werden nie als Originalformat anonymisiert. Standalone erzeugt
zuerst eine Markdown-Extraktion und anonymisiert jeden vertraglich gültigen,
nichtleeren Inhalt. Eine `incomplete` Quellenabdeckung bleibt separat in Hinweis
und Manifest sichtbar; der Anonymisierungsstatus bezieht sich ausschließlich auf
den extrahierten Markdown-Inhalt.

Der native Windows-Launcher protokolliert nun getrennte, inhaltsfreie Checkpoints
für WebView-Profil, Setup, Seitenaufbau, Frontend und IPC. Dadurch lässt sich
ein Zielhostfehler vor `page_loaded` von einem späteren Sidecar-/IPC-Fehler
unterscheiden. Der commitgebundene RC111-PKG-04-Nachweis ist aus dem sauberen
Quellcommit `b543589f3250a6ab57ddd5bc3a144f03a24ee026` abgeschlossen und INT-13
ist an genau diesen Kandidaten gebunden.
Die vollständige RC111-Produktsuite besteht mit 61 Basis-/114 direkten
Testdateien; Rust 16/16, 30 reale Konvertergruppen, Dokumentgates sowie frische
Cowork- und Standalone-Prüfungen sind grün.

Der erste PKG-04-Lauf aus sauberem RC111-Commit
`d45252f971e1f2f8737bf4af22d511c30ca3f430` baute Kandidat A und bestand Paket-,
Worker-, History- und Sidecar-Smokes. Nach dem Windows-Neustart wurde PKG-04 aus
dem sauberen Commit `c77ec592aa95f323bd5b1efe6301b111e7f2f225` erneut
ausgeführt. Beide Läufe erreichten `webview_build_started`, aber nicht
`webview_build_completed` (`STANDALONE_NATIVE_WEBVIEW_STARTUP_TIMEOUT`);
Kandidat B, Receipt und INT-13-Bindung wurden daher korrekt nicht erzeugt. Ein
zusätzlicher Start des bereits gebundenen RC109-Archivs scheiterte auf demselben
aktuell laufenden Host ebenfalls vor `page_loaded` und Sidecar-Start. Das grenzt
den Befund auf die jetzige Host-/WebView-Testumgebung ein und ist kein belegter
RC111-Produktregressionsfehler. RC109 bleibt als historisch erfolgreich
gebundener Kandidat bestehen; eine neue Bindung erfordert einen vollständig
grünen PKG-04-Lauf auf einem funktionsfähigen Zielhost.

Die anschließende unabhängige Startpfadanalyse hat diesen Befund präzisiert:
Der Test verwendete einen WebView-UDF im Checkout beziehungsweise Tempbaum,
ersetzte die Desktop-Umgebung vollständig und besaß zwei UDF-Autoritäten. Der
korrigierte Vertrag verwendet den normalen automatischen Tauri-Fensterstart,
genau einen zufälligen UDF unter `LocalAppData`, entfernt nur bekannte
Injektionen und isoliert erst den Sidecar vollständig. Ein neu gebauter RC111-
Arbeitsstand und das unveränderte RC109-Archiv erreichten damit Frontend, Core
und beide IPC-Startantworten. Der historische Kontrolllauf endete erst bei der
sicheren Bereinigung einer noch gesperrten Cachedatei fail-closed. Dieser
Kontrollbefund betrifft nicht den neuen Kandidaten: Beide RC111-PKG-04-Builds
waren bytegleich, bestanden ihre Paket-/Worker-/History-/Sidecar- und sichtbaren
nativen Windows-Smokes und bereinigten jeweils ihr eigenes Profil vollständig.

## Basisstand RC109

Aktueller Korrekturlauf: [archivierte Gesamtreview-Umsetzung](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md)
mit gemeinsamer Review-/Fortsetzungsentscheidung, konsistenten Verlaufszählern,
struktureller XLSX-Extraktion, BMP32-Korrektur, echter MCP-Schemavalidierung und
endgültigen Async-Testurteilen. Architektur/UML und Dokumentindex trennen beide
Produkte und DS-085/086. Der abschließende Korrekturstand besteht die volle
Produktsuite (57 Basis-/114 direkte Testdateien). Der Restschuldblock ergänzt
Unicode-/Kontaktgrenzen, den geschützten Support-Review-Worker, typisierte
Diagnose, DS-069-Skillfälle und frühe Bereinigung eindeutig verwaister Intakekopien.
Erste reine Core-Verträge und ein produktübergreifender Fingerprint-/Golden-
Nachweis für TXT/Markdown/CSV/DOCX, fünf Profile, Review und frische
Abbruchfortsetzung sind hinzugekommen. 27 echte Konvertertestgruppen
und zwei frische Produktbauten bestehen die Prüfung. Architektur-, Status-App-
Browser-, Dokument- und Rusttests sind zusätzlich separat grün; genaue
Nachweise und aktuelle Artefakthashes stehen im oben verlinkten Korrekturbericht.

Keine pauschale Fertigmeldung: Der einzelne AppKit-Mac-Sammelreview und der
Mac-Sichtbarkeitsadapter sind E0 implementiert und statisch/vertraglich geprüft;
ihre native Ausführung auf Intel- und ARM-Macs ist noch nicht belegt. Sieben
transportneutrale Core-Verträge einschließlich Start, Zweck, Fortschritt und
Ergebnisprojektion sind in beiden echten Produktprojektionen gebunden. Die
Golden-Abdeckung des unterstützten Anonymisierungsumfangs ist E0 abgeschlossen;
native Zielhost- und Fachabnahme bleibt offen.
Der DOCX-AlternateContent-Vertrag wählt bekannte Word-Textfelder über die
Namespace-URI und fällt sonst genau einmal zurück oder stoppt. Reale Office-
Interoperabilität bleibt offen. Der Windows-Paketbau erzeugt jetzt ein
zielgebundenes Rust-Lizenzinventar ohne `NOASSERTION` und bindet alle 259
erreichbaren Nicht-Dev-Crates an die SBOM.
Die Status-App bleibt nach Revalidierung absichtlich eine Start-Momentaufnahme;
eine terminale Projektion aus derselben Antwort wäre falsch. Ihr Edge-/axe-Gate
ist jetzt reproduzierbar. Adaptive Parallelisierung wird erst nach Zielmessung bewertet.
Native Zielhost-/Bedien-/Fachabnahmen sind davon getrennt im Backlog geführt.

DS-087 / BL-010.30 ergänzt im Standalone-Anonymisierungsmodus eine einmalige,
neutrale Extraktion für XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP vor dem bestehenden
Privacy-Core. Anonymisiert wird die erzeugte Markdown-Repräsentation, nie der
Originalcontainer. Der Vertrag enthält weder Zweck noch Publikationskennung; es
wird kein rohes Markdown-Zwischenartefakt veröffentlicht. Vertraglich gültiges,
nichtleeres Markdown tritt unabhängig von `complete` oder `incomplete` in PII-,
Pseudonym-, Review- und Residualprüfung ein. Ergebnis und Manifest führen
Quellenextraktionsabdeckung und Anonymisierungsstatus getrennt. Leere OCR sowie
unsichere Quellen stoppen weiterhin. Ein nicht bestätigtes Ende des isolierten
Konverters bleibt auch im breiten Journal-Schema `/6` als
`termination_unconfirmed` bis zur lokalen Statusanzeige erhalten. Cowork bleibt
auf TXT/MD/CSV/DOCX.

DS-086 / BL-010.29: Standalone startet auf einer kurzen Startseite. Verarbeiten
und Betriebsart sind nicht vorausgewählt. Der Verlauf zeigt die 20 neuesten
Verarbeitungen mit eigenen Ergebnis-, Zuordnungs- und Fortsetzungsaktionen.
Abschluss und Wiederherstellung wechseln weder den Tab noch öffnen sie einen
Ordner automatisch. Die Anzeigegrenze löscht keine älteren Ergebnisse.
Private Laufbindung bleibt über Neustart und Ergebniszielwechsel erhalten;
ein unbekannter oder nicht mehr verfügbarer Lauf fällt nie auf den neuesten zurück.
Quelltests, Edge-/axe-Prüfung und echter Windows-Paket-/Worker-/History-Smoke
stehen grün; beide nativen Windows-Starts mit normalen Hostrechten ebenfalls.
Der lokale Engineering-Kandidat ist
`dist/DataSecure-Standalone-3.2.0-rc109-windows-x64.zip` (110.211.662 Byte,
SHA-256 `807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`).
[Review und Nachweisgrenzen](../../tasks/archiv/2026-09-06-rc109-start-verlauf-review.md).
Der commitgebundene RC109-Kandidat und seine Nachweisgrenzen stehen im folgenden
Abschnitt.

## Historischer geprüfter Kandidat RC111

RC111 aus sauberem `main`-Quellcommit
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` ist an INT-13 gebunden. PKG-04
bestand am 07.09.2026: zwei unabhängige saubere Builds, bytegleiche ZIPs,
Desktop- und Core-Binaries sowie beide echten Paket-/Worker-/Windows-Starttests.
Je Paket wurden beide Modi, elf Konvertierungsergebnisse plus fehlerhafte CSV,
Namenerhaltung, konkrete Laufzuordnung und die optionale Supportspur geprüft.
ZIP: **110.211.527 Byte**, SHA-256
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`;
Desktop-SHA-256 `db320ef02f9682087b63fe668859c22f6b91422b2e4c9636a0413ff69cdc62fe`,
Core-SHA-256 `0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4`.
Receipt und INT-13-Bindung:
`dist/pkg-04/b543589f3250a6ab57ddd5bc3a144f03a24ee026/`.
Die vollständige Produktsuite (61 Basis-/114 direkte Testdateien), Rust 16/16,
30 echte Konvertertestgruppen und Dokumentationsgates sind grün. Das Receipt
bindet außerdem Windows 10.0.26200 x64 und die maschinenweit vorhandene
WebView2-Runtime 152.0.4191.66 inhaltsfrei an den Nachweis.
Sichtbare Anwenderabnahme und native Mac-Pakete bleiben offen;
der Windows-Pilot ist keine allgemeine Layout-/OCR-Vollständigkeitsgarantie.

## Historischer Kandidat RC109

RC109 aus `6bf7d05747e151ba8f846849229495e9fca4c041` besitzt einen eigenen
PKG-04-/INT-13-Nachweis. ZIP: 110.211.662 Byte, SHA-256
`807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`.
Dieser Nachweis bleibt historisch erhalten und wird nicht als RC111-Evidence
umetikettiert.

## Historischer Kandidat RC108

RC108 aus `a742333e8ef80b445729d4bede6a91a2b8f13207` besitzt einen eigenen
PKG-04-/INT-13-Nachweis. ZIP: 110.168.168 Byte, SHA-256
`d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
Dieser Nachweis gilt nur für RC108 und wird nicht als RC109-Evidence verwendet.

## Historischer Kandidat RC107

RC107 aus `7b88a81ff577aaa270f1354d75365b2df4a4666e` besteht die vollständige
Produktsuite (40 Basis-/111 direkte Testdateien, einschließlich 2.000 Eingaben),
zwölf Rust-Tests und den abgeschlossenen PKG-04-Zweifachbau. Beide ZIPs,
Desktop- und Core-Binaries sind bytegleich; beide Kandidaten bestehen den echten
Vierformat-/Fehlerfolgelauf und den isolierten nativen Windows-Start.
ZIP: **36.071.549 Byte**, SHA-256
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`.
Receipt und INT-13-Bindung liegen unter
`dist/pkg-04/7b88a81ff577aaa270f1354d75365b2df4a4666e/`.
Der Cowork-ZIP-Build desselben Quellstands ist ebenfalls grün.
Dies belegt nicht den anschließenden Funktionsausbau, macOS oder die sichtbare
Explorer-/Finder-/Cowork-Anwenderabnahme. Die unten dokumentierten früheren
gescheiterten Paketversuche sind historische Gegencheck-Evidence.

## Aktueller Funktionsumfang: aktivierte Standalone-Konvertierung

Nach dem gebundenen RC107-Kandidaten wurde **Nur in Markdown umwandeln** als
eigene Standalone-Funktion durch Frontend, Rust, private IPC, Intake-v2, eigene Worker-
Nachrichten, v5-Journal, `dm_`-Store, Recovery und v4-Export verbunden. Es gibt
keine PII-Ersetzung, keinen Pseudonymseed und keinen PII-Review. Dateien wählen
oder hineinziehen, die Auswahl einzeln korrigieren oder leeren, starten,
Ergebnisse öffnen. Namen und Inhalte bleiben erhalten; Ausgaben behalten ihren
Quellbasisnamen und liegen getrennt unter `DataSecure-Markdown/Lauf-…`. Eine
Zuordnungsdatei wird nicht erzeugt. Text-/OCR-/Coverage-Hinweise werden ohne
Zusatzdialog gespeichert; schlechte oder geschützte Dateien erhalten feste
Diagnoseereignisse, der übrige Stapel läuft weiter.
Nur bereits vorhandene Konvertierungspläne mit Export-Schema
`datasecure-result-export/3` behalten ihre frühere Recovery-Zusage: War ein
solcher Plan noch nicht vollständig abgeschlossen, beendet der Replay auch
seine laufbezogene `DataSecure-Zuordnung.csv`. Der aktuelle Modus und alle neu
angelegten Läufe bleiben ohne Zuordnung.
TXT/MD/CSV/DOCX/XLSX/PPTX, PDF/Scan-PDF und PNG/JPEG/BMP nutzen einen gebündelten
Offline-Worker mit normalem Node, PDF.js, Canvas, Tesseract und DE/EN-Modellen.
Der unabhängige Integrationsreview fand und korrigierte einen gemeinsamen
Windows-Launcher-Race bei frühem Abbruch sowie fehlende v5-Snapshot-/Recovery-
Übergänge. Der neue vollständige Produkt-/PKG-04-Nachweis gehört ausschließlich
zu `a742333`; der historische RC107-Receipt bleibt Beleg für `7b88a81`.

Die vollständige RC108-Produktsuite ist grün (48 Basis-/111 direkte Testdateien),
ebenso Rust 15/15, Frontend 18/18, Dokumentationsgates und Cowork-Build. Der echte
RC108-Paketlauf besteht beide Modi, elf Konvertierungsergebnisse plus
Fehlerposition, genaue Laufzuordnung und optionale Supportereignisse. Der finale
Zweifachbau und beide nativen Windows-Starts sind mit dem obigen Receipt belegt.
Details: [RC108-Abschlussreview](../../tasks/archiv/2026-09-06-standalone-markdown-rc108-abschluss.md).

Historische Abschlussprüfung des Zwischenstands `2f173f9` am 06.09.2026:
`test:product` vollständig grün (43 Basis- und 111 direkte Testdateien,
einschließlich 2.000 Eingaben und echter 100-Dateien-Crash-/Fortsetzungsläufe),
Rust 14/14 und `test:conversion:engineering` grün. Der letzte unabhängige
Gegencheck schließt außerdem ein verfrühtes Scan-PDF-Abbruchsignal: Nach
OCR-Start wird dessen bestätigtes Prozessende abgewartet; verweigerte oder
unbestätigte Beendigung bleibt als `OCR_TERMINATION_UNCONFIRMED` erkennbar.
Die erweiterten realen Scan-PDF-Lifecyclefälle bestehen auch mit gebündeltem
Node 22. Das ersetzt weder den vollständigen Konvertierungsworkflow noch
einen neuen Paket-/INT-13-Nachweis.

## Produkt in einem Satz

DataSecure bietet ein lokales Claude-Plugin und eine eigenständige Desktop-App
zur De-Identifizierung von Geschäftsdokumenten. Originale werden lokal gewählt
und niemals automatisch verändert oder gelöscht. Nur freigegebene,
de-identifizierte Markdown-Ergebnisse dürfen Claude erreichen. Die zweite
Standalone-Kernfunktion **Nur in Markdown umwandeln** ohne Anonymisierung ist
implementiert und aktiviert; die Zielhost-/Anwenderabnahme bleibt gesondert
offen (DS-085/BL-010.28).

Neue Standalone-Anonymisierungsstapel verwenden lesbare, neustartfeste Nummern für Personen,
Unternehmen und Projekte; bestehende v1-Stapel und Plugin-Ausgaben behalten ihr
Format. Eine gemeinsame Lookup-Korrektur lädt bekannte Unternehmensbindungen im
Folgedokument wieder in die Ersetzungsliste. Native Dragdrop-Aufnahme verwendet
denselben Admissionvertrag wie der Picker und verlangt weiterhin den expliziten
Start. Die Cowork-Abschlussansicht bindet ihren Öffnen-Knopf an den konkreten
sichtbaren Exportlauf und behauptet bei nicht verfügbarem Ziel keinen Erfolg.

RC106-Gegencheck am 05.09.2026: `test:product` vollständig grün (39 Basis-
und 111 direkt registrierte Testdateien, einschließlich 2.000 variierender
Eingaben), zusätzlich Standalone-/Rust-, Dokumentations-, Skill- und
Status-App-Gates. Der Paket-Smoke verlangt jetzt vier echte TXT/Markdown/CSV/
DOCX-Eingaben, stabile lesbare Kennungen, unveränderte Originale und die genaue
Laufzuordnung. Der RC106-Kandidat wurde aus `17a21608223dcefd96c20e4b739ff6e39d638b58`
zweimal bytegleich gebaut und an INT-13 gebunden: 36.056.971 Byte, SHA-256
`12ea72d69ff65ae6f10c3319852cd8a0b4cc5182e6607582900602bf7faecbec`.
Der Receipt unter `dist/pkg-04/17a21608223dcefd96c20e4b739ff6e39d638b58/`
belegt diesen historischen Kandidaten, nicht spätere Änderungen.
Sichtbare Dragdrop-/Finder-/Explorer-Abnahme bleibt separat.
Der erste RC106-Paketlauf bestand die vierformatige Verarbeitung; der native
WebView-Start war in der Sandbox blockiert und bestand unverändert mit normalen
Hostrechten. Der unabhängige Gegencheck begrenzt außerdem den neuen Fenster-Hook
auf optional vorhandenen Zustand bei tatsächlichem Drop, damit frühe
Fensterereignisse vor dem Tauri-Setup keinen Panic auslösen können.

### Nachprüfung und aktueller Korrekturschnitt

Nachtrag 06.09.2026: Bekannte Firmen-/Personenformen werden auch nach dem echten
Dokumentwechsel (neue Registry aus Journal) ohne erneutes Namensfeld abgeglichen.
Das schließt Klammern und weitere bereits akzeptierte Namensseparatoren ein.
Getrennte v1-Rollen-/Identitätsbindungen vermeiden falsche UNKLAR-Zuordnungen;
verschiedene Rechtsformen bleiben getrennt. Der neue optionale HMAC-Startindex
beschleunigt die exakte Mitgliedschaftsprüfung ohne persistierte Namen.
34 Registry-, 23 State-, 17 Item-, 17 Journal- und 120 PII-Fälle sind grün.
Diese gezielten Prüfungen ersetzen nicht den abschließenden neuen Zweifachbau.

Der erneute unabhängige Review fand trotz grüner RC106-Gates eine ungetrennte
native Testdatenumgebung, verlorene Polltimer, veraltete Laufanzeigen, eine
Zuordnungszusage für den falschen Vorgängerlauf und Firmenkurzformen mit falscher
PERSON-Kennung. Diese Fehler sind unter den bestehenden Storys im Backlog
mit Regressionen geschlossen. Der alte native Startnachweis belegt keine Testdatenisolation und
keine sichtbare Explorer-/Finder-Bedienung; es ist kein Datenverlust nachgewiesen.
Neue native Tests dürfen erst den explizit isolierten Profilvertrag verwenden.
Frontend-Regressionsfälle gehören jetzt zum normalen `test:product`-Profil.

Der abschließende Lifecycle-Gegencheck korrigiert außerdem einen nach Desktop-EOF
weiterlebenden Steuerprozess: EOF, defekte Frames und abgebrochene Ausgabepipes
beenden nur den Sidecar; bereits dauerhaft übergebene Stapelworker dürfen weiter
abschließen. Wartende Desktopaktionen starten nicht nach. Sieben echte
Prozess-/Worker-Szenarien und zwei Protokoll-/Startfälle prüfen das Verhalten;
Cowork besitzt bereits einen getrennten begrenzten Shutdown und benötigt keine
entsprechende Produktänderung.

Lokale RC107-E0-Evidence: `test:product` vollständig grün (40 Basis- und 111
direkte Testdateien, einschließlich 2.000 Eingaben und echter 100-Dateien-
Crash-/Fortsetzungsläufe). Nach den letzten Gegencheck-Korrekturen wurde
`test:standalone` nochmals vollständig ausgeführt: 38 Produkttests, 14
Frontendfälle, die echten Sidecar-Lifecyclefälle, 11 Desktop-, 5 Paket-, 9
MarkItDown-Vertrags- sowie 12 Rust-Tests grün. Dies ist kein Nachweis für
fehlerfreie beliebige Eingaben oder sichtbare Zielhostbedienung.

Der danach erstmals ausgeführte verschärfte Paket-Folgestapel fand einen weiteren
gemeinsamen Runtime-Fehler: Ein vollständig abgewiesener CSV-Parserlauf erhielt
keinen Fehlercode und wurde dadurch als `PROCESSING_INTERRUPTED` wiederaufnehmbar.
Der erste RC107-Build aus `ebffe87` ist deshalb ausdrücklich kein Kandidat für
INT-13. Die Korrektur klassifiziert bestätigte Parserablehnungen als `PARSE_FAILED`;
unbekannte Prozessabbrüche bleiben getrennt, Zeitüberschreitungen erhalten
`PARSER_TIMEOUT`. Erst nach dieser Korrektur und ihren Regressionen wird die
Commit-/Zweifach-Build-/Smoke-Kette erneut ausgeführt.
Der unabhängige Gegencheck bestätigt die Unterscheidung; 19 Parser-Isolations-
und 16 gemeinsame Itemprozessor-Tests sind nach der Korrektur grün, einschließlich
echter fehlerhafter CSV-Bytes. Content-Graph- und DOCX-Vertrags-/Differentialtests
bleiben grün. `PARSE_FAILED` bedeutet sichere Ablehnung, nicht zwingend einen
alleinigen Defekt der Quelldatei: Auch abgelehnte interne Parsergrenzen bleiben
gesperrt. Der Paketnachweis wird separat neu erbracht.

Auf dem Parser-Korrekturcommit `aaecf59` bestand zusätzlich die lokale
CI-Produktsuite (40 Basis- und 48 direkte Testdateien), ohne GitHub Actions.
Das neu gepackte Windows-Artefakt bestand den echten Vierformatlauf, den
vollständig abgewiesenen CSV-Folgestapel und den isolierten nativen Tauri-Start.
Die anschließende Testbereinigung stoppte jedoch vor der ersten Löschung an
einer von Windows angelegten Cache-Junction im frischen Testprofil. Dieser
Testrest bleibt unverändert; der unvollständige PKG-04-Lauf erhält keine
INT-13-Bindung. Ein korrigierter Testharness benötigt einen neuen Quellcommit
und erneut zwei vollständige Builds und Smokes.
Der Gegenlauf mit dem ersten korrigierten Harness bestätigte den nativen Start,
zeigte aber einen weiteren Testadapterfehler: Windows PowerShell lieferte für
die echte Cache-Junction keine Link-Metadaten. Auch dieser neue Testrest bleibt
erhalten. Der Harness liest nun den exakten Mount-Point-Tag und das Ziel direkt
über einen No-follow-Windows-Handle; synthetische Null-Provider- und Bufferfälle
ergänzen den Gegencheck. Kein fehlender Anzeigename erlaubt eine pauschale
Linkfreigabe. Eine erfolgreiche neue PKG-04-Kette bleibt Voraussetzung.
Der anschließend neu gestartete isolierte native Lauf bestand Start, beide
IPC-Antworten und die vollständige Bereinigung von 426 eigenen Testeinträgen.
Die zwei früheren Testprofile blieben unangetastet. Damit ist die
Harness-Korrektur E0-belegt, nicht jedoch die noch ausstehende Zweifachbindung
des abschließenden Produktcommits.

Neue Standalone-Läufe führen ausschließlich tatsächlich veröffentlichte
Ergebnisse in ihrer eigenen Zuordnung. Gestoppte Quellen bleiben im privaten
Status und in der Diagnose. Der aktuelle Laufresolver fällt niemals auf frühere
Ergebnisse zurück. Bereits veröffentlichte Altzuordnungen bleiben unverändert;
historische All-stopped-Läufe erhalten aber keine Ergebnis- oder
Zuordnungsaktion. Cowork erhält weder diese Zuordnungen noch Quelldateinamen.
Der Exportvertrag verweigert außerdem mehrdeutige Records, in denen dieselbe
Quelle doppelt oder zugleich als erfolgreich und gestoppt vorkommt. Der reale
Paket-Smoke prüft den Markdown-first-XLSX-Pfad nun auf genau eine finale
Erfolgszeile, UTF-8-BOM und das Fehlen eines vorläufigen Coverage-Stopps. Eine
Bestandsprüfung der zehn vorhandenen UAT-Läufe bestätigte: neun Zuordnungen
verweisen vollständig auf vorhandene Ergebnisse; genau der historische,
tatsächlich gestoppte Lauf enthält zwei Stopzeilen. Altdateien werden als
Benutzereigentum bewusst nicht nachträglich umgeschrieben.
Ein neuer Freigabekandidat benötigt erneut Commit-, Build- und Smoke-Evidence;
die RC106-Bindung darf nicht nachträglich umetikettiert werden.

## Belegter Produktumfang

- Cowork-Anwenderkanal heute: das zielsystemspezifische, selbsttragende Plugin-ZIP.
  Der private Marketplace ist der gleichwertige Zielkanal (DS-002/DS-067), aber
  noch nicht freigegeben: Der Build erzeugt eine streng validierbare,
  selbsttragende Git-Marketplace-Projektion mit relativer Quelle. Veröffentlichung
  in einem privaten/internen Marketplace-Repository sowie Fresh-Install- und
  Update-Nachweise bleiben BL-010.8/BL-051.2.
- MCPB: internes Engineering-Artefakt, kein Installations-, Fallback- oder
  Supportweg für Anwender.
- Anonymisierung in beiden Produkten: TXT, Markdown (`.md`, `.markdown`), CSV
  und DOCX sind freigegeben. Standalone führt DOCX sowie breite Quellen über den
  DS-087/DS-090-Verkettungspfad; Cowork verarbeitet DOCX weiterhin direkt und
  streng. Gültiger, nichtleerer extrahierter Markdown-Inhalt
  wird anonymisiert; die häufig `incomplete` Quellenabdeckung bleibt separat
  sichtbar. Im Cowork-Produkt bleiben breite Quellen bereits bei der Aufnahme
  gesperrt.
- Reine Standalone-Konvertierung: zusätzlich XLSX, PPTX, PDF/Scan-PDF sowie
  PNG/JPEG/BMP im Produktpfad aktiviert. Extraktionshinweise und Fehler bleiben
  laufbezogen sichtbar. Der Windows-Engineering-Paketnachweis ist an den oben
  genannten RC111-Commit `b543589f3250a6ab57ddd5bc3a144f03a24ee026`
  gebunden; Zielhost-/Anwenderfreigabe bleibt offen.
- Stapel: höchstens 200 Dateien und 500 MiB; nur ein aktiver Stapel.
- Bilder aus DOCX: Pixel bleiben lokal; kein auswählbarer Bildmodus und keine
  Freigabe über Claude.
- Speicherung: lokale Plain-Arbeits- und Reviewkopien ohne Schlüsselbund,
  Passwort oder zusätzliche Verschlüsselung.
- Aufbewahrung: konfigurierbar 0–14 Tage nur für temporäre DataSecure-Arbeits-
  und Reviewdaten. Quellen/Originale und fertige Exporte werden niemals
  automatisch gelöscht.
- Anonymisierungsergebnis: Markdown pro freigegebener Datei plus dauerhaft lokale private
  `DataSecure-Mapping.csv`; rekursive relative Labels und gleiche Basenames aus
  unterschiedlichen lokalen Ordnern bleiben darin kollisionsfrei unterscheidbar.
  Standalone projiziert bei Anonymisierung nach vollständigem Abschluss eine
  atomar erzeugte `DataSecure-Zuordnung.csv` in genau den sichtbaren Laufordner
  unter `DataSecure-Output`. Reine Konvertate liegen unter
  `DataSecure-Markdown`, behalten den Quellbasisnamen mit `.md` und benötigen
  keine Zuordnungsdatei; Kollisionen werden deterministisch nummeriert.
- Sichtbarer Cowork-Export: Beim ersten Lauf wird ein Ergebnisordner einmal lokal
  gewählt, die Output-Anlage geprüft und das Ziel erst danach identitätsgebunden
  gespeichert. Nur verifiziertes Markdown mit
  neutralen Namen gelangt nach `DataSecure-Output/Lauf-…`; die private globale
  Zuordnung, Originale, Review und Recovery bleiben privat. Nur ein fehlgeschlagener Export wird lokal
  vorgemerkt und beim nächsten Start oder Ordnerwechsel genau einmal nachgeholt.
  Gemäß DS-079 entsteht der sichtbare Laufordner erst, wenn der gesamte Stapel
  einschließlich eines nötigen Sammelreviews abgeschlossen ist. Klare Positionen
  bleiben bis dahin nur intern dauerhaft. Nach dem sichtbaren Abschluss ist jede
  Ergebnisdatei endgültig: vom Anwender gelöschte oder bearbeitete Ergebnisse
  werden weder überschrieben noch wiederhergestellt, und ein späterer
  Ordnerwechsel spiegelt keine früheren Läufe in den neuen Ordner. Der Outputbaum
  ist als rekursive Quelle gesperrt.
  Export-Claims werden identitätsgebunden und mit begrenztem transientem Retry
  freigegeben. Bleibt die Freigabe unsicher, melden Terminalexport und Replay
  keinen Erfolg; der gesamte betroffene Export bleibt sichtbar ausstehend.

## Claude-/Cowork-Grenze

Der lokale Plugin-MCP kann in einer lokalen Cowork-Sitzung eines bestehenden
Claude-Desktop-Deployments oder in lokalem Claude Code genutzt werden, wenn
`data-secure-local` tatsächlich verbunden ist. Lokale MCP-Server laufen laut
Hersteller nicht in Cloud-Sitzungen; Cloud-Cowork, Web, Mobil und geplante
Cloud-Aufgaben erhalten deshalb keinen Originalzugriff. Die lokale CLI 2.1.233 validiert
Quellplugin und Marketplace streng; das ist kein Fresh-Install- oder
Cowork-Laufnachweis. Bereits freigegebenes Markdown darf weiterhin in diesen
Cloud-Sitzungen verwendet werden. Die offizielle aktuelle Hostdokumentation wird vor jeder
Freigabe erneut geprüft.

## Teststand

Manifest-, Retention-, Architektur-, Format-, Picker-, Handoff-, Recovery-,
Gateway- und Dokumentenverträge sind automatisiert. Das vollständige historische
Testjournal liegt unter
[`docs/archive/2026-09/testing`](../archive/2026-09/testing/TESTING_HISTORY_THROUGH_RC84.md).
Aktuelle Testklassen und Befehle stehen in [`docs/TESTING.md`](../TESTING.md).
Automatisierte Tests ersetzen keine Windows-/macOS-Fresh-Install-, Cowork-, UX-,
Accessibility-, Security- oder Fachabnahme.

RC102 schließt den im nativen Windows-UAT sichtbaren Startfehler
`STANDALONE_IPC_FAILED`: Tauri lieferte den Ressourcenpfad korrekt in der
Windows-Verbatim-Schreibweise (`\\?\C:\…`), Node beendete sich jedoch vor dem
Sidecarstart an dem absolut übergebenen Preloadpfad. Die Desktop-Hülle prüft
weiterhin die unveränderten Paketdateien, normalisiert ausschließlich die an den
Kindprozess übergebene Pfadschreibweise und lädt den gebundenen Network-Deny-
Preloader relativ zum geprüften Arbeitsverzeichnis. Rust-Unit-, Paket- und
echter nativer EXE-Starttest verlangen bestätigte Sidecar- und IPC-Ereignisse.
Diese Tauri-spezifische Ursache existiert im Cowork-Plugin nicht; dort sichern
echte Worker-ACKs und Queue-Envelope-Validierung den vergleichbaren
Mock-/Scheinerfolgsfehler ab.

Die häufige Standalone-Statusabfrage enumeriert Recovery-Zähler und den aktiven
beziehungsweise ausdrücklich fortgesetzten Lauf gemeinsam; ohne eine solche
Laufbindung verwendet sie den jüngsten eigenen Stapel. Auch bei 1.000
aufbewahrten Journalen gibt es pro
Poll genau einen Verzeichnisscan und höchstens einen Read je Journal; die
Produktoberfläche zeigt die laufbezogene Zuordnung eines Mischstapels erst nach
einem terminalen sichtbaren Ergebnis. Die frühere RC107-Übersicht für einen
vollständig gestoppten Lauf ist durch RC120 ersetzt: Ohne Ergebnis entstehen
weder sichtbarer Laufordner noch Zuordnung; Fehlercodes bleiben in Abschluss
und Diagnose. Scheitert bei einem Mischlauf nur die Abschlussübersicht, bleibt
die Anzeige ausdrücklich `export_pending`, ohne
bereits fertige Dokumente als fehlgeschlagen zu zählen. Bei der Anonymisierung
bleibt die private globale Zuordnung zusätzlich für die lokale
Nachvollziehbarkeit erhalten.

Im Anonymisierungsmodus erkennt und entfernt der gemeinsame Kern direkte Identifikatoren einschließlich
mehrsprachiger Namensfelder, Anreden, Kontakt-URIs, Telefon-, Adress-, Steuer- und
Bankdaten. Mehrzeilige sensible Tabellenköpfe werden nur bis zur belegten
eindeutigen Struktur ausgewertet; verschobene, ungleich breite oder längere
Strukturen stoppen am unabhängigen Residual-Gate. Zusammengeführte DOCX-Zellen
stoppen, bis sie koordinatentreu unterstützt werden. Zertifizierungsanbieter und
IT-/Health-IT-Fachbegriffe bleiben kontextgebunden erhalten.

Intake, Fortsetzung und Review gelten erst nach echtem Worker-ACK als lokal
angenommen. Dieses ACK ist bewusst noch kein dauerhafter Stapelcheckpoint: Die
öffentliche Startantwort benennt bis dahin `checkpoint_pending` und behauptet
weder laufende noch bereits fortsetzbare Verarbeitung. Executor-Leases binden
ihren Eigentümer an PID und Betriebssystem-Startidentität; eine wiederverwendete
PID kann daher keine alte Lease übernehmen, während ein nicht sicher
beobachtbarer Eigentümer fail-closed blockiert.
Der lokale Hintergrundlauf geht nach der vollständigen Stapelanalyse direkt in
einen erforderlichen Sammelreview; „Später“ pausiert ohne Freigabe und ohne
zweiten Picker. Abschlussanzeige und sichtbarer Export besitzen getrennte,
dauerhafte Zustände. Detached Worker und Parser starten aus einem geprüften
versionsgebundenen Runtime-Cache; bei einer eindeutig erkannten temporären
Claude-Umleitung wird nur unter Windows das reguläre LocalAppData des bestehenden
Benutzerprofils verwendet. Der entsprechende echte Cowork-Wiederholungslauf auf
Windows und alle macOS-Zielhostnachweise bleiben offen.

Der Unterbau des eigenständigen DataSecure-Standalone-Produkts ist als
E0-Vertikalschnitt vorhanden: eine kleine technische CLI ruft die lokale Engine
direkt auf, ohne MCP-/JSON-RPC-Umweg. Vor Laden des Core wird ein eigener
`SecureDataMsg-Standalone`-Datenroot aktiviert und an Hintergrundworker
weitergereicht. Plugin und Standalone verwenden dieselbe neutrale geordnete
Start-/Recovery-Transaktion. Damit
sind Journale, Einstellungen, Review und Exporte physisch vom Claude-Plugin
getrennt. Sieben reine Core-Verträge sind von MCP-, Desktop- und
Dateisystemadaptern getrennt und durch statischen Importabschluss, isolierte
VM-Ausführung sowie echte Cross-Product-Projektionsgates abgesichert. Breitere
Format-/Profil-/Recovery-Goldenabdeckung bleibt BL-010.23. Eine reale Tauri-2-Hülle mit
nativem Datei-/Ordnerdialog, privatem längengerahmtem Sidecar-Kanal und
inhaltsfreier Rendererprojektion ist auf Windows x64 kompiliert und im
laufenden Prozess geprüft. Ein eigenes selbsttragendes Windows-x64-
Engineering-Paket wurde gebaut, verifiziert und in einem isolierten Pfad ohne
System-Node gestartet. Native, ad-hoc signierte macOS-App-Bundles wurden auf
Intel und Apple Silicon gebaut und über ihre private IPC-Grenze gestartet.
Herunterladbare macOS-Archive und Zielsystem-UAT fehlen; der Schnitt ist deshalb
noch kein freigegebenes Standalone-Produkt.
Die Standalone-Oberfläche zeigt Vorbereitung und danach passive, inhaltsfreie
Fortschrittszähler. Einen terminalen Zustand bestätigt sie dem Worker erst nach
einem tatsächlichen Renderer-Paint und nur mit der zu diesem Zustand gehörenden
inhaltsfreien Generationsnummer. Verspätete und doppelte ACKs sind inert; fehlt
das passende ACK, wird keine sichtbare Darstellung behauptet. Standalone
protokolliert den Timeout und stellt den Zustand über seine eigene UI wieder
bereit; es öffnet keinen zusätzlichen Cowork-Abschlussdialog. Der getrennte
Cowork-Abschluss nutzt unter Windows ein echtes natives `Shown`-Ereignis statt
eines bloßen Prozessstarts. Der macOS-Adapter verlangt nun ebenfalls eine
sichtbare AppKit-Fensterbestätigung (`SHOWN`). Die native Ausführung auf Intel
und Apple Silicon bleibt Zielhostevidenz.
Seit DS-086/DS-088 besitzt Standalone die drei Hauptansichten **Start**,
**Verarbeiten** und **Verlauf**. Die App startet auf **Start** ohne vorbelegte
Betriebsart. Vor dem Start können einzelne eindeutig dargestellte Dateien aus
der Auswahl entfernt oder die gesamte Auswahl geleert werden; beide Funktionen
verwenden denselben Admissionvertrag. Auswahl, Wiederherstellung und Abschluss ändern die Navigation
nicht automatisch. **Verlauf** zeigt die 20 neuesten Verarbeitungen mit
Datum, Zweck, Zählern und Status. Ergebnisordner, eine bei Anonymisierung
vorhandene Zuordnung und Fortsetzung gehören jeweils ausschließlich zur gewählten Zeile. Der Core löst dafür den
exakten sichtbaren `Lauf-*`-Ordner beziehungsweise dessen Mappingdatei auf;
ein fehlendes Ziel führt nicht zum Öffnen eines anderen Laufs.
Nur der vertrauenswürdige Rust-Host erhält dieses Ziel über den privaten
Längenframe; der Renderer erhält aus der Öffnungsaktion weiterhin keinen Pfad.
Rust validiert Existenz, absoluten Pfad, Typ und Linkfreiheit und startet danach
Explorer, Finder oder `xdg-open` ohne versteckte Fensteroption. Die Oberfläche
bestätigt den Handoff getrennt vom fachlichen Abschlussstatus. Die Diagnose
protokolliert dabei ausschließlich Aktion, Ausgang und festen Fehlercode,
niemals Pfad, Dateiname oder Inhalt. Ein Standalone-Lauf gilt erst dann als
sichtbar abgeschlossen, wenn alle Ergebnisdateien und – ausschließlich bei
Anonymisierung – seine atomar veröffentlichte `DataSecure-Zuordnung.csv`
vorhanden sind. Die Zuordnung enthält nur die lokale Quellbezeichnung und den
tatsächlich erzeugten Ergebnisnamen. Neutral ist der datensparende
Standalone-Standard; wahlweise bleibt der Quellbasisname mit `-anonymisiert`
erhalten. Die Wahl ist im v6-Stapeljournal für Wiederaufnahme und Export
unveränderlich gebunden. Reine Konvertate behalten den Quellbasisnamen; ihre
Zuordnungsaktion ist deaktiviert. Eine Ergänzung noch
unvollständiger älterer Exportprojektionen bleibt an das zugehörige private
Stapeljournal gebunden. Bereits endgültige sichtbare Exporte werden nicht
überschrieben oder wiederhergestellt. Der Cowork-Export erhält diese Datei
ausdrücklich nicht. Die
Oberfläche zeigt ihre Produktversion, damit kein älterer entpackter Kandidat
unbemerkt in eine aktuelle Abnahme gerät.
Ein geschlossener UI-Zustands-/IPC-Vertrag verhindert Rohbytes und direkten
Dateisystemzugriff im Renderer. Ausgewählte Dateinamen, Quellenordner und das
Ergebnisziel werden ausschließlich im lokalen Standalone-Fenster angezeigt und
fehlen strukturell in Diagnose, Supportspur und externen Antworten;
Pflichtzähler und Zustandsübergänge stoppen bei fehlenden, regressiven oder
widersprüchlichen Werten. Der aktuelle Zielkatalog bindet vier getrennte Pakete
an exakte Rust-Triples: Windows x64, macOS Intel, macOS Apple Silicon und Linux
x64 glibc. Das Entwicklungsziel für beide macOS-Pakete ist 13.5. Die
veröffentlichten RC140-ZIPs verlangen jedoch wegen des Supervisors Intel 15.0
beziehungsweise ARM 14.0 (MAC-20260923-01). Node selbst verlangt darin 11.0;
eine pauschale Ableitung der Produktmindestversion allein aus Node ist falsch.
Zertifikatsfreie macOS-Piloten werden ausdrücklich ad-hoc signiert
(`signingIdentity: "-"`). Ein neues GitHub-Actions-Gate bildet dafür eine
kostenkontrollierte Zielhost-Sandbox: Es ist nur über `workflow_dispatch`
startbar, verlangt eine ausdrückliche Bestätigung möglicher privater Runner-
Minuten und wählt standardmäßig nur Apple Silicon. Auf `macos-15-intel` und
`macos-14` werden die gepinnte Node-Runtime, der nativ kompilierte POSIX-
Supervisor, die vollständigen Standalone-/Konverter-/Rust-Verträge, Clippy,
der Tauri-Release-Build und im korrigierten Gate alle nativen Komponenten
einschließlich Canvas-Addon geprüft. Der erneute native Nachweis steht aus.
Es verwendet keine Secrets und keinen Cache. Ein ausdrücklicher optionaler
Upload stellt nur das verifizierte ZIP samt Prüfsumme für einen Tag bereit. Die nativen
Rohbuilds sind durch Apple-Silicon-Lauf `34285518668` auf Commit `487bfe1` und
Intel-Lauf `34318293471` auf Commit `1cf2d53` belegt. Die erweiterten Läufe
`34321954381` und `34322534571` auf Commit `5243799` bauen, signatur- und
architekturprüfen und starten zusätzlich das jeweils echte App-Bundle bis durch
die private IPC-/Core-Grenze. Die Distributionsläufe `34334520861` und
`34335259239` auf Commit `06c2669d` belegen darüber hinaus den bytegleichen
Doppelbau, Paketmetadaten, Dateimodi und den erneuten Start aus dem entpackten
ZIP. Gatekeeper, beobachtete Fenster, Picker, VoiceOver, Performance und
menschliche UAT auf Intel und Apple Silicon bleiben offen.
Rust und Tauri sind ausschließlich Buildwerkzeuge; Anwender installieren weder
Rust noch Node oder Python. Der Windows-Build wurde mit Rust 1.98.1, Tauri
2.11.5 und MSVC erfolgreich gebaut; `cargo test --locked`, Clippy,
Paketprüfung und ein isolierter Start-/Stopp-Smoke sind grün. Der Paketbau
erzeugt die geschlossene Runtimeprojektion immer frisch aus dem aktuellen
Quellbaum. Die Pilotoberfläche kann Ergebnisordner und laufbezogene Zuordnungsdatei über
getrennte inhaltsfreie IPC-Aktionen öffnen. Abschluss-, Fehler-, Review- und
Ergebniszähler stammen aus dem aktiven beziehungsweise ausdrücklich
fortgesetzten Standalone-Stapel, sonst aus dem jüngsten eigenen Stapel.
Jede Verlaufszeile behält ihre eigenen Zähler und Aktionen. Ein intern
abgeschlossenes Paket ohne vollständig sichtbaren Export erscheint ehrlich als
`export_pending`; offene Exporte werden beim Start und nach einer
Ergebnisordnerwahl erneut versucht. Ein Teilexport bindet sein Ziel vor dem
ersten Item und kann deshalb nicht auf zwei Ordner verteilt werden. Standalone-
Worker delegieren terminale Meldungen an die Tauri-Oberfläche und öffnen keinen
Cowork-Abschlussdialog. Nach Sidecar-Neustart oder verlorenem Admission-Zustand
setzt der Renderer seine veraltete Startfreigabe zurück. Die laufgebundene
Öffnen-Aktion und ein exklusiver Export-Outbox-Claim sind E0 geschlossen. Offen
bleiben Windows-UAT, Accessibility-/Performance-Messung sowie sichtbare native
UATs auf macOS Intel/ARM und Linux x64. Die maschinenlesbare Rust-Komponenten- und
SBOM-Aufbereitung ist E0 abgeschlossen; eine organisatorisch verlangte
menschliche Lizenzfreigabe bleibt davon getrennt.

RC101 schließt den im echten Windows-Piloten reproduzierten Picker-/Admission-
Defekt: Der Normalisierer liefert `{name, full, sourceBytes, sourceLabel}`; der
Standalone-Service verwendet exakt dieses Schema und liefert die lokale
Quellen-/Datei-/Ergebnisanzeige atomar mit der Aufnahmeantwort. Der zuvor
verwendete Identitäts-Mock wurde aus den betroffenen Standalone- und Cowork-
Vertragstests entfernt. Der selbsttragende Paket-Smoke nimmt nun eine echte
TXT-Datei über den extrahierten Sidecar auf und konfiguriert ein echtes lokales
Ergebnisziel. Zwei rotierende, inhaltsfreie JSONL-Spuren für Desktop und Sidecar
sind über **Diagnose öffnen** erreichbar. Dieselbe Queue wird vor Prozessstart
und im Worker vor dessen Annahmebestätigung schema-validiert; Cowork kann damit
eine strukturell unbrauchbare Warteschlange nicht mehr als übergeben melden.

Der wiederholte RC99-Gegencheck bindet alle globalen Lock-Freigaben an einen
gemeinsamen fail-closed Vertrag: eine verweigerte oder fehlgeschlagene Freigabe
kann keinen Verarbeitungserfolg mehr melden, verdeckt aber keinen bereits
laufenden Primärfehler. Der reale verzögerte Pipeline-Test erreicht wieder beide
Publikationsbarrieren und besitzt einen harten Timeout. Export-Replay zählt nach
einem Recordfehler alle weiter offenen Dateien. Standalone unterscheidet nun
Fortsetzung, offenen Export und einen vollständig sicher gestoppten Stapel auch
in UI und CLI; eine Fortsetzung gilt erst nach Startmarker und Worker-ACK.

Microsoft MarkItDown 0.1.7 ist als gepinnter, netz-/pluginfreier
DOCX-Differential-Bridge samt Vertrag und echtem synthetischem Smoke vorbereitet.
Der Engineeringpfad läuft isoliert mit `-I -S`, ohne Host-PATH/-TEMP, und wird
ehrlich als ungerahmter, nicht authentisierter Testtransport geführt;
aber `product_enabled` bleibt `false`. MarkItDown ist ein optionales
Differentialorakel; seine Python-Runtime gehört nicht zum Nutzerpaket. Der
aktive Standalone-Produktkonverter verwendet den gebündelten JS-/PDF-/OCR-Pfad
und unterstützt auch XLSX, PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP. DS-087 bindet
diese Formate im Standalone-Anonymisierungsmodus an die neutrale Extraktion und
die nachgelagerte Markdown-Anonymisierung; die Originalcontainer selbst erhalten
keine Vollständigkeitsfreigabe. Architektur,
Lieferstufen und offene User Stories stehen in
[`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md) und BL-010.9.

## Backlog-Ist je Epic

### BL-010 – Plattform und Distribution
ZIP/Marketplace sind der Cowork-Produktkanal; Standalone verwendet getrennte
zielgebundene Desktoppakete. Die selbsttragende Node-22.23.2-Runtime ist für
Windows x64, macOS Intel/ARM und Linux x64 glibc gebaut, hash-/architekturgebunden
und paketvertraglich geprüft. Ein reales Windows-Paket startete ohne System-Node;
die Standalone-App-Bundles starteten nativ auf Intel, Apple Silicon und Linux x64. Reale
Cowork-Fresh-Install-/Update-Nachweise sowie die menschliche macOS-Bedienung
bleiben offen. Linux ist kein aktuelles Cowork-Produktziel.

Die aktuelle Plugin-MCP-Konfiguration verwendet den offiziellen
`mcpServers`-Wrapper. Eine generierte Marketplace-Projektion mit relativer,
selbsttragender Pluginquelle wird streng validiert; für die Produktfreigabe fehlen
weiterhin die Veröffentlichung in einem privaten/internen Git-Repository sowie
Fresh-Install-/Update-Evidenz auf Windows und macOS.

Der Pluginserver handelt die MCP-Protokollversion gemäß DS-081 mit dem Host aus:
Er bietet den aktuellen modernen Stand `2026-07-28` über `server/discover` an
und bewahrt den getesteten Legacy-`initialize`-Pfad für ältere Claude-Hosts.
`MCP26-01` ist keine offizielle Zielversion und kein geplanter Cutover. Eine
vollständige `2026-07-28`-Konformitätsaussage ist noch nicht freigegeben; dafür
fehlt die dokumentierte offizielle Conformance-Prüfung des ausgelieferten
Pluginservers. Das Standalone-Produkt verwendet kein MCP.

### BL-003 – Product Vision und Dokumentenkanon
Vision und Kanon sind eingerichtet. Diese Konsolidierung trennt aktuelle Quellen
von historischer Evidence.

### BL-001 – Dokumentensystem und Wiederverwendung
Ein aktives Backlog, ein Register und ein Archivindex sind vorhanden.

### BL-002 – Ist-/Zielvertrag und Drift
Aktuelle Aussagen werden durch Dokumenten- und Capabilitytests geprüft; weitere
semantische Driftgates werden in diesem Schnitt ergänzt.

### BL-011 – Sicherer fortsetzbarer Stapelkern
Intake, identitätsgebundene Checkpoints/Cleanup, Resume, Mapping, Ergebnisse,
Retention und neustartfeste stapelweite HMAC-Pseudonyme sind E0-implementiert.
Zielsystem- und echte Crash-/Dateisystemnachweise bleiben offen. Eine atomare,
prozessübergreifende Intake-Reservierung sperrt bereits den Pickerstart und bleibt
bis zum dauerhaften Stapelcheckpoint bestehen. Sie kann sicher an den Worker
delegiert werden; verwaiste Eigentümer werden fail-closed behandelt und ein echter
Zwei-Prozess-Test lässt genau eine Aufnahme zu. Reale Cowork-Messungen auf
Windows/macOS bleiben BL-011.10.

### BL-012 – Nutzerreise und lokaler Review
Ein Pickerstart und ein gebündelter lokaler Review sind implementiert. Klare
Dateien umgehen den Review vollständig; Mischstapel schließen klare Positionen
vorher ab und legen nur mehrdeutige Dokumente lokal vor. Der Review zeigt
inhaltsfreie Fortschrittszähler, rot/gelbe Fundstellen, direkte
Beibehalten-/Anonymisieren-Aktionen, Rückgängig, exakte Gruppenaktionen und auf
Windows Tastaturkürzel. Reale UX-, macOS- und Accessibility-Abnahme bleibt offen.

### BL-020 – Gemeinsame Inhaltsgrenze
Content-Graph und rekursive Sicherheitsgrenzen existieren, sind aber noch nicht
für alle Zielcontainer vollständig.

### BL-021 – Text und CSV
TXT/Markdown/CSV sind im Produktallowlist; reale Zielsystemabnahme bleibt offen.

### BL-022 – OOXML-Formate
DOCX ist im Produktallowlist und für die bisher belegten Strukturen fail-closed
gehärtet. Die Auswertung ist an die tatsächliche WordprocessingML-Namespace-URI
gebunden; unbekannte XML-Entities, fremde Relationship-Namespaces und fremde
direkte Textknoten stoppen. Kopf-/Fußzeilen werden ausschließlich über die
tatsächlichen Dokumentreferenzen in kanonischer Reihenfolge gelesen. Für
die reine Konvertierung werden sie ausgegeben; für Anonymisierung werden sie
nach dieser vollständigen Prüfung gemäß DS-098 aus der Ergebnisprojektion
entfernt. Ausschließlich dort referenzierte Bilder werden ebenfalls nicht
ausgegeben. Kommentare, Fuß- und Endnoten bleiben erhalten. Für
`mc:AlternateContent` gilt eine feste Policy: bekannte Word-2010-Textfeld-
Namespaces wählen die erste unterstützte Choice, unbekannte Choices genau einen
Fallback; ohne eindeutigen Pfad stoppt der Parser. Offen bleiben reale Office-
Interoperabilitätsfixtures sowie die vollständige Kommentarabdeckung. XLSX und
PPTX werden in Cowork und Standalone Markdown-first anonymisiert; die
Extraktionsabdeckung des ursprünglichen Containers bleibt dabei ausdrücklich
`incomplete`, während nur der extrahierte Markdown-Inhalt die vollständigen
Privacy-Gates durchläuft. Breiter Office-Korpus und Zielhost-/Fachabnahme
bleiben offen.

### BL-023 – PDF-Risikogate
PDF und Scan-PDF bleiben im Cowork-Plugin ohne paketierten und nativ belegten
PDF-/OCR-Pfad sicher gesperrt. Standalone verwendet den gebündelten
Offline-PDF-/OCR-Pfad sowohl für reine Konvertierung als auch für die
Anonymisierung des extrahierten Markdown-Inhalts; dessen Hinweise sind keine
Vollständigkeitszusage für den Originalcontainer. Zielhost-/Fachabnahme bleibt
offen. Der bisherige strenge Standalone-E0-Vertrag stoppte erkannte Formulare,
JavaScript-Aktionen, Anhänge, Signaturen, Annotationen, Outline und XMP.
DS-103 lässt solche passiven Objekte im Standalone-Markdown-Weg aus und
anonymisiert ausschließlich den extrahierten Text; deren Inhalt gilt nicht
als geprüft. XFA, Verschlüsselung und unsichere Strukturen stoppen weiterhin.
Standardskonforme In-Memory-PDFs laufen dabei durch den echten paketierten
PDF.js-Parser. Diese Prüfung fand und schloss einen realen Defect: PDF.js 6
liefert Anhänge als `Map`; eine reine `Object.keys`-Prüfung hatte sie zuvor
fälschlich als leer bewertet. Genau diese `Map`-Regression ist durch ein echtes
Golden-PDF belegt. Das Gate normalisiert zusätzlich defensiv `Set`, Array und
gewöhnliche Objektprojektionen; diese Formen sind keine behaupteten beobachteten
PDF.js-Rückgaben. Vollständige Fremderzeuger-,
Layout-, OCR- und Zielhostabdeckung bleibt E1/E3 und wird nicht vorweggenommen.

### BL-024 – OCR und Rasterbilder
Engineering-Komponenten und Harnesses existieren. Der Portable-Engineering-Build
übernimmt das verifizierte Universal-OCR-Bundle vollständig; dessen geschlossenes
Manifest und Inventar, Modi, Hashes, Installationspfade mit Leerzeichen sowie
Adapter-Timeout und laufender Abbruch sind E0-geprüft. Für die reine
Standalone-Konvertierung sind Offline-OCR und PNG/JPEG/BMP integriert und im
oben gebundenen RC111-Windows-Paket Ende zu Ende geprüft. Standalone kann auch
den daraus extrahierten Markdown-Inhalt anonymisieren. Native Mac-Pakete und
Zielhost-/Fachabnahme bleiben offen. Im Cowork-Plugin bleiben eigenständige
Bilder weiterhin gesperrt; Bildpixel aus DOCX bleiben lokal.

### BL-030 – Profil und Pseudonyme
Ein neustartfester stapelweiter HMAC-Kontext ohne Keyring, Keyfile oder zusätzliche
Verschlüsselung ist E0-implementiert. Echte Cowork-/OS-Fortsetzung bleibt offen.

### BL-031 – Zertifikats- und Fundstellenkontext
Kontextregeln schützen Zertifizierungsanbieter und Fachbegriffe; Fachevidenz mit
unterschiedlichen Vorlagen bleibt offen.

### BL-032 – Mehrdeutigkeit
Unklare Organisationen stoppen zur lokalen Prüfung. Plattformgleiche Bedienabnahme
fehlt.

### BL-040 – Lokaler Export und Nachweis
Mapping und inhaltsfreie Nachweise sind implementiert; Quellen bleiben unverändert.
BL-040.5 ergänzt den einmalig gewählten lokalen Ergebnisordner. Dieser kann
optional separat mit Cowork verbunden werden; DataSecure kann die verbundenen
Cowork-Ordner weder lesen noch die Quellentrennung selbst garantieren. Der Export prüft
das Paket erneut, schreibt ausschließlich Markdown atomar unter neutralem Namen
und veröffentlicht exklusiv ohne vorhandene Benutzerdateien zu überschreiben.
Readiness und eine bereits aktive Verarbeitung werden vor einer erstmaligen
Ergebnisordnerwahl geprüft. Der lokale Abschluss bietet „Ergebnisse öffnen“; der MCP erhält weder Zielpfad
noch Mapping. Die erfolgreiche MCP-Startantwort wartet höchstens fünf Sekunden auf
die ausdrückliche, inhaltsfreie Empfangsbestätigung des Intake-Workers; Timeout,
Worker-Exit vor der Bestätigung und Abbruch räumen die Aufnahme fail-closed auf. Reale
Windows-/macOS-Cowork-Abnahme bleibt offen.

Der Ergebnisstamm ist gemäß DS-080 eine ausdrückliche geräte- und
produktlokale Benutzereinstellung. Er wird beim Start identitätsgebunden an den
Stapel übernommen und nur über „Ergebnisordner ändern“ gewechselt. Cowork stellt
keinen belastbaren Projektpfad bereit; DataSecure errät ihn nicht und fragt auch
nicht pro Projekt oder Stapel erneut. Liegt das ausdrücklich gewählte Ziel auf
einem Netzlaufwerk, geben Cowork und Standalone einmal einen Hinweis aus, ohne es
zu sperren oder eine weitere Bestätigung zu verlangen. Der Hinweis enthält keinen
Pfad; Standalone benennt zusätzlich die mögliche Übertragung der laufbezogenen
Zuordnungsdatei. Gemäß DS-079 gibt es keine sichtbare
Teilprojektion bereits klarer Positionen in Mischstapeln.

### BL-041 – Claude-Übergabe
Nur verifizierte Markdown-Ergebnisse werden begrenzt übergeben. Reale
Berechtigungs-, Skill- und Hostabnahme bleibt offen.

### BL-043 – Cowork-Fast-Path
Der Normalweg endet nach einem lokalen Start ohne Polling. Ergebnisse werden erst
auf späteren ausdrücklichen Auftrag gelesen. Ein vollständig klarer Stapel öffnet
keinen Reviewdialog; nur echte Mehrdeutigkeiten wechseln in den lokalen
Sammelreview. Nach der einmaligen Ergebnisordnerwahl benötigt jeder weitere reine
Anonymisierungslauf nur noch die Quellauswahl. Die Startantwort wird erst als
Erfolg ausgegeben, nachdem der unabhängige Worker den Empfang der privaten
Intake-Nachricht ausdrücklich bestätigt hat.
Gerät der Stapel in einen fachlichen Reviewzustand, startet derselbe lokale Worker
den vorhandenen Sammelreview unmittelbar. Nur „Später“ oder ein sicherer Fehler
lassen ihn fortsetzbar ruhen; Claude muss keinen zweiten Toolaufruf auslösen.

### BL-044 – Sichere Datei- und Ordnerquellen
Mehrfachauswahl und rekursiver Ordnervertrag sind E0 implementiert; reale Link-/Race-
Gegenproben fehlen.
Ein lokaler Windows-RC145-Befund zeigte einen Oberordner mit ausschließlich
Unterordnern: Die Rekursion funktionierte, aber eine darin enthaltene 75-MiB-
PPTX überschritt die 64-MiB-Einzeldateigrenze. Der private Fehler wurde als
generischer Fehlercode ausgegeben und die Statusanzeige anschließend vom
Leerlauf-Poll überschrieben. Der lokale Folgekandidat erhält den spezifischen
Größenfehlercode und hält die Erklärung bis zur nächsten erfolgreichen Auswahl
sichtbar; die Sicherheitsgrenze und die vollständige Ablehnung des Ordners
bleiben unverändert. Der tatsächliche Nutzerlauf des Folgekandidaten ist offen.

### BL-047 – Performance und Ressourcensteuerung
Der Produktstandard bleibt seriell; adaptive Vorbereitung ist technisch
begrenzt, aber für RC151 nicht aktiviert oder als Releasebedingung gefordert.
Stapel, Speicher und Cowork-Seiten sind begrenzt; große
freigegebene Markdown-Snapshots werden verifiziert und höchstens 64 MiB pro
Handoff-Sitzung gehalten. Lesen, Hashen und Erzeugen des UTF-8-Index erfolgen im
Produktpfad asynchron und größenbegrenzt; ein 6-MiB-Regressionslauf belegt das
Yielding des MCP-Ereignisloops. Weitere versionsgebundene Referenzmessungen
gehören zu N3-09. Nur ein dabei belegter Engpass eröffnet eine neue
Optimierungsstory; BL-011.12 ist als aktueller Abnahmeblocker entfallen.
Der Replay fehlgeschlagener sichtbarer Exporte ist aus dem MCP-Startpfad entfernt
und zeitlich begrenzt. Ergebnislisten führen keine zweite synchrone Vollhashrunde
aus; die eigentliche Inhaltsübergabe bleibt unverändert vollständig und asynchron
verifiziert.

Ein RC109-Profilinglauf fand eine gemeinsame lokale Kostenstelle vor Parser und
Erkennung: unveränderte private Stammverzeichnisse wurden bei jedem Hilfsaufruf
vollständig neu angelegt und über sämtliche Eltern erneut geprüft. Eine
prozess- und konfigurationsgebundene Verzeichnisidentität führt die vollständige
Reparse-/Cloud-/Netzprüfung nun einmal aus und prüft danach bei jedem Zugriff alle
zurückgegebenen Verzeichnis-Inodes. Ersatz oder Umleitung stoppt weiterhin
fail-closed. Auf demselben Windows-Host sank der echte 100-Dateien-TXT/CSV/DOCX-
Lauf von 149,328 s kalt/191,247 s warm auf 22,085 s/23,532 s; alle 100 Ergebnisse
blieben freigegeben. Das ist ein lokaler Vorher-/Nachhernachweis, keine allgemeine
Hardware- oder Zielhostzusage; die Durability-Fsyncs wurden nicht reduziert.

Fach-, Workflow- und Supportdiagnose schreiben unveränderliche, zufällig benannte
JSON-Einzelereignisse. Damit können Eltern-, Intake- und Reviewprozess parallel
protokollieren, ohne eine gemeinsame JSONL-Datei per Lesen-und-Ersetzen zu
verlieren. Alters- und Mengengrenzen werden auf Datenträgerebene bereinigt;
historische JSONL-Dateien bleiben nur lesbarer Upgradebestand. Ein Diagnosefehler
bleibt ohne Einfluss auf Verarbeitung oder Freigabe.

### BL-049 – Inhalts- und Formatgrenze
Signatur-/Strukturprüfung und drei Anonymisierungsergebnisgrade sind implementiert.
Cowork nimmt XLSX/PPTX nach DS-093 an und anonymisiert ausschließlich deren
lokal extrahierten Markdown-Inhalt; PDF/Scan-PDF und eigenständige Bilder
bleiben dort gesperrt. Standalone verarbeitet DOCX und alle breiten Quellen
nach DS-087/090 Markdown-first und weist Quellenextraktion und Anonymisierung
getrennt aus. Die reine Standalone-Konvertierung besitzt denselben erweiterten
Eingabeumfang mit eigener Extraktions-/Fehlerkennzeichnung. Ein textloses Bild
neben vorhandenem nativen PDF-Text erzeugt keinen `OCR_TEXT_EMPTY`-Gesamtstopp
mehr; wirklich textleere Extraktionen bleiben vor der Anonymisierung gesperrt.

### BL-042 – Diagnose und Berechtigungen
Normal- und Supportoberfläche sind getrennt. Die inhaltsfreie Status-App besitzt
einen reproduzierbaren, vom Aufruf-CWD unabhängigen Offline-Build, DE/EN und einen
Textfallback. Sie zeigt absichtlich nur die einmalige Startantwort, nicht einen
erfundenen späteren Abschluss. Ein echter lokaler Edge-/axe-Lauf prüft alle 14
Sprach-/Zustandskombinationen, die Bridge-Allowlist und 400%-Reflow. Der Pilot
bleibt dennoch standardmäßig aus; echte Cowork-/Screenreader-/Hostabnahme fehlt.

Für konkrete Supportfälle existiert zusätzlich ein separat gebautes Debug-ZIP.
Es ergänzt einen ausschließlich manuell aufrufbaren Debug-Skill, aktiviert den
vorhandenen Supportmodus und schreibt geschlossene JSON-Ereignisse je Prozess als
unveränderliche Einzeldateien. Der normale Build behält zwei Skills und erzeugt
diese zusätzliche Spur nicht. Ein echter Cowork-Supportlauf ist E1-offen.

### BL-050 – Korpus und Qualitätsmetriken
Synthetische Korpora, 2.000 Variationen und lokale Benchmarks bestehen. Reale
Referenzhardwarewerte und kontrollierter Vorher-/Nachhervergleich fehlen.

### BL-051 – Installations- und Hostabnahme
Artefaktprüfungen bestehen lokal. Fresh Install, Marketplace, Update, Rollback und
100-Dateien-/500-MiB-Lauf sind menschlich offen.

### BL-052 – Menschliche Abnahme
Das aktuelle synthetische UAT-Kit ist vorbereitet. Anwender-, IT/Health-IT-,
Datenschutz-, Accessibility- und Architekturfreigaben sind offen.

Die vollständige Vorgeschichte bleibt unter [`docs/archive`](../archive/README.md)
zugänglich und darf diesen Iststand nicht überschreiben.
