# Release- und Distributionsvertrag

Stand: 06.10.2026 (gebundene Cowork-Buildmetadaten) · 3.2.0-rc177 · Veröffentlichungsnachtrag: 25.10.2026

Der aktuelle Quellstand ist RC177-Entwicklungsstand und noch kein neu gebundener Paketkandidat.
Nachfolgende reine Abschlussdokumentation ändert dessen App-/Paket-/Tagbindung
nicht. Menschliche Desktop-/Office-/Zielhostabnahmen und menschliche N3/N4-
Produktionsfreigaben bleiben offen.

### RC176 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `706c1fad6fbf26bf6745768c0d6a5bd4fc48040b` bindet den
[RC176-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc176).
Build706c1fad, Produktfingerprint
`407cb28589025f276d8c0139d7f0e8c0d402fc8211c63ec5c62a4d3ce01683d3`/369.
Getaggte PDF-Struktur, begrenzte TIFF-Codecs/Orientierungen, gespeicherter
Word-/Excel-/PowerPoint-Kontext und quellgebundener sensibler Feldwertschutz
auch nach Labelmaskierung/Keep/Nachbearbeitung. Keine Formel-/Feld-/Makro-
oder externe Linkausführung, keine Universalreparatur unsicherer Altprofile.

Vier frische Source13-Endgates PASS/stabil:318+11Headless,300Rust/3ignoriert/
Clippy/echteNode-Rust-Integration/Release, acht Konvertersuiten mit38PDF/
75Worker/55Office/43Grafik/16TIFF/10EMF+/33TaggedPDF/21passivePDF,
5Paketgates/100MD/0Fehler. Beide Macconsumer40219039035SUCCESS, je73Worker+
2Windows-SKIPs/283Rust+3ignoriert. Ganze tatsächliche ARM-/Intel-Logs und
Archivbytes unabhängig geprüft, Windows zusätzlich mit Python/.NET gegengelesen.
Beide finalen Produktionsquellenreviews und der enge Testorakelreview sind
abgeschlossen. Historische Source11-P1 und Source12-REDs bleiben erhalten;
keine alten Grüns als neue Freigabe oder rückwirkende Ursachenerklärung.

Release423600091, Publikation25.10.2026 19:07:07UTC,
PreRelease=true/Draft=false. Alle20Assets vor und nach Publikation jeweils
frisch heruntergeladen/gehasht; dieselbenIDs, Inventar, Tag-/Quellcommit und
exakter Notesbody nachgelesen. Windows create-only lokal unter
`Software DataSecure/RC176`: aktueller Testplan, Prüfsummen, Proofs und drei
unveränderte synthetische Testarchive. SourceSnapshot1026Dateien/9213705Bytes,
SHA5a014c1ac6f38b7d4f4b0680df0950b6ea802a31b85ec5770914bdad932a80f7.

Alle19menschlichen Desktopfälle und Office-/Finder-/TCC-/M2-/Enterprise-/
VoiceOver-/macOS26-Abnahme bleiben USER_PENDING; Agent-GUI NOT_RUN.
Mac nur bestehendes Adhoc-Sealing, keine Developer-ID/Notarisierung oder
OS-Schutzänderung. MacNativeEpoch/Pause/Lease/GUI NOT_RUN, ACLadversarialPARTIAL,
LaunchServicesexit unbekannt, SmokeWriterjoinUNCONFIRMED/Extraktion erhalten.
Keine universelle Format-/Rendering-/Anonymitäts- oder Artefaktfreiheitszusage.
[Exakte Bindungen, Korrekturen und Grenzen](acceptance/RC176_SHARED_RELEASE_20261024.md).
Linux bleibt RC159, Cowork RC151; keine Mainintegration oder neue Automation.

### RC175 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `223a04f54bc4fcfb2a95f12807685ed764ec6f0c` bindet den
[RC175-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc175).
Build223a04f5, Produktfingerprint
`5eaddabb199b075e9133d5561f5055989db952ae329269dbb3f9675a2cc4bc3e`/358.
Unterstützte gespeicherte chartEx-Diagramme mit tatsächlichen Owner-/MIME-/Daten-ID-/
Dimensions-/Punktbezügen. Keine Formelausführung, externen Workbook-/Geodatenloads,
neue OSrechte oder pauschale Ressourcenlockerung. Vorhandene Schutzprüfungen bleiben.

Vier frische Source02-Endgates PASS/stabil:307+11Headless,300Rust/3ignored/
Clippy/Node-Rust/Release,38PDF/71Worker/55Office/43Grafik/21passivePDF,
5Paketgates/100MD0Fehler. Beide Macconsumer40090612106SUCCESS, je38PDF/
69Worker+2Windows-SKIPs/55Office/43Grafik/21passivePDF/283Rust+3ignored.
Semantische Receipts je Target133chartEx/116Classic/58Math/55MathSource/20MathIntegration.
Unabhängige tatsächliche Produktionsquellen-/Windowsarchiv-, ganze ARM-/Intellog-
und beiderseitige Mac-Archivbytegegenreviews gelesen. Historische REDs erhalten.

Release422730420, Publikationszeit24.10.2026 12:55:05UTC,
PreRelease=true/Draft=false. Alle20Assets vor und nach Publikation frisch
heruntergeladen/gehasht; dieselbenIDs, Inventar, Tagquelle/Commit und Notesbody
bestätigt. Windows create-only lokal Software DataSecure/RC175 mit aktuellem
Testplan/Proofs/Prüfsummen und3synthetischen Archiven. SourceSnapshot995Dateien/
8936873Bytes/SHAe70f5548bc788f2f768d76b1641b5e3e0a566fa891863f7845fd4b4516791661.

Desktop-/Office-/Finder/TCC/M2/Enterprise/VoiceOver/macOS26-Abnahme USER_PENDING,
keine agentische UI oder Mainintegration. Mac nur bestehendes Adhoc-Sealing,
keine Developer-ID/Notarisierung/Schutzabschaltung. NativeEpoch/Pause/Lease/GUI
NOT_RUN, ACLadversarialPARTIAL, LaunchServicesexit unbekannt, SmokeWriterjoin
UNCONFIRMED/Extraktion erhalten. Keine universelle Format-/Rendering-/Artefaktfreiheit.
[Exakte Bindungen und Grenzen](acceptance/RC175_SHARED_RELEASE_20261024.md).
Der zusätzliche [Ziel-/Rendererreview](acceptance/GOAL_COVERAGE_REVIEW_20261024.md)
ist dokumentiert; weitere Inhaltsmodelle/Renderer sind getrennte Backlogpakete,
keine still aufgenommenen Produktabhängigkeiten. Alle älteren Pakete bleiben.

### RC174 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `444b14e0020ebb8cf7f7de08fb36d6e71234da91` bindet den
[RC174-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc174).
Build444b14e0, Produktfingerprint
`465a463a7e14da35bd88551dcad91264e25c5ed7ce49c72f7c7911449d5c1393`/357.
Klassische Diagrammmodelle/Chartsheets und passive gespeicherte PDFwerte in
beiden Ausgabemodi; neue OfficeMath-Projektion nur content-v1. hMerge,
BOM-UTF16, Excel-Xstring/Formelcache, echte PPTXnamespaces und zusätzliche
statische PNGvarianten. Keine Formel-/PDFaktion/XFAausführung, externen
Workbookloads, neue OSrechte oder pauschale Limitserhöhung.

Vier frische lokale Endgates PASS/stabil:306+11Headless,300Rust/3ignored/
Clippy/Node-Rust/Release,38PDF/71Worker/49Office/43Grafik/21passivePDF,
5Paketgates/100MD0Fehler. Beide Macconsumer40041545630SUCCESS, je38PDF/
69Worker+2Windows-SKIPs/49Office/43Grafik/21passivePDF/283Rust+3ignored.
Neue semantische Receipts je Target116Chart/58Math/55MathSource/20MathIntegration.
Unabhängige tatsächliche Quellen-/Windowsarchiv-, ganze ARM-/Intellog- und
beiderseitige Mac-Archivinventar-/Bytegegenreviews gelesen; alte rote Belege erhalten.

Release422424877, Publikationszeit24.10.2026 00:43:28UTC,
PreRelease=true/Draft=false. Alle20Assets vor und nach Publikation frisch
heruntergeladen/gehasht; gleicheIDs, Inventar, Tagquelle und Quellcommit
bestätigt. Notesbody separat textgleich nachgelesen. Windows create-only lokal
unter `Software DataSecure/RC174`, aktueller Testplan, Proofs/Prüfsummen und
drei unveränderte synthetische Testarchive. SourceSnapshot990Dateien/8896114Bytes,
SHA256b84be2b81bbd07f371f2d7729ad95d154847674ce4bc75226d5de2ef8c710cda.

Menschliche Desktop-/Excel-/Numbers-/Finder/TCC/M2/Enterprise/VoiceOver/macOS26-
Abnahme USER_PENDING. Keine eigene UI-Aktion, Developer-ID/Notarisierung,
Schlüssel-/Zertifikatssuche, OS-Schutzänderung oder Mainintegration. Native
Epoch/Pause/Lease/GUI NOT_RUN, ACLadversarialPARTIAL, LaunchServicesexit unbekannt,
Smoke-Writerjoin UNCONFIRMED/Extraktion erhalten. Kein Universalrenderer oder
universelles Vollständigkeits-/Artefaktfreiheitsversprechen. LinuxRC159,
CoworkRC151, RC173 und sämtliche älteren Pakete/Nutzerläufe bleiben unverändert.
[Exakte Hashes, Quellenbindung und Grenzen](acceptance/RC174_SHARED_RELEASE_20261023.md).

### RC173 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `e253380e708de4c347e1aaad7ba836763aabec56` bindet den
[RC173-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc173).
Build e253380e, Produktfingerprint
`8b1644e102d65f40985825300693dee901f0e21c08cb924a201d42b94c5479bc`/351.
Unterstützte komplexe Word-/XLSX-/DrawingML-Tabellen werden quellbezogen
normalisiert, mit eindeutigen Textvorkommen und konservativem ganzen Wertschutz
in gebundenen sensiblen Feldern. Kein erfundener Personenmappingeintrag für
FIELD_REDACTED; Keep umgeht Residualschutz nicht. Altes Word-w:hMerge bleibt
unmodelliert; Struktur-/Schutz-/Quell-/Guard-/Ressourcenfehler bleiben hart.

Vier frische lokale Endgates PASS/stabil:302+11Headless,300Rust/3ignored/
Clippy/Node-Rust/Release,38PDF/67Worker/49Office/41Grafik und5Paketgates/
100MD0Fehler. Beide Macconsumer39992799112SUCCESS, je38PDF/65Worker+
2Windows-SKIPs/49Office/41Grafik/283Rust+3ignored. Tatsächliche Quellen-,
Windows-/ARM-/Intel-Ganzlog- und Archivbytegegenreviews vollständig gelesen.
Eigene Core-/Konverterrollen unverändert getrennt, keine neue Producerfreigabe.

Release422165357, Publikationszeit23.10.2026 18:17:26UTC,
PreRelease=true/Draft=false. Alle20Assets im Draft und nach Publikation frisch
heruntergeladen/gehasht; Inventar, dieselbenIDs, Tagquelle, Quellcommit und
Notesbody bestätigt. Windows create-only lokal unter `Software DataSecure/RC173`,
19Fallplan+FachprobenA–F+neueTabellenproben und3synthetische Archive.
Menschliche Desktop-/Office-/Finder/TCC/M2/Enterprise/VoiceOver/macOS26-Abnahme
USER_PENDING; keine agentische UI-Aktion. NativeEpoch/Pause/LeaseNOT_RUN,
ACLadversarialPARTIAL, LaunchServicesexit unbekannt, Smoke-Writerjoin unbestätigt.
Eigene MacApp/Core nur ad hoc; keine Developer-ID/Notarisierung, OS-Schutzänderung
oder Mainintegration. LinuxRC159/CoworkRC151/RC172 und alle älteren Pakete bleiben.
[Exakte Hashes, historische Gegenbelege und Grenzen](acceptance/RC173_SHARED_RELEASE_20261023.md).

### RC172 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `2d4a5fe2ef67ffa10e4015e34827853e08dfa0da` bindet den
[RC172-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc172).
Build2d4a5fe2, Produktfingerprint
`9f18d7932883665efd64e94e7a79c6d8f701ffca639aac0f143442b2838cfc3a`/348.
BL-049.2: SmartArt und Bildvorkommen, moderne Excel-Kommentare/Anzeigewerte,
Word-Zellraster, PDF-Suchtext-/OCR-Kontext, Inhaltsmodus und präzise Schutzgründe.
Begrenzte zusätzliche Grafikdecoder; kein vollständiger Office-Renderer und
keine universelle OCR-/Artefaktfreiheit. Unbewiesene komplexe Tabellenkontexte
bleiben konvertierbar, ihre Anonymisierung aber hart verweigert.

Vier frische lokale Endgates PASS/stabil:298+11Headless,300Rust/3ignored/
Clippy/Node-Rust/Release,38PDF/67Worker/49Office/41Grafik und5Paketgates/
100MD0Fehler. Beide nativen Macconsumer39958898162 SUCCESS; je38PDF/
65Worker+2Windows-skips/49Office/41Grafik/283Rust+3ignored. Unabhängige
Produktquellen-, ganze Windows-/ARM-/Intellogs und tatsächliche Paketbytes
gegengelesen; kein bestätigter neuer Releaseblocker.

Release421933371, GitHub-Publikationszeit23.10.2026 14:25:11UTC,
PreRelease=true/Draft=false. Alle20Assets im Draft und nach Veröffentlichung
frisch heruntergeladen/gehasht; dieselben IDs, Inventar, Tagquelle und
Quellcommit bestätigt; Notesbody unverändert. Windows lokal create-only unter
`Software DataSecure/RC172`, Testplan19Fälle+RC172A–F und drei synthetische Archive.
Desktop-/Excel-/Numbers-/Finder-/TCC-/M2-/Enterprise-/VoiceOver-/macOS26-Abnahme
bleibt USER_PENDING, keine eigene GUI-Aktion. Keine Developer-ID/Notarisierung,
Schlüsselsuche oder OS-Schutzabschaltung, keine Mainintegration.
LinuxRC159/CoworkRC151 und sämtliche älteren Pakete bleiben unverändert.
[Exakte Hashes, historische Gegenbelege und Grenzen](acceptance/RC172_SHARED_RELEASE_20261023.md).

### RC169 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `8f21b55a41fb63ab62f92d198ec8f108ab8164ad` bindet den
[RC169-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc169).
TXT-gleiche Excel-Zuordnung und bearbeitbare Ergebnisse. Build `8f21b55a`,
Produktfingerprint `77937b239fd35cbc80b7c2037d5d597be007625997815b44e35876fc1d4bd11c`/336.
Windows x64 und macOS ARM64/Intel aus demselben Appstand; Linux159/Cowork151
und sämtliche alten Pakete/Nutzerläufe unverändert.

Erstes XLSX-Blatt Zuordnungen: Pseudonym/Typ/Originalwert(e)/Vorkommen/Datei,
genau dieselben validierten Einträge und numerischen Zählungen wie TXT, keine
Variantenverdoppelung oder erfundene Markerfusion. Übersicht/Details dahinter.
Fertige Ergebnisdateien sind manuell bearbeitbare Arbeitskopien; normales Öffnen
prüft private Belege und ursprüngliche Ordnerbindung, keine öffentlichen Blatt-
Hashes/ctime/Extras/Office-Locks. Fehlender/ersetzter Ordner neutral unavailable,
keine Wiederanlage. Neue Appkorrektur aus privater Basis in neuen Ordner, kein
Import/Überschreiben externer Edits. Private/Pending/Erstabschluss/ACK weiter strikt.
Keine zusätzliche Auswahl/Freigabe/Exportpflicht. Vertraulich nicht weitergeben.

Neu285/285+11/11, Windows280Rust(3ignoriert)/Clippy/echte Node-Rust-Pipe/Release/
Paket5/Korpus100 ohne Fehler; alle Inputs unverändert. Beide Macjobs39461104366
grün: je271Rust/3ignoriert/89Generationen/20Companion/47Workbook/15TXT und native
Core/App/ZIP/DMG-Gates. Tatsächliche Artefakt- und finale Übergabegegenreviews.
Release418691555 veröffentlicht20.10.2026 19:50:11MESZ(17:50:11UTC), PreRelease=true,
Draft=false; alle20Assets vor/nach Publikation frisch gehasht, gleicheIDs/Tagquelle.
Windows lokal `Software DataSecure/RC169`, Testplan und drei synthetische Test-ZIPs.
Desktop-/Excel-/Numbers-/physischeMac-Abnahme beim Nutzer/Kollegen; keine
Developer-ID/Notarisierung oder OS-Schutzabschaltung. Keine Main-Integration.
[Exakte Hashes, historische Gegenbelege und Grenzen](acceptance/RC169_SHARED_RELEASE_20261020.md).

### Historisch – RC168: Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `0049513a9ba661bee4190a6677bb3ddffef461a9` bindet den
[RC168-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc168).
Build `0049513a`, Produktfingerprint
`48ba2fa729f2ac59cc4d47bc57bf6633c580b8316fe330fadeccf9a6064224e3`/336.
Windows x64 und beide Macs stammen aus demselben Appstand; Linux RC159 und
Cowork RC151 werden nicht umetikettiert. Ältere Pakete und Nutzerläufe bleiben.

