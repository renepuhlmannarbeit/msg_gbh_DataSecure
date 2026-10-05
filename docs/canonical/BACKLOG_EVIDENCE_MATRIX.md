# Evidence-Matrix für aktive Arbeit

Stand: 05.10.2026 · 3.2.0-rc158 · beauftragter Vorabrelease wegen Sicherheitsbefunden angehalten

Der Produktcommit `44bf3d0` enthält DS-106–109; der neue Versionsschnitt ist
RC158. Der saubere, commitgebundene Windows-Doppelbau und die nativen
Mac-Intel-/Apple-Silicon-Pakete sind beauftragt, aber noch nicht als bestanden
ausgewiesen. Der DS-109-Nachweis unten beschreibt unverändert den vorherigen
lokalen Arbeitsstand. Releaseevidence wird separat an Commit und Archivhash
gebunden; Cowork RC151 wird nicht neu veröffentlicht.

Die RC158-Produktsuite (194 Dateien), Pflicht-CI und native CodeQL-Prüfung am
ersten Versionscommit sind bestanden. JavaScript-CodeQL meldet 111 Ergebnisse;
ein unabhängiger Review und eigene Quell-/Speichergegenproben bestätigen reale
ungebundene Diagnose-Schreib- und pfadbasierte Leselücken. Diese verhindern
aktuell den Release. Drei historische Gitleaks-Testeingaben sind exakt triagiert;
493-Commit-Wiederholung und Ablehnung eines neuen synthetischen Credentials
bestanden. Gestoppte Windows-/Mac-Neubaugates sind ausdrücklich kein PASS.
[Exakte Laufbindung und offene Korrekturen](../RELEASE.md#rc158--beauftragter-standalone-vorabrelease-aktuell-angehalten).

**Sicherheitsnachbesserung vom 06.10.2026:** Held-I/O, sichere Diagnose-
Segmente und native Diagnosehandles sind lokal umgesetzt. Die frische Analyse
an `b88c31b` enthält 81 Findings; native CodeQL und Gitleaks bestehen.
Fünf zusätzlich bestätigte Restfehler sind lokal ebenfalls korrigiert.
Gezielte Regressionen: Reader/Diagnose 16 Fälle auf Windows und vollständig
Linux/WSL, Statusreader 13, Retention 26 einschließlich tatsächlicher ABA-
Substitution, Status-Buildwriter sowie SEA- und Markdownreader. Zwei unabhängige
Abschlussreviews fanden keine verbleibenden reproduzierbaren P1/P2 in diesem
Umfang. Alle neuen I/O-Regressionen laufen im gemeinsamen Standalone-Paketgate.
Die vollständige Produktsuite besteht erneut mit 76 Basis- und 119 direkten
Testdateien; 48 Rusttests, warning-free Clippy, Dokumentation und strenge
installierte Claude-CLI-Validierung bestehen ebenfalls. Neue Security- und
Paketbindung fehlen noch; dies ist keine RC158-Veröffentlichungsfreigabe.

**Aktuelle RC157-Veröffentlichung:** Quellcommit
`111737d28021b6989ffe8d563b58daa9cbae610f` ist auf main und als Standalone-RC
für Windows, macOS Intel, macOS Apple Silicon und Linux veröffentlicht.
Alle vier nativen Paket-/App-Prüfungen einschließlich integrierter Prüfseite
bestanden; ZIP und zusätzliches DMG sind auf beiden Macs verfügbar.
[Exakte Assetbindung und Plattformläufe](../RELEASE.md#rc157--standalone-auf-allen-zielplattformen).
Der Anwender bestätigte den Windows-Lauf `3d6b69b7` einschließlich lokaler
Prüfung und Stapelverarbeitung als vollständig bestanden. Die nur lesende
Nachkontrolle fand 140 Ergebnisse, 140 Dateizuordnungen und die vertrauliche
Identitäts-TXT mit 140/140 erfassten Ergebnissen. Der danach ergänzte
Einzeldokument-Reviewfix wurde im finalen Neubau gezielt technisch geprüft.
Cowork bleibt RC151; offene menschliche Spezialabnahmen bleiben separat.

**Neue lokale E0-Evidenz vom 05.10.2026 (DS-106 / BL-010.46, unveröffentlicht):**
Unternehmenswahl bis zur tatsächlichen ORG-Publikation und Identitätszuordnung,
authentifizierte gleiche Schreibweisen über Prüfphasen/Neustart, exakte
Fundstellenbindung, unveränderter Cowork-Reviewvertrag und Fehlerdatei-IPC sind
gezielt geprüft. Am echten RC157-Lauf `5e50a0b0` sind die Ursachen getrennt:
fehlende Hauptfenster-Capability für Fehlerdetails und ein reproduzierter
Cross-Placeholder-Restkandidat vor dem Review. Der neue Privacy-Code erreicht
mit dem unveränderten installierten Konverter vier exakt gebundene Kandidaten;
kein ungeprüftes Ergebnis wurde freigegeben. Die PDF des Markdown-Laufs
`8676f0ca` wurde auf allen elf Seiten mit dem paketierten Konverter gegengeprüft;
native Zeichen bleiben erhalten, OCR-Dubletten über nativem Text und angeklebte
Footer-Seitenzahlen werden geometrisch behandelt. Bild-only-Logo-OCR wird
nicht semantisch geraten. Originale und vorhandene Läufe bleiben unverändert.
Das ist keine Abnahme eines neuen Releasepakets und erklärt den separaten
Windows-Komplettausfall der Kollegin ohne ihre Diagnose noch nicht.
Abgeschlossenes E0-Gate: 133 Testdateien in `run-product-suite.js ci`,
38 real paketierte Konvertierungsgruppen, 11 PDF-Layoutfälle und zusätzliche
Review-/Journal-/Capturetests; BL-010.46 technisch erledigt. BL-010.47 erfasst
den fehlenden Diagnosebeleg des anderen Windows-Rechners als eigenen offenen
Punkt, nicht als erneut offene bereits bestandene Anwenderabnahme.

**Lokaler Integrationsnachweis vom 05.10.2026 (DS-107 / BL-010.48):**
Die finale Gesamtsuite bestand mit 135 Testdateien (74 Basis- und 61 direkten Produkttests).
Zusätzlich bestanden 39 reale paketierte Konvertierungsgruppen auf Windows,
neun Core-Policy-Gruppen, 26 Rust-Tests und das strenge Clippy-Gate. Die echte
Sidecar-/Reviewworker-Integration prüft die typisierte Unternehmensentscheidung
bis zur Veröffentlichung, Fehler vor dem ersten Prüfdraft mit anschließendem
explizitem Wiederholen, ungültige Entscheidungen und Verschieben/Fortsetzen.
Der Start der ersten Prüfung wartet auf den tatsächlichen Worker-Endzustand,
nicht allein auf einen bereits geschriebenen Journalcheckpoint. Acht
Continuation-Negativfälle sichern die vier festen Startursachen über beide
Einstiege; 42 Hauptfrontendfälle prüfen auch die konkrete Fehlermeldung und
das Öffnen der betroffenen Dateiliste ohne automatischen Worker-Neustart.

Der isolierte Windows-Engineering-Bau liegt unter
`dist/engineering-auditfix-verified-20261005/DataSecure-Standalone-3.2.0-rc157-windows-x64.zip`:
589 Einträge, 110376954 Bytes, SHA-256
`240db62613998e352d5a7b3ac21f7ebfba89ddf3ffba36f0a24d7b553dfbd253`.
Paketvertrag und isolierter Sidecar-Smoke bestanden mit exakt diesem ZIP:
elf gemischte Markdown-Ergebnisse und ein gezielt fehlerhafter CSV-Fall in
beiden Betriebsarten, drei reale PDF-/PPTX-Privacyfälle einschließlich
eingebettetem XLSX sowie Verlauf/Neustart mit geändertem Ergebnisroot.
Der native Windows-Lauf prüft sichtbare Haupt-/Prüfseitenladung und eine
erfolgreiche Review-IPC-Antwort: Start 1987,069 ms, Windows 10.0.26200.0 x64,
WebView2 154.0.4258.53 (machine), zehn zugeordnete Prozesse, keine TCP-Listener
und keine UDP-Endpunkte im Messfenster. Der native Test endete mit Exit 0;
seine 910 test-eigenen Einträge wurden anschließend geprüft entfernt.
Das ist kein menschlicher
Prüfentscheidungs-, Accessibility- oder macOS-Gerätenachweis.

Ein früherer Messversuch am vorletzten Engineering-ZIP scheiterte an einer
nicht eindeutigen UDP-Prozesszuordnung. Er zählt ausdrücklich nicht als PASS;
der darauf folgende Lauf und der finale Kandidat bestanden dieselbe strenge
Prüfung. Die Ursache der uneindeutigen Messung wurde nicht reproduziert.
Der Test gibt jetzt begrenzte inhaltsfreie Zuordnungsmerkmale aus, statt diese
Unsicherheit auszublenden. Falsche Hosts zählen als SKIP/Exit 77; Seitenladung
oder lediglich gestartete/fehlgeschlagene IPC dürfen keine native Freigabe
erzeugen. Publisher-Signierung, neue Mac-Zielhosttests und der gerätebezogene
Komplettausfall bei der Kollegin bleiben separate offene Nachweise. Es gibt
keinen neuen Release-Tag und keinen Upload; die veröffentlichte RC157 ist
unverändert. Originale und vorhandene Anwenderläufe wurden nicht verändert.

## DS-108 – abschließender lokaler Revalidierungsnachweis

Stand: 05.10.2026; unveröffentlicht. BL-010.49 ist technisch E0 erledigt.
Die ursprünglichen Auditpunkte wurden durch drei unabhängige technische
Prüfrichtungen revalidiert: Privacy/Publikation, native Prozesse/Fenster und
Test-/Paketgates. Zusätzlich gefundene Markerherkunfts-, spätes POSIX-Cancel-,
Readinesskorrelations-, Kandidatenintegritäts- und Exitcode-Rennen wurden erneut
korrigiert und gegengeprüft. Das ist keine Garantie vollständiger Erkennung und
keine Abnahme nicht ausgeführter GUI-/Mac-Gerätefälle.

| Befundgruppe | Nachweis am korrigierten Stand | Grenze des Nachweises |
|---|---|---|
| Quellmarker und Credential-Leaks | 42 Residual-/Publikationsfälle, 159 PII-Fälle und 20 adversariale Goldens. Beliebige Klammerlabels, HMAC-Lookalikes und numerische Originalmarker gelangen ohne genaue Keep-/Redact-Entscheidung nicht still in die Veröffentlichung; ganze Credentialzellen einschließlich einspaltiger Tabellen sind geschützt. Neue echte Pseudonyme werden nicht verwechselt. | Kein pauschaler Herkunftsbeweis durch Syntax; unbindbare Kollision bleibt sicher gestoppt. |
| Durchgängiges Standalone-Prüfbudget | Echte Verarbeitung mit 1.000, 1.001 und 5.000 Fundstellen erreicht die lokale Prüfung; 5.001 liefert den erklärten Größenfehler. Fehlender Reviewcallback und fehlender Keep-Beleg verhindern Veröffentlichung. | Auch die 40-MiB-Textgrenze ist endlich; nicht nur Anzahl bestimmt die Größe. Cowork bleibt bei 1.000. |
| Renderer-Zustände und Bestätigungen | 20 Gegenproben mit dem tatsächlichen Reviewrenderer: verspätete Antworten, Submit/Close/Continue, verlorenes ACK, pollende Fehlerbehandlung und gebundene Dateinamen. Ein Ladevorgang/Timer und Generationen verhindern alte Drafts. | Kontrollierte Transport-/Antwortfehler in echtem Frontendcode, keine native GUI-Bedienung. |
| Native Close-, Spawn- und Shutdownbindung | 39 echte Rust-Tests, strenges Clippy und Releasebuild. Fensterinstanz/ausgelieferte Review-ID, vorregistrierte Spawnversuche, begrenzte Shutdown-Reconciliation und terminaler Code 0/70 sind getrennt geprüft; wiederholtes externes Quit umgeht sie nicht. Unabhängiger Schlussreview bestätigte die letzte Exitcode-Korrektur. | Ein im OS blockierter Spawn ist nicht portabel gewaltsam abbrechbar; Timeout darf keinen erfolgreichen Shutdown behaupten. |
| POSIX-Gruppeneigentum und Cancellation | Auf WSL/Linux vier reale positive Fälle: Cancel vor Exitbeobachtung, zwischen Beobachtung und Reap, normaler Exit mit lebendem Enkel und geerbtes SIGCHLD-ignore. Zwei bewusst defekte Varianten lassen Kinder zurück und werden erkannt; PID-gebundene Testbereinigung und fremder Sentinel bleiben getrennt. | Kein macOS-Laufzeitnachweis; Signal-/waitid-Unterstützung wird nicht aus Linux auf einen Mac übertragen. |
| Langsame Aufnahme und Konverterfehler | Reale 200-Dateien-Aufnahme mit verlangsamten Metadaten dauert 37,571 s und gelingt im JS-Aufnahmeweg; separater Rust-Test bindet 300-s-Aufnahme-/30-s-Normalfrist und ehrliche Heartbeats. 40 reale Windows-Konvertierungsgruppen einschließlich 60 früher Abbrüche bestehen; fehlendes/nicht ausführbares/falsches Programm behält die konkrete Startursache. | Der langsame 200-Dateien-Fall ist kein vollständiger Tauri-Pickerlauf. Eine Antivirusursache beim Rechner der Kollegin ist nicht nachgewiesen. |
| Starttest- und Inventarlücken | 19 Integritäts-/Readinessfälle einschließlich 41 tatsächlicher PowerShell-Prüfgruppen und CLI-Negativfall; nur jeweils neueste erfolgreiche Anfrage derselben Session/Request-ID zählt. Sieben vollständige Inventarfälle prüfen fehlende/zusätzliche/veränderte Dateien statt nur gelisteter Hashes. | Native Start-PASS beweist erfolgreiche Seiten/IPC, nicht Reviewbedienung; Hashes sind keine Publisher-Signatur oder Buildherkunft. |
| Exakter Kandidat und vollständiger Reviewweg | Finale ZIP-Paketprüfung sowie echte paketierte Sidecar-/Worker-Integration mit 6.001 Fundstellen: erster Block 4.500, weitere Gruppen, Person/Unternehmen, Verschieben, realer Neustart, laufweite Übernahme und konkretes `05-nicht-verarbeitet.csv` / `PARSE_FAILED`. Jede Ausgabezeile, unveränderte Sachzelle, Reihenfolge und stabile Identitäten werden geprüft. Veränderte extrahierte Runtime trotz unverändertem ZIP verweigert die native Kampagne. | Paketierter IPC-E2E ist ausdrücklich keine Tauri/WebView-Interaktion; vorbereitete Bedienkampagne bleibt NOT_RUN bis echter Bedienattestation. |

Gesamtsuite: 136 Testdateien (75 Basis + 61 direkte) bestanden; zusätzlich neun
Core-Policy-Gruppen und das vollständige Standalone-Gate einschließlich aller
39 Rust-Tests. Die vier vormals fehlenden Regressionen sind im allgemeinen
Produktgate und im plattformverwendeten `test:standalone` gebunden. Rust- und
Desktop-/Plattformvertrag wurden nach der letzten Exitcode-Korrektur erneut
geprüft. Ein dabei noch auf `allowed()` statt `allowed(code)` zeigender
Linux-Sourcevertrag war eine veraltete Testassertion; sie wurde auf die strengere
Codebindung korrigiert, nicht die Produktbedingung abgeschwächt.

**Exakter finaler Windows-Kandidat:**
`dist/engineering-ds108-final-20261005/DataSecure-Standalone-3.2.0-rc157-windows-x64.zip`,
589 Einträge, 110386747 Bytes, SHA-256
`d4dcd06ae001564301d9e7a205aaf1656f5e423c8d9ad17f7583828247625aba`.
Isolierter Mixed-Format-Test: elf Ergebnisse plus gezielt defekte CSV in beiden
Zwecken; drei reale PDF-/PPTX-Privacyfälle einschließlich eingebetteter XLSX;
Verlauf, Neustart, geänderter Ergebnisroot und oben beschriebener Review-E2E
bestanden mit diesem ZIP. Native Windows-Seiten-/IPC-Prüfung: 2540,399 ms,
Windows 10.0.26200.0 x64, WebView2 154.0.4258.53 (machine), zehn zugeordnete
Prozesse, keine TCP-Listener/UDP-Endpunkte im Messfenster. Native Testbeendigung
Exit 0; 911 geprüfte test-eigene Einträge wurden bereinigt. Vorherige
Engineering-ZIPs zählen nicht als Beleg für die letzte native Exitcode-Änderung.

**Offene, klar getrennte Arbeit:** BL-010.50 verlangt die bediente native
Gesamtkampagne auf Windows und macOS Intel/Apple Silicon, einschließlich
Vertagen/Neustart, Folgeprüfungen, konkreter Fehlerdateinamen und Abbruch.
BL-010.51 ist gezielte zusätzliche Methodenadaption, nicht blockiert:
unabhängige Precision-/Recall-/Fehlanonymisierungsmetriken, seeded
Zustandsmodelltests und spätere attestierte Buildherkunft. Quellen und
Adaptionsentscheidungen stehen in DS-108. Der ungeklärte andere Windows-Rechner
bleibt BL-010.47; keine Diagnose wird erfunden. Frühere bestandene Anwenderläufe
bleiben bestanden. Kein Commit/Push/Release; Originale und Ergebnisläufe blieben
unverändert. Publisher-Signierung und Mac-/Bedien-/Accessibility-Nachweise
werden nicht aus den aktuellen Source-, WSL-, Worker- oder Windows-Starttests
abgeleitet.

**Früherer RC151-Standalone-Inhaltsnachweis (Windows-Zielhost, 30.09.2026):** Die vom
Anwender ausgeführten Läufe `Lauf-20260930-110539-31025d04` (nur Markdown)
und `Lauf-20260930-111149-6d321443` (Anonymisierung) enthalten je 140
Markdown-Ergebnisse; die zweite Ausgabe enthält 140 Zuordnungszeilen. Der
gewählte Paketroot umfasste die 133 vorgesehenen `EINGABEN` plus sieben
Begleitdateien. Schreibgeschützt geprüft: Manifest-/Quellhashes, 52 bytegleiche
direkte Konvertate, 54 erhaltene/54 entfernte DOCX-Sollstellen, 2168 fachliche
CSV-Beschreibungszeilen und ausgewählte technische sowie synthetische
Identitätsanker. Das ist tatsächliche Windows-Funktionsevidenz und Teilbeleg
für N3-05/N3-06/N4-07; der 140-Dateien-Gesamtlauf muss dafür nicht pauschal
wiederholt werden. Die formalen Windows-/macOS-N3/N4-CSV sind weiterhin
unausgefüllte Protokollvorlagen. Deren `NOT_RUN` bedeutet nicht, dass RC151
unter Windows nicht gelaufen wäre, sondern dass die vollständigen einzelnen
Prüffälle noch nicht rollen- und paketgebunden als `PASS`/`FAIL` protokolliert
wurden. Mac-/Linux-Desktop-, Cowork-Modell-, Accessibility-, Update-/Rollback-
und vollständige Fach-/Originalcontainerabnahmen werden nicht aus dem
Windows-Lauf abgeleitet.

**Backlog-Statusabgleich vom 30.09.2026:** Ein noch nicht ausgeführter echter
Mac-, Cowork-, Accessibility- oder Fachtest heißt `offen`, nicht `blockiert`.
Nur der zusätzliche Marketplace-Kanal (BL-010.8/BL-051.2) wartet auf einen
veröffentlichbaren Binärtransport; die RC151-Cowork-ZIPs können unabhängig
davon erprobt werden. Die optionale adaptive Mehrprozessvorbereitung
(BL-011.12/DS-047) ist kein RC151-Gate; der Standard bleibt seriell, bis eine
Messung Bedarf belegt. Die offizielle
[MCP-Conformance-Serverprüfung](https://github.com/modelcontextprotocol/conformance#testing-servers)
erwartet derzeit eine URL, das ausgelieferte Plugin nutzt stdio. Der vormals
geforderte unveränderte offizielle Lauf ist deshalb kein passender Test für
dieses Produktprofil und entfällt als Releaseblocker (BL-041.8); aus den
vorhandenen stdio-Produkt-/Protokolltests wird ausdrücklich **keine** volle
offizielle Konformitätsbehauptung abgeleitet. Gemeinsame Prüfläufe dürfen
passende Stories mehrfach belegen, nicht aber ungetestete Negativpfade ersetzen.

**Historischer Nachreview MAC-20260923:** BL-010.20 ist mit den RC141-Mac-
Paketen technisch neu belegt. Die RC140-Standalone-Mach-O-Bytes verlangen wegen des
Supervisors Intel 15.0 / ARM 14.0; die bisher deklarierte 13.5 ist widerlegt.
Quellkorrekturen einschließlich vollständigem nativen Paketvertrag,
LaunchServices-Smoke und begrenzten Reviewgruppen sind in RC141 enthalten.
Commit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`, Pflicht-CI `35875614129`
und beide nativen Architekturjobs `35875613438` sind grün. Exakte ZIPs wurden
lokal nachgeprüft und samt Prüfsummendateien unverändert im
[dauerhaften RC141-Mac-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
veröffentlicht; Tag, Größen und Asset-Digests binden genau diese Bytes.
BL-012.9 behält Cowork-Paketlieferung und sichtbare AppKit-/E1-/E2-Abnahme als
Restarbeit. Details und Hashes:
[RC141-Nachweis](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).

RC140-Liefernachweis für beide Produkte: sauberer Commit
`814bc50e3d754224cd95b6fa91f122dd45f48487`, Pflicht-CI `35864600808`,
Windows-Cowork-Normal-/Debug-/UAT `35864624729`, drei native Cowork-Ziele
`35864685584`, Standalone-macOS-Intel/-ARM `35864636481`, Standalone-Linux
`35864697349` und lokaler Windows-PKG-04/INT-13-Doppelbau mit SHA-256
`deb0eaab98b3981f2ca979cfe7a941e1942bc00a83ba934a7a23dd2de79796f1`.
Alle 15 [Vorabrelease-Assets](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140)
stimmen in Größe und Digest mit den lokal verifizierten Dateien überein.
Mac-Pakete sind ad hoc signierte Piloten: E1-Finder-/Gatekeeper-/macOS-13.5-
Nachweise, sichtbare N3/N4-UAT, Cowork-Modellgates und E3-Produktionsfreigabe
bleiben **offen**. Ein nativer Runner-Start ist keine menschliche Installation.

### Historische Evidence: RC139 und früher

RC139-Liefernachweis für BL-041.15–.18 / `ASTRA2-20260912-01`–`04`: Commit
`46c6fec4722c879989f5c8e3059367241c117c3a`, Pflichtlauf `34701892871` und
Dreiziel-Paketlauf `34701897963`. Alle 182 lokalen Produkttestdateien bestanden.
Die drei normalen Release-ZIPs bestehen ihre nativen Smokes. Windows-Normal
und -Debug sind jeweils zweimal bytegleich und beide Bauten geprüft; das normale
Archiv stimmt auch mit dem Workflow überein. Die veröffentlichte Windows-UAT
bindet genau diese Normal-/Debug-Bytes; alle sechs Prüfsummeneinträge und sieben
Upload-Digests stimmen. Die Mac-Nativnachweise sind getrennt. Modellgates und
menschliche N3/N4 bleiben offen; Standalone-RC137 bleibt unverändert. Vollständige
Hashes stehen im [Releasevertrag](../RELEASE.md).

Nachprüfung `CWR-20260912-01`–`11`: BL-041.8/.10/.12/.13/.14 und BL-010.8
erhalten Code-/Regressionsevidence für Status, ACK, Abbruch, Übergabe, Picker
und MCP-Hüllen sowie das korrigierte native Paketgate. RC138 bindet Commit
`d70cb266df90bdc07b0efadbf81f0d81195b3920`; Lauf `34691170241` baute und
startete exakt die veröffentlichten Cowork-ZIPs auf Windows x64, macOS Intel
und macOS ARM64. Der lokale Windows-Doppelbau ist bytegleich. Standalone-
Evidence bleibt davon unberührt und weiterhin an RC137 gebunden. Sichtbare
Cowork-, Modell-, N3/N4- und Fresh-Install-Abnahmen bleiben offen. Einzelbefunde stehen im
[Herstellerreview](../REVIEW_CLAUDE_COWORK_2026-09-01.md). Das anschließende
unabhängige Astra-Gegenreview bestätigte zusätzlich `BL-041.15`–`.18`: eine
Handoff-Cancel/Neustart-Race, verlorene strukturierte Extraktionsabdeckung,
unvollständige Paketintegritätsgates, eine falsch gebundene RC138-UAT-Vorlage
sowie nicht geschlossene Promptnamen. Die Terra-Ausführung hat diese E0-Punkte
geschlossen; die folgenden RC138-Aussagen bleiben dennoch historische Evidence,
kein aktuelles GO. RC139 hat die strengeren technischen Regeln separat belegt.

Der zweite Gegenreview (`ASTRA2-20260912-01`–`04`, bei BL-041.17) ergänzte vier
lokal korrigierte Release-/UAT-Lücken: externes Downloadstaging, vollständiges
finales Inventar, natives Snapshot-Receipt statt erneutem blindem Hashlesen und
geprüfte Live-UAT-Vorbedingungen. Der Offline-Paketintegrationstest baute und
startete beide Windows-Cowork-Pakete im isolierten Test-Checkout und prüfte die
UAT-/SPDX-/Prüfsummenbindung. Das belegt die Pipeline lokal; der separate
RC139-Liefernachweis steht oben. Keiner ersetzt eine menschliche Modell-/N3/N4-Abnahme.

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

RC137 / DS-100 / BL-010.35 bindet den sauberen Commit
`8979d4b2127741c2921cb6f0654fb83d82944845` an die vollständige technische
Paketmatrix. Windows-PKG-04/INT-13 belegen zwei bytegleiche Standalone-ZIPs,
alle Paket-, Worker-, History-/Sidecar- und nativen Smokes sowie SHA-256
`3dfdb381…47c6f0`. Lauf `34609450730` belegt zweimal deterministische native
Standalone-Pakete und App→IPC→Core-Starts auf macOS ARM64 (`8314572d…d4416`)
und Intel (`e8210902…b514`); Lauf `34609464020` belegt denselben Vertrag für
Linux x64 glibc (`f282d416…d282`). Lauf `34609438970` erzeugt und validiert die
Cowork-ZIPs für Windows sowie beide Mac-Architekturen. Die getrennte
Windows-Debug-Variante ist ebenfalls zweimal bytegleich. Release, SBOM,
Prüfsummen und leere 12×3-UAT-Vorlage sind veröffentlicht. Sichtbare N3/N4-,
Fresh-Install-, Finder-/Explorer-/Linux-Dateimanager-, Cowork-Modell- und
Accessibility-Evidence bleibt E1/E2 offen.

RC136 / DS-099 / BL-041.11–.13: E0 bindet 27 Registryeinträge bijektiv
an Werkzeuge und Handler, leitet 10 Normal-/17 Supportwerkzeuge sowie
Annotationen aus derselben Quelle ab und projiziert den additiven öffentlichen
Statusumschlag. Der verkleinerte Hauptskill, vier Intentreferenzen, 41
strukturierte Routingfälle und die 12×3-Candidate-Matrix sind automatisiert
prüfbar. Das ist keine Modell- oder sichtbare Cowork-Abnahme; dreifache frische
Sitzungen pro Modell und Zielhost bleiben E1/E2.

DS-095 ordnet die nächsten Stufen eindeutig zu: **N3** ist die technische
E1-Abnahme eines durch Commit und Paket-Hash festgeschriebenen Kandidaten;
**N4** ist dessen anschließende formale E2-/E3-Abnahme. Vorlagen und
maschinengeprüfter Zwei-Personen-Ablauf für Windows x64 und einen Mac sind E0
fertig. Die leeren `NOT_RUN`-Protokolle sind keine Evidence. Ein einzelner Mac
belegt nur seine tatsächliche Intel- oder ARM64-Architektur.

RC135 bindet den aktuellen Funktions- und Evidence-Stand an den sauberen,
veröffentlichten Commit `9c2e4f9061dbdc3cd1bf0280d95939528029c978`.
Windows-PKG-04/INT-13 belegen zwei bytegleiche Standalone-ZIPs zu 110.250.920
Byte mit SHA-256 `8a27494c…c3d1` sowie beide Paket-, Worker-, History-/Sidecar-
und nativen Smokes. Lauf `34499428661` belegt für Standalone den zweimal
bytegleichen nativen Build, Signatur-/Architekturcheck und App→IPC→Core-Start
auf macOS ARM64 (`e9f54b5b…9f8c6`) und Intel (`9061aae7…880e9`). Lauf
`34501324817` erzeugt und validiert die selbsttragenden Cowork-ZIPs für Windows
x64 (`62796e6f…d1cdb`), macOS ARM64 (`38301698…233fd`) und macOS Intel
(`1efd4cc4…e1395`) aus demselben Commit. Sichtbare N3/N4-, Fresh-Install-,
Finder-/Explorer-, Cowork- und Accessibility-Evidence bleibt offen.

RC134 bindet DS-098 und den RC133-Funktionsstand an Commit
`583d71929a279fb57370a19c11776fc54aebc2d0`. Zwei saubere Windows-Paketbauten
sind als ZIP, Desktop- und Core-Binary bytegleich; beide Paket-, Worker- und
nativen Smokes bestanden. PKG-04 und INT-13 binden das 110.250.875 Byte große
Archiv mit SHA-256
`cdc2ec38c7346217a1de21ec9a5137895ded9fe4322dd5cb16f06a599dd6de0c`.
Automatisierte Produkt-, Dokumentations-, Engineering-, Conversion- und
Auditgates sind grün. N3/N4 sowie Cowork-/macOS-/Linux-Zielhostevidenz bleiben
offen.

RC133 bindet den RC132-Funktionsstand und die abschließende Fortsetzungshärtung
an Commit `2cd4150adfdff2e3aa6771c6cd81e2972ea0413a`. Zwei saubere Windows-
Paketbauten sind bytegleich; beide Paket-, Worker-, History-/Sidecar- und
nativen Smokes bestanden. PKG-04 und INT-13 binden das 110.249.642 Byte große
Archiv mit SHA-256 `fd3dcb1b0f99940a110857c085793b70930454571ffda3a7e5d8565a997ece66`.
N3/N4 sowie Cowork-/macOS-Zielhostevidenz bleiben offen.

RC132 / BL-010.12/BL-010.23/BL-021.1/BL-030.2/BL-041.1 besitzt lokale E0-
Evidence für: gemeinsame F7-Redaktion über mehrere Dokumente nach dynamischer
Pseudonymbindung; eine kanonische bytegebundene Policydateiliste mit
Einzelmutations- und Neu-Modul-Negativgate; Ruleset `de-business/3`; begrenzte
Präindex-Arbeit auch bei Cachetreffern; vollständigen serverseitigen Cowork-
`user_status` über MCP samt dauerhaftem einmaligem Netzwerk-/Sync-Hinweis;
ehrliche Standalone-Gruppierung nur zugelassener Quellen; sowie echte
paketierte PDF-Goldenobjekte. PKG-04/INT-13, Zielhost und N3/N4 sind für diesen
Kandidaten noch nicht erbracht.

RC131 / BL-010.13/BL-011.8/BL-021.1/BL-041.1 bindet den real beobachteten
DOCX-Fehler an drei voneinander unabhängige E0-Nachweise: fachliche
kontextgebundene Residual-Regression mit breitem Fachwortsatz und unverändert
scharfem Namens-Gegenfall, generalisierte und begrenzte Fehlerklassifikation in
Erstverarbeitung, Sammelreview und Recovery sowie ein Lauf des
von RC130 tatsächlich extrahierten Markdown-Artefakts durch den aktuellen
Privacy-/Publikationskern. `PROCESSING_INTERRUPTED` bleibt ausschließlich reale
Recoverysemantik; verifizierte Publikationen werden adoptiert, unsichere stoppen,
und wiederholte identische Transienten enden begrenzt. RC131-Paket- und
INT-13-Evidenz sind für Commit `d4d269b` neu erzeugt und im Vorabrelease
`v3.2.0-rc131` gebunden; nur die sichtbare N3/N4-UAT ist weiterhin offen.

RC125 revalidiert die Cloud-/Local-Cowork-Grenze gegen die aktuelle offizielle
Herstellerdokumentation und bindet den direkten Sechs-Format-Prompt sowie beide
asynchronen Konvertierungszweige an ausführbare Verträge. Vollständige
Produkt-, Standalone-, Dokumentations-, Skill-, SEA- und Paketgates bilden E0;
die bereits verzeichneten Zielhost- und Anwendernachweise bleiben E1/E2.

RC124 / DS-093 / BL-010.34 bindet XLSX/PPTX im Cowork-Plugin an den
ausgelieferten isolierten Office-Parser und danach an denselben Privacy-Core.
Reale synthetische Office-Bytes belegen Konvertierung, PII-Ersetzung,
Residual-Gate und die getrennten Zustände für Quellenabdeckung und
Markdown-Anonymisierung. Picker, IPC, Status, Skill, Paketprojektion und
Standalone-Gegenregression sind Teil der E0-Gates. PDF, Scan-PDF und Bilder
bleiben ohne gebündelte kompakte OCR-Runtime und Zielhostnachweis gesperrt.

RC124 / BL-020.3 präzisiert die Netzwerkgrenze: Parser, OCR und Review laden
den Netzwerk-Deny-Guard, während der MCP-Hauptprozess nur Metadaten, Zustand und
bereits verifizierte anonymisierte Exportbytes koordiniert. Der Einstiegspunkt
und die quellseitige sowie – sofern gebaut – ausgelieferte `.mcp.json` werden
gemeinsam geprüft. Native OS-Sandbox-Evidenz bleibt E1/E3.

RC124 / BL-021.1 trennt bei Personenfeldern die schreibweisenunabhängige
Labelerkennung von der großschreibungsgebundenen Wertgrammatik. Zeilen- und
Inline-Felder ziehen dadurch kein nachfolgendes kleingeschriebenes Prosawort in
die Identität; Punktsetzung ist für die Grenze nicht erforderlich. Die v1-/v2-
Registrytests belegen stabile Wiederverwendung des echten Namens, das Ausbleiben
eines falschen Prosa-Alias sowie den Bestandsschutz vollständig expliziter
kleingeschriebener Werte.

DS-096 / F7 / BL-021.1 bindet plausible unbeschriftete Prosanamen an eine enge
Satzsubjekt-/Tätigkeitsgrammatik und den bestehenden lokalen Sammelreview.
Positiv-, Fachphrasen-, Unicode-, Offset-, Einzeldatei-, Mehrdatei- und
Cross-Produktpfade belegen, dass eine bestätigte Person das stabile
Stapelpseudonym erhält, ein bereits gebundener vollständiger Name in
Folgedokumenten gleich ersetzt wird, derselbe offene normalisierte Name im
Sammelreview nicht widersprüchlich entschieden werden kann und keine Rohwerte in
Journal oder MCP gelangen. Fach-/UX-Abnahme bleibt E2/E3.

F17 / BL-030.2 ist durch eine lokale, nicht releasegebundene Präindex-Beobachtung
und reproduzierbare Arbeitsbudgettests geschlossen: Kleine v1-Altstapel behalten
exakte Aliasauflösung; mehr als 50.000 besuchte Fenster einschließlich
wiederholter Cachetreffer stoppen fail-closed, statt die Runtime unbeschränkt zu blockieren. Aktuelle attestierte Startindizes behalten
den vorhandenen linearen Probevertrag. Reale Upgrade-UAT bleibt E2.

RC120 / BL-010.13/BL-040.5/BL-002 trennt sichtbare Zuordnung und Fehlerbericht:
Nur bereits veröffentlichte Ergebnisse erhalten eine Mappingzeile. All-stopped
bleibt ohne Ergebnisordner/Zuordnung und ohne Öffnen-Aktionen; Mischstapel führen
nur ihre Erfolge. Export-, Replay-, History-, Status- und Pakettests prüfen dies
einschließlich Legacy-Bestandsschutz und verhindern einen Rückfall auf alte Läufe.

RC119 / BL-021.1/BL-030.2/BL-050.1 schließt die im realen Lauf
`Lauf-20260907-163522-142350c1` belegte Personenunterredaktion. E0 umfasst einen
expliziten `Person`-Tabellenanker, einen davon unabhängig formulierten
Release-Guard, die 128-fällige PII-Regression, alle vier echten DOCX aus dem
100-Dateien-Korpus und den deterministisch generierten 15-DOCX-Komplexkorpus.
Der alte Lauf bleibt negative
UAT-Evidenz und ist kein verwendbares anonymisiertes Ergebnis.

RC117 ergänzt für BL-022.1/BL-050.1 einen deterministisch generierten 15-DOCX-Korpus mit
kurzen, mittleren und langen realen Dokumentstrukturen. Preflight, Parser,
Anonymisierung, neutrale Erhaltung und stapelweit konsistente Personen-/
Unternehmenspseudonyme sind E0 geprüft. Die zwei Standalone-Abläufe mit diesem
Korpus sichtbar auszuführen bleibt BL-052.1/E2.

RC109-Gesamtreviewkorrekturen sind im
[archivierten Korrekturbericht](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md)
gesondert nachgeführt. Der aktuelle Standalone-Quellstand
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` wurde zweimal bytegleich gebaut;
beide Paket-/Worker-/nativen Windows-Smokes bestanden und INT-13 ist an genau
diesen Commit gebunden. Code-/Protokoll-/Konverter-/Dokumenttests belegen E0;
ältere RC-Evidenz wird nicht als Nachweis dieses Stands umetikettiert.

Der anschließende E0-Restschuldblock umfasst BL-020.3 (Support-Review im
geschützten Worker), BL-041.1 (gemeinsame Diagnose/typisierte ACK-Fehler),
BL-021.1 (offsettreue Unicode-/URI-/IBAN-Grenzen), BL-011.8 (frühe Bereinigung
eindeutig verwaister Intakekopien) und BL-041.10 (39 Skillfälle einschließlich
DS-069), sieben reine gemeinsame Core-Verträge und die produktgleiche
Core-/Policy-Golden-Bindung des unterstützten Umfangs (BL-010.9/23). Einzelbelege und Gegenchecks stehen im
Korrekturbericht; E1/E2/E3 werden dadurch nicht geschlossen. Der vollständige
Produkttest besteht (57 Basis-/114 direkte Testdateien), ebenso 27 echte
Konvertertestgruppen und beide frischen Produktbauten. Architektur-, Browser-,
Dokument- und Rusttests bestehen zusätzlich den getrennten Gegenlauf. RC111
erweitert die reale Konvertersuite auf 30 Gruppen und ergänzt echte
TXT/XLSX-Mischstapel mit Neustart und stabilen Personen-/Unternehmenslabels.

RC109 / DS-086 / BL-010.29: Startseite ohne Modusvorbelegung, explizite
Navigation und privater Verlauf der letzten 20 Verarbeitungen sind umgesetzt.
Historytests verwenden echte Journale und Exportdateien, einschließlich Neustart,
Aufbewahrungsablauf, Zielwechsel und falscher Lauf-/Dateibindung. Frontendtests
prüfen drei Aktionen je Zeile, späte Antworten, Fokus und ausbleibende automatische
Navigation. Ein Edge-/axe-Test prüft Layout und Accessibility mit synthetischer
IPC; er ersetzt keinen nativen Dialog-/Explorer-/Finder-UAT (S20–S23).
Der erweiterte echte Windows-Paket-Smoke prüft beide Modi, Fehlerlauf, alle
laufgebundenen Ziele und einen frischen Sidecar nach Ergebniszielwechsel.
Die commitgebundene PKG-04-/INT-13-Bindung ist abgeschlossen; menschliche E1/E2 bleiben offen.

Aktueller Windows-Paketnachweis: RC111 aus `b543589f` besteht PKG-04 mit zwei
bytegleichen Builds, beiden echten Paket-/Worker-/nativen Smokes und neuer
INT-13-Bindung. Beide Modi, elf Konvertierungsergebnisse plus Fehlerposition,
Zuordnung und Supportspur sind geprüft. ZIP-SHA-256:
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`.
Details und vollständige Hashes stehen
in [CURRENT_STATE](CURRENT_STATE.md). E1/E2/E3 sind dadurch nicht geschlossen.
Der RC111-Versuch aus `d45252f` und die Wiederholung nach Windows-Neustart aus
`c77ec592aa95f323bd5b1efe6301b111e7f2f225` bestehen Quellgates und Kandidat-A-
Paket-/Worker-/History-/Sidecar-Smokes, stoppen auf diesem Host jedoch vor
`webview_build_completed`. Die nachfolgende Gegenanalyse identifizierte dies als
Harnessfehler: ungeeigneter UDF-Ort, vollständig ersetzte Desktop-Umgebung und
zwei UDF-Autoritäten. Der korrigierte Arbeitsstand verwendet den automatischen
Tauri-Start mit genau einem privaten UDF unter `LocalAppData`; RC111-Arbeitsbau
und historisches RC109-Archiv erreichen damit Frontend, Core und IPC. RC109
stoppt anschließend nur in der fail-closed Bereinigung einer noch gesperrten
Cachedatei. Aus dem sauberen Korrekturcommit bestehen anschließend vollständige
Regression, zwei bytegleiche Builds und beide nativen Starts; Receipt und
INT-13-Bindung liegen unter `dist/pkg-04/b543589f3250a6ab57ddd5bc3a144f03a24ee026/`.

| Bereich / Stories | E0 | Noch erforderlich |
|---|---|---|
| BL-010.8 | Gebündelter Runtimevertrag, drei RC151-Ziel-ZIPs, Lizenz-/Hash-/Architekturgates und native Paketstarts auf Windows x64 sowie macOS Intel/ARM64 ohne zusätzliche Nutzerruntime; die ZIPs sind der aktuelle Cowork-UAT-Weg. | Nur der zusätzliche Marketplace-Kanal ist blockiert, weil einzelne offizielle macOS-Runtime-Dateien die normale 100-MiB-Git-Objektgrenze überschreiten. Nötig sind kleinere Runtime oder belegter unterstützter Binärtransport; danach eigener Marketplace-Fresh-Install/Update. Die ZIP-UAT bleibt unabhängig. |
| BL-010.9–27 | direkter Standalone-Coreadapter, eigener Datenroot, Tauri-Hülle, geschlossene private IPC, expliziter Start und konfiguriertes Ergebnisziel. Sieben reine Core-Verträge sowie produktgleiche Goldenläufe für TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung prüfen beide echten Produktprojektionen. RC109 erzeugt im realen Windows-Paket ein zielgebundenes Inventar für 259 erreichbare Nicht-Dev-Crates ohne `NOASSERTION` und bindet es an die SBOM. Manuelle kostenbestätigte Actions-Gates prüfen native macOS-Intel-/ARM- und Linux-x64-Runtime, Supervisor, Konverter, Rust, Build und Architektur. Die macOS-App-Läufe `34321954381`/`34322534571` starten App→private IPC→Core. Die Distributionsläufe `34334520861`/`34335259239` auf Commit `06c2669d` belegen je Mac-Ziel zweimal bytegleiches ZIP, Manifest/SBOM/Lizenz/Hash/Modus, Signatur/Architektur nach Entpacken und erneuten App→IPC→Core-Start. Das Linux-Gate belegt denselben Paket- und Lifecycle-Vertrag mit AppImage-in-ZIP; Pakete werden höchstens einen Tag bereitgestellt. RC134-Windows ergänzt 30 Fresh-Profile-Starts (p50 1,012 s, p95 1,124 s), 3.549.184 Byte reine Tauri-Hüllengröße, zehn positiv kontrollierte, circa alle 100 ms vom Start bis zur Bereitschaft beobachtete OS-Läufe ohne TCP-Listener oder DataSecure-/Core-/Worker-UDP-Endpunkt sowie einen echten entpackten 100-Dateien-Konvertierungslauf mit 100 Ergebnissen und unveränderten Quellen. | verständlicher WebView2-Zielhostfehlfall sowie sichtbare E1/E2 Windows/macOS/Linux einschließlich Dateimanager/Gatekeeper. Cowork verarbeitet zusätzlich XLSX/PPTX Markdown-first gemäß DS-093; Standalone folgt DS-087/090/094 |
| BL-010.13/14, BL-040.6 | Standalone bindet Fortschritt und Aktionen an den aktiven oder ausdrücklich fortgesetzten eigenen Stapel; jede Verlaufszeile behält ihre exakte Laufkennung. Interner Abschluss und sichtbarer Export (`export_pending`) bleiben getrennt. Offene Exporte werden beim Start, beim UI-Kontext und nach Ordnerwahl nachgeholt, Exportprozesse serialisiert und Zielstamm/Exportzweig identitätsfest gebunden. Sidecar und Rust lösen ausschließlich den konkret gewählten vollständig sichtbaren Lauf und seine `DataSecure-Zuordnung.csv` auf; kein Fallback auf einen neueren Lauf. Die sichtbare RC115-Zuordnung besitzt ein UTF-8-BOM und wird im echten Paket-Smoke geprüft. Offene Mischstapel bleiben gemäß DS-079 unsichtbar, Navigation erfolgt gemäß DS-086 nur durch den Anwender | E1/E2 Windows/macOS: tatsächlich sichtbare Öffnen-Aktion, Abschluss, Exportfehler/-replay, Ordnerwechsel, Sidecar-Abbruch/-neustart und verständliche Wiederaufnahme |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; frühe Wartungsbereinigung ausschließlich bei sicher totem Owner ohne Journal, unmittelbar erneute Bindungsprüfung. Unabhängig 143 Fälle einschließlich echter Worker, Link-/Swap-/Abbruch-/Owner-/Journalwechsel | E1 Windows/macOS-Dateisystem, Power-Loss und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext; neue Standalone-v2-Stapel nutzen lesbare Nummern und einen gemeinsamen Unternehmensraum, v1 bleibt erhalten. RC107: exakte bekannte Aliase im freien Folgetext nach echtem Registry-/Journal-Neuaufbau, Klammern/Separatoren, Rollenwechsel und Rechtsformkonflikte. RC124: einwortige persistierte PERSON-Aliase benötigen an jeder Fundstelle aktuellen Personenkontext; v1/v2, Restore, Mischvorkommen, Tabelle, Link und Firmenüberlagerung sind getestet. Mehrwortige exakte Identitäten bleiben stabil. Optionaler bindingsgebundener HMAC-Index mit vollständigem Altjournal-Fallback und dokumentierter Altreader-Grenze | E1/E2 echter Neustart/Crash/Cowork; reale Personen-/Unternehmensvarianten im fachlichen UAT |
| BL-010.12/13, DS-084 | Native Tauri-Dragdrop-Aufnahme über denselben Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, Reset nach IPC-Fehler, Test für veraltete Statusantworten, echte Unicode-Pfade im Rust-Test; Pickeralternative bleibt | E1/E2 tatsächliches Ziehen aus Explorer/Finder, Fokus/Zoom/Screenreader und native Mac-Pakete |
| BL-040.6, BL-041.10 | Cowork-Presenter bindet Erstlauf/Fortsetzung/Review an exakt den eigenen sichtbaren Exportlauf. Fehlender Lauf/Zielwechsel ergibt keinen falschen Öffnen-Hinweis. Echte Plugin-Exportdateien und PowerShell-Handler mit simulierter OS-Grenze geprüft | E1/E2 tatsächliche Explorer-/Finder-Sichtbarkeit; PowerShell-Test und Prozessstart beweisen kein sichtbares Fenster |
| BL-010.28, DS-085/088 | zwei aktive Modi vom Frontend über Rust/IPC/Service, unveränderlicher Zweck bei Fortsetzung, v5-Journal und eigene Worker-Envelope-Typen; `dm_`-Artefakte mit Extraktionsgrad, Recovery/Delivery/Export in derselben Batchengine. `markdown-only` erhält Originalinhalte und exportiert nach `DataSecure-Markdown`; sichtbare Dateien behalten ihren Basisnamen, Kollisionen erhalten deterministische Nummern, eine Zuordnung entfällt. Ausschließlich bereits angelegte Legacy-Pläne mit Export-Schema `/3` beenden beim Replay ihre historisch zugesagte Zuordnung; dieser Pfad ist durch einen realen Replay-Test gebunden. Keine Privacy-Capability oder PII-Review. Elf Eingabetypen einschließlich Scan-PDF als gesondertem PDF-Fall; reale Konverter-, Export-, Legacy-, Cross-Read- und RC112-ZIP-Smokes | RC134-Windows-PKG-04/INT-13 ist commitgebunden abgeschlossen. E1/E2/E3 für echte Zielhostbedienung und breiten Fachkorpus bleiben offen; E0 ist keine UAT-Freigabe |
| BL-010.31, DS-088 | vorbereitete Auswahl lässt sich vor Start einzeln oder vollständig leeren; eindeutige lokale Quelllabels, indexgebundener privater IPC-Befehl, Rust-Guard und Renderer-Race-Schutz. Beide Modi nutzen denselben Admissionvertrag. Ergebnisordneraktion unter **Verarbeiten** bleibt ohne exakten vollständigen Lauf deaktiviert; Verlaufszuordnung ist bei `markdown-only` immer deaktiviert. RC115 bindet 200 Dateien zentral durch JS-Core, privaten IPC-Vertrag, Rust-Drop-/Entfernungsgrenze und Workerstatus | E1/E2 Windows/macOS: Tastatur, Screenreader, doppelte Basisnamen, 200 Dateien und Bedienung nach Neustart |
| BL-010.32 | deterministischer Generator und bytegleicher ZIP-Nachweis für genau 100 synthetische Eingabedateien; Manifest/README außerhalb des Auswahlroots; elf Kategorien, kurze/mittlere/große Größenklassen, produktive Signatur-/OPC-Prüfung, rekursive Aufnahme verschachtelter Unterordner und direkte Markdown-Extraktion für TXT/MD/CSV/DOCX/XLSX/PPTX. PDF- und Raster-Sichtprüfung sowie 500-MB-Grenze geprüft | E2: vollständigen Korpus in Standalone einmal als Markdown-Konvertierung und als einstufige Markdown-first-Anonymisierung bedienen |
| BL-010.33, DS-089/091 | Root-relative Quelllabels bleiben durch rekursive Aufnahme, Queue, Journal und Export erhalten. Unit-/Export-/Serviceverträge prüfen verschachtelte Quellen, beide wählbaren Namensvarianten, neutralen Standard, exakte CSV-Zeilen, Replay/Legacy und sichere Pfadsegmente. `datasecure-batch/6` bindet die Wahl downgrade-sicher; Worker und Wiederaufnahme lehnen eine Änderung ab. Cowork bleibt neutral/flach, reine Konvertierung quellbenannt ohne Zuordnung. Der letzte in derselben UI-Sitzung abgeschlossene Lauf bleibt auch während einer neuen Auswahl exakt erreichbar; Windows-Junctions sind für Eingabe und Ergebnisöffnung gesperrt. | RC134-Windows-PKG-04/INT-13 ist commitgebunden abgeschlossen. E2 Windows/macOS bleibt offen: beide Varianten wählen, Ordnerbaum, Zuordnung und Ergebnisöffnung während einer Folgeauswahl sichtbar vergleichen; bei Originalnamen muss der Anwender sicherstellen, dass Datei-/Ordnernamen keine personenbezogenen Angaben enthalten |
| BL-010.30, DS-087/090/098 | neutraler Extraktionsvertrag und Standalone-Verkettung von DOCX und breiten Quellen vor dem bestehenden Privacy-Core; genau ein Konverteraufruf, keine rohe Veröffentlichung und Dateiendungs-/`source_type`-Bindung. Gültiges nichtleeres Markdown wird anonymisiert; `privacy_scope`, `source_extraction_coverage` und `document_result` trennen Originalextraktion und Markdown-Anonymisierung. Bei DOCX bleiben Kopf-/Fußzeilen vollständig validiert, werden aber nur für Anonymisierung samt ausschließlich dort referenzierten Bildern nicht projiziert; reine Konvertierung erhält sie. Leere OCR/Whitespace, unbekannte Coverage und unsichere Quellen stoppen. Echte TXT/XLSX-Mischstapel, Abbruch/Fortsetzung, Exact-once, stabile Personen-/Unternehmenslabels sowie eine synthetische DOCX mit Custom-XML-Lücke und Markdown-escapten E-Mail-Adressen sind geprüft. Der reale Paket-Sidecar verarbeitet XLSX und DOCX gemeinsam mit finalem Mapping. Der Cross-Produkt-Goldenlauf prüft zusätzlich, dass die Standalone-Kanalbindung bei Sammelreview und späterer Publikation erhalten bleibt. RC123 prüft zudem, dass `CONVERSION_TERMINATION_UNCONFIRMED` aus Schema `/6` in die lokale Statusprojektion gelangt | RC134-Windows-Paketnachweis ist abgeschlossen. Vollständige Originalcontainer-Coverage unter BL-022.2/3, BL-023.1–4 und BL-024.3 sowie E1/E2/E3 bleiben offen. Bis dahin keine Vollständigkeitszusage für den Originalcontainer; Cowork-PDF/OCR bleibt gesperrt |
| BL-010.34, DS-093 | Cowork akzeptiert XLSX/PPTX über Datei- und rekursive Ordnerauswahl, extrahiert lokal im isolierten Office-Parser und anonymisiert ausschließlich das neutrale Markdown. Status, Prompt, Skill, Manifeste, Source-/OPC-Preflight und reale XLSX-/PPTX-Integrationsläufe stimmen überein; kein rohes Zwischenkonvertat und kein zusätzlicher Dialog | E1/E2 Windows/macOS-Cowork mit echten Office-Dateien; PDF/Scan-PDF/Bilder erst nach kompakter gebündelter Runtime, Offline-/Paketgates und Zielhostabnahme |
| BL-010.36, DS-102 | Reine Standalone-Konvertierung verwendet passives PDF-/PPTX-Gate für nicht ausgeführte Form-/Link-/OLE-Objekte und meldet unvollständige Quellabdeckung. Anonymisierung und Cowork behalten das strenge Gate. Mac-Workflow erzeugt DMG zusätzlich zu ZIP aus demselben App-Bundle. | E0 plus E1: fünf reale RC140-Fehlerdateien ohne Inhaltsprotokoll im exakt gebauten Windows-ZIP verarbeitet; Worker-/OPC-/Produktgrenztests, zwei bytegleiche PKG-04-Builds und beide nativen Smokes. Mac-Intel/-ARM-ZIP und -DMG im Lauf `36562812021` aus Commit `c0ddd11` grün, alle Release-Digests abgeglichen. Sichtbare Finder-/Gatekeeper-/Windows-UAT bleibt E2. |
| BL-010.37 | Vor Start ergänzt ein zweiter Picker oder Drop die Standalone-Auswahl; Duplikate und kombinierte Limits sind gebunden. Ein fehlgeschlagener Nachtrag erhält die alte Auswahl. Frontend-, Rust-, Service- und Sidecar-Pakettests bestanden; RC151 enthält die Änderung. Der Windows-Lauf belegt rekursive Aufnahme und Verarbeitung von 140 Dateien. | E0 und RC151-Paketbindung erledigt; sichtbare Ergänzung, Dialogabbruch, Überlauf und beide Modi als gezielte E2-Teilfälle offen. Kein erneuter Gesamtbuild dafür nötig. |
| BL-010.38 | Abschlussansicht und neue Eingabe sind getrennte Standalone-Zustände. Ein frischer Lauf erbt weder Auswahl noch Quellenordner; Nullergebnisse und Teilerfolge sind keine grünen Vollerfolge. Frontend-/Service-Tests und RC151-Paketbindung bestanden. Anwender führte auf Windows nacheinander beide Modi aus. | E0 erledigt; vollständige sichtbare S16a/S16b-Zustandsabnahme bleibt gezielter E2-Teilfall. |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates, referenzgebundene und weiterhin vollständig validierte Kopf-/Fußzeilen mit zweckgebundener DS-098-Ausgabeprojektion, tatsächliche `Requires`-URI-Auflösung, gesperrte historische `pPrChange`-/`rPrChange`-Metadaten, referenz- und ID-konsistente Kommentare sowie deterministischer 15-DOCX-Realitätskorpus | ausschließlich LibreOffice-/Office-Interoperabilität, realistische Fremdkommentare und Fachabnahme E1/E3 |
| BL-024.2 | Universal-Bundle bleibt separate Engineering-Evidence mit deaktivierter Pluginfreigabe. Standalone verwendet eine eigene aktive gepinnte Tesseract-/Canvas-Projektion mit lokalen DE/EN-Modellen; reale PNG/JPEG/BMP-/Scan-PDF-Bytes, Timeout, Abbruch und unveränderte Inputhashes im Konvertergate. Standalone darf den erfolgreich extrahierten Markdown-Inhalt anschließend vollständig anonymisieren; das ist keine Pixelredaktion und keine Vollständigkeitszusage für den Originalcontainer | E1 Windows/macOS; vollständige OCR-/Bild-/Originalcontainer-Erkennung sowie Cowork-PDF/OCR bleiben dadurch nicht freigegeben |
| BL-010.39 | DS-103 führt passive Standalone-PDF-/PPTX-Extraktion in den bestehenden Markdown-Privacy-Core. Echte PDF-/PPTX-Bytes, ausgelassene Objekte, getrennte Coverage, Residualprüfung, Quellhashes und negative Verschlüsselungs-/Makro-/Cowork-Gates sind E0-geprüft; RC151 ist paketgebunden. Der Windows-Gesamtlauf ergab 140/140 Privacy-Ausgaben. Kein Originalcontainer wird anonymisiert. | E0 und positiver Windows-Zielhostpfad belegt; Mac-Bedienung, negative Grenzen im Zielhost und Fachurteil über unvollständige Originalextraktion offen. |
| BL-010.41 | Standalone akzeptiert bekannte passive PPTX-Metadaten und eindeutig interne XLSX-Einbettungen für Markdown-first; die Einbettung wird als OOXML geprüft. Mehrblättrige XLSX bleiben direkt Markdown-first statt verlustbehafteter CSV-Zwischenstufe. | Synthetische OPC-/Parser-Gegenfälle, Paketextraktion der fünf RC147-PPTX und echter Windows-Paketbatch bestanden; RC151 enthält die Änderung. Die Anonymisierung genau dieser fünf alten Benutzer-PPTX ist aus dem neuen Gesamtlauf nicht eindeutig zugeordnet; gezielter E2-Nachweis offen. Cowork unverändert. |
| BL-010.42 / BL-021.3 | RC149 stoppte zwei DOCX wegen technischer Restkandidaten. Positionsgebundener lokaler Review und einmalige Entscheidung je identischem Kandidaten sind gezielt getestet; Dateinamen werden per `batchId` aus dem privaten Journal geladen. Der RC151-Windows-Gesamtlauf lieferte danach 140/140 anonymisierte Ergebnisse. | E0 und paketierter positiver Windows-Gesamtlauf erledigt; sichtbare Einzelentscheidung auf Windows/macOS und vollständige Originalcontainer-Coverage bleiben separat offen. Keine automatische Freigabe unbekannter Personen. |
| BL-042.3 | absichtlich einmalige inhaltsfreie Startprojektion mit sieben begrenzten Zuständen, beiden `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates und CWD-unabhängigem Build. Exakt gepinntes `playwright-core` prüft im vorhandenen Edge alle 14 Sprach-/Zustandskombinationen mit axe, Bridge-Allowlist und 320-px-/400%-Reflow | keine fachlich falsche Abschlussprojektion aus der Startantwort; nur noch echte Cowork-/Screenreader-/Hostabnahme E1/E2, falls der default-off Pilot aktiviert werden soll |
| BL-042.4 | separate manuelle Debug-ZIP-Variante mit derselben Engine; Fach-, Workflow- und Supportdiagnose als mehrprozesssichere unveränderliche Einzelereignisse mit physischer Alters-/Mengengrenze; MCP-/Picker-/Worker-/Review-/Exportgrenzen und Parallel-/Negativtests | E1 Installation und reproduzierter Cowork-Fehlerlauf; anschließend Rückkehr zum Normalpaket |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB. Identitätsgebundene private Root-Sessions vermeiden wiederholte vollständige Elternprüfungen; Same-Path-Ersatz stoppt, bestätigter Child-Purge lässt dieselben Root-Identitäten weiter nutzbar. Lokaler 100-Dateien-TXT/CSV/DOCX-Vorher-/Nachherlauf: 149,328/191,247 s auf 22,085/23,532 s kalt/warm, ohne weniger Durability-Fsyncs | E1-Referenzmessung auf den Zielhosts; adaptive Parallelisierung nur bei danach belegtem Zusatznutzen |
| BL-040.5/6, BL-002 | ausdrückliche geräte-/produktlokale Zielwahl ohne Workspace-Erkennung; identitätsgebundene atomare Veröffentlichung, fehlgeschlagene Exporte nachholbar, abgeschlossene Exporte final. Anonymisierte Dateien unter `DataSecure-Output`, eigene nicht anonymisierte `dm_`-Konvertate nur Standalone unter `DataSecure-Markdown`; beide Bäume gegen erneute Aufnahme gesperrt. Standalone ergänzt nur für Anonymisierung die formelneutralisierte `DataSecure-Zuordnung.csv`; reine Konvertate sind durch ihren erhaltenen Basisnamen selbsterklärend, Cowork erhält keine Zuordnung. Ein Netzlaufwerk bleibt zulässig, erzeugt aber in beiden Produkten einen einmaligen pfadfreien Hinweis; Standalone nennt dabei auch die Zuordnung. Öffnen bindet exakt den terminalen aktuellen Lauf, DS-079 verhindert sichtbare Teilprojektion, MCP erhält keine Quellpfade oder rohen Konvertate | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-/Netzlaufwerkhinweis sowie beobachteter Windows-/macOS-Ablauf |
| BL-010.8/23, BL-040.5, BL-041.10, BL-044, DS-092 | Cowork öffnet ausschließlich den vollständig sichtbaren Ergebnisordner des aktuellsten Cowork-Stapels und nie einen älteren Lauf oder den Output-Stamm als Fallback. Rekursive Datei-/Größen-/Formatgrenzen verwenden gemeinsame `SOURCE_FOLDER_*`-Codes und erscheinen im MCP-Normalweg als korrigierbare Auswahlablehnung. Gemeinsame Core-Policy-/Golden-Gates und die vollständigen Standalone-Verträge laufen als Gegenregression | E1/E2 Claude Desktop/Cowork auf Windows und macOS: aktueller Erfolgs-/Fehler-/Aktivlauf, rekursive Grenzablehnung und tatsächliche native Öffnen-Aktion sichtbar beobachten |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | Windows-Sammelreview und einzelner scrollbarer AppKit-Mac-Sammeladapter, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Klarstapel ohne UI und Mischstapel-Schnellpfad; macOS-Abschluss verlangt sichtbares `SHOWN` | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security; automatisierte native Intel-/ARM-E0-Builds sind grün, sichtbare Reviewbedienung bleibt offen |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-021.3 | Fundstellengebundener lokaler Restkandidatenreview, echte Publikation beider Produkte und Negativtests; CRLF-/gemischte Tabellenoffsets, wiederholte Fragmente und gemeinsame kanonische Vorschau/Verarbeitung einschließlich sichtbarer HTML-Beispiele geprüft. | E0; keine automatische Hinweisfreigabe, unklare Herkunft bleibt gesperrt. Native-/Paket-/Fachabnahme offen; Titelklassifikation zusätzlich BL-021.4 |
| BL-021.4 | Konkurrierende Versalienhypothese wird vor Aliasbindung dem bestehenden Review zugeordnet; starke Personenanker bleiben maßgeblich. Reale PII-/Reviewtests, technische Titelerhaltung im 16+16-Golden und der RC151-Windows-Korpus mit ausgewählten technischen Titeln sind geprüft. | E0 im veröffentlichten RC151-Quellstand; kein allgemeines Bedeutungsverständnis und keine Freigabeliste. Vollständige menschliche Inhalts-/Bedienabnahme offen. |
| BL-010.43 / BL-021.4 | RC150-Defects in nummerierter Prosa, technischen Titeln, sensiblen CSV-Zellen und bindestrichgetrennten Namen wurden regressionsgeprüft. Der veröffentlichte RC151-Windows-Gesamtlauf enthält 140/140 Privacy-Ausgaben; Quellhashes, 54 DOCX-Sollstellenpaare, 2168 CSV-Beschreibungen, 25 synthetische Vollnamen/Organisationen und ausgewählte Titel-/Identitätsanker wurden schreibgeschützt nachgeprüft. | Paketierter Gesamtpfad und kontrollierte Inhaltsstichproben belegt; vollständige menschliche Satz-für-Satz-, OCR-/Originalcontainer- und macOS-Bedienabnahme offen. Alte RC150-Ausgaben bleiben unverändert. |
| DS-104 / BL-010.44 | Standalone-eigener integrierter Review: getrennte Tauri-Capability, begrenzter flüchtiger Broker, exakte Fundstellen, Gruppenentscheidungen, mehrere Phasen im selben Fenster, Arbeitsindikator und terminales Schließen. RC157 öffnet „Jetzt prüfen“ direkt aus der aktuellen Laufkarte; JS-/IPC-/Rust-/Pakettests schützen die genaue Laufbindung. Cowork-UI bleibt separat. Die Windows-Anwenderläufe RC156 `ca4349c5` und RC157 `3d6b69b7` samt lokaler Prüfung und Stapelverarbeitung wurden am 30.09.2026 als bestanden bestätigt. Nur lesend geprüft: jeweils 140 Markdown-Ergebnisse, 140 Dateizuordnungen und vertrauliche TXT (140/140). | E0 erledigt und sichtbarer Windows-Funktionslauf einschließlich RC157-Direkteinstieg bestätigt. Vollständige Negativ-/Recovery-Matrix, weitere Zielhosts und Accessibility-Abnahme bleiben gesondert offen. |
| BL-010.45 | Lokaler E0-Prototyp: `identity-ledger.js` speichert Standalone-only Einzelsnapshots lauf-/dateigebunden privat; der verifizierte Export legt ausschließlich die lesbare TXT unter `VERTRAULICH-NICHT-HOCHLADEN` im Ergebnislauf ab. `orchestrator.js` übergibt nur im Standalone-Kanal typisierte eindeutige Pseudonyme. Verlauf/privater IPC/Tauri öffnen die vertrauliche Datei laufgebunden; ein App-Löschpfad besteht nicht mehr. Ein separater Settings-Button öffnet private ältere Zuordnungen außerhalb der letzten 20. `test-standalone-identity-ledger.js` prüft Bindung, Unvollständigkeit, dauerhafte Verfügbarkeit, einmalige Publikation und Nicht-Wiederherstellung einer manuell entfernten sichtbaren Kopie; der RC156-isolierte Paket-Sidecar-Lauf prüft echte TXT/MD/CSV/DOCX-Ergebnisse und die vertrauliche TXT. | Keine automatische Löschung gemäß Nutzerentscheidung. Der ganze Laufordner ist kein KI-Uploadpaket. Native Review-/Recovery-/A11y- und Realformat-Abnahme sowie Bedrohungsmodell für dauerhaft gespeicherte Klarwerte offen; keine Dateiverschlüsselung jenseits der OS-/Datenträgerkontrollen behauptet. |
| BL-022.2/3, BL-023.1–4, BL-024.3 | Cowork-XLSX/PPTX ist gemäß DS-093 E0 aktiv; nur Cowork-PDF/Scan-PDF/Bilder bleibt NO-GO. Reine Standalone-Konvertierung und Markdown-first-Anonymisierung von XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP ist im isolierten Produktworker integriert; Originalwerte bleiben im Nur-Konvertieren-Modus, unvollständige Coverage/OCR wird in beiden Modi mit festen Gründen statt als vollständiger Originalcontainer ausgewiesen. RC111 validiert sämtliche PPTX-XML-/RELS-Teile, stoppt PDF-Annotationen/Outline/XMP und erhält standardisierte PDF-Metadaten sichtbar. Standardskonforme In-Memory-PDFs prüfen den echten paketierten Parser zusätzlich gegen AcroForm, Signaturfeld, EmbeddedFile/Name-Tree, JavaScript sowie leeres und nichtleeres Benutzerpasswort; die dabei aufgedeckte PDF.js-`Map`-Repräsentation von Anhängen ist im Produktgate geschlossen. Scan plus Seitenzahl, Privacy-Übergabe und gebündelte Offline-Decoder/Modelle sind regressionsgeprüft; `OCR_TEXT_EMPTY` bezeichnet nur eine insgesamt textleere Extraktion und stoppt nicht mehr vorhandenen nativen PDF-Text wegen einer einzelnen textlosen Bildfläche. Bestätigtes Ende oder `CONVERSION_TERMINATION_UNCONFIRMED`; 60 frühe Windows-Kills prüfen atomare Jobzuweisung | E1/E3; vollständige Objekt-/Layout-/OCR-Coverage des Originalcontainers bleibt eigenständig offen |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge; stdio-JSON-RPC vor dem Parsen auf 1 MiB je Frame begrenzt und nach Überschreitung wieder synchronisiert. BL-044.1 ist als direkte lokale Windows-Mikromessung mit 201 Kandidaten/20 Verzeichnissen quantifiziert (p95 77,142 ms; lokales Referenzbudget 250 ms). Ein dauerhafter Cache ist auf diesem Host nicht indiziert. | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3; End-to-End-Admission sowie UNC-/Sync-Root-Gegenprobe |
| BL-041.15–.18, BL-051.1–6 | Die Astra-E0-Stories sind seit RC139 paketgebunden; Cowork bleibt RC151 aus Commit `fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3`. Standalone RC157 aus `111737d28021b6989ffe8d563b58daa9cbae610f` ergänzt den Windows-Doppelbau und native Mac-Intel/-ARM-/Linux-Smokes einschließlich integrierter Prüfseite. Die drei bisherigen nativen Cowork-Smokes bleiben separat. Der reale 140-Dateien-Windows-Standalone-Lauf ergänzt die Paket-Evidence, ohne Cowork-Modellprüfung zu simulieren. | Menschliche Fresh-Install-, Update-, Rollback-, Accessibility-, Cowork-Modell- und formale N3/N4-Teilfälle sowie versionsgebundener 200-Dateien-/500-MiB-Grenzlauf bleiben E1/E2; den bereits ausgeführten 140-Dateien-Lauf nicht pauschal wiederholen. |
| BL-041.19 | PH-20260923: zentrale wechselseitige Rootprüfung vor Konfigurationsänderung und privater Dateianlage; Bootstrap injiziert den Vertrag produktneutral. 43 reale Dateisystem-/MCP-/I/O-Fälle einschließlich deterministisch synchronisierter atomarer Ersetzung mit echtem Kindprozess; identische Reservierung lesbar, fremder Root/Hardlink gesperrt. RC151 bindet die Quellkorrektur in den veröffentlichten Paketen. | Frühere sporadische Beobachtung nicht rückwirkend eindeutig zugeordnet; sichtbare Zielhost-Gegenprüfung und Betreiberprüfung historischer Freigaben bleiben offen, keine automatische Migration/Löschung. |
| BL-041.20 | 14-Fälle-Hostvertrag, read-only Vorcheck und CLI-Vertragstests vorhanden. Nach offiziellem Update CLI 2.1.280 und Vorcheck PASS; CLI nicht angemeldet. Kostenpolicy im Vertrag: nur enthaltene Abonutzung, keine API-/Zusatzkosten. CLI und lokaler Desktop-Code-Reiter als getrennte Oberflächen erfasst. | E1/E2-/Modellfälle NOT_RUN; exaktes Paket, Desktop-Zugang, Werkzeuginventar und Abrechnungsnachweis erforderlich; kein drittes Produkt |
| BL-041.21 | DS-101 bestätigt; ausdrücklich ausgewählte Wiederverwendung mit unveränderten ACKs, erneut geprüften begrenzten Leserechten und erneuter Generationsprüfung. Reale Paket-/Journaltests einschließlich Ablauf, Manipulation und asynchronem Austausch. | Neues Paket sowie tatsächliches Modellrouting und sichtbarer nativer Picker noch abnehmen |
| BL-050.4 | Alle 16 synthetischen Dateien in beiden Modi durch echte projizierte Runtime/Converter/OCR/Review/Privacy/Export: 16 Konvertate und 16 anonymisierte Ausgaben nach explizitem Titel-/Personenreview. Identitäts-/Fachanker einschließlich Titel, Quellhashes und unabhängige dokumentübergreifende Pseudonyme geprüft. VECTRA-20260923: 12 CSV- und 40 Registrytests, darunter ein neuer realer Konvertierungs-/Privacy-Gegenfall mit eingebetteten JSON-Skalaren. | E0 mit produktiver Paketprojektion, nicht neu veröffentlichtem ZIP; ausgewählte Fachanker beweisen keine vollständige Semantik. Keine neue JSON-Formatfreigabe oder Abhängigkeit. Synthetische Reviewentscheidung ersetzt weder menschliche N3/N4-Abnahme noch OCR-Vollständigkeitsnachweis |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

Die Linux-x64-E0-Zelle ist durch Lauf
[`34356576842`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34356576842)
auf Commit `84fd616c` konkret gebunden. AppImage-SHA-256 ist
`bd25febd…8853`, Distributions-ZIP-SHA-256 `177b9763…eaee`; zwei native
Lifecycle-Smokes und der bytegleiche Doppelbau sind grün. Die in der Matrix
genannte sichtbare Linux-E1/E2 bleibt davon unberührt offen.

## Historische RC108-Integration vor ihrer Paketbindung

Der Codeweg ist aktiv, nicht lediglich ein freigeschaltetes Modusflag:
`core/processing-mode` → Desktop/IPC/Service → Intake/v5-Journal →
`conversion-worker` → `markdown-store` → Recovery/Export. Rohes Markdown
erhält weder Privacy-Status noch Capability und wird nicht automatisch an KI
übertragen. Warnende Extraktionen erscheinen ausdrücklich als unvollständig.

E0: 22 echte Konvertertestgruppen und 100 TXT-Dateien in lokal 15,264 Sekunden,
ohne die etwa 188-MB-Runtime je Datei erneut vollständig zu lesen. 60 frühe
Beendigungen prüfen den atomar an `CreateProcess` gebundenen Windows-Job;
7 native Launcher- und 19 Parser-Isolationstests grün. Die native Korrektur
schließt auch im gemeinsamen Cowork-Parser das Start-/Jobzuweisungsfenster.
Diese Messung ist keine allgemeine Performancegarantie.

Dieser Abschnitt beschreibt den damaligen Vorbindungsstand von RC108. RC108
wurde später separat gebunden; der aktuelle RC109-Nachweis steht am Anfang
dieser Matrix. Windows-Engineering-Evidence ersetzt weiterhin weder sichtbaren
UAT noch Intel-/ARM-macOS.

## DS-109 – revalidierte Architekturkorrekturen, lokaler Prüfschnitt

Stand: 05.10.2026; keine Veröffentlichung. Drei technische Reviewrollen prüften
Privacy/OCR, native Lebenszyklen und UI-/DTO-Verträge unabhängig. Bestätigte
Gegenbeispiele wurden umgesetzt und nochmals überprüft. Der zweite Schnitt
fand zusätzlich den Abteilungssuffix „von der Planung“ und einen zu strengen
nativen Identitäts-DTO-Vertrag; beide wurden geschlossen regressionsgesichert.

| Nachweis | Tatsächlicher Umfang |
|---|---|
| `test-residual-person-review.js` | 43/43 bestanden, einschließlich echter Engine-/Standalone-Publikation, gebundener Keep/PERSON/Unternehmenswahl, Quellschutz, technischer Negativkontrollen und Reviewgrenzen. Die unabhängige letzte Gegenprüfung bestätigte 12 tatsächliche Publikationen für Suffix-/Partikelfälle, exakte Grenzen und unveränderten Cowork-Adapterumfang. |
| `test-standalone-conversion-worker.mjs` | 41 echte paketierte Konvertierungsgruppen auf Windows x64 bestanden, 0 übersprungen; tatsächliche PDF.js-Operatorliste und OCR-/Abbruchpfade. PDF.js-Probe besitzt einen Kindprozess, dessen DLL vor Bereinigung entladen ist. |
| `cargo test --locked --offline` | 45/45 Windows-Host-Rusttests bestanden, 0 ignoriert; erweiterter geschlossener Identitäts-DTO, tatsächliche OS-Helfer, Prozess-/Shutdownverträge und Startbericht. `cargo clippy --locked --offline --all-targets -- -D warnings` bestanden. Keine native Mac-GUI-Abnahme. |
| Gezielte Source-/Vertragsprüfungen | Quellenaufnahme 27, PDF-Layout 12, History/Identitätsledger, Frontend 45, Reviewfrontend 22, Desktopvertrag 24, Wide-Orchestrator 11, Reviewmodell 16, Diagnose 8 und POSIX-Adapter 4: bestanden im jeweils dokumentierten lokalen Schnitt. |
| Wiederaufnahmevertrag | Ein veralteter Vollsuite-Test erwartete nur die früheren allgemeinen Startcodes. Nach unabhängiger fachlicher Gegenprüfung schließt die Erwartung die vier differenzierten Startursachen ein. 13 Runner-Regressionen bestanden: kein automatisches Retry, drei gleiche Fehlschläge führen zum terminalen Stopp, freigegebene Arbeit bleibt unverändert; Isolation, Schutzgrenzenfehler und unbestätigte Terminierung bleiben sofort terminal. Produktions-Retrylogik wurde dafür nicht aufgeweicht. |
| `validate-claude-local.mjs --cli …claude.exe` | Claude Code 2.1.280, Plugin-/Marketplace-Strukturvalidierung PASS; kein Modell-, Cowork- oder Gerätebediennachweis. |
| Windows-Engineering-Paket | Frischer endgültiger Kandidat `dist/engineering-ds109-final-20261005/DataSecure-Standalone-3.2.0-rc157-windows-x64.zip`, 591 Einträge, 110.406.939 Byte; SHA-256 `3efd3d69813d0705b5557fe3d1ccf7cda5b66d07f23dafe2966a95002252c3c6`. Archiv-/Inventarprüfung bestanden. Unveröffentlichter Arbeitsstand, kein neuer Releasecommit. |
| Paketgebundener Workflow | Für genau diesen Hash bestanden: echte Mischformatkonvertierung (11 Ergebnisse und ein absichtlich fehlerhaftes CSV in beiden Modi), passive PDF-/PPTX-Privacy, Review-IPC mit 1.500 Fundstellen je Datei und 4.500 in der ersten Gruppe, Keep/PERSON/Unternehmen, automatische Folgeprüfung, Verschieben/Neustart, laufweite Entscheidungen und konkreter CSV-Fehlername. History in beiden Modi, fehlerhafter Lauf, exakte Ziele, Neustart und geänderter Ergebnisordner bestanden. Keine WebView-Bedienung durch diesen Sidecar-Test behauptet. |
| Nativer Windows-Start desselben Pakets | Geladene Haupt-/Prüfseite und erfolgreiche IPC; 1.497,514 ms Start, Desktop-EXE 3.727.360 Byte, Windows 10.0.26200.0 x64, WebView2 154.0.4258.53 (machine). Im Messfenster 7 Prozesse, 0 TCP-Listener und 0 UDP-Endpunkte. Testscope mit 912 eigenen Einträgen bereinigt. Kein vollständiger bedienter Review-/Accessibility-Nachweis. |
| POSIX-Startgegenproben | Frischer WSL/Linux-C-Build mit `-std=c11 -Wall -Wextra -Werror -O2`: fehlend 127, nicht ausführbar 128, ungültiges ELF 129, fehlender ELF-Loader 132, gültiger Start 0. Vier Adaptertests und 16 Darwin-/Linux-Vertragsfälle bestanden; keine injizierten Setup-Syscallfehler oder native Mac-Laufzeitprobe. |
| Abschließende lokale Gesamtgates | `npm run test:product` vollständig bestanden: 75 Basis- und 119 direkte Testdateien (194 insgesamt), einschließlich der korrigierten 13 Runner-Regressionen. `npm run test:docs` und `git diff --check` bestanden; Claude-Strukturprüfung, Rust-/Clippy-, Konverter- und Windows-Paketnachweise siehe oben. Technischer E0-Umsetzungsschnitt abgeschlossen, nicht als allgemeine Zielhost-/Releasefreigabe ausgegeben. |
| Veröffentlichungsgebundene Cowork-Gates | `npm run build` versucht, nach erfolgreicher Native-/Statusprüfung durch `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` abgelehnt: der vorhandene nicht committete Arbeitsstand ist kein sauberer Releasecommit. `test:plugin-zip` versucht, aktuelles RC157-Plugin-ZIP fehlt entsprechend. Schutz nicht umgangen; Cowork RC151 und veröffentlichte Standalone-Archive unverändert. Standalone-Engineering-Paket separat nachgewiesen, nicht als bestandener Cowork-Releasebuild ausgegeben. |

Ein früher Testversuch ließ wegen geladener Windows-Canvas-DLL den eigenen
Temporärordner `.tmp-standalone-package-conversion-4VGehN` zurück. Keine stärkere
oder breitere Löschung wurde versucht; der reparierte Testlauf bereinigt seinen
eigenen neuen Scope erfolgreich. Originale, vorhandene Ergebnisläufe und
veröffentlichte Archive blieben unverändert. Der WSL-Supervisor-Nachweis ist
eine Linux-Gegenprobe, keine native macOS-Evidenz. BL-010.50/51 bleiben offen.

## Historischer RC107-/DS-067-Nachweis

Der RC107-Korrekturschnitt ergänzt unter den vorhandenen Storys Regressionen
für verlorene Frontend-Polltimer, veraltete Folgelaufanzeigen, aktuelle
damalige Standalone-Zuordnung auch bei gestoppten Dateien (durch RC120 ersetzt), ausstehende
Abschlussmetadaten ohne verfälschte Dokumentzähler und typstabile
Unternehmenskurzformen sowie den expliziten Sidecar-Abschluss bei EOF und
defektem IPC ohne Abbruch dauerhaft übergebener Worker. Produktsuite (40 Basis-
und 111 direkte Dateien) und abschließendes Standalone-/Rust-Gate sind grün.
Der native Windows-Test besitzt jetzt eine vor dem
Bootstrap validierte private Umgebung einschließlich WebView und Dokumenten.
Neue Paket-Evidence muss aus dem neuen Commit erstellt werden; der
historische RC106-Receipt beweist weder diese Korrekturen noch die neue
Testdatenisolation. Sichtbare Explorer-/Finder-Bedienung und macOS bleiben E1/E2.

Der reale Folgestapel im ersten RC107-Paket (`ebffe87`) deckte zusätzlich die
fehlende terminale Klassifikation einer bestätigten Parserablehnung auf. Dieser
Build wurde nicht an INT-13 gebunden. `PARSE_FAILED` gegenüber Timeout/Crash wird
im gemeinsamen Runtimevertrag korrigiert und separat regressionsgeprüft; erst
ein neuer Quellcommit mit beiden erfolgreichen Paketläufen liefert neue Evidence.

`aaecf59` bestand anschließend die lokale CI-Produktsuite (40 Basis- und 48
direkte Dateien), den gepackten Vierformat-/Fehlerfolgelauf und den isolierten
nativen Windows-Start. Die sichere Testbereinigung verweigerte eine vom
Betriebssystem erzeugte Cache-Junction vor jeder Löschung; der Testrest bleibt
erhalten. Daher weiterhin kein vollständiger RC107-PKG-04-Receipt und keine
INT-13-Bindung aus diesem Versuch. Eine spätere erfolgreiche Bindung muss den
neuen Harness-Commit nennen, nicht rückwirkend diesen Versuch freigeben.

Abschluss 06.09.2026: `7b88a81ff577aaa270f1354d75365b2df4a4666e` besitzt nun
einen vollständigen PKG-04-Receipt und INT-13-Bindung. Beide unabhängig sauber
gebauten ZIPs/Desktop/Core-Binaries bytegleich, beide realen Paket-/Worker- und
nativen Windows-Smokes bestanden. Archivhash
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`,
36.071.549 Byte. Vollsuite 40 Basis-/111 Direktdateien und Rust 12/12 grün.
Die beiden alten verweigerten Testprofile bleiben unverändert. Dies ist E0,
keine sichtbare Bedienungs- oder macOS-E1/E2-Abnahme.

- Manifest/Runtime begrenzen temporäre Aufbewahrung auf 0–14 Tage.
- Retentiontests bewahren Quellen, `Processed`, fertige `Output`-Pakete und
  `DataSecure-Export` vor automatischer Löschung.
- Manifest besitzt keinen auswählbaren Bildmodus; Runtime startet fest im
  sicheren Bildschutz.
- Anwenderdokumente nennen nur ZIP/Marketplace. MCPB wird ausschließlich über
  explizite Engineering-Skripte gebaut und geprüft.
- Manifest-, Retention-, Dokumenten-, Capability-, ZIP- und Marketplace-
  Vertragstests sichern diese Grenzen.
- Das versionneutrale UAT-Kit nennt UAT-01 bis UAT-06 stets mit Klartextnamen und
  direkten Anleitungslinks. Aktive lokale Dokumentlinks werden automatisiert
  aufgelöst; historische RC-Kits und Aufträge sind sichtbar als nicht aktuell
  klassifiziert.

## Bedeutung von „blockiert“

Ein Backlogpunkt ist blockiert, wenn kein weiterer lokaler Codeabschluss behauptet
werden darf, bevor eine reale Claude-Version, Zielplattform oder benannte Fachrolle
die Evidenz liefert. Das ist keine implizite Aufforderung, VM, Zusatzkonto,
Schlüsselbund oder Clouddienst einzuführen.

Die vor der Konsolidierung geführte Einzelstory-Matrix bleibt als historischer
Nachweis im
[Archiv](../archive/2026-09/canonical-history/BACKLOG_EVIDENCE_MATRIX_HISTORY_THROUGH_RC84.md).
