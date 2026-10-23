# Inhaltsabdeckung und lesbares Markdown nach RC171

Stand: 23.10.2026, Nutzerauftrag **Backlog und Analyse**, noch keine Umsetzung.
Nachfolgeauftrag am selben Tag: Umsetzung/Reviews/Tests und RC172 beauftragt;
aktuelles Journal in [RC172_SHARED_RELEASE_20261023.md](RC172_SHARED_RELEASE_20261023.md).
Die Analysebefunde darunter bleiben mit ihrem damaligen Quellenstand erhalten.
Gemeinsame Produktquelle `00c328dedeb097bf4abc50815773e2e7ae5da320` bleibt unverändert.
Referenz: BL-049.2, mit Bezug zu BL-022 (OOXML), BL-024 (OCR), BL-047
(Ressourcensteuerung) und BL-050 (Qualitätsgegenfälle).

## Auftrag und weiter geltende Entscheidungen dieses Chats

Ziel ist möglichst vollständiger, für Menschen und nachfolgende Textverarbeitung
brauchbarer Inhalt aus Word, Excel, PowerPoint und PDF. Keine pauschale Zusage,
dass beliebige beschädigte, verschlüsselte oder aktive Dateien verlustfrei lesbar
sind. Der sinnvoll und sicher gewonnene Text soll erhalten bleiben; konkret
fehlende Inhalte, nicht unterstützte Grafikformate und erreichte Grenzen müssen
verständlich sichtbar bleiben. Ein einzelner nicht lesbarer Bildbestandteil
soll nicht automatisch den sonstigen unabhängigen Text vernichten.

Ausdrückliche Entscheidung: vorhandene PDF-Suchtexte erhalten, nicht durch einen
automatischen Modus „nur sichtbarer Inhalt“ ersetzen. Keine alphabetbasierte
Bereinigung: Umlaute, ß, fremdsprachige Buchstaben, Fachbegriffe, IDs, Formeln,
Zahlen und gültige Markdownsyntax bleiben. Unsichere OCR nicht semantisch erfinden
oder still auslassen. Lesbare Originaltexte haben Vorrang vor OCR-Duplikaten.

Alle früheren bestätigten UX-/Funktionsentscheidungen bleiben Bestandsschutz:
Ordner-OCR-Label einschließlich Unterordnern/zugeklappten Zeilen, getrennte OCR-
Option und verständliche manuelle/automatische Maskierung, stabile Verarbeitung
ohne Flackern, geordnete Verlaufsaktionen, fortsetzbare Prüfung/Nachbearbeitung,
korrekte Unicodepositionen und automatische Ergebnisbereitstellung ohne erneuten
separaten Freigabe-/Exportdialog. Öffentliche fertige Arbeitskopien bleiben
bearbeitbar, private Prüfnachweise unverändert. Vertrauliche Datei-/Pseudonym-
Zuordnungen bleiben erhalten; Excel zeigt auf Blatt 1 dieselben eindeutigen
Pseudonyme, Originalwerte, Typen und Vorkommen wie TXT. Neue Extraktionsarbeit
darf diese erreichten Funktionen und die bestehenden synthetischen Testpakete
nicht zurückbauen. Frühere Akzeptanzdokumente sind deren historische Belege,
keine neue Aufforderung, sämtliche alten Aufgaben nochmals auszuführen.

Windows und beide Macs sollen dieselbe fachliche Implementierung bekommen.
Keine Developer-ID, Zertifikatssuche, Notarisierung oder Apple-Einreichung.
Keine Gatekeeper-/Hardened-Runtime-/Core-Library-Validation-Abschaltung, keine
fremdsignierte dynamische Guardladung oder externer Lockkeeper. Fehlende Apple-
Signierung erklärt die bestätigten Parser-/Budgetlücken nicht. Neue native
Decoder/Renderer brauchen trotzdem eigene Build-, Sealing- und Zielhostnachweise.
Desktopabnahmen bleiben gesondert und dürfen nicht aus Quellenmodellen folgen.

## Nachgewiesener vorheriger PowerPoint-Gegenfall

Eine lokale Originalpräsentation wurde mit und ohne OCR verglichen. Sensible
Originale/MD, genaue Pfade und Analysehelfer bleiben ausschließlich unter dem
ignorierten `dist/rc171-user-pptx-md-comparison-20261023/`, nicht in Git/CI.