CRLF/LF/CR- und UTF-16-Positionen der Anzeige werden auf gespeicherte Texte
abgebildet, ohne alte Bytes/Hashes umzuschreiben. Rechts markieren, Vorschau
prüfen, einmal **Maskierung speichern**. Entitätenbehandlung/Geltung separat
bewusst speichern; Blättern und Markieren allein mutieren nichts. Sichtbare
Sperrgründe statt stiller inaktiver Aktionen; keine zweite Freigabe/Exportpflicht.
Neue Anonymisierungs-Erst-/Korrekturstände enthalten drei Pflichtdateien:
`Vertraulich/Dateizuordnung.csv`, `Pseudonym-Zuordnung.txt` und
`Pseudonym-Zuordnung.xlsx`. XLSX je Dokument Typ/Basiswert/Endwert, dazu Kontext
und verlustfreie Langwerte. Alte /1-/2-Leser, No-op und Resume erhalten die
alten Rollen/Namen; keine stille Reparatur oder Umbenennung beim Öffnen.
**Vertraulich enthält Originalnamen/Identitäten: nicht weitergeben/hochladen.**

Source03 neu285/285Headless+11/11Zusatzgates, Windows Prepare/Clippy/
275Rusttests(3ignoriert)/Release/Paket5 und100Dateienkorpus ohne Fehler;
336Produkt-/572Test-/Scriptinputs unverändert. Beide nativen
[Macjobs39401647855](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/39401647855)
bestanden, je266Rust/3ignoriert/70Generationen/20Companion/34Workbookfälle,
echte Node→Rust-Drei-Dateien-/Legacy-/LostReceipt-/Nichtreparatur-/Default-/
Core-/Worker-/Guard-/App-/Konverter-/ZIP-/DMG-Gates. Unabhängige tatsächliche
Windows-/ARM-/Intel-Artefakt- und Übergabegegenreviews ohne bestätigten Blocker.

Release418271744 veröffentlicht20.10.2026 10:29:20UTC, Pre-Release=true,
Draft=false. Alle20Assets im Entwurf und nach Veröffentlichung frisch
heruntergeladen/gehasht; dieselben IDs und exakter Tagcommit bestätigt.
Windows zusätzlich create-only unter `Software DataSecure/RC168` mit aktuellem
Testplan, zehn offenen Nutzerfällen und drei unveränderten Testdatenbeilagen.
[Abschluss mit historischen Gegenbelegen und Grenzen](acceptance/RC168_SHARED_RELEASE_20261020.md).

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 112395420 | `9bf52cd4146e78e34afd0f08674f72fdfbb19d685aa0f3ca9d12d92e231efbad` |
| macOS Apple Silicon ZIP | 117745716 | `103f67e2cabef57f799670009da52080e6a09678ef7539bb650caabb3f7ca84c` |
| macOS Apple Silicon DMG | 131595119 | `906bd8324e73f93b9b20291a6c2e0f89e2cb714d8a2fc27cb258e71839659529` |
| macOS Intel ZIP | 121001934 | `d2c326a3d190a2d0b4cf4084e3eeb2645323219c20adce959c2fd16cd6ef33c5` |
| macOS Intel DMG | 136569616 | `2e07cd25910f4fcaec64af13182b630f279ae8c79581f08936df9ede724d1269` |

Alle menschlichen Desktop-/Excel-/Numbers-/M2-/Finder-/TCC-/Gatekeeper-/Enterprise-/
VoiceOver-/macOS13.5/26-Prüfungen bleiben offen. Isolierte Workbookreader zeigen
Xstring-/Langziffern-Darstellungsgrenzen; kein nativer Office-Gleichheits-PASS.
Zuordnungen zunächst nur ansehen, nicht über gebundene Originale speichern;
Office vor erneutem Appabgleich schließen, Bearbeitungskopien außerhalb des
gesamten Ergebnisbaums weiterhin vertraulich behandeln. Keine vermeintlichen
Lockdateien blind löschen oder bereits gespeicherte Korrektur blind wiederholen.
Eigene App/Core nur ad-hoc versiegelt, keine Developer-ID/Notarisierung/Apple-
Einreichung oder globale Schutzabschaltung. Offizieller Converter bleibt
separate hashgebundene Rolle mit ausgewiesenen Upstream-Entitlements.
Keine Main-Integration, Desktopautomation, neue Automation oder Produktionsfreigabe.

### RC167 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `84df81c3c935cca6447ad05686c3f43416aabdb6` bindet den
[RC167-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc167).
Build `84df81c3`, Produktfingerprint
`71aa639ee12adc28980d27f3ff311e59ea23549148293a2488d215fde9fe5418`/334.
Windows x64 und macOS ARM64/Intel stammen aus demselben Appstand. RC166 und
alle älteren Pakete, Archive, Primärbelege und Nutzerläufe bleiben unverändert.

Neue Anonymisierungsstände enthalten jetzt beide Pflichtdateien physisch im
Ergebnisordner: `Vertraulich/Dateizuordnung.csv` und
`Vertraulich/Personen-Pseudonym-Zuordnung.txt`. Das gilt für Erstbereitstellung
und jeden ausdrücklich gespeicherten vollständigen Korrekturstand, gebunden an
dessen tatsächliche Namen, Revisionen und Inhalte. Keine zusätzliche Auswahl,
Dokumentfreigabe oder Exportbestätigung. **Vertraulich enthält Originalangaben:
nicht weitergeben oder hochladen.** Nur gewünschte anonymisierte MD weitergeben.
Alte `/1`-Ordner werden weder migriert noch beim Lesen repariert; technische
Objekt-/Eltern-/Hash-/Inventar-/Budget-/NativeGuard-Prüfungen bleiben erhalten.
Reine Markdown-Konvertierung erzeugt keine Anonymisierungszuordnungen.

Source04 bestand284/284 Headless-Dateien plus10/10 Zusatzgates, Windows Prepare/
Clippy/265Rusttests(3ignoriert)/Release und5Paketgates mit100/100Dateien,0Fehlern
und unveränderten Originalen. Alle334Produkt-/570Test-/Scriptinputs unverändert.
Beide nativen [Mac-Consumer39335666200](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/39335666200)
bestanden: je68Generationen-/16Companion-/256Rustfälle(3ignoriert), echte
Node→Rust-Erst-/Korrekturbereitstellung, LostReceipt, Nichtreparatur, Core/Worker/
Guard/ACL/App/Office/PDF/OCR/ZIP/DMG. Beide tatsächlichen Mac-ZIPs je1153Einträge,
1151Manifestrecords/1152Checksummen,231gemeinsame Runtimequellen bytegebunden.
Unabhängige Windows-/ARM-/Intel-Artefakt- und Übergabegegenreviews ohne bestätigten
Übergabeblocker. Quellenmodell, native CI und menschliche Abnahme bleiben getrennt.

Release417844567 veröffentlicht19.10.2026 23:17:37UTC, Pre-Release=true,
Draft=false. Alle20Assets vor und nach Veröffentlichung frisch heruntergeladen
und gehasht; dieselben AssetIDs und exakter Tagcommit erneut bestätigt. Windows
zusätzlich create-only unter `Software DataSecure/RC167` mit aktuellem Testplan,
Prüfsummen und drei unveränderten synthetischen Testdatenarchiven geliefert.
Nachweise: `dist/rc167-result-companions-source04-20261020` sowie
`dist/rc167-source04-arm-review-20261020`/Intel. Genaues
[Fix-/Gegenreviewprotokoll](acceptance/RC167_SHARED_RELEASE_20261020.md) erhält
auch die roten/abgebrochenen Source01–03-Belege; keine alten PASS umetikettiert.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 112382263 | `23ec57cc1428824b7d1fcdde53b55f4e0e04a02a8f1ab81799b7c906f7dbcbf6` |
| macOS Apple Silicon ZIP | 117734094 | `a36b42fb83f6255ac7bbe00832f2b18826fe6e10f0cc02353eb462d460a9d975` |
| macOS Apple Silicon DMG | 131488906 | `8406c3585cc64bcd5780ec8d73294c85c24e75fa803c5e200ab8f0fede00736a` |
| macOS Intel ZIP | 120988709 | `a841a3b2195b634e6b4ca52432fc30ffe63548b099fbcfdc751517493bc56ab6` |
| macOS Intel DMG | 137161467 | `1b966f8110a370bb8655e664d09da54d14cb90d4811eeecb280f40008b4dabbc` |

Alle10menschlichen Desktopfälle bleiben USER_PENDING und beim Nutzer/Kollegen.
Physischer M2/Finder/TCC/Gatekeeper/Enterprise/VoiceOver sowie macOS13.5/26 offen;
reguläres26Profil übersprungen, adversariale ACL-Matrix partiell. Bei fehlender
Writerquieszenz bewahrt der Paket-IPC-Test seine Extraktion; keine erfundene
Prozessbaum-/GUI-Abnahme. Eigene App/Core ad-hoc versiegelt, keine Developer-ID,
Notarisierung/Apple-Einreichung oder Abschaltung von OS-Schutzfunktionen.
Offizieller Converter bleibt separate hashgebundene Rolle mit seinen offen
ausgewiesenen Upstream-Entitlements. Branch/Tag gepusht; keine Main-Integration
oder Automation beauftragt. Keine Produktionsfreigabe/Anonymitätsgarantie.

### RC166 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `e04d32cff603597ce3d8c982e94154bb00f534fb` bindet den
[RC166-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc166)
für Windows x64, Apple Silicon und Intel. Build `e04d32cf`, gemeinsamer
Produktfingerprint `741e69e3f76981431f96408a7b19338820b722f11533fc234151aff2f786a9a7`
(333 Produktdateien). Nachfolgende reine Dokumentation ändert diesen App-/Tagcommit
nicht. RC165/164 und alle früheren Pakete/Primärbelege bleiben unverändert.

Nach notwendigen OCR-/Fundstellenprüfungen direkt Ergebnisordner öffnen; keine
zweite Dateiauswahl/Freigabe/Exportbestätigung im normalen Ablauf. Optionale
Korrekturen erzeugen vollständige neue immutable Ergebnisstände, vertrauliche
Zuordnungen bleiben getrennt privat. Technische Revisions-/Hash-/Ordner-/Guard-
Prüfungen bleiben aktiv. Keine stille Überschreibung, Reparatur oder Wiederanlage
manuell geänderter/gelöschter Ergebnisse. Ordner-OCR-Labels, vereinheitlichte
Verlaufsaktionen, exklusive Entscheidungswahl/OCR separat, stabilere Verarbeitung
und separate36-Dateien-Large-Beilage sind enthalten.

Source10:283/283 Hauptdateien plus10/10 Zusatzgates, Windows Prepare/Clippy/
253Rusttests (3ignoriert)/Release und5Paketgates/100Dateienkorpus bestanden;
sämtliche Inputs unverändert. Beide nativen
[Mac-Consumer](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/39317346697)
erfolgreich: je243Rusttests (3ignoriert), acht echte atomare Publisher-/Reader-
Gegenfälle, Default/5→/6 ohne Picker, direkte Korrekturgeneration/LostReceipt/
Read-only-Öffner, Guard/Worker/IPC/App/Office/PDF/OCR/ZIP/DMG. Tatsächliche Downloads
je1152ZIPeinträge/1150Manifestrecords und230gemeinsame Serverdateien geprüft;
zwei unabhängige tatsächliche Artefaktgegenreviews ohne bestätigten Übergabeblocker.

Release417749437 ist Pre-Release, kein Draft, veröffentlicht19.10.2026 21:03:51UTC.
Alle20Assets im Entwurf und nach Veröffentlichung frisch heruntergeladen/gehasht,
dieselben AssetIDs/Bytes und genauer Tagcommit bestätigt. Windows zusätzlich
create-only unter `Software DataSecure/RC166-R2` mit aktuellem Testplan, offenen
zehn Nutzerfällen, Prüfsummen und drei synthetischen Testdatenarchiven geliefert.
Der ältere lokale `RC166`-Ordner ist ein anderer Build und bleibt erhalten.
Nachweise: `dist/rc166-direct-results-source10-20261019` und je
`dist/rc166-source10-arm-review-20261019`/Intel. Ein reiner Übergabehelfer-
Budgetfehler wurde auf die bestehende512MiB-Lesegrenze korrigiert und unabhängig
gegengelesen; keine App-/Paket-/Schutzänderung, kein falscher Übergabe-PASS.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 112361838 | `37f303407dfe781c06ab06371a6c0ae4186e9a0cd2abe06a2390ff8d13647faa` |
| macOS Apple Silicon ZIP | 117712448 | `c52eaeeae0d1b6565def5e223b62a73007dfcf728aae7d334b1bddd76db1d956` |
| macOS Apple Silicon DMG | 130633566 | `deed337048f29a1b3ae9e1a3994e1ce10e97271c22546d2e5087b94ab0f8eff1` |
| macOS Intel ZIP | 120966602 | `33d5667cef0776d3b2150081b8ebbe5ebf58d0e9d6f95734c3ff52376d3bf1e3` |
| macOS Intel DMG | 137331816 | `09037ab7a3c63b5e70ab0e11623ca94f9a962dab7be64d84cd9f57da5b321204` |

Windows-/Mac-Desktopabnahme ausschließlich durch Nutzer/Kollegen offen. Kein
physischer M2-/Finder-/TCC-/Gatekeeper-/Enterprise-/VoiceOver-/macOS26-PASS.
Reguläres macOS26-Profil übersprungen, adversariale ACL-Matrix partiell;
Packaged-Sidecar-Extraktion bei unbestätigter Writerquieszenz erhalten. Nur
load+IPC statt vollständiger UI-Abnahme bei LaunchServices. Historische Source07-
Default-/Manifestursachen sowie das genaue Source09-Intel-Scheduling bleiben
unbewiesen; separat reproduzierter Quellrace eng korrigiert und gegengeprüft.
Keine pauschale Fehlerunterdrückung. Eigener statischer Core bleibt separat vom
unveränderten offiziellen Converter mit dessen offen ausgewiesenen Upstream-
Entitlements. Keine DeveloperID/Notarisierung/Apple-Einreichung, nur Ad-hoc-Sealing;
keine globale Schutzabschaltung, Produktionsfreigabe oder Anonymitätsgarantie.

Die nachfolgenden RC165-/RC164-Abschnitte sind historische Belege.

### RC165 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `973274f17cda46bb66621d956af2cbc96e2272e3` bindet den
[RC165-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc165)
für Windows x64, macOS ARM64 und Intel. Sichtbare Buildkennung `973274f1`,
gemeinsamer Produktfingerprint `080ce0b2edeadc89e336a361a3e41a9649badf0ca163ec9cf3219e19c9690dfe`
(332 Produktinputs). Nachfolgende reine Dokumentation ändert diesen eingefrorenen
App-/Tagcommit nicht; RC164 und alle älteren Pakete/Evidenzen bleiben unverändert.

Normaler Freigabe-/Exportweg auf einen bestätigten Endklick reduziert. Die Vorschau
bleibt lesend; fehlende technische Freigaben werden exakt revisions-/hashgebunden
atomar gespeichert und vor dem nativen Kopieren erneut abgeglichen. Gespeicherte
Standardordner werden beim Erstexport ohne unnötige neue Auswahl nativ gebunden,
wenn ursprüngliche Identität und Zugriff passen. Keine neuen OS-Rechte behauptet.
Konsistente primäre Ergebnisordneraktion, neutrale Busy-/Fehlstatusdarstellung und
eng begrenzter read-only Reload nach nachgewiesenem atomaren Snapshotwechsel.

280/280 Haupttests plus10/10 Zusatzprüfungen, Windows Prepare/Clippy/232Rusttests
(3 ignoriert)/Release und fünf Paketgates bestanden; sämtliche Inputs unverändert.
Paketkorpus100/100 Ergebnisse, Originale bytegleich. Beide nativen
[Mac-Consumer](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/39256845033)
erfolgreich: je221Rusttests (3 ignoriert), vier tatsächliche atomare Publisher-
Gegenphasen, Defaultordner-/2->/4-Erstexport ohne Picker, Guard/ACL/Prozessreceipts,
App-/LaunchServices-/Konverter-/ZIP-/DMG-Nachweise. Neue Serviceinstanzen sind kein
Nachweis eines echten OS-Neustarts oder tatsächlicher TCC-Dialoge. Pro Architektur
1151 ZIPeinträge,229 gemeinsame Runtimequellen, Core-/Provenienz-/Signatur-/
Architektur-/Gitmarker-/Fingerprintbindungen am tatsächlichen Download geprüft.
Unabhängige tatsächliche ARM-/Intel-Jobgegenreviews ohne bestätigten neuen Blocker.

Release417349053 ist Pre-Release, kein Draft. Alle18Assets im Draft erneut
heruntergeladen und gehasht, nach Veröffentlichung dieselben AssetIDs/Bytes
sowie Tagcommit bestätigt. Windows zusätzlich create-only mit Testplan, offenen
Abnahmefällen und unveränderten synthetischen Daten unter `Software DataSecure/RC165`
geliefert. Nachweise unter `dist/rc165-usability-source06-20261019` und den getrennten
`dist/rc165-source06-arm-review-20261019`-/Intel-Verzeichnissen.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 112339508 | `16f5eabd6f65a8c52c9633aa6400b7ad5496fc9f20ace45aa588c6f6ee0baf21` |
| macOS Apple Silicon ZIP | 117690573 | `4c16df3a2f11f2e71aca72d3e4879110ac4ee8f54b81c3f1bd40a6652abd8be5` |
| macOS Apple Silicon DMG | 130819073 | `b045675ef8ddf1e11c24bacf7c81f143bc9435f307df815c203de27a6d989ffd` |
| macOS Intel ZIP | 120942901 | `22c18e317f67add14f6d6321dfc326879b8e4533f357f1963248db587527a4e4` |
| macOS Intel DMG | 136178967 | `55517bcbe74814b8dc00d33309537f73be85e4b778a7a8024efec05ce34f3f8c` |

