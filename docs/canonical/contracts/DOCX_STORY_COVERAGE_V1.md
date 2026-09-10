# DOCX-Story-Coverage V1

Stand: 31.08.2026 · Story: BL-022.1 · Status: in Arbeit

## Zweck und Grenze

Ein DOCX ist ein OPC-Paket aus verknüpften WordprocessingML-Parts. Die lokale
Parsergrenze validiert nicht nur `word/document.xml`, sondern alle im V1
abgedeckten Text-Stories vor jeder Ausgabe. Ein unbekannter
inhaltsfähiger Part, eine externe Beziehung oder aktiver Inhalt führt zu einer
inhaltsfreien Coverage-Warnung und verhindert die Freigabe.

## Abgedeckte Stories

- Hauptteil: `w:body` in `word/document.xml`
- Kopf- und Fußzeilen: `w:hdr` und `w:ftr` (vollständig validiert; nur bei
  reiner Konvertierung ausgegeben)
- Kommentare: `w:comments`
- Fuß- und Endnoten: `w:footnotes` und `w:endnotes`
- sichtbare Textfelder in diesen Stories, Tabellen, Tabs und Zeilenumbrüche

Die Root-Beziehung `_rels/.rels` muss genau einmal intern vom Typ
`officeDocument` auf `word/document.xml` zeigen; dieser Main-Part benötigt einen
darstellbaren `w:document`-/`w:body`-Wurzelpfad. Jeder weitere Bereich besitzt einen
stabilen, paketinternen `source_part` im Content-Graph und muss über genau eine passende
interne Beziehung von `word/document.xml` erreichbar sein. Der Wurzeltyp des Zielparts
muss zum Relationship-Typ passen (`w:hdr`, `w:ftr`, `w:comments`, `w:footnotes` oder
`w:endnotes`). Verwaiste Parts, externe Ziele, Parent-Traversal, fehlende Ziele,
doppelte Story-Beziehungen, falsch deklarierte oder abgeschnittene Story-Wurzeln und mehrdeutige Root-Beziehungen sind keine
zulässige Alternative. Bei reiner Markdown-Konvertierung werden die Inhalte
aller Stories genau einmal in der Markdown-Repräsentation geführt. Bei
Anonymisierung werden Kopf- und Fußzeilen nach erfolgreicher Strukturprüfung
nicht projiziert; Hauptteil, Kommentare, Fuß- und Endnoten durchlaufen weiterhin
denselben Pseudonymisierungs- und Residual-Gate. Parser-generierte Überschriften
dienen nur der Trennung der Stories; sie sind kein Freigabeweg für Rohdaten.

Bilddateien unter `word/media/` sind ebenfalls keine Dateinamen-Allowlist. Jede
Grafik muss über genau eine oder mehrere passende interne Beziehungen des Typs
`image` aus einem Word-Part erreichbar sein. Verwaiste Grafiken, externe
Bildziele und Medien unter einem anderen Beziehungstyp werden weder als lokales
Sichtprüf-Asset ausgegeben noch freigegeben; sie erzeugen eine inhaltsfreie
Coverage-Warnung.

Bei Anonymisierung werden Bilder, die ausschließlich aus einer Kopf- oder
Fußzeile referenziert werden, ebenfalls nicht projiziert. Ein zusätzlich aus dem
Hauptteil referenziertes identisches Bild bleibt Bestandteil der normalen
Bildprüfung. Die vollständige Relationship-/Orphan-Prüfung verwendet weiterhin
das gesamte validierte Beziehungsinventar; der bewusste Ausgabeausschluss darf
keine fehlerhafte Beziehung verdecken.

## RC69: verschachtelte Tabellen und Textfelder

Ein begrenzter struktureller Durchlauf ersetzt das flache Zeilen-/Zellen-Matching.
Äußere Textläufe vor, zwischen und nach Textfeldern sowie Zellen und Zeilen nach
einer eingebetteten Tabelle bleiben in Quellreihenfolge genau einmal erhalten.
Dies gilt für den Hauptteil und alle fünf oben genannten Neben-Stories.
Verschachtelte Tabellen werden innerhalb einer Markdown-Zelle mit escaped
Trennzeichen und Zeilenumbrüchen dargestellt; die Originalformatierung wird nicht
rekonstruiert. Fachinhalte bleiben Text, Namen und Kontakte durchlaufen weiterhin
denselben Datenschutz-Gate. Moderne Choice-Inhalte ersetzen den Fallback ohne
Textduplikation.

