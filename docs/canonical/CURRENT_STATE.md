# RC44-Ist-Abgleich zum kanonischen Backlog

Stand: 25.08.2026 · geprüfter Produktstand: RC44

Dieser Nachweis verhindert Doppelarbeit. `erledigt` bedeutet vollständig gegen das
Ziel abgenommen, `teilweise` bedeutet wiederverwendbare Implementierung mit klarer
Restdifferenz, `offen` bedeutet ohne belastbare Produktimplementierung. Testdateien
sind Evidenz für Codeverhalten, nicht automatisch für installierte Claude-Oberflächen.

Historischer lokaler Regressionsnachweis 23.08.2026: Ein früherer vollständiger
`npm test`-Lauf wurde mit Exit-Code 0 festgehalten. Er ist keine aktuelle
Release-Abnahme und darf nicht aus einzelnen späteren Teiltests abgeleitet werden.
Die jeweils tatsächlich vollständig beendeten Testläufe gehören in `docs/TESTING.md`.
Der RC36-Arbeitsstand bestand am 24.08.2026 die vollständige lokale
`test:ci`-Suite, 66 servergebundene Batchtests, ZIP-Parität und beide Claude-Plugin-
Validierungen; Details und Aussagegrenzen stehen dort.
Weder dieser Nachweis noch ein einzelner lokaler Lauf erweitert die
TXT/Markdown/CSV/DOCX-Freigabe oder ersetzt frische ZIP-/Marketplace-Installationen
und die manuelle Claude-Abnahme auf Windows, macOS sowie dem Linux-Claude-Code-Host.

## Verdichteter IST/SOLL-Abgleich nach Product-Vision-Review

| Bereich | RC44-IST | beschlossenes SOLL | Lücke / Priorität |
|---|---|---|---|
| Cowork-Start | kurzer Picker-/Workerpfad teilweise vorhanden; Host-Node und reale Cowork-Evidenz offen | selbsttragender Windows-/macOS-Start, Readiness und genau ein Self-Heal | P0 Distribution/Evidenz |
| Quellen | Mehrfach-Dateipicker als einziger ausführbarer Eingang; einmalige Startmigration kann nur verwaiste Alt-Claims wiederherstellen | Datei oder rekursiver Ordner, ausschließlich lesend, keine Linkverfolgung | E0 Input-Oberfläche entfernt; P0 internen Altcode abbauen, P1 Ordner |
| Stapel | durable Checkpoints und Background-Intake; neue Auswahl trotz pausierter Stapel im Arbeitsstand umgesetzt | ein aktiver, mehrere pausierte; Pause blockiert nicht | E0 umgesetzt, E1/E2 offen |
| Review/Abschluss | abgekoppelter Review ohne menschlichen Timeout und detachierte Abschlussmeldung im Arbeitsstand | persistente Queue ohne Entscheidungs-Timeout, nicht blockierender Abschluss | E0 umgesetzt, E1/E2 offen |
| private Daten | Rohsnapshots und Reviewdaten nicht durchgehend OS-benutzergebunden verschlüsselt | DPAPI/Keychain, kein Klartextfallback | P0 Security |
| Ergebnisse | Mapping vorhanden; automatische Output-Löschung im Arbeitsstand deaktiviert | neutrale dauerhafte Exporte/Mapping, nur explizit löschen | E0 umgesetzt, Ableitung offen |
| Formate | TXT/Markdown/CSV/DOCX; Auswahl überwiegend endungsgeführt | Signatur+Struktur; drei Ergebnisgrade; alle Zielformate gestuft | P1 Content, danach Formate |
| Performance | serieller Produktpfad, inaktive Harnesses und lokale Benchmarks | adaptive kleine Parallelität, 2-s-/10-s-/10%-Budgets | P1 nach Sicherheitsgates |
| Cowork-UI | Text/OS-Dialoge, keine MCP-App | inhaltsfreie progressive MCP-App mit vollem Fallback | P2 Komfort |

Die vollständige Sollableitung steht in `PRODUCT_VISION.md` und
`TARGET_ARCHITECTURE.md`. Diese Matrix ist keine Freigabe; sie priorisiert die
lieferbaren Differenzen im Backlog.

## BL-003 – Product Vision und Dokumentenkanon

Status: **in Arbeit**

Vorhanden: Product Vision, Zielarchitektur, Dokumentenregister, DS-041 bis DS-060,
RC44-IST/SOLL-Matrix und priorisiertes Arbeitspaket. Rest: Maschinenvertrag,
Traceability, Evidence-Matrix und alle abgeleiteten aktuellen Dokumente gegen den
neuen Kanon validieren; danach BL-003.1 bis BL-003.6 mit Testnachweis archivieren.

## BL-001 – Kanonisches Dokumentensystem

Status: **erledigt**

Vorhanden: `docs/canonical/*`, Entscheidungs-/Backlog-/Traceability-IDs und
`scripts/verify-canonical-docs.mjs`. Das Wiederverwendungsregister
`OPEN_SOURCE_COMPONENTS.md` ordnet jedem Epic Open-Source-Kandidaten oder eine
begründete Eigenimplementierungs-Restlücke zu; der Dokumententest blockiert fehlende
Epic-Zuordnungen. Rest: Kandidaten je Story praktisch evaluieren und das Register bei
jeder Auswahl oder Ablehnung pflegen.

## BL-002 – Ist- und Ziel-Fähigkeiten

Status: **erledigt**

Vorhanden: `BUILD_INFO.json`, `manifest.json`, `gateway/status.js` und Manifesttests
beschreiben RC30 fail-closed mit TXT/Markdown/CSV/DOCX. Das getrennte
`TARGET_CAPABILITIES.json` erfasst alle DS-IDs, Zielformate, Plattformen und Grenzen
ausdrücklich als Nicht-Runtime-Vertrag. `test-capability-contract.js` blockiert Drift
zwischen Ist-Metadaten, Runtime, Skills, Marketplace und aktiven Handbüchern und
verhindert, dass der Zielvertrag als aktuelle Plugin-Fähigkeit ausgegeben wird.
Rest: nur laufende Vertragspflege bei jeder Capability-Änderung.

## BL-010 – Plattformpakete

Status: **BL-050.1 und BL-050.2 abgeschlossen; weitere Format- und
Angriffsausweitung bleibt in ihren jeweiligen Freigabe-Stories offen**

Vorhanden: Plugin-ZIP und MCPB, bytegenaue Paketparität, Windows-x64-Launcher sowie
Dateiauswahladapter für Windows, macOS und Linux. Rest: automatische OS-Paketwahl,
installationsfreie Plugin-Runtime, produktionsfähige macOS-/Linux-Komponenten sowie
frische ZIP-/Marketplace-Installation und Rückrolle auf allen drei Plattformen.

Der Hostvertrag ist präzisiert: Die lokale Engine bleibt auf Windows, macOS und Linux
zielbar, aber laut aktueller Claude-Code-Dokumentation ist die Claude-Desktop-App nur
für Windows und macOS verfügbar. Linux wird deshalb ausschließlich als lokaler
Claude-Code-Host-Zielpfad geführt; ein Linux-Desktop-Plugin wird weder beworben noch
als abgenommen ausgegeben. Rest bleibt der konkrete frische Installationsspike samt
installationsfreier Node-Auflösung.

Review 23.08.2026: Die Plugin-`.mcp.json` startet derzeit `node`. Dass dies auf dem
Entwicklerrechner funktioniert, belegt keinen ZIP-/Marketplace-Start auf einem
frischen Konto ohne System-Node; die ausdrücklich dokumentierte eingebaute
Node-Runtime des MCPB darf nicht auf den Plugin-ZIP übertragen werden. Zusätzlich
sind die Herstellerangaben zu lokalem MCP in Cowork-Web-/Mobil-/Cloud-Sitzungen
widersprüchlich. Deshalb ist nur ein erfolgreicher `privacy_status` in der aktuellen
Sitzung ein positives Hostgate. BL-010.7 und BL-010.8 sind P0; Cowork, ZIP und
Marketplace bleiben bis zu ihren Fresh-Install-/Negativmatrizen unbelegt.

`RUNTIME_START_MATRIX_V1.json` macht diese Grenze maschinenlesbar: MCPB nutzt laut
offizieller Desktop-Extension-Dokumentation die eingebaute Node-Runtime ohne
Nutzerinstallation; gewöhnliches Plugin-ZIP/Marketplace darf daraus keine Garantie
ableiten. Der Node-SEA-Fallback besitzt jetzt einen unveröffentlichten Windows-x64-
Engineeringnachweis. Node 22.23.2, `postject` 1.0.0-alpha.6 und vier offizielle
Zielarchive sind exakt gelockt. Ein fester erweiterungsloser Plugin-Befehl verwendet
unter Windows die `.exe`-Auflösung und auf POSIX einen geschlossenen Ziel-Dispatcher.
Zwei Windows-Builds waren byteidentisch; der echte MCP-Server bestand bei leerem
`PATH` `initialize` und `privacy_status` ohne Host-Node. Die aktuelle öffentliche
`.mcp.json` bleibt bis zur ausgeführten Vier-Ziel-Matrix und zu Fresh Install,
Update/Rollback unverändert auf `node`; der Status weist diesen Pfad nun als
`host_node` und hostabhängig aus. Nutzerinstallationen, Runtime-Downloads, stiller
MCPB-Wechsel, drei sichtbare OS-Plugins und vorschnelle SEA-Freigaben bleiben
automatisch gesperrt. Ein separater Engineering-Assembler verlangt alle vier an
Build- und MCP-Evidenz gebundenen Zielprogramme, verändert nur einen temporären
Stagingbaum und erzeugt bei unvollständigem Satz kein ZIP; ein erfolgreiches
universelles Assembly wurde noch nicht behauptet.

Der Hostvertrag ist inzwischen zusätzlich in `HOST_MATRIX_V1.json` und
`HOST_MATRIX_V1.md` versioniert. Direkte Prompts und der Anonymisierungs-Skill
stoppen vor Datei-/Ordnerzugriff, wenn `privacy_status` in genau der aktuellen
Sitzung nicht erfolgreich ist; Skill-/Plugin-Sichtbarkeit, Desktop-App, Upload,
Computer-Use, allgemeines Dateisystem und andere Connectoren gelten nicht als
Nachweis oder Ersatz. Vier Evalfälle prüfen Web, Mobil, Cloud-/Scheduled und einen
getrennten Desktop-Connector. Damit ist die Policy automatisiert belegt, nicht aber
der echte Hostlebenszyklus; die beobachtete Negativmatrix bleibt offen.

## BL-011 – Fortsetzbarer Job Store

Status: **teilweise**

Vorhanden: persistente Batch-Snapshots, monotone Companion-Journale, atomare Claims,
Crash-Recovery, Retention und Einzelläufe ohne automatische Doppelverarbeitung;
abgedeckt durch `test-batch-session`, `test-companion-job-store`,
`test-companion-retention` und `test-gateway-e2e`. Der lokale Kern akzeptiert jetzt
bis zu 100 Dateien mit zusammen höchstens 500 MiB. `resource-limits.js` trennt diese
Stapelgrenze ausdrücklich von parserseitigen Einzelgrenzen: TXT/Markdown 8.000.000
Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB sowie entpacktes OOXML 128 MiB. Picker,
Snapshot und Runtime prüfen sie vor einer teuren Materialisierung; eine feste
Seitenbegrenzung existiert nicht. `test-resource-limits.js`, Picker- und
Capability-Verträge blockieren abweichende Versprechen. Eine atomare benutzerlokale
Prozesssperre erzwingt jetzt genau einen verarbeitenden Stapel, auch über getrennte
Serverprozesse. Unterbrechungen während einer Datei werden als retryfähig gespeichert
und nur nach ausdrücklicher Fortsetzung erneut geplant; erfolgreiche Dateien werden
nicht wiederholt. Freigegebene und sicher gestoppte Positionen benötigen ihre
versiegelte Quelle nach lokalem Mapping-Commit nicht mehr: Die private Arbeitskopie
wird sofort nur als reguläre, erwartete Datei entfernt. Ein nachgelagerter Löschfehler
kann weder eine Freigabe rückwirkend in einen Stopp verwandeln noch Originale berühren;
die Kopie bleibt ausschließlich lokal zur späteren Bereinigung markiert und wird bei
jedem weiteren sicheren Batch-Aufruf sowie beim Start erneut geprüft. Der Batch
verarbeitet bis dahin versiegelte private Arbeitskopien und lässt Originale
unverändert. Ein atomar veröffentlichtes Paket wird über die vorab zufällige
Batch-Item-ID, Manifest und Markdown-Hash wiedererkannt; bis zur ausdrücklichen
MCP-Übergabebestätigung wird genau dieses Paket erneut angeboten statt die Quelle
erneut zu verarbeiten. Für jeden irreversiblen Verarbeitungsschritt wird zusätzlich
ein fester inhaltsfreier Checkpoint (`sealed`, private Kopie, Extraktion,
Textprüfung, Paketverifikation, Übergabe oder terminaler Zustand) atomar
persistiert und nicht über MCP ausgegeben. Terminale Sicherheitsstopps bleiben
bewusst terminal.

Nach einem erfolgreichen lokalen Snapshot führt der private Batchzustand zusätzlich
eine feste I/O-Zusammenfassung: Vorprüfung, Arbeitskopien (Dateien und auf höchstens
500 MiB gerundete Gesamtmenge), finale Freigabe-Gates, Paket-/Audit-Commits und
einmalige Stapelwartung. Diese Zähler haben keine Dokumentbeziehung und werden
weder über MCP noch in Audit, Mapping, Manifest oder Export ausgegeben. Sie dienen
nur der lokalen Regressionsprüfung; ein fehlender Zähler eines älteren Snapshots
wird nicht nachträglich ergänzt.

