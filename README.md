# GBH DataSecure – Dokumente anonymisieren v3.2.0 RC57

> **Sicherheits-Hinweis:** Niemals echte Mitarbeiter-, Bewerber-, Kunden- oder Vertragsdokumente, Mapping-Dateien, Privacy-Output oder Zugangsdaten committen. Das gilt unabhängig davon, dass das Repository privat ist — ein Commit ist dauerhaft, repliziert in jeden Klon und unterliegt keiner Löschfrist. Repository-Tests verwenden ausschließlich synthetische Daten. Siehe [SECURITY.md](SECURITY.md).

DataSecure ist jetzt **Plugin-first** aufgebaut: Claude Skills übernehmen Routing, Zweck-/Profilwahl und Governance; ein gebündelter lokaler MCP-Server bildet die technische Privacy-Grenze und verarbeitet Quelldateien, bevor Claude deren Inhalt verwendet.

> **Ist und Ziel nicht verwechseln:** Der ausführbare RC57-Umfang wird in dieser
> README und im Betriebshandbuch beschrieben. Alle verbindlich getroffenen
> Produktentscheidungen und das einzige gültige Entwicklungsbacklog stehen im
> [kanonischen Dokumentensystem](docs/canonical/README.md).

Anthropic unterstützt Plugin-Skills in Claude Chat und Cowork. Der lokale
MCP-Dateizugriff benötigt jedoch einen Claude-Desktop-Host oder Claude Code und muss
in der konkreten Unterhaltung tatsächlich als Werkzeug verfügbar sein. Das wurde im
Zielbuild auch in Cowork Desktop beobachtet, bleibt aber versionsabhängig und wird vor
jeder Freigabe erneut getestet. Web- und Mobiloberflächen dürfen nur bereits
bereinigte Outputs nutzen oder den Ablauf erklären, niemals Originaldateien zur
angeblich lokalen Vorverarbeitung annehmen. Der Standalone-MCPB bleibt als
Fallback-Artefakt für direkte Claude-Desktop-Extension-Installationen erhalten. Die
Claude-Desktop-App ist kein Linux-Auslieferungsweg; Linux bleibt ein Ziel für einen
lokalen Claude-Code-Host und benötigt dafür eine eigene Installationsabnahme.

## Zielworkflow

```text
DOCX / TXT (beaufsichtigter Pilot)
          ↓
   lokaler Privacy-MCP
          ↓
 Text prüfen, Bilder lokal zurückhalten
          ↓
 Privacy-Paket
 ├─ anonymisiertes Markdown
 ├─ keine automatisch freigegebenen Bildpixel
 ├─ manifest.json
 └─ audit.json
          ↓
        Claude
```

Wenn Rohdaten **vor** der Modellverarbeitung bereinigt werden müssen, wird das Original weder direkt in den Chat hochgeladen noch hineinkopiert. Nach außen gibt es einen Einstieg: „Anonymisiere eine oder mehrere Dateien lokal.“ DataSecure wählt den passenden lokalen Weg und verwendet danach nur die erzeugten Privacy-Pakete.

Bis zu 100 TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MiB werden einmal im lokalen Mehrfach-Dateidialog gewählt. Sichere Einzeldateigrenzen gelten zusätzlich: TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes sowie DOCX 64 MiB komprimiert und 128 MiB entpackt. Es gibt keine feste Seitenbegrenzung; diese Ressourcenlimits bleiben maßgeblich. Mit **„Öffnen“** ist die einzige Normalbestätigung erteilt. DataSecure prüft den vollständigen Stapel zuerst nur lesend. Erst danach erzeugt der getrennte lokale Worker versiegelte private Arbeitskopien für zulässige Kandidaten; ungültige, verschlüsselte oder noch nicht freigegebene Dateien erhalten ohne Quellkopie einen lokalen Einzelstopp, während die übrigen Dateien weiterlaufen. Anzahl, Identitäten und Hashes bleiben lokal. Die Quelle bleibt unverändert – auch bei einer späteren SharePoint-Anbindung darf DataSecure dort nur Leserechte verwenden. Ein Stopp wird serverseitig festgehalten, Änderungen am Original verändern den gestarteten Snapshot nicht. Der Standard `local_only` erzeugt lokal Markdown, Mapping und einen inhaltsfreien Nachweis, ohne dass Claude Ergebnisse lesen oder bestätigen muss. Nur bei ausdrücklich verlangter Folgeauswertung liest der gebündelte Cowork-Aufruf höchstens fünf freigegebene Markdown-Ergebnisse gleichzeitig, jeweils mit kurzlebiger Berechtigung. Ein Chat- oder Serverabbruch liefert dasselbe verifizierte Paket erneut, statt die Quelle doppelt zu verarbeiten. Jede Datei erhält einen ausschließlich lokalen Status in `DataSecure-Export/DataSecure-Mapping.csv`; nur erfolgreiche Dateien besitzen eine Ergebniskennung. Terminale Stapel ergänzen dort einen inhaltsfreien JSON-Nachweis ohne Namen, Pfade oder Dokumentinhalte. Markdown-Links, HTML und Bildreferenzen werden nicht geladen, sondern nur als Text durch die Datenschutzregeln verarbeitet. CSV-Zellen werden ausschließlich als Text verarbeitet und niemals ausgeführt. PDF und alle weiteren Formate bleiben im Pilot gesperrt.

