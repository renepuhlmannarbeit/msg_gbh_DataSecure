# GBH DataSecure – Dokumente anonymisieren

Claude-Plugin zur lokalen Anonymisierung und Datenschutzprüfung von PDF-, DOCX-, XLSX-, PPTX-, Text- sowie eigenständigen PNG-, JPEG- und BMP-Dateien.

Das Plugin verbindet:

- zwei klar getrennte Claude-Skills für Anonymisierung und Datenschutzerklärung,
- einen lokalen MCP-Server als technische Datenschutzgrenze und zur Dateiverarbeitung,
- ein sicher abbrechendes Ausgabemodell: Claude liest nur freigegebenes Markdown und freigegebene PNG-Dateien.

## Ablauf für Anwender

1. Bitte Claude bei TXT oder DOCX, ein lokales Dokument vorzubereiten. DataSecure öffnet einen lokalen Dateidialog und unter Windows anschließend eine auf zusätzliche Schwärzungen begrenzte Prüfung.
2. Bitte Claude bei PDF, XLSX, PPTX, MD, CSV oder Bildern, den Datenschutzordner zu öffnen, und kopiere die Quelldatei nach `Input`.
3. Bitte Claude, das Dokument zu anonymisieren oder zu de-identifizieren.
4. Claude verwendet ausschließlich freigegebenes Markdown und freigegebene PNG-Dateien.
5. Nicht automatisch verifizierbare Grafiken bleiben lokal unter `Needs Visual Review`. Dieser Engineering-Build besitzt keinen menschlichen Freigabeweg für visuelle Inhalte; das Öffnen des Ordners macht sie für Claude nicht lesbar.

Die Windows-Textprüfung kann zusätzliche Ersetzungen mit `[MANUAL_REDACTION]` hinzufügen, den fachlichen Inhalt aber nicht frei bearbeiten. Das Überspringen der optionalen Prüfung umgeht weder technische Abdeckungsprüfungen noch Kontrollen auf verbliebene personenbezogene Daten oder visuelle Inhalte.

Lade ein sensibles Original nicht direkt in Claude hoch und füge es nicht in den Chat ein, wenn Claude den Inhalt erst nach der Datenschutzverarbeitung sehen darf.

Dieses Plugin bietet keine Rechtsberatung, keine Garantie rechtlicher Anonymität und keine Zertifizierung nach DSGVO oder EU AI Act.
