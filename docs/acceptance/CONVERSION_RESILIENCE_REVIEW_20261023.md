# Konvertierungsrobustheit nach RC173 – Prüfung und Erweiterung

Quellstand: 3.2.0-rc173; neue unveröffentlichte Folgearbeit, 23.10.2026.
Startcommit f18e2ceef87e9e4da504a169d10e98cfcab9c34a auf
codex/standalone-export-usability. RC173-App-/Tagcommit e253380e… und alle
veröffentlichten Pakete unverändert. Kein neuer Build-/Releaseauftrag allein
aus dieser Analyse abgeleitet. Desktoptests beim Nutzer; keine Mainintegration.

## Ausdrücklicher neuer Auftrag

Word-w:hMerge ergänzen und sämtliche derzeit unterstützten Eingabetypen auf
weitere fehlende Renderer, Inhaltsmodelle, unnötige Stopps und bessere bekannte
Verfahren im Internet/GitHub prüfen. Ziel: möglichst vollständige, lesbare MD
aus sicher gelesenen Originalinhalten, mit konkreten Auslassungshinweisen.
Originaldateien, alte Ergebnisse, Profile, Archive, rote/grüne Belege und das
dirty Schwesterrepo bleiben unverändert. Keine echten Dokumente hochladen.

Kein Nullfehler-/Universalformatversprechen: verschlüsselte Quellen ohne
Schlüssel, nicht beweisbare globale Container-/Quellidentität, unbestätigtes
Workerende, aktive Ausführung, fremde Rechte und fehlgeschlagene Residualprüfung
werden nicht durch Erfolg oder leere MD ersetzt. Ressourcenbudgets bleiben.
Ein dateibezogener Fehler soll den übrigen Stapel nicht unnötig blockieren.
Unabhängige sicher gelesene Teile dürfen nur über den bestehenden gebundenen
Teilkonvertierungsvertrag übernommen werden, niemals per allgemeinem catch.

## Begrenzter Arbeitsplan

1. Tatsächliche Istpfade/Fehlergrenzen und laufende Jobs prüfen. Keine neuen
   Builds/duplizierten Freezejobs. Unabhängige begrenzte Reviews für Word,
   XLSX/PPTX sowie PDF/Grafik; keine Unteragenten/Peer-/Desktopsteuerung.
2. Word-Implementierung zuerst: echte hMerge-restart/continue/default-Gruppen
   mit gridSpan/vMerge/Nested, eindeutigen Besitzern und ursprünglicher
   Textreihenfolge; keine blinde Propertyersetzung. Positive/negative Parser-,
   Privacy-/Keep- und Budgetgegenfälle mit unveränderten Schutzgrenzen.
3. Aktuelle Primärquellen/konkrete Issues und tatsächlichen Upstreamcode lesen.
   Bekannter Fremdfehler ist nicht automatisch ein DataSecure-Fehler. Je Gap:
   vorhandener eigener Codepfad, reproduzierbarer Befund, sichere Lösung,
   verbleibende Grenzen und benötigte Runtime/Abhängigkeit/Lizenz ausweisen.
4. Kleine bestätigte Verbesserungen ohne neue externe Autorität implementieren
   und unabhängig revalidieren. Große zusätzliche Renderer zunächst getrennt
   bewerten: Offlinebetrieb, Paketgröße, Architektur, Prozessisolation,
   Dateirechte/Netzverbot, Budgets, Herkunft/Lizenz und macOS-Versiegelung.
5. Gezielte echte Testketten; nach Ende der Quelländerungen stabile Regression.
   Modell-/RAM-/Quellenchecks sind weder native Mac- noch Desktop-/Officeabnahme.
   Kein neuer Kandidat oder vollständiger Endgatelauf ohne genaue Bindung.
6. Aktuelle Coverage-/Backlogmatrix pflegen, bestätigte Lücken von geplanten
   Methoden und nicht untersuchten Fällen trennen. Verbleibende echte
   Produktentscheidungen explizit nennen, nicht Schutzprüfungen abschalten.