Windows x64 besitzt die vollständigere Engineering-Grenze mit nativem Job Object und lokalem Text-Review. macOS und Linux verwenden für TXT/Markdown/CSV/DOCX den Node-Permission-Prozess; er ist Defense-in-depth und keine harte Sicherheitsgrenze für native Speicherallokationen oder Prozessbäume. Beim Plugin-ZIP ist die dafür nötige Node-22.13+-Auflösung noch nicht installationsfrei belegt; beim MCPB stellt Claude Desktop eine eingebaute Node-Runtime bereit. Linux nutzt für begrenzte Zertifikatsentscheidungen Zenity oder KDialog ohne Rohtext in Argumenten. Der vorhandene macOS-Review ist wegen eines bekannten AppleScript-Aktionsfehlers derzeit nicht freigegeben. Freie Redaktionen und Bild/OCR-Freigabe sind außerhalb des Windows-Engineering-Pfads noch nicht produktionsreif. Bilder bleiben lokal oder werden auf ausdrücklichen Wunsch entfernt. Echte Mac-/Linux-Freigaben setzen harte Ressourcenlimits, CI und manuelle Zielplattformtests voraus.

Jede freigegebene Ausgabe ist Markdown ohne Bildpixel. Für „nur Markdown“ oder „Bilder nicht an Claude geben“ bleibt daher `remove_images=false`: Grafiken bleiben lokal zurückgehalten, und nur sicher erkannter Bildtext kann nach derselben Datenschutzprüfung in Markdown einfließen. `remove_images=true` ist allein ein strenger lokaler Verwerfmodus für Bildanlagen; er übernimmt keinen Bildtext und stoppt bei unbekannten Office-Objekten sicher.

Für lokale Abbrüche führt DataSecure ein auf 14 Tage und 200 Ereignisse begrenztes Diagnosejournal. Eine getrennte, ebenfalls 14 Tage aufbewahrte Ablaufspur protokolliert ausschließlich feste Übergänge wie Picker, Workerstart, privates IPC, Checkpoint, Verarbeitung, Review-Rekonstruktion, lokale Prüfoberfläche, Terminalzustand und lokale Abschlussanzeige. Damit lässt sich unterscheiden, ob eine Fortsetzung vor dem Worker, beim privaten IPC, vor der Oberfläche oder in der lokalen Prüfung gestoppt hat. `diagnostic_status` zeigt ausschließlich diese festen Ereignisse, Verarbeitungsphase, Formatklasse, Profil, begrenzte Zähler und Fehlercodes; Dateinamen, Pfade, Dokumentinhalt, erkannte Werte, Tokens und Dokument-Hashes werden weder gespeichert noch ausgegeben.

Auf ausdrücklichen Support- oder IT-Wunsch kann `export_diagnostic_package` nach
einer weiteren Bestätigung einen lokalen Diagnose-Schnappschuss erzeugen. Er enthält
nur diese bereinigten Metadaten und Prüfsummen der Programmkomponenten; er wird
niemals automatisch versendet.

## Plugin-Komponenten

- `gbh-datasecure-dokument-anonymisieren`: gemeinsamer Hauptworkflow mit passender Profilwahl für alle unterstützten Dokumentarten
- `gbh-datasecure-datenschutz-erklaeren`: Schutzgrenzen, Aufbewahrung, Audit sowie DSGVO-/EU-AI-Act-Hinweise
- lokaler MCP unter `.mcp.json`

## Pilot-Inputs

- PDF derzeit fail-closed gesperrt; der bisherige Engineering-Spike belegt Packaging und Basis-API, ist aber ausdrücklich keine Produktfreigabe. Ziel bleibt ein eigener nativer, isolierter PDFium-Worker mit positivem Text-/Objekt-/Unicode-Coverage-Nachweis
- DOCX, sofern der Parser keine Coverage-Warnung meldet
- UTF-8-TXT
- XLSX, PPTX, PNG, JPEG, BMP und PDF derzeit fail-closed gesperrt; Markdown ist als `.md` und `.markdown` freigegeben

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

