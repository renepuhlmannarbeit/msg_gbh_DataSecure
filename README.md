# GBH DataSecure – Dokumente anonymisieren v3.2.0 RC23

> **Sicherheits-Hinweis:** Niemals echte Mitarbeiter-, Bewerber-, Kunden- oder Vertragsdokumente, Mapping-Dateien, Privacy-Output oder Zugangsdaten committen. Das gilt unabhängig davon, dass das Repository privat ist — ein Commit ist dauerhaft, repliziert in jeden Klon und unterliegt keiner Löschfrist. Repository-Tests verwenden ausschließlich synthetische Daten. Siehe [SECURITY.md](SECURITY.md).

DataSecure ist jetzt **Plugin-first** aufgebaut: Claude Skills übernehmen Routing, Zweck-/Profilwahl und Governance; ein gebündelter lokaler MCP-Server bildet die technische Privacy-Grenze und verarbeitet Quelldateien, bevor Claude deren Inhalt verwendet.

Anthropic unterstützt Plugin-Skills in Claude Chat (Web und Desktop) sowie Cowork.
Der lokale MCP-Dateizugriff steht nach aktueller Claude-Dokumentation jedoch nur in
Claude Desktop beziehungsweise Claude Code zur Verfügung. Web und Cowork dürfen
daher nur bereits bereinigte Outputs nutzen oder den Ablauf erklären, niemals
Originaldateien zur angeblich lokalen Vorverarbeitung annehmen. Der Standalone-MCPB
bleibt als Fallback-Artefakt für direkte Claude-Desktop-Extension-Installationen
erhalten.

## Zielworkflow

