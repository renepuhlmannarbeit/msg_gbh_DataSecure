# RC164 – gemeinsamer Windows-/macOS-Teststand

Nutzerauftrag vom 18.10.2026: neuesten implementierten Featurestand als dieselbe
Version für Windows x64, macOS Apple Silicon und Intel bereitstellen. Die
frühere ungefähre Nummer139/140 wird nicht rückwärts übernommen: Quellversion
ist 3.2.0-rc164. Beide nativen Mac-Build-/Testjobs und deren private Runner-Minuten
sind ausdrücklich freigegeben. Nachfolgender ausdrücklicher Nachtauftrag erlaubt
Windows-Desktopabnahme durch den Hauptagenten mit gebundenem Kandidaten und
synthetischen Daten; M2-Anwendertest später. Bestehender Thread-Heartbeat wieder
ACTIVE alle30min. Aktueller Plan: RC164_NIGHT_REVIEW_AND_RELEASE_PLAN_20261018.md.
Keine Developer-ID, Apple-Einreichung oder Storeverteilung.

## Neuester geprüfter Windows-Quellstand, 19.10.2026

19.10.2026, nach 08:05 UTC: **Final10 wird vorbereitet, noch kein Release.**
Die beiden engen Korrekturen sind implementiert: P2-GUI-HISTORY-SUMMARY lädt
nach dem tatsächlichen Dokumentabschluss nur den gewählten Lauf und zeigt
ungeprüfte Freigaben/Exporte neutral. 369 Workspace-/98 Rendererfälle sowie
die erweiterte echte Headless-Browserprobe mit synthetischem IPC bestanden;
unabhängige tatsächliche Quellengegenreviews ohne neuen Deltablocker.
Die Browserprobe prüft einen Summaryread, 3/3 Belege, beide letzten Stufen
done und unverändert eine Kopie plus ACK. Kein nativer GUI-PASS daraus.

P2-TARGET-EXPORT-SNAPSHOT ist unabhängig mit echtem produktivem Child-Publisher
reproduziert: gültiger lstat(A)-rename(B)-open(B)-Fortschritt verursachte
HISTORY_UNAVAILABLE. Der unveränderte rote Gegenfall ist mit dem engen Fix grün.
Separater Snapshotleser: höchstens drei Gesamtversuche, nur intern bestätigter
Objektwechsel vor open, gleiche ursprüngliche Directorybindung; keine Retries
für Access/Close/Parent/Inplace/Postread-/Schema-/Owner-/Purposefehler.
Mutierendes readRecord ist durch Main bytegleich zu HEAD geprüft.
21 Negativ-/21 Bound-I/O-/21 Diagnosegegenfälle und gezielte History-/Workflow-
Pfade bestanden. Zwei unabhängige tatsächliche Produktionsgegenreviews sind
bei identischen Vor-/Nachpins ohne bestätigten Deltablocker abgeschlossen.
Vorläufiger gemeinsamer Produktfingerprint
cbd2175dc131e4edf63247a52dea8b9b4b2aae7355daf9388745312fa5f28b2d/332;
Test-/Scriptmanifest560/6dd2160ab46f50cb7a4545aedeb94c32f0a81fdfef735a820f18f8ce8e8b5e48.

Der ursprüngliche Intel-CI-Ursprung bleibt unbewiesen. Rein testseitige
geschlossene Diagnostik unterscheidet Locator/Journal/Anchor/Summary/Export,
max128 Records ohne Rohpfade/Inhalte/Frames und ohne zusätzliche Produktretry-
oder Timeoutfreigabe. Der ältere komplette Sidecarlauf mit
inputs_unchanged:false bleibt ungültig. Die drei neuen Gegenfallsuites sind im
kanonischen Runner und im tatsächlichen Mac-Consumer-Step registriert;17/17
Pfad-/Trackingfälle grün. Gemeinsamer neuer Commit/Freeze,279+10 Endgates,
Windows Native/Paket/alle10 GUI-Fälle sowie beide nativen Mac-Consumer sind
noch auszuführen. Final9/ältere Pakete und GUI-Belege bleiben historisch.
14/14 Kampagnenoriginale sind am19.10.07:50:53UTC erneut bytegleich geprüft.
Alle Quell-/Test-/Scriptarbeiten vor frischem Freeze abschließen.

19.10.2026, nach 07:39 UTC: **Final9 ist nicht freigabefähig.** Gemeinsamer
Commit 3b8a2fa402179d0c91c9300d9aa057835c9ac762 bestand unverändert
276/276 +10/10, Windows Native/Clippy/229 Rusttests (3 ignoriert) und fünf
Paketgates. ARM-Consumer117923939541 bestand native Start-/Core-/Worker-/ACL-/
Konverter-/ZIP-/DMG-Gates; dessen tatsächliche Artefakte wurden unabhängig
gegengelesen. Das ist weiterhin kein M2-/Finder-/TCC-/VoiceOver-Nachweis.

Die echte Windows-GUI zeigte nach korrekten 2/2 Freigaben und einem bestätigten
Zwei-Dateien-Export einen neuen P2: der direkte Rückweg zum Verlauf fordert die
batchgebundene Summary nicht an. Freigabe/Export werden daher irreführend als
noch offen dargestellt. Quellengegenreview bestätigt den Navigationsfehler;
enger Frontend-/Unbekanntstatusfix mit kausalen Gegenfällen in Arbeit. Keine
zusätzlichen alten Läufe oder Startabgleiche dafür einführen. GUI01/02/03/05
PASS,06 FAILED,04/07/08/09/10 NOT_RUN; kein GUI-FINAL. App normal geschlossen,
synthetische Daten und sämtliche Belege bleiben erhalten.

