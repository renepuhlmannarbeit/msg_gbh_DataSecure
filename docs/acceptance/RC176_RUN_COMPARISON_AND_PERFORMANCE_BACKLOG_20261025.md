# RC176: tatsächlicher Laufvergleich und Performance-Folgearbeit

Stand: 25.10.2026. Nutzerauftrag: großen echten Markdownlauf gegen Originale und
Diagnose prüfen, die fünf Performancepunkte dauerhaft festhalten, besonders die
Wiederverwendung revalidieren und konkrete Umsetzungslösungen bestimmen.
**Analyse und Backlog, noch keine Produktimplementierung oder neue Version.**
Windows und beide Macs gehören zum späteren gemeinsamen Umsetzungsumfang.
Desktopbedienung bleibt beim Nutzer; keine neue Automation oder Mainintegration.

## Tatsächlicher Stand und Grenzen des Vergleichs

Geprüft ist der abgeschlossene Lauf `Lauf-20261025-200217-77008b67` mit
Appcommit `706c1fad6fbf26bf6745768c0d6a5bd4fc48040b`, Inhalts-Markdown und
aktivierter Scan-/Bild-OCR. 119 Eingaben: 64 PDF, 35 XLSX, 14 DOCX, sechs PPTX.
114 MD-Dateien und fünf dateibezogene Stopps. Sämtliche Originale/Eingabekopien
stimmen mit den vorbereiteten Hashes überein; alle 114 sichtbaren Ergebnisse
passen zu den tatsächlichen Abschlussbelegen. Keine fremden Zusatzdateien.
Die aktuelle Anonymisierung wurde in diesem Nur-Markdown-Lauf nicht geprüft.

Die aktuellen nativen und Sidecar-Interaktionsprotokolle wurden lokal gelesen
und ihre vollständigen JSONL-Zeilen als private Momentaufnahme gesichert. Das
ältere Diagnosepaket in Downloads stammt vom 21.10. und wurde nicht als Beleg
dieses Laufs verwendet. Der aktuelle Sidecar zeigt in der Aufnahme keinen
fehlgeschlagenen IPC-Antwortdatensatz. Ein späterer nativer Ordneröffner meldet
nach bestätigter Übergabe einen Helperfehler; das beweist keinen MD-Verlust und
ohne Exitursache/OS-Beobachtung auch nicht, ob der Explorer den Ordner anzeigte.

Alle detaillierten Original-/MD-/Protokolldaten, Namen, Pfade, Textbeispiele und
Bildbelege bleiben ausschließlich in ignorierten privaten Verzeichnissen:
`dist/rc176-user-run-77008b67-{review,pdf-review,office-review,pptx-review}-20261025`.
Keine echten Dokumente, Diagnosen, Arbeitsprofile oder Zuordnungen in Git/CI/
Releases aufnehmen. Frühere rote Prüfungen und korrigierte Audit-Vorläufe bleiben
erhalten. Vergleichsnormalisierung ist keine Änderung der tatsächlichen Dateien.

## Bestätigte Ergebnisse und konkrete Folgeaufgaben