Das Cowork-/UX-/Performance-Review vom 24.08.2026 ist technisch konsolidiert:
Der lokale Mehrfachpicker ist der einzige ausführbare Eingang. Die frühere
Input-Oberfläche und ihre drei Werkzeuge sind entfernt; nur die datenbewahrende
Upgrade-Recovery für bereits verwaiste Alt-Claims bleibt vorübergehend intern.
Die sichtbare Routineoberfläche umfasst 8 Werkzeuge, die gesamte Oberfläche im
IT-Supportmodus 25. Jeder Toolvertrag besitzt vier explizite MCP-Risikohinweise.
Jeder ruhende oder terminale Stapelzustand erzeugt genau eine inhaltsfreie lokale
Meldung mit genau einer nächsten Aktion; Fortsetzung und Review öffnen keine neue
Dateiauswahl. Gleichnamige Quellen erhalten unabhängige opake IDs.

Der reale synthetische Benchmark nutzt TXT, CSV und DOCX kalt/warm für 1/10/100
Dateien und erfasst p50/p95, Gesamtzeit, CPU, Peak-RAM sowie nicht zugeordnete
Laufzeit mit monotoner Zeitbehandlung und relativen Regressionstoren. Der Handoff
dekodiert kleine verifizierte Ergebnisse einmalig und nutzt für große Seiten ein
begrenztes Indexfenster; Buffer und Index werden am Ende best-effort überschrieben.
Eine nicht importierte Zwei-Worker-Vorbereitung und ein nicht importierter OCR-
Session-Harness decken geschlossene Nachrichten, Reihenfolge, Crash, Replay,
Single-Flight sowie Ressourcen-/Zeitstopps ab. Beide bleiben absichtlich außerhalb
des Produktpfads, bis reale Drei-OS-Ressourcenevidenz vorliegt.

DS-061 und `REFACTORING_PLAN.md` legen vor den folgenden Verhaltensänderungen eine
verhaltensneutrale Zerlegung des Stapelkerns fest. Diese Strukturarbeit ist als
BL-011.15 in Arbeit. Ergebnis-Cursor/-Paging und die Auswahl lokaler Handoff-
Kandidaten sind bereits in `gateway/batch-results.js`, Statusmodell,
Fortschrittsberechnung und inhaltsfreie Nutzertexte in `gateway/batch-progress.js`
gekapselt. Die Keep/Redact-/Deferral-Policy für lokale Zertifikatsentscheidungen
liegt in `gateway/batch-review-policy.js` und hält Rohtext weiter ausschließlich
im Speicher. Die Short-Write- und POSIX-Directory-Fsync-Primitiven liegen in
`gateway/batch-journal-io.js`. `gateway/batch-journal-store.js` kapselt darauf
die atomare Veröffentlichung sowie sichere, getrennte Lesepfade: der normale
Pfad validiert Schema, Token, nichtleere Positionen und eine parsebare Ablaufzeit
und bereinigt abgelaufene eigene Snapshots; der Maintenance-Pfad bleibt
mutationsfrei und liefert Fehler an den zählenden Aufrufer. Direkte Tests
injizieren Partial-/Zero-Write, Datei-/Verzeichnis-Fsync-, Close- und
Rename-Fehler sowie Symlink-, Dateityp- und Inode-Austausch. Dadurch ist auch
die zuvor mögliche Annahme eines nicht parsebaren `expires_at` geschlossen.
`gateway/batch-private-store.js` hält dynamisch
aufgelöste private Pfade und tokengebundenes Cleanup; `gateway/batch-snapshot.js`
kapselt Kapazität, OOXML-Preflight sowie TOCTOU-gebundene Kopie. Positive
Partial-Writes werden vollständig geschrieben; Zero-Write, Short-Read und eine
nachträgliche `ctime`-Änderung stoppen fail-closed und entfernen die exakte
Teilkopie. `gateway/batch-active-lock.js` kapselt die globale Prozesssperre;
`gateway/process-liveness.js` vereinheitlicht die fail-closed PID-Liveness für
Lock, Job-Recovery und Vorbereitungsslots. Ein Lock-Austausch zwischen Eigentumsprüfung und Löschung wird
erkannt; ein neuer Owner bleibt erhalten. Nur `ESRCH` beweist einen toten
Prozess, während `EPERM` und unbekannte Fehler blockierend bleiben.
`gateway/batch-executor-lease.js` kapselt Claim, Zugriffskontrolle und Release
des lokalen Executors als injizierte Factory. Falsche oder konkurrierende PIDs,
Lockfehler sowie Journalfehler können dadurch fokussiert geprüft werden und
lassen einen bestehenden Marker unverändert. `gateway/batch-reconciliation.js`
verifiziert deterministische Output-Pakete ohne Cache, adoptiert sie vor jeder
Retry-Klassifikation und hält die Recovery-Reihenfolge Outbox, idempotente CSV
und Intent-Bereinigung fest. Direkte Tests belegen fehlende, manipulierte und
verlinkte Pakete, alle drei Mapping-Fehlergrenzen sowie idempotente Zustände ohne
Doppelveröffentlichung. `gateway/batch-recovery.js` orchestriert darauf die
read-only Statusabfrage, Startup-Recovery und periodische Ablaufbereinigung
hinter derselben globalen Sperre wie die Verarbeitung. Aktive Owner und lokale
Executoren werden nicht umgedeutet; bei Recovery gilt unverändert Adoption vor
Mapping vor Retry vor Cleanup und höchstens ein abschließender Journal-Commit.
Abgelaufene private Arbeitskopien werden vor ihrem Journal entfernt, Fehler
bleiben pro Snapshot isoliert und gezählt. Neun direkte Negativtests decken
gemischte defekte Journale, Lock- und Freigabefehler, Teilbereinigung,
Idempotenz und die unveränderte öffentliche Fassade ab.
`gateway/batch-retention-protection.js` liest offene Delivery-/Mapping-
Referenzen ohne Journalmutation und blockiert automatische Output-Retention
bereits bei einem einzigen unvollständigen Scan. Direkte Tests belegen die
dynamische Root-Auflösung, den Erhalt vorher gefundener Schutz-IDs und die
unveränderte Fail-closed-Fassade. `gateway/batch-delivery.js` bündelt die
verifizierte Capability-Ausgabe, atomare Einzel-/Mehrfachbestätigung, lokalen
Abschluss und das terminale Einzeldatei-Cleanup. Eine vollständig bereits
bestätigte Übergabe ist jetzt ein dauerhafter No-op und erzeugt weder einen
zweiten Journal-Commit noch einen doppelten terminalen Evidenznachweis. Acht
direkte Negativtests belegen Gesamtseitenvalidierung vor Mutation,
Paketmanipulation, Journal- und Lockfehler, sichere Wiederholung nach bereits
gelöschter Arbeitskopie sowie Link-/Pfadschutz. Die weiteren Schnitte
trennen Verarbeitung/Commit, Review-Orchestrierung und verbleibende Wartung
hinter der bestehenden Exportfassade. Der verifizierte Outbox-Replay liegt nun
in `gateway/batch-mapping-maintenance.js`; nur `verified` wird nach der festen
Reihenfolge Mapping vor Intent-Löschung repariert, `missing` entfernt nur den
exakten verwaisten Intent und jeder unsichere Zustand bleibt pending.
`gateway/batch-intake.js` bindet den deklarierten Dateinamen vor jedem
Metadatenzugriff an den tatsächlichen absoluten Basename, lehnt doppelte Quellen
ab und hält Journal und versiegelten Work-Baum auch dann gemeinsam recoverable,
wenn der Parent-Fsync erst nach dem atomaren Journal-Rename fehlschlägt.
`gateway/batch-snapshot.js` bindet beim späteren Review und Processing den
gesicherten Work-Namen, regulären Dateityp, die exakte Größe und den gespeicherten
Streaming-Hash-Vertrag wieder an dieselbe Arbeitskopie, ohne sie vor der ohnehin
nötigen isolierten Kopie ein zweites Mal zu lesen. Danach folgen
Originalschutz, internes Legacy-Intake, benutzergebundene Verschlüsselung,
Distribution, Inhaltsgrenze und erst dann Performanceaktivierung sowie
Formaterweiterung.

Als noch nicht aktivierte Vorbedingung für eine spätere interne Zwei-Worker-Strecke
existiert ein eigener lokaler Zwei-Slot-Lease-Store. Seine strikt geschlossenen
`0600`-Records enthalten nur Schema, opake Batch-/Item-/Lease-Kennungen und PID;
Namen, Pfade, Inhalte, Hashes, Profil, Größen, Zeitstempel und Fehlerdetails sind
ausgeschlossen. Defekte, zusätzliche oder unlesbare Records blockieren den
Parallelmodus fail-closed. Der derzeitige Worker verwendet diesen Store bewusst noch
nicht: bis Slot-Recovery, atomare Speicherreservierung und OCR-Gesamtbudget belegt
sind, bleibt der Produktpfad seriell.

Die Slot-Recovery selbst ist nun als private Koordinatoroperation vorhanden: Sie
löscht nur Leases eines nachweislich toten Prozesses, deren Batch- und Itembindung
vorher explizit freigegeben wurde. Lebende, unbekannte, fremde oder manipulierte
Leases werden weder übernommen noch gelöscht. Ihre Einbindung in den Worker bleibt
bis zur Speicherreservierung und der anschließenden Drei-OS-Abnahme deaktiviert.

Ein isolierter Reservierungs-Store schreibt feste lokale Bytes in eine reguläre
`0600`-Datei und veröffentlicht erst danach einen geschlossenen Record mit opaker
Batch-/Reservierungskennung und Bytezahl. Er verwendet ausdrücklich keine
Sparse-Datei und keinen `ftruncate`-Ersatz, ist aber noch kein
plattformübergreifender Nachweis physisch belegter Blöcke. Der Store ist nicht an den
Serienpfad angebunden: Vor Aktivierung sind ein lokaler Plattformadapter für die
Allokationsprüfung, getrennte Workspace-/Output-Volume-Gates, Crash-Recovery und
reale Windows-/macOS-/Linux-Evidenz erforderlich.

Der Privacy-Stammordner ist im MCPB als optionaler Verzeichniswert und im
Plugin-Connector als `EU_PRIVACY_ROOT` konfigurierbar. Ein leerer Wert bleibt beim
sicheren benutzerlokalen App-Datenstandard `SecureDataMsg/workspace`. Vor der Erstellung der Unterordner wird
der konfigurierte Stamm ohne Pfadprotokoll gegen Cloud-Sync, Netzpfad und
Symlink/Junction geprüft; ein unsicherer oder nicht prüfbarer Wert stoppt mit
`UNSAFE_STORAGE_LOCATION`. Eine Umstellung migriert oder verändert keinen aktiven
oder wiederaufnehmbaren Stapel.

Manipulation oder Verlust einer versiegelten Arbeitskopie invalidiert den offenen
Snapshot fail-closed: Alle noch offenen Positionen werden lokal als derselbe
technische Stopp dokumentiert und ihre privaten Kopien bereinigt. Die unveränderten
Originale bleiben dabei außerhalb dieses Fehlerpfads.

Die MCP-seitige Fortschrittsantwort enthält außer Zählern jetzt auch eine neutrale
Stapelphase, die nächste Positionsnummer und einen terminalen Fortschrittsprozentsatz.
Fortsetzbare und noch nicht an Claude bestätigte Pakete zählen dafür bewusst nicht als
erledigt; Namen und Pfade bleiben weiterhin ausgeschlossen. Eine lokale sichtbare
Fortschrittsanzeige bleibt offen.

Ein unbekannter oder künftig erweiterter persistierter Phasenwert fällt nicht mehr
auf „nächste Datei verarbeiten“ zurück. Er liefert ausschließlich die inhaltsfreie
Aktion `check_privacy_status`; der Skill startet, setzt oder öffnet dann nichts und
verweist bei fortbestehendem Zustand auf die lokale IT-Prüfung. Das verhindert einen
logischen Fehlstart nach beschädigtem oder versionsfremdem Journal.

Nach mindestens drei bereits lokal gemessenen Verarbeitungsdauern ergänzt dieselbe
Antwort eine konservative Restzeit für rein automatisch verbleibende Positionen. Sie
verwendet den Median der lokalen Dauern, enthält keine Quellidentität und wird bei
offener manueller Prüfung oder einer erforderlichen ausdrücklichen Fortsetzung nicht
ausgegeben. Eine native Live-Anzeige dieser inhaltsfreien Information bleibt offen.

Ein zusätzlicher `privacy_status`-Zähler zeigt ausschließlich die Anzahl noch
bereinigungsbedürftiger privater Arbeitskopien. Er enthält keine Batch- oder
Dokumentidentität und ersetzt weder die sichere Bereinigung noch eine Nutzeraktion.

Die verlangte stapelweit konsistente Pseudonymisierung ist bewusst noch nicht
aktiviert: Sie benötigt einen gleichwertig getesteten OS-Benutzerschutz für DPAPI,
Keychain und Secret Service. Es gibt keinen Klartext- oder Eigenverschlüsselungs-
Fallback; bis zur Drei-OS-Evidenz bleibt die bestehende Pseudonymisierung pro
Dokument begrenzt.

Ein unabhängiges Review am 23.08.2026 hat diesen Punkt als Release-Sperre
bestätigt: Der vorhandene Keyring-/Registry-Pilot ist absichtlich noch nicht in
den aktiven Batchpfad verdrahtet. Eine Aktivierung ist erst zulässig, wenn der
vollständige, offline geprüfte Drei-OS-Runtime-Bundle-Nachweis vorliegt.