Intel-Versuch1 bestand alle nativen Gates und scheiterte ausschließlich beim
Artefakt-Upload an ENOTFOUND. Separater Versuch2, Job117938500233, scheiterte
dagegen bereits im Source-Sidecar-Test: HISTORY_UNAVAILABLE statt
RESULTS_MISSING während gezieltem Publikationslesen. Der erhaltene innere
Fehler ist noch nicht diagnostisch auf eine konkrete Leaf-/Schema-/ACL-Ursache
zurückführbar. Atomarer Exportplan-/Journalwechsel ist ein Quellenkandidat,
kein bewiesener Ursprung dieses Jobs. Geschlossene testseitige Diagnostik
zuerst ergänzen; keine pauschale Errorcode-/Retry-/Schutzlockerung. Zusätzlich
HOST_NOT_CLOSED ist ein sekundärer, ehrlich erhaltener Teardownbefund. Alle
Jobs sind beendet. Neue gemeinsame Pakete und frische Gates erst nach diesen
Korrekturen und Gegenreviews; ältere grüne Belege nicht umschreiben.

Neu19.10.nach06:29UTC: final8/b8a8f75 vollständig276/276+10/10 Headless,
Native/Clippy/229Rusttests (3ignoriert)/Release und fünf Paketgates PASS;
alle Inputs unverändert. Vollständiger kanonischer Windows-Paket-IPC-Smoke
zusätzlich PASS06:03:49.975UTC. Kein Final8-GUI-FINAL.
Intel-Macjob117911191174 in39206755546 tatsächlich SUCCESS06:19:05UTC:
echte App-/ZIP-/LaunchServices-Starts, Core/Worker/Guard/ACL, Office/PDF/OCR,
kanonische Fach-/Restart-/Exportabläufe und DMG-Gates. Heruntergeladene
ZIPf260197f…/DMG3e9fa445… samt Prüfsummen,1149 Manifestdateien, eingebettetem
b8a8-Commit und unveränderten approved Corebytes lokal gegengeprüft.
Das ist kein M2-/Finder-/TCC-/VoiceOver- oder gemeinsamer Release-PASS.

ARMjob117911191196 blieb ROT05:56:37UTC im Source-Content-Workflow.
ENOTEMPTY im finally kann eine frühere Szenarioexception verdeckt haben;
konkrete ursprüngliche ARM-Ursache bleibt unbekannt. Nach tatsächlichem Ende
aller Freezejobs enger Testharnessfix: Primärfehler einschließlich falsy-Werten
erhalten, alle Teardownfehler sammeln, keine Löschung bei Fehler. Tatsächliche
batch/review-Child-close-Beobachtung über alle Content-Hostgenerationen,
Drain vor Shutdown, Host-close und finaler exakter Census.31 kausale Modelle,
separate echte Windows-Node-3-Close-Integration und vollständiger tatsächlicher
Windows-Source-Sidecar-Lauf bestanden.45 Integritäts-/15 Paket-/16 Pfadfälle
gezielt grün; zwei unabhängige tatsächliche Observer-/Anschlussgegenreviews
ohne bestätigten Blocker. Keine fachlichen Orakel entfernt.

Im unveränderten kanonischen Paket-Smoke ist kein vollständiger reiner IPC-
Join autonomer Nachkommen verfügbar: synthetische Extraktion daher immer
behalten, Writerquieszenz ausdrücklich UNCONFIRMED, Löschung NOT_ATTEMPTED.
Keine Preload-Injektion in Produktpakete, keine Fake-Join-/Prozessbaumfreigabe.
Mac-Launcher-/Workflow-Cleanup nun ebenfalls an tatsächlichen Erfolg und
Endnachweise gebunden; Fehlerstatus/Belege erhalten, kein TERM/unboundedwait
im EXIT-Trap. Main wiederholt18 tatsächliche Bash-Quellmodelle, Workflow/Pfade
und Canonicaldocs grün. Zusätzlicher unabhängiger tatsächlicher Cleanup-
Quellengegenreview ohne bestätigten Blocker abgeschlossen. Kein nativer
Mac-PASS daraus. Produkt-/Apple-Schutz und
approved statische Cores bleiben unverändert. Neuer gemeinsamer Fingerprint
05adbca56284e248ac060b9988e29cdeba04e792cf370851847655f28e43fd3a/332
(Workflowdelta); Test-/Scriptinputs556/7d855d7e9acd3461a9b2af5f9e283bf6fe990f84d8a5e55795f10393acdb9d49.
Neuer gemeinsamer Final9-Commit
mit frischen Gesamt-/Native-/Paket-/beidenMac-/10GUI-/Übergabegates folgt erst
nach Abschlussgegenreview; rote ARM-Evidenz bleibt unverändert/offen.