| Bereich | Tatsächlicher Befund | Konkrete Umsetzung und Abnahme |
| --- | --- | --- |
| Zwei XLSX-Stopps | Unverschlüsselte, bildlose Dateien mit 28 bzw. 40 gefüllten Textzellen wurden als `CONVERSION_OCR_TEXT_EMPTY` verworfen. Zwei `_x0002_`-Sequenzen in Shared Strings werden zunächst zu U+0002 dekodiert und dann durch die XML-Zeichenprüfung verworfen. Danach gehen Shared-String-Teil und Blatt verloren; der Endcode verschleiert den Grund. | Schemaabhängige ST_Xstring-Projektion von roher XML-Validierung trennen. Nicht druckbare dekodierte Zeichen sicher repräsentieren; keine rohen C0-Zeichen in Markdown/Transport und keine Wortverklebung. Unabhängige Strings/Zellen mit stabilen Originalindizes erhalten. Tatsächliche Text-/Zellursache bis zur UI weiterreichen. Abnahme: beide echten Dateien ergeben brauchbare MDs; synthetische Literal-Escapes, Rich-Text-Grenzen, rohe ungültige XML-Zeichen und Anonymisierung/Nachbearbeitung bleiben korrekt. |
| Drei geschützte Eingaben | Zwei gleiche PDFs haben ein echtes Verschlüsselungswörterbuch. Die dritte XLSX enthält `EncryptedPackage` und DRM-Datenspeicher. Eine einfache Öffnungspasswortpflicht wurde damit nicht bewiesen. | Verschlüsselung/Rechteverwaltung als passende Ausnahme erhalten. Öffnungspasswort, Besitzer-/Berechtigungsschutz und DRM sprachlich unterscheiden, soweit wirklich nachgewiesen. Keine Passwortsuche, kein Crack und keine automatische Entschlüsselung. |
| Andere Word-/Exceltexte | 1.939/1.939 unabhängige Word-Absätze vorhanden. 32 XLSX-Ergebnisse: 10.396 gespeicherte Zellwerte ohne bestätigte native Wertauslassung; 5.745 Textwerte zusätzlich am richtigen Blatt/Zellbezug geprüft; 200 klassische Kommentare vorhanden. 6.536 Formelzellen besitzen gespeicherte Caches. | Diese Gegenbelege erhalten. Keine Neuberechnung oder perfekte Bildschirmtreue behaupten. Lange Zell-/Kommentarprojektionen auf fachlichen Nutzen prüfen, Inhalte nicht pauschal entfernen. Auffälliger Text stammt teils bereits aus Originalprofilen. |
| Native PDFtexte | Außer der schwierigen Präsentation: 61 Ergebnisse mit 1.098 Seitenblöcken; alle geprüft langen 27.664 nativen Quellzeilen nach erklärter Vergleichsnormalisierung im passenden Seitenabschnitt auffindbar. Zusätzlich 44/44 Seiten der Präsentations-PDF gelesen. | Vorhandene Suchtexte erhalten. Keine allgemeine Zeichen-/Sprachfilterung, ungeprüfte Rechtschreibkorrektur oder Löschung unsichtbarer nativer Texte. Die Messung beweist Textanwesenheit, nicht vollständige Grafik-/Formular-/Lesereihenfolge. |
| PDF-Dopplungen | In 990/1.098 Nicht-Präsentations-Seitenblöcken maschinelle Kandidaten für zusätzliche Wiederholungen langer nativer Zeilen. An ausgewählten Originalseiten visuell bestätigt; auch widersprüchliche OCR-Abschriften vorhandener Signatur-/Anlagenhashes. Die Präsentations-PDF zeigt dieselbe Schwäche. | Native Texte als unveränderte Basis erhalten; zusätzliche OCR nur mit konkreter Seiten-/Regionherkunft abgleichen. Nur geometrisch und inhaltlich bewiesene Dopplungen entfernen. Unklare Ergänzungen getrennt kennzeichnen. Den teuren Mehrfachrenderpfad und seinen tatsächlichen Nutzen gemeinsam verbessern. Keine globale/fuzzy Wortlöschung. |
| Spalten und Tabellen | Eine gemischte Ticketseite verliert die vier Label-/Wertpaare; eine dreisprachige Scanurkunde wird zeilenweise sprachübergreifend vermischt. Alle Wörter allein ergeben keinen richtigen Zusammenhang. | Begrenztes Regionen-/Spalten-/Zellmodell aus belegten Linien, Glyphpositionen und Weißräumen; explizite Label-/Wertpaare oder getrennte Spalten ausgeben. Bei Unklarheit neutraler nachvollziehbarer Fallback statt erfundener Tabelle. Keine globale XY-Sortierung aller PDFtexte. |
| PowerPoint und SmartArt | Alle sechs PPTX gelesen. Kleine Vorlagen jeweils 44 Folien-/vier Notizabsätze vorhanden. Schwierige Präsentation: 783 Folienabsätze, 128 Notizabsätze, 19 SmartArttexte und zwei moderne Kommentare samt Autoren im richtigen Folienabschnitt. SmartArt bleibt dennoch eine flache Liste: 14 Details gehören laut tatsächlichem Graph und visueller Quelle in Gruppen 3/3/3/3/2 unter fünf Phasen. | Geordnete Baumprojektion aus echten Datenknoten und `parOf`-Kanten/`srcOrd` statt XML-Punktreihenfolge. Echte Eltern-/Kindbezüge und Reihenfolge testen; Zyklen, Mehrdeutigkeit und Übergangsknoten begrenzen. Herkunft/Absatzspannen durch Anonymisierung und Nachbearbeitung erhalten. |
| Kleine Grafiktexte | In zwei tatsächlich lesbaren Screenshots nur 3/13 bzw. 0/10 gezielt geprüfte Beschriftungen verständlich übernommen; andere Bilder liefern echten Zusatztext. QR-/Foto-/Signaturbereiche erzeugen Rauschen. | Texttragende Bildregionen und kleine Schriften gezielt segmentieren; begrenzte Regions-/Mehrskalenproben evaluieren. Native Pixel und Koordinaten erhalten, dokumentweites Budget berücksichtigen. Keine Fotos/Sprachen pauschal ausschließen, keine Wörter aus Sollwissen ergänzen. Unsicherheit genau an Grafik/Seite ausweisen. |
| SVG/EMF | Alle 49 Rasterassets der schwierigen PPTX unabhängig dekodierbar. Drei EMFs sind degenerierte Header-/EOF-Hüllen ohne darstellbaren Inhalt; ein viertes nutzt unmodellierte Records. 38/41 wohlgeformte SVGs enthalten derzeit ausgeschlossene eingebettete `style`-Elemente. | Leere/degenerierte Medien, unbekannte Records, begrenzte CSS-Unterstützung und tatsächlich beschädigte Daten getrennt benennen. Eine geschlossene statische lokale SVG-CSS-Projektion anhand der tatsächlich vorkommenden Selektoren/Eigenschaften prüfen; keine externe Ressource, allgemeine CSS-/Skript-Ausführung oder Freigabe ungültiger EMFs. |
| Bildbudget und Hinweise | `IMAGE_PROCESSING_LIMIT` trennt Verkleinerung und Auslassung nicht; frühe Vektormaße können unbekannt sein. Aggregierte Hinweise liefern keine genaue Asset-/Limitursache. | Sichere Vektormaße vor Budgetverteilung ermitteln, pro Grafik/Seite Ursache und Umfang ausweisen: verkleinert, ausgelassen, leer, nicht unterstützt oder beschädigt. „Ganze Quellgrafik verarbeitet; OCR-Inhalt ungeprüft“ statt missverständlicher Inhaltsvollständigkeit. |
| Ordnerstruktur | 51 Quelllabels verlieren gegenüber der ausgewählten Ordnerwurzel den ersten Teil, 48 davon mit MD. Kein Datei-/Byteverlust: die Ergebnisbelege passen zu genau diesen Labels. `batchQueueFromSelection` ersetzt bei doppelten Basenames auch bereits eindeutige relative Ordnerlabels. | Bereits gültige eindeutige Ordnerlabels erhalten. Nur echte Labelkollisionen bei Mehrfachauswahl gezielt auflösen; Originalpfad und gegebenenfalls verkürzten Ausgabepfad getrennt binden. Windows-Pfadlängen, Groß-/Kleinschreibung und Mac-Gegenfälle prüfen. |

