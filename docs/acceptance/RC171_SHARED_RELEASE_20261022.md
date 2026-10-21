# RC171 – sicherer Teiltext für Windows und macOS

Expliziter Nutzerauftrag vom22.10.2026: unterbrochene Prüfungen abschließen und
neue Testversion Windows x64/macOS ARM64/Intel als GitHub-Pre-Release bereitstellen.
Windows-ZIP zusätzlich lokal mit Testplan. Anschließender ausdrücklicher
Nachtauftrag: Hauptagent prüft auch die gebundene eigene Windows-App nativ mit
synthetischen Daten. Menschliche Abnahme bleibt davon getrennt USER_PENDING.
RC170 und sämtliche früheren Pakete, Nutzerdateien, Profile und Evidenzen erhalten.

## Gemeinsamer Vertrag

DOCX/XLSX/PPTX/PDF bestmöglich lesen. Einzelne nicht unterstützte/defekte Bilder,
unabhängige beschädigte Parts/Seiten und lokale Ressourcenfehler dürfen vollständig
validierte sichere Abschnitte nicht pauschal verwerfen. Auslassungen ausdrücklich
melden; keine globale Reparaturgarantie oder leeren erfolgreichen Ergebnisse.
Originale und vorhandene PDF-Suchtexte unverändert; Teiltexte durchlaufen weiter
die normale Privacy-/Kontakt-/Nachbearbeitungs- und Veröffentlichungsbindung.
Globale Container-/Pfad-/Kontrollteil-/Quell-/Isolations-/Modell-/Protokollprüfungen
und ausdrücklicher Abbruch bleiben hart. Keine externen Referenzen laden/ausführen.
Keine neuen Codecs, Developer-ID, Apple-Einreichung/Notarisierung, Schlüssel-/
Zertifikatssuche oder OS-Schutzänderung. Vorhandene freigegebene statische Mac-Cores
aus39167676290/7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071 wiederverwenden.

## Abschlussreihenfolge

1. Gezielte Tests und unabhängige tatsächliche Produktionsquellengegenprüfung.
   Gemeinsame Version3.2.0-rc171, abschließenden Appcommit/Fingerprint einfrieren.
2. Frische Headless287-Dateien-Suite plus bisherige elf Zusatzgates; Windows
   Prepare/Clippy/Rust/Node-Rust/Release; tatsächliche isolierte Konverter/OCR;
   frisches ZIP und fünf Paketgates. Alle Inputs während Läufen unverändert.
3. Genau ein normaler Macconsumer target=both, keine neuen Coreproducer; beide
   echten nativen Logs/Core-/Guard-/IPC-/Seal-/Konverter-/App-/ZIP-/DMG-Belege
   sowie heruntergeladene Artefaktbytes unabhängig prüfen. Alle drei Plattformen
   aus demselben abschließenden Appcommit und Produktfingerprint.
4. Lokale create-only Übergabe unter Software DataSecure/RC171, neues Windows-ZIP,
   menschlicher Testplan, synthetische Testdaten, Prüfsummen und Paketbelege.
   Keine private Nutzer-PPTX/Diagnose/Ergebnisinhalte in Git oder Releaseassets.
   Zuvor neue Windows-Desktopkampagne ausschließlich mit exakt gebundenem eigenen
   Paket und isoliertem Profil. Kein paralleler Desktopzugriff, keine Anmeldung,
   Sicherheitsdialoge oder OS-Schutzänderungen. Gesperrten Desktop nicht umgehen;
   echte Beobachtungen und offene Fälle getrennt dokumentieren. Risikobasierter
   zusätzlicher Funktionsreview, keine ungefragten neuen Funktionen.
5. Neuer Tag und GitHub-Pre-Release; Assetinventar/Remotehashes/Tagsource/
   Prereleaseflag vor UND nach Veröffentlichung prüfen. Keine Mainintegration
   ohne gesonderten Auftrag und keine alten ZIPs umetikettieren.

## Vorhandene Vorabbelege – kein finaler Release-PASS

Source04 auf Basis1e40c2b8684d9b20b7f0ade4d446c42f0d6c1139 und
FPdf5dd5a67e74650b7608c42350bc9a60c4224b49cb43898e4081fad37f844bdf/339:
63Extractor-/13Partial-/38Checkpointfälle gezielt grün, unabhängige Gegenreviews
abgeschlossen. Original-PPTX61723Zeichen,61310native exakt erhalten, Original
bytegleich. Gesamt-/Windows-Nativjobs bei Nutzerabbruch noch unvollständig;
kein Headless-/Native-FINAL, keine Freigabe aus fehlenden Endbelegen ableiten.
Source01–04 und alle roten/unterbrochenen Belege bleiben unverändert erhalten.

