# Technischer Mehrdimensionenreview: Standalone v2 / Windows r9

Stand: 08.10.2026 · Kennungsfamilie `R9-20261008` · Engineeringstand, keine Freigabe.

Dieser datierte Bericht beschreibt den geprüften Arbeitsstand. Er ist weder
ein neuer Produktvertrag noch eine zweite Arbeitsliste. Bearbeitung und Status
stehen ausschließlich im [Backlog](canonical/BACKLOG.md#bl-01053--standalone-prototyp-v2-umsetzen-ds-110).
Der erste Reviewdurchgang enthielt keine Implementierung; der unten datierte
Korrektur- und Gegenprüfungsnachtrag beschreibt die anschließende Umsetzung.
Die veröffentlichten
RC158-Pakete sind nicht mit dem unveröffentlichten v2-Arbeitsstand gleichzusetzen.

## Umfang und Bindung

Geprüft wurden Nutzerführung und Zustandsübergänge, tatsächliche Anonymisierung,
Pause/Fortsetzung, Dokumentfreigabe, Identitätsübersicht, nativer Export,
Sidecar-Lifecycle, Windows-/Mac-Unterschiede sowie Qualität und Aussagekraft der Tests.
Drei unabhängige lesende Teilreviews deckten Frontend, Verarbeitung und native
Sicherheit ab. Der Hauptreview wiederholte die drei funktionalen Gegenbeispiele
und prüfte die nativen Kontrollflüsse selbst.

Basis ist der vorhandene, umfangreich geänderte Arbeitsbaum auf
`codex/ocr-contact-native-revalidation-20261006`, HEAD
`2c1c04318b3ddbcd6b9a7ce63bac6af5c4daaf4d`. HEAD allein bezeichnet diesen
uncommitteten Stand nicht ausreichend. Der vor und nach Abschluss der Tests unveränderte
Digest über 964 Git-gelistete Dateien unter `apps/datasecure-standalone/`,
`plugins/data-secure/server/`, `scripts/`, `tests/` sowie `package*` lautet:

`7588b534d0c3c4a51769a0a74b781c32bcd97441b2b18f6f747badbda091e4bb`.

Hashverfahren: lexikographisch sortierte relative Pfade, jeweils UTF-8-Pfad,
NUL-Byte und vollständige reguläre Dateibytes, anschließend SHA-256.
Dokumentationsnachträge sind nicht Bestandteil dieses Quellscopedigests.

Windows-Archiv:
`dist/engineering-workspace-v2-windows-20261008-r9/DataSecure-Standalone-3.2.0-rc158-windows-x64.zip`.
SHA-256: `f7de84085dd12e6862efcd599dfa0088141ec2747046c08dedfcf367747955c1`.
Der Verifier akzeptiert 611 Einträge / 111.015.790 Bytes. Zusätzlich wurden
alle 190 projizierten Serverdateien gegen die aktuelle Runtimeprojektion und
die native EXE gegen den vorhandenen Releasebuild bytegenau verglichen: keine
Abweichung. Das bestätigt Paketkonsistenz, nicht den bedienten Gesamtworkflow.

Keine Desktop-/Browserbedienung, kein neuer GUI-Start, kein Actions-Start,
Commit, Push oder Release. Tests verwendeten ausschließlich synthetische Daten
in eigenen Testbereichen. Dies ist keine vollständige Zeile-für-Zeile-Prüfung
aller Dateien, keine menschliche Semantik-/Accessibility-Abnahme und kein
Nachweis universeller Anonymisierungsqualität.

## Urteil

Die Architektur ist grundsätzlich geeignet; ein pauschaler Framework- oder
MVC-Umbau ist aus diesen Befunden nicht begründbar. Der aktuelle v2/r9-Stand
ist jedoch noch nicht allgemein freigabereif. Drei funktionale P2-Gegenbeispiele
sind reproduziert; zwei weitere native Kontrollgrenzen sind statisch belegt,
nicht als tatsächlich eingetretener Betriebssystemfehler reproduziert.
Ein neuer P1-Datenfreigabebypass wurde im geprüften Umfang nicht bestätigt.
Das bedeutet nicht, dass ein solcher Fehler ausgeschlossen ist.

## Reproduzierte Produktfehler

### R9-01 · P2 · Freigabe kann einen anderen Stand betreffen als der sichtbare Vergleich

Stellen: `apps/datasecure-standalone/frontend/document-review.js:245`
(Übernahme der neuen Dokumentliste), `:484` (Neuladen), `:516` (Sammelfreigabe).

Reproduktion mit dem tatsächlich geladenen Renderercode und dem vorhandenen
DOM-/IPC-Testharness aus `tests/test-standalone-document-review-frontend.js`:

1. Dokumentrevision 0 öffnen, Original und Markdown anzeigen.
2. Die autoritative Testantwort auf Revision 1 mit anderem Ausgabehash umstellen.
3. „Gespeicherten Stand neu laden“ betätigen, Dokument auswählen und freigeben.

Beobachtet:

```json
{"display":"Displayed revision 0","displayLabel":"Stand 0 · noch nicht freigegeben","listLabel":"Prüfung offen · Stand 1"}
[{"id":"11","revision":1,"sha":"44"},{"id":"22","revision":0,"sha":"22"}]
```

Ist: Die Liste und Freigabe verwenden Revision 1; `detail`, `loadedMarkdown`
und die sichtbaren Textfelder behalten ohne Korrekturentwurf Revision 0.
Soll: Vergleich, Entitäten, Auswahl und Freigabe müssen denselben belegten
Dokumentstand meinen. Ein entfernter Prüfstand darf ebenfalls keinen alten
Vergleich behalten.

Auswirkung: Der Mensch kann einen nicht angezeigten Stand bestätigen. Ein
Privacy-Gate-Bypass ist damit nicht bewiesen. Bei reinen Textkorrekturen kann
stattdessen eine vermeidbare Stale-Ablehnung auftreten.

Korrektur: Revisions-/Hash-/Zugehörigkeitsänderung beim Reload erkennen;
betroffene Auswahl und Detailansicht ungültig machen oder den neuen Stand
ausdrücklich neu laden. Unveränderte Details dürfen erhalten bleiben.
Geschützte ungespeicherte Korrekturentwürfe getrennt behandeln.
Regressionen: beide Zwecke, neue Revision, anderer Hash, Entfernung,
unveränderter Stand und vorhandener Entwurf.

Evidence: vom Hauptreview identisch wiederholt; echter Renderer mit simuliertem
DOM/IPC, keine native GUI-Reproduktion. Zuordnung: DS-110, BL-010.53.5/.7/.8.

### R9-02 · P2 · Bestätigte Pause wird nach einer Stapelentscheidung ignoriert

Stellen: `plugins/data-secure/server/gateway/batch-review-publication.js:99`,
insbesondere direkter Wechsel auf `processing` in `:107`.
Der normale Dateipfad verwendet dagegen die dauerhafte Kontrollsperre in
`gateway/batch-item-processor.js:112`.

Reproduktion: zwei tatsächliche TXT-Eingaben mit unklarer Überschrift in einer
frischen Windows-Runtimeprojektion, echte Aufnahme/Verarbeitung bis
`deferred_review`, synthetisch gebundene Keep-Entscheidungen. Am
`beforePublish`-Checkpoint der ersten Datei über die echte Backendfunktion
Pause anfordern. Ergebnis des Hauptreviews:

```json
{"initialDeferred":2,"pauseAccepted":true,"releasedAfterPause":2,"completeAfterPause":true,"states":[{"name":"pause-0.txt","status":"released"},{"name":"pause-1.txt","status":"released"}]}
```

Ist: Trotz akzeptierter Pause werden beide Dateien veröffentlicht.
Soll: Nur die bereits aktive Datei darf einschließlich Delivery/Zuordnung
fertig werden; vor dem nächsten Dateiclaim muss die Pause greifen.

Auswirkung: Die erfolgreiche Pausebestätigung entspricht nicht der weiteren
Verarbeitung. Die bestehende Gegenprobe für den normalen Executor deckt diesen
zweiten Veröffentlichungspfad nicht ab.

Korrektur: Review- und Kontaktfolgephasen an dieselbe generationsgebundene
Claim-/Pausekontrolle anschließen. Noch nicht gestartete Dateien und gebundene
Entscheidungen dauerhaft erhalten; Fortsetzung darf weder erneut fragen noch
doppelt veröffentlichen. Zusätzlich Pause vor dem ersten und zwischen zwei
Reviewclaims, Neustart und Fortsetzung prüfen.

Evidence: Hauptreview wiederholte echten Gateway-/Konverter-/Publikationspfad;
Prüfantwort und Pausezeitpunkt sind kontrollierte Testinjektionen, keine GUI.
Zuordnung: DS-110, BL-010.53.3/.4/.7/.8.

### R9-03 · P2 · Versteckte Übersichtskapazität verhindert den Export gültiger Dokumente

Stellen: `plugins/data-secure/server/standalone/confidential-overview.js:73`,
`gateway/standalone-document-review-store.js:728`, `:972` und `:1090`.

Reproduktion: TXT mit 10.001 unterschiedlichen synthetischen E-Mail-Adressen
`kontakt0@example.invalid` bis `kontakt10000@example.invalid`, nur 278.918 Bytes.
Echte projizierte Windows-Runtime, technische Anonymisierung, vollständige
Entitätenerfassung und revisionsgebundene Dokumentfreigabe; danach Export:

```json
{"inputBytes":278918,"technicalComplete":true,"released":1,"entityCount":10001,"approved":true,"exported":{"error_code":"DOCUMENT_REVIEW_INVALID","message":"DOCUMENT_REVIEW_INVALID"},"sourceUnchanged":true}
```

Ist: Erst die zwingend erstellte vertrauliche Übersicht verwirft das erfolgreich
verarbeitete Dokument bei mehr als 10.000 Vorkommen. Direkte Kontakte werden
danach ohnehin nicht als Identitätszuordnung aufgenommen.
Soll: Verarbeitung, Prüfstand und Export brauchen konsistente, verständliche
Kapazitätsgrenzen. Eine unvermeidliche Grenze muss früh mit Dateiname und
konkretem Kapazitätsgrund sichtbar sein.

Auswirkung: Kein KI-Export trotz erfolgreicher Verarbeitung und Freigabe;
die allgemeine Invalid-Meldung nennt weder Grenze noch Datei.

Korrektur: Identitätsrelevante Daten begrenzt verarbeiten, ausgeschlossene
Kontakte kontrolliert aggregieren und Grenzen durchgängig vereinheitlichen.
Nicht einfach sämtliche Limits erhöhen. Regressionen bei 10.000/10.001
Kontakten, gemischten Identitäten, mehreren Dateien und beiden Exportwegen.

Evidence: Node-Exportpfad vom Hauptreview wiederholt. Nativer Export enthält
denselben vorgeschalteten Übersichtsschritt; diese Übertragung ist statisch
belegt, kein nativer Tauri-Exportversuch. Zuordnung: DS-110, BL-010.53.5/.6/.7/.8.

## Statisch belegte native Kontrollgrenzen

### R9-04 · P2-Risiko · Blockierendes Export-I/O kann Antwortfrist und Schließen festhalten

Stellen: `apps/datasecure-standalone/tauri-contract/src/main.rs:1020`,
`native_export_channel.rs:49`, `:71`, `:102` sowie `ipc_transport.rs:208`.

Der v2-Publikationshandler läuft synchron ohne übergebene Deadline durch
Öffnen/Lesen/Schreiben/Sync/Rename. Die allgemeine Antwortfrist kontrolliert
nur die umgebenden Kanalwarteoperationen. `NativeGuard::checkpoint` prüft
Shutdown, nicht verstrichene Zeit; Shutdown wartet auf den Guard ohne Frist.
Der vorhandene gezielte Timeouttest deckt den alten `read_metadata`-Pfad ab,
nicht dieses v2-Dateisystem-I/O.

Folge: Hängt ein Betriebssystem-/Datenträger-/Filtertreiberaufruf, können die
30-/300-Sekunden-Antwortfrist und reguläres Beenden unbegrenzt überschritten
werden. Keine tatsächliche OS-I/O-Blockade wurde injiziert. Kein belegter
Freigabe-, Überschreibungs- oder Pfadschutzbypass.

Korrekturziel: native Arbeit getrennt nachverfolgen, UI begrenzt und ehrlich
antworten lassen, laufende/unklare Operation und Besitz weiterhin halten.
Ein UI-Timeout darf nie den Guard freigeben, einen Nachfolger zulassen oder
behaupten, es sei nichts geschrieben worden. Verzögerungs-/Abbruchinjektionen
müssen direkt den v2-Publikationspfad und dessen spätere Versöhnung treffen.
Zuordnung: DS-108/110, BL-010.53.6/.7/.8.

### R9-05 · P2 · Unbrauchbarer Sidecar wird erst durch einen weiteren RPC abgeräumt

Stellen: `apps/datasecure-standalone/tauri-contract/src/main.rs:1052`, `:1066`
(nur `unusable` und Invalidierung), `:952` (Retirement beim nächsten Aufruf).

Nach Transport-/Protokollfehler bleibt der gespeicherte Prozess inklusive
Eingabekanal erhalten. Ohne nachfolgenden RPC erfolgt an diesen Fehlerstellen
keine selbständig ausgelöste Beendigung. Übliche automatische UI-Kontextabfragen
verdecken diese Abhängigkeit; sie ersetzen keine native Bereinigungsgarantie.

Auswirkung: Ein noch lebender unbrauchbarer Sidecar kann bei ausbleibenden
Folgeaufrufen bestehen bleiben. Kein zu früher Besitzerwechsel nachgewiesen:
die vorhandene Retire-/Drain-Sperre ist konservativ.

Korrektur: eigenständig Retirement veranlassen, tatsächliches Prozessende und
nativen Drain abwarten, Generation erst anschließend freigeben. Gegenprobe mit
lebendem Sidecar, provoziertem Timeout/Protokollfehler und ausdrücklich keinem
weiteren Rendereraufruf. Beleg ist Codefluss, keine native Fehlerinduktion.
Zuordnung: DS-108/110, BL-010.53.6/.7/.8.

## Kleinere Konsistenzbefunde

### R9-06 · P3 · Verlauf nennt den falschen Zeitpunkt eines Dateifehlers

`apps/datasecure-standalone/frontend/workspace.js:449` beschreibt sämtliche
`not_processed_count`-Dateien als bereits bei der Aufnahme abgewiesen. Der
Zähler umfasst inzwischen auch terminale Verarbeitungsfehler, etwa
`PARSE_FAILED`, `CONVERSION_TIMEOUT` oder `RESIDUAL_PII`. Die Dokumentansicht
unterscheidet die Gründe bereits.

Korrektur: neutral „nicht verarbeitet“ formulieren oder Kategorien explizit
trennen; Namen und echte Gründe beibehalten. Test mit Aufnahmeablehnung und
späterem Konverterfehler im selben Lauf. Statischer Vertrags-/Codeabgleich,
keine GUI-Probe. Zuordnung: DS-106/110, BL-010.53.7/.8.

Zusätzliche Vertragsdrift: `frontend/workspace.html:33` wählt OCR-Kontaktprüfung
vor; `canonical/STANDALONE_SECURITY_MODEL.md:123` beschreibt eine nicht
vorausgewählte Option. Für v2 muss die bewusste Standardentscheidung samt
Anwendertext dokumentiert werden. Daraus wird weder eine Datenschutzverletzung
noch ein bewiesener unbeabsichtigter Verarbeitungsstart abgeleitet.

## Inhaltsqualität: frische Messung statt alter grüner Tests

Neue vollständige Messung im unveränderten Arbeitsstand:
`dist/quality-r9-review-20261008/BERICHTE/QUALITAET.{json,md}` sowie
`BEFUNDE.csv` und lokale Gegenprüfungsdateien. Tatsächliche lokale Konverter-/
OCR-Runtime und Veröffentlichungsweg, keine Modell- oder Netzwerkinstallation.

| Messgröße | Beobachtung | Aussagegrenze |
|---|---|---|
| Format-/OCR-Varianten | 72, aus 60 logischen Fällen | kein repräsentatives Realweltkorpus |
| Technische Konvertierungsabbrüche | 0 | kein Beweis inhaltlich fehlerfreier Konvertierung |
| Roh-OCR | 9 veränderte E-Mail-Vorkommen | betrifft bereits Markdown, nicht nur Anonymisierung |
| Endergebnisse | 72 bewertet; 0 bekannte Lecks bei 310 Referenzvorkommen | nach referenzgebundenen synthetischen Entscheidungen |
| Sachinhalte | 0 verlorene Kontrollanker / Sachwörter in finalen Ergebnissen | nur annotierte Inhalte und Auswerterumfang |
| Referenzentscheidungen | 55 Kontaktbestätigungen, 9 Korrekturen, 202 Entitätsentscheidungen | Vorkommensentscheidungen, keine Zahl menschlicher Dialoge |
| Prozessbereinigung | bestätigt | kein Stromausfallnachweis |
| Qualitätsgate | `QUALITY_FINDINGS_OPEN` | weiterhin rot; Bericht ist jetzt nicht mehr stale |

Beispiele: `development/quality-008-clean.png` und
`holdout/quality-050-small-font.jpeg` verlieren die E-Mail-Symbolstruktur;
`development/quality-019-rotated.png` und
`holdout/quality-055-low-resolution.png` lesen zudem `q` als `g`.
Alle neun genauen Dateien, Soll-/Istwerte und Fundstellen stehen in `BEFUNDE.csv`.

Die separate **unveröffentlichte Einpass-Core-Probe** zeigt sieben Firmenreste
und 147 verlorene Kontrollanker / 294 Sachwörter. Das sind ausdrücklich nicht
Lecks oder Verluste der final veröffentlichten Workflow-Ergebnisse; diese
Zahlen dürfen nicht vermischt werden. Sie zeigen Verbesserungspotenzial für
automatische Erkennung und weniger notwendige menschliche Prüfung.

Der Benchmark unterstützt nur vier ausgewiesene Entitätsfamilien und begrenzte
Layout-/Schrift-/E-Mail-Muster. Erweiterungen sollten verschiedene Schriften,
Layouts, Kontaktmuster, Adressen/Identifikatoren, Scanartefakte und unabhängig
annotierte Holdouts umfassen. Korpusreferenz nicht aus Detektorantworten ableiten
und keine testfallspezifischen Freigabelisten einbauen. Bestehende Arbeit:
BL-050.5/.6 und BL-010.51, nicht als neuer erledigter Qualitätsnachweis umdeuten.

## Tests und Plattformnachweise

| Prüfung dieses Reviews | Ergebnis / Umfang |
|---|---|
| vollständige Produktsuite | neu gestarteter eingefrorener r9-Durchgang bestanden: 96 Basis- und 121 direkte Testdateien (217 insgesamt), einschließlich letztem Undo-Delta; Exit 0 |
| Renderer-Gegenprüfung | bestehende 39 Review-, 41 Workspace- und 37 Dokumentrendererfälle grün; R9-01 fehlt darin |
| Windows-Rust | 106 bestanden, 0 fehlgeschlagen; 3 ignorierte aufgerufene Kindhelfer, keine offenen Fachabnahmen |
| Clippy | alle Targets, locked, Warnungen als Fehler: bestanden |
| Dokumentationsgates / installierte Claude-CLI-Strukturprüfung | bestanden; kein Ersatz für Produkt-/Pakettests |
| r9-Paketverifier / Byteabgleich | bestanden; kein neuer native-GUI- oder exakter Releasequalitätsnachweis |
| frische 72-Varianten-Qualitätsmessung | technisch beendet, Bereinigung bestätigt; Gate rot wegen neun Roh-OCR-Befunden |
| normaler Produktbuild | rot: `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` |
| Plugin-ZIP-Gate | rot: aktuelles RC158-Cowork-Archiv fehlt; getrennt vom vorhandenen Standalone-r9-Archiv |

Die Tests sind nicht pauschal gemockt: Es gibt echte Worker, private Snapshots,
Prozessbeendigung, Konverter/OCR und Node/Pipe/Rust-Dateisystemintegration.
Die minimalen DOM-/IPC-Harnesses sind sinnvoll für deterministische Rennen,
belegen aber weder WebView-Layout noch native Dialoge, Fokus, Screenreader oder
den ganzen bedienten Paketworkflow. Grüne bestehende Tests schließen die drei
neuen funktionalen Gegenbeispiele ersichtlich nicht aus.
Die früheren Markerherkunfts- und 1.001-/5.000-Fundstellen-Gegenfälle werden
inzwischen durch tatsächliche Engine-/Orchestratorregressionen geprüft und
bestehen im hier beobachteten 43-Fälle-Restprüfungsblock. Die alten P1-Befunde
werden deshalb nicht ohne Gegenbeleg erneut als aktuell offen behauptet.

Für macOS bleibt im aktuellen v2-Schnitt native Laufzeitevidence auf Intel und
Apple Silicon offen. Die vorhandene Workflowkonfiguration baut weiterhin den
Standard-Einstieg, nicht ausdrücklich `workspace.html`
(`.github/workflows/standalone-macos-sandbox.yml:131`,
`tauri-contract/tauri.conf.json:12`). Ein späterer grüner Standard-Smoke wäre
deshalb kein automatischer v2-Nachweis. Haupt-/Prüfseiten-IPC ist inzwischen
streng geprüft, jedoch weiterhin keine vollständige Entscheidungs-/Exportbedienung.
Es wurden keine neuen Workflows gestartet.

Weiterhin gesondert offen: echtes Einzeldatei-Retry/Auslassen, sichere menschliche
Kopie der aktuellen Identitätsübersicht, vollständige grafische/Tastatur-/
Accessibility-Abnahme, weitere Prozessabbruchzeitpunkte und Dateisystemgrenzen.
Diese bekannten Restpunkte sind nicht sämtlich neue Reviewfehler und stehen
bereits in BL-010.53. Ein Prozesskilltest belegt keinen Stromausfall.
Der komplette Ausfall bei der Kollegin bleibt ohne ihre Diagnose weiterhin
ungeklärt (BL-010.47). Dieser Review beweist weder Antivirus-/Betriebssystemblockade
noch, dass einer der gefundenen Fehler die Ursache dieses früheren Vorfalls war.

## Architektur und Lösungsrichtung

Stärken: offline und getrennte Produktadapter; schmaler nativer Befehlssatz ohne
Renderer-Datei-/Shellrechte; unveränderte Originale; gebundene Revisionen und
Hashes; laufweite typisierte Entscheidungen; atomare Regelcommits; ausdrücklicher
Export; getrennte vertrauliche Zuordnungen; konservative Lost-ACK-/Recoverylogik.

Schwächen: dieselbe fachliche Kontrollregel ist nicht in allen Ausführungspfaden
wirksam (R9-02); Listenstand und sichtbarer Detailstand werden getrennt aktualisiert
(R9-01); Kapazitäten sind lokal statt durchgängig definiert (R9-03); nativer Besitz
und Antwortfrist brauchen eine explizite asynchrone Zustandsvereinbarung (R9-04/05).
Der lange Migrationsnachweis vermischt zudem zeitgebundene ältere Schnitte mit
heutigen Restpunkten. „Grün“ muss stets Teststand, Ebene und Paket benennen.

Keine neue Privacy-Engine und kein großer MVC-/Frameworkwechsel als Sofortmaßnahme.
Stattdessen gemeinsame serverseitige Claim-/Kontrollregeln, revisionsgebundene
Frontend-Detailzustände, einheitliche Kapazitäts-/Fehlerprojektion und gezielte
Fehlerinjektion an realen Grenzen. Die drei funktionalen Gegenbeispiele zuerst
als rote Regressionen sichern, dann begrenzt korrigieren; native Kontrolllücken
anschließend mit echten verspäteten Operationen prüfen. Erst danach vollständige
v2-Paket- und Bedienabnahme auf Windows und beiden Mac-Architekturen.

Nach diesem Review wurden keine Produktfehler behoben und keine offenen
Abnahmen als bestanden markiert. Der Bericht liefert belastbare Eingrenzung,
keine Garantie, dass sämtliche Fehler gefunden sind.

## Korrektur und erneute Gegenprüfung, 08.10.2026

Dieser Nachtrag folgt auf den obigen Read-only-Review. Die historischen
Fehlerbeschreibungen und Paketnachweise gelten für dessen damaligen Schnitt,
nicht für den inzwischen korrigierten Arbeitsbaum. Keine Veröffentlichung,
kein Commit/Push, keine Actions, keine Desktopbedienung.

Die unabhängigen Fachrollen Frontend/Workflow, Verarbeitung/Privacy und Rust/
Prozessbesitz revalidierten die Lösungsgrenzen lesend. Das sind technische
Gegenprüfungen, keine externen menschlichen Freigaben. Der Hauptagent änderte
den Code und wiederholte die Gegenproben. Keine Framework-/MVC-Neuarchitektur
oder neue OCR-Engine war zur Behebung dieser Fehler nötig.

| Befund | Umsetzung und neue Gegenprobe |
|---|---|
| R9-01 | Sichtbarer Vergleich, Checkboxabsicht und Aktionen binden dieselbe ID/Revision/Hash/Zweck/Chunkzahl. Reload verwirft veränderte oder entfernte Details; unveränderte bleiben erhalten. Fremd geänderte ausgewählte Dokumente erben keine Absicht. Eigene bestätigte Änderungen übernehmen nur ihren exakt gebundenen Antwortstand. Reiner Markdown-Entwurf bleibt bei ungespeicherter/unklarer Korrektur erhalten. Renderer: 42 Fälle grün, einschließlich beider Zwecke, Änderungen an Revision/Hash/Chunks, Entfernung, Zweckwechsel und anderem ausgewählten Dokument. Der strengere Gegenprobenharness prüft auch Revisions-/Hashargumente und unterscheidbaren Text. Keine visuelle WebView-Abnahme. |
| R9-02 | Derselbe serverseitige Pauseclaim gilt vor Kontaktkonvertierung, Rekonstruktion, Folgegruppen und Reviewpublikation. Vollständig gebundene übergebene Entscheidungen werden vor dem ersten Publikationsclaim dauerhaft gespeichert. Bei Pause keine nächste Datei; aktive Datei darf ihren Bereitstellungs-/Mappingabschluss beenden. Standalone-Mapping-/Publikationsschuld stoppt weitere Claims. Echte TXT-Engine-/Gateway-Gegenproben pausieren nach der Antwort sowie bei der ersten Veröffentlichung, prüfen tatsächliche Ergebnisanzahl und setzen im neuen Node-Prozess ohne erneute Entscheidung/Doppelpublikation fort. |
| R9-03 | Die Übersicht validiert Kontakt-/Wiederholungszeilen bis zur bereits geltenden Gesamtgrenze von 100.000 Vorkommen, statt sie bei 10.000 Entity-Zeilen abzulehnen. Materialisierte Identitätseinträge bleiben begrenzt, ebenso 16 MiB und 100.000 Gesamtvorkommen. Manipulierte spätere Zeilen und Gesamtüberlauf bleiben gesperrt. Echte Engine-Spur: 10.001 verschiedene E-Mails plus Person und Firma, echte Freigabe, Node- und Rustexport, Bytevergleich, aktuelle/exportgebundene Übersicht erneut lesen. Beide Wege grün; direkte E-Mail-Werte weder im Export noch in der Übersicht. |
| R9-04 | Native v2-Publikation läuft in einem vor dem Threadstart registrierten Worker. Die Antwortfrist begrenzt das Warten und die Annahme verspäteter Antworten, nicht die Lebenszeit einer laufenden OS-Operation. Guard und Sidecar-Eigentümer bleiben bis Ende/Reconciliation erhalten. Test-only Barrieren im tatsächlichen Renamepfad zeigen: Timeout vorher erzeugt keine Ergebniskopie, Timeout danach wird als vorhandene gleiche Kopie reconciliert; Shutdown meldet vor der Bereinigung keinen Erfolg. |
| R9-05 | Kanalfehler starten die Bereinigung unmittelbar, nicht erst beim Folge-RPC. Eine registrierte Bereinigung wartet auf Native-/Spawn-Guards, bestätigt Ende des exakten Kindes und entfernt nur dessen Sitzung. Kein Nachfolger bei ungeklärtem Ende. Ein dabei entdecktes Rennen zwischen Sidecar-Entfernung und Lifecycle-Abschluss ist korrigiert: SpawnGuard wird unter dem Sidecarmutex vor dem Verbrauch einer Wiederherstellungsgeneration reserviert. 32 abgewiesene Versuche in dieser Lücke verbrauchen keine Generation; danach genau eine erfolgreiche Reservierung. |
| R9-06 / Optionsdrift | Verlauf bezeichnet spätere Fehler neutral als nicht verarbeitete Quelldateien, mit Verweis auf Namen/Gründe. OCR-Kontaktprüfung bei reiner Markdown-Konvertierung ist entsprechend dem bestehenden Sicherheitsvertrag nicht vorausgewählt; ausdrückliches Opt-in wird in der Workspace-Suite geprüft. |

Ein weiteres Ergebnis der Gegenprüfung: Zertifikatsaussteller-Entscheidungen
dürfen nach einer Pause nicht am veränderlichen Ausgabetext/Anzeige-ID hängen.
Der Schlüssel bindet jetzt ausschließlich Quelldokument, Quellhash, vollständigen
Originaltexthash, Hypothesentyp und genaue Originalfundstelle/Originalfragment;
aktuelle Original-/Ausgabespans werden vor jeder Wiederverwendung geprüft.
Legitime Registry-bedingte Ausgabeverschiebung fragt nicht erneut, andere
Quelle/Fundstelle bleibt eine neue Entscheidung. Keine laufweite Aussteller-
Ausnahme und keine Originalwerte im Entscheidungsspeicher. Choice-Suite: 10 grün.

Rust-Nachweis: 108 Windows-Tests bestanden, 3 separat aufgerufene Kindhelfer
ignoriert; Clippy alle Targets mit Warnungen als Fehler grün. Native Node/Pipe/
Rustintegration einschließlich großem echten Trace grün. Das sind native
Dateisystem-/Prozessnachweise, keine Tauri-GUI- oder exakten Releasepakettests.
Der Windows-Codepfad wurde ausgeführt; macOS-Code wurde nur gelesen. Die
plattformübergreifende Korrektheit bleibt durch native Mac-Gegenproben zu belegen.

Best-Practice-Grundlage: Ein laufender blockierender Task wird durch Abbruch
des Wartens nicht rückgängig gemacht ([Tokio-Dokumentation](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html));
ein fallengelassener Threadhandle beendet seinen Thread nicht
([Rust-Standardbibliothek](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html)).
Wir übernehmen dieses Besitz-/Antwortfristprinzip in die vorhandene std-Thread-
Architektur, ohne Tokio allein dafür einzuführen. Timeout ist niemals Beweis
für „nichts geschrieben“. Harte Kernel-/Filtertreiberblockaden sind hier nicht
injiziert; dauerhaft blockiertes OS-I/O kann die sichere Beendigung weiterhin
verzögern. Konservatives Warten ist keine garantierte maximale Shutdownzeit.

Offen bleiben insbesondere die neun Roh-OCR-Abweichungen (keine neue
Qualitätsmessung aus diesen Workflowkorrekturen ableiten), die vollständige
native v2-Bedien-/Paketabnahme auf Windows/Mac Intel/Apple Silicon, zusätzliche
Abbruch-/Speicher-/Dateisystemgrenzen und die bereits im Backlog geführten
Migrationsrestpunkte. Das ältere r9-Archiv enthält diese Korrekturen nicht.
Die neuen tatsächlichen Pause-/Neustartgegenproben binden den TXT-
Reviewpublikationspfad, nicht sämtliche OCR-Konverter-/getrennten Workerlease-
Abbruchzeitpunkte. Grenzprüfungen und bereits vorhandene OCR-Flowtests ergänzen
diesen Nachweis, ersetzen diese noch ausstehenden Gegenproben aber nicht.

Der neue Quellscopedigest über dieselben 964 Git-gelisteten Dateien ist
`f145461d44ddef4a3d583b65f22eb42d8d69cefa323bf6c433570764e188fba6`.
Er wurde vor Beginn der abschließenden Gesamtsuite bestimmt; die obigen
ursprünglichen r9-Quell-/Paketdigests binden ihn nicht. Der vorherige neue
Gesamtlauf stoppte an einer überholten Strukturassertion für sofortiges
Sidecar-Entfernen. Diese Prüfung verlangt nun den besitzgebundenen
Bereinigungsabschluss; ebenso bindet die Linux-Workflow-Strukturprüfung den
aktuellen Sitzungs-Snapshot beim Schließen. Die drei Desktop-/Mac-/Linux-
Strukturprüfungen bestehen separat. Das ist kein nativer Mac-/Linux-Lauf.
Die vollständige Produktsuite wurde danach neu gestartet und endete mit
Exit 0: 217 Testdateien (96 Basis plus 121 direkte), einschließlich der neuen
Regressionen, echten Pause-/Neuprozessgegenproben und des großen Node-/Rustexports.
Der Digest ist vor, während und nach diesem abschließenden Lauf identisch.
Auch 108 Rusttests und strenges Windows-Clippy wurden erneut erfolgreich
ausgeführt. Der begrenzte unabhängige Nachreview fand in den geänderten
Frontend-, Verarbeitungs- und Rustpfaden keine weiteren konkreten Fehler;
dies ist keine Garantie für ungeprüfte Fehlerpfade oder offene Zielhosts.
Der lokale Windows-Releasebuild wurde erfolgreich kompiliert (Exit 0), ohne
Appstart. Das normale Gesamt-/Cowork-Paketgate bleibt separat rot:
`BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID` wegen nicht sauberem Quellarbeitsbaum;
aktuelles RC158-Cowork-Plugin-ZIP fehlt. Diese Herkunftssperre wurde nicht
umgangen und nichts veröffentlicht. Dokumentationsgates, Diffprüfung und
strenge installierte Claude-Pluginstrukturprüfung bestehen.