```text
DOCX / XLSX / PPTX / TXT / MD / CSV / PNG / JPEG / BMP
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

Wenn Rohdaten **vor** der Modellverarbeitung bereinigt werden müssen, wird das Original weder direkt in den Chat hochgeladen noch hineinkopiert. Nach außen gibt es einen Einstieg: „Anonymisiere eine oder mehrere Dateien lokal.“ DataSecure wählt den passenden lokalen Weg und verwendet danach nur die erzeugten Privacy-Pakete.

Bis zu 25 TXT-/DOCX-Dateien können gemeinsam im privaten Dateidialog ausgewählt werden. DataSecure verarbeitet sie nacheinander und öffnet unter Windows je Datei die lokale Textprüfung. Andere freigegebene Formate oder ein formatgemischter Stapel werden gemeinsam in `Claude Privacy/Input` abgelegt und ebenfalls nacheinander verarbeitet. Jede Datei erhält ein eigenes Markdown-Paket; ein Fehler bei einer Datei blockiert die übrigen nicht. Der Dokumenttyp muss nicht für jede Datei angegeben werden: Gemischte Dokumentarten verwenden intern `profile=auto`. Eigenständige Bilder brauchen vor der OCR eine Zweckangabe. PDF ist in RC23 vollständig gesperrt und erzeugt bis zum belegten nativen Coverage-Pfad kein Paket. Gestoppte Läufe werden nicht automatisch wiederholt.

Wenn ausdrücklich reine Markdown-Ausgabe ohne Bilder gewünscht ist, entfernt `remove_images=true` bekannte Bildanlagen in texttragenden Office-Dateien lokal und vermerkt dies in der `.md`. Unbekannte eingebettete Objekte sowie eigenständige Bilder und Scans bleiben weiterhin durch die Sicherheitsgrenzen geschützt.

Für lokale Abbrüche führt DataSecure ein auf 14 Tage und 200 Ereignisse begrenztes Diagnosejournal. `diagnostic_status` zeigt ausschließlich Verarbeitungsphase, Formatklasse, Profil, Zähler und feste Fehlercodes; Dateinamen, Pfade, Dokumentinhalt, erkannte Werte und Dokument-Hashes werden weder gespeichert noch ausgegeben.

## Plugin-Komponenten

- `gbh-datasecure-dokument-anonymisieren`: gemeinsamer Hauptworkflow mit passender Profilwahl für alle unterstützten Dokumentarten
- `gbh-datasecure-datenschutz-erklaeren`: Schutzgrenzen, Aufbewahrung, Audit sowie DSGVO-/EU-AI-Act-Hinweise
- lokaler MCP unter `.mcp.json`

## Unterstützte Inputs

- PDF derzeit fail-closed gesperrt; der bisherige Engineering-Spike belegt Packaging und Basis-API, ist aber ausdrücklich keine Produktfreigabe. Ziel bleibt ein eigener nativer, isolierter PDFium-Worker mit positivem Text-/Objekt-/Unicode-Coverage-Nachweis
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

Bei Zertifizierungen entscheidet der Kontext, nicht eine starre Namensliste: Ein
ausdrücklicher Zertifikatsabschnitt oder eine eindeutige Zertifikatsbezeichnung
wird automatisch erhalten; ein nur kataloggestützter Organisations-Treffer wird
im lokalen Review gelb markiert. Der Mitarbeiter muss ihn als Zertifizierung
erhalten oder anonymisieren. Ohne diese Entscheidung gibt es keine Freigabe.

## Visuelle Assets

Grafiken werden nicht still verworfen. Automatisch freigegebene Rastergrafiken landen im Privacy-Paket. Unsichere, OCR-arme oder bei Personal-/Bewerberprofilen zurückgehaltene Grafiken bleiben ausschließlich lokal unter `Needs Visual Review`. Die Freigabe ist über Claude bewusst deaktiviert, bis der lokale Companion eine echte menschliche Handlung technisch belegen kann.

## Sicherheit

- Originaldateien sind nicht über ein MCP-Read-Tool erreichbar.
- Claude kann nur freigegebenes Markdown und freigegebene PNGs lesen.
- Output-Markdown und Assets sind SHA-256-gebunden; Manipulation blockiert die Read-Tools.
- Kein persistentes Identitäts-Mapping.
- Neue und erfolgreich migrierte Audit-Receipts enthalten keine Rohwerte, Originaldateinamen, exakten Dateigrößen oder verknüpfbaren Dokument-/Wert-Hashes; ein nicht migrierbarer Altbestand blockiert weitere Verarbeitung.
- Status, Paketmanifest und Audit-Receipt nennen die eigenständige Regelwerkversion; bekannte Zertifikatsanbieter sind nur lokale Erkennungshinweise und keine Online-Wahrheitsquelle.
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

- `DataSecure-Privacy-Preflight-v3.2.0-rc23.zip` – Claude-Plugin für manuellen Plugin-Marketplace-Upload/Engineering-Abnahme
- `EU-Privacy-Document-Gateway-Windows-v3.2.0-rc23.mcpb` – Standalone-Fallback für Claude Desktop Extensions

Der Plugin-ZIP-/Marketplace-Weg startet derzeit den Befehl `node`. Ob Claude diesen
in der jeweiligen Plugin-Oberfläche aus seiner eingebauten Runtime oder nur aus dem
Systempfad auflöst, ist noch durch den frischen Installationstest zu belegen; bis dahin
darf für diesen Weg keine installationsfreie Zusage gemacht werden. Für das Windows-
MCPB stellt Claude Desktop laut aktueller Anthropic-Dokumentation eine eingebaute
Node.js-Runtime bereit. vNext soll beide Wege durch einen signierten
plattformspezifischen Companion mit nachgewiesener Installationsherkunft ersetzen.

`plugins/data-secure` ist der kanonische Produktbaum: Runtime (`server/`), Windows-Helper (`scripts/`) und Skills liegen dort. Der normale Build ersetzt nichts — was ein Marketplace-Install direkt aus dem Repository auflöst, ist identisch mit dem ZIP-Inhalt. Gepackt wird mit einem ZIP-Writer auf `node:zlib`; dabei wird das committed Windows-x64-Binary geprüft, aber nur durch den ausdrücklich getrennten Maintainer-Befehl `native:update` ersetzt. Endanwender führen weder npm noch Python aus.

## Tests

```bash
npm test
```

556 Assertion-Fälle plus Plugin-Strukturprüfung, insgesamt **557 Prüfungen**, über Manifest-/Agentenkonsistenz, den nativen Windows-Job-Object-Launcher, isolierte Parserprozesse, PII-Regression, lokale Skill-Abnahme, Zertifikatskatalog, Bildcodecs, begrenzte Windows-OCR-/Raster-Bridge, Visual-Gate, Retention/Löschung, Audit- und Diagnose-Datensparsamkeit, Companion-Jobvertrag, -Retention, privaten IPC/Mehrfach-Picker, TXT-/DOCX-Verarbeitung, datensparsame Stapel-Abschlussanzeige, Bildentfernung und gemischte Stapelläufe, Gateway-E2E, MCP-Protokoll, SARIF-Release-Gate sowie Adversarial- und alternative Repräsentations-Suites. Die Skill-Abnahme verarbeitet zehn vollständig erfundene Verträge mit zwanzig öffentlichen Unternehmensnamen. Eine zusätzliche deterministische Ground-Truth-Matrix prüft 150 Konstellationen aus 30 Unternehmensnamen, 30 erfundenen Personen, zehn Straßen, zehn Orten und sechs Vertragslayouts. Dabei müssen 1.950 sensitive Entitäten verschwinden und 900 Kontrollen für Leistung, Betrag, Laufzeit, Kündigungsfrist, Haftung und Zertifizierung erhalten bleiben. Der neutrale Detektor-Benchmark meldet dafür Precision, Recall, F1, schweregewichtete False Negatives und Inhaltsverlust; das ist eine synthetische Regressionsbaseline und keine allgemeine Genauigkeitszusage. `npm run test:plugin-zip` wiederholt beide Skill-Prüfungen gegen die Dateien des tatsächlich gebauten Plugin-ZIP. Die nativen Tests belegen geerbten pfadlosen Input, `ACTIVE_PROCESS=1`, Prozess-/Jobspeicher-, CPU- und Wallclock-Grenzen, `KILL_ON_JOB_CLOSE`, Paketkonsistenz/PE-x64-Prüfung, native AMD64-Hostprobe und den fehlenden unsandboxed Fallback. Die Regressionen decken außerdem verschachtelte Word-Textfelder, Zertifikate im Abschnitt, Fließtext und OCR-Pfad, Organisationsnamen mit kleingeschriebener Rechtsform, positionsbezogene Organisations-/Personenüberlappungen, Schutz von fachlichem Text hinter gewöhnlichen Bindewörtern, zusammengesetzte Rechtsformen, denselben Organisationsnamen in Zertifikats- und Kundenrolle, die Abgrenzung zu langen Projektbeschreibungen sowie IT-/Test-/Produkt-/Business-Analysis-/Health-IT-Fachvokabular ab. Die separate reale Windows-Visual-Abnahme prüft zusätzlich OCR, Redaction, Kontroll-OCR und die sichere Ablehnung fehlerhafter EMF-Dateien. Die Suite besitzt keine npm-Laufzeitabhängigkeiten. Office-/PDF-/Bild-Fixtures werden generiert und nicht committet; CI schlägt fehl, sobald ein echtes Dokument getrackt würde.

`tests/expected/synthetic-personnel-profile.expected.md` ist ein **generiertes** Golden-File. Nach einer beabsichtigten Verhaltensänderung: `npm run test:golden`, Diff prüfen, dann committen.

Details: [docs/TESTING.md](docs/TESTING.md).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/ANLEITUNG.md](docs/ANLEITUNG.md) | **Für Anwender:** Installation Schritt für Schritt, täglicher Ablauf, Platzhalter, Grenzen |
| [docs/IT-BETRIEBSHANDBUCH.md](docs/IT-BETRIEBSHANDBUCH.md) | **Für IT/Admins:** Installation, Verteilung, Update, Rollback, Betrieb und Support |
| [docs/PILOT-ABNAHME.md](docs/PILOT-ABNAHME.md) | **Für Pilotverantwortliche:** synthetische Go/No-Go-Abnahme ohne Echtdaten |
| [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md) | Sicherheitsgrenze, was Claude erreicht, alle Fail-Closed-Punkte |
| [docs/PLUGIN_TARGET_ARCHITECTURE.md](docs/PLUGIN_TARGET_ARCHITECTURE.md) | Zielarchitektur Plugin + lokaler MCP |
| [docs/DEVELOPMENT_BACKLOG.md](docs/DEVELOPMENT_BACKLOG.md) | Priorisiertes Produkt-, Plattform- und Security-Backlog für den einfachen Claude-Rollout |
| [docs/PRODUCT_ARCHITECTURE_DECISION.md](docs/PRODUCT_ARCHITECTURE_DECISION.md) | vNext-Entscheidung: lokale Datenschutzschleuse, Strangler-Modernisierung und Sprachstrategie |
| [docs/COMPANION_API_V1.md](docs/COMPANION_API_V1.md) | Versionierter Companion-Vertrag und monotones, datensparsames Jobmodell |
| [docs/COMPANION_IPC_V1.md](docs/COMPANION_IPC_V1.md) | Authentifizierter privater stdio-Kanal und nativer File-Picker-Vertrag |
| [docs/AI_ACT_AND_GDPR.md](docs/AI_ACT_AND_GDPR.md) | DSGVO-/AI-Act-Einordnung und Grenzen |
| [docs/TESTING.md](docs/TESTING.md) | Testsuite und Regressionsfälle |
| [docs/RELEASE.md](docs/RELEASE.md) | Build, Distribution, Release-Gate, Windows-Abnahme |
| [ARCHITECTURE_DECISION.md](ARCHITECTURE_DECISION.md) | Architekturentscheidung v3.2 |

## Repository/Organisation

Für einen organisationsweit über GitHub synchronisierten Claude-Plugin-Marketplace muss das Repository laut aktueller Claude-Dokumentation **private oder internal** sein. Diese Voraussetzung ist erfüllt: das Repository ist privat.

Beide Artefakte werden für die technische Abnahme gebaut und geprüft. Weder der Plugin-ZIP-Weg noch die `.mcpb`-Installation ist für Pilot oder Rollout freigegeben, bevor Neuinstallation, Upgrade, Rollback und Marketplace-Verteilung in einer frischen Zielumgebung sowie die Signatur geprüft sind. Die reale Windows-OCR-Abnahme ist am 21.08.2026 bestanden; die Windows-Abnahme der EMF/WMF-Rasterisierung bleibt offen. Checkliste in [docs/RELEASE.md](docs/RELEASE.md).

## Release-Status

RC23 ist nur für technische Engineering-Abnahme vorgesehen, nicht für einen Nutzerpilot mit echten Daten. Der TXT-/DOCX-Companion besitzt unter Windows eine lokale Human-Presence-Grenze und eine inhaltsfreie Abschlussanzeige für Mehrfachläufe. PDF bleibt nach adversarialem Security-Review bis zu einem belastbaren Page-/Font-/Visual-Coverage-Nachweis vollständig aus Dialog und Input-Veröffentlichung gesperrt; `privacy_status` führt PDF deshalb unter `blocked_inputs`, nicht unter den unterstützten Formaten. Dokumentparser sowie die Windows-PowerShell-Brücken für OCR und Raster starten auf Windows x64 ausschließlich über den gebündelten nativen Launcher: suspended, vor Resume einem Job Object zugewiesen, mit genau einem Prozess, Prozess-/Jobspeicher-, CPU- und Wallclock-Grenze, `KILL_ON_JOB_CLOSE` und expliziter Handle-Liste. Für OCR/Raster gelten 768 MiB, 90 Sekunden CPU und 115 Sekunden Job-Wallclock. SHA-256 und PE-x64-Prüfung belegen die interne Paketkonsistenz, nicht Herstellerherkunft oder Manipulationsschutz. Fehlt der Launcher, stimmt das Paketpaar nicht oder läuft das Plugin außerhalb Windows x64, gibt es weder für Parser noch Bildverarbeitung einen direkten Fallback. Noch offen sind Authenticode/geschützter Installationspfad, Windows ARM64, AppContainer als OS-Netz-/Dateisystemgrenze, frische Installation/Upgrade/Rollback und menschliche Usability-Abnahme. Bis dahin bleiben klinische Echtdaten und ein Nutzerpilot gesperrt. JavaScript und der native C++-Launcher werden getrennt mit CodeQL geprüft; CI verifiziert zusätzlich beide Paketformen, die Parser-/Visual-Statusantwort und den echten Windows-OCR-/Redaktionspfad unter dem Job Object.

Die reale Windows-OCR-Abnahme gegen ein synthetisch gerendertes Scan-Bild ist am 21.08.2026 bestanden. Offen bleibt die EMF/WMF-Rasterisierung über die PowerShell-Bridge. Meldet `privacy_status` `visual_bridge: unavailable`, arbeitet der Textpfad weiter und alle Grafiken werden zurückgehalten — das ist der beabsichtigte degradierte Modus. Checkliste: [docs/RELEASE.md](docs/RELEASE.md).
