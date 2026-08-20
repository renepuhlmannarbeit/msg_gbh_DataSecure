# Architekturentscheidung v3.2 RC1

## Entscheidung

Für sensible lokale Dateien bleibt **Claude Desktop + lokale MCPB Desktop Extension** die Sicherheitsgrenze. Ein Skill allein ist kein geeigneter Pre-Processing-Gate, weil der Skill erst innerhalb von Claude wirkt. Der Gateway verarbeitet deshalb die Quelldatei lokal und gibt über MCP nur freigegebenes Markdown bzw. freigegebene PNG-Assets zurück.

## Warum v3.2 anders ist

v3.1 installierte zur Laufzeit npm-Pakete. Das widerspricht der aktuellen MCPB-Best-Practice, nach der Desktop Extensions Abhängigkeiten bündeln und offline funktionieren sollen. v3.2 enthält deshalb Parser, Privacy Engine und Paketlogik direkt im MCPB und führt beim Anwender kein `npm install` und kein Python-Setup aus.

## Dokumente

- DOCX/XLSX/PPTX: eigenständiger OOXML/ZIP-Parser mit Größen-/Pfadgrenzen.
- PDF: konservativer Textlayer-Parser; komplexe/Scan-PDFs werden fail-closed gestoppt. DCT/JPEG-Bildobjekte können extrahiert werden; sonstige PDF-Visuals werden nicht still als sicher behandelt.
- TXT/MD/CSV: lokal direkt verarbeitet.

## Datenschutzprofile

`personnel_profile` ist ein eigener Modus. Er entfernt direkte Identifikatoren und behandelt Arbeitgeber, konkrete Kunden/Projektbezeichnungen und genaue Standorte als Quasi-Identifikatoren. Fachliche Informationen wie Rollen, Skills, Methoden, Zertifizierungen und Technologien sollen erhalten bleiben.

## Visuelle Assets

- PNG/BMP: lokal normalisiert; bei OCR-PII pixelweise redigiert und erneut geprüft.
- JPEG/EMF/WMF: unter Windows lokal metadatafrei zu PNG rasterisiert; danach gleiche Pipeline.
- SVG oder nicht rasterisierbare Assets: keine stille Freigabe; lokale Review-Queue.
- `applicant`/`personnel_profile`: Visuals werden standardmäßig lokal zurückgehalten. Ein Mensch kann einen metadatafreien PNG-Preview ausdrücklich freigeben.

## Claude-Zugriff

Claude hat über diese Extension keine Funktion zum Lesen des Originals oder des Review-Previews. Read-Tools akzeptieren ausschließlich veröffentlichte Output-Pakete. Markdown und Assets sind mit SHA-256 im Manifest gebunden.

## AI Act

Die De-Identifizierung ist ein Datenschutz-/Governance-Baustein, keine Risikoklassifizierung. Beschäftigungsbezogene nachgelagerte Zwecke werden separat klassifiziert. Insbesondere Bewerberfilterung/-bewertung sowie bestimmte Entscheidungen/Monitoring/Task-Allocation bei Beschäftigten können Annex III betreffen.