- Native 783 nichtleere Folienabsätze und 128 Notizabsätze sind textuell in ihren
  jeweiligen Abschnitten wiederzufinden. Das ist kein Beweis vollständiger
  grafischer oder semantischer Abdeckung.
- SmartArt auf Folie 34: 19 nichtleere Diagrammabsätze fehlen im Folienabschnitt
  beider MDs; 18 fehlen auch im gesamten Dokument. Separate `data1.xml` und
  `drawing1.xml` sind zwei Darstellungen derselben Inhalte, nicht doppelt zählen.
- Lesbare Kontexttexte eingebetteter Grafiken fehlen auch mit OCR, unter anderem
  Rollen-/Kompetenztabelle, ProjectBoard und Projektstatus-/Prozessdarstellungen.
- OCR-aus-MD ist exakt der 62.131-Byte-Präfix der 62.548-Byte-OCR-an-MD.
  Die zusätzlichen 417 Byte enthalten überwiegend unlesbare Erkennungsfragmente,
  aber auch einzelne sinnvolle Bildtexte: keinen ganzen Anhang blind löschen.
- Beide MDs enthalten 947 aufeinanderfolgende Leerzeilen, 18 Layout- und zwei
  Masterabschnitte mit Editor-/Vorlagenplatzhaltern sowie technische Metadaten.
  Echte Notizen, Diagrammlabels oder sichtbare geerbte Texte sind nicht automatisch
  Artefakte. Keine globale Löschung anhand von Wörtern wie „Master“ oder Einzellauten.

## Bestätigte technische Ursachen und Grenzen

`ooxml.js` liest normale Folien, Tabellen, Notizen, Chartwerte und erreichbare
Layout-/Mastertexte, aber keinen eigenen SmartArt-Datenmodellpfad. Sichere
Bildbeziehungen enden in einem deduplizierten Target-Set ohne Folien-/Shape-
Vorkommens-/Positionsmodell. `office-image-ocr.js` erlaubt nur PNG/JPEG/BMP und
hängt OCR-Texte gesammelt ans Ende. SVG-`svgBlip` wird nicht als eigener zusätzlicher
Bildpfad erschlossen. Reader und Decoder müssen gemeinsam erweitert werden.

Aktuelle Grenzen nicht verwechseln: 150 Bildassets, 30 MiB Assetbytes,
25 MiB je Bild, 30 Mio. Pixel sowie separate Text-/Kontakt-/CPU-/Walltimegrenzen.
Der Teilbildplaner zählt Pixel kumulativ über das Dokument. Reihenfolge ist die
ZIP-Entry-Map, keine fachliche oder garantierte Folienreihenfolge. Große frühe
Bilder können spätere relevante Grafiken verdrängen. Reine read-only Nachstellung
am Original: 52 zugelassene Bildkandidaten, 23 planbar, vier EMF nicht unterstützt,
25 Ressourcen-Auslassungen einschließlich der betroffenen Fachgrafiken. Die native
Textausgabe bindet exakt die OCR-aus-MD. Keine neue OCR-Ausführung daraus ableiten;
der historische aggregierte Laufbeleg benennt nicht jedes ausgelassene Bild.

Vorhandene Qualitätslogik ist keine universelle Lesbarkeitsprüfung: Symbolfilter
entfernt eng definierte Steuer-/Privat-/Ersatzsymbolreste; gültiger lateinischer
Buchstabensalat passiert ihn. OCR-Geometrienachprüfung und Kontaktwarnungen
bleiben nützlich, beweisen aber keine Inhaltsvollständigkeit.

## Geplanter Arbeitszuschnitt und Abnahmekriterien

1. **Native Inhalte zuerst:** SmartArt-/Drawing-Daten über explizite interne
   Beziehungen lesen, Reihenfolge/Hierarchie übernehmen, sichere Fallbacks und
   Duplikatvermeidung für Data/Drawing/AlternateContent. Folie/Absatz/Blatt und
   konkrete Vorkommen erhalten; nicht nur alle XML-Texte ungeordnet einsammeln.
2. **Vorkommensmodell:** Bildinhalt per Hash cachen, Ausgabe aber pro tatsächlich
   zugehöriger Folie/Position. Herkunft, Format, native/OCR-Quelle und feste
   Auslassungsgründe pro Element. Keine erfundene Foliennummer aus Bildordinal.
