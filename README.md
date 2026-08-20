# DataSecure Privacy Preflight v3.2.0 RC2

> **Sicherheits-Hinweis für dieses öffentliche Repository:** Niemals echte Mitarbeiter-, Bewerber-, Kunden- oder Vertragsdokumente, Mapping-Dateien, Privacy-Output oder Zugangsdaten committen. Repository-Tests verwenden ausschließlich synthetische Daten.

DataSecure ist jetzt **Plugin-first** aufgebaut: Claude Skills übernehmen Routing, Zweck-/Profilwahl und Governance; ein gebündelter lokaler MCP-Server bildet die technische Privacy-Grenze und verarbeitet Quelldateien, bevor Claude deren Inhalt verwendet.

Anthropic unterstützt Plugins in Claude Chat (Web und Desktop) sowie Cowork. Skills funktionieren in Chat und Cowork; Plugins können lokale MCP-Server bündeln. Der Standalone-MCPB bleibt als Fallback-Artefakt für direkte Claude-Desktop-Extension-Installationen erhalten.

## Zielworkflow

```text
PDF / DOCX / XLSX / PPTX
          ↓
   lokaler Privacy-MCP
          ↓
 Text + Bilder prüfen
          ↓
 Privacy-Paket
 ├─ anonymisiertes Markdown
 ├─ freigegebene PNG-Assets
 ├─ manifest.json
 └─ audit.json
          ↓
        Claude
```

Wenn die Anforderung lautet, dass Rohdaten **vor** Modellverarbeitung bereinigt werden müssen, soll die Originaldatei nicht direkt in den Chat hochgeladen oder hineinkopiert werden. Stattdessen nutzt der Anwender den lokalen `Claude Privacy/Input`-Ordner.

## Plugin-Komponenten

- `data-secure-preflight`: Hauptworkflow und Sicherheitsgrenze
- `data-secure-customer`: Kundendokumente
- `data-secure-personnel`: Mitarbeiter-/Beraterprofile
- `data-secure-applicant`: Bewerbungen/CVs
- `data-secure-contract`: Verträge
- `data-secure-general`: allgemeine Geschäftsdokumente
- `data-secure-compliance`: DSGVO-/AI-Act-Governance-Hinweise
- lokaler MCP unter `.mcp.json`

## Unterstützte Inputs

- PDF mit extrahierbarem Textlayer; komplexe/Scan-PDFs fail-closed
- DOCX
- XLSX
- PPTX
- TXT, MD, CSV

## Privacy-Profile

- `customer`
- `applicant`
- `personnel_profile`
- `contract`
- `general`
- `auto`

`personnel_profile` entfernt direkte Identifikatoren und pseudonymisiert/generalisiert Arbeitgeber, Kunden, konkrete Projektbezeichnungen und genaue Standorte als Quasi-Identifikatoren. Rollen, Skills, Zertifizierungen, Methoden, Technologien und Projektzeiträume sollen möglichst erhalten bleiben.

## Visuelle Assets

Grafiken werden nicht still verworfen. Automatisch freigegebene Rastergrafiken landen im Privacy-Paket. Unsichere, OCR-arme oder bei Personal-/Bewerberprofilen zurückgehaltene Grafiken bleiben ausschließlich lokal unter `Needs Visual Review`, bis ein Mensch sie ausdrücklich freigibt.

## Sicherheit

- Originaldateien sind nicht über ein MCP-Read-Tool erreichbar.
- Claude kann nur freigegebenes Markdown und freigegebene PNGs lesen.
- Output-Markdown und Assets sind SHA-256-gebunden; Manipulation blockiert die Read-Tools.
- Kein persistentes Identitäts-Mapping.
- Audit enthält keine Rohwerte oder Originaldateinamen.
- Dokument-/OCR-Inhalt wird als untrusted data behandelt.
- Keine Behauptung von rechtlicher Anonymität, DSGVO-Zertifizierung oder EU-AI-Act-Zertifizierung.

## EU AI Act

Privacy-Preprocessing ist vom nachgelagerten AI-Zweck getrennt. Insbesondere Bewerber-Ranking/-Filterung, Beschäftigtenbewertung, Beförderung/Kündigung, Monitoring oder materiell relevante Aufgabenzuweisungen müssen separat klassifiziert und governed werden.

## Build-Artefakte

```bash
npm test
npm run build
```

Erzeugt werden:

- `DataSecure-Privacy-Preflight-v3.2.0-rc2.zip` – primäres Claude-Plugin für manuellen Plugin-Marketplace-Upload/Pilot
- `EU-Privacy-Document-Gateway-Windows-v3.2.0-rc2.mcpb` – Standalone-Fallback für Claude Desktop Extensions

Der Plugin-Build kopiert den getesteten kanonischen Runtime-Code aus `/server` in das ZIP. Endanwender führen weder npm noch Python aus.

## Synthetische Tests

`tests/fixtures/synthetic-personnel-profile.md` und `tests/expected/synthetic-personnel-profile.expected.md` bilden einen vollständig erfundenen Regressionstest ab. `docs/SYNTHETIC_TEST_REPORT.md` ist ausdrücklich als Demo-/Sollreport gekennzeichnet und kein Produktivtestnachweis.

## Repository/Organisation

Für einen organisationsweit über GitHub synchronisierten Claude-Plugin-Marketplace muss das Repository laut aktueller Claude-Dokumentation **private oder internal** sein. Solange dieses Repo öffentlich ist, eignet sich der Plugin-ZIP-Upload für den Pilot; vor einer Organisations-Synchronisierung sollte die Sichtbarkeit geändert und der Marketplace final abgenommen werden.

## Release-Status

RC2 ist für Pilot/Abnahme vorgesehen. Parser-, PII-, Visual-, MCP-, Hash/Tamper-, Plugin-Struktur- und Packaging-Tests laufen automatisiert bzw. im lokalen Release-Test. Windows OCR/EMF-Rasterisierung muss abschließend auf einem echten Ziel-Windows-PC abgenommen werden.
