# Content-Graph und Locator V1

Status: **E0 für TXT, Markdown, CSV und DOCX implementiert; für gesperrte
Zielcontainer weiterhin Engineering-Vertrag**

Der Vertrag `data-secure-content-graph/v1` vereinheitlicht Parserausgaben, ohne
Dokumentinhalt ein zweites Mal zu speichern. `markdown` bleibt die einzige
Textrepräsentation. Der Graph enthält ausschließlich Struktur und Positionen.
`metadata` ist ein eigener Knotentyp, dessen Wert wie jeder andere Text zuerst im
Markdown durch das Datenschutz-Gate läuft.

## Locator

- Text und Tabellen verwenden halb offene UTF-16-Positionen `[start, end)` im
  NFC-/LF-normalisierten Markdown. Die Semantik folgt dem W3C
  `TextPositionSelector`; der Koordinatenraum ist explizit
  `normalized-markdown:utf16`.
- Bilder verwenden einen strukturellen `FragmentSelector` und einen nullbasierten
  `asset_index`. Der Fragmentwert ist ein containerinterner Partname, niemals ein
  lokaler Dateipfad.
- Locators enthalten weder Textzitate noch erkannte Werte, Dateinamen des Originals,
  Quellpfade oder Hashes.

## Fail-closed-Regeln

Der isolierte Parser muss genau einen validen Graph liefern. Doppelte IDs, unbekannte
Felder oder Knotentypen, Traversal-Parts, Positionen außerhalb des normalisierten
Markdown sowie fehlende oder doppelte Asset-Zuordnungen stoppen die Verarbeitung.
IDs sind exakt fortlaufend. Text-, Tabellen- und Metadatenknoten stehen geordnet und
überlappungsfrei vor den Bildknoten; zwischen und nach ihnen darf ausschließlich
Leerraum unlokalisiert bleiben. Dadurch ist jedes nicht-leere Zeichen des Markdown
mindestens einem Knoten zugeordnet.
Ein Graph schaltet kein weiteres Format frei; die veröffentlichte Capability-Liste
bleibt unverändert.

Seit RC69 wird das Format zusätzlich gegen die vertrauenswürdige Extension des
isolierten Parseraufrufs geprüft (nicht nur gegen die Selbstauskunft des Workers).
`source_format` und Bild-MIME müssen echte Strings sein. Jeder Bildlocator stimmt
exakt mit `attachments[asset_index].source_part` überein; der MIME-Typ ist unabhängig
als Bildtyp validiert. Derselbe Quellteilvertrag gilt für beide Seiten der Bindung:
relative Slash-Segmente ohne leere, `.`- oder `..`-Segmente, ohne Backslash,
Doppelpunkt, C0-/C1-Steuerzeichen oder Unicode-Zeilentrenner U+2028/U+2029.
`!/` ist ausschließlich ein Containertrenner; jede Teilkette erfüllt dieselben
Regeln. Quellteile bleiben Strukturreferenzen und dürfen nicht als OS-Pfad verwendet
werden. Das gemeinsame 1.000-Knoten-Budget greift bereits vor der Konstruktion.

Wichtig: Die vollständige Abdeckung des **erzeugten Markdown** beweist allein noch
keine vollständige Extraktion des **Originals**. Dafür bleiben die formatspezifischen
Story-/Relationship-/Inhaltserhalt-Gates einschließlich unabhängiger Parsertests nötig.
`test-content-graph.js` prüft die Schema-Grammatik und Runtime auch gegen einen
unabhängigen Segmentvergleich mit 1.200 deterministischen Unicode-/Containerfällen.

V1 bildet die bestehende Parsergrenze verlustfrei als Text-, Tabellen- und
Bildknoten ab. OOXML-Abschnitte besitzen bereits containerinterne Part-Locators für
DOCX-Hauptteil, Kopf-/Fußzeilen, Kommentare, Fuß-/Endnoten, XLSX-Arbeitsblätter,
Diagramme und Zeichnungstext sowie PPTX-Folien, Notizen, Diagramme, eindeutig
erreichbare Layouts und Master. Kern-,
Anwendungs- und benutzerdefinierte OOXML-Eigenschaften besitzen eigene
Metadatenknoten. Benutzerdefinierte Werte werden nur für unterstützte skalare
OOXML-Typen ausgegeben; komplexe Typen stoppen die Coverage-Prüfung. Feinere
Absatz-, Zell-, Seiten- und Spezialmetadaten-Locators werden in den jeweiligen positiven
Formatstories ergänzt, bevor diese Formate freigegeben werden.
