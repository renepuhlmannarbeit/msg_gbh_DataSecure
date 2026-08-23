# DOCX-Story-Coverage V1

Stand: 23.08.2026 · Story: BL-022.1 · Status: in Arbeit

## Zweck und Grenze

Ein DOCX ist ein OPC-Paket aus verknüpften WordprocessingML-Parts. Die lokale
Parsergrenze verarbeitet nicht nur `word/document.xml`, sondern alle im V1
abgedeckten Text-Stories vor der Anonymisierung. Ein unbekannter
inhaltsfähiger Part, eine externe Beziehung oder aktiver Inhalt führt zu einer
inhaltsfreien Coverage-Warnung und verhindert die Freigabe.

## Abgedeckte Stories

- Hauptteil: `w:body` in `word/document.xml`
- Kopf- und Fußzeilen: `w:hdr` und `w:ftr`
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
zulässige Alternative. Die Inhalte
werden genau einmal in der Markdown-Repräsentation
geführt und anschließend durch denselben Pseudonymisierungs- und Residual-Gate
geprüft wie der Haupttext. Parser-generierte Überschriften dienen nur der
Trennung der Stories; sie sind kein Freigabeweg für Rohdaten.

Bilddateien unter `word/media/` sind ebenfalls keine Dateinamen-Allowlist. Jede
Grafik muss über genau eine oder mehrere passende interne Beziehungen des Typs
`image` aus einem Word-Part erreichbar sein. Verwaiste Grafiken, externe
Bildziele und Medien unter einem anderen Beziehungstyp werden weder als lokales
Sichtprüf-Asset ausgegeben noch freigegeben; sie erzeugen eine inhaltsfreie
Coverage-Warnung.

## Nicht abgedeckt

Glossarien, Subdocuments, beliebige unbekannte `word/`-Parts, aktive
Makros/OLE/ActiveX sowie externe Beziehungen bleiben gesperrt. Die V1 ist
deshalb kein allgemeiner DOCX-Renderer. Ein nicht referenzierbarer oder nicht
unterstützter Inhalt darf nicht stillschweigend ausgelassen werden.

## Akzeptanznachweis

`tests/test-parsers.js` belegt die strukturtreue Extraktion von Kopf-/Fußzeile,
Kommentar, Fuß- und Endnote inklusive Tab und Zeilenumbruch sowie deren
Anonymisierung. Ein separater Negativtest belegt verwaiste und fehlende
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
Hauptteils und gewöhnlicher Tabellen in 24 synthetisch erzeugten gültigen DOCX
mit der unabhängigen HTML-Konvertierung. Mammoth ist weder Runtime- noch
Pluginabhängigkeit und kann keine fehlende fail-closed-Coverage-Prüfung oder
Interoperabilitätsabnahme mit realen Word-Generatoren ersetzen. Rest: praktische
Drei-OS- und Word-Generator-Abnahme.