Nach05:46UTC: final7/c32092b vollständig276/276+10/10, Native229/3ignoriert/
Clippy/Release und Paket5 unverändert PASS. Beide nativeMacjobs39203972091
bestanden App-/ZIP-/LaunchServices-/Office-/PDF-/OCR-Gates und Vierformatzählung,
dann ROT an veraltetem UI-Anzeigepfad im Paket-Smoke. Kein M2-/Finder-/TCC-PASS.
Nach Jobende vier positive Testziele auf tatsächliche explizite Start-Batch-
Resolver umgestellt; alle Inhalts-/Mapping-/Original-/Restartorakel erhalten,
negative CSV-Substitution und Rootwechsel explizit geprüft. OCR-Skip-Helfer
wartet nur bei RESULTS_MISSING innerhalb unveränderter Deadline. Quellenreview,
15Paket-/42Integritäts-/16Pfadfälle grün; keine Produkt-/Schutzänderung.
Windows-GUI05 aufc320: echte5minPause/zwei normale Neustarts, ungespeichertweg/
gespeichertbleibt PASS; neun Fälle NOT_RUN, kein GUI-FINAL. Final8 erhält
neuen gemeinsamen Git-/Paket-/Nachweisstand, keine alten Belege umetikettieren.

Nach05:19UTC: final6/b92 wegen manual_flatten im neuen Rust-Testgegenfall
ungeeignet. NativeROT und kontrolliert gecancelte Headless/Macjobs bleiben
unverändert erhalten; kein Paket/kein PASS daraus. Nach tatsächlichem Ende
aller Jobs minimale Testschleifenform korrigiert, MainClippyallTargets mit
-Dwarnings und17paralleleBundlefälle erneut PASS. Neues final7Freeze mit
identischem gemeinsamen Appstand je Plattform folgt erst nach Deltagegenreview.

Nach05:02UTC: final5/c29878e vollständig275/275+10/10, Native228/Clippy/
Release und Paket5 unverändert PASS. Beide Macconsumer39200265925 ROT:
Testroot-Kollision Intel und echter alter Parserroutingpfad ARM. Dagegen
echte ARM-App-/entpackteZIP-/LaunchServices-Startgates sowie gepackte
Office/PDF/OCR-Konvertierung bestanden; kein M2/Finder/TCC-Nachweis daraus.
Legacy ist noch gültiger Start-/Resumevertrag, daher sicherer Produkt-
Delegationsfix statt Testumschreibung. #[cfg(test)]-Sequenzfix gezielt17/17
parallel vom Autor und Main bestanden; native Macwiederholung noch offen.
Beide Coreapprovals bleiben gültig. Neue gemeinsame App-/Paket-/GUI-/Release-
Bindung nach Quellengegenreviews nötig, keine Übergabe des roten Schnitts.

Nach04:33UTC: final4 Headless ROT an obsoleter Desktopassertion69,68vorher
grün/unverändert; Native/fünfPaketgates grün. Beide Macjobs ROTgleicheAssertion.
Echter gebundener Windowsstart+Workspace/ReviewIPC PASS1539.567ms/Exit0,
kein10-GUI-PASS. Nach Jobende zwei Testverträge eng korrigiert, drei neue
Historytests explizit im Macworkflow gebunden. Gezielte37/39/Workflows/16Pfade
grün; unabhängiger actual-Deltareview ohne Restbefund abgeschlossen. Keine Fach-/
Runtime-/Core-/Schutzänderung, jedoch neuer Fingerprint e6401825… wegen
des explizit mitgebundenen Workflows. Noch kein Release.

Nach04:15UTC: unabhängiger Store- und nativer Harnessabschlussgegenreview
ohne weiteren bestätigten Produktionsbefund. Index21PASS/22(1Windows-NOT_RUN),
Migration21/21/echteIPC erneut grün; native Readiness39/39 sowie Workflow/Pfade
grün. Zwei Produktionsfixes: Fingerprint a55afd65f30f23e30409a41c4a032fdad7d14fa6635ebb1e0b59b1f8026e41ec.
Handoffproof-Rollen, aktuelle Testinputs und tatsächliche ZIP-EXE-Bytes werden
nun zusätzlich gebunden; unabhängiger Quellenabschlussreview ohne Restbefund abgeschlossen.
Frische275+10/Native/Paket/Mac/GUI/Releasegates bleiben danach Pflicht.

Neu nach03:45UTC: final3 af55717 vollständig272/272+10/10, Native228 und fünf
Paketgates unverändert grün. Danach zwei echte Historyraces korrigiert und
gezielt gegengeprüft: Index21PASS/22 mit einem ehrlichen Windows-NOT_RUN,
Migration21/21; Eltern-/Close-/Unsafe-/Budgetgrenzen erhalten. Test-only-
Fehlergrenzdiagnose mit tatsächlichen Quellengegenreviews und realer IPC grün.
Intel-App-Gate ROT wegen bestätigtem veraltetem Lognamen im Testharness;
ob daneben echte Startfehler bestehen, bleibt offen. Bounded session-/owner-
gebundene native Reader gerade in Abschlussprüfung. Kein neuer final4-Freeze,
keine vollständige neue GUI/Mac-/Releaseabnahme; Details im aktuellen Nachtplan.