Für freigegebene und terminal gestoppte Batch-Dateien entsteht zusätzlich eine
ausschließlich lokale, dauerhafte UTF-8-Mapping-CSV unter `DataSecure-Export`; ein
Stopp erhält bewusst kein erfundenes Ergebnis. Der Skill sieht dabei höchstens den
inhaltsfreien Erfolg des lokalen Ledger-Schreibens, nie Namen oder Pfade. Die CSV ist
nicht über MCP lesbar und enthält keine Inhalte oder Rohwerte aus dem Dokumenttext.
Ein fehlender CSV-Commit lässt ein bereits manifest-verifiziertes Paket unverändert
im privaten Zustand `mapping_pending`. Vor der CSV-Ersetzung wird im lokalen,
nicht per MCP lesbaren `.mapping-outbox`-Ordner ein enger Recovery-Intent mit nur
Dateibasename, opaker Paket-ID und Zufallskennung gesichert. Die Outbox wird beim
Neustart nur für weiterhin verifizierte Pakete idempotent abgearbeitet und nach
erfolgreichem CSV-Commit entfernt. Eine unvollständige atomare Temp-Datei wird nur
nach vollständiger Schema-Prüfung zur Outbox promoviert; sonst stoppt der lokale
Recovery-Pfad geschlossen. Vor jedem CSV-Lesen und -Ersetzen schützt zusätzlich
eine lokale `0600`-Sperre den Read-Modify-Write-Abschnitt. Eine vorhandene,
unlesbare oder verwaiste Sperre wird im Normalpfad nicht gelöscht, sondern
fail-closed gemeldet; kontrollierte Lease-Recovery bleibt eine Voraussetzung der
späteren Zwei-Worker-Optimierung.
Terminale Stapel ergänzen dort einen atomaren JSON-Nachweis mit nur aggregierten
Zählern, Versionen, Regelständen und validierten festen Fehlercodes. Auch dieser
Nachweis enthält keine Namen, Pfade, Inhalte, Hashes, Pseudonyme oder Batch-IDs.
Ein aktuelles P1-Durability-Review hat jedoch eine Crashlücke zwischen terminalem
Journal-Commit und diesem best-effort Append bestätigt: Ein fehlgeschlagener
Append ist noch nicht durable als reparaturpflichtig markiert; ein naiver Retry
könnte umgekehrt einen doppelten Record erzeugen. Bis ein opaker idempotenter
Receipt-/Pending-Vertrag implementiert ist, ist der Nachweis daher nicht als
exakt-einmal crashfest belegt; freigegebene Pakete werden davon nicht zurückgenommen.

Zielvertrag ergänzt: `contracts/BATCH_SNAPSHOT_V1.md` legt private atomare Kopien,
Originalunabhängigkeit, Journalzustände, Crashfenster und Löschregeln für BL-011.1
fest; `test-architecture-contracts.js` schützt die Mindestanforderungen.

Vor dem DOCX-Snapshot prüft der lokale Batch zudem ausschließlich das
ZIP-Zentralverzeichnis gegen den bestehenden 20.000-Einträge-/300-MiB-Vertrag.
Verschlüsselte, ZIP64-, beschädigte und übergroße Container werden ohne Entpacken
und ohne neue Arbeitskopie abgewiesen; die vollständige Parser-, Header- und
CRC-Prüfung bleibt der nachgelagerte, maßgebliche Freigabeschritt.

Der aktive Parserpfad hat feste und getestete Ressourcenbudgets. Jede Plattform
startet Node mit höchstens 384 MiB V8-Heap und der aufrufende Prozess beendet einen
Parser nach 50 Sekunden. Der verifizierte Windows-Launcher erzwingt zusätzlich
768 MiB Prozessspeicher, 40 Sekunden CPU und 45 Sekunden Wallclock; das äußere
Zeitlimit liegt absichtlich danach, um die native Ressourcenmeldung zu erhalten.
Die praktische Ressourcenabnahme auf allen Zielplattformen bleibt offen.

Review-Fortschritt 23.08.2026: Die private `batches`-Wurzel sowie `audit`, `jobs` und
die Datenschutzunterordner verwenden jetzt einen zentralen, bei jedem Zugriff erneut
aufgerufenen Helfer für literale Kindnamen, Linkfreiheit, kanonische Containment-,
Geräte- und Inode-Prüfung. Ein echter Windows-Junction-Test stoppt vor Listing/Kopie
und lässt das externe Ziel unberührt. Drei zusätzliche reale lokale Gegenproben
belegen den Stopp bei Inode-Austausch direkt vor Snapshot, bei ersetzter versiegelter
Kopie vor Recovery sowie bei einem verschachtelten Junction/Symlink vor Cleanup;
gerettete und externe Daten bleiben unverändert. Das Cleanup verwendet nun keine
rekursive OS-Löschung mehr, sondern lstat-/inode-gebundene Einzelobjekt-Entfernung:
eingefügte Links, Junctions oder ausgetauschte Verzeichnisse stoppen vor dem Entfernen.
Sonstige Win32-Reparse-Typen, die echte macOS-/Linux-Matrix und die letzte nur
handle-relativ schließbare Race-Lücke bleiben offen. V8-Heap
und Parent-Timeout auf macOS/Linux sind außerdem weiterhin keine harten Grenzen für
native/`Buffer`-Allokationen und Prozessbäume. Der bewährte POSIX-OCR-Supervisor ist
die vorgesehene Wiederverwendungsbasis für BL-011.9. Sein Quellpilot besitzt jetzt
zusätzlich harte Adressraum-, Daten-, Dateigrößen- und Dateideskriptorlimits sowie
einen festen maschinenlesbaren Vertragsmarker. Der manuelle OCR-Workflow kompiliert
ihn auf macOS/Linux mit `-Werror` und prüft den Marker. Neue Zielbinärhashes, echte
adversariale OS-Proben und die Einbindung in den allgemeinen Parserpfad fehlen noch;
deshalb bleibt die produktive POSIX-Aussage unverändert geschlossen.
`privacy_status` macht die aktuelle Grenze nun explizit sichtbar:
`parser_resource_boundary=node_heap_and_parent_timeout` und
`parser_hard_process_limits=false` auf dem produktiven POSIX-Fallback, gegenüber
`windows_job_object` und `true` beim Windows-Host. Das ist eine ehrliche
Statusverbesserung, keine vorgezogene Schließung von BL-011.9.
Reservierte Exitcodes der künftigen POSIX-Sandbox werden im allgemeinen Parser nun
ebenso wie unter Windows immer als `PARSER_ISOLATION_FAILED` behandelt; sie können
nicht als gewöhnlicher Parserfehler in einen unsicheren Fortsetzungsweg geraten.

Abgelaufene private Batch-Snapshots werden beim Start und zusätzlich in einer
lokalen sechs-stündigen Wartung bereinigt. Der periodische Lauf ist auf ein
sicher begrenztes Intervall festgelegt, hält den Server nicht künstlich offen,
isoliert lokale Wartungsfehler und wird beim geregelten Shutdown genau einmal
gestoppt. Beide Wege achten auf die globale
Verarbeitungssperre: Existiert ein lebender Owner, wird nichts am Batchzustand oder
an Arbeitskopien verändert. Das verhindert insbesondere, dass eine parallele zweite
Serverinstanz einen aktiven `processing`-Schritt als Absturz klassifiziert.
Falls dieser Owner später abstürzt, macht erst eine explizit bestätigte Batch-
Fortsetzung den verwaisten Schritt nach Sperrerwerb retryfähig und anschließend
erneut ausstehend. Die normale Verarbeitung wiederholt ihn nicht automatisch.
`privacy_status` zeigt zusätzlich ausschließlich den booleschen Laufzustand
`batch_processing_active`, damit der Skill bei einer laufenden lokalen Instanz
wartet statt einen konkurrierenden Auswahl- oder Fortsetzungsdialog anzustoßen.
Der Statuspfad liest Batchjournale ausschließlich nicht mutierend: weder eine
Statusabfrage noch ein Diagnoseaufruf startet, bereinigt, klassifiziert oder setzt
einen abgelaufenen Snapshot fort.

Die Startup-Recovery selbst erwirbt dieselbe globale Sperre vor jedem Journalzugriff.
Sie bindet jeden gelesenen Zustand an den Token seines Dateinamens, bevor sie eine
Arbeitskopie berührt. Ein manipuliertes oder fremdzugeordnetes Journal bleibt damit
als lokaler Fehler liegen und kann weder die private Kopie eines anderen Stapels
löschen noch dessen Fortschritt verändern.

## BL-012 – Fortschritts- und Abschlussfenster

Status: **teilweise**

Vorhanden: Eine bewusste lokale Dateiauswahl autorisiert den automatischen Pfad für
eindeutige Textdateien des gewählten Stapels; dadurch entfällt der identische
Einzeldialog pro Datei. Windows bietet lokale Redaktionen und fachliche
Mehrdeutigkeitsentscheidungen; macOS und Linux bieten für Zertifikatsaussteller eine
begrenzte fundstellenbezogene Beibehalten/Anonymisieren-Entscheidung. Windows und
macOS erhalten Rohtext nur über `stdin`; Linux nutzt Zenity-`stdin` oder KDialogs
`/dev/stdin`, jeweils ohne Rohtext in Argumenten. Visuelle/technische Unsicherheiten
stoppen sicher. Es gibt zudem lokale Abschlusszähler; Abbruch und Timeout stoppen
sicher. Der servergebundene Input-Ordner-Batch nutzt bei Zertifikats-/Organisations-
Mehrdeutigkeiten nun ebenfalls diese lokale Entscheidung; er persistiert nur den
terminalen Status und festen Fehlercode, niemals Entwurf, Fundstelle oder Entscheidung.

Review-Korrektur 23.08.2026: Der gefundene macOS-Fehler – ein nicht angebotener
Cancel-Button in vertagbaren Review-/Finaldialogen – ist im Quelltext behoben.
BL-012.8 erzeugt Fundstellen-, Gruppen- und Finaldialog aus einem validierten
Darwin-Aktionsvertrag mit höchstens drei Buttons; Escape/Schließen wird sicher als
Vertagung oder Abbruch behandelt. Unit-, Batchreview- und UI-Policy-Tests sind grün.
Bis zum echten `osascript`- und Fresh-Install-Nachweis bleibt dies Implementierung,
keine macOS-Review- oder Pilotfreigabe.
Mehrdatei-Stapel analysieren zunächst alle Positionen. Nach Abschluss des
Reststapels rekonstruiert der lokale Reviewpfad die offenen Fundstellen
ausschließlich aus den versiegelten Arbeitskopien, ruft den lokalen Batch-Reviewer
einmal auf und veröffentlicht danach nur die vollständig entschiedenen Positionen
als atomare Einzelpakete. Der Journalzustand enthält dabei weder Entwürfe noch
Entscheidungen; ein Abbruch oder „Später entscheiden“ lässt alle offenen Positionen
`deferred_review`. Im normalen Cowork-Weg startet die bestätigte Fortsetzung diesen
Review seit RC36 tokenfrei in einem abgekoppelten lokalen Worker;
`review_deferred_document_batch` bleibt der synchrone Supportweg. Rest: echte
native Ein-Fenster-Parität auf macOS/Linux, Fortschrittsanzeige, Barrierefreiheit
und praktische Zielplattformabnahmen.

Eine lokale Zertifikatsentscheidung kann nun vertagt werden. Die betroffene Datei
bleibt als privater `deferred_review`-Eintrag ohne Markdown-Paket und ohne
Entwurfsdaten im Journal zurück; klare Dateien desselben Stapels können weiterlaufen.
Nach Abschluss des Reststapels zeigt MCP nur Zähler sowie `awaiting_local_review`.
Eine einzige ausdrücklich bestätigte Fortsetzung rekonstruiert und öffnet die
gemeinsame lokale Entscheidung in einem getrennten Prozess und kehrt sofort zu
Cowork zurück. Derselbe Befehl übernimmt auch retryfähige technische
Unterbrechungen; eine zweite Review-Bestätigung ist nicht erforderlich. Die Option
erscheint ausschließlich im fortsetzbaren servergebundenen Batch; der direkte
Einzelfile-Pfad zeigt sie nicht, weil er keinen wiederaufnehmbaren Snapshot besitzt.

Die informative Abschlussansicht ist bereits plattformübergreifend vorbereitet:
Windows Forms, AppleScript sowie Zenity mit KDialog-Fallback zeigen nur
Batch-Zähler. Das ist noch nicht der fachliche Abschlussdialog und erteilt keine
Freigabe.

Der serverseitige Batchfortschritt besitzt zusätzlich kurze, inhaltsfreie
Anwendertexte und eine feste nächste Aktion: Verarbeitung eines Dokuments oder des
lokalen Stapels, sichere Bereitstellung, Fortsetzung, lokale Prüfung oder lokale
Übersicht. Der Skill verwendet diese statt interner Phasencodes. Der Test deckt jede
unterstützte Phase einschließlich unbekannter persistierter Phasen ab; letztere
dürfen niemals eine weitere Verarbeitung auslösen. Eine sichtbare native
Fortschrittsansicht und die vereinfachte Start-/Ergebnisoberfläche bleiben offen.

Die native macOS-Auswahl filtert wie Windows und Linux auf die aktuelle
RC30-Allowlist TXT/Markdown/CSV/DOCX. Unabhängig davon prüft der Companion jede Auswahl weiterhin
auf Erweiterung, reguläre Datei, Symlink und Größenvertrag; der sichtbare Filter
erweitert keine Formatfreigabe.

## BL-020 – Content-Graph und Coverage

Status: **teilweise**

