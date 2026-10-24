# Zielbezogener Inhalts-/Renderer-Gapreview – 24.10.2026

## Auftrag und Beleggrenze

Zusätzlich zu RC175 beauftragt: vorhandene Methoden gegen unsere Ziele und
aktuelle Internet-/GitHub-Primärquellen prüfen. Dies ist ein risikobasierter
Quellen-/Architekturreview, keine Universalprüfung aller Dokumentvarianten und
kein Auftrag, sämtliche unten genannten Renderer sofort einzubauen. Keine
Installation, fremde Dokumentausführung, Applekonto-/Rechteänderung oder
Aufnahme neuer Binärrollen während dieser Recherche.

Ziele: möglichst vollständiges lesbares Markdown mit Kontext; sichere ehrliche
Teilübernahme statt vermeidbarer Dateistopps; Offlinebetrieb, unveränderte
Originale und unveränderte Source-/PII-/Residual-/Trace-/I/O-/Prozess-/Budgetgates;
gemeinsamer Quellstand auf Windows x64 und Mac ARM64/Intel. Suchtexte bleiben
gemäß ausdrücklicher Nutzerentscheidung erhalten. Menschliche Desktoptests
bleiben beim Nutzer. Keine Developer-ID/Notarisierung/Schutzabschaltung.

Gelesene aktuelle Grundlage: docs/FORMAT_COVERAGE_MATRIX.md, der Resilienzplan
vom23.10., RC175-Plan und tatsächliche Konverter-/PDF-/Grafikquellen. RC174-
Semantikmodelle und RC175-chartEx nicht erneut als völlig fehlende Fähigkeiten
einordnen. Ein vorhandener Renderer ist nicht gleich Layout-/Semantikabdeckung.

## Priorisierte PDF-/Grafikthemen aus Main-Quellenreview

### 1. PDF-Lesereihenfolge und Tabellenbesitz – hoher Nutzen, kein einfacher Sortierfix

Tatsächliche Stelle: standalone/pdf-text-layout.js, nativeColumnOrder liefert
bewusst die ursprüngliche Zeichen-/Drawfolge. conversion-worker-child.js ruft
diesen Pfad auf; getStructTree/includeMarkedContent werden aktuell nicht für ein
quellgebundenes Dokumentmodell konsumiert. Das schützt davor, Name/Konto-Zeilen
durch eine bloße XYsortierung auseinanderzureißen, ist aber keine allgemeine
Mehrspalten-/Formular-/Tabellenrekonstruktion. Ein konkreter neuer Kundenfehler
wird daraus allein nicht behauptet.

Vorgehen: zuerst gültige PDF-Strukturbaum-/MCID-/Seitenbezüge als optionale
Autorität auswerten; taglose oder widersprüchliche Struktur nicht blind glauben.
Danach begrenztes Layoutmodell für eindeutig bewiesene Regionen. Zeilen/Zellen,
gedrehte Seiten, Spaltengrenzen, Fußnoten und gleiche Texte positionsgebunden
halten. Normaler Tabellen-/Feld-/Residualschutz muss auch nach neuer Reihenfolge
gelten. Keine globale Prosa-Sortierung oder Löschung vermeintlicher Header.