Die visuellen Proben sind begrenzt. Nicht sämtliche 1.142 PDF-Seiten oder alle
Officeansichten wurden gerendert. Drei der vier neuen Nicht-Präsentations-
Quellrenderings melden fehlende Displayfonts Symbol/ArialUnicode; exakte
Symbolglyphentreue ist damit nicht belegt. Pypdf prüft beim normalen Öffnen
intern ein leeres Passwort; es wurden keine Kennwörter geraten oder geschützte
Seiteninhalte ausgelesen. Diese Grenzen dürfen nicht als Fehler des Originals
oder vollständige visuelle/Anonymisierungsabnahme umgedeutet werden.

## Die fünf Performancepunkte, dauerhaft festgehalten und revalidiert

| Punkt / Backlog | Entscheidung | Umsetzungsgrenze |
| --- | --- | --- |
| 1 / BL-047.2: wiederholte Extraktion | **Für den ersten großen Lauf vorerst den getrennten Prozessweg erhalten.** Neun identische Zusatzvorkommen verursachten zusammen nur 7.731 ms Konvertierung, etwa 0,38 % des Blocks. Ein aufwendiger allgemeiner Dateicache hat dafür geringe Priorität. Die spätere Wiederverwendung zwischen Nur-Markdown und Anonymisierung bleibt separat sinnvoll zu evaluieren. | Nur einen unveränderlichen, nachweislich abgeschlossenen neutralen Extraktionsbeleg verwenden, niemals fertige bearbeitbare öffentliche MDs, Entscheidungen oder Veröffentlichungsrechte. Kein dauerhafter allgemeiner Cache als erste Änderung. |
| 2 / BL-047.3: zu großzügiger OCR-Seitenpfad | Ein Logo oder Vektorrahmen kann derzeit ganze PDF-Seiten-OCR auslösen. Gezieltere Planung hat potenziell erheblichen Nutzen, muss aber echte zusätzliche Bild-/Vektortexte behalten. | Belegte Inhaltsregionen/Fallback; kein „Suchtext vorhanden, daher Bilder ignorieren“. Keine universelle Logo-/Foto-Heuristik oder stumme Textauslassung. |
| 3 / BL-047.4: Mehrfachrendern | Qualitätsnutzen und Kosten gemeinsam optimieren. Der aktuelle Lauf belegt trotz Aufwand zahlreiche Dopplungen; die bloße Existenz der Gegenprüfung genügt nicht. | Derselbe Schutz vor unberechtigter OCR-Unterdrückung, weniger vollständige Render-/RGBA-Vergleiche; Regionsbeweise bündeln. Dokumentbudget nicht blind anheben. |
| 4 / BL-047.5: serielle Kette | Begrenzte parallele Vorbereitung erst nach Messung des dominanten Pfads und Speicherbedarfs bewerten, zunächst höchstens zwei unabhängige Konverter. | Laufweite Pseudonyme, Journal-/Ownershipzustände und Publikationscommits geordnet halten. Keine einfache Parallelisierung von `processBatchNext`. |
| 5 / BL-047.6: Zwischenstufen/Metadaten | PNG→Canvas→PNG sowie wiederholte Manifest-/Statusrekonstruktion gezielt messen und zusammenlegen. Belegte Wiederholung bedeutet noch keinen dominanten Zeitanteil. | Exakte Raster-/Kontaktpositionen und Alpha-/Orientierungsregeln erhalten. Gehaltene unveränderliche Operationsobjekte statt globalem Freigabecache; Durability nicht pauschal abschalten. |