Vorhanden: gehärteter ZIP-Leser, OOXML-Partprüfung, Warnungen für externe oder
unbekannte inhaltstragende Parts, Attachment-Quellen und fail-closed Parserfehler.
Die produktive isolierte Parsergrenze verlangt jetzt zusätzlich
`data-secure-content-graph/v1`. Der Graph beschreibt Text und Tabellen über halb
offene Positionen im NFC-/LF-normalisierten UTF-16-Markdown und bindet jedes Bild
über Asset-Index, Medientyp und einen containerinternen strukturellen Part. Er
dupliziert keinen Rohtext. Doppelte IDs, unbekannte Felder oder Knotentypen,
Traversal-Parts, ungültige Positionen und unvollständige Asset-Abdeckung stoppen.
Für OOXML zeigen Abschnittsknoten jetzt auf Hauptteil, Kopf-/Fußzeilen, Kommentare,
Fuß-/Endnoten, Arbeitsblätter, Diagramme, Zeichnungstext, Folien, Notizen,
eindeutig erreichte Layouts und Master sowie PPTX-DrawingML-Tabellen.
`docProps/core.xml`, `docProps/app.xml` und `docProps/custom.xml` werden als
eigene Metadatenknoten in das zu prüfende Markdown aufgenommen; persönliche
Office-Eigenschaften werden dadurch nicht mehr still ausgelassen. Die
unterstützten benutzerdefinierten Werte sind auf skalare OOXML-Typen begrenzt;
komplexe Werte stoppen mit einer inhaltsfreien Coverage-Warnung. Die
Abschnittstexte dienen nur intern zum Erzeugen der Positionen und verlassen die
Parsergrenze nicht als zweite Inhaltskopie. Neun Vertragstests decken diese Scheibe
einschließlich DOCX, XLSX und PPTX ab. Ein zehnter Vertragstest belegt, dass
vertauschte IDs, Überlappungen, nicht lokalisierter Nicht-Leerraum und Textknoten
nach Bildknoten fail-closed abgelehnt werden. Ein elfter belegt vollständige
Containerketten für rekursiv eingebettete OOXML-Pakete.

Der kleine Locator-Kern übernimmt nur die Semantik von W3C
`TextPositionSelector` und `FragmentSelector`; JSON-LD oder Apache Tika werden nicht
als Runtime-Abhängigkeit eingeführt. Rest: feinere stabile Locators für Absätze,
Zellen und Seitenelemente, noch nicht extrahierte Office-Parts, PDF-Objekte,
formatabhängige Spezialmetadaten und weitere Anhänge. Eingebettete OOXML-Pakete
werden in einer ersten BL-020.2-Scheibe bis 3 Ebenen, 20 Dokumente, 50 MiB
Archivbytes und 100 MiB entpackte Bytes rekursiv geprüft. Ein realer Gegenlauf mit
21 erreichbaren Paketen belegt, dass das 21. Paket nicht gerendert wird.
Containerketten bleiben
im Locator erhalten; das Entpackbudget greift vor der Dekompression. Nur über eine
eindeutige interne Paketbeziehung erreichbare Einbettungen werden geöffnet;
verwaiste, fehlende oder zusätzlich aktiv referenzierte Parts bleiben geschlossen.
Korruption, Budgetüberschreitung, VBA/OLE/ActiveX und externe Beziehungen blockieren
mit inhaltsfreien Warnungen. Weitere statische Formate und
die vollständige Drei-OS-Abnahme bleiben offen. Die aktive Eingabeformatliste bleibt
TXT/Markdown/CSV/DOCX.

BL-020.3 besitzt jetzt einen ersten ausführbaren Netzwerk-Gate-Schnitt. Parser und
Companion laden vor privatem Code dieselbe packaged `network-deny.cjs`; sie sperrt
HTTP(S), TCP/TLS, DNS, UDP, HTTP/2, Fetch, WebSocket und Listener mit einem festen
inhaltsfreien Fehler. Der Parser behält zusätzlich sein Node-Berechtigungsmodell.
Drei reale Negativtests sind lokal auf Windows x64 grün und laufen über `npm test`
auch in der manuell gestarteten macOS-/Linux-Abnahmematrix. Ein weiterer Fünfer-Testvertrag
klassifiziert alle nativen UI-Prozesse, entfernt Proxy-/Cloud-/Node-Steuerung aus
ihrem Environment, erzwingt `shell: false`, belegt Rohtexttransport ausschließlich
per `stdin` zur Windows-Textprüfung und verbietet Netzwerkprimitive in den festen
Skripten. Dateiauswahl, Zählbestätigung und Abschlussansicht erhalten keine
Rohinhalte; Export läuft im geschützten Companion. Die rohe Windows-Textprüfung ist
dennoch nicht durch AppContainer oder ein gleichwertiges OS-Gate isoliert und bleibt
maschinenlesbar als unbestätigt markiert. Frische Nicht-Windows-Nachweise und dieses
native Review-Gate fehlen noch; BL-020.3 bleibt in Arbeit.

## BL-021 – TXT, Markdown und CSV

Status: **teilweise**

Vorhanden: TXT, Markdown (`.md` und `.markdown`) und CSV sind im Pilot aktiv. `contracts/TEXT_SOURCE_V1.md` und acht neue
Tests härten den gemeinsamen TXT-/MD-Parser auf fatal validiertes UTF-8, optionale
BOM, NFC/LF, verbotene unsichtbare Steuerzeichen, quelltreue CommonMark-/GFM-
Struktur, inerte Links/HTML/Frontmatter, PII innerhalb von Markup, große Eingaben,
Determinismus und vollständige Content-Graph-Abdeckung. Der Parser rendert oder
folgt nichts. `markdown-it` bleibt bewusst Differentialreferenz, nicht
Produktabhängigkeit. CSV ist nicht mehr nur gefenced: `CSV_SOURCE_V1.md` und neun
Tests decken RFC-4180-Quotes, doppelte Quotes, Mehrzeilenfelder, Komma/Semikolon/Tab,
Mehrdeutigkeits- und Breitenstopps, sichtbare stabile Kopfzeilen, Formelwerte als
literal Markdown, PII in horizontalen Tabellen, UTF-8/Graph und große Tabellen ab.
Der lokale Parser erzeugt nur Markdown, niemals ein Spreadsheet. Gateway- und Companion-End-to-End-
Tests belegen für `.md` und `.csv` denselben isolierten Privacy-Paketpfad wie für TXT; externe Markdown-
Referenzen werden nicht geladen, CSV-Zellen nie ausgeführt, sondern jeweils als Text geprüft. Alle weiteren
Ein formelähnliches `mailto:`, `tel:`, `sms:`- oder `callto:`-Feld bleibt ebenfalls inert,
enthält aber weiterhin erkennbare Kontaktwerte: Adresse oder Nummer und sichtbarer Personenname werden
gemeinsam de-identifiziert.
nicht freigegebenen Formate stoppen vor Claim, Output und Reviewkopie. Papa Parse
5.5.3 ist als exakt gelocktes reines Testorakel eingebunden und vergleicht 180
eindeutige CSV-Dialekt-/Quote-Fälle. Rest: praktische MD-/CSV-Drei-OS-Abnahme.

## BL-022 – DOCX, XLSX und PPTX

Status: **teilweise**

Vorhanden: OOXML-Parser und Tests für DOCX, XLSX, PPTX, Tabellen, Shared Strings,
Textfelder, Folientext, Notizen, Bilder, Beziehungen und Coverage-Warnungen; DOCX ist
im Pilot aktiv. DOCX verarbeitet Hauptteil, Kopf-/Fußzeilen, Kommentare, Fuß- und
Endnoten inzwischen strukturerhaltend, einschließlich Tabs und Umbrüchen; auch deren
Personendaten erreichen nachweislich den Privacy-Gate. Die Paketwurzel muss genau eine
interne `officeDocument`-Beziehung auf `word/document.xml` enthalten; sekundäre
DOCX-Stories müssen zusätzlich über passende interne Beziehungen von
`word/document.xml` erreichbar sein. Verwaiste, fehlende, abgeschnittene, externe,
falsche oder mehrdeutige Ziele blockieren. Die Negativmatrix prüft den passenden
Wurzelvertrag für jede zulässige Neben-Story (`header`, `footer`, `comments`,
`footnotes`, `endnotes`) inhaltsfrei. Rest: praktische Interoperabilitätsabnahme
mit realen Word-Generatoren, die bewusst gesperrten Story-Typen sowie XLSX/PPTX
produktiv freigeben und Formeln, Kommentare, Charts, Master-/Layout-Inhalte, alle relevanten Beziehungen und eingebettete
Dokumente positiv abdecken.

Zusätzlich vergleicht eine reine, exakt gelockte Entwicklungsabhängigkeit Mammoth
1.12.1 96 reguläre Hauptteil-/Tabellen-DOCX mit mehreren Hauptteilabsätzen und
Tabellenzeilen gegen die lokale Extraktion. Das ist
kein Freigabebeweis für weitere Word-Stories oder reale Word-Generatoren und wird
nicht in Plugin oder MCPB ausgeliefert.

Für PPTX ist die Folien-, Notiz- und Vorlagen-Reachability als Vorarbeit gehärtet: Nur intern
von `presentation.xml` referenzierte Folien, intern von diesen Folien referenzierte
Notizen sowie über `slide` → `slideLayout` → `slideMaster` eindeutig erreichte
Layout-/Mastertexte werden gerendert. Ein Master muss zusätzlich genau einmal aus
`presentation.xml` referenziert sein; normale Mehrfachnutzung eines Layouts oder Masters
bleibt zulässig. `ppt/media/` benötigt zusätzlich eine interne
`image`-Relationship; verwaiste oder externe Grafikbytes werden nicht einmal in den
lokalen Assetpfad gegeben. Das ist keine PPTX-Freigabe.

Für XLSX ist als Vorarbeit die Blatt-Reachability gehärtet: Nur eine eindeutige
interne `worksheet`-Beziehung vom Workbook führt zu einer gerenderten Tabelle.
Verwaiste, externe und typfalsche Ziele bleiben aus der Markdown-Ausgabe und
erzeugen eine inhaltsfreie Warnung. Formelzellen werden unabhängig von einem
gecachten Wert ebenso gestoppt. `xl/media/` benötigt ebenfalls eine interne
`image`-Relationship; ein Drawing-Part darf dabei nur auf ein normalisiertes Ziel
innerhalb von `xl/media/` verweisen. Das ist keine XLSX-Freigabe.

Seit 23.08.2026 durchläuft zusätzlich jeder DOCX-, XLSX- und PPTX-Container vor
einer privaten Batch-Arbeitskopie dieselbe begrenzte ZIP-Verzeichnisprüfung.
ZIP64, verschlüsselte Einträge, falsche Größen und Entpackungsbomben stoppen damit
auch in den weiterhin gesperrten Office-Formaten, ohne eine Arbeitskopie anzulegen.
Das erweitert keine Formatfreigabe.

XLSX-Drawing-Text folgt nur einer internen `drawing`-Relationship aus einem
erreichbaren Arbeitsblatt; Charttext nur einer `chart`-Relationship aus diesem
Drawing. Bei PPTX muss der Chart über eine `chart`-Relationship einer erreichbaren
Folie verknüpft sein. Dateiname allein reicht in keinem Fall als Content-Graph- oder
Markdown-Quelle. Diese Vorarbeit erweitert keine Freigabe.

Bei Bildbeziehungen wird der konkrete Quellpart geprüft, nicht sein Verzeichnis:
Ein XLSX-Bild muss von einem erreichten Drawing stammen, ein PPTX-Bild von einer
erreichten Folie. Das verhindert, dass ein verwaister Relationship-Ordner ein Asset
in die lokale Sichtprüfung einschleust.

Für XLSX und PPTX ist zusätzlich die jeweilige OPC-Paketwurzel gehärtet: Es ist
exakt eine interne `officeDocument`-Relationship auf `xl/workbook.xml` beziehungsweise
`ppt/presentation.xml` erforderlich. Fehlende, externe, falsche und doppelte Wurzeln
bleiben inhaltsfrei gesperrt; dies erweitert keine Formatfreigabe.

Die DOCX-Negativmatrix umfasst zusätzlich fehlende, externe, falsche und doppelte
Root-`officeDocument`-Beziehungen sowie Parent-Traversal, externe Ziele,
Typ-Ziel-Mismatches und abgeschnittene Wurzelbereiche für sekundäre Stories. Alle
Fälle bleiben fail-closed und ihre Warnungen enthalten weder Story-Text noch
Partnamen oder Zielpfade.

`word/media/` ist keine implizite Bild-Quelle mehr: Nur eine passende interne
`image`-Relationship führt ein Bild in den lokalen Sichtprüfpfad. Orphan-Medien,
externe Ziele und Medien unter einem anderen Beziehungstyp sind fail-closed und
erreichen weder Claude noch die lokale Assetvorschau.

## BL-023 – PDF und Scan-PDF

Status: **in Arbeit**

Vorhanden: PDF-Signaturerkennung, adversariale Legacy-Tests, gesperrter PDF-Pfad und
ein reproduzierbar gelockter PDFium-Engineering-Spike. Unter DS-038 wurde zusätzlich
ein gelockter PDF.js-6.2.108-/Canvas-1.0.7-Pilot begonnen. GitHub-Actions-Lauf
`32594467568` belegt auf Windows x64, macOS x64/ARM64 und Linux x64 Byte-Eingabe,
Textextraktion, Seitenrendering, JavaScript-Action-Erkennung und null beobachtete
Netzwerkversuche. Alle vier Artefakte bleiben ausdrücklich `no_go`. Rest:
produktiver isolierter PDF-Worker, vollständige
Text-/Font-/Formular-/Annotation-/Anhang-/Visual-Coverage,
Verschlüsselung und Scan-OCR; bis dahin bleibt `PDF_COVERAGE_UNVERIFIED` aktiv.

Das neue `contracts/PDF_OCR_RISK_GATE_V1.md` definiert dafür eine einheitliche
Pflichtmatrix für Windows, macOS und Linux. Alle Zellen stehen weiterhin auf `offen`;
deshalb bleibt BL-023.1 in Arbeit und PDF produktseitig gesperrt.
`pdf-ocr-risk.lock.json` pinnt den offiziellen PDFium-Stand sowie Tesseract 5.5.2
und die deutschen/englischen `tessdata_fast`-Modelle als Prüfkandidaten. Der manuelle
Workflow `pdf-ocr-risk.yml` erzeugt getrennte NO-GO-Preflights für Windows x64,
macOS x64/ARM64 und Linux x64. GitHub-Actions-Lauf `32593313169` auf `fdd2a02`
bestand am 22.08.2026 alle vier Preflights (`windows-latest`, `macos-15-intel`,
`macos-14`, `ubuntu-latest`). Alle meldeten gültige Pins, den geschlossenen
Produktpfad `PDF_COVERAGE_UNVERIFIED`, keine bestandene Pflichtzelle und
`release_decision: no_go`. Auch das Windows-Community-Negativ-Gate bestand, weil
die Probe erwartungsgemäß weiterhin `no_go` meldete. Ein offizieller Eigenbuild und
die übrigen Pflichtzellen bleiben offen.