Neu nach03:30UTC: af55717 /4a880940… Windows-Native und fünf Paketgates
unverändert grün, Headless noch aktiv. Macconsumer39193987747 ARM ROT in echtem
Verlaufs-IPC vor Fehlerinjektion; konkrete native Ursache noch unbewiesen.
Separat mit zwei echten Prozessen ein legitimes atomic-publish/read-Rennen des
Produktionsindex kausal reproduziert. Begrenzter Readfix erst nach laufendem
Freeze samt Gegenfällen/Gegenreview. Kein Schutzbypass und kein Core-Neubau.
Windows-GUI auf exakt gebundenem af55717-Paket nur Fall01 bestanden, übrige neun
NOT_RUN; App/Core normal beendet. Neues gemeinsames Paket nach Produktfix nötig,
keine Umdeutung alter FINALs oder Veröffentlichung des roten Consumerstands.

Neu nach03:13UTC: b772 vollständig272/272+10/10, Native228/Clippy/Release und
fünf Paketgates unverändert grün; beide Macconsumer desselben Schnitts ROT.
Danach zwei Darwin-Testverträge eng korrigiert, Produktionsfingerprint bleibt
4a880940…/332Dateien. Runtime-IO-Modell vollständig/stellt Hook wieder her;
obsolete positive dynamische Mac-Testfixture separat ausgeschlossen, vollständige
Quellworkflows erhalten. Zwei unabhängige tatsächliche Quellengegenreviews ohne
weiteren Blocker;78/78 und sechs Selektormodelle plus Source-Sidecar-Lifecycle,
16/16 Pfade/Canonicaldocs gezielt grün. Noch kein neuer Mac-/Finalpaket-/GUI-PASS.
Native positive Mac-Configure/Persistenz/Conflictfixture bleibt ausdrücklich
NOT_RUN, keine Gleichsetzung mit anderen Sealed-App-Gates. Neuer gemeinsamer
Commit und frische finale Gates sind vor Übergabe weiterhin erforderlich.

Neu02:50UTC: b772-Consumer39191630620 ARM ROT in vier IO-order-Testfällen;
ownership-control-Testdouble lässt Darwins assertNativeOwnershipRuntime aus.
Tatsächlicher Produktionspfad und unabhängiger Quellenreview bestätigen einen
TypeError vor IO, keinen bewiesenen Corefehler. Testdouble/Gegenfall nach Ende
laufender Freezejobs korrigieren, Produktionsschutz unverändert lassen.
Windows-Native228/Clippy/Release und fünf Paketgates dieses b772-Schnitts grün,
Headless noch aktiv. ZIP0aceca88…/EXE73d710c2… bleibt unveröffentlicht und ohne
neue GUI-Abnahme; Details/volle Hashes im aktuellen Nachtplan. Kein Release.

Neu nach02:42UTC: erster gemeinsamer Consumer39189276321 scheiterte auf beiden
Macs an einer ignorierten, nicht eingecheckten historischen JSON-Testquelle.
Kein Corecrash daraus; lokale272/272+10/10 und Native228 grün gelten nur für
den damaligen vorhandenen Entwicklercheckout. Frozen2731Bytes jetzt bytegleich
in tests/lib versioniert, require korrigiert und JSON-Ressourcenpfadschutz
erweitert;16/16+50/50 gezielte Fälle grün. Produktfingerprint4a880940… bleibt
unverändert. Unabhängiger tatsächlicher Quellengegenreview ohne weiteren
belegten Fehler abgeschlossen. Vor neuer gemeinsamer Git-/Paketfreigabe
erneuter kompletter Consumer-/Windows-/GUI-Lauf erforderlich. Keine alten
FINALs auf den nächsten Commit übertragen.

Neuer gemeinsamer Schnitt nach02:06UTC: Beide Coreproducer erfolgreich,
Intel zusätzlich von Main und zwei unabhängigen KI-Reviewern anhand echter
Compile-/finaler Link-/Binär-/ACL-/Sourcebelege geprüft. Ausschließlich die
kanonischen FINAL-Metadatenhashes97ee40f2… (ARM) und17450b40… (Intel) explizit
in die Policy aufgenommen. Dieser Schnitt ist für die neuen gemeinsamen
App-/Paketgates bestimmt, noch nicht als fertiger Release freigegeben.
Ältere Angaben „Producer läuft/Policy leer“ beschreiben frühere Checkpoints.

Neuer Mac-Zwischenstand01:13UTC: ARM-Coreproducer erfolgreich; tatsächlicher
Core4a15d677… und kanonischer Metadatenhash97ee40f2… importiert und anhand echter
Compiler-/finaler Link-/Binär-/ACL-Protokolle gegengelesen. Beide unabhängigen
Reviews: geeigneter Consumerkandidat, kein Aufnahmeblocker. Intelproducer
läuft; Policy bleibt bis gemeinsamem Intelreview leer. Native Produkt-
Consumer, gemeinsamer Appfreeze und endgültige Pakete sind weiter erforderlich.
Die nachfolgende Angabe „beide Producer laufen“ beschreibt den vorherigen Stand.

187e1602138d086596ac379f22504fa096b86233 / Fingerprint1730ad82… ist mit
272/272+10/10, Native228/3ignoriert/Clippy/Release und fünf Paketgates vollständig
unverändert geprüft (checkpoint06). Neues Windows-ZIPa55ebade… bleibt ein
unveröffentlichter Zwischenkandidat ohne neue GUI-Abnahme, kein gemeinsamer
Finalrelease. Die beiden Mac-Coreproducer39167676290 laufen weiterhin;
tatsächliche Artefaktapproval und nativer Consumer stehen aus. Vorherige
GUI-PREAPPROVALs dürfen nicht auf neue Bytes umetikettiert werden.

