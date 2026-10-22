# RC171 – sicherer Teiltext für Windows und macOS

Expliziter Nutzerauftrag vom22.10.2026: unterbrochene Prüfungen abschließen und
neue Testversion Windows x64/macOS ARM64/Intel als GitHub-Pre-Release bereitstellen.
Windows-ZIP zusätzlich lokal mit Testplan. Anschließender ausdrücklicher
Nachtauftrag: Hauptagent prüft auch die gebundene eigene Windows-App nativ mit
synthetischen Daten. Menschliche Abnahme bleibt davon getrennt USER_PENDING.
RC170 und sämtliche früheren Pakete, Nutzerdateien, Profile und Evidenzen erhalten.

## Quellenabschluss22.10.2026 02:18UTC vor Source07

Zwei reine Zusatztestkorrekturen fertig und unabhängig am tatsächlichen Delta
gegen Produktionsparser/Worker/CheckpointStream gegengelesen, kein bestätigter
Deltablocker. Main las beide Testdeltas und relevante Produktionsgrenzen selbst.
Lexical80Checks/10Protokollnegative/33echte isolierteWorker und Character492/
21Protokollnegative/157echteWorker PASS. Legacy bleibt strikt; ungültiger Hauptpart
bleibt konkreter Fehler, beschädigter Nebenpart nur ganz ausgelassen mit Hinweis
und erhaltenem unabhängigen Text. Nulltext kein Erfolg. Vollständiger /2-Stream,
kein recover()/Lastline, keine beliebigen zulässigen Codes. Umlaute/ß/Emoji/literale
Entitäten durch Positive geschützt. Keine Produkt-/Guard-/ACK-/Deadlineänderung.

Mainvorprüfung aller11Zusatzgates tatsächlich PASS/Inputs unverändert,
02:16:07.769–02:18:00.154UTC, einschließlich beider echter Workerrollen, vier
nativer Guard-/Integrations-/Epoch-/Pausegates, beider nativer Lease-/Admission-
Profile sowie drei Headless-Browserorakel. Dies ist gezielte Vorprüfung, keine
finale Gesamt-/Paket-/GUI-/Releaseabnahme. Beleg
 dist/rc171-supplemental-preflight-20261022/attempt-IdfAkg/RESULT.json.
Dateipins a0acece3e2a1967414aecd621ff627ad5714c2e2240ac93191c96ca841b685f7
und022846a8019ff63569be884628541e99860a68c7d32f2596f63e44acf1606629.
578Test-/Scriptinputs jetzt Manifestfdf1916a48578ac9864eff37cb27a52e030f733c6ec823b3db6a00842d762c2c;
Produktfingerprint unverändert1320d938f4976b0647b5db970252edf48d792793860bad956acf59dee5a6c29b/340.

Source07-Helfer allein create-only vorbereitet/Maingegenlesen: sieben Driver-
Deltas nur neuer Prefix/Zeilenenden, keine Schutz-/Nachweislockerung. Main31Proof-
negative/78Pin-/9Konverter-/33GUI-/2FAIL-Sperrnegative und629statischeChecks PASS.
Noch kein Source07-Freeze/Build/GUI-/Endgatenachweis. Jetzt gemeinsamer neuer
Commit/Push, beide frischen Macjobs, Freeze und sämtliche frischen lokalen Gates
an diesem Commit; neue Windowsbytes wirklich nativ prüfen. Source06roteFINALs
und alle alten Belege/Profile bleiben unverändert, kein Umetikettieren.


## Neuer Endstand22.10.2026 nach02:10UTC

Source06 bd5d255eb7bbe565b863f029a172d98505fd94d3 ist NICHT freigabefähig:
HEADLESS-FINAL tatsächlich ROT/inputs_unchanged:true,289/289 Haupttests und0/11
Zusatztests, Ende02:03:43.009UTC. EXTRA1 erwartet den alten DOCX-Strukturcode,
der neue Content-Options-Partialpfad verweigert ungültiges Haupt-XML bereits
präzise mit OOXML_XML_CHARACTER_INVALID. Tatsächlicher Read-only-Gegenreview
belegt zudem veraltete Nebenpart-/Nulltext- und /2-Transporterwartungen in genau
zwei Zusatztests. Enger reiner Testfix nach Ende aller Freezejobs beauftragt;
Legacy/Hauptteil-/Protokoll-/Isolationsschutz nicht lockern. Vor neuem gemeinsamen
Freeze alle elf Zusatzgates gezielt prüfen und tatsächliches Delta unabhängig
gegenlesen. Neue Source07-Helfer vorbereitet, noch kein Source07-Commit/Freeze.