Zehn menschliche Windows-Abschlusstests durch den Nutzer und praktische Mac-/M2-/
Finder-/TCC-/Gatekeeper-/Enterprise-/VoiceOver-/macOS26-Abnahme bleiben offen.
Mac-Runner:14.8.9/ARM64 und15.7.9/Intel; macOS26-Regular-Profile-Gate übersprungen.
Paket-Sidecarfixture bleibt bei unbestätigter Writerquieszenz erhalten, kein
vollständiger autonomer Writerjoin behauptet. Eigener statischer Mac-Core und
unveränderter offizieller Converter bleiben getrennte offen hashgebundene Rollen.
Keine Developer ID/Notarisierung/Apple-Einreichung, nur lokales Ad-hoc-Sealing;
keine globale Schutzabschaltung. Kein Produktions- oder vollständiger Anonymitätsnachweis.

Die nachfolgenden RC164- und älteren Abschnitte sind historische Belege.

### RC164 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `95f30181fdaf2494b0ff53c4cd2e7b97bf834990` bindet den
[RC164-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc164)
für Windows x64, Apple Silicon und Intel. Sichtbare Buildkennung `95f30181`,
gemeinsamer Produktfingerprint `cbd2175dc131e4edf63247a52dea8b9b4b2aae7355daf9388745312fa5f28b2d`
(332 Produktinputs). Nachfolgende reine Dokumentationscommits ändern diesen
eingefrorenen Paket- und Tagcommit nicht.

279/279 Haupttests plus 10/10 Zusatzprüfungen, Windows Prepare/Clippy/229
Rusttests (drei ignoriert)/Release und fünf Paketgates bestanden mit unveränderten
Inputs. Beide tatsächlichen [Mac-Consumer](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/39223015403)
bestanden native Core-/CLI-/Worker-/Guard-/ACL-/App-/Konverter-/ZIP-/DMG-Gates.
Originale Logs und tatsächliche Artefakte wurden je Architektur unabhängig
gegengelesen; die begrenzten ACL-/Prozessgruppen-Orakel sind keine vollständige
Hostabnahme. Eigener statischer Mac-Core und unveränderte offizielle
Konverterruntime bleiben getrennte Rollen. Der Coreproducer-Quellcommit
`7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071` ist bewusst nicht der Appcommit.

Alle 18 Assets wurden nach Upload anhand ihrer IDs erneut heruntergeladen,
bytegenau gehasht und nach Veröffentlichung mit denselben IDs bestätigt.
Release417102811 ist Pre-Release, kein Draft; der Tag löst auf den Appcommit auf.
Die Prüfsummen, zwei synthetischen Testdatenpakete, Windows-Testplan,
Mac-Testhinweise und `RELEASE-EVIDENCE.json` liegen auf der Release-Seite.
Windows wurde zusätzlich mit Testplan lokal unter `Software DataSecure/RC164`
bereitgestellt. Die zehn manuellen Windows-Fälle führt der Nutzer selbst aus;
es gibt keinen neuen agentischen GUI-FINAL oder behaupteten menschlichen PASS.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 112322766 | `e5a36897a195137e1c607e891d9df586fea39990f2e175ab6a6a981907eb70eb` |
| macOS Apple Silicon ZIP | 117671807 | `16aafc26ccc56246687f522fb7d010034c19e1b63b27017698d78756cb1f04bf` |
| macOS Apple Silicon DMG | 132374043 | `f0fcf2d1f19b8a10e46a6f342af599df653b0d24e65fc68576e2235ea00190fb` |
| macOS Intel ZIP | 120924619 | `38da34d52fddd9b779d2f0c382cdf5ca76e52c82ee1a1ce7a1739deeeaca155a` |
| macOS Intel DMG | 137224352 | `dada8e167dad1e6823912858daa72a86ff8a7aba3cd568520dc8d804a0814b7e` |

Mac-Runnerumgebungen: macOS14/ARM64 und macOS15/Intel. Kein tatsächlicher
macOS26-/M2-/Finder-/TCC-/Gatekeeper-/Enterprise-/VoiceOver-Abnahmebeleg.
Die praktische Mac-Abnahme übernimmt der Kollege. Eigene Mac-Signierung ist
lokales Ad-hoc-Sealing, keine Developer ID oder Notarisierung; keine Apple-
Einreichung und keine globale Schutzabschaltung. Dieser Teststand ist keine
Produktionsfreigabe und keine Garantie vollständiger OCR-/Anonymitätsqualität.

Die nachfolgenden RC162-/RC161-Abschnitte sind unveränderte historische Belege.

### RC162 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Quellcommit `310925f59d76fddc955288eef3c3b0ef4297c232` ist an den
annotierten Tag des [RC162-Pre-Releases](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc162)
gebunden. Windows x64, Intel-Mac und Apple-Silicon-Mac stammen aus genau diesem
Commit. Das unveränderte synthetische 100-Dateien-Testpaket aus RC160 ist
beigefügt; sein alter Dateiname bezeichnet die Herkunft, nicht einen anderen
App-Stand. Alle zwölf Assets wurden nach dem Upload einzeln gegen lokale
Größe und SHA-256 geprüft; ZIPs bestanden zusätzliche Strukturprüfungen.

| Gate auf dem exakten Releasecommit | Ergebnis und Grenze |
|---|---|
| [CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38924647206) und [Security](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38924646911) | Produkt-/Repository-Gates, JavaScript-/nativer CodeQL und Gitleaks bestanden. |
| [macOS 26 ARM](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38924646832) | Finale Core-JIT-Entitlements, Signatur, Bundle-, ZIP-, DMG-, IPC- und Konverterstart bestanden. Kein Beleg für Finder-Kopie und Start auf dem betroffenen verwalteten M2. |
| [macOS Intel](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38924646474) | Dieselben nativen Paket- und Startgates bestanden; keine menschliche Zielhost-Abnahme. |
| [Windows x64](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38924646450) | Quell-/Rust-/Konverter-/Paket-/Determinismus-Gates und App-/Core-Start aus dem ZIP mit frischem Profil bestanden; keine bediente menschliche RC162-Abnahme. |

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| macOS Apple Silicon ZIP | 116187878 | `0e8a0514838470e0773192a33a04224b293d662109ffab6fd364026f45592678` |
| macOS Apple Silicon DMG | 131902832 | `5b636c5ad3287179029b14d4fa618e3131443a5624dd14e98d44e72a1a83f0ae` |
| macOS Intel ZIP | 120285968 | `37b1ed448fd9286969878bee8232386ff65c56e335aedaf4563817806fe112d4` |
| macOS Intel DMG | 137256882 | `047db37cf028186f5eee521eaebd1d6dc073c030a029eb772bcf0ed8090f00ad` |
| Windows x64 ZIP | 112010626 | `255e98847d02ad5099f5c032ea0cfbf94fcdc6b4c8b8fcefeeef6b649bd08938` |
| Synthetisches Testdatenpaket (unverändert aus RC160) | 2369201 | `e73d316f896e6cd1523a0357e4f1c37397b0c9097e9eaf11ce47fb8c153bf010` |

Der konkrete RC161-M2-Befund war ein Core-`SIGTRAP` vor Ready. RC162 korrigiert
die im Mac-Build nachgewiesene fehlende JIT-Berechtigung des gehärteten
Node-Cores und ergänzt frühe, inhaltsfreie Diagnosen. Dies ist eine plausible
Fehlerursache, aber noch kein Kausal- oder Erfolgsbeleg auf dem betroffenen
M2. Für die nächste Probe dort nur synthetische Daten verwenden und bei einem
Fehler die Desktop- und gegebenenfalls Sidecar-Diagnosen sichern. Die
Mac-Pakete sind ad-hoc-signiert, nicht Developer-ID-signiert oder notarisiert;
keine Schutzrichtlinie deaktivieren. [Technischer Prüfvertrag](acceptance/RC162_MAC_CORE_SIGNING_AND_DIAGNOSTICS_20261016.md).

### RC161 – Standalone-Test-Pre-Release (macOS und Windows x64)

Das [RC161-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc161)
ist am 15.10.2026 aus Commit `f96c9e246997e52bf37f21930e2d0a3f978d68b2`
zunächst als Mac-Teststand erschienen. Der annotierte Tag löst auf genau diesen
Commit auf; Linux bleibt RC159, Cowork RC151. Vier Mac-Pakete
(ZIP und DMG je Architektur) und vier SHA-256-Dateien wurden nach dem
Herunterladen strukturell und kryptographisch geprüft; alle acht Größen und
GitHub-Asset-Digests stimmen mit lokalen Dateien überein.
Am 16.10.2026 kam aus demselben unveränderten Tagcommit das native Windows-x64-ZIP
samt SHA-256-Datei hinzu. Der [Windows-Gate-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38864871810)
bestand Quell-/Konverter-/Rust-Gates, deterministische Zweitverpackung und den
Start aus genau dem ZIP mit frischem Profil und v2-IPC. Das heruntergeladene
Paket bestand zusätzlich die Manifest-/Archiv-/Prüfsummenprüfung; GitHub-Größe
und Asset-Digest stimmen mit der lokalen Datei überein. Ein menschlicher
Windows-Bedienlauf mit den Testdaten steht weiterhin aus.
Am 16.10.2026 wurde zusätzlich das unveränderte, bereits auf RC160
veröffentlichte synthetische 100-Dateien-Testpaket samt SHA-256-Datei auf
dieselbe RC161-Release-Seite aufgenommen. Die Prüfsumme des Pakets ist
`e73d316f896e6cd1523a0357e4f1c37397b0c9097e9eaf11ce47fb8c153bf010`;
sein RC160-Dateiname zeigt die unveränderte Herkunft an. Anleitung und Manifest
liegen außerhalb des einzigen als Eingabe auszuwählenden Ordners
`DataSecure-RC160-Testdaten-100`.

| Gate auf dem exakten Releasecommit | Ergebnis und Grenze |
|---|---|
| [Lokale Standalone-Quellsuite](../package.json) | Vollständig bestanden; 122 Rusttests bestanden, drei Subprozesshelfer bewusst ignoriert. Native Windows-Formtests und menschliche Mac-Bedienung darin `NOT_RUN`. |
| [CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013420) und [Security](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013905) | Produkt-/Repository-Gates, JavaScript-/nativer CodeQL und vollständige Gitleaks-History bestanden. |
| [macOS 26 ARM](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013790) | Nativer Supervisor-/Konverter-/Rust-/App-/Core-/ZIP-/DMG-Test bestanden. Kein verwalteter M2- oder Finder-/Quarantäne-Beleg. |
| [macOS Intel](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38805013523) | Dieselben nativen Paketgrenzen bestanden. Keine menschliche Zielhost-Abnahme. |
| [Windows x64](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38864871810) | Native Quell-/Konverter-/Rust-/Paket-/Determinismus-Gates und App-/Core-Start aus dem fertigen ZIP bestanden; keine menschliche Bedienabnahme. |

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| macOS Apple Silicon ZIP | 116173730 | `b1b8d90a08573100cf41ca6508bf3ca06aeeb654d39871c2815f2f7f514a7cbc` |
| macOS Apple Silicon DMG | 131303365 | `d8aa0ee5843b1c4cf74ff2996790e89614f2feb3203395d86545b4c8ee8f1cae` |
| macOS Intel ZIP | 120271862 | `0b475e802f1e00f6fd21e0db5fe9c3a93526d933cc4ff6bbe55cef7674acdd0e` |
| macOS Intel DMG | 136516941 | `390e87a14686d9eb5a0cd75366e82fc9b58f08d99ae9ae689e25cdb799c6c58a` |
| Windows x64 ZIP | 111998154 | `11b21608e7811b2c188c64a36499e8813a9886acd2fc061c117667c8eae15f74` |
| Synthetisches Testdatenpaket (unverändert aus RC160) | 2369201 | `e73d316f896e6cd1523a0357e4f1c37397b0c9097e9eaf11ce47fb8c153bf010` |

RC161 ist für gezielte Mac- und Windows-Tests mit synthetischen Daten bestimmt.
Der ursprüngliche Startfehler auf dem verwalteten macOS-26.2-M2 ist noch nicht
ursächlich bewiesen oder durch CI widerlegt. Die Mac-Pakete sind ad-hoc-signiert,
nicht Developer-ID-signiert oder notarisiert. Kein Schutzrichtlinien-Bypass;
keine Produktionsfreigabe und keine allgemeine OCR-/Anonymitätsgarantie.

### RC160 – Standalone-Test-Pre-Release (Windows und macOS)

Das [RC160-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc160)
ist am 15.10.2026 aus Quellcommit `b5d52c550ead3fb4cea5acc9e9774de9863db32c`
für Windows x64, macOS Intel und macOS Apple Silicon veröffentlicht. Der
annotierte Tag löst auf genau diesen Commit auf. Fünf Archive und fünf
SHA-256-Dateien wurden vor dem Upload lokal und danach gegen die GitHub-Digests
geprüft. Linux bleibt beim früheren RC159-Download, Cowork bei RC151; sie
wurden für RC160 nicht neu gebaut oder freigegeben.

| Gate auf dem exakten Releasecommit | Ergebnis und Grenze |
|---|---|
| [Lokale Standalone-Quellsuite](../package.json) | 120 Rusttests bestanden, drei bewusst ignorierte Subprozesshelfer; isolierter Windows-Paket-Sidecar-Smoke bestanden. Die vollständige Produkt-Headless-Suite mit 232 Dateien bestand; sechs native GUI-Formfälle darin ausdrücklich `NOT_RUN`. |
| [CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38744664049) | Kostenbegrenzte Produkt- und Repository-Gates bestanden. |
| [Security](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38745290152) | JavaScript-CodeQL, nativer Windows-CodeQL und vollständige Gitleaks-History bestanden. Neue CodeQL-Fundstellen wurden einzeln geprüft; keine ganze Regel wurde abgeschaltet. |
| [Windows](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38745285549) | Native Standalone-/Konverter-/Rust-/Clippy-Regressionen, deterministischer Paketbau und Start mit v2-IPC aus genau dem Archiv bestanden. Keine menschliche End-to-End-Bedienabnahme. |
| [Beide Macs](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38745281074) | Beide Architekturen bestanden native Tests, Signatur-/Paket-/Start-/IPC-Gates; die DMGs enthalten jeweils die identische App. Keine Finder-/Gatekeeper-/VoiceOver-Zielhostabnahme. |

Der Anonymisierungsweg trennt OCR-Kontaktentscheidung, Dokumentvergleich,
ausdrückliche Dokumentfreigabe und erst danach den getrennten KI-Kopie-Export.
Die Hauptaktionen sind von zusätzlichen Maskierungs- und
Wiederherstellungseingriffen getrennt; diese erfordern eine zweite Bestätigung
und heben eine betroffene Freigabe auf. Der Markdown-only-Weg wurde funktional
nicht geändert. Verbindungsverlust wiederholt keine Entscheidung und keinen
Export automatisch. Die App lädt nicht selbst zu einer KI hoch.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 111995409 | `1641b719922da00da8e627720fd615f4e349cec5c01648db79b079053b043855` |
| macOS Intel ZIP | 120260643 | `3fb558a1ed9ae04bb105e2189176b02f5dcb01d39df261acebbec79cda906dce` |
| macOS Intel DMG | 117431092 | `0c8ebf4a5a1032ec23385f099a1d54bd30c94c219475414ff30177fcf8154bff` |
| macOS Apple Silicon ZIP | 116953592 | `77c792137f4208ec2d6bbaef8248755575862905675cb9714052d3150745ae6b` |
| macOS Apple Silicon DMG | 113488405 | `ccb74a8c940e63a28284af5c74dffa7e48efa8e0d64fc0ce0cee412293e08da3` |

Die macOS-Pakete sind ad-hoc-signiert, weder Developer-ID-signiert noch
notarisiert. Native Start- und Paketgates ersetzen keine menschliche Bedien-,
Barrierefreiheits-, Qualitäts- oder Zielhostabnahme. OCR und automatische
Erkennung können auslassen oder falsch lesen; keine allgemeine
Anonymitätsgarantie. Für erste Tests ausschließlich synthetische Daten nutzen.

### RC159 – Standalone auf allen Zielplattformen

Das [RC159-Prerelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)
ist am 11.10.2026 aus Quellcommit `7af2a9d0268864a01b954e0175cae9f5a3616fe8`
für Windows x64, macOS Intel, macOS Apple Silicon und Linux x64 glibc veröffentlicht.
Tag, vier ZIPs, zwei zusätzliche Mac-DMGs und sechs SHA-256-Dateien binden diesen
Schnitt; die zwölf Uploads wurden vor und nach Veröffentlichung gegen lokale
Größe und GitHub-SHA-256-Digest geprüft. Keine alten Archive wurden ersetzt.
Cowork bleibt unverändert auf RC151.