Zusätzliches portables Zehn-Fall-Testpaket vorbereitet:
DataSecure-3.2.0-rc164-Abnahmetests.zip, SHA256
4a8e352f8d1bd85b546eeaf044c9cd669afd55bfd9527e0d196586349032db40.
14 synthetische Eingaben bytegleich, nur Plan/Manifest/Anleitung und leere
Ergebnis-/Belegordner, keine alten Ergebnisse oder Diagnoseprotokolle.
Node-ZIP-Gegenprüfung und zusätzliche echte Windows-Entpackprobe bestanden.
Der ältere umfangreichere unveränderte Testbestand bleibt zusätzlich erhalten.
Ausführliche Bindungen im aktuellen Nachtplan und dist/rc164-desktop-testdata-20261019.

## Gemeinsamer Funktionsstand

Ausgangspunkt ist exakt der R8-Produktinputhash
a08125d25e89aa224559a2e0b4adf3710ea5c53a7202b1492f58f56e374dd62c
mit328 Dateien, vor Versionsschnitt und neuer Mac-Buildverkabelung. Enthalten
sind insbesondere das echte Fünfer-Verlaufsfenster, gezieltes Detail-Laden,
frühe Filterung ausgeblendeter/fehlender Einträge, verständlichere Abschluss-
und Exportnavigation, neuer leerer Dateientwurf nach konsumiertem Lauf,
Schnellweg und die mehrfach gegengeprüften Robustheits-/Datenschutzkorrekturen.
Historische R5–R8-Pakete/Evidenzen werden nicht verändert oder umbenannt.

## Mac-Quellenreview und tatsächliche Buildlücke

Der statische Guard gehört in denselben mutierenden Core-Prozess, nicht in
einen externen Lockkeeper. App/Core bleiben gehärtet; Core hat ausschließlich
allow-jit und benötigt kein dynamisch geladenes fremdsigniertes Guardmodul.
Der getrennte offizielle Node-Konverter bleibt ein anderer, hashgepinnter
Artefaktrollentyp mit seinen unveränderten Upstream-Entitlements. Dessen
disable-library-validation darf nicht als aktivierte Core-Library-Validation
ausgegeben werden. Keine Benutzer-Schutzrichtlinie wird abgeschaltet.

Bestätigter Verpackungsblocker vor dieser Runde: leere approved_artifacts-
Liste, kein nativer FINAL-CORE und keine Producer→Consumer-Übergabe. Ein
grüner Windows-/Quellenmodelltest kann diesen Mac-Nachweis nicht ersetzen.

Neue zweistufige Kette:

1. Manueller, kostenbestätigter nativer Producer auf macOS15 ARM64 und Intel;
   exakt gebundener Gitcommit, Node22.23.2-Sourcearchiv/Originalinterpreter,
   Python3.13, Apple-Xcode-Toolchain. Neuer privater Buildordner unter /opt,
   keine Änderung vorhandener ACLs, Rechte oder Sicherheitseinstellungen.
2. Statische Quelltransformation, Configure-/Compilevertrag, Corekompilierung,
   lokale ad-hoc-Härtung und explizite Core-/Konverterproben. Vier abgeschlossene
   Consumerdateien in geschlossenem USTAR, getrennte tatsächliche Buildlogs.
   Das Erzeugen eines Kandidaten ist ausdrücklich noch keine Freigabe.
3. Unabhängige Sichtung tatsächlicher Compiler-/Linkbefehle und Provenienz;
   erst danach explizite kanonische FINAL-CORE-Hashfreigabe je Architektur im
   Quellcode. Keine Approval aus selbst gemeldeter adjacent evidence.
4. Consumer lädt nur den exakten Run/Commit/Target und importiert genau vier
   reguläre Dateien. Bestehender Verifier bindet Sourcepins, Corebytes,
   Provenienz, separates offizielles Konverterartefakt und Entitlements vor
   Cargo. Core nach diesem Schritt nicht neu signieren oder verändern.
5. Full-native Static-Core-Gate mit CLI/--require, fork/IPC, Worker, Guard und
   Fehlerfällen, danach App-/ZIP-/DMG-/Konvertierungs-/Startgates. Windows wird
   ebenfalls vom abschließenden gemeinsamen Quellcommit neu gebaut.

Der Producer behauptet derzeit bewusst kein bestätigtes Ende jeder Compiler-
Prozessgruppe. Diese Provenienz bleibt false; Exit+Close des direkten Kindes
ist kein vollständiger Prozessbaumbeweis. Kein Mock wird als native Abnahme
oder als grüne Finder-/Gatekeeper-/M2-Anwenderprüfung ausgegeben.

## Noch zu binden

Native Vorläufe 39154063265/39154325186 stoppten vor Kompilierung mit
BOUND_FILE_UNSAFE. Feste Phasendiagnose isolierte /usr/bin/make. Run39154532657
belegt reguläre Rootdatei0755, drei Root0755-Ancestors, nlink78. Das ist ein
System-Shim, kein beschädigter privater Input. Separater build-only Leser für
geschlossene /usr/bin-Toolrollen misst read-only die tatsächliche Datei mit
O_NOFOLLOW/O_NONBLOCK, vollständiger FD-/Namens-/Zeit-/Linkzahlbindung und
einmaligem Close; kein zurückgegebenes Rewrite-Token.35 Gegenfälle grün.
Allgemeiner Producer-/Produktleser bleibt nlink1. Hash des Shims ist keine
atomare Exec-Bindung oder vollständige ACL-Attestierung der Toolchain; bekannte
Vertrauensannahme über die unveränderliche Runner-Systemnamespace bleibt.
Fehlversuche bleiben erhalten und werden nicht als Buildnachweis gezählt.