Native298Rusttests(3ignoriert)/Clippy/Node-Rust/Release,Konverter30PDF/67Worker/
37Office und alle5Windows-Paketgates einschließlich100/100Markdown tatsächlich
PASS mit unveränderten Inputs. Macconsumer39705544455 auf genau bd5d255:
ARM119584646755 und Intel119584646742 beide SUCCESS. Noch keine finale unabhängige
Artefakt-/Releasefreigabe; rote Headless-Evidenz bleibt erhalten.

Echte gebundene Source06-GUI01 PASS und06 PASS:323.527s ungespeicherte Denkpause,
zwei normale Neustarts/gleiches Profil, unsaved verworfen/saved OCR erhalten,
neues Ergebnisziel, derselbe Lauf dcdfc612, Personenentscheidung und165BMD plus
alle3Vertraulich-Beilagen. Unabhängiger tatsächlicher Ordner-/Workbookgegenreview
bestätigt CSV-Dateinamen, TXT/XLSX-Zuordnungen/Vorkommen/Revision0/MD-Hash und
89/89Originalinputs bytegleich. Badge nach Abschluss korrekt leer.03nur Auto-
OCR-AUS-Teilfall bestanden(2MD+OCR-Auslassung,keine manuelle Freigabe,Ordnerlabels
auch zugeklappt);02/04/05/07–19 NOT_RUN. App normal geschlossen,Rootprozess0.
Keine alte GUI auf neue Commit-/Paketbytes übertragen. Historischer Source05-
Primärfehler weiterhin UNPROVEN; neuer GUI-PASS ist keine rückwirkende Ursache.

Gemeinsamer Produktfingerprint1320d938f4976b0647b5db970252edf48d792793860bad956acf59dee5a6c29b,
340Dateien; alte Source06-Testinputs578/Manifestc845ece7300cc5b047542fa456509e0fb61416d3cd2d7490deee637282e2155f.
Source06-ZIPcae5053dbf9dfb799776462ee37cbf1f981b9ed018765ddc617d28be387c808e,
EXE53027c4e8f514afe635da16f1951a024d921d5566c760210119f34c712cd6dd9.
Belege dist/rc171-partial-extraction-source06-20261022; nicht veröffentlichen.
Kein Tag/Pre-Release/lokaleRC171-Übergabe. Menschliche Windows-/Mac-/Excel-/
Numbers-/Finder-/TCC-/M2-/Enterprise-/VoiceOver-Abnahme USER_PENDING.

Ältere folgende Aktiv-/Vorbereitungsmeldungen sind historische Fortschritte;
dieser neue Endstand ersetzt widersprechende Angaben, keine alten FINALs ändern.


## Neuester Abschluss der Testgegenfixes vor Source05 (22.10.02:06)

### Neuer tatsächlicher Diagnose-/Konkurrenzcheckpoint (22.10.01:12UTC)