### Voraussetzung: BL-047.7, feinere Messung

Der endgültige laufinterne Dateizeit-Summenwert ist 2.066.727 ms; davon
2.029.099 ms Konvertierung/Bild/OCR (rund 98,2 %), 12.437 ms separat erfasste
Verifikation und 14.681 ms Publikation. Zwischen Laufanlage und letzter MD liegen
etwa 35 min 34 s. Einzeldateizeit, Wandzeit und spätere Abschluss-/UIarbeit sind
verschiedene Größen. Schutzarbeit liegt teilweise im Konverterblock; aus diesen
Zahlen folgt nicht, dass jeder Hash-/Modellcheck kostenlos oder OCR allein 98 %
der Laufzeit wäre.

Inhaltsfreie Unterzeiten/Zähler für Workerstart, Modellprüfung/-initialisierung,
native Extraktion, Struktur-/Operatorlesen, Paint-Proben, Hauptraster, OCR,
Refinement, Transport und finale Bereitstellung ergänzen. Diagnostikfehler dürfen
den Produktlauf nicht verändern; keine Namen, Pfade, Texte oder freie Exceptions
in neue Messereignisse aufnehmen. Zeit/RAM und Inhaltsqualität am selben
unveränderten Korpus vergleichen, nicht nur mehr Tests grün färben.

### Punkt 1: mögliche spätere Lösung für den Zweckwechsel

Ein privater, begrenzter neutraler Extraktionsbeleg müsste Quellbytes/Quelltyp,
vollständige Inhalts-/OCRoptionen, Parser-/Renderer-/Modell-/Policybindung,
Schema/Koordinaten/Abdeckung, tatsächliches erfolgreich bestätigtes Workerende
und Profil-/Aufbewahrungsrechte binden. Ein Dateiname oder vorhandenes MD ist
kein Cachekey. Zeit-/Ressourcenabbrüche und offene Operationen nicht als
vollständige Treffer konservieren. Zulässige deterministische Teilabdeckung
bleibt als solche erhalten; keine pauschale Umdeutung aller `incomplete`-Stände.

Der Beleg muss die vollständige ursprüngliche `MarkdownExtraction` einschließlich
`ocr_contacts` und `private_document_metadata` erhalten. Markdown plus Coverage
allein reicht nicht. Die Wiederverwendung liegt vor der zweckspezifischen
Tabellen-/Privacyprojektion; diese Ableitungen und ihre Feld-/Spannenbindungen
werden für den jeweiligen Auftrag neu geprüft.

Jeder neue Auftrag erhält neue Datei-/Laufbindungen und führt seine eigenen
Anonymisierungs-, Kontakt-, Pseudonym-, Residual- und Publikationsprüfungen aus.
Bei fehlender/veränderter/abgelaufener Bindung normal neu extrahieren. Öffentliche
Arbeitskopien oder nachträgliche manuelle Bearbeitungen nicht importieren.
Bestehende Prepared-/Replaywiederaufnahme im selben Auftrag ist davon getrennt
und re-extrahiert bereits heute nicht jeden bestätigten vorbereiteten Stand.