Der nächste native Vorlauf erkannte drei UTF-8-Testfixturen des unveränderten,
hashgepinnnten Node-Sourcearchivs als angeblich unsichere Namen: BSD-tar gibt
unter LC_ALL=C Nicht-ASCII-Zeichen als literale Oktal-Backslashfolgen aus.
Nur die beiden lesenden Mitglieder-/Typauflistungen erhalten jetzt explizit
en_US.UTF-8. Keine Backslashdekodierung, keine Namespace-Ausnahme; echte
Backslashes, Traversal, absolute und fremde Archiveinträge bleiben verboten.
Run39155465781 aus a172b8a23bd7973228ad8d95f2ef5da42b5ba4cb ist der
darauf gestartete gemeinsame native Producer, zunächst noch ohne PASS.

## Rechte-/Restriktionsreview nach Nutzerfrage

Zwei unabhängig beauftragte KI-Quellenreviews (Rust/TCC/Start und Node/Worker/
Datenspeicher), anschließend direktes Gegenlesen der Produktionsaufrufe.
Das sind KI-Prüfrollen, keine zertifizierten Fachpersonen oder Zielhostabnahme.
Keine Systemrechte, ACLs, Schutzrichtlinien oder Benutzerdateien verändert.

Der make-Befund ist **keine verweigerte macOS-Berechtigung** und gehört nicht
zur installierten App. Der CI-Producer wollte ein ausführbares Systemwerkzeug
lesen/messen; unsere nlink1-Annahme war falsch. Root als Dateieigentümer
bedeutet nicht, dass nur Root sie lesen oder ausführen darf. Xcode-shims unter
/usr/bin sind von Apple dokumentiert. Signaturidentität und POSIX-/TCC-Rechte
sind verschiedene Mechanismen. Developer-ID gewährt keinen Documents-Zugriff.

| Produktionszugriff | Zeitpunkt / tatsächliche Anforderung | Grenze und Fehlerverhalten |
| --- | --- | --- |
| App-Bundle, Core und Ressourcen lesen; Core ausführen | Bereits vor Ready; normale Lese-/Such-/Ausführungsrechte, passende Architektur und gültiges lokales Seal | Kein Schreiben ins Bundle, kein sudo. Gatekeeper, Hardened Runtime und Endpoint-Richtlinien können separat verweigern; Exit/Signal und begrenzte Startproben werden protokolliert. |
| Eigener privater Datenbereich unter ~/Library/Application Support/SecureDataMsg-Standalone | Vor Ready; Benutzerrechte, lokales APFS/HFS, sichere Eigentümer-/ACL-/Namespaceverhältnisse | Das sind zusätzliche eigene Integritätsanforderungen, keine mit Developer-ID erlangbaren Rechte. Ungeeignete Netzwerk-/Shared-/ACL-Speicher werden vorsichtshalber abgewiesen, nicht automatisch umberechtigt. |
| Gespeicherte aktuelle und reservierte historische Ergebniswurzeln | Aktive Ziele vor Ready frisch kanonisieren; retirierte Reservierungen nur als negative Namespacegrenzen aus validierten Metadaten vergleichen | Retirierte verweigerte Altziele werden nicht erneut angefasst. Ein aktiv konfiguriertes verweigertes Ziel bleibt gesperrt: Alias-/Junction-Überlappung darf nicht übersprungen werden. Exakte neue Klasse STANDALONE_RESULT_ROOT_ACCESS_DENIED nur bei tatsächlichem EACCES/EPERM; keine behauptete TCC-Ursache. Ein fehlender neuer Standardordner allein verhindert Ready nicht. |
| Standardziel Documents/SecureDataMsg | Pfad beim Start nur berechnet; Anlegen erst beim ausdrücklichen Verarbeitungsstart | TCC/Files-and-Folders möglich. Fehler STANDALONE_RESULT_ROOT_UNAVAILABLE; kein pauschaler Vollzugriff, Adminmodus oder Zertifikat als Reparatur. |
| Dateien/Ordner auswählen und Quellen lesen | Nach Benutzeraktion; native rfd/macOS-Panel, danach gebundene Quellenaufnahme | Normaler Standalone-Auswahlweg benötigt weder Terminal.app noch AppleScript. Auswahl allein überstimmt keine POSIX-/ACL- oder Organisationssperre; SOURCE_ACCESS_DENIED bleibt explizit. |
| Ergebnisse/Exporte schreiben | Nach Auftrag; lokales Ziel, gebundene Verzeichnisidentität, für atomare Bereitstellung gleiches Volume | AI_EXPORT_VOLUME_MISMATCH ist eine eigene Transaktionsgrenze, keine behauptete Apple-Rechteverweigerung. Originale, interne Zuordnungen und Prüfstände werden nicht pauschal weitergegeben. |
| Prozessidentität über /bin/ps | Lease-Übernahme, ggf. Recovery; eigene Prozesse abfragen, kein Shellaufruf | Prozesssperren oder Toolfehler können den Lauf verhindern. Neue feste PROCESS_IDENTITY_*-Diagnose für verweigert/fehlend/Timeout/ungültig/sonstiger Fehler; Observer bleiben null/unknown. Kein PID-only-Fallback. |
| Worker, Konverter, Supervisor und Canvas-Addon | Gebündelte separate Executables; feste Pfade, unterschiedliche Rollen | Eine nur gesperrte Terminal-App ist nicht dasselbe wie ein Verbot dieser Prozesse. Organisationsrichtlinien können Executables verweigern. Core enthält Guard statisch und nur allow-jit; offizieller Konverter behält offen dokumentierte Upstream-Entitlements. |
| Finder-Öffnen und Diagnose | /usr/bin/open nur nach Auftrag; frühe Diagnose best-effort im Benutzer-Tempbereich | Keine Desktop-/Accessibility-/Screen-Recording-Berechtigung angefordert. Diagnoseausfall darf keinen Verarbeitungserfolg erfinden und keinen fremden Inhalt protokollieren. |

