# RC175 – chartEx als gespeichertes semantisches Diagrammmodell

## Auftrag und Grenzen

24.10.2026 ausdrücklich beauftragt: chartEx für Windows x64, macOS ARM64 und
Intel ergänzen, technische Schutzprüfungen beibehalten, mit unabhängigen
Fachreviews revalidieren und frisch testen. Danach gemeinsamer neuer RC175-
Test-Pre-Release; Windows zusätzlich lokal mit Testplan. Desktoptests durch
den Nutzer (USER_PENDING), kein agentischer GUI-PASS. Keine Mainintegration.
RC174/ältere Pakete, Nutzerläufe, Originale und sämtliche Evidenzen bleiben.

Der eigene JavaScriptleser braucht keine Officeinstallation, neue Renderer,
Cloud, Developer-ID oder Notarisierung. Bereits geprüfte statische Maccores
bleiben unverändert; kein Applekonto/Schlüssel-/Zertifikatssuchen, keine
OS-/Rechte-/Schutzänderung. Adhoc-Sealing und tatsächliche native CI bleiben
getrennt von menschlicher Finder/TCC/M2/Enterprise/VoiceOver/Officeabnahme.

## Fachmodell und Quellen

Gepinnte Microsoft-Primärquelle: Open-XML-SDK Commit
`431ab05cf160248cc3885a4a766026d4f8243792`, MIT. Keine Übernahme fremden
Implementierungscodes oder unlizenzierter Beispieldateien; eigener Parser und
aus dem Schema abgeleitete, ausdrücklich synthetische OPC-Gegenfälle.