| Nachweis am exakten Paketquellstand | Ergebnis / Grenze |
|---|---|
| [Windows `38169233488`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38169233488) | Standalone-/Rust-/Clippy-Gates, 47 reale Konvertergruppen ohne Skip, Paket-Sidecar-Smoke, identischer wiederholter ZIP-Bau und nativer Start aus genau diesem ZIP bestanden. Der native Start weist v2-Seitenladung und erfolgreiche aktuelle IPC derselben Sitzung nach, keine bedienten Reviewentscheidungen. |
| [Beide Macs `38169235247`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38169235247) | Je Architektur 109 Rustfälle/Clippy und 45 reale Konvertergruppen bestanden; zwei Windows-spezifische Fälle sind ausdrücklich nicht anwendbar. Signaturen, Architektur/Mindestversion, identischer wiederholter ZIP-Bau, direkte sowie LaunchServices-Starts und DMG mit identischer App bestanden. Native Starts belegen Laden/erfolgreiche IPC; keine menschliche Gatekeeper-/Finder-/VoiceOver-Abnahme. |
| [Linux `38169237247`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38169237247) | Standalone-/106 Rustfälle-/Clippy-Gates und 45 reale Konvertergruppen bestanden; zwei Windows-spezifische Fälle nicht anwendbar. AppImage-Payload, native IPC und geordnetes Ende auf Ubuntu 22.04, identischer wiederholter ZIP-Bau und Start aus dem extrahierten Downloadpaket bestanden. Keine vollständige Desktop-/Picker-/Dateimanager-Bedienabnahme. |
| [Source-CI `38169233601`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38169233601) | Kostenbegrenzter Produkt-/Repository-Eingang bestanden. Dokumentierte ressourcenabhängige `NOT_RUN`-Fälle werden nicht als native Konverterevidenz gezählt; diese stammt aus den separaten Plattformgates. |
| [Vollständige Security `38169238826`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38169238826) | JavaScript-CodeQL, nativer Windows-CodeQL und Gitleaks über vollständige History bestanden; 87 einzeln quell-/fingerprintgebunden bewertete JS-Fundstellen, null unbewertet. Keine ganze Regel deaktiviert. |

Die paketierten Windows-/Mac-Sidecar-Smokes prüfen tatsächlich gemischte Formate,
passive PDF/PPTX-Inhalte, 1.500 Fundstellen je Datei/4.500 in der ersten Gruppe,
Firma/Person, Folgegruppen, Vertagen/Neustart, laufweite Entscheidungen, genaue
CSV-Fehlerdateinamen und originale OCR-Crop-Pixel/Korrektur in beiden Zwecken.
Dies ist ausdrücklich getrennt von Tauri-/WebView-Klickabnahme. Drei ignorierte
Rustfälle sind direkt vom jeweiligen Eltern-Regressionsfall gestartete
Subprozesshelfer, keine als bestanden umetikettierten Bedienprüfungen.

Zusätzlicher lokaler Byteabgleich ohne Desktop: 190 enthaltene Windows- und
je 188 Mac-Serverdateien entsprechen exakt dem Releasecommit; 188 Linux-Dateien
wurden nach reiner AppImage-Extraktion in WSL ebenfalls verglichen. Alle drei
beigelegten Startanleitungen sind bytegebunden und beschreiben Workspace-v2,
vorgemerkte Sammelentscheidungen, ausdrückliche Dokumentfreigabe und getrennten
KI-Export. Der gemeinsame Einstieg ist `workspace.html`, ohne Demo-/Engineering-
Override. Die vollständige Sicherheitskampagne bindet denselben Paketcommit.

| Archiv | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 111025829 | `dda85b25d4938f96044fd7180ece9a633b94db2816dd562b9f9efa510eedd627` |
| macOS Intel ZIP | 119219214 | `3ee201f259544ee19d5c1a790e44897f9d29b71731e6e652a419c5e80e41071a` |
| macOS Intel DMG | 116724973 | `66bc0d15213ea655c228a13a216b1201f0e82cbe3e2140136fc48b4d88898431` |
| macOS Apple Silicon ZIP | 115912271 | `c83fc8255228861154e47e79642e64a4d26069f374a789050f233ebc50f1d691` |
| macOS Apple Silicon DMG | 112817182 | `46601f453a076a37b5fab0b92ce915c1cf78cc3f03958f8b5aeab76b2614b169` |
| Linux x64 glibc ZIP | 195727226 | `a6f1046f8d2336d6c98858599e19fea1d32f94fd8d3590307cbcb5dabca769bd` |

Lokale maschinenlesbare Belege:
`dist/rc159-prerelease-assets-7af2a9d/VERIFIED-RELEASE-ASSETS.json` und
`VERIFIED-PUBLICATION.json`. Sie sind Engineering-Evidenz, kein zusätzlicher
öffentlicher Dokumentupload. Der saubere Cowork-Source-Bau, sein ZIP-Gate mit
150 Prüfungen/231 Einträgen und die installierte strenge Claude-Strukturprüfung
bestanden ebenfalls auf diesem Commit, ohne ein neues Cowork-Paket zu publizieren.

Menschliche N3/N4-, Zielhost-/Accessibility-/Update-/Rollback- und
Produktionsfreigaben bleiben offen. Der lokale Anwenderdesktop wurde nicht
bedient; sechs lokale Windows-Formfälle bleiben `NOT_RUN`. Macs sind nur
ad-hoc-signiert, nicht Developer-ID-signiert/notarisiert; Mindestversion 13.5
binär geprüft, tatsächliche Runner Intel 15/ARM 14, reale 13.5-UAT offen.
Die synthetische 72-Varianten-Qualitätsmessung bleibt eine getrennte Quell-/
Runtime-Messung, keine exakte Paket-/menschliche Qualitätsabnahme. Neun rohe
OCR-E-Mail-Abweichungen sind weiterhin Warnungen, nicht behoben; nach gebundenen
Referenzentscheidungen wurden dort keine bekannten finalen Restdaten oder
Sachwortverluste gemessen. Keine allgemeine Anonymitäts-/Extraktionsgarantie.

### RC159 – Historische Vorbereitung und verworfene Kandidaten (11.10.2026)

Die folgenden datierten Zwischenstände beschreiben damalige Sperren und
Korrekturen. Der aktuelle veröffentlichte Paketstatus steht oben; diese
Zwischenarchive und ihre noch offenen Runnerzustände sind keine Releasebindung.

**Abschließender Dokumentationsabgleich:** Der Paketschnitt `6e64e53` bestand
Windows, Apple Silicon und Linux; Intel-Mac befand sich noch im Build.
Vollständige Security auf Audit-Folgecommit `2ed119e` bestand; nur Triage-
Metadaten unterscheiden sich. Vor Veröffentlichung fand der unabhängige
Release-Review jedoch veraltete tatsächlich beigelegte Startanleitungen.
Diese werden auf Workspace-v2, vorgemerkte Gruppenentscheidungen, ausdrückliche
Dokumentfreigabe und getrennten KI-Export korrigiert. Eine neue Drei-Plattform-
Dokumentregression verlangt die aktuellen Aktionen. Neue Paketläufe binden
diesen korrigierten Schnitt; die vorherigen Archive werden nicht veröffentlicht.

Der dritte Runnerstand `e88048e` bestand die Sicherheitsprüfung (`38165242497`),
aber noch nicht alle Paketgates. Die Source-CI importierte über einen reinen
Assertion-Helfer voreilig das native Canvas-Addon; dieser Import ist nun erst
bei tatsächlicher Bildgenerierung erforderlich, ohne Ersatzbilder oder Skip
des realen Konvertertests. Eine frische Gegenprobe besteht mit 22 Smoke-
Integritätsfällen und 47 realen Windows-Konvertergruppen.
Die native macOS-Erstbindung scheiterte: Apples ACL-API meldet bei fehlender
ACL `ENOENT`, das vorher als Schutzfehler behandelt wurde. Statt Fehlercodes
pauschal freizugeben, fragt der korrigierte Rust-Pfad einen `filesec`-Snapshot
über den gehaltenen FD ab und akzeptiert ausschließlich positiv bewiesene
Abwesenheit oder eine nachgewiesen leere ACL. Native Tests unterscheiden
nie gesetzte/leere ACL und verweigern weiterhin Allow/Deny/Inherited-Einträge;
die Fixture setzt den Tag jetzt vor dem Qualifier gemäß Apple-Vertrag.
Linuxs Wiederherstellung scheiterte beim sofortigen Lock-Neuerwerb nach Drop.
Ein nicht klonbarer RAII-Guard gibt Unix-`flock` ausdrücklich frei; ein
deterministischer Duplikat-Gegentest hält die alte Open-Description offen und
prüft auch, dass deren späteres Schließen die neue Sperre nicht freigibt.
Die konkrete Fork-Zeitlücke des Runnerfehlers wurde nicht per PID nachgewiesen.
Exklusivität, Nonblocking-Erwerb, gehaltene Identität und Windows-Share-Regeln
bleiben unverändert. Zwei unabhängige begrenzte Reviews und die tatsächliche
Windows-Node/Rust-Exportgegenprobe bestehen; neue native Mac-/Linux-Paketgates
stehen vor Veröffentlichung weiterhin aus.

Der Intel-Mac-Exporttest zählte zusätzlich kalte Rust-Kompilierung gegen das
180-Sekunden-IPC-Budget. Der Plattformvertrag führt jetzt zuerst die komplette
Rust-Suite aus, dann den tatsächlich nativen Node/Rust-Export; das IPC-Budget
bleibt unverändert und wird nicht zur Kompilierzeitgrenze umgedeutet.
Der Windows-Runner bestand echte v2-Start-/IPC-Evidence, scheiterte danach an
einem nach Inventarisierung verschwundenen WebView-Lockfile. Der Launcher wartet
jetzt vor Inventarisierung begrenzt auf das Ende der exakt isolierten WebView-
Profilprozesse, hält Prozessinstanzen gegen PID-Wiederverwendung und bricht bei
fehlender Ruhe ohne Löschung ab. Kein globales WebView-Kill und kein pauschales
Überspringen von Fehlern in der strengen Löschphase.

Vierter Schnitt `d02f31a`: Security `38166846003` bestanden. Linux stoppte
an einer echten Vorschau-Löschfreigabelücke: Der Löschplan durfte nach Probe-
Close einen Ersatz mit wiederverwendeten Objektkennungen adoptieren. Der Fix
behält den vollständigen ursprünglichen BigInt-Dateisnapshot inklusive Größe,
Linkzahl, mtime/ctime bis zur letzten Zielprüfung. 26 Retention- und neun
Löschgrenzfälle bestehen unter Windows sowie WSL-Ubuntu mit verifiziertem
Node 22.23.2; die letzte portable Pathname-TOCTOU-Grenze bleibt dokumentiert.
Mac-Kompilation benötigt den ausdrücklich typisierten ACL-Ausgabezeiger
`*mut c_void`. Auch dieser fehlgeschlagene Schnitt wird nicht veröffentlicht;
neue native Paket-/Sicherheitsgegenprobe erforderlich.

Der erste Runnerstand `2c7e246` ist noch kein Release-PASS: Windows
(`38161424808`) und beide Macs (`38161427084`) stoppten an nicht kanonischen
temporären Testwurzeln. Linux (`38161429686`) las einen früheren OCR-Gegenfall
korrekt und scheiterte an der Windows-spezifischen Fehlererwartung. Die
Source-CI (`38161416046`) hatte neue echte Konverterszenarien ohne ihre nativen
Ressourcen gestartet. Korrekturen betreffen Testpfade und ehrliche Trennung:
Nur die kostenbegrenzte Source-CI meldet diese drei ressourcenabhängigen
Sidecar-Szenarien `NOT_RUN`; Headless-/Standalone-/Paketgates verlangen sie.
Produktschutzprüfungen bleiben unverändert. Die frische Sicherheitsanalyse
(`38161432222`) verlangt neun neue/unzugeordnete Befunde: Ein tatsächlicher
Engineering-hOCR-ReDoS wird durch einen begrenzten Tagscanner ersetzt, das
Vorschauwerkzeug liest Konzepte jetzt über gehaltene Dateiobjekte. Übrige
Fundstellen werden einzeln mit Quelle/Fingerprint triagiert. Wiederholte
native Paket- und Sicherheitsläufe bleiben vor Veröffentlichung erforderlich.

Zweiter Stand `b4f298d`: CodeQL (JavaScript und nativer Launcher) sowie Gitleaks
bestanden (`38163037081`). Die Paketläufe stoppten an weiteren tatsächlichen
Test-/Buildgrenzen: Elternprozess erwartete auf macOS das eigene statt des
isolierten Kindprofils; Windows-Cleanup nahm gleiches TEMP-/Checkout-Volume an;
Linux-Clippy entdeckte eine nur unter macOS benötigte veränderliche Variable.
Korrekturen erhalten die Schutzverträge. Der Source-CI-Konfigurationstest wird
in konkurrierende unveränderliche Reservierungen und deterministisch
abgewiesenen Settingsaustausch mit ausdrücklich frischer Anfrage getrennt.
Kein blindes Wiederholen von Sicherheitsfehlern und keine allgemeine
Zusicherung gleichzeitiger erfolgreicher Settings-Erstschreibvorgänge.
Die frische lokale Gesamtgegenprobe nach diesen Korrekturen besteht mit
219 Headless-Testdateien, 108 Windows-Rusttests, Clippy, Dokumentations- und
strenger lokaler Claude-Strukturprüfung. Sechs Windows-Formfälle bleiben
`NOT_RUN`; kein lokales sichtbares Fenster wurde bedient. Die beiden behobenen
Engineering-Lücken sind im frischen SARIF nicht mehr enthalten: 84 verbleibende
Befunde sind einzeln quell-/fingerprintgebunden revalidiert, null unbewertet.
Dies ersetzt weiterhin nicht die noch ausstehende exakte neue Paketbindung.

Gezielte lokale Gegenproben nach den Korrekturen: 47 reale Windows-
Konvertergruppen, 39 Dokument-/Exportfälle, acht reversible Entitätsfälle,
elf laufweite Entitätsfälle und 20 gehaltene I/O-/Diagnosegrenzen bestanden.
Der neue hOCR-Scanner bewahrt alle 13.079 Gruppen in 399 gespeicherten
synthetischen Diagnosen; isolierter Malformed-Prozess und unabhängige
Sicherheitsgegenprüfung bestanden. Das ist kein nativer Mac-/Releasearchiv-
Bediennachweis und keine neue OCR-Qualitätszusage.

Der Anwender hat Commit/Push auf `main`, Prerelease-Testpakete für Windows x64,
beide Mac-Architekturen und Linux x64 glibc sowie die vorhandenen GitHub-
Buildworkflows einschließlich möglicher Kosten ausdrücklich beauftragt.
Der reguläre native Einstieg ist für diese Pakete `workspace.html`; kein
Engineering-Override und keine Demo-Verarbeitung. Veröffentlichung und exakte
Quell-/Archivbindung werden hier erst nach erfolgreicher Paketprüfung ergänzt.
Lokale sichtbare Bedienung ist nicht autorisiert; menschliche Plattform-/
Accessibility-Abnahme bleibt getrennt. Bekannte rohe OCR-Abweichungen bleiben
sichtbare Warnungen nach DS-110, keine Zusage fehlerfreier Extraktion.

Frische lokale Vorbereitung: 108 Windows-Rusttests/Clippy und Dokumentations-/
Versions-/strenge Claude-Strukturprüfung bestanden. Qualitätsmessung
`dist/quality-prerelease-rc159-20261011/BERICHTE/QUALITAET.json`: 72 Varianten in
beiden Zwecken technisch vollständig; nach 55 synthetischen Kontaktbestätigungen,
neun Referenzkorrekturen und 202 Entitäts-Vorkommensentscheidungen null bekannte
finale Restdaten, unbewertete Vorkommen oder Sachwortverluste. Standardgate
`pass_with_warnings`; neun rohe OCR-E-Mail-Abweichungen bleiben. Dies ist eine
quell-/runtimegebundene synthetische Messung, keine exakte Releasepaket- oder
menschliche Qualitätsabnahme. Ein zusätzlicher Read-only-Review bestätigt den
Buildvertrag: neue native Starts müssen `workspace_page_loaded` und erfolgreiche
aktuelle IPC-Antworten derselben Sitzung nachweisen; bloße Anfragen genügen nicht.

Der frisch kompilierte lokale Windows-Vorbereitungsschnitt ist als
`dist/engineering-prerelease-rc159-20261011/DataSecure-Standalone-3.2.0-rc159-windows-x64.zip`
verifiziert (SHA-256
`931d755312d022689aa89d7574adc680c7ad2aa365138492834527e3db2d8682`,
611 Archiveinträge). Der isolierte Smoke aus genau diesem ZIP besteht: reale
gemischte Konvertierung, passive PDF-/PPTX-Inhalte, Review-/OCR-IPC in beiden
Zwecken, Folgegruppen, Vertagen/Neustart, laufweite Entscheidungen und genaue
Fehlerdateinamen. Kein lokaler Tauri-/WebView-Bediennachweis; das ist noch nicht
das spätere, an den Releasecommit gebundene Runnerpaket.

Zusätzliche unabhängige Sicherheits-Revalidierung: Die 17 bisherigen,
individuell gebundenen SARIF-Fundstellen in acht geänderten Dateien behalten ihre
belegten Triagegründe (gehaltenes Dateiobjekt oder isolierte synthetische
Testassertion). Die exakten Quellhashes wurden aktualisiert; Fingerprintbindung,
Duplikatprüfung und Ablehnung unbekannter Befunde bleiben unverändert.
Zehn strenge SARIF-Gate-Negativprüfungen bestehen. Das ersetzt keine frische
CodeQL-Analyse; neue/veränderte Fundstellen sind vor Veröffentlichung gesondert
zu bewerten. Der History-Metadatenleser erhält damit ausdrücklich keine
allgemeine Race-Freiheitszusage.