3. **Ressourcen fair und begrenzt:** sequentiell dekodieren/rasterisieren/OCR,
   Speicher danach freigeben. Spitzen-RAM, Einzelbildgrenze und gesamtes Arbeits-
   und Zeitbudget getrennt. Größenänderungen erst mit Messungen/Gegenfällen;
   keine unbeschränkten Retries oder bloß hochgesetzten globalen Konstanten.
   Sichtbare Fortschritte/konkreter Teilstatus; große frühe Bilder dürfen nicht
   aufgrund zufälliger ZIP-Reihenfolge alle späteren Textgrafiken verdrängen.
4. **Sichere Formaterweiterung:** SVG inklusive reiner SVG-Blips, zusätzliche
   Rasterformate und Mehrseiten-/Framefall ausdrücklich spezifizieren. EMF/WMF
   und Gesamt-Office-Rendering als gesonderte Lizenz-/Sicherheitsentscheidung.
5. **OCR-/Markdownqualität:** Textregionen, Auflösung, Segmentierung und
   belastbare Warnungen verbessern. Unsichere Namen/Kontakte nicht automatisch
   durch Wörterbuch/KI „korrigieren“. Leerlauf-/Vorlagenballast gezielt im eigenen
   Renderer reduzieren, nicht nachträglich echte Nutzer-TXT/MD/Code umschreiben.
   Technische Metadaten getrennt/optional, wichtige geerbte sichtbare Texte behalten.
   PDF-Spalten und Label-/Wertbeziehungen räumlich erhalten; vorhandenen Suchtext
   nicht mit einer zweiten fehlerhaften OCR-Version wiederholen. Excel-Zahlenformate
   und Einheiten modellieren, nicht nur Rohwerte/Formeln; leere formatierte Bereiche
   ohne Informationsverlust kompakt darstellen. Word-Tabellenzellen mit Spans brauchen
   ein logisches Raster, keine blind verschobenen Markdownspalten.
6. **Gleiche Schutzkette:** alle neu gewonnenen Texte VOR Anonymisierung in
   Positions-, Identitäts-, Restprüfungs- und Ergebnisbindung aufnehmen. Keine
   ungeprüfte nachträgliche Ergänzung anonymisierter öffentlicher Dateien.
   ZIP-/XML-/Pfad-/I/O-/Ownership-/Guard-/ACK-/Residualgrenzen erhalten. Externe
   Links, lokale Dokumentverweise, Makros/JavaScript/OLE nicht ausführen/nachladen.
7. **Nachweise:** synthetische regressionsfähige Gegenfälle aus den gefundenen
   Fehlerklassen, keine echten Personaldaten als Fixture. SmartArt muss mit/ohne
   OCR erhalten sein, Bildtext nur bei aktivierter OCR. Mindestens Rollen-/Tabellen-
   und Prozesskontext, wiederverwendete Bilder/Diagramme, unübliche Namespaces,
   Zyklen/falsche Relationen, große Reihenfolgevarianten, Mehrseitenraster,
   Grenzen/Abbruch, Umlaute/ß/weitere Sprachen, Suchtext-/OCR-Duplikate, beide
   Produktzwecke, Nachbearbeitung/Restart und unveränderte Originale prüfen.
   Fachgegenreview, drei native Targets und separate menschliche Desktopabnahme.

## Geprüfte Open-Source-Ansätze und Rendererentscheidung

Noch keine Komponente installiert, übernommen, ausgeführt oder für Release
freigegeben. Quellenstände sind Recherchepins, keine geprüften Dependencyupdates.
Lizenztexte, NOTICE/SBOM, benötigte Fonts/Modelle und transitive Bestandteile müssen
vor Übernahme geprüft und reproduzierbar gepinnt werden.