Quellenabschluss danach22.10.01:23UTC: beide begrenzten Gegenfixes fertig.
Unabhängige tatsächliche Produktionsgegenreviews ohne bestätigten Deltablocker,
Main las alle sechs geänderten Produktionsdateien. Backend fünf Pins stabil:
Mapping1855148bc109b40b62567dab3b6a490183ea22defc678e07ca9b14298c8b6d9a,
Reconciliation684d46884dea5a4c1f1c81fb9794f2d5c638cad09e1c8976ef936d869ed634c5,
Batch269b96b7ff83fdd171604ade8e05171a4df831389161ac7d008d28d6fa4ac9b7,
Item5ed1330cd276835a903317fd3eb6ec7a8165f1ff2425db437286470c61dcb097,
Reviewf58dc6780220fba8ad5d5b50607591e1dee88cb132ff1480b7a970d4328a2405.
Workspace6b1f657e1126d2b0e337530972e9a8c57056fd26a71a622bc23d585950f07532.
Autor62Mappingdiagnostik/26Item/17Review/15Reconciliation/37Contentfälle und
66Worker-Exportchecks grün; letzteres ausdrücklich source_adapter:true/native:false.
Main469Workspace grün; gezielter Mainquellenlauf zehn Gruppen PASS/Inputs unverändert
01:22:15.973–01:24:30.627UTC, Beleg dist/rc171-mapping-counterfix-main-20261022/RESULT.json.
578Inputs mit Manifestc845ece7300cc5b047542fa456509e0fb61416d3cd2d7490deee637282e2155f.
Neuer ProduktFP
1320d938f4976b0647b5db970252edf48d792793860bad956acf59dee5a6c29b/340.
Nur vorhandene idempotente synchrone Metadatenbestätigungen über bestehenden
Retryhelper awaiten, danach Intent/CSV/Finish jeweils einmal. Nach zweitem Await
Bindung/Ergebnisgrad frisch vergleichen. Beide Workerkompositionen verwenden
Async-Fassaden und awaiten Markierung/Intent/Commit vor Freigabe. Bestehende
synchrone Reconciliation/History-/Legacysemantik unverändert; rohe Action-/Close-/
Epochfehler nicht retryfähig gemacht. Mappingdiagnostics evaluiert Composition
und Exporte im VM statt normalem Batchimport/Profilinitialisierung. Keine neue
Deadline, Guard-/ACK-/Retrykatalog-/Schreibänderung, kein alter GUI-Ursachenclaim.
Nach Mainlauf neuer gemeinsamer Commit/Push und sämtliche frischen Source06-
Endgates einschließlich19echter Windows-GUI-Fälle; noch keine Releasefreigabe.

Lokaler Diagnosecommit525e9df0920d231ef0d60dd75a8f22f60c7bab07,
FP76b48d01ec33b22ef894e16089cba14ac551a99cf526e6247aac5195adcf9948/340,
gezielt gebaut/stabil. ZIPa3c4e16843e33ad6e50f5cca57f76393f28b8b4f722702a48ede0ad4b671f171,
EXE5bc2e7d563d3b5cfe8e19807899f403f1b5ec7458c60cfc5995cea2cf263c9dd.
Keine vollständige Regression/Releasefreigabe dieses Diagnosekandidaten.
Echte Main-GUI: Run3a21a04b212fd1fcd96488ee301c6be2c4790a79e4331ae486c7b9f105a3dace,
zwei normale Neustarts mit gleichem EXE/Profil, ungespeicherte OCR verworfen,
zwei OCR-Entscheidungen gespeichert, pausiert neues Ergebnisziel gewählt,
AnnaBerger als Person gespeichert. Tatsächlich165ByteMarkdown und Vertraulich/
Dateizuordnung.csv91B, Pseudonym-Zuordnung.txt976B, Pseudonym-Zuordnung.xlsx5296B
bereitgestellt und im echten Explorer geöffnet. Keine neue Fünfminutenpause;
deshalb kein voller GUI06-PASS. Profilf8b628f4040145a9bd72cbd08a6bb6cd erhalten,
App66716/Core71228 normal geschlossen01:08:31.829UTC, Rootprozess0,
89Originale bytegleich. RESULT-RECHECK/GUI-OBSERVATIONS unter
dist/rc171-mapping-diagnostic01-20261022. Historische Source05-Ursache UNPROVEN.

Unabhängige tatsächliche Windows-Native-Probe am unveränderten Diagnosepaket:
dist/rc171-native-mapping-contention-20261022-01/attempt02/FINAL.json PASS.
Eigener fremder logischer Controller mit echtem NativeOwner/2, PID-/Instanzprüfung
und CGuard; mutierender Prozess erwirbt eigenen Kernelguard, kein Lockkeeper.
commitPrivateMapping verweigert STANDALONE_BUSY in mapping_publication vor
Metadatenaction, kein CSV, Intent/Owner bytegleich. Nach echter Controllerfreigabe
und bestätigtem Childclose genau ein normaler Commit/CSVzeile, Intent danach weg,
Original unverändert; alle eigenen Kinder beendet. Das beweist einen separaten
Konkurrenzfehler, nicht den genauen verlorenen Source05-Primärfehler.
Enger Async-Gegenfix an ausschließlich idempotenten Metadatenreads läuft.
CSV/Intent/Finish werden nicht als Callback wiederholt, Sync-History/Recovery
bleiben unverändert. Keine Guard-/ACK-/Deadline-/Retrykataloglockerung.