**Neue bestätigte Fehler aus dieser Runde:** (1) Prozesszuordnungsfehler gingen
als INTERNAL_FAILURE beziehungsweise beim äußeren Resume-/Reviewstart als
generischer Startfehler verloren; geschlossene Ursache wird durchgereicht.
(2) Früher Intakefehler konnte in Standalone noch den externen osascript-
Noticeweg erreichen; abgelehntes Promise war unbehandelt und konnte Node
beenden. Standalone muss auch dort ausschließlich seinen In-App-Fehlerstatus
verwenden; der verbleibende Pluginpresenter muss sein Promise behandeln.
(3) Frühe Rootverweigerung verlor vor dem gemeinsamen Bootstrap ihre feste
Speicherklasse; Desktopmapping wird vereinheitlicht, nicht die Prüfung entfernt.
(4) Verweigerte Rust-Dateizugriffe wurden vor Core-Bindung als fehlende
Komponente beziehungsweise in der Probe als beschädigte Bytes ausgegeben.
Die tatsächliche Tauri-Ressourcenauflösung bleibt dieselbe; nur die feste
IO-Ursache bleibt jetzt vor deren UnknownPath-Abbildung erhalten. Nach
PermissionDenied kein weiterer Core-/Debug-Fallback; Bind/Probe/Spawn bewahren
die feste Klasse. (5) Ein vor dem ersten Journal gestoppter Intake war trotz
In-App-Notice ohne sichtbare Fehlerkarte. Ein prozesslokaler, exakt an Versuch
und Token gebundener Beleg bleibt nach Workerende und Notice-Timeout sichtbar;
er erfindet weder Historyabschluss noch Wiederaufnahme-/Ergebnis-/Exportrechte.
ACK erst nach zwei Renderframes der weiterhin passenden sichtbaren Karte.
(6) Unabhängiger Gegenreview fand danach das noch nicht angepasste native
Admission-Gate. Neue Auswahl ist für start_failed nur bei exaktem Fehlercode
und explizitem worker_active=false erlaubt; unbekannt/fehlend/anders typisiert
bleibt gesperrt. Der Service prüft die Aktivität bei Admission nochmals.

Quellengegenreviews durch getrennte KI-Aufträge für Rust/Bündelrechte sowie
Service→Executor→UI→native Admission; beide Korrekturwege wurden danach erneut
direkt gegengelesen. Ein weiterer Quellencheck des privaten Mac-Datenbereichs
bestätigt: Root-Ancestors werden nur gelesen, normales Home-deny-delete-ACL
ist zulässig; keine unerfüllbare Admin-/Systemschreibvoraussetzung im geprüften
gewöhnlichen lokalen Profil. Netzwerk-/umgeleitete Homes bleiben gesondert.
Die JIT-Dokumentation trennt nun Rust-UI, statischen Produkt-Core und den
offiziellen Konverter einschließlich dessen Upstream-LV-Ausnahme ausdrücklich.

Erster unveränderter gezielter Entwicklungsnachweis:21/21 Testdateien unter
dist/rc164-permission-review-20261018, Quellen4e5d2d09…; kein Mac-/GUI-PASS.
Dieser Nachweis liegt vor dem zusätzlichen Admission-/Dokumentationsgegenfix.
Der breitere parallel gestartete CI-Entwicklungslauf unter
dist/rc164-permission-regression-20261018 ist nach diesem neuen Gegenbefund
kein finaler Quellenfreeze: Änderungen werden nicht versteckt, sein Vor-/Nach-
Fingerprint macht sie kenntlich. Der Lauf endete um19:45:44UTC mit207/207
grünen Einzeldateien und Prozessstatus0; der umgebende Nachweis verweigert
korrekt passed=true, weil Quelle/Gitcommit während der Gegenfixrunde wechselten
(inputs_unchanged=false, Driverexit1). Nicht als neuer unveränderter Vollnachweis
zählen. Gezielter Folgelauf wurde separat unter
dist/rc164-permission-review-final2-20261018 gebunden:21/21 bestanden, unveränderte
Inputs, Commit2a6d4670aa4873f59526272629d84cb3a2f9717e,
Produktfingerprint18597ed43c4a1afbb98a2e0a66514697d73f4e6367d28ac4f2e67f4381c7cb3d.
Das sind gezielte Entwicklungsnachweise, kein fertiger Pre-Release. Voller
gemeinsamer Quellen-/Paketnachweis erst nach tatsächlicher Mac-Core-Approval.
Nach dem Admissiongegenfix: Windows-Rust216 bestanden,0 fehlgeschlagen,
3 ausdrücklich ignorierte Subprozess-Checkpoints; Release-Clippy all-targets
mit -D warnings bestanden. Das Darwin-Modul, Unix-Linkgegenfall sowie native
TCC-/Finder-/M2-Fälle sind dadurch nicht ausgeführt oder abgenommen.

