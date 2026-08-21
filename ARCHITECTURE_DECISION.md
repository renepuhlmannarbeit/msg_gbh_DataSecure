# Architekturentscheidung v3.2 RC2

Statushinweis RC14 (21.08.2026): Die Grundentscheidung gilt fort. Der aktuelle
Umsetzungs- und Release-Stand steht in `README.md`, `docs/RELEASE.md` und
`docs/COMPANION_IPC_V1.md`; bei abweichenden Detailaussagen sind diese neueren
Dokumente maßgeblich.

## Entscheidung

Für sensible lokale Dateien bleibt **Claude Desktop + lokale MCPB Desktop Extension** die Sicherheitsgrenze. Ein Skill allein ist kein geeigneter Pre-Processing-Gate, weil der Skill erst innerhalb von Claude wirkt. Der Gateway verarbeitet deshalb die Quelldatei lokal und gibt über MCP nur freigegebenes Markdown bzw. freigegebene PNG-Assets zurück.

## Warum v3.2 anders ist

Frühere Prototypen installierten teilweise Runtime-Pakete oder nutzten große generierte Quelldateien. RC2 besteht aus normalem modularen Node.js-Quellcode. Parser, Privacy Engine und Paketlogik werden direkt ins MCPB gepackt; beim Anwender laufen weder `npm install` noch Python-Setup oder Modell-Download.

## Dokumente

- DOCX/XLSX/PPTX: eigenständiger OOXML/ZIP-Parser mit Größen-/Pfadgrenzen.
- PDF: in RC20 vollständig aus dem Produktparser entfernt und vor jeder Veröffentlichung mit `PDF_COVERAGE_UNVERIFIED` gesperrt. Der historische Lite-Parser liegt ausschließlich im Testbereich; Zielarchitektur ist der native PDFium-Vertrag aus `docs/PDF_ENGINE_DECISION.md`.
- TXT/MD/CSV: lokal direkt verarbeitet.

## Datenschutzprofile

`personnel_profile` ist ein eigener Modus. Er entfernt direkte Identifikatoren und behandelt Arbeitgeber, konkrete Kunden/Projektbezeichnungen und genaue Standorte als Quasi-Identifikatoren. Fachliche Informationen wie Rollen, Skills, Methoden, Zertifizierungen und Technologien sollen erhalten bleiben.

## Visuelle Assets

- PNG/BMP: lokal normalisiert; bei OCR-PII pixelweise redigiert und erneut geprüft.
- JPEG: Metadaten werden lokal entfernt; der Inhalt läuft danach durch dieselbe
  Visual-Pipeline. EMF/WMF wird nur bei verfügbarer und erfolgreich verifizierter
  Windows-Bridge rasterisiert, andernfalls vollständig zurückgehalten; die reale
  EMF/WMF-Abnahme ist noch offen.
- SVG oder nicht rasterisierbare Assets: keine stille Freigabe; lokale Review-Queue.
- `applicant`/`personnel_profile`: Visuals werden lokal zurückgehalten. RC14 besitzt
  keinen menschlichen visuellen Freigabekanal; Preview-Inspektion oder eine
  Chatbestätigung macht das Asset nicht für Claude lesbar.

## Claude-Zugriff

Claude hat über diese Extension keine Funktion zum Lesen des Originals oder des Review-Previews. Read-Tools akzeptieren ausschließlich veröffentlichte Output-Pakete. Markdown und Assets sind mit SHA-256 im Manifest gebunden.

## Repository / CI

Das Repository enthält normalen modularen Sourcecode, keine `source-parts`. Synthetische Office/PDF-Fixtures werden bei Tests mit Node.js erzeugt und nicht committed. GitHub Actions führt Tests aus und erzeugt das MCPB-Artefakt.

## AI Act

Die De-Identifizierung ist ein Datenschutz-/Governance-Baustein, keine Risikoklassifizierung. Beschäftigungsbezogene nachgelagerte Zwecke werden separat klassifiziert. Insbesondere Bewerberfilterung/-bewertung sowie bestimmte Entscheidungen/Monitoring/Task-Allocation bei Beschäftigten können Annex III betreffen.