Abnahme vor Produktfreigabe: gleiche neutrale Bytes/Spannen/Abdeckung bei
kalt/warm, geänderte Quelle/Option/Modell/Policy ohne falschen Treffer, eigene
laufgebundene Pseudonymregister/Freigaben, manipulierter/abgelaufener Eintrag ohne Autorität,
keine Weitergabe über Profile, gebundene Löschung/Aufbewahrung und echtes
Workerende. Erst bei gemessenem Netto-Nutzen und bestandenen Negativen aktivieren.
Gleich dargestellte Platzhalter wie `[PERSON_001]` in zwei Läufen sind zulässig;
entscheidend sind getrennte Identitäts-/Freigabebindungen, nicht andere Tokenzeichen.

## Empfohlene Umsetzungsreihenfolge

1. Excel-ST_Xstring-Inhaltsverlust und irreführenden Endcode korrigieren.
2. Feinmessung ergänzen; PDF-Dopplung/Regionenpfad mit Qualitätsvergleich verbessern.
3. SmartArt-Hierarchie aus tatsächlichen Kanten projizieren.
4. Spalten-/Zellbezüge und kleine OCR-Bildtexte verbessern; statische SVG-Teilmenge
   und Bildbudget auf nachgewiesenen Mehrwert prüfen.
5. Grafik-/Verschlüsselungs-/Ordneröffnerdiagnosen und stabile Quelllabels schärfen.
6. Raster-/Metadatenumwege reduzieren; begrenzte Parallelvorbereitung und später
   zweckübergreifende neutrale Wiederverwendung nach Messung entscheiden.

Alle Änderungen zunächst an synthetischen Gegenfällen und unabhängig am
tatsächlichen Code prüfen. Die echten Originale bleiben ausschließlich lokale
Regressionen. Windows und beide Macs aus demselben neuen Stand prüfen; native
Worker-/Abbruch-/Speicher-/Dateirechte-Nachweise bleiben erforderlich. Keine
neue Developer-ID, Notarisierung, Sicherheitsabschaltung oder Nutzeranmeldung.
Für reine Parser-/Planerarbeit ist kein neuer Apple-Account nötig. Eine spätere
neue Testversion ist ein eigener Umsetzungsschritt; RC176-Assets bleiben unverändert.

## Primärquellen und sinnvolle Adaption

- [Microsoft ST_Xstring](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/d34ae755-c53f-4a44-a363-c6dd3ee018a4): typisierte Office-Escapes von XML-Containerzeichen unterscheiden.
- [Apache POI XSSFRichTextString](https://poi.apache.org/apidocs/6.0/org/apache/poi/xssf/usermodel/XSSFRichTextString.html): Decodier-/Literal-Escape-Verhalten als Gegenreferenz; keine Java-Laufzeitpflicht.
- [Microsoft Diagram Connection](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.diagrams.connection.sourceid?view=openxml-3.0.1): echte Knoten-/Kantenattribute statt optisch geratener Verknüpfungen.
- [pdfplumber Tabellenansatz](https://github.com/jsvine/pdfplumber#extracting-tables): begrenzte Linien-/Ausrichtungs-/Zellmodelle als Referenz und unabhängiges Orakel. Methodik auf vorhandene lokale Geometrie adaptieren; kein ungeprüftes Mitschiffen von Python oder einer neuen nativen Laufzeit. Vor Codeübernahme Commit, MIT-Lizenz und Notices binden.
- [Tesseract Qualitätsleitfaden](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) und [Worker/Scheduler](https://github.com/naptha/tesseract.js/blob/master/docs/workers_vs_schedulers.md): Segmentierung/Qualität messen, Worker begrenzt wiederverwenden. Pro Dokument geschieht dies bereits; Modell-/Sprachwechsel nicht als kostenlose Beschleunigung darstellen.
- [Bazel Aktions-/Inhaltscache](https://bazel.build/remote/caching): nur Architekturvergleich für deklarierte vollständige Eingaben/Outputs, keine Empfehlung für Cloud-/Remoteverarbeitung unserer Dokumente.

Stand der Folgeaufgaben: **offen, Umsetzung noch nicht begonnen**. Die geprüften
nativen Textanwesenheiten und ursprünglichen RC176-Endgates bleiben echte
Nachweise ihres begrenzten Umfangs; sie widerlegen die neu gefundenen Fehler nicht.
