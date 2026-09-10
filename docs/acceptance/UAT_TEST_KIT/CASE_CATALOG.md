# UAT-Fallkatalog in Klartext

## UAT-01

**Ein Mitarbeiterprofil sicher de-identifizieren.** Eine TXT-Datei muss ein
verwendbares Markdown liefern. Personen-, Kontakt-, Bank-, Arbeitgeber- und
Kundenangaben fehlen; Rolle, Technologien und Zertifikate bleiben erhalten.

## UAT-02

**Sechs freigegebene Formate liefern denselben fachlichen Inhalt.** TXT,
Markdown, CSV und DOCX werden direkt verarbeitet; XLSX und PPTX werden lokal
nach Markdown extrahiert. Es entstehen sechs eindeutige Zuordnungen, die
Quellen bleiben bytegleich und die Office-Quellenabdeckung wird separat
ausgewiesen. Beim DOCX enthält das anonymisierte Markdown keine strukturell
deklarierte Kopf- oder Fußzeile; Haupttext, Kommentare, Fuß- und Endnoten bleiben
Teil des geprüften Inhalts. Der sichtbare Scope-Hinweis benennt diese Grenze.

## UAT-03

**Bilder bleiben lokal und ein mehrdeutiger Zertifikatsanbieter wird nicht
geraten.** Das Bild-DOCX darf nur als „verwendbar mit Auslassungen“ freigegeben
oder sicher gestoppt werden. Die mehrdeutige Textdatei bleibt bis zu einer
ausdrücklichen lokalen Entscheidung zurückgestellt. Jede andere Kombination ist
`FAIL`.

## UAT-04

**Gesperrte Formate werden nicht angeboten und stoppen sicher; eine beschädigte
freigegebene Datei stoppt sicher.** PDF und PNG erscheinen nicht als
angebotene Dateitypen; eine dennoch erzwungene Übergabe stoppt lokal ohne
Ergebnis. Das beschädigte DOCX ist auswählbar, erhält aber kein Ergebnis. Die
Oberfläche erklärt den sicheren Stopp in Klartext; feste Codes sind nur IT-Details.

## UAT-05

**Ein unmittelbar nach bestätigtem Start unterbrochener Zehnerstapel wird ohne
Neuauswahl fortgesetzt.** Der Abbruch erfolgt reproduzierbar direkt nach der
Startmeldung durch vollständiges Beenden von Claude Desktop. Bereits fertige
Positionen werden nicht wiederholt. Am Ende gibt es genau zehn Zuordnungen.

## UAT-06

**Hundert Dateien werden als ein Stapel verarbeitet.** Es gibt 100 eindeutige
terminale Positionen, eine Abschlussübersicht und eine begrenzte, fortsetzbare
Ergebnisübergabe.