## BL-024 – Offline-OCR und Bilder

Status: **teilweise**

Vorhanden: PNG/BMP-Decoder, JPEG-Metadatenentfernung, OCR-Offset-Mapping,
Pixelredaktion, Visual-Gates und ein real getesteter Windows-OCR-Pfad. Rest:
gebündelte Deutsch-/Englisch-OCR auf macOS/Linux, gemischtsprachige Abnahme,
eigenständige Bildfreigabe als Markdown sowie sichere fachliche Grafikprüfung.

Für BL-024.4 liegt mit `contracts/OCR_BATCH_SESSION_V1.md` ein expliziter
Fail-closed-Vertrag vor: Der heutige Einbild-Sandboxprozess bleibt aktiv, bis ein
nativer Per-Frame-Supervisor auf Windows, macOS und Linux eine stapelgebundene,
serielle OCR-Session gleichwertig begrenzt. Ein JavaScript-Pool, globaler Daemon
oder eine erhöhte Gesamtprozessgrenze ist ausdrücklich kein zulässiger Ersatz.

Für BL-011.8 nutzt die Batch- und Orchestrator-Bereinigung jetzt zusätzlich
`safeRemovePrivateTree`: Sie akzeptiert nur einen literal benannten direkten Kind-
Eintrag eines erneut identitätsgebundenen privaten Ordners, prüft jeden Baumknoten
vor dem Entfernen per `lstat` und stoppt bei Link-, Junction- oder Inode-Austausch.
Die Adversarial-Tests decken direkten und verschachtelten Link sowie einen Austausch
unmittelbar während der Verzeichnisauflistung ab; externe Sentinel-Dateien bleiben
unverändert. Node kann damit keinen vollständig rennfreien Reparse-Schutz beweisen;
native Directory-Handle-Adapter und reale Gegenproben auf drei Zielsystemen bleiben
P0-offen.