Zusätzlicher echter GUI-Befund: Navigation behält nach einzigem fertigem Lauf
"1 offen". Autorfix trennt globale Countfrische von Tabellenrendercache, nutzt
nur bestätigte globale Readonlyantworten und invalidiert Busy/Connection/alte
Generationen neutral. Keine Zählerableitung aus einer gezielten Detailantwort,
kein Startupscan/Recoverywrite.469/469Workspacefälle inkl.11neue Gegenfälle PASS;
Main und unabhängiger tatsächlicher Gegenreview vor gemeinsamer Neubindung.

Neuer Diagnosequellenabschluss22.10.00:51UTC: ausschließlich beobachtende feste
Mappingphasen vor bestehender Fehlernormalisierung ergänzt, keine Retry-/Guard-/
ACK-/Schreib-/Recoveryentscheidung geändert. Identischer RAW-Weiterwurf auch vor
Intentnormalisierung; unabhängiger tatsächlicher Gegenreview samt behobenem
Vorgrenzengap abgeschlossen. Sender/Workflow/Application/Sidecar/Rust behalten
neun geschlossene Phasen und katalogisierte Codes, niemals Pfade/Inhalte/Stacks.
Autor26Beobachtungs-/Identitäts-/Sink-/Leakfälle,14Mapping/10Outbox/8Maintenance/
13Workflow/24Exportdiagnostik/37Contentfälle PASS. Main26+11Bridge+1Rustphasen+
18Pfadtrennung/18Cleanup+15Parentmodelle und realer ResultFolderExport PASS.
Mapping-/Outboxtests isolieren neue Diagnosewrites vor Imports auf synthetische
Roots; kein normaler Workflow-Diagnoseordner vorgefunden, nichts bereinigt.
Neue Source06-Helper nur vorbereitet, kein neuer gemeinsamer Freeze/Release.
Zunächst eigener frischer Windows-Diagnosekandidat, erneute native Reproduktion
und tatsächliche Primärfehlerbestimmung. Source05-GUI06 weiterhin ungeklärt;
diagnostische Ergänzung ist KEIN behaupteter Funktionsgegenfix/GUI-PASS.

Nachtrag tatsächlicher Endbefund Source05: alle Freezejobs beendet. Windows
Native298Rust/3ignored, Konverter30PDF/67Worker/37Office und5Paketgates/Korpus100
PASS/stabil. HeadlessROT221/288+0/11 an Test222: ein alter _test.activeDestination()
Aufruf ohne Record. Reiner Callerfix mit LEGACY_SCHEMA/complete:false, Autor
ResultFolderExportPASS+83InitialOutputPASS, Produkt unverändert; Maingegenlesen
noch erforderlich. Beide Macjobs39697486477 auf17d6bc1 SUCCESS. Keine Freigabe:
echte Windows-GUI06 scheitert nach gespeichertem OCR, zwei Vertagen/Neustarts,
neuem Resumeziel und Personenentscheidung im Mappingabschluss. LOCAL_REVIEW_FAILED,
privates Artefakt/exakter846ByteIntent vorhanden, keine CSV/öffentliche Ausgabe.
Zwei unabhängige tatsächliche Quellen-/Fixturegegenreviews bestätigen verlorenen
Primärfehler im Catch, keine bewiesene ACL-/Root-/Hashursache. Phasendiagnose und
kausale Gegenprobe/Fix erforderlich. GUI01Default2MD+OCRskip echt PASS;19Fälle
insgesamt nicht bestanden. App normal geschlossen,89Originale erneut bytegleich.
AGENT-GUI-EVIDENCE.json enthält wahrheitsgemäß01PASS/06FAIL/RestNOT_RUN.