**Offene reale Mac-Gates:** frisches Benutzerprofil ohne Ergebnisordner,
Documents-Zustimmung und Ablehnung, entzogener gespeicherter Ergebniszugriff,
normales Home-ACL, Unternehmensprofil, Finder/ZIP/DMG samt Quarantäne und
native Core-/Konverter-Ladekette. Kein Rechtefehler ist für den ursprünglichen
M2-RC161-Trap bewiesen: dort endete der Core vor Ready mit SIGTRAP, nicht mit
einem belegten EACCES/EPERM. Ein fehlender erster Ergebnisordner erklärt diesen
Befund nicht aus dem geprüften Ablauf. macOS kann die konkrete TCC-/ES-Quelle
nicht zuverlässig aus einem allgemeinen Fehlercode allein offenlegen.

Zusätzliche, nicht als bewiesener Defekt ausgegebene Architekturgrenze:
batch/review werden durch background-role-launcher.js autonom/detached
gestartet. Apple weist auf mögliche TCC-Attributionsbrüche beim Daemonisieren
von Helfern hin. Daraus folgt nicht, dass unser setsid/fork-Weg tatsächlich
betroffen ist; der bisherige M2-Trap liegt davor. Der native GUI-Test muss
die Zuordnung App→Core→Worker bei Zustimmung/Ablehnung auf frischem Profil
und nach Testbuildwechsel prüfen. Nicht ungeprüft detached entfernen und
damit die bestätigten Worker-/Recovery-/IPC-Verträge brechen. Ad-hoc-Code
kann bei Versionswechseln wiederholt TCC-Prompts auslösen; fehlende Developer-ID
ist deshalb für Identitätskontinuität relevant, aber kein allgemeines Verbot
normaler Dateizugriffe. Keine automatische TCC-Manipulation oder Vollzugriff.

Primärabgleich: [Apple On File System Permissions](https://developer.apple.com/forums/thread/678819),
[Files and Folders](https://support.apple.com/guide/mac-help/control-access-to-files-and-folders-on-mac-mchld5a35146/mac),
[Gatekeeper](https://support.apple.com/en-us/102445),
[Xcode-Shims](https://developer.apple.com/library/archive/technotes/tn2339/_index.html),
[Hardened Runtime vs App Sandbox](https://developer.apple.com/documentation/Xcode/preparing-your-app-for-distribution),
[Node22 unbehandelte Promise-Rejections](https://nodejs.org/download/release/v22.23.2/docs/api/cli.html#--unhandled-rejectionsmode).
Keine allgemeine Empfehlung, Vollzugriff zu erteilen oder Schutzfunktionen
auszuschalten. Ad-hoc-Sealing bleibt lokale Codeintegrität, keine Apple-
Developer-ID-/Notarisierungsfreigabe und keine Zusage für jeden verwalteten Mac.

Vor Dispatch nochmals am Quellcode gegengeprüft und korrigiert: nativer
Gateaufruf benötigt einen absoluten kanonischen App-Pfad. Der Standard-ARM-
Runner hat7GB RAM; die alte pauschale8GiB-Abweisung war damit unerfüllbar.
Node22.23.2 empfiehlt8GB für vier parallele Compiler und nennt Reduzierung
der Jobzahl als Gegenmaßnahme. Neuer im Producer selbst erzwungener Vertrag:
unter6GiB kein Build,6–unter8GiB nur ein Compiler, darüber1–4. ARM seriell,
Intel drei Jobs; tatsächlicher Speicher-/Buildnachweis weiterhin native Pflicht.
Keine größere Runnerklasse, kein Swap-/OS-Tuning, keine Schutzlockerung.
126 Producer-Quellenmodelle,52 Importgegenfälle,24 native Gate-Quellenmodelle,
Workflow-/Fingerprint-/Dokumentationsverträge grün. Das sind keine Mac-PASS.

Producer-Run-IDs, tatsächliche Architekturergebnisse, geprüfte Approvalhashes,
finaler gemeinsamer Gitcommit/Produktfingerprint, Windows-/Mac-Pakethashes,
native Gateergebnisse und Pre-Release-URL werden nach tatsächlichem Abschluss
ergänzt. Bis dahin ist RC164 Entwicklung, kein abgenommener Download.

Primärquellen für den Review: [Node22.23.2 BUILDING](https://github.com/nodejs/node/blob/v22.23.2/BUILDING.md),
[GitHub Runnerimages](https://github.com/actions/runner-images),
[Apple Library Validation](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation).
Ad-hoc-Sealing ist keine externe Apple-Signierung; Erstöffnungswarnungen und
Unternehmensrichtlinien bleiben ohne Developer-ID mögliche Zielhostgrenzen.
