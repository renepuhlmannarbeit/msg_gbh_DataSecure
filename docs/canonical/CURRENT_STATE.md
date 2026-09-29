# Aktueller Iststand

Stand: 29.09.2026 · 3.2.0-rc151 lokaler Entwicklungsstand · Standalone macOS RC141 dauerhaft veröffentlicht; Standalone Windows/Linux und Cowork bleiben RC140; Modellabnahme und N3/N4 offen

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
abgeschlossenen Lauf erscheinen. Zielhost- und erneuter Vollkorpusnachweis
stehen noch aus; RC149-ZIP enthält diese Änderungen nicht.

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
Zwischenschritt wäre für mehrblättrige Mappen verlustbehaftet. Cowork und
die bereits veröffentlichten Pakete ändern sich dadurch nicht.

Lokaler, noch unveröffentlichter Standalone-Nachtrag BL-010.37: Eine vor
`Starten` vorbereitete Auswahl kann über Datei-/Ordnerpicker oder Drop ergänzt
werden. Doppelte Quellen werden übersprungen; ungültige oder zu große Nachträge
lassen die bestehende Queue unverändert. Nach `Starten` gehört Neues in einen
eigenen Lauf. Automatisierte Prüfungen und ein neuer lokaler Kandidat werden
vor der sichtbaren Benutzerabnahme durchgeführt; daraus folgt noch keine
Änderung der veröffentlichten Windows-/Mac-/Linux- oder Cowork-Pakete.
BL-010.38 trennt zusätzlich einen abgeschlossenen Lauf von der Vorbereitung
des nächsten. Der RC143-Zielhostbefund mit sieben sicher gestoppten PDFs ist
auf das bisherige `PDF_OBJECT_COVERAGE_UNVERIFIED`-Gate zurückgeführt.
DS-103/BL-010.39 führt jetzt auch Standalone-PDF/PPTX über die bereits
gebündelte passive Markdown-Extraktion in die nachgelagerte Anonymisierung.
Die Quellabdeckung bleibt ausdrücklich unvollständig; unsichere Quellen
stoppen weiter. Abschlussansicht, bewusste Rücksetzung, Warnanzeige und
dieser Privacy-Übergang sind nur lokal und noch nicht als Release oder
sichtbare Zielhost-UAT belegt.
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
Adaptive Vorbereitung ist technisch begrenzt, bleibt bis zu Referenzmessungen im
Produktstandard seriell. Stapel, Speicher und Cowork-Seiten sind begrenzt; große
freigegebene Markdown-Snapshots werden verifiziert und höchstens 64 MiB pro
Handoff-Sitzung gehalten. Lesen, Hashen und Erzeugen des UTF-8-Index erfolgen im
Produktpfad asynchron und größenbegrenzt; ein 6-MiB-Regressionslauf belegt das
Yielding des MCP-Ereignisloops. Referenzmessungen und die Entscheidung über eine
adaptive Parallelisierung bleiben BL-047.1.
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
