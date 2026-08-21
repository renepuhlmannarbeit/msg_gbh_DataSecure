# DataSecure Privacy Preflight v3.2.0 RC8

> **Sicherheits-Hinweis:** Niemals echte Mitarbeiter-, Bewerber-, Kunden- oder Vertragsdokumente, Mapping-Dateien, Privacy-Output oder Zugangsdaten committen. Das gilt unabhängig davon, dass das Repository privat ist — ein Commit ist dauerhaft, repliziert in jeden Klon und unterliegt keiner Löschfrist. Repository-Tests verwenden ausschließlich synthetische Daten. Siehe [SECURITY.md](SECURITY.md).

DataSecure ist jetzt **Plugin-first** aufgebaut: Claude Skills übernehmen Routing, Zweck-/Profilwahl und Governance; ein gebündelter lokaler MCP-Server bildet die technische Privacy-Grenze und verarbeitet Quelldateien, bevor Claude deren Inhalt verwendet.

Anthropic unterstützt Plugins in Claude Chat (Web und Desktop) sowie Cowork. Skills funktionieren in Chat und Cowork; Plugins können lokale MCP-Server bündeln. Der Standalone-MCPB bleibt als Fallback-Artefakt für direkte Claude-Desktop-Extension-Installationen erhalten.

## Zielworkflow

```text
PDF / DOCX / XLSX / PPTX / PNG / JPEG / BMP
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

- PDF mit extrahierbarem Textlayer; reine Scans mit extrahierbaren JPEG-Seitenbildern laufen über OCR, andere komplexe Scans fail-closed
- DOCX
- XLSX
- PPTX
- TXT, MD, CSV
- PNG, JPEG und BMP als eigenständige Bild-/Scan-Dateien

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

- `DataSecure-Privacy-Preflight-v3.2.0-rc8.zip` – primäres Claude-Plugin für manuellen Plugin-Marketplace-Upload/Pilot
- `EU-Privacy-Document-Gateway-Windows-v3.2.0-rc8.mcpb` – Standalone-Fallback für Claude Desktop Extensions

`plugins/data-secure` ist der kanonische Produktbaum: Runtime (`server/`), Windows-Helper (`scripts/`) und Skills liegen dort. Der Build ersetzt nichts — was ein Marketplace-Install direkt aus dem Repository auflöst, ist identisch mit dem ZIP-Inhalt. Gepackt wird mit einem ZIP-Writer auf `node:zlib`, dadurch läuft `npm run build` unter Windows und unter Linux-CI ohne externes `zip`-Binary. Endanwender führen weder npm noch Python aus.

## Tests

```bash
npm test
```

228 Fälle über Manifest-/Agentenkonsistenz, Parser, PII-Regression, Bildcodecs, Visual-Gate, Retention/Löschung, Gateway-E2E, MCP-Protokoll sowie Adversarial- und alternative Repräsentations-Suites (feindlicher Dokumentinhalt, Unicode-Tarnung, alternative Telefon-/Adress-/Namensformen, ReDoS, mutierte Container, Determinismus, Nebenläufigkeit) — ohne npm-Abhängigkeiten. Die Office-/PDF-/Bild-Fixtures werden generiert und nicht committet; CI schlägt fehl, sobald ein echtes Dokument getrackt würde.

`tests/expected/synthetic-personnel-profile.expected.md` ist ein **generiertes** Golden-File. Nach einer beabsichtigten Verhaltensänderung: `npm run test:golden`, Diff prüfen, dann committen.

Details: [docs/TESTING.md](docs/TESTING.md).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/ANLEITUNG.md](docs/ANLEITUNG.md) | **Für Anwender:** Installation Schritt für Schritt, täglicher Ablauf, Platzhalter, Grenzen |
| [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md) | Sicherheitsgrenze, was Claude erreicht, alle Fail-Closed-Punkte |
| [docs/PLUGIN_TARGET_ARCHITECTURE.md](docs/PLUGIN_TARGET_ARCHITECTURE.md) | Zielarchitektur Plugin + lokaler MCP |
| [docs/DEVELOPMENT_BACKLOG.md](docs/DEVELOPMENT_BACKLOG.md) | Priorisiertes Produkt-, Plattform- und Security-Backlog für den einfachen Claude-Rollout |
| [docs/AI_ACT_AND_GDPR.md](docs/AI_ACT_AND_GDPR.md) | DSGVO-/AI-Act-Einordnung und Grenzen |
| [docs/TESTING.md](docs/TESTING.md) | Testsuite und Regressionsfälle |
| [docs/RELEASE.md](docs/RELEASE.md) | Build, Distribution, Release-Gate, Windows-Abnahme |
| [ARCHITECTURE_DECISION.md](ARCHITECTURE_DECISION.md) | Architekturentscheidung v3.2 |

## Repository/Organisation

Für einen organisationsweit über GitHub synchronisierten Claude-Plugin-Marketplace muss das Repository laut aktueller Claude-Dokumentation **private oder internal** sein. Diese Voraussetzung ist erfüllt: das Repository ist privat.

Damit sind beide Distributionswege offen — der manuelle Plugin-ZIP-Upload für den Pilot und die GitHub-Synchronisierung für den Organisations-Rollout. Vor dem Rollout fehlen noch die Marketplace-Abnahme und die Windows-Abnahme der EMF/WMF-Rasterisierung; die reale Windows-OCR-Abnahme ist am 21.08.2026 bestanden. Checkliste in [docs/RELEASE.md](docs/RELEASE.md).

## Release-Status

RC8 ist für Pilot/Abnahme vorgesehen. Manifest-, Agenten-, Parser-, PII-, Bild-, Visual-, Retention-, MCP-, Hash/Tamper- und Packaging-Tests laufen in CI auf `ubuntu-latest` und `windows-latest`; CI verifiziert zusätzlich, dass das gepackte Plugin tatsächlich startet.

Die reale Windows-OCR-Abnahme gegen ein synthetisch gerendertes Scan-Bild ist am 21.08.2026 bestanden. Offen bleibt die EMF/WMF-Rasterisierung über die PowerShell-Bridge. Meldet `privacy_status` `visual_bridge: unavailable`, arbeitet der Textpfad weiter und alle Grafiken werden zurückgehalten — das ist der beabsichtigte degradierte Modus. Checkliste: [docs/RELEASE.md](docs/RELEASE.md).
