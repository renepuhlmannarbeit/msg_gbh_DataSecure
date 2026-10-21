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

## Source02: Windows-Endgates grün, veralteter Mac-Testvertrag offen

Appa418483db7346fb16cd9928ad476addcf7aafec2,
FP21efd742db9b5b7621856b74fa5d1e506b375b1c28ab556898613428af5bd407/339.
WindowsNative alle5Rollen PASS, Konverter PDF30/67Worker/37Office PASS, Paket
alle5Gates einschließlich100Dateien-Korpus PASS, sämtliche Inputs unverändert.
ZIPc8b132f7f7ec4c722aacf09c806574a82e62b5b207172025c607142c3605c282;
EXEd726c86d5b1741ec433157b8dd77f6525f4b1973da85d51152e89c356ad42d5f.
Keine vollständige Headless-/Mac-/GUI-Abnahme oder geeigneter gemeinsamer Release.

ARM119522456612 imMacconsumer39686679125 ROT: tatsächlicher Stack
tests/lib/macos-cleanup-source-cases.cjs:54:10, aufgerufen durch
tests/test-standalone-macos-sandbox-workflow.js:235. Historische Regex verlangt
bedingungslosen stopped-Abbruch statt berechtigter bestätigter Teiltextübernahme.
Kein Produktcrash aus dieser Quelltextassertion belegt; spätere native App-/ZIP-/
DMG-Gates nicht gelaufen. Originaljoblog412431Bytes/SHA47c5920eeea19b41afa7971fbac6231f2b44864ce6cb3e6404ab3cae5b88e63b
lokal unverändert erhalten. Vor Teständerung Headless gezielt gestoppt, letztes
Testfile41/287, kein FINAL. Macrun tatsächlich completed/cancelled mit ARMfailure
und Intelcancelled bestätigt. Nur enger behavior-bound Testgegenfix vorgesehen,
keine Produkt-/Signier-/Deadline-/Schutzänderung. Neue Source03-Belege erforderlich.

Unabhängiger Handoffgegenreview: tatsächlicher Source02-Checkpoint hat alle7
korrektenPins, aber fehlendeSchlüssel wurden vom Übergabeleser nicht ausdrücklich
verweigert. Source03 schließt exakt diesen Schemagap mit Negativfällen; alte
Helper/FINALs bleiben erhalten. Kein aktueller falscher Artefaktbeleg nachgewiesen.

Neue synthetische GUIkampagne RC171-Desktop-Test-20261022-56a3e8d4 create-only
vorbereitet:19Fälle/89Eingaben, unabhängig gehasht und ohne Reparsepoints;
Originalgolden und Large-Archiv bytegleich. Alle Produktfälle NOT_RUN, Paketbindung
noch PENDING, keine alten RC164-Exportpflichten relabelt. Erzeugung kein PASS.

Enger Testgegenfix jetzt implementiert, ausschließlich
tests/lib/macos-cleanup-source-cases.cjs. Alte18BashCleanup-Gegenfälle und
awaitedOffice/PDF/OCR-Bindungen unverändert. Neue15Verhaltensfälle laden den
vollständigen hashgebundenen Produktions-Parent samt echten Checkpointvalidatoren;
nur OS-Start und Uhr sind doppelt. Autor und Main: MacWorkflow18+15 PASS;
42Checkpointfälle separat grün. Autoren-Gegenmutationen (historischerStopzweig,
erfundenerInputFlush, CancellationRecovery, ErfolgohneClose) tatsächlich verweigert.
Keine Produkt-/Mac-Signier-/Deadlineänderung, ProduktFP21efd742… bleibt gleich.
Dies sind Quellenmodelle, kein nativer Mac-Paket- oder Desktopnachweis.

Source03-Übergabehelfer ausschließlich create-only ausSource02 vorbereitet;
unabhängiger tatsächlicher Gegenreview bestätigt nun exakt7bekannteHelperpins
vor jederSchleife,78fehlende/zusätzliche/Typ/Syntax-Gegenfälle sowie7gültigeaber
falscheHashes verweigert. Konverter-/GUI-/Remote- und20Assets-Bindungen beibehalten.
Main frisch31Proofnegative/1positive+78PinRefusals/9KonverterRefusals/
4positive+33GUINegative/549statischeChecks/94Pflichtreceipts grün.
Unabhängiger tatsächlicher Testquellengegenreview ebenfalls abgeschlossen:
frisch15Parent/18Cleanupmodelle PASS und8reineInMemory-Gegenmutationen kausal
abgewiesen (früherErfolg, normaler/partiellerFlush, Cancel, Isolation, EIO,
Graceverlängerung, Protokoll). Alle eigenen Testprozesse beendet; weder dieser
Review noch die Modelle ersetzen native Macgates. Neue gemeinsame Appcommit-
Bindung und frische Endgates folgen; keine alten FINALs/Bytes neu etikettieren.