Grafiken werden nicht still verworfen und im öffentlichen Pilot grundsätzlich nicht an Claude freigegeben. Sie bleiben lokal unter `Needs Visual Review`; OCR-Text darf erst nach der normalen Textprüfung in das Markdown einfließen. Ein späterer lokaler Companion müsste eine echte menschliche Handlung technisch belegen, bevor dafür überhaupt ein eigener Freigabepfad eingeführt wird.

## Sicherheit

- Originaldateien sind nicht über ein MCP-Read-Tool erreichbar.
- Claude kann freigegebenes Markdown nur mit der kurzlebigen Leseberechtigung desselben Laufs lesen; Paket-IDs und historische Paketlisten reichen nicht.
- Bildpixel bleiben im Pilot lokal und werden nicht automatisch freigegeben.
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

- `DataSecure-Privacy-Preflight-v3.2.0-rc60.zip` – Claude-Plugin für manuellen Plugin-Marketplace-Upload/Engineering-Abnahme
- `DataSecure-Privacy-Gateway-v3.2.0-rc60.mcpb` – plattformneutraler Standalone-Fallback für Claude Desktop Extensions

Der Plugin-ZIP-/Marketplace-Weg startet derzeit den Befehl `node`. Ob Claude diesen
in der jeweiligen Plugin-Oberfläche aus seiner eingebauten Runtime oder nur aus dem
Systempfad auflöst, ist noch durch den frischen Installationstest zu belegen; bis dahin
darf für diesen Weg keine installationsfreie Zusage gemacht werden. Für das Windows-
MCPB stellt Claude Desktop laut aktueller Anthropic-Dokumentation eine eingebaute
Node.js-Runtime bereit. vNext soll beide Wege durch automatisch ausgewählte
plattformspezifische Komponenten mit nachgewiesener Test- und Artefaktparität ersetzen.

`plugins/data-secure` ist der kanonische Produktbaum: Runtime (`server/`), Windows-Helper (`scripts/`) und Skills liegen dort. Der normale Build ersetzt nichts — was ein Marketplace-Install direkt aus dem Repository auflöst, ist identisch mit dem ZIP-Inhalt. Gepackt wird mit einem ZIP-Writer auf `node:zlib`; dabei wird das committed Windows-x64-Binary geprüft, aber nur durch den ausdrücklich getrennten Maintainer-Befehl `native:update` ersetzt. Endanwender führen weder npm noch Python aus.

## Tests

```bash
npm test
```

Die automatisierte Suite deckt Manifest-/Agentenkonsistenz, 29 versionierte Skill-Verhaltensfälle, isolierte Parser, PII- und Zertifikatsregressionen, den fortsetzbaren Mehrdateiablauf, Bild- und Visual-Gates, Retention, Audit-/Diagnose-Datensparsamkeit, Gateway-E2E, MCP-Protokoll und Adversarial-Fälle ab. Die Skill-Abnahme verarbeitet zehn vollständig erfundene Verträge mit zwanzig öffentlichen Unternehmensnamen. Eine zusätzliche deterministische Ground-Truth-Matrix prüft 150 Konstellationen; dabei müssen 1.950 sensitive Entitäten verschwinden und 900 fachliche Kontrollen erhalten bleiben. Das ist eine synthetische Regressionsbaseline und keine allgemeine Genauigkeitszusage. `npm run test:plugin-zip` wiederholt die Skill-Prüfungen gegen den tatsächlich gebauten Plugin-ZIP. Endanwender führen weder npm noch Python aus; echte Claude-Modellläufe und die installierte UI bleiben eine getrennte Pilotabnahme.

`tests/expected/synthetic-personnel-profile.expected.md` ist ein **generiertes** Golden-File. Nach einer beabsichtigten Verhaltensänderung: `npm run test:golden`, Diff prüfen, dann committen.