Der frische Gesamtprodukteingang `test:product:headless` besteht mit allen
218 Testdateien, einschließlich des realen Node-/Rust-Exports mit 10.001
Kontaktwerten und produktübergreifender Abbruch-/Neustart-/Review-Gegenproben.
Sechs native Windows-Formfälle und menschliche GUI-/Zielhostabnahme bleiben
ausdrücklich `NOT_RUN`; kein sichtbares lokales Fenster wurde bedient.

Zum damaligen Prüfzeitpunkt lag RC161 nur als ungebundener Entwicklungsstand
vor; Cowork blieb RC151. Diese historische Notiz beschreibt nicht den
heutigen Veröffentlichungsstatus.
Die folgenden RC157-Anwendernachweise bleiben auf ihren damaligen Schnitt
begrenzt; die neue technische RC158-Paketbindung steht im nächsten Abschnitt.
ZIP-Verifikation, isolierter Paket-Smoke und
nativer Start einschließlich geladener Prüfseite bestanden. „Jetzt prüfen“
öffnet die lokale Prüfung direkt aus der aktuellen Laufkarte; gezielte
Frontend-/Service-/IPC-Tests bestätigen die Bindung an diesen Lauf.
Der RC157-Windows-Anwenderlauf `3d6b69b7` samt lokaler Prüfung und
Stapelverarbeitung wurde am 30.09.2026 ausdrücklich als vollständig bestanden
bestätigt. Die nur lesende Nachkontrolle findet 140 Markdown-Ergebnisse,
140 Dateizuordnungen und die vertrauliche Identitäts-TXT mit 140/140 erfassten
Ergebnisdateien. Der frühere RC156-Lauf `ca4349c5` bestand ebenfalls.
Der abschließende Release-Review fand einen Einzeldokument-Randfall: Auch ein
einziger mehrdeutiger Inhalt wird nun ausdrücklich in den Standalone-App-Review
vertagt, statt während der Analyse den alten nativen Dialog zu öffnen.
Ein gezielter Drei-Plattform-Vertrag prüft dies; Coworks Einzelreview bleibt
unverändert. Der veröffentlichte Windows-Neubau wurde deshalb zusätzlich technisch
geprüft und wird nicht als bytegleich zum vorherigen Anwender-Test-ZIP behauptet.
Die bestätigte Windows-Funktionsabnahme ist bestanden; technische Paketprüfung
ersetzt keine noch fehlenden menschlichen Zielhost- oder Spezialabnahmen.

### RC158 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Das [RC158-Prerelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc158)
ist aus Quellcommit `f4caf948bde39dbebe8fe359235c3be84f189e5d`
veröffentlicht. Fünf Pakete und fünf zugehörige SHA-256-Dateien sind verfügbar.
Der GitHub-Tag bindet diesen exakten Commit; alle zehn hochgeladenen Asset-
Digests und Größen stimmen mit den verifizierten lokalen Dateien überein.
Alte Downloads werden nicht ersetzt; Linux RC157 und Cowork RC151 bleiben getrennt.

Die bestätigten Diagnose-/Leselücken und zusätzlichen Status-/Retention-
Restbefunde sind korrigiert und unabhängig gegengeprüft. Gehaltene,
begrenzte Reader, exklusive Diagnose-Segmente, native relative Diagnosehandles,
gebundene Wiederherstellung und kohärente Runtime-Inventare bleiben strikt.
Der Archive-Hasher streamt mit höchstens 64 KiB Puffer; bestehende Reader- und
Entpackgrenzen werden dafür nicht erhöht.

Am exakten Paketquellcommit bestehen:

- vollständige lokale Produktsuite: 76 Basis- und 119 direkte Testdateien
  (195 insgesamt), Dokumentationsgates, 49 Windows-Rusttests und strenges Clippy;
- sauberer Build, Plugin-ZIP-Verifikation und installierte Claude-CLI-
  Validierung von Plugin und Marketplace; keine Cowork-Neuveröffentlichung;
- Windows PKG-04: zwei saubere bytegleiche Archive, 593 Einträge,
  reale 41 Konvertierungsgruppen ohne SKIP, Paket-/Worker-/Review-/History-Smokes
  und native Haupt-/Prüfseitenladung mit erfolgreichen IPC-Antworten;
- Intel und Apple Silicon: native Produkt-/Konvertierungs-/Rustgates,
  strenges Clippy, Signatur-/Architekturprüfung, bytegleiche ZIP-Zweifacharchivierung,
  extrahierte Paketprüfung einschließlich LaunchServices und Review-IPC-E2E;
  DMG read-only gemountet, identische signierte App und Applications-Link geprüft;
- [frische Security-Kampagne](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37393841557):
  vollständige Gitleaks-Historie, native Windows-CodeQL (0 Befunde) und
  JavaScript-CodeQL (78 individuell, fingerprint-/quellhashgebunden geprüfte
  Befunde, 0 ungeprüfte); keine regelweite Ausnahme;
- [Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37393753781)
  und [native Mac-Kampagne](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37393753525)
  erfolgreich an demselben Commit.

Windows-Evidence liegt in
`dist/rc158-release-source-final/dist/pkg-04/f4caf948bde39dbebe8fe359235c3be84f189e5d/`:
`PKG-04-RECEIPT.json` SHA-256
`488536ea90bcd1c94bae7f480ba073dcfb5738242cf143a6c32b0cc3e070752c`
und `INT-13-BINDING.json` binden Kandidat A. `native_review_decisions` ist
ausdrücklich `not_run`: native Seitenladung/IPC und paketierter Review-E2E
werden nicht als bediente Tauri/WebView-Kampagne ausgegeben.

| RC158-Standalone-Paket | Byte | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 110413882 | `013823670571c32229c84c89a0374cab6977e18fa36aa92cf6c03cca921ea2a6` |
| macOS Intel ZIP | 118596830 | `d4b385144b94c99366b442e43a3e21e7d0b535c195deab195081b67fb587756e` |
| macOS Intel DMG | 116121175 | `62708d5a67615edf34878426b25437673426c67b7ccf7409cc6e4b9ade563007` |
| macOS Apple Silicon ZIP | 115304343 | `d023ee29d46e279ecf3cd1359a45b1dd685f5a55293ff6fb02bb816968e19db6` |
| macOS Apple Silicon DMG | 112218341 | `9f1705e66433dc6eeb0dabe14e2145545e235f31bafbaedaf5afd24d8841e6ef` |

Mac-Pakete sind nur ad-hoc-signiert, nicht Developer-ID-signiert oder notarisiert.
Native Ausführung erfolgte auf macOS 15 Intel und macOS 14 ARM; macOS 13.5
ist der geprüfte Binärvertrag, kein ausgeführter Mindestversions-Gerätetest.
Menschliche N3/N4-, Finder-/Gatekeeper-, Accessibility-, Update-/Rollback- und
Produktionsfreigaben bleiben offen. Unabhängige Reviews und grüne Gates sind
keine Garantie vollständiger Erkennung oder rechtlicher Anonymität.

### RC158 – historische Releaseblocker und Nachbesserung

Die folgenden Zwischenstände erklären die aufgefundenen Lücken, abgebrochenen
Kampagnen und deren Behebung. Damals ausstehende Gates sind inzwischen durch
die oben an `f4caf94` gebundene Veröffentlichung ergänzt; alte fehlgeschlagene
Läufe bleiben ausdrücklich kein PASS.

Die native Wiederholung am Quellcommit `26fdce9` bestand die frische
Security-Kampagne `37390631300` und Pflicht-CI `37390631909`. Im Mac-Lauf
`37390634725` wählte ein Rust-Test über die unbestimmte Verzeichnisreihenfolge
das bestehende Hauptlog statt des exklusiven neuen Segments. Der Test schließt
jetzt Hauptlog und Archiv ausdrücklich aus, verlangt genau ein neues Segment
und bindet es zusätzlich an die Identität des gehaltenen Handles. Die
Produktdiagnose wird dadurch nicht gelockert. Ein zweiter Test verwechselte
die zufällige Zeichenfolge „Max“ innerhalb eines HMAC mit einem Klartextnamen;
sein Orakel prüft nun vollständige Namenswörter und gezielte Klartext-Gegenbeispiele.
Diese Korrekturen benötigen neue vollständige Paketgates; der alte Lauf ist
kein bestandener Mac-Paketnachweis.

Die Windows-Paketgegenprobe an `26fdce9` scheiterte im Diagnose-Orakel,
nicht in den bereits bestandenen paketgebundenen IPC-/Review-Szenarien:
Windows 11 Build 26200 verweigerte den relativen NtCreateFile-Zugriff auf
ein frisches direktes Kind von LocalAppData mit `STATUS_REPARSE_POINT_ENCOUNTERED`,
obwohl Win32-Metadaten und fsutil keinen Reparsepunkt meldeten. Derselbe echte
Rust-Sink besteht im temporären Namespace auch optimiert; derselbe Paketkandidat
besteht dort native Haupt-/Prüfseitenladung und erfolgreiche IPC-Antworten.
Der Harness legt sein neues, vollständig gebundenes und isoliertes Profil nun
dort an. OBJ_DONT_REPARSE, exklusive Neuanlage, strikte Verzeichnis- und
Cleanup-Bindung bleiben unverändert. Daraus wird keine Antivirusursache und
keine allgemeine Aussage über LocalAppData auf anderen Windows-Geräten abgeleitet.
Der bisherige Checkpoint ohne Desktopprotokoll ist kein Nachweis eines
WebView-Initialisierungsfehlers. Neue abschließende Paketgates stehen weiter aus.

Die unabhängige ACL-Gegenprüfung fand zusätzliche Schreibprincipals im
geerbten Temp-ACL dieses Hosts. Deshalb erhält der neue Testroot bereits bei
seiner Erstellung eine geschützte DACL ausschließlich für den aktuellen
Benutzer, SYSTEM und Administratoren. Owner und exakte Access-SDDL werden vor
Identitätsbindung geprüft; keine nachträgliche offene ACL-Phase. Neun reale
Cleanup-/Substitutionsgruppen einschließlich der privaten DACL bestehen.

Der Intel-Mac-Bau desselben alten Schnitts bestand Bundle-Signatur, native
Architekturen und Haupt-/Prüfseiten-IPC, scheiterte aber beim ZIP-Hashlesen:
Der Aufrufer übergab 768 MiB, während der sichere gehaltene Reader höchstens
512 MiB zulässt. Mac- und Linux-Distributionsbuilder hashen Archivbytes nun
deskriptorgebunden mit höchstens 64 KiB Puffer und 768 MiB Gesamtbudget;
die bestehende Buffer- und ZIP-Entpackgrenze bleibt unverändert. Regressionen
prüfen die tatsächlichen Builderlimits, genaue Grenzen, kurze Reads, FD 0,
Austausch, Wachstum, Elternwechsel und Fehler-Cleanup. Auch dieser technische
Zwischenstand benötigt eine neue vollständige native Paketkampagne.

Der Anwender hat am 05.10.2026 Commit und Push auf main sowie neue
Windows- und macOS-Vorabpakete beauftragt. RC158 enthält die revalidierten
Korrekturen DS-106–109. Windows x64 wird aus einem sauberen Quellcommit
zweimal gebaut und paketgebunden geprüft; macOS Intel und Apple Silicon
werden im bestehenden nativen Zielplattformworkflow als ZIP und DMG gebaut.
Dieser ausdrücklich beauftragte Releasebau ist eine Ausnahme vom normalen
lokalen Arbeitsweg ohne manuelle Actions-Läufe. Alte Archive werden nicht
ersetzt. Cowork RC151 und Linux RC157 bleiben ihre getrennt veröffentlichten
Kandidaten; lokale Cowork-Buildgates sind keine Cowork-Neuveröffentlichung.

Commit-, Archiv- und Hashbindung werden erst nach erfolgreichem Paketbau
eingetragen. Automatisierte technische Nachweise ersetzen weder die erneute
Windows-Anwenderabnahme des exakten RC158-Pakets noch Mac-Finder-/Gatekeeper-,
Accessibility- oder formale N3/N4-Abnahme. Mac-Pakete bleiben ad-hoc-signiert,
nicht Developer-ID-signiert oder notarisiert.

Die erste RC158-Gegenprobe am Commit `e2e08dd` bestand Produktsuite
(75 Basis- und 119 direkte Testdateien) und Pflicht-CI. Sie fand zwei echte
Releaseharnessfehler: PKG-04 bereitete im frischen Windows-Checkout die Runtime
nicht vor den Rusttests vor; eine Mac-Integritätsfixture enthielt keine
regulären Unix-Dateimodi. `ae9bf02` korrigiert Vorbereitung und Testarchiv,
ohne den Paketverifier zu lockern. Die gültige Fixture besteht zuerst die
Integritätsprüfung; ihre anschließende Mutation wird weiterhin verworfen.

Die vollständige Gitleaks-8.30.1-Historienprüfung fand drei unabhängig
revalidierte synthetische Regressionseingaben, keine belegten Betriebsgeheimnisse.
`.gitleaksignore` bindet ausschließlich deren exakte Commit/Datei/Regel/Zeilen-
Fingerprints; Regeln, neue Treffer und die vollständige Historie bleiben aktiv.
Die lokale Wiederholung über 493 Commits bestand; ein zusätzlich eingespeister
neuer synthetischer Credential-Test wurde weiterhin abgelehnt. Der native
CodeQL-Lauf bestand. Die JavaScript-SARIF-Befunde werden getrennt revalidiert;
diese Zwischenstände sind keine abgeschlossene RC158-Sicherheitsfreigabe.

**Konkreter Releaseblocker vom 05.10.2026:** Die
[JavaScript-Sicherheitsanalyse](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37374539610)
am Commit `e2e08dd` enthält 111 SARIF-Befunde. Ein unabhängiger Gegenreview
und eigene Quell-/Speichergegenproben bestätigen reale Dateisystemlücken:
`standalone/desktop-sidecar.js` schreibt und rotiert Diagnosepfade ohne
Datei-/Verzeichnisbindung; vorbereitete Links werden nicht verworfen.
Mehrere Konfigurations-, Mapping-, Export- und Runtime-Lesepfade prüfen einen
Pfad und lesen später erneut über diesen Pfad statt begrenzt über einen
gehaltenen Deskriptor. Bei `scripts/lib/bundled-runtime.mjs::readRegular`
akzeptiert eine Speichergegenprobe zehn substituierte Bytes trotz Limit und
Statgröße vier. Das ist keine behauptete native Ausnutzung auf einem Zielhost.
Die Änderungen `ae9bf02` und `9e59fb0` korrigieren diese Produktionsstellen nicht.

Die Ergebnisse sind nicht pauschal Sicherheitsfehler: geprüfte exklusive
Neuanlagen, bereits gebundene Deskriptoren, Testmutationen und synthetische
PDF-Kompatibilitätswerte liefern auch begründete False Positives. Eine
regelweite Unterdrückung oder ungeprüfte Baseline ist ausdrücklich keine
Lösung. Reale I/O-Lücken benötigen zuerst Korrekturen und Link-/Swap-/Wachstums-
Regressionen; bestätigte Fehlalarme eine eng gebundene dokumentierte Triage.

Die erneut gestartete Mac-Kampagne am Commit `9e59fb0`
([Lauf 37375755354](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37375755354))
wurde vor dem Zielplattformbau abgebrochen; der lokale Windows-PKG-04-Neulauf
wurde ebenfalls gestoppt. Es gibt daraus keine bestandenen Paketnachweise.
RC158 wurde weder getaggt noch als GitHub-Prerelease veröffentlicht. RC157-
Anwender- und Paketnachweise bleiben unverändert auf ihren bisherigen Schnitt
begrenzt; die neu gefundenen Lücken machen daraus keine Sicherheitsfreigabe.

**Nachbesserung vom 06.10.2026:** Die bestätigten Lesestellen nutzen jetzt
begrenzte Bytes des gehaltenen Deskriptors statt eines erneuten Pfadlesens.
Dateityp, Linkzahl, exakte BigInt-Identität, Größe, mtime und gebundene
Eltern werden geprüft; DS-070 bleibt erhalten (Daten-ctime ist kein
Identitätsmerkmal). Bestehende deskriptorgebundene Reader lesen positional
und größenbegrenzt; POSIX-Opens verwenden zusätzlich NONBLOCK, damit ein
geraceter FIFO nicht vor der Typprüfung hängen bleibt. Sichtbare Ausgaben
erlauben weiterhin nur ausdrücklich die eigene Zwei-Link-Crash-Recovery.

Sidecar-Diagnose rotiert ausschließlich in exklusiv neu angelegte Segmente,
ohne bestehende Archive zu löschen, umzubenennen oder zu kürzen. Kollisionen,
Teilwrite-, Postcheck- und Closefehler deaktivieren weitere Diagnose-I/O,
nicht das Produkt. Der native Desktop-Sink erstellt neue Dateien relativ zu
gehaltenen Verzeichnishandles (Windows NtCreateFile/OBJ_DONT_REPARSE; POSIX
openat/mkdirat) und schreibt ausschließlich über das eigene gehaltene Handle.
Neustart-Abnahme liest die sicheren Segmente zusammen. Der OCR-Cache bindet
Status und Identitäten gemeinsam und kontrolliert auch die gesamte Inventarmenge.