- [ChartEx Part / exakte Beziehung und MIME](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/5d0d453e-adac-43be-a797-59b9916593dd)
- [Offizielle Typdefinitionen](https://github.com/dotnet/Open-XML-SDK/blob/431ab05cf160248cc3885a4a766026d4f8243792/data/schemas/schemas_microsoft_com_office_drawing_2014_chartex.json)
- [Daten-ID](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/b895f5cf-d6a5-4fc1-b566-7b594b2a4e60)
- [Serien / Layoutbezug](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/86df19ea-8e94-49fc-9160-377c1b40b985)
- [Aktueller ChartSpace einschließlich Dashboardgrenze](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/416e664f-c6f6-4ed9-914b-4eaaa20724dd)

Reale referenzierte Word-Story/Folie/Blatt/Drawing → ausgewählter GraphicFrame
mit cx:chart@r:id → exakt interne chartEx-Beziehung/MIME → chartSpace →
Serie/dataId@val → data@id → Dimension/Ebene/pt@idx. Keine Autorität allein
durch Dateinamen, lokale XMLnamen, benachbarte Titel oder ZIP-/XMLreihenfolge.
Auch SDK extendedCharts/chartN.xml wird berücksichtigt, nicht nur chartExN.xml.

Acht bekannte Layoutkennungen werden mit tatsächlichen gespeicherten Daten
ausgegeben: boxWhisker, clusteredColumn (auch Histogrammparameter), funnel,
paretoLine, regionMap, sunburst, treemap, waterfall. Keine visuelle Geometrie,
Bins, Quartile, kumulierten Summen oder Karten werden neu berechnet. Numerische
Rohwerte und gespeicherte Formate bleiben getrennt; kein geratenes Datumssystem.
Alle gespeicherten Kategorien-/Wert-/X-/Y-/Größen-/Farb-/Geokennungskanäle und
Hierarchieebenen bleiben getrennt und indexgebunden. Keine Auffüllung fehlender
Eltern, Nullwerte oder Formel-/Workbook-/Geodatenauflösung. Wörtliche xsd:string-
Texte bleiben erhalten; Excel-ST_Xstring wird nicht auf chartEx angewandt.

## Umsetzung und Endprüfplan

1. Eigener begrenzter Reader/Renderer; namespace-/owner-/MIME-/MCbindung in
   DOCX/PPTX/XLSX inklusive Chartsheets. Aktive Inhalte bleiben gesperrt,
   externe Quellen ungelesen. Exakt gebundene passive Stile dürfen vorliegen;
   interne chartEx-Arbeitsmappen werden nur im Teilmodus als opake ungelesene
   Abhängigkeit quarantänisiert, nicht automatisch als Blattquelle ausgegeben.
   Andere Einbettungs-/VBA-/OLE-/Template-/Quellfehler behalten ihren Schutzpfad.
2. Tatsächliche sensible Cachelevelnamen/Achsenrollen bleiben echte Feldkontexte
   im bestehenden Privacy-/Residual-/Keep-/Tracepfad. Kein Fake-Personenheader,
   keine generierte Null/Fehltext-Personenzuordnung, keine Engineausnahme.
3. Fehlende/unerreichte/unmodellierte Daten als Teilabdeckung, invalides Modell
   atomar auslassen, sicheren unabhängigen Text erhalten. Bestehende XML/ZIP,
   Objekt-/Prozess-/I/O-/Ressourcen-/Residualgrenzen nicht abschalten.
4. Neuer kanonischer Source-Test und tatsächlicher Macstep; zusätzliche echte
   isolierte Konverterfälle für alle drei Officefamilien/beide Markdownmodi.
5. Begrenzte fremde Primärquellen-/Produktionsquellengegenreviews. Bestätigte
   neue Befunde kausal korrigieren; ältere Grüns widerlegen diese nicht.
6. RC175-Version, gemeinsamer Appcommit/Fingerprint und sieben Driver einfrieren;
   während aller lokalen/Macjobs keine Produkt-/Test-/Script-/HEADänderung.
7. Frische Gesamt-/Rust-/Native-/Konverter-/Paketgates, SourceSnapshot; beide
   Macconsumer am selben Appcommit. Ganze Logs und reale ZIP/DMG-/Core-/
   Konverter-/Arch-/Seal-/Quell-/Hashbindungen unabhängig lesen.
8. Geeignete Belege erlauben lokale create-only Übergabe RC175 und neuen
   GitHub-Test-Pre-Release. Inventar/Hashes/Tagquelle/Prereleaseflag vor und
   nach Publikation tatsächlich prüfen. USER_PENDING bleibt explizit.

## Aktueller Stand / Journal

Entwicklung, noch keine RC175-Endabnahme oder Pakete. Keine aktiven alten
GitHubjobs/Tests beim Start; HEAD8e1f29c ist ausschließlich RC174-Abschlussdocs.
Neue Helfer unter dist/rc175-chartex-source01-20261024 sind vorbereitet, kein
alter FINAL/Commit/GUIbeleg wurde als neu übernommen. Erster neue Testharness-
Pfad-/Markdownescapefehler eng korrigiert, ohne Schutzlockerung. Frühe Quelle
74 neue chartEx-Fälle und unveränderte116 klassische Chartfälle PASS, kein
Ersatz für den späteren eingefrorenen Gesamtlauf. Separater Primärquellenreview
bestätigt zusätzlich SDKzielpfad und xsd:string-Literalität; vor Freeze korrigiert.

Weitere unabhängige tatsächliche Gegenfälle vor Freeze: eine gebundene sensible
Achse ohne Skalierungsrolle konnte Rohwerte unter neutralen Headern belassen;
ein 351-KB-Modell mit4096 langen Cacheheaderspalten konnte vor der Prüfung einen
untypisierten String-RangeError auslösen. Eng korrigiert: reale unaufgelöste
Achsenpflicht konservativ generisch schützen, escaped Fragmente vor jedem Join
budgetieren, Feldklassifikation cachen. Keine Änderungen an Engine/Residual/
Keep/Trace oder Grenzerhöhung. Exakte neue Endpunkt-/Breitengegenfälle nun Teil
der106 gezielten Quelltests; noch kein vollständiger eingefrorener Endnachweis.

Bei chartEx im konventionellen charts/chartN.xml konnten außerdem alte Classic-
PPT-Ausnahmen die neuen partial-only/exakten Stylebedingungen überlagern.
Diese Legacyausnahmen schließen jetzt explizit chartEx-gebundene Owner aus;
normale Classicowner bleiben unverändert. Eigene neue Harness-Mutationsfehler
bei Buffer/XMLumbenennung eng korrigiert, keine Produktprüfungen gelockert.
Vorläufiger eigener Windows-NativeOffice-/MDlauf52Gruppen erfolgreich; während
Entwicklung geänderte Selektoren bedeuten: kein eingefrorener Paketnachweis.
Aktuelle Dokument-/Versionsverträge30/30 und Sync geprüft, kein GUI-PASS.

Zusätzliche Main-Endpunktprobe zeigte vor Freeze einen zweiten sensiblen
Zuordnungsunterfall: derselbe Cache-Datenobjektkanal konnte in einer weiteren
Serie unter neutralem Achsentitel erneut erscheinen. Pflicht wird nun nur über
dieselbe bewiesene Datenobjekt-/Dimensionidentität erhalten, niemals global
über gleiche Textwerte oder benachbarte Daten-IDs. Gezielte reale48Privacy-/
Keepketten und unabhängiger kausaler Gegenreview gehören zur Abschlussprüfung.
Quellumfang zuletzt119Fälle, zusätzlicher NativeOffice-/MDlauf55/55 inklusive
chartEx mit je2OCR-Bildern/Positions- und Kontaktmaskierungsbelegen; ebenfalls
Vorabstand, kein Ersatz für die neuen eingefrorenen gemeinsamen Endgates.

Alle bestätigten neuen Modell-/Integrationsbefunde vor Freeze unabhängig an den
tatsächlichen Korrekturen nachgeprüft: SharedData24Original-/24umgekehrte
Endpunkte, zweiteFundstelleKeepverweigerung und unveränderte Zahlen; vorherige
Nullrollen-/Langheadergegenfälle sowie9Zusatzkontrollen weiterhin korrekt.
Modellpin5b499025cdc520d767b158c4b0e36e25278abcc38bccbc3c1cfa27ebdbe36576,
OPCpin74684cb5f326bdfe7b725ba58f6c950dbec5398b39847eb9d4cc27d419798c1d.
Keine verbleibenden bestätigten Blocker im begrenzten Source-Delta; dies ist
keine Gesamt-/Desktop-/Paketfreigabe. Helfer-/Syntax-/Negativprüfungen sind
getrennte Hilfsnachweise, keine Produktausführung. Nächster Schritt: gemeinsamer
Commit/Freeze und sämtliche neuen tatsächlichen lokalen/Mac-Endgates.

Offen bleiben derzeit vollständige neue Endgates, native Macartefakte, lokale
Übergabe und Veröffentlichung. Unbekannte Dashboards, externe Workbooks,
Statistik-/Georendering und aktive Inhalte sind keine Universalzusage.

### Erster gemeinsamer Source01-Endlauf – ausdrücklich nicht freigabefähig

Appcommit d4d5372abcc373e710d9e1ce6f9e0381b348978e, FP123ee4958064cdcc923ac7c4a180728eda2a7f60bbe9012af1ca579d5d70095d/358,
601Test-/Scriptinputs/9c115d6d…6fea. Windows Native/300Rust+3ignored/
Clippy/Node-Rust/Release, fünf native Konvertersuiten (38PDF/71Worker/55Office/
43Grafik/21passivePDF) und fünf Paketgates/100MD0Fehler PASS/stabileInputs.
Neues unveröffentlichtes Windows-ZIP113456357Bytes/SHAab75e7d5261da7cfeaa0070c2949391d232a82f42a9a1aa4b2f0e378c25728d5,
EXE051df04e5e5c3a1b761da58e99f2a6db3ffac47b3532234723f7906e8d8aa97e.
Tatsächlicher Windowsarchiv-Gegenreview ohne bestätigten Bindungsblocker.

Beide Macconsumer40076404431SUCCESS am selben Commit: ARM120820578718
08:34:22UTC, Intel120820578661 08:42:02UTC; echte Archive separat gesammelt
und jeweils einmal verifiziert. ARM-Ganzlogreview vollständig gelesen, kein
bestätigter neuer Logblocker. Intel-Ganzlogreview ausdrücklich unvollständig
(Kapazitätsstörung, später nur1–650/7743Zeilen); kein erfundener Review-PASS.
Diese Artefakte und alle alten FINAL/VERIFYs bleiben unverändert historisch.

Headless tatsächlich **ROT** am24.10.2026 08:56UTC, Exit1 und
inputs_unchanged=true:205/307Programme,0/11Zusatzgates, Test206/test-parsers.js
63PASS/28FAIL. Ursache unabhängig bestätigt: neuer bedingungsloser strikter
Content-Type-Lookup in augmentEmbedded verdrängt bestehende geschlossene
Legacy-/Direktparser-Warnverträge selbst ohne auswählbare Einbettung. Kein
Beweis für Mac-Corecrash, aber echter fehlender Gesamtregressionsnachweis.
Kein SourceSnapshot, lokalerRC175-Ordner, Tag oder Release erzeugt.

### Enge Nachkorrektur und zusätzlicher Zielreview vor Source02

Einbettungskandidaten werden zunächst unverändert über tatsächliche erreichte
Owner/Beziehungen geprüft. Nur wenn ein Kind tatsächlich Appendautorität
erlangen könnte, wird ContentTypes strikt benötigt. ChartEx bleibt anhand
exaktem MIME **oder tatsächlicher chartSpace/CX-Wurzel** quarantänisiert, auch
bei klassischer vorgetäuschter Rolle/MIME; echte Classic-Owner bleiben möglich.
Retained- und private Textlessowner, alle Rekursions-/Byte-/Dokumentbudgets,
Quelladmission und Privacy-/Residual-/Trace-/Keepregeln unverändert. Kein
allgemeines try/catch oder pauschales MissingCT→leereAutoritätsmap.

Unabhängige Diagnose39RAM-Beobachtungen verwarf beide unsicheren Einzeiler;
Rohreview SHA7d48391e9f3f0c323235a6e22f5a077e4bf52da8b12ead634f5c57259af04561.
Main Originalparser91/91 unverändert und erweiterte130chartEx-Fälle PASS.
Neue eigene Harnessfehler eng korrigiert: Legacy-MissingRoot erhält Body plus
geschlossenen Warnstatus, nicht automatisch leeren Body; OPCcode und bestehender
inhaltsfreier Extraktionswrapper sind verschiedene Codes; malformedCT kann
schon vorher als PPTX_STRUCTURE_UNSAFE verweigert werden. Keine Produktprüfung
für diese falschen neuen Assertions gelockert. Neue11Regressionsfälle binden
genau die Legacy-/Orphan-/MIME-/Payload-/CThard-/Classicpositiv-Konstellationen.
Unabhängige tatsächliche Fixnachprüfung sowie diagnostischer kanonischer Tail
ab206 laufen noch; kein endgültiger neuer Gesamt-/Paket-/Mac-PASS daraus.

Zusätzlich ausdrücklich beauftragter breiter Ziel-/Internet-/GitHub-Gapreview
in [GOAL_COVERAGE_REVIEW_20261024.md](GOAL_COVERAGE_REVIEW_20261024.md) dokumentiert;
Main-PDF-/Grafikreview plus unabhängiger vollständiger Office-Gapreview gelesen.
Größere Renderer/Folgefeatures sind Backlog, keine ungeprüfte neue RC175-Runtime.
Nach abgeschlossener Korrektur neuer gemeinsamer Appcommit/FP und frische
Source02-Endgates erforderlich; Source01-Macgrün/ZIP nicht umetikettieren.

Tatsächlicher Fixgegenreview fand einen weiteren P2 im neuen Nachpass:
zwei erreichte Diagrammowner teilen einen Workbooktarget; nach Ausschluss des
ersten Owners konnte ein zunächst wegen Duplikat unbeachteter tatsächlicher
chartEx-Owner Appendautorität erlangen. Direkter Legacyparser hängt dann das
unselektierte Workbook an; eine blockierende Warnung bleibt. Keine erfolgreiche
öffentliche Privacy-Freigabe bewiesen, aber echter zu schließender Quarantäne-
Grenzfall. Rohreview FIX-RECHECK.md SHA1a8a86cb…bfe samt40RAM-Gruppen erhalten.
Vorbehebung/Tailgrün darf diesen Befund nicht widerlegen. Nächste Korrektur:
alle bereits begrenzten Kandidatenowner vor einmaliger Neuberechnung prüfen,
nicht nur erste überlebende Targets; symmetrisches echtes Classicpositiv halten.

Source02-Helfervorbereitung separat create-only: Main las den wörtlichen Diff
aller16MJS plusPlan, Syntax aller16,147Quellbindungen und alle synthetischen
Proofnegativen PASS. Dies erzeugte keinen neuen Freeze/FINAL/Paket-/GUIbeleg.
Unabhängiger Dokumentgegencheck des Main-Zielreviews vollständig gelesen, kein
bestätigter sachlicher Blocker; keine Erweiterung der Produkt-/Mac-Abdeckung.

Diagnostischer Tail tatsächlich beendet am24.10.11:20:36.307UTC, Exit1 und
inputs_unchanged=true,49/102Programme erfolgreich. Primärfehler Test255/
test-content-graph.js:268: echter alter ausgewählter Word→DOCX-Containerketten-
Direktreader besitzt kein CT und wird noch zu früh abgewiesen. Originaltest
und alle REDbelege unverändert. Kein bloßer transienter Fehler und kein Grund,
moderne OPC-Admisson zu lockern. Gemeinsame enge Korrekturrichtung mit offenem
Owner-Wiederzulassungsbefund wird unabhängig an tatsächlichen Quellen geprüft.

Gemeinsame Korrektur inzwischen implementiert, noch kein neuer Releasefreeze:
alle bereits begrenzten candidateEdges-Owner vor genau einer Neuberechnung
klassifizieren; vorhandenes CT bleibt strikt, fehlendes CT ausschließlich im
alten Direktreader ohne preserveText/contentMode/partialExtraction tolerieren.
Eine leere Map erteilt keine positive Autorität; exaktes Override-MIME oder
tatsächliche chartEx-Root sperren unabhängig. Default-CT führt keine neue
chartEx-Admisson ein. Unveränderte öffentliche OPC-/Extractorgrenzen geprüft.
Unabhängige RAM-Diagnose16Gruppen/SHA cf2a4c98…5171 vollständig gelesen;
dies war eine Hypothese, die tatsächlichen Fixgegenreviews laufen separat.

Main frische acht gezielte Quellsuiten unter
dist/rc175-chartex-fix-final-20261024 PASS/Exit0/inputs_unchanged=true,
24.10.11:28:42.957UTC:133chartEx/116Classic/91Originalparser/18OriginalGraph/
27OPC/18Teilkonvertierung/30Dokumentverträge und Versionssync. Produkt-FP dieses
Vorabstands5eaddabb199b075e9133d5561f5055989db952ae329269dbb3f9675a2cc4bc3e.
Neue14permanente Fälle einschließlich beider Sharedtargetrichtungen und
NoCT-Direkt-vs-Moderneintritt; Originalparser/Graph/OPC/Extractor bytegleich.
Kein Gesamt-/Native-/Paket-/Mac-/Desktop-PASS aus diesen Vorabprüfungen.

Beide abschließenden tatsächlichen Produktionsdelta-Gegenreviews vollständig
von Main gelesen, ohne bestätigten verbleibenden Deltablocker. Erster22eigene
Gruppen PASS/Pin7bd9de34…297df, Bericht8280107f…531a; zweiter6frische eigene
Gruppen PASS/gleicherPin, Bericht636a347d…ec4b. Zweiter eigener erster roter
Harnesslauf forderte eine nicht autoritative Warnanzahl für echten klassischen
Legacy-PPTX-Kindtext; ausschließlich diese Zusatzassertion entfernt, komplette
sechs Gruppen frisch wiederholt, Fehlerbeleg erhalten. Keine Produktlockerung
und keine fremden Autorenfälle als unabhängig ausgeführt gezählt.
Nächster Stand wird eigener gemeinsamer Source02-Appcommit mit allen neuen
Endgates/Artefakten; alte Source01-Belege bleiben unverändert rot bzw. historisch.

### Abschließender Source02-Freeze und tatsächliche Veröffentlichung

Gemeinsamer App-/Tagcommit `223a04f54bc4fcfb2a95f12807685ed764ec6f0c`,
FP `5eaddabb199b075e9133d5561f5055989db952ae329269dbb3f9675a2cc4bc3e`/358,
601Test-/Scriptinputs/Manifest456617b938a0510c7816853df97c029b67bf82054bda41aeb8e8dde7bfc67298.
Sieben Driver vor Start eingefroren, sämtliche neuen Endgates bei unveränderten
Produkt-/Test-/Script-/HEAD-/Driverinputs. Keine Source01-FINALs übernommen.

Vier lokale Endgates regulär Exit0, alle PASS/inputs_unchanged=true:

- Headless307/307 plus11/11Zusatzgates, alle318Steps Status0, Ende24.10.12:47:51.885UTC.
- Prepare/Clippy/300Rust+3ignored/echteNode-Rust-Integration/Release,11:42:26.219UTC.
- Tatsächliche native Konverter38PDF/71Worker+0skip/55Office/43Grafik/21passivePDF,11:45:34.754UTC.
- Fünf Paketgates einschließlich100/100Markdown mit0Fehlern und unveränderten Originalen,11:46:59.653UTC.

SourceSnapshot danach genau einmal erzeugt12:48:17.198UTC,995Dateien/8936873Bytes,
SHAe70f5548bc788f2f768d76b1641b5e3e0a566fa891863f7845fd4b4516791661,
alle Archivbytes geprüft. WINDOWS-BUILD-COMMIT.json bindet tatsächliche neue EXE
an literalen vollen Appcommit/FP und exakte PDF.js-/Graphicsderivation.

Neues WindowsZIP113456746Bytes,
SHA15762f62e846a456552d98589b98cc6c3f5698618b60ba79a155b5e50c2bb3b4;
EXE5388800Bytes/SHA239eb95db8e3622816e509f9f2b756a2ee01b6fdcdbba92ab37c2e1c74f1fdfc.
Canonicalevidenz dist/rc175-chartex-source02-20261024, neues Paket ausschließlich
dist/engineering-rc175-chartex-source02-20261024. Alte ZIPs/Belege bleiben erhalten.

Macconsumer40090612106 exakt am gemeinsamen Appcommit beideSUCCESS:
ARM12086234689112:04:19UTC, Intel12086234690312:15:42UTC. Beide nativeCI je
133chartEx/116Classic/58Math/55MathSource/20MathIntegration/21passivePDF,
38PDF/69Worker+2Windows-SKIPs/55Office/43Grafik/283Rust+3ignored. Beide Artefakte
create-only gesammelt und je einmal aktuelles verify-macos-review Exit0/oktrue;
keine Macbytes auf Windows ausgeführt. Coreproducer39167676290/7d0ee31d…7071
und eigene statische Core-/separate offizielle Converterrollen unverändert.

Tatsächliche Macarchive:

- ARM ZIP118805393Bytes/SHA4c1167f57094109084bf1f4e0cdb5cc16172c9de1821fadd1b9f6ecafce8009e;
  DMG132765954Bytes/SHA0767cf1bcf51bb8a3717947a6a64ae0876fe86c27df278ba31c3759c31c22b44.
- Intel ZIP122061015Bytes/SHA4f600dc3538581124d032f4b450cc7cda76a71d547f3afe355a963c8c9eeae39;
  DMG136817347Bytes/SHA43daf0e5b196301c365766f7caa19cfbd2c3d59d3b634b19a177a6abec9e4188.

Main las alle tatsächlichen neuen unabhängigen Gegenreviews vollständig:
Windowsarchivbericht e1c7b3ec…d958c (1175Dateien/358Produkt-/601Testinputs),
ARM-Ganzlog7804725a…1db5 (7740Zeilen), Intel-Ganzlogd95e63dd…05d3
(7789Records/exakteLogfassung separat), BothMacbytebericht4b0c6f3e…ec646
(je1178Einträge/250Commonmodule/48Policykomponenten/904Konverterdateien/
5ThinMachO/Seals-/Rollen-/Architekturbezüge). Kein bestätigter neuer Bindungs-
oder Logblocker; keine universelle Audit-/Signier-/Desktopfreigabe daraus.

Lokale Nutzerübergabe nach Check-only genau einmal create-only erzeugt:
C:\Users\arkud\Documents\Software DataSecure\RC175, USER-TEST-HANDOFF12:49:27.538UTC,
19Dateien mit neuemWindowsZIP, aktuellem19Fall-Testplan/chartEx-/A–F-/Tabellenproben,
Prüfsummen/Proofs und3unveränderten synthetischen Testarchiven. Kopierbytes und
Inventar tatsächlich nachgeprüft. Kein alter lokalerRC175-Ordner überschrieben,
keine Benutzerdateien/Diagnosen/Profile hochgeladen und keine GUI-FINAL erzeugt.

[RC175-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc175)
Release422730420 am24.10.2026 **12:55:05UTC** veröffentlicht,
PreRelease=true/Draft=false, Tag und target_commitish exakt gemeinsamerAppcommit.
Genau20Assets:5Apparchive+3Testarchive+8SingleSHA+2Pläne+Evidence+SHA256SUMS.
Vor Veröffentlichung alle20Remoteassets frisch heruntergeladen/gehasht,
danach nochmals alle20 frisch heruntergeladen/gehasht, gleicheIDs/Inventar/
Tagquelle/Commit/Flag nachgelesen. Finale Remoteprüfung12:56:18UTC, Exit0;
Notesbody zusätzlich vor/nach Publikation textgleich mit vollständig gelesenem
aktuellen Entwurf. Alte Releaseassets/Tags/Belege nie ersetzt oder umetikettiert.

Desktoptests bleiben beim Nutzer/Kollegen: USER_PENDING, agentischeGUI NOT_RUN.
Mac weiterhin ohne Developer-ID/Notarisierung/Apple-Einreichung oder Abschaltung
von Gatekeeper/HardenedRuntime/eigener CoreLibraryValidation. OffiziellerConverter
behält seine separat belegten breiteren Upstreamentitlements. NativeEpoch/Pause/
Lease/GUI NOT_RUN, ACLadversarialPARTIAL, LaunchServicesexit unbekannt,
PackagedSmokeWriterquiescenceUNCONFIRMED/Extraktion erhalten/deletionNOT_ATTEMPTED.
macOS26/Finder/TCC/M2/Enterprise/VoiceOver/Office/Excel/Numbers menschlich offen;
keine vollständige Prozessbaum-, Format-, Anonymitäts- oder Artefaktfreiheit.
Keine Mainintegration. Spätere reine Abschlussdocs ändern App-/Paket-/Tagbindung nicht.

Zusatzauftrag Ziel-/Internet-/GitHubreview abgeschlossen und bereits im gemeinsamen
Appcommit dokumentiert: Main-PDF-/Grafikteil, unabhängiger Office-Gapreview und
tatsächlicher Dokumentgegencheck gelesen. Prioritäten/Quellen/Adaptierungspins in
GOAL_COVERAGE_REVIEW_20261024.md; größere Renderer und weitere Inhaltsmodelle
bleiben separate Backlogpakete, keine ungeprüfte neue RC175-Runtime.