| Inhalt | Kandidat und Rolle | Entscheidung / offene Arbeit |
| --- | --- | --- |
| SmartArt / Office-Struktur | OfficeParser `readDiagram`, TypeScript, MIT; liest `ptLst`, `cxnLst`, `parOf` samt Reihenfolge | Bevorzugt eng in unseren sicheren OOXML-Leser portieren. PPTX/DOCX-Integration vorhanden, XLSX-SmartArt extra. Cache nicht mit globaler Ausgabededuplikation verwechseln. Keine automatische Rekonstruktion aller Pfeilsemantiken. |
| SVG | usvg/resvg, Rust oder WASM, Apache-2.0 oder MIT | Statisches SVG zu Pixeln, dann lokale OCR. Default-Dateiresolver ausdrücklich ersetzen: nur freigegebene In-Memory-Paketbytes, keine lokalen/externalen Dateien/Fonts nachladen. Kein Browser-/Script-/Animationsversprechen. |
| GIF / TIFF / WebP | gezielte image-rs-Decoder, MIT oder Apache-2.0 | Kein OCR-Ersatz. Frames/Seiten einzeln begrenzen und verarbeiten; nicht still nur erstes Bild. Geeigneten Release/API auswählen, keinen Entwicklungs-Main blind bündeln. |
| EMF / WMF | libemf2svg plus SVG-Renderer; libwmf | Noch keine Standardfreigabe. Native C-/Fontabhängigkeiten und GPLv2-/LGPL-/Drittbestandteile klären; EMF+ enthält unvollständige Recordhandler. Unbekannte Records konkret ausweisen. |
| PDF | bestehendes gepinntes PDF.js plus lokale Canvas/OCR | Suchtexte erhalten, Boundingbox-/Quellabgleich für zusätzliche OCR. Kein unnötiger PDF-Enginewechsel. MuPDF wäre AGPL-/kommerziell lizenzierte Alternative, kein lizenzneutraler Tausch. |
| Vollständiges Office-Seitenrendering | optional LibreOffice headless zu PDF, danach vorhandene PDF-Pipeline | Große Zusatzengine, kein vorausgesetztes vorhandenes Office. Extra Profil, deaktivierte aktive/externe Inhalte, Prozesslimits, Update-/Packagingkonzept. Layoutabweichungen und native Macgates offen. |

### Tatsächlich gelesene Primärquellen

