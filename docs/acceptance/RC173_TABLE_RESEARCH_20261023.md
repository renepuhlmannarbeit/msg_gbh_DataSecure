# RC173 – bekannte Tabellenprobleme und externe Lösungsansätze

Recherche am 23.10.2026, ausdrücklich zusätzlich beauftragt. Primärquellen:
offizielle Format-/Projektunterlagen, Maintainer-Issues und tatsächliche
Konverterquellen. Dies ist kein Implementierungs-/Sicherheits-/Build-PASS.
Kein Fremdcode übernommen, keine neue Dependency oder native Runtime installiert.

Tatsächliche GitHub-Branchstände per API gelesen: docling-core/main
`b501ec8011181db4a08a45b27a47fe7f66814cbe`, mammoth.js/master
`5171a9072f8b7343ab1c9ed3a15d6d372cb59b67`, markitdown/main
`7482c092d9c0074a89803c9fdb63a969e7fe17fc`. Die unten verlinkten
Branchseiten können sich später ändern; keine reproduzierbare Fremdcode-
Übernahme oder Produktabhängigkeit wird aus diesen Leseständen behauptet.

## Befund

Das Darstellungsproblem ist bekannt. GFM-Pipetabellen besitzen keine echte
rowspan-/colspan- oder verschachtelte Tabellenstruktur. Eine korrekt gelesene
Office-Tabelle kann daher erst bei der Markdown-Serialisierung Zuordnungen
verlieren. Für DataSecure ist das nicht nur kosmetisch: Ein kurzes unbekanntes
Wort muss unter einem tatsächlichen Namensfeld weiterhin geschützt bleiben.
Fremde allgemeine Konverter liefern dafür allein keinen Datenschutznachweis.

## Konkrete Ansätze anderer Projekte

- [python-docx: Tabellen](https://python-docx.readthedocs.io/en/latest/user/tables.html)
  modelliert das logische Layoutraster, verbundene Zellen und tatsächlich
  ausgelassene Rasterpositionen. Ausgelassen ist nicht gleich leere Zelle.
  Die vereinfachte Row.cells-Sicht wiederholt einen verbundenen Wert; für
  verschachtelte Inhalte ist ein rekursiver Absatz-/Tabellenlauf nötig.
  [Merge-Modell](https://python-docx.readthedocs.io/en/latest/dev/analysis/features/table/cell-merge.html).
- [Mammoth body-reader.js](https://github.com/mwilliamson/mammoth.js/blob/master/lib/docx/body-reader.js)
  liest gridSpan und vMerge aus echten Zellproperties, berechnet Rowspans
  über die logischen Spalten und erzeugt ein HTMLfähiges Zellmodell. Damit
  bleiben Spans vor einer späteren Markdown-Abflachung verfügbar. Eine
  fremde Warnungs-/Recoverypolitik wird dadurch nicht unsere Schutzpolitik.
- [Microsoft MarkItDown DOCX](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_docx_converter.py)
  verwendet Mammoth → HTML → Markdown, statt DOCX nur als Textknotenstrom
  auszulesen. [XLSX](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_xlsx_converter.py)
  führt gelesene Dataframes pro Blatt ebenfalls über HTML. Das ist ein
  Konvertierungsansatz, aber kein Beleg für beliebig sichere Header-/PII-
  Zuordnung und kein Grund, unseren isolierten Nodekonverter durch einen
  zusätzlichen Python-/Officeprozess zu ersetzen.
- [Docling Serialisierung](https://docling-project.github.io/docling/concepts/serialization/)
  unterscheidet strukturierte Tabelleninformationen von verlustbehafteter
  Markdown-Darstellung. [Issue3830](https://github.com/docling-project/docling/issues/3830)
  dokumentiert die Flatteninggrenze; [Issue4717](https://github.com/docling-project/docling/issues/4717)
  einen tatsächlichen Fehler bei verbundenen RichTableCells: derselbe
  Ursprung wurde mit einem geteilten visited-Zustand mehrfach besucht,
  spätere Rasterplätze wurden leer. Die aktuelle
  [Markdownimplementierung](https://github.com/docling-project/docling-core/blob/main/docling_core/transforms/serializer/markdown.py)
  cached die Auflösung am Zellursprung. Dokumentation und Versionen
  unterscheiden sich darin, ob verbundene Werte wiederholt oder nur am
  Ursprung ausgegeben werden; keine universelle Ausgabeannahme daraus.

## Ableitung für DataSecure

1. Tatsächliches begrenztes Raster-/Zell-/Spanmodell vor der Textausgabe,
   unabhängig von physischer XML-Zellnummer oder größter XLSX-Koordinate.
2. Ursprungszellen genau einmal ausgeben, Zusammenhänge durch neutrale
   Koordinaten/Spannweiten zeigen. Nicht durch Wiederholung desselben Wertes
   künstliche Personen-Vorkommen oder neue Zuordnungen erzeugen.
3. Schwierige gültige Layouts als lesbare Zellabschnitte mit belegten festen
   Feldlabels ausgeben; nicht als scheinbar rechteckige, falsch zugeordnete
   Tabelle. Verschachtelte Tabellen besitzen einen eigenen lokalen Scope.
4. Nach üblicher Identitätserkennung unerkannte Reststücke in tatsächlich
   geschützten Feldern konservativ maskieren, ohne daraus eine erfundene
   Person/Firma abzuleiten. Reale Editspans/Trace und unabhängige vollständige
   Feldwert-Restprüfung müssen auch nach Keep/Nachbearbeitung gelten.
5. Alles vor der endgültigen OCR-/Privacybasis serialisieren. Kein Offset-
   Raten nach Wertsuche und kein neues ungeprüftes verified-/Authorityflag.
6. Windows/macOS benötigen für dieses native OOXML-Modell weder Microsoft
   Office noch einen zusätzlichen Renderer, Cloudzugriff, Applekonto oder
   geänderte Betriebssystemrechte. Das ersetzt keine späteren Desktoptests.

## Lizenz-/Adaptionsgrenze

[Docling-core](https://github.com/docling-project/docling-core/blob/main/LICENSE)
ist MIT; [Mammoth.js](https://github.com/mwilliamson/mammoth.js/blob/master/LICENSE)
verwendet BSD-2-Clause. Ein echter Codeimport müsste Herkunft, exakten Stand
und Lizenzhinweise mitführen. Aktueller Weg: Formatkonzepte und dokumentierte
Fehler als Gegenfälle nutzen, die bestehende begrenzte Implementierung selbst
erweitern. Kein Copy/Paste einer fremden Serialisierung als vermeintlicher
Ersatz für unsere Feld-, Rest-PII-, I/O- und Publikationsprüfungen.
