# Test Report — v3.2.0 RC1

Datum: 20.08.2026

## Ergebnis

Alle in der Build-Umgebung ausführbaren Tests sind **PASS**.

| Test | Ergebnis |
|---|---|
| Manifest/Offline-Prüfung | PASS |
| DOCX Parser | PASS |
| XLSX Parser | PASS |
| PPTX Parser | PASS |
| PDF Textlayer Parser | PASS |
| Reales 14-seitiges Mitarbeiterprofil | PASS |
| `personnel_profile` Auto-Erkennung | PASS |
| bekannte direkte/quasi Identifikatoren im Realtest entfernt | PASS |
| fachliche Kerninformationen im Realtest erhalten | PASS |
| PNG/BMP Encode/Decode/Redaction | PASS |
| OCR-Bounding-Box → PII-Redaction (Mock) | PASS |
| Visual Fail-Closed | PASS |
| Personalprofil: Visuals standardmäßig Review | PASS |
| XLSX End-to-End → Paket | PASS |
| PPTX End-to-End → Paket | PASS |
| PDF End-to-End → Paket | PASS |
| DOCX Realtest End-to-End → Paket | PASS |
| Markdown SHA-256 Tamper Gate | PASS |
| Asset SHA-256 Tamper Gate | PASS |
| Human Visual Approval Gate | PASS |
| MCP initialize / tools/list / prompts/list / tools/call | PASS |
| keine Runtime-`npm install`-Logik | PASS |
| keine Netzwerk-Downloadbefehle in Windows-Bridges | PASS |

## Realtest

Das vom Nutzer bereitgestellte Mitarbeiterprofil wird mit dem eigenständigen DOCX-Parser gelesen. Der Parser extrahiert rund 20k Zeichen und vier visuelle Medienobjekte (PNG, JPEG und zwei EMF). Das Profil wird als `personnel_profile` klassifiziert. Bekannte Test-Identifier wie Personenname, Arbeitgeber, genauer Standort sowie konkrete Kundenbezeichnungen werden im Output nicht mehr gefunden; fachliche Begriffe wie Product Owner, Business Analyst, Generative KI, Jira, Confluence und Scrum bleiben erhalten.

Das Originaldokument wird **nicht** in Quellcode, Tests oder Auslieferungs-ZIP eingebettet.

## Nicht vollständig testbar in dieser Linux-Buildumgebung

Die Windows-spezifischen Bridges `Windows.Media.Ocr` und `System.Drawing` können hier nicht gegen die echte Windows Runtime ausgeführt werden. Ihre Fehlerpfade sind fail-closed: Wenn OCR/Rasterisierung auf dem Zielgerät nicht funktioniert, wird das betroffene Asset nicht automatisch an Claude freigegeben. Die endgültige Abnahme sollte daher einmal auf dem Ziel-Windows-PC erfolgen.

## Release-Kriterium

RC1 ist für Pilot/Abnahme vorgesehen. Vor breitem HR-/Kunden-Rollout: Ziel-Windows-Test mit je einem DOCX/XLSX/PPTX/PDF und mindestens einem EMF/JPEG-Bild durchführen.

## Packaging-Smoke-Test

Nach Erstellung der `.mcpb` wurde **genau das gepackte Archiv** in einen neuen Ordner entpackt und erneut geprüft:

- `manifest.json` am Paketroot: PASS
- alle Server-JavaScript-Dateien `node --check`: PASS
- keine Runtime-Installations-/Downloadbefehle in `server/`/`scripts/`: PASS
- gepackter DOCX/XLSX/PPTX/PDF-Parser: PASS
- gepackter MCP-Server `initialize`: PASS
- gepackter MCP-Server `tools/list`: PASS
- gepacktes Tool `privacy_status`: PASS (`runtime_dependency_install=false`)

Die reale Nutzerdatei und deren personenbezogene Namen sind weder im MCPB noch im Source-/Docs-Paket enthalten.
