# EU Privacy Document Gateway v3.2.0 RC1

> **Sicherheits-Hinweis für dieses öffentliche Repository:** Niemals echte Mitarbeiter-, Bewerber-, Kunden- oder Vertragsdokumente, Mapping-Dateien, Privacy-Output oder Zugangsdaten committen. Alle Repository-Testdaten sind synthetisch.

Lokale Claude-Desktop-Erweiterung für Windows. Ziel: sensible Geschäftsdokumente werden **vor der Modellverarbeitung lokal** in ein Privacy-Paket überführt. Claude erhält über diese Extension nur freigegebenes Markdown und freigegebene PNG-Grafiken.

## Unterstützte Inputs

- PDF mit extrahierbarem Textlayer (komplexe/Scan-PDFs fail-closed)
- DOCX
- XLSX
- PPTX
- TXT, MD, CSV

## Profile

- `customer`
- `applicant`
- `personnel_profile` (Mitarbeiter-/Beraterprofil)
- `contract`
- `general`
- `auto`

`personnel_profile` ist neu in v3.2 und wurde aus dem Realtest eines 14-seitigen Mitarbeiterprofils abgeleitet. Direkte Identifikatoren werden entfernt; Arbeitgeber, Kunden, konkrete Projektbezeichnungen und genaue Standorte werden als Quasi-Identifikatoren pseudonymisiert/generalisiert. Rollen, Skills, Zertifizierungen, Methoden und Technologien sollen erhalten bleiben.

## Output

```text
Claude Privacy/
├─ Input/
├─ Output/
│  └─ Mitarbeiterprofil_..._anonymisiert/
│     ├─ Mitarbeiterprofil_..._anonymisiert.md
│     ├─ assets/
│     ├─ manifest.json
│     └─ audit.json
├─ Processed/
└─ Needs Visual Review/
```

Visuelle Assets werden nicht still verworfen. Automatisch freigegebene Rastergrafiken landen in `assets/`. Unsichere, OCR-arme oder bei Personalprofilen grundsätzlich zurückgehaltene Grafiken landen **nur lokal** in `Needs Visual Review` und sind für Claude nicht lesbar, bis ein Mensch sie ausdrücklich freigibt.

## Keine Runtime-Installation

v3.2 enthält Parser, PII-Engine und Paketlogik im MCPB. Der Server führt beim Benutzer **kein `npm install`, kein Python-Setup und keinen Modell-Download** aus. Für Windows-Visualfunktionen werden lokale Windows-Komponenten verwendet. Wenn OCR/Rasterisierung nicht verfügbar ist, bleibt das Asset fail-closed in der Review-Queue.

## Sicherheit

- Originaldateien sind nicht über ein Read-Tool erreichbar.
- Output-Markdown und Assets sind SHA-256-gebunden; nachträgliche Manipulation blockiert Read-Tools.
- Kein persistentes Identitäts-Mapping.
- Audit enthält Hash/Typ/Zähler, aber keinen Rohinhalt und keinen Originaldateinamen.
- Dokument-/OCR-Inhalt wird als untrusted data behandelt.
- Keine Aussage „rechtlich anonym“ oder „EU-AI-Act-zertifiziert“.

## EU AI Act

Der Privacy-Schritt entscheidet nicht über die Risikoklasse des nachgelagerten Einsatzes. Bewerber- oder Beschäftigtenanalyse kann je nach Zweck Annex-III-Beschäftigungsanwendungen betreffen. Insbesondere Ranking/Scoring/Filterung, Beförderungs-/Kündigungsentscheidungen, Monitoring oder bestimmte auf Verhalten/Persönlichkeitsmerkmalen basierende Aufgabenzuweisungen müssen separat klassifiziert und governed werden.

## Installation

Claude Desktop → Settings/Einstellungen → Extensions → Advanced settings/Erweiterte Einstellungen → Extension Developer → Install Extension… → `.mcpb` auswählen.

Danach: `Öffne meinen Privacy-Ordner` → Datei nach `Input` → `Anonymisiere das nächste Dokument`.

## Release-Status

RC1. Parser-, PII-, Visual-, MCP-, Hash/Tamper- und Packaging-Tests sind enthalten. Windows OCR/EMF-Rasterisierung kann in dieser Linux-Buildumgebung nur statisch bzw. über Mock-Gates getestet werden; der finale Abnahmetest muss einmal auf dem Ziel-Windows-PC erfolgen.

## Entwicklung und Tests

Die Runtime benötigt beim Anwender keine npm- oder Python-Installation. Für Entwicklung/CI wird Python ausschließlich zum Erzeugen synthetischer Testfixtures und zum Packen der `.mcpb` verwendet.

```bash
python tests/make-fixtures.py
npm test
python scripts/build_mcpb.py
```

Das Buildskript erzeugt `dist/EU-Privacy-Document-Gateway-Windows-v3.2.0-rc1.mcpb`. Echte personenbezogene Dokumente gehören **nicht** in `tests/fixtures/`.