Gezielte lokale Gegenproben bestehen: Reader-/Diagnose-Tests einschließlich
Hardlinks, Junctions, Austausch, Größenwachstum, FD 0 und kurzen/fehlerhaften
I/O; reale Sidecar-IPC trotz defekter Diagnose; drei native Windows-Rust-
Diagnoseprüfungen einschließlich höherer Junction und gleichzeitigem Loglesen.
Die POSIX-FIFO-Gegenprobe bestand zusätzlich unter echtem Linux/WSL mit
checksumgeprüftem Node 22.23.2; sie ist kein nativer macOS-Nachweis.
Unabhängige Reviews führten zu zusätzlichen Korrekturen für Segmentkollision,
Teilwrites, Cache-Vermischung, große Datei-IDs und Neustart-Evidenz.
Der Review-Asset-Rollback verwendet die bei exklusiver Erstellung gebundene
Datei-/Elternidentität, niemals die frisch gelesene Identität einer Ersatzdatei.
Die reale Fremddatei-Substitution bei fehlgeschlagener Manifestveröffentlichung
bleibt erhalten; der unveränderte eigene Kandidat wird weiterhin bereinigt.

Die neue CodeQL-Triage ist pro Regel, Datei, exaktem Primärfingerprint und
normalisiertem vollständigem Quellhash gebunden. Geänderte Quellen, neue oder
doppelte Findings bleiben gesperrt; fehlende/fehlgeschlagene SARIF-Analysen
können keine Nullbefunde vortäuschen. Die alte Analyse wird nicht als neue
Freigabe verwendet. Die vollständige lokale Regression besteht mit 76 Basis-
und 119 direkten Testdateien; dazu bestehen 48 Rusttests, warning-free Clippy,
41 reale Windows-Konvertierungsgruppen und die Dokumentationsgates.
Die 15 Reader-/Diagnosefälle bestehen auf Windows (zwei POSIX-spezifische
Fälle ausdrücklich nicht ausgeführt) und vollständig auf Linux/WSL;
der zusätzliche Produkt-FIFO-Fall prüft echte Markdown-, Status- und SEA-Leser.
Frische Security-, saubere Windows-PKG-04- und beide
Mac-Paketgates sind noch ausstehend; RC158 bleibt bis dahin unveröffentlicht.

Die frische JavaScript-Analyse am Sicherheitscommit `b88c31b`
([Lauf 37385984596](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37385984596))
enthält 81 statt zuvor 111 Befunde. Native CodeQL- und vollständige
Gitleaks-Historienprüfung bestanden; die JavaScript-Freigabe blieb gesperrt.
Der erneute unabhängige Gegenreview bestätigte fünf zusätzliche Restlücken:
Status-App-Buildwrites konnten Ersatzdateien kürzen; Markdown-, Status- und
SEA-Quellreader banden Identitäten beziehungsweise Eltern unvollständig;
Preview-Retention konnte einen zweiten Pfadsnapshot als Löschberechtigung
übernehmen. Diese Stellen sind jetzt korrigiert, nicht pauschal ausgenommen.
Der Buildwriter prüft vor fd-Truncate/Write die ursprüngliche BigInt-Identität
und alle Eltern. Die drei Reader nutzen die gemeinsame begrenzte Held-I/O-
Grenze; Manifest und Dokument teilen ihre ursprüngliche Elternbindung.
Die Preview-Probe und das spätere Löschen verwenden denselben ersten Snapshot.

Gezielte neue Regressionen bestehen: 16 Reader-/Diagnosefälle unter Windows
(POSIX-Fälle weiterhin ausdrücklich nicht ausgeführt), 13 Status-Serverfälle,
26 Retentionfälle sowie Status-Buildwriter-, SEA-Evidence- und History-Prüfungen.
Die tatsächliche Dateisystem-ABA-Gegenprobe erhält sowohl das ursprüngliche
Preview als auch die verschlüsselte Ersatzdatei. Gültige Ausgangsartefakte
werden jeweils vor der Mutation akzeptiert; eine lediglich kaputte Fixture
kann deshalb keinen bestandenen Substitutionstest vortäuschen. Beide
unabhängigen Abschlussreviews fanden im begrenzten geprüften Umfang keine
verbleibenden reproduzierbaren P1/P2; dies ersetzt die neuen Releasegates nicht.
Die 16 Reader-/Diagnosefälle bestehen zusätzlich vollständig unter Linux/WSL
mit erneut checksumgeprüftem Node 22.23.2, einschließlich beider FIFO-Fälle.
Die neuen Retention-, Status-Reader-/Writer- und SEA-Reader-Regressionen sind
im gemeinsamen Standalone-Zielplattformgate registriert, damit Windows-PKG-04
und beide Mac-Builds sie tatsächlich erneut ausführen.
Der vollständige Produktschnitt nach diesen zusätzlichen Korrekturen besteht
erneut mit 76 Basis- und 119 direkten Testdateien, 48 Rusttests, warning-free
Clippy, Dokumentationsgates sowie der strengen installierten Claude-CLI-
Validierung von Plugin und Marketplace. Frische Security- und saubere
Paketprüfungen bleiben bis zu ihrem tatsächlichen Abschluss ausstehend.

Die weitere frische JavaScript-Analyse am Commit `61b342c`
([Lauf 37389042799](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37389042799))
enthält 78 Befunde. Die einzige neue untriagierte Stelle ist die absichtliche
Dateimutationsfixture in `tests/test-status-app-server.js`, keine Produkt-
Schreibstelle. Die reale Gegenprobe akzeptiert zuerst das gültige Artefakt,
verwirft die ausgetauschten Bytes vor dem ersten Lesen und akzeptiert das
ebenfalls gültige Ersatzpaar anschließend unabhängig. Nur dieser exakte
Testfingerprint wird zusätzlich quellhashgebunden dokumentiert. Alle 78
Befunde sind damit individuell eingeordnet; eine weitere frische Security-
Kampagne muss dies am endgültigen Paketquellcommit bestätigen. Die Pflicht-CI
und erneut 41 reale Windows-Konvertierungsgruppen bestanden am `61b342c`.

Die vollständige frische Security-Kampagne am `c5e3bf9`
([Lauf 37389586981](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/37389586981))
bestand Gitleaks sowie beide CodeQL-Gates mit 78 individuell eingeordneten
JavaScript-Befunden; die Pflicht-CI bestand ebenfalls. Die anschließenden
nativen Mac-Gates (`37389628567`) fanden einen echten Fixturefehler vor dem
Paketbau: Neue Markdown-Proben verwendeten den OS-Temp-Alias `/var/...`, den
die private Speichergrenze ausdrücklich ablehnt. Die Fixtures für Held-I/O,
Retention und die Windows-emulierende OCR-Cacheprobe verwenden jetzt den
kanonischen Temp-Pfad; Produktgrenzen und Assertions werden nicht gelockert.
Ein unabhängiger begrenzter Gegenreview fand keinen weiteren entsprechenden
Fixturefehler. Windows-Gegenproben und beide echten Linux-FIFO-Fälle bestehen.
Der laufende Windows-Bau am alten Testschnitt wurde gezielt beendet; daraus
wird kein PKG-04-PASS abgeleitet. Neue native Mac-Gates, saubere Windows-
Paketbindung und Security am endgültigen Commit sind weiterhin erforderlich.

Der Mac-Neulauf am `1f669c7` (`37390212355`) bestätigt alle neuen Held-I/O-,
Retention-, Status-, SEA-, Private-Work- und OCR-Gegenproben auf Intel/ARM.
Er deckt denselben Temp-Aliasfehler auch im neuen echten Publikationsharness
`test-residual-person-review.js` auf. Dessen globale Fixture und Cleanup-
Grenze verwenden nun ebenfalls denselben kanonischen Temp-Pfad. Ein weiterer
unabhängiger Review über alle 31 direkt registrierten JS-Testdateien und neun
lokale Testabhängigkeiten findet keinen zusätzlichen entsprechenden Aliasfall.
Der unveränderte Schutz gegen private Symlink-Vorfahren bleibt aktiv; die
fehlgeschlagenen Kampagnen werden nicht als Paket-PASS ausgegeben.

Keine darüber hinausgehende Garantie: Der portable Node-Reader schützt
geprüfte gehaltene Bytes und verwirft erkannte Namespace-Änderungen, ersetzt
aber keine atomare native Windows-openat-Schnittstelle. Gleichberechtigte
Prozesse desselben Benutzers können unter Unix nach einer Prüfung weitere
Hardlinks anlegen. Ein vorbereiteter fremder Inode wird im nativen Diagnose-
Sink trotzdem nicht zum Schreiben geöffnet. Menschliche Plattformabnahmen
und Developer-ID/Notarisierung bleiben getrennte Nachweise.

### RC157 – Standalone auf allen Zielplattformen

Das [RC157-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157)
bindet exakt Quellcommit `111737d28021b6989ffe8d563b58daa9cbae610f`.
Das getrennte Cowork-Plugin bleibt auf RC151; es wurde nicht neu veröffentlicht.

Die vollständige lokale Produktsuite und die
[Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770901121)
bestanden. Windows-PKG-04/INT-13 bestätigte zwei saubere, bytegleiche Builds
und native Paketprüfungen beider Archive einschließlich des integrierten
Prüffensters. Das Windows-ZIP umfasst 110.338.453 Byte.

Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770900387)
bestand auf Intel und Apple Silicon: Konverter, Architektur, Signatur,
eingebettete Mindestversion aller nativen Komponenten, App-/LaunchServices-Start
und geladene integrierte Prüfseite. Die ZIP-Archive wurden jeweils zweimal
bytegleich erzeugt; ZIP und zusätzliches DMG enthalten dieselbe App.
Das schreibgeschützt gemountete DMG samt Programme-Link und App-Start wurde
ebenfalls geprüft. Das
[Linux-x64-glibc-AppImage-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770904442)
bestand Konverter-, Paket- und native App-/Prüffenster-Smokes; auch sein
ZIP-Archiv wurde zweimal bytegleich erzeugt.

Alle zwölf veröffentlichten Assets – sechs Pakete und ihre eigenen
`.sha256`-Dateien – stimmen in Größe und SHA-256 mit dem lokalen Staging überein.
Die bestehenden RC151- und älteren Assets bleiben unverändert.

| RC157-Standalone-Paket | SHA-256 |
|---|---|
| Windows x64 ZIP | `16130005616a8a93a48d27f0714208d56042eda6e409160673904ec728a2e996` |
| macOS Intel ZIP | `c9ac0f1f6e25ec243d7f9c9bd67dd0774bd91ee39a2d2e5bc6978f640472fa59` |
| macOS Intel DMG | `1269581859cb478d0c653c578b22d319e4c2dad5838f025ae301afe08acd9b03` |
| macOS Apple Silicon ZIP | `f60ac9cadd0536950561e42a5c5b8bb7eac2eb1b0cda7d4917ea92bddbf0ad26` |
| macOS Apple Silicon DMG | `89bfbd99903a6fff55fc9d301da7c4a64581deb0d8fbcc3f29ea78ec9a40d6b0` |
| Linux x64 glibc ZIP | `81edb37ef19f2dca528b47a7c5ddd21a6eddcd4ddb5db9d6ec24666c978cda5f` |

macOS verlangt mindestens 13.5; die tatsächlichen nativen Runner liefen auf
14/15. Die Mac-App ist ad-hoc-signiert, nicht Developer-ID-signiert oder
notarisiert. Sichtbare Finder-/Gatekeeper-/VoiceOver- und tatsächliche
13.5-Abnahmen sowie Linux-Desktop-/Accessibility-Spezialfälle werden nicht aus
den automatisierten Starts abgeleitet. Linux wurde auf Ubuntu 22.04 mit
glibc 2.35 geprüft. Der bestätigte Windows-Anwenderlauf bleibt bestanden;
die Veröffentlichung als RC ist keine pauschale Produktionsfreigabe.

### RC151 – Standalone und Cowork auf allen Zielplattformen

Das [RC151-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151)
bindet den sauberen Quellcommit `fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3`.
Die [Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36615798739)
und die lokale vollständige Produktsuite bestanden. Windows-PKG-04/INT-13
bestätigt zwei saubere, bytegleiche ZIP-Bauten, Paket-/Worker-Prüfungen und
native Starts beider Archive. Das veröffentlichte ZIP umfasst 110.303.055 Byte
und hat SHA-256
`5108d3957c4987088519cf26ce2c5aba4df5611f9f993aa17c027ab1a82230c7`.
Die GitHub-Asset-Digests des ZIPs und seiner `.sha256`-Datei wurden mit den
lokalen Dateien abgeglichen.

Standalone-macOS Intel und Apple Silicon wurden aus demselben Quellcommit
als ZIP und zusätzlich DMG gebaut. Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618883915)
prüfte je Architektur den Binär-/Signatur-/Mindestversionsvertrag, den
gebündelten Konverter, den App-Start und die identische App in ZIP und DMG.
Das Linux-x64-glibc-AppImage-ZIP bestand seinen
[nativen Paket- und App-Startlauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618884302).
Die heruntergeladenen Archive stimmen mit ihren eigenen `.sha256`-Dateien
überein. ZIP bleibt auf dem Mac erhalten; DMG ist ein zusätzlicher Installationsweg.

Das getrennte Cowork-Plugin bestand mit den normalen Windows-x64-, macOS-Intel-
und macOS-ARM-ZIPs die [nativen Zielplattform-Smokes](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618886944).
Der [Release-Evidence-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618887161)
baute zusätzlich das getrennte Windows-Debug-ZIP und band Normal/Debug an eine
leere Windows-UAT-Vorlage; der Windows-Normalbau ist in beiden Workflows
bytegleich. Die veröffentlichte Cowork-SBOM und `SHA256SUMS` wurden aus genau
diesen vier ZIPs und der UAT-Vorlage neu erzeugt. Alle Modellgates in der Vorlage
stehen auf `NOT_RUN`, nicht auf `PASS`.

| RC151-Standalone-Archiv | SHA-256 |
|---|---|
| macOS Intel ZIP | `db1dca19d24637ac545da58ec0655d88136fb433c8ae267af95812124b17b1c5` |
| macOS Intel DMG | `5f06d1cc1e3dd19e7361ceb49a5dfadaf1aa25d56af766f513ab9ba5661783c1` |
| macOS Apple Silicon ZIP | `7b606108cd4a61043b9f0b678af9f465bb5d2c631f418eaf9a1a43e56965a22a` |
| macOS Apple Silicon DMG | `81683ab53bbae1b4f0d67a4e65491b349a79e9835be70a161ff3d62246db98d1` |
| Linux x64 glibc ZIP | `5626a40bee98f9502d22a10a4174eaeb74f3887937c2f2f3706893a56c7f0342` |

Alle 19 RC151-GitHub-Assets, einschließlich Cowork-Paketen, SBOM und
Prüfsummendateien, stimmen in Größe und SHA-256 mit dem lokalen Staging überein.

RC151 bündelt die Standalone-Korrekturen für neue Läufe, Dateiauswahl,
Fehleranzeige und lokale Prüfentscheidungen sowie die ergänzten
Datenschutz-/Formatregressionen. Der erneute vollständige 140-Dateien-Lauf
auf dem Benutzer-Zielhost, menschliche N3/N4-Abnahme und Produktionsfreigabe
bleiben offen. Sicher gestoppte Dateien werden nicht automatisch freigegeben.
Mac-Finder-/Gatekeeper-, Linux-Desktop- und Cowork-Modellabnahmen sowie die
formale N3/N4-Freigabe bleiben ebenfalls offen. Ältere Assets werden nicht überschrieben.

### RC142 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Das [RC142-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142)
bindet exakt Quellcommit `c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d`.
Die [Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562791648)
und die lokale vollständige Produktsuite sind grün. Windows-PKG-04/INT-13
bestätigt zwei saubere, bytegleiche Builds und native Smokes beider ZIPs.
Der Windows-ZIP-Hash ist
`4a358f4534f6b678265406a8aa1a7829ba241a97562cea30a997a2ee5c6e08f1`.
Der exakt gepackte Kandidat konvertierte zusätzlich die fünf im RC140-UAT
gescheiterten realen PDF-/PPTX-Dateien ohne Inhaltsprotokoll; jede Ausgabe
behielt den ehrlichen Grad `incomplete`. Die passive Ausnahme gilt nur für reine
Standalone-Konvertierung, nicht für Anonymisierung oder Cowork.

Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562812021)
prüfte Intel und Apple Silicon separat: dieselbe ad-hoc-signierte App im
unverändert weiter angebotenen ZIP und im zusätzlichen DMG, Architekturen,
Signatur, Start, gemountetes DMG und `/Applications`-Link. Die lokal erneut
abgeglichenen Release-Digests sind:

| Architektur | ZIP SHA-256 | DMG SHA-256 |
|---|---|---|
| macOS Intel | `d1751bc52b8d97a706529cea5968a91caaf032daca3a1339db280067e3b3f3b2` | `09abfcd226637f87e7eb1f8590083d9666c70d2c0181ef80e9d43caae76bff4d` |
| macOS Apple Silicon | `6727eaad725b3240d77633fa5ccf84c782e7f615790766db6a3d99e297789b66` | `2072ac1bdd8e9dabd649e9ad9f2b445e59a93c4d36f588c903fc9027ccb31aa8` |

ZIP und DMG sind Alternativen, keine unterschiedlichen Funktionen. Ein DMG
ersetzt weder Developer-ID-Signatur noch Apple-Notarisierung. Sichtbare
Finder-/Gatekeeper-/13.5- und menschliche N3/N4-Abnahme bleiben offen.
Die RC141- und RC140-Assets werden nicht überschrieben; RC142 enthält keine
neuen Linux- oder Cowork-Pakete.

