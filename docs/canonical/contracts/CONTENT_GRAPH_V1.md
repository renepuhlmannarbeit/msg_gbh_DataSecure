# Content-Graph und Locator V1

Status: **Engineering-Vertrag, nicht als neue Formatfreigabe wirksam**

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
Ein Graph schaltet kein Format frei; die veröffentlichte Capability-Liste bleibt
unverändert.

V1 bildet die bestehende Parsergrenze verlustfrei als Text-, Tabellen- und
Bildknoten ab. OOXML-Abschnitte besitzen bereits containerinterne Part-Locators für
DOCX-Hauptteil, Kopf-/Fußzeilen, Kommentare, Fuß-/Endnoten, XLSX-Arbeitsblätter,
Diagramme und Zeichnungstext sowie PPTX-Folien, Notizen und Diagramme. Kern-,
Anwendungs- und benutzerdefinierte OOXML-Eigenschaften besitzen eigene
Metadatenknoten. Benutzerdefinierte Werte werden nur für unterstützte skalare
OOXML-Typen ausgegeben; komplexe Typen stoppen die Coverage-Prüfung. Feinere
Absatz-, Zell-, Seiten- und Spezialmetadaten-Locators werden in den jeweiligen positiven
Formatstories ergänzt, bevor diese Formate freigegeben werden.