Nach tatsächlichem Ende aller Source04-Jobs ausschließlich vier Testdateien
korrigiert, kein Produktdelta. Windows-CGuard-Fixture verwendet nun normalen
paketgebundenen Settingswriter, tatsächliche Settingsbytes/-digest, echte BigInt-
Objektidentitäten und unveränderten Receiptreader. Beide festen Kinder werden
ausschließlich neu unter dem bereits ownergeschützten synthetischen Parent
erstellt. Explizite Kennzeichnung TEST_OWNED_PRECONDITION und Tauri NOT_RUN;
Nativeflag1 und tatsächliche CGuard-/Lock-/Reopenprüfungen bleiben unverändert.
Separater voller Loaderlauf auf unveränderten Source04-Bytes Exit0: zwei echte
Markdown-Ausgaben, Guardverweigerung ohne mkdir, Readonly-Reopen ohne mkdir,
Originale unverändert und Cleanup bestätigt. Historisches PACKAGE-FINAL bleibt
ROT. Primärfehler der zweiten Phase jetzt separat und inhaltfrei; erfolglose
Fixtures bleiben erhalten. Beleg rc171-source04-native-loader-testfix-20261022.

Sidecarprüfung bildet nun Configure-SEQ1 → Initial-SEQ2 derselben Native-ID/Root
mit tatsächlichen Settings-/Verzeichnisidentitäten über echte Pipes ab, weiterhin
ausdrücklich emulierte native Antwort. Acht Protokollgegenfälle verweigert, kein
Receipt/Output danach. Vollständiger Sidecarlauf Exit0 einschließlich OCR,
Nachkorrektur/Neustart/automatischer Prüfung und exakten sechs Host-/Workergenerationen.
Windows-Direktcaller ohne Callbackcapability wird korrekt verweigert; Mac unverändert.

Unabhängiger tatsächlicher Vier-Dateien-Quellengegenreview ohne bestätigten
Deltablocker/Maskierungsfehler, Main las die tatsächlichen Änderungen. Main frisch
51/51 Lifecyclefälle,31Proofnegative/78Pins/9Konverter-/33GUI-Gegenfälle/
2GUI-Releaserefusals/629statischeChecks/101Macreceipts grün. Kein Tauri-/GUI-/Mac-
Paket-PASS daraus. ProduktFP unverändert3c71039392b0b80c845114cd94d6e672fcc04a84810958077c83acdd5ff300c4/340;
577Test-/Scriptinputs jetzt6d6123064f0742fab6abc1037acf15c9e4748352a08ebd1e15d4c8159fe2f4a9.
Source05-Helfer create-only vorbereitet und geprüft. Nächster Schritt: neuer
gemeinsamer Commit, beide Macconsumer und frische lokale Endgates, neues ZIP,
gebundene Windows-GUI. Keine alten FINALs oder Paketbytes umetikettieren.

## Historischer Source04-Endbefund (22.10.01:57)

Source04/a5d4cecafcd788bd08f921acf8d422b41e4bb74a,
FP3c71039392b0b80c845114cd94d6e672fcc04a84810958077c83acdd5ff300c4/340,
577Inputs/Manifest57a0455ae62fee9162acdd3f4c42883bcfebf1709e99c7e67aed7575cc17444f
ist noch NICHT freigabefähig. Native298Rust(3ignoriert)/NodeRust/Clippy/Release
und echte30PDF/67Worker/37Office PASS/stabil. Paket ROT/stabil an zweiter
Windows-CGuard-Testfixture ohne neue Initialquittung; erste Core-READY-/Ownership-/
Bootstrap-/Integritäts-/Shutdownprobe nachweislich erfolgreich. Kein Corecrash.
ZIP2e2f4a28064cabcb4bf6189904da9e72f95be65a326edf0abdc23b4d9adf145e,
EXE87c189915e547c97acfdbb286690e57993ff588a90090139d5f8e6bb704befbf.
Native FixtureDTZC2q und alle roten Belege erhalten. Echter Quellengegenreview
bestätigt fehlenden Testprefix, Produktionsverweigerung korrekt.

