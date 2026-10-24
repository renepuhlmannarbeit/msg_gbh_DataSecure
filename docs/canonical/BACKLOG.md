# Aktives Entwicklungsbacklog

Arbeitsquelle: 3.2.0-rc176 Entwicklung, noch kein neuer Paketfreeze;
Desktop-/Office-/Zielhostabnahme USER_PENDING. RC175/ältere Pakete unverändert.

## BL-049.7 – RC176 priorisierte Inhalts-/Grafikverbesserungen

24.10.2026 ausdrücklich beauftragt: priorisierte Punkte aus dem Zielreview für
Windows x64 und beide Macs implementieren, Schutzprüfungen erhalten, unabhängig
am tatsächlichen Code revalidieren, neue Endgates und RC176-Test-Pre-Release;
Desktoptests Nutzer. [Umsetzungsplan/Journal](../acceptance/RC176_SHARED_RELEASE_20261024.md).
PDFstruktur/MCID/volle Itembindung und reale Tabellenbesitzer; TIFFLZW/CCITT/
Orientierungen; Word gespeicherte Feldresultate/explizite Revisionsansicht/
Nummerierung/Kommentaranker; Excel Kommentare/TablePart/Pivot/RichValue;
Officegrafiken nur geschlossene nachgewiesene Teilmengen. Kein blanket catch,
keine Erfindung fehlender Werte oder Quell-/Privacy-/Ressourcenlockerung.
EMF+-DrawString wegen belegter ignorierter LayoutRect-Semantik vorerst explizit
nicht unterstützt; andere Formen und plainGDItext separat. Größere Renderer
bleiben isolierte Folgeprototypen; keine unbewiesene Aufnahme in den MacCore.
Noch kein RC176-Abschluss-/GUI-/ReleasePASS; alte RC175-Bindungen bleiben getrennt.
Zusatz24.10.: unabhängige Code-/Best-Practice-Revalidierung vor Freigabe,
insbesondere Zuständigkeiten/geschlossene APIs/Fehlerbehandlung/Ressourcen-
und Komplexitätsgrenzen/Determinismus/Crossplatform/selektive Regressionen.
Konkrete neue Befunde kausal schließen. Nach ausdrücklicher Nutzerpräzisierung
dürfen auch Schutzprüfungen/Tests geändert oder ersetzt werden, wenn dies den
Zielen dient; Nutzen, Sicherheits-/Vollständigkeitsfolgen und Gegenproben
belegen, keine bloße Grünfärbung oder starre Bewahrung veralteter Regeln.

### Konkrete Folgegrenze: XLSX-TablePart-Felder im Legacy-Notespfad

Unabhängiger echter Gegenreview24.10. bestätigt am unveränderten Hidden-Name-
TablePart-/defekterKommentar-ZIP962031bc…7431: content-v1 schützt Qzx/Qzy; der
alte und neue notes-v1-Pfad übernehmen die verborgene TablePart.Name-Feldrolle
nicht und publizieren diese schwachen Werte in beiden Profilen unverändert.
Kein neuer Session-/Quarantänefehler, keine geschlossene oder durch Grüns
widerlegte Lücke. Die normale Desktopoberfläche setzt fest content-v1.
Neue Word-/Excelmodelle sind ausdrücklich nur für content-v1 aufgenommen;
technischer Legacy-/Notesvertrag bleibt gesonderte Restabdeckung ohne
produktweiten Anonymisierungsnachweis. Folgearbeit: gleiche echte TablePart-
Feldautorität ohne Wertduplikate, erfundene Header oder blanket Stop auch im
Legacy-Notesmodell erhalten; Original-Source-/Trace-/Publication-/Keep-Gegenfälle
beibehalten. Beleg rc176-office-p2-independent-review-20261024/NOTES-BOUNDARY-RESULT.json.

## BL-049.6 – RC175 chartEx

24.10.2026 ausdrücklich beauftragt: gespeicherte chartEx-Inhalte für Windows
und beide Macs owner-/daten-ID-/indexgebunden ergänzen, Schutzprüfungen erhalten,
unabhängig revalidieren/frisch testen, RC175 als GitHub-Test-Pre-Release und
Windows lokal mit Testplan. Desktoptests Nutzer. [Plan und Primärquellen](../acceptance/RC175_SHARED_RELEASE_20261024.md).
Eigener offlinefähiger semantischer Leser umgesetzt, keine Formelausführung,
externen Workbook-/Geodatenloads oder Statistik-/Visualvollständigkeitszusage.
Gemeinsamer App-/Tagcommit223a04f54bc4fcfb2a95f12807685ed764ec6f0c,
FP5eaddabb…4bc3e/358. Source02 vollständig307+11/300Rust/5Konverter-/5Paketgates
PASS/stabil; beideMac40090612106SUCCESS, je133chartEx-Fälle. Tatsächliche
Produktquellen-, ganze Log- und Archivbytegegenreviews gelesen. Release422730420
am24.10.12:55:05UTC,20Assets vor/nach Publikation frisch gehasht/Inventar/Tagquelle/
Notesbody nachgelesen. Windows lokalRC175 mit Testplan/3Testarchiven. Desktoptests
Nutzer, keine Mainintegration/neue Appleautorität oder Universalformatfreigabe.

### Zusatzauftrag 24.10. – Zielbezogener weiterer Inhalts-/Rendererreview

Aktuellen Code mit offiziellen Internet-/GitHubmethoden auf weitere sinnvolle
Konstellationen/Renderer/Funktionen prüfen. [Review und Prioritäten](../acceptance/GOAL_COVERAGE_REVIEW_20261024.md).
PDFstruktur/Lesereihenfolge, häufige TIFFvarianten, EMF+/weitere Officeobjekte,
vorhandenen Windows-only PDFiumspike und optionale Docling-/LibreOfficepfade
getrennt bewerten. Keine ungeprüfte Rendereraufnahme in RC175, kein behaupteter
Universalreader. Native Macrollen ohne Developer-ID/Notarisierung oder
Abschaltung von LibraryValidation/OSschutz planen; Desktoptests bleiben Nutzer.
Der erste gemeinsame RC175-Endlauf ist bei test-parsers rot; ältere Mac-/
Paketgrüns sind keine Gesamtfreigabe und dürfen nicht als neuer Finalstand gelten.
Die enge Legacy-/Ownerquarantäne-Korrektur ist danach implementiert und von zwei
tatsächlichen Quellengegenreviews ohne verbleibenden Deltablocker nachgeprüft.
Frische gemeinsame Source02-Endgates/Archive inzwischen vollständig abgeschlossen
und ausschließlich dieser neue Stand veröffentlicht. Die breiteren Zielreview-
Empfehlungen bleiben getrennte Folgepakete, kein neuer RC175-Renderer:
PDF-Strukturbaum/MCID/Lesereihenfolge, häufige TIFF-Codecs/Orientierungen,
Word-Feldresultate/Nummerierung/Revisionsansicht, Kommentaranker, Excel-RichValues/
Bild-in-Zelle/Pivotkontext und Office-Clipping/Rotation/Überlagerung. Größere
LibTIFF-/PDFium-/LibreOffice-/Docling-/Markerpfade zuerst isoliert vergleichen,
Lizenzen/Modelle/Prozessgrenzen und alle drei Zielarchitekturen tatsächlich belegen.

## BL-049.5 – RC174 Diagramme, OfficeMath und passive PDFwerte

23.10.2026 zusätzlich ausdrücklich beauftragt, technisch umgesetzt/revalidiert
und am24.10.2026 als RC174 veröffentlicht: index-/owner-
gebundene Diagrammmodelle inklusive Chartsheets, lesbare OfficeMath-Strukturen
und gespeicherte passive PDFformularwerte. Windows+Mac ARM64/Intel aus derselben
neuen Quelle; fachlich unabhängige Quellreviews, neue native Endtests und neuer
GitHub-Test-Pre-Release, Windows lokal mit Testplan. Desktoptests Nutzer.
[Verbindlicher Plan und Journal](../acceptance/RC174_SHARED_RELEASE_20261023.md).
Keine Formelausführung/aktiven PDFaktionen/externen Workbookloads; bestehende
Schutz- und Teilabdeckungsgrenzen behalten. Menschliche Desktoptests USER_PENDING.

Quellenmodelle und begrenzte unabhängige Gegenreviews umgesetzt; Diagramme/
PDFwerte beide Modi, neue OfficeMath-Projektion content-v1. Zusätzlicher echter
Breiten-/Argumentlimitfehler in Chart-XML durch gleichgeordneten Iterator statt
vararg-Push korrigiert, ohne höhere Budgets oder Fehlerumdeutung.116Chartfälle
einschließlich150k/200k/echten Owner-/Modusketten vorgeprüft. Drei alte Endlauf-
Test-/Fixturefehler eng und unabhängig korrigiert, Originale bleiben rot.
Aktuelle Formatmatrix fachlich aktualisiert; gemeinsame Source02-Endgates
306+11/300Rust/5Konverter/5Paketgates und beide native Mac-Pakete erfolgreich,
tatsächliche Quellen-/ganzeLog-/Archivgegenreviews abgeschlossen. App-/Tagcommit
444b14e0020ebb8cf7f7de08fb36d6e71234da91/FP465a463a…1393, Release422424877,
20Remoteassets vor/nach Publikation frisch nachgeprüft. Windows lokal RC174
mit Testplan/Proofs/3Testarchiven. Desktoptests bleiben beim Nutzer; keine
Mainintegration/neue Apple-Signierautorität oder Universalformatzusage.
Größere Renderer-/chartEx-/Legacy-/Spezialmodellergänzungen bleiben Restarbeit,
nicht als RC174- oder menschliche Abnahme ausgegeben.

## BL-049.4 – Legacy-Zellverbindungen und umfassende Konvertierungsrobustheit

23.10.2026 ausdrücklich beauftragt, in Arbeit: Word-w:hMerge korrekt ergänzen,
unterstützte Dateitypen systematisch auf fehlende Inhaltsmodelle/Renderer und
vermeidbare Dateistopps prüfen, aktuelle bekannte Internet-/GitHubverfahren am
tatsächlichen eigenen Code vergleichen und sichere Verbesserungen umsetzen.
Möglichst viel geprüftes Original als lesbares MD erhalten; unabhängige
Auslassungen sichtbar melden. Kein allgemeiner catch, keine erfundenen/leeren
Erfolge oder Abschaltung von Quell-/Container-/Guard-/Prozess-/Residual-/
Ressourcenprüfungen. Offline, Windows+beideMacs, ohne Applekonto/Developer-ID.
[Arbeitsplan, Befunde und Rendererentscheidung](../acceptance/CONVERSION_RESILIENCE_REVIEW_20261023.md).
RC173-Downloads/Tag und alte Nutzerläufe unverändert; Desktoptests Nutzer.

Erstes begrenztes Delta implementiert, unabhängig quellenrevalidiert und
in RC174 mit frischen gemeinsamen Endnachweisen veröffentlicht:
hMerge, Standalone-BOM-UTF16, Excel-ST_Xstring einschließlich x:v/Formelcache,
PPTX-Folienlisten/Notiznamespaces, optionale PDFmetadatengrenzen und statische
PNGvarianten über bestehendes Canvas. Zusätzlich echte zellinterne/Header-/
Cache-Privacybefunde kausal geschlossen; Original-REDs erhalten. Gemeinsame
Vier native Konvertersuiten unter `dist/rc174-conversion-followup-v2-20261023`
PASS/stabil (PDF,70Worker/49Office/43Grafik). Dessen45Quellsuiten Exit0, originales
FINAL wegen wechselnder rg-Ignore-Inventarisierung FAIL erhalten.590gebundene
Dateien direkt bytegleich; frischer45er-Gegenlauf mit591Gitinputs unter
`dist/rc174-conversion-followup-v3-20261023` vollständig PASS/Exit0/stabil,
Ende21:19:39.353UTC. Gemeinsamer Produkt-FP
`0830f92ce05aa4073f778936784e55b02698bc7230e761479c9e23b99be8cc66`/353.
Erste Implementierungs-/Recherchephase abgeschlossen; keine neue Paketfreigabe.
Weitere offene Umsetzungspakete explizit im Arbeitsplan: indexgebundene Charts/
Chartsheets, OMML, klassische Kommentarbezüge, passive PDFformularwerte,
weitere Codec-/OPCmodelle und ggf. separat isolierter Office-Renderer. Konkreter
Docling-/Calamine-/MarkItDowncode und offizielle Format-/Rendererquellen gelesen;
keine pauschale Drittbibliothek-/Rechte-/Ressourcenlockerung oder Universalzusage.

## BL-049.3 – Tabellen ohne pauschalen Layoutstopp / RC173 (23.10.2026)

Status: **Technisch umgesetzt/revalidiert; RC173 Windows und beide Macs am
23.10.2026 veröffentlicht. Desktop-/Officeabnahme USER_PENDING.** Schwierige gültige
Word-Zellspans/Nestedtabellen, große Excel-Zelllisten und geerbte PPTX-Tabellen
sollen automatisch anonymisiert werden. Neutrale Ersatzspalten/Koordinaten
dürfen echte Inhalte und sensible Header-Wert-Beziehungen nicht verlieren.
Mehrdeutige Bezüge konservativ behandeln statt ungeprüft durchlassen; keine
pauschale Maskierung aller Fachtexte und keine bloße Sperrcodeunterdrückung.
Schutz-/Residual-/I/O-/Guard-/Ressourcenprüfungen und sichtbare Auslassungen
bleiben. RC173 Windows/beideMacs mit unabhängigen echten Quellenreviews und
frischen Endbelegen bereitstellen; Desktoptests Nutzer, keine Mainintegration.
[Plan und Nachweise](../acceptance/RC173_SHARED_RELEASE_20261023.md).
RC172 und alle älteren Pakete/Profile/Nutzerläufe bleiben unverändert.

Gemeinsamer App-/Tagcommit e253380e708de4c347e1aaad7ba836763aabec56,
FP8b1644e102d65f40985825300693dee901f0e21c08cb924a201d42b94c5479bc/351.
Frische302+11/Native300Rust+3ignored/Konverter38PDF+67Worker+49Office+41Grafik/
5Paketgates100MD PASS/stabil, beide Mac39992799112SUCCESS. Tatsächliche
Quellen-, Ganzlog- und Archivbytegegenreviews ohne neuen bestätigten Blocker.
Release422165357/18:17:26UTC/20Assets vor und nach Publikation frisch gehasht,
Tag/Commit/Inventar/IDs/Notesbody bestätigt; Windows lokal mit aktuellem Testplan.
Unterstützte Word-gridSpan/vMerge-/Nested-, XLSX- und DrawingML-Modelle;
altes Word-w:hMerge weiter unmodelliert. Generischer ganzer Wertschutz in
quellgebundenen sensiblen Feldern, keine universelle Felderkennung. Keine
Schutzlockerung, Mainintegration, Desktop-/Office- oder Applefreigabe daraus.

## BL-049.2 – Inhaltsabdeckung und lesbares Markdown nach RC171 (23.10.2026)

Status: **Technisch umgesetzt/revalidiert; RC172 für Windows und beide Macs
am 23.10.2026 veröffentlicht. Desktop-/Fachabnahme USER_PENDING.**
Aktueller Ausführungsstand: [RC172_SHARED_RELEASE_20261023.md](../acceptance/RC172_SHARED_RELEASE_20261023.md).
Vorheriger expliziter Nutzerauftrag:
zuerst Anforderungen, Ursachen und Rendereroptionen dauerhaft festhalten,
zusätzlichen ausgewählten Mehrformatlauf gegen Originale und MD analysieren.
Die erste Analysephase änderte noch kein Produkt. Der neue Auftrag umfasst
Implementierung/Tests und Test-Pre-Release, keine Mainintegration; Desktoptests beim Nutzer.

Verbindlicher Umsetzungs-/Entscheidungsstand:
[CONTENT_COVERAGE_BACKLOG_20261023.md](../acceptance/CONTENT_COVERAGE_BACKLOG_20261023.md).
Er umfasst native SmartArt-/Diagrammtexte, konkrete Folien-/Bildvorkommen,
fair begrenzte sequentielle Bildverarbeitung statt frühem gemeinsamem Pixelverbrauch,
sichere zusätzliche Grafikdecoder/-renderer, OCR-Qualität, sauberes Inhaltsmarkdown,
sichtbare präzise Auslassungsgründe und getrennte Windows-/Mac-Nachweise.
Suchtexte, echte Fach-/Personennamen, Umlaute/ß und andere gültige Sprachen nicht
pauschal löschen. Neue Texte vor Anonymisierung in dieselbe Schutzkette einspeisen.
Offline-, I/O-, ZIP-, Rechte-, Guard- und Residualprüfungen bleiben erhalten.

Gemeinsamer Appcommit `2d4a5fe2ef67ffa10e4015e34827853e08dfa0da`, FP
`9f18d7932883665efd64e94e7a79c6d8f701ffca639aac0f143442b2838cfc3a`/348.
Frische vier lokale Endgates PASS/stabil (298+11,300Rust/3ignored,
38PDF/67Worker/49Office/41Grafik,Paket5/100MD0Fehler), beide nativen Macjobs
39958898162 SUCCESS mit unabhängigen Ganzlog-/Bytegegenreviews. 20Releaseassets
vor/nach Publikation frisch gehasht; Windows lokal mit19Fallplan+FachprobenA–F.
Keine Mainintegration; ältere Pakete/Profile und echte Nutzerdateien unverändert.

Verbleibende klar benannte Abdeckungsgrenzen, keine stillen Schutzlockerungen:
Nicht gleichmäßige/vertikale/verschachtelte Word-Zellmodelle, sehr sparse XLSX-
Koordinatenlisten und geerbte PPTX-Tabellen konvertierbar, aber Anonymisierung
ohne sichere Feldbindung hart verweigert. Uniforme horizontale Wordpartitionen
bleiben unterstützt. Grafikdecoder decken geprüfte Teilmengen ab; unbekannte
Records/Codecs/Ressourcenstopps sichtbar, keine universelle Rendering-/OCR- oder
Artefaktfreiheitszusage. 120MP zählt primäre Office-OCR-Raster; separat begrenzte
Nachsegmentierung und unveränderte30MP-Spitzen-/Zeit-/OS-Grenzen bleiben.
Nächste menschliche Abnahme: aktuelle19Fälle und RC172A–F auf Windows sowie
beiden Macs, darunter echte Officeanzeige/Finder/TCC/Organisationsprofile.
Kein eigener neuer Implementierungsauftrag allein aus diesen Coveragegrenzen.

Zusätzliche Laufanalyse nur lokal, datensparsame Backlogbefunde ohne echte
Nutzerdateien, Personal-/Angebotsinhalte oder Diagnosepayloads in Git/CI/Releases.
Ausgewählter Lauf jetzt abgegrenzt analysiert: 117 Quellen, 107 gebundene MDs,
zehn aufgezeichnete Stopps. Neue Teilaufträge A–F im verlinkten Dokument:
moderne Excel-Kommentar-/Autorenrelationen, Word-Zellspans, OCR-Duplikate und
räumlicher Kontext, Excel-Leerbereiche/Zahlenformate, Vorlagenballast und präzise
Schutzdiagnose. Verschlüsselte/DRM-geschützte Quellen nicht als Rendererfehler
behandeln. Keine komplette visuelle Inhaltsfreigabe aus dieser Quellenanalyse ableiten.
Historische RC163–RC171-Einträge darunter bleiben historische Belege und sind
keine erneut kumulierte Aufgabenliste. Frühere UX-/Export-/Zuordnungsanforderungen
bleiben erhalten; die neue Arbeit darf diese Funktionen nicht zurückbauen.

Stand: 23.10.2026 · RC172 Test-Pre-Release; RC171 und ältere Pakete unverändert.

## Historische RC171-Übergabegates22.10.2026 10:49UTC nach geprüftem Nestedfix

Enger Drei-Produktmodulfix samt sechs neuen Testgruppen abgeschlossen und
unabhängig tatsächlich gegengelesen. Finale Restprüfung unverändert hart,
keine pauschalen Alias-/Contains-/Policyausnahmen. Globale Detailgrenze und
gemeinsames privates Kindintervallgewicht max5000 eng korrigiert/gegengelesen.
Main finale7Gruppen120FällePASS/stabil/Exit0 bis10:48:17.596UTC, aktuelle gebundene
PDFgegenprobePASS/Keepfinalverweigert/Originalrecordsbytegleich. FPb494f315…f66c8b/340,
578Testinputs08827fe6…acf1f. Frühere230Fälle aufbabFP bleiben Vorabgrün.

Offen: gemeinsamer neuer Source12Commit/Push/Freeze, vier frische lokale Gesamt-/
Native-/Konverter-/Paket-Endgates, beideMacconsumer+echte Artefakt/Loggegenreviews,
neue gebundeneWindowsGUI19 besondersPDFgeführt/Auto, lokale+GitHubÜbergabe.
23Source12Helfer vorbereitet/purePASS; keine altenFINALs oderGUI umetikettieren.
KeineMainintegration; allealtenProfile/Pakete/roten+grünenBelege erhalten.
Menschliche Windows/Mac/Zielhost-/Office-UAT USER_PENDING. DetailsRC171Shared.

## Historische Übergabegates22.10.2026 10:26UTC – nested Reviewaufbereitung

1. Bestätigte Source11-PDF-Reviewengstellen eng abschließen: vollständig einzeln
   quellgebundene echte Schachtelungen gemeinsam entscheiden, ausschließlich
   private Kindintervall-Capabilities, kein Crossing-/Kopien-/Literalbypass.
   Nur scanneridentisch belegte PERSON_ALIAS-Hardtreffer vollständig in offenen
   gebundenen Reviewintervallen privat pending; andere Hardreste sofort rot,
   finale Restprüfung unverändert/Keep muss weiterhin verweigern. Drei echte
   Produktionsmodule geändert, Main gezielte Tests und unabhängiger tatsächlicher
   Delta-Gegenreview laufen. Kein fertiger Fix-/Release-PASS behauptet.
2. Danach neuer gemeinsamer Source12Commit/FP, frische vier lokale Endgates,
   WindowsZIP+beideMacconsumer/Artefakt+Loggegenreviews, echte neue Windows19-
   Orakel einschließlich Auto/geführt-PDF sowie lokale+GitHubÜbergabe.
3. Source11 alle4Endgates/Mac39754454908/VERIFYs/Snapshot PASS, Pause→Neulauf→
   alterRun36/36 nativ bestanden. Diese bleiben historische Evidenz zum exakten
   e4d61ea, kein Ersatz für neue Fixbytes. App normalgeschlossen/Census0;
   alle alten Profile/Ergebnisse/roten+grünen Nachweise erhalten. Keine Main-
   integration/Tag/Release bis geeignet; menschliche Zielhost-UAT USER_PENDING.

## Aktive Übergabegates nach Pause-Aufnahmefix22.10.2026 09:17UTC

Enger main.rs-Fix mit2Tests fertig/gegengelesen: paused nur mit explizit beiden
Inaktivitätsflags false, alle aktiven/fehlenden/ungültigen Flags verweigert und
frische Backend-/Ownership-/Workerprüfungen erhalten. Autor11+1+1Rust PASS;
Mainvolle300Rust/3ignored+sechsNachbar-/Nativegruppen PASS/stabil/Exit0 bis09:15:33.
Unabhängiger tatsächlicher Delta-Gegenreview ohne bestätigten Blocker.
FP1f0fa47f…0b8a7/340, 578Testinputs310ab9c…2e99 unverändert. Source11Helfer
create-only vorbereitet/purePASS, neue Quellenfreeze/Endgates/Windows+beideMacs
und echte Pause→Neulauf→alten Lauf fortsetzen-Paketprobe noch offen.
Vorherige Source10Grüns/GUIFAIL bleiben mit ihren Bytes erhalten; keine
Freigabe, bis neue geeignete Belege vorliegen. Menschliche UAT USER_PENDING.

## Historischer nativer Aufnahmeblocker22.10.2026 09:10UTC

P2: DS-043 Pause→NeueVerarbeitung kann nativ keine neue Auswahl aufnehmen,
obwohl das Frontend sie anbietet. Source10bb73441 echte GUI-Reproduktion,
Main+unabhängiger Quellenreview bestätigen fehlendes paused in Rust-Allowlist.
Minimal korrigieren: paused nur mit explizit processing:false UND preparing:false,
aktive/fehlende/ungültige Statusflags ablehnen; frische Backend-/Ownership-/
Interaktions-/Workerprüfungen behalten. Native positive/negative Gegenfälle,
unabhängiges Delta-Gegenlesen, Main-Prüfung, neuer gemeinsamer Source11Commit/
FP/Freeze/frische vier lokale Endgates und beide Macconsumer. Anschließend
tatsächliche neue Paketprobe Pause→Neulauf→alten Lauf fortsetzen. Source10s
grüne Endgates/Artefakte und neue GUI-Teilbelege bleiben historische Evidenz,
keine Releasefreigabe/Umbenennung. 19geführt/auto und Historyhide4 noch offen;
kein vorhandener endgültiger UI-Abbruchbutton, keine falsche Abbruchabnahme.
Menschliche Zielhost-/Office-UAT bleibt USER_PENDING. Details RC171_SHARED_RELEASE.

## Aktive Übergabegates nach geprüftem Fix,22.10.2026 05:17UTC

Backend-Pendingfix abgeschlossen und unabhängig am tatsächlichen Produkt-/Testdelta
gegengelesen. Autor10neueGruppenPASS/stabil; Main unveränderte volle Sidecarintegration
sowie111Ergebnisgenerationen/68Review/28Context/9Entity/12Run/20Companionfälle grün,
alle7Gruppen Exit0/stabil bis05:17:56.481UTC. Historische09Rotbelege behalten;
keine zusätzlichen Publish-/Timeoutabkürzungen im Originaltest. Öffentliche pending-
und Content/Open/Publishgrenzen sowie alle echten Intent-/Residualschutzfälle bleiben.
Noch offen: neuer gemeinsamer Source10Commit/FP/Freeze, vier frische lokale Gates,
beide Macpakete/Review, neue paketgebundene WindowsGUI19 einschließlich tatsächlicher
Source07-Altprofilreparatur sowie lokale/GitHubÜbergabe. Source10helperMainpurePASS,
noch kein Stage/Start/Recovery-PASS. Menschliche UAT USER_PENDING. DetailsRC171Shared.

### Historische Übergabegates nach Kompatibilitätsbefund,22.10.2026 04:47UTC

1. Engen Backendfix für Legacy-approve/revoke nach sicher gespeicherter privater
   Korrektur ohne neuen Nativeintent abschließen und unabhängig am echten Delta
   gegenlesen. Nur vollständiger sicherer Wholevector/komplette Initial-/ACK-Kette,
   keine Native-/Legacyintents; dieselben privaten Belege direkt vor Single-/
   Batchcommit frisch prüfen. Öffentliches pending/Content-/Open-/Publishsperren
   sowie gebundene Residualreparatur und alle anderen Schutzfehler beibehalten.
2. Unveränderte vollständige Source-Sidecarintegration und volle Ergebnisgenerationen
   durch Main grün/stabil nachweisen. Source09Headless61/289+0/11 und beideMacs
   39723196230 sind ROT, kein fehlender Testpublish als Abkürzung einfügen.
   Native298Rust/3ignored/Konverter30/67/37/Paket5 dagegen PASS/stabil; alle Jobs
   regulär beendet. Zusätzlichen Writerteardown/erhaltene Fixtures nicht löschen.
3. Danach neuer gemeinsamer Source10Commit/FP und vier frische lokale Endgates,
   beideMacpakete/Review, echte neueWindowsGUI19inkl tatsächlicher Source07-
   Altprofilreparatur, lokale+GitHubÜbergabe. Source10helper nur vorbereitet,
   keine alten Belege übernehmen. Menschliche UAT bleibt USER_PENDING.

### Historische Übergabegates nach Testfix,22.10.2026 04:34UTC

Zwei reine Entitytests korrigiert/9+12FällePASS; historischer Schutz und neue
Precommit-Nichtmutation getrennt erhalten. Unabhängiges tatsächliches Gegenlesen
und MainsechsNachbarsuitenPASS/inputs_unchangedtrue/Exit0. Kein Produktdelta,
FPd73e5ee1…6a76/340 unverändert. Noch offen: neuer gemeinsamer Commit und alle
frischen Source09-Endgates, echte neueWindowsGUI19inklLegacyreparatur, beide
Macpakete/Review und lokale+GitHubÜbergabe. Alle menschlichen UAT USER_PENDING.

### Historische Übergabegates nach Source08-Endläufen04:24UTC

Reiner enger Testfix in test-standalone-entities.js und test-standalone-run-entities.js:
neue direkte Entity-Ablehnung vor Commit exakt samt Nichtmutation prüfen, alte
Unsafe-Approval-/Exportnegative mit klarer testeigener Altstand-Fixture erhalten.
Main+zwei unabhängige Code-/Primärlog-Gegenreviews bestätigen alten Testablauf als
Ursache. BeideMac39721379901 und WindowsHeadless39/289ROT an derselben Assertion;
keinMacrechte-/Corefehler aus diesem Test. WindowsNative298/Clippy/Release,
Konverter30/67/37 und Paket5/100MD bestanden/inputsstabil, alle08Jobs beendet.
Keine produktive Schutzlockerung; erst Testfixgegenreview/neuer gemeinsamer
Source09Commit und frische Endgates. Noch kein09Freeze/Paket/GUI/Release.

### Historische Übergabegates04:05UTC

Precommit-Entitykandidatenprüfung und gebundener privater Reparaturzustand sind
implementiert und unabhängig am echten Code gegengelesen. Autoren:68+101 Backend-
und819 Frontend-/Presentation-/Workspacefälle PASS; Main las alle Deltas selbst.
Der eigene unveränderte10-Gruppen-Gegenlauf bestand vollständig (Exit0,
inputs_unchangedtrue,04:14:56UTC). Danach neuer gemeinsamer
Commit/Fingerprint, frische Gesamt-/Native-/Konverter-/Paket-/Macbelege und echte
neue paketgebundene Windows-GUI, einschließlich Ablehnung ohne Commit und
bewusster Reparatur des tatsächlich gespeicherten synthetischen Source07-Altstands.
Noch kein nativer Recovery-PASS, Freeze, neues Paket oder RC171-Release.
Der Mac-Receiptrollenfix und der lokale Altprofil-Helper sind vorbereitet und
gegengelesen. Keine unmögliche Direktunit-Receipt oder erfundene Desktopabnahme.

### Historische Releaseblocker nach echtem Windows-GUI-Test, 03:23 UTC

1. Entity-Kandidaten vor atomarem Entscheidungscommit verifizieren, statt einen
   gespeicherten Keep-Stand erst bei der Bereitstellung zu verweigern. Fachlich
   sichere Ablehnung verständlich ohne Revision/Publikation; unknown/IO/ACL-ACK
   bleibt konservativ. Gemeinsamer Windows-/Mac-JS-Pfad, keine Rechteursache.
2. Bereits gespeicherte, nicht bereitstellbare ältere Revisionen bewusst sicher
   reparierbar machen: gebundene aktuelle Selection/Journal/Initial-/ACK-Kette,
   keine offenen Native-/Legacy-Operationen, kein Export-/Readygrant. Keine
   automatische Rücknahme oder Änderung alter Ergebnisse/Belege. Policy bleibt.
3. Danach neuer gemeinsamer Commit/FP und alle frischen Headless-/Native-/
   Konverter-/Paket-/Mac-/Windows-GUI-Endgates. Source07-GUI05 ist FAIL; alte grüne
   Gates/GUI01/06 ersetzen das nicht. Kein Release mit bekanntem Blocker.
4. Im neuen Mac-Reviewhelper ausschließlich die unmögliche direkte Unit-Receipt-
   Anforderung korrigieren. Tatsächliches natives Budgetorakel bleibt Pflicht;
   Mac-direkter Unit-Test NOT_RUN, Windows-Headlessbeleg getrennt. Menschliche
   Mac-/Windows-/Excel-/Numbers-/Finder-/TCC-/M2-Abnahme weiterhin USER_PENDING.

Source07 vollständig grüne Gesamt-/Native-/Konverter-/Paketgates und erfolgreiche
beide Macconsumer39710736315 bleiben erhalten. Echte GUI01/06 PASS,04 positiver
Korrekturteilfall,05 FAIL,Rest NOT_RUN. App normal geschlossen,89Inputs bytegleich.
Ausführliche Bindungen und negative GUI-Evidenz: Source07-CHECKPOINT.md und
docs/acceptance/RC171_SHARED_RELEASE_20261022.md. Noch keine finale Übergabe.

### Historischer Quellenabschluss 02:18 UTC vor Source07

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


Quellenabschluss22.10.01:23UTC: Mapping-Konkurrenzgegenfix und Badgefix fertig,
jeweils unabhängig am tatsächlichen Produktionsdelta gegengelesen, kein
bestätigter Deltablocker. Autor62/26/17/15/37gezielte Fälle+66Sourceadapterchecks
PASS, Main469Workspace und zehn gezielte Gruppen PASS/Inputs unverändert,
01:22:15.973–01:24:30.627UTC.578Inputs/Manifestc845ece7300cc5b047542fa456509e0fb61416d3cd2d7490deee637282e2155f.
ProduktFP
1320d938f4976b0647b5db970252edf48d792793860bad956acf59dee5a6c29b/340.
Nächster offener Schritt: neuer gemeinsamer Commit/Push/Macconsumer und Source06-
Freeze; gesamte frische Regression/Native/Konverter/Paket und19echte GUI-Fälle.
Separater echter nativer Postfix-Konkurrenznachweis wird vorbereitet, erst an
neuen Paketbytes ausführen. Keine alten Belege oder historische Ursache umdeuten.

Aktueller Abschlussbedarf22.10.01:12UTC: separat kausal bestätigte logische
Documentcontroller-Konkurrenz beim Mappingabschluss eng an idempotenten
Metadatenreads abfangen, beide Workerpfade wirklich awaiten. Bestehende synchrone
History-/Recovery-APIs und Guard-/ACK-/Schreibentscheidungen unverändert lassen.
Diagnosepaket525e lieferte nativ nach zwei Neustarts/Zielwechsel165ByteMD und
drei vertrauliche Dateien,89Originale unverändert; erklärt historischen GUI06-
Primärfehler nicht rückwirkend. Native Konkurrenzprobe bestätigt Busy vor Action,
unveränderten Intent und genau einen Commit nach tatsächlicher Freigabe.
Zusätzlich Navigationsbadge nach Abschluss aktualisieren: Autor469/469 inkl.
11Gegenfälle grün, unabhängiger Quellengegenreview läuft. Danach Mainprüfung,
neuer gemeinsamer Commit und alle frischen Endgates/19echten Windows-GUI-Fälle.
Kein alter GUI-/Mac-/Paket-PASS auf neue Bytes; noch kein RC171-Pre-Release.

Diagnosequellen inzwischen ergänzt/gegengelesen und gezielt grün: neun feste
Mappingphasen/Originalcode vor Normalisierung, RAW-Weiterwurf identisch, keine
Retry-/Guard-/ACKänderung. Neues synthetisches Windows-Diagnosepaket als nächster
Schritt; tatsächlicher GUI06-Primärfehler bleibt offen, nicht als behoben melden.

Source05/17d6bc1: kein Release. Beide MacconsumerSUCCESS; Windows
Native/Konverter/PaketPASS, HeadlessROT221/288 an einzelnem altem Testcaller,
eng testseitig grün korrigiert. Echte GUI06 scheitert nach Vertagen/Neustart/
Zielwechsel und gespeichertem Personenentscheid im privaten Mappingabschluss.
Intent/Artefakt vorhanden, keine CSV/öffentliche Ausgabe; Primärfehler im Catch
verloren. Inhaltsfreie Phasendiagnose, kausale Gegenprobe/Fix und neue gemeinsame
Quellbindung/alle Endgates erforderlich. GUI01Defaultausgabe tatsächlich PASS;
89synthetischeOriginale bytegleich, altes Profil/rote Belege unverändert erhalten.

02:06: vier Testdateien eng korrigiert, unabhängiger tatsächlicher Gegenreview
ohne Deltablocker. Voller Sidecar einschließlich acht echter Pipe-Negativen,
tatsächlicher WindowsLoader/Guard/2MD/Readonly-Reopen und Main51Lifecycle grün;
keine Produkt-/Guard-/Macänderung. Test-eigene Ordnerprecondition ausdrücklich
kein TauriACK. Source05-Helfer Maingeprüft, ProduktFP3c710393…/340 unverändert,
577Inputs neuerManifest6d612306… . Jetzt neuer gemeinsamer Commit/Source05-Freeze,
frische Gesamt-/Native-/Konverter-/Paket-/beideMacgates und Windows-GUI nötig.
Historische rote Enddateien/Fixtures erhalten, keine Veröffentlichung alter Bytes.

Aktuell01:57: Source04/a5d4cec Native298/NodeRust/Clippy/Release und Konverter
30/67/37PASS/stabil, Paket/HeadlessROT an zwei alten Testvorbedingungen: fehlende
Windows-Initialreceipt in reiner CGuard-Fixture und Sidecarcallback nurSEQ1 statt
korrekterSEQ1/2. Produktverweigerungen nicht lockern, nur eng Testharnesskorrektur
nach tatsächlichem Ende allerJobs/Maccancel. Neue Source05-Bindung/Endgates/GUI.

Quellenabschluss01:46: native Initial- und Recoverypfade implementiert;18native/
8configured/Clippy,83JS-Provisionierungsfälle und Main12/12Recoverygruppen mit
unveränderten Inputs grün. Zwei unabhängige tatsächliche Produktionsgegenreviews
ohne bestätigten Deltablocker. Gemeinsamer FP3c710393…/340,577Test-/Scriptinputs.
Jetzt neuer gemeinsamer Commit/Source04-Freeze, frische Gesamt-/Native-/Konverter-/
Paket-/beideMacgates und gebundene Windows-GUI erforderlich; kein altes Grün kopieren.

Aktuelle begrenzte Korrektur implementiert, Freigabe noch offen: native feste
Initialcontainer beim Erstellen geschützt, 13WindowsACL/Clippy und Main15/15JS-
Gruppen PASS, Quellen unverändert während Mainlauf. Eltern-/Bestands-ACLs und
Settings bleiben unverändert, fertige öffentliche Arbeitskopien bearbeitbar.
Rustgegenreview ohne bestätigten Deltablocker, JSgegenreview folgt. Kanonischer
Plan288+11; Source04-Helfer vorbereitet/geprüft, noch kein neuer Freeze/Paket.
Danach neuer gemeinsamer Commit/FP, sämtliche Endgates und echte Windows-GUI.
Neuer bestätigter P2 vor Freeze: Wiederaufnahme alter offener Läufe und Zielwechsel
brauchen dieselbe native Initialvorbereitung vor Worker/Replay; derzeit enger
Lifecycle-/Outer-/Completion-Folgefix plus Gegenfälle. Kein readonly-/Startup-
Provisionierungsrecht und keine neue Schreibquittung für fertige Arbeitskopien.

Historischer bestätigter RC171-Blocker aus echter Windows-GUI01: neue feste initiale
Outputcontainer erben mit Node-mkdir0700 fremde Modify-ACLs. Guard verweigert korrekt.
In Umsetzung: vorhandene native handle-relative sichere Erstellung wiederverwenden,
Root-/Settings-/Childidentitäten binden, Default/explizit und beide Modi, vor jedem
Intakestart bestätigen. Bestands-/Elternrechte nicht ändern, Guard/C-ABI/MacCore
nicht lockern/neu bauen. Zusätzlich beide26erHinweisvokabulare identisch sortieren
und Invariante testen; Gesamtlauf105/287 war dadurch rot, keine Produktcrashdiagnose.
Source03/8871b4d nicht veröffentlichen. Alle Jobs beendet/gezielt cancelled und
eigeneGUI normal geschlossen. Nach unabhängigen Gegenreviews neuer gemeinsamer
Commit/FP und frische Endgates/GUI; ältere Belege bleiben unverändert erhalten.

Veröffentlicht: **3.2.0-rc170**, PPTX-/PDF-/OCR-Korrekturen technisch geprüft und
übergeben; vorhandene PDF-Suchtexte bewusst erhalten. TXT-gleiche Zuordnung und
bearbeitbare Ergebnisse ausRC169 bleiben. Menschliche Windows-/Mac-/Officeabnahme
offen. Frühere Pakete und Ergebnisstände bleiben unverändert.

## In Umsetzung – PARTIAL-EXTRACTION-01 (21.10.2026)

Nutzerauftrag: Word/Excel/PowerPoint/PDF unter Windows und macOS bestmöglich
verarbeiten. Einzelne nicht lesbare Bilder, unabhängige beschädigte Teile und
lokale Ressourcenfehler dürfen sicher gewonnenen Text nicht pauschal verwerfen.
RC170 und vorhandene Nutzerdateien bleiben unverändert. Neuer Nachtauftrag:
Hauptagent prüft Windows nativ mit gebundenem eigenem Paket, isoliertem Profil
und synthetischen Daten; menschliche Windows-/Mac-Abnahme weiter USER_PENDING.

1. Geschlossene, formatbezogene Auslassungshinweise und eindeutiger Teilstatus.
   Keine Bild-/Binärartefakte oder Exception-/URL-Texte in Markdown übernehmen.
2. Office-Bilder einzeln behandeln; unterstützte Raster lokal erkennen,
   unbekannte/defekte Bilder auslassen. PDF-Seiten und native Suchtexte unabhängig
   von anschließend fehlschlagendem Bild-OCR behalten; Suchtexte nicht löschen.
3. Vollständig validierte Konvertierungsabschnitte über einen begrenzten privaten
   Workerkanal sichern. Teilübernahme erst nach bestätigtem Workerende; keine
   Übernahme nach Protokoll-, Isolations-, Bindungs- oder Abbruchfehlern.
4. Expliziter Standalone-Partialmodus für unabhängige Office-Parts: globale
   ZIP-/Pfad-/Kontrollteilprüfung unverändert; nur eindeutig gebundene, CRC- und
   formatgeprüfte Teile verwenden. Externe Referenzen niemals auflösen/ausführen.
5. Anonymisierung unverändert auf alle übernommenen Teiltexte anwenden. Keine
   Rohtext-Veröffentlichung als anonymisiert, keine erfundene Vollständigkeit.
6. Gezielte positive/adversarielle Tests, unabhängige tatsächliche Quellenreviews
   sowie Windows-Nativeprüfung. Mac-Quellverträge gemeinsam; echte Mac-Paket-/
   Zielhostabnahme erst an neu gebundenen Paketen, kein Ersatz durch Windowsmodelle.

Kein universelles Reparaturversprechen: Bei unklarer Containerstruktur, fehlender
vertrauenswürdiger Textbasis oder verletzten Sicherheitsbindungen bleibt eine
konkrete Fehlermeldung statt leerem/falschem Erfolg. Keine zusätzlichen nativen
Renderer, Apple-Zertifizierung oder OS-Schutzänderung. Umsetzung und unabhängige
Quellgegenreviews vorhanden, unterbrochene Endprüfungen neu binden. Expliziter
RC171-Releaseauftrag vom22.10.; [Plan](../acceptance/RC171_SHARED_RELEASE_20261022.md).

Source01-Endlauf vor Freigabe ROT in echter früher Windows-Konvertertimeoutprobe;
kein Paket/Gesamt-PASS. Gezieltes Stoppen übriger eigener Freezejobs dokumentiert.
Separat nativ belegte Input-EOF-nach-Kill-Fehlerklasse eng korrigiert und unabhängig
an frischer Projektion gegengeprüft,42Checkpointfälle grün. Neue Source02-Endgates
erforderlich. Zusätzliche Fachprüfung fokussiert echte Funktionsblocker statt
neuer Features; vorhandene Schutzprüfungen und alle Nutzerdateien bleiben erhalten.

Source02-Windows5Native/30PDF/67Converter/37Office/5Paket/100Korpus tatsächlich
PASS mit unveränderten Inputs. MacARM ROT an historischem Cleanup-Testregex,
nicht belegtem Produktcrash; nach vollständigem Stopp übriger eigenerJobs enger
behavior-bound Testfix und neueSource03-Gesamt-/Mac-/Paketbelege. Übergabeleser
zusätzlich exakt7Helperpins verlangen, tatsächlicherCheckpoint bereits korrekt.
Windows-Agentenkampagne19Bereiche/89synthetischeInputs vorbereitet, NOT_RUN.

## Abgeschlossen – RC170 gemeinsamer Test-Pre-Release (21.10.2026)

Gemeinsamer Appcommitab05612443ccf2914f4170b56d88f636c39c742f,
FP94c392156dc1d21094d1bd0c6e1b7653756eefcd7cb94b745fc0e9cb603358db/338.
285/285+11/11,WindowsNative/5Paketgates,beideMacjobs39636489410 und unabhängige
tatsächliche Archivgegenreviews bestanden.20Remoteassets vor/nach Veröffentlichung
frisch gehasht,Tagquelle/PreReleaseflag bestätigt. Windows lokalRC170 mit14Fall-
Testplan. Kein Main-/Desktop-/Apple-Zertifizierungsauftrag; Desktoptests beim Nutzer.
[Bindungen/Abschluss](../acceptance/RC170_SHARED_RELEASE_20261021.md).

## Quellimplementierung technisch geprüft – DOC-TEXT-01 (21.10.2026)

- PPTX: exakte interne moderne Kommentar-Beziehung passiv ignorieren; keine
  Ausführung aktiver Teile oder Aufweichung der ZIP-/CRC-/Pfadkontrollen.
- PDF: Nutzerwahl „Suchtexte erhalten“ umgesetzt. Alle vorhandenen TextItems
  einschließlich unsichtbarer Such-/Barrierefreiheitstexte behalten. Renderbelege
  ausschließlich für exakte positionsgebundene OCR-Dopplungen; ohne OCR keine
  zusätzlichen Rasterproben. Mehrdeutige Artefakte bleiben, keine semantische
  Vollbereinigung behaupten.
- Zeichenhygiene ausschließlich vor privater Markdown-/Kontakt-/Hashbindung:
  Umlaute/ß und andere Sprachen/Symbole bleiben; kein Deutsch-Whitelistfilter.
- Unabhängige tatsächliche Gegenreviews abgeschlossen; Windows-Konverter67/67,
  Office/OCR31/31 und Original-PPTX/PDF mit/ohne OCR bestanden, Inputs unverändert.
  FP1a09bf04d7cc198e004437847df90cf157ecddd7f7890331f6e5ccfe4a6e7be6/338.
  Mac-Bundle-Quellmodell geprüft, kein nativer Mac-/Paket-/Desktop-PASS.
  Dies war der historische Vorabstand ohne neuen Build-/Veröffentlichungsauftrag;
  gemeinsame RC170-Endgates und neue Pakete inzwischen wie oben abgeschlossen.
  [Nachweisplan](../acceptance/DOCUMENT_EXTRACTION_ARTIFACTS_20261021.md).

## Abgeschlossener Implementierungsauftrag – RC169

- **RESULT-WORKING-COPY-01:** Nach bestätigtem Abschluss öffentliche Ergebnisse
  manuell bearbeitbar. Normale Ordneröffnung ohne öffentliche Blatt-Hash-/Identitäts-
  oder Inventarprüfung; private Abschlussbelege und Zielordnerbindung bleiben.
  Neue App-Korrekturen ausschließlich aus privater Basis in neuen Ordner.
  Pending-Publish/ACK/Spools/Guard weiter streng, keine externe Adoption/Überschreibung.
  Fehlender/ersetzter Ordner neutral nicht verfügbar, kein Produktabbruch.
- **RESULT-COMPANIONS-03:** erstes Blatt Zuordnungen, Spalten Pseudonym/Typ/
  Originalwert(e)/Vorkommen/Datei. Eine Zeile je belegtem TXT-Eintrag und exakt
  dessen gesamte Häufigkeit, auch bei mehreren Originalvarianten. Gleiche Marker
  aus verschiedenen Dateien nicht zusammenziehen; ausgeschlossene Werte bleiben
  getrennt als Hinweise. Keine Identitäten aus Text erfinden oder TXT neu parsen.
- Bestehende technische Übersicht/Detailblätter bleiben dahinter; Literaltext,
  Langwerte und feste OOXML-/Publikationsbudgets erhalten. Numerische Häufigkeiten.
  Alte Ergebnisdateien/no-op/resume unverändert; erst neue bewusste Stände neu.
- Unabhängige Fachreviews, gezielter TXT-/XLSX-Gleichheitsgegenfall samt Nutzer-
  beispiel und neue gemeinsame Windows-/Mac-Testpakete. Desktop-/Office-UAT beim
  Nutzer/Kollegen, keine Automation oder Apple-Zertifizierung.
  [Auftrag](../acceptance/RC169_WORKBOOK_MAPPING_20261020.md).
- Source01 lokal vollständig grün, ARM grün; Intel durch belegtes45Minuten-
  CI-Joblimit abgebrochen, kein geeigneter gemeinsamer Release. Enger75Minuten-
  Consumer-CI-Rahmen ohne interne Test-/Produktdeadlineänderung; unabhängiger
  Gegenreview und neue gemeinsame Source02-Endgates/Pakete erforderlich.
- Source02 tatsächlich neu285/285+11/11, Windows280Rust(3ignoriert)/Clippy/
  echte Node-Rust-Pipe/Release/Paket5/Korpus100 und beide Macjobs39461104366
  grün, Quellen unverändert. App-/Tagcommit8f21b55a41fb63ab62f92d198ec8f108ab8164ad,
  FP77937b239fd35cbc80b7c2037d5d597be007625997815b44e35876fc1d4bd11c/336.
  Unabhängige tatsächliche Windows-/ARM-/Intel-Artefakt-/Übergabegegenreviews;
  nur Modusqualifikation im erzeugten Releasebeschreibungstext korrigiert.
  [RC169](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc169)
  veröffentlicht:20Assets vor/nach Publikation frisch gehasht, gleicheIDs/Tagquelle.
  Windows lokalRC169 mit Testplan/18Dateien/drei synthetischen Beilagen.
  Offen bleiben Nutzerdesktop-/Office-/Mac-Zielhosttests, keine erfundenen PASS.
  Keine Main-Integration, Automation oder Apple-Zertifizierung.
  [Exakter Abschluss](../acceptance/RC169_SHARED_RELEASE_20261020.md).

## Historischer Implementierungsauftrag – RC168 Nachbearbeitung und strukturierte Zuordnung

- **TEXT-POSITIONS-01/P1:** CRLF/LF/CR-Anzeigeoffsets sicher mit Backendpositionen
  verbinden. Maskierung, beide Hervorhebungsfelder und Markdown-Nachkorrektur
  gemeinsam revalidieren; unveränderliche gespeicherte Texte/Hashes erhalten.
- **REVIEW-ACTIONS-01:** Einheitliche UI-/Handlerbedingungen mit sichtbaren
  Sperrgründen, sichere Markierung/Vormerkung, klare Fundstellenseitennavigation
  und Behandlungs-/Geltungswahl. Kein neuer Freigabe- oder Exportschritt.
- **RESULT-COMPANIONS-02:** Neues /3-Inventar mit Dateizuordnung.csv,
  Pseudonym-Zuordnung.txt und Pseudonym-Zuordnung.xlsx unter Vertraulich.
  Drei Datenspalten je Dokument, belegte Identitäten und verlustfreie Langwerte;
  alte /1-/2-Leser/Resume und exakt gebundene Nativeverträge erhalten.
- Gemeinsame neue Windows-/ARM64-/Intel-Testpakete erst nach unabhängigen
  tatsächlichen Quellenreviews und neuen vollständigen technischen Endgates.
  Desktopabnahme bleibt bei den Nutzern, keine neue Automation oder Apple-
  Zertifizierung. [Umfang und Quellen](../acceptance/RC168_REVIEW_CORRECTION_AND_WORKBOOK_20261020.md).
- Source01-Endlauf: Native/Paket grün, Headless148/285 rot bei veralteter
  geschlossener Modulliste. Genau Workbookeintrag ergänzt, unabhängig geprüft
  und gezielter Test PASS; kein Produktionsdelta. Neue Source02-Endgates und
  Macconsumer beider Architekturen nötig; Source01 bleibt historische Evidenz.
- Source02:285/285+8/11, Gesamturteil rot am alten Browservertrag (verborgener
  Maskierknopf plus zweiter Bestätigungsklick). Zwei unabhängige Gegenreviews:
  Harness widerspricht genehmigtem Ein-Klick-Flow. Strikter Ersatz ohne Verlust
  der Nichtmutations-/Sperr-/Axe-/Fokusorakel vollständig durch Autor/Main grün,
  unabhängig final gegengelesen; neue Source03-Gates erforderlich.
- Source03 tatsächlich neu bestanden:285/285+11/11, Windows275Rust/3ignoriert/
  Clippy/Release/Paket5/Korpus100 ohne Fehler und unveränderte Inputs.
  Mac39401647855 beide grün, je266Rust/3ignoriert/70Generationen/20Companion/
  34Workbookfälle und native App-/ZIP-/DMG-Gates. App-/Tagcommit0049513a9ba661bee4190a6677bb3ddffef461a9,
  FP48ba2fa729f2ac59cc4d47bc57bf6633c580b8316fe330fadeccf9a6064224e3/336.
  [RC168](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc168)
  veröffentlicht;20Assets vor/nach Veröffentlichung frisch gehasht, IDs/Tag
  unverändert. Windows lokal mit Testplan und drei Testdatenbeilagen.
  Kein bestätigter weiterer Implementierungs-/Übergabeblocker in den begrenzten
  Quellen-/Artefaktreviews. Offen: zehn Nutzerdesktopfälle, echte Excel-/Numbers-
  Anzeige, M2/Finder/TCC/Gatekeeper/Enterprise/VoiceOver/macOS13.5/26.
  Historische Ursachen nicht rückwirkend erklärt. Keine Main-Integration,
  Desktopautomation oder neue geplante Aufgabe.
  [Exakter Abschluss](../acceptance/RC168_SHARED_RELEASE_20261020.md).

## Historischer Nutzerbefund – vertrauliche Zuordnungen im Ergebnisordner

**RESULT-COMPANIONS-01 – umgesetzt, technisch geprüft, RC167 veröffentlicht:** Der reale
Windowslauf `d7047e01…` besitzt beide internen Zuordnungen, aber keinen sichtbaren
Unterordner. Nutzeranforderung: Im geöffneten anonymisierten Ergebnisstand müssen
`Vertraulich/Dateizuordnung.csv` und
`Vertraulich/Personen-Pseudonym-Zuordnung.txt` physisch vorhanden sein, ohne
weitere Buttons oder Exportpflicht. Auch nach Nachbearbeitung muss der vollständige
neue Stand seine eigenen tatsächlichen Dateinamen und Identitäten abbilden.
Versionierter geschlossener Inventar-/Transaktionsvertrag; Hash-, Eltern-,
Objekt-, Budget- und Native-Guardprüfungen bleiben erhalten. Kein nachträgliches
ungeprüftes Kopieren in alte `/1`-Ergebnisordner und keine Reparatur beim Lesen.
Quell-/Native-Gegenprüfungen bestanden:16Companion-/65Generationenfälle,
65Async-Assertions,265Rust/3ignoriert/Clippy und echter Node→Rust-Pfad für
beide Betriebsarten. Unabhängige Erstwriter-/Store-/Rustreviews, engste neue
Native-ACL-/Nullgrößen-/Async-Befunde ebenfalls behoben und revalidiert.
[Nachweise und Grenzen](../acceptance/RC166_RESULT_COMPANIONS_FIX_20261019.md).
Vollständige neue Source04-Gates bestanden:284/284+10/10, Windows265Rust/
3ignoriert/Clippy/Release/Paket5/Korpus100; beide Macjobs39335666200 je256Rust/
3ignoriert/68Generationen-/16Companionfälle samt nativen App-/ZIP-/DMG-Gates.
App-/Tagcommit `84df81c3c935cca6447ad05686c3f43416aabdb6`, FP
`71aa639ee12adc28980d27f3ff311e59ea23549148293a2488d215fde9fe5418`/334.
[RC167-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc167)
mit20frisch nachgehashten Assets veröffentlicht; Windows lokal unter
`Software DataSecure/RC167`. Alte Pakete/Belege unverändert, keine rückwirkende
Reparatur alter Ergebnisordner. Desktoptests/zehn Fälle übernimmt der Nutzer;
physische Mac-Zielhostgates offen. Keine bestätigten weiteren Implementierungs-
blocker aus den begrenzten Endreviews. Keine Main-Integration oder Automation.
[Abschluss-/Gegenbelege](../acceptance/RC167_SHARED_RELEASE_20261020.md).

## Historischer Abschluss – RC166-Testübergabe

UX-DIRECT-RESULTS-01, UX-OCR-FOLDER-01, UX-HISTORY-DETAILS-01,
UX-HISTORY-COPY-STATUS-01 (im Direktablauf Ergebnisstatus), UX-ANON-CHOICE-01,
UX-PROCESSING-FLICKER-01 und TESTDATA-LARGE-01 implementiert, gegengeprüft und
neu gebaut. Keine zweite Pflichtauswahl/Freigabe/Export nach den erforderlichen
Prüfgruppen; vollständige neue Korrekturgenerationen, technische Grenzen erhalten.
READ-INITIAL-SNAPSHOT-01 eng behoben, strikter Mutationsreader unverändert.
Keine weiteren bestätigten Implementierungsblocker aus den begrenzten Endreviews.

App-/Tagcommit `e04d32cff603597ce3d8c982e94154bb00f534fb`, Fingerprint
`741e69e3f76981431f96408a7b19338820b722f11533fc234151aff2f786a9a7`/333;
283/283+10/10, Windows253Rust/3ignoriert/Clippy/Release/Paket5 und beide
nativen Macjobs39317346697 (je243Rust/3ignoriert) erfolgreich, Inputs unverändert.
Tatsächliche Windows-/Mac-Artefakte unabhängig gegengelesen;20Releaseassets vor
und nach Veröffentlichung frisch gehasht, gleicher Bestand und Tagcommit.
[RC166](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc166),
Windows lokal `Software DataSecure/RC166-R2` mit aktuellem Testplan und drei
unveränderten Testdatenarchiven. Frühere Pakete/Primärbelege/Profile erhalten.

Verbleibend: zehn menschliche Windowsfälle und reale Mac-Zielhostabnahme;
keine GUI-FINAL, M2/Finder/TCC/Enterprise/VoiceOver/macOS26-PASS behauptet.
Historische Source07-Default-/Manifestursachen und Source09-native Scheduling-
folge weiter unbewiesen; neue erfolgreiche Gates erklären sie nicht rückwirkend.
Der separat reproduzierte Quellrace ist dagegen kausal korrigiert. Main-CI nach
zukünftiger Integration bleibt getrennt; keine RC166-Main-Integration beauftragt.
Keine Automation oder globale Sicherheits-/Berechtigungsänderung.

## Historischer Entwicklungsauftrag – Nutzerbefunde als RC166 umsetzen und neu prüfen

**READ-INITIAL-SNAPSHOT-01:** Source09-Intel verweigerte im echten OCR-an-
Readinesslauf mit RESULT_PUBLICATION_CONFLICT. Unabhängiger tatsächlicher
Quellenreview und eigener realer Produktionschild-Gegenfall bestätigen:
initialResultPublication nutzt einen strikten Reader, obwohl der autonome
Worker denselben Record legitim atomar ersetzt. Enger getrennt lesender
Snapshotzugriff unter originaler Elternbindung, max3Gesamtversuche allein
über vorhandene interne Replacementklassifikation; anschließend volle Schema/
Batch/Owner/Purpose/Anchorprüfung. Keine Mutation/ACK/Reparatur oder generische
Retryautorität. PrivateLedger-Zweitread ebenso berücksichtigen; allgemeines
readRecord bleibt bytegleich. Neue Positiv-/Negativorakel und Source10-Gates
vor Übergabe nötig. Historische native Schedulingfolge weiter unbewiesen;
Windows253Rust/Paket5 und abgebrochene Source09-Jobs nicht umetikettieren.
Eng implementiert und unabhängig am tatsächlichen Delta gegengelesen; das
identische vorher rote reale Childorakel ist jetzt grün. Main34Snapshotfälle,
2Win-Races (6POSIX NOT_RUN),15Initialwriter/53Generationen/51Asyncprüfungen
bestanden. Reine Testdiagnostik ergänzt Initial-/Binding-/Leaf-/Inventarphasen,
27Observer+8RAM-Gegenfälle mit unveränderten Caps und identischen Produktwerten.
Keine behobene historische native Ursache behauptet. Source10-Endgates offen.

**VERIFY-HEARTBEAT-ORDER-01:** Source08-ARM erhielt Antwort42, verlangte aber
nach einem vorher gestarteten1150ms-Producer fälschlich mindestens einen
Heartbeat. Vor Receiverstart oder am Timeout-Rand verfügbare Antworten dürfen
korrekt ohne Progress zurückkehren. Konkreter nativer Schedulerpfad unbekannt.
Nur cfg(test) geändert: Antwort im ersten echten Callback, exakt1Heartbeat;
separater bereits gefüllter Kanal exakt0. Produktionscode/Intervall/Deadline
unverändert, Main und unabhängiger tatsächlicher Quellenreview,2Rusttests PASS.
Source08-Windows252Rust/Clippy/Release/Paket5 bleibt historische Evidenz;
Headless59Dateien bewusst abgebrochen, Intel gezielt cancelled. Kein kompletter
Source08-PASS oder Manifestdiagnose aus dem frühen ARM-Fehler. Frische gemeinsame
Source09-Endgates erforderlich; kein behobener Produktfehler behauptet.

**BUILD-MAC-MANIFEST-01:** Source07 ARM118234561544 verweigert vor Truncate
einen Statvergleich. Konkretes Feld/Ursache noch unbekannt; derselbe Stand
bestand Intel118234561581 vollständig. Enges Diagnoseinstrument mit
ursprünglichen Held-/Named-Vergleichen, zusätzlichem Preopenvergleich und
geschlossenen Booleschen Fakten implementiert/gegengelesen;63Layoutfälle
bestanden. Kein Retry, keine ctime-Ausnahme oder Adoption. Nächster echter
nativer Lauf muss die tatsächlichen Fakten liefern; kein behaupteter Fix.

**VERIFY-NATIVE-DEFAULT-01:** Source07Headless nach220Dateien bei echtem
Windows-Node/Rust-Erstordnerexport mit AI_EXPORT_CONFIGURATION_REQUIRED rot.
Primärbelege und synthetische Fixture erhalten; kausale Produkt-/Testdiagnose
bleibt ohne bewiesene Ursache. Fokussierter unveränderter Wiederholungslauf,
danach finale12frische Erstinstallationen und kompletter Nativeexportumfang
mit unveränderten Inputs bestanden. Feste native Vor-/Nachadmissionphasen
erhalten Originalfehler und die exakte Ordner-/Schemaadmission, kein Retry.
Zwei neue Testharness-Lifecyclelücken (Closewait, vorgeschalteter Exitwait)
sind durch einen integrierten monotone180s-Restbudgethelper korrigiert;
fünfClose- und sechsCompletion-Gegenfälle inklusive NoExit/NoClose/SpawnError
plus Invaliddeadline bestanden. Kein rückwirkend grüner Source07-Endlauf,
frische gemeinsame283+10/Native/Paket/beideMac-Gates bleiben erforderlich.

**UAT-DEFER-SETUP-01:** Übergabegegenreview fand im Vertagentest fehlenden
Start/Modus/OCR-Aufbau. Anleitung ergänzt: neuer geführter Anonymisierungslauf,
OCR an, tatsächliche Prüfgruppe, nur vormerken, „Später entscheiden“, Neustart,
vollständige Gruppe speichern. Keine neue Pflichtfunktion oder Desktop-PASS.

**COMPAT-PUBLIC-METADATA-01:** Neuer P2 aus tatsächlichem JS-/Rustreview:
öffentliche neue macOS-Results müssen reguläre begrenzte Finder-`.DS_Store` zulassen,
ohne Metadaten in MD-Inventar/Receipt/Generation zu übernehmen. Eng implementiert;
private Stage/Legacy/Fremdnamen/MD-Hashes bleiben strikt. Gezielte Gegenprüfung
und neuer Source06-Freeze, keine Übernahme alter Source05-Pakete als Release.
Source05-Headless130/282 und ARM-ZIP-Smoke scheiterten an zwei veralteten
Testannahmen (Retention300 vs Katalog303; fehlender aktueller Ledger), beide
testseitig korrigiert. Frische gesamte Windows-/Mac-Belege bleiben erforderlich.

**UX-DIRECT-RESULTS-01 (neu ausdrücklich beauftragt, in Umsetzung):** Nach den
notwendigen OCR-/Fundstellenprüfungen direkt Ergebnisordner öffnen; zweite
Dokumentauswahl/Freigabe/Export entfernen. Optionale Korrekturen automatisch
als vollständigen neuen Ergebnisstand bereitstellen, Ordneröffner zeigt den
bestätigten aktuellen Stand. Keine fake Freigabe oder generischen Overwrites;
private Zuordnungen trennen, Legacy erhalten, manuelle Löschung nicht rückgängig
machen. Source02-PASS belegt alten Ablauf und wird nicht umetikettiert.
Details und neue Orakel: [Vertrag](../acceptance/RC166_DIRECT_RESULTS_20261019.md).

19.10.2026: Der Nutzer hat anschließend die Umsetzung aller nachfolgend
gesammelten Punkte und neue Windows-/Mac-Testversionen ausdrücklich beauftragt.
Ziel ist RC166 mit gleichem Appcommit/Featurestand für Windows x64 und beide
Mac-Architekturen; Windows zusätzlich lokal, Testdatenbeilagen getrennt.
Technische Schutzprüfungen bleiben erhalten. Kein Agent bedient den Desktop;
menschliche Windows-/Mac-Abnahme bleibt beim Nutzer und seinem Kollegen.
Neue native Mac-Consumer verwenden die vorhandenen genehmigten statischen
Coreartefakte; keine Developer-ID/Notarisierung/Apple-Einreichung und keine
Abschaltung von Gatekeeper, Hardened Runtime oder eigener Library Validation.
Der veröffentlichte RC165-Stand und sämtliche alten Nachweise bleiben erhalten.

Aktueller Umsetzungsstand vor dem neuen Buildfreeze: UX-OCR-FOLDER-01,
UX-HISTORY-DETAILS-01, UX-HISTORY-COPY-STATUS-01, UX-ANON-CHOICE-01 und
UX-PROCESSING-FLICKER-01 sind im gemeinsamen Frontend implementiert. Gezielte
Quell-/VM-Prüfungen: Workspace406/406, Reviewfrontend67/67; echte HTML-/CSS-/JS-
Gegenproben im Headless-Browser mit synthetischem IPC grün. Das ist keine
native Desktop-/Mac-Abnahme. TESTDATA-LARGE-01 ist als separat verifizierte
36-Dateien-Beilage fertig. CI-DOC-RC165-01 ist quellseitig korrigiert;
die vollständige Dokumentationskette ist grün, die nächste main-CI bleibt
nach Integration zu prüfen. Der eingefrorene Gesamt-/Native-/Paketnachweis
und die neuen Mac-Consumer folgen erst auf dem abschließenden gemeinsamen
Commit. Details: [RC166-Umsetzung und Nachweisgrenzen](../acceptance/RC166_BACKLOG_IMPLEMENTATION_20261019.md).

### Gesammelte Nutzerbefunde (frühere Sammelphase, jetzt zur Umsetzung freigegeben)

19.10.2026: Der Nutzer testet die veröffentlichten Apps selbst weiter. Änderungen
wurden zunächst ausschließlich im Quellcode gesammelt; keine Versionsanhebung,
kein neuer Windows-/Mac-Build, kein Release und keine Agenten-Desktopbedienung.

| ID | Auftrag / Grenze | Stand |
|---|---|---|
| UX-OCR-FOLDER-01 | Gemeinsame Windows-/Mac-Dateiauswahl: neben der Ordneranzahl „1 Datei benötigt OCR“ bzw. „N Dateien benötigen OCR“. Alle Unterordner einbeziehen, auch bei zugeklapptem Inhalt sichtbar; ebenso Gesamtlabel neben der Kataloganzahl. Dieselben verfügbaren `ocr_required === true`-Dateien wie die bestehenden Dateilabels, unabhängig von Auswahl und OCR-Schalter. Kein neuer Scan, keine OCR-Aktivierung, unbekannte PDF-/Office-Inhalte nicht raten. | Im Quellcode implementiert und unabhängig gegengelesen, gezielte Regression grün; noch nicht gebaut oder veröffentlicht. Desktopabnahme erst mit einem späteren Paket durch den Nutzer. |
| UX-HISTORY-DETAILS-01 | Gemeinsamer Windows-/Mac-Verlauf bei Markdown-Konvertierung: redundanten Button „Nachkorrekturen und Kopien“ entfernen. Dessen gespeicherten Kopier-/Bestätigungsstatus vollständig unter „Ausführliche Laufdetails“ integrieren und mit diesen ein-/ausklappen. „Nachkorrektur öffnen (optional)“ als eigenständigen Editorzugang und die Statusaktualisierung innerhalb der Details behalten; neue Beschriftung gemäß UX-HISTORY-COPY-STATUS-01. Nur den ausdrücklich geöffneten Lauf abgleichen; keine zusätzlichen Hintergrundscans, Kopien, Freigaben oder Änderungen an Schutzprüfungen. | Auf Nutzerwunsch vorgemerkt, noch nicht umgesetzt. Vor Umsetzung Regression für Auf-/Zuklappen, gezielten Statusread, offene Bestätigungen, erneutes Laden und Fokus sowie unabhängiges Quellengegenreview; kein neuer Build während der laufenden Nutzertests. |
| UX-HISTORY-COPY-STATUS-01 | In den ausführlichen Laufdetails der Markdown-Konvertierung auf Windows und Mac „Prüfstatus erneut laden“ in „Kopierstatus aktualisieren“ umbenennen. Mit UX-HISTORY-DETAILS-01 abstimmen: Aktualisierung bleibt innerhalb der Details, liest ausschließlich den gespeicherten Status und öffnet weder den Nachkorrektur-Editor noch erstellt sie eine Kopie. Kein zusätzlicher Pflichtschritt oder automatischer Hintergrundabgleich; Anonymisierung erhält nicht ungeprüft dieselbe Kopierstatus-Beschriftung. | Auf ausdrücklichen Nutzerwunsch ins Backlog aufgenommen, noch nicht umgesetzt. Bei Umsetzung sichtbaren Text, etwaige ARIA-Bezüge und Rücksetzung der Beschriftung nach erfolgreichem/fehlgeschlagenem Laden gemeinsam prüfen und testen. Kein neuer Build oder Versionswechsel während der Nutzertests. |
| UX-ANON-CHOICE-01 | Bei „Neue Verarbeitung > Umwandeln und anonymisieren“ auf Windows und Mac die Schnellweg-Checkbox durch eine gemeinsame exklusive Auswahl „Umgang mit unklaren Fundstellen“ ersetzen: „Selbst entscheiden“ (entspricht dem bisherigen Standard, vorausgewählt; automatische Anonymisierung, Rückfragen bei unklaren Fundstellen) oder „Automatisch maskieren“ (bekannte unklare Fundstellen automatisch maskieren, erfolgreiche Basisstände automatisch freigeben, nicht manuell geprüft; stärkere Maskierung möglich). OCR als unabhängige Checkbox „Text aus Bildern und Scans lesen (OCR)“ für beide Abläufe beibehalten; keine automatische Aktivierung. Alle vier Kombinationen bleiben gültig, technische Schutzprüfungen unverändert und Export weiterhin nur auf ausdrücklichen Auftrag. Keine neue Pflichtauswahl, kein zusätzliches Bestätigungsfenster, „Schnellweg“/„Prüfmodus“ nicht als irreführende Hauptbezeichnung verwenden. | Auf Nutzerwunsch vorgemerkt, noch nicht umgesetzt. KI-UX-Gegenreview und offizielle Gestaltungsempfehlungen geprüft; echte Nutzerabnahme steht aus. Bei Umsetzung bestehende Policy-/OCR-Verträge unverändert abbilden und alle vier Kombinationen, Voreinstellung/Neuauftrag, Tastatur-/Screenreader-Beschriftung sowie Windows-/Mac-Reflow regressionsprüfen. Kein neuer Build oder Versionswechsel während der laufenden Nutzertests. |
| TESTDATA-LARGE-01 | Zusätzlich zum vorhandenen vollständigen Testpaket ein separates kompaktes Paket ausschließlich mit den vorhandenen synthetischen „large“-Testdateien bereitstellen, gemeinsam für Windows und Mac. Bestehendes Paket/Originaldateien unverändert lassen; dieselben Dateibytes und relativen Unterordner beibehalten, keine small-/medium-/short-Varianten, alten Ergebnisse, Diagnosen oder Nutzerdateien aufnehmen. Bei Erstellung die tatsächliche Auswahl aus dem bestehenden Testbestand inventarisieren, mit Originalhashes prüfen und eine kurze Testanleitung sowie SHA-256-Prüfsumme mitgeben. | Auf Nutzerwunsch ins Backlog aufgenommen, noch nicht zusammengestellt. Eigenständige Testdatenbeilage, kein neuer App-Build oder Versionswechsel. |
| UX-PROCESSING-FLICKER-01 | Gemeinsame Windows-/Mac-Anzeige während automatischer Verarbeitung stabilisieren: unveränderte Bedienelemente erhalten, bei Datei-/Fortschrittswechseln nur geänderte Werte aktualisieren, Hintergrundabfragen ohne wiederholtes sichtbares Deaktivieren/Aktivieren von Statusbuttons und ohne unnötigen Neuaufbau leerer Warteansichten ausführen. Echte Zustandswechsel, Fehlermeldungen, Sperren bei tatsächlichen Befehlen, Fokus-/Screenreader-Verhalten und sämtliche technischen Schutz-/Statusprüfungen erhalten; keine erneuten Starts, Entscheidungen oder Exporte. | Auf Nutzerwunsch vorgemerkt, noch nicht umgesetzt. Nutzer beobachtet den Effekt auch ohne Klick während der Arbeit. Quellen-/VM-Gegenprüfung bestätigt Button-Neuaufbau bei Fortschritt/Dateiwechsel sowie Disabled/Enabled-Wechsel im Wartepoll; kein nachgewiesener kompletter Seitenreload oder Endlosklick, genaue Ursache des konkreten Desktopvorfalls noch offen. Vor Umsetzung/Abnahme unabhängiges Quellenreview und Browser-Gegenorakel mit unveränderten Wartestatusantworten, echten Fortschrittswechseln, DOM-/Fokus-/Navigationstrace und ausschließlich erwarteten Read-Aufrufen; Fehler-/Busy-/Befehlsperren regressionsprüfen. Desktopabnahme durch Nutzer; kein neuer Build während der laufenden Tests. |
| CI-DOC-RC165-01 | Bestätigter main-CI-Fehler39265247122: `FORMAL_UAT/README.md` bindet noch RC162 statt des veröffentlichten RC165-Commits. Dokumentbindung korrigieren und komplette CI wiederholen; keine vorhandenen Paketnachweise umschreiben. | Offen, separat vom OCR-Anzeigeauftrag; keine CI-Wiederholung gestartet. |

OCR-Delta-Nachweis: sieben neue Rendererfälle vor der Umsetzung erwartungsgemäß
rot (382 bestanden/7 fehlgeschlagen), danach kompletter Workspace389/389 grün.
Zusätzlich Frontend46/46, Reviewfrontend58/58, Workflowpräsentation47/47 und
Desktopvertrag37/37 grün mit gepinntem Node22.23.2; Canonical-Dokumentprüfung
bestanden. Unabhängiger KI-Frontend-/UX-/Windows-/Mac-Quellengegenreview ohne
bestätigten Deltablocker. Vollständige vorhandene Headless-Designmatrix plus neue
OCR-Prüfung mit echtem HTML/CSS/JS: Unterordner, Einklappen per Tastatur,
Abwahl/OCR-Schalter, Leeren/Neuauswahl, Axe und320/390/720/1280px-Reflow grün.
Screenshots für320 und1280px tatsächlich visuell geprüft; synthetische IPC,
keine native WebKit-/VoiceOver-/Desktopabnahme. Browserbelege unter
`dist/workflow-usability-design-vmXCVH`; kein Paket-/Release-/Versionswechsel.

## Neuester verbindlicher Abschluss – RC165,19.10.2026

Aktueller Standalone-Vereinfachungsauftrag implementiert und als
[RC165](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc165)
bereitgestellt: Appcommit `973274f17cda46bb66621d956af2cbc96e2272e3`,
Fingerprint `080ce0b2edeadc89e336a361a3e41a9649badf0ca163ec9cf3219e19c9690dfe`/332.
Gemeinsame Freigabe/Export, Defaultordnerbindung ohne unnötigen Picker,
konsistente Ordneraktion und Status-/Read-only-Snapshotkorrekturen abgeschlossen.
Keine bestätigten offenen Implementierungsblocker aus den begrenzten Endreviews.

Source06:280/280+10/10, Windows-Native/232Rust3ignored/Clippy/Release und fünf
Paketgates grün, Inputs unverändert; beide nativen Macjobs39256845033 erfolgreich.
Tatsächliche ARM-/Intel-Artefakte/Logs unabhängig gegengelesen und durch Main
bytegebunden geprüft. Defaultsequenz /2->/4 samt Erstexport ohnePicker auf beiden
Macs real bestanden. Alle18Releaseassets remote nachgelesen/gehasht, gleicher
Uploadbestand nach Publish, Tagcommit/PreRelease/nichtDraft bestätigt.
Windows-ZIP/Testplan/Testdaten lokal unter `Software DataSecure/RC165` übergeben.

Verbleibend: zehn manuelle Windowsfälle durch Nutzer, praktische Mac-/M2-/Finder-/
TCC-/Gatekeeper-/Enterprise-/VoiceOver-/macOS26-Zielhostnachweise. Keine agentische
Desktopabnahme oder vollständiger Writerjoin behauptet; keine neue Automation,
Developer ID/Notarisierung/Apple-Einreichung/Schutzabschaltung. Das gesamte
historische Produktbacklog wird dadurch nicht pauschal für erledigt erklärt.
Folgende Source02..05-/RC164-Arbeitsstände sind historische Entwicklungsbelege,
keine erneut offenen Endgates dieses erledigten Übergabeauftrags.

## Historischer Nutzerauftrag – gemeinsame Standalone-Vereinfachung nach RC164

19.10.2026, BL-010.53 / DS-082, DS-086, DS-110: neue Implementierung auf
`codex/standalone-export-usability`; veröffentlichter RC164-Tag und Pakete bleiben
unverändert. Keine neue Automation, keine Desktopbedienung/Appstarts durch
Agenten. Nutzer übernimmt Windows-Desktoptests, Kollege die Mac-Praxistests.

| Arbeitspaket | Ziel und unveränderte Grenze | Status |
|---|---|---|
| Gemeinsamer Freigabe-/Exportauftrag | Eine bewusste Exportbestätigung; interne technische Kandidatenprüfung, genaue Revision/Hash, eindeutiger Auftrag und ACK/Resume bleiben erhalten. Keine behauptete menschliche Lektüre. | implementiert, gezielt grün; Endgates offen |
| Vorhandenen Ergebnisordner nutzen | Gespeicherten Ort anzeigen und bei Bedarf nativ prüfen/einrichten; kein neuer Picker ohne nötige Entscheidung, keine erfundenen Identitäten oder Dateirechte, bestehende Aufträge nicht umleiten. | implementiert, native Windows-Vorabprobe/CAS grün; neue Endgates offen |
| Konsistenter Verlauf und verständliche Schritte | Ergebnisordner öffnen bei verfügbaren fertigen Ergebnissen zuerst/grün; weitere Aktionen konsistent und responsiv. Ergebnisvergleich bleibt zugänglich; keine doppelte Pflichtfreigabe. | implementiert, VM/Headless-Browser grün; Nutzer-Desktoptest offen |
| Kurzzeitig belegte Lesungen | Neutral warten/erneut lesen; ein bestätigter Submit wird nicht wegen einer nachfolgenden abgewiesenen Statuslesung als unbestätigte Mutation umgedeutet. | implementiert, gezielt grün und gegengelesen |
| Revalidierung und Regression | Unabhängige KI-Fachreviews tatsächlicher Quellen, kausale Negativfälle, JS-/Rust-/Paketprüfungen. Zielhostnachweise nicht simulieren. | Quellengegenreviews abgeschlossen; neue Gesamt-/Paket-/Macgates offen |

Detailvertrag und gezielter manueller Testplan samt je Aktivitäts-/Sequenzdiagramm:
[Exportvereinfachung](../acceptance/STANDALONE_EXPORT_USABILITY_20261019.md).
Keine neue Apple-Signierung, Notarisierung, Rechteerhöhung oder Schutzabschaltung.

Aktuelles Endgate: Source02/ca587b25 ist insgesamt rot trotz grüner Windows-
Native-/232Rust-/Paketgates. Kausale Testfixes für PID-Reuse und Unix-
Settings-Sicherungsordner implementiert und unabhängig gegengelesen, 59 gezielte
Integrityfälle grün. Noch erforderlich: echte Sidecar-Gegenprüfung, neuer
gemeinsamer Commit, komplette frische Gesamt-/Native-/Paketgates und beide
Mac-Consumer. Danach RC165 Windows lokal und neuer GitHub-Pre-Release für alle
drei Architekturen ausdrücklich beauftragt. Nutzer-Desktoptests bleiben offen;
keine Agenten-Appstarts. Details/rote Forensik im Exportvereinfachungsnachweis.

Neuere Fortsetzung: Source03-Gesamtlauf durch Nutzerneustart ohne FINAL beendet;
Mac-ARM neuer Export-Snapshotfehler. Read-only Reload auf nachgewiesen retired
Leaf erweitert, strikte Schreib-/Record-/Hashpfade unverändert; gezielt grün,
frische native POSIX- und Gesamtgates offen. Nutzerhinweis Defaultordner gezielt
nachgestellt: echte Erstellung/Servicevorbereitung/Node-Rust-Erstexport ohne
Picker, /2->/4 und neue Service-/Storeinstanz unter Windows bestanden.
Unabhängige finale Quellengegenreviews für Reload und Defaultsequenz abgeschlossen.
Aktuell offen: neuer gemeinsamer Commit,
frische 280+10/Windows-Native/Paketgates, beide Macs, lokale Übergabe und RC165-
Pre-Release. Windows-/Mac-Desktopabnahme bleibt Nutzeraufgabe, kein Zeitauftrag.

Neuestes Source04-Endgate: Windows-Native232Rust/3ignored und fünf Paketgates
PASS, Headless158/280 an UML-Absatzreihenfolge ROT; Dokumentreihenfolge danach
korrigiert,24/24 Manifestfälle PASS. MacARM echte drei Publisherphasen PASS,
danach weiterer echter Snapshotlesefehler. Innere historische IO-Phase offen;
begrenzter testseitiger ARM-Diagnoselauf39252050991 reproduzierte den Fehler
nicht und wurde nach Sourceverträgen beendet, kein Releasebeleg. Kontrollierte
vierte Publisherphase in39253339590 am unveränderten alten Produkt auf ARM ROT.
Fresh-Held-/Sticky-Failure-Korrektur produktiv übernommen, gezielte Gegenfälle
und frische gemeinsame Endgates folgen. Alle roten Belege bleiben; kein generisch
aufgeweichtes Fehler-/Retryorakel und keine native Desktopabnahme.

Source05/d480b8f: native vierte Publisherphase auf beidenMacarchitekturenPASS;
WindowsNative232Rust/3ignored und fünfPaketgatesPASS, Inputs unverändert.
Zwischenlauf wegen drei bestätigter alter UI-Pflichthinweise gezielt angehalten,
keine HEADLESS-FINAL, beideMacjobsCANCELLED. Drei Copytexte und lokalisierte
Quellen-/echte DOM-VM-Regressionsfälle korrigiert, keine technische Lockerung.
Neuer gemeinsamer Commit/freie Endgates/Windows-Übergabe/Macdownloads noch offen.

Auslöser: reale RC164-Mac26.2-ARM64-Protokolle belegen fehlende Exporteinrichtung
vor erfolgreicher Ordnerwahl und anschließendem Drei-Dateien-Export samt ACK.
Drei Read-Busy-Antworten sind Konkurrenzzustände, kein belegter Coreabsturz.
Die konkrete alte Konfigurationsversion und der Sperrhalter sind nicht belegt.
Die unveränderte Ergebnis-Unterordnerstruktur ist vom Nutzer ausdrücklich
akzeptiert und wird nicht umgebaut. Die technische Prüfung ist keine Garantie
vollständiger Anonymität. Rückwärtskompatible RC164-Belege bleiben lesbar.

## RC164-Übergabe abgeschlossen, Zielhosttests verbleiben

19.10.2026: [RC164 veröffentlicht](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc164),
gemeinsamer Appcommit `95f30181fdaf2494b0ff53c4cd2e7b97bf834990`, Produktfingerprint
`cbd2175dc131e4edf63247a52dea8b9b4b2aae7355daf9388745312fa5f28b2d`/332.
Final11-Gesamtlauf 279/279+10/10, Windows Native/Clippy/229 Rusttests
(3 ignoriert)/Release, fünf Paketgates und beide nativen Mac-Consumer grün.
Unabhängige reale ARM-/Intel-Paket-/Logreviews abgeschlossen. 18 Releaseassets
remote heruntergeladen/gehasht, Tag/Appcommit und Pre-Release/Nicht-Draft geprüft.
Windows-ZIP mit Testplan und synthetischen Daten lokal bereitgestellt.
Kein bestätigter neuer Implementierungsblocker aus diesen begrenzten Endreviews.

Offen: zehn manuelle Windows-Abschlusstests durch den Nutzer und tatsächliche
Mac-/M2-/Finder-/TCC-/Enterprise-/VoiceOver-/macOS26-Zielhostnachweise. Kein
erfundener GUI-PASS, keine Behauptung vollständiger Fehlerfreiheit oder
Produktionsfreigabe. Keine weitere Agenten-Desktopbedienung/Appstarts. Geplanter
Nachtauftrag auf Nutzerwunsch zum Löschen aufgerufen; App meldet bereits nicht
vorhanden. Kein neuer Zeitauftrag. Diese Übergabe schließt nicht das gesamte
historische Produktbacklog. Nachfolgende Nachtstände sind historische Belege,
keine neue kumulative Fixliste. Nachweise/Prüfsummen: [Releasevertrag](../RELEASE.md).
Reine Dokumentation nach dem unveränderten veröffentlichten Appcommit.

## Aktuelle Nacht-Fortsetzung (ersetzt ältere Freigabeangaben)

19.10.2026, nach 08:29 UTC: **Final10 ist nicht freigabefähig; Final11 folgt.**
Alle lokalen Jobs endeten mit unveränderten Inputs. Native/Clippy/229 Rusttests
(3 ignoriert) und fünf Paketgates bestanden. Die Gesamtprüfung stoppte nach
49/279 Dateien im Aufbau eines Owner-/Purpose-Negativfixtures (Rename EPERM),
nicht im Produktleser. Der konkrete historische Sperrhandle bleibt unbelegt.
Der reine Testfix beschädigt den unveränderlichen Owner vor Lesebeginn
kontrolliert ohne Namespacewechsel; echte Windows-NoDeleteSharing-Gegenprobe
reproduziert altes EPERM und bestätigt die unveränderte Purpose-Verweigerung.
22/22 Snapshotfälle durch Main erneut bestanden, keine Produktlockerung.

Beide Mac-Jobs39220556406 scheiterten separat an einer veralteten Env-Regex
in test-native-smoke-integrity.js:1212. Die reale Launcher-Closure wird jetzt
mit exakt geprüftem Spawn-DTO, beiden Preloads, aktuellem PIN/HOST/Historyscope,
zwei Generationen und acht RAM-Negativen ausgeführt. Drain/Close-Orakel bleiben.
53/53 durch Main und unabhängigen Gegenreview bestanden; kein nativer Mac-PASS.

Der tatsächliche Windows-Deltatest am gebundenen b142efba-ZIP bestand:
geführter Lauf98d41c19 mit zwei manuell verglichenen/freigegebenen Ergebnissen,
genau ein Export624847dfe3a7580074fc95a0b293358d mit exakt zwei neutralen MD
(576/989 Bytes), danach direkt Zum Verlauf: 2/2 freigegeben, Export mit
Abschlussbeleg, keine zweite Exportpflicht. 14/14 Originale bytegleich.
GUI-PREAPPROVAL liegt bei Final10; keine vollständige Zehnfall-Abnahme.
App normal geschlossen, isoliertes Profil und sämtliche Belege erhalten.

Final11 erfordert neuen gemeinsamen Appcommit, frische 279+10 Gesamt-/Native-/
Paketgates, beide Mac-Consumer und vollständige Windows-GUI an neuen Bytes.
Produktfingerprint bleibt cbd2175dc131e4edf63247a52dea8b9b4b2aae7355daf9388745312fa5f28b2d/332;
nur zwei Testdateien geändert. Keine alten FINALs/Pakete umetikettieren.
Kein Release, lokaler finaler Übergabeordner oder M2-/Finder-/TCC-PASS bisher.

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

Neu19.10.nach05:46UTC: final7 lokal276+10/Native229/Paket5 unverändertgrün;
beideMacconsumerROT nach nativen Start-/Konvertierungsgates an altem UIhint.
Tests jetzt auf tatsächliche exakte Ergebnisaktionen umgestellt, Negativfall
ohne A→B-Substitution und Rootwechsel erhalten/verschärft; separater OCR-Skip-
Helfer wartet auf tatsächliche Publikation nur in alterDeadline. Main15/42/16
gezielte Fälle grün, Quellenreview ohne Smoke-Restblocker. OCR-Helfer-Gegenreview
ohne Implementierungsblocker, dessen Testlücke mit verspäteter Erfolgsantwort
geschlossen; Main nun43Integritätsfälle grün. Windows05echtePause/
zweiNeustarts aufc320PASS;kein GesamtGUI. Offen: neuer gemeinsamer Final8Commit,
frische Gesamt-/Native-/Paket-/
beideMac-/10GUI-Gates und lokale/Remoteübergabe. Keine neue Coreproduktion.

Neu19.10.nach05:18UTC: ClippyallTargets/-Dwarnings+17Bundleparallel nachFix
PASS; unabhängiger Rust-/Suite-/Workflow-Deltareview ohneRestblocker. final7
vorbereitet FP eaa4a829…/332,31Helpergegenfälle grün; frischer gemeinsamer
Commit und276+10/Native/Paket/beideMac/10GUI/Releasegates noch auszuführen.
Keine Schutzabsenkung oder neue Coreproduktion, keine Gleichsetzung alter
GUI-/Headless-/nativeMac-Nachweise mit künftigen Bytes.

Neu19.10.nach05:15UTC: final6/b92 wegenClippymanual_flatten TestsyntaxROT.
EigeneFreezejobs kontrolliert/gezieltbeendet, beideMacjobs39203576757cancelled,
lokalerHeadless99722Exit1ohneFINAL/PASS, keinPaket. Inputs bisEndeunverändert.
NachEnde Testschleifeextend/flatten, Orakelunverändert. ErstClippyallTargets+
17Bundlegegenfälle wiederholen, dann neuerfinal7Commit/volleGates. Native-
Legacy-Kompatibilität bleibt noch mit echten ARM/Intel-Smokes zu bestätigen.

Neu19.10.nach05:14UTC: beide gezielten Deltas implementiert/gegengelesen;
unabhängiger Runtimequellenreview ohne bestätigten Restbefund. Main17Rust/
11Routing/19Parser/9Worker/Workflow/16Pfadfälle grün. NeueSuite explizit im
276er-Plan und Macstep. Jetzt gemeinsamer final6Commit/Fingerprintb7dd9654…,
neue unveränderte Headless/Native/Paket-/beideMac-Gates und10echteGUI-Fälle.
Beide Mac-Cores bereitsapproved, nicht neu produzieren. Windows-Vorab05auf
c298 nun5min/zweiRestart/ungespeichertweg/gespeichertbleibtPASS, keinealte
GUI-Gleichsetzung mit neuenBytes. Release/Remote-/lokaleÜbergabe weiter offen.

Neu19.10.nach05:02UTC: final5/c29878e Headless275+10, Native228 und Paket5
vollständig unverändert PASS; beide Macconsumer39200265925 dennoch ROT.
Zuerst echte Legacy-Mac-Aufrufe im Bundle über verifizierten offiziellen
Konverter+zwingenden Supervisor delegieren; Coreparser weiter verweigern,
keine Journal-/Protokoll-/Bestätigungsänderung. Unveränderte Vierformat- und
Altjournal-Resumeorakel nativ verlangen. Zweitens Test-only Rustrootallocator
gegen gleiche parallele Clockwerte mit Atomic-Sequenz/Gegenprobe korrigieren.
Danach Quellengegenreviews/neuer geteilter Commit und alle frischen finalen
Gates/Pakete/GUI/Remoteübergabe. Windows05Pause+Vertagen+ersterRestart aktuell
korrekt, kein Gesamt-GUI-PASS. Coreproducer bereits beide approved.

Neu19.10.nach04:33UTC: final4ROT69(68vorherPASS/unverändert), beideMacjobs
ROTgleicheobsoleteAssertion. Native/Paket5PASS und tatsächlicherWindowsstart/
Workspace/ReviewIPC1539.567ms/Exit0. Zwei Testverträge nach Jobende korrigiert,
neue Historytests nun ausdrücklich in Macconsumer; gezielte37/39/Workflows/
16Pfade grün. Quellen-Deltareview abgeschlossen, dann frischer geteilter
Commit/275+10/Native/Paket/Mac/10GUI/Release. Kein Produkt-/Schutz-/Coreumbau,
keine Neuinterpretation alter grüner oder roter Belege. Neuer Fingerprint
e6401825… wegen des bewusst mitgebundenen Workflows.

Neu19.10.nach04:15UTC: zusätzlicher Store- und nativer Harnessgegenreview
abgeschlossen, keine bestätigten Restbefunde dort. Gezielte Revalidierung
Index21PASS/22(1Windows-NOT_RUN), Migration21/21/Probe/echteIPC/Native39/39/
Workflow/Pfade grün. Handoffbelege jetzt strenge Rollen+vollständige Schritte,
aktuelle Testbytes und tatsächliche ZIP-EXE;31 synthetische Gegenfälle grün,
deren unabhängiger Abschlussreview ohne Restbefund abgeschlossen. Dann gemeinsamer final4-
Gitfreeze/275+10/Native/Paket/Mac/GUIfälle01..10/Release. Ältere Belege bleiben
historisch, keine Freigabe aus Modellen oder älteren Paketbytes.

Neu19.10.nach03:45UTC: zwei bestätigte Historyraces implementiert und gezielt
gegengelesen/geprüft: Index21PASS/22 mit Windows-POSIX-NOT_RUN, Migration21/21,
gebundene Parent-/Snapshot-/Arbeitsbudgets/Locatorwrites. Test-only-Fehlerprobe
nach Quellengegenreview korrigiert, echte IPC grün. Noch offen zusätzlicher
unabhängiger Storegegenreview und Abschluss der korrigierten nativen Reader.
Intelconsumer hatte deterministischen Harness-Basislognamenfehler; vorhandene
echte Startfehler sind dadurch nicht ausgeschlossen. Reader-Gegenfälle müssen
neueste Session/Owner, tatsächliche erfolgreiche IPC und harte IO-Budgets
belegen, Diagnose vor Cleanup erhalten. Erst danach neuer gemeinsamer final4-
Commit/Freeze und frische275+10/Native-/Paket-/Mac-/GUI-/lokale/Remoteübergabe.
final3 davor vollständig272+10/Native/Paket grün/unverändert, nicht umetikettieren.

Neu19.10.nach03:30UTC: bestätigten Produktionsrace recent.json nach laufendem
af55717-Freeze beheben: höchstens3 vollständige Reads nur BOUND_FILE_CHANGED,
identische ursprüngliche Directorybindung, keine UNSAFE/CLOSE/Schema-Retries,
keine Scans/Reparatur. Tatsächlicher Zweiprozessbeweis liegt in dist vor;
unabhängige kausale Gegenfälle/Quellenreview laufen. ARMconsumer39193987747
echter Verlauf-IPC ROT, konkrete Ursache nicht aus öffentlichem Code ableitbar;
zusätzliche inhaltsfreie Fehlergrenzdiagnose für nächsten Lauf erforderlich.
Windows-Native/Paket dieses Schnitts grün, Headless aktiv. Neue GUI nurFall01
PASS,9NOT_RUN, App/Core normal beendet. Neuer gemeinsamer Produktfreeze und
frische vollständige Windows-/Mac-/Paket-/GUI-/Releasegates danach offen.

Neu19.10.nach03:13UTC: zwei bestätigte Darwin-Testvertragsfehler korrigiert,
kein Produkt-/Schutzumbau. Runtime-vor-Lese/Schreib-IO wird hostunabhängig
geprüft; nur obsolete positive Addonfixture getrennt, vollständige Quell-
Workflows bleiben. Zwei tatsächliche Quellengegenreviews ohne Blocker,
78/78+sechsModelle/Source-Sidecar/16Pfade/Canonicaldocs grün. b772 davor lokal
272/272+10/10/Native/Paket unverändert grün, Macconsumer dennoch ROT bewahren.
Offen: neuer gemeinsamer Gitfreeze, frische Macconsumer-/Windows-/Paket-/GUI-
Gates, konkrete Übergabe/Release. Native Configure-/ConflictfixtureMacNOT_RUN
nicht als durch andere Sealed-App-Gates vollständig ersetzt ausgeben.

Neu19.10.02:50UTC: b772-Consumer39191630620 ARM ROT, vier IO-order-Mockfälle
ohne Darwins assertNativeOwnershipRuntime. Testdouble nach laufendem Freeze
vollständig modellieren, Runtime-vor-IO und echte Refusal-Gegenfälle ergänzen;
Hauptagent/Quellengegenreview bestätigen Ursache. Kein Produktionsbypass.
Native228/Clippy/Release und fünf Windowspaketgates grün, Headless läuft noch.
Neuer gemeinsamer Freeze/Consumer/finale GUI und Übergabe bleiben erforderlich.

Neu19.10.nach02:42UTC: bestätigten Clone-Testressourcenfehler korrigiert:
historische ignored JSON2731Bytes bytegleich nach tracked tests/lib,
require geändert und Pfadschutz auch für JSONmodule/Tracking samt Gegenfall.
16/16+50/50 gezielt grün, Quellengegenreview ohne weiteren belegten Fehler
abgeschlossen. d094 blieb lokal272/272+10/10
und Native228 grün, echte Macconsumer waren dennoch ROT; nicht umdeuten.
Nächster gemeinsamer Git-/Testfreeze, neue Consumer-/Windows-/Paket-/GUI-Gates
und tatsächliche lokale/Remoteübergabe weiter offen. Coreapproval bleibt gültig.

Neu19.10.nach02:06UTC: Intelproducer ebenfalls erfolgreich; Main und zwei
unabhängige tatsächliche Artefakt-/Sourcegegenreviews ohne Aufnahmeblocker.
Beide konkreten kanonischen FINAL-Metadatenhashes freigegeben. Offen jetzt
gemeinsamer Appfreeze, native Macconsumer, neue unveränderte Windows-
Gesamt-/Rust-/Paketgates, exakte GUI-Abnahme, lokale Übergabe und Pre-Release.

Neu19.10.01:13UTC: tatsächlicher ARM-Core importiert und anhand echter Compiler-/
finaler Link-/Sealmetadaten-/ACL-Belege überprüft. Beide unabhängigen Reviews:
geeigneter Consumerkandidat, kein Aufnahmeblocker. Intelproducer
weiter aktiv. Policyapproval beider Targets, gemeinsamer finaler Appfreeze,
native Consumer, finale Windows-/Mac-Pakete/GUI und Release bleiben offen.

Neu19.10.00:57UTC: Checkpoint06/187e160/1730ad82… vollständig272/272+10/10,
Native228/3ignoriert/Clippy/Release und fünf Paketgates unverändert bestanden.
Neues Windows-ZIPa55ebade… bleibt ungeprüfter GUI-Zwischenkandidat, kein Release.
Kompaktes10-Fall-Testdatenpaket4a8e352f… samt14 Goldeninputs, Plan und leeren
Output-/Belegordnern erstellt/Windows-entpackt/Hash-geprüft; keine Nutzerdaten.
Offen weiterhin tatsächliche Mac-Coreartefakte/Approval, gemeinsamer finaler
Quellstand, native Consumer, neu gebundene finale Windows-/Mac-Pakete/GUI,
lokale Windowsübergabe und Pre-Release/Prüfsummen/Remoteprüfung.

Neu19.10.nachCheckpoint05: Beobachtete Singular-Copy erledigt, enges echtes
Quellengegenreview ohne Befund und359/54 gezielte Frontendtests grün. Neuer
unveränderter Checkpoint06 nötig; finaler gemeinsamer Core-/App-/Paket-/
Windows-GUI-/Uploadabschluss bleibt offen, native Macproducer laufen weiter.

Neu19.10.00:28UTC: Gesamtcheckpoint05/25702dd5/393899c4… und Native/Paketgates
unverändert grün. Zusätzlich echte Windows-Deltaorakel02/04/Export/Abbruch
am neuen gebundenen ZIP bestanden; Live-Region unabhängig gegengelesen.
14/14 Originals bytegleich, eigene GUI/Core normal beendet. Nur beobachtete
Singular-Copy noch eng nachbessern; gemeinsame Coreapproval/finaler Appfreeze,
Macconsumer, finale gemeinsame Pakete/GUI und Upload/Readback weiterhin offen.

Neu18.10.23:57UTC: Live-Region-Folgekorrektur samt357 gezielten Gegenfällen
grün, Produktionsdiff direkt gegengelesen. Vor finaler Freigabe weiteres
unabhängiges Gegenlesen (bisherige zusätzliche Agenten wegen Kapazität nicht
verfügbar), unveränderter Gesamtfreeze und neues natives Paket/GUI nötig.

Neu23:50UTC: Gesamtcheckpoint04/8da562e272/272+10/10 unverändert bestanden.
Zusätzliche reale Windows-GUI-Orakel07/09/10 und08-Delta bestätigt, Inputs14/14
unverändert, nur eigene reversible Fehlordnerprobe wiederhergestellt. Kein
Finalrelease aus alten EXE ableiten. Neuer Quellenfix in Arbeit: falsche
Screenreader-Wiederankündigung behaltenen alten Abschlusses nach Snapshotverlust;
aktuelle echte Hintergrund-Fertigmeldung und Warnungen müssen erhalten bleiben.
Finale Quellen-/Pakete-/Mac-Core-/Uploadgates weiterhin offen.

Neu23:18UTC: Shortroot-Fix7b13d349 samt echtem nativen Start bestätigt.
GUI02/03/06 und vorheriger05-Neustartgegenfall vorab geprüft, kein Final-PASS.
Headless-Checkpoint03 nach207/272 ROT, alte Ursache nicht behaupten; neue
kausale Replay-Testorakel (8 Fälle, zwei unabhängige Testgegenfixes) und
zweckrichtige OCR-Speichermeldung (52 Frontendfälle) gezielt grün. Neuer
unveränderter Gesamtquellenlauf vor Freigabe nötig; alte Belege erhalten.

Bestehender Thread-Heartbeat erneut ACTIVE, alle30min; Windows-Desktopabnahme
durch Hauptagent ausdrücklich erlaubt, nur gebundener Kandidat/synthetische
Daten, keine Schutz-/Rechteänderungen. Alte PAUSED-/Desktopverbote unten sind
historisch. Maßgeblich: RC164_NIGHT_REVIEW_AND_RELEASE_PLAN_20261018.md.

- Quellenfixes: retirierte Wurzeln ohne Altziel-I/O; Rust-Mac-ACL-Parent;
  Diagnose-Observer ohne blockierendes wait; zugängliche Lauf-/Aktionsnamen;
  feste konkrete Diagnose für aktiv verweigertes Ergebnisziel statt Core-Crash.
- C-ACL-Bitmasken-P1 in7d0ee31 korrigiert und unabhängig gegengelesen. Producer
  39167676290 läuft ARM/Intel, realer finaler ACL-Test verpflichtend. Nicht den
  gezielt abgebrochenen e6f4-Producer39165027153 verwenden.
- Neuer P2-Quellenfix/Gegenreview: Prozessbeobachtung bis exit schützt vor
  Ordnerwechsel zwischen Verarbeitungslease-Ende und Export. Native Provisionierung
  erst nach Busyprüfung, Interaktionssperre über Await, danach erneut prüfen.
- Noch offen: beide tatsächlichen Coreartefakte prüfen/freigeben, finalen
  gemeinsamen Windows-/Mac-Quellstand einfrieren, unveränderte Gesamtregression,
  native Consumer-/ZIP-/DMG-Gates, Windowspaket und echte GUI, lokales Windows-ZIP,
  Pre-Release samt Testdaten/Prüfsummen und Remote-Readback. Echter M2/Finder/TCC
  später; CI/Modelle sind keine Anwenderabnahme.
- Aktive gesperrte Ziele werden nicht unsicher übersprungen. Ein settings-only
  Ersatzordner-Modus wäre ein separater Architekturumbau und ist nicht als
  erledigter Startfix auszugeben. Ausführliche Gründe/Aliasgegenfälle im Nachtplan.
- Neuer GUI-Quellenbefund: isolierter Rust-Smokestart und separater Review-
  Campaign-Launcher akzeptieren alten Windows-ZIP-Root, nicht neuen DataSecure-
  Shortroot. Engen Windows-only-Fix samt Negativfällen gegenlesen, neu bauen und
  echten Shortrootstart wiederholen. Voller Checkpoint2e12c0f272/272+10/10,
  Native228 und Paketgates sind unverändert bestanden, widerlegen diesen Befund
  nicht. Echte GUI-Teilnachweise/ausstehende Fälle im aktuellen Nachtplan.

## RC164 – gemeinsame native Paketierung

Aktueller Auftrag und Gates: docs/acceptance/RC164_SHARED_RELEASE_20261018.md.
Beide nativen Mac-Runner ausdrücklich kostenbestätigt. R8-Funktionsstand wird
nicht zurückgesetzt; neue Versionsnummer für alle drei Targets. Bestätigte
Mac-Lücke (kein freigegebener statischer Core/keine Producerübergabe) wird vor
Veröffentlichung geschlossen. Native Artefakte, Approval, finaler gemeinsamer
Quellcommit, neue Windows-/Mac-Pakete und Uploadreadback noch offen.
Keine Desktopsteuerung; realer M2-Anwendertest später. Alte Archive erhalten.

Rechte-/Restriktionsgegenreview lokal implementiert: sichere Prozessidentität
mit festen Ursachen statt pauschalem Startfehler, frühe Rootfehlerklasse,
Rust-Denied-Erhaltung ohne Core-Fallback, ausschließlich In-App-Intakefehler
mit versuchsgebundener sichtbarer Karte sowie sichere neue native Auswahl
erst nach explizit bestätigter Worker-Inaktivität. Unabhängige Quellenreviews
und Gegenfix enthalten;21/21 unveränderte gezielte Folgegates, Windows-Rust216
bestanden/3 regulär ignoriert sowie Release-Clippy im RC164-Bericht gebunden.
Keine Admin-/Sicherheitslockerung, keine ursprüngliche M2-Ursache
behauptet. Spätere echte Mac-Abnahme enthält frisches Profil, TCC-Zustimmung/
Ablehnung, alte gesperrte Ziele, Finder/ZIP/DMG, Unternehmensrichtlinien und
Hilfsprozesszuordnung. Diese Gates bleiben neben Producer/Consumer/Release offen.

## R8 – echtes Fünferfenster implementiert; gebundene Baseline bestanden

Nutzerwunsch nur fünf neueste Läufe: Register/normaler Verlauf/Capture auf fünf
IDs vor Detaillesungen begrenzt; keine Altdateilöschung oder sechstes Nachrücken.
Einmalige begrenzte Suchmetadatenmigration, Legacy-Locator, echte/Alias-Deduplikation,
exakte Detail-ID durch Rust/privateIPC/Service, gemeinsame Exportgruppenbindung.
Registerausfall von verpflichtender Summary-/Recovery-/Ledgerpflege getrennt.
Quellena08125d2… (328 Inputs); Quellengegenreviews und gezielte Gates grün. Vollsuite266/266
plus10/10 Zusatzgates und vier Paketgates bestanden; R8-ZIP als unveröffentlichte
Engineeringbaseline gebunden. Native Prepare/Clippy/211Rusttests
(3 ignoriert)/Release mit unveränderten Inputs bestanden. R7 bleibt unverändert.
Belege: dist/rc163-r8-history-final3-20261018 und
docs/acceptance/RC163_R8_HISTORY_WINDOW_20261018.md. M2 und Windows-Anwenderabnahme
bleiben offen. Vollständige Crash-Recovery/Retention bewusst nicht auf fünf
als vermeintliche Integritätsautorität beschränkt; reale Kaltstartmessung später.

## R7 – lokal umgesetzt und gebunden zum Anwender-Test bereit

Quellen4dda62d7… (327 Inputs): redundante Start-Journalaufnahme,
Statushinweise mit frischen Bytes/Bindings, Ablauf-Erhaltung vor allen drei
Entfernungspfaden, idempotenter Capture ohne Neuschreiben, aufrufgebundener
Kontext und lazy gepinnter Controlgate-Pfad umgesetzt. Standalone-Retention
scannt Journalschutz erst bei echten Markdown-Bereinigungskandidaten; Plugin-
Standard bleibt unverändert. Windows-Innenroot DataSecure, versionierte Archive
bleiben; alter Corpus benutzt jetzt ausdrücklich gebundene Ergebnisauflösung.
Gegenreviews und gezielte Fehler-/Manipulationsgegenproben abgeschlossen.
Unveränderte Vollsuite265/265+10/10, Windows-Prepare/Clippy/211 Rusttests/Release
(3 ignoriert) und vier Paketgates bestanden. Quellen4dda62d7…/ZIPf4326166…;
536 Test-/Scriptinputs mit Manifest3becc4ea… unverändert. Gebundene FINAL-Dateien,
Quelloverlay und lokale Übergabeevidenz unter dist/rc163-r7-startup-final2-20261018.
Details: docs/acceptance/RC163_R7_STARTUP_REVIEW_20261018.md.
Native Windows-Anwenderabnahme und Darwin-/M2-Gates bleiben anschließend offen;
kein Quellenmodell ersetzt sie. Kein Push/Release, kein Desktopzugriff.
Kein neuer bestätigter Quellenblocker im begrenzten R7-Abschlussreview.
Weiter bestehende Mess-/Architekturgrenze: vollständige Kaltstart-Recovery alter
Läufe bleibt proportional zum Bestand;320 synthetische gestoppte Läufe benötigen
im instrumentierten Modell39s. Reale Messung beim Nutzer, native Mac-Core-
Artefaktapproval sowie erneutes OS-Paketbinding nach Macapproval bleiben Zielhostgates.

## Neue Anwenderbefunde nach dem R6-Freeze

Aktiver Folgeplan: docs/acceptance/RC163_R6_UAT_FOLLOWUP_20261018.md.
Reviewfläche, Dokumentabschluss/Navigation, Statusreihenfolge, konsumierter
Dateibaum, dauerhafte Verlaufsausblendung mit frühem Backendfilter und degradierte
Listenanzeige bei verlorener Exportmetadaten-Beweisbarkeit sind lokal umgesetzt.
Produktstand8c5e535b…: elf gezielte Node-Dateien, zwei Headless-Browsergates,
Windows-Clippy/211 Rusttests bestanden (3 ignoriert). Summary-Rennen bei der
Ordnerwahl und erfundene offene Aufgaben bei unbekannter Exportverfügbarkeit
korrigiert und erneut unabhängig am Quellcode gegengeprüft. Keine Nutzerdaten
gelöscht, alte R6-Pakete unverändert. Neue Vollsuite/Paketbinding und kürzeres
Explorer-Paketlayout noch offen; Export-only-Legacy-Ausblendung nicht unterstützt.
Vollständiger Verzicht auf historische Sicherheitsreads beim Start ist **nicht**
durch eine Anzeigepräferenz nachgewiesen: terminaler Checkpoint/Recovery-
Trennung, reale Zugriffsmessung und native Windows-/Mac-Gates bleiben gesondert.

## Aktueller R6-Abschluss – lokaler Windowskandidat

Quellen244d86f4…/ZIPf56963aa…: Vollsuite262/262+9/9, unveränderte325 Produkt-
und532 Test-/Scriptinputs, Windows-Prepare/Clippy/211 Rusttests/Release sowie
alle vier Paketgates einschließlich Corpus100/100 bestanden. Maßgebliche
FINAL-Dateien unter dist/rc163-r6-workflow-final5-20261018. Reale Tauri-
Desktopabnahme ist noch nicht erfolgt; Corpus und Schnellwegexport nutzen
ausdrücklich den Quell-/Legacyadapter, keine native GUIbehauptung.

| Noch offen | Art / nächster Schritt |
| --- | --- |
| Windows-Anwenderabnahme am R6-Paket | Nutzer testet selbst; normale Bedienung, Vertagen/Neustart, Exportabschluss, neue Reiter und Ordnerübergabe prüfen |
| Native Mac-Core-Artefaktapproval und Zielhostgates | Echtes Darwinbuild und Worker-/APFS-/Finder-/ZIP-/DMG-/M2-Verhalten später, nicht von Windowsmodellen ableiten |
| Quellen-/Paketbinding nach Macapproval | Featurebaseline im Quellsnapshot sichern; neue Approval verändert Identity, danach beide Pakete erneut daran binden |

R6-Prozess-/Navigations-, Exportbegriff-, Diagnose-, Observer-/Worker-finally-
und Read-BUSY-Korrekturen umgesetzt und gezielt unabhängig gegengeprüft.
Mac-Producer-P3-Quellumsetzung ebenfalls angewandt; native Darwin-Tools offen.
Timer PAUSED, keine Desktopbedienung, kein Push/Release, keine Bestandsrechte-
oder Schutzrichtlinienänderung. Alte Belege und Pakete bleiben eingefroren.

## Historische R6-Paketgegenbefunde

100-Dateien-Gate des ZIP e16dfe2d… nach5/100 mit
BATCH_LOCAL_DELIVERY_PROGRESS_FAILED/INTERNAL_FAILURE fehlgeschlagen.
Paket nicht zur Abnahme empfehlen, rote Evidenz und Fixture erhalten.
Aktuell umzusetzen/gegenzuprüfen: rein beobachtender Pausestatus unter exakt
dem dataRoot-Guard statt zusätzlicher logischer Lockpublikation;
ursprüngliche feste OS-/Ownershipfehlercodes erhalten, keine Sicherheitsprüfung
auslassen, keine Wiederholung schon committed Delivery-Aktionen. Danach neuer
unveränderter Gesamt-/Paketnachweis unter neuem Namen. Native Windows-/spätere
Mac-Gates bleiben getrennt; der Corpus ist ein expliziter Legacy-/Quelladapter.

Zwischenpaket5469b68e…/Quellen90f8584b… besteht inzwischen Corpus100/100 und
die anderen drei Paketgates sowie nativen Windowsbuild. Es wird trotzdem
nicht endgültig übergeben: zusätzliche bestätigte BUSY-/Worker-finally-/
Read-Polling-Gegenfälle sind zu korrigieren und danach neu einzufrieren.
Die zusätzlichen Korrekturen sind als Quellenstand244d86f4… implementiert:
begrenzte rein beobachtende Guardaufnahme, initialer Runner-Progress im
Lease-finally, genaue Read-BUSY-Behandlung ohne Verbindungsfehler/Ready-Autorität.
Alle acht gezielten Schnittdateien unverändert bestanden. Neuer Gesamtstand
unter final5 inzwischen unverändert bestanden, siehe aktuellen Abschluss oben.
Rote Vollbelege final3(31/262) und final4(68/262) wurden wegen dieser neuen
Befunde bewusst am exakten eigenen Blatttest gestoppt, nicht wegen eines
bewiesenen Produktfehlers der jeweils zuletzt genannten Testdatei.

## Neuer ausdrücklicher R6-Auftrag vom 18.10.

Timer PAUSED und keine Desktopbedienung bleiben verbindlich. Der Nutzer hat
anschließend die lokale Prozess-/Navigationsentwicklung ausdrücklich erneut
beauftragt. Maßgeblicher Plan: docs/acceptance/RC163_R6_WORKFLOW_REVIEW_20261018.md.

| Aufgabe | Aktueller Stand | Noch offen |
| --- | --- | --- |
| Elf Hauptfunktionen mit Aktivitäts-/Sequenzdiagramm | 22 Diagramme, Klick-/Parameter-/Zielansichtenmatrix; fünf Diagrammvereinfachungen gegen Produktionscode korrigiert | Native Anwenderabnahme; Diagramme sind kein Ausführungsbeweis |
| Laufdetails statt Verlauf-Prüfseitenalias | Implementiert; Dirty-/Busy-/Epoch-/Close-/Fokusgegenproben einschließlich unabhängiger RAM-Gegenfälle | Neuer Paket-/Zielhosttest |
| Kompakte Karten, direkte Ergebnisse/Hinweise | Umgesetzt; vertrauliche Zuordnungen optional gruppiert; Nachfolgestart und verzögerte Detailanzeige korrigiert und unabhängig erneut geprüft | Nutzerbedienung am neuen Kandidaten |
| Exportabschluss/Diagnose | Exakter ACK führt zur Übersicht derselben Lauf-ID; Diagnose über Settings/offline Fehlerhilfe, kein Erfolgspflichtschritt; Export statt „KI-Kopie“ | Native OS-Ordnerübergabe am gebundenen Kandidaten |
| Höheres Ready / Belegordner öffnen | Alte zeilenbezogene Snapshotbehauptungen retire; neuer exakt gebundener Beleg-Öffnungsbefehl ohne neue Dokumentautorität | Native Ausführung / echter Mac später |
| Companion-IPC-Gesamttestabbruch | R5-Volltest ist rot beendet 225/262, 0/8 Zusatzgates; veraltete Testassertion präzisiert; unabhängig 29/29 | Neuer stabiler Gesamtnachweis nach R6-Quellfreeze |
| Mac-Producer-P3 | Async-Toollifecycle, fünf vorher synchrone Launchstellen begrenzt, finale Abortprüfung; Producer125/Consumer105 und unabhängige Gegenmodelle grün | Echte Darwin-Tools, ARM64/x64-Core-/Worker-/APFS-/ZIP-/DMG-/Finder-/M2-Gates |

Alte R5-Binärpakete ändern sich dadurch nicht. Historische rote Evidenzen
bleiben erhalten. Kein Windows-PASS als native Mac-Abnahme darstellen.
Neuer Quellfreeze6b4cda01…: Erster R6-Lauf korrekt rot58/262 an einer
Kommentar-als-Code-Assertion; gleicher Mutationsbann nach engem Testfix und
unabhängigen 18 negativen Gegenproben erhalten. Neuer voller Lauf262+9 und
nativer Windowsbuild unter dist/rc163-r6-workflow-final2-20261018 bestanden:
262/262 Dateien, 9/9 Zusatzgates und Prepare/Clippy/211 Rusttests/Release;
Produkt- und Testinputs unverändert. Eigenes R6-Windows-ZIP mit vier getrennten
Paketgates wird gerade erstellt. Gezielte UI-/Darstellungs-/Dokumentationstests grün.

## Maßgeblicher Status ab 09:25 UTC, 18.10.

Nutzerübergabe: Timerauftrag ausdrücklich beendet/PAUSED. Keine automatische
Fortsetzung oder Desktopbedienung; Nutzerabnahme nun manuell. Laufende eigene
Vollsuite nicht als abgeschlossen darstellen. Mac-Producer-P3 bleibt bis zu
einer gesonderten vollständigen Umsetzung/Gegenprüfung offen und unangewandt.

| Thema | Tatsächlicher Nachweis | Noch offen |
| --- | --- | --- |
| Fast/OCR-Erstbereitstellung | Neuer 30b4f6a9-Windows-Kandidat: frische Explorerbedienung, 3/3 sichtbar, Plan vollständig, kein Claimrest | Unveränderten 262+8-Gesamtlauf beenden |
| Geführter Lauf/Dateinamen/Freigabe | Frische Explorerbedienung: 2/3 Ergebnisse bei OCR aus, Originalnamen mit Suffix, beide Vergleiche, einmal 2/2 freigegeben, Status frisch | Nutzer prüft Vertagen/Neustart selbst |
| KI-Kopie/Verlauf | Fastvorschau abgebrochen ohne Kopie, dann genau eine bestätigte bytegleiche 3-Dateien-Kopie; Verlauf vollständig | Kein wiederholter Export erforderlich |
| Vollstand/Windows-Paket | Vier Paketgates und erneute native 210-Rust-/Clippy-/Releasefolge bestanden, Sourceidentity30b4f6a9 und ZIP eb1c08aa gebunden | Zweite vollständige Headless-Runde läuft; erste Modellmigration rot bewahrt |
| Mac-Gate-Lebenszyklus | NG-01/02 angewandt, unabhängiger Quellengegenreview, 24 Modelle plus vier originale Gegenfälle grün | Echte Darwin-/Core-/Worker-/APFS-/ZIP-/DMG-/Finder-/M2-Nachweise |
| Mac-Producer-Tooldeadline (P3) | Enger Quellenabschluss ohne neuen P1/P2; fünf synchrone Toollaunchstellen besitzen nur Node-SIGTERM-Timeouts, keine harte Deadline. Kein tatsächlicher Apple-Tool-Hänger bewiesen | Separates unangewandtes Async-Tool-Delta mit begrenztem Close/Detach und finalem Abortcheck in Vorbereitung; kein Edit am laufenden Freeze und keine Auswirkung auf jetzige Windowsruntime |
| Desktop/Nutzereinstellung | Freigabe aufgehoben; keine weitere Desktopbedienung | Testziel RC163-R5-Final-Test-20261018 ist noch aktiv; ursprüngliches Ergebnisse-Ziel nur durch Nutzer oder erneute Freigabe zurückstellen |
| Identischer Featurestack | Gemeinsame Quellenidentity325 Inputs; selektiver 873-Dateien-Snapshot mit Manifest auf Baseline ec746074… lokal und unabhängig bytegeprüft | Kein autarker Checkout; echte Macapproval verändert Identity, anschließend beide Pakete erneut daran binden |

Diese Tabelle ersetzt ältere offene Aussagen derselben Punkte. Historische
Fehlläufe/Archive bleiben unverändert. Weder Quellenmodelle noch ein erfolgreicher
einzelner Bedienfall sind eine vollständige Zielhost-/Anwenderabnahme.

Der Quellenabschlussbericht dist/mac-static-core-open-gates-review-20261018/
REPORT.md trennt diesen implementierbaren P3 ausdrücklich von echten Zielhost-
Gates und Vertrauensannahmen. Tool-/SDKnamespace, vollständiges Nachfahrenende
und konservative Home-ACLpolicy nicht durch zusätzliche grüne DTOs als bewiesen
ausgeben. Keine bestehenden ACLs oder macOS-Schutzfunktionen lockern.

## Maßgebliche Integration nach 08:44 UTC, 18.10.

| Thema | Tatsächlicher aktueller Stand | Noch offenes Gate |
| --- | --- | --- |
| Sichtbare Erstbereitstellung Fast/OCR | Awaited Async-Workerpfad im Produkt; Callbackeintritt nur einmal, genaue Claimfreigabe; 50 Quellenfälle und echte Windows-Konkurrenzprobe84 bestanden | Unveränderter Vollstand, neues Paket, frischer normaler Explorer-GUIlauf |
| macOS-Static-Core statt eigenem dynamischem Addon | Consumer und versionierter Producer-R2 integriert; Windowspfad getrennt erhalten | Reale arm64/x64-Bytes und unabhängige Artefaktapproval; bisher keine Mac-Binärfreigabe |
| Mac-Buildprovenienz | Pflicht-Lifecycle-Snapshot /2 vor finalem Marker; 106 Producer-/105 Consumermodelle | Native Compiler-/Worker-/Abbruch-/APFSnachweise, keine Gruppenabschlussbehauptung aus false |
| Parserrolle | Exaktes Missing-name statt pauschalem ERR_INVALID_MODULE | Nativer offizieller Converter-Negativtest |
| Native Mac-Gates | Neuer eigener Static-Core-Einstieg im Gegenreview; alte Addongates werden nicht als Static-Core-PASS umgedeutet | Echte App-/Core-/Worker-/Epoch-/Pause-/Lease-/ACL-/Paket-/Finderprüfungen |
| Windows RC163 lokal | Neuer kompletter Durchlauf und ZIP in Vorbereitung | Vollsuite, Clippy/Rust/Release, Paketgates, normale Bedienung einschließlich Vertagen/Export/Verlauf |
| Identischer späterer Mac-Featurestack | Gemeinsame Quellenidentity und Archiv vorgesehen | Eine spätere Policyapproval ändert die Identity: danach beide Pakete neu daran binden |

Diese Tabelle ersetzt die nachfolgenden älteren Zwischenstandsformulierungen.
Historische fehlgeschlagene eigene Läufe bleiben unverändert erhalten. Kein
Paket wird wegen grüner Quellenmodelle allein als insgesamt abgenommen erklärt.

## Maßgeblicher Arbeitsstatus der Fortsetzung am 18.10.

Die folgenden älteren Abschnitte sind zeitlich bezeichnete Arbeitsbelege,
keine kumulative Liste noch offener Fehler. Ein früherer Teil-PASS hebt einen
späteren echten Bedienfehler nicht auf. Aktueller Produktfingerprint nach dem
Rust-/Export-/Deliverydiagnose- und Reviewbrückenfix:
75812d876adac0385b3c9a77a4823f1c03c154a8c2f274a997428c4c78dc83f0.

| Punkt | Implementierung | Noch erforderlicher Nachweis / nächster Schritt |
| --- | --- | --- |
| Früher Verarbeitungseintritt / falsch platzierte Admissionoption | Korrigiert; reale Komposition und native Windows-Admission registriert | Im abschließenden unveränderten Gesamtstand erneut ausführen |
| Vertagungsanzeige und frische Dokumentfreigabe in Auftragskarte | Im Produkt integriert; fokussierte Quellen-/Renderertests bestanden | Erneute native Bediengegenprobe des neuen Pakets |
| Sichtbare Erstbereitstellung nach Fast+OCR | Offen, 5a1-Folgelauf belegt Plan/STANDALONE_BUSY; Diagnose jetzt vollständig auch im Reviewworker verdrahtet | Separater awaited Workerpfad mit ausschließlich Pre-Rootcallback-Admission; Quellen-/Native-/GUIgegenprobe |
| Isolierter 100-Dateien-Corpus | Engere feste Unterphasendiagnose integriert; drei frische unveränderte Paketläufe 100/100 bestanden; früherer Nicht-PASS erhalten | Im abschließenden Stand wieder prüfen; alten Abbruch nicht ohne Ursachenbeleg als gefixt erklären |
| Falscher zusätzlicher RecoveryBlocked-Alarm beim normalen Schließen | Enger Rustfix integriert; 210 Rusttests/Clippy/Release bestanden; auch Explorer-Fastsession normal ohne zusätzlichen Alarm geschlossen | Im abschließenden Quellenstand erhalten und erneut prüfen |
| Windows-Test-ZIP zur Übergabe | f45-ZIP nicht abgenommen | Neues Paket erst nach funktionalem Fix; unveränderte Vollsuite, Paketgates, GUIabläufe |
| Eigene lokale Testeinstellungen | Ursprüngliches Ergebnisziel nach 5a1-Explorerlauf per App wiederhergestellt, sichtbar bestätigt; Prozessabschluss ebenfalls bestätigt | Fehlgeschlagene eigene Fälle unverändert bewahren |
| macOS-Core ohne dynamisches eigenes Guardmodul | Consumer noch unangewandt; versionierter Producer-V1 adversarial mit zwei P2 zurückgewiesen | Producer-R2, kohärente Integration, native Testmigration und echte finale arm64-/x64-Artefakte |
| Gemeinsamer Featurestand / Macabnahme | Gemeinsame Fachlogik erhalten | Exakten abschließenden Quellstand sichern; native Mac-/M2-Gates bleiben gesondert, später |

Keine Bestands-ACLreparatur, automatische Migration, Schutzabschaltung oder
Veröffentlichung aus dieser Runde. Bestehende Benutzerläufe und fehlgeschlagene
Nachweise bleiben unverändert erhalten.

### Neuester praktischer Gatebefund: f45bfbf, 18.10.

- Frühester Admission-/Wiringfehler geschlossen, C1-Erstlauf nativ korrekt
  zurückgehalten. Neue tatsächliche Kompositionsregression12/12 und dauerhaftes
  Windows-C-Admissiongate57 Prüfungen integriert, kanonisch explizit erreichbar.
- **Offen: sichtbare Erstbereitstellung nach erfolgreichem Fast+OCR.** Eigener
  6556f59e-Lauf hat3privateErgebnisse, aber0sichtbare; WorkerExit0/keineLease.
  Claim vorhanden, Plan fehlt. Keine Ursachenbehauptung ohne Beleg, insbesondere
  kein pauschaler Exportreplay oder langer äußerer Kernelguard um Dateikopien.
  Fehlende feste Exportphasen-/Fehlerdiagnose und tatsächliche Claim-/Plan-/
  Releaseübergänge prüfen. Fehlerbeleg bewahrt, keine blinde Fortsetzung.
- Abschließend eigene Ergebniseinstellung zurücksetzen; vor neuem Windows-ZIP-
  Handoff frische/Resume-/P3-/Export-GUI und unveränderte Vollsuite. e5c255+7 ist
  trotz aller grünen Einzelfälle wegen Inputwechsel ausdrücklich kein Gesamt-PASS.

### Engste aktive Aufgaben, 18.10., 06:59 UTC

- Admission und beide P3-Statuskorrekturen integriert. Falsch platzierte
  Kompositionsoption vor Übergabe entdeckt und exakt korrigiert; e5c-ZIP nicht
  verwenden. Ausgeführte-Komposition-Regressionsgate dauerhaft ergänzen.
- Native Windows-Admissionprobe 64/64 auf neuer privater Fixture bestanden;
  dauerhaften expliziten artefaktgebundenen Gate-Einstieg ergänzen. Kein Mac-
  oder vollständiger Runner-/Dokumentbeweis daraus.
- Neuer Quellenfreeze/Windowsbuild, unveränderte Gesamtsuite, Paketgates und
  echte C1-/Fast-/Vertagen-/Neustart-/Freigabe-/Export-Bediengegenproben nötig.
  Alten e5c-Lauf nach Sourcekorrektur nicht als gültigen Gesamt-PASS zählen.
- Mac: kohärente Consumer-/Producerdeltas noch unangewandt, native Testmigration
  und geschlossene Artefaktzuführung noch Codearbeit. Anschließend beide echten
  finalen Cores/Pins und normale Finder-/ZIP-/DMG-Nachweise. Kein Windowsbeleg
  ersetzt diese Schritte; M2 bleibt wie vereinbart später.

### Aktuelle Entscheidung im Nachtlauf, 18.10.2026

- 06:39: 36641cba Fast+OCR und geführtes Vertagen/Explorerneustart praktisch
  bestanden; genau eine bytegleiche Fast-KI-Kopie. Zusätzlicher neuer C1-Lauf
  stoppt aber vor jeder Datei an OWNERSHIP_CONTROL_BUSY (alle pending/sealed).
  Frühen Processingeintritt kausal prüfen und eng korrigieren; kein Gesamt-PASS
  und kein C1-Datenschutzergebnis. Eigene Daten und vier geschlossene Logs erhalten.
- P3: native Vertagung im äußeren Stepper aus exaktem ACK darstellen; ältere
  Statusantworten dürfen sie nicht überschreiben. Frische, vollständig gebundene
  Dokumentfreigabe in die Auftragskarte übernehmen, ohne Export zu behaupten.
  Kumulativer unangewandter Patch, 386 RAM-Fälle. Nach Ende des Gesamtlaufs
  integrieren, neu binden/bauen und nativ gegenprüfen.
- QA: fehlende Erreichbarkeit der neuen nativen Leaseprobe im zentralen Runner
  korrigiert; explizites Manifest plus vertrauenswürdiger Runtimehash nötig.
  Quellfingerprint unverändert, neuer voller 254+7-Lauf läuft. Fehlerbeleg des
  ersten Laufs nicht überschreiben.
- Mac-Producer: zwei Entwurfsrisiken mit unangewandtem Hardeningdelta/31 Modellen
  geschlossen. Weiter keine Mac-Produkteinbindung oder Artefaktfreigabe;
  tatsächliche finale Cores/Pins und native Gates fehlen.

- GUI-12/Lease-ABA im gemeinsamen Quellcode integriert. Echter nativer
  Windows-Zweiprozessnachweis für beide Lifecyclemodi, kein Parser-/GUIbeweis.
  Gegenreviews ohne neuen bestätigten P1/P2. Neuer Freeze 36641cba… mit 254+7
  plus nativem Build läuft; Paket und normale Bediengegenprobe ausstehend.
- UX/P3 geschlossen im Code/Renderermodell: Ready ist kein alter Laufabschluss,
  Zwischenzustände invalidieren Render-/Ansagecache, offener Delivery kein
  Erfolgshäkchen und nur eine primäre Verlaufsaktion, gültige neue Vorschau
  meldet Bereitschaft statt weiterlaufender Prüfung. Native UI noch prüfen.
- Separat, nicht im aktuellen Standalone-Scope: automatischer Plugin-Review
  kann nach unbestätigter Self-Leasefreigabe vollständigen Fortschritt an die
  Exportgrenze reichen. Kontrollfluss-P2 im RAM belegt; native Exportgates
  können weiterhin verweigern. Keine tatsächlich unberechtigte Kopie bewiesen.
  Standalone umgeht diesen Helper ausdrücklich. Nach Apps-Abschluss separat
  bearbeiten, ohne das vereinbarte Hostvertrauen umzudeuten.

- GUI-12/P2, 05:27 UTC: frischer echter Schnellweg+OCR hat 3/3 private
  `released`-Ergebnisse, aber keine sichtbare Bereitstellung. Nach erfolgreicher
  Leasefreigabe verursacht die separate, auch ohne Zero-Day unnötige
  Lifecycle-Guardakquise ein neues Busy-Fenster. Enger Fix: ein gemeinsamer
  synchroner Kernel-Lifetime; Retry ausschließlich vor Callbackeintritt,
  ohne Aktionsreplay. Zwei unabhängige Quellenreviews bestätigen die Ursache.
  Parent-Exitcallbacks zusätzlich exakt an ursprüngliche Leaseepoche binden,
  keine neu ermittelte PID/Birth-ID als Freigabeautorität verwenden.
- 6e5d: vier Paketgates grün. Echte Alt-Fast-Fortsetzung 3/3 bytebewahrend und
  frischer Normalfall 2/3 mit Vergleich/Freigabe/Vorschauabbruch/Export sowie
  konsistentem Abschlussstatus bestanden. Frischer Fastfall dennoch fehlgeschlagen;
  nicht aus Teilerfolgen abnehmen. Gesamtlauf 252+6 läuft unverändert weiter.
- UX/P3 offen: nach Ordnerkonfiguration kann eine alte Auftragskarte wieder
  „Bereit“ anzeigen; Exportvorschau bleibt nach Bereitschaft sprachlich auf
  „wird geprüft“. Zusätzlich `export_pending` nicht mit Fertig-Häkchen markieren.
  Erst nach Lifecyclefix gezielte Renderingregressionen und Bediengegenprobe.

- REVIEW-11/P2: Review-Orchestrator mit verbleibendem getrennten Release-Busy
  und drei breiten Control-Catches. Enger Fix mit identischer Epoch-Capability,
  aktivem Lifecycle bis Releaseende und unverändertem Controlfehler vor jedem
  Deferred-/Journalwrite; gezielte Gegenprüfung läuft. c76b-Eingaben während
  der Runde geändert, deshalb Build-Gesamtbeleg bewusst nicht bestanden.
- GUI-08 Teilkorrekturen jetzt durch echte native 20/20-Konkurrenzprobe
  einschließlich async Dokument-Release belegt. 101 gezielte Persistenzfälle
  plus 50 Auto-Datenschutzfälle grün; erneuter unveränderter Gesamtbuild und
  Windows-Bedienprüfung bleiben nötig. M2-/Intel-Nachweis weiterhin offen.

- NEU GUI-08/P2: echter 0f47-Schnellweg-Resume bestätigt CSV/TXT, OCR-PNG
  bleibt nach publiziertem Ergebnis unbestätigt. Synchrone Dokumentkontrolle
  hatte dieselbe Release-Busy-Lücke und ist korrigiert; asynchronen nativen
  Export mit exakter Epoche/Busy-only-Release nachsichern. Noch keine neue
  Bedienabnahme. Diagnose jetzt feste `content_ack`-Grenze plus ursprüngliche
  geschlossene Ursache statt verlorenem Postcommitfehler. Acquire-Kontention
  darf nicht als beschädigte Publikation fehlklassifiziert werden.
- NEU QA-09: Corpus-Fehlercleanup konnte Primärfehler überschreiben und noch
  laufende eigene Snapshots löschen. Fehlscope/Fehlercode erhalten, Cleanup
  nur nach bestätigtem Workerende/Child-close; Sourceadapter-EEXIST-Race
  korrigiert. 0f47-Vollsuite 40/252 ist ausdrücklich kein PASS. Ein während
  Änderungen erfolgter IPC-Publikations-Timeout bleibt mit eigener Fixture
  erhalten, trotz späterem gezieltem Erfolg. Neue unveränderte Vollrunde nötig.
- UX-10: nichtterminales „Fortsetzung möglich“ zeigte Erfolgshäkchen.
  Darstellung korrigiert, 245 Workspacefälle grün. Authentische neue Sitzung
  gesichert, ursprüngliche Ergebniseinstellung wiederhergestellt, App beendet.

- GUI-06/UX-07: Korrekturen jetzt integriert, neue Paket-/Bedienabnahme noch
  offen. Gemeinsame synchrone Owner-Transaktion statt Release-Reacquire,
  gebundene Abschlussprojektion einschließlich OCR-/Datenschutzhinweisen.
  Zwei begrenzte Quellengegenreviews ohne neue bestätigte Delta-P1/P2;
  14 native Zweiprozessproben sowie fokussierte Backend-/UI-Gates grün.
  Kein Verschmelzen historischer Teilläufe zu einem Vollsuite-PASS.
  Neue Belege unter `dist/rc163-r5-sync-control-20261018/`.

- NEU GUI-06/P1, 03:46 UTC: echter dc114-Explorer-Schnellweg mit OCR scheitert
  ohne Pauseklick an `STANDALONE_PAUSE_CONTROL_BUSY`. Pause-Control-Record
  bleibt beim lebenden Sidecar, erste CSV privat publiziert, weitere Quellen
  pending. Diagnose nun mit festen Workerphasen belegt; eigene Originale
  unverändert, keine KI-Kopie. Synchrone Pause acquire/action/release und
  Kernelguard-Grenzen direkt kausal prüfen, keine Lock-/ACL-Umgehung.
  Unabhängiger Quellenreview und begrenzte Implementierung mit Gegenproben
  laufen; aktuelle ZIP ist deshalb nicht zur Gesamtabnahme empfohlen.
- NEU UX-07/P2: nach bestätigtem GUI-Export ist die Verlaufs-Laufkarte richtig,
  obere Schrittanzeige/Auftragskarte behaupten weiter fehlende Freigabe.
  Frische, an denselben Lauf gebundene Abschlussdaten konsistent darstellen;
  keine aktive/alte/fehlerhafte Momentaufnahme als Exportabschluss behandeln.
  Erste reine Anzeige-Deltaversion verworfen/nachgebessert: sie behandelte
  nur vollständig umgewandelte Quellen und verfehlte den realen Fall mit einer
  erwarteten OCR-aus-Auslassung. Positive 2/3-Gegenprobe ist erforderlich.
- MAC-CERT-03-Draft: unabhängiger Producer-/Consumer-Gegenreview reproduzierte
  einen TDZ-Fehler im noch unangewandten Provenienzvalidator. Korrigierte
  vollständige 39-Dateien-Kopie plus dauerhafter Regressionstest getrennt unter
  `dist/mac-static-core-integration-delta-tdz-20261018/`; 13 RAM-Fälle bestanden,
  Original scheitert nachweislich. Keine Produktanwendung, keine Artefaktfreigabe
  und kein nativer Mac-Nachweis. Producerdelta aktualisiert aktuelle C-Pins,
  bleibt ebenfalls unangewandt. Beide echten Macbuilds weiterhin erforderlich.
- dc114: 208 Rust/Clippy/Release und vier Paketgates bestanden. Normaler
  synthetischer GUI-Lauf einschließlich Originalvergleich, zwei Freigaben,
  Vorschauabbruch und genau einer bytegeprüften KI-Kopie bestanden.
  Vollsuite 172/251, danach VM-Testabhängigkeit fehlt; echter Diagnosehelper
  inzwischen im eng begrenzten Test eingebunden, sechs Fälle grün. Nach
  GUI-06/UX-07 neuer vollständiger Quellfreeze/Build/Gesamtlauf erforderlich.

- GUI-05-Folgerunde: Same-Epoch-Busyretry (vier feste Backoffs), Erhalt
  ungestarteter Quellen und feste Workerfehlerstufen bis ins native
  Diagnosebundle implementiert. Drei getrennte Quellengegenprüfungen ohne
  weiteren bestätigten Delta-P1/P2. Echte Windows-Zweiprozessprobe:
  190 Assertions, bestätigtes normales Child-Close, frische Fixture bereinigt.
  Zusätzliche unveränderte Fixture eines fehlgeschlagenen Testharness-Endes
  bleibt erhalten. 21 Epoch-/13 Orchestrator-/14 Runner-/8 Bridgefälle grün.
  Neue native NT-Create-Diagnose ergänzt ursprünglichen NTSTATUS und festen
  DOS-Code ohne Pfade oder Rechteänderung; 15 Rust-Bundlefälle grün.
  Vollständiger neuer Build und erneute normale GUI noch ausstehend.
  Der historische konkrete Explorertrigger ist dadurch NICHT bewiesen.

- NEU GUI-05/P1, 02:58 UTC: gewöhnlicher Explorer-c0bf kann konfigurieren und
  eigene drei Dateien aufnehmen. Geführter Anonymisierungslauf bleibt nach
  erster privater CSV-Publikation delivery_pending; TXT und OCR-aus-PNG werden
  als INTERNAL_FAILURE gestoppt. Tatsächlichen Finalisierungs-/Journal-/
  Reviewübergang kausal isolieren und beheben, keine Integritätsprüfung
  umgehen. Drei begrenzte unabhängige Quellenreviews gestartet. Authentische
  EXPLORER-*-Diagnose/Eigenbatch gesichert; alte Ergebniseinstellung per UI
  zurückgestellt, eigener App-Prozess geordnet beendet. Weitere Bedienfälle
  erst nach Diagnose; c0bf nicht abgenommen. Vier Paketgates bestanden,
  vollständiger 249+4-Lauf um 03:11 UTC grün/unverändert; keine GUI-Abnahme.

02:45-UTC-Gegenprobe: c0bf per normalem Explorer-Doppelklick erfolgreich
konfiguriert; echte alte Ergebniseinstellung sichtbar, frisches eigenes
Testziel gespeichert. Frühere GUI-04-Beobachtung kontextspezifisch: Sky/exec
zeigt andere gespeicherte Konfiguration und tatsächlich nach Codex-LocalCache
umgeleitete AppData-Neuanlagen. Negative Package-/Legacy-UAC-Abfrage war
kein Ausschluss dieser FS-Umleitung. Keine Rootmigration, Flaglockerung oder
ACL-Änderung. Nachfolgender Lauf siehe GUI-05 oben; Kontextdiagnose
und gemischte Kindzugriffs-/Altbestandssicht getrennt reviewen, bevor eine
Produkt-Speicheränderung in Betracht kommt. 203 Rust/Clippy/Release grün,
neuer vollständiger 249+4-Lauf aktiv, vier c0bf-Paketgates inzwischen grün.

Aktiver Diagnosequellstand c0bf60a95a9369d2bd83d78fb2bc62cf2ae9e32ded5314123d69993238cdc75c:
feste native Configure-Stufen und IO-/OS-Code ohne Pfade/Fehlerpayload integriert,
Support-Sanitizer geschlossen, Kontextanzeige präzisiert. Zwei Quellengegenreviews,
211/35 UI-/Vertragsfälle, Clippy und drei gezielte Rustfälle grün. Reales
Rust→Paket-Node→C mit gehaltenen Pins während Configure für Owner-only und
bestehenden Capability-Root grün. GUI-04 bleibt offen, Ursache nicht durch
diese synthetische Gegenprobe erklärt. Neuer gebundener Build/GUI-Diagnose
als nächster Schritt. Keine echte Benutzer-ACL verändert. Separater 1dcf-
Restlauf 46–249: 204+4 grün/unverändert, nicht zum vollständigen PASS addieren.

Der Anwender hat die fachliche Entscheidung delegiert und ist nicht für
weitere Fragen erreichbar. Vorhandene Ordnerrechte, Läufe und Profile werden
nicht verändert. Zwei Quellengegenreviews bestätigen einen Windows-Fehlalarm:
Capability-ACEs sind keine gewöhnlichen fremden Benutzer-/Gruppenschreibrechte.
Die native Windows-Authz-Gegenprobe bestand 11/11 synthetische In-Memory-Fälle,
einschließlich verweigerter Schreib-/DACL-/Owner-/Delete-Rechte eines fremden
Benutzers trotz Capability-Vollzugriff; keine Accounts oder ACLs geändert.
Die Produktkorrektur unterscheidet diese binäre SID-Klasse eng und behält
Owner-, Namespace-, Lock- und gewöhnliche Fremdschreibschutzprüfungen bei.
Beide Produktkorrekturen jetzt integriert und unabhängig gegengelesen.
Frischer Guard: 114 native Assertions; 239 Integrationsassertions grün.
Rust: 200/0/3, Clippy und Releasebuild grün. Der neue gemeinsame Fingerprint
ist `1dcf663b411706eebf582772d8564e2d1135dfcbdb29ca4723800f1afff7868b`.
Paketierung und neuer vollständiger 249+4-Endlauf laufen; noch keine GUI-
oder Zielhostabnahme. Der vorherige 189+4-Restlauf ist grün, aber ausdrücklich
nur eine Diagnose und kein vollständiger grüner Endlauf.

GUI-04/P2 neu offen: echter neuer Windows-Ordnerdialog erreicht den eigenen
frischen Testzielordner; zwei leere Ausgabeunterordner werden angelegt,
danach natives `AI_EXPORT_CONFLICT` vor Konfigurationscommit. Kein neuer
Dokumentlauf, bisherige Einstellung bleibt. Feste native Configure-Stufen und
IO-Fehlerklassen vor Sammelcode erfassen; Gegenprobe mit gehaltenem Rust-
Namespace und tatsächlichem C-Factory-Pin, dann Ursache beheben und erneut
Bedienung prüfen. Nicht ohne Beleg auf C-Capability-Policy zurückführen.
Rein lesende native Tokenprobe am exakt eigenen GUI-Image widerlegt eine
weitere Hypothese: kein AppContainer/eingeschränkter oder erhöhter Token,
keine Restricted-SIDs/Capabilities. Keine Descriptorlockerung daraus ableiten.
Alle vier 1dcf-Paketgates grün, aber kein positiver Bedienabnahmenachweis.
Vollständiger Lauf bei45/249 wegen fehlendem kanonischen Guard-Artefakt
gestoppt; kanonischer Buildinput jetzt vorhanden (binär identisch), separater
Diagnoserestlauf ab46 läuft. Frühere rote Nachweise bleiben erhalten.

## R5: elf neue Quellenreviewbefunde, 18.10.2026

Elf Ausgangsbefunde und mehrere Folgefehler implementiert und gegengeprüft;
stabiler 62c-Endlauf 249/249 Headless-Dateien sowie Windows-Rust/Clippy grün.
Aktuell P1-Folgefix: literale C1-Zeichen in Office-Text/CDATA umgehen die
bisherige restriktive Referenzpolicy und lassen Identifierziffern exportieren.
Kein Abnahmevorschlag für das bereits gebaute R5-Zwischenpaket. Der Folgefix
ist inzwischen implementiert und mehrfach gegengeprüft, einschließlich
Code-/Escape-Korridoren, echten Exportbytes tracefreier Altstände und einem
Regex-Fehlalarm. 164 PII-/49 Publikationsfälle und abschließend 37 unabhängige
API-Gegenproben grün. Neuer stabiler a395-Endlauf 249/249 + vier Zusatzgates,
gebundener Windows-Build, ZIP und getrennte Headless-Paketgates grün.
Echte Windows-GUI-Probe anschließend vor Ready am normalen privaten Root
verweigert: STANDALONE_OWNERSHIP_STORAGE_UNSAFE, keine Rechte geändert.
Neue bestätigte GUI-01/P1: generische Recovery verdeckt die feste Ursache
und wiederholt automatisch 15 Starts; GUI-02/P2: Diagnose-Build-ID fehlt;
GUI-03/P2: Windows-Erstanlage erbt unsichere ACL, isolierte Loaderfixtures
hatten das verdeckt. Fixes lokal in Integration: Fehler dauerhaft halten,
nur ausdrücklicher Retry, Quellen-Build-ID und native geschützte Erstanlage.
Bestehende private Datenbereiche/Rechte bleiben unverändert; kein Fallback
auf leeres Profil. 7d53: 196 Rusttests/Clippy/Build grün; negative echte GUI
bestätigt Ursache, Build-ID, 1+1 Starts und Diagnoseexport. Zusätzlichen
P3 unbekannte native Fehler-Epoch bei Snapshotausfall behoben; 171 Workspace-/
34 Vertragsfälle und neuer b28e-Rust-/Clippy-/Buildlauf grün. 7d53-Breitlauf
korrekt rot an altem Teststub, gezielt nachgebessert; alle vier 7d53-Paketgates
grün, auch die vier b28e-Paketgates. b28e-Breitlauf rot bei Datei 60/249 an
weiterer veralteter Modellannahme; 38/38 nachgebessert, diagnostischer
Restlauf 61–249 separat. Kein vollständiger grüner Endlauf. Weiteren P2 nach Ready und
anschließendem Kontextfehler beheben und erneut gegenprüfen; Fix getrennt
von laufenden Quellen ausarbeiten. Ersten read-existing-only-Dist-Patch nicht
anwenden: behebt tatsächlichen Timeout/Retirement nicht. Zwei unabhängige
Architekturreads bevorzugen native Auflösungsreceipt, die ausschließlich den
passenden alten Bootstrapfehler erledigt; UI bleibt bis Status+Kontext gesperrt.
Alle fünf positiven Bedienfälle
BLOCKED, kein Abnahmevorschlag für a395. Alte Verifikationsmarker werden mit de-business/5 nicht
stillschweigend als aktuelle Datenschutzfreigabe anerkannt.
Zusätzlich aktiver Implementierungsauftrag MAC-CERT-01..04 für den
zertifikatfreien Mac-Core; Node-Quellprototyp vorhanden, Produktintegration
und native Mac-Gates offen. Kein Developer-ID-Zertifikat geplant; keine
Abschaltung von Library Validation/Gatekeeper/Hardened Runtime autorisiert.
Windows-Desktopprüfung neu erlaubt, nur Hauptagent und nur korrigierter
Kandidat mit synthetischen Daten. M2 später. Keine Runner/Pushes/Releases.
Implementierung, gezielte Regression, unabhängiger Quellengegenreview und
native Zielhostnachweise bleiben getrennt. Neue bestätigte Folgefehler gehen
in dieselbe Korrekturrunde.
[Detailliertes Arbeitsbacklog](../acceptance/RC163_R5_FIX_REVIEW_20261018.md).

## Historische Nachweise bis R4 (kein aktueller R5-Abschluss)

Stand: 17.10.2026 · Produktstand 3.2.0-rc176 · veröffentlicht Standalone RC162 (Windows und beide Mac-Architekturen; M2-Abnahme offen), Linux RC159 / Cowork RC151 · lokaler Arbeitsstand nach RC162 noch nicht veröffentlicht

## Gezielter R3-Abschlussreview

Zusätzlich bestätigt: F13 (Einzelentscheidungen ohne frühe konsistente
Manifestbindung, Commit trotz später Fehlerantwort) und F14 (verspätete
Post-ACK-Antwort beziehungsweise alte Öffnungsfehlermeldung überschreibt den
frisch wiedergeöffneten gleichen Lauf). **Beide lokal geschlossen**, Fixes
unabhängig gegengeprüft; R3-Archive bleiben unverändert. Finaler Gesamtlauf
mit 242 Headless-Dateien bei unveränderten Produkt-/Testbytes bestanden,
89 Renderer-/24 Kontextfälle, 167 Rust-Tests und Clippy grün. Echter nativer
Export und acht Zwei-Prozess-Abbrüche sowie die vollständige isolierte
Paketprobe und der semantische Inhaltsoracle am endgültigen R4-ZIP bestanden.
Aktueller Testkandidat unter `dist/engineering-rc163-post-review-20261017-r4-final/`;
gemeinsamer Quellen-Freeze für Mac unter `dist/rc163-r3-final-review-20261017/`.
Keine neue OS-spezifische P1/P2 im begrenzten Windows-/Mac-Review.
Native Zielhost-/Clean-VM-Abnahmen, Mac-Kompilierung/Pfadraces und Signiergates
bleiben offen; kein Desktopzugriff, Push oder Release.
[Aktueller Abschlussreview](../acceptance/RC163_R3_FINAL_REVIEW_20261017.md).

## Tiefenreview-Fixrunde: aktueller Standalone-Schwerpunkt

F01–F12 aus dem lokalen Tiefenreview und den Gegenreviews sind im Quellcode bearbeitet; keine
Abnahme des alten R2-ZIPs daraus ableiten. Ein unabhängiger Gegenreview
begutachtet tatsächliche Produktion und anschließend Tests. Der vorläufige
[Fixbericht](../acceptance/RC163_POST_REVIEW_FIXES_20261017.md) trennt
Produktionsfix, Testnachweis und externe Gates. Die zwei neuen Konsistenzfenster
wurden unabhängig nachgeprüft. Native Windows-Rust-Tests/Clippy, reale
Office-/OCR-Konvertierung, 16 Kontext-/62 Backendfälle, acht echte Node-/Rust-
Prozessabbrüche und Inhaltsoracle am neu gebauten R3-ZIP sind bestanden.
Breite Headless-Regression mit 239 Dateien sowie ergänzende neue/kritische
Gates bestanden; vollständige isolierte Paketprobe mit beiden Zwecken, OCR,
Vertagen/Neustart, Schnellweg, Widerruf, Export und Verlaufsabgleich bestanden.
Mac-Layoutadapter und native verzeichnisrelative Build-Mutation sind umgesetzt,
deren Apple-Clang-Kompilierung und native Race-Probe bleiben vor einem Mac-ZIP
offen. Frische globale History-Inventur bleibt bewusst O(N); kein dauerhafter
Autoritätscache. Native Windows-Bedienung und M2-Abnahme bleiben beim Anwender;
kein Desktopzugriff. Alte Pakete und Testbestände bleiben unverändert.
H01/H02 (Cowork-Härtung) sind zugunsten Windows/macOS zurückgestellt.
Hostvertrauen bleibt auf ausdrückliche Entscheidung erhalten; ein vom
Modell gesetztes `confirmed=true` ist kein Beweis menschlicher Zustimmung.
Keine neuen Cowork-Bestätigungsdialoge in dieser Runde.

## Integrierter Arbeitsplan nach RC162: Einfachheit ohne falsche Sicherheit

Aktueller Auftrag RC163: Clippy-Befunde strukturell bereinigen, integrierte
Regression ausführen, unabhängige Rust-/Workflow-/Paketreviews abschließen,
Quellstand und Lockdateien lokal festhalten, frisches Windows-Engineering-ZIP
erstellen und dessen Integrität, tatsächliche Prozesskette sowie native
Bedienung prüfen. Die spätere M2-Version wird aus demselben Quellstand gebaut;
kein Mac-Erfolg wird aus dem Windows-Test abgeleitet. Keine Veröffentlichung
oder Änderung bestehender Releasearchive in diesem Auftrag.

Lokal umgesetzte Durchsatzrunde: nichtfinale Datenchunks ohne Threadneustart;
fertige Kopien pro ACK frisch einmal statt vierfach prüfen; unveränderlichen
Plan-Digest nur innerhalb der Transaktionsinstanz wiederverwenden. Globale
History-Namenssuche aufruflokal linear: 2 statt 320 Owner-Auflistungen;
das vollständige Capture-Profil liest 1.280 statt 103.040 Einträge. Recovery- und
Hinweiszugriffe erst nach Auswahl der höchstens 20 sichtbaren Zeilen.
Echte Sidecar-Gegenprobe fand zusätzlich normale neue Review-Ordner während
der Lektüre: höchstens ein vollständig frischer Leseversuch unter denselben
Elternbindungen, kein Wiederholen von Lauf/Export. Quellreviews, echte
Node→Rust-Kette und Windows-Rust 162/0/3 sowie Store 62/62 grün.
Kein Mutex-Multiplexing, kein Lockverlust bei Timeout, kein M2-Test/Release.

Lokal nach Neustart fortgeführt: Native Exportphasen und tatsächlich in der
aktuellen Anfrage gestagte Dateien sind unabhängig vom Core-Lock beobachtbar;
aus Aktivität wird niemals Erfolg abgeleitet. Erfolgsdialog nach dauerhaftem
ACK sofort abschließen, optionalen Anzeige-Reload davon trennen und gegen
einen dabei entdeckten anderen Auftrag schützen. History-Detail- und
Öffnungsaktionen lesen gezielt ihren Lauf; vier bisher ungleich klassifizierte
Leser verwenden die bestehende 300-Sekunden-Klasse. Das Exportbudget wird
nicht verlängert. Rust 155 bestanden / 3 ignoriert, Renderer 84/84,
128-Fremdläufe-Dateisystemprobe ohne globale Auflistung/fremde Dateiöffnungen,
echte Prozessketten und Headless-Fokus/axe/Reflow grün. Kein neuer Release
in dieser Runde; native Windows-/Mac-Paketabnahme bleibt ein eigenes Gate.

Die getrennten Windows-, macOS- und Fach-/Bedienreviews wurden gegen
Startkette, IPC, Verlaufs- und Dokumentzustand sowie die Tests abgeglichen.
„Verarbeitung abgeschlossen“ belegt nur die technische Arbeit am Lauf;
Dokumentfreigabe und KI-Kopie sind eigene, revisionsgebundene Tatsachen.
Ein Hinweis schließt einen Lauf nicht wieder auf. Ein bekannter
Datenschutzstopp oder eine unklare OCR-Fundstelle darf dagegen nicht als
technisch sicher anonymisierte und geprüfte Datei dargestellt werden.

### Lokal abgeschlossene Performance- und Diagnoserunde

Der Anwender verschiebt die M2-Zielhostprobe ausdrücklich auf eine später
neu erzeugte Testversion, die dann dem weiterentwickelten Quellstand
entspricht. Das ist kein bestandenes Mac-Gate und blockiert die lokale
Entwicklung nicht. Drei unabhängige Ketten wurden lokal umgesetzt:

1. Export mit 115/200 synthetischen, tatsächlich gespeicherten Dokumenten
   profilieren und nur redundante Arbeit innerhalb einer gesperrten Aktion
   reduzieren. Keine dauerhaften Freigabe-/Integritätscaches.
2. Den frühen Capture vor Retention bei vielen alten Läufen verschlanken.
   Ein Index oder eine Zusammenfassung ist niemals Freigabe-/Exportautorität;
   beschädigte oder fehlende Evidenz muss auf sicheren Abgleich zurückfallen.
3. Ein inhaltsfreies Diagnosepaket ausdrücklich lokal speichern können,
   einschließlich fehlender/unlesbarer Bestandteile. Ohne Core-Verbindung,
   Shell, Adminrechte oder Hochladen; vorhandene Logs vor Weitergabe erneut
   begrenzt und feldgebunden validieren. Keine Rohkopie beliebiger Dateien.

Ergebnis: neue Exporte benötigen zwei statt vier vollständiger
Quelldurchgänge, ohne den frischen Kopierdurchgang oder Zielbelege zu
entfernen. Der frühe Capture verwendet bei unveränderten gebundenen Bytes
einen Index; der 320er-Profillauf reduzierte wiederholte Review-Listen von
320 auf eins (21,028 → 7,418 s Capture allein, Windows-Einzelmessung).
„Diagnosepaket speichern“ erzeugt eine erneut bereinigte lokale JSON-Datei
auch ohne Core; fehlende/gekürzte Teile sind gekennzeichnet. Store 62/62,
Rust 147 bestanden / 3 ignoriert, echte Node→Rust-Kopie und erneute
Headless-Oberflächenprobe grün. Native Picker und neue OS-Pakete bleiben offen.

Quellreview, Messung und Negativfälle sind je Kette nötig. Eine neue
Versionsnummer, Veröffentlichung und Windows-/Mac-Downloadpakete sind nicht
Teil dieser lokalen Runde; sie folgen später aus einem festgelegten Stand.

Zusatzauftrag: Integritätsprüfungen und Integrationstests nach Schutzwirkung,
Vertrauensgrenze und Betriebssystem bewerten. Redundante Aufrufe innerhalb
einer gebundenen Aktion dürfen entfallen; neue oder veränderbare Übergaben
benötigen weiter einen eigenen Nachweis. Gemeinsame Inhalts-/Freigaberegeln
bleiben einheitlich, native Datei-/Prozess-/Paketprüfungen sind getrennte
Windows- und macOS-Gates. Die konkrete Prüfmatrix steht im Reviewbeleg.

| Priorität | Vorhaben und Sicherheitsgrenze | Stand / Nachweis vor Abschluss |
| --- | --- | --- |
| P0 | M2/macOS 26.2: RC162 nach Download, Finder-Kopie und normaler Benutzeranmeldung mit Core-Ready, Datei-/Ordnerdialog, synthetischem Lauf und Diagnose prüfen. Keine Richtlinie abschalten. | **offen:** CI-Start und Signaturprüfung ersetzen diesen verwalteten Zielhost nicht; frühere RC161-SIGTRAP-Ursache bleibt plausible, nicht bewiesene JIT-Signaturlücke. |
| P0 | Lange Aktionen dürfen die serielle Rust-/Core-IPC-Verbindung nicht als ausgefallen erscheinen lassen. Status und Bereitstellung bleiben nicht wiederholbar, bis ihre gespeicherte Antwort geklärt ist. | **lokal erweitert:** jede vor Versand abgelaufene Queue-Anfrage liefert jetzt `STANDALONE_IPC_BUSY`; ein unabhängiger Rust-Aktivitätsspeicher bleibt lesbar, während der Core-Kanal belegt ist. Kein Auftrag wird wiederholt und Aktivität belegt keinen Abschluss. Serieller Durchsatz, langes Warten und die Zielhostprobe bleiben offen. |
| P0 | Core-Startfehler auf beiden OS vor Ready mit inhaltsfreien festen Ursachen protokollieren; Nutzer erhält sichere Wiederholungsanweisung statt Endlosschleife. | **lokal erweitert:** macOS-Signal- und Windows-NTSTATUS-Klassen sichtbar; nativer Zielhosttest und Fehler-Injektion für ZIP/DMG/Windows bleiben offen. Keine Rohpfade, Dateinamen, Dokumente oder ungeprüften `stderr` in Diagnose. |
| P1 | Verlauf erst bei Bedarf rendern, Status während eines echten Abgleichs als „wird geprüft“ statt null anzeigen; den frühen dauerhaften Capture vor Aufbewahrungsbereinigung nicht blind asynchron machen. | **lokal umgesetzt:** Anzeige und inhaltsgebundener Capture-Index; 320er-FS-Profil und Negativfälle für Austausch, Beschädigung, gleiche Größe/mtime und Windows-Junction bestanden. Detail-/Öffnungsaktionen lesen nun den genauen Lauf; 128 fremde Läufe ohne fremde Dateiöffnungen/globale Auflistung geprüft. Index ist keine Freigabe-/Zielautorität. Geänderte Capture-Grundlagen brauchen weiterhin den vollen Abgleich; inkrementeller Capture-Leser und native Mac-Messung offen. Fünf statt 20 sichtbarer Zeilen allein spart diesen Aufwand nicht. |
| P1 | Abschluss für erfolgreich, mit Hinweisen, ohne Ergebnisse und fehlgeschlagen prominent und laufgebunden zeigen; KI-Kopie gesondert belegen. Hilfen in Alltagssprache, optionale Sonderfunktionen einklappen. | **lokal erweitert:** auch Null-Ergebnis-Karte nur bei konsistentem Beleg; Tastatur-/Screenreader-/bediente OS-Proben bleiben offen. |
| P1 | Erfolgreiche Anonymisierung darf vorhandene OCR-/Quellenhinweise nicht als Hinweisfreiheit ausgeben. | **lokal umgesetzt:** gebundene kleine Publikationsmetadaten liefern den Hinweisstatus. Eigener gesperrter Projektionscache erhält bekannte Mindestzahlen; Detailabfragen und Verlaufslisten überschreiben keine neueren Worker-Abschlüsse. Altbasis bleibt unbekannt. UI zeigt grün abgeschlossen plus gelben Hinweis und direkte Details, ohne Dokumentgrad, Freigabe oder Exportrecht zu verändern. Echte OCR-/Neustartkette und gezielte Race-/Migrationsfälle geprüft; native Paketabnahme offen. |
| P1 | Freigabe vieler Dokumente von seriellen Einzelbefehlen auf einen revisionsgebundenen, idempotenten Batch-Befehl umstellen, ohne Teilfehler als Gesamterfolg auszugeben. | **lokal umgesetzt:** Oberfläche, Rust/ACL, privater IPC, Service und Store verwenden eine gemeinsame Auswahlentscheidung. 200 gespeicherte Dokumente, ein Journalabgleich, ein Commit; stale/Restbefund/Commitfehler und verlorene Antworten werden geprüft. Tatsächliche Laufzeit und native Bedienprobe des neuen Pakets offen. |
| P1 | Export von 115–200 Dateien: Vorschau, Kopieren, Verifikation und Beleg jeweils inhaltsfrei zeitlich messen; UI zeigt verstrichene Zeit und trennt „arbeitet“ von „fertig“. | **lokal erweitert:** feste Phasendiagnose, monotone Dauer und auftragsgebundener nativer Dateizähler ohne Core-Lock. Gestagt ist nicht fertig; Erfolg nach ACK unabhängig vom Anzeige-Reload und geschützt vor anderem offenen Auftrag. Vorbereitung zusammengeführt, zwei statt vier Quelldurchgänge, Restdaten-/Zielprüfung und Lost-ACK unverändert. 115er-Node- und 200er-JS-Nativevorbereitungsprofil dokumentiert; letzteres ist keine Rust-/Mac-Durchsatzmessung. Echte Node→Rust-Integration grün; langsame Volumes, absolute 300-Sekunden-Exportfrist, verbleibende Wartezeit und native Paketprobe offen. |
| P1 | Diagnose bei fehlendem oder beschäftigtem Core als einzelne lokale Datei speichern, ohne private Daten weiterzugeben. | **lokal umgesetzt:** nativer unabhängiger Save-Befehl, geschlossene erneute Feldvalidierung, aktuelle/tail-priorisierte Logs, feste Ressourcenlimits und ehrliche Unvollständigkeit. Windows-Hardlink-/Junction-/Append-Fälle und Disconnected-/Busy-UI geprüft. Native Dialogbedienung beider OS bleibt Paketgate. |
| P1 | OCR-Kontaktwerte mit identischer Normalform dokumentübergreifend gemeinsam behandeln, aber nur bei exakter Übereinstimmung und ausdrücklich gebundener Auswahl; abweichende Zeichen bleiben sichtbar. | **teilweise umgesetzt:** Auswahlhilfe für Doppelwerte vorhanden; native 97-Fundstellen-Probe und Nachweis gegen versehentliche Gleichsetzung unterschiedlicher Werte offen. |
| P1 | OCR-Schalter und Hilfetext fachlich angleichen; Scan-/Bild-OCR getrennt nur mit durchgängiger Auswahlbindung und Ergebnistests. | **revalidiert:** Der gemeinsame ausdrückliche OCR-Schalter bleibt im Hauptweg. Bei selektiver PDF-OCR verlangt der vorhandene Core eine Bereichsentscheidung (`PDF_OCR_SCOPE_UNVERIFIED`); zwei bloße Schalter würden Dateien zusätzlich anhalten. Hilfetext korrigiert. Eine getrennte Bereichsauswahl ist eine optionale spätere Funktion, kein stiller Standardwechsel. |
| P1 | Dateinamenwahl beim Anonymisierungslauf, Freigabe und anschließenden Export verständlich unterscheiden; nach erfolgreicher KI-Kopie nicht zu einer scheinbar offenen Pflichtaktion zurückkehren. | **lokal teilweise umgesetzt:** Name plus „-anonymisiert“ ist für neue Läufe wieder wählbar; KI-Kopien bleiben neutral benannt. Nach Beleg wird die Auswahl aufgehoben. Native Langlauf-/Bedienprobe offen. |
| P1 | Erstinstallation ohne vorhandenen Ergebnisordner als normalen Zustand behandeln; Schreibverweigerung beim ersten echten Lauf verständlich abfangen. | **lokal umgesetzt:** nur der Start legt den Standardordner an, `STANDALONE_RESULT_ROOT_UNAVAILABLE` verweist auf eine ausdrückliche andere lokale Ordnerwahl. Das Mac-Bundle erklärt den Zugriff auf „Dokumente“ in seiner System-Berechtigungsbeschreibung; dies erteilt selbst keine Berechtigung. Quelltest für fehlende Konfiguration und verweigerte Anlage bestanden; nativer verwalteter Mac- und Windows-Erststart noch offen. Der RC161-SIGTRAP trat bereits vor dieser Logik auf. |
| P1 | macOS-Speicherort beim ersten Lauf: „Dokumente“ bleibt ein Vorschlag für benutzerseitige Ergebnisse; verweigerte oder verlorene Ziele ausdrücklich erneut prüfen oder ändern. | **lokal umgesetzt:** Konfigurationszustand und Identität sind gebunden, verlorene Ziele wechseln nicht zum Standard. Die UI bietet „Ordner erneut prüfen“ und erhält die Auswahl. Native Ordnerwahl bleibt vorhanden; tatsächliche TCC-/Core-Schreibprobe auf M2 offen. Vor Core-Ready behebt ein anderer Ergebnisordner den frühen Prozessabbruch nicht. |
| P1 | Fastweg: bekannte Unsicherheiten ohne manuelle Rückfragen behandeln, Herkunft ehrlich zeigen und KI-Export getrennt halten. | **lokal integriert:** ausdrückliche Startwahl `automatic-conservative`, geschlossene Übergabe bis zum Worker, unveränderlicher Journal-/Manifestanker. Bekannte Mehrdeutigkeiten und OCR-Kontaktkorridore werden maskiert, nicht menschlich bestätigt. Nur tatsächlich veröffentlichte, endgeprüfte Revision 0 erhält Erstfreigabe; Änderung/Widerruf bleibt wirksam. Echte projizierte Core-/Worker-/OCR-Kette mit Neustart und ausdrücklichem KI-Export bestanden. Dabei gefundene Kanonisierungs-, Profil- und `/4`-Exportübergaben korrigiert. Neu gebautes Windows-/Mac-Paket, bediente Windows-Probe und M2-Abnahme bleiben gesonderte offene Gates. |
| P2 | Ein gemeinsamer fachlicher Core mit kleinen OS-Adaptern statt getrennten Produktkopien. Mac-Bundle-Code Apple-konform platzieren, Developer-ID-Signierung/Notarisierung für reguläre Verteilung ergänzen; Windows-Dateidialog, Prozessende und Paket-Smoke separat abnehmen. | **offen:** ZIP/DMG-CI und Windows-Start sind Teilnachweise, keine verwaltete M2- oder vollständige Windows-Abnahme. |

Reihenfolge: zuerst P0-Verbindungs- und Startkette mit reproduzierbarer
Zielhostdiagnose, dann die langsamen revisionsgebundenen Aktionen, dann
Fastweg nur mit ausdrücklich geklärter Aussagekraft des Freigabestatus.
Ein neuer Release wird erst aus einem erneut verifizierten, unveränderten
Quellstand und den jeweiligen Zielhost-Gates abgeleitet.

[Quellcodeketten, unabhängige Revalidierung und Grenzen dieser Runde](../acceptance/POST_RC162_BATCH_IPC_FOLDER_REVIEW_20261017.md).

**P0 – M2/macOS 26.2: Core-Absturz vor Ready (RC161 ZIP und DMG):**
Desktop-Diagnosen belegen 16 erfolgreiche Prozessstarts mit anschließendem
Signal 5 innerhalb von ungefähr 35–75 ms; kein Sidecar-Ready. Die
Datei-/Ordnerauswahl ist dadurch gesperrt. Spätere lokale Existenzprüfungen
beheben das nicht. Prozess-ID, Bootstrap-Dauer, macOS-Version und nur die
An-/Abwesenheit des Quarantäne-Merkmals werden im unveröffentlichten
Entwicklungsstand zusätzlich inhaltsfrei protokolliert.
Der feste SIGTRAP-Code wird im UI erklärt; die automatische Wiederholung
hält beim ersten solchen Fehler an. Offen: eindeutige Absturzursache,
gestufter Core-Preflight ohne Dokumentzugriff, heruntergeladenes Paket nach Finder-Kopie auf
dem M2 prüfen sowie Apple-konforme Signierung/Notarisierung für reguläre
Verteilung. Keinen Mac-Stand als funktionsfähig ausgeben, bevor der Zielhost
Core-Ready und Dateidialoge mit synthetischen Daten belegt.
[Evidenz](../acceptance/RC161_M2_CORE_START_SIGTRAP_20261016.md).

**P1 – Mehrperspektiven-Review nach RC161 (nur lokaler Quellstand):**
Laufwechsel mit ungespeichertem Entwurf nach Verbindungsabbruch, Anzeige von
`completed_without_results`, alte kanonische Textabschnitte, wiederholte
Journal-Lesung beim Export und zu spät erkannte Ergebnisordner-Volumes sind
korrigiert. Inhaltsfreie Startup-/Recovery-Zeitmessung ergänzt die Diagnose,
ohne den sicherheitsrelevanten Capture vor Retention asynchron zu machen.
[Reviewbeleg](../acceptance/RC161_LOCAL_MULTIDIMENSION_REVIEW_20261016.md).
Offen: 115-/200-Dateien-Zeitprofil auf neuem Stand, kontrollierte langsame
Volumes und Absturzpunkte bei 1/mittlerer/letzter Datei, bediente Windows-
Probe, verwalteter M2-Finder-Weg und reguläre Apple-Codeplatzierung/
Developer-ID-/Notarisierung. Quellsuite bestanden; ein neues Paketgate offen;
kein neuer Pre-Release.

**P1 – weitere lokale Rückmelde-/Diagnoserunde, nicht veröffentlicht:**
Ausdrückliche Ergebnis-Nachholung liefert `available`, `pending`,
`not_attempted` oder `failed` nur für den angeforderten Lauf; die Oberfläche
erklärt den Unterschied, ohne eine weitere Kopie oder einen zweiten Lauf
automatisch zu starten. Geöffnete Verlaufsdetails erscheinen nach einem
Statuswechsel nicht mehr leer. Der KI-Exportdialog zeigt verstrichene
Wartezeit, aber keinen erfundenen Kopierfortschritt. OCR-Doppelwerte haben
für Tastatur-/Screenreader-Bedienung den jeweiligen Dokument-/Fundstellen-
Kontext im Namen. Frühe Mac-Startlogs unterscheiden drei gebündelte
Komponenten ohne Pfade. Vollständige lokale Standalone-Suite einschließlich
Rust bestanden; `r6`-Paketinventar, isolierter synthetischer Paket-Smoke und
nativer Windows-Start mit Core-/IPC-Bereitschaft bestanden. Das Archiv ist
unter `dist/engineering-rc161-local-20261016-r6/` unveröffentlicht, SHA-256
`7f2cde39b132a772737b029fc621ab81db4317483094b6aff19c67aae9916f57`.
Ein bedienter 115-Dateien-Langexport und der echte M2-Test bleiben offen.
Der M2-Ursprungsfehler ist nicht nachträglich bewiesen. Weder RC161 noch
das ältere lokale `r5`-Archiv enthalten diese Korrekturrunde.

**P1 – Exportverständlichkeit und Dateinamenwahl nach RC161 (lokaler Quellstand,
nicht veröffentlicht):** Die bestätigte KI-Kopie führte bisher mit weiterhin
angehakten Dateien zur selben Exportaktion zurück und konnte dadurch wie ein
zweiter notwendiger Schritt wirken. Nach bestätigtem Beleg bleibt die
Erfolgsmeldung sichtbar, die Auswahl wird aufgehoben und der Knopf heißt
„Weitere KI-Kopie erstellen“; eine weitere Kopie erfordert neue ausdrückliche
Auswahl. Die frühere Wahl zwischen neutralen
Ergebnisdateinamen (Standard) und Originalname mit „-anonymisiert“ ist für
*neue Anonymisierungsläufe* wieder sichtbar. Sie ändert keinen bestehenden
Lauf und nicht die bewusst stets neutral benannte KI-Kopie. Während des
Kopierens nennt die Oberfläche Anzahl und mögliche mehrminütige Dauer,
ohne einen Dateifortschritt vorzutäuschen. Frontendtests grün; native
Bedienprobe des neuen Standes offen. Zeitlich passendes lokales
Sidecarprotokoll: Exportvorschau 8,9 s, Kopierantwort 158,1 s für den ersten
gemeldeten 115-Dateien-Export; eine zweite, gesondert angeforderte Kopie
dauerte 148,9 s. Während der Kopien erreichten keine Statusanfragen den
Sidecar. Der Desktop hält den lokalen IPC-Kanal exklusiv; seine 120-s-
Statusabfrage kann daher vor einer erfolgreichen Kopie als
`STANDALONE_IPC_TIMEOUT` enden. Hintergrund-Polling wird im
Dokumentprüfstand während lokaler Aktionen nun ausgesetzt; eine zuvor
gestartete Statusantwort löst währenddessen keinen falschen Fehlerbanner
aus. Phasenmessung und sichere Beschleunigung bleiben offen; ein neuer
Kopierversuch ist nicht nötig.
Ein erfolgreicher erneuter Statusabruf ersetzt im lokalen Quellstand außerdem
einen überholten Verbindungs-/IPC-Fehlerhinweis durch die präzise Aussage,
dass nur Verbindung und Laufstatus wieder erreichbar sind. Der vorherige
Befehl wird nicht wiederholt und muss weiterhin anhand von Verlauf und
gespeichertem Beleg abgeglichen werden. Andere fachliche Fehler bleiben
sichtbar. Das ist in RC161 noch nicht enthalten.

**P1 – lokaler Review-/Diagnosestand nach RC161, nicht veröffentlicht:**
Eine Freigabe von Dokumentständen, die in der aktuellen Prüfsitzung nicht
geöffnet wurden, verlangt nun eine zweite ausdrückliche Bestätigung mit
Anzahl und Hinweis auf die eigene Sichtprüfung. Auswahl und Revision werden
vor dem Speichern erneut abgeglichen; das ist kein Nachweis, dass ein Mensch
den Text tatsächlich gelesen hat. Die KI-Exportvorschau nennt jetzt auch die
Gesamtzahl der Quellen und die nicht verfügbaren Prüfstände samt OCR-/
Datenschutzgründen. Historische Exportbelege behaupten erst nach dem
gesonderten Öffnen eine aktuelle Ordnerverfügbarkeit. Ein aktiver Kopierdialog
lässt sich nicht mehr durch „Schließen“ oder Esc verstecken. Der Sidecar
protokolliert begrenzte, inhaltsfreie Checkpoints für native Staging-,
Publish-, Reconcile- und ACK-Phasen. Die lange Kopierdauer ist damit erst in
einem **neuen** Lauf lokalisierbar, nicht rückwirkend bewiesen. Die
sicherheitsrelevanten fsync-/Identitätsprüfungen und die 120-s-Grenze für
normale Statusabfragen bleiben unverändert. Frontend-Tests bestanden;
native Bedien-/Dauermessung dieses Quellstandes und M2-Test stehen aus.
Die komplette Quellsuite und ein isolierter Windows-Paket-Smoke sind grün;
das unveröffentlichte Engineering-ZIP `engineering-rc161-local-20261016-r2`
bestand zusätzlich den nativen App-/Workspace-/Core-/IPC-Start. Die
interaktive Prüfung der neuen Bestätigungsoberfläche, ein 115-Dateien-
Zeitprofil mit den neuen Phasenlogs und die M2-Zielhostprobe fehlen noch.
Der Tauri-Build überwacht das außerhalb des Cargo-Pakets eingebettete
Frontend nun ausdrücklich; zuvor konnte ein erneut gepacktes ZIP trotz
UI-Quelländerung dieselben alten Binary-Bytes enthalten. Eine reine
Frontend-Änderung führte danach nachweislich zu einem neuen Native-Binary.
Der frische lokale Windows-Testkandidat `engineering-rc161-local-20261016-r5`
bestand Paket-Inventar, nativen Workspace-/Review-/Core-/IPC-Start und
den vollständigen isolierten synthetischen Paket-Smoke (beide OCR-Varianten,
Anonymisierung, Freigabe, Export, Neustart und Verlauf). Die bediente
Zielhost-/Langexportmessung bleibt ein separates Gate; ältere `r3`/`r4`-
Archive sind kein aktueller UI-Stand.

**P1 – KI-Export vor Elternbindung (lokaler Quellstand, nicht veröffentlicht):**
Ein gespeicherter Export-Intent ohne private Elternbindung konnte bisher
`AI_EXPORT_UNCERTAIN` melden, aber die ausdrückliche Aufgabe nicht mehr
ausführen. Die native Aufgabe prüft nun unter dem privaten Kontroll-Lock die
exakte Anfrage, das Fehlen der Bindung und des öffentlichen Exportordners;
sie setzt einen dauerhaften Aufgegeben-Marker statt eine Teilkopie zu
löschen. Ein gespeicherter JS-Abschluss, vorhandener Zielordner oder
widersprüchliche Belege blockieren die Aufgabe. Native und gekoppelte
Node/Rust-Tests grün. Das lokal gebaute Windows-ZIP bestand native
App-/Core-/IPC-Start- und synthetische Paketfunktionstests; ein bedienter
Windows-Abbruchtest und M2-Zielhostbeleg sind offen. Andere
Teilkopie-/Verbindungsabbruchfälle bleiben gesonderte Gates.

**P1 – OCR-Kontaktprüfung/Startzeit nach RC161 (lokaler Quellstand, nicht
veröffentlicht):** Exakt gleiche OCR-Lesarten können einen getippten
Korrekturvorschlag per ausdrücklichem Klick erhalten; jede Fundstelle bleibt
einzeln offen, andere Typen, bereits bearbeitete Zeilen und Entscheidungen
bleiben unberührt. Vor der Startup-Retention wird nur noch die nötige
dauerhafte Verlaufs-/Exportbindung aufgenommen, nicht die gesamte UI-Liste
projiziert. Die Anzeige bleibt bei 20 jüngsten Läufen und wird erst beim
Öffnen von „Verlauf“ ohne Ergebnisdatei-Kopie geladen. Start und regelmäßiges Polling lösen keine Exportnachholung
mehr aus; nur „Bereitstellung erneut prüfen“ versucht sie für den gewählten
Lauf. Während dieser expliziten Prüfung pausieren Hintergrundstatus und
erneute Verlaufsabfragen auf dem exklusiven IPC-Kanal. Echte Lazy-History
erst nach Zielhost-Messung entscheiden; fünf Zeilen
allein beschleunigen den Core-Start
nicht. Gesamte lokale Standalone-Quellsuite, natives Windows-Startgate und
synthetische Paketfunktionstests grün; Bedien-/Zeitmessung auf Windows und
Mac für diesen neuen Stand noch offen.

**P0 – RC161-Zielhostprobe:** Das [Test-Pre-Release RC161](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc161)
ist aus `f96c9e2` nach grünen CI-, Security- und nativen ARM26-/Intel-Gates
veröffentlicht. Auf dem verwalteten M2/macOS 26.2 ZIP oder DMG über den
ursprünglichen Finder-/Benutzerordner-Weg mit **synthetischen** Daten prüfen:
App-/Core-Verbindung, Datei-/Ordnerdialog, Ergebnisordner, kleine Konvertierung,
Anonymisierung und Diagnosepaar. Sichtbare Build-ID und bei Fehlern beide
inhaltsfreien Logarten erfassen. Kein Gatekeeper-/Endpoint-Bypass. Der M2-Befund
und die Apple-Codeplatzierung/Developer-ID-/Notarisierung vor regulärer
Mac-Auslieferung bleiben offen; Runner-Erfolg ist keine Zielhost-Abnahme.
Das Windows-x64-ZIP aus demselben Releasecommit hat einen grünen nativen
[Paket-/App-/Core-Gate-Lauf 38864871810](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38864871810),
erfordert aber ebenfalls einen bedienten Zielhostlauf. Der unveränderte
RC160-Testkorpus mit 100 synthetischen Eingaben und Prüfsumme liegt nun auch auf der RC161-Release-Seite; für beide
Plattformen zunächst nur wenige kleine Quellen daraus wählen.

**P0 – Supervisor-Fehler 121 auf macOS 26 (CI behoben, Zielhost offen):** Der erste aktuelle Gate-Lauf
`38786961975` stoppte vor dem App-Bau im nativen Kurzprozess-Test. Phasen-
und numerische Errno-Diagnose, `setpgid`-Race-Korrektur und 300-Fälle-Test
sind auf dem Entwicklungsbranch. Der zweite Gate-Lauf `38787926269`
bestand den Kurzprozess-Test, scheiterte aber nach 64 erfolgreichen
Konvertierungsgruppen an einem erneuten, bislang nicht phasenzugeordneten
121 während der echten isolierten Konvertierung; kein Paket wurde gebaut.
Der synthetische Test gibt im Fehlerfall nun nur die feste Supervisor-Phase
und ggf. numerisches Errno aus. Beim nächsten 121 die Phase ursächlich beheben,
keine RSS-/Prozessgruppenüberwachung für ein grünes Gate abschalten.
Auch nach grünem Runner bleiben Finder-Quarantäne und verwalteter M2 offen.
Der Folgelauf `38789969916` belegte `parent-process-group errno=1` (`EPERM`)
beim 19. Kurzprozess. Der redundante Eltern-`setpgid` ist nun durch ein
begrenztes Kind-vor-`exec`-Handshake ersetzt; RSS- und Gruppen-Reaping-
Schutz bleiben bestehen. Linux-C-Build und 300 Kurzprozesse bestanden.
Das erneute [macOS-26-ARM-Paketgate 38790860955](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38790860955)
auf `1ea56ab` bestand vollständig, einschließlich 300 nativer Kurzprozesse,
isolierter Konvertierung/OCR, App-/Core-Start, regulärem Benutzerprofil,
ZIP-/DMG- und Paketkonvertierungsnachweis. Das Engineering-Paket ist nur
bis 16.10.2026, 19:26 UTC als Actions-Artefakt verfügbar. Zielhost-Neuprobe
und Finder-/Quarantäne-/MDM-Nachweis bleiben offen.

**P0 – M2-Neuprobe nach Quellreview:** Drei übermittelte Desktoplogs enthalten
je 16 fehlgeschlagene IPC-Antworten. Quellfehler: automatisches
Fünf-Sekunden-Retry verbrauchte die 16 sicheren Core-Besitzergenerationen
und sperrte dann auch die manuelle Prüfung. Automatische Fehlstarts sind im
Quellstand nach zwei Versuchen angehalten; ein ausdrücklich ausgelöster
Statusversuch bleibt möglich, Lauf-/Exportaktionen werden nicht wiederholt.
Exit-/Signal-/Mac-Architekturcodes, Sidecar-Logstatus, CI-Build-ID und
linkfrei-exklusive Startdiagnose ergänzen den nächsten Diagnosebeleg.
Lokale Tests und damaliges macOS-26-ARM-Engineering-Paket grün; das
veröffentlichte RC161-Testpaket ersetzt dieses eintägige Artefakt.
**M2-/Finder-/MDM-Test noch offen**.
Beim nächsten echten Test nur synthetische Quellen verwenden, Build-ID
ablesen und beide Diagnosearten sichern. Keine Schutzrichtlinie abschalten.

**P1 – Mac-Codeplatzierung vor regulärer Verteilung:** Conversion-Node,
POSIX-Supervisor und Canvas-Addon liegen in `Contents/Resources`. Apple
weist ausführbaren Mach-O-Code `Contents/MacOS` bzw. `Frameworks` zu;
Manifest-/Resolver-/Signatur-/Paketverträge müssen gemeinsam migriert
werden, bevor Developer-ID-/Notarisierungs- und Browser-/Finder-Gates eine
reguläre Auslieferung belegen können. Die konvertierungsbezogene Platzierung
erklärt den früheren Startabbruch **nicht** nachweislich. Eigenständiges
Paket-/Signatur-/Quarantine-Gate und reale M2-/IT-Prüfung offen.

**P0 – macOS 26.2/M2 Start und Diagnose:** ARM-DMG und ZIP zeigen nach dem
Start die Oberfläche, aber keinen lokalen Dienst. Drei Desktop-Logs enden
nach `sidecar_spawned` mit `STANDALONE_IPC_FAILED`; das fehlende Sidecar-Log
ist selbst eine Diagnoselücke. Quellstand: frühe Sidecar-Phasen und begrenzter
nativer Exit-/Signalbefund, Picker- und UI-Blockgründe sowie Status des
nativen Diagnose-Sinks ergänzt. Lokale Tests und macOS-26-ARM-CI-Gate sind
grün; danach erneuter Nicht-Admin-M2-Test mit dem RC161-DMG
oder -ZIP (nicht beide gleichzeitig), mit regulärem Benutzerprofil,
Dateidialogen, Konvertierung, Ergebnisablage und
vollständigem inhaltsfreiem Diagnosepaar. Bei fortbestehendem Fehler den
festen Abbruchcode und gegebenenfalls die von IT freigegebene
Endpoint-Security-/Gatekeeper-Diagnose auswerten, ohne Richtlinien zu umgehen.
Ein grüner synthetischer CI-Start allein hätte keine Zielhost-Freigabe begründet.
Die Mac-Projektion muss im DMG für fremde Installations-Eigentümer lesbar
und ausführbar sein (Quellkorrektur + natives Modus-Gate ergänzt). Der Nutzer
kopierte aber in den eigenen Ordner, sodass diese Lücke den gemeldeten
Abbruch nicht belegt. Unabhängig davon waren gebündelter Mac-Core-Pfad und
`RUNTIME-EVIDENCE.json`-Pfad in der Laufzeitprüfung inkonsistent. Die
gekoppelte Quellkorrektur ist implementiert und im signierten Paket nativ
bestätigt; der verwaltete M2-Zielhost bleibt separat zu prüfen.
Erster macOS-26-ARM-CI-Lauf [38765209776](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38765209776)
scheiterte vor dem Paketbau im realen Konverter-Gate nach 64 erfolgreichen
Fällen an `CONVERSION_ISOLATION_FAILED` beim schnellen Wiederverwenden.
POSIX-Exit-/RSS-Rennbedingung quellenmäßig begrenzt korrigiert und der
Supervisor-Exit für einen Wiederholungsfehler testseitig sichtbar gemacht;
beides nativ erneut prüfen, dann erst Bundle- und regulären Start erreichen.
Die zweite native Wiederholung [38767569572](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38767569572)
stoppte bereits im erweiterten Supervisor-Kurzprozess-Test: der bisherige
Argumentzähler wies ein Programm ohne Zusatzargument mit Exit 120 ab.
`argc` ist auf die tatsächlichen acht festen Argumente plus Programm korrigiert;
Der dritte macOS-26-ARM-Lauf [38768282220](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38768282220)
bestand daraufhin Konverter, App-/Core-Start, regulären LaunchServices-Start,
ZIP und DMG. Der signierte Core ist nachweislich **nicht** bytegleich mit
dem Roh-Node. Die gekoppelte Laufzeit-Integritätskorrektur (Mac-Core-Pfad,
signierter In-App-Beleg, äußere Nachsignierung und DMG-Neubau) ist im
Quellstand. Das [macOS-26-ARM-Paketgate 38773313665](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/38773313665)
ist vollständig grün, inklusive verpflichtender Hashprüfung am laufenden
signierten Core, regulärem LaunchServices-Start, ZIP und DMG. Das
zeitlich begrenzte Engineering-Artefakt gehört exakt zu `26bc50c`; die
M2-/MDM-Bedienprobe und eine neue plattformübergreifende Freigabe stehen aus.

**RC160-Bereitstellung:** Der Test-Pre-Release ist an
`b5d52c550ead3fb4cea5acc9e9774de9863db32c` gebunden. CI,
vollständige Security und die drei nativen Paketgates sind grün;
[Download, Hashes und Grenzen](../RELEASE.md#rc160--standalone-test-pre-release-windows-und-macos).
Offen bleiben die menschliche Bedien-/Barrierefreiheitsabnahme, der
reproduzierbare Teilkopie-/Dauerblockade-Gegenfall und die erneute
Gesamtabnahme durch den Nutzer. Historische Zwischenstände darunter sind
keine zusätzliche Freigabe. Der bereits getestete Markdown-only-Weg wurde
funktional nicht geändert.

**BL-UX-Prüfwege – Quellstand umgesetzt, Bedienabnahme offen:** OCR-Kontaktwerte
werden im Hauptweg verglichen, ausgewählt, vorgemerkt und erst danach
gespeichert; „Vormerkung rückgängig“ ist optional aufgeklappt. Die
anonymisierte Dokumentprüfung stellt Vergleich und Freigabe in den Vordergrund.
Vertrauliche Zuordnung, Freigabewiderruf und zusätzliche
Text-/Entitäteneingriffe sind optional
aufklappbar. „Zusätzliche Maskierung vorbereiten“ und
„Basisstand-Wiederherstellung vorbereiten“ schreiben nicht beim ersten Klick;
erst eine gesonderte Bestätigung schreibt, Abbrechen nicht. Danach muss der
betroffene Stand erneut verglichen und freigegeben werden. Frontend- und
synthetische Browsertests bestanden. Die RC160-Paketierung ist abgeschlossen;
natives Windows-Bedientesting und Nutzerabnahme bleiben offen. Markdown-only
funktional nicht verändern.

**Nachtrag zum 133-Quellen-Lauf:** Nach der folgenden ursprünglichen Diagnose
zeigte der Nutzer eine „Export fertig“-Meldung für 132 Dateien. Der damalige
fehlende Exportbeleg ist ein Vor-Export-Befund; den späteren gespeicherten
Abschlussbeleg und die erzeugten Inhalte separat prüfen.

**P1 – 133-Quellen-Nutzerlauf nach Freigabe/Preview:** 132 private
Dokumentstände und 132 Freigabeentscheidungen sind belegt, ein
Datenschutz-Prüfstopp ist getrennt ausgewiesen. Es gibt keinen
Exportauftrag und keinen Abschlussbeleg. Zwei read-only Exportvorschauen
blieben vor Verbindungsabbruch ohne Antwort. Quellfix: Commit-Kette je
Auswahl nur einmal validieren (Vorschau und Export), Rust-Vorschauzeitpuffer
an den Export anpassen, und die Statusachsen Verarbeitung/Freigabe/Kopie
sichtbar trennen. Nach Verbindungsabbruch keine leere, gesperrte
Dokumentansicht über dem Verlauf stehen lassen. Quelltests und ein
synthetischer 132-Dateien-Lasttest bestanden; die vollständige Quellsuite
endete Exit 0. Der separate unveröffentlichte r37-Windows-Kandidat bestand
Paketverifier, isolierten Sidecar-Smoke und nativen Fenster-/IPC-Start.
Interaktive Bedienung des 132-Dateien-Falls und bestätigter Export nach
Vorschau bleiben offen. Die aktuell installierte r160-Version enthält diese
Korrekturen noch nicht. Einen Export-Erfolg niemals ohne Abschlussbeleg
anzeigen. Paketpfad und SHA-256 stehen in CURRENT_STATE.

**BL-010.53.9 – r36-Abgleichstatus:** Bei unterbrochener Sidecar-Verbindung
liest das Hauptfenster die native Prozess-Abgleichphase ohne Sidecar und bietet
„Verbindung und Laufstatus prüfen“ neben der stets erreichbaren Diagnose.
Die Abfrage ist lesend; sie startet und bestätigt nichts. Auch wenn der
Ersatzdienst fehlt oder verweigert wird, bleiben beide Auswege sichtbar.
Gezielte Workspace-Regression 86/0, vollständige Standalone-Quellsuite
Exit 0 mit 120/0 Rusttests; r36-ZIP und Hash in CURRENT_STATE. Isolierter
Paket-Sidecar-Smoke beider Wege und nativer Windows-Start/IPC bestanden.
Interaktive r36-Bedienung sowie echter Teilkopie-/Dauerblockadefall sind separat
offen. Ein nicht sicher beendbarer Prozess darf weiterhin weder manuell
freigegeben noch durch einen zweiten Lauf überholt werden.

**BL-010.53.9 – r35-Fehlerführung:** Nach Verbindungsabbruch oder
fehlgeschlagenem Verlaufsabruf verschwinden alte anklickbare Laufaktionen;
der alte Fortschritt wird als unbestätigt bezeichnet, die native Diagnose
bleibt erreichbar. Ein frischer Abruf stellt die Aktionen wieder her, aber
kein Status wird künstlich beendet. Drei gezielte neue Übergangstests sowie
die übrige Standalone-Suite bestanden. r35-Windows-ZIP: Verifier und
isolierter Paket-Sidecar-Smoke beider Wege grün. Ein nativer isolierter
Windows-Lauf mit einer rein synthetischen MD-Datei wurde technisch fertig;
nach gezieltem Stopp **nur** seines zugehörigen Sidecars verschwanden die
Altaktionen während der Verbindungslücke, die Diagnose blieb erreichbar,
und nach Wiederverbindung zeigte der Verlauf denselben einen Lauf ohne
automatischen Neustart. Weiter offen sind ein echter nativer
Teilkopie-/Wiederaufnahme-/Verzichtstest und die Frage,
ob ein dauerhaft nicht sicher beendbarer Prozess nur mit Diagnose/Support
behandelbar bleibt. Beleg und SHA-256 in CURRENT_STATE/Aufgabe 7.

**BL-010.53.11 – r34-Fortschritt:** Das verifizierte, unveröffentlichte
r34-Windows-Archiv bestand den isolierten Paket-Sidecar-Smoke beider Wege.
Eine native Anonymisierungsprobe ohne OCR über elf ausschließlich
synthetische Quellen aller angebotenen Endungen erzeugte sieben private
Prüfstände und meldete vier erwartete Bild-/Scan-Auslassungen als Hinweise,
null technische Fehler. Für ein MD-Dokument wurden Original und
anonymisierter Stand verglichen, die erste Freigabe und neutrale Kopie
erzeugt, eine gezielte Zusatzmaskierung gespeichert und der automatische
Freigabeentzug beobachtet. Nach erneuter Freigabe entstand eine zweite
neutrale Kopie; die erste blieb bytegleich. Exportordnerwahl in der ersten
Vorschau kopierte nichts von selbst. Nach Neustart lud der Verlauf korrekt
1/7 aktuelle Freigaben und zwei abgeschlossene Exportbelege; die neutrale
Erstanzeige führte nicht mehr fälschlich zu einer offenen Freigabebehauptung.
**Noch offen:** native Teilkopie/Wiederaufnahme/Exportverzicht-Fehlerfälle,
Mac-Zielhost, sechs automatische native Formfälle und breitere
Inhaltsqualität. SHA-256 und Grenzen in CURRENT_STATE/Aufgabe 8.

**BL-010.53.11 – r33-Fortschritt:** Der native isolierte Windows-Lauf des
unveröffentlichten r33-Archivs verarbeitete elf synthetische Dateien über
alle zehn angebotenen Endungen, darunter Text- und Scan-PDF, mit OCR und
Anonymisierung. Acht OCR-Kontaktwerte in vier Raster-/Scan-Dateien wurden
bewusst bestätigt, 11/11 private Stände freigegeben und danach 11 neutrale
Markdown-Dateien exportiert. Neustart zeigte die gespeicherten Freigaben
und den Exportbeleg in der gesondert geladenen Verlaufszusammenfassung.
Paketverifier, Sidecar-Smoke beider Hauptwege und Standalone-Quellsuite
bestanden. **Noch offen:** echte Ohne-OCR-/Korrektur-/Fehlerpfade, Mac-
Zielhost und der allgemeine Qualitätsnachweis. Der native Verlauf sollte
vor dem Laden des Prüfstatus nicht suggerieren, eine bereits gespeicherte
Freigabe stehe noch aus; die Erstauswahl des Ergebnisordners muss vor dem
Export möglich sein. Beides ist nun im lokalen Quellstand umgesetzt und
gezielt regressionsgeprüft; native Bedien- und Paketprüfung dieser UX folgen.
Ein unabhängiges Fachreview der Ordnerwahl entdeckte und beseitigte eine
versteckte Rückmeldung sowie einen nach Export verbleibenden Button; die
native r34-Bedienprobe der korrigierten UI ist oben dokumentiert.
Einzelheiten und SHA-256 in CURRENT_STATE/Aufgabe 8.

**BL-010.53.10 – Anonymisierungsanzeigen am echten Ergebnisstand binden:**
Fortschritt r25: 115 private Prüfstände öffneten in der nativen Windows-EXE
ohne Verbindungsabbruch; ein synthetisches Dokument war lesbar vergleichbar.
Dabei zeigte die Prüfseite alle 18 Stopps noch falsch als technische Fehler.
Der r26-Quellschnitt ergänzt die in der echten Service-Verdrahtung fehlende
Laufzustandsquelle für die bereits getestete exakte Gruppierung. ZIP-Build,
Verifier, isolierter Paket-Smoke und 45/0 gezielte Dokumenttests bestehen;
die vollständige Standalone-Quellsuite ist ebenfalls grün. Erneute native r26-
Bedienabnahme und vollständiger Nutzerablauf bleiben offen.
Der r21-Windows-Wiederanlauf stellte den früher unterbrochenen synthetischen
133-Dateien-Lauf wieder her: 115 sichtbare Ergebnisse samt privatem Beleg,
17 OCR-aus-Auslassungen und ein Datenschutz-Prüfstopp. In der Dokumentprüfung erschien trotzdem eine
unbestätigte Laufabschlussmeldung; der Verlauf stellte die 18 ausgelassenen
Quellen als „Probleme“ dar. Lokaler Quellschnitt: Abschlussanzeige nur bei
vollständigem, passendem Ergebnisbeleg; erwartete OCR-aus-Stopps in der
Dokumentprüfung und im Verlauf als Hinweise; technische Fehler getrennt.
Gezielte Tests und r22-Verlauf nativ grün. Der r22-Dokumentprüfabruf lief bei
115 privaten Ständen in `STANDALONE_IPC_TIMEOUT` (Liste allein ca. 24 s).
Der Folgequellschnitt erweitert nur diesen Abruf auf eine begrenzte 300-s-
Frist und trennt `AMBIGUITY_REVIEW_REQUIRED` als Datenschutz-Prüfstopp.
**Offen:** neues Paket, native Prüfstand-Gegenprobe, weitere
Anonymisierungs-/Freigabe-/KI-Export-Bedienung und Qualitätsabnahme.

**BL-010.53.9 – Technischer Lauf bleibt bedienbar:** Quellfortschritt 15.10.:
Ein dauerhaftes, inhaltsfreies Aufgeben eines unvollständigen sichtbaren
Anonymisierungsexports ist unter demselben Export-Claim implementiert. Der
Beleg bindet den genauen Lauf, Exportplan, bereits kopierte und offene Anzahlen;
beide Wiederholungspfade stoppen vor weiterer Dateikopie. Die App verlangt
eine ausdrückliche Bestätigung und zeigt danach „Bereitstellung aufgegeben“
statt „fertig“. Synthetischer Lost-ACK-/Neustart-Test, aktive-Worker-Verweigerung,
Verlauf und UI-Bestätigung bestanden; auch ein Abbruch vor der ersten
sichtbaren Exportplanung ist regressionsgebunden. Das unveröffentlichte
r28-Windows-ZIP ist verifiziert und hat den isolierten Paket-Sidecar-Smoke
beider Wege bestanden (SHA-256 in CURRENT_STATE). Native Fenster-/
Verbindungsausfall-Gegenproben bleiben offen. Synthetische Quellgegenproben
für eine bereits sichtbare Teilkopie und einen später geänderten Ergebnisordner
bestanden; die entsprechenden nativen Bedienfälle sind weiter offen. Ein
r28-Nativstart scheiterte in der Test-Harness-Identitätsprüfung eines
Paketpfads über `MAX_PATH`, bevor ein positiver App-Start belegt war. Der
korrigierte No-Follow-Langpfadleser und neun Cleanup-Gruppen bestehen. Der
erneute r28-Lauf lud Haupt- und Prüfseite samt erfolgreicher IPC in einem
isolierten Profil und bereinigte 1544 Einträge; ohne Klicks oder
Prüfentscheidungen ist das keine Bedienabnahme. Der native r20-Test des
gespeicherten 133-Dateien-Laufs scheiterte bereits beim ersten Statusabruf:
rund 27 Sekunden Sidecar-Start verbrauchten fast das gemeinsame 30-Sekunden-
Fenster; die sichere Wiederverbindung blieb danach gesperrt. Bootstrap und
Anfrage erhalten lokal getrennte begrenzte Zeitfenster; die r21-Windows-
Gegenprobe brachte den gespeicherten Lauf samt Ergebnisbeleg tatsächlich
wieder. Zusätzlich braucht der Nutzer bei einem dauerhaft
unvollständigen Lauf zwei **getrennte**, sichtbare Wege: den gespeicherten
Ergebnisexport sicher wiederaufnehmen, oder den Lauf ausdrücklich **ohne
Export** aufgeben. Aufgabe 7 im RC160-Arbeitsauftrag spezifiziert Bestätigung,
Belege, Datenverbleib, Neustart und konkurrierende Fenster. Kein Button darf
fehlende Kopien als fertig markieren, Sperren blind entfernen oder stille
Duplikatläufe starten. **Für echte Dauerfehler weiter offen.**

**BL-010.53.11 – Vollständige Anonymisierungs-Bedienabnahme über die
angebotenen Formate:** Das r26-Paket und der isolierte Smoke belegen
Konvertierung, OCR, Prüfung und Export anhand synthetischer Teilmengen;
die 133er-Gegenprobe ohne OCR belegt 115 echte Prüfstände sowie 17 erwartete
OCR-aus-Auslassungen und einen Datenschutz-Stopp. Noch erforderlich sind
eine native Windows-Gegenprobe des r26-Hinweis-Fixes, ein eigener
Anonymisierungslauf mit OCR über TXT, MD, CSV, DOCX, XLSX, PPTX, PDF, PNG,
JPEG und BMP, gezielte Einzelprüfung/Korrektur und KI-Export nur ausdrücklich
freigegebener synthetischer Stände. Jeder sichtbare Befund erhält Format,
Einstellung, Ergebnis und sicheren nächsten Schritt; keine universelle
OCR- oder Anonymitätsgarantie und kein Mac-Bedienbeleg ohne echten Mac.
Neuer r29-Teilbeleg: Der paketierte Vierformatlauf mit OCR (PNG, JPEG, BMP,
Scan-PDF) fand zunächst im r28-Paket eine unbeschriftete, nicht maskierte
Namenszeile. Die OCR-gebundene Zweiwort-Zeile wird nun zur menschlichen
Fundstellenentscheidung gestellt. r29-Verifier und isolierter Sidecar-Smoke
sind grün: vier neutrale Markdown-Dateien nach Entscheidung, synthetische
Identitäten entfernt, Sachtext erhalten, keine automatische Freigabe;
Markdown-only ohne/mit OCR blieb grün. Native Bedienung, Gesamtformatlauf,
bewusste Freigabe und KI-Export sind damit **nicht** ersetzt. Ergänzend
bestand ein echter isolierter r29-Windows-Klicklauf mit einer synthetischen
TXT-Datei bis zur gespeicherten Freigabe und einer neutralen KI-Kopie.
Der erste Exportversuch stoppte mit `AI_EXPORT_CONFIGURATION_REQUIRED`;
erneute Auswahl desselben Ergebnisordners erlaubte die Fortsetzung ohne
Neulauf. Für den ersten Export braucht die UI eine unmittelbar verständliche
Ordnerbindungsaktion, statt Anwender erst aus dem Exportdialog zur neuen
Verarbeitung zurückzuschicken. Raster-/Office-Gesamtbedienung und technische
Wiederaufnahme sind dadurch nicht abgenommen.

**RC160-r19-Anwendertest / Wiederaufnahme:** 133 synthetische Eingaben
technisch beendet (115 Ergebnisse, später belegt 17 OCR-aus-Auslassungen plus
ein Datenschutz-Prüfstopp), sichtbarer
Ergebnisexport jedoch unbelegt. r19 verbindet wegen synchroner langer
Exportwiederholung im kurzen Startfenster nicht erneut; Verlauf-Aktionen
„Betroffene Dateien“ und „Dateiliste erneut laden“ bleiben wirkungslos.
Unveröffentlichter r20-Quellschnitt trennt Bootstrap-Projektion von
Exportwiederaufnahme und erweitert nur die begrenzten betroffenen IPC-Aufrufe;
gezielte Regression und Quell-Gesamtsuite einschließlich 118 Rusttests grün.
ZIP-Verifier und isolierter r20-Paket-Sidecar-/Worker-Smoke grün. Native
Wiederaufnahme des gespeicherten 133er-Laufs noch offen.
Kein manuelles Entfernen einer Sperre, kein neuer Duplikatlauf.

**Vorschlag aus dem Anwendertest – optionale laufübergreifende Erkennungsliste:**
Explizit bestätigte Person-/Firmen-Schreibweisen könnten lokal und privat für
spätere Läufe vorgemerkt werden. Vor Umsetzung sind exakte Grenz-/Unicode-
Abgleiche, Namensgleichheit/Fehlklassifikation, Bearbeiten/Löschen, Schutz der
Klarwerte, Zweckerklärung und erneute laufbezogene Freigabe zu spezifizieren.
„Beibehalten“, unbestätigte OCR-Werte und alte Exportfreigaben dürfen keine
stille Autorität für neue Läufe erzeugen. **Noch nicht implementiert.**

**RC160-Anschluss 14.10.2026 – neuer Anonymisierungsweg:** Der bisher
gesperrte `content-v1`-Start ist nun über Workspace/Rust/IPC/Worker,
private Publikation und Mapping bis zur Dokumentfreigabe und zum getrennten
KI-Export verbunden. Exaktes unveröffentlichtes Windows-r19-ZIP: Verifier
und isolierter Sidecar-/Worker-Smoke über neuen Anonymisierungsweg, Review,
Neustart, Auswahl-Export sowie Markdown OCR-aus/-an grün. Ein Verlaufsrennen
beim parallelen Publizieren ist durch reine Journal-Snapshot-Projektion
regressionsgebunden; die erneute Paketsuite besteht. Vollständiger Quell-/Rust-
Gesamteingang dieses Schnitts Exit 0, 118 Windows-Rusttests bestanden,
drei Helper bewusst ignoriert. **Offen:** native Windows-Bedienung
und fachliche Stichproben durch den Anwender, native Mac-Pakete/Bedienung,
breitere Format-/OCR-Qualitätsabnahme. Keine Veröffentlichung und keine
Garantie vollständiger OCR oder Originalcontainer-Anonymität. Der ältere
„neuer Start offen“-Eintrag weiter unten ist Chronologie, nicht aktueller Status.

Commit/Push und Standalone-Vorabpakete für Windows x64, macOS Intel/Apple Silicon
und Linux x64 glibc sind aus `7af2a9d0268864a01b954e0175cae9f5a3616fe8`
abgeschlossen. [RC159-Nachweise](../RELEASE.md#rc159--standalone-auf-allen-zielplattformen)
binden alle nativen Paketgates, CI, vollständige Security und zwölf verifizierte
Releaseassets an denselben Commit. BL-010.53-Prerelease-Bereitstellung erledigt;
keine pauschale Gesamtbedien-/Qualitätsfreigabe. Gerätebedien- und Qualitätsreste
BL-010.47/50/51 sowie die genau benannten v2-Storyreste bleiben getrennt.
Cowork RC151 unverändert. Die folgenden RC158-/RC157-Abschnitte sind Historie.

**RC158-Sicherheitsnachbesserung:** Diagnose- und begrenzte, deskriptorgebundene
Lesegrenzen sind implementiert und gezielt gegen Links, Austausch,
Wachstum und I/O-Fehler geprüft. Zusätzliche Reviewbefunde zu OCR-Cache,
Segmentkollision, Teilwrites, FIFO-Opens und BigInt-Dateiidentität sind ebenfalls
korrigiert. Die frische vollständige lokale Regression (195 Testdateien),
49 Windows-Rusttests mit Clippy und 41 reale Konvertierungsgruppen bestehen.
Die erneute SARIF-Gegenprüfung bestätigte fünf zusätzliche Restlücken;
Status-Buildwriter, Markdown-/Status-/SEA-Reader und Preview-Retention sind
ebenfalls korrigiert. Gezielte tatsächliche Austausch-/ABA-Gegenproben und
zwei unabhängige Abschlussreviews bestehen. Der komplette Produktschnitt
nach diesen zusätzlichen Korrekturen besteht erneut: 76 Basis- und 119 direkte
Testdateien, 49 Windows-Rusttests, warning-free Clippy und Dokumentationsgates.
Der frische strenge Security-Gate mit einzeln gebundener False-Positive-Triage,
Pflicht-CI, sauberer Windows-Doppelbau, beide nativen Mac-ZIP-/DMG-Gates und
die Veröffentlichung bestehen. Keine ganzen Regeln werden
ausgeschaltet; alte Nachweise bleiben auf ihren Schnitt begrenzt.
[Befunde und Releasezustand](../RELEASE.md#rc158--standalone-windows-sowie-macos-zip-und-zusätzlich-dmg).

Die frühere RC157 bindet Quellcommit `111737d28021b6989ffe8d563b58daa9cbae610f`.
Windows, macOS Intel, macOS Apple Silicon und Linux sind nativ geprüft und
als Vorabpakete veröffentlicht; Mac-ZIP bleibt neben dem zusätzlichen DMG erhalten.
Der Windows-Anwenderlauf samt integrierter Prüfung ist ausdrücklich bestanden.
[Releasebindung und Plattformnachweise](../RELEASE.md#rc157--standalone-auf-allen-zielplattformen).
Die unten beschriebenen RC152–157-Zwischenschritte sind Entstehungsgeschichte,
keine weiterhin offenen Fehler; tatsächlich fehlende Spezialabnahmen stehen
separat in Abschnitt B und der Evidence-Matrix.

**In RC158 veröffentlichte Nachbesserung vom 05.10.2026:** DS-106 / BL-010.46 bearbeitet
konkrete neue RC157-Befunde: Unternehmenswahl, laufweite Wiederverwendung
vollständiger Schreibweisen, nicht ladbare Fehlerdateilisten und PDF-Grafik-/
OCR-Artefakte. Der reale Lauf `5e50a0b0` lieferte 9/10 Ergebnisse; ein separater
Restprüfungsfehler über bereits ersetzte Platzhalter ist reproduziert und lokal
korrigiert. Vorherige bestandene Läufe bleiben gültige, begrenzte Evidenz und
werden nicht zu pauschalen Abnahmen dieser neuen Änderungen umgedeutet.
Der Kolleginnen-Komplettausfall ist ohne
ihre Windows-Diagnose noch nicht ursächlich zugeordnet.

**Technischer Gegenreview DS-107 / BL-010.48:** Reale Desktop-IPC-
Unternehmensfreigabe, laufgebundene Prüf-Fehlerzustände, begrenztes IPC und
Schließen ohne RPC-Sperre, konkrete Dateifehler auch bei Zuordnungsschuld
sowie ehrliche Native-Smoke-/Skip-Auswertung sind implementiert. Der neue
Windows-Engineering-Bau lag getrennt von veröffentlichten RC157-Archiven;
die abschließende RC158-Releaseevidence ist oben verlinkt.
Neue macOS-Gerätebedienung, Organisationssignierung und der ungeklärte
Kolleginnen-Ausfall bleiben getrennte Nachweise, keine erneut offenen bereits
abgeschlossenen Funktionstests.

Dies ist die **einzige aktive Arbeitsliste**. Handlungsbedarf entsteht nur aus
den Storytabellen und ihren ausdrücklich genannten Resten. Die nachfolgenden
RC-Abschnitte sind eine kompakte, schreibgeschützte Entscheidungs- und
Evidenzchronologie, keine offenen Aufgaben. Ausführliche historische Aufträge,
erledigte Teilarbeiten und frühere Keyring-/MCPB-Pläne stehen im
[Archiv](../archive/README.md) und in den monatlichen Backlogarchiven.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Eine technisch fertige Story mit
offener Zielsystem- oder Anwenderabnahme bleibt hier als „menschliche Evidenz
offen“ sichtbar, wird aber nicht als weitere Entwicklungsarbeit dargestellt.

Statuslesart: **in Arbeit** bezeichnet ausschließlich noch lieferbare technische
Arbeit. **erledigt** bedeutet, dass die beschriebene E0-Lieferung vollständig
ist; noch fehlende E1/E2/E3-Zielhost-, Anwender- oder Fachevidenz wird getrennt
in Abschnitt B und der Evidence-Matrix geführt. Für BL-010.11–14, 16–18 und 20–33 sind die jeweils
beschriebenen E0-Kernpfade samt automatisierten Windows-/Paketgates umgesetzt.
Neben den benannten Zielhost-, Bedien-, Accessibility-, Performance-, Update-/
Rollback- und Fachevidenzen sind die lokale Auswahlgruppierung, die serverseitige
Statuswahrheit, F7/F17 und der dauerhafte Journalfingerprint E0 geschlossen.
Das unabhängige Astra-Gegenreview vom 12.09.2026 hat vier zusammenhängende
Cowork-Entwicklungsstories (`BL-041.15`–`.18`) hervorgebracht. Ihre E0-Lieferung
ist umgesetzt und durch produktnahe Vertrags- und Regressionstests belegt.
Der zweite Gegenreview öffnete BL-041.17 wegen vier Release-/UAT-Restfehlern
erneut. Der lokale Korrekturblock `ASTRA2-20260912-01`–`04` unten schließt diese
mit zusätzlichen Negativtests und einem echten Offline-Paketintegrationstest.
RC138 bleibt dennoch nicht wiederverwendbar. RC139 hat die strengere Commit-,
Archiv- und UAT-Bindung aus sauberem Quellstand erneut nachgewiesen; damit kann
die menschliche N3/N4-Kampagne vorbereitet werden, nicht als bestanden gelten.
DS-104/BL-010.44 war eine **neue**, zunächst lokal entwickelte Standalone-
Story (in RC157 erledigt und veröffentlicht): Der Nutzer soll den lokalen Review in der Anwendung sehen
und nach automatischem Lauf oder Neustart bewusst fortsetzen können. Der
bisherige externe Review bleibt in RC151 bis zur geprüften Ablösung der Istweg; der
inhaltsfreie Haupt-Renderer und Coworks eigener Adapter bleiben unverändert.
Der erste RC152-Windows-Echtlauf zeigte beim Fortsetzen ein weißes Prüffenster:
Der synchrone Tauri-Fensterbau blockierte WebView2. RC153 erzeugt das Fenster
asynchron und verlangt im isolierten nativen Pakettest sowohl die geladene
Prüfseite als auch den Start ihres Prüfsitzungs-Skripts. Die Fortsetzung des
konkreten Anwenderlaufs und die sichtbare Bedienabnahme bleiben offen.
Der RC153-Anwenderlauf vom 30.09.2026 (`9daa6c66`) erreichte 140/140
anonymisierte Dateien und eine Zuordnung; nach einer weiteren Prüfgruppe blieb
das Prüffenster jedoch mit einem Wartetext offen, obwohl der Verlauf bereits
„Abgeschlossen“ meldete. Lokal ist deshalb die laufende Prüfsitzung um ein
terminales Abschlussbit ergänzt: mehrere Gruppen bleiben im selben Fenster,
nach dem bestätigten Laufabschluss schließt es automatisch, und in der
Warteansicht gibt es einen sicheren Schließen-Button. Die erneute native
Anwenderprüfung dieses geänderten Kandidaten steht noch aus.
Die RC154-Rückmeldung zeigte einen weiteren Bruch: Nach einer entschiedenen
Prüfgruppe kann derselbe Lauf neue Fundstellen melden, die bisher nur über
**Verlauf → Prüfung fortsetzen** startbar waren. Der lokale Nachfolger bindet
die Fortsetzung an den im Prüffenster beantworteten Lauf, zeigt während der
Core-Prüfung einen Wartehinweis und bietet dort **Weitere Prüfung fortsetzen**
an. RC155 bestand die lokalen Standalone-/Dokumentations-/Rust-Tests, den
Windows-Pakettest und den nativen Start mit geladener Prüfseite. RC156 ergänzt
einen sichtbaren Arbeitsindikator, ordnet die Prüfaktion dem Lauf zu und legt
die vertrauliche Identitäts-TXT nur im markierten Lauf-Unterordner ab; es
entfernt den App-Löschweg. Lokaler Paket-/Sidecar-Test und nativer Windows-Start
bestanden. Der Anwender bestätigte den RC156-Windows-Lauf samt Prüfung und
Stapelverarbeitung als bestanden. Der letzte Lauf `ca4349c5` enthält nach
nur lesender Kontrolle 140 Markdown-Ergebnisse, 140 eindeutige
Dateizuordnungen und eine Identitäts-TXT mit Vollständigkeitshinweis 140/140.
RC157 ergänzt **Jetzt prüfen** direkt in der Verarbeiten-Karte des aktuellen
Laufs. Der private Fortsetzungsbefehl verlangt dafür einen verbundenen Lauf;
ein Verbindungsneustart darf keinen historischen Ersatzlauf fortsetzen.
Die direkten UI-/Service-/IPC-Prüfungen, der isolierte Pakettest und der native
Windows-Start mit geladener Prüfseite bestehen für den lokalen RC157-Kandidaten.
Der Anwender bestätigte RC157 anschließend als vollständig bestanden,
einschließlich lokaler Prüfung und Stapelverarbeitung. Der Ergebnislauf
`3d6b69b7` enthält nach nur lesender Kontrolle 140 Markdown-Ergebnisse,
140 Dateizuordnungen und die vertrauliche Identitäts-TXT (140/140 erfasst).
Die Windows-Funktionsabnahme einschließlich Direkteinstieg ist damit nicht
mehr offen; andere Zielhosts und benannte Spezialabnahmen bleiben getrennt.
Abschnitt B enthält ausschließlich menschliche beziehungsweise
zielhostgebundene Evidenz. Die Kompatibilitätsadapter für bestehende Journale
und Exporte bleiben absichtlich erhalten und sind keine zu löschende Altlast.

**RC151-Windows-Funktionsnachweis vom 30.09.2026:** Der vom Anwender auf dem
Windows-Zielhost ausgeführte 140-Dateien-Stapel liegt in beiden Modi vollständig
vor: 140 Markdown-Konvertate, 140 anonymisierte Markdown-Ergebnisse und eine
Zuordnung mit 140 Einträgen. Der gewählte entpackte Paketroot enthielt neben den
133 beabsichtigten Dateien unter `EINGABEN` sieben Begleitdateien. Die
schreibgeschützte Nachprüfung bestätigte Quell-/Manifest-Hashes, die 52 direkt
lesbaren Konvertate bytegleich, 54 erhaltene und 54 entfernte DOCX-Sollstellen,
2168 fachliche CSV-Beschreibungszeilen sowie ausgewählte technische Titel und
synthetische Identitätsanker. Damit sind die bisherigen Aussagen „erneuter
Gesamtlauf ausstehend“ und „auf Windows nicht gelaufen“ überholt. Diese
Beobachtung ist wiederverwendbare **Teil-Evidenz** für N3-05/N3-06 und N4-07,
kein Anlass für einen pauschalen Wiederholungslauf. Die formalen N3/N4-CSV sind
noch nicht ausgefüllte Abnahmeprotokolle: Ihre `NOT_RUN`-Felder beziehen sich
auf den jeweiligen vollständigen, rollen- und paketgebundenen Prüffall, nicht
auf den bereits erfolgten Produkt-Funktionstest. Offene Teilfälle werden in
Abschnitt B getrennt geführt; Mac-/Linux-Bedienung und Cowork werden aus dem
Windows-Lauf nicht abgeleitet.

### RC141 macOS / RC140 übrige Pakete – historische technische Release-Evidence

**Nachreview MAC-20260923:** Die unten belegten RC140-Läufe bleiben historische
Paket-Evidence. BL-010.20 und BL-012.9 wurden erneut geöffnet; der RC141-
Neubau und dauerhafte Veröffentlichung schließen jetzt BL-010.20 technisch. Die
E0-Aussagen der Präambel ersetzen keine neue Auslieferung oder sichtbare UAT.

| Bezug | Befund und aktuelle Lieferung | Rest / Status |
|---|---|---|
| BL-010.20 / MAC-01–03 | RC140-Supervisor verlangt macOS 15 auf Intel und 14 auf ARM statt deklarierter 13.5; Intel-Canvas-Addon ohne eigene Signatur; RC-Suffix in numerischen Plist-Versionsfeldern. In RC141 korrigiert und auf Intel/ARM nativ geprüft, einschließlich LaunchServices und echtem Paketsmoke. Commit `1d5a67d…e542`, Lauf `35875613438`; ZIPs lokal hashgeprüft und unverändert als `v3.2.0-rc141` veröffentlicht. | **erledigt** · E0-Neubau und dauerhafte Veröffentlichung belegt; E1/E2 unter BL-010.21 offen. Bestehende RC140-ZIPs unverändert. |
| BL-012.9 / MAC-04 | Gemeinsamer Mac-Reviewadapter ließ Gruppen über 1000 Fundstellen und technische JXA-Fehler als „vertagt“ erscheinen. Gruppierung berücksichtigt nun Zeichen- und Fundstellenlimit; technische Fehler bleiben Fehler. 100 Review-/Policy-/Companionfälle lokal bestanden, einschließlich Windows-Gegenregression; Fix im RC141-Standalone-Mac-Paket enthalten. | **in Arbeit**: neue Cowork-Paketlieferung und sichtbare AppKit-UAT/E1/E2; der Standalone-Paketsmoke belegt keine Reviewbedienung. |

Einzelbefunde, Quellen und Prüfumfang: [MAC-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#mac-20260923--vollständiger-macos-paket-und-installationsnachreview).
Neue Pakete, vollständiger Commit und Hashes:
[RC141-Nachweis](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).

Beide Produkte sind aus dem sauberen Commit
`814bc50e3d754224cd95b6fa91f122dd45f48487` als
[RC140-Vorabversion](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140)
veröffentlicht. Standalone-Windows bestand PKG-04/INT-13 mit zwei bytegleichen
Bauten und beiden nativen Smokes; Mac Intel und ARM (`35864636481`) sowie Linux
(`35864697349`) bestanden die native Paket-Evidence. Cowork bestand seine drei
nativen Zielpakete (`35864685584`), den getrennten Windows-Normal-/Debug-/UAT-
Lauf (`35864624729`) und die Pflicht-CI (`35864600808`). Alle 15 Release-Assets
stimmen mit den lokalen Bytes überein. Das belegte die damalige technische E0-Lieferung,
aber keine menschliche N3/N4-/Modell-/Finder-/Gatekeeper-Abnahme und keine
macOS-13.5-Evidenz. Vor dem nächsten Mac-Schritt sind die obigen neuen Defects
zu schließen. Danach folgt ein echter Browser-Download
mit Fresh Install und sichtbarem Start auf Intel und Apple Silicon; ein
ad-hoc-signiertes Paket bleibt nur ein interner Pilot.

### RC139 – Astra-Korrekturen und exakte Release-/UAT-Bindung

**Damals noch ungebundene Reviewfortführung, seit RC140 gebunden:** [PH-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md)
führt die Ordnertrennung (BL-041.19), den vorbereiteten separaten
Claude-Code-Hostpilot (BL-041.20) und die vom Product Owner bestätigte
Wiederverwendung nach DS-101 (BL-041.21). BL-050.4 prüft jetzt alle 16
Härtetestdateien in beiden Zwecken bis zum verifizierten Endzustand. Gegenreviews
sichern zusätzliche Erkennungs- und Berechtigungsfehler ab. BL-021.3 bindet
lokale Reviewentscheidungen an exakte Fundstellen, nicht an freigegebene Wörter.
BL-021.4 behandelt konkurrierende Versalientitel vor der Personen-Aliasbindung;
Fachanker prüfen ihren Erhalt zusätzlich zur erfolgreichen Publikation.
VECTRA-20260923 ergänzt unter BL-050.4 genau einen CSV-Integrationsgegenfall,
keine neue Engine, Eingabeart oder Bedienaktion.
Die damaligen RC139-/RC137-Paketnachweise deckten diese Änderungen nicht ab;
maßgeblich ist nun die vorangestellte RC140-Evidence.

Quellcommit `46c6fec4722c879989f5c8e3059367241c117c3a` liefert BL-041.15–.18 und
`ASTRA2-20260912-01`–`04`. Alle 182 lokalen Produkttestdateien, Docs-/Versionsgates
und echte UAT-Fixtures sind grün. Pflichtlauf `34701892871` und Paketlauf
`34701897963` bestanden. Die drei normalen Release-ZIPs sind auf ihren nativen
Windows-/Intel-Mac-/ARM-Mac-Hosts gestartet. Windows-Normal und -Debug sind
jeweils zweimal bytegleich gebaut und beide Bauten geprüft; die UAT-Vorlage
bindet exakt diese veröffentlichten Bytes. Finale Prüfsummen, SPDX und alle
sieben Upload-Digests sind abgeglichen. Modellgates sowie menschliche N3/N4-
Abnahmen bleiben offen; Standalone-Pakete verbleiben unverändert bei RC137.

### RC138 – native Cowork-Paketparität und Interaktionshärtung

Die Befunde `CWR-20260912-01`–`11`, die geschlossene Interaktionsregistry,
Status-/ACK-/Handoff-Korrekturen, paginierte Aufnahme und Marketplace-Gates sind
an Commit `d70cb266df90bdc07b0efadbf81f0d81195b3920` gebunden. Lauf
`34691170241` baute und startete exakt die drei Release-ZIPs auf Windows x64,
macOS Intel und macOS ARM64; der Pflichtlauf `34691166336` ist ebenfalls grün.
Die damalige technische E0-Lieferung ist als historische Evidence erhalten. Die
nachträglich bestätigten Astra-Befunde `BL-041.15`–`.18` sind inzwischen
implementiert und durch RC139 aus sauberem Commit mit exakt verifizierten
Normal-/Debug-Archiven und frisch erzeugter UAT-Vorlage erneut belegt.
Danach bleiben die benannten menschlichen Cowork-Modell-, N3/N4-, Accessibility-
und Fresh-Install-Nachweise. Standalone bleibt unverändert auf RC137.

### RC136 – DS-099: kanonischer Cowork-Interaktionsvertrag

Der read-only Strukturvergleich mit `GBH-BID-Skills` ist dauerhaft unter
`ARCH-DOC-COWORK-BID-REVIEW-2026-09-11` archiviert. Übernommen werden nur
allgemeine Cowork-Governance-Muster: eine geschlossene Interaktionsregistry,
ein additiver öffentlicher Statusumschlag, maschinenlesbare Human-Gates,
progressive Skillreferenzen und produktnahe Golden Cases. BID-Fachlogik,
Subagenten-Orchestrierung und fremde Runtimebestandteile bleiben außerhalb des
Produkts. Standalone bleibt unverändert und dient nur als Gegenregression.

### RC134 – zweckgebundene DOCX-Projektion und Windows-Paketbindung

DS-098 trennt nach vollständiger struktureller DOCX-Prüfung die sichtbare
Projektion nach Zweck: reine Konvertierung behält Kopf-/Fußzeilen; die
Anonymisierung lässt sie sowie nur dort referenzierte Bilder aus, erhält aber
Haupttext, Kommentare, Fuß- und Endnoten. Die bewusste Inhaltsgrenze wird nicht
als Extraktionsfehler ausgegeben. Zusätzlich ist die aktuelle Releasewahrheit
dauerhaft abgesichert: `version:sync` aktualisiert den neuen Entwicklungs-RC,
`test:version-truth` läuft in `test:docs`, historische Evidence bleibt
unverändert und eine erfolgte Paketbindung wird nicht zurückgestuft.

Der saubere Commit `583d719` bestand die vollständigen Produkt-, Standalone-,
Dokumentations-, Engineering-, Conversion- und Auditgates. Zwei unabhängig
bereinigte Windows-Paketbauten sind als ZIP, Desktop- und Core-Binary bytegleich;
beide Paket-, Worker- und nativen Smokes bestanden. INT-13 bindet das
110.250.875 Byte große Archiv mit SHA-256 `cdc2ec38…6de0c`. Offen bleiben
N3/N4, aktuelle Cowork-Pakete sowie macOS-/Linux-Zielhostevidenz.

### RC133 – historischer versionierter Paket- und Testkandidat

Der RC132-Funktionsstand ist als RC133 aus Commit `2cd4150` geschnitten und auf
`main` veröffentlicht. Zwei unabhängig bereinigte Windows-Paketbauten sind
bytegleich; beide Paket-, Worker-, History-/Sidecar- und native Smokes sind
grün. INT-13 bindet SHA-256 `fd3dcb1b…ece66`. Damit ist die technische Windows-
E0-Evidence erledigt; N3/N4 sowie Cowork-/macOS-Zielhostevidenz bleiben offen.

### RC132 – unabhängige Defectrunde und ehrliche Policy-/Statusbindung

BL-010.12/BL-010.23/BL-021.1/BL-030.2/BL-041.1: Der mehrdimensionale
Gegencheck reproduzierte und schloss vier Ursachen. Gemeinsam als Person
bestätigte gleiche F7-Stellen bleiben nach der ersten Pseudonymbindung über alle
betroffenen Dokumente veröffentlichbar. Der kanonische Policyfingerprint umfasst
alle ausführungsbestimmenden Privacy-, Review-, Profil-, Pseudonym-, Core- und
Ressourcenmodule; Einzelmutation und unbekanntes Privacy-Modul sind negative
Gates. Der Ruleset ist wegen der materiellen F7-Änderung `de-business/3`.
Präindex-Journale zählen auch wiederholte Aliasfenster gegen ihr festes
Arbeitsbudget. Die drei nativen Reviewadapter fassen identische F7-Personenstellen
zu genau einer sichtbaren Entscheidung zusammen; die gemeinsame Validierung
bleibt fail-closed. Cowork transportiert bei Start und nachträglichem
Ergebnisordnerwechsel einen vollständigen serverseitigen `user_status`; ein ausstehender Netzwerk-/Sync-Hinweis überlebt einen
abgebrochenen Quellpicker und wird erst bei bestätigter Übergabe verbraucht.
Standalone gruppiert ausschließlich zugelassene Quellen; Ablehnungsgründe bleiben
im Admissiongate. E0 ist lokal automatisiert belegt. Neue Paket-/INT-13- und
menschliche N3/N4-Evidenz für RC132 bleibt offen.

BL-010.13/BL-011.8/BL-010.23: Ein realer Altjournal-Gegenlauf zeigte, dass ein
Anonymisierungsstapel des früheren Rulesets `de-business/2` trotz aktuellem
`de-business/3` noch als fortsetzbar erschien. Die Recovery filtert nun jede
Privacy-Fortsetzung bereits vor der UI-Projektion gegen den gespeicherten
Pseudonym-/Policykontext. Reine Konvertierung sowie reine Export-/Mappingreparatur
bleiben davon unabhängig. Ungefangene Workerfehler stabilisieren alle offenen
Positionen über den gemeinsamen Vorveröffentlichungs-Classifier und dessen
begrenztes Retrybudget; der feste Ursachencode bleibt über Worker, Executor und
Diagnose erhalten. Historische inaktive Läufe blockieren weder Funktionswahl
noch Datei-, rekursive Ordner- oder Dropaufnahme. Der Verlauf bestätigt nach
einem Klick nur den angenommenen Start und prüft anschließend den tatsächlichen
Laufstatus. Der gespeicherte Ergebnisstamm ist unter Einstellungen sichtbar.

DS-097/BL-010.9/BL-010.23: Zwei Produkte bleiben eine Repository- und Core-Linie.
Standalone und Cowork besitzen getrennte Distributionen, Datenräume, UI- und
Transportadapter; Betriebssystemunterschiede gehören in kleine Windows-/macOS-/
Linux-Adapter und Zielpaketgates. Permanente Produkt- oder OS-Branches sowie
kopierte Privacy-/Workflowimplementierungen sind ausdrücklich kein Ziel. Die
noch sichtbaren Imports gemeinsamer Verarbeitung aus `server/standalone/` werden
bei konkreter Änderung in eine schmale neutrale Processing-API beziehungsweise
plattformgebundene Adapter verschoben; kein risikoreicher Big-Bang-Umbau im
Fortsetzungsfix. Produkt- und Abhängigkeitsgrenzen bleiben maschinelle Gates.

### RC131 – deterministische Fehler sind niemals Endlosschleifen

BL-010.13/BL-011.8/BL-021.1/BL-041.1: Ein realer RC130-Standalone-Lauf mit
einem komplexen DOCX belegte zwei gekoppelte Fehler. Der unabhängige
Residual-Prüfer klassifizierte fachliche Tabellenwerte aus einem generischen
Office-Export als Personenkandidaten. Der sichere Stopp wurde anschließend
ohne maschinenlesbaren Grund in `PROCESSING_INTERRUPTED` umgedeutet und dadurch
bei jeder Verlauf-Fortsetzung identisch wiederholt.

RC131 ergänzt den bestehenden Fachwortkatalog um belegte Begriffe und behandelt
darüber hinaus bewertete Skill-/Kompetenzmatrizen kontextgebunden: allgemeine
professionelle Zweiwortphrasen bleiben Inhalt, echte Namen in derselben neutralen
Tabellenstruktur bleiben weiterhin gesperrt. Der gemeinsame
Vorveröffentlichungs-Classifier setzt außerdem produktweit durch: Nur ein
explizit katalogisierter transienter Fehler ist fortsetzbar. Uncodierte oder
unbekannte Pipelinefehler werden terminal als `INTERNAL_FAILURE`, Residual-
Fehler explizit als `RESIDUAL_PII` gespeichert. Ein echter
`PROCESSING_INTERRUPTED`-Zustand entsteht nur nach nachgewiesenem Prozessverlust
aus einem verwaisten dauerhaften `processing`-Checkpoint oder nach bereits
atomar veröffentlichter, noch nicht vollständig abgeglichener Ausgabe. Derselbe
explizit transiente Fehler bleibt höchstens zweimal fortsetzbar und stoppt beim
dritten Fehlschlag als `RETRY_LIMIT_EXCEEDED`; eine dauerhaft fehlende
Konvertierungsisolation ist sofort terminal. Ein verifiziertes veröffentlichtes
Paket wird nach Callback-/Journalfehlern adoptiert und niemals neu verarbeitet;
ein vorhandenes unsicheres Paket stoppt als `RECOVERY_FAILED`.

Standalone und Cowork verwenden denselben Privacy- und Stapelkern; beide
Erstverarbeitungs- und Sammelreviewpfade sind an diese Regel gebunden. Gezielte
Regression, der reale bereits extrahierte DOCX-Markdown-Inhalt und die
vollständigen Produktgates bildeten E0 vor dem finalen Paketlauf. Paketbau und
INT-13 sind inzwischen aus dem finalen RC131-Commit gebunden; sichtbar offen
bleibt die menschliche UAT.

Die technische Paketbindung ist inzwischen für Commit `d4d269b` erledigt:
Windows-PKG-04/INT-13, beide nativen macOS-Architekturen und alle drei Cowork-
Zielpakete sind grün und als `v3.2.0-rc131` veröffentlicht. Offen bleibt nur die
bereits geplante menschliche N3/N4-UAT. BL-051.7 ist zugleich nachgeschärft:
Der einzige automatische Ubuntu-Job unterscheidet Docs-only, Produktcode und
gemischte Änderungen fail-safe; native, Security-, OCR- und Releasegates bleiben
manuell. Der Cowork-Workflow startet standardmäßig nur Windows x64, während
`all` ausschließlich bewusst für einen neuen plattformübergreifenden Kandidaten
gewählt wird.

### RC130 – Windows-Helferpfade und POSIX-Testisolation

Datei-/Ordnerdialoge sowie `taskkill.exe` werden mit expliziter Windows-
Pfadsemantik aufgebaut und durch exakte plattformneutrale Vertragstests
gebunden. Die realen Audit-/Exporttests verwenden auf jedem Betriebssystem
einen eigenen temporären Produktdatenroot; der Abschlussanzeigentest akzeptiert
die zwei zulässigen Ergebnisse eines sauberen IPC-Schließens, fordert aber
weiterhin exakt einen Presenter. Die separate Worker-Übernahme bei echtem
Elternausfall bleibt unverändert geprüft. Die vollständige CI-Produktsuite ist
auf Windows und mit dem gepinnten Node 22.23.2 auf einem nativen Linux-
Dateisystem grün. Offen sind PKG-04/INT-13 und die commitgebundenen
Zielpaketjobs.

### RC129 – Windows-Pfadsemantik vom Testhost entkoppelt

Der RC128-Linux-Lauf bestätigte den realen Startup-Guard und fand anschließend
im Test für den stabilen Cowork-Datenroot eine Host-Pfadabhängigkeit. Der
Windows-Vertrag verwendet nun durchgängig `path.win32` für Absolutheit,
Normalisierung und Identitätsvergleich. Damit bleibt der echte Produktpfad
unter Windows unverändert und derselbe Vertrag ist unter Linux und macOS
automatisiert belegbar. Lokal sind die gezielten Pfad- und Startup-Tests grün;
offen sind der Linux-CI-Rerun, PKG-04/INT-13 und die fünf commitgebundenen
Zielpaketjobs.

### RC128 – Startup-Guard-Test auf allen Hosts real gebunden

Der RC127-CI-Lauf belegte den korrigierten LF-Guard, deckte aber zwei
Windows-spezifisch präparierte Startup-Guard-Realprozesstests auf. RC128 setzt
für die Childprozesse den absoluten `EU_PRIVACY_DATA_ROOT`, sodass Defekt,
Marker, Diagnosejournal und Erwartung unter Windows, Linux und macOS denselben
realen Speicherort verwenden. Das ändert keinen Produktpfad und ersetzt keine
Runtime durch einen Mock. E0 lokal ist grün; offen sind der Linux-CI-Rerun,
PKG-04/INT-13 und die fünf commitgebundenen Zielpaketjobs.

### RC127 – Zielpaket- und CI-Vertrag korrigiert

Der RC126-All-Targets-Lauf hat drei gültige, jeweils unter 45 MiB liegende
Cowork-Ziel-ZIPs gebaut und anschließend nur am zusätzlichen Universal-ZIP
gestoppt. RC127 entfernt diesen nicht installierbaren Sammelartefaktweg aus dem
Releaseworkflow, ohne die 50-MB-Sicherheitsgrenze anzuheben. Ein Vertragstest
fordert dauerhaft genau die drei getrennten Zielpakete. Der automatische
LF-Guard prüft Git-Indexbytes und lässt ausschließlich die byteinventorierten
Upstream-Abhängigkeiten der deaktivierten OCR-Runtime aus; eigene Quellen
bleiben vollständig erfasst. Der reale Intel-macOS-Lauf entdeckte zusätzlich,
dass die bisherige Nachlaufprüfung beliebige direkte WebView-Kindprozesse als
Sidecar klassifizieren konnte. Der Tauri-Lifecycle schließt den verwalteten
Sidecar nun vorsorglich bei beiden globalen Exit-Ereignissen; der Zielhosttest
bindet PID, Prozessname und Kommandozeile an den exakten `datasecure-core`-
Kindprozess und wartet begrenzt auf dessen Ende.

E0-Code und Regression sind erledigt. Offen sind der commitgebundene
PKG-04-/INT-13-Neulauf, die drei Cowork-Zielbuilds und die beiden nativen
macOS-Standalone-Builds aus dem finalen RC127-Commit. Die RC126-Läufe dürfen
nicht in die formale UAT-Kampagne umgebunden werden.

### RC126 – Cowork-Sammelpaket auf allen Zielsystemen reproduzierbar

Der reale RC125-All-Targets-Lauf hat eine technische Paketierungsannahme
widerlegt: Offizielle Node-Archive liefern den identischen Lizenztext auf
Windows mit CRLF und auf macOS mit LF. Der zielübergreifende Rohbytevergleich
stoppte daher korrekt, aber unnötig. RC126 normalisiert die verifizierte
UTF-8-Lizenz vor Hash und Veröffentlichung auf LF; alle anderen Abweichungen
bleiben gesperrt. Der Regressionstest deckt LF, CRLF, ungültiges UTF-8, NUL und
Größengrenzen ab. `version:sync` bindet zusätzlich die formale UAT-Vorlage.

E0-Code und Vollregression sind erledigt. Vor Kampagnenstart bleiben der neue
commitgebundene PKG-04-/INT-13-Lauf und die Zielpaketbuilds aus exakt diesem
RC126-Commit auszuführen; RC125-Evidence darf nicht übernommen werden.

### RC125 – N3/N4 und formale Zwei-Personen-UAT vorbereitet

BL-051/BL-052 / DS-095: N3 ist jetzt als technische E1-Zielhostabnahme, N4 als
anschließende formale E2-/E3-Anwender- und Freigabeabnahme definiert. Der aktive
Rahmen unter `docs/acceptance/FORMAL_UAT` bindet einen vollständigen Commit an
separate Standalone-/Cowork-Pakete und SHA-256 für Windows x64 sowie die reale
Architektur eines Test-Macs. Getrennte Plattformprotokolle, Branchablauf,
N3-/N4-Klartextfälle und eine fail-closed Freigabevorlage sind angelegt und
maschinell geprüft. Die bestehenden Cowork- und Standalone-UAT-Kits bleiben die
einzigen produktbezogenen Fallquellen.

Offen und bewusst menschlich: finalen Kandidaten festschreiben, vier
zielgebundene Paket-Hashes eintragen, Windows- und macOS-N3/N4 durchführen und
gemeinsam entscheiden. Ein Mac belegt nur seine native Architektur; die andere
macOS-Architektur bleibt separat offen. Die Vorbereitung ist E0 erledigt und
keine vorweggenommene UAT-Evidence.

### RC125 – unabhängige Revalidierung

Der aktuelle Stand wurde erneut gegen die offizielle Claude-/Cowork-
Sitzungsarchitektur und alle automatisierten Produktverträge geprüft. Die
Cloud-/Local-Grenze bleibt unverändert bindend und ist im aktiven Reviewbericht
aktualisiert: Originale nur im nachweislich lokalen Desktop-/Plugin-MCP-Weg;
Cloud-Cowork darf nur bereits freigegebene Ergebnisse erhalten.

Der brüchige Prompt-Nachtrag, der einen historischen Vier-Format-Satz erst zur
Laufzeit durch die Sechs-Format-Regel ersetzte, ist entfernt. Der SEA-
Crashvertrag verfolgt jetzt sowohl die direkte als auch die Markdown-first-
Konvertierung bis zum gemeinsam veröffentlichten Extraktionscheckpoint. Beide
Befunde sind E0 geschlossen und erzeugen keine neue Story. Weiter offen bleiben
nur die bereits vorhandenen, ausdrücklich als Zielhost-, UAT-, Performance- oder
Fachevidenz gekennzeichneten Backlogpunkte.

### RC124 – DS-093: Cowork-Officequellen über lokales Markdown

BL-010.34/BL-020.1/BL-022.2/BL-022.3: XLSX und PPTX werden im Cowork-Plugin
nach Container-/OPC-Prüfung genau einmal durch den bereits paketierten,
isolierten Office-Parser in eine neutrale Markdown-Repräsentation überführt.
Anschließend laufen sie durch den unveränderten Privacy-Core. Extraktionsgrad
und Anonymisierungsgrad bleiben getrennt; Cowork behauptet keine vollständige
Anonymisierung des ursprünglichen Containers. Picker, rekursive Auswahl,
Wiederaufnahme und Ergebnisübergabe benötigen keinen zusätzlichen Dialog.

E0-Abnahme: reale isolierte XLSX-/PPTX-Läufe, stabile Personen- und
Unternehmenspseudonyme, kein Rohinhalt an Claude, kein Zwischenartefakt,
unveränderte Standalone-Regression sowie Paket-/Marketplace-Smoke. PDF,
Scan-PDF und Bilder bleiben unter BL-023.1–4/BL-024.3 offen, bis eine kompakte
gebündelte OCR-/PDF-Runtime das Paketbudget, Offline-, Sandbox-, Lizenz- und
Zielhost-Gate erfüllt. Das ist **kein** Anwenderblocker für die sechs
freigegebenen Cowork-Formate.

### RC124 – Reviewbefunde aus dem rc123-Gesamtreview

Ein Mehrdimensionsreview von `c62d7ec` hat 27 Befunde erzeugt, alle durch
Ausführung reproduziert und adversarisch gegengeprüft. Ausführungsdetail,
Reproduktionen und Abnahmekriterien stehen im damaligen, inzwischen archivierten Auftrag
[`tasks/archiv/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md`](../../tasks/archiv/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md).
Die Befunde werden **bestehenden** Storys zugeordnet; neue `BL-nnn.x`-Kennungen
werden hier nicht eigenmächtig vergeben.

**P0 — Unter-Redaktion.** Die schwerste Fehlerrichtung nach `tasks/README.md`.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F1 | BL-010.30, BL-030.2 (DS-087/DS-090) | Die Standalone-Privacy-Projektion übernimmt eine eindeutige sensible Quellkopfzeile aus einer neutralen `Spalte N`-Extraktion, bevor der gemeinsame Redaktionskern läuft. Der reine Konvertierungsmodus und Cowork bleiben unverändert; ein unabhängiges strukturelles Restgate stoppt unbekannte Tabellenwerte fail-closed. | **E0 erledigt; Produktwahl A/B in Rückfrage dokumentiert** |
| F2 | BL-021.1, BL-030.2 | Eindeutige operative Personenfelder (`Zuständig`, `Verantwortlich`, `Bearbeiter`, `Sachbearbeiter`, `Betreuer`, `Autor`, `Verfasser`, `Empfänger`, `Absender`, `Unterzeichner`, `Gesprächspartner`, `Kontakt`, jeweils unterstützte Geschlechtsform) werden spaltengebunden redigiert. Namensförmige Werte unter unbekannten Überschriften, einschließlich sichtbarer Markdown-Linklabels, stoppen unabhängig vom Redaktorkatalog fail-closed. | **E0 erledigt; neue DS-Kennung zur Bestätigung vorgeschlagen** |
| F3 | BL-021.1 | Explizit bezeichnete Zugangsdaten im Dokumentinhalt (`Benutzername`/Login, Passwort/Kennwort/Passphrase, Secret/Token/API-Key, Zugangscode/PIN) werden zeilen- und tabellenspaltengebunden durch `[CREDENTIAL_REDACTED]` ersetzt. Ein unabhängiges Restgate stoppt verbleibende Werte; Findings und Diagnoseobjekte enthalten weder Wert noch Hash. DS-016/DS-046 betreffen weiterhin nur verschlüsselte Quelldateien. | **E0 erledigt** |
| F4 | BL-021.1 | IBAN-Gruppierungen mit einfachem/mehrfachem Leerraum, Punkt, Schrägstrich, ASCII- und Unicode-Bindestrichen sowie Leerraum um genau ein Satzzeichen werden für DE, AT, BE, GB und NL vollständig erkannt; unbekannte Länderlängen bleiben konservativ. | **E0 erledigt** |
| F5 | BL-021.1 | Bekannte feste IBAN-Längen enden vor nachfolgenden Telefon-/BIC-/IBAN-Labels, durch unabhängige Detektoren abgesicherten Formularlabels und Prosa. Numerische Fortsetzungen und unbekannte Formularfelder bleiben konservativ geschützt; Folgeidentifier werden separat verarbeitet. | **E0 erledigt** |
| F6 | BL-021.1 | Häufige Briefformulierungen (`rufen Sie mich/uns/Frau/Herrn/Mx … [an] unter`, `rufen Sie bitte unter`, `melden Sie sich unter`, `Rückfragen unter`, `telefonisch unter`) sind durch eine begrenzte, zeilenlokale Grammatik als Telefonkontext gebunden. `unter` allein, technische Abrufprosa, Uhrzeiten und Kalenderdaten bleiben unverändert; Redaktor und unabhängiges Restgate sind gegengeprüft. | **E0 erledigt** |
| F7 | BL-021.1 (DS-096) | Eine enge Satzsubjekt-/Tätigkeitsgrammatik reserviert plausible unbeschriftete Prosanamen vor der normalen Redaktion und führt sie in den bestehenden lokalen Sammelreview. „Als Person anonymisieren“ verwendet das stapelweite Personenpseudonym; ein bereits exakt gebundener vollständiger Name wird in Folgedokumenten automatisch gleich anonymisiert. Derselbe noch offene normalisierte Name muss innerhalb eines Reviews einheitlich entschieden werden; „beibehalten“ gilt für die dabei geprüften Fundstellen. Fachphrasen bleiben erhalten; Rohwert, Kontext und Hash bleiben aus Journal, Diagnose und MCP heraus. | **E0 erledigt; E2/E3 Fach- und UX-Abnahme offen** |

**P1 — Über-Redaktion und Inhaltszerstörung.** Kein Leck, aber
Kern-Anwendungsfälle blockiert oder freigegebener Inhalt zerstört.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F8 | BL-021.1 (DS-049) | Einzeilige, zur Trennzeile gleich breite Tabellenköpfe erzeugen keinen falschen `TABLE_STRUCTURE_AMBIGUOUS`-Befund mehr. Eindeutige Personenfelder werden redigiert; bei nicht katalogisierten Überschriften verhindert das unabhängige `PERSON_CANDIDATE`-Gate weiterhin einen stillen Durchlass namensförmiger Werte. Mehrzeilige Köpfe werden spaltenlokal bewertet, damit eine aufgelöste sensible Spalte keine ungelöste Nachbarspalte maskiert; anders breite und überlange sensible Strukturen stoppen unverändert. Die im Auftrag vorgeschlagene Pauschalredaktion unter `Rechnungs`, `Fall`, `Akten` oder `Abteilung` wurde nach unabhängigem Gegenreview verworfen, weil sie die bestätigte F2-Grenze und Fachinhalte über-redigieren würde. | **E0 erledigt** |
| F9 | BL-030.2 (DS-084) | Persistierte einwortige Personenaliase belegen nur die wiederzuverwendende Identität, nicht die Personenrolle jedes gleichlautenden Worts. In Folgedokumenten greifen sie positionsgebunden nur unter einem Personenlabel, Honorativ, Personen-Tabellenkopf oder enger `z. Hd.`-Einleitung; gewöhnliche Substantive und Jahreszeiten bleiben erhalten. Mehrwortige exakte Personenidentitäten behalten die bestehende stapelweite Wiedererkennung. v1/v2, serialisierte Fortsetzung, Mischvorkommen, Markdown-Linklabel und Firmenüberlagerung sind gegengeprüft. | **E0 erledigt; E1/E2 echter Neustart/UAT offen** |
| F10 | BL-021.1 | Personenlabels werden unabhängig von ihrer Schreibweise erkannt, ihr Wert wird jedoch mit einer eigenen großschreibungsgebundenen Grammatik ausgewertet. Dadurch bleibt in `Autor: Schmidt schrieb dies.` das Prosawort erhalten, `Schmidt` verwendet über Folgedokumente dasselbe v1-/v2-Pseudonym und ein Alias `Schmidt schrieb` entsteht nicht. Derselbe Parser gilt für Zeilen- und Inline-Labels; vollständige explizite Kleinschreibungswerte bleiben unterstützt. | **E0 erledigt** |

**P2 — Evidenz und Gates.** Keine Redaktionsrichtung.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F11 | BL-022.1, BL-050.1, BL-052.1 | Der deterministische 15-DOCX-Komplexkorpus wird durch `uat:complex-docx` erzeugt; der Produkttest erzeugt zwei eigene sichere Temporärprojektionen, vergleicht sie bytegleich und gibt bei einem Generatorfehler einen festen Hinweis aus. Ein frischer Clone benötigt keine eingecheckten DOCX-Fixtures. | **E0 erledigt** |
| F12 | BL-020.3 (DS-018) | Der Netzwerkvertrag grenzt Rohinhaltsprozesse von der Metadaten-/Exportkoordination im MCP-Hauptprozess ab. Der sichtbare Export verarbeitet ausschließlich verifizierte anonymisierte Paketbytes; beide `.mcp.json`-Projektionen starten nachweislich den kleinen Einstiegspunkt, während Parser, OCR und Review den Netzwerk-Guard behalten. | **E0 erledigt; native Sandbox-Evidenz bleibt offen** |
| F13 | BL-002 (DS-080) | Netzwerkpfade bleiben als ausdrücklich gewählte Ergebnisordner zulässig. Cowork und Standalone zeigen einmalig und ohne weitere Bestätigung an, dass Ergebnisse und bei Standalone-Anonymisierung auch die laufbezogene Zuordnung an andere Systeme übertragen werden können; Pfade gelangen nicht in Cowork- oder Diagnosetexte. | **E0 erledigt; E1/E2 Zielhostanzeige offen** |
| F14 | BL-010.28 (DS-085) | Die eng begrenzte Legacy-Ausnahme ist dokumentiert und regressionsgeprüft: Ein bereits angelegter `datasecure-result-export/3`-Konvertierungsplan beendet beim Replay seine historisch zugesagte `DataSecure-Zuordnung.csv` unter `DataSecure-Markdown`; neue reine Konvertierungsläufe bleiben ohne Zuordnung. | **E0 erledigt** |
| F15 | BL-010.30 | `termination_unconfirmed` wird auch für Journal-Schema `/6` projiziert; breite Anonymisierungsstapel zeigen den definierten Abbruchgrund. | **E0 erledigt (RC123)** |
| F16 | BL-023.4 | Ein einzelnes textloses Bild setzt `OCR_TEXT_EMPTY` und stoppt ein sonst lesbares PDF hart, statt es als „verwendbar mit Auslassungen" auszuweisen. | **erledigt** – `OCR_TEXT_EMPTY` gilt nur noch für eine insgesamt textleere Extraktion; nativer PDF-Text bleibt mit getrenntem OCR-Hinweis verwendbar |
| F17 | BL-030.2 | Die Hypothese ist durch eine lokale, nicht als Release-Benchmark gebundene Beobachtung und reproduzierbare Arbeitsbudgettests bestätigt: Präindex-Zustände können ohne Begrenzung mehrsekündige Aliasfenstersuchen auslösen. Da alte HMAC-Bindungen den fehlenden Klartext-Startindex nicht rekonstruieren lassen, bleibt exakte Wiedererkennung für kleine Altstapel erhalten; ein fester 50.000-Fenster-Suchraum zählt auch wiederholte Cachetreffer, stoppt größere Altstapel begrenzt und fordert die erneute Originalauswahl. Kein Alias wird still übergangen. | **E0 erledigt; reale Altstapel-UAT offen** |

**P3 — Kanonkorrekturen.** Reine Dokumentwahrheit, kein Code.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F18/F19 | BL-051.1 (DS-077) | Der damals belegte Umfang und die Formatmatrix wurden auf RC111/`b543589f` samt ZIP-SHA gebunden; RC108/RC109 bleiben ausdrücklich historische Evidence. Der heutige Paketstand RC134 ist separat in BL-051 und der Evidenzmatrix gebunden. | **E0 erledigt (RC123)** |
| F20/F21/F23 | BL-002 | Der Komfortindex nennt die Präzisierungen DS-089/091/092, ausschließlich RC123 heißt „Aktueller Entwicklungsstand", und die in RC123 gepflegten Dokumente tragen den Stand 08.09.2026. | **erledigt (RC123)** |
| F22 | BL-003.9 | Einstiegsregeln und `tasks/README.md` verwenden einheitlich `AUFTRAG-<ADRESSAT>-<RC>-<THEMA>.md` und verweisen auf den vorhandenen RC123-Auftrag. | **erledigt (RC123)** |
| F24 | BL-051.3 (DS-010) | Die UAT-GO-Regel verlangt zusätzlich zum 100-Dateien-Fall ausdrücklich den noch offenen versionsneuen 200-Dateien-Grenzlauf je Zielbetriebssystem. | **Dokumentvertrag erledigt; E2-Grenzlauf offen** |

**P4 — Standalone-Desktop.** Klein, keine Redaktionsrichtung.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F25 | BL-010.33 (DS-086) | Der letzte in derselben UI-Sitzung fertiggestellte Lauf bleibt während der Vorbereitung der nächsten Auswahl erreichbar. Eine neue Auswahl verwirft weder dessen exakte Laufbindung noch die Freigabe von `process-results`; historische Läufe nach App-Neustart bleiben weiterhin ausschließlich im Verlauf. | **E0 erledigt; E2-Zielhostbedienung offen** |
| F26/F27 | BL-010.33 | Dieselbe Windows-Reparse-Point-Prüfung schützt Eingabe- und Öffnungsziele; Junctions werden vor der Übergabe an Explorer abgelehnt. Der Entnahmetest benennt nur noch seine tatsächlich geprüfte Einzelelementsemantik; die 199/200-Indexgrenze bleibt im Rust-Test separat belegt. | **E0 erledigt; E2-Zielhostbedienung offen** |

Als Reviewergebnis ausdrücklich **sauber** und deshalb ohne offenen Punkt:
Produkttrennung und Datenroots, Exportverifikation und Destination-Bindung,
Modustrennung zwischen Anonymisierung und reiner Konvertierung, die
`support-trace`-Projektion, der Rekursionsschutz zwischen Quell- und
Ergebnisbaum, der Nur-Lese-Zugriff auf Originale, die drei Absturzfenster der
Wiederaufnahme, Tauri-Kommandofläche und CSP, Panikfreiheit des
Rust-Produktivcodes, DS-086 und die laufgebundene Verlaufsbindung,
Markdown-Escaping als Angriffsfläche sowie die Unicode-Wortgrenzen im
Redaktionskern. Drei zunächst gemeldete Befunde wurden gegengeprüft und
**widerlegt**: die leere OCR im reinen Konvertierungspfad, die Gradzählung
zwischen den Journal-Schemata `/5` und `/6` (durch DS-090 gerechtfertigt) und
der fehlende `network-deny` im MCP-Hauptprozess als solcher (Vertragsscope).

### RC123 – DS-092: einfacher Cowork-Normalweg und Produktparität

BL-010.8/BL-010.23/BL-040.5/BL-041.10/BL-044: Die in Standalone bestätigten
Core-Korrekturen bleiben über gemeinsame Policy-/Golden-Gates für Cowork aktiv,
ohne Standalone-Oberfläche oder -Verträge umzubauen. Die normale Cowork-Aktion
**Ergebnisse öffnen** verwendet ausschließlich den exakten sichtbaren Laufordner
des aktuellsten Cowork-Stapels; ein aktiver, fehlgeschlagener oder nicht
exportierter aktueller Lauf fällt nie auf einen älteren Lauf oder den allgemeinen
Output-Stamm zurück. Rekursive Auswahlgrenzen besitzen produktneutrale
`SOURCE_FOLDER_*`-Codes und erscheinen in Cowork als verständliche
Auswahlablehnung. MCP-Protokoll-, Recovery-, Picker-, Source-Folder-,
Standalone- und Cross-Produkt-Gates binden diese Trennung.

Cowork bleibt absichtlich auf Anonymisierung von TXT/Markdown/CSV/DOCX begrenzt.
Breite Offline-Konvertierung/OCR, reine Markdown-Konvertierung, Verlauf,
sichtbare Zuordnung, Unterordnerprojektion und wählbare Ergebnisnamen bleiben im
eigenständigen Standalone-Produkt. Offene menschliche Evidenz: Fresh-Install-
und sichtbarer Ergebnisöffner-/Auswahlfehler-UAT unter unterstütztem Claude
Desktop/Cowork auf Windows und macOS.

### RC120 – sichtbare Zuordnung auf vorhandene Ergebnisse begrenzt

BL-010.13/BL-040.5/BL-002: Die Standalone-Zuordnungsdatei enthält nur noch
Quelle-zu-Ergebnis-Zeilen, deren Ergebnis vor der Mappingpublikation wirklich
geschrieben und geprüft wurde. Gestoppte Quellen bleiben in Abschluss und
Diagnose; All-stopped erzeugt weder leeren Laufordner noch Zuordnungsdatei und
aktiviert auch bei historischen Läufen keine falsche Öffnen-Aktion. Gemischte
Stapel veröffentlichen die erfolgreichen Ergebnisse und ausschließlich deren
Zuordnungen. Legacy-Dateien werden nicht umgeschrieben. Unit-, History-,
Status-, Replay- und echter Paket-Smoke bilden den Vertrag ab.

### RC119 – P0-Personenunterredaktion im konvertierten DOCX-Korpus geschlossen

BL-021.1/BL-030.2/BL-050.1: Der reale Standalone-Lauf
`Lauf-20260907-163522-142350c1` gab vier Namen aus konvertierten DOCX-Tabellen
im Klartext frei. Ursache war die vom Konverter erzeugte Tabellenbezeichnung
`person`, die im Personenankerkatalog fehlte. Die Restprüfung verwendete
denselben Katalog und bestätigte deshalb denselben blinden Fleck. `Person` ist
jetzt ein ausdrücklicher, positionsgebundener Personenanker. Zusätzlich erkennt
ein enger, unabhängig formulierter Release-Guard klare Namen in
`| person | … |`-Zeilen, ohne den Redaktorkatalog wiederzuverwenden. Der
100-Dateien-Korpustest prüft die vier realen DOCX nicht mehr nur auf
Konvertierbarkeit, sondern auch auf Entfernung des extrahierten Namens,
Personenpseudonym und leere Restbefunde. Der fehlerhafte sichtbare Lauf bleibt
historische UAT-Evidenz und darf nicht verwendet werden.

### RC117 – komplexer DOCX-UAT-Korpus und Word-Interoperabilität

BL-022.1/BL-050.1/BL-052.1: 15 deterministische, vollständig fiktive DOCX decken
kurze, mittlere und lange Fließtexte, Listen, Tabellen, Kopf-/Fußzeilen,
Grafiken, Abschnittswechsel, wiederholte Stapelidentitäten und neutrale
Erhaltungsfälle ab. Der Produktpreflight und Parser akzeptieren jetzt zwei
exakt bekannte interne, nicht ausführbare Microsoft-Beziehungsarten sowie vier
reine DrawingML-Layoutknoten. Lookalikes, externe Ziele und fremde Namespaces
bleiben gesperrt. Reale Admission-, Parser-, Anonymisierungs- und
Determinismusprüfungen sind E0 erledigt. Die sichtbare Durchführung beider
Standalone-Funktionen mit dem Korpus bleibt menschliche E2-Evidenz.

## Aktiver Umsetzungsblock – Gesamtgegenreview 01.09.2026

### RC109 – Gesamt- und Schnittstellenkorrekturen: geprüfter E0-Block abgeschlossen

F-01–F-11 aus dem unabhängigen Review und dem Paketgegencheck sind implementiert beziehungsweise
kanonisch bereinigt. Details, Gegenbeispiele, bestehende BL-Zuordnungen und
Nachweisgrenzen stehen im [archivierten Korrekturbericht](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md).
Zusätzliche Gegenchecks schließen reentrante Testfinalität, Verlaufszähler,
verweigerte MCP-Fortsetzung/Tokenfehler und die entdeckte Plugin-Paketabhängigkeit
mit ein. Kein neues Parallelbacklog, keine doppelt angelegten User Stories.
Der abschließende Gesamtstand besteht die volle Produktsuite (57 Basis-/114
direkte Testdateien) sowie echte Konverter- und frische Cowork-Paketprüfungen.
Die unten benannten RC86-Restschulden sind gezielt korrigiert; erste
Core-Extraktion und vollständige semantische E0-Golden-Bindung des unterstützten
Format-/Profil-/Review-/Recovery-Umfangs sind nachgewiesen, aber allein kein
Beleg vollständiger struktureller Entkopplung. Zuletzt verstärkte Architektur-,
Produktisolations-, Browser- und Dokumenttests sind zusätzlich grün. Die
frischen Standalone- und Cowork-RC109-ZIPs enthalten diese Korrekturen und
bestehen ihre Paket-Smokes. Standalone wurde aus `6bf7d05747e151ba8f846849229495e9fca4c041`
zweimal bytegleich gebaut und mit beiden Paket-/Worker-/nativen Windows-Smokes
an INT-13 gebunden. Noch offene Zielhostabnahmen bleiben ausdrücklich unten
geführt, nicht pauschal als erledigt markiert.

### RC109 – Startseite und Verlauf: Implementierung und Windows-Prüfungen abgeschlossen

DS-086 / BL-010.29: keine vorausgewählte Verarbeitung, kein automatischer
Ansichts-/Ordnerwechsel, 20 neueste Verarbeitungen mit exakt laufgebundenen
Aktionen. Zwei Gegenreview-Funde zur älteren Fortsetzung einschließlich zweitem
Versuch und Terminal-ACK korrigiert. Service-/History-/Frontend-/Rusttests,
gemeinsame Executor-/Recovery-/Journaltests, echter Zwei-Modi-Paket-/History-Smoke
und beide nativen Windows-Starts stehen grün. PKG-04/INT-13 ist an den oben
genannten RC109-Quellcommit gebunden. E2-Bedienabnahme S20–S23 und macOS bleiben offen.
Details: [archiviertes RC109-Review](../../tasks/archiv/2026-09-06-rc109-start-verlauf-review.md).

### RC108 – einfache Markdown-Konvertierung: Windows-E0 abgeschlossen

BL-010.28 mit BL-010.16–20/22/25/26 und BL-051.1/BL-002: Quellcommit
`a742333e8ef80b445729d4bede6a91a2b8f13207` besteht die vollständige Produktsuite
(48 Basis-/111 Direktdateien), Rust 15/15, Frontend 18/18 und 25 echte
Konvertertestgruppen. Zwei saubere PKG-04-Builds sind bytegleich; beide echten
Paket-/Worker-/nativen Windows-Smokes bestanden. INT-13 ist an diesen RC108-
Kandidaten gebunden: 110.168.168 Byte, SHA-256
`d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
Receipt: `dist/pkg-04/a742333e8ef80b445729d4bede6a91a2b8f13207/`.
Beide Modi, elf Konvertierungsergebnisse plus Fehlerposition, die damals noch
für beide Modi erzeugte Zuordnung und optionale Supportereignisse sind in diesem
historischen RC108-Paket geprüft. DS-088 ersetzt diesen sichtbaren
Konvertierungsvertrag; dafür ist ein neuer Paketnachweis erforderlich. Es gibt keinen
weiteren Implementierungsblocker für diesen Windows-Konvertierungspiloten.
Menschliche Bedienungs-/Fachabnahme, native Mac-Pakete sowie die unten separat
benannten Ausbau-/Releasehygienepunkte bleiben offen. Frühere RC107-Nachweise
und Fehlversuche im folgenden Abschnitt sind historisch, nicht erneut auszuführen.

### Korrekturblock aus dem erneuten RC106-Review – RC107 E0 geschlossen

Abschließende Paket-Evidence (BL-051.1/BL-002): aus sauberem Commit
`7b88a81ff577aaa270f1354d75365b2df4a4666e` zweimal bytegleich gebaut und beide
ZIP-/Worker-/nativen Windows-Smokes bestanden. INT-13 ist an diesen neuen
Kandidaten gebunden (36.071.549 Byte; SHA-256
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`).
Vollständige Produktsuite 40 Basis-/111 Direktdateien und Rust 12/12 grün.
Die folgenden Hinweise auf fehlende Paketnachweise beschreiben den jeweiligen
früheren Korrekturversuch, nicht den abschließenden Kandidaten. E1/E2 bleiben offen.

| Befund | Bestehende Storys | Umsetzung / verbleibender Nachweis |
|---|---|---|
| Nativer Starttest verwendete reale Anwendungsdaten statt isolierter Testdaten. | BL-010.13, BL-051.1, BL-002 | **E0 erledigt:** explizites, vor Bootstrap validiertes Native-Smoke-Profil für Daten, Dokumente, Diagnosen und WebView einschließlich fehlendem Marker und Pfad-/Link-Negativtests. Neuer Paketnachweis aus dem Korrekturcommit erforderlich. Keine VM und kein Zusatzkonto. |
| Polling blieb nach langen Aktionen stehen; schnelle Folgeläufe zeigten alte Ziele. | BL-010.12/13, BL-002 | **E0 erledigt:** Poll-Lebenszyklus und beide asynchronen Antwortgrenzen an Operationsgeneration gebunden; 14 Frontendfälle decken schnelle Folgestapel, verzögerte Picker/Start/Abbruch und fehlende Zuordnung ab. |
| Geschlossener Desktop ließ einen Steuerprozess mit offenem Worker-IPC weiterleben. | BL-010.13, BL-011.3, BL-002 | **E0 erledigt:** EOF beendet nur den Standalone-Steuerprozess; wartende Requests starten nicht nach. Dauerhaft übergebene Worker behalten ihren Fortsetzungsvertrag. Sieben echte Prozess-/Worker-Negativszenarien grün; Cowork besitzt bereits einen begrenzten Shutdown. |
| Vollständig gestoppter Stapel öffnete die Zuordnung eines erfolgreichen Vorgängers. | BL-040.5/6, BL-010.19, BL-002 | **E0 erledigt, RC120 präzisiert:** All-stopped bleibt als Verlaufsstatus sichtbar, besitzt aber weder Ergebnis- noch Zuordnungsaktion. Fehlercodes stehen in Abschluss/Diagnose, nicht als künstliche Mappingziele. Kein Altstapelfallback. Fail-/Mischlauf, Exportfehler, Replay, historische Dateien und Plugin-Abgrenzung sind regressionsgeprüft. |
| Echter Paket-Folgestapel mit defekter CSV wurde unbegrenzt als wiederaufnehmbar behandelt. | BL-020.1, BL-011.3, BL-002 | **E0 korrigiert:** bestätigte negative Parserantwort erhält `PARSE_FAILED` statt codeleerem Fehler; nur exakter Negativ-Envelope mit passendem Exit gilt als bestätigte Ablehnung. Unbekannte Abstürze behalten Unterbrechungssemantik, Timeout bleibt `PARSER_TIMEOUT`. Gemeinsamer Kern für Cowork/Standalone; Parser-Isolation 19/19 und Itemprozessor 16/16 grün, unabhängiger Gegencheck ohne neuen Defect. Erster RC107-Paketversuch aus `ebffe87` verworfen, keine INT-13-Bindung; frischer Commit und beide Builds erforderlich. |
| Firmenkurzformen wurden durch konkurrierende Personensamen falsch typisiert. | BL-030.2, BL-021.1, BL-002 | **E0 erledigt:** eindeutige Firmenaliasbindung, unklare Organisation bei Rechtsformkonflikt; natürliche Kundenpersonen und explizite Namensfelder auch in Listen bleiben Personen. Registry 26/26 und PII 120/120; beide Produktkontexte und Resume geprüft. |
| Grüne Tests und Dokumentation überzeichneten den Abschlussumfang. | BL-002, BL-051.1 | **E0 erledigt:** Frontendtests im Produktgate, historische PKG-04-Evidence exakt benannt, UML-IST/SOLL und Markdown-Zwischen-/Endartefakte getrennt. Produktsuite 40 Basis- und 111 direkte Dateien grün, geänderte Standalone-Kette abschließend erneut geprüft. PKG-04/INT-13 benötigen den neuen Kandidaten; E1/E2 bleiben offen. |

BL-010.28 ist im RC108-Quellstand technisch integriert: Modusbindung
durch Admission/IPC/Worker/v5-Journal, inhaltstreue Parser ohne Privacy-
Normalisierung, getrennte `dm_`-Artefakte mit Ablehnung an allen MCP-Lesegates,
modusgebundene Recovery/Delivery und `DataSecure-Markdown`-Export. Der neue
RC108-Standard war reine Konvertierung; seit DS-086 wird keine Betriebsart vorgewählt. XLSX/PPTX/PDF/Scan-PDF und
PNG/JPEG/BMP verwenden eine gebündelte Offline-Runtime. Extraktionshinweise
werden ohne PII-Review gespeichert; Defekte/geschützte Quellen erscheinen in
der Abschlusszuordnung. Native Windows-Startabbruch-Race und v5-Snapshot-/
Recoveryübergänge wurden im unabhängigen Integrationsreview korrigiert.
Der RC107-Receipt belegt diesen Ausbau nicht; der neue RC108-Schnitt ist oben
commitgebunden abgeschlossen. Zielhost-/Anwenderabnahme bleibt offen.

Nachtrag 06.09.2026 zu BL-030.2/BL-021.1/BL-002: Der echte Dokumentwechsel
mit neu aufgebauter Registry fand einen zusätzlichen Aliasdefect. Exakte bekannte
Personen-/Firmenformen werden nun aus rohwertfreien HMAC-Bindungen auch im freien
Folgetext ersetzt. Klammern, Separatoren, Rollenwechsel und Rechtsformkonflikte
sind regressionsgebunden (34 Registry, 23 State, 17 Item, 17 Journal, 120 PII grün).
Ein bindingsgebundener Anfangstokenindex verhindert die gemessene teure
Vollfenstersuche im Normalfall; kein neuer Anwenderdialog. Alter Snapshot bleibt
lesbar, alter Reader lehnt den neuen Index ab. Finaler Produkt-/Paketnachweis
bleibt an den folgenden sauberen Quellcommit gebunden.

Paketnachweis RC107 (BL-051.1/BL-002): `aaecf59` besteht die lokale CI-Produktsuite,
den gepackten Erfolgs-/Fehlerfolgelauf und den isolierten nativen Windows-Start.
PKG-04 bleibt aus diesem Versuch unvollständig: Die Cleanup-Inventur stoppte an
einer internen Windows-Cache-Junction, ohne Testdaten zu löschen. Der Testrest
bleibt erhalten. Nur ein eng geprüfter Harness-Vertrag für neu erzeugte
Testprofile mit synthetischen Negativtests darf einen neuen Zweifachlauf
ermöglichen; unbekannte Links bleiben verboten. INT-13 wird nicht vorab gebunden.
Der neue Testharness ist inzwischen implementiert: zwölf Desktop-Vertragstests
einschließlich acht synthetischer Cleanup-Gruppen prüfen zulässigen Cache-Link,
unveränderten Zielinhalt, falsche Ziele und ausgetauschte Objektidentitäten.
Der echte neue Zweifach-Build bleibt separat nachzuweisen.
Ein weiterer echter Smoke zeigte leere Junction-Providerfelder unter Windows
PowerShell. Der native No-follow-Tag-/Zielcheck ersetzt diese Anzeigeheuristik;
12/12 Desktop-Verträge sowie ein frischer vollständiger nativer Lauf inklusive
Bereinigung sind grün. Beide alten Testreste bleiben erhalten. PKG-04 wird erst
nach dem letzten Produktfix erneut ausgeführt.

Das unabhängige Gegenreview aus Test/CI, Dokumentation/UAT sowie Architektur,
Security, Performance, UX und aktueller Claude-Cowork-Sicht ist bis zum Abschluss
dieses Blocks ein **NO-GO für einen breiten Rollout**. Grüne E0-Tests ersetzen die
folgenden Produkt- und Zielhostnachweise nicht.

| Reihenfolge | Zugehörige Storys | Verbindliche Lieferung | Status |
|---|---|---|---|
| 1 | BL-002, BL-051.2, BL-052.1 | Produkt-, Legacy- und Engineering-Tests sowie GitHub-Workflows trennen; aktuellen UAT-Generator wirklich ausführen; Batch-Maintenance in die Produktregression aufnehmen. | **E0 erledigt** |
| 2 | BL-001, BL-002, BL-003 | `SECURITY.md`, Third-Party-Notices, Companion-/Governance-Altverträge, Register, Archivlinks und dokumentgesteuerte Link-/Driftgates auf den aktuellen Produktvertrag bringen. | **erledigt** |
| 3 | BL-012.2, BL-041.7, BL-044.1 | Keine stille Ordnerteilmenge, ehrliche Trennung zwischen Worker-Annahme und dauerhaftem Checkpoint sowie ausdrücklicher Prompt-Injection-Vertrag für übergebenes Markdown. | **E0 erledigt** |
| 4 | BL-010.7, BL-010.1, BL-041.7 | Cowork-Hostmatrix gemäß DS-078 korrigieren: Originale nur in lokaler Cowork-Sitzung eines bestehenden Desktop-Deployments mit laufendem Plugin-MCP oder lokalem Claude Code; Cloud-Cowork/Web/Mobil/Scheduled nutzen ausschließlich bereits freigegebenes Markdown. | **E0 erledigt; Zielhostevidenz offen** |
| 5 | BL-010.8, BL-010.1, BL-010.2, BL-010.3 | Selbsttragende Plugin-Runtime ohne System-Node für Windows x64 und macOS Intel/ARM bauen, paketieren und automatisiert prüfen. | **E0 implementiert; Zielhostevidenz offen** |
| 6 | BL-051.1, BL-051.2, BL-051.3, BL-051.5, BL-052.1–BL-052.5 | Fresh Install, Marketplace-Lebenszyklus, sichtbarer Cowork-Ablauf, Accessibility, Fach-/Security-/Datenschutz- und Anwenderabnahme mit dem ausführbaren UAT-Kit. | **menschliche Evidenz nach 1–5** |

Review-Evidence: Der aktuelle Node-UAT-Generator erzeugt reproduzierbar 111
synthetische Dateien. Produkt-, Engineering- und Legacy-Pfade sind getrennt;
Dokumentation, Hostmatrix, Ordnerannahme, Startstatus und Prompt-Injection-Vertrag
sind automatisiert geprüft. Der gebündelte Runtimevertrag deckt Windows x64 sowie
macOS Intel/ARM ab. Ein reales Windows-x64-Artefakt startete mit leerem `PATH`,
bestand MCP-Handshake/Status-Smoke und blieb unter 45 MiB (Build 01.09.2026:
34.845.038 Byte; lokaler Build 02.09.2026 nach dem Gesamtgegenreview:
34.913.330 Byte, SHA-256 `c34211c0…3815c`).
Reale macOS-Ausführung, Cowork-Fresh-Install und Marketplace-Lebenszyklus bleiben
menschliche Freigabeevidenz; bis dahin bleibt der breite Rollout NO-GO.

### Codex-Gegenreview RC92 – in RC93 E0 geschlossen

Die Befunde C-01 bis C-08 sind technisch behoben und regressionsgebunden.
C-04 wurde gegen DS-012 fachlich präzisiert: Anreden werden entfernt,
Qualifikationen bleiben. C-09 war kein Rohdatenabfluss; DS-071 grenzt die
Laufkennung nun ausdrücklich auf zwei vom Anwender beziehungsweise Support
aktivierte Diagnoseflächen ein. Es entsteht kein neuer Dialog. Die Änderungen
gehören zu BL-021.1, BL-042, BL-044.1 und BL-002. Echte Zielhost-, Cowork- und
Fachabnahme bleibt im Abschnitt B offen; insbesondere ersetzt die Regression
keinen Vollständigkeitsbeweis für alle künftigen Dokumentdarstellungen.

### Claude-Code-Gegenreview RC93 – in RC94 E0 nachkorrigiert

Das RC93-Gegenreview schloss Anrede-/Titel- und Startmarkerbefunde, führte bei
ungleich breiten Tabellenzeilen aber eine positionsbasierte Zuordnung ein. Der
unabhängige Codex-Gegencheck reproduzierte dadurch weiterhin klare Steuer-IDs bei
führenden oder fehlenden Zellen. RC94 ersetzt dieses Raten durch einen
eigenständigen Struktur-Restbefund: bis zu drei gleich breite, eindeutig bekannte
PII-Kopfzeilen werden verarbeitet; verschobene, überlange oder anders breite
sensible Tabellen stoppen fail-closed. Horizontal oder vertikal verbundene
DOCX-Zellen stoppen bereits im Parser. Exakte IT-/Health-IT-Begriffe wie
`Graph API`, `Project Server`, `Robot Framework`, `Imaging Protocol` und
`Treatment Protocol` bleiben erhalten, ohne Anredeerkennung allgemein zu
lockern. Zugeordnet: BL-021.1, BL-022.1, DS-012 und DS-049. Die automatisierte
E0-Korrektur ist erledigt; echte Word-/LibreOffice-Dokumente und Cowork bleiben
Zielhost-/Fachevidenz in Abschnitt B.

### In diesem Schnitt E0 abgeschlossen

| Story | Technischer Abschluss | Verbleibende Evidenz | Status |
|---|---|---|---|
| BL-011.8 | Journal, Intake-Intent, Arbeitsbaum und Cleanup sind größenbegrenzt sowie datei-/verzeichnisidentitätsgebunden; Austauschversuche und unsichere Strukturen stoppen fail-closed. | echtes Windows-/macOS-Dateisystem, Crash/Power-Loss und feindliche Race-Beobachtung über BL-011.11/BL-050.3 | **erledigt** |
| BL-020.1 | `data-secure-content-graph/v1` deckt TXT, Markdown, CSV und DOCX mit validierten Markdown-/Part-Locators ab; leere oder ungebundene Textknoten stoppen. | feinere Absatz-/Zelllocators sind erst für spätere Formatstories nötig | **erledigt** |
| BL-020.2 | Produktpreflight sperrt alle OOXML-Einbettungen; DOCX-Parser sperrt aktive Felder, Revisionen, Controls, externe/unklare Beziehungen und falsche Content Types fail-closed. | echter Office-Interoperabilitätskorpus und Security-Abnahme über BL-022.1/BL-049.1 | **erledigt** |
| BL-030.2 | zufälliger Stapelseed plus rohwertfreie HMAC-Alias-/Kollisionsbindungen werden dauerhaft gecheckpointet; Neustart, Alias, Manipulation und Fehlercleanup sind getestet – ohne Keyring oder Zusatzverschlüsselung. | echte Cowork-/OS-Neustart- und Crash-Fortsetzung über BL-011.3/BL-011.11 | **erledigt** |
| BL-011.10 | Eine atomare, prozessübergreifende Intake-Reservierung gilt vom Pickerstart bis zum dauerhaften Stapelcheckpoint. Die Reservierung kann sicher an den Worker delegiert werden; verwaiste Eigentümer werden fail-closed erkannt und zwei reale konkurrierende Prozesse lassen genau eine Aufnahme zu. | Mehrfachauswahl und Hintergrundstart in echter Cowork-Bedienung auf Windows/macOS messen | **erledigt** |
| BL-047.1 | Freigegebene Markdown-Snapshots werden asynchron und größenbegrenzt gelesen, gehasht und UTF-8-indiziert; ein 6-MiB-Regressionslauf belegt, dass der MCP-Ereignisloop währenddessen weiterläuft. | Referenzhardware messen und erst danach eine adaptive Parallelisierung bewerten; Produktstandard bleibt seriell | **erledigt** |
| BL-040.5 | Beim ersten startfähigen Lauf wird der dedizierte lokale Ergebnisordner erst nach erfolgreicher Anlage von `DataSecure-Output` dauerhaft gespeichert. Nur verifiziertes Markdown wird mit neutralen Namen exportiert; die Zielidentität ist gebunden und die Veröffentlichung ist exklusiv atomar, sodass eine zwischen Prüfung und Publikation entstandene Benutzerdatei nie überschrieben wird. Nur ein fehlgeschlagener Export wird nachgeholt, ein abgeschlossener Export ist endgültig (gelöschte oder bearbeitete sichtbare Ergebnisse werden nicht wiederhergestellt, ein Zielwechsel spiegelt keine alten Läufe). Private Daten bleiben getrennt, der Abschluss bietet „Ergebnisse öffnen“, rekursive Quellen dürfen den sichtbaren Output nicht wieder aufnehmen und die MCP-Startantwort wartet begrenzt auf die ausdrückliche Empfangsbestätigung des Workers. | Fresh Install, Neustart, Ordnerwechsel und Abschlussaktion in echter Cowork-Bedienung auf Windows/macOS beobachten | **erledigt** |

### Experten-Gegencheck RC95 – E0 abgeschlossen

Der Architektur-, Worker-, Performance-, Claude-/Cowork- und UX-Gegencheck schließt
vier zusammenhängende Restbefunde, ohne einen zweiten Produktweg einzuführen:

- Intake, Fortsetzung und lokaler Review gelten erst nach einer ausdrücklichen,
  inhaltsfreien Worker-Bestätigung als gestartet.
- Der Abschlussdialog nutzt eine zweiphasige Reservierung. Seit dem E0-Schnitt
  vom 05.09. bestätigt Standalone erst nach Renderer-Paint und Windows-Cowork
  erst nach nativem `Shown`; ein Fehler gibt die Reservierung für genau einen
  Worker-Fallback frei. Der AppKit-Adapter bestätigt ebenfalls erst nach einem
  sichtbaren `SHOWN`; offen bleibt seine native Intel-/ARM-Zielhostevidenz.
- Ein Stapel mit Mehrdeutigkeiten wechselt im bereits laufenden lokalen Worker
  direkt in den Sammelreview. „Später“ bleibt ein sicherer, fortsetzbarer Zustand;
  es folgt weder ein zweiter Cowork-Aufruf noch ein automatisches Freigeben.
- Ein offener sichtbarer Export wird nach dem MCP-Start in einem begrenzten Worker
  nachgeholt. Ergebnislisten verwenden die dauerhaft gebundene Paketidentität;
  der vollständige asynchrone SHA-256-Nachweis bleibt vor jeder Inhaltsübergabe
  verpflichtend.

Zugeordnet: BL-040.5, BL-041.9, BL-041.10, BL-043 und BL-047.1. Die automatisierte
E0-Evidenz ist grün; echte Windows-/macOS-Cowork-, Fokus- und Fresh-Install-
Beobachtungen bleiben in Abschnitt B.

### Windows-UAT RC95/RC96 und Laufzeitkorrektur RC97

Der erste reale RC95-Cowork-Lauf bestätigte den Picker und den echten
Worker-Handoff, erzeugte danach aber weder Stapelcheckpoint noch Ergebnis. Die
Claude-Desktop-Diagnose belegte: Der MCP-Elternprozess lief aus einer temporären
Pluginprojektion; nach Ende des Cowork-Aufrufs war dieser Quellbaum entfernt,
während der Hintergrundworker weitere Programmdateien daraus benötigte. UAT-01
ist für RC95 deshalb **fehlgeschlagen**, nicht „unentschieden“.

RC96 setzte damit DS-072 um und projizierte beim Start ausschließlich Produktcode und gebündelte Runtime in
einen dauerhaften, versionsgebundenen lokalen Runtime-Cache. Ein automatisierter
Regressionstest löscht den temporären Pluginbaum und startet danach den Worker
aus dem Cache. Zugeordnet: BL-010.8, BL-011.10, BL-041.7 und BL-051.5. Der reale
Der reale RC96-Wiederholungslauf zeigte dieselbe Wirkung: Cowork leitete auch
`LOCALAPPDATA` in eine sitzungsgebundene Umgebung um, sodass Cache und
Ergebnisordnerkonfiguration mit dem Toolaufruf verschwanden. RC97 erkennt nur
diese Claude-Temporärprojektion und bindet Produktzustand und Runtime-Cache an
das bestehende reguläre Windows-Benutzerprofil (DS-073). Der RC97-
Wiederholungslauf bleibt E1-Evidenz.

#### Standalone ohne Claude/Cowork mit lokaler Markdown-Konvertierung

Detailarchitektur: [`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).
Die Storys sind revalidiert aus Produkt-, UX-, Architektur-, Security-,
Performance-, Packaging- und Betriebsblick. Standalone ist ein eigenständiges
zweites Endnutzerprodukt ohne Claude, Cowork, MCP oder Agenten. Gemeinsam bleibt
nur der geprüfte DataSecure-Core. DS-075 ist der verbindliche Architektur- und
Vertrauensgrenzenentscheid. DS-076/DS-077 binden die Tauri-Hülle, den
Windows-x64-Engineering-Piloten, WebView2-Voraussetzung und Evidencegrenzen.

| Story | Lieferung / Abnahme | Status |
  |---|---|---|
| BL-010.9 | Direkte Standalone-Application-Schicht unterhalb von MCP: keine Toolnamen, Protokollversionen, Claude-Antwortfelder oder Handofflogik. Eigener Daten-/Konfigurations-/Review-/Exportroot wird vor Laden des Core aktiviert und an Worker weitergegeben. RC109 bündelt sieben reine Verträge für Start, Zweck, nächste Stapelaktion, Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt unter `server/core/`; Dateisystem-/Paketnachweise werden injiziert. Statischer Importabschluss, I/O-freie VM-Ausführung und beide echten Produktprojektionen sichern den Schnitt. Breitere Format-/Profil-/Recovery-Goldenbindung bleibt BL-010.23. | **erledigt** |
| BL-010.10 | Schlanke technische CLI für Datei-/Ordnerwahl, automatische Profilerkennung, Standard-Ergebnisordner und Ergebnisordneröffnung. Keine Rohpfade in Argumenten oder Ausgaben; kein Endnutzer-Terminal im freigegebenen Produkt. | **erledigt** |
| BL-010.11 | Native Desktop-Hülle: Tauri 2 ist gemäß DS-076/077/094 gesetzt. Reale Rust-Hülle, Tauri-CSP/Capability-Grenze, nativer Datei-/Ordnerpicker, korrelierter bidirektionaler Core-Dispatcher mit begrenzten Längenframes, 30-Sekunden-Antwortgrenze, Ready-Handshake, Neustart nach IPC-Fehler, Sidecar-Lifecycle und inhaltsfreie Rendererprojektion sind implementiert. Der Renderer besitzt keine direkten Dialog-, Datei-, Shell- oder Netzrechte. Windows x64 ist kompiliert und als laufender Engineering-Prozess sowie im selbsttragenden Pilot-ZIP geprüft. Kostenbestätigte GitHub-Runner-Gates prüfen auf Intel (`macos-15-intel`), Apple Silicon (`macos-14`) und Linux x64 (`ubuntu-22.04`) gepinnte Runtime, POSIX-Supervisor, Produkt-/Konverter-/Rust-Verträge, Clippy, nativen Release-Build und Architektur. Die macOS-App-Bundle-Läufe `34321954381`/`34322534571` und Distributionsläufe `34334520861`/`34335259239` bauen und prüfen die echten ad-hoc signierten App-Bundles; das Linux-Gate baut und prüft entsprechend das echte AppImage. Die Distributionsgates bauen ihr ZIP zweimal bytegleich, prüfen Manifest/SBOM/Lizenzen/Hashes/Modi, starten es nach dem Entpacken und stellen es optional für einen Tag bereit. RC134 ist auf dem Windows-Referenzhost mit 30 frischen Profilen vom Prozessstart bis zu UI-, IPC-, Sidecar- und Servicebereitschaft vermessen (p50 1,012 s, p95 1,124 s, Maximum 1,256 s); dies ist eine Fresh-Profile-, keine OS-Kaltstartmessung. Die reine Tauri-Hülle misst 3.549.184 Byte und bleibt unter 20 MiB. Zehn weitere Starts werden mit positiver TCP-/UDP-Kontrolle circa alle 100 ms vom Prozessstart bis zur Bereitschaft beobachtet; sie zeigen null TCP-Listener und null DataSecure-/Core-/Worker-UDP-Endpunkte. Root und Kinder sind an Erstellzeit, der Root zusätzlich an den exakten EXE-Pfad gebunden; WebView2-UDP wäre nur bei Microsoft-Signatur und exakt geparstem isoliertem Profil zulässig. Offen bleiben Tastatur/Screenreader, sichtbare Dateimanager-/Gatekeeper-Bedienung, Update/Rollback und menschliche Linux-/macOS-UAT. | **erledigt** |
| BL-010.12 | Ein Vorbereitungsbild mit Anzahl und Größe; danach passiver Fortschritt ohne Modal je Datei. Native Mehrfach-/Ordnerauswahl und Dragdrop verwenden denselben Core-Admissionpfad mit Pfad-, NUL-, Duplikat-, Format- und Größengates. Die Auswahl ist ausschließlich lokal sichtbar und startet erst über den zum gewählten Modus passenden Startbutton, ohne zweiten Picker. Vorher können einzelne eindeutig dargestellte Dateien entfernt oder die gesamte Auswahl geleert werden. Native Guards verhindern konkurrierende Auswahl/Start und unbemerktes Ersetzen einer vorbereiteten Auswahl. Die UI gruppiert die tatsächlich zugelassenen Quellen in direkt lesbare Textquellen und lokal in Markdown umzuwandelnde Quellen. Gesperrte, unbekannte und verschlüsselte Quellen bleiben Ergebnisse des vorgeschalteten Admissiongates und werden niemals als zugelassene Auswahl gezählt. RC115 hebt die zentrale Grenze auf 200 Dateien bei unverändert 500 MiB. E0 ist erledigt; offen bleibt ausschließlich E2 für Dragdrop, Auswahlkorrektur, Gruppendarstellung, 200 Dateien und 500 MiB. | **erledigt** |
| BL-010.13 | Bestehenden Sammelreview und Klar-Datei-Pfad wiederverwenden. **Start**, **Verarbeiten** und **Verlauf** trennen seit DS-086 Navigation und Laufzustand. Jede Verlaufszeile bindet ihre drei Aktionen an den eigenen `Lauf-*`-Ordner. Für **Ergebnisse öffnen** und **Zuordnungsdatei anzeigen** löst der Sidecar ausschließlich den vollständig sichtbaren Lauf bzw. dessen `DataSecure-Zuordnung.csv` auf; Rust validiert das private Ziel und startet Explorer/Finder/`xdg-open` sichtbar. Die Öffnungsaktion liefert dem Renderer nur eine inhaltsfreie Übergabebestätigung; ein separates `aria-live` überschreibt den Laufstatus nicht. Der UI-Kontext ergänzt ältere Exportrecords journalgebunden vor der Anzeige. Der reale Paket-Smoke verarbeitet vier Formate und prüft stabile Personen-/Firmenkennungen, unveränderte Quellen, exakten Lauf, Mapping und beide Resolver. RC115 schreibt die sichtbare Zuordnungsdatei mit UTF-8-BOM. Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel; ein interner Abschluss ohne sichtbaren Export bleibt `export_pending`. Der lokale Core-Reviewer ist für Standalone bewusst zuständig; Rohinhalt wird nicht in den Renderer verlagert. E0-Verträge sind geschlossen; sichtbare Zielhostbedienung bleibt E1/E2. | **erledigt** |
| BL-010.14 | Absturz-/Abbruchfortsetzung, genau ein aktiver Stapel, keine Doppelverarbeitung, Quellen unverändert und niemals automatisch gelöscht. Der öffentliche Stand zeigt vorhandene fortsetzbare Stapel als `stopped`/`resumable`; nach Sidecar-Neustart oder verlorenem Admission-Zustand setzt der Renderer die veraltete Startfreigabe zurück und verlangt eine neue lokale Auswahl. Echter Desktop-Absturz-/Neustart-UAT bleibt offen. | **erledigt** |
| BL-010.15 | MarkItDown 0.1.7 ist als gepinnter, produktiv deaktivierter DOCX-Differentialadapter implementiert: Byte-Stream, nur expliziter DOCX-Konverter, Plugins/Built-ins/Netzwerk/LLM/OCR aus, keine persistierte rohe Markdown-Datei. Engineering-Bridge mit `-I -S`, ohne Host-TEMP/PATH; ungerahmter, nicht authentisierter Testtransport. Optionales Vergleichsorakel, keine Voraussetzung und keine ausstehende Aktivierung für den RC108-Produktkonverter. | **erledigt** |
| BL-010.16 | Vereinfachter Konvertierungsbundle ist implementiert: vorhandene JS-Konverter statt CPython/MarkItDown im Nutzerpaket; gepinntes normales Node, PDF.js, Canvas, Tesseract und DE/EN-Modelle mit Hashinventar, Lizenztexten, SBOM und reproduzierbarer Projektion. Windows-Worker sowie die Läufe `34285518668` auf nativem Apple Silicon und `34318293471` auf nativem Intel prüfen die echte projizierte Runtime. Die App-Läufe `34321954381`/`34322534571` prüfen sie im gestarteten Bundle; `34334520861`/`34335259239` zusätzlich im entpackten Distributions-ZIP. RC109-PKG-04/INT-13 für Windows ist abgeschlossen. Python bleibt optionales Differentialorakel, keine Nutzerabhängigkeit. | **erledigt** |
| BL-010.17 | Eigener realer Konvertierungsworker über bestehenden Windows-/POSIX-Supervisor ist integriert: vollständige Byte-Eingabe, feste Antworten, CPU/RAM/Zeit/Ausgabegrenzen und bestätigtes Prozessende bei Abbruch. Windows bindet das Kind bereits bei Erstellung atomar an den Job; 60 frühe Abbrüche sowie Timeout und verweigerte Beendigung sind getestet. Die Läufe `34285518668` und `34318293471` belegen Supervisor, real isolierten Office-/PDF-/OCR-Worker und bestätigte Prozessgrenzen nativ auf macOS ARM64 und Intel. Keine neue Benutzerkonfiguration. Die aktuelle Windows-Paketkette ist abgeschlossen; menschliche Zielhostbedienung bleibt offen. | **erledigt** |
| BL-010.18 | Standalone markdown-only: XLSX/PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP mit echter Offline-OCR umgesetzt. PDF-Seiten behalten nativen Text; auch gemalte Bildinhalte neben Seitenzahlen/Headern werden per OCR gelesen. Vergleichsnormalisierung verhindert identische OCR-Duplikate, zusätzliche Bildtexte werden gekennzeichnet; eine OCR-Session je PDF. Echte synthetische Inhalts-/PII-Erhalt-, Negativ- und Quellenhashprüfungen stehen. Unvollständige Extraktion bleibt als Hinweis sichtbar; gefährliche/defekte Quellen stoppen nur die Datei. Das erweitert weder den Cowork-Formatumfang noch die Vollständigkeitszusage für Originalcontainer; die Standalone-Markdown-first-Anonymisierung ist separat in BL-010.30 geregelt. Der neue Windows-Paketnachweis steht; ein breiter Zielhost-Korpus bleibt offen. | **erledigt** |
| BL-010.19 | Produktkonverter ist an die bestehende **Opt-in-Supportspur** gebunden: `converter_started`, `coverage_checked` nach erfolgreicher Vertragsprüfung sowie genau `converter_completed` nach Artefaktpublikation oder `converter_stopped` mit festem Fehlercode. Coverage-Prüfung behauptet keine vollständige Extraktion; Grad und Gründe bleiben im Artefakt/v5-Journal und der Zuordnung. Rust-Sidecar-Start und Batchworker reichen ausschließlich `EU_PRIVACY_SUPPORT_MODE=1` gezielt weiter. Normalbetrieb behält seine Interaktionslogs ohne zusätzliche Supportspur oder Nutzerformular. Echte Parser-/Spool-/Artefakt- und Negativtests prüfen Erfolg, Abbruch, unbekannte Fehler, Inhaltsfreiheit und wirkungslose Diagnosefehler; keine Rohinhalte, Namen, Pfade, Hashes, argv/env oder Vendor-Ausgaben im Log. | **erledigt** |
| BL-010.20 | Getrennte Standalone-Zielpakete für Windows x64, macOS x64/ARM64 und Linux x64 glibc mit Core, Konverter/OCR, Manifest, SBOM, Hashes und isolierten Smokes. RC140-Windows-PKG-04/INT-13 sowie die damaligen nativen Mac-/Linux-Läufe sind gebunden. **MAC-20260923-01–03 in RC141 technisch korrigiert:** Deployment-Target, Addon-Signatur und numerische Plist-Versionen; alle nativen Komponenten, LaunchServices und echte Konvertierungs-/Anonymisierungs-/Verlaufstests bestehen auf Intel/ARM (`35875613438`, Quellcommit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`). Neue ZIPs lokal verifiziert und samt Prüfsummendateien unverändert im dauerhaften Mac-Vorabrelease `v3.2.0-rc141` veröffentlicht; Tag, Größen und Asset-Digests geprüft. Zweifach bytegleiche Archivierung aus je einem nativen App-Build, kein unabhängiger Compiler-Doppelbau. Veröffentlichte RC140-ZIPs bleiben unverändert. Developer-ID/Notarisierung bleiben für breite Verteilung erforderlich; Ad-hoc-Pilot mit app-spezifischem **Dennoch öffnen**, ohne globale Schutzabschaltung. Sichtbare Finder-/Gatekeeper-/13.5-/Rollback-UAT bleibt getrennt. | **erledigt** |
| BL-010.21 | E1/E2-UAT beider Betriebsarten auf Windows sowie nativ auf macOS Intel/Apple Silicon und für Standalone zusätzlich Linux x64: tatsächlicher Browser-Download beider Release-Dateien, Prüfsumme, Finder-Entpackung, Kopie nach Programme, LaunchServices/Gatekeeper beziehungsweise Desktop-Integration, erste Nutzung und synthetischer Konvertierungs-/OCR-Lauf aus genau dieser Installation, falsches Architekturpaket, 200 Dateien/500 MiB, gemischte Formate, Picker/Drop und expliziter Start, Fehler/Crash/Resume, Offline-Lauf, Ergebnis-/Zuordnungsfund, VoiceOver beziehungsweise Linux-Screenreader/Tastatur/Zoom/Fokus/Dark Mode, Kaltstart/RAM/Paketgröße und verständliche DE-Texte. Die deklarierte Mac-Mindestversion 13.5 benötigt separate Ausführung oder eine explizit höhere Mindestversion. Reine Konvertierung erhält Inhalte und zeigt Extraktionshinweise ohne PII-Review; fachlicher Sammelreview gehört zur Anonymisierung. Ein ARM-Lauf unter Rosetta ersetzt keinen Intel-Nachweis. | **offen** |
| BL-010.22 | Produktisolation: eigener Standalone-Root und gebundener Journal-Kanal; v5-Konvertate besitzen ausschließlich `dm_`-Identitäten ohne Privacy-Capability und werden an Plugin-Listing, Handoff, Read und ACK abgewiesen. RC109 startet beide tatsächlichen Produktprojektionen parallel in getrennten Prozessen und Datenwurzeln; kopierte fremde Journale werden vor jedem Quellen-/Artefaktzugriff abgewiesen. Paketverträge verhindern Plugin-/Skill-/MCP-Entrypoints und Cloudfunktionen im Standalone-Produkt. Gleichzeitige Starts beider wirklich installierter Zielhostprodukte bleiben E1-offen. | **erledigt** |
| BL-010.23 | Gemeinsamer Corevertrag für den **Anonymisierungsmodus**: gemeinsame Core-/Privacy-Bytes der tatsächlichen Produktprojektionen sind durch Fingerprint und semantischen Golden-Korpus gebunden. Neue Privacy-Journale persistieren zusätzlich den exakten SHA-256-Fingerprint der ausführungsbestimmenden gemeinsamen Policydateien; Fortsetzung mit abweichender Policy stoppt, während kompatible Altdaten ohne Feld nur bei exakt passender Regelversion lesbar bleiben. TXT, Markdown, CSV und DOCX laufen in beiden Produkten durch alle fünf Profile; Abbruch, frischer Prozess, Review und Fortsetzung prüfen stabile Personen-/Unternehmensbijektion. Reine Markdown-Konvertierung bleibt ein eigener Zweck ohne PII-Ersetzung oder Privacy-Fingerprint. E0 ist erledigt; Zielhost-/Fachabnahme bleibt E1/E3. | **erledigt** |
| BL-010.24 | Offline-/Environment-Vertrag: Kindprozesse erhalten nur allowlistete OS-/DataSecure-Werte, keine geerbten Proxy-, Token-, API-Key-, Agent- oder Cloudwerte. Echter Konverter startet mit leerem PATH, gebündelten Ressourcen, Node-Berechtigungsgrenze und `network-deny`; lokale Modelle benötigen keinen Download oder Cachewrite. RC109 prüft beide tatsächlichen Produktprojektionen mit jeweils elf nativen DNS-/TCP-/TLS-/HTTP-/UDP-/Fetch-/Proxy-Canaries und genau einem kontrollierten produktübergreifenden Kopierversuch. Paket-/Zielhost-E2E bleibt E1-offen. | **erledigt** |
| BL-010.25 | Eigenes Standalone-Manifest, SBOM und Runtime-Evidence einschließlich Konvertierungsressourcen sind implementiert; kein Netzwerk-/Auto-Updater. Das RC109-Inventar erfasst 259 erreichbare Nicht-Dev-Crates und enthält kein `NOASSERTION`; automatisierte Lizenz-/SBOM-Verträge sichern diesen Stand. Manueller Update-/Rollbackweg durch Paketaustausch und Deinstallation sowie die Wechselwirkung mit dem anderen installierten Produkt bleiben Zielhostabnahme. | **erledigt** |
| BL-010.26 | Diagnose-/Fehlerübersetzung: getrennte Produktkanäle, feste Konverterfehlercodes und rotierende, über **Diagnose öffnen** erreichbare Desktop-/Sidecar-JSONL-Spuren ohne Rohinhalte, Namen, Pfade oder Request-IDs. Zielresolver-/OS-Öffnereignisse und sichtbare Version bleiben erhalten. Der reine Produktkonverter einschließlich PDF/OCR liefert bei ausdrücklichem Support-Opt-in die vier geschlossenen Ereignisse aus BL-010.19; echte Parser-/Abbruch-/Sentineltests stehen E0. Interne `CONVERSION_OCR_STARTING/READY` dienen weiterhin nur der echten Prozessprüfung; stderr wird nicht als Log kopiert. Keine neue Einstellung oder Bestätigungsrunde. Der aktuelle Paketnachweis einschließlich Supportspur ist abgeschlossen; Windows-/macOS-/Linux-UAT der Standalone-Meldungen und Diagnosebedienung bleibt offen. | **erledigt** |
| BL-010.27 | Releasehygiene des Standalone-Piloten: Windows verwendet das vorhandene System-WebView2 ohne Laufzeitdownload; verständlicher Fehlhinweis und UAT bei fehlender Runtime. Die Builder-Toolchain ist mit `rust-toolchain.toml` exakt auf Rust 1.98.1 gebunden; erreichbare ausgelieferte Crates werden komponentenweise lizenzgeprüft und mit belastbaren Lizenzwerten in das SBOM übernommen. Native Dragdrop-Aufnahme ist E0 implementiert; echte Zielhost-Drop-/Fokusprüfung bleibt offen. Die frühere Legacy-Oberfläche hatte keine Pause; die v2-Pause ist mit RC159 veröffentlicht und wird weiterhin getrennt in BL-010.53 geführt. | **erledigt** |
| BL-010.28 | Zweite Standalone-Kernfunktion **Nur in Markdown umwandeln** (DS-085/088): verfügbare Kernfunktion ohne PII-Ersetzung/-Review; keine Vorbelegung seit DS-086. Namen und Inhalte bleiben erhalten. Sichtbare Ergebnisse übernehmen den Quellbasisnamen mit `.md`; case-/Unicode-gleiche Kollisionen erhalten deterministisch ` (2)`, ` (3)` usw. Eine Zuordnungsdatei entfällt in diesem selbsterklärenden Modus. v5-Zweckbindung, eigener Offline-Worker, `dm_`-Artefakte, Recovery und v4-Export nach `DataSecure-Markdown/Lauf-…` sind integriert; bestehende v3-Exporte bleiben final. TXT/MD/CSV/DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP; Warnungen ohne zusätzliche Rückfragen, Fehler je Quelle. Keine KI-Übergabe. Zielhost-UAT des neuen Bedienvertrags bleibt offen. | **erledigt** |
| BL-010.29 | Startseite und laufgebundener Verlauf (DS-086/088): Start immer sichtbar, keine automatische Ergebnisnavigation, Betriebsart anfangs leer. Die 20 neuesten Standalone-Verarbeitungen als Tabelle mit Datum, Zweck, Zählern und Status; Ergebnis und Fortsetzung binden ausschließlich den gewählten Lauf. Zuordnung ist nur bei Anonymisierung aktiv und bei reiner Konvertierung begründet deaktiviert. Historie über Neustart/Journalablauf und Ergebniszielwechsel erhalten, Ein-Stapel-Guard und geschlossene private IPC. Keine Rohinhalte oder Pfade in Diagnoselogs; 20 ist nur Anzeigegrenze. Implementierung und gezielte Tests stehen; menschliche E2-Abnahme bleibt offen. | **erledigt** |
| BL-010.30 | Standalone-Markdown-first-Anonymisierung nach DS-087, DS-090 und DS-098: DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP genau einmal im isolierten Offline-Worker zu einer neutralen Markdown-Extraktion verarbeiten und gültigen, nichtleeren Inhalt ohne sichtbares `dm_`-Zwischenartefakt durch den vorhandenen Privacy-Core führen. Anonymisiert und ausgegeben wird ausschließlich die Markdown-Repräsentation, nie der Originalcontainer. Bei DOCX werden vollständig validierte Kopf-/Fußzeilen und ausschließlich dort referenzierte Bilder nur im Anonymisierungszweck nicht projiziert; reine Konvertierung erhält sie. Extraktionsabdeckung (`complete`/`incomplete` plus feste Gründe) und Anonymisierungsstatus werden unabhängig ausgewiesen; `incomplete` ist keine Behauptung unvollständiger Markdown-Anonymisierung. Leere/Whitespace-Extraktion, `OCR_TEXT_EMPTY`, unbekannte Coverage, beschädigte, verschlüsselte oder aktive Quellen stoppen die betroffene Datei. Direkte und konvertierte Quellen teilen stapelweit Personen-/Unternehmenspseudonyme, vorhandenes v4-Journal/Recovery und Mapping `Original → anonymisierte Markdown-Datei`. Pflicht: neutraler Extraktionsvertrag, Recoverybindung, Mixed-Batch-/Resume-/Residual-/Cross-Read-/Offline-/Pakettests und ehrliche UI/Dokumentation. RC121 bindet den realen DOCX-UAT-Befund, Markdown-escapte E-Mail-Adressen und den ausgelieferten Sidecar durch synthetische Paketregressionen; auch die spätere Sammelreview-Publikation übernimmt den Standalone-Kanal ausdrücklich und behält Scope sowie Coverage bei. RC123 projiziert einen nicht bestätigten Konverterabbruch auch aus dem breiten Journal-Schema `/6` als `termination_unconfirmed`, damit die lokale Oberfläche den gespeicherten Abbruchgrund nicht verliert. Der Cowork-Officeausbau ist getrennt unter BL-010.34 gebunden. | **erledigt** |
| BL-010.31 | Vorbereitete Auswahl und Ergebnisaktionen nach DS-088: einzelne Dateien vor Start über einen indexgebundenen, längengerahmten privaten IPC-Befehl entfernen; letzte Datei oder **Auswahl leeren** setzt Admission und UI vollständig zurück. Die lokale Liste nutzt eindeutige Quelllabels, ohne sie zu protokollieren. Gleicher Vertrag für beide Funktionen, unveränderlicher Stapel nach Start. **Ergebnisordner** steht auch unter Verarbeiten bereit, übernimmt beim App-Start keinen historischen Lauf und wird erst durch einen exakt neu in dieser UI-Sitzung gestarteten vollständigen Lauf aktiviert; alte Läufe bleiben ausschließlich über die Historie erreichbar. JS-, Rust-, IPC-, Frontend- und Paketregression; E2-Zielhostbedienung offen. | **erledigt** |
| BL-010.32 | Reproduzierbarer Standalone-UAT-Korpus mit genau 100 synthetischen Dateien: elf Eingabearten, jeweils kurz/mittel/groß, Fließtext-, Tabellen-, Mehrseiten-, Mehrblatt-, Präsentations- und OCR-Beispiele. Manifest und README liegen außerhalb des auswählbaren Eingabeordners, damit ausschließlich die 100 vorgesehenen Testeingaben verarbeitet werden; die Produktgrenze liegt bei 200 Dateien. Der Korpus prüft direkte beziehungsweise Markdown-first-Anonymisierung und rekursive Ordneraufnahme aller Unterordner. Generator und ZIP bleiben frei von echten Personendaten. Der exakt gebundene RC134-Windows-Sidecar hat alle 100 Dateien im Modus `markdown-only` in 50,892 s Verarbeitungszeit beziehungsweise 51,092 s gesamter Harnessdauer ohne Fehler verarbeitet, die vollständige relative Struktur erhalten, keine Zuordnung erzeugt und alle Quellhashes unverändert gelassen; die sichtbare Zielhost-UAT sowie der 100-Dateien-Anonymisierungslauf mit gegebenenfalls menschlichem Review bleiben offen. | **erledigt** |
| BL-010.33 | Strukturtreuer Standalone-Export nach DS-089 und DS-091: Die Wurzel-relative Herkunft einer Ordnerauswahl bleibt von der sicheren Rekursion über Queue und Journal bis zum sichtbaren Lauf erhalten. Vor Start wählt der Anwender für Anonymisierung **neutral** (datensparender Standard: `Dokument-NNN-anonymisiert.md`) oder **Originalname mit -anonymisiert** (`<Quellbasis>-anonymisiert.md`); die Zuordnung nennt in beiden Fällen exakt `relativer/Quellpfad` → `relativer/Ergebnispfad`. Die Wahl ist ohne Zusatzbestätigung pro Stapel in `datasecure-batch/6` unveränderlich gebunden; alte Standalone-v4-Läufe, reine Konvertierung (`<Quellbasis>.md`, keine Zuordnung) und Cowork (immer neutral/flach) bleiben unverändert. Segmente werden gegen absolute Pfade, Traversal, Links und Verzeichnistausch geprüft; Kollisionen bleiben deterministisch. E0-UI-/Rust-/IPC-/Worker-/Journal-/Export-/Recoverytests; E2-Zielhost-UAT offen. | **erledigt** |
| BL-010.34 | Cowork-Markdown-first-Office nach DS-093: XLSX/PPTX nach sicherem OPC-Preflight im ausgelieferten isolierten Parser extrahieren, Tabellen für den Privacy-Core normalisieren und ausschließlich die nichtleere Markdown-Repräsentation anonymisieren. `source_extraction_coverage` bleibt mindestens `incomplete/SOURCE_COVERAGE_UNVERIFIED`, während `document_result` die vollständige Privacy-Prüfung des extrahierten Inhalts ausweist. Genau ein Picker, kein Roh-Zwischenexport, neutrale Namen, privates Mapping und unveränderte Originale. E0 umfasst reale isolierte Officeparser-, Admission-, Batch-, Paket- und Cross-Produkt-Regression; E1/E2 Cowork-Zielhost-UAT offen. PDF/Scan-PDF/Bilder bleiben bis zum kompakten, paketierten und nativ belegten OCR-/PDF-Pfad offen. | **erledigt** |
| BL-010.35 | RC136-UAT-Härtung nach DS-100: rekursive Standalone-Aufnahme überspringt ausschließlich belegte Office-Besitzerdateien `~$*.docx/xlsx/pptx`, nachdem Link-/Dateitypprüfung, kleine Artefaktgröße, fehlende eigene OPC-Signatur und eine passende größere OPC-Quelldatei im selben Ordner bestätigt wurden. Ein echtes OPC-Dokument wird nie allein wegen seines Namens verworfen; direkte Artefaktauswahl wird fest abgewiesen und nur die Anzahl erscheint lokal. Ein App-Neustart projiziert keinen inaktiven Altstapel, kein altes Ergebnis und keine Fortsetzungsaktion in die aktuelle Prozesskarte. Historische Fortsetzung bleibt exakt laufgebunden im Verlauf; Start-Recovery bereinigt weiterhin verwaiste Sperren und unvollständige Veröffentlichungen, ein lebender Worker wahrt die Ein-Stapel-Sperre. Golden-, Admission-, Service-, Frontend-, History- und Recoverytests sind E0-grün; RC137 bindet Windows-PKG-04/INT-13 sowie native Windows-/macOS-/Linux- und Cowork-Zielpakete. Sichtbare Zielhost-UAT bleibt offen. | **erledigt** |
| BL-010.36 | DS-102: RC140-Regression der reinen Windows-Konvertierung für interaktive PDFs und PPTX mit eingebetteten OLE-Objekten behoben, ohne die strengere Anonymisierung oder Cowork zu öffnen. Passive Objekte werden nicht ausgeführt oder nachgeladen; Extraktionsstatus bleibt `incomplete`. Isolierte Worker-, Admission-, Produktgrenz- und fünf reale Paket-Dateiprüfungen bestanden. RC142-Windows-PKG-04/INT-13: zwei bytegleiche Builds, native Smokes, Commit `c0ddd11`. Mac Intel/ARM: ZIP und zusätzlich DMG aus derselben signierten `.app`, Mount, `/Applications`-Link, Signatur, Start und Hash im grünen Lauf `36562812021`. Alle zehn Release-Asset-Digests lokal abgeglichen. DMG bleibt bis Developer-ID/Notarisierung interner Pilot; sichtbare Zielhost-UAT offen. | **erledigt** |
| BL-010.37 | Standalone ergänzt vor **Starten** weitere Dateien oder rekursive Ordner über Picker/Drop, ohne Duplikate; ungültige Nachträge, Dialogabbruch und Überschreiten der kombinierten 200-Dateien-/500-MiB-Grenze lassen die bestehende Auswahl unverändert. Der laufende Stapel bleibt unveränderlich. Frontend-, Rust-, Service- und realer Sidecar-Pakettest bestanden; die Änderung ist im RC151-Standalone aus sauberem Commit veröffentlicht. Der Windows-Funktionslauf belegt die Verarbeitung einer rekursiven 140-Dateien-Auswahl, aber nicht jeden Ergänzungs-/Limit-/Abbruchfall in der sichtbaren UI. | **erledigt** |
| BL-010.38 | Standalone trennt abgeschlossenen Lauf und frische Vorbereitung; Abschluss zeigt keine alte Eingabequeue, der neue Lauf erbt weder Modus noch Quellenordner. Vollständig gestoppte Läufe und Teilerfolge werden als Warnung ausgewiesen. Frontend-/Service-Regressionsprüfung und RC151-Paketbindung sind erfolgt. Der Anwender hat auf Windows Folgeläufe in beiden Modi ausgeführt; die vollständige E2-Bedienabnahme der Zustandsübergänge bleibt getrennt offen. | **erledigt** |
| BL-010.39 | DS-103: Standalone anonymisiert nach passiver Markdown-Extraktion auch PDF/Scan-PDF und PPTX. Formulare, Skripte, Anhänge, Signaturen, Links, Lesezeichen und OLE werden nicht ausgeführt und können ausgelassen bleiben; `source_extraction_coverage` bleibt getrennt und unvollständig. Nur der extrahierte Markdown-Inhalt wird anonymisiert und residualgeprüft. Leere OCR, verschlüsselte/beschädigte Quellen, XFA, Makros, ActiveX, externe Vorlagen und unbekannte Objektklassen stoppen weiter; Coworks strengere Admission bleibt unverändert. Reale Paket-/Batch-/Quellhash-/Coverage-/Mappingtests und der RC151-Windows-Gesamtlauf mit 140 anonymisierten Ausgaben belegen E0 und den positiven Zielhostpfad; Negativgrenzen und Quellvollständigkeit sind dadurch nicht fachlich freigegeben. | **erledigt** |
| BL-010.40 | RC144-Windows-Befund: Der lokale Sammelreview war bei 11/12 unsichtbar. RC145 startete den Dialog ohne versteckten Top-Level-Start; im sichtbaren Windows-Test erschien er und der Stapel endete nach lokaler Entscheidung mit 11 Ergebnissen und einem sicheren Stopp. Die folgende Fundstellen-UX benennt den konkreten Text und hebt ihn in Quelle und Arbeitsfassung hervor; ein echter WinForms-Dialogtest prüft den Wechsel zwischen Fundstellen. Navigation und Abschlussstatus erklären aktiven Review und gesperrten Ergebnisordner. Alle Änderungen sind im RC151-Paket gebunden; eine sichtbare RC151-Prüfung jeder Reviewaktion auf Windows und macOS bleibt E2, nicht neue E0-Arbeit. | **erledigt** |
| BL-010.41 | RC147-Windows-Befund: Fünf PPTX stoppten mit `SOURCE_ACTIVE_CONTENT_UNSUPPORTED`. Standalone lässt seitdem nur bekannte passive PPTX-Metadaten-/Diagrammstilbeziehungen und intern geprüfte XLSX-Einbettungen zu; OLE bleibt ausgelassen, Coverage `incomplete`, Makros/externe Pakete und Coworks strengere Admission bleiben gesperrt. XLSX bleibt wegen Blatt- und Strukturverlust direkt Markdown-first statt CSV-Zwischenschritt. Synthetische Positiv-/Negativfälle, schreibgeschützte Extraktion der fünf Quellen und ein echter Windows-Paketbatch bestanden; die Änderung ist im RC151-Paket veröffentlicht. Ob genau die fünf alten Benutzer-PPTX im RC151-Korpus enthalten waren, ist aus dem 140-Dateien-Abgleich nicht belegt und bleibt ein gezielter E2-Nachweis statt eines erneuten Gesamtbuilds. | **erledigt** |

| BL-010.42 / BL-021.3 | RC149 ergab 138/140 Privacy-Ergebnisse; zwei DOCX stoppten wegen „Service Level“ und „Fail Closed“ als unlokalisierbaren Rest-Personenkandidaten. Exakt einfache technische Tabellenzellen gehen nun in den positionsgebundenen lokalen Review; sensible Labels, transformierte Zellen und direkte Identifier bleiben strikt. Gleichartige normalisierte Kandidaten werden pro Prüfgruppe einmal entschieden, intern aber an jeder Fundstelle geprüft. Die Abschlussansicht lädt Dateinamen mit `batchId` aus dem privaten Journal. Gezielte E0-Tests und der paketierte RC151-Windows-Gesamtlauf mit 140/140 anonymisierten Ergebnissen sind erfolgt; sichtbare Einzelbedienung auf beiden Plattformen und vollständige Quellabdeckung sind weiterhin eigene Abnahmepunkte. Keine automatische Freigabe unbekannter Personen. | **erledigt** |
| BL-010.43 / BL-021.4 | Der RC150-Inhaltsabgleich deckte verlorene Einleitungssätze, überanonymisierte technische Titel sowie nicht ersetzte synthetische Namen in Begleitdateien auf. Der Privacy-Core begrenzt Organisationsspannen, erfasst Personen in nummerierter Prosa und sensiblen Tabellenzellen, bewahrt beschreibende Titel und ersetzt bindestrichgetrennte Vollnamen vor bloßen Nachnamenaliasen. Der unabhängige Restcheck bleibt aktiv. Gezielte positive/negative Regressionen und der veröffentlichte RC151-Gesamtlauf sind erfolgt; dessen schreibgeschützte Inhaltsnachprüfung bestätigt ausgewählte Sollstellen, 2168 CSV-Beschreibungen und Identitätsanker. Eine vollständige menschliche Satz-für-Satz-/OCR-/Originalcontainerprüfung ist damit nicht behauptet; alte RC150-Ausgaben bleiben unverändert. | **erledigt** |
| BL-010.44 | **Standalone-only Review-UX nach DS-104:** Eigenes berechtigungsarmes App-Reviewfenster ohne Rohtext im inhaltsfreien Haupt-Renderer und ohne Cowork-/MCP-Abhängigkeit. Flüchtiger 40-MiB-Broker, 128-KiB-Frames, exakter Fundstellentext, Gruppenentscheidung, „Später entscheiden“, laufgebundene Fortsetzung und asynchroner Fensterbau sind umgesetzt. Mehrere Prüfphasen bleiben mit Arbeitsindikator im selben Fenster; der bestätigte Laufabschluss schließt es. RC157 bietet „Jetzt prüfen“ direkt in der aktuellen Laufkarte und lehnt historische Ersatzläufe nach Verbindungsneustart ab. JS-/IPC-/Rust-/Pakettests und nativer Windows-Start bestehen. RC156 `ca4349c5` und RC157 `3d6b69b7` einschließlich lokaler Prüfung und Stapelverarbeitung sind vom Anwender bestanden bestätigt; letzterer enthält 140/140 Ergebnisse. Die E0-Lieferung ist fertig. Andere Zielhosts, A11y und vollständige Negativ-/Recovery-Abnahmen stehen getrennt in Abschnitt B und der Evidence-Matrix. Kein RC151-Bestandteil. | **erledigt** |
| BL-010.45 | **Vertrauliche automatische Identitätszuordnung nur für Standalone:** Personen-, Unternehmens- und Projektpseudonyme werden lauf-/dateigebunden privat erfasst; `[PERSON_011]` ist nur ein Beispiel. Generische Masken und unklare Quellen gelten nicht als 1:1-Zuordnung. Die lesbare TXT wird einmalig im markierten Unterordner `VERTRAULICH-NICHT-HOCHLADEN` des gebundenen Lauf-Ergebnisordners abgelegt; private Einzelsnapshots bleiben im App-Datenbereich. **Der ganze Laufordner darf damit nicht an KI-Systeme übergeben werden**, nur einzeln geprüfte anonymisierte Markdown-Dateien. Der Verlauf öffnet die Datei laufgebunden lokal; ältere private Zuordnungen bleiben über Einstellungen erreichbar. Kein automatisches Löschen und kein App-Löschbutton; eine manuell entfernte sichtbare Kopie wird nicht neu angelegt. Cowork und Privacy-Entscheidungen bleiben unverändert. RC156-Modul-/Verlaufstests und der isolierte Paket-Sidecar-Lauf mit realen TXT/MD/CSV/DOCX-Dateien bestätigen die vertrauliche TXT im markierten Lauf-Unterordner; noch offen: sichtbare Zielhost-/Recovery-/A11y-Abnahme, Bedrohungsmodell, Datenträgerverschlüsselung/Backup-Hinweis und vollständige Originalwertabdeckung an realen Formaten. Keine Anonymitäts- oder KI-/Rechtskonformitätsgarantie. | **in Arbeit** |

#### Neue Befunde vom 05.10.2026

| Story | Umsetzung und Nachweisgrenze | Status |
|---|---|---|
| BL-010.46 | **Standalone-Review und Fehlerworkflow nach DS-106:** Unternehmensentscheidung bis ORG und vertraulicher Zuordnung; authentifizierte lauf-/Seed-/Policy-gebundene Wiederverwendung vollständiger Schreibweisen über offene Prüfphasen und Neustart. Keine rückwirkenden Änderungen fertiger Dateien oder Erweiterung von Coworks Reviewadapter. Fehlerlisten nennen Datei mit Endung, Code, Ursacheklasse und nächsten Schritt; fehlende Hauptfenster-Capability ist korrigiert. Der echte Cross-Placeholder-Restprüfungsfehler erreicht jetzt vier exakt gebundene Kandidaten. Konservative Grafik-/OCR-Bereinigung erhält echte Texte und benennt Auslassungen. Ursprünglicher E0-Schnitt: 133 Testdateien der CI-Suite, 38 paketierte Konvertierungsgruppen, zusätzliche Review-/Journal-/Capturetests und elf reale PDF-Seiten. Technische Lieferung und neue native Windows-/Mac-Paketgates sind in RC158 veröffentlicht; neue bediente Abnahmen bleiben BL-010.50. Neuer, separat zu diagnostizierender Kolleginnen-Befund unter BL-010.47. | **erledigt** |
| BL-010.47 | **Windows-Komplettausfall bei Kollegin:** Gemeldet sind Probleme aller Dokumente mit RC157, während der lokal geprüfte Lauf 9/10 Ergebnisse erzeugte. Die Diagnose kann derzeit nicht bereitgestellt werden. Die neuen sicheren Start-/Konvertercodes und Dateilisten aus BL-010.48 ermöglichen eine gezielte Gegenprobe; ohne gerätebezogene Fehlermeldung oder Reproduktion bleibt die konkrete Ursache offen. Nächster Schritt: den neuen Kandidaten auf diesem Rechner prüfen und den angezeigten festen Code samt betroffenen Dateinamen zuordnen. Geräteevidenz fehlt; kein Beweis für Antivirusblockade und keine pauschale Gleichsetzung mit dem behobenen Cross-Placeholder-Fehler. | **offen** |
| BL-010.48 | **Standalone-Integration und Fehlerverhalten nach DS-107:** echte typisierte Unternehmensentscheidung über Desktop-IPC; einheitliches Reviewbudget; lauf-/startversuchsgebundene First-Draft- und Workerfehler mit konkreten Ursachecodes und vorgemerkten Dateien; RPC-Deadline einschließlich Sperre/Spawn/Schreiben; eigener begrenzter Shutdown unabhängig von RPC; sichtbare gestoppte und ausstehende Dateilisten trotz Zuordnungsschuld; atomare Admissionfehler mit Dateinamen/Endung und nächstem Schritt; erfolgreiche native Review-IPC-Antwort statt falsch grüner Seiten-/Requestprüfung, ehrliche Plattform-Skips und versionierte UI-Fixtures. E0 technisch umgesetzt, gezielt geprüft und in RC158 veröffentlicht; Windows-/Mac-Paketbindung und Gesamtgate siehe Evidence-Matrix. Keine behauptete native Mac-Bedienabnahme oder Publisher-Signierung. | **erledigt** |
| BL-010.49 | **Mehrdimensionale technische Gegenprüfung nach DS-108:** bestätigte Marker-/Credential-Leaks, vorgelagerte Reviewbudget-Lücke, Renderer-Lade-/ACK-/Fortsetzungsrennen, native Fenster- und Spawn-/Shutdownbindung, POSIX-Cancellation, langsame Aufnahme, innere Windows-Konverterursachen und unvollständige Paket-/Plattformtests korrigiert und nochmals unabhängig technisch gegengeprüft. Ursprünglicher E0-Schnitt: 136 Produkttestdateien, 39 Rust-Tests/Clippy, reale Windows-/WSL-Gegenproben und finaler ZIP-Review-E2E mit 6.001 Fundstellen. Technisch E0 erledigt und später in RC158 veröffentlicht: Evidence-Matrix trennt Source, paketierten Worker, Rust/Supervisor und bediente GUI; die verbleibende neue Zielhost-/Bedienkampagne liegt ausschließlich in BL-010.50. | **erledigt** |
| BL-010.50 | **Exakter neuer Kandidat – bediente native Reviewkampagne:** ausführbare Kampagne auf Windows sowie macOS Intel/Apple Silicon mit zwei echten Tauri/WebView-Sitzungen, Vertagen/Neustart, Person-/Unternehmensentscheidung, automatischer Folgegruppe, laufweiter Übernahme und konkretem Fehlerdateinamen durchführen. Paket-/Source-IPC und reine Seitenladung ersetzen diesen Nachweis nicht. Vorbereitung ist ausdrücklich NOT_RUN, PASS verlangt Bedienattestation und geprüfte Ausgaben. Bereits bestätigte frühere Windows-Anwenderläufe werden dadurch nicht zurückgenommen. | **offen** |
| BL-010.51 | **Gezielte Methodenadaption aus offizieller Recherche (DS-108):** unabhängige Qualitätsmetriken je Entitätsart/Format/OCR-Weg einschließlich Fehlanonymisierung sind technisch umgesetzt und mit 72 synthetischen Formatvarianten gemessen (BL-050.5–.7). Windows- sowie Intel-/Apple-Silicon-Engineering-Pakete sind einschließlich tatsächlicher OCR-Korrektur, Review und Neustart gebunden; konkrete Nachweisgrenzen stehen in der Aktualisierung vom 06.10.2026. Roh-OCR-Qualität, menschliche Referenz-/Bedienabnahme, volle Qualitätsmessung am exakten Mac-Archiv, seeded modellbasierte Zustandsfolgen und spätere attestierte Buildherkunft bleiben getrennte Restarbeit. ACK-Receipts sind nur nach atomarem Identitäts-/Wirkungsvertrag sinnvoll. Die atomare Windows-Job-List-Zuweisung ist bereits vorhanden; eine künftige Kombination mit eingeschränkten Primärtokens wäre separat zu prüfen. Quellen und sofort adaptierte Teile stehen in DS-108; keine neue Cloudverarbeitung oder NLP-Pflichtabhängigkeit. Diese Erweiterung ist nicht blockiert und kein Wiederöffnen früherer bestandener Anwenderläufe. | **in Arbeit** |
| BL-010.52 | **Revalidierte Architektur-/Inhaltskorrekturen DS-109:** Standalone-Gesprächsnamen mit exakten Grenzen, konservative OCR-Gleichheits-/Malreihenfolgenprüfung, gestreamte Identität und ehrliche Kopierwarnung/Header, typisierte Kapazitäts-/Loader-/Schutzgrenzenfehler, eng erkannte und benannte OS-Metadaten, native Startdiagnose/Child-Reaper, stabile History-Aktionen, Backend-Dokumentkarte und geschlossener Desktop-Fehlervertrag implementiert. Letzte Gegenbeispiele zu Abteilungssuffix und Identitäts-DTO korrigiert; Wiederaufnahmevertrag unabhängig revalidiert und durch 13 Runner-Regressionen gesichert. Technisch E0 erledigt und in RC158 veröffentlicht: final 195 Produkttestdateien, 49 Windows-Rusttests/Clippy, 41 echte Konvertierungsgruppen, sauberer Windows-Doppelbau und beide native Mac-ZIP-/DMG-Paketgates bestanden; Einzelumfang und Hash in der Evidence-Matrix. Veröffentlichungsgebundener Cowork-Build bestand am sauberen Quellcommit, ohne Cowork neu zu veröffentlichen. Kein MVC-Neubau. Neue bediente Zielhostkampagne und Qualitätsmetriken bleiben ausschließlich BL-010.50/51. | **erledigt** |

DS-105 bindet BL-010.45 an die ausdrückliche Entscheidung: keine automatische
Löschung der vertraulichen lokalen Identitätszuordnung.

DS-082 bindet dazu die lokale, nicht protokollierte Anzeige von Quellenordner,
Dateiauswahl und Ergebnisziel. DS-085 bindet den inzwischen implementierten
Nur-Konvertieren-Modus mit eigenem Zweck, Artefakt- und Ergebnisbaum;
technische Aktivierung ersetzt weder Paketnachweis noch menschliche Freigabe.

#### Verbindlicher Lieferplan für Standalone-Markdown-first-Anonymisierung (BL-010.30)

DS-087 und DS-090 erweitern nicht die Originalformat-Ausgabe. Die gemeinsame
Extraktionsschicht liefert ein neutrales, streng validiertes Ergebnis mit
Quelltyp, Markdown und Coverage. **Nur in Markdown umwandeln** darf daraus wie
bisher ein ausdrücklich nicht anonymisiertes `dm_`-Artefakt erzeugen.
**In Markdown umwandeln und anonymisieren** hält dasselbe Extraktionsergebnis
privat, bindet es an den vorhandenen stapelweiten Pseudonymzustand und
veröffentlicht ausschließlich ein bestehendes Privacy-Paket.

| Paket | Lieferung | Pflichtnachweis | Status |
|---|---|---|---|
| Neutraler Extraktionsvertrag | Modusfreie Extraktion; getrennte Adapter für `markdown-only` und Privacy; keine öffentliche Cross-Read-Brücke | Vertrags-/Mutations-/Cross-Read-Tests | **E0 umgesetzt und grün** |
| Stapel und Recovery | Breite Typen im Standalone-Anonymisierungsmodus; vorhandene v4-Zweck-/Phasenbindung; kein doppelter Export bei Fortsetzung; bestätigte Konverterbeendigung vor dem nächsten Item | Echte TXT/XLSX-Mischstapel in beiden Reihenfolgen, Abbruch zwischen Items, frische Fortsetzung und Exact-once-Publikation sind RC111-E0. Timeout/Startfehler und unbestätigte Beendigung bleiben durch die bestehenden Negativverträge gebunden | **E0 umgesetzt und grün** |
| Privacy und Pseudonyme | vorhandene PII-/Review-/Residual-Gates; eine Personen-/Unternehmensregistry über direkte und konvertierte Quellen | RC111 prüft reale stabile Personen- und Unternehmenslabels über direkte/konvertierte Quellen und Neustart; unvollständige breite Quellen verbrauchen keine Labels. Breiter Fachkorpus bleibt E3 | **E0 umgesetzt und grün** |
| Getrennte Statusgates | gültige `complete`- oder `incomplete`-Extraktion mit nichtleerem Markdown darf in Privacy; Anonymisierungsgrad wird nur aus PII-/Review-/Residualsignalen gebildet; beide Zustände stehen getrennt in Ergebnis und Manifest | Dateiendung und `source_type` sind gebunden; reale breite Formate durchlaufen den Privacy-Pfad, leere OCR und ungültige Coverage stoppen. Vollständige Container-/Grafik-/OCR-Coverage bleibt offen und wird nicht als Originalanonymisierung behauptet | **E0 umgesetzt und grün** |
| Ergebnis und UX | ein anonymisiertes `.md` je positive Quelle; direkte Zuordnung ohne Zwischenkonvertat; klare Bezeichnung als Markdown-Extraktion | Export-/Mapping-/Historien-/UI-Tests | **E0 umgesetzt und grün** |
| Paket und Produkte | Standalone-Runtime/SBOM/Offline-Smoke; Cowork-Allowlist unverändert | ZIP-/Runtime-/Produktisolationsgates | **RC111 aus `b543589f` besteht nach Korrektur des Harnessfehlers die vollständige Regression und PKG-04: zwei saubere bytegleiche Builds, beide Paket-/Worker-/History-/Sidecar- und sichtbaren nativen Windows-Smokes. INT-13 ist an genau diesen Commit und ZIP-SHA-256 `6086d1eb…69f8f` gebunden. Der gesperrte Cachetestrest stammt ausschließlich aus dem historischen RC109-Kontrolllauf; der neue Kandidat bereinigt beide eigenen Profile vollständig. Native macOS-App-Bundle-/IPC-E0 sowie reproduzierbare, entpackt gestartete Engineering-ZIPs sind auf Intel und ARM belegt; Linux x64 besitzt denselben technischen AppImage-/Paket-/Lifecycle-E0. Sichtbare E1/E2 bleiben auf macOS und Linux offen.** |

#### Verbindlicher Lieferplan für reine Markdown-Konvertierung (BL-010.28)

Auftragserweiterung vom 06.09.2026: Nach dem abgeschlossenen RC107-Paketnachweis
wurde die zweite Standalone-Betriebsart mit den Formatstufen
XLSX/PPTX/PDF/Scan-PDF/Bilder in RC108 implementiert. Die vorhandenen Storys
werden fortgeführt, nicht dupliziert. Direkte Parser, eigene Artefakt-/Recovery-/
Exportkette und gebündelte PDF-/OCR-Runtime sind verbunden, nicht lediglich in
einer Dateiendungsliste angekündigt. Echte Inhaltserhaltung, getrennte Zwecke,
Offline-Betrieb und Negativtests bleiben verbindlich; abschließender RC108-
Paketnachweis und Zielhost-UAT folgen erst aus dem geprüften sauberen Commit.
Keine neue Cloudfunktion oder zusätzliche Anwenderinstallation.
Der [archivierte Experten-Implementierungsplan](../../tasks/archiv/2026-09-06-standalone-formatausbau-implementierungsplan.md)
bindet die konkreten Schnittstellen, Wiederverwendung, bereits gefundenen
Pilotlücken und Pflichtnachweise. Er führt kein eigenes Backlog.

Diese Funktion wird nicht gestrichen oder durch eine reine Textvorschau ersetzt.
Aktueller Lieferstand und verbleibende Nachweise, ohne neue doppelte Storys:

| Paket | Zuständige Story | Lieferung und Nachweis | Status |
|---|---|---|---|
| Modusvertrag | BL-010.28 | UI → Rust → private IPC → Service → Intake-v2 → eigener Worker → v5-Journal. Continue übernimmt nur den gespeicherten Zweck, alte Worker lehnen neue Nachrichtentypen ab, kein Pseudonymzustand bei reiner Konvertierung. Reale Snapshotaufnahme und prozessfrischer Resume getestet. | implementiert |
| Inhaltstreue für direkte Formate | BL-010.28, BL-020.1 | TXT/Markdown-Unicode/Zeilenenden, CSV-Originalzeilen/-Köpfe und DOCX-Text-/Tabellenstruktur ohne PII-Normalisierung. Eigene Markdown-Identität mit Digest und negativen Privacy-Lesegates. Komplexe DOCX und XLSX/PPTX behalten ehrliche `incomplete`-Hinweise, werden aber ohne Review ausgegeben. | implementiert |
| Vollständige Ergebnisreise | BL-010.28, BL-040.5/6 | Identitätsgebundener Markdown-Zielbaum, atomarer Gesamtabschluss und eine `.md` je erfolgreicher Quelle mit erhaltenem Basisnamen. Keine Zuordnung im reinen Modus; Fehlerdetails bleiben in der lokalen Diagnose. Exakter Laufresolver, kein Anonymisierungsordner/Plugin-Handoff. Recovery, Exportfehler und Replay durch echte Store-/Exporttests gebunden. | implementiert; Paket-/UAT-Nachweis folgt |
| Breite Formate | BL-010.15–18 | Reale Produktworker-Projektion mit gepinntem Node/PDF.js/Canvas/Tesseract und lokalen DE/EN-Modellen. XLSX/PPTX, Text-/Scan-PDF und PNG/JPEG/BMP getestet. PDF-OCR liest textlose und tatsächlich bildhaltige Seiten, auch neben nativen Headern; native Texte bleiben erhalten und identische OCR-Zeilen werden nicht verdoppelt. Reine Textseiten und unbenutzte Bildressourcen starten keine OCR. Keine zusätzliche Anwenderinstallation; grafische/OCR-Vollständigkeit ist keine Zusage. | implementiert; Paket-/Zielhost-UAT offen |
| UX, Diagnose und Paketnachweis | BL-010.19/21/26/28/31 | Picker/Drop → korrigierbare Auswahl → Ziel → Start → Fortschritt → Ergebnis; explizite Funktionswahl gemäß DS-086, **nicht anonymisiert** sichtbar ohne Rückfrageserie. Zuordnung nur für Anonymisierung. Worker-/Native-Abbruch-Negativtests und persistente Opt-in-Konverter-/Coverage-Ereignisse stehen E0; normale Interaktionslogs bleiben standardmäßig verfügbar. Mac-Zielhost separat. | **E0 und RC134-Windows-PKG-04/INT-13 erledigt; E1/E2/E3 sowie Cowork-/macOS-Paketbindung offen** |

### Aktueller produktübergreifender UX-/Konsistenzschnitt

BL-010.13: Der zweite native Gegencheck verhindert einen möglichen Zugriff
auf noch nicht registrierten Desktopzustand bei frühen Fensterereignissen.
Der Hook nutzt `try_state()` ausschließlich im Drop-Arm. Der erste native
RC106-Start war durch die Sandbox/WebView-Umgebung blockiert; dasselbe ZIP
bestand mit normalen Hostrechten. Der finale PKG-04-Neubau aus `17a2160` wurde
nachgewiesen (siehe CURRENT_STATE). Seine native Testdatenisolation war jedoch
unzureichend und ist Gegenstand des aktuellen Korrekturblocks; sichtbare
Zielhost-UAT bleibt offen.

| Befund / Verbesserung | Zugeordnet | Engineering-Status und verbleibende Evidenz |
|---|---|---|
| Kryptische Standalone-Pseudonyme und getrennte Firmenrollen erschweren das Lesen zusammengehöriger Dokumente. | BL-030.2, DS-084 | v2 für neue Standalone-Stapel: lesbare stabile Nummern, gemeinsame Unternehmensidentität, keine Umnummerierung von Altbeständen; Registry-/Journal-/Mehrformat-Recoverytests. Native fachliche UAT bleibt offen. |
| Ein Lookup gespeicherter Firmenbindungen befüllte die aktuelle Ersetzungsliste nicht; Folgedokumente konnten am Restgate stoppen. | BL-030.2, BL-002 | Gemeinsamer Fix für Plugin/v1 und Standalone/v2, echte Folgedokumenttests statt ausschließlich Registry-Assertions. |
| Dateien bequem hineinziehen, aber nie versehentlich sofort starten. | BL-010.12/13, DS-084 | Native Tauri-Aufnahme über bestehenden Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, klarer Start und Pickeralternative. Reale Dragdrop-/Fokus-UAT auf Windows/macOS offen. |
| Cowork-Abschluss öffnete noch den Oberordner und behauptete bei nicht verfügbarem Export trotzdem Ergebnisse. | BL-040.6, BL-041.10 | Privater stapelgebundener Presenter löst exakten Exportlauf auf; Text und Button teilen dieselbe Verfügbarkeitsbedingung. Allgemeiner MCP-Ordnerbefehl bleibt unverändert; Mappingnamen bleiben privat. Echte Finder-/Explorer-Anzeige bleibt UAT. |
| Nur-Konvertieren war im Zielbild zu schwach und in der UI zeitweise nicht sichtbar. | BL-010.28, DS-085 | Zweite Kernfunktion ist in RC108 technisch umgesetzt und als eigenständige Funktion sichtbar: eigener Zweck, Worker, Journal, Markdown-Artefakte und Ergebnis-/Zuordnungsweg. Neuer RC108-Paketnachweis steht; menschliche Abnahme bleibt offen. Keine Übertragung der RC107-Freigabeevidence auf diesen Ausbau. |

### Zweiter unabhängiger Konsolidierungsreview 04.09.2026

Code-/Architektur- und Kanonreview wurden unabhängig durchgeführt und gegen die
aktuelle Herstellerdokumentation revalidiert. E0 geschlossen sind die
laufgebundenen Standalone-Zähler, der ehrliche `export_pending`-Zustand, Replay
offener Exporte beim Start/Ordnerwechsel, feste Zielbindung vor dem ersten
Teilexport, keine Cowork-Abschlussdialoge aus dem Standalone-Worker sowie der
UI-Reset nach verlorenem Sidecar-Admission. DS-078 korrigiert die frühere
Cloud-/Desktop-Brücken-Annahme. Der RC-Synchronisierer bindet nun auch Tauri-
Konfiguration, Rust-Paket, Zielartefaktnamen und alle aktuellen Standalone-
Nachweise; ein Vertragstest verhindert künftig gemischte Produktversionen.
Das dimensionsübergreifende Abschlussurteil mit der getrennten Evidencegrenze
für beide Produkte steht in
[`ARCH-DOC-REVIEW-BOTH-RC99`](../archive/2026-09/reviews/REVIEW_BEIDE_PRODUKTE_2026-09-04.md).

#### Wiederholter Experten-Gegencheck RC99 – E0 geschlossen

Der unabhängige Core-/Security-, Cowork-/UX- und Standalone-/Plattformcheck
reproduzierte und schloss sieben Restdefekte: fehlende Prüfung einer verweigerten
globalen Lock-Freigabe an allen Transaktionsgrenzen, einen nach Snapshot-API-Drift
wirkungslosen Lock-Integrationstest, falsche offene Exportzähler nach Replayfehler,
falschen Fortsetzungserfolg ohne Executor-ACK, einen als „bereit“ verschluckten
All-stopped-Abschluss, unvollständige CLI-Zustandstexte sowie den fehlenden
Cloud-Sync-Hinweis in direkten MCP-Prompts. Produktive Texte verwenden jetzt den
dedizierten lokalen Ergebnisordner; Originale bleiben außerhalb verbundener
Cowork-Ordner. Zertifikatsfreie macOS-Piloten sind ausdrücklich ad-hoc signiert;
die nativen Intel-/ARM-E0-Binärbuilds sind durch die Läufe `34318293471` und
`34285518668` belegt. Die App-Bundle-/IPC-Nachweise `34321954381` und
`34322534571` sind ebenfalls grün; Distributionsarchive und Gatekeeper-UAT
bleiben unter BL-010.20/21 offen.
Zugeordnet: BL-002, BL-010.13/14/20, BL-011.8, BL-040.5/6, BL-041.7 und
BL-047.1. Die erneute fachliche und technische Revalidierung meldete keine
weiteren E0-Defekte in diesen Umfängen. Ein anschließender State-of-the-Art-
Quellcodecheck schloss außerdem falschen Exporterfolg bei nicht freigegebenem
Export-Claim, den doppelten Standalone-Journalscan, eine zu frühe Ledger-Aktion
im Mischstapel, den widersprüchlichen Reviewvertrag und einen timingabhängigen
Intake-Worker-Nachweis. Zugeordnet: BL-010.13/14, BL-011.8, BL-040.6,
BL-043.1 und BL-047.1. Der anschließende manuelle Zustandsmaschinencheck schloss
zusätzlich die erneute Reservierung eines bereits präsentierten historischen
Abschlussmarkers mit alter Reservierungs-ID; Regression unter BL-011.8 und
BL-041.10.

| Restbefund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| `get_public_state` rief Recovery- und jüngsten Stapelstatus über zwei synchrone Vollscans ab. | BL-047.1, BL-010.13 | erledigt | ein kombinierter Snapshot liest jedes Journal je Poll höchstens einmal; 1.000-Journal-Read-Count-Test grün, 100-Dateien-Zielhostbenchmark bleibt E1 |
| Ein offener Export-Outbox-Eintrag besitzt keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | atomarer Claim serialisiert Terminalexport und Replay; Live-Claim und Wiederanlauf regressionsgetestet |
| „Ergebnisse öffnen“ öffnet den globalen Outputstamm statt exakt den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | laufgebundene, inhaltsfreie Öffnen-Aktion verweigert unvollständige Läufe |
| Der lokale OS-Öffner meldete Erfolg vor dem asynchronen `spawn`-Ergebnis; `ENOENT` konnte danach den Sidecar beenden. Erfolgreiche Klicks hatten zudem keine sichtbare Rückmeldung und „Zuordnung öffnen“ öffnete nur einen Ordner. | BL-010.13, BL-010.26 | erledigt | absoluter plattformspezifischer Öffner, bestätigter `spawn`/behandelter Fehler, exakte Dateimarkierung unter Windows/macOS, inhaltsfreie Events und separater UI-Hinweis; echter RC103-UAT bleibt E1 |
| RC103 bestätigte den Explorer-Start, startete die ausdrücklich gewünschte Windows-Oberfläche aber mit `windowsHide:true`; dadurch konnte der Klick ohne sichtbares Fenster enden. | BL-010.13, BL-010.26 | erledigt | RC104 startet nur diesen OS-Öffner sichtbar; Shell bleibt aus, Umgebung allowlisted, asynchrones Start-Fail-closed bleibt erhalten |
| Standalone verwies für die Zuordnung auf die private globale Mappingdatei und legte keine verständliche laufbezogene Tabelle neben die Ergebnisse. | BL-010.13, BL-040.5, DS-083 | erledigt | `DataSecure-Zuordnung.csv` wird formelneutralisiert und atomar als letzter Bestandteil eines vollständigen Standalone-Laufs veröffentlicht; Cowork erhält wegen der Originalnamen keine solche Projektion; RC103-Records werden journalgebunden migriert |
| Der native Windows-Paket-Smoke startete die Tauri-Hülle versteckt; WebView2 konnte dadurch die Seiteninitialisierung aufschieben und einen falschen IPC-Timeout erzeugen. | BL-010.11, BL-010.25 | erledigt | Paketgate startet denselben sichtbaren Lifecycle wie das Produkt, wartet auf Page-/Frontend-/Core-/IPC-Nachweise und beendet nur seine eigene Instanz |
| Worker-Empfangsbestätigung lag vor dem dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentliche Semantik trennt jetzt angenommene lokale Aufnahme (`checkpoint_pending`) vom erst später belastbaren Journalcheckpoint; ACK-/Crash-Negativtests sind grün |
| PID-Wiederverwendung konnte eine tote Executor-Lease als lebendig erscheinen lassen. | BL-011.11 | erledigt | Lease-Eigentum bindet PID plus gehashte Betriebssystem-Startidentität; tote, wiederverwendete und nicht sicher beobachtbare Eigentümer sind regressionsgetestet |
| Presenter-Start bewies keine sichtbare Abschlussdarstellung. | BL-041.10, BL-012.2 | E0 erledigt | Standalone bestätigt erst nach Renderer-Paint; Windows-Cowork bestätigt das native `Shown`-Ereignis. macOS verlangt nun ebenfalls eine sichtbare AppKit-`SHOWN`-Bestätigung; reale Windows-/macOS-Beobachtung bleibt E1/E2 |
| Neutrale Core-API und Core-/Policy-Golden-Bindung fehlten zwischen beiden Produkten. | BL-010.9, BL-010.23 | E0 erledigt | Sieben reine Verträge sowie produktgleiche Goldenläufe für TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung stehen. Weitere I/O-/Transportentkopplung erfolgt nur bei konkretem Defekt; Zielhost-/Fachabnahme bleibt E1/E3. |
| Dokumentkanon besaß keinen vollständigen maschinenlesbaren Index aller aktuellen Dokumentklassen. | BL-003.9 | erledigt | `DOCUMENT_INDEX.json` bindet Status, Geltungsbereich, Eigentümer, Supersession und Entscheidungen; Driftgate läuft in `test:docs` |

#### Expertenimplementierung 05.09.2026 – Prozessidentität, ehrliche Annahme und sichtbarer Abschluss

Der Core-/Security-, Cowork-/UX- und Standalone-/Plattformgegencheck wurde in
einem gemeinsamen E0-Schnitt umgesetzt:

- Eine Worker-Empfangsbestätigung bedeutet nur noch, dass die lokale Aufnahme
  angenommen wurde. Bis zum dauerhaften Journalcheckpoint lautet der öffentliche
  Zustand ausdrücklich `local_intake_accepted_checkpoint_pending`; weder Skill
  noch Server behaupten bereits laufende oder fortsetzbare Verarbeitung.
- Executor-Leases binden den Prozess an `PID + Betriebssystem-Startidentität`.
  Linux verwendet Boot-ID und Start-Ticks, Windows die Prozessstartzeit und
  macOS den nativen Prozessstart. Nur sicher tote oder nachweislich
  wiederverwendete Eigentümer werden verworfen; Beobachtungsfehler blockieren
  fail-closed.
- Die Standalone-Oberfläche zeigt Vorbereitung und anschließend passive,
  inhaltsfreie `erledigt/gesamt`-Zähler. Ein terminaler Hinweis gilt erst nach
  tatsächlichem Renderer-Paint und passender inhaltsfreier Generationsnummer als
  dargestellt; verspätete/doppelte ACKs sind inert, bei ausbleibender Bestätigung
  bleibt genau der bestehende Worker-Fallback zuständig.
- Der Windows-Cowork-Dialog bestätigt nicht mehr den PowerShell-Prozessstart,
  sondern sein natives `Shown`-Ereignis. Für macOS ist der gleichwertige native
  Sichtbarkeitsadapter noch zu implementieren und anschließend mit
  BL-041.10/BL-051 auf dem Zielhost nachzuweisen; ein bloßer Windows-Test
  darf beides nicht ersetzen.

Damit entstehen keine neuen Anwenderdialoge und kein Polling durch Claude.
Der einzelne AppKit-Sammelreview und eine sichtbarkeitsbestätigte AppKit-
Abschlussmeldung sind E0 implementiert. Native Intel-/ARM-Binärbuilds und echte
ad-hoc signierte App-Bundles sind automatisiert belegt; Distributionsarchive
sowie Gatekeeper-, Review- und Sichtbarkeitsevidenz bleiben menschliche
Zielhostabnahme unter BL-010.20/21,
BL-012.9/10 und BL-051.

### P0 – einfacher lokaler Sammelreview nach DS-068

Der verbindliche Detailvertrag ist
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Die drei vom
Product Owner bestätigten Lieferungen sind für Windows E0 umgesetzt; der
gleichwertige einzelne macOS-Sammeladapter ist nun ebenfalls E0 vorhanden.
Zielsystem- und Anwenderevidenz folgt getrennt und ersetzt die Implementierung
nicht.

| Priorität / Story | Detaillierte Lieferung | E0-Abnahmekriterium | Status / Rest |
|---|---|---|---|
| 1 · BL-012.9 | Den bestehenden lokalen Sammelreview als einzigen Reviewweg behalten. Nur `deferred_review`-Dateien werden lokal rekonstruiert; Reviewtext bleibt in `stdin`/Speicher, Journal, MCP und Diagnose bleiben inhaltsfrei. Abbruch, Vertagung, Timeout und Teilpublikation bewahren vorhandene Ergebnisse. | Windows-Sammeloberfläche und einzelner scrollbarer AppKit-Mac-Dialog. MAC-20260923-04 begrenzt die Mac-Gruppe zusätzlich auf 1000 Fundstellen und erhält technische Fehler statt falscher Benutzervertagung; lokale Regression grün, im RC141-Standalone-Mac-Paket enthalten. | **in Arbeit** · Cowork-Neulieferung und sichtbare AppKit-E1/E2 weiter offen |
| 2 · BL-012.10 | PII-Shield-Interaktionen sicher übernehmen: rot/gelb, direkte fachliche Aktionen, automatisch/bereits/jetzt/danach-Zähler, Rückgängig, exakte Gruppenaktion, eine Schlussfreigabe und Windows-Kürzel `Alt+Z`, `Alt+O`, `Alt+R`, `Strg+Enter`, `Esc`. | Gemeinsamer UI-Vertrag, Fortschrittsmodell und inhaltsfreie Projektion getestet; Mac verwendet einen einzelnen scrollbaren AppKit-Dialog und Abschlussmeldungen verlangen dort `SHOWN` | **E0 erledigt** · Mac-Fokus/A11y/Verständlichkeit E1/E2 offen |
| 3 · BL-043.1 | Klare Dateien automatisch intern abschließen. Gemäß DS-079 bleibt der sichtbare Laufordner eines Mischstapels bis zum abgeschlossenen Review verborgen; vollständig klare Stapel öffnen keine Review-UI. Die Reviewgruppe enthält nur tatsächlich mehrdeutige Dateien. | vollständiger Klarstapel: null Reviewaufrufe und 100 Prozent abgeschlossen; Mischstapel: korrekte Zähler, nur offene Dateien im Review und kein sichtbarer Teillauf | **E0 erledigt** · beobachteter Cowork-Lauf E2 offen |

| Aus PII-Shield bewertete Idee | Entscheidung | Backlogfolge |
|---|---|---|
| farbliche Treffer und direkte Keep/Redact-Aktionen | jetzt lokal übernommen | BL-012.10 |
| Fundstellenfortschritt, Rückgängig, Tastatur und eine Schlussfreigabe | jetzt lokal übernommen | BL-012.10, BL-012.5 |
| nur unklare Dateien vorlegen, klare Dateien automatisch abschließen | jetzt umgesetzt | BL-043.1 |
| gleiche Entscheidung auf nachweislich identische Kontexte anwenden | jetzt, aber nur bewusst und exakt | BL-012.10, BL-032.1 |
| zusätzliche übersehene Bereiche frei markieren | im Einzelreview vorhanden; im Sammelreview erst nach positionssicherer Dokumentabbildung | spätere eigenständige Story, kein aktueller P0 |
| lokale HTML-/App-Oberfläche für Rohdaten | nicht in die inhaltsfreie MCP-Status-App mischen; nur als späterer vollständig lokaler Architekturentscheid | BL-042.3 bleibt status-only |
| reversible Mappings, Rohdaten im Browser/MCP, Laufzeitdownloads, automatisches Raten | nicht übernehmen | dauerhaftes Sicherheits-Nichtziel |

Entscheidungsbasis: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016,
DS-017, DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025,
DS-026, DS-027, DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034,
DS-035, DS-036, DS-037, DS-038, DS-039, DS-040, DS-041, DS-042, DS-043,
DS-044, DS-045, DS-046, DS-047, DS-048, DS-049, DS-050, DS-051, DS-052,
DS-053, DS-054, DS-055, DS-056, DS-057, DS-058, DS-059, DS-060, DS-061,
DS-062, DS-063, DS-064, DS-065, DS-066, DS-067, DS-068, DS-069, DS-070,
DS-071, DS-072, DS-073, DS-074, DS-075, DS-076, DS-077, DS-078, DS-079 und DS-080.
DS-081 ergänzt die hostgesteuerte MCP-Versionsaushandlung und schließt einen
künstlichen `MCP26-01`-Cutover aus.

## A. Eigenständig lieferbare Entwicklung

| Story | Lieferung | Status |
|---|---|---|
| BL-021.3 | **P2 · PH-20260923-12 · lokaler Review implementiert.** Exakt lokalisierbare heuristische Rest-Personenkandidaten werden einzeln im vorhandenen lokalen Review entschieden. Nicht serialisierbare In-Memory-Bindung an Fassung/Position, keine Gleichnamengruppe, Korpusphrase oder pauschale Negationsausnahme. Direkte Identifier, bekannte Originalwerte, Personenfelder und Strukturfehler bleiben unabhängig gesperrt. Nachgehärtet: CRLF-/gemischte Tabellenoffsets, vollständig erhaltene wiederholte Fragmente und identische kanonische Darstellung durch Vorschau/Anonymisierung. Unklare Herkunft bleibt fail-closed. Echte Publikation beider Produkte und Negativfälle sind automatisiert geprüft; Native-/Host-/Paketabnahme bleiben offen. Titel-/Kontextkorrektur separat BL-021.4. | **erledigt** |
| BL-021.4 | **P2 · PH-20260923-18 · Kontextkorrektur implementiert.** Konkurrierende rein typografische Versalienhypothesen werden vor Personen-Aliasbindung in den vorhandenen lokalen Fundstellenreview geleitet, nicht als Person oder Kunde/Projekt festgeschrieben. Keine Korpusphrase als Ausnahme. Echte Versaliennamen, explizite Personenfelder, Negationen und Folge-Dokumente bleiben geschützt. Ein maskierter Personenanker darf keine Beschäftigungsbeziehung über Absatzgrenzen zum vorherigen Hinweis erfinden. Fachanker prüfen Titel-/Inhaltserhalt unabhängig von erfolgreicher Publikation; gemeinsame Regeln für beide Produkte, reine Konvertierung unverändert. Native Fach-/Bedienabnahme bleibt offen. | **erledigt** |
| BL-022.1 | WordprocessingML wird namespacegebunden ausgewertet. Unbekannte XML-Entities, fremde Relationship-Namespaces und direkte Fremdtexte stoppen fail-closed; Kopf-/Fußzeilen, Tabellenverbindungen, `mc:AlternateContent`, historische Eigenschaften und Kommentarreferenzen besitzen feste Coverage-Regeln. DS-098 trennt Validierung und Ausgabe: Reine Konvertierung erhält Kopf-/Fußzeilen, Anonymisierung entfernt sie und ausschließlich dort referenzierte Bilder erst nach erfolgreicher Vollprüfung; Kommentare, Fuß-/Endnoten und Hauptteil bleiben enthalten. RC117 ergänzt echte Word-/`python-docx`-Pakete und 15 visuell geprüfte komplexe Dokumente. Die lokal lieferbare E0-Coverage ist geschlossen; offen bleiben ausschließlich LibreOffice-/Office-Interoperabilität, realistische Fremdkommentare und Fachabnahme E1/E3. | **erledigt** |
| BL-024.2 | Der Engineering-Portable-Build übernimmt das verifizierte Universal-OCR-Bundle vollständig. Geschlossene Manifest-/Inventar-/Modus-/Hashgates, Installationspfade mit Leerzeichen, Adapter-Timeout und laufender Abbruch sind regressionsgetestet; der SEA-Engineering-Build behält das belegte OCR-Testbundle. Der reale Windows-Standalone-Paket-Smoke sowie die nativen Läufe `34285518668` auf Apple Silicon und `34318293471` auf Intel verwenden ausschließlich die extrahierte gebündelte Runtime und verarbeiten XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP bis zum inhaltlich geprüften Markdown-Ergebnis; damit ist Paket→Adapter→OCR E0 auf Windows x64 und beiden macOS-Architekturen belegt. Menschliche UAT bleibt offen. Eine vollständige Originalcontainer-Coverage wird dadurch nicht behauptet. | **erledigt** |
| BL-042.3 | Die inhaltsfreie Status-App bleibt nach Revalidierung absichtlich eine einmalige Start-Momentaufnahme: ein terminaler Zustand aus derselben Toolantwort wäre fachlich falsch und wird nicht ergänzt. Fester Textfallback, sieben begrenzte Zustände in DE/EN, beide Varianten für „Stapel läuft bereits“, reproduzierbarer CWD-unabhängiger Build und ein echter lokaler Edge-/axe-Lauf über alle 14 Sprach-/Zustandskombinationen plus 320-px-/400%-Reflow sind E0 belegt. `playwright-core` ist dafür exakt gepinnt und lädt keinen Browser. Der Pilot bleibt standardmäßig aus; echte Cowork-/Screenreader-/Hostabnahme ist E1/E2. | **erledigt** |
| BL-042.4 | Gemäß DS-074 UML-basierte Supportdiagnose: separate manuelle Debug-ZIP-Variante, gleicher Enginepfad, geschlossene JSON-Ereignisse an MCP-, Picker-, Worker-, Review- und Exportgrenzen. Fach-, Workflow- und Supportdiagnose verwenden dieselbe mehrprozesssichere Einzelereignis-Komponente; Alters- und Mengengrenzen werden physisch bereinigt, historisches JSONL bleibt nur lesbarer Upgradebestand. Keine Rohkommunikation und keine Wirkung auf Freigaben. E0 ist erledigt; echter Cowork-Supportlauf bleibt E1. | **erledigt** |
| BL-040.6 | Sichtbaren Export je Lauf und Zielunterordner identitätsgebunden serialisieren; ein Prozessclaim verhindert konkurrierende Record-Schreiber, ein ausgetauschter `DataSecure-Output` stoppt den Restexport, und lokale Öffnen-Aktionen wählen nur den vollständig abgeschlossenen aktuellen Lauf. Mischstapel bleiben gemäß DS-079 bis zum Gesamtabschluss unsichtbar. | **erledigt** |
| BL-003.9 | Maschinenlesbarer Dokumentindex mit Klasse, Status, Produktgeltung, Eigentümer, Versionsregel, Ablösung und Backlogbindung; Driftgate prüft Existenz, Eindeutigkeit und Kanonvollständigkeit. | **erledigt** |
| BL-041.11 | Geschlossene Cowork-Interaktionsregistry gemäß DS-099: alle 27 Werkzeuge genau einmal mit Normal-/Supportfläche, Wirkung, Idempotenz, Human-Gates, Erfolgsdisposition und Inhaltsgrenze binden. Normal-/Supportmengen und MCP-Annotationen werden daraus abgeleitet; Werkzeugtabelle und Handler bleiben bijektiv. Unbekannte Toolnamen dürfen nicht fälschlich als Supportwerkzeuge erscheinen. E1/E2-Cowork-Zielhostevidenz steht in Abschnitt B aus. | **erledigt** |
| BL-041.12 | Additiver, schema-validierter `datasecure-cowork-status/1`-Umschlag für jede bekannte Toolantwort. Claude-Interaktion, lokaler Arbeitszustand, Annahme/Abschluss/Abbruch, Retryklasse, Human-Gate-Assurance und tatsächliche Inhaltsgrenze werden getrennt; Originalinhalt bleibt immer `false`, tatsächlich enthaltenes anonymisiertes Markdown ausdrücklich untrusted. Leere Übergaben bleiben Metadaten; alle Fortsetzungsformen werden erkannt; ein Normalmodus-Guard verweigert private Kennungen. Top-Level-Kompatibilität bleibt bis zur realen Cowork-UAT erhalten; E1/E2 steht in Abschnitt B aus. | **erledigt** |
| BL-041.13 | Hauptskill auf unverhandelbaren Normal-/Trustkern und Intenttabelle reduzieren; einfacher Normalstart ohne Referenzrunde, Sonderstart, Ergebnisübergabe, Fortsetzung/Verwerfen und Konfiguration als isolierte Referenzen. Strukturkorpus auf 41 Fälle erweitern und kuratierte, exakt risikogebundene 12×3-Candidate-Matrix mit Fixture-, Setup-, Bewertungs- und Cleanup-Vertrag liefern. Beide Modellmatrizen sind formale Cowork-GO-Gates; ein verbotenes Modelloutcome ist Release-Stopper. Automatisierte Tests werden nicht als Modellabnahme ausgegeben. E1/E2-Modell-/Hostabnahme steht in Abschnitt B aus. | **erledigt** |
| BL-041.14 | Hersteller-/Folgefehlerreview auf RC137-Basis, Kennungen CWR-20260912-01–11 in `docs/REVIEW_CLAUDE_COWORK_2026-09-01.md`: DS-078 beibehalten; DS-099-Statusprojektion an echte Core-Phasen gebunden; ACK-Ungewissheit und nativen Abbruch erhalten; terminalen Ergebnisordnerwechsel, paginierte Übergabesprache, lokale datierte Stapelwahl und MCP-Hüllenprüfung korrigiert. BL-010.8/BL-041.8: Mac-ZIP-Verifier repariert und manueller nativer Start exakt gebauter ZIPs verpflichtend; Marketplace wählt exaktes Host-ZIP, weist fehlende, geänderte und zusätzliche Quelldateien vor Mutation zurück und prüft tatsächliche Ausgabebytes. Projektkontext nach Produkt/Zweck bereinigt. E0: drei unabhängige Reviews, volle lokale Produktsuite und zusätzliche Paketregressionen, Windows-Normal-/Debug-ZIP-Starts, Marketplace-Artefaktabgleich und Docs-/CLI-Gates bestanden. RC138-Gates sind abgeschlossen und historisch; RC139 bindet die korrigierten Archive samt nativen Windows-/Mac-Starts. Menschliche Cowork-Abnahme bleibt getrennte E1/E2-Evidence, keine Umdeutung der RC137-Release-Hashes. | **erledigt** |
| BL-041.15 | **P2 · Astra-20260912-Handoffintegrität.** Eine asynchron vorbereitete Ergebnis-Seite erhält eine unveränderliche Sitzungs-ID/Generation. `cancel_local_results_handoff` widerruft diese Generation; `start_completed_local_results_handoff` darf solange keine Sitzung ersetzen, wie eine Seite läuft. Nach jedem `await` werden Generation, Token und Sitzung erneut geprüft; verspätete Snapshots werden verworfen und niemals bestätigt. Die öffentliche Dokumentantwort übernimmt außerdem die vom Ergebniszugriff geprüften Felder `privacy_scope` und `source_extraction_coverage` (mit geschlossener Allowlist/Schema), damit `extracted-markdown-only` und unvollständige Quellabdeckung nicht hinter einem alleinigen Ergebnisgrad verschwinden. | Blockierter In-Memory-Snapshot: Seite A läuft, Cancel, Startversuch für B, Freigabe der alten Seite. Ergebnis: kein Inhalt von A nach Cancel, keine ACK für A unter Token B, keine neue Sitzung vor Ende der alten Seite. Listing → Handoff erhält bei XLSX/PPTX Scope und Coverage byte-/schemawahr; zusätzlich wird eine Coverage ohne Privacy-Scope geschlossen abgewiesen. `test-local-only-handoff.js` (33 Fälle), Resume- und MCP-Gates sind grün. | **erledigt** |
| BL-041.16 | **P2 · Astra-20260912-Paketintegrität.** ZIP-Verifier und Marketplace-Projektion verwenden einen gemeinsamen vollständigen Validator. `.mcp.json` wird gegen genau einen normalisierten `data-secure-local`-Server, dessen Kommando, Argumente und erlaubte Umgebung geprüft; zusätzliche Server oder Felder außerhalb des Vertrags stoppen vor jeder Ausgabeänderung. Runtime-Lizenz, Runtime-Evidence und alle für das Ziel verlangten Runtime-Dateien werden in beiden Wegen auf Existenz, Größe und Hash gebunden. | Speicherbasierte Negativarchive mit zusätzlichem MCP-Server bzw. fehlender `runtime/LICENSE.node.txt` werden durch beide Entry-Points vor jedem Schreibzugriff abgewiesen. Runtime-Evidence bindet zusätzlich einen 40-stelligen Quellcommit. `test-bundled-runtime.mjs`, `test-marketplace-projection.mjs` und der Releasepfad sind grün. | **erledigt** |
| BL-041.17 | **P2 · Astra-20260912-Kandidaten- und UAT-Evidenzbindung.** Die UAT-Vorlage entsteht ausschließlich aus dem finalen, explizit übergebenen Release-Artefaktsatz und dessen gebundenem Commit, nicht aus beliebigem lokalem `dist` oder aktuellem `HEAD`. Die 12×3-Matrix referenziert nur tatsächlich erzeugte UAT-Fixtures und beschreibt Initial-, Tool- und Follow-up-Phase widerspruchsfrei; der automatische Vertragstest löst Fixture, Vorbedingung, erwartetes Werkzeug und Cleanup gegen den Korpus auf. Die Release-Dokumentation trennt Cowork- und Standalone-Kampagnen sowie veröffentlichte Normal-, Debug- und UAT-Artefakte eindeutig. | `build:cowork-uat-evidence` verlangt Normal-ZIP, Debug-ZIP und sauberen aktuellen Kandidatencommit, verifiziert beide Archive vor der Evidenzaufnahme und bindet deren `source_commit`. Die Matrix prüft alle Fixturepfade gegen den Generator; nicht vorhandene Fälle, falsche Zuordnungen und fehlende Argumente stoppen. Workflow und Vertragstests sind grün. | **erledigt** |
| BL-041.18 | **P3 · Astra-20260912-Promptnamen.** Die Promptauflösung akzeptiert ausschließlich eigene Schlüssel von `PROMPT_DEFAULTS`; Prototyp-Eigenschaften und jeder unbekannte Name liefern dieselbe definierte Invalid-Params-Antwort wie andere unbekannte Prompts. | `constructor`, `toString`, `__proto__` und beliebige unbekannte Namen liefern keinen Workflow; alle vier erklärten Promptnamen bleiben manifest- und serverseitig identisch. `test-manifest.js` und 66 echte stdio-Protokollfälle sind grün. | **erledigt** |

| BL-041.19 | **P1 · PH-20260923-01 · E0 in RC151 veröffentlicht.** Kanonische Roottrennung vor Speichern/Reset/Bootstrap/privater Anlage; cached Roots werden erneut geprüft. Historische private/öffentliche Wurzeln im Produktdatenraum bleiben durch maximal 256 atomare Reservierungen geschützt, auch nach Reset. 43 Rootfälle, vier konkurrierende Prozesse, MCP-Start ohne private Refusalwrites und Standalone-Gegenregression bestehen. Atomarer Austausch identischer Reservierungen zwischen Pfadprüfung und Öffnen ist deterministisch reproduziert und durch einmalige Metadatenrevalidierung behoben; andere Roots und Hardlinks bleiben gesperrt, keine Retrieschleife. Der frühere Einzelfehler ohne stderr ist rückwirkend nicht eindeutig zuzuordnen. Core erhält Pflichtinjektion statt Gateway-Import. Keine Migration/Löschung; nicht erfasste Altfreigaben/fremde Namespaces bleiben Betreiberprüfung und eine unsichere Altconfig erfordert kontrollierte Offline-Korrektur. Paket-Smokes sind RC151-gebunden; sichtbare Zielhost-Gegenprüfung der Rootfälle bleibt offen. | **erledigt** |
| BL-041.20 | **PH-20260923-02/-03/-10 · E0 vorbereitet.** Lokales Claude Code ist ein zusätzlicher Hostpilot desselben Plugins, kein drittes Produkt. 14-Fälle-Vertrag und Anleitung unter `acceptance/CLAUDE_CODE_PILOT/`, kostenfreier read-only CLI-Vorcheck plus Vertragstests vorhanden. Offizielles Update auf 2.1.280 und Vorcheck PASS; CLI nicht angemeldet. Lokaler Code-Reiter in Claude Desktop als eigene Oberfläche berücksichtigt. E1/E2: exaktes natives Ziel-ZIP, Ladequelle/Hash/Toolinventar, Originalzugriffs-Negativfälle, Picker/Review/Recovery/Wiederverwendung, Sync und Doppelinstallation beobachten. Nutzerentscheidung: ausschließlich enthaltene Claude-Abonutzung, keine API-/Zusatzkosten; bei unklarem Abrechnungsweg oder Limit kein Modellaufruf. Desktop-Zugang noch nicht geprüft. Keine Freigabe für WSL/Linux/Cloud und kein Ersatz für Cowork-/Standalone-Abnahmen. | **in Arbeit** |
| BL-041.21 | **PH-20260923-04 · DS-101 bestätigt und E0 umgesetzt.** `unread` bleibt Standard; `reuse_completed` erfordert ausdrücklichen Auftrag und stets native Auswahl, auch bei einem Kandidaten. Keine neue Anonymisierung oder Originalzugriffe. Paketgeneration/TTL/Integrität werden pro Seite und nach Async-I/O erneut geprüft; bestehende ACKs/Terminal-Evidence bleiben unverändert. Reale Datei-/Journal-/Pakettests prüfen auch entfernte Originale, Generationstausch, Ablauf, Abbruch und Produktgrenzen. Neue Paket-, Modell- und native Auswahlabnahme bleiben E1/E2. | **erledigt** |
| BL-050.4 | **PH-20260923-05 · E0 umgesetzt.** Unabhängiges Ausgabeorakel ersetzt Selbst-Lookup und pauschale Ambiguitätsfreigabe. `test-adversarial-golden-batch.mjs` verarbeitet alle 16 Dateien in beiden Zwecken mit produktiv projiziertem Konverter/OCR, echten Journalen/Privacy-Gates/Publikationen/Exporten; nur die menschliche Reviewentscheidung wird synthetisch beantwortet. Nach BL-021.3/4: 16 Konvertate und 16 anonymisierte Ausgaben nach expliziten Titel-/Personenentscheidungen; davor keine Publikationshandles. Identitätsanker fehlen, definierte Fachanker einschließlich technischer Titel bleiben, unabhängige Pseudonyme sind konsistent, Quellen unverändert. Französische Straßen und falsche Firmen-/Projektbindungen aus technischen Dashlisten korrigiert; Namenslecks nach Markern, Negationen und verschachtelten Listen gegengeprüft. VECTRA-20260923 ergänzt einen realen CSV-/eingebetteten-JSON-Gegenfall im bestehenden Test, ohne neue Runtime/Importoberfläche; vorhandene typisierte Registry wiederverwendet. Neuer Releasearchivtest und menschliche OCR-/Fachqualität bleiben eigene Gates, keine allgemeine Semantik-/Vollständigkeitsgarantie. | **erledigt** |
| BL-050.5 | **Qualitätsmessung · E0 am 06.10.2026 umgesetzt (Teil von BL-010.51/DS-108).** Unabhängige synthetische Referenz mit 60 logischen Fällen/72 Format- und OCR-Varianten, vier ausgewiesenen Entitätsklassen, getrennten Extraktions-/Core-Probe-/Publikationsmetriken, konkreten Dateinamen/Fundstellen und lokalen Gegenprüfungsdateien. Auswerter gegen breite/doppelte Spannen, Voll-/Teilnamensreste außerhalb der Ausrichtung, OCR-Teil-/Split-/Symbolverlust, vorher verlorene Fachanker und eingefügte Negationen abgesichert; synthetisches Review ist dokument-/fundstellengebunden und vertagt unbekannte/widersprüchliche Erwartungen. 23 reine Regressionen in Produkt-/Standalone-Testeingängen; echte Windows-Projektion mit Konverter/OCR und Publikation ausgeführt. Verfahren/Kommandos: `docs/DETECTOR_BENCHMARK.md`. Volle Messung am exakten Release-/Mac-Archiv und menschliche Referenzabnahme bleiben BL-010.51; native Engineering-Paketsmokes sind separat belegt. Produktqualität ist damit nicht pauschal freigegeben; Befunde separat BL-050.6. | **erledigt** |
| BL-050.6 | **Fachwort-/OCR-Qualität · E0-Teilkorrektur, Standalone-Korrekturen in RC159 veröffentlicht am 11.10.2026.** Standalone entscheidet unklare Überschriften/Zellen vor PERSON-Bindung und erhält genaue laufweite Entitätsentscheidungen. Begrenzte geometrische OCR korrigiert fünf Umlautgegenfälle; Kontakt-Crops warnen, ersetzen aber nie die Primärlesart. Die automatische Crop-Auswahl bleibt als verworfener 16-statt-neun-E-Mail-Gegenbeleg erhalten. Exakte OCR-Kontakte werden im selben privaten Prüffenster vor Personenreservierung/Anonymisierung ausdrücklich bestätigt oder korrigiert; 400 Vorkommen/256 Korrekturzeichen, vollständige authentifizierte private Entscheidung, Quelle/Extraktion/Policy/Laufbindung und Neustart. Keine Kontaktfreigabe als PII-Ausnahme, kein neuer Cowork-Weg. Echte private IPC, gemischte Kontaktzeilen, Zeilenenden, Manipulation, Telefon-/Credential-Grenze und 200-Dateien-Abbruchbereinigung sind gegengeprüft. Historische Vollmessung `dist/quality-contact-review-final-source-20261006`: 72/72 konvertiert und publiziert, 55 synthetische Kontaktbestätigungen/neun explizite Referenzkorrekturen plus 202 Entitäts-Vorkommensentscheidungen. Nach Korrektur null bekannte Kontaktänderungen/Identitätsreste/Fachwortverluste; rohe OCR enthält weiterhin neun E-Mail-Fehler. DS-012-Anredenentfernung wird unabhängig separat gemessen. 66 damalige fokussierte Qualitätsfälle plus Zweidokumentintegration und 46 echte Windows-Konvertergruppen bestanden. Historische Windows-/Intel-/Apple-Silicon-Engineering-Paketbindung einschließlich OCR-Korrektur/Neustart und erfolgreicher nativer Haupt-/Prüfseiten-IPC: Umfang und Hashes stehen in der nachfolgenden Aktualisierung. Seit DS-110-Priorisierung sind vollständig bewertete rohe OCR-E-Mail-Abweichungen mit geprüftem korrigiertem Privacy-Eingang sichtbare Warnungen, nicht allein pauschaler Releaseblocker; Enddateien werden gegen beide Lesarten geprüft. Das strenge Extraktionsprofil bleibt rot. Aktuelle Messung: `dist/quality-prerelease-rc159-20261011/BERICHTE/QUALITAET.json`; alle vier nativen RC159-Paketgates und die Prerelease-Bereitstellung sind in RELEASE.md exakt gebunden. Menschliche Referenz-/Bedienprüfung, volle Qualitätsmessung am exakten Mac-Archiv und weitere OCR-Genauigkeit bleiben offen; keine pauschale Qualitätsfreigabe. | **in Arbeit** |
| BL-050.7 | **Unternehmensrest in neutralen Tabellenkontexten · E0 korrigiert.** Standalone prüft jetzt auch CSV-Kopfzeilen und neutrale einspaltige Tabellenzellen vor einer Personenbindung. Menschliche Firmenentscheidungen erzeugen typisierte laufweite Unternehmenspseudonyme; echte Namensfelder und Credentials bleiben strikt, sachliche Überschriften werden nicht automatisch gelöscht. Neues echtes Publikations-/Neustartgegenbeispiel ohne Holdout-Allowlist und stabile Windows-Messung mit 40 Nicht-OCR-Varianten: alle Ergebnisse freigegeben, keine bekannten Firmenreste einschließlich der früheren CSV-/XLSX-Gegenfälle. Bericht: `dist/quality-final-native-20261006/BERICHTE/QUALITAET.json`. Volle Qualitätsmessung am Mac-Archiv, neue Releasearchivbindung und menschliche Semantikabnahme bleiben BL-010.51; Firmenentscheidungen im nativen Engineering-Paketsmoke sind separat belegt. | **erledigt** |

**Aktualisierung BL-050.6 / BL-010.51 vom 06.10.2026:** Frische Vollmessung
`dist/quality-contact-native-final-20261006` bindet tatsächliche Modell-/
Konverterbytes; Roh-OCR neun Fehler, finale synthetisch geprüfte 72 Ausgaben
ohne bekannte Reste oder Sachwortverluste. Der größere Modellkandidat wurde
wegen 24 statt neun E-Mail-Fehlern verworfen. Exakte Windows-Engineering-
Paketintegration mit realer OCR, unterschiedlichen Korrekturen, beiden
Kontaktdateien vor Entitätsreview, Vertagen/Neustart und vollständigem
Ausgabeorakel besteht; native Windows-Seiten/IPC separat bestanden.
Ein strenger Netzbeobachterlauf blieb wegen nicht sicher zugeordnetem Endpunkt
ohne PASS; die unveränderte strenge Wiederholung bestätigt zehn eigene Prozesse
und keine TCP-/UDP-Endpunkte im Messfenster. Bedienkampagne für OCR ist ausführbar, aber ohne echte Bedienung
NOT_RUN. Separater Testbranch und bestehender Mac-Workflow für beide
Architekturen sind ausdrücklich autorisiert.
Zwei native Versuche stoppen an Testbefunden: nicht kanonischer TEMP-Pfad,
danach veraltete Erwartung der gemeinsam genutzten Neustart-Closure. Die
Kontakt-/Resume-Verträge bestehen im zweiten Versuch auf Intel und ARM.
Fixture und Strukturvertrag sind korrigiert; der Paketvertrag ist nun auch
im allgemeinen Produktgate statt nur im Zielgate enthalten. Eine unabhängige
Leerer-Checkout-Gegenprobe sichert seinen bisher fehlenden `dist/`-Elternordner.
Erweitertes Produktgate: 202 Dateien grün, elf aktuelle Paketverträge separat
grün. Fehlgeschlagene native Versuche bleiben dokumentiert. Der dritte Lauf
`37460941660` am Quellcommit `86b9f757caf1b7df8731d787d007c9b77dde88da`
besteht vollständig auf Intel und Apple Silicon: je 47 Rust-Tests, Clippy,
Supervisor-/Abbruchtests, 44 reale Konvertergruppen (zwei Windows-Fälle korrekt
übersprungen), Signatur/ABI, native Haupt-/Prüfseiten-IPC, bytegleicher ZIP-
Doppelbau, tatsächlicher paketierter Review-/OCR-Korrektur-/Neustartpfad,
LaunchServices und identische gemountete DMG. Beide ZIPs/DMGs sind lokal
gesichert und nach dem Download erneut geprüft; Hashes und genaue Grenzen
stehen in `CURRENT_STATE.md`. Kein menschlicher Reviewklick, keine
Notarisierung, keine volle 72-Varianten-Messung am Mac-Archiv.
Main/Releases unverändert, strenges Qualitätsgate bleibt rot. Genau diese
Restpunkte bleiben **in Arbeit**, nicht pauschal „blockiert“ oder erledigt.

**Zusätzlicher E0-Gatebefund BL-010.52:** Historische Windows-Input-Migration
verwechselte zwei verschiedene 64-Bit-Datei-IDs durch Number-Rundung.
Exakte BigInt-Identität schließt den reproduzierten Recovery-/Lock-Randfall;
16 Regressionen und unabhängige echte Dateisystem-Gegenprobe bestehen.
Das integrierte Produktgate ist mit 201 Dateien grün, Mac-Workflow führt die
Migration zusätzlich aus. Technische Korrektur erledigt, keine Änderung
vorhandener Anwenderdaten und keine pauschale Zielhost-/Releaseabnahme.

**Lokale Ergänzung BL-050.6 vom 06.10.2026, unveröffentlicht:** Eindeutig an
unmodifizierte OCR und Rastergeometrie gebundene Kontakt-Bildausschnitte im
privaten Review; sonst sichtbarer Originaldatei-Fallback. Reine Markdown-
Konvertierung bietet ausdrücklich nicht vorausgewähltes Kontaktprüf-Opt-in,
mit eigener Zweck-/Seedbindung, Verschieben/Neustart und lokaler Veröffentlichung
ohne Privacy-Analyse. Zwei technische Reviewrollen korrigierten tatsächliche
localFinalize- und Hybrid-Provenanzfehler sowie Messmethodik. 203 Produktdateien,
47 echte Windows-Konvertergruppen und 50 Rusttests bestehen. Die neue unabhängige
104-Varianten-V4-Messung umfasst Tesseract-Alternativen und einen gepinnten lokalen
Paddle-ROI-Prototyp; auf alten E-Mail-Zeilen verbessert, auf neuen Kontakten
verschlechtert, deshalb keine Produktaktivierung oder automatische Wertwahl.
Frische 72-Varianten-Produktmessung: neun rohe OCR-Abweichungen, null bekannte
finale Referenzlecks nach explizitem synthetischem Review. Qualität bleibt
**in Arbeit**. Echte PDF-Regionauflösung wurde separat begrenzt gemessen und
brachte keine Verbesserung; bei Scan-Kontaktzeilen entstanden neue Fehler,
deshalb keine automatische Produktaktivierung. Der neue Engineeringcheckpoint
`3ee1e1c` ist auf dem getrennten Testbranch gesichert. Windows besteht exakte
Paketprüfung einschließlich ursprünglicher Crop-Pixel, Korrektur, Verschieben/
Neustart und vollständiger separater Dokumente in beiden Zwecken; native
Haupt-/Prüfseiten starten mit erfolgreichen IPC-Antworten. Intel und Apple
Silicon bestehen diese neue Paketbindung einschließlich gemounteter identischer
DMG und ZIP-Start über LaunchServices im abgeschlossenen genehmigten Workflow
`37491424692`: je 48 Rusttests, Clippy, 45 echte Konvertergruppen und zwei
ausdrücklich übersprungene Windows-Konvertergruppen. Beide ZIPs und DMGs sind
lokal hashgeprüft; ZIP-Inventar/ABI zusätzlich verifiziert. Nur technische
Engineeringevidenz, keine nativen Reviewklicks/Bildanzeige oder Notarisierung.
Die vollständige 72-Varianten-Qualitätsmessung am Mac-Archiv, menschliche
Qualität/Bedienung, neun Roh-OCR-Abweichungen und Releasefreigabe bleiben offen.
Reproduktionskommandos und Aussagegrenzen: `docs/DETECTOR_BENCHMARK.md`.

**Lokale Ergänzung BL-050.6 / DS-104 vom 07.10.2026, unveröffentlicht:**
Schnelle Prüfliste mit Suche/Filter, Checkbox-Sammelentscheidungen, direkter
OCR-Korrektur und Original-/Markdown-Vergleich je Fundstelle umgesetzt.
Nachgewiesen gleiche Entitäten bleiben gruppiert; OCR-Kontakte verschiedener
Dokumente werden begrenzt gemeinsam gezeigt, aber niemals nur wegen gleicher
Lesart gemeinsam korrigiert. Einzelne gespeicherte Dokumentantworten bleiben
nach Teilwrite/Neustart gebunden; ungesendete aktuelle Gruppenentscheidungen
gehen bei Vertagen/Schließen ausdrücklich verloren. Quellenrekonstruktion,
40-MiB-/400-Kontakt-Grenzen und 50-Zeilen-DOM bleiben begrenzt. Zwei unabhängige
Read-only-Rollen revalidierten Bindung und UX. Die dabei gefundenen Undo- und
verborgene-Auswahl-Fehler sind korrigiert und im echten Browser zusätzlich
gegengeprüft. 29 Frontendfälle, 15 Kontaktfälle und reale Zweidokument-
IPC-/Publikation in beiden Zwecken bestehen. Der Browser prüft echtes HTML/
JS/CSS, A11y und kleinen Viewport mit synthetischer IPC; kein nativer oder
menschlicher Nachweis. Qualitätsauswerter und Paket-/Bedienkampagne sind an
die kombinierte Kontaktgruppe angepasst. Das Herkunftsgate des zuvor geprüften
Cowork-Releasebuilds verlangt einen committierten Stand; dies gilt nicht für
den separat angeforderten lokalen Windows-Standalone-Engineeringbau aus dem
aktuellen Arbeitsstand. Bisherige Engineeringarchive bleiben unverändert.
Kein Commit/Push/Release; BL-050.6
bleibt wegen Roh-OCR und unabhängiger fachlicher/native Abnahme **in Arbeit**.
Der angeforderte lokale Windows-Testbau ist nun separat bereitgestellt:
`dist/engineering-review-matrix-windows-20261007/` mit 601 inventargeprüften
Einträgen. Echter Paketworkflow samt kombinierter OCR-Prüfung in beiden
Zwecken, Folgegruppen und Vertagen/Neustart sowie nativer Haupt-/Prüfseitenstart
mit erfolgreicher IPC bestehen. Archivhash und Aussagegrenzen stehen in
`CURRENT_STATE.md` und `WINDOWS-TEST-EVIDENCE.json` neben dem ZIP. Das ersetzt
keine menschlichen Matrixentscheidungen oder neue native Mac-Abnahme; kein
Commit/Push/Release. Anwender testet zuerst lokal unter Windows.
Die anschließende Revalidierung des HTML-Entwurfs trennt links Liste und zentrale
Sammelaktion von rechts Original-/Markdown-Vergleich. Checkboxen, Eingabefelder
und Behandlungsauswahl entscheiden nicht selbst. Nur **Auf N Zeilen anwenden**
merkt nach vollständiger Auswahlvalidierung vor; **Gruppe übergeben und weiter**
sendet ausdrücklich. Doppelte Editoren/Aktionen entfallen. 33 Frontendfälle und
erneuter Browserlauf (synthetische IPC, A11y, 390–1920 Pixel) bestehen. Eingaben,
Undo, geänderte Zeilen im Filter **Vorgemerkt** und private DOM-Bereinigung sind
abgedeckt; unabhängiger Read-only-Gegenreview ohne weiteren konkreten Fehler.
Die strikt lokale Entwicklungsvorschau ist getestet und im eingebauten Browser
angezeigt, aber kein Bestandteil der ausgelieferten App. Roh-OCR, menschliche
Bedienabnahme und native Mac-Paketbindung bleiben davon unberührt.
Der darauf gebaute separate Windows-Testkandidat unter
`dist/engineering-review-bulk-windows-20261007/` enthält die endgültige
Sammelaktions-UI. Inventar (601 Einträge), echter isolierter Paketworkflow und
nativer Haupt-/Prüfseitenstart samt erfolgreicher IPC bestehen erneut.
Er liegt für den Anwender in
`Downloads/DataSecure-Windows-Test-Sammelaktionen-20261007/`; Hashes und Grenzen
stehen in `CURRENT_STATE.md` und der lokalen `WINDOWS-TEST-EVIDENCE.json`.
Kein menschlicher/nativer Matrixabnahme- oder neuer Mac-Nachweis, kein
Commit/Push/Release. BL-050.6 bleibt wegen Roh-OCR und unabhängiger Abnahme in Arbeit.
Technischer Abschluss: Produktsuite mit 84 Basis-/119 direkten Testdateien,
Dokumentationsgate, strikte lokale CLI-Strukturprüfung und Diffprüfung bestehen.
Die letzte UI-Filterkorrektur wurde nach Beginn der Produktsuite separat mit
33 Frontendfällen und vollständiger Browserkampagne sowie dem neuen Paket geprüft.
Nach Abbruchkorrektur erneut ausgeführte Vollmessung
`dist/quality-review-matrix-final-20261007`: 72/72 finale Varianten,
55 Kontaktbestätigungen/neun gebundene Referenzkorrekturen und 202
Entitätsentscheidungen. Bei 310 sensiblen Vorkommen null bekannte finale Reste,
kein gemessener Sachwortverlust; Workerende bestätigt. Weiterhin neun rohe
E-Mail-Abweichungen, unverändertes Gate ausschließlich `QUALITY_FINDINGS_OPEN`.
Das sind synthetische Entscheidungen mit echten Konvertern, keine menschliche
oder native/exakte Release-/Mac-Qualitätsabnahme.
Der erste echte Produkt-Goldenlauf entdeckte außerdem das fehlende leere
Lieferfeld beim frühen Kontaktphasen-Abbruch. Antwortform und beide Lieferwege
sind korrigiert, mit 29 Orchestratorfällen und unabhängigem Gegenreview geprüft;
der erneute echte Goldenlauf besteht mit neun Fällen. Der ursprüngliche
fehlgeschlagene Lauf bleibt als solcher dokumentiert.
Abschließendes `test:product` besteht mit 203 Testdateien (84 Basis + 119
direkte); Dokumentations-/Linkverträge und strenge installierte Plugin-
Validierung bestehen. Dies ersetzt keine neue native/exakte Paketabnahme.

#### BL-041.17 – zweiter Astra-Gegenreview, 12.09.2026

Diese nummerierten Befunde bleiben als Fehlerursache und Regressionsvertrag
erhalten. Die vorherige Erledigt-Markierung war zu früh: grüne Strukturtests
hatten keinen vollständigen Releaseablauf und keine realen UAT-Vorbedingungen
belegt. Die folgende Korrektur betrifft ausschließlich Cowork-Entwicklungswege;
Standalone-Code und seine Paketbindung bleiben unverändert.

| Review-ID | Reproduzierter Fehler | Korrektur und wiederholbarer Nachweis | Status |
| --- | --- | --- | --- |
| ASTRA2-20260912-01 | Node-Download als unignoriertes ZIP im Checkout kollidiert mit dem neuen Clean-Git-Gate; der manuelle Windows-Releasebuild stoppt. | Download nach `RUNNER_TEMP`. `test-bundled-runtime.mjs` erstellt ein echtes isoliertes Git-Repository: Root-ZIP wird abgewiesen, externes Downloadstaging erlaubt den sauberen Build ohne Commit-Override. `test-runtime-release-path.mjs` bindet diesen Pfad an den Workflow. | E0 korrigiert |
| ASTRA2-20260912-02 | Debug-ZIP fehlt im Upload; Prüfsummen entstehen vor Debug und UAT. | Upload enthält Debug explizit. Finaler SPDX-/SHA256SUMS-Lauf nach UAT inventarisiert Normal, Debug und UAT; er prüft die UAT-Referenzen gegen die tatsächlichen Produktbytes und Commitwerte. Fehlende, doppelte oder veraltete Bindungen stoppen. `test-cowork-uat-evidence.mjs` und `tests/manual/cowork-release-offline.mjs`. | E0 korrigiert |
| ASTRA2-20260912-03 | ZIP-Prüfer und UAT-Generator lesen denselben Pfad zu verschiedenen Zeitpunkten ohne Hashvergleich. | Der native ZIP-Prüfer liefert ein maschinenlesbares Receipt über seinen geprüften Byte-Snapshot. Die UAT-Erzeugung verlangt `NATIVE_PASS` und exakt dessen Größe/SHA-256; austauschbare gleich große ZIPs, statische oder fehlende Receipts werden in `test-cowork-uat-evidence.mjs` abgewiesen. Keine falsche Standalone-PKG-04-Behauptung. | E0 korrigiert |
| ASTRA2-20260912-04 | Host-Abbruch nach ACK, ein späterer Parserfehler als Startantwort, falscher Mischstapel und erfundene Handoff-Antwort erzeugen nicht die behaupteten Live-UAT-Zustände. | Host-Stopp während offenem MCP-Picker; terminaler Fehler als lokal beobachteter Zustand mit Nutzer-Folgeauftrag; echte DOCX-Grafikfixture für Auslassungen; reale TXT-Injectionfixture. Resume setzt einen in N3-07 nachgewiesenen Checkpoint voraus. Der unabhängige Gegenreview fand zusätzlich den widersprüchlichen UAT-05-Host-Close-Pfad; Fallkatalog, Schritte, Erwartungs-CSV und N3 sind korrigiert und regressionsgeprüft. Fehlende Vorbedingungen ergeben `BLOCKED`, niemals `PASS`. Gemeinsamer Planvalidator prüft Phase, Toolfolge, Fixture, Cleanup und Beobachtung; Mutationen sind negative Tests. `tests/manual/cowork-uat-fixtures.js` belegt die tatsächlichen Fixture-Grade und Handoff-Inhalte ohne Parser-/OCR-/Journal-Mocks. | E0 korrigiert |

RC139-Lieferabsicherung: Die finale Inventur darf die beiden normalen Mac-ZIPs
zusätzlich enthalten, verlangt auch für diese exakt den Kandidatencommit und
weist doppelte/unbekannte Namen ab. Windows-UAT bleibt Windows-UAT.
`test-release-version.mjs` sichert den Schnitt aus einer veröffentlichten
einfachen „RC…“-Quellstandsaussage ab; ein neuer RC darf nicht versehentlich
als bereits veröffentlicht stehen bleiben. Dies ist Teil von BL-041.17 und
der dauerhaften Versions-/Releasewahrheit, kein neues Produktfeature.

Lokaler Nachweis: `node tests/manual/cowork-release-offline.mjs` baut in einem
isolierten sauberen Test-Checkout Normal-/Debug-Pakete mit dem vorhandenen
attestierten Windows-Node, führt beide nativen Paketprüfungen aus und erstellt
UAT/SPDX/SHA256SUMS mit vier tatsächlich hashgleichen Inventareinträgen. Keine
Netzwerkaufrufe, keine Änderungen am Hauptrepository-Commit, kein Release-GO.
RC139 hat nach Commit den separaten echten Releaseweg erneut bestanden, nun
einschließlich der zwei Mac-ZIPs und sechs finalen Prüfsummeneinträge. Modell-UAT,
Windows-/macOS-N3/N4 und Fresh-Install bleiben als E1/E2 offen.

### Erledigungsabgleich der Restbefunde aus dem Gesamtgegenreview 02.09.2026

Belegte Befunde des Claude-Code-Gesamtgegenreviews mit aktuellem Erledigungsstand (Bericht
`tasks/archiv/2026-09-03-claude-code-gesamtreview-bericht-rc86.md`). Sie sind ihren bestehenden
Storys zugeordnet und keine neuen Storys; Unterredaktion wiegt schwerer als
Komfort.

| Befund | Story | Prio | Rest |
|---|---|---|---|
| Liveness nur über `kill(pid, 0)`: eine wiederverwendete PID ließ eine tote Executor-Lease „lebendig“ wirken. | BL-011.11 | erledigt | PID plus OS-Prozessstartidentität implementiert; reale Crash-/macOS-Evidenz bleibt in Abschnitt B |
| Unicode-Kompatibilitätsvarianten (Fullwidth `＠`/Ziffern, Dot-Leader), Kontakt-/E-Mail-Überlappung und IBAN-Folgeidentifier. | BL-021.1 | E0 erledigt für die reproduzierten Fälle | Längengleiche begrenzte Erkennungssicht statt globalem NFKC; Original-/OCR-/Reviewoffsets bleiben exakt. `tel`/`sms` grenzen Zahlen ab und schützen eine überlappende vollständige E-Mail; benannte `callto`-Ziele bleiben vollständig geschützt. IBAN-Prosaabgrenzung für numerische DE/AT/BE und Schutz nachfolgender Identifier einschließlich zusätzlicher Ziffern. 20 IBAN-/127 PII-Fälle, echte Veröffentlichungs- und Markdown-only-Negativkontrollen. Keine pauschale Confusable- oder Länderlayout-Vollständigkeit; verbleibende konservative Überredaktion im RC109-Bericht. |
| Support-Review rekonstruierte Rohtext im MCP-Hauptprozess ohne `network-deny`. | BL-020.3 | E0 erledigt | Ausschließlich vorhandener guarded Review-Worker; Metadatenreparatur unter dessen Lock, danach strikte Reviewbereitschaft. Echter stdio-Test einschließlich Intake-Reservation, ACK/Cancel und privater Feldprojektion; ACK belegt keine sichtbare UI oder Fertigstellung. |
| Ein nach ACK-Timeout gestoppter Intake ließ private Kopien trotz totem Owner bis zum Intent-Ablauf liegen. | BL-011.8 | E0 erledigt | Nachweislich toter Owner ohne Journal: beim nächsten bestehenden Recovery-/Retentionlauf identitätsgebunden bereinigen, ohne zusätzliche TTL-Wartezeit. Live/unklare/wiederverwendete PID, neue Journale, Swap und Cleanupfehler bleiben geschützt. Keine Original-/Outputlöschung und kein neuer Timer. |
| `visibleResultTreeOverlaps` ohne Cache (Realpath je Datei und Wurzel). | BL-044.1 | P3 | **geschlossen:** direkte lokale 201-Kandidaten-/20-Verzeichnisse-Mikromessung auf Windows x64: erster Lauf 79,235 ms, p50 71,627 ms, p95 77,142 ms bei 30 warmen Läufen und festem lokalen Referenzbudget 250 ms. Ein Cache ist auf diesem Host nicht indiziert; End-to-End-Admission und UNC-/Sync-Root-Gegenprobe bleiben E1 |
| Skill-Evals ohne DS-069-Fälle (Ordnerwechsel, Reset, `result_folder_required`, Sync-Hinweis). | BL-041.10 | E0 erledigt | Sechs neue Fälle: 39 synthetische Anfragen, zehn echte Normalwerkzeuge, genaue Argumentverträge und 22 Korpustests. Modell-/Hostabnahme bleibt E1/E2. Historische MCPB-Metadaten begründen keinen zusätzlichen Produktweg. |
| `test:product` (Profil `full`) startet über den Picker-Lifecycle-Test reale, fensterlose PowerShell-Prozesse (nur Windows, zeitbegrenzt). | BL-002 | P3 | akzeptiert; bei Bedarf in ein Windows-Only-Gate auslagern |
| Mehrfach gepflegte Diagnose-Allowlists und IPC-ACK-Klassifikation über Fehlertext. | BL-041.1 | E0 erledigt | Ein gefrorener öffentlicher/Workflow-/Supportkatalog; feste `.code`-Werte an Timeout, Abbruch, IPC-Fehler und frühem Exit. Exakte codefreie Legacytexte nur explizit opt-in. Unbestätigte Übernahme statt falscher Nichtstartzusage; Lease/Slot bis tatsächlichem Exit erhalten. |

### Restbefunde aus UML-, Architektur-, UX- und Fehlergegencheck 04.09.2026

Die UML-Prüfung hat die Zustandsmodelle von Dokumentposition, abgeleiteter
Stapelphase und kurzlebiger Reservation getrennt. Sechs technische Defekte sind
E0 geschlossen: Setupdialoge erst nach Readiness-/Aktivitätsprüfung,
zweckspezifische Pickerfehler, mehrprozesssichere und physisch bereinigte
Diagnoseereignisse sowie exklusive Ergebnisveröffentlichung ohne
Überschreibungsrennen, eine begrenzte JSON-RPC-Frameaufnahme und die wieder
aus der kanonischen Protokolldatei erzeugte MCPB-Engineering-Metadatenprojektion.
Das veraltete Marketplace-Einzeldateiartefakt wird beim Build entfernt. Die folgenden Punkte bleiben echte Lieferungen und werden
nicht durch Diagramme als erledigt dargestellt:

| Befund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| Der Abschluss galt nach erfolgreichem Presenter-Start als übernommen, nicht erst nach einer belegten sichtbaren Darstellung. | BL-041.10, BL-012.2 | E0 erledigt | Standalone-Renderer-Paint, Windows-`Shown` und AppKit-`SHOWN` stehen E0; ausschließlich die reale sichtbare Windows-/macOS-Beobachtung bleibt E1/E2 offen. |
| Der Ergebnisstamm ist eine ausdrückliche geräte- und produktlokale Einstellung. Cowork stellt dem MCP keinen belastbaren aktuellen Workspacepfad bereit; DataSecure darf ihn nicht erraten. | BL-040.5 | entschieden | DS-080: Ziel beim Start identitätsgebunden an den Stapel binden; Änderung nur über „Ergebnisordner ändern“, keine Rückfrage und kein heimlicher Wechsel pro Projekt oder Lauf |
| `MCP26-01` ist keine offizielle Protokollversion; ein harter Wechsel würde ältere Claude-Hosts ohne Produktnutzen ausschließen. | BL-041.8 | entschieden | DS-081: moderne Version `2026-07-28` und getestete Legacy-Pfade hostgesteuert aushandeln; keine Nutzereinstellung, keine vollständige Konformitätsaussage ohne offizielle Conformance-Evidence |
| Klare Positionen eines Mischstapels sind intern dauerhaft, der sichtbare Export wartet auf den terminalen Gesamtstapel. | BL-043.1, BL-040.6 | entschieden | DS-079 behält die terminale sichtbare Semantik ausdrücklich bei; E0-Negativtest verhindert Teillauföffnung |
| Windows besaß einen Sammelreview, macOS nur einzelne modale Entscheidungen. | BL-012.9, BL-012.10 | E0 erledigt | macOS besitzt jetzt einen einzelnen scrollbaren AppKit-Sammeldialog; native Intel-/ARM-Ausführung, Fokus und Accessibility bleiben E1/E2 |
| „Ergebnisse öffnen“ öffnete den Output-Stamm statt zwingend den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | exakter vollständiger `Lauf-*`-Ordner wird im vertrauenswürdigen Prozess auf allen unterstützten Shellpfaden geöffnet; Zielhostbeobachtung bleibt E1 |
| Ein offener Export-Outbox-Eintrag besaß keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | Replay und Terminalexport sind über atomaren Claim serialisiert; Live-Claim, Zielaustausch und Wiederanlauf sind regressionsgetestet |
| Die Worker-Empfangsbestätigung belegt validierte Nachrichtenannahme, aber noch keinen dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentlicher Zustand benennt bis zum Checkpoint ausdrücklich `checkpoint_pending` |
| Lange Standalone-Stapel besaßen keine passive lokale Fortschrittsanzeige. | BL-012.6, BL-042.3 | erledigt | inhaltsfreie Vorbereitung und monotone Zähler laufen im bestehenden Fenster ohne Polling durch Claude; E2-UX bleibt offen |
| Skill und Server spiegelten Teile der Zustandsentscheidung und konnten sprachlich oder logisch auseinanderlaufen. | BL-041.1 | E0 erledigt | Der Server liefert die vollständige inhaltsfreie `user_status`-Aussage einschließlich Version und Zielhinweisen; der Skill gibt sie unverändert wieder und leitet keinen Zustand mehr aus Einzel-Flags ab. Echte Claude-UI-Abnahme bleibt E1/E2. |
| GitHub-synchronisierte Organisations-Marketplaces unterstützen die zuvor erzeugte `archive`-Quelle nicht; die selbsttragende Projektion überschreitet mit den offiziellen macOS-Node-Binaries zudem GitHubs 100-MiB-Grenze für normale Git-Objekte. | BL-010.8 | blockiert | Ziel-ZIPs bleiben der freigegebene UAT-Weg. Für den Marketplace erst eine kleinere selbsttragende Runtime oder einen von Claude nachweislich unterstützten Binärtransport festlegen; keine LFS-Annahme und keine Universal-ZIP-Grenzerhöhung. |
| DataSecure kann verbundene Cowork-Ordner nicht auslesen und damit die Trennung von Quellen und Ergebnisziel nicht technisch attestieren. | BL-040.5, BL-041.7 | entschieden | ehrliche Setup-/UAT-Regel: nur dedizierten Ergebnisordner verbinden, Quellordner nicht verbinden; keine zusätzliche Laufbestätigung |
| Nativer Standalone-Admission-Pfad prüfte die 500-MiB-Gesamtgrenze nicht und eine verlorene Worker-Bestätigung ließ dieselbe Auswahl erneut starten. | BL-010.12, BL-011.10 | erledigt | Gesamtbudget vor Start, einmaliger Verbrauch nach delegiertem Start und Regressionstests |
| Ein neuerer aktiver Standalone-Stapel verdeckte den jüngsten vollständig sichtbaren Ergebnislauf. | BL-010.13, BL-040.6, BL-010.29 | erledigt | Seit DS-086 bleibt die Navigation zwischen Start, Verarbeiten und Verlauf unabhängig vom Laufzustand. Status und Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel. Jede Verlaufszeile öffnet ausschließlich ihren eigenen vollständigen Ergebnislauf bzw. ihre Zuordnung; ein fehlendes Ziel fällt niemals auf einen anderen Lauf zurück. |
| Ein policyinkompatibles Altjournal wurde als fortsetzbar angeboten; der Worker konnte vor der Einzelverarbeitung abbrechen und die Position offen zurücklassen. | BL-010.13, BL-011.8, BL-010.23 | E0 erledigt | Recovery prüft den aktuellen Pseudonym-/Policykontext vor jeder Resume-Projektion. Ungefangene Fehler nach gültigem Claim werden mit festem Code und gemeinsamem Retrybudget stabilisiert; Markdown-only bleibt mappingfrei. Inaktive Altläufe sperren keine neue Quellenwahl. |
| Tauri und Node-Sidecar hatten abweichende Pfadbudgets und die UI besaß `core:default`. | BL-010.12, BL-010.15 | erledigt | identische UTF-8-Einzel-/Gesamtbudgets, nicht-UTF-8 fail-closed und nur explizite DataSecure-Kommandorechte |
| Atomare Journalpublikation erkennt viele Austauschfälle, kann aber ohne betriebssystemweites CAS keinen feindlichen gleichzeitigen Austausch durch denselben lokalen Benutzer ausschließen. | BL-011.8, BL-011.11 | P3 | bewusst außerhalb des aktuellen lokalen Vertrauensmodells; für ein später verschärftes Modell immutable Generationen oder nativen No-Replace-/CAS-Vertrag entwerfen, ohne Anwenderdialog |

## B. Technisch vorbereitet – menschliche Evidenz offen

Der RC151-Standalone-Funktionslauf auf Windows ist **durchgeführt** und wird
für passende Prüfschritte angerechnet: rekursive Auswahl/Ergebnisweg und beide
Modi (N3-05), positiver Formatpfad und geprüfte unveränderte Quellen
(N3-06/N3-08) sowie kontrollierte Fachtext-/PII-Stichproben (N4-07). Das ist
keine pauschale formale N3/N4-Freigabe. Gezielt offen bleiben insbesondere
sichtbare Auswahlkorrektur und Grenzablehnung, ein versionsgebundener
200-Dateien-/500-MiB-Lauf, Abbruch/Wiederaufnahme, Update/Rollback,
Tastatur/Screenreader, rollengetragene Inhaltsfreigabe, Mac-Finder-/Gatekeeper-
und Linux-Desktopbedienung sowie Coworks eigene Host-/Modelltests. Bereits
geprüfte 140 Dateien werden nicht allein für einen administrativen Status
erneut verarbeitet. **Offen** bedeutet: ein konkreter Resttest ist ausführbar,
aber noch nicht belegt. **Blockiert** bedeutet nur: eine benannte technische
Voraussetzung fehlt tatsächlich; es ist nicht gleichbedeutend mit „Code kaputt“
oder „RC151-ZIP darf nicht verwendet werden“. Positive Format-/Starttests
ersetzen keine negativen Fehler-, Accessibility- oder Mac-Bedienfälle. Derselbe
beobachtete Test darf dagegen mehreren passenden Stories als Evidence dienen.

| Story | Noch erforderlicher Nachweis | Status |
|---|---|---|
| BL-010.8 | Die drei selbsttragenden Ziel-ZIPs sind gebaut und nativ gestartet; sie bleiben der aktuelle Cowork-UAT-Weg und sind durch diesen Eintrag **nicht** blockiert. Nur der zusätzliche Git-Marketplace-Kanal wartet auf eine kleinere Runtime/einen unterstützten Binärtransport: einzelne offizielle macOS-Node-Dateien überschreiten GitHubs normale 100-MiB-Objektgrenze. Danach erst Marketplace-Veröffentlichung und Zielhost-Installation/Update. | **blockiert** |
| BL-010.7 | Lokale Cowork-Sitzung eines bestehenden Desktop-Deployments mit Plugin-MCP positiv sowie Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – negativ für Originale prüfen. | **offen** |
| BL-010.1 | Portablen Pluginstart ohne vorinstallierte Runtime nachweisen: RC151-Pakete sind auf Windows x64, macOS Intel und ARM64 nativ gestartet. Offen ist der frische Start **in einer echten lokalen Cowork-Sitzung** auf den freizugebenden Hosts, nicht ein weiterer bloßer CI-Paketstart. | **offen** |
| BL-010.2 | Windows-x64 Fresh Install, Kernlauf, Update und Entfernen. | **offen** |
| BL-010.3 | macOS Intel/ARM Fresh Install, Kernlauf, Quarantäne und Entfernen. | **offen** |
| BL-010.6 | Upgrade und Rollback mit unveränderten Quellen und synthetischen Daten. | **offen** |
| BL-011.3 | Mehrere pausierte Stapel und stabilen Pseudonymkontext real prüfen; kein Keyring. | **offen** |
| BL-011.6 | Größen- und Ressourcenstopps auf Windows und macOS beobachten. | **offen** |
| BL-011.7 | Abbruch, Fortsetzung und Zähler in echter Cowork-Bedienung verstehen lassen. | **offen** |
| BL-011.9 | POSIX-Supervisor auf realen macOS-Zielen unter Last und Abbruch nachweisen. | **offen** |
| BL-011.11 | Crash-/Dateisystemverhalten auf realen Zielsystemen prüfen. | **offen** |
| BL-011.13 | Plain-Arbeitskopien, Review und Fortsetzung auf Zielsystemen abnehmen; kein Schlüsselbundtest. | **offen** |
| BL-012.2 | RC151-Windows-Abschluss beider 140-Dateien-Läufe und der sichtbare RC145-Windows-Sammelreview sind beobachtet. Noch gezielt prüfen: konkrete RC151-Reviewfundstelle, vertagte Entscheidung/Resume und Stopmeldung in Windows sowie die entsprechenden Mac-Ansichten; die bereits gesehenen Abschlussläufe nicht wiederholen. | **offen** |
| BL-012.3 | Vertagten Review nach Neustart ohne neue Dateiauswahl fortsetzen. | **offen** |
| BL-012.5 | Tastatur, Zoom, Screenreader und Fokus auf Windows/macOS prüfen. | **offen** |
| BL-012.6 | Alltagssprache und genau eine nächste Aktion mit fachfremden Personen prüfen. | **offen** |
| BL-012.7 | Kernaufgabe ohne technische Hilfe in höchstens drei bewussten Aktionen abschließen. | **offen** |
| BL-012.8 | Ausgelieferten nativen AppKit-Sammelreview auf macOS mit Fresh Install, Fokus und Bedienung prüfen; der `osascript`-Picker ist ein eigener UI-Pfad. | **offen** |
| BL-012.9/10, BL-043.1 | Vereinfachten Sammelreview und automatischen Klar-Datei-Pfad in echter lokaler Cowork-Sitzung auf Windows/macOS beobachten; prüfen, dass klare Dateien keinen Dialog öffnen und die inhaltsfreien Zähler verstanden werden. | **offen** |
| BL-021.1 | Windows ist mit RC151 teilweise belegt: 52 direkte TXT/Markdown-Konvertate sind bytegleich und die zugehörigen Anonymisierungsausgaben wurden kontrolliert. Offen sind die gleiche sichtbare Bedienung auf macOS sowie nicht durch diese Stichprobe abgedeckte Grenzfälle; kein erneuter Windows-Gesamtlauf. | **offen** |
| BL-021.2 | Windows ist mit RC151 teilweise belegt: 24 CSV-Quellen und 2168 fachliche Beschreibungszeilen wurden in der Anonymisierung nachgeprüft. Offen sind gezielte CSV-Dialekt-Grenzfälle und macOS-Bedienung/Fachurteil; nicht erneut alle 140 Quellen laufen lassen. | **offen** |
| BL-031.1 | Zertifikats-/Organisationskontext durch IT-/Health-IT-Fachvertretung prüfen. | **offen** |
| BL-032.1 | Der lokale Sammelreview wurde im RC145-Windows-Lauf sichtbar und nach einer Entscheidung abgeschlossen. Die konkrete Fundstellenkennzeichnung von RC151, Vertagen/Ändern und der AppKit-Mac-Dialog sind noch beobachtet auf Verständlichkeit und Konsistenz zu prüfen. | **offen** |
| BL-041.1 | Beide Skills in echter Claude-UI gegen denselben Jobvertrag prüfen. | **offen** |
| BL-041.2 | Ursprüngliche Aufgabe nach Abbruch begrenzt und verständlich fortsetzen. | **offen** |
| BL-041.3 | Chat-Upload eines synthetischen Originals muss sicher zum lokalen Picker umleiten. | **offen** |
| BL-041.4 | Spracheingabe und direkte Skillauswahl müssen denselben Ablauf starten. | **offen** |
| BL-041.5 | Cowork-Grenzstapel mit 200 Dateien/500 MiB sowie Neustart/Fortsetzung in einer lokalen Cowork-Sitzung abnehmen. Den versionsgebundenen Grenzlauf aus BL-051.3 dafür mitbenutzen, soweit er denselben Produkt-/Hostpfad prüft; der Windows-Standalone-140-Lauf deckt Cowork nicht ab. | **offen** |
| BL-041.6 | Reine Anonymisierung endet lokal ohne Polling oder automatisches Ergebnislesen. | **offen** |
| BL-041.7 | Werkzeugberechtigungen, Pickerabbruch und Ergebnisübergabe in aktueller Cowork-Version prüfen. | **offen** |
| BL-041.9 | Den automatischen Übergang vom Hintergrundstapel in genau einen nicht blockierenden Sammelreview sowie „Später“, Abschluss und Wiederaufnahme auf Windows/macOS beobachten. | **offen** |
| BL-041.10 | Die gelieferte einmalige Ergebnisordnerwahl, Wiederverwendung ohne neue Abfrage, Ordnerwechsel, begrenzten Hintergrund-Replay und „Ergebnisse öffnen“ in echter Cowork-Bedienung auf Windows/macOS abnehmen. Beobachtung 03.09.2026 (Windows, rc85): Cowork beendet den MCP-Elternprozess kurz nach der Tool-Antwort; die Abschlussmeldung erschien in 4 von 5 Läufen nicht. Seit der zweiphasigen Eltern-/Worker-Übernahme (E0) ist nativ zu belegen, dass bei Elternprozessende oder Presenterfehler genau ein Fenster erscheint. | **offen** |
| BL-041.11–.13 | Registry, öffentlicher Statusumschlag und progressive Skillkontexte mit den 41 vollständigen Modellfällen jeweils dreimal in frischen Cowork-Sitzungen prüfen; zusätzlich die kuratierte 12×3-Candidate-Matrix ausführen. Ein verbotenes Outcome ist kein Mehrheitsentscheid, sondern Release-Stopper. | **offen** |
| BL-044.1 | Rekursive Ordnerquelle mit Link-/Race-Gegenproben auf Zielsystemen prüfen. | **offen** |
| BL-049.1 | Format-/Strukturgates und Ergebnisgrade durch Security auf Zielsystemen abnehmen. | **offen** |
| BL-050.3 | Referenzwerte und reales Dateisystem-/Power-Loss-Verhalten erfassen. | **offen** |
| BL-051.1 | Plugin-ZIP auf Windows x64 und macOS Intel/ARM frisch installieren. | **offen** |
| BL-051.2 | Nur für den zusätzlichen Marketplace-Kanal: privaten Marketplace auf Windows/macOS installieren, aktualisieren und entfernen, sobald BL-010.8 einen veröffentlichbaren selbsttragenden Binärtransport belegt. Der aktuelle ZIP-UAT-Weg ist unabhängig davon. | **blockiert** |
| BL-051.3 | Versionneuen UAT-Serienlauf mit 200 Dateien und bis zu 500 MiB durchführen. | **offen** |
| BL-051.4 | Produktrollback auf Windows/macOS abnehmen. | **offen** |
| BL-051.5 | Zuerst den RC151-ZIP-Lebenszyklus in echter Cowork-Bedienung abnehmen; der Marketplace-Anteil kann erst nach BL-010.8/BL-051.2 geprüft werden und blockiert den ZIP-Piloten nicht. | **offen** |
| BL-051.6 | Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – sowie lokale Desktop-Sitzung ohne MCP negativ auf Originalzugriff prüfen. | **offen** |
| BL-052.1 | RC151-Standalone ist auf Windows durch den Anwender mit 140 Quellen in beiden Modi gelaufen; die Nachprüfung wird für N3-05/N3-06/N3-08/N4-07 als Teil-Evidenz übernommen. Nur noch fehlende Einzelfälle des aktuellen UAT-Kits, Testerrollen und dokumentierte Gesamtabnahme ergänzen; keine pauschale Wiederholung des Funktionslaufs. Cowork und andere Zielhosts bleiben getrennt. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit fachfremden Nutzenden abnehmen. | **offen** |
| BL-052.5 | Architektur und lokale Sicherheitsgrenze vor breitem Rollout freigeben. | **offen** |

### Aus der aktuellen Abnahmeliste entfernt

| Story | Entscheidung und vorhandener Nachweis | Status |
|---|---|---|
| BL-011.12 | Adaptive Mehrprozessvorbereitung ist für RC151 keine Voraussetzung. Der Produktstandard bleibt nach DS-047 seriell; die vorhandene 100-Dateien-Messung und der RC151-Windows-140-Dateien-Lauf liefern einen Ausgangspunkt. Erst ein belegter Zielhost-Engpass eröffnet eine neue Optimierungsstory. Es wird **nicht** behauptet, dass die optionale Parallelisierung implementiert oder abgenommen sei. | **erledigt** |
| BL-041.8 | Die ausgelieferte Cowork-Konfiguration startet einen lokalen stdio-MCP-Server; Paket- und Protokolltests prüfen diesen Produktpfad. Der derzeitige offizielle [MCP-Conformance-Serverlauf](https://github.com/modelcontextprotocol/conformance#testing-servers) verlangt dagegen eine URL und bewertet damit nicht dieses unveränderte stdio-Plugin. Deshalb entfällt der unpassende Pflichtlauf gegen `2026-07-28` für RC151; wir behaupten **keine vollständige offizielle MCP-Konformität**. Optionale Tasks/Benachrichtigungen werden ohne eigenen Zielhostnachweis nicht aktiviert. Ein neuer Transport oder ein offizieller stdio-Prüfpfad wäre eine neue Aufgabe. | **erledigt** |

Nur BL-010.8 und BL-051.2 sind damit noch tatsächlich **blockiert**: Für den
zusätzlichen Marketplace fehlt ein veröffentlichbarer Binärtransport. Eine
fehlende menschliche Testperson, ein noch nicht ausgeführter Mac-/Cowork-Test
oder ein leerer UAT-Vordruck heißt hier **offen**, nicht blockiert. Beide
Marketplace-Einträge beschreiben dieselbe Abhängigkeit und verlangen keinen
doppelten Test.

## Release-Evidence-Verträge

- **PKG-04:** Zwei unabhängige, jeweils mit leerem Cargo-Buildzustand erzeugte
  Windows-x64-Pakete desselben sauberen `main`-Commits müssen als ZIP sowie bei
  Desktop- und Core-Binary bytegleich sein. Beide Archive bestehen Manifest-,
  Modus-, SBOM-/Summen-, echten Worker-Handoff- und nativen Start-Smoke. Das
  Receipt nennt Commit, Tree, Toolchain und alle drei Hashes.
- **INT-13:** Eine Integrationsbindung darf erst nach bestandenem PKG-04
  entstehen und referenziert unveränderlich Commit, Kandidat, Archivhash und
  PKG-04-Receipthash. Ein Stage-Verzeichnis, `latest` oder nur eine Versionsnummer
  sind keine gültige Bindung. Zielhost-UAT bleibt davon getrennt offen.

## C. Spätere Format- und Plattformausbaustufen

Die folgenden Office-/PDF-/Bildgates betreffen die **Anonymisierungsfreigabe**
und vollständige Objekt-/Sicherheitsabdeckung. Die reine Standalone-Konvertierung
dieser Formate ist unter BL-010.18/28 bereits technisch integriert und darf
ehrlich unvollständige Konvertate mit Hinweisen liefern; sie hebt diese
Anonymisierungsgates nicht auf. Linux x64 ist als eigenes Standalone-Zielpaket
technisch integriert; seine sichtbare Zielhost-UAT bleibt offen.

| Story | Lieferung | Status |
|---|---|---|
| BL-010.4 | Linux-x64-glibc-Paket als AppImage-in-ZIP mit gebündelter Runtime, nativem POSIX-Supervisor, echter App→IPC→Core-Ausführung, Paketprüfung und bytegleichem Doppelbau liefern. E0 ist gemäß DS-094 durch Lauf `34356576842` auf Commit `84fd616c` belegt; sichtbar bleiben Dateidialog, Drag-and-drop, Dateimanager, Accessibility, Performance, Installation, Update/Rollback und menschliche UAT. | **erledigt** |
| BL-022.2 | XLSX-Extraktion und Produktintegration sind E0: keine stille Zeilen-/Spaltenkürzung, explizite Ressourcenfehler, Literalformel plus gespeicherter Wert und sichere OPC-Prüfung. Die Ausgabe bleibt ehrlich `incomplete`, bis ein realer Fachkorpus Zell-, Kommentar-, Chart-, Relationship- und Interoperabilitätsabdeckung E1/E3 belegt. | **erledigt** |
| BL-022.3 | PPTX-Extraktion und Produktintegration sind E0: Textläufe, numerische Notizen, tatsächliche Folienreihenfolge und Prüfung aller vorhandenen XML-/RELS-Teile gegen DTD/Entities und Strukturgrenzen. Die Ausgabe bleibt ehrlich `incomplete`; Master-, Chart-, Objekt-, Layout- und Fremderzeugerabdeckung benötigen E1/E3. | **erledigt** |
| BL-023.1 | Standalone verarbeitet PDF, Scan-PDF und Bilder lokal Markdown-first und trennt Extraktions- vom Anonymisierungsstatus. Das NO-GO gilt nur für eine Vollständigkeits- oder Pixelredaktionszusage des Originalcontainers sowie für Cowork-PDF/Scan-PDF/Bilder, bis deren kompakter paketierter OCR-Pfad E0 und auf Zielhosts belegt ist. | **in Arbeit** |
| BL-023.2 | Text-PDF folgt einer endlichen Allow/Stop-Matrix: nativer Text, begrenzte Standardmetadaten und gemalte Bildoperatoren werden verarbeitet; erkannte Formulare/XFA, JavaScript/Aktionen, Anhänge, Signaturen, Annotationen, Outline, XMP und Verschlüsselung stoppen. Nicht vollständig beweisbare Originalcontainer-Coverage wird weiterhin ehrlich als `incomplete` ausgewiesen und nicht als vollständig anonymisierte Quelldatei bezeichnet. Der lokale Parser-/Securityvertrag ist E0 geschlossen; Layout-/Fremderzeuger-/Fachqualität bleibt E1/E3. | **erledigt** |
| BL-023.3 | Formulare/XFA, JavaScript/Aktionen, Anhänge, Signaturen, Annotationen, Outline, XMP und Verschlüsselung stoppen im Produktpfad; standardisierte Info-Felder werden begrenzt erhalten. Standardskonforme In-Memory-Goldendateien durchlaufen dafür den echten paketierten PDF.js-Parser, einschließlich AcroForm, Signaturfeld, EmbeddedFile/Name-Tree sowie leerem und nichtleerem Benutzerpasswort. Dabei wurde die reale PDF.js-`Map`-Rückgabe für Anhänge als zuvor kaschierter Defect gefunden und generisch geschlossen. Zielhost-, Fremderzeuger- und adversariale Fachabnahme bleiben E1/E3. | **erledigt** |
| BL-023.4 | Reale Scan-PDF-Konvertierung und das Privacy-Gate für textleere Extraktion sind E0 geprüft. Ein textloses Bild neben vorhandenem nativen PDF-Text erzeugt keinen falschen `OCR_TEXT_EMPTY`-Gesamtbefund mehr; wirklich textleere Extraktion bleibt gesperrt. DS-103 lässt passiv ausgelassene Objekte nur für die Anonymisierung des extrahierten Markdown-Inhalts zu. Offen bleiben visuelle Vollständigkeit, OCR-Fachqualität und Zielhostkorpus E1/E3. | **erledigt** |
| BL-024.3 | Reale PNG-/JPEG-/BMP-Extraktion und nachgelagerte Anonymisierung ihres gültigen, nichtleeren OCR-Markdowns sind E0 geprüft. Das Produkt anonymisiert die Markdown-Repräsentation und verspricht keine Pixelredaktion des Originalbilds; Pixelredaktion ist kein aktuelles Produktziel. Offen bleiben Decoder-/Metadaten-/OCR-Fachqualität und Zielhostkorpus E1/E3. | **erledigt** |

## BL-010.53 – Standalone-Prototyp v2 umsetzen (DS-110)

**Lokaler RC160-r7-Testkandidat 14.10.2026 (.2/.3/.7/.8):** Für den reinen
Markdown-Weg kann der Anwender die selbst gewählte OCR-Kontaktprüfung jetzt
direkt am Lauf ausdrücklich überspringen. Der neue Zustand wird dauerhaft am
Raw-Lauf gespeichert und setzt ihn ohne erfundene Kontaktbestätigung fort;
Anonymisierungsprüfungen bleiben davon ausgeschlossen. Der bestehende
Anonymisierungsweg wird zusätzlich im frischen Windows-Paket durch echte
Sidecar-/Worker-Läufe mit Fundstellen-, Dokument- und Exportphasen geprüft.
Produktquellsuite, 118 Rusttests, Dokumentationsgates und ZIP-Verifier sind
grün; paketgebundene OCR-/Review-Szenarien einschließlich aktivem Skip
bestanden. Native GUI-Bedienung und Mac bleiben offen. Das neue
`content-v1`-Profil für Anonymisierung ist **nicht** freigeschaltet: sein
Rust-/IPC-/UI-Start und vollständiger Ende-zu-Ende-Nachweis fehlen. Private
Publikation, Mapping und Ergebnisexport sind erst im späteren lokalen
Quellstand verbunden, nicht in diesem Paket. Der Testkandidat belegt nur den
bisherigen Anonymisierungsweg, keine 1:1-Vollständigkeit oder garantierte
Anonymität für beliebige Dateien. Paket und Grenzen stehen in CURRENT_STATE.

**OCR-Kontaktabschlusskorrektur nach r6, 14.10.2026 (.3/.4/.7/.8):**
Reine Markdown-Läufe kehren nach gebundenem Kontaktabschluss zur Ursprungsseite
zurück, statt automatisch eine weitere Prüfseite zu öffnen. Der Editor bleibt
freiwillig; bei Anonymisierung bleiben Dokumentfreigabe und Export getrennt
erforderlich. Zweck-/Lauf-/Generationbindung und Abschlussbedingungen erhalten;
unbekannter Zweck löst keine anonymisierte Folgehandlung aus. Verständliche
Volltext-OCR-Warnung statt Rohcode, ohne technische Warnungen zu löschen.
Dateiname öffnet Vergleich, Häkchen wählen nur für eine zusätzliche Kopie.
193 gezielte Testgruppen, synthetischer Kontaktflow und echter Headless-
Darstellungsgegenlauf bestehen. Frischer Windows-Bau, vollständiger r7-ZIP-
Verifier und isolierter Sidecar-/Worker-Smoke dieses neuen Pakets bestehen,
einschließlich bereits zuvor vorbereitetem Raw-Skip ohne Kontaktbestätigung.
Bestehendes r6-ZIP unverändert; native Bedienung und Mac bleiben getrennt offen.
Paketgegenprüfung fand danach einen P2-Splitfall beim bereits vorbereiteten
Raw-Skip: Folgegruppe erschien trotz laufweiter Abwahl. Minimaler Loop-Abbruch
und 18 Kontaktreviewgruppen plus unabhängige 250+250-/Anonymisierungsgegenprobe
schließen den Sourcebefund. r7 wird nicht übergeben. Zusätzliche Inhaltsgegenprobe
fand verlorene Anwendung früherer Kontaktantworten bei späterem Skip; jetzt
erst gespeicherte Antworten lesen, nur fehlende ungeprüft lassen, beide Warnungen
erhalten. 21 Prozessor-/14 Consumergruppen und unabhängige erzeugte Inhaltsprobe
grün. Auch r8 zurückgehalten. Abschließender r9-Bau, vollständiger ZIP-Verifier,
Source-Byte-Abgleich und isolierter Paket-Sidecar-Smoke bestehen; genaue Grenzen
in CURRENT_STATE und paketgebundener PRUEFUNG.json. Native Bedienung bleibt offen.
Keine allgemeine OCR-Korrektheitszusage oder Erledigung der ganzen Scheibe.

**OCR-an-Anwenderkorrektur 14.10.2026 (.2/.3/.7/.8, lokaler Windows-r4-Teststand):**
Raw-Markdown-Nachkorrektur priorisiert nur die aus dem Laufjournal exakt an
Datei-ID und Namen gebundenen Inhaltshinweise. Filter für nachbearbeitete,
alle und hinweisfreie erstellte Dateien; nur sichtbare Zeilen sind wählbar.
Dateifehler ohne Markdown bleiben getrennt. Dauerhaftes **Korrektur gespeichert**
beruht auf aktueller Textabweichung statt Revision; Kopierzustimmung allein
setzt es nicht. Speichern einer Korrektur verändert nicht das erzeugte Ergebnis,
erst eine ausdrücklich bestätigte zusätzliche Kopie schreibt Nutzdateien.
OCR-Kontakt-Opt-in nennt vor Start und bei der 97-Stellen-/16-Dateien-Prüfung
Zweck, Umfang und Abschlussbedingung. Ein Dokumentfilter mit jeweiliger
Kandidatenzahl und Sammelwahl ermöglicht gezieltere Bearbeitung, ohne die
explizite Entscheidung aller Kandidaten zu überspringen. Fokussierte Tests,
synthetischer HTML-/Axe-/Reflow-Gegenlauf sowie Releasebuild, Verifier und
isolierter Sidecar-/Worker-Smoke des exakten Windows-r4-ZIP sind grün.
Die vollständige Headless-Produktsuite besteht mit 232 Testdateien.
Native Windows-Bedienprobe und Mac-Tests bleiben offen. Keine automatische
Inhalts- oder OCR-Korrektheitsgarantie.

**RC160-r3 Bedienkorrektur 14.10.2026 (.2/.3/.7/.8):** Bestätigter Start
bleibt auf der aktiven Laufseite; eine einzelne grüne Raw-Abschlusskarte
priorisiert Ergebnisordner vor geschlossenen Hinweisen und optionalen Aktionen.
Bereitstellungsmeldung laufgebunden und nur nach bestätigtem Abschluss
zurückgenommen. Optionaler Dokumenteditor mit sichtbarem Laden und gruppierten,
einzeln aufklappbaren Dateiursachen statt doppelter roter OCR-aus-Listen.
Keine Pflichtfreigabe für 116 bereits erstellte Raw-Dateien. Zusätzliche Kopie
mit ausdrücklicher Modalbestätigung: read-only Vorschau, exakte ACK-Revisionen,
erneuter Dateinamenplanabgleich, kein Teilkopieren/Replaying bei verlorener
Bestätigung. Anonymisierungsfreigaben unverändert. 49 Frontend-/69 Workspace-/
41 Storegruppen, History- und tatsächliche Headless-Darstellungsgegenproben
bestehen. Unabhängige Sicherheitsgegenprüfung ohne neuen reproduzierten Blocker.
Frischer Releasebuild, vollständiger Verifier und isolierter Sidecar aus genau
dem r3-ZIP bestehen: OCR-aus/-an, neue Dokumentklassifikation, Raw-Vorschau vor
Zustimmung und verweigerter echter Export, Korrektur/exakte Kopie/Neustart.
Lokaler Windows-Anwendertest bereit; native Anwenderbedienung und Mac bleiben offen.

R3-Nachtrag: 232-Dateien-Headless-Gesamteingang Exit 0. Erste begrenzte Windows-
Anwenderprobe/Screenshot bestätigt die verständliche grüne OCR-aus-Anzeige mit
133 Quellen/116 Ergebnissen/17 Auslassungen und 35 gesonderten Inhaltshinweisen.
OCR-an-Bedienprobe und vollständige UI-/Inhalts-/Mac-Abnahme bleiben offen.

**Markdown-Abschlusskorrektur 14.10.2026 (.2/.3/.7/.8):** Aus dem ersten
Windows-Anwenderlauf bestätigte Trennung: 116 Ergebnisse, 17 erwartete
OCR-aus-Auslassungen, 35 eigenständige Inhaltshinweise. Displayprojektion mit
gebundenem Raw-Optionsanker, Ergebnisordner als Hauptaktion, optionale Nachkorrektur,
separate technische Fehler und Nachkorrektur-/Kopierbelege implementiert.
Keine Änderung technischer Stoppszähler oder anonymisierter Freigaben.
Fehlender Options-/Ursachennachweis bleibt unbestätigt. 68 Workspacegruppen,
23 Leitfaden-/Projektionsgruppen und History-Gegenproben sowie tatsächliche
Headless-Darstellung mit synthetischem IPC bestehen. Eigene Windows-Bedienung
dieser Korrektur und Mac bleiben offen; neue lokale Auslieferung gesondert prüfen.
Die Schritte stehen in `02-zustaende-hauptaktion.md` und `05-fehlerfuehrung.md`
unter dem verknüpften RC160-Auftrag. Kein automatischer OCR-Neustart.
R2 im frischen Engineeringordner gebaut, vollständiges ZIP und echter Sidecar
daraus geprüft: OCR-aus acht Ergebnisse/vier erwartete Auslassungen/null
technische Fehler; OCR-an zwölf Ergebnisse/null Fehler. Bestehende Korrektur,
zusätzliche Kopie mit expliziter Freigabe, Originalnamen und Neustart grün.
Lokaler r2-Anwendertest bleibt der nächste Schritt; keine Veröffentlichung.
Vollständiger 232-Dateien-Headless-Eingang Exit 0, gezielte finale UI-/Browser-/
Dokumentationsgegenproben zusätzlich bestanden. R2 lokal testbereit;
Abnahmegrenzen in CURRENT_STATE und dem paketbezogenen `PRUEFUNG.json`.

**Auftragsstand 14.10.2026:** Der dauerhafte Zielauftrag vom 13.10.2026 ist
auf Anwenderwunsch beendet; Automation pausiert. Aktuell abgegrenzt beauftragt:
neuen reinen Markdown-Weg vollständig anschließen und eine lokale Windows-
Auslieferung zum Testen erstellen. Gemeinsame OCR-Checkbox standardmäßig aus;
Originalnamen und Inhalte bleiben auch nach manueller Korrektur erhalten.
Kein Main-Push, Release oder Actions-Start in diesem Auftrag.

Raw-Start/Rust/IPC/Intake, gespeicherte Optionen, lokale PDF-/Bild-/Office-OCR,
Korrektur, Freigabe und normaler Exportordner sind angeschlossen. Echter Sidecar
prüft zwölf Quellen: ohne OCR acht Ergebnisse/vier benannte Stopps; mit OCR
zwölf Ergebnisse/null Dateifehler; Originalnamen, exakter korrigierter Export
und Neustart bestehen. Neue Optionen für Anonymisierung bleiben gesperrt.
Vollständige frische Regression mit 232 Dateien, 118 Rusttests, Clippy,
65 Konvertergruppen ohne Skip und 26 Office-/MD-Gruppen bestehen. Exaktes
lokales Windows-ZIP in `dist/engineering-markdown-rc160-windows-20261014-r1`
gebaut; vollständiger Verifier und paketgebundener Sidecarflow bestanden.
Lokaler Markdown-Testkandidat ist lieferbar. Native Bedienung und Mac bleiben
separate offene Nachweise; keine Gesamterledigung von BL-010.53 daraus ableiten.
Details und SHA-256 in CURRENT_STATE sowie `PRUEFUNG.json` neben dem ZIP.

**Historischer Zielauftrag 13.10.2026:**
[Gesamtauftrag und sechs Spezifikationen](../../tasks/AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md)
konkretisieren die bestehenden Scheiben .1–.8, keine zweite Statusliste.
Die spätere Anwenderpräzisierung verlangt inhaltsgetreue Text-/Tabellenkopien
ohne Bildmarkup/technische Artefakte und nur ausdrücklich gewählte zusätzliche
Bild-/Grafik-OCR. Aufträge: Ablaufanzeige (.1/.3/.7), Hauptaktionspriorisierung
(.3/.5/.6/.7), vorhandene offene Queue sprachlich absichern (.4/.8), Übergänge
(.4/.5/.7), konkrete Fehlerführung (.2/.7/.8), gebundene Inhalts-/OCR-Profile
(.2/.4/.5/.6/.8). Neue Profile sind noch nicht durchgängig angeschlossen; keine Checkbox-
oder Paketfreigabe aus der Spezifikation ableiten. Native Desktoptests sind
wieder autorisiert; tatsächliche Bedien-/Mac-Evidence bleibt bis Ausführung offen.
Keine API-Keys, keine zusätzliche kostenpflichtige Modellnutzung. Nach jedem
Lieferblock und vor Paketen unabhängige technische Gegenprüfung. Der bereits
belegte Offenfilter mit 50+14-Nachrücken bleibt implementiert, nicht erneut offen.

**Inhaltsanschluss .2/.4/.5/.6/.8, 14.10.2026 – in Arbeit:** Konverterprofile
und gepinnte MD-/HTML-Syntaxanalyse sind technische Bausteine, noch keine
aktivierten Nutzeroptionen. Literal-TXT/CSV/Office einschließlich GFM-Tilden,
Diagramm-/Layout-/Mastertexte und Containerfortsetzungen sind gegen unabhängige
Renderer und 54 reale Windows-Konvertergruppen abgesichert. CSV-Privacy behält
die tatsächlichen Header; Einspaltenerkennung und Strukturprüfung nach vollständiger
Maskierung sind mit 13 CSV-/159 PII-Fällen und einem unabhängigen positiven/
negativen Strukturreview korrigiert. Geschlossener Optionsvalidator vorhanden.
Frischer vollständiger Headless-Eingang mit 221 Dateien, 109 Windows-Rusttests,
Clippy, Docs und strenge Plugin-/Marketplace-Struktur bestehen; sechs native
Formularfälle und neue Paket-/Mac-Bedienung bleiben eigenständige Abnahme.
Persistenzteil jetzt umgesetzt: Journal `/7`, unabhängiges Runmanifest `/3`,
Dokumentbasis `/2`, Intake-Intent `/3` und OCR-Korrektur `/3`; zehn reale
Dateisystemgruppen einschließlich Neustart, Optionswechsel bei identischen
Textbytes, Downgrade, Retention und all-rejected bestehen. Gemeinsames validiertes
Zweckrouting ersetzt reine `/5`-Abzweigungen. Unvollständige Unitfixtures erhalten
explizite Laufidentitäten. Belegerzeugung, Privacy-Capture und spätere
Review-Veröffentlichung erzwingen den Anonymisierungszweck am direkten Einstieg;
der vom Review reproduzierte Raw-Beleggegenfall sowie die Fehlerklasse über
mehrere Ergebniszustände sind regressionsgebunden korrigiert. Keine Aussage eines
Datenabflusses im normalen Hauptpfad. 222-Dateien-Headlesslauf nach dieser
Zweckkorrektur grün (`dist/workflow-rc160-content-persistence-product-headless-final.log`).
Danach Vorstartgrenze in Rust, privater IPC, Dienst, Intake und Executor/Worker
ergänzt: gültige, noch nicht angeschlossene Optionen stoppen mit fester Ursache
vor Aufnahme/ACK; `null`, Alias und Typfehler bleiben ungültig. Vier unabhängig
reproduzierte direkte Altweg-Umgehungen geschlossen. Neun Bereitschaftsgruppen,
zwölf echte Worker-Ablehnungen, 71 Startupfälle, 14-Dateien-Nachtest und 115
Rusttests sowie Clippy bestehen. 36 unabhängige Gegenproben bestätigen keine
Nebenwirkungen. Der 223-Dateien-Gesamtnachweis dieses Vorstartschnitts besteht
(`dist/workflow-rc160-content-start-product-headless.log`, Exit 0).
Direkter Konverter inzwischen mit geschlossenem Vollvertrag und Response/
Extraction `/2`, Echo-, Getter- und Legacy-Publikationsgrenze; elf Vertrags-,
36 PDF-/Text- und 13 reine Coregruppen bestehen. Private PDF-Metadaten werden
im Inhaltsprofil nicht in Nutztext kopiert; der Raw-Anschluss folgt unten.
Bild-OCR aus stoppt vor Decode, PDF beide aus ohne Raster-OCR, beide an mit
begrenzter passiver OCR einschließlich Vektorgrafiken. 62 tatsächliche Windows-
Konvertergruppen nach Kompatibilitätskorrektur bestehen ohne Skip
(`dist/workflow-rc160-content-converter-options-compat.log`). Die 224-Dateien-
Gesamtregression stoppte an einer zufälligen HMAC-Wortsubstringprüfung; der
geschlossene Shape-/Digesttest ersetzt das falsche Orakel, nicht die getrennte
Authentizitäts-/Tamperingprüfung. Dieser Lauf bleibt fehlgeschlagen.
Neuer Raw-Verbraucher umgesetzt: exact Extraction-Echo/Quelltyp vor Capture,
OCR-Korrektur mit unverändertem Vertrag und privater Metadatenablage,
Artefakt `/2`, persistente Basis `/2`, geprüfte Exportoperation `/7` und
gewöhnlicher Raw-Export `/5`. Metadaten bleiben aus Manifest/Liste/Export heraus;
Originalnamen und geprüfte Textbytes bleiben erhalten. Alle Capture-/Publikations-
Dependencies setzen gespeicherte Optionen durch; Delivery/Recovery/Projektion
prüfen dieselbe Bindung. Zwölf Consumer-, 17 Legacy-Markdown-Batch-/Export-,
sieben Retentions-, 30 Revieworchestrator- und 20 Itemgruppen grün. Unabhängige
Schema-/Options-Getter- und generische Replay-Downgradegegenfälle zuerst rot,
danach korrigiert. Ein eigenständiger unveränderlicher Exportowner schützt auch
die fehlende gesamte Dokumentlaufzuordnung; ordinary neue anonyme Pläne bleiben
vorläufig ausdrücklich vor Planänderung gesperrt. 63 tatsächliche Windows-
Konvertergruppen ohne Skip bestanden mit neuer Zehn-Quelltyp-Gruppe über
private Basis, frisches Lesen, synthetische Freigabe und Originalnamenexport
(`dist/workflow-rc160-content-consumer-native-final.log`); letzte Ownerhärtung
separat gezielt geprüft. Neue Gesamtregression eigenständig; Optionen nicht
im Nutzerstart aktiviert.
Weiterer Inhaltseingang: kompletter Optionsvertrag am Privacy-Extraktionsadapter,
neutraler Source-Nachweis `/2` und direkte TXT/MD/CSV-Routen implementiert.
Echte CSV-Header/Leerrecords und sichtbare neue DOCX-Storys bleiben erhalten;
acht neue Adapter-, sechs Source- und 13 Raw-Consumergruppen grün. Reiner
Kontakt-Coveragestopp korrigiert. Unabhängig reproduzierte Office-Header-/
Proxy-Prototyp-Gegenfälle regressionsgebunden geschlossen; feste Corefehler
bleiben ohne native Imports. Vorangegangener 225-Dateien-Headlesslauf grün,
neuer Gesamtnachweis nach diesen Änderungen eigenständig erforderlich.
Frische Zielprüfung: 71 gemeinsame Inhaltsgruppen, 64 tatsächliche Windows-
Konvertergruppen ohne Skip einschließlich des echten Office-Header-Falls,
115 Rusttests und warning-free Clippy grün; drei Rust-Helper-Einstiege ignoriert.
50 unabhängige Fremdausnahme- und acht Proxy-Prototyp-Proben bestätigen die
begrenzten Korrekturen. Der 226-Dateien-Gesamteingang ist vollständig bestanden
(`dist/workflow-rc160-privacy-input-product-headless.log`, Exit 0, ohne native GUI).
Nachfolgender Personenfeld-Schnitt .6: reiner versionierter Matcher nur für
vollständige neue Inhaltsverträge, unveränderte Legacy-Grammatik, gemeinsame
Office-/Redaktions-/Residual-/Dokumentsemantik und policygebundener Tabellen-Cache.
13 Adapter-/14 reine Coregruppen grün; seltene Einzelwerte unter „First Name“/
„Vollständiger Name“, NFD-/Zero-Width-Köpfe und inkonsistente Headerbreiten zuerst
rot reproduziert, dann korrigiert. Sachliche Spalten bleiben negativ; unklare
Struktur stoppt vor Aliasbildung. Die private Freigabe leitet die Policy aus
unabhängig gebundenen Snapshotoptionen ab, nicht aus einem selbstgewählten Marker.
Neue positionsgetreue Locator-Mappingfälle bleiben ein ausdrücklicher Rest;
unkanonische Eingänge werden nicht als leere Fundstellen bestätigt. Native-
und Dokumentregression dieses Schnitts sind getrennt geführt; ein neuer
vollständiger Testeingang bleibt erforderlich.
Frisch: 77 gemeinsame Inhaltsgruppen, 64 tatsächliche Windows-Konvertergruppen
ohne Skip und 41 private Dokumentprüf-/Exportgruppen grün; Rust 115 bestanden
(drei Helper ignoriert), warning-free Clippy, Docs und strenge lokale
Plugin-/Marketplaceprüfung grün. Logs `dist/workflow-rc160-person-fields-*`.
Unabhängige Nachreviews bestätigen vier ZIP/XML-, 60 Struktur-/Registry-, acht
Locator-, sechs private FS- und 20 Reservierungs-/Anonymisierungsfälle. Die
privaten FS-Proben mit synthetischen `/3`-Paketstubs sind kein Beleg für den
noch offenen `/4`-Gesamtworkflow. Vollständiger Personenfeld-Testeingang inzwischen
grün: 226 Headlessdateien, Exit 0, ohne native GUI.
Publikationskern .6 implementiert: eigener privater Pool und geschlossenes `/4`,
prozesslokaler exakter Residualnachweis, unabhängiger Options-/Manifesthashkontext,
Staging-Vor-/Nachprüfung und kein öffentlicher Handoff. Neue Dokumentbasis und
Publikationsreceipt prüfen den privaten Beleg auch nach bereits gespeicherter
Veröffentlichung. Publikation bis finaler Freigabe und exaktem Dokumentexport
ist verbunden; 16 neue Gruppen plus 27 Public-, 41 Dokument-, 13 Raw-, 10
Persistenz-, 14 Core- und 10 Bereitschaftsgruppen grün. Zwei unabhängige
Typ-/Proxy-Gegenfälle rot regressionsgebunden geschlossen. Echte Node-Prozess-
abbrüche sind kein Tauri-/Mac-Beleg; neuer Gesamteingang bleibt erforderlich.
Unabhängige Nachprüfung: 22 Negativfälle ohne ausführbaren Fremdzugriff; Rust
115/3 Helper ignoriert, Clippy, Docs und strenge installierte Pluginprüfung grün.
Der neue Anonymisierungs-Orchestrator, eine eigene private Mapping-Intent-
Wiederholung und der gewöhnliche gebundene Ergebnisexport `/6` sind nun im
lokalen Quellstand verbunden. Synthetische Integration prüft Publikation,
fehlenden Ergebnisordner, kalten Wiederanlauf, konfliktfreie Einmalkopie,
Zuordnungskonflikt und Retention nach abgeschlossenem Export. Offen bleiben
vollständiger `content_options`-Transport am Start über Rust und private IPC,
Gesamttests über die angebotenen Formate und native Paket-/Bedienabnahme. Der Requestbody-
Decoder mit Bereitschaftssperre ist bereits implementiert.
Batch-/Publikationsreader angeschlossen: unabhängige Runmitgliedschaft,
private `/4`-Reconciliation, Lost-ACK vor dem Reviewcallback, lokale Delivery
ohne Plugin-Capability/ACK und aktuelle Terminalprojektion. Fehlende Ergebnisse
mit Commitbeleg oder ausgetauschter Elternkette werden nicht neu verarbeitet.
Kapazitätsprüfung am eigenen Stage; 30 Publikations-/Recoverygruppen bestehen
(`dist/workflow-rc160-private-recovery-artifact-final.log`). Drei rote zusätzliche
Consumergegenfälle korrigiert; strikte Paket-Dateilisten-Erwartung aktualisiert.
Der neue Mappingweg bleibt vor alten `/2`-Intents gesperrt, bis sein eigener
gebundener Replay angeschlossen ist. Die vollständige Reader-/Recoveryregression
bestand mit 227 Headlessdateien, Exit 0 (`private-recovery-product-headless.log`);
kein vollständiger neuer Anonymisierungslauf oder Zielhostpaket daraus abgeleitet.
Raw-Recovery berücksichtigt ebenfalls Runmitgliedschaft und Commitbelege.
Raw-Fehler/-Preflight erzeugen keine Anonymisierungs-Mappingzeilen; zwei rote
Gegenfälle korrigiert und der tatsächliche Legacy-Raw-Lifecycle angepasst.
115 frische Windows-Rusttests, drei Helper ignoriert, Clippy warning-free.
Nachfolgender Operationsanschluss: `/7` bleibt in der Plaintextmigration
unverändert; falsche Altverschlüsselungsmeldung rot über den produktiven
Saved-run-Einstieg reproduziert und korrigiert. Tatsächlicher Journal-/Run-/
Snapshot-/Epochadapter ist an Item, Reviewcapture und Reviewpublikation
angeschlossen. Neun Operationsgruppen grün (`content-operation-authority.log`).
Neue Veröffentlichung bleibt bis zur echten `/4`-Verarbeitung ausdrücklich
`NOT_READY`. Eigene FD-gebundene Sperrepochen und epochgebundener Release in
beiden Orchestratoren; 14 Gruppen grün, zwei unabhängige rote Gegenfälle
korrigiert (`content-lock-review-red.log`). Der Operationsgesamteingang bestand
mit 228 Headlessdateien, Exit 0 (`content-operation-product-headless.log`).
Gemeinsamer Textkern und produktiver neuer Captureadapter sind danach verbunden:
harte Rückgabe statt erwarteter Callbackausnahme, keine Legacy-Queuekopie,
Kontaktkorrektur ohne alte Zeichenpositionen oder technische Inhaltsnotiz.
173 gezielte Gruppen bestehen; 20 Kombinationen aus zehn realen Windows-
Quelltypen und beiden Ausgabeprofilen erreichen den Entwurf ohne Basis/
Publikation (`shared-privacy-native.log`). Der nachfolgende Textkern-/Signal-
Gesamteingang bestand mit 229 Headlessdateien (`shared-privacy-product-headless.log`).
Exakte vorbereitete Manifest-/Auditdaten, unabhängiger Runowner und dauerhafter
Registry-Witness vor Basiscapture sind inzwischen als private Persistenzprimitiven
implementiert. 31 Operationsgruppen bestehen (`prepared-operation-final-reviewed.log`),
einschließlich frischer Prozesse, partialer/beidseitiger/Ordnerverluste,
gemeinsamer Keep-/Frameprüfung und Lost-ACK nach tatsächlichem `/4`-Rename.
Zwei unabhängige Reviews schlossen verspätete Hashprüfung, veränderlichen
Anfangssnapshot, Finally-Rollback und falsche Erstverarbeitung bei fehlenden
oder falsy Ownerdaten. Keine erneute OCR/Review bei vorhandener Basis.
Nächster Anschluss: diese Primitiven im tatsächlichen produktiven
Publikationsadapter verwenden, anschließend gebundenes Mapping/Replay und
gewöhnlichen Export; neue Optionen/App-Start bleiben bis dahin `NOT_READY`.
Neuer Gesamteingang und native Bedien-/Paketabnahme bleiben erforderlich.
Lieferstatus .6 bleibt in Arbeit.
Nachreview des Textkerns: 90 Differentialfälle stimmen mit Legacy überein.
Zwei Signalgrenzfälle im vorgeschalteten neuen Review wurden rot belegt
(`capture-signal-red.log`, `capture-signal-brand-red.log`) und durch geschlossene
Diensteprüfung sowie eigene prozesslokale Signalherkunft korrigiert.
15 Saved-run-/Operationsgruppen grün (`capture-signal-final.log`), Legacy-
Abbruchsemantik bleibt erhalten. Neuer Gesamt-/Paketbeleg bleibt erforderlich.
Bei selektiver PDF-OCR fehlt der laufweite Bereichsreview: lokale Rolle und
Maske vor OCR, Quell-/Render-/Options-/Policybindung, Bulk/Offenfilter,
Vertagen/Neustart/Lost-ACK; kein Scanbeweis allein aus Größe oder Operatoren.
Office-Bild-OCR bleibt ein echter Capabilityrest statt eines Checkboxfeatures.
Raw-Metadaten liegen bereits provenienzgebunden in dauerhafter privater Basis;
der Privacy-Extraktionsadapter liefert denselben Vertrag bereits, der
Anonymisierungs-Publikationsanschluss muss ihn noch durchsetzen. Der präzisierte
[Auftrag 6](../../tasks/rc160-workflow/06-markdown-ocr.md) enthält die revalidierte
Integrations-/Negativmatrix. Keine Cowork-Erweiterung, Checkbox- oder Paketfreigabe.
Architekturleitlinien im Auftrag: validierte Zweckvarianten statt Schema-/Boolean-
Fallback, zentrale Regeln mit Durchsetzung an jeder verantwortlichen Operation,
autoritative Zustandsprojektion und vollständige Fehlerklassen. Kein pauschaler
MVC-Neubau oder Rust-Rewrite. Exakte Paket- und native Bediennachweise bleiben
getrennt von Quellen-/DOM-/Adaptertests; Standalone-Nutzertexte nennen keine
Modellkopplung oder automatische Weitergabe.

**Aktuelle lokale Erweiterung 13.10.2026 – in Arbeit (.5/.6/.7/.8):**

Neuer unveröffentlichter Workflow-Schnitt: gemeinsame reine Ablaufprojektion,
zweck-/phasenabhängige Hauptaktion, gezählte ausdrückliche Gruppenübergabe und
feste nächste Schritte für Fehler. Unabhängige Gegenfälle erst rot, dann behoben:
Teilergebnisse erzeugen keinen zweiten Primärbutton; eigene native Reviewphase
steuert Parent-Warteanzeige; eine verfügbare Dokumentteilmenge beweist keinen
Gesamtlaufabschluss. Aktuelle DOM-/Integrationsnachweise: Workspace 61, Review
40, Dokumentrenderer 45, Projektion 22; keine native GUI-/Mac-Abnahme. Der
frühere r4-Paketbeleg gilt nicht für diesen neuen Quellstand.

Zweckgrenzen revalidiert: lesbares PDF-/OCR-Markdown ohne generierte Seiten-
Codeblöcke, Texte/Metadaten/Originalausschnitte und Nachkorrektur erhalten;
raw weder Inhalts- noch Dateinamenanonymisierung. Neue raw Kopien verwenden
servergebundene Originalbasisnamen mit Kollisionsauflösung; Schema `/6`,
zweckabhängige Rust-Namenpolicy, alte `/4`-/`/5`-Pläne unverändert.
Privater Vorschau- und konkreter Dateifehlervertrag, Tab-/Zeilensperren und
erneuerte Filtertests. Gemeinsamer Privacy-Kern gegen Literal-/Fence-/
Quoted-E-Mail-Gegenfälle abgesichert; `de-business/4`, unabhängiger CommonMark-
Renderer nur Testabhängigkeit. Tatsächliche v2-Darstellung beider Zwecke
headless geprüft (Fonts/Fokus/axe/Dialoge/Reflow), keine Nativebedienabnahme.
  Aktuelle Qualitätsbindung (`pass_with_warnings`, neun rohe OCR-Abweichungen)
  und lokale RC160-Windows-Paketbindung r4 sind geprüft: beide Zwecke, tatsächliche
  OCR-Korrektur/Originalpixel, Folgegruppen, Neustart und Dateifehler. Zusätzliche
  Entity-/Literal-/Einspalten-/IBAN-Gegenfälle sind mit Regressionen behoben.
  219 kanonische Headless-Dateien sind in zwei belegten Etappen abgedeckt; die
  monolithische Ausführung bleibt mit dem damaligen veralteten raw Namensorakel
  als fehlgeschlagen dokumentiert, keine Gate-Umschreibung. Die neuen Privacy-
  Module sind im Resume-Fingerprint gebunden; kodierte strukturierte Identifier
  und vollständige Firmen mit escapeter Interpunktion werden nicht ausgenommen.
  Lokale Windows-Testübergabe technisch bereit. Anwender möchte zuerst
Windows schrittweise testen; Mac-Engineering-Workflows und Veröffentlichung
vorerst zurückgestellt. Desktop war bei diesem r4-Schnitt entzogen und ist
für den späteren Gesamtauftrag erneut autorisiert. Frühere RC159-Freigaben
und Artefakte werden nicht überschrieben; keine erledigte Gesamtstory daraus.

**Prerelease-Bereitstellung, 11.10.2026 – erledigt:** Quellcommit
`7af2a9d0268864a01b954e0175cae9f5a3616fe8` ist auf `main` und als
[RC159](../RELEASE.md#rc159--standalone-auf-allen-zielplattformen) für Windows x64,
beide Mac-Architekturen und Linux x64 glibc veröffentlicht. `workspace.html`
ist regulärer gemeinsamer Einstieg. Native Paket-/Startgates, CI, Clippy und
vollständige Security am selben Schnitt bestanden; alle zwölf Uploads exakt
hash-/größengeprüft. Beigelegte aktuelle Startanleitungen sind regressions- und
bytegebunden. Cowork bleibt RC151. Die Workflowkosten-Ausnahme gilt für diesen
beauftragten Lauf; lokale Desktopbedienung blieb nicht autorisiert und erfolgte
nicht. Prerelease erledigt keine menschliche Bedien-/Qualitätsabnahme.

**Aktuelle Storyreste nach Bereitstellung:** Standardumschaltung, native
automatische Paketbindung und Veröffentlichung sind nicht mehr offen. Die
vollständige bediente Windows-/Mac-/Linux-Kette, Accessibility, echte Picker- und
Dateimanagerbedienung bleiben gesondert nachzuweisen. Weitere Implementierungs-/
Spezialreste sind insbesondere Einzeldatei-Retry/Auslassen und die unten genau
benannten Ereignis-/Dateisystem-/Crashgrenzen; daraus kein komplett fertiges
v2-Produkt ableiten. Neun rohe OCR-E-Mail-Lesefehler bleiben BL-050.6.

Die folgenden datierten Gegenproben und detaillierten Scheibenstände sind
Entstehungsevidenz; damalige Paket-/Commit-/Veröffentlichungssperren beschreiben
nicht den aktuellen RC159-Status.

Letzter unabhängiger Release-Abgleich: Die drei beigelegten Startanleitungen
enthielten noch Legacy-Bedienung und widersprachen der neuen Freigabe-/Export-
Trennung. Anleitungen und gemeinsame Drei-Plattform-Dokumentregression sind
korrigiert. Neue exakte Paketbindung bleibt vor Bereitstellung erforderlich;
keine Veröffentlichung der älteren geprüften Archive mit falscher Anleitung.

Erste Runnergegenprobe auf `2c7e246`: Windows/Mac-Testwurzeln unter OS-Alias,
Linux-spezifisch korrekt gelesener OCR-Gegenfall und Source-CI ohne native
Konverterressourcen verhinderten den Paketabschluss. Testpfade und die
explizite `NOT_RUN`-Trennung werden korrigiert, Produktschutz nicht gelockert.
Frische CodeQL-Gegenprobe fand zusätzlich echten ReDoS im Engineering-
hOCR-Helfer sowie einen checked-path-Reopen im Konzept-Vorschauleser;
begrenzter Tagscanner und gehaltenes Dateiobjekt beheben diese Grenzen.
Einzeln revalidierte Datenliteral-/Pin-/Fixture-Fundstellen bleiben streng
quell-/fingerprintgebunden. Native Wiederholung/Releasebindung noch offen.

Zweite Runnergegenprobe auf `b4f298d`: JavaScript-/Native-CodeQL und Gitleaks
bestanden. Source-CI entdeckte eine unbegründete Testforderung nach gleichzeitig
erfolgreichen Konfigurations-Erstschreibvorgängen trotz streng gebundener Leser.
Der Vertrag wird getrennt: vier echte konkurrierende unveränderliche
Reservierungen bleiben erhalten; ein deterministischer atomarer Settingswechsel
wird ohne Überschreiben abgewiesen und erst bei ausdrücklicher frischer Anfrage
im stabilen Zustand übernommen. Kein automatisches Retry/Lockern des
Produktschutzes. Mac-Sidecar-Gegenprobe nutzt die isolierte HOME des Kindes auch
bei der erwarteten Profilberechnung im Elternprozess, nicht das Runnerprofil.
Windows-Smoke-Negativtest hält seine beiden synthetischen Cleanup-Verzeichnisse
auf demselben TEMP-Volume (Runner-Checkout auf D:, TEMP auf C:); keine
Cross-Volume-Rename-Annahme und keine breitere Löschberechtigung.
Linux bestand die Standalone-/realen Konvertergates, stoppte aber an `unused_mut`
im Rust-Diagnoseleser. Veränderlicher Pfad ist jetzt ausschließlich im
macOS-Konfigurationsblock gebunden; Alias-/Handle-Schutz bleibt unverändert.
Native Paket-/Veröffentlichungsbindung weiterhin in Arbeit.
Frische lokale Schlussgegenprobe: 219 Headless-Dateien, 108 Windows-Rusttests,
Clippy, aktuelle Dokumentation und strenge Claude-Strukturprüfung bestanden.
Lokale native GUI weiterhin `NOT_RUN`. Unabhängiger Read-only-Review bestätigt
die drei Fixturekorrekturen ohne Produktschutz-Ausnahme. SARIF auf dem zweiten
Schnitt bindet 84 einzeln geprüfte Befunde ohne unbewerteten Rest; erneute
Paketläufe auf dem korrigierten Commit bleiben erforderlich.

Dritte Runnergegenprobe auf `e88048e`: frische Security grün; Source-CI importierte
einen nativen Bildgenerator vorzeitig, Mac verweigerte fehlende ACL als Fehler,
Linuxs Wiederherstellung scheiterte am Lock-Neuerwerb nach Drop. Korrekturen:
lazy echter Canvas-Import (keine Fakebilder), positiver gehalten-FD-filesec-
Snapshot statt pauschaler errno-Ausnahme, nicht klonbarer Unix-Unlock-Guard
statt Close-only. Neue native ACL- und Duplikat-/Neuerwerb-Regressionen behalten
Abweisung tatsächlicher ACL-Einträge, Nonblocking-Exklusivität und Windows-
Share-Schutz. Mac-Fixture setzt Tag vor Qualifier. Zwei begrenzte unabhängige
Reviews, 22 Smoke-Integritätsfälle, 47 reale Windows-Konvertergruppen und echter
Node/Rust-Export bestehen. Neue native Runner-/Paketbindung bleibt erforderlich;
keine Veröffentlichung oder menschliche UAT aus diesen Korrekturen ableiten.
Weitere genaue Runnerabgrenzung: Intel-Mac startet den 180-Sekunden-IPC-Timer
erst nach vollständiger Rust-Kompilierung/Suite, ohne das Ausführungsbudget zu
lockern. Windows-v2-Start/IPC ist tatsächlich bestanden; sein späterer Cleanup
verlangt jetzt vor Inventarisierung begrenzte Ruhe der exakt isolierten WebView-
Profilprozesse mit Instanzprüfung. Strenge Löschfehler werden nicht übersprungen,
unrelated WebViews nicht beendet. 23 Integritätsfälle und 45 reine PowerShell-
Readiness-/Profilparsergruppen bestehen; dies ist keine lokale GUI-Bedienung.

Vierte Runnergegenprobe `d02f31a`: Security bestanden (`38166846003`),
Linux-Retention entdeckte eine echte Rebinding-Lücke nach Schließen des
Probe-FDs. Jetzt bleibt der ursprüngliche vollständige Dateisnapshot die
Löschautorität, auch vor Planannahme und unmittelbar vor Unlink; Parent-/Link-/
Typgrenzen unverändert. Unabhängiges Read-only-Review bestätigt den Befund;
26 Retention- und neun Löschtests unter Windows und WSL-Ubuntu bestanden.
Zwei deterministische Inhaltswechseltests hängen nicht von Inode-Recycling ab.
Portable letzte Pathname-TOCTOU-Grenze bleibt ausdrücklich bestehen. Mac-
Kompilation benötigt außerdem eine ausdrückliche `*mut c_void`-Typangabe am
ACL-Zeiger. Erneute native Paketbindung vor Veröffentlichung erforderlich.

**RC159-Korrektur, 08.10.2026 – Übergang nach der Fundstellenprüfung:**
Anwenderbefund am lokalen r10: Nach OCR-/Anonymisierungsentscheidung erschien
der Verlauf mit zusätzlicher Status-Momentaufnahme, ohne verständlichen Übergang
zur noch offenen Dokumentfreigabe. Korrektur: direkt dieselbe private
Ergebnisprüfung öffnen, aber nur nach bestätigtem Abschluss der nativ gebundenen
Prüfsitzung. Native Öffnungsgeneration schützt gegen verspätete/duplizierte
Schließmeldungen; Vertagen, fehlgeschlagenes Schließen und Reconnect bleiben
getrennt. Der Verlaufs-Hauptbutton öffnet die tatsächliche Dokumentansicht direkt;
Metadaten bleiben sekundär. Keine automatische Freigabe, Auswahl oder Export.
Lokale Windows-RC159-Testversion gebaut unter
`dist/engineering-workspace-v2-windows-rc159-20261008/`; 50 Workspacefälle,
108 Rustfälle, Clippy, Offline-/Locked-Kompilierung, Archivverifier und echter
isolierter Paket-Sidecar-Smoke bestehen. Unabhängige Gegenprüfung fand eine
verspätete Statusantwort beim manuellen Verlassen; behoben und regressionsgeprüft.
Neue 72-Varianten-Messung bindet RC159 mit unveränderten neun OCR-Warnungen;
kein bekannter finaler Referenzrest/Sachwortverlust nach synthetischen Entscheidungen.
Sichtbare/native Windows-Abnahme bleibt beim Anwender, Mac-Abnahme offen.
Abschließend alle 218 Headless-Testdateien grün; ausführungs-/testbestimmender
Scope unverändert, ausschließlich Standalone-README währenddessen ergänzt.
Voll-/native UI-Proben ohne Freigabe `NOT_RUN`; Gesamt-/Cowork-Releasebau bleibt
an sauberer Commitbindung gesperrt. Lokale Testbereitschaft, keine Gesamtfreigabe.
Kein Commit, Push, Actions-Start oder Prerelease beauftragt.

**Priorisierung vom 08.10.2026, nach Anwenderentscheidung:** Zuerst stabiler
Workflow, Wiederherstellung und native Windows-/Mac-Paket-/Bediennachweise.
BL-050.6 bleibt für neun bekannte rohe OCR-E-Mail-Lesefehler und unabhängige
Referenzabnahme **in Arbeit**, ist aber nicht allein ein pauschaler Releaseblocker.
Implementiert: getrennte Qualitätsdimensionen, sichtbare eng begrenzte OCR-
Kontaktwarnungen im geprüften Engineering-Profil und optional weiterhin strenges
Extraktionsgate. Keine Restdaten-/Sachwortverlust-/Unbewertbarkeitsausnahme,
keine geänderte Laufzeitfreigabe. Methodik: `docs/DETECTOR_BENCHMARK.md`.
Historische rote All-findings-Gates unten werden nicht rückwirkend grün;
aktuelle Test-/Messnachweise stehen in Iststand und Evidence-Matrix.
Frische 72-Varianten-Messung `dist/quality-headless-boundary-20261008` besteht
im geprüften Engineering-Profil mit neun sichtbaren Roh-OCR-E-Mail-Warnungen;
strenges Extraktionsprofil bleibt mit `QUALITY_EXTRACTION_WARNINGS_OPEN` rot.
Enddateien nach gebundenen synthetischen Entscheidungen ohne bekannte Reste
beider Lesarten oder gemessenen Sachverlust. 39 Bewerter-/Berichtfälle und
`test:quality` bestehen. Kein nativer Mac-/Release- oder menschlicher Nachweis.

**Testabgrenzungsbefund .8, 08.10.2026 – behoben und headless gegengeprüft:**
Der vorherige Gesamtlauf wurde
wegen entzogener Desktopfreigabe abgebrochen, nicht als bestanden verbucht.
Damals: `tests/test-residual-person-review.js:640` startete ein echtes automatisch
bedientes Windows-Formular (`ShowDialog()`); weitere tatsächliche Formularproben
standen in `tests/test-companion-processor.js:504`. `windowsHide: true` versteckt
den Prozessstart, garantiert aber keine unsichtbaren Formulare. Auswirkung:
`test:product` ist auf Windows nicht rein headless und darf bei laufender
Anwenderarbeit nicht ungeprüft gestartet werden. Soll: ausdrücklich gestartete
native Formularprüfung und headless Regressionseingang klar trennen, mit
getrennten vollständigen Nachweisen; kein stiller Skip mit Gesamt-PASS.
Read-only-Gegenreview fand zusätzlich die Abschlussansicht, insgesamt sechs
tatsächliche GUI-Proben. Diese sechs Fälle samt bisherigen Assertions liegen
jetzt ausschließlich in `tests/test-native-windows-forms.js`, mit 20 Sekunden
Frist pro synchron besitzgebundenem Kindprozess. Alle Nicht-GUI-Prüfungen der
drei alten Mischdateien bleiben im normalen Eingang. Neuer vollständiger
Nicht-GUI-Eingang `test:product:headless`; CI/Standalone ohne Formularstart.
Windows-Vollprofil und Native-UI-Eingänge verlangen vor Fixtures/Kindprozessen
explizit `--allow-native-ui`, sonst Exit 77. Headless-PASS gilt nur für seinen
Umfang, native Fälle bleiben ausdrücklich `NOT_RUN`; macOS/Linux melden diese
Windows-Fälle `NOT_APPLICABLE`, keine fingierte Hostfreigabe. 11 neue Guard-/
Plan-/CLI-Gegenfälle und 12 Testpfadverträge grün; frischer vollständiger
Headless-Gesamtlauf besteht mit 218 Testdateien (97 Basis plus 121 direkte).
996-Dateien-Quellscope vor/nach dem Lauf identisch, Protokoll und Digest im
Iststand. Reale Node-/Rust-10.001-Kontakt-Exporte sowie Windows-Prozessgrenzen
enthalten, keine Oberfläche bedient. Voll-/Native-UI-Aliase tatsächlich ohne
Freigabe mit Exit 77 verweigert. Frühere Abbrüche bleiben historisch; sechs
Formularfälle und native Tauri-/Mac-/Paketabnahmen bleiben offen, kein
Gesamt-/Release-PASS. Die Testabgrenzung ist erledigt, nicht die gesamte .8-
Bedienabnahme oder BL-010.53. Docs-/strenge Plugin-/Diffprüfung grün;
Build/ZIP weiterhin aus den bekannten Herkunfts-/Archivgründen gesperrt.
Gezielte Qualitätsfälle bleiben separat gültig. Die neue `package.json`-Bindung
sperrt den bisherigen Bericht korrekt als `QUALITY_REPORT_STALE`; vollständige
Messung deshalb unter `dist/quality-headless-boundary-20261008` erneuert:
72/72 Varianten beider Zwecke, bestätigte Bereinigung, beide finalen Lesarten
ohne bekannte Referenzreste/Sachverlust nach gebundenen synthetischen
Entscheidungen. Standardgate `pass_with_warnings`, strenges Extraktionsgate
weiterhin rot; neun rohe E-Mail-Lesefehler nicht als behoben ausgegeben.

**Lokaler Testbau nach Korrekturen, 08.10.2026 (r10):**
`dist/engineering-workspace-v2-windows-20261008-r10/` ersetzt r9 für neue
Anwendertests. Frische Windows-Kompilierung, ZIP-Verifier und echter isolierter
Paket-Sidecar-Smoke grün; 190 projizierte Serverdateien/EXE bytegebunden,
996-Dateien-Quellscope unverändert zum 218-Dateien-Headless-PASS. Die vier
Renderer-/Guardgruppen nochmals separat grün (42/42/39/11). Testhinweise und
Prüfnachweis liegen neben dem Archiv; Hash im Iststand. App nicht gestartet,
Desktop weiterhin unangetastet. Sichtbare Windows-/Mac-/Accessibility- und
vollständige Release-Paketabnahme, Einzeldatei-Retry/Auslassen sowie zusätzliche
Abbruch-/Dateisystemfälle bleiben offen; keine Gesamtumstellung als fertig
markiert. Keine Veröffentlichung oder neue Push-Autorisierung.

**Status: in Arbeit.** Fachlicher Abgleich mit drei unabhängigen technischen
Gegenprüfungen abgeschlossen; `docs/frontend-migration.md` dokumentiert
Gestaltung, Konfliktentscheidungen, Alt/Neu-Matrix und Abnahme. Keine neue
Release-/Push-Autorisierung. Bestehende unveröffentlichte Korrekturen erhalten.

**Gesamtreview r9, 08.10.2026 – neue bestätigte Restfehler:**
[R9-20261008](../REVIEW_STANDALONE_R9_2026-10-08.md) bindet Arbeitsstand,
Paket und Gegenproben. R9-01 (.5/.7/.8): Reload muss sichtbaren Detailstand und
Freigaberevision gemeinsam invalidieren/erneuern. R9-02 (.3/.4/.7/.8): akzeptierte
Pause muss auch vor dem nächsten Review-Publikationsclaim greifen; Entscheidungen
und nicht gestartete Dokumente erhalten. R9-03 (.5/.6/.7/.8): erfolgreiche
Freigabe von 10.001 Kontakten scheitert an der versteckten Übersichtskapazität;
Grenzen durchgängig angleichen und betroffene Datei/Grund nennen. Alle drei
Gegenbeispiele wurden vom Hauptreview wiederholt; heutiger Korrekturstand unten.
R9-04/05 (.6/.7/.8): synchrones natives v2-I/O ohne wirksame Antwortfrist und
von einem Folge-RPC abhängiges Sidecar-Retirement sind statisch belegt;
gezielte native Fehlerinduktion und konservative asynchrone Bereinigung waren
Auftrag des nachfolgenden Korrekturdurchgangs (Ergebnis unten).
R9-06 (.7/.8): Verlauf darf spätere Verarbeitungsfehler nicht als Aufnahmeablehnung
bezeichnen. OCR-Optionsstandard zwischen neuer Oberfläche und Sicherheitsvertrag
konsistent dokumentieren. Kein neuer belegter P1 im begrenzten Reviewumfang,
keine allgemeine Freigabe. Frische 72-Varianten-Messung weiterhin neun rohe
OCR-Abweichungen; finales synthetisch geprüftes Ergebnis ohne bekannte Lecks/
Sachwortverlust. Das damalige All-findings-Gate `QUALITY_FINDINGS_OPEN` gehört
zu BL-050.6 / BL-010.51; aktuelle Risikopriorisierung siehe Abschnittsanfang.
Vollständig neu gestarteter eingefrorener r9-Gesamteingang: 217 Testdateien
(96 Basis plus 121 direkte) grün, einschließlich letztem Undo-Delta;
Quellscopedigest vor/nach dem damaligen Lauf unverändert. Diese damals grünen
Tests enthielten die drei neuen Gegenbeispiele noch nicht; neue Regressionen
und aktueller Umsetzungsstand folgen im Korrekturabschnitt.
Im ersten Reviewdurchgang blieb Produktcode unverändert; keine Commit-/Push-/Release-/Actions-Ausführung.

**Anschließende Korrekturen / erneute technische Gegenprüfung, 08.10.2026:**
R9-01/02/03 sind implementiert und durch neue Regressionen einschließlich
echtem Gateway-Neustart und 10.001-Kontakt-Engine-/Node-/Rustexport abgesichert.
R9-04/05: registrierter Native-Worker mit begrenztem Antwortwarten,
unmittelbare asynchrone Sidecar-Bereinigung, konservativer Guard-/Kindbesitz
und vorab reservierte Spawn-Genehmigung umgesetzt. Echte Windows-Rename-
Barrieren vor/nach Veröffentlichung prüfen Timeout, Shutdown, Wiederlesen
derselben Kopie; wiederholte Reads während Abschlussbereinigung verbrauchen
kein Recoverybudget. Keine echte OS-Blockade oder native Mac-Laufzeitbeobachtung.
R9-06 und OCR-Optionsdrift korrigiert (neutraler Fehlerbegriff; reines
Markdown-OCR ausdrücklich nicht vorausgewählt). Ausstellerentscheidungen
überleben legitime Ausgabeverschiebung, bleiben aber genau quellgebunden.
108 Windows-Rusttests/Clippy, 42 Dokumentrenderer- und 42 Workspacefälle grün;
Abschließend neu gestartete Produktsuite: 217 Testdateien (96 Basis plus 121
direkte) grün, korrigierter Quellscopedigest vor/nach dem Lauf unverändert.
Windows-Releasebuild ebenfalls kompiliert; begrenzter unabhängiger Nachreview
ohne weiteren konkreten Fehler in den geänderten Pfaden. Details und Grenzen
im Korrekturanhang des R9-Berichts. Gesamtproduktfreigabe und Paket-/Bedienabnahme
bleiben davon getrennt; normaler Paketbau weiterhin Herkunftssperre. Keine Veröffentlichung;
Scheiben nicht pauschal erledigt setzen. Neun Roh-OCR-Befunde unverändert offen.

**Aktuelle Scheibenabnahme nach RC159-Veröffentlichung, 11.10.2026:**

| Scheibe | Aktueller Stand / verbleibender Nachweis | Status |
|---|---|---|
| .1 | Neue Hauptoberfläche ist Standard aller vier veröffentlichten Pakete; automatischer nativer Start/IPC grün. Vollständige bediente Gestaltung-/Tastatur-/A11y-Abnahme offen. | teilweise abgenommen |
| .2 | Reale servergeprüfte Katalog-/Auswahlverträge und 201-Dateien-Gegenproben vorhanden; native Picker-/Drop-/Fokusabnahme offen. | teilweise abgenommen |
| .3 | Pause/Fortsetzung einschließlich aktiver Dateibereitstellung implementiert und echt gegengeprüft; vollständige bediente Zustands-/Ereignisabnahme offen. | teilweise abgenommen |
| .4 | Integrierte Sammelprüfung, Originalvergleich, Folgegruppen und Vertagen/Neustart über die paketierten Windows-/Mac-Sidecars bestätigt. Vollständige Tauri-/WebView-Klickabnahme offen; native Starts allein treffen keine Entscheidungen. | teilweise abgenommen |
| .5 | Revisionsgebundene Dokumentfreigabe, reversible Pläne und aktuelle private Zuordnung implementiert; vollständige native Dokument-/Referenz-Bedienabnahme und unten benannte Spezialreste offen. | teilweise abgenommen |
| .6 | Normaler getrennter KI-Export implementiert, reale Node-/Rust- und Plattformgates grün. Vollständige native Datei-/Race-/Crash-/Dateimanager-Zielhostabnahme offen, keine allgemeine Dateisystemgarantie. | teilweise abgenommen |
| .7 | Laufgebundener Verlauf, konkrete Fehlerdateien und sichere Wiederverbindung implementiert. Einzeldatei-Retry/Auslassen sowie vollständige native Verlauf-/Recovery-Bedienabnahme offen. | teilweise umgesetzt |
| .8 | Automatische Vierplattform-Paket-/Start-, CI-, Security- und Dokumentgates bestanden, Prerelease veröffentlicht. Vollständige menschliche Accessibility-/Workflow-/Zielhostabnahme offen. | teilweise abgenommen |

**Historischer detaillierter Implementierungsschnitt vom 08.10.2026:**
Seine damaligen Paket-/Standardumschalt-/Release-Reste sind durch die oben
gebundene Bereitstellung ersetzt, nicht seine weiter offenen Spezialabnahmen.

| Scheibe | Damaliges Ergebnis / Abnahme | Damaliger Status |
|---|---|---|
| .1 | Prototypgetreue Hauptoberfläche, lokale Tokens/Inter, Navigation, Radio-Karten, Dateibaum, lange Namen und reale geschlossene Bridge implementiert. Browserinteraktion/Reflow separat geprüft; Standardumschaltung und native Design-/Tastaturabnahme offen. | teilweise umgesetzt |
| .2 | Reguläre ungeeignete Dateien mit Gründen, stabile IDs, Katalogrevision, servergeprüfte Startauswahl und erhaltene Ausschlüsse implementiert; realer Sidecar startet nur die angehakten IDs. Separater Metadatenkatalog bis 1.000 Dateien/512 KiB vollständiger Aufnahmeantwort inklusive Artefaktdetails/Antwortumschlag; 200-Dateien-/500-MiB-Prüfung erst auf der angehakten Teilmenge. Zu große Erweiterungen erhalten frühere Auswahl/IDs/Revision atomar. Delegierte Starts verbrauchen IDs/Ablehnungen auch bei verlorener Bestätigung; spätere Aufnahmen bleiben davon getrennt. Renderer-, Service- und echte Sidecar-Gegenproben mit 201 Dateien bestehen. Legacy/Cowork bleiben strikt; native Pickerabnahme offen. | teilweise umgesetzt |
| .3 | Persistierte generationsgebundene Pause nach aktiver Datei einschließlich Bereitstellung/Zuordnung implementiert. Gemeinsame Kontrollsperre serialisiert Pause und dauerhaften Dateiclaim; Kontrollfehler stoppen keine Dateien. Echte TXT-Gateway-Gegenprobe beider Modi einschließlich neuem Prozess/Fortsetzung besteht. Sequenzierte Fortschrittsereignisse und native v2-Paketabnahme bleiben offen. | teilweise umgesetzt |
| .4 | Integrierte Prüfung, zentrale Sammelaktionen, Originalpixel/Text/Markdown und reine Markdown-OCR implementiert. Gruppenfortschritt, gesperrte Übergabe bei Restzeilen und stabile Fokusrückkehr im Browser geprüft. Kompakter Kopf/Dokumentstatus nach Browsergegenprobe verbessert; vollständige Namen bleiben zugänglich. Geschlossene Parent-Bridge und native Eigentümerprüfung; neue native Frame-/Folgegruppen-/Neustartabnahme offen. | teilweise umgesetzt |
| .5 | Private dauerhafte Original-/Markdown-Prüfstände und reversible Pläne aus tatsächlichen Core-Ersetzungen implementiert; keine Entitäten aus importierten Markern erfinden. Revisions-/hashgebundene Sammelfreigabe, Widerruf, Person/Firma/Beibehalten/Basisstand, zusätzliche Maskierung und begrenzte reine Markdown-Nachkorrektur vorhanden. Laufweite exakte Identitätsregeln mit tatsächlich eindeutig gebundenen Aliasen werden gemeinsam atomar committed; mehrdeutige Nachnamen bleiben getrennt. Zusätzlicher Commitnachweis verhindert Wiederaufleben alter Freigaben nach Verlust eines Journalspiegels. Fehlgeschlagener Abgleich sperrt weitere Mutationen, Roh-Markdown-Entwürfe bleiben erhalten. Neu: aktuelle vertrauliche Zuordnung tatsächlicher Entitätenrevisionen und getrennte unveränderliche Referenz pro Exportauswahl; ohne automatische Löschung oder KI-Mitkopie. Mehrdeutigkeit, Alias-/Firmenfelder, Quellmarker und Unicode gegengeprüft. Deterministischer Text aus gebundenem Objekt verhindert Zwei-Dateien-Manipulation; fehlende Referenzdaten zerstören keinen fertigen Export/ACK. Publication-Index nennt fehlende Körper auch nach Ablauf des Prozessjournals; alte unbewiesene Quellen bleiben unbekannt. Gezielte und unabhängige Gegenproben bestehen. Sichere Kopie der neuen Referenz in den menschlichen Ergebnisbereich und native Gesamtworkflowabnahme offen. | teilweise umgesetzt |
| .6 | Expliziter flacher KI-Export ausgewählter aktueller Freigaben implementiert; reine Markdown-Korrekturkopien haben einen getrennten Nicht-KI-Zweck. Dauerhafter Auftrag vor Anlage, exklusive neutrale Dateien, Hash-/Dateimengenprüfung. Idempotenter ACK-Abgleich derselben Auswahl auch nach Widerruf eines fertigen Exports, Wiederentdeckung nach Neustart und historische Abschlussbelege vorhanden. Expliziter Verzicht auf unvollständigen Auftrag mit Bestätigung/Terminalbeleg, ohne Dateien zu löschen oder Auswahl umzuschreiben; fertige Exporte bieten nur ACK. Modale Vorschau vor I/O, Fokus/Abbruch/Rückkehr und dynamische Wiederaufnahmeaktionen geprüft. Geschlossene native Öffnungsaktion für fertige Exportbelege mit ursprünglicher Zweck-/Root-/Identitäts-/Dateimengen-/Hashprüfung implementiert; keine Kopie oder ACK beim Öffnen. Gegenproben und synthetische Tastaturprobe bestehen, keine native Dateimanagerabnahme behauptet. Ungebundene Crashordner bleiben unangetastet. Jetzt tatsächlich angeschlossener nativer Broker mit dauerhaft ursprünglicher Picker-/Parentbindung und begrenztem Körperstream, sämtliche neuen v2-Ziel-I/O handle-relativ. Echte Node/Pipe/Rust-Gegenproben beider Zwecke und unabhängiger Korrekturreview bestehen. Automatischer Kontrollabbruch-/Wiederverbindungsvertrag sowie native Windows-/Mac-Race-/Crash-/Paket-/Dateisystemabnahme bleiben offen. | teilweise umgesetzt |
| .7 | Verlauf/Einstellungen, genaue Dateiprobleme und erneutes Laden ohne Neustart implementiert. Sichtbarer Verlauf folgt Statusabfragen automatisch; unveränderte Antworten erhalten Bedienelemente, Änderungen die geöffneten Probleme und den Fokus. Pause-/Dokumentfreigabe-/KI-Exportaktionen sind laufgebunden angeschlossen; Entitätenrevisionen selbst sind implementiert. Ausdrücklich ausgelöste laufgebundene Momentaufnahme aktueller Freigaben und historischer Exportbelege mit getrennten offenen Aufträgen/Bestätigungen; keine automatische Volljournalabfrage aller Läufe. Legacy ohne Manifest bleibt unbekannt, fehlende/defekte Prüfstände sind kein Null-Erfolg. Höchstens eine priorisierte Hauptaktion, verfügbare Nebenaktionen aufklappbar; aktuelle Exportabdeckung über exakte Revision/Hash/Zweck, dedupliziert über alle fertigen Operationen. Exportvorschau lädt frisch und kopiert nichts; fehlender/ersetzter Ordner wird nicht exportbereit. Zwei unabhängig gefundene Ladesperren-Rennen und zwei Crash-/Ablaufgrenzen sind mit zunächst roten Regressionen korrigiert. Auch ausschließlich abgewiesene Eingaben behalten Namen/Gründe nach Journalablauf, ohne Dokumentautorität. Stabile Laufaktionen erhalten Tastaturfokus; höfliche Statusregion meldet Phasen und neue Fehler. 32 Workspace-, 31 Dokumentrenderer-, 24 Recovery-, 19 Journalfälle, echte Ordner-/Exportabdeckungs- und Neuprozessgegenproben beider Zwecke sowie synthetische Tastatur-/390-Pixel-Probe bestehen. Vollständige grafische/native Verlaufsabnahme, Retry/Auslassen einzelner Fehlerdateien und sequenzierter Ereignis-/Wiederverbindungsvertrag bleiben offen. | teilweise umgesetzt |
| .8 | Drei unabhängige Gegenprüfungen eingearbeitet, Renderer-/Sidecar-/Rustregressionen und echte Browser-Klick-/Reflowprüfungen vorhanden, einschließlich Auswahl ≠ Entscheidung, mehrseitiger Übergabe, Vertagen und stabiler Tastaturrückkehr. Vollständige Accessibility- und native v2-Paketkampagne auf Windows/Mac sowie Abschlussreview nach Restimplementierung offen. | in Arbeit |

**Nachbesserung .2/.7 und BL-011.1, 07.10.2026:** Echte gemischte Aufnahme
(gültiges TXT plus beschädigtes DOCX) war für beide Zwecke zunächst rot und ist
korrigiert. Aufnahme speichert eine getrennte geschlossene Ablehnungsliste schon
nach Journalcommit; auch All-rejected bleibt ohne erfundene Quellhashes, Körper,
Freigaben oder Exporte nachvollziehbar. Die unabhängige Gegenprüfung fand noch
einen veralteten Null-Fehlerzähler und fehlende Manifest-Reparatur nach Crash.
Beide wurden zunächst rot reproduziert und korrigiert; begrenzter unabhängiger
Abschlussreview ohne weiteren blockierenden Befund. 27 Aufnahmefälle und 38
private Dokument-/Exportfälle bestehen. Reale Gateway-Neustarts prüfen beide
Zwecke × Recovery, periodischen Ablauf und direkten Ablaufreader. Konflikte
bleiben fail-closed, Originale unverändert; fehlgeschlagene Metadatensicherung
meldet Bereinigungsschuld statt ihr einziges Journal zu entfernen. Bestehende
Zero-Day-Quellkopiebereinigung bleibt vorgelagert. Cowork/Legacy unverändert.

**Exportentscheidung .6 (vor dem Anschluss):** Normalen Ergebnisordner ausdrücklich beibehalten,
keine ZIP. Private vollständige Vorbereitung plus native No-replace-Umbenennung
ist unabhängig revalidiert; der vollständige Broker ist noch nicht implementiert.
Alle Ziel-I/O, sichere Namespace-Erstanlage, Eigentumsbeleg vor Veröffentlichung
und Crashabgleich einschließlich Verzicht müssen nativ gebunden sein. Andere
Volumes und nicht unterstützte Dateisystemoperationen erhalten keinen stillen
Kopier-Fallback. Sichere vollständige native Umsetzung samt Windows-/Mac-Race-/Crash- und
Paketgegenproben bleibt P1, nicht erledigt.

**Vorausgehender interner Dateisystem-/Transaktionsschnitt .6, 07.10.2026:**
`tauri-contract/src/export_directory.rs` besitzt bestehende Verzeichnisse über
gehaltene Handles, schreibt neue Dateien exklusiv und veröffentlicht eine
vollständige private Stage ohne Ersetzen. Zwölf echte Windows-Gegenproben,
darunter 32 konkurrierende Zielanlagen, gesperrter Rootaustausch, falsche oder
bereits verschobene Stage und unklarer Status nach tatsächlichem Rename,
bestehen. Die unabhängige
begrenzte Code-Gegenprüfung führte zusätzlich zu einer reinen
Identitäts-Inspektion ohne neue Schreibkapazität und zum Synchronisieren
des POSIX-Stage-Verzeichnisses vor Veröffentlichung; Windows-Regressionslauf
und Clippy bestehen danach erneut. Der Folgeschnitt verwendet keinen neuen
Exporthelper: Ein geschlossener privater Rückkanal ist ausschließlich für die
native Picker-Metadatenbindung aktiviert. Native Lifecycle-Barriere und die
Sidecar-Start-/Registrierungslücke sind implementiert. Der interne Transaktionskern
bindet Intent, Stage, Parents, Zweck und vollständige Hash-/Dateimengen; vor
Retry/ACK/Verzicht wird eine schon veröffentlichte Kopie abgeglichen. Zwei
unabhängige Befunde zu Windows-Recovery-Namensbesitz und halben finalen
Journalbelegen sind korrigiert und im begrenzten Abschlussreview bestätigt.
100 Windows-Rusttests und warning-free Clippy bestehen, einschließlich zwölf
Transaktionsfällen, sieben Workspacefällen und insgesamt 16 tatsächlicher
eigener Testprozess-Beendigungen. Zwei ignorierte Kindhelfer sind nur die von
Eltern-Tests aufgerufenen Checkpoints, keine gesonderte Abnahme. Kontrollierte
ACL-Parents und unveränderliche native Parent-Bindungsbelege sind implementiert
und auf Windows gegengeprüft. Ein unabhängig gefundener Darwin-ACL-Vertragsfehler
ist korrigiert; neue native Mac-ACL-Proben bleiben NOT_RUN. Die asynchrone
Dokumentsperre hält bis zur tatsächlichen Promise-Erledigung; sechs gezielte
Gegenproben bestehen. Begrenzter unabhängiger Workspace-Abschlussreview ohne
weiteren belegten P1/P2. Kein Stromausfall- oder vollständiger App-Paketnachweis.
Der Node-Publisher ist weiterhin **nicht ersetzt**. Dauerhafter privater Root-
Bootstrap, vollständiger nativer Ziel-I/O-Anschluss samt äußerem Freigabebesitz
und neue Windows-/beide Mac-Paketgegenproben bleiben P1 offen.
Keine macOS-Laufzeitfreigabe aus Windows-Tests ableiten.

**Tatsächlicher Exportanschluss .6, 07.10.2026:** Der v2-Dokumentstore benutzt
jetzt den geschlossenen nativen Broker im vorhandenen Desktop-Rückkanal;
der Node-Absolutpfadpublisher wird für diese neuen Operationen nicht mehr
benutzt. Native Pickerbindung speichert ursprüngliche Parent-/Namespace-
Identitäten und kontrollierten Privatbesitz in Einstellungsschema 4,
Operationsschema 5 bindet genau diese unveränderlichen Werte. Alte
Einstellungen benötigen eine ausdrückliche erneute Ordnerwahl; kein stilles
Hochstufen. Neue Ordnerwahl ändert frühere Operationsziele nicht.
Körper gelangen in 64-KiB-Blöcken über die private Pipe direkt in den nativ
geprüften Operationsstage, ohne Node-Spooldateien. Zwei unabhängig belegte
P2 des ersten Anschlusses (Schreiben in ausgetauschten Privatparent und
Erschöpfen des gemeinsamen Journalinventars durch Körperreste) sind korrigiert
und durch zunächst rote reale Gegenproben geschlossen. Auch der
Root-Trennungsreader akzeptiert jetzt die neue Konfiguration. Tatsächlicher
Node-Store/Pipe/Rust-Dateisystemweg beider Zwecke besteht einschließlich
verlorener Abschlussantwort, Widerruf, identischem ACK-Abgleich,
Inventarmanipulation, Verzicht, Mehrchunk-Unicode und leer bleibendem
ausgetauschtem Privatroot. 103 Rusttests, acht Kanal- und sieben
Dokumentbesitzfälle sowie Clippy bestehen; drei ignorierte Kindhelfer sind
keine fehlende Fachabnahme. Unabhängiger begrenzter Korrekturreview ohne
weiteren belegten P1/P2. Dokumentbesitz bleibt bis tatsächlichem nativem Ende
beim geprüften Desktopelternprozess; Sidecar-Tod kann keinen konkurrierenden
Publisher freigeben. Dafür ist nach solchem Kontrollabbruch noch ein voller
App-Neustart erforderlich. Automatischer Wiederverbindungsvertrag,
vollständige native Windows-/Mac-v2-Paketabnahme und Stromausfallnachweis
bleiben offen. Das ist keine allgemeine Releasefreigabe.

**Weitere Dateifehler-/Grafiknachbesserung .7/.8, 07.10.2026:**
Gebundene terminale Fehlerbelege erhalten Dateinamen und Gründe nach Ablauf des
Prozessjournals. Unveröffentlichte fehlgeschlagene Entwürfe blockieren gesunde
Dokumentprüfstände nicht mehr; bestehende/defekte Veröffentlichungsbelege werden
nicht als Fehlschlag umgedeutet. Sieben reale Persistenz-/Konfliktfälle und
unabhängiger Review bestehen. Synthetische Browsergegenprobe bestätigt zentrale
Behandlung, Häkchen ohne Entscheidung, Original-/Markdown-Vergleich und Reflow
bei 1280/600 Pixeln; Auswahlspaltenumbruch korrigiert. Vollständige grafische
und native Abnahme, einzelne Datei-Wiederholung/Auslassung sowie sequenzierte
Wiederverbindung bleiben offen. Der damalige Produkteingang mit 217 Testdateien
stoppte am unveränderten Git-Tracking-Gate für neue v2-Dateien. Kein Gesamt-PASS,
Commit, Push, Actions-Start, Standardwechsel oder neuer Release aus diesem Schnitt.

**Lokale Windows-Testbarkeit .1/.4/.6/.8, 08.10.2026:** Ein gesondertes
Engineering-Paket r3 (ersetzt r2) aktiviert die neue Hauptseite nur über eine Buildkonfiguration.
ZIP-Verifier, tatsächliche Paket-Sidecar-Abläufe beider Zwecke sowie native
Haupt-/Prüfseiten-Ladung mit erfolgreichen IPC-Antworten bestehen; letzteres
ist noch kein vollständiger nativer v2-Bedien-/Exportnachweis. Die synthetische
Browserprüfung umfasst Sammelentscheidung, Original-/Markdown-Vergleich,
Dokumentfreigabe und ausdrücklichen Exportdialog. Bei 720 × 560 wurde ein
initialer Fokusfehler korrigiert, der die Sammelaktionen verdeckte; 33 Renderer-
Fälle bestehen. Der Vorschauadapter meldet Ergebnisbereitschaft nun konsistent,
bleibt strikt simuliert. Exakter Schnitt und Testanleitung:
`dist/engineering-workspace-v2-windows-20261008-r3/{PRUEFNACHWEIS.json,TESTHINWEISE.txt}`.
Neue v2-Dateien sind zur Versionierung vorgemerkt (Intent-to-add, kein Commit).
Der vollständige lokale Gesamtprodukteingang besteht nach der unten genannten
Regelversionskorrektur mit 217 Testdateien (96 Basis plus 121 direkte). Native GUI-,
Grafik-/Accessibility-, Mac-, Wiederverbindungs- und Einzeldatei-Retry-Abnahme
bleiben offen; .1–.8 werden nicht pauschal auf erledigt gesetzt.
Der zusätzliche `cargo fmt --check` meldet Formatierungsdrift auch in
unveränderten Rust-Bestandsmodulen; keine pauschale Massenformatierung und kein
falscher Gesamt-PASS. Funktionstests/Clippy und dieser Stilcheck bleiben getrennt.
Der nächste Gesamtlauf fand eine fehlende Regelversionsbindung für die neue
`privacy/transform-plan.js`. Diese ist im Core-Fingerprint ergänzt, nicht im
Test ausgenommen. 25 Versions-/Pseudonymfälle und neun echte Produktprojektions-
und Neustartfälle bestehen; unabhängiger Abschlussreview bestätigt die begrenzte
Korrektur. Deshalb wurde das Windows-Engineering-Paket als r3 neu projiziert
und erneut verifiziert, einschließlich Paket-Sidecar-Abläufen und nativem
Start/IPC. Alte gebundene unvollständige Engineering-Läufe werden nicht mit
veränderten Regeln migriert; frischen Testlauf verwenden. Der vollständige
Produkteingang besteht nach dieser Korrektur. Dokumentationsgates und
`git diff --check` bestehen; Releasebuild und neues Pluginarchivgate bleiben
rot und werden durch das gesonderte Windows-Testpaket nicht umgangen.

**Fortschritt .4/.6/.7/.8, 08.10.2026 (r7 ersetzt r3–r6):** Automatische
Wiederverbindung ist implementiert, nicht mehr bloß ein offener Entwurf.
Native Besitzergeneration und Lifecycle-Barriere erlauben den Wechsel erst
nach tatsächlichem Ende des alten Sidecars und aller nativen Aufträge.
Epochbindung verwirft verspätete Picker-/Drop-/Ladeantworten. Private UI-Stände
werden gelöscht, Mutationen niemals automatisch wiederholt. 106 Windows-
Rustfälle (plus drei ignorierte Kindhelfer), Clippy, 38 Workspace-, 34 Review-,
37 Dokumentrenderer- und zehn Dokumentbesitzfälle bestehen.

Die reale r7-GUI-Gegenprobe im isolierten Windows-Profil besteht für native
Ordnerwahl, Anonymisierung, integrierte Sammelprüfung über zwei Dokumente,
Unternehmen/Person/Beibehalten, Warteanzeige/automatischen Rückweg, tatsächlichen
Original-/Markdown-Vergleich, explizite Freigabe und getrennten KI-Export.
Die beschädigte dritte Datei ist mit Name/Endung/`PARSE_FAILED` sichtbar;
gesunde Dokumente bleiben unabhängig prüf- und exportierbar. Exakt zwei neutrale
Markdown-Dateien, keine privaten Begleitdateien, erwartete typisierte Ersatzwerte
und unveränderte Quellen sind nachgeprüft. Kontrollierter Sidecar-Ausfall nach
fertigem Export verbindet automatisch neu; ausdrückliches Neuladen erhält
Freigaben und genau einen Export. Reguläres Schließen beendet eigene Prozesse.
Agentische Engineering-Beobachtung, keine simulierte menschliche E1/E2/E3-
oder vollständige native Plattformabnahme. Beide Mac-Architekturen, weitere
Abbruchzeitpunkte und vollständige grafische/Accessibility-Kampagne bleiben offen.

Zwei echte GUI-Befunde sind mit Regressionen geschlossen: ungerechtfertigte
Renderer-Ablehnung gültiger Prozessfehlercodes und Schlüsselreihenfolgevergleich
der Identitätsauswahl an der Tauri-Grenze. Letzterer zunächst rot, danach 39
Dokument-/Export- und sieben tatsächliche Node/Pipe/Rust-Fälle grün;
unabhängiger begrenzter Review bestätigt semantischen Vergleich bei unverändert
strenger Revision/Hash/Bindung. Gesamtprodukteingang erneut 217 Testdateien grün;
r7-ZIP-Verifier und Paket-Sidecar grün. Nachweis/Testanleitung liegen neben dem
Archiv unter `dist/engineering-workspace-v2-windows-20261008-r7/`.
Keine Commit-/Push-/Release-/Actions-Autorisierung daraus ableiten.
Die vorstehenden r3-/Anschlussabschnitte sind zeitgebundene frühere Nachweise;
ihre damalige offene Wiederverbindung wird durch diesen Schnitt ersetzt.
.1–.8 bleiben insgesamt teilweise/in Arbeit; Einzeldatei-Retry ist nicht gebaut.

**Korrektur .2/.4/.6/.8, 08.10.2026 (r8):** Der gemeldete Startfehler ist
am echten Worker belegt: `document_review: true` wurde vor Anlage eines
Markdown-Laufs als `PROCESSING_MODE_INVALID` abgelehnt. Der private neue
Standalone-Aufnahmeweg erlaubt den Schalter jetzt für beide Zwecke, nicht für
fremde Kanäle oder ungültige Werte. Drei tatsächliche projizierte Sidecar-/
Worker-Gegenproben prüfen dauerhaft angelegte Läufe, Verlauf, Dokumentzweck
und tatsächliche Markdown-Inhalte; keine reine Aufrufattrappe.

Prüfliste standardmäßig „Noch offen“: Vorgemerkte Zeilen weichen den übrigen,
50 behandelte Zeilen zeigen sofort die verbleibenden 14. Explizite Auswahl aller
gefilterten Zeilen über Seiten hinweg, atomare Eingabeprüfung, passende
Vergleichszeile, leere Filter ohne alte Pixel, Abschlussaufforderung und
Rückgängig sind implementiert. Keine automatische Bestätigung/Übergabe.
37 Prüfer- und 41 Workspace-Rendererfälle bestehen. Bestätigter Start wechselt
zum Verlauf; der verbundene aktive Lauf erhält Hervorhebung, Arbeitsindikator
und Dateifortschritt. Über „Verarbeitung anzeigen“ bleiben Laufaktionen erreichbar.
Windows-Engineering-r8 ist neu gebaut, Archiv und echter Paket-Sidecar bestehen.
Die native Bedienprobe wird nach ausdrücklichem Entzug der Desktop-Freigabe
nicht weitergeführt; der Anwender übernimmt. r7-Bedienevidenz ist nicht automatisch
r8-Evidenz. Restpunkte und Gesamtstatus bleiben offen/teilweise; keine neue
Mac-, Accessibility-, N3/N4- oder Releasefreigabe. Nachweise/Testanleitung im r8-Ordner.

**Abschließendes Undo-Delta .4/.8 (r9):** Der unabhängige Review belegte noch
„alle vormerken → zurücksetzen → Rückgängig“: Die restaurierten Entscheidungen
waren durch den pauschalen Offen-Filter unsichtbar. Korrigiert auf zustandsabhängigen
Filter einschließlich gemischter Zeilen, passende Seite/Vergleich, leere Auswahl
und erneuerten Statushinweis. Zwei Regressionen vorher rot, jetzt 39 Prüfer-
und 41 Workspace-Fälle grün; unabhängige Nachprüfung ohne weiteren Befund in
diesem begrenzten Schnitt. Windows-Engineering-r9 frisch gebaut/verifiziert,
echte Paket-Sidecar-Abläufe beider Zwecke einschließlich OCR-Prüfung grün;
keine neue GUI-Instanz gestartet. Sichtbare Bedienabnahme bleibt beim Anwender,
keine Erweiterung der entzogenen Desktop-Freigabe. r9 ersetzt r8 für neue Tests.
Vorausgehender Gesamteingang 217 Testdateien grün; letzter Undo-Schnitt zunächst
separat mit vollständigen 39 Prüfer- und 41 Workspace-Fällen nachgeprüft.
Der spätere Gesamtreview R9-20261008 ergänzt den vollständig neu gestarteten
eingefrorenen r9-Gesamtlauf mit 217 Testdateien; kein allgemeiner Release-PASS.

**Revalidierter Restvertrag .7:** `Fortsetzen` darf nicht als Datei-Retry
umbenannt werden: Runner, Maintenance, Fehlerstabilisierung und Snapshot-
Invalidierung arbeiten derzeit laufweit. Ein sicherer neuer Retry braucht
einen dauerhaften, versionsgebundenen Zielauftrag, atomaren Claim mit Lease,
genau diese Ziel-ID im Worker und auf die Zielmenge begrenzte Nebenwirkungen.
Eine verlorene Bestätigung muss denselben Auftrag abfragen, nicht einen
zweiten Start auslösen. UI-Eignung/Gründe müssen vom Backend kommen.
Gegenprobe vor Abnahme: zwei fehlerhafte Dateien plus gesundes/freigegebenes
Dokument, Wiederholung nur einer Datei, Lost-ACK und Neustart; alle anderen
Dateien/Revisionen/Freigaben/Exporte bleiben unverändert. Noch nicht implementiert.

**Zusätzliche unabhängige Gegenprüfung .7, 08.10.2026:** Drei konkrete
Speichergrenzen sind vor dem Retry-Button zu lösen. Terminal gestoppte Dateien
werden derzeit über `batch-delivery.js:cleanupTerminalWorkCopy` bereinigt;
alte bereinigte oder abgelaufene Kopien dürfen nicht still aus Originalpfaden
neu gelesen werden. Der erste begrenzte Retry kann daher nur verifizierte,
noch gültige private Kopien technisch unterbrochener Dateien verwenden.
Deterministisch beschädigte, verschlüsselte oder ungeeignete Eingänge benötigen
mit Dateiname/Endung den Hinweis „Original korrigieren und neu auswählen“.
Unbestätigtes Konverterende bleibt ausdrücklich gesperrt.

`standalone-document-review-store.js` speichert terminale Fehler und Basisstände
unveränderlich; Fehler plus spätere Veröffentlichung derselben Dokument-ID
werden heute absichtlich als Konflikt abgewiesen. Benötigt werden explizit
versionierte Versuche und eine nachprüfbare Ablösung des aktuellen Fehlerstands,
nicht Löschen alter Fehlerdateien oder Überschreiben von `base.json`. Ein später
erfolgreiches Zieldokument beginnt ungeprüft; fremde Freigaben bleiben identisch.
Auch `batch-terminal-evidence.js` bindet den bisherigen Abschluss an exakte
Ergebniszahlen. Wiedereröffnung braucht einen neuen Abschlussstand mit Bezug zum
Zielauftrag, während vorherige Nachweise und Exportbelege historisch erhalten
bleiben. Die lokale Zuordnungsprojektion muss aktuellen Versuch und alte
Stoppzeile unterscheiden. Umsetzungsschichten: Eignung/Versuchsjournal →
zielgebundener echter Runner samt Maintenance/Fehlerstabilisierung/Review →
aktuelle Projektionen/Nachweise → UI. Kein bloßer Wrapper um laufweites Fortsetzen.

**Zusätzliche Windows-GUI-Probe, r7:** Ein zweiter isolierter Nur-Markdown-
Bedienversuch wurde vor Start abgebrochen, weil Computer Use für den sichtbaren
nativen Quellenpicker eine ungültige Fenstergeometrie (14 × 14) zurückmeldete.
Kein bestandener Konvertierungs-/Exporttest und kein nachgewiesener App-Fehler.
Nur eigene identitätsgeprüfte Testprozesse beendet; Daten/Nachweise erhalten.
Die davor vollständig beobachtete r7-Anonymisierungs-/Exportkette ist davon
getrennte bestandene Engineering-Evidenz.

## Epics

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon
### BL-001 – Dokumentensystem und Wiederverwendung
### BL-002 – Ist-/Zielvertrag und Drift
### BL-011 – Sicherer fortsetzbarer Stapelkern
### BL-012 – Nutzerreise und lokaler Review
### BL-020 – Gemeinsame Inhaltsgrenze
### BL-021 – Text und CSV
### BL-022 – OOXML-Formate
### BL-023 – PDF-Risikogate
### BL-024 – OCR und Rasterbilder
### BL-030 – Profil und Pseudonyme
### BL-031 – Zertifikats- und Fundstellenkontext
### BL-032 – Mehrdeutigkeit
### BL-040 – Lokaler Export und Nachweis
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme

Erledigte Arbeiten zu BL-001/002/003/040/043 sowie abgeschlossene E0-Scheiben
stehen ausschließlich in `BACKLOG_ARCHIVE_2026-08.md` und
`BACKLOG_ARCHIVE_2026-09.md`.