Details: [docs/TESTING.md](docs/TESTING.md).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/ANLEITUNG.md](docs/ANLEITUNG.md) | **Für Anwender:** Installation Schritt für Schritt, täglicher Ablauf, Platzhalter, Grenzen |
| [docs/IT-BETRIEBSHANDBUCH.md](docs/IT-BETRIEBSHANDBUCH.md) | **Für IT/Admins:** Installation, Verteilung, Update, Rollback, Betrieb und Support |
| [docs/PILOT-ABNAHME.md](docs/PILOT-ABNAHME.md) | **Für Pilotverantwortliche:** synthetische Go/No-Go-Abnahme ohne Echtdaten |
| [docs/ANWENDERREVIEW.md](docs/ANWENDERREVIEW.md) | Vollständige Anwenderreisen, beseitigte Ablaufprobleme und verbleibende Grenzen |
| [docs/canonical/README.md](docs/canonical/README.md) | Verbindliche Entscheidungen, Zielprodukt, Backlog und Traceability seit der historischen RC45-Baseline |
| [docs/canonical/CURRENT_STATE.md](docs/canonical/CURRENT_STATE.md) | Belegter Ist-/Soll-Abgleich jeder Backlogposition gegen den aktuellen Code und seine Tests |
| [docs/SKILL_EVALUATION.md](docs/SKILL_EVALUATION.md) | **Für Pilotverantwortliche:** Modellabnahme für Skill-Aktivierung, Werkzeugwahl und sichere Weiterverarbeitung |
| [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md) | Sicherheitsgrenze, was Claude erreicht, alle Fail-Closed-Punkte |
| [docs/PLUGIN_TARGET_ARCHITECTURE.md](docs/PLUGIN_TARGET_ARCHITECTURE.md) | Historische Architekturgrundlage; kanonische Entscheidungen haben Vorrang |
| [docs/DEVELOPMENT_BACKLOG.md](docs/DEVELOPMENT_BACKLOG.md) | Historischer Planungsstand; nicht mehr das aktive Backlog |
| [docs/PRODUCT_ARCHITECTURE_DECISION.md](docs/PRODUCT_ARCHITECTURE_DECISION.md) | Historische vNext-Grundlage; durch das kanonische Register präzisiert |
| [docs/COMPANION_API_V1.md](docs/COMPANION_API_V1.md) | Versionierter Companion-Vertrag und monotones, datensparsames Jobmodell |
| [docs/COMPANION_IPC_V1.md](docs/COMPANION_IPC_V1.md) | Authentifizierter privater stdio-Kanal und nativer File-Picker-Vertrag |
| [docs/AI_ACT_AND_GDPR.md](docs/AI_ACT_AND_GDPR.md) | DSGVO-/AI-Act-Einordnung und Grenzen |
| [docs/TESTING.md](docs/TESTING.md) | Testsuite und Regressionsfälle |
| [docs/RELEASE.md](docs/RELEASE.md) | Build, Distribution, Release-Gate, Windows-Abnahme |
| [ARCHITECTURE_DECISION.md](ARCHITECTURE_DECISION.md) | Architekturentscheidung v3.2 |

## Repository/Organisation

Für einen organisationsweit über GitHub synchronisierten Claude-Plugin-Marketplace muss das Repository laut aktueller Claude-Dokumentation **private oder internal** sein. Diese Voraussetzung ist erfüllt: das Repository ist privat.

Beide Artefakte werden für die technische Abnahme gebaut und geprüft. Weder der Plugin-ZIP-Weg noch die `.mcpb`-Installation ist für Pilot oder Rollout freigegeben, bevor Neuinstallation, Upgrade, Rollback und Marketplace-Verteilung in einer frischen Zielumgebung geprüft sind. Eine Signatur ist nach `DS-030` keine Freigabevoraussetzung; Prüfsummen belegen nur technische Konsistenz. Die reale Windows-OCR-Abnahme ist am 21.08.2026 bestanden; die Windows-Abnahme der EMF/WMF-Rasterisierung bleibt offen. Checkliste in [docs/RELEASE.md](docs/RELEASE.md).

## Release-Status

Der aktuelle RC ist nur für technische Engineering-Abnahme vorgesehen, nicht für einen Nutzerpilot mit echten Daten. PDF bleibt nach adversarialem Security-Review bis zu einem belastbaren Page-/Font-/Visual-Coverage-Nachweis vollständig gesperrt. Auf Windows x64 starten Dokumentparser und PowerShell-Brücken ausschließlich über den gebündelten nativen Job-Object-Launcher. Auf macOS/Linux benötigt der vertrauenswürdige TXT-/Markdown-/CSV-/DOCX-Parser Node 22.13+; eine installationsfreie Auflösung ist für den Plugin-ZIP noch nicht nachgewiesen. Bild/OCR und freie Textredaktionen bleiben dort fail-closed; die begrenzte lokale Zertifikatsentscheidung ist noch nicht auf Zielgeräten abgenommen. SHA-256 und PE-x64-Prüfung belegen Paketkonsistenz, nicht Herstellerherkunft oder Manipulationsschutz. Noch offen sind Windows ARM64, eine stärkere OS-Sandbox, frische Installation/Upgrade/Rollback sowie menschliche Windows-, macOS- und Linux-Usability-Abnahmen. Bis dahin bleiben klinische Echtdaten und ein Nutzerpilot gesperrt.

Die reale Windows-OCR-Abnahme gegen ein synthetisch gerendertes Scan-Bild ist am 21.08.2026 bestanden. Offen bleibt die EMF/WMF-Rasterisierung über die PowerShell-Bridge. Meldet `privacy_status` `visual_bridge: unavailable`, arbeitet der Textpfad weiter und alle Grafiken werden zurückgehalten — das ist der beabsichtigte degradierte Modus. Checkliste: [docs/RELEASE.md](docs/RELEASE.md).