Headless natürlich ROT61/288+0/11/Inputs unverändert23:54:50.648UTC:
tests/test-standalone-sidecar.js:262 kennt die zweite Initialcallbackphase noch
nicht (actual prepare_initial_output_root, expected configure_export_root).
FixtureZn43oE erhalten. Kein älteres Grün als Gegenbeweis.
Mac39695475801 gezielt cancelled,01:57 tatsächlich completed/cancelled, beide
119551700081/119551700114 ebenfalls completed/cancelled. Alle lokalen Jobs beendet.
Erst danach Freeze für zwei eng begrenzte reine Testharnesskorrekturen freigegeben,
keine Produktions-/Signier-/Schutzänderung vorgesehen. Keine Source04-App gestartet.
Neue create-only Source05-Helfer und gemeinsamer neuer Appcommit/Endgates folgen.

## Neuester Arbeitsstand: initiale Windows-Bereitstellung korrigiert (22.10.01:37)

Der begrenzte Produktionsfix ist implementiert, noch nicht als neuer gemeinsamer
Release-Freeze abgenommen. Native Windows-Startvorbereitung erstellt ausschließlich
die festen fehlenden Ausgabecontainer mit geschützter DACL bereits beim exklusiven
Erstellen. Geschlossener Startauftrag, Settingsdigest, gehaltene Root-/Childobjekte,
private Identitätsquittung und erneute Kontrolle unmittelbar vor Intake bleiben
gebunden. Busy-/Abbruch-/verlorene-Antwort-Fälle starten keinen Worker. Mac-0700-
Pfad, alte Exportadmission und C-Guard/ABI bleiben unverändert; keine Bestands-
oder Eltern-ACL-Reparatur. Fertige öffentliche Arbeitskopien bleiben bearbeitbar.

Autor: 13 echte Windows-initial_output-Tests und Clippy PASS, darunter neuer
frischer synthetischer Elternordner mit fremdem Modify(0x1301bf): Rootidentität,
Owner-/DACL-Descriptorbytes und Settingsbytes vor/nach identisch, beide neu
erstellten Kinder Owner-only/geschützt und DTO-Identitäten passend. Das ist eine
native Rust-ACL-Probe, kein behaupteter C-Guard-/GUI-PASS. Acht bestehende
configured-Tests zuvor ebenfalls PASS. Unabhängiger tatsächlicher Rust-
Produktionsquellengegenreview ohne bestätigten Deltablocker. Main las auch den
zusätzlichen reinen Testgegenfall. Zwei unnötige Erweiterungen wurden vermieden:
kein Same-Volume-Zwang für den kopierenden Initialpfad und keine Erweiterung der
alten Exportadmission durch neue initial-only Settingsschemata.

Main-Gegenlauf dist/rc171-initial-output-targeted-main-20261022/RESULT.json:
15/15 gezielte JS-Gruppen PASS, inputs_unchanged:true, 23:24:07.938–23:27:36.580UTC,
darunter 46 Provisionierungsfälle, echter Source-Sidecar/OCR/Native-Integritäts-
und Mac-Workflowvertrag. Quellen vor Zusatz-Rusttest: FP26a0b69a…/340. Keine native
ACL-/GUI-/Releaseabnahme daraus. Beide 26erVokabulare identisch sortiert,
17MarkdownArtifact/6Neutral/13Partial PASS, Wirevalidator unverändert.

Neue create-only Source04-Helfer vorbereitet, noch ohne CHECKPOINT/FINAL/Paket.
Kanonischer Plan jetzt288+11, neuer Provisionierungstest auch im echten Macconsumer.
Main prüfte Helper31Negative/78Pins/9Konverter-/33GUI-Bindungen/2GUI-Release-
Refusals und612statische Checks/101Macreceipts PASS; keine Appabnahme daraus.
Nach abschließendem JS-Gegenreview: gemeinsamer neuer Commit/FP, neuer Macdispatch,
frische unveränderte Endgates und neue gebundene Windows-GUI; kein altes Grün kopieren.

### Weiterer bestätigter P2 vor Freeze: Wiederaufnahme und Zielwechsel

Der tatsächliche unabhängige JS-Gegenreview fand eine noch nicht geschlossene
Recovery-Lücke: Die erste neue Vorbereitung lief nur bei startAdmittedBatch.
Alte vertagte oder noch nicht veröffentlichte Läufe haben keine neue private
Initialquittung; continueHistoryBatch würde ihren Worker trotzdem starten und
die spätere Erstveröffentlichung mangels Quittung verweigern. configureResults
erzeugte bei Zielwechsel ebenfalls noch keine Initialquittung vor Replay.
Main hat beide produktiven Kausalpfade gegengelesen; kein Freeze/Build daraus.