Echte menschliche Windows-/Finder-/TCC-/M2-/Enterprise-/VoiceOver-/Officeabnahme
bleibt USER_PENDING; weder CI noch Quellenmodelle ersetzen diese Abnahme.

## Neuer bestätigter Gegenfix vor dem Freeze

Bild-only-PPTX konnte allein die generierte Foliennummer als Text behandeln.
Partial-only parser-eigene leere Folien-/Notiz-/Chart-/Layout-/Master-/Tabellen-
labels jetzt an tatsächlich leeren Rohwerten vor Rendering auslassen. Echte
überschriftenähnliche Quelltexte bleiben; bereits bewiesene textlose Besitzer
behalten getrennte Bild-/Einbettungsrechte, verwaiste Teile bekommen keine.
Legacydarstellung unverändert. Nicht-OCR-Officeworker verweigert leeres Resultat.
Autor:67Extractor/91Parser/32Bildrelevanz; Main tatsächliches Quellengegenlesen,
13Partial-/39Checkpointfälle grün. Neue echte37.Officegruppe trennt EMF-only,
leeres Raster und lesbaren Bildtext in beiden Profilen; nativer Endlauf offen.

## Source01-Endbefund und eng begrenzter Timeout-Gegenfix

App36eb64ef78581c1018ee390595bcd64201032968/FPf514cd54… war noch kein
geeigneter Releasefreeze. Windows-Native-FINAL PASS mit unveränderten Inputs:
Prepare/Clippy/280Rust(3ignoriert)/Node-Rust/Release. Native Konverterkampagne
dagegen ROT nach PDF30 und61Konverterfällen: frühe Timeoutprobe erhielt
CONVERSION_INPUT_INCOMPLETE statt CONVERSION_TIMEOUT. Office37 daher NOT_RUN.
Headless bewusst vor Quellenänderung gestoppt, kein vollständiges FINAL;
Macconsumer39684655804 gezielt abgebrochen, tatsächlich completed/cancelled.
Keine Source01-Pakete erzeugt, keine alten Belege rückwirkend umgeschrieben.

Neue echte Windows-Gegenprobe mit1MB synthetischer Eingabe und1ms Testtimeout
belegt timer.fire → kill → stdin.callback(EOF) → stdin.error(EOF) → close(SIGTERM).
Die konkrete Ursache der ursprünglichen kleinen fehlgeschlagenen Probe bleibt
unbewiesen; diese gleiche Fehlerklasse ist separat nativ reproduziert. Enger Fix:
nur EOF/EPIPE/ERR_STREAM_DESTROYED nach bereits angefordertem Timeout behalten
die Timeoutklassifikation. Keine erfundene Eingabeübergabe, kein vorgetäuschtes
Workerende, keine verlängerte Grace; unabhängige späte I/O-/Protokollfehler,
ausdrücklicher Abbruch und unbestätigte Terminierung bleiben hart.
Unabhängiger tatsächlicher Quellengegenreview und frische native Projektion
bestätigen jetzt die gleiche Sequenz mit CONVERSION_TIMEOUT; alle Kinder beendet.
42Checkpointfälle einschließlich neuer Reihenfolge-/Flush-/Harderror-Gegenfälle
bestanden. Separate Belege EARLY-TIMEOUT-LARGE-DIAGNOSIS.json und
EARLY-TIMEOUT-FIXED-PROOF.json unter ignoriertem Source01 erhalten.
Neuer gemeinsamer Source02-Commit und vollständig frische Endgates erforderlich.

Zusätzlicher unabhängiger tatsächlicher Funktionsreview: kein weiterer bestätigter
Partial-Deltablocker in Start/Fünferverlauf/Defaultziel/beiden Modi/OCR/Vertagen/
Neustart/Nachbearbeitung/Zuordnungsbeilagen. Frisch218Reviewfrontend/10Broker/
10persistenteEntscheidungen/20Companionfälle sowie echter Produktions-Fünfer-
und Startup-I/O-Test grün; kein Desktop-/Mac-/Paket-PASS daraus.