- [OfficeParser SmartArt, fester Stand](https://github.com/harshankur/officeParser/blob/115486b2af0772fb0e6812ef5f196b1fd656d09d/src/utils/diagramUtils.ts)
- [OfficeParser MIT-Lizenz](https://github.com/harshankur/officeParser/blob/115486b2af0772fb0e6812ef5f196b1fd656d09d/LICENSE)
- [MarkItDown PPTX-Converter als Platzierungsmuster, kein SmartArt-Komplettfix](https://github.com/microsoft/markitdown/blob/7482c092d9c0074a89803c9fdb63a969e7fe17fc/packages/markitdown/src/markitdown/converters/_pptx_converter.py)
- [MarkItDown OCR-Zusatz ruft Vision-API auf, nicht unverändert offline übernehmen](https://github.com/microsoft/markitdown/blob/7482c092d9c0074a89803c9fdb63a969e7fe17fc/packages/markitdown-ocr/src/markitdown_ocr/_ocr_service.py)
- [SmartArt2md als zweite Parserreferenz, Alpha, Apache-2.0](https://github.com/PPTX2Markdown/SmartArt2md/tree/e0b83b0cfe13e986bfe724b2d2f81e768339e282)
- [resvg Render-API](https://github.com/linebender/resvg/blob/5192641d4fd67aef5c0c4d667d570e338da15361/crates/resvg/src/lib.rs)
- [usvg Bildresolver mit standardmäßig möglichem Dateizugriff](https://github.com/linebender/resvg/blob/5192641d4fd67aef5c0c4d667d570e338da15361/crates/usvg/src/parser/image.rs)
- [image-rs Features/Lizenz](https://github.com/image-rs/image/blob/075e65d618a323e5cb48c1d8710a2eca25d690c6/Cargo.toml)
- [EMF-Reader](https://github.com/kakwa/libemf2svg/blob/658a718de180666d342a78fd4046ec1f41e65e17/src/lib/emf2svg.c)
- [EMF+-Handler und Grenzen](https://github.com/kakwa/libemf2svg/blob/658a718de180666d342a78fd4046ec1f41e65e17/src/lib/pmf2svg.c)
- [WMF-Konverter](https://github.com/caolanm/libwmf/blob/d66567b90190eb3e326426f5a5113cfe3f40fc37/src/convert/wmf2svg.c)
- [LibreOffice PDF-CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html)
- [LibreOffice Lizenzinventar](https://www.libreoffice.org/licenses/)
- [MuPDF Lizenz](https://mupdf.readthedocs.io/en/1.28.5/license.html)
- [Tesseract Bildqualität/Skalierung/Segmentierung](https://github.com/tesseract-ocr/tessdoc/blob/main/ImproveQuality.md)

## Zusätzlicher ausgewählter Mehrformatlauf am 23.10.2026

Status: **abgegrenzte Analyse abgeschlossen**, kein vollständiger visueller oder
semantischer Inhalts-PASS. Die angehängte Auswahl enthält 117
Dateien: 63 PDF, 35 XLSX, fünf PPTX, 14 DOCX. Alle Originale eindeutig gefunden.
107 MD-Dateien sind vorhanden, keine zusätzlichen MD außerhalb der Auswahl;
alle 107 passen bytegenau zu Batch- und Exportbelegen. Zehn Dateien sind im
gespeicherten Lauf ausdrücklich gestoppt: sechs XLSX mit dem Fehlercode
`SOURCE_ACTIVE_CONTENT_UNSUPPORTED`, eine Compound-Binary-XLSX, zwei verschlüsselte
PDF und eine DOCX mit `DOCX_STRUCTURE_UNSAFE`. Die Fehlercodes sind keine pauschalen
Beweise für gefährliche oder beschädigte Quellen; konkrete Ursachen siehe unten.
Aktuelle Originalhashes stimmen bei allen 110 im Batch gehashten
Quellen; für sieben vor Snapshot gestoppte Quellen existiert kein solcher Hash,
deren Herkunft nicht als bytegebundener Privatkopiennachweis ausgeben.

Vollständige Auswahl, Zuordnung, Hashes, Status und inhaltliche Detailbefunde
bleiben lokal im ignorierten `dist/rc171-user-bulk-comparison-20261023/`.
Keine Nutzernamen, Vergabeinhalte, Personalprofile, echten Originale/MD oder
rohen Laufdiagnosen in dieses versionierte Dokument übernehmen.

### Neue bestätigte Fehlerklassen und Umsetzungsaufträge

1. **BL-049.2-A: moderne Excel-Kommentare/Autoren.** Bei sechs gestoppten XLSX
   reproduziert die unveränderte read-only Quellprüfung den aufgezeichneten
   Active-Content-Code, obwohl `active_content=false` ist. Tatsächlicher Auslöser:
   nicht unterstützte `2017/10/relationships/person` und `threadedComment`.
   Entfernt man ausschließlich diese Kanten in einer separaten Speichergegenprobe,
   besteht die übrige OPC-Kontrollprüfung bei allen sechs. Keine Quelldatei geändert,
   kein Konvertierungs-/Sicherheits-PASS daraus. Die vorhandene Drucker-Binärdatei
   ist nicht der bestätigte Auslöser. Für Umsetzung präzise interne Eigentümer-,
   Ziel-, Content-Type-/Größenprüfung, Autoren-/Kommentarsemantik und ehrliche
   Abdeckung festlegen; nicht beliebige Microsoft-URIs pauschal erlauben.
2. **BL-049.2-B: Word-Zellverbindungen.** Ein gestopptes DOCX enthält gewöhnliche
   `gridSpan`-Zellverbindungen in ansonsten unabhängig lesbaren XML-Teilen. Der
   Produktleser stoppt hierfür ausdrücklich. Logische Zeilen-/Spalten-/Headerbindung
   mit Spans implementieren oder präzisen sicheren Teiltext ausgeben; die
   Abbruchbedingung nicht ohne Ersatz löschen. Keine Behauptung, jedes andere
   nicht ausgeführte Parserhindernis sei damit ausgeschlossen.
3. **BL-049.2-C: PDF-/Bild-OCR und räumlicher Kontext.** 61 erzeugte PDF-MDs
   decken 1.098 Seitenüberschriften und die geprüften längeren nativen Textzeilen ab.
   Trotzdem bestätigte falsche OCR-Zweitfassungen von Adressen/technischen Werten,
   QR-/Foto-/Signaturrauschen, vermischte mehrsprachige Spalten sowie verlorene
   Label-/Wertzuordnungen. 43 Dokumente sind automatische Duplikatkandidaten,
   nicht 43 vollständig visuell bestätigte Fehler. Bildregionen/Lesereihenfolge,
   native/OCR-Geometrieabgleich und konkrete Herkunft verbessern; gültige zusätzliche
   Rastertexte nicht mit dem ganzen OCR-Anhang entfernen. Auch Word-Portraits
   erzeugen bedeutungslose Fragmente. Keine Wörterbuch-/KI-Erfindung von Namen.
4. **BL-049.2-D: Excel-Inhaltsdarstellung.** Fünf Template-MDs enthalten je 9.879
   völlig leere Tabellenzeilen bei nur 373 nichtleeren Quellzellen; weitere fünf
   je 1.748. Leere Formatbereiche kompakt darstellen, logische Zellkoordinaten und
   Abstände/Tabellenbeziehungen erhalten. Zahlenformate werden derzeit nicht
   dargestellt: Prozentformat liefert etwa den gespeicherten Rohwert statt der
   formatierten Prozentanzeige. Datums-, Prozent-, Währungs-/Einheitenformate
   berücksichtigen, Formeln nicht ausführen, gespeicherte Werte und gegebenenfalls
   fehlenden/ungeprüften Cache ehrlich kennzeichnen. Allgemeine Rohtext-Präsenz
   ist kein Beweis korrekter numerischer Bedeutung oder aktueller Berechnung.
5. **BL-049.2-E: Inhaltsmodus statt Vorlagenballast.** PPTX enthält übernommene
   Master-/Layout-Editorplatzhalter und wiederholte Metadaten; DOCX enthält lange
   Leer-/Indentationsentity-Blöcke. Gezielte quellbasierte Darstellung verbessern.
   Ein wie Buchstabensalat wirkendes Wort ist in mehreren Profilen bereits echter
   nativer Vorlagentext; deshalb keine allgemeine „fremde Zeichen/Wörter löschen“-
   Funktion. Die fünf neuen PPTX-Templates enthalten keine SmartArt und widerlegen
   den früheren SmartArt-Gegenfall nicht. Zwei EMF je betroffenem DOCX bleiben
   nicht gerendert; ihr Inhalt wurde nicht als unwichtig oder abgedeckt erklärt.
6. **BL-049.2-F: Schutzstatus präziser erklären.** Die Compound-Binary-Datei enthält
   `EncryptedPackage`/`DRMEncryptedDataSpace`/`DRMEncryptedTransform`, nicht einfach
   eine falsch benannte alte XLS-Datei. Zusammen mit zwei verschlüsselten PDFs sind
   dies echte Schutz-/Entschlüsselungsgates, kein fehlender Grafikrenderer.
   Schutz nicht umgehen und keinen lesbaren Inhalt erfinden. Verständliche Ursache
   und nötige berechtigte entschlüsselte Kopie nennen. Erkennung von Verschlüsselung,
   Ressourcengrenze, nicht unterstützter Struktur und echter Beschädigung trennen.

Korrekturen der eigenen Analyse sind erhalten: 151 scheinbar fehlende Excel-
Textzellen und 20 scheinbar fehlende Word-Absätze lösten sich durch korrektes
Normalisieren der erzeugten `<br>`-Zeilenumbrüche auf. Keine Produktfehler daraus
ableiten. Alle 117 Originale und alle 107 MDs am Analyseende erneut hashgleich,
Auswahlliste und Batch unverändert. Keine neue App/OCR-Konvertierung, Reparatur,
Entschlüsselung, Office-Automation, Produkt-/Teständerung oder Freigabe.

Die 107 Ergebnisbelege tragen konservativ `incomplete`; das ist nicht gleichbedeutend
mit 107 bewiesenen Inhaltsverlusten. Native Textpräsenz wurde systematisch geprüft,
sechs PDF-Seiten und ausgewählte eingebettete Raster grafisch gegengeprüft, nicht
alle 1.098 Seiten oder jede Office-Seite vollständig gerendert/visuell abgenommen.
Keine nativen PDF-Formularfelder/Widgets im Stichprobenkorpus; Formularabdeckung
daraus nicht ableiten. Kein verfügbares gebündeltes LibreOffice auf diesem Host.

Zusätzliche Primärreferenzen:

- [Microsoft XLSX-Erweiterungsschema einschließlich Threaded Comments](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/6624db33-496c-47f7-a562-a54cb01b133f)
- [Microsoft Office-Kryptografie: EncryptedPackage/DRM-Datenraum](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-offcrypto/fdfee56f-5ce1-46bd-ab2f-f62d5b4768fb)