Begrenzter Folgefix in Umsetzung: dieselbe native Vorprüfung vor ausdrücklich
autorisierter Wiederaufnahme, vor dauerhaftem pausiertem OCR-Skip, vor gezieltem
historischem Recovery-Versuch und nach gespeichertem Zielwechsel vor Replay.
Geschlossene Native-Outerrollen; configure muss erst bestätigte konfigurierte
Bindung(seq1), dann Initialquittung(seq2) derselben Session/Root vorweisen.
Keine allgemeine History-/Startup-Provisionierung, keine zusätzliche Renderer-
Dateiberechtigung. Bereits fertige Arbeitskopien und aktiver OCR-Skip ohne neuen
Worker benötigen keine neue Schreibquittung. Weitere gezielte Gegenfälle und
erneuter unabhängiger Produktionsquellengegenreview vor gemeinsamem Freeze.

### Recovery-Folgefix implementiert (22.10.01:44)

JavaScript-Autor: 83 Provisionierungs-/Recoveryfälle plus bestehende Kanal-,
Migration-, Service-, History-, Continuation- und Startupregressionen grün.
Native-Autor: 18initial_output/8configured und Clippy grün. Erfolgreiche echte
Configure→Initial-Sequenz und verweigerte Replay-/Root-/Fehlerfälle enthalten.
Windows-Completion zählt nur echte Initialbindung; dauerhafter Skip bleibt
Mutation, aktiver Skip dagegen kein neuer Worker. Native Produktionsdelta von
zweitem Experten unabhängig gelesen: kein bestätigter Deltablocker, Channelpin
16503611d64bd5538d5d46d746eb6eb1b078c366b9c2a5b17a19aa6ea9a9249f,
Mainpin48f86ed98046753438d9ed46df5c51c2d68ce1548e1a8ff4d86c253d6363d155.
Main las ebenfalls Rollen, native Sequenz/Completion und JS-Lifecycle/Collector.

Collector verwendet privaten Sentinel direkt hinter der tatsächlichen bestehenden
Recovery-Eligibility, vor Cooldown und Mutation: nur nötigenfalls nativ vorbereiten,
dann Eligibility frisch berechnen und Quittung unmittelbar vor Mutation prüfen.
Keine duplizierte Eligibility oder allgemeine History-Provisionierung. Private
One-use-Vorbereitung für pausierten OCR-Skip bleibt unter derselben Interaktion.
Unbeobachteter Produktionsresolver verweigert vor ensure/replay.

Separater Rootgegenreview bestätigt: Initialpublisher verwendet aktuelles Ziel,
aber ein bereits gebundener offener Plan darf dabei nicht heimlich neu gebunden
werden. Bei Zielwechsel bleibt er pending, bis ursprünglicher identischer Root
zurückgewählt ist. Fertige historische Ergebnisse behalten eigene Originalbindung;
keine Reparatur, kein Rebase und kein automatisches Schreiben ins alte Ziel.

Main-Gegenlauf zwölf Gruppen unter dist/rc171-recovery-review-20261022/RESULT.json
frisch PASS/inputs_unchanged:true, 23:43:14.889–23:44:21.526UTC. Exakter geprüfter
Produktfingerprint3c71039392b0b80c845114cd94d6e672fcc04a84810958077c83acdd5ff300c4,
340Produktdateien;577Test-/Scriptinputs,
Manifest57a0455ae62fee9162acdd3f4c42883bcfebf1709e99c7e67aed7575cc17444f.
Unabhängiger tatsächlicher JS-Produktionsgegenreview anschließend ohne bestätigten
Deltablocker, identische Pins zweimal gelesen. Main las das Delta ebenfalls selbst.
Main Source04-Helpertests nochmals31/78/9/33/2/612+101PASS; keine Appabnahme daraus.
Quellenabschluss jetzt geeignet für neuen gemeinsamen Commit und erst anschließend
neuen echten Macdispatch/Source04-Freeze. Vollständige Endgates und neue GUI offen.