## Erhebungsstand und erste externe Gegenfälle

- Microsoft dokumentiert w:hMerge als horizontale Zellverbindung aus
  Kompatibilitätsgründen und empfiehlt gridSpan für neue Serialisierung.
  RC173 wirft für dieses gültige, noch nicht modellierte Feature im Hauptteil
  DOCX_STRUCTURE_UNSAFE. Das ist eine eigene konkrete Unterstützungslücke.
  [Microsoft hMerge](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.horizontalmerge)
- [MarkItDown2569](https://github.com/microsoft/markitdown/issues/2569): ein
  unbekannter Shape-Typ kann dort eine ganze Präsentation verwerfen. Der
  Vergleichspunkt ist Isolation des unabhängigen Objekts, nicht das pauschale
  Ignorieren fehlerhafter globaler Beziehungen. Eigene PPTX-Abdeckung im Review.
- [MarkItDown2646](https://github.com/microsoft/markitdown/issues/2646): nicht
  gepaarte Wordfeldmarken führten in einer gebundenen Mammoth-Version zum
  Ausnahmefehler; eine Dependencykorrektur löste den konkreten Fremdfall.
  DataSecure nutzt diesen Mammothpfad nicht. Kein eigener Fehler oder bloßes
  Dependencyupdate daraus abgeleitet.
- [MarkItDown2678](https://github.com/microsoft/markitdown/issues/2678): falsche
  automatische Zeichensatzwahl kann unbemerkt Originalwerte verändern.
  Eigene TXT/MD/CSV-Eingänge sind bewusst strikt UTF-8. Eindeutige BOM-basierte
  Erweiterung ist getrennt von riskantem Charset-Raten zu bewerten.

## Native Renderer – Entscheidungskriterien

Die bestehenden eigenen OOXML-Leser, PDF.js, Canvas, Tesseract und begrenzten
Grafikdecoder bleiben die Vergleichsbasis. MarkItDown/Mammoth oder Docling sind
keine vollständigen Office-Renderer und keine automatischen Privacybeweise.
Ein zusätzlicher LibreOffice-/PDF-Renderer kann Layout-/Altformatabdeckung
erweitern, führt aber einen neuen großen nativen Parser/Prozess mit eigenen
Ein- und Ausgabeprüfungen ein. Keine Installation oder Runtimeadoption erfolgt
allein aufgrund einer Unterstützungsmarketingliste.

Mac bleibt ohne Developer-ID/Notarisierung/Apple-Einreichung. Ad-hoc-Sealing ist
kein Grund, Gatekeeper/HardenedRuntime/LibraryValidation/TCC abzuschalten oder
fremde Module in den eigenen Core zu laden. Ein zusätzlicher Renderer müsste
separat gepinnt, rollengetrennt und nativ auf ARM64/Intel geprüft werden. Die
bestehenden approved Cores werden nicht neu produziert/reimportiert.

## Tatsächlich bestätigte Befunde und aktueller Umsetzungsumfang

Die drei getrennten Audits prüfen tatsächliche Produktionspfade und eigene
synthetische Gegenfälle, nicht lediglich Bibliothekswerbung. Ihre vollständigen
create-only Berichte bleiben lokal unter `dist/rc174-*` erhalten. Die folgende
Liste ist unveröffentlichte Folgearbeit; die RC173-Paketnachweise bleiben alt.

| Pfad | Konkreter Befund | Aktuelle Behandlung |
|---|---|---|
| DOCX | Gültiges Legacy-hMerge wurde pauschal verweigert | Horizontale physische Gruppen/Spans, 2D-/Nested-Eigentümer und Feldschutz implementiert; uneindeutige Eigentümer weiter hart. Komplexes historisches notes-v1 behält seinen bisherigen Schutzstopp. |
| TXT/MD/CSV | Nur UTF-8, auch bei eindeutigem UTF-16-BOM | Standalone liest explizit deklariertes UTF-16LE/BE; kein Charset-Raten, UTF-32, CP1252 oder neuer Coworkeingang. Private CSV-Ansicht nutzt dieselben Bytes. |
| XLSX | ST_Xstring in Shared-/Inline-Strings und x:v einschließlich Formelcaches blieb als `_x000D_` sichtbar | Einmalige Dekodierung pro tatsächlichem typisierten Blatt vor Zelltypinterpretation; Formeln bleiben literal/unausgeführt. Separate Boolean-/Zahlen-/Sharedindexgrenzen und Unicodeprüfung bleiben. |
| PPTX | Aliaspräfixe in Präsentationsliste/Notizen verloren Folien oder Notiztext | Namespace-/Owner-/MC-gebundene Folienliste und Notizprosa implementiert; historische fragmentorientierte Leser separat. Kein pauschales Umbenennen von XMLpräfixen. |
| PDF | Optionaler Titel mit 4097 Zeichen verhindert vor Seite1 lesbaren Inhalt | Enger Selektor für größenbedingt ausgelassene ganze private Metadatenfelder plus Worker-/TEXT_LIMIT_PARTIAL-Hinweis implementiert. Schema/Unicode/Accessor/Key/Identität bleiben hart. 4096/4097-Grenzprobe mit echtem Worker im nativen Folgelauf PASS. |
| PNG | Gültige indizierte/16-Bit-/Adam7-Varianten vom eigenen schmalen Decoder verweigert | Statischer, vorgeprüfter Canvas-Subsetfallback implementiert; CRC/Chunk-/Pixel-/Zlibprüfung vor nativer Dekodierung, nur private rekonstruierte Pixelchunks. Beschädigte Bytes/APNG nicht per catch-all zulassen. |

Die Excel-Gegenfälle belegten außerdem echte Lücken im bisherigen Feldschutz:
CR-geteilte Namen in einer generischen Zelle, lange Feldpräfixe, Werte direkt
in Tabellenkopfzeilen sowie `Name:` hinter dem Formelcache-Wrapper konnten
ungeprüft sichtbar bleiben. Exakte zellinterne Feldwerte werden jetzt auch
dort konservativ maskiert. Die unabhängige Residualprüfung liest dieselben
wirklichen Zellen separat und verweigert eine Keep-Wiederherstellung. Kein
erratenes PERSON-/Unternehmensmapping, kein globales Zeichenlöschen oder
Freistellen importierter Pseudonymmarker. Der Kopfzeilenfix verhindert zugleich,
dass ein maskierter Kopf fälschlich zur semantischen Name-Spalte für Fachwerte
der Folgezeile wird. Alle ursprünglichen roten Belege bleiben erhalten.

PNG-Grenzen: APNG und unbekannte Chunks bleiben explizit eingeschränkt, ohne
stillschweigend nur Frame0 zu lesen. Mehrere verschieden benannte sPLT-Chunks
werden vom aktuellen Code akzeptiert; die frühere Einschränkung im Autorbericht
ist überholt. Keine vollständige Semantik-/ICC-/Farbtreueprüfung ignorierter
Ancillary-Metadaten. Die bestehende öffentliche Fehlerklasse ist bei manchen
unbekannten Features noch generisch, kein präziser neuer Formathinweis behauptet.

Zusätzlich real bestätigt, noch getrennt zu modellieren:

- **Diagramme:** Aktuelle XLSX-/PPTX-Wertelisten verlieren Punktindex-/Serien-/
  Kategoriebezüge. Ein Gegenfall North/South mit XML-Reihenfolge 200/100
  benötigt tatsächlich North→100 und South→200. Gemeinsames bounded Chart-AST,
  keine Formelberechnung/externen Workbookdaten/Allokation bis Maxindex.
- **Excel-Diagrammblätter:** Workbook→Chartsheet→Drawing→Chart wird nicht
  erreicht. Mit expliziter Partrolle und obigem Modell ergänzen; nicht als
  leeres Worksheet behandeln.
- **Office-Math:** Native OMML-Brüche und andere Formeln verschwinden; einen
  geschlossenen AST→lesbares Math/LaTeX-Kern vor Privacy ergänzen. Kein
  LaTeX-/Makro-/Formelausführen, keine Zähler-/Nennerverkettung.
- **Klassische Excel-Kommentare:** Text vorhanden, Zellref/Autorbindung fehlen.
  Modernes Threadmodell ist bereits vorhanden, kein neuer Wiederholungsauftrag.
- **Passive PDF-Formularwerte:** Reale PDF.js-APIprobe liefert den Widgetwert,
  getTextContent nicht; derzeitiges Raster deaktiviert Annotationen. Separate
  gebundene Text-/FreeText-/Widgetsemantik und getestete passive Appearance-
  Ergänzung nötig, kein blindes ENABLE_FORMS, keine Aktionen/JS/Anhangsuche.
- **Moderne Excel-RichValues:** Frühe exakte Relation wird noch als aktiv
  verweigert. Bisher Admissionprobe, kein vollständiges Workbook-Gegenorakel.
  Erst Owner/Contenttype/Schema/Fallback exakt modellieren; keine URI-Blanket-
  Allowlist. TableParts/Pivot/chartEx/VML weitere Quellmodelle, nicht alle schon
  als tatsächliche Totalausfälle nachgewiesen.

Weitere Decoder-/Qualitätslücken: TIFF-LZW/CCITT/JPEG/Tiles/BigTIFF/Orientierungen,
BMP-Palette/RLE/Bitfields, EMF+ und weitere GDI-Records, komplexes SVG, animiertes
WebP sowie ganze Office-Seiten-/Folienkomposition. Diese Grafiktypen sind
teilweise nur eingebettete Office-Medien, nicht eigenständige Dateieingänge.
PDF-Lesereihenfolge/Tags und zusätzliche OCR-Segmentierung müssen die echten
Quellpositionen sowie bekannte CLOUD-/Tabellenregressionen erhalten. Keinen
Layoutsortierer oder PSM-Wechsel pauschal auf jedes Dokument anwenden.

## Im Internet gefundene konkrete Lösungsmodelle

Primärquellen tatsächlich gelesen; keine Nutzerdateien versendet. Gezielte
eigenständige Adaptierung der belegten Modelle ist für das kleine Delta
sinnvoller als ein neuer kompletter Python-/Office-Runtimeaustausch. Fremdcode
wurde bisher nicht in das Produkt kopiert. Bei späterer Codeübernahme müssen
Revision, ursprüngliche Notices und vollständige Lizenz-/Dependencyclosure in
das Produktinventar, nicht nur in diesen Bericht.

- **Docling:** Konkreter gemeinsamer [Chart-Tabellenaufbau](https://github.com/docling-project/docling/blob/53c11a20a5dd6ac0d85fe88cc257ca3b4b3a72d4/docling/backend/utils/charts.py)
  bindet Kategorien und Serien und begrenzt die Ausgabe; guter Ansatz für
  unser künftiges semantisches Modell. Seine dichte/gekappte Darstellung nicht
  ohne eigene Sparse-/Coverage-/Privacybelege übernehmen. Konkreter
  [OMML→LaTeX-Reader](https://github.com/docling-project/docling/blob/53c11a20a5dd6ac0d85fe88cc257ca3b4b3a72d4/docling/backend/docx/latex/omml.py)
  verarbeitet Brüche, Indizes, Wurzeln und Matrizen; MIT und zusätzliche
  Herkunfts-/Python-Abhängigkeiten beachten. Das ganze PDF-/MLsystem ist dafür
  keine Voraussetzung. Gelesene Revision `53c11a20a5dd6ac0d85fe88cc257ca3b4b3a72d4`.
- **Calamine:** Tatsächliche [Excel-Escape-Utility](https://github.com/tafia/calamine/blob/master/src/utils.rs)
  bestätigt das Einmal-Decoding inklusive `_x005F_`-Literal; eigener vorhandener
  typisierter Decoder wird erweitert, nicht der gesamte Rustreader ersetzt.
  Nicht jede Utility deckt alle Unicode-Escapes ab; die eigenen strikten
  Unicode-/Ressourcen-/Ownerprüfungen bleiben erforderlich. MIT; kein nativer
  Office-Layout-/Chartrenderer.
- **MarkItDown:** Der [PPTX-Reader](https://github.com/microsoft/markitdown/blob/7482c092d9c0074a89803c9fdb63a969e7fe17fc/packages/markitdown/src/markitdown/converters/_pptx_converter.py)
  zeigt echte Shape-/Notiz-/Chartwege. Bekannte Einzelobjektabbrüche und
  Mehrfachkategorie-/Ganzspaltenprobleme begrenzen einen pauschalen Austausch.
  MIT, aber zusätzliche Python-/Officeparser nicht automatisch vorhanden.
- **Mammoth:** Semantischer DOCX-Reader mit bestehenden unabhängigen
  Referenzgegenfällen im Projekt; kein Universalreader für XLSX/PPTX/PDF.
  Tatsächliche aktuelle NEWS unterscheidet Feldmarkenfix und Sicherheitsfix;
  bekannte externe Parserfehler nicht ungeprüft auf eigene Pfade übertragen.
- **PDF.js/Tesseract/Canvas:** Bestehende lokale Engine zuerst um konkrete
  passive Werte/PNGvarianten/Teilseiten ergänzen. PDF.js6.4.299 ist neuer als
  unser exakt deriviertes6.2.108; Update braucht Rebase und Byte-/Paint-/Text-
  Gegenbelege. Tesseract.js7.0.0 ist bereits aktuell; ein CLI-Wechsel allein
  behebt weder Metafiledekodierung noch beliebige OCRqualität.
- **LibreOffice headless:** Beste Kandidatenklasse für zusätzliche visuelle
  Writer-/Calc-/Impressprojektion und ältere Officefilter. [Offizielle CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)
  mit isoliertem schreibbarem Profil; headless ist keine Sicherheitssandbox.
  Nicht als einzigen Excelreader einsetzen: Druckbereiche können echte Zellen
  auslassen. Neues Paket-/Font-/Profil-/Prozess-/MPL-/Drittlizenzinventar nötig.
- **MuPDF/MuPDF.js, Poppler:** Reale alternative PDF-Render-/Strukturtextpfade;
  [MuPDF](https://mupdf.readthedocs.io/en/latest/tools/mutool-draw.html) und
  [Poppler](https://poppler.freedesktop.org/) getrennt auf zusätzliche Inhalte,
  Verluste, Peak-RAM, Ende/Isolation und Lizenz (AGPL/kommerziell bzw. GPL)
  evaluieren. Kein dynamisches PATH-Tool und keine Cloud-/VLMhochladung.

## Unabhängige Gegenreviews und Integrationsstand

Begrenzte Produktionsquellenreviews sind abgeschlossen, nach kausalen
Korrekturen ohne weiteren bestätigten Deltablocker:

- Word/hMerge und PPTX/MC: `dist/rc174-ooxml-delta-counterreview-20261023/REVIEW-v2.md`.
- BOM/Text-/CSV-/Projektionsgrenzen: `dist/rc174-text-metadata-counterreview-20261023/REVIEW.md`.
- PDF-Metadaten: `dist/rc174-metadata-xstring-counterreview-20261023/REVIEW.md`.
- Tatsächliche inline/Header-/Keep-/Publikationsketten: `dist/rc174-inline-field-counterreview-20261023/REVIEW-v3.md`.
- x:v/Formelcache plus aktueller Feld-/Residualschutz: `dist/rc174-metadata-xstring-counterreview-20261023/REVIEW-v2.md`.
- Tatsächlicher begrenzter Canvas-/PNG-Gegenreview: `dist/rc174-png-counterreview-20261023/REVIEW.md`.
- Erhalt beider PNG-Orakel und Source-/Native-Gatetrennung: `dist/rc174-png-gate-counterreview-20261023/REVIEW.md`.

Die Berichte unterscheiden tatsächliche OPC-/Privacy-/Trace-/Keep-/Nativepixel-
Proben von Quellenmodellen und behaupten keinen vollständigen Paket-/Mac-PASS.
Der erste gemeinsame Quelltest lief mit stabilen Inputs rot: eine neue native
Canvas-Probe lag versehentlich in der reinen Image-Quellsuite und verlangte eine
nicht versionierte Dependency-JSON. Die beiden echten Canvasfälle sind jetzt
ohne Assertionslockerung im vorhandenen expliziten nativen Grafikgate. Eine
neue Pfadtrennungsprüfung verhindert deren Rückkehr in die Source-CI. Keine
Node-Module werden dafür versioniert und kein Test pauschal ausgenommen.
Originale Evidenz unter `dist/rc174-conversion-followup-20261023/targeted` erhalten.
Folgelauf unter `dist/rc174-conversion-followup-v2-20261023`:45/45Suiten
tatsächlich Exit0, aber das originale targeted/FINAL bleibt **FAIL**, weil
`rg --files tests scripts` am Anfang590 und am Ende570Einträge lieferte.
Produkt-/Driverhash identisch, alle590 ursprünglich gebundenen Dateien beim
direkten Readback bytegleich. Zusätzliche read-only Probe reproduziert bei
identischen rg-Aufrufen570/590, bei drei Einthreadaufrufen590; tiefer rg-Ursprung
nicht bewiesen, keine Produktmutation daraus behauptet. Bericht/Original-Hashes
unter `dist/rc174-input-inventory-diagnosis-20261023/EVIDENCE.json`.

Frischer45er-Quelllauf unter `dist/rc174-conversion-followup-v3-20261023`, nur
ignored Driverinventar korrigiert: NUL-getrenntes `git ls-files --cached --others
--exclude-standard -- tests scripts`, Set/Sort/Bytehashes. Git umfasst auch das
getrackte synthetische Profil trotz Ignore-Regel und zählt591Dateien. Keine
Neuinterpretation oder Umschreibung des alten FINAL; der dafür erforderliche
frische Endnachweis ist unten vollständig abgeschlossen.
Getrennter read-only Drivergegenreview unter
`dist/rc174-input-inventory-counterreview-20261023/REVIEW.md`.

### Gemeinsame technische Folgeprüfungen

Alle vier nativen Windows-Konvertersuiten tatsächlich PASS, Exit0 und
`inputs_unchanged=true`, 23.10.2026 20:46:55.491–20:54:15.130UTC:
PDF-Text/Paint sowie70isolierte Worker-,49Office/MD- und43Grafikgruppen.
Die echten neuen Workerfälle für BOM-UTF16, indiziertes Adam7-/16Bit-PNG und
optionale4096/4097PDFmetadaten wurden dabei ausgeführt, nicht nur konfiguriert.
Kein neuer Windows-Desktop-Appbuild oder Endnutzer-Office-Nachweis daraus.
`native/FINAL.json` SHA256
`f100cf7fafccb7a5e256dae8972610215142c46f685d0b6ba35d760739945752`.

Gemeinsamer unveröffentlichter Produktinput-Fingerprint
`0830f92ce05aa4073f778936784e55b02698bc7230e761479c9e23b99be8cc66`/353Dateien.
590 per `rg --files tests scripts` inventarisierte Test-/Scriptinputs,
Manifest `2e56fc317f12d76f8b7486a261b89ad3bd07964ae0dd035573c90ec9f50f8082`.
Installierte Engines/Gewichte/native Binärrollen sind separat im tatsächlichen
Konvertergate gebunden, keine Gleichsetzung dieses Quellmanifests mit allen
Runtimebytes. Der neue45er-Quelllauf nutzt die getrennte591er-Gitinventarisierung;
Produktbytes und alle vorher gebundenen Test-/Scriptbytes weiter eingefroren.
Versionscheck, kanonisches Dokumentregister,30Dokumentations- und3Linkfälle PASS.

Der frische45er-Quelllauf ist vollständig **PASS**, Exit0 und
`inputs_unchanged=true`,23.10.2026 21:03:20.420–21:19:39.353UTC.
Alle45einzelnen Dateireceipts ohne Signal/Fehler; Abschlussprotokolle gelesen,
keine Fehlerausgabe.9echte Produktprojektions-/Policyfälle über5Profile ebenfalls
PASS.591Gitinputs mit Manifest
`a662626b31ad32119f995b5d3860e116c1b328692024439fc1ba73b0e6315c32`,
derselbe obige353er-Produktfingerprint. `v3/targeted/FINAL.json` SHA256
`8942a6943bdd9f2d24a12805a9cbdff71af956fc731e7718c4267c7ca8e62931`.
Die v2-Nativbelege und der frische v3-Quellnachweis bleiben getrennte Originale;
keine nachträgliche Änderung von Manifesten/FINALs oder erfundene Vollregression.

Noch kein neuer Build, Mac- oder Desktop-PASS dieser Folgearbeit. Keine neuen
Versionen/Tags/Assets und keine Mainintegration. Der vollständige kanonische
Produkt-/Rust-/Paket-/Mac-Endlauf wird nicht aus den begrenzten Tests abgeleitet.

## Weitere Umsetzungspakete nach dem ersten geprüften Delta

1. **Semantische Office-Inhalte:** gemeinsames indexgebundenes Chartmodell,
   Chartsheets, geschlossener OMML-Kern, klassische Kommentarbezüge. Abnahme:
   exakte Kategorie-/Serien-/Wertebindung trotz Sparse-/XML-Reihenfolge,
   Zell-/Folienbesitzer, Wiederholungen, Quellbudgets und echte Privacy-/Keep-
   Publikationsketten; keine Formel-/Objektausführung.
2. **Passive PDF-Inhalte und Qualität:** Widget-/Text-/FreeText-Werte mit
   Seiten-/Rechteckbindung, Appearance-Deduplizierung und typisierten
   Auslassungen. Für Textfehler→Render/OCR zunächst echten kausalen Gegenfall
   schaffen. Zusätzliche Layout-/OCRstrategien nur innerhalb desselben Budgets
   und mit unverändertem Suchtext-/CLOUD-/Tabellenorakel vergleichen.
3. **Weitere Grafik-/OPCmodelle:** obige bestätigte bzw. noch zu beweisende
   Codec-, RichValue-, TablePart-/Pivot-/VML-/chartEx-Grenzen einzeln ergänzen.
   Präzise öffentliche Format-/Auslassungsdiagnose statt generischer Meldung,
   ohne unbekannte Wire-/Ausnahmefehler als erfolgreichen Inhalt umzudeuten.
4. **Optionaler voller Office-Renderer:** LibreOffice separat prototypisieren,
   zuerst konkreten Mehrwert gegen vorhandene semantische Leser nachweisen.
   Quellen-/Lizenz-/Prozess-/Netz-/Datei-/Font-/Ressourcen- und getrennte
   Windows/ARM64/Intel-Mac-Nachweise vor jeder Runtimeübernahme. Kein
   headless-Schalter ersetzt Isolation; keine externen Vorlagen/Links laden.

Diese Pakete sind offen, kein versteckter neuer Renderer oder Universalreader
ist bereits integriert. Sicherheitsbedingte harte Stopps bleiben erforderlich;
das Ziel ist weniger vermeidbare Inhaltsverluste und isolierte Fehler, keine
ungeprüfte Erfolgsmeldung für jede beliebige beschädigte oder aktive Datei.

Vor einer später beauftragten neuen Testversion: eigene neue Versions-/Commit-
und Fingerprintbindung festlegen, frische kanonische Gesamtregression sowie
Windows-Rust-/Native-/Paketgates und beide nativen Macconsumer aus demselben
Appstand. Vorhandene approved MacCores wiederverwenden, keine neue Apple-
Signierautorität ableiten. Testplan um die tatsächlichen neuen hMerge-/BOM-/
Escape-/PNG-/Metadatengrenzen ergänzen; lokale und remote Downloads neu hashen
und Tag/Inventar/PreReleaseflag prüfen. Menschliche Desktop-/Office-/Finder-/
TCC-Abnahme beim Nutzer, nicht aus diesen Quell-/Konverterbelegen ableiten.