Primärquellen: [bekanntes PDF.js-Reihenfolgeproblem](https://github.com/mozilla/pdf.js/issues/17191),
[PDF.js-Strukturbaumcode](https://github.com/mozilla/pdf.js/blob/master/src/core/struct_tree.js),
[Docling-Layout-/Reihenfolgeoptionen](https://docling-project.github.io/docling/reference/pipeline_options/).
Upstreamoptionen sind Vergleichsmethoden, kein Beweis für unsere Dateien.

### 2. Häufige Scan-TIFF-Varianten – gezielter Decoder statt Universalbild-CLI

Tatsächliche Stelle: standalone/office-visual-decoder.js, TIFFpfad erlaubt
Kompression1/8/32946/32773 und Orientierung1; BigTIFF, LZW, CCITT, JPEG, Tiles,
Sub-IFDs und weitere Orientierungen sind ausdrücklich eingeschränkt. Der
vorhandene mehrseitige Teilpfad soll erhalten bleiben; kein FirstFrame-Erfolg.

Priorität: mit synthetischem Korpus zuerst LZW/CCITT und Orientierungen2–8
bewerten, weil diese reale Scanvarianten sind. Ein eng begrenzter LibTIFF-Worker
ist ein Kandidat, nicht bereits integriert. Vorher Originalpixel-/Seiten-/
Disposal-/Orientierungsbelege, erwartete Ausgabebytes vor Allocation, Strip-/
Tilegrenzen, bestätigtes Childende, Netz-/Dateigrenzen und drei Zielarchitekturen
nachweisen. Nicht pauschal alle Delegates/Plugins eines Bildprogramms zulassen.

Primärquelle: [LibTIFF-Decode/Orientierungsmodell](https://libtiff.gitlab.io/libtiff/functions/TIFFReadRGBAImage.html).
Lizenzen und sämtliche tatsächlich gewählten Codecabhängigkeiten separat pinnen;
ein Projektname allein ersetzt keine Distributionsprüfung.

### 3. EMF+/komplexe Officegrafiken – echter Rendererbedarf bleibt begrenzt

Der aktuelle office-visual-decoder behandelt nur den dokumentierten engen
plain-GDI-/placeable-WMF-Pfad; EMF+, unbekannte Records und eingebettete Bitmaps
werden typisiert ausgelassen. Feste Fonts sind kein originalgetreuer Renderer.
Ein Windows-GDI+-Sonderweg allein erfüllt nicht das gemeinsame Macziel.

Option: erst einen isolierten, identisch getesteten Office-/Draw-Renderer gegen
den bestehenden semantischen Leser vergleichen. SVGskript, Netzwerkressourcen,
Makros und Objektaktivierung bleiben aus. Referenzbilder müssen Glyphen, Text,
Vollbild/Clipping, Rotation und Fontsubstitution abdecken; OCRsicherheit folgt
weiter durch dieselbe normale Inhalts-/Privacykette.

### 4. Zweiter PDFrenderer – vorhandenen Spike beachten, nicht blind doppeln

Es gibt bereits scripts/pdfium-spike.mjs und native/pdfium/pdfium-spike.lock.json:
engineering-spike-only, release_enabled=false, Windows-x64, gepinnte ausdrücklich
inoffizielle Drittanbieterbinärdistribution. Das ist kein freigegebener Mac-
oder RC175-Renderer. Der Produktpfad nutzt weiter PDF.js mit deaktiviertem Eval/
XFA, lokalen CMaps/Fonts/ICC/WASMressourcen und vorhandenen Raster-/OCRgegenfällen.
JBIG2/JPX sind nicht allein deshalb als generell fehlend zu behaupten, weil der
eigene Office-TIFFpfad diese Codecs nicht besitzt.

Ein PDFiumvergleich ist sinnvoll bei nachgewiesenen Font-/Raster-/Decoderfällen,
nicht als versprochener Fix für jede Lesereihenfolge oder fehlende Semantik.
Nur getrennte source-/hashgebundene Prozessrolle, V8=false/XFA=false, keine
fremde Bibliothek in den gehärteten Core laden. Drei native Zielbuilds und
unveränderte Quelltext-/CLOUD-/Positions-/Feldorakel vor Aufnahme.

Primärquellen: [offizielle PDFium-Buildoptionen](https://pdfium.googlesource.com/pdfium.git/+/40f8124e08d9f99a85e08d66dbf13e1b31f15455/README.md),
[PDF.js-Decoder-/Ressourcenbuild](https://github.com/mozilla/pdf.js/blob/master/gulpfile.mjs).

### 5. Layout-/Tabellen-KI als Vergleich, nicht als unbemerktes Ersatzprodukt

Docling ist ein konkreter Kandidat für Layout/Tabellen/Lesereihenfolge. Offline
erfordert vorab gebündelte und gehashte Modelle; MITcode bedeutet nicht, dass
jedes Modell dieselbe Lizenz hat. Offizielle FAQ nennt zudem Intel-Mac-
Abhängigkeitseinschränkungen bei PyTorch/NumPy. Aktuelle CPU-/ARM-/Intel- und
Windows-Artefakte müssen separat geprüft werden, kein pip bei Nutzern voraussetzen.

Marker ist ein weiterer methodischer Vergleich für Block-/Tabellen-/OCRpfade,
mit separatem Inferenz-/Modellbedarf und optionalen LLMs. Seine veröffentlichten
Benchmarkzahlen sind Hersteller-/Projektaussagen, kein Qualitätsbeweis für
DataSecure. Keine Cloud-API, keine Änderung des Suchtext-Erhalts und kein
generierter Name/Zellwert als angeblich exakt gelesene Originalquelle.

Primärquellen: [Docling offline/Intel-FAQ](https://github.com/docling-project/docling/blob/main/docs/faq/index.md),
[Modellvorbereitung](https://github.com/docling-project/docling/blob/main/docs/usage/advanced_options.md),
[MIT-Lizenz](https://github.com/docling-project/docling/blob/main/LICENSE),
[Marker-Methoden und Grenzen](https://github.com/datalab-to/marker),
[aktuelle Marker-Codelizenz](https://github.com/datalab-to/marker/blob/master/LICENSE).
Diese Recherche installiert oder übernimmt keinen dieser Stacks.

### 6. Voller Office-Renderer bleibt eigener Prototyp mit hohem Prüfaufwand

LibreOffice bietet bereits headless Konvertierung auf Windows/macOS; dies ist
eine reale Vergleichsbasis für Vektorgrafiken/Layout und weitere Officeobjekte.
Headless bedeutet jedoch nur ohne Oberfläche, nicht isoliert oder makrosicher.
Frisches eigenes Profil, nie Nutzerprofil übernehmen; externe Links/Templates,
Makros/Objekte, Subprozesse/Fonts/Dateizugriffe und Ressourcen eigens begrenzen.
PDFfallback kann Semantik/Zell-/Formel-/Feldbezüge verändern: nicht einfach die
bisherige sourcegebundene Officeextraktion ersetzen oder Ergebnisse doppeln.

Vorher Korpusvergleich, klare Provenienz jedes Abschnitts, explizite Auslassungen
und Feld-/PII-Gegenproben. Größere Distribution und gemischte Abhängigkeitslizenzen
einkalkulieren. [Offizielle Parameter](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html),
[Projektlizenzen](https://www.libreoffice.org/licenses/).

## Mac-Architekturregel für jede Erweiterung

Kein neues Plugin mit fremdem TeamID in den gehärteten eigenen Core laden und
LibraryValidation nicht abschalten. [Apples Library-Validation-Erklärung](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation)
beschreibt genau diese Grenze. Eine neue getrennte, eng gehashte/prozessisolierte
Rendererrolle muss mit gleichem Source/Modellbestand auf ARM/Intel/Windows
funktionieren und ihre tatsächlichen Abhängigkeiten/Seals nachweisen. Adhoc ist
keine Developer-ID/Notarisierung und garantiert keine Gatekeeper-Erstöffnung.
Keine neue Zertifikats-, Konto-, Rechte- oder Apple-Einreichungsautorität.

## Zusätzlicher unabhängiger Office-Gapreview

Main hat den vollständigen separaten Review unter
dist/rc175-further-office-gap-review-20261024/REVIEW.md gelesen, SHA256
dcc11e5709f0f4bc5941ce64d54826fad02fd5f7f0b4a5b12d95354c10843889.
Tatsächlicher alter d4d5372-Quellstand, keine mit dem danach implementierten
Parserfix neu berechnete Bindung. Sechs weitere konkret belegte Folgepakete:

1. Gespeicherte Word-Feldresultate und ausdrückliche Revisionsansicht statt
   ausgelassener Unterbäume; niemals Felder/DDE/INCLUDETEXT ausführen oder alte
   und neue Werte unbeschriftet vermischen.
2. Tatsächliche Word-Listennummerierung/Startwerte/Neustarts/Stylebindung statt
   pauschalem Bindestrich. Kontext wie 2.3(a) soll nicht verloren gehen.
3. Klassische Excel-Kommentarzelle/Autor, Word-Kommentaranker/Autoren und bislang
   nur passiv ignorierte moderne PowerPoint-Kommentare als je geschlossenes
   Beziehungsmodell. Moderne Excel-Threads sind dagegen bereits implementiert.
4. Excel-RichValues und Bild-in-Zelle: echte Metadaten-/Wert-/Zell-/Medienkette,
   nicht bloß zusätzliche Endungen oder Provider-/IMAGE()-Netzwerkzugriffe.
5. TablePart-/Pivotachsen-/Filter-/Totalskontext ohne sämtliche alten oder
   ausgefilterten Cachewerte auszugeben. Normale gespeicherte Pivotblattzellen
   sind nicht pauschal schon heute unlesbar; keine solche Falschbehauptung.
6. Office-Vorkommensgeometrie: Quellausschnitt, Rotation, Clipping, Gruppen und
   Überlagerung. Ein Bildmedium allein ist nicht die komponierte sichtbare Seite;
   keine native Textlöschung aufgrund eines fehlenden OCRbildworts.

Konkrete Adaptierungsreferenzen: Mammoth
5171a9072f8b7343ab1c9ed3a15d6d372cb59b67 (BSD-2-Clause), Calamine
c922fc0a0c3cc9901e7d0b7a40507140478e5912 (MIT), XlsxWriter
a880ecc15c1573449dba051e5c21025f00c7c9fc (BSD-2-Clause) sowie LibreOffice
c678e1be21149d9473c4c85a1571c47735eb7d77. Das sind Struktur-/Testquellenvorbilder,
keine importierten Produktabhängigkeiten. Keine komplette Mammoth-/Calamine-
Toleranz übernehmen, keine neue Anwender-Pythonruntime für einen Testwriter.

Primärquellen: [Word-Feldresultat](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.simplefield),
[Nummerierungsbindung](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingproperties),
[Excel-Kommentaranker](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.comment),
[RichValues](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/8c1f2a3e-2f7b-4eac-baf0-ef2173648b42),
[Pivotgraph](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-pivottables),
[Bildquellausschnitt](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.sourcerectangle).
Vollständige konkrete Code-/Test-/Risikoverweise im unabhängigen Rohreview.

## Reihenfolge / Beleggrenzen

Zuerst RC175-Parserregression kausal schließen und gemeinsame neue Endgates;
kein veröffentlichter Source01-PASS (dessen Headless-FINAL ist rot). Danach
nach Nutzen/konkretem Korpus priorisieren: sichere PDFstruktur/Lesereihenfolge,
häufige TIFFvarianten, weitere Officequellmodelle; größere Renderer separat
gegen den bestehenden Pfad prototypisieren. Neue gewünschte Formate allein
rechtfertigen keine automatische Ausführung oder Aufhebung harter Schutzfehler.

Unabhängiger Office-Gapreview abgeschlossen und von Main gelesen. Ein zusätzlich
angefragter PDF-Agent konnte wegen Agent-Threadlimit nicht starten; obenstehender
PDF-/Grafikreview stammt tatsächlich von Main, kein erfundenes zweites Fachreview-
PASS. Alle Empfehlungen sind Review-/Backlogstand, keine bereits gebauten neuen
Renderer oder bestandenen menschlichen Format-/Office-/Mac-Desktoptests.

Anschließend tatsächlich abgeschlossener unabhängiger Dokumentgegencheck des
Main-PDF-/Grafik-/Rendererteils: dist/rc175-goal-review-doc-countercheck-20261024/
REVIEW.md, SHA45129f983fcf4d61fe1a065d34ab935595085c24bede50904a849980dd347d90.
Main vollständig gelesen, kein bestätigter sachlicher Blocker. Dies ersetzt
nicht den ursprünglich kapazitätsbedingt ausgefallenen Agentenlauf und ist
keine Produkt-/Pixel-/Security-/Paketabnahme. Die selbst verfasste Office-Liste
war ausdrücklich nicht Gegenstand seiner unabhängigen Freigabe. Bei LibTIFF
bleiben Spiegelung/90-Grad-Drehung und vertauschte Maße für Orientierungen2–8
eigenständig zu modellieren und zu testen; keine pauschale API-Erfolgsgarantie.