## Historischer bestätigter Source03-Blocker

Source03/8871b4d8468a17b2cbbfe9f75c2f4ad8cd47d4be ist NICHT freigabefähig.
WindowsNative280Rust(3ignoriert)/Node-Rust/Clippy/Release, echte30PDF/67Konverter/
37Office und5Paketgates samt100MD-Korpus waren frisch PASS/inputsunverändert.
ZIPa33d57cd0f96f8496b07c54e506d051ff33a253b089aca66ebc8255afe24ade8,
EXEbc1c0a5205894d1b263adc5fda009cb98471b0843495d7595a3d68ab5a80cf26.
Die erste tatsächliche native Bedienprobe mit frisch unkonfiguriertem Profil
und3synthetischen Quellen erzeugt2interneMD und1korrektenOCR-Auslassungshinweis,
scheitert aber beim ersten sichtbaren Bereitstellen. Lauf1ab8363c… im erhaltenen
isolierten Root985959906d5e4934acb103e9c1448841: Bereitstellung offen,
STANDALONE_OWNERSHIP_STORAGE_UNSAFE/result_export_copy. Kein Retry oder öffentlicherMD.
Main allein bediente nach ComputerUseSkill; App normal geschlossen, keine eigenen
App-/Coreprozesse dieses Roots mehr; alle89Kampagneneingaben danach bytegleich.
Echte FAIL-Evidenz und19Fallstatus stehen in Source03/AGENT-GUI-EVIDENCE.json,
Details/Launchharnessabweichung in GUI-OBSERVATIONS.md/GUI-LAUNCH.json.

Zwei unabhängige tatsächliche Quellengegenanalysen bestätigen: Node-mkdir0700
erzeugt unter Windows keinen geschützten DACL. Der neue Ausgabecontainer erbt
zwei gewöhnliche fremde Modify-Prinzipale. Der Guard verweigert korrekt den noch
mutierenden Bereich; nicht die später bearbeitbare öffentliche Arbeitskopie.
Kein Longpath-/Konvertercrashbeleg. Enger Fix in Umsetzung: feste initiale
DataSecure-Markdown/DataSecure-Output-Container über vorhandenes handle-relatives
Rust-create_controlled_child mit geschütztem Descriptor bereits beim Erstellen
provisionieren. Gespeicherte Rootidentität/Settingsdigest vor/nach prüfen, echte
Root-/Childidentitäten bestätigen; Worker erst danach. Bestehende Ordner-/Eltern-
ACLs niemals reparieren, keine Guardlockerung, kein neuer Renderer-Dateiservice.
Keine Änderung des C-Guards/ABI oder neuen Mac-Coreproducer erforderlich.

Unabhängig beendete Source03-Gesamtsuite ROT um21.10.23:06:37.883UTC,
105/287+0/11, inputs_unchanged:true: test-markdown-artifact:96/97 verwendet die
gesamte26erVokabularliste, die nach Ergänzung unsortiert ist. Wirevalidator lehnt
korrekt ab; echte Erzeuger sortieren bereits. Beide Konstanten werden identisch
lexikografisch geordnet und gegen Unsortiertheit/Duplikate abgesichert; keine
Validatorlockerung. Alte rote Enddatei unverändert erhalten.

Alle lokalen Source03-Jobs beendet. Mac39688672064 nach bestätigtem Windows-
Produktblocker gezielt beendet: completed/cancelled, ARM119529136515success,
Intel119529136787cancelled. Kein gemeinsamer Mac-/Release-PASS daraus.
Erst danach wurde der Quellenfreeze für diese beiden begrenzten Korrekturen
freigegeben. Rust-/JS-Autoren arbeiten getrennt, keine parallele Desktopsteuerung.
Nach Gegenreview: neuer gemeinsamer Commit/FP, neue create-only Source04-Belege,
frische Gesamt-/Native-/Konverter-/Paket-/Macläufe und neue gebundene Windows-
GUI-Probe. Ältere Windows-/ARM-Artefakte niemals umetikettieren oder veröffentlichen.

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
2. Frische Headless288-Dateien-Suite plus bisherige elf Zusatzgates; Windows
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
