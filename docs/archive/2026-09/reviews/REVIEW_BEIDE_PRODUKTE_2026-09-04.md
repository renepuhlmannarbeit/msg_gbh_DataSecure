# Gesamtprüfung DataSecure – Cowork-Plugin und Standalone

Stand: 04.09.2026 · Produktstand 3.2.0-rc99

## Urteil

Der gemeinsame lokale Anonymisierungskern und die beiden Produkthüllen sind
technisch konsistent. Die vollständige Produktsuite, der reproduzierbare
Plugin-Build und das isolierte Windows-Standalone-Paket sind grün. Der Stand ist
ein belastbarer Release Candidate, aber noch keine allgemeine Produktfreigabe:
reale Cowork- und Zielhostabnahmen sowie die unten genannten P1-Lieferungen
bleiben erforderlich.

## Geprüfte Dimensionen

| Dimension | Cowork-Plugin | Standalone | Ergebnis |
|---|---|---|---|
| Produkt und Anwenderfluss | nach einmaliger Ergebnisordnerwahl genau eine Quellauswahl je Stapel, automatische Verarbeitung, höchstens ein Sammelreview, danach eine Abschlussaktion | Auswahl, eine Startbestätigung, passiver Status, Sammelreview, Ergebnis-/Zuordnungsaktion | E0 konsistent; beobachtete E2-Nutzerläufe offen |
| Datenschutzgrenze | Originale nur über lokalen Plugin-MCP; Cloud-Cowork erhält keine Originale | keine Claude-, Cowork-, Skill- oder MCP-Abhängigkeit | klar getrennt und fail-closed |
| Anonymisierung | TXT, Markdown, CSV und DOCX nutzen denselben geprüften Kern | derselbe Kern und dieselben aktuell freigegebenen Formate | 2.000er-Korpus sowie PII-, Format- und Vertragsregression grün |
| Review und Export | klare Dateien intern fertig; sichtbarer Mischstapel erst nach Gesamtabschluss | dieselbe DS-079-Regel; exakter aktueller Lauf statt globalem Outputstamm | Claim, Zielidentität und Negativtests grün |
| Robustheit | Abbruch, Wiederaufnahme, Journal, Mapping, Worker und Parser fail-closed | eigener Datenroot, eigener Produktkanal, Sidecar-Neustart und leichter Status | E0 grün; echte Crash-/Host-UATs offen |
| Performance | nicht blockierender Start, begrenzte Worker und gepufferte Übergabe | leichte Statusabfrage statt globaler Historienabfrage | synthetische Gates grün; 100-Dateien-Zielhostmessung offen |
| Distribution | selbsttragendes Windows-x64-ZIP; Marketplace-Projektion vorhanden | selbsttragendes Windows-x64-Engineering-ZIP | macOS-Intel-/ARM-Pakete und Fresh-Install-Evidenz offen |
| Dokumentation | Hostmatrix auf Cowork-Plugin begrenzt; Cloudgrenze nach DS-078 | eigener Architektur-, Sicherheits- und UAT-Vertrag | maschinenlesbarer Dokumentindex und Driftgate grün |

## In diesem Konsolidierungslauf geschlossen

- Prozessweiter Claim serialisiert Terminalexport und Wiederanlauf.
- Gewählter Ergebnisstamm und `DataSecure-Output` sind identitätsgebunden; ein
  Austausch während des Laufs stoppt den Export.
- „Ergebnisse öffnen“ wählt nur den exakten, vollständig sichtbaren jüngsten
  Lauf des jeweiligen Produkts.
- Mischstapel bleiben gemäß DS-079 bis zum Gesamtabschluss und erforderlichen
  Review in der Produktoberfläche unsichtbar; intern fertige Arbeit bleibt für
  Wiederaufnahme erhalten.
- DS-080 bindet beide Produkte an eine ausdrückliche geräte- und produktlokale
  Ergebnisordnerwahl. Cowork-Projekte werden weder erraten noch lösen sie einen
  stillen Zielwechsel oder eine neue Bestätigungsfrage aus.
- Standalone-Status liest nur Startup-, Aktivitäts-, Recovery- und jüngsten
  Produktzustand statt vollständiger Historien- und Paketbestände.
- Der Versionssynchronisierer kann den UML-Kopf nicht mehr über die Zeilengrenze
  beschädigen.
- Hostmatrix, Zielvertrag und Dokumentkanon trennen Cowork-Plugin, gemeinsamen
  Kern und Standalone maschinenlesbar.