RC141 ist als Standalone-macOS-Vorabkandidat aus Quellcommit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` veröffentlicht:
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141>.
Der Tag bindet exakt den Buildcommit, nicht den späteren Dokumentationsstand.
Die vier Release-Assets (Intel-/ARM-ZIP und jeweils `.zip.sha256`) sind in Größe
und SHA-256 mit den lokal geprüften Dateien abgeglichen. Die ZIPs wurden für
die dauerhafte Veröffentlichung weder neu gebaut noch verändert.

**Kompatibilitätsnachtrag MAC-20260923:** Der Standalone-Supervisor in den
unveränderten RC140-Assets verlangt Intel macOS 15.0 bzw. ARM macOS 14.0.
Die deklarierte Mindestversion 13.5 ist für diese Pakete nicht korrekt. Die
nachträglichen Deployment-/Signatur-/Plist-/Reviewkorrekturen sind in den neuen
Standalone-Mac-ZIPs RC141 enthalten. RC140-
Hashes, Tag und damalige Testläufe werden nicht nachträglich umgedeutet.

**RC141-Mac-Evidence:** Beide Standalone-Architekturen binden Commit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`, Pflicht-CI `35875614129` und den
bestandenen nativen Lauf `35875613438`. Je kompiliertem Bundle wurden zwei
bytegleiche ZIPs erzeugt; das belegt deterministische Archivierung, nicht zwei
unabhängige Compiler-Builds. Signaturen sämtlicher nativer Komponenten,
Architekturen, tatsächliche minOS-/Systembibliotheksverträge, direkte und
LaunchServices-Starts sowie echte Konvertierung/Anonymisierung, Zuordnung,
Fehler und Verlauf nach Neustart bestehen. Beide heruntergeladenen ZIPs wurden
lokal erneut geprüft. Die exakten Größen und Hashes stehen im
[RC141-Nachweis](REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Die Artefakte sind lokal gesichert und im oben verlinkten GitHub-Release dauerhaft
verfügbar; die eintägige Actions-Aufbewahrung betrifft nur die Buildkopien.
Standalone Windows, Linux und sämtliche Cowork-Pakete behalten
ihre veröffentlichten RC140-Pakete. macOS 13.5 ist nun der verifizierte
Binärvertrag, noch kein real ausgeführter Zielhosttest. Sichtbare Installation
und N3/N4 bleiben offen; die Pakete sind ad hoc signiert, nicht notarisiert.

### RC140 – früherer gemeinsamer Vorabrelease

RC140 ist als gemeinsamer, aber produktgetrennter Vorabkandidat aus dem sauberen
Quellcommit `814bc50e3d754224cd95b6fa91f122dd45f48487` veröffentlicht:
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140>.
Alle 15 Release-Assets stimmen in Größe und SHA-256 mit dem lokalen Staging
überein; `SHA256SUMS` deckt die 14 weiteren Dateien ab. Standalone-Windows
bestand PKG-04/INT-13: zwei saubere, bytegleiche ZIP-Bauten zu je 110.290.089
Bytes, SHA-256 `deb0eaab98b3981f2ca979cfe7a941e1942bc00a83ba934a7a23dd2de79796f1`,
beide Paket-, Worker-, Verlaufs- und nativen Smokes. Die nativen Mac-Intel-/ARM-
Läufe `35864636481` bauten die ZIPs jeweils zweimal bytegleich, prüften
App, Sidecar, Node und Supervisor einzeln auf Signatur/Architektur und starteten
den entpackten Paketinhalt mit echten Office-/PDF-/OCR-Konvertierungen. Linux
bestand `35864697349`. Cowork bestand seine drei nativen Zielpakete in
`35864685584`; Windows-Normal ist bytegleich zum unabhängigen Release-Lauf
`35864624729`, der Normal, Debug, UAT und SPDX bindet. Pflicht-CI
`35864600808` ist grün. Der native Windows-Helfer wurde mit der gepinnten
MSVC-Toolchain auf dem Buildhost quell-/binärgleich reproduziert; das rollende
VS-2026-GitHub-Image prüft nur die Integrität des getrackten Helfers und wird
nicht fälschlich als identischer Compiler ausgegeben.

Die macOS-ZIPs bleiben ad-hoc-signierte **interne Piloten**. Browser-Download,
Finder-Entpackung, Kopie nach Programme, Gatekeeper/LaunchServices, macOS 13.5
und sichtbare Intel-/ARM-UAT sind nicht durch Runner-Smokes bewiesen.
Menschliche N3/N4-, Cowork-Modell- und Produktionsfreigaben bleiben offen.

### RC139 – historischer Cowork-Kandidat

Der Windows-x64-Cowork-Kandidat RC139 sowie beide Mac-Kandidaten binden den sauberen Quellcommit
`46c6fec4722c879989f5c8e3059367241c117c3a`. Der Release
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc139>
enthält drei normale Ziel-ZIPs, Windows-Debug, Windows-UAT-Vorlage, SPDX und
die finale Prüfsummenliste. Alle sieben hochgeladenen Dateien wurden über die
GitHub-Asset-Digests mit den lokalen Dateien abgeglichen.

Die vollständige lokale Produktsuite bestand mit 65 Basis- und 117 direkten
Testdateien (182 insgesamt); Versions-, Dokumentations- und echte UAT-Fixture-
Prüfungen sind grün. Pflichtlauf `34701892871` ist erfolgreich. Der gezielte
Paketlauf `34701897963` baute die drei normalen ZIPs und startete exakt diese
Archive anschließend auf Windows x64, macOS Intel und macOS ARM64 nativ.
Manifest, Architektur, MCP-Roundtrip und dauerhafter lokaler Zustand bestanden.

| RC139-Artefakt | Byte | SHA-256 |
|---|---:|---|
| Windows x64 Normal | 35.051.787 | `032cb8a7f1603c607c3d223096d9d8a1f2ab577d6d17baee0ed72982e45d6a71` |
| Windows x64 Debug | 35.053.309 | `77a049dfb4ad3d90cfff44b083979fcf5d17b4bcd106c9fde55251a76793a6a8` |
| macOS Intel Normal | 39.791.473 | `816925c53432f628c21ecd1174ebe9bd4243f62bccec38be6384504e71cef5d7` |
| macOS ARM64 Normal | 38.807.221 | `5993ad7bb93768314d793a759ca8850c7a40c98e9d1d13b5f7037226d10cd541` |
| Windows-UAT-Vorlage | 5.540 | `0e909dceb4b1920ac97b229492558bf2162a398fa12a5b75ee31d7904fd3a50f` |
| SPDX | 20.950 | `5a8c07893faef607c5e18786822fa30fc3e90483673fa42a0bb30b5acaf6059d` |

Windows-Normal und -Debug wurden zusätzlich aus derselben Workflow-Runtime
jeweils zweimal bytegleich gebaut; beide Bauten bestanden jeweils das native
ZIP-Gate. Das lokale normale Windows-ZIP ist bytegleich zum Workflow- und
Release-ZIP. Die UAT-Vorlage bindet genau diese Normal-/Debug-Bytes und denselben
Commit; ihre 12×3- und 41×3-Modellgates bleiben `NOT_RUN`. Die separate native
Mac-Evidence ist keine Windows-UAT- oder menschliche Abnahme. Sichtbare
Claude-/Cowork-, N3/N4- und Produktionsfreigaben bleiben offen. Standalone bleibt
funktional und in seinen veröffentlichten Paketen auf RC137; RC139 ist Cowork-only.

### Historische Kandidaten und behobene Nachweislücken

Der frühere Windows-x64-Cowork-Kandidat RC138 und die
beiden macOS-Cowork-Kandidaten sind an den sauberen Quellcommit
`d70cb266df90bdc07b0efadbf81f0d81195b3920` gebunden. Der Release
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc138>
enthält die drei nativ geprüften Normalpakete, eine getrennte Windows-Debug-
Variante, SBOM, Prüfsummen und die vollständig auf `NOT_RUN` stehende Cowork-
UAT-Vorlage.

Der manuelle Lauf `34691170241` erzeugte die drei normalen Plugin-ZIPs und
startete **genau diese Archive** anschließend auf Windows x64, macOS Intel und
macOS ARM64. Manifest, Architektur, vollständiger MCP-Roundtrip und dauerhafter
lokaler Zustand bestanden auf allen drei Zielhosts. Die Releaseartefakte sind:

- Windows x64: 35.051.336 Byte, SHA-256
  `bc005e23060c5334b8466525e91deb9d9f712e5c64bf4de1b420e8c04797d251`;
- macOS Intel: 39.791.021 Byte, SHA-256
  `a34443f8147034b8e63f61f1129790a043c89b3cc5d84a99d6641325848c5efb`;
- macOS ARM64: 38.806.770 Byte, SHA-256
  `829ba3f25c263ad1477d42540068439da7d4e9340b866bd5689376b39f7463f2`.

Der lokale Windows-Doppelbau aus demselben Commit war bytegleich: normales
Paket 35.051.388 Byte mit SHA-256
`934c8cb6df4e1843149b5733d316b0c77aae0def2d276e3a83520b899f3ff08a`,
Debug-Paket 35.052.910 Byte mit SHA-256
`1f7a343853971bf296f9c2fad154bf73cb9540a64ca4764682fc85ab299eccf7`.
Das commitgebundene UAT-Evidence-ZIP hat 3.375 Byte und SHA-256
`8777115f3143a58f90ab8adee1b1323416661fbfc8db7cf667a97a019f242a5a`.
Die abweichenden Hashes des lokalen und des Workflow-Windows-ZIPs beruhen auf
unterschiedlichen LF-/CRLF-Zeilenenden der gebündelten Node-Lizenz und deren
Evidence-Feldern, nicht abweichenden Produktquellen; veröffentlicht wird ausschließlich das
im Workflow nativ gestartete Archiv.

Standalone wurde funktional nicht geändert und nicht als RC138 neu gebaut.
Sein aktueller technischer UAT-Kandidat bleibt RC137, gebunden an Quellcommit
`8979d4b2127741c2921cb6f0654fb83d82944845`. RC135 bleibt getrennt als letzter
plattformübergreifend paketgebundener Stand vor RC139 vollständig
nachvollziehbar; RC136 bleibt der dazwischenliegende Windows-Cowork-Kandidat.
RC138 ist trotz der grünen E0-Gates keine menschliche Cowork-Modell-, N3/N4-
oder Produktionsfreigabe. Die nachträglich geschlossenen BL-041.15–.18 verlangen
für den nächsten Kandidaten einen sauberen Commit sowie zwei explizit angegebene,
vor der Evidenzaufnahme verifizierte Archive. RC138 und seine UAT-Vorlage bleiben
damit historische Evidence und dürfen nicht erneut als N3/N4-Kandidat gebunden
werden.

Der zweite Astra-Korrekturblock `ASTRA2-20260912-01`–`04` ist seit RC139
veröffentlicht; die RC138-Archive bleiben unverändert. Der manuelle Windows-Releaseweg
lädt Node außerhalb des Quellbaums nach `RUNNER_TEMP`, baut Normal und Debug,
erzeugt die UAT-Vorlage und inventarisiert **danach** mit `generate-sbom.mjs
--archive <normal> --archive <debug> --cowork-uat <uat>` den finalen Satz.
Upload und `SHA256SUMS` umfassen beide Produkt-ZIPs, UAT-ZIP und SPDX. Die
UAT-Bindungen müssen den tatsächlichen Archivbytes und Quellcommits entsprechen.
Beim plattformübergreifenden Release enthält derselbe finale Inventarlauf
zusätzlich die normalen Mac-Intel-/ARM-ZIPs aus demselben Commit. Ihre nativen
Smokes bleiben getrennte Zielhostnachweise; die Windows-UAT-Vorlage behauptet
keinen Mac-Test. Unbekannte, doppelte oder fremdcommitgebundene Zusatzpakete
werden nicht akzeptiert.
Der wiederholbare Offline-Test ist `node tests/manual/cowork-release-offline.mjs`
(Windows x64, bereits attestierte Runtime unter `dist/windows-x64`); er ist
kein Ersatz für commitgebundenen Releasebau oder menschliche Abnahme.

`node tests/manual/cowork-uat-fixtures.js` prüft die synthetischen UAT-Eingaben
mit dem echten nativen Parser/OCR, Batchjournal und verifizierten Handoff:
terminales DOCX ohne Retry, vollständiges Ergebnis plus zurückgehaltene Grafik
plus Stopp, eingebettete Instruktion als untrusted data und sechs Ergebnisse mit
`more=true`. Keine Parser-/OCR-/Ergebnis-Mocks, kein Claude-Modelltest. Der Lauf
benötigt die native Parserumgebung und erzeugt nur isolierte Testdaten.

Windows-PKG-04 erzeugte zwei bytegleiche Standalone-Archive zu jeweils
110.253.680 Byte. Paket-, Worker-, History-/Sidecar- und native Smokes
bestanden; INT-13 bindet SHA-256
`3dfdb38107cf7fd9deae0f26091b7b44a8054a954a192817b69d3f749a47c6f0`.
Der kostenbestätigte Lauf `34609450730` baute, prüfte und startete Standalone
zweimal deterministisch auf macOS ARM64 (115.162.051 Byte, SHA-256
`8314572d…d4416`) und Intel (118.194.215 Byte, SHA-256 `e8210902…b514`).
Lauf `34609464020` tat dasselbe für Linux x64 glibc samt AppImage
(194.347.824 Byte, SHA-256 `f282d416…d282`).

Der Cowork-Lauf `34609438970` erzeugte und validierte die drei
selbsttragenden normalen Plugin-ZIPs: Windows x64 (35.050.312 Byte,
SHA-256 `b97afba9…e467`), macOS ARM64 (38.805.746 Byte, SHA-256
`17d2b6ef…d7f`) und macOS Intel (39.789.997 Byte, SHA-256
`68bdaf9a…839b`). Die getrennte Windows-Debug-Variante wurde lokal aus
derselben Workflow-Runtime zweimal bytegleich gebaut (35.051.835 Byte,
SHA-256 `30a19dc3…6c3c`) und vollständig validiert. Der Vorabrelease
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc137>
enthält alle Zielpakete, Sidecar-Prüfsummen, SBOM und eine commitgebundene,
vollständig auf `NOT_RUN` stehende 12×3-UAT-Vorlage. Diese E0-Evidence ist
keine menschliche N3/N4-, sichtbare Zielhost-, Cowork-Modell- oder
Produktionsfreigabe.

RC136 wurde zweimal aus Commit
`71ecafddde891d9d1b4e4bd9cd67833b46d03b08` gebaut. Beide normalen Archive
waren bytegleich mit jeweils 35.048.298 Byte und SHA-256
`212646f6a27d610ed502bad724441f6c8d30872d55d387d6f59c9fe006ec1cbf`;
beide Paket-, Runtime-, Worker- und Skill-Smokes bestanden. Die getrennte
Debug-Variante war ebenfalls zweimal bytegleich mit jeweils 35.049.821 Byte
und SHA-256
`2b8e660e44ea95566bdebbda22ff67e6dfe3bc6da23b00dd78cf6b60de587c70`.
SBOM, Prüfsummen und eine commitgebundene, vollständig auf `NOT_RUN` stehende
12×3-UAT-Evidence-Vorlage gehören zum Release. RC136 ist als technischer
Windows-Cowork-Vorabkandidat unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc136>
veröffentlicht. Das ist keine Standalone-, macOS-, Modell-, N3/N4- oder
Produktionsfreigabe.

Für RC135 erzeugte der Windows-PKG-04-Lauf zwei bytegleiche Archive mit jeweils
110.250.920 Byte. Beide Paket-, Worker-, History-/Sidecar- und nativen Smokes
bestanden; INT-13 bindet SHA-256
`8a27494c19c1713ccd5104d1ec3dda8abd2e773ceedb47d250befccbe174c3d1`.
Der kostenbestätigte Lauf `34499428661` baute, prüfte und startete die
Standalone-Archive zweimal deterministisch auf macOS ARM64 (115.159.211 Byte,
SHA-256 `e9f54b5b…9f8c6`) und Intel (118.191.466 Byte, SHA-256
`9061aae7…880e9`). Lauf `34501324817` erzeugte und validierte die drei
selbsttragenden Cowork-Plugin-ZIPs für Windows x64 und beide Mac-Architekturen.
Das ist technische E0-Paketevidence, aber noch keine N3/N4- oder weitere Zielhostfreigabe
und insbesondere keine sichtbare Fresh-Install- oder
Anwenderabnahme.

RC135 ist als plattformübergreifender technischer Vorabkandidat unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc135>
veröffentlicht. Tag, sechs Zielpakete, Prüfsummen und SBOM binden unverändert
den Quellcommit `9c2e4f9061dbdc3cd1bf0280d95939528029c978`; der spätere reine
Dokumentationscommit verändert diese Binärartefakte nicht. Diese
Veröffentlichung ersetzt weder die noch offene sichtbare N3/N4-UAT noch eine
Produktionsfreigabe. Die Veröffentlichung des neueren Windows-Cowork-RC136
verändert oder ersetzt diese sechs RC135-Zielpakete nicht.

## Nutzerprodukt

Das Releaseprodukt ist ein selbstenthaltendes, zielsystemspezifisches Plugin-ZIP
für Windows x64 oder macOS Intel/ARM. Ein ZIP nur aus `plugins/data-secure` und
interne Engineering-Artefakte sind keine Nutzerprodukte oder Fallbacks.

Für einen GitHub-synchronisierten privaten Marketplace enthält das angeschlossene
private/interne Repository einen selbsttragenden Plugin-Ordner mit relativer
`source`. Das ist laut offizieller Anthropic-Dokumentation (erneut geprüft am
04.09.2026) der einfachste unterstützte Weg. `archive`, `npm` und `command` sind
für diesen Organisationskanal nicht unterstützt. Der aktuelle Quellordner mit
`command: node` ist deshalb ausschließlich Entwicklung und kein
Marketplace-Release. Ein Marketplace darf erst angeboten werden, wenn seine
selbsttragende Projektion auf Windows und beiden macOS-Architekturen abgenommen
ist.

Zusätzlich erzeugt `node scripts/build-marketplace-repo.mjs [--plugin-name <kennung>]`
aus dem verifizierten Zielpaket eine vollständige Git-Marketplace-Projektion
(`dist/marketplace-repo/`: `.claude-plugin/marketplace.json` mit relativer
Quelle und Version, `plugins/<kennung>/` als byteidentischer ZIP-Inhalt). Sie
wird in ein eigenes privates Repository gelegt und in Claude Desktop als
Marketplace aus Git-URL hinzugefügt; Updates laufen über den „Update“-Knopf des
Marketplace. Eine abweichende Kennung (z. B. `data-secure-uat`) ist nur für
Test-/UAT-Installationen gedacht, etwa wenn ein blockierter Kontoeintrag den
Produktnamen belegt, und wird im Evidence-Log vermerkt.

Seit der Nachprüfung vom 12.09.2026 wählt der Standardaufruf ausschließlich das
ZIP der aktuellen Hostarchitektur. Ein anderes Archiv muss ausdrücklich über
`--zip dist/<archiv>.zip` angegeben werden. Gleiche Version genügt nicht:
Vor Ersetzen der generierten Ausgabe müssen die Produktquellen bytegleich mit
dem aktuellen Checkout sein. `PROJECTION-EVIDENCE.json` nennt Quell-ZIP,
SHA-256, Ziel und ausführbare Dateien; die Projektion ist kein nativer Smoke.
`npm run build` prüft den erzeugten Marketplace zusätzlich gegen das echte ZIP.
macOS-Projektionen werden auf POSIX erstellt, nicht auf Windows, und behalten
die Archivmodi. Vor Git-Veröffentlichung müssen alle in der Evidence genannten
ausführbaren Dateien im Git-Index Modus `100755` haben; ein Checkout-Smoke des
Zielhosts bleibt erforderlich. Bereits veröffentlichte RC137-Pakete werden
durch diese lokalen Korrekturen nicht nachträglich neu gebunden.

Für den reinen ZIP-Weg erzeugt `node scripts/rename-plugin-zip.mjs --plugin-name
<kennung>` aus dem verifizierten Zielpaket eine Upload-Variante, deren Manifest
eine andere Plugin-Kennung trägt (Inhalt und Archivmodi bleiben byteidentisch).
Sie wird gebraucht, wenn ein vorhandener, nicht entfernbarer Kontoeintrag den
Produktnamen `data-secure` belegt: Ein Upload gleichen Namens ersetzt diesen
Eintrag nicht, ein neuer Name wird als neuer Eintrag angelegt. Die Kennung
(z. B. `data-secure-rc87`) gehört ins Evidence-Log; Werkzeuge erscheinen dann
mit dem Präfix `plugin_<kennung>`.

Der persönliche Datei-Upload in Cowork („My Uploads“) besitzt laut offizieller
Dokumentation keinen Update-Mechanismus; ein erneuter Upload derselben
Plugin-Kennung ersetzte am 03.09.2026 die gecachte Kopie nicht (offene Meldungen
anthropics/claude-code #69020, #65426 als „not planned“). Der Upload bleibt der
Pilotweg mit dem im IT-Handbuch beschriebenen Entfernen-Neustart-Upload-Ablauf;
der versionierte Marketplace ist der Zielkanal.

## Prüf- und Veröffentlichungskadenz

Ein normaler Push erzeugt niemals automatisch native macOS-/Windows-Builds,
OCR-Pakete oder Releaseartefakte. Der eine automatische Ubuntu-Check startet
für jeden Push und Pull Request, damit eine neue oder umbenannte Datei den
stabilen Pflichtcheck nicht umgehen kann. Er führt bei reinen Dokumentänderungen
nur `test:docs` aus; bei Produktcode
`test:product:ci`; bei gemischten oder nicht sicher klassifizierbaren Änderungen
beide. Die vollständige lokale Produktsuite bleibt Abschlussgate für einen
inhaltlichen Entwicklungsblock.

Zielplattformbuilds werden nur ausgeführt, wenn ein neues Paket für UAT oder
Release tatsächlich benötigt wird. Der manuelle Cowork-Workflow startet daher
standardmäßig nur `windows-x64`; alle drei Plattformen sind eine ausdrückliche
Releaseauswahl. PKG-04/INT-13, beide macOS-Architekturen, Security, SBOM und
Prüfsummen bleiben verpflichtend, sobald genau dieser Commit als neuer
veröffentlichter Kandidat angeboten wird. Ein nachfolgender reiner
Dokumentationscommit erfordert keinen Neubau unveränderter Binärartefakte.

Seit der Nachprüfung vom 12.09.2026 gilt zusätzlich: Der Ubuntu-Job des
Cowork-Workflows belegt nur statische ZIP-Eigenschaften. Der nachgelagerte
`native-package-smoke` muss **genau diese ZIPs** auf jedem gewählten nativen
Host mit `node scripts/verify-plugin-zip.mjs --require-native` starten.
Manifestkommando, vollständiger MCP-Roundtrip und dauerhafter isolierter Cache
werden geprüft. Fremdplattformen dürfen kein natives PASS liefern. Die neue
Für RC138 wurde diese Prüfung im Lauf `34691170241` auf Windows x64, macOS
Intel und macOS ARM64 erfolgreich ausgeführt. Frühere Cowork-Mac-Archive werden
dadurch nicht rückwirkend als nativ gestartet ausgewiesen. Standalone-
Paketnachweise bleiben separat gültig.

## Verbindliche Versions- und Releasewahrheit

Jeder neue RC beginnt mit `npm run version:sync -- <version>`. Der Befehl setzt
alle aktiven Versionsköpfe und Manifeste gemeinsam fort, kennzeichnet nur einen
tatsächlich neuen RC als Entwicklungsstand und verändert keine historische
Commit-/Paket-Evidence. Vor Commit, Paketbau und Dokumentationsabschluss muss
`npm run test:version-truth` grün sein; derselbe Check ist Bestandteil von
`test:docs` und damit des automatischen Pflichtgates. Nach bestandenem PKG-04
wird ausschließlich der exakt gebundene RC in diesem Vertrag als Kandidat mit
Commit, Archivgröße und SHA-256 dokumentiert. Ein älterer RC darf nie als
aktueller Quellstand stehen bleiben.
`test-release-version.mjs` deckt auch den Versionsschnitt aus der einfachen
veröffentlichten Form „RC…“ ab: Der neue RC wird Entwicklungsstand, während
historische Paketnamen, Commitwerte und Hashes unverändert bleiben.

## Produktbuild

```text
npm ci
npm run test:docs
npm run test:ci
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
npm run build
```

`runtime:target` läuft auf dem jeweiligen Zielhost und prüft den fest
eingetragenen Downloadhash, Architektur, Lizenzdatei und den echten Start der
Runtime. `build` erzeugt und prüft ZIP, SPDX-SBOM und `SHA256SUMS`. Die gebündelte
DataSecure-Runtime verarbeitet ohne eigenen Netzwerkzugriff und setzt keine
System-Node-/Python-Installation voraus. Claude Desktop und Cowork benötigen
für die Sitzung weiterhin eine Internetverbindung; das ändert nichts daran,
dass Originaldateien nur der lokalen DataSecure-Runtime zugeführt werden.
Der manuelle, kostensparende Workflow `bundled-runtime-release.yml` baut bei
Bedarf genau ein Ziel-ZIP oder alle drei getrennten Ziel-ZIPs; er läuft niemals
automatisch und wählt ohne ausdrückliche Änderung nur Windows x64. Jedes dieser
ZIPs bleibt unter der von Anthropic vorgegebenen
50-MB-Grenze. Ein Universal-ZIP wird nicht erzeugt, weil die drei gebündelten
Laufzeiten diese Grenze zusammen zwangsläufig überschreiten würden.

## Engineeringbuild

```text
npm run build:engineering
npm run test:engineering-artifacts
```

Diese Befehle sind optional für interne Vergleichs- und Legacy-Gates. Ihr Erfolg
ist keine Produktfreigabe.

## Separates Standalone-Produkt

Standalone ist nicht Bestandteil des Plugin-ZIPs oder Marketplace-Artefakts.
Eine kompilierte und automatisch geprüfte Windows-x64-Hülle samt selbsttragendem
Engineering-Paket existiert. Echte ad-hoc signierte macOS-App-Bundles sind auf
Intel und Apple Silicon gebaut, geprüft und bis durch ihre private IPC-/Core-
Grenze gestartet. Sie sind als technisches Vorabrelease verfügbar, aber noch
keine Produktionsfreigabe: Die sichtbare Windows-/macOS-/Linux-UAT fehlt. Für macOS Intel und Apple
Silicon existieren inzwischen reproduzierbare, manifest-/hash-/modusgeprüfte
Engineering-ZIPs, die nach dem Entpacken nochmals nativ gestartet wurden. Der
aktuelle Zielbuild liefert selbsttragende Pakete für Windows x64, macOS Intel
und Apple Silicon sowie Linux x64 glibc; Anwender installieren
weder Rust noch Node noch Python separat. Für macOS gilt mindestens 13.5. Die
ersten internen Pakete dürfen unsigniert sein und verwenden ausschließlich die
enge Gatekeeper-Freigabe über „Datenschutz & Sicherheit“; globale oder
kommandozeilenbasierte Schutzabschaltungen sind kein Supportweg. Für eine breite,
reibungsarme Verteilung bleibt Signierung/Notarisierung eine spätere
Produktentscheidung.

Linux x64 glibc wird als AppImage in einem manifest-, hash-, lizenz- und
modusgeprüften ZIP geliefert. Das Paket enthält Core, Node, Office-/PDF-/OCR-
Konverter und POSIX-Supervisor; separate Runtime-Installationen sind nicht
erforderlich. Der native GitHub-Zielhostlauf baut und startet AppImage sowie
entpacktes Distributionspaket über App → private IPC → Core. Das ist technische
E0-Paketevidenz, aber noch keine menschliche Linux-Desktop-/Dateidialog-/
Accessibility-UAT und daher keine Endnutzerfreigabe.
Der Referenzlauf `34356576842` bindet diese Evidence an Commit
`84fd616c65665f3c7a31426bd722206c7145b6a6`; ZIP-SHA-256 ist
`177b976399785b010937ba17fde738b14f3eed94b4d78f94ea4491736f93eaee`.

Der kleine Windows-Pilot nutzt das auf Windows 10/11 vorhandene beziehungsweise
von der Organisation bereitgestellte Microsoft Edge WebView2-Systemruntime. Es
wird nicht von DataSecure heruntergeladen oder gebündelt. Fehlt es, stoppt die
UAT mit verständlichem Hinweis; Node, Rust und Python bleiben weiterhin keine
Anwender-Voraussetzungen.

## Freigabekriterien

- Versionsgleichheit in Paket, Pluginmanifest, Skill und Buildmetadaten.
- Exakt zwei sichtbare Skills; keine Hooks/Subagenten.
- Cowork: TXT/Markdown/CSV/DOCX direkt sowie XLSX/PPTX Markdown-first positiv;
  PDF/Scan-PDF/Bilder fail-closed. Standalone:
  breite Quellen werden lokal nach Markdown extrahiert und dieser Inhalt mit
  getrenntem Extraktions- und Anonymisierungsstatus verarbeitet.
- Kein auswählbarer Bildmodus; Pixel bleiben lokal.
- 0–14 Tage nur für temporäre Arbeits-/Reviewdaten.
- Quellen/Originale und fertige Exporte nie automatisch löschen.
- Fresh Install von ZIP und Marketplace auf Windows x64 und macOS Intel/ARM.
- Runtime-Evidence, Node-Lizenz, Zielarchitektur, Dateimodi, SBOM und SHA-256.
- Kernfall, Stopps, Resume, 200 Dateien/500 MiB, Update und Rollback.
- aktueller Claude-/Cowork-Hostvertrag und Berechtigungsdialoge.
- UAT, Accessibility, IT/Health-IT, Datenschutz, Security und Architektur.
- null offene P0/P1-Defects.

## Formale N3/N4-Kandidatenbindung

Für die geplante Zwei-Personen-Abnahme wird erst nach Abschluss aller E0-Gates
eine Kampagnendatei aus
[`CAMPAIGN.template.json`](acceptance/FORMAL_UAT/CAMPAIGN.template.json)
angelegt. Die Produkte erhalten getrennte Kampagnen: Innerhalb eines Produkts
bindet derselbe vollständige Git-Commit die Windows- und Mac-Pakete mit jeweils
eigenem Hash. Ein Cowork-only-Release erzwingt keinen Standalone-Neubau.
Pakete eines älteren Commits dürfen
nicht als aktueller Kandidat umetikettiert werden.

N3 muss auf jeder als freizugebend markierten Zielhost-/Produktkombination
vollständig `PASS` sein, bevor N4 beginnt. Die Windows- und Mac-Person führen
getrennte Evidence-Dateien auf getrennten UAT-Branches. Erst die gegengeprüfte
[Freigabeentscheidung](acceptance/FORMAL_UAT/FREIGABEENTSCHEIDUNG.md) darf ein
GO aussprechen. Die nicht vorhandene zweite Mac-Architektur bleibt ausdrücklich
offen und wird nicht durch Rosetta oder den anderen Mac-Typ ersetzt.

Für einen Cowork-Kandidaten gehören außerdem die vollständige 41×3-Modellmatrix
und der risikobasierte 12×3-Kandidatensmoke zum formalen Gate. Beide müssen im
Kampagnenmanifest mit Korpus-Hashes gebunden und `PASS` sein; ein einziges
verbotenes Outcome blockiert die Freigabe. `npm run uat:cowork-candidate`
erzeugt die versionsgebundene Durchführung mit Fixture, Vorbereitung,
bewertetem Schritt und Aufräumen.

Die zugehörige leere Evidence-Vorlage wird nur aus einem sauberen Checkout mit
expliziter Kandidatenbindung erzeugt: `npm run build:cowork-uat-evidence --
--candidate-commit <Commit> --normal-zip <dist/normal.zip> --debug-zip
<dist/debug.zip>`. Beide ZIPs müssen aus genau diesem Commit stammen und vor
der Hash-Aufnahme den nativen Cowork-ZIP-Verifizierer bestehen; dessen
maschinenlesbares Receipt muss Größe und SHA-256 genau der für UAT gelesenen
Bytes bestätigen. PKG-04/INT-13 gehören zur Standalone-Kampagne. Eine bloße Dateisuche in
`dist` ist kein zulässiger Bindungsnachweis. Der Produktbau schreibt den
Quellcommit in jedes `RUNTIME-EVIDENCE.json`; die Evidence-Erzeugung verweigert
jede Abweichung zum explizit angegebenen Kandidatencommit.
Die UAT-Anleitung verlangt echte beobachtete Vorbedingungen. Fehlen diese,
bleibt der Fall `BLOCKED`; simulierte Toolantworten sind kein Live-UAT-Nachweis.

## Produktbezogene Formatfreigaben

- **Cowork-Plugin:** TXT, Markdown, CSV und streng direkt geprüftes DOCX;
  XLSX/PPTX werden lokal extrahiert und nur als Markdown anonymisiert. PDF,
  Scan-PDF und eigenständige Bilder werden mit unveränderter Quelle und ohne
  Teiloutput sicher gestoppt.
- **Standalone – Nur in Markdown umwandeln:** TXT, Markdown, CSV, DOCX, XLSX,
  PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP. Der Quellinhalt bleibt erhalten; eine
  unvollständige Extraktion wird ausdrücklich gekennzeichnet.
- **Standalone – In Markdown umwandeln und anonymisieren:** TXT, Markdown und
  CSV laufen direkt. DOCX und die breiten Formate werden genau einmal lokal
  nach Markdown extrahiert; ausschließlich dieser gültige, nichtleere
  Markdown-Inhalt wird anonymisiert. Quellenabdeckung und
  Anonymisierungsstatus sind getrennte Aussagen.

Unbekannte, beschädigte, verschlüsselte, aktive oder leere Quellen werden in
beiden Produkten fail-closed behandelt. Cowork lehnt einen nicht vollständig
freigegebenen Ordner atomar ab; Standalone weist betroffene unterstützte
Positionen einzeln aus und verarbeitet den sicheren Rest weiter.

## Rollback

Rollback darf Quellen, fertige Exporte, Mapping und unbekannte/verschlüsselte
Altbestände weder verändern noch löschen. Nach Rollback werden Picker, Kernfall,
Resume, Mapping und Version mit synthetischen Daten geprüft.

Artefakt-SHA-256 und Testergebnisse werden releaseextern veröffentlicht; keine
rekursiv selbstbezüglichen Prüfsummen im Produktarchiv.