Fehlerhafte Tag-/Tabellen-/Textfeldverschachtelung oder uneindeutige Attribute
liefern kein Teilresultat. Die Strukturgrenzen betragen 128 XML-Ebenen,
200.000 behaltene Strukturknoten, 1.000.000 XML-Elemente und 8.000.000 gerenderte
Zeichen je Story. Dies sind Ressourcenbudgets, keine Seitenzahlgrenze.
Ein Fehler ist inhaltsfrei (`DOCX_STRUCTURE_UNSAFE`/`DOCX_STRUCTURE_LIMIT` intern;
der Worker gibt weiterhin nur den festen Parserfehler zurück).
Text wird nicht für jeden übergeordneten Tabellenknoten erneut eingelesen oder
escaped; Ausgabeexpansion durch Tabellenauffüllung ist ebenfalls begrenzt.

`test-docx-structure.js` umfasst 30 Prüfgruppen einschließlich 48 missgebildeter
Story-Fälle, Tiefengrenzen, 5.000 Zeilen, übermäßiger Tabellenauffüllung und
De-Identifizierung zuvor verlorener Textpositionen bei Erhalt von Qualifikationen.
`npm run test:parser-contract` bündelt Struktur, Graph, Isolation und Differential;
die regulären Tests führen diese Nachweise automatisch mit aus.

## Nicht abgedeckt

Glossarien, Subdocuments, beliebige unbekannte `word/`-Parts, aktive
Makros/OLE/ActiveX sowie externe Beziehungen bleiben gesperrt. Die V1 ist
deshalb kein allgemeiner DOCX-Renderer. Ein nicht referenzierbarer oder nicht
unterstützter Inhalt darf nicht stillschweigend ausgelassen werden.

## Akzeptanznachweis

`tests/test-parsers.js` und `tests/test-docx-structure.js` belegen die
strukturtreue Extraktion von Kopf-/Fußzeile, Kommentar, Fuß- und Endnote
inklusive Tab und Zeilenumbruch. Der zweckgebundene Positivtest belegt außerdem,
dass reine Konvertierung Kopf-/Fußzeilen erhält, Anonymisierung sie samt
ausschließlich dort referenziertem Bild auslässt und Hauptteil, Kommentar,
Fußnote sowie Endnote weitergibt. Ein separater Negativtest belegt verwaiste und fehlende
Story-Beziehungen ohne Preisgabe von Partnamen oder Text; die Matrix umfasst zusätzlich
fehlende, externe, falsche und doppelte Root-`officeDocument`-Beziehungen sowie
Parent-Traversal, externe Ziele, Typ-Ziel-Mismatches, doppelte Story-Beziehungen und
falsch deklarierte oder abgeschnittene Story-Wurzeln sekundärer Stories. Die bestehenden adversarialen Tests belegen die sperrende
Behandlung unbekannter Parts, externer Beziehungen, aktiver Inhalte und
Einbettungen. Vollcoverage erfordert zusätzlich einen
beziehungsbasierten Reachability-Nachweis und positive/negative Tests für alle
zulässigen Story- und Relationship-Varianten.

## Wiederverwendung

Die Part-/Relationship-Struktur folgt Open Packaging Conventions und
WordprocessingML. Mammoth 1.12.1 ist als exakt gelocktes Entwicklungsorakel
eingebunden: `test-docx-differential.js` vergleicht den Token-Erhalt des
Hauptteils und gewöhnlicher Tabellen in 96 synthetisch erzeugten gültigen DOCX
mit der unabhängigen HTML-Konvertierung. RC69 ergänzt 24 Dokumente mit
verschachtelten Tabellen (Reihenfolge/einmaliger Token-Erhalt) und 16 Dokumente
mit Textfeldern. Bei letzteren belegt Mammoth nur die äußeren Textläufe; moderne
`wps`-Textfelder werden vom Orakel ausgelassen, deshalb prüfen feste unabhängige
Sollwerte deren inneren Text zusätzlich. Es wird keine vollständige Orakel-
Übereinstimmung für Textfelder behauptet. Mammoth ist weder Runtime- noch
Pluginabhängigkeit und kann keine fehlende fail-closed-Coverage-Prüfung oder
Interoperabilitätsabnahme mit realen Word-Generatoren ersetzen. Rest: praktische
Drei-OS- und Word-Generator-Abnahme.