- Der Organisations-Marketplace verwendet nur noch die offiziell unterstützte
  selbsttragende relative Git-Quelle; die frühere `archive`-Projektion und ihr
  Buildskript wurden entfernt.
- Der MCPB-Engineering-Manifestgenerator liest Werkzeug- und Prompttabellen
  wieder aus der kanonischen `mcp-server.js`; ein Regressionstest verhindert
  erneuten Drift zur reinen Bootstrapdatei. Veraltete Cowork-Arbeitsordnertexte
  und das obsolete `marketplace.release.json` werden nicht mehr ausgeliefert.
- Die Cowork-Dokumentation behauptet keine technisch unsichtbare
  Quell-/Ergebnisordnertrennung mehr: Nur der dedizierte Ergebnisordner wird mit
  Cowork verbunden; die Einhaltung ist eine ausdrückliche Setup-/UAT-Prüfung.
- Standalone prüft die 500-MiB-Gesamtgrenze auch im nativen Admission-Pfad,
  verbraucht eine Auswahl nach unsicherem Worker-ACK genau einmal und öffnet trotz
  eines neueren aktiven Stapels weiterhin den jüngsten vollständig sichtbaren Lauf.
- Rust-Hülle und Node-Sidecar verwenden dieselben UTF-8-Pfadbudgets; nicht
  darstellbare POSIX-Pfade stoppen fail-closed. Die breite Tauri-Standardberechtigung
  wurde zugunsten der expliziten DataSecure-Kommandos entfernt.
- Ein gemeinsamer Lock-Freigabevertrag verhindert, dass Verarbeitung,
  Fortsetzung, Review, Lieferung, Verwerfen oder Recovery trotz fehlgeschlagener
  Lock-Freigabe Erfolg melden. Ein vorhandener Primärfehler wird dabei nicht
  verdeckt.
- Der reale verzögerte Processing-Lock-Test verwendet wieder den aktuellen
  Byte-Snapshot-Vertrag und stoppt hart, wenn die Publikationsbarriere nicht
  erreicht wird. Export-Replay führt nach einem Fehler weiterhin alle offenen
  Ergebnisse als ausstehend.
- Standalone-Fortsetzung verlangt nun den passenden Startmarker und eine
  Worker-Bestätigung. CLI und Oberfläche unterscheiden gestoppte Stapel,
  ausstehenden Export und vollständig beendete Stapel ohne Ergebnis.
- Alle vier MCP-Prompts geben den einmaligen Cloud-Sync-Hinweis konsistent aus.
  Aktive Nutzertexte unterscheiden den dedizierten lokalen Ergebnisordner von
  einem optional für Cowork verbundenen Ergebnisordner; Originale bleiben
  außerhalb der Cowork-Freigabe.
- Zertifikatsfreie macOS-Pilotpakete verwenden eine explizite Tauri-Ad-hoc-
  Signatur. Developer-ID und Notarisierung bleiben optional; die reale Abnahme
  auf Intel- und ARM-Macs bleibt verpflichtend offen.
- Terminalexport und Startup-Replay melden keinen Erfolg, solange ihr
  identitätsgebundener Export-Claim nicht sicher freigegeben wurde; persistente
  Windows-`EPERM`-Fehler bleiben ausstehend und wiederanlauffähig.
- Die Standalone-Statusprojektion ermittelt Recovery-Zähler und jüngsten Lauf
  in einem gemeinsamen Scan. Ein Skalierungstest bindet 1.000 Journale an genau
  eine Enumeration und höchstens einen Read je Journal und Poll.
- Nichtterminale Mischstapel zeigen weder Ergebnis- noch Zuordnungsaktion. Der
  Reviewvertrag unterscheidet nun ausdrücklich intern fertige Positionen und
  den erst nach Gesamtabschluss sichtbaren Lauf.
- Der reale Intake-Worker-Nachweis wartet auf den bestätigten Notice-Dispatch
  und Worker-Exit innerhalb des Presenter-Zeitbudgets und räumt Testkinder auch
  nach einem Fehler geordnet auf; der wiederholte Stresslauf ist stabil.
- Bereits präsentierte historische Abschlussmarker bleiben auch mit alten
  Reservierungsfeldern endgültig präsentiert und können keinen zweiten
  Abschlussversuch reservieren.

## Verbleibende technische Lieferungen