Unter DS-038 ist zusätzlich ein exakt gelockter portabler Pilot vorhanden:
Tesseract.js 7.0.0, tesseract.js-core 7.0.0 und `@napi-rs/canvas` 1.0.7 verwenden
ausschließlich lokale, hashgeprüfte `deu`-/`eng`-Modelle aus dem tatsächlichen
`tessdata_fast`-Commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`. Der lokale
Windows-x64-Lauf bestand eine synthetische gemischtsprachige Probe bei vorgeladener
Prozess-Netzwerksperre mit 95 Prozent mittlerer OCR-Konfidenz. GitHub-Actions-Lauf
`32594838193` auf `b6ce3ad` bestätigte dasselbe Ergebnis auf Windows x64, macOS
x64/ARM64 und Linux x64. Alle vier Artefakte melden lokale Modelle,
`mixed_language_ocr: true`, Prozess-Netzwerksperre und 95 Prozent Konfidenz. Das ist nur
Engineering-Evidenz: Produktintegration, Modell-Lizenzdateien, isolierter Worker,
Ressourcengrenzen, Scan-PDF, Pixelredaktion, Angriffskorpus und frisches Pluginpaket
bleiben offen; der Pilot meldet deshalb `OCR_COVERAGE_UNVERIFIED` und `no_go`.

GitHub-Actions-Lauf `32595199861` auf `fcb55ed` ergänzte auf denselben vier
Plattformzielen ein mit dem offiziellen `npm sbom` erzeugtes CycloneDX-1.5-SBOM.
Je Plattform wurden 25 gelockte Paketkomponenten mit vollständigen SHA-512-
Integritätswerten und ausschließlich Apache-2.0, MIT oder BSD-2-Clause nachgewiesen.
Die Apache-2.0-Lizenzdatei der Sprachmodelle ist zusätzlich an denselben Quell-Commit,
ihre Größe und SHA-256 gebunden. Das erfüllt noch nicht die Pflichtmatrix: vollständige
Notice-Texte, Schwachstellenrichtlinie, verteilbares Runtime-Bundle und frische
Pluginpakete bleiben offen.

GitHub-Actions-Lauf `32595454727` auf `fa34c91` führte OCR anschließend auf allen
vier Plattformzielen in einem separaten Prozess mit vererbtem Netzwerkverbot,
512-MiB-Node-Heap, 50-Sekunden-Wächter und 64-KiB-Ausgabegrenze aus. Timeout- und
Ausgabeflut-Gegenproben wurden überall sicher beendet. Windows verwendete zusätzlich
das verifizierte Job Object mit 768 MiB RAM, 40 Sekunden CPU und 45 Sekunden
Job-Laufzeit. macOS und Linux verwenden das Node-Permission-Modell; native harte
RAM-/CPU-Grenzen sind dort noch offen. Die Produkt-Runtime nutzt diesen Pilotpfad
noch nicht und bleibt unverändert fail-closed.

BL-024.1 besitzt jetzt zusätzlich den plattformneutralen Vertrag
`contracts/OCR_RESULT_V1.md` mit strengem JSON-Schema. Der Pilot fordert die seit
Tesseract.js 6 standardmäßig deaktivierte Blockausgabe ausdrücklich an und reduziert
Backenddaten auf NFKC-Text, Zeilen-/Wortindizes, halb offene Pixelboxen und
Konfidenzen. Niedrige Konfidenz verwirft kein Wort; leere oder selbst perfekte OCR
belegt keine Datenschutzfreigabe, und `requires_visual_review` bleibt in V1 immer
aktiv. Die Grenzen stimmen mit den kleineren bestehenden Runtimegrenzen überein:
25 MiB Eingabe, 30 Millionen Pixel, 5 Millionen Zeichen und 100.000 Wörter. Acht
lokale Vertrags- und Negativtests bestehen. GitHub-Actions-Lauf `32596087930` auf
`f53f5df` bestätigt Vertrag, echte gemischtsprachige OCR und Negativtests auf Windows
x64, macOS x64/ARM64 und Linux x64. Native harte macOS/Linux-Ressourcengrenzen stehen
noch aus; BL-024.1 bleibt daher in Arbeit und der Produktpfad geschlossen.

Als nächster BL-024.1-Schritt ist ein abhängigkeitloser POSIX-C-Supervisor im
Engineering-Pilot implementiert. Er startet Node ohne Shell in einer eigenen
Prozessgruppe, setzt `RLIMIT_CPU` und kein Core-Dump, überwacht den physischen
Speicher nativ über Linux `/proc/<pid>/statm` beziehungsweise Apples
`proc_pid_rusage` im 10-ms-Takt und beendet die ganze Gruppe bei Grenzverletzung.
Der Workflow baut den Quelltext auf beiden macOS-Architekturen und Linux und prüft
zusätzlich echte Speicher- und CPU-Überschreitungen. Lauf `32596426359` auf
`4c9f0ec` bestand diese Grenzen zusammen mit Vertrag, Offline-OCR und übrigen
Negativproben auf Windows x64, macOS x64/ARM64 und Linux x64. BL-024.1 ist damit
abgeschlossen. BL-024.2 ist jetzt in Arbeit; Runtime, Modelle und native Launcher
sind installationsfrei pro Zielarchitektur gebündelt. Das daraus erzeugte
Universal-Bundle ist inzwischen im Pluginpfad integriert; sein Freigabegate bleibt
unverändert geschlossen.

Für BL-024.2 existiert nun ein erster reproduzierbarer Runtime-Bundle-Builder. Er
kopiert nur die gelockte Tesseract-Laufzeitabhängigkeitsmenge, lokale Modelle,
OCR-V1, Netzsperre und den zielabhängigen nativen Supervisor, erstellt für jede Datei
Größe und SHA-256 und setzt `release_enabled: false`. Canvas bleibt als reines
Testwerkzeug außerhalb des Anwenderbundles. Das lokale Windows-x64-Bundle hat rund
57,5 MB und bestand Inventar-, Lizenzindex-, echten Offline-OCR- und inhaltsfreien
Fehlerpfadtest. GitHub-Actions-Lauf `32597030060` auf `7427b3c` baut, prüft und testet dieselben
Bündel auf Windows x64, macOS x64/ARM64 und Linux x64 und sichert sie als
14-Tage-Artefakte. Nur `tr46@0.0.3` liefert weder im npm-Tarball noch im zugehörigen
Upstream-Tag eine eigene Lizenzdatei. Der Builder ergänzt deshalb ausschließlich für
diese exakte Version den vollständigen, laut Paketmetadaten geltenden MIT-Text samt
Autor- und Herkunftshinweis; jeder andere fehlende Lizenztext stoppt den Build.
Frische Installationsabnahmen bleiben offen.

Der erste Produktadapter `server/portable-ocr.js` ist nun im Pluginpfad vorhanden.
Er ordnet ausschließlich die vier vereinbarten OS-/Architekturziele zu, lehnt Links,
Zusatzdateien, fehlende oder hashabweichende Dateien ab, verlangt den OCR-V1-Vertrag
und `release_enabled: true` und startet den Worker über den gebündelten nativen
Supervisor mit RAM-, CPU-, Zeit-, Ausgabe- und Netzwerkgrenze. Das aktuelle Plugin
liefert das universelle Bundle nur gesperrt aus; auf Windows bleibt daher der bestehende
Bridge-Pfad aktiv, auf macOS/Linux bleiben visuelle Inhalte unverändert lokal
zurückgehalten. Sieben Adaptertests belegen Plattformauswahl, gesperrtes Gate,
Manipulations-/Zusatzdateistopp, positiven Vertragspfad und inhaltsfreie
Ressourcenfehler und das feste OCR-V1-Fehlervokabular.

Beim ersten Zusammenführen der vier Laufartefakte wurde eine reale Lieferkettenlücke
sichtbar: `upload-artifact` hatte versteckte npm-Dateien trotz Manifest ausgelassen.
Der Assembler verweigerte deshalb die Quelle. Der Workflow ist auf vollständigen
Hidden-File-Upload umgestellt. Lauf `32597783210` auf `df1c85f` bestätigt den
vollständigen Download und schließt diesen Defekt.

Der Universal-Assembler und sein V2-Vertrag sind implementiert. Er dedupliziert die
auf allen vier Plattformen nachweislich bytegleichen 239 Runtime-/Modell-/Notice-
Dateien und ergänzt nur vier zielgebundene Supervisoren; das erwartete Bündel bleibt
damit unter 65 MiB statt vier Runtime-Kopien zu tragen. Acht synthetische
Assemblerchecks und die Adaptertests bestehen. Lauf `32597783210` bestätigt den
vollständigen Cloud-Download, die Assembly und einen echten Linux-Smoke-Test. Das
erneut lokal heruntergeladene Ergebnis besitzt 244 inventarisierte Dateien,
57.592.942 Bytes und bleibt mit `release_enabled: false` gesperrt.

Das gesperrte Universal-Bundle ist nun Bestandteil des kanonischen Marketplace-
Quellbaums. Sein Herkunftsnachweis bindet Workflow-Lauf `32597783210`, Commit
`df1c85f` und Manifest-SHA
`4497c0db499493429d12b9af7aaa2bb2b437878c8877eb3cf325947d2d341098`.
Der normale Plugin-ZIP und der Marketplace verwenden damit dieselben Runtime-Bytes;
der Paketierungs-Checkpoint `75da6c5` besaß 320 Einträge, 22.033.607 Bytes und
bestand Quellparität, vollständige Runtime-Hashprüfung und Modusprüfung. Der
reproduzierte RC30-Build bestätigt diese Gleichheit erneut mit 334 ZIP-Einträgen;
damit ist BL-010.5 abgeschlossen. Eine frische Marketplace-Installation ist davon
getrennt und bleibt in BL-051.2 offen.
deterministische ZIP-Writer
normalisiert reguläre Dateien auf `0644` und setzt nur die drei POSIX-Launcher auf
`0755`. Der vorgesehene GitHub-Lauf `32598196806` konnte wegen eines externen
Abrechnungs-/Ausgabenlimits nicht starten. Cloud-Reproduzierbarkeit, echte Linux-
Extraktion und frische Installationen bleiben deshalb offen; die Fähigkeit bleibt
gesperrt.

## BL-030 – Stapelweite Entitätsauflösung

Status: **teilweise**

Vorhanden: Profil `auto`, mehrere Fachprofile, kontextbezogene PII-Engine und
deterministische Pseudonyme innerhalb eines einzelnen Dokuments. Ein realer
Vier-Datei-Batch belegt jetzt zusätzlich die unabhängige automatische Wahl von
`contract`, `personnel_profile`, `applicant` und `customer` innerhalb desselben
Stapels samt Identifikatorentfernung und Fachinhaltserhalt. Rest: ein produktiv
aktivierter flüchtiger gemeinsamer Pseudonymkontext über alle Stapeldokumente.

Zielvertrag ergänzt: `contracts/BATCH_PSEUDONYM_V1.md` definiert eine über den
OS-Benutzerschutz gesicherte HMAC-Ableitung ohne persistente Rohwert-Mappingtabelle,
Versionierung, Ablauf und Neustartverhalten für BL-030.1.

Als Vorarbeit liegt ein isolierter, noch nicht angebundener Adapterpilot
`server/batch-secret-store.js` vor. Er lädt `@napi-rs/keyring` ausschließlich
dynamisch, bindet einen undurchsichtigen Batch-Token an einen festen Servicenamen
und akzeptiert genau 256 Bit Secret-Material. Eine fehlende oder fehlerhafte
Native-Bindung stoppt generisch; es gibt keinen Datei-, Umgebungsvariablen-, CLI-
oder Eigenverschlüsselungs-Fallback. `test-batch-secret-store.js` prüft diesen
Vertrag. Ein separater Bundle-Lock und lokaler Windows-Smoke-Pilot liegen vor;
Offline-Nachweise auf macOS x64/ARM64 und Linux x64 sowie die vollständige
Drei-OS-Evidenz fehlen weiterhin. Die Funktion bleibt deshalb deaktiviert.

`server/batch-pseudonym-registry.js` ergänzt die flüchtige Umsetzung der
vertraglichen HMAC-SHA-256-/Base32-Ableitung. Der Registry-Kontext arbeitet nur mit
einem übergebenen 256-Bit-Secret, teilt Pseudonyme über mehrere Dokumente desselben
Stapelkontexts, trennt Typen und Secrets und verlängert gekürzte kollidierende Labels.
Eine ausschließlich interne Abhängigkeitsnaht kann ihn durch die vorhandene
PII-Engine und deren normalen Rest-PII-Gate führen; Ergebnis, Journal, Audit und
Diagnose erhalten ihn nicht. Der Batchpfad erzeugt oder persistiert ihn wegen der
fehlenden Drei-OS-Evidenz weiterhin nicht. `test-batch-pseudonym-registry.js` prüft
diese Grenze.

`server/batch-pseudonym-context.js` implementiert nun zusätzlich den noch
deaktivierten Lebenszyklus zwischen Store und Registry: atomare Provisionierung mit
Rollbackversuch, Laden pro Verarbeitungsschritt, sichere `finally`-Bereinigung,
fester Verlustfehler und terminales Löschen. Persistierbar ist nur die
Vertragsversion mit dem opaken Batchkonto, nie Secret oder Rohwert-Mapping.
`test-batch-pseudonym-context.js` prüft sieben Lifecycle-Fälle und simuliert dabei
einen Prozesswechsel über zwei vollständig neue Registry-Instanzen. Das ist kein
Release-Nachweis: Begin/Resume/TTL/Discard rufen die Naht erst nach einer positiven
nativen Drei-OS-Matrix auf.

Für den nativen Store gibt es zusätzlich `native/keyring/pilot` mit gelocktem
`@napi-rs/keyring` 1.3.0, allen geforderten Zielartefakten, einem inhaltsfreien
Set/Get/Delete-Runner sowie einer ungestarteten Vier-Ziel-GitHub-Actions-Matrix. Der
lokale Windows-Smoke-Test bestand; macOS x64/ARM64 und Linux besitzen noch keine
Workflow-Evidenz. Daher bleibt sowohl der Adapter als auch die Registry außerhalb
des aktiven Batchpfads.

## BL-031 – Organisationen und Zertifizierungen

Status: **teilweise**

Vorhanden: versionierter lokaler Zertifikatskatalog, fundstellenbezogene
Kontextregeln, Ambiguitäten und umfangreiche Regressionen für IT-/Health-IT-Begriffe,
Aussteller, Arbeitgeber, Kunden und Vertragsparteien. Verifizierte lokale
HTTPS-Quellen liegen für ISTQB, IREB, UXQB, Scrum.org, Scrum Alliance, Scaled Agile, Kanban University, IIBA, PeopleCert, HIMSS, The Open Group,
Microsoft, AWS, Google Cloud, Cisco, ISACA, ISC2, Linux Foundation, CNCF, PMI, Red
Hat, SAP und HL7 vor. Sie werden ausschließlich lokal als Erkennungshinweise
verwendet, nicht zur Laufzeit abgefragt und enthalten weder Prüfdaten noch eine
Aussage über die individuelle Gültigkeit eines Zertifikats. Der gemeinsame lokale
Katalogtest prüft Aussteller-Aliase und gepflegte Codes separat: Sie bleiben nur im
expliziten Zertifikatskontext erhalten und schützen keinen Arbeitgeber oder Kunden.
Die RC38-/RC40-Regressionen schließen mehrere konkrete Fließtextlücken; das
RC41-Gegenreview fand darüber hinaus, dass beliebige Domains hinter einem
vorherigen Credential-Cue sowie die Formulierungen `Tätigkeit für` und
`im Auftrag von` weiterhin einen Kunden-/Arbeitgeberbezug schützen konnten, und dass
ein mehrzeilig genannter beziehungsweise signalworthaltiger echter Aussteller
umgekehrt über-redigiert wurde. Commit `32914da` (RC42) bindet die Ausstellerzuordnung
seither eng an die konkrete Fundstelle (explizite Ausstellerphrase unmittelbar davor,
auch über einen Zeilenumbruch hinweg, oder ein Zertifikatstitel unmittelbar danach)
statt an einen beliebig weit entfernten Credential-Cue auf derselben Zeile, ergänzt
die genannten Kunden-/Arbeitgeberformulierungen und lässt eine signalworthaltige
Ausstellerorganisation nur bei unmittelbar folgendem Zertifikatstitel gelten. Zehn
neue Fälle in `tests/test-credential-catalog.js` reproduzieren jede der fünf
RC41-Lücken gegen den Vor-Fix-Stand und bestehen danach; die volle `npm run test:ci`-
Kette blieb grün. Der P0-Rest aus dem RC41-Gegenreview gilt damit als E0
geschlossen; `tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md` dokumentiert
Reproduktionen und Abnahme.
Das anschließende RC42-Gegenreview reproduzierte noch eine angrenzende Lücke ohne
Satzzeichen: `Kunde TechCorp GmbH Certified ...` wurde durch die unmittelbar
folgende Titelphrase als Aussteller geschützt. RC43 priorisiert das explizite
Rollenpräfix nun fail-closed; dasselbe gilt für gewöhnliche englische `Customer`-
und `Client`-Namen. Nur eng institutionell geformte englische Eigennamen wie
`Customer Institute GmbH` behalten den Ausstellerpfad. Deutsche, englische,
Komma- und Doppelpunktvarianten sind im Katalogvertrag regressionsgetestet.
Der gemeinsame lokale
Abschlussdialog kann jetzt eine bewusst gewählte Entscheidung ausschließlich für
Fundstellen mit identischer normalisierter vollständiger Kontextzeile übernehmen;
die opake Gruppierung und die Rohwerte bleiben flüchtig lokal. Rest: praktische
Zielplattformabnahme und Ausbau anhand des 1.000-Dokument-Korpus.

## BL-032 – Passwörter und lokale Entscheidungen

Status: **teilweise**

Vorhanden: Windows-Review mit lokalen Redaktionen, fundstellenbezogenen
Ambiguitätsentscheidungen, Zurück/Ändern und technisch gebundenem Skip. macOS besitzt
für Zertifikatsaussteller eine lokale, `stdin`-gebundene Beibehalten/Anonymisieren-
Entscheidung ohne freie Textredaktion. Linux verwendet dafür Zenity oder KDialog und
überträgt Fundstellenkontext nur über `stdin` beziehungsweise `/dev/stdin`.
Claude kann weder reviewen noch freigeben. Der vorhandene experimentelle
`local-password`-Transportvertrag ist durch DS-046 fachlich überholt und wird nicht
an einen Entschlüsseler angebunden. Er gehört beim Refactoring aus dem Produktpfad
entfernt. Passwort, Pfad und Rohinhalt bleiben weder MCP-Parameter noch Kommandozeile,
Umgebung, Journal oder Diagnose. Passwortgeschützte beziehungsweise verschlüsselte
Quellen werden bereits vor jeder privaten Kopie als nicht verarbeitet ausgewiesen;
der übrige Stapel läuft weiter.

Passwortgeschützte ZIP-/Office-Container erhalten bereits vor der Batch-Arbeitskopie
den festen inhaltsfreien Fehlercode `PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED`. Das
System öffnet hierfür bewusst keinen wirkungslosen Passwortdialog und schlägt keine
Umgehung per Upload vor. Neben verschlüsselten ZIP-Einträgen erkennt der Preflight
auch die CFB/OLE-Signatur der normalen Microsoft-Office-Verschlüsselung; beide Wege
bleiben gemäß DS-046 dauerhaft gesperrt und bieten keine Passwortabfrage an.

Korrektur 23.08.2026: Der macOS-Dialog besitzt den unter BL-012 dokumentierten
P0-Defekt und ist daher kein aktueller Plattformnachweis. Der bestehende Code- und
Stdin-Vertrag bleibt wiederverwendbare Basis, aber nicht Freigabeevidenz.

## BL-040 – Dauerhafter Export

Status: **erledigt**

Vorhanden: pro Quelle ein geprüftes Markdown-Paket, Manifest, datensparsames Audit,
atomare Veröffentlichung und paketgebundene Leseberechtigung. Der ausdrücklich
festgelegte benutzerlokale Ordner `DataSecure-Export` enthält dauerhaft eine
atomare UTF-8-Mapping-CSV sowie einen geschlossenen, inhaltsfreien JSON-
Batch-Nachweis. Ergebnis-Pakete erhalten neutrale kollisionssichere Namen;
Mapping und Nachweis sind technisch außerhalb aller MCP-Lesetools. Die Entscheidung
für einen festen Ort statt einer wechselnden Ordnerwahl reduziert Fehlablagen.
Der MCP-Lesepfad akzeptiert außerdem nur ein Version-2-Manifest mit exakt der
paketgebundenen neutralen Markdown-Datei und einer vollständigen SHA-256-Bindung.
Freigegebene Bildanlagen benötigen ebenso eine neutrale `asset-NNN`-ID, den
kanonischen PNG-Namen und eine vollständige Prüfsumme. Ein lokal manipuliertes
Manifest kann damit keinen Originalnamen oder eine ungeprüfte Datei als
`document_id` oder Bildanlage an Claude binden. Auch die lokale Paketauflistung
verwirft Manifeste ohne kanonisches Profil und Zeitformat statt unkontrollierte
Metadaten auszugeben.

CSV-Formeln bleiben als Text inert. Kontakt-URIs darin werden dennoch als direkte
Identifikatoren entfernt, auch wenn Mail-, SIP- oder XMPP-Adressen URL-kodiert
vorliegen; sichtbare Kontaktpersonen durchlaufen denselben Personen- und
Residual-Gate wie Klartext.

Vor der Claude-Lektüre werden veröffentlichte Markdown-Dateien und Bildanlagen über
einen einzigen, nicht umleitbaren Dateideskriptor gelesen und gegen dieselbe
Prüfsumme verifiziert. Ein Austausch zwischen Prüfung und Inhaltslesen wird damit
sicher gestoppt statt einen anderen Pfad erneut aufzulösen.

## BL-041 – Claude-Aufgabe fortsetzen

Status: **teilweise**

Vorhanden: zwei validierte Skills, natürliche Aktivierung, Capability-Stopp,
Upload-Stopp, fortsetzbare Einzelschritte und capability-gebundenes Markdown-Lesen.
Die vier direkten MCP-Prompts und die natürliche Skillaktivierung erreichen denselben
serverseitigen Input-/Fortsetzungspfad und verwenden im Quellstand denselben
kanonischen Entscheidungsvertrag. Bei offenen Stapeln stehen Fortsetzen nach
Zustimmung, Verwerfen nach quantifizierter Doppelbestätigung oder folgenloses
Nichtstun zur Wahl. `awaiting_local_review` führt ausschließlich in die lokale
Review-Fortsetzung; ein neuer Input darf nur ohne wiederherstellbaren Stapel geöffnet
werden. Manifest-, MCP-, Capability- und Skillkorpus-Tests sichern diesen Vertrag.
BL-041.4 bleibt bis zur beobachteten Modell-/Fresh-Install-Abnahme P0.
Meldet der lokale Status einen laufenden Stapel, warten beide Startwege ohne
Ordneröffnung, Ersatzbatch oder weiteren lokalen Dialog.
Ein sichtbares Original stoppt vor jedem DataSecure-Aufruf; eine geschlossene lokale
Auswahl beendet den Lauf statt einen neuen Dialog oder Ersatzbatch auszulösen. Der
versionierte Skillkorpus enthält dafür 33 Szenarien, darunter vier negative
Hostklassen. Ein neuer Chat sieht ausschließlich
inhaltsfreie Zähler offener Stapel und kann nach ausdrücklicher Zustimmung den zuletzt
offenen Stapel fortsetzen; er öffnet dafür keinen Ersatzordner und erhält keine Namen
oder Pfade. Eine Anforderung „nur Markdown“ behält alle Bildpixel lokal zurück und
aktiviert nicht den strengeren lokalen Verwerfmodus; sicher erkannter Bildtext bleibt
weiterhin an die normale Textprüfung gebunden. Pro private Stapelposition wird eine
inhaltsfreie lokale Checkpointphase persistiert; sie unterstützt die Recovery, wird
aber nicht an Claude ausgegeben. Rest: neuer lokale-Auswahl-/
Jobweg, Ziel-Formatumfang und installierte Modell-/UI-Abnahme für natürliche Sprache
sowie direkte Skillauswahl auf allen Zieloberflächen.

Fortschritt 23.08.2026: Der frühere Datei-für-Datei-Vertrag ist im Quellstand durch
einen abgekoppelten lokalen Executor ergänzt. Ein kurzer MCP-Start übergibt das Token
nur per privater IPC; der Worker arbeitet mit Netzwerk-Deny, Umgebungs-Allowlist und
PID-Lease bis Abschluss, Review oder Recovery. Lokale Freigabe, Mapping und
Bereinigung sind nicht mehr vom Claude-Lesen abhängig. Claude erhält anschließend
nur inhaltsfreien Status und eine Batch-gebundene namenfreie Ergebnisliste in
begrenzten Seiten; sein bestätigter Lesefortschritt wird separat persistiert. Ein
echter Worker-TXT-Test, ein lokaler Reviewtest und ein 100-Dateien-Lauf mit Stopps an
1/50/100 und 97 Ergebnissen in zehn Seiten sind grün. Ein zweiter
100-Positionen-Mischstapel erzwingt echte Worker-Prozessabbrüche an den
globalen Positionen 1, 50 und 100, übernimmt jede Position erst nach Recovery und
ausdrücklichem Resume und erzeugt kein Doppelpaket.

Ein zusätzlicher realer MCP-Prozesswechsel widerruft erwartungsgemäß die alte
prozesslokale Leseberechtigung, setzt den manipulationsgeschützten Ergebnis-Cursor im
neuen Prozess fort und gibt keine Quellidentität aus. Ein 137.499-Zeichen-Test setzt
freigegebenes Markdown in begrenzten Seiten vollständig und ohne Überlappung wieder
zusammen und erzwingt die 1.000-/30.000-Zeichen-Grenzen. Damit sind MCP-Neustart und
Zeichenbudget lokal belegt. BL-041.5 bleibt bis zu 500-MB-Realdaten,
Host-/Rechnerneustart, Windows-/macOS-Fresh-Install und beobachteter Cowork-Auswertung in
Arbeit.

Die lokale manuelle Grenzabnahme bindet außerdem 100 reale synthetische
TXT-/Markdown-/CSV-Dateien mit exakt 500 MiB an einen privaten Snapshot, prüft alle
100 Hashes/Kopien, entfernt nur den Checkpoint und erhält alle Originale. Der Lauf
bestand in 1.732 ms bei 3.403.776 Bytes RSS-Zuwachs. Datei-SHA-256 arbeitet dafür
jetzt descriptorbasiert in 1-MiB-Blöcken; ein Maximalinput wird nicht mehr komplett
in den Node-Heap geladen. Die vollständige fachliche Verarbeitung von 500 MiB Text
bleibt eine getrennte manuelle End-to-End-Abnahme und wird nicht in die kostenkritische
Standard-CI aufgenommen.

Bei mehrteiligen regulären MCP-Stapeln erscheint nach der letzten bestätigten
Freigabe zusätzlich eine lokale Abschlussübersicht mit ausschließlich den Zählern
ausgewählt, freigegeben und sicher gestoppt. Kann dieser freiwillige Hinweis nicht
geöffnet werden, bleibt das Ergebnis dennoch freigegeben und nutzbar.

Fortschritt 24.08.2026: Der direkte Picker akzeptiert zwei explizite Absichten.
`local_only` ist der Standard und endet nach dem lokalen Start ohne Claude-Polling,
Ergebnisliste, Markdown-Lesen oder Bestätigung. Nach einem terminalen Lauf zeigt die
lokale Elternseite einmalig eine inhaltsfreie Abschlussübersicht mit ausschließlich
den Zählern ausgewählt, freigegeben und sicher gestoppt; ein Fehler beim Anzeigen
ändert weder Paket noch Mapping. Der Worker selbst wartet nicht auf diese Anzeige.
`continue_in_chat` bleibt ausschließlich für ausdrücklich gewünschte Folgeauswertungen
und liest weiterhin nur freigegebenes Markdown. Die normale Folgeauswertung bündelt
Status, namenfreie Ergebniswahl und bis zu fünf begrenzte Markdown-Lesevorgänge in
`continue_anonymized_batch_in_chat`; seitenweise Dokumentfortsetzungen bleiben an
dieselbe kurzlebige Leseberechtigung gebunden. Die öffentliche Toolmenge ist
supportgetrennt reduziert. Eine zu frühe Folgeauswertung während lokaler Verarbeitung
stoppt vor Ergebnisliste und Markdown-Lesen mit einem festen Wartestatus; sie gibt
weder Paket- noch Leseberechtigungen aus.

Der `Input`-Ordnerweg zeigt unmittelbar vor dem Snapshot dieselbe lokale
Startbestätigung wie die direkte Mehrfachauswahl. Ein lokales Abbrechen hinterlässt
keinen Batch und keine versiegelte Arbeitskopie.

Die freiwillige Gesamtübersicht ist der lokale Exportordner mit dem dauerhaft
geführten `DataSecure-Mapping.csv`. Er wird nur auf ausdrücklichen Wunsch geöffnet;
der Server liefert dafür weder Namen noch den Mappinginhalt an Claude.

Ein lokaler Abbruch der Dateiauswahl ist nun ein expliziter, inhaltsfreier terminaler
Zustand statt eines allgemeinen Toolfehlers. Die authentisierte IPC transportiert
`LOCAL_SELECTION_CANCELLED`; der Manager liefert `local_selection_cancelled`, schließt
den lokalen Companion und startet keinen weiteren Dialog. Der Direct-Picker übergibt
denselben inhaltsfreien Zustand unmittelbar an Cowork. Nicht verfügbare Engine,
Auswahlfehler oder fehlgeschlagener lokaler Start werden getrennt gemeldet; sie
behaupten nie eine laufende Verarbeitung. Während einer noch laufenden Übernahme
wird keine zweite Dateiauswahl geöffnet. Dies schützt insbesondere vor einem
ungewollten wiederholten Auswahlfenster nach einem manuellen Schließen.

Der direkte Picker und die Batch-Übernahme prüfen außerdem den vollständigen
Quellenpfad vor jedem Lesen und unmittelbar vor der Snapshot-Kopie auf Links und
Reparse-Punkte. Solche Quellen werden sicher gestoppt; die Originaldatei bleibt
unverändert. Die gebundene Datei-Descriptor-/Inode-Prüfung der Kopie bleibt danach
weiterhin bestehen.

Die Office-Container-Vorprüfung liest bei DOCX, XLSX und PPTX nur noch Header,
Endverzeichnis und Zentralverzeichnis über einen bereits identitätsgeprüften lokalen
Dateideskriptor. Sie hält damit keine vollständige Quelldatei mehr zusätzlich im
Heap. Die vollständige ZIP-/CRC-/Parserprüfung läuft unverändert erst auf der
versiegelten lokalen Arbeitskopie.

## BL-042 – Kommunikation und Diagnose

Status: **teilweise**

Vorhanden: datensparsames Diagnosejournal mit fester Whitelist, Statuswerkzeug,
Retention, Rechts-/Zertifizierungsgrenzen und technische Fehlercodes hinter Details.
Eine getrennte inhaltsfreie Ablaufspur lokalisiert Picker-, Worker-, IPC-,
Checkpoint-, Terminal- und Abschlussanzeigenfehler, ohne freie Texte oder
Dokumentidentifikatoren aufnehmen zu können. Der local-only-Vertrag verlangt nach
dem Start genau einen terminalen Satz und verbietet offene Warteaufforderungen.
Ein ausdrücklich bestätigter lokaler Diagnoseexport enthält zusätzlich ausschließlich
bereinigte Diagnosemetadaten und Programmprüfsummen; er wird nie automatisch
übertragen. Rest: abschließende Alltagssprach-/Barrierefreiheitsprüfung.

Alle 25 MCP-Tools besitzen jetzt zusätzlich vollständige boolesche
`readOnlyHint`-, `destructiveHint`-, `idempotentHint`- und `openWorldHint`-
Annotationen sowie einen Titel. Eine zentrale Policy klassifiziert Lesen,
Ordneröffnung, Verarbeitung, Review, Bestätigung, Verwerfen und Purge getrennt; der
MCP-Vertragstest blockiert fehlende beziehungsweise widersprüchliche Klassen. Offen
bleibt die beobachtete Manual-/Auto-/Skip-Abnahme in Cowork.

## BL-043 – Cowork-Fast-Path

Status: **teilweise**

Der direkte Picker unterstützt `local_only` als datensparsamen Standard und einen
tokenfreien Handoff nur für ausdrücklich gewünschte Folgeauswertung. Der Skill- und
MCP-Vertrag untersagt im lokalen Standardweg Polling, Ergebnisliste, Markdown-Lesen
und Bestätigen. Seine Startantwort enthält nur feste, inhaltsfreie Zustandsfelder;
insbesondere kein Batch-Token und keine Recovery- oder Leseberechtigung. Der lokale
Abschlussindikator wird ausschließlich aus festen Zählern erzeugt. Noch offen ist
der versionsgebundene MCP-Task-/Benachrichtigungsnachweis.

Die öffentliche Routineoberfläche ist jetzt supportgetrennt: Im Normalbetrieb
liefert `tools/list` nur acht sichere Cowork-Aktionen (lokaler Start, tokenfreier
Handoff, Fortsetzen, ausdrücklich bestätigtes Verwerfen, Privacy-Konfiguration und
Ergebnisübersicht). Die Fortsetzung startet eine erforderliche lokale Fachprüfung
selbst in einem getrennten Worker; der tokenbasierte synchrone Review ist Support.
Der Privacy-Stamm ist dort auch bei manuell konstruierten Aufrufen gesperrt; die
drei früheren Input-Werkzeuge sind vollständig entfernt. Die gesamte
25-Werkzeug-Oberfläche bleibt lokal nur mit `EU_PRIVACY_SUPPORT_MODE=1` für
IT-Support und vorhandene Recoveryfälle verfügbar. `start_completed_local_results_handoff` und
`continue_local_results_handoff` liefern höchstens fünf verifizierte
Markdown-Ergebnisse pro Aufruf. Auswahl, Paketkennungen, Cursor und
Leseberechtigungen bleiben im lokalen Serverprozess. Bei genau einem passenden
fertigen Stapel wird lokal direkt fortgesetzt; bei mehreren Kandidaten erfolgt die
Wahl ausschließlich in einer lokalen, namenfreien Ansicht. Eine Wiederaufnahme
eines unvollständigen Stapels bleibt davon getrennt. Nie gelangen Paket-ID,
Capability, Quellname, Pfad, Token oder Cursor an Cowork.

RC36 ergänzt den nicht blockierenden Reviewvertrag: `continue_most_recent_document_batch`
entfernt den intern ausgewählten Batch-Token vor der MCP-Antwort und startet bei
`awaiting_local_review` einen abgekoppelten, netzgesperrten lokalen Review-Worker.
Rekonstruktion, native Fachentscheidung, Veröffentlichung und Abschlussanzeige
laufen dort weiter, ohne das Cowork-Zeitfenster zu belegen. Feste Workflow-Ereignisse
trennen Workerstart, IPC, Rekonstruktion, UI, Terminalzustand und Workerende; sie
enthalten weder freie Texte noch Dokumentidentifikatoren. Der frühere direkte
`review_deferred_document_batch` bleibt ausschließlich im Supportmodus.

RC37 härtet diesen Vertrag nach dem erneuten Code-Review. Der synchrone lokale
Supportpfad besitzt weiterhin ein Fünf-Minuten-Limit; der abgekoppelte Worker erhält
einen zentral definierten und getesteten 30-Minuten-Zeitraum für die native
Prüfoberfläche. Ein UI-Zeitablauf verändert keine bereits freigegebenen Dateien und
erlaubt eine ausdrückliche Fortsetzung. Batch-Journale behandeln partielle Writes
vollständig, flushen die Journaldatei vor dem atomaren Rename und synchronisieren auf
POSIX zusätzlich den Verzeichniseintrag. Vor automatischer Output-Retention werden
alle offenen Journale geprüft: ist auch nur eines unlesbar oder ungültig, wird der
gesamte Output-Bereich nicht automatisch gelöscht. Der feste Statusindikator
`retention_output_protection_complete` macht diesen Schutzstopp inhaltsfrei sichtbar.
Bestätigte manuelle Löschung bleibt ausdrücklich möglich. Direkte Tests decken
Short Writes, fehlenden Schreibfortschritt, POSIX-Verzeichnissync, ungültige Journale,
Schutzmengen, Löschumfang und Timeoutkonstanten ab.

RC44 ersetzt ausschließlich für den abgekoppelten lokalen Review-Worker das
30-Minuten-Limit: eine menschliche Entscheidung läuft dort nicht mehr automatisch
ab. Abbrechen und Zurückstellen bleiben ausdrückliche lokale Handlungen. Der
synchrone Supportpfad behält sein Fünf-Minuten-Limit. Die Abschlussanzeige wird
außerdem als inhaltsfreier, abgekoppelter Prozess gestartet und kann deshalb weder
Worker noch Cowork-Aufruf blockieren. Automatische Retention löscht freigegebene
Ergebnisse nicht mehr; nur eine ausdrücklich bestätigte manuelle Löschung darf den
Output-Bereich entfernen.

RC38 bis RC41 ergänzten drei Kontextkorrekturen und eine I/O-Optimierung. Die
ursprünglich regressionsgetesteten Fälle sind wirksam: Kunde/Arbeitgeber in
Zertifizierungs-Fließtext wird in den getesteten Nomen-, femininen und Verbformen
redigiert; ein domänenförmiger Aussteller nach einem Cue auf derselben Zeile bleibt
erhalten. RC39 schreibt reine `processing`-Zwischenmarker ohne Datei-/POSIX-
Verzeichnis-Fsync, während jede Statusänderung weiterhin den vollständigen
Durability-Pfad verwendet. `markInterruptedItemsRetryable` entscheidet ausschließlich
über `item.status`; die vollständigen 66 Batchtests belegen Prozessabbruch und
Exactly-once-Recovery.

Das unabhängige Gegenreview vom 25.08.2026 begrenzt diese E0-Aussage jedoch: RC41
schützt auch eine beliebige Kunden-Domain, wenn nur irgendein Credential-Cue vor ihr
auf derselben Zeile steht. Außerdem bleiben verbreitete Formulierungen wie
`Tätigkeit für` und `im Auftrag von` innerhalb eines Zertifizierungsabschnitts
unredigiert. Beides ist Unter-Redaktion und daher P0. Mehrzeilige domänenförmige
Aussteller sowie Ausstellernamen, die selbst mit `Customer`, `Firma` oder `Kunden`
beginnen, zeigen zusätzliche Über-Redaktion. Der enge Folgeauftrag
`tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md` ist deshalb vor einer
Releasebewertung abzuarbeiten. RC42 schloss die dort gebundenen Fälle; RC43 ergänzt
die unmittelbar anschließende Rollenpräfix-Lücke. Der RC39-Fsync-Test ist mit RC43
plattformneutral und enthält eine gezielte Rename-Fehlerinjektion: Das vorherige
durable Journal bleibt erhalten und die statusbasierte Recovery greift. Reale
Power-Loss- und Drei-OS-Dateisystemnachweise bleiben E1 offen.

Für die folgende Optimierung liegt außerdem eine inhaltsfreie Phasenmessung vor:
Der lokale Batchzustand speichert ausschließlich begrenzte Dauerwerte für Aufnahme,
Konvertierung/Visuelles, Textprüfung, Verifikation und Veröffentlichung. Weder
Dokumenttext noch Namen, Pfade, Dateinamen, Hashes oder absolute Zeitstempel werden
dabei in den Messwert geschrieben oder über MCP ausgegeben. Der Vertragstest prüft
die vollständige feste Phasenmenge und unempfindliches Verhalten bei fehlerhaften
Uhren. Referenzwerte auf Windows, macOS und Linux sind weiterhin manuelle Evidenz.
`npm run benchmark:batch-phases` misst dafür lokal die Szenarien 1, 10 und 100
synthetische Dateien; es schreibt temporäre Quellen nur in einen eigens erzeugten
Ordner und gibt ausschließlich aggregierte Millisekundenwerte aus. Der
Vertragstest startet zusätzlich die kleinen Szenarien 1 und 10 und erzwingt das
feste JSON-Schema, die fünf Phasen und die Abwesenheit von Quellnamen, Pfaden,
Hashes und synthetischem Text; er enthält bewusst keine instabile Leistungsschwelle.

Der Direkt-Picker startet nun außerdem die lokale Übernahme in einem isolierten,
netzgesperrten Hilfsprozess. Der Cowork-Aufruf endet daher nach Auswahl mit sechs
festen, inhaltsfreien Zustandsfeldern; der opake Batch-Token bleibt ausschließlich
im lokalen Worker. Erst danach prüfen und versiegeln lokale Funktionen die Quellen
und verarbeiten sie weiter. Die privaten Pfade werden ausschließlich über lokale
Prozess-IPC übergeben und weder im Rückgabewert noch in MCP-Antworten gespeichert.
Ein paralleler zweiter Intake bleibt gesperrt. Der Worker beansprucht vor der
Verarbeitung selbst seine lokale Ausführungsberechtigung; die Elternseite trennt IPC
nicht vor seinem eigenen Abschluss. Da unter Windows das Exit-Ereignis die bereits
gesendete terminale IPC-Nachricht überholen kann, wartet die reine Präsentationsseite
vor einem Fehlerhinweis ein kurzes lokales Drain-Fenster. Der Regressionstest
erzwingt diese Reihenfolge und verhindert den früheren falschen `after_checkpoint`-
Stopp. Ein echter Child-Process-Test belegt damit einen
vollständigen Ein-Datei-Intake ohne Quellmetadaten in der Antwort. Die echte
Antwortzeit, frühe Intake-Crash-Recovery und die Drei-OS-Abnahme sind weiterhin
offene Evidenz.

Ein Fehler während der asynchronen lokalen Übernahme erhält keine Dokumentdiagnose
und keine Chat-Rückfrage: Der Worker meldet der lokalen Elternseite ausschließlich
`before_checkpoint` oder `after_checkpoint`. Daraus entsteht eine lokale feste
Hinweisansicht ohne Namen, Pfade, Tokens, Fehlertexte oder Zähler. Vor dem Checkpoint
existiert kein wiederherstellbarer Stapel; danach bleibt ausschließlich der bereits
versiegelte lokale Stapel für die bestehende explizite Fortsetzung oder das Verwerfen
erhalten. Fehler beim Anzeigen des Hinweises verändern diesen Zustand nicht.

Die batchweite Wartung wurde aus dem Dokument-Loop gezogen: Retention-Bereinigung,
Prüfung verwaister privater Jobs und Audit-Migration laufen genau einmal nach dem
Claim des lokalen Workers. Ein nur in diesem Prozess erzeugtes, nicht nachbildbares
Objekt belegt die erfolgreiche Vorbereitung für die folgenden Dokumente; ein
beliebig gesetztes Flag kann sie nicht überspringen. Speicher-, Abbruch-, Snapshot-,
Container- und Rest-PII-Gates werden weiterhin pro Dokument ausgeführt. Der
Batchvertrag prüft die einmalige Ausführung über zwei reale lokale Quellen.

Auch die Auditmigration wird nach dieser Vorbereitung nicht erneut pro Ergebnis
gescannt. Der pro-Datei-Auditbeleg bleibt dagegen atomar und unverändert erhalten.
Ein lokaler synthetischer 1/10-Lauf zeigte damit eine Halbierung der gemessenen
Veröffentlichungsphase gegenüber dem vorherigen Referenzlauf; das ist ein
Entwicklungsindikator, keine plattformübergreifende Leistungszusage.

## BL-050 – 1.000-Dokument-Korpus

Status: **teilweise**

Der Schema- und Metrikteil BL-050.1 ist abgeschlossen:
`benchmarks/CORPUS_CONTRACT_V1.json` definiert die Ground-Truth-Felder, den
UTF-16-Positionsraum, die exakten Verteilungen der zwei 1.000er-Korpora sowie die
Release-Gates null direkte Misses, null Zusatzredaktionen und mindestens 99 Prozent
markierten Inhaltserhalt. Vier Vertragstests prüfen Form, Verteilung und das reale
Detektorergebnis. Der verbleibende Teil von BL-050 betrifft neue dokumentartige
Fixtures für noch gesperrte Container, Sprachen, Layouts und Angriffe.

Vorhanden: 1.000-Fall-Vertragskorpus mit positionsgenauer Ground Truth und ein
zusätzlicher 1.000-Fall-Akzeptanzkorpus mit 500 Verträgen, 167 Mitarbeiterprofilen,
167 Bewerbungen und 166 Kundenvorgängen. Der Mehrprofilkorpus prüft direkte
Identifikatoren sowie den Erhalt von Rollen, Fachinhalten und Zertifikaten. Dazu
kommen 77 PII-Regressionen, 29 Skill-Szenarien, 20 Explorationsfälle und eine
100-Fall-Formatmatrix. Diese prüft die reale automatische Profilerkennung sowie
Entfernung/Erhalt über TXT, Markdown, CSV und DOCX für deutsche, englische,
französische, spanische und niederländische Personalprofilbeschriftungen sowie
17 weitere deterministische Varianten direkter Identifikatoren. Jede Zelle der
Matrix durchläuft den echten lokalen Gateway-Pfad, nicht bloß eine Metadatenprüfung.
Parser-/Visual-/Security-Tests und ein messender Detektorbenchmark ergänzen sie.
Damit ist BL-050.2 erfüllt: die zwei eigenständigen 1.000er-Korpora übertreffen
die verlangte Mindestmenge, haben versionierte Ground Truth und werden direkt
gegen Null-Miss-, Null-Zusatzredaktions- und 99-%-Erhaltungsgates ausgeführt.
Eine spätere Erweiterung um noch gesperrte Container, weitere Sprachen, Layouts
oder Angriffsklassen ist keine stillschweigende Formatfreigabe; sie bleibt an
den jeweiligen Format- und Sicherheitsstories gebunden.

Ergänzend deckt ein permanenter 2.000-Fall-Sweep acht Markdown-Strukturen und
variierte synthetische Namen, Unternehmen, Zertifikate, deutsche IBANs und
Telefonnummern über alle fünf Profile ab. Er fordert zugleich die idempotente
Verarbeitung bereits freigegebener Texte.

Eine zusätzliche feldbezeichnungsgebundene Regression umfasst französische,
spanische und niederländische Personalprofile: Name, E-Mail, Telefon und
Arbeitgeber werden entfernt, während Rolle und Zertifikat erhalten bleiben. Der
französische Einziffern-Ortscode wird dafür mit einer separaten engen
Telefonform erfasst. Über diese getesteten Labelformen hinaus wird keine allgemeine
Sprachabdeckung behauptet.

Zusätzlich verifiziert eine reale Gateway-Matrix die vier aktiven Formate TXT,
Markdown, CSV und DOCX mit denselben direkten Identifikatoren, Zertifizierungen und
IT-Rollen. CSV-Zertifikatskontext ist dabei zellengenau und schützt keinen
Arbeitgeber in derselben Datenzeile. Die automatische Profilwahl erkennt den Fall
in allen vier Formaten als Personalprofil – jeweils mit deutschem und englischem
Profil. Einzelne Company-/Role-Labels bleiben ohne weitere Profilsignale allgemein.

Die Matrix umfasst darüber hinaus Vertrag, Bewerbung und Kundenvorgang in allen
vier aktiven Formaten und prüft die automatische Profilwahl. Beschriftete
Bewerber-Wohnorte und Arbeitgeber werden auch in CSV-Spalten de-identifiziert.

## BL-051 – Plattform- und Distributionsmatrix

Status: **teilweise**

Vorhanden: eine kostenbegrenzte automatische Ubuntu-Kernprüfung sowie eine nur
manuell gestartete Windows-/macOS-/Linux-Vollmatrix, Windows-Native-Tests,
ZIP-/MCPB-Build, SBOM, Prüfsummen und Quellparität. Der automatische Pfad besitzt
genau einen Job, zehn Minuten Timeout, Änderungsfilter und Abbruch doppelter Läufe;
Plattform-, Release-, OCR-/PDF- und Security-Evidenz wird gezielt manuell gewählt.
Rest: echte frische ZIP- und Marketplace-
Installationen, kompletter End-to-End-Weg und Rückrolle auf Windows/macOS/Linux;
CI nutzt derzeit auf macOS/Linux noch eine ausdrücklich eingerichtete Node-Runtime.
Offen sind zusätzlich der echte Cowork-Lebenszyklus (Fresh Install, neue Sitzung,
Upgrade, Rollback) und die Web-/Mobil-/Cloud-Negativmatrix. Sichtbare Skills oder ein
grüner Pakettest ersetzen weder Connector- noch `privacy_status`-Nachweis.

Für diese Negativmatrix liegen jetzt ein maschinenlesbarer Hostvertrag,
`test-host-matrix` und vier Skill-Evalfälle vor. Web, Mobil, Cloud/Scheduled und
Desktop ohne erfolgreichen Local-MCP-Probe sind darin NO-GO für Originale; bereits
lokal bereinigtes Markdown bleibt erlaubt. Die Tests belegen das Sollverhalten des
Plugins, nicht die tatsächliche Reaktion der jeweiligen Claude-Oberfläche. Deshalb
bleibt BL-051.6 bis zur beobachteten Hostabnahme **in Arbeit**.

BL-051.7 ist umgesetzt: `test-workflow-budget.js` verhindert unbemerkte neue
Push-/PR-Workflows, Matrizen, Artefaktuploads oder unbeschränkte Laufzeiten im
automatischen Pfad. `release-evidence.yml` erhält die vollständige Plattform- und
Build-Evidenz als bewusste Auswahl; `security.yml` lässt JavaScript-, Native- und
Secret-Prüfung getrennt starten. Dadurch bedeutet ein normaler Push höchstens einen
kurzen Linux-Lauf statt der früheren sieben Jobs.

## BL-052 – Menschliche Abnahme

Status: **offen**

Vorhanden: dokumentierte UX-, Datenschutz-, Security-, Architektur- und
Claude-Dokumentationsreviews sowie automatisierte native Windows-Formtests. Rest:
beobachtete Abnahme mit normalen Anwendern und Fach-/Datenschutzvertretung auf allen
drei Plattformen. Die Abnahme muss insbesondere Cowork-Fresh-Install, beide
Skillstarts, Connectorfehler, quantifiziertes Verwerfen, lokale Fachprüfung und
gestufte Claude-Weiterverarbeitung beobachten. Echtdaten bleiben bis zu einer
separaten Pilotentscheidung NO-GO.
## BL-044 – Sichere Datei- und Ordnerquellen

Status: **teilweise**

Vorhanden ist ein lokaler Mehrfach-Dateipicker mit Snapshot- und Mengenlimits. Die
frühere Input-Oberfläche und ihre drei aufrufbaren Werkzeuge sind entfernt; nur eine
datenbewahrende Startmigration für bereits verwaiste Claims bleibt während des
Übergangs erhalten. Rekursive Ordnerwahl, vollständige Vorabvalidierung der
Hierarchie, stabile relative Mappingzuordnung und der Abbau des internen Altpfads
fehlen noch.

## BL-047 – Performance und Ressourcensteuerung

Status: **teilweise**

Benchmarks und getrennte Zwei-Worker-/OCR-Harnesses existieren, sind aber bewusst
nicht Produktpfad. Adaptive Parallelität, das 25%-/2-GiB-Budget sowie automatische
2-s-/10-s-/10%-Gates fehlen.

## BL-049 – Inhalts- und Formatgrenze

Status: **teilweise**

Container-, Parser-, Active-Content- und Residualgates sind für freigegebene Formate
umfangreich vorhanden. Ein einheitliches Vorab-Sniffing aus Endung, Signatur und
Containerstruktur sowie die drei kanonischen Ergebnisgrade fehlen noch.
## RC44-Nachtrag – zuerst umgesetzte Reviewbefunde

- Automatische Retention überspringt `Output` unabhängig vom Alter; nur ein
  ausdrücklich bestätigter Purge darf freigegebene Ergebnisse löschen.
- `start_document_batch_from_picker` blockiert nur aktiven Intake beziehungsweise
  aktive Verarbeitung, nicht pausierte oder fortsetzbare Stapel.
- Skill und MCPB-Prompts behandeln die Altstapelverwaltung nur auf ausdrücklichen
  Wunsch; ein neuer Auftrag öffnet direkt die neue Auswahl.
- Der abgekoppelte lokale Review besitzt keinen menschlichen Entscheidungs-Timeout.
  Der synchrone Supportaufruf bleibt auf fünf Minuten begrenzt.
- Die feste, inhaltsfreie terminale Abschlussmeldung wird detachiert gestartet und
  hält Batchworker oder Cowork-Aufruf nicht bis zum Schließen offen.

Targettests sind E0; Fresh-Install-, reale Cowork-, Accessibility- und native
macOS-Evidenz bleiben bei BL-041.9 E1/E2 offen. OS-gebundene Verschlüsselung,
Ordnerauswahl und selbsttragende Pakete bleiben höher priorisierte Restarbeit.