| Priorität | Kanonische Story | Rest |
|---|---|---|
| P1 | BL-041.10, BL-012.2 | Standalone-Renderer-Paint ist E0 an eine einmalige inhaltsfreie Darstellungsgeneration gebunden und Windows-`Shown` nativ bestätigt; gleichwertigen macOS-Sichtbarkeitsnachweis und genau einen Fallback auf echten Zielhosts belegen. |
| P1 | BL-012.9, BL-012.10 | Gemeinsames Sammelreview auf macOS/Linux produktiv statt einzelner Engineering-Dialoge belegen. |
| P1 | BL-010.9, BL-010.23 | Vollständige neutrale Core-API und maschinenlesbaren Core-/Policy-Fingerprint zwischen beiden Produkten schließen. |
| erledigt | BL-011.8, BL-043 | Worker-Empfang und dauerhafter erster Stapelcheckpoint sind semantisch getrennt, ohne den Cowork-Aufruf auf die Dateikopie warten zu lassen. |
| erledigt | BL-011.11 | Executor-Leases sind an PID und Betriebssystem-Startidentität gebunden; PID-Wiederverwendung und unbekannte Identität sind fail-closed getestet. |
| erledigt | BL-012.6, BL-042.3 | Standalone zeigt inhaltsfreie passive Vorbereitung und monotone Fortschrittszähler; Zielhost-UX bleibt E2. |
| P3 | BL-041.1 | Sprachliche Zustandslogik weiter aus dem Skill in die Serverantwort verlagern. |

Diese Punkte sind keine Rechtfertigung für zusätzliche Anwenderdialoge. Sie
werden im bestehenden einfachen Ablauf oder als rein technische Absicherung
gelöst.

## Herstellerabgleich

Die am 04.09.2026 erneut geprüfte Anthropic-Architekturdokumentation beschreibt
Cloud-Cowork als Standard und lokale Sitzungen für bestehende Desktop-
Deployments. Plugin-bündelte lokale MCP-Server laufen im lokalen Agent-Loop,
nicht in Cloud-Sitzungen. Auch eine über die Desktop-App vermittelte lokale Datei
wird in einer Cloud-Sitzung auf Anthropic-Infrastruktur verarbeitet. Deshalb
bleibt die Originalannahme des Plugins auf die positive lokale Hostmatrix
beschränkt; Standalone verarbeitet Originale unabhängig von Claude vollständig
lokal.

Für GitHub-synchronisierte Organisations-Marketplaces nennt Anthropic relative
Pluginordner als einfachsten unterstützten Weg und schließt `archive`, `npm` und
`command` ausdrücklich aus. Die Releaseprojektion wurde daran angepasst.

Quellen:

- <https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview>
- <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>
- <https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization>

## Ausgeführte Evidenz

- Vollständige Produktsuite: `36` Basistests plus `110` direkte Testdateien grün,
  einschließlich 2.000 explorativer Anonymisierungsfälle, 150 Vertragslayouts,
  PII-, Format-, Recovery-, Export-, Skill- und Dokumentationsregression.
- Cowork-/Kanon-Nachlauf nach DS-080: Skillmatrix, 150 Vertragsfälle,
  Dokumentindex, Zielvertrag, Hostmatrix, Manifest und Result-Export grün.
- Standalone: 33 Node-Produktverträge, 16 Recoveryfälle und vier Rust-
  Frame-/Grenztests grün; isolierter Sidecar-Smoke aus dem fertigen ZIP grün.
- Intake-Worker: wiederholter 10/10-Stresslauf nach dem Timingfix grün; der
  abschließende 20/20-Nachlauf und `test:fast-path` bestätigen die Testhygiene.
- Plugin-ZIP Windows x64:
  `DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc99.zip`, SHA-256
  `a074e6498cff04ce035320e7b6276a67ab0ea57332d718f62e5aa93c39aef4ad`.
- Standalone-ZIP Windows x64:
  `DataSecure-Standalone-3.2.0-rc99-windows-x64.zip`, SHA-256
  `b45d0eeded8afa2a477f74ee5eb6a3a50548108eab96de7f0c2a7b173e331d35`.

Diese E0-Evidenz ersetzt weder Fresh-Install- noch Bediennachweise auf den
freizugebenden Zielhosts.

## Releasegrenze

E0 ist grün. Ein Rollout-GO erfordert weiterhin die im Backlog ausgewiesene
E1-/E2-Evidenz auf den tatsächlich freizugebenden Windows- und macOS-Zielhosts.
XLSX, PPTX, PDF, Scan-PDF und Bilder bleiben bis zu ihrer eigenen Coverage- und
Zielhostevidenz gesperrt.
